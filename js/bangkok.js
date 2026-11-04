// Bangkok at street level, mixed: twelve worlds of the city's tropes. A tuk-tuk through night traffic, the skytrain
// over a jammed road, a canyon of neon signs, the river at dusk, a stadium ring, a wok over a street fire, a canal
// boat between the backs of houses, a bar on a roof, a monsoon street, a market laid on the railway, the water
// festival and the river festival of lights. Original silhouettes only: no brands, no shop names, no readable text
// or script (a neon sign is shapes and bars of light), no royal imagery, temples only as rooflines and spires at a
// distance. Each world has a kinds table weighed by the arousal band, rolled again on a section change, a heavy
// turn on a drop, and answers the music continuously, on hits and on the beat. The physics are kept honest: wakes
// at the Kelvin angle that slap the walls and come back, rooster tails and thrown water on parabolas, buoyant
// lanterns that slow as they rise, rafts carried and turned by the current, awnings turning on their hinges,
// stop-and-go waves in a jam, kicks swung from the hip, wheels that roll and feet that keep step with the ground.
import { clamp, lerp, bayer } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow,
  ease, beatLocked, hash, pickW, walker, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  tuktuk: { name: 'tuk-tuk night ride', va: [[H, H], [M, H], [H, M]], themes: ['speed', 'street', 'night'], pals: ['bangkok', 'neon', 'vapor', 'candy', 'nineties'], fx: ['none', 'vhs', 'crt', 'kaleido'] },
  skytrain: { name: 'skytrain over the jam', va: [[H, H], [M, H], [H, M]], themes: ['machine', 'street', 'night'], pals: ['bangkok', 'midnight', 'neon', 'aero', 'cinema'], fx: ['none', 'crt', 'hud', 'vhs'] },
  chinatown: { name: 'neon canyon', va: [[H, H], [M, H], [H, M]], themes: ['night', 'street', 'rave'], pals: ['bangkok', 'templegold', 'neon', 'gold', 'vapor'], fx: ['none', 'vhs', 'crt', 'kaleido'] },
  riverboat: { name: 'river at dusk', va: [[M, L], [H, L], [H, M]], themes: ['dream', 'nature', 'night'], pals: ['templegold', 'bangkok', 'midnight', 'vapor', 'gold'], fx: ['none', 'film', 'vhs'] },
  muaythai: { name: 'the stadium ring', va: [[H, H], [M, H], [H, M]], themes: ['rage', 'glory', 'war'], pals: ['bangkok', 'templegold', 'cinema', 'gold', 'nineties'], fx: ['none', 'film', 'crt', 'hud'] },
  wokfire: { name: 'wok over the fire', va: [[H, M], [M, M], [M, H]], themes: ['street', 'play', 'night'], pals: ['templegold', 'bangkok', 'tape', 'cinema', 'gold'], fx: ['none', 'film', 'vhs'] },
  khlongboat: { name: 'canal boat', va: [[H, M], [M, M], [M, H]], themes: ['speed', 'street', 'nature'], pals: ['bangkok', 'tape', 'aero', 'nineties', 'midnight'], fx: ['none', 'vhs', 'film', 'crt'] },
  rooftopbar: { name: 'bar on the roof', va: [[M, L], [H, L], [H, M]], themes: ['night', 'love', 'dream'], pals: ['bangkok', 'midnight', 'vapor', 'gold', 'neon'], fx: ['none', 'film', 'vhs', 'kaleido'] },
  monsoon: { name: 'monsoon street', va: [[L, L], [L, M], [M, L]], themes: ['lonely', 'nature', 'street'], pals: ['midnight', 'bangkok', 'tape', 'vapor', 'cinema'], fx: ['none', 'vhs', 'film', 'crt'] },
  railmarket: { name: 'market on the rails', va: [[H, M], [M, M], [M, H]], themes: ['street', 'machine', 'play'], pals: ['templegold', 'bangkok', 'tape', 'aero', 'candy'], fx: ['none', 'film', 'vhs', 'hud'] },
  songkran: { name: 'water festival', va: [[H, H], [M, H], [H, M]], themes: ['play', 'rave', 'street'], pals: ['bangkok', 'candy', 'aero', 'nineties', 'vapor'], fx: ['none', 'vhs', 'crt', 'kaleido'] },
  loykrathong: { name: 'river of lights', va: [[M, L], [H, L], [H, M]], themes: ['love', 'dream', 'night'], pals: ['templegold', 'midnight', 'bangkok', 'gold', 'vapor'], fx: ['none', 'film', 'vhs', 'kaleido'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the kinds tables below weigh their kinds by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bpsOf = (f) => (f.bpm ? f.bpm / 60 : 2);
const dim = (c) => (c < DIM ? c + DIM : c);
const G = 9.8; // metres a second squared: the worlds keep their own metres, so a fall takes the same time at any size
const stepV = (h, om) => (0.2 * h * om) / Math.PI; // the speed of a mixer walker h tall whose legs turn om a second: the planted foot stays put
const energy = (f) => clamp(0.35 * f.level + 0.65 * f.rel.bassDrive);

// a beat without a lock: once per beat from the frame clock when the tracker has none
function beatTick(w, f, dt, key = 'beatPh') {
  if (beatLocked(f)) return f.beat.on;
  w[key] = (w[key] || 0) + dt * bpsOf(f);
  if (w[key] < 1) return false;
  w[key] -= 1;
  return true;
}

// one-point perspective: a camera {vx, hz, F, H} (the vanishing x, the horizon y, the focal length in cells, the eye
// height in metres); proj puts the world point (X across, Y up, Z ahead, all metres) at PX, PY and returns F/Z
let PX = 0, PY = 0;
function proj(C, X, Y, Z) { const k = C.F / Math.max(0.05, Z); PX = C.vx + X * k; PY = C.hz + (C.H - Y) * k; return k; }
const QP = [[0, 0], [0, 0], [0, 0], [0, 0]];
// a flat four-cornered face in the world (an awning, a deck, a strip of road), corners in order
function quad3(r, C, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, c) {
  proj(C, ax, ay, az); QP[0][0] = PX; QP[0][1] = PY;
  proj(C, bx, by, bz); QP[1][0] = PX; QP[1][1] = PY;
  proj(C, cx, cy, cz); QP[2][0] = PX; QP[2][1] = PY;
  proj(C, dx, dy, dz); QP[3][0] = PX; QP[3][1] = PY;
  r.poly(QP, c);
}

// a neon sign is light, never letters: a panel of blocks, bars, a ring, chevrons, a grid or a lit frame; `seed` makes it its own
const NEON = ['blocks', 'bars', 'ring', 'chevrons', 'grid', 'frame'];
function neon(r, x, y, w, h, kind, col, seed, u, on = true) {
  if (w < 3 || h < 3) { r.rect(x, y, Math.max(1, w), Math.max(1, h), on ? col : DARK); return; }
  r.rect(x, y, w, h, DARK);
  if (!on) { r.frame(Math.round(x), Math.round(y), Math.round(w), Math.round(h), MID + DIM); return; }
  const lw = Math.max(1, Math.min(w, h) * 0.12);
  switch (kind) {
    case 'blocks': { // a column of framed squares, some with a lit square inside
      const n = Math.max(1, Math.round(h / Math.max(3, w))), bh = h / n;
      for (let k = 0; k < n; k++) { const yy = y + k * bh; r.frame(Math.round(x + lw), Math.round(yy + lw), Math.round(w - 2 * lw), Math.round(bh - 2 * lw), col); if (hash(seed, k) < 0.6) r.rect(x + w * 0.32, yy + bh * 0.32, w * 0.36, bh * 0.36, col); }
      break;
    }
    case 'bars': for (let yy = y + lw, k = 0; yy < y + h - lw; yy += lw * 2.5, k++) r.rect(x + lw + hash(seed, k) * w * 0.25, yy, w * (0.35 + hash(k, seed) * 0.4), lw, col); break;
    case 'ring': { const R = Math.min(w, h) * 0.36; r.ring(x + w / 2, y + h / 2, R, lw, col); r.disc(x + w / 2, y + h / 2, R * 0.35, col); break; }
    case 'chevrons': for (let k = 0; k < 3; k++) { const yy = y + h * (0.27 + k * 0.24); r.stroke(x + lw, yy - h * 0.07, x + w / 2, yy + h * 0.04, lw, col); r.stroke(x + w / 2, yy + h * 0.04, x + w - lw, yy - h * 0.07, lw, col); } break;
    case 'grid': { const cw = w / 3, ch = h / 5; for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (hash(seed + i, j) < 0.55) r.rect(x + i * cw + lw * 0.5, y + j * ch + lw * 0.5, Math.max(1, cw - lw), Math.max(1, ch - lw), col); break; }
    default: r.frame(Math.round(x), Math.round(y), Math.round(w), Math.round(h), col); r.rect(x + w * 0.25, y + h * 0.3, w * 0.5, h * 0.4, col);
  }
}

// towers along `base`, each [x, w, h] in screen fractions, their windows lit by hash under `lit`
function skyline(r, N, u, base, list, col, win, lit, seed = 0) {
  const st = Math.max(2, Math.round(3 * u)), ww = Math.max(1, Math.round(u));
  for (let i = 0; i < list.length; i++) {
    const [x, bw, bh] = list[i], x0 = x * N, top = base - bh * N;
    r.rect(x0, top, bw * N, bh * N, col);
    if (lit <= 0) continue;
    for (let y = top + st, j = 0; y < base - st; y += st + ww, j++)
      for (let xx = x0 + st * 0.7, k = 0; xx < x0 + bw * N - st; xx += st, k++) if (hash(i * 97 + k + seed, j) < lit) r.rect(xx, y, ww, ww, win);
  }
}

// the scene above the waterline `wl` mirrored into the water below it down to y1: row wl + d shows row wl - 1 - d,
// shifted by a ripple that grows toward the viewer, dimmed, and broken to the water colour `wc` on the crests
function reflect(r, wl, y1, t, amp, wc) {
  const N = r.N, buf = r.buf, a = Math.round(wl), b = Math.min(N, Math.round(y1)), ti = (t * 7) | 0;
  for (let y = Math.max(0, a); y < b; y++) {
    const d = y - a, sy = a - 1 - d, o = y * N;
    if (sy < 0 || (d > 1 && (d * 5 + ti) % 9 === 0)) { buf.fill(wc, o, o + N); continue; }
    const sh = Math.round(Math.sin(t * 2.1 + d * 0.8) * amp * (0.25 + (d + 1) / Math.max(1, b - a))), so = sy * N;
    for (let x = 0; x < N; x++) {
      const xs = x - sh, c = buf[so + (xs < 0 ? 0 : xs >= N ? N - 1 : xs)];
      buf[o + x] = c < DIM ? c + DIM : c === WHITE ? BRIGHT : c;
    }
  }
}
// one thing's own reflection: the rows above its waterline y0 within [x0, x1) mirrored below it, `depth` rows deep,
// only the roles in `mask` (a bit each), dimmed and broken by the ripples
function mirrorBox(r, x0, x1, y0, depth, mask, t) {
  const N = r.N, buf = r.buf, a = Math.round(y0), xa = Math.max(0, Math.round(x0)), xb = Math.min(N, Math.round(x1)), ti = (t * 6) | 0;
  for (let d = 0; d < depth; d++) {
    const y = a + d, sy = a - 1 - d;
    if (y >= N || sy < 0) break;
    if (y < 0 || (d > 0 && (d + ti) % 4 === 0)) continue;
    const sh = Math.round(Math.sin(t * 3 + d * 1.1) * (0.5 + d * 0.08)), o = y * N, so = sy * N;
    for (let x = xa; x < xb; x++) { const xs = x - sh; if (xs < 0 || xs >= N) continue; const c = buf[so + xs]; if ((mask >> c) & 1) buf[o + x] = c < DIM ? c + DIM : c; }
  }
}
const bits = (...cs) => cs.reduce((m, c) => m | (1 << c), 0);

// slanted rain: streaks falling at v cells a second with the wind wx across, each to its own floor between y0 and
// y1, drawn along their own velocity
function rainfall(W, list, want, v, wx, y0, y1, col) {
  const { r, N, dt, rnd, u } = W, l = 4 * u, sx = wx / v;
  while (list.length < want) list.push({ x: rnd() * N * 1.4 - 0.2 * N, y: -rnd() * N, end: y0 + rnd() * (y1 - y0) });
  if (list.length > want) list.length = want;
  for (const d of list) {
    d.y += v * dt; d.x += wx * dt;
    if (d.y > d.end) { d.y = -rnd() * 0.2 * N; d.x = rnd() * N * 1.4 - 0.2 * N - wx * 0.3; d.end = y0 + rnd() * (y1 - y0); }
    r.line(d.x, d.y, d.x - sx * l, d.y - l, col);
  }
}

// a puff drawn as a half-tone: every other cell of a disc, so smoke and steam read as thin
function puff(r, cx, cy, R, c) {
  const N = r.N, R2 = R * R, y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(N - 1, cy + R), x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(N - 1, cx + R);
  for (let y = y0; y <= y1; y++) for (let x = x0 + ((x0 + y) & 1); x <= x1; x += 2) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= R2) r.buf[y * N + x] = c; }
}

// a wheel of radius R at (x, y) turned `a`: the tyre, the rim and a spoke, so the roll shows
function wheel(r, x, y, R, a) {
  r.disc(x, y, R, BLACK);
  if (R < 1.8) return;
  r.disc(x, y, R * 0.5, MID);
  r.line(x, y, x + Math.cos(a) * R * 0.85, y + Math.sin(a) * R * 0.85, LMID);
}

// a tuk-tuk from the side, its nose toward `dir`, wheels on g, `s` cells a metre: the cab over the one front wheel,
// the bench under the canopy with its lit trim, the wheels turned `roll`; o: {col, roof, pax, arm, flash, trim}
function tukSide(r, x, g, s, dir, roll, o = {}) {
  const f = (m) => x + dir * m * s, R = 0.24 * s, col = o.col ?? MID, roof = o.roof ?? HOT;
  wheel(r, f(-0.95), g - R, R, roll * dir);
  wheel(r, f(1.0), g - R, R, roll * dir);
  r.poly([[f(-1.35), g - 0.32 * s], [f(-1.35), g - 0.9 * s], [f(0.6), g - 0.9 * s], [f(1.32), g - 0.72 * s], [f(1.38), g - 0.38 * s], [f(0.85), g - 0.32 * s]], col);
  r.rect(Math.min(f(-1.35), f(0.6)), g - 0.62 * s, Math.abs(1.95 * s), Math.max(1, 0.08 * s), LMID);
  r.stroke(f(-1.3), g - 0.9 * s, f(-1.3), g - 1.62 * s, Math.max(1, 0.06 * s), DARK); // the canopy posts
  r.stroke(f(0.95), g - 0.78 * s, f(0.7), g - 1.62 * s, Math.max(1, 0.07 * s), DARK); // the screen post
  const px = o.pax ?? 2;
  for (let i = 0; i < px; i++) { const hx = f(-0.55 - i * 0.42); r.rect(hx - 0.14 * s, g - 1.22 * s, 0.28 * s, 0.32 * s, FIG); r.disc(hx, g - 1.32 * s, 0.13 * s, FIG); }
  r.rect(f(0.3) - 0.12 * s, g - 1.2 * s, 0.24 * s, 0.3 * s, DARK); r.disc(f(0.32), g - 1.3 * s, 0.12 * s, DARK); // the driver
  if (o.arm !== undefined && px) { const sx = f(-0.55), sy = g - 1.1 * s, hx = f(-0.95), hy = g - (0.95 + 0.12 * o.arm) * s; r.stroke(sx, sy, hx, hy, Math.max(1, 0.08 * s), FIG); r.disc(hx, hy, 0.07 * s, FIG); }
  r.rect(Math.min(f(-1.45), f(0.8)), g - 1.78 * s, 2.25 * s, 0.18 * s, roof);
  if (o.trim !== false) for (let m = -1.4, k = 0; m < 0.78; m += 0.22, k++) r.rect(f(m), g - 1.6 * s, Math.max(1, 0.06 * s), Math.max(1, 0.06 * s), (k + ((o.trim | 0) % 2)) % 2 ? COOL : BRIGHT);
  r.rect(f(1.34) - 0.07 * s, g - 0.66 * s, 0.14 * s, 0.14 * s, o.flash ? WHITE : BRIGHT); // the headlight
  r.rect(f(-1.37) - 0.05 * s, g - 0.55 * s, 0.1 * s, 0.12 * s, HOT);
}

// cars from the side: length, roof height, the wheel radius, a sign on the roof, a bus's window row, a pickup's bed
const CARS = { sedan: { L: 4.5, h: 1.45, R: 0.32 }, taxi: { L: 4.5, h: 1.45, R: 0.32, sign: true }, van: { L: 4.8, h: 1.95, R: 0.33 },
  bus: { L: 11, h: 3.1, R: 0.5, bus: true }, pickup: { L: 5.2, h: 1.8, R: 0.36, bed: true } };
function carSide(r, x, g, s, dir, kind, col, roll, brake) {
  const K = CARS[kind], f = (m) => x + dir * m * s, hl = K.L / 2, R = K.R * s;
  if (K.bus) {
    r.rect(f(-hl) - (dir < 0 ? K.L * s : 0), g - K.h * s, K.L * s, (K.h - 0.35) * s, col);
    for (let m = -hl + 0.6; m < hl - 1.6; m += 1.25) r.rect(Math.min(f(m), f(m + 1)), g - (K.h - 0.35) * s, s, 0.8 * s, LMID);
    r.rect(Math.min(f(hl - 1.3), f(hl - 0.2)), g - (K.h - 0.35) * s, 1.1 * s, 1.3 * s, LMID);
  } else {
    r.poly([[f(-hl), g - 0.32 * s], [f(-hl), g - 0.95 * s], [f(hl - 0.2), g - 0.9 * s], [f(hl), g - 0.6 * s], [f(hl), g - 0.32 * s]], col);
    if (K.bed) { r.poly([[f(0.1), g - 0.9 * s], [f(0.35), g - K.h * s], [f(1.6), g - K.h * s], [f(2.1), g - 0.9 * s]], col); r.poly([[f(0.45), g - 1.0 * s], [f(0.55), g - (K.h - 0.12) * s], [f(1.5), g - (K.h - 0.12) * s], [f(1.85), g - 1.0 * s]], DARK); r.rect(Math.min(f(-hl), f(0)), g - 1.15 * s, hl * s, 0.2 * s, col); }
    else {
      r.poly([[f(-hl * 0.75), g - 0.95 * s], [f(-hl * 0.55), g - K.h * s], [f(hl * 0.25), g - K.h * s], [f(hl * 0.55), g - 0.92 * s]], col);
      r.poly([[f(-hl * 0.62), g - 1.0 * s], [f(-hl * 0.5), g - (K.h - 0.1) * s], [f(hl * 0.2), g - (K.h - 0.1) * s], [f(hl * 0.42), g - 0.98 * s]], DARK);
      if (K.sign) r.rect(f(-0.25) - 0.3 * s, g - (K.h + 0.22) * s, 0.6 * s, 0.22 * s, BRIGHT);
    }
  }
  wheel(r, f(-hl * 0.66), g - R, R, roll * dir);
  wheel(r, f(hl * 0.66), g - R, R, roll * dir);
  r.rect(f(-hl) - 0.08 * s, g - 0.8 * s, 0.16 * s, 0.2 * s, brake ? HOT : HOT + DIM); // the tail light lights up as it brakes
  r.rect(f(hl) - 0.08 * s, g - 0.7 * s, 0.16 * s, 0.14 * s, BRIGHT);
}

// a temple spire at a distance: a stepped base and tiers tapering like a husk to a slender tip; `trim` lines the tiers
function spire(r, x, base, h, col, trim) {
  const w = h * 0.34;
  r.rect(x - w * 0.75, base - h * 0.08, w * 1.5, h * 0.08, col);
  r.rect(x - w * 0.6, base - h * 0.15, w * 1.2, h * 0.08, col);
  for (let k = 0; k < 7; k++) {
    const q0 = 0.15 + k * 0.1, q1 = q0 + 0.1, w0 = w * 0.5 * (1 - (q0 - 0.15) ** 1.4 * 1.25), w1 = w * 0.5 * (1 - (q1 - 0.15) ** 1.4 * 1.25);
    r.poly([[x - w0, base - q0 * h], [x + w0, base - q0 * h], [x + w1 * 0.9, base - q1 * h], [x - w1 * 0.9, base - q1 * h]], col);
    if (trim !== undefined && w0 > 1.5) r.rect(x - w0, base - q0 * h - 1, 2 * w0, 1, trim);
  }
  r.stroke(x, base - 0.85 * h, x, base - h, Math.max(1, w * 0.06), col);
}
// a temple hall's roofline at a distance: walls under three tiered roofs, a finial curling up at each ridge end
function templeRoof(r, x, base, w, h, col) {
  r.rect(x - w * 0.36, base - h * 0.42, w * 0.72, h * 0.42, col);
  for (let k = 0; k < 3; k++) {
    const yb = base - h * (0.38 + k * 0.16), hw = w * (0.5 - k * 0.1), top = yb - h * 0.26;
    r.poly([[x - hw, yb], [x + hw, yb], [x + hw * 0.3, top], [x - hw * 0.3, top]], col);
    for (const sd of [-1, 1]) r.line(x + sd * hw * 0.3, top, x + sd * (hw * 0.3 + h * 0.06), top - h * 0.1, col);
  }
}

// a figure seen from the front or the back, walking: the feet lift in turn with `ph`, the body rides highest when a
// foot is up; returns the shoulder and the top of the head
function walkerFront(r, x, base, h, col, ph, shirt = col) {
  const hw = h * 0.14, legH = h * 0.44, sn = Math.sin(ph), bob = Math.abs(sn) * h * 0.02, lw = Math.max(1, hw * 0.75), hip = base - legH - bob;
  r.rect(x - hw * 0.95, hip, lw, legH + bob - Math.max(0, sn) * h * 0.07, col);
  r.rect(x + hw * 0.95 - lw, hip, lw, legH + bob - Math.max(0, -sn) * h * 0.07, col);
  const top = hip - h * 0.34, sw = sn * h * 0.03;
  r.rect(x - hw, top, 2 * hw, h * 0.35, shirt);
  r.rect(x - hw - lw * 0.8, top + h * 0.03 + sw, lw * 0.8, h * 0.28, col);
  r.rect(x + hw, top + h * 0.03 - sw, lw * 0.8, h * 0.28, col);
  r.disc(x, top - h * 0.1, h * 0.1, col);
  return { sx: x + hw, sy: top + h * 0.05, top: top - h * 0.2 };
}

// ---------------------------------------------------------------------------------------------- tuktuk
// Night traffic from behind the ride, down a street of neon blades streaming past in perspective: a three-wheeled
// taxi weaves between cars and buses (a snare changes lanes, a car in the way does too, and the body rolls out of
// the turn on its springs), the horn flashes the beam on a kick, a passenger rides with an arm out in the wind, the
// exhaust puffs on the beat and is left behind. Kinds: the tuk-tuk, a motorbike taxi with a passenger side-saddle
// (it leans into the turns), a pink taxi. A drop: a gap between a bus and a car, through it balanced on two wheels.
const RIDE_W = { tuktuk: [2, 2, 3], bike: [1, 2, 3], taxi: [3, 2, 1] };
const TRAFFIC = { car: { w: 1.8, h: 1.45, v: 0.55 }, bus: { w: 2.5, h: 3.2, v: 0.42 }, tuk: { w: 1.4, h: 1.75, v: 0.5 }, moto: { w: 0.7, h: 1.45, v: 0.62 } };
const TRAFFIC_W = { car: [3, 3, 2], bus: [2, 2, 2], tuk: [1, 2, 2], moto: [1, 2, 3] };
const LANES = [-3.2, 0, 3.2], RIDE_Z = 6;

function newRider(rnd, band, Z, lane) {
  const kind = rollW(rnd, TRAFFIC_W, band);
  return { kind, lane, X: LANES[lane] + (rnd() - 0.5) * 0.5, Z, v: TRAFFIC[kind].v * (0.85 + rnd() * 0.3), sp: -1, col: pick(rnd, [MID, DARK, LMID, COOL + DIM, HOT + DIM, MID + DIM]), brake: 0, gapper: false };
}
// back into the traffic far ahead, in a lane with room (not the ride's while it is up on two wheels); one that pulled
// away from us comes back at the far end of the street, never in the middle of it
function respawn(w, rnd, band, c, far) {
  const Z = far ? 118 + rnd() * 10 : 70 + rnd() * 25;
  for (let k = 0; k < 8; k++) { const ln = (rnd() * 3) | 0; if (w.tilt && ln === w.lane) continue; if (!w.traffic.some((q) => q !== c && q.lane === ln && Math.abs(q.Z - Z) < 12)) { Object.assign(c, newRider(rnd, band, Z, ln)); return; } }
  Object.assign(c, newRider(rnd, band, Math.min(129, Z + 12), w.tilt ? (w.lane + 1) % 3 : (rnd() * 3) | 0));
}

