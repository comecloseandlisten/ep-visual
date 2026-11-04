// The coffee bar, mixed. Twelve pictures of coffee and the bar it is made at, in original shapes only (no brands, no
// cups with logos, nothing readable: the menu board is lines and shapes): latte art poured by a real small fluid step,
// an espresso shot in two thinning streams, a pour-over blooming, a café counter in the rush, a drum roaster tumbling
// its beans, a stovetop pot gurgling, cream sinking through iced coffee in billows, steam curling in the window light,
// a hand grinder piling its grounds, a cozy morning on the sill, a tower of cups that topples, and milk foam coarsening
// under the lens. Each world has a kinds table weighed by the arousal band, rolled again on a section change, with a
// heavy turn on a drop. All of them keep the same physics: what falls, falls with the gravity of the mixer's particles,
// and a stream thins as it speeds up; steam rises and slows as it cools; floating things bob about their waterline;
// piles keep to their angle of repose; what rolls turns at v/r; the fluids are carried semi-Lagrangian on coarse grids.
import { clamp, lerp, bayer } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, isLow, isTonal, follow, ease,
  beatLocked, hash, pickW, walker, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight. The quiet
// ones sit calm–dreamy–happy, the machines focused–tense–happy, the busy ones happy–euphoric–calm; the three that
// render a fluid cell by cell are `heavy` (the main screen only)
const CALM = [[M, L], [H, L], [H, M]], WORK = [[M, M], [M, H], [H, M]], BUSY = [[H, M], [H, H], [M, L]];
export const WORLD_DEFS = {
  latteart: { name: 'latte art', va: CALM, pals: ['latte', 'espresso', 'pastel', 'sepia', 'riso'], fx: ['none', 'kaleido', 'film'], themes: ['love', 'dream', 'play'], heavy: true, geo: true },
  espresso: { name: 'the espresso shot', va: WORK, pals: ['espresso', 'tungsten', 'noir', 'tape', 'latte'], fx: ['none', 'film', 'crt', 'vhs'], themes: ['machine', 'speed'] },
  pourover: { name: 'the pour-over', va: CALM, pals: ['latte', 'tape', 'inkwash', 'sepia', 'espresso'], fx: ['none', 'film'], themes: ['dream', 'nature'] },
  cafe: { name: 'the café counter', va: BUSY, pals: ['espresso', 'latte', 'tungsten', 'pastel', 'riso', 'tape'], fx: ['none', 'vhs', 'film'], themes: ['street', 'play'] },
  roaster: { name: 'the drum roaster', va: WORK, pals: ['tungsten', 'espresso', 'tape', 'latte', 'noir'], fx: ['none', 'crt', 'film'], themes: ['machine', 'nature'] },
  mokapot: { name: 'the stovetop pot', va: WORK, pals: ['espresso', 'tungsten', 'noir', 'tape', 'riso'], fx: ['none', 'film', 'crt', 'vhs'], themes: ['machine', 'play'] },
  icedcream: { name: 'iced coffee and cream', va: BUSY, pals: ['latte', 'sepia', 'riso', 'espresso', 'tape'], fx: ['none', 'vhs'], themes: ['dream', 'play'], heavy: true },
  steamcurl: { name: 'the steam', va: CALM, pals: ['espresso', 'noir', 'inkwash', 'tungsten', 'sepia'], fx: ['none', 'film'], themes: ['dream', 'lonely', 'love'], heavy: true },
  grinder: { name: 'the hand grinder', va: WORK, pals: ['espresso', 'tape', 'tungsten', 'sepia', 'noir'], fx: ['none', 'film', 'crt'], themes: ['machine', 'play'] },
  morningwindow: { name: 'the morning window', va: CALM, pals: ['latte', 'pastel', 'sepia', 'parchment', 'inkwash', 'tape'], fx: ['none', 'film', 'vhs'], themes: ['dream', 'lonely', 'nature'] },
  cupstack: { name: 'the cup tower', va: BUSY, pals: ['pastel', 'riso', 'latte', 'espresso', 'noir'], fx: ['none', 'crt', 'vhs'], themes: ['play', 'glory'] },
  microfoam: { name: 'the microfoam', va: CALM, pals: ['latte', 'espresso', 'pastel', 'inkwash', 'riso'], fx: ['none', 'kaleido', 'mirror'], themes: ['dream', 'nature'], geo: true },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the kinds tables weigh their variants by it; a section change
// rolls the kind again, a drop brings each world's heavy turn
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const GR = 1.6; // gravity, screens per second squared: what mixer's `particles` fall with, so everything falls alike
const bps = (f) => (f.bpm ? f.bpm / 60 : 2);
const mx1 = (u) => Math.max(1, u);
const dim = (c) => (c < DIM ? c + DIM : c);
// how many of a thing that comes `rate` times a second come this frame: a whole number, right on average at any dt
const spawns = (rnd, rate, dt) => { const n = rate * dt, k = Math.floor(n); return k + (rnd() < n - k ? 1 : 0); };
// a clock in beats: the analysis's count and phase while it has the tempo, else free-running at the tempo it guesses
const beatT = (w, f, dt) => (w.bt = beatLocked(f) ? f.beat.count + f.beat.phase : (w.bt || 0) + dt * bps(f));
// a beat tick for things that go a step per beat: the beat itself when locked, else counted out at the guessed tempo
const tick = (w, f, dt) => (beatLocked(f) ? f.beat.on : (w.tickT = (w.tickT || 0) + dt * bps(f)) >= 1 && ((w.tickT %= 1), true));
// a damped spring `o` = { x, v } toward `to`: stiffness k and damping c per second, in steps short enough to stay
// stable through a long frame
function spring(o, dt, k, c, to = 0) {
  const n = Math.ceil(dt / 0.012), h = dt / n;
  for (let i = 0; i < n; i++) { o.v += (-k * (o.x - to) - c * o.v) * h; o.x += o.v * h; }
}
// one row of cells from x0 to x1, clipped and rounded the way Raster.rect rounds
function span(r, y, x0, x1, c) {
  const N = r.N;
  y = Math.round(y);
  if (y < 0 || y >= N) return;
  const a = Math.max(0, Math.round(x0)), b = Math.min(N, Math.round(x1));
  if (b > a) r.buf.fill(c, y * N + a, y * N + b);
}
// a filled ellipse with radii rx, ry, a row at a time
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
// a thin circle (an ellipse when squashed by sy), or the arc of it from a0 to a1: rings, rims and ripples
function circ(r, cx, cy, R, c, sy = 1, a0 = 0, a1 = TAU) {
  if (!(R >= 0.5)) return;
  const n = Math.max(6, Math.ceil(R * 7 * ((a1 - a0) / TAU)));
  for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; r.set(cx + Math.cos(a) * R, cy + Math.sin(a) * R * sy, c); }
}
// a soft round puff: the cells of a disc whose dither threshold is under `dens`, thinner toward the edge, so it fades
function haze(r, cx, cy, R, c, dens) {
  const N = r.N, buf = r.buf, R2 = R * R, x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(N - 1, Math.ceil(cx + R));
  for (let y = Math.max(0, Math.floor(cy - R)), y1 = Math.min(N - 1, Math.ceil(cy + R)); y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, e = (dx * dx + dy * dy) / R2;
      if (e < 1 && bayer(x, y) < dens * (1 - 0.6 * e)) buf[y * N + x] = c;
    }
}
// steam: a puff leaves at (vx, vy) and its rise relaxes to a slow one as it cools and mixes (drag), it drifts with
// the air, grows and thins out until it is gone
const puff = (x, y, vx, vy, life = 2, s = 1) => ({ x, y, vx, vy, life, age: 0, s });
function steam(W, list, wind, col, rise = 0.04) {
  const { r, dt, u, N } = W;
  for (const p of list) {
    p.vx = follow(p.vx, wind, dt, 0.7);
    p.vy = follow(p.vy, -rise * N, dt, 0.5);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.age += dt;
    haze(r, p.x, p.y, u * p.s * (1.2 + p.age * 2.4), col, 0.9 * (1 - p.age / p.life));
  }
  return list.filter((p) => p.age < p.life);
}
// smooth value noise off the hash lattice, 0..1
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi + s, yi), b = hash(xi + 1 + s, yi), c = hash(xi + s, yi + 1), d = hash(xi + 1 + s, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
// a field on a GX×GY grid read between its cells, clamped to the grid
function samp(a, GX, GY, x, y) {
  x = x < 0 ? 0 : x > GX - 1.001 ? GX - 1.001 : x;
  y = y < 0 ? 0 : y > GY - 1.001 ? GY - 1.001 : y;
  const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, i = yi * GX + xi;
  return (a[i] + (a[i + 1] - a[i]) * fx) * (1 - fy) + (a[i + GX] + (a[i + GX + 1] - a[i + GX]) * fx) * fy;
}
// a local frame at (ox, oy) turned by `a`: a point mapper for anything that tilts, rocks or tumbles
const turn = (ox, oy, a) => { const c = Math.cos(a), s = Math.sin(a); return (dx, dy) => [ox + dx * c - dy * s, oy + dx * s + dy * c]; };
// drops on a pane of glass (x0, y0)-(x1, y1): each clings and grows (fed by the mist or the spray) until it is heavy
// enough to run, then runs down at a speed that grows with its size, meandering, takes in every drop it touches (the
// volumes add) and leaves a wet trail that dries; G = { drops, trails, id }
function glassDrops(W, G, x0, y0, x1, y1, col, wet) {
  const { r, dt, u, N } = W, big = 1.3 * u;
  for (const d of G.drops) {
    if (!d.run) { d.s += dt * 0.05 * u; if (d.s > big) { d.run = true; d.ty = d.y; } }
    else { d.v = follow(d.v, 0.16 * N * Math.min(2.5, d.s / big), dt, 0.3); d.y += d.v * dt; d.x = clamp(d.x + (hash(d.id, Math.floor(d.y / (3 * u))) - 0.5) * 0.08 * N * dt, x0, x1); }
  }
  for (const d of G.drops) {
    if (!d.run || d.s <= 0) continue;
    for (const e of G.drops) if (e !== d && e.s > 0 && Math.abs(e.x - d.x) < d.s + e.s && Math.abs(e.y - d.y) < d.s + e.s) { d.s = Math.cbrt(d.s ** 3 + e.s ** 3); e.s = 0; }
  }
  G.drops = G.drops.filter((d) => {
    if (d.s <= 0) return false;
    if (d.y > y1) { G.trails.push({ x: d.x, y0: d.ty, life: 1.5 }); return false; }
    if (d.run && d.y - d.ty > u) r.line(d.x, d.ty, d.x, d.y, wet);
    ell(r, d.x, d.y, mx1(d.s), mx1(d.s * 1.15), col);
    r.set(d.x - d.s * 0.4, d.y - d.s * 0.5, WHITE);
    return true;
  });
  G.trails = G.trails.filter((tr) => { if ((tr.life -= dt) > 0.5 || hash(Math.round(tr.x), Math.round(tr.life * 20)) < tr.life * 2) r.line(tr.x, tr.y0, tr.x, y1, wet); return tr.life > 0; });
  if (G.drops.length > 120) G.drops.splice(0, G.drops.length - 120);
}
const newDrop = (G, x, y, s) => G.drops.push({ id: G.id++, x, y, s, run: false, v: 0, ty: y });

// ---------------------------------------------------------------------------------------------- latteart
// A cup from above on its saucer, and a pitcher pouring milk into the espresso by a real small fluid step: on a
// 48-cell grid the pour point is a source whose outflow spreads the foam (its area grows by what is poured), the
// moving stream drags the surface along with it, nothing flows out through the cup wall, and a foam density and the
// crema are carried semi-Lagrangian by that flow, then upsampled with dithered edges: the white foam, the crema LMID
// round it, MID and DARK beyond. The kind is the pattern: a heart (one disc pushed forward a step a beat), a tulip
// (blobs stacked two beats apart, each pushing the last into a crescent), a rosetta (a wiggle side to side on every
// beat while drawing back) or a swan; each ends in the cut-through, the thin stream dragged across. The pour runs with
// the level, a kick surges it, a snare flicks the pitcher, a hat pops a pinhole in the foam, a note dusts cocoa on it
// where its pitch says; a section change slides a fresh cup in, a drop cuts through at once.
const ART_W = { heart: [3, 2, 1], tulip: [2, 3, 2], rosetta: [1, 2, 3], swan: [1, 1, 2] };
// the pour stage by stage: beats, the pour point from `a` to `z` (cup radii, +y away from the pitcher) or round `via`,
// the rate q (0 lifts the pitcher), a high pour (the milk dives under the crema), a step a beat, a wiggle each way on
// every beat, the cut (lifted: a thin stream that dives and only drags the surface); `fl` thins the flow for the
// fine patterns, so each pass lays a band and not a blob
const ART = {
  heart: [{ b: 2, a: [0, -0.1], q: 0.7, hi: 1 }, { b: 4, a: [0, -0.05], z: [0, 0.2], q: 1, step: 1 }, { b: 0.5, q: 0 }, { b: 1, a: [0, -0.85], z: [0, 0.85], q: 0.4, cut: 1 }],
  tulip: [{ b: 2, a: [0, -0.1], q: 0.7, hi: 1 }, { b: 1.5, a: [0, 0.34], z: [0, 0.4], q: 1 }, { b: 0.5, q: 0 }, { b: 1.5, a: [0, 0.0], z: [0, 0.08], q: 1 },
    { b: 0.5, q: 0 }, { b: 1.5, a: [0, -0.34], z: [0, -0.26], q: 1 }, { b: 0.5, q: 0 }, { b: 1, a: [0, -0.88], z: [0, 0.8], q: 0.4, cut: 1 }],
  rosetta: [{ b: 2, a: [0, -0.1], q: 0.7, hi: 1 }, { b: 6, a: [0, 0.45], z: [0, -0.5], q: 0.85, wig: 0.3, fl: 0.35 }, { b: 0.5, q: 0 }, { b: 1, a: [0, -0.85], z: [0, 0.8], q: 0.4, cut: 1 }],
  swan: [{ b: 2, a: [0, -0.1], q: 0.7, hi: 1 }, { b: 5, a: [-0.3, 0.4], z: [-0.2, -0.5], q: 0.85, wig: 0.22, fl: 0.35 }, { b: 0.5, q: 0 },
    { b: 2, a: [0.38, -0.55], via: [0.6, 0.1], z: [0.12, 0.45], q: 0.5, fl: 0.25 }, { b: 1, a: [0.12, 0.5], q: 0.9, fl: 0.6 }, { b: 0.5, q: 0 }, { b: 0.5, a: [0.12, 0.3], z: [0.12, 0.72], q: 0.3, cut: 1 }],
};
const ART_CUT = { b: 0.75, a: [0, -0.85], z: [0, 0.85], q: 0.5, cut: 1, heavy: 1 }; // the drop's: wider, quicker
const LG = 48; // the surface grid, cells across the cup
const artAt = (st, p) => {
  const a = st.a, z = st.z || a, v = st.via;
  if (v) { const m = 1 - p; return [m * m * a[0] + 2 * m * p * v[0] + p * p * z[0], m * m * a[1] + 2 * m * p * v[1] + p * p * z[1]]; }
  return [lerp(a[0], z[0], p), lerp(a[1], z[1], p)];
};
// per cell of the box round the liquid: the grid cell it reads (bilinear) and how far out it lies, in cup radii
function latteTables(W) {
  const { w, N } = W, G = LG, Rl = 0.3 * N, B = Math.ceil(2 * Rl) + 2, gs = (2 * Rl) / G, h = B >> 1;
  const gi = new Int32Array(B * B), gf = new Float32Array(2 * B * B), rr = new Float32Array(B * B);
  for (let y = 0; y < B; y++)
    for (let x = 0; x < B; x++) {
      const k = y * B + x, dx = x + 0.5 - h, dy = y + 0.5 - h;
      const gx = clamp((dx + Rl) / gs - 0.5, 0, G - 1.001), gy = clamp((dy + Rl) / gs - 0.5, 0, G - 1.001);
      rr[k] = Math.hypot(dx, dy) / Rl;
      gi[k] = Math.floor(gy) * G + Math.floor(gx);
      gf[2 * k] = gx - Math.floor(gx);
      gf[2 * k + 1] = gy - Math.floor(gy);
    }
  Object.assign(w, { N, B, gi, gf, rr, gs });
}
// a fresh shot in a fresh cup: no foam, nothing moving, the crema mottled in streaks and darker at the rim
function latteFresh(w, rnd) {
  const G = LG, s = Math.floor(rnd() * 997);
  if (!w.m) { w.m = new Uint8Array(G * G); for (const k of ['d', 'e', 'l', 'c', 'vx', 'vy', 'ux', 'uy', 'd2', 'e2', 'l2', 'c2', 'vx2', 'vy2']) w[k] = new Float32Array(G * G); }
  for (let y = 0, i = 0; y < G; y++)
    for (let x = 0; x < G; x++, i++) {
      const rc = Math.hypot(x + 0.5 - G / 2, y + 0.5 - G / 2) / (G / 2);
      w.m[i] = rc < 1 ? 1 : 0;
      w.d[i] = w.d2[i] = w.e[i] = w.e2[i] = w.l[i] = w.l2[i] = w.vx[i] = w.vy[i] = w.vx2[i] = w.vy2[i] = w.ux[i] = w.uy[i] = 0;
      w.c[i] = w.c2[i] = clamp(0.6 + 0.32 * (vnoise(x / 3.5, y / 7, s) - 0.5) + 0.16 * (vnoise(x / 1.6, y / 1.6, s + 40) - 0.5) - (0.5 * Math.max(0, rc - 0.8)) / 0.2);
    }
  w.cocoa = [];
  w.holes = [];
}
// a lift: the foam poured so far becomes the older layer `e`, and where the blob just poured presses on the older
// foam, the crema squeezed between them is kept as a line `l` that the flow carries on: a tulip's stacks keep apart
function latteLayer(w) {
  const d = w.d, e = w.e, l = w.l;
  for (let i = 0; i < d.length; i++) { if (d[i] > 0.15 && e[i] > 0.15) l[i] = 1; if (d[i] > e[i]) e[i] = d[i]; d[i] = 0; }
}
// one step of the surface. The flow is what the stream dragged (decaying), plus the pour point's outflow, with nothing
// flowing out through the wall; foam, crema and the dragged flow are carried back along it; the stream's foam floats up
// round the pour point (a high pour dives under and only pales the crema), and the foam's edge is kept sharp, since
// foam and crema do not mix
function latteStep(w, h, px, py, Vx, Vy, q, fl, hi, cut, heavy) {
  const G = LG, Rg = G / 2, m = w.m, d = w.d, e0 = w.e, l0 = w.l, c = w.c, vx = w.vx, vy = w.vy, ux = w.ux, uy = w.uy;
  const Q = cut ? 0 : (hi ? 0.15 : fl) * q * 150, keep = Math.exp(-h / 0.14), rd = heavy ? 3 : cut ? 2.2 : 2.6, rd2 = rd * rd;
  const grab = q > 0 ? (heavy ? 0.95 : 0.75) * (1 - Math.exp(-h / 0.04)) : 0, jet = hi || cut ? 0 : 6 * q;
  for (let y = 0, i = 0; y < G; y++)
    for (let x = 0; x < G; x++, i++) {
      if (!m[i]) continue;
      const dx = x - px, dy = y - py, e = dx * dx + dy * dy;
      let ax = vx[i] * keep, ay = vy[i] * keep;
      if (grab > 0 && e < 9 * rd2) { const g = grab * Math.exp(-e / rd2); ax += (Vx - ax) * g; ay += (Vy - jet - ay) * g; }
      vx[i] = ax;
      vy[i] = ay;
      if (Q > 0) { const k = Q / (TAU * (e > 2.5 ? e : 2.5)); ax += dx * k; ay += dy * k; }
      const ex = x + 0.5 - Rg, ey = y + 0.5 - Rg, rc = Math.sqrt(ex * ex + ey * ey);
      if (rc > Rg - 5) { const vn = (ax * ex + ay * ey) / rc; if (vn > 0) { const k = (vn * Math.min(1, (rc - Rg + 5) / 4)) / rc; ax -= ex * k; ay -= ey * k; } }
      ux[i] = ax;
      uy[i] = ay;
    }
  const d2 = w.d2, e2 = w.e2, l2 = w.l2, c2 = w.c2, vx2 = w.vx2, vy2 = w.vy2;
  for (let y = 0, i = 0; y < G; y++)
    for (let x = 0; x < G; x++, i++) {
      if (!m[i]) continue;
      const sx = x - ux[i] * h, sy = y - uy[i] * h;
      d2[i] = samp(d, G, G, sx, sy);
      e2[i] = samp(e0, G, G, sx, sy);
      l2[i] = samp(l0, G, G, sx, sy);
      c2[i] = samp(c, G, G, sx, sy);
      vx2[i] = samp(vx, G, G, sx, sy);
      vy2[i] = samp(vy, G, G, sx, sy);
    }
  w.d = d2; w.d2 = d; w.e = e2; w.e2 = e0; w.l = l2; w.l2 = l0; w.c = c2; w.c2 = c; w.vx = vx2; w.vx2 = vx; w.vy = vy2; w.vy2 = vy;
  const D = w.d, E = w.e, Ln = w.l, C = w.c;
  if (q > 0 && !cut) {
    const rq = 0.6 + 1.4 * q * Math.sqrt(fl), rq2 = rq * rq, R = Math.ceil(hi ? 5 : rq + 1);
    for (let y = Math.max(0, Math.floor(py) - R); y <= Math.min(G - 1, Math.ceil(py) + R); y++)
      for (let x = Math.max(0, Math.floor(px) - R); x <= Math.min(G - 1, Math.ceil(px) + R); x++) {
        const i = y * G + x, e = (x - px) ** 2 + (y - py) ** 2;
        if (!m[i]) continue;
        if (hi) C[i] += (0.95 - C[i]) * Math.min(1, h * 1.5) * Math.exp(-e / 10);
        else if (e < rq2) D[i] = Math.max(D[i], Math.min(1, 1.2 - e / rq2));
      }
  }
  for (let i = 0; i < G * G; i++) {
    let v = D[i];
    if (v > 0.002 && v < 0.998) { v += h * 8 * v * (1 - v) * (v - 0.5); D[i] = v < 0 ? 0 : v > 1 ? 1 : v; }
    v = E[i];
    if (v > 0.002 && v < 0.998) { v += h * 8 * v * (1 - v) * (v - 0.5); E[i] = v < 0 ? 0 : v > 1 ? 1 : v; }
    v = Ln[i];
    if (v > 0.002 && v < 0.998) { v += h * 6 * v * (1 - v) * (v - 0.45); Ln[i] = v < 0 ? 0 : v > 1 ? 1 : v; }
  }
}

const latteart = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, ART_W, bandOf(W.a)), si: 0, s0: null, hold: 0, out: 0, slide: 0, cut: null, P: [LG / 2, LG / 2], pit: 0, lift: 0, surge: 0, flick: { x: 0, v: 0 } });
    latteFresh(w, rnd);
    latteTables(W);
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s } = W, G = LG, band = bandOf(W.a), bt = beatT(w, f, dt), buf = r.buf;
    if (w.N !== N) latteTables(W);
    if (w.s0 === null || w.s0 > bt) w.s0 = bt; // (the beat clock starts over when the tempo is found)
    // a section change slides this cup off with its art and a fresh one in; a drop is the cut-through, now
    if (f.section === 'change' && w.out <= 0 && w.slide <= 0) w.out = 1;
    if (w.out > 0 && (w.out -= dt / 0.35) <= 0) { w.out = 0; w.slide = 1; latteFresh(w, rnd); w.kind = rollW(rnd, ART_W, band); w.si = 0; w.hold = 0; w.cut = null; }
    if (w.slide > 0) w.slide = Math.max(0, w.slide - dt / 0.6);
    const busy = w.out > 0 || w.slide > 0, script = ART[w.kind];
    if (busy) w.s0 = bt;
    if (f.section === 'drop' && !busy && !w.cut) { w.cut = { s0: bt }; s.shake = Math.max(s.shake, 0.3); }
    let st = null, p = 0;
    if (w.cut) { // a quarter beat to lift the pitcher to the near rim, then the cut
      if (!w.cut.lift) { w.cut.lift = true; latteLayer(w); }
      p = (bt - w.cut.s0 - 0.25) / ART_CUT.b;
      st = p < 0 ? { q: 0 } : ART_CUT;
      if (p >= 1) { w.cut = null; w.si = script.length; w.hold = 0; st = null; }
    }
    else if (!busy) {
      while (w.si < script.length && bt - w.s0 >= script[w.si].b) { w.s0 += script[w.si].b; w.si++; if (script[w.si]?.q === 0) latteLayer(w); }
      if (w.si < script.length) { st = script[w.si]; p = (bt - w.s0) / st.b; }
      else if (tick(w, f, dt) && ++w.hold >= 8) w.out = 1; // admired for two bars, then the next cup
    }
    // where the stage puts the pour point; a lift carries the pitcher to where the next pour begins
    let tx = w.P[0], ty = w.P[1], q = 0, hi = 0, cut = 0;
    const toG = (a) => [((a[0] + 1) * G) / 2 - 0.5, ((1 - a[1]) * G) / 2 - 0.5];
    if (st && st.q > 0) {
      if (st.step) { const k = clamp(p) * st.b, j = Math.floor(k); p = Math.min(1, (j + ease((k - j) * 2)) / st.b); }
      const at = artAt(st, clamp(p));
      if (st.wig) at[0] += st.wig * (0.75 + 0.5 * clamp(f.rel.midDrive)) * Math.cos(Math.PI * (bt - w.s0));
      [tx, ty] = toG(at);
      q = st.q; hi = st.hi || 0; cut = st.cut || 0;
    } else if (st) { const nx = w.cut ? ART_CUT : script[w.si + 1]; if (nx?.a) [tx, ty] = toG(nx.a); }
    for (const hh of hits) {
      if (isLow(hh)) w.surge = Math.max(w.surge, hh.strength);
      else if (hh.kind === 'snare') w.flick.v += (rnd() < 0.5 ? -1 : 1) * 70 * hh.strength;
      else if (hh.kind === 'hat') for (let k = 0; k < 8; k++) { const i = Math.floor(rnd() * G * G); if (Math.max(w.d[i], w.e[i]) > 0.8) { w.holes.push({ x: i % G, y: Math.floor(i / G), t: 0.45 }); break; } }
      if (isTonal(hh)) { const a = (hh.pc / 12) * TAU; for (let k = 0; k < 5; k++) w.cocoa.push({ x: G / 2 + Math.cos(a) * G * 0.27 + (rnd() - 0.5) * 3, y: G / 2 + Math.sin(a) * G * 0.27 + (rnd() - 0.5) * 3 }); }
    }
    if (w.cocoa.length > 90) w.cocoa.splice(0, w.cocoa.length - 90);
    w.surge *= Math.exp(-dt * 4);
    spring(w.flick, dt, 220, 12);
    // the fluid, in steps of a thirtieth of a second at most; the pour point slides along within the frame
    const qq = busy ? 0 : q * (0.55 + 0.55 * f.level + 0.7 * w.surge), n = Math.max(1, Math.ceil(dt * 30)), x0 = w.P[0], y0 = w.P[1];
    w.P[0] = clamp(follow(w.P[0], tx + w.flick.x, dt, 0.05), 2, G - 3);
    w.P[1] = clamp(follow(w.P[1], ty, dt, 0.05), 2, G - 3);
    const Vx = (w.P[0] - x0) / Math.max(dt, 1e-3), Vy = (w.P[1] - y0) / Math.max(dt, 1e-3);
    for (let k = 1; k <= n; k++) latteStep(w, dt / n, x0 + ((w.P[0] - x0) * k) / n, y0 + ((w.P[1] - y0) * k) / n, Vx, Vy, qq, st?.fl ?? 1, hi, cut, st === ART_CUT);
    for (const c of w.cocoa) { c.x = clamp(c.x + samp(w.ux, G, G, c.x, c.y) * dt, 1, G - 2); c.y = clamp(c.y + samp(w.uy, G, G, c.x, c.y) * dt, 1, G - 2); }
    // the counter's grain, the saucer and its shadow (the light is at the upper left), the cup, the handle
    const off = w.out > 0 ? -((1 - w.out) ** 2) * 1.3 * N : w.slide ** 2 * 1.3 * N;
    const cx = Math.round(0.5 * N + off), cy = Math.round(0.47 * N), Rl = 0.3 * N, Rr = 0.345 * N, Rs = 0.45 * N;
    for (let y = Math.round(3 * u); y < N; y += Math.max(2, Math.round(7 * u))) for (let x = 0; x < N; x += 30 * u) span(r, y + (hash(y, x) - 0.5) * 2 * u, x + hash(x, y) * 8 * u, x + (18 + hash(y + 1, x) * 10) * u, BG + DIM);
    ell(r, cx + 3 * u, cy + 4 * u, Rs, Rs, BG + DIM);
    ell(r, cx, cy, Rs, Rs, LMID);
    circ(r, cx, cy, Rs - 0.5 * u, MID);
    circ(r, cx, cy, Rs - 2 * u, BRIGHT, 1, Math.PI * 1.05, Math.PI * 1.45);
    ell(r, cx + Rr + 0.06 * N + 2 * u, cy + 3 * u, 0.07 * N, 0.04 * N, MID + DIM);
    ell(r, cx + Rr + 0.055 * N, cy, 0.07 * N, 0.04 * N, FIG);
    ell(r, cx + Rr + 0.065 * N, cy, 0.035 * N, 0.016 * N, LMID);
    ell(r, cx + 2 * u, cy + 3 * u, Rr, Rr, MID + DIM);
    ell(r, cx, cy, Rr, Rr, FIG);
    circ(r, cx, cy, Rr - 1.2 * u, WHITE, 1, Math.PI * 1.1, Math.PI * 1.4);
    ell(r, cx, cy, Rl + 1.4 * u, Rl + 1.4 * u, FIG + DIM);
    // the surface: foam over crema, read between the grid's cells, the foam's edge dithered; where a new layer of foam
    // presses on an older one, the crema squeezed between them shows as a line
    const { B, gi, gf, rr, gs } = w, D = w.d, E = w.e, Ln = w.l, C = w.c, bx0 = cx - (B >> 1), by0 = cy - (B >> 1);
    for (let ly = 0; ly < B; ly++) {
      const y = by0 + ly;
      if (y < 0 || y >= N) continue;
      for (let lx = 0, k = ly * B; lx < B; lx++, k++) {
        const x = bx0 + lx, rad = rr[k];
        if (rad >= 1 || x < 0 || x >= N) continue;
        const i = gi[k], fx = gf[2 * k], fy = gf[2 * k + 1], th = bayer(x, y) - 0.5;
        const dn = (D[i] + (D[i + 1] - D[i]) * fx) * (1 - fy) + (D[i + G] + (D[i + G + 1] - D[i + G]) * fx) * fy;
        const de = (E[i] + (E[i + 1] - E[i]) * fx) * (1 - fy) + (E[i + G] + (E[i + G + 1] - E[i + G]) * fx) * fy, dv = (dn > de ? dn : de) + th * 0.3;
        const lv = (Ln[i] + (Ln[i + 1] - Ln[i]) * fx) * (1 - fy) + (Ln[i + G] + (Ln[i + G + 1] - Ln[i + G]) * fx) * fy + th * 0.2;
        let col = (dn > 0.22 && de > 0.22) || lv > 0.42 ? MID : BRIGHT;
        if (dv <= 0.5) {
          if (dv > 0.3) col = LMID;
          else {
            const cv = (C[i] + (C[i + 1] - C[i]) * fx) * (1 - fy) + (C[i + G] + (C[i + G + 1] - C[i + G]) * fx) * fy + th * 0.2 - (rad > 0.94 ? 0.25 : 0);
            col = cv > 0.68 ? LMID : cv > 0.42 ? MID : DARK;
          }
        }
        buf[y * N + x] = col;
      }
    }
    const gx = (x) => cx - Rl + (x + 0.5) * gs, gy = (y) => cy - Rl + (y + 0.5) * gs;
    w.holes = w.holes.filter((hl) => { if (Math.max(w.d[hl.y * G + hl.x], w.e[hl.y * G + hl.x]) > 0.5) r.rect(gx(hl.x) - u * 0.5, gy(hl.y) - u * 0.5, mx1(u), mx1(u), hl.t > 0.3 ? MID : LMID); return (hl.t -= dt) > 0; });
    for (const c of w.cocoa) r.set(gx(c.x), gy(c.y), Math.max(samp(w.d, G, G, c.x, c.y), samp(w.e, G, G, c.x, c.y)) > 0.5 ? DARK : DARK + DIM);
    if (f.beat.pulse > 0.7) for (let k = 0; k < 4; k++) { const i = Math.floor(hash(k, f.beat.count) * G * G); if (Math.max(w.d[i], w.e[i]) > 0.9) r.set(gx(i % G) - u, gy(Math.floor(i / G)) - u, WHITE); } // a glint on the foam
    targets.push({ x: cx - Rr, y: cy - Rr, w: 2 * Rr, h: 2 * Rr });
    // the pitcher from above: its spout over the pour point, its body toward us, nearer the eye for a high pour
    w.pit = follow(w.pit, st && !busy ? 1 : 0, dt, 0.18);
    w.lift = follow(w.lift, hi ? 1 : cut ? 0.4 : 0, dt, 0.15);
    if (w.pit > 0.03) {
      const away = (1 - w.pit) * 0.7 * N, sx = gx(w.P[0]), sy = gy(w.P[1]) + away, sc = 1 + 0.15 * w.lift, br = 0.11 * N * sc, bx = sx + 0.015 * N, by = sy + 0.21 * N * sc;
      if (qq > 0 && w.pit > 0.8) { const sr = (cut ? 0.5 : 0.7 + 1.2 * q) * u * (1 + 0.2 * f.beat.pulse); ell(r, sx, sy, sr, sr, BRIGHT); }
      r.ring(bx, by + br * 1.05, br * 0.42, mx1(2.2 * u), DARK); // the handle's loop, toward us
      r.poly([[bx - br * 0.5, by - br * 0.6], [bx + br * 0.5, by - br * 0.6], [sx + 1.5 * u, sy + 1.6 * u], [sx - 1.5 * u, sy + 1.6 * u]], MID); // the spout's lip
      ell(r, bx, by, br, br, MID);
      ell(r, bx, by - br * 0.06, br * 0.82, br * 0.8, BRIGHT); // the milk in it, tipped toward the spout
      r.line(bx, by - br * 0.8, sx, sy + 1.6 * u, LMID);
      circ(r, bx, by, br - 0.6 * u, LMID, 1, Math.PI * 0.95, Math.PI * 1.55);
      circ(r, bx, by, br - 0.6 * u, DARK, 1, Math.PI * 0.1, Math.PI * 0.6);
    }
  },
};

