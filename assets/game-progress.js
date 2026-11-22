import {activeProfile,prefix} from './profile-state.js?v=2';
import {setupWorld,updateMap,decorateLevel,renderTrailStage,celebrate,enhanceRewards} from './reward-worlds.js?v=3';
import {createIllustration} from './learning-art.js?v=2';
import {bindGameAudio} from './game-audio.js?v=7';
import {speak, stopSpeech} from './game-voice.js?v=2';
import {ageGroups,ageLabel,gameCounts,pathsForGame,recommendedAge,includesLevel,nextPathLevel} from './game-age-paths.js?v=6';

const language = document.documentElement.lang;
const tr = (ar, en) => language === 'ar' ? ar : en;
const profile=activeProfile();
const storageKey = prefix(profile.id);
function profileChanged(){if(activeProfile().id!==profile.id)location.reload()}
window.addEventListener('storage',profileChanged);window.addEventListener('pageshow',profileChanged);
const memory = new Map();
const starBadges = [
  [5, 'seedling', tr('بداية مشرقة', 'Bright start')],
  [20, 'rocket', tr('مستكشف الكوكب', 'Planet explorer')],
  [40, 'award', tr('صديق لُمعة', 'Lumaa’s friend')],
  [60, 'trophy', tr('بطل كوكب فضول', 'Kawkab Fudool champion')],
  [78, 'crown', tr('وسام التحدّي الكبير', 'Grand challenge badge')],
  [150,'rocket',tr('رائد الكوكب','Planet pioneer')],
  [225,'star',tr('نجم الكوكب','Planet star')],
  [300,'award',tr('مستكشف العوالم','World explorer')],
  [375,'crown',tr('ملك الكوكب','Planet champion')],
  [450,'rocket',tr('رائد النجوم','Star voyager')],
  [555,'trophy',tr('بطل جميع العوالم','All-world champion')],
  [675,'galaxy',tr('نجم المجرة','Galaxy star')],
  [825,'crown',tr('أسطورة كوكب فضول','Fudool legend')],
];

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

const legacy = profile.id==='default'?read('kokab-games-v2'):null;

function progress(id, levelCount) {
  const saved = memory.get(id) ?? read(storageKey + id);
  const scores = Array.from({length: levelCount}, (_, i) => {
    const valid = [saved?.scores?.[i], legacy?.[id]?.[i]]
      .filter((score) => Number.isInteger(score) && score >= 1 && score <= 3);
    return Math.max(0, ...valid);
  });
  return {
    scores, checkpoints: {...saved?.checkpoints},
    lastPlayed: saved?.lastPlayed, lastLevel: saved?.lastLevel,
    orders: {...saved?.orders}, agePath: saved?.agePath,
  };
}

function save(id, levelCount, update) {
  const old=memory.get(id)??read(storageKey+id);
  const effectiveCount=Math.max(levelCount,Array.isArray(old?.scores)?old.scores.length:0);
  const state = progress(id, effectiveCount);
  update(state);
  try {
    localStorage.setItem(storageKey + id, JSON.stringify(state));
    memory.delete(id);
  } catch {
    memory.set(id, state);
  }
}

const starCount = (scores) => scores.reduce((total, score) => total + score, 0);
export const totalStars = () => [...gameCounts].reduce((total, [id, count]) => total + starCount(progress(id, count).scores), 0);
const starText = (score) => tr(`${score} من 3 نجوم`, `${score} of 3 stars`);

