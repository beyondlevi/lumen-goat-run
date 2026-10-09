// Plays the built game in a real browser with the band's keys and saves a screenshot of each
// screen to .e2e-output/. Run after `npm run package` (or a build): node tests/e2e/run.mjs.
// CHROME_PATH=/path/to/chrome uses an installed Chrome instead of Playwright's Chromium;
// E2E_BROWSERS=chromium,firefox picks the engines (default: chromium, plus firefox if installed).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium, firefox} from 'playwright';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dist = path.join(root, 'dist');
const out = path.join(root, '.e2e-output');
fs.mkdirSync(out, {recursive: true});

const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain'};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(dist, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream'}).end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
}

// The palette's text roles: text, sub, hint, accent. Nothing dimmer.
const TEXT_COLORS = ['#E2FFEE', '#B8FFD6', '#8DF0B5', '#F0FFF6'];

async function playIn(browser, name, lang) {
  const context = await browser.newContext({viewport: {width: 600, height: 600}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  const external = [];
  page.on('request', (r) => { if (!r.url().startsWith(base)) external.push(r.url()); });

  const tag = lang === 'en' ? name : `${name}-pt`;
  const t = (label) => `${tag}: ${label}`;
  const url = `${base}?test=1&seed=42&lang=${lang === 'en' ? 'en' : 'pt-PT'}`;
  const ready = async () => {
    await page.waitForFunction(() => window.__goatrun && document.fonts.status === 'loaded' && document.fonts.check('20px Bungee'));
    await page.evaluate(() => window.__goatrun.manual(true));
    await page.waitForTimeout(200);
  };
  const state = () => page.evaluate(() => window.__goatrun.state());
  const shot = async (file) => {
    await page.waitForTimeout(120);
    await page.screenshot({path: path.join(out, `${tag}-${file}.png`)});
  };
  const key = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(40); };
  const step = (seconds) => page.evaluate((s) => window.__goatrun.step(s), seconds);
  // Lumen's Back: an Escape keydown and keyup sent to the focused element. True if the page took it.
  const back = () => page.evaluate(() => {
    const target = document.activeElement ?? document.body;
    const init = {key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true};
    const down = new KeyboardEvent('keydown', init);
    target.dispatchEvent(down);
    target.dispatchEvent(new KeyboardEvent('keyup', init));
    return down.defaultPrevented;
  });
  /** Texts under 14 px, in a dim color, faded, off the 600 x 600 screen or out of their box. */
  const checkTexts = async (label) => {
    await page.waitForTimeout(60);
    const problems = await page.evaluate((colors) => {
      const list = [];
      for (const e of window.__goatrun.texts()) {
        const where = `"${e.text}"`;
        if (e.size < 14) list.push(`${where} ${e.size} px`);
        if (!colors.includes(e.color.toUpperCase())) list.push(`${where} color ${e.color}`);
        if (e.alpha < 0.99) list.push(`${where} faded ${e.alpha.toFixed(2)}`);
        if (e.left < 0 || e.right > 600 || e.top < 0 || e.bottom > 600) list.push(`${where} off screen ${Math.round(e.left)},${Math.round(e.top)},${Math.round(e.right)},${Math.round(e.bottom)}`);
        const box = e.within;
        if (box && (e.left < box.left - 1 || e.right > box.right + 1 || e.top < box.top - 1 || e.bottom > box.bottom + 1)) {
          list.push(`${where} out of its box ${Math.round(e.left)}..${Math.round(e.right)} in ${Math.round(box.left)}..${Math.round(box.right)}`);
        }
      }
      return list;
    }, TEXT_COLORS);
    const count = await page.evaluate(() => window.__goatrun.texts().length);
    check(t(`${label}: ${count} texts, >= 14 px, bright, inside the screen and their boxes`), problems.length === 0 && count > 0, problems.join('; '));
  };
  /** Draws a frame with the canvas reset (as after Gecko's GPU process restarts) and checks the scale comes back. */
  const checkReset = async (label) => {
    await page.evaluate(() => document.getElementById('game').getContext('2d').setTransform(1, 0, 0, 1, 0, 0));
    await page.waitForTimeout(150);
    const scale = await page.evaluate(() => {
      const canvas = document.getElementById('game');
      return {now: canvas.getContext('2d').getTransform().a, expected: canvas.width / 600};
    });
    check(t(`${label}: a reset canvas is drawn at its scale again`), Math.abs(scale.now - scale.expected) < 1e-6, `${scale.now} vs ${scale.expected}`);
  };
  /** Clears the track around the goat and puts the given rows, clovers and ice, in meters ahead of it. */
  const stage = (scene) => page.evaluate((s) => {
    const {game} = window.__goatrun;
    const z = game.goat.z + (s.shift ?? 0);
    game.track.clear(game.goat.z - 20, game.goat.z + (s.clearTo ?? 60));
    for (const [ahead, pattern, kinds] of s.rows ?? []) game.track.place(z + ahead, pattern, kinds);
    for (const [lane, ahead, lift] of s.clovers ?? []) game.track.clovers.push({lane, z: z + ahead, lift: lift ?? 0, taken: false});
    for (const [lane, from, to] of s.ice ?? []) game.track.ice.push({lane, from: z + from, to: z + to});
    if (s.count !== undefined) game.clovers = s.count;
  }, scene);
  /** Meters ahead for a depth of the design's boards (5 m per unit of depth). */
  const at = (d) => (d - 1) * 5;

  // ---- The title, with a best kept from before ----
  await page.goto(url);
  await page.waitForFunction(() => window.__goatrun);
  await page.evaluate(() => localStorage.setItem('goat-run.best', JSON.stringify({best: 1842, zone: 3})));
  await page.reload();
  await ready();
  let s = await state();
  check(t('the title, with the best kept on the device'), s.screen === 'title' && s.best === 1842 && s.bestZone === 3, JSON.stringify(s));
  const box = await page.evaluate(() => document.getElementById('game').getBoundingClientRect().toJSON());
  check(t('the game fits 600 x 600'), box.left >= 0 && box.top >= 0 && box.right <= 600 && box.bottom <= 600 && box.width === 600 && box.height === 600, JSON.stringify(box));
  await checkTexts('title');
  await shot('01-title');
  await checkReset('title');
  check(t('Escape on the title is not prevented (Lumen closes the app)'), (await back()) === false && (await state()).screen === 'title');

  // ---- How to play ----
  await key('Enter');
  check(t('Enter opens how to play'), (await state()).screen === 'howto');
  await checkTexts('how to play');
  await shot('02-howto');
  check(t('Escape in how to play is prevented and goes back'), (await back()) === true && (await state()).screen === 'title');
  await key('Enter');
  await key('Enter');
  check(t('Enter goes back too'), (await state()).screen === 'title');

  // ---- The run, in the meadow (the design's Meadow board) ----
  await key('ArrowUp');
  check(t('swipe up starts a run'), (await state()).screen === 'playing');
  await key('Enter');
  check(t('Enter does nothing in a run'), (await state()).screen === 'playing');
  await page.evaluate(() => window.__goatrun.warp(124));
  await stage({rows: [[at(1.75), '.L.', [null, 'rock', null]], [at(3.6), 'T..', ['boulder', null, null]], [at(6.5), '.L.', [null, 'fence', null]]], clovers: [1.35, 1.8, 2.25, 2.7, 3.15].map((d) => [2, at(d)]), count: 7});
  await step(0);
  s = await state();
  check(t('the meadow, zone 1, the controls hint'), s.screen === 'playing' && s.zone === 1 && s.meters === 124);
  await checkTexts('meadow');
  await shot('03-meadow');
  await checkReset('a run');

  // ---- A jump over a rock (the design's Jump board) ----
  await page.evaluate(() => window.__goatrun.warp(318));
  const apex = await page.evaluate(() => window.__goatrun.game.speed * 0.35);
  await stage({shift: apex, rows: [[0, '.L.', [null, 'rock', null]], [at(2.6), 'L..', ['fence', null, null]], [at(4.2), '..T', [null, null, 'boulder']]], clovers: [[1, -0.3, 62], ...[2.7, 3.2, 3.7].map((d) => [1, at(d)])], count: 18});
  await key('ArrowUp');
  await step(0.35);
  s = await state();
  check(t('swipe up: the goat jumps over the rock'), s.airborne && s.h > 50 && s.screen === 'playing', `h ${s.h.toFixed(1)}`);
  check(t('a floating clover is picked up mid-jump'), s.clovers === 19, `${s.clovers}`);
  await shot('04-jump');
  await step(0.8);
  s = await state();
  check(t('the jump cleared the rock'), s.screen === 'playing' && !s.airborne);

  // ---- Zone 2: the banner (ZoneUp board) ----
  await page.evaluate(() => window.__goatrun.warp(496));
  await stage({rows: [], clovers: [1.25, 1.5, 1.75, 2.0].map((d) => [0, at(d) + 4]), count: 21, clearTo: 70});
  await step(0.6);
  s = await state();
  check(t('500 m: zone 2, the forest, with its banner'), s.zone === 2 && s.banner, JSON.stringify(s));
  await checkTexts('zone banner');
  await shot('05-zone');

  // ---- The forest: a slide under a low branch (Forest board) ----
  await page.evaluate(() => window.__goatrun.warp(742));
  const under = await page.evaluate(() => window.__goatrun.game.speed * 0.3);
  await stage({shift: under, rows: [[0, '.H.'], [at(2.1), 'T..', ['pine', null, null]], [at(3.6), '..H'], [at(5.0), '.L.', [null, 'fence', null]]], clovers: [1.4, 1.85, 2.3].map((d) => [2, at(d)]), count: 26});
  await key('ArrowDown');
  await step(0.3);
  s = await state();
  check(t('swipe down: the goat slides under the branch'), s.sliding && s.screen === 'playing');
  await checkTexts('forest');
  await shot('06-forest');
  await step(0.8);
  check(t('the slide cleared the branch'), (await state()).screen === 'playing');

  // ---- Zone 3: the snow's banner (not in the design: its art is an ice patch and a crossed-out lane change) ----
  await page.evaluate(() => window.__goatrun.warp(1196));
  await stage({rows: [], clearTo: 70});
  await step(0.6);
  s = await state();
  check(t('1,200 m: zone 3, the snow, with its banner'), s.zone === 3 && s.banner, JSON.stringify(s));
  await checkTexts('snow banner');
  await shot('07-zone-snow');

  // ---- Snow, fast, with ice in the open lane (Snow board) ----
  await page.evaluate(() => window.__goatrun.warp(1430));
  await key('ArrowRight');
  await step(0.4);
  await stage({rows: [[at(2.7), 'TT.', ['boulder', 'pine', null]], [at(6.0), '..H']], clovers: [2.5, 2.95, 3.4].map((d) => [2, at(d)]), ice: [[2, at(1.55), at(2.2)]], count: 31});
  await step(1 / 60);
  s = await state();
  check(t('zone 3, the snow: the ice tip shows'), s.zone === 3 && s.iceTip && s.lane === 2, JSON.stringify(s));
  await checkTexts('snow');
  await shot('08-snow');
  await step(0.2);
  s = await state();
  check(t('the goat is on the ice'), s.onIce, JSON.stringify(s));
  await key('ArrowLeft');
  await step(0.05);
  s = await state();
  check(t('on ice, swipe left does not change lanes'), s.onIce && s.lane === 2 && s.target === 2 && s.screen === 'playing', JSON.stringify(s));

  // ---- Pause ----
  check(t('Escape in a run is prevented and pauses'), (await back()) === true && (await state()).screen === 'paused');
  await checkTexts('pause');
  await shot('09-paused');
  const z = await page.evaluate(() => window.__goatrun.game.goat.z);
  await step(0.5);
  check(t('nothing moves while paused'), (await page.evaluate(() => window.__goatrun.game.goat.z)) === z);
  await key('Enter');
  check(t('Enter resumes'), (await state()).screen === 'playing');
  await back();
  await key('ArrowUp');
  check(t('swipe up resumes too'), (await state()).screen === 'playing');

  // ---- Game over: a branch, at 2,104 m, a new best (GameOver board) ----
  await page.evaluate(() => window.__goatrun.warp(2100));
  await stage({rows: [[4, 'HHH']], count: 38});
  await step(0.6);
  s = await state();
  check(t('running into a low branch ends the run, with a new best'), s.screen === 'over' && s.crash === 'branch' && s.record && s.best === s.meters && s.meters > 2100, JSON.stringify(s));
  await step(0.7);
  await checkTexts('game over');
  await shot('10-over');
  // Every obstacle's line fits, with and without a new best.
  for (const kind of ['rock', 'fence', 'boulder', 'pine', 'branch']) {
    for (const record of [false, true]) {
      await page.evaluate(([k, r]) => {
        const {game} = window.__goatrun;
        game.crash = {kind: k, zone: game.crash.zone};
        game.previousBest = r ? 1842 : 99999;
        window.__goatrun.step(0);
      }, [kind, record]);
      await checkTexts(`game over, hit by a ${kind}${record ? ', a new best' : ''}`);
    }
  }
  check(t('Escape on the game over is prevented and goes to the title'), (await back()) === true && (await state()).screen === 'title');
  check(t('then Escape on the title is Lumen\'s'), (await back()) === false);
  const best = s.best;
  await page.reload();
  await ready();
  check(t('the best is kept after a reload'), (await state()).best === best, `${(await state()).best} vs ${best}`);

  // ---- The best of a run quit from the pause, or hidden, is kept ----
  await key('ArrowUp');
  await page.evaluate(() => window.__goatrun.warp(2500));
  await back();
  await back();
  s = await state();
  check(t('a run quit from the pause keeps its distance as the best'), s.screen === 'title' && s.best === 2500, JSON.stringify(s));
  await key('ArrowUp');
  await page.evaluate(() => window.__goatrun.warp(2600));
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {value: true, configurable: true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  s = await state();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('goat-run.best')));
  check(t('hidden: the run pauses and its distance is stored'), s.screen === 'paused' && stored.best === 2600 && stored.zone === 3, JSON.stringify(stored));
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {value: false, configurable: true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(150);
  await checkReset('back on screen');

  check(t('no page errors'), errors.length === 0, errors.join(' | '));
  check(t('nothing loaded from outside the package'), external.length === 0, external.join(', '));
  await context.close();
}

async function play(browserType, name) {
  const browser = await browserType.launch(process.env.CHROME_PATH && name === 'chromium' ? {executablePath: process.env.CHROME_PATH} : {});
  try {
    for (const lang of ['en', 'pt']) await playIn(browser, name, lang);
  } finally {
    await browser.close();
  }
}

const wanted = (process.env.E2E_BROWSERS ?? 'chromium,firefox').split(',');
const engines = {chromium, firefox};
for (const name of wanted) {
  try {
    await play(engines[name], name);
  } catch (error) {
    if (name === 'firefox' && !process.env.E2E_BROWSERS && /Executable doesn't exist/.test(String(error))) {
      console.log('skip firefox (not installed)');
      continue;
    }
    console.log(`FAIL ${name}: ${error.message}`);
    failures++;
  }
}
server.close();
console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