// ---------------------------------------------------------------------------------------------- espresso
// An espresso machine from the side, against a tiled wall: the group head and the portafilter, a glass on the drip
// tray, the pressure gauge, the steam wand. A kick starts a shot: a beat of preinfusion with the needle climbing, then
// drips, then the streams, each falling from its spout under gravity and thinning as it speeds up (the flow is the
// same all the way down, so the cross-section goes as 1/v), the coffee rising in the glass under its crema as each
// parcel lands; the shot blondes and tapers off and the last of the stream falls away. The needle is a damped spring
// on the shot's pressure and the bass, a kick knocks it; the wand puffs on the hats and purges on a snare, the pilot
// lamps light with the notes. The kind is the shot: a double, a single, a lungo or a bottomless basket (the beads run
// together into one stream). A full glass slides out and an empty one in; a drop brings the milk jug up to the wand:
// the plume, and the milk spun into a whirlpool whose surface is the paraboloid of a turning fluid.
const SHOT_W = { double: [2, 3, 2], single: [2, 1, 0], lungo: [2, 1, 1], naked: [1, 2, 3] };
// the spouts (off the group's axis, in screens), the beats of full flow, the glass (half width, height)
const SHOTS = { double: { sp: [-0.035, 0.035], len: 6, gw: 0.09, gh: 0.2 }, single: { sp: [0], len: 5, gw: 0.065, gh: 0.14 },
  lungo: { sp: [-0.035, 0.035], len: 10, gw: 0.08, gh: 0.27 }, naked: { sp: [0], len: 6, gw: 0.09, gh: 0.2, naked: true } };

const espresso = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, SHOT_W, bandOf(W.a)), next: null, shot: null, fill: 0, swap: 0, par: [[], []], spl: [], needle: { x: 0.1, v: 0 }, puffs: [], lamp: [0, 0],
      jug: 0, steamTo: -1, spin: 0, spinA: 0, milk: 0.55, purge: 0, surge: 0, dripT: 0, tiger: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bt = beatT(w, f, dt), g = GR * N;
    if (f.section === 'change') { w.next = rollW(rnd, SHOT_W, band); if (!w.shot && w.swap <= 0) w.swap = 1; }
    if (f.section === 'drop') { w.steamTo = bt + 8; s.shake = Math.max(s.shake, 0.35); }
    const tipX = 0.845 * N, tipY = 0.6 * N;
    for (const hh of hits) {
      if (isLow(hh)) { if (!w.shot && w.swap <= 0 && w.fill < 0.6) w.shot = { b0: bt }; w.surge = Math.max(w.surge, hh.strength); w.needle.v += 1.2 * hh.strength; }
      else if (hh.kind === 'snare') { w.purge = 0.15; w.needle.v -= 0.6 * hh.strength; }
      else if (hh.kind === 'hat') w.puffs.push(puff(tipX, tipY + 2 * u, (rnd() - 0.5) * 0.04 * N, 0.12 * N, 1.4, 1));
      if (isTonal(hh)) w.lamp[hh.pc % 2] = 1;
    }
    // the glass on the tray: slid out to the right when full, an empty one (of the new kind, if one is due) slid in
    if (w.swap > 0) {
      const was = w.swap;
      w.swap = Math.max(0, w.swap - dt / 1.2);
      if (was > 0.5 && w.swap <= 0.5) { w.fill = 0; if (w.next) { w.kind = w.next; w.next = null; } }
    }
    const K = SHOTS[w.kind], off = w.swap > 0.5 ? ((1 - w.swap) * 2) ** 2 * 0.6 * N : (w.swap * 2) ** 2 * 0.6 * N;
    // the shot: preinfusion, drips, the flow (with the level, a kick surging it), the blonding taper, done
    let q = 0, blond = false, press = 0.12;
    if (w.shot) {
      const e = bt - w.shot.b0, L = K.len;
      if (e < 0) w.shot.b0 = bt; // (the beat clock started over)
      if (e < 1) press = 0.12 + 0.6 * e;
      else if (e < 2) { q = 0.25 * (e - 1); press = 0.75; }
      else if (e < 2 + L) { q = 0.5 + 0.4 * f.level + 0.3 * w.surge; press = 0.8; }
      else if (e < 4 + L) { q = (0.5 + 0.4 * f.level) * (1 - (e - 2 - L) / 2); blond = true; press = 0.8 - 0.3 * (e - 2 - L); }
      else { w.shot = null; if (w.fill > 0.55) w.swap = 1; }
    }
    w.surge *= Math.exp(-dt * 3);
    spring(w.needle, dt, 40, 4, press + 0.15 * clamp(f.rel.bassDrive));
    if (w.needle.x < -0.02) { w.needle.x = -0.02; w.needle.v *= -0.3; } else if (w.needle.x > 1.02) { w.needle.x = 1.02; w.needle.v *= -0.3; }
    // the wall, the machine, the bay, the drip tray
    r.rect(0, 0, N, 0.9 * N, DARK);
    for (let y = 8 * u; y < 0.9 * N; y += 8 * u) span(r, y, 0, N, DARK + DIM);
    for (let x = 8 * u; x < N; x += 8 * u) r.rect(x, 0, mx1(u * 0.6), 0.9 * N, DARK + DIM);
    r.rect(0, 0.9 * N, N, 0.1 * N, LMID);
    r.rect(0, 0.9 * N, N, mx1(u), BRIGHT);
    r.rect(0.02 * N, 0.07 * N, 0.72 * N, 0.83 * N, MID);
    r.rect(0.02 * N, 0.07 * N, 0.72 * N, mx1(u), LMID);
    r.rect(0.02 * N, 0.055 * N, 0.72 * N, 0.015 * N, LMID); // the cup warmer's rail, two cups upside down on it
    for (const k of [0.1, 0.19]) r.poly([[k * N - 0.035 * N, 0.055 * N], [k * N + 0.035 * N, 0.055 * N], [k * N + 0.026 * N, 0.012 * N], [k * N - 0.026 * N, 0.012 * N]], FIG);
    for (const k of [0.04, 0.72]) r.rect(k * N - mx1(u) / 2, 0.09 * N, mx1(u), 0.79 * N, MID + DIM);
    r.rect(0.13 * N, 0.4 * N, 0.52 * N, 0.44 * N, DARK + DIM);
    r.rect(0.11 * N, 0.84 * N, 0.56 * N, 0.06 * N, LMID);
    for (let x = 0.13 * N; x < 0.65 * N; x += 3 * u) r.rect(x, 0.85 * N, mx1(1.4 * u), 0.012 * N, DARK);
    // the glass and what is in it: the coffee under its crema, mottled; the rim, the walls, a highlight
    const gX = 0.39 * N + off, gb = 0.84 * N, gw = K.gw * N, gh = K.gh * N, floor = gb - 2 * u, lvl = floor - clamp(w.fill) * (gh - 4 * u);
    w.tiger += dt * (q > 0 ? 3 : 0.3);
    if (lvl < floor - 0.5) {
      const cH = Math.min(floor - lvl, (0.02 + 0.16 * clamp(w.fill)) * gh + (q > 0 ? 1.5 * u : 0));
      r.rect(gX - gw + u, lvl, 2 * gw - 2 * u, floor - lvl, MID);
      for (let y = Math.round(lvl); y < lvl + cH; y++) for (let x = Math.round(gX - gw + u); x < gX + gw - u; x++) { const hq = hash(x, y + Math.floor(w.tiger)); r.set(x, y, hq < 0.2 ? MID : hq > 0.9 ? BRIGHT : LMID); }
      r.rect(gX - gw + u, lvl, 2 * gw - 2 * u, mx1(0.6 * u), BRIGHT);
    }
    r.rect(gX - gw, gb - 2 * u, 2 * gw, 2 * u, LMID + DIM);
    for (const k of [-1, 1]) r.rect(gX + k * gw - (k > 0 ? mx1(u) : 0), gb - gh, mx1(u), gh, LMID);
    r.rect(gX - gw + 1.5 * u, gb - gh + 2 * u, mx1(0.7 * u), gh - 5 * u, WHITE);
    r.rect(gX - gw, gb - gh, 2 * gw, mx1(0.7 * u), BRIGHT);
    targets.push({ x: gX - gw, y: gb - gh, w: 2 * gw, h: gh });
    // the streams: parcels emitted at the spout fall under gravity; drawn as a column whose width goes as sqrt(q / v)
    const gc = 0.39 * N, ys = (K.naked ? 0.485 : 0.48) * N, v0 = 0.1 * N, nS = K.sp.length, per = (0.75 / (0.8 * (K.len + 1.5)) / nS) * bps(f);
    if (q > 0) {
      if (q >= 0.28) for (let k = 0; k < nS; k++) w.par[k].push({ y: ys, v: v0, q, vol: q * dt * per, b: blond, drop: false });
      else if ((w.dripT += dt * (1 + 10 * q)) >= 0.3) { w.dripT = 0; for (let k = 0; k < nS; k++) w.par[k].push({ y: ys, v: 0, q: 0.3, vol: q * 0.3 * per, b: blond, drop: true }); }
    }
    for (let k = 0; k < 2; k++) {
      const list = w.par[k], xs = gc + (K.sp[k] ?? 0) * N, inG = Math.abs(xs - gX) < gw - 1.5 * u, land = inG ? lvl : gb;
      for (const p of list) { p.v += g * dt; p.y += p.v * dt; }
      while (list.length && list[0].y >= land) {
        const p = list.shift();
        if (inG) { w.fill += p.vol; if (hash(Math.floor(p.y * 7), w.spl.length + Math.floor(w.tiger * 10)) < 0.08) w.spl.push({ x: xs, y: lvl - u, vx: (rnd() - 0.5) * 0.12 * N, vy: -0.15 * N, life: 0.5 }); }
      }
      for (let j = 0; j < list.length; j++) {
        const a = list[j], b = list[j + 1], col = a.b ? BRIGHT : LMID, wd = mx1(2.6 * u * Math.sqrt(a.q) * Math.sqrt(v0 / Math.max(v0, a.v)));
        if (a.drop || !b || b.drop) r.rect(xs - wd / 2, a.y - wd, wd, wd + mx1(u), col);
        else r.rect(xs - wd / 2, b.y, wd, a.y - b.y + 1, col);
      }
      const top = list[list.length - 1];
      if (top && !top.drop && q >= 0.28) r.rect(xs - mx1(2.6 * u * Math.sqrt(q)) / 2, ys, mx1(2.6 * u * Math.sqrt(q)), top.y - ys + 1, blond ? BRIGHT : LMID);
      if (inG && list.length && q > 0) r.set(xs, lvl - u, LMID); // the dimple where it lands
      if (list.length > 90) list.splice(0, list.length - 90);
    }
    w.spl = w.spl.filter((p) => { p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; r.set(p.x, p.y, LMID); return p.life > 0 && p.y < lvl; });
    // the group head, the portafilter and its spouts (or the bare basket, its beads running together into one stream)
    r.rect(0.31 * N, 0.27 * N, 0.16 * N, 0.11 * N, LMID);
    for (const k of [0.3, 0.34]) r.rect(0.31 * N, k * N, 0.16 * N, mx1(0.8 * u), DARK);
    r.rect(0.315 * N, 0.38 * N, 0.15 * N, 0.06 * N, LMID);
    r.rect(0.315 * N, 0.38 * N, 0.15 * N, mx1(u), BRIGHT);
    r.rect(0.315 * N, 0.43 * N, 0.15 * N, mx1(u), MID);
    r.stroke(0.465 * N, 0.405 * N, 0.64 * N, 0.445 * N, mx1(3.5 * u), DARK);
    ell(r, 0.665 * N, 0.45 * N, 0.04 * N, 0.02 * N, FIG);
    if (K.naked) {
      for (let x = Math.round(0.32 * N); x < 0.46 * N; x += Math.max(2, Math.round(2 * u))) r.set(x, 0.44 * N, DARK);
      if (q > 0.1) for (let y = Math.round(0.44 * N); y < 0.485 * N; y++) { const hw = (0.045 * N * (0.485 * N - y)) / (0.045 * N); span(r, y, gc - hw, gc + hw, Math.floor((y + w.tiger * 3) / mx1(1.5 * u)) % 2 ? MID : blond ? BRIGHT : LMID); }
    } else for (const sp of K.sp) r.poly([[gc + sp * N - 0.016 * N, 0.44 * N], [gc + sp * N + 0.016 * N, 0.44 * N], [gc + sp * N + 0.007 * N, 0.48 * N], [gc + sp * N - 0.007 * N, 0.48 * N]], LMID);
    // the gauge: the needle on its spring, the red arc of full pressure; the pilot lamps, the steam knob
    const Gx = 0.16 * N, Gy = 0.2 * N, Gr = 0.085 * N;
    ell(r, Gx, Gy, Gr + 1.5 * u, Gr + 1.5 * u, DARK);
    ell(r, Gx, Gy, Gr, Gr, BRIGHT);
    for (let k = 0; k <= 8; k++) { const a = -2.2 + (k / 8) * 4.4; r.line(Gx + Math.sin(a) * Gr * 0.75, Gy - Math.cos(a) * Gr * 0.75, Gx + Math.sin(a) * Gr * 0.92, Gy - Math.cos(a) * Gr * 0.92, DARK); }
    circ(r, Gx, Gy, Gr * 0.85, HOT, 1, 1.3 - Math.PI / 2, 2.2 - Math.PI / 2);
    const na = -2.2 + 4.4 * w.needle.x;
    r.stroke(Gx, Gy, Gx + Math.sin(na) * Gr * 0.82, Gy - Math.cos(na) * Gr * 0.82, mx1(u), HOT);
    ell(r, Gx, Gy, mx1(1.6 * u), mx1(1.6 * u), DARK);
    for (let k = 0; k < 2; k++) { w.lamp[k] *= Math.exp(-dt * 4); ell(r, (0.1 + 0.07 * k) * N, 0.34 * N, 0.016 * N, 0.016 * N, w.lamp[k] > 0.3 ? (k ? COOL : HOT) : (k ? COOL : HOT) + DIM); }
    if (f.beat.pulse > 0.6) r.rect(0.08 * N, 0.37 * N, 0.11 * N, mx1(u), BRIGHT); // the ready light, on the beat
    ell(r, 0.66 * N, 0.18 * N, 0.035 * N, 0.035 * N, DARK);
    ell(r, 0.66 * N, 0.18 * N, 0.017 * N, 0.017 * N, LMID);
    targets.push({ x: Gx - Gr, y: Gy - Gr, w: 2 * Gr, h: 2 * Gr });
    // the drop: the jug comes up to the wand and the milk spins; its surface is the paraboloid y = ω²ρ²/2g, the same
    // volume of milk dipping in the middle and climbing the wall
    const steaming = bt < w.steamTo;
    if (bt < w.steamTo - 9) w.steamTo = -1; // (the beat clock started over)
    w.jug = follow(w.jug, steaming ? 1 : 0, dt, 0.25);
    w.spin = follow(w.spin, steaming ? 5 : 0, dt, steaming ? 0.6 : 1.2);
    w.spinA += w.spin * dt;
    const jit = steaming ? (hash(Math.floor(bt * 40), 3) - 0.5) * u : 0;
    if (w.jug > 0.02) {
      const jh = 0.24 * N, th = 1.5 * u, jx = 0.875 * N, jb = tipY + 0.012 * N + th + w.milk * (jh - 2 * th) + (1 - w.jug) * 0.5 * N, jwb = 0.095 * N, jwt = 0.075 * N, jt = jb - jh;
      r.ring(jx + jwb + 0.015 * N, jt + jh * 0.45, 0.032 * N, mx1(2 * u), DARK);
      r.rect(jx + jwb + 0.04 * N, jt + jh * 0.38, N, 0.035 * N, FIG); // the arm that holds it up
      ell(r, jx + jwb + 0.045 * N, jt + jh * 0.45, 0.028 * N, 0.022 * N, FIG);
      r.poly([[jx - jwt - 0.025 * N, jt - 0.01 * N], [jx - jwt + u, jt], [jx - jwt + 2 * u, jt + 0.03 * N]], LMID); // the spout
      r.poly([[jx - jwt, jt], [jx + jwt, jt], [jx + jwb, jb], [jx - jwb, jb]], LMID);
      const R = (jwt + jwb) / 2 - th, k2 = (w.spin * w.spin) / (2 * g), ym = jb - th - w.milk * (jh - 2 * th);
      for (let y = Math.round(jt + th); y < jb - th; y++) {
        const hw = lerp(jwt, jwb, (y - jt) / jh) - th;
        for (let x = Math.round(jx - hw); x < jx + hw; x++) { const dx = x + 0.5 - jx; r.set(x, y, y + 0.5 >= ym + k2 * (R * R / 2 - dx * dx) ? BRIGHT : DARK + DIM); }
      }
      for (let k = 0; k < 6; k++) { const a = w.spinA + (k * TAU) / 6, dx = Math.cos(a) * R * 0.8; r.set(jx + dx, ym + k2 * (R * R / 2 - dx * dx) - u * 0.5, Math.sin(a) > 0 ? WHITE : LMID); }
      if (steaming && w.jug > 0.8) for (let k = spawns(rnd, 28, dt); k > 0; k--) w.puffs.push(puff(jx + (rnd() - 0.5) * jwt * 1.6, jt, (rnd() - 0.5) * 0.06 * N, -0.28 * N, 1.6, 2));
      if (steaming) w.milk = Math.min(0.82, w.milk + dt * 0.03); // it stretches, and the jug is lowered to keep the tip just under
    } else w.milk = 0.55;
    // the wand, its rubber grip, the tip; puffs and the purge jet
    r.stroke(0.74 * N, 0.26 * N, 0.8 * N, 0.26 * N, mx1(3 * u), LMID);
    ell(r, 0.8 * N, 0.26 * N, 0.015 * N, 0.015 * N, LMID);
    r.stroke(0.8 * N, 0.26 * N, tipX + jit, tipY, mx1(2.4 * u), LMID);
    r.stroke(0.806 * N, 0.31 * N, 0.816 * N, 0.4 * N, mx1(3.6 * u), DARK);
    ell(r, tipX + jit, tipY, mx1(1.3 * u), mx1(1.3 * u), DARK);
    if (w.purge > 0) { w.purge -= dt; for (const k of [-1, 1]) w.puffs.push(puff(tipX, tipY + u, k * 0.25 * N, 0.05 * N, 0.9, 1)); }
    if (rnd() < dt * 0.6) w.puffs.push(puff(0.39 * N + (rnd() - 0.5) * 0.1 * N, 0.27 * N, 0, -0.02 * N, 1.2, 0.6)); // a wisp off the hot group
    w.puffs = steam(W, w.puffs.slice(-70), 0.01 * N, BRIGHT, 0.05);
  },
};

