// The doomer mood, mixed. Twelve pictures of the night between the panel blocks, most of them with a lone figure in a
// hoodie, the hood up and headphones over it: a courtyard of nine-storey blocks with lives switching on and off in the
// windows, a glassed-in balcony and a cigarette, a suburban train through the birches, a concrete bus shelter on an
// empty road, a kitchen with the kettle on the gas, the garages behind the blocks, a dead factory and its crows, a
// stairwell with the lift, a field under the power lines, a tram stop in the snow, a playground swing and a cassette
// player on the sill. Quiet and lonely, never despair acted out: nobody stands at an edge; no text, no brands, no flags,
// no symbols. Every world draws with the palette roles, so any palette, treatment and layout of the mixer fits; each
// has a kinds table weighed by the arousal band, rolled again on a section change, with its heavy turn on a drop. One
// physics for all: a pinhole camera (size and screen speed as 1/depth, every ground contact on its depth's row, one
// light direction a scene); snow falls at its terminal speed (light flakes, half a metre a second) and drifts with the
// wind; smoke and steam rise and slow as they cool; sparks fly parabolas under one gravity and lose energy as they
// bounce; lamps and swings are pendulums about their pivots, omega = sqrt(g / L) with L to the middle of what hangs;
// wires hang in catenaries; reels turn at omega = v / r; walkers keep a planted foot.
import { clamp, lerp, BAYER } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow, ease,
  beatLocked, hash, pickW, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight. All of them
// sit melancholic–mysterious–calm; the ones that move (the train, the tram, the garage at work) reach focused too
const NIGHT = [[L, L], [L, M], [M, L]], ROLL = [[L, M], [L, L], [M, M], [M, L]];
export const WORLD_DEFS = {
  panelblocks: { name: 'the panel blocks', va: NIGHT, pals: ['sodium', 'panel', 'noir', 'midnight', 'silver', 'bureau'], fx: ['none', 'film', 'vhs'], themes: ['night', 'lonely', 'street'] },
  balconysmoke: { name: 'the glassed balcony', va: NIGHT, pals: ['sodium', 'midnight', 'noir', 'tape', 'sepia', 'panel'], fx: ['none', 'film', 'vhs'], themes: ['lonely', 'night'] },
  elektrichka: { name: 'the night train', va: ROLL, pals: ['sodium', 'midnight', 'noir', 'phosphor', 'ice', 'silver'], fx: ['none', 'vhs', 'film', 'crt'], themes: ['lonely', 'speed', 'night'] },
  busstop: { name: 'the bus shelter', va: NIGHT, pals: ['sodium', 'panel', 'noir', 'ice', 'silver', 'bureau'], fx: ['none', 'film', 'vhs'], themes: ['lonely', 'night', 'street'] },
  kitchen: { name: 'the night kitchen', va: NIGHT, pals: ['sodium', 'tape', 'sepia', 'midnight', 'bureau', 'panel'], fx: ['none', 'film', 'vhs'], themes: ['lonely', 'night', 'dream'] },
  garages: { name: 'the garages', va: ROLL, pals: ['sodium', 'noir', 'tape', 'bureau', 'panel', 'silver'], fx: ['none', 'film', 'vhs', 'crt'], themes: ['street', 'machine', 'night'] },
  factory: { name: 'the dead factory', va: NIGHT, pals: ['noir', 'silver', 'panel', 'sodium', 'sepia', 'bureau'], fx: ['none', 'film', 'vhs', 'mirror'], themes: ['void', 'lonely', 'machine'] },
  stairwell: { name: 'the stairwell', va: NIGHT, pals: ['bureau', 'panel', 'sodium', 'phosphor', 'noir', 'tape'], fx: ['none', 'vhs', 'crt', 'film'], themes: ['lonely', 'paranoia', 'night'] },
  snowfield: { name: 'the field under the wires', va: NIGHT, pals: ['ice', 'silver', 'panel', 'midnight', 'noir', 'sodium'], fx: ['none', 'film', 'mirror'], themes: ['lonely', 'void', 'nature'] },
  tramstop: { name: 'the tram stop', va: ROLL, pals: ['sodium', 'midnight', 'noir', 'ice', 'tape', 'silver'], fx: ['none', 'film', 'vhs'], themes: ['night', 'street', 'lonely'] },
  playground: { name: 'the night playground', va: NIGHT, pals: ['sodium', 'midnight', 'panel', 'ice', 'sepia', 'noir'], fx: ['none', 'film', 'vhs', 'mirror'], themes: ['lonely', 'play', 'night'] },
  cassette: { name: 'the cassette on the sill', va: NIGHT, pals: ['tape', 'sodium', 'sepia', 'midnight', 'phosphor', 'silver'], fx: ['none', 'vhs', 'crt', 'film'], themes: ['dream', 'lonely', 'machine'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the kinds tables weigh their variants by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bps = (f) => (f.bpm ? f.bpm / 60 : 2);
const mx1 = (u) => Math.max(1, u);
const dim = (c) => (c < DIM ? c + DIM : c);
const G = 9.8; // gravity, metres a second squared: the scenes are laid out in metres and seen through a camera
const SNOW_V = 0.6; // light snow's terminal speed, metres a second
// a beat tick: the beat itself when locked, else counted out at the guessed tempo
const tick = (w, f, dt) => (beatLocked(f) ? f.beat.on : (w.tickT = (w.tickT || 0) + dt * bps(f)) >= 1 && ((w.tickT %= 1), true));
// a clock in beats: the analysis's count and phase while it has the tempo, else free-running at the guessed tempo
const beatT = (w, f, dt) => (w.bt = beatLocked(f) ? f.beat.count + f.beat.phase : (w.bt || 0) + dt * bps(f));
// a lit cell is the next step up the value ramp, a dimmed one comes back to full; the background and the accents stay
const LIT = Uint8Array.from({ length: 18 }, (_, c) => (c === DARK ? MID : c === MID ? LMID : c === LMID ? BRIGHT : c >= DIM && c < BLACK ? c - DIM : c));
// a shaded cell is the next step down: the value ramp a step darker, the accents dimmed
const SHADE = Uint8Array.from({ length: 18 }, (_, c) => (c === BRIGHT ? LMID : c === LMID ? MID : c === MID ? DARK : c === DARK || c === HOT || c === COOL ? c + DIM : c));
const LIFE = [BRIGHT, BRIGHT, HOT, COOL]; // what is on behind a window: a lamp, a kitchen, a shade, a television
const ONE = [-1, 1];
// the ordered dither's threshold at a cell, read straight from the table (a call that is not inlined boxes the number)
const bay = (x, y) => BAYER[((y & 7) << 3) | (x & 7)];
// a list kept in place: the newest `cap`, then the living ones (no new array a frame)
function trim(list, cap) { if (list.length > cap) { list.copyWithin(0, list.length - cap); list.length = cap; } return list; }
function prune(list, alive) { let n = 0; for (let i = 0; i < list.length; i++) if (alive(list[i])) list[n++] = list[i]; list.length = n; return list; }

// a pinhole camera: (cx, hor) the vanishing point, F the focal length in cells, Hc the eye height in metres; a point
// X across, Y up, z ahead (metres) lands at (sx, sy): sizes go as F / z and the ground meets the horizon
const cam = (cx, hor, F, Hc) => ({ cx, hor, F, Hc });
const sx = (C, X, z) => C.cx + (X * C.F) / z;
const sy = (C, Y, z) => C.hor - ((Y - C.Hc) * C.F) / z;
const zRow = (C, y) => (C.Hc * C.F) / Math.max(1e-3, y + 0.5 - C.hor); // the depth of the ground on row y
const P3 = (C, X, Y, z) => [sx(C, X, z), sy(C, Y, z)];

// one row of cells from x0 to x1, clipped, rounded the way Raster.rect rounds
function span(r, y, x0, x1, c) {
  const N = r.N;
  y = Math.round(y);
  if (y < 0 || y >= N) return;
  const a = Math.max(0, Math.round(x0)), b = Math.min(N, Math.round(x1));
  if (b > a) r.buf.fill(c, y * N + a, y * N + b);
}
// one column of cells from y0 to y1, clipped
function vcol(r, x, y0, y1, c) {
  const N = r.N;
  x = Math.round(x);
  if (x < 0 || x >= N) return;
  const a = Math.max(0, Math.round(y0)), b = Math.min(N, Math.round(y1));
  for (let i = a * N + x, e = b * N; i < e; i += N) r.buf[i] = c;
}
// a filled ellipse, a row at a time
function ell(r, cx, cy, rx, ry, c) {
  if (!(rx > 0 && ry > 0)) return;
  const N = r.N, y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(N - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const q = (y + 0.5 - cy) / ry;
    if (q * q >= 1) continue;
    const hw = rx * Math.sqrt(1 - q * q), a = Math.max(0, Math.round(cx - hw)), b = Math.min(N, Math.round(cx + hw));
    if (b > a) r.buf.fill(c, y * N + a, y * N + b);
  }
}
// Polygons without garbage: Raster.poly (and Raster.stroke through it) sorts a new array on every row it fills, a
// megabyte a frame in the hall. These fill from fixed scratch buffers, even-odd through the cells' middles as
// Raster.poly: the cells where the dither is under `dens` set to c, or with c < 0 lit a step up the value ramp; `hole`
// [x0, y0, x1, y1] a box left alone
const PB = new Float64Array(256), XS = new Float64Array(128);
function fillPB(r, n, c, dens, hole) {
  const N = r.N, buf = r.buf, solid = dens >= 1 && c >= 0 && !hole;
  let top = Infinity, bot = -Infinity;
  for (let i = 1; i < 2 * n; i += 2) { top = Math.min(top, PB[i]); bot = Math.max(bot, PB[i]); }
  for (let y = Math.max(0, Math.floor(top)), ye = Math.min(N, Math.ceil(bot)); y < ye; y++) {
    const yc = y + 0.5;
    let m = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ya = PB[2 * j + 1], yb = PB[2 * i + 1];
      if ((ya <= yc) === (yb <= yc)) continue;
      const v = PB[2 * j] + ((yc - ya) / (yb - ya)) * (PB[2 * i] - PB[2 * j]);
      let k = m++;
      for (; k > 0 && XS[k - 1] > v; k--) XS[k] = XS[k - 1]; // in order as they come
      XS[k] = v;
    }
    for (let k = 0; k + 1 < m; k += 2) {
      const xa = Math.max(0, Math.round(XS[k])), xb = Math.min(N, Math.round(XS[k + 1]));
      if (!(xb > xa)) continue;
      if (solid) { buf.fill(c, y * N + xa, y * N + xb); continue; }
      for (let x = xa, i = y * N + xa; x < xb; x++, i++)
        if (BAYER[((y & 7) << 3) | (x & 7)] < dens && !(hole && x >= hole[0] && x < hole[2] && y >= hole[1] && y < hole[3])) buf[i] = c < 0 ? LIT[buf[i]] : c;
    }
  }
}
function poly(r, pts, c, dens = 1, hole = null) {
  const n = Math.min(pts.length, 120);
  for (let i = 0; i < n; i++) { PB[2 * i] = pts[i][0]; PB[2 * i + 1] = pts[i][1]; }
  fillPB(r, n, c, dens, hole);
}
// a line `w` wide as a filled quad, thin ones Bresenham (as Raster.stroke)
function strk(r, x0, y0, x1, y1, w, c) {
  if (w <= 1.2) { r.line(x0, y0, x1, y1, c); return; }
  const len = Math.hypot(x1 - x0, y1 - y0) || 1, nx = (-(y1 - y0) / len) * (w / 2), ny = ((x1 - x0) / len) * (w / 2);
  PB[0] = x0 + nx; PB[1] = y0 + ny; PB[2] = x1 + nx; PB[3] = y1 + ny; PB[4] = x1 - nx; PB[5] = y1 - ny; PB[6] = x0 - nx; PB[7] = y0 - ny;
  fillPB(r, 4, c, 1, null);
}
// a quad seen through the camera, without building arrays: the points (Xa, Ya) and (Xb, Yb) at depth z0, the same two
// at z1; and a line between two camera points
function slab(r, C, Xa, Ya, Xb, Yb, z0, z1, c, dens = 1) {
  PB[0] = sx(C, Xa, z0); PB[1] = sy(C, Ya, z0); PB[2] = sx(C, Xb, z0); PB[3] = sy(C, Yb, z0);
  PB[4] = sx(C, Xb, z1); PB[5] = sy(C, Yb, z1); PB[6] = sx(C, Xa, z1); PB[7] = sy(C, Ya, z1);
  fillPB(r, 4, c, dens, null);
}
const line3 = (r, C, X0, Y0, z0, X1, Y1, z1, c) => r.line(sx(C, X0, z0), sy(C, Y0, z0), sx(C, X1, z1), sy(C, Y1, z1), c);
// light falling on the ground plane round (X0, z0), R metres across: exact (a row is one depth), brighter to the middle;
// none of it past a wall at X = Xmin or behind one at z = zMax
function groundPool(r, C, X0, z0, R, k, Xmin = -Infinity, zMax = Infinity) {
  if (k <= 0) return;
  const N = r.N, buf = r.buf, ya = Math.max(Math.ceil(C.hor), Math.ceil(sy(C, 0, Math.min(zMax, z0 + R)))), yb = Math.min(N - 1, Math.floor(sy(C, 0, Math.max(0.3, z0 - R))));
  for (let y = ya; y <= yb; y++) {
    const z = zRow(C, y), dz = z - z0, w2 = R * R - dz * dz;
    if (w2 <= 0 || z > zMax) continue;
    const hw = Math.sqrt(w2), xa = Math.max(0, Math.round(sx(C, Math.max(Xmin, X0 - hw), z))), xb = Math.min(N, Math.round(sx(C, X0 + hw, z)));
    for (let x = xa; x < xb; x++) {
      const X = ((x + 0.5 - C.cx) * z) / C.F - X0, e = 1 - (X * X + dz * dz) / (R * R);
      if (BAYER[((y & 7) << 3) | (x & 7)] < e * k) buf[y * N + x] = LIT[buf[y * N + x]];
    }
  }
}
// light on whatever is in an ellipse round (cx, cy), lit a step, thinner toward the rim
function glow(r, cx, cy, rx, ry, k) {
  if (!(rx > 0.5 && ry > 0.5) || k <= 0) return;
  const N = r.N, buf = r.buf, y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(N - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const q = (y + 0.5 - cy) / ry, qq = 1 - q * q;
    if (qq <= 0) continue;
    const hw = rx * Math.sqrt(qq), a = Math.max(0, Math.round(cx - hw)), b = Math.min(N, Math.round(cx + hw));
    for (let x = a; x < b; x++) { const dx = (x + 0.5 - cx) / rx; if (bay(x, y) < (qq - dx * dx) * k) buf[y * N + x] = LIT[buf[y * N + x]]; }
  }
}
// the night sky's glow off the town under the snow cloud, thicker toward the horizon: rows y0..y1, columns x0..x1
function skyGlow(r, y0, y1, k, x0 = 0, x1 = r.N) {
  const N = r.N, buf = r.buf, a = Math.max(0, Math.round(y0)), b = Math.min(N, Math.round(y1)), xa = Math.max(0, Math.round(x0)), xb = Math.min(N, Math.round(x1));
  for (let y = a; y < b; y++) { const q = k * ((y - a) / Math.max(1, b - a)) ** 2; for (let x = xa, i = y * N + xa; x < xb; x++, i++) if (bay(x, y) < q) buf[i] = DARK; }
}
// a far ragged line (a forest's edge, a treeline) at depth z, a column at a time: h0 to h0 + dh metres high, eased
// between points `per` metres apart along it (the column's X at that depth, X0 in the middle), down to row yb
function treeline(r, C, X0, z, h0, dh, per, yb, c) {
  for (let x = 0; x < r.N; x++) { const X = X0 + ((x + 0.5 - C.cx) * z) / C.F, q = X / per, i0 = Math.floor(q), fr = q - i0; vcol(r, x, sy(C, h0 + dh * (hash(i0, 3) * (1 - fr) + hash(i0 + 1, 3) * fr), z), yb, c); }
}
// the cells of a box lit a step up where the dither is under k
function litBox(r, x0, y0, x1, y1, k) {
  const N = r.N, buf = r.buf, xa = Math.max(0, Math.round(x0)), xb = Math.min(N, Math.round(x1));
  for (let y = Math.max(0, Math.round(y0)), ye = Math.min(N, Math.round(y1)); y < ye; y++) for (let x = xa, i = y * N + xa; x < xb; x++, i++) if (bay(x, y) < k) buf[i] = LIT[buf[i]];
}
// a soft round puff: the cells of a disc where the dither is under `dens`, thinner toward the rim
function haze(r, cx, cy, R, c, dens) {
  if (R < 0.5 || dens <= 0) return;
  const N = r.N, buf = r.buf, R2 = R * R, x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(N - 1, Math.ceil(cx + R));
  for (let y = Math.max(0, Math.floor(cy - R)), y1 = Math.min(N - 1, Math.ceil(cy + R)); y <= y1; y++)
    for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy, e = (dx * dx + dy * dy) / R2; if (e < 1 && bay(x, y) < dens * (1 - e)) buf[y * N + x] = c; }
}
// smoke, steam and breath: a puff leaves at (vx, vy) and the air takes that speed off it in `drag` seconds, it rises
// toward a speed v0 that dies away as its heat does (tau seconds: it slows as it climbs), drifts toward the wind, grows
// and thins out until it is gone; the newest `cap` kept, the list kept in place
const puff = (x, y, vx, vy, v0, tau, life, grow, drag = 0.5) => ({ x, y, vx, vy, v0, tau, life, grow, drag, age: 0 });
function plume(W, list, wind, c, dens = 0.7, cap = 64) {
  const { r, dt, u } = W;
  trim(list, cap);
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    p.age += dt;
    p.vy = follow(p.vy, -p.v0 * Math.exp(-p.age / p.tau), dt, Math.min(0.3, p.drag));
    p.vx = follow(p.vx, wind, dt, p.drag);
    p.x += p.vx * dt; p.y += p.vy * dt;
    haze(r, p.x, p.y, (0.7 + p.age * p.grow) * u, c, dens * (1 - p.age / p.life));
    if (p.age < p.life) list[n++] = p;
  }
  list.length = n;
  return list;
}
// snow: flakes at depths d from 1 (the nearest) to 4, the screen speeds and the size as 1/d: the fall a steady terminal
// speed (`fall` screens a second at d 1; light flakes come down at half a metre a second), the drift the wind's (`wind`,
// the same units) and a flutter (`flut`, a quarter of the fall); each lands on the ground at its own depth (`gy(d)`, a
// screen row) and comes down again from the top; in the box x0..x1 below y0
function snowStep(W, list, want, wind, fall, gy, x0 = 0, x1 = W.N, y0 = 0, flut = 0.27 * fall) {
  const { N, dt, t, rnd } = W, bw = x1 - x0;
  while (list.length < want) { const d = 1 + rnd() * 3; list.push({ x: x0 + rnd() * bw, y: y0 + rnd() * (gy(d) - y0), d, s: rnd() * TAU }); }
  if (list.length > want) list.length = want;
  for (let i = 0; i < list.length; i++) {
    const fl = list[i], k = 1 / fl.d;
    fl.y += fall * N * k * dt;
    fl.x += (wind + flut * Math.sin(t * 1.9 + fl.s)) * N * k * dt;
    if (fl.x < x0) fl.x += bw; else if (fl.x >= x1) fl.x -= bw;
    if (fl.y > gy(fl.d)) { fl.y = y0 - rnd() * 0.04 * N; fl.x = x0 + rnd() * bw; }
  }
}
// the flakes from d0 to d1 (the layers between what they fall behind and in front of), none above `top` (the window
// they are seen through)
function snowDraw(r, list, u, d0, d1, lit, top = 0) {
  for (let i = 0; i < list.length; i++) {
    const fl = list[i];
    if (fl.d < d0 || fl.d >= d1 || fl.y < top) continue;
    const sz = Math.max(1, Math.round((1.7 * u) / fl.d));
    r.rect(fl.x, fl.y, sz, sz, lit && lit(fl.x, fl.y, fl.d) ? BRIGHT : fl.d < 2 ? LMID : dim(LMID));
  }
}
// a wire between (x0, y0) and (x1, y1) on the screen (y down, x0 < x1) hanging as a catenary of parameter `a` cells
// (the smaller, the deeper the sag; a = span^2 / 8 sag for a shallow one): the vertex sits where the two supports agree
function catOf(x0, y0, x1, y1, a) {
  const xv = (x0 + x1) / 2 + a * Math.asinh((y1 - y0) / (2 * a * Math.sinh((x1 - x0) / (2 * a))));
  return { xv, yv: y0 + a * (Math.cosh((x0 - xv) / a) - 1), a };
}
const catY = (c, x) => c.yv - c.a * (Math.cosh((x - c.xv) / c.a) - 1);
const aSag = (len, sag) => (len * len) / (8 * Math.max(0.05, sag));
function wire(r, x0, y0, x1, y1, a, col) {
  const c = catOf(x0, y0, x1, y1, a), xa = Math.max(0, Math.ceil(x0)), xb = Math.min(r.N - 1, Math.floor(x1));
  let py = null;
  for (let x = xa; x <= xb; x++) {
    const y = Math.round(catY(c, x + 0.5));
    if (py !== null && Math.abs(y - py) > 1) vcol(r, x, Math.min(y, py) + 1, Math.max(y, py), col);
    r.set(x, y, col);
    py = y;
  }
  return c;
}
// a pendulum `p` = { a, v }: its angle from the vertical and the rate, `len` metres long, damped `c` a second, pushed by
// an angular acceleration `acc`; in steps short enough to stay stable through a long frame
function swing(p, dt, len, c, acc = 0) {
  const n = Math.ceil(dt / 0.01), h = dt / n, k = G / len;
  for (let i = 0; i < n; i++) { p.v += (-k * Math.sin(p.a) - c * p.v + acc) * h; p.a += p.v * h; }
}
// braking to a stop `d` metres on from speed v at the steady deceleration that does it, a = v^2 / 2d: the way gone this
// frame at the mean of the speeds before and after keeps that deceleration the same frame to frame, and it stops right
// there; returns [the new speed, the way gone] in BRAKE
const BRAKE = new Float64Array(2);
function brake(v, d, dt) {
  const a = (v * v) / (2 * Math.max(1e-3, d)), v1 = Math.max(0, v - a * dt);
  BRAKE[0] = v1; BRAKE[1] = v1 > 0 ? ((v + v1) / 2) * dt : Math.max(0, d);
  return BRAKE;
}
// a damped spring `o` = { x, v } toward `to`
function spring(o, dt, k, c, to = 0) {
  const n = Math.ceil(dt / 0.012), h = dt / n;
  for (let i = 0; i < n; i++) { o.v += (-k * (o.x - to) - c * o.v) * h; o.x += o.v * h; }
}
// sparks: hot bits flying parabolas (screen cells, gravity g cells/s^2), bouncing off the floor `gy` losing most of
// their speed, cooling from bright through hot to dim, drawn as the streak they made this frame, hidden below `clip`
// (behind an edge in front of that floor); the list kept in place
function sparks(W, list, g, gy, clip = Infinity) {
  const { r, dt } = W;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i], ox = p.x, oy = p.y;
    p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.y > gy && p.vy > 0) { p.y = gy; p.vy *= -0.32; p.vx *= 0.55; }
    if (p.y <= clip) r.line(ox, Math.min(oy, clip), p.x, p.y, p.life > p.hot ? BRIGHT : p.life > p.hot * 0.4 ? HOT : dim(HOT));
    if (p.life > 0) list[n++] = p;
  }
  list.length = n;
  return list;
}
function spray(list, rnd, x, y, n, sp, a0, a1, life) {
  for (let k = 0; k < n; k++) { const a = a0 + rnd() * (a1 - a0), v = sp * (0.4 + 0.6 * rnd()), l = life * (0.5 + 0.5 * rnd()); list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, hot: l * 0.6 }); }
}

