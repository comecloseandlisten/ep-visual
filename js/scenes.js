// Generative pictures after art movements, one or two per mood cell. A style keeps its own state `s`, draws
// palette indices into a Raster every frame and grows from `c.hits` (new sound events: kind, pc, strength,
// x/y in 0..1). `c.f` carries the conditioned audio: `rel` (bands against this track's own level, their 0..1
// drives and energy clocks), `beat` (phase, on, pulse, count, conf) and `section` ('change' | 'drop', on a beat).
import { Raster, clamp, fillPolyF, hexRgb, lerp, makeGrain, makeNoise, mixHex, quant } from './pixels.js';

const TAU = Math.PI * 2;
const isLow = (h) => h.kind === 'kick' || h.kind === 'bass';
const isTonal = (h) => h.pc >= 0;
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const ease = (t) => 1 - (1 - clamp(t)) ** 3;
const pop = (t) => { const u = clamp(t) - 1; return 1 + 2.7 * u * u * u + 1.7 * u * u; };
const gauss = (rnd) => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(TAU * rnd());
// frame-rate independent approach to a target, plain and around the circle
const follow = (v, to, dt, tau) => v + (to - v) * (1 - Math.exp(-dt / tau));
const followAngle = (a, to, dt, tau) => a + (((((to - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI) * (1 - Math.exp(-dt / tau));
// with a steady beat, edits wait for it; without one they happen on the hit
const beatLocked = (c) => c.f.bpm > 0 && c.f.beat.conf > 0.15;

// ---------------------------------------------------------------------------------------------- kandinsky
// Kandinsky's own colour for timbre ("Concerning the Spiritual in Art"): vermilion drum, shrill yellow, dark blue
// cello and bass, violet bassoon, orange bell, green violin; and his Bauhaus pairs: yellow triangle, red square,
// blue circle.
const K_TIMBRE = { kick: 15, snare: 4, hat: 4, perc: 2, bass: 14, pad: 3, fx: 9, loop: 11 };
const K_FORM = { kick: 'square', bass: 'rings', snare: 'tri', hat: 'dot', perc: 'checker', keys: 'dot', pad: 'arc', loop: 'bars', fx: 'line' };
const K_WARM = [2, 4, 9, 12, 15], K_COOL = [3, 6, 8, 11, 14], K_ALL = [...K_WARM, ...K_COOL];
const K_LAYER = { rings: 0, square: 1, checker: 1, tri: 2, arc: 3, dot: 4, bars: 5, line: 6, ray: 6 };
const K_SIZE = { rings: [0.06, 0.08], square: [0.04, 0.05], checker: [0.03, 0.03], tri: [0.04, 0.06], arc: [0.06, 0.1],
  dot: [0.012, 0.03], bars: [0.06, 0.06], line: [0.25, 0.3], ray: [0, 0] };
// a new shape retires the oldest of its kind, so the mix stays a composition
const K_CAP = { rings: 5, square: 4, checker: 2, tri: 6, arc: 3, dot: 14, bars: 3, line: 6, ray: 5 };

function kItem(rnd, type, x, y, size, col) {
  const cols = [col];
  while (cols.length < 5) {
    const k = pick(rnd, [...K_ALL, 1, 13]);
    if (k !== cols[cols.length - 1]) cols.push(k);
  }
  return { type, x, y, size, cols, w: rnd() < 0.3 ? 2 : 1, rings: 2 + Math.floor(rnd() * 3), a: rnd() * TAU, ta: null,
    va: (rnd() - 0.5) * 0.15, vx: (rnd() - 0.5) * 0.01, vy: (rnd() - 0.5) * 0.01, grow: 0, die: 0, len: 0 };
}

function kDraw(r, e, N, k, px) {
  const x = e.x * N, y = e.y * N, R = e.size * N * k, col = e.cols[0];
  if (e.type === 'ray') { // a held note drawn out into a line
    r.stroke(x, y, x + Math.cos(e.a) * e.len * N, y + Math.sin(e.a) * e.len * N, e.w * px, col);
    return;
  }
  if (R < 0.6) return;
  switch (e.type) {
    case 'rings': // concentric circles, the motif of "Squares with Concentric Circles"
      if (e.halo) r.disc(x, y, R * 1.3, 16);
      for (let i = 0; i < e.rings; i++) r.disc(x, y, R * (1 - i / e.rings), e.cols[i]);
      break;
    case 'square': {
      const corner = (i, rr) => [x + Math.cos(e.a + Math.PI / 4 + (i * TAU) / 4) * rr, y + Math.sin(e.a + Math.PI / 4 + (i * TAU) / 4) * rr];
      r.poly([0, 1, 2, 3].map((i) => corner(i, R * 1.41 + px)), 1);
      r.poly([0, 1, 2, 3].map((i) => corner(i, R * 1.41)), col);
      break;
    }
    case 'dot':
      r.disc(x, y, R + px, 1);
      r.disc(x, y, R, col);
      break;
    case 'tri':
      r.poly([0, 1, 2].map((i) => [x + Math.cos(e.a + (i * TAU) / 3) * R, y + Math.sin(e.a + (i * TAU) / 3) * R]), col);
      break;
    case 'arc': {
      const steps = Math.ceil(R * 4), w = e.w * px;
      for (let i = 0; i <= steps; i++) {
        const a = e.a + (i / steps) * Math.PI;
        r.rect(x + Math.cos(a) * R - w / 2, y + Math.sin(a) * R - w / 2, w, w, col);
      }
      break;
    }
    case 'checker': {
      const cs = R / 2;
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 4; i++) r.rect(x - R + i * cs, y - R + j * cs, cs, cs, (i + j) % 2 ? 1 : col);
      break;
    }
    case 'bars': {
      const dx = Math.cos(e.a) * R, dy = Math.sin(e.a) * R, nx = -Math.sin(e.a) * 3 * px, ny = Math.cos(e.a) * 3 * px;
      for (let i = -2; i <= 2; i++) r.stroke(x - dx + nx * i, y - dy + ny * i, x + dx + nx * i, y + dy + ny * i, px, 1);
      break;
    }
    default: { // a long line across the whole composition
      const dx = Math.cos(e.a) * R, dy = Math.sin(e.a) * R;
      r.stroke(x - dx, y - dy, x + dx, y + dy, e.w * px, col);
    }
  }
}

// the angle a line should lie at for the composition schema from "Point and Line to Plane"
const kAngle = (s, rnd) => (s.schema === 'diag' ? s.diag * (Math.PI / 4) + (rnd() - 0.5) * 0.4 : (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.15);

// ---------------------------------------------------------------------------------------------- de stijl
// Colour odds and visual weights fitted to 45 real Mondrians (Andrzejewski, Stork & Zhu 2010).
const DS_ODDS = [[0, 0.754], [2, 0.085], [4, 0.065], [3, 0.062], [1, 0.034]];
const DS_WEIGHT = { 1: 0.392, 2: 0.237, 3: 0.143, 4: 0.227 };

function dsColor(rnd) {
  let u = rnd();
  for (const [c, w] of DS_ODDS) if ((u -= w) < 0) return c;
  return 0;
}

function dsNode(x, y, w, h, col) {
  return { x, y, w, h, col, from: col, wipe: 1, kids: null, vert: false, cut: 0.5, line: 1, merging: false };
}

function dsLeaves(n, out = []) {
  if (n.kids) { dsLeaves(n.kids[0], out); dsLeaves(n.kids[1], out); } else out.push(n);
  return out;
}

function dsInner(n, test, out = []) {
  if (!n.kids) return out;
  if (test(n)) out.push(n);
  dsInner(n.kids[0], test, out);
  dsInner(n.kids[1], test, out);
  return out;
}

// how far the weighted centre of the colour sits from the middle; Mondrian kept it close
function dsImbalance(root) {
  let sx = 0, sy = 0, sw = 0;
  for (const l of dsLeaves(root)) {
    const w = (DS_WEIGHT[l.col] || 0) * l.w * l.h;
    sx += w * (l.x + l.w / 2);
    sy += w * (l.y + l.h / 2);
    sw += w;
  }
  return sw ? Math.hypot(sx / sw - 0.5, sy / sw - 0.5) : 0;
}

// a new black line crosses the rectangle; one half then floods with `col`
function dsSplit(n, rnd, col) {
  const vert = n.w * (0.85 + rnd() * 0.3) > n.h, q = pick(rnd, [0.333, 0.382, 0.5, 0.618, 0.667]);
  n.vert = vert;
  n.cut = q;
  n.line = 0;
  const a = vert ? dsNode(n.x, n.y, n.w * q, n.h, n.col) : dsNode(n.x, n.y, n.w, n.h * q, n.col);
  const b = vert ? dsNode(n.x + n.w * q, n.y, n.w * (1 - q), n.h, n.col) : dsNode(n.x, n.y + n.h * q, n.w, n.h * (1 - q), n.col);
  const fresh = rnd() < 0.5 ? a : b, other = fresh === a ? b : a;
  other.from = n.from; // a flood still running on the parent goes on in the half that keeps its colour
  other.wipe = n.wipe;
  fresh.col = col;
  fresh.wipe = -1.2;
  n.kids = [a, b];
}

function dsTick(n, dt) {
  n.wipe = Math.min(1, n.wipe + dt * 3);
  if (!n.kids) return;
  n.line = n.merging ? n.line - dt * 3 : Math.min(1, n.line + dt * 3);
  if (n.merging && n.line <= 0) {
    n.col = n.from = n.kids[0].col;
    n.wipe = 1;
    n.kids = null;
    n.merging = false;
    return;
  }
  dsTick(n.kids[0], dt);
  dsTick(n.kids[1], dt);
}

function dsSettle(n) {
  n.from = n.col;
  n.wipe = 1;
  n.line = 1;
  if (n.kids) { dsSettle(n.kids[0]); dsSettle(n.kids[1]); }
}

function dsDraw(r, n, N, lw) {
  if (!n.kids) {
    const X = n.x * N, Y = n.y * N, W = n.w * N, H = n.h * N, k = H * ease(n.wipe);
    r.rect(X, Y, W, k, n.col);
    r.rect(X, Y + k, W, H - k, n.from);
    return;
  }
  dsDraw(r, n.kids[0], N, lw);
  dsDraw(r, n.kids[1], N, lw);
  const g = ease(n.line);
  if (g <= 0) return;
  if (n.vert) r.rect((n.x + n.w * n.cut) * N - lw / 2, n.y * N, lw, n.h * N * g, 1);
  else r.rect(n.x * N, (n.y + n.h * n.cut) * N - lw / 2, n.w * N * g, lw, 1);
}

// one edit of the painting: hits cut, notes recolour (whichever candidate keeps the balance), too many merge
function dsEdit(s, rnd, h) {
  const leaves = dsLeaves(s.root);
  if (isTonal(h)) {
    const under = leaves.find((l) => h.x >= l.x && h.x < l.x + l.w && h.y >= l.y && h.y < l.y + l.h) || pick(rnd, leaves);
    const col = h.kind === 'bass' && rnd() < 0.3 ? 1 : [2, 3, 4][h.pc % 3];
    let best = null, bestScore = Infinity;
    for (const leaf of [under, pick(rnd, leaves), pick(rnd, leaves)]) {
      const was = leaf.col;
      leaf.col = was === col ? 0 : col;
      const score = dsImbalance(s.root) + (leaf === under ? 0 : 0.02);
      leaf.col = was;
      if (score < bestScore) { bestScore = score; best = leaf; }
    }
    best.from = best.col;
    best.col = best.col === col ? 0 : col;
    best.wipe = 0;
  } else {
    const big = leaves.filter((l) => Math.min(l.w, l.h) > 0.09).sort((a, b) => b.w * b.h - a.w * a.h);
    if (big.length) dsSplit(pick(rnd, big.slice(0, 3)), rnd, dsColor(rnd));
  }
  if (leaves.length > 22) { // too busy: two neighbours become one again
    const pairs = dsInner(s.root, (n) => !n.kids[0].kids && !n.kids[1].kids && !n.merging && n.line >= 1);
    if (pairs.length) {
      const n = pick(rnd, pairs), [a, b] = n.kids;
      n.merging = true;
      b.from = b.col;
      b.col = a.col;
      b.wipe = 0;
    }
  }
}

// ---------------------------------------------------------------------------------------------- cubism
// still-life objects: 0 background, 1 sound hole, 2 guitar body, 3 neck, 4 glass, 5 bottle, 6 table, 7 strings
const OBJ_TONE = [0, 0.06, 0.74, 0.3, 0.82, 0.38, 0.46, 0.96];
const OBJ_COOL = [false, false, false, false, true, true, false, false];

const sdCircle = (x, y, cx, cy, r) => { const dx = x - cx, dy = y - cy; return Math.sqrt(dx * dx + dy * dy) - r; };
const sdBox = (x, y, cx, cy, hw, hh) => {
  const dx = Math.abs(x - cx) - hw, dy = Math.abs(y - cy) - hh, ox = dx > 0 ? dx : 0, oy = dy > 0 ? dy : 0;
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0);
};
const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k); return lerp(b, a, h) - k * h * (1 - h); };

// A guitar, a bottle and a glass on a table as signed distances (L.ca / L.sa: the guitar's tilt, set once). Each
// facet looks at it through its own viewpoint, which is what makes fragments of one object read as cubism (cf.
// IRCSS's Cubism-Shader).
const SL = { id: 0, edge: 1 };
const SL_M = 0.02; // an object further than this from the point is skipped: `edge` is exact below it, which is all the facets ask
function stillLife(x, y, L) {
  const ca = L.ca, sa = L.sa, u = (x - L.gx) * ca + (y - L.gy) * sa, v = -(x - L.gx) * sa + (y - L.gy) * ca;
  // back to front: table, bottle, glass, guitar; whatever is in front wins where they overlap
  let edge = Math.abs(L.ty - y), id = y > L.ty ? 6 : 0;
  if (Math.abs(x - L.bx) < 0.05 + SL_M && y > L.by - 0.25 - SL_M && y < L.by + 0.19 + SL_M) {
    const bottle = Math.min(sdBox(x, y, L.bx, L.by + 0.05, 0.05, 0.14), sdCircle(x, y, L.bx, L.by - 0.09, 0.05), sdBox(x, y, L.bx, L.by - 0.18, 0.018, 0.07));
    if (bottle < 0) id = 5;
    edge = Math.min(edge, Math.abs(bottle));
  }
  if (Math.abs(x - L.cx) < 0.045 + SL_M && Math.abs(y - L.cy) < 0.075 + SL_M) {
    const glass = sdBox(x, y, L.cx, L.cy, 0.045, 0.075);
    if (glass < 0) id = 4;
    edge = Math.min(edge, Math.abs(glass));
  }
  if (Math.abs(u) < 0.15 + SL_M && v > -0.5 - SL_M && v < 0.27 + SL_M) {
    const body = smin(sdCircle(u, v, 0, 0.12, 0.15), sdCircle(u, v, 0, -0.06, 0.11), 0.04);
    const neck = Math.min(sdBox(u, v, 0, -0.3, 0.025, 0.15), sdBox(u, v, 0, -0.47, 0.036, 0.03));
    const strings = Math.abs(u) < 0.017 && v > -0.47 && v < 0.2 && Math.abs((u + 0.012) % 0.008) < 0.0022;
    edge = Math.min(edge, Math.abs(body), Math.abs(neck));
    if (body < 0) { // the sound hole lies well inside the body, so it only matters there
      const hole = sdCircle(u, v, 0, 0.02, 0.04);
      edge = Math.min(edge, Math.abs(hole));
      id = hole < 0 ? 1 : strings ? 7 : 2;
    } else if (neck < 0) id = strings ? 7 : 3;
  }
  SL.edge = edge;
  SL.id = id;
}

function cubView(rnd, anchored) {
  const k = anchored ? 0.2 : 1;
  return { a: (rnd() - 0.5) * 0.9 * k, s: 1 + (rnd() - 0.5) * 0.35 * k, ox: (rnd() - 0.5) * 0.12 * k, oy: (rnd() - 0.5) * 0.12 * k };
}

function cubSeed(s, rnd, x, y, grow = 0) {
  const anchored = rnd() < 0.35, view = cubView(rnd, anchored);
  return { id: s.nid++, x, y, vx: 0, vy: 0, tone: 0.2 + rnd() * 0.5, ang: rnd() * TAU, turn: null, k: 1.2 + rnd() * 2,
    cool: rnd() < 0.18, dots: rnd() < 0.12, passage: rnd() < 0.35, anchored, view, to: { ...view }, grow, die: 0 };
}

// facets crowd toward the middle, as in analytic cubism's central pyramid
const cubSpot = (rnd) => [clamp(0.5 + gauss(rnd) * 0.24, 0.02, 0.98), clamp(0.52 + gauss(rnd) * 0.26, 0.02, 0.98)];

// ---------------------------------------------------------------------------------------------- color field
const ROTHKO = [
  { g: '#2a0d10', a: '#6e1a1e', b: '#120607', glow: '#a33a2c' }, // maroon and black, the Seagram murals
  { g: '#0f1626', a: '#2b3f66', b: '#07090f', glow: '#4f6fa3' }, // blue and black
  { g: '#26172b', a: '#55304f', b: '#120d14', glow: '#8a4f74' }, // plum and grey
  { g: '#3b1d0e', a: '#8a3b12', b: '#1c0d07', glow: '#c2601e' }, // rust on brown
];

function rothkoPalette(v) {
  return [v.g, mixHex(v.g, v.a, 0.33), mixHex(v.g, v.a, 0.66), v.a, mixHex(v.a, v.glow, 0.5), v.glow,
    mixHex(v.g, v.b, 0.4), mixHex(v.g, v.b, 0.75), v.b, mixHex(v.b, v.a, 0.35)];
}

// Tyler Hobbs' watercolour: recursive midpoint displacement of a polygon, each edge with its own variance
function deform(pts, depth, rnd, k) {
  for (let d = 0; d < depth; d++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2, g = gauss(rnd) * len * a[2] * k;
      out.push(a, [(a[0] + b[0]) / 2 + Math.cos(n) * g, (a[1] + b[1]) / 2 + Math.sin(n) * g, a[2] * (0.6 + rnd() * 0.3)]);
    }
    pts = out;
  }
  return pts;
}