const tuktuk = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, RIDE_W, band), lane: 1, X: 0, X1: 0, vX: 0, aX: 0, camX: 0, rho: 0, om: 0, th: 0, vth: 0, tilt: null, horn: 0,
      bounce: 0, vb: 0, speed: 8, run: 0, traffic: [], puffs: [], signs: [],
      sky: Array.from({ length: 12 }, (_, i) => [0.2 + i * 0.05 + (rnd() - 0.5) * 0.02, 0.03 + rnd() * 0.04, 0.06 + rnd() * 0.22]) });
    for (let i = 0; i < 7; i++) w.traffic.push(newRider(rnd, band, 14 + i * 12 + rnd() * 5, i % 3));
    for (let i = 0; i < 18; i++) w.signs.push({ side: i % 2 ? 1 : -1, Z: 3 + i * 4 + rnd() * 2, Y: 2.8 + rnd() * 3, h: 1.6 + rnd() * 3.2, out: 0.8 + rnd() * 1.4, kind: pick(rnd, NEON), col: rnd() < 0.5 ? HOT : COOL, seed: (rnd() * 1e4) | 0, flick: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), dts = Math.max(dt, 1e-3);
    const C = { vx: 0.5 * N, hz: 0.42 * N, F: 1.07 * N, H: 2.2 }, want = 6 + 14 * energy(f);
    const free = (ln, z0, z1) => ln >= 0 && ln < 3 && !w.traffic.some((c) => Math.abs(c.X - LANES[ln]) < 2.4 && c.Z > z0 && c.Z < z1);
    for (const h of hits) {
      if (isLow(h)) { w.horn = 0.3; w.vb = Math.max(w.vb, 0.4 + 0.5 * h.strength); } // the horn, and a jolt on the springs
      else if (h.kind === 'snare' && !w.tilt) { const opts = [w.lane - 1, w.lane + 1].filter((ln) => free(ln, RIDE_Z - 3.5, RIDE_Z + 7)); if (opts.length) w.lane = pick(rnd, opts); }
      else if (h.kind === 'hat') pick(rnd, w.signs).flick = 0.06 + rnd() * 0.12;
      if (isTonal(h) && h.kind !== 'hat') pick(rnd, w.signs).col = h.pc % 2 ? COOL : HOT;
    }
    if (f.section === 'change') w.kind = rollW(rnd, RIDE_W, band);
    if (f.section === 'drop' && !w.tilt) { // a bus and a low car close together ahead: up on two wheels, the top over the car
      const x0 = LANES[w.lane];
      w.kind = 'tuktuk';
      w.traffic = w.traffic.filter((c) => c.Z < RIDE_Z - 4 || c.Z > RIDE_Z + 60 || Math.abs(c.X - x0) > 4.6);
      w.traffic.push(Object.assign(newRider(rnd, band, RIDE_Z + 44, w.lane), { kind: 'bus', X: x0 - 1.95, v: 0.36, col: MID, gapper: true }));
      w.traffic.push(Object.assign(newRider(rnd, band, RIDE_Z + 44.5, w.lane), { kind: 'car', X: x0 + 1.6, v: 0.36, col: DARK, gapper: true }));
      w.tilt = { ph: 'wait', t: 0 };
      s.shake = Math.max(s.shake, 0.3);
    }
    // weave out of a slower one in the lane, or follow it while both sides are taken; up on two wheels it keeps its
    // lane through the gap and only brakes for anyone else in it
    let target = want, ahead = null;
    for (const c of w.traffic) if (!(w.tilt && c.gapper) && Math.abs(c.X - w.X) < 1.9 && c.Z > RIDE_Z - 0.5 && c.Z < RIDE_Z + 9 && (!ahead || c.Z < ahead.Z)) ahead = c;
    const aheadV = ahead ? (ahead.sp >= 0 ? ahead.sp : ahead.v * want) : 0;
    if (ahead) { const opts = w.tilt ? [] : [w.lane - 1, w.lane + 1].filter((ln) => free(ln, RIDE_Z - 3.5, RIDE_Z + 7)); if (opts.length && Math.abs(LANES[w.lane] - ahead.X) < 2) w.lane = pick(rnd, opts); else target = Math.min(target, aheadV); }
    w.speed = follow(w.speed, target, dt, 0.5);
    if (ahead && ahead.Z < RIDE_Z + 4) w.speed = Math.min(w.speed, aheadV); // too close: on the brakes, never into it
    w.run += w.speed * dt;
    w.X1 = follow(w.X1, LANES[w.lane], dt, 0.25);
    const nx = follow(w.X, w.X1, dt, 0.25), nv = (nx - w.X) / dts;
    w.aX = follow(w.aX, (nv - w.vX) / dts, dt, 0.06); w.vX = nv; w.X = nx;
    w.camX = follow(w.camX, w.X, dt, 0.6);
    if (w.kind === 'bike') w.rho = follow(w.rho, Math.atan(w.aX / G), dt, 0.08); // a bike leans into the turn
    else { w.om += (40 * (-0.04 * w.aX - w.rho) - 6 * w.om) * dt; w.rho += w.om * dt; } // a body on springs rolls out of it
    w.rho = clamp(w.rho, -0.5, 0.5);
    w.vb += (-70 * w.bounce - 7 * w.vb) * dt; w.bounce += w.vb * dt;
    w.horn -= dt;
    if (w.tilt) { // up on two wheels about the right one, held through the gap, then let go: it falls back and bounces
      const T = w.tilt;
      T.t += dt;
      if (T.ph === 'wait') { if (T.t > 5 || w.traffic.some((c) => c.gapper && c.Z < RIDE_Z + 11)) { T.ph = 'up'; T.t = 0; } } // closing on the gap
      else if (T.ph === 'up') { w.vth += (70 * (0.5 - w.th) - 11 * w.vth) * dt; w.th += w.vth * dt; if (T.t > 0.6) T.ph = 'hold'; }
      else if (T.ph === 'hold') { w.th = follow(w.th, 0.5 + 0.04 * Math.sin(t * 9), dt, 0.15); w.vth = 0; if (T.t > 5 || !w.traffic.some((c) => c.gapper && c.Z > RIDE_Z - 3)) T.ph = 'down'; }
      else { // let go: its weight (0.62 m in from the wheel it pivots on, 0.75 m up) tips it back down, ever faster, and it bounces
        w.vth -= ((G * (0.62 * Math.cos(w.th) - 0.75 * Math.sin(w.th))) / 1.2) * dt; w.th += w.vth * dt;
        if (w.th <= 0) { w.th = 0; w.vth = -w.vth * 0.3; s.shake = Math.max(s.shake, 0.2); if (w.vth < 0.25) { w.vth = 0; w.tilt = null; } }
      }
    }
    // the traffic: every car keeps its own pace but brakes for the one ahead in its lane (and for the ride), so none
    // drives through another; the brake lights come on as it does
    w.traffic.sort((p, q) => q.Z - p.Z);
    for (let i = 0; i < w.traffic.length; i++) {
      const c = w.traffic[i], len = c.kind === 'bus' ? 11 : 4.5;
      let lim = c.v * want;
      for (let j = i - 1; j >= 0; j--) { const q = w.traffic[j]; if (Math.abs(q.X - c.X) < 1.7) { lim = Math.min(lim, Math.max(0, (q.sp >= 0 ? q.sp : q.v * want) + 0.9 * (q.Z - c.Z - len - 2))); break; } }
      if (c.Z < RIDE_Z && Math.abs(w.X - c.X) < 1.7) lim = Math.min(lim, Math.max(0, w.speed + 0.9 * (RIDE_Z - c.Z - len - 2)));
      if (c.sp < 0) c.sp = lim;
      if (lim < c.sp - 0.3) c.brake = 0.3;
      c.sp = Math.min(lim, follow(c.sp, lim, dt, 0.8));
      c.Z += (c.sp - w.speed) * dt;
      c.brake -= dt;
      if (c.Z < 0.6 || c.Z > 130) { if (c.gapper) c.dead = true; else respawn(w, rnd, band, c, c.Z > 130); }
    }
    if (w.traffic.some((c) => c.dead)) w.traffic = w.traffic.filter((c) => !c.dead);
    if (beatTick(w, f, dt)) { // the exhaust puffs out on the beat; someone ahead touches the brakes (and those behind them do too)
      const ex = w.kind === 'bike' ? 0.2 : w.kind === 'taxi' ? -0.6 : -0.45;
      w.puffs.push({ X: w.X + ex, Y: 0.25, Z: RIDE_Z - 1.3, vX: (rnd() - 0.5) * 0.4, vY: 0.35, vZ: -2.5, R: 0.1 + 0.1 * f.rel.bassDrive, life: 1.2 });
      if (w.traffic.length) { const q = pick(rnd, w.traffic); q.brake = 0.5; if (q.sp > 0) q.sp *= 0.75; }
    }
    for (const p of w.puffs) { p.vZ = follow(p.vZ, -w.speed, dt, 0.35); p.vY = follow(p.vY, 0.1, dt, 0.6); p.X += p.vX * dt; p.Y += p.vY * dt; p.Z += p.vZ * dt; p.R += 0.45 * dt; p.life -= dt; }
    w.puffs = w.puffs.filter((p) => p.life > 0 && p.Z > 1.8);
    for (const sg of w.signs) { sg.Z -= w.speed * dt; sg.flick -= dt; if (sg.Z < 1.2) { sg.Z += 72; sg.kind = pick(rnd, NEON); sg.seed = (rnd() * 1e4) | 0; } }
    w.signs.sort((p, q) => q.Z - p.Z);

    // the street: the far towers, the road and the kerbs, two walls of windows, the blades of neon
    const cx = w.camX;
    skyline(r, N, u, C.hz, w.sky, DARK + DIM, LMID + DIM, 0.18);
    r.rect(0, C.hz, N, N - C.hz, DARK + DIM);
    for (const sd of [-1, 1]) {
      quad3(r, C, sd * 4.8 - cx, 0, 1.2, sd * 7.4 - cx, 0, 1.2, sd * 7.4 - cx, 0, 140, sd * 4.8 - cx, 0, 140, MID + DIM);
      quad3(r, C, sd * 7.4 - cx, 0, 1.2, sd * 7.4 - cx, 15, 1.2, sd * 7.4 - cx, 15, 140, sd * 7.4 - cx, 0, 140, DARK);
      for (let row = 0; row < 3; row++)
        for (let k = 0; k < 24; k++) {
          const m = Math.ceil((w.run + 2 - k * 3.5) / 84), Z = k * 3.5 + 84 * m - w.run;
          if (hash(k + 24 * m + (sd > 0 ? 7777 : 0), row) > 0.45) continue;
          const k0 = proj(C, sd * 7.4 - cx, 4.5 + row * 3.2, Z), x0 = PX, y0 = PY;
          proj(C, sd * 7.4 - cx, 4.5 + row * 3.2, Z + 1.3);
          r.rect(Math.min(x0, PX), y0, Math.max(1, Math.abs(PX - x0)), Math.max(1, 1.3 * k0), LMID + DIM);
        }
    }
    for (const X of [-1.6, 1.6]) for (let k = 0; k < 12; k++) { // the lane dashes stream in at the speed of the ride
      const Z = 1.2 + ((((k * 6 - w.run) % 72) + 72) % 72);
      quad3(r, C, X - 0.07 - cx, 0, Z, X + 0.07 - cx, 0, Z, X + 0.07 - cx, 0, Z + 2.5, X - 0.07 - cx, 0, Z + 2.5, LMID);
    }
    for (const X of [-4.8, 4.8]) quad3(r, C, X - 0.08 - cx, 0, 1.2, X + 0.08 - cx, 0, 1.2, X + 0.08 - cx, 0, 140, X - 0.08 - cx, 0, 140, LMID + DIM);
    const trebOn = f.rel.trebDrive > 0.75 ? Math.floor(t * 12) : -1;
    for (const sg of w.signs) {
      const k = proj(C, sg.side * 7.4 - cx, sg.Y + sg.h, sg.Z), xo = PX, yt = PY;
      proj(C, sg.side * (7.4 - sg.out) - cx, sg.Y, sg.Z);
      if (k * sg.out < 1) continue;
      neon(r, Math.min(xo, PX), yt, Math.abs(PX - xo), PY - yt, sg.kind, sg.col, sg.seed, u, sg.flick <= 0 && (sg.seed + trebOn) % 7 !== 0);
    }
    // the cars, far to near, the ride among them
    w.traffic.sort((p, q) => q.Z - p.Z);
    const car = (c) => {
      const T = TRAFFIC[c.kind], k = proj(C, c.X - cx, 0, c.Z), x = PX, g = PY, hw = T.w * 0.5 * k, hh = T.h * k, lit = c.brake > 0 ? HOT : HOT + DIM;
      if (x + hw < 0 || x - hw > N || hh < 1) return;
      r.rect(x - hw, g - 0.06 * k, 2 * hw, 0.1 * k, BLACK);
      if (c.kind === 'moto') { r.rect(x - 0.08 * k, g - 0.6 * k, 0.16 * k, 0.6 * k, BLACK); r.rect(x - 0.22 * k, g - 1.3 * k, 0.44 * k, 0.62 * k, FIG); r.disc(x, g - 1.42 * k, 0.15 * k, c.col); r.rect(x - 0.1 * k, g - 0.75 * k, 0.2 * k, 0.1 * k, lit); return; }
      for (const sd of [-1, 1]) r.rect(x + sd * hw * 0.8 - 0.12 * k, g - 0.35 * k, 0.24 * k, 0.35 * k, BLACK);
      if (c.kind === 'bus') { r.rect(x - hw, g - hh, 2 * hw, hh - 0.3 * k, c.col); r.rect(x - hw * 0.8, g - hh + 0.3 * k, hw * 1.6, hh * 0.35, LMID); for (const sd of [-1, 1]) r.rect(x + sd * hw * 0.82 - 0.15 * k, g - 1.0 * k, 0.3 * k, 0.4 * k, lit); }
      else if (c.kind === 'tuk') { r.rect(x - hw, g - 1.0 * k, 2 * hw, 0.65 * k, c.col); r.rect(x - hw * 0.9, g - 1.62 * k, hw * 1.8, 0.62 * k, DARK); r.rect(x - hw * 1.1, g - hh, hw * 2.2, 0.2 * k, c.col === HOT + DIM ? COOL : HOT); for (const sd of [-1, 1]) r.rect(x + sd * hw * 0.75 - 0.08 * k, g - 0.6 * k, 0.16 * k, 0.15 * k, lit); }
      else { r.rect(x - hw, g - 0.95 * k, 2 * hw, 0.65 * k, c.col); r.poly([[x - hw * 0.85, g - 0.95 * k], [x + hw * 0.85, g - 0.95 * k], [x + hw * 0.6, g - hh], [x - hw * 0.6, g - hh]], c.col); r.rect(x - hw * 0.6, g - hh + 0.12 * k, hw * 1.2, 0.3 * k, DARK); for (const sd of [-1, 1]) r.rect(x + sd * hw * 0.78 - 0.15 * k, g - 0.8 * k, 0.3 * k, 0.15 * k, lit); }
    };
    for (const c of w.traffic) if (c.Z >= RIDE_Z) car(c);
    // the headlight on the road ahead, flaring with the horn
    quad3(r, C, w.X - 0.5 - cx, 0, RIDE_Z + 1.4, w.X + 0.5 - cx, 0, RIDE_Z + 1.4, w.X + 2.6 - cx, 0, RIDE_Z + 14, w.X - 2.6 - cx, 0, RIDE_Z + 14, w.horn > 0 ? LMID : MID + DIM);
    const k = proj(C, w.X - cx, 0, RIDE_Z), bx = PX, by = PY, bike = w.kind === 'bike';
    const lean = bike ? w.rho : w.th, roll = bike ? 0 : w.rho, piv = bike ? 0 : 0.62, cl = Math.cos(lean), sl = Math.sin(lean), cr = Math.cos(roll), sr = Math.sin(roll);
    // a point of the ride in metres (across, up) to the screen: the body rolls on its springs about the axle, and
    // the whole of it tilts about the right wheel's contact (a bike leans about its one)
    const T = (lx, ly, body = true) => {
      if (body) { const y = ly + w.bounce - 0.35, x2 = lx * cr + y * sr; ly = -lx * sr + y * cr + 0.35; lx = x2; }
      const dx = lx - piv;
      return [bx + (piv + dx * cl + ly * sl) * k, by - (-dx * sl + ly * cl) * k];
    };
    const box = (x0, y0, x1, y1, c, body = true) => r.poly([T(x0, y0, body), T(x1, y0, body), T(x1, y1, body), T(x0, y1, body)], c);
    r.rect(bx - 0.85 * k, by - 0.05 * k, 1.7 * k, 0.12 * k, BLACK);
    const arm = Math.sin(f.rel.trebClock * 3 + t * 2);
    if (bike) { // the rider's vest, the passenger sitting side-saddle behind with both legs to one side
      box(-0.07, 0, 0.07, 0.62, BLACK); box(-0.16, 0.55, 0.16, 0.72, DARK); box(-0.07, 0.6, 0.07, 0.68, HOT);
      box(-0.45, 1.12, -0.38, 1.2, LMID); box(0.38, 1.12, 0.45, 1.2, LMID);
      box(-0.24, 0.72, 0.24, 1.45, HOT);
      const [hx, hy] = T(0, 1.6); r.disc(hx, hy, 0.15 * k, MID);
      box(-0.12, 0.84, 0.2, 1.32, FIG);
      const [px, py] = T(0.04, 1.44); r.disc(px, py, 0.13 * k, FIG);
      const [k0x, k0y] = T(-0.08, 0.86), [k1x, k1y] = T(-0.42, 0.6), [k2x, k2y] = T(-0.46 + 0.03 * arm, 0.22);
      r.stroke(k0x, k0y, k1x, k1y, 0.13 * k, FIG); r.stroke(k1x, k1y, k2x, k2y, 0.11 * k, FIG); box(-0.32, 0.86, -0.1, 1.02, COOL);
    } else if (w.kind === 'taxi') {
      box(-0.88, 0, -0.64, 0.36, BLACK, false); box(0.64, 0, 0.88, 0.36, BLACK, false);
      box(-0.9, 0.3, 0.9, 0.95, HOT); box(-0.9, 0.62, 0.9, 0.68, HOT + DIM);
      r.poly([T(-0.82, 0.95), T(0.82, 0.95), T(0.62, 1.42), T(-0.62, 1.42)], HOT);
      r.poly([T(-0.7, 0.99), T(0.7, 0.99), T(0.55, 1.36), T(-0.55, 1.36)], DARK);
      box(0.25, 1.08, 0.38, 1.3, LMID + DIM); box(-0.3, 1.42, 0.3, 1.62, BRIGHT);
      box(-0.86, 0.72, -0.62, 0.86, BRIGHT); box(0.62, 0.72, 0.86, 0.86, BRIGHT);
    } else { // the tuk-tuk from behind: the wheels at the corners, the open back of the canopy with its riders
      box(-0.72, 0, -0.52, 0.48, BLACK, false); box(0.52, 0, 0.72, 0.48, BLACK, false);
      box(-0.74, 0.32, 0.74, 1.0, MID); box(-0.74, 0.86, 0.74, 0.94, LMID);
      box(-0.68, 0.45, -0.5, 0.6, HOT); box(0.5, 0.45, 0.68, 0.6, HOT); box(-0.5, 0.2, -0.38, 0.3, DARK);
      box(-0.74, 1.0, -0.66, 1.64, DARK); box(0.66, 1.0, 0.74, 1.64, DARK);
      for (const hx of [-0.32, 0.32]) { box(hx - 0.2, 1.0, hx + 0.2, 1.26, FIG); const [qx, qy] = T(hx, 1.38); r.disc(qx, qy, 0.14 * k, FIG); }
      const [ax, ay] = T(0.45, 1.2), [hx, hy] = T(1.12, 1.3 + 0.08 * arm);
      r.stroke(ax, ay, hx, hy, 0.09 * k, FIG); r.disc(hx, hy, 0.07 * k, FIG);
      box(-0.84, 1.62, 0.84, 1.84, HOT);
      for (let q = -0.78, j = 0; q < 0.8; q += 0.13, j++) box(q, 1.6, q + 0.06, 1.66, (j + Math.floor(t * 6)) % 2 ? COOL : BRIGHT);
    }
    if (w.horn > 0) { // the horn: rings going out from the roof
      const [hx, hy] = T(0, bike ? 1.8 : 1.95), a = 0.3 - w.horn;
      for (let j = 0; j < 2; j++) { const R = (0.3 + a * 7 + j * 0.35) * k; for (let q = 0.25; q < Math.PI - 0.2; q += 0.18) r.rect(hx + Math.cos(q) * R, hy - Math.sin(q) * R, Math.max(1, u), Math.max(1, u), BRIGHT); }
    }
    targets.push({ x: bx - 0.9 * k, y: by - 1.95 * k, w: 1.8 * k, h: 1.95 * k });
    for (const c of w.traffic) if (c.Z < RIDE_Z) car(c);
    for (const p of w.puffs) { const kk = proj(C, p.X - cx, p.Y, p.Z); puff(r, PX, PY, Math.min(0.12 * N, p.R * kk), p.life > 0.5 ? LMID + DIM : MID + DIM); }
  },
};

// ---------------------------------------------------------------------------------------------- skytrain
// From a walkway over a jammed road: the elevated line on its pillars (their sides drawn toward the vanishing
// point, the deck's underside going away overhead), the train's lit carriages gliding past one a beat, the road
// below in stop-and-go: every car follows the one ahead, the jam is too dense to hold still, so the stops run back
// along it in waves of brake lights (a kick taps somebody's brakes); motorbikes filter between the lanes, neon on
// the buildings behind. Kinds: what the jam is made of (buses, taxis, motorbikes). A section change brings the
// rain or takes it away; a drop sends the train flying past and the jam clears for a moment.
const JAM_W = { buses: [1, 2, 3], taxis: [3, 2, 1], bikes: [2, 2, 2] };
const JAM_MIX = { buses: { bus: 3, sedan: 2, van: 1, taxi: 1, pickup: 1 }, taxis: { taxi: 4, sedan: 2, van: 1, pickup: 1, bus: 1 }, bikes: { sedan: 3, taxi: 2, pickup: 2, van: 1, bus: 1 } };
const CAR_L = 20; // a carriage, metres
const JAM_GAP = 3.4; // the mean gap a lane is laid out with, metres: too dense for the flow to hold steady, not so dense it stands still

function jamCar(rnd, kind) {
  const k = pickW(rnd, Object.keys(JAM_MIX[kind]), (q) => JAM_MIX[kind][q]);
  return { kind: k, s: 0, v: 0, acc: 0, gap: 9, hold: 0, roll: 0, col: k === 'taxi' ? (rnd() < 0.6 ? HOT : COOL) : pick(rnd, [MID, LMID, DARK, MID + DIM, COOL + DIM]) };
}
// one step of a lane where every car follows the one ahead (the optimal-velocity model): the speed it wants grows
// with the gap in front and it gets there in 0.8 s; this dense, the flow is unstable and the stops travel backward
function jamStep(lane, dt, vmax, g0, gw) {
  const cs = lane.cars, n = cs.length, Lr = lane.L;
  for (let i = 0; i < n; i++) {
    const c = cs[i], q = cs[(i + 1) % n];
    c.gap = q.s - c.s + (i === n - 1 ? Lr : 0) - (CARS[c.kind].L + CARS[q.kind].L) / 2;
    c.acc = c.hold > 0 ? -6 : (vmax * clamp((c.gap - g0) / gw) - c.v) / 0.8;
  }
  for (const c of cs) {
    c.v = Math.max(0, c.v + c.acc * dt);
    if (c.gap < 1) c.v = Math.min(c.v, Math.max(0, c.gap - 0.2) * 2); // never into the one ahead
    c.s += c.v * dt; c.hold -= dt; c.roll += (c.v * dt) / CARS[c.kind].R;
  }
  if (cs[n - 1].s >= Lr) { const c = cs.pop(); c.s -= Lr; cs.unshift(c); }
}

