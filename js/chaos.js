// Chaos, mixed. Strange attractors, the chaos game, ray-marched fractals and the classic chaos demos as worlds, done
// with the real equations. Shared: a camera (yaw and pitch on the band clocks, perspective with one focal length), a
// float density buffer that fades with a time constant and is tone-mapped (log) onto the value ramp DARK → BRIGHT
// with HOT and COOL accents, and RK4 in fixed internal steps (a system's own time advances by dt × speed, split into
// steps of h, so its shape and its speed are the same at any frame rate). Every world rolls a kind by the arousal
// band on a section change and has a heavy variant on a drop; the ray-marched and per-cell ones are `heavy` and keep
// to the main screen. No text, no logos.
import { clamp, BAYER } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, WHITE, L, M, H, TAU, pickW, isLow, isTonal, follow, ease,
  beatLocked, hash, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
const TFM = [[M, H], [M, M], [L, M]], DCM = [[H, L], [M, L], [L, M]], MDE = [[L, M], [H, L], [H, H]], FT = [[M, M], [M, H]];
export const WORLD_DEFS = {
  lorenz: { name: 'lorenz butterfly', va: TFM, themes: ['void', 'paranoia'], pals: ['attractor', 'inferno', 'neon', 'midnight', 'phosphor'], fx: ['none', 'crt', 'film'], geo: true },
  rossler: { name: 'rossler band', va: TFM, themes: ['machine', 'void'], pals: ['attractor', 'phosphor', 'thermal', 'noir', 'hologram'], fx: ['none', 'crt', 'hud'], geo: true },
  aizawa: { name: 'aizawa sphere', va: DCM, themes: ['dream', 'void'], pals: ['attractor', 'viridis', 'vapor', 'crystal', 'midnight'], fx: ['none', 'film', 'mirror'], geo: true },
  thomas: { name: 'thomas labyrinth', va: DCM, themes: ['dream', 'nature'], pals: ['viridis', 'attractor', 'hologram', 'midnight', 'silver'], fx: ['none', 'kaleido', 'film'], geo: true },
  halvorsen: { name: 'halvorsen triskele', va: DCM, themes: ['occult', 'dream'], pals: ['inferno', 'attractor', 'vapor', 'crystal', 'noir'], fx: ['none', 'kaleido', 'mirror'], geo: true },
  chaosgame: { name: 'chaos game', va: DCM, themes: ['nature', 'play'], pals: ['viridis', 'silver', 'ice', 'phosphor', 'hologram'], fx: ['none', 'crt', 'kaleido'], geo: true },
  mandelbulb: { name: 'mandelbulb', va: MDE, themes: ['dream', 'void'], pals: ['inferno', 'attractor', 'hologram', 'crystal', 'vapor'], fx: ['none', 'crt', 'film'], heavy: true, geo: true },
  mandelbox: { name: 'mandelbox flight', va: MDE, themes: ['machine', 'speed', 'void'], pals: ['thermal', 'inferno', 'silver', 'noir', 'neon'], fx: ['none', 'hud', 'crt'], heavy: true, geo: true },
  pendulums: { name: 'double pendulums', va: TFM, themes: ['machine', 'play'], pals: ['attractor', 'noir', 'neon', 'silver', 'phosphor'], fx: ['none', 'crt', 'film'], geo: true },
  bifurcation: { name: 'logistic bifurcation', va: FT, themes: ['machine', 'paranoia'], pals: ['phosphor', 'attractor', 'thermal', 'midnight', 'silver'], fx: ['none', 'hud', 'crt'], geo: true },
  lyapunov: { name: 'lyapunov terrain', va: MDE, themes: ['dream', 'speed'], pals: ['inferno', 'viridis', 'thermal', 'vapor', 'ice'], fx: ['none', 'film', 'crt'], heavy: true, geo: true },
  attractorzoo: { name: 'attractor zoo', va: TFM, themes: ['void', 'rave'], pals: ['attractor', 'neon', 'inferno', 'hologram', 'viridis'], fx: ['none', 'crt', 'kaleido'], geo: true },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the energy knob, the arousal band the kinds are weighted by, a bar in seconds (two without a tempo)
const energy = (f) => clamp(0.5 * f.rel.bassDrive + 0.3 * f.level + 0.2 * f.rel.midDrive);
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const barT = (f) => (f.bpm > 0 ? 240 / f.bpm : 2);
// a kinds table, [{ k, w: [calm, mid, high] }], and a roll from it by the band (another kind than `not` if it can)
const KIND = (k, c, m, h) => ({ k, w: [c, m, h] });
const rollKind = (W, kinds, not) => pickW(W.rnd, kinds, (q) => q.w[bandOf(W.a)] * (q.k === not ? 0.05 : 1)).k;
// the regime a smoothed knob is in between `edges`, held until the knob is well past an edge (no flicker on it)
function plateau(lvl, v, edges) {
  while (lvl < edges.length && v > edges[lvl] + 0.04) lvl++;
  while (lvl > 0 && v < edges[lvl - 1] - 0.04) lvl--;
  return lvl;
}
// the system time owed this frame, dt × speed, in whole fixed steps of h; `cap` sits above what dt = 0.1 needs
function owed(w, dt, speed, h, cap) {
  w.owe = Math.min(w.owe + dt * speed, cap * h);
  const n = Math.floor(w.owe / h);
  w.owe -= n * h;
  return n;
}
// sin from a table of 8192 with linear steps between (off by under 1e-7, far below an RK4 step's own error): the
// Thomas flow takes twelve a step (the slopes tabled too, which keeps it small enough for all twelve to be inlined)
const SN = 8192, SK = SN / TAU, SINT = Float64Array.from({ length: SN + 1 }, (_, i) => Math.sin(i / SK)), SLOP = SINT.map((v, i) => (i < SN ? SINT[i + 1] - v : 0));
const tsin = (x) => { const v = x * SK, i = Math.floor(v), j = i & (SN - 1); return SINT[j] + (v - i) * SLOP[j]; };

// ---------------------------------------------------------------------------------------------- the camera
// A system sits in a basis: a 3x3 `rot` (rows: a proper rotation taking its axes to the screen's, its axis of symmetry
// up, or a scaling), a centre and a scale that bring it into a unit ball. `aim` turns it by `yaw` about the vertical,
// then by `pitch` (from above when positive) and folds it all into one 3x4 matrix: a point is then at depth D + z
// from the eye and on screen at (ox, oy) + (x, −y) · F / depth, one focal length for both axes.
const Z_UP = [1, 0, 0, 0, 0, 1, 0, -1, 0]; // z up, y into the screen
const R2 = Math.SQRT1_2, R3 = 1 / Math.sqrt(3), R6 = 1 / Math.sqrt(6);
const D_UP = [R2, -R2, 0, R3, R3, R3, -R6, -R6, 2 * R6]; // the diagonal (1, 1, 1) up
const ID3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const camera = () => ({ m: new Float64Array(12), D: 3, F: 100, ox: 0, oy: 0 });
function aim(c, rot, s, cx, cy, cz, yaw, pitch, D, F, ox, oy) {
  const ca = Math.cos(yaw), sa = Math.sin(yaw), cb = Math.cos(pitch), sb = Math.sin(pitch), m = c.m;
  for (let i = 0; i < 3; i++) {
    // the rows of pitch · yaw; the depth row negated, so the eye looks down −z of a right-handed frame (no mirror image)
    const g = i === 2 ? -s : s, r0 = i === 0 ? ca : i === 1 ? sa * sb : -sa * cb, r1 = i === 0 ? 0 : i === 1 ? cb : sb, r2 = i === 0 ? sa : i === 1 ? -ca * sb : ca * cb;
    const a = (r0 * rot[0] + r1 * rot[3] + r2 * rot[6]) * g, b = (r0 * rot[1] + r1 * rot[4] + r2 * rot[7]) * g, e = (r0 * rot[2] + r1 * rot[5] + r2 * rot[8]) * g;
    m[4 * i] = a; m[4 * i + 1] = b; m[4 * i + 2] = e; m[4 * i + 3] = -(a * cx + b * cy + e * cz);
  }
  c.D = D; c.F = F; c.ox = ox; c.oy = oy;
}
// one point to the screen, into P (x, y, depth); false when it is behind the eye (or not a number)
const PT = new Float64Array(3);
function toScreen(c, x, y, z, P) {
  const m = c.m, Z = c.D + m[8] * x + m[9] * y + m[10] * z + m[11];
  if (!(Z >= 0.05)) return false;
  const q = c.F / Z;
  P[0] = c.ox + (m[0] * x + m[1] * y + m[2] * z + m[3]) * q;
  P[1] = c.oy - (m[4] * x + m[5] * y + m[6] * z + m[7]) * q;
  P[2] = Z;
  return true;
}
// a ring of 3-D points drawn as a line from the newest back, `cnt` of them: the newest quarter c0, then c1, the rest c2
// (the ends rounded here, as r.line would, so they go in as small integers and nothing is boxed per segment)
function trail(W, c, R, len, at, cnt, c0, c1, c2) {
  const { r, N } = W;
  let px = 0, py = 0, ok = false;
  for (let k = 0; k < cnt; k++) {
    const j = (at - k + len) % len;
    if (!toScreen(c, R[3 * j], R[3 * j + 1], R[3 * j + 2], PT) || PT[0] < -N || PT[0] > 2 * N || PT[1] < -N || PT[1] > 2 * N) { ok = false; continue; }
    const x = Math.round(PT[0]), y = Math.round(PT[1]);
    if (ok) r.line(px, py, x, y, k < cnt >> 2 ? c0 : k < cnt * 0.6 ? c1 : c2);
    px = x; py = y; ok = true;
  }
}
// a 3-D segment, skipped when an end is behind the eye or far off the screen
function seg(W, c, x0, y0, z0, x1, y1, z1, col) {
  const { r, N } = W;
  if (!toScreen(c, x0, y0, z0, PT)) return;
  const ax = PT[0], ay = PT[1];
  if (!toScreen(c, x1, y1, z1, PT) || Math.max(Math.abs(ax), Math.abs(ay), Math.abs(PT[0]), Math.abs(PT[1])) > 3 * N) return;
  r.line(Math.round(ax), Math.round(ay), Math.round(PT[0]), Math.round(PT[1]), col);
}

// ---------------------------------------------------------------------------------------------- the density buffer
// What the points lay down (`acc`) and how much of that came from accented points (`tag`: + HOT, − COOL), rebuilt
// when N changes. The tone map is logarithmic: the density over its running mean (over the lit cells), dithered by
// a factor of up to √3 either way, cut at bands a factor of three apart onto DARK MID LMID BRIGHT; a cell laid down
// mostly by accented points takes that accent's ramp. Then both fade by exp(−dt/τ) for the next frame. The running
// mean takes in the last frame's sum and count (`ts`) before the loop: nothing new runs after it (a loop compiled on
// the stack before the code after it had ever run bails out there every frame, and runs boxed).
function accFor(w, N) { if (w.N !== N) Object.assign(w, { N, acc: new Float32Array(N * N), tag: new Float32Array(N * N), ts: new Float64Array(2), ref: 0 }); }
const RAMP_V = [BG, DARK, MID, LMID, BRIGHT], RAMP_H = [BG, DARK, HOT + DIM, HOT, BRIGHT], RAMP_C = [BG, DARK, COOL + DIM, COOL, BRIGHT];
const DITH = Float32Array.from(BAYER, (b) => 3 ** (b - 0.5));
function toneMap(W, gain, tau) {
  const { r, N, dt, w } = W, { acc, tag, ts } = w, buf = r.buf, fade = Math.exp(-dt / tau);
  if (ts[1] > 0) w.ref = w.ref ? follow(w.ref, ts[0] / ts[1], dt, 0.5) : ts[0] / ts[1];
  const inv = gain / (w.ref || 1), lo = 0.05 * w.ref;
  ts[0] = 0; ts[1] = 0;
  for (let y = 0, i = 0; y < N; y++) {
    const dr = (y & 7) << 3;
    for (let x = 0; x < N; x++, i++) {
      const a = acc[i];
      if (a < 1e-3) { if (a !== 0) { acc[i] = 0; tag[i] = 0; } continue; } // (no denormals)
      if (a > lo) { ts[0] += a; ts[1]++; }
      const q = a * inv * DITH[dr | (x & 7)];
      if (q >= 0.07) {
        const tg = tag[i], lv = q < 0.22 ? 1 : q < 0.7 ? 2 : q < 2.2 ? 3 : 4;
        buf[i] = (tg > 0.45 * a ? RAMP_H : tg < -0.45 * a ? RAMP_C : RAMP_V)[lv];
      }
      acc[i] = a * fade; tag[i] *= fade;
    }
  }
}

// ---------------------------------------------------------------------------------------------- the flows
// RK4 over a whole particle array in place: n fixed steps of h, each step's positions kept in Hs (step-major) for
// the splat. One loop per system with its equations written out, so each runs at full speed.
function rkLorenz(P, np, n, h, rho, Hs) {
  const hh = h / 2, h6 = h / 6, b = 8 / 3, st = 3 * np;
  for (let i = 0; i < np; i++) {
    let x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    for (let s = 0, o = 3 * i; s < n; s++, o += st) {
      const ax = 10 * (y - x), ay = x * (rho - z) - y, az = x * y - b * z;
      let u = x + hh * ax, v = y + hh * ay, q = z + hh * az;
      const bx = 10 * (v - u), by = u * (rho - q) - v, bz = u * v - b * q;
      u = x + hh * bx; v = y + hh * by; q = z + hh * bz;
      const cx = 10 * (v - u), cy = u * (rho - q) - v, cz = u * v - b * q;
      u = x + h * cx; v = y + h * cy; q = z + h * cz;
      x += h6 * (ax + 2 * (bx + cx) + 10 * (v - u)); y += h6 * (ay + 2 * (by + cy) + u * (rho - q) - v); z += h6 * (az + 2 * (bz + cz) + u * v - b * q);
      Hs[o] = x; Hs[o + 1] = y; Hs[o + 2] = z;
    }
    P[3 * i] = x; P[3 * i + 1] = y; P[3 * i + 2] = z;
  }
}
function rkRossler(P, np, n, h, a, b, c, Hs) {
  const hh = h / 2, h6 = h / 6, st = 3 * np;
  for (let i = 0; i < np; i++) {
    let x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    for (let s = 0, o = 3 * i; s < n; s++, o += st) {
      const ax = -y - z, ay = x + a * y, az = b + z * (x - c);
      let u = x + hh * ax, v = y + hh * ay, q = z + hh * az;
      const bx = -v - q, by = u + a * v, bz = b + q * (u - c);
      u = x + hh * bx; v = y + hh * by; q = z + hh * bz;
      const cx = -v - q, cy = u + a * v, cz = b + q * (u - c);
      u = x + h * cx; v = y + h * cy; q = z + h * cz;
      x += h6 * (ax + 2 * (bx + cx) - v - q); y += h6 * (ay + 2 * (by + cy) + u + a * v); z += h6 * (az + 2 * (bz + cz) + b + q * (u - c));
      Hs[o] = x; Hs[o + 1] = y; Hs[o + 2] = z;
    }
    P[3 * i] = x; P[3 * i + 1] = y; P[3 * i + 2] = z;
  }
}
// Aizawa with a .95 b .7 c .6 d 3.5 e .25 f .1
function rkAizawa(P, np, n, h, Hs) {
  const hh = h / 2, h6 = h / 6, st = 3 * np;
  for (let i = 0; i < np; i++) {
    let x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    for (let s = 0, o = 3 * i; s < n; s++, o += st) {
      const ax = (z - 0.7) * x - 3.5 * y, ay = 3.5 * x + (z - 0.7) * y, az = 0.6 + 0.95 * z - (z * z * z) / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x * x * x;
      let u = x + hh * ax, v = y + hh * ay, q = z + hh * az;
      const bx = (q - 0.7) * u - 3.5 * v, by = 3.5 * u + (q - 0.7) * v, bz = 0.6 + 0.95 * q - (q * q * q) / 3 - (u * u + v * v) * (1 + 0.25 * q) + 0.1 * q * u * u * u;
      u = x + hh * bx; v = y + hh * by; q = z + hh * bz;
      const cx = (q - 0.7) * u - 3.5 * v, cy = 3.5 * u + (q - 0.7) * v, cz = 0.6 + 0.95 * q - (q * q * q) / 3 - (u * u + v * v) * (1 + 0.25 * q) + 0.1 * q * u * u * u;
      u = x + h * cx; v = y + h * cy; q = z + h * cz;
      const dx = (q - 0.7) * u - 3.5 * v, dy = 3.5 * u + (q - 0.7) * v, dz = 0.6 + 0.95 * q - (q * q * q) / 3 - (u * u + v * v) * (1 + 0.25 * q) + 0.1 * q * u * u * u;
      x += h6 * (ax + 2 * (bx + cx) + dx); y += h6 * (ay + 2 * (by + cy) + dy); z += h6 * (az + 2 * (bz + cz) + dz);
      Hs[o] = x; Hs[o + 1] = y; Hs[o + 2] = z;
    }
    P[3 * i] = x; P[3 * i + 1] = y; P[3 * i + 2] = z;
  }
}
function rkThomas(P, np, n, h, b, Hs) {
  const hh = h / 2, h6 = h / 6, st = 3 * np;
  for (let i = 0; i < np; i++) {
    let x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    for (let s = 0, o = 3 * i; s < n; s++, o += st) {
      const ax = tsin(y) - b * x, ay = tsin(z) - b * y, az = tsin(x) - b * z;
      let u = x + hh * ax, v = y + hh * ay, q = z + hh * az;
      const bx = tsin(v) - b * u, by = tsin(q) - b * v, bz = tsin(u) - b * q;
      u = x + hh * bx; v = y + hh * by; q = z + hh * bz;
      const cx = tsin(v) - b * u, cy = tsin(q) - b * v, cz = tsin(u) - b * q;
      u = x + h * cx; v = y + h * cy; q = z + h * cz;
      x += h6 * (ax + 2 * (bx + cx) + tsin(v) - b * u); y += h6 * (ay + 2 * (by + cy) + tsin(q) - b * v); z += h6 * (az + 2 * (bz + cz) + tsin(u) - b * q);
      Hs[o] = x; Hs[o + 1] = y; Hs[o + 2] = z;
    }
    P[3 * i] = x; P[3 * i + 1] = y; P[3 * i + 2] = z;
  }
}
function rkHalvorsen(P, np, n, h, a, Hs) {
  const hh = h / 2, h6 = h / 6, st = 3 * np;
  for (let i = 0; i < np; i++) {
    let x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    for (let s = 0, o = 3 * i; s < n; s++, o += st) {
      const ax = -a * x - 4 * y - 4 * z - y * y, ay = -a * y - 4 * z - 4 * x - z * z, az = -a * z - 4 * x - 4 * y - x * x;
      let u = x + hh * ax, v = y + hh * ay, q = z + hh * az;
      const bx = -a * u - 4 * v - 4 * q - v * v, by = -a * v - 4 * q - 4 * u - q * q, bz = -a * q - 4 * u - 4 * v - u * u;
      u = x + hh * bx; v = y + hh * by; q = z + hh * bz;
      const cx = -a * u - 4 * v - 4 * q - v * v, cy = -a * v - 4 * q - 4 * u - q * q, cz = -a * q - 4 * u - 4 * v - u * u;
      u = x + h * cx; v = y + h * cy; q = z + h * cz;
      x += h6 * (ax + 2 * (bx + cx) - a * u - 4 * v - 4 * q - v * v); y += h6 * (ay + 2 * (by + cy) - a * v - 4 * q - 4 * u - q * q); z += h6 * (az + 2 * (bz + cz) - a * q - 4 * u - 4 * v - u * u);
      Hs[o] = x; Hs[o + 1] = y; Hs[o + 2] = z;
    }
    P[3 * i] = x; P[3 * i + 1] = y; P[3 * i + 2] = z;
  }
}
// one RK4 step of one Lorenz trajectory in doubles (the twins: 1e-6 is below what a float holds at their size)
function lorenz64(S, h, rho) {
  const x = S[0], y = S[1], z = S[2], hh = h / 2, h6 = h / 6, b = 8 / 3;
  const ax = 10 * (y - x), ay = x * (rho - z) - y, az = x * y - b * z;
  let u = x + hh * ax, v = y + hh * ay, q = z + hh * az;
  const bx = 10 * (v - u), by = u * (rho - q) - v, bz = u * v - b * q;
  u = x + hh * bx; v = y + hh * by; q = z + hh * bz;
  const cx = 10 * (v - u), cy = u * (rho - q) - v, cz = u * v - b * q;
  u = x + h * cx; v = y + h * cy; q = z + h * cz;
  S[0] = x + h6 * (ax + 2 * (bx + cx) + 10 * (v - u)); S[1] = y + h6 * (ay + 2 * (by + cy) + u * (rho - q) - v); S[2] = z + h6 * (az + 2 * (bz + cz) + u * v - b * q);
}

// ---------------------------------------------------------------------------------------------- the swarm
// Up to `max` particles laid along one long run after its transient, so they start on the attractor, spread as its
// own measure spreads them, and BURST more after them that the kicks re-seed (so the cloud itself keeps its measure);
// particle 0 is the head, with a trail ring of `len`; a camera; the step history for `cap` steps a frame.
// `adv(P, np, n, Hs)` is the system's RK4. A world sets `w.n` = its cloud + BURST each frame.
const BURST = 256;
function swarm(W, max, len, cap, adv, from, warm, every) {
  const w = W.w, all = max + BURST, P = new Float32Array(3 * all), Hs = new Float32Array(3 * all * cap), p = Float32Array.from(from);
  for (let s = 0; s < warm; s += cap) adv(p, 1, Math.min(cap, warm - s), Hs);
  for (let i = 0; i < all; i++) { adv(p, 1, every, Hs); P[3 * i] = p[0]; P[3 * i + 1] = p[1]; P[3 * i + 2] = p[2]; }
  Object.assign(w, { P, Hs, T: new Float32Array(all), n: all, max, cap, owe: 0, ring: new Float64Array(3 * len), len, at: 0, cnt: 0, cam: camera(), N: 0,
    cls: 0, flip: 1, rot: 0, clsA: 0, clsB: -1, core: 0, sink: 0, zmin: -1e12, g: [0, 0, 0], lim: 1e12, jit: 1e-3, tTau: 1.2, reseed: 0, bAt: 0, flash: 0, e: 0.5 });
  accFor(w, W.N); // (the density buffer now, not on the first frame)
}
// The splat: the positions after each of this frame's steps through the camera into the density buffer, `wt` each,
// with the tag: the particle's own (fading) and the kind's colouring (`w.cls` 1: which side of the centre in x,
// 2: the axis it is furthest out along, 3: above or below `w.clsA`); `w.core` weighs a point more the nearer it is
// to the vertical axis (the system lit from its core).
function splat(W, c, Hs, np, n, wt) {
  const { w, N } = W, { T, acc, tag, g } = w, m = c.m, D = c.D, F = c.F, ox = c.ox, oy = c.oy;
  const m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3], m4 = m[4], m5 = m[5], m6 = m[6], m7 = m[7], m8 = m[8], m9 = m[9], m10 = m[10], m11 = m[11];
  const cls = w.cls, flip = w.flip, rot = w.rot, clsA = w.clsA, below = w.clsB * flip + 0, core = w.core, gx = g[0], gy = g[1], gz = g[2]; // (+ 0: never −0, which is boxed)
  for (let s = 0, o = 0; s < n; s++)
    for (let i = 0; i < np; i++, o += 3) {
      const x = Hs[o], y = Hs[o + 1], z = Hs[o + 2], Z = D + m8 * x + m9 * y + m10 * z + m11;
      if (!(Z >= 0.1)) continue;
      const q = F / Z, sx = ox + (m0 * x + m1 * y + m2 * z + m3) * q, sy = oy - (m4 * x + m5 * y + m6 * z + m7) * q;
      if (sx < 0 || sy < 0 || sx >= N || sy >= N) continue;
      let tg = T[i];
      if (cls === 1) tg += x > gx ? flip : -flip;
      else if (cls === 2) { const ax = Math.abs(x - gx), ay = Math.abs(y - gy), az = Math.abs(z - gz), ci = ((ax > ay ? (ax > az ? 0 : 2) : ay > az ? 1 : 2) + rot) % 3; tg += ci === 0 ? 1 : ci === 1 ? -1 : 0; }
      else if (cls === 3) tg += z > clsA ? flip : below;
      // (the weight a double on both branches: a phi of a double and a small integer is kept boxed)
      const a = wt * (core ? 0.3 + core / (1 + 6 * ((x - gx) * (x - gx) + (y - gy) * (y - gy))) : 1), j = (sy | 0) * N + (sx | 0);
      acc[j] += a; tag[j] += (tg > 1 ? 1 : tg < -1 ? -1 : tg) * a;
    }
}
// After the steps: the head's positions into its ring; a particle that left the ball `w.lim` round the centre, fell
// into `w.sink` (a stable point that coexists with the attractor) or went below `w.zmin` (where the system cannot
// go: a step that overshot) starts again next to the head as a new trajectory (the head next to another); the tags fade.
function keep(W, n) {
  const { w, dt } = W, { P, T, g, ring, len, Hs } = w, fade = Math.exp(-dt / w.tTau), lim = w.lim, sink = w.sink, zmin = w.zmin, st = 3 * w.n;
  for (let s = 0, o = 0; s < n; s++, o += st) { w.at = (w.at + 1) % len; ring[3 * w.at] = Hs[o]; ring[3 * w.at + 1] = Hs[o + 1]; ring[3 * w.at + 2] = Hs[o + 2]; if (w.cnt < len) w.cnt++; }
  for (let i = 0; i < w.n; i++) {
    T[i] *= fade;
    const dx = P[3 * i] - g[0], dy = P[3 * i + 1] - g[1], dz = P[3 * i + 2] - g[2];
    if (dx * dx + dy * dy + dz * dz < lim && P[3 * i + 2] > zmin && !(sink && dx * dx + dy * dy < 1e-3 && Math.abs(P[3 * i + 2] - sink) < 0.08)) continue;
    const src = i ? 0 : 1 + (w.reseed % (w.n - 1));
    for (let d = 0; d < 3; d++) P[3 * i + d] = P[3 * src + d] + (hash(3 * i + d, w.reseed) - 0.5) * w.jit;
    w.reseed++;
  }
}
// a kick's burst: `nb` of the last BURST particles (the oldest first) put next to the head, within `rad`, tagged `tg`:
// new trajectories from one spot
function inject(w, nb, rad, tg) {
  const { P, T } = w, b0 = w.n - BURST;
  for (let k = 0; k < Math.min(nb, BURST); k++) {
    const i = b0 + (w.bAt = (w.bAt + 1) % BURST);
    for (let d = 0; d < 3; d++) P[3 * i + d] = P[d] + (hash(3 * i + d, w.reseed) - 0.5) * rad;
    T[i] = tg;
  }
  w.reseed++;
}
// a note recolours the particles in its twelfth of a turn round the middle of the screen, as the system sits now
function tint(w, c, pc, tg) {
  const { P, T } = w, m = c.m;
  for (let i = 1; i < w.n; i++) {
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], X = m[0] * x + m[1] * y + m[2] * z + m[3], Y = m[4] * x + m[5] * y + m[6] * z + m[7];
    if ((((Math.atan2(Y, X) / TAU + 0.5) * 12) | 0) % 12 === pc) T[i] = tg;
  }
}
// the head as a disc, and a target on it for the HUD
function headMark(W, c, col, size) {
  const { r, u, w, targets } = W;
  if (!toScreen(c, w.P[0], w.P[1], w.P[2], PT)) return;
  r.disc(PT[0], PT[1], Math.max(0.8, size * u), col);
  targets.push({ x: PT[0] - 5 * u, y: PT[1] - 5 * u, w: 10 * u, h: 10 * u });
}
// what every attractor world does with the hits: a kick bursts new trajectories at the head, a snare flashes (and
// turns the kind's colouring), a note recolours its twelfth
function hitsOn(W, c, rad) {
  const { w, hits } = W;
  let kick = 0;
  for (const hh of hits) {
    if (isLow(hh)) { inject(w, 40 + Math.round(60 * hh.strength), rad, 1); kick = Math.max(kick, hh.strength); }
    else if (hh.kind === 'snare') { w.flash = 1; w.flip = -w.flip; w.rot = (w.rot + 1) % 3; }
    else if (isTonal(hh)) tint(w, c, hh.pc, -1);
  }
  return kick;
}

