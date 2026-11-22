import {audioPreferences, listenToAudioPreferences} from './audio-settings.js?v=1';
import {setInstructionPlaying, watchInstructionAudio} from './game-audio.js?v=7';
import {sharedAudioSource} from './vowel-audio-routing.js?v=3';

let voiceToken = 0;
let toneContext;
let voiceGain;
let nativeSpeech = false;
let recording;
let spoken;
const orderClips = new Map();
const playingOrder = {};
const activeTones = new Set();

export function stopSpeech() {
  voiceToken++;
  if (nativeSpeech) window.FudoolDevice?.stopVoice();
  nativeSpeech = false;
  setInstructionPlaying(playingOrder, false);
  if (recording) {
    setInstructionPlaying(recording, false);
    recording.pause();
  }
  if (spoken) {
    setInstructionPlaying(spoken, false);
    spoken = undefined;
    window.speechSynthesis.cancel();
  }
  for (const tone of activeTones) {
    try { tone.stop(); } catch {}
  }
  activeTones.clear();
}

export async function playRecording(src, fallback, {rate = 1} = {}) {
  stopSpeech();
  const source = sharedAudioSource(src);
  if (!source) { fallback?.(); return false; }
  const token = voiceToken;
  if (!recording) {
    recording = new Audio();
    watchInstructionAudio(recording);
  }
  if (recording.getAttribute('src') !== source) recording.src = source;
  recording.currentTime = 0;
  recording.playbackRate = rate;
  try {
    await recording.play();
    return token === voiceToken;
  } catch {
    if (token === voiceToken) fallback?.();
    return false;
  }
}

export function speak(text, lang = 'ar', fallback, {rate = .85, localOnly = false} = {}) {
  stopSpeech();
  const token = voiceToken;
  const volume = audioPreferences().voice / 100;
  if (!volume) return true;
  if (localOnly && window.FudoolDevice?.say) {
    window.FudoolDevice.say(text, lang, volume);
    nativeSpeech = true;
    return true;
  }
  if (!('speechSynthesis' in window)) { fallback?.(); return false; }
  const language = lang.split('-')[0].toLowerCase();
  const voices = speechSynthesis.getVoices().filter(voice => !localOnly || voice.localService);
  const voice = voices.find(v => v.lang.toLowerCase() === lang.toLowerCase()) ??
    voices.find(v => v.lang.toLowerCase().startsWith(language));
  if (!voice) { fallback?.(); return false; }
  const utterance = new SpeechSynthesisUtterance(text);
  spoken = utterance;
  utterance.lang = voice.lang;
  utterance.voice = voice;
  utterance.rate = rate;
  utterance.volume = volume;
  utterance.onstart = () => {
    if (token === voiceToken) setInstructionPlaying(utterance, true);
  };
  utterance.onend = utterance.onerror = event => {
    setInstructionPlaying(utterance, false);
    if (token !== voiceToken) return;
    spoken = undefined;
    if (event.type === 'error') fallback?.();
  };
  speechSynthesis.speak(utterance);
  return true;
}

function prepareToneOutput(Audio) {
  if (toneContext) return;
  toneContext = new Audio();
  voiceGain = toneContext.createGain();
  voiceGain.connect(toneContext.destination);
  const applyVolume = () => {
    voiceGain.gain.value = audioPreferences().voice / 100;
  };
  applyVolume();
  listenToAudioPreferences(applyVolume);
}

export async function tones(count) {
  try {
    stopSpeech();
    const token = voiceToken;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    prepareToneOutput(Audio);
    await toneContext.resume();
    if (token !== voiceToken) return false;
    const start = toneContext.currentTime + .05;
    for (let i = 0; i < count; i++) {
      const tone = toneContext.createOscillator();
      const gain = toneContext.createGain();
      tone.frequency.value = 660;
      gain.gain.value = .07;
      tone.connect(gain).connect(voiceGain);
      tone.start(start + i * .36);
      tone.stop(start + i * .36 + .18);
      activeTones.add(tone);
      tone.onended = () => { activeTones.delete(tone); tone.disconnect(); gain.disconnect(); };
    }
    return true;
  } catch { return false; }
}

export function instructionButton(onPlay, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-white game-instruction';
  const icon = document.createElement('span');
  icon.textContent = '♪';
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon, ' ', label);
  button.addEventListener('click', onPlay);
  return button;
}

export function readInstruction(id, text, language, fallback) {
  const source = '/assets/game-instructions/' + id + '-' + language + '.mp3';
  return playRecording(source, () => speak(text, language, fallback));
}

export async function readOrder(items, language, fallback) {
  stopSpeech();
  const token = voiceToken;
  const onFailure = () => {
    if (token !== voiceToken) return;
    const prefix = language === 'ar' ? 'طلب الزبون: ' : 'Customer order: ';
    speak(prefix + items.join(language === 'ar' ? '، ' : ', '), language, fallback);
  };
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) { onFailure(); return; }
    prepareToneOutput(Audio);
    await toneContext.resume();
    if (!orderClips.has(language)) {
      const bank = fetch('/assets/game-instructions/order-' + language + '.mp3')
        .then(response => {
          if (!response.ok) throw Error('Order recording unavailable');
          return response.arrayBuffer();
        }).then(bytes => toneContext.decodeAudioData(bytes));
      const index = fetch('/assets/game-instructions/order-index.json')
        .then(response => {
          if (!response.ok) throw Error('Order index unavailable');
          return response.json();
        }).then(index => index[language]);
      const pending = Promise.all([bank, index]).catch(error => {
        orderClips.delete(language);
        throw error;
      });
      orderClips.set(language, pending);
    }
    const [bank, index] = await orderClips.get(language);
    if (token !== voiceToken) return;
    const parts = ['$order', ...items].map(name => index[name]);
    if (parts.some(part => !part)) { onFailure(); return; }
    let start = toneContext.currentTime + .035;
    setInstructionPlaying(playingOrder, true);
    parts.forEach(([offset, duration], i) => {
      const node = toneContext.createBufferSource();
      node.buffer = bank;
      node.connect(voiceGain);
      activeTones.add(node);
      node.onended = () => {
        node.disconnect();
        activeTones.delete(node);
        if (token === voiceToken && i === parts.length - 1) setInstructionPlaying(playingOrder, false);
      };
      node.start(start, offset, duration);
      start += duration;
    });
  } catch {
    onFailure();
  }
}
