import {BANNER_TIME, Track, type Kind} from './track';
import {ZONES, speedAt, zoneAt, type Zone} from './zones';

export type Screen = 'title' | 'howto' | 'playing' | 'paused' | 'over';
export type Move = 'left' | 'right' | 'up' | 'down';
export type Pose = 'run' | 'jump' | 'slide' | 'dazed';

/** Seconds a lane change takes. */
export const LANE_TIME = 0.15;
/** A jump: how high (px at the goat's depth) and how long (s). */
export const JUMP_HEIGHT = 66;
export const JUMP_TIME = 0.7;
const JUMP_SPEED = (4 * JUMP_HEIGHT) / JUMP_TIME;
const GRAVITY = (8 * JUMP_HEIGHT) / (JUMP_TIME * JUMP_TIME);
/** Swipe down mid-air: the goat drops this fast (px/s), then slides. */
const DROP_SPEED = 900;
/** Seconds a slide lasts. */
export const SLIDE_TIME = 0.75;
/** Above this height (px) the goat clears a low obstacle (rocks, fences). */
export const CLEAR_LOW = 18;
/** A row hits the goat while it is this close (m), ahead or behind. */
export const HIT_RANGE = 0.6;
/** A move asked for a little early (a jump just before landing, a lane change just before the ice ends) happens then. */
export const BUFFER = 0.2;
/** A clover this close (m) is picked up. */
const CLOVER_RANGE = 0.9;
/** After a crash, a swipe up this soon (s) was meant for the run, not "again". */
const AGAIN_GUARD = 0.5;
/** The controls hint shows for the first meters of a run. */
export const HINT_UNTIL = 140;
/** Seconds the ice tip shows, the first time ice comes. */
export const ICE_TIP_TIME = 4;
/** Ice this close ahead (m) shows the tip. */
const ICE_TIP_AHEAD = 35;

export interface Goat {
  /** Meters run. */
  z: number;
  /** Where it is across the road: 0 (left lane) to 2 (right lane), in between while changing lanes. */
  lane: number;
  /** The lane it is heading to. */
  target: number;
  /** Height above the ground (px at its depth) and vertical speed (px/s, up). */
  h: number;
  vy: number;
  /** Sliding until this time (s). */
  slideUntil: number;
  /** Dropping fast after a swipe down mid-air, to slide on landing. */
  dropping: boolean;
  slideOnLanding: boolean;
}

export interface Crash {
  kind: Kind;
  zone: Zone;
}

export interface Pickup {
  lane: number;
  lift: number;
  at: number;
}

/** Where the best run is kept: meters and the zone it reached. */
export interface Store {
  get(): {best: number; zone: number};
  set(best: number, zone: number): void;
}

/**
 * One game: the screens (title, how to play, the run, pause, game over), the goat's moves, the
 * track, collisions, clovers and the zones. No drawing here (see render.ts), so it runs the same
 * in tests. Time [t] is the run's own clock, in seconds; it stops while paused.
 */
export class Game {
  screen: Screen = 'title';
  track!: Track;
  goat!: Goat;
  t = 0;
  meters = 0;
  clovers = 0;
  best: number;
  bestZone: number;
  /** The best before this run (for the game over screen). */
  previousBest = 0;
  zone: Zone = ZONES[0];
  /** When the current zone's banner began (null: none). */
  bannerAt: number | null = null;
  /** When the ice tip began (null: no ice yet this run). */
  iceTipAt: number | null = null;
  crash: Crash | null = null;
  pickups: Pickup[] = [];
  /** Seconds on the current screen (counted on every screen). */
  screenTime = 0;
  private buffered: {move: Move; at: number} | null = null;
  private seed: number;
  private readonly store: Store;

  constructor(seed: number, store: Store) {
    this.seed = seed;
    this.store = store;
    const saved = store.get();
    this.best = saved.best;
    this.bestZone = saved.zone;
    this.reset();
  }

  /** A fresh track, the goat in the middle lane at the start. */
  reset(): void {
    this.track = new Track(this.seed++);
    this.goat = {z: 0, lane: 1, target: 1, h: 0, vy: 0, slideUntil: 0, dropping: false, slideOnLanding: false};
    this.t = 0;
    this.meters = 0;
    this.clovers = 0;
    this.zone = ZONES[0];
    this.bannerAt = null;
    this.iceTipAt = null;
    this.pickups = [];
    this.buffered = null;
    this.track.generateUntil(0);
  }

