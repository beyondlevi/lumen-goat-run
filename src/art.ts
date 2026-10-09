import type {Kind} from './track';

/**
 * The approved design's "Rokid" palette. The glasses' display is green only and additive: black is
 * see-through and every color is a brightness, so the scene is line art on black: the goat and the
 * clovers brightest, obstacles bright, lanes and scenery dim.
 */
export const P = {
  bg: '#000000',
  text: '#E2FFEE',
  sub: '#B8FFD6',
  hint: '#8DF0B5',
  line: '#2E7D50',
  panel: '#03100A',
  focus: '#123A24',
  ring: '#F0FFF6',
  accent: '#F0FFF6',
  goat: '#B8FFD6',
  fill: '#0B2617',
  edge: '#4FBF7E',
  lane: '#2E7D50',
  ridge: '#2E7D50',
  star: '#1C5235',
  side: '#286E45',
  rock: '#7CEAA9',
  wood: '#8DF0B5',
  tree: '#6BE69C',
  ice: '#C6FFDD',
  icefill: '#0B2416',
  snow: '#D6FFE6',
  ofill: '#04140B',
  clover: '#C6FFDD',
  cfill: '#154027',
  shadow: '#0B2416',
  speed: '#3E9E66',
  danger: '#F0FFF6',
} as const;

/** The colors texts may use: the bright roles only. */
export const TEXT_COLORS = [P.text, P.sub, P.hint, P.accent];

/**
 * One piece of a drawing: a path, filled (with the drawing's fill) and stroked, or only stroked;
 * `snow` pieces are stroked in the snow color (snowcaps, icicles).
 */
export interface Part {
  path: Path2D;
  fill: boolean;
  snow?: boolean;
}

const fs = (d: string): Part => ({path: new Path2D(d), fill: true});
const s = (d: string): Part => ({path: new Path2D(d), fill: false});
const snowS = (d: string): Part => ({path: new Path2D(d), fill: false, snow: true});
const snowFs = (d: string): Part => ({path: new Path2D(d), fill: true, snow: true});
const circle = (cx: number, cy: number, r: number) => `M${cx + r} ${cy} A${r} ${r} 0 1 1 ${cx - r} ${cy} A${r} ${r} 0 1 1 ${cx + r} ${cy} Z`;

// ---- Things on and along the road, in local units (drawn for a 154 px lane at depth 1), base at y 0 ----

const ROCK = [
  fs('M-56 0 L-50 -20 L-34 -34 L-10 -40 L16 -37 L38 -28 L52 -14 L56 0 Z'),
  s('M-26 -22 L-12 -28 M8 -16 L24 -24 M-40 -8 L-30 -12'),
];
const SNOWROCK = [...ROCK, snowS('M-44 -22 L-34 -34 L-10 -40 L16 -37 L38 -28 L30 -24 L18 -29 L6 -25 L-8 -31 L-22 -26 Z')];
const FENCE = [
  fs('M-70 -42 L70 -42 L70 -34 L-70 -34 Z M-70 -22 L70 -22 L70 -14 L-70 -14 Z'),
  fs('M-64 0 L-64 -46 L-60 -52 L-56 -46 L-56 0 Z M-4 0 L-4 -46 L0 -52 L4 -46 L4 0 Z M56 0 L56 -46 L60 -52 L64 -46 L64 0 Z'),
];
const BRANCH = [
  s('M-70 0 L-70 -82 M-70 -82 L-80 -98 M-70 -82 L-60 -98 M70 0 L70 -82 M70 -82 L60 -98 M70 -82 L80 -98'),
  fs('M-80 -100 L80 -100 A10 10 0 0 1 80 -80 L-80 -80 A10 10 0 0 1 -80 -100 Z'),
  s('M-56 -90 L-30 -90 M6 -92 L34 -92 M-16 -86 L-4 -86'),
  s('M86 -90 A4 7 0 1 1 78 -90 A4 7 0 1 1 86 -90 Z'),
  fs('M-20 -100 L-12 -114 L-4 -112 M30 -100 L40 -112'),
  fs('M-40 -80 q-6 5 0 10 q6 -5 0 -10 Z M16 -80 q-6 5 0 10 q6 -5 0 -10 Z M50 -80 q-6 5 0 10 q6 -5 0 -10 Z'),
];
const ICYBRANCH = [...BRANCH, snowS('M-60 -80 l3 9 l3 -9 M-6 -80 l3 10 l3 -10 M30 -80 l3 8 l3 -8')];
const BOULDER = [
  fs('M-66 0 C-74 -40 -56 -112 -6 -120 C44 -124 70 -84 68 -40 C67 -18 62 -6 58 0 Z'),
  s('M-22 -98 L-8 -78 L-18 -58 M28 -62 L42 -44 M-44 -30 L-30 -22'),
  s('M-44 -82 C-38 -96 -26 -104 -14 -106'),
];
const SNOWBOULDER = [
  ...BOULDER,
  snowFs('M-56 -84 C-44 -112 0 -128 40 -108 C56 -98 62 -88 64 -78 C54 -86 44 -84 36 -92 C26 -82 12 -90 0 -96 C-14 -86 -30 -94 -40 -86 C-46 -92 -52 -88 -56 -84 Z'),
];
export const PINE = [
  fs('M-9 0 L-9 -24 L9 -24 L9 0 Z'),
  fs('M-36 -108 L0 -164 L36 -108 Z'),
  fs('M-50 -66 L0 -128 L50 -66 Z'),
  fs('M-64 -24 L0 -88 L64 -24 Z'),
];
export const SNOWPINE = [
  ...PINE,
  snowS('M-18 -136 L0 -164 L18 -136 L10 -132 L4 -137 L-3 -131 L-10 -137 Z M-50 -66 L-38 -60 L-28 -67 L-16 -60 L-4 -68 L8 -60 L20 -67 L32 -60 L50 -66 '
    + 'M-64 -24 L-50 -18 L-38 -26 L-24 -18 L-10 -26 L4 -18 L18 -26 L32 -18 L46 -26 L64 -24'),
];
export const CLOVER = [s('M0 -30 Q2 -18 8 -12'), fs(circle(-6, -36, 6)), fs(circle(6, -36, 6)), fs(circle(-6, -24, 6)), fs(circle(6, -24, 6))];
export const TUFT = [s('M-12 0 L-8 -12 L-4 0 L0 -16 L4 0 L8 -10 L12 0')];

