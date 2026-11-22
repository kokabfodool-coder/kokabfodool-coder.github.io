const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const {chromium} = require('playwright');

const origin = 'http://127.0.0.1:8766';
const server = spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], {stdio: 'ignore'});
const games = Object.fromEntries(fs.readdirSync('games', {withFileTypes: true})
  .filter(file => file.isDirectory()).map(file => {
    const html = fs.readFileSync(`games/${file.name}/index.html`, 'utf8');
    const data = html.match(/<script id="(?:game|drive|match)-data" type="application\/json">([\s\S]+?)<\/script>/);
    return [file.name, JSON.parse(data[1]).levels.length];
  }));

async function validateHomeCovers(browser, language, width) {
  const page = await browser.newPage({viewport: {width, height: 900}});
  const prefix = language === 'ar' ? '' : '/en';
  try {
    await page.goto(origin + prefix + '/', {waitUntil: 'domcontentloaded'});
    const covers = page.locator('#play .activity-card .fudool-world-cover');
    await covers.first().waitFor({state: 'visible'});
    assert.equal(await covers.count(), 20);
    const cards = await covers.evaluateAll(async thumbnails => {
      return Promise.all(thumbnails.map(async cover => {
        const scene = cover.querySelector('.world-cover-scene');
        const guide = cover.querySelector('.world-cover-guide');
        for (const image of [scene, guide]) image.loading = 'eager';
        await Promise.all([scene.decode(), guide.decode()]);
        const bounds = cover.getBoundingClientRect();
        const badge = guide.getBoundingClientRect();
        const card = cover.closest('.activity-card');
        const style = getComputedStyle(card);
        const contentWidth = card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const ratio = bounds.width / bounds.height;
        const fitted = getComputedStyle(scene).objectFit === 'cover' &&
          (Math.abs(ratio - 1) < .06 || Math.abs(ratio - 1.5) < .06) &&
          bounds.width >= Math.min(120, contentWidth * .3);
        const placed = getComputedStyle(guide).position === 'absolute' &&
          badge.left >= bounds.left && badge.right <= bounds.right &&
          badge.top >= bounds.top && badge.bottom <= bounds.bottom &&
          badge.width <= bounds.width * .25;
        const heading = card.querySelector('h3').getBoundingClientRect();
        const ordered = heading.width > 0 &&
          (heading.top >= bounds.bottom - 1 || heading.left >= bounds.right - 1 ||
           heading.right <= bounds.left + 1);
        return {id: card.dataset.gameId, fitted, placed, ordered};
      }));
    });
    assert.deepEqual(cards.filter(card => !card.fitted || !card.placed || !card.ordered), [], 'Home covers ' + language + ' ' + width);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    console.log('PASS home thumbnails', language, width, '20 game covers with inset character badges');
  } finally {
    await page.close();
  }
}

