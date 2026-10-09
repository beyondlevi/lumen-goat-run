import {Game, HIT_RANGE, JUMP_TIME, LANE_TIME, SLIDE_TIME} from '../../src/game';
import {Rng} from '../../src/rng';
import type {Row} from '../../src/track';

const KEYS = {left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown'} as const;

interface Pending {
  key: string;
  /** When it arrives. */
  at: number;
  /** The latest the player expects it to arrive. */
  latest: number;
  /** −1 or 1 for a lane change, 0 for a jump or a slide. */
  shift: number;
}

/** How the bot's gestures reach the game: the latency it expects, and how far off it may be. */
interface Band {
  /** Seconds a gesture takes to arrive, on average: what the player expects. */
  delay: number;
  /** The most a key arrives earlier or later than that (s). */
  margin: number;
}

function cost(row: Row, lane: number, committed: Map<Row, number>): number {
  const cell = row.cells[lane];
  if (committed.has(row) && committed.get(row) !== lane) return Infinity;
  return cell === 'tall' ? Infinity : cell === 'none' ? 0 : 0.25;
}

/** Seconds a change of [moves] lanes needs, from the key to the goat counting in the new lane. */
function changeTime(moves: number, band: Band): number {
  return (moves - 0.5) * LANE_TIME + moves / 60 + band.margin + 0.02;
}

/**
 * Picks a lane for each of the next rows: fewest lane changes, running rather than jumping, and
 * only changes there is time for (a key takes the band's delay to arrive; nothing changes lanes
 * while a row is passing or on ice).
 */
function plan(game: Game, rows: Row[], lane: number, band: Band, committed: Map<Row, number>, careful = true): number[] {
  const goat = game.goat;
  const v = game.speed;
  const n = rows.length;
  const best: number[][] = rows.map(() => [Infinity, Infinity, Infinity]);
  const from: number[][] = rows.map(() => [-1, -1, -1]);
  // When a lane change from the current lane can arrive: after the delay, and off the ice.
  const ice = game.track.ice.find((i) => i.lane === lane && i.to > goat.z && i.from < rows[0].z);
  const earliest = Math.max(band.delay, ice ? (ice.to - goat.z) / v + band.margin + 0.03 : 0);
  for (let l = 0; l < 3; l++) {
    const c = cost(rows[0], l, committed);
    if (c === Infinity) continue;
    const moves = Math.abs(l - lane);
    const window = (rows[0].z - goat.z - HIT_RANGE) / v;
    // A last-moment change for the very next row also waits for no row to be passing: a margin,
    // unless there is no other way.
    const extra = careful ? LANE_TIME + 0.3 / v + band.margin : 0;
    if (moves > 0 && window < earliest + changeTime(moves, band) + extra) continue;
    best[0][l] = c + moves;
  }
  for (let i = 1; i < n; i++) {
    const gap = (rows[i].z - rows[i - 1].z) / v;
    for (let l = 0; l < 3; l++) {
      const c = cost(rows[i], l, committed);
      if (c === Infinity) continue;
      for (let k = 0; k < 3; k++) {
        if (best[i - 1][k] === Infinity) continue;
        const moves = Math.abs(l - k);
        if (moves > 0 && gap < (2 * HIT_RANGE + 0.3) / v + band.margin + changeTime(moves, band)) continue;
        const total = best[i - 1][k] + moves + c;
        if (total < best[i][l]) {
          best[i][l] = total;
          from[i][l] = k;
        }
      }
    }
  }
  // Back from the furthest row that still has a way.
  let last = n - 1;
  while (last > 0 && best[last].every((c) => c === Infinity)) last--;
  let l = [0, 1, 2].reduce((a, b) => (best[last][b] < best[last][a] ? b : a), 0);
  if (best[last][l] === Infinity) return careful ? plan(game, rows, lane, band, committed, false) : [lane];
  const lanes = new Array<number>(last + 1);
  for (let i = last; i >= 0; i--) {
    lanes[i] = l;
    l = i > 0 ? from[i][l] : l;
  }
  return lanes;
}

function think(game: Game, queue: Pending[], acted: Map<Row, number>, band: Band, send: (key: string, shift: number) => void): void {
  const goat = game.goat;
  const v = game.speed;
  const ahead = game.track.rows.filter((r) => r.z - goat.z > -HIT_RANGE);
  if (!ahead.length) return;
  // Lane keys on their way: the rows passed before the last one lands (at the latest) are passed
  // in the lane the goat is heading to now; the plan starts after them, from the lane they lead to.
  const shifts = queue.filter((p) => p.shift !== 0);
  const settled = shifts.length ? Math.max(0, shifts[shifts.length - 1].latest - game.t) : 0;
  const zSettled = goat.z + v * settled;
  const lane = Math.max(0, Math.min(2, goat.target + shifts.reduce((sum, p) => sum + p.shift, 0)));
  const now = ahead.filter((r) => r.z - zSettled <= -HIT_RANGE);
  const rows = ahead.filter((r) => r.z - zSettled > -HIT_RANGE).slice(0, 4);
  const lanes = rows.length ? plan(game, rows, lane, band, acted) : [];
  // Where the goat is when a key sent now arrives: as soon as it may, and as late.
  const zSoon = goat.z + v * Math.max(band.delay - band.margin, settled);
  const zLate = goat.z + v * Math.max(band.delay + band.margin, settled + 0.02);

  // A lane change: toward the lane of the first row not passed when the key arrives, once no row
  // is passing then (however early or late it arrives) and the goat isn't on ice.
  const next = rows.findIndex((r) => r.z - zSoon > -HIT_RANGE - 0.1);
  if (next >= 0 && next < lanes.length && lanes[next] !== lane) {
    const passing = ahead.some((r) => r.z - zSoon > -HIT_RANGE - 0.3 && r.z - zLate < HIT_RANGE + LANE_TIME * v + 0.3);
    const icy = [zSoon, zLate, zLate + 1].some((z) => game.track.iceAt(lane, z) !== null);
    if (!passing && !icy) send(lanes[next] < lane ? KEYS.left : KEYS.right, lanes[next] < lane ? -1 : 1);
  }

  // A jump or a slide for the next rows, timed for the key's delay: the middle of the jump, or of
  // the slide, when the row reaches the goat.
  const act = (row: Row, laneThere: number) => {
    if (acted.has(row)) return;
    const cell = row.cells[laneThere];
    const arrives = (row.z - goat.z) / v;
    if (cell === 'low' && arrives <= band.delay + JUMP_TIME / 2 + 0.01) {
      send(KEYS.up, 0);
      acted.set(row, laneThere);
    } else if (cell === 'high' && arrives <= band.delay + SLIDE_TIME / 2) {
      send(KEYS.down, 0);
      acted.set(row, laneThere);
    }
  };
  for (const row of now) act(row, goat.target);
  rows.forEach((row, i) => {
    if (i < lanes.length) act(row, lanes[i]);
  });
}

/**
 * A player that only uses the band's four moves, each arriving [delay] seconds after it decides
 * (the band's latency), looking at the rows on screen. With [jitter], each key arrives up to
 * jitter / 2 earlier or later than that, in the order they were made; the player knows the band
 * is that unsteady and keeps a margin. Runs until [meters] or a crash; returns the meters reached.
 */
export function runBot(game: Game, meters: number, delay = 0.3, jitter = 0, seed = 1): number {
  const queue: Pending[] = [];
  // Rows the player jumped or slid for, and the lane it did it in: it keeps to that lane.
  const acted = new Map<Row, number>();
  const dt = 1 / 60;
  const rng = new Rng(seed);
  const band = {delay, margin: jitter / 2};
  const send = (key: string, shift: number) => {
    const at = Math.max(game.t + delay + (rng.next() - 0.5) * jitter, queue.length ? queue[queue.length - 1].at + 1e-3 : 0);
    queue.push({key, at, latest: Math.max(game.t + delay + band.margin, at), shift});
  };
  for (let frames = 0; frames < 60 * 900 && game.screen === 'playing' && game.meters < meters; frames++) {
    while (queue.length && queue[0].at <= game.t + 1e-9) game.key(queue.shift()!.key);
    think(game, queue, acted, band, send);
    game.update(dt);
  }
  return game.meters;
}
