// The north, mixed. Twelve scenes from the old tales of the Norse and the Slavs as wordless pictures in original
// silhouettes: a fjord at dusk with a longship rowing in, a longship in a storm, two shield walls, a lone warrior in a
// bear pelt, a shaman drumming by the fire, the carved idols of a grove, midsummer night by the river, a carved stone
// at dawn, a frozen lake under the northern lights, a mead hall, an old wise man under the stars, a forge at night. No
// runes and no letters (the stones carry knotwork), no emblems: the shields have stripes, quarters and bosses, the
// banners are plain cloth; a battle is a clash, a push and a fall, nobody bleeds. Each world has a kinds table weighed
// by the arousal band, rolled again on a section change, with its heavy turn on a drop. One physics for all: a boat
// rides the surface and pitches with its slope, an oar takes a stroke a beat; water, snow off a branch, sparks, arrows
// and leapers fly parabolas under one gravity a scene (5.4 h cells/s² where people stand h cells tall: 9.8 m/s² for
// 1.8 m); smoke, steam, breath and embers rise and slow as they cool; snowflakes and rain fall at their terminal speed;
// what floats drifts with the current, fastest midstream; legs step at the pace they travel with the planted foot
// still, a swing turns about the shoulder; far things are smaller, slower and nearer the horizon; water mirrors what
// stands on it about the line where it meets it.
import { Raster, clamp, lerp, BAYER } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, isLow, isTonal, follow, ease,
  beatLocked, hash, pickW, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight. The still
