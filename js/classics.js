// Classics, mixed. Twelve great stories of literature and myth as wordless pictures, in original silhouettes in the
// manner of old book engravings and ink wash: an old fisherman towed by a great fish he never sees, a whaleboat
// rowing at a white hump, a lanky knight charging windmills, a castaway's beach, the sea through a submarine's round
// window, a fall down a rabbit hole, a ship rowing past the singers' rocks, a firelit cave with a one-eyed giant and
// his flock, a flight on wings of feathers toward the sun, a giant pegged to a beach by tiny people, a raven over a
// chamber door at midnight, a boulder pushed up a hill. No picture from any edition, no names, no letters. Each world
// has a kinds table weighed by the arousal band, re-rolled on a section change, with a heavy turn on a drop. All of
// them keep one physics: boats ride the wave surface and pitch with its slope, oars take a stroke a beat, thrown and
// leaping things fly parabolas under the world's own gravity (a sea or a plain is wider than a room, so things cross
// it slower), what is carried round on a wheel leaves it along the tangent, feathers and leaves flutter down at a low
// terminal speed, smoke and embers rise and slow, bubbles settle to their terminal rise, wheels and boulders roll at
// v/r, pendulums swing about their pivots at the length the tempo gives them, legs step at the speed they travel.
import { clamp, lerp, bayer } from './pixels.js';
import { FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow, ease,
  beatLocked, hash, pickW, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  oldman: { name: 'the old man and the fish', va: [[L, L], [M, L], [L, M]], pals: ['oceanic', 'inkwash', 'sepia', 'midnight', 'parchment'], fx: ['none', 'film', 'frame'], themes: ['lonely', 'nature', 'glory'] },
  whalehunt: { name: 'the white whale', va: [[M, H], [L, M], [L, H]], pals: ['oceanic', 'inkwash', 'noir', 'silver', 'ice'], fx: ['film', 'none', 'vhs'], themes: ['rage', 'nature', 'war'] },
  windmills: { name: 'the knight and the windmills', va: [[H, M], [H, L], [M, M]], pals: ['parchment', 'sepia', 'inkwash', 'tape', 'royal'], fx: ['none', 'frame', 'film'], themes: ['dream', 'play', 'glory'] },
  castaway: { name: 'the castaway', va: [[L, L], [M, L], [L, M]], pals: ['oceanic', 'sepia', 'ice', 'tape', 'inkwash'], fx: ['none', 'film', 'frame'], themes: ['lonely', 'nature'] },
  nautilus: { name: 'the porthole', va: [[H, M], [H, L], [M, M]], pals: ['oceanic', 'royal', 'midnight', 'ice', 'tape'], fx: ['none', 'crt', 'frame'], themes: ['machine', 'dream', 'void'] },
  rabbithole: { name: 'down the rabbit hole', va: [[H, M], [H, L], [M, M]], pals: ['parchment', 'royal', 'tape', 'inkwash', 'midnight'], fx: ['none', 'frame'], themes: ['dream', 'play', 'void'] },
  sirens: { name: 'the sirens', va: [[M, H], [L, M], [L, H]], pals: ['oceanic', 'inkwash', 'royal', 'midnight', 'silver'], fx: ['film', 'none'], themes: ['love', 'paranoia', 'occult'] },
  cyclops: { name: 'the cyclops\' cave', va: [[M, H], [L, M], [L, H]], pals: ['sepia', 'noir', 'inkwash', 'tape', 'parchment'], fx: ['film', 'vhs', 'none'], themes: ['rage', 'paranoia', 'war'] },
  icarus: { name: 'the flight to the sun', va: [[M, H], [L, M], [L, H]], pals: ['ice', 'oceanic', 'parchment', 'royal', 'inkwash'], fx: ['none', 'film', 'crt'], themes: ['glory', 'speed', 'dream'] },
  lilliput: { name: 'the giant on the beach', va: [[H, M], [H, L], [M, M]], pals: ['royal', 'parchment', 'sepia', 'tape', 'ice'], fx: ['none', 'frame', 'crt'], themes: ['play', 'war', 'dream'] },
  raven: { name: 'the raven', va: [[L, L], [M, L], [L, M]], pals: ['midnight', 'noir', 'inkwash', 'silver', 'sepia'], fx: ['film', 'vhs', 'none'], themes: ['night', 'lonely', 'occult'] },
  sisyphus: { name: 'the boulder and the hill', va: [[L, L], [M, L], [L, M]], pals: ['sepia', 'inkwash', 'silver', 'noir', 'parchment'], fx: ['film', 'none'], themes: ['lonely', 'void'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the kinds tables weigh their variants by it; a section change
// re-rolls the kind, a drop brings each world's heavy turn
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bps = (f) => (f.bpm ? f.bpm / 60 : 2);
const mx1 = (v) => Math.max(1, v);
const dim = (c) => (c < DIM ? c + DIM : c);
const frac = (v) => v - Math.floor(v);
// how many of a thing that comes `rate` times a second come this frame: a whole number, right on average at any dt
const spawns = (rnd, rate, dt) => { const n = rate * dt, k = Math.floor(n); return k + (rnd() < n - k ? 1 : 0); };
const smooth = (q) => { q = clamp(q); return q * q * (3 - 2 * q); };
const ID = (x, y) => [x, y];
// the beat clock: a count running on through the beat, whole on the beats when locked, free at the tempo (two a
// second without one) when not; `w.on` is true on the frame it passes a whole number, so what is done on it lands
// on the beat
function beatClock(w, f, dt) {
  const was = w.bc ?? 0;
  w.bc = beatLocked(f) ? f.beat.count + f.beat.phase : was + dt * bps(f);
  w.on = beatLocked(f) ? f.beat.on : Math.floor(w.bc) > Math.floor(was);
  return w.bc;
}
// a pendulum that beats once a beat (a swing a beat, the ends on the beats) has the length g (T / 2π)² for its
// period of two beats under the world's gravity g, kept inside the case
const beatPendulum = (f, g, lo, hi) => clamp(g * (2 / bps(f) / TAU) ** 2, lo, hi);
// a local frame at (ox, oy) turned by `a` (clockwise on the screen, y runs down): a point mapper for anything that
// pitches, leans or tumbles
const turn = (ox, oy, a) => { const c = Math.cos(a), s = Math.sin(a); return (dx, dy) => [ox + dx * c - dy * s, oy + dx * s + dy * c]; };
const polyP = (r, P, pts, c) => r.poly(pts.map((p) => P(p[0], p[1])), c);
const strokeP = (r, P, x0, y0, x1, y1, wd, c) => { const a = P(x0, y0), b = P(x1, y1); r.stroke(a[0], a[1], b[0], b[1], wd, c); };
// a filled ellipse by scanlines (radii rx, ry)
function oval(r, cx, cy, rx, ry, c) {
  if (rx < 0.3 || ry < 0.3) return;
  const N = r.N, y0 = Math.max(0, Math.round(cy - ry)), y1 = Math.min(N, Math.round(cy + ry));
  for (let y = y0; y < y1; y++) {
    const dy = (y + 0.5 - cy) / ry, hw = rx * Math.sqrt(Math.max(0, 1 - dy * dy)), xa = Math.max(0, Math.round(cx - hw)), xb = Math.min(N, Math.round(cx + hw));
    if (xb > xa) r.buf.fill(c, y * N + xa, y * N + xb);
  }
}
// one column of cells from y0 down to y1, written straight into the raster
function vcol(r, x, y0, y1, c) {
  const N = r.N;
  x = Math.round(x);
  if (x < 0 || x >= N) return;
  for (let y = Math.max(0, Math.round(y0)), e = Math.min(N, Math.round(y1)); y < e; y++) r.buf[y * N + x] = c;
}
// a thin circle (an ellipse when squashed by sy), or the arc of it from a0 to a1, in O(R) cells
function circ(r, cx, cy, R, c, sy = 1, a0 = 0, a1 = TAU) {
  if (R < 0.5) return;
  const n = Math.max(6, Math.ceil(R * (a1 - a0) * 1.4));
  for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; r.set(cx + Math.cos(a) * R, cy + Math.sin(a) * R * sy, c); }
}
// a disc thinned to `dens` by the ordered dither: smoke, haze, a glow
function haze(r, cx, cy, R, c, dens) {
  const N = r.N, buf = r.buf, R2 = R * R;
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(N - 1, cy + R); y++)
    for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(N - 1, cx + R); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= R2 && bayer(x, y) < dens) buf[y * N + x] = c;
    }
}
// a fire `h` tall and `wd` wide standing on (x, base): three tongues licking up, their tips wandering with `tt` (a frame
// counter), a bright core
function flame(r, x, base, wd, h, tt) {
  for (let k = 0; k < 3; k++) { const q = (k - 1) * 0.3, tx = x + q * wd + (hash(k, tt) - 0.5) * wd * 0.5, th = h * (0.7 + 0.3 * hash(k + 3, tt)) * (k === 1 ? 1 : 0.7); r.poly([[x + (q - 0.28) * wd, base], [x + (q + 0.28) * wd, base], [tx, base - th]], HOT); }
  r.poly([[x - wd * 0.2, base], [x + wd * 0.2, base], [x + (hash(7, tt) - 0.5) * wd * 0.25, base - h * 0.5]], BRIGHT);
}
// night falling on a sky from `top` to `bot`: the dark dithered over the paper, thicker high up, by `nf`
function nightSky(r, top, bot, nf) {
  if (nf <= 0.01) return;
  const N = r.N, buf = r.buf, y0 = Math.max(0, Math.round(top)), y1 = Math.min(N, Math.round(bot));
  for (let y = y0; y < y1; y++) {
    const v = nf * (0.55 + 0.45 * (1 - (y - top) / Math.max(1, bot - top))), row = y * N;
    for (let x = 0; x < N; x++) if (bayer(x, y) < v) buf[row + x] = DARK + DIM;
  }
}
// a few stars from a hash between `top` and `bot`; `tw` (a counter) makes some of them blink
function stars(r, N, n, seed, top, bot, col, tw = 0) {
  for (let k = 0; k < n; k++) if (!tw || hash(seed + k, tw) > 0.12) r.set(hash(seed + k, 1) * N, top + hash(seed + k, 2) * (bot - top), col);
}
// rain: `n` streaks falling at `vr` cells a second, slanted by the wind (their run over their fall: `slant`)
function rain(r, N, u, t, n, vr, slant, col) {
  const len = 3 * u;
  for (let k = 0; k < n; k++) {
    const y = ((hash(k, 41) * N + t * vr * (0.8 + 0.4 * hash(k, 42))) % (N + len)) - len, x = ((((hash(k, 43) * N * 1.4 + y * slant) % (N * 1.4)) + N * 1.4) % (N * 1.4)) - 0.2 * N;
    r.line(x, y, x - slant * len, y - len, col);
  }
}
// a cloud of lumps `wd` wide, flat underneath
function cloud(r, x, y, wd, c, seed) {
  for (let k = 0; k < 5; k++) { const q = k / 4 - 0.5, rr = wd * (0.16 + 0.08 * hash(seed, k)) * (1 - Math.abs(q) * 0.8); oval(r, x + q * wd * 0.8, y - rr * 0.5, rr, rr * 0.75, c); }
  r.rect(x - wd * 0.45, y - wd * 0.04, wd * 0.9, wd * 0.08, c);
}

// ---------------------------------------------------------------------------------------------- the sea
// Swells: trains of Stokes waves (crests sharper than troughs, a cos θ + ½ k a² cos 2θ), each at the phase speed deep
// water gives it under the world's gravity g (ω² = g k), seen by a camera that has travelled `off` cells. `sea.y`
// holds the surface per column; boats sample it under bow and stern to ride it and pitch with its slope.
function seaSurf(sea, N, t, off, base, g) {
  if (!sea.y || sea.y.length !== N) sea.y = new Float32Array(N);
  const y = sea.y, tr = sea.trains;
  for (let x = 0; x < N; x++) {
    let e = 0;
    for (const w of tr) { const k = TAU / (w.l * N), th = k * (x + off) - w.d * Math.sqrt(g * k) * t + w.p; e += w.a * Math.cos(th) + 0.5 * k * w.a * w.a * Math.cos(2 * th); }
    y[x] = base - e;
  }
}
const surfAt = (sea, x) => { const y = sea.y, i = Math.max(0, Math.min(y.length - 2, Math.floor(x))), q = clamp(x - i); return y[i] + (y[i + 1] - y[i]) * q; };
// the water at depth d under the surface: a lit skin, the near water, a dithered seam, the deep
const waterCol = (sea, d, x, y) => (d < sea.u ? sea.skin : d < sea.d1 ? sea.near : d < sea.d1 + 2 * sea.u && (x + y) & 1 ? sea.near : sea.deep);
// The water: the far sea from the horizon down (lighter far off where it takes the sky; streaks at even steps of
// distance close up toward the horizon and drift back at the camera's pace over their distance), then the near swell
// in section under its surface, foam flecks on the crests that stand higher than `foam` (they travel with the water)
function paintSea(W, sea, hz, off, base, o = {}) {
  farSea(W, sea, hz, off, base, o);
  nearSea(W, sea, off, base, o);
}
function farSea(W, sea, hz, off, base, o = {}) {
  const { r, N } = W, buf = r.buf, sy = sea.y;
  const farA = o.farA ?? LMID + DIM, farB = o.farB ?? MID + DIM, h0 = base - hz - 0.02 * N, mid = hz + h0 * 0.4;
  let low = 0;
  for (let x = 0; x < N; x++) low = Math.max(low, sy[x]);
  for (let y = Math.max(0, Math.round(hz)); y < Math.min(N, low + 2); y++) {
    if (Math.abs(y - mid) < 1.5) for (let x = 0; x < N; x++) buf[y * N + x] = (x + y) & 1 ? farA : farB;
    else r.rect(0, y, N, 1, y < mid ? farA : farB);
  }
  for (let k = 1; k < 12; k++) {
    const d = 1 + k * 0.55, y = Math.round(hz + h0 / d), len = (0.14 * N) / d;
    for (let j = 0; j < 3; j++) { const x = ((((hash(k, j) * 1.7 * N - off / d) % (1.7 * N)) + 1.7 * N) % (1.7 * N)) - 0.35 * N; r.rect(x, y, len, 1, o.streak ?? LMID); }
  }
}
function nearSea(W, sea, off, base, o = {}) {
  const { r, N, u, t } = W, buf = r.buf, sy = sea.y, foam = o.foam ?? 1e9, cell = mx1(2 * u);
  Object.assign(sea, { skin: o.skin ?? LMID, near: o.near ?? MID, deep: o.deep ?? DARK, d1: (o.d1 ?? 0.07) * N, u });
  for (let x = 0; x < N; x++) {
    const ys = sy[x];
    for (let y = Math.max(0, Math.ceil(ys)); y < N; y++) buf[y * N + x] = waterCol(sea, y - ys, x, y);
    if (base - ys > foam && hash(Math.floor((x + off) / cell), Math.floor(t * 3)) < 0.55) r.rect(x, ys - u * 0.5, 1, mx1(u), o.foamCol ?? BRIGHT);
  }
}
// what is under the surface is seen through the water: in the box, below the skin, every other cell of a thing keeps a
// dimmed colour of its own and the rest is water again
function submerge(r, sea, x0, x1, y1) {
  const N = r.N, buf = r.buf, sy = sea.y;
  for (let x = Math.max(0, Math.floor(x0)); x < Math.min(N, Math.ceil(x1)); x++)
    for (let y = Math.max(0, Math.ceil(sy[x] + sea.u)), e = Math.min(N, Math.ceil(y1)); y < e; y++) {
      const i = y * N + x, c = buf[i], wc = waterCol(sea, y - sy[x], x, y);
      if (c !== wc) buf[i] = (x + y) & 1 ? dim(c) : wc;
    }
}
// a boat `len` long riding the sea at x with its bow toward `dir`: the waterline's middle sits on the mean of the
// surface under bow and stern, the hull pitches with the slope between them. P maps the boat's frame (x along the keel
// toward the bow, y down, 0 on the waterline) to the screen
function ride(sea, x, len, dir) {
  const yl = surfAt(sea, x - len / 2), yr = surfAt(sea, x + len / 2), a = Math.atan2(yr - yl, len), T = turn(x, (yl + yr) / 2, a);
  return { P: (dx, dy) => T(dir * dx, dy), y: (yl + yr) / 2, a };
}
// an oar on a stroke a beat, `p` the phase in it (0 the catch, on the beat): in the drive (the first 45 %) the blade is
// swept from forward to aft through the water, in the recovery it comes back over it, lifted. In the boat frame, from
// the oarlock (lx, ly) with the waterline `wl` below it: the blade, and the handle where the rower's hands are
function oarAt(p, lx, ly, reach, wl) {
  const drive = p < 0.45, q = drive ? p / 0.45 : (p - 0.45) / 0.55, sw = (1 - Math.cos(Math.PI * q)) / 2;
  const bx = lx + (drive ? lerp(1, -1, sw) : lerp(-1, 1, sw)) * reach, by = ly + wl * (drive ? 1 + 0.4 * Math.sin(Math.PI * q) : 1 - 0.45 * Math.sin(Math.PI * q));
  return { bx, by, hx: lx - (bx - lx) * 0.45, hy: ly - (by - ly) * 0.3, drive, q };
}
// a rower on a thwart at (x, seat) in the boat frame P, facing aft (the oars pull the boat toward +x): the trunk
// swings with the stroke (toward the stern at the catch, back toward the bow at the finish), the arms to the handle;
// `ears` stops the ears with wax
function rower(r, P, x, seat, h, col, p, hx, hy, ears = false) {
  const drive = p < 0.45, q = drive ? p / 0.45 : (p - 0.45) / 0.55, lean = drive ? lerp(-0.5, 0.45, smooth(q)) : lerp(0.45, -0.5, smooth(q));
  const sx = x + Math.sin(lean) * h * 0.3, sy = seat - Math.cos(lean) * h * 0.3, hdx = sx + Math.sin(lean) * h * 0.11, hdy = sy - Math.cos(lean) * h * 0.11;
  strokeP(r, P, x, seat, x - h * 0.22, seat + h * 0.02, mx1(h * 0.08), col);
  strokeP(r, P, x - h * 0.22, seat + h * 0.02, x - h * 0.3, seat + h * 0.18, mx1(h * 0.07), col);
  strokeP(r, P, x, seat, sx, sy, mx1(h * 0.12), col);
  const hp = P(hdx, hdy);
  oval(r, hp[0], hp[1], h * 0.075, h * 0.08, col);
  if (ears) { const e = P(hdx + h * 0.01, hdy); r.set(e[0], e[1], BRIGHT); }
  const el = P((sx + hx) / 2, (sy + hy) / 2 + h * 0.05), sp = P(sx, sy), hd = P(hx, hy);
  r.stroke(sp[0], sp[1], el[0], el[1], mx1(h * 0.06), col);
  r.stroke(el[0], el[1], hd[0], hd[1], mx1(h * 0.06), col);
}
// a bird on the wing at (x, y), `sz` its span, the wings at `flap` (1 up, -1 down, a gull's crook between)
function bird(r, x, y, sz, flap, col) {
  const wy = -flap * sz * 0.32, ky = -sz * 0.05 + wy * 0.4;
  for (const k of [-1, 1]) { r.line(x, y, x + k * sz * 0.22, y + ky, col); r.line(x + k * sz * 0.22, y + ky, x + k * sz * 0.5, y + wy, col); }
  r.rect(x - sz * 0.06, y - sz * 0.03, mx1(sz * 0.12), mx1(sz * 0.06), col);
}

// ---------------------------------------------------------------------------------------------- figures
// A person `h` tall in strokes through the frame P (ID for none), facing `dir`: `lean` tips the trunk from the hips
// (toward dir positive), `legs` [[hip, knee], ..] in radians from straight down (forward positive, the knee folds the
// shin back), `arms` [[shoulder, elbow], ..] the same way (the elbow folds the forearm forward), the far limb first; the
// lower foot stands on `base`, or the hips sit on it when `sit`. `hat`: 'brim', 'cap', 'basin', 'helm', 'point';
// `robe` a skirt to the knees, `dress` a bell from the waist lifted by `billow`, `hair` streaming back by `hair`
// (or `hairUp`, blown straight up).
// Returns the joints mapped to the screen, and the hips and shoulders in the local frame.
function rig(r, P, x, base, h, dir, col, o = {}) {
  const th = h * 0.25, sh = h * 0.25, tr = h * 0.3, ua = h * 0.16, fa = h * 0.15, sn = Math.sin, cs = Math.cos, lean = o.lean ?? 0;
  const lg = o.legs ?? [[0.1, 0.12], [-0.1, 0.12]], am = o.arms ?? [[0.15, 0.25], [-0.15, 0.25]];
  const legAt = ([a, k]) => [dir * th * sn(a), th * cs(a), dir * (th * sn(a) + sh * sn(a - k)), th * cs(a) + sh * cs(a - k)];
  const A = legAt(lg[0]), B = legAt(lg[1]), hy = o.sit ? base : base - Math.max(A[3], B[3]);
  const sx = x + dir * tr * sn(lean), sy = hy - tr * cs(lean), nd = lean + (o.nod ?? 0), hx = sx + dir * h * 0.1 * sn(nd), hyy = sy - h * 0.1 * cs(nd);
  const S = (x0, y0, x1, y1, wd, c) => { const a = P(x0, y0), b = P(x1, y1); r.stroke(a[0], a[1], b[0], b[1], wd, c); };
  const armAt = ([a, e]) => { const ex = sx + dir * ua * sn(a), ey = sy + ua * cs(a); return [ex, ey, ex + dir * fa * sn(a + e), ey + fa * cs(a + e)]; };
  const lw = mx1(h * 0.075), aw = mx1(h * 0.06), far = o.far ?? col, A0 = armAt(am[0]), A1 = armAt(am[1]);
  const leg = (Lg, c) => { S(x, hy, x + Lg[0], hy + Lg[1], lw, c); S(x + Lg[0], hy + Lg[1], x + Lg[2], hy + Lg[3], lw, c); };
  const arm = (Ar, c) => { S(sx, sy, Ar[0], Ar[1], aw, c); S(Ar[0], Ar[1], Ar[2], Ar[3], aw, c); };
  // the head's own frame: `up` along the neck, `fw` the way it faces
  const ux = dir * sn(nd), uy = -cs(nd), fx = dir * cs(nd), fy = sn(nd), hd = (a, b) => P(hx + fx * a * h + ux * b * h, hyy + fy * a * h + uy * b * h);
  if (o.hair) r.poly([hd(-0.02, 0.06), hd(-0.06 - 0.2 * o.hair, 0.02 - 0.1 * o.hair), hd(-0.1 - 0.12 * o.hair, -0.12 + 0.05 * o.hair), hd(-0.05, -0.04)], col);
  if (o.hairUp) r.poly([hd(-0.07, 0.03), hd(0.07, 0.03), hd(0.05 + 0.03 * o.hairUp, 0.24), hd(-0.09 + 0.03 * o.hairUp, 0.21)], col); // blown up by the air she falls through
  leg(B, far);
  arm(A1, far);
  if (o.robe) { const q = o.robe; r.poly([P(x - dir * h * 0.09, hy - h * 0.08), P(x + dir * h * 0.09, hy - h * 0.08), P(x + dir * h * (0.12 + 0.05 * q), hy + h * 0.24), P(x - dir * h * (0.14 + 0.05 * q), hy + h * 0.24)], col); }
  if (o.dress !== undefined) { const b = o.billow ?? 0; r.poly([P(x - dir * h * 0.06, hy - h * 0.1), P(x + dir * h * 0.06, hy - h * 0.1), P(x + dir * h * (0.16 + 0.08 * b), hy + h * (0.22 - 0.36 * b)), P(x, hy + h * (0.25 - 0.17 * b)), P(x - dir * h * (0.16 + 0.08 * b), hy + h * (0.22 - 0.36 * b))], o.dress); } // blown up, the hem rises over the waist like a cup
  S(x, hy, sx, sy, mx1(h * 0.12), col);
  const hp = P(hx, hyy);
  oval(r, hp[0], hp[1], h * 0.075, h * 0.08, col);
  switch (o.hat) {
    case 'brim': r.poly([hd(-0.15, 0.04), hd(0.15, 0.04), hd(0.14, 0.065), hd(-0.14, 0.065)], o.hatCol ?? col); r.poly([hd(-0.07, 0.05), hd(0.07, 0.05), hd(0.05, 0.12), hd(-0.05, 0.12)], o.hatCol ?? col); break;
    case 'cap': r.poly([hd(-0.08, 0.02), hd(0.08, 0.02), hd(0.02, 0.12), hd(-0.09, 0.08)], o.hatCol ?? col); break;
    case 'basin': r.poly([hd(-0.13, 0.05), hd(0.13, 0.05), hd(0.13, 0.07), hd(-0.13, 0.07)], o.hatCol ?? col); r.poly([hd(-0.07, 0.06), hd(0.07, 0.06), hd(0.05, 0.12), hd(-0.05, 0.12)], o.hatCol ?? col); break;
    case 'helm': r.poly([hd(-0.08, 0.0), hd(0.08, 0.0), hd(0.07, 0.09), hd(-0.08, 0.09)], o.hatCol ?? col); r.poly([hd(-0.12, 0.08), hd(0.04, 0.09), hd(0.0, 0.17), hd(-0.1, 0.15)], o.hatCol ?? col); break;
    case 'point': r.poly([hd(-0.09, 0.04), hd(0.09, 0.04), hd(-0.06, 0.24)], o.hatCol ?? col); break;
    default:
  }
  if (o.beard) r.poly([hd(0.0, -0.02), hd(0.07, -0.03), hd(0.02, -0.13)], o.beard);
  leg(A, col);
  arm(A0, col);
  return { hip: P(x, hy), sh: P(sx, sy), head: hp, hand: P(A0[2], A0[3]), hand2: P(A1[2], A1[3]), foot: P(x + A[2], hy + A[3]), foot2: P(x + B[2], hy + B[3]), hy, sx, sy };
}
// a walking or running gait for rig: the legs swing ±`amp` from the hips with `ph` and the knee folds as the leg
// comes through, the arms counter-swing. The body travels 2·(thigh + shin)·sin(amp) a step (two steps a cycle), so a
// figure moving `d` cells advances ph by d·π over that: the stance foot stays put on the ground.
const gaitLegs = (ph, amp) => [[amp * Math.sin(ph), 0.15 + 0.7 * Math.max(0, Math.cos(ph))], [amp * Math.sin(ph + Math.PI), 0.15 + 0.7 * Math.max(0, Math.cos(ph + Math.PI))]];
const gaitArms = (ph, amp) => [[-amp * 0.8 * Math.sin(ph), 0.3], [-amp * 0.8 * Math.sin(ph + Math.PI), 0.3]];
const stepLen = (h, amp) => 2 * h * 0.5 * Math.sin(amp);
// a small person `h` tall (a crowd, the far ones, the tiny ones) in a few lines: legs scissoring with `ph`
function mini(r, x, base, h, col, ph, dir, arms = 0) {
  const sw = Math.sin(ph) * h * 0.22, hy = base - h * 0.45;
  r.line(x, hy, x + sw, base, col);
  r.line(x, hy, x - sw, base, col);
  r.line(x, hy, x + dir * h * 0.04, base - h * 0.85, col);
  r.rect(x + dir * h * 0.04 - h * 0.1, base - h - h * 0.05, mx1(h * 0.2), mx1(h * 0.2), col);
  const ay = base - h * 0.75;
  r.line(x, ay, x + dir * h * 0.28, ay + h * (arms ? -0.35 * arms : 0.25), col);
  r.line(x, ay, x - dir * h * 0.2, ay + h * (arms > 0.5 ? -0.3 : 0.25), col);
}
// a four-legged beast `len` long on `base` facing `dir`, its legs going with `ph`: 'walk' (each in turn), 'trot'
// (diagonal pairs) or 'gallop' (the fore pair half a stride behind the hind); a foot is lifted while its leg swings
// forward and planted while the body goes over it. `kind` 'horse' (lanky, a long head), 'donkey' (long ears), 'sheep'
// (a fleece of lumps, a dark face, curled horns when `horns`). `rear` tips the body up about the hind feet. Returns the
// saddle (where a rider sits), the head and the belly.
const GAITS = { walk: [0, 0.5, 0.25, 0.75], trot: [0, 0.5, 0.5, 0], gallop: [0, 0.1, 0.45, 0.55] };
function beast(r, x, base, len, dir, col, ph, o = {}) {
  const kind = o.kind ?? 'horse', legL = len * (kind === 'horse' ? 0.62 : kind === 'donkey' ? 0.45 : 0.32), mv = o.moving ?? true, amp = mv ? o.amp ?? 0.4 : 0, gt = GAITS[o.gait ?? 'walk'], rear = o.rear ?? 0;
  // each leg: its swing, the knee's fold and how far it is lifted; the body rides as high as the planted legs hold it
  const legs = gt.map((g, k) => {
    const th = ph + g * TAU, fore = k >= 2, up = fore && rear > 0.2, lift = mv && !up ? Math.max(0, Math.cos(th)) * 0.3 : 0, a = amp * Math.sin(th) + (up ? rear * 1.6 : 0), bend = (fore ? 1 : -1) * (0.15 + lift);
    return { a, bend, s: 1 - lift * 0.35, fore, ext: legL * 0.5 * (Math.cos(a) + Math.cos(a - bend)) * (1 - lift * 0.35), up };
  });
  let stand = 0;
  for (const l of legs) if (!l.up) stand = Math.max(stand, l.ext);
  const by = base - stand - len * 0.04, T = turn(x - dir * len * 0.3, base, -dir * rear), Pb = (dx, dy) => T(dir * (dx + len * 0.3), dy - (base - by));
  const lw = mx1(len * (kind === 'horse' ? 0.05 : 0.07)), lc = o.legCol ?? col, far = o.far ?? lc;
  const leg = (k, near) => {
    const l = legs[k], hip = Pb(l.fore ? len * 0.3 : -len * 0.28, len * 0.04), hl = legL * 0.5 * l.s;
    let kx = hip[0] + dir * Math.sin(l.a) * hl, ky = hip[1] + Math.cos(l.a) * hl, fx = kx + dir * Math.sin(l.a - l.bend) * hl, fy = ky + Math.cos(l.a - l.bend) * hl;
    if (rear > 0.05 && !l.fore) { fx = x - dir * len * (0.3 + (k ? 0.03 : -0.03)); fy = base; kx = (hip[0] + fx) / 2 - dir * len * 0.06; ky = (hip[1] + fy) / 2; } // planted: the body turns up over them
    r.stroke(hip[0], hip[1], kx, ky, lw, near ? lc : far);
    r.stroke(kx, ky, fx, fy, lw, near ? lc : far);
  };
  leg(1, false); leg(3, false);
  const bc = Pb(0, 0);
  if (kind === 'sheep') for (let k = 0; k < 5; k++) { const q = k / 4 - 0.5, p = Pb(q * len * 0.7, -len * 0.04 * Math.cos(q * 3)); oval(r, p[0], p[1], len * 0.2, len * 0.17, col); }
  else oval(r, bc[0], bc[1], len * 0.42, len * (kind === 'horse' ? 0.13 : 0.17), col);
  const nk = Pb(len * 0.34, -len * 0.06), na = (o.neck ?? (kind === 'sheep' ? 0.2 : 0.9)) + rear, nl = len * (kind === 'horse' ? 0.38 : kind === 'donkey' ? 0.3 : 0.18);
  const hx = nk[0] + dir * Math.cos(na) * nl, hy = nk[1] - Math.sin(na) * nl;
  r.stroke(nk[0], nk[1], hx, hy, mx1(len * (kind === 'sheep' ? 0.16 : 0.12)), kind === 'sheep' ? o.face ?? col : col);
  const ha = na - (kind === 'sheep' ? 1.6 : 2.1), hl = len * (kind === 'horse' ? 0.26 : kind === 'donkey' ? 0.22 : 0.15);
  r.stroke(hx, hy, hx + dir * Math.cos(ha) * hl, hy - Math.sin(ha) * hl, mx1(len * (kind === 'sheep' ? 0.11 : 0.09)), kind === 'sheep' ? o.face ?? col : col);
  if (kind === 'donkey') for (const k of [0.15, 0.35]) r.line(hx, hy, hx - dir * Math.cos(na + 1.2 + k) * len * 0.24, hy - Math.sin(na + 1.2 + k) * len * 0.24, col);
  else if (kind === 'horse') { r.line(hx, hy, hx - dir * len * 0.04, hy - len * 0.08, col); for (let k = 0; k < 4; k++) { const q = k / 4; r.line(nk[0] + (hx - nk[0]) * q, nk[1] + (hy - nk[1]) * q, nk[0] + (hx - nk[0]) * q - dir * len * 0.06, nk[1] + (hy - nk[1]) * q + len * 0.03, col); } }
  else if (o.horns) circ(r, hx - dir * len * 0.04, hy, len * 0.07, o.face ?? col, 1, 0, TAU);
  const tl = Pb(-len * 0.42, -len * 0.04), sw = Math.sin(ph * 0.5) * len * 0.05;
  if (kind !== 'sheep') r.line(tl[0], tl[1], tl[0] - dir * len * 0.08 + sw, tl[1] + len * (kind === 'horse' ? 0.3 : 0.2), col);
  leg(0, true); leg(2, true);
  return { sad: Pb(-len * 0.02, -len * 0.14), head: [hx, hy], belly: Pb(0, len * 0.15), legL };
}

