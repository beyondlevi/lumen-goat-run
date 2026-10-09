import {
  ARROWS, BANNER_ART, CLOVER, ICE_ICON, ICONS, P, PINE, SNOWPINE, TUFT, drawGoat, drawParts, obstacleArt, type GoatPose, type Part,
} from './art';
import {HINT_UNTIL, ICE_TIP_TIME, JUMP_HEIGHT, type Game} from './game';
import {fill, type Strings} from './i18n';
import {BANNER_TIME, FULL_DEPTH, METERS_PER_DEPTH, SPAWN_DEPTH, type Kind} from './track';
import {ZONES, zoneAt, zoneProgress, type ZoneKey} from './zones';

/** The screen: Lumen gives a web app 600 x 600 CSS px. */
export const SIZE = 600;

const TITLE_FONT = 'Bungee, "Chakra Petch", sans-serif';
const BODY_FONT = '"Chakra Petch", system-ui, sans-serif';

/** A camera behind the goat: three lanes meeting at a vanishing point (the design's View). */
class View {
  readonly unit: number;

  /** h0: the horizon; yg: the ground under the goat (depth 1); r: the road's half width per px below h0. */
  constructor(readonly h0 = 190, readonly yg = 530, readonly r = 0.68) {
    this.unit = this.laneW(1) / 154;
  }

  y(d: number): number {
    return this.h0 + (this.yg - this.h0) / d;
  }

  half(y: number): number {
    return this.r * (y - this.h0);
  }

  laneW(d: number): number {
    return (2 / 3) * this.half(this.y(d));
  }

  /** Screen x of a lane's center (0, 1, 2, or in between), [off] in lane widths. */
  x(lane: number, d: number, off = 0): number {
    return 300 + (lane - 1 + off) * this.laneW(d);
  }

  s(d: number): number {
    return this.unit / d;
  }
}

const PLAY = new View();
const TITLE_VIEW = new View(206, 432, 0.9);
const CRASH_VIEW = new View(300, 560, 0.75);
const GOAT_SCALE = 1.3;

/** Depth of something [ahead] meters in front of the goat. */
const depth = (ahead: number) => 1 + ahead / METERS_PER_DEPTH;
/** Things fade in out of the horizon. */
const fadeIn = (d: number) => Math.max(0, Math.min(1, (SPAWN_DEPTH - d) / (SPAWN_DEPTH - FULL_DEPTH)));

/** A fixed pseudo-random number in [0, 1) for (i, k): scenery that stays put as it scrolls. */
function hash(i: number, k = 0): number {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// ---- Texts (logged for the e2e test: size, color, bounds, the box they must stay in) ----

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TextEntry extends Box {
  text: string;
  size: number;
  color: string;
  alpha: number;
  within: Box | null;
}

/** With [on], each frame lists the texts it drew (the e2e test checks them). */
export const textLog = {on: false, entries: [] as TextEntry[]};
let within: Box | null = null;

interface TextStyle {
  size: number;
  color: string;
  weight?: number;
  title?: boolean;
  align?: CanvasTextAlign;
  spacing?: number;
}

function setFont(ctx: CanvasRenderingContext2D, style: TextStyle): void {
  ctx.font = style.title ? `${style.size}px ${TITLE_FONT}` : `${style.weight ?? 600} ${style.size}px ${BODY_FONT}`;
  if ('letterSpacing' in ctx) (ctx as {letterSpacing: string}).letterSpacing = `${style.spacing ?? 0}px`;
}

function measure(ctx: CanvasRenderingContext2D, value: string, style: TextStyle): number {
  setFont(ctx, style);
  return ctx.measureText(value).width;
}

/** Draws [value] with its baseline at [y]; returns its width. */
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, style: TextStyle): number {
  setFont(ctx, style);
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
  const m = ctx.measureText(value);
  if (textLog.on && value.trim()) {
    textLog.entries.push({
      text: value, size: style.size, color: style.color, alpha: ctx.globalAlpha, within,
      left: x - m.actualBoundingBoxLeft, right: x + m.actualBoundingBoxRight, top: y - m.actualBoundingBoxAscent, bottom: y + m.actualBoundingBoxDescent,
    });
  }
  if ('letterSpacing' in ctx) (ctx as {letterSpacing: string}).letterSpacing = '0px';
  return m.width;
}

/** The baseline of a line of [size] px text in a [lineHeight] line box starting at [top] (CSS's half-leading). */
function baseline(top: number, lineHeight: number, size: number, title = false): number {
  return Math.round(top + lineHeight / 2 + (title ? 0.36 : 0.33) * size);
}

/** Splits [value] into lines no wider than [width]. */
function wrap(ctx: CanvasRenderingContext2D, value: string, width: number, style: TextStyle): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(ctx, next, style) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function inside<T>(box: Box, draw: () => T): T {
  const outer = within;
  within = box;
  try {
    return draw();
  } finally {
    within = outer;
  }
}

// ---- Shapes ----

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fillColor: string | null, stroke: string | null, lineWidth = 2): void {
  ctx.beginPath();
  // The CSS border is inside the box: stroke along its middle.
  const i = stroke ? lineWidth / 2 : 0;
  ctx.roundRect(x + i, y + i, w - 2 * i, h - 2 * i, Math.max(0, r - i));
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/** Maps a viewBox into a w x h box (SVG's "meet": scaled to fit, centered). */
function inBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, vb: [number, number, number, number], draw: () => void): void {
  const [vx, vy, vw, vh] = vb;
  const k = Math.min(w / vw, h / vh);
  ctx.save();
  ctx.translate(x + (w - vw * k) / 2 - vx * k, y + (h - vh * k) / 2 - vy * k);
  ctx.scale(k, k);
  draw();
  ctx.restore();
}