// ones sit calm–mysterious–melancholic–dreamy, the fights aggressive–tense–euphoric, the rites mysterious–tense, the
// feasts happy–euphoric–focused
const STILL = [[M, L], [L, M], [L, L], [H, L]], FIGHT = [[L, H], [M, H], [H, H]], RITE = [[L, M], [M, H]], FEAST = [[H, M], [H, H], [M, M]];
export const WORLD_DEFS = {
  fjord: { name: 'the fjord at dusk', va: STILL, pals: ['fjord', 'aurora', 'midnight', 'ice', 'silver'], fx: ['none', 'film', 'vhs'], themes: ['nature', 'lonely', 'dream'] },
  longship: { name: 'the longship in the storm', va: FIGHT, pals: ['fjord', 'grimdark', 'noir', 'warband', 'silver'], fx: ['film', 'none', 'vhs'], themes: ['war', 'nature', 'glory'] },
  shieldwall: { name: 'the shield walls', va: FIGHT, pals: ['warband', 'runic', 'grimdark', 'parchment', 'sepia'], fx: ['film', 'none', 'frame'], themes: ['war', 'rage', 'glory'] },
  berserker: { name: 'the bear warrior', va: FIGHT, pals: ['ice', 'grimdark', 'noir', 'fjord', 'warband'], fx: ['film', 'none', 'crt'], themes: ['rage', 'war', 'nature'] },
  shamandrum: { name: 'the shaman\'s drum', va: RITE, pals: ['runic', 'midnight', 'aurora', 'grimdark', 'sepia'], fx: ['none', 'film', 'vhs'], themes: ['occult', 'dream', 'night'] },
  idols: { name: 'the grove of idols', va: RITE, pals: ['runic', 'grimdark', 'noir', 'sepia', 'midnight'], fx: ['film', 'none', 'vhs'], themes: ['occult', 'nature', 'paranoia'] },
  kupala: { name: 'midsummer night', va: FEAST, pals: ['midnight', 'aurora', 'runic', 'parchment', 'fjord'], fx: ['none', 'film', 'frame'], themes: ['love', 'night', 'nature'] },
  runestone: { name: 'the carved stone', va: STILL, pals: ['sepia', 'runic', 'fjord', 'silver', 'ice'], fx: ['none', 'film', 'mirror'], themes: ['occult', 'lonely', 'nature'] },
  auroralake: { name: 'the lake under the lights', va: STILL, pals: ['aurora', 'fjord', 'midnight', 'ice', 'noir'], fx: ['none', 'film', 'mirror'], themes: ['night', 'dream', 'nature'] },
  meadhall: { name: 'the mead hall', va: FEAST, pals: ['runic', 'sepia', 'warband', 'parchment', 'grimdark'], fx: ['none', 'film', 'frame'], themes: ['glory', 'play', 'war'] },
  volkhv: { name: 'the old one under the stars', va: STILL, pals: ['midnight', 'aurora', 'fjord', 'silver', 'sepia'], fx: ['none', 'film', 'vhs'], themes: ['occult', 'night', 'lonely'] },
  forge: { name: 'the forge at night', va: FEAST, pals: ['runic', 'grimdark', 'noir', 'warband', 'sepia'], fx: ['none', 'film', 'crt'], themes: ['war', 'glory', 'night'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the kinds tables weigh their variants by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bps = (f) => (f.bpm ? f.bpm / 60 : 2);
const mx1 = (v) => Math.max(1, v);
const dim = (c) => (c < DIM ? c + DIM : c);
const frac = (v) => v - Math.floor(v);
const smooth = (q) => { q = clamp(q); return q * q * (3 - 2 * q); };
const bay = (x, y) => BAYER[((y & 7) << 3) | (x & 7)];
// a triangle wave in -1..1 on the period of sin: a foot moved by it goes back at one steady pace while it is planted
const tri = (p) => (2 / Math.PI) * Math.asin(Math.max(-1, Math.min(1, Math.sin(p))));
// smooth noise along a line, 0..1, a knot every unit
const vn = (x, s) => { const i = Math.floor(x), q = x - i, a = hash(i, s); return a + (hash(i + 1, s) - a) * q * q * (3 - 2 * q); };
// how many of a thing that comes `rate` times a second come this frame: right on average at any dt
const spawns = (rnd, rate, dt) => { const n = rate * dt, k = Math.floor(n); return k + (rnd() < n - k ? 1 : 0); };
// gravity in cells a second squared where people stand `h` cells tall (9.8 m/s² for 1.8 m)
const gOf = (h) => 5.4 * h;
// the beat clock: a count running on through the beat, whole on the beats when locked, free at the tempo (two a second
// without one) when not; `w.on` is true on the frame it passes a whole beat, so what is done on it lands on the beat
function beatClock(w, f, dt) {
  const was = w.bc;
  w.bc = beatLocked(f) ? f.beat.count + f.beat.phase : was + dt * bps(f);
  w.on = beatLocked(f) ? f.beat.on : Math.floor(w.bc) > Math.floor(was);
  return w.bc;
}
// a role a step lighter up the value ramp (a dimmed one back to full), and a step darker (the water's shade of it)
const LIT = Uint8Array.from({ length: 18 }, (_, c) => (c === DARK ? MID : c === MID ? LMID : c === LMID ? BRIGHT : c >= DIM && c < BLACK ? c - DIM : c));
const SHADE = Uint8Array.from({ length: 18 }, (_, c) => (c === BRIGHT ? LMID : c === LMID ? MID : c === MID ? DARK : c === WHITE ? BRIGHT : c < DIM ? c + DIM : c));
const IDN = Uint8Array.from({ length: 18 }, (_, c) => c);

// ---------------------------------------------------------------------------------------------- drawing
// one row of cells from x0 to x1, clipped
function span(r, y, x0, x1, c) {
  const N = r.N;
  y = Math.round(y);
  if (y < 0 || y >= N) return;
  const a = Math.max(0, Math.round(x0)), b = Math.min(N, Math.round(x1));
  if (b > a) r.buf.fill(c, y * N + a, y * N + b);
}
// one column of cells from y0 down to y1, clipped
function vcol(r, x, y0, y1, c) {
  const N = r.N;
  x = Math.round(x);
  if (x < 0 || x >= N) return;
  const a = Math.max(0, Math.round(y0)), b = Math.min(N, Math.round(y1));
  for (let i = a * N + x, e = b * N; i < e; i += N) r.buf[i] = c;
}
// a filled ellipse, a row at a time
function ell(r, cx, cy, rx, ry, c) {
  if (!(rx > 0.3 && ry > 0.3)) { if (rx > 0 && ry > 0) r.set(cx, cy, c); return; }
  const N = r.N, y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(N - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const q = (y + 0.5 - cy) / ry;
    if (q * q >= 1) continue;
    const hw = rx * Math.sqrt(1 - q * q), a = Math.max(0, Math.round(cx - hw)), b = Math.min(N, Math.round(cx + hw));
    if (b > a) r.buf.fill(c, y * N + a, y * N + b);
  }
}
// an ellipse thinned by the ordered dither, thinner toward the rim: smoke, mist, a glow
function hazeE(r, cx, cy, rx, ry, c, dens) {
  if (!(rx > 0.5 && ry > 0.5) || dens <= 0) return;
  const N = r.N, buf = r.buf, y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(N - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const q = (y + 0.5 - cy) / ry, qq = 1 - q * q;
    if (qq <= 0) continue;
    const hw = rx * Math.sqrt(qq), a = Math.max(0, Math.round(cx - hw)), b = Math.min(N, Math.round(cx + hw)), by = (y & 7) << 3;
    for (let x = a; x < b; x++) { const dx = (x + 0.5 - cx) / rx; if (BAYER[by | (x & 7)] < dens * (qq - dx * dx)) buf[y * N + x] = c; }
  }
}
const haze = (r, cx, cy, R, c, dens) => hazeE(r, cx, cy, R, R, c, dens);
// a thin ellipse (or the arc of it from a0 to a1) in O(R) cells
function circ(r, cx, cy, R, c, sy = 1, a0 = 0, a1 = TAU) {
  if (R < 0.5) { r.set(cx, cy, c); return; }
  const n = Math.max(6, Math.ceil(R * (a1 - a0) * 1.4));
  for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; r.set(cx + Math.cos(a) * R, cy + Math.sin(a) * R * sy, c); }
}
// light on whatever is in an ellipse: its cells a step up the value ramp, thinner toward the rim
function glow(r, cx, cy, rx, ry, k) {
  if (!(rx > 0.5 && ry > 0.5) || k <= 0) return;
  const N = r.N, buf = r.buf, y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(N - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const q = (y + 0.5 - cy) / ry, qq = 1 - q * q;
    if (qq <= 0) continue;
    const hw = rx * Math.sqrt(qq), a = Math.max(0, Math.round(cx - hw)), b = Math.min(N, Math.round(cx + hw)), by = (y & 7) << 3;
    for (let x = a; x < b; x++) { const dx = (x + 0.5 - cx) / rx; if (BAYER[by | (x & 7)] < k * (qq - dx * dx)) buf[y * N + x] = LIT[buf[y * N + x]]; }
  }
}
// a sky from row y0 down to y1 along a ramp of roles (the first at the top), the seams dithered
function sky(r, y0, y1, ramp) {
  const N = r.N, buf = r.buf, n = ramp.length - 1, a = Math.max(0, Math.round(y0)), b = Math.min(N, Math.round(y1));
  for (let y = a; y < b; y++) {
    const q = ((y + 0.5 - y0) / Math.max(1, y1 - y0)) * n, k = Math.min(n, Math.floor(q)), e = (q - k - 0.65) / 0.35, row = y * N;
    if (e <= 0 || k >= n) { buf.fill(ramp[k], row, row + N); continue; }
    const c0 = ramp[k], c1 = ramp[k + 1], by = (y & 7) << 3;
    for (let x = 0; x < N; x++) buf[row + x] = BAYER[by | (x & 7)] < e ? c1 : c0;
  }
}
// a few stars from a hash in the box; `tw` (a counter) makes some blink
function stars(r, n, seed, x0, x1, y0, y1, c, tw = 0) {
  for (let k = 0; k < n; k++) if (!tw || hash(seed + k, tw) > 0.1) r.set(x0 + hash(seed + k, 1) * (x1 - x0), y0 + hash(seed + k, 2) * (y1 - y0), c);
}
// rain: `n` streaks falling at their terminal `vr` cells a second, slanted by the wind (run over fall: `slant`); `xo` is
// how far the wind has carried them so far (∫ vr·slant dt), so a change in the wind turns the streaks without moving them
function rain(r, N, u, t, n, vr, slant, xo, col) {
  const len = 3 * u, wd = N * 1.4;
  for (let k = 0; k < n; k++) {
    const kv = 0.8 + 0.4 * hash(k, 42), y = ((hash(k, 41) * N + t * vr * kv) % (N + len)) - len, x = ((((hash(k, 43) * wd + xo * kv) % wd) + wd) % wd) - 0.2 * N;
    r.line(x, y, x - slant * len, y - len, col);
  }
}
// Polygons without garbage: Raster.poly (and Raster.stroke through it) makes new arrays on every call and every row;
// these fill from fixed scratch buffers, even-odd through the cells' middles like Raster.poly, `dens` < 1 thinned by
// the ordered dither; with a table `lut` each cell becomes lut[what it was] instead (a shadow laid over what is there)
const PB = new Float64Array(512), XS = new Float64Array(256);
function fillPB(r, n, c, dens = 1, lut = null) {
  const N = r.N, buf = r.buf;
  let top = Infinity, bot = -Infinity;
  for (let i = 1; i < 2 * n; i += 2) { const y = PB[i]; if (y < top) top = y; if (y > bot) bot = y; }
  for (let y = Math.max(0, Math.floor(top)), ye = Math.min(N, Math.ceil(bot)); y < ye; y++) {
    const yc = y + 0.5;
    let m = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ya = PB[2 * j + 1], yb = PB[2 * i + 1];
      if ((ya <= yc) === (yb <= yc)) continue;
      const v = PB[2 * j] + ((yc - ya) / (yb - ya)) * (PB[2 * i] - PB[2 * j]);
      let k = m++;
      for (; k > 0 && XS[k - 1] > v; k--) XS[k] = XS[k - 1];
      XS[k] = v;
    }
    for (let k = 0; k + 1 < m; k += 2) {
      const xa = Math.max(0, Math.round(XS[k])), xb = Math.min(N, Math.round(XS[k + 1]));
      if (xb <= xa) continue;
      if (lut) for (let i = y * N + xa, e = y * N + xb; i < e; i++) buf[i] = lut[buf[i]];
      else if (dens >= 1) buf.fill(c, y * N + xa, y * N + xb);
      else for (let x = xa, i = y * N + xa, by = (y & 7) << 3; x < xb; x++, i++) if (BAYER[by | (x & 7)] < dens) buf[i] = c;
    }
  }
}
function tri3(r, x0, y0, x1, y1, x2, y2, c, dens = 1) { PB[0] = x0; PB[1] = y0; PB[2] = x1; PB[3] = y1; PB[4] = x2; PB[5] = y2; fillPB(r, 3, c, dens); }
function quad(r, x0, y0, x1, y1, x2, y2, x3, y3, c, dens = 1) { PB[0] = x0; PB[1] = y0; PB[2] = x1; PB[3] = y1; PB[4] = x2; PB[5] = y2; PB[6] = x3; PB[7] = y3; fillPB(r, 4, c, dens); }
// a line `w` wide as a filled quad; thin ones Bresenham (as Raster.stroke)
function strk(r, x0, y0, x1, y1, w, c) {
  if (w <= 1.2) { r.line(x0, y0, x1, y1, c); return; }
  const len = Math.hypot(x1 - x0, y1 - y0) || 1, nx = (-(y1 - y0) / len) * (w / 2), ny = ((x1 - x0) / len) * (w / 2);
  quad(r, x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny, c);
}
// a constant shape (flat [x, y, ...]) scaled by (sx, sy) about (ox, oy), a negative sx mirroring it
function shape(r, pts, ox, oy, sx, sy, c, dens = 1) {
  const n = pts.length >> 1;
  for (let i = 0; i < n; i++) { PB[2 * i] = ox + pts[2 * i] * sx; PB[2 * i + 1] = oy + pts[2 * i + 1] * sy; }
  fillPB(r, n, c, dens);
}
// a local frame: the origin (ox, oy), turned by a (clockwise on the screen, y runs down), x mirrored when d is -1; for
// anything that pitches or faces both ways
const FR = { ox: 0, oy: 0, c: 1, s: 0, d: 1 };
function setFrame(F, ox, oy, a, d) { F.ox = ox; F.oy = oy; F.c = Math.cos(a); F.s = Math.sin(a); F.d = d; return F; }
const fX = (F, dx, dy) => F.ox + F.d * dx * F.c - dy * F.s;
const fY = (F, dx, dy) => F.oy + F.d * dx * F.s + dy * F.c;
// a constant shape through the frame, `sc` cells a unit; fy -1 turns it upside down about the frame's x axis
function polyFr(r, F, pts, sc, c, fy = 1, dens = 1) {
  const n = pts.length >> 1;
  for (let i = 0; i < n; i++) { const dx = pts[2 * i] * sc, dy = pts[2 * i + 1] * sc * fy; PB[2 * i] = fX(F, dx, dy); PB[2 * i + 1] = fY(F, dx, dy); }
  fillPB(r, n, c, dens);
}
function strkFr(r, F, x0, y0, x1, y1, w, c, fy = 1) { strk(r, fX(F, x0, y0 * fy), fY(F, x0, y0 * fy), fX(F, x1, y1 * fy), fY(F, x1, y1 * fy), w, c); }
function quadFr(r, F, x0, y0, x1, y1, x2, y2, x3, y3, c, fy = 1) {
  PB[0] = fX(F, x0, y0 * fy); PB[1] = fY(F, x0, y0 * fy); PB[2] = fX(F, x1, y1 * fy); PB[3] = fY(F, x1, y1 * fy);
  PB[4] = fX(F, x2, y2 * fy); PB[5] = fY(F, x2, y2 * fy); PB[6] = fX(F, x3, y3 * fy); PB[7] = fY(F, x3, y3 * fy);
  fillPB(r, 4, c);
}
// a fire `h` tall and `wd` wide on (x, base): three tongues licking up, their tips wandering with `tt` (a counter) and
// leaning `lean` of the height downwind, a bright core
function flame(r, x, base, wd, h, tt, lean = 0, seed = 0) {
  if (h < 0.5) return;
  for (let k = 0; k < 3; k++) {
    const q = (k - 1) * 0.3, th = h * (0.7 + 0.3 * hash(seed + k, tt)) * (k === 1 ? 1 : 0.72);
    tri3(r, x + (q - 0.28) * wd, base, x + (q + 0.28) * wd, base, x + q * wd + (hash(seed + k + 4, tt) - 0.5) * wd * 0.5 + lean * th, base - th, HOT);
  }
  tri3(r, x - wd * 0.2, base, x + wd * 0.2, base, x + (hash(seed + 9, tt) - 0.5) * wd * 0.25 + lean * h * 0.5, base - h * 0.5, BRIGHT);
}
// a round shield seen at an angle (rx by ry) with its rim, painted plain (0), in halves (1), in quarters (2) or with a
// band across (3), the boss in the middle
function roundShield(r, cx, cy, rx, ry, c1, c2, pat, rim, boss) {
  ell(r, cx, cy, rx + 0.5, ry + 0.5, rim);
  const N = r.N, buf = r.buf, y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(N - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const q = (y + 0.5 - cy) / ry;
    if (q * q >= 1) continue;
    const hw = rx * Math.sqrt(1 - q * q), a = Math.max(0, Math.round(cx - hw)), b = Math.min(N, Math.round(cx + hw)), up = q < 0;
    for (let x = a; x < b; x++) { const lf = x + 0.5 < cx; buf[y * N + x] = pat === 1 ? (lf ? c1 : c2) : pat === 2 ? (lf !== up ? c1 : c2) : pat === 3 ? (Math.abs(q) < 0.3 ? c2 : c1) : c1; }
  }
  ell(r, cx, cy, Math.max(0.6, rx * 0.28), Math.max(0.6, ry * 0.28), boss);
}

// ---------------------------------------------------------------------------------------------- particles
// particles kept in typed arrays, no garbage: position, velocity, age, life, a free number `s` and a colour; a full pool
// takes the new one over an old one's slot
function pool(cap) {
  return { n: 0, cap, k: 0, x: new Float32Array(cap), y: new Float32Array(cap), vx: new Float32Array(cap), vy: new Float32Array(cap),
    age: new Float32Array(cap), life: new Float32Array(cap), s: new Float32Array(cap), c: new Uint8Array(cap) };
}
function emit(P, x, y, vx, vy, life, c, s = 0) {
  let i = P.n;
  if (i < P.cap) P.n++; else { i = P.k; P.k = (P.k + 1) % P.cap; }
  P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.age[i] = 0; P.life[i] = life; P.c[i] = c; P.s[i] = s;
  return i;
}
function kill(P, i) {
  const j = --P.n;
  if (i === j) return;
  P.x[i] = P.x[j]; P.y[i] = P.y[j]; P.vx[i] = P.vx[j]; P.vy[i] = P.vy[j]; P.age[i] = P.age[j]; P.life[i] = P.life[j]; P.s[i] = P.s[j]; P.c[i] = P.c[j];
}
// sparks: hot scale flying parabolas under g, bouncing off the floor (and off a shelf from sx0 to sx1 at row sy, the
// anvil's face) losing most of their speed, cooling from bright through hot to dim as they age, drawn as the streak
// they made this frame
function sparks(W, P, g, floor, sx0 = 0, sx1 = -1, sy = 0) {
  const { r, dt } = W;
  for (let i = 0; i < P.n;) {
    const ox = P.x[i], oy = P.y[i];
    P.vy[i] += g * dt; P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
    const q = (P.age[i] += dt) / P.life[i];
    if (q >= 1) { kill(P, i); continue; }
    if (P.vy[i] > 0 && oy <= sy && P.y[i] > sy && P.x[i] >= sx0 && P.x[i] <= sx1) { P.y[i] = sy; P.vy[i] *= -0.3; P.vx[i] *= 0.5; }
    else if (P.y[i] > floor && P.vy[i] > 0) { P.y[i] = floor; P.vy[i] *= -0.3; P.vx[i] *= 0.5; }
    r.line(ox, oy, P.x[i], P.y[i], q < 0.35 ? BRIGHT : q < 0.75 ? HOT : HOT + DIM);
    i++;
  }
}
// smoke, steam and breath: a puff leaves at (vx, vy); it rises toward a lift (its `s`, cells/s) that dies away as it
// cools in `tau` seconds, so it climbs ever slower, drifts toward the wind, swells and thins out until it is gone
function plume(W, P, wind, tau, grow, dens, maxR) {
  const { r, dt, u } = W;
  for (let i = 0; i < P.n;) {
    const a = (P.age[i] += dt);
    if (a >= P.life[i]) { kill(P, i); continue; }
    P.vy[i] = follow(P.vy[i], -P.s[i] * Math.exp(-a / tau), dt, 0.35);
    P.vx[i] = follow(P.vx[i], wind, dt, 0.8);
    P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
    haze(r, P.x[i], P.y[i], Math.min(maxR, (1 + a * grow) * u), P.c[i], dens * (1 - a / P.life[i]));
    i++;
  }
}
// embers: thrown up hot and quick, they slow as they cool (the lift goes, the drag holds them) to a slow drift, weaving
// (each its own phase, `s`), bright to hot to out
function embers(W, P, wind) {
  const { r, dt, u, t, N } = W, sz = mx1(u * 0.8);
  for (let i = 0; i < P.n;) {
    const q = (P.age[i] += dt) / P.life[i];
    if (q >= 1) { kill(P, i); continue; }
    P.vy[i] = follow(P.vy[i], -0.02 * N * (1 - q), dt, 0.45);
    P.vx[i] = follow(P.vx[i], wind, dt, 0.7);
    P.x[i] += (P.vx[i] + Math.sin(t * 5 + P.s[i]) * 2 * u) * dt; P.y[i] += P.vy[i] * dt;
    r.rect(P.x[i], P.y[i], sz, sz, q < 0.4 ? BRIGHT : q < 0.75 ? HOT : HOT + DIM);
    i++;
  }
}
// snow at its terminal speed: flakes at depths 1 (near) to 3 (their `s`), the screen speeds and the size 1/d; `fall` and
// `wind` in cells a second at depth 1; a flake lands on the ground of its depth (row hz + K / d) and comes down again
function flakes(W, P, want, fall, wind, hz, K, col) {
  const { r, N, dt, t, rnd, u } = W;
  want = Math.min(want, P.cap);
  while (P.n < want) { const d = 1 + 2 * rnd(); emit(P, rnd() * N, rnd() * (hz + K / d), 0, 0, 1, col, d); }
  if (P.n > want) P.n = want;
  for (let i = 0; i < P.n; i++) {
    const k = 1 / P.s[i];
    P.y[i] += fall * k * dt;
    P.x[i] += (wind + 0.3 * fall * Math.sin(t * 1.7 + i * 2.3)) * k * dt;
    if (P.x[i] < 0) P.x[i] += N; else if (P.x[i] >= N) P.x[i] -= N;
    if (P.y[i] > hz + K * k) { P.y[i] = -rnd() * 4 * u; P.x[i] = rnd() * N; }
    const sz = Math.max(1, Math.round(1.6 * u * k));
    r.rect(P.x[i], P.y[i], sz, sz, k > 0.55 ? col : dim(col));
  }
}

// ---------------------------------------------------------------------------------------------- the northern lights
// Curtains folded along slow waves across the sky, each a sheet with a sharp bright hem fading upward, combed into rays
// that flicker; the folds travel with the mids; a tonal hit shifts a curtain's colours by its pitch class: green, green
// over a pink hem, pink, pale. Per set: the body, the faint, the core, the hem (-1 none)
const AUR_SETS = [COOL, COOL + DIM, BRIGHT, -1, COOL, COOL + DIM, BRIGHT, HOT, HOT, HOT + DIM, BRIGHT, -1, LMID, COOL + DIM, BRIGHT, COOL];
const AUR_FALL = Float32Array.from({ length: 64 }, (_, i) => { const q = i / 63; return q < 0.07 ? 1 : Math.exp(-2.6 * (q - 0.07)); });
const aurora0 = (rnd) => ({ N: 0, base: null, hgt: null, ray: null,
  c: [0, 1, 2].map((i) => ({ ph: rnd() * TAU, k: 1.2 + 1.1 * rnd(), y: 0.42 + 0.22 * i, h: 0.42 - 0.08 * i, set: 0, old: 0, mix: 1, sd: 70 + 13 * i })) });
function auroraHue(A, pc) { const C = A.c[pc % 3], s = Math.floor(pc / 3); if (s !== C.set) { C.old = C.set; C.set = s; C.mix = 0; } }
// the curtains between rows y0 (where the tallest reach) and y1 (the lowest hem), at strength k
function auroraDraw(r, W, A, y0, y1, k) {
  const { N, t, u, dt, f } = W, buf = r.buf;
  if (A.N !== N) { A.N = N; A.base = new Float32Array(N); A.hgt = new Float32Array(N); A.ray = new Float32Array(N); }
  for (let ci = 0; ci < 3; ci++) {
    const C = A.c[ci], dr = f.rel.midClock * (0.45 + 0.2 * ci) + t * 0.05, s0 = 4 * C.set, s1 = 4 * C.old, base = A.base, hgt = A.hgt, ray = A.ray;
    C.mix = Math.min(1, C.mix + dt / 0.6);
    for (let x = 0; x < N; x++) {
      const q = x / N;
      base[x] = y0 + (y1 - y0) * (C.y + 0.12 * Math.sin(q * C.k * TAU + C.ph + dr) + 0.05 * Math.sin(q * C.k * 2.7 * TAU - dr * 1.3 + C.ph));
      hgt[x] = (y1 - y0) * C.h * (0.65 + 0.5 * vn(q * 6 + dr * 0.3, C.sd));
      const v = vn(x / (1.6 * u) + t * (0.7 + 0.25 * ci), C.sd + 5);
      ray[x] = k * (0.4 + 0.6 * v * v) * (0.85 + 0.15 * Math.sin(q * 31 + t * 2.3));
    }
    for (let x = 0; x < N; x++) {
      const b = base[x], hh = hgt[x], ry = ray[x];
      if (ry < 0.04 || hh < 1) continue;
      for (let y = Math.max(0, Math.floor(b - hh)), ye = Math.min(N, Math.ceil(b)); y < ye; y++) {
        const qq = (b - y) / hh, I = ry * AUR_FALL[Math.min(63, (qq * 63) | 0)];
        if (I < 0.15 || (I < 0.35 && BAYER[((y & 7) << 3) | (x & 7)] >= (I - 0.15) * 5)) continue; // the faint parts thinned, the body solid
        const sb = BAYER[(((y + 3) & 7) << 3) | ((x + 5) & 7)] < C.mix ? s0 : s1, hem = AUR_SETS[sb + 3];
        buf[y * N + x] = hem >= 0 && qq < 0.05 ? hem : I > 0.75 ? AUR_SETS[sb + 2] : I > 0.35 ? AUR_SETS[sb] : AUR_SETS[sb + 1];
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------- the longship
// Shapes in units of the ship's length, x toward the bow, y down, 0 on the waterline: the hull over the water and all of
// it, the carved dragon's neck and head on the stem, the curled tail on the stern
const LS_UP = [-0.5, -0.17, -0.47, -0.11, -0.4, -0.08, -0.2, -0.064, 0, -0.06, 0.2, -0.064, 0.38, -0.08, 0.45, -0.11, 0.48, -0.15,
  0.5, -0.1, 0.49, -0.03, 0.47, 0, -0.47, 0, -0.49, -0.03, -0.51, -0.1];
const LS_HULL = [-0.5, -0.17, -0.47, -0.11, -0.4, -0.08, -0.2, -0.064, 0, -0.06, 0.2, -0.064, 0.38, -0.08, 0.45, -0.11, 0.48, -0.15,
  0.5, -0.1, 0.49, -0.03, 0.46, 0.012, 0.35, 0.036, 0, 0.044, -0.35, 0.036, -0.46, 0.012, -0.49, -0.03, -0.51, -0.1];
const LS_NECK = [0.47, -0.15, 0.48, -0.21, 0.495, -0.262, 0.51, -0.296, 0.53, -0.314, 0.556, -0.302, 0.586, -0.289, 0.56, -0.281, 0.586, -0.268,
  0.552, -0.261, 0.527, -0.25, 0.512, -0.21, 0.506, -0.15];
const LS_CREST = [0.497, -0.27, 0.48, -0.3, 0.505, -0.288, 0.49, -0.322, 0.515, -0.305];
const LS_TAIL = [-0.49, -0.15, -0.505, -0.2, -0.53, -0.238, -0.52, -0.272, -0.494, -0.268, -0.504, -0.246, -0.518, -0.236, -0.497, -0.2, -0.476, -0.15];
const LS_SHIELD = [HOT, LMID, COOL, MID];
// an oar on a stroke a beat, `p` the phase in it (0 the catch, on the beat): through the drive (the first 45 %) the blade
// sweeps aft through the water, through the recovery it comes forward again lifted clear; in the boat's frame, from the
// port (lx, ly) with the waterline `wl` under it, the blade lands in OX, OY; returns whether it is pulling
let OX = 0, OY = 0;
function oarAt(p, lx, ly, reach, wl) {
  const drive = p < 0.45, q = drive ? p / 0.45 : (p - 0.45) / 0.55, sw = (1 - Math.cos(Math.PI * q)) / 2;
  OX = lx + (drive ? lerp(1, -1, sw) : lerp(-1, 1, sw)) * reach;
  OY = ly + wl * (drive ? 1 + 0.5 * Math.sin(Math.PI * q) : 1 - 0.6 * Math.sin(Math.PI * q));
  return drive;
}
// The longship L long in the frame F: the hull (only what stands over the water when `up`), the neck and the tail, the
// mast with its stays and the yard, the sail furled on the yard (sail < 0) or set and filled by the wind to `sail`
// (0..1; slack it luffs, a ripple running along its foot), the rowers' heads and helmets above the rail leaning with
// the stroke `p`, plain shields along the rail, `n` oars, the steering oar on the starboard quarter (behind the hull
// when she sails to the left); fy -1 draws it upside down about the waterline through the shades `sh` (its reflection,
// nothing under the water)
function steerOar(r, F, L, fy, sh) {
  strkFr(r, F, -0.42 * L, -0.11 * L, -0.465 * L, fy < 0 ? 0 : 0.06 * L, mx1(0.009 * L), sh[DARK], fy);
  if (fy > 0) strkFr(r, F, -0.458 * L, 0.02 * L, -0.468 * L, 0.06 * L, mx1(0.02 * L), sh[DARK], fy);
}
function drawShip(r, F, L, u, t, p, sail, n, hull, fy, sh, up, glint = 0) {
  const drive = p < 0.45, q = drive ? p / 0.45 : (p - 0.45) / 0.55, lean = drive ? lerp(-1, 1, smooth(q)) : lerp(1, -1, smooth(q)), wl = mx1(0.006 * L);
  if (F.d < 0) steerOar(r, F, L, fy, sh);
  strkFr(r, F, 0.03 * L, -0.05 * L, 0.03 * L, -0.47 * L, mx1(0.011 * L), sh[DARK], fy);
  strkFr(r, F, 0.03 * L, -0.46 * L, 0.48 * L, -0.15 * L, 1, sh[MID], fy);
  strkFr(r, F, 0.03 * L, -0.46 * L, -0.5 * L, -0.17 * L, 1, sh[MID], fy);
  strkFr(r, F, -0.23 * L, -0.43 * L, 0.28 * L, -0.43 * L, mx1(0.009 * L), sh[DARK], fy);
  if (sail < 0) { // furled on the yard, lashed at intervals
    strkFr(r, F, -0.21 * L, -0.418 * L, 0.26 * L, -0.418 * L, mx1(0.022 * L), sh[LMID], fy);
    for (let k = 0; k < 6; k++) { const x = (-0.17 + 0.08 * k) * L; strkFr(r, F, x, -0.432 * L, x, -0.405 * L, 1, sh[DARK], fy); }
  } else { // set: eight cloths sewn side by side in two colours, bellied forward by the wind and lifted at the foot
    for (let k = 0; k < 8; k++) {
      const q0 = k / 8, q1 = (k + 1) / 8, b0 = 1 - (2 * q0 - 1) ** 2, b1 = 1 - (2 * q1 - 1) ** 2, sl = (1 - sail) * 0.016 * L;
      const xa = (-0.21 + 0.46 * q0) * L, xb = (-0.21 + 0.46 * q1) * L, ya = -0.42 * L, ym = -0.28 * L, yb = -0.14 * L;
      const fa = sail * 0.05 * L * b0 + sl * Math.sin(q0 * 9 - t * 8), fb = sail * 0.05 * L * b1 + sl * Math.sin(q1 * 9 - t * 8);
      const c = sh[(k & 1) ? LMID : glint > 0.3 ? BRIGHT : HOT];
      quadFr(r, F, xa, ya, xb, ya, xb + fb * 0.75, ym, xa + fa * 0.75, ym, c, fy);
      quadFr(r, F, xa + fa * 0.75, ym, xb + fb * 0.75, ym, xb + fb, yb - sail * 0.025 * L * b1, xa + fa, yb - sail * 0.025 * L * b0, c, fy);
    }
  }
  for (let i = 0; i < n; i++) { // the rowers' heads, the steersman's at the stern
    const lx = (-0.3 + (0.6 * i) / Math.max(1, n - 1)) * L, hx = lx - 0.02 * L + lean * 0.018 * L;
    ell(r, fX(F, hx, -0.1 * L * fy), fY(F, hx, -0.1 * L * fy), 0.013 * L, 0.015 * L, sh[DARK]);
    strkFr(r, F, hx - 0.012 * L, -0.106 * L, hx + 0.012 * L, -0.106 * L, mx1(0.008 * L), sh[MID], fy);
  }
  ell(r, fX(F, -0.42 * L, -0.14 * L * fy), fY(F, -0.42 * L, -0.14 * L * fy), 0.013 * L, 0.016 * L, sh[DARK]);
  polyFr(r, F, up ? LS_UP : LS_HULL, L, sh[hull], fy);
  polyFr(r, F, LS_NECK, L, sh[hull], fy);
  polyFr(r, F, LS_CREST, L, sh[hull], fy);
  polyFr(r, F, LS_TAIL, L, sh[hull], fy);
  strkFr(r, F, -0.46 * L, -0.03 * L, 0.46 * L, -0.03 * L, 1, sh[MID], fy); // a strake
  r.set(fX(F, 0.545 * L, -0.298 * L * fy), fY(F, 0.545 * L, -0.298 * L * fy), sh[glint > 0.3 ? BRIGHT : HOT]); // the dragon's eye
  for (let i = 0; i < 12; i++) { const x = (-0.37 + 0.067 * i) * L, c = LS_SHIELD[i & 3]; roundShield(r, fX(F, x, -0.073 * L * fy), fY(F, x, -0.073 * L * fy), 0.023 * L, 0.023 * L, sh[c], sh[i % 3 ? LMID : DARK], i % 3, sh[DARK], sh[LMID]); }
  for (let i = 0; i < n; i++) { // the oars out of their ports under the rail, the blades
    const lx = (-0.3 + (0.6 * i) / Math.max(1, n - 1)) * L;
    oarAt(p, lx, -0.042 * L, 0.075 * L, 0.042 * L);
    let bx = OX, by = OY;
    if (fy < 0 && by > 0) { const k = 0.042 * L / (0.042 * L + by); bx = lx + (bx - lx) * k; by = 0; } // its reflection stops at the water
    strkFr(r, F, lx, -0.042 * L, bx, by, wl, sh[DARK], fy);
    if (fy > 0 || OY <= 0) strkFr(r, F, lx + (bx - lx) * 0.75, -0.042 * L + (by + 0.042 * L) * 0.75, bx, by, mx1(0.014 * L), sh[DARK], fy);
  }
  if (F.d > 0) steerOar(r, F, L, fy, sh);
}

// ---------------------------------------------------------------------------------------------- fjord
// A fjord at dusk from the water: the walls tower up on both sides in four ranges, the farther lower, nearer the middle
// and moved less by the camera's slow drift; waterfalls come off their brows (the water falls under gravity in a sheet
// and breaks into spray and mist at the foot, more of it with the bass), mist banks drift over the water, the last
// light glows in the gap at the far end. A longship rows in, a stroke a beat (the catch on the beat), surging on each
// drive, the dragon's head on its stem, shields along the rail; the water lies mirror-calm (the camera is two metres
// over it, so every shore stands on the horizon to a cell) and gives back the walls, the falls and the sky a step
// darker, the ship mirrored about its own waterline, rings spreading where the blades go in, the wake left lying. A
// kick is a hard stroke (the ship surges, the falls throw spray), a snare sheds the water off the blades, a hat glints
// on the water, a note lights a star. The kind is the evening: clear dusk, mist, snow, the thaw (the falls in spate).
// A drop opens the northern lights over the fjord, and the water gives them back.
const FJORD_W = { dusk: [3, 2, 1], mist: [2, 2, 1], snow: [1, 2, 2], thaw: [1, 1, 3] };
const FJORD = { dusk: { mist: 0.25, snow: 0, flow: 1 }, mist: { mist: 0.75, snow: 0, flow: 0.8 }, snow: { mist: 0.3, snow: 90, flow: 0.7 }, thaw: { mist: 0.4, snow: 0, flow: 1.7 } };
const FJ_D = [3.6, 2.3, 1.5, 1], FJ_COL = [MID, MID + DIM, DARK, DARK + DIM], SKY_DUSK = [DARK + DIM, DARK, MID, LMID, BRIGHT];
const FJ_FALLS = [1, -1, 0.1, 2, 1, 0.07, 3, -1, 0.05]; // a waterfall: its range, its wall (-1 the left), how far out from the wall's inner edge (screens at depth 1)
// the brow of a fjord wall at depth d, `o` cells out from the tip of its spur at the water: up in a steep rounded
// shoulder to a ridge of broken peaks `hg` high at most; the noise at the wall's own scale, so it slides with it
function brow(o, d, hg, seed, N) {
  const e = (o * d) / N, q = Math.min(1, e / 0.28), pk = 1 - Math.abs(2 * vn(e * 7, seed) - 1);
  return hg * (1 - (1 - q) * (1 - q)) * (0.4 + 0.38 * pk + 0.16 * vn(e * 2.3, seed + 1) + 0.06 * vn(e * 31, seed + 3));
}
const fjord = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { N, kind: rollW(rnd, FJORD_W, bandOf(W.a)), bc: 0, on: false, bx: -0.3 * N, dir: 1, v: 0, surge: 0, rest: 0, ph0: rnd() * 50, gush: 0,
      aurT: -1, lit: new Float32Array(12), falls: [pool(360), pool(360), pool(360)], spray: pool(200), mist: pool(40), drops: pool(120),
      rings: pool(64), wake: pool(80), glints: pool(16), flakes: pool(200), md: new Float32Array(N), A: aurora0(rnd) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), buf = r.buf;
    if (w.N !== N) fjord.init(W);
    if (f.section === 'change') w.kind = rollW(rnd, FJORD_W, band);
    if (f.section === 'drop' && w.aurT < 0) w.aurT = 0;
    // the scale: the ship 25 m long in 0.46 N, its waterline 2 m (the camera's height) under the horizon; the walls 300 m
    // high in 0.58 N at depth 1, their gravity gC there
    const K = FJORD[w.kind], hz = Math.round(0.52 * N), cx = 0.5 * N, Ls = 0.46 * N, sc = Ls / 25, ys = hz + 2 * sc, gS = 9.8 * sc, gC = (9.8 * 0.58 * N) / 300;
    const p = frac(beatClock(w, f, dt)), wind = -0.3 * sc;
    let snare = 0;
    for (const h of hits) {
      if (isLow(h)) { w.surge = Math.max(w.surge, 0.12 * Ls * h.strength); w.gush = 1; }
      else if (h.kind === 'snare') snare = Math.max(snare, h.strength);
      else if (h.kind === 'hat') emit(w.glints, rnd() * N, hz + (0.01 + 0.4 * rnd() * rnd()) * N, 0, 0, 0.35, BRIGHT);
      if (isTonal(h)) w.lit[h.pc] = 1;
    }
    let aur = 0;
    if (w.aurT >= 0) { w.aurT += dt; aur = smooth(Math.min(w.aurT / 3, (24 - w.aurT) / 5)); if (w.aurT > 24) w.aurT = -1; }
    const pan = 0.05 * N * Math.sin(t * 0.04 + w.ph0 + f.rel.midClock * 0.012);
    // the sky: dusk deepening upward, the last light low in the gap, the stars; the lights after a drop
    sky(r, 0, hz, SKY_DUSK);
    hazeE(r, cx + pan / 6, hz, 0.36 * N, 0.09 * N, HOT, 0.9 + 0.5 * f.level);
    stars(r, 46, 5, 0, N, 0, 0.3 * N, LMID + DIM, Math.floor(t * 2));
    for (let k = 0; k < 12; k++) {
      const x = (0.08 + 0.84 * hash(k, 21)) * N, y = (0.03 + 0.25 * hash(k, 22)) * N, l = w.lit[k];
      w.lit[k] = Math.max(0, l - dt * 0.7);
      r.set(x, y, l > 0.15 ? BRIGHT : LMID);
      if (l > 0.3) { const a = l * 2.5 * u; r.rect(x - a, y, 2 * a + 1, 1, k & 1 ? COOL : BRIGHT); r.rect(x, y - a, 1, 2 * a + 1, k & 1 ? COOL : BRIGHT); }
    }
    if (aur > 0.01) auroraDraw(r, W, w.A, 0.02 * N, 0.4 * N, aur);
    // the mountains at the far end, then the walls, far to near; each range's waterfalls on it before the nearer ones
    // go over them
    for (let x = 0; x < N; x++) { const e = (x - pan / 7) / N; vcol(r, x, hz - 0.05 * N * (0.3 + 0.7 * (1 - Math.abs(2 * vn(e * 9, 3) - 1)) * vn(e * 3, 4)), hz, LMID); }
    for (let li = 0; li < 4; li++) {
      const d = FJ_D[li], xl = cx - (0.36 * N) / d + pan / d, xr = cx + (0.34 * N) / d + pan / d, hg = (0.58 * N) / d, col = FJ_COL[li], hi = LIT[col], cap = li < 2 || w.kind === 'snow';
      for (let x = 0; x < N; x++) {
        const left = x < xl, o = left ? xl - x : x - xr;
        if (o < 0) continue;
        const seed = 11 + li * 7 + (left ? 0 : 50), b = brow(o, d, hg, seed, N), top = hz - b;
        vcol(r, x, top, hz, col);
        if (hash(Math.floor((o * d) / (0.011 * N)), seed) < 0.2) vcol(r, x, top + (3 * u) / d, hz, dim(col)); // a fissure down the face
        r.set(x, top, hi); // the brow catches the last of the light
        if (cap && b > hg * 0.86) vcol(r, x, top, top + mx1((2 * u) / d), BRIGHT);
      }
      for (let k = 0; k < 3; k++) {
        if (FJ_FALLS[3 * k] !== li) continue;
        // the fall: off the brow at (xL, yL), out from the face at a metre or so a second, down under gravity at its
        // depth; the sheet's streaks move with the water (the time since it left the lip), quicker as it falls
        const side = FJ_FALLS[3 * k + 1], off = (FJ_FALLS[3 * k + 2] * N) / d, xL = side < 0 ? xl - off : xr + off, yL = hz - brow(off, d, hg, 11 + li * 7 + (side < 0 ? 0 : 50), N);
        const gd = gC / d, sD = (0.58 * N) / (300 * d), vx0 = -side * 1.2 * sD, P = w.falls[k], hw = Math.max(0.6, (0.8 * u) / Math.sqrt(d)), H0 = hz - yL;
        for (let y = Math.ceil(yL); y < hz; y++) {
          const fl = y - yL, ty = Math.sqrt((2 * fl) / gd), xc = xL + vx0 * ty, wd = hw * (1 + (fl / H0) * 1.5), q = Math.floor((t - ty) * 5), xi = Math.round(xc), th = 0.75 - 0.35 * (fl / H0);
          for (let x = Math.max(0, Math.round(xc - wd)), xe = Math.min(N - 1, Math.round(xc + wd)); x <= xe; x++) { const hv = hash(x - xi + 9 * k, q); if (hv < th) buf[y * N + x] = hv < th * 0.4 ? BRIGHT : LMID; }
        }
        for (let n = spawns(rnd, 16 * K.flow * (0.6 + 0.8 * clamp(f.rel.bassDrive)), dt); n > 0; n--) emit(P, (rnd() - 0.5) * 2 * hw, 0, vx0 * (0.6 + 0.8 * rnd()), 0, 60, BRIGHT);
        for (let i = 0; i < P.n;) {
          P.vy[i] += gd * dt; P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
          const x = xL + P.x[i], y = yL + P.y[i];
          if (y >= hz) { // into the water: spray thrown up at the foot
            if (rnd() < 0.3) emit(w.spray, x, hz - 1, (rnd() - 0.5) * 12 * sD, -(4 + 8 * rnd()) * sD, 1.6, LMID, d);
            kill(P, i); continue;
          }
          r.set(x, y, BRIGHT);
          i++;
        }
        if (w.gush) for (let n = 0; n < 10; n++) emit(w.spray, xL + vx0 * Math.sqrt((2 * H0) / gd) + (rnd() - 0.5) * 3 * hw, hz - 1, (rnd() - 0.5) * 16 * sD, -(6 + 10 * rnd()) * sD, 1.8, BRIGHT, d);
        for (let n = spawns(rnd, 2.5 * K.flow * (1 + w.gush * 6), dt); n > 0; n--) emit(w.mist, xL + vx0 * Math.sqrt((2 * H0) / gd), hz - 2 * u, 0, -2 * sD, 4, LMID, 3 * sD);
      }
    }
    w.gush = 0;
    // the spray at the feet of the falls (each under the gravity of its depth), the mist rising off them
    for (let i = 0; i < w.spray.n;) {
      const P = w.spray;
      P.vy[i] += (gC / P.s[i]) * dt; P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
      if ((P.age[i] += dt) > P.life[i] || (P.y[i] > hz && P.vy[i] > 0)) { kill(P, i); continue; }
      r.set(P.x[i], P.y[i], P.c[i]);
      i++;
    }
    plume(W, w.mist, wind * 0.3, 2.5, 3, 0.45, 6 * u);
    // the water: everything above mirrored about the horizon a step darker, shimmering a little more toward us
    const shim = 0.4 + 0.5 * clamp(f.rel.trebDrive);
    for (let y = hz; y < N; y++) {
      const sy = 2 * hz - 1 - y, row = y * N;
      if (sy < 0) { buf.fill(DARK + DIM, row, row + N); continue; }
      const q = (y - hz) / (N - hz), dx = Math.round(shim * u * q * Math.sin(y * 0.8 - t * 1.9)), src = sy * N;
      for (let x = 0; x < N; x++) { const xs = x + dx; buf[row + x] = SHADE[buf[src + (xs < 0 ? 0 : xs >= N ? N - 1 : xs)]]; }
    }
    // the mist banks lying on the water among the walls, drifting on the air, the farther slower; the camera's drift moves
    // them as it moves the walls at their depth
    if (K.mist > 0.05) for (let k = 0; k < 3; k++) {
      const d = 1.5 + k, yc = hz + (k - 1) * 0.012 * N, th = (0.032 * N) / Math.sqrt(d), dr = (t * 0.012 * N + f.rel.midClock * 0.004 * N - pan) / d + k * 0.37 * N, md = w.md;
      for (let x = 0; x < N; x++) md[x] = K.mist * smooth((vn((x + dr) / (0.11 * N), 60 + k) - 0.3) * 1.8);
      for (let y = Math.max(0, Math.round(yc - th)), ye = Math.min(N, Math.round(yc + th)); y < ye; y++) {
        const e = (1 - Math.abs(y + 0.5 - yc) / th) ** 2, by = (y & 7) << 3, row = y * N;
        for (let x = 0; x < N; x++) if (BAYER[by | (x & 7)] < md[x] * e) buf[row + x] = LMID;
      }
    }
    // the longship: rowed a stroke a beat, a fifth of her length a stroke, quicker through the drive; out of sight at one
    // end she turns and comes back after a while
    if (w.rest > 0) w.rest -= dt;
    else {
      w.v = follow(w.v, 0.2 * Ls * bps(f) * (p < 0.45 ? 1.3 : 0.72) * (0.85 + 0.3 * clamp(f.rel.midDrive)) + w.surge, dt, 0.35);
      w.bx += w.dir * w.v * dt;
      if (w.dir > 0 ? w.bx > N + 0.62 * Ls : w.bx < -0.62 * Ls) { w.rest = 2.5 + 3 * rnd(); w.dir = -w.dir; w.v = 0; }
    }
    w.surge *= Math.exp(-dt * 2.5);
    const seen = w.rest <= 0, F = setFrame(FR, w.bx, ys, 0, w.dir);
    if (seen) {
      if (w.on) for (let i = 0; i < 8; i++) emit(w.rings, w.bx + w.dir * (-0.3 + (0.6 * i) / 7 + 0.075) * Ls, ys + 0.3 * sc, 0, 0, 2.6, LMID); // the blades go in on the beat
      if (snare > 0 && p >= 0.45) for (let i = 0; i < 8; i++) { oarAt(p, (-0.3 + (0.6 * i) / 7) * Ls, -0.042 * Ls, 0.075 * Ls, 0.042 * Ls); for (let n = 0; n < 3; n++) emit(w.drops, fX(F, OX, OY), fY(F, OX, OY), (rnd() - 0.5) * sc, -rnd() * 1.5 * sc, 3, BRIGHT); }
      for (let n = spawns(rnd, 10, dt); n > 0; n--) emit(w.wake, w.bx - w.dir * 0.47 * Ls, ys, 0, 0, 2.5, LMID);
      drawShip(r, F, Ls, u, t, p, -1, 8, DARK, -1, SHADE, true);
    }
    // the rings where the blades went in (they spread at half a metre a second and go flat with the low view) and the
    // reflection wobbling inside them; the wake lying where it was laid, spreading, fading
    const P = w.rings, sy = 2 / (N / sc); // the camera's height over the distance: how flat a ring on the water looks
    for (let i = 0; i < P.n;) {
      const a = (P.age[i] += dt);
      if (a >= P.life[i]) { kill(P, i); continue; }
      const R = (0.3 + 0.5 * a) * sc, x0 = P.x[i], y0 = P.y[i], ry = Math.max(0.5, R * sy), xa = Math.max(1, Math.round(x0 - R)), xb = Math.min(N - 2, Math.round(x0 + R));
      for (let y = Math.round(y0 - ry), ye = Math.round(y0 + ry); y <= ye; y++) if (y >= hz && y < N) { // a row shifted a cell, alternately each way
        const row = y * N;
        if (y & 1) for (let x = xa; x <= xb; x++) buf[row + x] = buf[row + x + 1]; else for (let x = xb; x >= xa; x--) buf[row + x] = buf[row + x - 1];
      }
      circ(r, x0, y0, R, a < 1.2 ? LMID : MID, ry / R);
      i++;
    }
    for (let i = 0; i < w.wake.n;) {
      const Q = w.wake, a = (Q.age[i] += dt);
      if (a >= Q.life[i]) { kill(Q, i); continue; }
      const l = (1 + a * 1.6) * u;
      if (hash(Q.x[i] | 0, Math.floor(a * 4)) < 1 - a / Q.life[i]) r.rect(Q.x[i] - l / 2, Q.y[i], l, 1, a < 0.8 ? LMID : MID);
      i++;
    }
    for (let i = 0; i < w.glints.n;) {
      const Q = w.glints, a = (Q.age[i] += dt);
      if (a >= Q.life[i]) { kill(Q, i); continue; }
      const e = (1 - a / Q.life[i]) * 2.5 * u;
      r.rect(Q.x[i] - e, Q.y[i], 2 * e + 1, 1, BRIGHT); r.rect(Q.x[i], Q.y[i] - e * 0.4, 1, e * 0.8 + 1, BRIGHT);
      i++;
    }
    if (seen) {
      drawShip(r, F, Ls, u, t, p, -1, 8, DARK, 1, IDN, true);
      if (w.v > 0.02 * Ls) for (let k = 0; k < 3; k++) r.set(w.bx + w.dir * (0.47 * Ls + k * u), ys - k * 0.6 * u, BRIGHT); // the bow wave
      targets.push({ x: w.bx - 0.52 * Ls, y: ys - 0.48 * Ls, w: 1.1 * Ls, h: 0.5 * Ls });
    }
    // the drops shed off the blades fall into the water and ring it
    for (let i = 0; i < w.drops.n;) {
      const Q = w.drops;
      Q.vy[i] += gS * dt; Q.x[i] += Q.vx[i] * dt; Q.y[i] += Q.vy[i] * dt;
      if ((Q.age[i] += dt) > Q.life[i] || Q.y[i] > ys + 0.3 * sc) { if (Q.age[i] <= Q.life[i] && rnd() < 0.3) emit(w.rings, Q.x[i], ys + 0.3 * sc, 0, 0, 1.2, LMID); kill(Q, i); continue; }
      r.set(Q.x[i], Q.y[i], BRIGHT);
      i++;
    }
    if (K.snow) flakes(W, w.flakes, Math.round(K.snow * u * (0.6 + 0.6 * clamp(f.rel.trebDrive))), N / 8, wind * 2, hz, N / 4, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- the sea
// Swells: trains of Stokes waves (crests sharper than troughs: a cos θ + ½ k a² cos 2θ), each at the phase speed deep
// water gives it under the world's gravity (ω² = g k), seen by a camera that has come `off` cells, and a solitary crest
// (sech²) `big` running at its own; `sea.y` holds the surface per column
function swell(sea, N, t, off, base, g) {
  if (!sea.y || sea.y.length !== N) sea.y = new Float32Array(N);
  const y = sea.y, tr = sea.trains, B = sea.big;
  for (let x = 0; x < N; x++) {
    let e = 0;
    for (let k = 0; k < tr.length; k++) { const T = tr[k], kk = TAU / (T.l * N), th = kk * (x + off) - T.d * Math.sqrt(g * kk) * t + T.p; e += T.a * Math.cos(th) + 0.5 * kk * T.a * T.a * Math.cos(2 * th); }
    if (B) { const c = 1 / Math.cosh((x + off - B.X) / B.s); e += B.a * c * c; }
    y[x] = base - e;
  }
}
const surfAt = (sea, x) => { const y = sea.y, i = Math.max(0, Math.min(y.length - 2, Math.floor(x))), q = clamp(x - i); return y[i] + (y[i + 1] - y[i]) * q; };
// the water at depth d under the surface: a lit skin, the near water, a dithered seam, the deep
const seaCol = (d, x, y, u, d1) => (d < u ? LMID : d < d1 ? MID : d < d1 + 2 * u && (x + y) & 1 ? MID : DARK);
// the sea: the far water from the horizon to the swell (lighter off toward the horizon, streaks of foam at even steps of
// distance drifting back at the camera's pace over their distance), the swell in section under its surface, foam on
// the crests that stand higher than `foam` (it travels with the water)
function seaPaint(W, sea, hz, off, base, foam) {
  const { r, N, u, t } = W, buf = r.buf, sy = sea.y, cell = mx1(2 * u), d1 = 0.08 * N, mid = hz + (base - hz) * 0.3;
  let low = 0;
  for (let x = 0; x < N; x++) if (sy[x] > low) low = sy[x];
  for (let y = Math.max(0, hz); y < Math.min(N, low + 2); y++) buf.fill(y < mid ? MID : MID + DIM, y * N, y * N + N);
  for (let k = 1; k < 12; k++) {
    const d = 1 + k * 0.55, y = Math.round(hz + (base - hz) / d - 0.03 * N), len = (0.14 * N) / d;
    for (let j = 0; j < 3; j++) { const x = ((((hash(k, j) * 1.7 * N - off / d) % (1.7 * N)) + 1.7 * N) % (1.7 * N)) - 0.35 * N; r.rect(x, y, len, 1, LMID + DIM); }
  }
  for (let x = 0; x < N; x++) {
    const ys = sy[x];
    for (let y = Math.max(0, Math.ceil(ys)); y < N; y++) buf[y * N + x] = seaCol(y - ys, x, y, u, d1);
    if (base - ys > foam && hash(Math.floor((x + off) / cell), Math.floor(t * 3)) < 0.55) r.rect(x, ys - u * 0.5, 1, mx1(u), BRIGHT);
  }
}
// what is under the surface is seen through the water: in the box below the skin, every other cell of a thing keeps a
// dimmed colour of its own and the rest is water again
function submerge(r, sea, x0, x1, y1, u) {
  const N = r.N, buf = r.buf, sy = sea.y, d1 = 0.08 * N;
  for (let x = Math.max(0, Math.floor(x0)); x < Math.min(N, Math.ceil(x1)); x++)
    for (let y = Math.max(0, Math.ceil(sy[x] + u)), e = Math.min(N, Math.ceil(y1)); y < e; y++) { const i = y * N + x, c = buf[i], wc = seaCol(y - sy[x], x, y, u, d1); if (c !== wc) buf[i] = (x + y) & 1 ? dim(c) : wc; }
}

// ---------------------------------------------------------------------------------------------- longship
// A longship in a storm on the open sea: she rides the swell (her waterline on the surface under her stem and her stern,
// pitching with the slope between them), the long swell running at her from ahead and the wind's chop from astern; the
// square sail of sewn cloths fills and bellies forward with the wind (the bass), slackens and luffs when it drops; the
// crew rows a stroke a beat. A kick throws a sea over the bow (the spray flies up and back and the wind takes it), a
// snare flickers lightning inside the clouds (in a squall and at night) or breaks a sea along the rail, the hats tear
// spindrift off the crests, a note lights the sail and the dragon's eye. The rain slants on the same wind that fills the
// sail. The kind is the weather: grey, a squall, a gale (a heavier swell, foam on every crest), night. A drop: lightning
// strikes the sea ahead and a great swell comes out of the storm; she climbs its face bow up, tips over the crest and
// runs down its back.
const STORM_W = { grey: [3, 2, 1], squall: [1, 2, 2], gale: [1, 2, 3], night: [1, 1, 2] };
const STORM = { grey: { amp: 0.018, rain: 0, wind: 8 }, squall: { amp: 0.024, rain: 110, wind: 11 }, gale: { amp: 0.033, rain: 40, wind: 15 }, night: { amp: 0.024, rain: 70, wind: 11 } };
const SKY_STORM = [DARK, MID + DIM, MID], SKY_NIGHT = [DARK + DIM, DARK, MID + DIM], SKY_FLASH = [LMID, BRIGHT, LMID];
const longship = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { N, kind: rollW(rnd, STORM_W, bandOf(W.a)), bc: 0, on: false, off: 0, v: 0, amp: 0.02 * N, fill: 0.5, glint: 0, flick: 0, flash: 0, cx: 0, rx: 0,
      bolt: new Float32Array(72), boltN: 0, boltT: 0, spray: pool(320),
      sea: { trains: [{ l: 1.4, d: -1, p: 0, a: 0 }, { l: 0.62, d: -1, p: 1.9, a: 0 }, { l: 0.21, d: 1, p: 4.1, a: 0 }], big: null, y: null } });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a);
    if (w.N !== N) longship.init(W);
    if (f.section === 'change') w.kind = rollW(rnd, STORM_W, band);
    // the scale: the ship 25 m long in 0.5 N, gravity at that; speeds in m/s times sc
    const K = STORM[w.kind], hz = Math.round(0.4 * N), base = 0.72 * N, Ls = 0.5 * N, sc = Ls / 25, g = 9.8 * sc, bx = 0.42 * N, sea = w.sea;
    const p = frac(beatClock(w, f, dt));
    if (f.section === 'drop') { // a bolt from the cloud base to the sea ahead, a flash, the thunder; the great swell
      let x = (0.6 + 0.3 * rnd()) * N, y = 0.1 * N, n = 0;
      while (y < hz + 0.03 * N && n < 34) { w.bolt[2 * n] = x; w.bolt[2 * n + 1] = y; n++; x += (rnd() - 0.5) * 0.05 * N; y += (0.02 + 0.03 * rnd()) * N; }
      w.bolt[2 * n] = x; w.bolt[2 * n + 1] = hz + 0.03 * N; w.boltN = n + 1; w.boltT = 0.4; w.flash = 0.25;
      s.shake = Math.max(s.shake, 0.5);
      if (!sea.big) sea.big = { X: w.off + 1.15 * N, s: 0.2 * N, a: 0.15 * N, v: Math.sqrt(g * 0.1 * N) };
    }
    let kick = 0, snare = 0, hat = 0;
    for (const h of hits) {
      if (isLow(h)) kick = Math.max(kick, h.strength);
      else if (h.kind === 'snare') snare = Math.max(snare, h.strength);
      else if (h.kind === 'hat') hat = 1;
      if (isTonal(h)) w.glint = 1;
    }
    w.glint = Math.max(0, w.glint - dt * 2.5); w.flash -= dt; w.flick -= dt; w.boltT -= dt;
    if (snare > 0 && (w.kind === 'night' || w.kind === 'squall')) w.flick = 0.06 + 0.06 * snare;
    // the wind fills the sail with the bass; she makes three to seven knots, harder through the drive of each stroke
    w.fill = follow(w.fill, clamp(0.15 + 0.95 * f.rel.bassDrive), dt, 0.5);
    const vms = (1.8 + 1.2 * clamp(f.rel.midDrive) + 1.6 * w.fill) * (p < 0.45 ? 1.15 : 0.9);
    w.v = follow(w.v, vms, dt, 0.6);
    w.off += w.v * sc * dt;
    const wr = (K.wind - w.v) * sc; // the wind as it blows past her (and past the camera that keeps up with her)
    w.amp = follow(w.amp, K.amp * N * (0.6 + 0.8 * clamp(f.rel.bassDrive)), dt, 0.8);
    const tr = sea.trains, B = sea.big;
    tr[0].a = w.amp; tr[1].a = w.amp * 0.45; tr[2].a = w.amp * 0.12;
    if (B) { B.X -= B.v * dt; if (B.X - w.off < -0.7 * N) sea.big = null; }
    swell(sea, N, t, w.off, base, g);
    // the sky: a ceiling of storm cloud whose ragged underside rolls on the wind, lit from inside by a flicker and white in
    // the flash; scud driving under it, on the wind
    const lit = w.flash > 0 || w.flick > 0, ceil = lit ? LMID : w.kind === 'night' ? DARK + DIM : DARK;
    w.cx += ((wr * 0.12) / N) * dt;
    sky(r, 0, hz, w.flash > 0 ? SKY_FLASH : w.kind === 'night' ? SKY_NIGHT : SKY_STORM);
    for (let x = 0; x < N; x++) vcol(r, x, 0, (0.11 + 0.03 * Math.sin(x * 0.05 - w.cx * 9) + 0.02 * Math.sin(x * 0.13 - t * 0.4) + (w.kind === 'gale' ? 0.03 : 0)) * N, ceil);
    for (let k = 0; k < 5; k++) {
      const span = 1.6 * N, x = ((((hash(k, 8) * span + w.cx * N * (1 + 0.35 * k)) % span) + span) % span) - 0.3 * N, y = (0.16 + 0.045 * k) * N, wd = (0.12 + 0.06 * hash(k, 9)) * N;
      for (let j = 0; j < 4; j++) ell(r, x + (j - 1.5) * wd * 0.28, y - wd * 0.06 * (1 - Math.abs(j - 1.5) / 2), wd * 0.2, wd * 0.08, lit ? BRIGHT : w.kind === 'night' ? DARK : MID + DIM);
    }
    if (w.boltT > 0 && hash(7, Math.floor(w.boltT * 30)) < 0.75) for (let k = 1; k < w.boltN; k++) strk(r, w.bolt[2 * k - 2], w.bolt[2 * k - 1], w.bolt[2 * k], w.bolt[2 * k + 1], mx1(u), BRIGHT);
    seaPaint(W, sea, hz, w.off, base, w.kind === 'gale' ? w.amp * 0.5 : w.amp * 1.1);
    // she rides the surface: the waterline on the water under her stem, her middle and her stern, pitched to the slope
    // between stem and stern
    const yl = surfAt(sea, bx - 0.45 * Ls), yr = surfAt(sea, bx + 0.45 * Ls), F = setFrame(FR, bx, (yl + 2 * surfAt(sea, bx) + yr) / 4, Math.atan2(yr - yl, 0.9 * Ls), 1);
    drawShip(r, F, Ls, u, t, p, w.fill, 8, DARK, 1, IDN, false, w.glint);
    submerge(r, sea, bx - 0.62 * Ls, bx + 0.65 * Ls, base + 0.2 * N, u);
    // the sea over the bow on a kick: thrown up and back off the stem, the wind takes it, it falls back into the sea
    if (kick > 0) {
      const ex = fX(F, 0.47 * Ls, -0.11 * Ls), ey = fY(F, 0.47 * Ls, -0.11 * Ls);
      for (let n = Math.round(16 + 24 * kick); n > 0; n--) emit(w.spray, ex + (rnd() - 0.5) * 3 * u, ey, -(1 + 6 * rnd()) * sc, -(4 + 6 * rnd()) * sc * (0.6 + 0.4 * kick), 4, rnd() < 0.6 ? BRIGHT : LMID);
      s.shake = Math.max(s.shake, 0.12 * kick);
    }
    if (snare > 0 && w.flick <= 0) for (let n = 0; n < 14; n++) { const q = rnd() - 0.4, ex = fX(F, q * Ls, -0.07 * Ls), ey = fY(F, q * Ls, -0.07 * Ls); emit(w.spray, ex, ey, (rnd() - 0.5) * 2 * sc, -(2 + 4 * rnd()) * sc * snare, 3, LMID); }
    if (hat) for (let n = 0; n < 6; n++) { const x = rnd() * N, y = surfAt(sea, x); if (base - y > w.amp * 0.4) emit(w.spray, x, y - u, wr * (0.3 + 0.5 * rnd()), -(0.5 + rnd()) * sc, 1.5, LMID); }
    const P = w.spray;
    for (let i = 0; i < P.n;) {
      P.vx[i] = follow(P.vx[i], wr, dt, 0.7); P.vy[i] += g * dt; P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
      if ((P.age[i] += dt) > P.life[i] || P.x[i] < -4 || P.x[i] > N + 4 || (P.vy[i] > 0 && P.y[i] > surfAt(sea, P.x[i]))) { kill(P, i); continue; }
      r.rect(P.x[i], P.y[i], mx1(0.8 * u), mx1(0.8 * u), P.c[i]);
      i++;
    }
    const sl = (K.wind - w.v) / 9, vr = 9 * sc * 4; // drops 9 m/s down, a dozen metres off, carried on the wind as it blows past her
    w.rx += vr * sl * dt;
    if (K.rain) rain(r, N, u, t, Math.round(K.rain * u * (0.5 + 0.8 * clamp(f.rel.trebDrive))), vr, sl, w.rx, LMID + DIM);
    targets.push({ x: bx - 0.55 * Ls, y: F.oy - 0.5 * Ls, w: 1.15 * Ls, h: 0.55 * Ls });
  },
};

// ---------------------------------------------------------------------------------------------- figures
// a two-segment limb from (x, y): the first at angle a from straight down (forward, toward dir, positive), the second
// folded from it by k (sgn -1 back: a knee; 1 forward: an elbow); the joint and the end land in MX, MY and LX, LY
let LX = 0, LY = 0, MX = 0, MY = 0;
function limb(r, x, y, a, k, l1, l2, dir, wd, c, sgn) {
  MX = x + dir * l1 * Math.sin(a); MY = y + l1 * Math.cos(a);
  const b = a + sgn * k;
  LX = MX + dir * l2 * Math.sin(b); LY = MY + l2 * Math.cos(b);
  strk(r, x, y, MX, MY, wd, c);
  strk(r, MX, MY, LX, LY, wd, c);
}
// an arm from the shoulder (sx, sy) reaching for (tx, ty) as far as it goes, the elbow bent down and back of the line
// (up when `up`): the hand lands in LX, LY
function reach(r, sx, sy, tx, ty, l1, l2, dir, wd, c, up = false) {
  const dx = tx - sx, dy = ty - sy, dd = Math.hypot(dx, dy) || 1e-3, d = Math.min(dd, l1 + l2 - 1e-3), a = Math.atan2(dy, dx);
  const ea = a + (up ? -dir : dir) * Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  MX = sx + l1 * Math.cos(ea); MY = sy + l1 * Math.sin(ea); LX = sx + (dx / dd) * d; LY = sy + (dy / dd) * d;
  strk(r, sx, sy, MX, MY, wd, c);
  strk(r, MX, MY, LX, LY, wd, c);
}
// a second frame, for heads, helmets and shields that tip with a body
const FR2 = { ox: 0, oy: 0, c: 1, s: 0, d: 1 };

// ---------------------------------------------------------------------------------------------- shieldwall
// Two shield walls on an open field at dawn, a Norse line on the left (round helmets with a nose guard, round shields)
// and a Slav druzhina on the right (tall spired helmets with mail down the neck, almond shields), in three files going
// back from us (the farther smaller and higher), three ranks each: spears in front, axes behind, bows at the back, a
// plain banner in each middle file streaming on the one wind; every shadow falls away from the low sun on the left. The
// spears thrust on the kicks (out along the shaft and back), the axes swing from the shoulder on the snares, the bows
// loose on the hats (each arrow flies its parabola at the shield it was aimed at and sticks in whatever shield it
// touches, or in the ground), the axes knock on the shields on the beat. The kind is the fight: a standoff (far apart),
// a skirmish (closer, more arrows), the press (shield to shield, shoving with the bass); the walls walk to their line a
// step a beat, the foot down on the beat. A drop: they run at each other and meet with a crash and a burst of dust,
// shove to and fro, the front ranks of the side giving ground buckle, stagger back and some fall, then get up again;
// then the walls part to their lines.
const WALL_W = { standoff: [3, 1, 0], skirmish: [1, 3, 1], press: [0, 1, 3] };
const WALL_GAP = { standoff: 0.34, skirmish: 0.22, press: 0.03 };
const WFILE = [0.66, 0.82, 1]; // the files' scales, far to near
const SKY_DAWN = [DARK, MID + DIM, MID, LMID], FIELD = [MID, MID + DIM, DARK, DARK + DIM];
// the gear in unit shapes (x toward the facing, y down): the Slavs' almond shield (in h, and its front half for the two
// colour paint) and tall spired helmet with mail hanging off its back rim, the Norse round helmet with a slight peak
// (in head radii); a bearded axe head off the end of its haft (in h: along the haft, out to the blade side)
const KITE = [0, -1, 0.42, -0.9, 0.5, -0.62, 0.45, -0.2, 0.28, 0.35, 0, 1, -0.28, 0.35, -0.45, -0.2, -0.5, -0.62, -0.42, -0.9].map((v, i) => v * (i & 1 ? 0.3 : 0.26));
const KITE_F = [0, -1, 0.42, -0.9, 0.5, -0.62, 0.45, -0.2, 0.28, 0.35, 0, 1].map((v, i) => v * (i & 1 ? 0.3 : 0.26));
const HELM_N = [-1.06, 0.15, -1, -0.45, -0.7, -0.92, -0.1, -1.2, 0.2, -1.14, 0.72, -0.88, 1.03, -0.42, 1.06, 0.15];
const HELM_S = [-1, 0.1, -0.96, -0.5, -0.6, -1.05, -0.14, -1.6, 0, -2.35, 0.14, -1.6, 0.6, -1.05, 0.96, -0.5, 1, 0.1];
const MAIL = [-0.1, 0.05, -1.02, 0.05, -1.2, 1.15, -0.15, 1.3];
const AXE = [0.02, -0.025, 0.035, 0.03, 0.075, 0.12, 0.0, 0.155, -0.08, 0.13, -0.05, 0.03, -0.03, -0.025];
// the weapon arm from the shoulder (sx, sy): 0 a spear held overhand, the hand pushed out along the shaft by `th`; 1 an
// axe, the arm at `wa` from straight down with the elbow `we`, the haft going on from the forearm and the head on its
// end, the blade on the side it swings to; 2 a bow held out at `wa` (the elevation) and drawn by `th` to the cheek;
// 3 a banner pole, the plain cloth streaming downwind (+x) from its top, waving with `wv`
function wpnArm(r, sx, sy, h, dir, kind, wa, we, th, col, side, wv) {
  const ua = 0.16 * h, fa = 0.15 * h, aw = mx1(0.068 * h), metal = DARK;
  if (kind === 0) {
    const ca = Math.cos(0.17), sa = Math.sin(0.17), hx = sx + dir * (0.1 + 0.15 * th) * h, hy = sy - 0.08 * h + 0.03 * th * h;
    reach(r, sx, sy, hx, hy, ua, fa, dir, aw, col);
    strk(r, LX - dir * ca * 0.42 * h, LY - sa * 0.42 * h, LX + dir * ca * 0.72 * h, LY + sa * 0.72 * h, mx1(0.022 * h), DARK);
    const tx = LX + dir * ca * 0.72 * h, ty = LY + sa * 0.72 * h, px = -sa * 0.024 * h, py = dir * ca * 0.024 * h;
    tri3(r, tx + px, ty + py, tx - px, ty - py, tx + dir * ca * 0.09 * h, ty + sa * 0.09 * h, metal);
  } else if (kind === 1) {
    limb(r, sx, sy, wa, we, ua, fa, dir, aw, col, 1);
    const b = wa + we, ux = dir * Math.sin(b), uy = Math.cos(b), ex = LX + ux * 0.3 * h, ey = LY + uy * 0.3 * h, nx = dir > 0 ? -uy : uy, ny = dir > 0 ? ux : -ux;
    strk(r, LX - ux * 0.05 * h, LY - uy * 0.05 * h, ex, ey, mx1(0.024 * h), DARK);
    const n = AXE.length >> 1;
    for (let i = 0; i < n; i++) { PB[2 * i] = ex + (ux * AXE[2 * i] + nx * AXE[2 * i + 1]) * h; PB[2 * i + 1] = ey + (uy * AXE[2 * i] + ny * AXE[2 * i + 1]) * h; }
    fillPB(r, n, metal);
  } else if (kind === 2) {
    const ax = dir * Math.sin(wa), ay = Math.cos(wa), bx = sx + ax * 0.3 * h, by = sy + ay * 0.3 * h, ang = Math.atan2(ay, ax), R = 0.3 * h, ox = bx - ax * 0.27 * h, oy = by - ay * 0.27 * h;
    strk(r, sx, sy, bx, by, aw, col);
    circ(r, ox, oy, R, DARK, 1, ang - 0.95, ang + 0.95);
    const t1x = ox + R * Math.cos(ang - 0.95), t1y = oy + R * Math.sin(ang - 0.95), t2x = ox + R * Math.cos(ang + 0.95), t2y = oy + R * Math.sin(ang + 0.95);
    const px = lerp((t1x + t2x) / 2, sx + ax * 0.02 * h, th), py = lerp((t1y + t2y) / 2, sy + ay * 0.02 * h, th);
    r.line(t1x, t1y, px, py, LMID); r.line(px, py, t2x, t2y, LMID);
    reach(r, sx, sy, px, py, ua, fa, dir, aw, col);
    if (th > 0.3) strk(r, px, py, bx + ax * 0.06 * h, by + ay * 0.06 * h, 1, LMID); // the arrow on the string
  } else {
    reach(r, sx, sy, sx + dir * 0.12 * h, sy + 0.06 * h, ua, fa, dir, aw, col);
    const px = LX, top = LY - 1.25 * h, ch = 0.26 * h, cl = 0.55 * h;
    strk(r, px, LY + 0.3 * h, px, top, mx1(0.025 * h), DARK);
    for (let k = 0; k < 6; k++) { // the cloth in six strips, a wave running out along it from the pole, the free end flapping most
      const q0 = k / 6, q1 = (k + 1) / 6, w0 = ch * q0 * 0.35 * Math.sin(wv - q0 * 5), w1 = ch * q1 * 0.35 * Math.sin(wv - q1 * 5);
      const b0 = side ? ch : ch * (1 - q0 * 0.85), b1 = side ? ch * (k === 5 ? 0.5 : 1) : ch * (1 - q1 * 0.85);
      quad(r, px + cl * q0, top + w0, px + cl * q1, top + w1, px + cl * q1, top + w1 + b1, px + cl * q0, top + w0 + b0, side ? COOL : HOT);
    }
  }
}
// A warrior of the walls `h` tall on (x, base) facing dir: the Norse (side 0) round helmet and nose guard behind a
// round shield, the Slav (side 1) spired helmet and mail behind an almond one; the legs from the pose (l0, k0 near, l1,
// k1 far), the trunk leaned by `lean` (a fall is a lean back to the ground, the legs straight); the weapon arm (kind and
// wa, we, th as wpnArm) is the near one for the Norse, who face right, the far one for the Slavs; the shield on the
// other arm, its ellipse (and the angle it is turned by) left in SH for the arrows
const SH = { x: 0, y: 0, rx: 0, ry: 0, a: 0 };
function warrior(r, x, base, h, dir, side, kind, col, l0, k0, l1, k1, lean, wa, we, th, pat, c1, c2, wv) {
  const C = Math.cos, S = Math.sin, lw = mx1(0.09 * h), aw = mx1(0.068 * h), nearW = dir > 0, metal = DARK;
  const py = base - Math.max(0.25 * h * (C(l0) + C(l0 - k0)), 0.25 * h * (C(l1) + C(l1 - k1)));
  const ux = dir * S(lean), uy = -C(lean), fx = dir * C(lean), fy = S(lean); // up the trunk, and forward square to it
  const sx = x + 0.3 * h * ux, sy = py + 0.3 * h * uy, hx = sx + 0.1 * h * ux, hy = sy + 0.1 * h * uy, hr = 0.072 * h;
  const shx = sx - 0.2 * h * ux + 0.17 * h * fx, shy = sy - 0.2 * h * uy + 0.17 * h * fy, shield = kind < 2;
  limb(r, x, py, l1, k1, 0.25 * h, 0.25 * h, dir, lw, col, -1);
  if (!nearW) wpnArm(r, sx, sy, h, dir, kind, wa, we, th, col, side, wv);
  else if (shield) reach(r, sx, sy, shx, shy, 0.16 * h, 0.15 * h, dir, aw, col);
  strk(r, x, py, sx, sy, mx1(0.15 * h), col);
  ell(r, hx, hy, hr, hr * 1.05, col);
  setFrame(FR2, hx, hy, dir * lean, dir);
  if (side) { polyFr(r, FR2, MAIL, hr, MID + DIM); polyFr(r, FR2, HELM_S, hr, metal); }
  else { polyFr(r, FR2, HELM_N, hr, metal); strkFr(r, FR2, 0.8 * hr, -0.3 * hr, 0.8 * hr, 0.75 * hr, mx1(0.3 * hr), metal); }
  limb(r, x, py, l0, k0, 0.25 * h, 0.25 * h, dir, lw, col, -1);
  if (shield) {
    if (!nearW) reach(r, sx, sy, shx, shy, 0.16 * h, 0.15 * h, dir, aw, col);
    // the shield turns with him as he goes down: the half-widths of its outline on the screen go over from upright to lying
    const ca = Math.abs(Math.cos(lean)), sa = Math.abs(Math.sin(lean));
    SH.x = shx; SH.y = shy; SH.a = dir * lean; SH.rx = h * Math.hypot(0.13 * ca, 0.28 * sa); SH.ry = h * Math.hypot(0.13 * sa, 0.28 * ca);
    if (side) {
      setFrame(FR2, shx, shy, dir * lean, dir);
      polyFr(r, FR2, KITE, h * 1.12, DARK); polyFr(r, FR2, KITE, h, c1);
      if (pat & 1) polyFr(r, FR2, KITE_F, h, c2);
      ell(r, fX(FR2, 0, -0.07 * h), fY(FR2, 0, -0.07 * h), mx1(0.032 * h), mx1(0.032 * h), BRIGHT);
    } else roundShield(r, shx, shy, h * Math.hypot(0.12 * ca, 0.24 * sa), h * Math.hypot(0.12 * sa, 0.24 * ca), c1, c2, pat, DARK, BRIGHT);
  }
  if (nearW) wpnArm(r, sx, sy, h, dir, kind, wa, we, th, col, side, wv);
}
const SW_C1 = [HOT, COOL, LMID, HOT], SW_C2 = [LMID, DARK, HOT, DARK];
const shieldwall = {
  init(W) {
    const { w, rnd, N } = W, kind = rollW(rnd, WALL_W, bandOf(W.a)), F = (n) => new Float32Array(n);
    Object.assign(w, { N, kind, bc: 0, on: false, gap: (WALL_GAP[kind] + 0.08) * N, ph: 0, mix: 0, push: 0, clash: -1, clashT: 0,
      th: F(18), sw: F(18), st: F(18), fa: F(18), fv: F(18), fT: F(18), dr: F(18), tg: new Int8Array(18), pat: Uint8Array.from({ length: 18 }, () => Math.floor(rnd() * 4)),
      shx: F(18), shy: F(18), shr: F(18), shq: F(18), sha: F(18), arrows: pool(60), stuck: pool(80), dust: pool(48) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a);
    if (w.N !== N) shieldwall.init(W);
    if (f.section === 'change') w.kind = rollW(rnd, WALL_W, band);
    if (f.section === 'drop' && w.clash < 0) { w.clash = 0; w.clashT = 0; }
    const hz = Math.round(0.55 * N), cx = 0.5 * N, H0 = 0.25 * N, g = gOf(H0), S1 = H0 * Math.sin(0.42) * 0.996, was = w.bc, bc = beatClock(w, f, dt);
    const dB = was > 0 ? clamp(bc - was, 0, 0.5) : 0, wind = 0.04 * N, wv = t * 7 + f.rel.trebClock * 2;
    // the walls' march: a step a beat to their line (two at the charge), the foot down on the beat
    let ks = 0;
    if (w.clash === 0) { ks = 2; w.gap -= 2 * 2 * S1 * dB; if (w.gap <= 0) { w.gap = 0; w.clash = 1; w.clashT = 0; s.shake = Math.max(s.shake, 0.7); for (let n = 0; n < 30; n++) emit(w.dust, cx + (rnd() - 0.5) * 0.3 * N, hz + (0.25 + 0.13 * rnd()) * N, (rnd() - 0.5) * 0.1 * N, -rnd() * 0.04 * N, 3, LMID, 0.03 * N); } }
    else if (w.clash === 1) { w.clashT += dt; if (w.clashT > 9) w.clash = 2; }
    else {
      const e = w.gap - WALL_GAP[w.kind] * N;
      if (Math.abs(e) > 2 * S1 * dB + 0.5) { ks = e > 0 ? 1 : -1; w.gap -= 2 * ks * S1 * dB; } else if (w.clash === 2) w.clash = -1;
    }
    w.mix = follow(w.mix, ks ? 1 : 0, dt, 0.12);
    if (ks) w.ph = Math.sign(ks) * Math.PI * (Math.abs(ks) * bc + 0.5);
    // the shove: the line where the shields meet rocks with the bass; the side giving ground buckles on the kicks
    const pushing = w.clash === 1 || (w.kind === 'press' && w.gap < 0.05 * N);
    w.push = follow(w.push, pushing ? 0.035 * N * Math.sin(f.rel.bassClock * 1.3 + t * 0.6) : 0, dt, 0.3);
    let kick = 0;
    for (const h of hits) {
      if (isLow(h)) { kick = Math.max(kick, h.strength); for (let i = 0; i < 18; i++) if (i % 3 === 0 && rnd() < 0.7 && (w.th[i] <= 0 || w.th[i] > 0.34)) w.th[i] = 0.001; }
      else if (h.kind === 'snare') { for (let i = 0; i < 18; i++) if (i % 3 === 1 && rnd() < 0.75 && w.sw[i] <= 0) w.sw[i] = 0.001; }
      else if (h.kind === 'hat') { const i = Math.floor(rnd() * 6) * 3 + 2; if (i !== 8 && i !== 11 && w.dr[i] <= 0 && w.fa[i] < 0.05) { w.dr[i] = 0.001; w.tg[i] = Math.floor(rnd() * 2); } } // (8 and 11 carry the banners)
    }
    if (kick > 0 && pushing) { // the side giving ground: a man of its front rank is shoved back a step, or one in three goes down
      const side = w.push > 0 ? 1 : 0, i = Math.floor(rnd() * 3) * 6 + side * 3;
      if (w.st[i] <= 0 && w.fT[i] <= 0 && w.fa[i] < 0.05) { if (rnd() < 0.35) { w.fT[i] = 3.5; w.fv[i] = 1.2; } else w.st[i] = 0.001; s.shake = Math.max(s.shake, 0.25 * kick); }
    }
    // the sky at dawn, the sun low on the left; the field, darker toward us, its tufts
    sky(r, 0, hz, SKY_DAWN);
    hazeE(r, 0.12 * N, hz, 0.25 * N, 0.12 * N, HOT, 0.8);
    ell(r, 0.12 * N, hz - 0.03 * N, 0.04 * N, 0.04 * N, BRIGHT);
    for (let k = 0; k < 4; k++) r.rect(((k * 0.37 * N + t * 0.005 * N * (1 + 0.2 * k)) % (1.4 * N)) - 0.3 * N, (0.12 + 0.07 * k) * N, (0.16 + 0.05 * k) * N, mx1(u), LMID + DIM); // cloud bars on the wind
    sky(r, hz, N, FIELD);
    for (let k = 0; k < 70; k++) { const y = hz + 2 + hash(k, 3) * (N - hz - 2), sc = (y - hz) / (0.38 * N); r.rect(hash(k, 4) * N, y - 1.5 * u * sc, mx1(u * 0.6 * sc), mx1(1.5 * u * sc), DARK); }
    const beatK = Math.exp(-frac(bc) * 9); // the knock on the shields, right after the beat
    for (let fi = 0; fi < 3; fi++) {
      const sc = WFILE[fi], base = hz + 0.38 * N * sc, h = H0 * sc, col = fi === 0 ? FIG + DIM : FIG, gf = g * sc;
      for (let side = 0; side < 2; side++) for (let rank = 2; rank >= 0; rank--) {
        const i = fi * 6 + side * 3 + rank, dir = side ? -1 : 1, sgn = side ? 1 : -1, kind = rank === 2 && fi === 1 ? 3 : rank;
        // the man's own state: a thrust, a swing, a draw of the bow, a shove back, a fall and getting up
        if (w.th[i] > 0 && (w.th[i] += dt) > 0.4) w.th[i] = 0;
        if (w.sw[i] > 0 && (w.sw[i] += dt) > 0.6) w.sw[i] = 0;
        if (w.st[i] > 0 && (w.st[i] += dt) > 3.2) w.st[i] = 0;
        if (w.fT[i] > 0) w.fT[i] -= dt;
        // going down he topples back about his heels under his file's gravity (a rod: θ'' = 3 g sin θ / 2 h), quicker as he
        // goes, and lies still; getting up is his own doing
        if (w.fT[i] > 1.2) { if (w.fa[i] < Math.PI / 2) { w.fv[i] += ((1.5 * gf) / h) * Math.sin(Math.max(0.1, w.fa[i])) * dt; w.fa[i] = Math.min(Math.PI / 2, w.fa[i] + w.fv[i] * dt); } }
        else { w.fv[i] = 0; w.fa[i] = follow(w.fa[i], 0, dt, 0.35); }
        const th = w.th[i] <= 0 ? 0 : w.th[i] < 0.08 ? w.th[i] / 0.08 : 1 - (w.th[i] - 0.08) / 0.32;
        const sp = w.sw[i], wa = kind !== 1 ? 0 : sp <= 0 ? 2.75 - 1.3 * beatK : sp < 0.18 ? lerp(2.75, 3.9, smooth(sp / 0.18)) : sp < 0.3 ? lerp(3.9, 1.25, (sp - 0.18) / 0.12) : lerp(1.25, 2.75, smooth((sp - 0.3) / 0.3));
        // the shove puts him back quickly (3 m/s at first) and he comes home slowly, without a jump (a·e^(1-a), a in units of
        // 0.45 s)
        const sq = w.st[i] / 0.45, stg = sq > 0 ? sq * Math.exp(1 - sq) : 0, D = 0.08 * N * stg;
        const X = sgn * (w.gap / 2 + 0.07 * N + rank * 0.11 * N) + w.push + (fi - 1) * 0.03 * N - dir * D, x0 = cx + X * sc;
        // the legs: walking (the phase), braced (the shove), stepping back and home again as he is shoved (the gait run by
        // how far he has gone, so the planted foot stays put), or straight as he goes down
        const m = w.mix, gl = 0.42 * tri(w.ph + (side ? Math.PI : 0)), gk = 0.12 + 0.6 * Math.max(0, Math.cos(w.ph + (side ? Math.PI : 0)));
        const brace = pushing && rank === 0 ? 1 : 0, fa = w.fa[i];
        let l0 = lerp(0.26 + 0.2 * brace, gl, m), k0 = lerp(0.12 + 0.3 * brace, gk, m), l1 = lerp(-0.3 - 0.2 * brace, -gl, m), k1 = lerp(0.05, 0.12 + 0.6 * Math.max(0, -Math.cos(w.ph + (side ? Math.PI : 0))), m);
        if (stg > 0.01) {
          const q = Math.PI / 2 - (Math.PI * D) / S1 + (side ? Math.PI : 0), ms = smooth(stg * 3);
          l0 = lerp(l0, 0.42 * tri(q), ms); k0 = lerp(k0, 0.12 + 0.6 * Math.max(0, Math.cos(q)), ms); l1 = lerp(l1, -0.42 * tri(q), ms); k1 = lerp(k1, 0.12 + 0.6 * Math.max(0, -Math.cos(q)), ms);
        }
        let lean = 0.06 + 0.3 * brace - 0.35 * stg, xs = x0;
        if (fa > 0.02) { l0 = l1 = fa; k0 = k1 = 0; lean = -fa; xs = x0 - dir * 0.5 * h * Math.sin(fa); }
        // the archer draws and looses at a shield of the other wall in his own file, on a parabola under this file's
        // gravity, aimed to hit it in a second or so
        let we = kind === 1 ? 0.25 : 0, bw = 0, drw = 0;
        if (kind === 2) {
          bw = 2.25;
          if (w.dr[i] > 0) {
            w.dr[i] += dt; drw = smooth(w.dr[i] / 0.3);
            const j = fi * 6 + (1 - side) * 3 + w.tg[i], tx = w.shx[j], ty = w.shy[j], hx = xs + dir * 0.2 * h, hy = base - 0.78 * h, T = 1.1, vx = (tx - hx) / T, vy = (ty - hy) / T - 0.5 * gf * T;
            bw = Math.PI / 2 + Math.atan2(-vy, Math.abs(vx)); // held out along the line it will leave on
            if (w.dr[i] > 0.32) { emit(w.arrows, hx, hy, vx, vy, 4, side, fi); w.dr[i] = -0.5; }
          } else if (w.dr[i] < 0) w.dr[i] = Math.min(0, w.dr[i] + dt);
        }
        // his shadow on the ground, cast away from the low sun ahead: along the line from the sun's foot on the horizon
        // through his feet, shorter on the screen the farther his file, going as he goes down; then him
        const shk = 0.4 * sc * Math.cos(fa), stx = x0 + (x0 - 0.12 * N) * shk, sty = base + (base - hz) * shk, shw = 0.05 * h;
        if (shk > 0.01) quad(r, x0 - shw, base, x0 + shw, base, stx + shw, sty, stx - shw, sty, DARK + DIM);
        warrior(r, xs, base, h, dir, side, kind, col, l0, k0, l1, k1, lean, kind === 2 ? bw : wa, we, kind === 2 ? drw : th, w.pat[i], SW_C1[w.pat[i]], SW_C2[w.pat[i]], wv + i);
        if (kind < 2) { w.shx[i] = SH.x; w.shy[i] = SH.y; w.shr[i] = SH.rx; w.shq[i] = SH.ry; w.sha[i] = SH.a; }
        // the arrows stuck in his shield go where it goes and turn as it turns (they are kept in its own frame)
        const P = w.stuck, ca = Math.cos(SH.a), sa = Math.sin(SH.a);
        if (kind < 2) for (let k = 0; k < P.n; k++) if (P.s[k] === i) { const ax = SH.x + P.x[k] * ca - P.y[k] * sa, ay = SH.y + P.x[k] * sa + P.y[k] * ca, qx = ax - (P.vx[k] * ca - P.vy[k] * sa) * 0.14 * h, qy = ay - (P.vx[k] * sa + P.vy[k] * ca) * 0.14 * h; r.line(ax, ay, qx, qy, LMID); r.set(qx, qy, BRIGHT); }
        if (fi === 2 && side === 0 && rank === 0) targets.push({ x: xs - 0.2 * h, y: base - h * 1.1, w: 0.6 * h, h: h * 1.1 });
      }
      // the arrows of this file in flight: along their parabola, the shaft along the way they go; one that touches a
      // shield of the other wall sticks in it where it touched, one that reaches the ground sticks there
      const A = w.arrows;
      for (let k = 0; k < A.n;) {
        if (A.s[k] !== fi) { k++; continue; }
        A.x[k] += A.vx[k] * dt; A.y[k] += A.vy[k] * dt + 0.5 * gf * dt * dt; A.vy[k] += gf * dt;
        const v = Math.hypot(A.vx[k], A.vy[k]) || 1, ex = A.vx[k] / v, ey = A.vy[k] / v, tipx = A.x[k] + ex * 0.06 * h, tipy = A.y[k] + ey * 0.06 * h;
        let hit = -1;
        for (let j = fi * 6 + (1 - A.c[k]) * 3, je = j + 2; j < je; j++) { const dx = (tipx - w.shx[j]) / w.shr[j], dy = (tipy - w.shy[j]) / w.shq[j]; if (dx * dx + dy * dy < 1) { hit = j; break; } }
        if (hit >= 0) { // stuck where it touched, kept in the shield's own frame
          const ca = Math.cos(w.sha[hit]), sa = Math.sin(w.sha[hit]), dx = tipx - w.shx[hit], dy = tipy - w.shy[hit];
          emit(w.stuck, dx * ca + dy * sa, dy * ca - dx * sa, ex * ca + ey * sa, ey * ca - ex * sa, 6, LMID, hit);
          kill(A, k); continue;
        }
        if (tipy >= base) { emit(w.stuck, tipx, Math.min(tipy, base), ex, ey, 4, LMID, -1 - fi); kill(A, k); continue; }
        if ((A.age[k] += dt) > A.life[k]) { kill(A, k); continue; }
        r.line(A.x[k] - ex * 0.16 * h, A.y[k] - ey * 0.16 * h, tipx, tipy, LMID);
        k++;
      }
      // the arrows in the ground of this file
      const P = w.stuck;
      for (let k = 0; k < P.n; k++) if (P.s[k] === -1 - fi) r.line(P.x[k], P.y[k], P.x[k] - P.vx[k] * 0.12 * h, P.y[k] - P.vy[k] * 0.12 * h, LMID);
    }
    for (let k = 0; k < w.stuck.n;) { if ((w.stuck.age[k] += dt) > w.stuck.life[k]) kill(w.stuck, k); else k++; }
    // dust off the clash and the running feet, drifting on the wind
    if (w.clash === 0) for (let n = spawns(rnd, 20, dt); n > 0; n--) emit(w.dust, cx + (rnd() < 0.5 ? -1 : 1) * (w.gap / 2 + 0.12 * N), hz + (0.26 + 0.12 * rnd()) * N, 0, 0, 2, LMID, 0.01 * N);
    plume(W, w.dust, wind, 1.2, 4, 0.5, 7 * u);
  },
};

// ---------------------------------------------------------------------------------------------- pines and wolves
// a spruce `hgt` tall and `wd` wide on (x, gy): a trunk, six tiers of boughs (each a triangle drooping at the tips, the
// lower ones wider), the snow lying on each tier by `snow` (0..1); `lift` springs the boughs' tips up
function pine(r, x, gy, hgt, wd, col, scol, snow, lift = 0) {
  if (hgt < 2) return;
  vcol(r, x, gy - hgt * 0.3, gy, col);
  if (wd > 6) r.rect(x - wd * 0.04, gy - hgt * 0.3, wd * 0.08, hgt * 0.3, col);
  for (let k = 0; k < 6; k++) {
    const q = (k + 1) / 6, ay = gy - hgt + k * hgt * 0.13, by = ay + hgt * 0.22, hw = wd * (0.18 + 0.82 * q) * 0.5, tip = by - lift * hgt * 0.03 * q;
    tri3(r, x, ay, x - hw, tip, x + hw, tip, col);
    if (snow > 0.05) tri3(r, x, ay + hgt * 0.01, x - hw * 0.8 * snow, ay + (tip - ay) * 0.55, x + hw * 0.8 * snow, ay + (tip - ay) * 0.55, scol);
  }
}
// A wolf `h` high at the shoulder trotting on (x, g) facing dir, `k` of its length seen across (foreshortened as it runs
// toward or away from us): the diagonal pairs of legs together, each foot planted while it is down (the foot's swing a
// triangle wave of the phase: its stride is `A` each way); the head carried low, the ears up, a bushy tail; `snarl`
// drops the head and opens the jaws; `eye` lights the eye
const WOLF_LEGS = [0.3, Math.PI, -0.34, 0, 0.36, 0, -0.28, Math.PI]; // where along the body, the phase: far fore, far hind, near fore, near hind
function wolf(r, x, g, h, col, ph, dir, k, A, snarl, eye) {
  const bl = h * 1.3 * k, by = g - h * 0.66, lw = mx1(h * 0.13), far = dim(col);
  for (let j = 0; j < 8; j += 2) {
    const q = ph + WOLF_LEGS[j + 1], sw = A * tri(q), lift = Math.max(0, Math.cos(q)) * h * 0.12, hx = x + dir * WOLF_LEGS[j] * bl;
    strk(r, hx, by + h * 0.12, hx + dir * sw, g - lift, lw, j < 4 ? far : col);
  }
  ell(r, x - dir * bl * 0.06, by, bl * 0.46 + h * 0.06, h * 0.22, col);
  ell(r, x + dir * bl * 0.26, by - h * 0.04, h * 0.26, h * 0.3, col); // the deep chest and the ruff
  const nx = x + dir * (bl * 0.42 + h * 0.08), ny = by - h * (0.22 - 0.2 * snarl), hx = nx + dir * h * 0.14, hy = ny - h * (0.02 - 0.08 * snarl);
  strk(r, x + dir * bl * 0.28, by - h * 0.1, nx, ny, mx1(h * 0.28), col);
  ell(r, hx, hy, h * 0.19, h * 0.16, col);
  quad(r, hx + dir * h * 0.08, hy - h * 0.08, hx + dir * h * 0.4, hy + h * 0.02 - snarl * h * 0.05, hx + dir * h * 0.38, hy + h * 0.08, hx + dir * h * 0.08, hy + h * 0.1, col); // the long muzzle
  if (snarl > 0.3) tri3(r, hx + dir * h * 0.1, hy + h * 0.1, hx + dir * h * 0.34, hy + h * 0.18, hx + dir * h * 0.1, hy + h * 0.18, col); // the jaw dropped
  tri3(r, hx - dir * h * 0.12, hy - h * 0.08, hx - dir * h * 0.04, hy - h * 0.38, hx + dir * h * 0.04, hy - h * 0.1, col); // the ears
  tri3(r, hx - dir * h * 0.02, hy - h * 0.1, hx + dir * h * 0.06, hy - h * 0.36, hx + dir * h * 0.11, hy - h * 0.08, far);
  r.set(hx + dir * h * 0.09, hy - h * 0.04, eye > 0.3 ? COOL : dim(far));
  const tx = x - dir * (bl * 0.5 + h * 0.06), ty = by - h * 0.1;
  quad(r, tx + dir * h * 0.06, ty, tx - dir * h * 0.18, ty + h * 0.2, tx - dir * h * 0.14, ty + h * 0.5, tx + dir * h * 0.04, ty + h * 0.2, col); // the bushy tail, hanging
}

// ---------------------------------------------------------------------------------------------- berserker
// A lone warrior in a bear's pelt in a snowy clearing ringed by spruces, seen a little from above (a pinhole camera: the
// ground of every depth on its row, far things smaller and higher), the bear's head worn as a hood with its ears and
// muzzle over his brow, a long axe in both hands; the shadows laid toward us away from the moon (underfoot in the diffuse
// light of the other hours). A breath
// clouds out of him on every beat and rises slowly on the cold air, slowing; the axe swings from the shoulders on the
// kicks, a quick arc down into the snow in front of him that throws it up in a spray; four wolves circle at the edge of
// the clearing at a trot, a stride a beat (each foot planted while it is down), the near ones bigger and lower, leaving
// a trodden ring; a snare sends one in at him in a lunge with its jaws open, a hat lifts the snow off the ground in a
// gust, a note lights the eyes. The kind is the hour and the weather: dusk, a blizzard, moonlight, a grey day. A drop:
// he roars, head back and arms wide; a shockwave runs out over the snow and as it reaches each spruce the snow drops off
// its boughs in clumps that fall under gravity and burst on the ground, the boughs springing up after.
const BEAR_W = { dusk: [2, 2, 2], blizzard: [1, 2, 3], moon: [2, 1, 1], grey: [2, 2, 1] };
const BEAR = { dusk: { snow: 50, wind: 0.6 }, blizzard: { snow: 220, wind: 3.5 }, moon: { snow: 25, wind: 0.2 }, grey: { snow: 90, wind: 1.2 } };
const SKY_BEAR = [DARK + DIM, DARK, MID], SNOWFIELD = [MID, LMID, LMID, BRIGHT];
// the man: the bear's head over his own (in head heights: the skull, the ears, the muzzle forward over the brow), the
// pelt hanging down his back from the shoulders to the knees; the axe's head off the end of the haft
const BEARHOOD = [-0.95, 0.2, -1.05, -0.5, -0.6, -1.05, 0.2, -1.1, 0.7, -0.75, 1.55, -0.55, 1.6, -0.2, 0.95, -0.1, 0.85, 0.15];
const BIGAXE = [0.03, -0.04, 0.05, 0.04, 0.11, 0.2, -0.02, 0.24, -0.14, 0.2, -0.08, 0.05, -0.05, -0.04];
const berserker = {
  init(W) {
    const { w, rnd, N } = W, kind = rollW(rnd, BEAR_W, bandOf(W.a));
    // the ring of spruces round the clearing: the far side and the flanks (none between us and him), two close at the
    // edges of the picture
    const P = [];
    for (let k = 0; k < 11; k++) { const th = -1.75 + (3.5 * k) / 10 + (rnd() - 0.5) * 0.15, R = 7 + rnd() * 1.5; P.push(R * Math.sin(th), 10 + R * Math.cos(th), 6 + 2.5 * rnd()); }
    P.push(-2.6, 4.6, 9, 2.7, 4.8, 9);
    Object.assign(w, { N, kind, bc: 0, on: false, pines: Float32Array.from(P), np: P.length / 3, load: new Float32Array(13).fill(1), lift: new Float32Array(13), liftV: new Float32Array(13),
      wolves: Float32Array.from([0, 1.6, 3.2, 4.7].map((a) => a + rnd() * 0.3)), lunge: new Float32Array(4), wr: new Float32Array(4), sw: 0, roar: -1, ring: -1, eye: 0, gust: 0,
      breath: pool(24), snow: pool(220), clumps: pool(320), kick: pool(512), order: new Int8Array(18), dep: new Float32Array(18) }); // (every spruce sheds 24 clumps, each bursts in 3)
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a);
    if (w.N !== N) berserker.init(W);
    if (f.section === 'change') w.kind = rollW(rnd, BEAR_W, band);
    if (f.section === 'drop' && w.roar < 0) { w.roar = 0; w.ring = 0; s.shake = Math.max(s.shake, 0.5); }
    // the camera: 3.5 m up, the horizon at 0.2 N, F = 1.3 N; X across and z ahead in metres
    const K = BEAR[w.kind], hor = 0.2 * N, cx = 0.5 * N, Fc = 1.3 * N, Hc = 3.5, gy = (z) => hor + (Hc * Fc) / z, sxp = (X, z) => cx + (X * Fc) / z;
    const zc = 10, sM = Fc / zc, hM = 1.9 * sM, base = gy(zc), xM = cx - 0.06 * N, XM = ((xM - cx) * zc) / Fc, wind = (K.wind + 2 * clamp(f.rel.midDrive)) * sM * 0.3;
    const bc = beatClock(w, f, dt);
    let kick = 0;
    for (const h of hits) {
      if (isLow(h)) kick = Math.max(kick, h.strength);
      else if (h.kind === 'snare') { const k = Math.floor(rnd() * 4); if (w.lunge[k] <= 0) w.lunge[k] = 0.001; }
      else if (h.kind === 'hat') w.gust = 1;
      if (isTonal(h)) w.eye = 1;
    }
    w.eye = Math.max(0, w.eye - dt * 1.5);
    if (kick > 0 && (w.sw <= 0 || w.sw > 0.64) && w.roar < 0) w.sw = 0.001; // a new swing once the axe is back up
    // the swing: from the raised guard (3.5 rad from straight down) down through the arc into the snow in 0.12 s (the
    // head touches the ground at 0.7 rad: the shoulders 0.8 h up, the reach 1.05 h), held, then back up
    let arm = 3.5;
    if (w.sw > 0) {
      const q = (w.sw += dt);
      arm = q < 0.12 ? lerp(3.5, 0.7, (q / 0.12) ** 2) : q < 0.22 ? 0.7 : lerp(0.7, 3.5, smooth((q - 0.22) / 0.5));
      if (q >= 0.12 && q - dt < 0.12) { // the axe bites the snow: it flies up and forward
        const ix = xM + 0.3 * hM * Math.sin(0.25) + Math.sin(0.7) * 1.05 * hM, iy = base; // under the head at the blow (he leans 0.25 into it)
        for (let n = 0; n < Math.round(20 + 30 * kick); n++) emit(w.kick, ix + (rnd() - 0.5) * 0.04 * hM, iy - 1, (0.3 + rnd()) * 2.2 * sM * (rnd() < 0.8 ? 1 : -1), -(1.5 + 3.5 * rnd()) * sM, 2.5, rnd() < 0.6 ? BRIGHT : LMID, iy);
        s.shake = Math.max(s.shake, 0.2 * kick);
      }
      if (q > 0.72) w.sw = 0;
    }
    // the roar: the shockwave runs out over the snow at 14 m/s; each spruce it reaches sheds its snow
    let roar = 0;
    if (w.roar >= 0) { w.roar += dt; roar = smooth(Math.min(w.roar / 0.3, (3.5 - w.roar) / 0.6)); if (w.roar > 3.5) w.roar = -1; }
    const R = w.ring >= 0 ? (w.ring += dt) * 14 : -1;
    if (w.ring > 1.6) w.ring = -1;
    // the sky, the moon or the dusk, the far forest; the snow, the trodden ring the wolves keep to
    sky(r, 0, hor + 0.02 * N, SKY_BEAR);
    if (w.kind === 'moon') { ell(r, 0.2 * N, 0.08 * N, 0.04 * N, 0.04 * N, BRIGHT); stars(r, 30, 9, 0, N, 0, hor, LMID, Math.floor(t * 2)); }
    else if (w.kind === 'dusk') hazeE(r, 0.15 * N, hor, 0.35 * N, 0.1 * N, HOT, 0.7);
    for (let x = 0; x < N; x++) { const X = ((x - cx) * 34) / Fc, q = X / 1.6, i = Math.floor(q), e = q - i, top = 7 + 4 * hash(i, 5); vcol(r, x, gy(34) - ((top * (1 - Math.abs(2 * e - 1)) + 2) * Fc) / 34, gy(34) + 1, DARK + DIM); }
    sky(r, gy(34), N, SNOWFIELD);
    for (let k = 0; k < 48; k++) { const a = (k / 48) * TAU, X = XM + 3.5 * Math.sin(a), z = zc - 3.5 * Math.cos(a); r.rect(sxp(X, z) - (0.15 * Fc) / z, gy(z), mx1((0.3 * Fc) / z), mx1((0.08 * Fc) / z), MID); }
    if (R > 0) for (let k = 0; k < 64; k++) { // the shockwave on the snow, a circle round him seen in perspective
      const a = (k / 64) * TAU, z = zc + R * Math.cos(a);
      if (z > 1.5) r.rect(sxp(XM + R * Math.sin(a), z), gy(z) - 1, mx1((0.4 * Fc) / z), mx1((0.1 * Fc) / z), R < 10 ? BRIGHT : LMID);
    }
    // everything standing, far to near: the spruces, the wolves, him
    const nP = w.np, O = w.order, D = w.dep;
    for (let i = 0; i < nP; i++) D[i] = w.pines[3 * i + 1];
    // the wolves trot round the ring a stride a beat, 1.1 m a beat on whatever ring they are on (the phase is the beat
    // clock, the way round the stride for it, so the planted feet stay put), out of it when they shy, in on a lunge
    for (let k = 0; k < 4; k++) {
      const lq = w.lunge[k] > 0 ? (w.lunge[k] += dt) : 0, ln = lq <= 0 ? 0 : lq < 0.25 ? smooth(lq / 0.25) : 1 - smooth((lq - 0.25) / 0.6);
      if (lq > 0.85) w.lunge[k] = 0;
      w.wr[k] = follow(w.wr[k], R > 0 && Math.abs(R - 3.5) < 2 ? 2.5 : 0, dt, R > 0 ? 0.15 : 1.2); // they shy from the shockwave
      const Rw = 3.5 + w.wr[k] - 2.2 * ln;
      w.wolves[k] += ((1.1 * bps(f)) / Rw) * dt;
      D[nP + k] = zc - Rw * Math.cos(w.wolves[k]);
    }
    D[nP + 4] = zc;
    const n = nP + 5;
    for (let i = 0; i < n; i++) { let j = i; for (; j > 0 && D[O[j - 1]] < D[i]; j--) O[j] = O[j - 1]; O[j] = i; }
    // the shadows: in the moonlight cast away from the moon along the snow (1.7 times as long as the thing is tall: it
    // stands higher than it looks), seen through the camera; in the diffuse light of the other hours a patch underfoot
    const moon = w.kind === 'moon', mX = 0.225, mZ = -0.974; // away from the moon on the ground, its bearing from the camera
    const shade = (X, z, ht, wd) => {
      if (!moon) { ell(r, sxp(X, z), gy(z), (wd * Fc) / z, mx1((0.05 * Fc) / z), MID); return; }
      const L = 1.7 * ht, z1 = Math.max(1.5, z + mZ * L);
      strk(r, sxp(X, z), gy(z), sxp(X + mX * L, z1), gy(z1), mx1((wd * Fc) / z), MID);
    };
    for (let oi = 0; oi < n; oi++) {
      const i = O[oi];
      if (i < nP) { // a spruce: shed when the shockwave reaches it, the boughs springing back up, the snow coming back
        const X = w.pines[3 * i], z = w.pines[3 * i + 1], ht = w.pines[3 * i + 2], d = Math.hypot(X - XM, z - zc), sc = Fc / z, x = sxp(X, z), y0 = gy(z);
        if (R > d && w.load[i] > 0.5) {
          for (let k = 0; k < 6; k++) for (let m = 0; m < 4; m++) { const q = (k + 1) / 6, hw = 1.6 * (0.18 + 0.82 * q) * 0.5; emit(w.clumps, x + (rnd() - 0.5) * 1.6 * hw * sc, y0 - ht * sc * (1 - k * 0.13 - 0.1), (rnd() - 0.5) * 0.6 * sc, -rnd() * 0.5 * sc, 4, BRIGHT, i); }
          w.load[i] = 0; w.liftV[i] = 3.5;
        }
        w.liftV[i] += (-30 * w.lift[i] - 4 * w.liftV[i]) * dt; w.lift[i] += w.liftV[i] * dt;
        w.load[i] = Math.min(1, w.load[i] + dt / 25);
        pine(r, x, y0, ht * sc, 3.2 * sc, DARK, BRIGHT, w.load[i], w.lift[i]);
        const C = w.clumps; // its clumps falling, accelerating, bursting where they land on its ground
        for (let k = 0; k < C.n;) {
          if (C.s[k] !== i) { k++; continue; }
          C.vy[k] += 9.8 * sc * dt; C.x[k] += C.vx[k] * dt; C.y[k] += C.vy[k] * dt;
          if (C.y[k] >= y0) { for (let m = 0; m < 3; m++) emit(w.kick, C.x[k], y0 - 1, (rnd() - 0.5) * 1.5 * sc, -rnd() * 1.2 * sc, 0.6, LMID, y0); kill(C, k); continue; }
          r.rect(C.x[k], C.y[k], mx1(0.25 * sc), mx1(0.25 * sc), BRIGHT);
          k++;
        }
      } else if (i < nP + 4) { // a wolf
        const k = i - nP, lq = w.lunge[k], ln = lq <= 0 ? 0 : lq < 0.25 ? smooth(lq / 0.25) : 1 - smooth((lq - 0.25) / 0.6), Rw = 3.5 + w.wr[k] - 2.2 * ln, a = w.wolves[k];
        const X = XM + Rw * Math.sin(a), z = zc - Rw * Math.cos(a), sc = Fc / z, x = sxp(X, z), dirX = sxp(XM + Rw * Math.sin(a + 0.05), zc - Rw * Math.cos(a + 0.05)) - x, kk = Math.max(0.35, Math.abs(Math.cos(a)));
        shade(X, z, 0.75, 0.6 * kk);
        wolf(r, x, gy(z), 0.75 * sc, FIG + DIM, TAU * bc + k * 1.3, ln > 0.05 ? (X > XM ? -1 : 1) : dirX >= 0 ? 1 : -1, ln > 0.05 ? 1 : kk, (1.1 / 4) * sc * kk, ln, w.eye);
      } else { // him
        shade(XM, zc, 1.9, 0.5);
        const dir = 1, lw = mx1(0.1 * hM), py = base - 0.47 * hM, breathe = Math.sin(t * 2.2) * 0.006 * hM * (0.5 + f.level), lean = roar > 0 ? -0.25 * roar : arm < 1.5 ? 0.25 : 0.05;
        const sx = xM + 0.3 * hM * Math.sin(lean), sy = py - 0.3 * hM * Math.cos(lean) - breathe, hx = sx + 0.1 * hM * Math.sin(lean - 0.4 * roar), hy = sy - 0.1 * hM * Math.cos(lean - 0.4 * roar);
        limb(r, xM, py, -0.32, 0.08, 0.25 * hM, 0.25 * hM, dir, lw, dim(FIG), -1);
        // the pelt down his back from the shoulders to the knees, swinging out with the swing
        quad(r, sx - 0.06 * hM, sy - 0.02 * hM, sx - 0.12 * hM - 0.05 * hM * Math.sin(arm), py - 0.02 * hM, xM - 0.2 * hM - 0.04 * hM * Math.sin(arm), py + 0.28 * hM, xM - 0.04 * hM, py + 0.1 * hM, DARK);
        strk(r, xM, py, sx, sy, mx1(0.17 * hM), FIG);
        limb(r, xM, py, 0.38, 0.12, 0.25 * hM, 0.25 * hM, dir, lw, FIG, -1);
        // the arms and the axe: both hands on the haft, swung about the shoulders (the roar: the axe held up, the arms wide)
        const a0 = roar > 0 ? lerp(arm, 2.7, roar) : arm, ax = Math.sin(a0), ay = Math.cos(a0), hx1 = sx + ax * 0.31 * hM, hy1 = sy + ay * 0.31 * hM;
        if (roar > 0.2) limb(r, sx, sy, -2.3 * roar, 0.3, 0.16 * hM, 0.15 * hM, dir, mx1(0.075 * hM), dim(FIG), 1);
        else strk(r, sx, sy, hx1 - ax * 0.05 * hM, hy1 - ay * 0.05 * hM, mx1(0.075 * hM), dim(FIG));
        ell(r, hx, hy, 0.07 * hM, 0.075 * hM, FIG);
        setFrame(FR2, hx, hy, lean - 0.4 * roar, dir);
        polyFr(r, FR2, BEARHOOD, 0.085 * hM, DARK);
        ell(r, fX(FR2, -0.35 * 0.085 * hM, -0.95 * 0.085 * hM), fY(FR2, -0.35 * 0.085 * hM, -0.95 * 0.085 * hM), 0.025 * hM, 0.025 * hM, DARK); // an ear
        const ex = fX(FR2, 0.55 * 0.085 * hM, 0.12 * 0.085 * hM), ey = fY(FR2, 0.55 * 0.085 * hM, 0.12 * 0.085 * hM);
        r.set(ex, ey, w.eye > 0.3 || roar > 0.5 ? HOT : DARK); // his eye under the bear's brow
        if (roar > 0.3) ell(r, fX(FR2, 0.75 * 0.085 * hM, 0.75 * 0.085 * hM), fY(FR2, 0.75 * 0.085 * hM, 0.75 * 0.085 * hM), 0.02 * hM, 0.03 * hM * roar, DARK); // the open mouth
        const ex1 = hx1 + ax * 0.74 * hM, ey1 = hy1 + ay * 0.74 * hM, nx = -ay, ny = ax; // the haft on from the hands, the blade on the side it swings to
        strk(r, hx1 - ax * 0.08 * hM, hy1 - ay * 0.08 * hM, ex1, ey1, mx1(0.03 * hM), LMID);
        for (let m = 0; m < BIGAXE.length >> 1; m++) { PB[2 * m] = ex1 + (ax * BIGAXE[2 * m] + nx * BIGAXE[2 * m + 1]) * hM; PB[2 * m + 1] = ey1 + (ay * BIGAXE[2 * m] + ny * BIGAXE[2 * m + 1]) * hM; }
        fillPB(r, BIGAXE.length >> 1, BRIGHT);
        strk(r, sx, sy, hx1, hy1, mx1(0.08 * hM), FIG);
        // a breath on every beat out of the bear's mouth, rising slowly on the cold air and slowing
        if (w.on && roar < 0.5) emit(w.breath, fX(FR2, 1.2 * 0.085 * hM, 0.6 * 0.085 * hM), fY(FR2, 1.2 * 0.085 * hM, 0.6 * 0.085 * hM), 0.5 * sM, 0, 1.8, BRIGHT, 0.25 * sM);
        targets.push({ x: xM - 0.25 * hM, y: base - 1.1 * hM, w: 0.7 * hM, h: 1.1 * hM });
      }
    }
    if (roar > 0) circ(r, xM + 0.1 * hM, base - 0.9 * hM, (w.roar * 14 * sM) % (0.6 * N), roar > 0.5 ? BRIGHT : LMID, 0.8); // the roar on the air
    plume(W, w.breath, wind, 1.2, 3.5, 0.75, 4 * u);
    // the snow thrown up, each bit under the gravity of its own depth (the ground row it rose from, its `s`, gives the
    // cells a metre there: (s - hor) / Hc), down on that ground again
    if (w.gust > 0) { for (let m = 0; m < 12; m++) { const z = 6 + 10 * rnd(), sc = Fc / z; emit(w.kick, rnd() * N, gy(z) - 1, (K.wind + 1) * sc * (0.5 + rnd()), -(0.5 + rnd()) * 1.5 * sc, 1.2, LMID, gy(z)); } w.gust = 0; }
    const Q = w.kick;
    for (let k = 0; k < Q.n;) {
      Q.vy[k] += ((9.8 * (Q.s[k] - hor)) / Hc) * dt; Q.x[k] += Q.vx[k] * dt; Q.y[k] += Q.vy[k] * dt;
      if ((Q.age[k] += dt) > Q.life[k] || (Q.vy[k] > 0 && Q.y[k] > Q.s[k])) { kill(Q, k); continue; }
      r.rect(Q.x[k], Q.y[k], mx1(0.8 * u), mx1(0.8 * u), Q.c[k]);
      k++;
    }
    flakes(W, w.snow, Math.round(K.snow * u * (0.5 + 0.8 * clamp(f.rel.trebDrive))), Fc / 5, (K.wind * Fc) / 10, hor, (Hc * Fc) / 5, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- shamandrum
// A shaman by a fire on the tundra at night under a sky full of stars: a long fringed coat, a cap with a fringe over the
// eyes and two small tines, a frame drum held up in the far hand, the beater in the near; the fire lights everything
// round it and throws his shadow away from it. A kick is a strike: the beater comes down on the skin and rings it, the
// ripples running out over the drum from where it struck; he steps on every beat (the free foot up through the beat and
// down on it), swaying, the fringes swinging behind his moves as pendulums do; sparks fly up off the fire and slow as
// they cool, more on the kicks; on a snare the smoke over the fire takes the shape of a spirit for a moment, a bear, a
// raven, a wolf, an elk, and drifts up and away with it. The kind is the night: clear, snow, wind (the fire and the
// smoke lean), a trance (the spirits come on the kicks too). A drop: a great spirit forms out of the smoke and rises
// into the sky, and where it stops its outline stays a while among the stars.
const SHAMAN_W = { clear: [2, 2, 1], snow: [2, 1, 1], wind: [1, 2, 2], trance: [0, 2, 3] };
const SHAMAN = { clear: { wind: 0.15, snow: 0 }, snow: { wind: 0.35, snow: 70 }, wind: { wind: 1.4, snow: 0 }, trance: { wind: 0.25, snow: 0 } };
// the spirits, abstract shapes a unit wide facing right (y down): a bear, a raven on the wing, a wolf, an elk
const SPIRITS = [
  [-0.5, 0.05, -0.45, -0.12, -0.3, -0.2, -0.1, -0.27, 0.1, -0.22, 0.28, -0.16, 0.36, -0.15, 0.4, -0.2, 0.44, -0.14, 0.52, -0.08, 0.56, -0.02, 0.5, 0.02, 0.38, 0.03, 0.34, 0.25, 0.22, 0.25, 0.2, 0.1, -0.24, 0.1, -0.27, 0.25, -0.39, 0.25, -0.43, 0.12],
  [-0.5, -0.32, -0.3, -0.14, -0.1, -0.04, -0.04, -0.12, 0.04, -0.12, 0.1, -0.04, 0.3, -0.14, 0.5, -0.32, 0.42, -0.08, 0.18, 0.06, 0.08, 0.12, 0.06, 0.26, -0.06, 0.26, -0.08, 0.12, -0.18, 0.06, -0.42, -0.08],
  [-0.5, -0.06, -0.38, -0.1, -0.3, -0.12, 0.15, -0.14, 0.25, -0.18, 0.3, -0.31, 0.35, -0.2, 0.5, -0.15, 0.49, -0.1, 0.33, -0.08, 0.26, 0, 0.26, 0.2, 0.2, 0.2, 0.15, 0.04, -0.2, 0.04, -0.22, 0.2, -0.28, 0.2, -0.3, 0, -0.37, -0.05],
  [-0.4, -0.05, -0.35, -0.18, 0.15, -0.2, 0.22, -0.3, 0.12, -0.42, 0.04, -0.5, 0.16, -0.46, 0.2, -0.56, 0.26, -0.44, 0.3, -0.36, 0.46, -0.31, 0.45, -0.25, 0.3, -0.24, 0.22, -0.1, 0.2, 0.25, 0.14, 0.25, 0.12, 0, -0.25, 0, -0.28, 0.25, -0.34, 0.25, -0.36, 0.02],
];
const SKY_NIGHT2 = [DARK + DIM, DARK + DIM, DARK, MID + DIM];
// the night sky: stars twinkling and the band of the Milky Way across it, thinned by the dither
function nightSky(r, N, hz, t, seed) {
  sky(r, 0, hz, SKY_NIGHT2);
  const buf = r.buf;
  for (let y = 0; y < hz; y++) {
    const xc = (0.15 + 0.9 * (y / hz)) * N, hw = 0.13 * N, by = (y & 7) << 3;
    for (let x = Math.max(0, Math.round(xc - hw)), xe = Math.min(N, Math.round(xc + hw)); x < xe; x++) { const e = 1 - Math.abs(x - xc) / hw; if (BAYER[by | (x & 7)] < e * e * 0.45 * vn(x * 0.13 + y * 0.05, seed)) buf[y * N + x] = MID + DIM; }
  }
  stars(r, 110, seed, 0, N, 0, hz, LMID, Math.floor(t * 3));
  stars(r, 18, seed + 300, 0, N, 0, hz * 0.9, BRIGHT, Math.floor(t * 2.3));
}
const shamandrum = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { N, kind: rollW(rnd, SHAMAN_W, bandOf(W.a)), bc: 0, on: false, hit: -1, jolt: 0, spirit: -1, spT: 0, spX: 0, spY: 0, spV: 0, next: Math.floor(rnd() * 4),
      great: -1, gT: 0, star: new Float32Array(48), starN: 0, starT: 0, flare: 0, sway: 0, sv: 0, fr: 0, frV: 0,
      rings: pool(8), embers: pool(160), smoke: pool(40), flakes: pool(180) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a);
    if (w.N !== N) shamandrum.init(W);
    if (f.section === 'change') w.kind = rollW(rnd, SHAMAN_W, band);
    // the scale: he stands 1.75 m in 0.4 N; the fire 1.1 m off in front of him
    const K = SHAMAN[w.kind], hz = Math.round(0.66 * N), h = 0.4 * N, sc = h / 1.75, x0 = 0.34 * N, base = 0.9 * N, fx = 0.66 * N, fy = 0.87 * N, wind = K.wind * sc * (1 + 0.5 * clamp(f.rel.midDrive));
    const bc = beatClock(w, f, dt);
    let snare = false;
    for (const h0 of hits) {
      if (isLow(h0)) { if (w.hit < 0 || w.hit > 0.3) w.hit = 0; w.flare = Math.max(w.flare, h0.strength); if (w.kind === 'trance' && w.spirit < 0) snare = true; }
      else if (h0.kind === 'snare') snare = true;
    }
    if (snare && w.spirit < 0 && w.great < 0) { w.spirit = w.next; w.next = (w.next + 1) % 4; w.spT = 0; w.spX = fx; w.spY = fy - 2.2 * sc; w.spV = -0.35 * sc; }
    if (f.section === 'drop' && w.great < 0) { w.great = rnd() < 0.5 ? 3 : 1; w.gT = 0; w.spirit = -1; }
    w.flare *= Math.exp(-dt * 3);
    // the sky and the land
    nightSky(r, N, hz, t, 31);
    for (let x = 0; x < N; x++) vcol(r, x, hz - (0.02 + 0.025 * vn(x / (0.2 * N), 4) + 0.008 * vn(x / (0.03 * N), 5)) * N, hz + 1, DARK + DIM);
    sky(r, hz, N, w.kind === 'snow' ? SNOWFIELD : FIELD);
    // the spirit's outline left among the stars after a drop
    if (w.starT > 0) {
      w.starT -= dt;
      const k = clamp(w.starT / 3);
      for (let i = 0; i < w.starN; i++) {
        const ax = w.star[2 * i], ay = w.star[2 * i + 1], j = (i + 1) % w.starN;
        if (hash(i, 7) < k) r.line(ax, ay, w.star[2 * j], w.star[2 * j + 1], MID);
        const a = (1 + k) * u; r.rect(ax - a, ay, 2 * a + 1, 1, BRIGHT); r.rect(ax, ay - a, 1, 2 * a + 1, BRIGHT);
      }
    }
    // the fire: logs, the flames (with the bass, flaring on the kicks, leaning with the wind), its light on the ground
    const fh = (0.75 + 0.45 * clamp(f.rel.bassDrive) + 0.6 * w.flare) * 0.55 * sc, tt = Math.floor(t * 12), lean = clamp(wind / (3 * sc), 0, 0.6);
    glow(r, fx, fy, (0.24 + 0.06 * w.flare) * N, 0.055 * N, 0.9);
    strk(r, fx - 0.3 * sc, fy + 0.02 * sc, fx + 0.3 * sc, fy - 0.08 * sc, mx1(0.08 * sc), DARK);
    strk(r, fx - 0.28 * sc, fy - 0.08 * sc, fx + 0.32 * sc, fy + 0.02 * sc, mx1(0.08 * sc), DARK);
    flame(r, fx, fy - 0.04 * sc, 0.5 * sc, fh, tt, lean, 3);
    for (let n = spawns(rnd, 4 + 8 * clamp(f.rel.bassDrive) + (w.flare > 0.6 ? 60 : 0), dt); n > 0; n--) emit(w.embers, fx + (rnd() - 0.5) * 0.3 * sc, fy - fh * 0.6, (rnd() - 0.5) * 0.6 * sc, -(3 + 3 * rnd()) * sc, 1 + 1.5 * rnd(), BRIGHT, rnd() * TAU);
    if (rnd() < dt * 4) emit(w.smoke, fx + (rnd() - 0.5) * 0.2 * sc, fy - fh, 0, -0.4 * sc, 4.5, MID + DIM, 0.6 * sc);
    plume(W, w.smoke, wind, 2.5, 3, 0.55, 6 * u);
    // the spirit in the smoke: it gathers, holds, thins out, rising with the smoke and drifting off on the wind
    if (w.spirit >= 0) {
      const a = (w.spT += dt), d = a < 0.3 ? a / 0.3 : a < 0.9 ? 1 : 1 - (a - 0.9) / 0.8;
      w.spV = follow(w.spV, -0.08 * sc, dt, 1); w.spY += w.spV * dt; w.spX += wind * 0.5 * dt;
      shape(r, SPIRITS[w.spirit], w.spX, w.spY, 1.5 * sc, 1.5 * sc, LMID, 0.65 * clamp(d));
      if (a > 1.7) w.spirit = -1;
    }
    if (w.great >= 0) { // the great one: out of the smoke, up into the sky, slowing as it goes; its outline stays in the stars
      const a = (w.gT += dt), q = ease(a / 4.5), gx = fx - 0.1 * N * q, gy = fy - 2.4 * sc - q * (fy - 2.4 * sc - 0.2 * N), sz = (1.6 + 1.2 * q) * sc, d = a < 0.6 ? a / 0.6 : 1 - 0.75 * q;
      shape(r, SPIRITS[w.great], gx, gy, sz, sz, a < 4 ? LMID : BRIGHT, 0.7 * d);
      if (a > 4.5) {
        const S = SPIRITS[w.great], n = S.length >> 2;
        for (let i = 0; i < n; i++) { w.star[2 * i] = gx + S[4 * i] * sz; w.star[2 * i + 1] = gy + S[4 * i + 1] * sz; }
        w.starN = n; w.starT = 14; w.great = -1;
      }
    }
    // he steps on the beat: the free foot (the near on even beats, the far on odd) up through the beat and down on it,
    // the body swaying over the standing one; the fringes are pendulums 14 cm long, swung by how he moves
    const ph = frac(bc), even = Math.floor(bc) % 2 === 0, lift = Math.sin(Math.PI * ph) * 0.07 * h, swx = -0.035 * h * Math.sin(Math.PI * bc); // onto the standing foot
    const vx = (swx - w.sway) / Math.max(dt, 1e-3), ax = (vx - w.sv) / Math.max(dt, 1e-3);
    w.sway = swx; w.sv = vx;
    for (let n = Math.ceil(dt / 0.01), k = 0; k < n; k++) { const hh = dt / n; w.frV += (-(9.8 / 0.14) * Math.sin(w.fr) - 5 * w.frV - (clamp(ax / sc, -40, 40) / 0.14) * Math.cos(w.fr)) * hh; w.fr += w.frV * hh; }
    const x = x0 + swx, col = FIG, dir = 1, sx = x + 0.02 * h, sy = base - 0.78 * h, hx = sx + 0.03 * h, hy = sy - 0.1 * h;
    ell(r, x - 0.35 * h, base, 0.32 * h, mx1(0.025 * h), DARK + DIM); // his shadow, away from the fire
    // the legs under the coat, the free one lifted and carried with him, the standing one where it was put down (the two
    // meet on the beat, when the sway is back over the middle)
    const xf = even ? x0 : x, xn = even ? x : x0;
    strk(r, x - 0.05 * h, base - 0.2 * h, xf - 0.06 * h, base - (even ? 0 : lift), mx1(0.07 * h), dim(col));
    strk(r, x + 0.05 * h, base - 0.2 * h, xn + 0.06 * h, base - (even ? lift : 0), mx1(0.07 * h), col);
    r.rect(xf - 0.1 * h, base - (even ? 0 : lift) - 0.03 * h, 0.09 * h, 0.03 * h, DARK);
    r.rect(xn + 0.03 * h, base - (even ? lift : 0) - 0.03 * h, 0.09 * h, 0.03 * h, DARK);
    // the drum, up in the far hand in front of his face, its skin to the fire and to us; the far arm to its grip
    const jolt = (w.jolt = Math.max(0, w.jolt - dt * 8)) * 0.02 * h, dcx = sx + 0.24 * h + jolt, dcy = sy - 0.1 * h, R = 0.16 * h, rx = R * 0.6;
    reach(r, sx - 0.02 * h, sy + 0.02 * h, dcx - 0.02 * h, dcy + 0.04 * h, 0.16 * h, 0.15 * h, dir, mx1(0.07 * h), dim(col), true);
    ell(r, dcx, dcy, rx + mx1(0.025 * h), R + mx1(0.025 * h), DARK);
    ell(r, dcx, dcy, rx, R, LMID);
    const Q = w.rings;
    for (let k = 0; k < Q.n;) { // the ripples running out over the skin from where it was struck, inside its rim
      const a = (Q.age[k] += dt);
      if (a > 0.6) { kill(Q, k); continue; }
      const rr = a * 1.6 * R, cxr = dcx + Q.x[k] * rx, cyr = dcy + Q.y[k] * R, c = a < 0.25 ? BRIGHT : MID, n = Math.max(8, Math.ceil(rr * 5));
      for (let m = 0; m < n; m++) { const an = (m / n) * TAU, px = cxr + Math.cos(an) * rr * 0.6, py = cyr + Math.sin(an) * rr, ex = (px - dcx) / rx, ey = (py - dcy) / R; if (ex * ex + ey * ey < 0.9) r.set(px, py, c); }
      k++;
    }
    // the coat, the belt, the fringes along the hem hanging as their pendulum swings
    quad(r, sx - 0.11 * h, sy - 0.01 * h, sx + 0.09 * h, sy - 0.01 * h, x + 0.18 * h, base - 0.17 * h, x - 0.21 * h, base - 0.15 * h, col);
    quad(r, x - 0.2 * h, base - 0.2 * h, x + 0.17 * h, base - 0.22 * h, x + 0.18 * h, base - 0.17 * h, x - 0.21 * h, base - 0.15 * h, DARK); // the trimmed hem
    strk(r, sx + 0.07 * h, sy + 0.02 * h, x + 0.14 * h, base - 0.2 * h, mx1(0.02 * h), LMID); // the firelit edge of the coat
    r.rect(x - 0.13 * h, base - 0.47 * h, 0.25 * h, mx1(0.03 * h), DARK);
    const fs = Math.sin(w.fr), fc = Math.cos(w.fr);
    for (let k = 0; k < 10; k++) { const q = k / 9, ex = lerp(x - 0.2 * h, x + 0.17 * h, q), ey = lerp(base - 0.15 * h, base - 0.17 * h, q); r.line(ex, ey, ex + fs * 0.08 * h, ey + fc * 0.08 * h, k & 1 ? HOT : DARK); }
    // the head: the cap, its two tines, the fringe over the eyes
    ell(r, hx, hy, 0.07 * h, 0.075 * h, col);
    ell(r, hx - 0.01 * h, hy - 0.05 * h, 0.08 * h, 0.05 * h, DARK);
    strk(r, hx - 0.03 * h, hy - 0.09 * h, hx - 0.07 * h, hy - 0.17 * h, mx1(0.015 * h), DARK); strk(r, hx + 0.03 * h, hy - 0.09 * h, hx + 0.06 * h, hy - 0.18 * h, mx1(0.015 * h), DARK);
    for (let k = 0; k < 5; k++) r.line(hx - 0.02 * h + k * 0.022 * h, hy - 0.02 * h, hx - 0.02 * h + k * 0.022 * h + fs * 0.02 * h, hy + 0.04 * h, k & 1 ? HOT : DARK);
    // the near arm and the beater: up by his head, down onto the skin on the kick (0.06 s), back up after it
    let s = 0;
    if (w.hit >= 0) {
      const a = (w.hit += dt);
      s = a < 0.06 ? a / 0.06 : a < 0.36 ? 1 - smooth((a - 0.06) / 0.3) : 0;
      if (a >= 0.06 && a - dt < 0.06) { emit(Q, 0.15, 0.1, 0, 0, 1, BRIGHT); w.jolt = 1; }
      if (a > 0.36) w.hit = -1;
    }
    const ba = lerp(-2.3, 0.45, s), cxh = dcx + 0.15 * rx, cyh = dcy + 0.1 * R, hx2 = lerp(sx + 0.05 * h, cxh - 0.12 * h * Math.cos(0.45), s), hy2 = lerp(sy - 0.24 * h, cyh - 0.12 * h * Math.sin(0.45), s);
    reach(r, sx, sy, hx2, hy2, 0.16 * h, 0.15 * h, dir, mx1(0.07 * h), col);
    const bx2 = LX + Math.cos(ba) * 0.12 * h, by2 = LY + Math.sin(ba) * 0.12 * h;
    strk(r, LX, LY, bx2, by2, mx1(0.015 * h), DARK);
    ell(r, bx2, by2, mx1(0.022 * h), mx1(0.022 * h), HOT);
    embers(W, w.embers, wind);
    if (K.snow) flakes(W, w.flakes, Math.round(K.snow * u), N / 6, wind * 0.6, hz, N - hz, LMID); // each lands on the ground of its depth
    targets.push({ x: x - 0.2 * h, y: base - h, w: 0.62 * h, h });
  },
};

// ---------------------------------------------------------------------------------------------- birds and birches
// a crow `s` long: perched (the body, the head turned by `look`, the tail down) or on the wing, the wings beating with
// `flap` (1 up, -1 down) or held out to glide (flap 0)
function crow(r, x, y, s, col, fly, flap, dir, look = 0) {
  if (!fly) {
    ell(r, x, y - s * 0.3, s * 0.3, s * 0.22, col);
    ell(r, x + dir * s * 0.28, y - s * 0.52, s * 0.14, s * 0.13, col);
    r.line(x + dir * s * 0.4, y - s * 0.52 + look * s * 0.05, x + dir * s * 0.58, y - s * 0.47 + look * s * 0.05, col);
    strk(r, x - dir * s * 0.25, y - s * 0.24, x - dir * s * 0.55, y - s * 0.05, mx1(s * 0.12), col);
    return;
  }
  const wy = -flap * s * 0.42;
  ell(r, x, y, s * 0.3, s * 0.11, col);
  strk(r, x - s * 0.04, y, x - s * 0.22, y + wy * 0.5, mx1(s * 0.14), col); strk(r, x - s * 0.22, y + wy * 0.5, x - s * 0.55, y + wy, mx1(s * 0.08), col);
  strk(r, x + s * 0.04, y, x + s * 0.22, y + wy * 0.5, mx1(s * 0.14), col); strk(r, x + s * 0.22, y + wy * 0.5, x + s * 0.55, y + wy, mx1(s * 0.08), col);
  ell(r, x + dir * s * 0.32, y - s * 0.03, s * 0.09, s * 0.08, col);
  tri3(r, x - dir * s * 0.25, y - s * 0.05, x - dir * s * 0.48, y - s * 0.1, x - dir * s * 0.46, y + s * 0.06, col);
}
// a birch `hgt` tall on (x, gy), its trunk bent by `bend` (the top that far over, a cantilever's curve), white with dark
// marks, its fine twigs hanging from the crown and swinging further than it does
function birch(r, x, gy, hgt, bend, sway, col, mark, leaf, seed) {
  let px = x, py = gy;
  const wd = mx1(hgt * 0.035);
  for (let k = 1; k <= 10; k++) {
    const q = k / 10, nx = x + bend * q * q, ny = gy - hgt * q;
    strk(r, px, py, nx, ny, wd * (1.2 - 0.6 * q), col);
    if (hash(seed, k) < 0.6) r.rect(px - wd * 0.4, (py + ny) / 2, wd * 0.8, mx1(wd * 0.3), mark);
    px = nx; py = ny;
  }
  for (let k = 0; k < 7; k++) { // the hanging twigs, each from a point on the upper trunk, swung out by the wind past the trunk's bend
    const q = 0.45 + 0.08 * k, ax = x + bend * q * q, ay = gy - hgt * q, len = hgt * (0.18 + 0.1 * hash(seed + k, 3)), s0 = (k & 1 ? 1 : -1) * hgt * 0.05, ex = ax + s0 + bend * 0.5 + sway * len * 0.5, ey = ay + len;
    r.line(ax, ay, ex, ey, mark);
    for (let m = 0; m < 5; m++) { const e = (m + 1) / 6; r.rect(lerp(ax, ex, e) + (hash(seed + k, m) - 0.5) * hgt * 0.05, lerp(ay, ey, e), mx1(hgt * 0.02), mx1(hgt * 0.02), leaf); }
  }
}

// ---------------------------------------------------------------------------------------------- idols
// A sacred grove at nightfall: three tall carved wooden idols stand in a row (the middle one nearest and tallest), each
// a pillar of three tiers with a face carved in each (brow, eyes, nose, mouth; the lowest with the arms carved down its
// sides) under a round cap; a fire before each lights it from below. Behind them the great oak spreads its crown; birches
// at both sides bend and sway with the treble, their hanging twigs swinging further. The fires flare on the kicks and
// throw sparks that rise and slow; crows sit on the idols' caps and the oak and lift off on the snares, flapping away and
// gliding back to a perch, slowing to land; a note lights the eyes of one face (which idol and tier by its pitch class).
// The kind is the hour: night with a moon, dusk, fog lying between the idols, a wind (the flames lean, the birches thrash).
// A drop: a storm breaks, lightning strikes the great oak with a flash, and it smoulders after, a red crack down its
// trunk and smoke out of its crown in the rain.
const GROVE_W = { night: [2, 2, 1], dusk: [2, 1, 1], fog: [2, 2, 1], wind: [1, 2, 3] };
const IDOL_X = [0.22, 0.5, 0.78], IDOL_S = [0.78, 1, 0.78];
const SKY_GROVE = [DARK + DIM, DARK, MID + DIM, MID];
// a crow's perch p (0..2 the idols' caps, 3 and 4 the oak's two great limbs): its x (i 0), the y the crow is drawn at so
// that it sits on it (i 1: its body's underside 0.08 of its size above that), or the crow's size there (i 2: in scale
// with what it sits on; the oak, its foot hidden behind the middle idol, stands about twice as far off)
function idolPerch(p, i, N, hz, H1, ox, oyb, oh) {
  const s0 = p < 3 ? IDOL_S[p] : 0.45, cs = 0.4 * (H1 / 4.2) * s0;
  if (i === 2) return cs;
  if (p < 3) return i === 0 ? IDOL_X[p] * N + (p === 1 ? 0.01 * N : 0) : hz + 0.2 * N * s0 - 1.02 * H1 * s0 - 0.42 * 0.085 * N * s0 + 0.08 * cs;
  return i === 0 ? (p === 3 ? ox - 0.16 * N : ox + 0.17 * N) : oyb - oh * (p === 3 ? 0.75 : 0.78) - 0.0125 * N + 0.08 * cs;
}
const idols = {
  init(W) {
    const { w, rnd, N } = W, cr = [];
    for (let k = 0; k < 5; k++) cr.push({ x: 0, y: 0, vx: 0, vy: 0, st: 0, p: k, t: 0, ph: rnd() * TAU, dir: rnd() < 0.5 ? -1 : 1 });
    Object.assign(w, { N, kind: rollW(rnd, GROVE_W, bandOf(W.a)), bc: 0, on: false, eyes: new Float32Array(9), flare: new Float32Array(3), bend: new Float32Array(6), bv: new Float32Array(6),
      crows: cr, storm: -1, bolt: new Float32Array(64), boltN: 0, boltT: 0, smoulder: 0, flash: 0, embers: pool(150), smoke: pool(40) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a);
    if (w.N !== N) idols.init(W);
    if (f.section === 'change') w.kind = rollW(rnd, GROVE_W, band);
    const hz = Math.round(0.66 * N), H1 = 0.56 * N, sc = H1 / 4.2, ox = 0.5 * N, oyb = hz + 0.01 * N, oh = 0.62 * N; // the middle idol 4.2 m tall in 0.56 N
    const storming = w.storm >= 0, windy = w.kind === 'wind' || storming, wind = (windy ? 2.5 : 0.5) * sc * 0.3;
    if (f.section === 'drop' && !storming) { // the storm: a bolt into the oak's crown, the flash, the thunder
      w.storm = 0;
      let x = ox + (rnd() - 0.5) * 0.3 * N, y = 0, n = 0;
      const tx = ox + 0.03 * N, ty = oyb - oh * 0.92;
      while (n < 30 && y < ty) { w.bolt[2 * n] = x; w.bolt[2 * n + 1] = y; n++; y += (0.025 + 0.03 * rnd()) * N; x += (rnd() - 0.5) * 0.06 * N + (tx - x) * 0.25; }
      w.bolt[2 * n] = tx; w.bolt[2 * n + 1] = ty; w.boltN = n + 1; w.boltT = 0.35; w.flash = 0.2; w.smoulder = 1;
      s.shake = Math.max(s.shake, 0.6);
    }
    if (storming && (w.storm += dt) > 30) w.storm = -1;
    w.boltT -= dt; w.flash -= dt; w.smoulder = Math.max(0, w.smoulder - dt / 40);
    let snare = 0;
    for (const h of hits) {
      if (isLow(h)) for (let k = 0; k < 3; k++) w.flare[k] = Math.max(w.flare[k], h.strength);
      else if (h.kind === 'snare') snare = Math.max(snare, h.strength);
      if (isTonal(h)) w.eyes[(h.pc % 3) * 3 + (Math.floor(h.pc / 3) % 3)] = 1;
    }
    // the sky: the moon at night, the last light at dusk; the flash
    sky(r, 0, hz, w.flash > 0 ? SKY_FLASH : SKY_GROVE);
    if (w.kind === 'night' && !storming) { stars(r, 40, 61, 0, N, 0, 0.4 * N, LMID, Math.floor(t * 2)); ell(r, 0.82 * N, 0.12 * N, 0.035 * N, 0.035 * N, BRIGHT); }
    else if (w.kind === 'dusk') hazeE(r, 0.5 * N, hz, 0.5 * N, 0.14 * N, HOT, 0.6);
    if (w.boltT > 0) for (let k = 1; k < w.boltN; k++) strk(r, w.bolt[2 * k - 2], w.bolt[2 * k - 1], w.bolt[2 * k], w.bolt[2 * k + 1], mx1(1.2 * u), BRIGHT);
    // the great oak behind: a crown of broad lobes on a thick trunk and limbs; struck, a red crack down it that cools
    const oc = w.flash > 0 ? MID : DARK + DIM;
    strk(r, ox, oyb, ox + 0.01 * N, oyb - oh * 0.5, 0.07 * N, oc);
    strk(r, ox, oyb - oh * 0.4, ox - 0.16 * N, oyb - oh * 0.75, 0.025 * N, oc); strk(r, ox, oyb - oh * 0.45, ox + 0.17 * N, oyb - oh * 0.78, 0.025 * N, oc);
    for (let k = 0; k < 13; k++) { const a = (k / 12) * Math.PI, rr = (0.26 + 0.05 * hash(k, 8)) * N; ell(r, ox - Math.cos(a) * rr * 1.1, oyb - oh * 0.68 - Math.sin(a) * rr * 0.65, (0.09 + 0.04 * hash(k, 9)) * N, (0.07 + 0.03 * hash(k, 10)) * N, oc); }
    if (w.smoulder > 0) {
      const cl = w.smoulder > 0.6 ? BRIGHT : HOT, wv = Math.floor(t * 8);
      for (let k = 0; k < 8; k++) { const y0 = oyb - oh * (0.92 - k * 0.08), y1 = y0 + oh * 0.08, x0 = ox + 0.03 * N + (hash(k, 3) - 0.5) * 0.02 * N, x1 = ox + 0.03 * N + (hash(k + 1, 3) - 0.5) * 0.02 * N; if (hash(k, wv) < w.smoulder + 0.3) r.line(x0, y0, x1, y1, cl); }
      if (rnd() < dt * 6 * w.smoulder) emit(w.smoke, ox + 0.03 * N, oyb - oh * 0.92, 0, -0.3 * sc, 5, MID, 0.6 * sc);
      for (let n = spawns(rnd, 10 * w.smoulder, dt); n > 0; n--) emit(w.embers, ox + 0.03 * N + (rnd() - 0.5) * 0.04 * N, oyb - oh * 0.9, (rnd() - 0.5) * sc, -2 * sc, 1.5, HOT, rnd() * TAU);
    }
    sky(r, hz, N, FIELD);
    // the birches, three a side, sprung toward the treble's push and swinging about it
    for (let k = 0; k < 6; k++) {
      const push = (windy ? 0.06 : 0.02) * N * (0.4 + clamp(f.rel.trebDrive)) * (0.8 + 0.4 * Math.sin(t * 1.3 + k));
      for (let n = Math.ceil(dt / 0.01), m = 0; m < n; m++) { const hh = dt / n; w.bv[k] += (-14 * (w.bend[k] - push) - 2.2 * w.bv[k]) * hh; w.bend[k] += w.bv[k] * hh; }
      const bx = (k < 3 ? 0.03 + 0.07 * k : 0.83 + 0.07 * (k - 3)) * N, by = hz + (0.03 + 0.04 * hash(k, 2)) * N;
      birch(r, bx, by, (0.5 + 0.12 * hash(k, 4)) * N, w.bend[k], w.bv[k] / (0.05 * N), BRIGHT, DARK, MID, 40 + k);
    }
    // the idols, the sides first (farther), the middle last; a fire before each, lighting its face from below
    const tt = Math.floor(t * 12), lean = clamp(wind / sc, 0, 0.5);
    for (let oi = 0; oi < 3; oi++) {
      const k = oi === 2 ? 1 : oi === 0 ? 0 : 2, s0 = IDOL_S[k], x = IDOL_X[k] * N, base = hz + 0.2 * N * s0, H = H1 * s0, wd = 0.085 * N * s0, tier = H * 0.24;
      w.flare[k] *= Math.exp(-dt * 3);
      r.rect(x - wd / 2, base - H, wd, H, MID);
      for (let m = 0; m < 6; m++) vcol(r, x - wd / 2 + wd * hash(k, m), base - H * 0.95, base, MID + DIM); // the grain
      // the cap: a round crown with a brim, a darker wood than the pillar (it has to read against the dusk behind it, or a
      // crow sitting on it would seem to hang in the air)
      ell(r, x, base - H - 0.02 * H, wd * 0.58, wd * 0.42, MID + DIM);
      r.rect(x - wd * 0.62, base - H + 0.01 * H, wd * 1.24, mx1(0.035 * H), MID + DIM);
      for (let m = 0; m < 3; m++) { // the tiers, each a face; the lowest with the arms carved down its sides
        const ty = base - H + 0.06 * H + m * tier, e = w.eyes[k * 3 + m], ec = e > 0.25 ? (m === 1 ? COOL : HOT) : DARK;
        r.rect(x - wd / 2, ty + tier - mx1(0.02 * H), wd, mx1(0.02 * H), DARK); // the ring between the tiers
        r.rect(x - wd * 0.36, ty + tier * 0.18, wd * 0.72, mx1(tier * 0.07), DARK); // the brow
        r.rect(x - wd * 0.3, ty + tier * 0.3, wd * 0.18, mx1(tier * 0.1), ec); r.rect(x + wd * 0.12, ty + tier * 0.3, wd * 0.18, mx1(tier * 0.1), ec);
        r.rect(x - wd * 0.05, ty + tier * 0.28, wd * 0.1, tier * 0.32, LMID); r.rect(x + wd * 0.05, ty + tier * 0.3, mx1(wd * 0.04), tier * 0.3, DARK); // the nose and its shadow
        r.rect(x - wd * 0.22, ty + tier * 0.72, wd * 0.44, mx1(tier * 0.06), DARK); // the mouth
        if (e > 0.5) { hazeE(r, x - wd * 0.21, ty + tier * 0.34, wd * 0.25, tier * 0.15, ec, 0.5 * e); hazeE(r, x + wd * 0.21, ty + tier * 0.34, wd * 0.25, tier * 0.15, ec, 0.5 * e); }
        w.eyes[k * 3 + m] = Math.max(0, e - dt * 0.9);
        if (m === 2) { r.rect(x - wd / 2 + mx1(u * s0), ty, mx1(0.015 * N * s0), tier * 0.9, DARK); r.rect(x + wd / 2 - 2 * mx1(u * s0), ty, mx1(0.015 * N * s0), tier * 0.9, DARK); }
      }
      // the fire before it: logs, the flames (the bass, flaring on the kicks, leaning in a wind), its light up the pillar
      const fx = x, fy = base + 0.04 * N * s0, fh = (0.5 + 0.3 * clamp(f.rel.bassDrive) + 0.6 * w.flare[k]) * sc * s0 * 0.9;
      glow(r, fx, fy - fh * 0.3, wd * 1.1, fh * 1.4 + 0.06 * H, 0.45 + 0.3 * w.flare[k]);
      strk(r, fx - 0.3 * sc * s0, fy, fx + 0.3 * sc * s0, fy - 0.06 * sc * s0, mx1(0.07 * sc * s0), DARK);
      flame(r, fx, fy, 0.45 * sc * s0, fh, tt + k * 7, lean, 11 + k);
      if (w.flare[k] > 0.8) for (let n = 0; n < 6; n++) emit(w.embers, fx, fy - fh * 0.6, (rnd() - 0.5) * sc, -(2.5 + 2 * rnd()) * sc * s0, 1 + rnd(), BRIGHT, rnd() * TAU);
      if (rnd() < dt * 3) emit(w.embers, fx, fy - fh * 0.6, (rnd() - 0.5) * 0.5 * sc, -2 * sc * s0, 1.2, BRIGHT, rnd() * TAU);
      if (k === 1) targets.push({ x: x - wd, y: base - H, w: 2 * wd, h: H });
    }
    if (w.kind === 'fog' && !storming) for (let k = 0; k < 2; k++) { // fog lying between them, drifting on the wind
      const yc = hz + (0.09 + 0.08 * k) * N, th = 0.05 * N;
      for (let y = Math.round(yc - th); y < yc + th; y++) { const e = 1 - Math.abs(y - yc) / th, by = (y & 7) << 3; for (let x = 0; x < N; x++) if (BAYER[by | (x & 7)] < 0.55 * e * vn((x - t * 0.01 * N * (k + 1)) / (0.12 * N), 70 + k)) r.buf[y * N + x] = LMID + DIM; }
    }
    // the crows: on their perches (the idols' caps, the oak's limbs) bobbing; a snare lifts one or two off, flapping up and
    // away; after a while they glide back to a free perch, slowing as they come in
    if (snare > 0) for (let n = 0, m = 0; n < 5 && m < 2; n++) { const c = w.crows[(n + Math.floor(t * 7)) % 5]; if (c.st === 0) { c.st = 1; c.t = 0; c.vx = c.dir * (2 + 2 * rnd()) * sc; c.vy = -3 * sc; m++; } }
    for (const c of w.crows) {
      const ct = idolPerch(c.p, 2, N, hz, H1, ox, oyb, oh), cs = (c.cs = c.cs > 0 ? follow(c.cs, ct, dt, c.st === 0 ? 0.05 : 0.8) : ct); // its size eases as it flies in depth
      if (c.st === 0) { c.x = idolPerch(c.p, 0, N, hz, H1, ox, oyb, oh); c.y = idolPerch(c.p, 1, N, hz, H1, ox, oyb, oh); crow(r, c.x, c.y, cs, BLACK, false, 0, c.dir, Math.sin(t * 3 + c.ph)); continue; }
      c.t += dt;
      if (c.st === 1) { c.vy = follow(c.vy, -1.2 * sc, dt, 0.5); if (c.t > 2.5 + c.ph) { let used = 0; for (const o of w.crows) if (o.st !== 1 && o !== c) used |= 1 << o.p; let p = Math.floor(rnd() * 5); for (let k = 0; k < 5 && used & (1 << p); k++) p = (p + 1) % 5; c.p = p; c.st = 2; } }
      else { const tx = idolPerch(c.p, 0, N, hz, H1, ox, oyb, oh), ty = idolPerch(c.p, 1, N, hz, H1, ox, oyb, oh), dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy), v = Math.min(5 * sc, d * 1.6); c.vx = follow(c.vx, (dx / (d || 1)) * v, dt, 0.25); c.vy = follow(c.vy, (dy / (d || 1)) * v, dt, 0.25); if (d < mx1(u)) { c.st = 0; c.dir = dx >= 0 ? 1 : -1; } }
      c.x += c.vx * dt; c.y += c.vy * dt;
      crow(r, c.x, c.y, cs, BLACK, true, c.st === 1 ? Math.sin(t * 26 + c.ph) : Math.hypot(c.vx, c.vy) < 1.5 * sc ? 0.8 : 0.1, c.vx >= 0 ? 1 : -1);
    }
    plume(W, w.smoke, wind + 0.4 * sc, 3, 3, 0.6, 7 * u);
    embers(W, w.embers, wind);
    if (storming) rain(r, N, u, t, Math.round(90 * u), 9 * sc * 3, 0.25, 0.25 * 9 * sc * 3 * t, LMID + DIM);
  },
};

// ---------------------------------------------------------------------------------------------- kupala
// Midsummer night by a river, from its near bank (a pinhole camera 2.2 m up: the ground of every depth on its row): a
// dark forest beyond the meadow, a bonfire on the meadow with a round dance circling it, the river in front; the water
// gives back the forest and the pale sky (mirrored about the line where they stand on it), and the fire as a broken
// column of light. Wreaths of flowers with a candle in each float down the river with the current, fastest midstream
// (the flow's profile across the river a parabola), smaller and slower far off; fireflies wander and blink over the
// banks. The dance goes round a step a beat, the foot down on the beat, hand in hand; on a kick a couple runs at the fire
// hand in hand and leaps it on a true parabola, landing on the other side at the level they left (and the next leap
// comes back); a snare shifts a log and the fire throws sparks that rise and slow, the dancers' hands go up; a hat
// makes the fireflies blink together, a note flares the candles. The kind is the night: the pale twilight of midsummer,
// stars, a mist on the water, a festive night (more wreaths, more fireflies). A drop: deep in the dark forest the fern
// flower unfurls and blooms, glowing.
const KUPALA_W = { twilight: [2, 2, 1], stars: [2, 2, 2], mist: [2, 1, 1], festive: [1, 2, 3] };
const SKY_WHITE = [DARK, MID + DIM, MID, LMID, BRIGHT], SKY_STARS = [DARK + DIM, DARK + DIM, DARK, MID + DIM], WREATH = [HOT, BRIGHT, COOL, HOT, LMID, COOL];
// a dancer `h` tall on (x, base) going dir: a long dress to the shins, a wreath on her head, the legs stepping with `ph`
// (the planted foot still), the arms out to the hands of the ones on either side, up by `up`
function dancer(r, x, base, h, dir, ph, up, dress, col, l0 = NaN, k0 = 0, l1 = 0, k1 = 0) {
  if (l0 !== l0) { l0 = 0.32 * tri(ph); l1 = -l0; k0 = 0.1 + 0.6 * Math.max(0, Math.cos(ph)); k1 = 0.1 + 0.6 * Math.max(0, -Math.cos(ph)); }
  const lw = mx1(0.07 * h), C = Math.cos, py = base - Math.max(0.25 * h * (C(l0) + C(l0 - k0)), 0.25 * h * (C(l1) + C(l1 - k1))), sy = py - 0.3 * h, hy = sy - 0.1 * h;
  limb(r, x, py, l1, k1, 0.25 * h, 0.25 * h, dir, lw, dim(col), -1);
  limb(r, x, py, l0, k0, 0.25 * h, 0.25 * h, dir, lw, col, -1);
  quad(r, x - 0.07 * h, py - 0.12 * h, x + 0.07 * h, py - 0.12 * h, x + 0.16 * h, py + 0.28 * h, x - 0.16 * h, py + 0.28 * h, dress);
  strk(r, x, py - 0.1 * h, x, sy, mx1(0.12 * h), dress);
  const ay = sy + lerp(0.12, -0.32, up) * h;
  r.line(x, sy + 0.02 * h, x - 0.24 * h, ay, col); r.line(x, sy + 0.02 * h, x + 0.24 * h, ay, col);
  ell(r, x, hy, 0.065 * h, 0.075 * h, col);
  for (let k = 0; k < 5; k++) r.set(x + (k - 2) * 0.035 * h, hy - 0.07 * h + Math.abs(k - 2) * 0.012 * h, WREATH[k]);
  return ay;
}
// a midsummer wreath on the water at (x, y), `R` across: a ring of flowers flattened by the view (sy), a candle in it with
// its flame, and the flame's light going down into the water under it
function wreath(r, x, y, R, sy, flick, c0) {
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; r.rect(x + Math.cos(a) * R - 0.5, y + Math.sin(a) * R * sy - 0.5, mx1(R * 0.35), mx1(R * 0.3), k & 1 ? MID : WREATH[k % 6]); }
  r.rect(x - mx1(R * 0.08), y - R * 0.6, mx1(R * 0.16), R * 0.55, LMID);
  r.rect(x - mx1(R * 0.08), y - R * 0.6 - mx1(R * 0.25) * flick, mx1(R * 0.16), mx1(R * 0.25) * flick, c0);
  for (let k = 1; k < 5; k++) if (hash(k, Math.floor(y * 3 + flick * 9)) < 0.7) r.rect(x - mx1(R * 0.1) + (hash(k, 9) - 0.5) * R * 0.4, y + R * sy + k * mx1(R * 0.2), mx1(R * 0.2), 1, k < 3 ? c0 : HOT + DIM);
}
// the reflection of what was drawn on its own into the scratch raster S (255 where nothing is) in the box from (xa, ya)
// to (xb, y0): mirrored about the row y0 it stands on, into R2 where that falls between the rows y1 and y2 (the water);
// the box is left empty again
function mirrorInto(S, R2, xa, xb, ya, y0, y1, y2) {
  const N = S.N, b = S.buf, x0 = Math.max(0, Math.floor(xa)), x1 = Math.min(N, Math.ceil(xb)), ye = Math.min(N, Math.ceil(y0) + 1);
  for (let y = Math.max(0, Math.floor(ya)); y < ye; y++) {
    const my = Math.round(2 * y0 - y - 1), ok = my >= y1 && my < y2, mrow = my * N;
    for (let x = x0, i = y * N + x0; x < x1; x++, i++) { const c = b[i]; if (c !== 255) { if (ok) R2[mrow + x] = c; b[i] = 255; } }
  }
}
const kupala = {
  init(W) {
    const { w, rnd, N } = W, wr = new Float32Array(20 * 3);
    for (let k = 0; k < 20; k++) { wr[3 * k] = (rnd() - 0.5) * 10; wr[3 * k + 1] = 7.6 + 7 * rnd(); wr[3 * k + 2] = rnd(); }
    Object.assign(w, { N, kind: rollW(rnd, KUPALA_W, bandOf(W.a)), bc: 0, on: false, wr, ff: new Float32Array(40 * 3).map(() => rnd()), blink: 0, clap: 0, flare: 0, cand: 0, candC: HOT,
      leap: -1, side: -1, lx: -2.3, fern: -1, order: new Int8Array(12), dep: new Float32Array(12), embers: pool(160), smoke: pool(30), th: rnd() * TAU, pbc: -1,
      S: new Raster(N), R2: new Uint8Array(N * N) }); // (S: the folk drawn again on their own, to be mirrored into R2, the water)
    w.S.fill(255);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), buf = r.buf;
    if (w.N !== N) kupala.init(W);
    if (f.section === 'change') w.kind = rollW(rnd, KUPALA_W, band);
    if (f.section === 'drop' && w.fern < 0) w.fern = 0;
    // the camera: 2.2 m up, F = 1.5 N; the forest's edge 60 m off, the river from 7.2 m (the near bank) to 15 m, the fire
    // on the meadow 20 m off
    const hz = 0.4 * N, Fc = 1.5 * N, Hc = 2.2, cx = 0.5 * N, gy = (z) => hz + (Hc * Fc) / z, sxp = (X, z) => cx + (X * Fc) / z;
    const yA = gy(60), yF = Math.round(gy(15)), yN = Math.round(gy(7.2)), zf = 20, fxs = sxp(0, zf), fys = gy(zf), sF = Fc / zf, gF = 9.8 * sF;
    const bc = beatClock(w, f, dt);
    let kick = 0;
    for (const h of hits) {
      if (isLow(h)) kick = Math.max(kick, h.strength);
      else if (h.kind === 'snare') { w.clap = 1; for (let n = 0; n < 16; n++) emit(w.embers, fxs + (rnd() - 0.5) * 0.5 * sF, fys - 0.6 * sF, (rnd() - 0.5) * 1.5 * sF, -(3 + 3 * rnd()) * sF, 1 + rnd(), BRIGHT, rnd() * TAU); }
      else if (h.kind === 'hat') w.blink = 1;
      if (isTonal(h)) { w.cand = 1; w.candC = h.pc % 3 === 0 ? COOL : h.pc % 3 === 1 ? HOT : BRIGHT; }
    }
    w.clap = Math.max(0, w.clap - dt * 4); w.blink = Math.max(0, w.blink - dt * 3); w.cand = Math.max(0, w.cand - dt * 1.5);
    if (kick > 0 && w.leap < 0) w.leap = 0;
    // the sky (midsummer's pale night, or stars), the forest's edge with the tips of its spruces
    sky(r, 0, yA, w.kind === 'stars' ? SKY_STARS : SKY_WHITE);
    if (w.kind === 'stars') stars(r, 70, 81, 0, N, 0, 0.3 * N, LMID, Math.floor(t * 2));
    for (let x = 0; x < N; x++) { const X = ((x - cx) * 60) / Fc, q = X / 2.2, i = Math.floor(q), e = q - i, ht = 12 + 9 * hash(i, 13); vcol(r, x, yA - (((ht * (1 - Math.abs(2 * e - 1)) * 0.6 + ht * 0.4) * Fc) / 60) * 0.6, yA + 1, DARK + DIM); }
    sky(r, yA, yF, FIELD);
    // the fern flower in the dark of the forest: the fronds unroll, the bud rises on its stem and opens, glowing
    if (w.fern >= 0) {
      const a = (w.fern += dt), px = 0.8 * N, py = yA - 0.005 * N, k = a < 14 ? 1 : 1 - (a - 14) / 2, unf = smooth(a / 2), op = smooth((a - 2) / 1.5), sz = 0.03 * N;
      for (let m = 0; m < 5; m++) { const an = -Math.PI / 2 + (m - 2) * 0.55, L = sz * 1.8 * unf; let qx = px, qy = py; for (let j = 1; j <= 8; j++) { const e = j / 8, cu = an + e * e * 2.2 * (1 - unf * 0.6) * (m < 2 ? -1 : 1), nx = qx + Math.cos(cu) * L / 8, ny = qy + Math.sin(cu) * L / 8; r.line(qx, qy, nx, ny, MID); qx = nx; qy = ny; } }
      if (a > 1.5) {
        const sy2 = py - sz * 1.2 * op; r.line(px, py, px, sy2, MID);
        hazeE(r, px, sy2, sz * 2.5 * op * k, sz * 2 * op * k, LMID, 0.5);
        for (let m = 0; m < 6; m++) { const an = (m / 6) * TAU + t * 0.3; tri3(r, px, sy2, px + Math.cos(an - 0.25) * sz * op, sy2 + Math.sin(an - 0.25) * sz * op, px + Math.cos(an + 0.25) * sz * op, sy2 + Math.sin(an + 0.25) * sz * op, m & 1 ? HOT : BRIGHT); }
        ell(r, px, sy2, mx1(sz * 0.25), mx1(sz * 0.25), COOL);
        for (let n = spawns(rnd, 12 * k, dt); n > 0; n--) emit(w.embers, px + (rnd() - 0.5) * sz, sy2, (rnd() - 0.5) * 0.3 * sF, -0.6 * sF, 2, COOL, rnd() * TAU);
      }
      if (a > 16) w.fern = -1;
      targets.push({ x: px - 2 * sz, y: py - 3 * sz, w: 4 * sz, h: 3 * sz });
    }
    // the meadow folk far to near: the round dance (a step a beat round a 2.6 m ring), the fire, the leaping couple; each
    // figure is drawn again on its own into S and mirrored about the row it stands on into R2, where that falls on the
    // river (the water gives the folk back about their own ground, not about the forest's)
    const n = 9, R = 2.6, ST = 1.65 * Math.sin(0.32) * 0.996, ph = Math.PI * (bc + 0.5), O = w.order, D = w.dep, S = w.S, R2 = w.R2; // round by her stride a beat
    const dB = w.pbc >= 0 ? clamp(bc - w.pbc, 0, 0.5) : 0;
    w.pbc = bc; w.th += (ST / R) * dB; // run on by the beats gone: the beat clock jumping (the tempo found again) moves nobody
    const th0 = w.th;
    S.buf.fill(255); R2.fill(255, yF * N, yN * N);
    for (let i = 0; i < n; i++) D[i] = zf + R * Math.sin(th0 + (i * TAU) / n);
    D[n] = zf; D[n + 1] = zf - 0.15;
    for (let i = 0; i < n + 2; i++) { let j = i; for (; j > 0 && D[O[j - 1]] < D[i]; j--) O[j] = O[j - 1]; O[j] = i; }
    // the leap: a run-up of a metre from a standing start to a run (2.7 m/s), then a parabola under the fire's gravity over
    // 0.95 s from 1.3 m one side to 1.3 m the other at that pace, landing at the level it left, and a metre to slow down;
    // the next one comes back
    let lX = w.lx, lY = 0, lp = -1, air = false;
    if (w.leap >= 0) {
      const a = (w.leap += dt), T = 0.95, s = w.side, RU = (2 * T) / 2.6; // a metre from rest up to 2.6 / T m/s, or back to rest
      if (a < RU) { const d = (a / RU) ** 2; lX = s * (2.3 - d); lp = d * 1.9; } // a metre is two strides of 0.52 m: the feet stay planted
      else if (a < RU + T) { const q = a - RU; lX = s * (1.3 - (2.6 * q) / T); lY = (gF * q * (T - q)) / 2 / sF; air = true; } // the height (m): g q (T - q) / 2
      else if (a < 2 * RU + T) { const d = 1 - (1 - (a - RU - T) / RU) ** 2; lX = s * (-1.3 - d); lp = d * 1.9; }
      else { w.leap = -1; w.side = -s; lX = -s * 2.3; }
      w.lx = lX;
    }
    for (let oi = 0; oi < n + 2; oi++) {
      const i = O[oi];
      if (i < n) { // a dancer: facing the way round she goes, her leading hand in the trailing hand of the one ahead; her
        // stride shows across the picture only as far as she goes across it (at the sides of the ring she steps toward us)
        const a = th0 + (i * TAU) / n, X = R * Math.cos(a), z = D[i], sc = Fc / z, x = sxp(X, z), dir = -Math.sin(a) >= 0 ? 1 : -1, h = 1.65 * sc, y0 = gy(z);
        const l0 = 0.32 * tri(ph) * Math.abs(Math.sin(a)), k0 = 0.1 + 0.6 * Math.max(0, Math.cos(ph)), k1 = 0.1 + 0.6 * Math.max(0, -Math.cos(ph)), dress = i % 3 === 0 ? HOT : BRIGHT;
        const a2 = a + TAU / n, z2 = zf + R * Math.sin(a2), s2 = Fc / z2, x2 = sxp(R * Math.cos(a2), z2), d2 = -Math.sin(a2) >= 0 ? 1 : -1, h2 = 1.65 * s2, y2 = gy(z2) - 0.5 * h2 * Math.cos(0.32) - 0.3 * h2 + lerp(0.12, -0.32, w.clap) * h2;
        for (let m = 0; m < 2; m++) { // on the picture, then on her own for the water
          const ay = dancer(m ? S : r, x, y0, h, dir, ph, w.clap, dress, FIG, l0, k0, -l0, k1);
          (m ? S : r).line(x + dir * 0.24 * h, ay, x2 - d2 * 0.24 * h2, y2, FIG);
        }
        mirrorInto(S, R2, Math.min(x, x2) - 0.5 * h, Math.max(x, x2) + 0.5 * h, y0 - 1.25 * h, y0, yF, yN);
      } else if (i === n) { // the bonfire: a stack of logs, the flames with the bass, its light round it (on the water, the
        // broken column of light below)
        const fh = (0.9 + 0.4 * clamp(f.rel.bassDrive) + 0.3 * w.clap) * sF;
        glow(r, fxs, fys, 0.16 * N, 0.04 * N, 0.8);
        tri3(r, fxs - 0.5 * sF, fys, fxs + 0.5 * sF, fys, fxs, fys - 0.8 * sF, DARK);
        flame(r, fxs, fys, 1.1 * sF, fh, Math.floor(t * 12), 0, 5);
        for (let n = spawns(rnd, 6 + 10 * clamp(f.rel.bassDrive), dt); n > 0; n--) emit(w.embers, fxs + (rnd() - 0.5) * 0.5 * sF, fys - fh * 0.7, (rnd() - 0.5) * 0.6 * sF, -(2 + 2 * rnd()) * sF, 1 + rnd(), BRIGHT, rnd() * TAU);
        if (rnd() < dt * 3) emit(w.smoke, fxs, fys - fh, 0, -0.5 * sF, 4, MID + DIM, 0.6 * sF);
        targets.push({ x: fxs - 0.8 * sF, y: fys - fh, w: 1.6 * sF, h: fh });
      } else { // the couple, hand in hand, side by side, over the fire; the knees tucked in the air
        const z = D[i], sc = Fc / z, dir = -w.side, gyz = gy(z), h = 1.65 * sc;
        for (let m = 0; m < 4; m++) { // on the picture, then on their own for the water
          const x = sxp(lX - (m & 1) * 0.55 * dir, z), y = gyz - lY * sc, rr = m < 2 ? r : S;
          if (air) dancer(rr, x, y, h, dir, 0, 1, m & 1 ? COOL : HOT, FIG, 0.9, 1.7, 0.6, 1.5);
          else dancer(rr, x, y, h, dir, lp >= 0 ? lp * Math.PI : 0, 0.2, m & 1 ? COOL : HOT, FIG, lp >= 0 ? NaN : 0.05, 0.05, -0.05, 0.05);
        }
        const xa = sxp(lX, z), xb = sxp(lX - 0.55 * dir, z);
        mirrorInto(S, R2, Math.min(xa, xb) - 0.5 * h, Math.max(xa, xb) + 0.5 * h, gyz - lY * sc - 1.25 * h, gyz, yF, yN);
      }
    }
    // the river: the forest and the sky mirrored about the line they stand on (their row at 60 m), a step darker, the
    // shimmer growing toward us; the fire's light on it under the fire, broken; the folk given back over that; the mist
    for (let y = yF; y < yN; y++) {
      const sy = Math.round(2 * yA - y), row = y * N, dx = Math.round(0.8 * u * ((y - yF) / (yN - yF)) * Math.sin(y * 0.9 - t * 2.2));
      if (sy < 0) buf.fill(DARK, row, row + N);
      else for (let x = 0; x < N; x++) { const xs = x + dx; buf[row + x] = SHADE[buf[sy * N + (xs < 0 ? 0 : xs >= N ? N - 1 : xs)]]; }
      const q = (y - yF) / (yN - yF), hw = (0.03 + 0.08 * q) * N, tk = Math.floor(t * 8);
      for (let k = 0; k < 2; k++) if (hash(y, k + tk) < 0.7 - 0.4 * q) r.rect(fxs + (hash(y, k + 5 + tk) - 0.5) * 2 * hw, y, mx1(u * (1 + 2 * q)), 1, q < 0.3 ? BRIGHT : HOT);
      for (let x = 0; x < N; x++) { const c = R2[row + x], xt = x - dx; if (c !== 255 && xt >= 0 && xt < N) buf[row + xt] = SHADE[c]; }
    }
    for (let x = 0; x < N; x++) r.set(x, yF, MID);
    // the wreaths, far to near, drifting at the current where they are: 0.6 m/s midstream, nothing at the banks
    const umax = (0.45 + 0.3 * clamp(f.rel.midDrive)) * (w.kind === 'festive' ? 1.2 : 1), nW = w.kind === 'festive' ? 20 : 11;
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < nW; k++) {
      const z = w.wr[3 * k + 1];
      if ((z > 11.1) !== (pass === 0)) continue;
      const e = (z - 11.1) / 3.9, uz = umax * Math.max(0, 1 - e * e), lim = (0.55 * N * z) / Fc;
      w.wr[3 * k] += uz * dt;
      if (w.wr[3 * k] > lim + 0.5) { w.wr[3 * k] = -lim - 0.5 - rnd(); w.wr[3 * k + 1] = 7.8 + 6.8 * rnd(); }
      const sc = Fc / z, bob = Math.sin(t * 1.7 + k) * 0.02 * sc, fl = 0.7 + 0.3 * hash(k, Math.floor(t * 10)) + w.cand * 0.8;
      wreath(r, sxp(w.wr[3 * k], z), gy(z) + bob, 0.2 * sc, Hc / z * 1.6, fl, w.cand > 0.3 ? w.candC : HOT);
    }
    if (w.kind === 'mist') for (let y = yF; y < yN; y++) { const e = Math.sin(Math.PI * (y - yF) / (yN - yF)), by = (y & 7) << 3; for (let x = 0; x < N; x++) if (BAYER[by | (x & 7)] < 0.35 * e * vn((x - t * 0.02 * N) / (0.1 * N), 91)) buf[y * N + x] = LMID + DIM; } // drifting downwind
    // the near bank, its reeds
    sky(r, yN, N, FIELD);
    for (let k = 0; k < 26; k++) { const x = hash(k, 21) * N, hh = (0.04 + 0.05 * hash(k, 22)) * N, sw = Math.sin(t * 1.4 + k) * 0.006 * N; strk(r, x, yN + 0.02 * N, x + sw, yN + 0.02 * N - hh, mx1(0.6 * u), DARK); }
    plume(W, w.smoke, 0.15 * sF, 3, 3, 0.4, 5 * u);
    embers(W, w.embers, 0.1 * sF);
    // the fireflies: each wanders on its own slow curves over the banks, blinking (all together on a hat)
    const nF = Math.round((w.kind === 'festive' ? 40 : 24) * (0.5 + 0.7 * clamp(f.rel.trebDrive))), FF = w.ff;
    for (let k = 0; k < Math.min(40, nF); k++) {
      const a = FF[3 * k], b = FF[3 * k + 1], c = FF[3 * k + 2], x = (a + 0.08 * Math.sin(t * (0.3 + 0.2 * b) + 6 * c)) * N, y = (k & 1 ? yA + (0.02 + 0.12 * b) * N : yN + (0.02 + 0.1 * b) * N) + 0.015 * N * Math.sin(t * (0.5 + 0.3 * a) + 9 * b);
      if (w.blink > 0.3 || Math.sin(t * (1.5 + c) + k) > 0.4) { r.set(x, y, k % 3 ? COOL : BRIGHT); if (w.blink > 0.5) r.set(x + 1, y, COOL); }
    }
  },
};

