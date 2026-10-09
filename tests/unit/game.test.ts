import {describe, expect, it} from 'vitest';
import {BUFFER, Game, HINT_UNTIL, JUMP_TIME, SLIDE_TIME, type Store} from '../../src/game';
import {BANNER_TIME} from '../../src/track';
import {speedAt} from '../../src/zones';
import {runBot} from './bot';

function memoryStore(best = 0, zone = 1): Store & {saved: {best: number; zone: number}} {
  const store = {
    saved: {best, zone},
    get: () => store.saved,
    set: (b: number, z: number) => {
      store.saved = {best: b, zone: z};
    },
  };
  return store;
}

/** A game running at [meters] with nothing on the track but what the test puts there. */
function emptyRun(meters = 100, seed = 1): Game {
  const game = new Game(seed, memoryStore());
  game.key('ArrowUp');
  game.warp(meters);
  game.track.clear(0, 1e9);
  return game;
}

/** Runs [seconds] in 1/60 s frames, keeping the track empty ahead (nothing new comes). */
function run(game: Game, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60) && game.screen === 'playing'; i++) {
    game.update(1 / 60);
    game.track.rows = game.track.rows.filter((r) => staged.has(r));
    game.track.ice = game.track.ice.filter((i) => stagedIce.has(i));
    game.track.clovers = game.track.clovers.filter((c) => stagedClovers.has(c));
  }
}
const staged = new Set<object>();
const stagedIce = new Set<object>();
const stagedClovers = new Set<object>();

/** Puts a row [ahead] seconds in front of the goat. */
function row(game: Game, ahead: number, pattern: string) {
  const r = game.track.place(game.goat.z + ahead * game.speed, pattern);
  staged.add(r);
  return r;
}

describe('collisions', () => {
  it('a rock: running into it crashes, a jump clears it', () => {
    let game = emptyRun();
    row(game, 1, '.L.');
    run(game, 1.5);
    expect(game.screen).toBe('over');
    expect(game.crash?.kind).toMatch(/rock|fence/);

    game = emptyRun();
    row(game, 1, '.L.');
    run(game, 1 - JUMP_TIME / 2);
    game.key('ArrowUp');
    run(game, 1.5);
    expect(game.screen).toBe('playing');
  });

  it('a jump clears a low obstacle anywhere in a wide window (room for the band\'s latency)', () => {
    let cleared = 0;
    for (let early = 0; early <= 0.6; early += 0.02) {
      const game = emptyRun();
      row(game, 1, 'LLL');
      run(game, 1 - early);
      game.key('ArrowUp');
      run(game, 1.5);
      if (game.screen === 'playing') cleared++;
    }
    // More than 0.4 s of the window works: a gesture may arrive anywhere within the band's latency.
    expect(cleared * 0.02).toBeGreaterThan(0.4);
  });

  it('a low branch: running or jumping into it crashes, a slide clears it', () => {
    let game = emptyRun(700);
    row(game, 1, 'HHH');
    run(game, 1.5);
    expect(game.screen).toBe('over');
    expect(game.crash?.kind).toBe('branch');

    game = emptyRun(700);
    row(game, 1, 'HHH');
    run(game, 0.8);
    game.key('ArrowUp');
    run(game, 1);
    expect(game.screen).toBe('over');

    game = emptyRun(700);
    row(game, 1, 'HHH');
    run(game, 0.8);
    game.key('ArrowDown');
    run(game, 1.5);
    expect(game.screen).toBe('playing');
    expect(game.goat.slideUntil).toBeGreaterThan(0);
  });

  it('a swipe down mid-air drops the goat into a slide', () => {
    const game = emptyRun(700);
    row(game, 0.7, 'HHH');
    game.key('ArrowUp');
    run(game, 0.15);
    expect(game.airborne).toBe(true);
    game.key('ArrowDown');
    run(game, 0.15);
    expect(game.sliding).toBe(true);
    run(game, 1.5);
    expect(game.screen).toBe('playing');
  });

  it('a boulder or a tree blocks its lane: jumping or sliding doesn\'t help, a lane change does', () => {
    for (const key of ['ArrowUp', 'ArrowDown']) {
      const game = emptyRun(700);
      row(game, 1, 'TTT');
      run(game, 0.75);
      game.key(key);
      run(game, 1);
      expect(game.screen).toBe('over');
      expect(game.crash?.kind).toMatch(/boulder|pine/);
    }
    const game = emptyRun(700);
    row(game, 1, 'TT.');
    // The tall ones are in lanes 0 and 1: from the middle lane, one swipe right.
    game.key('ArrowRight');
    run(game, 1.5);
    expect(game.screen).toBe('playing');
    expect(game.goat.lane).toBe(2);
  });

  it('changes lanes in 0.15 s, one lane per swipe, not past the edges', () => {
    const game = emptyRun();
    game.key('ArrowLeft');
    run(game, 0.08);
    expect(game.goat.lane).toBeGreaterThan(0);
    expect(game.goat.lane).toBeLessThan(1);
    run(game, 0.1);
    expect(game.goat.lane).toBe(0);
    game.key('ArrowLeft');
    run(game, 0.2);
    expect(game.goat.lane).toBe(0);
    game.key('ArrowRight');
    game.key('ArrowRight');
    run(game, 0.35);
    expect(game.goat.lane).toBe(2);
  });
});