async function validateMaps(browser, language, width) {
  const page = await browser.newPage({viewport: {width, height: 844}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith(origin + '/assets/') && !response.ok()) {
      errors.push(response.status() + ' ' + response.url());
    }
  });
  await page.addInitScript(counts => {
    for (const [id, count] of Object.entries(counts)) {
      // The current app must open maps and rounds from existing V5 progress.
      localStorage.setItem('fudool-games-v1:' + id, JSON.stringify({scores: Array(count).fill(2)}));
    }
  }, games);
  const prefix = language === 'ar' ? '' : '/en';
  for (const [id, count] of Object.entries(games)) {
    await page.goto(origin + prefix + '/games/' + id + '/', {waitUntil: 'domcontentloaded'});
    await page.locator('[data-level-map]').waitFor({state: 'visible'});
    const cover = page.locator('.premium-game-heading .world-cover-scene');
    await cover.waitFor();
    await cover.evaluate(image => image.decode());
    await page.evaluate(({id, count}) => {
      const map = document.querySelector('[data-level-map]');
      const game = document.querySelector('.game-board:not(.game-levels):not(.game-result)');
      const ages = [...map.querySelectorAll('[data-age-path]')];
      const seen = new Set();
      const fit = () => {
        if (document.documentElement.scrollWidth > window.innerWidth + 2) throw Error(id + ': overflow');
      };
      if (!ages.length) throw Error(id + ': no age options');
      for (const age of ages) {
        age.click();
        fit();
        if (age.getAttribute('aria-pressed') !== 'true') throw Error(id + ': age not selected');
        const shown = [...map.querySelectorAll('.world-trail .game-level')].map(button => Number(button.dataset.levelNumber));
        for (const number of shown) {
          const button = map.querySelector('[data-level-number="' + number + '"]');
          if (button.dataset.rewardState !== 'complete' || seen.has(number)) throw Error(id + ': wrong age partition or lost score');
          seen.add(number);
          button.click();
          const label = game.querySelector('.game-progress').textContent;
          if (game.hidden || !label.includes(' ' + number + ' ·') || /[\u0660-\u0669\u06f0-\u06f9]/.test(label)) {
            throw Error(id + ': level ' + number + ' unavailable or numerals changed');
          }
          fit();
          game.querySelector('[data-level-menu]').click();
          if (map.hidden) throw Error(id + ': map unavailable');
        }
      }
      if (seen.size !== count || Math.max(...seen) !== count) throw Error(id + ': curriculum and level data differ');
    }, {id, count});
    if (language === 'ar' && width === 390 && ['vowel-drive', 'robo-lab', 'fudool-shop'].includes(id)) {
      await page.screenshot({path: 'build/v6-screenshots/' + id + '-map.png'});
      await page.locator('.world-trail .game-level').first().click();
      await page.screenshot({path: 'build/v6-screenshots/' + id + '-play.png'});
    }
  }
  assert.deepEqual(errors, [], language + ' ' + width);
  await page.close();
  console.log('PASS', language, width, '20 games and all 306 levels open under their allowed age groups');
}

async function validateDriving(browser, language) {
  const mobile = language === 'ar';
  const page = await browser.newPage({viewport: {width: mobile ? 390 : 1280, height: 844}, hasTouch: mobile});
  const prefix = mobile ? '' : '/en';
  try {
    await page.goto(origin + prefix + '/games/vowel-drive/');
    await page.locator('.world-trail .game-level').first().click();
    const road = page.locator('.drive-road');
    const scene = page.locator('[data-drive-scene]');
    const launch = page.locator('[data-drive-launch]');
    const feedback = page.locator('[data-drive-feedback]');
    const correct = await page.locator('.drive-gate[data-vowel="0"]').evaluate(gate =>
      Array.from(gate.parentElement.children).indexOf(gate));
    const wrong = correct === 0 ? 2 : 0;
    const session = mobile ? await page.context().newCDPSession(page) : null;

    async function drag(from, to) {
      await road.scrollIntoViewIfNeeded();
      const box = await road.boundingBox();
      const x = lane => box.x + box.width * [.21, .5, .79][lane];
      const y = box.y + box.height * .72;
      if (session) {
        await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: x(from), y, id: 1}]});
        await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x(to), y, id: 1}]});
        await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      } else {
        await page.mouse.move(x(from), y);
        await page.mouse.down();
        await page.mouse.move(x(to), y, {steps: 6});
        await page.mouse.up();
      }
      await page.waitForFunction(lane => document.querySelector('[data-drive-scene]').dataset.lane === String(lane), to);
      assert.equal(await scene.getAttribute('data-steering'), null);
    }

    await drag(1, wrong);
    assert.equal(await feedback.getAttribute('data-state'), null);
    await launch.click();
    await page.locator('[data-drive-feedback][data-state="wrong"]').waitFor();
    await drag(wrong, correct);
    if (!mobile) {
      await launch.focus();
      const step = correct === 2 ? 'ArrowLeft' : 'ArrowRight';
      await page.keyboard.press(step);
      assert.notEqual(await scene.getAttribute('data-lane'), String(correct));
      await page.keyboard.press(step === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft');
      assert.equal(await scene.getAttribute('data-lane'), String(correct));
    }
    await launch.click();
    await page.locator('[data-drive-feedback][data-state="correct"]').waitFor();
    assert(await launch.isDisabled());
    await page.locator('[data-drive-next]').click();
    assert.equal(await scene.getAttribute('data-lane'), '1');
    assert(await launch.isEnabled());
    console.log('PASS V6.1 driving', language, mobile ? 'touch' : 'mouse and keyboard');
  } finally {
    await page.close();
  }
}