  // ---- Input ----

  /** A key from the band (arrows, Enter = index tap, Escape = middle tap). True if the game used it. */
  key(key: string): boolean {
    switch (this.screen) {
      case 'title':
        if (key === 'ArrowUp') return this.begin();
        if (key === 'Enter') return this.show('howto');
        return false; // Escape: the app's Back (Lumen closes it).
      case 'howto':
        if (key === 'Enter' || key === 'Escape') return this.show('title');
        return false;
      case 'playing': {
        const move = ({ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down'} as Record<string, Move>)[key];
        if (move) return this.move(move);
        if (key === 'Escape') return this.pause();
        return false;
      }
      case 'paused':
        if (key === 'Enter' || key === 'ArrowUp') return this.show('playing');
        if (key === 'Escape') return this.quit();
        return false;
      case 'over':
        if (key === 'ArrowUp' || key === 'Enter') return this.screenTime < AGAIN_GUARD ? true : this.begin();
        if (key === 'Escape') return this.quit();
        return false;
    }
  }

  /** The app went to the background: a run waits paused, its distance already kept. */
  hidden(): void {
    if (this.screen === 'playing') this.pause();
    else this.keepRecord();
  }

  private show(screen: Screen): boolean {
    this.screen = screen;
    this.screenTime = 0;
    return true;
  }

  /** A paused run already counts for the best: quitting it, or the app closing, keeps it. */
  private pause(): boolean {
    this.keepRecord();
    return this.show('paused');
  }

  private quit(): boolean {
    this.keepRecord();
    this.reset();
    this.crash = null;
    return this.show('title');
  }

  private begin(): boolean {
    this.reset();
    this.crash = null;
    this.previousBest = this.best;
    return this.show('playing');
  }

  get airborne(): boolean {
    return this.goat.h > 0 || this.goat.vy > 0;
  }

  get sliding(): boolean {
    return this.t < this.goat.slideUntil && !this.airborne;
  }

  get speed(): number {
    return speedAt(this.goat.z);
  }

  /** On an ice patch: no lane changes. */
  onIce(): boolean {
    return this.track.iceAt(Math.round(this.goat.lane), this.goat.z) !== null;
  }

  /** A move during the run. Always used (a lane change on ice waits a moment for the ice to end). */
  move(move: Move): boolean {
    const goat = this.goat;
    switch (move) {
      case 'left':
      case 'right':
        if (this.onIce()) this.buffered = {move, at: this.t};
        else this.shift(move === 'left' ? -1 : 1);
        return true;
      case 'up':
        if (this.airborne) {
          // Kept for the landing, if it comes soon.
          this.buffered = {move, at: this.t};
          goat.slideOnLanding = false;
        } else {
          this.jump();
        }
        return true;
      case 'down':
        if (this.airborne) {
          goat.dropping = true;
          goat.slideOnLanding = true;
          if (this.buffered?.move === 'up') this.buffered = null;
        } else {
          goat.slideUntil = this.t + SLIDE_TIME;
        }
        return true;
    }
  }

  private shift(by: number): void {
    this.goat.target = Math.max(0, Math.min(2, this.goat.target + by));
  }

  private jump(): void {
    const goat = this.goat;
    goat.vy = JUMP_SPEED;
    goat.slideUntil = 0;
    goat.dropping = false;
    goat.slideOnLanding = false;
    this.buffered = null;
  }

  private land(): void {
    const goat = this.goat;
    goat.h = 0;
    goat.vy = 0;
    goat.dropping = false;
    const buffered = this.buffered;
    if (buffered?.move === 'up') {
      this.buffered = null;
      if (this.t - buffered.at <= BUFFER) {
        this.jump();
        return;
      }
    }
    if (goat.slideOnLanding) {
      goat.slideOnLanding = false;
      goat.slideUntil = this.t + SLIDE_TIME;
    }
  }

  /** The goat's look now. */
  pose(): Pose {
    if (this.screen === 'over') return 'dazed';
    if (this.airborne) return 'jump';
    if (this.sliding) return 'slide';
    return 'run';
  }

  // ---- Simulation ----

  /** Advances the game by [dt] seconds (the run in small steps, so no row is passed through unseen). */
  update(dt: number): void {
    this.screenTime += dt;
    if (this.screen !== 'playing') return;
    let left = Math.min(dt, 0.1);
    while (left > 1e-9) {
      const step = Math.min(left, 1 / 120);
      this.step(step);
      left -= step;
      if (this.screen !== 'playing') return;
    }
  }

  private step(dt: number): void {
    this.t += dt;
    const t = this.t;
    const goat = this.goat;
    goat.z += speedAt(goat.z) * dt;

    if (goat.lane !== goat.target) {
      const d = goat.target - goat.lane;
      const s = dt / LANE_TIME;
      goat.lane = Math.abs(d) <= s ? goat.target : goat.lane + Math.sign(d) * s;
    }

    if (this.airborne) {
      if (goat.dropping) goat.vy = -DROP_SPEED;
      else goat.vy -= GRAVITY * dt;
      goat.h += goat.vy * dt;
      if (goat.h <= 0) this.land();
    }

    // A lane change asked for on the ice happens as it ends, if it ends soon enough.
    const buffered = this.buffered;
    if (buffered && t - buffered.at > BUFFER) this.buffered = null;
    else if (buffered && (buffered.move === 'left' || buffered.move === 'right') && !this.onIce()) {
      this.buffered = null;
      this.shift(buffered.move === 'left' ? -1 : 1);
    }

    this.meters = Math.floor(goat.z);
    const zone = zoneAt(this.meters);
    if (zone.number > this.zone.number) {
      this.zone = zone;
      this.bannerAt = t;
    }

    this.track.generateUntil(goat.z);
    this.track.prune(goat.z);

    const lane = Math.round(goat.lane);
    for (const row of this.track.rows) {
      const r = row.z - goat.z;
      if (r > HIT_RANGE) break;
      if (r < -HIT_RANGE) continue;
      const cell = row.cells[lane];
      if (cell === 'tall' || (cell === 'low' && goat.h < CLEAR_LOW) || (cell === 'high' && !this.sliding)) {
        this.over(row.kinds[lane] ?? 'rock');
        return;
      }
    }

    for (const clover of this.track.clovers) {
      if (!clover.taken && Math.abs(clover.z - goat.z) < CLOVER_RANGE && Math.abs(clover.lane - goat.lane) < 0.5) {
        clover.taken = true;
        this.clovers++;
        this.pickups.push({lane: clover.lane, lift: clover.lift, at: t});
      }
    }
    this.pickups = this.pickups.filter((p) => t - p.at < 0.8);

    if (this.iceTipAt === null && this.track.ice.some((i) => i.from - goat.z < ICE_TIP_AHEAD && i.to > goat.z)) this.iceTipAt = t;
  }

  private over(kind: Kind): void {
    this.crash = {kind, zone: this.zone};
    this.keepRecord();
    this.show('over');
  }

  private keepRecord(): void {
    if (this.meters > this.best) {
      this.best = this.meters;
      this.bestZone = zoneAt(this.meters).number;
      this.store.set(this.best, this.bestZone);
    }
  }

  /** A new best this run. */
  get record(): boolean {
    return this.meters > this.previousBest && this.meters === this.best;
  }

  /** Whether the zone banner shows now. */
  get bannerShowing(): boolean {
    return this.bannerAt !== null && this.t - this.bannerAt < BANNER_TIME;
  }

  /** Test hook: carry this run on from [meters], with a moment before the next row. */
  warp(meters: number): void {
    const goat = this.goat;
    this.track.generateUntil(meters);
    this.track.clear(meters - 2, meters + 14);
    goat.z = meters;
    goat.lane = goat.target = 1;
    goat.h = goat.vy = 0;
    goat.slideUntil = 0;
    goat.dropping = goat.slideOnLanding = false;
    this.meters = Math.floor(meters);
    this.zone = zoneAt(this.meters);
    this.bannerAt = null;
    this.track.prune(meters);
    this.screen = 'playing';
  }
}
