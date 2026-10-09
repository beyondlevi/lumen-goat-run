import {describe, expect, it} from 'vitest';
import {
  FIRST_ROW, FULL_DEPTH, METERS_PER_DEPTH, SPAWN_DEPTH, TIMING, Track, actionFor, need, quietStretches, requiredTime, type Row,
} from '../../src/track';
import {MAX_SPEED, ZONES, speedAt, zoneAt, zoneProgress} from '../../src/zones';

const SEEDS = 200;
const DISTANCE = 3000;

function build(seed: number, until = DISTANCE): Track {
  const track = new Track(seed);
  track.generateUntil(until);
  return track;
}

/** Seconds between two rows, at the speed the goat passes the second one with. */
function secondsBetween(a: Row, b: Row): number {
  return (b.z - a.z) / speedAt(b.z);
}

const passable = (row: Row) => [0, 1, 2].filter((l) => row.cells[l] !== 'tall');

describe('zones', () => {
  it('start where the design says and get faster', () => {
    expect(ZONES.map((z) => z.from)).toEqual([0, 500, 1200]);
    expect(zoneAt(499).key).toBe('meadow');
    expect(zoneAt(500).key).toBe('forest');
    expect(zoneAt(1200).key).toBe('snow');
    expect(zoneAt(99999).key).toBe('snow');
    for (let i = 1; i < ZONES.length; i++) {
      expect(ZONES[i].speed[0]).toBeGreaterThan(ZONES[i - 1].speed[1]);
      expect(ZONES[i].gap[0]).toBeLessThanOrEqual(ZONES[i - 1].gap[0]);
    }
    // The speed never goes down, and tops out.
    let last = 0;
    for (let m = 0; m < 5000; m += 5) {
      expect(speedAt(m)).toBeGreaterThanOrEqual(last);
      last = speedAt(m);
    }
    expect(speedAt(100000)).toBe(MAX_SPEED);
    // The HUD's bar, as the design's boards show it.
    expect(zoneProgress(124)).toBeCloseTo(0.25, 2);
    expect(zoneProgress(742)).toBeCloseTo(0.35, 2);
    expect(zoneProgress(1436)).toBeCloseTo(0.29, 1);
    expect(zoneProgress(500)).toBe(0);
  });
});