/** Line art in local units: moved, scaled, with a stroke width in those units. */
function group(ctx: CanvasRenderingContext2D, parts: readonly Part[], color: string, lineWidth: number, tx: number, ty: number, s: number, fillColor: string = P.ofill): void {
  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(s, s);
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawParts(ctx, parts, fillColor, color);
  ctx.restore();
}

function strokePath(ctx: CanvasRenderingContext2D, d: Path2D | string, color: string, width: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(typeof d === 'string' ? new Path2D(d) : d);
  ctx.restore();
}

function cloverIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  inBox(ctx, x, y, size, size, [-13, -43, 26, 34], () => {
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    drawParts(ctx, CLOVER, P.cfill, P.clover);
  });
}

function arrowIcon(ctx: CanvasRenderingContext2D, name: keyof typeof ARROWS, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(ARROWS[name]);
  ctx.restore();
}

// ---- The world ----

const starCache = new Map<string, [number, number, number][]>();

function stars(ctx: CanvasRenderingContext2D, seed: number, n: number, top: number, bottom: number): void {
  const key = `${seed}:${n}:${top}:${bottom}`;
  let list = starCache.get(key);
  if (!list) {
    list = [];
    for (let i = 0; i < n; i++) list.push([12 + hash(seed, i) * (SIZE - 24), top + hash(seed + 7, i) * (bottom - top), hash(seed + 3, i) < 0.33 ? 1.5 : 1]);
    starCache.set(key, list);
  }
  ctx.fillStyle = P.star;
  for (const [x, y, r] of list) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The road's edges and the dashes between lanes, rushing toward the viewer as the goat runs [z] meters. */
function ground(ctx: CanvasRenderingContext2D, v: View, z: number): void {
  const bottom = SIZE + 40;
  const hb = v.half(bottom);
  const y0 = v.h0 + 4;
  ctx.save();
  ctx.strokeStyle = P.edge;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(300 + side * v.half(y0), y0);
    ctx.lineTo(300 + side * hb, bottom);
  }
  ctx.stroke();
  // Dashes every 3.3 m, 1.6 m long, out to depth 9.
  ctx.strokeStyle = P.lane;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const period = 3.3;
  for (let k = Math.floor((z - 2) / period); ; k++) {
    const ahead = k * period - z;
    const da = depth(ahead);
    if (da > 9) break;
    if (da < 0.7) continue;
    const ya = v.y(da);
    const yb = v.y(depth(ahead + 1.6));
    for (const side of [-1, 1]) {
      ctx.moveTo(300 + (side * v.half(ya)) / 3, ya);
      ctx.lineTo(300 + (side * v.half(yb)) / 3, yb);
    }
  }
  ctx.stroke();
  ctx.restore();
}

const RIDGES: Record<ZoneKey, (h: number) => [string, string, number][]> = {
  meadow: (h) => [[`M0 ${h - 18} C60 ${h - 44} 120 ${h - 44} 170 ${h - 22} C210 ${h - 6} 240 ${h - 30} 300 ${h - 34} `
    + `C360 ${h - 38} 400 ${h - 8} 450 ${h - 20} C500 ${h - 32} 560 ${h - 40} 600 ${h - 24}`, P.ridge, 2.4]],
  forest: (h) => {
    let tops = `M0 ${h - 10}`;
    for (let i = 0; i <= SIZE; i += 20) tops += ` L${i} ${h - 10 - ((i / 20) % 3 === 1 ? 14 : (i / 20) % 3 === 2 ? 6 : 0)}`;
    return [
      [`M0 ${h - 44} L90 ${h - 74} L170 ${h - 46} L260 ${h - 82} L350 ${h - 50} L440 ${h - 78} L520 ${h - 52} L600 ${h - 70}`, P.star, 2],
      [tops, P.ridge, 2],
    ];
  },
  snow: (h) => {
    const peaks: [number, number][] = [[0, h - 30], [70, h - 70], [130, h - 40], [210, h - 92], [290, h - 46], [370, h - 84], [440, h - 38], [520, h - 76], [600, h - 34]];
    const caps = peaks.slice(1, -1).filter(([, y]) => y < h - 60)
      .map(([x, y]) => `M${x - 14} ${y + 18} L${x - 6} ${y + 12} L${x} ${y + 18} L${x + 7} ${y + 11} L${x + 15} ${y + 19}`).join(' ');
    return [[`M${peaks.map(([x, y]) => `${x} ${y}`).join(' L')}`, P.ridge, 2.4], [caps, P.side, 2]];
  },
};
const ridgeCache = new Map<string, [Path2D, string, number][]>();

function ridge(ctx: CanvasRenderingContext2D, v: View, zone: ZoneKey): void {
  const key = `${zone}:${v.h0}`;
  let paths = ridgeCache.get(key);
  if (!paths) {
    paths = RIDGES[zone](v.h0).map(([d, color, width]) => [new Path2D(d), color, width]);
    paths.push([new Path2D(`M0 ${v.h0} L${SIZE} ${v.h0}`), P.ridge, 2]);
    ridgeCache.set(key, paths);
  }
  for (const [path, color, width] of paths) strokePath(ctx, path, color, width);
}

interface SideKind {
  parts: Part[];
  spacing: number;
  offs: [number, number];
  size: number;
}

