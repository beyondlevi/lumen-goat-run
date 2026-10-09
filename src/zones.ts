/** The run's zones, by distance: each one faster than the last, with new obstacles. */
export type ZoneKey = 'meadow' | 'forest' | 'snow';

/** What a row puts in a lane: nothing, a low obstacle (jump), a head-high one (slide), a tall one (change lanes). */
export type Cell = 'none' | 'low' | 'high' | 'tall';

export interface Zone {
  /** 1-based, as the HUD shows it. */
  number: number;
  key: ZoneKey;
  /** Where it starts, in meters. */
  from: number;
  /** Where the next one starts (Infinity for the last). */
  to: number;
  /** Speed (m/s) at its start and at the end of its ramp. */
  speed: [number, number];
  /** Meters over which the speed ramps up and the HUD's bar fills. */
  span: number;
  /** Seconds between two rows of obstacles, at least (picked in this range, then stretched if a move needs more). */
  gap: [number, number];
  /** The rows it builds: cells for the three lanes (in any order) and how often. */
  patterns: readonly (readonly [cells: string, weight: number])[];
  /** Chance of an ice patch before a row. */
  ice: number;
}

/** Pattern letters: . nothing, L low (jump), H head-high (slide), T tall (change lanes). */
const CELLS: Record<string, Cell> = {'.': 'none', L: 'low', H: 'high', T: 'tall'};

export const ZONES: readonly Zone[] = [
  {
    number: 1, key: 'meadow', from: 0, to: 500, speed: [10, 11.5], span: 500, gap: [1.25, 1.75], ice: 0,
    patterns: [['L..', 3], ['T..', 3], ['TT.', 2], ['TL.', 2], ['LLL', 0.8]],
  },
  {
    number: 2, key: 'forest', from: 500, to: 1200, speed: [12.5, 14], span: 700, gap: [1.1, 1.55], ice: 0,
    patterns: [['L..', 1.5], ['H..', 2], ['T..', 1.5], ['TT.', 2], ['TL.', 1.2], ['TH.', 1.5], ['LH.', 0.8], ['HHH', 0.8], ['LLL', 0.5], ['TTL', 0.7], ['TTH', 0.7], ['LHT', 0.6]],
  },
  {
    number: 3, key: 'snow', from: 1200, to: Infinity, speed: [15, 17], span: 800, gap: [1.0, 1.4], ice: 0.35,
    patterns: [['L..', 1], ['H..', 1.2], ['T..', 1], ['TT.', 2.2], ['TL.', 1.2], ['TH.', 1.4], ['LH.', 0.8], ['HHH', 0.8], ['LLL', 0.6], ['TTL', 1], ['TTH', 1], ['LHT', 0.8]],
  },
];

/** The fastest the goat ever runs (m/s): the last zone's top speed. */
export const MAX_SPEED = ZONES[ZONES.length - 1].speed[1];

/** The cells of a pattern string. */
export function cellsOf(pattern: string): Cell[] {
  return [...pattern].map((c) => CELLS[c]);
}

/** The zone at [meters]. */
export function zoneAt(meters: number): Zone {
  for (let i = ZONES.length - 1; i >= 0; i--) {
    if (meters >= ZONES[i].from) return ZONES[i];
  }
  return ZONES[0];
}

/** How far into its zone [meters] is, 0..1 (the last zone fills over its span, then stays full). */
export function zoneProgress(meters: number): number {
  const zone = zoneAt(meters);
  return Math.min(1, Math.max(0, (meters - zone.from) / zone.span));
}

/** The speed (m/s) at [meters]: the zone's, ramping up over its span, a step up at each new zone. */
export function speedAt(meters: number): number {
  const zone = zoneAt(meters);
  const [start, end] = zone.speed;
  return start + (end - start) * zoneProgress(meters);
}