// a walk with a planted foot: each foot's offset from the hips runs a triangle wave of the gait phase, so the foot on
// the ground goes back exactly as fast as the hips go on (it stays put) while the other swings through at twice the
// pace, lifted; the phase goes on by the distance walked over 0.1 h a radian, a step pi 0.1 h long
const tri = (p) => (2 / Math.PI) * Math.asin(Math.max(-1, Math.min(1, Math.sin(p))));
const stepPh = (ph, dx, h) => ph + Math.abs(dx) / (0.1 * h);
// The lone figure from the side: a hoodie with the hood up and the headphones over it (the band, the near cup, the
// cord to the pocket), the hands in the front pocket, trousers, trainers. `x` the hips, `base` the feet, `h` tall
// standing. o.dir faces it; o.walk with o.ph (the gait phase above), o.lift and o.stride (the share of the step seen
// across the picture, under 1 when it walks partly toward or away from us); o.sit with o.seat (the hips' row) and
// o.feet (the floor's); o.lean tips the body forward (rad), o.nod bows the head (0..1); o.hand puts the near hand there
// (else in the pocket); o.face the shade in the hood (false: turned away, all hood); o.cups the headphones' role.
function hood(r, x, base, h, col, o = {}) {
  const d = o.dir || 1, far = dim(col), lw = mx1(h * 0.09), seg = h * 0.265, lean = o.lean || 0, nod = o.nod || 0, ph = o.ph || 0, cups = o.cups ?? LMID;
  const hipY = o.sit ? o.seat : base - h * (o.walk ? 0.49 + 0.015 * Math.abs(Math.cos(ph)) : 0.5);
  // a point in the body's frame (u forward, v up from the hips), tipped forward by the lean
  const cl = Math.cos(lean), sl = Math.sin(lean), P = (uu, vv) => [x + d * (uu * cl + vv * sl), hipY - (vv * cl - uu * sl)];
  // a leg to its foot: the knee found from the two segments, bent toward the facing; the trainer under it
  const leg = (fx, fy, c) => {
    const dx = fx - x, dy = fy - hipY, dd = Math.hypot(dx, dy) || 1, m = Math.sqrt(Math.max(0, seg * seg - (dd * dd) / 4));
    const kx = x + dx / 2 + ((d * dy) / dd) * m, ky = hipY + dy / 2 - ((d * dx) / dd) * m;
    strk(r, x, hipY, kx, ky, lw, c);
    strk(r, kx, ky, fx, fy, lw, c);
    r.rect(fx - (d > 0 ? 0.03 : 0.09) * h, fy - h * 0.035, h * 0.12, mx1(h * 0.035), c);
  };
  let f1, f2;
  if (o.sit) { f1 = [x + d * h * 0.27, o.feet]; f2 = [x + d * h * 0.2, o.feet]; }
  else if (o.walk) {
    const A = h * 0.157 * (o.stride ?? 1) * tri(ph), lift = h * (o.lift ?? 0.05);
    f1 = [x + d * A, base - lift * Math.max(0, Math.cos(ph))]; f2 = [x - d * A, base - lift * Math.max(0, -Math.cos(ph))];
  } else { f1 = [x + d * h * 0.035, base]; f2 = [x - d * h * 0.03, base]; }
  leg(f2[0], f2[1], far);
  poly(r, [P(-0.105 * h, -0.03 * h), P(0.11 * h, -0.03 * h), P(0.125 * h, 0.18 * h), P(0.085 * h, 0.29 * h), P(-0.05 * h, 0.31 * h), P(-0.125 * h, 0.24 * h)], col);
  leg(f1[0], f1[1], col);
  // the head in the hood, bowed about the neck, the hood draped down onto the back; the face in its shadow at the
  // front; the headphones over the hood (the band, the near cup, the cord to the pocket)
  const nk = P(0, 0.31 * h), na = lean + nod * 0.6, cn = Math.cos(na), sn = Math.sin(na);
  const Hd = (uu, vv) => [nk[0] + d * (uu * cn + vv * sn), nk[1] - (vv * cn - uu * sn)];
  const [hx, hy] = Hd(0.025 * h, 0.065 * h), hr = h * 0.13;
  poly(r, [Hd(-0.1 * h, 0.01 * h), P(-0.125 * h, 0.24 * h), P(0.02 * h, 0.3 * h), Hd(0.03 * h, -0.05 * h)], col);
  r.disc(hx, hy, hr, col);
  poly(r, [Hd(-0.09 * h, 0.13 * h), Hd(-0.05 * h, 0.21 * h), Hd(0.02 * h, 0.19 * h)], col); // the hood's soft point at the back
  const [fx, fy] = Hd(0.085 * h, 0.045 * h);
  if (o.face !== false) ell(r, fx, fy, h * 0.045, h * 0.07, o.face ?? DARK);
  const [cx, cy] = Hd(0, 0.06 * h), [tx, ty] = Hd(-0.012 * h, 0.205 * h), pk = P(0.1 * h, 0.06 * h);
  strk(r, cx, cy, tx, ty, mx1(h * 0.03), cups);
  r.disc(cx, cy, h * 0.05, cups);
  r.line(cx, cy + h * 0.05, pk[0], pk[1], dim(cups));
  // the near arm: the shoulder, the elbow bent back, the hand in the pocket or where it is wanted
  const sh = P(0, 0.27 * h), want = o.hand || pk, au = h * 0.17;
  const dx = want[0] - sh[0], dy = want[1] - sh[1], dd = Math.hypot(dx, dy) || 1, k = Math.min(1, (2 * au) / dd);
  const ha = [sh[0] + dx * k, sh[1] + dy * k], m = Math.sqrt(Math.max(0, au * au - ((dd * k) ** 2) / 4));
  const ex = sh[0] + (dx * k) / 2 - ((d * dy) / dd) * m, ey = sh[1] + (dy * k) / 2 + ((d * dx) / dd) * m;
  strk(r, sh[0], sh[1], ex, ey, mx1(h * 0.075), col);
  strk(r, ex, ey, ha[0], ha[1], mx1(h * 0.07), col);
  return { hx, hy, hr, mx: fx + d * h * 0.04, my: fy + h * 0.025, hand: ha, top: hy - hr };
}
// the figure from behind (o.front: from the front, the face in the hood and the pocket): the hood with the band over it
// and a cup each side, the shoulders, the arms (in the pockets; o.sill: the elbows out on a sill on that row; o.armR the
// right hand there), the legs side by side, the swinging one lifted (o.walk, o.ph as `hood`); o.legs false hides them
function hoodBack(r, x, base, h, col, o = {}) {
  const lw = mx1(h * 0.085), far = dim(col), nod = o.nod || 0, ph = o.ph || 0, cups = o.cups ?? LMID, aw = mx1(h * 0.07);
  if (o.legs !== false) for (const k of ONE) {
    const lift = o.walk ? h * 0.05 * Math.max(0, -k * Math.cos(ph)) : 0, fx = x + k * h * 0.055;
    r.rect(fx - lw / 2, base - h * 0.48, lw, h * 0.48 - lift, k < 0 ? col : far);
    r.rect(fx - lw * 0.65, base - lift - h * 0.03, lw * 1.3, mx1(h * 0.03), k < 0 ? col : far);
  }
  for (const k of ONE) { // the arms, drawn first so the body covers what is behind it
    const shx = x + k * h * 0.12, shy = base - h * 0.75;
    if (o.sill !== undefined) {
      const ex = x + k * h * 0.21, hand = k > 0 && o.armR ? o.armR : [x + k * h * 0.07, o.sill - h * 0.015];
      strk(r, shx, shy, ex, o.sill, aw, col);
      strk(r, ex, o.sill, hand[0], hand[1], aw, col);
    } else { strk(r, shx, shy, x + k * h * 0.14, base - h * 0.58, aw, col); strk(r, x + k * h * 0.14, base - h * 0.58, x + k * h * 0.07, base - h * 0.5, aw, col); }
  }
  poly(r, [[x - h * 0.11, base - h * 0.44], [x + h * 0.11, base - h * 0.44], [x + h * 0.135, base - h * 0.735], [x + h * 0.09, base - h * 0.8], [x - h * 0.09, base - h * 0.8], [x - h * 0.135, base - h * 0.735]], col);
  const hy = base - h * (0.875 - 0.06 * nod), hr = h * 0.125;
  r.disc(x, hy, hr, col);
  if (o.front) { ell(r, x, hy + h * 0.015, h * 0.06, h * 0.072, o.face ?? DARK); r.rect(x - h * 0.07, base - h * 0.57, h * 0.14, mx1(h * 0.05), far); r.line(x - h * 0.105, hy + h * 0.03, x - h * 0.04, base - h * 0.56, dim(cups)); }
  else vcol(r, x, hy - hr * 0.9, hy + hr * 0.7, far); // the seam down the back of the hood
  for (let k = 0; k < 8; k++) { // the band over the top, cup to cup
    const a0 = Math.PI * (1.12 + (0.76 * k) / 8), a1 = Math.PI * (1.12 + (0.76 * (k + 1)) / 8), R = hr * 1.08;
    strk(r, x + Math.cos(a0) * R, hy + Math.sin(a0) * R, x + Math.cos(a1) * R, hy + Math.sin(a1) * R, mx1(h * 0.022), cups);
  }
  for (const k of ONE) r.disc(x + k * hr * 0.98, hy + h * 0.015, h * 0.04, cups);
  return { hx: x, hy, hr, top: hy - hr };
}
// a cat sitting up, in profile facing dir: the haunch, the upright chest and front legs, the head turned by `look`
// (-1 away .. 1 toward dir, 0 at us) with its two ears, the tail hanging over the edge behind, swung by `tail` (rad)
function cat(r, x, y, h, col, dir, look, tail) {
  ell(r, x - dir * h * 0.1, y - h * 0.22, h * 0.27, h * 0.22, col);
  ell(r, x + dir * h * 0.06, y - h * 0.42, h * 0.15, h * 0.3, col);
  strk(r, x + dir * h * 0.13, y - h * 0.3, x + dir * h * 0.15, y, mx1(h * 0.09), col);
  const hx = x + dir * h * (0.1 + 0.05 * look), hy = y - h * 0.76;
  ell(r, hx, hy, h * 0.17, h * 0.14, col);
  for (const k of ONE) { const ex = hx + (k * 0.09 + 0.04 * look * dir) * h; poly(r, [[ex - h * 0.06, hy - h * 0.06], [ex + k * h * 0.02, hy - h * 0.3], [ex + h * 0.06, hy - h * 0.08]], col); }
  const tx = x - dir * h * 0.33, ty = y - h * 0.06;
  strk(r, tx, ty, tx - dir * Math.sin(tail) * h * 0.25, ty + Math.cos(tail) * h * 0.4, mx1(h * 0.08), col);
}
// a stray dog from the side, `h` at the shoulder, trotting (the diagonal pairs together, each foot planted while it is
// down: `ph` goes on by the distance over 0.22 h a radian), facing dir
const DOG_LEGS = [0.3, Math.PI, -0.38, 0, 0.36, 0, -0.32, Math.PI]; // where on the body, the phase: far front, far back, near
function dog(r, x, g, h, col, ph, dir) {
  const bl = h * 1.3, by = g - h * 0.92, lw = mx1(h * 0.12), A = h * 0.35;
  for (let j = 0; j < 8; j += 2) {
    const k = DOG_LEGS[j], q = ph + DOG_LEGS[j + 1], sw = A * tri(q), lift = Math.max(0, Math.cos(q)) * h * 0.12;
    strk(r, x + dir * k * bl, by + h * 0.1, x + dir * (k * bl + sw), g - lift, lw, j < 4 ? dim(col) : col);
  }
  ell(r, x, by, bl * 0.5, h * 0.22, col);
  strk(r, x + dir * bl * 0.42, by - h * 0.05, x + dir * bl * 0.6, by - h * 0.32, mx1(h * 0.16), col);
  ell(r, x + dir * bl * 0.65, by - h * 0.36, h * 0.16, h * 0.12, col);
  strk(r, x + dir * bl * 0.72, by - h * 0.34, x + dir * bl * 0.88, by - h * 0.28, mx1(h * 0.09), col);
  poly(r, [[x + dir * bl * 0.58, by - h * 0.43], [x + dir * bl * 0.62, by - h * 0.6], [x + dir * bl * 0.68, by - h * 0.45]], col);
  strk(r, x - dir * bl * 0.46, by - h * 0.05, x - dir * bl * 0.7, by - h * (0.22 + 0.08 * Math.sin(ph * 2)), mx1(h * 0.07), col);
}
// a crow, `s` long: perched (a body, a beak, the tail down) or in the air (the wings beating with `ph`)
function crow(r, x, y, s, col, fly, ph, dir) {
  if (!fly) {
    ell(r, x, y - s * 0.3, s * 0.32, s * 0.24, col);
    r.disc(x + dir * s * 0.3, y - s * 0.52, s * 0.15, col);
    r.line(x + dir * s * 0.42, y - s * 0.52, x + dir * s * 0.6, y - s * 0.47, col);
    r.line(x - dir * s * 0.3, y - s * 0.22, x - dir * s * 0.55, y - s * 0.02, col);
    return;
  }
  const fl = Math.sin(ph) * s * 0.45;
  ell(r, x, y, s * 0.28, s * 0.12, col);
  strk(r, x - s * 0.05, y, x - s * 0.5, y - fl, mx1(s * 0.12), col);
  strk(r, x + s * 0.05, y, x + s * 0.5, y - fl, mx1(s * 0.12), col);
  r.set(x + dir * s * 0.34, y - s * 0.04, col);
}