// ---------------------------------------------------------------------------------------------- pourover
// A pour-over from the side against a panelled wall: a gooseneck kettle, the dripper with its paper filter and the
// bed of grounds, the carafe below. The stream leaves the spout at its own speed and falls on a parabola onto the bed,
// thinning as it speeds up; the pourer aims it, the spout circling once every two beats in a spiral that opens and
// closes, and pours in pulses, six beats on and two off, the stream's head falling in and its tail falling away. The
// water stands in the cone and drains through the bed as the root of its depth (Torricelli): drips form at the
// outlet, fall into the carafe under gravity and ring its surface as the carafe fills; when the flow is strong they
// run together into a thread. A kick blooms the bed (it swells, and CO2 bubbles rise through it and pop), a snare is
// the swirl that flattens it, a note sets the spiral's reach; steam rises off the kettle, the slurry and the carafe,
// slowing as it cools. The kind is the brewer: a cone, a flat-bottomed basket with three holes, or the hourglass in
// its wooden collar. A full carafe slides out for a fresh brewer; a drop is the agitation pour, fast and wide.
const BREW_W = { cone: [3, 2, 1], flat: [1, 2, 2], hourglass: [2, 2, 1] };
// the dripper (rim and bottom: y and half width, screens), its outlets, the carafe's shape (half width at y)
const flask = (y) => (y < 0.655 ? 0.05 : 0.05 + 0.1 * Math.sqrt(Math.max(0, 1 - ((y - 0.8) / 0.145) ** 2)));
const BREWS = {
  cone: { ry: 0.37, rw: 0.155, by: 0.585, bw: 0.022, outs: [0], top: 0.6, car: flask },
  flat: { ry: 0.39, rw: 0.15, by: 0.565, bw: 0.07, outs: [-0.03, 0, 0.03], top: 0.6, car: flask },
  hourglass: { ry: 0.36, rw: 0.16, by: 0.58, bw: 0.026, outs: [0], top: 0.58, glass: true, car: (y) => (y < 0.84 ? 0.026 + 0.124 * ((y - 0.58) / 0.26) ** 0.7 : 0.15 - 0.5 * (y - 0.84)) },
};
// the kettle, drawn about the middle of its body: the body's outline, the handle, the gooseneck out to its tip
const KETTLE = { body: [[-0.1, 0.07], [0.1, 0.07], [0.1, 0.02], [0.087, -0.015], [0.05, -0.045], [0, -0.055], [-0.05, -0.045], [-0.087, -0.015], [-0.1, 0.02]],
  handle: [[-0.085, -0.035], [-0.15, -0.025], [-0.155, 0.045], [-0.1, 0.055]], neck: [[0.08, 0.06], [0.13, 0.045], [0.165, 0], [0.19, -0.045], [0.22, -0.06], [0.245, -0.045]] };

const pourover = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, BREW_W, bandOf(W.a)), water: 0, bloom: 0, carafe: 0.08, drip: [0, 0, 0], drops: [], rings: [], bubs: [], puffs: [], pourOn: false, ps: 9, tilt: 0,
      rc: 0.05, swirl: 0, agitTo: -1, swap: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bt = beatT(w, f, dt), g = GR * N;
    if (f.section === 'change' && w.swap <= 0) w.swap = 1;
    if (f.section === 'drop') { w.agitTo = bt + 8; w.bloom = Math.max(w.bloom, 1); s.shake = Math.max(s.shake, 0.2); }
    if (bt < w.agitTo - 9) w.agitTo = -1; // (the beat clock started over)
    for (const hh of hits) {
      if (isLow(hh)) { w.bloom = Math.min(1.3, w.bloom + 0.5 * hh.strength); for (let k = 0; k < 3 + 4 * hh.strength; k++) w.bubs.push({ x: (rnd() - 0.5) * 1.6, r: 0, rm: (0.8 + rnd()) * u, t: 0 }); }
      else if (hh.kind === 'snare') { w.swirl = 1; w.bloom *= 0.6; }
      else if (hh.kind === 'hat') w.bubs.push({ x: (rnd() - 0.5) * 1.6, r: 0, rm: 0.7 * u, t: 0 });
      if (isTonal(hh)) w.rc = 0.025 + (0.06 * hh.pc) / 11;
    }
    // a full carafe (or a new section) slides the brewer out and a fresh one in, of the kind the mood rolls
    if (w.swap > 0) {
      const was = w.swap;
      w.swap = Math.max(0, w.swap - dt / 1.4);
      if (was > 0.5 && w.swap <= 0.5) { w.kind = rollW(rnd, BREW_W, band); w.carafe = 0.08; w.water = 0; w.bloom = 0; w.drops.length = 0; w.rings.length = 0; w.bubs.length = 0; }
    } else if (w.carafe >= 1) w.swap = 1;
    const B = BREWS[w.kind], off = w.swap > 0.5 ? ((1 - w.swap) * 2) ** 2 * 0.7 * N : (w.swap * 2) ** 2 * 0.7 * N, cx = 0.5 * N + off;
    // the pour: six beats on, two off; the agitation pours hard and wide at a circle a beat
    const agit = bt < w.agitTo, on = w.swap <= 0 && (agit || ((bt % 8) + 8) % 8 < 6), q = agit ? 1.3 : 0.45 + 0.55 * f.level;
    if (on !== w.pourOn) { w.pourOn = on; w.ps = 0; } else w.ps += dt;
    w.tilt = follow(w.tilt, on ? 0.38 : 0.05, dt, 0.15);
    // the water stands in the cone and drains through the bed as the root of its depth; the bed blooms and settles
    const yb = B.ry + (B.by - B.ry) * 0.62, rcT = agit ? 0.085 : w.rc * (0.55 + 0.45 * Math.abs(Math.sin((Math.PI * bt) / 8))) * (0.8 + 0.4 * clamp(f.rel.midDrive));
    const phi = Math.PI * bt * (agit ? 2 : 1), X = 0.5 * N + rcT * N * Math.cos(phi), wl = (yb - 0.012 - w.water * 0.1 - w.bloom * 0.02) * N;
    // the kettle aimed so that the stream, leaving the tip at v0 along the spout, lands at X on the water
    const v0 = 0.12 * N, ka = w.tilt, KS = 1.2 * N, P = turn(0, 0, ka), tl = P(KETTLE.neck[5][0] * KS, KETTLE.neck[5][1] * KS), tb = P(KETTLE.neck[4][0] * KS, KETTLE.neck[4][1] * KS);
    const ea = Math.atan2(tl[1] - tb[1], tl[0] - tb[0]), vx0 = v0 * Math.cos(ea), vy0 = v0 * Math.sin(ea), ky = 0.22 * N + Math.sin(phi) * 0.008 * N;
    const fallT = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * g * Math.max(1, wl - (ky + tl[1])))) / g, kx = X - vx0 * fallT - tl[0];
    const landed = on && w.ps > fallT;
    w.water = clamp(w.water + dt * ((landed ? 0.2 * q : 0) - 0.18 * Math.sqrt(w.water)));
    w.bloom = follow(w.bloom, 0, dt, 2.5);
    w.swirl = Math.max(0, w.swirl - dt * 0.8);
    // the wall's panels, the counter
    r.rect(0, 0, N, 0.9 * N, DARK);
    for (let x = 6 * u; x < N; x += 14 * u) r.rect(x, 0, mx1(u * 0.6), 0.9 * N, DARK + DIM);
    r.rect(0, 0.9 * N, N, 0.1 * N, LMID);
    r.rect(0, 0.9 * N, N, mx1(u), BRIGHT);
    // the carafe: its handle, the coffee in it with the rings of the drips, the glass, a highlight
    const car = B.car, lvl = (0.895 - clamp(w.carafe) * (B.glass ? 0.22 : 0.19)) * N;
    if (!B.glass) r.ring(cx + 0.15 * N, 0.775 * N, 0.055 * N, mx1(2.2 * u), FIG);
    for (let y = Math.round(B.top * N); y < 0.9 * N; y++) {
      const hw = car(y / N) * N;
      if (y >= lvl) span(r, y, cx - hw + 1.5 * u, cx + hw - 1.5 * u, MID);
      r.set(cx - hw, y, LMID);
      r.set(cx + hw - 1, y, LMID);
      if (y % 3 === 0 && y > 0.68 * N && y < 0.86 * N) r.set(cx - hw + 2 * u, y, WHITE);
    }
    span(r, lvl, cx - car(lvl / N) * N + 1.5 * u, cx + car(lvl / N) * N - 1.5 * u, LMID);
    span(r, 0.9 * N - u, cx - car(0.89) * N, cx + car(0.89) * N, LMID);
    w.rings = w.rings.filter((rg) => { rg.t += dt; circ(r, cx + rg.x, lvl, rg.t * 0.15 * N, LMID, 0.3); return rg.t < 0.3; });
    // the drips: a drop grows at each outlet with the outflow and falls when it is heavy; a strong outflow is a thread
    const out = 0.18 * Math.sqrt(w.water) + 0.012, oy = (B.by + 0.004) * N;
    for (let k = 0; k < B.outs.length; k++) {
      const ox = cx + B.outs[k] * N;
      if ((w.drip[k] += (dt * out * 30) / B.outs.length) >= 1) { w.drip[k] -= 1; w.drops.push({ x: ox, y: oy, vy: 0 }); }
      if (out > 0.1 && w.swap <= 0) r.rect(ox - mx1(0.6 * u) / 2, oy, mx1(0.6 * u), lvl - oy, MID);
      r.rect(ox - u * 0.5, oy, mx1(u), mx1(u * (0.5 + w.drip[k])), MID);
    }
    w.drops = w.drops.filter((d) => {
      d.vy += g * dt;
      d.y += d.vy * dt;
      if (d.y >= lvl) { w.carafe += 0.003; w.rings.push({ x: d.x - cx, t: 0 }); return false; }
      r.rect(d.x - u * 0.5, d.y - u, mx1(u), mx1(1.5 * u), MID);
      return true;
    });
    // the dripper: its base on the carafe (or the hourglass's collar), the walls in section, the paper, the bed and the
    // water standing on it
    const hwC = (y) => lerp(B.rw, B.bw, (y / N - B.ry) / (B.by - B.ry)) * N;
    if (B.glass) {
      r.poly([[cx - 0.07 * N, 0.52 * N], [cx + 0.07 * N, 0.52 * N], [cx + 0.035 * N, 0.58 * N], [cx + 0.05 * N, 0.64 * N], [cx - 0.05 * N, 0.64 * N], [cx - 0.035 * N, 0.58 * N]], MID);
      ell(r, cx + 0.05 * N, 0.58 * N, 0.012 * N, 0.01 * N, DARK);
      r.line(cx + 0.05 * N, 0.58 * N, cx + 0.065 * N, 0.62 * N, DARK);
      r.line(cx + 0.05 * N, 0.58 * N, cx + 0.07 * N, 0.61 * N, DARK);
    } else r.rect(cx - 0.08 * N, (B.by - 0.002) * N, 0.16 * N, 0.016 * N, FIG);
    const wallC = B.glass ? LMID : FIG, ryN = B.ry * N, byN = B.by * N;
    for (let y = Math.round(ryN); y < byN; y++) {
      const hw = hwC(y), inner = hw - 2 * u;
      if (y >= wl) for (let x = Math.round(cx - inner); x < cx + inner; x++) {
        const dx = (x + 0.5 - cx) / Math.max(1, inner), surf = (yb - w.bloom * 0.03 * (1 - dx * dx)) * N;
        r.set(x, y, y >= surf ? (hash(x, y) < 0.3 ? MID : DARK) : y < surf - 1 || w.water > 0.05 ? MID + DIM : LMID);
      }
      r.set(cx - hw, y, wallC); r.set(cx - hw + 1, y, wallC); r.set(cx + hw - 1, y, wallC); r.set(cx + hw - 2, y, wallC);
      r.set(cx - inner, y, BRIGHT); r.set(cx + inner - 1, y, BRIGHT); // the paper
    }
    if (!B.glass) r.rect(cx - B.bw * N, byN - 2 * u, 2 * B.bw * N, 2 * u, FIG);
    r.rect(cx - B.rw * N - 1.5 * u, ryN - 1.5 * u, 2 * B.rw * N + 3 * u, 1.5 * u, wallC);
    for (let x = Math.round(cx - B.rw * N + 2 * u); x < cx + B.rw * N - 2 * u; x += Math.max(2, Math.round(2 * u))) r.set(x, ryN - 2 * u - (x % 3 ? 0 : 1), BRIGHT); // the paper's pleated edge
    span(r, wl, cx - hwC(wl) + 2 * u, cx + hwC(wl) - 2 * u, w.water > 0.05 ? LMID : MID);
    if (w.swirl > 0.05) for (let k = 0; k < 4; k++) { const a = bt * 5 + k * 1.57; r.set(cx + Math.cos(a) * hwC(wl) * 0.7, wl + u, BRIGHT); }
    // the bloom's bubbles: they swell through the wet bed and pop at the top as a ring
    for (let k = spawns(rnd, 12 * w.bloom, dt); k > 0; k--) w.bubs.push({ x: (rnd() - 0.5) * 1.6, r: 0, rm: (0.6 + rnd() * 0.8) * u, t: 0 });
    w.bubs = w.bubs.slice(-40).filter((b) => {
      b.t += dt;
      b.r = Math.min(b.rm, b.r + dt * 3 * u);
      const bx = cx + b.x * hwC(wl) * 0.6;
      if (b.t < 0.6) circ(r, bx, wl - b.r * 0.5, b.r, LMID); else circ(r, bx, wl - b.r * 0.5, b.r * 1.8, BRIGHT, 0.5);
      return b.t < 0.7;
    });
    targets.push({ x: cx - B.rw * N, y: ryN, w: 2 * B.rw * N, h: byN - ryN });
    // the stream: its head falls in when the pour starts and its tail falls away when it stops; it thins as it speeds up
    const ty0 = ky + tl[1], tx0 = kx + tl[0], tA = on ? 0 : w.ps, tB = on ? Math.min(w.ps, fallT) : fallT;
    if (tB > tA && w.swap <= 0) {
      let px = tx0 + vx0 * tA, py = ty0 + vy0 * tA + 0.5 * g * tA * tA;
      for (let k = 1; k <= 14; k++) {
        const tt = tA + ((tB - tA) * k) / 14, nx = tx0 + vx0 * tt, ny = ty0 + vy0 * tt + 0.5 * g * tt * tt, sp = Math.hypot(vx0, vy0 + g * tt);
        r.stroke(px, py, nx, ny, Math.max(0.8, 1.8 * u * Math.sqrt(q * (v0 / sp))), BRIGHT);
        px = nx;
        py = ny;
      }
      if (on && w.ps > fallT) { r.set(X - u, wl - u, WHITE); r.set(X + u, wl - u, WHITE); } // the splash where it lands
    }
    // the kettle, tipped to pour: the body, the lid's knob, the handle, the gooseneck
    const KP = turn(kx, ky, ka), mp = (pts) => pts.map(([a, b]) => KP(a * KS, b * KS)), hp = mp(KETTLE.handle), np = mp(KETTLE.neck);
    for (let k = 1; k < hp.length; k++) r.stroke(hp[k - 1][0], hp[k - 1][1], hp[k][0], hp[k][1], mx1(3 * u), FIG);
    for (let k = 1; k < np.length; k++) r.stroke(np[k - 1][0], np[k - 1][1], np[k][0], np[k][1], mx1((3.5 - k * 0.35) * u), FIG);
    r.poly(mp(KETTLE.body), FIG);
    const kn = KP(0, -0.062 * KS), hl = mp([[-0.06, -0.03], [-0.02, -0.048]]);
    ell(r, kn[0], kn[1], 0.012 * KS, 0.008 * KS, FIG);
    r.line(hl[0][0], hl[0][1], hl[1][0], hl[1][1], BRIGHT);
    targets.push({ x: kx - 0.18 * KS, y: ky - 0.07 * KS, w: 0.45 * KS, h: 0.14 * KS });
    // steam off the spout, the slurry and the carafe's neck, rising slower as it cools
    if (rnd() < dt * (1 + 2 * f.level)) w.puffs.push(puff(tx0, ty0 - u, 0.01 * N, -0.05 * N, 1.4, 0.7));
    if (rnd() < dt * (1.5 + 4 * w.water + (agit ? 6 : 0))) w.puffs.push(puff(cx + (rnd() - 0.5) * B.rw * N, ryN - 2 * u, 0, -0.08 * N, 1.8, 1));
    if (rnd() < dt * 0.8) w.puffs.push(puff(cx + (rnd() - 0.5) * 0.04 * N, (B.top + 0.03) * N, 0, -0.03 * N, 1.2, 0.6));
    w.puffs = steam(W, w.puffs.slice(-50), 0.008 * N, BRIGHT, 0.04);
  },
};

// ---------------------------------------------------------------------------------------------- cafe
// A café counter from the customers' side: a menu board of lines and shapes, a shelf of cups, the window onto the
// street, the back counter with the machine and the grinder, two baristas behind the front counter and a queue in
// front of it. The baristas cross between the machine, the grinder and the counter, a trip every two beats, starting on
// the beat, their legs in step with how far they go; one swirls a milk jug in small circles, two to the beat. The
// grinder buzzes on the hats (it shivers and grounds fall into the dose cup), a kick sets a cup down on the counter
// with a clink, a snare is the wand's hiss, the steam off the cups and the machine rises and slows. The queue
// shuffles up a step a bar: the one in front takes a cup and walks off, a new one comes in at the door. The kind is
// the hour outside: rain on the glass (drops that cling, run and merge), a sunny morning that lays its light across the
// floor, or the night street with its lit windows. A drop is the rush: everyone at twice the pace for two bars.
const CAFE_W = { rain: [3, 2, 1], morning: [1, 2, 3], night: [2, 2, 1] };
const QX = (i) => 0.72 + i * 0.09; // the queue's places, from the end of the counter to the door
function customer(rnd, x, slot) {
  const k = Math.floor(rnd() * 4);
  return { x, slot, state: 'in', ph: rnd() * TAU, dir: -1, cup: false, h: 0.3 + rnd() * 0.05, o: [{ hat: true }, { coat: true }, { cap: true }, { coat: true, hat: true }][k], scarf: rnd() < 0.5 ? HOT : COOL };
}