// ---------------------------------------------------------------------------------------------- lorenz
// The Lorenz system (σ 10, β 8/3, ρ 25–35 on the bass, chaotic all the way): up to four thousand particles density-
// plotted and the head's bright trail. A kick launches twins 1e-6 apart, HOT and COOL, that fly as one until the
// sensitive dependence splits them (some fifteen time units on), and bursts new trajectories at the head; a snare
// flashes and swaps the wing colours; a note recolours its twelfth; the beat breathes the zoom; a drop sweeps ρ up
// over the bifurcations to the periodic window at 99.7 and back in two bars.
const LOR_K = [KIND('cloud', 3, 2, 1), KIND('wings', 1, 2, 3), KIND('filament', 2, 2, 2)];
function twinLaunch(w) {
  for (const tw of w.twins) {
    if (tw.age >= 0 && tw.split < 6 && tw.age < 60) continue; // a free slot, or one whose pair split long ago
    for (let d = 0; d < 3; d++) tw.a[d] = tw.b[d] = w.P[d];
    tw.b[0] += 1e-6; tw.age = 0; tw.split = 0; tw.cnt = 0;
    return;
  }
}
function twinsStep(W, n) {
  const { w, dt } = W;
  for (const tw of w.twins) {
    if (tw.age < 0) continue;
    for (let s = 0; s < n; s++) {
      lorenz64(tw.a, 0.01, w.rho); lorenz64(tw.b, 0.01, w.rho);
      tw.at = (tw.at + 1) % 90; tw.ra.set(tw.a, 3 * tw.at); tw.rb.set(tw.b, 3 * tw.at);
      if (tw.cnt < 90) tw.cnt++;
    }
    tw.age += dt;
    if (Math.hypot(tw.a[0] - tw.b[0], tw.a[1] - tw.b[1], tw.a[2] - tw.b[2]) > 0.4 * w.Rs) tw.split += dt;
  }
}
function twinsDraw(W, c) {
  const { r, u, w } = W, odd = (w.frame = (w.frame + 1) & 1); // one over the other in turn while they are one
  for (const tw of w.twins) {
    if (tw.age < 0) continue;
    for (let k = 0; k < 2; k++) {
      const hot = (k ^ odd) === 1, R = hot ? tw.ra : tw.rb, S = hot ? tw.a : tw.b, col = hot ? HOT : COOL;
      trail(W, c, R, 90, tw.at, tw.cnt, col, col, col + DIM);
      if (toScreen(c, S[0], S[1], S[2], PT)) r.disc(PT[0], PT[1], Math.max(0.8, 1.4 * u), col);
    }
  }
}
const lorenz = {
  init(W) {
    const w = W.w;
    w.rho = 28;
    swarm(W, 3800, 260, 12, (P, np, n, Hs) => rkLorenz(P, np, n, 0.01, w.rho, Hs), [1, 1, 20], 1500, 3);
    Object.assign(w, { kind: rollKind(W, LOR_K), bd: 0.3, Rs: 25, zc: 25, sweep: -1, feed: 0, frame: 0,
      twins: [0, 1, 2].map(() => ({ a: new Float64Array(3), b: new Float64Array(3), ra: new Float64Array(270), rb: new Float64Array(270), at: 0, cnt: 0, age: -1, split: 0 })) });
  },
  draw(W) {
    const { N, dt, f, w } = W, c = w.cam;
    accFor(w, N);
    if (f.section === 'change') w.kind = rollKind(W, LOR_K, w.kind);
    if (f.section === 'drop') w.sweep = 0;
    w.n = 2400 + 700 * bandOf(W.a) + BURST;
    w.cls = w.kind === 'wings' ? 1 : 0;
    w.e = follow(w.e, energy(f), dt, 0.4);
    w.bd = follow(w.bd, clamp(f.rel.bassDrive), dt, 0.5);
    let rho = 25 + 10 * w.bd;
    if (w.sweep >= 0) { // up a trapezoid of two bars to the window and back
      const T = 2 * barT(f), q = w.sweep / T;
      rho += (99.7 - rho) * (q < 0.35 ? ease(q / 0.35) : q < 0.65 ? 1 : ease((1 - q) / 0.35));
      if ((w.sweep += dt) > T) w.sweep = -1;
    }
    w.rho = rho;
    // the framing follows the attractor's size (about 5.5 √(ρ − 7.5)) and its height (ρ − 3)
    w.Rs = follow(w.Rs, 5.5 * Math.sqrt(rho - 7.5), dt, 0.3);
    w.zc = follow(w.zc, rho - 3, dt, 0.3);
    w.g[2] = w.zc; w.lim = (5 * w.Rs) ** 2; w.jit = 1e-3 * w.Rs;
    aim(c, Z_UP, 1 / w.Rs, 0, 0, w.zc, 0.6 + f.rel.bassClock * 0.12, 0.3 + 0.15 * Math.sin(f.rel.midClock * 0.3), 3.3, 1.2 * N * (1 + 0.05 * f.beat.pulse), N / 2, N / 2);
    if (hitsOn(W, c, 0.02 * w.Rs)) twinLaunch(w); // (a snare's flip swaps the wings)
    if (w.kind === 'filament') { w.feed += dt * 120; const k = w.feed | 0; w.feed -= k; if (k) inject(w, k, 0.003 * w.Rs, 1); }
    // slower in the system's own time as ρ grows, so the motion on screen keeps its pace
    const n = owed(w, dt, (0.3 + 0.7 * w.e) * Math.min(1, 30 / rho), 0.01, 12);
    rkLorenz(w.P, w.n, n, 0.01, rho, w.Hs);
    splat(W, c, w.Hs, w.n, n, 1);
    keep(W, n);
    twinsStep(W, n);
    toneMap(W, 1 + 2 * w.flash + 0.3 * f.beat.pulse, 0.3);
    w.flash *= Math.exp(-dt * 10);
    trail(W, c, w.ring, w.len, w.at, w.cnt, FIG, LMID, MID);
    twinsDraw(W, c);
    headMark(W, c, f.beat.on ? WHITE : FIG, 1.2 + 0.8 * f.beat.pulse);
  },
};