// ---------------------------------------------------------------------------------------------- panelblocks
// A courtyard of nine-storey panel blocks at night in perspective: the near block's face receding at the left with the
// entrance under its canopy lamp, the block across the yard square on, a far one beyond; grids of windows, a few lit,
// switching on and off on the hats (a life behind each: a lamp, a kitchen, a shade, a television flickering with the
// treble), a tonal hit lighting one in its colour; the hooded figure by the door in the lamp's pool (its shadow thrown
// away from the lamp, a breath on the cold air every other beat, the head nodding to the beat), the lamp flickering on
// the snares, snow falling (bright where it crosses the lamp's light), a gust on the kicks, a cat on the bench in front
// turning its head to each window that lights. The kind is the night: late (a few windows), evening (more, the
// televisions), a blizzard. A drop puts every window out but one, a wave of dark spreading from it.
const YARD_W = { late: [3, 2, 1], evening: [2, 3, 2], blizzard: [1, 2, 3] };
const YARD = { late: { lit: 0.14, snow: 70, wind: 0.024 }, evening: { lit: 0.34, snow: 45, wind: 0.012 }, blizzard: { lit: 0.22, snow: 200, wind: 0.21 } };
const TONE = [BRIGHT, HOT, COOL], AERIALS = [0, 2.4, 12, 14.2], CARS = [0.5, 5, 9.5], BENCH = [0.5, 1.9];
const panelblocks = {
  init(W) {
    const { w, rnd } = W, kind = rollW(rnd, YARD_W, bandOf(W.a)), lit = new Uint8Array(198);
    for (let i = 0; i < 198; i++) if (i !== 64 && rnd() < YARD[kind].lit) lit[i] = pick(rnd, LIFE);
    Object.assign(w, { kind, lit, keep: -1, dark: 0, out: new Float32Array(198), flakes: [], breath: [], flick: 0, gust: 0, look: -0.5, lookX: 0, lookT: 0, tailT: 0, odd: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), buf = r.buf;
    const C = cam(0.68 * N, 0.58 * N, 0.55 * N, 1.5), XL = -5, ZF = 46, TOP = 25.8, n = 198;
    if (f.section === 'change') w.kind = rollW(rnd, YARD_W, band);
    const K = YARD[w.kind];
    // a window's place on the screen: the block across (0..62, storey by 7 columns) or the near block's face (63.., by 15)
    const winX = (i) => (i < 63 ? sx(C, XL + 2.3 + 3.1 * (i % 7), ZF) : sx(C, XL, 2.55 + 3.1 * ((i - 63) % 15)));
    let nl = 0;
    for (let i = 0; i < n; i++) if (w.lit[i]) nl++;
    const flip = (col) => { // a life: a light goes on or off, toward the kind's share of lit windows
      const on = nl < K.lit * n;
      for (let k = 0; k < 12; k++) {
        const i = Math.floor(rnd() * n);
        if (i === w.keep || i === 64 || !!w.lit[i] === on) continue;
        w.lit[i] = on ? col || pick(rnd, LIFE) : 0;
        nl += on ? 1 : -1;
        if (on) { w.lookX = winX(i); w.lookT = 2.2; }
        return;
      }
    };
    for (const h of hits) {
      if (h.kind === 'hat' && w.dark <= 0) flip(0);
      else if (h.kind === 'snare') { w.flick = 0.07 + 0.1 * h.strength; w.tailT = 0.4; }
      else if (isLow(h)) w.gust = Math.min(1.2, w.gust + 0.6 * h.strength);
      if (isTonal(h) && h.kind !== 'hat' && w.dark <= 0) flip(TONE[h.pc % 3]);
    }
    if (f.section === 'drop') { // every window out but one, a wave of dark spreading out from it
      const kj = Math.floor(rnd() * 7), kk = 3 + Math.floor(rnd() * 5);
      w.keep = kk * 7 + kj; w.lit[w.keep] = BRIGHT; w.dark = 10;
      for (let i = 0; i < n; i++) w.out[i] = 0.05 + 0.07 * (i < 63 ? Math.hypot((i % 7) - kj, Math.floor(i / 7) - kk) : Math.hypot(kj + 1 + (14 - ((i - 63) % 15)) * 0.5, Math.floor((i - 63) / 15) - kk));
    }
    for (let i = 0; i < n; i++) if (w.out[i] > 0 && (w.out[i] -= dt) <= 0 && i !== w.keep) w.lit[i] = 0;
    if ((w.dark -= dt) <= 0) w.keep = -1;
    w.flick -= dt; w.lookT -= dt; w.tailT -= dt; w.gust *= Math.exp(-dt * 1.2);
    const lampOn = w.flick <= 0 || Math.floor(w.flick * 70) % 3 === 0, wind = K.wind + 0.27 * w.gust + 0.045 * f.rel.bassDrive;
    const tv = (i, c) => (c === COOL && hash(i, Math.floor(t * 9)) < 0.2 + 0.45 * f.rel.trebDrive ? dim(COOL) : c);
    // the sky, the town's glow low under the snow cloud
    const g0 = Math.round(0.16 * N), hy = Math.round(C.hor);
    skyGlow(r, g0, hy, 0.42);
    // the far block beyond the yard, a few dim windows (the same 1.4 by 1.5 m as the near ones, at its depth)
    const fz = 92, fx0 = sx(C, 13, fz), ft = sy(C, TOP, fz), s92 = C.F / fz;
    r.rect(fx0, ft, N - fx0, sy(C, 0, fz) - ft, DARK);
    if (w.dark <= 0) for (let k = 0; k < 9; k++) for (let j = 0; j < 16; j++) if (hash(j * 9 + k, 77 + Math.floor(t / 23)) < 0.2) r.rect(sx(C, 14 + 3.1 * j, fz), sy(C, 2.4 + 2.8 * k, fz), mx1(1.4 * s92), mx1(1.5 * s92), hash(j, k) < 0.5 ? dim(BRIGHT) : dim(HOT));
    // the block across the yard, square on: the parapet, the lift's room and the aerials on the roof, the storey joints
    const ax = sx(C, XL, ZF), bx = sx(C, 17, ZF), ty = sy(C, TOP, ZF), s46 = C.F / ZF;
    r.rect(ax, ty, bx - ax, sy(C, 0, ZF) - ty, DARK);
    r.rect(ax, ty - 0.6 * s46, bx - ax, mx1(0.6 * s46), MID);
    r.rect(sx(C, 6, ZF), ty - 3 * s46, 4 * s46, 3 * s46, DARK);
    for (const X of AERIALS) r.line(sx(C, X, ZF), ty, sx(C, X, ZF), ty - 2.4 * s46, MID);
    for (let k = 0; k < 9; k++) {
      span(r, sy(C, 2.8 * k, ZF), ax, bx, dim(DARK));
      for (let j = 0; j < 7; j++) { const i = k * 7 + j; r.rect(sx(C, XL + 1.6 + 3.1 * j, ZF), sy(C, 2.4 + 2.8 * k, ZF), 1.4 * s46, 1.5 * s46, w.lit[i] ? tv(i, w.lit[i]) : dim(DARK)); }
    }
    // the near block's face, a column at a time (each column one depth along it): the panels, their joints, the windows;
    // the entrance with its door and the stairwell's windows a half storey up, lit
    for (let x = 0, xe = Math.min(N, Math.floor(ax)); x < xe; x++) {
      const z = (XL * C.F) / (x + 0.5 - C.cx);
      if (!(z > 0) || z > ZF) continue;
      const yT = sy(C, TOP, z), yG = sy(C, 0, z), q = z - 1, j = Math.floor(q / 3.1), lo = q - 3.1 * j;
      vcol(r, x, yT, yG, DARK);
      if (lo < 0.1) { vcol(r, x, yT, yG, dim(DARK)); continue; }
      for (let k = 1; k < 9; k++) r.set(x, sy(C, 2.8 * k, z), dim(DARK));
      if (lo < 0.85 || lo > 2.25 || j > 14) continue;
      if (j === 1) {
        vcol(r, x, sy(C, 2.15, z), yG, BLACK);
        if (lo > 1.25 && lo < 1.85) vcol(r, x, sy(C, 1.85, z), sy(C, 1.4, z), dim(BRIGHT));
        for (let k = 0; k < 8; k++) vcol(r, x, sy(C, 2.8 * k + 4.1, z), sy(C, 2.8 * k + 3.3, z), w.dark <= 0 && (k * 3 + Math.floor(t * 0.07)) % 7 ? dim(BRIGHT) : dim(DARK));
        continue;
      }
      for (let k = 0; k < 9; k++) { const i = 63 + k * 15 + j, c = w.lit[i]; vcol(r, x, sy(C, 2.4 + 2.8 * k, z), sy(C, 0.9 + 2.8 * k, z), c ? tv(i, c) : dim(DARK)); }
    }
    // the canopy over the door (seen from below), and the lamp under it lighting the wall
    const LX = -4.55, LY = 2.3, LZ = 5.65, lpx = sx(C, LX, LZ), lpy = sy(C, LY, LZ);
    slab(r, C, XL, 2.4, -3.8, 2.4, 4.6, 6.7, dim(MID));
    slab(r, C, -3.8, 2.4, -3.8, 2.65, 4.6, 6.7, MID);
    r.rect(sx(C, XL, 4.6), sy(C, 2.65, 4.6), sx(C, -3.8, 4.6) - sx(C, XL, 4.6), sy(C, 2.4, 4.6) - sy(C, 2.65, 4.6), MID);
    if (lampOn) glow(r, lpx, lpy + 0.03 * N, 0.11 * N, 0.13 * N, 0.75);
    // the ground: snow from the near block's foot across the yard (past the block across, beyond it), the trodden paths
    for (let y = hy; y < N; y++) {
      const z = zRow(C, y);
      span(r, y, z > ZF ? bx : sx(C, XL, z), N, z > 26 ? dim(LMID) : LMID);
      if (z > 6.2 && z < 44) { const X = -3.9 + (z - 6.2) * 0.36; span(r, y, sx(C, X - 0.55, z), sx(C, X + 0.55, z), MID); }
      if (z > 2 && z < 6.4) { const X = -3.9 + (6.4 - z) * 0.5; span(r, y, sx(C, X - 0.5, z), sx(C, X + 0.5, z), MID); }
    }
    for (const X of CARS) { const s = C.F / 41; ell(r, sx(C, X, 41), sy(C, 0.72, 41), 2.1 * s, 0.72 * s, LMID); span(r, sy(C, 0, 41), sx(C, X - 2, 41), sx(C, X + 2, 41), dim(MID)); } // cars under the snow
    // the yard's lamp on its pole, and the entrance lamp's pool with the figure's shadow thrown away from it
    const s30 = C.F / 30, px = sx(C, 9, 30);
    vcol(r, px, sy(C, 5, 30), sy(C, 0, 30), DARK);
    r.rect(px - 0.8 * s30, sy(C, 5.1, 30), 1.6 * s30, mx1(0.3 * s30), BRIGHT);
    groundPool(r, C, 8.6, 30, 6, 0.7);
    const XF = -4.0, ZP = 6.6;
    if (lampOn) {
      groundPool(r, C, -4.2, 5.9, 3.4, 0.95, XL); // none of it on the far side of the block's wall
      const kk = LY / (LY - 1.75), Sx = LX + (XF - LX) * kk, Sz = LZ + (ZP - LZ) * kk, dl = Math.hypot(XF - LX, ZP - LZ), qx = (-(ZP - LZ) / dl) * 0.18, qz = ((XF - LX) / dl) * 0.18;
      poly(r, [P3(C, XF + qx, 0, ZP + qz), P3(C, Sx + qx * 1.5, 0, Sz + qz * 1.5), P3(C, Sx - qx * 1.5, 0, Sz - qz * 1.5), P3(C, XF - qx, 0, ZP - qz)], MID);
    }
    // the snow (a flake at d lands 2.5 d m off): the flakes beyond the figure behind it, those between it and the bench in
    // front of it, the nearest in front of the bench; bright where they cross the lamps' light
    const gyf = (d) => sy(C, 0, 2.5 * d), dF = ZP / 2.5, dB = 2.6 / 2.5;
    snowStep(W, w.flakes, Math.round(K.snow * u * (0.7 + 0.6 * f.level)), wind, (SNOW_V * C.F) / (2.5 * N), gyf);
    const lit = (x, y, d) => (lampOn && d < 3.4 && y > lpy - 0.01 * N && y < lpy + 0.22 * N && Math.abs(x - lpx) < (y - lpy) * 0.8 + 0.02 * N) || (Math.abs(x - px) < 0.04 * N && y > sy(C, 5, 30) && d > 2.5);
    snowDraw(r, w.flakes, u, dF, 5, lit);
    // the figure, nodding to the beat, a breath on every other one
    const fh = (1.75 * C.F) / ZP, fx = sx(C, XF, ZP), fb = sy(C, 0, ZP);
    const J = hood(r, fx, fb, fh, FIG, { dir: 1, nod: 0.2 + 0.3 * f.beat.pulse });
    if (tick(w, f, dt) && (w.odd = 1 - w.odd)) w.breath.push(puff(J.mx, J.my, 0.05 * N, -0.004 * N, 0.022 * N, 0.5, 1.6, 1.3));
    plume(W, w.breath, wind * N * 0.4, LMID, 0.6, 12); // the snow's wind at the figure's depth
    r.disc(lpx, lpy, mx1((0.12 * C.F) / LZ), lampOn ? BRIGHT : dim(LMID));
    snowDraw(r, w.flakes, u, dB, dF, lit);
    targets.push({ x: fx - fh * 0.2, y: fb - fh, w: fh * 0.4, h: fh });
    if (w.keep >= 0) { const k = Math.floor(w.keep / 7), j = w.keep % 7; targets.push({ x: sx(C, XL + 1.6 + 3.1 * j, ZF), y: sy(C, 2.4 + 2.8 * k, ZF), w: 1.4 * s46, h: 1.5 * s46 }); }
    // the bench in front with snow on it, and the cat
    const bz = 2.6, bs = C.F / bz, bx0 = sx(C, 0.3, bz), by = sy(C, 0.45, bz), bg = sy(C, 0, bz);
    r.rect(bx0, sy(C, 0.95, bz + 0.3), N - bx0, mx1(0.1 * bs), MID);
    r.rect(bx0, sy(C, 0.75, bz + 0.3), N - bx0, mx1(0.1 * bs), MID);
    for (const X of BENCH) r.rect(sx(C, X, bz), by, mx1(0.12 * bs), bg - by, DARK);
    r.rect(bx0, by, N - bx0, mx1(0.08 * bs), MID);
    r.rect(bx0, by - 0.05 * bs, N - bx0, mx1(0.05 * bs), BRIGHT);
    const kx = sx(C, 0.95, bz), ch = 0.32 * bs;
    w.look = follow(w.look, w.lookT > 0 ? clamp((kx - w.lookX) / (0.25 * N), -1, 1) : 0.3, dt, 0.25);
    cat(r, kx, by, ch, FIG, -1, w.look, 0.25 * Math.sin(t * 1.3) + (w.tailT > 0 ? 0.5 * Math.sin(t * 22) : 0));
    targets.push({ x: kx - ch * 0.45, y: by - ch, w: ch * 0.9, h: ch });
    snowDraw(r, w.flakes, u, 1, dB, lit);
  },
};

// ---------------------------------------------------------------------------------------------- balconysmoke
// A glassed-in balcony at night, from the room behind it: the figure from the back leaning on the sill, hood up and the
// headphones on, a cigarette in the hand at the open sash; the ember glows on the kicks, its smoke rises and slows as it
// cools and the wind outside takes it, a breath of smoke from the face every bar (behind the head, round its edges);
// laundry on two lines under the ceiling, each piece a pendulum on its pegs stirred by the treble (a towel swings to and
// from us, a sock about its one peg); across the street the blocks with their windows (one switching on a snare), an old
// aerial on the roof, a mast far off in the gap with its red lamp blinking on the beat, the street below with its lamps
// and tram rails, snow falling. The kind is the weather: snow, wind, a clear frost (stars, frost in the panes' corners).
// A drop is the dawn: the sky pales from the bottom up, the street lamps go out one by one and the first tram's lights
// sweep along the street.
const BALC_W = { snow: [3, 2, 1], wind: [1, 2, 3], frost: [2, 2, 1] };
const PANES = [0.03, 0.265, 0.5, 0.735, 0.97], SASH = [0.655, 0.665, 0.725, 0.735], BAERIAL = [-8, 3.4, -19, 2.6], BRAILS = [29.25, 30.75];
// the laundry hangs at the figure's scale (1.75 m is 0.85 N): each piece a cloth hinged along its top, a physical pendulum
// of L = 2/3 its length; the draught deflects each as much as it always did, its kicks swing it as far
const BALC_M = 0.85 / 1.75, RAMP = [BG, DARK, MID, LMID];
// the sky: the town's glow low down, the dawn paling it from the bottom, on a ramp of three values
function dawnSky(r, hy, g0, dawn) {
  const N = r.N, buf = r.buf;
  for (let y = 0; y < hy; y++) {
    const q = Math.max(y > g0 ? 0.6 * ((y - g0) / (hy - g0)) ** 2 : 0, dawn * (0.25 + 0.75 * (y / hy)) * 3);
    if (q <= 0.02) continue;
    for (let x = 0, i = y * N; x < N; x++, i++) { const k = Math.min(3, Math.floor(q + BAYER[((y & 7) << 3) | (x & 7)])); if (k) buf[i] = RAMP[k]; }
  }
}
// frost creeping from a pane's lower corner at cx0 (dir: the way into the pane), R across
function frostPane(r, cx0, dir, ys, R) {
  const N = r.N, buf = r.buf;
  for (let y = Math.max(0, Math.round(ys - R)); y < ys; y++) for (let dx = 0; dx < R; dx++) {
    const x = Math.round(cx0 + dir * dx), e = 1 - Math.sqrt(dx * dx + (ys - y) * (ys - y)) / R;
    if (e > 0 && x >= 0 && x < N && hash(x, y) * 0.5 + bay(x, y) * 0.5 < e * 0.9) buf[y * N + x] = e > 0.5 ? BRIGHT : LMID;
  }
}
const balconysmoke = {
  init(W) {
    const { w, rnd } = W, lit = new Uint8Array(180);
    for (let i = 0; i < 180; i++) if (rnd() < 0.24) lit[i] = pick(rnd, LIFE);
    const item = (line, x0, x1, len, c) => { const L = (2 / 3) * (len / BALC_M); return { line, x0, x1, len, c, a: (rnd() - 0.5) * 0.3, v: 0, L, k0: (x0 === x1 ? 0.25 : 0.55) / L }; };
    Object.assign(w, { kind: rollW(rnd, BALC_W, bandOf(W.a)), lit, flakes: [], smoke: [], breath: [], glow: 0, dawnT: -1, tram: -999,
      wash: [item(0, 0.07, 0.19, 0.09, LMID), item(0, 0.27, 0.37, 0.08, dim(HOT)), item(0, 0.6, 0.6, 0.04, MID), item(0, 0.655, 0.655, 0.035, dim(COOL)), item(0, 0.79, 0.9, 0.08, MID),
        item(1, 0.1, 0.24, 0.11, dim(COOL)), item(1, 0.45, 0.45, 0.05, LMID), item(1, 0.81, 0.93, 0.1, LMID)] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), buf = r.buf;
    const C = cam(0.5 * N, 0.42 * N, 0.8 * N, 8), ys = 0.66 * N, gT = 0.06 * N, hy = Math.round(C.hor);
    if (f.section === 'change') w.kind = rollW(rnd, BALC_W, band);
    if (f.section === 'drop') { w.dawnT = 0; w.tram = -42; }
    const K = w.kind, dawn = w.dawnT < 0 ? 0 : clamp(Math.min(w.dawnT / 4, (24 - w.dawnT) / 7));
    if (w.dawnT >= 0 && (w.dawnT += dt) > 24) w.dawnT = -1;
    for (const h of hits) {
      if (isLow(h)) w.glow = Math.min(1, w.glow + 0.7 * h.strength);
      else if (h.kind === 'snare') { const i = Math.floor(rnd() * 180); w.lit[i] = w.lit[i] ? 0 : isTonal(h) ? TONE[h.pc % 3] : pick(rnd, LIFE); }
      else if (h.kind === 'hat') for (const it of w.wash) it.v += (rnd() - 0.5) * 1.4 * h.strength * Math.sqrt(it.k0);
      if (isTonal(h) && h.kind !== 'snare') w.lit[Math.floor(rnd() * 180)] = TONE[h.pc % 3];
    }
    w.glow *= Math.exp(-dt * 2.2);
    const wind = (K === 'wind' ? 0.05 : K === 'frost' ? 0.003 : 0.012) * (1 + f.rel.bassDrive);
    // the sky: the town's glow low down at night; the dawn pales it from the bottom; stars on a frost
    dawnSky(r, hy, 0.2 * N, dawn);
    if (K === 'frost' && dawn < 0.4) for (let k = 0; k < 40; k++) if (hash(k, Math.floor(t * 2)) > 0.12) r.set(hash(k, 1) * N, hash(k, 2) * 0.32 * N, LMID);
    // beyond the gap between the blocks: the far town and a mast with its lamps, the top one blinking on the beat
    for (let y = Math.round(sy(C, 0, 160)); y < hy + 0.06 * N; y++) span(r, y, 0, N, dim(LMID));
    const mxx = sx(C, 60, 600), mt = sy(C, 150, 600);
    vcol(r, mxx, mt, hy, DARK);
    for (let k = 0; k < 6; k++) { const X = 30 + k * 9, hh = 6 + 10 * hash(k, 4); r.rect(sx(C, X, 200), sy(C, hh, 200), 8 * C.F / 200, (hh * C.F) / 200, DARK); if (hash(k, 6) < 0.6) r.set(sx(C, X + 3, 200), sy(C, hh * 0.5, 200), dim(BRIGHT)); }
    r.rect(mxx - u, mt - u, mx1(2 * u), mx1(2 * u), f.beat.pulse > 0.4 ? HOT : dim(HOT));
    r.set(mxx, sy(C, 75, 600), dim(HOT));
    // the blocks across the street, square on (the farther first), the ground between them, an aerial on the near roof
    const blk = (z, X0, X1, i0) => {
      const s = C.F / z, x0 = sx(C, X0, z), x1 = sx(C, X1, z), y0 = sy(C, 25.8, z);
      r.rect(x0, y0, x1 - x0, sy(C, 0, z) - y0, DARK);
      r.rect(x0, y0 - 0.6 * s, x1 - x0, mx1(0.6 * s), MID);
      for (let k = 0; k < 9; k++) {
        span(r, sy(C, 2.8 * k, z), x0, x1, dim(DARK));
        for (let j = 0; j < 10; j++) { const i = i0 + k * 10 + j, c = w.lit[i] && dawn < 0.4 + 0.6 * hash(i, 5) ? w.lit[i] : dim(DARK); r.rect(sx(C, X0 + 1.2 + 3.1 * j, z), sy(C, 2.4 + 2.8 * k, z), 1.4 * s, 1.5 * s, c); }
      }
    };
    blk(62, 9, 40, 90);
    for (let y = Math.round(sy(C, 0, 62)); y < sy(C, 0, 48); y++) span(r, y, 0, N, dim(LMID));
    blk(48, -28, 3, 0);
    const s48 = C.F / 48;
    for (let k0 = 0; k0 < 4; k0 += 2) {
      const X = BAERIAL[k0], hh = BAERIAL[k0 + 1], ax = sx(C, X, 48), ay = sy(C, 25.8, 48);
      r.line(ax, ay, ax, ay - hh * s48, MID);
      for (let k = 0; k < 5; k++) span(r, ay - (hh * 0.5 + k * hh * 0.11) * s48, ax - (1.2 - k * 0.17) * s48, ax + (1.2 - k * 0.17) * s48, MID);
    }
    // the street below: the snow, the road, the tram rails shining under the lamps, the wire over them
    const LAMPS = [-21, -9, 3, 15, 27];
    for (let y = Math.round(sy(C, 0, 48)); y < ys; y++) {
      const z = zRow(C, y);
      span(r, y, 0, N, z > 26 && z < 34 ? dim(MID) : LMID);
    }
    for (const zr of BRAILS) {
      const y = sy(C, 0, zr);
      span(r, y, 0, N, MID);
      for (let i = 0; i < LAMPS.length; i++) if (dawn < 0.5 + 0.1 * i) span(r, y, sx(C, LAMPS[i] - 3, zr), sx(C, LAMPS[i] + 3, zr), BRIGHT);
    }
    span(r, sy(C, 5.8, 30), 0, N, dim(MID));
    for (let i = 0; i < LAMPS.length; i++) {
      const on = dawn < 0.5 + 0.1 * i, X = LAMPS[i], s = C.F / 25.5;
      vcol(r, sx(C, X, 25.5), sy(C, 7, 25.5), ys, DARK);
      r.rect(sx(C, X, 25.5) - 0.6 * s, sy(C, 7.1, 25.5), 1.2 * s, mx1(0.3 * s), on ? BRIGHT : dim(LMID));
      if (on) groundPool(r, C, X, 28.5, 5, 0.8);
    }
    // the first tram, its headlights' light thrown ahead along the street, the lit windows, the pantograph to the wire
    if (w.tram > -60) {
      w.tram += 9 * dt;
      const z = 30, s = C.F / z, x0 = sx(C, w.tram - 15, z), x1 = sx(C, w.tram, z), yt = sy(C, 3.3, z);
      groundPool(r, C, w.tram + 7, 29.5, 6, 0.9);
      r.rect(x0, yt, x1 - x0, sy(C, 0.4, z) - yt, MID);
      for (let k = 0; k < 6; k++) r.rect(sx(C, w.tram - 14 + k * 2.3, z), sy(C, 2.8, z), 1.7 * s, 1.1 * s, BRIGHT);
      r.line(sx(C, w.tram - 6, z), yt, sx(C, w.tram - 7.5, z), sy(C, 5.8, z), LMID);
      r.rect(x1 - u, sy(C, 1.3, z), mx1(1.5 * u), mx1(1.5 * u), BRIGHT);
      targets.push({ x: x0, y: yt, w: x1 - x0, h: sy(C, 0.4, z) - yt });
      if (w.tram > 75) w.tram = -999;
    }
    // the dawn's grey light coming up over everything outside
    if (dawn > 0) litBox(r, 0.03 * N, gT, 0.97 * N, ys, dawn * 0.45);
    // the snow outside the glass, and the smoke: the exhaled breath behind the head, the cigarette's at the sash
    snowStep(W, w.flakes, Math.round((K === 'frost' ? 0 : K === 'wind' ? 120 : 70) * u * (0.6 + 0.6 * f.level)), wind, 0.05, () => ys, 0.03 * N, 0.97 * N, gT);
    snowDraw(r, w.flakes, u, 1, 5);
    const fx = 0.4 * N, fh = 0.85 * N, ex = fx + 0.27 * fh, ey = ys - 0.075 * fh;
    for (let n = dt * (6 + 14 * w.glow); n > 0; n--) if (rnd() < n) w.smoke.push(puff(ex + u, ey - u, 0, -0.02 * N, 0.07 * N, 1.4, 3.6, 1.3));
    if (tick(w, f, dt) && (w.bar = ((w.bar || 0) + 1) % 4) === 0) for (let k = 0; k < 4; k++) w.breath.push(puff(fx + (rnd() - 0.5) * 0.12 * N, 0.36 * N + rnd() * 0.05 * N, (0.6 - rnd() * 0.4) * 0.12 * N, -0.03 * N, 0.045 * N, 1.2, 2.6, 1.7));
    plume(W, w.breath, wind * N, LMID, 0.7, 24);
    plume(W, w.smoke, wind * N, LMID, 0.9, 40);
    // frost in the panes' lower corners on a frosty night (not on the open sash)
    if (K === 'frost') for (let p = 0; p < 4; p++) if (p !== 2) for (const k of ONE) frostPane(r, PANES[k < 0 ? p : p + 1] * N, -k, ys, 0.09 * N);
    // the frames, the transom bar, the open sash swung in on its hinge; the ceiling, the walls
    for (const xx of PANES) r.rect(xx * N - u, gT, mx1(2 * u), ys - gT, FIG);
    r.rect(0.03 * N, 0.2 * N - u, 0.94 * N, mx1(2 * u), FIG);
    for (let k = 0; k < 4; k += 2) { const xa = SASH[k] * N, xb = SASH[k + 1] * N; PB[0] = xa; PB[1] = 0.185 * N; PB[2] = xb; PB[3] = 0.2 * N; PB[4] = xb; PB[5] = 0.665 * N; PB[6] = xa; PB[7] = 0.68 * N; fillPB(r, 4, FIG, 1, null); } // the open sash, edge on
    r.rect(0, 0, N, gT, DARK);
    r.rect(0, 0, 0.03 * N, N, DARK);
    r.rect(0.97 * N, 0, 0.03 * N, N, DARK);
    // the laundry: each piece a pendulum hung from its sagging line (at omega = sqrt(g / L), L from its length above,
    // damped as lightly as ever), stirred by the treble and the draught from the sash; a towel or a shirt on two pegs swings
    // to and from us (shorter as it tips, its hem trailing), a sock on one peg swings about it
    const gust = f.rel.trebDrive * 5 + (K === 'wind' ? 1.5 : 0.4);
    const line0 = wire(r, 0.03 * N, 0.105 * N, 0.97 * N, 0.105 * N, aSag(0.94 * N, 0.012 * N), MID), line1 = wire(r, 0.03 * N, 0.075 * N, 0.97 * N, 0.075 * N, aSag(0.94 * N, 0.014 * N), MID);
    for (let i = 0; i < w.wash.length; i++) {
      const it = w.wash[i], cl = it.line ? line1 : line0, len = it.len * N, one = it.x0 === it.x1, x0 = it.x0 * N, x1 = it.x1 * N, y0 = catY(cl, x0), y1 = catY(cl, x1);
      swing(it, dt, it.L, 0.17 * Math.sqrt(G / it.L), (hash(i, Math.floor(t * 5)) - 0.5) * gust * it.k0);
      if (one) { const tx = x0 + Math.sin(it.a) * len, ty = y0 + Math.cos(it.a) * len; strk(r, x0, y0, tx, ty, mx1(0.016 * N), it.c); strk(r, tx, ty, tx + Math.cos(it.a) * 0.022 * N, ty - Math.sin(it.a) * 0.022 * N, mx1(0.016 * N), it.c); }
      else {
        const hh = len * Math.cos(it.a), sk = Math.sin(it.a) * len * 0.25, c = it.a > 0.12 ? LIT[it.c] : it.c, shirt = i % 3 === 1, ins = shirt ? 0.18 * (x1 - x0) : 0;
        poly(r, [[x0, y0], [x1, y1], [x1 - ins + sk, y1 + hh], [x0 + ins + sk, y0 + hh]], c);
        if (shirt) for (const k of ONE) { const xe = k < 0 ? x0 : x1, ye = k < 0 ? y0 : y1; poly(r, [[xe, ye], [xe + k * 0.022 * N, ye + 0.006 * N], [xe + k * 0.012 * N + sk * 0.2, ye + 0.035 * N], [xe - k * ins * 0.8, ye + 0.03 * N]], c); } // the sleeves
        else span(r, (y0 + y1) / 2 + hh * 0.8, x0 + sk * 0.8, x1 + sk * 0.8, dim(c)); // the towel's stripe
      }
      r.rect(x0 - u * 0.5, y0 - u, mx1(u), mx1(2 * u), DARK);
      if (!one) r.rect(x1 - u * 0.5, y1 - u, mx1(u), mx1(2 * u), DARK);
    }
    // the parapet and the sill behind the figure
    r.rect(0.03 * N, ys, 0.94 * N, 0.025 * N, LMID);
    r.rect(0.03 * N, ys + 0.025 * N, 0.94 * N, N - ys, dim(MID));
    for (let x = 0.03 * N; x < 0.97 * N; x += 0.235 * N) vcol(r, x, ys + 0.025 * N, N, DARK);
    // the figure leaning on the sill, the head bowed a little and nodding on the beat; the cigarette, the ember
    const J = hoodBack(r, fx, 0.35 * N + fh, fh, FIG, { sill: ys + 0.005 * N, nod: 0.5 + 0.2 * f.beat.pulse, armR: [ex - 0.02 * fh, ey + 0.02 * fh] });
    r.line(ex - 0.02 * fh, ey + 0.02 * fh, ex, ey, BRIGHT);
    r.disc(ex, ey, mx1(u * (0.7 + 0.9 * w.glow)), w.glow > 0.4 ? BRIGHT : HOT);
    targets.push({ x: fx - 0.15 * fh, y: J.top, w: 0.3 * fh, h: ys - J.top });
    targets.push({ x: ex - 2 * u, y: ey - 2 * u, w: 4 * u, h: 4 * u });
  },
};

// ---------------------------------------------------------------------------------------------- elektrichka
// Inside a suburban train at night, across the aisle from a window bay: the slatted benches facing each other, the
// figure by the window with the headphones on and the head turned to the glass, and its reflection there, a ghost of
// the face smaller and nearer the middle (mirrored through the glass, at twice the distance), gone while the lamps
// flicker on a snare. Outside, everything at the train's one speed, each thing at its own depth (screen speed and size
// as 1/depth): birches flicking past, the pylons and their sagging wires, the forest's edge far off, the moon still,
// snow streaking past the glass. The train runs a rail (12.5 m) a beat, so the joint's clack falls on the beat: the
// carriage bounces on its springs (the near world jumps against the window frame), the head nods after it, a string bag
// of oranges swings on the rack; a kick is a bad joint. The kind is the country: the forest, the dachas with their lit
// windows and a crossing blinking on the beat, a snowstorm. A drop is a platform at speed: its one lamp sweeps past, and
// its light thrown in through the window crosses the carriage the other way.
const TRAIN_W = { forest: [3, 2, 1], dachas: [1, 2, 2], storm: [1, 2, 3] };
const ARMS = [22, 7, 17, 8.5], SLATS = [1.9, 2.05, 2.2, 2.35], SEAT = [0.6, 0.75, 0.9], ORANGES = [-0.045, 0.07, 0.045, 0.075, 0, 0.14, -0.03, 0.12];
// the snow on the ground through the window, specked, each row passing at its own depth's speed
function trackSnow(r, C, odo, bob, xa, xb, yb) {
  const N = r.N, buf = r.buf;
  for (let y = Math.round(C.hor) + 1; y < yb; y++) {
    const z = ((C.Hc + bob) * C.F) / (y + 0.5 - C.hor);
    span(r, y, xa, xb, z > 60 ? dim(LMID) : LMID);
    if (y % 2 === 0) for (let x = xa; x < xb; x++) if (hash(Math.floor((odo + ((x + 0.5 - C.cx) * z) / C.F) * 1.5), y >> 1) < 0.05) buf[y * N + x] = dim(MID);
  }
}
// the forest's edge through the window, a column at a time: spruce tops 90 m off in the forest, a ragged line 380 m off
// by the dachas (the carriage's bounce `bob` moving it down)
function woodsEdge(r, C, odo, bob, xa, xb, forest) {
  const z = forest ? 90 : 380, yb = sy(C, 0, z) + (bob * C.F) / z + 1;
  for (let x = xa; x < xb; x++) {
    const X = odo + ((x + 0.5 - C.cx) * z) / C.F;
    let hh = 0;
    if (forest) { const k0 = Math.floor(X / 2.6); for (let k = k0 - 1; k <= k0 + 1; k++) hh = Math.max(hh, (11 + 9 * hash(k, 3)) * (1 - Math.abs(X - (k + 0.5) * 2.6 - (hash(k, 4) - 0.5)) / 2.2)); }
    else { const q = X / 7, i0 = Math.floor(q), fr = q - i0; hh = 7 + 9 * (hash(i0, 3) * (1 - fr) + hash(i0 + 1, 3) * fr) + 3 * hash(Math.floor(X * 1.7), 5); }
    vcol(r, x, sy(C, hh, z) + (bob * C.F) / z, yb, DARK);
  }
}
// the reflection's ghost: where it was drawn (in white, the face in black), a faint light over the dark of the night
// only, else what was there (`save`)
function ghost(r, save, xa, ya, xb, yb) {
  const N = r.N, buf = r.buf;
  for (let y = ya, k = 0; y < yb; y++) for (let x = xa; x < xb; x++, k++) {
    const i = y * N + x, c = buf[i];
    if (c !== WHITE && c !== BLACK) continue;
    const o = save[k];
    buf[i] = c === WHITE && (o === BG || o === DARK || o === BG + DIM || o === DARK + DIM) && bay(x, y) < 0.55 ? LMID + DIM : o;
  }
}
const elektrichka = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, TRAIN_W, bandOf(W.a)), odo: rnd() * 1000, bob: { x: 0, v: 0 }, head: { x: 0, v: 0 }, bag: { a: 0.1, v: 0 }, axle: -1, flick: 0, plat: -1e9, streaks: [], far: [], save: null });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), buf = r.buf;
    const C = cam(0.62 * N, 0.46 * N, 0.5 * N, 2.5), ZW = 2.0, xa = Math.round(sx(C, -1.35, ZW)), xb = Math.round(sx(C, 0.35, ZW)), ya = Math.round(sy(C, 3.1, ZW)), yb = Math.round(sy(C, 2.1, ZW));
    if (f.section === 'change') w.kind = rollW(rnd, TRAIN_W, band);
    if (f.section === 'drop') w.plat = w.odo + 24;
    const K = w.kind, v = 12.5 * bps(f);
    w.odo += v * dt;
    // the joint under the bogie on the beat, the second axle 2.4 m later: the body bounces, the head and the bag lag
    const bump = (k) => { w.bob.v += 0.22 * k; w.head.v -= 0.6 * k; w.bag.v += 0.4 * k; };
    if (tick(w, f, dt)) { bump(1); w.axle = 2.4 / v; }
    if (w.axle > 0 && (w.axle -= dt) <= 0) bump(0.7);
    for (const h of hits) {
      if (isLow(h)) bump(0.8 * h.strength);
      else if (h.kind === 'snare') w.flick = 0.06 + 0.1 * h.strength;
      else if (h.kind === 'hat' && w.streaks.length < 200) for (let k = 0; k < 3; k++) w.streaks.push({ x: xb + rnd() * 0.1 * N, y: ya + rnd() * (yb - ya), z: 2 + rnd() * 5 });
      if (isTonal(h) && w.far.length < 8) w.far.push({ X: w.odo - 550 + rnd() * 680, c: h.pc % 2 ? BRIGHT : HOT, life: 10 }); // a light coming on far off, in view
    }
    spring(w.bob, dt, 120, 7); spring(w.head, dt, 60, 5); swing(w.bag, dt, 0.42, 0.5); // the bag's middle 0.42 m under the hook
    w.flick -= dt;
    // the world outside, seen through the window: x along the line (X - odo), the carriage's bounce moving it down
    const bobY = w.bob.x, SXo = (X, z) => C.cx + ((X - w.odo) * C.F) / z, SYo = (Y, z) => sy(C, Y, z) + (bobY * C.F) / z, hor = Math.round(C.hor);
    skyGlow(r, ya, Math.min(yb, hor), 0.42, xa, xb);
    if (K !== 'storm') {
      r.disc(0.6 * N, 0.36 * N, 0.022 * N, BRIGHT);
      glow(r, 0.6 * N, 0.36 * N, 0.055 * N, 0.055 * N, 0.4);
      woodsEdge(r, C, w.odo, bobY, xa, xb, K === 'forest');
      prune(w.far, (p) => { p.life -= dt; r.set(SXo(p.X, 900), SYo(1, 900), p.c); return p.life > 0; });
    }
    trackSnow(r, C, w.odo, bobY, xa, xb, yb);
    if (K !== 'storm') { // the pylons 70 m off, a lattice with two cross-arms, the wires sagging between them (from the one
      // beyond the window's left edge, so no span of wire goes missing there)
      const zp = 70, sp = 120, s = C.F / zp;
      let prev = null;
      for (let k = Math.floor((w.odo - 80) / sp) - 1, ke = k + 4; k <= ke; k++) {
        const x = SXo(k * sp + 40, zp), yt = SYo(26, zp), yg = SYo(0, zp);
        r.line(x - 4 * s, yg, x - 0.8 * s, yt, DARK);
        r.line(x + 4 * s, yg, x + 0.8 * s, yt, DARK);
        for (let j = 0; j < 6; j++) { const y0 = lerp(yg, yt, j / 6), y1 = lerp(yg, yt, (j + 1) / 6), w0 = lerp(4, 0.8, j / 6) * s, w1 = lerp(4, 0.8, (j + 1) / 6) * s; r.line(x - w0, y0, x + w1, y1, DARK); r.line(x + w0, y0, x - w1, y1, DARK); }
        for (let j = 0; j < 4; j += 2) {
          const Y = ARMS[j], wa = ARMS[j + 1];
          span(r, SYo(Y, zp), x - wa * s, x + wa * s, DARK);
          if (prev !== null) for (const sd of ONE) wire(r, prev + sd * wa * s, SYo(Y - 0.6, zp), x + sd * wa * s, SYo(Y - 0.6, zp), aSag(sp * s, 3.5 * s), DARK);
        }
        prev = x;
      }
    }
    if (K === 'dachas') {
      for (let k = Math.floor((w.odo - 70) / 35), ke = k + 4; k <= ke; k++) { // the dachas, a lit window or two, a fence in front
        const z = 25 + 30 * hash(k, 5), s = C.F / z, x = SXo(k * 35 + 15 * hash(k, 4), z), hw = 3 * s;
        r.rect(x - hw, SYo(3, z), 2 * hw, 3 * s, DARK);
        poly(r, [[x - hw * 1.15, SYo(3, z)], [x, SYo(5.2, z)], [x + hw * 1.15, SYo(3, z)]], DARK);
        if (hash(k, 6) < 0.75) r.rect(x - hw * 0.5, SYo(2.1, z), 1.1 * s, 0.9 * s, hash(k, 7) < 0.5 ? BRIGHT : HOT);
        for (let p = -3; p <= 3; p++) vcol(r, SXo(k * 35 + 15 * hash(k, 4) + p * 1.6, z - 4), SYo(1.1, z - 4), SYo(0, z - 4), dim(MID));
      }
      const Xc = Math.round((w.odo - 200) / 400) * 400 + 200, xc = SXo(Xc, 6), s6 = C.F / 6; // the nearest crossing, its red lamps taking turns on the beat
      if (xc > xa - 0.1 * N && xc < xb + 0.1 * N) { vcol(r, xc, SYo(3, 6), yb, DARK); for (const k of ONE) r.disc(xc + k * 0.35 * s6, SYo(2.7, 6), mx1(0.12 * s6), (f.beat.count + (k > 0 ? 1 : 0)) % 2 ? HOT : dim(HOT)); }
    }
    // the birches, far to near, white trunks with their dark marks (in the storm only the near ones show); from beyond the
    // window's left edge at the farthest (26 m), so none pops out of sight before it is past
    const trees = w.trees || (w.trees = []);
    trees.length = 0;
    for (let k = Math.floor((w.odo - 22) / 4.2), ke = Math.ceil((w.odo + 16) / 4.2); k <= ke; k++) {
      const z = 8 + 18 * hash(k, 2);
      if ((K === 'dachas' && hash(k, 9) < 0.65) || (K === 'storm' && z > 13)) continue;
      let j = trees.length;
      for (trees.push(k); j > 0 && hash(trees[j - 1], 2) < hash(k, 2); j--) trees[j] = trees[j - 1];
      trees[j] = k;
    }
    for (let i = 0; i < trees.length; i++) {
      const k = trees[i], z = 8 + 18 * hash(k, 2), X = k * 4.2 + 3 * hash(k, 1), x = SXo(X, z), tw = mx1((0.32 * C.F) / z);
      if (x < xa - tw || x > xb + tw) continue;
      r.rect(x - tw / 2, ya, tw, SYo(0, z) - ya, z < 15 ? BRIGHT : LMID);
      for (let j = 0; j < 7; j++) r.rect(x - tw / 2 + (hash(k, j + 9) < 0.5 ? 0 : tw * 0.4), SYo(2.2 + j * 0.9 + hash(k, j) * 0.5, z), tw * 0.6, mx1((0.1 * C.F) / z), DARK);
    }
    // the platform at the drop: its far edge and fence streaking by, the one lamp on its post and its pool
    const dl = w.plat - w.odo;
    if (dl > -80 && dl < 80) {
      for (let y = Math.round(SYo(1.1, 7)); y < yb; y++) { const zr = ((C.Hc - 1.1 + bobY) * C.F) / (y + 0.5 - C.hor); span(r, y, Math.max(xa, SXo(w.plat - 60, zr)), Math.min(xb, SXo(w.plat + 60, zr)), MID); } // its top, its ends at each row's depth
      for (let p = Math.ceil((w.odo - 8) / 2.5); p * 2.5 < w.odo + 8; p++) if (Math.abs(p * 2.5 - w.plat) < 60) vcol(r, SXo(p * 2.5, 7.5), SYo(2.1, 7.5), SYo(1.1, 7.5), DARK);
      const lx = SXo(w.plat, 6);
      vcol(r, lx, SYo(4.2, 6), yb, DARK);
      glow(r, lx, SYo(1.4, 6), 0.14 * N, 0.05 * N, 0.9);
      r.disc(lx, SYo(4.2, 6), mx1((0.15 * C.F) / 6), BRIGHT);
      if (lx > xa && lx < xb) targets.push({ x: lx - 3 * u, y: SYo(4.2, 6) - 3 * u, w: 6 * u, h: 6 * u });
    }
    // the snow streaking past the glass: near flakes, the train's speed against their fall, drawn as the streak they make
    const want = Math.round((K === 'storm' ? 90 : 12) * (0.6 + 0.6 * f.level) * u);
    while (w.streaks.length < want) w.streaks.push({ x: xa + rnd() * (xb - xa), y: ya + rnd() * (yb - ya), z: 2 + rnd() * 5 });
    if (w.streaks.length > want) w.streaks.length = want;
    for (const p of w.streaks) {
      const vx = (v * C.F) / p.z, vy = (SNOW_V * C.F) / p.z;
      p.x -= vx * dt; p.y += vy * dt;
      if (p.x < xa || p.y > yb) { p.x = xb + rnd() * 0.05 * N; p.y = ya + rnd() * (yb - ya); p.z = 2 + rnd() * 5; }
      if (p.x < xb) r.line(p.x, p.y, Math.min(xb - 1, p.x + Math.min(vx * dt, 0.12 * N)), p.y - vy * dt, p.z < 3.5 ? LMID : dim(LMID));
    }
    // the reflection: the figure mirrored through the glass, its head where the head's mirror image is (the same X and Y,
    // at 2 ZW - z: smaller and nearer the middle; as last drawn), a ghost over the dark of the night only, the face a hole
    // in it; not while the lamps inside are out
    const zf = 1.6, Xf = -1.12, zr = 2 * ZW - zf, ww = xb - xa, wh = yb - ya;
    if (!w.save || w.save.length !== ww * wh) w.save = new Uint8Array(ww * wh);
    if (w.flick <= 0) {
      for (let y = ya, k = 0; y < yb; y++) for (let x = xa; x < xb; x++, k++) w.save[k] = buf[y * N + x];
      const hr = (1.75 * C.F) / zr;
      hoodBack(r, sx(C, w.hX ?? Xf + 0.18, zr), sy(C, w.hY ?? 2.41, zr) + 0.875 * hr, hr, WHITE, { front: true, legs: false, face: BLACK, cups: WHITE });
      ghost(r, w.save, xa, ya, xb, yb);
    }
    // the carriage: the wall round the window, its frame and sash bar, the ceiling, the rack with the bag on its strap,
    // the floor, the heater, the benches across the bay
    r.rect(0, 0, N, ya, MID); r.rect(0, yb, N, N - yb, MID); r.rect(0, ya, xa, wh, MID); r.rect(xb, ya, N - xb, wh, MID);
    for (let k = 1; k <= Math.round(1.6 * u); k++) r.frame(xa - k, ya - k, ww + 2 * k, wh + 2 * k, DARK);
    span(r, sy(C, 2.75, ZW), xa, xb, DARK);
    r.rect(0, 0, N, sy(C, 3.7, ZW), DARK + DIM);
    slab(r, C, -1.6, 3.35, 0.6, 3.35, ZW, ZW - 0.35, DARK);
    for (let k = 0; k < 4; k++) { const z = lerp(ZW, ZW - 0.35, k / 3); span(r, sy(C, 3.35, z), sx(C, -1.6, z), sx(C, 0.6, z), LMID); }
    slab(r, C, -1.45, 1.3, 0.45, 1.3, ZW, 0.5, DARK);
    r.rect(sx(C, -0.95, ZW), sy(C, 1.6, ZW), 0.9 * (C.F / ZW), 0.25 * (C.F / ZW), DARK);
    for (let k = 0; k < 6; k++) vcol(r, sx(C, -0.9 + k * 0.16, ZW), sy(C, 1.58, ZW), sy(C, 1.37, ZW), MID + DIM);
    const wood = HOT + DIM;
    for (const sd of ONE) {
      const Xb = 0.95 * sd - 0.5, Xs = 0.45 * sd - 0.5;
      slab(r, C, Xb, 1.3, Xb, 2.45, ZW, 0.6, wood);
      for (const Y of SLATS) line3(r, C, Xb, Y, ZW, Xb, Y, 0.6, DARK);
      slab(r, C, Xb, 2.45, Xb - sd * 0.06, 2.45, ZW, 0.6, LMID);
      slab(r, C, Xb, 1.75, Xs, 1.75, ZW, 0.6, wood);
      for (const X of SEAT) line3(r, C, X * sd - 0.5, 1.75, ZW, X * sd - 0.5, 1.75, 0.6, DARK);
      slab(r, C, Xs, 1.75, Xs, 1.35, ZW, 0.6, DARK);
    }
    // the figure on the left bench, the head turned to the glass, nodding after the bounce
    const fs = C.F / zf, J = hood(r, sx(C, Xf, zf), 0, 1.75 * fs, FIG, { sit: true, seat: sy(C, 1.78, zf), feet: sy(C, 1.3, zf - 0.05), dir: 1, lean: 0.18, nod: clamp(0.3 - w.head.x * 3, 0, 1), face: false });
    targets.push({ x: J.hx - 0.3 * fs, y: J.top, w: 0.7 * fs, h: sy(C, 1.3, zf) - J.top });
    w.hX = ((J.hx - C.cx) * zf) / C.F; w.hY = C.Hc - ((J.hy - C.hor) * zf) / C.F; // where the head is, for its reflection
    // the string bag of oranges swinging on its strap from the rack
    const px0 = sx(C, 0.12, ZW - 0.32), py0 = sy(C, 3.35, ZW - 0.32), bs = C.F / (ZW - 0.32), bx = px0 + Math.sin(w.bag.a) * 0.32 * bs, byy = py0 + Math.cos(w.bag.a) * 0.32 * bs;
    r.line(px0, py0, bx, byy, LMID);
    for (let k = 0; k < 8; k += 2) r.disc(bx + ORANGES[k] * bs, byy + ORANGES[k + 1] * bs, 0.042 * bs, HOT);
    r.ring(bx, byy + 0.1 * bs, 0.1 * bs, mx1(0.6 * u), LMID);
    // the drop's lamp thrown in through the window onto the bay, moving against it (the window's corners cast from the
    // lamp onto the benches' plane); the view itself kept
    if (dl > -14 && dl < 14) {
      const zp = 0.95, q = (zp - 6) / (ZW - 6), pt = (Xw, Yw) => P3(C, dl + q * (Xw - dl), 4.2 + q * (Yw - 4.2), zp);
      poly(r, [pt(-1.35, 3.1), pt(0.35, 3.1), pt(0.35, 2.1), pt(-1.35, 2.1)], -1, 0.9 * (1 - Math.abs(dl) / 14), [xa, ya, xb, yb]);
    }
    if (w.flick > 0) for (let y = 0; y < N; y++) for (let x = 0, i = y * N; x < N; x++, i++) if ((y < ya || y >= yb || x < xa || x >= xb) && buf[i] < DIM) buf[i] += DIM;
  },
};

