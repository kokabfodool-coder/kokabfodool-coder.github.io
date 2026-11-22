import {watchInstructionAudio} from './game-audio.js?v=7';
import {driveAudioSource,repairedPartialClips} from './vowel-audio-routing.js?v=3';
import {pronunciation} from './arabic-pronunciation.js?v=1';
import {bindJourney, shuffle,totalStars} from './game-progress.js?v=16';

const data = JSON.parse(document.querySelector('#drive-data').textContent);
const board = document.querySelector('[data-drive]');
const scene = board.querySelector('[data-drive-scene]');
const gates = board.querySelector('[data-drive-gates]');
const road = scene.querySelector('.drive-road');
const launch = board.querySelector('[data-drive-launch]');
const feedback = board.querySelector('[data-drive-feedback]');
const listen = board.querySelector('[data-drive-listen]');
const listenLabel = listen.querySelector('[data-drive-listen-label]');
const next = board.querySelector('[data-drive-next]');
const counter = board.querySelector('[data-drive-round]');
const adult = board.querySelector('[data-drive-adult]');
const adultCue = adult.querySelector('b');
const drivePrompt=board.querySelector("[data-drive-prompt]");
const ar = document.documentElement.lang === 'ar';
const tr = (arabic, english) => ar ? arabic : english;
const vowels = [
  ['َ', 'فتحة', 'Fatḥa'],
  ['ِ', 'كسرة', 'Kasra'],
  ['ُ', 'ضمة', 'Ḍamma'],
  ['ْ', 'سكون', 'Sukūn'],
];

let target;
let answered = false;
let selectedLane = 1;
let steeringPointer = null;
const audio = new Audio();
audio.preload = 'none';
watchInstructionAudio(audio);
let playback = 0;
let driveTimer;
const routeMeter=document.createElement('div');routeMeter.className='drive-route-meter';routeMeter.setAttribute('aria-label',tr('تقدم الرحلة','Journey progress'));scene.before(routeMeter);
function drawRoute(done=false){const nums=journey.roundLabel().match(/\d+/g)?.map(Number);if(!nums||nums.length<3)return;const current=nums[1],total=nums[2];const label=document.createElement('span');label.className='drive-route-label';label.textContent=tr('محطة ','Stop ')+current+' / '+total;const track=document.createElement('progress');track.max=total;track.value=current-1+Number(done);track.setAttribute('aria-label',tr('محطات مكتملة','Completed stops'));routeMeter.replaceChildren(label,track);}

function syllable(letter, vowel) {
  const base = letter === 'أ' && vowel === 1 ? 'إ' : letter;
  return base + vowels[vowel][0];
}

function stopAudio() {
  playback++;
  audio.pause();
  audio.currentTime=0;
}

function isApproved(round){return round.vowel!==3&&!!driveAudioSource(round.audio)}
function showVisual(round){
  const base=round.letter==='أ'&&round.vowel===1?'إ':round.letter;
  const parts=round.example.match(/[^\p{Mark}]\p{Mark}*|\p{Mark}+/gu)||[round.example];
  const position=parts.findIndex(part=>part.startsWith(base)&&part.includes(vowels[round.vowel][0]));
  drivePrompt.textContent=round.mode==='missing'?tr('اختر الحركة الناقصة: ','Choose the missing vowel: '):tr('اختر حركة الحرف المحدد: ','Choose the marked letter’s vowel: ');
  const word=document.createElement('span');word.lang='ar';word.dir='rtl';
  parts.forEach((part,i)=>{if(i!==position){word.append(document.createTextNode(part));return}const marked=document.createElement('mark');marked.textContent=round.mode==='missing'?part.replace(vowels[round.vowel][0],''):part;word.append(marked)});
  drivePrompt.append(word);
}
async function hear(){
  if(!target||answered||board.hidden||!isApproved(target))return;
  const request=++playback;
  listenLabel.textContent=tr('جارٍ التحميل…','Loading…');
  const source=driveAudioSource(target.audio);
  if(audio.getAttribute('src')!==source)audio.src=source;
  audio.currentTime=0;
  try{await audio.play();if(request!==playback)return;listenLabel.textContent=tr('أعد الاستماع','Listen again');adult.open=false;}
  catch{if(request!==playback)return;listen.disabled=true;listenLabel.textContent=tr('الصوت غير متاح — تدريب بصري','Audio unavailable — visual practice');showVisual(target);adult.open=true;}
}