async function validateRobo(page, language) {
  const prefix = language === 'ar' ? '' : '/en';
  await page.goto(origin + prefix + '/games/robo-lab/');
  const map = page.locator('[data-level-map]');
  await map.waitFor({state: 'visible'});
  await map.locator('.robo-experiments summary').click();
  await page.locator('[data-robo-prediction="purple"]').click();
  const mix = page.locator('[data-robo-mix]');
  assert(await mix.isDisabled());
  await page.locator('[data-robo-add="yellow"]').click();
  assert(await mix.isDisabled());
  await page.locator('[data-robo-add="blue"]').click();
  await page.locator('.robo-beaker[data-fill="both"]').waitFor();
  const nav = page.locator('.pwa-bottom-nav');
  if (await nav.isVisible()) {
    const [control, footer] = await Promise.all([mix.boundingBox(), nav.boundingBox()]);
    assert(control.y + control.height <= footer.y, 'The Android navigation must not cover Mix');
  }
  await mix.click();
  await page.locator('.robo-beaker[data-fill="green"]').waitFor();
  assert.match(await page.locator('.robo-observation').textContent(), language === 'ar' ? /الأخضر/ : /green/);
  const retry = page.locator('[data-robo-bench] .button-white');
  await retry.click();
  await page.locator('[data-robo-prediction="green"]').waitFor();

  await page.locator('[data-robo-experiment="magnet"]').click();
  await page.locator('[data-robo-prediction="wood"]').click();
  for (const [id, attracted] of [['plastic', false], ['iron', true], ['wood', false]]) {
    const piece = page.locator('[data-robo-material="' + id + '"]');
    await piece.click();
    assert.equal(await piece.getAttribute('data-attracted'), String(attracted));
  }
  await page.locator('.robo-recap').waitFor({state: 'visible'});
  assert(await map.locator('.game-level').nth(1).isDisabled());
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
}