// ---------------------------------------------------------------------------------------------- busstop
// A concrete bus shelter on an empty road in the snow, from the pavement behind it: the figure at the kerb with its
// back to us, looking up the road, stamping on the beat, its breath going up; the road running off between the snow
// banks, its ruts; the streetlight flickering on the hats, its pool on the snow and the figure's shadow thrown from it;
// a kick sends a gust. On a section a car comes down the road: two dots at the vanishing point growing as 1/distance,
// their light thrown ahead on the snow, and it passes without stopping; another goes away, its red lights shrinking. A
// stray dog trots across on a snare, a planted foot at a time. The kind is the night: empty, some traffic, a storm with
// the snow snaking along the ground. A drop brings the bus at last: it brakes to the shelter, its doors fold open and
// the light floods out over the snow; the figure walks to it and in, the doors shut, it pulls away past us, and after a
// while someone else walks up to wait.
const STOP_W = { empty: [3, 2, 1], traffic: [1, 2, 2], storm: [1, 2, 3] };
const RUTS = [1.5, 3.2, 4.9, 6.7], BY_FAR = (p, q) => q.z - p.z;
// the mosaic's waves on the shelter's near wall (its corner at x0, y0, s cells a metre)
function waves(r, x0, y0, s) {
  for (let k = 0; k < 3; k++) for (let x = 0; x < 1.5 * s; x++) r.set(x0 + 0.1 * s + x, y0 + (1.5 + k * 0.3) * s + Math.sin(x / (0.12 * s) + k) * 0.06 * s, COOL + DIM);
}
// the ground row by row, each row one depth: the pavement, the bank by the kerb (open at the stop), the road and its
// ruts, the far bank, the field
function stopGround(r, C) {
  const N = r.N;
  for (let y = Math.round(C.hor) + 1; y < N; y++) {
    const z = zRow(C, y);
    span(r, y, 0, N, LMID);
    span(r, y, sx(C, 0.6, z), sx(C, 7.6, z), MID + DIM);
    for (let k = 0; k < 4; k++) span(r, y, sx(C, RUTS[k] - 0.17, z), sx(C, RUTS[k] + 0.17, z), DARK + DIM);
    if (z < 2.4 || z > 7.8) span(r, y, sx(C, 0.52, z), sx(C, 0.6, z), MID);
    span(r, y, sx(C, 7.6, z), sx(C, 7.68, z), MID);
  }
}
// a vehicle's near face at depth z: a dark box, its lights (white toward us, red away)
function vehicle(r, C, X, z, wd, ht, toward, u) {
  const s = C.F / z, x0 = sx(C, X - wd / 2, z), y0 = sy(C, ht, z);
  r.rect(x0, y0, sx(C, X + wd / 2, z) - x0, sy(C, 0.3, z) - y0, DARK);
  for (const k of ONE) {
    const lx = sx(C, X + k * (wd / 2 - 0.25), z), ly = sy(C, toward ? 0.7 : 0.85, z);
    if (toward && z < 70) glow(r, lx, ly, 0.6 * s, 0.35 * s, 0.7);
    r.disc(lx, ly, Math.max(0.6, 0.13 * s), toward ? BRIGHT : HOT);
  }
}
const busstop = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, STOP_W, bandOf(W.a)), cars: [], bus: null, fig: { X: -0.25, z: 5, ph: 0, st: 'wait', t: 0 }, dog: null, flakes: [], drift: [], breath: [], flick: 0, gust: 0, quiet: 0, stamp: 0, odd: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), buf = r.buf;
    const C = cam(0.4 * N, 0.5 * N, 0.7 * N, 1.6), hy = Math.round(C.hor), F = w.fig, ZS = 2.6;
    const car = (toward) => { const v = 11 + 5 * rnd(); return { truck: rnd() < 0.25, toward, z: toward ? 240 : 1.6, X: toward ? 2.35 : 5.85, v, vc: v }; };
    if (f.section === 'change') { w.kind = rollW(rnd, STOP_W, band); w.cars.push(car(true)); }
    if (f.section === 'drop' && !w.bus) w.bus = { z: 70, v: 13, st: 'in', door: 0, t: 0 };
    const K = w.kind;
    for (const h of hits) {
      if (isTonal(h)) w.far = { k: h.pc % 5, c: h.pc % 2 ? HOT : BRIGHT, t: 6 };
      if (isLow(h)) w.gust = Math.min(1.5, w.gust + 0.6 * h.strength);
      else if (h.kind === 'snare' && !w.dog) { const dir = rnd() < 0.5 ? 1 : -1; w.dog = { X: dir > 0 ? -5 : 10, dir, ph: 0 }; }
      else if (h.kind === 'hat' && rnd() < 0.3) w.flick = 0.04 + 0.08 * rnd();
    }
    if (K === 'traffic' && (w.quiet += dt) > 9) { w.quiet = 0; w.cars.push(car(rnd() < 0.5)); }
    w.flick -= dt; w.gust *= Math.exp(-dt); w.stamp -= dt;
    const lampOn = w.flick <= 0, wind = (K === 'storm' ? 0.24 : 0.036) + 0.24 * w.gust;
    // the sky, the forest far off with a light or two, the ground row by row: the pavement, the bank by the kerb (open
    // at the stop), the road and its ruts, the far bank, the field
    skyGlow(r, 0.2 * N, hy, 0.42);
    treeline(r, C, 0, 500, 8, 10, 9, hy + 1, DARK);
    for (let k = 0; k < 5; k++) r.set(C.cx + (hash(k, 8) - 0.3) * 0.6 * N, hy - 1, w.far && w.far.k === k ? w.far.c : hash(k, 9) < 0.5 ? BRIGHT + DIM : HOT + DIM);
    if (w.far && (w.far.t -= dt) <= 0) w.far = null;
    stopGround(r, C);
    if (lampOn) groundPool(r, C, 1.2, 8, 6.5, 0.55 + 0.2 * Math.sin(t * 0.8) + 0.2 * f.level);
    for (const c of w.cars) if (c.toward && c.z < 95) groundPool(r, C, c.X, c.z - 9, 6, 0.9 * clamp((95 - c.z) / 40));
    const B = w.bus;
    if (B && B.door > 0) for (let dr = 0; dr < 2; dr++) { // the bus's light out of each open door, cast on the snow from the
      // ceiling lamp over it (2.7 m up, 1.1 m in): over the step (0.35 m) it lands just outside, under the door's top
      // (2.4 m) nine times as far; dimmer as it spreads
      const zc = B.z + (dr ? 8.0 : 1.1), at = (k) => [0.9 + (0.9 - 2.0) * (k - 1), 0.6 * k], band = (k0, k1, d) => { const [X0, h0] = at(k0), [X1, h1] = at(k1); poly(r, [P3(C, X0, 0, zc - h0), P3(C, X0, 0, zc + h0), P3(C, X1, 0, zc + h1), P3(C, X1, 0, zc - h1)], -1, d * B.door); };
      band(2.7 / 2.35, 3, 0.85);
      band(3, 9, 0.35);
    }
    // the shelter's far parts: the back wall (an abstract mosaic on it), the bench, the far side wall
    slab(r, C, -2.6, 0, -2.6, 2.6, 3.5, 7, DARK);
    for (let k = 0; k < 4; k++) slab(r, C, -2.6, 0.9 + k * 0.35, -2.6, 1.15 + k * 0.35, 4 + k * 0.6, 4.5 + k * 0.6, k % 2 ? COOL + DIM : HOT + DIM);
    slab(r, C, -2.6, 0.45, -2.15, 0.45, 3.8, 6.7, MID);
    r.rect(sx(C, -2.6, 7), sy(C, 2.6, 7), (1.7 * C.F) / 7, (2.6 * C.F) / 7, MID + DIM);
    // the streetlight on its pole, the arm over the road
    const s10 = C.F / 8.5, lpx = sx(C, 1.7, 8.5), lpy = sy(C, 6, 8.5);
    vcol(r, sx(C, 0.3, 8.5), sy(C, 6.2, 8.5), sy(C, 0, 8.5), DARK);
    r.line(sx(C, 0.3, 8.5), sy(C, 6.2, 8.5), lpx, lpy, DARK);
    r.rect(lpx - 0.4 * s10, lpy, 0.8 * s10, mx1(0.25 * s10), lampOn ? BRIGHT : LMID + DIM);
    // in the storm (or a gust) the snow snakes along the ground with the wind, each streak at its depth's speed
    if (K === 'storm' || w.gust > 0.5) {
      while (w.drift.length < 30) w.drift.push({ x: rnd() * N, z: 3 + rnd() * 20 });
      for (const p of w.drift) { p.x += ((wind * 4 * C.F) / p.z) * dt; if (p.x > N) { p.x -= N; p.z = 3 + rnd() * 20; } span(r, sy(C, 0.08, p.z), p.x, p.x + (0.6 * C.F) / p.z, LMID); }
    }
    // the bus: in, braking to a stop at the shelter (a steady deceleration), the doors folding open, then shut, away
    if (B) {
      B.t += dt;
      if (B.st === 'in') { const d = B.z - ZS; if (d < (B.v * B.v) / 4.4) { const k = brake(B.v, d, dt); B.v = k[0]; B.z -= k[1]; } else B.z -= B.v * dt; if (B.v <= 0 || B.z <= ZS) { B.z = ZS; B.v = 0; B.st = 'open'; B.t = 0; } }
      else if (B.st === 'open') { B.door = Math.min(1, B.door + dt / 0.8); if (B.door >= 1 && F.st === 'wait') { F.st = 'board'; } if (F.st !== 'board' && B.t > 2.5) { B.st = 'shut'; B.t = 0; } }
      else if (B.st === 'shut') { B.door = Math.max(0, B.door - dt / 0.6); if (B.door <= 0) B.st = 'out'; }
      else { B.v += 1.3 * dt; B.z -= B.v * dt; }
      if (B.z + 11 < 1) w.bus = null;
    }
    // the traffic, each car at its own speed; one that comes up behind the bus on its lane brakes to wait 3 m short of it
    // (as steadily as the bus) and goes on as it leaves, never into it
    const Bz = w.bus ? B.z : -1;
    for (const c of w.cars) {
      const behind = w.bus && c.toward && c.z > Bz, gap = c.z - (Bz + 14);
      c.v = Math.min(c.vc ?? c.v, c.v + 2.5 * dt);
      if (behind && gap < (c.v * c.v) / 6) { const k = brake(c.v, gap, dt); c.v = k[0]; c.z -= k[1]; }
      else c.z += (c.toward ? -1 : 1) * c.v * dt;
      if (behind) c.z = Math.max(c.z, Bz + 13.5);
    }
    prune(w.cars, (c) => c.z > 1.2 && c.z < 320).sort(BY_FAR);
    // far to near: the cars (lights growing as 1/distance toward us, shrinking away), the stray dog trotting across beyond
    // the shelter, the bus, each at its depth
    const drawCar = (c) => { vehicle(r, C, c.X, c.z, c.truck ? 2.4 : 1.8, c.truck ? 3 : 1.45, c.toward, u); if (c.truck) for (let k = -1; k <= 1; k++) r.set(sx(C, c.X + k * 0.9, c.z), sy(C, 3.05, c.z), HOT); if (c.z < 60) targets.push({ x: sx(C, c.X - 1, c.z), y: sy(C, 1.6, c.z), w: (2 * C.F) / c.z, h: (1.4 * C.F) / c.z }); };
    const cars = (zHi, zLo) => { for (const c of w.cars) if (c.z <= zHi && c.z > zLo) drawCar(c); };
    const DZ = 10.5, drawDog = () => {
      if (!w.dog) return;
      const D = w.dog, dx = D.dir * 1.5 * dt;
      D.X += dx; D.ph += Math.abs(dx) / (0.22 * 0.55);
      dog(r, sx(C, D.X, DZ), sy(C, 0, DZ), (0.55 * C.F) / DZ, FIG, D.ph, D.dir);
      if (D.X < -6 || D.X > 11) w.dog = null;
    };
    const drawBus = () => {
      if (!w.bus) return;
      const z0 = Math.max(0.9, B.z), z1 = B.z + 11, Xs = 0.9, Xo = 3.4;
      slab(r, C, Xs, 0.35, Xs, 3.1, z0, z1, MID); // the side toward us
      for (let k = 0; k < 6; k++) { const za = B.z + 2.2 + k * 1.45; if (za > z0) slab(r, C, Xs, 1.6, Xs, 2.6, za, za + 1.1, BRIGHT); }
      for (let dr = 0; dr < 2; dr++) {
        const za = B.z + (dr ? 7.4 : 0.5), op = B.door * 0.5;
        if (za <= z0) continue;
        slab(r, C, Xs, 0.35, Xs, 2.4, za, za + 1.2, B.door > 0 ? BRIGHT : DARK);
        slab(r, C, Xs, 0.35, Xs, 2.4, za, za + 0.6 * (1 - op), DARK); slab(r, C, Xs, 0.35, Xs, 2.4, za + 1.2 - 0.6 * (1 - op), za + 1.2, DARK);
      }
      if (B.z > 0.9) { // the front: the windscreen, the route plate (lit, blank), the headlights
        r.rect(sx(C, Xs, B.z), sy(C, 3.1, B.z), ((Xo - Xs) * C.F) / B.z, (2.75 * C.F) / B.z, MID);
        r.rect(sx(C, Xs + 0.15, B.z), sy(C, 2.75, B.z), ((Xo - Xs - 0.3) * C.F) / B.z, (1.0 * C.F) / B.z, DARK);
        r.rect(sx(C, Xs + 0.7, B.z), sy(C, 3.0, B.z), ((Xo - Xs - 1.4) * C.F) / B.z, (0.2 * C.F) / B.z, BRIGHT + DIM);
        for (const k of ONE) { const lx = sx(C, k < 0 ? Xs + 0.3 : Xo - 0.3, B.z), ly = sy(C, 0.75, B.z); if (B.st === 'in') glow(r, lx, ly, (0.6 * C.F) / B.z, (0.35 * C.F) / B.z, 0.7); r.disc(lx, ly, Math.max(0.6, (0.14 * C.F) / B.z), BRIGHT); }
      }
      targets.push({ x: sx(C, Xs, z0), y: sy(C, 3.1, z0), w: Math.max(4, sx(C, Xs, z1) - sx(C, Xs, z0)), h: sy(C, 0.35, z0) - sy(C, 3.1, z0) });
    };
    if (Bz > DZ) { cars(Infinity, Bz); drawBus(); cars(Bz, DZ); drawDog(); cars(DZ, -Infinity); }
    else { cars(Infinity, DZ); drawDog(); cars(DZ, Bz); drawBus(); cars(Bz, -Infinity); }
    // the figure: waiting (its shadow thrown from the lamp, a stamp on the beat), walking to the door and in, or a new
    // one walking up from behind us to wait
    const beat = tick(w, f, dt);
    if (beat) { w.stamp = 0.22; w.odd = 1 - w.odd; }
    if (F.st === 'board') {
      const tx = 0.95, tz = ZS + 1.1, dx = tx - F.X, dz = tz - F.z, d = Math.hypot(dx, dz), st = Math.min(d, 1.2 * dt), x0 = sx(C, F.X, F.z);
      F.X += (dx / (d || 1)) * st; F.z += (dz / (d || 1)) * st; F.ph += st / (0.1 * 1.75);
      // it walks partly toward us: the step seen across the picture is as long as the hips go across it (the planted foot
      // stays put)
      if (st > 1e-6) F.stride = clamp(Math.abs(sx(C, F.X, F.z) - x0) / ((st * C.F) / F.z));
      if (d < 0.05) { F.st = 'gone'; F.t = 0; }
    } else if (F.st === 'gone') { if (!w.bus && (F.t += dt) > 12) Object.assign(F, { st: 'come', X: -0.6, z: 1.4, ph: 0 }); }
    else if (F.st === 'come') { const st = Math.min(5 - F.z, 1.1 * dt); F.z += st; F.X = lerp(-0.6, -0.25, (F.z - 1.4) / 3.6); F.ph += st / (0.1 * 1.75); if (F.z >= 5) F.st = 'wait'; }
    if (F.st !== 'gone') {
      const fs = C.F / F.z, fh = 1.75 * fs, fx = sx(C, F.X, F.z), fb = sy(C, 0, F.z);
      if (F.st === 'wait' && lampOn) {
        const kk = 6 / (6 - 1.75), Sx = 1.7 + (F.X - 1.7) * kk, Sz = 8.5 + (F.z - 8.5) * kk, dl = Math.hypot(F.X - 1.7, F.z - 8.5), qx = (-(F.z - 8.5) / dl) * 0.2, qz = ((F.X - 1.7) / dl) * 0.2;
        poly(r, [P3(C, F.X + qx, 0, F.z + qz), P3(C, Sx + qx * 1.4, 0, Sz + qz * 1.4), P3(C, Sx - qx * 1.4, 0, Sz - qz * 1.4), P3(C, F.X - qx, 0, F.z - qz)], MID);
      }
      let J;
      if (F.st === 'board') J = hood(r, fx, fb, fh, FIG, { dir: 1, walk: true, ph: F.ph, stride: F.stride ?? 1 });
      else J = hoodBack(r, fx, fb, fh, FIG, { walk: F.st === 'come' || w.stamp > 0, ph: F.st === 'come' ? F.ph : w.odd * Math.PI, nod: w.cars.some((c) => c.toward && c.z < 80) || (B && B.st === 'in') ? 0 : 0.35 });
      if (F.st === 'wait' && beat && w.odd) w.breath.push(puff(fx, J.hy - J.hr * 0.6, 0, -0.01 * N, 0.025 * N, 0.6, 1.5, 1.2));
      targets.push({ x: fx - fh * 0.2, y: fb - fh, w: fh * 0.4, h: fh });
    }
    // the shelter's near parts: the roof slab with its snow, the near side wall (a mosaic of a sun and waves)
    slab(r, C, -2.85, 2.6, -0.6, 2.6, 3.3, 7.3, MID + DIM);
    slab(r, C, -0.6, 2.6, -0.6, 2.85, 3.3, 7.3, MID);
    const s55 = C.F / 3.3;
    r.rect(sx(C, -2.85, 3.3), sy(C, 2.85, 3.3), 2.25 * s55, 0.25 * s55, MID);
    r.rect(sx(C, -2.85, 3.3), sy(C, 3.0, 3.3), 2.25 * s55, 0.15 * s55, BRIGHT);
    const nx0 = sx(C, -2.6, 3.5), ny0 = sy(C, 2.6, 3.5), s5 = C.F / 3.5;
    r.rect(nx0, ny0, 1.7 * s5, 2.6 * s5, MID);
    r.disc(nx0 + 0.55 * s5, ny0 + 0.75 * s5, 0.35 * s5, HOT + DIM);
    waves(r, nx0, ny0, s5);
    // the snow: falling with the wind, and in the storm snaking along the ground
    snowStep(W, w.flakes, Math.round((K === 'storm' ? 190 : 70) * u * (0.7 + 0.5 * f.level)), wind, (SNOW_V * C.F) / (3 * N), (d) => sy(C, 0, 3 * d));
    snowDraw(r, w.flakes, u, 1, 5, (x, y, d) => lampOn && d > 2 && Math.abs(x - lpx) < (y - lpy) * 0.7 + 0.02 * N && y > lpy && y < lpy + 0.35 * N);
    plume(W, w.breath, wind * N * 0.4, LMID, 0.6, 10);
  },
};