const skytrain = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), kind = rollW(rnd, JAM_W, band);
    Object.assign(w, { kind, rain: false, drops: [], train: null, clear: 0, lastTrain: -99, beats: 0,
      lanes: [{ Z: 16, dir: 1, L: 0, cars: [] }, { Z: 10, dir: -1, L: 0, cars: [] }],
      bikes: Array.from({ length: 4 }, (_, i) => ({ X: -15 + i * 8, dir: i % 2 ? -1 : 1, v: 6 + rnd() * 3, roll: 0, on: i < 2 || kind === 'bikes' })),
      blds: [], signs: [], sky: Array.from({ length: 16 }, (_, i) => [i / 16 + (rnd() - 0.5) * 0.02, 0.05, 0.12 + rnd() * 0.22]) });
    // a lane is a ring the cars go round, laid bumper to bumper with the gaps a little uneven, as long as it takes to
    // leave JAM_GAP between them on the mean (always longer than the stretch in view, so the wrap is never seen)
    for (const ln of w.lanes) {
      const n = ln.Z > 12 ? 8 : 6, gaps = [];
      for (let i = 0; i < n; i++) { ln.cars.push(jamCar(rnd, kind)); gaps.push(0.6 + 0.8 * rnd()); }
      const gs = gaps.reduce((a, b) => a + b, 0);
      let s = 0;
      ln.cars.forEach((c, i) => { const L = CARS[c.kind].L; c.s = s + L / 2; c.gap = (gaps[i] / gs) * n * JAM_GAP; s += L + c.gap; });
      ln.L = s;
    }
    for (let X = -26; X < 26;) {
      const bw = 7 + rnd() * 9;
      w.blds.push({ X, w: bw - 0.8, h: 12 + rnd() * 30, seed: (rnd() * 1e4) | 0 });
      for (let j = 0; j < 1 + (rnd() < 0.6); j++) w.signs.push({ X: X + 0.5 + rnd() * (bw - 3.5), Y: 3 + rnd() * 6, w: 1.2 + rnd() * 1.6, h: 2 + rnd() * 3, kind: pick(rnd, NEON), col: rnd() < 0.5 ? HOT : COOL, seed: (rnd() * 1e4) | 0, flick: 0 });
      X += bw;
    }
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = bpsOf(f);
    const C = { vx: 0.5 * N, hz: 0.4 * N, F: 0.55 * N, H: 8 };
    const Xof = (ln, c) => (ln.dir > 0 ? c.s - ln.L / 2 : ln.L / 2 - c.s), half = (Z) => (0.5 * N) / (C.F / Z) + 6; // the half-width in view, and a margin
    const newTrain = (fly) => { const dir = rnd() < 0.5 ? 1 : -1; w.train = { dir, X: -dir * 13, X0: -dir * 13, n: 3, c0: f.beat.count, p0: f.beat.phase, lock: beatLocked(f), fly }; };
    for (const h of hits) {
      if (isLow(h)) for (const ln of w.lanes) { const near = ln.cars.filter((c) => c.v > 1 && Math.abs(Xof(ln, c)) < half(ln.Z) - 6); if (near.length) pick(rnd, near).hold = 0.25 + 0.25 * h.strength; }
      else if (h.kind === 'snare') for (let k = 0; k < 3; k++) pick(rnd, w.signs).flick = 0.05 + rnd() * 0.1;
      else if (h.kind === 'hat') pick(rnd, w.signs).flick = 0.06;
      if (isTonal(h) && h.kind !== 'hat') pick(rnd, w.signs).col = h.pc % 2 ? COOL : HOT;
    }
    if (f.section === 'change') { // the weather turns; the cars still off screen come back as the new mix, each where it fits its gaps
      w.rain = !w.rain;
      w.kind = rollW(rnd, JAM_W, band);
      for (const ln of w.lanes) for (let i = 0; i < ln.cars.length; i++) {
        const c = ln.cars[i], back = ln.cars[(i + ln.cars.length - 1) % ln.cars.length];
        if (Math.abs(Xof(ln, c)) <= half(ln.Z)) continue;
        const nc = jamCar(rnd, w.kind), dL = (CARS[nc.kind].L - CARS[c.kind].L) / 2;
        if (dL <= Math.min(c.gap, back.gap) - 1) Object.assign(c, nc, { s: c.s, v: c.v, roll: c.roll, gap: c.gap - dL });
      }
    }
    if (f.section === 'drop') { w.clear = 5; if (w.train) w.train.fly = true; else newTrain(true); s.shake = Math.max(s.shake, 0.35); }
    if (beatTick(w, f, dt)) { w.beats++; if (!w.train && w.beats - w.lastTrain >= 8) newTrain(false); }
    // the train: locked to the beat it came in on, a carriage a beat; flying, much faster
    const T = w.train;
    if (T) {
      if (T.fly) T.X += T.dir * 70 * dt;
      else if (T.lock && beatLocked(f)) T.X = T.X0 + T.dir * CAR_L * (f.beat.count - T.c0 + f.beat.phase - T.p0);
      else T.X += T.dir * CAR_L * bps * dt;
      if ((T.X - T.dir * T.n * CAR_L) * T.dir > 14) { w.train = null; w.lastTrain = w.beats; }
    }
    w.clear -= dt;
    const vmax = 3 + 9 * energy(f), clr = w.clear > 0, steps = Math.max(1, Math.ceil(dt / 0.04));
    for (const ln of w.lanes) for (let k = 0; k < steps; k++) jamStep(ln, dt / steps, clr ? vmax * 1.4 : vmax, clr ? 0.5 : 2, clr ? 1.5 : 6);
    for (const b of w.bikes) { const v = b.v * (0.6 + 0.6 * energy(f)); b.X += b.dir * v * dt; b.roll += (v * dt) / 0.3; if (Math.abs(b.X) > 16) { b.X = -b.dir * 16; b.on = w.kind === 'bikes' || w.bikes.indexOf(b) < 2; } } // the wheels roll at the speed they go

    // the city behind: far towers, a row of buildings with lit windows and neon, the road in its bands
    skyline(r, N, u, C.hz - 0.03 * N, w.sky, DARK + DIM, MID + DIM, 0.15);
    const kb = C.F / 21, yb = C.hz + C.H * kb;
    for (const b of w.blds) {
      const x0 = C.vx + b.X * kb, bw = b.w * kb, top = C.hz + (C.H - b.h) * kb;
      if (x0 > N || x0 + bw < 0) continue;
      r.rect(x0, top, bw, yb - top, DARK);
      for (let fl = 0, y = top + 2 * kb; y < yb - 3 * kb; y += 3 * kb, fl++) for (let i = 0; i < Math.floor(b.w / 2.2); i++) if (hash(b.seed + i, fl) < 0.32) r.rect(x0 + (0.6 + i * 2.2) * kb, y, Math.max(1, kb * 1.2), Math.max(1, kb * 1.4), hash(i, fl + b.seed) < 0.2 ? BRIGHT + DIM : LMID + DIM);
    }
    for (const sg of w.signs) { sg.flick -= dt; neon(r, C.vx + sg.X * kb, C.hz + (C.H - sg.Y - sg.h) * kb, sg.w * kb, sg.h * kb, sg.kind, sg.col, sg.seed, u, sg.flick <= 0); }
    const yz = (Z) => C.hz + (C.H * C.F) / Z;
    r.rect(0, yz(21), N, yz(18) - yz(21), MID + DIM);
    r.rect(0, yz(18), N, yz(14.2) - yz(18), DARK + DIM);
    r.rect(0, yz(14.2), N, yz(11.8) - yz(14.2), MID + DIM);
    r.rect(0, yz(11.8), N, yz(8) - yz(11.8), DARK + DIM);
    r.rect(0, yz(8), N, N - yz(8), MID + DIM);
    for (const Z of [18, 14.2, 11.8, 8]) r.rect(0, yz(Z), N, 1, LMID + DIM);
    // a lane of the jam, its brake lights; on a wet road every light hangs a streak under it
    const lane = (ln) => {
      const k = C.F / ln.Z, g = yz(ln.Z);
      for (const c of ln.cars) {
        const X = Xof(ln, c), x = C.vx + X * k, len = CARS[c.kind].L * k;
        if (x + len < 0 || x - len > N) continue;
        const brake = c.acc < -0.6 || c.v < 0.2;
        carSide(r, x, g, k, ln.dir, c.kind, c.col, c.roll, brake);
        if (w.rain) { r.rect(x - ln.dir * len / 2, g, 1, 0.05 * N, brake ? HOT : HOT + DIM); r.rect(x + ln.dir * len / 2, g, 1, 0.06 * N, LMID + DIM); }
      }
    };
    lane(w.lanes[0]);
    // the pillars: the front face and, off to one side, the side face running back toward the vanishing point
    for (let X = -20; X <= 20; X += 10) {
      proj(C, X - 0.9, 9, 12.2); const xl = PX, yt = PY;
      proj(C, X + 0.9, 0, 12.2); const xr = PX, ybt = PY;
      if (xr < 0 || xl > N) continue;
      if (Math.abs(X) > 0.9) { const sx = X > 0 ? X - 0.9 : X + 0.9; quad3(r, C, sx, 0, 12.2, sx, 9, 12.2, sx, 9, 13.8, sx, 0, 13.8, DARK); }
      r.rect(xl, yt, xr - xl, ybt - yt, MID);
      proj(C, X - 1.6, 9, 12.2); const cl = PX, ct = PY; proj(C, X + 1.6, 8.2, 12.2);
      r.rect(cl, ct, PX - cl, PY - ct, LMID + DIM);
    }
    const kk = C.F / 11.3, gb = yz(11.3);
    for (const b of w.bikes) { // filtering between the lanes, wheels rolling, the rider bent to the bars
      if (!b.on) continue;
      const x = C.vx + b.X * kk;
      wheel(r, x - b.dir * 0.7 * kk, gb - 0.3 * kk, 0.3 * kk, b.roll * b.dir); wheel(r, x + b.dir * 0.7 * kk, gb - 0.3 * kk, 0.3 * kk, b.roll * b.dir);
      r.poly([[x - b.dir * 0.6 * kk, gb - 0.55 * kk], [x + b.dir * 0.6 * kk, gb - 0.7 * kk], [x + b.dir * 0.2 * kk, gb - 0.9 * kk]], DARK);
      r.stroke(x - b.dir * 0.2 * kk, gb - 0.9 * kk, x + b.dir * 0.3 * kk, gb - 1.5 * kk, Math.max(1, 0.35 * kk), FIG);
      r.disc(x + b.dir * 0.35 * kk, gb - 1.68 * kk, 0.17 * kk, LMID);
      r.rect(x + b.dir * 0.9 * kk - 1, gb - 0.75 * kk, Math.max(1, 0.15 * kk), Math.max(1, 0.15 * kk), BRIGHT);
    }
    // the deck overhead: its underside going away, the train above it, then the face and the parapet in front
    quad3(r, C, -60, 9, 11, 60, 9, 11, 60, 9, 15, -60, 9, 15, DARK + DIM);
    if (T) {
      const k = C.F / 12, y0 = C.hz + (C.H - 14.9) * k, y1 = C.hz + (C.H - 11.2) * k, hh = y1 - y0;
      for (let i = 0; i < T.n; i++) {
        const Xa = T.X - T.dir * i * CAR_L, Xb = Xa - T.dir * (CAR_L - 0.8), xa = C.vx + Xa * k, xb = C.vx + Xb * k, lo = Math.min(xa, xb), hi = Math.max(xa, xb);
        if (hi < 0 || lo > N) continue;
        const nose = i === 0 ? 2.2 * k : 0, bl = T.dir > 0 ? lo : lo + nose, br = T.dir > 0 ? hi - nose : hi;
        r.rect(bl, y0, br - bl, hh, LMID);
        r.rect(bl, y0, br - bl, hh * 0.08, MID);
        r.rect(bl, y0 + hh * 0.72, br - bl, hh * 0.1, COOL);
        for (let m = 0.9; m < CAR_L - 1.6; m += 1.75) { // the windows lit, a standing rider in some
          const xm = T.dir > 0 ? xb + m * k : xb - m * k - 1.1 * k;
          if (xm < bl - 1 || xm + 1.1 * k > br + 1) continue;
          r.rect(xm, y0 + hh * 0.2, 1.1 * k, hh * 0.38, BRIGHT);
          if (hash(i * 31 + Math.round(m * 4), 7) < 0.35) r.disc(xm + 0.55 * k, y0 + hh * 0.5, 0.22 * k, DARK);
        }
        for (const m of [3.5, 8.6, 13.7]) { const xm = T.dir > 0 ? xb + m * k : xb - m * k - 1.3 * k; r.rect(xm, y0 + hh * 0.14, 1.3 * k, hh * 0.8, MID + DIM); }
        if (i === 0) { // the nose: a sloped screen, the headlights
          const xe = T.dir > 0 ? br : bl, xh = T.dir > 0 ? hi : lo;
          r.poly([[xe, y0], [xe, y1], [xh, y1], [xh, y0 + hh * 0.45]], LMID);
          r.poly([[xe, y0 + hh * 0.08], [xh - T.dir * 0.2 * k, y0 + hh * 0.45], [xe, y0 + hh * 0.45]], DARK);
          r.rect(xh - T.dir * 0.5 * k - 1, y0 + hh * 0.7, Math.max(1, 0.4 * k), Math.max(1, 0.3 * k), BRIGHT);
          targets.push({ x: lo, y: y0, w: hi - lo, h: hh });
        }
      }
    }
    proj(C, 0, 11.6, 11); const pt = PY; proj(C, 0, 10.6, 11); const pm = PY; proj(C, 0, 9, 11);
    r.rect(0, pt, N, pm - pt, LMID + DIM);
    r.rect(0, pm, N, PY - pm, MID);
    r.rect(0, pt, N, 1, LMID);
    for (let X = -30; X <= 30; X += 5) { const x = C.vx + X * (C.F / 11); if (x > 0 && x < N) r.rect(x, pt - 2 * u, Math.max(1, u), 2 * u, (X / 5 + w.beats) % 2 ? BRIGHT : MID); }
    lane(w.lanes[1]);
    if (w.rain) rainfall(W, w.drops, Math.round(N * (0.6 + 0.8 * f.level)), N * 1.6, -N * 0.25, 0.35 * N, N, LMID + DIM);
  },
};

// ---------------------------------------------------------------------------------------------- chinatown
// Down a narrow street at night, walled in by signs: blades of light stacked up both sides, facing us and going
// away in perspective, flickering with the hats (and more of them blinking as the treble climbs); strings of
// lanterns across the street swinging as pendulums in the gusts (a snare is a gust, the beat a push); stalls with
// steam rising and slowing, a crowd walking both ways with a step on every beat, a tuk-tuk crossing at the corner
// on a kick. Kinds: a food night (every stall open), a crowd night, a festival (every lantern lit). A drop: every
// sign blinks in a running sequence down the street.
const NIGHT_W = { food: [3, 2, 1], crowd: [1, 2, 3], festival: [2, 2, 2] };
const STRINGS_Z = [5, 9, 19, 27, 38];

function townWalker(rnd, Z, dir) {
  return { X: (rnd() - 0.5) * 8.4, Z, dir, h: 1.5 + rnd() * 0.3, ph: rnd() * TAU, ph0: rnd() < 0.5 ? 0 : Math.PI, col: pick(rnd, [FIG, DARK, MID]), shirt: pick(rnd, [HOT, COOL, LMID, FIG, BRIGHT + DIM]) };
}

const chinatown = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), signs = [], lanterns = [], stalls = [];
    for (const side of [-1, 1])
      for (let Z = 3.5; Z < 70; Z += 2.6 + rnd() * 1.4) {
        if (Z > 12.6 && Z < 16.4) continue; // the corner
        for (let Y = 3 + rnd() * 1.5, j = 0; j < 3 && Y < 13; j++) {
          const h = 1.5 + rnd() * 2.5;
          if (rnd() < 0.85) signs.push({ side, Z, Y, h, out: 0.9 + rnd() * 1.3, kind: pick(rnd, NEON), col: pick(rnd, [HOT, HOT, COOL, BRIGHT]), seed: (rnd() * 1e4) | 0, flick: 0 });
          Y += h + 0.3;
        }
      }
    signs.sort((p, q) => q.Z - p.Z);
    signs.forEach((sg, i) => { sg.rank = signs.length - 1 - i; });
    for (const Z of STRINGS_Z) for (let i = 0; i < 5; i++) lanterns.push({ Z, X: -3.2 + i * 1.6, L: 0.45 + rnd() * 0.15, th: 0, om: 0, lit: Z < 20 || rnd() < 0.5 });
    for (let i = 0; i < 6; i++) stalls.push({ Z: 4.5 + i * 5.5 + rnd() * 1.5, side: i % 2 ? 1 : -1, open: true, bulb: rnd() * TAU });
    Object.assign(w, { kind: rollW(rnd, NIGHT_W, band), signs, lanterns, stalls, walkers: [], steam: [], tuk: null, tukCool: 0, chase: 0 });
    for (let i = 0; i < 18; i++) w.walkers.push(townWalker(rnd, 0.7 + rnd() * 65, rnd() < 0.5 ? 1 : -1));
    for (const st of w.stalls) st.open = w.kind === 'food' || rnd() < 0.5;
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = bpsOf(f);
    const C = { vx: 0.5 * N, hz: 0.5 * N, F: 0.55 * N, H: 2.4 };
    let gust = 0;
    for (const h of hits) {
      if (h.kind === 'hat') pick(rnd, w.signs).flick = 0.05 + rnd() * 0.1;
      else if (h.kind === 'snare') gust += 1.5 * h.strength; // a gust down the street
      else if (isLow(h)) {
        const st = pick(rnd, w.stalls);
        if (st.open) for (let k = 0; k < 6; k++) w.steam.push({ X: st.side * 3.3 + (rnd() - 0.5) * 0.2, Y: 1.4, Z: st.Z, vX: (rnd() - 0.5) * 0.3, vY: 0.9 + rnd() * 0.5, R: 0.12, life: 2 });
        if (!w.tuk && w.tukCool <= 0) { const dir = rnd() < 0.5 ? 1 : -1; w.tuk = { X: -dir * 9, dir, v: 5 + 2 * h.strength, roll: 0, roof: pick(rnd, [HOT, COOL]) }; w.tukCool = 3; }
      }
      if (isTonal(h) && h.kind !== 'hat') pick(rnd, w.signs).col = [HOT, COOL, BRIGHT][h.pc % 3];
    }
    if (f.section === 'change') {
      w.kind = rollW(rnd, NIGHT_W, band);
      for (const st of w.stalls) st.open = w.kind === 'food' || rnd() < 0.5;
      for (const ln of w.lanterns) ln.lit = w.kind === 'festival' || ln.Z < 20 || rnd() < 0.5;
    }
    if (f.section === 'drop') { w.chase = 4; gust += 3; s.shake = Math.max(s.shake, 0.25); }
    w.chase -= dt; w.tukCool -= dt;
    const beat = beatTick(w, f, dt);
    // the lanterns: pendulums about their hooks, pushed by the wind, a gust, the beat
    const wind = 0.8 * f.rel.midDrive * Math.sin(t * 1.3);
    for (const ln of w.lanterns) {
      ln.om += (-(G / ln.L) * Math.sin(ln.th) - 0.7 * ln.om + wind * (1 + 0.3 * Math.sin(ln.X + t))) * dt + gust * 0.6 * (0.6 + 0.4 * hash(ln.X * 10 | 0, ln.Z)) + (beat ? 0.25 : 0);
      ln.th += ln.om * dt;
    }
    // the crowd: a step a beat, a stride of 0.42 of the height, so the walking speed is the tempo's; they come in from
    // under the bottom of the picture or from the far end of the street, a speck, and leave the same ways
    const want = 2 * (w.kind === 'crowd' ? 14 : w.kind === 'festival' ? 10 : 7), lockPh = beatLocked(f) ? Math.PI * (f.beat.count + f.beat.phase) : null;
    for (const p of w.walkers) {
      const stride = 0.42 * p.h;
      p.Z += p.dir * stride * bps * dt;
      p.ph = lockPh !== null ? lockPh + p.ph0 : p.ph + Math.PI * bps * dt; // with a lock, a foot comes down on every beat
      if ((p.dir < 0 && p.Z < 0.7) || (p.dir > 0 && p.Z > 70)) p.dead = true;
    }
    w.walkers = w.walkers.filter((p) => !p.dead);
    while (w.walkers.length < want) { const dir = rnd() < 0.5 ? 1 : -1; w.walkers.push(townWalker(rnd, dir > 0 ? 0.7 : 62 + rnd() * 8, dir)); }
    const far = w.walkers.findIndex((p) => p.Z > 55);
    if (w.walkers.length > want + 2 && far >= 0) w.walkers.splice(far, 1); // too many: one leaves at the far end, a speck
    if (w.tuk) { const T = w.tuk; T.X += T.dir * T.v * dt; T.roll += (T.v * dt) / 0.24; if (T.X * T.dir > 10) w.tuk = null; }
    for (const st of w.stalls) if (st.open && rnd() < dt * (2 + 5 * f.level)) w.steam.push({ X: st.side * 3.3 + (rnd() - 0.5) * 0.2, Y: 1.4, Z: st.Z, vX: (rnd() - 0.5) * 0.2, vY: 0.7 + rnd() * 0.3, R: 0.08, life: 1.6 });
    for (const p of w.steam) { p.vY = follow(p.vY, 0.08, dt, 0.8); p.X += (p.vX + wind * 0.3) * dt; p.Y += p.vY * dt; p.R += 0.18 * dt; p.life -= dt; } // rising, slowing, spreading
    w.steam = w.steam.filter((p) => p.life > 0);
    if (w.steam.length > 120) w.steam.splice(0, w.steam.length - 120);

    // the canyon: the road, the walks, the two walls with the corner open, the shop fronts lit at street level
    r.rect(0, C.hz, N, N - C.hz, DARK + DIM);
    r.disc(C.vx, C.hz - 0.02 * N, 0.05 * N, MID + DIM);
    for (const sd of [-1, 1]) {
      quad3(r, C, sd * 3 - 0, 0.12, 1, sd * 5, 0.12, 1, sd * 5, 0.12, 90, sd * 3, 0.12, 90, MID + DIM);
      quad3(r, C, sd * 5, 0, 13, sd * 14, 0, 13, sd * 14, 0, 16.4, sd * 5, 0, 16.4, DARK + DIM); // the cross street
      quad3(r, C, sd * 5, 0, 16.4, sd * 14, 0, 16.4, sd * 14, 22, 16.4, sd * 5, 22, 16.4, DARK + DIM); // the far corner's face
      for (const [z0, z1] of [[1, 13], [16.4, 90]]) quad3(r, C, sd * 5, 0, z0, sd * 5, 22, z0, sd * 5, 22, z1, sd * 5, 0, z1, DARK);
      for (let Z = 2; Z < 70; Z += 3) { if (Z > 11 && Z < 16.4) continue; quad3(r, C, sd * 5, 0, Z + 0.3, sd * 5, 2.6, Z + 0.3, sd * 5, 2.6, Z + 2.7, sd * 5, 0, Z + 2.7, hash(Z, sd + 5) < 0.6 ? LMID + DIM : MID + DIM); }
    }
    // the signs, far to near: a few blink as the treble climbs; a drop runs a blink down the whole street
    const blinkP = 0.12 * clamp(f.rel.trebDrive - 0.3), tick = Math.floor(t * 10), run = Math.floor((4 - w.chase) * 14);
    for (const sg of w.signs) {
      sg.flick -= dt;
      let on = sg.flick <= 0 && hash(sg.seed, tick) >= blinkP;
      if (w.chase > 0) on = ((run - sg.rank) % 10 + 10) % 10 > 2;
      const k = proj(C, sg.side * 5, sg.Y + sg.h, sg.Z), xo = PX, yt = PY;
      proj(C, sg.side * (5 - sg.out), sg.Y, sg.Z);
      if (k * sg.out < 1 || PY < 0) continue;
      neon(r, Math.min(xo, PX), yt, Math.abs(PX - xo), PY - yt, sg.kind, sg.col, sg.seed, u, on);
    }
    // the lantern strings: a sagging line wall to wall, a lantern hanging from each hook at its swing angle
    for (const Z of STRINGS_Z) {
      let lx = 0, ly = 0;
      for (let i = 0; i <= 10; i++) { const X = -5 + i, Y = 6.4 - 0.6 * (1 - (X / 5) ** 2); proj(C, X, Y, Z); if (i) r.line(lx, ly, PX, PY, MID); lx = PX; ly = PY; }
    }
    for (let i = w.lanterns.length - 1; i >= 0; i--) {
      const ln = w.lanterns[i], Yh = 6.4 - 0.6 * (1 - (ln.X / 5) ** 2), cxw = ln.X + Math.sin(ln.th) * ln.L, cyw = Yh - Math.cos(ln.th) * ln.L;
      const k = proj(C, ln.X, Yh, ln.Z), hx = PX, hy = PY;
      proj(C, cxw, cyw, ln.Z);
      r.line(hx, hy, PX, PY, MID);
      const rw = 0.2 * k, rh = 0.24 * k;
      r.rect(PX - rw, PY - rh * 0.6, 2 * rw, rh * 1.2, ln.lit ? HOT : DARK + DIM);
      r.disc(PX, PY, rw * 1.05, ln.lit ? HOT : DARK + DIM);
      if (ln.lit && rw > 1.5) r.disc(PX, PY, rw * 0.45, BRIGHT);
      r.rect(PX - rw * 0.6, PY - rh, rw * 1.2, Math.max(1, rh * 0.2), DARK);
      r.rect(PX - rw * 0.6, PY + rh * 0.8, rw * 1.2, Math.max(1, rh * 0.2), DARK);
      r.line(PX, PY + rh, PX - Math.sin(ln.th) * rh, PY + rh * 1.8, LMID);
    }
    // the street, far to near: stalls with their vendors, the crowd, the crossing tuk-tuk, the steam at its stall's depth
    const items = [];
    for (const st of w.stalls) items.push([st.Z, 0, st]);
    for (const p of w.walkers) items.push([p.Z, 1, p]);
    if (w.tuk) items.push([14.6, 2, w.tuk]);
    for (const p of w.steam) items.push([p.Z, 3, p]);
    items.sort((p, q) => q[0] - p[0]);
    for (const [Z, kind, o] of items) {
      if (kind === 3) { const k = proj(C, o.X, o.Y, o.Z); puff(r, PX, PY, Math.max(0.6, o.R * k), o.life > 0.8 ? LMID + DIM : MID + DIM); continue; }
      const k = C.F / Z, g = C.hz + C.H * k;
      if (kind === 0) {
        const xs = C.vx + o.side * 3.75 * k, hw = 0.7 * k;
        walker(r, C.vx + o.side * 4.55 * k, g, 1.6 * k, FIG, 0, -o.side, {}); // the vendor, standing
        r.rect(xs - hw, g - 0.95 * k, 2 * hw, 0.85 * k, MID);
        r.rect(xs - hw, g - 0.95 * k, 2 * hw, Math.max(1, 0.06 * k), LMID);
        r.frame(Math.round(xs - hw), Math.round(g - 1.45 * k), Math.round(2 * hw), Math.round(0.5 * k), LMID + DIM);
        r.rect(xs - o.side * 0.45 * k - 0.18 * k, g - 1.32 * k, 0.36 * k, 0.32 * k, DARK); // the pot
        wheel(r, xs - hw * 0.6, g - 0.12 * k, 0.12 * k, 0); wheel(r, xs + hw * 0.6, g - 0.12 * k, 0.12 * k, 0);
        if (o.open) { const sw = Math.sin(t * 2 + o.bulb) * 0.08 * k; r.line(xs, g - 2.4 * k, xs + sw, g - 2.1 * k, MID); r.disc(xs + sw, g - 2.05 * k, Math.max(1, 0.08 * k), BRIGHT); }
      } else if (kind === 1) {
        const x = C.vx + o.X * k;
        if (x < -0.2 * N || x > 1.2 * N) continue;
        walkerFront(r, x, g, o.h * k, o.col, o.ph, o.shirt);
      } else { // round the corner it is hidden by the near wall: only what shows past the corner is kept
        const ya = Math.max(0, Math.floor(g - 2 * k)), yb = Math.min(N, Math.ceil(g + 1)), keep = r.buf.slice(ya * N, yb * N), xl = C.vx - (5 * C.F) / 13, xr = C.vx + (5 * C.F) / 13;
        tukSide(r, C.vx + o.X * k, g, k, o.dir, o.roll, { col: MID, roof: o.roof, pax: 1, arm: Math.sin(t * 5), trim: Math.floor(t * 6) });
        for (let y = ya; y < yb; y++) for (let x = 0; x < N; x++) if (x < xl || x > xr) r.buf[y * N + x] = keep[(y - ya) * N + x];
        if (Math.abs(o.X) < 5.6) targets.push({ x: C.vx + (o.X - 1.4) * k, y: g - 1.8 * k, w: 2.8 * k, h: 1.8 * k });
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------- riverboat
// The river at dusk from a terrace above the water: the far bank's towers and a temple spire across the river, the
// sky going from the sunset to night over the sections while the spire's floodlights take over, the whole bank
// mirrored in the water and broken by the ripples. Boats cross with their wakes: every crest leaves the stern and
// runs out sideways at a fixed fraction of the boat's speed, so the wake opens at the Kelvin angle and fades; a
// long-tail roars past on a kick throwing a rooster tail off its propeller on parabolas, an express boat comes on
// the bar, a tug drags its barges. Kinds: what the bar brings (barges, express boats, long-tails). A drop: the bank
// lights come on, each one hanging a broken streak down the water.
const RIVER_W = { barge: [3, 2, 1], express: [2, 3, 2], longtail: [1, 2, 3] };
const BOATS = { express: { L: 28, V: 8, h: 3.8 }, longtail: { L: 11, V: 15, h: 2.5 }, barge: { L: 66, V: 2.5, h: 4.6 } };
const KELVIN = Math.tan((19.47 * Math.PI) / 180); // a wake's half-angle, whatever the speed

const riverboat = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, RIVER_W, band), dusk: rnd() * 0.2, lights: false, boats: [], crests: [], spray: [], glints: [], beats: 0, lastBoat: -99, tailCool: 0,
      towers: Array.from({ length: 16 }, () => { let X = -170 + rnd() * 340; if (Math.abs(X + 46) < 40) X += 90; return [X, 12 + rnd() * 22, 20 + rnd() * (Math.abs(X + 46) < 70 ? 25 : 55), (rnd() * 1e4) | 0]; }), stars: Array.from({ length: 40 }, () => [rnd(), rnd() * 0.32]) });
    w.duskT = w.dusk;
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a);
    const C = { vx: 0.5 * N, hz: 0.42 * N, F: 1.4 * N, H: 12 }, ZB = 300, wl = C.hz + (C.H * C.F) / ZB; // the far bank's waterline
    const spawn = (kind) => {
      const Z = kind === 'barge' ? 100 + rnd() * 30 : kind === 'longtail' ? 40 + rnd() * 30 : 50 + rnd() * 40, dir = rnd() < 0.5 ? 1 : -1, half = (0.5 * N) / (C.F / Z), L = BOATS[kind].L;
      w.boats.push({ kind, Z, dir, X: -dir * (half + L / 2 + 2), V: BOATS[kind].V * (0.85 + rnd() * 0.3), v: 0, emit: 0, horn: 0 });
      w.boats.sort((p, q) => q.Z - p.Z);
    };
    for (const h of hits) {
      if (isLow(h) && w.tailCool <= 0 && (w.kind === 'longtail' || h.strength > 0.8)) { spawn('longtail'); w.tailCool = w.kind === 'longtail' ? 2.5 : 6; }
      else if (h.kind === 'hat') for (let k = 0; k < 3; k++) w.glints.push({ x: rnd() * N, y: wl + 2 + rnd() * (N - wl - 2), life: 0.15 });
      else if (h.kind === 'snare') for (const b of w.boats) b.horn = 0.15;
    }
    w.tailCool -= dt;
    if (f.section === 'change') { w.kind = rollW(rnd, RIVER_W, band); w.duskT = Math.min(1, w.duskT + 0.25); } // the light goes, a section at a time
    if (f.section === 'drop') { w.lights = true; w.duskT = Math.max(w.duskT, 0.85); s.shake = Math.max(s.shake, 0.15); }
    w.dusk = follow(w.dusk, w.duskT, dt, 3);
    if (beatTick(w, f, dt)) { w.beats++; if (w.beats - w.lastBoat >= 8 && w.boats.length < 3 && !(w.kind === 'barge' && w.boats.some((b) => b.kind === 'barge'))) { spawn(w.kind === 'longtail' ? 'express' : w.kind); w.lastBoat = w.beats; } }
    const pace = 0.7 + 0.6 * energy(f);
    for (const b of w.boats) {
      b.v = b.V * (b.kind === 'barge' ? 1 : pace);
      b.X += b.dir * b.v * dt;
      b.horn -= dt;
      b.emit += dt;
      const stern = b.X - (b.dir * BOATS[b.kind].L) / 2 + (b.kind === 'barge' ? b.dir * 56 : 0); // a tug's wake is the tug's
      while (b.emit > 0.1) { b.emit -= 0.1; for (const dz of [-1, 1]) w.crests.push({ X: stern, Z: b.Z, dz, c: KELVIN * b.v, age: 0, amp: b.kind === 'longtail' ? 1 : b.kind === 'express' ? 0.85 : 0.45 }); }
      if (b.kind === 'longtail') { // the rooster tail: water thrown back and up off the propeller
        const px = b.X - b.dir * (BOATS.longtail.L / 2 + 3.4);
        for (let k = 0, n = Math.round(60 * dt); k < n; k++) { const U = 9 + 5 * f.rel.bassDrive + rnd() * 3, al = 0.55 + rnd() * 0.35; w.spray.push({ X: px, Y: 0.1, Z: b.Z + (rnd() - 0.5) * 0.6, vX: b.dir * (b.v - U * Math.cos(al)), vY: U * Math.sin(al) }); }
      }
      if (b.X * b.dir > (0.5 * N) / (C.F / b.Z) + BOATS[b.kind].L + 4) b.gone = true;
    }
    w.boats = w.boats.filter((b) => !b.gone);
    for (const c of w.crests) { c.age += dt; c.Z += c.dz * c.c * dt; c.amp *= Math.exp(-dt / 2.2); }
    w.crests = w.crests.filter((c) => c.amp > 0.12 && c.Z > 31 && c.Z < ZB);
    for (const p of w.spray) { p.vY -= G * dt; p.X += p.vX * dt; p.Y += p.vY * dt; }
    w.spray = w.spray.filter((p) => p.Y > 0);

    // the sky: a sunset glow that sinks and narrows as the dusk comes on, dithered at its edges; the sun going down
    const glow = 1 - w.dusk, top = Math.ceil(wl);
    for (let y = 0; y < top; y++) {
      const q = (C.hz - y) / C.hz, lv = glow * clamp(1 - q / (0.2 + 0.6 * glow)) * 3.2;
      if (lv < 0.05) continue;
      for (let x = 0, o = y * N; x < N; x++) { const l = Math.floor(lv + bayer(x, y) - 0.5); r.buf[o + x] = l <= 0 ? BG : l === 1 ? DARK : l === 2 ? MID : LMID; }
    }
    if (w.dusk > 0.5) for (const [sx, sy] of w.stars) if (hash((sx * 1e3) | 0, Math.floor(t * 2)) < (w.dusk - 0.45) * 1.6) r.set(sx * N, sy * N, BRIGHT);
    const sunY = C.hz - 0.1 * N + w.dusk * 0.3 * N;
    if (sunY - 0.05 * N < wl) { r.disc(0.74 * N, sunY, 0.05 * N, HOT); if (w.dusk < 0.3) r.disc(0.74 * N, sunY, 0.03 * N, BRIGHT); }
    // the far bank: towers lighting up, the spire and its smaller ones, floodlit as the dusk deepens; trees, the wall
    const kt = C.F / 420, lit = w.lights ? 0.55 : 0.04 + 0.4 * w.dusk * w.dusk, st = Math.max(2, Math.round(2.5 * u));
    for (const [X, bw, bh, seed] of w.towers) {
      const x0 = C.vx + X * kt, top0 = C.hz + (C.H - bh) * kt, ww = bw * kt;
      if (x0 > N || x0 + ww < 0) continue;
      r.rect(x0, top0, ww, wl - top0, DARK + DIM);
      for (let y = top0 + st, j = 0; y < wl - st; y += st, j++) for (let xx = x0 + 1, i = 0; xx < x0 + ww - 1; xx += st, i++) if (hash(seed + i, j) < lit) r.set(xx, y, hash(i, j + seed) < 0.3 ? BRIGHT : LMID);
    }
    const ks = C.F / 320, base = C.hz + C.H * ks, flood = w.dusk < 0.35 ? 0 : w.dusk < 0.7 ? 1 : 2;
    const sc = [DARK, MID, BRIGHT][flood], tr = [undefined, LMID, HOT][flood];
    if (flood === 2) puff(r, C.vx - 35 * ks, base - 38 * ks, 32 * ks, LMID + DIM);
    for (const [dx, hh] of [[-24, 30], [24, 30], [-14, 36], [14, 36]]) spire(r, C.vx + (-35 + dx) * ks, base, hh * ks, sc, tr);
    spire(r, C.vx - 35 * ks, base, 82 * ks, sc, tr);
    for (let x = 0; x < N; x += Math.max(2, Math.round(3 * u))) { const th = (0.004 + 0.008 * hash(x, 3)) * N; r.disc(x, wl - th * 0.6, th, DARK); }
    r.rect(0, wl - 0.006 * N, N, 0.006 * N + 1, MID + DIM);
    // the water: the bank mirrored and broken; the bank lights' streaks; the ripples drifting with the current
    reflect(r, wl, N, t, (1 + 2 * f.level) * u, DARK + DIM);
    if (w.lights || w.dusk > 0.92) {
      for (let x = Math.round(2 * u), i = 0; x < N; x += Math.round(5 * u), i++) {
        if (hash(i, Math.floor(t * 3)) < 0.1) continue;
        r.rect(x, wl - 0.01 * N, Math.max(1, u), Math.max(1, u), BRIGHT);
        for (let y = Math.round(wl + 2), j = 0; y < wl + 0.13 * N; y += 2, j++) if (hash(i * 7 + j, Math.floor(t * 5)) < 0.7) r.set(x + Math.round(Math.sin(t * 3 + y * 0.6) * u), y, BRIGHT + DIM);
      }
    }
    const nrip = Math.round((40 + 100 * f.level) * u), drift = t * 0.8 * N;
    for (let i = 0; i < nrip; i++) {
      const q = hash(i, 1), y = wl + 3 + q * q * (N - wl - 3), near = (y - wl) / (N - wl), x = (((hash(i, 2) * N * 1.3 + drift * (0.1 + near) * 0.05) % (N * 1.3)) + N * 1.3) % (N * 1.3) - 0.15 * N;
      r.rect(x, y, (1 + 5 * near) * u, Math.max(1, u * 0.6), f.beat.pulse > 0.6 && i % 3 === 0 ? LMID : MID + DIM);
    }
    // the wakes: each crest a dash on the water where it has got to, fading
    for (const c of w.crests) { const k = proj(C, c.X, 0, c.Z), len = (1 + c.age * 0.6) * k; r.rect(PX - len / 2, PY, len, Math.max(1, 0.4 * u + 0.15 * k), c.amp > 0.7 ? BRIGHT + DIM : c.amp > 0.4 ? LMID : LMID + DIM); }
    // the boats, far to near, each over its own reflection
    const lamp = w.dusk > 0.4 || w.lights;
    for (const b of w.boats) {
      const k = C.F / b.Z, y0 = C.hz + C.H * k, d = b.dir, x = C.vx + b.X * k, L = BOATS[b.kind].L, hl = L / 2;
      const P = (m, Y) => [x + d * m * k, y0 - Y * k];
      const R = (m0, Y0, m1, Y1, c) => { const [a0, b0] = P(m0, Y0), [a1, b1] = P(m1, Y1); r.rect(Math.min(a0, a1), Math.min(b0, b1), Math.max(1, Math.abs(a1 - a0)), Math.max(1, Math.abs(b1 - b0)), c); };
      if (b.kind === 'express') {
        r.poly([P(-hl, 0), P(hl - 4, 0), P(hl, 1.3), P(-hl, 1.2)], MID);
        r.poly([P(-hl, 0.75), P(hl - 1.8, 0.75), P(hl - 1.3, 0.95), P(-hl, 0.95)], HOT);
        r.poly([P(-hl + 2, 1.2), P(hl - 6, 1.2), P(hl - 7, 2.8), P(-hl + 2, 2.8)], LMID);
        for (let m = -hl + 3; m < hl - 8.5; m += 1.6) R(m, 1.7, m + 0.9, 2.4, lamp ? BRIGHT : DARK);
        R(-hl + 1.5, 2.8, hl - 6.5, 3.05, MID);
        r.poly([P(hl - 8.5, 2.8), P(hl - 6.5, 2.8), P(hl - 7, 3.7), P(hl - 8.5, 3.7)], LMID);
        R(hl - 7.9, 3.7, hl - 7.4, 3.95, b.horn > 0 ? WHITE : lamp ? BRIGHT : MID);
      } else if (b.kind === 'longtail') {
        r.poly([P(-hl, 0), P(hl - 2.5, 0), P(hl, 1.5), P(hl - 1, 1.1), P(-hl, 0.9)], DARK);
        r.poly([P(-hl, 0.72), P(hl - 1.3, 0.95), P(hl - 1.1, 1.12), P(-hl, 0.9)], HOT);
        for (const m of [-1.5, 0.3, 2]) { R(m - 0.3, 0.9, m + 0.3, 1.5, FIG); const [hx, hy] = P(m, 1.7); r.disc(hx, hy, 0.28 * k, FIG); }
        R(-hl + 0.5, 0.9, -hl + 1, 2.2, FIG); const [dx, dy] = P(-hl + 0.75, 2.4); r.disc(dx, dy, 0.25 * k, FIG);
        R(-hl - 0.3, 1.0, -hl + 0.5, 1.6, MID);
        const [ax, ay] = P(-hl, 1.2), [bx, by] = P(-hl - 3.4, 0.05); r.line(ax, ay, bx, by, LMID);
      } else { // a tug at the head, two rice barges on the towline behind, round roofs over their holds
        r.poly([P(hl - 10, 0), P(hl - 1.5, 0), P(hl, 1.2), P(hl - 10, 1.1)], DARK);
        R(hl - 7, 1.1, hl - 3, 3.6, MID); R(hl - 6.5, 2.6, hl - 3.5, 3.1, lamp ? BRIGHT : DARK); R(hl - 6, 3.6, hl - 5.4, 4.6, DARK);
        for (let i = 0; i < 2; i++) {
          const m0 = hl - 14 - i * 28, m1 = m0 - 24, [lx, ly] = P(m0 + 4, 0.9), [mx2, my2] = P(m0 + 0.2, 0.9);
          r.line(lx, ly, mx2, my2, LMID);
          r.poly([P(m1, 0), P(m0, 0), P(m0 + 1, 1.4), P(m1 - 0.5, 1.3)], MID);
          const pts = []; for (let j = 0; j <= 8; j++) pts.push(P(m1 + 2 + (j / 8) * (m0 - m1 - 4), 1.3 + 1.7 * Math.sin((j / 8) * Math.PI)));
          r.poly(pts, DARK);
        }
      }
      const xa = Math.min(x - hl * k - 4 * k, x + hl * k + 4 * k), xb = Math.max(x - hl * k - 4 * k, x + hl * k + 4 * k);
      mirrorBox(r, xa, xb, y0, Math.round(BOATS[b.kind].h * k), bits(MID, LMID, DARK, HOT, BRIGHT, FIG, WHITE), t);
      targets.push({ x: x - hl * k, y: y0 - BOATS[b.kind].h * k, w: L * k, h: BOATS[b.kind].h * k });
    }
    for (const p of w.spray) { proj(C, p.X, p.Y, p.Z); r.rect(PX, PY, Math.max(1, 0.6 * u), Math.max(1, 0.6 * u), p.vY > 0 ? BRIGHT : LMID); }
    w.glints = w.glints.filter((g) => { g.life -= dt; r.rect(g.x - u, g.y, 3 * u, Math.max(1, u * 0.6), BRIGHT); return g.life > 0; });
  },
};