// ---------------------------------------------------------------------------------------------- particles
// thrown and splashed things: a parabola under the world's gravity g (cells/s²) until they come down through the
// surface `floor(x)`, where they are gone, with a ring there when `rings` is given
function ballistic(W, list, g, floor, col, rings = null) {
  const { r, dt, u } = W;
  for (const p of list) {
    p.vy += g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (floor && p.vy > 0 && p.y >= floor(p.x)) { p.life = 0; if (rings && rings.length < 30) rings.push({ x: p.x, y: floor(p.x), t: 0 }); continue; }
    const sz = p.s ?? mx1(u);
    r.rect(p.x - sz / 2, p.y - sz / 2, sz, sz, p.c ?? col);
  }
  return list.filter((p) => p.life > 0);
}
// a splash: `n` drops thrown up and out from (x, y) at up to `sp` cells a second, inside `spread` of straight up
function splash(list, rnd, x, y, n, sp, c, spread = 0.7, life = 3) {
  for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 2 * spread, v = sp * (0.35 + 0.65 * rnd()); list.push({ x: x + (rnd() - 0.5) * 3, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, c }); }
}
// rings on a surface, spreading at one speed `v` (screens a second), flattened by the view, gone after `life`
function ripples(W, list, col, sy = 0.3, v = 0.1, life = 0.45) {
  const { r, dt, N } = W;
  for (const p of list) { p.t += dt; circ(r, p.x, p.y, 1 + p.t * v * N, col, sy); }
  return list.filter((p) => p.t < life);
}
// feathers and leaves: the air takes their speed at once; they fall at a low terminal speed `vt`, rocking side to side
// (quickest through the middle of each swing, slowest at its ends, tilting with it), drift with the `wind`, and come
// to rest on `floor(x)` where they ride it, carried by `drift`, and fade
function flutter(W, list, floor, wind, vt, col, drift = 0) {
  const { r, dt, u, t, N } = W;
  for (const p of list) {
    if (!p.rest) {
      const th = t * p.fq + p.ph;
      p.vx = follow(p.vx, wind + Math.cos(th) * vt * 1.3, dt, 0.2);
      p.vy = follow(p.vy, vt * (0.3 + 1.3 * Math.abs(Math.cos(th))), dt, 0.2);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.tilt = 0.7 * Math.sin(th);
      if (floor && p.y >= floor(p.x)) p.rest = true;
    } else { p.x += drift * dt; p.y = floor(p.x) - u * 0.5; p.tilt *= Math.exp(-dt * 3); p.life -= dt; }
    if (p.life > 0.8 || hash(p.x | 0, (t * 12) | 0) < p.life / 0.8) { const l = p.l ?? 2.5 * u, cx = (Math.cos(p.tilt) * l) / 2, cy = (Math.sin(p.tilt) * l) / 2; r.line(p.x - cx, p.y - cy, p.x + cx, p.y + cy, p.c ?? col); }
  }
  return list.filter((p) => p.life > 0 && p.x > -0.2 * N && p.x < 1.2 * N && p.y < N + 5);
}
// smoke: a puff leaves the fire at its own speed and rises ever slower (it mixes with the cool air and loses its
// lift), drifting off with the `wind`, swelling and thinning as it ages
function smoke(W, list, wind, col, col2) {
  const { r, dt, u } = W, k = Math.exp(-dt * 0.9);
  for (const p of list) {
    p.vy *= k;
    p.vx = follow(p.vx, wind, dt, 1.5);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.age += dt;
    const q = 1 - p.age / p.life;
    haze(r, p.x, p.y, Math.min(7 * u, (p.s ?? 2 * u) * (1 + p.age * 1.1)), q > 0.55 ? col : col2, 0.25 + 0.75 * q);
  }
  return list.filter((p) => p.age < p.life);
}
// embers: thrown up hot and quick, they slow as they cool (the lift goes, the drag holds them) to a drift `vt`,
// weaving, bright to hot to out
function embers(W, list) {
  const { r, dt, u, t } = W;
  for (const e of list) {
    e.vy = follow(e.vy, e.vt, dt, 0.6);
    e.x += (e.vx + Math.sin(t * 4 + e.ph) * 3 * u) * dt;
    e.y += e.vy * dt;
    e.life -= dt;
    r.rect(e.x, e.y, mx1(u * 0.8), mx1(u * 0.8), e.life > e.l0 * 0.55 ? BRIGHT : e.life > e.l0 * 0.2 ? HOT : DARK);
  }
  return list.filter((e) => e.life > 0);
}
const ember = (rnd, x, y, N, up = 1) => { const l0 = 0.8 + rnd() * 1.4; return { x, y, vx: (rnd() - 0.5) * 0.06 * N, vy: -(0.15 + 0.2 * rnd()) * N * up, vt: -0.025 * N, life: l0, l0, ph: rnd() * TAU }; };
// bubbles: pushed off their source, they settle to the terminal rise of their size (drag), wobble, and are gone at
// `top(x)`; the big ones show as rings
function bubbles(W, list, top, col) {
  const { r, dt, u, t } = W;
  for (const b of list) {
    b.vy = follow(b.vy, -b.vt, dt, 0.35);
    b.vx *= Math.exp(-dt * 2);
    b.y += b.vy * dt;
    b.x += (b.vx + Math.sin(t * 6 + b.ph) * 2.5 * u) * dt;
    if (b.y <= top(b.x)) b.life = 0;
    else if (b.s > 1.3 * u) circ(r, b.x, b.y, b.s, col);
    else r.rect(b.x, b.y, mx1(b.s), mx1(b.s), col);
  }
  return list.filter((b) => b.life !== 0);
}
const bubble = (rnd, x, y, N, u, push = 0.2) => { const s = (0.6 + 1.6 * rnd()) * u; return { x, y, s, vx: (rnd() - 0.5) * 0.04 * N, vy: -push * N * (0.6 + 0.6 * rnd()), vt: (0.05 + 0.02 * (s / u)) * N, ph: rnd() * TAU, life: 1 }; };

// ---------------------------------------------------------------------------------------------- oldman
// An old fisherman alone in a skiff on the open sea, the line taut over the bow and down into the water to a great
// fish nobody sees. The fish tows the skiff (spray off the stem, a wake left lying on the water); the swells lift and
// drop it and it pitches with their slope. A kick is a run of the fish: the line pays out through his hands and he
// braces against it, back and legs; a snare flicks the water off the singing line, the gulls flap on the hats, a note
// glints on the water under the sun, and on every beat the line cuts a ring where it enters. Each section is a quarter
// of a day: dawn, noon, dusk, night with stars, dawn again, the sun on its arc. The kind is the sea: calm, a long
// swell, a squall with rain. The drops tell it in turn: the fish leaps clear on a long parabola and comes down in a
// burst of water; then it is lashed alongside and sharks' fins circle, biting on the snares; then the skeleton is
// lashed alongside and he sails home, a coast coming up over the horizon; then another day and another fish.
const SEA_W = { calm: [3, 2, 0], swell: [2, 3, 2], squall: [0, 1, 3] };
const SEA_AMP = { calm: 0.011, swell: 0.022, squall: 0.034 };
const HOURS = [0.3, Math.PI / 2, Math.PI - 0.3, 1.5 * Math.PI]; // dawn, noon, dusk, night: the sun's angle on its arc
const BITE = [3, 1, 4, 0, 5, 2]; // the order the bites take the fish's flesh in

// the great fish `l` long in the frame P (the nose toward +x, the back toward -y): a long body, a spear of a bill, a
// sail of a fin along the back, a deep forked tail, stripes down the flank; `bare` takes the flesh away cut by cut
// down to the bones (white) at 1
function bigfish(r, P, l, u, col, bare = 0) {
  const pr = (q) => Math.sin(Math.PI * clamp(q + 0.5)) ** 0.7, tp = (q) => -0.105 * l * pr(q), bt = (q) => 0.075 * l * pr(q), bone = BRIGHT;
  if (bare > 0) { // the bones, under what flesh the bites have left
    strokeP(r, P, -0.5 * l, 0, 0.42 * l, -0.01 * l, mx1(1.2 * u), bone);
    for (let k = 0; k < 13; k++) { const q = -0.44 + k * 0.065; strokeP(r, P, q * l, 0, q * l - 0.025 * l, tp(q) * 0.85, mx1(0.6 * u), bone); strokeP(r, P, q * l, 0, q * l - 0.025 * l, bt(q) * 0.85, mx1(0.6 * u), bone); }
  }
  for (let k = 0; k < 6; k++) {
    if (bare > BITE[k] / 6) continue;
    const q0 = -0.45 + k * 0.13, q1 = q0 + 0.135;
    polyP(r, P, [[q0 * l, tp(q0)], [q1 * l, tp(q1)], [q1 * l, bt(q1)], [q0 * l, bt(q0)]], col);
    if (k > 0 && k < 5) strokeP(r, P, (q0 + 0.06) * l, tp(q0 + 0.06) * 0.6, (q0 + 0.05) * l, bt(q0 + 0.06) * 0.5, mx1(0.6 * u), COOL);
  }
  if (bare < 0.5) polyP(r, P, [[-0.08 * l, tp(-0.08)], [0.3 * l, tp(0.3)], [0.04 * l, -0.25 * l], [-0.04 * l, -0.2 * l]], col); // the sail of a fin
  const hc = bare >= 1 ? bone : col;
  polyP(r, P, [[0.32 * l, tp(0.32)], [0.5 * l, -0.01 * l], [0.32 * l, bt(0.32)]], hc); // the head
  const e = P(0.41 * l, -0.025 * l);
  r.set(e[0], e[1], bare >= 1 ? BLACK : BRIGHT);
  strokeP(r, P, 0.48 * l, -0.012 * l, 0.78 * l, -0.02 * l, mx1(u), hc); // the bill
  polyP(r, P, [[-0.48 * l, 0], [-0.7 * l, -0.17 * l], [-0.6 * l, 0], [-0.7 * l, 0.15 * l]], hc); // the forked tail
  if (bare < 1) strokeP(r, P, 0.26 * l, bt(0.26) * 0.6, 0.12 * l, 0.15 * l, mx1(u), col); // a pectoral fin
}
// the skiff `L` long in the frame P: a sheered hull with a raised bow, a wale along the gunwale, a seam
function skiff(r, P, L, u, col = FIG) {
  const fb = L * 0.13;
  polyP(r, P, [[-0.5 * L, -fb], [0, -fb * 0.85], [0.42 * L, -fb * 1.15], [0.53 * L, -fb * 1.55], [0.47 * L, 0], [0.36 * L, fb * 0.7], [-0.42 * L, fb * 0.7], [-0.5 * L, fb * 0.1]], col);
  strokeP(r, P, -0.5 * L, -fb, 0, -fb * 0.85, mx1(u), LMID);
  strokeP(r, P, 0, -fb * 0.85, 0.42 * L, -fb * 1.15, mx1(u), LMID);
  strokeP(r, P, 0.42 * L, -fb * 1.15, 0.53 * L, -fb * 1.55, mx1(u), LMID);
  strokeP(r, P, -0.48 * L, -fb * 0.3, 0.44 * L, -fb * 0.35, mx1(u * 0.6), DARK);
}