// ---------------------------------------------------------------------------------------------- rossler
// Rössler (a = b = 0.2) with c on the bass in steps through the period doublings, 2.5 → 3.5 → 4 → 5.7, so the orbit
// goes 1 → 2 → 4 → chaos with the music: a long phase-space trail over a cloud, and the Poincaré section (y = 0,
// x < 0) as HOT dots, one per loop of the period. A kick bursts new trajectories at the head, a snare flashes and
// lights the spike, a note recolours its twelfth, the beat breathes the zoom; a drop is the big funnel for two bars
// (c = 18 with a = 0.3: at a = 0.2 c = 18 is a periodic window).
const ROS_K = [KIND('trail', 3, 2, 1), KIND('section', 2, 2, 2), KIND('cloud', 1, 2, 3)];
const ROS_C = [2.5, 3.5, 4, 5.7], ROS_N = { trail: 500, section: 650, cloud: 900 }, ROS_T = { trail: 1400, section: 700, cloud: 450 };
const rossler = {
  init(W) {
    const w = W.w;
    Object.assign(w, { a: 0.2, c: 5.7 });
    swarm(W, 900, 1400, 30, (P, np, n, Hs) => rkRossler(P, np, n, 0.025, w.a, 0.2, w.c, Hs), [1, 1, 0], 2000, 8);
    Object.assign(w, { kind: rollKind(W, ROS_K), lvl: 3, bl: 0.8, big: 0, sec: new Float64Array(3 * 48), sAt: 0, sCnt: 0, sFlash: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w } = W, c = w.cam;
    accFor(w, N);
    if (f.section === 'change') w.kind = rollKind(W, ROS_K, w.kind);
    if (f.section === 'drop') w.big = 2 * barT(f);
    w.n = ROS_N[w.kind] + BURST;
    w.bl = follow(w.bl, clamp(f.rel.bassDrive), dt, 0.4);
    w.lvl = plateau(w.lvl, w.bl, [0.22, 0.47, 0.72]);
    w.big -= dt;
    w.c = follow(w.c, w.big > 0 ? 18 : ROS_C[w.lvl], dt, w.c > 6.5 && w.big <= 0 ? 3 : 1.2); // down from the funnel slowly: its spikes must settle
    w.a = follow(w.a, w.big > 0 ? 0.3 : 0.2, dt, 0.5);
    w.e = follow(w.e, energy(f), dt, 0.4);
    // the framing grows with c: the band is about 1.9c across, the spike rises above it
    const R = 1.9 * w.c + 0.5;
    w.g[0] = 0.1 * R; w.g[1] = -0.13 * R; w.g[2] = 0.25 * R; w.lim = (14 * R) ** 2; w.jit = 1e-3 * R;
    w.cls = w.flip < 0 ? 3 : 0; w.clsA = 0.6 * R; w.clsB = 0; w.zmin = -0.02 * R; // (z ≥ 0 in the flow, b > 0)
    aim(c, Z_UP, 1 / R, w.g[0], w.g[1], w.g[2], 2.6 + f.rel.bassClock * 0.1, 0.5 + 0.15 * Math.sin(f.rel.midClock * 0.27), 3.4, 1.05 * N * (1 + 0.05 * f.beat.pulse), N / 2, 0.6 * N);
    hitsOn(W, c, 0.01 * R);
    const n = owed(w, dt, (2.5 + 4.5 * w.e) * Math.min(1, 8 / w.c), 0.025, 30);
    let px = w.P[0], py = w.P[1], pz = w.P[2];
    rkRossler(w.P, w.n, n, 0.025, w.a, 0.2, w.c, w.Hs);
    // the head's crossings of the section (y = 0 going down, at x < 0), between its steps
    for (let s = 0, o = 0; s < n; s++, o += 3 * w.n) {
      const x = w.Hs[o], y = w.Hs[o + 1], z = w.Hs[o + 2];
      if (py > 0 && y <= 0 && x < 0) {
        const q = py / (py - y);
        w.sAt = (w.sAt + 1) % 48; w.sec[3 * w.sAt] = px + q * (x - px); w.sec[3 * w.sAt + 1] = 0; w.sec[3 * w.sAt + 2] = pz + q * (z - pz);
        w.sCnt++; w.sFlash = 1;
      }
      px = x; py = y; pz = z;
    }
    splat(W, c, w.Hs, w.n, n, 1);
    keep(W, n);
    toneMap(W, 1 + 1.5 * w.flash + 0.3 * f.beat.pulse, 0.45);
    w.flash *= Math.exp(-dt * 10);
    // the section's edge, then the trail, then the crossings
    seg(W, c, 0, 0, 0, -1.25 * R, 0, 0, DARK); seg(W, c, -1.25 * R, 0, 0, -1.25 * R, 0, 0.5 * R, DARK);
    trail(W, c, w.ring, w.len, w.at, Math.min(w.cnt, ROS_T[w.kind]), FIG, LMID, MID);
    const big = w.kind === 'section' ? 2 : 1.2;
    for (let k = 0; k < Math.min(48, w.sCnt); k++) {
      const j = (w.sAt - k + 48) % 48;
      if (toScreen(c, w.sec[3 * j], 0, w.sec[3 * j + 2], PT)) r.disc(PT[0], PT[1], Math.max(0.8, big * u * (k ? 1 : 1 + w.sFlash)), k === 0 && w.sFlash > 0.5 ? WHITE : k < 12 ? HOT : HOT + DIM);
    }
    w.sFlash *= Math.exp(-dt * 6);
    headMark(W, c, f.beat.on ? WHITE : FIG, 1.1 + 0.7 * f.beat.pulse);
  },
};

// ---------------------------------------------------------------------------------------------- aizawa
// The Aizawa attractor (a .95 b .7 c .6 d 3.5 e .25 f .1; chaotic only in patches round these, so they stay put): a
// sphere pierced by a tube on its axis, two thousand particles turning slowly on the bass clock, lit from the core
// (a point counts for more the nearer the axis, more with the bass). A kick bursts new trajectories at the head, a
// snare flashes and swaps the bands, a note recolours its twelfth, the beat breathes the zoom; a drop dives the eye
// down the tube for two bars. A stable point at z = −1.104 coexists with it: a particle that falls in leaves again.
const AIZ_K = [KIND('shell', 3, 2, 1), KIND('tube', 1, 2, 2), KIND('bands', 1, 2, 3)];
const aizawa = {
  init(W) {
    const w = W.w;
    swarm(W, 2600, 300, 8, (P, np, n, Hs) => rkAizawa(P, np, n, 0.02, Hs), [0.1, 0, 0], 3000, 3);
    Object.assign(w, { kind: rollKind(W, AIZ_K), dive: 0, pit: 0.3, D: 3.1, bl: 0 });
    w.g[2] = 0.7; w.lim = 16; w.sink = -1.104; w.jit = 2e-3; w.clsA = 0.7;
  },
  draw(W) {
    const { N, dt, f, w } = W, c = w.cam;
    accFor(w, N);
    if (f.section === 'change') w.kind = rollKind(W, AIZ_K, w.kind);
    if (f.section === 'drop') { w.dive = 2 * barT(f); inject(w, BURST, 0.05, 1); }
    w.n = 1800 + 400 * bandOf(W.a) + BURST;
    w.cls = w.kind === 'bands' ? 3 : 0; w.clsB = -1;
    w.e = follow(w.e, energy(f), dt, 0.4);
    w.bl = follow(w.bl, clamp(f.rel.bassDrive), dt, 0.3);
    w.core = 1.2 * (1 + w.bl);
    w.dive -= dt;
    w.pit = follow(w.pit, w.dive > 0 ? 1.45 : w.kind === 'tube' ? 1.15 : 0.3 + 0.22 * Math.sin(f.rel.midClock * 0.25), dt, 0.7);
    w.D = follow(w.D, w.dive > 0 ? 2.2 : 3.1, dt, 0.7);
    aim(c, Z_UP, 1 / 1.6, 0, 0, 0.7, f.rel.bassClock * 0.1, w.pit, w.D, 1.1 * N * (1 + 0.05 * f.beat.pulse), N / 2, N / 2);
    hitsOn(W, c, 0.03);
    const n = owed(w, dt, 0.35 + 0.8 * w.e, 0.02, 8);
    rkAizawa(w.P, w.n, n, 0.02, w.Hs);
    splat(W, c, w.Hs, w.n, n, 1);
    keep(W, n);
    toneMap(W, 1 + 2 * w.flash + 0.25 * f.beat.pulse, 0.35);
    w.flash *= Math.exp(-dt * 10);
    if (w.kind !== 'shell') trail(W, c, w.ring, w.len, w.at, w.cnt, LMID, MID, DARK);
    headMark(W, c, f.beat.on ? WHITE : FIG, 1 + 0.6 * f.beat.pulse);
  },
};

// ---------------------------------------------------------------------------------------------- thomas
// Thomas' cyclically symmetric attractor (dx = sin y − bx, and round): b follows the energy over three regimes, a
// simple cycle at 0.30, chaos at 0.18 and the labyrinth chaos at 0.09 (between them lie periodic windows, 0.11–0.17
// among them), the particles coloured by the lobe they are out in (the axis they are furthest along), the diagonal it
// is symmetric about upright; the kinds are a short head trail, a long one, a denser cloud. A kick bursts new
// trajectories at the head, a snare turns the lobe colours, a note recolours its twelfth, the beat breathes the zoom;
// a drop is the deep labyrinth (b = 0.05) for two bars, the framing following its size.
const THO_K = [KIND('cloud', 3, 2, 1), KIND('trail', 2, 2, 1), KIND('dense', 1, 2, 3)];
const THO_B = [0.3, 0.18, 0.09];
const thomas = {
  init(W) {
    const w = W.w;
    w.b = 0.18;
    swarm(W, 2600, 500, 8, (P, np, n, Hs) => rkThomas(P, np, n, 0.15, w.b, Hs), [0.1, 0, 0], 1500, 2);
    Object.assign(w, { kind: rollKind(W, THO_K), lvl: 1, el: 0.5, deep: 0, Rs: 4.4 });
    w.lim = 900; w.tTau = 2;
  },
  draw(W) {
    const { N, dt, f, w } = W, c = w.cam;
    accFor(w, N);
    if (f.section === 'change') w.kind = rollKind(W, THO_K, w.kind);
    if (f.section === 'drop') w.deep = 2 * barT(f);
    w.n = (w.kind === 'dense' ? 2300 : 1900) + 150 * bandOf(W.a) + BURST;
    w.cls = 2;
    w.e = follow(w.e, energy(f), dt, 0.4);
    w.el = follow(w.el, energy(f), dt, 0.8);
    w.lvl = plateau(w.lvl, w.el, [0.3, 0.62]);
    w.deep -= dt;
    w.b = follow(w.b, w.deep > 0 ? 0.05 : THO_B[w.lvl], dt, 1.2);
    w.Rs = follow(w.Rs, Math.max(4.4, 0.7 / w.b), dt, 0.6);
    w.jit = 2e-4 * w.Rs;
    aim(c, D_UP, 1 / w.Rs, 0, 0, 0, f.rel.bassClock * 0.12, 0.5 + 0.2 * Math.sin(f.rel.midClock * 0.21), 3.2, 1.15 * N * (1 + 0.05 * f.beat.pulse), N / 2, N / 2);
    hitsOn(W, c, 0.05);
    const n = owed(w, dt, 2.5 + 5 * w.e, 0.15, 8);
    rkThomas(w.P, w.n, n, 0.15, w.b, w.Hs);
    splat(W, c, w.Hs, w.n, n, 1);
    keep(W, n);
    toneMap(W, 1 + 2 * w.flash + 0.3 * f.beat.pulse, 0.5);
    w.flash *= Math.exp(-dt * 10);
    trail(W, c, w.ring, w.len, w.at, w.kind === 'trail' ? w.cnt : Math.min(w.cnt, 120), FIG, LMID, MID);
    headMark(W, c, f.beat.on ? WHITE : FIG, 1 + 0.6 * f.beat.pulse);
  },
};

// ---------------------------------------------------------------------------------------------- halvorsen
// Halvorsen's attractor (dx = −ax − 4y − 4z − y², and round; a 1.27–1.53 on the mids, along its chaotic stretches
// only: the periodic windows in it, 1.326–1.340 the widest, are stepped over; it turns periodic above ~1.6),
// three-fold symmetric about the diagonal, which a section change turns toward the eye, so it is seen down its axis,
// or away again. Particles coloured by the arm they are out in; a kick bursts new trajectories at the head, a snare
// turns the arm colours, a note recolours its twelfth, the beat breathes the zoom; a drop spins it about its axis at
// a = 1.27 for two bars.
const HAL_K = [KIND('axis', 2, 2, 1), KIND('side', 2, 1, 2), KIND('arms', 1, 2, 3)];
// the stretches of a where the largest Lyapunov exponent is over 0.3 (the windows at 1.3255–1.3395, 1.375, 1.419–1.4215
// and 1.4995–1.5105 left out, with the weak chaos before them), and a point `v` 0..1 of the way along them
const HAL_A = [1.27, 1.318, 1.341, 1.374, 1.3765, 1.4185, 1.4225, 1.4985, 1.5115, 1.531];
const HAL_L = HAL_A.reduce((s, a, i) => s + (i & 1 ? a - HAL_A[i - 1] : 0), 0);
function halA(v) {
  let s = clamp(v) * HAL_L;
  for (let i = 0; i < HAL_A.length; i += 2) { const d = HAL_A[i + 1] - HAL_A[i]; if (s <= d) return HAL_A[i] + s; s -= d; }
  return HAL_A[HAL_A.length - 1];
}
const halvorsen = {
  init(W) {
    const w = W.w;
    w.a = 1.4;
    swarm(W, 2600, 400, 10, (P, np, n, Hs) => rkHalvorsen(P, np, n, 0.012, w.a, Hs), [-5, 0, 0], 3000, 3);
    Object.assign(w, { kind: rollKind(W, HAL_K), md: 0.5, pit: 0.4, spin: 0, spinT: 0 });
    w.axis = w.kind === 'axis' ? 1 : 0;
    w.g[0] = w.g[1] = w.g[2] = -3.1; w.lim = 900; w.jit = 1e-2;
  },
  draw(W) {
    const { N, dt, f, w } = W, c = w.cam;
    accFor(w, N);
    if (f.section === 'change') { w.kind = rollKind(W, HAL_K, w.kind); w.axis ^= 1; }
    if (f.section === 'drop') { w.spinT = 2 * barT(f); inject(w, BURST, 0.1, 1); }
    w.n = 1900 + 350 * bandOf(W.a) + BURST;
    w.cls = w.kind === 'arms' ? 2 : 0;
    w.e = follow(w.e, energy(f), dt, 0.4);
    w.md = follow(w.md, clamp(f.rel.midDrive), dt, 0.8);
    w.spinT -= dt;
    w.a = w.spinT > 0 ? 1.27 : halA(w.md);
    w.spin += dt * (w.spinT > 0 ? 1.6 : 0);
    w.pit = follow(w.pit, w.axis ? -1.45 : 0.35 + 0.2 * Math.sin(f.rel.midClock * 0.23), dt, 0.8);
    aim(c, D_UP, 1 / 12, -3.1, -3.1, -3.1, f.rel.bassClock * 0.12 + w.spin, w.pit, 3.2, 1.2 * N * (1 + 0.05 * f.beat.pulse), N / 2, N / 2);
    hitsOn(W, c, 0.1);
    const n = owed(w, dt, 0.35 + 0.6 * w.e, 0.012, 10);
    rkHalvorsen(w.P, w.n, n, 0.012, w.a, w.Hs);
    splat(W, c, w.Hs, w.n, n, 1);
    keep(W, n);
    toneMap(W, 1 + 2 * w.flash + 0.3 * f.beat.pulse, 0.35);
    w.flash *= Math.exp(-dt * 10);
    trail(W, c, w.ring, w.len, w.at, w.cnt, FIG, LMID, MID);
    headMark(W, c, f.beat.on ? WHITE : FIG, 1 + 0.6 * f.beat.pulse);
  },
};

// ---------------------------------------------------------------------------------------------- chaosgame
// The chaos game in 3-D: a point jumps by one map of an IFS picked at random by its probability, again and again, and
// lands on the attractor; a few thousand jumps a frame go into a ring of points re-projected each frame through a
// depth buffer (near is bright, a cell behind a nearer neighbour darker), coloured by the copy each point lies in.
// The Sierpinski tetrahedron (4 maps, ratio 1/2), the Menger sponge (20, ratio 1/3), a fern (Barnsley's four maps
// curled into 3-D, probabilities .01 .85 .07 .07) and the octahedron flake (6, ratio 1/2). The energy is the rate, a
// kick makes the copies breathe (each map's ratio a share of the way up to one, so every copy swells by the same few
// per cent about its place, the fern's 0.85 stem as little as the sponge's thirds), a snare colours by the sub-copies
// instead, a note lights its copy, the beat turns the colours a step; a section change morphs into another set in a
// second (the maps blended), a drop over two bars.
const toward = (v, k) => [k, 0, 0, (1 - k) * v[0], 0, k, 0, (1 - k) * v[1], 0, 0, k, (1 - k) * v[2]];
// an IFS: its maps, their probabilities, where each map's copy of the attractor sits (its fixed point: the map applied
// over and over from anywhere) and each map's ratio (the largest singular value of its linear part)
function ifs(maps, p) {
  const m = Float64Array.from(maps.flat()), fp = new Float64Array(3 * p.length), ra = new Float64Array(p.length);
  for (let j = 0; j < p.length; j++) {
    let x = 0, y = 0, z = 0;
    for (let k = 0, o = 12 * j; k < 80; k++) { const nx = m[o] * x + m[o + 1] * y + m[o + 2] * z + m[o + 3], ny = m[o + 4] * x + m[o + 5] * y + m[o + 6] * z + m[o + 7]; z = m[o + 8] * x + m[o + 9] * y + m[o + 10] * z + m[o + 11]; x = nx; y = ny; }
    fp[3 * j] = x; fp[3 * j + 1] = y; fp[3 * j + 2] = z;
    // the ratio: power iteration on AᵀA
    const o = 12 * j, a = (i, k) => m[o + 4 * i + k];
    let u = [1, 0.6, 0.3], s = 0;
    for (let it = 0; it < 60; it++) {
      const v = [0, 1, 2].map((i) => a(i, 0) * u[0] + a(i, 1) * u[1] + a(i, 2) * u[2]), q = [0, 1, 2].map((k) => a(0, k) * v[0] + a(1, k) * v[1] + a(2, k) * v[2]);
      s = Math.hypot(q[0], q[1], q[2]) || 1e-9; u = q.map((c) => c / s);
    }
    ra[j] = Math.max(0.05, Math.sqrt(s));
  }
  return { n: p.length, m, p: Float64Array.from(p), fp, ra };
}
function fernIFS() {
  const c = Math.cos(0.1), s = Math.sin(0.1), raw = [
    [0, 0, 0, 0, 0, 0.16, 0, 0, 0, 0, 0, 0],
    [0.85 * c, 0.04, 0.85 * s, 0, -0.04, 0.85, 0, 1.6, -0.85 * s, 0, 0.85 * c, 0], // and a turn round the stem
    [0.2, -0.26, 0, 0, 0.23, 0.22, 0, 1.6, 0, 0.1, 0.3, 0], // the leaflets rise out of the frond's plane
    [-0.15, 0.28, 0, 0, 0.26, 0.24, 0, 0.44, 0, 0.1, 0.3, 0],
  ], p = [0.01, 0.85, 0.07, 0.07], lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  // its extent from a run of the game, then each map conjugated into the unit box: q = k (x − c), t' = k (A c + t − c)
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < 30000; i++) {
    const u = hash(i, 91), m = raw[u < 0.01 ? 0 : u < 0.86 ? 1 : u < 0.93 ? 2 : 3];
    [x, y, z] = [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
    if (i > 50) { lo[0] = Math.min(lo[0], x); lo[1] = Math.min(lo[1], y); lo[2] = Math.min(lo[2], z); hi[0] = Math.max(hi[0], x); hi[1] = Math.max(hi[1], y); hi[2] = Math.max(hi[2], z); }
  }
  const ctr = [0, 1, 2].map((d) => (lo[d] + hi[d]) / 2), k = 1.9 / Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  return ifs(raw.map((m) => m.map((v, i) => ((i & 3) !== 3 ? v : k * (m[i - 3] * ctr[0] + m[i - 2] * ctr[1] + m[i - 1] * ctr[2] + v - ctr[i >> 2])))), p);
}
function spongeIFS() {
  const maps = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) if (Math.abs(i) + Math.abs(j) + Math.abs(k) > 1) maps.push(toward([0.62 * i, 0.62 * j, 0.62 * k], 1 / 3));
  return ifs(maps, maps.map(() => 1 / 20));
}
const T4 = 0.62, O6 = 1.05;
const IFS = {
  tetra: ifs([[T4, T4, T4], [T4, -T4, -T4], [-T4, T4, -T4], [-T4, -T4, T4]].map((v) => toward(v, 0.5)), [0.25, 0.25, 0.25, 0.25]),
  sponge: spongeIFS(),
  fern: fernIFS(),
  octa: ifs([[O6, 0, 0], [-O6, 0, 0], [0, O6, 0], [0, -O6, 0], [0, 0, O6], [0, 0, -O6]].map((v) => toward(v, 0.5)), [1, 1, 1, 1, 1, 1].map((v) => v / 6)),
};
const CG_K = [KIND('tetra', 2, 2, 2), KIND('sponge', 1, 2, 3), KIND('fern', 3, 1, 1), KIND('octa', 1, 2, 2)];
// The maps in use. A morph pairs every copy with the nearest copy of the other set (by where they sit; every map of
// either set in at least one pair), so each copy slides to its nearest counterpart; the pairs are blended by `mix`,
// a pair's probability going from its A map's share to its B map's (so at either end it is exactly A or exactly B).
// The linear parts breathe by `br`: a map of ratio ρ is scaled by 1 + br (1 − ρ) / ρ, which moves its copy's fixed
// point out by about 1 + br whatever ρ is (a plain 1 + br would throw the fern's tip, ρ 0.85, twice as far); and the
// table that picks a map by its probability, in steps of 1/1024.
function cgPair(w) {
  const A = IFS[w.kA], B = IFS[w.kB], big = A.n >= B.n, S = big ? A : B, T = big ? B : A, K = S.n, { sl, use } = w;
  const d2 = (s, t) => (S.fp[3 * s] - T.fp[3 * t]) ** 2 + (S.fp[3 * s + 1] - T.fp[3 * t + 1]) ** 2 + (S.fp[3 * s + 2] - T.fp[3 * t + 2]) ** 2;
  sl.fill(-1);
  for (let t = 0; t < T.n; t++) { let best = 0, bd = 1e9; for (let q = 0; q < K; q++) if (sl[q] < 0 && d2(q, t) < bd) { bd = d2(q, t); best = q; } sl[best] = t; }
  for (let q = 0; q < K; q++) if (sl[q] < 0) { let best = 0, bd = 1e9; for (let t = 0; t < T.n; t++) if (d2(q, t) < bd) { bd = d2(q, t); best = t; } sl[q] = best; }
  use.fill(0);
  for (let q = 0; q < K; q++) use[sl[q]]++;
  for (let q = 0; q < K; q++) {
    const t = sl[q];
    w.pa[q] = big ? q : t; w.pb[q] = big ? t : q;
    w.qa[q] = big ? A.p[q] : A.p[t] / use[t]; w.qb[q] = big ? B.p[t] / use[t] : B.p[q];
  }
  w.Kp = K;
}
function ifsBuild(w) {
  const A = IFS[w.kA], B = IFS[w.kB], two = w.mix > 0, m = two ? w.mix : 0, K = two ? w.Kp : A.n, out = w.maps, pt = w.pick;
  let acc = 0, from = 0;
  for (let k = 0; k < K; k++) {
    const a = two ? w.pa[k] : k, b = two ? w.pb[k] : 0, ro = A.ra[a] * (1 - m) + B.ra[b] * m, sc = 1 + w.br * (1 + 0.5 * Math.sin(k * 2.4)) * (1 - ro) / ro;
    for (let i = 0; i < 12; i++) { const v = A.m[12 * a + i] * (1 - m) + B.m[12 * b + i] * m; out[12 * k + i] = (i & 3) === 3 ? v : v * sc; }
    acc += two ? w.qa[k] * (1 - m) + w.qb[k] * m : A.p[k];
    const to = k === K - 1 ? 1024 : Math.min(1024, Math.round(acc * 1024));
    for (let j = from; j < to; j++) pt[j] = k;
    from = Math.max(from, to);
  }
  w.K = K;
}
function cgBufs(W) {
  const { w, N, rnd } = W, n = Math.min(36000, Math.round(0.9 * N * N));
  Object.assign(w, { N, np: n, pts: new Float32Array(3 * n), ad1: new Uint8Array(n), ad2: new Uint8Array(n), zb: new Float32Array(N * N), cl: new Uint8Array(N * N), at: 0,
    acc: new Float32Array(N * N), tag: new Float32Array(N * N), ts: new Float64Array(2), ref: 0 });
  cgJump(w, rnd, 60); // onto the attractor first, then the ring full from the start (over those)
  cgJump(w, rnd, n);
}
// a morph into another set over `dur` seconds (one already under way lands first)
function cgMorph(W, dur) {
  const w = W.w;
  if (w.mix > 0) { w.kA = w.kB; w.mix = 0; }
  w.kB = rollKind(W, CG_K, w.kA); w.mix = 1e-6; w.mixDur = dur;
  cgPair(w);
}
// `k` jumps of the game into the ring: the point after map j lies in copy j, after j then i in sub-copy i of copy j.
// The picks from a xorshift seeded by `rnd` once a call (deterministic, and no number boxed per jump).
function cgJump(w, rnd, k) {
  const { maps, pick, pts, ad1, ad2, np } = w;
  let x = w.x, y = w.y, z = w.z, last = w.last, sd = (rnd() * 4294967296) | 0 || 1;
  for (let it = 0; it < k; it++) {
    sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5;
    const j = pick[sd >>> 22], o = 12 * j;
    const nx = maps[o] * x + maps[o + 1] * y + maps[o + 2] * z + maps[o + 3], ny = maps[o + 4] * x + maps[o + 5] * y + maps[o + 6] * z + maps[o + 7];
    z = maps[o + 8] * x + maps[o + 9] * y + maps[o + 10] * z + maps[o + 11]; x = nx; y = ny;
    const i = (w.at = (w.at + 1) % np);
    pts[3 * i] = x; pts[3 * i + 1] = y; pts[3 * i + 2] = z; ad1[i] = j; ad2[i] = last; last = j;
  }
  w.x = x; w.y = y; w.z = z; w.last = last;
}
const CG_RAMP = [RAMP_V, RAMP_H, RAMP_C], VOL = { sponge: 1, octa: 1 };
const chaosgame = {
  init(W) {
    const { w } = W;
    Object.assign(w, { kA: rollKind(W, CG_K), kB: 'tetra', mix: 0, mixDur: 1, br: 0, lvl: 0, hi: -1, hiT: 0, turn: 0, clock: 0, owe: 0, e: 0.5, flash: 0,
      maps: new Float64Array(12 * 20), pick: new Uint8Array(1024), K: 4, x: 0, y: 0, z: 0, last: 0, N: 0, cam: camera(), sh: new Uint8Array(20),
      sl: new Int8Array(20), use: new Uint8Array(20), pa: new Uint8Array(20), pb: new Uint8Array(20), qa: new Float64Array(20), qb: new Float64Array(20), Kp: 4 });
    w.kB = w.kA;
    ifsBuild(w);
    cgBufs(W);
  },
  draw(W) {
    const { r, N, dt, f, w, rnd, hits, targets } = W, c = w.cam, buf = r.buf;
    if (w.N !== N) cgBufs(W);
    if (f.section === 'change') cgMorph(W, 1);
    if (f.section === 'drop') cgMorph(W, 2 * barT(f));
    for (const hh of hits) {
      if (isLow(hh)) w.br = Math.max(w.br, 0.07 * hh.strength);
      else if (hh.kind === 'snare') { w.lvl ^= 1; w.flash = 1; }
      else if (isTonal(hh)) { w.hi = hh.pc; w.hiT = 1.2; }
    }
    if (beatLocked(f) ? f.beat.on : (w.clock += dt) > 0.5) { w.clock = 0; w.turn = (w.turn + 1) % 3; }
    if (w.mix > 0 && (w.mix += dt / w.mixDur) >= 1) { w.kA = w.kB; w.mix = 0; }
    w.br *= Math.exp(-dt / 0.25);
    w.hiT -= dt;
    w.e = follow(w.e, energy(f), dt, 0.4);
    ifsBuild(w);
    // a volume (dimension over 2.5) is drawn as an X-ray of the newest points, so it takes many more of them
    const vol = VOL[w.kA] || (w.mix > 0 && VOL[w.kB]), sz = (N / 125) ** 2;
    w.owe += dt * (vol ? 160000 + 200000 * w.e : 50000 + 90000 * w.e) * (vol ? Math.min(2, sz) : 1);
    const k = Math.min(w.np >> 1, w.owe | 0);
    w.owe = Math.min(w.owe - k, 1); // (what the ring cannot take this frame is let go)
    cgJump(w, rnd, k);
    // the colour of each map: its copy number turned by the beat; the copy a note lit goes COOL
    for (let j = 0; j < w.K; j++) w.sh[j] = j === w.hi % w.K && w.hiT > 0 ? 2 : (j + w.turn) % 3;
    // the fern is mostly a plane: it turns to and fro facing the eye; a volume to and fro about an axis, its tunnels lined
    // up; the others go round
    const fern = w.kA === 'fern' && (w.mix === 0 || w.kB === 'fern'), sw = Math.sin(f.rel.bassClock * 0.15);
    const yaw = fern ? 0.6 * sw : vol ? 0.22 * sw : f.rel.bassClock * 0.15 + 0.5, pit = vol ? 0.15 * Math.sin(f.rel.midClock * 0.2) : 0.35 + 0.25 * Math.sin(f.rel.midClock * 0.2);
    aim(c, ID3, 1, 0, 0, 0, yaw, pit, 3.8, 1.35 * N * (1 + 0.05 * f.beat.pulse), N / 2, N / 2);
    const { pts, ad1, ad2, zb, cl, acc, tag, np, sh } = w, m = c.m, D = c.D, F = c.F, ox = c.ox, oy = c.oy, ad = w.lvl ? ad2 : ad1;
    if (vol) {
      // the X-ray: this frame's new points into the fading density, the nearer ones weighing more
      for (let q = 0, i = w.at; q < k; q++, i = i ? i - 1 : np - 1) {
        const x = pts[3 * i], y = pts[3 * i + 1], z = pts[3 * i + 2], Z = D + m[8] * x + m[9] * y + m[10] * z + m[11], q = F / Z;
        const sx = ox + (m[0] * x + m[1] * y + m[2] * z + m[3]) * q, sy = oy - (m[4] * x + m[5] * y + m[6] * z + m[7]) * q;
        if (sx < 0 || sy < 0 || sx >= N || sy >= N) continue;
        const j = (sy | 0) * N + (sx | 0), wt = D + 1.4 - Z, k = sh[ad[i] % w.K];
        acc[j] += wt; tag[j] += k === 1 ? wt : k === 2 ? -wt : 0;
      }
      toneMap(W, 1 + 1.5 * w.flash, 0.3);
    } else {
      zb.fill(1e9);
      for (let i = 0; i < np; i++) {
        const x = pts[3 * i], y = pts[3 * i + 1], z = pts[3 * i + 2], Z = D + m[8] * x + m[9] * y + m[10] * z + m[11], q = F / Z;
        const sx = ox + (m[0] * x + m[1] * y + m[2] * z + m[3]) * q, sy = oy - (m[4] * x + m[5] * y + m[6] * z + m[7]) * q;
        if (sx < 0 || sy < 0 || sx >= N || sy >= N) continue;
        const j = (sy | 0) * N + (sx | 0);
        if (Z < zb[j]) { zb[j] = Z; cl[j] = sh[ad[i] % w.K]; }
      }
      // a surface (dimension 2 or under) through a depth buffer: near is bright; a neighbour nearer by more than a step
      // puts this cell in its shadow
      const z0 = D - 1.1, zk = 1 / 2.2, up = w.flash * 0.6;
      for (let y = 0, i = 0; y < N; y++) {
        const dr = (y & 7) << 3;
        for (let x = 0; x < N; x++, i++) {
          const z = zb[i];
          if (z >= 1e9) continue;
          let lt = 1 - (z - z0) * zk + up;
          if (x > 0 && zb[i - 1] < z - 0.06) lt -= 0.16;
          if (x < N - 1 && zb[i + 1] < z - 0.06) lt -= 0.16;
          if (y > 0 && zb[i - N] < z - 0.06) lt -= 0.16;
          if (y < N - 1 && zb[i + N] < z - 0.06) lt -= 0.16;
          const lv = 1 + ((lt * 3.6 + BAYER[dr | (x & 7)] - 0.5) | 0);
          buf[i] = CG_RAMP[cl[i]][lv < 1 ? 1 : lv > 4 ? 4 : lv];
        }
      }
    }
    w.flash *= Math.exp(-dt * 10);
    targets.push({ x: N * 0.3, y: N * 0.3, w: N * 0.4, h: N * 0.4 });
  },
};