// ---------------------------------------------------------------------------------------------- muaythai
// A stadium ring from the side: two fighters in wraps, plain armbands and the corner's shorts. In the quiet parts
// they dance the slow ritual before the fight (a step, the bird on one leg, kneeling to bow); in the fight they
// keep the rhythm on the beat, a kick is a knee in the clinch, a snare a roundhouse (the rear leg swung straight
// from the hip, the body leaning back, the arm swung down to balance), a hat a short elbow. Ringside two drummers
// play the kicks and snares, a pipe player sways with the tune and a cymbal player closes the cups on every beat;
// the crowd rises on the beat. Kinds: the venue (a stadium under floodlights, a fair under strings of bulbs, an
// open-air ring by the river). A drop: a spinning elbow; the other goes down to one knee and gets back up.
const VENUE_W = { stadium: [1, 2, 3], fair: [2, 2, 2], riverside: [3, 2, 1] };
// poses: the lean of the body, then the near thigh and shin, the far thigh and shin, the near upper arm and forearm,
// the far upper arm and forearm; every angle from straight down, positive toward the way the fighter faces. In the
// guard, the clinch, the elbow and the kneel both legs reach the canvas (the kneel: the front shin upright, the back
// one flat on the canvas)
const POSE = {
  guard: [0.05, 0.3, -0.05, -0.3, -0.1, 0.8, 2.7, 0.55, 2.8],
  clinch: [0.2, 0.3, -0.1, -0.3, -0.15, 1.45, 1.75, 1.35, 1.8],
  knee: [-0.15, 0.25, 0, 1.75, -0.3, 1.45, 1.75, 1.35, 1.8],
  kick: [-0.45, 0.1, 0.05, 1.95, 1.95, 0.9, 2.6, -0.7, -0.5],
  elbow: [0.25, 0.3, -0.05, -0.3, -0.1, 1.75, -1.2, 0.6, 2.8],
  kneel: [0.1, 1.57, 0, 0, -1.57, 0.6, 1.3, 0.2, 0.35],
  step: [0.1, 0.5, 0.15, -0.4, -0.6, 1.2, 1.5, 0.9, 1.7],
  bird: [0.15, 1.2, 0.1, -0.05, -0.05, 1.9, 2.2, -1.6, -1.9],
  bow: [0.9, 0.45, -1.57, 0.45, -1.57, 0.7, 0.9, 0.6, 0.9],
};
const RITUAL = ['step', 'bird', 'step', 'bow'];
const STRIKE = { knee: 0.4, kick: 0.5, elbow: 0.3, spin: 0.9 };
// how far apart (in heights) each lands, from the poses: the shin of a kick reaches 0.41 out from the hip, a knee 0.24,
// an elbow 0.22, each against a body 0.065 deep; and when in the strike it lands
const REACH = { knee: 0.31, kick: 0.47, elbow: 0.29, spin: 0.29 }, HITP = { knee: 0.5, kick: 0.5, elbow: 0.5, spin: 0.72 };

// a fighter h tall standing on g, facing dir, posed by P: the lower foot on the canvas, far limbs behind the body
function fighter(r, x, g, h, dir, P, skin, shorts, band, flash) {
  const T = 0.245 * h, S = 0.245 * h, TL = 0.3 * h, UA = 0.16 * h, FA = 0.15 * h, lw = Math.max(1, 0.075 * h), sk = flash ? BRIGHT : skin, far = flash ? BRIGHT : dim(skin);
  const hip = Math.max(T * Math.cos(P[1]) + S * Math.cos(P[2]), T * Math.cos(P[3]) + S * Math.cos(P[4])), hx = x, hy = g - hip;
  const sx = hx + dir * Math.sin(P[0]) * TL * 0.88, sy = hy - Math.cos(P[0]) * TL * 0.88;
  const limb = (x0, y0, a0, l0, a1, l1, c, end, endR) => {
    const kx = x0 + dir * Math.sin(a0) * l0, ky = y0 + Math.cos(a0) * l0, ex = kx + dir * Math.sin(a1) * l1, ey = ky + Math.cos(a1) * l1;
    r.stroke(x0, y0, kx, ky, lw, c); r.stroke(kx, ky, ex, ey, lw * 0.9, c); r.disc(ex, ey, endR, end);
    return [kx, ky, ex, ey];
  };
  const fl = limb(hx, hy, P[3], T, P[4], S, far, far, lw * 0.5);
  const fa = limb(sx, sy, P[7], UA, P[8], FA, far, BRIGHT + DIM, lw * 0.75);
  r.stroke(hx, hy, sx + dir * Math.sin(P[0]) * TL * 0.12, sy - Math.cos(P[0]) * TL * 0.12, 0.13 * h, sk);
  r.disc(sx + dir * Math.sin(P[0]) * TL * 0.25, sy - Math.cos(P[0]) * TL * 0.25 - 0.06 * h, 0.065 * h, sk);
  r.disc(sx + dir * Math.sin(P[0]) * TL * 0.25 - dir * 0.015 * h, sy - Math.cos(P[0]) * TL * 0.25 - 0.09 * h, 0.05 * h, DARK); // the hair
  r.poly([[hx - 0.075 * h, hy - 0.06 * h], [hx + 0.075 * h, hy - 0.06 * h], [hx + 0.1 * h, hy + 0.08 * h], [hx - 0.1 * h, hy + 0.08 * h]], shorts);
  const nl = limb(hx, hy, P[1], T, P[2], S, sk, sk, lw * 0.5);
  const na = limb(sx, sy, P[5], UA, P[6], FA, sk, BRIGHT, lw * 0.75); // the wrapped hand
  r.disc((sx + na[0]) / 2, (sy + na[1]) / 2, lw * 0.55, band); // the armband
  return { knee: [fl[0], fl[1]], foot: [fl[2], fl[3]], elbow: [na[0], na[1]], fknee: [nl[0], nl[1]], top: sy - 0.2 * h, hip: [hx, hy], felbow: [fa[0], fa[1]] };
}

const muaythai = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    const F = (x, dir, shorts) => ({ x, dir, shorts, P: Float32Array.from(POSE.guard), st: null, hit: 0, kneel: 0, rise: 0 });
    Object.assign(w, { venue: rollW(rnd, VENUE_W, band), A: F(0.4 * N, 1, HOT), B: F(0.6 * N, -1, COOL), next: 0, clinch: 0, ritual: 0, sparks: [], cheer: 0, beats: 0,
      drum: [0, 0], pipe: 0.4, crowd: Array.from({ length: 30 }, (_, i) => ({ x: ((i % 10) + 0.5 + (i > 9 && i < 20 ? 0.5 : 0)) / 10.2, row: (i / 10) | 0, ph: rnd() })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = 0.74 * N, h = 0.42 * N, bps = bpsOf(f);
    const quiet = f.level < 0.3 && f.rel.bassDrive < 0.4, A = w.A, B = w.B;
    const coming = (F) => F.st && F.st.p < HITP[F.st.kind] + 0.1; // a strike still on its way in: the other waits for it to land
    const throwIt = (F, kind) => { if (!F.st && F.kneel <= 0 && w.ritual < 0.3 && !coming(F === A ? B : A)) F.st = { kind, p: 0 }; };
    for (const hh of hits) {
      if (isLow(hh)) { w.drum[0] = 1; if (!quiet) { const F = w.next++ % 2 ? B : A; w.clinch = 1.2; throwIt(F, 'knee'); } }
      else if (hh.kind === 'snare') { w.drum[1] = 1; if (!quiet) throwIt(w.next++ % 2 ? A : B, 'kick'); }
      else if (hh.kind === 'hat' && !quiet && rnd() < 0.5) throwIt(rnd() < 0.5 ? A : B, 'elbow');
      if (isTonal(hh)) w.pipe = 0.75 - (hh.pc / 11) * 0.6; // the pipe rises with the pitch
    }
    if (f.section === 'change') w.venue = rollW(rnd, VENUE_W, band);
    if (f.section === 'drop') { A.st = { kind: 'spin', p: 0 }; B.st = null; w.ritual = 0; }
    const beat = beatTick(w, f, dt);
    if (beat) w.beats++;
    w.ritual = follow(w.ritual, quiet ? 1 : 0, dt, 0.8);
    w.clinch -= dt; w.cheer -= dt; w.drum[0] = Math.max(0, w.drum[0] - dt * 8); w.drum[1] = Math.max(0, w.drum[1] - dt * 8);
    // where they stand: closer in the clinch, apart in their corners for the dance; a strike on its way in closes (or
    // opens) the distance to its own reach with a quick step, so it lands on the body and never through it; the pair
    // drifts round the ring
    let live = null;
    for (const F of [A, B]) if (F.st && F.st.p < HITP[F.st.kind] + 0.1 && (!live || F.st.p < live.st.p)) live = F;
    const cx = 0.5 * N + 0.06 * N * Math.sin(t * 0.25), sep = lerp(live ? REACH[live.st.kind] * h : w.clinch > 0 ? 0.3 * h : 0.5 * h, 0.5 * N, w.ritual), tau = live ? 0.07 : 0.25;
    A.x = follow(A.x, cx - sep / 2, dt, tau); B.x = follow(B.x, cx + sep / 2, dt, tau);
    const rit = POSE[RITUAL[Math.floor(w.beats / 2) % 4]], rit2 = POSE[RITUAL[(Math.floor(w.beats / 2) + 1) % 4]], rb = ease(((w.beats % 2) + (beatLocked(f) ? f.beat.phase : 0)) / 2);
    const out = {};
    for (const F of [A, B]) {
      const other = F === A ? B : A, base = w.clinch > 0 && w.ritual < 0.5 ? POSE.clinch : POSE.guard;
      let sp = null, e = 0, dir = F.dir;
      if (F.st) {
        F.st.p += dt / STRIKE[F.st.kind];
        const p = F.st.p;
        if (F.st.kind === 'spin') { // turning the back, then the elbow whipped round faster and faster to the head, and back
          if (p > 0.2 && p < 0.55) dir = -F.dir;
          sp = POSE.elbow; e = p < 0.5 ? 0.3 : p < 0.72 ? 0.3 + 0.7 * ((p - 0.5) / 0.22) ** 2 : 0.5 + 0.5 * Math.cos((Math.PI * (p - 0.72)) / 0.28);
          if (p >= 0.72 && !F.st.hit) { F.st.hit = true; other.kneel = 2.2; other.hit = 0.2; w.cheer = 1.5; s.shake = Math.max(s.shake, 0.6); }
        } else { // swung from the hip faster and faster, stopped dead by what it lands on, drawn back
          sp = POSE[F.st.kind]; e = p < 0.5 ? (2 * p) ** 2 : 0.5 + 0.5 * Math.cos(Math.PI * clamp((p - 0.5) * 2));
          if (p >= 0.5 && !F.st.hit) { F.st.hit = true; other.hit = 0.12; w.cheer = 0.6; s.shake = Math.max(s.shake, F.st.kind === 'kick' ? 0.35 : 0.2); F.st.land = true; }
        }
        if (p >= 1) F.st = null;
      }
      F.kneel -= dt; F.hit -= dt;
      const kn = F.kneel > 0 ? clamp(F.kneel / 0.5) * clamp((2.2 - F.kneel) / 0.3) : 0; // down to one knee, held, back up
      const bob = 0.12 * (beatLocked(f) ? Math.exp(-f.beat.phase * 5) : f.beat.pulse) * (1 - w.ritual);
      for (let i = 0; i < 9; i++) {
        let v = lerp(base[i], lerp(rit[i], rit2[i], rb), w.ritual);
        if (sp) v = lerp(v, sp[i], e);
        F.P[i] = lerp(v, POSE.kneel[i], kn);
      }
      F.P[1] += bob; // the front knee lifts on the beat: the rhythm
      out[F === A ? 'A' : 'B'] = { F, dir, e };
    }

    // the venue
    if (w.venue === 'stadium') {
      r.rect(0, 0, N, 0.55 * N, DARK + DIM);
      for (const lx of [0.25, 0.75]) { // a floodlight and its cone, half-toned
        for (let y = Math.round(0.04 * N); y < 0.55 * N; y++) { const hw = 3 * u + (y - 0.04 * N) * 0.35; for (let x = Math.max(0, Math.round(lx * N - hw)) + (y & 1); x < Math.min(N, lx * N + hw); x += 2) r.buf[y * N + x] = MID + DIM; }
        r.rect(lx * N - 6 * u, 0.02 * N, 12 * u, 3 * u, BRIGHT);
      }
      r.rect(0.2 * N, 0.08 * N, 0.6 * N, Math.max(1, u), MID); // the lighting rig over the ring
    } else if (w.venue === 'fair') {
      const wx = 0.82 * N, wy = 0.3 * N, wr = 0.2 * N, ang = t * 0.15; // a wheel turning slowly far behind
      r.ring(wx, wy, wr, Math.max(1, u), MID + DIM);
      for (let k = 0; k < 8; k++) { const a = ang + (k * TAU) / 8; r.line(wx, wy, wx + Math.cos(a) * wr, wy + Math.sin(a) * wr, MID + DIM); r.rect(wx + Math.cos(a) * wr - u, wy + Math.sin(a) * wr - u, 2 * u, 2 * u, (k + w.beats) % 3 ? LMID : HOT); }
      for (let i = 0; i < 2; i++) for (let k = 0; k <= 24; k++) { const q = k / 24, x = q * N, y = (0.06 + i * 0.07) * N + Math.sin(q * Math.PI) * 0.06 * N; r.rect(x, y, Math.max(1, u), Math.max(1, u), (k + i + w.beats) % 3 ? BRIGHT : HOT); }
    } else {
      r.disc(0.15 * N, 0.12 * N, 0.05 * N, BRIGHT);
      r.rect(0, 0.4 * N, N, Math.max(1, u), LMID + DIM);
      for (const px of [0.08, 0.9]) { r.stroke(px * N, 0.55 * N, px * N + 0.03 * N, 0.22 * N, 2 * u, DARK); for (let k = 0; k < 5; k++) { const a = -2.6 + k * 0.6; r.stroke(px * N + 0.03 * N, 0.22 * N, px * N + 0.03 * N + Math.cos(a) * 0.08 * N, 0.22 * N + Math.sin(a) * 0.05 * N + 0.03 * N, 1.5 * u, DARK); } }
    }
    // the crowd rises on the beat and throws its arms up when something lands
    const rows = w.venue === 'stadium' ? 3 : w.venue === 'fair' ? 2 : 1, pump = (0.4 + 0.6 * energy(f)) * f.beat.pulse;
    for (let i = w.crowd.length - 1; i >= 0; i--) { // the back rows first
      const c = w.crowd[i];
      if (c.row >= rows) continue;
      const hr = (2.6 - c.row * 0.4) * u, y = (0.5 - c.row * 0.08) * N - pump * (3 - c.row) * u * (0.6 + 0.4 * Math.sin(c.ph * TAU)), x = c.x * N;
      r.rect(x - hr * 1.6, y + hr * 0.7, hr * 3.2, 0.55 * N - y, c.row ? MID + DIM : MID);
      r.disc(x, y, hr, c.row ? MID + DIM : MID);
      if (w.cheer > 0 && hash((c.x * 100) | 0, c.row) < 0.6) for (const sd of [-1, 1]) r.line(x + sd * hr * 1.3, y + hr, x + sd * hr * 2, y - hr * 1.8, MID);
    }
    // the ring: the far ropes, the canvas, the fighters, the near ropes and the corner posts
    for (let k = 1; k <= 4; k++) r.rect(0.08 * N, g - 0.035 * N - k * 0.055 * N, 0.84 * N, Math.max(1, u * 0.6), k % 2 ? HOT + DIM : COOL + DIM);
    r.poly([[0.06 * N, g - 0.035 * N], [0.94 * N, g - 0.035 * N], [N, g + 0.045 * N], [0, g + 0.045 * N]], LMID);
    r.rect(0, g + 0.045 * N, N, 0.06 * N, MID);
    r.rect(0, g + 0.045 * N, N, Math.max(1, u), BRIGHT + DIM);
    const flashOf = (F) => F.hit > 0;
    for (const key of A.st ? ['B', 'A'] : ['A', 'B']) {
      const o = out[key], F = o.F, J = fighter(r, F.x, g, h, o.dir, F.P, FIG, F.shorts, F.shorts === HOT ? COOL : HOT, flashOf(F));
      if (F.st && F.st.land) { // the moment it lands: sparks off the striking point
        const at = F.st.kind === 'kick' ? J.knee.map((v, i) => lerp(v, J.foot[i], 0.8)) : F.st.kind === 'knee' ? J.knee : J.elbow;
        for (let k = 0; k < 8; k++) { const a = rnd() * TAU, sp = (0.3 + rnd() * 0.5) * N; w.sparks.push({ x: at[0], y: at[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.2 * N, life: 0.25 + rnd() * 0.2 }); }
        F.st.land = false;
      }
      targets.push({ x: F.x - 0.15 * h, y: J.top, w: 0.3 * h, h: g - J.top });
    }
    for (let k = 1; k <= 4; k++) r.rect(0, g + 0.04 * N - k * 0.075 * N, N, Math.max(1, u * 0.7), k % 2 ? HOT : COOL);
    for (const [px, c] of [[0.02, HOT], [0.98, COOL]]) { r.rect(px * N - 1.5 * u, g - 0.28 * N, 3 * u, 0.33 * N, MID); r.rect(px * N - 2.5 * u, g - 0.3 * N, 5 * u, 0.08 * N, c); }
    w.sparks = w.sparks.filter((p) => { p.vy += ((G * h) / 1.7) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), BRIGHT); return p.life > 0; }); // the fighters are 1.7 m: g in the ring's cells
    // ringside: two drummers, the pipe, the cymbals; seated in front of the apron
    const my = N - 0.01 * N, mh = 0.27 * N;
    const sitter = (x, sway) => { r.poly([[x - 0.1 * mh, my], [x + 0.1 * mh, my], [x + 0.07 * mh + sway, my - 0.5 * mh], [x - 0.07 * mh + sway, my - 0.5 * mh]], MID); r.disc(x + sway, my - 0.6 * mh, 0.09 * mh, MID); return [x + sway, my - 0.45 * mh]; };
    for (let i = 0; i < 2; i++) { // a barrel drum across the lap, the near hand coming down on the head
      const x = (0.08 + i * 0.13) * N, [shx, shy] = sitter(x, 0), dy = my - 0.25 * mh;
      r.rect(x - 0.22 * mh, dy - 0.07 * mh, 0.44 * mh, 0.14 * mh, LMID); r.rect(x + 0.2 * mh, dy - 0.08 * mh, 0.04 * mh, 0.16 * mh, BRIGHT + DIM);
      const hy = dy - 0.09 * mh - (1 - w.drum[i]) * 0.12 * mh;
      r.stroke(shx, shy, x + 0.22 * mh, hy, Math.max(1, 0.05 * mh), MID); r.disc(x + 0.22 * mh, hy, Math.max(1, 0.04 * mh), FIG);
    }
    { // the pipe player sways with the tune, the pipe raised with the pitch
      const sway = Math.sin(f.rel.midClock * 2) * 0.03 * mh, [shx] = sitter(0.36 * N, sway), mx = shx + 0.08 * mh, mY = my - 0.6 * mh, a = w.pipe;
      r.stroke(mx, mY, mx + Math.cos(a) * 0.35 * mh, mY + Math.sin(a) * 0.35 * mh, Math.max(1, 0.03 * mh), LMID);
      r.disc(mx + Math.cos(a) * 0.36 * mh, mY + Math.sin(a) * 0.36 * mh, Math.max(1, 0.04 * mh), LMID);
    }
    { // the cymbals: two cups, shut on the beat
      const [shx, shy] = sitter(0.47 * N, 0), gap = (1 - f.beat.pulse) * 0.1 * mh;
      for (const sd of [-1, 1]) { const cx2 = shx + 0.12 * mh + sd * (gap / 2 + 0.02 * mh); r.line(shx, shy, cx2, shy - 0.05 * mh, MID); r.disc(cx2, shy - 0.05 * mh, Math.max(1, 0.03 * mh), BRIGHT); }
    }
  },
};