const oldman = {
  init(W) {
    const { w, rnd, N } = W, hour = Math.floor(rnd() * 4);
    Object.assign(w, { kind: rollW(rnd, SEA_W, bandOf(W.a)), hour, sunT: HOURS[hour], sunA: HOURS[hour], stage: 0, off: 0, tow: 0.03 * N, amp: 0.02 * N,
      tense: 0, pay: 0, payV: 0, leap: null, bare: 0, coast: 0, strike: null, wake: [], drops: [], rings: [], glints: [],
      sea: { trains: [{ l: 0.72, d: -1, p: 0, a: 0 }, { l: 0.31, d: -1, p: 2.1, a: 0 }, { l: 0.13, d: 1, p: 4.4, a: 0 }] },
      gulls: Array.from({ length: 4 }, () => ({ x: rnd() * N, y: (0.08 + 0.2 * rnd()) * N, vx: (0.015 + 0.02 * rnd()) * N * (rnd() < 0.5 ? -1 : 1), vy: 0, flap: 0, ph: rnd() * TAU })),
      sharks: [0, 2.2, 4.1].map((ph, i) => ({ ph, R: 0.2 + 0.06 * i, w: 0.5 + 0.12 * i })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.46 * N, base = 0.68 * N, g = 0.55 * N, bx = 0.36 * N, Ls = 0.34 * N, fb = Ls * 0.13;
    beatClock(w, f, dt);
    if (f.section === 'change') { w.kind = rollW(rnd, SEA_W, band); const nx = (w.hour + 1) % 4; w.sunT += (HOURS[nx] - HOURS[w.hour] + TAU) % TAU; w.hour = nx; }
    if (f.section === 'drop') { w.stage = (w.stage + 1) % 4; w.leap = w.stage === 1 ? { t: -1 } : null; w.bare0 = w.bare; w.sp = 0; if (w.stage === 2) w.bare = 0; }
    const st = w.stage, sunA = (w.sunA = follow(w.sunA, w.sunT, dt, 2.5)), sa = Math.sin(sunA), nf = clamp((0.2 - sa) / 0.5), night = nf > 0.6;
    w.amp = follow(w.amp, SEA_AMP[w.kind] * N * (0.7 + 0.7 * clamp(f.rel.bassDrive)), dt, 0.8);
    w.tow = follow(w.tow, (st === 3 ? 0.045 + 0.025 * clamp(f.rel.midDrive) : st === 2 ? 0.012 : 0.02 + 0.02 * clamp(f.rel.midDrive)) * N, dt, 1.2);
    w.tense *= Math.exp(-dt * 2.2);
    w.payV *= Math.exp(-dt * 3);
    w.pay += w.payV * dt;
    w.coast = follow(w.coast, st === 3 ? 1 : 0, dt, 3);
    // each turn of the story takes a second and a half: the fish hauled up alongside, the sharks finishing it as the sail
    // goes up, the bones cut loose to sink as the sail comes down and a new line runs out
    w.sp = Math.min(1, (w.sp ?? 1) + dt / 1.5);
    const sp = ease(w.sp);
    if (st === 3) w.bare = lerp(w.bare0 ?? 1, 1, sp);
    let snare = 0;
    for (const h of hits) {
      if (isLow(h) && st < 2) { w.tense = Math.max(w.tense, h.strength); w.payV += 0.15 * N * h.strength; w.tow += 0.012 * N * h.strength; }
      else if (h.kind === 'snare') snare = Math.max(snare, h.strength);
      else if (h.kind === 'hat') pick(rnd, w.gulls).flap = 0.6;
      if (isTonal(h) && w.glints.length < 10) w.glints.push({ q: rnd() - 0.5, d: 0.15 + 0.8 * rnd(), t: 0 });
    }
    w.off += w.tow * dt;
    const tr = w.sea.trains;
    tr[0].a = w.amp; tr[1].a = w.amp * 0.45; tr[2].a = w.amp * 0.16;
    seaSurf(w.sea, N, t, w.off, base, g);
    const surf = (x) => surfAt(w.sea, x);

    // the sky: night falls with the sun's height and the stars come out; the sun, or the moon opposite it, on its arc;
    // a low sun reddens the sky over the horizon round it
    nightSky(r, 0, hz, nf);
    if (nf > 0.35) stars(r, N, Math.round(45 * nf), 31, 0, hz * 0.92, nf > 0.7 ? BRIGHT : LMID, Math.floor(t * 2));
    const arc = (a) => [0.5 * N - 0.44 * N * Math.cos(a), hz - 0.4 * N * Math.sin(a)], [sx, sy] = arc(sunA), [mx, my] = arc(sunA - Math.PI), lowSun = sa > -0.1 && sa < 0.45;
    if (lowSun) for (let y = Math.max(0, Math.round(hz - 0.05 * N)); y < hz; y++) {
      const q = (y - (hz - 0.05 * N)) / (0.05 * N);
      for (let x = Math.max(0, Math.round(sx - 0.3 * N)); x < Math.min(N, sx + 0.3 * N); x++) if (bayer(x, y) < 0.3 * q * q * (1 - Math.abs(x - sx) / (0.3 * N)) ** 2) r.buf[y * N + x] = HOT;
    }
    if (sy < hz + 0.05 * N) { oval(r, sx, sy, 0.045 * N, 0.045 * N, lowSun ? HOT : BRIGHT); if (!lowSun) circ(r, sx, sy, 0.056 * N, LMID); }
    if (nf > 0.25 && my < hz) { oval(r, mx, my, 0.03 * N, 0.03 * N, BRIGHT); oval(r, mx + 0.012 * N, my - 0.006 * N, 0.026 * N, 0.026 * N, DARK + DIM); }
    // clouds: long bands of hatching drifting on the wind, low and dark in a squall
    for (let k = 0; k < 4; k++) {
      const cy = (0.06 + 0.07 * k) * N, len = (0.2 + 0.2 * hash(k, 5)) * N, span = 1.6 * N, x = ((((hash(k, 6) * span + (f.rel.trebClock * 0.01 + t * 0.006) * N * (1 + 0.4 * k)) % span) + span) % span) - 0.3 * N; // (the wind from astern, the one that fills the sail going home)
      for (let j = 0; j < 3; j++) r.rect(x + j * 0.03 * N, cy + j * 1.5 * u, len - j * 0.06 * N, mx1(u * 0.7), w.kind === 'squall' ? DARK : night ? MID + DIM : LMID);
    }
    if (w.coast > 0.02) { // home: the coast comes up over the horizon as they sail for it, the houses along it
      const hh = 0.03 * N * w.coast;
      r.poly([[0.5 * N, hz + 1], [0.58 * N, hz - hh * 0.5], [0.7 * N, hz - hh], [0.82 * N, hz - hh * 0.7], [0.92 * N, hz - hh * 0.9], [N, hz - hh * 0.6], [N, hz + 1]], DARK);
      for (let k = 0; k < 5; k++) r.rect((0.6 + 0.06 * k) * N, hz - hh * 0.8 - u, mx1(u), mx1(u * 0.8), LMID);
    }
    paintSea(W, w.sea, hz, w.off, base, { foam: w.kind === 'calm' ? 1e9 : w.amp * 0.9, near: night ? DARK : MID, deep: night ? DARK + DIM : DARK, skin: night ? MID : LMID, farA: night ? MID + DIM : LMID + DIM, farB: night ? DARK : MID + DIM });
    // the glitter path under the sun (or the moon), straight below it on the far water; a note sets a glint in it
    const lx = sy < hz ? sx : my < hz && nf > 0.4 ? mx : -1;
    if (lx >= 0) {
      const y1 = base - w.amp * 1.5, gc = sy < hz ? BRIGHT : LMID, tk = Math.floor(t * 7);
      for (let y = Math.round(hz) + 1; y < y1; y++) { const q = (y - hz) / (y1 - hz), hw = (0.015 + 0.1 * q) * N; for (let k = 0; k < 2; k++) if (hash(y, k + tk) < 0.6) r.rect(lx + (hash(y, k + 9 + tk) - 0.5) * 2 * hw, y, mx1(u * (1 + q)), 1, gc); }
      w.glints = w.glints.filter((gl) => { gl.t += dt; const y = hz + gl.d * (y1 - hz), x = lx + gl.q * (0.03 + 0.2 * gl.d) * N, a = (1 - gl.t / 0.4) * 2.5 * u; r.rect(x - a, y, 2 * a, 1, BRIGHT); r.rect(x, y - a * 0.5, 1, a, BRIGHT); return gl.t < 0.4; });
    } else w.glints.length = 0;
    // the gulls glide and sink slowly; a hat makes one flap and it climbs; going home they wheel over the bones
    for (const gl of w.gulls) {
      gl.flap = Math.max(0, gl.flap - dt);
      gl.vy = follow(gl.vy, gl.flap > 0 ? -0.05 * N : 0.01 * N, dt, 0.4);
      if (st === 3) gl.vx = follow(gl.vx, (bx + 0.15 * N * Math.cos(t * 0.7 + gl.ph) - gl.x) * 0.8, dt, 1.5);
      gl.x += gl.vx * dt;
      gl.y = clamp(gl.y + gl.vy * dt, 0.05 * N, hz - 0.08 * N);
      if (gl.x < -0.05 * N) gl.x += 1.1 * N; else if (gl.x > 1.05 * N) gl.x -= 1.1 * N;
      bird(r, gl.x, gl.y, 0.045 * N, gl.flap > 0 ? Math.sin(gl.flap * 30) : -0.15, night ? LMID : FIG);
    }

    // the skiff on the swell, and round it the sharks: a fin is behind the hull on the far side of its circle, in front
    // on the near side, bigger and lower there
    const B = ride(w.sea, bx, Ls, 1), P = B.P;
    const fins = (near) => {
      for (const sh of w.sharks) {
        const z = Math.sin(sh.ph);
        if (z >= 0 !== near) continue;
        const x = bx + sh.R * N * Math.cos(sh.ph), yb = surf(x) + 0.012 * N * z, hgt = 0.024 * N * (1 + 0.25 * z), m = -Math.sin(sh.ph) >= 0 ? 1 : -1;
        r.poly([[x + m * 0.012 * N, yb], [x - m * 0.004 * N, yb - hgt], [x - m * 0.011 * N, yb]], FIG);
        r.rect(m > 0 ? x - 0.024 * N : x + 0.012 * N, yb, 0.012 * N, mx1(u * 0.6), LMID);
        targets.push({ x: x - 0.012 * N, y: yb - hgt, w: 0.024 * N, h: hgt });
      }
    };
    if (st === 2) { for (const sh of w.sharks) sh.ph += sh.w * dt * (0.6 + 0.6 * clamp(f.rel.midDrive)); fins(false); }
    // the old man on the after thwart facing the bow, braced against the line with his legs to the frames, leaning
    // back on it, the line over his shoulder to the coil; going home he sits by the tiller, done in
    const brace = st < 2 ? w.tense : 0, man = rig(r, P, st === 3 ? -0.34 * Ls : -0.12 * Ls, -fb * 0.8, 0.24 * N, 1, FIG, st === 3
      ? { sit: true, lean: 0.25, nod: 0.4, legs: [[1.3, 1.2], [1.2, 1.1]], arms: [[-0.7, 0.5], [0.3, 0.9]], hat: 'brim' }
      : { sit: true, lean: -0.2 - 0.4 * brace, nod: 0.2, legs: [[1.4, 1.3 - 0.6 * brace], [1.3, 1.15 - 0.5 * brace]], arms: [[1.25 - 0.2 * brace, -0.35], [1.1 - 0.2 * brace, -0.25]], hat: 'brim' });
    skiff(r, P, Ls, u, DARK);
    const C = P(0.53 * Ls, -1.55 * fb), Hd = man.hand;
    if (st < 2) {
      // the line: from his hands over the stem and down at a slant into the water, steeper while the fish sounds;
      // under the water it fades into the dark toward the fish
      const be = 0.42 + 0.3 * w.tense, cb = Math.cos(be), sb = Math.sin(be);
      let ex = C[0], ey = C[1];
      for (let k = 0; k < 4 * N && ey < surf(ex); k++) { ex += cb * 0.5; ey += sb * 0.5; }
      if (w.leap && w.leap.t < 0) { const x0 = Math.min(0.8 * N, ex + 0.05 * N); w.leap = { x: x0, y: surf(x0) + 0.04 * N, vx: 0.15 * N, vy: -0.5 * N, t: 0, inn: false }; splash(w.drops, rnd, x0, surf(x0), 30, 0.35 * N, BRIGHT); s.shake = Math.max(s.shake, 0.3); }
      let tx = ex, ty = ey, out = st === 0 ? Math.min(1, w.sp * 2) : 1; // a new line runs out from the coil to the water
      if (w.leap) { const F = w.leap; [tx, ty] = turn(F.x, F.y, Math.atan2(F.vy, F.vx))(0.135 * N, -0.004 * N); out = 1; }
      tx = C[0] + (tx - C[0]) * out; ty = C[1] + (ty - C[1]) * out;
      r.line(Hd[0], Hd[1], C[0], C[1], LMID);
      r.line(Hd[0], Hd[1], man.sh[0], man.sh[1], LMID);
      r.line(C[0], C[1], tx, ty, LMID);
      if (!w.leap && out >= 1) for (let q = 0; q < 1.2 * N; q += 1) { const qx = ex + cb * q, qy = ey + sb * q; if (qx >= N || qy >= N) break; if (hash(q | 0, 3) < 1 - q / (0.8 * N)) r.set(qx, qy, LMID + DIM); }
      if (!w.leap && out >= 1 && w.on) w.rings.push({ x: ex, y: ey, t: 0 });
      if (w.payV > 0.01 * N) { const len = Math.hypot(tx - C[0], ty - C[1]) || 1; for (let d = w.pay % (6 * u); d < len; d += 6 * u) r.set(C[0] + ((tx - C[0]) * d) / len, C[1] + ((ty - C[1]) * d) / len, BRIGHT); } // running out
      if (snare > 0) for (let k = 0; k < 6; k++) { const q = rnd(); w.drops.push({ x: lerp(C[0], tx, q), y: lerp(C[1], ty, q), vx: (rnd() - 0.5) * 0.08 * N, vy: -(0.06 + 0.12 * rnd()) * N * snare, life: 3, c: BRIGHT }); }
    }
    // the leap: up out of the sea on a long parabola under the sea's gravity, the body along its path, water streaming
    // off it, and down again head first into a burst of water
    if (w.leap && w.leap.t >= 0) {
      const F = w.leap;
      F.t += dt; F.vy += g * dt; F.x += F.vx * dt; F.y += F.vy * dt;
      const FP = turn(F.x, F.y, Math.atan2(F.vy, F.vx)), nose = FP(0.135 * N, 0);
      bigfish(r, FP, 0.3 * N, u, FIG);
      for (let k = spawns(rnd, 30, dt); k > 0; k--) { const p = FP((rnd() - 0.5) * 0.3 * N, 0); w.drops.push({ x: p[0], y: p[1], vx: F.vx * 0.7, vy: F.vy * 0.7, life: 3, c: LMID }); }
      if (!F.inn && F.vy > 0 && nose[1] > surf(nose[0])) { F.inn = true; splash(w.drops, rnd, nose[0], surf(nose[0]), 50, 0.45 * N, BRIGHT); s.shake = Math.max(s.shake, 0.55); }
      submerge(r, w.sea, F.x - 0.25 * N, F.x + 0.3 * N, N);
      targets.push({ x: F.x - 0.15 * N, y: F.y - 0.08 * N, w: 0.3 * N, h: 0.16 * N });
      if (F.inn && F.y > surf(F.x) + 0.12 * N) w.leap = null;
    }
    // alongside: the fish lashed to the skiff, half under; then what the sharks leave of it
    if (st >= 2) bigfish(r, (dx, dy) => P(0.02 * Ls + dx, fb * 0.45 + (st === 2 ? (1 - sp) * 0.15 * N : 0) + dy), 1.12 * Ls, u, FIG, w.bare);
    else if (st === 0 && w.sp < 1) bigfish(r, (dx, dy) => P(0.02 * Ls + dx, fb * 0.45 + sp * 0.3 * N + dy), 1.12 * Ls, u, FIG, 1); // the bones cut loose, sinking
    if (st === 2) {
      if (snare > 0) { const p = P((rnd() - 0.4) * 0.8 * Ls, fb * 0.4); w.bare = Math.min(1, w.bare + 0.12 * snare); w.strike = { x: p[0], y: p[1], t: 0.35, m: rnd() < 0.5 ? 1 : -1 }; splash(w.drops, rnd, p[0], p[1], 18, 0.3 * N, BRIGHT); s.shake = Math.max(s.shake, 0.25); }
      const k = w.strike;
      if (k && (k.t -= dt) > 0) { r.poly([[k.x - 0.05 * N, k.y + 0.01 * N], [k.x - 0.01 * N, k.y - 0.022 * N], [k.x + 0.05 * N, k.y + 0.01 * N]], FIG); r.poly([[k.x - 0.01 * N, k.y - 0.02 * N], [k.x - 0.02 * N * k.m, k.y - 0.045 * N], [k.x + 0.012 * N, k.y - 0.02 * N]], FIG); }
      fins(true);
    }
    // the rudder and the tiller; going home the mast stepped and the patched sail hoisted, full of the wind from astern
    // (and lowered again for the next day's fishing)
    polyP(r, P, [[-0.5 * Ls, -fb * 0.5], [-0.57 * Ls, -fb * 0.3], [-0.57 * Ls, fb * 1.2], [-0.5 * Ls, fb * 1.2]], DARK);
    strokeP(r, P, -0.5 * Ls, -fb, -0.4 * Ls, -fb * 1.6, mx1(u), DARK);
    const hs = st === 3 ? sp : st === 0 && w.sp < 1 ? 1 - sp : 0;
    if (hs > 0.02) {
      const Y = (y) => -fb - y * N * hs, full = 0.4 + 0.6 * clamp(f.rel.midDrive);
      strokeP(r, P, 0.12 * Ls, -fb, 0.12 * Ls, Y(0.2), mx1(u), FIG);
      polyP(r, P, [[0.12 * Ls, Y(0.19)], [0.12 * Ls, Y(0.06)], [-0.22 * Ls, Y(0.065)], [-0.22 * Ls + 0.03 * N * full, Y(0.12)], [-0.16 * Ls, Y(0.17)]], LMID);
      for (const [px, py, pw, ph] of [[-0.05, 0.16, 0.1, 0.03], [-0.15, 0.1, 0.08, 0.025], [0.0, 0.1, 0.06, 0.03]]) polyP(r, P, [[px * Ls, Y(py)], [(px + pw) * Ls, Y(py)], [(px + pw) * Ls, Y(py - ph)], [px * Ls, Y(py - ph)]], MID);
      strokeP(r, P, -0.22 * Ls, Y(0.065), 0.12 * Ls, Y(0.06), mx1(u), FIG);
    }
    // the stem throws spray as she goes, by the speed through the water; the wake is foam laid on the water at the stern
    // that stays where it was laid (so it drifts back at her pace), spreading and fading
    const stem = P(0.47 * Ls, 0), stern = P(-0.5 * Ls, 0);
    for (let k = spawns(rnd, (w.tow * 400) / N, dt); k > 0; k--) w.drops.push({ x: stem[0], y: stem[1] - u, vx: -w.tow * (0.2 + 0.6 * rnd()), vy: -(0.05 + 0.1 * rnd()) * N * Math.min(2, w.tow / (0.03 * N)), life: 2, c: BRIGHT });
    for (let k = spawns(rnd, 12, dt) + (w.on ? 1 : 0); k > 0; k--) w.wake.push({ X: stern[0] + w.off, age: 0 });
    w.wake = w.wake.filter((p) => { p.age += dt; const x = p.X - w.off, l = (1 + p.age * 1.5) * u; r.rect(x - l / 2, surf(x) - u * 0.5, l, mx1(u * 0.6), p.age < 1.5 ? BRIGHT : LMID); return p.age < 4 && x > -10; }).slice(-80);
    submerge(r, w.sea, bx - 0.75 * Ls, bx + 0.95 * Ls, base + 0.15 * N);
    w.drops = ballistic(W, w.drops, g, surf, BRIGHT, w.rings).slice(-220);
    w.rings = ripples(W, w.rings, LMID, 0.25, 0.08, 0.4);
    if (w.kind === 'squall') rain(r, N, u, t, 60, 1.1 * N, 0.3, LMID + DIM); // slanted by the same wind
    targets.push({ x: bx - Ls * 0.55, y: B.y - 0.13 * N, w: Ls * 1.1, h: 0.15 * N });
  },
};

// ---------------------------------------------------------------------------------------------- whalehunt
// A whaleboat in a storm swell: five oarsmen pull together, a stroke a beat (the blades sweep aft through the water in
// the drive and come back over it, the boat surges on every drive), a harpooner braced in the bow, a steersman at the
// long oar aft, the ship hove to on the horizon. Ahead the white hump of the whale breaches and sinks with the bass,
// the water streaming off it as it rises, and blows on the kicks (the spout leans on the wind and rains back down). A
// snare throws a sea over the bow, a note lights the clouds from within, the hats tear spindrift off the crests. The
// kind is the weather: grey, a gale (the swell doubles), a squall (rain, lightning on a hard snare). A drop throws the
// harpoon: it flies a parabola trailing its line, strikes the hump where it touches it, the whale sounds with its
// flukes up and the boat is towed after it on a taut line, spray at the bow, until the next section cuts it free.
const WEATHER_W = { grey: [3, 2, 1], gale: [1, 2, 3], squall: [1, 2, 2] };
const whalehunt = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, WEATHER_W, bandOf(W.a)), off: 0, v: 0.04 * N, amp: 0.02 * N, up: 0.4, blow: 0, flukes: -1, harp: null, struck: null, throwT: -1,
      drops: [], rings: [], spout: [], bolt: null, glow: 0, flash: 0,
      sea: { trains: [{ l: 0.8, d: -1, p: 0, a: 0 }, { l: 0.36, d: -1, p: 1.7, a: 0 }, { l: 0.15, d: 1, p: 3.9, a: 0 }] } });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.42 * N, base = 0.68 * N, g = 0.55 * N, bx = 0.33 * N, Lb = 0.36 * N, fb = Lb * 0.09;
    const p = frac(beatClock(w, f, dt));
    if (f.section === 'change') { w.kind = rollW(rnd, WEATHER_W, band); w.struck = null; }
    if (f.section === 'drop' && !w.harp && !w.struck && w.throwT < 0) w.throwT = 0;
    const gale = w.kind === 'gale';
    w.cx = (w.cx ?? 0) + (gale ? 0.06 : 0.03) * dt; // how far the scud has driven (screens): a gale speeds it up, it does not jump
    w.amp = follow(w.amp, (gale ? 0.04 : 0.024) * N * (0.7 + 0.7 * clamp(f.rel.bassDrive)), dt, 0.8);
    // the boat surges on the drive and runs on through the recovery; struck, the whale has her in tow
    w.v = follow(w.v, w.struck ? 0.11 * N : (0.035 + 0.015 * clamp(f.rel.midDrive)) * N * (p < 0.45 ? 1.35 : 0.75), dt, 0.3);
    w.off += w.v * dt;
    const was = w.up;
    w.up = follow(w.up, w.struck || w.throwT >= 0 || w.harp ? (w.struck ? 0 : Math.max(w.up, 0.75)) : clamp(0.15 + 0.95 * f.rel.bassDrive), dt, w.struck ? 0.8 : 0.6);
    const rising = (w.up - was) / Math.max(dt, 1e-3);
    // the surface first: the hats below throw their spindrift off it
    const tr = w.sea.trains;
    tr[0].a = w.amp; tr[1].a = w.amp * 0.5; tr[2].a = w.amp * 0.18;
    seaSurf(w.sea, N, t, w.off, base, g);
    const surf = (x) => surfAt(w.sea, x);
    let sea = 0;
    for (const h of hits) {
      if (isLow(h) && w.up > 0.35 && !w.struck) w.blow = h.strength;
      else if (h.kind === 'snare') {
        sea = Math.max(sea, h.strength);
        if (w.kind !== 'grey' && h.strength > 0.6 && !w.bolt) {
          const pts = [];
          let x = (0.2 + 0.6 * rnd()) * N, y = 0.16 * N;
          pts.push([x, y]);
          while (y < hz) { x += (rnd() - 0.5) * 0.06 * N; y = Math.min(hz, y + (0.03 + 0.03 * rnd()) * N); pts.push([x, y]); }
          w.bolt = { pts, t: 0.18 };
          w.flash = 0.07;
        }
      } else if (h.kind === 'hat') for (let k = 0; k < 2; k++) { const x = rnd() * N; w.drops.push({ x, y: surfAt(w.sea, x) - u, vx: -(0.1 + 0.1 * rnd()) * N, vy: -(0.04 + 0.05 * rnd()) * N, life: 1.5, c: LMID }); }
      if (isTonal(h)) w.glow = 1;
    }
    w.glow *= Math.exp(-dt * 3);
    w.flash -= dt;

    // the sky: a ceiling of storm cloud whose ragged underside rolls on the wind, a note lighting it from inside, the
    // scud driving under it; lightning whitens it all
    const sky = w.flash > 0 ? LMID : DARK;
    for (let x = 0; x < N; x++) {
      const cb = (0.13 + 0.04 * Math.sin(x * 0.06 + f.rel.trebClock * 0.3) + 0.025 * Math.sin(x * 0.17 - t * 0.4) + (gale ? 0.03 : 0)) * N;
      vcol(r, x, 0, cb, sky);
      if (w.glow > 0.2 && hash(x, 3) < w.glow) r.set(x, cb, COOL);
    }
    for (let k = 0; k < 4; k++) { const span = 1.5 * N, x = ((((hash(k, 8) * span - w.cx * N * (1 + k * 0.3)) % span) + span) % span) - 0.25 * N; cloud(r, x, (0.2 + 0.04 * k) * N, (0.12 + 0.05 * hash(k, 9)) * N, MID + DIM, k); }
    paintSea(W, w.sea, hz, w.off, base, { foam: w.amp * (gale ? 0.55 : 0.9) });
    // the ship hove to on the horizon, small with the distance, rolling slowly on the long swell
    const shx = (0.1 + 0.02 * Math.sin(t * 0.05)) * N, SP = turn(shx, hz, 0.06 * Math.sin(t * 0.7));
    polyP(r, SP, [[-0.04 * N, -0.008 * N], [0.045 * N, -0.01 * N], [0.035 * N, 0.002 * N], [-0.035 * N, 0.002 * N]], DARK);
    for (const [mp, mh] of [[-0.022, 0.05], [0, 0.06], [0.022, 0.045]]) {
      strokeP(r, SP, mp * N, -0.008 * N, mp * N, -(0.008 + mh) * N, mx1(u * 0.6), DARK);
      for (let k = 0; k < 3; k++) polyP(r, SP, [[(mp - 0.009) * N, -(0.016 + k * 0.014) * N], [(mp + 0.009) * N, -(0.016 + k * 0.014) * N], [(mp + 0.008) * N, -(0.025 + k * 0.014) * N], [(mp - 0.008) * N, -(0.025 + k * 0.014) * N]], LMID + DIM);
    }

    // the whale: the white hump ahead, raised and lowered with the bass, scarred; the water streams off it as it rises
    // and foam rings it where it breaks the surface
    const wx = (0.76 + 0.04 * Math.sin(t * 0.11)) * N, ws = surf(wx), hw = 0.13 * N, hh = 0.075 * N, top = ws + hh * 0.35 - hh * 1.3 * w.up;
    oval(r, wx, top + hh, hw, hh, BRIGHT);
    oval(r, wx + hw * 0.55, top + hh * 0.8, hw * 0.5, hh * 0.8, BRIGHT);
    for (let k = 0; k < 5; k++) { const sx0 = wx + (hash(k, 21) - 0.6) * hw, sy0 = top + hh * (0.3 + 0.4 * hash(k, 22)); r.line(sx0, sy0, sx0 + 0.02 * N, sy0 + 0.006 * N * (hash(k, 23) - 0.5), LMID); }
    const bh = [wx + hw * 0.75, top + hh * 0.15]; // the blowhole, forward on the head
    if (w.up > 0.1 && top < ws) {
      const half = hw * Math.sqrt(Math.max(0, 1 - ((ws - top - hh) / hh) ** 2));
      for (const k of [-1, 1]) for (let j = 0; j < 3; j++) r.rect(wx + k * (half + j * 1.5 * u), ws - u * 0.5, mx1(u), mx1(u), BRIGHT);
      if (rising > 0.05) for (let k = spawns(rnd, 40, dt); k > 0; k--) { const x = wx + (rnd() - 0.5) * 1.4 * half; w.drops.push({ x, y: top + hh * 0.2, vx: (x - wx) * 0.4, vy: 0, life: 2, c: LMID }); }
      targets.push({ x: wx - hw, y: top, w: 2 * hw, h: ws - top });
    }
    if (w.blow > 0) { for (let k = 0; k < 26; k++) w.spout.push({ x: bh[0] + (rnd() - 0.5) * 2 * u, y: bh[1], vx: -(0.01 + 0.05 * rnd()) * N, vy: -(0.3 + 0.4 * rnd()) * N * (0.6 + 0.4 * w.blow), life: 3, c: rnd() < 0.5 ? BRIGHT : LMID }); w.blow = 0; }
    // struck, it sounds: the flukes come up out of the water behind the hump and go down
    if (w.struck && w.flukes >= 0 && (w.flukes += dt) < 1.8) {
      const q = w.flukes / 1.8, fx = wx - hw * 0.4, fy = surf(fx) - 0.09 * N * Math.sin(Math.PI * q);
      r.stroke(fx, fy + 0.03 * N, fx, fy, mx1(3 * u), BRIGHT);
      r.poly([[fx, fy], [fx - 0.07 * N, fy - 0.03 * N], [fx - 0.05 * N, fy + 0.005 * N], [fx, fy + 0.01 * N], [fx + 0.05 * N, fy + 0.005 * N], [fx + 0.07 * N, fy - 0.03 * N]], BRIGHT);
      for (let k = spawns(rnd, 30, dt); k > 0; k--) w.drops.push({ x: fx + (rnd() - 0.5) * 0.12 * N, y: fy, vx: 0, vy: 0, life: 2, c: LMID });
    }
    submerge(r, w.sea, wx - hw * 1.2, wx + hw * 1.3, N);

    // the boat: the rowers on their thwarts facing aft, the oars swept on the stroke, the harpooner in the bow and the
    // steersman aft standing; all of it riding the swell
    const B = ride(w.sea, bx, Lb, 1), P = B.P, oars = [];
    for (let i = 0; i < 5; i++) oars.push(oarAt(p, (-0.26 + i * 0.12) * Lb, -fb, 0.085 * N, fb));
    for (let i = 0; i < 5; i++) rower(r, P, (-0.23 + i * 0.12) * Lb, -fb * 0.35, 0.17 * N, FIG, p, oars[i].hx, oars[i].hy);
    polyP(r, P, [[-0.5 * Lb, -fb * 1.6], [-0.42 * Lb, -fb], [0.42 * Lb, -fb], [0.5 * Lb, -fb * 1.6], [0.45 * Lb, 0], [0.3 * Lb, fb * 0.9], [-0.3 * Lb, fb * 0.9], [-0.45 * Lb, 0]], DARK);
    strokeP(r, P, -0.42 * Lb, -fb, 0.42 * Lb, -fb, mx1(u), LMID);
    for (let i = 0; i < 5; i++) {
      const lx = (-0.26 + i * 0.12) * Lb, o = oars[i];
      strokeP(r, P, o.hx, o.hy, o.bx, o.by, mx1(u * 0.8), LMID);
      strokeP(r, P, o.bx - (o.bx - lx) * 0.15, o.by - (o.by + fb) * 0.15, o.bx, o.by, mx1(1.8 * u), LMID);
      if (o.drive && o.q < 0.1 && rnd() < 0.5) { const b = P(o.bx, 0); w.drops.push({ x: b[0], y: b[1], vx: (rnd() - 0.5) * 0.05 * N, vy: -0.08 * N * rnd(), life: 1, c: BRIGHT }); } // the catch splashes
    }
    // the harpooner: the iron held high over his shoulder; a drop: he throws, his arm comes through, and it is away
    const tq = w.throwT >= 0 ? clamp(w.throwT / 0.3) : 0, armA = w.throwT >= 0 ? lerp(-2.7, 1.1, ease(tq)) : -2.7;
    const hp = rig(r, P, 0.38 * Lb, -fb * 0.7, 0.17 * N, 1, FIG, { lean: 0.1 + 0.2 * tq, legs: [[0.35, 0.3], [-0.25, 0.1]], arms: [[armA, 0.5], [0.9, 0.4]], hat: 'cap' });
    if (w.throwT >= 0) {
      w.throwT += dt;
      if (w.throwT >= 0.3) {
        // away: aimed to land on the hump's crown in T seconds under the sea's gravity
        const T = 0.9, tx = wx, ty = top + hh * 0.1;
        w.harp = { x: hp.hand[0], y: hp.hand[1], vx: (tx - hp.hand[0]) / T, vy: (ty - hp.hand[1]) / T - 0.5 * g * T, t: 0 };
        w.throwT = -1;
      }
    }
    if (!w.harp && !w.struck) { const a = -0.35, hx = hp.hand[0], hy = hp.hand[1]; r.stroke(hx - Math.cos(a) * 0.04 * N, hy - Math.sin(a) * 0.04 * N, hx + Math.cos(a) * 0.08 * N, hy + Math.sin(a) * 0.08 * N, mx1(u), DARK); }
    rig(r, P, -0.44 * Lb, -fb * 1.2, 0.17 * N, 1, FIG, { lean: -0.15 + 0.1 * Math.sin(t * 0.9), legs: [[0.2, 0.2], [-0.2, 0.1]], arms: [[-0.9, 0.4], [-0.6, 0.3]], hat: 'brim' });
    const so = P(-0.5 * Lb, -fb * 2.4), si = P(-0.76 * Lb, fb * 1.4);
    r.stroke(so[0], so[1], si[0], si[1], mx1(u), DARK); // the steering oar, its blade in the water astern
    // the iron in flight: along its path, the line paying out after it from the bow in a sagging curve; it strikes
    // where it touches the hump (and stays there, the line taut), or is lost in the sea
    const chock = P(0.5 * Lb, -fb * 1.6);
    const lineTo = (x1, y1, sag) => { let px = chock[0], py = chock[1]; for (let k = 1; k <= 12; k++) { const q = k / 12, nx = lerp(chock[0], x1, q), ny = lerp(chock[1], y1, q) + sag * 4 * q * (1 - q); r.line(px, py, nx, ny, LMID); px = nx; py = ny; } };
    if (w.harp) {
      const Hp = w.harp;
      Hp.t += dt; Hp.x += Hp.vx * dt; Hp.y += (Hp.vy + 0.5 * g * dt) * dt; Hp.vy += g * dt; // the exact parabola at any dt, so it lands where it was aimed
      const a = Math.atan2(Hp.vy, Hp.vx), ca = Math.cos(a), sa = Math.sin(a);
      r.stroke(Hp.x - ca * 0.09 * N, Hp.y - sa * 0.09 * N, Hp.x, Hp.y, mx1(u), DARK);
      r.poly([[Hp.x + ca * 2.5 * u, Hp.y + sa * 2.5 * u], [Hp.x - sa * 1.5 * u, Hp.y + ca * 1.5 * u], [Hp.x + sa * 1.5 * u, Hp.y - ca * 1.5 * u]], BRIGHT);
      lineTo(Hp.x - ca * 0.09 * N, Hp.y - sa * 0.09 * N, 0.04 * N);
      if (((Hp.x - wx) / hw) ** 2 + ((Hp.y - top - hh) / hh) ** 2 < 1 && Hp.y < ws) { // it touches the hump: struck
        w.struck = { dx: Hp.x - wx, dy: Hp.y - top, a };
        w.harp = null;
        w.flukes = 0;
        splash(w.drops, rnd, Hp.x, Hp.y, 24, 0.3 * N, BRIGHT);
        s.shake = Math.max(s.shake, 0.6);
      } else if (Hp.vy > 0 && Hp.y > surf(Hp.x)) { splash(w.drops, rnd, Hp.x, surf(Hp.x), 12, 0.2 * N, BRIGHT); w.harp = null; }
    }
    if (w.struck) { // the iron stays in the whale as it sounds; the line runs taut from the bow down to it
      const k = w.struck, ix = wx + k.dx, iy = top + k.dy;
      r.stroke(ix - Math.cos(k.a) * 0.06 * N, iy - Math.sin(k.a) * 0.06 * N, ix, iy, mx1(u), DARK);
      lineTo(ix - Math.cos(k.a) * 0.06 * N, iy - Math.sin(k.a) * 0.06 * N, 0);
      for (let k = spawns(rnd, 25, dt); k > 0; k--) { const st = P(0.47 * Lb, 0); w.drops.push({ x: st[0], y: st[1] - u, vx: -0.05 * N * rnd(), vy: -(0.1 + 0.15 * rnd()) * N, life: 2, c: BRIGHT }); } // the bow wave of the tow
    }
    if (sea > 0) { const st = P(0.48 * Lb, -fb); splash(w.drops, rnd, st[0], st[1], Math.round(10 + 16 * sea), 0.3 * N, BRIGHT, 0.5); }
    submerge(r, w.sea, bx - 0.85 * Lb, N, base + 0.15 * N);
    w.spout = ballistic(W, w.spout, g, surf, BRIGHT, w.rings).slice(-150);
    w.drops = ballistic(W, w.drops, g, surf, BRIGHT, w.rings).slice(-220);
    w.rings = ripples(W, w.rings, LMID, 0.25, 0.08, 0.4);
    if (w.kind === 'squall') rain(r, N, u, t, 70, 1.2 * N, -0.35, LMID + DIM);
    if (w.bolt && (w.bolt.t -= dt) > 0) { const pts = w.bolt.pts; for (let k = 1; k < pts.length; k++) r.stroke(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], mx1(u), WHITE); } else w.bolt = null;
    targets.push({ x: bx - 0.5 * Lb, y: B.y - 0.15 * N, w: Lb, h: 0.17 * N });
  },
};

// ---------------------------------------------------------------------------------------------- windmills
// A lanky knight on a thin horse, a squire on a donkey trotting after him, on a plain of windmills whose sails turn
// with the wind (the bass; heavy sails take their time to speed up and to slow). The knight rides at the near mill
// and wheels away from it, again and again, the horse's legs in step with the beat at the speed its stride gives
// (walking, trotting or galloping: the kind, by the arousal); the donkey trots after at its own. A kick raises the dust
// under the hooves and gusts the sails, a snare rears the horse, the hats flap the crows round the mill, a note glints
// on the basin of a helmet; the sun is high on the left and every shadow lies to the right. A drop: he charges home,
// the lance catches a sail and he is carried round on it, hanging the way gravity and the swing pull him, once round
// and let go on the way up along the tangent into a parabola; he lands in the dust, lies there, gets up and walks back
// to the horse, which has come round to meet him.
const PACE_W = { walk: [3, 1, 0], trot: [1, 3, 1], gallop: [0, 1, 3] };
// a windmill standing on `base` at scale `s` (1 the near one), its tower `tall` times the usual: a whitewashed round
// tower, a conical cap, four sails on a hub turned to `ang` (turning clockwise), lattice frames with the canvas on the
// side the turning leaves behind
function mill(r, x, base, s, ang, N, u, tall = 1) {
  const th = 0.3 * N * s * tall, bw = 0.055 * N * s, tw = 0.04 * N * s, hy = base - th - 0.025 * N * s, R = 0.22 * N * s, lw = mx1(u * s);
  r.poly([[x - bw, base], [x + bw, base], [x + tw, base - th], [x - tw, base - th]], BRIGHT);
  r.line(x - bw, base, x - tw, base - th, DARK);
  r.line(x + bw, base, x + tw, base - th, DARK);
  r.rect(x - 0.012 * N * s, base - 0.05 * N * s, 0.024 * N * s, 0.05 * N * s, DARK);
  r.rect(x - 0.008 * N * s, base - 0.19 * N * s * tall, 0.016 * N * s, 0.02 * N * s, DARK);
  r.poly([[x - tw * 1.3, base - th], [x + tw * 1.3, base - th], [x, base - th - 0.075 * N * s]], DARK);
  for (let k = 0; k < 4; k++) {
    const a = ang + (k * Math.PI) / 2, c = Math.cos(a), sn = Math.sin(a), wd = 0.05 * N * s, p = (q, d) => [x + c * q * R + sn * d * wd, hy + sn * q * R - c * d * wd];
    r.poly([p(0.2, 0), p(1, 0), p(1, 1), p(0.2, 1)], LMID);
    for (let j = 0; j < 5; j++) { const a0 = p(0.2 + j * 0.2, 0), a1 = p(0.2 + j * 0.2, 1); r.line(a0[0], a0[1], a1[0], a1[1], DARK); }
    const e0 = p(0.2, 1), e1 = p(1, 1);
    r.line(e0[0], e0[1], e1[0], e1[1], DARK);
    r.stroke(x, hy, x + c * R, hy + sn * R, lw, DARK);
  }
  oval(r, x, hy, 0.012 * N * s + 0.5, 0.012 * N * s + 0.5, DARK);
  return [x, hy, R];
}