const SIDE: Record<ZoneKey, SideKind> = {
  meadow: {parts: TUFT, spacing: 5, offs: [1.75, 2.4], size: 1},
  forest: {parts: PINE, spacing: 7, offs: [1.95, 2.7], size: 0.9},
  snow: {parts: SNOWPINE, spacing: 7, offs: [1.95, 2.7], size: 0.9},
};

/** Scenery along both sides of the road (dim): tufts in the meadow, pines further on. */
function sideThings(ctx: CanvasRenderingContext2D, v: View, z: number, zoneOf: (z: number) => ZoneKey, far = 40): void {
  const items: {d: number; x: number; kind: SideKind}[] = [];
  for (const key of ['meadow', 'forest'] as const) {
    const spacing = SIDE[key].spacing;
    for (let i = Math.floor((z - 3) / spacing); i * spacing < z + far + spacing; i++) {
      for (const side of [-1, 1]) {
        const at = i * spacing + hash(i, side) * spacing * 0.5;
        const zone = zoneOf(at);
        if ((key === 'meadow') !== (zone === 'meadow')) continue;
        const kind = SIDE[zone];
        const d = depth(at - z);
        if (d < 0.8 || at - z > far) continue;
        const off = side * (kind.offs[0] + hash(i + 0.5, side) * (kind.offs[1] - kind.offs[0]));
        const x = 300 + off * v.laneW(d);
        if (x > -80 && x < SIZE + 80) items.push({d, x, kind});
      }
    }
  }
  items.sort((a, b) => b.d - a.d);
  for (const {d, x, kind} of items) {
    const s = v.s(d) * kind.size;
    ctx.save();
    ctx.globalAlpha *= fadeIn(d);
    ctx.translate(x, v.y(d));
    ctx.scale(s, s);
    ctx.lineWidth = 2 / s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawParts(ctx, kind.parts, P.bg, P.side);
    ctx.restore();
  }
}

function snowflakes(ctx: CanvasRenderingContext2D, v: View, time: number): void {
  ctx.save();
  ctx.strokeStyle = P.side;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 26; i++) {
    const x = 10 + hash(i, 4) * (SIZE - 20);
    const span = SIZE - 20 - v.h0;
    const y = v.h0 + 10 + ((hash(i, 5) * span + time * (10 + 8 * hash(i, 6))) % span);
    if (Math.abs(x - 300) < v.half(y) + 10) continue;
    ctx.moveTo(x - 3, y);
    ctx.lineTo(x + 3, y);
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x, y + 3);
  }
  ctx.stroke();
  ctx.restore();
}

/** Streaks flying out of the vanishing point: high speed. */
function speedLines(ctx: CanvasRenderingContext2D, v: View, time: number): void {
  const targets: [number, number][] = [];
  for (let y = 250; y <= 600; y += 50) targets.push([0, y], [SIZE, y]);
  for (const x of [60, 130, 470, 540]) targets.push([x, SIZE]);
  ctx.save();
  ctx.strokeStyle = P.speed;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  targets.forEach(([tx, ty], i) => {
    const t1 = 0.4 + ((hash(i, 9) * 0.6 + time * 1.4) % 0.6);
    const t2 = Math.min(1, t1 + 0.14 + hash(i, 10) * 0.08);
    ctx.moveTo(300 + (tx - 300) * t1, v.h0 + (ty - v.h0) * t1);
    ctx.lineTo(300 + (tx - 300) * t2, v.h0 + (ty - v.h0) * t2);
  });
  ctx.stroke();
  ctx.restore();
}

/** An obstacle at depth [d] in [lane] (fractional lanes are fine). */
function obstacle(ctx: CanvasRenderingContext2D, v: View, kind: Kind, snowy: boolean, lane: number, d: number): void {
  const art = obstacleArt(kind, snowy);
  const s = v.s(d);
  ctx.save();
  ctx.globalAlpha *= fadeIn(d);
  ctx.translate(v.x(lane, d), v.y(d));
  ctx.scale(s, s);
  ctx.lineWidth = (1.7 + 0.9 * Math.min(1, 1 / d)) / s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawParts(ctx, art.parts, P.ofill, art.color);
  ctx.restore();
}

function clover(ctx: CanvasRenderingContext2D, v: View, lane: number, d: number, lift: number): void {
  const s = v.s(d) * 1.3;
  ctx.save();
  ctx.globalAlpha *= fadeIn(d);
  ctx.translate(v.x(lane, d), v.y(d) - lift * v.s(d));
  ctx.scale(s, s);
  ctx.lineWidth = (1.6 + 0.8 * Math.min(1, 1 / d)) / s;
  ctx.lineCap = 'round';
  drawParts(ctx, CLOVER, P.cfill, P.clover);
  ctx.restore();
}