// ---------------------------------------------------------------------------------------------- wokfire
// A street stall at night from the side: the cook's silhouette at a wok over a ring of blue gas flames. A kick tosses
// the food: the wok flicks forward and back, the food flies up on parabolas and is caught where it falls; on the beat
// the wok tips its lip into the burner and the flame leaps up into it; the smoke rises and slows and spreads; a snare
// is the ladle on the iron, a hat spits oil. A bulb on its wire swings in the breeze, customers on plastic stools at a
// low table eat a spoonful on the beat. Kinds: the dish (noodles in strands, rice in grains, basil with chillies and
// more smoke). A drop: the oil catches all at once, a column of fire.
const DISH_W = { noodles: [3, 2, 2], rice: [2, 2, 2], basil: [1, 2, 3] };

const wokfire = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { dish: rollW(rnd, DISH_W, band), toss: 1, tip: 0, scrape: 0, food: [], fire: [], smoke: [], spits: [], th: 0.1, om: 0, eat: 0, beats: 0, flash: 0,
      bokeh: Array.from({ length: 10 }, () => [0.62 + rnd() * 0.4, 0.05 + rnd() * 0.4, 0.01 + rnd() * 0.025, rnd() < 0.3 ? HOT + DIM : rnd() < 0.5 ? COOL + DIM : LMID + DIM]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), sc = 0.4 * N, g = G * sc; // 0.4 N cells a metre
    const R = 0.085 * N, rest = [0.62 * N, 0.585 * N], top = 0.6 * N, floor = 0.93 * N;
    const fireUp = (n, x0, y0, spread, up) => { for (let k = 0; k < n; k++) w.fire.push({ x: x0 + (rnd() - 0.5) * spread, y: y0, vx: (rnd() - 0.5) * 0.6 * sc, vy: -(up * (0.6 + rnd() * 0.6)) * sc, life: 0.3 + rnd() * 0.35, max: 0.65 }); };
    for (const h of hits) {
      if (isLow(h) && w.toss >= 1) { w.toss = 0; w.tossK = h.strength; w.launch = true; } // the toss: a flick forward, the food leaves as the wok turns back
      else if (h.kind === 'snare') w.scrape = 1;
      else if (h.kind === 'hat') for (let k = 0; k < 3; k++) w.spits.push({ x: rest[0] + (rnd() - 0.5) * R, y: rest[1] - 0.1 * R, vx: (rnd() - 0.5) * 1.5 * sc, vy: -(1 + rnd()) * sc, life: 0.4 });
    }
    if (f.section === 'change') w.dish = rollW(rnd, DISH_W, band);
    if (f.section === 'drop') { fireUp(140, rest[0], rest[1] - 0.2 * R, 1.6 * R, 4.5); w.flash = 0.12; s.shake = Math.max(s.shake, 0.6); }
    if (beatTick(w, f, dt)) { w.beats++; w.tip = 1; w.eat = 1; fireUp(14 + Math.round(16 * f.rel.bassDrive), rest[0] + 0.9 * R, rest[1] + 0.2 * R, 0.3 * R, 2.4 + 1.5 * f.rel.bassDrive); }
    w.toss = Math.min(1, w.toss + dt / 0.2); w.tip = Math.max(0, w.tip - dt / 0.3); w.scrape = Math.max(0, w.scrape - dt * 6); w.eat = Math.max(0, w.eat - dt * 2.5); w.flash -= dt;
    // the wok: forward and up on the flick, tipped toward the burner on the beat
    const fl = Math.sin(Math.PI * w.toss), cx = rest[0] + 0.05 * N * fl, cy = rest[1] - 0.02 * N * fl, tilt = 0.35 * Math.sin(Math.PI * w.tip) - 0.15 * fl;
    if (w.launch && w.toss >= 0.5) { // off the far lip at the turn of the flick, aimed so it comes down in the bowl where the wok will be again
      w.launch = false;
      const x0 = cx + 0.55 * R, y0 = cy - 0.05 * R, n = w.dish === 'rice' ? 18 : 11;
      for (let k = 0; k < n; k++) {
        const vy = -(1.9 + 0.7 * w.tossK + rnd() * 0.4) * sc, yl = rest[1] + 0.25 * R, T = (-vy + Math.sqrt(vy * vy + 2 * g * (yl - y0))) / g, xt = rest[0] + (rnd() - 0.6) * R * 0.9;
        w.food.push({ x: x0 + (rnd() - 0.5) * 0.3 * R, y: y0, vx: (xt - x0) / T, vy, kind: w.dish === 'basil' ? (rnd() < 0.4 ? 'chilli' : 'leaf') : w.dish, a: rnd() * TAU });
      }
    }
    for (const p of w.food) { p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += 6 * dt; if (p.vy > 0 && Math.abs(p.x - cx) < R * 0.85 && p.y >= cy + 0.25 * R) p.in = true; } // caught: back on the food in the bowl
    w.food = w.food.filter((p) => !p.in && p.y < (p.x > 0.3 * N && p.x < 0.88 * N ? top : floor)); // a stray bit lands on the cart, never through it
    for (const p of w.fire) { p.vy -= 1.5 * sc * dt; p.vy *= Math.exp(-dt * 2); p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; } // hot gas rises, the air drags it
    w.fire = w.fire.filter((p) => p.life > 0);
    if (rnd() < dt * (4 + 8 * f.level) * (w.dish === 'basil' ? 1.6 : 1)) w.smoke.push({ x: cx + (rnd() - 0.5) * R, y: cy - 0.3 * R, vx: 0, vy: -0.7 * sc, R: 0.012 * N, life: 2.5 });
    const wind = (0.1 + 0.3 * f.rel.midDrive) * sc;
    for (const p of w.smoke) { p.vy = follow(p.vy, -0.12 * sc, dt, 0.9); p.vx = follow(p.vx, wind, dt, 1.2); p.x += p.vx * dt; p.y += p.vy * dt; p.R += 0.015 * N * dt; p.life -= dt; } // rising, slowing, spreading
    w.smoke = w.smoke.filter((p) => p.life > 0);
    w.spits = w.spits.filter((p) => { p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; return p.life > 0; });
    w.om += (-(G / 0.5) * Math.sin(w.th) - 0.5 * w.om + 1.2 * f.rel.midDrive * Math.sin(t * 0.9)) * dt; w.th += w.om * dt; // the bulb: a pendulum on half a metre of wire

    // the street behind: a shop wall, out-of-focus lights; the light of the fire on everything for a moment on a drop
    r.rect(0, 0, N, floor, w.flash > 0 ? MID : BG);
    r.rect(0.12 * N, 0.1 * N, 0.48 * N, floor - 0.1 * N, DARK); r.rect(0.16 * N, 0.16 * N, 0.4 * N, floor - 0.16 * N, LMID + DIM); // the lit shop behind the stall
    for (const [bx, by, br, bc] of w.bokeh) puff(r, bx * N, by * N, br * N * (0.8 + 0.4 * f.beat.pulse), bc);
    r.rect(0, floor, N, N - floor, DARK + DIM);
    // the bulb on its wire
    const px = 0.55 * N, bx2 = px + Math.sin(w.th) * 0.2 * N, by2 = Math.cos(w.th) * 0.2 * N;
    r.line(px, 0, bx2, by2, MID); r.disc(bx2, by2 + 0.012 * N, 0.014 * N, f.rel.trebDrive > 0.9 && hash(w.beats, (t * 20) | 0) < 0.3 ? MID : BRIGHT);
    for (const p of w.smoke) puff(r, p.x, p.y, p.R, p.life > 1.2 ? LMID + DIM : MID + DIM);
    // the cook: at the wok, the near hand on the handle, the far one with the ladle
    const ck = 0.42 * N, J = walker(r, ck, floor, 0.56 * N, DARK, 0, 1, { cap: true });
    const hx = cx - Math.cos(tilt) * R * 1.9, hy = cy - Math.sin(tilt) * R * 1.9 - 0.01 * N;
    r.stroke(J.sx, J.sy + 0.03 * N, hx, hy, 0.022 * N, DARK);
    const la = 0.6 + 0.5 * Math.sin(f.rel.midClock * 3) + 0.6 * w.scrape, lx = cx - 0.2 * R + Math.cos(la) * R * 0.3, ly = cy - 0.1 * R;
    r.stroke(J.sx - 0.01 * N, J.sy + 0.04 * N, lx - 0.25 * R, ly - 0.9 * R, 0.02 * N, DARK); r.stroke(lx - 0.25 * R, ly - 0.9 * R, lx, ly, Math.max(1, 0.3 * u + 0.006 * N), MID);
    if (w.scrape > 0.6) r.rect(lx - u, ly - u, 2 * u, 2 * u, WHITE);
    // the cart, the burner's ring of blue flame under the wok, the glass case of what goes in
    r.rect(0.3 * N, top, 0.58 * N, floor - top - 0.03 * N, MID);
    r.rect(0.3 * N, top, 0.58 * N, Math.max(1, 1.5 * u), LMID);
    for (const wx of [0.36, 0.82]) { r.disc(wx * N, floor - 0.025 * N, 0.025 * N, BLACK); r.disc(wx * N, floor - 0.025 * N, 0.01 * N, MID); }
    r.frame(Math.round(0.68 * N), Math.round(top - 0.11 * N), Math.round(0.18 * N), Math.round(0.11 * N), LMID + DIM);
    for (let k = 0; k < 4; k++) r.rect((0.695 + k * 0.042) * N, top - 0.035 * N, 0.032 * N, 0.025 * N, [HOT, COOL, BRIGHT, LMID][(k + (w.dish === 'basil' ? 1 : 0)) % 4]);
    const fh = (0.025 + 0.03 * f.rel.bassDrive) * N;
    for (let k = -3; k <= 3; k++) { const x = rest[0] + k * 0.22 * R, hgt = fh * (0.7 + 0.3 * hash(k + 9, (t * 15) | 0)); r.poly([[x - 0.06 * R, top], [x + 0.06 * R, top], [x, top - hgt]], COOL); }
    // the wok: an iron bowl tipped by `tilt` about its middle, the food in it, the long handle to the cook's hand
    const ct = Math.cos(tilt), st = Math.sin(tilt), pts = [];
    for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI, qx = Math.cos(a) * R, qy = Math.sin(a) * R * 0.6; pts.push([cx + qx * ct - qy * st, cy + qx * st + qy * ct]); }
    for (let k = 12; k >= 0; k--) { const a = (k / 12) * Math.PI, qx = Math.cos(a) * R * 0.88, qy = Math.sin(a) * R * 0.48; pts.push([cx + qx * ct - qy * st, cy + qx * st + qy * ct]); }
    r.poly(pts, BLACK);
    const foodCol = w.dish === 'basil' ? COOL : w.dish === 'rice' ? BRIGHT : LMID;
    r.poly([[cx - R * 0.75 * ct, cy - R * 0.75 * st], [cx + R * 0.75 * ct, cy + R * 0.75 * st], [cx + R * 0.4 * ct - 0.3 * R * st, cy + 0.3 * R * ct + R * 0.4 * st], [cx - R * 0.4 * ct - 0.3 * R * st, cy + 0.3 * R * ct - R * 0.4 * st]], foodCol);
    r.stroke(cx - R * ct, cy - R * st, hx, hy, Math.max(1, 0.012 * N), BLACK);
    targets.push({ x: cx - R, y: cy - R, w: 2 * R, h: 1.6 * R });
    for (const p of w.food) { // in flight: strands turn as they go, grains are dots, leaves and chillies tumble
      if (p.kind === 'noodles') r.line(p.x - Math.cos(p.a) * 2.5 * u, p.y - Math.sin(p.a) * 2.5 * u, p.x + Math.cos(p.a) * 2.5 * u, p.y + Math.sin(p.a) * 2.5 * u, LMID);
      else if (p.kind === 'rice') r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), BRIGHT);
      else r.rect(p.x - u, p.y - u * 0.5, 2 * u, Math.max(1, u), p.kind === 'chilli' ? HOT : COOL);
    }
    for (const p of w.fire) { const q = p.life / p.max; r.rect(p.x - u, p.y - u, (1 + 2 * q) * u, (1 + 2 * q) * u, q > 0.6 ? BRIGHT : q > 0.3 ? HOT : DARK); }
    for (const p of w.spits) r.rect(p.x, p.y, Math.max(1, u * 0.7), Math.max(1, u * 0.7), BRIGHT);
    // the customers on low plastic stools at a low table, a spoonful on the beat
    const tg = floor, tx = 0.88 * N;
    r.rect(tx - 0.1 * N, tg - 0.14 * N, 0.2 * N, 0.015 * N, LMID); r.rect(tx - 0.005 * N, tg - 0.14 * N, 0.01 * N, 0.14 * N, MID);
    r.rect(tx - 0.03 * N, tg - 0.16 * N, 0.06 * N, 0.02 * N, BRIGHT + DIM);
    for (const [k, sx, dir] of [[0, tx - 0.15 * N, 1], [1, tx + 0.15 * N, -1]]) {
      const stc = k ? COOL : HOT, sh = 0.09 * N;
      r.poly([[sx - 0.035 * N, tg], [sx + 0.035 * N, tg], [sx + 0.028 * N, tg - sh], [sx - 0.028 * N, tg - sh]], stc);
      r.rect(sx - 0.02 * N, tg - sh * 0.6, 0.04 * N, sh * 0.35, dim(stc));
      const hipX = sx, hipY = tg - sh - 0.01 * N, kneeX = sx + dir * 0.08 * N;
      r.stroke(hipX, hipY, kneeX, hipY - 0.005 * N, 0.025 * N, DARK); r.stroke(kneeX, hipY, kneeX, tg, 0.02 * N, DARK);
      r.stroke(hipX, hipY, hipX + dir * 0.015 * N, hipY - 0.16 * N, 0.045 * N, DARK); r.disc(hipX + dir * 0.02 * N, hipY - 0.19 * N, 0.028 * N, DARK);
      const lift = (w.beats % 2 === k ? w.eat : 0), ex = hipX + dir * 0.05 * N, ey = hipY - 0.1 * N - lift * 0.06 * N;
      r.stroke(hipX + dir * 0.01 * N, hipY - 0.13 * N, ex, ey, 0.015 * N, DARK); r.rect(ex - u, ey - u, 2 * u, Math.max(1, u), LMID);
    }
  },
};

// ---------------------------------------------------------------------------------------------- khlongboat
// A canal boat between the backs of houses, followed from the water: the boat speeds along with spray off its bow,
// its wake runs out from the bow at the Kelvin angle, slaps the wall of houses and comes back reflected; a kick and
// the passengers pull up the plastic screens against the spray (each on its rope, one after the other down the
// boat); a snare brings a low bridge, and as it passes over, the canopy drops and everyone ducks. The houses go by
// at the boat's speed, the boat bobs on the beat. Kinds: what lines the canal (wooden houses on stilts, the backs of
// concrete shophouses, a stretch where vendors' boats are moored). A drop: the boat surges, bow up, and a wave
// rolls across the canal and bursts on the wall.
const BANK_W = { stilts: [3, 2, 1], concrete: [1, 2, 3], market: [2, 2, 2] };
const KB = { Z: 6, wall: 12, L: 16 }; // the boat's depth, the wall's, the boat's length (metres)

function bankSeg(rnd, kind, X0) { return { X0, len: 5 + rnd() * 4, kind, seed: (rnd() * 1e4) | 0, h: kind === 'concrete' ? 7 + rnd() * 4 : 4.2 + rnd() * 1.2 }; }