// ---------------------------------------------------------------------------------------------- ray marching
// The two ray-marched worlds draw at a low internal resolution (N/3, at most 64 or 52 a side; rebuilt when N
// changes), interlaced (a quarter of the cells a frame), into `dp` (the distance, −1 a miss), `ao` and `tr` (the orbit
// trap); a light pass makes the shade `sh` of all of it, which is blown up with a bilinear read and an ordered
// dither onto the ramp. A distance estimate takes its point and argument from DQ[0..3] and leaves the distance in
// DQ[4] and the orbit trap in DQ[5]: a typed array, so no number is boxed on the way in or out of the march's loop.
const DQ = new Float64Array(6);
function deAt(de, x, y, z, a) { DQ[0] = x; DQ[1] = y; DQ[2] = z; DQ[3] = a; de(); return DQ[4]; }
// atan2 to 1e-5 rad by a polynomial (the bulb takes two an iteration)
function fatan2(y, x) {
  const ax = Math.abs(x), ay = Math.abs(y), mx = ax > ay ? ax : ay, mn = ax > ay ? ay : ax;
  if (mx === 0) return 0;
  const a = mn / mx, s = a * a;
  let r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  if (ay > ax) r = Math.PI / 2 - r;
  if (x < 0) r = Math.PI - r;
  return y < 0 ? -r : r;
}
// The Mandelbulb's distance estimate, 0.5 · ln r · r / dr, for z → zⁿ + c in spherical coordinates (θ from the
// symmetry axis, here y; rⁿ⁻¹ as exp((n − 1) ln r), the angles' sines from the table); the orbit trap is the nearest
// the orbit came to the origin
function bulbDE() {
  const px = DQ[0], py = DQ[1], pz = DQ[2], n = DQ[3];
  let x = px, y = pz, z = py, dr = 1, r = Math.sqrt(x * x + y * y + z * z), t = r;
  if (r < 1e-9) { DQ[4] = DQ[5] = 0; return; }
  for (let i = 0; i < 6 && r < 2; i++) {
    const th = fatan2(Math.sqrt(x * x + y * y), z) * n, ph = fatan2(y, x) * n, rn = Math.exp((n - 1) * Math.log(r));
    dr = n * rn * dr + 1;
    const zr = rn * r, st = tsin(th);
    x = zr * st * tsin(ph + Math.PI / 2) + px; y = zr * st * tsin(ph) + pz; z = zr * tsin(th + Math.PI / 2) + py;
    r = Math.sqrt(x * x + y * y + z * z);
    if (r < t) t = r;
  }
  DQ[5] = t;
  DQ[4] = (0.5 * Math.log(r) * r) / dr;
}
// The Mandelbox's: a box fold (beyond ±1 folded back), a sphere fold (inside r 0.5 scaled by 4, inside 1 inverted),
// then z → s·z + c; DE = |z| / |dr|. The trap: the least r² the orbit had.
function boxDE() {
  const px = DQ[0], py = DQ[1], pz = DQ[2], s = DQ[3], as = Math.abs(s);
  let x = px, y = py, z = pz, dr = 1, t = 1e9;
  for (let i = 0; i < 9; i++) {
    x = x > 1 ? 2 - x : x < -1 ? -2 - x : x;
    y = y > 1 ? 2 - y : y < -1 ? -2 - y : y;
    z = z > 1 ? 2 - z : z < -1 ? -2 - z : z;
    const r2 = x * x + y * y + z * z;
    if (r2 < 0.25) { x *= 4; y *= 4; z *= 4; dr *= 4; } else if (r2 < 1) { const k = 1 / r2; x *= k; y *= k; z *= k; dr *= k; }
    if (r2 < t) t = r2;
    x = s * x + px; y = s * y + py; z = s * z + pz; dr = dr * as + 1;
  }
  DQ[5] = t;
  DQ[4] = Math.sqrt(x * x + y * y + z * z) / Math.abs(dr);
}
function marchBufs(w, N, most) {
  if (w.N === N) return;
  const R = Math.min(most, Math.max(12, Math.round(N / 3))), n = R * R;
  Object.assign(w, { N, R, dp: new Float32Array(n).fill(-1), ao: new Float32Array(n), tr: new Float32Array(n), sh: new Float32Array(n).fill(-1), hist: new Int32Array(32),
    lx: new Int32Array(N), lf: new Float32Array(N), ph: 0 });
  for (let x = 0; x < N; x++) { const s = Math.max(0, ((x + 0.5) * R) / N - 0.5); w.lx[x] = Math.min(R - 1, s | 0); w.lf[x] = Math.min(1, s - w.lx[x]); }
}
// a camera's frame from its eye looking along Fw with `up` roughly up: right = up × back, up' = back × right
function frame(Fw, up, Rt, Up) {
  let rx = up[1] * -Fw[2] - up[2] * -Fw[1], ry = up[2] * -Fw[0] - up[0] * -Fw[2], rz = up[0] * -Fw[1] - up[1] * -Fw[0];
  const rl = 1 / (Math.sqrt(rx * rx + ry * ry + rz * rz) || 1);
  rx *= rl; ry *= rl; rz *= rl;
  Rt[0] = rx; Rt[1] = ry; Rt[2] = rz;
  Up[0] = -Fw[1] * rz + Fw[2] * ry; Up[1] = -Fw[2] * rx + Fw[0] * rz; Up[2] = -Fw[0] * ry + Fw[1] * rx;
}
// A quarter of the rays a frame, the cells of one corner of every 2x2 block (the corners in the order 0 3 1 2, so a
// change fizzles in instead of tearing in rows): from E along Fw + (Rt, Up) × the cell's offset, marched by the
// estimate `de` (inside the ball `rb` round the origin when it is set, else up to `far`), a hit within half a cell's
// width. Its distance, the share of the steps it did not need (the ambient occlusion) and the orbit trap are kept.
// `om0` over-relaxes the steps (1: plain sphere tracing; the box keeps to that, its estimate is loose in its dust).
// (Checked step by step: of 680 000 bulb steps 2 cross the surface at whole powers; of the box's, plain, 1 in 7000.)
const QUARTER = [0, 3, 1, 2];
function marchQuarter(w, de, arg, E, Fw, Rt, Up, tf, rb, far, maxS, om0) {
  const R = w.R, pix = (2 * tf) / R, { dp, ao, tr } = w, q = QUARTER[(w.ph = (w.ph + 1) & 3)];
  DQ[3] = arg;
  for (let j = q >> 1; j < R; j += 2) for (let i = q & 1; i < R; i += 2) {
    const sx = (i + 0.5 - R / 2) * pix, sy = (R / 2 - j - 0.5) * pix, o = j * R + i;
    let dx = Fw[0] + Rt[0] * sx + Up[0] * sy, dy = Fw[1] + Rt[1] * sx + Up[1] * sy, dz = Fw[2] + Rt[2] * sx + Up[2] * sy;
    const dl = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
    dx *= dl; dy *= dl; dz *= dl;
    let t = 0, t1 = far;
    if (rb > 0) {
      const b = E[0] * dx + E[1] * dy + E[2] * dz, cc = E[0] * E[0] + E[1] * E[1] + E[2] * E[2] - rb * rb, disc = b * b - cc;
      if (disc < 0) { dp[o] = -1; continue; }
      const sq = Math.sqrt(disc);
      t = Math.max(0, -b - sq); t1 = Math.min(far, -b + sq);
    }
    // over-relaxed (steps of om0·d; when the new ball and the last stop overlapping, back to the last ball's edge and
    // plain steps from there): every step stays inside the balls; at 1.3 a fifth fewer estimates, fewer rays out of steps
    let k = 0, hit = false, om = om0, prev = 0, step = 0;
    for (; k < maxS; k++) {
      DQ[0] = E[0] + dx * t; DQ[1] = E[1] + dy * t; DQ[2] = E[2] + dz * t;
      de();
      const d = DQ[4];
      if (om > 1 && prev + d < step) { t -= step - step / om; om = 1; continue; }
      if (d < 0.5 * pix * t + 1e-4) { hit = true; break; }
      prev = d; step = om * d; t += step;
      if (t > t1) break;
    }
    dp[o] = hit ? t : -1; ao[o] = 1 - k / maxS; tr[o] = DQ[5];
  }
}
// The light, over the whole little picture each frame: a normal from how the distance changes across the neighbouring
// cells (in the eye's frame: x right, y up, z ahead), Lambert from the upper left in front, times the ambient
// occlusion and a fog with the distance. The accent's cut sits at the q-th quantile of the trap over the hits.
const LX = -0.45, LY = 0.55, LZ = -0.7;
function light(w, tf, far, q) {
  const { R, dp, ao, tr, sh, hist } = w, pix = (2 * tf) / R;
  let lo = 1e9, hi = -1e9, n = 0;
  for (let j = 0, o = 0; j < R; j++)
    for (let i = 0; i < R; i++, o++) {
      const t = dp[o];
      if (t < 0) { sh[o] = -1; continue; }
      const tl = i > 0 && dp[o - 1] >= 0 ? dp[o - 1] : t, tr2 = i < R - 1 && dp[o + 1] >= 0 ? dp[o + 1] : t, tu = j > 0 && dp[o - R] >= 0 ? dp[o - R] : t, td = j < R - 1 && dp[o + R] >= 0 ? dp[o + R] : t;
      const gx = (tr2 - tl) / (2 * pix * t), gy = (tu - td) / (2 * pix * t), lam = (gx * LX + gy * LY - LZ) / Math.sqrt(gx * gx + gy * gy + 1);
      const a = ao[o];
      sh[o] = (0.2 + 0.8 * (lam > 0 ? lam : 0)) * a * clamp(1.25 - t / far);
      if (tr[o] < lo) lo = tr[o];
      if (tr[o] > hi) hi = tr[o];
      n++;
    }
  hist.fill(0);
  const k = 31.99 / (hi - lo || 1);
  for (let o = 0; o < R * R; o++) if (dp[o] >= 0) hist[((tr[o] - lo) * k) | 0]++;
  let acc = 0, b = 0;
  while (b < 31 && (acc += hist[b]) < q * n) b++;
  return lo + (b + 1) / k;
}
// the blow-up: a bilinear read of the shade (a miss reads −1, so the edge dithers out), an ordered dither onto
// DARK..BRIGHT, the accent's ramp where the trap is over `cut`
function blowUp(W, cut, acc, lift) {
  const { r, N, w } = W, { R, sh, tr, lx, lf } = w, buf = r.buf, ramp = acc === HOT ? RAMP_H : RAMP_C;
  for (let y = 0, i = 0; y < N; y++) {
    const iy = lx[y], fy = lf[y], y0 = iy * R, y1 = Math.min(R - 1, iy + 1) * R, dr = (y & 7) << 3;
    for (let x = 0; x < N; x++, i++) {
      const ix = lx[x], fx = lf[x], x1 = Math.min(R - 1, ix + 1), a = sh[y0 + ix], top = a + (sh[y0 + x1] - a) * fx, bot = sh[y1 + ix] + (sh[y1 + x1] - sh[y1 + ix]) * fx;
      const v = (top + (bot - top) * fy) * 4.2 + BAYER[dr | (x & 7)] + lift;
      if (v < 1) continue;
      buf[i] = (tr[y0 + ix] > cut ? ramp : RAMP_V)[v >= 4 ? 4 : v | 0];
    }
  }
}