async function validateAgePaths(browser, language) {
  const arabic = language === 'ar';
  const prefix = arabic ? '' : '/en';
  const base = origin + prefix;
  const page = await browser.newPage({viewport: {width: arabic ? 320 : 1280, height: 844}});
  const lab = base + '/games/robo-lab/';
  const drive = base + '/games/vowel-drive/';
  const map = page.locator('[data-level-map]');
  const choice = map.locator('[data-game-paths]');
  const play = choice.locator('[data-path-play]');
  const label = page.locator('.game-progress');
  const ageButton = age => choice.locator('[data-age-path="' + age + '"]');
  const levelButton = number => map.locator('[data-level-number="' + number + '"]');
  const progressKey = 'fudool-profile-v1:p-older:game:robo-lab';
  async function expectPlay(number, age) {
    await play.waitFor({state: 'visible'});
    assert.match(await play.textContent(), new RegExp(' ' + number + '$'));
    assert.equal(await choice.getAttribute('data-game-paths'), age);
    assert.equal(await ageButton(age).getAttribute('aria-pressed'), 'true');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  }
  async function expectRound(number, round) {
    await label.waitFor({state: 'visible'});
    assert.match(await label.textContent(), new RegExp(' ' + number + ' · (?:الجولة|Round) ' + round + ' '));
  }
  const answer = text => page.locator('[data-options] button').filter({hasText: new RegExp('^' + text + '$')});

  try {
    await page.goto(base + '/play-app/');
    await page.evaluate(() => {
      localStorage.setItem('fudool-profiles-v1', JSON.stringify([
        {id: 'p-older', name: 'Older', avatar: 'robot', age: '8-10'},
        {id: 'p-younger', name: 'Younger', avatar: 'lumaa', age: '3-5'},
      ]));
      localStorage.setItem('fudool-active-profile-v1', 'p-older');
    });
    await page.goto(base + '/games/?age=8-10');
    const suggested = page.locator('.age-journey-card');
    assert.equal(await suggested.count(), 13);
    for (const id of ['vowel-drive','letter-match','letter-hunt','english-abc','word-factory','sound-quiz','healthy-hero']) {
      assert.equal(await suggested.locator('xpath=self::*[@data-game-id="' + id + '"]').count(), 0);
    }
    const ageLink = suggested.filter({has: page.locator('a[href*="/games/robo-lab/"]')}).locator('a');
    const target = new URL(await ageLink.getAttribute('href'));
    assert.equal(target.searchParams.get('path'), '8-10');
    assert.equal(target.searchParams.get('level'), '11');
    await ageLink.click();
    await expectRound(11, 1);
    await page.locator('[data-game] [data-level-menu]').click();
    await expectPlay(11, '8-10');
    assert.deepEqual(await map.locator('.game-level').evaluateAll(items => items.map(item => +item.dataset.levelNumber)), [11,12,13,14,15]);
    assert(await levelButton(12).isDisabled());

    await play.click();
    const rounds = await page.locator('#game-data').evaluate(element => JSON.parse(element.textContent).levels[10].rounds);
    for (const question of rounds) {
      if (question.kind === 'ice-experiment') {
        await page.locator('.ice-cup[data-temperature="warm"] button').first().click();
        await page.locator('[data-ice-add="0"]').click();
        await page.locator('[data-ice-add="1"]').click();
        await page.locator('[data-ice-prediction="1"]').click();
        await page.locator('[data-ice-start]').click();
        await page.locator('.ice-conclusion button').nth(1).click();
      } else {
        await page.getByRole('button', {name: question.choices[question.answer], exact: true}).click();
      }
      await page.locator('[data-next]').click();
    }
    assert(await page.locator('[data-level-next]').isVisible());
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), progressKey);
    assert.deepEqual(saved.scores.slice(0, 11), [...Array(10).fill(0), 3]);
    await page.locator('[data-level-result] [data-level-menu]').click();
    await expectPlay(12, '8-10');
    await levelButton(12).click();
    await expectRound(12, 1);
    assert(await page.locator('.science-observations').isVisible());
    await page.locator('[data-game] [data-level-menu]').click();

    await ageButton('6-7').click();
    await expectPlay(3, '6-7');
    assert.equal(await levelButton(11).count(), 0);
    await page.reload();
    await expectPlay(3, '6-7');
    await play.click();
    await expectRound(3, 1);
    assert.match(await page.locator('[data-prompt]').textContent(), arabic ? /فنرى/ : /lets us see/);
    await answer(arabic ? 'حرارة' : 'Heat').click();
    assert.equal(await page.locator('[data-feedback]').getAttribute('data-state'), 'wrong');
    assert(await page.locator('[data-next]').isHidden());
    await answer(arabic ? 'ضوء' : 'Light').click();
    assert.equal(await page.locator('[data-feedback]').getAttribute('data-state'), 'correct');
    assert(await page.locator('[data-next]').isEnabled());

    await page.goto(lab + '?continue=1');
    await expectRound(3, 2);
    await page.goto(drive);
    await expectPlay(4, '6-7');
    assert.deepEqual(await choice.locator('[data-age-path]').evaluateAll(items => items.map(item => item.dataset.agePath)), ['3-5','6-7']);
    await page.goto(base + '/play-app/#v5-games');
    await page.locator('[data-app-age="8-10"]').click();
    assert(await page.locator('[data-app-games] [data-game-id="vowel-drive"]').isHidden());
    await page.locator('[data-app-games] [data-game-id="robo-lab"]').click();
    await expectPlay(12, '8-10');

    await page.evaluate(() => localStorage.setItem('fudool-active-profile-v1', 'p-younger'));
    await page.goto(lab);
    await expectPlay(1, '3-5');
    await play.click();
    await expectRound(1, 1);
    console.log('PASS V6.3 age filtering, science reasoning, unambiguous sun answer, unlocks and isolated progress', language);
  } finally {
    await page.close();
  }
}