describe('ice', () => {
  function onIce(): Game {
    const game = emptyRun(1500);
    const patch = {lane: 1, from: game.goat.z - 1, to: game.goat.z + 2 * game.speed};
    game.track.ice.push(patch);
    stagedIce.add(patch);
    run(game, 0.1);
    expect(game.onIce()).toBe(true);
    return game;
  }

  it('forbids lane changes while the goat is on it', () => {
    const game = onIce();
    game.key('ArrowLeft');
    run(game, 0.3);
    expect(game.goat.lane).toBe(1);
    game.key('ArrowRight');
    run(game, 0.3);
    expect(game.goat.lane).toBe(1);
  });

  it('still lets the goat jump and slide', () => {
    const game = onIce();
    game.key('ArrowUp');
    run(game, 0.1);
    expect(game.airborne).toBe(true);
    run(game, JUMP_TIME);
    game.key('ArrowDown');
    run(game, 0.05);
    expect(game.sliding).toBe(true);
  });

  it('takes a lane change asked for just before the ice ends', () => {
    const game = onIce();
    // The ice ends 2 s after it started: ask 0.1 s before.
    run(game, 2 - 0.1 - 0.1);
    game.key('ArrowLeft');
    run(game, 0.5);
    expect(game.goat.lane).toBe(0);
  });
});

describe('the early-gesture buffer', () => {
  it('jumps again on landing when up came just before it, not when it came too early', () => {
    let game = emptyRun();
    game.key('ArrowUp');
    run(game, JUMP_TIME - BUFFER + 0.05);
    game.key('ArrowUp');
    run(game, BUFFER);
    expect(game.airborne).toBe(true);

    game = emptyRun();
    game.key('ArrowUp');
    run(game, 0.15);
    game.key('ArrowUp');
    run(game, JUMP_TIME - 0.15 + 0.1);
    expect(game.airborne).toBe(false);
  });
});

describe('zones', () => {
  it('get faster at 500 m and 1,200 m, with the banner, and the HUD hint goes', () => {
    const game = emptyRun(490);
    expect(game.zone.key).toBe('meadow');
    expect(game.meters).toBeGreaterThan(HINT_UNTIL);
    const before = game.speed;
    run(game, 1.5);
    expect(game.zone.key).toBe('forest');
    expect(game.speed).toBeGreaterThan(before);
    expect(game.bannerShowing).toBe(true);
    run(game, BANNER_TIME);
    expect(game.bannerShowing).toBe(false);

    game.warp(1190);
    game.track.clear(0, 1e9);
    run(game, 1.5);
    expect(game.zone.key).toBe('snow');
    expect(game.bannerShowing).toBe(true);
    expect(game.speed).toBeGreaterThanOrEqual(speedAt(1200));
  });
});

describe('clovers', () => {
  it('counts the ones in the goat\'s lane, floating ones on a jump too', () => {
    const game = emptyRun();
    const z = game.goat.z;
    const clovers = [
      {lane: 1, z: z + 5, lift: 0, taken: false},
      {lane: 1, z: z + 8, lift: 0, taken: false},
      {lane: 0, z: z + 9, lift: 0, taken: false},
      {lane: 2, z: z + 9, lift: 0, taken: false},
      {lane: 1, z: z + 12, lift: 62, taken: false},
    ];
    for (const c of clovers) stagedClovers.add(c);
    game.track.clovers.push(...clovers);
    run(game, (12 - 0.4 - JUMP_TIME / 2) / game.speed);
    game.key('ArrowUp');
    run(game, 1);
    expect(game.clovers).toBe(3);
    expect(clovers.map((c) => c.taken)).toEqual([true, true, false, false, true]);
  });
});