// ---------------------------------------------------------------------------------------------- mandelbulb
// The Mandelbulb (z → zⁿ + c in spherical coordinates) ray-marched by its distance estimate at a third of the size,
// interlaced, shaded by the steps the rays took (ambient occlusion) and a light from the depth's slope, the outer
// part of the orbit trap in the accent. The power n follows the bass over the kind's range (2–10 at its widest),
// the eye circles on the clocks; a kick jolts the power, a snare swaps the accent and flashes, a note moves the
// trap's cut, the beat pulls the eye in; a drop dives in close for two bars with the power thrown to the other end.
// The rays start on a ball that holds the whole bulb at its power: 1.12 + 0.9 / (n − 1)^1.45, over the farthest
// the set reaches (r 2.0 at n = 2 along its axis, the real antenna; 1.39 at 3, 1.20 at 5, 1.12 at 8, 1.10 at 10).
const BULB_K = [KIND('sweep', 2, 3, 2), KIND('round', 3, 1, 0), KIND('spiky', 0, 1, 3)];
const BULB_N = { sweep: [2, 10], round: [2, 5], spiky: [7, 10] };
const bulb = {
  init(W) {
    Object.assign(W.w, { kind: rollKind(W, BULB_K), n: 8, bl: 0.5, jolt: 0, dive: 0, q: 0.72, acc: HOT, flash: 0, dist: 3.1, N: 0,
      E: new Float64Array(3), Fw: new Float64Array(3), Rt: new Float64Array(3), Up: new Float64Array(3), UP: [0, 1, 0] });
    marchBufs(W.w, W.N, 64);
  },
  draw(W) {
    const { N, dt, f, w, hits, targets, s } = W;
    marchBufs(w, N, 64);
    if (f.section === 'change') w.kind = rollKind(W, BULB_K, w.kind);
    if (f.section === 'drop') w.dive = 2 * barT(f);
    for (const hh of hits) {
      if (isLow(hh)) { w.jolt = Math.max(w.jolt, 0.25 * hh.strength); if (hh.strength > 0.8) s.shake = Math.max(s.shake, 0.2); }
      else if (hh.kind === 'snare') { w.acc = w.acc === HOT ? COOL : HOT; w.flash = 1; }
      else if (isTonal(hh)) w.q = 0.6 + 0.025 * hh.pc;
    }
    w.dive -= dt;
    w.jolt *= Math.exp(-dt * 4);
    w.flash *= Math.exp(-dt * 10);
    w.bl = follow(w.bl, clamp(f.rel.bassDrive), dt, 0.8);
    const [lo, hi] = BULB_N[w.kind];
    w.n = follow(w.n, lo + (hi - lo) * (w.dive > 0 ? 1 - w.bl : w.bl), dt, 1.2);
    const n = w.n + w.jolt, rb = 1.12 + 0.9 / (n - 1) ** 1.45;
    // the eye on a sphere round the bulb, the yaw on the bass clock, the pitch on the mids, pulled in on the beat
    w.dist = follow(w.dist, (w.dive > 0 ? 2.1 : 3.1) * (1 - 0.04 * f.beat.pulse), dt, 0.4);
    const yaw = f.rel.bassClock * 0.1, pit = 0.25 + 0.3 * Math.sin(f.rel.midClock * 0.17), { E, Fw, Rt, Up } = w;
    E[0] = w.dist * Math.sin(yaw) * Math.cos(pit); E[1] = w.dist * Math.sin(pit); E[2] = -w.dist * Math.cos(yaw) * Math.cos(pit);
    for (let k = 0; k < 3; k++) Fw[k] = -E[k] / w.dist;
    frame(Fw, w.UP, Rt, Up);
    marchQuarter(w, bulbDE, n, E, Fw, Rt, Up, 0.45, rb, w.dist + rb, 24, 1.3);
    blowUp(W, light(w, 0.45, w.dist + 0.6, w.q), w.acc, 0.6 * w.flash);
    targets.push({ x: N * 0.3, y: N * 0.3, w: N * 0.4, h: N * 0.4 });
  },
};