const khlongboat = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), kind = rollW(rnd, BANK_W, band);
    Object.assign(w, { kind, X: 0, V: 8, crests: [], spray: [], splash: [], segs: [], bridge: null, duck: 0, surge: 0, pitch: 0, emit: 0, wave: null,
      screens: new Float32Array(12), pull: 0, pullT: -9, beats: 0, sky: Array.from({ length: 10 }, (_, i) => [i * 0.1 + rnd() * 0.04, 0.05 + rnd() * 0.04, 0.12 + rnd() * 0.25]) });
    for (let X = -20; X < 30; X += w.segs[w.segs.length - 1].len) w.segs.push(bankSeg(rnd, kind, X));
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a);
    const C = { vx: 0.5 * N, hz: 0.42 * N, F: 0.55 * N, H: 1.5 }, cam = w.X + 4, half = (0.5 * N) / (C.F / KB.wall) + 2;
    for (const h of hits) {
      if (isLow(h)) { w.pull = 2.5; w.pullT = t; } // the screens up, one passenger after the other
      else if (h.kind === 'snare' && !w.bridge) w.bridge = { X: cam + half + 6 };
      else if (h.kind === 'hat') for (let k = 0; k < 4; k++) w.spray.push({ X: w.X + 8, Y: 0.5, Z: KB.Z + (rnd() - 0.5), vX: w.V * 0.6, vY: 2 + rnd() * 2, vZ: (rnd() - 0.5) * 6 });
    }
    if (f.section === 'change') w.kind = rollW(rnd, BANK_W, band);
    if (f.section === 'drop') { w.surge = 3; w.wave = { Z: KB.Z + 1, amp: 1, hit: false }; s.shake = Math.max(s.shake, 0.4); }
    if (beatTick(w, f, dt)) w.beats++;
    w.surge -= dt; w.pull -= dt;
    const vT = (6 + 6 * energy(f)) * (w.surge > 0 ? 2 : 1);
    w.V = follow(w.V, vT, dt, w.surge > 0 ? 0.5 : 1.2);
    w.pitch = follow(w.pitch, w.surge > 0 ? 0.06 : 0, dt, 0.4); // the bow lifts as it digs in and surges
    w.X += w.V * dt;
    // the screens: each rises on its rope after its neighbour, comes down again a while later
    for (let i = 0; i < w.screens.length; i++) w.screens[i] = follow(w.screens[i], w.pull > 0 && t - w.pullT > i * 0.06 ? 1 : 0, dt, 0.15);
    // the bank goes by: segments drop off behind and are laid ahead in the canal's kind of the moment
    while (w.segs.length && w.segs[0].X0 + w.segs[0].len < cam - half - 4) w.segs.shift();
    while (w.segs[w.segs.length - 1].X0 + w.segs[w.segs.length - 1].len < cam + half + 6) { const l = w.segs[w.segs.length - 1]; w.segs.push(bankSeg(rnd, w.kind, l.X0 + l.len)); }
    // the wake from the bow: crests run out at the Kelvin fraction of the speed, bounce off the wall, slap it
    w.emit += dt;
    while (w.emit > 0.08) { w.emit -= 0.08; for (const dz of [-1, 1]) w.crests.push({ X: w.X + 7.5, Z: KB.Z + dz * 0.6, dz, c: KELVIN * w.V, amp: 0.9, age: 0 }); }
    for (const c of w.crests) {
      c.Z += c.dz * c.c * dt; c.age += dt; c.amp *= Math.exp(-dt / 2.5);
      if (c.Z >= KB.wall && c.dz > 0) { c.Z = 2 * KB.wall - c.Z; c.dz = -1; c.amp *= 0.7; if (c.amp > 0.35 && rnd() < 0.5) w.splash.push({ X: c.X, Y: 0, vX: (rnd() - 0.5), vY: 1.5 + 3 * c.amp * rnd() }); }
    }
    w.crests = w.crests.filter((c) => c.amp > 0.15 && c.Z > 1.2 && c.X > cam - half * 1.5); // (nearer than 1.4 m the water is under the frame)
    if (w.wave) { // the drop's wave: one long crest across, bursting on the wall
      const wv = w.wave;
      wv.Z += 3.5 * dt;
      if (!wv.hit && wv.Z >= KB.wall) { wv.hit = true; for (let k = 0; k < 40; k++) w.splash.push({ X: cam + (rnd() - 0.5) * 2 * half, Y: 0, vX: (rnd() - 0.5) * 2, vY: 3 + rnd() * 4 }); s.shake = Math.max(s.shake, 0.3); }
      if (wv.hit) { wv.amp *= Math.exp(-dt * 1.5); wv.Z = Math.min(wv.Z, KB.wall); }
      if (wv.amp < 0.1) w.wave = null;
    }
    const bowX = w.X + KB.L / 2;
    for (let k = 0, n = Math.round(w.V * 6 * dt); k < n; k++) w.spray.push({ X: bowX - rnd(), Y: 0.4, Z: KB.Z + (rnd() < 0.5 ? -0.8 : 0.8), vX: w.V * (0.5 + 0.3 * rnd()), vY: 1 + rnd() * 2.5, vZ: (rnd() - 0.5) * 4 });
    for (const p of w.spray) { p.vY -= G * dt; p.X += p.vX * dt; p.Y += p.vY * dt; p.Z += p.vZ * dt; }
    w.spray = w.spray.filter((p) => p.Y > 0);
    for (const p of w.splash) { p.vY -= G * dt; p.X += p.vX * dt; p.Y += p.vY * dt; }
    w.splash = w.splash.filter((p) => p.Y > 0 || p.vY > 0);
    if (w.bridge && w.bridge.X < cam - half - 8) w.bridge = null;
    const under = w.bridge && w.bridge.X + 2.5 > w.X - KB.L / 2 - 1.5 && w.bridge.X < bowX + 3;
    w.duck = follow(w.duck, under ? 1 : 0, dt, 0.12);

    // the far bank, mirrored in the canal; the towers of the city far off over the roofs
    const kw = C.F / KB.wall, wl = C.hz + C.H * kw, sx = (X) => C.vx + (X - cam) * kw, sy = (Y) => wl - Y * kw;
    skyline(r, N, u, C.hz, w.sky, DARK + DIM, LMID + DIM, 0.12);
    for (const sg of w.segs) {
      const x0 = sx(sg.X0), x1 = sx(sg.X0 + sg.len), ww = x1 - x0, hs = sg.seed;
      if (sg.kind === 'concrete') { // a grey back wall: barred windows, an air conditioner, a pipe, a tank on the roof
        r.rect(x0, sy(sg.h), ww, sy(0) - sy(sg.h), MID + DIM);
        for (let fl = 0; fl < 3; fl++) for (let i = 0; i < 2; i++) { const wx = x0 + ww * (0.15 + i * 0.45), wy = sy(1.5 + fl * 2.6 + 1.5); r.rect(wx, wy, ww * 0.25, 1.2 * kw, hash(hs + i, fl) < 0.5 ? LMID + DIM : DARK); for (let b = 1; b < 4; b++) r.rect(wx + (ww * 0.25 * b) / 4, wy, 1, 1.2 * kw, DARK); }
        r.rect(x0 + ww * 0.7, sy(3.2), 0.8 * kw, 0.6 * kw, LMID);
        r.rect(x0 + ww * 0.92, sy(sg.h), Math.max(1, 0.15 * kw), sg.h * kw, LMID + DIM);
        r.rect(x0 + ww * 0.3, sy(sg.h + 1.2), 1.4 * kw, 1.2 * kw, DARK);
      } else { // a wooden house on stilts: posts in the water, plank walls, a lit window, a pitched roof, laundry
        for (let p = 0.1; p < 1; p += 0.25) r.rect(x0 + ww * p, sy(1.3), Math.max(1, 0.2 * kw), 1.3 * kw, DARK);
        r.rect(x0 + 0.2 * kw, sy(sg.h - 1.2), ww - 0.4 * kw, (sg.h - 2.5) * kw, DARK);
        for (let p = 0.2; p < 1; p += 0.2) r.rect(x0 + ww * p, sy(sg.h - 1.2), 1, (sg.h - 2.5) * kw, DARK + DIM);
        r.poly([[x0 - 0.3 * kw, sy(sg.h - 1.2)], [x1 + 0.3 * kw, sy(sg.h - 1.2)], [x1 - ww * 0.25, sy(sg.h + 0.3)], [x0 + ww * 0.25, sy(sg.h + 0.3)]], MID + DIM);
        r.rect(x0 + ww * 0.35, sy(3.2), ww * 0.22, 1 * kw, hash(hs, 1) < 0.7 ? BRIGHT + DIM : DARK);
        r.line(x0 + ww * 0.05, sy(2.3), x1 - ww * 0.05, sy(2.1), LMID + DIM);
        for (let i = 0; i < 3; i++) r.rect(x0 + ww * (0.15 + i * 0.25), sy(2.2), 0.4 * kw, 0.5 * kw, [HOT, COOL, LMID][(hs + i) % 3]);
        r.disc(x0 + ww * 0.8, sy(1.6), 0.45 * kw, DARK + DIM);
        if (sg.kind === 'market') { // a vendor's boat moored at the house: produce in heaps, a hat like a cone
          r.poly([[x0 + 0.5 * kw, sy(0)], [x1 - 0.5 * kw, sy(0)], [x1, sy(0.6)], [x0, sy(0.6)]], DARK);
          for (let i = 0; i < 5; i++) r.disc(x0 + ww * (0.2 + i * 0.12), sy(0.75), 0.3 * kw, [HOT, COOL, BRIGHT][(hs + i) % 3]);
          r.rect(x0 + ww * 0.75 - 0.25 * kw, sy(1.4), 0.5 * kw, 0.8 * kw, FIG); r.poly([[x0 + ww * 0.75 - 0.6 * kw, sy(1.4)], [x0 + ww * 0.75 + 0.6 * kw, sy(1.4)], [x0 + ww * 0.75, sy(2)]], LMID);
        }
      }
    }
    r.rect(0, wl - Math.max(1, 0.15 * kw), N, Math.max(1, 0.15 * kw), DARK);
    reflect(r, wl, N, t, (0.5 + f.level) * u, DARK + DIM);
    // the wake on the water, and the drop's wave
    for (const c of w.crests) { const k = proj(C, c.X - cam, 0, c.Z), len = (0.8 + c.age * 0.7) * k; r.rect(PX - len / 2, PY, len, Math.max(1, 0.12 * k), c.amp > 0.65 ? BRIGHT + DIM : c.amp > 0.4 ? LMID : LMID + DIM); }
    if (w.wave) { const k = proj(C, 0, 0, w.wave.Z), y = PY; r.rect(0, y - 0.25 * k * w.wave.amp, N, Math.max(1, 0.3 * k * w.wave.amp), LMID); for (let x = 0; x < N; x += 2) if (hash(x, (t * 8) | 0) < 0.5 * w.wave.amp) r.set(x, y - 0.35 * k * w.wave.amp, BRIGHT); }
    if (w.bridge) { const X0 = w.bridge.X - cam; quad3(r, C, X0 + 0.6, 0, KB.wall - 0.5, X0 + 1.9, 0, KB.wall - 0.5, X0 + 1.9, 2.25, KB.wall - 0.5, X0 + 0.6, 2.25, KB.wall - 0.5, MID + DIM); } // its pier, behind the boat
    // the spray: what flies on the far side of the hull goes behind the boat, the rest in front of it
    const sprays = (far) => { for (const p of w.spray) if ((p.Z > KB.Z) === far) { proj(C, p.X - cam, p.Y, p.Z); r.rect(PX, PY, Math.max(1, 0.7 * u), Math.max(1, 0.7 * u), p.vY > 0 ? BRIGHT : LMID); } };
    sprays(true);
    // the boat: hull, the riders under the canopy, the screens on their ropes; bow up in a surge, a bob on the beat
    const k = C.F / KB.Z, by = C.hz + C.H * k + f.beat.pulse * 0.06 * k, bx = C.vx + (w.X - cam) * k, cp = Math.cos(w.pitch), spt = Math.sin(w.pitch);
    const P = (m, Y) => { const dm = m + KB.L / 2; return [bx + (-KB.L / 2 + dm * cp - Y * spt) * k, by - (dm * spt + Y * cp) * k]; };
    const roof = lerp(2.6, 1.85, w.duck), head = lerp(1.65, 1.2, w.duck);
    r.poly([P(-8, 0), P(6.3, 0), P(8, 0.9), P(8, 1.15), P(-8, 1.05)], MID);
    r.poly([P(-8, 0.8), P(7.2, 0.8), P(7.6, 1.0), P(-8, 1.0)], BRIGHT);
    for (let i = 0; i < 12; i++) { // the riders, heads down under a bridge, each holding the rope of their screen while it goes up
      const m = -7.3 + i * 1.08, [hx, hy] = P(m, head), [sx2, sy2] = P(m, head - 0.35), up = w.screens[i];
      r.rect(sx2 - 0.22 * k, sy2, 0.44 * k, 0.4 * k, i % 3 ? FIG : MID); r.disc(hx, hy, 0.17 * k, FIG);
      if (up > 0.05 && up < 0.95) { const [rx, ry] = P(m + 0.3, 1.0 + 0.8 * up); r.line(sx2, sy2, rx, ry, FIG); }
    }
    for (let i = 0; i < 12; i++) { // a sheet of clear plastic: every other cell, the riders show through
      const m = -7.8 + i * 1.08, up = w.screens[i];
      if (up < 0.03) continue;
      const [ax, ay] = P(m, 1.05), [cx2, cy2] = P(m + 1.08, 1.05 + 0.85 * up), y0 = Math.round(Math.min(ay, cy2)), y1 = Math.round(Math.max(ay, cy2)), x0 = Math.round(Math.min(ax, cx2)), x1 = Math.round(Math.max(ax, cx2));
      for (let y = Math.max(0, y0); y < Math.min(N, y1); y++) for (let x = Math.max(0, x0) + (y & 1); x < Math.min(N, x1); x += 2) r.buf[y * N + x] = COOL;
    }
    for (let m = -7.6; m <= 6.2; m += 3.45) { const [ax, ay] = P(m, 1.05), [cx2, cy2] = P(m, roof); r.line(ax, ay, cx2, cy2, DARK); }
    r.poly([P(-7.9, roof), P(6.4, roof), P(6.4, roof + 0.2), P(-7.9, roof + 0.2)], HOT);
    const [blx, bly] = P(8, 0);
    mirrorBox(r, blx - KB.L * k - 2, blx + 2, by, Math.round(2.8 * k), bits(MID, HOT, FIG, COOL, DARK, BRIGHT), t);
    targets.push({ x: blx - KB.L * k, y: by - (roof + 0.2) * k, w: KB.L * k, h: (roof + 0.2) * k });
    sprays(false);
    for (const p of w.splash) { r.rect(sx(p.X), sy(p.Y), Math.max(1, 0.8 * u), Math.max(1, 0.8 * u), BRIGHT); }
    if (w.bridge) { // a low bridge over the canal: its underside and the face turned toward us, over the boat
      const X0 = w.bridge.X - cam, X1 = X0 + 2.5, Xf = X1 < 0 ? X1 : X0;
      quad3(r, C, X0, 2.25, 2.5, X1, 2.25, 2.5, X1, 2.25, KB.wall, X0, 2.25, KB.wall, DARK);
      quad3(r, C, Xf, 2.25, 2.5, Xf, 2.75, 2.5, Xf, 2.75, KB.wall, Xf, 2.25, KB.wall, MID);
    }
  },
};

// ---------------------------------------------------------------------------------------------- rooftopbar
// A bar on top of a tower at night: the city far below in perspective (streets running to the vanishing point with
// cars' lights streaming along them, blocks with their roofs seen from above and lit windows, the tall ones rising
// past the horizon), a glass rail, the counter. The bartender shakes on the beat, two strokes a beat; the ice in a
// glass on the counter bobs and clinks on the hats; the wind comes with the treble (the awning's fringe, a potted
// palm). Kinds: the view (a river winding through, the street grid, a cluster of towers with blinking beacons). A
// drop: lightning in a storm far off over the horizon, and a moment later the thunder shivers the glass.
const VIEW_W = { river: [3, 2, 1], grid: [2, 2, 2], towers: [1, 2, 3] };
const ROOF_H = 220; // metres up

function cityBlocks(rnd, kind) {
  const out = [];
  for (let i = 0; i < 46; i++) {
    const Z = 800 + rnd() * rnd() * 5200, X = (rnd() - 0.5) * Z * 1.1, tall = kind === 'towers' ? rnd() < 0.35 : rnd() < 0.08;
    if (kind === 'river' && Math.abs(X - 260 * Math.sin(Z / 700)) < 160) continue;
    out.push({ X, Z, w: 30 + rnd() * 50, d: 25 + rnd() * 40, h: tall ? 200 + rnd() * 140 : 20 + rnd() * 90, seed: (rnd() * 1e4) | 0, beacon: tall });
  }
  return out.sort((p, q) => q.Z - p.Z);
}

const rooftopbar = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), view = rollW(rnd, VIEW_W, band);
    Object.assign(w, { view, blocks: cityBlocks(rnd, view), cars: Array.from({ length: 90 }, () => ({ st: (rnd() * 7) | 0, q: rnd(), dir: rnd() < 0.5 ? 1 : -1, v: 0.6 + rnd() * 0.6 })),
      ice: Array.from({ length: 4 }, (_, i) => ({ x: (i - 1.5) * 0.25, y: 0, vy: 0 })), clink: 0, cx: 0, bolt: 0, boltPts: [], thunder: -1, slosh: 0, palm: 0, beats: 0, led: COOL });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a);
    const C = { vx: 0.5 * N, hz: 0.34 * N, F: 1.2 * N, H: ROOF_H }, rail = 0.64 * N, top = 0.8 * N;
    for (const h of hits) {
      if (h.kind === 'hat') { const c = pick(rnd, w.ice); c.vy -= 0.6 + 0.6 * h.strength; w.clink = 0.12; w.cx = c.x; }
      if (isTonal(h) && h.kind !== 'hat') w.led = h.pc % 2 ? COOL : HOT;
    }
    if (f.section === 'change') { w.view = rollW(rnd, VIEW_W, band); w.blocks = cityBlocks(rnd, w.view); }
    if (f.section === 'drop') { // a strike far off: a jagged bolt down to the horizon; the thunder comes after, the way sound does
      w.bolt = 0.6; w.thunder = 1.6;
      let x = (0.12 + rnd() * 0.25) * N, y = C.hz - 0.2 * N;
      w.boltPts = [[x, y]];
      while (y < C.hz) { x += (rnd() - 0.5) * 0.04 * N; y += (0.02 + rnd() * 0.03) * N; w.boltPts.push([x, Math.min(y, C.hz)]); }
    }
    w.bolt -= dt; w.clink -= dt;
    if (w.thunder > 0 && (w.thunder -= dt) <= 0) { w.slosh = 1; for (const c of w.ice) c.vy -= 0.8; s.shake = Math.max(s.shake, 0.3); }
    w.slosh *= Math.exp(-dt * 2.5);
    if (beatTick(w, f, dt)) w.beats++;
    // the sky: dark, a glow of the city at the horizon, the storm's clouds lit from inside while the bolt flickers
    const flick = w.bolt > 0 && Math.floor(w.bolt * 20) % 3 !== 1;
    for (let y = Math.max(0, Math.round(C.hz - 0.12 * N)); y < C.hz; y++) { const lv = 1 - (C.hz - y) / (0.12 * N); for (let x = (y & 1); x < N; x += 2) if (bayer(x, y) < lv * 0.7) r.buf[y * N + x] = DARK; }
    for (let k = 0; k < 6; k++) puff(r, (0.08 + k * 0.06) * N, C.hz - (0.08 + 0.03 * Math.sin(k * 2.1)) * N, (0.05 + 0.02 * hash(k, 3)) * N, flick ? LMID : DARK + DIM);
    if (flick) { for (let i = 1; i < w.boltPts.length; i++) r.stroke(w.boltPts[i - 1][0], w.boltPts[i - 1][1], w.boltPts[i][0], w.boltPts[i][1], Math.max(1, u), WHITE); }
    // the ground far below: blocks and streets running to the vanishing point, the river if there is one
    const yZ = (Z) => C.hz + (C.H * C.F) / Z, zNear = (C.H * C.F) / (rail - C.hz);
    r.rect(0, C.hz, N, rail - C.hz, BG);
    if (w.view === 'river') {
      const pts = [];
      for (let Z = zNear; Z < 9000; Z *= 1.15) { const X = 260 * Math.sin(Z / 700) - 110; pts.push([C.vx + (X * C.F) / Z, yZ(Z)]); }
      for (let Z = 9000; Z > zNear; Z /= 1.15) { const X = 260 * Math.sin(Z / 700) + 110; pts.push([C.vx + (X * C.F) / Z, yZ(Z)]); }
      r.poly(pts, DARK + DIM);
      for (let i = 0; i < 40; i++) { const Z = zNear * Math.pow(9000 / zNear, hash(i, 9)), X = 260 * Math.sin(Z / 700) + (hash(i, 8) - 0.5) * 180; r.set(C.vx + (X * C.F) / Z + Math.sin(t * 2 + i) * u, yZ(Z), LMID + DIM); }
    }
    const streets = [-900, -450, -150, 150, 450, 900, 1500];
    for (const X of streets) { proj(C, X, 0, zNear); const ax = PX, ay = PY; proj(C, X, 0, 9000); r.line(ax, ay, PX, PY, DARK); }
    for (let Z = 1000; Z < 6000; Z *= 1.35) r.rect(0, yZ(Z), N, 1, DARK);
    w.run = (w.run || 0) + (dt * (12 + 18 * energy(f))) / 8000; // the traffic at street speed: from up here it creeps
    for (const c of w.cars) { // lights along the streets: white headlights coming toward us (dir 1), red tail lights going away, on the left
      const q = (((c.q - w.run * c.v * c.dir) % 1) + 1) % 1, Z = zNear + q * 8000, X = streets[c.st] + c.dir * 6;
      r.set(C.vx + (X * C.F) / Z, yZ(Z), c.dir > 0 ? BRIGHT : HOT);
    }
    const st = Math.max(2, Math.round(2.2 * u)), lit = 0.25 + 0.15 * f.level;
    for (const b of w.blocks) {
      const k = C.F / b.Z, x0 = C.vx + (b.X - b.w / 2) * k, x1 = C.vx + (b.X + b.w / 2) * k, yb = yZ(b.Z), yt = C.hz + (C.H - b.h) * k;
      if (x1 < 0 || x0 > N || yt > rail) continue;
      const kb = C.F / (b.Z + b.d), ytb = C.hz + (C.H - b.h) * kb;
      if (b.h < C.H) r.poly([[x0, yt], [x1, yt], [C.vx + (b.X + b.w / 2) * kb, ytb], [C.vx + (b.X - b.w / 2) * kb, ytb]], MID + DIM); // the roof, seen from above
      if (b.X - b.w / 2 > 0) quad3(r, C, b.X - b.w / 2, 0, b.Z, b.X - b.w / 2, b.h, b.Z, b.X - b.w / 2, b.h, b.Z + b.d, b.X - b.w / 2, 0, b.Z + b.d, DARK + DIM);
      else if (b.X + b.w / 2 < 0) quad3(r, C, b.X + b.w / 2, 0, b.Z, b.X + b.w / 2, b.h, b.Z, b.X + b.w / 2, b.h, b.Z + b.d, b.X + b.w / 2, 0, b.Z + b.d, DARK + DIM);
      r.rect(x0, yt, x1 - x0, yb - yt, DARK);
      for (let y = Math.max(0, Math.round(yt + 1)), j = 0; y < Math.min(rail, yb - 1); y += st, j++)
        for (let x = Math.max(0, Math.round(x0 + 1)), i = 0; x < Math.min(N, x1 - 1); x += st, i++) if (hash(b.seed + i, j + ((w.beats >> 3) & 1) * (hash(i, j) < 0.05 ? 1 : 0)) < lit) r.buf[y * N + x] = hash(i + 7, j + b.seed) < 0.25 ? BRIGHT : LMID + DIM;
      if (b.beacon) r.rect(C.vx + b.X * k - 1, yt - 2, Math.max(1, u), Math.max(1, u), w.beats % 2 ? HOT : DARK); // aviation lights, on the beat
    }
    // the rail of glass, the fringe of the awning and the palm in the wind, the counter with its lit edge
    r.rect(0, rail, N, top - rail, DARK + DIM);
    r.rect(0, rail, N, Math.max(1, u), LMID);
    for (let x = 0.1 * N; x < N; x += 0.2 * N) r.rect(x, rail, Math.max(1, u), top - rail, MID + DIM);
    const wind = f.rel.trebDrive;
    for (let i = 0; i < 16; i++) { const x = (i + 0.5) * (N / 16), sw = Math.sin(t * (4 + 8 * wind) + i * 1.3) * (0.4 + 2.5 * wind) * u; r.poly([[x - N / 32, 0], [x + N / 32, 0], [x + sw, 0.045 * N]], i % 2 ? HOT : BRIGHT + DIM); }
    w.palm = follow(w.palm, wind * 0.6 + 0.1 * Math.sin(t * (2 + 6 * wind)) * wind, dt, 0.2);
    const pxm = 0.93 * N, pym = top - 0.02 * N;
    r.rect(pxm - 0.03 * N, pym - 0.05 * N, 0.06 * N, 0.07 * N, MID);
    for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k - 2.5) * 0.45 - w.palm, L = 0.12 * N; r.stroke(pxm, pym - 0.05 * N, pxm + Math.cos(a) * L, pym - 0.05 * N + Math.sin(a) * L * 0.8 + 0.02 * N * Math.abs(k - 2.5), Math.max(1, 1.5 * u), COOL + DIM); }
    // the bartender: two strokes of the shaker a beat over the shoulder, the body swaying with it
    const ph = beatLocked(f) ? f.beat.phase : (t * bpsOf(f)) % 1, shk = Math.sin(ph * TAU * 2), bxm = 0.66 * N + shk * 0.005 * N, bym = top;
    r.rect(bxm - 0.06 * N, bym - 0.2 * N, 0.12 * N, 0.2 * N, FIG); r.rect(bxm - 0.035 * N, bym - 0.2 * N, 0.07 * N, 0.2 * N, DARK);
    r.disc(bxm, bym - 0.25 * N, 0.04 * N, FIG); r.rect(bxm - 0.04 * N, bym - 0.29 * N, 0.08 * N, 0.02 * N, DARK);
    const hx = bxm + 0.07 * N + shk * 0.03 * N, hy = bym - 0.27 * N - Math.abs(shk) * 0.01 * N;
    r.stroke(bxm + 0.05 * N, bym - 0.18 * N, hx, hy + 0.02 * N, Math.max(1, 0.02 * N), FIG); r.stroke(bxm - 0.05 * N, bym - 0.18 * N, hx - 0.01 * N, hy + 0.05 * N, Math.max(1, 0.02 * N), FIG);
    r.rect(hx - 0.015 * N, hy - 0.04 * N, 0.03 * N, 0.07 * N, LMID); r.rect(hx - 0.015 * N, hy - 0.04 * N, 0.03 * N, 0.012 * N, BRIGHT);
    targets.push({ x: bxm - 0.06 * N, y: bym - 0.3 * N, w: 0.2 * N, h: 0.3 * N });
    r.rect(0, top, N, N - top, DARK);
    r.rect(0, top, N, Math.max(1, 1.5 * u), w.led);
    // the glass: the drink, its ice floating at the top, a straw; a clink lights where the cubes touched
    const gx = 0.28 * N, gw = 0.09 * N, gh = 0.17 * N, gb = N - 0.03 * N, lev = gb - gh * 0.75;
    r.frame(Math.round(gx - gw / 2), Math.round(gb - gh), Math.round(gw), Math.round(gh), LMID + DIM);
    for (let y = Math.round(lev); y < gb - 1; y++) { const wv = Math.round(Math.sin(t * 9 + y * 0.4) * w.slosh * 2 * u); r.rect(gx - gw / 2 + 1 + (y === Math.round(lev) ? wv : 0), y, gw - 2, 1, y < lev + 2 ? HOT : HOT + DIM); }
    for (const c of w.ice) { // each cube a damped spring about where it floats
      c.vy += (-60 * c.y - 4 * c.vy) * dt; c.y += c.vy * dt;
      const cxm = gx + c.x * gw, cym = lev + c.y * 0.05 * N, cs = 0.022 * N;
      r.rect(cxm - cs / 2, cym - cs * 0.3, cs, cs, BRIGHT + DIM); r.frame(Math.round(cxm - cs / 2), Math.round(cym - cs * 0.3), Math.round(cs), Math.round(cs), BRIGHT);
    }
    r.stroke(gx + gw * 0.15, lev + 0.03 * N, gx + gw * 0.35, gb - gh - 0.04 * N, Math.max(1, 1.2 * u), COOL);
    if (w.clink > 0) { const cxm = gx + w.cx * gw, cym = lev - 0.01 * N, a = 0.012 * N; r.line(cxm - a, cym, cxm + a, cym, WHITE); r.line(cxm, cym - a, cxm, cym + a, WHITE); }
  },
};

// ---------------------------------------------------------------------------------------------- monsoon
// A downpour on a street of shophouses: rain in slanting sheets that sweep across with the wind, the street flooded
// and the water rising a step with every section, the lit shops mirrored in it and every drop ringing it. People
// wade through slowly with umbrellas, the water at their shins and then their knees; a tuk-tuk pushes through on a
// kick with a bow wave piled in front of it and a wake spreading behind; plastic bags drift on the current and bob.
// The awnings drip on the beat, a snare is a gust. Kinds: who is out (umbrellas, a vendor pushing a cart, children
// splashing). A drop: lightning and its flash, then the rain eases for a while.
const WADE_W = { umbrellas: [3, 2, 1], vendors: [2, 2, 2], kids: [1, 2, 3] };

function wader(rnd, kind, X, dir) { return { kind, X, Z: 6 + rnd() * 4, dir, h: kind === 'kids' ? 1.15 : 1.6 + rnd() * 0.15, ph: rnd() * TAU, col: pick(rnd, [HOT, COOL, BRIGHT]), hop: 0, vh: 0 }; }