describe('the track', () => {
  it('shows every obstacle for well over 1.3 s, even at the top speed', () => {
    expect(((FULL_DEPTH - 1) * METERS_PER_DEPTH) / MAX_SPEED).toBeGreaterThanOrEqual(1.3);
    // Built beyond the horizon: a row is never created in view.
    const track = new Track(1);
    for (let z = 0; z < 2500; z += 7) {
      track.generateUntil(z);
      const furthest = track.rows[track.rows.length - 1].z;
      expect(furthest - z).toBeGreaterThan((SPAWN_DEPTH - 1) * METERS_PER_DEPTH);
      track.prune(z);
    }
  });

  it('leaves a way through every row, from every lane the goat can pass the row before, in time', () => {
    const minimum: Record<string, number> = {};
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rows = build(seed).rows;
      expect(rows[0].z).toBeGreaterThanOrEqual(FIRST_ROW);
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        expect(passable(row).length).toBeGreaterThan(0);
        expect(row.cells.every((c, l) => (c === 'none') === (row.kinds[l] === null))).toBe(true);
        if (i === 0) continue;
        const prev = rows[i - 1];
        const seconds = secondsBetween(prev, row);
        const zone = zoneAt(row.z);
        // At least the zone's gap, at the zone's speed.
        expect(seconds).toBeGreaterThanOrEqual(zoneAt(prev.z).key === zone.key ? zone.gap[0] - 1e-6 : 0);
        minimum[zone.key] = Math.min(minimum[zone.key] ?? Infinity, seconds);
        // From each lane where the goat may have passed [prev], some lane of [row] is reachable
        // with its action (jump, slide or none) and the lane changes, in the time there is.
        for (const a of passable(prev)) {
          const from = actionFor(prev.cells[a])!;
          const ways = passable(row).filter((b) => need(from, Math.abs(a - b), actionFor(row.cells[b])!) <= seconds + 1e-6);
          expect(ways.length, `seed ${seed}, row at ${row.z.toFixed(1)} m from lane ${a}`).toBeGreaterThan(0);
        }
        expect(requiredTime(prev.cells, row.cells)).toBeLessThanOrEqual(seconds + 1e-6);
      }
    }
    // The tightest spacing seen in each zone, at that zone's speed (s).
    console.log('closest rows (s):', Object.entries(minimum).map(([k, s]) => `${k} ${s.toFixed(2)}`).join(', '));
    for (const zone of ZONES) expect(minimum[zone.key]).toBeGreaterThanOrEqual(zone.gap[0] - 1e-6);
  });

  it('times a lane change and the next action with room for the band\'s latency', () => {
    // A lane change and a jump after a row: at least 1.2 s; two jumps in the same lane: 0.95 s.
    expect(need('run', 1, 'jump')).toBeCloseTo(TIMING.react + TIMING.lane + TIMING.action);
    expect(need('run', 1, 'jump')).toBeGreaterThanOrEqual(1.1);
    expect(need('jump', 0, 'jump')).toBe(TIMING.jumpAgain);
    expect(need('run', 0, 'run')).toBe(0);
    expect(need('slide', 2, 'run')).toBeCloseTo(TIMING.react + 2 * TIMING.lane);
    // Every gesture leaves at least 0.4 s for the band (react covers the latency).
    expect(TIMING.react).toBeGreaterThanOrEqual(0.4);
    // No way through: a row of three tall obstacles is never fair.
    expect(requiredTime(['none', 'none', 'none'], ['tall', 'tall', 'tall'])).toBe(Infinity);
    // Two blocked lanes after the goat passed on the far side: two lane changes.
    expect(requiredTime(['none', 'tall', 'tall'], ['tall', 'tall', 'none'])).toBeCloseTo(TIMING.react + 2 * TIMING.lane);
  });

  it('keeps the road clear while a zone\'s banner shows', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rows = build(seed, 1600).rows;
      for (const q of quietStretches()) expect(rows.filter((r) => r.z > q.from && r.z < q.to)).toEqual([]);
    }
  });

  it('brings in each zone\'s obstacles', () => {
    const seen: Record<string, Set<string>> = {meadow: new Set(), forest: new Set(), snow: new Set()};
    let ice = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const track = build(seed, 2500);
      for (const row of track.rows) for (const kind of row.kinds) if (kind) seen[row.zone].add(kind);
      for (const patch of track.ice) {
        expect(zoneAt(patch.from).key).toBe('snow');
        ice++;
      }
    }
    expect([...seen.meadow].sort()).toEqual(['boulder', 'fence', 'rock']);
    expect([...seen.forest].sort()).toEqual(['boulder', 'branch', 'fence', 'pine', 'rock']);
    expect([...seen.snow].sort()).toEqual(['boulder', 'branch', 'fence', 'pine', 'rock']);
    expect(ice).toBeGreaterThan(20);
  });

  it('only lays ice in a lane that is open at the next row, between rows', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const track = build(seed, 2600);
      for (const patch of track.ice) {
        const next = track.rows.find((r) => r.z > patch.from)!;
        const before = [...track.rows].reverse().find((r) => r.z < patch.from)!;
        expect(next.cells[patch.lane]).not.toBe('tall');
        expect(patch.to).toBeLessThanOrEqual(next.z - 4);
        expect(patch.from).toBeGreaterThanOrEqual(before.z + 4 - 1e-9);
        expect(patch.to - patch.from).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('puts clovers in open lanes, never on an obstacle (but over a rock, for a jump)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const track = build(seed, 2500);
      expect(track.clovers.length).toBeGreaterThan(100);
      for (const clover of track.clovers) {
        for (const row of track.rows) {
          if (Math.abs(row.z - clover.z) > 2 || row.cells[clover.lane] === 'none') continue;
          expect(row.cells[clover.lane]).toBe('low');
          expect(clover.lift).toBeGreaterThan(0);
          expect(row.z).toBe(clover.z);
        }
      }
    }
  });

  it('is the same track for the same seed', () => {
    expect(JSON.stringify(build(77, 1500).rows)).toBe(JSON.stringify(build(77, 1500).rows));
    expect(JSON.stringify(build(77, 1500).rows)).not.toBe(JSON.stringify(build(78, 1500).rows));
  });
});