const windmills = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, PACE_W, bandOf(W.a)), sail: rnd() * TAU, om: 1, gust: 0, st: 'ride', hx: 0.2, hdir: 1, hph: 0, rear: 0, glint: 0, raise: 0,
      kx: 0, ky: 0, vx: 0, vy: 0, spin: 0, kt: 0, kph: 0, S0: null, turned: 0, total: 0, sq: { x: 0.04, ph: 0, dir: 1 }, dust: [],
      crows: Array.from({ length: 3 }, (_, i) => ({ a: i * 2.1, rr: 0.1 + 0.025 * i, flap: 0 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.6 * N, g = 0.86 * N, G = 0.5 * N, B = bps(f), kh = 0.2 * N;
    beatClock(w, f, dt);
    if (f.section === 'change') w.kind = rollW(rnd, PACE_W, band);
    if (f.section === 'drop' && w.st === 'ride') { w.st = 'charge'; w.gust = 0.6; }
    w.gust *= Math.exp(-dt * 0.3);
    w.om = follow(w.om, Math.min(1.8, 0.35 + 1.3 * clamp(f.rel.bassDrive) + w.gust), dt, 1.2);
    w.sail += w.om * dt;
    let kick = 0;
    for (const h of hits) {
      if (isLow(h)) { kick = h.strength; w.gust = Math.max(w.gust, 0.25 * h.strength); }
      else if (h.kind === 'snare') { if (w.st === 'ride' && w.kind !== 'gallop') w.rear = 1; else w.raise = 1; }
      else if (h.kind === 'hat') pick(rnd, w.crows).flap = 0.5;
      if (isTonal(h)) w.glint = 0.3;
    }
    w.rear *= Math.exp(-dt * 2.5);
    w.raise *= Math.exp(-dt * 3);
    w.glint -= dt;

    // the sky and the plain: a high sun on the left, clouds drifting on the wind, a far line of hills, rows of scrub
    // closing up toward the horizon
    oval(r, 0.14 * N, 0.13 * N, 0.05 * N, 0.05 * N, BRIGHT);
    circ(r, 0.14 * N, 0.13 * N, 0.062 * N, LMID);
    for (let k = 0; k < 3; k++) { const span = 1.5 * N, x = ((((hash(k, 2) * span + t * 0.012 * N * (1 + k * 0.3)) % span) + span) % span) - 0.25 * N; cloud(r, x, (0.18 + 0.07 * k) * N, (0.16 + 0.06 * hash(k, 3)) * N, LMID + DIM, k + 3); }
    for (let x = 0; x < N; x++) vcol(r, x, hz - 0.02 * N - 0.015 * N * (Math.sin(x * 0.05 + 1) + 0.5 * Math.sin(x * 0.13)), hz + 1, MID + DIM);
    r.rect(0, hz, N, N - hz, LMID);
    for (let k = 1; k < 9; k++) { const y = hz + (g - hz) / (1 + k * 0.5); for (let j = 0; j < 7; j++) { const x = hash(k, j) * N; r.rect(x, y, mx1((3 * u) / (1 + k * 0.5)), mx1(u * 0.7), DARK + DIM); } }
    r.rect(0, g - 0.02 * N, N, N - g + 0.02 * N, LMID + DIM);
    for (let j = 0; j < 14; j++) { const x = hash(j, 31) * N, y = g + hash(j, 32) * (N - g); r.line(x, y, x - u, y - 2 * u, MID + DIM); r.line(x, y, x + u, y - 2 * u, MID + DIM); }
    // the far mills, smaller with the distance, standing on the plain where their distance puts them; the near one
    for (const [mx0, d] of [[0.2, 3.2], [0.45, 2.2]]) { const yb = hz + (g - hz) / d; r.rect(mx0 * N, yb, (0.1 * N) / d, mx1(u / d), MID + DIM); mill(r, mx0 * N, yb, 1 / d, w.sail + d, N, u); }
    r.poly([[0.83 * N, g], [0.98 * N, g + 0.012 * N], [0.98 * N, g + 0.02 * N], [0.73 * N, g + 0.012 * N]], MID + DIM); // its shadow
    const [hubX, hubY, R] = mill(r, 0.78 * N, g, 0.92, w.sail, N, u, 1.35);
    // the crows wheel round the cap; a hat makes one beat its wings
    for (const c of w.crows) { c.a += dt * 0.7; c.flap = Math.max(0, c.flap - dt); bird(r, hubX + Math.cos(c.a) * c.rr * N, hubY - 0.13 * N + Math.sin(c.a) * c.rr * N * 0.4, 0.03 * N, c.flap > 0 ? Math.sin(c.flap * 30) : -0.1, FIG); }

    // the horse: its speed is its stride by the beat, the legs go round with the ground covered
    const hl = 0.17 * N, legL = 0.62 * hl, pace = w.st === 'charge' ? 'gallop' : w.kind, k16 = pace === 'gallop' ? 1.3 : 1, cyc = pace === 'walk' ? 0.5 : 1;
    const stride = 2 * Math.sin(0.4) * legL * k16, v = stride * cyc * B;
    let hv = 0;
    if (w.st === 'ride') {
      hv = w.hdir * v;
      w.hx += (hv * dt) / N;
      if (w.hx > 0.38) { w.hx = 0.38; w.hdir = -1; } else if (w.hx < -0.04) { w.hx = -0.04; w.hdir = 1; } // wheeling short of the sails' reach
    } else if (w.st === 'charge') { w.hdir = 1; const stop = (hubX - 0.34 * N) / N; hv = Math.min(v, (Math.max(0, stop - w.hx) * N) / dt); w.hx += (hv * dt) / N; }
    else if (w.st === 'walk') { const d = w.kx - w.hx * N; w.hdir = Math.sign(d) || 1; hv = Math.abs(d) > 0.03 * N ? w.hdir * stride * 0.5 * B : 0; w.hx += (hv * dt) / N; }
    w.hph += (Math.abs(hv) * dt * TAU) / stride;
    const hX = w.hx * N, moving = Math.abs(hv) > 0.002 * N;
    if (moving && rnd() < dt * Math.abs(hv) * (40 / N)) w.dust.push({ x: hX - w.hdir * hl * 0.3, y: g - u, vx: -w.hdir * 0.02 * N, vy: -0.03 * N, life: 1.2, age: 0, s: 1.5 * u });
    if (kick > 0) for (let k = 0; k < 4; k++) w.dust.push({ x: hX + (rnd() - 0.5) * hl * 0.8, y: g - u, vx: (rnd() - 0.5) * 0.06 * N, vy: -0.05 * N * kick, life: 1.2, age: 0, s: 2 * u });
    r.rect(hX - hl * 0.3, g - u * 0.5, hl * 0.75, mx1(u), MID + DIM); // its shadow, to the right
    const H = beast(r, hX, g, hl, w.hdir, FIG, w.hph, { gait: pace, moving, rear: w.st === 'ride' ? 0.55 * w.rear : 0, neck: 1.0 });
    targets.push({ x: hX - hl * 0.5, y: g - hl * 1.1, w: hl, h: hl * 1.1 });

    // the squire on his donkey keeps behind the knight, at his own trot; he throws up his arms when the knight flies
    const SQ = w.sq, aim = w.st === 'ride' || w.st === 'charge' ? w.hx - w.hdir * 0.17 : SQ.x, nx = follow(SQ.x, clamp(aim, -0.1, 0.5), dt, 1.2), dl = 0.12 * N;
    if (Math.abs(nx - SQ.x) * N > 0.002 * N * dt * 60) SQ.dir = Math.sign(nx - SQ.x);
    SQ.ph += (Math.abs(nx - SQ.x) * N * TAU) / (2 * Math.sin(0.4) * 0.45 * dl);
    SQ.x = nx;
    const alarm = w.st === 'carried' || w.st === 'fly' || w.st === 'down';
    r.rect(SQ.x * N - dl * 0.3, g - u * 0.5, dl * 0.75, mx1(u), MID + DIM);
    const D = beast(r, SQ.x * N, g, dl, SQ.dir, DARK, SQ.ph, { kind: 'donkey', gait: 'trot', moving: Math.abs(nx - aim) > 0.004 });
    rig(r, ID, D.sad[0], D.sad[1], 0.15 * N, SQ.dir, DARK, { sit: true, lean: 0.05, legs: [[0.5, 0.6], [0.4, 0.5]], arms: alarm ? [[2.8, 0.2], [2.6, 0.3]] : [[0.6, 0.6], [0.4, 0.7]], hat: 'cap', robe: 0.5 });

    // the knight: in the saddle with the lance couched at the gallop and raised otherwise (a snare raises it); then
    // the sail, the flight, the dust, the long walk back
    const lanceL = 0.24 * N, B0 = { lean: 0.1, nod: 0.05, hat: 'basin', hatCol: LMID };
    const drawLance = (hx, hy, a, dir) => { const c = Math.cos(a) * dir, sn = Math.sin(a); r.stroke(hx - c * 0.05 * N, hy - sn * 0.05 * N, hx + c * lanceL, hy + sn * lanceL, mx1(u), DARK); return [hx + c * lanceL, hy + sn * lanceL]; };
    if (w.st === 'ride' || w.st === 'charge') {
      const couch = pace === 'gallop' ? 1 : 0, la = w.st === 'charge' ? -0.3 : couch ? -0.05 - 0.5 * w.raise : -1.1 - 0.3 * w.raise;
      const K = rig(r, ID, H.sad[0], H.sad[1], kh, w.hdir, FIG, { ...B0, sit: true, lean: 0.12 + 0.15 * couch, legs: [[0.35, 0.5], [0.3, 0.45]], arms: [[couch ? 1.2 : 0.6, couch ? 0.2 : 0.9], [0.9, 0.9]] });
      oval(r, K.hand2[0] + w.hdir * 0.01 * N, K.hand2[1], 0.018 * N, 0.025 * N, LMID); // the shield on the far arm
      const T = drawLance(K.hand[0], K.hand[1], la, w.hdir);
      if (w.glint > 0) { r.rect(K.head[0] - 2 * u, K.head[1] - 0.04 * N, 4 * u, mx1(u * 0.6), WHITE); r.rect(K.head[0] - u * 0.3, K.head[1] - 0.04 * N - 2 * u, mx1(u * 0.6), 4 * u, WHITE); }
      targets.push({ x: K.head[0] - 0.03 * N, y: K.head[1] - 0.03 * N, w: 0.06 * N, h: 0.14 * N });
      if (w.st === 'charge') {
        // the catch: the lance's point is inside the sails' circle and a sail sweeps through it (or lies on it) this frame
        const dx = T[0] - hubX, dy = T[1] - hubY, d = Math.hypot(dx, dy), ph = Math.atan2(dy, dx);
        if (d < R * 0.97 && d > R * 0.25) for (let k = 0; k < 4; k++) {
          const ahead = ((((ph - (w.sail + (k * Math.PI) / 2)) % TAU) + TAU) % TAU), behind = TAU - ahead;
          if (ahead < w.om * dt + 0.01 || behind < (0.05 * N) / d) {
            Object.assign(w, { st: 'carried', S0: [dx, dy], turned: 0, total: ((((Math.PI + 0.15 - ph) % TAU) + TAU) % TAU) + TAU });
            s.shake = Math.max(s.shake, 0.4);
            break;
          }
        }
      }
    } else {
      if (w.st === 'carried') {
        // carried round with the sail: the lance is through the canvas and he hangs on where it went in, so his grip
        // turns about the hub with the sail; his body hangs along gravity plus the outward pull of the turning (ω² r),
        // knees up; once round, on the way up the near side, he lets go along the tangent
        w.turned += w.om * dt;
        const ang = Math.atan2(w.S0[1], w.S0[0]) + w.turned, rho = Math.hypot(w.S0[0], w.S0[1]), hx = hubX + Math.cos(ang) * rho, hy = hubY + Math.sin(ang) * rho;
        const om2 = w.om * w.om, gx = om2 * (hx - hubX), gy = G + om2 * (hy - hubY), gl = Math.hypot(gx, gy);
        r.stroke(hx - Math.cos(ang) * 0.1 * N, hy - Math.sin(ang) * 0.1 * N, hx + Math.cos(ang) * 0.12 * N, hy + Math.sin(ang) * 0.12 * N, mx1(u), DARK);
        const ox = hx + (gx / gl) * 0.61 * kh, oy = hy + (gy / gl) * 0.61 * kh;
        rig(r, turn(ox, oy, Math.atan2(-gx, gy)), 0, 0, kh, 1, FIG, { ...B0, sit: true, lean: 0, legs: [[1.3 + 0.3 * Math.sin(t * 9), 1.6], [1.0, 1.3]], arms: [[Math.PI, 0], [Math.PI - 0.1, 0]] });
        targets.push({ x: ox - 0.05 * N, y: oy - 0.1 * N, w: 0.1 * N, h: 0.2 * N });
        if (w.turned >= w.total) Object.assign(w, { st: 'fly', kx: ox, ky: oy, vx: -w.om * (hy - hubY), vy: w.om * (hx - hubX), spin: Math.atan2(-gx, gy) }); // away with his grip's speed, along the tangent there (he hangs from it, he is not fixed to the sail)
      } else if (w.st === 'fly') {
        w.vy += G * dt; w.kx += w.vx * dt; w.ky += w.vy * dt; w.spin += 3.5 * dt;
        const P = turn(w.kx, w.ky, w.spin);
        rig(r, P, 0, 0.45 * kh, kh, 1, FIG, { ...B0, legs: [[0.6, 0.2], [-0.5, 0.3]], arms: [[2.2, 0.3], [-2.2, 0.3]] });
        strokeP(r, P, -0.1 * N, -0.3 * kh, 0.12 * N, -0.3 * kh, mx1(u), DARK);
        targets.push({ x: w.kx - 0.06 * N, y: w.ky - 0.06 * N, w: 0.12 * N, h: 0.12 * N });
        if (w.vy > 0 && w.ky > g - 0.04 * N) { Object.assign(w, { st: 'down', kt: 0, kx: clamp(w.kx, 0.08 * N, 0.92 * N) }); s.shake = Math.max(s.shake, 0.5); for (let k = 0; k < 14; k++) w.dust.push({ x: w.kx + (rnd() - 0.5) * 0.12 * N, y: g - u, vx: (rnd() - 0.5) * 0.1 * N, vy: -0.06 * N * rnd(), life: 1.6, age: 0, s: 2.5 * u }); }
      } else {
        // in the dust: flat out, then up (turning up about his feet), then walking back, the lance on his shoulder
        w.kt += dt;
        if (w.st === 'down' && w.kt > 1.6) { w.st = 'rise'; w.kt = 0; }
        if (w.st === 'rise' && w.kt > 0.8) { w.st = 'walk'; w.kt = 0; }
        const dir = Math.sign(w.hx * N - w.kx) || -1, lie = w.st === 'down' ? 1 : w.st === 'rise' ? 1 - ease(w.kt / 0.8) : 0;
        let kv = 0;
        if (w.st === 'walk') { kv = Math.min(stepLen(kh, 0.45) * B, Math.abs(w.hx * N - w.kx) / dt) * dir; w.kx += kv * dt; w.kph += (Math.abs(kv) * dt * Math.PI) / stepLen(kh, 0.45); }
        const P = turn(w.kx, g - lie * 0.03 * kh, -dir * lie * Math.PI * 0.5), legs = w.st === 'walk' ? gaitLegs(w.kph, 0.45) : [[0.1, 0.1], [-0.1, 0.1]];
        const K = rig(r, P, 0, 0, kh, dir, FIG, { ...B0, legs, arms: [[-0.4, 1.9], gaitArms(w.kph, 0.45)[1]] });
        strokeP(r, ID, K.hand[0] - dir * 0.06 * N, K.hand[1] + 0.02 * N, K.hand[0] + dir * 0.04 * N, K.hand[1] - 0.21 * N, mx1(u), DARK);
        targets.push({ x: w.kx - 0.05 * N, y: g - kh, w: 0.1 * N, h: kh });
        if (w.st === 'walk' && Math.abs(w.hx * N - w.kx) < 0.035 * N) { w.st = 'ride'; w.hdir = -1; }
      }
    }
    // the dust: puffs off the hooves and the fall that rise a little, slow, drift on the wind and settle out
    w.dust = smoke(W, w.dust, 0.02 * N, LMID, LMID + DIM).slice(-40);
  },
};

// ---------------------------------------------------------------------------------------------- castaway
// A castaway's beach seen from the sand: the sea to the horizon, the waves lapping up the beach a swash a beat (thrown
// up the slope and slowing, then running back, the wet sand drying behind), a big one on the kick; palms swaying with
// the treble and the wind, a parrot on a frond that flaps on the hats and bobs on the notes, a hut of sticks and
// thatch. He builds a raft at the water's edge, a log a beat with the hammer coming down on it, a mast when it is
// whole; and on the snares footprints that are not his appear in the sand one by one, coming up the beach. Everything
// on the sand is smaller the farther up the beach it stands. The kind is the weather: calm, a breeze, a squall with
// rain. A drop: a ship on the horizon, hull down at first and rising over the curve of the sea; he runs to the signal
// fire and lights it, the smoke climbing fast off it and slowing as it cools, and waves both arms at the ship.
const BEACH_W = { calm: [3, 2, 1], breeze: [2, 3, 2], squall: [0, 1, 3] };
const WIND = { calm: 0.3, breeze: 1, squall: 2 };
// a palm `h` tall rooted at (x, base), its crown pushed `bend` cells by the wind (the trunk bends like a cantilever,
// most near the top), the fronds drooping under their weight and streaming downwind, rippling with `ph`; the crown
function palm(r, x, base, h, bend, ph, u, trunk, leaf) {
  let px = x, py = base;
  for (let k = 1; k <= 8; k++) { const q = k / 8, nx = x + (bend + h * 0.15) * q * q, ny = base - h * q; r.stroke(px, py, nx, ny, mx1(h * (0.05 - 0.025 * q)), trunk); if (k % 2) r.rect(nx - h * 0.025, ny, h * 0.05, mx1(u * 0.6), dim(trunk)); px = nx; py = ny; }
  for (let k = 0; k < 7; k++) {
    const a0 = -Math.PI / 2 + (k - 3) * 0.5, side = Math.cos(a0) >= 0 ? 1 : -1, len = h * (0.36 + 0.08 * hash(k, 3)), sw = Math.sin(ph + k * 1.3) * 0.15;
    let fx = px, fy = py;
    for (let j = 1; j <= 6; j++) {
      const q = j / 6, a = a0 + side * q * 1.3 + sw * q + (bend / h) * q, nx = fx + Math.cos(a) * len / 6, ny = fy + Math.sin(a) * len / 6;
      r.stroke(fx, fy, nx, ny, mx1(h * 0.022 * (1 - q * 0.6)), leaf);
      r.line(nx, ny, nx + Math.cos(a + side * 1.2) * h * 0.06 * (1 - q * 0.5), ny + Math.sin(a + side * 1.2) * h * 0.06 * (1 - q * 0.5) + h * 0.02, leaf);
      fx = nx; fy = ny;
    }
  }
  oval(r, px, py, h * 0.03, h * 0.025, dim(trunk));
  return [px, py];
}
const castaway = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, BEACH_W, bandOf(W.a)), D: 0, Dv: 0, wet: 0, logs: 0, mast: 0, drop: 0, prints: [], pk: 0, ship: null, fire: 0, run: 0, rdir: 1, flap: 0, bob: 0,
      smoke: [], sparks: [], rafts: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.46 * N, shore = 0.62 * N, yRef = 0.9 * N, B = bps(f), G = 1.2 * N;
    const bc = beatClock(w, f, dt), p = frac(bc), wind = WIND[w.kind] * (0.6 + 0.6 * clamp(f.rel.trebDrive)), sq = w.kind === 'squall';
    const depthAt = (y) => (yRef - hz) / Math.max(1, y - hz), yAt = (d) => hz + (yRef - hz) / d;
    w.cx = (w.cx ?? 0) + 0.01 * wind * dt; // how far the clouds have drifted (screens): the wind speeds them up, never jumps them
    if (f.section === 'change') { w.kind = rollW(rnd, BEACH_W, band); if (w.mast >= 1) { w.rafts.push({ x: 0.36 * N, t: 0 }); w.logs = 0; w.mast = 0; } if (w.ship) w.ship.leave = true; }
    if (f.section === 'drop' && !w.ship) w.ship = { x: 0.7 + 0.15 * rnd(), rise: 0, leave: false };
    let snare = 0;
    for (const h of hits) {
      if (isLow(h) && w.D < 0.2) w.Dv = Math.max(w.Dv, 1.5 * (0.5 + 0.5 * h.strength));
      else if (h.kind === 'snare') snare = 1;
      else if (h.kind === 'hat') w.flap = 0.3;
      if (isTonal(h)) w.bob = 0.3;
    }
    w.flap -= dt; w.bob -= dt;
    // the swash: a wave arriving throws the water up the beach (a run D in depth units) once the last one has run back
    // down, the slope slows it to a stop and it runs back
    if (w.on && w.D < 0.2) w.Dv = Math.max(w.Dv, 0.9);
    if (w.Dv > 0 || w.D > 0) { w.D += w.Dv * dt; w.Dv -= 1.4 * dt; if (w.D <= 0) { w.D = 0; w.Dv = 0; } }
    w.wet = Math.max(w.wet - dt * 0.08, w.D);
    const dShore = depthAt(shore), yEdge = yAt(dShore - w.D), yWet = yAt(dShore - w.wet);

    // the sky, the sea to the horizon, a ship coming up over it
    if (sq) { for (let x = 0; x < N; x++) vcol(r, x, 0, (0.12 + 0.03 * Math.sin(x * 0.07 + t * 0.3)) * N, DARK); }
    else oval(r, 0.8 * N, 0.14 * N, 0.045 * N, 0.045 * N, BRIGHT);
    for (let k = 0; k < 3; k++) { const span = 1.5 * N, x = ((((hash(k, 4) * span + w.cx * N * (1 + k * 0.3)) % span) + span) % span) - 0.25 * N; cloud(r, x, (0.16 + 0.06 * k) * N, (0.12 + 0.05 * hash(k, 5)) * N, sq ? MID + DIM : LMID, k + 9); }
    if (w.ship) { // hull down: the masts show first, the hull comes up over the curve of the sea; when it leaves it goes down again
      const S = w.ship;
      S.rise = clamp(S.rise + (S.leave ? -dt / 5 : dt / 4));
      S.x += (dt * 0.004) * (S.leave ? 2 : 1);
      if (S.leave && S.rise <= 0) w.ship = null;
      else {
        const x = S.x * N, yb = hz + 0.03 * N * (1 - S.rise);
        r.poly([[x - 0.03 * N, yb - 0.008 * N], [x + 0.035 * N, yb - 0.009 * N], [x + 0.027 * N, yb], [x - 0.025 * N, yb]], DARK);
        for (const m of [-0.012, 0.012]) { r.line(x + m * N, yb - 0.008 * N, x + m * N, yb - 0.05 * N, DARK); r.rect(x + m * N - 0.006 * N, yb - 0.045 * N, 0.012 * N, 0.012 * N, LMID); r.rect(x + m * N - 0.005 * N, yb - 0.03 * N, 0.01 * N, 0.01 * N, LMID); }
      }
    }
    r.rect(0, hz, N, shore - hz, MID);
    for (let k = 1; k < 10; k++) { const d = dShore + k * 1.2, y = Math.round(yAt(d)); for (let j = 0; j < 3; j++) { const x = (((hash(k, j) * 1.5 * N + t * 0.01 * N) % (1.5 * N)) + 1.5 * N) % (1.5 * N) - 0.25 * N; r.rect(x, y, (0.15 * N) / d * 2.5, 1, LMID); } }
    // the breaker coming in through the beat, a line of foam that runs into the swash
    const yb = yAt(dShore + 0.9 * (1 - p));
    for (let x = 0; x < N; x += 2) if (hash(x >> 1, Math.floor(t * 4)) < 0.7) r.rect(x, yb - u * 0.5, 2, mx1(u), BRIGHT);
    // the beach, column by column: the swash sheet with its frothing edge, the wet sand behind it, the dry sand
    const buf = r.buf;
    for (let x = 0; x < N; x++) {
      const ye = Math.round(yEdge + (hash(x >> 1, Math.floor(w.D * 9)) - 0.5) * 2 * u), yw = Math.max(ye, Math.round(yWet));
      for (let y = Math.round(shore); y < N; y++) buf[y * N + x] = y < ye ? MID : y < yw ? LMID + DIM : LMID;
      if (w.D > 0 && ye >= shore) r.rect(x, ye - u * 0.5, 1, mx1(u), BRIGHT);
    }
    for (let j = 0; j < 30; j++) { const y = shore + 0.06 * N + hash(j, 51) * (N - shore), sc = 1 / depthAt(y); r.rect(hash(j, 52) * N, y, mx1(2 * u * sc), mx1(u * sc * 0.6), DARK + DIM); } // pebbles and shells

    // the prints: one on each snare, left and right, coming up the beach from the near corner toward the water
    if (snare) {
      const k = w.pk++ % 26, q = k / 26, d = lerp(0.95, 2.2, q), X = lerp(-0.42, 0.12, q) * N, side = k % 2 ? 1 : -1;
      w.prints.push({ X: X + side * 0.012 * N, d, age: 0 });
    }
    w.prints = w.prints.filter((pr) => { pr.age += dt; const y = yAt(pr.d), sc = 1 / pr.d; if (y < yEdge) pr.age += dt * 4; if (pr.age < 18) oval(r, 0.5 * N + pr.X * sc, y, 1.6 * u * sc + 0.4, 0.7 * u * sc + 0.3, pr.age > 14 && (pr.age * 6) % 1 < 0.5 ? LMID + DIM : DARK); return pr.age < 18; }).slice(-30);
    // the hut of sticks and thatch, up the beach
    { const d = 1.9, x = 0.6 * N, yb2 = yAt(d), sc = 1 / d, hw = 0.12 * N * sc, ht = 0.14 * N * sc;
      for (const k of [-1, 1]) r.stroke(x + k * hw, yb2, x + k * hw * 0.9, yb2 - ht, mx1(u * sc * 1.5), DARK);
      r.rect(x - hw, yb2 - ht * 0.8, 2 * hw, ht * 0.8, DARK);
      r.rect(x - hw * 0.3, yb2 - ht * 0.6, hw * 0.6, ht * 0.6, BLACK);
      r.poly([[x - hw * 1.4, yb2 - ht * 0.75], [x + hw * 1.4, yb2 - ht * 0.75], [x + hw * 0.3, yb2 - ht * 1.5], [x - hw * 0.5, yb2 - ht * 1.45]], LMID);
      for (let k = 0; k < 4; k++) r.line(x - hw * 1.3 + k * hw * 0.2, yb2 - ht * (0.75 + k * 0.18), x + hw * 1.3 - k * hw * 0.25, yb2 - ht * (0.75 + k * 0.18), DARK); }
    palm(r, 0.9 * N, yAt(1.8), (0.45 * N) / 1.8, (wind * 0.04 * N + Math.sin(t * 2.3) * 0.01 * N * wind) / 1.8, t * 3, u, DARK, MID);

    // the raft at the water's edge: a log a beat, each dropped in place as the hammer comes down; a mast when whole
    const rd = 1.45, rx = 0.36 * N, ry = yAt(rd), rs = 1 / rd, rw = 0.24 * N * rs, building = w.ship === null && w.logs < 12 && w.run === 0;
    if (w.on && building) { w.logs++; w.drop = 0.15; }
    else if (w.on && w.logs >= 12 && w.mast < 1) w.mast = Math.min(1, w.mast + 0.25);
    w.drop = Math.max(0, w.drop - dt);
    for (let k = 0; k < w.logs; k++) { const ly = ry - k * 1.3 * u * rs - (k === w.logs - 1 ? (1 - (1 - w.drop / 0.15) ** 2) * 4 * u : 0); r.rect(rx - rw / 2, ly, rw, mx1(1.2 * u * rs), k % 2 ? DARK : DARK + DIM); r.rect(rx - rw / 2, ly, mx1(u * rs), mx1(1.2 * u * rs), LMID); }
    if (w.mast > 0) { const mt = ry - 0.2 * N * rs * w.mast; r.stroke(rx, ry - 8 * u * rs, rx, mt, mx1(u), DARK); if (w.mast >= 1) r.poly([[rx + u, mt + 2 * u], [rx + 0.08 * N * rs + wind * u, mt + 0.05 * N * rs], [rx + u, mt + 0.12 * N * rs]], LMID); }
    for (const rf of w.rafts) { rf.t += dt; rf.x -= dt * 0.02 * N; const yy = Math.max(hz + 2, shore - rf.t * 0.004 * N), sc2 = rs * Math.max(0.3, 1 - rf.t * 0.05); r.rect(rf.x - 0.12 * N * sc2, yy, 0.24 * N * sc2, mx1(2 * u * sc2), DARK); r.line(rf.x, yy, rf.x, yy - 0.1 * N * sc2, DARK); }
    w.rafts = w.rafts.filter((rf) => rf.x > -0.2 * N);
    // the signal fire on the near sand: a pile of driftwood, lit on the drop
    const fd = 1.1, fx = 0.82 * N, fy = yAt(fd), fs = 1 / fd;
    for (let k = 0; k < 4; k++) r.stroke(fx - 0.04 * N * fs + k * 0.025 * N * fs, fy, fx + 0.03 * N * fs - k * 0.02 * N * fs, fy - 0.04 * N * fs, mx1(u * 1.2), DARK);
    if (w.fire > 0) {
      w.fire = Math.min(1, w.fire + dt * 0.5);
      if (w.ship === null) w.fire = Math.max(0, w.fire - dt * 0.6);
      const fh = 0.08 * N * fs * w.fire;
      flame(r, fx, fy - 0.01 * N, 0.06 * N * fs, fh, Math.floor(t * 12));
      if (rnd() < dt * 9 * w.fire) w.smoke.push({ x: fx + (rnd() - 0.5) * 0.02 * N, y: fy - fh, vx: 0, vy: -(0.16 + 0.06 * rnd()) * N, life: 5, age: 0, s: 2 * u });
      for (let k = spawns(rnd, 12 * w.fire, dt); k > 0; k--) w.sparks.push(ember(rnd, fx, fy - fh * 0.5, N));
    }
    // the castaway: building at the raft, the hammer on the beat; on the drop he runs to the fire, lights it, waves
    const rt = w.ship && !w.ship.leave ? 1 : 0, cx0 = rx + rw * 0.65, cy0 = ry + 0.005 * N, cx1 = fx - 0.07 * N, cy1 = fy;
    if (w.run !== rt) { w.rdir = rt > w.run ? 1 : -1; w.run = clamp(w.run + (w.rdir * dt) / 1.6); if (w.run >= 1 && w.fire <= 0) w.fire = 0.01; }
    const atFire = w.run >= 1, q = smooth(w.run), cxp = lerp(cx0, cx1, q), cyp = lerp(cy0, cy1, q), csc = 1 / depthAt(cyp), ch = 0.24 * N * csc, running = w.run > 0 && w.run < 1;
    w.cph = (w.cph ?? 0) + (Math.hypot(cxp - (w.cpx ?? cxp), cyp - (w.cpy ?? cyp)) * Math.PI) / stepLen(ch, 0.7); // the legs go by the ground covered
    w.cpx = cxp; w.cpy = cyp;
    const sw = p < 0.12 ? lerp(0.9, 0.2, p / 0.12) : p > 0.55 ? lerp(-2.6, 0.9, ((p - 0.55) / 0.45) ** 2) : lerp(0.2, -2.6, (p - 0.12) / 0.43);
    const arms = atFire ? [[Math.PI - 0.5 + 0.4 * Math.sin(bc * Math.PI), 0.3], [Math.PI + 0.3 - 0.4 * Math.sin(bc * Math.PI), 0.3]] : running ? gaitArms(w.cph, 0.7) : building ? [[sw, 0.4], [0.6, 0.9]] : [[0.3, 0.5], [0.2, 0.6]];
    const C = rig(r, ID, cxp, cyp, ch, running ? w.rdir : atFire ? 1 : -1, FIG, { lean: running ? 0.3 : building ? 0.25 : 0, legs: running ? gaitLegs(w.cph, 0.7) : [[0.15, 0.2], [-0.1, 0.1]], arms, hat: 'point', beard: LMID, robe: 0.6 });
    if (building) { r.stroke(C.hand[0], C.hand[1], C.hand[0] - Math.cos(sw) * 0.02 * N * csc, C.hand[1] - 0.025 * N * csc, mx1(u), DARK); r.rect(C.hand[0] - 0.015 * N * csc, C.hand[1] - 0.03 * N * csc, 0.022 * N * csc, mx1(1.5 * u * csc), DARK); }
    targets.push({ x: cxp - ch * 0.3, y: cyp - ch, w: ch * 0.6, h: ch });
    w.smoke = smoke(W, w.smoke, 0.03 * N * wind, MID, LMID).slice(-20);
    w.sparks = embers(W, w.sparks).slice(-40);
    // the near palm, its parrot on a frond: wings up on the hats, a bob of the head on the notes
    const lp = palm(r, 0.12 * N, 0.97 * N, 0.5 * N, wind * 0.05 * N + Math.sin(t * 2.1 + 1) * 0.015 * N * wind + 0.02 * N * clamp(f.rel.trebDrive) * Math.sin(t * 7), t * 3.4, u, DARK, FIG);
    const px = lp[0] + 0.04 * N, py = lp[1] + 0.02 * N, fl = w.flap > 0 ? Math.sin(w.flap * 40) : 0, hb = w.bob > 0 ? Math.sin((w.bob / 0.3) * Math.PI) * 2 * u : 0;
    oval(r, px, py, 0.016 * N, 0.024 * N, HOT);
    r.poly([[px - 0.008 * N, py + 0.015 * N], [px + 0.004 * N, py + 0.015 * N], [px - 0.006 * N, py + 0.06 * N]], COOL);
    r.poly([[px - 0.002 * N, py - 0.01 * N], [px + 0.014 * N, py - 0.005 * N - fl * 0.03 * N], [px + 0.01 * N, py + 0.015 * N]], COOL);
    oval(r, px + 0.006 * N, py - 0.026 * N + hb, 0.012 * N, 0.011 * N, HOT);
    r.rect(px + 0.014 * N, py - 0.027 * N + hb, mx1(0.007 * N), mx1(0.008 * N), LMID);
    r.set(px + 0.008 * N, py - 0.03 * N + hb, BLACK);
    if (sq) rain(r, N, u, t, 60, 1.1 * N, 0.3 * wind, LMID + DIM);
    targets.push({ x: px - 0.02 * N, y: py - 0.04 * N, w: 0.04 * N, h: 0.07 * N });
  },
};