export interface Obstacle {
  parts: Part[];
  color: string;
  /** Its box in local units: [left, top, right, bottom]. */
  box: [number, number, number, number];
}

/** The drawing of an obstacle, plain or snowy (in the snow zone). */
export function obstacleArt(kind: Kind, snowy: boolean): Obstacle {
  switch (kind) {
    case 'rock':
      return {parts: snowy ? SNOWROCK : ROCK, color: P.rock, box: [-56, -40, 56, 0]};
    case 'fence':
      return {parts: FENCE, color: P.wood, box: [-70, -52, 70, 0]};
    case 'branch':
      return {parts: snowy ? ICYBRANCH : BRANCH, color: P.wood, box: [-90, -114, 90, 0]};
    case 'boulder':
      return {parts: snowy ? SNOWBOULDER : BOULDER, color: P.rock, box: [-70, -124, 70, 0]};
    case 'pine':
      return {parts: snowy ? SNOWPINE : PINE, color: P.tree, box: [-64, -164, 64, 0]};
  }
}

// ---- The goat, from behind (Goat Climb's line style: stroke 2.6, dark fill, horns, ears, tail) ----
// Local box 72 x 84, feet at y 84, centered on x 36.

const GOAT_UPPER = [
  // horns: up, outward, curling back down
  s('M32 9 C29 2 21 -1 17 3 C14 7 17 11 21 9'),
  s('M40 9 C43 2 51 -1 55 3 C58 7 55 11 51 9'),
  // the back of the head on its neck, ears out to the sides
  fs('M29 12 C29 6 43 6 43 12 L43 20 C43 24 40 27 36 27 C32 27 29 24 29 20 Z'),
  s('M29 14 L19 15 L28 19 M43 14 L53 15 L44 19'),
];
const GOAT_BODY = [
  fs('M36 23 C44 23 49 27 51 33 C57 39 60 46 59 53 C58 60 50 65 36 65 C22 65 14 60 13 53 C12 46 15 39 21 33 C23 27 28 23 36 23 Z'),
  // spine, the short tail flicking up, shaggy fringe
  s('M36 27 L36 33'),
  s('M36 46 Q37 39 42 37'),
  s('M17 58 L20 63 L23 59 L26 64 L29 60 L32 65 L36 61 L40 65 L43 60 L46 64 L49 59 L52 63 L55 58'),
];
const LEGS = {
  stand: s('M25 63 L24 84 M47 63 L48 84 M31 64 L31 80 M41 64 L41 80'),
  run: s('M25 63 L20 72 L25 78 M47 63 L49 84 M31 64 L30 81 M41 64 L45 71 L42 75'),
  jump: s('M25 63 L18 70 L23 76 M47 63 L54 70 L49 76 M31 64 L28 72 M41 64 L44 72'),
  dazed: s('M25 63 L16 84 M47 63 L56 84 M31 64 L28 80 M41 64 L44 80'),
};
const GOAT_SLIDE = [
  // head down, horns swept back, just showing over the back
  fs('M29 56 C29 48 43 48 43 56 Z'),
  s('M31 51 C26 45 17 45 14 50 C12 54 15 57 19 55'),
  s('M41 51 C46 45 55 45 58 50 C60 54 57 57 53 55'),
  // the same back, squashed low and wide
  fs('M36 53 C46 53 54 56 60 61 C66 66 66 74 60 77 C54 80 46 81 36 81 C26 81 18 80 12 77 C6 74 6 66 12 61 C18 56 26 53 36 53 Z'),
  s('M36 56 L36 60'),
  s('M36 67 Q37 62 42 60'),
  s('M12 77 L15 82 L18 78 L21 83 L24 79 L27 84 L30 79 L33 84 L36 80 L39 84 L42 79 L45 84 L48 79 L51 83 L54 78 L57 82 L60 77'),
  // hind legs stretched back along the ground
  s('M9 76 L1 83 M63 76 L71 83'),
];