// ---------------------------------------------------------------------------------------------- mandelbox
// The Mandelbox (box fold, sphere fold, scale 2 or −1.5) ray-marched like the bulb, the eye flying over its surface
// like a landscape: round the box on a great circle that advances a step on each beat, as high above the surface as a
// ray from outside finds it plus a margin (never under that surface, which a drop's flip to the bigger box would
// otherwise leave it in, and never nearer than the estimate allows), looking ahead and down. A kick surges the
// flight and shakes, a snare swaps the accent and flashes, a note moves the trap's cut; a section change rolls the
// scale, a drop flips it and climbs out to see the whole box for two bars.
const BOX_K = [KIND('s2', 1, 2, 3), KIND('sm15', 2, 1, 1)];
const box = {
  init(W) {
    const { w, rnd } = W, tilt = 0.3 + rnd() * 0.4, e1 = [Math.cos(tilt), Math.sin(tilt) * 0.6, Math.sin(tilt) * 0.8], e2 = [0, 0.8, -0.6];
    const d = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2]; // e2 made square to e1
    for (let k = 0; k < 3; k++) e2[k] -= d * e1[k];
    const l = Math.hypot(e2[0], e2[1], e2[2]);
    for (let k = 0; k < 3; k++) e2[k] /= l;
    Object.assign(w, { kind: rollKind(W, BOX_K), e1, e2, phi: rnd() * TAU, phiTo: 0, surge: 0, climb: 0, acc: HOT, q: 0.8, flash: 0, N: 0, clock: 0,
      E: new Float64Array(3), Fw: new Float64Array(3), Rt: new Float64Array(3), Up: new Float64Array(3), dir: new Float64Array(3) });
    w.phiTo = w.phi;
    w.rho = boxSize(w) * 2;
    marchBufs(w, W.N, 52);
  },
  draw(W) {
    const { N, dt, f, w, hits, targets, s } = W;
    marchBufs(w, N, 52);
    if (f.section === 'change') w.kind = rollKind(W, BOX_K, w.kind);
    if (f.section === 'drop') { w.kind = w.kind === 's2' ? 'sm15' : 's2'; w.climb = 2 * barT(f); }
    for (const hh of hits) {
      if (isLow(hh)) { w.surge = Math.max(w.surge, hh.strength); if (hh.strength > 0.7) s.shake = Math.max(s.shake, 0.25 * hh.strength); }
      else if (hh.kind === 'snare') { w.acc = w.acc === HOT ? COOL : HOT; w.flash = 1; }
      else if (isTonal(hh)) w.q = 0.65 + 0.025 * hh.pc;
    }
    w.climb -= dt;
    w.surge *= Math.exp(-dt * 3);
    w.flash *= Math.exp(-dt * 10);
    const sc = w.kind === 's2' ? 2 : -1.5, Ex = boxSize(w), e = energy(f), { E, Fw, Rt, Up, dir, e1, e2 } = w;
    // the flight: a step round the circle on each beat (eased in), the kick's surge on top
    if (beatLocked(f) ? f.beat.on : (w.clock += dt) > 0.5) { w.clock = 0; w.phiTo += 0.03 + 0.04 * e; }
    w.phiTo += dt * 0.2 * w.surge;
    w.phi = follow(w.phi, w.phiTo, dt, 0.12); // a quick step, then still while the picture fizzles in
    const cp = Math.cos(w.phi), sp = Math.sin(w.phi);
    for (let k = 0; k < 3; k++) dir[k] = cp * e1[k] + sp * e2[k];
    // the surface under the eye, from a ray coming in from outside along the radius
    let t = 0;
    const r0 = 2.2 * Ex;
    for (let k = 0; k < 48; k++) { const dd = deAt(boxDE, dir[0] * (r0 - t), dir[1] * (r0 - t), dir[2] * (r0 - t), sc); if (dd < 0.004 * Ex) break; t += dd; if (t > r0) break; }
    const ground = Math.max(0, r0 - t), want = w.climb > 0 ? 2.1 * Ex : ground + Ex * (0.28 + 0.1 * Math.sin(f.rel.bassClock * 0.3));
    w.rho = Math.max(ground + 0.12 * Ex, follow(w.rho, want, dt, w.climb > 0 ? 0.8 : 0.4)); // (never under the ground)
    // never nearer than the estimate allows: back out along the radius until it is
    for (let k = 0; k < 4; k++) { const near = deAt(boxDE, dir[0] * w.rho, dir[1] * w.rho, dir[2] * w.rho, sc); if (near >= 0.05 * Ex) break; w.rho += 0.06 * Ex - near; }
    for (let k = 0; k < 3; k++) E[k] = dir[k] * w.rho;
    // looking ahead along the circle and down at the surface (from up high, at the box)
    const dip = w.climb > 0 ? 1.25 : 0.75, cd = Math.cos(dip), sd = Math.sin(dip);
    for (let k = 0; k < 3; k++) Fw[k] = (-sp * e1[k] + cp * e2[k]) * cd - dir[k] * sd;
    frame(Fw, dir, Rt, Up);
    const far = (w.climb > 0 ? 3.4 : 1.4) * Ex;
    marchQuarter(w, boxDE, sc, E, Fw, Rt, Up, 0.5, 0, far, 28, 1);
    blowUp(W, light(w, 0.5, far, w.q), w.acc, 0.6 * w.flash);
    targets.push({ x: N * 0.35, y: N * 0.4, w: N * 0.3, h: N * 0.3 });
  },
};
function boxSize(w) { return w.kind === 's2' ? 6 : 2; }

// ---------------------------------------------------------------------------------------------- pendulums
// The classic chaos demo: two to six dozen double pendulums (unit point masses on light unit rods under g = 9.81, the
// Lagrangian equations of an n-link chain, RK4 in fixed steps of 1/400 s: the small swings' periods are the normal
// modes', 2π√(L/g)/√(2 ∓ √2) = 2.621 and 1.086 s, and the energy drifts by about a part in a million of g·Σμ a
// minute, ten with three links) let go from angles 1e-4 rad apart: they swing as one, then fan out. Arms and fading
// tip trails, HOT through COOL across the fan; the energy runs their clock, a kick (once they have fanned out) puts
// them all back on one start, a snare swaps the ends of the colours, a note lights its twelfth, the beat lights the
// pivot; a drop makes them triple pendulums.
const PEND_K = [KIND('few', 3, 2, 1), KIND('fan', 2, 2, 2), KIND('swarm', 1, 2, 3)];
const PEND_N = { few: 24, fan: 40, swarm: 64 }, GR = 9.81, PH = 1 / 400, TRL = 40;
// the masses below both rods i and j (all ones): μij = n − max(i, j)
const MU = [null, null, [2, 1, 1, 1], [3, 2, 1, 2, 2, 1, 1, 1, 1]];
// the chain's accelerations: M(θ) θ'' = f with Mij = μij cos(θi − θj), fi = −Σj μij sin(θi − θj) ωj² − g μii sin θi
const SC = new Float64Array(6), AL = new Float64Array(3);
function chainAcc(nl, th, om, o) {
  const mu = MU[nl];
  for (let i = 0; i < nl; i++) { SC[i] = Math.sin(th[o + i]); SC[3 + i] = Math.cos(th[o + i]); }
  if (nl === 2) {
    const s01 = SC[0] * SC[4] - SC[3] * SC[1], c01 = SC[3] * SC[4] + SC[0] * SC[1], m01 = mu[1] * c01;
    const f0 = -mu[1] * s01 * om[o + 1] * om[o + 1] - GR * mu[0] * SC[0], f1 = mu[1] * s01 * om[o] * om[o] - GR * mu[3] * SC[1], det = mu[0] * mu[3] - m01 * m01;
    AL[0] = (f0 * mu[3] - m01 * f1) / det; AL[1] = (mu[0] * f1 - m01 * f0) / det;
    return;
  }
  const s01 = SC[0] * SC[4] - SC[3] * SC[1], c01 = SC[3] * SC[4] + SC[0] * SC[1], s02 = SC[0] * SC[5] - SC[3] * SC[2], c02 = SC[3] * SC[5] + SC[0] * SC[2];
  const s12 = SC[1] * SC[5] - SC[4] * SC[2], c12 = SC[4] * SC[5] + SC[1] * SC[2], w0 = om[o] * om[o], w1 = om[o + 1] * om[o + 1], w2 = om[o + 2] * om[o + 2];
  const a = mu[0], b = mu[1] * c01, c = mu[2] * c02, d = mu[4], e = mu[5] * c12, g = mu[8];
  const f0 = -mu[1] * s01 * w1 - mu[2] * s02 * w2 - GR * mu[0] * SC[0];
  const f1 = mu[1] * s01 * w0 - mu[5] * s12 * w2 - GR * mu[4] * SC[1];
  const f2 = mu[2] * s02 * w0 + mu[5] * s12 * w1 - GR * mu[8] * SC[2];
  // Cramer on the symmetric [[a b c] [b d e] [c e g]]
  const A0 = d * g - e * e, A1 = c * e - b * g, A2 = b * e - c * d, det = a * A0 + b * A1 + c * A2;
  AL[0] = (f0 * A0 + f1 * A1 + f2 * A2) / det;
  AL[1] = (f0 * A1 + f1 * (a * g - c * c) + f2 * (b * c - a * e)) / det;
  AL[2] = (f0 * A2 + f1 * (b * c - a * e) + f2 * (a * d - b * b)) / det;
}
// the energy T + V of pendulum k (for the check), T = ½ Σ μij cos(θi − θj) ωi ωj, V = −g Σ μii cos θi
function chainEnergy(nl, th, om, o) {
  const mu = MU[nl];
  let T = 0, V = 0;
  for (let i = 0; i < nl; i++) {
    V -= GR * mu[i * nl + i] * Math.cos(th[o + i]);
    for (let j = 0; j < nl; j++) T += 0.5 * mu[i * nl + j] * Math.cos(th[o + i] - th[o + j]) * om[o + i] * om[o + j];
  }
  return T + V;
}
const PS = new Float64Array(24); // RK4 scratch: the stage state (θ, ω) and the four derivative pairs
function chainStep(nl, th, om, o) {
  const k = PS, h = PH; // (the step a constant, not an argument: a number passed in is boxed on every call)
  chainAcc(nl, th, om, o);
  for (let i = 0; i < nl; i++) { k[i] = om[o + i]; k[3 + i] = AL[i]; }
  for (let st = 1; st < 4; st++) {
    const hs = st === 3 ? h : h / 2, p = 6 * (st - 1), q = 6 * st;
    for (let i = 0; i < nl; i++) { SCR_T[i] = th[o + i] + hs * k[p + i]; SCR_W[i] = om[o + i] + hs * k[p + 3 + i]; }
    chainAcc(nl, SCR_T, SCR_W, 0);
    for (let i = 0; i < nl; i++) { k[q + i] = SCR_W[i]; k[q + 3 + i] = AL[i]; }
  }
  for (let i = 0; i < nl; i++) {
    th[o + i] += (h / 6) * (k[i] + 2 * (k[6 + i] + k[12 + i]) + k[18 + i]);
    om[o + i] += (h / 6) * (k[3 + i] + 2 * (k[9 + i] + k[15 + i]) + k[21 + i]);
  }
}
const SCR_T = new Float64Array(3), SCR_W = new Float64Array(3);
const pendulums = {
  init(W) {
    const { w } = W;
    Object.assign(w, { kind: rollKind(W, PEND_K), nl: 2, th: new Float64Array(3 * 64), om: new Float64Array(3 * 64), E0: new Float64Array(64), tr: new Float32Array(64 * TRL * 2),
      tAt: 0, tCnt: 0, tick: 0, owe: 0, e: 0.5, since: 0, white: 0, swap: 0, hi: -1, hiT: 0, kick: 0 });
    pendReset(W, false);
  },
  draw(W) {
    const { r, N, u, dt, f, w, hits, targets } = W;
    if (f.section === 'change') { w.kind = rollKind(W, PEND_K, w.kind); w.nl = 2; pendReset(W, false); }
    if (f.section === 'drop') { w.nl = 3; pendReset(W, false); }
    w.since += dt;
    for (const hh of hits) {
      if (isLow(hh)) { if (w.spread > 1 && w.since > 3 && hh.strength > 0.5) pendReset(W, true); else w.kick = Math.max(w.kick, hh.strength); }
      else if (hh.kind === 'snare') w.swap ^= 1;
      else if (isTonal(hh)) { w.hi = hh.pc; w.hiT = 0.5; }
    }
    w.e = follow(w.e, energy(f), dt, 0.5);
    w.kick *= Math.exp(-dt * 6); w.white -= dt; w.hiT -= dt;
    const n = owed(w, dt, 0.6 + 0.7 * w.e, PH, 60), P = w.np, nl = w.nl, { th, om, tr } = w;
    for (let s = 0; s < n; s++) {
      for (let k = 0; k < P; k++) chainStep(nl, th, om, 3 * k);
      // the tips into the trail ring every 1/40 s of the pendulums' own time
      if ((w.tick += PH) >= 0.025) {
        w.tick -= 0.025; w.tAt = (w.tAt + 1) % TRL; if (w.tCnt < TRL) w.tCnt++;
        for (let k = 0; k < P; k++) {
          let x = 0, y = 0;
          for (let i = 0; i < nl; i++) { x += Math.sin(th[3 * k + i]); y += Math.cos(th[3 * k + i]); }
          tr[2 * (k * TRL + w.tAt)] = x; tr[2 * (k * TRL + w.tAt) + 1] = y;
        }
      }
    }
    // how far the fan has opened: the widest a tip's bearing round the pivot is from the middle one's (wrapped)
    const jm = 2 * ((P >> 1) * TRL + w.tAt), am = Math.atan2(tr[jm], tr[jm + 1]);
    w.spread = 0;
    for (let k = 0; k < P; k++) { const j = 2 * (k * TRL + w.tAt), d = Math.atan2(tr[j], tr[j + 1]) - am; w.spread = Math.max(w.spread, Math.abs(d - TAU * Math.round(d / TAU))); }
    const cx = N / 2, cy = N / 2, Lr = (nl === 2 ? 0.215 : 0.145) * N, two = u > 1.2; // (the arms two cells wide at the big sizes)
    // the trails, then the arms: the fan's edges first, the middle last, so while they are one the middle shows (the
    // line ends rounded here as r.line would, so they go in as small integers, nothing boxed)
    for (let m = 0; m < P; m++) {
      const k = m & 1 ? P - 1 - (m >> 1) : m >> 1, c0 = pendCol(w, k, P);
      let px = 0, py = 0;
      for (let q = 0; q < w.tCnt; q++) {
        const j = 2 * (k * TRL + ((w.tAt - q + TRL) % TRL)), x = Math.round(cx + tr[j] * Lr), y = Math.round(cy + tr[j + 1] * Lr);
        if (q) r.line(px, py, x, y, q < TRL / 4 ? c0 : q < TRL / 2 ? (c0 < DIM ? c0 + DIM : c0) : DARK);
        px = x; py = y;
      }
    }
    for (let m = 0; m < P; m++) {
      const k = m & 1 ? P - 1 - (m >> 1) : m >> 1, c0 = pendCol(w, k, P);
      let x = cx, y = cy;
      for (let i = 0; i < nl; i++) {
        const x1 = x + Math.sin(th[3 * k + i]) * Lr, y1 = y + Math.cos(th[3 * k + i]) * Lr, a = Math.round(x), b = Math.round(y), a1 = Math.round(x1), b1 = Math.round(y1);
        r.line(a, b, a1, b1, c0);
        if (two) { if (Math.abs(x1 - x) > Math.abs(y1 - y)) r.line(a, b + 1, a1, b1 + 1, c0); else r.line(a + 1, b, a1 + 1, b1, c0); }
        x = x1; y = y1;
      }
      r.disc(x, y, Math.max(0.6, (0.9 + 0.8 * w.kick) * u), c0);
      if (m === P - 1) targets.push({ x: x - 4 * u, y: y - 4 * u, w: 8 * u, h: 8 * u });
    }
    r.disc(cx, cy, Math.max(1, (1.6 + 1.2 * f.beat.pulse) * u), f.beat.on ? WHITE : FIG);
  },
};
// pendulum k's colour: HOT through LMID to COOL across the fan (the ends swapped by a snare), WHITE when lit
function pendCol(w, k, P) {
  if (w.white > 0 || (k % 12 === w.hi && w.hiT > 0)) return WHITE;
  const q = w.swap ? 1 - k / (P - 1) : k / (P - 1);
  return q < 0.34 ? HOT : q < 0.67 ? LMID : COOL;
}
// all of them back on one start: a new one from the bass when they were not moving yet, else the middle one's state;
// each then 1e-4 rad further round on the first rod
function pendReset(W, keepMid) {
  const { w, f } = W, P = (w.np = w.nl === 3 ? Math.min(40, PEND_N[w.kind]) : PEND_N[w.kind]), nl = w.nl, { th, om } = w;
  const mid = 3 * (P >> 1), t0 = [0, 0, 0], w0 = [0, 0, 0];
  if (keepMid) for (let i = 0; i < 3; i++) { t0[i] = th[mid + i]; w0[i] = om[mid + i]; }
  else { const a = 1.9 + 0.8 * clamp(f ? f.rel.bassDrive : 0.5); t0[0] = a; t0[1] = a + 0.3; t0[2] = a + 0.5; }
  for (let k = 0; k < P; k++) {
    for (let i = 0; i < 3; i++) { th[3 * k + i] = t0[i] + (i === 0 ? (k - (P >> 1)) * 1e-4 : 0); om[3 * k + i] = w0[i]; }
    w.E0[k] = chainEnergy(nl, th, om, 3 * k);
  }
  w.tCnt = 0; w.since = 0; w.white = keepMid ? 0.08 : 0; w.spread = 0;
}

