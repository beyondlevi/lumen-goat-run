import {Rng} from './rng';
import {ZONES, cellsOf, speedAt, zoneAt, type Cell, type ZoneKey} from './zones';

/** Meters of track per unit of depth in the view: depth 1 is the goat, depth 2 is 5 m ahead of it. */
export const METERS_PER_DEPTH = 5;
/** Things come out of the horizon at this depth (50 m ahead), faded in by [FULL_DEPTH]. */
export const SPAWN_DEPTH = 11;
/** From this depth (40 m ahead) things are drawn at full brightness. */
export const FULL_DEPTH = 9;
/** Rows are built this far ahead of the goat, beyond the horizon. */
const AHEAD = 70;
/** The first row of a run, in meters: time to read the hint first. */
export const FIRST_ROW = 45;
/** Seconds the zone banner shows. It covers the far road, so no row comes while it shows. */
export const BANNER_TIME = 2.6;
/** No rows from this many meters before a zone starts... */
const QUIET_BEFORE = 6;
/** ...to this many seconds after it: the banner, then time to see the first row coming. */
export const QUIET_AFTER = BANNER_TIME + 1.6;

export type Kind = 'rock' | 'fence' | 'branch' | 'boulder' | 'pine';
export type Action = 'run' | 'jump' | 'slide';

export interface Row {
  /** Where it stands on the track, in meters. */
  z: number;
  /** Lanes 0 (left), 1, 2 (right). */
  cells: Cell[];
  kinds: (Kind | null)[];
  zone: ZoneKey;
}

export interface Clover {
  lane: number;
  z: number;
  /** Floating this high (px at the goat's depth): over a rock, a jump picks it up. */
  lift: number;
  taken: boolean;
}

/** An ice patch covering one lane from [from] to [to] (meters): no lane changes on it. */
export interface Ice {
  lane: number;
  from: number;
  to: number;
}

/**
 * The fairness model, in seconds, assuming the band may take up to ~0.4 s to turn a gesture into
 * a key. Between two rows the goat needs: time for the first row to get behind it and the next
 * gesture to arrive (react), each lane change (one swipe each), then the action the next row
 * needs (a jump or a slide, after the swipes). Two jumps in a row also need the first to land.
 */
export const TIMING = {react: 0.55, lane: 0.3, action: 0.35, jumpAgain: 1.05};

/** What the goat does to pass [cell]; null for a tall obstacle (no way through that lane). */
export function actionFor(cell: Cell): Action | null {
  return cell === 'none' ? 'run' : cell === 'low' ? 'jump' : cell === 'high' ? 'slide' : null;
}

/** Seconds needed between passing a row with [from] and the next with [to], [lanes] lanes apart. */
export function need(from: Action, lanes: number, to: Action): number {
  if (lanes === 0 && to === 'run') return 0;
  let t = TIMING.react + lanes * TIMING.lane + (to === 'run' ? 0 : TIMING.action);
  if (from === 'jump' && to === 'jump') t = Math.max(t, TIMING.jumpAgain + lanes * TIMING.lane);
  return t;
}

/**
 * The time a row [next] needs after [prev]: from EVERY lane where the goat can pass [prev], the
 * quickest way through [next]. So no choice that passes one row can trap the goat at the next.
 * Infinity if [next] has no way through at all.
 */