// ---------------------------------------------------------------------------------------------- knotwork
// The carved band of a standing stone, built once (in the unit coordinates of its face, x across, y down) and kept: an
// open serpent following the stone's edge, its head and its tail curling in to cross at the foot, and a closed
// interlace of two loops against three inside it; both sampled every DS along their length. The crossings are found
// segment by segment and dealt over and under along the band so that it alternates as it goes (met the first time a
// crossing takes the opposite of the one met before it, the second time the opposite of its own first), and an
// under-pass leaves a gap in the band a little wider than the band: knotwork, no letters
const DS = 0.016, KBW = 0.11;
let KNOT = null;
function catmull(pts, out, steps) {
  const n = pts.length >> 1;
  for (let i = 0; i < n - 1; i++) {
    const i0 = Math.max(0, i - 1), i2 = i + 1, i3 = Math.min(n - 1, i + 2);
    for (let k = 0; k < steps; k++) {
      const q = k / steps, q2 = q * q, q3 = q2 * q;
      for (let c = 0; c < 2; c++) {
        const p0 = pts[2 * i0 + c], p1 = pts[2 * i + c], p2 = pts[2 * i2 + c], p3 = pts[2 * i3 + c];
        out.push(0.5 * (2 * p1 + (-p0 + p2) * q + (2 * p0 - 5 * p1 + 4 * p2 - p3) * q2 + (-p0 + 3 * p1 - 3 * p2 + p3) * q3));
      }
    }
  }
  out.push(pts[2 * n - 2], pts[2 * n - 1]);
}
function resample(dense, xs, ys, cv, id) { // every DS along the dense polyline
  let acc = DS;
  for (let i = 2; i < dense.length; i += 2) {
    const x0 = dense[i - 2], y0 = dense[i - 1], d = Math.hypot(dense[i] - x0, dense[i + 1] - y0);
    for (acc += d; acc >= DS; acc -= DS) { const q = 1 - (acc - DS) / (d || 1); xs.push(x0 + (dense[i] - x0) * q); ys.push(y0 + (dense[i + 1] - y0) * q); cv.push(id); }
  }
}
function buildKnot() {
  const xs = [], ys = [], cv = [], d1 = [], d2 = [];
  catmull([0.26, 0.6, -0.15, 0.79, -0.6, 0.86, -0.8, 0.58, -0.83, 0, -0.78, -0.5, -0.55, -0.86, 0, -0.98, 0.55, -0.86, 0.78, -0.5, 0.83, 0, 0.8, 0.58, 0.6, 0.86, 0.15, 0.79, -0.27, 0.58], d1, 24);
  resample(d1, xs, ys, cv, 0);
  const nOut = xs.length;
  // two against three at the phase that opens it widest (near π/6 + k π/3 it folds back on itself into a doubled stroke
  // that reads as a letter); begun between crossings, so the closing seam cuts none
  for (let k = 0; k <= 2400; k++) { const a = 0.3 + (k / 2400) * TAU; d2.push(0.58 * Math.sin(2 * a), 0.5 * Math.sin(3 * a) - 0.12); }
  resample(d2, xs, ys, cv, 1);
  const M = xs.length, vis = [], same = (i, j) => cv[i] === cv[j] && (Math.abs(i - j) < 4 || (cv[i] === 1 && M - nOut - Math.abs(i - j) < 4));
  for (let i = 0; i < M - 1; i++) {
    if (cv[i] !== cv[i + 1]) continue;
    for (let j = i + 2; j < M - 1; j++) {
      if (cv[j] !== cv[j + 1] || same(i, j)) continue;
      const ax = xs[i], ay = ys[i], bx = xs[i + 1], by = ys[i + 1], cx = xs[j], cy = ys[j], ex = xs[j + 1], ey = ys[j + 1];
      const den = (bx - ax) * (ey - cy) - (by - ay) * (ex - cx);
      if (!den) continue;
      const p = ((cx - ax) * (ey - cy) - (cy - ay) * (ex - cx)) / den, q = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
      if (p >= 0 && p < 1 && q >= 0 && q < 1) vis.push([i, j], [j, i]);
    }
  }
  vis.sort((a, b) => a[0] - b[0]);
  const gap = new Uint8Array(M), ovr = new Uint8Array(M), first = new Map(), gk = Math.ceil((0.9 * KBW) / DS);
  let prev = 0;
  for (const [i, j] of vis) {
    const key = Math.min(i, j) * 100000 + Math.max(i, j);
    const st = first.has(key) ? 1 - first.get(key) : 1 - prev;
    if (!first.has(key)) first.set(key, st);
    prev = st;
    for (let k = i - gk - 4; k <= i + gk + 4; k++) if (k >= 0 && k < M && cv[k] === cv[i]) { if (!st && Math.abs(k - i) <= gk) gap[k] = 1; else if (st) ovr[k] = Math.max(ovr[k], Math.abs(k - i) <= gk + 1 ? 2 : 1); }
  }
  const S = new Float32Array(M);
  for (let i = 1; i < M; i++) S[i] = S[i - 1] + (cv[i] === cv[i - 1] ? DS : 0);
  return { M, nOut, x: Float32Array.from(xs), y: Float32Array.from(ys), gap, ovr, S, len: S[M - 1] };
}