// ---------------------------------------------------------------------------------------------- nautilus
// The sea through the round window of a submarine's saloon: a school of fish wheeling about the glass that turns all
// at once on a snare (the turn running through it from the fish that turned first), jellyfish that pulse on the beat
// (the bell squeezes, a kick of thrust, then a long glide as the water's drag takes it), bubbles from the vents
// rising to their terminal speed, the marine snow streaming past at the boat's pace, light shafts in the shallows.
// Inside, against the riveted plates, the captain at his organ: twelve pipes, one to a pitch class, each lit by its
// notes, his hands going to it; a gauge whose needle jumps on the kicks as the hull shudders. The kind is the depth:
// the shallows, the twilight, the abyss with its own lights. A drop: a giant squid's arms curl in round the window,
// press their suckers to the glass, and let go.
const DEEP_W = { shallows: [3, 2, 1], twilight: [2, 2, 2], abyss: [1, 2, 3] };
const nautilus = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, DEEP_W, bandOf(W.a)), sx: 0.6 * N, sy: 0.42 * N, sh: Math.PI, pipes: new Float32Array(12), hand: 5, needle: 0, squid: -1,
      school: Array.from({ length: 22 }, (_, i) => ({ a: (rnd() - 0.5) * 0.16 * N, c: (rnd() - 0.5) * 0.09 * N, h: Math.PI, lag: 0.05 + 0.25 * rnd() })),
      jellies: Array.from({ length: 3 }, (_, i) => ({ x: (0.45 + 0.15 * i) * N, y: (0.35 + 0.1 * i) * N, vx: 0, vy: 0, c: 0, b: (0.03 + 0.01 * i) * N, ph: rnd() * TAU })),
      bubs: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), cx = 0.6 * N, cy = 0.42 * N, R = 0.31 * N, Ro = R + 0.045 * N, buf = r.buf;
    beatClock(w, f, dt);
    if (f.section === 'change') w.kind = rollW(rnd, DEEP_W, band);
    if (f.section === 'drop' && w.squid < 0) { w.squid = 0; s.shake = Math.max(s.shake, 0.3); }
    const zone = w.kind, flow = (0.04 + 0.05 * clamp(f.rel.midDrive)) * N; // the water streams past the window at the boat's pace
    w.snow = (w.snow ?? 0) + flow * dt; // how far it has streamed: the pace changes, the snow does not jump
    let turnTo = 0, kick = 0;
    for (const h of hits) {
      if (isLow(h)) kick = Math.max(kick, h.strength);
      else if (h.kind === 'snare') turnTo = (rnd() < 0.5 ? 1 : -1) * Math.PI * (0.6 + 0.4 * rnd());
      if (isTonal(h)) { w.pipes[h.pc % 12] = 1; w.hand = h.pc % 12; }
    }
    if (kick) { s.shake = Math.max(s.shake, 0.15 * kick); w.needle = 1; for (let k = 0; k < 10; k++) w.bubs.push(bubble(rnd, cx + (rnd() - 0.5) * 1.2 * R, cy + R, N, u, 0.35)); }
    w.needle *= Math.exp(-dt * 3);
    for (let k = 0; k < 12; k++) w.pipes[k] *= Math.exp(-dt * 2.5);

    // the water in the window: lighter toward the surface far above, the shafts of light slanting down in the shallows
    const tops = zone === 'shallows' ? [LMID, MID, DARK] : zone === 'twilight' ? [MID, DARK, DARK + DIM] : [DARK, DARK + DIM, BLACK];
    const shaft = zone === 'shallows' ? 0.16 : zone === 'twilight' ? 0.07 : 0, sp = 0.12 * N, sh0 = f.rel.trebClock * 0.04 * N + t * 0.01 * N;
    for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(N, Math.ceil(cy + R)); y++) {
      const dy = y + 0.5 - cy, half = Math.sqrt(Math.max(0, R * R - dy * dy)), q = (y - cy + R) / (2 * R), row = y * N;
      for (let x = Math.max(0, Math.round(cx - half)), e = Math.min(N, Math.round(cx + half)); x < e; x++) {
        const v = q * 2.2 + (bayer(x, y) - 0.5) * 0.5, c = tops[v < 0.7 ? 0 : v < 1.5 ? 1 : 2];
        const sx = (((x + (y - cy) * 0.45 - sh0) % sp) + sp) % sp;
        buf[row + x] = shaft && sx < sp * shaft * (1 - q) && bayer(x, y) < 0.6 ? (c === LMID ? BRIGHT : LMID) : c;
      }
    }
    // marine snow and, in the abyss, the sea's own lights blinking
    for (let k = 0; k < 40; k++) { const x = cx - R + ((((hash(k, 61) * 2 * R + w.snow * (0.5 + hash(k, 62))) % (2 * R)) + 2 * R) % (2 * R)), y = cy - R + ((hash(k, 63) * 2 * R + t * 0.008 * N) % (2 * R)); r.set(x, y, zone === 'abyss' && hash(k, Math.floor(t * 2)) < 0.3 ? (k % 2 ? COOL : HOT) : LMID + DIM); }
    // the school: the centre swims its heading and keeps to the glass, steering back toward the middle; each fish
    // turns to the school's heading after its own delay, so a snare's turn runs through the school
    if (turnTo) w.sh += turnTo;
    const toC = Math.atan2(cy - w.sy, cx - w.sx), far = Math.hypot(cx - w.sx, cy - w.sy) > 0.5 * R;
    if (far) w.sh += Math.atan2(Math.sin(toC - w.sh), Math.cos(toC - w.sh)) * (1 - Math.exp(-dt / 1.2));
    const spd = (0.06 + 0.04 * clamp(f.rel.midDrive)) * N;
    w.sx += Math.cos(w.sh) * spd * dt;
    w.sy += Math.sin(w.sh) * spd * dt;
    const fc = zone === 'shallows' ? BRIGHT : zone === 'twilight' ? LMID : DARK;
    for (const fi of w.school) {
      fi.h += Math.atan2(Math.sin(w.sh - fi.h), Math.cos(w.sh - fi.h)) * (1 - Math.exp(-dt / fi.lag));
      const c = Math.cos(fi.h), sn = Math.sin(fi.h), x = w.sx + fi.a * c - fi.c * sn, y = w.sy + fi.a * sn + fi.c * c, l = 1.6 * u;
      r.stroke(x - c * l, y - sn * l, x + c * l, y + sn * l, mx1(1.3 * u), fc);
      r.line(x - c * l, y - sn * l, x - c * l * 1.8 - sn * l * 0.6, y - sn * l * 1.8 + c * l * 0.6, fc);
      r.line(x - c * l, y - sn * l, x - c * l * 1.8 + sn * l * 0.6, y - sn * l * 1.8 - c * l * 0.6, fc);
      if (zone !== 'shallows') r.set(x + c * l, y + sn * l, COOL);
    }
    targets.push({ x: w.sx - 0.08 * N, y: w.sy - 0.06 * N, w: 0.16 * N, h: 0.12 * N });
    // the jellyfish: on the beat the bell squeezes (narrower, taller) and throws it forward along its axis; then it glides
    // as the drag takes the speed off, sinking a little, the bell opening again, the tentacles trailing
    for (const j of w.jellies) {
      if (w.on) { j.c = 1; j.vx += Math.sin(j.ph + t * 0.3) * 0.01 * N; j.vy -= 0.1 * N; } // the squeeze throws it up along the bell's axis
      j.c *= Math.exp(-dt * 5);
      const k = Math.exp(-dt * 1.6);
      j.vx *= k; j.vy = j.vy * k + 0.012 * N * dt;
      j.x += (j.vx + flow * 0.5) * dt; j.y += j.vy * dt;
      if (Math.hypot(j.x - cx, j.y - cy) > R + 3 * j.b) { j.x = cx - R * 0.7 + rnd() * 0.4 * R; j.y = cy + R + j.b; j.vx = 0; j.vy = -0.05 * N; }
      const bw = j.b * (1 - 0.35 * j.c), bh = j.b * 0.7 * (1 + 0.4 * j.c), col = zone === 'shallows' ? LMID : COOL;
      for (let i = 0; i < 5; i++) { let px = j.x + (i - 2) * bw * 0.4, py = j.y; const tl = j.b * 2.2 * (1 - 0.25 * j.c); for (let q2 = 1; q2 <= 6; q2++) { const nx = px + Math.sin(t * 3 + i + q2 * 0.8) * u * 0.8 - j.vx * 0.02, ny = py + tl / 6; r.line(px, py, nx, ny, zone === 'shallows' ? LMID + DIM : col); px = nx; py = ny; } }
      for (let y = Math.floor(j.y - bh); y <= j.y; y++) { const q2 = (j.y - y) / bh, hw = bw * Math.sqrt(Math.max(0, 1 - q2 * q2)); r.rect(j.x - hw, y, 2 * hw, 1, q2 > 0.7 || zone === 'shallows' ? col : dim(col)); }
      r.rect(j.x - bw, j.y, 2 * bw, mx1(u * 0.6), BRIGHT);
    }
    // the bubbles off the vents below the window
    if (rnd() < dt * (2 + 6 * clamp(f.rel.midDrive))) w.bubs.push(bubble(rnd, cx + (rnd() - 0.5) * 1.4 * R, cy + R, N, u, 0.25));
    w.bubs = bubbles(W, w.bubs, () => cy - R - 3 * u, zone === 'abyss' ? LMID : BRIGHT).slice(-60);
    // the squid: its arms come curling in from outside the glass, press their suckers to it, hold, and let go
    if (w.squid >= 0) {
      const T = (w.squid += dt), grow = T < 1.2 ? ease(T / 1.2) : T < 3.6 ? 1 : 1 - ease((T - 3.6) / 1.1);
      if (T > 4.7) w.squid = -1;
      if (T > 1 && T < 4) { const ex = cx + Math.cos(0.4) * R * 1.02, ey = cy + Math.sin(0.4) * R * 1.02; oval(r, ex, ey, 0.07 * N, 0.05 * N, BRIGHT); oval(r, ex, ey, 0.012 * N, 0.04 * N, BLACK); }
      for (let k = 0; k < 6; k++) {
        const a0 = -0.9 + k * 0.5, curl = 1.7 + 0.35 * Math.sin(t * 2 + k);
        let px = cx + Math.cos(a0) * R * 1.4, py = cy + Math.sin(a0) * R * 1.4;
        for (let j = 1; j <= 16; j++) {
          const q2 = (j / 16) * grow, rr = R * (1.4 - 0.95 * q2), a = a0 + curl * q2 * q2, nx = cx + Math.cos(a) * rr, ny = cy + Math.sin(a) * rr;
          r.stroke(px, py, nx, ny, mx1(3.4 * u * (1 - q2 * 0.8)), HOT);
          if (j % 2 === 0 && q2 > 0.15) r.set((px + nx) / 2 - Math.cos(a) * u, (py + ny) / 2 - Math.sin(a) * u, LMID);
          px = nx; py = ny;
        }
      }
    }
    // the saloon: riveted plates round the window, the window's thick frame and its rivets, a pipe along the ceiling
    for (let y = 0; y < N; y++) {
      const dy = y + 0.5 - cy, half = Math.abs(dy) < R ? Math.sqrt(R * R - dy * dy) : 0, ho = Math.abs(dy) < Ro ? Math.sqrt(Ro * Ro - dy * dy) : 0;
      if (!half) r.rect(0, y, N, 1, DARK);
      else { r.rect(0, y, cx - half, 1, DARK); r.rect(cx + half, y, N - cx - half, 1, DARK); }
      if (ho) { r.rect(cx - ho, y, ho - half, 1, MID); r.rect(cx + half, y, ho - half, 1, MID); }
      if (y % Math.round(0.2 * N) === 0) { r.rect(0, y, cx - ho, 1, DARK + DIM); r.rect(cx + ho, y, N - cx - ho, 1, DARK + DIM); }
    }
    circ(r, cx, cy, R + 0.5, LMID);
    circ(r, cx, cy, Ro, DARK + DIM);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; r.rect(cx + Math.cos(a) * (R + 0.0225 * N) - u * 0.6, cy + Math.sin(a) * (R + 0.0225 * N) - u * 0.6, mx1(1.2 * u), mx1(1.2 * u), BRIGHT); }
    for (let y = Math.round(0.2 * N); y < N; y += Math.round(0.2 * N)) for (let x = Math.round(0.05 * N); x < N; x += Math.round(0.08 * N)) if (Math.hypot(x - cx, y - cy) > Ro + 2 * u) r.set(x, y + 2 * u, LMID + DIM);
    r.rect(0, 0.04 * N, N, 0.025 * N, MID + DIM);
    for (let x = 0.1 * N; x < N; x += 0.25 * N) r.rect(x, 0.035 * N, 0.02 * N, 0.035 * N, MID);
    // the gauge: a dial with ticks and a needle that jumps on the kicks and rides the level
    const gx = 0.92 * N, gy = 0.2 * N, gr = 0.045 * N, na = -2.4 + 3.2 * clamp(f.level * 0.8 + 0.3 * w.needle);
    oval(r, gx, gy, gr, gr, LMID);
    circ(r, gx, gy, gr, DARK + DIM);
    for (let k = 0; k < 7; k++) { const a = -2.4 + (k / 6) * 3.2 - Math.PI / 2; r.set(gx + Math.cos(a) * gr * 0.8, gy + Math.sin(a) * gr * 0.8, DARK); }
    r.line(gx, gy, gx + Math.cos(na - Math.PI / 2) * gr * 0.85, gy + Math.sin(na - Math.PI / 2) * gr * 0.85, HOT);
    // the organ: twelve pipes over the console, each lit by its pitch class; the captain at it, his back to us, his
    // hands going to the last note, his head nodding on the beat
    const ox = 0.04 * N, pw = 0.023 * N, pb = 0.66 * N;
    for (let k = 0; k < 12; k++) {
      const hgt = (0.16 + 0.16 * (1 - Math.abs(k - 5.5) / 5.5)) * N, x = ox + k * pw, l = w.pipes[k], c = l > 0.6 ? BRIGHT : l > 0.25 ? LMID : MID;
      r.rect(x, pb - hgt, pw * 0.72, hgt, c);
      r.poly([[x, pb - hgt], [x + pw * 0.72, pb - hgt], [x + pw * 0.36, pb - hgt - pw * 0.5]], c);
      r.rect(x + pw * 0.15, pb - 0.03 * N, pw * 0.42, 0.012 * N, DARK + DIM);
      if (l > 0.3) for (let j = 0; j < 3; j++) r.set(x + pw * 0.36 + (hash(k, j + Math.floor(t * 8)) - 0.5) * pw, pb - hgt - pw * (1 + j), k % 2 ? HOT : COOL);
    }
    r.rect(ox - 0.01 * N, pb, 12 * pw + 0.02 * N, 0.2 * N, DARK + DIM);
    r.rect(ox, pb + 0.03 * N, 12 * pw, 0.02 * N, BRIGHT);
    for (let k = 0; k < 18; k++) r.rect(ox + k * ((12 * pw) / 18), pb + 0.03 * N, mx1(u * 0.5), 0.012 * N, BLACK);
    w.hx = follow(w.hx ?? 5, w.hand, dt, 0.08);
    const cpx = 0.19 * N, cpy = 0.8 * N, nod = f.beat.pulse * 1.5 * u, hxk = ox + w.hx * pw + pw * 0.36;
    r.poly([[cpx - 0.06 * N, 0.92 * N], [cpx + 0.06 * N, 0.92 * N], [cpx + 0.045 * N, cpy - 0.06 * N], [cpx - 0.045 * N, cpy - 0.06 * N]], FIG);
    oval(r, cpx, cpy - 0.085 * N + nod, 0.03 * N, 0.032 * N, FIG);
    for (const k of [-1, 1]) r.stroke(cpx + k * 0.04 * N, cpy - 0.05 * N, hxk + k * 0.03 * N, pb + 0.035 * N, mx1(2 * u), FIG);
    r.rect(cpx - 0.08 * N, 0.92 * N, 0.16 * N, 0.02 * N, DARK + DIM);
    targets.push({ x: cpx - 0.06 * N, y: cpy - 0.12 * N, w: 0.12 * N, h: 0.24 * N });
  },
};

// ---------------------------------------------------------------------------------------------- rabbithole
// Falling slowly down a deep well: its sides lined with cupboards, shelves of jars, clocks, maps and pictures that go
// up past at the speed of the fall, the far side of the well going by slower and smaller (the parallax of its
// distance). The girl falls at her terminal speed, her skirt and hair blown up round her by the air she falls
// through, swaying from side to side as a falling leaf does; jars, teacups, books and a clock fall with her at speeds
// of their own (so some rise past her and some sink away), tumbling as they go. The clocks on the walls tick on the
// beat, their pendulums the length that swings once a beat; a kick knocks a jar off a shelf, a snare throws her arms
// up, a note lights the candles, the hats stir the dust. The kind is what the walls are lined with: the pantry, the
// clocks, the maps. A drop: the bottom comes up, a heap of dry leaves; she lands in it in a burst of leaves that
// flutter down, gets up and walks down a long low hall to a curtain with a tiny door behind it, and kneels; the next
// section starts the fall again.
const WELL_W = { pantry: [3, 2, 1], clocks: [1, 2, 3], maps: [2, 2, 1] };
const WALL_KINDS = { pantry: ['shelf', 'shelf', 'cupboard', 'lamp', 'clock'], clocks: ['clock', 'clock', 'shelf', 'lamp', 'cupboard'], maps: ['map', 'map', 'picture', 'shelf', 'lamp'] };
const FALLERS = ['jar', 'cup', 'book', 'clock', 'jar', 'cup'];
// a thing on the wall of the well, `wd` wide with its top left at (x, y): a shelf of jars, a cupboard, a clock (a
// face whose minute hand clicks round a beat at a time, a pendulum `o.pl` long at angle `o.pa`), a map with a coast, an
// oval portrait, a candle lit by `o.lit`
function fixture(r, kind, x, y, wd, u, o) {
  const h = wd;
  switch (kind) {
    case 'shelf':
      r.rect(x, y + h * 0.5, wd, mx1(h * 0.06), LMID);
      for (let k = 0; k < 3; k++) {
        const jx = x + wd * (0.1 + 0.3 * k), jw = wd * 0.18, jh = h * (0.24 + 0.1 * hash(o.seed, k)), jy = y + h * 0.5 - jh;
        r.rect(jx, jy, jw, jh, k === 1 ? HOT : COOL); r.rect(jx - u * 0.3, jy - mx1(u), jw + u * 0.6, mx1(u), DARK); r.rect(jx + jw * 0.2, jy + jh * 0.35, jw * 0.6, jh * 0.3, BRIGHT);
      }
      break;
    case 'cupboard':
      r.rect(x, y, wd, h * 0.95, MID);
      r.frame(Math.round(x), Math.round(y), Math.round(wd), Math.round(h * 0.95), DARK);
      r.rect(x + wd * 0.5, y + u, mx1(u), h * 0.95 - 2 * u, DARK);
      if (hash(o.seed, 3) < 0.5) r.rect(x + wd * 0.52, y + u, wd * 0.12, h * 0.95 - 2 * u, BLACK); // ajar
      r.rect(x + wd * 0.38, y + h * 0.45, mx1(u), mx1(u), BRIGHT);
      break;
    case 'clock': {
      const cx = x + wd / 2, fr = wd * 0.3, fy = y + fr * 1.1, ma = o.min * TAU - Math.PI / 2, ha = o.hr * TAU - Math.PI / 2, py = y + fr * 2.3;
      r.rect(cx - wd * 0.32, y, wd * 0.64, fr * 2.3 + o.pl + 3 * u, DARK);
      oval(r, cx, fy, fr, fr, BRIGHT);
      circ(r, cx, fy, fr, FIG);
      r.line(cx, fy, cx + Math.cos(ma) * fr * 0.85, fy + Math.sin(ma) * fr * 0.85, FIG);
      r.line(cx, fy, cx + Math.cos(ha) * fr * 0.55, fy + Math.sin(ha) * fr * 0.55, FIG);
      r.rect(cx - wd * 0.22, py - u, wd * 0.44, o.pl + 3 * u, DARK + DIM);
      const bx = cx + Math.sin(o.pa) * o.pl, by = py + Math.cos(o.pa) * o.pl;
      r.line(cx, py, bx, by, LMID);
      oval(r, bx, by, mx1(1.3 * u), mx1(1.3 * u), HOT);
      break;
    }
    case 'map':
      r.rect(x, y, wd, h * 0.7, LMID);
      r.frame(Math.round(x), Math.round(y), Math.round(wd), Math.round(h * 0.7), DARK);
      for (let k = 0; k < 3; k++) oval(r, x + wd * (0.25 + 0.25 * k + 0.1 * hash(o.seed, k)), y + h * (0.25 + 0.25 * hash(o.seed, k + 5)), wd * 0.12, h * 0.1, MID);
      r.line(x + wd * 0.1, y + h * 0.55, x + wd * 0.9, y + h * 0.2, HOT);
      break;
    case 'picture':
      r.rect(x, y, wd, h * 0.8, DARK);
      oval(r, x + wd / 2, y + h * 0.4, wd * 0.35, h * 0.32, LMID);
      oval(r, x + wd / 2, y + h * 0.35, wd * 0.12, h * 0.12, FIG);
      oval(r, x + wd / 2, y + h * 0.62, wd * 0.2, h * 0.12, FIG);
      break;
    default: // a candle on a bracket
      r.rect(x + wd * 0.3, y + h * 0.55, wd * 0.4, mx1(u), DARK);
      r.rect(x + wd * 0.45, y + h * 0.3, wd * 0.1, h * 0.25, BRIGHT);
      if (o.lit > 0.1) { oval(r, x + wd * 0.5, y + h * 0.22, wd * 0.07 * (1 + o.lit), h * 0.1 * (1 + o.lit), HOT); oval(r, x + wd * 0.5, y + h * 0.24, wd * 0.03, h * 0.05, BRIGHT); }
  }
}
// a thing falling down the well, `s` across, in its tumbling frame P
function faller(r, P, kind, s, u, t) {
  const box = (x0, y0, x1, y1, c) => polyP(r, P, [[x0 * s, y0 * s], [x1 * s, y0 * s], [x1 * s, y1 * s], [x0 * s, y1 * s]], c);
  switch (kind) {
    case 'jar': box(-0.3, -0.4, 0.3, 0.45, HOT); box(-0.34, -0.55, 0.34, -0.4, DARK); box(-0.2, -0.1, 0.2, 0.2, BRIGHT); break;
    case 'cup': { polyP(r, P, [[-0.4 * s, -0.3 * s], [0.4 * s, -0.3 * s], [0.28 * s, 0.3 * s], [-0.28 * s, 0.3 * s]], BRIGHT); const a = P(0.45 * s, 0); circ(r, a[0], a[1], s * 0.15, BRIGHT); strokeP(r, P, -0.55 * s, 0.38 * s, 0.55 * s, 0.38 * s, mx1(u), LMID); break; }
    case 'book': box(-0.5, -0.35, 0.5, 0.35, COOL); box(-0.42, 0.22, 0.5, 0.35, BRIGHT); box(-0.5, -0.35, -0.38, 0.35, DARK); break;
    default: { const c = P(0, 0); oval(r, c[0], c[1], s * 0.45, s * 0.45, BRIGHT); circ(r, c[0], c[1], s * 0.45, DARK); const a = P(0, -0.35 * s), b = P(0.25 * s, 0); r.line(c[0], c[1], a[0], a[1], FIG); r.line(c[0], c[1], b[0], b[1], FIG); }
  }
}
const rabbithole = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, WELL_W, bandOf(W.a)), cam: 0, camX: 0, v: 0.2 * W.N, st: 'fall', lt: 0, heapY: 0, gX: 0.5 * W.N, gY: 0, gph: 0, flail: 0, lit: 0, up: 0, things: [], leaves: [], motes: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), G = 1.6 * N, B = bps(f), gh = 0.24 * N;
    const bc = beatClock(w, f, dt), opts = WALL_KINDS[w.kind];
    if (f.section === 'change') { w.kind = rollW(rnd, WELL_W, band); if (w.st !== 'fall' && !(w.fade > 0)) w.fade = 0.8; }
    // a new fall after the hall comes in through black: the hall goes dark, and out of the dark she is falling again
    if (w.fade > 0 && (w.fade -= dt) <= 0.4 && w.st !== 'fall') Object.assign(w, { st: 'fall', lt: 0, camX: 0, gX: 0.5 * N, things: [], leaves: [], pc: undefined, pcx: undefined });
    if (f.section === 'drop' && w.st === 'fall') { w.st = 'land'; w.heapY = w.cam + 1.15 * N; }
    let kick = 0;
    for (const h of hits) {
      if (isLow(h)) kick = 1;
      else if (h.kind === 'snare') w.flail = 1;
      else if (h.kind === 'hat') for (let k = 0; k < 3; k++) w.motes.push({ x: (0.2 + 0.6 * rnd()) * N, Y: w.cam + rnd() * N, ph: rnd() * TAU });
      if (isTonal(h)) w.lit = 1;
    }
    w.flail *= Math.exp(-dt * 3);
    w.lit = Math.max(0, w.lit - dt * 0.4);
    // the fall: drag holds her to her terminal speed, which changes only slowly with the music (and the band)
    const falling = w.st === 'fall' || w.st === 'land';
    w.v = falling ? follow(w.v, (0.16 + 0.12 * clamp(f.rel.midDrive)) * N * (0.85 + 0.15 * band), dt, 1.0) : 0;
    w.cam += w.v * dt;
    if (falling) w.gY = w.cam + 0.42 * N;
    const sw = Math.sin(t * 1.1);
    if (falling) w.gX = 0.5 * N + 0.06 * N * sw;
    const hallTop = w.st === 'fall' ? 1e9 : w.heapY - 0.44 * N - w.cam; // the hall's ceiling on the screen, once it is in view
    // the far side of the well: brick courses going by at 1/1.6 of the speed, small things hung on it
    const camB = w.cam / 1.6, cw = (0.035 * N) / 1.6, bw2 = (0.07 * N) / 1.6;
    r.rect(0, 0, N, Math.min(N, hallTop), DARK);
    for (let k = Math.floor(camB / cw); k * cw - camB < Math.min(N, hallTop); k++) {
      const y = k * cw - camB;
      r.rect(0, y, N, mx1(u * 0.6), DARK + DIM);
      for (let x = (k % 2) * bw2 * 0.5; x < N; x += bw2) r.rect(x, y, mx1(u * 0.6), cw, DARK + DIM);
    }
    const sb = 0.3 * N / 1.6;
    for (let k = Math.floor((camB - 0.2 * N) / sb); k * sb - camB < Math.min(N, hallTop); k++) {
      if (hash(k, 71) < 0.45) continue;
      const kind = hash(k, 72) < 0.5 ? 'map' : 'picture';
      fixture(r, kind, (0.24 + 0.4 * hash(k, 73)) * N, k * sb - camB, (0.1 * N) / 1.6, u, { seed: k });
    }
    // the near sides, going up at the speed of the fall, lined with the kind's things
    const sp = 0.26 * N, pl = beatPendulum(f, G, 2 * u, 0.06 * N), pa = 0.35 * Math.cos(Math.PI * bc), lit = w.lit;
    for (const side of [0, 1]) {
      const x0 = side ? 0.83 * N : 0;
      r.rect(x0, 0, 0.17 * N, Math.min(N, hallTop), LMID + DIM);
      r.rect(side ? x0 : 0.17 * N - mx1(u), 0, mx1(u), Math.min(N, hallTop), BLACK);
      for (let k = Math.floor((w.cam - 0.3 * N) / sp); k * sp - w.cam < Math.min(N, hallTop); k++) {
        const kind = opts[Math.floor(hash(k, 81 + side) * opts.length)], y = k * sp - w.cam + side * sp * 0.5;
        fixture(r, kind, x0 + 0.02 * N, y, 0.13 * N, u, { seed: k * 2 + side, min: (Math.floor(bc) % 60) / 60, hr: ((k * 7) % 12) / 12 + bc / 720, pl, pa, lit });
      }
    }
    // the hall, once the bottom is in view: a long low room, lamps hanging from its ceiling (each swinging about its
    // hook at its own pendulum's pace), tall doors all locked, and at the far end a curtain and a tiny door
    if (w.st !== 'fall') {
      const top = Math.max(0, hallTop), fl = w.heapY - w.cam, X = (x) => x - w.camX;
      r.rect(0, top, N, N - top, DARK + DIM);
      r.rect(0, fl, N, N - fl, LMID);
      for (let k = 0; k * 0.06 * N < 2.6 * N; k++) r.rect(X(k * 0.06 * N), fl, mx1(u * 0.6), N - fl, LMID + DIM);
      r.rect(X(-0.17 * N), hallTop - 0.02 * N, 0.17 * N, 0.02 * N, MID + DIM);
      r.rect(X(N), hallTop - 0.02 * N, 2 * N, 0.02 * N, MID + DIM);
      for (let k = 0; k < 6; k++) { const dx = X((0.95 + 0.28 * k) * N); r.rect(dx, fl - 0.3 * N, 0.11 * N, 0.3 * N, DARK); r.frame(Math.round(dx), Math.round(fl - 0.3 * N), Math.round(0.11 * N), Math.round(0.3 * N), LMID + DIM); r.set(dx + 0.085 * N, fl - 0.15 * N, LMID); }
      for (let k = 0; k < 7; k++) { const lx = X((0.2 + 0.35 * k) * N), ly = hallTop + 0.01 * N, L = 0.09 * N, a = 0.12 * Math.sin(t * Math.sqrt(G / L) + k), bx = lx + Math.sin(a) * L, by = ly + Math.cos(a) * L; r.line(lx, ly, bx, by, LMID); oval(r, bx, by + u, 0.012 * N, 0.01 * N, lit > 0.2 ? BRIGHT : HOT); }
      const ex = X(2.3 * N);
      r.rect(ex - 0.06 * N, fl - 0.32 * N, 0.07 * N, 0.32 * N, LMID + DIM);
      for (let k = 0; k < 4; k++) r.line(ex - 0.055 * N + k * 0.016 * N, fl - 0.32 * N, ex - 0.05 * N + k * 0.016 * N, fl, DARK);
      r.rect(ex + 0.02 * N, fl - 0.065 * N, 0.04 * N, 0.065 * N, HOT); // the tiny door
      r.frame(Math.round(ex + 0.02 * N), Math.round(fl - 0.065 * N), Math.round(0.04 * N), Math.round(0.065 * N), BRIGHT);
      r.set(ex + 0.05 * N, fl - 0.03 * N, BRIGHT);
      const tx = X(2.12 * N); // the little glass table and the key on it
      r.rect(tx - 0.03 * N, fl - 0.08 * N, 0.06 * N, mx1(u), BRIGHT);
      for (const k of [-1, 0, 1]) r.line(tx + k * 0.025 * N, fl - 0.08 * N, tx + k * 0.03 * N, fl, LMID);
      r.rect(tx - 0.008 * N, fl - 0.08 * N - mx1(u), 0.016 * N, mx1(u), HOT);
      // the heap of leaves under the well, squashed where she came down
      const hx = X(0.5 * N), sq = w.st === 'land' ? 0 : Math.min(1, w.lt * 4) * Math.exp(-w.lt * 2);
      for (let k = 0; k < 9; k++) oval(r, hx + (k - 4) * 0.035 * N, fl - 0.03 * N * (1 - Math.abs(k - 4) / 5) * (1 - 0.4 * sq), 0.04 * N, 0.025 * N, k % 2 ? LMID + DIM : MID + DIM);
    }
    // the things falling with her, each at its own terminal speed: those with more drag go up past her, the heavier
    // sink away below; each tumbles. A kick knocks a jar off a near shelf, out over the well, where it joins them
    // (they keep their own places in the well: after the landing they come down into the hall and lie where they fall)
    if (w.st === 'fall' && rnd() < dt * 0.7) { const rel = (rnd() - 0.5) * 0.16 * N; w.things.push({ x: (0.24 + 0.52 * rnd()) * N, Y: w.cam + (rel < 0 ? 1.06 * N : -0.06 * N), vx: 0, vY: w.v + rel, ang: rnd() * TAU, om: (rnd() - 0.5) * 3, kind: pick(rnd, FALLERS), sz: (0.035 + 0.02 * rnd()) * N }); }
    if (w.st === 'fall' && kick) { const side = rnd() < 0.5 ? 0 : 1; w.things.push({ x: side ? 0.83 * N : 0.17 * N, Y: w.cam + 0.42 * N, vx: (side ? -1 : 1) * 0.15 * N, vY: w.v - 0.06 * N, ang: 0, om: (side ? -1 : 1) * 2, kind: 'jar', sz: 0.04 * N }); }
    w.things = w.things.filter((o) => {
      o.vx *= Math.exp(-dt * 1.5);
      o.x += o.vx * dt;
      if (w.st !== 'fall' && o.Y >= w.heapY - o.sz * 0.5) { o.Y = w.heapY - o.sz * 0.5; o.om = 0; o.vx = 0; } else { o.Y += o.vY * dt; o.ang += o.om * dt; }
      const y = o.Y - w.cam;
      faller(r, turn(o.x - w.camX, y, o.ang), o.kind, o.sz, u, t);
      return y > -0.15 * N && y < 1.15 * N && o.x - w.camX > -0.2 * N;
    }).slice(-14);
    // the dust in the air of the well: still in the air, so it goes up past her at the speed she falls
    w.motes = w.motes.filter((m) => { const y = m.Y - w.cam; r.set(m.x + Math.sin(t * 2 + m.ph) * 2 * u, y, LMID); return y > -2 && falling; }).slice(-40);
    // the girl: falling, the skirt and hair blown up and the sway of a leaf (she leans back toward the middle at the end
    // of each swing); in the leaves; on her feet, walking down the hall a step a beat; kneeling at the little door
    if (w.st === 'land' && w.heapY - w.cam - 0.03 * N <= w.gY - w.cam + 0.12 * N) {
      w.st = 'landed'; w.lt = 0; w.v = 0; s.shake = Math.max(s.shake, 0.4);
      for (let k = 0; k < 30; k++) w.leaves.push({ x: w.gX - w.camX + (rnd() - 0.5) * 0.15 * N, y: w.gY - w.cam + 0.1 * N, vx: (rnd() - 0.5) * 0.4 * N, vy: -(0.2 + 0.4 * rnd()) * N, fq: 3 + 3 * rnd(), ph: rnd() * TAU, life: 4, c: rnd() < 0.5 ? LMID : MID + DIM, l: 2 * u });
    }
    if (w.st === 'landed' || w.st === 'hall') {
      w.lt += dt;
      // the camera comes down to the floor as she gets up, then follows her down the hall
      w.cam = follow(w.cam, w.heapY - 0.84 * N, dt, 0.5);
      if (w.st === 'landed' && w.lt > 1.6) w.st = 'hall';
      if (w.st === 'hall') { const goal = 2.18 * N, d = goal - w.gX; if (d > 0.01 * N) { const v = Math.min(stepLen(gh, 0.4) * B, d / dt); w.gX += v * dt; w.gph += (v * dt * Math.PI) / stepLen(gh, 0.4); } w.camX = clamp(w.gX - 0.45 * N, 0, 1.8 * N); }
    }
    const gx = w.gX - w.camX, fl2 = w.heapY - w.cam, fall = falling, kneel = w.st === 'hall' && w.gX >= 2.17 * N;
    let G0;
    if (fall) {
      const P = turn(gx, w.gY - w.cam, -0.25 * sw), arm = 2.3 + 0.5 * w.flail + 0.15 * Math.sin(t * 5);
      G0 = rig(r, P, 0, 0.06 * N, gh, 1, FIG, { sit: true, legs: [[0.1 + 0.1 * Math.sin(t * 3), 0.2], [-0.15, 0.3]], arms: [[arm, 0.3], [-arm, -0.3]], dress: COOL, billow: 0.8 + 0.2 * Math.sin(t * 9), hairUp: Math.sin(t * 7) });
    } else {
      const sit = w.st === 'landed' && w.lt < 1.0, base = w.st === 'landed' ? fl2 - 0.04 * N : fl2;
      G0 = rig(r, ID, gx, sit ? base - 0.02 * N : base, gh, 1, FIG, sit ? { sit: true, legs: [[1.4, 0.2], [1.3, 0.3]], arms: [[0.6, 0.5], [-0.4, 0.3]], dress: COOL, billow: 0.1 }
        : kneel ? { lean: 0.45, legs: [[1.4, 2.6], [0.2, 1.6]], arms: [[1.2, 0.3], [0.9, 0.4]], dress: COOL, billow: 0 }
          : { legs: w.st === 'hall' ? gaitLegs(w.gph, 0.4) : [[0.05, 0.1], [-0.05, 0.1]], arms: w.st === 'hall' ? gaitArms(w.gph, 0.4) : [[0.2, 0.3], [-0.2, 0.3]], dress: COOL, billow: 0 });
    }
    r.rect(G0.sh[0] - gh * 0.04, G0.sh[1] + gh * 0.02, gh * 0.08, gh * 0.08, BRIGHT); // the pinafore
    targets.push({ x: gx - gh * 0.25, y: G0.head[1] - gh * 0.12, w: gh * 0.5, h: gh * 1.1 });
    const dc = w.cam - (w.pc ?? w.cam), dcx = w.camX - (w.pcx ?? w.camX); // the leaves stay where they are as the camera moves
    for (const l of w.leaves) { l.y -= dc; l.x -= dcx; }
    w.pc = w.cam; w.pcx = w.camX;
    w.leaves = flutter(W, w.leaves, () => fl2 - u, 0, 0.07 * N, MID + DIM).slice(-40);
    if (w.fade > 0) { const q = 1 - Math.abs(w.fade - 0.4) / 0.4; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (bayer(x, y) < q) r.buf[y * N + x] = BLACK; }
  },
};