// ---------------------------------------------------------------------------------------------- kitchen
// A small kitchen at night: the gas cooker with the kettle on its ring, the blue flame licking up round it with the bass
// (a kick flares it), the water heating until it steams from the spout (rising, slowing, spreading); the figure at the
// table by the window with a glass of tea in its holder (a wisp off it), the headphones on, nodding on the beat; a radio
// on the sill, its dial glowing with the level, the needle swinging over to the note's place (a snare crackles it); the
// lamp on its flex over the table, a moth circling it that darts on the hats; outside the blocks and the snow. The kind
// is the hour: late (a low flame, the radio low), the boil (the lid rattling on the kicks), the radio (tuned, bright).
// A drop is the whistle: a jet of steam out of the spout, fast, slowing, turning up into a cloud.
const KITCH_W = { late: [3, 2, 1], boil: [1, 2, 3], radio: [2, 2, 1] };
const kitchen = {
  init(W) {
    const { w, rnd } = W, lit = new Uint8Array(40);
    for (let i = 0; i < 40; i++) if (rnd() < 0.3) lit[i] = pick(rnd, LIFE);
    Object.assign(w, { kind: rollW(rnd, KITCH_W, bandOf(W.a)), lit, temp: 0.5 + 0.3 * rnd(), steam: [], tea: [], flakes: [], whistle: 0, flare: 0, lid: 0, lamp: { a: 0.04, v: 0 }, moth: { a: 0, w: 2.5 }, tune: { x: 0.3, v: 0 }, to: 0.3, stat: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), buf = r.buf;
    if (f.section === 'change') w.kind = rollW(rnd, KITCH_W, band);
    if (f.section === 'drop') w.whistle = 3.5;
    const K = w.kind;
    for (const h of hits) {
      if (isLow(h)) { w.flare = Math.min(1, w.flare + 0.6 * h.strength); if (w.temp > 0.85 || K === 'boil') w.lid = 0.15; w.lamp.v += 0.06 * h.strength; }
      else if (h.kind === 'snare') w.stat = 0.12;
      else if (h.kind === 'hat') w.moth.w += (rnd() < 0.5 ? -1 : 1) * 2.5;
      if (isTonal(h)) w.to = 0.08 + 0.84 * (h.pc / 11);
    }
    const flame = clamp((K === 'late' ? 0.35 : K === 'boil' ? 0.9 : 0.55) + 0.5 * f.rel.bassDrive + 0.6 * w.flare);
    w.flare *= Math.exp(-dt * 4); w.lid -= dt; w.stat -= dt; w.whistle -= dt;
    w.temp = clamp(w.temp + dt * (0.03 * flame * (1 - w.temp) - 0.004));
    spring(w.tune, dt, 30, 6, w.to);
    swing(w.lamp, dt, 0.94, 0.25); // the flex and the shade to its middle, 0.225 N at the figure's scale (1.75 m is 0.42 N)
    w.moth.w = follow(w.moth.w, 2.5 + 3 * f.rel.trebDrive, dt, 1.2);
    w.moth.a += w.moth.w * dt;
    // the window: the night, the block across with its windows, the snow; the sill, a tulle curtain at its side
    const wx0 = 0.5 * N, wx1 = 0.9 * N, wy0 = 0.1 * N, wy1 = 0.48 * N;
    r.rect(0, 0, N, 0.86 * N, MID);
    r.rect(wx0, wy0, wx1 - wx0, wy1 - wy0, BG);
    skyGlow(r, wy0, wy1, 0.42, wx0, wx1);
    r.rect(wx0, 0.2 * N, wx1 - wx0, wy1 - 0.2 * N, DARK);
    for (let k = 0; k < 5; k++) for (let j = 0; j < 8; j++) { const c = w.lit[k * 8 + j]; r.rect(wx0 + (0.02 + j * 0.05) * N, (0.23 + k * 0.05) * N, 0.025 * N, 0.025 * N, c || DARK + DIM); }
    snowStep(W, w.flakes, Math.round(40 * u * (0.6 + 0.6 * f.level)), 0.01, 0.04, () => wy1, wx0, wx1, wy0);
    snowDraw(r, w.flakes, u, 1, 5, null, wy0); // through the window only, not on the wall over it
    r.rect(wx0, wy0, wx1 - wx0, mx1(1.5 * u), FIG); r.rect(wx0, wy1 - u, wx1 - wx0, mx1(1.5 * u), FIG);
    for (const xx of [wx0, (wx0 + wx1) / 2, wx1 - 1.5 * u]) r.rect(xx, wy0, mx1(1.5 * u), wy1 - wy0, FIG);
    r.rect(wx0, 0.22 * N, wx1 - wx0, mx1(1.5 * u), FIG);
    r.rect(wx0 - 0.01 * N, wy1, wx1 - wx0 + 0.02 * N, 0.02 * N, LMID);
    poly(r, [[wx0 - 0.02 * N, wy0 - 0.02 * N], [wx0 + 0.07 * N, wy0 - 0.02 * N], [wx0 + 0.05 * N + Math.sin(t * 0.5) * u, wy1], [wx0 - 0.02 * N, wy1]], LMID, 0.35);
    // the tiles behind the cooker, the floor
    r.rect(0.02 * N, 0.42 * N, 0.4 * N, 0.2 * N, LMID + DIM);
    for (let y = 0.42 * N; y < 0.62 * N; y += 0.035 * N) { span(r, y, 0.02 * N, 0.42 * N, MID); for (let x = 0.02 * N; x < 0.42 * N; x += 0.035 * N) vcol(r, x, y, Math.min(0.62 * N, y + 0.035 * N), MID); }
    r.rect(0, 0.86 * N, N, 0.14 * N, MID + DIM);
    for (let y = 0.86 * N; y < N; y += 0.04 * N) span(r, y, 0, N, DARK + DIM);
    // the radio on the sill: the case, the cloth grille breathing with the level, the dial glowing, the needle swinging
    const rx = 0.75 * N, ry = 0.405 * N, rw = 0.14 * N, rh = 0.075 * N, on = K === 'radio' ? 1 : 0.55;
    r.rect(rx, ry, rw, rh, HOT + DIM);
    for (let y = ry + 0.012 * N; y < ry + rh - 0.01 * N; y += 2 * u) for (let x = rx + 0.01 * N; x < rx + 0.05 * N; x += 2 * u) r.set(x, y, bay(x, y) < 0.3 + 0.5 * f.level ? LMID : DARK);
    const dx0 = rx + 0.06 * N, dw = 0.07 * N, dy = ry + 0.015 * N, dh = 0.025 * N;
    r.rect(dx0, dy, dw, dh, w.stat > 0 && hash(Math.floor(t * 40), 3) < 0.5 ? DARK : on * (0.6 + 0.4 * f.level) > 0.6 ? BRIGHT : HOT + DIM);
    for (let k = 0; k < 7; k++) r.set(dx0 + (k + 0.5) * (dw / 7), dy + dh - u, DARK);
    vcol(r, dx0 + clamp(w.tune.x) * dw, dy - u, dy + dh + u, BLACK);
    r.disc(rx + rw * 0.72, ry + rh * 0.72, mx1(1.2 * u), DARK); r.disc(rx + rw * 0.9, ry + rh * 0.72, mx1(1.2 * u), DARK);
    targets.push({ x: rx, y: ry, w: rw, h: rh });
    // the cooker: the white enamel, the oven door with its window, the knobs, the hob, the burners
    r.rect(0.06 * N, 0.6 * N, 0.3 * N, 0.26 * N, LMID);
    r.rect(0.08 * N, 0.67 * N, 0.26 * N, 0.16 * N, MID);
    r.rect(0.12 * N, 0.7 * N, 0.18 * N, 0.07 * N, DARK);
    for (let k = 0; k < 4; k++) r.disc((0.1 + k * 0.06) * N, 0.635 * N, mx1(1.3 * u), DARK);
    r.rect(0.05 * N, 0.595 * N, 0.32 * N, mx1(1.5 * u), MID);
    ell(r, 0.13 * N, 0.594 * N, 0.04 * N, 0.006 * N, DARK);
    // the flame round the kettle's foot: blue tongues licking up, higher with the bass and the flare
    const kx = 0.27 * N, kb = 0.588 * N;
    for (let k = 0; k < 9; k++) {
      const x = kx + (k - 4) * 0.012 * N, hh = (0.006 + 0.016 * flame * (0.6 + 0.4 * hash(k, Math.floor(t * 14)))) * N * (k === 0 || k === 8 ? 0.6 : 1);
      poly(r, [[x - 0.005 * N, kb + 0.004 * N], [x + 0.005 * N, kb + 0.004 * N], [x + (hash(k, Math.floor(t * 9)) - 0.5) * 0.006 * N, kb - hh]], COOL);
      r.set(x, kb, BRIGHT);
    }
    // the kettle: the round enamel body, the lid (rattling), the spout up to the left with its whistle, the handle
    const kh = 0.1 * N, kw = 0.07 * N, lid = w.lid > 0 ? (hash(Math.floor(t * 30), 1) - 0.5) * 1.5 * u : 0;
    poly(r, [[kx - kw, kb], [kx + kw, kb], [kx + kw * 0.75, kb - kh * 0.75], [kx - kw * 0.75, kb - kh * 0.75]], COOL + DIM);
    ell(r, kx, kb - kh * 0.75, kw * 0.75, kh * 0.25, COOL + DIM);
    span(r, kb - kh * 0.4, kx - kw * 0.88, kx + kw * 0.88, LMID);
    ell(r, kx, kb - kh * 0.98 + lid, kw * 0.3, kh * 0.06, MID);
    r.disc(kx, kb - kh * 1.05 + lid, mx1(1.2 * u), DARK);
    r.ring(kx, kb - kh * 0.95, kw * 0.6, mx1(1.5 * u), DARK, 0.7);
    const spx = kx - kw * 1.45, spy = kb - kh * 0.85;
    strk(r, kx - kw * 0.8, kb - kh * 0.25, spx, spy, mx1(0.016 * N), COOL + DIM);
    r.rect(spx - 0.008 * N, spy - 0.012 * N, 0.016 * N, 0.012 * N, MID);
    targets.push({ x: kx - kw, y: kb - kh * 1.1, w: 2 * kw, h: kh * 1.1 });
    // the steam: from the spout as the water heats; the whistle's jet out along the spout, slowing, turning up
    const rate = w.whistle > 0 ? 30 : clamp((w.temp - 0.55) * 2.5) * (K === 'boil' ? 14 : 7);
    const jet = w.whistle > 0;
    for (let n = rate * dt; n > 0; n--) if (rnd() < n) w.steam.push(puff(spx - 0.006 * N, spy - 0.01 * N, jet ? -0.8 * N : -0.02 * N, jet ? -0.6 * N : -0.03 * N, 0.07 * N, 1.2, jet ? 1.6 : 2.8, jet ? 2.6 : 1.8, jet ? 0.1 : 0.5));
    plume(W, w.steam, 0.01 * N, LMID, 0.75, 50);
    if (jet) for (let k = 0; k < 4; k++) r.set(spx - (k + 1) * 0.012 * N + (rnd() - 0.5) * u, spy - (k + 1) * 0.009 * N + (rnd() - 0.5) * u, BRIGHT); // the jet's core
    // the lamp on its flex over the table, swinging a little, its light falling on the table; the moth round the bulb
    const lx0 = 0.69 * N, L = 0.2 * N, lxb = lx0 + Math.sin(w.lamp.a) * L, lyb = Math.cos(w.lamp.a) * L;
    const mR = 0.06 * N, mx = lxb + Math.cos(w.moth.a) * mR, my = lyb + 0.04 * N + Math.sin(w.moth.a) * mR * 0.3 + Math.sin(t * 7) * u;
    const moth = () => { const fl = Math.floor(t * 18) % 2 ? u : 0; r.line(mx - 1.5 * u, my - fl, mx, my, DARK); r.line(mx, my, mx + 1.5 * u, my - fl, DARK); };
    if (Math.sin(w.moth.a) < 0) moth();
    glow(r, lxb, lyb + 0.06 * N, 0.18 * N, 0.09 * N, 0.75);
    r.line(lx0, 0, lxb, lyb, DARK);
    poly(r, [[lxb - 0.016 * N, lyb], [lxb + 0.016 * N, lyb], [lxb + 0.055 * N, lyb + 0.04 * N], [lxb - 0.055 * N, lyb + 0.04 * N]], DARK);
    span(r, lyb + 0.04 * N, lxb - 0.055 * N, lxb + 0.055 * N, MID);
    r.disc(lxb, lyb + 0.045 * N, mx1(0.014 * N), BRIGHT);
    if (Math.sin(w.moth.a) >= 0) moth();
    // the table with its oilcloth, the glass of tea in its holder, the figure on the stool with both hands round it
    const ty = 0.64 * N;
    r.rect(0.46 * N, ty + 0.015 * N, 0.5 * N, 0.04 * N, LMID);
    for (let x = 0.46 * N; x < 0.96 * N; x += 0.03 * N) r.rect(x, ty + 0.015 * N, 0.015 * N, 0.04 * N, COOL + DIM);
    for (const xx of [0.5 * N, 0.92 * N]) r.rect(xx, ty + 0.055 * N, 0.02 * N, 0.86 * N - ty - 0.055 * N, DARK);
    r.rect(0.45 * N, ty, 0.52 * N, 0.015 * N, MID);
    glow(r, lxb + (Math.tan(w.lamp.a) * (ty - lyb)) * 0.9, ty + 0.004 * N, 0.17 * N, 0.012 * N, 1.1);
    const gx = 0.62 * N, gy = ty;
    r.rect(gx - 0.014 * N, gy - 0.055 * N, 0.028 * N, 0.055 * N, HOT + DIM);
    r.rect(gx - 0.016 * N, gy - 0.03 * N, 0.032 * N, 0.03 * N, MID);
    r.ring(gx + 0.02 * N, gy - 0.017 * N, 0.008 * N, mx1(u), MID);
    r.line(gx + 0.006 * N, gy - 0.055 * N, gx + 0.012 * N + f.beat.pulse * u, gy - 0.085 * N, LMID);
    if (rnd() < dt * 3) w.tea.push(puff(gx, gy - 0.06 * N, 0, -0.01 * N, 0.02 * N, 1, 2.2, 0.8));
    plume(W, w.tea, 0, LMID, 0.45, 10);
    r.rect(0.39 * N, 0.72 * N, 0.1 * N, 0.015 * N, MID);
    for (const xx of [0.4 * N, 0.47 * N]) vcol(r, xx, 0.735 * N, 0.86 * N, DARK);
    const fh = 0.42 * N, J = hood(r, 0.44 * N, 0, fh, FIG, { sit: true, seat: 0.715 * N, feet: 0.86 * N, dir: 1, lean: 0.3, nod: 0.35 + 0.3 * f.beat.pulse, hand: [gx - 0.02 * N, gy - 0.025 * N] });
    targets.push({ x: J.hx - 0.1 * fh, y: J.top, w: 0.3 * fh, h: 0.86 * N - J.top });
    r.rect(0.46 * N, ty + 0.015 * N, 0.5 * N, mx1(u), DARK + DIM);
  },
};

// ---------------------------------------------------------------------------------------------- garages
// The row of metal garages behind the blocks, each its owner's colour, rust under the hinges, snow on the roofs and
// icicles along the eaves: one roller door half up, warm light inside, the figure crouched at work with an angle
// grinder; on a kick the disc bites and the sparks fly out under the door (parabolas in the one gravity, bouncing off the
// ground and losing most of their speed, cooling from bright to hot to dim), a thin stream between with the bass; the
// grinder steps along the bar on the beat. The light from the door spills out over the ground (the opening cast from
// the bulb inside). Puddles in the slush mirror the lamp over the next door and the lit opening (mirrored about the
// garages' foot, rippled by the treble); a drip falls off an icicle on the hats, a ring spreading where it lands. A snare
// flickers the lamp, a note warms or cools the light inside. The kind is the weather: quiet snow, the sparks flying, a
// thaw. A drop rolls the door right up (the drum turning as v / r) and the light spills across the snow.
const GAR_W = { quiet: [3, 2, 1], sparks: [1, 2, 3], thaw: [2, 2, 1] };
const PUDDLES = [[0.9, 2.35, 1.4, 0.55], [-2.7, 3.5, 1.0, 0.35], [2.7, 4.3, 0.9, 0.25], [-0.6, 5.12, 3.6, 0.16]];
const GCOLS = [DARK, COOL + DIM, MID, HOT + DIM, MID + DIM], HINGES = [0.5, 1.6], SHELVES = [1.3, 1.8];
const garages = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, GAR_W, bandOf(W.a)), open: 1, want: 1, drum: 0, sparks: [], drips: [], rings: [], flakes: [], flick: 0, warm: 0, bite: 0, step: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), buf = r.buf;
    const C = cam(0.5 * N, 0.5 * N, 0.6 * N, 1.6), ZG = 5.5, sG = C.F / ZG, yG = sy(C, 0, ZG), hy = Math.round(C.hor), ZB = ZG + 4.5;
    if (f.section === 'change') { w.kind = rollW(rnd, GAR_W, band); w.want = 1; }
    if (f.section === 'drop') w.want = 2.15;
    const K = w.kind, gc = G * sG; // gravity in cells a second squared at the garages' depth
    // the door: up or down at a steady 0.45 m/s, the drum turning as v / r (its roll thickening as the slats wind on)
    const was = w.open;
    w.open += clamp(w.want - w.open, -0.45 * dt, 0.45 * dt);
    w.drum += (w.open - was) / (0.12 + 0.05 * (w.open / 2.15));
    // the grinder: where its disc meets the bar steps along it on the beat; a kick bites
    if (tick(w, f, dt)) w.step = (w.step + 1) % 5;
    const cX = -0.1 + w.step * 0.12, cY = 0.42, cZ = ZG + 1.2;
    const throwSparks = (n) => { for (let k = 0; k < n; k++) { const a = rnd(), sp = 3 + rnd() * 6; w.sparks.push({ X: cX, Y: cY, z: cZ, vX: 1 + rnd() * 3, vY: 0.5 + rnd() * 2.5, vz: -(2 + sp * a), life: 0.6 + rnd() * 0.9, hot: 0.5, px: null, py: 0 }); } };
    for (const h of hits) {
      if (isLow(h)) { throwSparks(Math.round((K === 'sparks' ? 30 : 16) * h.strength)); w.bite = 0.15; }
      else if (h.kind === 'snare') w.flick = 0.06 + 0.08 * h.strength;
      else if (h.kind === 'hat') { // a drip off the tip of one of the icicles there are
        const g = K === 'thaw' ? (rnd() < 0.5 ? 1 : 3) : Math.floor(rnd() * 5), k = Math.floor(rnd() * 4);
        w.drips.push({ X: -8 + g * 3.2 + 0.4 + k * 0.8, Y: 2.5 - (0.12 + 0.2 * hash(g * 4 + k, 2)), vY: 0 });
      }
      if (isTonal(h)) w.warm = h.pc % 2 ? 1 : -1;
    }
    for (let n = dt * (K === 'sparks' ? 20 : 8) * f.rel.bassDrive; n > 0; n--) if (rnd() < n) throwSparks(1);
    if (f.section === 'drop') throwSparks(40);
    w.flick -= dt; w.bite -= dt;
    const lampOn = w.flick <= 0, inside = w.warm > 0 ? BRIGHT : w.warm < 0 ? LMID : BRIGHT;
    // the sky, the blocks behind with their windows, the snow on the ground
    skyGlow(r, 0.15 * N, hy, 0.42);
    const s50 = C.F / 75;
    r.rect(0, sy(C, 25.8, 75), N, sy(C, 0, 75) - sy(C, 25.8, 75), DARK);
    for (let k = 0; k < 9; k++) for (let j = -14; j < 15; j++) if (hash(j + 40, k) < 0.25) r.rect(sx(C, j * 3.1, 75), sy(C, 2.4 + 2.8 * k, 75), 1.4 * s50, 1.5 * s50, LIFE[Math.floor(hash(k, j + 3) * 4)]);
    for (let y = hy; y < N; y++) span(r, y, 0, N, K === 'thaw' ? MID + DIM : LMID);
    // the garages: five boxes, each door painted its own colour, rust streaks, the snow on the roofs, the icicles
    const COLS = GCOLS;
    for (let g = 0; g < 5; g++) {
      const X0 = -8 + g * 3.2, x0 = sx(C, X0, ZG), x1 = sx(C, X0 + 3.2, ZG), y0 = sy(C, 2.5, ZG);
      r.rect(x0, y0, x1 - x0, yG - y0, MID + DIM);
      if (g !== 2) {
        r.rect(sx(C, X0 + 0.25, ZG), sy(C, 2.15, ZG), 2.7 * sG, 2.15 * sG, COLS[g]);
        vcol(r, sx(C, X0 + 1.6, ZG), sy(C, 2.15, ZG), yG, DARK);
        for (const yy of HINGES) { r.rect(sx(C, X0 + 0.25, ZG), sy(C, yy + 0.1, ZG), 0.25 * sG, mx1(0.1 * sG), DARK); r.rect(sx(C, X0 + 0.32, ZG), sy(C, yy, ZG), mx1(0.08 * sG), yy * sG * 0.5, HOT + DIM); }
      }
      r.rect(x0, y0 - 0.12 * sG, x1 - x0, 0.14 * sG, BRIGHT);
      for (let k = 0; k < 6; k++) if (hash(g, k) < 0.6) r.disc(sx(C, X0 + 0.3 + k * 0.5, ZG), y0 - 0.1 * sG, mx1(0.12 * sG), BRIGHT);
      if (K !== 'thaw' || g % 2) for (let k = 0; k < 4; k++) { const ix = sx(C, X0 + 0.4 + k * 0.8, ZG), il = (0.12 + 0.2 * hash(g * 4 + k, 2)) * sG; poly(r, [[ix - 0.04 * sG, y0], [ix + 0.04 * sG, y0], [ix, y0 + il]], LMID); }
      vcol(r, x0, y0, yG, DARK);
    }
    // inside the open garage: the lit back wall, the shelves, the bench, the bulb; the figure crouched at the bar
    const ox0 = sx(C, -1.35, ZG), ox1 = sx(C, 1.35, ZG), oyT = sy(C, 2.15, ZG);
    r.rect(ox0, oyT, ox1 - ox0, yG - oyT, MID);
    const s13 = C.F / ZB;
    r.rect(sx(C, -1.35, ZB), sy(C, 2.3, ZB), 2.7 * s13, 2.3 * s13, inside);
    for (const Y of SHELVES) { span(r, sy(C, Y, ZB), sx(C, -1.3, ZB), sx(C, -0.2, ZB), DARK); for (let k = 0; k < 4; k++) r.rect(sx(C, -1.2 + k * 0.25, ZB), sy(C, Y + 0.2, ZB), 0.12 * s13, 0.2 * s13, k % 2 ? HOT + DIM : MID); }
    r.rect(sx(C, 0.3, ZB - 0.5), sy(C, 0.9, ZB - 0.5), 1 * (C.F / (ZB - 0.5)), 0.9 * (C.F / (ZB - 0.5)), DARK);
    slab(r, C, -1.35, 0, 1.35, 0, ZG, ZB, LMID + DIM);
    line3(r, C, 0.3, 2.3, ZG + 2.6, 0.3, 2.05, ZG + 2.6, DARK);
    r.disc(sx(C, 0.3, ZG + 2.6), sy(C, 2.0, ZG + 2.6), mx1((0.07 * C.F) / (ZG + 2.6)), inside);
    // the figure crouched behind the bar (the bar 0.3 m nearer, so drawn over it), its hand on the grinder
    const fz = ZG + 1.5, fs = C.F / fz, hand = P3(C, cX - 0.18, cY + 0.1, cZ);
    hood(r, sx(C, -0.75, fz), sy(C, 0, fz), 1.75 * fs, FIG, { sit: true, seat: sy(C, 0.42, fz), feet: sy(C, 0, fz), dir: 1, lean: 0.75, nod: 0.5, hand });
    r.rect(sx(C, -0.2, cZ), sy(C, cY, cZ), 0.9 * (C.F / cZ), mx1(0.05 * (C.F / cZ)), LMID); // the bar on its stand
    vcol(r, sx(C, 0.3, cZ), sy(C, cY, cZ), sy(C, 0, cZ), DARK);
    const [gx, gy] = P3(C, cX, cY + 0.06, cZ);
    r.rect(hand[0] - 0.08 * fs, hand[1] - 0.04 * fs, 0.16 * fs, 0.08 * fs, DARK); // the grinder, its disc on the bar
    r.ring(gx, gy, mx1(0.06 * fs), mx1(0.5 * u), w.bite > 0 ? BRIGHT : MID);
    // the roller door, its bottom edge at the opening's height, the slats, the drum box with its turning end cap
    const dy = sy(C, w.open, ZG);
    if (w.open < 2.14) { r.rect(ox0, oyT, ox1 - ox0, dy - oyT, COLS[2]); for (let Y = w.open + 0.1; Y < 2.15; Y += 0.12) span(r, sy(C, Y, ZG), ox0, ox1, DARK + DIM); span(r, dy - 1, ox0, ox1, DARK); }
    r.rect(ox0 - 0.1 * sG, sy(C, 2.45, ZG), ox1 - ox0 + 0.2 * sG, 0.3 * sG, DARK);
    const dcx = ox1 + 0.05 * sG, dcy = sy(C, 2.3, ZG), dR = (0.12 + 0.05 * (w.open / 2.15)) * sG; // the roll as thick as the slats on it
    r.disc(dcx, dcy, dR, MID);
    r.line(dcx, dcy, dcx + Math.cos(w.drum) * dR, dcy + Math.sin(w.drum) * dR, DARK);
    targets.push({ x: ox0, y: oyT, w: ox1 - ox0, h: yG - oyT });
    // the lamp over the next door, flickering on a snare; its pool on the snow
    const LX = 2.1, LYl = 2.3, lpx = sx(C, LX, ZG), lpy = sy(C, LYl, ZG);
    r.rect(lpx - 0.12 * sG, lpy - 0.1 * sG, 0.24 * sG, 0.2 * sG, DARK);
    r.disc(lpx, lpy, mx1(0.07 * sG), lampOn ? BRIGHT : LMID + DIM);
    if (lampOn) groundPool(r, C, LX, ZG - 1, 3.2, 0.75, -Infinity, ZG); // on the ground in front, not on the wall behind
    // the light out of the door on the ground: a point is lit when its ray to the bulb passes under the door's edge and
    // between the jambs (so the higher the door, the further it spills), brighter nearer the door
    const BX = 0.3, BY = 2.0, BZ = ZG + 2.6;
    for (let y = Math.ceil(yG); y < N; y++) {
      const z = zRow(C, y), lam = (ZG - z) / (BZ - z);
      if (BY * lam > w.open) break;
      const X0 = (-1.35 - BX * lam) / (1 - lam), X1 = (1.35 - BX * lam) / (1 - lam), k = 0.95 * (1 - lam) ** 1.5;
      for (let x = Math.max(0, Math.round(sx(C, X0, z))), xe = Math.min(N, Math.round(sx(C, X1, z))); x < xe; x++) if (BAYER[((y & 7) << 3) | (x & 7)] < k) buf[y * N + x] = LIT[buf[y * N + x]];
    }
    // the puddles mirror what stands on the garages' foot line (the lamp, the opening, the doors: exact for the garages'
    // front, the reflected ray meeting it at the mirrored row), rippling; a ray that clears the roofs goes up to the sky
    const amp = 0.4 + 1.6 * f.rel.trebDrive, yR = sy(C, 2.62, ZG);
    for (const [X0, z0, rX, rZ] of PUDDLES) {
      if (K !== 'thaw' && rX > 4) continue;
      const ya = Math.max(hy, Math.ceil(sy(C, 0, z0 + rZ))), yb = Math.min(N - 1, Math.floor(sy(C, 0, z0 - rZ)));
      for (let y = ya; y <= yb; y++) {
        const z = zRow(C, y), q = 1 - ((z - z0) / rZ) ** 2;
        if (q <= 0) continue;
        const hw = rX * Math.sqrt(q) * (0.85 + 0.15 * hash(y, 7)), xa = Math.max(0, Math.round(sx(C, X0 - hw, z))), xb = Math.min(N, Math.round(sx(C, X0 + hw, z))), sy0 = Math.round(2 * yG - y);
        if (sy0 < 0 || sy0 >= N) continue;
        const dx = Math.round(Math.sin(y * 1.7 + t * 4) * amp);
        for (let x = xa; x < xb; x++) { const c = sy0 < yR ? BG : buf[sy0 * N + Math.min(N - 1, Math.max(0, x + dx))]; buf[y * N + x] = c === BRIGHT || c === HOT ? c : dim(c); }
      }
    }
    // the drips: off an icicle's tip, falling under gravity down the garages' front, a ring spreading on the ground at its
    // foot (the near half of a circle there, as flat as the ground is seen from 1.6 m)
    prune(w.drips, (d) => { d.vY -= G * dt; d.Y += d.vY * dt; if (d.Y <= 0) { w.rings.push({ X: d.X, t: 0 }); return false; } r.rect(sx(C, d.X, ZG) - 0.35 * u, sy(C, d.Y, ZG), mx1(0.7 * u), mx1(1.2 * u), LMID); return true; });
    prune(w.rings, (g) => {
      g.t += dt;
      const R = 0.1 + g.t * 0.6;
      for (let k = 0, px = 0, py = 0; k <= 12; k++) { const a = (k / 12) * Math.PI, z = ZG - Math.sin(a) * R, x = sx(C, g.X + Math.cos(a) * R, z), y = sy(C, 0, z); if (k) r.line(px, py, x, y, LMID); px = x; py = y; }
      return g.t < 0.8;
    });
    // the sparks in the world: out along the disc's edge, under gravity, off the floor (inside and out) and the garage's
    // side walls, stopped by the door where it is down and by the front wall beside it; drawn as their streak, but not
    // while the door or the wall is between them and us
    for (const p of w.sparks) {
      const z0 = p.z, X0 = p.X, Y0 = p.Y;
      p.vY -= G * dt; p.X += p.vX * dt; p.Y += p.vY * dt; p.z += p.vz * dt; p.life -= dt;
      if (p.Y < 0 && p.vY < 0) { p.Y = 0; p.vY *= -0.32; p.vX *= 0.55; p.vz *= 0.55; }
      if (p.z < ZG && z0 >= ZG) { // out through the door's plane: where it crossed it, past a jamb (the side wall first) or the door
        const q = (z0 - ZG) / (z0 - p.z), Xc = X0 + q * (p.X - X0), Yc = Y0 + q * (p.Y - Y0);
        if (Math.abs(Xc) > 1.35) { p.z = ZG + 0.01; p.X = Math.sign(Xc) * 1.35; p.vX *= -0.3; }
        else if (Yc > w.open) { p.z = ZG + 0.01; p.vz *= -0.3; }
      }
      if (p.z > ZG && Math.abs(p.X) > 1.35) { p.X = Math.sign(p.X) * 1.35; p.vX *= -0.3; } // the garage's side walls
      const zc = Math.max(1.2, p.z), x = sx(C, p.X, zc), y = sy(C, p.Y, zc), q = ZG / zc;
      const seen = p.z <= ZG || (Math.abs(p.X * q) < 1.35 && C.Hc + (p.Y - C.Hc) * q < Math.min(w.open, 2.15));
      const sc = p.life > p.hot ? BRIGHT : p.life > p.hot * 0.4 ? HOT : HOT + DIM;
      if (p.px !== null && seen) { r.line(p.px, p.py, x, y, sc); if (p.z < 4) r.line(p.px + 1, p.py, x + 1, y, sc); }
      p.px = x; p.py = y;
    }
    trim(prune(w.sparks, (p) => p.life > 0 && p.z > 1.3), 160);
    // the weather: snow, or the thaw's drizzle
    snowStep(W, w.flakes, Math.round((K === 'thaw' ? 30 : 60) * u * (0.6 + 0.6 * f.level)), K === 'thaw' ? 0.01 : 0.03, K === 'thaw' ? 0.35 : (SNOW_V * C.F) / (2.6 * N), (d) => sy(C, 0, 2.6 * d), 0, N, 0, K === 'thaw' ? 0.012 : undefined);
    if (K === 'thaw') for (const fl of w.flakes) r.line(fl.x, fl.y, fl.x, fl.y - (2 * u) / fl.d, LMID + DIM);
    else snowDraw(r, w.flakes, u, 1, 5, (x, y) => lampOn && Math.abs(x - lpx) < 0.1 * N && y > lpy && y < yG);
    targets.push({ x: gx - 0.1 * fs, y: gy - 0.1 * fs, w: 0.2 * fs, h: 0.2 * fs });
    if (w.bite > 0) s.shake = Math.max(s.shake, 0.08);
  },
};