const cafe = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, CAFE_W, bandOf(W.a)), bar: [{ x: 0.16, tx: 0.16, ph: 0, dir: 1, st: 0, from: 0.16 }, { x: 0.36, tx: 0.36, ph: 1, dir: -1, st: 0, from: 0.36 }],
      q: [], cups: [], sparks: [], grains: [], grind: 0, puffs: [], glass: { drops: [], trails: [], id: 0 }, rushTo: -1, beats: 0, lastBar: -1 });
    for (let i = 0; i < 3; i++) { const c = customer(rnd, QX(i), i); c.state = 'queue'; w.q.push(c); }
    for (let i = 0; i < 2; i++) w.cups.push({ x: 0.6 - i * 0.045, t: 1 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bt = beatT(w, f, dt), kind = w.kind;
    if (f.section === 'change') w.kind = rollW(rnd, CAFE_W, band);
    if (f.section === 'drop') { w.rushTo = bt + 8; s.shake = Math.max(s.shake, 0.2); }
    if (bt < w.rushTo - 9) w.rushTo = -1; // (the beat clock started over)
    const rush = bt < w.rushTo, beat = tick(w, f, dt), per = rush ? 1 : 2;
    if (beat) w.beats++;
    for (const hh of hits) {
      if (isLow(hh) && w.cups.length < 5) { const x = 0.6 - w.cups.length * 0.045; w.cups.push({ x, t: 0 }); w.sparks.push({ x: x * N + 0.02 * N, y: 0.6 * N, t: 0.15 }); }
      else if (hh.kind === 'snare') for (let k = 0; k < 3; k++) w.puffs.push(puff(0.28 * N, 0.42 * N, (0.1 + 0.1 * rnd()) * N, -0.05 * N, 1.2, 1.2));
      else if (hh.kind === 'hat') w.grind = 0.25;
    }
    if (rush) { w.grind = 0.2; if (beat && w.cups.length < 5) w.cups.push({ x: 0.6 - w.cups.length * 0.045, t: 0 }); }
    // the room: the wall, the menu board (lines, dots and shapes, nothing to read), the shelf of cups
    r.rect(0.05 * N, 0.05 * N, 0.36 * N, 0.23 * N, FIG);
    r.rect(0.06 * N, 0.06 * N, 0.34 * N, 0.21 * N, DARK);
    for (let k = 0; k < 5; k++) {
      const y = (0.09 + k * 0.035) * N, len = (0.1 + 0.12 * hash(k, 3)) * N;
      ell(r, 0.085 * N, y, 1.2 * u, 1.2 * u, k === 1 ? HOT : BRIGHT);
      r.rect(0.1 * N, y - 0.5 * u, len, mx1(u), LMID);
      for (let x = 0.1 * N + len + 2 * u; x < 0.33 * N; x += 2 * u) r.set(x, y, MID);
      r.rect(0.34 * N, y - 0.5 * u, 0.04 * N, mx1(u), BRIGHT);
    }
    r.poly([[0.3 * N, 0.24 * N], [0.36 * N, 0.24 * N], [0.35 * N, 0.26 * N], [0.31 * N, 0.26 * N]], BRIGHT);
    r.ring(0.365 * N, 0.25 * N, 0.008 * N, mx1(u), BRIGHT);
    r.rect(0.42 * N, 0.3 * N, 0.18 * N, mx1(1.5 * u), MID);
    for (let k = 0; k < 5; k++) r.poly([[(0.435 + k * 0.034) * N, 0.3 * N], [(0.457 + k * 0.034) * N, 0.3 * N], [(0.453 + k * 0.034) * N, 0.275 * N], [(0.439 + k * 0.034) * N, 0.275 * N]], k % 2 ? FIG : LMID);
    // the window and the street behind it, by the hour
    const wx0 = 0.63 * N, wx1 = 0.95 * N, wy0 = 0.06 * N, wy1 = 0.44 * N;
    r.rect(wx0, wy0, wx1 - wx0, wy1 - wy0, kind === 'morning' ? BRIGHT : kind === 'night' ? DARK + DIM : MID + DIM);
    if (kind === 'morning') ell(r, 0.86 * N, 0.13 * N, 0.04 * N, 0.04 * N, HOT);
    for (let k = 0; k < 4; k++) {
      const bx = wx0 + k * 0.085 * N, bh = (0.12 + 0.1 * hash(k, 7)) * N;
      r.rect(bx, wy1 - bh, 0.075 * N, bh, kind === 'morning' ? MID + DIM : DARK);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) if (kind === 'night' ? hash(k * 7 + j, i) < 0.6 : kind === 'rain' && hash(k, j + i * 3) < 0.3) r.rect(bx + (0.012 + i * 0.03) * N, wy1 - bh + (0.02 + j * 0.035) * N, 0.018 * N, 0.018 * N, kind === 'night' ? (hash(j, k) < 0.5 ? HOT : BRIGHT) : LMID + DIM);
    }
    if (kind === 'rain') {
      for (let k = 0; k < 26; k++) { const q = (hash(k, 2) + t * (1.2 + hash(k, 3))) % 1, y = wy0 + q * (wy1 - wy0), x = wx0 + ((((hash(k, 1) - (0.375 * q * (wy1 - wy0)) / (wx1 - wx0)) % 1) + 1) % 1) * (wx1 - wx0); r.line(x, y, x - 1.5 * u, y + 4 * u, LMID + DIM); } // each falls along its slant
      if (rnd() < dt * (4 + 6 * f.level)) newDrop(w.glass, wx0 + rnd() * (wx1 - wx0), wy0 + rnd() * (wy1 - wy0) * 0.8, (0.4 + 0.5 * rnd()) * u);
      glassDrops(W, w.glass, wx0 + u, wy0, wx1 - u, wy1 - u, BRIGHT, LMID + DIM);
    }
    r.frame(wx0, wy0, wx1 - wx0, wy1 - wy0, FIG);
    r.rect(wx0, (wy0 + wy1) / 2, wx1 - wx0, mx1(1.5 * u), FIG);
    r.rect((wx0 + wx1) / 2, wy0, mx1(1.5 * u), wy1 - wy0, FIG);
    r.rect(wx0 - u, wy1, wx1 - wx0 + 2 * u, mx1(2 * u), LMID);
    // the back counter: the machine with its two groups, the grinder shivering when it runs
    r.rect(0, 0.5 * N, 0.62 * N, 0.12 * N, MID + DIM);
    r.rect(0, 0.5 * N, 0.62 * N, mx1(u), LMID);
    r.rect(0.05 * N, 0.36 * N, 0.22 * N, 0.14 * N, MID);
    r.rect(0.05 * N, 0.36 * N, 0.22 * N, mx1(u), LMID);
    for (const k of [0.1, 0.19]) { r.rect(k * N, 0.43 * N, 0.04 * N, 0.025 * N, DARK); r.rect(k * N + 0.005 * N, 0.455 * N, 0.03 * N, mx1(u), LMID); }
    ell(r, 0.16 * N, 0.39 * N, 0.015 * N, 0.015 * N, BRIGHT);
    const gj = w.grind > 0 ? (hash(Math.floor(t * 60), 1) - 0.5) * u : 0, gx = 0.34 * N + gj;
    r.poly([[gx - 0.035 * N, 0.33 * N], [gx + 0.035 * N, 0.33 * N], [gx + 0.015 * N, 0.38 * N], [gx - 0.015 * N, 0.38 * N]], LMID + DIM);
    r.rect(gx - 0.025 * N, 0.38 * N, 0.05 * N, 0.08 * N, DARK);
    r.rect(gx + 0.02 * N, 0.44 * N, 0.015 * N, mx1(1.5 * u), LMID);
    r.rect(gx + 0.022 * N, 0.48 * N, 0.022 * N, 0.02 * N, LMID); // the dose cup
    if ((w.grind -= dt) > 0) for (let k = 0; k < 2; k++) w.grains.push({ x: gx + 0.03 * N + (rnd() - 0.5) * u, y: 0.45 * N, vy: 0 });
    w.grains = w.grains.filter((p) => { p.vy += GR * N * dt; p.y += p.vy * dt; r.set(p.x, p.y, MID); return p.y < 0.48 * N; });
    if (rnd() < dt * (rush ? 4 : 1.2)) w.puffs.push(puff((0.1 + 0.1 * rnd()) * N, 0.36 * N, 0, -0.06 * N, 1.5, 1));
    // the baristas: a trip every two beats (one in the rush), starting on the beat; the legs go with the ground covered
    const H0 = 0.42 * N, base0 = 0.9 * N;
    w.bar.forEach((b, i) => {
      const stops = i === 0 ? [0.16, 0.52] : [0.36, 0.26];
      if (beat && (w.beats + i) % per === 0) { b.st = 1 - b.st; b.from = b.x; b.tx = stops[b.st]; }
      const spd = (Math.abs(b.tx - b.from) / (per * 0.6 / bps(f))) * N, was = b.x * N, nx = was + Math.sign(b.tx * N - was) * Math.min(Math.abs(b.tx * N - was), spd * dt);
      if (Math.abs(nx - was) > 1e-3) { b.dir = Math.sign(nx - was); b.ph += Math.abs(nx - was) / (0.1 * H0); }
      b.x = nx / N;
      const J = walker(r, b.x * N, base0, H0, FIG, b.ph, b.dir, { cap: i === 1 });
      r.rect(b.x * N - J.hw * 0.8, J.sy + H0 * 0.12, J.hw * 1.6, H0 * 0.3, LMID); // the apron
      if (i === 1) { // the milk jug, swirled in little circles, two to the beat
        const a = TAU * 2 * bt, jx = J.sx + b.dir * 0.02 * N + Math.cos(a) * 1.5 * u, jy = J.sy + H0 * 0.2 + Math.sin(a) * 0.6 * u;
        r.poly([[jx - 0.016 * N, jy - 0.03 * N], [jx + 0.016 * N, jy - 0.03 * N], [jx + 0.02 * N, jy + 0.01 * N], [jx - 0.02 * N, jy + 0.01 * N]], BRIGHT);
      }
      targets.push({ x: b.x * N - 0.04 * N, y: J.top, w: 0.08 * N, h: 0.62 * N - J.top });
    });
    // the front counter, the cups waiting with their steam, the clink of one set down
    r.rect(0, 0.62 * N, 0.65 * N, 0.025 * N, LMID);
    r.rect(0, 0.62 * N, 0.65 * N, mx1(u), BRIGHT);
    r.rect(0, 0.645 * N, 0.65 * N, 0.215 * N, MID);
    for (let x = 4 * u; x < 0.65 * N; x += 7 * u) r.rect(x, 0.66 * N, mx1(u), 0.19 * N, MID + DIM);
    w.cups.forEach((c, i) => { c.x = follow(c.x, 0.6 - i * 0.045, dt, 0.15); }); // pushed along toward the end as the first is taken
    for (const c of w.cups) {
      c.t += dt;
      r.poly([[c.x * N - 0.014 * N, 0.595 * N], [c.x * N + 0.014 * N, 0.595 * N], [c.x * N + 0.01 * N, 0.62 * N], [c.x * N - 0.01 * N, 0.62 * N]], FIG);
      r.ring(c.x * N + 0.016 * N, 0.606 * N, 0.006 * N, mx1(u), FIG);
      if (rnd() < dt * 0.8) w.puffs.push(puff(c.x * N, 0.59 * N, 0, -0.03 * N, 1.2, 0.6));
    }
    w.sparks = w.sparks.filter((sp) => { for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0.7, -0.7], [-0.7, -0.7]]) r.line(sp.x + dx * 1.5 * u, sp.y + dy * 1.5 * u, sp.x + dx * 3.5 * u, sp.y + dy * 3.5 * u, WHITE); return (sp.t -= dt) > 0; });
    // the floor, and the morning sun laid across it through the window
    for (let y = Math.round(0.86 * N), k = 0; y < N; k++) { const hh = Math.max(2, Math.round((3 + k * 1.5) * u)); for (let x = 0, j = 0; x < N; x += 10 * u, j++) r.rect(x, y, 10 * u, hh, (j + k) % 2 ? LMID + DIM : MID + DIM); y += hh; }
    if (kind === 'morning') for (let y = Math.round(0.86 * N); y < N; y++) for (let x = Math.round(0.4 * N + (y - 0.86 * N) * 0.8); x < 0.75 * N + (y - 0.86 * N) * 0.8; x++) if (bayer(x, y) < 0.35) r.set(x, y, BRIGHT);
    // the queue: a step up a bar (each beat in the rush); the one at the counter takes a cup and goes
    const bar = beatLocked(f) ? Math.floor(f.beat.count / (rush ? 2 : 4)) : Math.floor(w.beats / (rush ? 2 : 4));
    if (bar !== w.lastBar) {
      if (w.lastBar >= 0) {
        const front = w.q.find((c) => c.state === 'queue' && c.slot === 0);
        if (front && Math.abs(front.x - QX(0)) < 0.01) {
          front.state = 'out'; front.dir = -1;
          if (w.cups.length) { front.cup = true; w.cups.shift(); }
          for (const c of w.q) if (c.state !== 'out') c.slot = Math.max(0, c.slot - 1);
          const c = customer(rnd, 1.15, w.q.filter((q) => q.state !== 'out').length);
          w.q.push(c);
        }
      }
      w.lastBar = bar;
    }
    const cs = 0.3 * N * (rush ? 2 : 1);
    for (const c of w.q) {
      const tx = c.state === 'out' ? -0.3 : QX(c.slot), was = c.x * N, nx = was + Math.sign(tx * N - was) * Math.min(Math.abs(tx * N - was), cs * dt);
      if (Math.abs(nx - was) > 1e-3) { c.dir = Math.sign(nx - was); c.ph += Math.abs(nx - was) / (0.1 * c.h * N); }
      if (c.state === 'in' && Math.abs(nx - tx * N) < 1) c.state = 'queue';
      c.x = nx / N;
    }
    w.q = w.q.filter((c) => c.x > -0.25);
    for (const c of [...w.q].sort((a, b) => b.x - a.x)) {
      const J = walker(r, c.x * N, 0.98 * N, c.h * N, DARK, c.ph, c.dir, c.o);
      r.rect(c.x * N - J.hw, J.sy - 0.01 * N, J.hw * 2, mx1(1.5 * u), c.scarf);
      if (c.cup) r.rect(J.sx + c.dir * u - 0.008 * N, J.sy + c.h * N * 0.18, 0.016 * N, 0.02 * N, FIG);
    }
    w.puffs = steam(W, w.puffs.slice(-50), 0.006 * N, BRIGHT, 0.04);
  },
};

// ---------------------------------------------------------------------------------------------- roaster
// A drum roaster cut open, against a brick wall: the drum turns one vane over the top a beat, the bed of beans rides
// up the rising wall as a rigid body, and its top layer rolls down the slope at the angle of repose; the vanes scoop
// beans out of the bed and, as they tilt past the friction angle, let them go with the drum's own speed at that radius,
// so they fly in parabolas across the drum and fall back into the bed (a cascading tumble). Gas flames lick the drum,
// higher with the bass; the chaff is drawn up the flue into the cyclone and smoke leaves it, more as the roast darkens.
// The roast turns the beans green, tan, brown and dark, bean by bean, a stage per section; a kick is the first crack
// (beans pop on small parabolas and chaff flies), a snare tips the top vane's load at once, a note flares a jet. A drop
// (or a finished roast) opens the door: the batch pours down the chute into the cooling tray, where a turning arm stirs
// it, and the hopper drops in the next green batch. The kind is the machine: a shop roaster, a quick sample roaster or
// a big slow one.
const ROAST_W = { shop: [3, 2, 1], sample: [1, 2, 3], factory: [2, 1, 1] };
const ROASTERS = { shop: { R: 0.25, K: 6 }, sample: { R: 0.2, K: 4 }, factory: { R: 0.29, K: 8 } };
const BEAN = [COOL, LMID, MID, DARK]; // green, tan, brown, dark
const REPOSE = 0.55; // the bed's slope while the drum turns (the dynamic angle of repose), radians
// the bean slots of the bed: rings of beans fixed in the drum, turning with it
function roastTables(W) {
  const { w, N, u } = W, R = ROASTERS[w.kind].R * N - 2 * u, rho = [], th = [], hs = [];
  for (let p = R - 1.2 * u; p > 0.3 * R; p -= 2 * u) {
    const n = Math.floor((TAU * p) / (2.6 * u));
    for (let k = 0; k < n; k++) { const i = rho.length; rho.push(p + (hash(i, 5) - 0.5) * 0.6 * u); th.push((k + hash(i, 6) * 0.5) * (TAU / n)); hs.push(hash(i, 7)); }
  }
  Object.assign(w, { N, kindT: w.kind, rho: Float32Array.from(rho), th: Float32Array.from(th), hs: Float32Array.from(hs) });
}
// one bean at (x, y), its long axis along `a`, coloured by the roast
function bean(r, x, y, a, u, c) {
  const along = Math.abs(Math.cos(a)) > 0.7, L = mx1(2.4 * u), S = mx1(1.4 * u);
  if (along) r.rect(x - L / 2, y - S / 2, L, S, c); else r.rect(x - S / 2, y - L / 2, S, L, c);
  if (u > 1.3) { if (along) r.rect(x - L / 2 + u * 0.5, y, L - u, 1, dim(c)); else r.rect(x, y - L / 2 + u * 0.5, 1, L - u, dim(c)); }
}

const roaster = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, ROAST_W, bandOf(W.a)), roast: 0, fill: 1, phase: 'roast', pb: 0, fly: [], chaff: [], puffs: [], held: new Uint16Array(8).fill(4095), flare: new Float32Array(8), tray: [], arm: 0, chute: [], next: null });
    roastTables(W);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bt = beatT(w, f, dt), g = GR * N;
    if (w.N !== N || w.kindT !== w.kind) roastTables(W);
    const RK = ROASTERS[w.kind], K = RK.K, cx = 0.4 * N, cy = 0.42 * N, Rd = RK.R * N, R = Rd - 2 * u, rot = (TAU / K) * bt, om = (TAU / K) * bps(f);
    if (f.section === 'change') { if (w.phase === 'roast') w.roast = Math.min(3.5, Math.floor(w.roast) + 1); w.next = rollW(rnd, ROAST_W, band); }
    if (f.section === 'drop' && w.phase === 'roast') { w.phase = 'dump'; w.pb = bt; s.shake = Math.max(s.shake, 0.3); }
    if (w.pb > bt) w.pb = bt; // (the beat clock started over)
    // the batch: roasting (a stage every 24 beats, or a section), dumped, cooled while the next is loaded
    const pe = bt - w.pb;
    if (w.phase === 'roast') { w.roast = Math.min(3.6, w.roast + (dt * bps(f)) / 24); if (w.roast >= 3.55) { w.phase = 'dump'; w.pb = bt; } }
    else if (w.phase === 'dump') { w.fill = Math.max(0, 1 - pe / 6); if (pe > 7) { w.phase = 'load'; w.pb = bt; w.roast = 0; if (w.next) { w.kind = w.next; w.next = null; } } }
    else if (w.phase === 'load') { w.fill = Math.min(1, pe / 4); if (pe > 4) { w.phase = 'roast'; w.pb = bt; } }
    const h = R * (0.38 + 0.62 * (1 - w.fill)), nx = Math.sin(REPOSE), ny = -Math.cos(REPOSE), inBed = (x, y) => (x - cx) * nx + (y - cy) * ny <= -h;
    const colOf = (hq) => BEAN[Math.max(0, Math.min(3, Math.floor(w.roast + (hq - 0.5) * 0.7)))];
    for (const hh of hits) {
      if (isLow(hh) && w.fill > 0.2) { // the crack: beans pop off the bed's surface, and once they have dried the chaff comes away
        const Lh = Math.sqrt(Math.max(0, R * R - h * h));
        for (let k = 0; k < 2 + 4 * hh.strength; k++) { const sAl = (rnd() - 0.5) * 1.6 * Lh, x = cx - h * nx + sAl * Math.cos(REPOSE), y = cy - h * ny + sAl * Math.sin(REPOSE) - u; w.fly.push({ x, y, vx: (rnd() - 0.5) * 0.2 * N, vy: -(0.2 + 0.25 * rnd()) * N, hq: rnd() }); }
        if (w.roast > 0.8) for (let k = 0; k < 6; k++) w.chaff.push({ x: cx + (rnd() - 0.5) * R, y: cy + h * 0.5, vx: (rnd() - 0.5) * 0.1 * N, vy: -0.15 * N, life: 2.5 });
      } else if (hh.kind === 'snare') w.dumpVane = true;
      else if (hh.kind === 'hat') w.puffs.push(puff(0.82 * N, 0.05 * N, 0, -0.05 * N, 1.6, 1 + w.roast * 0.4));
      if (isTonal(hh)) w.flare[Math.floor((hh.pc * 7) / 12)] = 1;
    }
    // the wall of bricks, the floor
    r.rect(0, 0, N, 0.9 * N, DARK);
    for (let y = 0, row = 0; y < 0.9 * N; y += 5 * u, row++) { span(r, y, 0, N, DARK + DIM); for (let x = (row % 2) * 6 * u; x < N; x += 12 * u) r.rect(x, y, mx1(u * 0.6), 5 * u, DARK + DIM); }
    r.rect(0, 0.9 * N, N, 0.1 * N, MID + DIM);
    // the flue to the cyclone, the hopper and its chute, the frame and the burner
    r.stroke(cx + 0.3 * Rd, cy - Rd, cx + 0.3 * Rd, 0.08 * N, mx1(5 * u), MID);
    r.stroke(cx + 0.3 * Rd, 0.08 * N, 0.8 * N, 0.08 * N, mx1(5 * u), MID);
    r.rect(0.76 * N, 0.04 * N, 0.12 * N, 0.12 * N, LMID);
    r.poly([[0.76 * N, 0.16 * N], [0.88 * N, 0.16 * N], [0.83 * N, 0.32 * N], [0.81 * N, 0.32 * N]], LMID);
    r.rect(0.76 * N, 0.04 * N, 0.12 * N, mx1(u), BRIGHT);
    const hx = cx - 0.55 * Rd;
    r.poly([[hx - 0.08 * N, 0.02 * N], [hx + 0.08 * N, 0.02 * N], [hx + 0.02 * N, 0.11 * N], [hx - 0.02 * N, 0.11 * N]], MID);
    if (w.phase !== 'load') for (let k = 0; k < 9; k++) bean(r, hx - 0.06 * N + k * 0.015 * N, 0.025 * N + hash(k, 3) * 2 * u, k, u, COOL);
    r.stroke(hx, 0.11 * N, cx - 0.5 * Rd, cy - 0.86 * Rd, mx1(3 * u), MID);
    for (const k of [-0.75, 0.75]) r.rect(cx + k * Rd - u, cy, 2 * u, 0.9 * N - cy, DARK + DIM);
    r.rect(cx - 0.8 * Rd, cy + Rd + 0.05 * N, 1.6 * Rd, 0.02 * N, DARK + DIM);
    // the flames: one jet for each burner hole, higher with the bass and the beat, a note flaring one
    const fy = cy + Rd + 0.05 * N;
    for (let k = 0; k < 7; k++) {
      w.flare[k] *= Math.exp(-dt * 3);
      const fx = cx - 0.7 * Rd + (k * 1.4 * Rd) / 6, fh = (0.025 + 0.025 * clamp(f.rel.bassDrive) + 0.01 * f.beat.pulse) * N * (0.7 + 0.6 * hash(k, Math.floor(t * 15))) * (1 + w.flare[k]);
      r.poly([[fx - 1.8 * u, fy], [fx + 1.8 * u, fy], [fx, fy - fh]], w.flare[k] > 0.3 ? HOT : COOL);
      r.poly([[fx - 0.8 * u, fy], [fx + 0.8 * u, fy], [fx, fy - fh * 0.5]], BRIGHT);
    }
    // the drum: its inside, the bed turning with it under the rolling surface layer
    ell(r, cx, cy, R, R, BLACK);
    if (w.fill > 0.02) { // the body of the bed, under the beans that show on it
      const bc = dim(colOf(0.5)), buf = r.buf;
      for (let y = Math.max(0, Math.round(cy - R)); y < Math.min(N, cy + R); y++)
        for (let x = Math.max(0, Math.round(cx - R)); x < Math.min(N, cx + R); x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy < R * R && dx * nx + dy * ny <= -h - u) buf[y * N + x] = bc; }
    }
    const { rho, th, hs } = w, n = rho.length;
    for (let i = 0; i < n; i++) {
      const a = th[i] + rot, x = cx + rho[i] * Math.cos(a), y = cy + rho[i] * Math.sin(a);
      if (inBed(x, y)) bean(r, x, y, a + Math.PI / 2 + hs[i], u, colOf(hs[i]));
    }
    const Lh = Math.sqrt(Math.max(0, R * R - h * h)), fx0 = cx - h * nx, fy0 = cy - h * ny, vs = 1.1 * om * R, nL = Math.floor((2 * Lh) / (2.4 * u));
    w.roll = (w.roll ?? 0) + vs * dt; // how far the surface has rolled: a change of tempo speeds it up, it does not jump
    if (w.fill > 0.05) for (let k = 0; k < nL; k++) { // the surface layer rolls down from the high side to the low one
      const sAl = -Lh + ((k * 2.4 * u + w.roll) % (2 * Lh)), up = (0.8 + hash(k, 9) * 0.8) * u;
      bean(r, fx0 + sAl * Math.cos(REPOSE) - up * nx, fy0 + sAl * Math.sin(REPOSE) - up * ny, REPOSE + hash(k, 2), u, colOf(hash(k, 4)));
    }
    // the vanes: each scoops a load out of the bed and lets it go bean by bean as it tilts past the friction angle,
    // with the drum's speed at that radius; a snare tips the top vane's whole load
    for (let k = 0; k < K; k++) {
      const a = rot + (k * TAU) / K, ca = Math.cos(a), sa = Math.sin(a), an = ((a % TAU) + TAU) % TAU;
      r.stroke(cx + ca * R, cy + sa * R, cx + ca * R * 0.7, cy + sa * R * 0.7, mx1(2 * u), LMID);
      if (w.fill > 0.2 && inBed(cx + ca * R * 0.86, cy + sa * R * 0.86)) { w.held[k] = 4095; continue; }
      const top = w.dumpVane && an > Math.PI && an < 1.5 * Math.PI + 0.5;
      for (let j = 0; j < 12; j++) {
        if (!(w.held[k] & (1 << j))) continue;
        const rr = R - (1.5 + (j % 4) * 1.8) * u, lift = (1.2 + (j >> 2) * 1.5) * u;
        if (top || (an > Math.PI + 0.25 + j * 0.09 && an < Math.PI + 2.5)) {
          w.held[k] &= ~(1 << j);
          w.fly.push({ x: cx + ca * rr - sa * lift, y: cy + sa * rr + ca * lift, vx: -om * rr * sa - ca * 0.05 * N, vy: om * rr * ca - sa * 0.05 * N, hq: hash(k, j) });
        } else bean(r, cx + ca * rr - sa * lift, cy + sa * rr + ca * lift, a, u, colOf(hash(k, j)));
      }
    }
    w.dumpVane = false;
    w.fly = w.fly.filter((b) => {
      b.vy += g * dt; b.x += b.vx * dt; b.y += b.vy * dt;
      const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
      if (d > R - u) { const vn = (b.vx * dx + b.vy * dy) / d; if (vn > 0) { b.vx -= 1.3 * vn * (dx / d); b.vy -= 1.3 * vn * (dy / d); } b.x = cx + (dx / d) * (R - u); b.y = cy + (dy / d) * (R - u); }
      if (w.fill > 0.05 && inBed(b.x, b.y)) return false; // back into the bed
      bean(r, b.x, b.y, b.vx * 0.1, u, colOf(b.hq));
      return d < R + 2 * u;
    }).slice(-80);
    // the dark roast's oil catches the light; the shell turns, its rivets showing how fast
    if (w.roast > 2.9) for (let i = 0; i < n; i += 7) { const a = th[i] + rot, x = cx + rho[i] * Math.cos(a), y = cy + rho[i] * Math.sin(a); if (inBed(x, y) && hash(i, Math.floor(t * 4)) < 0.3) r.set(x, y, BRIGHT); }
    r.ring(cx, cy, R + 1.5 * u, mx1(3 * u), FIG);
    for (let k = 0; k < 16; k++) { const a = rot + (k * TAU) / 16; r.set(cx + Math.cos(a) * (R + 1.5 * u), cy + Math.sin(a) * (R + 1.5 * u), LMID); }
    targets.push({ x: cx - Rd, y: cy - Rd, w: 2 * Rd, h: 2 * Rd });
    // the door and the chute: the batch pours out down it into the tray; the hopper's chute drops the next one in
    const dA = 0.45, dx0 = cx + Math.cos(dA) * Rd, dy0 = cy + Math.sin(dA) * Rd, tx = 0.74 * N, ty = 0.84 * N, trx = 0.22 * N, tryy = 0.06 * N;
    const ex = tx - 0.12 * N, ey = ty - tryy;
    r.stroke(dx0, dy0, ex, ey, mx1(3 * u), MID);
    const open = w.phase === 'dump' && w.fill > 0;
    r.stroke(dx0, dy0, dx0 + (open ? 0.05 : 0.01) * N, dy0 + (open ? -0.05 : 0.04) * N, mx1(2 * u), FIG);
    if (open) for (let k = spawns(rnd, 40, dt); k > 0; k--) { const hq = rnd(); w.chute.push({ p: 0, v: 0.1 * N, c: colOf(hq), y: 0 }); }
    if (w.phase === 'load' && w.fill < 1) for (let k = spawns(rnd, 30, dt); k > 0; k--) w.fly.push({ x: cx - 0.5 * Rd, y: cy - 0.86 * Rd + u, vx: 0.05 * N, vy: 0.05 * N, hq: rnd() });
    const cl = Math.hypot(ex - dx0, ey - dy0), slope = Math.atan2(ey - dy0, ex - dx0);
    w.chute = w.chute.filter((b) => { // down the chute (gravity along it less the friction), then a short fall into the tray
      if (b.p < cl) { b.v += g * (Math.sin(slope) - 0.35 * Math.cos(slope)) * dt; b.p += b.v * dt; bean(r, dx0 + Math.cos(slope) * b.p, dy0 + Math.sin(slope) * b.p - u, slope, u, b.c); return true; }
      b.y += (b.vy = (b.vy || 0) + g * dt) * dt;
      if (b.y > 0.03 * N) { if (w.tray.length < 160) w.tray.push({ rr: Math.sqrt(rnd()) * 0.9, ph: rnd() * TAU, c: b.c }); return false; }
      bean(r, ex, ey + b.y, 0, u, b.c);
      return true;
    });
    // the cooling tray: the beans on its perforated floor, stirred round by the turning arm, let out at the gate
    // once they have cooled while the next batch roasts
    if (w.phase === 'roast' && pe > 8) for (let k = spawns(rnd, 20, dt); k > 0 && w.tray.length; k--) w.tray.shift();
    ell(r, tx, ty + 2 * u, trx + 1.5 * u, tryy + 1.5 * u, FIG);
    ell(r, tx, ty, trx, tryy, MID + DIM);
    for (let k = 0; k < 40; k++) r.set(tx + (hash(k, 1) - 0.5) * 1.6 * trx, ty + (hash(k, 2) - 0.5) * 1.6 * tryy, DARK + DIM);
    w.arm += dt * (w.tray.length ? 1.6 : 0.4);
    for (const b of w.tray) { // the arm sweeps the beans in front of it round with it
      const dA2 = ((((w.arm - b.ph) % Math.PI) + Math.PI) % Math.PI);
      if (dA2 < 0.25) b.ph += dt * 1.6;
      bean(r, tx + Math.cos(b.ph) * b.rr * trx, ty + Math.sin(b.ph) * b.rr * tryy, b.ph, u, b.c);
    }
    for (const k of [0, Math.PI]) r.stroke(tx, ty, tx + Math.cos(w.arm + k) * trx * 0.92, ty + Math.sin(w.arm + k) * tryy * 0.92, mx1(1.5 * u), LMID);
    ell(r, tx, ty, 1.6 * u, 1.2 * u, FIG);
    for (const k of [-0.8, 0.8]) r.rect(tx + k * trx - u, ty + tryy, 2 * u, 0.9 * N - ty - tryy, DARK + DIM);
    // the chaff drifts up and is drawn into the flue; smoke leaves the cyclone, thicker as the roast darkens
    const ix = cx + 0.3 * Rd, iy = cy - Rd;
    w.chaff = w.chaff.filter((c) => {
      c.vx = follow(c.vx, (ix - c.x) * 0.8, dt, 0.5); c.vy = follow(c.vy, (iy - c.y) * 0.8 - 0.02 * N, dt, 0.5);
      c.x += c.vx * dt + Math.sin(t * 7 + c.life * 5) * 3 * u * dt; c.y += c.vy * dt; c.life -= dt;
      r.set(c.x, c.y, hash(Math.floor(c.x), 1) < 0.5 ? BRIGHT : LMID);
      return c.life > 0 && Math.hypot(c.x - ix, c.y - iy) > 2 * u;
    }).slice(-60);
    if (rnd() < dt * (0.5 + w.roast * 1.2 + f.level)) w.puffs.push(puff(0.82 * N, 0.04 * N, 0, -0.06 * N, 1.8, 1 + w.roast * 0.3));
    w.puffs = steam(W, w.puffs.slice(-40), 0.01 * N, LMID, 0.03);
  },
};