const monsoon = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), kind = rollW(rnd, WADE_W, band);
    Object.assign(w, { kind, level: 0.08, levelT: 0.08, drops: [], rings: [], drips: [], spray: [], crests: [], ease: 0, flash: 0, bolt: [], gust: 0, tuk: null, beats: 0,
      people: Array.from({ length: 4 }, (_, i) => wader(rnd, kind, -9 + i * 5, rnd() < 0.5 ? 1 : -1)),
      bags: Array.from({ length: 5 }, () => ({ X: (rnd() - 0.5) * 20, Z: 4 + rnd() * 8, ph: rnd() * TAU, col: pick(rnd, [COOL, HOT, BRIGHT]), a: rnd() * TAU })),
      shops: Array.from({ length: 6 }, (_, i) => ({ X: -16 + i * 6, open: rnd(), sign: pick(rnd, NEON), col: rnd() < 0.5 ? HOT : COOL, seed: (rnd() * 1e4) | 0 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = bpsOf(f);
    const C = { vx: 0.5 * N, hz: 0.45 * N, F: 0.75 * N, H: 1.6 }, ZS = 14, half = (Z) => (0.5 * N) / (C.F / Z) + 2;
    for (const h of hits) {
      if (isLow(h)) { // a tuk-tuk comes through; if one already is, a child jumps or someone stamps
        if (!w.tuk) { const dir = rnd() < 0.5 ? 1 : -1; w.tuk = { X: -dir * (half(8) + 2), dir, roll: 0, emit: 0 }; }
        else { const p = pick(rnd, w.people); if (p.kind === 'kids') p.vh = 1.6; else for (let k = 0; k < 8; k++) w.spray.push({ X: p.X, Y: w.level, Z: p.Z, vX: (rnd() - 0.5) * 1.5, vY: 0.8 + rnd() * 1.5, vZ: rnd() - 0.5 }); }
      }
      else if (h.kind === 'snare') w.gust = 1;
      else if (h.kind === 'hat') for (const sh of w.shops) if (rnd() < 0.3) w.drips.push({ X: sh.X + rnd() * 5, Y: 3.1, vY: 0 });
      if (isTonal(h) && h.kind !== 'hat') pick(rnd, w.shops).col = h.pc % 2 ? COOL : HOT;
    }
    if (f.section === 'change') { w.levelT = Math.min(0.6, w.levelT + 0.12); w.kind = rollW(rnd, WADE_W, band); } // the water comes up a step
    if (f.section === 'drop') { // the strike: a jagged bolt to a roof, the flash, then the rain lets up
      w.flash = 0.12; w.ease = 6; s.shake = Math.max(s.shake, 0.5);
      let x = (0.2 + rnd() * 0.6) * N, y = 0; w.bolt = [[x, y]];
      while (y < 0.12 * N) { x += (rnd() - 0.5) * 0.05 * N; y += (0.015 + rnd() * 0.02) * N; w.bolt.push([x, y]); }
    }
    const beat = beatTick(w, f, dt);
    if (beat) { w.beats++; for (const sh of w.shops) w.drips.push({ X: sh.X + 0.5 + hash(w.beats, sh.seed) * 4, Y: 3.1, vY: 0 }); } // the awnings drip on the beat
    w.level = follow(w.level, w.levelT, dt, 3); w.ease -= dt; w.flash -= dt; w.gust = Math.max(0, w.gust - dt * 1.5);
    const rain = (0.35 + 0.65 * f.level) * (w.ease > 0 ? 0.25 + 0.75 * clamp(1 - w.ease / 6) ** 2 : 1), wind = (0.15 + 0.35 * f.rel.midDrive + 0.5 * w.gust) * N;
    // the people wade: a step every other beat with the stride of their height, so their feet stay where they plant
    for (const p of w.people) {
      const om = Math.PI * bps * 0.5 * (p.kind === 'vendors' ? 0.8 : 1); // pushing a cart: slower steps, and slower by just as much
      p.X += p.dir * stepV(p.h, om) * dt;
      p.ph += om * dt;
      if (p.vh || p.hop > 0) { p.vh -= G * dt; p.hop += p.vh * dt; if (p.hop <= 0) { p.hop = 0; p.vh = 0; for (let k = 0; k < 10; k++) w.spray.push({ X: p.X, Y: w.level, Z: p.Z, vX: (rnd() - 0.5) * 2, vY: 1 + rnd() * 2, vZ: (rnd() - 0.5) }); } }
      if (Math.abs(p.X) > half(p.Z) + 1) { Object.assign(p, wader(rnd, w.kind, 0, p.dir)); p.X = -p.dir * (half(p.Z) + 0.5); } // back in past the other edge at the new depth
    }
    for (const b of w.bags) { b.X += (0.25 + 0.002 * wind / u) * dt; b.a += 0.4 * dt; if (b.X > half(b.Z)) b.X = -half(b.Z); } // carried on the current
    if (w.tuk) { // a bow wave in front, a wake behind spreading at the Kelvin angle
      const T = w.tuk, v = 3 + 2 * energy(f);
      T.X += T.dir * v * dt; T.roll += (v * dt) / 0.24; T.emit += dt;
      while (T.emit > 0.1) { T.emit -= 0.1; for (const dz of [-1, 1]) w.crests.push({ X: T.X + T.dir * 1.3, Z: 8 + dz * 0.6, dz, c: KELVIN * v, amp: 0.8 }); }
      for (let k = 0, n = Math.round(30 * dt * v); k < n; k++) w.spray.push({ X: T.X + T.dir * 1.5, Y: w.level, Z: 8 + (rnd() - 0.5) * 1.2, vX: T.dir * (v + rnd() * 1.5), vY: 0.8 + rnd() * 1.6 * w.level / 0.3, vZ: (rnd() - 0.5) * 2 });
      if (Math.abs(T.X) > half(8) + 3) w.tuk = null;
    }
    for (const c of w.crests) { c.Z += c.dz * c.c * dt; c.amp *= Math.exp(-dt / 1.8); }
    w.crests = w.crests.filter((c) => c.amp > 0.15 && c.Z > 1.3 && c.Z < ZS); // out of the bottom of the frame, or up to the shops' steps
    for (const p of w.spray) { p.vY -= G * dt; p.X += p.vX * dt; p.Y += p.vY * dt; p.Z += p.vZ * dt; }
    w.spray = w.spray.filter((p) => p.Y > w.level - 0.05);
    for (const d of w.drips) { d.vY -= G * dt; d.Y += d.vY * dt; }
    w.drips = w.drips.filter((d) => d.Y > w.level);
    for (let k = 0, n = Math.round(rain * 150 * dt); k < n; k++) w.rings.push({ X: (rnd() - 0.5) * 2 * half(9), Z: 3 + rnd() * 10, life: 0.35 });
    w.rings = w.rings.filter((g) => (g.life -= dt) > 0);

    // the shophouses: shutters half up on lit shops, awnings, windows and signs above
    const ks = C.F / ZS, gy = C.hz + C.H * ks, sx = (X) => C.vx + X * ks, sy = (Y) => gy - Y * ks;
    r.rect(0, sy(9), N, gy - sy(9), DARK);
    for (const sh of w.shops) {
      const x0 = sx(sh.X), ww = 5.6 * ks;
      r.rect(x0, sy(3), ww, 3 * ks, LMID + DIM);
      r.rect(x0, sy(3), ww, (0.6 + sh.open * 1.4) * ks, MID + DIM);
      for (let y = sy(3); y < sy(3) + (0.6 + sh.open * 1.4) * ks; y += 2) r.rect(x0, y, ww, 1, DARK);
      r.poly([[x0 - 0.2 * ks, sy(3.6)], [x0 + ww + 0.2 * ks, sy(3.6)], [x0 + ww + 0.2 * ks, sy(3.1)], [x0 - 0.2 * ks, sy(3.1)]], sh.col === HOT ? COOL + DIM : HOT + DIM);
      for (let fl = 0; fl < 2; fl++) for (let i = 0; i < 2; i++) r.rect(x0 + (0.8 + i * 2.6) * ks, sy(5.8 + fl * 2.6), 1.6 * ks, 1.4 * ks, hash(sh.seed + i, fl) < 0.5 ? BRIGHT + DIM : DARK + DIM);
      neon(r, x0 + 4.4 * ks, sy(8.4), 0.9 * ks, 2.4 * ks, sh.sign, sh.col, sh.seed, u, !(w.gust > 0.5 && hash(sh.seed, (t * 15) | 0) < 0.3));
    }
    // the flood: the street under water to the shops' steps, the shops mirrored in it, every drop ringing it
    const lw = C.hz + (C.H - w.level) * ks;
    r.rect(0, gy, N, N - gy, MID + DIM);
    reflect(r, lw, N, t, (0.6 + 1.2 * rain) * u, DARK + DIM);
    for (const g of w.rings) { const k = proj(C, g.X, w.level, g.Z), rr = (0.05 + (0.35 - g.life) * 0.6) * k; if (rr >= 1) r.ring(PX, PY, rr, 1, LMID + DIM, 0.3); }
    for (const c of w.crests) { const k = proj(C, c.X, w.level, c.Z); r.rect(PX - 0.6 * k, PY, 1.2 * k, Math.max(1, 0.05 * k), c.amp > 0.5 ? LMID : LMID + DIM); }
    for (const b of w.bags) { // a bag afloat: bobbing on the ripples, turning slowly
      const k = proj(C, b.X, w.level, b.Z), bob = Math.sin(t * 2.5 + b.ph) * 0.03 * k, bw = 0.3 * k * (0.6 + 0.4 * Math.abs(Math.cos(b.a)));
      r.rect(PX - bw / 2, PY - 0.08 * k + bob, bw, Math.max(1, 0.12 * k), b.col); r.ring(PX - bw * 0.2, PY - 0.12 * k + bob, Math.max(1, 0.05 * k), 1, b.col);
    }
    // people, the tuk-tuk: nearest last, the water's murk over what is under it, the dry part mirrored below
    const items = w.people.map((p) => [p.Z, p]);
    if (w.tuk) items.push([8, w.tuk]);
    items.sort((a, b) => b[0] - a[0]);
    for (const [Z, o] of items) {
      const k = C.F / Z, g = C.hz + C.H * k, wy = C.hz + (C.H - w.level) * k;
      let x0, x1, ytop;
      if (o === w.tuk) {
        const x = C.vx + o.X * k;
        tukSide(r, x, g, k, o.dir, o.roll, { col: MID, roof: COOL, pax: 2, arm: Math.sin(t * 4), trim: Math.floor(t * 5) });
        const fx = x + o.dir * 1.6 * k, bh = (0.15 + w.level * 0.5) * k; // the bow wave: water heaped against the front
        r.poly([[fx - o.dir * 0.5 * k, wy], [fx + o.dir * 0.7 * k, wy], [fx + o.dir * 0.1 * k, wy - bh]], LMID);
        x0 = x - 1.8 * k; x1 = x + 1.8 * k; ytop = g - 1.8 * k;
        targets.push({ x: x0, y: ytop, w: 3.6 * k, h: 1.8 * k });
      } else {
        const x = C.vx + o.X * k, hp = o.h * k, base = g - o.hop * k;
        const J = walker(r, x, base, hp, FIG, o.ph, o.dir, { coat: o.kind !== 'kids' });
        if (o.kind === 'vendors') { // a cart pushed ahead, a parasol on a pole over it
          const px = x + o.dir * 0.95 * k;
          r.rect(x + o.dir * 0.4 * k - (o.dir < 0 ? 1.1 * k : 0), base - 0.9 * k, 1.1 * k, 0.5 * k, MID);
          r.line(J.sx, J.sy + 0.3 * k, x + o.dir * 0.45 * k, base - 0.8 * k, FIG);
          r.line(px, base - 0.9 * k, px, base - 1.9 * k, FIG);
          r.poly([[px - 0.6 * k, base - 1.9 * k], [px + 0.6 * k, base - 1.9 * k], [px, base - 2.3 * k]], o.col);
        }
        else { // an umbrella held up in the near hand, tipped by a gust
          const tx = J.sx + o.dir * 0.1 * k + w.gust * 0.2 * k, ty = base - hp * 1.2, ur = hp * 0.42, pts = [];
          r.line(J.sx, J.sy + hp * 0.15, tx, ty, FIG);
          for (let q = 0; q <= 10; q++) { const a = Math.PI + (q / 10) * Math.PI + w.gust * 0.2; pts.push([tx + Math.cos(a) * ur, ty + Math.sin(a) * ur * 0.55]); }
          r.poly(pts, o.col);
        }
        x0 = x - hp * 0.5; x1 = x + hp * 0.5; ytop = base - hp * 1.45;
      }
      for (let y = Math.max(0, Math.round(wy)); y < Math.min(N, g + 2); y++) for (let x = Math.max(0, Math.round(x0)) + (y & 1); x < Math.min(N, x1); x += 2) r.buf[y * N + x] = MID + DIM; // under the water, murky
      r.ring((x0 + x1) / 2, wy, (x1 - x0) * 0.35, 1, LMID, 0.2);
      mirrorBox(r, x0, x1, wy, Math.round(wy - ytop), bits(FIG, HOT, COOL, BRIGHT, MID), t);
    }
    for (const p of w.spray) { proj(C, p.X, p.Y, p.Z); r.rect(PX, PY, Math.max(1, 0.7 * u), Math.max(1, 0.7 * u), LMID); }
    for (const d of w.drips) { proj(C, d.X, d.Y, ZS - 0.3); r.rect(PX, PY, Math.max(1, 0.6 * u), Math.max(1, 1.2 * u), LMID); }
    // the rain: sheets of it sweeping across with the wind, thick inside a sheet, thin between
    const want = Math.round(N * 1.6 * rain), v = N * 1.5;
    rainfall(W, w.drops, want, v, wind, 0, N, LMID + DIM);
    for (let i = 0; i < w.drops.length; i += 3) { const d = w.drops[i]; if (Math.sin((d.x - wind * t * 0.6) / (0.12 * N)) > 0.3) r.line(d.x, d.y, d.x - (wind / v) * 4 * u, d.y - 4 * u, LMID); }
    if (w.flash > 0) { // the lightning: everything lit at once, the bolt over the roofs
      for (let i = 0; i < r.buf.length; i++) { const c = r.buf[i]; r.buf[i] = c === BG || c === DARK || c >= DIM ? LMID : BRIGHT; }
      for (let i = 1; i < w.bolt.length; i++) r.stroke(w.bolt[i - 1][0], w.bolt[i - 1][1], w.bolt[i][0], w.bolt[i][1], Math.max(1, 1.5 * u), WHITE);
    }
  },
};

// ---------------------------------------------------------------------------------------------- railmarket
// A market laid on a railway, seen across the track while we drift along it: stalls on both sides, striped awnings
// on hinges reaching out over the rails, produce on the ground right beside them, shoppers walking along the
// sleepers, vendors on stools fanning themselves on the beat. A kick and a vendor tosses something to a shopper (a
// parabola from the stall to the hand), a snare flutters the awnings. On a drop a train creeps through: just ahead
// of it the awnings swing up on their hinges, the shoppers step aside, the goods sit inches from the wheels, and
// behind it the awnings swing back down. Kinds: what the stretch sells (fruit, fish on ice, greens and chillies).
const GOODS_W = { veg: [3, 2, 1], fruit: [2, 2, 2], fish: [1, 2, 3] };
// depths from us in metres; the carriage is 2.8 wide on the track (2.7 to 5.5), so who steps aside stands at 5.85,
// clear of it, among the stools
const RM = { near: 3.25, near2: 2.55, near3: 2.0, rail0: 3.6, rail1: 4.6, track: 4.1, far: 5.0, vend: 5.7, hingeF: 6.2, wall: 7.5, aside: 5.85, len: 20, La: 2.4, Yh: 3.0 };
const STRIPES = [[HOT, BRIGHT], [COOL, BRIGHT], [HOT, COOL], [LMID, MID]];

function stall(rnd, kind, X0, far) { return { X0, w: 3.2, kind, far, seed: (rnd() * 1e4) | 0, th: 0, om: 0, cols: pick(rnd, STRIPES) }; }
function shopper(rnd, X) { return { X, Z: RM.track, dir: rnd() < 0.5 ? 1 : -1, h: 1.5 + rnd() * 0.3, ph: rnd() * TAU, col: pick(rnd, [FIG, MID, LMID]), bag: pick(rnd, [HOT, COOL, BRIGHT]) }; }

const railmarket = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), kind = rollW(rnd, GOODS_W, band);
    Object.assign(w, { kind, cam: 0, stalls: [], people: [], train: null, lastTrain: 0, beats: 0, toss: [], flutter: 0, fanK: 0 });
    for (const far of [false, true]) for (let X = -16; X < 16; X += 3.6) w.stalls.push(stall(rnd, kind, X, far));
    for (let i = 0; i < 4; i++) w.people.push(shopper(rnd, -8 + i * 5 + rnd() * 2));
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = bpsOf(f);
    const C = { vx: 0.5 * N, hz: 0.45 * N, F: 0.5 * N, H: 1.7 }, half = (Z) => (0.5 * N) / (C.F / Z) + 2;
    // the train comes in far enough off that every stall it overlaps at first is out of the picture
    const newTrain = () => { const dir = rnd() < 0.5 ? 1 : -1; w.train = { dir, X: w.cam - dir * (half(2.7) + 6), roll: 0 }; w.lastTrain = w.beats; };
    for (const h of hits) {
      if (isLow(h)) { // a vendor tosses something to the nearest shopper: a parabola from the goods to where the hand will be
        const p = w.people.find((q) => q.Z < RM.track + 0.3 && Math.abs(q.X - w.cam) < half(RM.track) - 3);
        if (p) { const T = 0.7, x0 = p.X + (rnd() - 0.5) * 2, y0 = 0.5, z0 = RM.far, xt = p.X + (w.train ? 0 : p.dir * stepV(p.h, Math.PI * bps) * T); w.toss.push({ X: x0, Y: y0, Z: z0, vX: (xt - x0) / T, vY: (1.1 - y0 + 0.5 * G * T * T) / T, vZ: (RM.track - z0) / T, life: T, col: pick(rnd, [HOT, BRIGHT, COOL]) }); }
      } else if (h.kind === 'snare') w.flutter = 1;
      else if (h.kind === 'hat') w.fanK = 0.25;
    }
    if (f.section === 'change') w.kind = rollW(rnd, GOODS_W, band); // the stalls still to come sell it
    if (f.section === 'drop' && !w.train) newTrain();
    if (beatTick(w, f, dt)) { w.beats++; if (!w.train && w.beats - w.lastTrain > 64) newTrain(); }
    w.fanK -= dt;
    w.cam += (0.3 + 0.5 * energy(f)) * dt;
    const cam = w.cam;
    // stalls fall behind, new ones are laid ahead, both rows
    for (const far of [false, true]) {
      const row = w.stalls.filter((q) => q.far === far), last = row[row.length - 1];
      if (last.X0 < cam + half(far ? RM.wall : RM.near3) + 4) w.stalls.push(stall(rnd, w.kind, last.X0 + 3.6, far));
    }
    w.stalls = w.stalls.filter((q) => q.X0 + q.w > cam - half(q.far ? RM.wall : RM.near3) - 4);
    // the train creeps through; its reach: what it covers and the stretch just ahead it is about to
    const T = w.train, v = 4;
    let lo = 1e9, hi = -1e9;
    if (T) {
      T.X += T.dir * v * dt; T.roll += (v * dt) / 0.4;
      const front = T.X, rear = T.X - T.dir * (2 * RM.len + 1);
      lo = Math.min(front, rear) - (T.dir < 0 ? 6 : 1.5); hi = Math.max(front, rear) + (T.dir > 0 ? 6 : 1.5);
      if ((rear - cam) * T.dir > half(2.7) + 6) w.train = null;
    }
    // the awnings: a hinge pulled by a rope, up ahead of the train and down behind it; a snare sets them fluttering
    for (const a of w.stalls) {
      if (!a.far) continue;
      const up = a.X0 < hi && a.X0 + a.w > lo ? 1.75 : 0;
      a.om += ((up - a.th) * 6 - 4 * a.om) * dt + (w.flutter ? (0.6 + hash(a.seed, 1)) * 0.5 : 0);
      a.om = clamp(a.om, -2.2, 2.2); a.th = clamp(a.th + a.om * dt, -0.05, 1.8);
    }
    w.flutter = 0;
    // the shoppers walk the sleepers, step aside when the train comes and stand till it has gone
    for (const p of w.people) {
      const busy = T && p.X > lo - 4 && p.X < hi + 4;
      p.Z = follow(p.Z, busy ? RM.aside : RM.track, dt, 0.35);
      if (!busy && Math.abs(p.Z - RM.track) < 0.2) { const om = Math.PI * bps; p.X += p.dir * stepV(p.h, om) * dt; p.ph += om * dt; }
      if ((p.X - cam) * p.dir > half(RM.track) + 1) { Object.assign(p, shopper(rnd, cam - p.dir * (half(RM.track) + 0.5)), { dir: p.dir }); if (T && p.X > lo - 4 && p.X < hi + 4) p.Z = RM.aside; }
    }
    for (const q of w.toss) { q.vY -= G * dt; q.X += q.vX * dt; q.Y += q.vY * dt; q.Z += q.vZ * dt; q.life -= dt; }
    w.toss = w.toss.filter((q) => q.life > 0);

    // the shophouses behind, the ground and the track
    const kw = C.F / RM.wall, gw = C.hz + C.H * kw;
    r.rect(0, C.hz + (C.H - 9) * kw, N, 9 * kw, DARK);
    for (let i = Math.floor((cam - 14) / 4); i < (cam + 14) / 4; i++) for (let fl = 0; fl < 2; fl++) { const x = C.vx + (i * 4 + 0.8 - cam) * kw; r.rect(x, C.hz + (C.H - 5.2 - fl * 2.6) * kw, 2 * kw, 1.4 * kw, hash(i, fl) < 0.45 ? LMID + DIM : DARK + DIM); }
    r.rect(0, gw, N, N - gw, DARK + DIM);
    for (let X = Math.floor(cam - 12); X < cam + 12; X += 0.7) quad3(r, C, X - cam, 0.05, 3.4, X + 0.25 - cam, 0.05, 3.4, X + 0.25 - cam, 0.05, 4.8, X - cam, 0.05, 4.8, MID + DIM);
    for (const Z of [RM.rail1, RM.rail0]) { const k = proj(C, 0, 0.12, Z); r.rect(0, PY - Math.max(1, 0.06 * k), N, Math.max(1, 0.08 * k), LMID); }
    // a stall's awning: hinged at the stall's front, reaching out over the rails toward us; th swings the free edge up
    const awning = (a) => {
      const Zh = RM.hingeF, Yf = RM.Yh + RM.La * Math.sin(a.th), Zf = Zh - RM.La * Math.cos(a.th);
      for (let k = 0; k < 3; k++) { const xa = a.X0 + (k * a.w) / 3 - cam, xb = a.X0 + ((k + 1) * a.w) / 3 - cam; quad3(r, C, xa, RM.Yh, Zh, xb, RM.Yh, Zh, xb, Yf, Zf, xa, Yf, Zf, a.cols[k % 2]); }
    };
    // the far row by depth: the awnings overhead; whoever stepped aside, back among the stools; the vendors on their
    // stools fanning on the beat; their goods by the rail (under the train's floor they show between the bogies); and
    // anyone still on the way over
    const ph = beatLocked(f) ? f.beat.phase : (t * bps) % 1, ppl = w.people.slice().sort((p, q) => q.Z - p.Z);
    for (const a of w.stalls) if (a.far) awning(a);
    for (const p of ppl) if (p.Z > RM.vend) person(r, C, p, cam);
    for (const a of w.stalls) {
      if (!a.far) continue;
      const kv = C.F / RM.vend, gv = C.hz + C.H * kv, xv = C.vx + (a.X0 + 1.6 - cam) * kv;
      r.rect(xv - 0.25 * kv, gv - 0.45 * kv, 0.5 * kv, 0.45 * kv, a.cols[0]); // the stool
      const J = walker(r, xv, gv - 0.45 * kv, 0.85 * kv, FIG, 0, -1, {});
      const fa = (w.beats + (a.seed & 1)) % 2 ? 1 : -1, sw = Math.sin(Math.PI * ph) * fa * (w.fanK > 0 ? 1.6 : 1), fx = J.sx - 0.15 * kv + sw * 0.12 * kv, fy = J.top + 0.1 * kv;
      r.line(J.sx, J.sy, fx, fy + 0.1 * kv, FIG); r.disc(fx, fy, 0.11 * kv, a.cols[1]);
    }
    for (const p of ppl) if (p.Z > RM.far && p.Z <= RM.vend) person(r, C, p, cam);
    for (const a of w.stalls) if (a.far) goods(r, C, a, RM.far, cam, u);
    for (const p of ppl) if (p.Z > RM.track + 0.3 && p.Z <= RM.far) person(r, C, p, cam);
    if (T) { // the train: its side, its front or back when turned to us, windows with riders, bogies rolling on the rails
      const zs = RM.track - 1.4, k = C.F / zs, y0 = C.hz + (C.H - 3.8) * k, y1 = C.hz + (C.H - 1.0) * k;
      for (let c = 0; c < 2; c++) {
        const Xa = T.X - T.dir * c * (RM.len + 1), Xb = Xa - T.dir * RM.len, xa = C.vx + (Xa - cam) * k, xb = C.vx + (Xb - cam) * k, lo2 = Math.min(xa, xb), hi2 = Math.max(xa, xb);
        if (hi2 < -0.2 * N || lo2 > 1.2 * N) continue;
        const kr = C.F / RM.rail0, yr = C.hz + (C.H - 0.4) * kr;
        for (const m of [3, RM.len - 3]) for (const dm of [-0.9, 0.9]) { const X = Xb + T.dir * (m + dm); wheel(r, C.vx + (X - cam) * kr, yr, 0.4 * kr, T.roll * T.dir); }
        r.rect(lo2, y0, hi2 - lo2, y1 - y0, MID);
        r.rect(lo2, y0, hi2 - lo2, (y1 - y0) * 0.1, LMID);
        r.rect(lo2, y1 - (y1 - y0) * 0.25, hi2 - lo2, (y1 - y0) * 0.08, HOT);
        for (let m = 1.2; m < RM.len - 1; m += 1.7) { const X = Xb + T.dir * m, x = C.vx + (X - cam) * k; r.rect(Math.min(x, x + T.dir * 1.1 * k), y0 + (y1 - y0) * 0.22, 1.1 * k, (y1 - y0) * 0.3, BRIGHT); if (hash(c * 50 + Math.round(m * 3), 4) < 0.4) r.disc(x + T.dir * 0.55 * k, y0 + (y1 - y0) * 0.4, 0.2 * k, DARK); }
        for (const m of [5, 15]) { const x = C.vx + (Xb + T.dir * m - cam) * k; r.rect(Math.min(x, x + T.dir * 1.2 * k), y0 + (y1 - y0) * 0.15, 1.2 * k, (y1 - y0) * 0.8, MID + DIM); }
        // the cab's face while it comes toward us (a window, a lamp), the back once it has gone by
        if (c === 0 && (Xa - cam) * T.dir < 0) { quad3(r, C, Xa - cam, 1.0, zs, Xa - cam, 3.8, zs, Xa - cam, 3.8, zs + 2.8, Xa - cam, 1.0, zs + 2.8, LMID); proj(C, Xa - cam, 2.9, zs + 0.5); r.rect(PX - 2 * u, PY, 4 * u, 3 * u, DARK); proj(C, Xa - cam, 1.5, zs + 0.4); r.rect(PX - u, PY, 2 * u, 2 * u, BRIGHT); }
        if (c === 1 && (Xb - cam) * T.dir > 0) quad3(r, C, Xb - cam, 1.0, zs, Xb - cam, 3.8, zs, Xb - cam, 3.8, zs + 2.8, Xb - cam, 1.0, zs + 2.8, MID + DIM);
        targets.push({ x: lo2, y: y0, w: hi2 - lo2, h: y1 - y0 });
      }
    }
    for (const p of ppl) if (p.Z <= RM.track + 0.3) person(r, C, p, cam);
    for (const q of w.toss) { const k = proj(C, q.X - cam, q.Y, q.Z); r.disc(PX, PY, Math.max(1, 0.1 * k), q.col); }
    // the near row: its goods inches from the near rail, under the floor of a passing carriage, and more in front
    for (const a of w.stalls) if (!a.far) { goods(r, C, a, RM.near, cam, u); goods(r, C, a, RM.near2, cam, u); goods(r, C, a, RM.near3, cam, u); }
  },
};

// what a stall sells, laid on the ground at depth Z: baskets of fruit, trays of fish on ice, bundles of greens
function goods(r, C, a, Z, cam, u) {
  const k = C.F / Z, g = C.hz + C.H * k;
  for (let i = 0; i < 3; i++) {
    const x = C.vx + (a.X0 + 0.5 + i * 1.05 - cam) * k, hs = a.seed + i;
    if (x < -k || x > r.N + k) continue;
    if (a.kind === 'fish') { r.rect(x - 0.4 * k, g - 0.12 * k, 0.8 * k, 0.12 * k, BRIGHT); for (let j = 0; j < 3; j++) r.rect(x - 0.32 * k + j * 0.24 * k, g - 0.17 * k, 0.2 * k, Math.max(1, 0.06 * k), hash(hs, j) < 0.3 ? HOT : LMID); }
    else if (a.kind === 'fruit') { r.rect(x - 0.35 * k, g - 0.22 * k, 0.7 * k, 0.22 * k, MID); for (let j = 0; j < 4; j++) r.disc(x - 0.24 * k + j * 0.16 * k, g - 0.26 * k, 0.09 * k, [HOT, BRIGHT, COOL][(hs + j) % 3]); }
    else { r.rect(x - 0.38 * k, g - 0.1 * k, 0.76 * k, 0.1 * k, MID + DIM); for (let j = 0; j < 4; j++) r.rect(x - 0.32 * k + j * 0.17 * k, g - 0.3 * k, 0.1 * k, 0.22 * k, hash(hs, j) < 0.3 ? HOT : COOL); }
  }
}
// a shopper at their depth: walking, a bag in the near hand
function person(r, C, p, cam) {
  const k = C.F / p.Z, g = C.hz + C.H * k, x = C.vx + (p.X - cam) * k;
  if (x < -k || x > r.N + k) return;
  const J = walker(r, x, g, p.h * k, p.col, p.ph, p.dir, {});
  r.rect(J.sx - 0.12 * k, J.sy + 0.45 * k, 0.24 * k, 0.28 * k, p.bag);
}

// ---------------------------------------------------------------------------------------------- songkran
// The water festival on a street hung with bunting: people on both pavements dance on the beat with water guns,
// buckets and bowls; a kick empties a bucket in a wide arc, a snare is a gun's stream, a hat a little squirt; every
// drop flies on its parabola and splashes where it lands, and whoever it lands on gets wet (darker, dripping). A
// pickup cruises through with a barrel of water in the back, its crew throwing a bowl into the crowd every other
// beat. Kinds: what people carry (pistols, buckets, big pump guns). A drop: the truck's hose throws a huge arc
// sweeping along the street and everyone is drenched.
const SOAK_W = { pistols: [3, 2, 1], buckets: [2, 2, 2], pumps: [1, 2, 3] };
const SK = { far: 7.5, near: 3.8, road: 5.6, wall: 12 };

function reveller(rnd, kind, X, Z) {
  const gun = kind === 'buckets' ? (rnd() < 0.6 ? 'bucket' : 'pistol') : kind === 'pumps' ? (rnd() < 0.6 ? 'pump' : 'bucket') : (rnd() < 0.7 ? 'pistol' : 'bucket');
  return { X, Z, dir: 1, h: 1.45 + rnd() * 0.35, gun, wet: 0, hop: 0, vh: 0, col: pick(rnd, [HOT, COOL, BRIGHT, LMID]), ph: rnd() };
}