// ---------------------------------------------------------------------------------------------- sirens
// A galley rowing past the singers' rocks: the oarsmen pull a stroke a beat with their ears stopped with wax, and one
// man stands bound to the mast, straining at the ropes toward the song on every snare. On the rocks the singers sit,
// hair on the wind and wings folded; each note sends a ring of song out from one of them, spreading at one speed and
// fading as it goes, finer for the higher notes. The swell breaks on the rocks in spray as each crest comes in, harder
// on the kicks. The camera keeps with the ship, so the rocks go by at its pace, and everything rides the swell. The
// kind is the sea: golden and calm, grey, wild. A drop: the sail is let fall and fills, the ship gathers way and
// clears the rocks, the song fading behind her; new rocks come up ahead a while later.
const SONG_W = { golden: [3, 2, 1], grey: [2, 2, 2], wild: [0, 1, 3] };
const SONG_AMP = { golden: 0.012, grey: 0.02, wild: 0.034 };
const crag = (X, rnd, N) => ({ X, wd: (0.11 + 0.06 * rnd()) * N, ht: (0.17 + 0.09 * rnd()) * N, seed: Math.floor(rnd() * 1e6), eta: 0, cool: 0, singers: rnd() < 0.5 ? 1 : 2 });
const sirens = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, SONG_W, bandOf(W.a)), X: 0, v: 0.015 * N, amp: 0.02 * N, clear: 0, sail: 0, strain: 0, song: 1, who: 0, rocks: [crag(-0.46 * N, rnd, N), crag(-0.22 * N, rnd, N)], rings: [], drops: [], plops: [],
      sea: { trains: [{ l: 0.7, d: 1, p: 0, a: 0 }, { l: 0.3, d: 1, p: 2.4, a: 0 }, { l: 0.12, d: -1, p: 1.1, a: 0 }] } });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.44 * N, base = 0.72 * N, g = 0.55 * N, sx = 0.6 * N, Lg = 0.46 * N, fb = 0.07 * Lg;
    const p = frac(beatClock(w, f, dt));
    if (f.section === 'change') w.kind = rollW(rnd, SONG_W, band);
    if (f.section === 'drop' && w.clear <= 0) w.clear = 7;
    w.clear -= dt;
    w.sail = follow(w.sail, w.clear > 0 ? 1 : 0, dt, 0.8);
    w.strain *= Math.exp(-dt * 2.5);
    w.amp = follow(w.amp, SONG_AMP[w.kind] * N * (0.7 + 0.7 * clamp(f.rel.bassDrive)), dt, 0.8);
    // way on her: the oars' surge on each drive, and the wind in the sail once it is let fall
    w.v = follow(w.v, (0.015 * (p < 0.45 ? 1.3 : 0.8) + 0.1 * w.sail) * N, dt, 0.4);
    w.X -= w.v * dt;
    const scr = (X) => X - w.X + sx - 0.0;
    let kick = 0;
    for (const h of hits) {
      if (isLow(h)) kick = h.strength;
      else if (h.kind === 'snare') w.strain = Math.max(w.strain, h.strength);
      if (isTonal(h) && w.song > 0.05) w.sing = h.pc;
    }
    // rocks gone astern: a new pair comes up ahead, far off yet
    if (w.rocks.every((k) => scr(k.X) > 1.3 * N)) w.rocks = [crag(w.X - sx - 0.5 * N, rnd, N), crag(w.X - sx - 0.25 * N, rnd, N)];
    const near = Math.max(0, ...w.rocks.map((k) => 1 - Math.abs(scr(k.X) - sx) / (0.9 * N)));
    w.song = follow(w.song, w.clear > 0 ? 0 : clamp(near * 1.4), dt, w.clear > 0 ? 1 : 3);
    const tr = w.sea.trains;
    tr[0].a = w.amp; tr[1].a = w.amp * 0.45; tr[2].a = w.amp * 0.15;
    seaSurf(w.sea, N, t, w.X, base, g); // the camera's travel is w.X (she heads toward -x): the water goes by the way the rocks do
    const surf = (x) => surfAt(w.sea, x);
    // the sky by the kind: a low gold sun, grey cloud, or a dark wild one
    if (w.kind === 'golden') oval(r, 0.84 * N, 0.3 * N, 0.05 * N, 0.05 * N, HOT);
    else for (let x = 0; x < N; x++) vcol(r, x, 0, (0.1 + 0.03 * Math.sin(x * 0.05 + t * 0.2) + (w.kind === 'wild' ? 0.06 : 0)) * N, w.kind === 'wild' ? DARK : LMID + DIM);
    for (let k = 0; k < 3; k++) { const span = 1.5 * N, x = ((((hash(k, 14) * span - t * 0.008 * N) % span) + span) % span) - 0.25 * N; cloud(r, x, (0.14 + 0.06 * k) * N, (0.12 + 0.05 * hash(k, 15)) * N, w.kind === 'wild' ? MID + DIM : LMID, k + 20); } // on the wind from astern that fills the sail
    farSea(W, w.sea, hz, w.X, base, { farA: LMID, farB: LMID + DIM, streak: BRIGHT });
    // the rocks, a little farther off than the ship (smaller, their feet higher), and the singers on them
    const mouths = [];
    for (const k of w.rocks) {
      const x = scr(k.X), yb = base - 0.02 * N, pts = [[x - k.wd, yb + 0.05 * N]];
      if (x < -0.3 * N || x > 1.3 * N) continue;
      for (let j = 0; j <= 6; j++) { const q = j / 6, hh = k.ht * Math.sin(Math.PI * (0.1 + 0.8 * q)) * (0.75 + 0.35 * hash(k.seed, j)); pts.push([x - k.wd + 2 * k.wd * q, yb - hh]); }
      pts.push([x + k.wd, yb + 0.05 * N]);
      r.poly(pts, DARK);
      for (let j = 1; j < pts.length - 2; j++) { r.line(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], MID); r.line(pts[j][0], pts[j][1], pts[j][0] + 0.02 * N, pts[j][1] + 0.05 * N, DARK + DIM); } // lit along the top, cracked
      // the swell breaks on it: spray up the face as a crest comes in, a burst on a kick
      const eta = base - surf(x), rising = eta > k.eta;
      k.eta = eta;
      k.cool -= dt;
      if ((rising && eta > 0.6 * w.amp && k.cool <= 0) || kick > 0) { k.cool = 0.6; splash(w.drops, rnd, x + (rnd() - 0.5) * k.wd, surf(x) - u, Math.round(6 + 8 * (kick || 0.5)), (0.14 + 0.12 * (kick || 0.5)) * N, BRIGHT, 0.6); }
      for (let i = 0; i < k.singers; i++) {
        const j = 2 + i * 2, top = pts[j], dir = sx > top[0] ? 1 : -1, sh = 0.13 * N;
        r.poly([[top[0] - dir * sh * 0.05, top[1] - sh * 0.5], [top[0] - dir * sh * 0.35, top[1] - sh * 0.15], [top[0] - dir * sh * 0.1, top[1] - sh * 0.02]], dim(FIG)); // the folded wings
        const S = rig(r, ID, top[0], top[1] - 0.004 * N, sh, dir, FIG, { sit: true, lean: -0.1, nod: -0.25, legs: [[1.3, 1.6], [1.1, 1.5]], arms: [[1.9 + 0.2 * Math.sin(t * 2 + i), 0.3], [1.0, 0.8]], hair: 1 + 0.6 * clamp(f.rel.trebDrive), robe: 0.3 });
        if (i === 0) { const lx = S.hand2[0], ly = S.hand2[1]; r.line(lx - 2 * u, ly - 4 * u, lx - 2 * u, ly, BRIGHT); r.line(lx + 2 * u, ly - 4 * u, lx + 2 * u, ly, BRIGHT); r.line(lx - 2 * u, ly, lx + 2 * u, ly, BRIGHT); for (let q = -1; q <= 1; q++) r.line(lx + q * u, ly - 3 * u, lx + q * u, ly, LMID); } // a lyre
        mouths.push([S.head[0] + dir * 0.012 * N, S.head[1] + 0.006 * N]);
        targets.push({ x: top[0] - sh * 0.3, y: top[1] - sh * 0.7, w: sh * 0.6, h: sh * 0.7 });
      }
    }
    nearSea(W, w.sea, w.X, base, { foam: w.amp * 0.8 });
    // the song: a ring from one of the singers on each note (and a soft one each beat), spreading at one speed toward the
    // ship, the higher notes finer; it thins as it spreads, and goes as the rocks fall astern
    if (mouths.length && (w.sing !== undefined || (w.on && w.song > 0.3))) { const m = mouths[w.who++ % mouths.length]; w.rings.push({ x: m[0], y: m[1], t: 0, lam: 0.025 * N * 2 ** (-(w.sing ?? 0) / 12), a: Math.atan2(base - 0.12 * N - m[1], sx - m[0]), amp: w.song * (w.sing !== undefined ? 1 : 0.5) }); w.sing = undefined; }
    w.rings = w.rings.filter((k) => {
      k.t += dt;
      for (let j = 0; j < 2; j++) {
        const R = 0.22 * N * k.t - j * k.lam;
        if (R < 1) continue;
        const n = Math.ceil(R * 1.1 * 1.4), fade = k.amp * (1 - R / (0.5 * N));
        for (let q = 0; q <= n; q++) { const a = k.a - 0.55 + (1.1 * q) / n, x = k.x + Math.cos(a) * R, y = k.y + Math.sin(a) * R; if (hash(q, j + Math.floor(k.t * 20)) < fade) r.set(x, y, COOL); }
      }
      return k.t < 2.3;
    }).slice(-8);

    // the galley: the oarsmen on their benches facing aft, a stroke a beat; the man bound to the mast, facing the bow and
    // the song, leaning into the ropes on the snares; the curled stern post, the painted eye, the sail let fall on a drop
    const Bt = ride(w.sea, sx, Lg, -1), P = Bt.P, oars = [], xs = [-0.34, -0.24, -0.14, 0.2, 0.3, 0.4];
    for (const lx of xs) oars.push(oarAt(p, lx * Lg, -fb, 0.06 * N, fb));
    for (let i = 0; i < xs.length; i++) rower(r, P, xs[i] * Lg + 0.03 * Lg, -fb * 0.3, 0.15 * N, FIG, p, oars[i].hx, oars[i].hy, true);
    polyP(r, P, [[-0.48 * Lg, -fb * 1.3], [-0.4 * Lg, -fb], [0.42 * Lg, -fb], [0.5 * Lg, -fb * 0.6], [0.57 * Lg, fb * 0.4], [0.47 * Lg, fb * 0.5], [0.3 * Lg, fb], [-0.38 * Lg, fb], [-0.46 * Lg, 0]], DARK);
    strokeP(r, P, -0.42 * Lg, -fb, 0.42 * Lg, -fb, mx1(u), LMID);
    let qx = -0.48 * Lg, qy = -fb * 1.3; // the stern post, curling up and over toward the bow
    for (let k = 1; k <= 7; k++) { const a = -Math.PI / 2 + k * 0.32, nx = qx + Math.cos(a) * 0.022 * N, ny = qy + Math.sin(a) * 0.022 * N; strokeP(r, P, qx, qy, nx, ny, mx1(1.6 * u * (1 - k * 0.08)), DARK); qx = nx; qy = ny; }
    const eye = P(0.45 * Lg, -fb * 0.4);
    oval(r, eye[0], eye[1], 0.012 * N, 0.006 * N, BRIGHT);
    r.set(eye[0], eye[1], BLACK);
    for (let i = 0; i < xs.length; i++) { const o = oars[i]; strokeP(r, P, o.hx, o.hy, o.bx, o.by, mx1(u * 0.8), LMID); }
    strokeP(r, P, 0.04 * Lg, -fb, 0.04 * Lg, -fb - 0.3 * N, mx1(1.2 * u), DARK);
    strokeP(r, P, -0.12 * Lg, -fb - 0.28 * N, 0.2 * Lg, -fb - 0.28 * N, mx1(u), DARK);
    if (w.sail > 0.05) { // let fall from the yard, bellied forward by the wind from astern, a band across it
      const hgt = 0.22 * N * w.sail, bel = 0.025 * N * w.sail, yy = -fb - 0.28 * N, band = (q0, q1) => [[-0.12 * Lg + bel * q0, yy + hgt * q0], [0.2 * Lg + bel * q0, yy + hgt * q0], [0.2 * Lg + bel * q1, yy + hgt * q1], [-0.12 * Lg + bel * q1, yy + hgt * q1]];
      polyP(r, P, band(0, 1), LMID);
      polyP(r, P, band(0.45, 0.6), HOT);
    }
    else strokeP(r, P, -0.12 * Lg, -fb - 0.275 * N, 0.2 * Lg, -fb - 0.275 * N, mx1(2.5 * u), LMID);
    const bound = rig(r, P, 0.08 * Lg, -fb, 0.2 * N, 1, FIG, { lean: 0.08 + 0.35 * w.strain, nod: 0.1 + 0.2 * w.strain, legs: [[0.02, 0.05], [-0.02, 0.05]], arms: [[-0.7 - 0.3 * w.strain, 0.4], [-0.6 - 0.3 * w.strain, 0.4]] });
    for (const q of [0.25, 0.62]) { const a = P(0.04 * Lg, -fb - 0.2 * N * (1 - q)), b = P(0.08 * Lg + 0.02 * N * (q < 0.5 ? 0 : w.strain), -fb - 0.2 * N * (1 - q) + 0.003 * N); r.stroke(a[0], a[1], b[0], b[1], mx1(1.3 * u), LMID); } // the ropes, taut as he strains
    targets.push({ x: bound.head[0] - 0.03 * N, y: bound.head[1] - 0.02 * N, w: 0.06 * N, h: 0.2 * N });
    submerge(r, w.sea, sx - 0.65 * Lg, sx + 0.65 * Lg, base + 0.15 * N);
    w.drops = ballistic(W, w.drops, g, surf, BRIGHT, w.plops).slice(-200);
    w.plops = ripples(W, w.plops, LMID, 0.25, 0.08, 0.4);
    targets.push({ x: sx - 0.5 * Lg, y: Bt.y - 0.3 * N, w: Lg, h: 0.32 * N });
  },
};

// ---------------------------------------------------------------------------------------------- cyclops
// A cave by firelight: the fire throws its light over the rock (falling off with the distance, flickering, flaring on
// the kicks, embers rising off it and slowing as they cool), and every shadow lies away from it. The one-eyed giant
// sits by the cave's mouth, which a great stone shuts, and his flock goes round and round the floor, a sheep past his
// hand on every beat; under three of them a man clings, hidden in the fleece. Every sheep and man is smaller the
// farther back on the floor it walks. The kind is the giant's mood: asleep (the eye shut, the chest rising with the
// bass), at supper (the eye following the sheep, a pat on each back), or raging (the eye roving, the hand groping, the
// floor shaking on the kicks). A drop: he rolls the stone aside (it rolls at v/r) and the daylight comes in, and on
// each beat the sheep at his hand goes out into the light with its man under it; the next section brings them back
// in one a beat, and the stone rolls back. Nobody is hurt.
const MOOD_W = { asleep: [3, 1, 0], supper: [1, 2, 1], rage: [0, 1, 3] };
const cyclops = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, MOOD_W, bandOf(W.a)), flare: 0, stone: 0, open: false, back: false, lid: 1, look: 0, tex: null, embers: [], smoke: [],
      flock: Array.from({ length: 8 }, (_, i) => ({ k: i, st: 'loop', e: 0, b0: 0, man: i === 1 || i === 4 || i === 6, ph: (i * TAU) / 3, x: 0, y: 0, d: 1, px: 0 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), buf = r.buf, bc = beatClock(w, f, dt), K = 4;
    if (!w.tex || w.tex.length !== N * N) { // the rock's grain: smooth value noise at two scales, made once for the size
      w.tex = new Float32Array(N * N);
      const nz = (x, y, gs, sd) => { const ix = Math.floor(x / gs), iy = Math.floor(y / gs), fx = smooth(x / gs - ix), fy = smooth(y / gs - iy); return lerp(lerp(hash(ix + sd, iy), hash(ix + 1 + sd, iy), fx), lerp(hash(ix + sd, iy + 1), hash(ix + 1 + sd, iy + 1), fx), fy); };
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) w.tex[y * N + x] = 0.65 * nz(x, y, 6 * W.u, 3) + 0.35 * nz(x, y, 2.5 * W.u, 9);
    }
    if (f.section === 'change') { w.kind = rollW(rnd, MOOD_W, band); if (w.open) w.back = true; }
    if (f.section === 'drop' && !w.open) { w.open = true; w.back = false; if (w.kind === 'asleep') w.kind = 'supper'; }
    let kick = 0;
    for (const h of hits) {
      if (isLow(h)) { kick = h.strength; w.flare = Math.max(w.flare, h.strength); }
      else if (h.kind === 'snare') w.look = (rnd() - 0.5) * 2;
      if (isTonal(h)) w.flare = Math.max(w.flare, 0.4);
    }
    w.flare *= Math.exp(-dt * 2.5);
    if (kick && w.kind === 'rage') s.shake = Math.max(s.shake, 0.3 * kick);
    // the stone: rolled aside on the drop, back when the flock is in again; it rolls, turning by its travel over its radius
    const allIn = w.flock.every((sh) => sh.st === 'loop');
    if (w.back && allIn) { w.open = false; w.back = false; }
    w.stone = clamp(w.stone + (w.open ? dt : -dt) / 1.6);
    const sr = 0.15 * N, sx0 = 0.86 * N, stx = sx0 + 0.3 * N * smooth(w.stone), sty = 0.86 * N - sr, day = smooth(w.stone);

    // the light: the fire's, falling off with the distance and flickering, the rock's grain in it; through the mouth
    // the night, or the day once the stone is aside, and the day's light laid on the floor in from the mouth
    const fx = 0.3 * N, fy = 0.82 * N, L = (0.42 + 0.12 * w.flare + 0.03 * Math.sin(t * 13) * Math.sin(t * 7.3)) * N, iL = 1 / (L * L), mxc = 0.86 * N, mw = 0.12 * N, mt = 0.58 * N, mb = 0.86 * N, tex = w.tex;
    for (let y = 0; y < N; y++) {
      const row = y * N, qa = y < mb && y > mt ? Math.sqrt(1 - ((mb - y) / (mb - mt)) ** 2) * mw : -1, dy = (y - fy) * 1.25, floor = y > 0.7 * N;
      for (let x = 0; x < N; x++) {
        if (qa > 0 && Math.abs(x - mxc) < qa) { buf[row + x] = day > 0.05 ? (y > 0.74 * N ? LMID : BRIGHT) : DARK + DIM; continue; }
        const dx = x - fx;
        let v = 1 - (dx * dx + dy * dy) * iL + 0.3 * (tex[row + x] - 0.5) - (floor ? 0 : 0.05);
        if (day > 0 && floor) { const q = (y - 0.7 * N) / (0.3 * N), x0 = lerp(0.74 * N, 0.4 * N, q), x1 = lerp(0.98 * N, 0.8 * N, q); if (x > x0 && x < x1 && bayer(x, y) < 0.55 * day) v = Math.max(v, 0.8); }
        buf[row + x] = v > 0.7 ? LMID : v > 0.45 ? MID : v > 0.2 ? DARK : DARK + DIM;
      }
    }
    if (day > 0.05) for (let x = Math.round(mxc - mw); x < mxc + mw; x++) r.set(x, 0.74 * N + Math.sin(x * 0.2) * u, MID);
    // the stone, rolling aside: a great round slab, lit on the fire's side, its marks turning as it rolls
    const rot = (stx - sx0) / sr;
    oval(r, stx, sty, sr, sr, DARK);
    for (let k = 0; k < 6; k++) { const a = rot + k * 1.05; r.line(stx + Math.cos(a) * sr * 0.3, sty + Math.sin(a) * sr * 0.3, stx + Math.cos(a) * sr * 0.85, sty + Math.sin(a) * sr * 0.85, DARK + DIM); }
    circ(r, stx, sty, sr, MID, 1, Math.PI * 0.6, Math.PI * 1.4);

    // the floor where the flock walks: a loop round the cave, the far side smaller and higher up; a sheep's slot comes
    // round to his hand on every beat, so one passes it a beat; the way out runs from his hand through the mouth
    const yH = 0.55 * N, kf = 0.33 * N, cxl = 0.42 * N, ax = 0.2 * N, d0 = 1.25, ad = 0.25;
    const loopAt = (sv) => { const a = sv * TAU; return [cxl + ax * Math.cos(a), d0 + ad * Math.sin(a)]; };
    const exitAt = (e) => (e < 0.5 ? [lerp(cxl + ax, 0.86 * N, e * 2), lerp(d0, 1.08, e * 2)] : [lerp(0.86 * N, 0.9 * N, e * 2 - 1), lerp(1.08, 2.8, e * 2 - 1)]);
    const atHand = ((8 - (Math.floor(bc + 1e-6) % 8)) % 8 + 8) % 8;
    if (w.on) {
      if (w.open && day > 0.9 && !w.back) { const sh = w.flock.find((q) => q.st === 'loop' && q.k === atHand); if (sh) { sh.st = 'out'; sh.b0 = Math.floor(bc + 1e-6); } }
      if (w.back) { const sh = w.flock.find((q) => q.st === 'gone'); if (sh) { sh.st = 'in'; sh.b0 = Math.floor(bc + 1e-6); } }
    }
    for (const sh of w.flock) {
      let X, d;
      if (sh.st === 'loop') [X, d] = loopAt(frac((sh.k + bc) / 8));
      else {
        sh.e = clamp((bc - sh.b0) / K);
        if (sh.st === 'out' && sh.e >= 1) sh.st = 'gone';
        if (sh.st === 'in' && sh.e >= 1) { const slot = ((8 - (Math.floor(bc + 1e-6) % 8)) % 8 + 8) % 8; if (!w.flock.some((q) => q.st === 'loop' && q.k === slot)) { sh.st = 'loop'; sh.k = slot; } }
        [X, d] = exitAt(sh.st === 'in' ? 1 - sh.e : sh.e);
      }
      const nx = X, mv = Math.abs(nx - sh.x) + Math.abs(d - sh.d) * 0.3 * N;
      if (mv > 0.0005 * N) sh.dir = Math.sign(nx - sh.x) || sh.dir || 1;
      sh.ph += (mv * TAU) / ((2 * Math.sin(0.35) * 0.32 * 0.11 * N) / d);
      sh.x = nx; sh.d = d; sh.y = yH + kf / d;
    }
    // the giant and the flock in depth order: the far side of the loop behind him, the near side in front
    const giant = () => {
      const gx = 0.6 * N, asleep = w.kind === 'asleep', rage = w.kind === 'rage', br = asleep ? Math.sin(f.rel.bassClock * 1.2) * 0.008 * N : 0;
      w.lid = follow(w.lid, asleep ? 0 : 1, dt, 0.3);
      r.poly([[0.44 * N, 0.8 * N], [0.45 * N, 0.6 * N], [0.5 * N, 0.46 * N - br], [0.6 * N, 0.41 * N - br], [0.68 * N, 0.48 * N], [0.7 * N, 0.6 * N], [0.8 * N, 0.64 * N], [0.82 * N, 0.8 * N]], FIG);
      r.poly([[0.45 * N, 0.62 * N], [0.5 * N, 0.46 * N - br], [0.52 * N, 0.47 * N], [0.47 * N, 0.63 * N]], LMID + DIM); // the firelit side of his back
      const hx = gx + 0.01 * N + (rage ? Math.sin(t * 0.9) * 0.01 * N : 0), hy = 0.33 * N + (asleep ? 0.03 * N : 0) - br;
      oval(r, hx, hy, 0.065 * N, 0.07 * N, FIG);
      r.poly([[hx - 0.02 * N, hy + 0.03 * N], [hx + 0.07 * N, hy + 0.03 * N], [hx + 0.04 * N, hy + 0.12 * N], [hx - 0.01 * N, hy + 0.1 * N]], FIG); // the beard
      r.rect(hx - 0.01 * N, hy - 0.035 * N, 0.08 * N, 0.012 * N, FIG); // the brow
      const ex = hx + 0.035 * N, ey = hy - 0.012 * N, eh = 0.016 * N * w.lid * (rage ? 1.3 : 1);
      if (eh > 0.6) { oval(r, ex, ey, 0.026 * N, eh, BRIGHT); const tx = rage ? Math.sin(t * 2.3) * 0.012 * N + w.look * 0.006 * N : clamp((0.62 * N - ex) / 20, -0.012 * N, 0.012 * N); oval(r, ex + tx, ey, 0.009 * N, Math.min(eh, 0.01 * N), FIG); }
      else r.rect(ex - 0.024 * N, ey, 0.048 * N, mx1(u), LMID);
      // his hand: on each beat down on the back of the sheep at it, lifted between (asleep it lies on his knee; raging it
      // gropes); on the drop it rolls the stone aside
      const ph2 = frac(bc), handTo = w.stone > 0 && w.stone < 1 ? [stx - sr * 0.9, sty] : asleep ? [0.74 * N, 0.66 * N] : rage ? [0.62 * N + Math.sin(t * 1.7) * 0.05 * N, 0.72 * N + Math.sin(t * 2.9) * 0.03 * N] : [cxl + ax, yH + kf / d0 - 0.07 * N - 0.04 * N * Math.sin(Math.PI * ph2)];
      r.stroke(0.62 * N, 0.47 * N, (0.62 * N + handTo[0]) / 2 + 0.02 * N, (0.47 * N + handTo[1]) / 2 + 0.03 * N, mx1(0.035 * N), FIG);
      r.stroke((0.62 * N + handTo[0]) / 2 + 0.02 * N, (0.47 * N + handTo[1]) / 2 + 0.03 * N, handTo[0], handTo[1], mx1(0.03 * N), FIG);
      oval(r, handTo[0], handTo[1], 0.025 * N, 0.018 * N, FIG);
      targets.push({ x: hx - 0.07 * N, y: hy - 0.07 * N, w: 0.15 * N, h: 0.15 * N });
    };
    const sheep = (sh) => {
      if (sh.st === 'gone') return;
      const len = (0.11 * N) / sh.d, sx = sh.x, sy = sh.y, outside = sh.st !== 'loop' && sh.d > 1.1;
      if (!outside) oval(r, sx + (sx - fx) * 0.12, sy, len * 0.45, len * 0.06, DARK + DIM); // its shadow, away from the fire
      const Bd = beast(r, sx, sy, len, sh.dir || 1, BRIGHT, sh.ph, { kind: 'sheep', gait: 'walk', amp: 0.35, horns: sh.k % 3 === 0, face: FIG, legCol: FIG });
      if (sh.man) { const bx = Bd.belly[0], by = Bd.belly[1] + len * 0.05; r.stroke(bx - len * 0.3, by, bx + len * 0.22, by, mx1(len * 0.1), FIG); oval(r, bx + (sh.dir || 1) * len * 0.28, by, len * 0.07, len * 0.07, FIG); r.line(bx - len * 0.2, by, bx - len * 0.24, by - len * 0.08, FIG); r.line(bx + len * 0.12, by, bx + len * 0.15, by - len * 0.08, FIG); }
      if (sh.d < 1.6) targets.push({ x: sx - len * 0.5, y: sy - len * 0.6, w: len, h: len * 0.6 });
    };
    // the fire: tongues that jump, flaring on the kicks; embers thrown up that slow as they cool; smoke to the roof
    const fh = (0.07 + 0.06 * w.flare + 0.015 * f.level) * N, tt = Math.floor(t * 12);
    const fire = () => {
      for (let k = 0; k < 4; k++) r.stroke(fx - 0.05 * N + k * 0.03 * N, fy + 0.02 * N, fx + 0.04 * N - k * 0.025 * N, fy - 0.01 * N, mx1(1.5 * u), DARK);
      flame(r, fx, fy + 0.01 * N, 0.08 * N, fh, tt);
    };
    // all of it far to near: the far side of the loop, the giant (seated back by the mouth), the fire, the near side
    const order = [...w.flock].sort((a, b) => b.d - a.d), dF = kf / (fy + 0.02 * N - yH);
    for (const sh of order) if (sh.d > 1.32) sheep(sh);
    giant();
    for (const sh of order) if (sh.d <= 1.32 && sh.d > dF) sheep(sh);
    fire();
    for (const sh of order) if (sh.d <= dF) sheep(sh);
    for (let k = spawns(rnd, 8 + 25 * w.flare, dt); k > 0; k--) w.embers.push(ember(rnd, fx + (rnd() - 0.5) * 0.04 * N, fy - fh * 0.6, N, 1 + w.flare));
    if (rnd() < dt * 3) w.smoke.push({ x: fx, y: fy - fh, vx: 0, vy: -0.12 * N, life: 3, age: 0, s: 2 * u });
    w.embers = embers(W, w.embers).slice(-60);
    w.smoke = smoke(W, w.smoke, 0.01 * N, DARK + DIM, DARK).slice(-12);
  },
};

