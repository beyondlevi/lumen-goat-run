import {Game, type Store} from './game';
import {languageFor, numberFormat, stringsFor} from './i18n';
import {SIZE, render, textLog} from './render';

const BEST_KEY = 'goat-run.best';

/** The best run, kept on the device (each Lumen app has its own origin and storage). */
const store: Store = {
  get() {
    try {
      const saved = JSON.parse(localStorage.getItem(BEST_KEY) ?? 'null') as {best?: number; zone?: number} | null;
      return {best: Math.max(0, Math.floor(Number(saved?.best) || 0)), zone: Math.min(3, Math.max(1, Number(saved?.zone) || 1))};
    } catch {
      return {best: 0, zone: 1};
    }
  },
  set(best, zone) {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify({best, zone}));
    } catch {
      // Private mode or full storage: the best lasts for this session.
    }
  },
};

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || (Date.now() & 0x7fffffff);
const language = languageFor(params.get('lang') ?? navigator.language);
const strings = stringsFor(language);
const num = numberFormat(language);
document.documentElement.lang = language === 'pt' ? 'pt-BR' : 'en';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', {alpha: false})!;
const game = new Game(seed, store);

/** Canvas pixels per CSS px of the 600 x 600 screen, set by [fit]. */
let pixels = 1;

/** The 600 x 600 screen (Lumen's web app square), shrunk to fit a smaller window. */
function fit(): void {
  const scale = Math.min(1, innerWidth / SIZE, innerHeight / SIZE) || 1;
  const dpr = devicePixelRatio || 1;
  canvas.style.width = `${Math.floor(SIZE * scale)}px`;
  canvas.style.height = `${Math.floor(SIZE * scale)}px`;
  canvas.width = Math.floor(SIZE * scale * dpr);
  canvas.height = Math.floor(SIZE * scale * dpr);
  pixels = canvas.width / SIZE;
}

/**
 * Draws a frame, setting the scale every time: when the glasses sleep, Android may kill Gecko's
 * GPU process, and the canvas comes back with its state reset. A scale set once would be lost then,
 * and the game drawn at 1:1, cut at the right and the bottom.
 */
function draw(): void {
  ctx.setTransform(pixels, 0, 0, pixels, 0, 0);
  render(ctx, game, strings, num, clock);
}

addEventListener('resize', fit);
canvas.addEventListener('contextrestored', () => {
  fit();
  draw();
});
fit();

// The band arrives as keys: swipes are arrows, the index tap is Enter, the middle tap is Escape
// (Lumen's Back). Escape is prevented only when the game used it: on the title it goes through,
// and Lumen closes the app.
addEventListener('keydown', (event) => {
  if (event.repeat) {
    if (event.key === 'Escape' && game.screen !== 'title') event.preventDefault();
    return;
  }
  if (game.key(event.key)) event.preventDefault();
});

let last = performance.now();
let clock = 0;
let frame = 0;
/** Test hook: the game only moves through step(). */
let manual = false;

function loop(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!manual) {
    clock += dt;
    game.update(dt);
  }
  draw();
  frame = requestAnimationFrame(loop);
}

// Hidden (another app in front, the display off): the page is suspended. A run waits paused, its
// distance already kept; nothing draws. Back on screen, the canvas is fitted again.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.hidden();
    cancelAnimationFrame(frame);
  } else {
    fit();
    last = performance.now();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(loop);
  }
});
addEventListener('pagehide', () => game.hidden());

async function start(): Promise<void> {
  const fonts = [
    new FontFace('Bungee', 'url(fonts/Bungee-Regular-latin.woff2)'),
    new FontFace('Chakra Petch', 'url(fonts/ChakraPetch-SemiBold-latin.woff2)', {weight: '500 600'}),
    new FontFace('Chakra Petch', 'url(fonts/ChakraPetch-Bold-latin.woff2)', {weight: '700'}),
  ];
  await Promise.all(fonts.map(async (font) => {
    try {
      document.fonts.add(await font.load());
    } catch {
      // A font that doesn't load falls back to the system's.
    }
  }));
  canvas.focus();
  last = performance.now();
  frame = requestAnimationFrame(loop);
}

// The e2e test's hook, only with ?test=1.
if (params.get('test') === '1') {
  textLog.on = true;
  (window as unknown as {__goatrun: unknown}).__goatrun = {
    game,
    state: () => ({
      screen: game.screen,
      meters: game.meters,
      zone: game.zone.number,
      lane: game.goat.lane,
      target: game.goat.target,
      h: game.goat.h,
      airborne: game.airborne,
      sliding: game.sliding,
      onIce: game.onIce(),
      clovers: game.clovers,
      best: game.best,
      bestZone: game.bestZone,
      record: game.record,
      crash: game.crash?.kind ?? null,
      banner: game.bannerShowing,
      iceTip: game.iceTipAt !== null,
    }),
    /** Runs the game [seconds] in 1/60 s frames (whatever the screen) and draws. */
    step: (seconds: number) => {
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        clock += 1 / 60;
        game.update(1 / 60);
      }
      draw();
    },
    warp: (meters: number) => {
      game.warp(meters);
      draw();
    },
    /** With true, the game stands still between step() calls (the frames still draw). */
    manual: (on: boolean) => {
      manual = on;
    },
    /** The texts the last frame drew. */
    texts: () => textLog.entries,
  };
}

void start();