const songkran = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), kind = rollW(rnd, SOAK_W, band);
    Object.assign(w, { kind, people: [], drops: [], bits: [], puddles: [], truck: null, beats: 0, hose: 0, hoseX: 0, last: 0 });
    for (let i = 0; i < 4; i++) w.people.push(reveller(rnd, kind, -5.5 + i * 3.6 + rnd(), SK.far));
    for (let i = 0; i < 3; i++) w.people.push(reveller(rnd, kind, -2.6 + i * 2.6 + rnd() * 0.5, SK.near));
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a);
    const C = { vx: 0.5 * N, hz: 0.5 * N, F: 0.6 * N, H: 1.7 }, half = (Z) => (0.5 * N) / (C.F / Z) + 2;
    // a throw from (x, y, z) to land at (tx, ty, tz) in T seconds: the parabola through both, n drops spread by sp
    const throwAt = (x, y, z, tx, ty, tz, T, n, sp, delay = 0) => {
      for (let k = 0; k < n; k++) { const d = delay * (k / n), e = (rnd() - 0.5) * sp; w.drops.push({ X: x, Y: y, Z: z, vX: (tx - x) / T + e, vY: (ty - y + 0.5 * G * T * T) / T + e * 0.5, vZ: (tz - z) / T + e * 0.3, wait: d, life: T + 0.6 }); }
    };
    const shoot = (P, kind) => {
      const others = w.people.filter((q) => q !== P), Q = pick(rnd, others), T = kind === 'bucket' ? 0.55 : kind === 'pump' ? 0.5 : 0.35;
      if (!Q) return;
      P.dir = Q.X >= P.X ? 1 : -1;
      const mx = P.X + P.dir * 0.4, my = P.hop + P.h * (kind === 'bucket' ? 0.75 : 0.62);
      if (kind === 'bucket') throwAt(mx, my, P.Z, Q.X, Q.hop + Q.h * 0.6, Q.Z, T, 26, 1.2);
      else throwAt(mx, my, P.Z, Q.X, Q.hop + Q.h * 0.7, Q.Z, T, kind === 'pump' ? 18 : 9, 0.15, kind === 'pump' ? 0.35 : 0.2);
    };
    for (const h of hits) {
      if (isLow(h)) { const P = w.people.find((q) => q.gun === 'bucket') || pick(rnd, w.people); shoot(P, 'bucket'); }
      else if (h.kind === 'snare') { const P = w.people.find((q, i) => q.gun !== 'bucket' && (i + w.beats) % 2 === 0) || pick(rnd, w.people); shoot(P, P.gun === 'pump' ? 'pump' : 'pistol'); }
      else if (h.kind === 'hat' && rnd() < 0.4) { const P = pick(rnd, w.people); P.dir = rnd() < 0.5 ? 1 : -1; throwAt(P.X + P.dir * 0.4, P.h * 0.6, P.Z, P.X + P.dir * (1 + rnd()), 0, P.Z + (rnd() - 0.5), 0.3, 4, 0.1); }
    }
    if (f.section === 'change') { w.kind = rollW(rnd, SOAK_W, band); const P = pick(rnd, w.people); Object.assign(P, { gun: reveller(rnd, w.kind, 0, 0).gun }); }
    if (!w.truck && (f.section === 'drop' || t - w.last > 14)) { const dir = rnd() < 0.5 ? 1 : -1; w.truck = { X: -dir * (half(SK.road) + 3), dir, roll: 0 }; w.last = t; }
    if (f.section === 'drop') { w.hose = 2.2; s.shake = Math.max(s.shake, 0.3); }
    const beat = beatTick(w, f, dt);
    if (beat) {
      w.beats++;
      for (const P of w.people) if (hash(w.beats, P.X * 10 | 0) < 0.5 + 0.4 * energy(f)) P.vh = 1.2 + 0.8 * energy(f); // a hop on the beat
      if (w.truck && w.beats % 2 === 0) { const T = w.truck, Q = pick(rnd, w.people); throwAt(T.X - T.dir * 1.2, 2.6, SK.road, Q.X, Q.h * 0.7, Q.Z, 0.6, 22, 1); }
    }
    for (const P of w.people) { if (P.vh || P.hop > 0) { P.vh -= G * dt; P.hop += P.vh * dt; if (P.hop <= 0) { P.hop = 0; P.vh = 0; } } P.wet = Math.max(0, P.wet - dt * 0.05); }
    if (w.truck) {
      const T = w.truck, v = 1.5 + 1.5 * energy(f);
      T.X += T.dir * v * dt; T.roll += (v * dt) / CARS.pickup.R;
      if (w.hose > 0) { // the hose: a fat stream from the barrel, its aim sweeping along the street
        w.hose -= dt; w.hoseX = T.X + Math.sin((2.2 - w.hose) * 2.5) * 7;
        throwAt(T.X - T.dir * 1.2, 2.9, SK.road, w.hoseX, 0.8, rnd() < 0.5 ? SK.far : SK.near, 0.8, Math.round(150 * dt), 0.6);
        if (w.hose <= 0) for (const P of w.people) P.wet = 1;
      }
      if (Math.abs(T.X) > half(SK.road) + 4) w.truck = null;
    }
    // the water in flight; on landing it splashes and wets whoever it fell on
    for (const d of w.drops) {
      if (d.wait > 0) { d.wait -= dt; continue; }
      d.vY -= G * dt; d.X += d.vX * dt; d.Y += d.vY * dt; d.Z += d.vZ * dt; d.life -= dt;
      for (const P of w.people) if (Math.abs(d.Z - P.Z) < 0.5 && Math.abs(d.X - P.X) < 0.35 && d.Y > P.hop && d.Y < P.hop + P.h && d.vY < 1) { P.wet = Math.min(1, P.wet + 0.08); d.hit = true; break; }
      if (d.Y <= 0) { d.hit = true; if (rnd() < 0.15) w.puddles.push({ X: d.X, Z: d.Z, life: 3 }); }
      if (d.hit) for (let k = 0; k < 2; k++) w.bits.push({ X: d.X, Y: Math.max(0, d.Y), Z: d.Z, vX: (rnd() - 0.5) * 2, vY: 0.5 + rnd() * 1.5, vZ: (rnd() - 0.5) * 0.5 });
    }
    w.drops = w.drops.filter((d) => !d.hit && d.life > 0);
    for (const P of w.people) if (P.wet > 0.4 && rnd() < dt * 6 * P.wet) w.bits.push({ X: P.X + (rnd() - 0.5) * 0.3, Y: P.hop + P.h * (0.3 + rnd() * 0.4), Z: P.Z, vX: 0, vY: 0, vZ: 0 }); // drips
    for (const b of w.bits) { b.vY -= G * dt; b.X += b.vX * dt; b.Y += b.vY * dt; b.Z += b.vZ * dt; }
    w.bits = w.bits.filter((b) => b.Y > 0);
    if (w.bits.length > 400) w.bits.splice(0, w.bits.length - 400);
    w.puddles = w.puddles.filter((p) => (p.life -= dt) > 0);
    if (w.puddles.length > 60) w.puddles.splice(0, w.puddles.length - 60);

    // the street: the sun, shophouses with bunting fluttering in the wind, the wet road
    r.disc(0.82 * N, 0.1 * N, 0.06 * N, BRIGHT);
    const ks = C.F / SK.wall, gs = C.hz + C.H * ks;
    r.rect(0, C.hz + (C.H - 9) * ks, N, 9 * ks, DARK);
    for (let i = -6; i < 6; i++) { const x = C.vx + (i * 4.2 + 0.6) * ks; r.rect(x, C.hz + (C.H - 3) * ks, 3 * ks, 3 * ks, LMID + DIM); for (let fl = 0; fl < 2; fl++) r.rect(x + 0.6 * ks, C.hz + (C.H - 5.6 - fl * 2.4) * ks, 1.8 * ks, 1.3 * ks, MID + DIM); }
    for (let row = 0; row < 2; row++) for (let i = 0; i < 26; i++) { // bunting: little flags on a line, flapping with the treble
      const q = i / 25, x = q * N, y = (0.12 + row * 0.1) * N + Math.sin(q * Math.PI) * 0.05 * N, fl = Math.sin(t * (6 + 10 * f.rel.trebDrive) + i) * 1.5 * u * (0.3 + f.rel.trebDrive);
      r.poly([[x - 1.5 * u, y], [x + 1.5 * u, y], [x + fl, y + 4 * u]], [HOT, COOL, BRIGHT][(i + row) % 3]);
    }
    r.rect(0, gs, N, N - gs, DARK + DIM);
    for (const Z of [SK.far + 1.2, SK.near - 1.4]) { const y = C.hz + (C.H * C.F) / Z; r.rect(0, y, N, Math.max(1, u), MID + DIM); }
    for (const p of w.puddles) { const k = proj(C, p.X, 0, p.Z); r.ring(PX, PY, 0.3 * k, Math.max(1, 0.08 * k), LMID + DIM, 0.25); }
    // far to near: the far pavement, the truck in the road, the near pavement
    const draw1 = (P) => {
      const k = C.F / P.Z, g = C.hz + C.H * k, x = C.vx + P.X * k, base = g - P.hop * k, hp = P.h * k, col = P.wet > 0.4 ? DARK : FIG;
      r.rect(x - 0.25 * k, g - Math.max(1, 0.04 * k), 0.5 * k, Math.max(1, 0.06 * k), BLACK);
      const J = walker(r, x, base, hp, col, 0, P.dir, {});
      r.rect(x - J.hw, base - hp * 0.62, 2 * J.hw, hp * 0.22, P.col); // a loud shirt
      const hx = J.sx + P.dir * 0.25 * k, hy = J.sy + hp * 0.12;
      r.line(J.sx, J.sy + hp * 0.05, hx, hy, col);
      if (P.gun === 'bucket') { r.poly([[hx - 0.18 * k, hy - 0.2 * k], [hx + 0.18 * k, hy - 0.2 * k], [hx + 0.13 * k, hy + 0.08 * k], [hx - 0.13 * k, hy + 0.08 * k]], COOL); }
      else { const L = P.gun === 'pump' ? 0.55 : 0.3; r.rect(Math.min(hx, hx + P.dir * L * k), hy - 0.06 * k, L * k, 0.1 * k, P.gun === 'pump' ? HOT : COOL); r.rect(hx - 0.08 * k, hy - 0.2 * k, 0.16 * k, 0.14 * k, BRIGHT + DIM); }
      targets.push({ x: x - hp * 0.3, y: base - hp * 1.05, w: hp * 0.6, h: hp });
    };
    // the water in flight (each drop streaked along its flight) and its splashes: beyond the road behind the truck,
    // the rest in front of it
    const water = (far) => {
      for (const d of w.drops) if (d.wait <= 0 && d.Z > SK.road === far) { const k = proj(C, d.X, d.Y, d.Z), x0 = PX, y0 = PY; r.line(x0, y0, x0 - d.vX * 0.03 * k, y0 + d.vY * 0.03 * k, d.vY > 0 ? BRIGHT : COOL); r.rect(x0, y0, Math.max(1, 0.9 * u), Math.max(1, 0.9 * u), COOL); }
      for (const b of w.bits) if (b.Z > SK.road === far) { proj(C, b.X, b.Y, b.Z); r.rect(PX, PY, Math.max(1, 0.6 * u), Math.max(1, 0.6 * u), LMID); }
    };
    for (const P of w.people) if (P.Z === SK.far) draw1(P);
    water(true);
    if (w.truck) { // the pickup, a barrel of water in the bed, its crew standing with bowls
      const T = w.truck, k = C.F / SK.road, g = C.hz + C.H * k, x = C.vx + T.X * k;
      for (const m of [-1.6, -0.6]) walker(r, x + T.dir * m * k, g - 1.15 * k, 1.6 * k, MID, 0, T.dir, { cap: true });
      carSide(r, x, g, k, T.dir, 'pickup', COOL + DIM, T.roll, false);
      r.rect(x - T.dir * 2.0 * k - 0.45 * k, g - 1.9 * k, 0.9 * k, 0.9 * k, COOL); r.rect(x - T.dir * 2.0 * k - 0.45 * k, g - 1.9 * k, 0.9 * k, Math.max(1, 0.12 * k), LMID);
      targets.push({ x: x - 2.6 * k, y: g - 2.8 * k, w: 5.2 * k, h: 2.8 * k });
    }
    water(false);
    for (const P of w.people) if (P.Z === SK.near) draw1(P);
  },
};

// ---------------------------------------------------------------------------------------------- loykrathong
// The river festival at night under a full moon: from the steps someone sets a small lotus raft with a candle and
// incense on the water every beat; each drifts downstream with the current (faster out in the stream), turning
// slowly and bobbing, its flame doubled in the water. On a kick a sky lantern goes up from the landing: buoyant, it
// rises quickly, slows as its fuel burns down and sways off on the wind, which is stronger the higher it gets. The
// far bank, a temple's roofline at a distance and the lanterns are all mirrored in the river. Kinds: a quiet night,
// a fair on the far bank, a night of lanterns. A drop: fireworks over the river, shells bursting at the top of their
// climb and their sparks falling, each mirrored in the water.
const NIGHTS_W = { quiet: [3, 2, 1], fair: [2, 2, 2], lanterns: [1, 2, 3] };
const LK = { far: 120, launch: 3.8, pier: 14, kx: [-1.2, 1.0] };
const current = (Z) => 0.25 + 0.45 * Math.sin(Math.PI * clamp((Z - 3) / 110)); // metres a second, fastest mid-stream

const loykrathong = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, NIGHTS_W, band), rafts: [], lanterns: [], shells: [], sparks: [], bursts: [], beats: 0, show: 0, side: 1, reach: 0,
      trees: Array.from({ length: 30 }, () => [(rnd() - 0.5) * 300, 6 + rnd() * 10]) });
    for (let i = 0; i < 8; i++) w.rafts.push({ X: -8 + rnd() * 14, Z: 4 + rnd() * 10, psi: rnd() * TAU, om: (rnd() - 0.5) * 0.6, ph: rnd() * TAU, flick: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a);
    const C = { vx: 0.5 * N, hz: 0.45 * N, F: 0.9 * N, H: 2.2 }, half = (Z) => (0.5 * N) / (C.F / Z) + 1, wl = C.hz + (C.H * C.F) / LK.far;
    const lantern = () => w.lanterns.push({ X: 2.5 + rnd() * 3, Y: 2.2, Z: LK.pier + rnd() * 0.5, vX: 0, vY: 0, vZ: 0, lift: 2.2 + 0.8 * rnd(), age: 0, ph: rnd() * TAU, col: rnd() < 0.7 ? HOT : BRIGHT });
    for (const h of hits) {
      if (isLow(h) && (w.kind !== 'quiet' || h.strength > 0.8)) lantern();
      else if (h.kind === 'hat') { for (const k of w.rafts) k.flick = 0.15; if (w.kind === 'lanterns' && rnd() < 0.25) lantern(); }
      else if (h.kind === 'snare' && w.kind === 'fair') w.show = Math.max(w.show, 0.3); // the fair's lights jump
    }
    if (f.section === 'change') w.kind = rollW(rnd, NIGHTS_W, band);
    if (f.section === 'drop') { w.show = 4; s.shake = Math.max(s.shake, 0.2); }
    if (beatTick(w, f, dt)) { // a raft set on the water, from one side of the steps then the other
      w.beats++; w.side = -w.side; w.reach = 1;
      w.rafts.push({ X: LK.kx[w.side > 0 ? 1 : 0] + 0.35, Z: LK.launch, psi: rnd() * TAU, om: (rnd() - 0.5) * 0.6, ph: rnd() * TAU, flick: 0 });
    }
    w.reach = Math.max(0, w.reach - dt * 2.5);
    // the rafts: carried by the current at their depth, edging out into the stream, turned by its shear and eddies
    for (const k of w.rafts) { k.X += current(k.Z) * dt; k.Z += 0.35 * dt; k.psi += k.om * dt; k.flick -= dt; }
    w.rafts = w.rafts.filter((k) => k.X < half(k.Z) + 1);
    if (w.rafts.length > 40) w.rafts.splice(0, w.rafts.length - 40);
    // the lanterns: the hot air's lift (m/s², less as the fuel burns, so the climb slows; once the flame is out the
    // paper cools and they sink) against the air's drag; the wind carries them off, away from us and aside as it
    // slowly veers, and it blows harder the higher they are
    const wind0 = 0.6 + 0.8 * clamp(f.rel.midDrive), veer = 0.3 + 0.3 * Math.sin(t * 0.07);
    for (const l of w.lanterns) {
      l.age += dt;
      const ww = wind0 * (1 + Math.max(0, l.Y) / 12);
      l.vY += (l.lift * Math.exp(-l.age / 7) - 0.3 - l.vY) * dt;
      l.vX = follow(l.vX, veer * ww + 0.25 * Math.sin(t * 1.3 + l.ph), dt, 1.5); l.vZ = follow(l.vZ, 0.95 * ww, dt, 1.5);
      l.X += l.vX * dt; l.Y += l.vY * dt; l.Z += l.vZ * dt;
    }
    w.lanterns = w.lanterns.filter((l) => l.age < 70 && l.Y > 0 && C.hz + (C.H - l.Y) * (C.F / l.Z) > -5 && l.X < half(l.Z) + 5);
    if (w.lanterns.length > 50) w.lanterns.splice(0, w.lanterns.length - 50);
    // fireworks: shells climb and slow under gravity, burst at the top into a sphere of sparks that fall and fade
    if (w.show > 0) { w.show -= dt; if (rnd() < dt * 2.2) w.shells.push({ X: (rnd() - 0.5) * 30, Y: 1, Z: 35 + rnd() * 10, vY: 15 + rnd() * 3, col: pick(rnd, [HOT, BRIGHT, COOL, LMID]) }); }
    for (const sh of w.shells) {
      sh.vY -= G * dt; sh.Y += sh.vY * dt;
      if (sh.vY > 0) continue;
      sh.done = true; // the top of its climb: a burst, sparks thrown evenly over a sphere
      w.bursts.push({ X: sh.X, Y: sh.Y, Z: sh.Z, life: 0.12 });
      for (let k = 0; k < 72; k++) {
        const a = rnd() * TAU, b = Math.acos(2 * rnd() - 1), sp = 11 + rnd() * 4;
        w.sparks.push({ X: sh.X, Y: sh.Y, Z: sh.Z, vX: Math.sin(b) * Math.cos(a) * sp, vY: Math.cos(b) * sp, vZ: Math.sin(b) * Math.sin(a) * sp, life: 1.4 + rnd() * 0.6, col: sh.col });
      }
    }
    w.shells = w.shells.filter((sh) => !sh.done);
    for (const p of w.sparks) { p.vY -= G * dt; const d = Math.exp(-dt * 1.6); p.vX *= d; p.vY *= d; p.vZ *= d; p.X += p.vX * dt; p.Y += p.vY * dt; p.Z += p.vZ * dt; p.life -= dt; }
    w.sparks = w.sparks.filter((p) => p.life > 0);
    if (w.sparks.length > 600) w.sparks.splice(0, w.sparks.length - 600);

    // the sky: the full moon, the lanterns, the fireworks, the far bank with its trees, a temple roof and lights
    const mx = 0.72 * N, my = 0.14 * N;
    r.disc(mx, my, 0.055 * N, BRIGHT); r.disc(mx - 0.015 * N, my - 0.01 * N, 0.012 * N, LMID); r.disc(mx + 0.02 * N, my + 0.015 * N, 0.008 * N, LMID);
    const kf = C.F / LK.far;
    for (const [X, hgt] of w.trees) r.disc(C.vx + X * kf, wl - hgt * kf * 0.6, hgt * kf * 0.6, DARK);
    templeRoof(r, C.vx - 30 * kf, wl, 46 * kf, 24 * kf, DARK);
    spire(r, C.vx - 62 * kf, wl, 40 * kf, DARK);
    r.rect(0, wl - 2 * kf, N, 2 * kf + 1, DARK);
    const nl = w.kind === 'quiet' ? 10 : 30;
    for (let i = 0; i < nl; i++) { const x = ((i + 0.5) / nl) * N; r.set(x, wl - 3 * kf - Math.sin(i * 1.7) * kf, (i + w.beats) % 4 || w.show <= 0 ? BRIGHT : HOT); }
    if (w.kind === 'fair') { // a wheel on the far bank, its lamps chasing
      const fx = C.vx + 50 * kf, fy = wl - 22 * kf, fr = 18 * kf;
      r.ring(fx, fy, fr, 1, MID); for (let k = 0; k < 10; k++) { const a = t * 0.2 + (k * TAU) / 10; r.set(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr, (k + w.beats) % 3 ? BRIGHT : HOT); }
    }
    // the river: everything above mirrored and broken by the ripples; the moon's path of light down the water
    reflect(r, wl, N, t, (0.5 + 1.5 * f.level) * u, BG + DIM);
    for (let y = Math.round(wl + 2), j = 0; y < N; y += 2, j++) { const wd = (0.006 + 0.03 * (y - wl) / (N - wl)) * N; if (hash(j, (t * 4) | 0) < 0.6) r.rect(mx - wd / 2 + Math.sin(t * 2 + j) * wd * 0.3, y, wd * (0.3 + hash(j, 7) * 0.7), 1, LMID + DIM); }
    // the fireworks (shot from a barge out on the river) and their sparks, each with its image in the water below
    for (const sh of w.shells) { proj(C, sh.X, sh.Y, sh.Z); r.rect(PX, PY, Math.max(1, u), Math.max(1, 2 * u), BRIGHT); proj(C, sh.X, -sh.Y, sh.Z); r.set(PX, PY, BRIGHT + DIM); }
    for (const p of w.sparks) {
      const sz = Math.max(1, (p.life > 1 ? 1.6 : 1) * u), c = p.life > 0.6 ? p.col : dim(p.col);
      proj(C, p.X - p.vX * 0.12, p.Y - p.vY * 0.12, p.Z - p.vZ * 0.12); const tx = PX, ty = PY; // a streak along its flight
      proj(C, p.X, p.Y, p.Z); r.line(tx, ty, PX, PY, c); r.rect(PX, PY, sz, sz, c);
      if (p.Y > 0) { proj(C, p.X, -p.Y, p.Z); if ((PY | 0) % 3) r.rect(PX, PY, sz, 1, dim(p.col)); }
    }
    w.bursts = w.bursts.filter((b) => { const k = proj(C, b.X, b.Y, b.Z); r.disc(PX, PY, 1.5 * k, WHITE); return (b.life -= dt) > 0; }); // the flash of the burst
    for (const l of w.lanterns) { // a paper lantern glowing from its flame, guttering as the fuel runs out; its light on the water where the mirror puts it
      const fuel = Math.exp(-l.age / 7), k = proj(C, l.X, l.Y, l.Z), lh = Math.max(1.5, 0.9 * k), lw = Math.max(1, 0.6 * k), fl = fuel > 0.25 || hash(l.ph * 99 | 0, (t * 8) | 0) < fuel * 3;
      r.poly([[PX - lw * 0.5, PY - lh / 2], [PX + lw * 0.5, PY - lh / 2], [PX + lw * 0.35, PY + lh / 2], [PX - lw * 0.35, PY + lh / 2]], fl ? l.col : dim(l.col));
      if (lh > 3 && fl) r.rect(PX - 0.5, PY + lh * 0.2, Math.max(1, lw * 0.3), Math.max(1, lh * 0.2), BRIGHT);
      const lx = PX; proj(C, l.X, -l.Y, l.Z);
      if (fl) for (let j = 0; j < 4; j++) if (hash(j, ((t * 6) | 0) + (l.ph * 9 | 0)) < 0.6 && PY + j * 2 * u < N) r.rect(lx - lw * 0.3 + Math.sin(t * 3 + j) * u, PY + j * 2 * u, Math.max(1, lw * 0.6), 1, dim(l.col));
    }
    // the rafts, far to near: a disc of banana trunk, petals all round turning with it, a candle, incense, a flower
    w.rafts.sort((p, q) => q.Z - p.Z);
    for (const k of w.rafts) {
      const kk = proj(C, k.X, 0.03 * Math.sin(t * 2 + k.ph), k.Z), x = PX, y = PY, R = 0.15 * kk;
      if (x < -R || x > N + R) continue;
      for (let j = 0; j < 6; j++) if (hash(j, (t * 6) | 0) < 0.7) r.rect(x + Math.sin(t * 3 + j) * 0.3 * u, y + 2 + j * 2 * u, Math.max(1, 0.4 * R), Math.max(1, 0.5 * u), HOT + DIM); // the flame's streak
      r.ring(x, y, R, Math.max(1, R * 0.35), MID, 0.3);
      const petal = (front) => { for (let j = 0; j < 8; j++) { const a = k.psi + (j * TAU) / 8, sa = Math.sin(a); if (sa > 0 !== front) continue; const px = x + Math.cos(a) * R, py = y + sa * R * 0.3; r.poly([[px - R * 0.22, py], [px + R * 0.22, py], [px, py - R * 0.55]], front ? COOL : COOL + DIM); } };
      petal(false);
      const fl = k.flick > 0 ? Math.sin(t * 40) * 0.3 * R : 0;
      r.rect(x - R * 0.12, y - R * 0.9, Math.max(1, R * 0.24), R * 0.6, BRIGHT);
      r.disc(x + fl, y - R * 1.05, Math.max(0.8, R * 0.18), HOT); r.set(x + fl, y - R * 1.15, BRIGHT);
      for (const d of [-0.3, 0.3]) { r.line(x + d * R, y - R * 0.3, x + d * R * 1.4, y - R * 1.3, LMID); r.set(x + d * R * 1.4, y - R * 1.3, HOT); }
      r.disc(x + R * 0.45, y - R * 0.35, Math.max(0.8, R * 0.15), HOT);
      petal(true);
    }
    // the steps: someone kneeling at the water's edge each side, reaching down with each raft; the landing with
    // the lantern-lighters
    const kp = C.F / LK.pier, gp = C.hz + (C.H - 0.6) * kp;
    r.rect(C.vx + 1.5 * kp, gp, 5.5 * kp, 0.35 * kp, DARK);
    for (const X of [3, 4.6]) { const J = walker(r, C.vx + X * kp, gp, 1.6 * kp, DARK, 0, -1, {}); r.line(J.sx, J.sy, J.sx - 0.2 * kp, J.top - 0.1 * kp, DARK); }
    for (const sd of [-1, 1]) {
      const k = C.F / 3.2, x = C.vx + LK.kx[sd > 0 ? 1 : 0] * k, g = C.hz + (C.H + 0.15) * k, reach = sd === w.side ? w.reach : 0;
      r.rect(x - 0.25 * k, g - 0.75 * k, 0.5 * k, 0.6 * k, DARK); r.disc(x, g - 0.95 * k, 0.17 * k, DARK);
      r.stroke(x, g - 0.65 * k, x + 0.1 * k, g - 0.3 * k + reach * 0.3 * k, Math.max(1, 0.12 * k), DARK);
    }
    targets.push({ x: mx - 0.06 * N, y: my - 0.06 * N, w: 0.12 * N, h: 0.12 * N });
  },
};

const WORLDS = { tuktuk, skytrain, chinatown, riverboat, muaythai, wokfire, khlongboat, rooftopbar, monsoon, railmarket, songkran, loykrathong };
registerFamily('bangkok', WORLD_DEFS, WORLDS);
export const BANGKOK_STYLE = makeMixStyle('BANGKOK', ['bangkok']);