async function validateMemory(browser, language) {
  const prefix = language === 'ar' ? '' : '/en';
  const page = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true});
  const game = origin + prefix + '/games/memory/';
  const grid = page.locator('[data-memory-phase]');
  const cards = grid.locator('.extra-memory-card');
  const next = page.locator('[data-next]');
  try {
    await page.goto(game + '?path=3-5&level=1');
    await grid.waitFor({state: 'visible'});
    assert.equal(await grid.getAttribute('data-memory-phase'), 'preview');
    assert.equal(await cards.count(), 4);
    for (const picture of await cards.locator('img').all()) {
      assert(await picture.isVisible());
      await picture.evaluate(image => image.decode());
    }
    assert(await next.isVisible() && await next.isDisabled());
    const images = await cards.evaluateAll(items => items.map(item => item.dataset.image));
    await page.locator('.memory-start').tap();
    assert.equal(await grid.getAttribute('data-memory-phase'), 'match');
    assert.equal(await cards.locator('img:visible').count(), 0);
    await cards.nth(0).tap();
    await cards.nth(images.findIndex(source => source !== images[0])).tap();
    await page.waitForFunction(() => !document.querySelector('.extra-memory-card.revealed'));
    assert(await next.isDisabled());
    for (const image of new Set(images)) {
      await cards.nth(images.indexOf(image)).tap();
      await cards.nth(images.lastIndexOf(image)).tap();
    }
    assert.equal(await grid.getAttribute('data-memory-phase'), 'complete');
    assert(await next.isVisible() && await next.isEnabled());
    await next.tap();
    assert.equal(await grid.getAttribute('data-memory-phase'), 'preview');
    assert.match(await page.locator('.game-progress').textContent(), /(?:الجولة|Round) 2 /);

    await page.goto(game + '?path=8-10&level=7');
    await grid.waitFor({state: 'visible'});
    assert.equal(await cards.count(), 16);
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('fudool-games-v1:memory'));
      state.scores[10] = 3;
      localStorage.setItem('fudool-games-v1:memory', JSON.stringify(state));
    });
    await page.goto(game + '?path=8-10&level=12');
    await grid.waitFor({state: 'visible'});
    assert.equal(await cards.count(), 24);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    console.log('PASS V6.3 memory preview, correct and incorrect pairs, Next and older decks', language);
  } finally {
    await page.close();
  }
}

async function waitForWritingBoard(page) {
  await page.waitForFunction(() => document.querySelector('.trace-metrics')?.textContent.includes('75%'));
}

async function verifyDictationAudio(page) {
  const audio = page.waitForResponse(response =>
    response.url().endsWith('/assets/tracing/arabic-words/jamal.mp3') && response.ok());
  await page.locator('.trace-listen').click();
  await audio;
  await page.waitForFunction(() => window.playedWritingWord);
  assert.equal(await page.locator('.trace-audio-status').textContent(), '');
}

function observeDictationAudio() {
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    this.addEventListener('playing', () => {
      if (this.currentSrc.endsWith('/arabic-words/jamal.mp3')) window.playedWritingWord = true;
    }, {once: true});
    return play.call(this);
  };
}