// ---------------------------------------------------------------------------------------------- bifurcation
// The logistic map x → r·x(1 − x) as a 3-D object: the points (r, xₙ, xₙ₊₁) of four hundred walkers on r from 2.8 to
// 4 (the tree grows along r as it starts), turning between the bifurcation tree (seen along xₙ) and the parabolas it
// lives on (seen along r); a cursor at the r the bass picks, its orbit HOT on its own parabola with the cobweb growing
// a step on each beat (period 1, 2, 4, chaos, the window of 3) and a tick per point of the period. A kick bursts
// walkers next to the cursor, a snare lights the chaotic columns (λ > 0), a note its twelfth of r; a drop zooms into
// the period-3 window for two bars.
const BIF_K = [KIND('tree', 3, 2, 1), KIND('turn', 2, 2, 2), KIND('cobweb', 1, 2, 3)];
const BIF_W = 400, BIF_P = 24000;
// The hot loops each in a function of their own, what they read off `w` taken before the loop (a long loop in a big
// function is compiled while it runs, and the code after it, never run by then, bailed out every frame).
// nIt steps of the walkers in turn and nB of the ones next to the cursor's column jc, into the ring of points
function bifWalk(w, nIt, nB, jc) {
  const { wr, wx, wl, pr, pc } = w, on = w.on | 0, lam = w.lam, slice = w.sliceT > 0 ? w.slice : -1;
  let wi = w.wi, at = w.at;
  for (let it = 0; it < nIt + nB; it++) {
    const j = it < nIt ? (wi = (wi + 1) % on) : Math.max(0, Math.min(BIF_W - 1, jc + ((it % 17) - 8))), x = wx[j], rr = wr[j], x1 = rr * x * (1 - x);
    wl[j] += 0.03 * (Math.log(Math.abs(rr * (1 - 2 * x)) + 1e-12) - wl[j]); // its Lyapunov exponent, a running mean
    const i = (at = (at + 1) % BIF_P);
    pr[3 * i] = rr; pr[3 * i + 1] = x; pr[3 * i + 2] = x1;
    pc[i] = it >= nIt ? 1 : lam && wl[j] > 0.01 ? 1 : ((j * 12) / BIF_W | 0) === slice ? -1 : 0;
    wx[j] = x1 > 0 && x1 < 1 ? x1 : 0.1 + 0.8 * hash(j, it);
  }
  w.wi = wi; w.at = at;
}
// the ring's points through the camera into the density (those from before a zoom, outside the box, left out)
function bifProject(w, c, N) {
  const { pr, pc, acc, tag } = w, m = c.m, D = c.D, F = c.F, ox = c.ox, oy = c.oy, lo = w.r0, hi = w.r1, fill = w.fill;
  for (let i = 0; i < fill; i++) {
    const x = pr[3 * i], y = pr[3 * i + 1], z = pr[3 * i + 2];
    if (x < lo || x > hi) continue;
    const Z = D + m[8] * x + m[9] * y + m[10] * z + m[11], q = F / Z, sx = ox + (m[0] * x + m[1] * y + m[2] * z + m[3]) * q, sy = oy - (m[4] * x + m[5] * y + m[6] * z + m[7]) * q;
    if (sx < 0 || sy < 0 || sx >= N || sy >= N) continue;
    const j = (sy | 0) * N + (sx | 0);
    acc[j] += 1; tag[j] += pc[i];
  }
}
// The cursor's orbit after its transient, and its period (2000 iterations: with 400 the slow approach next to a
// doubling, |multiplier| near 1, read as the doubled period over 2.981–3.002, 3.443–3.450 and 3.542–3.544)
function bifOrbit(w, rc) {
  const ob = w.ob;
  let x = 0.5, per = 0;
  for (let k = 0; k < 2000; k++) x = rc * x * (1 - x);
  for (let k = 0; k < 64; k++) { ob[k] = x; x = rc * x * (1 - x); }
  for (let p = 1; p <= 16; p++) if (Math.abs(ob[63] - ob[63 - p]) < 1e-5 && Math.abs(ob[62] - ob[62 - p]) < 1e-5) { per = p; break; }
  w.per = per;
}
const bifurcation = {
  init(W) {
    const { w } = W;
    Object.assign(w, { kind: rollKind(W, BIF_K), r0: 2.8, r1: 4, zoom: 0, wr: new Float64Array(BIF_W), wx: new Float64Array(BIF_W), wl: new Float64Array(BIF_W), on: 1, wi: 0,
      pr: new Float32Array(3 * BIF_P), pc: new Int8Array(BIF_P), at: 0, fill: 0, owe: 0, e: 0.5, bc: 0.5, burst: 0, lam: 0, slice: -1, sliceT: 0, cob: 1, cobR: 0, clock: 0,
      ob: new Float64Array(64), per: 0, cam: camera(), N: 0, yaw: 0, rot: [1.9, 0, 0, 0, 0, 1.9, 0, -1.9, 0] });
    for (let j = 0; j < BIF_W; j++) w.wx[j] = 0.1 + 0.8 * hash(j, 5);
  },
  draw(W) {
    const { r, N, u, dt, f, w, hits, targets } = W, c = w.cam;
    accFor(w, N);
    if (f.section === 'change') { w.kind = rollKind(W, BIF_K, w.kind); w.on = 1; }
    if (f.section === 'drop') w.zoom = 2 * barT(f);
    for (const hh of hits) {
      if (isLow(hh)) w.burst = Math.max(w.burst, 1500 * hh.strength);
      else if (hh.kind === 'snare') w.lam ^= 1;
      else if (isTonal(hh)) { w.slice = hh.pc; w.sliceT = 1.5; }
    }
    w.zoom -= dt; w.sliceT -= dt;
    w.r0 = follow(w.r0, w.zoom > 0 ? 3.82 : 2.8, dt, 0.3); w.r1 = follow(w.r1, w.zoom > 0 ? 3.86 : 4, dt, 0.3);
    const r0 = w.r0, r1 = w.r1, span = r1 - r0, wr = w.wr;
    for (let j = 0; j < BIF_W; j++) wr[j] = r0 + (span * (j + 0.5)) / BIF_W;
    w.on = Math.min(BIF_W, w.on + dt * 200); // the sweep along r as the tree grows in
    w.e = follow(w.e, energy(f), dt, 0.4);
    w.bc = follow(w.bc, clamp(f.rel.bassDrive), dt, 0.6);
    const rc = r0 + span * (0.08 + 0.88 * w.bc), jc = Math.round(((rc - r0) / span) * BIF_W);
    // the walkers, round and round; the burst runs extra ones next to the cursor
    w.owe += dt * (30000 + 40000 * w.e);
    const nIt = Math.min(BIF_P >> 1, w.owe | 0), nB = Math.min(3000, w.burst | 0);
    w.owe -= nIt; w.burst = 0;
    bifWalk(w, nIt, nB, jc);
    w.fill = Math.min(BIF_P, w.fill + nIt + nB);
    // the box: r across, xₙ₊₁ up, xₙ in depth; turned between the tree (yaw 0) and the parabolas (yaw −π/2)
    const turnTo = w.kind === 'tree' ? -0.45 + 0.3 * Math.sin(f.rel.bassClock * 0.2) : w.kind === 'turn' ? -0.785 + 0.785 * Math.sin(f.rel.bassClock * 0.12) : -1.2 + 0.25 * Math.sin(f.rel.bassClock * 0.2);
    w.yaw = follow(w.yaw, turnTo, dt, 0.8);
    w.rot[0] = 1.9 / span;
    aim(c, w.rot, 1, (r0 + r1) / 2, 0.5, 0.5, w.yaw, 0.18 + 0.1 * Math.sin(f.rel.midClock * 0.2), 3.4, 1.25 * N * (1 + 0.04 * f.beat.pulse), N / 2, N / 2);
    bifProject(w, c, N);
    toneMap(W, 1 + 0.25 * f.beat.pulse, 0.001);
    bifOrbit(w, rc);
    // the cursor's plane: its parabola, the diagonal, its edge (COOL when periodic, HOT in chaos)
    const ce = w.per ? COOL + DIM : HOT + DIM;
    seg(W, c, rc, 0, 0, rc, 1, 0, ce); seg(W, c, rc, 1, 0, rc, 1, 1, ce); seg(W, c, rc, 1, 1, rc, 0, 1, ce); seg(W, c, rc, 0, 1, rc, 0, 0, ce);
    seg(W, c, rc, 0, 0, rc, 1, 1, MID + DIM);
    for (let k = 0; k < 24; k++) { const a = k / 24, b = (k + 1) / 24; seg(W, c, rc, a, rc * a * (1 - a), rc, b, rc * b * (1 - b), LMID); }
    // the cobweb from x = 0.2, a step a beat, again when the cursor has moved
    if (Math.abs(rc - w.cobR) > 0.01 * span) { w.cobR = rc; w.cob = 1; }
    if (beatLocked(f) ? f.beat.on : (w.clock += dt) > 0.5) { w.clock = 0; w.cob = w.cob >= 32 ? 1 : w.cob + 1; }
    let cx = 0.2;
    for (let k = 0; k < w.cob; k++) { const nx = rc * cx * (1 - cx); seg(W, c, rc, cx, cx, rc, cx, nx, COOL); seg(W, c, rc, cx, nx, rc, nx, nx, COOL); cx = nx; }
    // the orbit on its parabola, and a tick per point of the period under the plane
    const nOrb = w.per || 16;
    for (let k = 0; k < nOrb; k++) if (toScreen(c, rc, w.ob[63 - k - 1], w.ob[63 - k], PT)) r.disc(PT[0], PT[1], Math.max(0.8, 1.3 * u * (1 + 0.5 * f.beat.pulse)), HOT);
    if (toScreen(c, rc, 0, 0, PT)) {
      for (let k = 0; k < w.per; k++) r.rect(PT[0] - (w.per * 2.5 * u) / 2 + k * 2.5 * u, PT[1] + 3 * u, Math.max(1, 1.5 * u), Math.max(1, 1.5 * u), HOT);
      targets.push({ x: PT[0] - 5 * u, y: PT[1] - 0.5 * N, w: 10 * u, h: 0.5 * N });
    }
  },
};