function renderRewards(rewards) {
  const total = totalStars();
  const max = [...gameCounts.values()].reduce((sum, count) => sum + count, 0) * 3;
  rewards.querySelector('[data-total-stars]').textContent = tr(`${total} من ${max} نجمة`, `${total} of ${max} stars`);
  const badges = starBadges.map(([threshold, icon, title]) => {
    const item = document.createElement('li');
    item.dataset.earned = String(total >= threshold);
    const earned = total >= threshold;
    const badgeArt = createIllustration(earned ? icon : 'lock');
    badgeArt.classList.add('world-icon');
    const label = earned ? title + ' ✓' : title + ' · ' + tr(threshold + ' نجمة', threshold + ' stars');
    item.append(badgeArt, document.createTextNode(label));
    return item;
  });
  rewards.querySelector('[data-game-badges]').replaceChildren(...badges);
  document.querySelectorAll('[data-game-summary]').forEach((summary) => {
    const count = gameCounts.get(summary.dataset.gameSummary);
    const completed = progress(summary.dataset.gameSummary, count).scores.filter(Boolean).length;
    summary.textContent = tr(`${completed} من ${count} مستويات مكتملة`, `${completed} of ${count} levels complete`);
  });
  const album=rewards.querySelector('[data-character-album]');
  if(album){const heading=document.createElement('h3');heading.textContent=tr('ألبوم الشخصيات','Character album');const grid=document.createElement('div');grid.className='fudool-album-grid';for(const [threshold,image,a,e] of [[0,'brand.webp','كوكب فضول','Kawkab Fudool'],[20,'lumaa.webp','لُمعة','Lumaa'],[40,'robo.webp','روبو','Robo'],[75,'mishal.webp','مشعال','Mishal']]){const item=document.createElement('div');const img=document.createElement('img');img.src='/assets/'+image;img.alt='';img.className=total>=threshold?'':'album-locked';const label=document.createElement('span');label.textContent=total>=threshold?tr(a,e):tr(threshold+' نجمة',threshold+' stars');item.append(img,label);grid.append(item);}album.replaceChildren(heading,grid);}
  enhanceRewards(rewards,total,starBadges,max);
  rewards.hidden = false;
}

const rewards = document.querySelector('[data-game-rewards]');
const cert=document.querySelector('[data-certificate]');
if(cert)cert.addEventListener('click',()=>{const total=totalStars();const section=document.createElement('section');section.className='fudool-certificate';const h=document.createElement('h1');h.textContent=tr('شهادة إنجاز من كوكب فضول','Kawkab Fudool Achievement Certificate');const p=document.createElement('p');const name=activeProfile().name||tr('مستكشفنا الصغير','little explorer');p.textContent=tr(`أحسنت يا ${name}! جمعت ${total} نجمة.`,`Well done, ${name}! You earned ${total} stars.`);const img=document.createElement('img');img.src='/assets/lumaa.webp';img.alt='';section.append(img,h,p);document.body.append(section);const clean=()=>section.remove();window.addEventListener('afterprint',clean,{once:true});window.print();});
if (rewards) {
  renderRewards(rewards);
  window.addEventListener('pageshow', () => renderRewards(rewards));
  window.addEventListener('storage', () => renderRewards(rewards));
}

const resume = document.querySelector('[data-home-resume]');
if (resume) {
  const link = resume.querySelector('[data-resume-link]');
  const title = resume.querySelector('[data-resume-title]');
  const cards = [...document.querySelectorAll('#play .activity-card')];

  function renderResume() {
    const active = cards.map((card) => {
      const state = progress(card.dataset.gameId, Number(card.dataset.levelCount));
      const checkpoint = Object.values(state.checkpoints).some((entry) => Number.isInteger(entry?.round) && entry.round >= 0);
      const stars = starCount(state.scores);
      return {card, checkpoint, stars, lastPlayed: Number(state.lastPlayed) || 0};
    }).filter(({checkpoint, stars, lastPlayed}) => checkpoint || stars || lastPlayed)
      .sort((a, b) => b.lastPlayed - a.lastPlayed || Number(b.checkpoint) - Number(a.checkpoint) || b.stars - a.stars)[0];
    resume.hidden = !active;
    if (!active) return;
    const url = new URL(active.card.href);
    url.searchParams.set('continue', '1');
    link.href = url.href;
    title.textContent = active.card.querySelector('h3').textContent;
    link.setAttribute('aria-label', `${link.textContent.trim()} ${title.textContent}`);
  }

  renderResume();
  window.addEventListener('pageshow', renderResume);
  window.addEventListener('storage', renderResume);
}