async function validateWriting(browser, language) {
  const mobile = language === 'ar';
  const page = await browser.newPage({
    viewport: {width: mobile ? 390 : 1280, height: 844},
    hasTouch: mobile,
    userAgent: mobile ? 'Mozilla/5.0 Mobile FudoolAndroidUnified' : undefined,
  });
  const session = mobile ? await page.context().newCDPSession(page) : null;
  const route = origin + (mobile ? '' : '/en') + '/games/trace/';
  const canvas = page.locator('.trace-ink');
  const check = page.locator('.trace-actions .button-primary');
  const next = page.locator('[data-next]');
  const metric = page.locator('.trace-metrics bdi');
  const score = async () => parseFloat(await metric.textContent());

  async function draw(strokes) {
    await canvas.scrollIntoViewIfNeeded();
    const rect = await canvas.boundingBox();
    for (const stroke of strokes) {
      const points = stroke.map(([x, y]) => ({x: rect.x + x * rect.width / 600, y: rect.y + y * rect.height / 320}));
      if (session) {
        await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [points[0]]});
        for (const point of points.slice(1)) {
          await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [point]});
        }
        await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      } else {
        await page.mouse.move(points[0].x, points[0].y);
        await page.mouse.down();
        for (const point of points.slice(1)) await page.mouse.move(point.x, point.y);
        await page.mouse.up();
      }
    }
    assert(await check.isEnabled());
    await check.click();
  }

  try {
    await page.addInitScript(observeDictationAudio);
    await page.goto(route);
    const map = page.locator('[data-level-map]');
    await map.locator('[data-age-path="3-5"]').click();
    await map.locator('[data-path-play]').click();
    await waitForWritingBoard(page);
    assert(await page.locator('.trace-model').isVisible());
    assert(await check.isDisabled());

    const thresholds = await page.evaluate(async () => {
      const {traceGrade} = await import('/assets/trace-assessment.js?v=2');
      return [traceGrade(.749, 1), traceGrade(.75, 1), traceGrade(.751, 1), traceGrade(1, .751)];
    });
    assert.deepEqual(thresholds, [
      {percent: 74.9, pass: false}, {percent: 75, pass: false},
      {percent: 75.1, pass: true}, {percent: 75.1, pass: true},
    ]);

    // Stop tracing the first alif early to exercise a passing result close to the cutoff.
    const alif = [[294, 42], [308, 79], [307, 102], [304, 123], [306, 145], [305, 165], [309, 187], [310, 261]];
    await draw([alif.slice(0, -2)]);
    assert(await score() < 75);
    assert(await next.isHidden());
    await page.locator('.trace-actions .button-white').last().click();
    await draw([alif]);
    const traced = await score();
    assert(traced > 75 && traced < 80, 'A sufficiently accurate alif must pass: ' + traced);
    assert(await next.isVisible());
    await next.click();
    assert.match(await page.locator('.game-progress').textContent(), /(?:الجولة|Round) 2 /);

    await page.locator('[data-game] [data-level-menu]').click();
    await map.locator('[data-age-path="8-10"]').click();
    assert.deepEqual(await map.locator('[data-level-number]').evaluateAll(items =>
      items.map(button => +button.dataset.levelNumber)), [11, 12, 13]);
    await map.locator('[data-path-play]').click();
    await waitForWritingBoard(page);
    assert.match(await page.locator('.game-progress').textContent(), / 11 · /);
    const writingBoard = page.locator('.trace-word-board');
    assert(await writingBoard.isVisible());
    const line = await writingBoard.evaluate(board => getComputedStyle(board, '::before').borderTopWidth);
    assert.equal(line, '2px');
    assert.equal(await page.locator('.trace-model').count(), 0);
    assert.doesNotMatch(await page.locator('[data-game]').textContent(), /جمل/);
    await verifyDictationAudio(page);

    await draw([[[40, 60], [500, 240], [520, 90], [60, 280]]]);
    assert(await score() <= 75);
    assert(await next.isHidden());
    await page.locator('.trace-actions .button-white').last().click();

    // Hand-positioned strokes for جمل, shifted and reduced to a realistic handwriting size.
    const handwriting = [
      [[366, 146], [373, 138], [388, 134], [411, 140], [438, 157], [467, 173], [487, 173],
        [460, 176], [438, 183], [414, 194], [391, 200], [352, 203], [330, 200]],
      [[330, 200], [316, 188], [306, 160], [296, 139], [281, 139], [264, 153],
        [252, 174], [257, 188], [284, 200], [311, 203]],
      [[252, 193], [234, 202], [215, 197]],
      [[197, 51], [199, 87], [205, 133], [211, 178], [214, 217], [203, 236], [183, 253],
        [166, 262], [139, 267], [122, 261], [111, 249], [105, 226], [108, 207]],
    ].map(stroke => stroke.map(([x, y]) => [x * .67 + 64, y * .68 + 33]));
    await draw(handwriting);
    const missingDot = await score();
    assert(missingDot <= 75, 'The word shape without the dot must be retried: ' + missingDot);
    assert(await next.isHidden());
    await draw([[[352, 198], [358, 198]]]);
    const wordScore = await score();
    assert(wordScore > 75, 'Properly placed Arabic handwriting must pass: ' + wordScore);
    assert(await next.isVisible());
    assert.match(await page.locator('.trace-tip').textContent(), /جمل/);
    await next.click();
    await waitForWritingBoard(page);
    assert.match(await page.locator('.game-progress').textContent(), /(?:الجولة|Round) 2 /);
    assert.doesNotMatch(await page.locator('[data-game]').textContent(), /قمر/);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await page.screenshot({path: 'build/v6-screenshots/writing-' + language + '.png'});
    console.log('PASS writing', language, mobile ? 'touch' : 'mouse', 'guide, threshold, Arabic dictation, retry and Next');
  } finally {
    await page.close();
  }
}