// ---------------------------------------------------------------------------------------------- factory
// A dead factory hall in perspective: two rows of concrete pillars with the crane rails on them, the roof's trusses (the
// near bays still roofed, with holes; further on only the bare trusses against the sky), the long window bands down the
// side walls with half their panes gone, the far end wall fallen in, the yard beyond and a tall chimney. A rusty gantry
// crane stands on its rails, its hook swinging on the chain as a pendulum (a kick pushes it). Snow comes down through the
// holes in the roof in shafts of moonlight (the one light direction: the moon high behind us, out of the picture; a patch
// on the floor under each hole, and past the roof the whole floor lit but for the shadows of the roof's edge and the
// wall), a hat shakes a little more through. The figure walks down the aisle between the pillars and back, a step on
// every beat, smaller as it goes (feet on its depth's row). Crows sit along the trusses and the crane; a snare puts a few
// up, they wheel and come back to their places. The kind is the night: the moon, the snow, still. A drop puts the whole
// flock up to wheel over the hall. Everything is drawn far to near, the trusses with what lies between them.
const HALL_W = { moon: [3, 2, 1], snow: [1, 2, 3], still: [2, 2, 1] };
const HALL_Z = [6, 14, 22, 30, 38, 46, 54, 62];
const HOLES = [[-4, -1, 8.5, 12.5], [2, 5, 15.5, 19.5]], CHIMNEY = [20, 40, 60];
const roofY = (X) => 11 + (3.5 * (12 - Math.abs(X))) / 12; // the roof's underside over X, eaves to ridge
function crowPerch(rnd, k) { const sp = k % 3; return sp === 0 ? { X: -5 + (k % 7) * 1.6, Y: 10.2, z: 27 } : sp === 1 ? { X: -10 + (k % 9) * 2.3, Y: 11, z: 14 } : { X: -9 + (k % 8) * 2.4, Y: 11, z: 22 }; }
// the sky beyond the roofless bays, darker on a clear night
function hallSky(r, hy, base) {
  const N = r.N, buf = r.buf;
  for (let y = 0; y < hy; y++) { const q = base + 0.8 * (y / hy) ** 2; for (let x = 0, i = y * N; x < N; x++, i++) buf[i] = q + BAYER[((y & 7) << 3) | (x & 7)] > 2 ? MID : DARK; }
}
// the side walls, a column at a time (each column one depth): the window bands with half their panes gone, a pane
// glinting on a note
function hallWalls(r, C, zE, glint) {
  const N = r.N, buf = r.buf;
  for (let x = 0; x < N; x++) {
    const dxs = x + 0.5 - C.cx, side = dxs < 0 ? -1 : 1, z = (side * 12 * C.F) / dxs;
    if (!(z > 0) || z > zE) continue;
    const y0 = Math.round(sy(C, 11, z)), y1 = Math.round(sy(C, 0, z)), b0 = Math.round(sy(C, 8.5, z)), b1 = Math.round(sy(C, 2.5, z)), col = Math.floor(z / 1.2), mul = z / 1.2 - col < 0.13;
    vcol(r, x, y0, y1, MID + DIM);
    for (let y = Math.max(0, b0); y < Math.min(N, b1); y++) {
      const Y = C.Hc + ((C.hor - y - 0.5) * z) / C.F, row = Math.floor((Y - 2.5) / 1.0), q = Y - 2.5 - row;
      buf[y * N + x] = mul || q < 0.12 ? DARK : (hash(col, row * 7 + side) < 0.5 ? (glint >= 0 && (col + row) % 12 === glint ? BRIGHT : LMID + DIM) : BG);
    }
  }
}
// past the roof's last truss (z 22) the moonlight reaches the floor where its ray clears the roof's edge (it comes down
// mdZ on for each metre: the higher the roof over X, the farther out) and the left wall (mdX across a metre, from 11 m)
function moonFloor(r, C, zE, mdX, mdZ) {
  const N = r.N, buf = r.buf;
  for (let y = Math.max(0, Math.ceil(sy(C, 0, zE))), ye = Math.min(N - 1, Math.floor(sy(C, 0, 22 + mdZ * 11))); y <= ye; y++) {
    const z = zRow(C, y), lim = (z - 22) / mdZ;
    if (lim < 11) continue;
    const cut = lim >= 14.5 ? 0 : 12 - (12 * (lim - 11)) / 3.5;
    for (let x = Math.max(0, Math.round(sx(C, -12 + mdX * 11, z))), xe = Math.min(N, Math.round(sx(C, 12, z))), i = y * N + x; x < xe; x++, i++) {
      const X = ((x + 0.5 - C.cx) * z) / C.F;
      if (Math.abs(X) >= cut && BAYER[((y & 7) << 3) | (x & 7)] < 0.7) buf[i] = LIT[buf[i]];
    }
  }
}
const factory = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, HALL_W, bandOf(W.a)), fz: 6, fdir: 1, bt0: null, hook: { a: 0.08, v: 0 }, flakes: [], snowed: false, crows: Array.from({ length: 20 }, (_, k) => { const p = crowPerch(rnd, k); return { ...p, p, fly: 0, vX: 0, vY: 0, vz: 0, ph: rnd() * TAU, dir: rnd() < 0.5 ? 1 : -1 }; }), flock: 0, glint: -1, glintT: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a);
    const C = cam(0.5 * N, 0.62 * N, 0.55 * N, 1.7), hy = Math.round(C.hor), mdX = 0.25, mdZ = 0.35;
    if (f.section === 'change') w.kind = rollW(rnd, HALL_W, band);
    const K = w.kind, rise = (c, ttl) => { c.fly = ttl; c.vY = 2.5 + rnd() * 1.5; c.vX = (rnd() - 0.5) * 4; c.vz = (rnd() - 0.3) * 4; };
    // a flake through a hole starts at the hole, in the roof's underside
    const holeFlake = (H0) => { const X = H0[0] + rnd() * (H0[1] - H0[0]); return { X, Y: roofY(X), z: H0[2] + rnd() * (H0[3] - H0[2]) }; };
    if (f.section === 'drop') { w.flock = 12; for (const c of w.crows) rise(c, 12); }
    for (const h of hits) {
      if (h.kind === 'snare') for (let k = 0; k < 3; k++) { const c = pick(rnd, w.crows); if (!c.fly) rise(c, 3 + rnd() * 3); }
      else if (isLow(h)) w.hook.v += 0.08 * h.strength;
      else if (h.kind === 'hat') { const H0 = pick(rnd, HOLES); for (let k = 0; k < 6; k++) w.flakes.push(holeFlake(H0)); }
      if (isTonal(h)) { w.glint = h.pc; w.glintT = 0.4; }
    }
    w.flock -= dt; w.glintT -= dt;
    swing(w.hook, dt, 5.75, 0.08); // the hook's middle 5.75 m under the trolley
    // the figure's walk: a step (0.7 m) a beat, down the aisle and back
    const bt = beatT(w, f, dt);
    if (w.bt0 === null || bt < w.bt0) w.bt0 = bt;
    const dz = Math.min(1.5, bt - w.bt0) * 0.7 * w.fdir;
    w.bt0 = bt;
    w.fz += dz;
    if (w.fz > 34) w.fdir = -1; else if (w.fz < 5) w.fdir = 1;
    // the sky beyond the roofless bays, the chimney, the yard's snow
    hallSky(r, hy, K === 'moon' ? 1.2 : 1.6);
    const cs = C.F / 130, cxh = sx(C, 9, 130);
    poly(r, [[cxh - 3 * cs, sy(C, 0, 130)], [cxh - 1.7 * cs, sy(C, 70, 130)], [cxh + 1.7 * cs, sy(C, 70, 130)], [cxh + 3 * cs, sy(C, 0, 130)]], DARK + DIM);
    for (const Y of CHIMNEY) span(r, sy(C, Y, 130), cxh - (3 - Y * 0.019) * cs, cxh + (3 - Y * 0.019) * cs, MID + DIM);
    for (let y = hy; y < N; y++) span(r, y, 0, N, LMID + DIM);
    // the far end wall fallen in (its face toward us in the moonlight), the side walls with their window bands
    const zE = 70;
    for (let x = Math.round(sx(C, -12, zE)); x < sx(C, 12, zE); x++) { const X = ((x + 0.5 - C.cx) * zE) / C.F, hh = Math.abs(X) < 6 ? 0.5 + 1.5 * hash(Math.floor(X), 2) : 3 + 5 * hash(Math.floor(X * 1.5), 3); vcol(r, x, sy(C, hh, zE), sy(C, 0, zE) + 1, K === 'moon' ? MID : MID + DIM); }
    hallWalls(r, C, zE, w.glintT > 0 ? w.glint : -1);
    // the floor: bare concrete with its joints, the drifts under the holes, the moonlight's patches (each corner of a hole
    // cast from the roof's height there)
    for (let y = hy + 1; y < N; y++) { const z = zRow(C, y); span(r, y, sx(C, -12, z), sx(C, 12, z), z % 6 < 0.15 * (z / 8) ? DARK + DIM : MID + DIM); }
    for (const k of ONE) line3(r, C, 3 * k, 0, 2, 3 * k, 0, zE, DARK + DIM);
    if (K === 'moon') moonFloor(r, C, zE, mdX, mdZ);
    for (const [x0, x1, z0, z1] of HOLES) {
      ell(r, sx(C, (x0 + x1) / 2 + mdX * 8, (z0 + z1) / 2 + mdZ * 8), sy(C, 0, (z0 + z1) / 2 + mdZ * 8), (1.6 * C.F) / ((z0 + z1) / 2), (0.25 * C.F) / ((z0 + z1) / 2), LMID);
      if (K === 'moon') {
        const h0 = roofY(x0), h1 = roofY(x1), zm = (z0 + z1) / 2;
        poly(r, [P3(C, x0 + mdX * h0, 0, z0 + mdZ * h0), P3(C, x1 + mdX * h1, 0, z0 + mdZ * h1), P3(C, x1 + mdX * h1, 0, z1 + mdZ * h1), P3(C, x0 + mdX * h0, 0, z1 + mdZ * h0)], -1, 0.7);
        poly(r, [P3(C, x0, h0, zm), P3(C, x1, h1, zm), P3(C, x1 + mdX * h1, 0, zm + mdZ * h1), P3(C, x0 + mdX * h0, 0, zm + mdZ * h0)], -1, 0.1);
      }
    }
    // the snow down the shafts under the holes (and more of it everywhere when it snows): new flakes come in at the top,
    // fall at the snow's terminal speed and drift on the draught onto the drifts (8 md on from 11 m)
    const want = Math.round((K === 'snow' ? 140 : K === 'moon' ? 50 : 25) * (0.6 + 0.6 * f.level)), dX = (mdX * 8 * SNOW_V) / 11, dZ = (mdZ * 8 * SNOW_V) / 11;
    while (w.flakes.length < want) {
      const H0 = pick(rnd, HOLES), all = K === 'snow' && rnd() < 0.5, p = all ? { X: -10 + rnd() * 20, Y: 14.5 + rnd(), z: 24 + rnd() * 40 } : holeFlake(H0);
      if (!w.snowed) p.Y *= rnd(); // the first fill all the way down
      w.flakes.push(p);
    }
    w.snowed = true;
    trim(w.flakes, 220);
    prune(w.flakes, (p) => { p.Y -= SNOW_V * dt; p.X += (dX + 0.11 * Math.sin(t + p.z)) * dt; p.z += dZ * dt; return p.Y > 0; });
    // the crows: perched in their rows, or up (wheeling round the hall in the flock, or round and back to their perch,
    // landing when they reach it)
    for (const c of w.crows) {
      if (c.fly <= 0) continue;
      c.fly = Math.max(1e-3, c.fly - dt); c.ph += dt * 14;
      const tX = w.flock > 0 ? Math.cos(t * 0.6 + c.p.X) * 7 : c.p.X, tY = w.flock > 0 ? 13 + Math.sin(c.p.X * 3) * 2 : c.p.Y + (c.fly > 1 ? 3 : 0), tz = w.flock > 0 ? 31 + Math.sin(t * 0.6 + c.p.X) * 7 : c.p.z;
      const back = c.fly < 1.5 && w.flock <= 0, g = back ? 3 : 0.6, lag = back ? 0.35 : 0.5;
      c.vX = follow(c.vX, (tX - c.X) * g, dt, lag); c.vY = follow(c.vY, (tY - c.Y) * g, dt, lag); c.vz = follow(c.vz, (tz - c.z) * g, dt, lag);
      c.X += c.vX * dt; c.Y += c.vY * dt; c.z = Math.max(3, c.z + c.vz * dt);
      if (c.vX) c.dir = c.vX > 0 ? 1 : -1;
      if (back && c.fly < 1 && Math.hypot(c.X - c.p.X, c.Y - c.p.Y, c.z - c.p.z) < 0.1 && Math.hypot(c.vX, c.vY, c.vz) < 0.5) { c.fly = 0; c.X = c.p.X; c.Y = c.p.Y; c.z = c.p.z; }
    }
    // far to near: each bay's trusses (the near ones roofed, with their holes), the pillars and the crane rails, and
    // between them what is at that depth: the crane and its hook, the figure, the falling snow, the crows
    const figure = () => {
      const fs = C.F / w.fz, fh = 1.75 * fs, fx = sx(C, -1.4, w.fz), fb = sy(C, 0, w.fz), J = hoodBack(r, fx, fb, fh, FIG, { walk: true, ph: Math.PI * bt, front: w.fdir < 0, nod: 0.3 });
      targets.push({ x: fx - fh * 0.2, y: J.top, w: fh * 0.4, h: fb - J.top });
    };
    const ZC = 27, crane = () => { // the crane on its rails: the bridge, the trolley, the chain and the hook swinging on it
      const sc = C.F / ZC, hx = 1.5, chain = 5.5, sa = Math.sin(w.hook.a), ca = Math.cos(w.hook.a), kx = hx + sa * chain, ky = 9.4 - ca * chain;
      r.rect(sx(C, -7, ZC), sy(C, 10.2, ZC), 14 * sc, 0.8 * sc, DARK);
      for (let k = 0; k < 14; k += 2) r.rect(sx(C, -7 + k, ZC), sy(C, 10.1, ZC), 0.6 * sc, 0.5 * sc, HOT + DIM);
      r.rect(sx(C, hx - 0.8, ZC), sy(C, 10.6, ZC), 1.6 * sc, 0.6 * sc, DARK);
      r.line(sx(C, hx, ZC), sy(C, 9.4, ZC), sx(C, kx, ZC), sy(C, ky, ZC), MID);
      r.ring(sx(C, hx + sa * 5.75, ZC), sy(C, 9.4 - ca * 5.75, ZC), mx1(0.22 * sc), mx1(0.12 * sc), DARK);
      targets.push({ x: sx(C, kx, ZC) - 0.4 * sc, y: sy(C, ky, ZC) - 0.4 * sc, w: 0.8 * sc, h: 0.8 * sc });
    };
    const smalls = (zHi, zLo) => {
      for (const p of w.flakes) if (p.z <= zHi && p.z > zLo) { const s = mx1((0.08 * C.F) / p.z); r.rect(sx(C, p.X, p.z), sy(C, p.Y, p.z), s, s, LMID); }
      for (const c of w.crows) if (c.z <= zHi && c.z > zLo) crow(r, sx(C, c.X, c.z), sy(C, c.Y, c.z), mx1(((c.fly > 0 ? 1 : 0.5) * C.F) / c.z), BLACK, c.fly > 0, c.ph, c.dir); // in the air, its wingspan
    };
    const layer = (zHi, zLo) => { // what lies from zHi to zLo, far to near
      const fFar = w.fz > ZC, za = fFar ? w.fz : ZC, zb = fFar ? ZC : w.fz;
      let hi = zHi;
      if (za <= zHi && za > zLo) { smalls(hi, za); if (fFar) figure(); else crane(); hi = za; }
      if (zb <= zHi && zb > zLo) { smalls(hi, zb); if (fFar) crane(); else figure(); hi = zb; }
      smalls(hi, zLo);
    };
    for (let i = HALL_Z.length - 1; i >= 0; i--) {
      const z = HALL_Z[i], zn = i > 0 ? HALL_Z[i - 1] : 0, s = C.F / z;
      layer(i === HALL_Z.length - 1 ? Infinity : HALL_Z[i + 1], z);
      if (z <= 22) for (const side of ONE) { // the roof panels between this truss and the next nearer one, but the holes
        slab(r, C, side * 12, 11, 0, 14.5, z, Math.max(zn, 1), DARK + DIM);
        for (const [x0, x1, z0, z1] of HOLES) if (z1 <= z && z0 >= zn && Math.sign(x0 + x1) === side) slab(r, C, x0, roofY(x0), x1, roofY(x1), z0, z1, BG);
      }
      line3(r, C, -12, 11, z, 12, 11, z, DARK);
      line3(r, C, -12, 11, z, 0, 14.5, z, DARK);
      line3(r, C, 12, 11, z, 0, 14.5, z, DARK);
      for (let k = -4; k <= 4; k++) { const X1 = k * 2.7 + (k > 0 ? -1.35 : 1.35); line3(r, C, k * 2.7, 11, z, X1, roofY(X1), z, DARK); }
      for (const side of ONE) {
        const X = side * 7, x0 = sx(C, X - 0.4, z - 0.4), x1 = sx(C, X + 0.4, z - 0.4);
        slab(r, C, X - side * 0.4, 0, X - side * 0.4, 9, z - 0.4, z + 0.4, DARK);
        r.rect(x0, sy(C, 9, z - 0.4), x1 - x0, sy(C, 0, z - 0.4) - sy(C, 9, z - 0.4), MID);
        r.rect(x0 - 0.2 * s, sy(C, 9.4, z - 0.4), x1 - x0 + 0.4 * s, 0.5 * s, MID);
        slab(r, C, X, 9.6, X, 9.0, z, zn || 2, DARK); // the crane rail's beam on to the next
      }
    }
    layer(HALL_Z[0], -Infinity);
  },
};

// ---------------------------------------------------------------------------------------------- stairwell
// The landing of a panel block's stairwell: the walls in two coats of paint (the dark oil below, whitewash above, the
// line between them climbing with the stairs), the bank of mailboxes with one door loose (it swings on its hinge on the
// hats, seen narrower as it turns), the lift's doors with the row of floor lamps over them: the cabin moves a floor a beat
// and the lit lamp steps with it (a note sends it to the note's floor). The figure sits on the steps with the
// headphones on, nodding; the bare bulb on its flex throws the figure's shadow big on the wall (swinging when a kick
// slams the door downstairs), dust turning in its light; a snare and the bulb flickers, the stairwell dimming but for
// the lamps. The kind is the hour: quiet, the lift busy, the bulb dying. A drop brings the lift to this floor: its
// doors slide open on an empty, lit cabin, its light out over the landing floor.
const STAIR_W = { quiet: [3, 2, 1], busy: [1, 2, 3], dying: [2, 2, 1] };
const STEP = { x: 0.05, y: 0.042 }, FLOOR = 5;
const stairwell = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, STAIR_W, bandOf(W.a)), floor: 1 + Math.floor(rnd() * 9), target: FLOOR + 2, wait: 0, call: false, open: 0, openT: 0, bulb: { a: 0.05, v: 0 }, flap: { x: 0.2, v: 0 }, under: null, flick: 0, motes: Array.from({ length: 14 }, () => ({ x: rnd(), y: rnd(), vx: 0, vy: 0 })), flakes: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), buf = r.buf;
    if (f.section === 'change') w.kind = rollW(rnd, STAIR_W, band);
    if (f.section === 'drop') { w.target = FLOOR; w.call = true; w.wait = 0; }
    const K = w.kind;
    for (const h of hits) {
      if (h.kind === 'snare') w.flick = 0.06 + 0.1 * h.strength;
      else if (isLow(h)) w.bulb.v += 0.5 * h.strength;
      else if (h.kind === 'hat') w.flap.v += (rnd() < 0.5 ? -1 : 1) * 2.5 * h.strength;
      if (isTonal(h) && !w.call) w.target = 1 + (h.pc % 9);
    }
    if (K === 'dying' && rnd() < dt * 2.5) w.flick = Math.max(w.flick, 0.03 + 0.05 * rnd());
    w.flick -= dt;
    swing(w.bulb, dt, 0.67, 0.35); // the flex and the bulb to its middle, 0.138 N at the figure's scale (1.75 m is 0.36 N)
    spring(w.flap, dt, 134, 1.5, 0.2); // a door on an upright hinge (gravity does not turn it): a stiff one, back toward ajar
    // the lift: a floor a beat toward its target, only with its doors shut; it waits a while at each stop; called, it opens
    // here for nine beats
    if (tick(w, f, dt)) {
      if (w.openT > 0) { if (--w.openT <= 0) w.call = false; }
      else if (w.open <= 0) { // (while the doors are still closing it stays)
        if (w.floor !== w.target) w.floor += Math.sign(w.target - w.floor);
        else if (w.call && w.floor === FLOOR) w.openT = 9;
        else if (--w.wait <= 0) { w.target = 1 + Math.floor(rnd() * 9); w.wait = K === 'busy' ? 1 : K === 'quiet' ? 8 : 4; }
      }
    }
    w.open = clamp(w.open + (w.openT > 0 ? dt : -dt) / 0.6);
    const lit = w.flick <= 0;
    // the walls: the paint line climbing with the stairs on the left, the dark coat under it, the whitewash over it
    const fy = 0.84 * N, sx0 = 0.4 * N, slope = STEP.y / STEP.x, bound = (x) => Math.min(0.5 * N, 0.5 * N - (sx0 - x) * slope);
    r.rect(0, 0, N, fy, LMID);
    for (let x = 0; x < N; x++) { const b = Math.round(bound(x)); vcol(r, x, b, fy, MID); vcol(r, x, b - Math.max(1, Math.round(0.008 * N)), b, DARK); }
    r.rect(0, 0, N, 0.05 * N, MID + DIM);
    r.rect(0, fy, N, N - fy, MID + DIM);
    for (let x = 0, k = 0; x < N; x += 0.06 * N, k++) for (let y = fy, j = 0; y < N; y += 0.03 * N, j++) if ((k + j) % 2) r.rect(x, y, 0.06 * N, 0.03 * N, DARK + DIM);
    // the window on the landing: the night, the snow, the frame; the radiator under it
    const wx0 = 0.8 * N, wx1 = 0.95 * N, wy0 = 0.12 * N, wy1 = 0.36 * N;
    r.rect(wx0, wy0, wx1 - wx0, wy1 - wy0, BG);
    r.rect(wx0, 0.28 * N, wx1 - wx0, wy1 - 0.28 * N, DARK);
    for (let k = 0; k < 3; k++) if (hash(k, Math.floor(t / 9)) < 0.6) r.rect(wx0 + (0.02 + k * 0.045) * N, 0.3 * N, 0.015 * N, 0.015 * N, BRIGHT);
    snowStep(W, w.flakes, Math.round(14 * u), 0.008, 0.04, () => wy1, wx0, wx1, wy0);
    snowDraw(r, w.flakes, u, 1, 5, null, wy0); // through the window only
    r.frame(Math.round(wx0), Math.round(wy0), Math.round(wx1 - wx0), Math.round(wy1 - wy0), DARK);
    vcol(r, (wx0 + wx1) / 2, wy0, wy1, DARK);
    r.rect(wx0 - 0.01 * N, wy1, wx1 - wx0 + 0.02 * N, 0.012 * N, MID);
    for (let x = wx0; x < wx1; x += 0.014 * N) r.rect(x, 0.56 * N, 0.008 * N, 0.11 * N, MID);
    // the mailboxes, one door loose on its hinge
    const mx0 = 0.31 * N, my0 = 0.42 * N, mw = 0.034 * N, mh = 0.045 * N;
    r.rect(mx0 - u, my0 - u, 5 * mw + 2 * u, 3 * mh + 2 * u, DARK);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) {
      const x = mx0 + i * mw, y = my0 + j * mh;
      if (i === 3 && j === 1) { const ww = mw * Math.abs(Math.cos(w.flap.x)); r.rect(x, y, mw, mh, DARK + DIM); r.rect(x, y, ww, mh - u, MID); continue; }
      r.rect(x + u * 0.5, y + u * 0.5, mw - u, mh - u, MID);
      span(r, y + mh * 0.3, x + mw * 0.2, x + mw * 0.8, DARK);
      r.set(x + mw * 0.75, y + mh * 0.7, DARK);
    }
    // the lift: the frame, the floor lamps (the cabin's floor lit), the call button; the doors sliding apart on the cabin
    const lx0 = 0.52 * N, lx1 = 0.74 * N, ly0 = 0.4 * N, lw = lx1 - lx0, half = lw / 2;
    r.rect(lx0 - 0.015 * N, ly0 - 0.015 * N, lw + 0.03 * N, fy - ly0 + 0.015 * N, HOT + DIM);
    r.rect(lx0, 0.335 * N, lw, 0.03 * N, DARK);
    for (let k = 1; k <= 9; k++) r.rect(lx0 + (k - 0.75) * (lw / 9), 0.343 * N, lw / 9 - 0.01 * N, 0.014 * N, k === w.floor ? HOT : DARK + DIM);
    r.rect(lx1 + 0.03 * N, 0.6 * N, 0.025 * N, 0.04 * N, MID);
    r.disc(lx1 + 0.0425 * N, 0.62 * N, mx1(0.006 * N), w.call ? HOT : DARK);
    const op = ease(w.open);
    if (op > 0) { // the cabin: its lit walls, the handrail, the panel of buttons; its light on the landing floor
      r.rect(lx0, ly0, lw, fy - ly0, BRIGHT);
      span(r, ly0 + 0.25 * (fy - ly0), lx0, lx1, LMID);
      r.rect(lx0, ly0 + 0.55 * (fy - ly0), lw, mx1(0.012 * N), LMID);
      for (let k = 0; k < 5; k++) r.set(lx1 - 0.02 * N, ly0 + (0.35 + k * 0.05) * (fy - ly0), DARK);
      poly(r, [[lx0, fy], [lx1, fy], [lx1 + 0.12 * N, N], [lx0 - 0.12 * N, N]], -1, 0.85 * op);
      targets.push({ x: lx0, y: ly0, w: lw, h: fy - ly0 });
    }
    for (const k of ONE) { const x0 = k < 0 ? lx0 - op * half : lx0 + half + op * half, xa = Math.max(lx0, x0), xb = Math.min(lx1, x0 + half); if (xb > xa) { r.rect(xa, ly0, xb - xa, fy - ly0, MID + DIM); span(r, ly0 + 0.3 * (fy - ly0), xa, xb, DARK + DIM); vcol(r, k < 0 ? xb - 1 : xa, ly0, fy, DARK); } }
    // the stairs going up to the left: the flight's side, the steps' noses, the balusters and the rail
    const nx = (k) => sx0 - k * STEP.x * N, ny = (k) => fy - k * STEP.y * N, pts = [[sx0, fy]];
    for (let k = 0; k < 11; k++) { pts.push([nx(k), ny(k + 1)]); pts.push([nx(k + 1), ny(k + 1)]); }
    pts.push([nx(11), ny(11) + 0.09 * N], [sx0 - 0.02 * N, fy + 0.01 * N]);
    poly(r, pts, MID + DIM);
    for (let k = 0; k < 11; k++) { span(r, ny(k + 1), nx(k + 1), nx(k), LMID); if (k % 2 === 0) vcol(r, nx(k) - STEP.x * N * 0.5, ny(k + 1) - 0.12 * N, ny(k + 1), DARK); }
    strk(r, nx(0) + STEP.x * N * 0.5, ny(1) - 0.12 * N, nx(11), ny(11) - 0.12 * N, mx1(1.2 * u), HOT + DIM);
    // the bulb on its flex; its shadow of the figure on the wall, bigger by the bulb's distance over the gap between
    const bx0 = 0.44 * N, bl = 0.13 * N, bx = bx0 + Math.sin(w.bulb.a) * bl, by = Math.cos(w.bulb.a) * bl + 0.05 * N;
    const fh = 0.36 * N, fx = nx(3.5), seat = ny(4), feet = ny(1), hand = [fx + 0.2 * fh, seat - 0.12 * fh], nod = op > 0.5 ? 0 : 0.4 + 0.3 * f.beat.pulse;
    const pose = (k) => ({ sit: true, seat: by + (seat - by) * k, feet: by + (feet - by) * k, dir: 1, lean: 0.45, nod, hand: [bx + (hand[0] - bx) * k, by + (hand[1] - by) * k] });
    if (lit) { // the shadow darkens what it falls on a step (the whitewash to the oil's shade, the oil darker still)
      const kS = 1.5 / (1.5 - 0.3);
      if (!w.under || w.under.length !== N * N) w.under = new Uint8Array(N * N);
      w.under.set(buf);
      hood(r, bx + (fx - bx) * kS, 0, fh * kS, WHITE, pose(kS));
      for (let i = 0; i < N * N; i++) if (buf[i] === WHITE) buf[i] = SHADE[w.under[i]];
    }
    const J = hood(r, fx, 0, fh, FIG, pose(1));
    targets.push({ x: fx - 0.15 * fh, y: J.top, w: 0.45 * fh, h: feet - J.top });
    r.line(bx0, 0.05 * N, bx, by, DARK);
    r.rect(bx - 0.008 * N, by - 0.012 * N, 0.016 * N, 0.014 * N, DARK);
    r.disc(bx, by + 0.012 * N, mx1(0.012 * N), lit ? BRIGHT : LMID + DIM);
    if (lit) {
      glow(r, bx, by + 0.012 * N, (0.05 + 0.03 * f.level) * N, (0.05 + 0.03 * f.level) * N, 0.9);
      for (const m of w.motes) { m.vx = follow(m.vx, (hash(Math.floor(t * 2), m.x * 99) - 0.5) * 0.03 * (1 + f.rel.trebDrive), dt, 0.5); m.vy = follow(m.vy, (hash(Math.floor(t * 2) + 7, m.y * 99) - 0.5) * 0.03, dt, 0.5); m.x = (m.x + m.vx * dt + 1) % 1; m.y = (m.y + m.vy * dt + 1) % 1; const x = bx + (m.x - 0.5) * 0.25 * N, y = by + (m.y - 0.3) * 0.3 * N; if (Math.hypot(x - bx, y - by) < 0.14 * N) r.set(x, y, BRIGHT); }
    }
    else for (let i = 0; i < N * N; i++) { const c = buf[i]; if (c < DIM && c !== HOT && c !== BRIGHT) buf[i] = c + DIM; }
  },
};