// many faint deformed layers of one rectangle add up to a field with a feathered, uneven edge
function washStack(rnd, fl, N, layers) {
  const buf = new Float32Array(N * N);
  const base = deform([[fl.x0, fl.y0, 0.6], [fl.x1, fl.y0, 0.9], [fl.x1, fl.y1, 0.6], [fl.x0, fl.y1, 0.9]], 3, rnd, 0.05);
  for (let l = 0; l < layers; l++) fillPolyF(buf, N, deform(base, 3, rnd, 0.25), 1 / layers);
  return buf;
}

// ---------------------------------------------------------------------------------------------- flow field
const FLOW_INK = '#1e2a33';
const FLOW_BASE = ['#f2ede3', FLOW_INK, '#2f6f73', '#9bb59a', '#d9b77e', '#c2603e', '#6d8fb3', '#e3cfa8', '#8a5a44', '#ff5a00'];
// 10..17: a darker edge for each colour, the 1px outline that separates Fidenza-style ribbons
const FLOW_PAL = [...FLOW_BASE, ...FLOW_BASE.slice(2).map((h) => mixHex(h, FLOW_INK, 0.45))];
const flowEdge = (col) => (col >= 2 ? col + 8 : 1);

function flowWidth(N, rnd) {
  return Math.max(1, Math.round(pick(rnd, [1, 2, 3, 4, 6, 6, 8]) * (N / 125)));
}

function flowFree(s, N, x, y, rad, id) {
  for (let yy = Math.floor(y - rad); yy <= y + rad; yy++)
    for (let xx = Math.floor(x - rad); xx <= x + rad; xx++) {
      if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      const o = s.occ[yy * N + xx];
      if (o && o !== id) return false;
    }
  return true;
}

// first come, first served: a stroke's margin never takes cells from a neighbour, or it could creep into it
function flowMark(s, N, x, y, rad, id) {
  for (let yy = Math.floor(y - rad); yy <= y + rad; yy++)
    for (let xx = Math.floor(x - rad); xx <= x + rad; xx++)
      if (xx >= 0 && yy >= 0 && xx < N && yy < N && !s.occ[yy * N + xx]) s.occ[yy * N + xx] = id;
}

// Jobard-Lefer: a new streamline starts a set distance beside an existing one, so lines run alongside each other
function flowBeside(s, N, rnd, w) {
  const done = s.lines.filter((L) => L.done && !L.die && L.pts.length > 8);
  if (!done.length) return null;
  const L = pick(rnd, done), i = 1 + Math.floor(rnd() * (L.pts.length - 2)), [x, y] = L.pts[i], [x2, y2] = L.pts[i + 1];
  const len = Math.hypot(x2 - x, y2 - y) || 1, side = rnd() < 0.5 ? -1 : 1, sep = L.w / 2 + w / 2 + 2;
  return [(x - ((y2 - y) / len) * sep * side) / N, (y + ((x2 - x) / len) * sep * side) / N];
}

// Start a stroke at (x, y) in 0..1, else beside a neighbour, else nearby; null when the page has no room.
function flowAdd(s, N, rnd, x, y, w, col, max) {
  const tries = [[x, y]];
  for (let k = 0; k < 6; k++) tries.push(flowBeside(s, N, rnd, w));
  for (let k = 0; k < 3; k++) tries.push([x + (rnd() - 0.5) * 0.25, y + (rnd() - 0.5) * 0.25]);
  for (const t of tries) {
    if (!t) continue;
    const px = clamp(t[0], 0.02, 0.98) * N, py = clamp(t[1], 0.02, 0.98) * N;
    if (!flowFree(s, N, px, py, w / 2 + 1, -1)) continue;
    const L = { id: s.id++, pts: [[px, py]], w, col, max, dir: 1, done: false, die: false };
    flowMark(s, N, px, py, w / 2 + 1, L.id);
    s.lines.push(L);
    return L;
  }
  return null;
}