// ---------------------------------------------------------------------------------------------- mokapot
// A stovetop pot on the hob against the tiles, its upper chamber cut away: the flame under it flickers with the bass,
// and the coffee forced up the central column comes out of its top in spurts, on fountain parabolas that fall back
// into the chamber, where the level rises with what lands; between the kicks it wells over and runs down the column.
// A kick is a gurgle (a spurt as strong as the hit), a snare knocks the hinged lid up and gravity drops it back with a
// clack (it swings about the hinge, the torque of its own weight, and bounces once), steam escapes at the spout and
// under the lifted lid, rising and slowing. The kind is the pot and its fire: a faceted one on a gas ring, a smooth
// steel one on a glowing coil, a small one roaring on a camp burner. A section change lifts the pot off for a fresh
// fill; a drop is the sputter at the end of a brew: big gurgles, the lid rattling, clouds of steam.
const MOKA_W = { classic: [3, 2, 1], steel: [1, 2, 2], camp: [1, 1, 3] };
// the pot's half width at a height above its base (screens, for a pot of scale 1): boiler, waist, upper chamber
const mokaHw = (y) => (y < 0.195 ? lerp(0.125, 0.105, y / 0.195) : y < 0.215 ? 0.095 : lerp(0.095, 0.12, Math.min(1, (y - 0.215) / 0.21)));

const mokapot = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, MOKA_W, bandOf(W.a)), lvl: 0.05, lid: { a: 0, w: 0 }, spurts: [], puffs: [], lift: 0, sputTo: -1, gurgle: 0, clack: 0, lastBeat: -1 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bt = beatT(w, f, dt), g = GR * N;
    if (f.section === 'change' && w.lift <= 0) { w.lift = 1; w.spurts.length = 0; }
    if (f.section === 'drop') { w.sputTo = bt + 8; s.shake = Math.max(s.shake, 0.3); }
    if (bt < w.sputTo - 9) w.sputTo = -1; // (the beat clock started over)
    const sput = bt < w.sputTo && w.lift <= 0, S = w.kind === 'camp' ? 0.8 : 1, cx = 0.5 * N, heat = clamp(0.35 + 0.4 * f.level + 0.4 * clamp(f.rel.bassDrive));
    // lifted off for a fresh fill: up, a moment, down again, the new pot (of the new kind) on the fire
    if (w.lift > 0) { const was = w.lift; w.lift = Math.max(0, w.lift - dt / 1.2); if (was > 0.5 && w.lift <= 0.5) { w.lvl = 0.05; w.kind = rollW(rnd, MOKA_W, band); w.spurts.length = 0; } }
    const up = Math.sin(Math.PI * w.lift) * 0.35 * N, yb = 0.795 * N - up, top = yb - 0.425 * S * N, colTop = yb - 0.355 * S * N, inner = (y) => mokaHw((yb - y) / (S * N)) * S * N - 2.5 * u;
    const surf = yb - (0.225 + w.lvl * 0.125) * S * N;
    const spurt = (k) => { for (let i = 0; i < k; i++) { const a = (rnd() - 0.5) * 1.1, sp = (0.12 + 0.2 * rnd()) * N * (sput ? 1.4 : 1); w.spurts.push({ x: cx + Math.sign(a) * 0.012 * S * N, y: colTop, vx: Math.sin(a) * sp, vy: -Math.cos(a) * sp }); } };
    for (const hh of hits) {
      if (isLow(hh) && w.lift <= 0) { spurt(Math.round(3 + 8 * hh.strength)); w.gurgle = 0.2; }
      else if (hh.kind === 'snare') w.lid.w += 2.2 * hh.strength;
      else if (hh.kind === 'hat') w.puffs.push(puff(cx - 0.17 * S * N, top + 0.015 * N, -0.02 * N, -0.05 * N, 1.3, 0.8));
    }
    if (sput) { spurt(2 * spawns(rnd, 20, dt)); if (tick(w, f, dt)) w.lid.w += 1.5 + rnd(); for (let k = spawns(rnd, 25, dt); k > 0; k--) w.puffs.push(puff(cx + (rnd() - 0.5) * 0.2 * N, top, (rnd() - 0.5) * 0.06 * N, -0.2 * N, 1.8, 2)); }
    else if (w.lift <= 0 && w.lvl < 0.95 && rnd() < dt * 6 * heat) spurt(1); // between the kicks it bubbles over gently
    // the lid: a rod hinged at one end under its own weight, a' = -(3g / 2L) cos a, and a bounce off the rim
    const Ll = 0.25 * S * N, n = Math.ceil(dt / 0.01);
    for (let i = 0; i < n; i++) {
      w.lid.w -= ((1.5 * g) / Ll) * Math.cos(w.lid.a) * (dt / n);
      w.lid.a += w.lid.w * (dt / n);
      if (w.lid.a < 0) { w.lid.a = 0; if (w.lid.w < -0.4) w.clack = 0.12; w.lid.w = w.lid.w < -0.4 ? -0.3 * w.lid.w : 0; }
      if (w.lid.a > 1.2) { w.lid.a = 1.2; w.lid.w = Math.min(0, w.lid.w); } // the hinge's stop takes its swing: it falls back at once, it does not hang there
    }
    // the tiles, the hob and its knobs
    r.rect(0, 0, N, 0.82 * N, DARK);
    for (let y = 0, row = 0; y < 0.82 * N; y += 6 * u, row++) { span(r, y, 0, N, DARK + DIM); for (let x = (row % 2) * 7 * u; x < N; x += 14 * u) r.rect(x, y, mx1(u * 0.6), 6 * u, DARK + DIM); }
    r.rect(0, 0.82 * N, N, 0.04 * N, MID);
    r.rect(0, 0.82 * N, N, mx1(u), LMID);
    r.rect(0, 0.86 * N, N, 0.14 * N, DARK + DIM);
    for (const k of [0.2, 0.8]) { ell(r, k * N, 0.93 * N, 0.035 * N, 0.035 * N, MID); r.rect(k * N - u, 0.9 * N, 2 * u, 0.06 * N, LMID); }
    // the fire: a gas ring's tongues, a coil glowing, or a camp burner on its legs roaring
    const fb = 0.815 * N;
    if (w.kind === 'steel') {
      for (let k = 0; k < 4; k++) circ(r, cx, fb, (0.04 + k * 0.025) * N, heat > 0.5 || k % 2 ? HOT : HOT + DIM, 0.22);
      if (heat > 0.6) for (let k = 0; k < 12; k++) r.set(cx + (hash(k, Math.floor(t * 8)) - 0.5) * 0.24 * N, fb - u, BRIGHT);
    } else {
      if (w.kind === 'camp') for (const k of [-1, 0, 1]) r.line(cx + k * 0.04 * N, fb + 0.01 * N, cx + k * 0.12 * N, 0.86 * N, FIG);
      ell(r, cx, fb + u, 0.1 * N, 0.012 * N, DARK);
      const nT = 11, big = w.kind === 'camp' ? 1.8 : 1;
      for (let k = 0; k < nT; k++) {
        const fx = cx + (k / (nT - 1) - 0.5) * 0.2 * N * big, fh = (0.02 + 0.03 * clamp(f.rel.bassDrive) + 0.012 * f.beat.pulse) * N * big * (0.6 + 0.8 * hash(k, Math.floor(t * 18)));
        r.poly([[fx - 1.6 * u, fb], [fx + 1.6 * u, fb], [fx + (k - nT / 2) * 0.3 * u, fb - fh]], big > 1 && hash(k, 3) < 0.4 ? HOT : COOL);
        r.poly([[fx - 0.7 * u, fb], [fx + 0.7 * u, fb], [fx, fb - fh * 0.5]], BRIGHT);
      }
    }
    // the pot, row by row: the facets (or the smooth steel) lit from the left, the cutaway window into the upper chamber
    const buf = r.buf, cut0 = yb - 0.41 * S * N, cut1 = yb - 0.222 * S * N, facet = w.kind !== 'steel';
    for (let y = Math.max(0, Math.round(top)); y < Math.min(N, yb); y++) {
      const hw = mokaHw((yb - y) / (S * N)) * S * N, inC = y > cut0 && y < cut1, ih = hw - 2.5 * u;
      for (let x = Math.max(0, Math.round(cx - hw)); x < Math.min(N, cx + hw); x++) {
        const xn = (x + 0.5 - cx) / hw;
        let c;
        if (inC && Math.abs(x + 0.5 - cx) < ih) c = y >= surf ? (y < surf + mx1(u) ? LMID : MID) : DARK + DIM;
        else if (facet) c = xn < -0.62 ? LMID : xn < -0.1 ? BRIGHT : xn < 0.45 ? LMID : MID;
        else { const v = 0.75 - 0.8 * (xn + 0.3) * (xn + 0.3) + (bayer(x, y) - 0.5) * 0.3; c = v > 0.62 ? BRIGHT : v > 0.2 ? LMID : MID; }
        buf[y * N + x] = c;
      }
    }
    span(r, yb - 0.205 * S * N, cx - 0.095 * S * N, cx + 0.095 * S * N, DARK); // the waist's seam
    // inside: the column, the coffee welling over it, the spurts on their parabolas back into the chamber
    if (w.lift <= 0) {
      r.rect(cx - 0.012 * S * N, colTop, 0.024 * S * N, cut1 - colTop, LMID);
      r.rect(cx - 0.012 * S * N, colTop, mx1(u), cut1 - colTop, MID);
      if (w.lvl < 0.97) r.rect(cx + 0.012 * S * N - mx1(u), colTop, mx1(u), surf - colTop, MID); // the trickle down the column
      if (w.gurgle > 0) ell(r, cx, colTop - u, 0.016 * S * N, 0.01 * N, MID);
    }
    w.gurgle -= dt;
    w.spurts = w.spurts.filter((p) => {
      p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const ih = inner(p.y);
      if (Math.abs(p.x - cx) > ih) { p.x = cx + Math.sign(p.x - cx) * ih; p.vx *= -0.3; }
      if (p.y < cut0 + u && w.lid.a < 0.05) { p.y = cut0 + u; p.vy = Math.abs(p.vy) * 0.2; }
      if (p.y >= surf && p.vy > 0) { w.lvl = Math.min(1, w.lvl + 0.0015); return false; }
      r.rect(p.x - u * 0.5, p.y - u * 0.5, mx1(u), mx1(u), MID);
      return true;
    }).slice(-150);
    // the spout, the handle, the lid on its hinge with its knob
    r.poly([[cx - 0.115 * S * N, top + 0.004 * N], [cx - 0.175 * S * N, top - 0.012 * S * N], [cx - 0.115 * S * N, top + 0.035 * S * N]], LMID);
    r.stroke(cx + 0.11 * S * N, top + 0.03 * S * N, cx + 0.2 * S * N, top + 0.045 * S * N, mx1(4 * u), FIG);
    r.stroke(cx + 0.2 * S * N, top + 0.045 * S * N, cx + 0.185 * S * N, top + 0.18 * S * N, mx1(4 * u), FIG);
    const LP = turn(cx + 0.12 * S * N, top, w.lid.a), lw = 0.125 * S * N;
    const lidPts = [[0, 0], [0, -0.012 * S * N], [-0.4 * lw, -0.024 * S * N], [-1.6 * lw, -0.024 * S * N], [-2 * lw, -0.012 * S * N], [-2 * lw, 0]].map(([a, b]) => LP(a, b));
    r.poly(lidPts, LMID);
    r.line(lidPts[0][0], lidPts[0][1], lidPts[5][0], lidPts[5][1], MID);
    const kn = LP(-lw, -0.034 * S * N);
    ell(r, kn[0], kn[1], 0.018 * S * N, 0.01 * S * N, FIG);
    if (w.clack > 0) { w.clack -= dt; for (const k of [-1, 1]) r.line(cx + k * 0.13 * S * N, top - 2 * u, cx + k * 0.16 * S * N, top - 5 * u, WHITE); }
    targets.push({ x: cx - 0.13 * S * N, y: top - 0.03 * N, w: 0.26 * S * N, h: yb - top + 0.03 * N });
    // steam: out of the spout, and out under the lid while it is up
    if (w.lid.a > 0.05) for (let k = spawns(rnd, 40 * w.lid.a, dt); k > 0; k--) w.puffs.push(puff(cx - 0.1 * S * N, top - u, -0.04 * N, -0.12 * N, 1.4, 1.2));
    if (rnd() < dt * (0.8 + 2 * w.lvl * heat)) w.puffs.push(puff(cx - 0.175 * S * N, top - 0.012 * S * N, -0.03 * N, -0.04 * N, 1.4, 0.8));
    w.puffs = steam(W, w.puffs.slice(-60), 0.006 * N, BRIGHT, 0.045);
  },
};

// ---------------------------------------------------------------------------------------------- icedcream
// A glass of iced coffee from the side. A kick tips the jug and pours cream in: it is heavier than the coffee, so it
// sinks as a plume, and what sinks is a vortex pair (the baroclinic roll-up at the edges of a heavy blob) that drives
// itself down, rolls the cream at its tips into curls, slows as it spreads, and at the bottom splits and runs out
// along the floor (its images in the walls); the cream is carried semi-Lagrangian on a coarse grid by the pairs' flow,
// sinks a little on its own and slowly mixes in. The ice floats nine tenths under and bobs about its waterline on the
// buoyancy (a damped spring), knocked down by the pour; a snare knocks two cubes together with a clink. On the hats the
// mist on the cold glass gathers into drops that cling, run and merge; the straw shows broken at the surface by the
// refraction. The kind is the glass: a tall one, a jar, a tumbler; a section change slides a fresh one in. A drop is
// the straw stirring: one strong vortex follows its tip and swirls everything.
const ICED_W = { tall: [3, 2, 1], jar: [1, 2, 2], tumbler: [2, 2, 2] };
// the glass: its top and bottom (screens), half widths at the top and the bottom, the cubes in it
const GLASSES = { tall: { top: 0.12, bot: 0.92, wt: 0.17, wb: 0.145, ice: 3 }, jar: { top: 0.2, bot: 0.92, wt: 0.2, wb: 0.2, ice: 3, jar: true }, tumbler: { top: 0.38, bot: 0.92, wt: 0.23, wb: 0.2, ice: 3 } };
// the part of a convex polygon above the line y = yc (screen y grows down)
function clipAbove(pts, yc) {
  const o = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (a[1] <= yc) o.push(a);
    if ((a[1] <= yc) !== (b[1] <= yc)) { const k = (yc - a[1]) / (b[1] - a[1]); o.push([a[0] + (b[0] - a[0]) * k, yc]); }
  }
  return o;
}
// the induced velocity of point vortices (and their images) at (x, y), into out[0..1]: Γ > 0 turns clockwise on screen
function vortexAt(V, n, x, y, out) {
  let vx = 0, vy = 0;
  for (let i = 0; i < n; i += 4) { const dx = x - V[i], dy = y - V[i + 1], k = V[i + 2] / (TAU * (dx * dx + dy * dy + V[i + 3])); vx -= dy * k; vy += dx * k; }
  out[0] = vx; out[1] = vy;
}
function icedTables(W) {
  const { w, N, u } = W, Gl = GLASSES[w.kind], wall = 1.5 * u, ys = (Gl.top + 0.08) * N, yb = (Gl.bot - 0.03) * N, x0 = 0.5 * N - Gl.wt * N + wall, wd = 2 * (Gl.wt * N - wall);
  const GX = 30, cs = wd / GX, GY = Math.max(12, Math.round((yb - ys) / cs)), VX = 16, VY = Math.ceil(GY / 2) + 1;
  const m = new Uint8Array(GX * GY);
  for (let j = 0; j < GY; j++) { const hw = lerp(Gl.wt, Gl.wb, (ys + (j + 0.5) * cs) / N - Gl.top) * N - wall; for (let i = 0; i < GX; i++) m[j * GX + i] = Math.abs(x0 + (i + 0.5) * cs - 0.5 * N) < hw ? 1 : 0; }
  Object.assign(w, { N, kindT: w.kind, GX, GY, cs, ys, yb, x0, m, VX, VY, c: new Float32Array(GX * GY), c2: new Float32Array(GX * GY), ux: new Float32Array(VX * VY), uy: new Float32Array(VX * VY), vort: [] });
}