// ---------------------------------------------------------------------------------------------- runestone
// A tall carved stone in a misty field at dawn, the sun coming up low on the left (the stone's face lit from that side,
// its long shadow laid on the grass toward us and to the right): carved on it a serpent running round its edge with its
// head over its tail at the foot, and inside an interlace of loops, the bands passing over and under each other in turn.
// On every beat the next of twelve lengths of the band lights up, the ones before dimming slowly, so the knot fills with
// light and starts again; a note lights its own length (by pitch class); a kick runs a pulse of light along the whole
// band from the tail to the head. Ravens come and land on the stone and the grass (a glide that slows to a stop) and
// leave on the snares, flapping up and away; banks of mist drift across the field on the wind, the farther slower. The
// kind is the morning: fog, clear, a frost glittering on the grass, a drizzle. A drop: the serpent wakes and its coils
// slide along the knot, the scales running round and round.
const STONE_W = { fog: [3, 2, 1], clear: [2, 2, 1], frost: [1, 2, 2], drizzle: [1, 1, 2] };
const STONE = [-0.5, 1, -0.53, 0.2, -0.5, -0.5, -0.41, -0.84, -0.16, -1, 0.2, -0.98, 0.43, -0.8, 0.51, -0.42, 0.53, 0.3, 0.5, 1];
const SKY_DAWN2 = [DARK, MID + DIM, MID, LMID, BRIGHT];
const runestone = {
  init(W) {
    const { w, rnd, N } = W;
    if (!KNOT) KNOT = buildKnot();
    Object.assign(w, { N, kind: rollW(rnd, STONE_W, bandOf(W.a)), bc: 0, on: false, cnt: 0, glow: new Float32Array(12), run: -1, wake: -1, slide: 0, t0: rnd() * 20,
      birds: [0, 1].map((k) => ({ x: -0.1 * N, y: 0.2 * N, vx: 0, vy: 0, st: 1, p: k, t: 2 + 3 * k, ph: rnd() * TAU, dir: 1 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), buf = r.buf, K = KNOT;
    if (w.N !== N) runestone.init(W);
    if (f.section === 'change') w.kind = rollW(rnd, STONE_W, band);
    if (f.section === 'drop' && w.wake < 0) w.wake = 0;
    const hz = Math.round(0.6 * N), cx = 0.5 * N, base = 0.88 * N, Hs = 0.66 * N, Ws = 0.44 * N, top = base - Hs, sc = Hs / 2.6; // the stone 2.6 m tall
    beatClock(w, f, dt);
    if (w.on) { w.glow[w.cnt % 12] = 1; w.cnt++; }
    let snare = 0;
    for (const h of hits) {
      if (isLow(h) && w.run < 0) w.run = 0;
      else if (h.kind === 'snare') snare = 1;
      if (isTonal(h)) w.glow[h.pc] = 1;
    }
    for (let k = 0; k < 12; k++) w.glow[k] = Math.max(0, w.glow[k] - dt / 6);
    // the sky at dawn, the sun low on the left and rising, the low hills; the field
    sky(r, 0, hz, SKY_DAWN2);
    const sunY = hz - 0.03 * N - Math.min(0.12 * N, (t + w.t0) * 0.002 * N), sunX = 0.16 * N;
    hazeE(r, sunX, sunY, 0.2 * N, 0.12 * N, HOT, 1.1);
    ell(r, sunX, sunY, 0.035 * N, 0.035 * N, BRIGHT);
    for (let x = 0; x < N; x++) vcol(r, x, hz - (0.015 + 0.025 * vn(x / (0.25 * N), 17)) * N, hz + 1, MID + DIM);
    sky(r, hz, N, FIELD);
    if (w.kind === 'frost') for (let k = 0; k < 80; k++) if (hash(k, Math.floor(t * 4)) < 0.3) r.set(hash(k, 31) * N, hz + 2 + hash(k, 32) * (N - hz - 2), BRIGHT);
    // the shadow: the sun is low ahead of us, so the stone's shadow runs long toward us over the grass, between the lines
    // from the sun's foot on the horizon through the stone's two bottom corners and on out of the picture, the grass under
    // it a step darker
    const bl = cx - 0.5 * Ws, br = cx + 0.5 * Ws, ks = (N - base) / (base - hz);
    PB[0] = bl; PB[1] = base; PB[2] = br; PB[3] = base; PB[4] = br + (br - sunX) * ks; PB[5] = N; PB[6] = bl + (bl - sunX) * ks; PB[7] = N;
    fillPB(r, 4, 0, 1, SHADE);
    // the stone: lit on the sun's side, its thickness in shade on the other, lichen; the carved band on its face
    shape(r, STONE, cx, base - Hs / 2, Ws, Hs / 2, MID);
    shape(r, STONE, cx - 0.04 * Ws, base - Hs / 2, Ws * 0.92, Hs / 2 * 0.985, LMID);
    for (let k = 0; k < 24; k++) r.rect(cx + (hash(k, 41) - 0.6) * 0.8 * Ws, base - Hs * (0.05 + 0.85 * hash(k, 42)), mx1(u), mx1(u), k & 1 ? MID : COOL + DIM);
    const fcx = cx - 0.035 * Ws, fcy = base - Hs * 0.5, sx = Ws * 0.4, sy = Hs * 0.43, bw = KBW * sx, M = K.M;
    if (w.run >= 0 && (w.run += dt / 0.7) > 1) w.run = -1;
    let slide = 0;
    if (w.wake >= 0) { w.wake += dt; slide = smooth(Math.min(w.wake / 1.5, (16 - w.wake) / 2)); w.slide += dt * 0.9 * slide; if (w.wake > 16) w.wake = -1; }
    const runS = w.run * K.len;
    for (let pass = 0; pass < 4; pass++) for (let i = 0; i < M; i++) { // the band, then over it what passes over at a crossing
      if (K.gap[i] || (pass < 2 ? K.ovr[i] === 2 : pass === 2 ? K.ovr[i] !== 2 : !K.ovr[i])) continue; // the fill of an over-pass runs on past its outline
      const S = K.S[i], q = i < K.nOut ? S / K.S[K.nOut - 1] : 1, tp = i < K.nOut ? Math.min(1, 0.35 + q / 0.12 * 0.65) : 1, wd = (bw * tp + (pass & 1 ? 0 : 2 * mx1(0.6 * u))), x = fcx + K.x[i] * sx, y = fcy + K.y[i] * sy;
      if (!(pass & 1)) { r.rect(x - wd / 2, y - wd / 2, wd, wd, DARK); continue; }
      const gl = w.glow[Math.min(11, Math.floor((12 * S) / K.len))], scale = slide > 0 && frac(S * 22 - w.slide * 3) < 0.5;
      const c = w.run >= 0 && Math.abs(S - runS) < 0.25 ? BRIGHT : gl > 0.6 ? BRIGHT : gl > 0.25 ? HOT : scale ? HOT + DIM : MID;
      r.rect(x - wd / 2, y - wd / 2, wd, wd, c);
    }
    // the serpent's head at the end of its band, along its last stretch, the eye in it
    const n1 = K.nOut - 1, hx = fcx + K.x[n1] * sx, hy = fcy + K.y[n1] * sy, tx = K.x[n1] - K.x[n1 - 3], ty = K.y[n1] - K.y[n1 - 3], tl = Math.hypot(tx * sx, ty * sy) || 1;
    const ux = (tx * sx) / tl, uy = (ty * sy) / tl;
    quad(r, hx - uy * bw * 0.9, hy + ux * bw * 0.9, hx + ux * bw * 1.8 - uy * bw * 0.5, hy + uy * bw * 1.8 + ux * bw * 0.5, hx + ux * bw * 1.8 + uy * bw * 0.5, hy + uy * bw * 1.8 - ux * bw * 0.5, hx + uy * bw * 0.9, hy - ux * bw * 0.9, slide > 0 ? HOT : MID);
    r.set(hx + ux * bw * 0.9 - uy * bw * 0.3, hy + uy * bw * 0.9 + ux * bw * 0.3, BRIGHT);
    targets.push({ x: cx - Ws / 2, y: top, w: Ws, h: Hs });
    // the mist banks across the field on the wind from the left, the farther slower and higher
    const mist = w.kind === 'fog' ? 0.75 : w.kind === 'drizzle' ? 0.45 : 0.3;
    for (let k = 0; k < 3; k++) {
      const d = 3 - k, yc = hz + (0.04 + 0.11 * k) * N, th = (0.025 + 0.02 * k) * N, dr = ((t + w.t0) * 0.02 * N + f.rel.midClock * 0.006 * N) / d;
      for (let y = Math.max(0, Math.round(yc - th)), ye = Math.min(N, Math.round(yc + th)); y < ye; y++) {
        const e = 1 - Math.abs(y + 0.5 - yc) / th, by = (y & 7) << 3, row = y * N;
        for (let x = 0; x < N; x++) if (BAYER[by | (x & 7)] < mist * e * smooth((vn((x - dr) / (0.14 * N), 50 + k) - 0.25) * 1.6)) buf[row + x] = LMID;
      }
    }
    // the ravens: to the stone's top or the grass, gliding in and slowing to land; off on a snare, flapping up and away
    for (const b of w.birds) {
      const px = b.p === 0 ? cx + 0.02 * Ws : b.p === 1 ? 0.22 * N : 0.8 * N, py = b.p === 0 ? top + 0.02 * Hs : b.p === 1 ? base - 0.01 * N : base + 0.04 * N;
      const bt = 0.5 * sc * (b.p === 0 ? 1 : (py - hz) / (base - hz)), bs = (b.bs = b.bs > 0 ? follow(b.bs, bt, dt, b.st === 0 ? 0.05 : 0.8) : bt); // in scale with where it sits, eased in flight
      if (b.st === 0) {
        crow(r, px, py, bs, BLACK, false, 0, b.dir, Math.sin(t * 2.5 + b.ph));
        if (snare && rnd() < 0.7) { b.st = 1; b.t = 0; b.vx = (rnd() < 0.5 ? -1 : 1) * 3 * sc; b.vy = -3 * sc; b.x = px; b.y = py - 0.3 * bs; }
        continue;
      }
      b.t += dt;
      if (b.st === 1) { b.vy = follow(b.vy, -1.5 * sc, dt, 0.4); if (b.t > 3.5 + 2 * hash(b.p, Math.floor(t))) { b.st = 2; b.p = (b.p + 1 + Math.floor(rnd() * 2)) % 3; if (w.birds[0] !== b && w.birds[0].st === 0 && w.birds[0].p === b.p) b.p = (b.p + 1) % 3; if (w.birds[1] !== b && w.birds[1].st === 0 && w.birds[1].p === b.p) b.p = (b.p + 1) % 3; } }
      else { const dx = px - b.x, dy = py - 0.3 * bs - b.y, dd = Math.hypot(dx, dy), v = Math.min(5 * sc, dd * 1.5); b.vx = follow(b.vx, (dx / (dd || 1)) * v, dt, 0.3); b.vy = follow(b.vy, (dy / (dd || 1)) * v, dt, 0.3); if (dd < mx1(u)) { b.st = 0; b.dir = dx >= 0 ? 1 : -1; } }
      b.x += b.vx * dt; b.y += b.vy * dt;
      crow(r, b.x, b.y, bs, BLACK, true, b.st === 1 ? Math.sin(t * 24 + b.ph) : Math.hypot(b.vx, b.vy) < 1.5 * sc ? 0.8 : 0.1, b.vx >= 0 ? 1 : -1);
    }
    if (w.kind === 'drizzle') rain(r, N, u, t, Math.round(50 * u * (0.5 + clamp(f.rel.trebDrive))), 4 * sc * 3, 0.1, 0.1 * 4 * sc * 3 * t, LMID + DIM);
  },
};

// ---------------------------------------------------------------------------------------------- auroralake
// A frozen lake at night under the northern lights, from its shore (a pinhole camera 3 m up): the curtains of the aurora
// fold and ripple across the sky with the mids, their colours turning with the pitch class of the notes, brighter on the
// beat, and the smooth black ice gives them back faintly, mirrored about the horizon (they are far enough off that the
// horizon is their waterline); across the lake, 120 m off, a longhouse on the far shore among the scrub (both sized for
// that distance), its door lit and its smoke rising from the roof and slowing as it cools, drifting off on the wind the
// snow drifts on; stars. A kick cracks the ice: a crack runs out from a point on it both
// ways at speed, wandering and branching, laid on the ice in perspective (the near ones longer on the screen), bright
// when new, then dark, and it heals over in time; a snare is a surge of the lights, a hat a glitter on the snow. The kind
// is the night: calm (green curtains), a moon, snowing, a storm of the lights (bright, quick, pink hems). A drop: the
// corona straight overhead, rays streaming down from one point above the top of the picture.
const LAKE_W = { calm: [3, 2, 1], moon: [2, 2, 1], snow: [2, 1, 1], storm: [1, 2, 3] };
const LAKE = { calm: { k: 0.8, set: 0, snow: 0 }, moon: { k: 0.55, set: 3, snow: 0 }, snow: { k: 0.5, set: 0, snow: 80 }, storm: { k: 1.15, set: 1, snow: 0 } };
const SKY_LAKE = [DARK + DIM, DARK + DIM, DARK, MID + DIM], ICE = [MID + DIM, DARK, DARK + DIM];
const GLEAM = Uint8Array.from({ length: 18 }, (_, c) => (c === COOL || c === HOT || c === BRIGHT || c === LMID ? c + DIM : 0)); // what of the sky the ice gives back, dimmed
const auroralake = {
  init(W) {
    const { w, rnd, N } = W, kind = rollW(rnd, LAKE_W, bandOf(W.a)), A = aurora0(rnd);
    for (const C of A.c) C.set = C.old = LAKE[kind].set;
    Object.assign(w, { N, kind, bc: 0, on: false, A, surge: 0, cor: -1, tips: new Float32Array(48 * 5), nt: 0, seg: new Float32Array(900 * 5), ns: 0, glit: 0,
      smoke: pool(30), flakes: pool(160), tabN: 0, ta: null, td: null });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), buf = r.buf;
    if (w.N !== N) auroralake.init(W);
    if (f.section === 'change') { w.kind = rollW(rnd, LAKE_W, band); for (let k = 0; k < 3; k++) auroraHue(w.A, LAKE[w.kind].set * 3 + k); }
    if (f.section === 'drop' && w.cor < 0) w.cor = 0;
    // the camera: 3 m up, F = 1.1 N, the far shore 120 m off (its line ys under the horizon, sS cells a metre there); the
    // wind 0.4 m/s
    const K = LAKE[w.kind], hz = Math.round(0.56 * N), cx = 0.5 * N, Fc = 1.1 * N, Hc = 3, zs = 120, ys = Math.round(hz + (Hc * Fc) / zs), sS = Fc / zs, wind = 0.4 * sS;
    beatClock(w, f, dt);
    let kick = 0;
    for (const h of hits) {
      if (isLow(h)) kick = Math.max(kick, h.strength);
      else if (h.kind === 'snare') w.surge = 1;
      else if (h.kind === 'hat') w.glit = 1;
      if (isTonal(h)) auroraHue(w.A, h.pc);
    }
    w.surge *= Math.exp(-dt * 2.5); w.glit = Math.max(0, w.glit - dt * 3);
    let cor = 0;
    if (w.cor >= 0) { w.cor += dt; cor = smooth(Math.min(w.cor / 2.5, (18 - w.cor) / 3)); if (w.cor > 18) w.cor = -1; }
    // the sky: the stars, the moon, the curtains (stronger with the level, on the beat, in a surge and under the corona)
    sky(r, 0, hz, SKY_LAKE);
    stars(r, 120, 91, 0, N, 0, hz, LMID, Math.floor(t * 3));
    stars(r, 16, 391, 0, N, 0, hz * 0.8, BRIGHT, Math.floor(t * 2.1));
    if (w.kind === 'moon') { ell(r, 0.82 * N, 0.14 * N, 0.04 * N, 0.04 * N, BRIGHT); ell(r, 0.835 * N, 0.13 * N, 0.034 * N, 0.034 * N, DARK + DIM); }
    const ak = clamp(K.k * (0.75 + 0.35 * f.level + 0.3 * w.surge + 0.15 * f.beat.pulse) + 0.4 * cor, 0, 1.6);
    auroraDraw(r, W, w.A, 0.02 * N, hz - 0.06 * N, ak);
    if (cor > 0.01) { // the corona: rays streaming down from a point overhead, above the top of the picture, the near
      // ones longer; the table of each cell's bearing and distance from that point is kept per size
      if (w.tabN !== N) {
        w.tabN = N; w.ta = new Float32Array(N * N); w.td = new Float32Array(N * N);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 + 0.35 * N; w.ta[y * N + x] = Math.atan2(dx, dy) * 40; w.td[y * N + x] = Math.hypot(dx, dy) / N; }
      }
      const dr = f.rel.midClock * 0.8 + t * 0.4, ta = w.ta, td = w.td;
      for (let y = 0; y < hz - 0.04 * N; y++) {
        const by = (y & 7) << 3;
        for (let x = 0, i = y * N; x < N; x++, i++) {
          const d = td[i], fall = d < 0.45 ? 1 : Math.max(0, 1 - (d - 0.45) * 2.2), v = vn(ta[i] + dr, 77), I = cor * fall * Math.max(0, v - 0.45) * 2.6, th = BAYER[by | (x & 7)];
          if (th < I) buf[i] = I > 0.85 ? BRIGHT : d > 0.6 && th < I * 0.2 ? HOT : COOL;
        }
      }
    }
    // the far shore and the forest on it; the longhouse: low walls, a turf roof curved along its ridge with snow on it,
    // the door lit, the smoke out of the hole in the ridge
    for (let x = 0; x < N; x++) vcol(r, x, hz - (0.018 + 0.03 * vn(x / (0.08 * N), 23) * vn(x / (0.3 * N), 24)) * N, ys + 1, DARK + DIM);
    const lx0 = 0.12 * N, lx1 = 0.34 * N, lg = ys, lh = 0.024 * N, rf = 0.05 * N, lm = (lx0 + lx1) / 2;
    r.rect(lx0, lg - lh, lx1 - lx0, lh, DARK);
    PB[0] = lx0 - 0.01 * N; PB[1] = lg - lh; PB[2] = lx0 + 0.03 * N; PB[3] = lg - lh - rf * 0.7; PB[4] = lm; PB[5] = lg - lh - rf; PB[6] = lx1 - 0.03 * N; PB[7] = lg - lh - rf * 0.7; PB[8] = lx1 + 0.01 * N; PB[9] = lg - lh;
    fillPB(r, 5, MID + DIM);
    for (let x = Math.round(lx0 + 0.01 * N); x < lx1 - 0.01 * N; x++) { const q = (x - lx0) / (lx1 - lx0), y = lg - lh - rf * (1 - 1.2 * (q - 0.5) * (q - 0.5) * 2.4); r.rect(x, y, 1, mx1(u * 1.2), BRIGHT); }
    r.rect(lm + 0.03 * N, lg - lh * 0.8, 0.012 * N, lh * 0.8, HOT);
    glow(r, lm + 0.036 * N, lg + 0.01 * N, 0.05 * N, 0.012 * N, 0.8);
    if (w.on || rnd() < dt * 0.5) emit(w.smoke, lm, lg - lh - rf, 0, -1.2 * sS, 6, MID, 1.5 * sS);
    plume(W, w.smoke, wind, 3, 1.4, 0.6, 4 * u);
    // the ice: black and smooth, darker toward us, giving back the lights faintly; snow lying on it in drifts
    sky(r, ys, N, ICE);
    for (let y = ys; y < N; y++) {
      const sy = 2 * hz - 1 - y;
      if (sy < 0) break;
      const by = (y & 7) << 3, row = y * N, src = sy * N, k = 0.3 * (1 - (y - hz) / (N - hz));
      for (let x = 0; x < N; x++) { const g = GLEAM[buf[src + x]]; if (g && BAYER[by | (x & 7)] < k) buf[row + x] = g; }
    }
    for (let k = 0; k < 14; k++) { const Z = 9 + 100 * hash(k, 51) ** 2, sc = Fc / Z, x = cx + (hash(k, 52) - 0.5) * 1.6 * N, y = hz + (Hc * Fc) / Z, rx = (0.5 + 0.9 * hash(k, 53)) * sc; ell(r, x, y, rx, Math.max(0.6, (rx * Hc) / Z), k & 1 ? MID : MID + DIM); } // drifts, flattened by the view
    if (w.kind === 'moon') for (let y = ys + 1; y < N; y += 2) if (hash(y, Math.floor(t * 6)) < 0.5) { const q = (y - hz) / (N - hz); r.rect(0.82 * N + (hash(y, 3 + Math.floor(t * 6)) - 0.5) * (0.02 + 0.12 * q) * N, y, mx1(u * (1 + q)), 1, LMID); }
    if (w.glit > 0) for (let k = 0; k < 40; k++) if (hash(k, Math.floor(t * 20)) < w.glit * 0.6) r.set(hash(k, 61) * N, ys + 2 + hash(k, 62) * (N - ys - 2), BRIGHT);
    // the cracks: on a kick, out both ways from a point on the ice at 22 m/s in steps of 45 cm, each step turned a little,
    // a branch now and then (two generations); each segment laid on the ice and seen through the camera
    if (kick > 0.5 && (w.crk = (w.crk || 0) - 1) < 0) { // a crack at most every other kick
      w.crk = 1;
      const Z = 9 + 28 * rnd(), X = (rnd() - 0.5) * 0.7 * Z, a = rnd() * Math.PI;
      for (let m = 0; m < 2; m++) if (w.nt < 48) { const o = 5 * w.nt++; w.tips[o] = X; w.tips[o + 1] = Z; w.tips[o + 2] = a + m * Math.PI; w.tips[o + 3] = 2 + 5 * kick; w.tips[o + 4] = 0; }
      s.shake = Math.max(s.shake, 0.12 * kick);
    }
    const T = w.tips, G = w.seg;
    w.go = w.nt ? (w.go || 0) + 22 * dt : 0; // the way run this frame, in whole steps, the rest carried: 22 m/s at any dt
    const steps = Math.floor(w.go / 0.45);
    w.go -= steps * 0.45;
    for (let k = 0; k < w.nt;) {
      const o = 5 * k;
      for (let st = 0; st < steps && T[o + 3] > 0 && w.ns < 900; st++) {
        T[o + 2] += (rnd() - 0.5) * 0.55;
        const nx = T[o] + Math.cos(T[o + 2]) * 0.45, nz = Math.max(8, T[o + 1] + Math.sin(T[o + 2]) * 0.45), so = 5 * w.ns++;
        G[so] = T[o]; G[so + 1] = T[o + 1]; G[so + 2] = nx; G[so + 3] = nz; G[so + 4] = 0;
        T[o] = nx; T[o + 1] = nz; T[o + 3] -= 0.45;
        if (rnd() < 0.1 && T[o + 4] < 2 && w.nt < 48) { const q = 5 * w.nt++; T[q] = nx; T[q + 1] = nz; T[q + 2] = T[o + 2] + (rnd() < 0.5 ? -1 : 1) * (0.5 + 0.5 * rnd()); T[q + 3] = T[o + 3] * 0.5; T[q + 4] = T[o + 4] + 1; }
      }
      if (T[o + 3] <= 0 || w.ns >= 900) { w.nt--; T.copyWithin(o, 5 * w.nt, 5 * w.nt + 5); } else k++;
    }
    let n = 0;
    for (let k = 0; k < w.ns; k++) {
      const o = 5 * k, a = (G[o + 4] += dt);
      if (a > 9) continue;
      const z0 = G[o + 1], z1 = G[o + 3];
      r.line(cx + (G[o] * Fc) / z0, hz + (Hc * Fc) / z0, cx + (G[o + 2] * Fc) / z1, hz + (Hc * Fc) / z1, a < 0.25 ? BRIGHT : a < 2 ? LMID : a < 5 ? MID : DARK);
      if (n !== k) G.copyWithin(5 * n, o, o + 5);
      n++;
    }
    w.ns = n;
    if (K.snow) flakes(W, w.flakes, Math.round(K.snow * u * (0.5 + 0.8 * clamp(f.rel.trebDrive))), Fc / 6, wind * (zs / 6), hz, (Hc * Fc) / 6, LMID); // (depth 1 is 6 m off)
    targets.push({ x: lx0, y: lg - lh - rf, w: lx1 - lx0, h: lh + rf });
  },
};

// ---------------------------------------------------------------------------------------------- meadhall
// Inside a long hall, from its near end down its length (one-point perspective, the eye 1.3 m up, seated): the long hearth down
// the middle of the floor with its flames and the sparks going up from them, slowing as they cool, to the smoke that
// hangs under the roof beams; the trusses and posts going away, plain shields on the walls between them (seen at a
// slant, narrower the farther), the long tables down both sides with the warriors at them, the far ones smaller, the
// high seat at the far end; a skald on a stool in front with a lyre. On the beat the horns go up (half of them on one
// beat, half on the next, a wave down the tables), the kicks are fists on the tables (the cups jump and fall back),
// a snare is a toast (every horn up), a hat a crackle of sparks, a note a pluck of the lyre (its strings shiver and die
// away). The kind is the night: a feast, late (few left, the fire low), midwinter (a big fire), a storm outside. A
// drop: the door in the right wall bursts open: the snowy night outside, the snow and the wind gusting in across the
// hall, the flames leaning away from the door, the smoke and the sparks blown with them; after a while it swings shut.
const HALL_W = { feast: [2, 2, 3], late: [3, 2, 0], yule: [1, 2, 2], storm: [1, 2, 2] };
const HALL = { feast: { men: 8, fire: 1 }, late: { men: 4, fire: 0.55 }, yule: { men: 7, fire: 1.35 }, storm: { men: 6, fire: 0.9 } };
// the camera: (cx, hy) where the hall's lines meet, F the focal length in cells, Hc the eye's height in metres; a point
// X across, Y up, z ahead lands at (PX, PY)
const CAM = { cx: 0, hy: 0, F: 1, Hc: 1.6 };
const PX = (X, z) => CAM.cx + (X * CAM.F) / z, PY = (Y, z) => CAM.hy - ((Y - CAM.Hc) * CAM.F) / z;
function quad3(r, X0, Y0, z0, X1, Y1, z1, X2, Y2, z2, X3, Y3, z3, c) { quad(r, PX(X0, z0), PY(Y0, z0), PX(X1, z1), PY(Y1, z1), PX(X2, z2), PY(Y2, z2), PX(X3, z3), PY(Y3, z3), c); }
function line3(r, X0, Y0, z0, X1, Y1, z1, wd, c) { strk(r, PX(X0, z0), PY(Y0, z0), PX(X1, z1), PY(Y1, z1), wd, c); }
const meadhall = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { N, kind: rollW(rnd, HALL_W, bandOf(W.a)), bc: 0, on: false, pound: 0, toast: 0, pluck: -1, door: -1, ang: 0, gust: 0,
      cup: new Float32Array(32), cupV: new Float32Array(32), str: new Float32Array(6), snow: pool(220), embers: pool(160) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a);
    if (w.N !== N) meadhall.init(W);
    if (f.section === 'change') w.kind = rollW(rnd, HALL_W, band);
    if (f.section === 'drop' && w.door < 0) { w.door = 0; s.shake = Math.max(s.shake, 0.4); }
    CAM.cx = 0.5 * N; CAM.hy = 0.4 * N; CAM.F = 0.78 * N; CAM.Hc = 1.3;
    const K = HALL[w.kind], F = CAM.F, bc = beatClock(w, f, dt), g = 9.8;
    for (const h of hits) {
      if (isLow(h)) { w.pound = 1; for (let k = 0; k < 32; k++) if (w.cup[k] <= 0.001) w.cupV[k] = (0.6 + 0.8 * rnd()) * h.strength; }
      else if (h.kind === 'snare') w.toast = 1;
      else if (h.kind === 'hat') for (let n = 0; n < 5; n++) { const z = 8 + 13 * rnd(); emit(w.embers, PX((rnd() - 0.5) * 0.8, z), PY(0.3, z), 0, -(1.5 + 2 * rnd()) * F / z, 1.5, BRIGHT, rnd() * TAU); }
      if (isTonal(h)) { w.pluck = 0; w.str[h.pc % 6] = 1; w.str[(h.pc + 3) % 6] = 0.6; }
    }
    w.pound = Math.max(0, w.pound - dt * 5); w.toast = Math.max(0, w.toast - dt * 1.6);
    // the door: it bursts open (0.3 s), stands open, swings shut after nine seconds; the gust with it
    if (w.door >= 0) { const a = (w.door += dt); w.ang = a < 0.3 ? 1.45 * smooth(a / 0.3) : a < 9 ? 1.45 : 1.45 * (1 - smooth((a - 9) / 1.5)); w.gust = a < 5 ? 1 : Math.max(0, 1 - (a - 5) / 4); if (a > 10.5) { w.door = -1; w.ang = 0; } }
    else w.gust = 0;
    // the hall: the floor, the walls, the roof going up to the ridge, the far wall and the high seat
    quad3(r, -4.5, 0, 1.2, 4.5, 0, 1.2, 4.5, 0, 28, -4.5, 0, 28, MID + DIM);
    quad3(r, -4.5, 0, 1.2, -4.5, 2.4, 1.2, -4.5, 2.4, 28, -4.5, 0, 28, DARK);
    quad3(r, 4.5, 0, 1.2, 4.5, 2.4, 1.2, 4.5, 2.4, 28, 4.5, 0, 28, DARK);
    quad3(r, -4.5, 2.4, 1.2, 0, 6.5, 1.2, 0, 6.5, 28, -4.5, 2.4, 28, DARK + DIM);
    quad3(r, 4.5, 2.4, 1.2, 0, 6.5, 1.2, 0, 6.5, 28, 4.5, 2.4, 28, DARK + DIM);
    quad3(r, -4.5, 0, 28, 4.5, 0, 28, 4.5, 2.4, 28, -4.5, 2.4, 28, DARK + DIM);
    tri3(r, PX(-4.5, 28), PY(2.4, 28), PX(4.5, 28), PY(2.4, 28), PX(0, 28), PY(6.5, 28), DARK + DIM);
    quad3(r, -0.6, 0, 27.5, 0.6, 0, 27.5, 0.6, 1.9, 27.5, -0.6, 1.9, 27.5, MID);
    for (let z = 2; z < 28; z += 1.1) { line3(r, -4.5, 0, z, -4.5, 2.4, z, 1, DARK + DIM); line3(r, 4.5, 0, z, 4.5, 2.4, z, 1, DARK + DIM); } // the planks
    // the doorway in the right wall, the night and the snow outside it, the door swung in on its hinge
    if (w.ang > 0.01) {
      quad3(r, 4.5, 0, 8.6, 4.5, 2, 8.6, 4.5, 2, 10, 4.5, 0, 10, LMID);
      for (let k = 0; k < 20; k++) { const z = 8.6 + 1.4 * hash(k, 3), Y = 0.3 + 1.7 * frac(hash(k, 4) - t * 0.5); r.set(PX(4.5, z), PY(Y, z), BRIGHT); }
      const sa = Math.sin(w.ang), ca = Math.cos(w.ang);
      quad3(r, 4.5, 0, 8.6, 4.5, 2, 8.6, 4.5 - 1.4 * sa, 2, 8.6 + 1.4 * ca, 4.5 - 1.4 * sa, 0, 8.6 + 1.4 * ca, DARK + DIM);
    } else { quad3(r, 4.5, 0, 8.6, 4.5, 2, 8.6, 4.5, 2, 10, 4.5, 0, 10, DARK + DIM); line3(r, 4.5, 0, 8.65, 4.5, 2, 8.65, 1, MID); }
    // the shields on the walls between the trusses, round, seen at a slant: as wide as the depth they span
    for (let k = 0; k < 5; k++) for (let sd = -1; sd <= 1; sd += 2) {
      const z = 6 + 4 * k, R = 0.42, ry = (R * F) / z, rx = Math.abs(PX(4.5, z + R) - PX(4.5, z - R)) / 2, pat = (k + (sd > 0 ? 2 : 0)) & 3;
      if (sd > 0 && z > 8 && z < 11) continue; // no shield over the door
      roundShield(r, PX(sd * 4.5, z), PY(1.8, z), rx, ry, pat & 1 ? HOT : COOL, pat & 2 ? LMID : DARK, pat, DARK + DIM, LMID);
    }
    // the trusses, far to near: posts, tie beam, rafters, king post
    for (let z = 24; z >= 4; z -= 4) {
      const wd = mx1((0.2 * F) / z);
      line3(r, -3.4, 0, z, -3.4, 2.4, z, wd, DARK); line3(r, 3.4, 0, z, 3.4, 2.4, z, wd, DARK);
      line3(r, -4.5, 2.4, z, 4.5, 2.4, z, wd, DARK);
      line3(r, -4.5, 2.4, z, 0, 6.5, z, wd, DARK); line3(r, 4.5, 2.4, z, 0, 6.5, z, wd, DARK);
      line3(r, 0, 2.4, z, 0, 6.5, z, wd, DARK);
    }
    // the smoke hanging under the ridge between the beams, drifting toward the smoke hole (and away from an open door)
    for (let k = 0; k < 9; k++) { const z = 5 + 2.5 * k, X = -1.5 * w.gust * (k / 9) + 0.6 * Math.sin(t * 0.3 + k), sc = F / z; hazeE(r, PX(X, z), PY(5.2, z), 2.2 * sc, 0.8 * sc, MID + DIM, 0.35 + 0.15 * K.fire); }
    // the warriors at the tables, far to near on both sides, facing the middle: a horn up on their beat (every other
    // man on the next one), all of them on a toast, a fist on the table on a kick
    const men = K.men, q = frac(bc), even = Math.floor(bc) & 1;
    for (let i = men - 1; i >= 0; i--) for (let sd = -1; sd <= 1; sd += 2) {
      const z = 3.4 + (21 / men) * i + (sd > 0 ? 1 : 0), sc = F / z, dir = -sd, x = PX(sd * 3.55, z), hip = PY(0.45, z), sh = PY(1.05, z), h = 1.75 * sc, col = z > 15 ? FIG + DIM : FIG;
      const mine = ((i + (sd > 0 ? 1 : 0)) & 1) === even, up = Math.max(w.toast, mine ? Math.sin(Math.PI * Math.min(1, q / 0.7)) : 0);
      strk(r, x, hip, x + dir * 0.03 * h, sh, mx1(0.16 * h), col);
      const hx = x + dir * 0.06 * h, hy = sh - 0.1 * h;
      ell(r, hx, hy, 0.07 * h, 0.075 * h, col);
      tri3(r, hx + dir * 0.02 * h, hy + 0.02 * h, hx + dir * 0.08 * h, hy + 0.02 * h, hx + dir * 0.03 * h, hy + 0.13 * h, LMID); // a beard
      limb(r, x, sh + 0.02 * h, 0.75 - 0.4 * w.pound, 0.4, 0.16 * h, 0.15 * h, dir, mx1(0.06 * h), dim(col), 1); // the far arm, a fist on the table
      limb(r, x + dir * 0.02 * h, sh + 0.02 * h, lerp(0.95, 2.55, up), lerp(0.5, 1.2, up), 0.16 * h, 0.15 * h, dir, mx1(0.065 * h), col, 1); // the horn arm
      const ang = lerp(-1.0, 2.2, up), ex = LX + dir * Math.cos(ang) * 0.18 * h, ey = LY - Math.sin(ang) * 0.18 * h;
      quad(r, LX - 0.025 * h, LY, LX + 0.025 * h, LY, ex + dir * 0.008 * h, ey, ex, ey - 0.01 * h, BRIGHT); // the horn
      // the cup in front of him on the table: thrown up by the fist, falling back (drawn on the table, below)
      const ci = i * 2 + (sd > 0 ? 1 : 0);
      w.cupV[ci] -= g * dt; w.cup[ci] = Math.max(0, w.cup[ci] + w.cupV[ci] * dt); if (w.cup[ci] <= 0) w.cupV[ci] = 0;
    }
    // the tables, down both sides in front of them, and the cups standing on them, far to near
    quad3(r, -3.0, 0.75, 2.6, -2.2, 0.75, 2.6, -2.2, 0.75, 26, -3.0, 0.75, 26, MID);
    quad3(r, -2.2, 0.75, 2.6, -2.2, 0.62, 2.6, -2.2, 0.62, 26, -2.2, 0.75, 26, LMID);
    quad3(r, 3.0, 0.75, 3.6, 2.2, 0.75, 3.6, 2.2, 0.75, 26, 3.0, 0.75, 26, MID);
    quad3(r, 2.2, 0.75, 3.6, 2.2, 0.62, 3.6, 2.2, 0.62, 26, 2.2, 0.75, 26, LMID);
    for (let i = men - 1; i >= 0; i--) for (let sd = -1; sd <= 1; sd += 2) {
      const z = 3.4 + (21 / men) * i + (sd > 0 ? 1 : 0), sc = F / z, ci = i * 2 + (sd > 0 ? 1 : 0);
      r.rect(PX(sd * 2.45, z) - 0.04 * sc, PY(0.75 + 0.12 + w.cup[ci], z), mx1(0.08 * sc), mx1(0.12 * sc), LMID);
    }
    // the long hearth: its stone kerb, the bed of embers, the flames along it far to near, leaning away from the door
    quad3(r, -0.75, 0.02, 4.4, 0.75, 0.02, 4.4, 0.75, 0.02, 22, -0.75, 0.02, 22, MID);
    quad3(r, -0.55, 0.03, 4.7, 0.55, 0.03, 4.7, 0.55, 0.03, 21.7, -0.55, 0.03, 21.7, HOT + DIM);
    const lean = -0.9 * w.gust + (w.kind === 'storm' ? 0.2 * Math.sin(t * 7) : 0), fh = (0.55 + 0.35 * clamp(f.rel.bassDrive) + 0.3 * w.pound) * K.fire, tt = Math.floor(t * 12);
    for (let k = 5; k >= 0; k--) { const z = 5.6 + 3.1 * k, sc = F / z; flame(r, PX(0, z), PY(0.05, z), 1.0 * sc, fh * sc * (0.8 + 0.4 * hash(k, 5)), tt + k * 3, lean, 20 + k); }
    glow(r, PX(0, 7), PY(0, 7), 0.32 * N, 0.13 * N, 0.5 + 0.2 * K.fire);
    for (let n = spawns(rnd, 6 * K.fire + 10 * w.pound, dt); n > 0; n--) { const z = 5.5 + 15 * rnd(); emit(w.embers, PX((rnd() - 0.5) * 0.8, z), PY(fh * 0.6, z), 0, -(1.5 + 2 * rnd()) * F / z, 1.2 + rnd(), BRIGHT, rnd() * TAU); }
    embers(W, w.embers, -w.gust * 0.05 * N);
    targets.push({ x: PX(-0.8, 5.6), y: PY(fh * 1.2, 5.6), w: PX(0.8, 5.6) - PX(-0.8, 5.6), h: PY(0, 5.6) - PY(fh * 1.2, 5.6) });
    // the skald on his stool at the front right, facing in, the lyre on his knee: a note plucks it and the strings
    // shiver, dying away
    const zs = 2.8, ss = F / zs, xs = PX(1.45, zs), hs = PY(0.5, zs), hh = 1.75 * ss, shs = hs - 0.32 * hh;
    if (w.pluck >= 0 && (w.pluck += dt) > 0.4) w.pluck = -1;
    r.rect(xs - 0.12 * hh, hs, 0.24 * hh, PY(0, zs) - hs, DARK);
    strk(r, xs, hs, xs - 0.18 * hh, hs + 0.02 * hh, mx1(0.1 * hh), FIG); strk(r, xs - 0.18 * hh, hs + 0.02 * hh, xs - 0.2 * hh, PY(0, zs), mx1(0.09 * hh), FIG);
    strk(r, xs, hs, xs, shs, mx1(0.16 * hh), FIG);
    ell(r, xs - 0.03 * hh, shs - 0.1 * hh, 0.07 * hh, 0.075 * hh, FIG);
    tri3(r, xs - 0.05 * hh, shs - 0.08 * hh, xs - 0.1 * hh, shs - 0.08 * hh, xs - 0.07 * hh, shs + 0.03 * hh, LMID);
    const lx = xs - 0.22 * hh, ly0 = hs - 0.02 * hh, ly1 = hs - 0.36 * hh, lw = 0.13 * hh;
    strk(r, lx - lw / 2, ly0, lx - lw / 2 - 0.02 * hh, ly1, mx1(0.025 * hh), MID); strk(r, lx + lw / 2, ly0, lx + lw / 2 + 0.02 * hh, ly1, mx1(0.025 * hh), MID);
    strk(r, lx - lw / 2 - 0.03 * hh, ly1, lx + lw / 2 + 0.03 * hh, ly1, mx1(0.025 * hh), MID); quad(r, lx - lw / 2, ly0, lx + lw / 2, ly0, lx + lw / 2, ly0 - 0.06 * hh, lx - lw / 2, ly0 - 0.06 * hh, MID);
    for (let k = 0; k < 6; k++) {
      const sx0 = lx - lw * 0.38 + (k * lw * 0.76) / 5, a = (w.str[k] = Math.max(0, w.str[k] - dt * 1.8)), d = a * 0.012 * hh * Math.sin(t * 90 + k * 1.7), ym = (ly0 + ly1) / 2;
      r.line(sx0, ly0 - 0.06 * hh, sx0 + d, ym, a > 0.3 ? BRIGHT : LMID); r.line(sx0 + d, ym, sx0, ly1, a > 0.3 ? BRIGHT : LMID);
    }
    reach(r, xs - 0.01 * hh, shs + 0.03 * hh, lx + (w.pluck >= 0 ? lerp(-0.3, 0.3, w.pluck / 0.4) * lw : 0), (ly0 + ly1) / 2, 0.16 * hh, 0.15 * hh, -1, mx1(0.06 * hh), FIG);
    reach(r, xs - 0.01 * hh, shs + 0.03 * hh, lx + lw * 0.5, ly1 + 0.03 * hh, 0.16 * hh, 0.15 * hh, -1, mx1(0.06 * hh), dim(FIG), true);
    // the snow and the wind through the open door: in across the hall toward the far wall, the air taking the gust off
    // it, falling at a snowflake's pace; each flake seen through the camera
    const P = w.snow;
    if (w.gust > 0.05) for (let n = spawns(rnd, 120 * w.gust, dt); n > 0; n--) emit(P, 4.4, 0.1 + 1.9 * rnd(), -(4 + 5 * rnd()) * w.gust, 0, 3, BRIGHT, 8.6 + 1.4 * rnd());
    for (let k = 0; k < P.n;) {
      P.vx[k] = follow(P.vx[k], -0.3, dt, 1.4); P.vy[k] = follow(P.vy[k], -1, dt, 0.3);
      P.x[k] += P.vx[k] * dt; P.y[k] += P.vy[k] * dt; P.s[k] += (rnd() - 0.5) * 0.6 * dt;
      if ((P.age[k] += dt) > P.life[k] || P.y[k] < 0 || P.x[k] < -4.4) { kill(P, k); continue; }
      const z = P.s[k], sz = mx1((0.04 * F) / z);
      r.rect(PX(P.x[k], z), PY(P.y[k], z), sz, sz, BRIGHT);
      k++;
    }
  },
};