// one pixel along the field; a streamline grows forward, then back from where it started
function flowStep(s, N, L) {
  const fwd = L.dir > 0, [x, y] = fwd ? L.pts[L.pts.length - 1] : L.pts[0];
  let a = s.noise.fbm((x / N) * 1.6, (y / N) * 1.6 + s.z) * TAU * 2 + s.bias;
  if (s.angular > 0) a = Math.round(a / (0.2 * Math.PI)) * 0.2 * Math.PI; // spikes square the curves off
  if (!fwd) a += Math.PI;
  const nx = x + Math.cos(a), ny = y + Math.sin(a), R = L.w / 2;
  if (L.pts.length >= L.max || nx < R || ny < R || nx > N - R || ny > N - R || !flowFree(s, N, nx, ny, R, L.id)) {
    if (fwd && L.pts.length < L.max) L.dir = -1;
    else L.done = true;
    return false;
  }
  if (fwd) L.pts.push([nx, ny]);
  else L.pts.unshift([nx, ny]);
  flowMark(s, N, nx, ny, R + 1, L.id);
  return true;
}

function flowGrow(s, N, L, steps) {
  for (let k = 0; k < steps && !L.done; k++) if (!flowStep(s, N, L) && !L.done) flowStep(s, N, L);
}

// ---------------------------------------------------------------------------------------------- morphogenesis
// Gray-Scott (F, k) after Pearson's classes and Karl Sims' presets; two of them share the canvas through a slow
// map, so spots turn into coral across it and it reads as one organism.
const RD_KINDS = { coral: [0.0545, 0.062], mitosis: [0.0367, 0.0649], worms: [0.046, 0.065], spots: [0.03, 0.062],
  rings: [0.03, 0.057], maze: [0.05, 0.063] };
const RD_PAIRS = [['coral', 'mitosis'], ['maze', 'spots'], ['worms', 'coral'], ['rings', 'maze']];

function rdSeed(s, N, x, y, rad) {
  rad = Math.max(2, rad);
  for (let yy = Math.floor(y - rad); yy <= y + rad; yy++)
    for (let xx = Math.floor(x - rad); xx <= x + rad; xx++)
      if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= rad * rad) s.B[(((yy % N) + N) % N) * N + (((xx % N) + N) % N)] = 1;
}

// one Gray-Scott step on a torus (Karl Sims: dA 1, dB 0.5, dt 1, Laplacian -1 / 0.2 / 0.05), F and k per pixel
function rdStep(s, N) {
  const { A, B, A2, B2, F, K } = s;
  for (let y = 0; y < N; y++) {
    const ym = (y === 0 ? N - 1 : y - 1) * N, y0 = y * N, yp = (y === N - 1 ? 0 : y + 1) * N;
    for (let x = 0; x < N; x++) {
      const xm = x === 0 ? N - 1 : x - 1, xp = x === N - 1 ? 0 : x + 1, i = y0 + x, a = A[i], b = B[i];
      const la = 0.2 * (A[y0 + xm] + A[y0 + xp] + A[ym + x] + A[yp + x]) + 0.05 * (A[ym + xm] + A[ym + xp] + A[yp + xm] + A[yp + xp]) - a;
      const lb = 0.2 * (B[y0 + xm] + B[y0 + xp] + B[ym + x] + B[yp + x]) + 0.05 * (B[ym + xm] + B[ym + xp] + B[yp + xm] + B[yp + xp]) - b;
      const abb = a * b * b;
      A2[i] = clamp(a + la - abb + F[i] * (1 - a));
      B2[i] = clamp(b + 0.5 * lb + abb - (K[i] + F[i]) * b);
    }
  }
  s.A = A2; s.A2 = A; s.B = B2; s.B2 = B;
}

// ---------------------------------------------------------------------------------------------- brutalism
function bBlock(o) {
  return { drop: 1, die: 0, lit: new Map(), nwin: 0, ...o };
}

// a box cantilevered off a core, somewhere up its height
function bBox(rnd, core) {
  const w = 0.1 + rnd() * 0.2, h = 0.045 + rnd() * 0.06;
  return bBlock({ x: core.x + core.w / 2 - w * (0.15 + rnd() * 0.7), y: core.y - core.h * (0.15 + rnd() * 0.85), w, h,
    d: core.d * (1.1 + rnd() * 0.4), z: 1 + rnd(), win: rnd() < 0.5 ? 'grid' : 'band', core });
}

// darken whatever is already drawn under a cast shadow, one tone per material
const B_SHADE = [0, 1, 2, 2, 3, 4, 5, 7, 8, 9, 3, 11];
function bShadow(r, x, y, w, h) {
  const N = r.N;
  for (let yy = Math.max(0, Math.round(y)); yy < Math.min(N, Math.round(y + h)); yy++)
    for (let xx = Math.max(0, Math.round(x)); xx < Math.min(N, Math.round(x + w)); xx++) r.buf[yy * N + xx] = B_SHADE[r.buf[yy * N + xx]];
}

// how far above its resting place a block is: a free fall in from 0.3 up (accelerating), a sinking exit
const bLift = (b) => -0.3 * (1 - b.drop * b.drop) - ease(b.die) * 1.2;

// Oblique projection, one rule for every block: depth recedes up-right (0.55, 0.45 per unit), the front faces
// stay in one plane. The sun is low behind the row on side `s.sun`: fronts get sky light only, the right face
// is lit when the sun is on the right, tops with a higher sun; no sun reaches a front, so nothing casts on it.
function bDraw(r, b, N, s) {
  const off = bLift(b) + s.dy / N, ground = s.ground * N + s.dy;
  const X = b.x * N, W = b.w * N, Y1 = (b.y + off) * N, H = b.h * N, Y0 = Y1 - H, ox = b.d * N * 0.55, oy = b.d * N * 0.45;
  if (Y1 < 0) return;
  const side = s.sun > 0 ? 5 : 2;
  if (b.core) bShadow(r, X, Y1, W, Math.min(H * 0.4, N * 0.04, ground - Y1)); // the wall under a cantilever loses its sky
  if (b.legs) { // pilotis under a slab
    const step = Math.max(4, N * 0.05);
    for (let lx = X + 2; lx < X + W - 1; lx += step) r.rect(lx, Y1, Math.max(1, N / 120), ground - Y1, 2);
  }
  r.poly([[X, Y0], [X + W, Y0], [X + W + ox, Y0 - oy], [X + ox, Y0 - oy]], s.sunH > 0.6 ? 6 : 5);
  r.poly([[X + W, Y0], [X + W + ox, Y0 - oy], [X + W + ox, Y1 - oy], [X + W, Y1]], side);
  r.rect(X, Y0, W, H, 4);
  const bm = Math.max(3, Math.round(N / 40)); // board-marked concrete
  for (let y = Math.ceil(Y0) + bm; y < Y1 - 1; y += bm) r.rect(X, y, W, 1, 10);
  let k = 0;
  const win = (x, y, w, h) => {
    const l = b.lit.get(k++);
    r.rect(x, y, w, h, s.strobe === b ? 8 : l ? l.c : 1);
  };
  if (b.win === 'grid') {
    const cs = Math.max(3, Math.round(N * 0.03));
    for (let y = Y0 + cs * 0.6; y + cs * 0.6 < Y1; y += cs)
      for (let x = X + cs * 0.5; x + cs * 0.8 < X + W; x += cs) win(x, y, cs - 1, Math.max(1, cs - 2));
  } else if (b.win === 'band') { // ribbon windows under deep balconies
    const cs = Math.max(3, Math.round(N * 0.032));
    for (let y = Y0 + cs * 0.5; y + 2 < Y1; y += cs) win(X + 1, y, W - 2, Math.max(1, Math.round(cs * 0.4)));
  } else { // slits down a core
    const step = Math.max(3, Math.round(N * 0.025));
    for (let x = X + step * 0.7; x < X + W - 1; x += step) win(x, Y0 + H * 0.06, 1, H * 0.82);
  }
  b.nwin = k;
}

// ---------------------------------------------------------------------------------------------- glitch
const GLITCH_PAL = ['#f4f4f0', '#0b0b0b', '#2b0a12', '#7a0f1f', '#e01e37', '#ff5a00', '#ffb703', '#ffffff', '#00e5ff',
  '#1c1cff', '#ff4fd8', '#5c5c5c'];
const GLITCH_LUM = GLITCH_PAL.map((h) => { const [r, g, b] = hexRgb(h); return 0.3 * r + 0.59 * g + 0.11 * b; });
const GLITCH_BY_LUM = GLITCH_PAL.map((_, i) => i).sort((a, b) => GLITCH_LUM[b] - GLITCH_LUM[a]);

// something bold for the codec to chew on: posterised noise, a black sun, white bars and a barcode
function glitchBase(s, N, rnd) {
  const r = s.base, ramp = [1, 2, 3, 4, 5, 6];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const v = s.noise.fbm((x / N) * 2.2 + s.bx, (y / N) * 2.2 + s.by);
      r.buf[y * N + x] = ramp[clamp(Math.floor(((v - 0.3) / 0.4) * 6), 0, 5)];
    }
  const R = N * 0.2, px = s.px;
  r.disc(s.cx * N, s.cy * N, R, 1);
  r.ring(s.cx * N, s.cy * N, R, Math.max(2, N / 50), 7);
  for (let i = 0; i < 3; i++) r.rect(rnd() * N * 0.3, rnd() * N, N * (0.4 + rnd() * 0.5), (1 + Math.floor(rnd() * 3)) * px, 7);
  for (let x = N * 0.08; x < N * 0.5;) {
    const w = (1 + Math.floor(rnd() * 3)) * px;
    r.rect(x, N * 0.64, w, N * 0.14, rnd() < 0.55 ? 7 : 1);
    x += w;
  }
}

// Kim Asendorf's pixel sort: a span starts at the first pixel brighter than the threshold and ends at the first
// one that isn't; only spans get sorted. Palette ranks make it a counting sort.
function sortSpans(buf, N, start, step, count, thr) {
  const counts = new Uint16Array(GLITCH_PAL.length);
  for (let i = 0; i < count;) {
    while (i < count && GLITCH_LUM[buf[start + i * step]] <= thr) i++;
    const a = i;
    while (i < count && GLITCH_LUM[buf[start + i * step]] > thr) i++;
    if (i - a < 2) continue;
    counts.fill(0);
    for (let j = a; j < i; j++) counts[buf[start + j * step]]++;
    let j = a;
    for (const c of GLITCH_BY_LUM) for (let n = counts[c]; n > 0; n--, j++) buf[start + j * step] = c;
  }
}

// ---------------------------------------------------------------------------------------------- truchet
// x0..x1 / y0..y1 are the tile's cells; a tile's far edge is the very same number as its neighbour's near edge,
// so the tiling never leaves a seam however the sizes round
function trNode(rnd, x, y, size, level, x1, y1) {
  return { x, y, size, level, x0: Math.round(x), y0: Math.round(y), x1, y1, o: rnd() < 0.5 ? 0 : 1, kids: null, life: 0, hot: 0 };
}

function trLeaves(n, out) {
  if (n.kids) for (const k of n.kids) trLeaves(k, out);
  else out.push(n);
  return out;
}