async function validateOffline(browser) {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  const page = await context.newPage();
  await page.addInitScript(observeDictationAudio);
  await page.goto(origin + '/play-app/');
  const count = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const channel = new MessageChannel();
    return await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(Error('Offline pack download timed out')), 90_000);
      channel.port1.onmessage = ({data}) => {
        if (data.type !== 'done' && data.type !== 'error') return;
        clearTimeout(deadline);
        channel.port1.close();
        if (data.type === 'done') resolve(data.info.files);
        else reject(Error(data.message));
      };
      registration.active.postMessage({type: 'download'}, [channel.port2]);
    });
  });
  assert.equal(count, JSON.parse(fs.readFileSync('offline-pack.json', 'utf8')).files.length);
  await context.setOffline(true);
  await page.reload();
  await page.locator('.v5-nav a[href="#v5-games"]').click();
  assert.equal(await page.locator('[data-app-games] .world-cover-scene').count(), 20);
  await page.locator('a.app-game-card[data-game-id="vowel-drive"]').click();
  await page.locator('.world-trail .game-level').first().click();
  const gate = page.locator('.drive-gate[data-vowel="0"]');
  const actualVowel = await page.evaluate(() => JSON.parse(document.querySelector('#drive-data').textContent).levels[0].rounds[0].vowel);
  assert.equal(actualVowel, 0);
  await gate.click();
  await page.locator('[data-drive-feedback][data-state="correct"]').waitFor();
  await page.locator('[data-drive-next]').click();
  assert(await page.locator('.game-progress').textContent().then(label => label.includes('الجولة 2')));
  await page.locator('.world-play-scenery').evaluate(image => image.decode());
  await page.screenshot({path: 'build/v6-screenshots/vowel-drive-offline.png'});
  await validateRobo(page, 'ar');
  await page.evaluate(() => localStorage.setItem('fudool-age-journey-v1', '"8-10"'));
  await page.goto(origin + '/games/robo-lab/');
  await page.locator('[data-path-play]').click();
  assert.match(await page.locator('[data-game] .game-progress').textContent(), /المستوى 11 ·/);
  await page.goto(origin + '/games/trace/?path=8-10&level=11');
  await waitForWritingBoard(page);
  await verifyDictationAudio(page);
  await context.close();
  console.log('PASS offline games, experiments, age-based entry and Arabic dictation audio');
}

(async () => {
  let browser;
  try {
    assert.equal(Object.keys(games).length, 20);
    assert.equal(Object.values(games).reduce((total, count) => total + count, 0), 306);
    for (let i = 0; i < 30; i++) {
      try {
        if ((await fetch(origin)).ok) break;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    fs.mkdirSync('build/v6-screenshots', {recursive: true});
    browser = await chromium.launch({headless: true, executablePath: process.env.FUDOOL_CHROMIUM});
    for (const language of ['ar', 'en']) {
      await validateAgePaths(browser, language);
      await validateMemory(browser, language);
      await validateWriting(browser, language);
      await validateDriving(browser, language);
      const labPage = await browser.newPage({
        viewport: {width: language === 'ar' ? 390 : 1280, height: 844},
        userAgent: language === 'ar' ? 'Mozilla/5.0 Mobile FudoolAndroidUnified' : undefined,
      });
      try {
        await validateRobo(labPage, language);
        console.log('PASS V6.1 Robo experiments', language);
      } finally {
        await labPage.close();
      }
      await validateHomeCovers(browser, language, 390);
      await validateHomeCovers(browser, language, 1298);
      await validateMaps(browser, language, 390);
      await validateMaps(browser, language, 1280);
    }
    await validateOffline(browser);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