export function requiredTime(prev: readonly Cell[], next: readonly Cell[]): number {
  let worst = 0;
  for (let a = 0; a < 3; a++) {
    const from = actionFor(prev[a]);
    if (!from) continue;
    let best = Infinity;
    for (let b = 0; b < 3; b++) {
      const to = actionFor(next[b]);
      if (to) best = Math.min(best, need(from, Math.abs(a - b), to));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

/** The meters a row needs after one at [from] to be [seconds] away at the speed it is passed with. */
function after(from: number, seconds: number): number {
  let z = from + seconds * speedAt(from);
  for (let i = 0; i < 10 && (z - from) / speedAt(z) < seconds; i++) z = from + seconds * speedAt(z) + 0.01;
  return z;
}

/** The meters around each zone's start that stay free of rows (the banner shows there). */
export function quietStretches(): {from: number; to: number}[] {
  return ZONES.filter((zone) => zone.from > 0).map((zone) => ({from: zone.from - QUIET_BEFORE, to: zone.from + QUIET_AFTER * zone.speed[0]}));
}

/**
 * The track ahead: rows of obstacles, clovers and ice, built from a seed as the goat runs. Every
 * row leaves a way through from every lane the goat can pass the row before (see [requiredTime]),
 * ice only lies in a lane that is open at the next row, and no row comes while a zone's banner
 * covers the road.
 */
export class Track {
  rows: Row[] = [];
  clovers: Clover[] = [];
  ice: Ice[] = [];
  private rng: Rng;
  private last: {z: number; cells: Cell[]} = {z: 0, cells: ['none', 'none', 'none']};
  private built = 0;

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  /** Builds rows until [z] (meters) plus the distance ahead the goat can see. */
  generateUntil(z: number): void {
    while (this.last.z < z + AHEAD) this.addRow();
  }

  /** Forgets what is well behind [z]. */
  prune(z: number): void {
    const behind = z - 15;
    this.rows = this.rows.filter((r) => r.z >= behind);
    this.clovers = this.clovers.filter((c) => c.z >= behind);
    this.ice = this.ice.filter((i) => i.to >= behind);
  }

  /** The ice patch under lane [lane] at [z], if any. */
  iceAt(lane: number, z: number): Ice | null {
    return this.ice.find((i) => i.lane === lane && z >= i.from && z <= i.to) ?? null;
  }

  /** Puts a row at [z] (tests and the test hook stage scenes with it). */
  place(z: number, pattern: string, kinds?: (Kind | null)[]): Row {
    const cells = cellsOf(pattern);
    const zone = zoneAt(z);
    const row: Row = {z, cells, kinds: kinds ?? cells.map((c) => this.kindFor(c, zone.key, null)), zone: zone.key};
    this.rows.push(row);
    this.rows.sort((a, b) => a.z - b.z);
    return row;
  }

  /** Removes rows, clovers and ice between [from] and [to] (meters). */
  clear(from: number, to: number): void {
    this.rows = this.rows.filter((r) => r.z < from || r.z > to);
    this.clovers = this.clovers.filter((c) => c.z < from || c.z > to);
    this.ice = this.ice.filter((i) => i.to < from || i.from > to);
  }

  private pick<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.rng.next() * total;
    for (const [item, w] of items) {
      roll -= w;
      if (roll < 0) return item;
    }
    return items[items.length - 1][0];
  }

  private shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  private kindFor(cell: Cell, zone: ZoneKey, same: Kind | null): Kind | null {
    if (cell === 'none') return null;
    if (cell === 'high') return 'branch';
    if (cell === 'low') return same ?? (this.rng.chance(0.6) ? 'rock' : 'fence');
    return zone === 'meadow' || this.rng.chance(0.5) ? 'boulder' : 'pine';
  }

  private addRow(): void {
    const prev = this.last;
    const first = this.built === 0;
    let zone = zoneAt(prev.z + 1);
    let [z, quiet] = this.outOfQuiet(first ? FIRST_ROW : after(prev.z, this.rng.range(zone.gap[0], zone.gap[1])));
    zone = zoneAt(z);
    // The first rows of a run hold one obstacle each.
    const pattern = this.built < 3 ? (this.rng.chance(0.5) ? 'L..' : 'T..') : this.pick(zone.patterns);
    const cells = this.shuffle(cellsOf(pattern));
    const required = requiredTime(prev.cells, cells);
    if ((z - prev.z) / speedAt(z) < required) {
      const [later, pushed] = this.outOfQuiet(after(prev.z, required));
      z = later;
      quiet ||= pushed;
    }
    zone = zoneAt(z);
    const lowKind = pattern === 'LLL' ? (this.rng.chance(0.5) ? 'fence' : 'rock') : null;
    const row: Row = {z, cells, kinds: cells.map((c) => this.kindFor(c, zone.key, lowKind)), zone: zone.key};
    this.rows.push(row);
    this.built++;

    if (first || quiet) this.cloverRuns(prev.z + (first ? 12 : 8), z - 8);
    else this.decorate(prev, row);
    this.last = {z, cells};
  }

  /** [z], or the end of the quiet stretch it falls in (and whether it did). */
  private outOfQuiet(z: number): [number, boolean] {
    for (const q of quietStretches()) {
      if (z > q.from && z < q.to) return [after(q.to, this.rng.range(0, 0.3)), true];
    }
    return [z, false];
  }

  /** Long clover runs over a stretch without rows (the start, a zone's banner), switching lanes. */
  private cloverRuns(from: number, to: number): void {
    let lane = Math.floor(this.rng.next() * 3);
    for (let z = from; z + 2.4 * 4 <= to; z += 2.4 * 6 + 6) {
      for (let i = 0; i < 6 && z + i * 2.4 <= to; i++) this.clovers.push({lane, z: z + i * 2.4, lift: 0, taken: false});
      lane = (lane + 1 + Math.floor(this.rng.next() * 2)) % 3;
    }
  }

  /** Clovers and ice between the row before and [row]. */
  private decorate(prev: {z: number; cells: Cell[]}, row: Row): void {
    const open = [0, 1, 2].filter((l) => row.cells[l] !== 'tall');
    const free = open.filter((l) => row.cells[l] === 'none');
    const length = row.z - prev.z;
    if (length >= 10 && this.rng.chance(0.55)) {
      const lane = this.shuffle(free.length ? free : open)[0];
      const n = Math.min(5, Math.floor((length - 7) / 2.4) + 1);
      for (let i = 0; i < n; i++) this.clovers.push({lane, z: row.z - 3.5 - i * 2.4, lift: 0, taken: false});
    }
    const lows = [0, 1, 2].filter((l) => row.cells[l] === 'low');
    if (lows.length && this.rng.chance(0.3)) this.clovers.push({lane: this.shuffle(lows)[0], z: row.z, lift: 62, taken: false});
    // Ice: only in a lane that is open at this row, never right after a zone's start.
    const zone = zoneAt(row.z);
    if (zone.ice > 0 && prev.z > zone.from && this.rng.chance(zone.ice)) {
      const lane = this.shuffle(free.length ? free : open)[0];
      const to = row.z - this.rng.range(4, 6);
      const from = Math.max(prev.z + 4, to - this.rng.range(8, 16));
      if (to - from >= 6) this.ice.push({lane, from, to});
    }
  }
}