const icedcream = {
  init(W) {
    const { w, rnd } = W;
    w.kind = rollW(rnd, ICED_W, bandOf(W.a));
    Object.assign(w, { pour: 0, px: 15, tip: 0, stirTo: -1, slide: 0, glass: { drops: [], trails: [], id: 0 }, sparks: [], VV: new Float32Array(64 * 4), tmp: [0, 0], ice: [] });
    icedTables(W);
    icedIce(W);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bt = beatT(w, f, dt), g = GR * N;
    if (f.section === 'change' && w.slide <= 0) w.slide = 1;
    if (f.section === 'drop') { w.stirTo = bt + 8; s.shake = Math.max(s.shake, 0.2); }
    if (bt < w.stirTo - 9) w.stirTo = -1; // (the beat clock started over)
    if (w.slide > 0) { const was = w.slide; w.slide = Math.max(0, w.slide - dt / 1.2); if (was > 0.5 && w.slide <= 0.5) { w.kind = rollW(rnd, ICED_W, band); icedTables(W); icedIce(W); w.glass.drops.length = 0; } }
    if (w.N !== N || w.kindT !== w.kind) { icedTables(W); icedIce(W); }
    const Gl = GLASSES[w.kind], { GX, GY, cs, ys, yb, x0, m, VX, VY } = w, off = w.slide > 0.5 ? ((1 - w.slide) * 2) ** 2 * 0.7 * N : (w.slide * 2) ** 2 * 0.7 * N, cx = 0.5 * N + off;
    const stir = bt < w.stirTo;
    // the pour: a kick tips the jug over the spot it struck, and the plume it starts is a vortex pair under the surface
    for (const hh of hits) {
      if (isLow(hh) && w.slide <= 0) {
        w.pour = 0.4; w.px = clamp((0.2 + 0.6 * hh.x) * GX, 3, GX - 4);
        const a = 1.8 + 1.4 * hh.strength, U = 10 + 8 * hh.strength;
        for (const sg of [1, -1]) w.vort.push({ x: w.px - sg * a, y: 2.5, g: sg * 4 * Math.PI * a * U, d: 1.5, age: 0 });
        for (const c of w.ice) if (Math.abs(c.x - (x0 + w.px * cs)) < 0.1 * N) { c.vy += 0.08 * N * hh.strength; c.vx += Math.sign(c.x - (x0 + w.px * cs)) * 0.05 * N; c.va += (rnd() - 0.5) * 3; }
      } else if (hh.kind === 'snare' && w.ice.length > 1) { const k = Math.floor(rnd() * (w.ice.length - 1)), [p, q] = [...w.ice].sort((A, B) => A.x - B.x).slice(k, k + 2); p.vx += 0.15 * N * hh.strength; q.vx -= 0.15 * N * hh.strength; }
      else if (hh.kind === 'hat' && w.slide <= 0) for (let k = 0; k < 2; k++) newDrop(w.glass, cx + (rnd() - 0.5) * 1.8 * Gl.wb * N, (Gl.top + 0.03 + rnd() * (Gl.bot - Gl.top - 0.08)) * N, (0.35 + 0.4 * rnd()) * u);
    }
    if (w.vort.length > 14) w.vort.splice(0, w.vort.length - 14);
    // the straw's foot: still, or stirring in circles a beat round (seen from the side, back and forth)
    const sx0 = cx - 0.05 * N, sy0 = yb - 0.04 * N, sxs = stir ? sx0 + 0.07 * N * Math.sin(TAU * bt) : sx0, stirG = (Math.cos(TAU * bt) > 0 ? 1 : -1) * 700;
    // the vortices and their images in the floor and the walls (Γ reversed), all as one list
    const V = w.VV;
    let nv = 0;
    const add = (x, y, gg, d) => { if (nv < V.length) { V[nv] = x; V[nv + 1] = y; V[nv + 2] = gg; V[nv + 3] = d * d; nv += 4; } };
    const allV = stir ? [...w.vort, { x: (sxs - x0) / cs, y: (sy0 - ys) / cs, g: stirG, d: 2.5 }] : w.vort;
    for (const v of allV) {
      add(v.x, v.y, v.g, v.d);
      if (GY - v.y < 14) add(v.x, 2 * GY - v.y, -v.g, v.d);
      if (v.x < 10) add(-v.x, v.y, -v.g, v.d);
      if (GX - v.x < 10) add(2 * GX - v.x, v.y, -v.g, v.d);
    }
    // each vortex moves with the flow of all the others and every image (its own included), sinks with its heavy
    // cream, loses strength and spreads its core
    const out = w.tmp;
    for (const v of w.vort) {
      let vx = 0, vy = 0;
      for (let i = 0; i < nv; i += 4) { const dx = v.x - V[i], dy = v.y - V[i + 1], q2 = dx * dx + dy * dy; if (q2 < 1e-6) continue; const k = V[i + 2] / (TAU * (q2 + V[i + 3])); vx -= dy * k; vy += dx * k; }
      v.x = clamp(v.x + vx * dt, 0.5, GX - 0.5); v.y = clamp(v.y + (vy + 1.5) * dt, 0.5, GY - 0.5);
      v.g *= Math.exp(-dt / 3.5); v.d = Math.min(4, v.d + dt * 0.6); v.age += dt;
    }
    w.vort = w.vort.filter((v) => Math.abs(v.g) > 25 && v.age < 9);
    // the flow on the coarse grid, then the cream carried back along it, mixing slowly; then its own settling, moved
    // as a flux from cell to the cell below (as fast as 3 c cells a second, stopped by the floor), so none is made
    for (let j = 0; j < VY; j++) for (let i = 0; i < VX; i++) { vortexAt(V, nv, i * 2, j * 2, out); w.ux[j * VX + i] = out[0]; w.uy[j * VX + i] = out[1]; }
    const c = w.c, c2 = w.c2, kd = Math.min(0.2, dt * 0.6);
    if (w.pour > 0) for (let j = 0; j < 3; j++) for (let i = Math.floor(w.px - 1.5); i <= w.px + 1.5; i++) if (i >= 0 && i < GX) c[j * GX + i] = 1;
    let m0 = 0, m1 = 0;
    for (let k = 0; k < GX * GY; k++) m0 += c[k];
    for (let j = 0; j < GY; j++)
      for (let i = 0; i < GX; i++) {
        const k = j * GX + i;
        if (!m[k]) { c2[k] = 0; continue; }
        const vx = samp(w.ux, VX, VY, i / 2, j / 2), vy = samp(w.uy, VX, VY, i / 2, j / 2);
        const a = samp(c, GX, GY, i - vx * dt, j - vy * dt), nb = (i > 0 && m[k - 1] ? c[k - 1] : a) + (i < GX - 1 && m[k + 1] ? c[k + 1] : a) + (j > 0 && m[k - GX] ? c[k - GX] : a) + (j < GY - 1 && m[k + GX] ? c[k + GX] : a); // (nothing mixes through the glass)
        c2[k] = a + kd * (nb - 4 * a) * 0.25;
      }
    for (let j = GY - 2; j >= 0; j--) for (let i = 0, k = j * GX; i < GX; i++, k++) if (m[k] && m[k + GX]) { const q = Math.min(3 * c2[k] * c2[k] * dt, c2[k], 1 - c2[k + GX]); if (q > 0) { c2[k] -= q; c2[k + GX] += q; } }
    for (let k = 0; k < GX * GY; k++) m1 += c2[k];
    if (m1 > 1e-6 && Math.abs(m0 / m1 - 1) > 1e-4) { const kc = m0 / m1; for (let k = 0; k < GX * GY; k++) c2[k] = Math.min(1, c2[k] * kc); } // what the walls leaked or made, given back: the cream poured is all there, no more
    w.c = c2; w.c2 = c;
    // the room: the wall, the table
    r.rect(0, 0.92 * N, N, 0.08 * N, LMID);
    r.rect(0, 0.92 * N, N, mx1(u), BRIGHT);
    ell(r, cx + 0.03 * N, 0.925 * N, Gl.wb * N * 1.2, 0.012 * N, MID); // the shadow under the glass
    // the drink, read between the cells of the grid, dithered onto the coffee-to-cream ramp
    const C = w.c, buf = r.buf;
    for (let y = Math.max(0, Math.round(ys)); y < Math.min(N, yb); y++) {
      const hw = lerp(Gl.wt, Gl.wb, y / N - Gl.top) * N - 1.5 * u, gy = (y + 0.5 - ys) / cs - 0.5;
      for (let x = Math.max(0, Math.round(cx - hw)); x < Math.min(N, cx + hw); x++) {
        const v = samp(C, GX, GY, (x + 0.5 - (x0 + off)) / cs - 0.5, gy) + (bayer(x, y) - 0.5) * 0.16;
        buf[y * N + x] = v > 0.62 ? BRIGHT : v > 0.36 ? LMID : v > 0.14 ? MID : DARK;
      }
    }
    // the ice: buoyancy about the waterline (nine tenths under), water drag, knocks between cubes and off the walls
    const lim = (s2) => [0.5 * N - Gl.wt * N + 1.5 * u + s2, 0.5 * N + Gl.wt * N - 1.5 * u - s2]; // (the cubes' x is the glass's own, at rest)
    const surfV = (x) => samp(w.ux, VX, VY, (x - x0) / cs / 2, 0.5);
    for (const cb of w.ice) {
      const kb = (1.09 * g) / cb.s, yeq = ys + 0.4 * cb.s;
      cb.vy += (kb * (yeq - cb.y) - 2.5 * cb.vy) * dt + (f.beat.on ? 0.02 * N : 0); // the beat thumps the table: a little bob
      cb.vx = follow(cb.vx, surfV(cb.x) * cs * 0.6, dt, 0.6);
      cb.x += cb.vx * dt; cb.y += cb.vy * dt;
      cb.va += (-30 * cb.a - 4 * cb.va) * dt; cb.a += cb.va * dt;
      const [a0, a1] = lim(cb.s / 2);
      if (cb.x < a0) { cb.x = a0; cb.vx = Math.abs(cb.vx) * 0.4; } else if (cb.x > a1) { cb.x = a1; cb.vx = -Math.abs(cb.vx) * 0.4; }
    }
    for (let i = 0; i < w.ice.length; i++)
      for (let j = i + 1; j < w.ice.length; j++) {
        const p = w.ice[i], q = w.ice[j], d = q.x - p.x, need = (p.s + q.s) / 2;
        if (Math.abs(d) < need) {
          const sgn = Math.sign(d) || 1, rel = (q.vx - p.vx) * sgn, push = (need - Math.abs(d)) / 2;
          p.x -= sgn * push; q.x += sgn * push;
          if (rel < 0) { const imp = -1.5 * rel / 2; p.vx -= sgn * imp; q.vx += sgn * imp; if (-rel > 0.05 * N) w.sparks.push({ x: (p.x + q.x) / 2 + off, y: ys - u, t: 0.12 }); } // a clink
        }
      }
    for (const cb of w.ice) { // under the surface the cube shows dim through the coffee, above it clear and lit
      const P = turn(cb.x + off, cb.y, cb.a), h2 = cb.s / 2, pts = [P(-h2, -h2), P(h2, -h2), P(h2, h2), P(-h2, h2)], dry = clipAbove(pts, ys);
      r.poly(pts, COOL + DIM);
      for (let k = 0; k < 4; k++) r.line(pts[k][0], pts[k][1], pts[(k + 1) % 4][0], pts[(k + 1) % 4][1], LMID + DIM);
      if (dry.length > 2) { r.poly(dry, COOL); for (let k = 0; k + 1 < dry.length; k++) r.line(dry[k][0], dry[k][1], dry[k + 1][0], dry[k + 1][1], WHITE); }
    }
    span(r, ys, cx - Gl.wt * N + 1.5 * u, cx + Gl.wt * N - 1.5 * u, LMID); // the waterline over the cubes' sides
    w.sparks = w.sparks.filter((sp) => { for (const [dx, dy] of [[0, -1], [0.8, -0.6], [-0.8, -0.6]]) r.line(sp.x + dx * 1.5 * u, sp.y + dy * 1.5 * u, sp.x + dx * 4 * u, sp.y + dy * 4 * u, WHITE); return (sp.t -= dt) > 0; });
    // the straw: above the surface as it is, below it shifted by the refraction, broken at the waterline
    const stx = cx + 0.13 * N, sty = (Gl.top - 0.1) * N, kS = (ys - sy0) / (sty - sy0), wx = lerp(sxs, stx, kS);
    r.stroke(wx, ys, stx, sty, mx1(2.2 * u), HOT);
    r.stroke(sxs + 1.5 * u, sy0, wx + 1.5 * u, ys, mx1(2.2 * u), HOT + DIM);
    // the glass: its walls, the rim, the base, a highlight down the side, a jar's threads and handle
    for (let y = Math.round(Gl.top * N); y < Gl.bot * N; y++) { const hw = lerp(Gl.wt, Gl.wb, y / N - Gl.top) * N; r.set(cx - hw, y, LMID); r.set(cx + hw - 1, y, LMID); if (y > ys + 2 * u && y % 2) r.set(cx - hw + 2 * u, y, WHITE); }
    r.rect(cx - Gl.wt * N, Gl.top * N, 2 * Gl.wt * N, mx1(u), BRIGHT);
    r.rect(cx - Gl.wb * N, (Gl.bot - 0.03) * N, 2 * Gl.wb * N, 0.03 * N, LMID + DIM);
    if (Gl.jar) { for (let k = 0; k < 3; k++) span(r, (Gl.top + 0.012 + k * 0.012) * N, cx - Gl.wt * N, cx + Gl.wt * N, LMID); r.ring(cx + Gl.wt * N + 0.04 * N, (Gl.top + 0.3) * N, 0.06 * N, mx1(2.5 * u), LMID); }
    targets.push({ x: cx - Gl.wt * N, y: Gl.top * N, w: 2 * Gl.wt * N, h: (Gl.bot - Gl.top) * N });
    // the jug: aimed so that the cream, leaving its lip sideways, lands where the kick struck
    w.tip = follow(w.tip, w.pour > 0 ? 1 : 0, dt, 0.08);
    const land = x0 + off + (w.px + 0.5) * cs, lipY = (Gl.top - 0.05) * N, vxl = -0.12 * N, ft = Math.sqrt((2 * (ys - lipY)) / g), lipX = land - vxl * ft;
    const JP = turn(lipX + 0.035 * N, lipY + 0.02 * N, -0.9 * w.tip);
    r.poly([JP(-0.035 * N, -0.02 * N), JP(0.03 * N, -0.025 * N), JP(0.035 * N, 0.04 * N), JP(-0.025 * N, 0.04 * N)], FIG);
    const hd = JP(0.045 * N, 0.01 * N);
    r.ring(hd[0], hd[1], 0.015 * N, mx1(1.5 * u), FIG);
    if (w.pour > 0 && w.tip > 0.6) { let px = lipX, py = lipY; for (let k = 1; k <= 8; k++) { const tt = (ft * k) / 8, nx2 = lipX + vxl * tt, ny2 = lipY + 0.5 * g * tt * tt; r.stroke(px, py, nx2, ny2, mx1(1.6 * u * Math.sqrt(-vxl / Math.hypot(vxl, g * tt))), BRIGHT); px = nx2; py = ny2; } } // thinning as it speeds up
    w.pour -= dt;
    // the cold glass sweats: drops cling, grow, run and merge
    glassDrops(W, w.glass, cx - Gl.wb * N + u, Gl.top * N + 2 * u, cx + Gl.wb * N - u, (Gl.bot - 0.03) * N, BRIGHT, LMID + DIM);
  },
};
// the cubes, afloat at their waterline
function icedIce(W) {
  const { w, N } = W, Gl = GLASSES[w.kind], n = Gl.ice, wdt = 2 * Gl.wt * N;
  w.ice = Array.from({ length: n }, (_, k) => { const s = (0.06 + 0.015 * hash(k, 9)) * N; return { x: 0.5 * N - wdt / 2 + ((k + 0.5) / n) * wdt, y: w.ys + 0.4 * s, vx: 0, vy: 0, a: (hash(k, 3) - 0.5) * 0.3, va: 0, s }; });
}

// ---------------------------------------------------------------------------------------------- steamcurl
// Steam off a cup in a dark room, lit by the shaft of light from the window: a smoke density on a coarse grid carried
// semi-Lagrangian by a flow that rises fast off the hot coffee and slower as the steam cools, plus a curl-noise field
// (the curl of a scrolling noise, so it swirls without piling up or thinning out) that grows with the height as the
// plume turns turbulent; the steam fades as it mixes. It glows where it crosses the light. The kind is what the plume
// draws on every fourth beat: a heart, a spiral or a smoke ring breathed into it, carried up and torn apart in a
// second or two, or a plain plume that curls more. A kick puffs it and stirs it up, a snare spins an eddy into it, a
// note sets dust motes glinting in the light, the source runs with the level; a drop is a breath that blows it aside.
const CURL_W = { plume: [2, 2, 2], heart: [3, 2, 1], spiral: [1, 2, 3], ring: [1, 1, 2] };
const SG = 44; // the steam grid, cells a side
function curlTables(W) {
  const { w, N } = W, T = new Float32Array(64 * 64);
  // a tiling noise (its lattice wraps every 8 cells) for the stream function
  const lat = (i, j) => hash((i & 7) + 17, (j & 7) + 31);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const fx = x / 8, fy = y / 8, xi = Math.floor(fx), yi = Math.floor(fy), sx = (fx - xi) * (fx - xi) * (3 - 2 * (fx - xi)), sy = (fy - yi) * (fy - yi) * (3 - 2 * (fy - yi));
    const a = lat(xi, yi), b = lat(xi + 1, yi), c = lat(xi, yi + 1), d = lat(xi + 1, yi + 1);
    T[y * 64 + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  Object.assign(w, { N, T, c: w.c || new Float32Array(SG * SG), c2: w.c2 || new Float32Array(SG * SG), psi: new Float32Array((SG + 1) * (SG + 1)), vx: new Float32Array(SG * SG), vy: new Float32Array(SG * SG) });
}
// the noise tile read anywhere, wrapping
const tileAt = (T, x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, i0 = (yi & 63) * 64, i1 = ((yi + 1) & 63) * 64, a = xi & 63, b = (xi + 1) & 63;
  return (T[i0 + a] + (T[i0 + b] - T[i0 + a]) * fx) * (1 - fy) + (T[i1 + a] + (T[i1 + b] - T[i1 + a]) * fx) * fy;
};

const steamcurl = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, CURL_W, bandOf(W.a)), turb: 0, eddy: null, breath: -1, motes: [], scroll: 0 });
    curlTables(W);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), G = SG;
    if (w.N !== N) curlTables(W);
    if (f.section === 'change') w.kind = rollW(rnd, CURL_W, band);
    if (f.section === 'drop') w.breath = 0;
    const X0 = 0.26 * N, Y0 = 0, cell = (0.64 * N) / G, cupX = 0.6 * N, mouthY = 0.645 * N, srcC = (cupX - X0) / cell - 0.5, srcW = (0.085 * N) / cell;
    for (const hh of hits) {
      if (isLow(hh)) w.turb = Math.min(1.5, w.turb + hh.strength);
      else if (hh.kind === 'snare') w.eddy = { x: srcC + (rnd() - 0.5) * 12, y: G * (0.3 + 0.4 * rnd()), g: (rnd() < 0.5 ? -1 : 1) * 60 * hh.strength, t: 0.5 };
      if (isTonal(hh)) for (let k = 0; k < 4; k++) w.motes.push({ x: (0.35 + 0.5 * rnd()) * N, y: (0.2 + 0.5 * rnd()) * N, life: 2 + rnd() * 2 });
    }
    w.turb *= Math.exp(-dt * 1.5);
    // the flow: the curl of a scrolling noise, stronger with the height (laminar off the cup, turbulent higher up),
    // plus the rise, fast off the hot surface and slowing as the steam cools; a breath from the left on a drop
    w.scroll += dt * (0.6 + 0.8 * clamp(f.rel.midDrive));
    const { T, psi, vx, vy } = w, A = 18 * (1 + 1.2 * w.turb + 0.6 * clamp(f.rel.trebDrive)) * (w.kind === 'plume' ? 1.4 : 1), sc = 1.6, oy = w.scroll * 4;
    for (let j = 0; j <= G; j++) {
      const hgt = G - j, amp = A * (0.15 + 0.85 * Math.min(1, hgt / 22));
      for (let i = 0; i <= G; i++) psi[j * (G + 1) + i] = amp * (tileAt(T, i * sc + 5, j * sc + oy) - 0.5 + 0.5 * (tileAt(T, i * sc * 2.1 + 40, j * sc * 2.1 + oy * 1.7) - 0.5));
    }
    let br = 0;
    if (w.breath >= 0) { w.breath += dt; br = w.breath < 0.3 ? w.breath / 0.3 : Math.max(0, 1 - (w.breath - 0.3) / 1.5); if (w.breath > 1.8) w.breath = -1; }
    const draft = w.kind === 'plume' ? 1.2 : 0.4, E = w.eddy;
    for (let j = 0; j < G; j++)
      for (let i = 0; i < G; i++) {
        const k = j * G + i, p = j * (G + 1) + i, hgt = G - j;
        let ux = (psi[p + G + 1] + psi[p + G + 2] - psi[p] - psi[p + 1]) * 0.5, uy = -(psi[p + 1] + psi[p + G + 2] - psi[p] - psi[p + G + 1]) * 0.5;
        uy -= 11 * (0.35 + 0.65 * Math.exp(-hgt / 16)) * (0.25 + 0.75 * Math.min(1, w.c[k] * 3)); // the warm steam rises, the air round it hardly
        ux += draft + br * 22 * (1 - (0.3 * hgt) / G);
        if (E) { const dx = i - E.x, dy = j - E.y, q = E.g / (TAU * (dx * dx + dy * dy + 9)); ux -= dy * q; uy += dx * q; }
        vx[k] = ux; vy[k] = uy;
      }
    if (E && (E.t -= dt) <= 0) w.eddy = null;
    // the steam: carried back along the flow, fed at the cup's mouth (with the level, a kick puffing it), fading as
    // it rises and mixes
    const c = w.c, c2 = w.c2, src = 0.3 + 0.3 * f.level + 0.35 * w.turb;
    for (let i = Math.max(0, Math.floor(srcC - srcW)); i <= Math.min(G - 1, srcC + srcW); i++) { const fl = hash(i, Math.floor(t * 6)); if (fl > 0.4) for (let j = G - 2; j < G; j++) c[j * G + i] = Math.max(c[j * G + i], src * (0.4 + 0.6 * fl)); } // wisps, not a sheet
    for (let j = 0; j < G; j++) {
      const fade = Math.exp(-dt * (0.15 + (0.55 * (G - j)) / G));
      for (let i = 0; i < G; i++) { const k = j * G + i, sx = i - vx[k] * dt, sy = j - vy[k] * dt; c2[k] = sx < 0 || sx > G - 1 || sy > G - 1 ? 0 : samp(c, G, G, sx, sy) * fade; } // clear air comes in at the sides
    }
    w.c = c2; w.c2 = c;
    // on every fourth beat the plume draws the kind's shape, which the flow then carries off and tears apart
    if (tick(w, f, dt) && (w.beats = (w.beats || 0) + 1) % 4 === 0 && w.kind !== 'plume') {
      const C = w.c, sx = srcC, sy = G - 15;
      const dot = (x, y) => { const xi = Math.round(x), yi = Math.round(y); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = xi + dx, b = yi + dy; if (a >= 0 && a < G && b >= 0 && b < G) C[b * G + a] = Math.max(C[b * G + a], dx || dy ? 0.55 : 0.95); } };
      for (let k = 0; k < 70; k++) {
        const q = (k / 70) * TAU;
        if (w.kind === 'heart') dot(sx + 0.36 * 16 * Math.sin(q) ** 3, sy - 0.36 * (13 * Math.cos(q) - 5 * Math.cos(2 * q) - 2 * Math.cos(3 * q) - Math.cos(4 * q)));
        else if (w.kind === 'spiral') { const a = (k / 70) * 3 * Math.PI; dot(sx + Math.cos(a) * (0.8 + 1.6 * a), sy + Math.sin(a) * (0.8 + 1.6 * a) * 0.8); }
        else dot(sx + Math.cos(q) * 6, sy + Math.sin(q) * 2.6);
      }
    }
    // the room: the dark wall, the window and its shaft of light across the air and the table, the cup on its saucer
    const sl = Math.tan(0.42 + 0.06 * Math.sin(f.rel.midClock * 0.1)), wx1 = 0.3 * N, wt = 0.08 * N, wb = 0.52 * N, buf = r.buf;
    const lit = (x, y) => x > wx1 && y - (x - wx1) * sl > wt && y - (x - wx1) * sl < wb;
    r.rect(0, 0, N, 0.8 * N, DARK);
    for (let y = 0; y < 0.8 * N; y++) for (let x = Math.round(wx1); x < N; x++) if (lit(x, y) && bayer(x, y) < 0.22) buf[y * N + x] = MID + DIM;
    r.rect(0.05 * N, wt, wx1 - 0.05 * N, wb - wt, BRIGHT);
    ell(r, 0.12 * N, 0.4 * N, 0.06 * N, 0.05 * N, LMID); ell(r, 0.2 * N, 0.43 * N, 0.07 * N, 0.06 * N, LMID); // a tree outside
    r.frame(0.05 * N, wt, wx1 - 0.05 * N, wb - wt, FIG);
    r.rect(0.05 * N, (wt + wb) / 2, wx1 - 0.05 * N, mx1(1.5 * u), FIG);
    r.rect((0.05 * N + wx1) / 2, wt, mx1(1.5 * u), wb - wt, FIG);
    r.rect(0, 0.8 * N, N, 0.2 * N, MID);
    r.rect(0, 0.8 * N, N, mx1(u), LMID);
    for (let y = Math.round(0.8 * N); y < N; y++) for (let x = Math.round(wx1); x < N; x++) if (lit(x, y - 0.3 * N) && bayer(x, y) < 0.5) buf[y * N + x] = LMID;
    ell(r, cupX, 0.8 * N, 0.13 * N, 0.018 * N, LMID);
    r.ring(cupX + 0.1 * N, 0.715 * N, 0.032 * N, mx1(2.5 * u), FIG);
    r.rect(cupX - 0.085 * N, mouthY, 0.17 * N, 0.15 * N, FIG);
    ell(r, cupX, 0.795 * N, 0.085 * N, 0.01 * N, FIG);
    r.rect(cupX - 0.085 * N, 0.7 * N, 0.17 * N, 0.015 * N, FIG + DIM);
    ell(r, cupX, mouthY, 0.085 * N, 0.012 * N, DARK + DIM);
    r.rect(cupX - 0.07 * N, mouthY + 0.02 * N, mx1(u), 0.1 * N, lit(cupX - 0.07 * N, mouthY) ? WHITE : LMID);
    targets.push({ x: cupX - 0.1 * N, y: mouthY - 0.02 * N, w: 0.2 * N, h: 0.17 * N });
    // the steam, read between the cells and dithered: brighter where it crosses the light
    const C = w.c;
    for (let y = Math.max(0, Math.round(Y0)); y < mouthY; y++) {
      const gy = (y + 0.5 - Y0) / cell - 0.5;
      for (let x = Math.round(X0); x < Math.min(N, X0 + G * cell); x++) {
        const v = samp(C, G, G, (x + 0.5 - X0) / cell - 0.5, gy) + (bayer(x, y) - 0.5) * 0.14;
        if (v < 0.22) continue;
        buf[y * N + x] = lit(x, y) ? (v > 0.7 ? WHITE : v > 0.42 ? BRIGHT : LMID) : v > 0.62 ? LMID : v > 0.4 ? MID : MID + DIM;
      }
    }
    // dust motes turning in the light
    w.motes = w.motes.filter((m) => { m.x += (hash(Math.floor(m.life * 10), 1) - 0.5) * 0.04 * N * dt; m.y += (hash(Math.floor(m.life * 10), 2) - 0.6) * 0.03 * N * dt; m.life -= dt; if (lit(m.x, m.y)) r.set(m.x, m.y, BRIGHT); return m.life > 0; }).slice(-40);
  },
};

// ---------------------------------------------------------------------------------------------- grinder
// A hand grinder close up, cut open: the crank on top turns once a bar (its arm swings round in a flat circle, the
// knob passing in front of the shaft and behind it), the conical burr turns with it (its grooves run round), and the
// grounds fall from the gap between the burrs in two thin streams into the catch cup. There they pile up: a heap kept
// column by column that slides wherever its slope passes the angle of repose (it lets go steeper than about 48 degrees
// and comes to rest at 40, so it slumps in avalanches you can see, then stands). A kick drops beans into the hopper:
// they fall, bounce on the heap with most of their speed lost and settle into it; grinding draws the heap down. A
// snare knocks the cup (the heap slumps), a hat shakes a few grains loose. The kind is the grinder: a steel mill with
// an open funnel, a wooden box with a drawer, a tall brass one. A full cup slides out for an empty one; a drop is the
// motor: the crank a blur, a burst of grounds sprayed out, the stream pouring.
const GRIND_W = { mill: [3, 2, 1], box: [2, 2, 1], tall: [1, 2, 3] };
// the hopper (top and bottom y, half widths), the body, the burr window, the catch cup, the crank's height and reach
const GRINDERS = {
  mill: { hy0: 0.13, hy1: 0.21, hwT: 0.16, hwB: 0.09, by0: 0.21, by1: 0.66, bw: 0.12, ry0: 0.45, ry1: 0.62, rw: 0.075, cy0: 0.67, cy1: 0.89, cw: 0.115, ky: 0.08, L: 0.2, look: 'steel' },
  box: { hy0: 0.33, hy1: 0.41, hwT: 0.15, hwB: 0.1, by0: 0.41, by1: 0.79, bw: 0.18, ry0: 0.45, ry1: 0.6, rw: 0.08, cy0: 0.63, cy1: 0.77, cw: 0.14, ky: 0.26, L: 0.18, look: 'wood' },
  tall: { hy0: 0.17, hy1: 0.24, hwT: 0.11, hwB: 0.065, by0: 0.24, by1: 0.68, bw: 0.075, ry0: 0.5, ry1: 0.64, rw: 0.05, cy0: 0.69, cy1: 0.89, cw: 0.09, ky: 0.11, L: 0.17, look: 'brass' },
};
const SLIP = 1.1, REST = 0.84; // the heap lets go at a slope of 1.1 (48 degrees) and comes to rest at 0.84 (40)