function trSplit(n, rnd, life) {
  const h = n.size / 2, xm = Math.round(n.x + h), ym = Math.round(n.y + h);
  n.kids = [[0, 0], [h, 0], [0, h], [h, h]].map(([dx, dy]) => trNode(rnd, n.x + dx, n.y + dy, h, n.level + 1, dx ? n.x1 : xm, dy ? n.y1 : ym));
  n.life = life;
}

// a split tile folds back up once its time is over and none of its quarters is split further
function trTick(n, dt) {
  n.hot = Math.max(0, n.hot - dt * 3);
  if (!n.kids) return;
  for (const k of n.kids) trTick(k, dt);
  if (n.level >= 0 && (n.life -= dt) <= 0 && n.kids.every((k) => !k.kids)) n.kids = null;
}

// ---------------------------------------------------------------------------------------------- styles
export const STYLES = {
  // A Julia set walking the edge of the Mandelbrot cardioid. Smooth iteration count, distance-estimated ink
  // filaments and orbit-trap interiors after Inigo Quilez; the bands step on the beat (colour cycling).
  fractal: {
    title: 'FRACTAL',
    palette: ['#ffffff', '#140a2a', '#fff3b0', '#ffd23f', '#ff9f1c', '#ff5a00', '#f72585', '#b5179e', '#7209b7', '#3a0ca3',
      '#4361ee', '#4cc9f0', '#80ffdb', '#c8ff5a', '#24124a', '#3d2a7a', '#7a5fd0'],
    init(s, c) {
      s.walk = c.rnd() * TAU;
      s.spin = c.rnd() < 0.5 ? -1 : 1;
      s.rot = c.rnd() * TAU;
      s.bloom = 0.3; // how far out from the set the bands reach
      s.pulse = 0;
      s.cycle = 0;
      s.cycleTo = 0;
      s.trap = c.rnd() * TAU;
      s.grain = makeGrain(c.N, c.seed);
    },
    draw(s, c, r) {
      const { N, dt, f, px } = c, rel = f.rel;
      for (const h of c.hits) {
        s.bloom = Math.min(1, s.bloom + 0.02 + 0.05 * h.strength);
        if (isLow(h)) s.pulse = Math.min(1, s.pulse + 0.6 * h.strength);
      }
      if (f.section === 'change') { s.spin = -s.spin; s.bloom = Math.min(1, s.bloom + 0.3); }
      if (f.beat.on) s.cycleTo += 1;
      else if (!beatLocked(c)) s.cycleTo += dt * (0.5 + rel.trebDrive);
      s.cycle = follow(s.cycle, s.cycleTo, dt, 0.08);
      s.bloom = Math.max(0.2, s.bloom - dt * 0.015);
      s.pulse = Math.max(s.pulse * Math.exp(-dt * 5), f.beat.pulse * 0.5);
      s.walk += dt * s.spin * (0.015 + 0.04 * rel.midDrive);
      s.rot += dt * s.spin * 0.03;
      s.trap += dt * (0.2 + rel.bassDrive);
      // just inside the cardioid the set is connected, just outside it shatters into dust: loud parts push out
      const e = 0.985 + 0.045 * rel.bassDrive, w = s.walk;
      const cr = (Math.cos(w) / 2 - Math.cos(2 * w) / 4) * e, ci = (Math.sin(w) / 2 - Math.sin(2 * w) / 4) * e;
      const scale = (1.5 / (1 + 0.12 * s.pulse)) * (2 / N), cos = Math.cos(s.rot) * scale, sin = Math.sin(s.rot) * scale;
      const tx = 0.35 * Math.cos(s.trap), ty = 0.35 * Math.sin(s.trap), inkW = 0.7 * scale * px; // filaments px wide
      const maxIt = 48, nuMin = lerp(9, 1, s.bloom), off = 1200 + s.cycle, buf = r.buf, half = N / 2, g = s.grain;
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const i = y * N + x, px = x + 0.5 - half, py = y + 0.5 - half;
          let zr = px * cos - py * sin, zi = px * sin + py * cos, dr = 1, di = 0, m2 = 0, n = 0, trap = 1e9;
          for (; n < maxIt; n++) {
            const t = 2 * (zr * dr - zi * di);
            di = 2 * (zr * di + zi * dr);
            dr = t;
            const nzr = zr * zr - zi * zi + cr;
            zi = 2 * zr * zi + ci;
            zr = nzr;
            m2 = zr * zr + zi * zi;
            if (m2 > 256) break;
            const q = (zr - tx) ** 2 + (zi - ty) ** 2;
            if (q < trap) trap = q;
          }
          if (n >= maxIt) { // inside: shaded by how close the orbit came to a wandering point
            buf[i] = 14 + quant(clamp(1 - Math.sqrt(trap) * 1.4), 3, g[i], x, y);
            continue;
          }
          if ((0.5 * Math.sqrt(m2) * Math.log(m2)) / Math.sqrt(dr * dr + di * di) < inkW) { buf[i] = 1; continue; }
          const nu = n + 1 - Math.log2(0.5 * Math.log2(m2));
          if (nu < nuMin) { buf[i] = 0; continue; }
          const q = nu * 0.55 + off + 0.35 * g[i], k = Math.floor(q);
          buf[i] = 2 + ((Math.abs(q - k - 0.5) < 0.12 ? k + ((x + y) & 1) : Math.round(q)) % 12);
        }
    },
  },

  // Kandinsky: a dominant haloed circle and shapes strung along a diagonal (or the edges); every hit adds a
  // shape in its timbre's colour and form, a held note draws its dot out into a line
  kandinsky: {
    title: 'KANDINSKY',
    palette: ['#f4eedc', '#141414', '#d7263d', '#7b3fa0', '#f6c026', '#6c7a89', '#8ec5ff', '#8c1c2b', '#1b4fd6', '#ff7a1a',
      '#b35cc9', '#2a9d6f', '#f49ac1', '#ffffff', '#0f2a6b', '#e8452c', '#dccdf0'],
    init(s, c) {
      const rnd = c.rnd;
      s.items = [];
      s.pulse = 0;
      s.held = null;
      s.schema = rnd() < 0.65 ? 'diag' : 'ortho';
      s.diag = rnd() < 0.5 ? -1 : 1;
      const along = () => { // a spot near the composition's axis
        const t = 0.1 + rnd() * 0.8, n = (rnd() - 0.5) * 0.35;
        return s.schema === 'diag' ? [t + n * 0.7, (s.diag < 0 ? 1 - t : t) + n * 0.7] : [t, (rnd() < 0.5 ? 0.33 : 0.66) + n * 0.4];
      };
      const add = (type, size, col, at = along()) => {
        const e = kItem(rnd, type, clamp(at[0], 0.08, 0.92), clamp(at[1], 0.08, 0.92), size, col);
        e.grow = 1;
        if (type === 'line' || type === 'bars') e.a = kAngle(s, rnd);
        s.items.push(e);
        return e;
      };
      const big = add('rings', 0.15 + rnd() * 0.06, 14, [0.22 + rnd() * 0.15, 0.22 + rnd() * 0.15]);
      big.keep = big.halo = true;
      big.cols = [14, 1, pick(rnd, K_COOL), pick(rnd, K_WARM), 13];
      add('rings', 0.05 + rnd() * 0.04, pick(rnd, K_WARM));
      add('square', 0.04 + rnd() * 0.03, 15);
      for (let i = 0; i < 4; i++) add('line', 0.3 + rnd() * 0.4, 1);
      for (let i = 0; i < 3; i++) add('tri', 0.04 + rnd() * 0.06, 4);
      for (let i = 0; i < 7; i++) add('dot', 0.012 + rnd() * 0.03, pick(rnd, K_ALL));
      add('checker', 0.035 + rnd() * 0.03, pick(rnd, K_ALL));
      add('arc', 0.08 + rnd() * 0.1, 1);
      add('bars', 0.05 + rnd() * 0.05, 1);
    },
    draw(s, c, r) {
      const { N, dt, f, px, rnd } = c;
      if (f.section === 'change') { // the other schema: lines swing to the diagonal or to the edges
        s.schema = s.schema === 'diag' ? 'ortho' : 'diag';
        for (const e of s.items) if (e.type === 'line' || e.type === 'bars') e.ta = kAngle(s, rnd);
      }
      for (const h of c.hits) {
        const type = K_FORM[h.kind] ?? 'dot', [s0, s1] = K_SIZE[type];
        const col = h.kind === 'keys' ? (f.bright > 0.6 ? 6 : f.bright > 0.35 ? 11 : 8) : K_TIMBRE[h.kind] ?? pick(rnd, K_ALL);
        const axisY = s.schema === 'diag' ? (s.diag < 0 ? 1 - h.x : h.x) : h.y < 0.5 ? 0.33 : 0.66;
        const x = clamp(h.x + (rnd() - 0.5) * 0.12, 0.05, 0.95), y = clamp(lerp(h.y, axisY, 0.5) + (rnd() - 0.5) * 0.12, 0.05, 0.95);
        const e = kItem(rnd, type, x, y, s0 + s1 * h.strength, type === 'line' || type === 'bars' ? 1 : col);
        if (type === 'line' || type === 'bars') e.a = kAngle(s, rnd);
        s.items.push(e);
        if (isTonal(h)) s.held = { from: e, ray: null };
        if (isLow(h)) s.pulse = Math.min(1, s.pulse + 0.6 * h.strength);
        const same = s.items.filter((o) => o.type === type && !o.die && !o.keep);
        for (let i = 0; i < same.length - K_CAP[type]; i++) same[i].die = 1e-3;
      }
      if (s.held && f.tonal > 0.45 && f.level > 0.15) {
        if (!s.held.ray) {
          const e = kItem(rnd, 'ray', s.held.from.x, s.held.from.y, 0, s.held.from.cols[0]);
          e.a = kAngle(s, rnd);
          e.grow = 1;
          e.from = s.held.from; // the line stays rooted in the dot it grows out of
          s.items.push(e);
          s.held.ray = e;
          const rays = s.items.filter((o) => o.type === 'ray' && !o.die);
          for (let i = 0; i < rays.length - K_CAP.ray; i++) rays[i].die = 1e-3;
        }
        s.held.ray.len = Math.min(0.45, s.held.ray.len + dt * 0.12);
      } else s.held = null;
      s.pulse = Math.max(s.pulse * Math.exp(-dt * 6), f.beat.pulse * 0.6);
      const drift = dt * (0.4 + f.level);
      for (const e of s.items) {
        e.grow = Math.min(1, e.grow + dt * 2.5);
        if (e.die) e.die += dt * 1.5;
        if (e.type === 'ray') { // rooted in its dot while that drifts
          if (e.from && !e.from.die) { e.x = e.from.x; e.y = e.from.y; }
          continue;
        }
        e.x += e.vx * drift;
        e.y += e.vy * drift;
        e.a = e.ta !== null ? followAngle(e.a, e.ta, dt, 0.8) : e.a + e.va * drift;
        if ((e.x < 0.03 && e.vx < 0) || (e.x > 0.97 && e.vx > 0)) e.vx = -e.vx;
        if ((e.y < 0.03 && e.vy < 0) || (e.y > 0.97 && e.vy > 0)) e.vy = -e.vy;
      }
      s.items = s.items.filter((e) => e.die < 1);
      r.fill(0);
      for (const e of [...s.items].sort((a, b) => K_LAYER[a.type] - K_LAYER[b.type])) {
        const round = e.type === 'rings' || e.type === 'dot' || e.type === 'square';
        kDraw(r, e, N, pop(e.grow) * (1 - ease(e.die)) * (round ? 1 + 0.12 * s.pulse : 1), px);
      }
    },
  },

  // Gray-Scott reaction-diffusion: two Pearson classes blended across the canvas by a slow map, growing fronts
  // lit up (Munafo colours by change), seeds sprouting where the notes land
  morpho: {
    title: 'MORPHOGENESIS',
    palette: ['#fdfbff', '#efe6fb', '#d9c6f3', '#b9a0e8', '#8f74d6', '#5f4bb6', '#ffeef0', '#ffd0d9', '#f7a8c0', '#ea7fa3',
      '#c45a86', '#e6f8f3', '#bfeee0', '#8edcca', '#5fbfb5', '#3a8f9e', '#6f5cff', '#ff4f8b', '#16b89a'],
    init(s, c) {
      const { N, rnd } = c;
      for (const k of ['A', 'A2', 'B', 'B2', 'F', 'K', 'prev', 'map']) s[k] = new Float32Array(N * N);
      s.A.fill(1);
      s.noise = makeNoise(c.seed ^ 0x2545f491);
      s.grain = makeGrain(N, c.seed);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) s.map[y * N + x] = s.noise.fbm((x / N) * 1.6 + 7, (y / N) * 1.6 + 3);
      s.pair = Math.floor(rnd() * RD_PAIRS.length);
      s.shift = 0;
      s.warm = 1.5; // seconds of fast-forward, so a pattern is there by the time the style shows
      s.check = 0;
      s.acc = 0; // simulation steps owed
      for (let i = 0; i < 9; i++) rdSeed(s, N, rnd() * N, rnd() * N, N * (0.015 + rnd() * 0.025));
    },
    draw(s, c, r) {
      const { N, t, dt, f, rnd } = c, rel = f.rel;
      for (const h of c.hits) {
        const n = h.kind === 'hat' ? 3 : 1;
        for (let k = 0; k < n; k++) {
          const x = (h.x + (n > 1 ? (rnd() - 0.5) * 0.2 : 0)) * N, y = (h.y + (n > 1 ? (rnd() - 0.5) * 0.2 : 0)) * N;
          rdSeed(s, N, x, y, N * (n > 1 ? 0.012 : 0.015 + 0.02 * h.strength));
        }
      }
      if (f.section === 'change') s.pair = (s.pair + 1) % RD_PAIRS.length;
      if ((s.check += dt) > 1) { // a pattern that has died out gets a few new seeds
        s.check = 0;
        let sum = 0;
        for (let i = 0; i < N * N; i += 7) sum += s.B[i];
        if (sum < N * N * 0.0003) for (let k = 0; k < 4; k++) rdSeed(s, N, rnd() * N, rnd() * N, N * 0.02);
      }
      // brightness and a slow clock slide the border between the two kinds of pattern
      s.shift = follow(s.shift, (f.bright - 0.5) * 0.8 + 0.25 * Math.sin(rel.midClock * 0.1), dt, 3);
      const [ka, kb] = RD_PAIRS[s.pair].map((k) => RD_KINDS[k]);
      for (let i = 0; i < N * N; i++) {
        const w = clamp((s.map[i] - 0.5) * 3 + 0.5 + s.shift);
        s.F[i] = lerp(ka[0], kb[0], w);
        s.K[i] = lerp(ka[1], kb[1], w);
      }
      // steps per second (240..720 at the default size, 60 fps worth of 4..12), so the growth rate does not
      // depend on the frame rate; fewer at big N, and a stall is not caught up
      let rate = 60 * (4 + Math.round(8 * clamp(f.level * 2)));
      if (s.warm > 0) { rate += 60 * 16; s.warm -= dt; }
      s.acc += dt * rate * Math.min(1, (125 / N) ** 2);
      const iters = Math.max(1, Math.min(32, Math.floor(s.acc)));
      s.acc = Math.min(2, Math.max(0, s.acc - iters));
      s.prev.set(s.B);
      for (let k = 0; k < iters; k++) rdStep(s, N);
      const buf = r.buf, B = s.B, drift = t * 0.03, grow = 0.0025 * iters;
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const i = y * N + x, v = (B[i] - 0.06) / 0.3;
          if (v < 0.03) { buf[i] = 0; continue; }
          const nv = s.noise((x / N) * 2 + drift, (y / N) * 2 - drift * 0.5), fam = nv < 0.4 ? 0 : nv < 0.6 ? 1 : 2;
          buf[i] = B[i] - s.prev[i] > grow ? 16 + fam : 1 + fam * 5 + quant(v, 5, s.grain[i], x, y);
        }
    },
  },

  // Brutalist cores with cantilevered boxes. Light is the moving part: a low sun behind the row that swaps sides
  // on a new section, every block throwing its shadow across the plaza; kicks land more concrete (falling, so
  // that it hits on the beat) on the core nearest the hit, hats light rooms
  brutalism: {
    title: 'BRUTALISM',
    palette: ['#ecebe6', '#141414', '#3b3a37', '#5e5c57', '#85827b', '#a29e95', '#bdb9ae', '#ff5a00', '#ffcf70', '#d9d6ce',
      '#7a7770', '#e6d3b8'],
    init(s, c) {
      const rnd = c.rnd;
      s.ground = 0.86 + rnd() * 0.04;
      s.blocks = [];
      s.cores = [];
      let x = 0.03 + rnd() * 0.06;
      while (x < 0.9) {
        const core = bBlock({ x, y: s.ground, w: 0.06 + rnd() * 0.07, h: 0.3 + rnd() * 0.42, d: 0.05 + rnd() * 0.04, z: 0, win: 'slit' });
        s.blocks.push(core);
        s.cores.push(core);
        for (let k = 1 + Math.floor(rnd() * 3); k > 0; k--) s.blocks.push(bBox(rnd, core));
        x += core.w + 0.1 + rnd() * 0.16;
      }
      if (rnd() < 0.7) {
        const w = 0.3 + rnd() * 0.3;
        s.blocks.push(bBlock({ x: rnd() * (0.95 - w), y: s.ground - 0.07, w, h: 0.07, d: 0.12, z: 3, win: 'band', legs: true }));
      }
      s.sun = rnd() < 0.5 ? -1 : 1; // which side the light comes from
      s.sunH = 0.3 + rnd() * 0.6; // low sun, long shadows
      s.len = 0;
      s.queue = []; // where the kicks landed: a box per kick, on the nearest core
      s.dropBeat = -1;
      s.shake = 0;
      s.dy = 0;
      s.strobe = null;
      s.strobeT = 0;
    },
    draw(s, c, r) {
      const { N, dt, f, rnd, px } = c, T = 0.4; // seconds a box takes to fall
      const land = (x, drop) => {
        const core = s.cores.reduce((a, b) => (Math.abs(b.x + b.w / 2 - x) < Math.abs(a.x + a.w / 2 - x) ? b : a));
        const b = bBox(rnd, core);
        b.drop = drop;
        s.blocks.push(b);
      };
      for (const h of c.hits) {
        if (isLow(h) || h.kind === 'perc') { if (s.queue.length < 4) s.queue.push(h.x); }
        else if (h.kind === 'hat' || isTonal(h)) {
          const lit = s.blocks.filter((b) => b.nwin > 0);
          for (let i = 0; i < (h.kind === 'hat' ? 2 : 4) && lit.length; i++) {
            const b = pick(rnd, lit);
            b.lit.set(Math.floor(rnd() * b.nwin), { t: 0.4 + rnd() * 1.2, c: rnd() < 0.3 ? 7 : 8 });
          }
        } else { // a snare flashes a whole floor
          s.strobe = pick(rnd, s.blocks.filter((b) => b.nwin > 0)) || null;
          s.strobeT = 0.12;
        }
      }
      if (beatLocked(c)) { // let go early enough that the box hits on the beat, one per beat
        const left = ((1 - f.beat.phase) * 60) / f.bpm;
        if (s.queue.length && left <= T && s.dropBeat !== f.beat.count) { s.dropBeat = f.beat.count; land(s.queue.shift(), 1 - left / T); }
      } else while (s.queue.length) land(s.queue.shift(), 0);
      if (f.section === 'change') { s.sun = -s.sun; s.sunH = 0.3 + rnd() * 0.6; }
      s.len = follow(s.len, N * 0.032 * (1 + 2.5 * (1 - s.sunH)) * (1 + 0.2 * Math.sin(f.rel.midClock * 0.3)), dt, 1.5);
      const boxes = s.blocks.filter((b) => b.core && !b.die);
      for (let i = 0; i < boxes.length - 26; i++) boxes[i].die = 1e-3;
      for (const b of s.blocks) {
        if (b.drop < 1 && (b.drop = Math.min(1, b.drop + dt / T)) >= 1) s.shake = Math.max(s.shake, 0.8); // it lands
        if (b.die) b.die += dt * 1.5;
        for (const [i, l] of b.lit) if ((l.t -= dt) <= 0) b.lit.delete(i);
      }
      s.blocks = s.blocks.filter((b) => b.die < 1);
      if ((s.strobeT -= dt) <= 0) s.strobe = null;
      s.shake *= Math.exp(-dt * 8);
      s.dy = s.shake > 0.25 ? (rnd() < 0.5 ? -1 : 1) * Math.round(s.shake * 1.5 * px) : 0;
      r.fill(0);
      const horizon = s.ground * N;
      r.rect(0, horizon - N * 0.16, N, N * 0.16, s.sunH < 0.5 ? 11 : 9);
      r.rect(0, horizon + s.dy, N, N - horizon, 3);
      r.rect(0, horizon + s.dy, N, 1, 2);
      // a point h above the plaza throws its shadow this far: away from the sun and toward the viewer, which in
      // this projection is down and skewed left (0.55/0.45 of the depth); `s.len` is the throw of a 0.5 N block
      const q = s.len / (0.5 * N), ux = (-2 * s.sun - 0.73) * q, uy = 0.6 * q;
      for (const b of s.blocks) { // shadows on the plaza, each as long as its block is tall, following a fall
        const X = b.x * N, W = b.w * N, Y = horizon + s.dy, lift = bLift(b);
        const h0 = Math.max(0, (s.ground - b.y - lift) * N), h1 = (s.ground - b.y - lift + b.h) * N;
        if (h1 <= h0) continue;
        r.poly([[X + ux * h0, Y + uy * h0], [X + W + ux * h0, Y + uy * h0], [X + W + ux * h1, Y + uy * h1], [X + ux * h1, Y + uy * h1]], 2);
      }
      for (const b of [...s.blocks].sort((a, b2) => a.z - b2.z || a.x - b2.x)) bDraw(r, b, N, s);
    },
  },

  // Mondrian with the colour odds and balance of 45 real paintings; with a steady beat the edits land on it,
  // one per beat, and hats run boogie-woogie cars along the lines
  destijl: {
    title: 'DE STIJL',
    palette: ['#efebe6', '#221a19', '#f6443a', '#eeb82a', '#30327c', '#dcd8d2'],
    init(s, c) {
      const rnd = c.rnd;
      s.root = dsNode(0, 0, 1, 1, 0);
      s.cars = [];
      s.queue = [];
      for (let i = 0; i < 9; i++) {
        const big = dsLeaves(s.root).sort((a, b) => b.w * b.h - a.w * a.h);
        dsSplit(pick(rnd, big.slice(0, 3)), rnd, 0);
      }
      const leaves = dsLeaves(s.root).sort((a, b) => b.w * b.h - a.w * a.h);
      leaves[1 + Math.floor(rnd() * 2)].col = 2; // one large red field, then small blue, yellow and black
      leaves[4 + Math.floor(rnd() * 3)].col = 4;
      leaves[leaves.length - 2 - Math.floor(rnd() * 2)].col = 3;
      if (rnd() < 0.5) leaves[leaves.length - 1].col = 1;
      dsSettle(s.root);
    },
    draw(s, c, r) {
      const { N, dt, f, rnd, px } = c, lw = Math.max(1, Math.round(N / 55));
      for (const h of c.hits) {
        if (h.kind === 'hat') {
          const lines = dsInner(s.root, (n) => n.line >= 1 && !n.merging);
          if (lines.length) s.cars.push({ n: pick(rnd, lines), p: 0, v: 0.5 + rnd() * 0.8, col: pick(rnd, [2, 3, 4, 5]) });
        } else s.queue.push(h);
      }
      if (s.queue.length > 6) s.queue.splice(0, s.queue.length - 6);
      if (f.section === 'change') for (let k = 0; k < 3; k++) dsEdit(s, rnd, { kind: 'kick', pc: -1, x: rnd(), y: rnd() });
      if (!beatLocked(c)) while (s.queue.length) dsEdit(s, rnd, s.queue.shift());
      else if (f.beat.on && s.queue.length) dsEdit(s, rnd, s.queue.shift());
      dsTick(s.root, dt);
      r.fill(0);
      dsDraw(r, s.root, N, lw);
      s.cars = s.cars.filter((car) => car.n.kids && (car.p += car.v * dt) < 1);
      const sz = lw + 2 * px;
      for (const { n, p, col } of s.cars) {
        const x = n.vert ? (n.x + n.w * n.cut) * N : (n.x + n.w * p) * N;
        const y = n.vert ? (n.y + n.h * p) * N : (n.y + n.h * n.cut) * N;
        r.rect(x - sz / 2, y - sz / 2, sz, sz, col);
      }
    },
  },

  // Streamlines through a noise field, seeded beside each other (Jobard-Lefer) and drawn as outlined ribbons in a
  // weighted palette the way Tyler Hobbs' Fidenza is; a drop squares the curves off for a while
  flow: {
    title: 'FLOW FIELD',
    palette: FLOW_PAL,
    init(s, c) {
      const { N, rnd } = c;
      s.noise = makeNoise(c.seed ^ 0x68e31da4);
      s.bias = rnd() * TAU;
      s.z = rnd() * 10;
      s.lines = [];
      s.occ = new Int32Array(N * N); // id of the stroke covering each pixel, margin included
      s.id = 1;
      s.acc = 0;
      s.fails = 0;
      s.angular = 0;
      // palette weighted 50/25/10/5/5/5, as in Fidenza
      const order = [2, 3, 4, 5, 6, 7, 8].sort(() => rnd() - 0.5);
      s.colour = () => { const u = rnd(); return order[u < 0.5 ? 0 : u < 0.75 ? 1 : u < 0.85 ? 2 : u < 0.9 ? 3 : u < 0.95 ? 4 : 5]; };
      s.order = order;
      for (let i = 0; i < 160; i++) {
        const L = flowAdd(s, N, rnd, rnd(), rnd(), flowWidth(N, rnd), rnd() < 0.08 ? 1 : s.colour(), N * (0.3 + rnd() * 0.6));
        if (L) flowGrow(s, N, L, 4 * N);
      }
    },
    draw(s, c, r) {
      const { N, dt, f, rnd, px } = c;
      const spawn = (x, y, w, col, max) => {
        if (flowAdd(s, N, rnd, x, y, w, rnd() < 0.03 ? 9 : col, max)) return;
        // the page is full: the oldest stroke winds back to make room
        const old = s.lines.find((L) => !L.die);
        if (old && ++s.fails >= 2) { old.die = true; s.fails = 0; }
      };
      for (const h of c.hits) {
        const w = h.kind === 'hat' ? px
          : Math.max(1, Math.round(N * ({ kick: 0.05, bass: 0.04, snare: 0.026, perc: 0.018 }[h.kind] ?? 0.024) * (0.7 + 0.5 * h.strength)));
        const col = isTonal(h) ? s.order[h.pc % 4] : h.kind === 'hat' ? 1 : s.colour();
        for (let k = h.kind === 'hat' ? 3 : 1; k > 0; k--) spawn(h.x + (rnd() - 0.5) * 0.1, h.y + (rnd() - 0.5) * 0.1, w, col, N * (0.3 + 0.6 * h.strength));
      }
      if (f.section === 'drop') s.angular = 4;
      if (f.section === 'change') s.bias += Math.PI / 2;
      s.angular = Math.max(0, s.angular - dt);
      s.acc += dt * f.level * 2.5; // a held sound keeps drawing even without attacks
      for (; s.acc >= 1; s.acc--) spawn(rnd(), rnd(), flowWidth(N, rnd), s.colour(), N * (0.3 + rnd() * 0.5));
      s.z += 0.015 * dt * (0.25 + 0.75 * Math.min(2, f.rel.midAtt));
      if (f.key && f.tonalAvg > 0.3) s.bias = followAngle(s.bias, (f.key.root / 12) * TAU, dt, 8);
      const steps = Math.max(1, Math.round(N * (0.25 + 0.5 * f.level) * dt));
      for (const L of s.lines) if (!L.done) flowGrow(s, N, L, steps);
      const alive = s.lines.filter((L) => !L.die);
      for (let i = 0; i < alive.length - 110; i++) alive[i].die = true;
      let gone = false;
      for (const L of s.lines)
        if (L.die) {
          L.pts.splice(0, Math.max(1, Math.round(N * 0.6 * dt)));
          gone ||= !L.pts.length;
        }
      if (gone) {
        s.lines = s.lines.filter((L) => L.pts.length);
        s.occ.fill(0);
        for (const L of s.lines) for (const [x, y] of L.pts) flowMark(s, N, x, y, L.w / 2 + 1, L.id);
      }
      r.fill(0);
      for (const L of s.lines) {
        const h = L.w / 2;
        if (L.w <= 1) { for (const [x, y] of L.pts) r.set(x, y, L.col); continue; }
        if (L.w >= 3) for (const [x, y] of L.pts) r.disc(x, y, h + 1, flowEdge(L.col));
        for (const [x, y] of L.pts) {
          if (L.w >= 4) r.disc(x, y, h, L.col);
          else r.rect(x - h, y - h, L.w, L.w, L.col);
        }
      }
    },
  },

  // Datamosh: macroblocks ride a motion field that kicks swap out (old pixels on new motion, the I-frame never
  // comes); Asendorf pixel sorting on hats, torn rows on snares, keyframe slices on the bar
  glitch: {
    title: 'GLITCH',
    palette: GLITCH_PAL,
    init(s, c) {
      const { N, rnd } = c;
      s.noise = makeNoise(c.seed ^ 0x7f4a7c15);
      s.base = new Raster(N);
      s.buf = new Uint8Array(N * N);
      s.tmp = new Uint8Array(N * N);
      s.row = new Uint8Array(N); // scratch for a torn row
      s.px = c.px;
      s.bx = rnd() * 10;
      s.by = rnd() * 10;
      s.cx = 0.3 + rnd() * 0.4;
      s.cy = 0.3 + rnd() * 0.3;
      s.mv = rnd() * 50;
      s.bloom = 0;
      s.tm = 0;
      s.heal = 0;
      glitchBase(s, N, rnd);
      s.buf.set(s.base.buf);
    },
    draw(s, c, r) {
      const { N, dt, f, rnd, px } = c, B = Math.max(3, Math.round(N / 16)), loud = clamp(f.level * 1.3);
      let key = f.section ? 1 : 0, tears = 0, sorts = 0, blocks = 0;
      for (const h of c.hits) {
        if (isLow(h)) { s.mv += 13.7; s.bloom = 0.35; } // a new motion source, no fresh picture
        else if (h.kind === 'snare' || h.kind === 'perc') tears += 2 + Math.round(4 * h.strength);
        else if (h.kind === 'hat') sorts += 2;
        else blocks += 3 + Math.round(4 * h.strength);
      }
      if (f.beat.on && f.beat.count % 4 === 0) key = Math.max(key, 0.5);
      if (key) {
        s.bx += 0.3 + rnd() * 0.4;
        s.cx = clamp(s.cx + (rnd() - 0.5) * 0.2, 0.25, 0.75);
        s.cy = clamp(s.cy + (rnd() - 0.5) * 0.2, 0.25, 0.65);
        glitchBase(s, N, rnd);
        tears += 1 + Math.round(rnd() * 2); // keyframes arrive damaged too
        if (key >= 1) s.buf.set(s.base.buf);
        else {
          const y0 = Math.floor(rnd() * N * 0.7), y1 = Math.min(N, y0 + Math.floor(N * (0.15 + 0.35 * key)));
          s.buf.set(s.base.buf.subarray(y0 * N, y1 * N), y0 * N);
        }
      }
      // fresh slices of the keyframe keep arriving, so the picture stays readable under the damage
      for (s.heal += dt * 2; s.heal >= 1; s.heal--) {
        const y0 = Math.floor((rnd() * N) / B) * B;
        s.buf.set(s.base.buf.subarray(y0 * N, Math.min(N, y0 + B) * N), y0 * N);
      }
      s.bloom = Math.max(0, s.bloom - dt);
      const energy = clamp(f.level * 1.4 + f.fluxAvg * 3), m = 1.6 * energy * (s.bloom > 0 ? 2 : 1);
      s.tm += dt * 0.1;
      if (m > 0.3) {
        const src = s.buf, dst = s.tmp;
        for (let by = 0; by < N; by += B)
          for (let bx = 0; bx < N; bx += B) {
            const a = s.noise((bx / B) * 0.15 + s.mv + s.tm, (by / B) * 0.15 - s.mv * 0.7) * TAU * 2;
            const mx = Math.round(Math.cos(a) * m), my = Math.round(Math.sin(a) * m);
            for (let y = by; y < Math.min(N, by + B); y++) {
              const sy = clamp(y - my, 0, N - 1) * N;
              for (let x = bx; x < Math.min(N, bx + B); x++) dst[y * N + x] = src[sy + ((x - mx + N) % N)];
            }
          }
        s.buf = dst;
        s.tmp = src;
      }
      const buf = s.buf, thr = 200 - 140 * loud; // louder: lower threshold, longer spans
      for (let k = 0; k < tears; k++) { // rows torn sideways, their bright runs sorted
        const y0 = Math.floor(rnd() * N), sh = Math.round((rnd() - 0.5) * N * 0.5);
        for (let y = y0; y < Math.min(N, y0 + 1 + Math.floor(rnd() * N * 0.04)); y++) {
          const row = s.row;
          row.set(buf.subarray(y * N, y * N + N));
          for (let x = 0; x < N; x++) buf[y * N + x] = row[(((x - sh) % N) + N) % N];
          sortSpans(buf, N, y * N, 1, N, thr);
        }
      }
      for (let k = 0; k < sorts + Math.round(f.rel.trebDrive * 2); k++) { // bright drips down a few columns
        const x0 = Math.floor(rnd() * N);
        for (let x = x0; x < Math.min(N, x0 + 1 + Math.floor(rnd() * N * 0.06)); x++) sortSpans(buf, N, x, N, N, thr);
      }
      for (let k = 0; k < blocks; k++) { // broken macroblocks
        const bx = Math.floor((rnd() * N) / B) * B, by = Math.floor((rnd() * N) / B) * B;
        const fill = rnd() < 0.5 ? pick(rnd, [8, 9, 10, 4, 7, 1]) : -1;
        const sx = Math.floor((rnd() * N) / B) * B, sy = Math.floor((rnd() * N) / B) * B;
        for (let y = 0; y < B && by + y < N; y++)
          for (let x = 0; x < B && bx + x < N; x++)
            buf[(by + y) * N + bx + x] = fill >= 0 ? fill : buf[Math.min(N - 1, sy + y) * N + Math.min(N - 1, sx + x)];
      }
      r.buf.set(buf);
      if (f.rel.bassDrive > 0.5) { // bass pulls the colour channels apart: red and cyan fringes off bright edges
        const k = (1 + Math.round(f.rel.bassDrive * 3)) * px;
        for (let y = 0; y < N; y++)
          for (let x = k; x < N - k; x++) {
            const i = y * N + x;
            if (GLITCH_LUM[buf[i]] > 90) continue;
            if (GLITCH_LUM[buf[i - k]] > 170) r.buf[i] = 4;
            else if (GLITCH_LUM[buf[i + k]] > 170) r.buf[i] = 8;
          }
      }
    },
  },

  // Analytic cubism: a guitar, bottle and glass seen through facets that each hold their own viewpoint. Hits
  // shatter facets in, chords turn the viewpoints, hats stipple facets
  cubism: {
    title: 'CUBISM',
    palette: ['#efe6cf', '#17130e', '#30271c', '#4d3f2d', '#6e5b40', '#927a55', '#b69c6e', '#d6c08f', '#ebdcb1', '#323b44',
      '#56636e', '#7f8e98', '#a9b6bc'],
    init(s, c) {
      const rnd = c.rnd;
      s.nid = 0;
      s.seeds = Array.from({ length: 30 }, () => cubSeed(s, rnd, ...cubSpot(rnd), 1));
      // everything stands on the table: each object's lowest point sits a little below the table's far edge, the
      // bottle furthest back and the glass nearest, so they read as resting on the top, not floating before it
      const ty = 0.76 + rnd() * 0.05, ga = (rnd() - 0.5) * 0.9, ca = Math.cos(ga);
      s.L = { gx: 0.46 + rnd() * 0.08, gy: ty + 0.03 - 0.12 * ca - 0.15, ga, ca, sa: Math.sin(ga), bx: 0.74 + rnd() * 0.08, by: ty + 0.015 - 0.19,
        cx: 0.2 + rnd() * 0.08, cy: ty + 0.045 - 0.075, ty };
      s.light = 0;
      s.root = -1;
      s.grain = makeGrain(c.N, c.seed);
    },
    draw(s, c, r) {
      const { N, dt, f, rnd, px } = c;
      const turn = (sd) => { sd.to = cubView(rnd, sd.anchored); };
      for (const h of c.hits) {
        if (h.kind === 'hat') {
          const sd = pick(rnd, s.seeds); // a facet takes on (or loses) its stippling
          sd.dots = !sd.dots;
        } else if (isTonal(h)) { // the note turns the facets nearest to it to a new angle and light
          const dist = (sd) => Math.hypot(sd.x - h.x, sd.y - h.y);
          for (const sd of [...s.seeds].sort((a, b) => dist(a) - dist(b)).slice(0, 3)) { sd.turn = (h.pc / 12) * TAU; turn(sd); }
        } else { // a hit shatters the picture where it lands
          for (let i = 2 + Math.round(h.strength * 2); i > 0; i--)
            s.seeds.push(cubSeed(s, rnd, clamp(h.x + (rnd() - 0.5) * 0.16), clamp(h.y + (rnd() - 0.5) * 0.16)));
        }
      }
      const root = f.key && f.tonalAvg > 0.3 ? f.key.root : s.root;
      if (root !== s.root || f.section) { // a new chord or section: many viewpoints move at once
        s.root = root;
        for (const sd of s.seeds) if (rnd() < 0.4) turn(sd);
      }
      const live = s.seeds.filter((sd) => !sd.die);
      for (let i = 0; i < live.length - 40; i++) live[i].die = 1e-3;
      const speed = 0.3 + 3 * clamp(f.fluxAvg * 3);
      for (const sd of s.seeds) {
        sd.grow = Math.min(1, sd.grow + dt * 1.5);
        if (sd.die) sd.die += dt * 1.2;
        sd.vx = (sd.vx + (rnd() - 0.5) * dt * 0.05) * Math.exp(-dt * 0.5);
        sd.vy = (sd.vy + (rnd() - 0.5) * dt * 0.05) * Math.exp(-dt * 0.5);
        sd.x = clamp(sd.x + sd.vx * dt * speed);
        sd.y = clamp(sd.y + sd.vy * dt * speed);
        if (sd.turn !== null) sd.ang = followAngle(sd.ang, sd.turn, dt, 0.6);
        for (const k of ['a', 's', 'ox', 'oy']) sd.view[k] = follow(sd.view[k], sd.to[k], dt, 0.5);
      }
      s.seeds = s.seeds.filter((sd) => sd.die < 1);
      s.light = follow(s.light, (f.bright - 0.5) * 0.3 + f.level * 0.1, dt, 1.5);

      const n = s.seeds.length, P = (0.22 * N) ** 2;
      if (!s.tab || s.tab.sx.length < n) { // per-facet tables, kept between frames
        s.tab = {};
        for (const k of ['sx', 'sy', 'pen', 'gx', 'gy', 'vc', 'vs', 'vk', 'vx', 'vy', 'base']) s.tab[k] = new Float32Array(Math.max(64, n * 2));
        s.tab.ord = Int32Array.from({ length: s.tab.sx.length }, (_, i) => i);
      }
      const { sx, sy, pen, gx, gy, vc, vs, vk, vx, vy, base, ord } = s.tab;
      s.seeds.forEach((sd, k) => {
        sx[k] = sd.x * N;
        sy[k] = sd.y * N;
        pen[k] = P * (1 - ease(sd.grow) * (1 - ease(sd.die))); // facets grow in from nothing and shrink away
        gx[k] = (Math.cos(sd.ang) * sd.k) / N;
        gy[k] = (Math.sin(sd.ang) * sd.k) / N;
        vc[k] = Math.cos(sd.view.a) / sd.view.s;
        vs[k] = Math.sin(sd.view.a) / sd.view.s;
        vk[k] = sd.view.s * N;
        vx[k] = sd.view.ox;
        vy[k] = sd.view.oy;
      });
      const buf = r.buf, g = s.grain, L = s.L;
      for (let k = 0; k < n; k++) ord[k] = k;
      for (let y = 0; y < N; y++) {
        // the row's part of each facet's cost, facets in that order: once the row cost alone is past the second
        // best, no later facet can win, so most pixels look at a handful of facets (same result as all of them)
        const Y = y + 0.5;
        for (let k = 0; k < n; k++) { const dy = Y - sy[k]; base[k] = dy * dy + pen[k]; }
        for (let j = 1; j < n; j++) { // insertion sort: the order barely changes from row to row
          const k = ord[j], bk = base[k];
          let m = j - 1;
          for (; m >= 0 && base[ord[m]] > bk; m--) ord[m + 1] = ord[m];
          ord[m + 1] = k;
        }
        for (let x = 0; x < N; x++) {
          const X = x + 0.5, i = y * N + x;
          let e1 = Infinity, e2 = Infinity, i1 = 0, i2 = 0;
          for (let j = 0; j < n; j++) {
            const k = ord[j], bk = base[k];
            if (bk >= e2) break;
            const dx = X - sx[k], e = dx * dx + bk;
            if (e < e1) { e2 = e1; i2 = i1; e1 = e; i1 = k; } else if (e < e2) { e2 = e; i2 = k; }
          }
          const a = s.seeds[i1], b = s.seeds[i2];
          // the still life through this facet's own viewpoint
          const ux = X / N - 0.5, uy = Y / N - 0.5;
          stillLife(0.5 + vc[i1] * ux - vs[i1] * uy + vx[i1], 0.5 + vs[i1] * ux + vc[i1] * uy + vy[i1], L);
          const id = SL.id;
          // borders between facets are drawn only in places (passage lets tone bleed into the neighbour)
          const gap = (e2 - e1) / (2 * Math.hypot(sx[i2] - sx[i1], sy[i2] - sy[i1]) + 1e-6);
          const edge = (gap < 0.7 * px && !a.passage && !b.passage) || SL.edge * vk[i1] < 0.6 * px;
          const tone = (id === 0 ? a.tone : OBJ_TONE[id] * 0.75 + a.tone * 0.25) + (X - sx[i1]) * gx[i1] + (Y - sy[i1]) * gy[i1] + s.light;
          const cool = id === 0 ? a.cool : OBJ_COOL[id];
          let idx = edge ? 1 : cool ? 9 + quant(tone, 4, g[i], x, y) : 1 + quant(tone, 8, g[i], x, y);
          if (a.dots && !edge && id === 0 && (x + 2 * y) % 3 === 0) idx = Math.max(cool ? 9 : 2, idx - 2);
          buf[i] = idx;
        }
      }
    },
  },

  // Rothko: two or three fields of many faint deformed layers (Hobbs' watercolour), two stacks per field that
  // the music crossfades so the edges breathe, and light coming through from underneath on notes
  rothko: {
    title: 'COLOR FIELD',
    palette: rothkoPalette(ROTHKO[0]),
    init(s, c) {
      const { N, rnd } = c;
      s.palette = rothkoPalette(pick(rnd, ROTHKO));
      s.noise = makeNoise(c.seed ^ 0x3c6ef372);
      s.grain = makeGrain(N, c.seed);
      const mx = 0.08 + rnd() * 0.05, top = 0.07 + rnd() * 0.04, bottom = 0.93 - rnd() * 0.04, gap = 0.05 + rnd() * 0.03;
      const parts = rnd() < 0.35 ? [0.5 + rnd() * 0.1, 0.12, 0.38] : [0.55 + rnd() * 0.15];
      if (parts.length === 1) parts.push(1 - parts[0]);
      if (rnd() < 0.5) parts.reverse();
      const total = parts.reduce((a, b) => a + b, 0), H = bottom - top - gap * (parts.length - 1);
      let y = top;
      s.fields = parts.map((p, i) => {
        const h = (H * p) / total, fl = { x0: mx, x1: 1 - mx, y0: y, y1: y + h, g: 0,
          ramp: i % 2 ? [0, 6, 7, 8] : [0, 1, 2, 3], glow: i % 2 ? [9, 9] : [4, 5] };
        fl.stacks = [washStack(rnd, fl, N, 16), washStack(rnd, fl, N, 16)];
        y += h + gap;
        return fl;
      });
      s.bleed = 0;
      s.breath = 0;
      s.ph = rnd() * TAU;
      s.phTo = s.ph;
    },
    draw(s, c, r) {
      const { N, t, dt, f } = c, fields = s.fields;
      for (const h of c.hits) {
        s.bleed = Math.min(1, s.bleed + 0.25 * h.strength);
        const fl = fields[isTonal(h) ? h.pc % fields.length : isLow(h) ? fields.length - 1 : 0];
        fl.g = Math.min(1, fl.g + 0.35 * h.strength);
      }
      if (f.section === 'change') s.phTo += Math.PI; // the crossfade turns over, in a second rather than a cut
      s.ph = follow(s.ph, s.phTo, dt, 1);
      s.bleed *= Math.exp(-dt / 3);
      s.breath = follow(s.breath, f.level, dt, 2);
      for (const fl of fields) fl.g *= Math.exp(-dt / 4);
      fields[fields.length - 1].g = Math.max(fields[fields.length - 1].g, f.rel.bassDrive * 0.6);
      // the two layer stacks crossfade on an energy clock: slow when quiet, quicker when the music moves
      const mix = 0.5 + 0.5 * Math.sin(s.ph + f.rel.midClock * 0.35), soft = 1 - 0.45 * s.bleed, swell = 1 + 0.15 * s.breath;
      const slow = t * 0.04, ns = s.noise, buf = r.buf, g = s.grain, nf = fields.length;
      const As = fields.map((fl) => fl.stacks[0]), Bs = fields.map((fl) => fl.stacks[1]);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const i = y * N + x;
          let best = null, bq = 0;
          for (let k = 0; k < nf; k++) {
            const a = As[k][i], q = a + (Bs[k][i] - a) * mix;
            if (q > bq) { bq = q; best = fields[k]; }
          }
          bq = Math.min(1, Math.pow(bq, soft) * swell);
          let idx = 0;
          if (best && bq > 0.06) {
            idx = best.ramp[quant(bq, 4, g[i], x, y)];
            if (bq > 0.85 && best.g > 0.03) { // light coming through from under the paint, swelling with the music
              const lum = ((bq - 0.85) / 0.15) * 0.55 + ns.fbm((x / N) * 3 + 11, (y / N) * 4 - slow * 0.7, 3) * 0.75;
              if (lum > 1.12 - best.g * 0.7) idx = best.glow[lum > 1.24 - best.g * 0.5 ? 1 : 0];
            }
          }
          buf[i] = idx;
        }
    },
  },

  // Vera Molnar's (Des)Ordres: a grid of concentric squares, perfectly ordered in the quiet; transients knock the
  // corners loose around where they land and the most shaken squares drop out
  molnar: {
    title: 'MOLNAR',
    palette: ['#f6f4ef', '#161616', '#ff5a00', '#bdb8ad'],
    init(s, c) {
      const rnd = c.rnd;
      s.G = pick(rnd, [5, 6, 7]);
      const most = Math.max(2, Math.floor((c.N / s.G) * 0.42 / 3)); // plotter lines at least 3 px apart
      s.cells = Array.from({ length: s.G * s.G }, () => {
        const k = Math.min(most, 2 + Math.floor(rnd() * 4));
        return { k, jit: Float32Array.from({ length: k * 8 }, () => rnd() * 2 - 1), keep: Float32Array.from({ length: k }, () => rnd()), dis: 0, hot: 0 };
      });
    },
    draw(s, c, r) {
      const { N, dt, f, rnd, px } = c, G = s.G, cs = N / G;
      for (const h of c.hits) {
        const R = 1 + 2.5 * h.strength;
        for (let j = 0; j < G; j++)
          for (let i = 0; i < G; i++) {
            const d = Math.hypot(i + 0.5 - h.x * G, j + 0.5 - h.y * G), cell = s.cells[j * G + i];
            if (d < R) cell.dis = Math.max(cell.dis, h.strength * (1 - d / R));
          }
      }
      if (f.beat.on) s.cells[Math.floor(rnd() * s.cells.length)].hot = 1;
      if (f.section) for (const cell of s.cells) { cell.jit = cell.jit.map(() => rnd() * 2 - 1); cell.dis = Math.max(cell.dis, 0.5); }
      const base = 0.12 * f.rel.trebDrive;
      r.fill(0);
      for (let j = 0; j < G; j++)
        for (let i = 0; i < G; i++) {
          const cell = s.cells[j * G + i];
          cell.dis *= Math.exp(-dt / 2.5);
          cell.hot *= Math.exp(-dt / 0.6);
          const D = clamp(cell.dis + base), cx = (i + 0.5) * cs, cy = (j + 0.5) * cs, col = cell.hot > 0.3 ? 2 : 1, amt = D * cs * 0.22;
          for (let q = 0; q < cell.k; q++) {
            if (cell.keep[q] < D * 0.5) continue;
            const half = (cs * 0.42 * (cell.k - q)) / cell.k, o = q * 8;
            const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v], k) => [cx + u * half + cell.jit[o + k * 2] * amt, cy + v * half + cell.jit[o + k * 2 + 1] * amt]);
            for (let k = 0; k < 4; k++) r.stroke(pts[k][0], pts[k][1], pts[(k + 1) % 4][0], pts[(k + 1) % 4][1], px, col);
          }
        }
    },
  },

  // Bridget Riley's Movement in Squares: a checkerboard whose columns squeeze toward a fold the bass sweeps across;
  // hits light a square
  riley: {
    title: 'OP ART',
    palette: ['#f5f3ee', '#111111', '#ff5a00'],
    init(s, c) {
      const rnd = c.rnd;
      s.C = pick(rnd, [14, 16, 19]);
      s.R = pick(rnd, [10, 12]);
      s.ph = rnd() * TAU;
      s.depth = 0.5;
      s.flash = [];
      s.col = null;
      s.row = null;
    },
    draw(s, c, r) {
      const { N, dt, f } = c, rel = f.rel;
      if (f.section) s.C = s.C === 19 ? 14 : s.C + (s.C === 14 ? 2 : 3);
      s.depth = follow(s.depth, 0.35 + 0.55 * rel.bassDrive + 0.1 * f.beat.pulse, dt, 0.25);
      const fold = 0.5 + 0.38 * Math.sin(rel.bassClock * 0.3 + s.ph), a = Math.min(0.92, s.depth);
      const fold2 = 0.5 + 0.3 * Math.sin(rel.trebClock * 0.21), b = 0.35 * rel.trebDrive;
      if (!s.col || s.col.length !== N) { s.col = new Int32Array(N); s.row = new Int32Array(N); }
      for (let x = 0; x < N; x++) { const u = (x + 0.5) / N; s.col[x] = Math.floor((u + (a * Math.sin(TAU * (u - fold))) / TAU) * s.C + 100); }
      for (let y = 0; y < N; y++) { const v = (y + 0.5) / N; s.row[y] = Math.floor((v + (b * Math.sin(TAU * (v - fold2))) / TAU) * s.R + 100); }
      for (const h of c.hits) s.flash.push({ cx: s.col[Math.min(N - 1, Math.floor(h.x * N))], cy: s.row[Math.min(N - 1, Math.floor(h.y * N))], t: 0.35 });
      s.flash = s.flash.filter((q) => (q.t -= dt) > 0);
      const buf = r.buf;
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const cx = s.col[x], cy = s.row[y];
          let v = (cx + cy) & 1 ? 1 : 0;
          if (v && s.flash.length && s.flash.some((q) => q.cx === cx && q.cy === cy)) v = 2;
          buf[y * N + x] = v;
        }
    },
  },

  // Multi-scale Truchet tiles (Carlson): quarter-arc tiles that split where the sound lands, colours inverting at
  // each scale so the figure stays bold; a few flip on every beat
  truchet: {
    title: 'TRUCHET',
    palette: ['#f4f1ea', '#1b1b1b', '#ff5a00', '#2f5bff'],
    init(s, c) {
      const { N, rnd } = c;
      const n = pick(rnd, [4, 5, 6]);
      s.S = N / n; // n tiles across, whatever N is, so the tiling meets the edges without a gap
      s.tiles = [];
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) s.tiles.push(trNode(rnd, i * s.S, j * s.S, s.S, 0, Math.round((i + 1) * s.S), Math.round((j + 1) * s.S)));
      for (let k = 0; k < 3; k++) trSplit(pick(rnd, s.tiles), rnd, 4 + rnd() * 4);
      s.ink = rnd() < 0.7 ? 1 : 3;
    },
    draw(s, c, r) {
      const { N, dt, f, rnd } = c;
      const leaves = s.tiles.flatMap((t) => trLeaves(t, []));
      for (const h of c.hits) {
        const x = h.x * N, y = h.y * N, leaf = leaves.find((l) => x >= l.x0 && x < l.x1 && y >= l.y0 && y < l.y1);
        if (leaf && leaf.size >= 8) trSplit(leaf, rnd, 2 + 4 * h.strength);
        else if (leaf) { leaf.o ^= 1; leaf.hot = 1; }
      }
      if (f.beat.on) for (let k = 0; k < 3; k++) { const l = pick(rnd, leaves); l.o ^= 1; l.hot = 1; }
      if (f.section) for (const l of leaves) l.o ^= 1;
      for (const t of s.tiles) trTick(t, dt);
      const buf = r.buf;
      for (const l of s.tiles.flatMap((t) => trLeaves(t, []))) {
        const S = l.size, R = S / 2, w = S / 3, odd = l.level % 2 === 1;
        const fig = l.hot > 0.5 ? 2 : odd ? 0 : s.ink, ground = odd ? s.ink : 0;
        const [ax, ay, bx, by] = l.o ? [S, 0, 0, S] : [0, 0, S, S];
        for (let y = Math.max(0, l.y0); y < Math.min(N, l.y1); y++)
          for (let x = Math.max(0, l.x0); x < Math.min(N, l.x1); x++) {
            const lx = x + 0.5 - l.x, ly = y + 0.5 - l.y;
            const band = Math.abs(Math.hypot(lx - ax, ly - ay) - R) < w / 2 || Math.abs(Math.hypot(lx - bx, ly - by) - R) < w / 2;
            buf[y * N + x] = band ? fig : ground;
          }
      }
    },
  },
};
// the stories (te.js), the mixer's families (retro.js, demo.js, popart.js) and which styles each mood shows are
// put together in styles.js
