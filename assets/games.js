import {illustrate} from './learning-art.js?v=2';
import { bindJourney, shuffle } from './game-progress.js?v=16';
import {renderExtra,stopSpeech} from './game-extra.js?v=23';

const board = document.querySelector('[data-game]');
const game = JSON.parse(document.getElementById('game-data').textContent);
const { id, lang, messages } = game;
const countGame = id === 'counting';
const abcGame = id === 'english-abc';
const progress = board.querySelector('[data-progress]');
const prompt = board.querySelector('[data-prompt]');
const cue = board.querySelector('[data-cue]');
const options = board.querySelector('[data-options]');
const feedback = board.querySelector('[data-feedback]');
const next = board.querySelector('[data-next]');
let solved = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function makeOption(choice, correct, explanation) {
  const button = element('button', '', 'game-option');
  button.type = 'button';
  if (Array.isArray(choice)) {
    const [symbol, ar, en] = choice;
    const picture = illustrate(element('span', symbol, 'game-picture'),symbol);
    picture.setAttribute('aria-hidden', 'true');
    const label = element('span', abcGame ? en : ar);
    label.lang = abcGame ? 'en' : 'ar';
    button.append(picture, label);
    if (!abcGame && lang === 'en') button.append(element('small', en, 'option-gloss'));
  } else {
    const value=String(choice);
    const emojiOnly=typeof choice==='string' && (/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+$/u.test(value.trim())||value.startsWith('art:'));
    if(emojiOnly){
      const picture=illustrate(element('span',value,'game-picture game-picture-standalone'),value);
      picture.setAttribute('aria-hidden','true');
      button.classList.add('game-picture-choice');
      button.setAttribute('aria-label',value==='art:pomegranate'?(lang==='ar'?'رمان':'Pomegranate'):value==='art:gold'?(lang==='ar'?'ذهب':'Gold'):value);button.append(picture);
    }else{
      button.textContent=value;
      if(!countGame)button.lang=abcGame?'en':lang;
    }
  }
  button.addEventListener('click', (event) => {
    if (solved || button.dataset.state === 'wrong') return;
    const state = correct ? 'correct' : 'wrong';
    button.dataset.state = state;
    button.setAttribute('aria-disabled', 'true');
    feedback.dataset.state = state;
    feedback.textContent = correct ? messages.correct : messages.retry;
    if (correct && explanation) feedback.append(' ', explanation);
    if (!correct) {
      journey.mistake();
      return;
    }
    solved = true;
    journey.solve();
    for (const option of options.children) {
      option.setAttribute('aria-disabled', 'true');
      option.tabIndex = -1;
    }
    next.hidden = false;
    if (event.detail === 0) next.focus();
  });
  return button;
}

function objectGroup(count, symbol, first, removed = 0, onChange=()=>{}) {
  const group = element('ul', '', 'game-count');
  for (let i = 0; i < count; i++) {
    const item = document.createElement('li');
    const token = illustrate(element('button', symbol, 'count-token'),symbol);
    token.type = 'button';
    token.setAttribute('aria-label', `${messages.object} ${first + i}`);
    token.setAttribute('aria-pressed', 'false');
    if(i>=count-removed){token.dataset.removed='true';token.setAttribute('aria-label',`${messages.object} ${first+i} · ${lang==='ar'?'محذوف':'removed'}`);token.disabled=true;}
    token.addEventListener('click', () => {if(solved)return;token.setAttribute('aria-pressed',String(token.getAttribute('aria-pressed') === 'false'));onChange();});
    item.append(token);
    group.append(item);
  }
  return group;
}

function renderCount([number, symbol, choices, answer, math]) {
  cue.classList.add('game-cue-count','count-lab');
  if (math) {
    prompt.textContent = messages.math;
    const expression = element('span', math.expression, 'math-expression');
    expression.dir = 'ltr';
    cue.append(expression);
  }
  const groups = math?.groups ?? Array.from({length: Math.ceil(number / 5)}, (_, index) =>
    Math.min(5, number - index * 5));
  if (groups.length) {
    const visual = element('div', '', 'count-groups');
    visual.dir = 'ltr';
    const counter=element('strong','','count-lab-value'),readout=element('div','','count-lab-readout');
    counter.setAttribute('aria-live','polite');readout.append(element('span',lang==='ar'?'عدد ما لمسته':'Objects tapped'),counter);
    function refresh(){let n=0;for(const token of visual.querySelectorAll('.count-token')){if(token.getAttribute('aria-pressed')==='true'){token.dataset.counted=String(++n)}else delete token.dataset.counted;}counter.textContent=String(n);}
    const reset=element('button',lang==='ar'?'ابدأ العد من جديد':'Count again','button button-white count-reset');reset.type='button';reset.addEventListener('click',()=>{if(solved)return;for(const t of visual.querySelectorAll('.count-token'))t.setAttribute('aria-pressed','false');refresh()});readout.append(reset);
    let first = 1;
    for (const size of groups) {
      visual.append(objectGroup(size, symbol, first, math?.removed ?? 0,refresh));
      first += size;
    }
    cue.append(readout,visual, element('small', messages.objects, 'count-instruction'));refresh();
  }
  return {choices, answer};
}

function renderLetters([letter, choices, answer, mode]) {
  const content = element('span', Array.isArray(letter) ? letter[1] : letter);
  content.lang = abcGame ? 'en' : 'ar';
  if (mode === 'initial') {
    prompt.textContent = messages.initial;
    const picture = illustrate(element('span', letter[0], 'game-clue-picture'),letter[0]);
    picture.setAttribute('aria-hidden', 'true');
    content.prepend(picture, ' ');
  }
  if (messages.positions?.[mode]) {
    prompt.textContent = messages.positions[mode];
    const clusters = letter.match(/\P{Mark}\p{Mark}*/gu);
    const target = choices[answer];
    content.replaceChildren(...clusters.map((cluster) => cluster.startsWith(target)
      ? element('span', cluster, 'game-target-letter') : cluster));
  }
  if (mode === 'lowercase') prompt.textContent = messages.lowercase;
  cue.append(content);
  return {choices, answer};
}

function renderRound(round) {
  progress.textContent = journey.roundLabel();
  prompt.textContent = game.prompt;
  cue.replaceChildren();
  feedback.textContent = '';
  delete feedback.dataset.state;
  solved = false;
  next.hidden = true;
  next.disabled = false;
  next.textContent = journey.nextLabel();
  options.replaceChildren();
  stopSpeech();
  cue.classList.remove('game-cue-count','count-lab');
  if (!Array.isArray(round)) {
    prompt.textContent=round.prompt;
    renderExtra(round,{cue,options,feedback,next,journey,makeOption});
    return;
  }
  const {choices, answer} = countGame ? renderCount(round) : renderLetters(round);
  options.dataset.columns = choices.length;
  options.replaceChildren(...shuffle(choices.map((choice, i) => makeOption(choice, i === answer))));
}

const journey = bindJourney(game, board, renderRound);
next.addEventListener('click', journey.advance);
board.querySelector('[data-level-menu]').addEventListener('click',stopSpeech);
window.addEventListener('pagehide',stopSpeech);