const grinder = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, GRIND_W, bandOf(W.a)), hb: 0.6, H: null, beans: [], grains: [], rolls: [], spray: [], motorTo: -1, mph: 0, swap: 0, scroll: 0, ph0: 0, knock: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bt = beatT(w, f, dt), g = GR * N;
    if (f.section === 'change' && w.swap <= 0) { w.swap = 1; w.next = rollW(rnd, GRIND_W, band); }
    const G = GRINDERS[w.kind], cx = 0.5 * N;
    if (f.section === 'drop') { w.motorTo = bt + 8; s.shake = Math.max(s.shake, 0.3); for (let k = 0; k < 50; k++) { const a = -Math.PI * rnd(); w.spray.push({ x: cx + (rnd() - 0.5) * G.rw * N, y: G.ry1 * N, vx: Math.cos(a) * (0.2 + 0.5 * rnd()) * N, vy: Math.sin(a) * (0.1 + 0.4 * rnd()) * N, life: 2 }); } }
    if (bt < w.motorTo - 9) w.motorTo = -1; // (the beat clock started over)
    const motor = bt < w.motorTo;
    // the cup: swapped when full (or for a new grinder), sliding out to the right and an empty one in
    if (w.swap > 0) { const was = w.swap; w.swap = Math.max(0, w.swap - dt / 1.2); if (was > 0.5 && w.swap <= 0.5) { if (w.next) { w.kind = w.next; w.next = null; } w.H = null; } }
    const cw = G.cw * N, NC = Math.max(4, Math.round(2 * cw - 4 * u)), floorY = G.cy1 * N - 2 * u, cupH = (G.cy1 - G.cy0) * N - 3 * u;
    if (!w.H || w.H.length !== NC) w.H = new Float32Array(NC);
    const H = w.H, off = w.swap > 0.5 ? ((1 - w.swap) * 2) ** 2 * 0.6 * N : (w.swap * 2) ** 2 * 0.6 * N, cl = cx - NC / 2 + off;
    // the crank: a turn a bar; the motor spins it eight times a second
    if (motor) w.mph += dt * TAU * 8;
    const phi = (TAU * bt) / 4 + w.mph, rate = (TAU / 4) * bps(f) + (motor ? TAU * 8 : 0), grind = w.hb > 0.02 && w.swap <= 0 ? rate : 0;
    w.hb = Math.max(0, w.hb - grind * dt * 0.004);
    w.scroll += grind * dt * 0.6 * u;
    for (const hh of hits) {
      if (isLow(hh)) for (let k = 0; k < 2 + 4 * hh.strength; k++) w.beans.push({ x: cx + (rnd() - 0.5) * 2 * G.hwB * N, y: -0.03 * N - rnd() * 0.05 * N, vx: (rnd() - 0.5) * 0.05 * N, vy: 0.05 * N, a: rnd() * 3, va: (rnd() - 0.5) * 12, n: 0 });
      else if (hh.kind === 'snare') w.knock = 0.3; // the knock: for a moment the heap gives at a gentler slope
      else if (hh.kind === 'hat') for (let k = 0; k < 4; k++) w.grains.push({ x: cx + (rnd() - 0.5) * 0.1 * N, y: G.ry1 * N + 2 * u, vx: (rnd() - 0.5) * 0.06 * N, vy: 0 });
    }
    // the room: a plain wall, a shelf, the counter
    r.rect(0, 0.3 * N, N, mx1(1.5 * u), BG + DIM);
    r.rect(0, 0.9 * N, N, 0.1 * N, LMID);
    r.rect(0, 0.9 * N, N, mx1(u), BRIGHT);
    // the body by its look: steel lit from the left, wood with its grain, brass with bands
    const bw = G.bw * N, by0 = G.by0 * N, by1 = G.by1 * N;
    if (G.look === 'wood') {
      r.rect(cx - bw, by0, 2 * bw, by1 - by0, MID);
      for (let y = by0 + 3 * u; y < by1; y += 4 * u) span(r, y + Math.sin(y * 0.3) * u, cx - bw, cx + bw, MID + DIM);
      r.frame(cx - bw, by0, 2 * bw, by1 - by0, DARK);
    } else for (let x = Math.round(cx - bw); x < cx + bw; x++) {
      const xn = (x + 0.5 - cx) / bw, c = G.look === 'brass' ? (xn < -0.5 ? LMID : xn < 0 ? BRIGHT : xn < 0.6 ? LMID : MID) : xn < -0.55 ? MID : xn < -0.15 ? BRIGHT : xn < 0.5 ? LMID : MID;
      r.rect(x, by0, 1, by1 - by0, c);
    }
    if (G.look === 'brass') for (let y = by0 + 0.06 * N; y < by1; y += 0.09 * N) { r.rect(cx - bw, y, 2 * bw, mx1(1.5 * u), HOT); r.rect(cx - bw, y + 2 * u, 2 * bw, mx1(u), DARK); }
    else if (G.look === 'steel') for (const y of [by0, (G.ry0 - 0.02) * N, by1 - 2 * u]) r.rect(cx - bw, y, 2 * bw, mx1(1.5 * u), DARK);
    // the hopper, open at the top: the heap of beans in it, sinking as they are ground (the column moves down)
    const hy0 = G.hy0 * N, hy1 = G.hy1 * N, hT = G.hwT * N, hB = G.hwB * N, top = hy1 - w.hb * (hy1 - hy0) * 1.15, buf = r.buf, bs = mx1(2.5 * u);
    r.poly([[cx - hT, hy0], [cx + hT, hy0], [cx + hB, hy1], [cx - hB, hy1]], G.look === 'wood' ? LMID : MID);
    for (let y = Math.max(0, Math.round(Math.min(top, hy1))); y < hy1; y++) {
      const hw = lerp(hT, hB, (y - hy0) / (hy1 - hy0)) - 1.5 * u, dome = (y - top) / Math.max(1, hy1 - top);
      for (let x = Math.round(cx - hw * Math.min(1, 0.4 + dome * 2)); x < cx + hw * Math.min(1, 0.4 + dome * 2); x++) { const q = hash(Math.floor(x / bs), Math.floor((y - w.scroll) / bs)); buf[y * N + x] = q < 0.12 ? DARK + DIM : q < 0.7 ? DARK : MID; }
    }
    r.line(cx - hT, hy0, cx - hB, hy1, FIG); r.line(cx + hT, hy0, cx + hB, hy1, FIG);
    // the burr window: the outer burr's walls, the cone turning inside it, its grooves running round with the crank
    const ry0 = G.ry0 * N, ry1 = G.ry1 * N, rw = G.rw * N;
    r.rect(cx - rw - 2 * u, ry0, 2 * rw + 4 * u, ry1 - ry0, DARK + DIM);
    for (let y = Math.round(ry0 + 2 * u); y < ry1; y++) {
      const q = (y - ry0) / (ry1 - ry0), hw = rw * (0.25 + 0.7 * q);
      for (let x = Math.round(cx - hw); x < cx + hw; x++) { const xn = (x + 0.5 - cx) / hw; buf[y * N + x] = ((xn * 1.2 + (phi / TAU) * 3 + y / (3 * u)) % 1 + 1) % 1 < 0.3 ? MID : LMID; }
      r.set(cx - rw - u, y, MID); r.set(cx + rw + u, y, MID);
    }
    // the cup and its heap of grounds, column by column
    const cy0 = G.cy0 * N, cy1 = G.cy1 * N;
    if (G.look !== 'wood') { r.rect(cl - 2 * u, cy0, NC + 4 * u, cy1 - cy0, BG); for (const x of [cl - 2 * u, cl + NC + u]) r.rect(x, cy0, mx1(u), cy1 - cy0, LMID); r.rect(cl - 2 * u, cy1 - 2 * u, NC + 4 * u, 2 * u, LMID); }
    else { r.rect(cl - 2 * u, cy0, NC + 4 * u, cy1 - cy0, DARK + DIM); r.rect(cl - 2 * u, cy1 - 2 * u, NC + 4 * u, 2 * u, MID); }
    // the streams out of the burrs' gap: grains fall under gravity and add to the heap where they land
    const outs = [cx - rw * 0.6, cx + rw * 0.6];
    if (grind > 0) { const n = Math.min(Math.ceil(360 * dt), Math.floor(grind * dt * 9 + rnd())); for (let k = 0; k < n; k++) { const o = outs[k % 2]; w.grains.push({ x: o + (rnd() - 0.5) * 2 * u, y: ry1, vx: (rnd() - 0.5) * 0.02 * N, vy: 0.02 * N }); } } // (at most 360 a second, at any frame rate)
    const gq = 0.35 * u * u;
    w.grains = w.grains.filter((p) => {
      p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const k = Math.round(p.x - cl);
      if (k >= 0 && k < NC && p.y >= floorY - H[k]) { H[k] += gq; return false; }
      if (p.y > cy1) return false;
      r.set(p.x, p.y, MID);
      return true;
    }).slice(-300);
    // the slides: wherever the slope passes the angle of repose the heap lets go and runs until it is back at it
    const slip = w.knock > 0 ? 0.75 : SLIP, rest = w.knock > 0 ? 0.6 : REST;
    w.knock = Math.max(0, w.knock - dt);
    // sixty sweeps a second, back and forth, at any frame rate: an avalanche runs at its own pace
    for (w.sweeps = (w.sweeps || 0) + dt * 60; w.sweeps >= 1; w.sweeps--)
      for (let j = 0, back = (w.sw = (w.sw || 0) + 1) & 1; j < NC - 1; j++) {
        const k = back ? NC - 2 - j : j, d = H[k] - H[k + 1];
        if (Math.abs(d) > slip) { const m = (Math.abs(d) - rest) / 2, from = d > 0 ? k : k + 1, to = d > 0 ? k + 1 : k; H[from] -= m; H[to] += m; if (w.rolls.length < 40 && rnd() < 0.3) w.rolls.push({ k: from, dir: to - from, t: 0 }); }
      }
    let full = false;
    for (let k = 0; k < NC; k++) {
      const hgt = Math.min(H[k], cupH), x = cl + k;
      if (H[k] > cupH - 2 * u) full = true;
      for (let y = Math.round(floorY - hgt); y < floorY; y++) r.set(x, y, hash(x - Math.round(off), y) < 0.25 ? DARK : y < floorY - hgt + mx1(u) ? LMID : MID);
    }
    w.rolls = w.rolls.filter((rl) => { rl.t += dt; const k = rl.k + rl.dir * rl.t * 30; if (k < 0 || k >= NC) return false; r.set(cl + k, floorY - H[Math.floor(k)] - u, BRIGHT); return rl.t < 0.15; });
    if (full && w.swap <= 0) w.swap = 1;
    targets.push({ x: cl, y: cy0, w: NC, h: cy1 - cy0 });
    // the crank: the arm swings round flat, so seen from the side its far half passes behind the shaft
    const ky = G.ky * N, L = G.L * N, ex = cx + Math.cos(phi) * L, ey = ky + Math.sin(phi) * L * 0.22, front = Math.sin(phi) > 0;
    const arm = () => { r.stroke(cx, ky, ex, ey, mx1(2.5 * u), FIG); r.rect(ex - 0.012 * N, ey - 0.055 * N, 0.024 * N, 0.055 * N, G.look === 'brass' ? HOT : MID); ell(r, ex, ey - 0.055 * N, 0.012 * N, 0.005 * N, LMID); };
    if (motor) circ(r, cx, ky, L, MID + DIM, 0.22);
    if (!front) arm();
    r.rect(cx - mx1(1.5 * u), ky, mx1(3 * u), hy1 - ky, FIG);
    ell(r, cx, ky, 0.02 * N, 0.01 * N, FIG);
    if (front) arm();
    // the beans: they fall, bounce on the heap losing most of their speed, and settle into it
    w.beans = w.beans.filter((b) => {
      b.vy += g * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
      const hw = lerp(hT, hB, clamp((b.y - hy0) / (hy1 - hy0))) - 2 * u;
      if (b.y > hy0 && Math.abs(b.x - cx) > hw) { b.x = cx + Math.sign(b.x - cx) * hw; b.vx *= -0.4; }
      if (b.y >= top - u && b.vy > 0) { if (b.vy < 0.1 * N || ++b.n > 3) { w.hb = Math.min(1.25, w.hb + 0.015); return false; } b.y = top - u; b.vy *= -0.35; b.vx *= 0.6; b.va *= 0.5; }
      const L2 = mx1(2.6 * u), S2 = mx1(1.6 * u), along = Math.abs(Math.cos(b.a)) > 0.7;
      r.rect(b.x - (along ? L2 : S2) / 2, b.y - (along ? S2 : L2) / 2, along ? L2 : S2, along ? S2 : L2, DARK);
      return true;
    });
    // the motor's burst: grounds sprayed out of the top, falling on the counter
    w.spray = w.spray.filter((p) => { p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.y > 0.9 * N) { p.y = 0.9 * N; p.vy = 0; p.vx = 0; } r.set(p.x, p.y, MID); return p.life > 0; });
  },
};

// ---------------------------------------------------------------------------------------------- morningwindow
// A cozy morning: a window over the rooftops, a cup steaming on the sill, a cat sitting there with its back to us and
// its tail hanging over the edge, swinging to the beat (the root swings, the rest of it follows a moment late, so a wave
// runs down to the tip), a plant swaying with the treble, and on the table the light of the four panes, each thrown
// along the sun's direction (the window flipped and sheared onto the table, the frame's shadow between them, the cat's
// shadow in it), crawling as the sun moves with the mid clock. The kind is the weather: rain running down the glass in
// drops that cling and merge, the sun with dust turning in its light, or snow. A kick thumps the tail (and throws rain
// at the glass, or a flurry, or a bird across), a snare flicks an ear, a hat puffs the steam, a note opens a flower; a
// drop is the sun breaking through: the sky clears and the room floods with light.
const WIN_W = { rain: [3, 1, 1], sun: [2, 2, 3], snow: [2, 1, 1] };
const PANES = [[0.1, 0.38, 0.06, 0.28], [0.38, 0.66, 0.06, 0.28], [0.1, 0.38, 0.28, 0.5], [0.38, 0.66, 0.28, 0.5]];
// a filled polygon (even-odd, through the cells' middles, as Raster.poly) laid down only where the dither is under `dens`
function dpoly(r, pts, c, dens) {
  const N = r.N, xs = [];
  let top = Infinity, bot = -Infinity;
  for (const p of pts) { top = Math.min(top, p[1]); bot = Math.max(bot, p[1]); }
  for (let y = Math.max(0, Math.floor(top)); y < Math.min(N, Math.ceil(bot)); y++) {
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xa, ya] = pts[j], [xb, yb] = pts[i]; if ((ya <= y + 0.5) !== (yb <= y + 0.5)) xs.push(xa + ((y + 0.5 - ya) / (yb - ya)) * (xb - xa)); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(N, Math.round(xs[k + 1])); x++) if (bayer(x, y) < dens) r.buf[y * N + x] = c;
  }
}

const morningwindow = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, WIN_W, bandOf(W.a)), tail: new Float32Array(7), thump: 0, ear: 0, puffs: [], glass: { drops: [], trails: [], id: 0 }, flakes: [], birds: [], motes: [], stems: Array.from({ length: 5 }, () => ({ x: 0, v: 0 })), flower: -1, flowerC: HOT, floodTo: -1 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bt = beatT(w, f, dt), buf = r.buf;
    if (f.section === 'change') w.kind = rollW(rnd, WIN_W, band);
    if (f.section === 'drop') w.floodTo = bt + 8;
    if (bt < w.floodTo - 9) w.floodTo = -1; // (the beat clock started over)
    const flood = clamp(Math.min((bt - w.floodTo + 8) / 1.5, (w.floodTo - bt) / 2)), kind = flood > 0.3 ? 'sun' : w.kind; // in over a beat and a half, out over the last two
    for (const hh of hits) {
      if (isLow(hh)) {
        w.thump = Math.min(1, w.thump + 0.6 * hh.strength);
        if (kind === 'rain') for (let k = 0; k < 6; k++) newDrop(w.glass, (0.11 + 0.54 * rnd()) * N, (0.07 + 0.38 * rnd()) * N, (0.4 + 0.5 * rnd()) * u);
        else if (kind === 'snow') for (let k = 0; k < 12; k++) w.flakes.push({ x: (0.1 + 0.56 * rnd()) * N, y: (0.06 + 0.1 * rnd()) * N, ph: rnd() * TAU });
        else if (w.birds.length < 3) w.birds.push({ x: 0.08 * N, y: (0.1 + 0.15 * rnd()) * N, ph: 0 });
      } else if (hh.kind === 'snare') w.ear = 0.18;
      else if (hh.kind === 'hat') w.puffs.push(puff(0.56 * N, 0.44 * N, 0, -0.06 * N, 1.8, 1));
      if (isTonal(hh)) { w.flower = 3; w.flowerC = hh.pc % 2 ? COOL : HOT; }
    }
    // the sun's way into the room: its azimuth and height wander with the mid clock
    const az = 0.45 * Math.sin(f.rel.midClock * 0.12), el = 1.05 + 0.15 * Math.sin(f.rel.midClock * 0.08), ct = 1 / Math.tan(el);
    const proj = (X, ys) => { const Y = 0.74 - ys, z = Y * ct * Math.cos(az); return [(X + Y * ct * Math.sin(az)) * N, (0.74 + z * 0.55) * N]; };
    // the wall, its paper, the table and its grain
    for (let x = 4 * u; x < N; x += 10 * u) r.rect(x, 0, mx1(u * 0.6), 0.74 * N, BG + DIM);
    r.rect(0, 0.74 * N, N, 0.26 * N, MID);
    for (let y = 0.77 * N; y < N; y += 5 * u) span(r, y + Math.sin(y) * u, 0, N, MID + DIM);
    r.rect(0, 0.74 * N, N, mx1(u), LMID);
    // outside: the sky by the weather, the rooftops, the sun, rain, snow, a bird
    const sky = kind === 'sun' ? BRIGHT : kind === 'snow' ? LMID : MID + DIM;
    r.rect(0.1 * N, 0.06 * N, 0.56 * N, 0.44 * N, sky);
    if (kind === 'sun') { ell(r, 0.55 * N, 0.14 * N, 0.045 * N, 0.045 * N, HOT); for (let k = 0; k < 2; k++) { const cx2 = ((0.15 + k * 0.3 + t * 0.01) % 0.6) * N + 0.08 * N; ell(r, cx2, (0.12 + k * 0.08) * N, 0.05 * N, 0.015 * N, LMID); } }
    for (let k = 0; k < 7; k++) {
      const x = (0.1 + k * 0.08) * N, hh2 = (0.06 + 0.07 * hash(k, 3)) * N;
      r.rect(x, 0.5 * N - hh2, 0.08 * N, hh2, DARK + DIM);
      r.poly([[x, 0.5 * N - hh2], [x + 0.08 * N, 0.5 * N - hh2], [x + 0.04 * N, 0.5 * N - hh2 - 0.025 * N]], DARK + DIM);
      if (hash(k, 4) < 0.5) r.rect(x + 0.05 * N, 0.5 * N - hh2 - 0.04 * N, 0.012 * N, 0.03 * N, DARK + DIM);
      if (kind === 'snow') r.poly([[x, 0.5 * N - hh2], [x + 0.08 * N, 0.5 * N - hh2], [x + 0.04 * N, 0.5 * N - hh2 - 0.025 * N]], BRIGHT);
    }
    if (kind === 'rain') for (let k = 0; k < 30; k++) { const q = (hash(k, 2) + t * (1.4 + hash(k, 3))) % 1, x = (0.1 + 0.56 * ((((hash(k, 1) - (q * 0.44) / 3.5 / 0.56) % 1) + 1) % 1)) * N, y = (0.06 + q * 0.44) * N; r.line(x, y, x - u, y + 3.5 * u, LMID + DIM); } // each falls along its slant
    if (kind === 'snow') for (let k = spawns(rnd, 20, dt); k > 0 && w.flakes.length < 50; k--) w.flakes.push({ x: (0.1 + 0.56 * rnd()) * N, y: 0.06 * N, ph: rnd() * TAU });
    w.flakes = w.flakes.filter((fl) => { fl.y += 0.06 * N * dt; fl.x += Math.sin(t * 1.5 + fl.ph) * 0.02 * N * dt; r.set(fl.x, fl.y, WHITE); return fl.y < 0.5 * N && kind === 'snow'; });
    w.birds = w.birds.filter((b) => { b.x += 0.18 * N * dt; b.ph += dt * 12; const fl = Math.sin(b.ph) * 1.5 * u; r.line(b.x - 2 * u, b.y - fl, b.x, b.y, DARK); r.line(b.x, b.y, b.x + 2 * u, b.y - fl, DARK); return b.x < 0.66 * N; });
    if (kind === 'rain' && rnd() < dt * 3) newDrop(w.glass, (0.11 + 0.54 * rnd()) * N, (0.07 + 0.38 * rnd()) * N, (0.3 + 0.4 * rnd()) * u);
    if (kind === 'rain' || w.glass.drops.length) glassDrops(W, w.glass, 0.1 * N + u, 0.06 * N, 0.66 * N - u, 0.5 * N - u, BRIGHT, LMID + DIM);
    // the frame, the bars, the sill
    r.frame(0.1 * N, 0.06 * N, 0.56 * N, 0.44 * N, FIG);
    r.frame(0.1 * N + 1, 0.06 * N + 1, 0.56 * N - 2, 0.44 * N - 2, FIG);
    r.rect(0.38 * N - u, 0.06 * N, mx1(2 * u), 0.44 * N, FIG);
    r.rect(0.1 * N, 0.28 * N - u, 0.56 * N, mx1(2 * u), FIG);
    r.rect(0.06 * N, 0.5 * N, 0.64 * N, 0.015 * N, LMID);
    r.rect(0.06 * N, 0.515 * N, 0.64 * N, 0.025 * N, MID);
    // the light on the table: each pane thrown along the sun's direction, the frame's shadow between them, the cat's
    // and the cup's shadows in it; bright and clean in sun, a faint glow under cloud
    const lp = kind === 'sun' ? 1 : kind === 'snow' ? 0.6 : 0.3, lc = flood > 0.3 ? BRIGHT : LMID;
    for (const [x0, x1, y0, y1] of PANES) {
      const pts = [proj(x0 + 0.01, y0 + 0.01), proj(x1 - 0.01, y0 + 0.01), proj(x1 - 0.01, y1 - 0.01), proj(x0 + 0.01, y1 - 0.01)];
      if (lp >= 1) r.poly(pts, lc); else dpoly(r, pts, lc, lp);
    }
    if (lp >= 0.6) { const cs = proj(0.27, 0.44), us = proj(0.56, 0.47); ell(r, cs[0], cs[1], 0.05 * N, 0.025 * N, MID + DIM); ell(r, us[0], us[1], 0.025 * N, 0.012 * N, MID + DIM); } // only a clear light casts them
    // the light through the air, and the dust turning in it
    if (lp >= 0.6) {
      for (let k = 0; k < 3; k++) { const a = proj(0.15 + k * 0.2, 0.5); r.line((0.15 + k * 0.2) * N, 0.5 * N, a[0], a[1], flood > 0.3 ? BRIGHT : LMID + DIM); } // the beams' edges, from the sill to the table
      if (w.motes.length < 25 && rnd() < dt * 8) w.motes.push({ x: (0.15 + 0.5 * rnd()) * N, y: (0.55 + 0.2 * rnd()) * N, life: 3 });
    }
    w.motes = w.motes.filter((m) => { m.x += (hash(Math.floor(m.life * 7), 1) - 0.5) * 0.03 * N * dt; m.y += (hash(Math.floor(m.life * 7), 2) - 0.55) * 0.02 * N * dt; m.life -= dt; r.set(m.x, m.y, WHITE); return m.life > 0; });
    // the flood: the whole room lit, a wash of light over the wall and the table
    if (flood > 0) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x, c = buf[i]; if ((c === BG || c === BG + DIM || c === MID || c === MID + DIM) && bayer(x, y) < flood * 0.45) buf[i] = c === BG || c === BG + DIM ? BRIGHT : LMID; }
    // the cup on the sill and its steam
    const ux = 0.56 * N, sy = 0.5 * N;
    r.rect(ux - 0.025 * N, sy - 0.05 * N, 0.05 * N, 0.05 * N, FIG);
    r.ring(ux + 0.03 * N, sy - 0.028 * N, 0.012 * N, mx1(1.5 * u), FIG);
    ell(r, ux, sy - 0.05 * N, 0.025 * N, 0.006 * N, DARK + DIM);
    if (f.beat.on || rnd() < dt * 1.5) w.puffs.push(puff(ux + (rnd() - 0.5) * 0.03 * N, sy - 0.055 * N, 0, -0.07 * N, 2, 0.8));
    w.puffs = steam(W, w.puffs.slice(-30), 0.004 * N, kind === 'sun' ? LMID : BRIGHT, 0.04);
    // the cat from behind, its tail over the edge: the root swings to the beat (thumped harder on a kick), every
    // segment follows the one above it a little late, so a wave runs down to the tip
    const kx = 0.27 * N, root = 0.55 * Math.cos(Math.PI * bt) * (0.6 + 0.4 * W.v) + w.thump * 0.8 * Math.sin(t * 9);
    w.thump *= Math.exp(-dt * 3);
    w.tail[0] = root;
    for (let k = 1; k < w.tail.length; k++) w.tail[k] = follow(w.tail[k], w.tail[k - 1], dt, 0.07);
    let tx = kx + 0.05 * N, ty = sy + 0.01 * N;
    for (let k = 0; k < w.tail.length; k++) { const nx = tx + Math.sin(w.tail[k]) * 0.024 * N, ny = ty + Math.cos(w.tail[k]) * 0.024 * N; r.stroke(tx, ty, nx, ny, mx1((2.8 - k * 0.25) * u), BLACK); tx = nx; ty = ny; }
    ell(r, kx, sy - 0.065 * N, 0.065 * N, 0.07 * N, BLACK);
    ell(r, kx, sy - 0.15 * N, 0.04 * N, 0.036 * N, BLACK);
    const ef = w.ear > 0 ? 0.012 * N : 0;
    w.ear -= dt;
    r.poly([[kx - 0.038 * N, sy - 0.16 * N], [kx - 0.012 * N, sy - 0.18 * N], [kx - 0.034 * N, sy - 0.205 * N]], BLACK);
    r.poly([[kx + 0.038 * N, sy - 0.16 * N], [kx + 0.012 * N, sy - 0.18 * N], [kx + 0.034 * N + ef, sy - 0.205 * N + ef * 0.5]], BLACK);
    targets.push({ x: kx - 0.07 * N, y: sy - 0.21 * N, w: 0.14 * N, h: 0.21 * N });
    // the plant on the table: stems on springs that the treble keeps stirring, leaves along them, a flower on a note
    const px = 0.84 * N, py = 0.78 * N;
    w.flower -= dt;
    w.stems.forEach((st, k) => {
      st.v += (hash(k, Math.floor(t * 8)) - 0.5) * clamp(f.rel.trebDrive) * 1.2 * N * dt;
      spring(st, dt, 25, 2.5);
      const bx = px + (k - 2) * 0.012 * N, tx2 = bx + (k - 2) * 0.03 * N + st.x, ty2 = py - (0.2 + 0.06 * hash(k, 2)) * N;
      r.line(bx, py - 0.06 * N, tx2, ty2, MID + DIM);
      for (let j = 1; j <= 3; j++) { const q = j / 3.5, lx = lerp(bx, tx2, q), ly = lerp(py - 0.06 * N, ty2, q); ell(r, lx + (j % 2 ? 1 : -1) * 0.012 * N, ly, 0.014 * N, 0.006 * N, COOL); }
      if (k === 2 && w.flower > 0) ell(r, tx2, ty2, 0.012 * N, 0.012 * N, w.flowerC);
    });
    r.poly([[px - 0.045 * N, py - 0.065 * N], [px + 0.045 * N, py - 0.065 * N], [px + 0.035 * N, py], [px - 0.035 * N, py]], HOT + DIM);
    r.rect(px - 0.05 * N, py - 0.075 * N, 0.1 * N, 0.012 * N, HOT);
  },
};