// ---------------------------------------------------------------------------------------------- icarus
// A youth on wings of feathers and wax flying for the sun over the sea, his father lower and behind on his own: a
// wingbeat each beat (the body rising through the downstroke, settling through the up), the sea going by below at
// their pace and the far things slower. The sun grows with the energy; the higher he climbs and the bigger it is, the
// faster the wax drips off his wings and falls straight down from him into the sea; the hats loosen feathers that the
// air strips back at once and that flutter down to the water; a snare is a gust that rocks him; a note flares the
// sun's rays. The kind is what lies below: the open sea, islands, a fleet. A drop: the wings come apart in a burst of
// feathers and he falls, his own speed carrying him on along a parabola as the camera stops, tumbling, into the sea:
// a splash, rings, the feathers settling round the place, the father circling over it. A new section and he flies
// again, in from the left.
const BELOW_W = { sea: [2, 2, 3], isles: [3, 2, 1], fleet: [1, 2, 2] };
// a wing of feathers from the shoulder (sx, sy), `span` long, raised by `el` (1 up, -1 down; level points at us and is
// short), the feathers hanging back from its leading edge; `lost` (bits) the feathers gone. Facing `dir`
function wing(r, sx, sy, span, el, dir, u, lost, col, fcol) {
  const tx = sx - dir * span * 0.18, ty = sy - span * el * 0.95, n = 7;
  r.poly([[sx, sy], [tx, ty], [tx - dir * span * 0.28, ty + span * 0.08], [sx - dir * span * 0.42, sy + span * 0.05]], col);
  for (let k = 0; k < n; k++) {
    if (lost & (1 << k)) continue;
    const q = (k + 1) / (n + 1), px = lerp(sx, tx, q), py = lerp(sy, ty, q), l = span * (0.5 - 0.25 * q);
    r.stroke(px, py, px - dir * l, py + span * 0.06, mx1(u), fcol);
  }
  r.stroke(sx, sy, tx, ty, mx1(1.3 * u), DARK);
}
// a flier `h` tall laid along the air at (x, y) facing `dir`, tilted by `tilt`, the wings at `el`; returns the shoulder
function flier(r, x, y, h, dir, tilt, el, u, lost, o = {}) {
  const P = turn(x, y, dir * (Math.PI / 2) * 0.85 + tilt);
  const J = rig(r, P, 0, 0.25 * h, h, dir, FIG, { lean: 0, nod: -0.3, legs: [[-0.15, 0.2], [0.1, 0.35]], arms: [[0.4, 0.2], [0.3, 0.2]], beard: o.beard });
  wing(r, J.sh[0], J.sh[1], h * 0.85, el, dir, u, lost, MID, LMID);
  return J.sh;
}
const wingEl = (p) => (p < 0.4 ? lerp(1, -0.9, smooth(p / 0.4)) : lerp(-0.9, 1, smooth((p - 0.4) / 0.6)));
const icarus = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, BELOW_W, bandOf(W.a)), st: 'fly', off: 0, vc: 0.1 * N, ix: 0.5 * N, iy: 0.42 * N, alt: 0.42 * N, rs: 0.06 * N, lost: 0, gust: 0, flare: 0, seaT: 0, fx: 0, fy: 0, fvx: 0, fvy: 0, spin: 0, sx: 0,
      feathers: [], wax: [], drops: [], rings: [], sea: { trains: [{ l: 0.5, d: -1, p: 0, a: 0.006 * N }, { l: 0.2, d: -1, p: 1.3, a: 0.003 * N }] } });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.74 * N, base = 0.86 * N, g = 0.6 * N, ih = 0.17 * N;
    const p = frac(beatClock(w, f, dt));
    if (w.st === 'sea') w.seaT += dt;
    if (f.section === 'change' || w.seaT > 16) { if (f.section === 'change') w.kind = rollW(rnd, BELOW_W, band); if (w.st === 'sea') Object.assign(w, { st: 'fly', ix: -0.15 * N, iy: 0.45 * N, lost: 0, seaT: 0 }); }
    if (f.section === 'drop' && w.st === 'fly') {
      Object.assign(w, { st: 'fall', fx: w.ix, fy: w.iy, fvx: w.vc, fvy: -0.25 * N, spin: 0 });
      for (let k = 0; k < 18; k++) w.feathers.push({ x: w.ix + (rnd() - 0.5) * 0.08 * N, y: w.iy + (rnd() - 0.5) * 0.05 * N, vx: 0, vy: 0, fq: 3 + 3 * rnd(), ph: rnd() * TAU, life: 8, l: 2.5 * u, c: BRIGHT });
    }
    for (const h of hits) {
      if (isLow(h) && w.st === 'fly') w.alt -= 0.02 * N * h.strength; // a strong beat climbs
      else if (h.kind === 'snare') w.gust = 1;
      else if (h.kind === 'hat' && w.st === 'fly' && rnd() < 0.5) { const k = Math.floor(rnd() * 7); if (!(w.lost & (1 << k)) && countBits(w.lost) < 3) { w.lost |= 1 << k; w.feathers.push({ x: w.ix - 0.03 * N, y: w.iy - 0.04 * N, vx: 0, vy: 0, fq: 3 + 3 * rnd(), ph: rnd() * TAU, life: 8, l: 2.5 * u, c: BRIGHT }); } }
      if (isTonal(h)) w.flare = 1;
    }
    w.gust *= Math.exp(-dt * 3);
    w.flare *= Math.exp(-dt * 2.5);
    // the camera keeps with them in flight and is left behind by the fall; the sea, the isles and the ships go by under it
    w.vc = follow(w.vc, w.st === 'fly' ? (0.09 + 0.06 * clamp(f.rel.midDrive)) * N : 0, dt, w.st === 'fly' ? 1 : 0.6);
    w.off += w.vc * dt;
    w.rs = follow(w.rs, (0.04 + 0.06 * clamp(f.level) + 0.03 * clamp(f.rel.bassDrive)) * N, dt, 0.6);
    const sunX = 0.8 * N, sunY = 0.17 * N;
    // the sky, the sun and its rays
    for (let k = 0; k < 4; k++) { const span = 1.6 * N, x = ((((hash(k, 3) * span - w.off * 0.15) % span) + span) % span) - 0.3 * N; for (let j = 0; j < 2; j++) r.rect(x + j * 0.04 * N, (0.3 + 0.08 * k) * N + j * 1.5 * u, (0.25 - j * 0.08) * N, mx1(u * 0.7), LMID); }
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU + t * 0.1, l0 = w.rs * 1.25, l1 = w.rs * (1.5 + 0.4 * w.flare + 0.15 * (k % 2)); r.line(sunX + Math.cos(a) * l0, sunY + Math.sin(a) * l0, sunX + Math.cos(a) * l1, sunY + Math.sin(a) * l1, w.flare > 0.3 ? HOT : LMID); }
    oval(r, sunX, sunY, w.rs, w.rs, BRIGHT);
    circ(r, sunX, sunY, w.rs, HOT);
    // the sea: the far band, what lies on it at its distance, the near swell
    w.sea.trains[0].a = (0.005 + 0.004 * clamp(f.rel.bassDrive)) * N;
    seaSurf(w.sea, N, t, w.off, base, g);
    const surf = (x) => surfAt(w.sea, x);
    farSea(W, w.sea, hz, w.off, base);
    if (w.kind === 'isles') for (let k = 0; k < 3; k++) { const d = 4 + 2 * k, span = 1.6 * N, x = ((((hash(k, 5) * span - w.off / d) % span) + span) % span) - 0.3 * N, wd = (0.5 * N) / d; r.poly([[x - wd, hz + 1], [x - wd * 0.4, hz - wd * 0.35], [x + wd * 0.3, hz - wd * 0.25], [x + wd, hz + 1]], DARK); }
    if (w.kind === 'fleet') for (let k = 0; k < 3; k++) { // ships at their distance, under way themselves
      const d = 2 + k, span = 1.6 * N, x = ((((hash(k, 6) * span - w.off / d + t * 0.01 * N) % span) + span) % span) - 0.3 * N, y = hz + (base - hz) / (d + 0.5), sc = (0.01 * N) / d;
      r.poly([[x - 6 * sc, y - sc], [x + 6 * sc, y - sc], [x + 4.5 * sc, y + 0.8 * sc], [x - 4.5 * sc, y + 0.8 * sc]], DARK);
      r.line(x, y - sc, x, y - 9 * sc, DARK);
      r.poly([[x + u, y - 8.5 * sc], [x + 4 * sc, y - 5 * sc], [x + u, y - 3 * sc]], LMID);
    }
    nearSea(W, w.sea, w.off, base);
    // the father: lower and behind, his beat a little after the son's; when the son is down he circles over the place
    const fp = frac(p - 0.15), circling = w.st === 'sea';
    const ftx = circling ? w.sx + 0.16 * N * Math.cos(t * 0.8) : 0.27 * N, fty = circling ? 0.42 * N + 0.05 * N * Math.sin(t * 0.8) : w.alt + 0.13 * N;
    w.dx = follow(w.dx ?? ftx, ftx, dt, circling ? 0.3 : 1.5); w.dy = follow(w.dy ?? fty, fty, dt, 0.8);
    const fdir = circling ? (Math.sin(t * 0.8) > 0 ? -1 : 1) : 1;
    flier(r, w.dx, w.dy + 0.01 * N * Math.cos(TAU * fp), ih, fdir, 0, wingEl(fp), u, 0, { beard: LMID });
    targets.push({ x: w.dx - 0.1 * N, y: w.dy - 0.08 * N, w: 0.2 * N, h: 0.16 * N });
    // the son: in flight, climbing as the music swells; the wax drips faster the bigger the sun and the higher he is
    if (w.st === 'fly') {
      w.alt = follow(w.alt, (0.48 - 0.16 * clamp(f.level)) * N, dt, 2);
      w.ix = follow(w.ix, 0.5 * N, dt, 1.2);
      w.iy = w.alt + 0.012 * N * Math.cos(TAU * p);
      const tilt = -0.12 + 0.25 * w.gust * Math.sin(t * 9), sh = flier(r, w.ix, w.iy, ih, 1, tilt, wingEl(p), u, w.lost);
      const heat = (w.rs / (0.1 * N)) * clamp(1.2 - Math.hypot(w.ix - sunX, w.iy - sunY) / N);
      for (let k = spawns(rnd, 10 * heat, dt); k > 0; k--) w.wax.push({ x: sh[0] + (rnd() - 0.6) * 0.04 * N, y: sh[1], vx: -0.02 * N, vy: 0, life: 4, s: mx1(u), c: LMID });
      targets.push({ x: w.ix - 0.1 * N, y: w.iy - 0.08 * N, w: 0.2 * N, h: 0.16 * N });
    } else if (w.st === 'fall') {
      // the fall: no more lift; his own speed carries him on as the camera is left to stop, gravity takes him down
      w.fvy += g * dt;
      w.fx += (w.fvx - w.vc) * dt;
      w.fy += w.fvy * dt;
      w.spin += 3.5 * dt;
      const P = turn(w.fx, w.fy, w.spin);
      rig(r, P, 0, 0.25 * ih, ih, 1, FIG, { legs: [[0.6, 0.4], [-0.5, 0.2]], arms: [[2.6, 0.2], [-2.4, 0.4]] });
      targets.push({ x: w.fx - 0.08 * N, y: w.fy - 0.08 * N, w: 0.16 * N, h: 0.16 * N });
      if (w.fvy > 0 && w.fy > surf(w.fx)) { w.st = 'sea'; w.sx = w.fx; splash(w.drops, rnd, w.fx, surf(w.fx), 40, 0.4 * N, BRIGHT, 0.5); for (let k = 0; k < 3; k++) w.rings.push({ x: w.fx, y: surf(w.fx), t: -k * 0.15 }); s.shake = Math.max(s.shake, 0.5); }
    }
    // the feathers: stripped back by the air, fluttering down, riding the water where they come down
    w.feathers = flutter(W, w.feathers, surf, -w.vc, 0.05 * N, BRIGHT, -w.vc).slice(-40);
    w.wax = ballistic(W, w.wax, g, surf, LMID, w.rings).slice(-60);
    w.drops = ballistic(W, w.drops, g, surf, BRIGHT, w.rings).slice(-120);
    w.rings = w.rings.filter((k) => { k.t += dt; k.x -= w.vc * dt; if (k.t > 0) circ(r, k.x, k.y, 1 + k.t * 0.1 * N, LMID, 0.25); return k.t < 1.2; });
  },
};
const countBits = (v) => { let n = 0; for (; v; v &= v - 1) n++; return n; };

// ---------------------------------------------------------------------------------------------- lilliput
// A giant lies on his back on a beach, pegged down by a people a twelfth his size: ropes from pegs in the sand over his
// chest and legs, his breath slowly lifting his chest. Little figures go up ladders against his side a rung a beat and
// walk about on him; a tiny cart comes along the sand drawn by a tiny horse, its wheels turning by their travel over
// their radius. On the kicks he strains at the ropes (they twang, the little ones on him bounce); on the snares the
// little hammers ring on the pegs, or, when the kind is the army, a volley of arrows flies its parabolas and sticks in
// his coat; on the notes his eye blinks. Farther up the beach is smaller and higher. A drop: he sits up, turning about
// his hips; the ropes over him snap and whip, the little people on him are thrown off along the tangent of the turn,
// tumbling, land in the sand and run for it. The next section he lies down again, they come back and tie him down
// again, a rope a beat.
const LILLI_W = { binding: [3, 2, 1], survey: [2, 2, 1], army: [0, 1, 3] };
// his outline lying on his back, head to the left: (x, height over the sand) in screens, the chest lifted by `br`
const GIANT = (br) => [[0.08, 0.02], [0.085, 0.07], [0.11, 0.1], [0.15, 0.11], [0.17, 0.12], [0.18, 0.15], [0.19, 0.12], [0.2, 0.115], [0.215, 0.11], [0.23, 0.07], [0.28, 0.12 + br], [0.36, 0.14 + br],
  [0.46, 0.12 + br * 0.5], [0.54, 0.1], [0.62, 0.08], [0.7, 0.075], [0.78, 0.06], [0.84, 0.05], [0.86, 0.11], [0.885, 0.09], [0.87, 0.0]];
const ROPES = [0.25, 0.32, 0.4, 0.48, 0.6, 0.68, 0.76, 0.83];
const lilliput = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, LILLI_W, bandOf(W.a)), up: 0, upT: -1, down: false, strain: 0, blink: 0, ropes: ROPES.map(() => ({ tied: true, snap: 0 })), arrows: [], stuck: [], folk: [], cart: { x: 1.1 * N, ph: 0, wheel: 0 } });
    for (const lx of [0.33, 0.64]) for (let k = 0; k < 2; k++) w.folk.push({ st: 'climb', lad: lx, rung: k * 3, x: lx * N, y: 0, ph: rnd() * TAU, dir: 1, vx: 0, vy: 0, spin: 0 });
    for (let k = 0; k < 3; k++) w.folk.push({ st: 'onbody', at: 0.3 + 0.18 * k, x: 0, y: 0, ph: rnd() * TAU, dir: k % 2 ? 1 : -1, vx: 0, vy: 0, spin: 0 });
    for (let k = 0; k < 4; k++) w.folk.push({ st: 'hammer', peg: k * 2 + 1, x: 0, y: 0, ph: 0, dir: 1, vx: 0, vy: 0, spin: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.3 * N, shore = 0.4 * N, g0 = 0.76 * N, G = 2.5 * N, B = bps(f), ph = frac(beatClock(w, f, dt));
    const lh = 0.045 * N, yAt = (d) => hz + (g0 - hz) / d, hipX = 0.54 * N, hipY = g0 - 0.05 * N;
    if (f.section === 'change') { w.kind = rollW(rnd, LILLI_W, band); if (w.up > 0.5) w.down = true; }
    if (f.section === 'drop' && w.upT < 0 && w.up < 0.05) { w.upT = 0; w.down = false; }
    let kick = 0, snare = 0;
    for (const h of hits) {
      if (isLow(h)) { kick = h.strength; w.strain = 1; }
      else if (h.kind === 'snare') snare = h.strength;
      if (isTonal(h)) w.blink = 0.15;
    }
    w.strain *= Math.exp(-dt * 4);
    w.blink -= dt;
    // sitting up: the trunk turns about the hips; lying down again on the next section
    const was = w.up;
    if (w.upT >= 0) { w.upT += dt; w.up = 1.25 * smooth(w.upT / 1.2); if (w.upT > 1.2) w.upT = -2; }
    if (w.down) { w.up = Math.max(0, w.up - dt * 0.6); if (w.up === 0) { w.down = false; w.upT = -1; } }
    const om = (w.up - was) / Math.max(dt, 1e-3), T = turn(hipX, hipY, w.up);
    const toScr = (x, y) => (x < hipX ? T(x - hipX, y - hipY) : [x, y]);
    // the beach and the sea beyond
    r.rect(0, hz, N, shore - hz, MID + DIM);
    for (let k = 1; k < 6; k++) r.rect(((hash(k, 1) * N + t * 0.01 * N) % N), hz + (shore - hz) * (k / 6), 0.1 * N / (7 - k), 1, LMID + DIM);
    r.rect(0, shore, N, N - shore, LMID);
    r.rect(0, shore, N, mx1(u), BRIGHT);
    for (let k = 0; k < 40; k++) { const y = shore + hash(k, 2) * (N - shore), sc = (y - hz) / (g0 - hz); r.rect(hash(k, 3) * N, y, mx1(1.5 * u * sc), mx1(u * 0.6 * sc), LMID + DIM); }
    // the giant: the outline turned about the hips as he sits up, the coat, the breeches, the stockings and shoes, the face
    const br = 0.008 * Math.sin(t * 0.8) + 0.006 * w.strain + 0.004 * clamp(f.rel.bassDrive), pts = GIANT(br).map(([x, h]) => toScr(x * N, g0 - h * N));
    r.poly([...pts, toScr(0.08 * N, g0)], LMID + DIM);
    const part = (x0, x1, c) => { const q = GIANT(br).filter(([x]) => x >= x0 && x <= x1).map(([x, h]) => toScr(x * N, g0 - h * N + u)); if (q.length > 1) r.poly([...q, toScr(x1 * N, g0 - 0.01 * N), toScr(x0 * N, g0 - 0.01 * N)], c); };
    part(0.08, 0.23, LMID); part(0.23, 0.54, DARK); part(0.54, 0.7, MID); part(0.7, 0.84, BRIGHT);
    { const e = toScr(0.125 * N, g0 - 0.055 * N); oval(r, e[0], e[1], 0.01 * N, 0.014 * N, LMID + DIM); const m = toScr(0.2 * N, g0 - 0.105 * N); r.rect(m[0] - u, m[1], mx1(2 * u), mx1(u * 0.6), DARK); } // the ear, the mouth
    for (const bx of [0.3, 0.36, 0.42]) { const b = toScr(bx * N, g0 - 0.12 * N); r.rect(b[0], b[1], mx1(u), mx1(u), BRIGHT); }
    { const a = toScr(0.84 * N, g0 - 0.05 * N), b = toScr(0.86 * N, g0 - 0.11 * N), c = toScr(0.885 * N, g0 - 0.09 * N), d = toScr(0.87 * N, g0); r.poly([a, b, c, d], FIG); }
    { const a = toScr(0.08 * N, g0 - 0.02 * N), b = toScr(0.085 * N, g0 - 0.07 * N), c = toScr(0.11 * N, g0 - 0.1 * N), d = toScr(0.12 * N, g0); r.poly([a, b, c, d], FIG); } // the hair
    const eye = toScr(0.165 * N, g0 - 0.1 * N);
    if (w.blink > 0 || w.up < 0.02) r.rect(eye[0] - u, eye[1], mx1(2 * u), mx1(u * 0.6), FIG); else { oval(r, eye[0], eye[1], 1.4 * u, 0.9 * u, BRIGHT); r.set(eye[0], eye[1], FIG); }
    const sh = toScr(0.28 * N, g0 - 0.05 * N), hand = toScr(0.5 * N, g0 - 0.03 * N);
    r.stroke(sh[0], sh[1], hand[0], hand[1], mx1(0.035 * N), DARK); // the near arm along his side
    oval(r, hand[0], hand[1], 0.02 * N, 0.015 * N, LMID + DIM);
    targets.push({ x: 0.09 * N, y: g0 - 0.15 * N - w.up * 0.3 * N, w: 0.8 * N, h: 0.15 * N + w.up * 0.3 * N });
    // the ropes: from pegs in the sand in front over his body (the far side is out of sight); a kick twangs them; the
    // ones over his trunk snap when he sits up, the ends whipping back; tied again, a rope a beat, once he lies down
    const relaxed = w.up === 0 && !w.down;
    for (const [i, rp] of w.ropes.entries()) {
      const x = ROPES[i] * N, top = GIANT(br).reduce((m, q, k, a) => (k && a[k - 1][0] * N <= x && q[0] * N >= x ? lerp(a[k - 1][1], q[1], (x - a[k - 1][0] * N) / ((q[0] - a[k - 1][0]) * N)) : m), 0.05) * N, peg = [x + 0.03 * N, g0 + 0.035 * N];
      r.rect(peg[0] - u * 0.5, peg[1] - 2 * u, mx1(u), 2.5 * u, DARK);
      if (rp.tied && w.up > 0.08 && x < hipX + 0.02 * N) { rp.tied = false; rp.snap = 1.2; }
      if (!rp.tied && relaxed && w.on && w.ropes.findIndex((q) => !q.tied) === i) rp.tied = true;
      if (rp.tied) { const at = toScr(x, g0 - top), mx2 = (peg[0] + at[0]) / 2 + Math.sin(t * 60) * w.strain * 1.5 * u, my2 = (peg[1] + at[1]) / 2; r.line(peg[0], peg[1], mx2, my2, BRIGHT); r.line(mx2, my2, at[0], at[1], BRIGHT); }
      else if (rp.snap > 0) { rp.snap -= dt; const q = rp.snap / 1.2, at = toScr(x, g0 - top); r.line(peg[0], peg[1], peg[0] - 0.02 * N * q, peg[1] - 0.04 * N * q * Math.abs(Math.cos(t * 20)), BRIGHT); r.line(at[0], at[1], at[0] + 0.01 * N, at[1] + 0.03 * N * (1 - q * 0.5), BRIGHT); }
      else r.line(peg[0], peg[1], peg[0] - 0.03 * N, peg[1] + 0.003 * N, BRIGHT);
    }
    // the ladders against his side, a rung a beat for the ones on them
    for (const lx of [0.33, 0.64]) {
      const x = lx * N, len = (lx < 0.5 ? 0.17 : 0.12) * N, foot = g0 + 0.04 * N, fall = lx < 0.5 ? clamp(w.up / 0.6) * 1.3 : 0, a = -Math.PI / 2 + 0.06 - fall; // the one at his chest is knocked over as he sits up, turning down about its foot
      const tx = x + Math.cos(a) * len, ty = foot + Math.sin(a) * len, nx = -Math.sin(a) * 0.01 * N, ny = Math.cos(a) * 0.01 * N;
      r.line(x - nx, foot - ny, tx - nx, ty - ny, DARK); r.line(x + nx, foot + ny, tx + nx, ty + ny, DARK);
      for (let k = 1; k < 6; k++) { const q = k / 6, px = lerp(x, tx, q), py = lerp(foot, ty, q); r.line(px - nx, py - ny, px + nx, py + ny, DARK); }
    }
    // the little people
    const surfTop = (x) => { const a = GIANT(br); for (let k = 1; k < a.length; k++) if (a[k - 1][0] * N <= x && a[k][0] * N >= x) return g0 - lerp(a[k - 1][1], a[k][1], (x - a[k - 1][0] * N) / ((a[k][0] - a[k - 1][0]) * N)) * N; return g0; };
    for (const p of w.folk) {
      if (w.upT > 0.35 && w.upT < 0.5 && (p.st === 'onbody' || (p.st === 'climb' && p.lad < 0.5))) {
        // thrown: off along the tangent of the turn at its rate (ω times the arm from the hips), plus the jolt of the ropes going
        const [px, py] = [p.x - hipX, p.y - hipY];
        Object.assign(p, { st: 'fly', vx: -om * py + (rnd() - 0.5) * 0.1 * N, vy: om * px - 0.25 * N * rnd(), spin: (rnd() - 0.5) * 12 });
      }
      if (p.st === 'climb') {
        if (w.on && w.up < 0.05) p.rung++;
        const x = p.lad * N, foot = g0 + 0.04 * N, top = g0 - (p.lad < 0.5 ? 0.13 : 0.08) * N, q = Math.min(1, (p.rung + smooth(ph / 0.4)) / 6);
        p.x = lerp(x, x + 0.006 * N, q); p.y = lerp(foot, top, q);
        mini(r, p.x, p.y, lh, FIG, q * 20, 1, 1);
        if (p.rung >= 6) { p.st = 'onbody'; p.at = p.lad + 0.02; p.dir = rnd() < 0.5 ? -1 : 1; }
      } else if (p.st === 'onbody') {
        // they walk about on him, a step a beat, turning at his ends; a kick bounces them
        p.at += (p.dir * stepLen(lh, 0.4) * B * dt) / N;
        if (p.at < 0.24 || p.at > 0.82) p.dir *= -1;
        p.ph += (stepLen(lh, 0.4) * B * dt * Math.PI) / stepLen(lh, 0.4);
        p.hop = Math.max(0, (p.hop ?? 0) - dt * 3);
        if (kick) p.hop = 0.3 * kick;
        const [x, y] = toScr(p.at * N, surfTop(p.at * N));
        p.x = x; p.y = y - Math.sin(p.hop * Math.PI / 0.3) * 0.02 * N * (p.hop > 0 ? 1 : 0);
        mini(r, p.x, p.y, lh, FIG, p.ph, p.dir);
      } else if (p.st === 'hammer') {
        // at a peg, the mallet coming down on it on the beat (and on the snares)
        const peg = [ROPES[p.peg] * N + 0.03 * N, g0 + 0.035 * N], sw = ph < 0.15 ? 0 : ph > 0.6 ? 1 - ((ph - 0.6) / 0.4) ** 2 : (ph - 0.15) / 0.45, hit = snare && w.kind !== 'army';
        p.x = peg[0] + 0.012 * N; p.y = peg[1] + 0.01 * N;
        mini(r, p.x, p.y, lh * 1.05, FIG, 0, -1, hit ? 0 : sw);
        r.line(p.x - 0.004 * N, p.y - lh * 0.75, p.x - 0.01 * N, p.y - lh * (0.75 + 0.4 * (hit ? 0 : sw)), DARK);
        if (!relaxed && w.up > 0.5) { p.st = 'run'; p.dir = 1; }
      } else if (p.st === 'fly') {
        p.vy += G * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.ang = (p.ang ?? 0) + p.spin * dt;
        const P = turn(p.x, p.y - lh * 0.5, p.ang);
        strokeP(r, P, 0, -lh * 0.5, 0, lh * 0.3, mx1(u * 0.8), FIG); strokeP(r, P, -lh * 0.3, -lh * 0.1, lh * 0.3, -lh * 0.2, mx1(u * 0.6), FIG);
        if (p.vy > 0 && p.y >= g0 + 0.02 * N) { p.y = g0 + 0.02 * N; p.st = 'run'; p.dir = p.x < hipX ? -1 : 1; }
      } else if (p.st === 'run') {
        // run for it, out of the picture
        const v = stepLen(lh, 0.7) * B * 2;
        p.x += p.dir * v * dt; p.ph += (v * dt * Math.PI) / stepLen(lh, 0.7);
        mini(r, p.x, p.y, lh, FIG, p.ph, p.dir, 1);
        if (p.x < -0.05 * N || p.x > 1.05 * N) p.st = 'gone';
      } else if (p.st === 'gone' && relaxed && w.on && rnd() < 0.5) {
        // back once he is down, walking in from the side they ran out at: to a peg, or to a ladder's foot and up it
        Object.assign(p, { st: 'back', x: p.x < hipX ? -0.04 * N : 1.04 * N, y: g0 + 0.04 * N, lad: rnd() < 0.5 ? 0.33 : 0.64, rung: 0 });
      } else if (p.st === 'back') {
        const gx = p.peg !== undefined ? ROPES[p.peg] * N + 0.042 * N : p.lad * N, d = gx - p.x, v = Math.min(Math.abs(d), stepLen(lh, 0.4) * B * dt);
        p.dir = Math.sign(d) || 1; p.x += p.dir * v; p.ph += (v * Math.PI) / stepLen(lh, 0.4);
        mini(r, p.x, p.y, lh, FIG, p.ph, p.dir);
        if (Math.abs(d) < 0.004 * N) p.st = p.peg !== undefined ? 'hammer' : 'climb';
      }
    }
    // the army: a line of archers on the sand in front; a snare lets fly a volley, each arrow along its parabola, nose
    // along its path, sticking where it meets his coat
    if (w.kind === 'army') {
      for (let k = 0; k < 3; k++) { // past his feet, shooting up and over at him
        const ax = (0.91 + 0.03 * k) * N, ay = g0 + 0.01 * N * k;
        mini(r, ax, ay, lh, FIG, 0, -1, 0.6);
        r.line(ax - 0.008 * N, ay - lh * 1.1, ax - 0.012 * N, ay - lh * 0.3, DARK);
        if (snare && w.up < 0.05) w.arrows.push({ x: ax - 0.01 * N, y: ay - lh, vx: -(0.2 + 0.3 * rnd()) * N, vy: -(0.7 + 0.15 * rnd()) * N });
      }
      w.arrows = w.arrows.filter((a) => {
        a.vy += G * dt; a.x += a.vx * dt; a.y += a.vy * dt;
        const an = Math.atan2(a.vy, a.vx);
        r.line(a.x, a.y, a.x - Math.cos(an) * 2.5 * u, a.y - Math.sin(an) * 2.5 * u, FIG);
        if (a.vy > 0 && a.y >= surfTop(a.x)) { if (a.x > 0.23 * N && a.x < 0.84 * N && w.stuck.length < 30) w.stuck.push({ x: a.x, a: an, life: 6 }); return false; }
        return a.y < N;
      });
    } else w.arrows.length = 0;
    w.stuck = w.stuck.filter((k) => { k.life -= dt; const [x, y] = toScr(k.x, surfTop(k.x)); r.line(x, y, x - Math.cos(k.a) * 2 * u, y - Math.sin(k.a) * 2 * u, FIG); return k.life > 0; });
    // the cart along the sand in front: a tiny horse at a walk, the wheels turning by their travel over their radius
    const C = w.cart, cd = 0.8, cy = yAt(cd), sc = 1 / cd, wr = 0.012 * N * sc, run = w.up > 0.3 ? 3 : 1, v = stepLen(lh, 0.4) * B * 0.8 * sc * run;
    C.x -= v * dt; C.wheel -= (v * dt) / wr; C.ph += (v * dt * TAU) / (2 * Math.sin(0.4) * 0.62 * 0.06 * N * sc);
    if (C.x < -0.25 * N) C.x = 1.15 * N;
    beast(r, C.x - 0.06 * N * sc, cy, 0.06 * N * sc, -1, FIG, C.ph, { gait: run > 1 ? 'gallop' : 'walk' });
    r.line(C.x - 0.03 * N * sc, cy - 0.025 * N * sc, C.x, cy - 0.02 * N * sc, DARK);
    r.rect(C.x, cy - 0.04 * N * sc, 0.07 * N * sc, 0.022 * N * sc, MID);
    oval(r, C.x + 0.035 * N * sc, cy - 0.05 * N * sc, 0.022 * N * sc, 0.014 * N * sc, DARK); // a cask
    for (const k of [0.015, 0.055]) { const wx = C.x + k * N * sc, wy = cy - wr; circ(r, wx, wy, wr, FIG); for (let j = 0; j < 3; j++) { const a = C.wheel + (j * Math.PI) / 3; r.line(wx - Math.cos(a) * wr, wy - Math.sin(a) * wr, wx + Math.cos(a) * wr, wy + Math.sin(a) * wr, FIG); } }
    targets.push({ x: C.x - 0.1 * N * sc, y: cy - 0.07 * N * sc, w: 0.17 * N * sc, h: 0.07 * N * sc });
  },
};