// ---------------------------------------------------------------------------------------------- volkhv
// An old wise man in a forest glade under the stars: a long robe, a white beard to his belt, a tall pointed hood, a staff
// in his hand; spruces dark round the glade, an owl on a bough, a flat stone beside him with a scroll of birch bark on it
// (blank: the bark's own dark marks, no letters). The sky turns slowly about the pole, the wheel quicker with the mids;
// the staff taps the ground on every beat (lifted through the beat, down on it, a ring of light where it strikes, more
// on a kick); the owl turns its head on the snares (the face sliding round to profile and back); the notes join the
// stars of a constellation one line at a time, each line drawn out from star to star, turning with the sky; the scroll
// unrolls a little every bar, the roll getting thinner as it goes, and rolls up again on a new section. The kind is the
// night: winter (snow), summer (fireflies), mist on the glade, a moon. A drop: a falling star across the sky, and the
// sky's long exposure, every star drawn out into its arc round the pole.
const OLD_W = { winter: [2, 1, 1], summer: [2, 2, 1], mist: [2, 2, 1], moon: [1, 2, 2] };
const SKY_OLD = [DARK + DIM, DARK + DIM, DARK, DARK, MID + DIM];
const volkhv = {
  init(W) {
    const { w, rnd, N } = W, n = 110, st = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) { st[2 * k] = (0.05 + 0.95 * Math.sqrt(rnd())) * 0.62; st[2 * k + 1] = rnd() * TAU; }
    // the constellations: four groups of five neighbouring stars, joined in the order of their bearing
    const groups = new Int16Array(20);
    for (let g = 0; g < 4; g++) {
      const c = 5 + g * 23, d = new Float32Array(n);
      for (let k = 0; k < n; k++) { const dx = st[2 * k] * Math.cos(st[2 * k + 1]) - st[2 * c] * Math.cos(st[2 * c + 1]), dy = st[2 * k] * Math.sin(st[2 * k + 1]) - st[2 * c] * Math.sin(st[2 * c + 1]); d[k] = Math.hypot(dx, dy); }
      const idx = Array.from({ length: n }, (_, k) => k).sort((a, b) => d[a] - d[b]).slice(0, 5);
      for (let m = 0; m < 5; m++) groups[g * 5 + m] = idx[m];
    }
    Object.assign(w, { N, kind: rollW(rnd, OLD_W, bandOf(W.a)), bc: 0, on: false, st, n, groups, cg: 0, cs: 0, seg: new Float32Array(16), lit: new Float32Array(4), rot: rnd() * TAU,
      yaw: 0, yawT: 0, yawK: 1, hold: 0, unroll: 0, goal: 0.15, tap: 0, trail: -1, met: -1, mx: 0, my: 0, motes: pool(60), rings: pool(8), flakes: pool(140) });
    w.rot0 = w.rot; // where the wheel stood when the moon was where it is drawn first
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a);
    if (w.N !== N) volkhv.init(W);
    if (f.section === 'change') { w.kind = rollW(rnd, OLD_W, band); w.goal = 0.12; }
    if (f.section === 'drop' && w.trail < 0) { w.trail = 0; w.met = 0; w.mx = (0.1 + 0.4 * rnd()) * N; w.my = (0.04 + 0.1 * rnd()) * N; }
    const hz = Math.round(0.7 * N), px = 0.58 * N, py = 0.26 * N, x0 = 0.34 * N, base = 0.9 * N, h = 0.44 * N, sc = h / 1.75;
    const bc = beatClock(w, f, dt), q = frac(bc);
    let tw = 0;
    for (const h0 of hits) {
      if (isLow(h0)) w.tap = 1;
      else if (h0.kind === 'snare') { w.yawK = -w.yawK; w.yawT = w.yawK * (0.9 + 0.3 * rnd()); w.hold = 0.7; }
      else if (h0.kind === 'hat') tw = 1;
      if (isTonal(h0)) { // the next line of the constellation, drawn out from star to star
        const k = w.cg * 4 + w.cs;
        if (w.seg[k] <= 0) { w.seg[k] = 0.001; w.cs++; if (w.cs >= 4) { w.lit[w.cg] = 12; w.cs = 0; w.cg = (w.cg + 1) % 4; for (let m = 0; m < 4; m++) w.seg[w.cg * 4 + m] = 0; } }
      }
    }
    if (w.on && Math.floor(bc) % 4 === 0) w.goal = Math.min(1, w.goal + 0.12);
    w.unroll = follow(w.unroll, w.goal, dt, 0.6);
    if ((w.hold -= dt) <= 0) w.yawT = 0;
    w.yaw = follow(w.yaw, w.yawT, dt, 0.09);
    w.rot -= (0.012 + 0.03 * clamp(f.rel.midDrive)) * dt; // counterclockwise round the pole, as seen facing north
    let trail = 0;
    if (w.trail >= 0) { w.trail += dt; trail = smooth(Math.min(w.trail / 4, (16 - w.trail) / 3)) * 1.1; if (w.trail > 16) w.trail = -1; }
    // the sky, the stars on their wheel round the pole (drawn out into arcs in the long exposure)
    sky(r, 0, hz, SKY_OLD);
    const S = w.st, rot = w.rot;
    for (let k = 0; k < w.n; k++) {
      const rho = S[2 * k] * N, a = S[2 * k + 1] + rot, c = (k % 7 === 0 || (tw && hash(k, Math.floor(t * 10)) < 0.15)) ? BRIGHT : LMID;
      if (trail > 0.02) circ(r, px, py, rho, k % 3 ? MID : LMID, 1, a, a + trail);
      else r.set(px + rho * Math.cos(a), py + rho * Math.sin(a), c);
    }
    r.set(px, py, BRIGHT);
    // the constellations: the lines drawn so far, each growing from its star to the next in 0.4 s, glowing a while
    for (let g = 0; g < 4; g++) {
      const lit = (w.lit[g] = Math.max(0, w.lit[g] - dt)), cur = g === w.cg;
      if (!cur && lit <= 0) continue;
      for (let m = 0; m < 4; m++) {
        const k = g * 4 + m, e = w.seg[k];
        if (e <= 0 && !(lit > 0)) continue;
        if (e > 0 && e < 1) w.seg[k] = Math.min(1, e + dt / 0.4);
        const A = w.groups[g * 5 + m], B = w.groups[g * 5 + m + 1], aA = S[2 * A + 1] + rot, aB = S[2 * B + 1] + rot, ax = px + S[2 * A] * N * Math.cos(aA), ay = py + S[2 * A] * N * Math.sin(aA);
        const bx = px + S[2 * B] * N * Math.cos(aB), by = py + S[2 * B] * N * Math.sin(aB), p = lit > 0 ? 1 : w.seg[k];
        r.line(ax, ay, ax + (bx - ax) * p, ay + (by - ay) * p, lit > 0 && lit < 3 ? MID : COOL);
        r.set(ax, ay, BRIGHT); if (p >= 1) r.set(bx, by, BRIGHT);
      }
    }
    if (w.kind === 'moon') { // the moon rides the wheel with the stars (and its lit side turns with it)
      const da = rot - w.rot0, c = Math.cos(da), sn = Math.sin(da), mxc = px + (-0.38 * c + 0.06 * sn) * N, myc = py + (-0.38 * sn - 0.06 * c) * N;
      ell(r, mxc, myc, 0.04 * N, 0.04 * N, BRIGHT); ell(r, mxc + (0.012 * c + 0.01 * sn) * N, myc + (0.012 * sn - 0.01 * c) * N, 0.035 * N, 0.035 * N, DARK + DIM);
    }
    if (w.met >= 0) { // the falling star: straight down across the sky, quick, its trail fading behind it
      const a = (w.met += dt), x = w.mx + a * 0.55 * N, y = w.my + a * 0.3 * N;
      for (let k = 0; k < 12; k++) { const b = Math.max(0, a - k * 0.025); r.set(w.mx + b * 0.55 * N, w.my + b * 0.3 * N, k < 3 ? BRIGHT : k < 7 ? LMID : MID); }
      if (a < 0.9) r.rect(x - u, y - u, mx1(2 * u), mx1(2 * u), BRIGHT); else w.met = -1;
    }
    // the spruces round the glade, the ground (snow in winter)
    for (let x = 0; x < N; x++) { const e = Math.abs(x / N - 0.5) * 2, q2 = x / (0.06 * N), i = Math.floor(q2), fr = q2 - i, hgt = (0.1 + 0.5 * e * e + 0.08 * hash(i, 71)) * N * (1 - Math.abs(2 * fr - 1) * 0.7); vcol(r, x, hz - hgt, hz + 1, DARK + DIM); }
    sky(r, hz, N, w.kind === 'winter' ? SNOWFIELD : FIELD);
    pine(r, 0.06 * N, 0.95 * N, 0.9 * N, 0.26 * N, DARK + DIM, LMID + DIM, w.kind === 'winter' ? 0.8 : 0);
    pine(r, 0.93 * N, 0.97 * N, 0.95 * N, 0.3 * N, DARK + DIM, LMID + DIM, w.kind === 'winter' ? 0.8 : 0);
    // the owl on its bough: a snare turns its head round to profile and back
    const ox = 0.8 * N, oy = 0.5 * N, os = 0.07 * N;
    strk(r, 0.93 * N, 0.47 * N, 0.7 * N, 0.53 * N, mx1(0.012 * N), DARK + DIM);
    ell(r, ox, oy - os * 0.5, os * 0.38, os * 0.55, LMID);
    const yw = clamp(w.yaw, -1.2, 1.2), fxo = ox + yw * os * 0.16, hy = oy - os * 1.05;
    ell(r, ox, hy, os * 0.32, os * 0.28, LMID);
    tri3(r, ox - os * 0.3 + yw * os * 0.05, hy - os * 0.15, ox - os * 0.22 + yw * os * 0.08, hy - os * 0.42, ox - os * 0.1, hy - os * 0.2, LMID); tri3(r, ox + os * 0.3 + yw * os * 0.05, hy - os * 0.15, ox + os * 0.22 + yw * os * 0.08, hy - os * 0.42, ox + os * 0.1, hy - os * 0.2, LMID);
    if (Math.abs(yw) < 1.05) { // the face disc, narrowing as it turns away
      const fw = os * 0.27 * Math.cos(yw * 1.2);
      ell(r, fxo, hy + os * 0.02, Math.max(0.6, fw), os * 0.22, BRIGHT);
      const glint = w.kind === 'moon' || f.beat.pulse > 0.6 ? BRIGHT : HOT;
      for (let k = -1; k <= 1; k += 2) { const e = k * Math.cos(yw * 1.2) * os * 0.11; if (Math.abs(yw) < 0.9 || k === Math.sign(yw)) r.rect(fxo + e - mx1(os * 0.05), hy - os * 0.02, mx1(os * 0.1), mx1(os * 0.09), glint); }
      r.set(fxo, hy + os * 0.08, DARK);
    }
    targets.push({ x: ox - os * 0.4, y: hy - os * 0.4, w: os * 0.8, h: os * 1.5 });
    // the flat stone and the scroll on it: the sheet as long as it has unrolled, the roll thinner by the bark it gave
    const stx = 0.66 * N, sty = 0.86 * N, sw = 0.22 * N;
    quad(r, stx - sw / 2, sty, stx + sw / 2, sty, stx + sw / 2 - 0.02 * N, sty - 0.035 * N, stx - sw / 2 + 0.015 * N, sty - 0.04 * N, MID);
    const len = 0.17 * N * w.unroll, x1 = stx - 0.08 * N + len, R0 = 0.016 * N, Rr = Math.sqrt(Math.max(0.15, 1 - 0.85 * w.unroll)) * R0, yb = sty - 0.04 * N;
    r.rect(stx - 0.08 * N, yb - mx1(0.006 * N), len, mx1(0.006 * N), BRIGHT);
    for (let k = 0; k < 9; k++) { const xk = stx - 0.075 * N + k * 0.02 * N; if (xk < x1 - Rr) r.rect(xk, yb - mx1(0.004 * N), mx1(0.01 * N), 1, DARK); }
    ell(r, x1, yb - Rr, Rr, Rr, LMID); circ(r, x1, yb - Rr, Rr * 0.6, DARK);
    ell(r, stx + 0.06 * N, yb - R0 * 0.9, R0 * 0.9, R0 * 0.9, LMID); // a second scroll, still rolled
    // the old man: the robe, the beard, the hood; the staff in his near hand, tapping on the beat
    const lift = Math.sin(Math.PI * q) * 0.04 * h * (w.tap > 0.5 ? 1.6 : 1), sx = x0 + 0.02 * h, sy = base - 0.78 * h, hx = sx + 0.04 * h, hy2 = sy - 0.1 * h;
    ell(r, x0 + 0.25 * h, base, 0.3 * h, mx1(0.022 * h), DARK + DIM);
    quad(r, sx - 0.1 * h, sy, sx + 0.09 * h, sy, x0 + 0.17 * h, base, x0 - 0.17 * h, base, LMID);
    strk(r, sx - 0.05 * h, sy + 0.1 * h, x0 - 0.12 * h, base - 0.02 * h, mx1(0.02 * h), MID); // a fold
    ell(r, hx, hy2, 0.07 * h, 0.08 * h, FIG);
    tri3(r, hx - 0.09 * h, hy2 - 0.02 * h, hx + 0.08 * h, hy2 - 0.02 * h, hx - 0.02 * h, hy2 - 0.32 * h, MID); // the tall hood
    quad(r, hx - 0.09 * h, hy2 - 0.03 * h, hx - 0.1 * h, sy + 0.12 * h, hx - 0.06 * h, sy + 0.2 * h, hx - 0.02 * h, hy2, MID);
    tri3(r, hx - 0.01 * h, hy2 + 0.02 * h, hx + 0.08 * h, hy2 + 0.02 * h, hx + 0.03 * h, sy + 0.26 * h, BRIGHT); // the beard
    const tx = sx + 0.24 * h, ty = sy + 0.14 * h - lift, foot = base - lift;
    reach(r, sx, sy + 0.02 * h, tx, ty, 0.16 * h, 0.15 * h, 1, mx1(0.07 * h), LMID);
    strk(r, tx, ty - 0.3 * h, tx + 0.02 * h, foot, mx1(0.022 * h), DARK);
    ell(r, tx - 0.005 * h, ty - 0.32 * h, mx1(0.022 * h), mx1(0.022 * h), w.tap > 0.3 || f.beat.pulse > 0.7 ? COOL : MID);
    if (w.on) { emit(w.rings, tx + 0.02 * h, base, 0, 0, 0.6, COOL, w.tap > 0.5 ? 1.6 : 1); for (let n = 0; n < (w.tap > 0.5 ? 10 : 3); n++) emit(w.motes, tx + 0.02 * h, base - u, (rnd() - 0.5) * 0.4 * sc, -(0.3 + 0.5 * rnd()) * sc, 2, COOL, rnd() * TAU); }
    w.tap = Math.max(0, w.tap - dt * 2);
    const Q = w.rings;
    for (let k = 0; k < Q.n;) { const a = (Q.age[k] += dt); if (a > Q.life[k]) { kill(Q, k); continue; } circ(r, Q.x[k], Q.y[k], a * 0.25 * N * Q.s[k], a < 0.25 ? COOL : MID, 0.22); k++; }
    embers(W, w.motes, 0);
    targets.push({ x: x0 - 0.18 * h, y: base - h * 1.05, w: 0.45 * h, h: h * 1.05 });
    if (w.kind === 'winter') flakes(W, w.flakes, Math.round(60 * u), N / 7, 0.01 * N, hz, N - hz, LMID); // each lands on the ground of its depth
    else if (w.kind === 'summer') for (let k = 0; k < 18; k++) { const a = hash(k, 81), b = hash(k, 82); if (Math.sin(t * (1.4 + a) + 7 * k) > 0.3) r.set((a + 0.05 * Math.sin(t * 0.4 + 9 * b)) * N, hz + (0.03 + 0.2 * b) * N + 0.01 * N * Math.sin(t * 0.7 + k), COOL); }
    else if (w.kind === 'mist') for (let y = hz; y < hz + 0.12 * N; y++) { const e = 1 - Math.abs(y - hz - 0.06 * N) / (0.06 * N), by = (y & 7) << 3; for (let x = 0; x < N; x++) if (BAYER[by | (x & 7)] < 0.5 * e * vn((x - t * 0.01 * N) / (0.15 * N), 95)) r.buf[y * N + x] = LMID + DIM; } // drifting downwind
  },
};