// ---------------------------------------------------------------------------------------------- snowfield
// An endless field under the power lines, the camera keeping pace with the lone figure as it wades through deep snow
// (the legs lost below the snow's surface, a step every other beat, the planted foot keeping still on the ground); the
// prints it leaves behind fill with the falling and drifting snow and fade. The near line's wooden poles go by with their
// three wires sagging in catenaries (each wire at its own depth), birds along the nearest, lifting off on the hats and
// gliding back down onto it; a snare shakes the snow off the wires and they spring up, lightened, and bounce. A far line
// of lattice towers, a treeline, a town's glow, all passing at their own depth's pace, the falling snow too; on a
// section a train crosses far off along the horizon, a string of lit windows. The kind is the night: calm, the snow
// drifting low along the surface in the wind, a clear frost with stars and the moon. A drop is a blizzard: the far world
// goes white, the snow drives into the figure's face and it leans into it.
const FIELD_W = { calm: [3, 2, 1], drift: [1, 2, 3], clear: [2, 2, 1] };
const WIRES = [13.4, 14, 14.6];
// the field's snow, the drifts' ripples passing at each row's depth
function fieldSnow(r, C, camX, snow) {
  const N = r.N, buf = r.buf;
  for (let y = Math.round(C.hor) + 1; y < N; y++) {
    const z = ((C.Hc - snow) * C.F) / (y + 0.5 - C.hor);
    span(r, y, 0, N, z > 40 ? LMID + DIM : LMID);
    if (y % 3 === 0) for (let x = 0; x < N; x++) if (hash(Math.floor((camX + ((x + 0.5 - C.cx) * z) / C.F) * 5), y) < 0.03) buf[y * N + x] = MID + DIM;
  }
}
// the blizzard whiting the far world out, the more the farther (rows down to ss)
function whiteout(r, C, snow, ss, storm) {
  const N = r.N, buf = r.buf, hy = Math.round(C.hor);
  for (let y = 0; y < Math.min(N, ss); y++) {
    const z = y > hy ? ((C.Hc - snow) * C.F) / (y + 0.5 - C.hor) : 1e3, q = storm * clamp(0.75 * (1 - 14 / z));
    if (q > 0.02) for (let x = 0, i = y * N; x < N; x++, i++) if (BAYER[((y & 7) << 3) | (x & 7)] < q) buf[i] = LMID;
  }
}
const snowfield = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, FIELD_W, bandOf(W.a)), x: rnd() * 500, ph: 0, prints: [], land: 0, bt0: null, flakes: [], drift: [], storm: 0, gust: 0, sag: { x: 0, v: 0 }, shed: [], train: null,
      birds: Array.from({ length: 7 }, (_, i) => ({ X: (i - 3) * 2.2 + rnd() * 1.2, fly: 0, Y: 0, vX: 0, vY: 0, ph: rnd() * TAU, tX: 0 })) });
    for (const b of w.birds) b.X += w.x;
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a);
    if (f.section === 'change') { w.kind = rollW(rnd, FIELD_W, band); if (!w.train) w.train = { X: w.x + 0.6 - 455, v: 24 }; }
    if (f.section === 'drop') w.storm = 1;
    const K = w.kind, ZF = 6.5, snow = 0.4;
    let shake = false;
    for (const h of hits) {
      if (h.kind === 'hat') { const b = pick(rnd, w.birds); if (!b.fly) { b.fly = 1e-3; b.vY = 2 + rnd(); b.vX = (rnd() - 0.5) * 3; b.tX = b.X + (rnd() - 0.3) * 5; } }
      else if (isLow(h)) w.gust = Math.min(1.5, w.gust + 0.6 * h.strength);
      if (isTonal(h) && h.kind !== 'hat') w.vill = { k: h.pc % 8, c: TONE[h.pc % 3], t: 5 };
      if (h.kind === 'snare') { w.sag.v -= 1.2; shake = true; } // the snow off, the wires spring up and bounce
    }
    w.gust *= Math.exp(-dt); w.storm = Math.max(0, w.storm - dt / 22);
    spring(w.sag, dt, 18, 1.6);
    const storm = clamp(w.storm * 3), lean = 0.08 + 0.3 * storm + 0.1 * w.gust;
    // the walk: a step every other beat (its length the gait's), slower into the blizzard; the camera keeps pace
    const bt = beatT(w, f, dt);
    if (w.bt0 === null || bt < w.bt0) w.bt0 = bt;
    const db = Math.min(1.5, bt - w.bt0) * 0.5 * (1 - 0.4 * storm), fh = 1.75, step = Math.PI * 0.1 * fh * db;
    w.bt0 = bt;
    w.ph += Math.PI * db;
    w.x += step;
    const camX = w.x + 0.6, vCam = step / Math.max(dt, 1e-3), C = cam(0.5 * N, 0.5 * N, 0.75 * N, 1.7), hy = Math.round(C.hor), SX = (X, z) => C.cx + ((X - camX) * C.F) / z;
    // the planted foot: a new print where each foot comes down, a step ahead of the hips
    const land = Math.floor((w.ph - Math.PI / 2) / Math.PI);
    if (land !== w.land) { w.land = land; w.prints.push({ X: w.x + 0.157 * fh, z: ZF + (land % 2 ? 0.12 : -0.12), age: 0 }); }
    // the sky: the town's glow low down, or a clear frost with stars and the moon
    skyGlow(r, 0.15 * N, hy, K === 'clear' ? 0.25 : 0.42);
    if (K === 'clear') { for (let k = 0; k < 50; k++) if (hash(k, Math.floor(t * 2)) > 0.1) r.set(hash(k, 1) * N, hash(k, 2) * 0.42 * N, k % 7 ? LMID : BRIGHT); r.disc(0.78 * N, 0.16 * N, 0.025 * N, BRIGHT); }
    // the treeline far off and the town's lights, the far line of lattice towers
    treeline(r, C, camX, 450, 6, 8, 10, hy + 1, DARK);
    for (let k = 0; k < 8; k++) { const X = Math.floor(camX / 400) * 400 + (k - 2) * 160 + 60 * hash(k, Math.floor(camX / 400)); r.set(SX(X, 900), hy - 1, w.vill && w.vill.k === k ? w.vill.c : k % 3 ? BRIGHT + DIM : HOT + DIM); }
    if (w.vill && (w.vill.t -= dt) <= 0) w.vill = null;
    { const zt = 70, sp = 130, st = C.F / zt; let prev = null;
      for (let k = Math.floor((camX - 80) / sp), ke = k + 3; k <= ke; k++) {
        const x = SX(k * sp, zt), yt = sy(C, 30, zt), yg = sy(C, snow, zt);
        r.line(x - 3 * st, yg, x - 0.6 * st, yt, DARK); r.line(x + 3 * st, yg, x + 0.6 * st, yt, DARK);
        span(r, sy(C, 26, zt), x - 6 * st, x + 6 * st, DARK);
        if (prev !== null) for (let k2 = -6; k2 <= 6; k2 += 6) wire(r, prev + k2 * st, sy(C, 25.5, zt), x + k2 * st, sy(C, 25.5, zt), aSag(sp * st, 4 * st), DARK);
        for (let j = 0; j < 5; j++) { const y0 = lerp(yg, yt, j / 5), y1 = lerp(yg, yt, (j + 1) / 5), w0 = lerp(3, 0.6, j / 5) * st, w1 = lerp(3, 0.6, (j + 1) / 5) * st; r.line(x - w0, y0, x + w1, y1, DARK); }
        prev = x;
      } }
    // the distant train on a section: a dark string with lit windows along the horizon, its headlight ahead, at its own
    // speed over the ground
    if (w.train) {
      const T = w.train, zt = 700;
      T.X += T.v * dt;
      for (let c = 0; c < 8; c++) { const x = SX(T.X - c * 26, zt); span(r, sy(C, 1.2, zt), x - (24 * C.F) / zt, x, DARK); for (let k = 0; k < 6; k++) r.set(x - ((3 + k * 3.6) * C.F) / zt, sy(C, 2.3, zt), BRIGHT); }
      const hx = SX(T.X + 1, zt);
      r.set(hx, sy(C, 1.5, zt), WHITE);
      span(r, sy(C, 1, zt), hx, hx + 0.03 * N, BRIGHT + DIM);
      if (T.X - camX > 520) w.train = null;
    }
    fieldSnow(r, C, camX, snow);
    // the prints filling in with the snow that falls and the snow that drifts (none on a clear, still night), the near
    // line's poles and wires, the birds on the wire
    const fillT = (K === 'clear' ? 0 : K === 'drift' || storm > 0 ? 1 / 9 : 1 / 26) * (1 + 2 * storm) + (w.gust > 0.6 ? 1 / 9 : 0);
    for (const p of w.prints) { p.age += dt * fillT; const k = 1 - p.age, x = SX(p.X, p.z), y = sy(C, snow, p.z), rx = (0.14 * C.F) / p.z; for (let xx = Math.round(x - rx); xx < x + rx; xx++) if (bay(xx, y) < k) r.set(xx, y, MID); }
    prune(w.prints, (p) => p.age < 1 && SX(p.X, p.z) > -0.05 * N);
    const zw = 13.4, sp = 45, Yw = 9.2, sag = 1.1 + 0.25 * w.sag.x, cats = [];
    for (let k = Math.floor((camX - 40) / sp), ke = k + 2; k <= ke; k++) {
      const Xp = k * sp, zp = 14;
      vcol(r, SX(Xp, zp), sy(C, 9.8, zp), sy(C, snow, zp), DARK);
      r.line(SX(Xp, 13.2), sy(C, Yw + 0.2, 13.2), SX(Xp, 14.8), sy(C, Yw + 0.2, 14.8), DARK);
      for (const zz of WIRES) {
        const x0 = SX(Xp, zz), x1 = SX(Xp + sp, zz), y0 = sy(C, Yw, zz), c = wire(r, x0, y0, x1, y0, aSag((sp * C.F) / zz, (sag * C.F) / zz), DARK);
        r.disc(x0, y0, mx1(0.06 * (C.F / zz)), LMID);
        if (zz === zw) cats.push(x0, x1, c);
      }
    }
    const wireY = (x) => { for (let i = 0; i < cats.length; i += 3) if (x >= cats[i] && x <= cats[i + 1]) return catY(cats[i + 2], x); return sy(C, Yw, zw); };
    const m = C.F / zw, s = 0.28 * m;
    for (const b of w.birds) {
      if (b.X < camX - 12) { b.X += 24; b.tX += 24; } else if (b.X > camX + 12) { b.X -= 24; b.tX -= 24; }
      if (b.fly) { // up off the wire, round, and gliding back down onto it at a new place (Y its height over the wire)
        b.ph += dt * 16; b.fly += dt;
        const back = b.fly > 2.2;
        if (back) { b.vX = follow(b.vX, (b.tX - b.X) * 2, dt, 0.3); b.vY = follow(b.vY, -b.Y * 2, dt, 0.3); }
        b.X += b.vX * dt; b.Y += b.vY * dt;
        if (back && b.Y < 0) { b.Y = 0; b.vY = 0; } // onto the wire, not through it
        if (back && Math.abs(b.tX - b.X) < 0.05 && b.Y < 0.03) { b.fly = 0; b.Y = 0; b.X = b.tX; }
      }
      const x = SX(b.X, zw);
      if (b.fly) crow(r, x, wireY(x) - b.Y * m - 0.3 * s, s, BLACK, true, b.ph, b.vX >= 0 ? 1 : -1); // the body where it sits when perched
      else crow(r, x, wireY(x), s, BLACK, false, 0, 1);
    }
    if (shake) for (let k = 0; k < 10; k++) { const X = w.x + (rnd() - 0.4) * 8; w.shed.push({ X, Y: C.Hc - ((wireY(SX(X, zw)) - C.hor) * zw) / C.F, vY: 0, z: zw }); } // off the wire where it hangs
    prune(w.shed, (p) => { p.vY = Math.max(-2.5, p.vY - G * dt); p.Y += p.vY * dt; r.set(SX(p.X, p.z), sy(C, p.Y, p.z), LMID); return p.Y > snow; });
    // the figure wading: the legs lost below the snow's surface (it covers them on the figure's own row)
    const fs = C.F / ZF, fx = SX(w.x, ZF), fb = sy(C, 0, ZF), J = hood(r, fx, fb, fh * fs, FIG, { dir: 1, walk: true, ph: w.ph, lift: 0.09, lean, nod: 0.25 });
    const ss = Math.round(sy(C, snow, ZF));
    r.rect(fx - 0.35 * fs, ss, 0.7 * fs, fb - ss + 1, LMID);
    span(r, ss, fx - 0.3 * fs, fx + 0.3 * fs, MID);
    span(r, ss, fx - 1.6 * fs, fx - 0.3 * fs, MID + DIM);
    targets.push({ x: fx - 0.2 * fh * fs, y: J.top, w: 0.4 * fh * fs, h: ss - J.top });
    // the snow: falling, drifting low along the surface in the wind, driving in the blizzard, all of it going by against
    // the camera's walk at its depth's pace (d 1 is 3 m off); the far world whiting out
    const wind = -(K === 'drift' ? 0.18 : 0.036) - 0.18 * w.gust - 0.75 * storm, pan = (vCam * C.F) / (3 * N);
    snowStep(W, w.flakes, Math.round((K === 'clear' ? 0 : 60 + 200 * storm) * u * (0.7 + 0.5 * f.level)), wind - pan, ((SNOW_V * C.F) / (3 * N)) * (1 + 1.5 * storm), (d) => sy(C, snow, 3 * d));
    snowDraw(r, w.flakes, u, 1, 5);
    if (K === 'drift' || storm > 0 || w.gust > 0.6) {
      while (w.drift.length < 40) w.drift.push({ x: rnd() * N, z: 3 + rnd() * 25 });
      for (const p of w.drift) { p.x += (((wind * 5 - vCam) * C.F) / p.z) * dt; if (p.x < 0) { p.x += N; p.z = 3 + rnd() * 25; } span(r, sy(C, snow + 0.1, p.z), p.x, p.x + (0.8 * C.F) / p.z, LMID); }
    }
    if (storm > 0) whiteout(r, C, snow, ss, storm);
  },
};

// ---------------------------------------------------------------------------------------------- tramstop
// A tram stop at night in the snow, across the street: the platform with its lamp and plate, the figure waiting on it;
// the rails shining under the lamps, the contact wire on its span wires overhead. An old rounded tram comes in and
// brakes to a stop (a steady deceleration, its wheels turning as v / r), its doors fold open and the warm light falls
// out across the platform; the figure walks to the door, steps up and in, and sits at a window. While it stands the
// pantograph arcs on the icy wire on every beat (a flash, sparks falling under gravity), the wire lifted a little where
// the pantograph presses it. A kick on the ice makes a big blue flash, a snare flickers the stop's lamp, a note warms
// or cools the light inside. The kind is the night: snow, ice on the wire, fog. A drop: the doors close and the tram
// pulls away, and the stop stands empty in the snow, until someone else walks up to wait for the next.
const TRAM_W = { snow: [3, 2, 1], ice: [1, 2, 3], fog: [2, 2, 1] };
const TRAMSTOP = -6.4, TLEN = 14, LMPS = [-14, 0, 14], SHINE = [-14, 0, 14, 2], TRAILS = [8.25, 9.75], TWIN = [0.35, 3.3, 4.9, 8.3, 9.9, 13.1], TDOORS = [1.8, 6.8, 11.8];
const tramstop = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, TRAM_W, bandOf(W.a)), st: 'in', X: 26, v: 8, door: 0, rot: 0, tT: 0, leave: false, fig: { X: 1.0, z: 6.4, Y: 0.2, ph: 0, on: true, in: false, dir: -1 }, sparks: [], flash: 0, big: 0, flick: 0, warm: 0, flakes: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), buf = r.buf;
    const C = cam(0.5 * N, 0.52 * N, 0.7 * N, 1.6), hy = Math.round(C.hor), F = w.fig, ZT = 8.2, ZW = 9, YW = 5.6;
    if (f.section === 'change') { w.kind = rollW(rnd, TRAM_W, band); if (w.st === 'wait') { w.st = 'in'; w.X = 26; w.v = 8; } }
    if (f.section === 'drop') { if (w.st === 'dwell') { w.st = 'shut'; } else if (['in', 'open', 'board', 'wait'].includes(w.st)) { w.leave = true; if (w.st === 'wait') { w.st = 'in'; w.X = 26; w.v = 8; } } }
    const K = w.kind;
    for (const h of hits) {
      if (isLow(h) && (K === 'ice' || h.strength > 0.85)) w.big = 0.12;
      else if (h.kind === 'snare') w.flick = 0.05 + 0.08 * h.strength;
      if (isTonal(h)) w.warm = h.pc % 2 ? 1 : -1;
    }
    w.flick -= dt; w.big -= dt; w.flash -= dt; w.tT += dt;
    // the tram's run: in, braking to the stop at a steady deceleration; the doors; out, accelerating away
    if (w.st === 'in') { const d = w.X - TRAMSTOP; if (d < (w.v * w.v) / 2.2) { const k = brake(w.v, d, dt); w.v = k[0]; w.X -= k[1]; } else w.X -= w.v * dt; if (w.v <= 0 || w.X <= TRAMSTOP) { w.X = TRAMSTOP; w.v = 0; w.st = 'open'; w.tT = 0; } }
    else if (w.st === 'open') { w.door = Math.min(1, w.door + dt / 0.7); if (w.door >= 1) { w.st = F.on && !F.in ? 'board' : 'dwell'; w.tT = 0; } }
    else if (w.st === 'board') { if (F.in) { w.st = w.leave ? 'shut' : 'dwell'; w.tT = 0; } }
    else if (w.st === 'dwell') { if (w.tT > 40) w.st = 'shut'; }
    else if (w.st === 'shut') { w.door = Math.max(0, w.door - dt / 0.6); if (w.door <= 0) { w.st = 'out'; w.tT = 0; } }
    else if (w.st === 'out') { w.v += 1.2 * dt; w.X -= w.v * dt; if (w.X + TLEN < -25) { w.st = 'empty'; w.tT = 0; w.leave = false; F.on = false; F.in = false; } }
    else if (w.st === 'empty') { if (w.tT > 8) { w.st = 'come'; Object.assign(F, { on: true, in: false, X: 9, z: 6.4, Y: 0.2, dir: -1 }); } }
    else if (w.st === 'come') { const st = Math.min(F.X - 1.0, 1.2 * dt); F.X -= st; F.ph += st / (0.1 * 1.75); if (F.X <= 1.0) w.st = 'wait'; }
    else if (w.st === 'wait' && w.tT > 20) { w.st = 'in'; w.X = 26; w.v = 8; }
    w.rot -= (w.v * dt) / 0.33; // the wheels: omega = v / r; it only ever rolls left, so they turn anticlockwise
    const here = w.st !== 'wait' && w.st !== 'empty' && w.st !== 'come', Xp = w.X + 5;
    // the figure boarding: across to the middle door, up its step, and in to a seat by the window
    if (w.st === 'board' && !F.in) {
      const dX = w.X + 7.4 - F.X, dz = ZT + 0.3 - F.z, d = Math.hypot(dX, dz), st = Math.min(d, 1.1 * dt);
      F.X += (dX / (d || 1)) * st; F.z += (dz / (d || 1)) * st; F.ph += st / (0.1 * 1.75);
      if (F.z > ZT - 0.6) F.Y = 0.2 + 0.25 * clamp((F.z - (ZT - 0.6)) / 0.6);
      if (d < 0.05) F.in = true;
    }
    // the sky, the old houses across the street with their windows (faded in the fog)
    skyGlow(r, 0.1 * N, hy, K === 'fog' ? 1 : 0.42);
    const s40 = C.F / 40;
    r.rect(0, sy(C, 16, 40), N, sy(C, 0, 40) - sy(C, 16, 40), K === 'fog' ? MID + DIM : DARK);
    for (let k = 0; k < 5; k++) for (let j = -12; j < 13; j++) if (hash(j + 9, k) < 0.3) r.rect(sx(C, j * 3, 40), sy(C, 2.4 + 3 * k, 40), 1.3 * s40, 1.6 * s40, K === 'fog' ? LMID + DIM : LIFE[Math.floor(hash(k, j) * 4)]);
    // the street: packed snow, the rails (shining under the lamps), the far pavement's lamps and their pools
    for (let y = hy; y < N; y++) span(r, y, 0, N, MID + DIM);
    for (let y = Math.round(sy(C, 0, 14)); y > hy; y--) span(r, y, 0, N, LMID + DIM);
    for (const X of LMPS) { vcol(r, sx(C, X, 14), sy(C, 5.5, 14), sy(C, 0, 14), DARK); r.rect(sx(C, X, 14) - 0.4 * (C.F / 14), sy(C, 5.6, 14), 0.8 * (C.F / 14), mx1(0.2 * (C.F / 14)), BRIGHT); groundPool(r, C, X, 12, 4.5, 0.7); }
    for (const zr of TRAILS) {
      const y = sy(C, 0, zr);
      span(r, y, 0, N, DARK);
      for (const X of SHINE) span(r, y, sx(C, X - 2.5, zr), sx(C, X + 2.5, zr), BRIGHT);
    }
    // the contact wire: a shallow catenary between its span wires, lifted where the pantograph presses it
    // (held up at its span wires, 15 m each side, sagging between them)
    const wireH = (X) => { const ph = (((X + 15) % 30) + 30) % 30 - 15; return YW - 0.15 * (1 - (ph / 15) ** 2) + (here ? 0.1 * Math.exp(-(((X - Xp) / 2.5) ** 2)) : 0); };
    for (let x = 0; x < N; x++) r.set(x, sy(C, wireH(((x + 0.5 - C.cx) * ZW) / C.F), ZW), MID);
    for (const k of ONE) { const X = 15 * k; r.line(sx(C, X, 13), sy(C, 6.6, 13), sx(C, X, ZW), sy(C, YW, ZW), DARK); vcol(r, sx(C, X, 13), sy(C, 7, 13), sy(C, 0, 13), DARK); }
    // the tram: the body with its round ends, the lit windows (the figure at one once it is in), the doors folding open,
    // the light falling out of them on the platform, the wheels under it, the pantograph up to the wire
    const inside = w.warm < 0 ? COOL : BRIGHT;
    if (here) {
      const x0 = sx(C, w.X, ZT), x1 = sx(C, w.X + TLEN, ZT), yT = sy(C, 3.3, ZT), yB = sy(C, 0.4, ZT), sT = C.F / ZT, rr = 1.0 * sT;
      r.rect(x0 + rr, yT, x1 - x0 - 2 * rr, yB - yT, MID);
      for (const k of ONE) ell(r, k < 0 ? x0 + rr : x1 - rr, (yT + yB) / 2, rr, (yB - yT) / 2, MID);
      r.rect(x0 + rr * 0.3, sy(C, 1.1, ZT), x1 - x0 - rr * 0.6, sy(C, 0.4, ZT) - sy(C, 1.1, ZT), DARK);
      for (const o of TWIN) {
        const X = w.X + o, ww = o > 13 || o < 1 ? 0.6 : 1.2;
        r.rect(sx(C, X, ZT), sy(C, 2.9, ZT), ww * sT, 1.3 * sT, inside);
        if (F.in && o === 4.9) { r.disc(sx(C, X + 0.6, ZT), sy(C, 2.15, ZT), 0.26 * sT, FIG); r.rect(sx(C, X + 0.25, ZT), sy(C, 1.95, ZT), 0.7 * sT, 0.35 * sT, FIG); }
        else span(r, sy(C, 1.9, ZT), sx(C, X, ZT), sx(C, X + 1.2, ZT), MID + DIM);
      }
      r.rect(x0 + rr * 0.5, sy(C, 3.55, ZT), 2 * sT, 0.25 * sT, LMID + DIM);
      for (const d of TDOORS) {
        const a = sx(C, w.X + d, ZT), b = sx(C, w.X + d + 1.2, ZT), y0 = sy(C, 2.6, ZT), half = (b - a) / 2, fold = half * (1 - 0.75 * w.door);
        if (w.door > 0) r.rect(a, y0, b - a, yB - y0, inside);
        r.rect(a, y0, fold, yB - y0, DARK); r.rect(b - fold, y0, fold, yB - y0, DARK);
      }
      for (let bg = 0; bg < 2; bg++) for (const k of ONE) { const wx = sx(C, w.X + (bg ? 11 : 3) + 0.9 * k, ZT), wy = sy(C, 0.33, ZT); r.disc(wx, wy, 0.33 * sT, DARK); r.line(wx, wy, wx + Math.cos(w.rot) * 0.3 * sT, wy + Math.sin(w.rot) * 0.3 * sT, MID); }
      r.disc(x0 + rr * 0.45, sy(C, 0.95, ZT), mx1(0.13 * sT), BRIGHT);
      const pb = sy(C, 3.3, ZT), pt = sy(C, wireH(Xp), ZW), pxs = sx(C, Xp, ZW); // the head up against the wire where it is
      r.line(sx(C, Xp - 0.6, ZT), pb, pxs, (pb + pt) / 2, LMID); r.line(pxs, (pb + pt) / 2, sx(C, Xp + 0.3, ZW), pt, LMID);
      span(r, pt, pxs - 0.5 * sT, pxs + 0.5 * sT, LMID);
      // the arc on the beat: a flash where the pan meets the wire and a few sparks falling off it
      if (tick(w, f, dt) && w.st !== 'out') { w.flash = 0.08; spray(w.sparks, rnd, pxs, pt, K === 'ice' ? 7 : 4, (3 * C.F) / ZW, 0, Math.PI, 0.6); }
      if (w.flash > 0 || w.big > 0) { glow(r, pxs, pt, (w.big > 0 ? 0.3 : 0.08) * N, (w.big > 0 ? 0.25 : 0.06) * N, 1); r.rect(pxs - u, pt - 2.5 * u, mx1(2 * u), mx1(5 * u), WHITE); r.rect(pxs - 2.5 * u, pt - u, mx1(5 * u), mx1(2 * u), COOL); if (w.big > 0) s.shake = Math.max(s.shake, 0.1); }
      targets.push({ x: x0, y: yT, w: x1 - x0, h: yB - yT });
    }
    // the sparks fall at the wire's depth onto the roof (hidden there behind the side's top edge), or to the street
    sparks(W, w.sparks, G * (C.F / ZW), sy(C, here ? 3.3 : 0, ZW), here ? sy(C, 3.3, ZT) : Infinity);
    // the platform: its snow, the kerb, the stop's lamp and plate on their pole, the lamp's pool
    const pa = sy(C, 0.2, 7.5), pb2 = sy(C, 0.2, 5.5);
    slab(r, C, -9, 0.2, 9, 0.2, 7.5, 5.5, LMID);
    r.rect(0, pb2, N, sy(C, 0, 5.5) - pb2, MID);
    span(r, pa, sx(C, -9, 7.5), sx(C, 9, 7.5), MID);
    if (here && w.door > 0) for (const d of TDOORS) poly(r, [P3(C, w.X + d, 0.2, ZT - 0.2), P3(C, w.X + d + 1.2, 0.2, ZT - 0.2), P3(C, w.X + d + 1.2 + 1.5, 0.2, 5.3), P3(C, w.X + d - 1.5, 0.2, 5.3)], -1, 0.75 * w.door); // the light out of the open doors, on the platform in front
    if (w.flick <= 0) groundPool(r, C, 2.4, 6.5, 3, 0.8);
    const lx = sx(C, 2.4, 6.3), s6 = C.F / 6.3;
    vcol(r, lx, sy(C, 4.6, 6.3), sy(C, 0.2, 6.3), DARK);
    r.rect(lx - 0.5 * s6, sy(C, 4.7, 6.3), 0.6 * s6, 0.15 * s6, DARK);
    r.disc(lx - 0.45 * s6, sy(C, 4.5, 6.3), mx1(0.1 * s6), w.flick > 0 ? LMID + DIM : BRIGHT);
    r.rect(lx + u, sy(C, 3.4, 6.3), 0.45 * s6, 0.45 * s6, COOL + DIM);
    r.frame(Math.round(lx + u), Math.round(sy(C, 3.4, 6.3)), Math.round(0.45 * s6), Math.round(0.45 * s6), LMID);
    // the figure: waiting, walking up to the door and in, or a new one walking along the platform to wait
    if (F.on && !F.in) {
      const fs = C.F / F.z, fh = 1.75 * fs, fx = sx(C, F.X, F.z), fb = sy(C, F.Y, F.z);
      const J = w.st === 'board' ? hoodBack(r, fx, fb, fh, FIG, { walk: true, ph: F.ph, nod: 0.2 }) : w.st === 'come' ? hood(r, fx, fb, fh, FIG, { dir: -1, walk: true, ph: F.ph }) : hoodBack(r, fx, fb, fh, FIG, { nod: here ? 0.1 : 0.4 });
      targets.push({ x: fx - 0.2 * fh, y: J.top, w: 0.4 * fh, h: fb - J.top });
    }
    // the snow (bright in the lamps), thicker in the fog's stillness
    snowStep(W, w.flakes, Math.round((K === 'fog' ? 40 : 80) * u * (0.7 + 0.5 * f.level)), 0.03, (SNOW_V * C.F) / (2.5 * N), (d) => sy(C, 0, 2.5 * d));
    snowDraw(r, w.flakes, u, 1, 5, (x, y) => w.flick <= 0 && Math.abs(x - lx) < (y - sy(C, 4.5, 6.3)) * 0.6 && y > sy(C, 4.5, 6.3) && y < pb2);
  },
};