export function shuffle(values) {
  const items = [...values];
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function bindJourney({id, levels}, board, renderRound) {
  const playSound = bindGameAudio(document.querySelector('[data-game-sound]'));
  const map = document.querySelector('[data-level-map]');
  const list = map.querySelector('[data-level-list]');
  const result = document.querySelector('[data-level-result]');
  const nextLevel = result.querySelector('[data-level-next]');
  const paths = pathsForGame(id);
  const pathForAge = age => paths.find(path => path.age === age);
  const pathForLevel = index => paths.find(path => includesLevel(path, index));
  const query = new URLSearchParams(location.search);
  const continuing = query.get('continue') === '1';
  const initial = progress(id, levels.length);
  const requestedAge = query.get('path') ?? query.get('age');
  let linkedPath = pathForAge(requestedAge) ??
    (continuing ? pathForLevel(initial.lastLevel) : undefined);
  const pathChoice = paths.length ? createPathChoice() : null;
  let level = 0;
  let round = 0;
  let mistakes = 0;
  let solved = false;
  let roundOrder = null;
  let previousTotal = totalStars();
  let encouragement;
  let encouraged = false;
  setupWorld(id,board,map,result);

  const navigation = document.createElement('nav');
  navigation.className = 'game-exit-links';
  navigation.setAttribute('aria-label', tr('مغادرة اللعبة', 'Leave the game'));
  const app = /FudoolAndroidUnified/.test(navigator.userAgent);
  let resultContent;
  if (app) {
    const actions = result.querySelector('.game-actions');
    resultContent = document.createElement('div');
    resultContent.className = 'game-result-content';
    resultContent.append(...Array.from(result.childNodes).filter(node => node !== actions));
    result.prepend(resultContent);
  }
  const locale = language === 'ar' ? '' : '/en';
  const home = app ? locale + '/play-app/' : locale + '/';
  const games = app ? home + '#v5-games' : locale + '/games/';
  for (const [caption, href] of [[tr('الرئيسية', 'Home'), home], [tr('الألعاب', 'Games'), games]]) {
    const link = document.createElement('a');
    link.className = 'button button-white';
    link.href = href;
    link.textContent = caption;
    navigation.append(link);
  }
  const soundBar = document.querySelector('.game-sound-bar');
  if (soundBar) {
    soundBar.classList.add('game-toolbar');
    soundBar.prepend(navigation);
  } else {
    map.before(navigation);
  }

  function currentPath(state) {
    const age = requestedAge ?? recommendedAge(activeProfile());
    return linkedPath ?? pathForAge(state.agePath) ?? pathForAge(age) ??
      (ageGroups.indexOf(age) > ageGroups.indexOf(paths.at(-1)?.age) ? paths.at(-1) : paths[0]);
  }

  function isOpen(index, state, path) {
    if (path && !includesLevel(path, index)) return false;
    return index === (path?.first ?? 1) - 1 ||
      Boolean(state.scores[index - 1] || state.scores[index] || Number.isInteger(state.checkpoints[index]?.round));
  }

  function createPathChoice() {
    const root = document.createElement('section');
    root.className = 'game-path-choice';
    root.dataset.gamePaths = '';
    const title = document.createElement('h3');
    title.id = 'game-path-title';
    title.textContent = tr('العمر المناسب', 'Choose an age group');
    root.setAttribute('aria-labelledby', title.id);
    const summary = document.createElement('div');
    summary.setAttribute('aria-live', 'polite');
    const skill = document.createElement('p');
    const range = document.createElement('p');
    range.className = 'game-path-range';
    summary.append(skill, range);
    const controls = document.createElement('div');
    controls.className = 'game-path-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-labelledby', title.id);
    const ageButtons = paths.map(path => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button button-white';
      button.dataset.agePath = path.age;
      button.textContent = ageLabel(path.age, language === 'ar');
      button.addEventListener('click', () => changeAge(path));
      return button;
    });
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'button button-primary';
    play.dataset.pathPlay = '';
    play.addEventListener('click', () => {
      const state = progress(id, levels.length);
      start(nextPathLevel(currentPath(state), state.scores));
    });
    controls.append(...ageButtons);
    root.append(title, controls, summary, play);
    const intro = map.querySelector(':scope > p') ?? map.querySelector('h2');
    intro.after(root);
    return {root, skill, range, play, ageButtons};
  }

  function changeAge(path) {
    linkedPath = path;
    save(id, levels.length, state => { state.agePath = path.age; });
    const url = new URL(location.href);
    for (const key of ['path', 'age', 'level', 'continue']) url.searchParams.delete(key);
    if (url.href !== location.href) history.replaceState(history.state, '', url);
    showMap(false);
  }

  function updatePathChoice(path, state) {
    const {root, skill, range, play, ageButtons} = pathChoice;
    const next = nextPathLevel(path, state.scores);
    const number = next + 1;
    root.dataset.gamePaths = path.age;
    skill.textContent = tr(path.ar, path.en);
    const span = document.createElement('bdi');
    span.dir = 'ltr';
    span.textContent = `${path.first}–${path.last}`;
    range.replaceChildren(tr('المستويات ', 'Levels '), span);
    play.textContent = state.scores[next]
      ? tr(`راجع المستوى ${number}`, `Review level ${number}`)
      : Number.isInteger(state.checkpoints[next]?.round)
        ? tr(`تابع المستوى ${number}`, `Continue level ${number}`)
        : tr(`ابدأ المستوى ${number}`, `Start level ${number}`);
    for (const button of ageButtons) button.setAttribute('aria-pressed', String(button.dataset.agePath === path.age));
  }

  function show(panel, focus = true) {
    for (const section of [map, board, result]) section.hidden = section !== panel;
    if (focus) panel.querySelector('h2').focus();
  }

  function showMap(focus = true) {
    if (focus) stopSpeech();
    const state = progress(id, levels.length);
    const {scores, checkpoints} = state;
    const activePath = paths.length ? currentPath(state) : undefined;
    if (activePath) updatePathChoice(activePath, state);
    const first = (activePath?.first ?? 1) - 1;
    const last = activePath?.last ?? levels.length;
    updateMap(map, scores.slice(first, last));
    const buttons=levels.slice(first,last).map(({title}, offset) => {
      const index = first + offset;
      const locked = !isOpen(index, state, activePath);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'game-level';
      button.dataset.levelNumber = String(index + 1);
      button.disabled = locked;
      const number = document.createElement('strong');
      number.className = 'sr-only';
      number.textContent = tr(`المستوى ${index + 1}`, `Level ${index + 1}`);
      const label = document.createElement('span');
      label.className = 'reward-level-title';
      label.textContent = title;
      const status = document.createElement('small');
      status.textContent = locked ? tr('مغلق', 'Locked') :
        Number.isInteger(checkpoints[index]?.round) ? tr('تابع اللعب', 'Continue playing') :
        scores[index] ? tr('مكتمل', 'Completed') : tr('ابدأ اللعب', 'Start playing');
      button.append(number, label, status);
      decorateLevel(button,index,scores[index],locked);
      button.addEventListener('click', () => start(index));
      return button;
    });
    let stages;
    if (activePath) {
      const stage = renderTrailStage(id, 1, buttons, ageLabel(activePath.age, language === 'ar'));
      stage.dataset.levelPath = activePath.age;
      stage.setAttribute('data-current-path', '');
      stages = [stage];
    } else {
      stages = [];
      for (let i = 0; i < buttons.length; i += 5) {
        stages.push(renderTrailStage(id, Math.floor(i / 5) + 1, buttons.slice(i, i + 5)));
      }
    }
    list.replaceChildren(...stages);
    show(map, focus);
  }

  function playRound() {
    if (encouragement) encouragement.hidden = true;
    solved = false;
    show(board, false);
    renderRound(levels[level].rounds[roundOrder?.[round] ?? round]);
    board.querySelector('h2').focus();
  }

  function start(index, replay = false) {
    level = index;
    encouraged = false;
    previousTotal = totalStars();
    const length=levels[level].rounds.length;
    const previous=progress(id, levels.length);
    const existing=previous.orders[level];
    const validOrder=Array.isArray(existing)&&existing.length===length&&new Set(existing).size===length&&existing.every(x=>Number.isInteger(x)&&x>=0&&x<length);
    const unfinished=previous.checkpoints[level];
    roundOrder=replay||(!unfinished&&previous.scores[level])?shuffle(Array.from({length},(_,i)=>i)):validOrder?existing:null;
    save(id, levels.length, (state) => {
      state.lastPlayed = Date.now();
      state.lastLevel = level;
      if(roundOrder)state.orders[level]=roundOrder;else delete state.orders[level];
      if(replay)delete state.checkpoints[level];
    });
    const checkpoint = replay ? null : progress(id, levels.length).checkpoints[level];
    const valid = Number.isInteger(checkpoint?.round) && checkpoint.round >= 0 &&
      checkpoint.round < levels[level].rounds.length && Number.isInteger(checkpoint.mistakes) && checkpoint.mistakes >= 0;
    round = valid ? checkpoint.round : 0;
    mistakes = valid ? checkpoint.mistakes : 0;
    playRound();
  }

  function score() {
    return mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
  }

  function encourage(retry) {
    const player = activeProfile().name;
    if (!player || encouraged) return;
    encouraged = true;
    if (!encouragement) {
      encouragement = document.createElement('p');
      encouragement.className = 'player-encouragement';
      encouragement.setAttribute('role', 'status');
      board.querySelector('h2').after(encouragement);
    }
    const text = retry ? tr(`خذ وقتك يا ${player}. جرّب مرة أخرى!`, `Take your time, ${player}. Try again!`)
      : tr(`عمل رائع يا ${player}! واصل اللعب.`, `Nice work, ${player}! Keep going.`);
    encouragement.textContent = text;
    encouragement.hidden = false;
    speak(text, language, undefined, {localOnly: true});
  }

  function showResult() {
    const {scores} = progress(id, levels.length);
    const path = pathForLevel(level);
    const atEnd = level === (path?.last ?? levels.length) - 1;
    const allComplete = atEnd && (!path || scores.every(Boolean));
    const pathComplete = path && atEnd && scores.slice(path.first - 1, path.last).every(Boolean);
    const total = totalStars();
    result.querySelector('h2').textContent = allComplete
      ? tr('أكملت مستويات اللعبة!', `You finished all ${levels.length} levels!`)
      : pathComplete
        ? tr(`أكملت مستويات فئة ${ageLabel(path.age, true)}!`, `${ageLabel(path.age, false)} complete!`)
        : tr(`أكملت المستوى ${level + 1}!`, `Level ${level + 1} complete!`);
    result.querySelector('[data-result-stars]').textContent = starText(score());
    const best = scores[level];
    const player = activeProfile().name;
    const congratulations = player ? tr(`أحسنت يا ${player}!`, `Well done, ${player}!`)
      : tr('أحسنت!', 'Well done!');
    const resultMessage = best > score()
      ? tr(`أفضل نتيجة لك: ${starText(best)}`, `Your best: ${starText(best)}`)
      : tr('كل جولة تجعلك أفضل.', 'Keep exploring.');
    result.querySelector('[data-result-message]').textContent =
      player || best <= score() ? congratulations + ' ' + resultMessage : resultMessage;
    if (player) speak(congratulations, language, undefined, {localOnly: true});
    const badges = result.querySelector('[data-result-badges]');
    const unlocked = starBadges.filter(([threshold]) => total >= threshold).at(-1);
    badges.hidden = !unlocked;
    badges.replaceChildren();
    if (unlocked) {
      const badgeArt = createIllustration(unlocked[1]);
      badgeArt.classList.add('world-icon');
      badges.append(badgeArt, document.createTextNode(unlocked[2]));
    }
    nextLevel.hidden = atEnd;
    show(result, !app);
    const endNote = atEnd && !allComplete
      ? tr('اختر مسارًا أو مستوى من الخريطة لتواصل اللعب.', 'Choose a path or level on the map to keep playing.')
      : undefined;
    celebrate(result, {
      score: score(), best, total, badges: starBadges, rounds: levels[level].rounds.length,
      last: allComplete && atEnd, pathComplete, endNote, previousTotal,
    });
    if (resultContent) {
      resultContent.scrollTop = 0;
      result.querySelector('h2').focus({preventScroll: true});
    }
  }

  document.querySelectorAll('[data-level-menu]').forEach((button) => button.addEventListener('click', () => showMap()));
  nextLevel.addEventListener('click', () => start(level + 1));
  result.querySelector('[data-level-replay]').addEventListener('click', () => start(level, true));
  window.addEventListener('pagehide', stopSpeech);
  window.addEventListener('pageshow', (event) => { if (event.persisted && !map.hidden) showMap(false); });
  window.addEventListener('storage', () => { if (!map.hidden) showMap(false); });
  const requested = Number(query.get('level')) - 1;
  // Older saved level links still open their original level when the player has unlocked it.
  const oldLinkPath = !requestedAge && pathForLevel(requested);
  if (oldLinkPath && (initial.scores[requested] || initial.scores[requested - 1] || initial.checkpoints[requested])) {
    linkedPath = oldLinkPath;
  }
  const startingPath = paths.length ? currentPath(initial) : undefined;
  if (Number.isInteger(requested) && requested >= 0 && requested < levels.length && isOpen(requested, initial, startingPath)) {
    queueMicrotask(() => start(requested));
  } else if (continuing) {
    const {scores, checkpoints, lastLevel} = initial;
    const unlocked = levels.map((_, index) => index).filter(index =>
      (!startingPath || includesLevel(startingPath, index)) && isOpen(index, initial, startingPath));
    const checkpoint = unlocked.findLast((index) => Number.isInteger(checkpoints[index]?.round));
    const next = startingPath ? nextPathLevel(startingPath, scores) : unlocked.find(index => !scores[index]);
    const recent = unlocked.includes(lastLevel) && (!scores[lastLevel] || checkpoints[lastLevel]) ? lastLevel : undefined;
    queueMicrotask(() => start(recent ?? checkpoint ?? next ?? unlocked.at(-1)));
  } else {
    showMap(false);
  }

  return {
    roundLabel: () => tr(`المستوى ${level + 1} · الجولة ${round + 1} من ${levels[level].rounds.length}`,
      `Level ${level + 1} · Round ${round + 1} of ${levels[level].rounds.length}`),
    nextLabel: () => round + 1 === levels[level].rounds.length
      ? tr('شاهد النتيجة', 'See result') : tr('الجولة التالية', 'Next round'),
    mistake() {
      mistakes++;
      save(id, levels.length, (state) => {
        state.checkpoints[level] = {round, mistakes};
        state.lastPlayed = Date.now();
        state.lastLevel = level;
      });
      playSound('wrong');
      encourage(true);
    },
    correct: () => playSound('correct'),
    effect: cue => playSound(cue),
    solve() {
      if (solved) return;
      solved = true;
      const finished = round + 1 === levels[level].rounds.length;
      playSound('correct', finished);
      if (!finished) encourage(false);
      save(id, levels.length, (state) => {
        const {scores, checkpoints} = state;
        state.lastPlayed = Date.now();
        state.lastLevel = level;
        if (round + 1 < levels[level].rounds.length) {
          checkpoints[level] = {round: round + 1, mistakes};
        } else {
          scores[level] = Math.max(scores[level], score());
          delete checkpoints[level];
        }
      });
    },
    advance() {
      if (!solved) return;
      if (round + 1 === levels[level].rounds.length) showResult();
      else {
        round++;
        playRound();
      }
    },
  };
}