/** Ice covering one lane from depth d1 (near) to d2 (far): the lane's own surface, ragged at both ends. */
function icePatch(ctx: CanvasRenderingContext2D, v: View, lane: number, d1: number, d2: number): void {
  const pt = (a: number, d: number): [number, number] => [300 + (lane - 1 + a) * v.laneW(d), v.y(d)];
  const near: [number, number][] = [[-0.46, d1], [-0.3, d1 - 0.05], [-0.12, d1 + 0.02], [0.06, d1 - 0.06], [0.24, d1 + 0.01], [0.46, d1 - 0.04]];
  const far: [number, number][] = [[0.46, d2], [0.28, d2 + 0.12], [0.1, d2 - 0.02], [-0.08, d2 + 0.14], [-0.26, d2 + 0.02], [-0.46, d2 + 0.1]];
  ctx.save();
  ctx.globalAlpha *= fadeIn(d1);
  ctx.beginPath();
  [...near, ...far].forEach(([a, d], i) => {
    const [x, y] = pt(a, Math.max(0.5, d));
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = P.icefill;
  ctx.fill();
  ctx.strokeStyle = P.ice;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.beginPath();
  for (const [a, t] of [[-0.22, 0.3], [-0.1, 0.3], [0.16, 0.62], [0.28, 0.62]]) {
    const d = d1 + (d2 - d1) * t;
    const y = v.y(d);
    const lw = v.laneW(d);
    const x = 300 + (lane - 1 + a) * lw;
    ctx.moveTo(x, y + 0.05 * lw);
    ctx.lineTo(x + 0.08 * lw, y - 0.05 * lw);
  }
  const dm = d1 + (d2 - d1) * 0.7;
  const xm = v.x(lane, dm, -0.22);
  const ym = v.y(dm);
  ctx.moveTo(xm, ym - 7);
  ctx.lineTo(xm, ym + 7);
  ctx.moveTo(xm - 7, ym);
  ctx.lineTo(xm + 7, ym);
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function dust(ctx: CanvasRenderingContext2D, cx: number, y: number, time: number): void {
  const grow = (time * 4) % 1;
  ctx.save();
  ctx.strokeStyle = P.speed;
  ctx.lineWidth = 2;
  ctx.globalAlpha *= 1 - grow * 0.5;
  for (const [dx, dy, r] of [[-30, 4, 3.5], [-40, 10, 2.5], [-47, 17, 2], [30, 4, 3.5], [40, 10, 2.5], [47, 17, 2]]) {
    ctx.beginPath();
    ctx.arc(cx + dx * (1 + grow * 0.15), y + dy * (1 + grow * 0.3), r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function shadow(ctx: CanvasRenderingContext2D, cx: number, y: number, rx: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, y, rx, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = P.shadow;
  ctx.fill();
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = P.speed;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** The zone's sky, far ridge, road and scenery. */
function backdrop(ctx: CanvasRenderingContext2D, v: View, z: number, zone: ZoneKey, time: number, fast: boolean): void {
  if (zone === 'meadow') stars(ctx, 1, 14, 96, v.h0 - 40);
  else if (zone === 'forest') stars(ctx, 4, 10, 96, v.h0 - 40);
  else stars(ctx, 6, 18, 96, v.h0 - 40);
  ground(ctx, v, z);
  ridge(ctx, v, zone);
  if (zone === 'snow') {
    snowflakes(ctx, v, time);
    if (fast) speedLines(ctx, v, time);
  }
  sideThings(ctx, v, z, (at) => zoneAt(at).key);
}

/** The run: the zone's backdrop, ice, obstacles and clovers coming, the goat. */
function scene(ctx: CanvasRenderingContext2D, game: Game, effects: boolean): void {
  const goat = game.goat;
  const z = goat.z;
  const zone = game.zone.key;
  backdrop(ctx, PLAY, z, zone, game.t, effects && game.speed >= 15);

  for (const patch of game.track.ice) {
    const d1 = depth(patch.from - z);
    const d2 = depth(patch.to - z);
    if (d2 < 0.55 || d1 > SPAWN_DEPTH) continue;
    icePatch(ctx, PLAY, patch.lane, Math.max(0.55, d1), Math.min(d2, 30));
  }

  // Far to near; what the goat has passed (and a branch it slides under) goes in front of it.
  const things: {d: number; front: boolean; draw: () => void}[] = [];
  for (const row of game.track.rows) {
    const ahead = row.z - z;
    const d = depth(ahead);
    if (d > SPAWN_DEPTH || d < 0.45) continue;
    row.cells.forEach((cell, lane) => {
      const kind = row.kinds[lane];
      if (cell === 'none' || !kind) return;
      const front = ahead < -0.5 || (cell === 'high' && ahead < 0.6);
      things.push({d, front, draw: () => obstacle(ctx, PLAY, kind, row.zone === 'snow', lane, d)});
    });
  }
  for (const c of game.track.clovers) {
    if (c.taken) continue;
    const d = depth(c.z - z);
    if (d > SPAWN_DEPTH || d < 0.45) continue;
    const bob = 3 * Math.sin(game.t * 5 + c.z);
    things.push({d, front: c.z - z < -0.5, draw: () => clover(ctx, PLAY, c.lane, d, c.lift + bob)});
  }
  things.sort((a, b) => b.d - a.d);
  const gx = PLAY.x(goat.lane, 1);
  const feet = PLAY.yg - goat.h;
  const pose = game.pose();
  // The shadow of a jump is on the ground, under what the goat jumps over.
  if (pose === 'jump') shadow(ctx, gx, PLAY.yg + 2, 42 - 10 * (goat.h / JUMP_HEIGHT));
  for (const thing of things) if (!thing.front) thing.draw();

  if (pose === 'jump') {
    if (goat.vy > 0) strokePath(ctx, `M${gx - 18} ${feet + 6} l0 20 M${gx} ${feet + 10} l0 26 M${gx + 18} ${feet + 6} l0 20`, P.speed, 2.2);
  } else if (pose === 'slide') {
    strokePath(ctx, `M${gx - 52} ${feet - 2} l-22 10 M${gx - 46} ${feet - 10} l-30 4 M${gx + 52} ${feet - 2} l22 10 M${gx + 46} ${feet - 10} l30 4`, P.speed, 2.2);
  } else if (pose === 'run') {
    dust(ctx, gx, feet, game.t);
    if (effects && zone === 'snow') {
      const k = 0.14;
      const d = [[-58, 456], [58, 456], [-70, 492], [70, 492], [-50, 520], [52, 520]]
        .map(([dx, y]) => `M${gx + dx} ${y} L${gx + dx + (gx + dx - 300) * k} ${y + (y - PLAY.h0) * k}`).join(' ');
      strokePath(ctx, d, P.speed, 2.2);
    }
  }
  const look: GoatPose = pose === 'run' ? (Math.floor(game.t * 7) % 2 ? 'run2' : 'run') : pose;
  drawGoat(ctx, gx, feet, GOAT_SCALE, look);
  for (const thing of things) if (thing.front) thing.draw();
}

// ---- Overlays during the run ----

function hud(ctx: CanvasRenderingContext2D, game: Game, s: Strings, num: (n: number) => string): void {
  const meters = num(game.meters);
  const w = text(ctx, meters, 24, 49, {size: 36, title: true, color: P.text});
  text(ctx, ' m', 24 + w, 49, {size: 18, title: true, color: P.text});
  text(ctx, fill(s.best, {meters: num(Math.max(game.best, game.meters))}), 24, 80, {size: 16, color: P.sub, spacing: 1});
  text(ctx, fill(s.zone, {number: game.zone.number, name: s.zones[game.zone.key].name}), 576, 35, {size: 16, weight: 700, spacing: 1.5, color: P.text, align: 'right'});
  roundRect(ctx, 426, 47, 150, 6, 3, null, P.edge, 1.5);
  const bar = Math.min(147, Math.floor(150 * zoneProgress(game.meters)));
  if (bar > 0) {
    ctx.fillStyle = P.text;
    ctx.fillRect(427.5, 48.5, bar, 3);
  }
  const count = num(game.clovers);
  const cw = measure(ctx, count, {size: 22, weight: 700, color: P.text});
  text(ctx, count, 576, 80, {size: 22, weight: 700, color: P.text, align: 'right'});
  cloverIcon(ctx, 576 - cw - 6 - 22, 62, 22);
}

/** A dark pill at the bottom, so the lanes don't run through what it says. */
function pill(ctx: CanvasRenderingContext2D, width: number, draw: (x: number) => void): void {
  const x = 300 - width / 2;
  roundRect(ctx, x, 550, width, 38, 19, P.panel, P.line, 2);
  inside({left: x, top: 550, right: x + width, bottom: 588}, () => draw(x + 20));
}

function controlsHint(ctx: CanvasRenderingContext2D, s: Strings): void {
  const style = {size: 16, color: P.hint};
  const items: [keyof typeof ARROWS | null, string][] = [['lr', s.hintLane], ['up', s.hintJump], ['down', s.hintSlide], [null, s.hintPause]];
  const widths = items.map(([icon, label]) => (icon ? 24 : 0) + measure(ctx, label, style));
  const width = widths.reduce((a, b) => a + b, 0) + 16 * (items.length - 1) + 40;
  pill(ctx, width, (x) => {
    items.forEach(([icon, label], i) => {
      if (icon) arrowIcon(ctx, icon, x, 559, 20, P.hint);
      text(ctx, label, x + (icon ? 24 : 0), 574, style);
      x += widths[i] + 16;
    });
  });
}

function iceTip(ctx: CanvasRenderingContext2D, s: Strings): void {
  const style = {size: 16, color: P.hint};
  const width = 36 + 16 + measure(ctx, s.iceTip, style) + 40;
  pill(ctx, width, (x) => {
    ctx.save();
    ctx.translate(x, 559);
    ctx.fillStyle = P.icefill;
    ctx.fill(ICE_ICON.patch);
    ctx.strokeStyle = P.ice;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.stroke(ICE_ICON.patch);
    ctx.lineWidth = 2;
    ctx.stroke(ICE_ICON.line);
    ctx.restore();
    text(ctx, s.iceTip, x + 52, 574, style);
  });
}

function bannerArt(ctx: CanvasRenderingContext2D, zone: ZoneKey, x: number, y: number): void {
  if (zone === 'forest') {
    inBox(ctx, x, y, 100, 64, [-56, -66, 112, 72], () => {
      group(ctx, obstacleArt('branch', false).parts, P.wood, 4, 0, 0, 0.55);
      ctx.strokeStyle = P.text;
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(BANNER_ART.down);
    });
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = P.icefill;
  ctx.fill(BANNER_ART.icePatch);
  ctx.strokeStyle = P.ice;
  ctx.lineWidth = 2.4;
  ctx.stroke(BANNER_ART.icePatch);
  ctx.lineWidth = 2.2;
  ctx.stroke(BANNER_ART.iceGlints);
  ctx.strokeStyle = P.text;
  ctx.lineWidth = 3;
  ctx.stroke(BANNER_ART.turn);
  ctx.stroke(BANNER_ART.cross);
  ctx.restore();
}

function banner(ctx: CanvasRenderingContext2D, game: Game, s: Strings, num: (n: number) => string): void {
  if (game.bannerAt === null) return;
  const age = game.t - game.bannerAt;
  if (age > BANNER_TIME) return;
  const zone = game.zone;
  const words = s.zones[zone.key];
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, age / 0.25, (BANNER_TIME - age) / 0.4));
  roundRect(ctx, 110, 112, 380, 238, 18, P.panel, P.line, 2);
  inside({left: 134, top: 112, right: 466, bottom: 350}, () => {
    text(ctx, fill(s.meters, {meters: num(zone.from)}), 300, 147, {size: 16, weight: 700, spacing: 4, color: P.hint, align: 'center'});
    text(ctx, fill(s.bannerZone, {number: zone.number}), 300, 197, {size: 46, title: true, color: P.text, align: 'center'});
    text(ctx, words.name, 300, 236, {size: 28, title: true, color: P.accent, align: 'center'});
    const lines: [string, TextStyle][] = [
      [s.faster, {size: 18, weight: 700, color: P.text}],
      [words.banner[0], {size: 17, color: P.sub}],
      [words.banner[1], {size: 17, color: P.sub}],
    ];
    const tw = Math.max(...lines.map(([value, style]) => measure(ctx, value, style)));
    const x = Math.round(300 - (100 + 14 + tw) / 2);
    bannerArt(ctx, zone.key, x, 260);
    lines.forEach(([value, style], i) => text(ctx, value, x + 114, [275, 298, 321][i], style));
  });
  ctx.restore();
}

/** Picked-up clovers: one floats up beside the goat with a +1. */
function pickups(ctx: CanvasRenderingContext2D, game: Game, s: Strings): void {
  for (const p of game.pickups) {
    const age = game.t - p.at;
    if (age > 0.6) continue;
    const gx = PLAY.x(p.lane, 1);
    const jy = PLAY.yg - Math.max(game.goat.h, 40) - 20 * age;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (0.6 - age) / 0.25);
    group(ctx, CLOVER, P.clover, 2.6, gx + 66, jy - 70, 0.9, P.cfill);
    strokePath(ctx, `M${gx + 66} ${jy - 116} l0 -8 M${gx + 90} ${jy - 104} l6 -6 M${gx + 42} ${jy - 104} l-6 -6`, P.clover, 2.2);
    const right = Math.min(gx + 96, SIZE - 30);
    text(ctx, s.plusOne, right, jy - 89, {size: 20, weight: 700, color: P.accent});
    ctx.restore();
  }
}

// ---- Screens ----

function footer(ctx: CanvasRenderingContext2D, value: string): void {
  text(ctx, value, 300, 581, {size: 16, color: P.hint, align: 'center'});
}

function button(ctx: CanvasRenderingContext2D, label: string, top: number): void {
  const style = {size: 20, title: true, spacing: 1, color: P.text, align: 'center' as const};
  const w = Math.max(280, measure(ctx, label, style) + 52 + 5);
  roundRect(ctx, 300 - w / 2, top, w, 56, 28, P.panel, P.text, 2.5);
  inside({left: 300 - w / 2, top, right: 300 + w / 2, bottom: top + 56}, () => text(ctx, label, 300, top + 35, style));
}

function titleScreen(ctx: CanvasRenderingContext2D, game: Game, s: Strings, num: (n: number) => string, clock: number): void {
  const v = TITLE_VIEW;
  const z = clock * 6;
  stars(ctx, 3, 10, 150, v.h0 - 30);
  ground(ctx, v, z);
  ridge(ctx, v, 'meadow');
  sideThings(ctx, v, z, () => 'meadow');
  // The design's scene, running in a loop: a boulder and a rock in the side lanes, clovers ahead.
  const loop = (z0: number) => ((((z0 - z + 2) % 48) + 48) % 48) - 2;
  const things: [number, () => void][] = [];
  for (const [lane, z0, kind] of [[2, 21, 'boulder'], [0, 13, 'rock'], [2, 45, 'rock'], [0, 37, 'boulder']] as const) {
    const d = depth(loop(z0));
    if (d > 0.5) things.push([d, () => obstacle(ctx, v, kind, false, lane, d)]);
  }
  for (const z0 of [6, 10, 16, 30, 34]) {
    const ahead = loop(z0);
    if (ahead > 0.6) things.push([depth(ahead), () => clover(ctx, v, 1, depth(ahead), 0)]);
  }
  things.sort((a, b) => b[0] - a[0]).forEach(([, draw]) => draw());
  const gx = v.x(1, 1);
  dust(ctx, gx, v.yg, clock);
  drawGoat(ctx, gx, v.yg, GOAT_SCALE * v.unit, Math.floor(clock * 7) % 2 ? 'run2' : 'run');

  text(ctx, s.title, 300, 101, {size: 76, title: true, color: P.text, align: 'center'});
  text(ctx, s.tagline, 300, 137, {size: 18, spacing: 3, color: P.sub, align: 'center'});
  button(ctx, s.play, 462);
  const best = game.best > 0 ? fill(s.bestLine, {meters: num(game.best), zone: game.bestZone}) : s.firstRun;
  text(ctx, best, 300, 541, {size: 16, color: P.sub, align: 'center'});
  footer(ctx, s.titleHints);
}

function howScreen(ctx: CanvasRenderingContext2D, s: Strings, num: (n: number) => string): void {
  text(ctx, s.howTitle, 40, 60, {size: 32, title: true, color: P.text});
  const swipes: [keyof typeof ARROWS, string, string][] = [
    ['left', s.swipeLeft, s.swipeLeftText], ['right', s.swipeRight, s.swipeRightText],
    ['up', s.swipeUp, s.swipeUpText], ['down', s.swipeDown, s.swipeDownText],
  ];
  swipes.forEach(([icon, title, body], i) => {
    const x = 40 + (i % 2) * 270;
    const y = 88 + Math.floor(i / 2) * 62;
    ctx.beginPath();
    ctx.arc(x + 23, y + 23, 23 - 1.25, 0, Math.PI * 2);
    ctx.strokeStyle = P.text;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    arrowIcon(ctx, icon, x + 11, y + 11, 24, P.text);
    inside({left: x + 58, top: y, right: x + 250, bottom: y + 46}, () => {
      text(ctx, title, x + 58, y + 17.5, {size: 16, title: true, color: P.text});
      text(ctx, body, x + 58, y + 38.5, {size: 16, color: P.sub});
    });
  });
  ctx.fillStyle = P.line;
  ctx.fillRect(40, 216, 520, 2);

  const kinds: [string, string, number, number, () => void][] = [
    [s.jump, s.jumpText, 104, 40, () => inBox(ctx, 0, 0, 104, 40, [-70, -38, 140, 40], () => {
      group(ctx, obstacleArt('rock', false).parts, P.rock, 4.4, -38, 0, 0.5);
      group(ctx, obstacleArt('fence', false).parts, P.wood, 4.4, 34, 0, 0.42);
    })],
    [s.slide, s.slideText, 104, 70, () => inBox(ctx, 0, 0, 104, 70, [-60, -66, 120, 70], () => {
      group(ctx, obstacleArt('branch', false).parts, P.wood, 4.4, 0, 0, 0.62);
      drawGoat(ctx, 0, 0, 0.62, 'slide');
    })],
    [s.dodge, s.dodgeText, 104, 70, () => inBox(ctx, 0, 0, 104, 70, [-60, -68, 120, 70], () => {
      group(ctx, obstacleArt('boulder', false).parts, P.rock, 4.4, -26, 0, 0.42);
      group(ctx, obstacleArt('pine', false).parts, P.tree, 4.4, 30, 0, 0.4);
    })],
    [s.collect, s.collectText, 80, 56, () => inBox(ctx, 0, 0, 80, 56, [-20, -50, 60, 60], () => {
      group(ctx, CLOVER, P.clover, 2.2, 0, 0, 1, P.cfill);
      group(ctx, CLOVER, P.clover, 2.2, 26, 6, 1, P.cfill);
    })],
  ];
  kinds.forEach(([title, body, w, h, draw], i) => {
    const x = 40 + i * 132.5;
    const cx = x + 122.5 / 2;
    ctx.save();
    ctx.translate(cx - w / 2, 308 - h);
    draw();
    ctx.restore();
    inside({left: x, top: 238, right: x + 122.5, bottom: 354}, () => {
      text(ctx, title, cx, 328, {size: 17, weight: 700, spacing: 1, color: P.text, align: 'center'});
      text(ctx, body, cx, 350, {size: 15, color: P.sub, align: 'center'});
    });
  });
  ctx.fillStyle = P.line;
  ctx.fillRect(40, 374, 520, 2);

  inside({left: 40, top: 396, right: 560, bottom: 560}, () => {
    const style = {size: 17, color: P.text};
    let top = 396;
    for (const paragraph of [s.howRows, fill(s.howZones, {forest: num(ZONES[1].from), snow: num(ZONES[2].from)})]) {
      for (const line of wrap(ctx, paragraph, 520, style)) {
        text(ctx, line, 40, baseline(top, 22, 17), style);
        top += 22;
      }
      top += 8;
    }
    text(ctx, s.howPause, 40, baseline(top, 20, 16), {size: 16, color: P.sub});
  });
  footer(ctx, s.howHint);
}

function pauseScreen(ctx: CanvasRenderingContext2D, game: Game, s: Strings, num: (n: number) => string): void {
  ctx.save();
  ctx.globalAlpha = 0.22;
  scene(ctx, game, false);
  ctx.restore();
  roundRect(ctx, 100, 150, 400, 266, 18, P.panel, P.line, 2);
  inside({left: 124, top: 150, right: 476, bottom: 416}, () => {
    text(ctx, s.paused, 126, 207, {size: 34, title: true, color: P.text});
    const clovers = fill(game.clovers === 1 ? s.cloverOne : s.cloverMany, {count: num(game.clovers)});
    text(ctx, fill(s.pausedLine, {meters: num(game.meters), clovers, zone: s.zones[game.zone.key].title}), 126, 235, {size: 18, color: P.sub});
  });
  const rows: [keyof typeof ICONS, string, string, boolean][] = [['play', s.resume, s.resumeHint, true], ['exit', s.quit, s.quitHint, false]];
  rows.forEach(([icon, label, note, focused], i) => {
    const y = 258 + i * 72;
    const border = focused ? 3 : 2;
    roundRect(ctx, 126, y, 348, 60, 12, focused ? P.focus : P.panel, focused ? P.ring : P.line, border);
    const x = 126 + border + 18;
    ctx.save();
    ctx.translate(x, y + 17);
    ctx.scale(26 / 24, 26 / 24);
    ctx.strokeStyle = P.text;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const path of ICONS[icon]) ctx.stroke(path);
    ctx.restore();
    inside({left: 126 + border, top: y, right: 474 - border, bottom: y + 60}, () => {
      const lw = text(ctx, label, x + 40, y + 37, {size: 21, weight: 700, color: P.text});
      const nw = measure(ctx, note, {size: 15, color: P.hint});
      if (x + 40 + lw + 12 < 474 - border - 18 - nw) text(ctx, note, 474 - border - 18, y + 35, {size: 15, color: P.hint, align: 'right'});
    });
  });
  footer(ctx, s.pauseHints);
}

/** Where the obstacle that got the goat stands in the crash view (tall ones nearer, so they stay below the texts). */
const CRASH_DEPTH: Record<Kind, number> = {branch: 1.2, rock: 1.5, fence: 1.5, boulder: 1.35, pine: 1.05};
/** The crash scene's highest point (the obstacle's top, under its sparks): clear of the texts above. */
const CRASH_SCENE_TOP = 438;

function overScreen(ctx: CanvasRenderingContext2D, game: Game, s: Strings, num: (n: number) => string, clock: number): void {
  const crash = game.crash ?? {kind: 'rock' as Kind, zone: game.zone};
  const zone = crash.zone.key;
  const v = CRASH_VIEW;
  ctx.save();
  ctx.globalAlpha = 0.18;
  backdrop(ctx, v, game.goat.z, zone, 0, false);
  ctx.restore();

  const cx = v.x(1, 1);
  const d = CRASH_DEPTH[crash.kind];
  const art = obstacleArt(crash.kind, zone === 'snow');
  const top = v.y(d) + art.box[1] * v.s(d);
  // A tall obstacle (a boulder, a pine) reached up into the hint line: the scene shrinks toward
  // the bottom edge until it stays under the texts.
  const fit = top >= CRASH_SCENE_TOP ? 1 : (SIZE - CRASH_SCENE_TOP) / (SIZE - top);
  ctx.save();
  ctx.translate(cx, SIZE);
  ctx.scale(fit, fit);
  ctx.translate(-cx, -SIZE);
  obstacle(ctx, v, crash.kind, zone === 'snow', 1, d);
  strokePath(ctx, `M${cx - 26} ${top - 12} l-10 -8 M${cx} ${top - 16} l0 -10 M${cx + 26} ${top - 12} l10 -8`, P.danger, 2.6);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx + 2, 486, 40, 8, 0, 0, Math.PI * 2);
  ctx.setLineDash([3, 6]);
  ctx.strokeStyle = P.speed;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  drawGoat(ctx, cx, 590, 1.15, 'dazed');
  // Dizzy stars going round the head.
  ctx.fillStyle = P.accent;
  for (let i = 0; i < 3; i++) {
    const a = clock * 2.5 + (i * 2 * Math.PI) / 3 + 2.4;
    const x = cx + 2 + 38 * Math.cos(a);
    const y = 487 + 8 * Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    for (const [px, py] of [[2, -2], [7, 0], [2, 2], [0, 7], [-2, 2], [-7, 0], [-2, -2]]) ctx.lineTo(x + px, y + py);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  text(ctx, s.crash, 300, 62, {size: 40, title: true, color: P.text, align: 'center'});
  const hit = s.hits[crash.kind];
  const hitStyle = {size: 18, weight: 700, color: P.sub};
  const hw = measure(ctx, hit, hitStyle);
  const hx = Math.round(300 - (52 + 10 + hw) / 2);
  const k = 0.4;
  const [l, t, r, b] = art.box;
  inBox(ctx, hx, 76, 52, 36, [l * k - 4, t * k - 2, (r - l) * k + 8, (b - t) * k + 4], () => group(ctx, art.parts, art.color, 5, 0, 0, k));
  text(ctx, hit, hx + 62, 100, hitStyle);

  const meters = num(game.meters);
  const mw = measure(ctx, meters, {size: 72, title: true, color: P.text});
  const uw = measure(ctx, ' m', {size: 30, title: true, color: P.text});
  text(ctx, meters, 300 - (mw + uw) / 2, 185, {size: 72, title: true, color: P.text});
  text(ctx, ' m', 300 - (mw + uw) / 2 + mw, 185, {size: 30, title: true, color: P.text});
  const name = s.zones[crash.zone.key].title;
  let line: string;
  if (game.record) {
    text(ctx, s.newBest, 300, 233, {size: 18, weight: 700, spacing: 3, color: P.accent, align: 'center'});
    line = game.previousBest > 0 ? fill(s.overLineRecord, {zone: crash.zone.number, name, best: num(game.previousBest)}) : fill(s.overLineFirst, {zone: crash.zone.number, name});
  } else {
    line = fill(s.overLine, {zone: crash.zone.number, name, best: num(game.best)});
  }
  text(ctx, line, 300, 259, {size: 17, color: P.sub, align: 'center'});
  const clovers = fill(game.clovers === 1 ? s.cloverOne : s.cloverMany, {count: num(game.clovers)});
  const cloverStyle = {size: 20, weight: 700, color: P.text};
  const cw = measure(ctx, clovers, cloverStyle);
  const ccx = Math.round(300 - (24 + 8 + cw) / 2);
  cloverIcon(ctx, ccx, 274, 24);
  text(ctx, clovers, ccx + 32, 293, cloverStyle);
  button(ctx, s.again, 322);
  text(ctx, s.overHint, 300, 399, {size: 16, color: P.hint, align: 'center'});
}

/** Draws [game] as it is now; [clock] (s) runs on every screen (the title's loop, the dizzy stars). */
export function render(ctx: CanvasRenderingContext2D, game: Game, s: Strings, num: (n: number) => string, clock: number): void {
  if (textLog.on) textLog.entries = [];
  within = null;
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, SIZE, SIZE);
  switch (game.screen) {
    case 'title':
      titleScreen(ctx, game, s, num, clock);
      return;
    case 'howto':
      howScreen(ctx, s, num);
      return;
    case 'playing': {
      scene(ctx, game, true);
      pickups(ctx, game, s);
      hud(ctx, game, s, num);
      if (game.meters < HINT_UNTIL + 15) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, (HINT_UNTIL + 15 - game.goat.z) / 15);
        controlsHint(ctx, s);
        ctx.restore();
      }
      if (game.iceTipAt !== null && game.t - game.iceTipAt < ICE_TIP_TIME) {
        const age = game.t - game.iceTipAt;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, age / 0.2, (ICE_TIP_TIME - age) / 0.5));
        iceTip(ctx, s);
        ctx.restore();
      }
      banner(ctx, game, s, num);
      return;
    }
    case 'paused':
      pauseScreen(ctx, game, s, num);
      return;
    case 'over':
      overScreen(ctx, game, s, num, clock);
      return;
  }
}