// ---------------------------------------------------------------------------------------------- raven
// A chamber at midnight: a man asleep over his book in a wing chair by a dying fire (the embers rising off it and
// slowing as they cool), velvet curtains stirring with the treble at the window, a lamp on the wall above the door, the
// one light. On a pale bust over the door, a raven. A kick is a tapping: the door shudders on its hinges, dust falls
// from the lintel, the raven turns its head to it and the sleeper lifts his; a snare spreads the raven's wings; a note
// brightens the lamp; the clock on the mantel beats the time with a pendulum the length of the beat, and the sleeper's
// head sinks on each beat. The kind is the night at the window: still with stars, snowing, or a storm with lightning
// on the hard snares. A drop: the raven flies across the room and back to the bust, nearer and bigger on the way,
// and its shadow goes over the floor where the line from the lamp through the bird meets it (only while it is below
// the lamp, so the line comes down).
const NIGHT_W = { still: [2, 2, 1], snow: [3, 1, 1], storm: [0, 2, 3] };
// the raven at (x, y), `sz` its length, facing `dir`: the body, the head turned by `look` (radians, down positive),
// the wings folded or spread by `spread` (0..1) or beating in flight with `flap`
function ravenBird(r, x, y, sz, dir, look, spread, flap, u, fly = false) {
  const c = BLACK;
  if (spread > 0.05 || fly) for (const k of [-1, 1]) { const el = fly ? flap : spread, wx = x - dir * sz * 0.05 + k * 0, wy = y - sz * 0.1; r.poly([[wx - sz * 0.15, wy], [wx + sz * 0.15, wy], [wx + k * sz * 0.9 * (0.5 + 0.5 * spread), wy - sz * 0.75 * el], [wx + k * sz * 0.7 * (0.5 + 0.5 * spread), wy - sz * 0.45 * el + sz * 0.12]], c); }
  r.poly(fly ? [[x - dir * sz * 0.5, y + sz * 0.02], [x + dir * sz * 0.3, y - sz * 0.08], [x + dir * sz * 0.3, y + sz * 0.08], [x - dir * sz * 0.5, y + sz * 0.1]]
    : [[x - dir * sz * 0.2, y - sz * 0.25], [x + dir * sz * 0.25, y - sz * 0.2], [x + dir * sz * 0.1, y + sz * 0.2], [x - dir * sz * 0.35, y + sz * 0.45]], c); // the body (and the tail)
  const hx = x + dir * sz * (fly ? 0.38 : 0.25), hy = y - sz * (fly ? 0.05 : 0.28);
  oval(r, hx, hy, sz * 0.13, sz * 0.12, c);
  const ba = look, bl = sz * 0.22;
  r.poly([[hx + dir * sz * 0.08, hy - sz * 0.05], [hx + dir * (sz * 0.08 + Math.cos(ba) * bl), hy + Math.sin(ba) * bl], [hx + dir * sz * 0.06, hy + sz * 0.05]], c);
  r.set(hx + dir * sz * 0.03, hy - sz * 0.03, BRIGHT);
  if (!fly) for (const k of [-0.05, 0.08]) r.line(x + dir * sz * k, y + sz * 0.15, x + dir * sz * k, y + sz * 0.3, c);
}
const raven = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, NIGHT_W, bandOf(W.a)), door: { x: 0, v: 0 }, look: 0, spread: 0, wake: 0, lamp: 0, flyT: -1, flash: 0, bolt: 0, dust: [], sparks: [], flakes: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), yf = 0.72 * N, yh = 0.36 * N, G = 1.6 * N, buf = r.buf;
    const bc = beatClock(w, f, dt), ph = frac(bc);
    if (f.section === 'change') w.kind = rollW(rnd, NIGHT_W, band);
    if (f.section === 'drop' && w.flyT < 0) w.flyT = 0;
    for (const h of hits) {
      if (isLow(h)) { w.door.v += 0.9 * N * h.strength; w.look = 1; w.wake = 1; for (let k = 0; k < 6; k++) w.dust.push({ x: (0.6 + 0.18 * rnd()) * N, y: 0.3 * N, vx: (rnd() - 0.5) * 0.02 * N, vy: 0, life: 2, c: LMID + DIM }); }
      else if (h.kind === 'snare') { w.spread = 1; if (w.kind === 'storm' && h.strength > 0.6) { w.flash = 0.08; w.bolt = 0.15; } }
      if (isTonal(h)) w.lamp = 1;
    }
    // the door rattles on its hinges and settles: a stiff spring (ω = 30/s) stepped finely, so a long frame cannot blow it up
    for (let k = 0, n = Math.ceil(dt / 0.01), h = dt / n; k < n; k++) { w.door.v += (-900 * w.door.x - 30 * w.door.v) * h; w.door.x += w.door.v * h; }
    w.look *= Math.exp(-dt * 1.5); w.spread *= Math.exp(-dt * 2.5); w.wake *= Math.exp(-dt * 1.2); w.lamp *= Math.exp(-dt * 2); w.flash -= dt; w.bolt -= dt;
    // the room: the wall with its paper, the floor in perspective with the lamplight lying on it, the window and the night
    r.rect(0, 0, N, yf, DARK);
    for (let y = Math.round(0.04 * N); y < yf; y += Math.round(0.06 * N)) for (let x = Math.round(((y / Math.round(0.06 * N)) % 2) * 0.03 * N); x < N; x += Math.round(0.06 * N)) r.set(x, y, DARK + DIM);
    const lx = 0.69 * N, ly = 0.04 * N, pool = (0.3 + 0.1 * w.lamp) * N; // the lamp: on the wall over the door, its light on the floor below
    for (let y = Math.round(yf); y < N; y++) {
      const row = y * N, zf = (0.36 * N) / (y - yh);
      for (let x = 0; x < N; x++) { const X = 0.5 * N + (x - 0.5 * N) * zf, d = Math.hypot(X - lx, (1 - zf) * 0.8 * N); buf[row + x] = d < pool * (0.5 + 0.5 * bayer(x, y)) ? MID + DIM : DARK + DIM; }
    }
    for (let k = -6; k <= 6; k++) r.line(0.5 * N + k * 0.04 * N, yf, 0.5 * N + k * 0.16 * N, N, DARK); // the boards, running to the vanishing point
    r.rect(0, yf, N, mx1(u), LMID + DIM);
    const wx0 = 0.04 * N, wx1 = 0.18 * N, wy0 = 0.1 * N, wy1 = 0.46 * N;
    r.rect(wx0, wy0, wx1 - wx0, wy1 - wy0, w.flash > 0 ? WHITE : BLACK);
    if (w.flash <= 0) {
      stars(r, N, 8, 90, wy0, wy1 * 0.8, LMID);
      for (let k = 0; k < 8; k++) { const x = wx0 + hash(k, 91) * (wx1 - wx0), y = wy0 + hash(k, 92) * (wy1 - wy0) * 0.7; if (hash(k, Math.floor(t * 2)) > 0.2) r.set(x, y, LMID); }
      if (w.kind === 'snow') for (let k = 0; k < 24; k++) { const y = wy0 + ((hash(k, 93) * (wy1 - wy0) + t * 0.05 * N) % (wy1 - wy0)), x = wx0 + ((hash(k, 94) * (wx1 - wx0) + Math.sin(t + k) * 2 * u + (wx1 - wx0)) % (wx1 - wx0)); r.set(x, y, BRIGHT); }
      if (w.kind === 'storm') for (let k = 0; k < 14; k++) { const y = wy0 + ((hash(k, 95) * (wy1 - wy0) + t * 0.6 * N) % (wy1 - wy0)), x = wx0 + ((((hash(k, 96) + (y - wy0) / 3 / (wx1 - wx0 - 2 * u)) % 1) + 1) % 1) * (wx1 - wx0 - 2 * u); r.line(x, y, x + u, Math.min(wy1 - 1, y + 3 * u), LMID); } // each falls along its slant
      if (w.bolt > 0) r.line(wx0 + 0.04 * N, wy0, wx0 + 0.07 * N, wy1, WHITE);
    }
    r.rect((wx0 + wx1) / 2 - u * 0.5, wy0, mx1(u), wy1 - wy0, DARK);
    r.rect(wx0, (wy0 + wy1) / 2, wx1 - wx0, mx1(u), DARK);
    r.frame(Math.round(wx0), Math.round(wy0), Math.round(wx1 - wx0), Math.round(wy1 - wy0), LMID + DIM);
    // the curtains, hung from a rod, swaying more toward the hem the more the treble stirs them
    const A = (0.004 + 0.02 * clamp(f.rel.trebDrive)) * N;
    r.rect(0.01 * N, 0.08 * N, 0.21 * N, mx1(u), LMID);
    for (const [c0, c1] of [[0.015, 0.06], [0.16, 0.21]]) for (let y = Math.round(0.08 * N); y < 0.62 * N; y++) {
      const q = (y - 0.08 * N) / (0.54 * N), dx = A * q * q * Math.sin(t * 3 + q * 4 + c0 * 40);
      r.rect(c0 * N + dx, y, (c1 - c0) * N, 1, HOT + DIM);
      for (let k = 1; k < 3; k++) r.set(c0 * N + dx + (k * (c1 - c0) * N) / 3, y, DARK);
    }
    // the fireplace: the mantel, the clock on it beating the time, the grate with the last embers glowing, rising and
    // slowing up the chimney
    const fx0 = 0.25 * N, fx1 = 0.43 * N, fy0 = 0.5 * N;
    r.rect(fx0, fy0, fx1 - fx0, yf - fy0, MID + DIM);
    r.rect(fx0 + 0.02 * N, fy0 + 0.04 * N, fx1 - fx0 - 0.04 * N, yf - fy0 - 0.04 * N, BLACK);
    r.rect(fx0 - 0.015 * N, fy0, fx1 - fx0 + 0.03 * N, 0.015 * N, LMID);
    for (let k = 0; k < 8; k++) { const ex = fx0 + 0.035 * N + hash(k, 101) * (fx1 - fx0 - 0.07 * N), glow = 0.5 + 0.5 * Math.sin(t * 2 + k * 1.7); r.rect(ex, yf - 0.012 * N - hash(k, 102) * 0.01 * N, mx1(1.5 * u), mx1(u), glow > 0.7 ? BRIGHT : glow > 0.3 ? HOT : HOT + DIM); }
    if (rnd() < dt * 3 || w.on) w.sparks.push({ ...ember(rnd, fx0 + 0.05 * N + rnd() * 0.08 * N, yf - 0.015 * N, N, 0.6), vt: -0.015 * N });
    w.sparks = embers(W, w.sparks.filter((e) => e.y > fy0 + 0.045 * N)).slice(-20);
    const ck = 0.34 * N, cl = beatPendulum(f, G, 2 * u, 0.04 * N), ca = 0.3 * Math.cos(Math.PI * bc);
    r.rect(ck - 0.02 * N, fy0 - 0.075 * N, 0.04 * N, 0.075 * N, DARK + DIM);
    oval(r, ck, fy0 - 0.058 * N, 0.012 * N, 0.012 * N, LMID);
    r.line(ck, fy0 - 0.04 * N, ck + Math.sin(ca) * cl, fy0 - 0.04 * N + Math.cos(ca) * cl, LMID);
    // the door, rattling in its frame, the lintel, the bust on it, the lamp over it
    const dx0 = 0.6 * N, dx1 = 0.78 * N, dy0 = 0.42 * N, dd = w.door.x;
    r.rect(dx0 - 0.015 * N, dy0 - 0.015 * N, dx1 - dx0 + 0.03 * N, yf - dy0 + 0.015 * N, MID + DIM);
    r.rect(dx0 + dd, dy0, dx1 - dx0, yf - dy0, DARK + DIM);
    for (const [px, py] of [[0.02, 0.025], [0.1, 0.025], [0.02, 0.15], [0.1, 0.15]]) r.frame(Math.round(dx0 + dd + px * N), Math.round(dy0 + py * N), Math.round(0.06 * N), Math.round(0.1 * N), DARK);
    oval(r, dx0 + dd + 0.155 * N, dy0 + 0.14 * N, mx1(u), mx1(u), BRIGHT);
    r.rect(dx0 - 0.03 * N, dy0 - 0.03 * N, dx1 - dx0 + 0.06 * N, 0.015 * N, LMID);
    const bx = 0.69 * N, by = dy0 - 0.03 * N;
    r.rect(bx - 0.025 * N, by - 0.02 * N, 0.05 * N, 0.02 * N, LMID);
    r.poly([[bx - 0.04 * N, by - 0.02 * N], [bx + 0.04 * N, by - 0.02 * N], [bx + 0.025 * N, by - 0.05 * N], [bx - 0.025 * N, by - 0.05 * N]], BRIGHT);
    r.rect(bx - 0.008 * N, by - 0.065 * N, 0.016 * N, 0.02 * N, BRIGHT);
    oval(r, bx, by - 0.082 * N, 0.018 * N, 0.022 * N, BRIGHT);
    r.poly([[bx - 0.02 * N, by - 0.095 * N], [bx + 0.02 * N, by - 0.1 * N], [bx + 0.005 * N, by - 0.13 * N]], LMID); // the crest of a helmet
    r.line(lx, ly - 0.02 * N, lx, ly + 0.01 * N, DARK + DIM);
    oval(r, lx, ly + 0.012 * N, 0.012 * N, 0.008 * N, MID);
    oval(r, lx, ly, mx1(u * (1.5 + w.lamp)), mx1(u * (2 + w.lamp)), w.lamp > 0.4 ? WHITE : BRIGHT);
    haze(r, lx, ly, (0.05 + 0.03 * w.lamp) * N, LMID + DIM, 0.12);
    // the sleeper in his wing chair facing the fire: his head sinks on each beat and lifts again; the tapping wakes him a little
    const cx = 0.5 * N, nod = 0.45 * (1 - w.wake) * (0.6 + 0.4 * Math.exp(-ph * 3));
    r.rect(cx - 0.02 * N, yf - 0.24 * N, 0.07 * N, 0.24 * N, DARK + DIM);
    rig(r, ID, cx - 0.01 * N, yf - 0.1 * N, 0.22 * N, -1, FIG, { sit: true, lean: -0.15 + 0.1 * w.wake, nod, legs: [[1.4, 1.4], [1.3, 1.3]], arms: [[0.9, 0.9], [0.7, 1.0]] });
    r.rect(cx - 0.1 * N, yf - 0.12 * N, 0.05 * N, mx1(1.5 * u), BRIGHT); // the open book
    r.rect(cx - 0.07 * N, yf - 0.1 * N, 0.11 * N, 0.04 * N, DARK + DIM);
    r.rect(cx + 0.03 * N, yf - 0.2 * N, 0.025 * N, 0.2 * N, DARK + DIM);
    targets.push({ x: cx - 0.08 * N, y: yf - 0.24 * N, w: 0.14 * N, h: 0.24 * N });
    // the raven: on the bust, its head turning to the tapping, the wings spread on a snare; on the drop it flies the room
    // and comes back. Where it is in the room: (X, height Y over the floor, depth z, 1 at the wall), seen in perspective
    const perch = { X: 0.5 * N + (bx - 0.5 * N) * 0.9, Y: yf - (by - 0.1 * N) - 0.1 * (by - 0.1 * N - yh), z: 0.9 };
    let R = perch, fly = false, dir = -1;
    if (w.flyT >= 0) {
      const T = 2.8, q = smooth((w.flyT += dt) / T);
      if (w.flyT > T) w.flyT = -1;
      R = { X: perch.X - 0.5 * N * Math.sin(Math.PI * q) ** 2, Y: perch.Y - 0.1 * N * Math.sin(Math.PI * q), z: perch.z - 0.12 * Math.sin(Math.PI * q) };
      fly = w.flyT > 0 && w.flyT < T - 0.1;
      dir = q < 0.5 ? -1 : 1;
    }
    const scr = (X, Y, z) => [0.5 * N + (X - 0.5 * N) / z, yh + (0.36 * N - Y) / z];
    const [rx, ry] = scr(R.X, R.Y, R.z), rsz = (0.07 * N) / R.z;
    // its shadow: the line from the lamp's flame through the bird, carried on down to the floor (Y = 0)
    const L3 = { X: lx, Y: yf - ly, z: 1 };
    if (R.Y < L3.Y - 0.01 * N) {
      const k = L3.Y / (L3.Y - R.Y), sX = L3.X + k * (R.X - L3.X), sz = L3.z + k * (R.z - L3.z);
      if (sz > 0.57) { // the bird laid flat along the floor, as much bigger than it as the lamp is nearer to it than to the floor
        const [sx, sy] = scr(sX, 0, sz), ssz = (rsz * k * R.z) / sz, op = fly ? Math.abs(Math.sin(t * 30)) : w.spread;
        oval(r, sx, sy, ssz * 0.3, ssz * 0.06, BLACK);
        oval(r, sx + dir * ssz * 0.3, sy - ssz * 0.01, ssz * 0.08, ssz * 0.04, BLACK);
        r.poly([[sx - dir * ssz * 0.2, sy], [sx - dir * ssz * 0.5, sy - ssz * 0.05], [sx - dir * ssz * 0.5, sy + ssz * 0.05]], BLACK);
        if (op > 0.1) for (const k2 of [-1, 1]) r.poly([[sx - ssz * 0.12, sy - ssz * 0.02], [sx + ssz * 0.12, sy - ssz * 0.02], [sx + k2 * ssz * 0.85 * op, sy + ssz * 0.03]], BLACK);
      }
    }
    ravenBird(r, rx, ry, rsz, dir, fly ? 0.2 : 0.3 + 0.9 * w.look, fly ? 1 : w.spread, fly ? Math.sin(t * 30) : 0, u, fly);
    targets.push({ x: rx - rsz * 0.6, y: ry - rsz * 0.6, w: rsz * 1.2, h: rsz });
    w.dust = ballistic(W, w.dust, G * 0.3, () => yf, LMID + DIM).slice(-30);
  },
};

// ---------------------------------------------------------------------------------------------- sisyphus
// A man pushes a boulder up a long bare hill, a shove each beat: the boulder rolls up the slope by a stride, turning by
// the distance over its radius, and he takes a step with it; a snare and it slips back a little, rolling back and
// dragging him, his feet skidding in the dust; a kick is the thud of his weight going in; the hats knock pebbles loose
// that bounce down the slope. Near the top he holds it there, straining, until a drop: then it gets away from him and
// rolls all the way down, quicker and quicker (a rolling ball gains 5/7 g sin θ), leaping off the ledges and coming
// down again with less each time, out onto the flat where it rolls to a stop against the rocks; he turns and walks
// down after it, a step a beat, and begins again. The kind is the sky: ash under a white sun, the red of the underworld
// with its river of fire below, the night with stars and a moon.
const HILL_W = { ash: [2, 2, 1], tartarus: [1, 2, 3], night: [2, 1, 1] };
const sisyphus = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, HILL_W, bandOf(W.a)), sb: 0.05 * N, v: 0, hop: 0, hv: 0, anim: null, st: 'push', mx: 0, mph: 0, dir: 1, strain: 0, pebbles: [], dust: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = 0.6 * N, B = bps(f), R = 0.075 * N, mh = 0.2 * N;
    const bc = beatClock(w, f, dt), x0 = 0.22 * N, y0 = 0.88 * N, x1 = 0.84 * N, y1 = 0.42 * N, th = Math.atan2(y0 - y1, x1 - x0), S = Math.hypot(x1 - x0, y0 - y1), ex = Math.cos(th), ey = -Math.sin(th);
    // the ground as one path: the gentle bank on the left (s < 0) rising from the foot, the slope (0..S), the crest beyond
    const ph2 = Math.atan(0.35), ground = (sv) => (sv < 0 ? [x0 + sv * Math.cos(ph2), y0 + sv * Math.sin(ph2), Math.sin(ph2), -Math.cos(ph2)] : sv <= S ? [x0 + sv * ex, y0 + sv * ey, -Math.sin(th), -Math.cos(th)] : [x1 + (sv - S), y1, 0, -1]);
    const groundY = (x) => (x < x0 ? y0 - (x0 - x) * 0.35 : x < x1 ? y0 + ((x - x0) / (x1 - x0)) * (y1 - y0) : x < 0.93 * N ? y1 : y1 + (x - 0.93 * N) * 2.5);
    if (f.section === 'change') w.kind = rollW(rnd, HILL_W, band);
    if (f.section === 'drop' && w.st === 'push') { w.st = 'roll'; w.v = 0; w.anim = null; }
    let kick = 0, snare = 0;
    for (const h of hits) {
      if (isLow(h)) kick = h.strength;
      else if (h.kind === 'snare') snare = h.strength;
      else if (h.kind === 'hat' && rnd() < 0.5) { const p = ground(w.sb - R * 1.6); w.pebbles.push({ x: p[0], y: p[1] - 2 * u, vx: -0.05 * N, vy: -0.05 * N, life: 6 }); }
    }
    // the sky by the kind
    const night = w.kind === 'night', tart = w.kind === 'tartarus';
    if (night) { nightSky(r, 0, y0, 0.9); stars(r, N, 40, 7, 0, 0.6 * N, LMID, Math.floor(t * 2)); oval(r, 0.2 * N, 0.16 * N, 0.04 * N, 0.04 * N, BRIGHT); oval(r, 0.215 * N, 0.15 * N, 0.034 * N, 0.034 * N, DARK + DIM); }
    else if (tart) { for (let y = Math.round(0.3 * N); y < y0; y++) for (let x = 0; x < N; x++) if (bayer(x, y) < ((y - 0.3 * N) / (0.6 * N)) * 0.7) r.buf[y * N + x] = HOT + DIM; }
    else { oval(r, 0.18 * N, 0.15 * N, 0.045 * N, 0.045 * N, BRIGHT); circ(r, 0.18 * N, 0.15 * N, 0.058 * N, LMID); }
    for (let x = 0; x < N; x++) vcol(r, x, 0.62 * N - 0.06 * N * (0.5 + 0.5 * Math.sin(x * 0.03 + 2)) - 0.03 * N * Math.sin(x * 0.11), y0, tart ? DARK : MID + DIM); // the far hills
    // the hill: its flank in hatching, the crest, the flat at its foot, the rocks the boulder ends against
    for (let x = 0; x < N; x++) { const gy = groundY(x); vcol(r, x, gy, N, tart ? DARK + DIM : DARK); if (x % 3 === 0) vcol(r, x, gy + 2 * u, gy + 4 * u + hash(x, 4) * 4 * u, tart ? DARK : MID + DIM); }
    r.line(x0, y0, x1, y1, LMID); r.line(0, y0 - x0 * 0.35, x0, y0, LMID); r.line(x1, y1, 0.93 * N, y1, LMID);
    for (const sl of [0.66, 0.42, 0.2]) { const p = ground(sl * S); r.rect(p[0] - 2 * u, p[1] - 1.5 * u, 4 * u, 1.5 * u, LMID); } // the ledges
    if (tart) for (let x = 0; x < N; x += 2) r.rect(x, 0.95 * N + Math.sin(x * 0.3 + t * 3) * u, 2, mx1(u), hash(x, Math.floor(t * 6)) < 0.5 ? HOT : BRIGHT); // the river of fire
    // the boulder: shoved a stride up the slope each beat (eased through the first part of the beat), slipping back on a
    // snare; held near the top; free on the drop, rolling down at 5/7 g sin θ and leaping off the ledges, through the
    // foot and up the bank and back, losing some each time, till it lies still in the hollow
    const top = S - 2.2 * R, step = (S - 0.1 * N) / 26;
    if (w.st === 'push') {
      const pushing = w.mx >= w.sb - R - 0.09 * N; // he is at it
      if (w.on && pushing && w.sb < top) w.anim = { from: w.sb, to: Math.min(top, w.sb + step), t0: t, dur: 0.6 / B };
      if (snare && pushing && w.sb > 0.05 * N) w.slip = { at: t + 0.22, k: snare }; // the shove first, then it slips back under him
      if (w.slip && t >= w.slip.at) { w.anim = { from: w.sb, to: Math.max(0, w.sb - step * 0.45 * w.slip.k), t0: t, dur: 0.25 }; w.slip = null; const fp = ground(w.mx); for (let k = 0; k < 4; k++) w.dust.push({ x: fp[0] + (rnd() - 0.5) * 0.04 * N, y: groundY(fp[0]), vx: -0.03 * N, vy: -0.02 * N, life: 1, age: 0, s: 1.5 * u }); }
      if (w.anim) { const q = (t - w.anim.t0) / w.anim.dur; w.sb = lerp(w.anim.from, w.anim.to, smooth(q)); if (q >= 1) w.anim = null; }
      w.strain = w.sb >= top - 1 ? 1 : 0;
    } else if (w.st === 'roll') {
      w.v += ((w.sb >= 0 ? -(5 / 7) * g * Math.sin(th) : (5 / 7) * g * Math.sin(ph2)) - Math.sign(w.v) * 0.03 * g) * dt;
      const was = w.sb;
      w.sb += w.v * dt;
      for (const sl of [0.66, 0.42, 0.2]) if (was > sl * S && w.sb <= sl * S && w.hop <= 0) w.hv = Math.abs(w.v) * 0.35; // off a ledge
      if ((was >= 0) !== (w.sb >= 0)) { w.v *= 0.6; if (Math.abs(w.v) > 0.08 * N) { w.hv = Math.max(w.hv, Math.abs(w.v) * 0.25); s.shake = Math.max(s.shake, 0.3); } } // through the kink at the foot
      if (Math.abs(w.sb) < 0.03 * N && Math.abs(w.v) < 0.06 * N) { w.v *= Math.exp(-dt * 6); w.sb *= Math.exp(-dt * 3); if (Math.abs(w.v) < 0.004 * N && w.hop <= 0 && w.hv === 0) w.st = 'walk'; } // settling in the hollow
    }
    if (w.hv !== 0 || w.hop > 0) { w.hv -= g * Math.cos(w.sb < 0 ? 0 : th) * dt; w.hop += w.hv * dt; if (w.hop <= 0) { w.hop = 0; w.hv = w.hv < -0.05 * N ? -w.hv * 0.35 : 0; if (w.hv) s.shake = Math.max(s.shake, 0.2); } }
    const gp = ground(w.sb), bxp = gp[0] + gp[2] * (R + w.hop), byp = gp[1] + gp[3] * (R + w.hop), rot = w.sb / R;
    // the man: behind the boulder leaning into it, a step a stride; walking down after it; going round it to begin again
    let mDir = 1, lean = 0, legs, arms, mxGoal;
    if (w.st === 'push') { mxGoal = w.sb - R - 0.07 * N; w.mx = mxGoal; mDir = 1; lean = 0.75; }
    else if (w.st === 'roll') { mxGoal = w.mx; mDir = 1; lean = 0.2; }
    else { mxGoal = w.sb - R - 0.07 * N; mDir = -1; const d = mxGoal - w.mx, v = stepLen(mh, 0.4) * B; w.mx += Math.sign(d) * Math.min(Math.abs(d), v * dt); w.mph += (Math.min(Math.abs(d), v * dt) * Math.PI) / stepLen(mh, 0.4); if (Math.abs(d) < 0.003 * N) { w.st = 'push'; w.anim = null; } }
    if (w.st === 'push') { w.mph = (w.mx / stepLen(mh, 0.4)) * Math.PI; legs = [[0.5 + 0.35 * Math.sin(w.mph), 0.7], [-0.4 - 0.25 * Math.sin(w.mph), 0.15]]; arms = [[1.6 + 0.05 * w.strain * Math.sin(t * 40), 0.15], [1.5, 0.2]]; }
    else if (w.st === 'walk') { legs = gaitLegs(w.mph, 0.4); arms = gaitArms(w.mph, 0.4); }
    else { legs = [[0.2, 0.2], [-0.1, 0.1]]; arms = [[2.4, 0.3], [2.2, 0.4]]; }
    const mp = ground(w.mx), mg = groundY(mp[0]);
    if (kick && w.st === 'push') for (let k = 0; k < 3; k++) w.dust.push({ x: mp[0] - 0.02 * N, y: mg, vx: -0.04 * N * rnd(), vy: -0.03 * N, life: 1, age: 0, s: 1.5 * u });
    const drawMan = () => { const M = rig(r, ID, mp[0], mg, mh, mDir, FIG, { lean, nod: w.st === 'push' ? -0.3 : 0.2, legs, arms }); targets.push({ x: mp[0] - mh * 0.3, y: mg - mh, w: mh * 0.6, h: mh }); return M; };
    if (w.st === 'walk') drawMan(); // going down past it he is behind it; pushing, in front
    oval(r, bxp, byp, R, R, MID);
    circ(r, bxp, byp, R, DARK);
    for (let k = 0; k < 5; k++) { const a = rot + k * 1.257, q = 0.35 + 0.3 * (k % 2); r.line(bxp + Math.cos(a) * R * q, byp + Math.sin(a) * R * q, bxp + Math.cos(a + 0.5) * R * 0.85, byp + Math.sin(a + 0.5) * R * 0.85, DARK); }
    circ(r, bxp - R * 0.15, byp - R * 0.15, R * 0.7, LMID, 1, Math.PI, Math.PI * 1.5);
    targets.push({ x: bxp - R, y: byp - R, w: 2 * R, h: 2 * R });
    if (w.st !== 'walk') drawMan();
    // the pebbles bounce down the slope, losing most of their speed each time they hit it; the dust settles
    w.pebbles = w.pebbles.filter((p) => {
      p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      const gy = groundY(p.x);
      if (p.y > gy) { const nx = p.x > x0 && p.x < x1 ? -Math.sin(th) : 0, ny = p.x > x0 && p.x < x1 ? -Math.cos(th) : -1, vn = p.vx * nx + p.vy * ny; if (vn < 0) { p.vx -= 1.4 * vn * nx; p.vy -= 1.4 * vn * ny; p.vx *= 0.85; } p.y = gy; }
      r.rect(p.x - u * 0.5, p.y - u, mx1(u), mx1(u), LMID);
      return p.life > 0 && p.x > -5;
    }).slice(-30);
    w.dust = smoke(W, w.dust, -0.01 * N, LMID, MID + DIM).slice(-30);
  },
};

const WORLDS = { oldman, whalehunt, windmills, castaway, nautilus, rabbithole, sirens, cyclops, icarus, lilliput, raven, sisyphus };
registerFamily('classics', WORLD_DEFS, WORLDS);
export const CLASSICS_STYLE = makeMixStyle('CLASSICS', ['classics']);