function selectLane(lane) {
  selectedLane = lane;
  scene.dataset.lane = String(lane);
  Array.from(gates.children).forEach((gate, index) => {
    gate.toggleAttribute('data-selected', index === lane);
  });
  const letter = gates.children[lane].querySelector('.drive-gate-letter').textContent;
  launch.setAttribute('aria-label', tr('انطلق نحو ' + letter, 'Drive to ' + letter));
}

function followPointer(event) {
  const bounds = scene.getBoundingClientRect();
  const position = (event.clientX - bounds.left) / bounds.width;
  const percent = Math.max(21, Math.min(79, position * 100));
  scene.style.setProperty('--drive-steering-x', percent + '%');
  const lane = Math.max(0, Math.min(2, Math.floor(position * 3)));
  if (lane !== selectedLane) selectLane(lane);
}

function stopSteering() {
  const pointer = steeringPointer;
  steeringPointer = null;
  if (pointer !== null && road.hasPointerCapture(pointer)) road.releasePointerCapture(pointer);
  delete scene.dataset.steering;
  scene.style.removeProperty('--drive-steering-x');
}

road.addEventListener('pointerdown', event => {
  if (answered || steeringPointer !== null || event.button !== 0) return;
  steeringPointer = event.pointerId;
  road.setPointerCapture(event.pointerId);
  scene.dataset.steering = '';
  followPointer(event);
});
road.addEventListener('pointermove', event => {
  if (event.pointerId === steeringPointer) followPointer(event);
});
road.addEventListener('pointerup', event => {
  if (event.pointerId !== steeringPointer) return;
  followPointer(event);
  stopSteering();
});
for (const type of ['pointercancel', 'lostpointercapture']) {
  road.addEventListener(type, event => {
    if (event.pointerId === steeringPointer) stopSteering();
  });
}

launch.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const step = event.key === 'ArrowLeft' ? -1 : 1;
  selectLane(Math.max(0, Math.min(2, selectedLane + step)));
});
launch.addEventListener('click', () => {
  const gate = gates.children[selectedLane];
  choose(gate, selectedLane, Number(gate.dataset.vowel));
  if (answered) next.focus({preventScroll: true});
});

function choose(button, lane, vowel) {
  if (answered) return;
  stopSteering();
  selectLane(lane);
  gates.querySelectorAll('[data-result]').forEach((gate) => delete gate.dataset.result);

  window.clearTimeout(driveTimer);
  delete scene.dataset.driveState;
  if (vowel !== target.vowel) {
    button.dataset.result = 'wrong';
    scene.dataset.driveState = 'blocked';
    driveTimer = window.setTimeout(() => { delete scene.dataset.driveState; }, 280);
    feedback.textContent = isApproved(target)?tr('جرّب بابًا آخر. يمكنك سماع الحرف مرة ثانية.', 'Try another gate. You can listen again.'):tr('جرّب بابًا آخر. انظر إلى حركة الحرف الملوّن.', 'Try another gate. Look at the highlighted letter.');
    feedback.dataset.state='wrong';
    journey.mistake();
    return;
  }

  answered = true;
  feedback.dataset.state='correct';
  stopAudio();
  button.dataset.result = 'correct';
  for (const gate of gates.children) gate.setAttribute('aria-disabled', 'true');
  launch.disabled = true;
  listen.disabled = true;
  adult.open = false;
  adult.hidden = true;
  const word = document.createElement('b');
  word.className = 'drive-example';
  word.lang = 'ar';
  word.dir = 'rtl';
  word.textContent = target.example;
  const sound = document.createElement('b');
  sound.lang = 'ar';
  sound.dir = 'rtl';
  sound.textContent = syllable(target.letter, target.vowel);
  feedback.replaceChildren(tr('أحسنت! ', 'Well done! '), sound, tr(' مثل ', ' as in '), word);
  next.textContent = journey.nextLabel();
  next.hidden = false;
  const track = scene.getBoundingClientRect();
  const gate = button.getBoundingClientRect();
  scene.style.setProperty('--gate-x', (gate.left + gate.width / 2 - track.left) / track.width * 100 + '%');
  scene.style.setProperty('--gate-y', (gate.top + gate.height * .72 - track.top) / track.height * 100 + '%');
  scene.dataset.driveState = 'pass';
  drawRoute(true);
  journey.solve();
  journey.effect('drive');
}