// ---------------------------------------------------------------------------------------------- cupstack
// A barista stacks a tower on the counter, a piece a beat, the hand arriving with it exactly on the beat: each piece
// lands with a wobble, a damped rocking about its foot that the ones under it feel too, and the whole tower sways a
// little with the bass. A kick knocks the counter (the tower rocks), a snare clinks the top piece, a note glazes the
// next cup. The kind is the tower: cups on saucers, a column of cups, or a pyramid of glasses. A drop topples it (a full
// tower goes over by itself after two bars): first it falls as one body about the edge of its foot, gravity's torque
// growing with the lean; then it comes apart and every piece flies on with the speed it had, tumbles, bounces off the
// counter with most of its speed lost, and rolls (cups on their rims, spinning at v/r) or slides to a stop (saucers),
// some off the edge; then an arm sweeps the counter clear and the stacking starts again.
const STACK_W = { pairs: [3, 2, 1], cups: [1, 2, 2], pyramid: [1, 2, 3] };
// the pieces, in screens about the middle of their foot: outline, height, bounce
const PIECES = {
  saucer: { pts: [[-0.1, -0.022], [0.1, -0.022], [0.04, 0], [-0.04, 0]], h: 0.022, e: 0.25 },
  cup: { pts: [[-0.04, 0], [0.04, 0], [0.055, -0.08], [-0.055, -0.08]], h: 0.08, e: 0.35 },
  glass: { pts: [[-0.037, 0], [0.037, 0], [0.043, -0.095], [-0.043, -0.095]], h: 0.095, e: 0.3 },
};
const pieceOf = (kind, i) => (kind === 'pyramid' ? 'glass' : kind === 'cups' ? 'cup' : i % 2 ? 'cup' : 'saucer');
const maxOf = (kind) => (kind === 'pyramid' ? 10 : kind === 'cups' ? 9 : 14);
// where the i-th glass of the pyramid stands: rows of four, three, two, one, a board between the rows
const pyrAt = (i) => { let row = 0, k = i; while (k >= 4 - row) { k -= 4 - row; row++; } return [(k - (3 - row) / 2) * 0.095, row * 0.101]; };
function drawPiece(r, type, P, N, u, tint) {
  const pc = PIECES[type], pts = pc.pts.map(([a, b]) => P(a * N, b * N));
  if (type === 'saucer') { r.poly(pts, LMID); r.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1], BRIGHT); }
  else if (type === 'cup') {
    const hc = P(0.068 * N, -0.044 * N);
    r.ring(hc[0], hc[1], 0.015 * N, mx1(1.8 * u), FIG);
    r.poly(pts, FIG);
    r.poly([P(-0.046 * N, -0.03 * N), P(0.046 * N, -0.03 * N), P(0.049 * N, -0.042 * N), P(-0.049 * N, -0.042 * N)], tint);
    r.line(pts[2][0], pts[2][1], pts[3][0], pts[3][1], LMID);
  } else {
    for (let k = 0; k < 4; k++) r.line(pts[k][0], pts[k][1], pts[(k + 1) % 4][0], pts[(k + 1) % 4][1], k === 2 ? BRIGHT : COOL);
    const a = P(-0.03 * N, -0.012 * N), b = P(-0.034 * N, -0.08 * N);
    r.line(a[0], a[1], b[0], b[1], WHITE);
  }
}

const cupstack = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, STACK_W, bandOf(W.a)), next: null, ps: [], fall: null, bodies: [], sweeping: false, sx: 0, wait: 0, full: 0, tint: HOT, clink: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = GR * N, floor = 0.86 * N, edge = 0.92 * N, bx = 0.32 * N;
    if (f.section === 'change') { w.next = rollW(rnd, STACK_W, band); if (!w.ps.length && !w.fall) { w.kind = w.next; w.next = null; } }
    const beat = tick(w, f, dt), ph = beatLocked(f) ? f.beat.phase : w.tickT || 0, mx = maxOf(w.kind);
    if (f.section === 'drop' && w.ps.length > 1 && !w.fall) w.fall = { th: 0, om: 0.9, dir: 0 }; // knocked over toward the open counter
    for (const hh of hits) {
      if (isLow(hh)) { const sg = rnd() < 0.5 ? -1 : 1; for (const p of w.ps) p.va += sg * 0.35 * hh.strength; s.shake = Math.max(s.shake, 0.15 * hh.strength); }
      else if (hh.kind === 'snare' && w.ps.length) { w.ps[w.ps.length - 1].va += (rnd() < 0.5 ? -1 : 1) * 1.2 * hh.strength; w.clink = 0.12; }
      if (isTonal(hh)) w.tint = hh.pc % 2 ? COOL : HOT;
    }
    // stacking: a piece a beat, set down by the hand on the beat; it lands rocking and the ones below feel it
    if (beat && !w.fall && !w.sweeping && !w.bodies.length) {
      if (w.ps.length < mx) {
        const sg = rnd() < 0.5 ? -1 : 1, i = w.ps.length;
        w.ps.forEach((p, j) => { p.va += sg * 0.35 * 0.55 ** (i - j); });
        w.ps.push({ type: pieceOf(w.kind, i), a: 0, va: sg * (0.6 + 0.5 * rnd()) * (1 + 0.5 * W.a), tint: w.tint });
      } else if (++w.full >= 8) w.fall = { th: 0, om: (rnd() < 0.25 ? -1 : 1) * 0.35, dir: 0 }; // too tall to stand: it goes by itself
    }
    for (const p of w.ps) { const n = Math.ceil(dt / 0.012); for (let k = 0; k < n; k++) { p.va += (-90 * p.a - 5 * p.va) * (dt / n); p.a += p.va * (dt / n); } } // each rocks on its foot, damped
    // where each piece stands: a column stacks each on the top of the last, turned by all the rocking under it; the
    // pyramid's glasses stand on their boards, each rocking on its own
    const sway = 0.012 * clamp(f.rel.bassDrive) * Math.sin(f.rel.bassClock * 2), frames = [];
    if (w.kind === 'pyramid') w.ps.forEach((p, i) => { const [ox, oy] = pyrAt(i); frames.push([bx + ox * N, floor - oy * N, p.a + sway]); });
    else { let x = bx, y = floor, a = sway; for (const p of w.ps) { a += p.a; frames.push([x, y, a]); const h = PIECES[p.type].h * N; x += Math.sin(a) * h; y -= Math.cos(a) * h; } }
    // the topple: first one rigid body falling about the foot's edge, a' = (3g / 2L) sin a; past the lean it comes apart
    if (w.fall && w.ps.length) {
      const F = w.fall, L = Math.max(0.1 * N, floor - Math.min(...frames.map((q) => q[1] - PIECES.cup.h * N)));
      if (!F.dir) F.dir = Math.sign(F.om);
      const pvx = bx + F.dir * (w.kind === 'pyramid' ? 0.19 : 0.04) * N, n = Math.ceil(dt / 0.01);
      for (let k = 0; k < n; k++) { F.om += ((1.5 * g) / L) * Math.sin(F.th + 0.03 * F.dir) * (dt / n); F.th += F.om * (dt / n); }
      const R = turn(0, 0, F.th), at = ([x, y, a]) => { const [qx, qy] = R(x - pvx, y - floor); return [pvx + qx, floor + qy, a + F.th]; };
      if (Math.abs(F.th) < 0.45) frames.forEach((q, i) => (frames[i] = at(q)));
      else { // apart: each piece flies on with the speed the turning tower gave it there
        w.ps.forEach((p, i) => {
          const [x, y, a] = at(frames[i]), h = PIECES[p.type].h * N, cx = x + Math.sin(a) * h * 0.5, cy = y - Math.cos(a) * h * 0.5;
          w.bodies.push({ type: p.type, x: cx, y: cy, vx: -F.om * (cy - floor), vy: F.om * (cx - pvx), ang: a, va: F.om * (0.7 + 0.6 * rnd()), tint: p.tint, rest: 0 });
        });
        w.ps = []; frames.length = 0; w.fall = null; w.full = 0; w.wait = 0; w.clink = 0; s.shake = Math.max(s.shake, 0.4);
      }
    }
    // the free pieces: gravity, a bounce off the counter that keeps a fraction of the speed, then cups roll (ω = v/r on
    // their rims) and saucers slide on friction and settle flat; they knock each other apart; off the edge they fall
    for (const b of w.bodies) {
      const pc = PIECES[b.type], n = Math.ceil(dt / 0.01), hh = dt / n, half = (pc.h * N) / 2, rr = Math.max(...pc.pts.map(([px, py]) => Math.hypot(px * N, py * N + half)));
      for (let k = 0; k < n; k++) {
        b.vy += g * hh; b.x += b.vx * hh; b.y += b.vy * hh; b.ang += b.va * hh;
        if (b.x > edge + rr * 0.3) continue; // past the edge: nothing under it
        let low = -1e9;
        for (const [px, py] of pc.pts) { const ly = px * N * Math.sin(b.ang) + (py * N + half) * Math.cos(b.ang); if (ly > low) low = ly; }
        if (b.y + low >= floor) {
          b.y = floor - low;
          if (b.vy > 0) b.vy = b.vy > 0.04 * N ? -pc.e * b.vy : 0;
          if (b.type === 'saucer') { b.vx -= Math.sign(b.vx) * Math.min(Math.abs(b.vx), 0.35 * g * hh); const flat = Math.round(b.ang / Math.PI) * Math.PI; b.va = follow(b.va, (flat - b.ang) * 10, hh, 0.05); }
          else { b.vx *= Math.exp(-hh * 1.2); b.va = b.vx / rr; }
        }
      }
      if (Math.abs(b.vx) < 0.01 * N && Math.abs(b.vy) < 0.01 * N) { b.rest += dt; if (b.type !== 'saucer') { const st = Math.round(b.ang / (Math.PI / 2)) * (Math.PI / 2); b.ang = follow(b.ang, st, dt, 0.15); b.va = 0; } }
    }
    for (let i = 0; i < w.bodies.length; i++)
      for (let j = i + 1; j < w.bodies.length; j++) {
        const p = w.bodies[i], q = w.bodies[j], d = q.x - p.x, need = 0.06 * N;
        if (Math.abs(d) < need && Math.abs(q.y - p.y) < 0.05 * N) { const sg = Math.sign(d) || 1, rel = (q.vx - p.vx) * sg; p.x -= (sg * (need - Math.abs(d))) / 2; q.x += (sg * (need - Math.abs(d))) / 2; if (rel < 0) { const im = (-rel * 1.5) / 2; p.vx -= sg * im; q.vx += sg * im; } }
      }
    // the sweep: once they lie still (or after three seconds) an arm clears the counter over the edge
    if (!w.sweeping && w.bodies.length && ((w.wait += dt) > 3 || w.bodies.every((b) => b.rest > 0.4 || b.y > N))) { w.sweeping = true; w.sx = -0.1 * N; }
    if (w.sweeping) {
      w.sx += 0.7 * N * dt;
      for (const b of w.bodies) if (b.x < w.sx + 0.05 * N && b.y > floor - 0.15 * N) { b.x = w.sx + 0.05 * N; b.vx = Math.max(b.vx, 0.7 * N); b.rest = 0; }
      r.rect(w.sx - 0.3 * N, floor - 0.035 * N, 0.3 * N, 0.03 * N, DARK);
      ell(r, w.sx + 0.01 * N, floor - 0.02 * N, 0.025 * N, 0.018 * N, LMID);
      if (w.sx > 1.1 * N) { w.sweeping = false; w.bodies = []; if (w.next) { w.kind = w.next; w.next = null; } }
    }
    w.bodies = w.bodies.filter((b) => b.y < 1.3 * N && b.x > -0.3 * N);
    // the room: a tiled wall, the counter and its edge
    for (let y = 0.5 * N; y < floor; y += 6 * u) span(r, y, 0, N, BG + DIM);
    for (let x = 0; x < N; x += 6 * u) r.rect(x, 0.5 * N, mx1(u * 0.6), floor - 0.5 * N, BG + DIM);
    r.rect(0, floor, edge, 0.02 * N, LMID);
    r.rect(0, floor, edge, mx1(u), BRIGHT);
    r.rect(0, floor + 0.02 * N, edge, N - floor, MID);
    for (let x = 6 * u; x < edge; x += 9 * u) r.rect(x, floor + 0.04 * N, mx1(u), N - floor, MID + DIM);
    // the tower (its boards for the pyramid), the free pieces, the clink
    if (w.kind === 'pyramid') for (let row = 1; row < 4; row++) { const k = [4, 7, 9][row - 1]; if (w.ps.length > k) { const a = frames[k], b2 = frames[Math.min(k + 3 - row, w.ps.length - 1)]; r.stroke(a[0] - 0.05 * N, a[1] - u, b2[0] + 0.05 * N, b2[1] - u, mx1(1.5 * u), LMID); } } // the board each row stands on
    w.ps.forEach((p, i) => { const [x, y, a] = frames[i]; drawPiece(r, p.type, turn(x, y, a), N, u, p.tint); });
    for (const b of w.bodies) { const half = (PIECES[b.type].h * N) / 2; drawPiece(r, b.type, turn(b.x - Math.sin(b.ang) * half, b.y + Math.cos(b.ang) * half, b.ang), N, u, b.tint); }
    if (w.clink > 0 && w.ps.length) { w.clink -= dt; const [x, y, a] = frames[frames.length - 1], h = PIECES[w.ps[w.ps.length - 1].type].h * N, tx = x + Math.sin(a) * h, ty = y - Math.cos(a) * h; for (const [dx, dy] of [[1, -0.3], [-1, -0.3], [0.5, -1], [-0.5, -1]]) r.line(tx + dx * 3 * u, ty + dy * 3 * u, tx + dx * 6 * u, ty + dy * 6 * u, WHITE); }
    if (frames.length) { const top = Math.min(...frames.map((q) => q[1])) - 0.1 * N; targets.push({ x: bx - 0.12 * N, y: top, w: 0.24 * N, h: floor - top }); }
    // the hand: it arrives with the next piece on the beat, sets it down, goes back for another
    if (!w.fall && !w.sweeping && !w.bodies.length && w.ps.length < mx) {
      const i = w.ps.length, q = frames[i - 1], [nx2, ny2] = w.kind === 'pyramid' ? [bx + pyrAt(i)[0] * N, floor - pyrAt(i)[1] * N] : q ? [q[0] + Math.sin(q[2]) * PIECES[w.ps[i - 1].type].h * N, q[1] - Math.cos(q[2]) * PIECES[w.ps[i - 1].type].h * N] : [bx, floor];
      const away = ((1 - Math.cos(TAU * ph)) / 2) * 0.55 * N, hx = nx2 + 0.07 * N + away, hy = ny2 - 0.02 * N - (ph > 0.5 ? 0 : 0.02 * N);
      if (ph > 0.5) drawPiece(r, pieceOf(w.kind, i), turn(hx - 0.07 * N, ny2 - 0.004 * N - (1 - ph) * 0.03 * N, 0), N, u, w.tint);
      r.stroke(hx, hy, N + 0.05 * N, hy + 0.08 * N, mx1(6 * u), DARK);
      ell(r, hx, hy, 0.022 * N, 0.016 * N, LMID);
    }
  },
};

// ---------------------------------------------------------------------------------------------- microfoam
// Milk foam under the lens: bubbles of many sizes pressed together into cells (circles pushed apart until they only
// just overlap, lit from the upper left), coarsening as foam does: the gas leaves the small bubbles, whose pressure is
// higher, for the big ones (each radius changes as (1/r̄ − 1/r) / r: the small ones shrink ever faster and vanish, the
// big ones grow), the foam staying pressed together; it drifts slowly round, faster with the mids, and the treble
// jostles it. A kick is the pitcher tapped on the counter: the biggest bubble pops in a ring and a spray of droplets,
// and its neighbours close in; a snare is the swirl, a turn that is fastest in the middle (a shear) and rearranges
// the cells; the beat glints on the domes. The kind is the foam: fine microfoam, a latte's, or a dry, coarse one. A
// drop is a fresh stretch: a burst of new small bubbles.
const FOAM_W = { micro: [3, 2, 1], latte: [2, 2, 2], dry: [1, 2, 3] };
const FOAM_R = { micro: 0.03, latte: 0.042, dry: 0.06 };
// new bubbles of the kind's size, lognormal, until their area reaches `area`
function foamAdd(w, rnd, N, area, scale = 1) {
  const r0 = FOAM_R[w.kind] * N * scale;
  for (let a = 0; a < area && w.b.length < 330; ) {
    const gg = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(TAU * rnd()), r = clamp(r0 * Math.exp(0.45 * gg), 0.4 * r0, 2.5 * r0);
    w.b.push({ x: rnd() * N, y: rnd() * N, r, gl: 0 });
    a += Math.PI * r * r;
  }
}

const microfoam = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, FOAM_W, bandOf(W.a)), b: [], rings: [], drops: [], swirl: 0, close: null, N });
    foamAdd(w, rnd, N, 1.4 * N * N);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), cx = N / 2, cy = N / 2;
    if (w.N !== N) { const k = N / w.N; for (const b of w.b) { b.x *= k; b.y *= k; b.r *= k; } w.N = N; }
    if (f.section === 'change') { w.kind = rollW(rnd, FOAM_W, band); foamAdd(w, rnd, N, 0.25 * N * N); }
    if (f.section === 'drop') { foamAdd(w, rnd, N, 0.45 * N * N, 0.55); s.shake = Math.max(s.shake, 0.2); }
    for (const hh of hits) {
      if (isLow(hh) && w.b.length > 8) { // the tap: the biggest goes, in a ring and a spray
        let bi = 0;
        for (let i = 1; i < w.b.length; i++) if (w.b[i].r > w.b[bi].r) bi = i;
        const B = w.b[bi];
        w.rings.push({ x: B.x, y: B.y, r: B.r, t: 0 });
        for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + rnd() * 0.5, sp = (0.25 + 0.2 * rnd()) * N; w.drops.push({ x: B.x + Math.cos(a) * B.r, y: B.y + Math.sin(a) * B.r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 }); }
        w.b.splice(bi, 1);
        w.close = { x: B.x, y: B.y, R: B.r, t: 0 };
      } else if (hh.kind === 'snare') w.swirl += (rnd() < 0.5 ? -1 : 1) * 2.2 * hh.strength;
    }
    if (f.beat.on) for (let k = 0; k < 6 && w.b.length; k++) w.b[Math.floor(hash(k, f.beat.count) * w.b.length)].gl = 0.15;
    // coarsening: the small bubbles feed the big ones (faster with the level), the vanished ones gone; then the whole
    // foam keeps pressed together, its area held
    let mean = 0;
    for (const b of w.b) mean += b.r;
    mean /= Math.max(1, w.b.length);
    const K = ((FOAM_R[w.kind] * N) ** 3 / 40) * (0.5 + f.level);
    let area = 0;
    for (const b of w.b) { b.r = Math.max(0, b.r + Math.max(-0.5 * b.r, (K / b.r) * (1 / mean - 1 / b.r) * dt)); area += Math.PI * b.r * b.r; }
    w.b = w.b.filter((b) => b.r > 0.5 * u);
    const sc = Math.pow((1.4 * N * N) / Math.max(1, area), 0.5 * Math.min(1, dt * 2)); // (pressed: more than the screen holds, so the cells fill it)
    for (const b of w.b) b.r *= sc;
    // the drift (a slow turn), the swirl (a turn fastest in the middle: shear), the jostle with the treble
    w.swirl *= Math.exp(-dt * 2.5);
    const om = 0.04 * (0.5 + clamp(f.rel.midDrive)), jig = clamp(f.rel.trebDrive) * u * Math.sqrt(dt) * 3, R2 = (0.32 * N) ** 2;
    const C = w.close;
    if (C && (C.t += dt) > 0.4) w.close = null;
    for (const [i, b] of w.b.entries()) {
      if (C) { const ex = C.x - b.x, ey = C.y - b.y, e = Math.hypot(ex, ey); if (e < C.R * 2.5 && e > 1) { const v = C.R * 2.5 * (1 - C.t / 0.4) * dt; b.x += (ex / e) * v; b.y += (ey / e) * v; } } // the neighbours close in on the gap
      const dx = b.x - cx, dy = b.y - cy, o = om + w.swirl * Math.exp(-(dx * dx + dy * dy) / R2);
      b.x += -dy * o * dt + (hash(i, Math.floor(t * 10)) - 0.5) * jig;
      b.y += dx * o * dt + (hash(i + 999, Math.floor(t * 10)) - 0.5) * jig;
    }
    // the packing: sorted along x, each pair that overlaps is pushed apart, the small one moving more
    const B = w.b.sort((p, q) => p.x - q.x);
    let rmax = 0;
    for (const b of B) rmax = Math.max(rmax, b.r);
    for (let it = 0; it < 3; it++)
      for (let i = 0; i < B.length; i++) {
        const p = B[i];
        for (let j = i + 1; j < B.length && B[j].x - p.x < p.r + rmax; j++) {
          const q = B[j], dx = q.x - p.x, dy = q.y - p.y, need = (p.r + q.r) * 0.94, d2 = dx * dx + dy * dy;
          if (d2 >= need * need || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), push = (need - d) * 0.5, mp = p.r * p.r, mq = q.r * q.r, sp = mq / (mp + mq), sq = mp / (mp + mq);
          p.x -= (dx / d) * push * sp; p.y -= (dy / d) * push * sp; q.x += (dx / d) * push * sq; q.y += (dy / d) * push * sq;
        }
        p.x = clamp(p.x, 0, N); p.y = clamp(p.y, 0, N);
      }
    // the foam: the liquid between, each bubble a dome with its rim, its lit side and a spark of the light
    r.fill(MID);
    for (const b of B) {
      const rr = b.r;
      if (rr < 2.5 * u) { ell(r, b.x, b.y, rr, rr, LMID); r.set(b.x - rr * 0.4, b.y - rr * 0.4, BRIGHT); continue; }
      ell(r, b.x, b.y, rr, rr, MID + DIM);
      ell(r, b.x, b.y, rr - mx1(0.8 * u), rr - mx1(0.8 * u), LMID);
      ell(r, b.x - rr * 0.22, b.y - rr * 0.22, rr * 0.5, rr * 0.45, BRIGHT);
      const g2 = b.gl > 0 ? 2 : 1;
      b.gl -= dt;
      r.rect(b.x - rr * 0.42 - u * 0.5 * g2, b.y - rr * 0.42 - u * 0.5 * g2, mx1(u * g2), mx1(u * g2), WHITE);
      circ(r, b.x, b.y, rr * 0.75, LMID + DIM, 1, 0.1, 1.4); // the far film catching the light low on the right
    }
    w.rings = w.rings.filter((rg) => { rg.t += dt; circ(r, rg.x, rg.y, rg.r * (1 + rg.t * 8), rg.t < 0.1 ? WHITE : BRIGHT); return rg.t < 0.2; });
    w.drops = w.drops.filter((d) => { d.vx *= Math.exp(-dt * 6); d.vy *= Math.exp(-dt * 6); d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt; r.set(d.x, d.y, WHITE); return d.life > 0; });
    if (B.length) { const big = B.reduce((p, q) => (q.r > p.r ? q : p)); targets.push({ x: big.x - big.r, y: big.y - big.r, w: 2 * big.r, h: 2 * big.r }); }
  },
};

const WORLDS = { latteart, espresso, pourover, cafe, roaster, mokapot, icedcream, steamcurl, grinder, morningwindow, cupstack, microfoam };

registerFamily('coffee', WORLD_DEFS, WORLDS);
export const COFFEE_STYLE = makeMixStyle('COFFEE BAR', ['coffee']);