// ---------------------------------------------------------------------------------------------- forge
// A smithy at night, from the side: the hearth on the right with its hood, the fire bed on it, the bellows behind it
// worked by a boy on a lever; the anvil on its stump in the middle; the smith on the left with the hammer in his near
// hand and the tongs in the other; the quench tub by him; the night and its stars through the window; the fire throws
// the smith's shadow on the back wall. The work goes in heats: the blade in the fire comes up to heat (quicker with the
// bellows), is carried to the anvil and worked, cooling from bright to hot to dark, and goes back into the fire. The
// boy pumps the bellows once a beat and the fire brightens on each push; a kick is a blow of the hammer, swung about the
// shoulder down onto the blade, and the sparks fly off it on parabolas and bounce on the floor, cooling (on the bare
// anvil while the blade heats); a snare quenches the hot blade in the tub, a burst of steam rising and slowing. The
// kind is the piece: a sword, a seax, a spearhead. A drop: the finished blade raised high in both hands, a glint running
// up it from hilt to point, again and again.
const FORGE_W = { sword: [2, 2, 2], seax: [2, 2, 1], spear: [1, 1, 2] };
const BLADES = { sword: [0, -0.012, 0.28, -0.012, 0.31, 0, 0.28, 0.012, 0, 0.012], seax: [0, -0.016, 0.15, -0.02, 0.19, 0.004, 0.15, 0.012, 0, 0.012], spear: [0, -0.006, 0.06, -0.006, 0.09, -0.022, 0.16, 0, 0.09, 0.022, 0.06, 0.006, 0, 0.006] };
const forge = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { N, kind: rollW(rnd, FORGE_W, bandOf(W.a)), bc: 0, on: false, st: 'heat', stT: 0, T: 0.5, hit: -1, blast: 0, raise: -1, sparks: pool(260), steam: pool(40), drops: pool(40), embers: pool(80) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a);
    if (w.N !== N) forge.init(W);
    if (f.section === 'change') w.kind = rollW(rnd, FORGE_W, band);
    if (f.section === 'drop' && w.raise < 0) { w.raise = 0; w.T = 0; }
    // the scale: the smith 1.8 m in 0.5 N; the anvil's face, the fire bed, the tub's water
    const h = 0.5 * N, sc = h / 1.8, g = 9.8 * sc, floor = 0.9 * N, x0 = 0.22 * N, ax = 0.44 * N, ay = floor - 0.75 * sc, fx = 0.68 * N, fy = floor - 0.85 * sc, tx = 0.1 * N, ty = floor - 0.5 * sc;
    const bc = beatClock(w, f, dt), q = frac(bc);
    let kick = 0, snare = false;
    for (const h0 of hits) { if (isLow(h0)) kick = Math.max(kick, h0.strength); else if (h0.kind === 'snare') snare = true; }
    if (kick > 0 && (w.hit < 0 || w.hit > 0.33) && w.raise < 0) w.hit = 0; // a new blow once the hammer is back up
    // the bellows: pushed down through the first part of every beat, the fire brightening with each push
    const push = q < 0.4 ? Math.sin((Math.PI * q) / 0.4) : 0;
    if (w.on) w.blast = 1;
    w.blast = Math.max(0, w.blast - dt * 2.2);
    // the heats: in the fire it comes up to heat (quicker with each push of the bellows), carried to the anvil, worked
    // and cooling in the air, quenched on a snare, back to the fire when it has gone dark
    w.stT += dt;
    if (w.raise >= 0) { if ((w.raise += dt) > 6) { w.raise = -1; w.st = 'heat'; w.stT = 0; } }
    else if (w.st === 'heat') { w.T = follow(w.T, 1, dt, 2.4 - 1.2 * w.blast); if (w.T > 0.93) { w.st = 'take'; w.stT = 0; } }
    else if (w.st === 'take') { if (w.stT > 0.45) { w.st = 'work'; w.stT = 0; } }
    else if (w.st === 'work') { w.T = follow(w.T, 0, dt, 7); if (snare && w.T > 0.3) { w.st = 'quench'; w.stT = 0; } else if (w.T < 0.12) { w.st = 'back'; w.stT = 0; } }
    else if (w.st === 'quench') { if (w.stT > 0.18 && w.stT - dt <= 0.18) { w.T *= 0.2; for (let n = 0; n < 14; n++) emit(w.steam, tx + (rnd() - 0.5) * 0.25 * sc, ty, (rnd() - 0.5) * 0.4 * sc, -(0.5 + rnd()) * sc, 2 + rnd(), LMID, (1 + rnd()) * sc); for (let n = 0; n < 10; n++) emit(w.drops, tx + (rnd() - 0.5) * 0.2 * sc, ty, (rnd() - 0.5) * 2 * sc, -(1 + 2 * rnd()) * sc, 2, COOL); } if (w.stT > 0.55) { w.st = 'work'; w.stT = 0; } }
    else if (w.st === 'back') { if (w.stT > 0.45) { w.st = 'heat'; w.stT = 0; } }
    // where the blade is: in the fire, on the anvil, in the tub, or carried between (an arc through the air)
    const fpx = fx - 0.2 * sc, fpy = fy - 0.05 * sc, apx = ax - 0.25 * sc, apy = ay - 0.04 * sc, tpx = tx - 0.2 * sc, tpy = ty + 0.15 * sc;
    let bx = apx, by = apy, e = -1, x1 = apx, y1 = apy, x2 = apx, y2 = apy;
    if (w.raise < 0) {
      if (w.st === 'heat') { bx = fpx; by = fpy; }
      else if (w.st === 'take') { e = w.stT / 0.45; x1 = fpx; y1 = fpy; }
      else if (w.st === 'back') { e = w.stT / 0.45; x2 = fpx; y2 = fpy; }
      else if (w.st === 'quench') { e = w.stT < 0.18 ? w.stT / 0.18 : w.stT < 0.33 ? 1 : 1 - (w.stT - 0.33) / 0.22; x2 = tpx; y2 = tpy; }
    }
    if (e >= 0) { e = smooth(e); bx = lerp(x1, x2, e); by = lerp(y1, y2, e) - Math.sin(Math.PI * e) * 0.3 * sc; } // carried on an arc through the air
    // the room: the back wall of planks, the window with the night and its stars, the floor
    r.fill(DARK + DIM);
    for (let k = 0; k < 14; k++) vcol(r, (k / 14) * N, 0, floor, DARK);
    r.rect(0.18 * N, 0.12 * N, 0.22 * N, 0.2 * N, BG);
    stars(r, 14, 101, 0.18 * N, 0.4 * N, 0.12 * N, 0.32 * N, LMID, Math.floor(t * 2));
    r.frame(0.18 * N, 0.12 * N, 0.22 * N, 0.2 * N, MID); r.rect(0.29 * N, 0.12 * N, mx1(u), 0.2 * N, MID);
    sky(r, floor, N, FIELD);
    // the smith's shadow thrown on the wall by the fire, away from it
    quad(r, x0 - 0.05 * h, floor, x0 + 0.05 * h, floor, x0 - 0.35 * h, floor - 1.05 * h, x0 - 0.6 * h, floor - 0.95 * h, DARK + DIM);
    // the hearth: a block of stone, the hood over it, the fire bed (brighter with the bellows), its flames and sparks
    r.rect(fx - 0.55 * sc, fy, 1.15 * sc, floor - fy, MID);
    for (let k = 0; k < 6; k++) r.rect(fx - 0.55 * sc + (k % 3) * 0.38 * sc, fy + 0.2 * sc + Math.floor(k / 3) * 0.3 * sc, 0.36 * sc, mx1(u), MID + DIM);
    quad(r, fx - 0.6 * sc, fy - 0.9 * sc, fx + 0.6 * sc, fy - 0.9 * sc, fx + 0.25 * sc, 0, fx - 0.2 * sc, 0, DARK);
    const fh = (0.25 + 0.2 * clamp(f.rel.bassDrive) + 0.35 * w.blast) * sc;
    glow(r, fx, fy, 0.35 * N, 0.25 * N, 0.35 + 0.35 * w.blast);
    r.rect(fx - 0.45 * sc, fy - 0.08 * sc, 0.9 * sc, 0.1 * sc, HOT);
    for (let k = 0; k < 10; k++) if (hash(k, Math.floor(t * 10)) < 0.3 + 0.6 * w.blast) r.set(fx - 0.42 * sc + k * 0.09 * sc, fy - 0.05 * sc, BRIGHT);
    flame(r, fx, fy - 0.06 * sc, 0.7 * sc, fh, Math.floor(t * 12), 0, 41);
    for (let n = spawns(rnd, 3 + 25 * w.blast, dt); n > 0; n--) emit(w.embers, fx + (rnd() - 0.5) * 0.6 * sc, fy - fh * 0.5, (rnd() - 0.5) * 0.5 * sc, -(1.5 + 2 * rnd()) * sc, 1 + rnd(), BRIGHT, rnd() * TAU);
    // the bellows behind the hearth: two boards and the leather between, pressed by the lever on every beat; the boy on it
    const bwx = fx + 0.6 * sc, bwy = fy - 0.15 * sc, open = 0.18 * sc * (1 - 0.75 * push);
    quad(r, bwx - 0.35 * sc, bwy, bwx + 0.45 * sc, bwy + 0.04 * sc, bwx + 0.45 * sc, bwy - open - 0.04 * sc, bwx - 0.35 * sc, bwy - 0.02 * sc, DARK);
    strk(r, bwx + 0.45 * sc, bwy - open - 0.04 * sc, bwx + 0.8 * sc, bwy - 0.5 * sc - open, mx1(0.04 * sc), MID);
    const bh = 1.25 * sc, bxx = bwx + 0.82 * sc, bsy = floor - 0.75 * bh;
    strk(r, bxx, floor, bxx - 0.02 * bh, floor - 0.45 * bh, mx1(0.08 * bh), dim(FIG)); strk(r, bxx - 0.02 * bh, floor - 0.45 * bh, bxx - 0.03 * bh, bsy, mx1(0.13 * bh), dim(FIG));
    ell(r, bxx - 0.04 * bh, bsy - 0.1 * bh, 0.07 * bh, 0.075 * bh, dim(FIG));
    reach(r, bxx - 0.03 * bh, bsy, bwx + 0.8 * sc, bwy - 0.5 * sc - open, 0.16 * bh, 0.15 * bh, -1, mx1(0.06 * bh), dim(FIG));
    // the anvil on its stump, the tub with its water
    r.rect(ax - 0.2 * sc, ay + 0.15 * sc, 0.4 * sc, floor - ay - 0.15 * sc, DARK);
    quad(r, ax - 0.35 * sc, ay, ax + 0.25 * sc, ay, ax + 0.2 * sc, ay + 0.15 * sc, ax - 0.25 * sc, ay + 0.15 * sc, MID);
    tri3(r, ax - 0.35 * sc, ay, ax - 0.35 * sc, ay + 0.09 * sc, ax - 0.62 * sc, ay + 0.02 * sc, MID); // the horn
    r.rect(ax - 0.35 * sc, ay, 0.6 * sc, mx1(u), LMID);
    quad(r, tx - 0.35 * sc, ty, tx + 0.35 * sc, ty, tx + 0.3 * sc, floor, tx - 0.3 * sc, floor, MID + DIM);
    r.rect(tx - 0.33 * sc, ty - 0.02 * sc, 0.66 * sc, mx1(0.05 * sc), COOL);
    for (let k = 0; k < 2; k++) r.rect(tx - 0.33 * sc, ty + (0.15 + 0.2 * k) * sc, 0.66 * sc, mx1(u), DARK);
    // the smith: legs apart, leather apron; the tongs in the far hand on the blade's tang; the near arm swings the hammer
    // about the shoulder: up over it, down onto the blade in 0.06 s on a kick, back up after
    const dir = 1, py = floor - 0.47 * h, sx = x0 + 0.05 * h, sy = py - 0.3 * h, col = FIG;
    limb(r, x0, py, -0.25, 0.08, 0.25 * h, 0.25 * h, dir, mx1(0.09 * h), dim(col), -1);
    limb(r, x0, py, 0.3, 0.12, 0.25 * h, 0.25 * h, dir, mx1(0.09 * h), col, -1);
    const raised = w.raise >= 0 ? smooth(w.raise / 0.8) : 0;
    // the blade: the colour of its heat (the point cooling first), its tang in the tongs; finished, held up in both hands
    const B = BLADES[w.kind], L = (w.kind === 'sword' ? 3.2 : w.kind === 'seax' ? 2.6 : 2.4) * sc;
    if (raised > 0) {
      const hx = sx + 0.06 * h, hy = sy - 0.35 * h * raised, a = -Math.PI / 2 + 0.15;
      reach(r, sx - 0.02 * h, sy, hx, hy, 0.16 * h, 0.15 * h, dir, mx1(0.07 * h), dim(col), true);
      setFrame(FR2, hx, hy, a, 1);
      polyFr(r, FR2, B, L, LMID);
      strkFr(r, FR2, 0.02 * L, 0, B[4] * L * 0.97, 0, 1, BRIGHT);
      strkFr(r, FR2, 0, -0.035 * L, 0, 0.035 * L, mx1(0.012 * L), DARK); strkFr(r, FR2, 0, 0, -0.06 * L, 0, mx1(0.02 * L), HOT); // the guard and the grip
      const gq = frac(w.raise / 0.8) * B[4] * L, gx = fX(FR2, gq, 0), gy = fY(FR2, gq, 0), gs = (1 + raised) * 2 * u;
      r.rect(gx - gs, gy, 2 * gs + 1, 1, BRIGHT); r.rect(gx, gy - gs, 1, 2 * gs + 1, BRIGHT);
      targets.push({ x: hx - 0.05 * L, y: hy - B[4] * L, w: 0.1 * L, h: B[4] * L });
    } else {
      setFrame(FR2, bx, by, 0, 1);
      const n = B.length >> 1;
      for (let k = 0; k < 3; k++) { // three lengths of the blade, the point end a little cooler
        const T = w.T * (1 - 0.18 * k), c = T > 0.66 ? BRIGHT : T > 0.33 ? HOT : T > 0.15 ? HOT + DIM : DARK;
        for (let i = 0; i < n; i++) { PB[2 * i] = fX(FR2, B[2 * i] * L, B[2 * i + 1] * L); PB[2 * i + 1] = fY(FR2, B[2 * i] * L, B[2 * i + 1] * L); }
        const xa = bx + (k / 3) * B[4] * L, xb = bx + ((k + 1) / 3) * B[4] * L + 1;
        clipX(r, n, xa, xb, c);
      }
      strk(r, bx - 0.12 * L, by, bx, by, mx1(0.012 * L), DARK); // the tang
      // the tongs from the far hand to the tang
      const hx = bx - 0.3 * sc, hy = by + 0.1 * sc;
      reach(r, sx - 0.02 * h, sy + 0.02 * h, hx, hy, 0.16 * h, 0.15 * h, dir, mx1(0.065 * h), dim(col));
      strk(r, LX, LY, bx - 0.1 * L, by, mx1(0.02 * h), DARK); strk(r, LX, LY + 0.01 * h, bx - 0.1 * L, by + 0.008 * h, mx1(0.015 * h), DARK);
      targets.push({ x: bx - 0.1 * L, y: by - 0.05 * L, w: L * B[4] + 0.1 * L, h: 0.1 * L });
    }
    quad(r, sx - 0.1 * h, sy + 0.02 * h, sx + 0.08 * h, sy + 0.02 * h, x0 + 0.1 * h, py + 0.24 * h, x0 - 0.1 * h, py + 0.24 * h, MID); // the apron over him
    strk(r, x0, py, sx, sy, mx1(0.16 * h), col);
    const hx0 = sx + 0.05 * h, hy0 = sy - 0.1 * h;
    ell(r, hx0, hy0, 0.07 * h, 0.075 * h, col);
    tri3(r, hx0 + 0.01 * h, hy0 + 0.02 * h, hx0 + 0.08 * h, hy0 + 0.02 * h, hx0 + 0.04 * h, hy0 + 0.12 * h, MID); // the beard
    r.rect(hx0 - 0.07 * h, hy0 - 0.05 * h, 0.14 * h, mx1(0.03 * h), DARK); // a band round the brow
    // the hammer: the hand on an arc about the shoulder from over it to the blow; the head lands on the blade
    let k = 0;
    if (w.hit >= 0) { const a = (w.hit += dt); k = a < 0.06 ? smooth(a / 0.06) : 1 - smooth((a - 0.06) / 0.34); if (a >= 0.06 && a - dt < 0.06) {
      const hot = w.st === 'work' && w.raise < 0, ix = apx + 0.15 * L, iy = apy - 0.01 * sc;
      if (hot && w.T > 0.15) for (let n = Math.round((10 + 30 * w.T) * kick); n > 0; n--) { const an = -Math.PI / 2 + (rnd() - 0.5) * 2.4, v = (2 + 5 * rnd()) * sc * (0.5 + w.T); emit(w.sparks, ix, iy, Math.cos(an) * v, Math.sin(an) * v, 0.6 + 0.9 * rnd() * w.T, BRIGHT); }
      s.shake = Math.max(s.shake, hot ? 0.18 * kick : 0.06); } if (a > 0.4) w.hit = -1; }
    if (raised > 0) reach(r, sx, sy, sx + 0.06 * h, sy - 0.33 * h * raised, 0.16 * h, 0.15 * h, dir, mx1(0.07 * h), col, true);
    else {
      const tgx = apx + 0.15 * L - 0.22 * h, tgy = apy - 0.05 * sc, ra = Math.atan2(-0.32, -0.05), sa = Math.atan2(tgy - sy, tgx - sx), an = lerp(ra, sa, k), rr = lerp(0.3 * h, Math.min(0.3 * h, Math.hypot(tgx - sx, tgy - sy)), k);
      reach(r, sx, sy, sx + Math.cos(an) * rr, sy + Math.sin(an) * rr, 0.16 * h, 0.15 * h, dir, mx1(0.07 * h), col);
      const ha = lerp(-2.3, 0, k), ex = LX + Math.cos(ha) * 0.22 * h, ey = LY + Math.sin(ha) * 0.22 * h;
      strk(r, LX, LY, ex, ey, mx1(0.02 * h), MID);
      strk(r, ex - Math.sin(ha) * 0.04 * h, ey + Math.cos(ha) * 0.04 * h, ex + Math.sin(ha) * 0.035 * h, ey - Math.cos(ha) * 0.035 * h, mx1(0.05 * h), DARK); // the head across the haft
    }
    sparks(W, w.sparks, g, floor, ax - 0.62 * sc, ax + 0.25 * sc, ay); // off the floor, and off the anvil's face and horn
    embers(W, w.embers, 0);
    plume(W, w.steam, 0, 1.2, 4, 0.75, 6 * u);
    // the drops thrown up by the quench: back into the tub, or past its rim down to the floor
    const Pd = w.drops, dsz = mx1(u);
    for (let i = 0; i < Pd.n;) {
      Pd.vy[i] += g * dt; Pd.x[i] += Pd.vx[i] * dt; Pd.y[i] += Pd.vy[i] * dt;
      if ((Pd.age[i] += dt) >= Pd.life[i] || (Pd.vy[i] > 0 && Pd.y[i] >= (Math.abs(Pd.x[i] - tx) < 0.33 * sc ? ty : floor))) { kill(Pd, i); continue; }
      r.rect(Pd.x[i] - dsz / 2, Pd.y[i] - dsz / 2, dsz, dsz, Pd.c[i]);
      i++;
    }
  },
};
// fill the polygon in PB (n points) only between columns x0 and x1
function clipX(r, n, x0, x1, c) {
  const N = r.N, buf = r.buf;
  let top = Infinity, bot = -Infinity;
  for (let i = 1; i < 2 * n; i += 2) { if (PB[i] < top) top = PB[i]; if (PB[i] > bot) bot = PB[i]; }
  for (let y = Math.max(0, Math.floor(top)), ye = Math.min(N, Math.ceil(bot)); y < ye; y++) {
    const yc = y + 0.5;
    let m = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) { const ya = PB[2 * j + 1], yb = PB[2 * i + 1]; if ((ya <= yc) === (yb <= yc)) continue; const v = PB[2 * j] + ((yc - ya) / (yb - ya)) * (PB[2 * i] - PB[2 * j]); let k = m++; for (; k > 0 && XS[k - 1] > v; k--) XS[k] = XS[k - 1]; XS[k] = v; }
    for (let k = 0; k + 1 < m; k += 2) { const xa = Math.max(0, Math.round(Math.max(x0, XS[k]))), xb = Math.min(N, Math.round(Math.min(x1, XS[k + 1]))); if (xb > xa) buf.fill(c, y * N + xa, y * N + xb); }
  }
}

const WORLDS = { fjord, longship, shieldwall, berserker, shamandrum, idols, kupala, runestone, auroralake, meadhall, volkhv, forge };
registerFamily('north', WORLD_DEFS, WORLDS);
export const NORTH_STYLE = makeMixStyle('NORTHLANDS', ['north']);