function renderRound(round) {
  stopAudio();
  stopSteering();
  window.clearTimeout(driveTimer);
  target = round;
  answered = false;
  delete scene.dataset.driveState;
  counter.textContent = journey.roundLabel();
  drawRoute();
  delete feedback.dataset.state;
  listen.disabled = !isApproved(round);
  listenLabel.textContent=isApproved(round)?(repairedPartialClips.has(round.audio)?tr('اسمع الحرف وحركته واقرأ المثال','Listen to the sound and read the example'):tr('اسمع الحرف وحركته','Listen to the letter and vowel')):round.vowel===3?tr('تحدٍّ بصري: السكون','Visual challenge: sukūn'):tr('تدريب بصري — التسجيل يحتاج تصحيحًا','Visual practice — recording needs correction');
  adult.open = false;
  adult.hidden = false;
  adultCue.textContent=pronunciation(round.letter,round.vowel,round.example);
  next.hidden = true;
  feedback.textContent = '';
  drivePrompt.textContent=tr('اسمع واختر الباب','Listen and choose the gate');
  if(!isApproved(round)||repairedPartialClips.has(round.audio)||(round.mode&&round.mode!=='audio'))showVisual(round);
  gates.replaceChildren(...shuffle(round.vowel===3?[0,1,3]:[0, 1, 2]).map((vowel, lane) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'drive-gate';
    button.dataset.vowel = vowel;
    const letter = document.createElement('span');
    letter.className = 'drive-gate-letter';
    letter.lang = 'ar';
    letter.dir = 'rtl';
    letter.textContent = syllable(round.letter, vowel);
    const label = document.createElement('span');
    label.className = 'drive-gate-label';
    label.textContent = vowels[vowel][ar ? 1 : 2];
    button.append(letter, label);
    button.addEventListener('click', () => choose(button, lane, vowel));
    return button;
  }));
  selectLane(1);
  launch.disabled = false;
}

const journey = bindJourney(data, board, renderRound);
listen.addEventListener('click', hear);
next.addEventListener('click', () => journey.advance());
function leaveTrack() {
  stopSteering();
  stopAudio();
  window.clearTimeout(driveTimer);
}
board.querySelector('[data-level-menu]').addEventListener('click', leaveTrack);
window.addEventListener('pagehide', leaveTrack);

const garage=document.querySelector('[data-drive-garage]');
const styles=[['classic',0,'السيارة الحمراء','Red car'],['blue',20,'السيارة الزرقاء','Blue car'],['mint',40,'السيارة الخضراء','Green car'],['gold',75,'السيارة الذهبية','Gold car'],['space',150,'سيارة الفضاء','Space car']];
function stars(){return totalStars();}
function garageRender(){if(!garage)return;let skin='classic';try{skin=localStorage.getItem('fudool-drive-skin')??'classic';}catch{}const total=stars();if(!styles.some(([id,n])=>id===skin&&total>=n))skin='classic';scene.dataset.skin=skin;garage.replaceChildren(...styles.map(([id,n,a,e])=>{const b=document.createElement('button');b.type='button';b.className='button button-white';b.textContent=(total>=n?'🚗 ':'🔒 ')+tr(a,e)+(n?' · '+n+' ⭐':'');b.disabled=total<n;b.setAttribute('aria-pressed',String(id===skin));b.addEventListener('click',()=>{try{localStorage.setItem('fudool-drive-skin',id);}catch{}scene.dataset.skin=id;garageRender();});return b;}));}
garageRender();window.addEventListener('pageshow',garageRender);document.querySelectorAll('[data-level-menu]').forEach(b=>b.addEventListener('click',garageRender));