describe('a game', () => {
  it('goes through its screens with the band\'s keys', () => {
    const game = new Game(3, memoryStore(50));
    expect(game.screen).toBe('title');
    expect(game.key('Escape')).toBe(false); // Back closes the app from the title.
    expect(game.key('ArrowLeft')).toBe(false);
    expect(game.key('Enter')).toBe(true);
    expect(game.screen).toBe('howto');
    expect(game.key('Escape')).toBe(true);
    expect(game.screen).toBe('title');
    game.key('Enter');
    expect(game.key('Enter')).toBe(true);
    expect(game.screen).toBe('title');
    expect(game.key('ArrowUp')).toBe(true);
    expect(game.screen).toBe('playing');
    expect(game.key('Enter')).toBe(false); // the index tap does nothing in a run
    expect(game.screen).toBe('playing');
    expect(game.key('Escape')).toBe(true);
    expect(game.screen).toBe('paused');
    expect(game.key('ArrowLeft')).toBe(false);
    expect(game.key('Enter')).toBe(true);
    expect(game.screen).toBe('playing');
    game.key('Escape');
    expect(game.key('ArrowUp')).toBe(true);
    expect(game.screen).toBe('playing');
    game.key('Escape');
    expect(game.key('Escape')).toBe(true);
    expect(game.screen).toBe('title');
    expect(game.best).toBe(50);
  });

  it('ends on a crash, shows it, and swipe up runs again (not by a swipe meant for the run)', () => {
    const store = memoryStore(0);
    const game = new Game(5, store);
    game.key('ArrowUp');
    game.warp(300);
    game.track.clear(0, 1e9);
    game.track.place(game.goat.z + 5, 'TTT');
    for (let i = 0; i < 120 && game.screen === 'playing'; i++) game.update(1 / 60);
    expect(game.screen).toBe('over');
    expect(game.crash?.kind).toMatch(/boulder|pine/);
    expect(game.record).toBe(true);
    expect(store.saved).toEqual({best: game.meters, zone: 1});
    // Right after the crash, a swipe up was meant for the run.
    expect(game.key('ArrowUp')).toBe(true);
    expect(game.screen).toBe('over');
    game.update(0.6);
    expect(game.key('ArrowUp')).toBe(true);
    expect(game.screen).toBe('playing');
    expect(game.meters).toBe(0);
    expect(game.previousBest).toBeGreaterThan(300);
    // Escape on the game over goes to the title; there it is Lumen's.
    game.warp(10);
    game.track.clear(0, 1e9);
    game.track.place(game.goat.z + 5, 'TTT');
    for (let i = 0; i < 120 && game.screen === 'playing'; i++) game.update(1 / 60);
    expect(game.record).toBe(false);
    expect(game.key('Escape')).toBe(true);
    expect(game.screen).toBe('title');
    expect(game.key('Escape')).toBe(false);
  });

  it('keeps the distance of a run quit from the pause', () => {
    const store = memoryStore(10);
    const game = new Game(4, store);
    game.key('ArrowUp');
    game.warp(1300);
    game.key('Escape');
    expect(game.screen).toBe('paused');
    game.key('Escape');
    expect(game.screen).toBe('title');
    expect(game.best).toBe(1300);
    expect(store.saved).toEqual({best: 1300, zone: 3});
  });

  it('pauses, keeping the distance, when the app goes to the background', () => {
    const store = memoryStore();
    const game = new Game(2, store);
    game.key('ArrowUp');
    game.warp(640);
    game.hidden();
    expect(game.screen).toBe('paused');
    expect(store.saved).toEqual({best: 640, zone: 2});
    // Nothing moves while paused.
    const z = game.goat.z;
    game.update(1);
    expect(game.goat.z).toBe(z);
  });

  it('can be run with the band\'s four moves, 0.3 s late, to 2,000 m', () => {
    const reached: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game(seed, memoryStore());
      game.key('ArrowUp');
      reached.push(runBot(game, 2000, 0.3));
    }
    const through = reached.filter((m) => m >= 2000).length;
    console.log(`bot (0.3 s delay): ${through}/20 seeds reached 2,000 m; reached: ${reached.join(', ')}`);
    expect(through).toBeGreaterThanOrEqual(18);
  });

  it('can be run to 2,000 m when each gesture takes anywhere from 0 to 0.4 s to arrive', () => {
    const reached: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Game(seed, memoryStore());
      game.key('ArrowUp');
      reached.push(runBot(game, 2000, 0.2, 0.4, seed));
    }
    const through = reached.filter((m) => m >= 2000).length;
    console.log(`bot (0 to 0.4 s, random per gesture): ${through}/20 seeds reached 2,000 m; reached: ${reached.join(', ')}`);
    expect(through).toBeGreaterThanOrEqual(18);
  });
});

describe('slides', () => {
  it('last SLIDE_TIME, and a swipe up ends one with a jump', () => {
    const game = emptyRun();
    game.key('ArrowDown');
    run(game, SLIDE_TIME - 0.1);
    expect(game.sliding).toBe(true);
    game.key('ArrowUp');
    run(game, 0.05);
    expect(game.sliding).toBe(false);
    expect(game.airborne).toBe(true);
  });
});