// ---------------------------------------------------------------------------------------------- lyapunov
// The Markus–Lyapunov fractal of a sequence (AB, AABAB, BBBBBBAAAAAA: the logistic map with r taking A or B in that
// order, from the critical point x = 0.5; λ = (1/n) Σ ln|r(1 − 2x)| over 240 terms after 240, which gets the sign of a
// 20 000-term λ right in 98–99.7 % of the cells, against 94–99 % with 120 after 60), computed per cell some 400 cells
// a frame, as a landscape: λ the height, order (λ < 0) on the ramp down into the superstable canyons, chaos (λ > 0)
// raised in HOT, flown over low in perspective (one focal length across and up, mirror-tiled, so it never ends, the
// far ground hazed up to the horizon). The energy is the speed, the bass the relief; a kick sends a ring wave over
// it, a snare swaps the accent, a note draws its contour of λ, the beat breathes the relief; a section change rolls
// the sequence, a drop zooms into its finer structure.
const LYA_K = [KIND('AB', 3, 2, 1), KIND('AABAB', 1, 2, 2), KIND('BBBBBBAAAAAA', 1, 2, 3)];
const LYA_BOX = { AB: [2, 4, 2, 4], AABAB: [2.6, 4, 2.6, 4], BBBBBBAAAAAA: [3.4, 4, 2.5, 3.4] };
// a row of λ: G cells at B, A from A0 in steps of dA, into lam from o (a row a call: nothing boxed per cell)
function lyaRow(lam, o, G, A0, dA, B, S, L) {
  for (let c = 0; c < G; c++) {
    const A = A0 + dA * (c + 0.5);
    let x = 0.5, k = 0, sum = 0, prod = 1;
    for (let i = 0; i < 240; i++) { const r = S[k] ? B : A; x = r * x * (1 - x); k = k + 1 === L ? 0 : k + 1; }
    for (let i = 1; i <= 240; i++) {
      const r = S[k] ? B : A;
      prod *= Math.abs(r * (1 - 2 * x)); x = r * x * (1 - x); k = k + 1 === L ? 0 : k + 1;
      if ((i & 7) === 0) { sum += Math.log(prod + 1e-300); prod = 1; } // a log every eight terms
    }
    lam[o + c] = sum / 240;
  }
}
function lyaKind(w, kind, zoom) {
  const b = LYA_BOX[kind], k = zoom ? 1 / 3 : 1, cA = b[0] + 0.62 * (b[1] - b[0]), cB = b[2] + 0.62 * (b[3] - b[2]);
  w.kind = kind; w.S = Uint8Array.from(kind, (ch) => (ch === 'B' ? 1 : 0));
  w.box = zoom ? [cA - ((b[1] - b[0]) * k) / 2, cA + ((b[1] - b[0]) * k) / 2, cB - ((b[3] - b[2]) * k) / 2, cB + ((b[3] - b[2]) * k) / 2] : b.slice();
  w.row = 0;
}
// the λ map, rebuilt when N changes (9: not yet computed)
function lyaBuf(w, N) { if (w.N !== N) { w.N = N; w.lam = new Float32Array(N * N).fill(9); w.row = 0; } }
const lyapunov = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { N: 0, cx: rnd() * 100, cy: rnd() * 100, head: rnd() * TAU, e: 0.5, bl: 0.5, dip: 0, acc: HOT, cont: 0, contT: 0, flash: 0,
      waves: [0, 1, 2].map(() => ({ x: 0, y: 0, R: 0, amp: 0 })), wv: 0, WV: new Float64Array(18) });
    lyaKind(w, rollKind(W, LYA_K), false);
    lyaBuf(w, W.N);
  },
  draw(W) {
    const { N, dt, f, w, hits, targets } = W;
    lyaBuf(w, N);
    if (f.section === 'change') lyaKind(w, rollKind(W, LYA_K, w.kind), false);
    if (f.section === 'drop') lyaKind(w, w.kind, true);
    for (const hh of hits) {
      if (isLow(hh)) { const wv = w.waves[(w.wv = (w.wv + 1) % 3)]; wv.x = w.cx; wv.y = w.cy; wv.R = 0; wv.amp = 0.03 * N * hh.strength; w.dip = Math.max(w.dip, hh.strength); }
      else if (hh.kind === 'snare') { w.acc = w.acc === HOT ? COOL : HOT; w.flash = 1; }
      else if (isTonal(hh)) { w.cont = -0.05 - 0.08 * hh.pc; w.contT = 2; }
    }
    // some 400 cells of λ a frame, in whole rows
    const G = N, lam = w.lam, S = w.S, Ls = S.length, [A0, A1, B0, B1] = w.box;
    for (let k = 0, rows = Math.max(1, Math.round(400 / G)); k < rows && w.row < G; k++, w.row++) lyaRow(lam, w.row * G, G, A0, (A1 - A0) / G, B0 + ((B1 - B0) * (w.row + 0.5)) / G, S, Ls);
    w.e = follow(w.e, energy(f), dt, 0.5);
    w.bl = follow(w.bl, clamp(f.rel.bassDrive), dt, 0.5);
    w.dip *= Math.exp(-dt * 4); w.flash *= Math.exp(-dt * 8); w.contT -= dt;
    for (const wv of w.waves) { wv.R += dt * 0.35 * N; wv.amp *= Math.exp(-dt * 1.2); }
    // the flight: on over the mirror-tiled map, the heading on the mid clock
    w.head = 0.7 + f.rel.midClock * 0.08;
    const fx = Math.cos(w.head), fy = Math.sin(w.head), sp = (0.04 + 0.1 * w.e) * N;
    w.cx += fx * sp * dt; w.cy += fy * sp * dt;
    lyaTerrain(W, fx, fy);
    targets.push({ x: N * 0.4, y: N * 0.45, w: N * 0.2, h: N * 0.2 });
  },
};
// The landscape, column by column from near to far, a sample drawn where it shows above the nearer ones. The eye
// 0.14 N up, the horizon high on the screen (looking down on it), one focal length Fz for the heights and for the
// spread (column x looks out (x/N − ½) N/Fz to the side per unit ahead); the far ground beyond the last sample is
// haze up to the horizon. The frame's view goes to the columns in LP (a typed array, nothing boxed per column; a
// column a call, so the march is compiled as a whole function rather than as a loop swapped in mid-run).
const LP = new Float64Array(16);
function lyaTerrain(W, fx, fy) {
  const { r, N, u, f, w } = W, WV = w.WV, hz = 0.2 * N, Fz = 0.75 * N, band = 0.04 * N;
  let nw = 0; // the live waves: centre, radius, height, and the squared radii of their band
  for (const wv of w.waves) if (wv.amp > 0.2) { const o = 6 * nw++; WV[o] = wv.x; WV[o + 1] = wv.y; WV[o + 2] = wv.R; WV[o + 3] = wv.amp; WV[o + 4] = Math.max(0, wv.R - band) ** 2; WV[o + 5] = (wv.R + band) ** 2; }
  LP[0] = fx; LP[1] = fy; LP[2] = w.cx; LP[3] = w.cy; LP[4] = 0.06 * N * (1 + 0.6 * w.bl + 0.15 * f.beat.pulse); LP[5] = 0.14 * N * (1 - 0.15 * w.dip);
  LP[6] = hz; LP[7] = Fz; LP[8] = w.contT > 0 ? w.cont : 99; LP[9] = w.acc; LP[10] = w.flash > 0.5 ? 1 : 0; LP[11] = band; LP[12] = nw;
  LP[13] = Math.max(0, (hz | 0) - Math.round(2 * u)); LP[14] = N / Fz;
  for (let x = 0; x < N; x++) lyaCol(r.buf, N, w.lam, WV, x);
}
function lyaCol(buf, N, lam, WV, x) {
  const fx = LP[0], fy = LP[1], cx = LP[2], cy = LP[3], hs = LP[4], camH = LP[5], hz = LP[6], Fz = LP[7], cont = LP[8], chaos = LP[9] | 0, lift = LP[10] > 0;
  const band = LP[11], nw = LP[12] | 0, haze = LP[13] | 0, G = N, G2 = 2 * G, tx = (x / N - 0.5) * LP[14], dx = fx - fy * tx, dy = fy + fx * tx;
  let yb = N, hp = -1e9;
  for (let z = 0.1 * N, dz = 0.002 * N; z < 1.6 * N; z += dz, dz *= 1.025) {
    const mx = cx + dx * z, my = cy + dy * z;
    let ix = Math.floor(mx) % G2, iy = Math.floor(my) % G2;
    if (ix < 0) ix += G2; if (iy < 0) iy += G2;
    if (ix >= G) ix = G2 - 1 - ix; if (iy >= G) iy = G2 - 1 - iy;
    const L = lam[iy * G + ix];
    let hgt = L > 8 ? 0 : (L < -1.6 ? -1.6 : L > 0.6 ? 0.6 : L) * hs;
    for (let k = 0, o = 0; k < nw; k++, o += 6) { // the ring waves, a smooth bump (1 − q²)² across the band
      const ex = mx - WV[o], ey = my - WV[o + 1], d2 = ex * ex + ey * ey;
      if (d2 > WV[o + 4] && d2 < WV[o + 5]) { const q = (Math.sqrt(d2) - WV[o + 2]) / band, b = 1 - q * q; hgt += WV[o + 3] * b * b; }
    }
    const sy = (hz + ((camH - hgt) * Fz) / z) | 0;
    if (sy < yb) {
      let c = L > 8 ? DARK + DIM : Math.abs(L - cont) < 0.03 ? COOL : L >= 0 ? (L > 0.25 ? chaos : chaos + DIM) : L > -0.12 ? BRIGHT : L > -0.4 ? LMID : L > -0.9 ? MID : DARK;
      if (c >= DARK && c < BRIGHT && hgt - hp > 0.004 * N) c++; // a slope facing the eye, lit a step up the ramp (not the contour)
      if (lift && c < BRIGHT && c >= DARK) c++;
      if (z > 1.1 * N && c < DIM) c += DIM;
      for (let y = sy < 0 ? 0 : sy; y < yb; y++) buf[y * N + x] = c;
      yb = sy < 0 ? 0 : sy;
      if (!yb) break;
    }
    hp = hgt;
  }
  for (let y = haze; y < yb; y++) buf[y * N + x] = DARK + DIM; // the haze: the far ground up to the horizon
}

// ---------------------------------------------------------------------------------------------- attractorzoo
// One cloud that morphs between attractors, Lorenz → Rössler → Thomas → Aizawa → Halvorsen, by blending their vector
// fields over a section, each normalised into the common unit ball (by its centre and the farthest its attractor
// goes, its time by its mean speed). Each particle crosses from one field to the next at its own moment, in 0.6 of the
// zoo's time units, the moments spread over the section, with a pull to the centre while it crosses (none at either
// end): a blend held long would sink the cloud into a point or out of the next basin. The clocks turn it, the energy
// runs it; a kick bursts new trajectories at the head, a snare flashes and swaps the halves' colours, a note
// recolours its twelfth, the beat breathes the zoom; a drop jumps to the next attractor at once.
// each system: its basis (9), the radius of its attractor, its centre (3), 1 / its mean speed
const ZT = Float64Array.from([
  ...Z_UP, 33, 0, 0, 23.5, 1 / 95.8, // Lorenz, ρ 28
  ...Z_UP, 22.7, 0.2, -0.9, 0.9, 1 / 8.67, // Rössler, c 5.7
  ...D_UP, 4.72, 0, 0, 0, 1 / 0.78, // Thomas, b 0.18
  ...Z_UP, 1.53, 0, 0, 0.7, 1 / 2.57, // Aizawa
  ...D_UP, 13.2, -3.1, -3.1, -3.1, 1 / 38.2, // Halvorsen, a 1.4
]);
// the scratch: the field's sum, the four RK4 stages, and ZQ the point a field is taken at, the particle's blend m and a
// system's weight (in a typed array: numbers passed to a call that is not inlined are boxed, four stages a step)
const GZ = new Float64Array(3), KZ = new Float64Array(12), ZQ = new Float64Array(5);
// system k's normalised flow at q (ZQ 0..2), weighted ZQ[4], added into GZ: p = rotᵀ q · r + c, dq/dt = rot · F(p) / v
function zooOne(k) {
  const T = ZT, o = 14 * k, r = T[o + 9], x = ZQ[0], y = ZQ[1], z = ZQ[2];
  const px = (T[o] * x + T[o + 3] * y + T[o + 6] * z) * r + T[o + 10], py = (T[o + 1] * x + T[o + 4] * y + T[o + 7] * z) * r + T[o + 11], pz = (T[o + 2] * x + T[o + 5] * y + T[o + 8] * z) * r + T[o + 12];
  let fx, fy, fz;
  if (k === 0) { fx = 10 * (py - px); fy = px * (28 - pz) - py; fz = px * py - (8 / 3) * pz; }
  else if (k === 1) { fx = -py - pz; fy = px + 0.2 * py; fz = 0.2 + pz * (px - 5.7); }
  else if (k === 2) { fx = tsin(py) - 0.18 * px; fy = tsin(pz) - 0.18 * py; fz = tsin(px) - 0.18 * pz; }
  else if (k === 3) { fx = (pz - 0.7) * px - 3.5 * py; fy = 3.5 * px + (pz - 0.7) * py; fz = 0.6 + 0.95 * pz - (pz * pz * pz) / 3 - (px * px + py * py) * (1 + 0.25 * pz) + 0.1 * pz * px * px * px; }
  else { fx = -1.4 * px - 4 * py - 4 * pz - py * py; fy = -1.4 * py - 4 * pz - 4 * px - pz * pz; fz = -1.4 * pz - 4 * px - 4 * py - px * px; }
  const s = ZQ[4] * T[o + 13];
  GZ[0] += s * (T[o] * fx + T[o + 1] * fy + T[o + 2] * fz); GZ[1] += s * (T[o + 3] * fx + T[o + 4] * fy + T[o + 5] * fz); GZ[2] += s * (T[o + 6] * fx + T[o + 7] * fy + T[o + 8] * fz);
}
// the field a particle with blend m (ZQ[3]) feels at q, into KZ[o..o + 2]: (1 − m) of this system's, m of the next's,
// the pull 6 m (1 − m) to the centre, and a soft wall outside the ball (no pure attractor goes out there)
function zooField(a, o) {
  const x = ZQ[0], y = ZQ[1], z = ZQ[2], m = ZQ[3];
  GZ[0] = GZ[1] = GZ[2] = 0;
  if (m < 1) { ZQ[4] = 1 - m; zooOne(a); }
  if (m > 0) { ZQ[4] = m; zooOne(a === 4 ? 0 : a + 1); }
  const r2 = x * x + y * y + z * z, pull = 6 * m * (1 - m) + (r2 > 1.1 ? 4 * (r2 - 1.1) : 0);
  KZ[o] = GZ[0] - pull * x; KZ[o + 1] = GZ[1] - pull * y; KZ[o + 2] = GZ[2] - pull * z;
}
// the zoo's RK4 over its particles, in doubles; particle i crosses while the morph's progress M passes its moment
function zooRun(w, P, np, n, h, Hs) {
  const st = 3 * np, wd = w.wd, M = w.M, a = w.ia, hh = h / 2, h6 = h / 6;
  for (let i = 0; i < np; i++) {
    const q = M > 0 ? (M * (1 + wd) - ((i * 0.6180339887) % 1)) / wd : 0;
    ZQ[3] = q < 0 ? 0 : q > 1 ? 1 : q;
    let x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    for (let s = 0, o = 3 * i; s < n; s++, o += st) {
      ZQ[0] = x; ZQ[1] = y; ZQ[2] = z; zooField(a, 0);
      ZQ[0] = x + hh * KZ[0]; ZQ[1] = y + hh * KZ[1]; ZQ[2] = z + hh * KZ[2]; zooField(a, 3);
      ZQ[0] = x + hh * KZ[3]; ZQ[1] = y + hh * KZ[4]; ZQ[2] = z + hh * KZ[5]; zooField(a, 6);
      ZQ[0] = x + h * KZ[6]; ZQ[1] = y + h * KZ[7]; ZQ[2] = z + h * KZ[8]; zooField(a, 9);
      x += h6 * (KZ[0] + 2 * (KZ[3] + KZ[6]) + KZ[9]); y += h6 * (KZ[1] + 2 * (KZ[4] + KZ[7]) + KZ[10]); z += h6 * (KZ[2] + 2 * (KZ[5] + KZ[8]) + KZ[11]);
      Hs[o] = x; Hs[o + 1] = y; Hs[o + 2] = z;
    }
    P[3 * i] = x; P[3 * i + 1] = y; P[3 * i + 2] = z;
  }
}
// a morph to the next system over `dur` units of the zoo's time; one under way is only hurried (its crossings keep
// their width); in the halves kind the particles are coloured by the side they start on, so the stirring shows
function zooMorph(w, dur) {
  w.wait = 0;
  if (w.M > 0) { w.mDur = Math.min(w.mDur, Math.max(dur, 1.5)); return; }
  w.M = 1e-6; w.mDur = dur; w.wd = 0.6 / dur;
  if (w.kind === 'halves') for (let i = 0; i < w.n; i++) w.T[i] = w.P[3 * i] > 0 ? 1 : -1;
}
const ZK = [KIND('cloud', 3, 2, 1), KIND('halves', 1, 2, 2), KIND('trail', 2, 2, 2)];
const attractorzoo = {
  init(W) {
    const w = W.w;
    Object.assign(w, { ia: 0, M: 0, mDur: 12, wd: 0.05, wait: 0 });
    swarm(W, 1600, 400, 8, (P, np, n, Hs) => zooRun(w, P, np, n, 0.03, Hs), [0.1, 0.1, 0.1], 700, 3);
    w.kind = rollKind(W, ZK);
    w.jit = 2e-3;
  },
  draw(W) {
    const { N, dt, f, w } = W, c = w.cam;
    accFor(w, N);
    if (f.section === 'change') { w.kind = rollKind(W, ZK, w.kind); zooMorph(w, 12); }
    else if (f.section === 'drop') zooMorph(w, 0.5); // at once: every particle crosses within half a unit
    else if ((w.wait += dt) > 30) zooMorph(w, 12); // (and on its own when the sections are long)
    w.n = 1100 + 250 * bandOf(W.a) + BURST;
    w.tTau = w.kind === 'halves' ? 8 : 1.2;
    w.lim = w.M > 0 ? 4 : 1.69; // a particle the morph left outside the ball (|q| > 1.3) starts again at the head
    w.e = follow(w.e, energy(f), dt, 0.4);
    aim(c, ID3, 1, 0, 0, 0, f.rel.bassClock * 0.15, 0.3 + 0.2 * Math.sin(f.rel.midClock * 0.3), 3, 1.2 * N * (1 + 0.05 * f.beat.pulse), N / 2, N / 2);
    hitsOn(W, c, 0.01);
    const n = owed(w, dt, 0.7 + 1.1 * w.e, 0.03, 8);
    zooRun(w, w.P, w.n, n, 0.03, w.Hs);
    if (w.M > 0 && (w.M += (n * 0.03) / w.mDur) >= 1) { w.ia = (w.ia + 1) % 5; w.M = 0; }
    splat(W, c, w.Hs, w.n, n, 1);
    keep(W, n);
    toneMap(W, 1 + 2 * w.flash + 0.3 * f.beat.pulse, 0.35);
    w.flash *= Math.exp(-dt * 10);
    if (w.kind === 'trail') trail(W, c, w.ring, w.len, w.at, w.cnt, FIG, LMID, MID);
    headMark(W, c, f.beat.on ? WHITE : FIG, 1 + 0.6 * f.beat.pulse);
  },
};

const WORLDS = { lorenz, rossler, aizawa, thomas, halvorsen, chaosgame, mandelbulb: bulb, mandelbox: box, pendulums, bifurcation, lyapunov, attractorzoo };
registerFamily('chaos', WORLD_DEFS, WORLDS);
export const CHAOS_STYLE = makeMixStyle('CHAOS', ['chaos']);