export type GoatPose = 'stand' | 'run' | 'run2' | 'jump' | 'slide' | 'dazed';

/** Draws [parts] with the current stroke style, filling the filled ones with [fill]. */
export function drawParts(ctx: CanvasRenderingContext2D, parts: readonly Part[], fill: string, stroke: string, snow: string = P.snow): void {
  for (const part of parts) {
    if (part.fill) {
      ctx.fillStyle = fill;
      ctx.fill(part.path);
    }
    ctx.strokeStyle = part.snow ? snow : stroke;
    ctx.stroke(part.path);
  }
}

/**
 * The goat seen from behind, about 72 x 84 at scale 1, feet centered at (cx, feet). Poses: stand,
 * run (and run2, its other stride: the same, mirrored), jump (legs tucked), slide (pressed low,
 * horns swept back), dazed (wobbly legs, head tilted, after a crash).
 */
export function drawGoat(ctx: CanvasRenderingContext2D, cx: number, feet: number, scale: number, pose: GoatPose): void {
  ctx.save();
  ctx.translate(cx, feet - 84 * scale);
  ctx.scale(pose === 'run2' ? -scale : scale, scale);
  ctx.translate(-36, 0);
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pose === 'slide') {
    drawParts(ctx, GOAT_SLIDE, P.fill, P.goat);
  } else {
    if (pose === 'dazed') {
      ctx.save();
      ctx.translate(36, 27);
      ctx.rotate((-12 * Math.PI) / 180);
      ctx.translate(-36, -27);
      drawParts(ctx, GOAT_UPPER, P.fill, P.goat);
      ctx.restore();
    } else {
      drawParts(ctx, GOAT_UPPER, P.fill, P.goat);
    }
    drawParts(ctx, GOAT_BODY, P.fill, P.goat);
    const legs = pose === 'run2' ? LEGS.run : LEGS[pose];
    ctx.strokeStyle = P.goat;
    ctx.stroke(legs.path);
  }
  ctx.restore();
}

// ---- Small icons (24 x 24 viewBox, as the design's) ----

export const ARROWS = {
  left: new Path2D('M15 6 L9 12 L15 18'),
  right: new Path2D('M9 6 L15 12 L9 18'),
  up: new Path2D('M6 15 L12 9 L18 15'),
  down: new Path2D('M6 9 L12 15 L18 9'),
  lr: new Path2D('M9 6 L3 12 L9 18 M15 6 L21 12 L15 18'),
};

export const ICONS = {
  play: [new Path2D('M8 5 L19 12 L8 19 Z')],
  exit: [new Path2D('M10 5 H5 V19 H10'), new Path2D('M14 8 L18 12 L14 16'), new Path2D('M18 12 H9')],
};

/** The ice patch of the ice tip (36 x 20 box, from y 2). */
export const ICE_ICON = {patch: new Path2D('M3 15 L9 6 L27 6 L33 15 Z'), line: new Path2D('M12 11 L20 11')};

/** The banners' down arrow (slide) and the snow banner's ice patch with a crossed-out lane change. */
export const BANNER_ART = {
  down: new Path2D('M0 -38 L0 -8 M-9 -17 L0 -8 L9 -17'),
  icePatch: new Path2D('M8 58 L22 36 L78 36 L92 58 Z'),
  iceGlints: new Path2D('M30 47 L40 47 M58 51 L70 51 M48 42 L54 42'),
  turn: new Path2D('M30 16 L70 16 M38 8 L30 16 L38 24 M62 8 L70 16 L62 24'),
  cross: new Path2D('M40 28 L60 4'),
};