// ---------------------------------------------------------------------------------------------- playground
// A courtyard playground at night, the swings seen three-quarter on: the near one empty, a pendulum on its rods about
// the bar, pushed by the wind and pumped by the kicks (each push along the way it is already going), swinging toward
// and away from us as well as across; on the far one the figure sits, the feet dragging in the snow, rocking a little on
// the beat. A rusty climbing dome with snow on its bars (a snare shakes some off), the block above with one lit window
// (a note: someone crosses it), the yard's lamp and its pool, snow, the groove the feet have scraped under the swing.
// The kind is the night: still, gusty, a clear frost with stars and breath on the air. A drop: the wind dies, the swing
// settles under its own damping, and the snow comes down thick and straight.
const PLAY_W = { still: [3, 2, 1], gusty: [1, 2, 3], frost: [2, 2, 1] };
const BAR0 = [-1.3, 2.5, 5.0], BAR1 = [1.5, 2.5, 6.7];
const playground = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, PLAY_W, bandOf(W.a)), s1: { a: 0.3, v: 0 }, s2: { a: 0, v: 0 }, calm: 0, wind: 0, flakes: [], fall: [], passer: -1, breath: [], odd: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), buf = r.buf;
    if (f.section === 'change') { w.kind = rollW(rnd, PLAY_W, band); w.calm = 0; }
    if (f.section === 'drop') w.calm = 24;
    const K = w.kind, calm = w.calm > 0, C = cam(0.52 * N, 0.6 * N, 0.8 * N, 1.4), hy = Math.round(C.hor);
    w.calm -= dt;
    // the swing's own way to go: across the bar, level; the bar's way; pivots along it
    const bl = Math.hypot(BAR1[0] - BAR0[0], BAR1[2] - BAR0[2]), bX = (BAR1[0] - BAR0[0]) / bl, bZ = (BAR1[2] - BAR0[2]) / bl, sX = -bZ, sZ = bX, L = 1.9;
    const onBar = (q) => [lerp(BAR0[0], BAR1[0], q), 2.5, lerp(BAR0[2], BAR1[2], q)];
    w.wind = follow(w.wind, calm ? 0 : (K === 'gusty' ? 0.9 : K === 'frost' ? 0.05 : 0.35) * (0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.23)) + 0.4 * f.rel.bassDrive, dt, 0.8);
    for (const h of hits) {
      if (isLow(h) && !calm) w.s1.v += Math.sign(w.s1.v || 1) * 0.35 * h.strength;
      else if (h.kind === 'snare') for (let k = 0; k < 6; k++) w.fall.push({ a: (Math.floor(rnd() * 6) * Math.PI) / 6, b: 0.93 + rnd() * 1.28, Y: 0, vY: 0 }); // off a bar's snowy top
      if (isTonal(h) && w.passer < 0) w.passer = 0;
    }
    swing(w.s1, dt, L, calm ? 0.55 : 0.12, -(w.wind * sX * 0.9) / L); // the wind blows toward -X, as it takes the snow
    const beat = tick(w, f, dt);
    if (beat) { w.s2.v += calm ? 0 : 0.12; w.odd = 1 - w.odd; }
    swing(w.s2, dt, L, 1.6);
    // the sky (stars on a frost), the block above with its one lit window and the one who crosses it
    skyGlow(r, 0.12 * N, hy, K === 'frost' ? 0.25 : 0.42);
    if (K === 'frost') for (let k = 0; k < 40; k++) if (hash(k, Math.floor(t * 2)) > 0.12) r.set(hash(k, 1) * N, hash(k, 2) * 0.12 * N, LMID);
    const zb = 34, sb = C.F / zb, s80 = C.F / 80;
    r.rect(sx(C, 6, 80), sy(C, 15, 80), N, sy(C, 0, 80) - sy(C, 15, 80), DARK);
    for (let k = 0; k < 5; k++) for (let j = 0; j < 14; j++) if (hash(j, k + 50) < 0.2) r.rect(sx(C, 7 + j * 3.1, 80), sy(C, 2.4 + 2.8 * k, 80), 1.4 * s80, 1.5 * s80, BRIGHT + DIM);
    r.rect(0, sy(C, 25.8, zb), sx(C, -3.5, zb), sy(C, 0, zb) - sy(C, 25.8, zb), DARK);
    for (let k = 0; k < 9; k++) for (let j = -9; j < -1; j++) r.rect(sx(C, j * 3.1, zb), sy(C, 2.4 + 2.8 * k, zb), 1.4 * sb, 1.5 * sb, j === -3 && k === 6 ? BRIGHT : DARK + DIM);
    if (w.passer >= 0) { // someone crossing the lit window: their shadow on the curtain
      const wx = sx(C, -3 * 3.1, zb), wy = sy(C, 2.4 + 2.8 * 6, zb), q = w.passer / 2.5;
      w.passer += dt;
      if (q < 1) { const px = wx + (q * 1.8 - 0.2) * 1.4 * sb; r.rect(Math.max(wx, px), wy + 0.4 * sb, Math.max(0, Math.min(wx + 1.4 * sb, px + 0.45 * sb) - Math.max(wx, px)), 1.1 * sb, HOT); }
      else w.passer = -1;
    }
    targets.push({ x: sx(C, -3 * 3.1, zb), y: sy(C, 2.4 + 2.8 * 6, zb), w: 1.4 * sb, h: 1.5 * sb });
    // the ground: snow, the lamp's pool, the groove scraped under the empty swing
    for (let y = hy; y < N; y++) span(r, y, 0, N, LMID);
    const lX = 4.2, lZ = 10, lpx = sx(C, lX, lZ), lpy = sy(C, 4.2, lZ);
    groundPool(r, C, lX, lZ, 5.5, 0.8); // under the lamp
    const m1 = onBar(0.25), m2 = onBar(0.75);
    for (let k = -6; k <= 6; k++) { const q = k / 6, X = m1[0] + sX * q * 1.3, z = m1[2] + sZ * q * 1.3, rx = (0.25 * C.F) / z; span(r, sy(C, 0, z), sx(C, X, z) - rx, sx(C, X, z) + rx, MID); }
    vcol(r, lpx, lpy, sy(C, 0, lZ), DARK);
    r.rect(lpx - 0.25 * (C.F / lZ), lpy - 0.15 * (C.F / lZ), 0.5 * (C.F / lZ), 0.15 * (C.F / lZ), BRIGHT);
    // the climbing dome: meridians and rings of rusty bar, snow along their tops
    const dX = -3.8, dZ = 8.5, dR = 1.5;
    for (let m = 0; m < 6; m++) {
      const a = (m / 6) * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
      for (let k = 0, px = 0, py = 0; k <= 10; k++) {
        const b = (k / 10) * Math.PI, cb = Math.cos(b), z = dZ + cb * sa * dR, x = sx(C, dX + cb * ca * dR, z), y = sy(C, Math.sin(b) * dR, z);
        if (k) { r.line(px, py, x, y, k % 3 ? DARK : HOT + DIM); if (Math.sin(b) > 0.8) r.set(x, y - 1, BRIGHT); }
        px = x; py = y;
      }
    }
    for (let j = 0; j < 2; j++) { const hh = j ? 1.0 : 0.5, rad = Math.sqrt(1 - hh * hh) * dR; for (let k = 0, px = 0, py = 0; k <= 16; k++) { const a = (k / 16) * TAU, z = dZ + Math.sin(a) * rad, x = sx(C, dX + Math.cos(a) * rad, z), y = sy(C, hh * dR, z); if (k) r.line(px, py, x, y, DARK); px = x; py = y; } }
    prune(w.fall, (p) => { p.vY -= G * dt; p.Y += p.vY * dt; const Y0 = Math.sin(p.b) * dR + p.Y, cb = Math.cos(p.b), z = dZ + cb * Math.sin(p.a) * dR; r.set(sx(C, dX + cb * Math.cos(p.a) * dR, z), sy(C, Y0, z), BRIGHT); return Y0 > 0; });
    // the swing frame: the bar and its A-frame legs; a swing: two rods from their pivots to the seat's ends
    const leg = (e) => { for (const k of ONE) { const z1 = e[2] + sZ * k * 0.9; strk(r, sx(C, e[0], e[2]), sy(C, 2.5, e[2]), sx(C, e[0] + sX * k * 0.9, z1), sy(C, 0, z1), mx1((0.07 * C.F) / e[2]), MID); } };
    const seatOf = (m, a) => [m[0] + sX * Math.sin(a) * L, 2.5 - Math.cos(a) * L, m[2] + sZ * Math.sin(a) * L];
    const drawSwing = (m, a) => {
      const sc = seatOf(m, a);
      for (const k of ONE) { const zp = m[2] + bZ * k * 0.24, ze = sc[2] + bZ * k * 0.24; r.line(sx(C, m[0] + bX * k * 0.24, zp), sy(C, 2.5, zp), sx(C, sc[0] + bX * k * 0.24, ze), sy(C, sc[1], ze), LMID); }
      const za = sc[2] - bZ * 0.24, zb = sc[2] + bZ * 0.24;
      strk(r, sx(C, sc[0] - bX * 0.24, za), sy(C, sc[1], za), sx(C, sc[0] + bX * 0.24, zb), sy(C, sc[1], zb), mx1((0.08 * C.F) / sc[2]), HOT + DIM);
      return sc;
    };
    leg(BAR1);
    const sc2 = drawSwing(m2, w.s2.a), fz = sc2[2], fs = C.F / fz, fx = sx(C, sc2[0], fz), seat = sy(C, sc2[1], fz);
    const rodY = sy(C, sc2[1] + 0.55, fz), rodX = sx(C, sc2[0] + bX * 0.24, fz);
    const J = hood(r, fx, 0, 1.75 * fs, FIG, { sit: true, seat, feet: sy(C, 0.03, fz - sZ * 0.4), dir: 1, lean: 0.25, nod: 0.5, hand: [rodX, rodY] });
    targets.push({ x: fx - 0.3 * fs, y: J.top, w: 0.8 * fs, h: sy(C, 0, fz) - J.top });
    if (K === 'frost' && w.odd && beat) w.breath.push(puff(J.mx, J.my, 0.03 * N, -0.003 * N, 0.02 * N, 0.5, 1.4, 1.2));
    plume(W, w.breath, 0, LMID, 0.6, 8);
    strk(r, sx(C, BAR0[0], BAR0[2]), sy(C, 2.5, BAR0[2]), sx(C, BAR1[0], BAR1[2]), sy(C, 2.5, BAR1[2]), mx1((0.09 * C.F) / 6), MID);
    const sc1 = drawSwing(m1, w.s1.a);
    targets.push({ x: sx(C, sc1[0], sc1[2]) - 0.3 * (C.F / sc1[2]), y: sy(C, sc1[1] + 0.2, sc1[2]), w: 0.6 * (C.F / sc1[2]), h: 0.4 * (C.F / sc1[2]) });
    leg(BAR0);
    // the snow: still, or thick and straight down once the wind has died
    snowStep(W, w.flakes, Math.round((K === 'frost' ? 0 : calm ? 210 : 70) * u * (0.7 + 0.5 * f.level)), calm ? 0 : -w.wind * 0.19, ((SNOW_V * C.F) / (2.5 * N)) * (calm ? 0.8 : 1), (d) => sy(C, 0, 2.5 * d));
    snowDraw(r, w.flakes, u, 1, 5, (x, y) => Math.abs(x - lpx) < (y - lpy) * 0.7 && y > lpy);
    if (calm) for (const fl of w.flakes) if (fl.d < 1.6) r.rect(fl.x, fl.y, mx1(2.2 * u), mx1(2.2 * u), LMID);
  },
};

// ---------------------------------------------------------------------------------------------- cassette
// A cassette recorder on the windowsill at night, the courtyard through the glass behind it (frost in the corners, the
// blocks, a lamp, snow). Through its window the reels turn at the tape's one speed: omega = v / r on each, the packs'
// radii from the tape wound on either side (their areas add up to the tape's), so the full reel turns slow and the
// empty one quick, and they trade as the tape plays. Two needles on stiff, lightly under-damped springs bounce with the
// lows and the highs (a kick, a snare), the play lamp breathes with the beat; the headphones lie on the sill, their cord
// hanging from the jack in a catenary, the cups buzzing on the kicks. The kind is the weather outside: snow, a hard
// frost, lit windows and a car's lights below. A drop (or the tape's end): a pencil in the hub winds it back by hand,
// the play key up, the needles down, both reels spinning back as the pencil turns.
const TAPE_W = { snow: [3, 2, 1], frost: [2, 2, 1], lights: [1, 2, 3] };
const TWIGS = [0.62, 0.08, 0.66, 0.2, 0.66, 0.11, 0.7, 0.04, 0.64, 0.14, 0.6, 0.09];
// frost creeping in from a corner of the glass at (cx0, cy0), fr across, on the glass above gy1
function frostCorner(r, cx0, cy0, fr, gy1) {
  const N = r.N, buf = r.buf;
  for (let y = Math.max(0, Math.round(cy0 - fr)); y < Math.min(gy1, cy0 + fr); y++) for (let x = Math.max(0, Math.round(cx0 - fr)); x < Math.min(N, cx0 + fr); x++) {
    const e = 1 - Math.sqrt((x - cx0) * (x - cx0) + (y - cy0) * (y - cy0)) / fr;
    if (e > 0 && hash(x >> 1, y >> 1) * 0.6 + bay(x, y) * 0.4 < e * 0.8) buf[y * N + x] = e > 0.45 ? BRIGHT : LMID;
  }
}
const cassette = {
  init(W) {
    const { w, rnd } = W, lit = new Uint8Array(48);
    for (let i = 0; i < 48; i++) if (rnd() < 0.28) lit[i] = pick(rnd, LIFE);
    Object.assign(w, { kind: rollW(rnd, TAPE_W, bandOf(W.a)), lit, frac: 0.15 + 0.5 * rnd(), aS: 0, aT: 0, rew: 0, vu: [{ x: 0, v: 0 }, { x: 0, v: 0 }], kick: 0, snare: 0, flakes: [], car: -1 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), buf = r.buf;
    if (f.section === 'change') w.kind = rollW(rnd, TAPE_W, band);
    if (f.section === 'drop' || w.frac >= 1) w.rew = Math.max(w.rew, 4.5);
    const K = w.kind;
    for (const h of hits) {
      if (isLow(h)) w.kick = Math.max(w.kick, h.strength);
      else if (h.kind === 'snare') w.snare = Math.max(w.snare, h.strength);
      else if (h.kind === 'hat') { const i = Math.floor(rnd() * 48); w.lit[i] = w.lit[i] ? 0 : pick(rnd, LIFE); }
      if (isTonal(h)) w.lit[Math.floor(rnd() * 48)] = [BRIGHT, HOT, COOL][h.pc % 3];
    }
    w.kick *= Math.exp(-dt * 9); w.snare *= Math.exp(-dt * 9);
    if (K === 'lights' && w.car < 0 && rnd() < dt * 0.15) w.car = 0;
    // the tape: the packs' radii from the share wound on each side (areas conserved), the tape's speed from how fast the
    // share moves (the area wound a second is the speed times the tape's thickness); playing, a side a minute;
    // rewinding, the pencil turns the left hub one and a half times a second, the tape going back at that times its radius
    const rh = 0.013 * N, Rf = 0.042 * N, A = Rf * Rf - rh * rh, th = 0.0012 * N; // th: the tape's thickness on the screen
    let rS = Math.sqrt(rh * rh + (1 - w.frac) * A), rT = Math.sqrt(rh * rh + w.frac * A), v;
    if (w.rew > 0) { w.rew -= dt; v = -1.5 * TAU * rS; if (w.frac <= 0.02) w.rew = 0; }
    else v = (Math.PI * A) / (60 * th);
    w.frac = clamp(w.frac + ((v * th) / (Math.PI * A)) * dt);
    rS = Math.sqrt(rh * rh + (1 - w.frac) * A); rT = Math.sqrt(rh * rh + w.frac * A);
    w.aS -= (v / rS) * dt; w.aT -= (v / rT) * dt; // playing, both turn so the tape runs left to right along the bottom
    const play = w.rew <= 0;
    spring(w.vu[0], dt, 260, 20, play ? clamp(0.25 + 0.45 * f.level + 0.5 * w.kick) : 0);
    spring(w.vu[1], dt, 260, 20, play ? clamp(0.2 + 0.45 * f.level + 0.5 * w.snare) : 0);
    // the window: the night, the blocks, the lamp, a car's lights crossing below; snow; frost creeping from the corners
    const gy1 = 0.6 * N;
    skyGlow(r, 0, gy1, 0.42);
    r.rect(0, 0.12 * N, N, 0.42 * N, DARK);
    for (let k = 0; k < 6; k++) for (let j = 0; j < 8; j++) { const c = w.lit[k * 8 + j]; r.rect((0.04 + j * 0.12) * N, (0.15 + k * 0.065) * N, 0.045 * N, 0.035 * N, c || DARK + DIM); }
    r.rect(0, 0.54 * N, N, gy1 - 0.54 * N, LMID + DIM);
    vcol(r, 0.82 * N, 0.4 * N, 0.56 * N, DARK); r.rect(0.8 * N, 0.395 * N, 0.04 * N, 0.008 * N, BRIGHT);
    glow(r, 0.82 * N, 0.55 * N, 0.08 * N, 0.025 * N, 0.8);
    if (w.car >= 0) { w.car += dt * 0.25; const cx = (w.car * 1.4 - 0.2) * N; glow(r, cx + 0.06 * N, 0.565 * N, 0.08 * N, 0.015 * N, 0.9); r.rect(cx, 0.55 * N, 0.07 * N, 0.025 * N, DARK); r.set(cx + 0.07 * N, 0.56 * N, BRIGHT); if (w.car > 1) w.car = -1; }
    for (let k = 0; k < 12; k += 4) r.line(TWIGS[k] * N, TWIGS[k + 1] * N, TWIGS[k + 2] * N, TWIGS[k + 3] * N, DARK + DIM); // a birch's twigs by the glass
    snowStep(W, w.flakes, Math.round((K === 'frost' ? 0 : 50) * u * (0.6 + 0.6 * f.level)), 0.006, 0.04, () => gy1);
    snowDraw(r, w.flakes, u, 1, 5);
    const fr = K === 'frost' ? 0.2 * N : 0.1 * N;
    for (let k = 0; k < 4; k++) frostCorner(r, k & 1 ? N : 0, k & 2 ? 0 : gy1, fr, gy1);
    r.rect(0.495 * N, 0, 0.012 * N, gy1, FIG); r.rect(0, 0.18 * N, N, 0.012 * N, FIG);
    // the sill, the wall and the radiator under it
    r.rect(0, gy1, N, 0.02 * N, LMID); r.rect(0, gy1 + 0.02 * N, N, 0.02 * N, MID); r.rect(0, gy1 + 0.04 * N, N, N - gy1, DARK);
    for (let x = 0.2 * N; x < 0.8 * N; x += 0.03 * N) r.rect(x, 0.72 * N, 0.018 * N, 0.2 * N, MID + DIM);
    // the recorder: its handle, the body, the keys (play down while it plays, stop down while it is wound by hand), the
    // two meters with their needles, the cassette's window with the reels, the speaker, the play lamp
    const px0 = 0.14 * N, px1 = 0.64 * N, py0 = 0.33 * N;
    r.ring((px0 + px1) / 2, py0, 0.2 * N, mx1(0.012 * N), MID, 0.25);
    r.rect(px0, py0 - 0.01 * N, px1 - px0, 0.02 * N, MID);
    r.rect(px0, py0, px1 - px0, gy1 - py0, LMID + DIM);
    r.rect(px0, gy1 - 0.015 * N, px1 - px0, 0.015 * N, DARK);
    for (let k = 0; k < 6; k++) { const down = (k === 1 && play) || (k === 4 && !play); r.rect(px0 + (0.05 + k * 0.05) * N, py0 - 0.025 * N + (down ? 0.008 * N : 0), 0.04 * N, 0.022 * N, k === 0 ? HOT + DIM : MID); }
    for (let k = 0; k < 2; k++) {
      const mx = px0 + (0.29 + k * 0.1) * N, my = py0 + 0.02 * N, mw = 0.085 * N, mh = 0.05 * N;
      r.rect(mx, my, mw, mh, BRIGHT + DIM); r.frame(Math.round(mx), Math.round(my), Math.round(mw), Math.round(mh), DARK);
      const pvx = mx + mw / 2, pvy = my + mh * 0.95, len = mh * 0.8;
      for (let j = 0; j <= 6; j++) { const a = -0.8 + (j / 6) * 1.6; r.set(pvx + Math.sin(a) * len, pvy - Math.cos(a) * len, j >= 5 ? HOT : DARK); }
      const a = -0.8 + clamp(w.vu[k].x, -0.05, 1.08) * 1.6;
      r.line(pvx, pvy, pvx + Math.sin(a) * len * 0.95, pvy - Math.cos(a) * len * 0.95, BLACK);
    }
    const cw0 = px0 + 0.04 * N, cw1 = px0 + 0.26 * N, cy0 = py0 + 0.09 * N, cy1 = py0 + 0.24 * N, hy0 = (cy0 + cy1) / 2 + 0.005 * N, hxS = cw0 + 0.06 * N, hxT = cw1 - 0.06 * N;
    r.rect(cw0, cy0, cw1 - cw0, cy1 - cy0, DARK);
    r.rect(cw0 + 0.01 * N, cy0 + 0.008 * N, cw1 - cw0 - 0.02 * N, 0.02 * N, LMID + DIM);
    for (let k0 = 0; k0 < 2; k0++) {
      const hx = k0 ? hxT : hxS, rad = k0 ? rT : rS, ang = k0 ? w.aT : w.aS;
      r.disc(hx, hy0, rad, HOT + DIM);
      r.ring(hx, hy0, rad, mx1(0.5 * u), MID + DIM);
      r.disc(hx, hy0, rh, LMID);
      r.disc(hx, hy0, rh * 0.45, DARK);
      for (let k = 0; k < 6; k++) { const a = ang + (k * TAU) / 6; r.set(hx + Math.cos(a) * rh * 0.62, hy0 + Math.sin(a) * rh * 0.62, DARK); }
    }
    r.line(hxS, hy0 + rS, cw0 + 0.04 * N, cy1 - 0.008 * N, HOT + DIM); r.line(cw0 + 0.04 * N, cy1 - 0.008 * N, cw1 - 0.04 * N, cy1 - 0.008 * N, HOT + DIM); r.line(cw1 - 0.04 * N, cy1 - 0.008 * N, hxT, hy0 + rT, HOT + DIM);
    r.frame(Math.round(cw0 - u), Math.round(cy0 - u), Math.round(cw1 - cw0 + 2 * u), Math.round(cy1 - cy0 + 2 * u), MID);
    targets.push({ x: cw0, y: cy0, w: cw1 - cw0, h: cy1 - cy0 });
    for (let y = py0 + 0.1 * N; y < gy1 - 0.03 * N; y += 0.014 * N) for (let x = px0 + 0.3 * N; x < px1 - 0.02 * N; x += 0.014 * N) r.disc(x, y, mx1(0.004 * N), DARK);
    r.disc(px1 - 0.03 * N, py0 + 0.03 * N, mx1(0.007 * N), play ? (f.beat.pulse > 0.4 ? HOT : HOT + DIM) : DARK);
    // the headphones on the sill, the cord hanging from the jack and lying along the sill; the cups buzz on a kick
    const jx = px1, jy = py0 + 0.22 * N, bz = w.kick > 0.4 ? (hash(Math.floor(t * 50), 2) - 0.5) * u : 0;
    r.disc(jx, jy, mx1(0.006 * N), DARK);
    wire(r, jx, jy, jx + 0.06 * N, gy1 - u, aSag(0.06 * N, 0.025 * N), DARK);
    for (let x = jx + 0.06 * N; x < 0.74 * N; x++) r.set(x, gy1 - u - Math.abs(Math.sin((x - jx) * 0.25)) * u, DARK);
    const hc0 = 0.76 * N, hc1 = 0.9 * N, hb = gy1 - 0.012 * N;
    for (let k = 0; k < 12; k++) { const a = Math.PI * (1 + k / 12), a2 = Math.PI * (1 + (k + 1) / 12); strk(r, (hc0 + hc1) / 2 + (Math.cos(a) * (hc1 - hc0)) / 2, hb + Math.sin(a) * 0.05 * N, (hc0 + hc1) / 2 + (Math.cos(a2) * (hc1 - hc0)) / 2, hb + Math.sin(a2) * 0.05 * N, mx1(0.01 * N), LMID); }
    for (const cxp of [hc0, hc1]) { ell(r, cxp + bz, hb + 0.002 * N, 0.022 * N, 0.016 * N, DARK); ell(r, cxp + bz, hb - 0.004 * N, 0.014 * N, 0.008 * N, LMID + DIM); }
    r.line(0.74 * N, gy1 - u, hc0 - 0.02 * N, hb, DARK);
    // the pencil at the drop: in the left hub, seen end on (its six faces turning with the hub), its body coming at us
    if (!play) {
      const hx = hxS, hy2 = hy0, pr = 0.012 * N, ex = 0.02 * N, ey = 1.05 * N, dx = ex - hx, dy = ey - hy2, dl = Math.hypot(dx, dy), nx = -dy / dl, ny = dx / dl;
      poly(r, [[hx + nx * pr, hy2 + ny * pr], [ex + nx * 0.07 * N, ey + ny * 0.07 * N], [ex - nx * 0.07 * N, ey - ny * 0.07 * N], [hx - nx * pr, hy2 - ny * pr]], HOT);
      r.line(hx + nx * pr * 0.3, hy2 + ny * pr * 0.3, ex + nx * 0.02 * N, ey + ny * 0.02 * N, Math.cos(w.aS * 6) > 0 ? BRIGHT : HOT + DIM);
      const hex = [];
      for (let k = 0; k < 6; k++) { const a = w.aS + (k * TAU) / 6; hex.push([hx + Math.cos(a) * pr, hy2 + Math.sin(a) * pr]); }
      poly(r, hex, LMID);
      r.disc(hx, hy2, mx1(pr * 0.35), DARK);
      targets.push({ x: hx - pr, y: hy2 - pr, w: 2 * pr, h: 2 * pr });
    }
  },
};

const WORLDS = { panelblocks, balconysmoke, elektrichka, busstop, kitchen, garages, factory, stairwell, snowfield, tramstop, playground, cassette };
registerFamily('doomer', WORLD_DEFS, WORLDS);
export const DOOMER_STYLE = makeMixStyle('DOOMER', ['doomer']);
