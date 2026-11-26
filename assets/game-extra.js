import {vowelClipId} from './vowel-audio-review.js?v=2';
import {playRecording, speak, stopSpeech, tones} from './game-voice.js?v=2';
import {renderIceExperiment} from './ice-experiment.js?v=2';
export {playRecording, speak, stopSpeech} from './game-voice.js?v=2';
import {drawGuide,evaluateTrace} from './trace-assessment.js?v=4';
import {drawWritingReview, startingMarker} from './writing-review.js?v=1';
import {createIllustration,illustrate} from './learning-art.js?v=2';
import {shuffle} from './game-progress.js?v=16';
const ar=document.documentElement.lang==='ar';
const tr=(a,b)=>ar?a:b;
const el=(tag,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
export function renderExtra(round,{cue,options,feedback,next,journey,makeOption}){
  const {kind}=round;let finished=false;
  const say=(text,state='')=>{feedback.textContent=text;feedback.dataset.state=state;};
  const done=()=>{if(finished)return;finished=true;journey.solve();say(tr('أحسنت! أكملت الجولة.','Well done! Round complete.'),'correct');next.hidden=false;next.disabled=false;};
  const wrong=()=>{journey.mistake();say(tr('حاول مرة أخرى.','Try again.'),'wrong');};
  const button=(label,handler,cls='game-option')=>{const b=el('button',label,cls);b.type='button';b.addEventListener('click',handler);return b;};
  if(kind==='quiz'){
    if (round.table) {
      const table = el('table', '', 'science-observations');
      table.createCaption().textContent = round.table.caption;
      const header = table.createTHead().insertRow();
      for (const column of round.table.columns) {
        const label = el('th', column);
        label.scope = 'col';
        header.append(label);
      }
      const body = table.createTBody();
      for (const values of round.table.rows) {
        const row = body.insertRow();
        const label = el('th', String(values[0]));
        label.scope = 'row';
        row.append(label);
        for (const value of values.slice(1)) row.insertCell().textContent = value;
      }
      cue.append(table);
    }
    if(round.cue){const content=illustrate(el('span',round.cue,'extra-cue'),round.cue);if(round.ltr)content.dir='ltr';cue.append(content);}
    if(round.speech||round.tones||round.audio){
      const fallback=()=>{if(!cue.querySelector('.audio-fallback'))cue.append(el('small',tr('الصوت غير متاح. أعد المحاولة أو اطلب مساعدة الأهل.','Audio unavailable. Try again or ask a grown-up for help.'),'audio-fallback'));};
      const reviewedSource=[round.audio,round.audioFallback].find(src=>vowelClipId(src)!==null);
      const visualFallback=()=>{if(!cue.querySelector('.audio-fallback')){const parts=String(round.speech||'').split(/\s+\.\s+/);cue.append(el('strong',parts.at(-1)||'', 'audio-fallback'));say(tr('اقرأ المثال واختر الإجابة.','Read the example and choose the answer.'))}};
      const play=button(tr('🔊 استمع','🔊 Listen'),async()=>{cue.querySelector('.audio-fallback')?.remove();if(reviewedSource){await playRecording(reviewedSource,visualFallback);return}if(round.tones){if(!await tones(round.tones))say(tr('الصوت غير متاح على هذا الجهاز.','Sound is unavailable on this device.'));}else if(round.audio)playRecording(round.audio,()=>round.speech&&!round.audio.startsWith('/assets/game-sound-effects/')?speak(round.speech,round.speechLang||'ar-SA',fallback):fallback());else speak(round.speech,round.speechLang,()=>round.audioFallback?playRecording(round.audioFallback,fallback):fallback());},'button button-white');cue.append(play);
    }
    const buttons=round.choices.map((v,i)=>makeOption(v,i===round.answer,round.explanation));options.dataset.columns=Math.min(4,round.choices.length);options.replaceChildren(...shuffle(buttons));const hint=button(tr('💡 تلميح','💡 Hint'),()=>{if(next.hidden){buttons[round.answer].dataset.hint='true';say(tr('جرّب الاختيار المضيء.','Try the highlighted choice.'));}},'button button-white');cue.append(hint);return;
  }
  options.dataset.columns='1';
  if (kind === 'ice-experiment') {
    renderIceExperiment(round, {cue, options, journey, button, done, wrong, say});
    return;
  }
  if(kind==='order'){
    const target=round.target;let pos=0;const seq=el('div','','extra-sequence');seq.dir=typeof target[0]==='number'||/^[A-Z]$/.test(target[0])?'ltr':'rtl';cue.append(illustrate(el('span',round.cue,'extra-cue'),round.cue),seq);
    const group=el('div','','extra-order');group.dir=seq.dir;options.append(group);
    const cells=target.map(()=>el('span','?','extra-slot'));seq.append(...cells);
    for(const value of shuffle(target.map((v,i)=>({v,i})))){const b=button(String(value.v),()=>{if(finished)return;if(value.v!==target[pos]){wrong();return;}cells[pos++].textContent=value.v;b.disabled=true;journey.correct();if(pos===target.length)done();});group.append(b);}return;
  }
  if (kind === 'magnet-distance') {
    const {distances, results, question, choices, answer, explanation, clips} = round;
    const bench = el('section', '', 'magnet-bench');
    bench.append(el('p', tr('محاكاة · نفس المغناطيس ونفس المشابك في كل محاولة', 'Simulation · The magnet and clips stay the same in every trial'), 'magnet-note'));

    const track = el('div', '', 'magnet-distance-track');
    track.setAttribute('aria-hidden', 'true');
    track.append(illustrate(el('span', '🧲', 'distance-magnet'), '🧲'));
    const paperclips = Array.from({length: clips}, (_, i) => {
      const clip = el('span', '', 'distance-clip');
      clip.style.setProperty('--clip-column', i % 3);
      clip.style.setProperty('--clip-row', Math.floor(i / 3));
      track.append(clip);
      return clip;
    });
    bench.append(track);

    const unit = tr(' سم', ' cm');
    const picks = el('div', '', 'magnet-distance-choices');
    picks.setAttribute('role', 'group');
    picks.setAttribute('aria-label', tr('المسافة من المشابك', 'Distance from the clips'));
    const status = el('p', '', 'magnet-observation');
    status.setAttribute('role', 'status');

    const table = el('table', '', 'science-observations');
    table.createCaption().textContent = tr('سجل القياسات', 'Measurement log');
    const header = table.createTHead().insertRow();
    for (const label of [tr('المسافة', 'Distance'), tr('المشابك التي انجذبت', 'Clips pulled')]) {
      const heading = el('th', label);
      heading.scope = 'col';
      header.append(heading);
    }
    const body = table.createTBody();
    const cells = distances.map(distance => {
      const row = body.insertRow();
      const heading = el('th', distance + unit);
      heading.scope = 'row';
      row.append(heading);
      const cell = row.insertCell();
      cell.textContent = '—';
      return cell;
    });

    let selected = 0, measured = false;
    const recorded = new Set();
    const conclusion = el('section', '', 'magnet-conclusion');
    conclusion.hidden = true;
    const heading = el('h3', question);
    heading.tabIndex = -1;
    const answers = choices.map((choice, index) => button(choice, () => {
      if (finished || recorded.size < distances.length) return;
      if (index !== answer) {
        answers[index].disabled = true;
        wrong();
        return;
      }
      answers[index].dataset.state = 'correct';
      for (const control of answers) control.disabled = true;
      test.disabled = true;
      for (const control of picks.children) control.disabled = true;
      done();
      say(explanation, 'correct');
    }));
    conclusion.append(heading, ...answers);

    function place(index) {
      selected = index;
      measured = false;
      track.style.setProperty('--magnet-position', (66 - 18 * index) + '%');
      for (const clip of paperclips) delete clip.dataset.pulled;
      [...picks.children].forEach((pick, i) => pick.setAttribute('aria-pressed', String(i === index)));
      record.disabled = true;
      status.textContent = tr('المسافة المختارة ', 'Selected distance ') + distances[index] + unit;
    }

    const test = button(tr('جرّب المسافة', 'Test the distance'), () => {
      measured = true;
      const count = results[selected];
      paperclips.forEach((clip, i) => { clip.dataset.pulled = String(i < count); });
      status.textContent = tr('عدد المشابك التي انجذبت ', 'Clips pulled ') + count + ' / ' + clips;
      record.disabled = recorded.has(selected);
    }, 'button button-primary');
    test.dataset.testDistance = '';
    const record = button(tr('سجّل النتيجة', 'Record the result'), () => {
      if (!measured || recorded.has(selected)) return;
      cells[selected].textContent = results[selected];
      recorded.add(selected);
      record.disabled = true;
      status.textContent = tr('سجّلت ', 'Recorded ') + recorded.size + ' / ' + distances.length;
      if (recorded.size === distances.length) {
        conclusion.hidden = false;
        heading.focus({preventScroll: true});
      }
    }, 'button button-white');
    record.dataset.recordDistance = '';
    distances.forEach((distance, index) => {
      const control = button(distance + unit, () => place(index), 'button button-white');
      control.dataset.distance = String(distance);
      picks.append(control);
    });

    const actions = el('div', '', 'magnet-distance-choices');
    actions.append(test, record);
    bench.append(picks, actions, status, table);
    cue.append(bench);
    options.append(conclusion);
    place(0);
    return;
  }
  if (kind === 'memory') {
    const pairs = round.pairs ?? round.images.map(image => ({id: image, image}));
    const mode = round.match ?? 'picture';
    const deck = shuffle(pairs.flatMap(pair => [{pair, type: 'picture'}, {pair, type: mode}]));
    const grid = el('div', '', 'extra-memory discovery-memory');
    grid.dataset.memoryPhase = 'preview';
    grid.style.setProperty('--cols', deck.length === 4 ? '2' : deck.length === 6 ? '3' : deck.length <= 12 ? '4' : '5');
    const summary = el('div', '', 'discovery-summary');
    const matchedLabel = el('strong');
    const meter = el('progress');
    meter.max = pairs.length;
    meter.setAttribute('aria-label', tr('الأزواج المكتملة', 'Matched pairs'));
    const instructions = el('p', mode === 'sound'
      ? tr('اضغط بطاقات السماعة لتسمع الأصوات، ثم ابدأ المطابقة.', 'Tap the speaker cards to hear the sounds, then start matching.')
      : mode === 'word'
        ? tr('احفظ أماكن الصور وأسمائها ثم ابدأ المطابقة.', 'Remember where the pictures and words are, then start matching.')
        : mode === 'relation'
          ? tr('احفظ أماكن كل شيئين يرتبطان معًا.', 'Remember the positions of the objects that work together.')
          : tr('احفظ أماكن الصور ثم ابدأ المطابقة.', 'Look at the pictures and remember their places.'), 'memory-instructions');
    let first = null, busy = false, matched = 0, tries = 0;
    next.hidden = false;
    next.disabled = true;

    function update() {
      matchedLabel.textContent = tr('الأزواج: ', 'Pairs: ') + matched + ' / ' + pairs.length +
        ' · ' + tr('المحاولات: ', 'Attempts: ') + tries;
      meter.value = matched;
    }
    function showFace(card, visible) {
      card.querySelector('.memory-face').hidden = !visible;
      card.querySelector('.memory-back').hidden = visible;
      card.classList.toggle('revealed', visible);
      const position = card.dataset.index;
      const item = deck[Number(position) - 1];
      const label = item.type === 'sound' ? tr('اسمع بطاقة الصوت', 'Play sound card')
        : item.type === 'relation' ? item.pair.relatedName
          : item.pair.name ?? tr('الصورة ' + (pairs.indexOf(item.pair) + 1), 'picture ' + (pairs.indexOf(item.pair) + 1));
      const match = card.dataset.matched ? tr('، اكتمل الزوج', ', matched') : '';
      card.setAttribute('aria-label', visible
        ? tr('البطاقة ' + position + '، ', 'Card ' + position + ', ') + label + match
        : tr('بطاقة مغلقة ' + position, 'Hidden card ' + position));
    }
    function playSound(pair) {
      playRecording(pair.audio, () => say(tr('تعذّر تشغيل الصوت. جرّب البطاقة مجددًا.', 'The sound could not play. Try the card again.')));
    }
    let tick;
    const previewTime = deck.length <= 8 ? 12 : 18;
    const countdown = el('div', '', 'memory-countdown');
    countdown.hidden = true;
    const countdownMeter = el('progress');
    countdownMeter.max = previewTime;
    countdownMeter.setAttribute('aria-label', tr('وقت المعاينة المتبقي', 'Preview time remaining'));
    const remaining = el('bdi');
    remaining.dir = 'ltr';
    countdown.append(remaining, countdownMeter);

    function startMatch() {
      if (grid.dataset.memoryPhase !== 'preview') return;
      clearInterval(tick);
      countdown.hidden = true;
      previewActions.hidden = true;
      if (mode === 'sound') stopSpeech();
      grid.dataset.memoryPhase = 'match';
      for (const card of grid.children) {
        showFace(card, false);
        card.disabled = false;
      }
      ready.hidden = true;
      say('');
      instructions.textContent = {
        picture: tr('اكشف بطاقتين متطابقتين.', 'Turn over two matching cards.'),
        word: tr('طابق كل صورة مع اسمها.', 'Match each picture to its name.'),
        sound: tr('طابق كل صورة مع صوتها.', 'Match each picture to its sound.'),
        relation: tr('طابق كل شيئين يُستخدمان معًا.', 'Match the two things used together.'),
      }[mode];
      grid.firstElementChild.focus({preventScroll: true});
    }
    const previewActions = el('div', '', 'memory-preview-actions');
    const ready = button(tr('ابدأ المطابقة', 'Start matching'), startMatch, 'button button-primary memory-start');
    previewActions.append(ready);
    if (mode !== 'sound') {
      const timed = button(tr('معاينة بالمؤقّت', 'Timed preview'), () => {
        timed.hidden = true;
        countdown.hidden = false;
        let seconds = previewTime;
        function display() {
          countdownMeter.value = seconds;
          remaining.textContent = seconds + tr(' ث', ' s');
        }
        display();
        ready.focus({preventScroll: true});
        tick = setInterval(() => {
          if (!grid.isConnected || grid.closest('[hidden]')) {
            clearInterval(tick);
            return;
          }
          seconds--;
          display();
          if (!seconds) startMatch();
        }, 1000);
      }, 'button button-white memory-timed');
      previewActions.append(timed);
    }

    deck.forEach(({pair, type}, index) => {
      const card = button('', () => {
        if (finished || busy || card.disabled) return;
        if (grid.dataset.memoryPhase === 'preview' || first === card) {
          if (type === 'sound') playSound(pair);
          return;
        }
        showFace(card, true);
        if (type === 'sound') playSound(pair);
        else journey.effect('flip');
        if (!first) { first = card; return; }
        const previous = first;
        first = null;
        tries++;
        if (previous.dataset.pair === pair.id) {
          previous.disabled = card.disabled = true;
          previous.dataset.matched = card.dataset.matched = 'true';
          showFace(previous, true);
          showFace(card, true);
          matched++;
          if (matched < pairs.length) journey.effect('pair');
          say(tr('وجدت زوجًا!', 'You found a pair!'), 'correct');
          update();
          if (matched === pairs.length) {
            grid.dataset.memoryPhase = 'complete';
            done();
            next.focus({preventScroll: true});
            next.scrollIntoView({block: 'center'});
          }
          return;
        }
        busy = true;
        wrong();
        update();
        setTimeout(() => {
          if (!grid.isConnected) return;
          if (mode === 'sound') stopSpeech();
          showFace(previous, false);
          showFace(card, false);
          busy = false;
        }, mode === 'sound' ? 1500 : 750);
      }, 'extra-memory-card');
      card.dataset.pair = pair.id;
      card.dataset.image = pair.image ?? pair.id;
      card.dataset.face = type;
      card.dataset.index = String(index + 1);
      card.disabled = type !== 'sound';
      const back = el('span', '', 'memory-back');
      back.append(el('span', '✦', 'memory-back-star'), el('small', '?'));
      let face;
      if (type === 'word') {
        face = el('span', pair.name, 'memory-face memory-word');
      } else if (type === 'sound') {
        face = illustrate(el('span', '🔊', 'memory-face memory-speaker'), '🔊');
      } else if (type === 'relation') {
        face = el('span', '', 'memory-face memory-illustration memory-relation');
        face.append(createIllustration(pair.related));
      } else if (pair.image) {
        face = el('img', '', 'memory-face');
        face.src = pair.image;
        face.alt = '';
        face.draggable = false;
      } else {
        face = el('span', '', 'memory-face memory-illustration');
        face.append(createIllustration(pair.art));
      }
      face.setAttribute('aria-hidden', 'true');
      card.append(back, face);
      showFace(card, true);
      grid.append(card);
    });
    summary.append(matchedLabel, meter);
    cue.append(summary, instructions, countdown);
    options.append(grid, previewActions);
    update();
    return;
  }
  if (kind === 'puzzle') {
    const {cols, rows, image, rotate} = round;
    const total = cols * rows;
    const order = shuffle(Array.from({length: total}, (_, i) => i));
    if (order.every((piece, slot) => piece === slot)) [order[0], order[1]] = [order[1], order[0]];
    const turns = Array.from({length: total}, (_, piece) => rotate && piece % 2 === 0 ? 1 + Math.floor(Math.random() * 3) : 0);
    let selected = -1, moves = 0;
    let scaleX = 1, scaleY = 1;

    const preview = el('img', '', 'extra-puzzle-preview discovery-preview');
    preview.classList.toggle('rotating-puzzle-preview', Boolean(rotate));
    preview.src = image;
    preview.alt = tr('الصورة الأصلية', 'Original picture');
    const panel = el('div', '', 'puzzle-reference');
    const toggle = button(tr('إخفاء الصورة', 'Hide picture'), () => {
      preview.hidden = !preview.hidden;
      toggle.textContent = preview.hidden ? tr('عرض الصورة', 'Show picture') : tr('إخفاء الصورة', 'Hide picture');
      toggle.setAttribute('aria-expanded', String(!preview.hidden));
    }, 'button button-white');
    toggle.setAttribute('aria-expanded', 'true');
    panel.append(el('strong', tr('الصورة المرجعية', 'Reference picture')), preview, toggle);
    const summary = el('div', '', 'discovery-summary');
    const label = el('strong');
    const meter = el('progress');
    meter.max = total;
    meter.setAttribute('aria-label', tr('القطع في مكانها', 'Correctly placed pieces'));
    summary.append(label, meter);
    cue.append(panel, summary);

    const grid = el('div', '', 'extra-puzzle discovery-puzzle');
    if (rotate) grid.style.aspectRatio = '1';
    function sizePuzzle() {
      if (!preview.naturalWidth || !preview.naturalHeight) return;
      const ratio = preview.naturalWidth / preview.naturalHeight;
      if (rotate) {
        // Use the same centre crop in the reference and across the square board.
        scaleX = Math.max(1, ratio);
        scaleY = Math.max(1, 1 / ratio);
      } else {
        grid.style.aspectRatio = String(ratio);
      }
    }
    grid.style.setProperty('--cols', cols);
    grid.style.setProperty('--rows', rows);
    grid.dir = 'ltr';
    options.append(grid);
    const turn = button(tr('دوّر 90°', 'Rotate 90°'), () => {
      if (selected < 0 || finished) return;
      const piece = order[selected];
      turns[piece] = (turns[piece] + 1) % 4;
      moves++;
      draw();
    }, 'button button-primary puzzle-turn');
    if (rotate) {
      turn.dataset.rotatePiece = '';
      options.append(turn);
    }

    function draw(focus = -1) {
      const placed = order.map((piece, slot) => piece === slot && turns[piece] === 0);
      const count = placed.filter(Boolean).length;
      label.textContent = tr('القطع الصحيحة: ', 'Correct pieces: ') + count + ' / ' + total +
        ' · ' + tr('الحركات: ', 'Moves: ') + moves;
      meter.value = count;
      if (count === total) done();
      turn.disabled = selected < 0 || finished;
      grid.replaceChildren(...order.map((piece, slot) => {
        const tile = button('', () => {
          if (finished) return;
          if (selected < 0 || selected === slot) {
            selected = selected < 0 ? slot : -1;
          } else {
            [order[selected], order[slot]] = [order[slot], order[selected]];
            selected = -1;
            moves++;
          }
          draw(slot);
        }, 'extra-piece');
        tile.dataset.piece = String(piece);
        tile.dataset.slot = String(slot);
        tile.dataset.placed = String(placed[slot]);
        tile.setAttribute('aria-pressed', String(selected === slot));
        tile.disabled = finished;
        const angle = turns[piece] * 90;
        const pieceLabel = tr('قطعة ', 'Piece ') + (piece + 1);
        tile.setAttribute('aria-label', rotate ? pieceLabel + ' · ' + angle + '°' : pieceLabel);
        const art = rotate ? el('span', '', 'puzzle-piece-art') : tile;
        art.style.backgroundImage = 'url("' + image + '")';
        const fullWidth = cols * scaleX;
        const fullHeight = rows * scaleY;
        art.style.backgroundSize = (fullWidth * 100) + '% ' + (fullHeight * 100) + '%';
        const offsetX = (fullWidth - cols) / 2 + piece % cols;
        const offsetY = (fullHeight - rows) / 2 + Math.floor(piece / cols);
        art.style.backgroundPosition = offsetX * 100 / (fullWidth - 1) + '% ' +
          offsetY * 100 / (fullHeight - 1) + '%';
        if (rotate) {
          tile.dataset.rotation = String(angle);
          art.style.transform = 'rotate(' + angle + 'deg)';
          tile.append(art);
        }
        return tile;
      }));
      if (finished) next.focus({preventScroll: true});
      else if (focus >= 0) grid.children[focus].focus({preventScroll: true});
    }

    preview.addEventListener('load', () => { sizePuzzle(); draw(selected); });
    sizePuzzle();
    draw();
    return;
  }
  if (kind === 'trace') {
    const dictation = Boolean(round.audio);
    const studio = el('div', '', 'trace-studio');
    const bar = el('div', '', 'trace-studio-bar');
    const guide = el('img');
    guide.src = '/assets/lumaa.webp';
    guide.alt = '';
    guide.width = guide.height = 42;
    bar.append(guide, el('strong', tr('لوحة الكتابة', 'Writing board')));
    studio.append(bar);

    if (dictation) {
      const audioStatus = el('span', '', 'trace-audio-status');
      audioStatus.setAttribute('role', 'status');
      function readWord(rate) {
        audioStatus.textContent = '';
        playRecording(round.audio, () => speak(round.word, 'ar', () => {
          audioStatus.textContent = tr('تعذّر تشغيل الكلمة. أعد المحاولة.', 'The word could not play. Please try again.');
        }, {rate: rate * .9}), {rate});
      }
      const listen = button(tr('اسمع الكلمة', 'Listen to the Arabic word'), () => readWord(1),
        'button button-primary trace-listen');
      const slow = button(tr('استمع ببطء', 'Listen slowly'), () => readWord(.72),
        'button button-white trace-slow');
      const recordings = el('div', '', 'trace-recordings');
      recordings.append(listen, slow);
      studio.append(recordings, audioStatus);
    }

    const wrap = el('div', '', 'extra-trace');
    const model = el('canvas', '', 'trace-model');
    const canvas = el('canvas', '', 'trace-ink');
    model.width = canvas.width = 600;
    model.height = canvas.height = 320;
    if (dictation) {
      wrap.classList.add('trace-word-board');
    } else {
      model.setAttribute('aria-label', tr('نموذج الكتابة المنقّط', 'Dotted writing guide'));
      wrap.append(model);
    }
    canvas.setAttribute('aria-label', tr('مساحة الكتابة بالإصبع', 'Finger writing area'));
    wrap.append(canvas);
    studio.append(wrap);

    const assessment = el('div', '', 'trace-assessment');
    const metrics = el('p', tr('جاري تجهيز لوحة الكتابة…', 'Preparing the writing board…'), 'trace-metrics');
    const tip = el('p', '', 'trace-tip');
    const review = el('canvas', '', 'trace-review');
    review.hidden = true;
    review.setAttribute('aria-label', tr('نموذج يوضح أجزاء الكتابة التي تحتاج مراجعة', 'Model showing the areas to practise'));
    assessment.setAttribute('aria-live', 'polite');
    assessment.append(metrics, tip, review);
    studio.append(assessment);
    cue.append(studio);

    let target = null;
    let marker;
    let strokes = [], pointer = null, ink = '#6b4bc3';
    const ctx = canvas.getContext('2d');
    const instructions = tr('تُقبل الكتابة عند تجاوز 75%.', 'A score above 75% passes.');
    function resetResult() {
      if (!assessment.dataset.result) return;
      delete assessment.dataset.result;
      review.hidden = true;
      metrics.textContent = instructions;
      tip.textContent = '';
      say('');
    }
    function paint() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const stroke of strokes) {
        const {points} = stroke;
        const [x, y] = points[0];
        ctx.lineWidth = 9;
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.strokeStyle = ctx.fillStyle = stroke.ink;
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
        ctx.stroke();
      }
      if (marker) marker.hidden = finished || strokes.length > 0;
      undo.disabled = clear.disabled = finished || !strokes.length || pointer !== null;
      complete.disabled = undo.disabled || !target;
    }
    const point = event => {
      const rect = canvas.getBoundingClientRect();
      return [(event.clientX - rect.left) * canvas.width / rect.width,
        (event.clientY - rect.top) * canvas.height / rect.height];
    };
    canvas.addEventListener('pointerdown', event => {
      if (finished || pointer !== null || !target || event.button !== 0) return;
      resetResult();
      pointer = event.pointerId;
      canvas.setPointerCapture(pointer);
      strokes.push({ink, points: [point(event)]});
      paint();
    });
    canvas.addEventListener('pointermove', event => {
      if (event.pointerId !== pointer) return;
      const nextPoint = point(event);
      const points = strokes.at(-1).points;
      const previous = points.at(-1);
      if (Math.hypot(nextPoint[0] - previous[0], nextPoint[1] - previous[1]) < 1) return;
      points.push(nextPoint);
      paint();
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(event, e => {
        if (e.pointerId !== pointer) return;
        pointer = null;
        paint();
      });
    }

    const palette = el('div', '', 'trace-palette');
    const colors = [['#6b4bc3', tr('بنفسجي', 'Purple')], ['#267bb1', tr('أزرق', 'Blue')],
      ['#23835d', tr('أخضر', 'Green')], ['#bd4d70', tr('وردي', 'Pink')]];
    for (const [color, name] of colors) {
      const swatch = button('', () => {
        ink = color;
        for (const other of palette.children) other.setAttribute('aria-pressed', String(other === swatch));
      }, 'trace-color');
      swatch.style.backgroundColor = color;
      swatch.setAttribute('aria-label', name);
      swatch.setAttribute('aria-pressed', String(color === ink));
      palette.append(swatch);
    }

    const actions = el('div', '', 'game-actions trace-actions');
    const undo = button(tr('تراجع', 'Undo'), () => {
      strokes.pop();
      resetResult();
      paint();
    }, 'button button-white');
    const clear = button(tr('امسح', 'Clear'), () => {
      strokes = [];
      resetResult();
      paint();
    }, 'button button-white');
    const complete = button(tr('تحقّق من كتابتي', 'Check my writing'), () => {
      const score = evaluateTrace(target, canvas);
      const percent = el('bdi', score.percent + '%');
      percent.dir = 'ltr';
      metrics.replaceChildren(tr('دقة الكتابة ', 'Writing score '), percent);
      assessment.dataset.result = score.pass ? 'pass' : 'retry';
      drawWritingReview(review, model, score.pass ? null : score.missed);
      review.hidden = false;
      if (!score.pass) {
        journey.mistake();
        tip.textContent = dictation
          ? tr('راجع الأجزاء البرتقالية ثم أعد الكتابة.', 'Practise the orange areas, then try writing again.')
          : tr('راجع الأجزاء البرتقالية واتبع المسار المنقّط.', 'Check the orange areas and follow the dotted guide.');
        say(tr('حاول مرة أخرى.', 'Try again.'), 'wrong');
        return;
      }

      if (dictation) {
        const word = el('bdi', round.word);
        word.lang = 'ar';
        tip.replaceChildren(tr('أحسنت! كتبت ', 'Well done! You wrote '), word, '.');
      }
      done();
      paint();
      for (const swatch of palette.children) swatch.disabled = true;
    }, 'button button-primary');
    actions.append(undo, clear, complete);
    options.append(palette, actions);

    const image = new Image();
    const loadingFailed = () => {
      metrics.textContent = tr('تعذّر تجهيز لوحة الكتابة. أعد تحميل الصفحة.', 'The writing board could not load. Reload the page.');
    };
    image.onload = () => {
      try {
        target = drawGuide(image, model, dictation);
        metrics.textContent = instructions;
        if (!dictation) {
          marker = startingMarker(round.image, target.box, model);
          if (marker) {
            wrap.append(marker);
            tip.textContent = tr('ابدأ من السهم واتبع اتجاهه.', 'Start at the arrow and follow its direction.');
          }
        }
        paint();
      } catch {
        loadingFailed();
      }
    };
    image.onerror = loadingFailed;
    image.src = round.image;
    paint();
    return;
  }

}
