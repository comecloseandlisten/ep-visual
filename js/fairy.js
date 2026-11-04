// Fairy-tale parody, mixed. Twelve scenes of the folk-tale figures everyone owns, in original pixel silhouettes
// only: an ogre in his swamp with a donkey, the exiles' camp at its edge, a dragon's keep over the lava, an onion
// peeled a ring a beat, a lord's absurdly tall castle, a gingerbread man on the run, a godmother in her bubble, a cat
// in boots fencing, a wolf in a bonnet, a beanstalk into the clouds, a troll under his bridge, a frog on the lily
// pads. No designs, names, logos or letters from any film: the public-domain tales and nothing else. Each world has
// a kinds table weighed by the arousal band, re-rolled on a section change, with a heavy turn on a drop; all of
// them move by the same physics: gaits keep step with the beat and the ground goes by at the stride, thrown things
// fly parabolas and fall with the gravity of mixer's particles, bubbles rise to a terminal speed, pendulums swing
// about their pivots, ripples and shockwaves spread at one speed, and what topples turns about its foot.
import { Raster, clamp, lerp } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow,
  followAngle, ease, beatLocked, hash, pickW, walker, particles, burst, shiftRow, shiftRows, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  ogreswamp: { name: 'the ogre\'s swamp', va: [[H, M], [M, L], [M, M]], pals: ['swamp', 'parchment', 'gameboy', 'tape', 'sepia'], fx: ['none', 'film', 'frame', 'vhs'], themes: ['nature', 'play'] },
  exiles: { name: 'the exiles\' camp', va: [[H, M], [M, L], [M, M]], pals: ['swamp', 'tape', 'parchment', 'midnight', 'sepia'], fx: ['none', 'film', 'vhs', 'frame'], themes: ['lonely', 'play', 'night'] },
  dragonkeep: { name: 'the dragon\'s keep', va: [[M, H], [H, H], [H, M]], pals: ['midnight', 'warband', 'royal', 'tape', 'candy'], fx: ['none', 'film', 'crt', 'cards'], themes: ['glory', 'war', 'love'] },
  onion: { name: 'the onion', va: [[H, L], [H, M], [M, L]], pals: ['pastel', 'parchment', 'candy', 'tape', 'gameboy'], fx: ['none', 'frame', 'crt', 'cards'], themes: ['play', 'lonely'] },
  lordscastle: { name: 'the lord\'s castle', va: [[M, H], [H, H], [H, M]], pals: ['royal', 'parchment', 'candy', 'pastel', 'warband'], fx: ['none', 'frame', 'film', 'cards'], themes: ['glory', 'play'] },
  gingerbread: { name: 'the gingerbread run', va: [[H, M], [M, L], [M, M]], pals: ['candy', 'pastel', 'tape', 'parchment', 'gameboy'], fx: ['none', 'crt', 'frame', 'vhs'], themes: ['play', 'speed'] },
  godmother: { name: 'the godmother', va: [[H, L], [H, M], [M, L]], pals: ['midnight', 'pastel', 'candy', 'royal', 'swamp'], fx: ['none', 'film', 'crt', 'cards'], themes: ['dream', 'love', 'night'] },
  bootedcat: { name: 'the cat in boots', va: [[H, M], [M, H]], pals: ['tape', 'royal', 'sepia', 'parchment', 'candy'], fx: ['none', 'film', 'frame', 'cards'], themes: ['play', 'glory', 'war'] },
  wolfgrandma: { name: 'the wolf in the bonnet', va: [[L, M], [H, M]], pals: ['midnight', 'sepia', 'tape', 'swamp', 'gameboy'], fx: ['none', 'film', 'vhs', 'frame'], themes: ['night', 'paranoia', 'play'] },
  beanstalk: { name: 'the beanstalk', va: [[H, L], [H, M], [M, L]], pals: ['gameboy', 'pastel', 'parchment', 'swamp', 'midnight'], fx: ['none', 'frame', 'crt', 'film'], themes: ['dream', 'nature', 'glory'] },
  trollbridge: { name: 'the troll\'s bridge', va: [[H, M], [M, L], [M, M]], pals: ['parchment', 'swamp', 'tape', 'warband', 'gameboy'], fx: ['none', 'film', 'frame', 'crt'], themes: ['nature', 'play'] },
  frogprince: { name: 'the frog prince', va: [[H, L], [H, M], [M, L]], pals: ['swamp', 'pastel', 'midnight', 'candy', 'gameboy'], fx: ['none', 'film', 'crt', 'cards'], themes: ['love', 'dream', 'nature'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the kinds tables weigh their variants by it; a section change
// re-rolls the kind, a drop brings each world's heavy turn
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const GR = 1.6; // gravity, screens per second squared: what mixer's `particles` fall with, so everything falls alike
const bps = (f) => (f.bpm ? f.bpm / 60 : 2);
const mx1 = (u) => Math.max(1, u);
const dim = (c) => (c < DIM ? c + DIM : c);
// one column of cells from y0 down to y1, rounded the way Raster.rect rounds, without a fill call per row
const vline = (r, x, y0, y1, c) => { const N = r.N, xi = Math.round(x); if (xi < 0 || xi >= N) return; for (let y = Math.max(0, Math.round(y0)), e = Math.min(N, Math.round(y1)); y < e; y++) r.buf[y * N + xi] = c; };
// the gait phase: `steps` steps per beat (the legs alternate, so a cycle is two steps); free-running without a tempo
const gait = (w, f, dt, steps = 1) => (w.gait = beatLocked(f) ? (f.beat.count + f.beat.phase) * Math.PI * steps : w.gait + dt * Math.PI * bps(f) * steps);
// how far a figure travels per second at that gait: mixer's walker swings each foot a tenth of its height each way,
// so a step is a fifth of h; the quadruped below swings a fifth of its length each way, a step is two fifths
const pace = (h, f, steps = 1) => 0.2 * h * bps(f) * steps;
const trot = (sz, f, steps = 1) => 0.4 * sz * bps(f) * steps;
// a beat tick for things that go a step per beat: the beat itself when locked, else every half second
const tick = (w, f, dt) => (beatLocked(f) ? f.beat.on : (w.tickT = (w.tickT || 0) + dt) >= 0.5 && ((w.tickT = 0), true));
// a damped spring `o` = { x: offset from rest, v }: stiffness k and damping c per second, in steps of 1/120 s so a
// long frame rings the same as short ones
const spring = (o, dt, k, c) => { for (let n = Math.ceil(dt * 120), h = dt / n, i = 0; i < n; i++) { o.v += (-k * o.x - c * o.v) * h; o.x += o.v * h; } };
// a pendulum `p` = { a: angle from hanging straight down, w: rate } of length `len` cells about its pivot, under the
// same gravity as everything else; `damp` per second
const swing = (p, dt, len, N, damp = 0.5) => { for (let n = Math.ceil(dt * 120), h = dt / n, i = 0; i < n; i++) { p.w += (-((GR * N) / len) * Math.sin(p.a) - damp * p.w) * h; p.a += p.w * h; } };
// a local frame at (ox, oy) turned by `a`: a point mapper for anything that leans, banks or topples
const turn = (ox, oy, a) => { const c = Math.cos(a), s = Math.sin(a); return (dx, dy) => [ox + dx * c - dy * s, oy + dx * s + dy * c]; };
// a thin circle (an ellipse when squashed by sy) in O(R) cells: ripples, rings and shockwaves
function circ(r, cx, cy, R, c, sy = 1) {
  if (R < 0.5) return;
  const n = Math.max(8, Math.ceil(R * 7));
  for (let k = 0; k < n; k++) { const a = (k / n) * TAU; r.set(cx + Math.cos(a) * R, cy + Math.sin(a) * R * sy, c); }
}
// a square of two colours in a checker: a haze or a glass that shows on a light ground and a dark one alike
function checker(r, x, y, w, h, c1, c2) {
  const N = r.N, x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(N, Math.round(x + w)), y1 = Math.min(N, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) r.buf[yy * N + xx] = (xx + yy) & 1 ? c1 : c2;
}
// a filled ellipse: radii rx, ry
const oval = (r, cx, cy, rx, ry, c) => r.ring(cx, cy, rx / 2, rx, c, ry / rx);
// a few stars from a hash, in the top part of the sky
function stars(r, N, n, seed, col = LMID) { for (let k = 0; k < n; k++) r.set(hash(seed + k, 1) * N, hash(seed + k, 2) * N * 0.4, col); }

// debris that falls, bounces on `floor` (or its own `fl`) losing most of its speed, and comes to rest there, sliding
// to a stop; `s` its size
function tumble(W, list, floor, col) {
  const { r, dt, u, N } = W;
  for (const p of list) {
    const fl = p.fl ?? floor;
    p.vy += GR * N * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.y >= fl) { p.y = fl; if (p.vy > 0.05 * N) { p.vy *= -0.4; p.vx *= 0.6; } else { p.vy = 0; p.vx *= Math.exp(-dt * 15); } }
    const s = p.s ?? u;
    r.rect(p.x - s / 2, p.y - s, s, s, p.c ?? col);
  }
  return list.filter((p) => p.life > 0);
}
// drops that fall and are gone the moment they reach `floor` (or their own `fl`: into the mud, the lava, the pond);
// a plop where they land, if it is between x0 and x1 (the liquid); outside it they lie as a splat a moment
function drops(W, list, floor, col, plops = null, x0 = -Infinity, x1 = Infinity) {
  const { r, dt, u, N } = W;
  for (const p of list) {
    const fl = p.fl ?? floor, s = p.s ?? u;
    p.life -= dt;
    if (p.rest) { r.rect(p.x - s / 2, fl - s, s, mx1(s * 0.6), p.c ?? col); continue; }
    p.vy += GR * N * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y >= fl) { if (p.x > x0 && p.x < x1) { p.life = 0; if (plops) plops.push({ x: p.x, y: fl, t: 0 }); } else { p.rest = true; p.life = Math.min(p.life, 1.2); } }
    else r.rect(p.x - s / 2, p.y - s, s, s, p.c ?? col);
  }
  return list.filter((p) => p.life > 0);
}
// the plops: a ring on the surface spreading at one speed for a quarter second, flat in perspective
function plopRings(W, list, col, sy = 0.35, v = 0.12) {
  const { r, dt, N } = W;
  for (const p of list) { p.t += dt; circ(r, p.x, p.y, p.t * v * N, col, sy); }
  return list.filter((p) => p.t < 0.25);
}
// bubbles in a liquid: each rises ever quicker up to its terminal speed `vt` (drag; the big ones a little quicker),
// wobbles, and at the surface `top` pops into a ring that is gone in a tenth of a second
const bubble = (x, y, s, rnd) => ({ x, y, s, vy: 0, ph: rnd() * TAU, pop: -1 });
function bubbles(W, list, top, vt, col, filled = false) {
  const { r, dt, u, t } = W;
  for (const b of list) {
    if (b.pop < 0) {
      b.vy = follow(b.vy, -vt * (0.7 + (0.3 * b.s) / (2 * u)), dt, 0.3);
      b.y += b.vy * dt;
      b.x += Math.sin(t * 5 + b.ph) * 3 * u * dt;
      if (b.y - b.s <= top) { b.pop = 0; b.y = top; }
      else if (filled) r.disc(b.x, b.y, b.s, col);
      else circ(r, b.x, b.y, b.s, col);
    } else { b.pop += dt; circ(r, b.x, top, b.s * (1 + b.pop * 15), col, 0.4); }
  }
  return list.filter((b) => b.pop < 0.1);
}
// leaves and confetti: they fall at a low terminal speed, flutter, drift with the wind and rest where they land
function flutter(W, list, floor, wind, col) {
  const { r, dt, u, t, N } = W;
  for (const p of list) {
    if (p.y < floor) {
      p.vy = follow(p.vy, 0.07 * N, dt, 0.5);
      p.vx = follow(p.vx, wind + Math.sin(t * 4 + p.ph) * 0.05 * N, dt, 0.4);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y >= floor) p.y = floor;
    } else p.life -= dt;
    if (p.life > 0.5 || hash(p.x | 0, (t * 20) | 0) < p.life * 2) r.rect(p.x, p.y - u, mx1(1.5 * u), mx1(u), p.c ?? col);
  }
  return list.filter((p) => p.life > 0 && p.x > -5 && p.x < N + 5);
}
// smoke: a puff rises ever slower (drag), drifts with the wind, grows and thins out as it ages
const puff = (x, y, vx, vy, life = 2.5) => ({ x, y, vx, vy, life, age: 0 });
function smoke(W, list, wind, col = LMID, col2 = DARK + DIM) {
  const { r, dt, u } = W, k = Math.exp(-dt * 0.7);
  for (const p of list) {
    p.vy *= k;
    p.vx *= k;
    p.x += (p.vx + wind) * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.age += dt;
    const sz = u * (1 + p.age * 1.6);
    if (p.life > 0.8 || hash(p.x | 0, (p.age * 20) | 0) < p.life) checker(r, p.x - sz / 2, p.y - sz / 2, sz, sz, col, col2);
  }
  return list.filter((p) => p.life > 0);
}
// a fire `h` tall and `wd` wide standing on (x, base): tongues that jump with `tt` (a frame counter), a bright core
function flame(r, x, base, wd, h, tt, seed) {
  for (let k = 0; k < 5; k++) {
    const q = k / 5, ww = wd * (1 - q * 0.75) * (0.8 + 0.4 * hash(seed + k, tt)), j = (hash(seed + 9 + k, tt) - 0.5) * wd * q;
    r.rect(x - ww / 2 + j, base - h * (q + 0.22), ww, h * 0.24, k === 0 || hash(seed + 20 + k, tt) < 0.6 ? HOT : BRIGHT);
  }
  r.rect(x - wd * 0.2, base - h * 0.4, wd * 0.4, h * 0.4, BRIGHT);
}
// a tree: a trunk, boughs, and a canopy of lumps of which only the fraction `full` is still in leaf
function tree(r, x, base, h, u, full, seed, trunk = DARK + DIM, leaf = MID) {
  r.rect(x - 1.5 * u, base - h * 0.55, 3 * u, h * 0.55, trunk);
  for (const [dx, dy] of [[-0.25, -0.7], [0.25, -0.75], [0, -0.9]]) r.stroke(x, base - h * 0.5, x + dx * h, base + dy * h, mx1(1.2 * u), trunk);
  for (let k = 0; k < 6; k++) {
    if (hash(seed + k, 7) > full) continue;
    const a = (k / 6) * TAU, rr = k === 5 ? 0 : h * 0.2;
    r.disc(x + Math.cos(a) * rr, base - h * 0.72 + Math.sin(a) * rr * 0.6, h * (0.16 + 0.05 * hash(seed + k, 8)), leaf);
  }
}
// a cottage: walls `wd` wide, a thatched roof, a round door, a chimney
function hut(r, x, base, wd, u, wall = MID + DIM, roof = LMID + DIM, lit = false) {
  const ht = wd * 0.55;
  r.rect(x - wd / 2, base - ht, wd, ht, wall);
  r.poly([[x - wd * 0.6, base - ht], [x + wd * 0.6, base - ht], [x + wd * 0.25, base - ht - wd * 0.42], [x - wd * 0.25, base - ht - wd * 0.42]], roof);
  for (let k = 1; k < 4; k++) r.rect(x - wd * (0.6 - k * 0.07), base - ht - wd * 0.1 * k, wd * (1.2 - k * 0.14), mx1(u * 0.6), DARK + DIM);
  r.rect(x + wd * 0.1, base - ht - wd * 0.5, wd * 0.09, wd * 0.14, wall);
  r.disc(x - wd * 0.2, base - wd * 0.14, wd * 0.11, BLACK);
  r.rect(x - wd * 0.31, base - wd * 0.14, wd * 0.22, wd * 0.14, BLACK);
  r.rect(x + wd * 0.15, base - ht * 0.75, wd * 0.14, wd * 0.12, lit ? HOT : DARK);
}

// a four-legged beast `sz` long on `base` facing `dir`, trotting with `ph` (the diagonal pairs together; a foot is
// lifted while it swings forward and planted while the body goes over it): the barrel, the neck to a head held at
// `head` (0 down to the grass, 0.5 level, 1 up to bray), the ears laid back by `ears`, a tail swishing; horns, a
// bell, a bushy tail or a hood when asked. Returns the head, the neck and the back.
function quad(r, x, base, sz, col, ph, dir, u, o = {}) {
  const moving = o.moving ?? true, lw = mx1(sz * 0.07), far = dim(col), legH = sz * 0.36, bob = moving ? Math.abs(Math.cos(ph)) * sz * 0.03 : 0, by = base - legH - sz * 0.14 - bob;
  const leg = (k, n) => {
    const th = ph + (k === n ? 0 : Math.PI), hip = x + dir * (k ? 0.28 : -0.28) * sz;
    const sw = moving ? Math.sin(th) * 0.2 * sz : (k ? 0.03 : -0.03) * sz, lift = moving ? Math.max(0, Math.cos(th)) * sz * 0.12 : 0;
    r.stroke(hip, by + sz * 0.08, hip + dir * sw, base - lift, lw, n ? col : far);
  };
  if (o.shadow !== false) r.rect(x - sz * 0.4, base - mx1(u) * 0.5, sz * 0.8, mx1(u), DARK + DIM);
  leg(0, 0); leg(1, 0);
  oval(r, x, by, sz * 0.4, sz * 0.2, col);
  const hd = o.head ?? 0.5, nx = x + dir * sz * 0.34, ny = by - sz * 0.05, na = lerp(2.1, 0.25, hd), nl = sz * (0.26 + 0.1 * (1 - hd));
  const hx = nx + dir * Math.sin(na) * nl, hy = ny - Math.cos(na) * nl;
  r.stroke(nx, ny, hx, hy, mx1(sz * 0.11), col);
  const fa = na + 0.9, ml = sz * (o.muzzle ?? 0.2);
  r.stroke(hx, hy, hx + dir * Math.sin(fa) * ml, hy - Math.cos(fa) * ml, mx1(sz * 0.1), col);
  const ea = lerp(0.35, 2.1, o.ears ?? 0.2), el = sz * (o.earLen ?? 0.12);
  for (const k of [-0.3, 0.3]) r.line(hx, hy - sz * 0.03, hx - dir * Math.sin(ea + k) * el, hy - sz * 0.03 - Math.cos(ea + k) * el, col);
  if (o.horns) for (const k of [0, 0.35]) r.stroke(hx - dir * sz * 0.02, hy - sz * 0.04, hx - dir * sz * (0.1 + k * 0.3), hy - sz * (0.14 - k * 0.1), mx1(u), col);
  r.set(hx + dir * sz * 0.03, hy - sz * 0.02, o.eye ?? BRIGHT);
  const tx = x - dir * sz * 0.4, tsw = moving ? Math.sin(ph) * sz * 0.08 : 0;
  if (o.bushy) { oval(r, tx - dir * sz * 0.2, by + sz * 0.02 - tsw, sz * 0.24, sz * 0.1, col); r.set(tx - dir * sz * 0.4, by + sz * 0.02 - tsw, BRIGHT); }
  else r.stroke(tx, by - sz * 0.05, tx - dir * sz * 0.2, by + sz * (o.tailUp ? -0.18 : 0.15) - tsw, mx1(u), col);
  if (o.bell !== undefined) { const px = nx + dir * sz * 0.1, py = ny + sz * 0.02, bx = px + Math.sin(o.bell) * sz * 0.14, byy = py + Math.cos(o.bell) * sz * 0.14; r.line(px, py, bx, byy, LMID); r.disc(bx, byy, mx1(sz * 0.045), o.bellLit ? WHITE : BRIGHT); } // a pendulum 0.14 sz long from its strap
  leg(0, 1); leg(1, 1);
  return { hx, hy, nx, ny, by, top: by - sz * 0.2 };
}

// an upright pig `h` tall: a round belly, a round head with the snout out toward `dir`, two ears, stubby legs, and an
// arm swinging a hammer at `arm` radians from hanging down (forward being toward `dir`)
function pig(r, x, base, h, col, dir, u, arm) {
  const legH = h * 0.14, by = base - legH - h * 0.3, hy = by - h * 0.42;
  for (const k of [-0.16, 0.04]) r.rect(x + k * h, base - legH, h * 0.12, legH, col);
  r.disc(x, by, h * 0.3, col);
  r.disc(x, hy, h * 0.18, col);
  oval(r, x + dir * h * 0.17, hy + h * 0.03, h * 0.08, h * 0.06, LMID);
  for (const k of [-0.03, 0.02]) r.set(x + dir * h * (0.19 + k), hy + h * 0.03, DARK);
  for (const k of [-0.12, 0.02]) r.poly([[x + k * h, hy - h * 0.1], [x + (k + 0.1) * h, hy - h * 0.1], [x + (k + 0.05) * h, hy - h * 0.28]], col);
  r.set(x + dir * h * 0.08, hy - h * 0.04, BLACK);
  const sx = x + dir * h * 0.18, sy = by - h * 0.14, al = h * 0.26, hxx = sx + dir * Math.sin(arm) * al, hyy = sy + Math.cos(arm) * al;
  r.stroke(sx, sy, hxx, hyy, mx1(u * 1.2), col);
  const ex = hxx + dir * Math.sin(arm) * h * 0.2, ey = hyy + Math.cos(arm) * h * 0.2;
  r.stroke(hxx, hyy, ex, ey, mx1(u), LMID + DIM);
  r.stroke(ex - dir * Math.cos(arm) * h * 0.07, ey + Math.sin(arm) * h * 0.07, ex + dir * Math.cos(arm) * h * 0.07, ey - Math.sin(arm) * h * 0.07, mx1(u * 2), DARK);
  return { sx, sy, hx: hxx, hy: hyy, ex, ey };
}

// a blind mouse `sz` long walking toward `dir` with `ph`: a body, a round ear, a long tail, dark glasses, and a cane
// that taps the ground ahead on every step
function mouse(r, x, base, sz, col, ph, dir, u) {
  const by = base - sz * 0.3;
  for (const k of [0, Math.PI]) { const sw = Math.sin(ph + k) * sz * 0.15, lift = Math.max(0, Math.cos(ph + k)) * sz * 0.1; r.line(x + dir * (k ? -0.1 : 0.1) * sz, by + sz * 0.1, x + dir * sw, base - lift, col); }
  oval(r, x, by, sz * 0.36, sz * 0.2, col);
  const hx = x + dir * sz * 0.42, hy = by - sz * 0.08;
  r.poly([[hx - dir * sz * 0.12, hy - sz * 0.16], [hx + dir * sz * 0.22, hy + sz * 0.02], [hx - dir * sz * 0.12, hy + sz * 0.14]], col);
  r.disc(hx - dir * sz * 0.06, hy - sz * 0.16, sz * 0.09, col);
  r.rect(hx - dir * sz * 0.06 - sz * 0.08, hy - sz * 0.08, sz * 0.16, mx1(sz * 0.07), BLACK);
  let px = x - dir * sz * 0.36, py = by;
  for (let k = 1; k <= 4; k++) { const q = k / 4, nx = x - dir * sz * (0.36 + q * 0.5), ny = by + Math.sin(q * 3 + ph * 0.5) * sz * 0.1 - q * sz * 0.1; r.line(px, py, nx, ny, col); px = nx; py = ny; }
  const ca = 0.7 + Math.sin(ph) * 0.45, cl = sz * 0.5, cx0 = hx, cy0 = hy + sz * 0.1;
  r.line(cx0, cy0, cx0 + dir * Math.sin(ca) * cl, Math.min(base, cy0 + Math.cos(ca) * cl), LMID);
  return { hx, hy };
}

// a wooden puppet `h` tall: the walker in joints with a cone hat and a nose `nose` cells long that droops the head
function puppet(r, x, base, h, col, ph, dir, u, nose) {
  const J = walker(r, x, base, h, col, ph, dir, {}), head = h * 0.21, tilt = Math.min(0.5, nose / h);
  for (const [jx, jy] of [[x - h * 0.1, base - h * 0.16], [x + h * 0.1, base - h * 0.16], [J.sx, J.sy + h * 0.2]]) r.disc(jx, jy, mx1(u), LMID + DIM);
  const hy = J.head + tilt * head * 0.4, nx = x + dir * head * 0.45, ny = hy + head * 0.05;
  r.stroke(nx, ny, nx + dir * Math.cos(tilt) * nose, ny + Math.sin(tilt) * nose, mx1(u), col);
  r.disc(nx + dir * Math.cos(tilt) * nose, ny + Math.sin(tilt) * nose, mx1(u * 0.8), HOT);
  r.poly([[x - head * 0.6, hy - head * 0.3], [x + head * 0.6, hy - head * 0.3], [x + dir * head * 0.2, hy - head * 1.3]], col);
  r.rect(x - head * 0.7, hy - head * 0.35, head * 1.4, mx1(u), HOT);
  r.set(x + dir * head * 0.2, hy - head * 0.1, BRIGHT);
  return J;
}

// a witch on a broom at (x, y), `sz` the broom's length, headed along `ang` (radians, screen), the cape flying by `fly`
function witch(r, x, y, sz, ang, u, fly) {
  const P = turn(x, y, ang), lw = mx1(u);
  const a = P(-sz * 0.5, 0), b = P(sz * 0.45, 0);
  r.stroke(a[0], a[1], b[0], b[1], lw, DARK);
  for (const k of [-0.1, 0, 0.1]) { const c = P(-sz * 0.5, 0), d = P(-sz * 0.75, k * sz * 1.6); r.line(c[0], c[1], d[0], d[1], DARK); }
  const seat = P(0, -sz * 0.04), sh = P(sz * 0.08, -sz * 0.28), hd = P(sz * 0.14, -sz * 0.36);
  r.stroke(seat[0], seat[1], sh[0], sh[1], mx1(sz * 0.07), FIG);
  r.disc(hd[0], hd[1], sz * 0.07, FIG);
  const h1 = P(sz * 0.02, -sz * 0.4), h2 = P(sz * 0.26, -sz * 0.4), h3 = P(sz * 0.12, -sz * 0.64);
  r.poly([h1, h2, h3], FIG);
  const c1 = P(sz * 0.04, -sz * 0.3), c2 = P(-sz * 0.3, -sz * (0.18 + 0.15 * fly)), c3 = P(-sz * 0.24, -sz * 0.02);
  r.poly([c1, c2, c3], FIG + DIM);
  const kn = P(sz * 0.2, -sz * 0.06), ft = P(sz * 0.18, sz * 0.1);
  r.line(seat[0], seat[1], kn[0], kn[1], FIG); r.line(kn[0], kn[1], ft[0], ft[1], FIG);
  return hd;
}

// a small fairy `h` tall at (x, base): a dress, wings beating with `flap` (0..1), a wand toward `dir`; returns the wand's tip
function fairy(r, x, base, h, dir, u, flap) {
  const hy = base - h * 0.82;
  for (const k of [-1, 1]) oval(r, x + k * h * 0.22, base - h * 0.5, h * 0.2 * (0.4 + 0.6 * flap), h * 0.22, COOL);
  r.poly([[x - h * 0.22, base], [x + h * 0.22, base], [x + h * 0.06, base - h * 0.62], [x - h * 0.06, base - h * 0.62]], LMID);
  r.disc(x, hy, h * 0.13, FIG);
  const wx = x + dir * h * 0.42, wy = base - h * 0.55;
  r.line(x + dir * h * 0.06, base - h * 0.5, wx, wy, FIG);
  r.rect(wx - u, wy - u * 0.5, 3 * u, mx1(u), BRIGHT);
  r.rect(wx, wy - 1.5 * u, mx1(u), 3 * u, BRIGHT);
  return [wx, wy];
}

// a dragon in the air at (x, y), `sz` across, facing `dir`, banked by `bank` (radians), wings beating by `flap`
// (1 up, -1 down), the jaw open by `jaw`; `col` the body, `wing` the sails. Returns the mouth and the eye.
function dragonFly(r, x, y, sz, dir, bank, flap, jaw, u, col = FIG, wingCol = FIG + DIM) {
  const T = turn(x, y, bank), P = (dx, dy) => T(dx * dir, dy), lw = mx1(sz * 0.05);
  for (const k of [-1, 1]) { // the far wing first, then the body, then the near one
    if (k > 0) { oval(r, x, y, sz * 0.34, sz * 0.12, col); }
    const wa = P(-sz * 0.05, -sz * 0.04), wt = P(-sz * 0.2 - sz * 0.12 * k, -sz * (0.42 * flap + 0.06) * (k > 0 ? 1 : 0.8)), wb = P(-sz * 0.35, sz * 0.04);
    r.poly([wa, wt, wb], k > 0 ? wingCol : dim(wingCol));
    r.line(wa[0], wa[1], wt[0], wt[1], col);
  }
  let px, py;
  [px, py] = P(-sz * 0.3, 0);
  for (let k = 1; k <= 5; k++) { const q = k / 5, n = P(-sz * (0.3 + q * 0.55), Math.sin(q * 3 + flap) * sz * 0.08); r.stroke(px, py, n[0], n[1], mx1(lw * (1 - q * 0.7)), col); [px, py] = n; }
  const t1 = P(-sz * 0.85, -sz * 0.06), t2 = P(-sz * 0.95, sz * 0.03), t3 = P(-sz * 0.8, sz * 0.05);
  r.poly([t1, t2, t3], col);
  const nk = P(sz * 0.3, -sz * 0.04), hd = P(sz * 0.52, -sz * 0.2);
  r.stroke(nk[0], nk[1], hd[0], hd[1], mx1(sz * 0.09), col);
  const m1 = P(sz * 0.46, -sz * 0.26), m2 = P(sz * 0.74, -sz * 0.2), m3 = P(sz * 0.5, -sz * 0.14);
  r.poly([m1, m2, m3], col);
  const j1 = P(sz * 0.5, -sz * 0.14), j2 = P(sz * 0.7, -sz * 0.15 + sz * 0.12 * jaw);
  r.stroke(j1[0], j1[1], j2[0], j2[1], mx1(sz * 0.04), col);
  for (const k of [0, 0.06]) { const a = P(sz * (0.5 - k), -sz * 0.26), b = P(sz * (0.4 - k), -sz * 0.36); r.line(a[0], a[1], b[0], b[1], col); }
  const eye = P(sz * 0.56, -sz * 0.23);
  r.rect(eye[0] - u * 0.5, eye[1] - u * 0.5, mx1(u), mx1(u), HOT);
  const mouth = P(sz * 0.72, -sz * 0.16);
  return { mx: mouth[0], my: mouth[1], ex: eye[0], ey: eye[1] };
}

// a crown `wd` wide with its base at (x, y): a band and three points with a jewel
function crown(r, x, y, wd, u, col = BRIGHT) {
  r.rect(x - wd / 2, y - wd * 0.3, wd, wd * 0.3, col);
  for (const k of [-0.5, 0, 0.5]) r.poly([[x + (k - 0.2) * wd, y - wd * 0.28], [x + (k + 0.2) * wd, y - wd * 0.28], [x + k * wd, y - wd * 0.7]], col);
  r.rect(x - u * 0.5, y - wd * 0.2, mx1(u), mx1(u), HOT);
}

// a princess `h` tall standing (or seated when `sit`) at (x, base) facing `dir`: a gown, a bodice, the head with a
// crown, the shoulders lifted by `sigh`, the far arm waving at `wave` radians up from hanging. Returns the shoulder.
function princess(r, x, base, h, dir, u, o = {}) {
  const sit = o.sit ? 1 : 0, sigh = (o.sigh ?? 0) * h * 0.06, hipY = base - h * (0.45 - 0.25 * sit), shY = hipY - h * 0.24 - sigh;
  r.poly([[x - h * (0.28 + 0.1 * sit), base], [x + h * (0.28 + 0.15 * sit), base], [x + h * 0.08, hipY], [x - h * 0.08, hipY]], o.gown ?? LMID);
  r.rect(x - h * 0.09, shY, h * 0.18, hipY - shY, o.gown ?? LMID);
  const hy = shY - h * 0.12;
  r.disc(x, hy, h * 0.1, FIG);
  r.poly([[x - h * 0.1, hy - h * 0.02], [x - h * 0.16, hy + h * 0.2], [x - h * 0.02, hy + h * 0.1]], FIG);
  crown(r, x, hy - h * 0.07, h * 0.14, u);
  const wa = o.wave ?? 0, ax = x + dir * h * 0.09, ay = shY + h * 0.02;
  r.stroke(ax, ay, ax + dir * Math.sin(wa + 0.3) * h * 0.22, ay + Math.cos(wa + 0.3) * h * 0.22, mx1(u * 1.2), FIG);
  return { sx: ax, sy: ay, hy };
}

// a gingerbread man `h` tall running toward `dir` with `ph`: a cookie body with round ends, icing at the cuffs, a
// face, and `buttons` (bit flags) on the chest; returns where the buttons sit
function gingerman(r, x, base, h, dir, ph, u, buttons, cols) {
  const col = LMID + DIM, lw = mx1(h * 0.16), hy = base - h * 0.8;
  for (const k of [0, Math.PI]) { const sw = Math.sin(ph + k) * h * 0.1, lift = Math.max(0, Math.cos(ph + k)) * h * 0.12; r.stroke(x + dir * (k ? -0.04 : 0.04) * h, base - h * 0.3, x + dir * sw * 1.6, base - lift, lw, col); r.rect(x + dir * sw * 1.6 - u, base - lift - u, 2 * u, mx1(u), WHITE); }
  oval(r, x, base - h * 0.45, h * 0.2, h * 0.26, col);
  for (const k of [0, Math.PI]) { const sw = Math.sin(ph + k) * 0.5; r.stroke(x, base - h * 0.6, x + (k ? -1 : 1) * Math.cos(sw) * h * 0.26, base - h * 0.6 + Math.sin(sw) * h * 0.12, lw, col); }
  r.disc(x, hy, h * 0.2, col);
  r.set(x + dir * h * 0.05, hy - h * 0.05, DARK);
  r.set(x + dir * h * 0.13, hy - h * 0.05, DARK);
  for (let k = -1; k <= 1; k++) r.set(x + dir * h * 0.09 + k * u, hy + h * 0.07 - (k ? 0 : u), DARK);
  const bs = [];
  for (let k = 0; k < 3; k++) { const bx = x, byy = base - h * 0.56 + k * h * 0.1; bs.push([bx, byy]); if (buttons & (1 << k)) r.disc(bx, byy, mx1(h * 0.05), cols[k]); }
  return bs;
}

// a frog `sz` across sitting at (x, base) facing `dir`: the body, two eye bumps, the hind legs folded (or stretched
// by `leap`), the throat puffed by `throat`
function frog(r, x, base, sz, dir, u, leap = 0, throat = 0) {
  const by = base - sz * 0.22;
  for (const k of [-1, 1]) { const kx = x - dir * sz * 0.35, ky = by - sz * 0.05 - leap * sz * 0.1, fx = x - dir * sz * (0.5 + leap * 0.4), fy = base - leap * sz * 0.2; r.stroke(x - dir * sz * 0.1, by + sz * 0.05, kx, ky, mx1(sz * 0.1), k > 0 ? MID : MID + DIM); r.stroke(kx, ky, fx, fy, mx1(sz * 0.08), k > 0 ? MID : MID + DIM); }
  oval(r, x, by, sz * 0.4, sz * 0.24, MID);
  if (throat > 0) r.disc(x + dir * sz * 0.22, by + sz * 0.1, sz * 0.1 * throat + u * 0.5, LMID);
  for (const k of [-0.12, 0.12]) { r.disc(x + dir * sz * (0.2 + k), by - sz * 0.22, sz * 0.09, MID); r.set(x + dir * sz * (0.23 + k), by - sz * 0.24, BLACK); }
  r.line(x + dir * sz * 0.1, by, x + dir * sz * 0.38, by + sz * 0.02, DARK);
  for (const k of [0.1, 0.3]) r.line(x + dir * sz * k, by + sz * 0.1, x + dir * sz * (k + 0.05), base, MID);
}

// ---------------------------------------------------------------------------------------------- ogreswamp
// A hut with an outhouse at the edge of a mud pool, and the ogre wallowing in it: he slaps the mud on the kicks
// (blobs on parabolas, back into the pool with a plop), a donkey trots the bank a step a beat and brays on the
// snares (head up, ears back), fireflies light on the hats, swamp bubbles rise through the mud at their terminal
// speed and pop at the top, the outhouse door bangs on a heavy snare, a blank sign stands by the water. The kind
// is the hour: dawn, noon, dusk or night, which sets the light and which way the shadows lie. A drop is the ogre's
// roar: a shockwave ring runs out at one speed and blows the leaves off every tree it passes; they flutter down,
// drift on the wind and lie where they fall, and the canopies grow back slowly.
const HOUR_W = { dawn: [2, 1, 1], noon: [1, 2, 2], dusk: [2, 2, 1], night: [2, 1, 2] };
const ogreswamp = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, HOUR_W, bandOf(W.a)), dk: { x: 0.3, dir: 1, bray: 0 }, gait: 0, flies: Array.from({ length: 14 }, () => ({ x: rnd(), y: 0.35 + rnd() * 0.4, ph: rnd() * TAU, lit: 0 })),
      bubs: [], blobs: [], plops: [], leaves: [], puffs: [], trees: [{ x: 0.06, h: 0.3, full: 1 }, { x: 0.6, h: 0.24, full: 1 }, { x: 0.86, h: 0.32, full: 1 }], roar: -1, slap: 0, jaw: 0, door: { x: 0, v: 0 } });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), kind = w.kind, g = 0.8 * N, mud = 0.87 * N, px0 = 0.28 * N, px1 = 0.74 * N;
    if (f.section === 'change') w.kind = rollW(rnd, HOUR_W, band);
    if (f.section === 'drop' && w.roar < 0) { w.roar = 0; w.jaw = 0.7; s.shake = Math.max(s.shake, 0.6); for (const fl of w.flies) fl.lit = 0; w.dk.bray = 0.8; w.door.v += 14; }
    // the hour: the sun low at dawn (east, right) and at dusk (west, left), high at noon, the moon and stars at
    // night; the shadows lie away from the light
    const night = kind === 'night', sunX = kind === 'dawn' ? 0.86 : kind === 'dusk' ? 0.14 : 0.5, shd = kind === 'dawn' ? -1 : kind === 'dusk' ? 1 : 0;
    if (night) { stars(r, N, 30, 11); r.disc(0.8 * N, 0.14 * N, 0.05 * N, BRIGHT); r.disc(0.815 * N, 0.13 * N, 0.04 * N, BG); }
    else r.disc(sunX * N, (kind === 'noon' ? 0.08 : 0.26) * N, (kind === 'noon' ? 0.05 : 0.07) * N, kind === 'noon' ? BRIGHT : HOT);
    for (let k = 0; k < 9; k++) r.disc((k * 0.125 - 0.02) * N, 0.64 * N, (0.05 + 0.03 * hash(k, 3)) * N, DARK + DIM); // the far treeline
    r.rect(0, 0.66 * N, N, N - 0.66 * N, DARK);
    for (const [i, tr] of w.trees.entries()) { // the trees, each with its shadow on the ground
      if (shd) r.rect(tr.x * N + (shd < 0 ? -tr.h * N * 0.5 : 0), g - u, tr.h * N * 0.5, mx1(u), DARK + DIM);
      tree(r, tr.x * N, g, tr.h * N, u, tr.full, i * 10);
      tr.full = Math.min(1, tr.full + dt * 0.04);
    }
    hut(r, 0.17 * N, 0.85 * N, 0.22 * N, u, MID + DIM, LMID + DIM, night || kind === 'dusk' || f.level > 0.6);
    if (rnd() < dt * (1 + 3 * f.level)) w.puffs.push(puff(0.2 * N, 0.85 * N - 0.23 * N, 0, -0.03 * N, 2 + rnd()));
    w.puffs = smoke(W, w.puffs, 0.01 * N).slice(-30);
    // the outhouse: a narrow shack with a tin roof, its door on a spring that a heavy snare bangs open
    const ox = 0.93 * N, ob = 0.86 * N, ow = 0.08 * N, oh = 0.14 * N;
    r.rect(ox - ow / 2, ob - oh, ow, oh, MID + DIM);
    r.poly([[ox - ow * 0.65, ob - oh - 4 * u], [ox + ow * 0.65, ob - oh - 2 * u], [ox + ow * 0.65, ob - oh + 1.5 * u], [ox - ow * 0.65, ob - oh]], LMID + DIM);
    r.rect(ox - ow * 0.3, ob - oh * 0.8, ow * 0.6, oh * 0.8, BLACK);
    spring(w.door, dt, 90, 6);
    const da = clamp(w.door.x, 0, 1.3), dw = ow * 0.6 * Math.cos(da), dl = ow * 0.6 * Math.sin(da) * 0.3;
    r.poly([[ox - ow * 0.3, ob - oh * 0.8], [ox - ow * 0.3 + dw, ob - oh * 0.8 - dl], [ox - ow * 0.3 + dw, ob - dl], [ox - ow * 0.3, ob]], DARK);
    r.disc(ox, ob - oh * 0.7, mx1(u), da > 0.3 ? BLACK : DARK + DIM);
    // the sign by the water: a post and a blank board
    r.rect(0.78 * N - u, 0.82 * N, 2 * u, 0.1 * N, DARK + DIM);
    r.rect(0.78 * N - 0.05 * N, 0.78 * N, 0.1 * N, 0.045 * N, LMID);
    r.frame(0.78 * N - 0.05 * N, 0.78 * N, 0.1 * N, 0.045 * N, DARK + DIM);
    // the donkey trots the bank behind the pool, a step a beat, turning at the ends; a snare is a bray
    const D = w.dk, dsz = 0.11 * N, ph = gait(w, f, dt);
    for (const hh of hits) {
      if (isLow(hh)) { w.slap = 0.3; for (const k of [-1, 1]) for (let i = 0; i < 4 + 8 * hh.strength; i++) w.blobs.push({ x: 0.5 * N + k * 0.23 * N, y: mud, vx: (k * 0.2 + (rnd() - 0.5) * 0.5) * N * hh.strength, vy: -(0.25 + 0.5 * rnd()) * N * hh.strength, life: 3, s: (1 + rnd()) * u, c: MID + DIM }); }
      else if (hh.kind === 'snare') { D.bray = 0.5; if (hh.strength > 0.7) w.door.v += 10 * hh.strength; }
      else if (hh.kind === 'hat') for (let k = 0; k < 3; k++) pick(rnd, w.flies).lit = 1;
    }
    D.x += (D.dir * trot(dsz, f) * dt) / N;
    if (D.x > 0.92) { D.x = 0.92; D.dir = -1; } else if (D.x < 0.08) { D.x = 0.08; D.dir = 1; }
    D.bray = Math.max(0, D.bray - dt);
    if (shd) r.rect(D.x * N + (shd < 0 ? -dsz * 0.7 : 0.1 * dsz), g - u, dsz * 0.6, mx1(u), DARK + DIM);
    quad(r, D.x * N, g, dsz, LMID, ph, D.dir, u, { head: D.bray > 0 ? 0.95 : 0.55, ears: D.bray > 0 ? 0.9 : 0.15, earLen: 0.24, muzzle: 0.22, shadow: false });
    targets.push({ x: D.x * N - dsz * 0.5, y: g - dsz * 0.75, w: dsz, h: dsz * 0.75 });
    // the pool and the ogre: his lower half is in the mud, so he is drawn and then the mud over him. The body
    // wallows with the bass clock; on a kick the hands come down flat into the mud (the splash is theirs) and lift
    // again slowly; the roar opens the jaw
    const oxg = 0.5 * N, sh = 0.17 * N, bob = Math.sin(f.rel.bassClock * 0.8) * 1.5 * u, slap = w.slap / 0.3;
    w.slap = Math.max(0, w.slap - dt);
    w.jaw = Math.max(0, w.jaw - dt * 0.9);
    const ty = mud - 0.05 * N + bob, hy = ty - 0.21 * N, hr = 0.075 * N;
    oval(r, oxg, ty, sh, sh * 0.75, FIG);
    for (const k of [-1, 1]) {
      const sx = oxg + k * sh * 0.85, sy = ty - sh * 0.4, hx = oxg + k * 0.23 * N, hyy = mud - 0.08 * N * (1 - slap) + (slap > 0 ? 0 : Math.sin(t * 1.3 + k) * u);
      r.stroke(sx, sy, hx, Math.min(hyy, mud), mx1(4 * u), FIG);
      r.disc(hx, Math.min(hyy, mud), 2.2 * u, FIG);
    }
    r.rect(oxg - hr * 0.5, hy + hr * 0.6, hr, hr * 0.6, FIG); // the neck
    r.disc(oxg, hy, hr, FIG);
    for (const k of [-1, 1]) r.poly([[oxg + k * hr * 0.9, hy - hr * 0.2], [oxg + k * hr * 1.45, hy - hr * 0.5], [oxg + k * hr * 0.95, hy + hr * 0.2]], FIG); // pointed ears
    r.rect(oxg - hr * 0.7, hy - hr * 0.35, hr * 1.4, mx1(u * 1.5), FIG + DIM); // the brow
    for (const k of [-0.4, 0.4]) { r.rect(oxg + k * hr - u, hy - hr * 0.15, 2 * u, mx1(u * 1.5), BRIGHT); r.set(oxg + k * hr + (D.x * N > oxg ? 0 : -1), hy - hr * 0.15, DARK); }
    oval(r, oxg, hy + hr * 0.15, hr * 0.28, hr * 0.2, FIG + DIM); // the nose
    if (w.jaw > 0.05) { const jh = hr * 0.5 * Math.min(1, w.jaw * 1.5); oval(r, oxg, hy + hr * 0.6, hr * 0.5, jh, BLACK); for (let k = -2; k <= 2; k++) r.rect(oxg + k * hr * 0.18 - u * 0.5, hy + hr * 0.6 - jh, mx1(u), mx1(u * 1.5), WHITE); }
    else r.rect(oxg - hr * 0.35, hy + hr * 0.55, hr * 0.7, mx1(u), FIG + DIM);
    targets.push({ x: oxg - hr * 1.4, y: hy - hr, w: hr * 2.8, h: hr * 2 });
    // the mud: the band over his waist, its skin catching the light, the bubbles rising through it to pop at the top
    r.rect(px0, mud, px1 - px0, N - mud, MID + DIM);
    for (let x = px0; x < px1; x += 3 * u) if (hash(Math.round(x), Math.floor(f.rel.bassClock * 2)) < 0.5) r.rect(x, mud, 2 * u, mx1(u * 0.7), LMID + DIM);
    if (rnd() < dt * (0.6 + 3 * f.rel.bassDrive)) w.bubs.push(bubble(px0 + 0.05 * N + rnd() * (px1 - px0 - 0.1 * N), N - 2 * u, (1 + 1.5 * rnd()) * u, rnd));
    w.bubs = bubbles(W, w.bubs, mud, 0.08 * N, LMID + DIM).slice(-40);
    w.blobs = drops(W, w.blobs, mud, MID + DIM, w.plops, px0, px1).slice(-120); // a plop in the pool, a splat on the bank
    w.plops = plopRings(W, w.plops, LMID + DIM, 0.3);
    // the fireflies wander and glow on the hats; only the lit ones show by day
    for (const fl of w.flies) {
      fl.x = (fl.x + Math.sin(t * 0.7 + fl.ph) * 0.03 * dt + 1) % 1;
      fl.y = clamp(fl.y + Math.cos(t * 0.9 + fl.ph * 1.3) * 0.03 * dt, 0.3, 0.78);
      fl.lit *= Math.exp(-dt * 2.5);
      if (fl.lit > 0.1) { r.rect(fl.x * N, fl.y * N, mx1(u), mx1(u), BRIGHT); if (fl.lit > 0.6) { r.set(fl.x * N - 1, fl.y * N, LMID); r.set(fl.x * N + 1, fl.y * N, LMID); } }
      else if (night || kind === 'dusk') r.set(fl.x * N, fl.y * N, LMID + DIM);
    }
    // the roar: a ring from the mouth at one speed; the leaves come off a tree the moment the ring reaches it
    if (w.roar >= 0) {
      const mx = oxg, my = hy + hr * 0.6, R = (w.roar += dt) * 0.7 * N;
      circ(r, mx, my, R, LMID);
      circ(r, mx, my, R - 2 * u, LMID + DIM);
      for (const [i, tr] of w.trees.entries()) {
        const cxx = tr.x * N, cyy = g - tr.h * N * 0.72, d = Math.hypot(cxx - mx, cyy - my);
        if (tr.blown || R < d) continue;
        tr.blown = true;
        tr.full = 0.1;
        for (let k = 0; k < 16; k++) { const a = Math.atan2(cyy - my, cxx - mx) + (rnd() - 0.5) * 1.2, sp = (0.2 + 0.3 * rnd()) * N; w.leaves.push({ x: cxx + (rnd() - 0.5) * tr.h * N * 0.5, y: cyy + (rnd() - 0.5) * tr.h * N * 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ph: rnd() * TAU, life: 3 + rnd() * 2, c: i % 2 ? MID : LMID }); }
      }
      if (R > 1.4 * N) { w.roar = -1; for (const tr of w.trees) tr.blown = false; }
    }
    w.leaves = flutter(W, w.leaves, g + 2 * u, 0.02 * N, MID).slice(-80);
  },
};

// ---------------------------------------------------------------------------------------------- exiles
// The camp of the exiled at the swamp's edge, in three rows of depth (the near row big and low, the far row small
// and high): three blind mice with canes walking in a chain, each a step behind the last, three pigs hammering a hut
// together a plank a beat, a wooden puppet whose nose grows on every snare and droops back, a wolf in a bonnet
// asleep in a bed (a snore bubble with the bass, popped by the kicks), seven short miners carrying a glass box in
// step, and a witch on a broom circling overhead along the tangent of her ellipse. The kind is who has the front
// row. A drop lights a bonfire and everyone moves to a ring around it and dances, a hop a beat, round and round.
const FRONT_W = { mice: [3, 2, 1], pigs: [2, 2, 2], puppet: [2, 2, 1], miners: [1, 2, 3] };
const exiles = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, FRONT_W, bandOf(W.a)), gait: 0, mx: 0.1, minx: 1.1, planks: 0, pp: [0, 0, 0], nose: 0, snore: 0, wth: rnd() * TAU, fire: 0, fireLeft: 0, dance: 0, dust: [], embers: [], puffs: [],
      rows: { mice: { y: 0, sc: 0 }, pigs: { y: 0, sc: 0 }, puppet: { y: 0, sc: 0 }, miners: { y: 0, sc: 0 } } });
    for (const k in w.rows) { const [y, sc] = exiles.row(k, w.kind); w.rows[k].y = y; w.rows[k].sc = sc; }
  },
  // the row of an act: the front for the kind, the static ones in the middle, the walking ones behind
  row(act, kind) { return act === kind ? [0.86, 1] : act === 'pigs' || act === 'puppet' ? [0.75, 0.72] : act === 'mice' ? [0.75, 0.72] : [0.66, 0.5]; },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), tt = Math.floor(t * 30), B = bps(f); // tt: the flicker clock, by time
    if (f.section === 'change') { w.kind = rollW(rnd, FRONT_W, band); w.planks = 0; }
    if (f.section === 'drop' && w.fire <= 0) { w.fire = 0.001; w.fireLeft = 16; }
    for (const k in w.rows) { const [y, sc] = exiles.row(k, w.kind); w.rows[k].y = follow(w.rows[k].y, y, dt, 0.8); w.rows[k].sc = follow(w.rows[k].sc, sc, dt, 0.8); }
    // the swamp at the back, the tents, the ground
    r.disc(0.2 * N, 0.14 * N, 0.05 * N, BRIGHT);
    stars(r, N, 20, 5, LMID + DIM);
    r.rect(0, 0.56 * N, N, 0.07 * N, MID + DIM);
    for (let x = 0; x < N; x += 3 * u) if (hash(Math.round(x / u), 9) < 0.5) r.rect(x, 0.56 * N + Math.sin(x * 0.2 + f.rel.bassClock) * u, mx1(u * 0.7), 1, LMID + DIM);
    for (let k = 0; k < 7; k++) { const x = (k * 0.16 + 0.03) * N; r.rect(x - u, 0.5 * N - 0.06 * N * hash(k, 2), 2 * u, 0.13 * N, DARK + DIM); r.disc(x, 0.47 * N - 0.06 * N * hash(k, 2), 0.045 * N, DARK + DIM); }
    r.rect(0, 0.63 * N, N, N - 0.63 * N, DARK);
    for (const [tx, tw] of [[0.5, 0.14], [0.72, 0.11]]) { r.poly([[tx * N - tw * N, 0.66 * N], [tx * N + tw * N, 0.66 * N], [tx * N, 0.66 * N - tw * N * 1.1]], LMID + DIM); r.poly([[tx * N - tw * N * 0.25, 0.66 * N], [tx * N + tw * N * 0.25, 0.66 * N], [tx * N, 0.66 * N - tw * N * 0.5]], BLACK); }
    // the hits: the nose on a snare, the snore popped by a kick, the witch's cape on a hat
    let popSnore = false, hat = 0;
    for (const hh of hits) {
      if (hh.kind === 'snare') w.nose = Math.min(0.14 * N, w.nose + 2 * u);
      else if (isLow(hh)) popSnore = true;
      else if (hh.kind === 'hat') hat = 1;
    }
    w.nose = follow(w.nose, 1.5 * u, dt, 2);
    w.cape = follow(w.cape || 0, hat, dt, 0.15);
    // the beat: a plank on the hut, a pig's hammer down; the fire counts its beats
    const ph = gait(w, f, dt), onTick = tick(w, f, dt);
    if (onTick) { if (w.planks < 12) w.planks++; w.pp[w.planks % 3] = 1; if (w.fire > 0) w.fireLeft--; }
    for (let k = 0; k < 3; k++) w.pp[k] *= Math.exp(-dt * 6);
    if (w.fire > 0) { w.fire += dt; if (w.fireLeft <= 0) { w.fireOut = (w.fireOut || 0) + dt; if (w.fireOut > 2.5) { w.fire = 0; w.fireOut = 0; } } }
    const burn = w.fire > 0 ? (w.fireLeft > 0 ? Math.min(1, w.fire * 1.6) : Math.max(0, 1 - w.fireOut / 2.5)) : 0;
    w.dance = follow(w.dance, burn > 0.3 ? 1 : 0, dt, 0.7);
    const dn = w.dance, fx = 0.5 * N, fy = 0.79 * N, spin = beatLocked(f) ? ((f.beat.count + f.beat.phase) * TAU) / 16 : t * 0.4;
    const hop = hopY(f, N, 0.035 * N) * dn; // a hop a beat under the common gravity: as high as it lets in the beat, at most 0.035 N (then a shorter hop and a stand)
    // the acts walk their rows when nobody is dancing: the mice's chain to the right, the miners' line to the left
    const R = w.rows, msz = 0.07 * N, mnh = 0.085 * N;
    if (dn < 0.5) { w.mx += (0.3 * msz * R.mice.sc * B * dt) / N; if (w.mx > 1.2) w.mx = -0.25; w.minx -= (pace(mnh * R.miners.sc, f) * dt) / N; if (w.minx < -0.4) w.minx = 1.1; }
    // every figure: its home in its row, its slot on the ring when dancing, blended; drawn far to near with the
    // fire in its place among them. Round the ring they go leftward on the near side and rightward on the far one,
    // and a dancer faces the way he goes
    const ents = [];
    const add = (kind, i, hx, hy, sc, n) => { const a = (n / 14) * TAU + spin, rx = fx + Math.cos(a) * 0.34 * N, ry = fy + Math.sin(a) * 0.07 * N, rs = 0.7 + 0.3 * (Math.sin(a) + 1) * 0.5; ents.push({ kind, i, x: lerp(hx, rx, dn), y: lerp(hy, ry, dn) - hop, g: lerp(hy, ry, dn), sc: lerp(sc, rs, dn), face: Math.sin(a) > 0 ? -1 : 1 }); };
    const facing = (e, d0) => (dn > 0.5 ? e.face : d0);
    for (let i = 0; i < 3; i++) add('mouse', i, w.mx * N - i * 0.9 * msz * R.mice.sc, R.mice.y * N, R.mice.sc, i);
    for (let i = 0; i < 3; i++) add('pig', i, (w.kind === 'pigs' ? 0.5 : 0.2) * N + [-0.15, 0.15, 0.02][i] * N * R.pigs.sc, R.pigs.y * N + (i === 2 ? 2 * u : 0), R.pigs.sc, 3 + i);
    add('puppet', 0, (w.kind === 'puppet' ? 0.5 : 0.8) * N, R.puppet.y * N, R.puppet.sc, 6);
    for (let i = 0; i < 7; i++) add('miner', i, w.minx * N + i * 0.55 * mnh * R.miners.sc, R.miners.y * N, R.miners.sc, 7 + i);
    ents.push({ kind: 'fire', x: fx, y: fy, g: fy, sc: 1 });
    ents.sort((p, q) => p.g - q.g); // by where they stand, not how high they hop
    // the hut the pigs build: posts, the planks so far, the roof when done
    const hx = (w.kind === 'pigs' ? 0.5 : 0.2) * N, hb = R.pigs.y * N, hs = R.pigs.sc, hw = 0.08 * N * hs, pH = 0.012 * N * hs;
    for (const k of [-1, 1]) r.rect(hx + k * hw - u, hb - 0.15 * N * hs, 2 * u, 0.15 * N * hs, DARK + DIM);
    for (let k = 0; k < w.planks; k++) { r.rect(hx - hw, hb - (k + 1) * pH, 2 * hw, pH, LMID + DIM); r.rect(hx - hw, hb - (k + 1) * pH, 2 * hw, mx1(u * 0.5), DARK + DIM); }
    if (w.planks >= 12) r.poly([[hx - hw * 1.2, hb - 12 * pH], [hx + hw * 1.2, hb - 12 * pH], [hx, hb - 12 * pH - hw * 0.9]], MID);
    // the wolf's bed at the back left: the blanket breathing with the bass clock, the snore bubble with the bass
    const bx = 0.16 * N, bby = 0.66 * N, bl = 0.14 * N, bh = 0.03 * N;
    r.rect(bx - bl / 2, bby - bh, bl, bh, DARK + DIM);
    r.rect(bx + bl / 2 - 2 * u, bby - bh - 0.04 * N, 2 * u, 0.04 * N + bh, DARK + DIM);
    r.rect(bx - bl / 2, bby - bh - 0.035 * N, 2 * u, 0.035 * N + bh, DARK + DIM);
    const breath = (1 + 0.5 * Math.sin(f.rel.bassClock)) * 1.5 * u, wolfUp = dn * 4 * u;
    r.rect(bx - bl / 2 + 2 * u, bby - bh - 1.5 * u, bl - 6 * u, 1.5 * u, LMID);
    oval(r, bx + bl * 0.05, bby - bh - 1.5 * u, bl * 0.2, breath, LMID);
    r.rect(bx + bl * 0.3, bby - bh - 2.5 * u, bl * 0.18, 2.5 * u, BRIGHT); // the pillow
    const why = bby - bh - 3 * u - wolfUp, whx = bx + bl * 0.38;
    r.disc(whx, why - u, 1.8 * u, BRIGHT); // the bonnet
    r.poly([[whx + u, why - 2 * u], [whx - 4 * u, why], [whx + u, why + 1.5 * u]], FIG); // the muzzle, to the left
    for (const k of [-1.5, 0.5]) r.line(whx + k * u, why - 1.5 * u, whx + k * u - 0.5 * u, why - 3.5 * u, FIG);
    r.set(whx - u, why - u, HOT);
    if (popSnore && w.snore > 1.5 * u) { circ(r, whx - 4 * u, why - w.snore, w.snore * 1.5, LMID); w.snore = 0; }
    w.snore = Math.min(5 * u, w.snore + dt * 2 * u * (0.3 + f.rel.bassDrive));
    if (w.snore > u) circ(r, whx - 4 * u - w.snore * 0.5, why - w.snore, w.snore * 0.5, LMID + DIM);
    // the dancers and the fire
    const minerBox = [];
    for (const e of ents) {
      const sc = e.sc;
      if (e.kind === 'fire') {
        if (burn <= 0) continue;
        for (const k of [-1, 1]) r.stroke(fx + k * 0.06 * N, fy, fx - k * 0.02 * N, fy - 0.03 * N, mx1(2 * u), DARK + DIM);
        flame(r, fx, fy - u, 0.1 * N * burn, 0.2 * N * burn * (0.8 + 0.4 * f.rel.bassDrive), tt, 40);
        if (rnd() < dt * 20 * burn * (0.3 + f.rel.trebDrive)) w.embers.push({ x: fx + (rnd() - 0.5) * 0.06 * N, y: fy - 0.1 * N * burn, vx: (rnd() - 0.5) * 0.05 * N, vy: -0.2 * N, life: 1 + rnd() });
        if (rnd() < dt * 4 * burn) w.puffs.push(puff(fx, fy - 0.2 * N * burn, 0, -0.05 * N, 2));
      } else if (e.kind === 'mouse') { // the chain: each one a step behind the one in front
        mouse(r, e.x, e.y, msz * sc, FIG, ph - e.i * Math.PI, facing(e, 1), u);
        if (e.i === 0 && w.kind === 'mice') targets.push({ x: e.x - msz, y: e.y - msz * 0.5, w: msz * 1.4, h: msz * 0.6 });
      } else if (e.kind === 'pig') {
        const dir = facing(e, e.i === 1 ? -1 : 1), arm = dn > 0.5 ? -0.5 - 0.8 * f.beat.pulse : lerp(-2.2, 0.9, w.pp[e.i]);
        const P = pig(r, e.x, e.y, 0.12 * N * sc, LMID, dir, u, arm);
        if (w.pp[e.i] > 0.9 && dn < 0.5) for (let k = 0; k < 2; k++) w.dust.push({ x: P.ex, y: P.ey, vx: (rnd() - 0.5) * 0.15 * N, vy: -rnd() * 0.15 * N, life: 0.5, s: u, c: LMID + DIM, fl: e.g }); // it settles on their own row
        if (e.i === 0 && w.kind === 'pigs') targets.push({ x: e.x - 0.05 * N, y: e.y - 0.12 * N, w: 0.1 * N, h: 0.12 * N });
      } else if (e.kind === 'puppet') {
        puppet(r, e.x, e.y, 0.14 * N * sc, FIG, dn > 0.5 ? ph : 0, facing(e, -1), u, w.nose * sc);
        if (w.kind === 'puppet') targets.push({ x: e.x - 0.05 * N, y: e.y - 0.16 * N, w: 0.1 * N + w.nose, h: 0.16 * N });
      } else { // the miners in step, the glass box on the shoulders of the middle five
        const h = mnh * sc, d = facing(e, -1), J = walker(r, e.x, e.y, h, MID, ph, d, { cap: true, hatCol: HOT });
        if (e.i === 0) { r.line(e.x + d * h * 0.3, J.sy + h * 0.2, e.x + d * h * 0.45, J.sy - h * 0.1, DARK + DIM); r.rect(e.x + d * h * 0.5 - (d > 0 ? 2 * u : 0), J.sy - h * 0.15, 2 * u, 2 * u, f.beat.pulse > 0.4 ? BRIGHT : HOT); }
        if (e.i >= 1 && e.i <= 5 && dn < 0.5) minerBox.push([e.x, J.sy, h]);
        if (e.i === 3 && w.kind === 'miners') targets.push({ x: e.x - 0.15 * N, y: e.y - h * 1.4, w: 0.3 * N, h: h * 1.4 });
      }
    }
    if (minerBox.length === 5) { // the glass box: a frame, the glass as a checker, a dark figure asleep inside; it rides the step
      const [x1, y1, h] = minerBox[0], [x0] = minerBox[4], top = y1 - h * 0.45 + Math.abs(Math.sin(ph)) * u * 0.8;
      checker(r, x0 - h * 0.2, top, x1 - x0 + h * 0.4, h * 0.42, BRIGHT, BG);
      r.frame(x0 - h * 0.2, top, x1 - x0 + h * 0.4, h * 0.42, COOL);
      r.rect(x0, top + h * 0.22, x1 - x0, h * 0.12, DARK + DIM);
      r.disc(x1 - h * 0.1, top + h * 0.25, h * 0.1, DARK + DIM);
    }
    // the witch circles overhead along her ellipse, lower and quicker round the fire, headed along the tangent
    w.wth += dt * (0.4 + 0.8 * f.rel.midDrive + 0.6 * dn);
    const wcx = 0.5 * N, wcy = lerp(0.3, 0.6, dn) * N, wrx = lerp(0.42, 0.3, dn) * N, wry = lerp(0.1, 0.06, dn) * N;
    const wx = wcx + Math.cos(w.wth) * wrx, wy = wcy + Math.sin(w.wth) * wry, vx = -Math.sin(w.wth) * wrx, vy = Math.cos(w.wth) * wry;
    const wsc = 0.75 + 0.25 * (Math.sin(w.wth) + 1) * 0.5, hd = witchFly(r, wx, wy, 0.16 * N * wsc, vx, vy, u, w.cape);
    targets.push({ x: wx - 0.08 * N, y: hd[1] - 0.04 * N, w: 0.16 * N, h: 0.14 * N });
    w.dust = tumble(W, w.dust, 0.86 * N, LMID + DIM).slice(-40);
    w.embers = w.embers.filter((e) => { e.vy = follow(e.vy, -0.02 * N, dt, 0.8); e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt; r.rect(e.x, e.y, mx1(u), mx1(u), e.life > 0.6 ? BRIGHT : HOT); return e.life > 0; }).slice(-80);
    w.puffs = smoke(W, w.puffs, 0.01 * N).slice(-40);
  },
};
// the witch headed along her velocity: facing the way she goes, mirrored when it is leftward
function witchFly(r, x, y, sz, vx, vy, u, fly) {
  if (vx >= 0) return witch(r, x, y, sz, Math.atan2(vy, vx), u, fly);
  const ang = Math.atan2(-vy, -vx), T = turn(x, y, ang), P = (dx, dy) => T(-dx, dy);
  return witchDraw(r, P, sz, u, fly);
}
function witchDraw(r, P, sz, u, fly) {
  const lw = mx1(u), a = P(-sz * 0.5, 0), b = P(sz * 0.45, 0);
  r.stroke(a[0], a[1], b[0], b[1], lw, DARK);
  for (const k of [-0.1, 0, 0.1]) { const c = P(-sz * 0.5, 0), d = P(-sz * 0.75, k * sz * 1.6); r.line(c[0], c[1], d[0], d[1], DARK); }
  const seat = P(0, -sz * 0.04), sh = P(sz * 0.08, -sz * 0.28), hd = P(sz * 0.14, -sz * 0.36);
  r.stroke(seat[0], seat[1], sh[0], sh[1], mx1(sz * 0.07), FIG);
  r.disc(hd[0], hd[1], sz * 0.07, FIG);
  r.poly([P(sz * 0.02, -sz * 0.4), P(sz * 0.26, -sz * 0.4), P(sz * 0.12, -sz * 0.64)], FIG);
  r.poly([P(sz * 0.04, -sz * 0.3), P(-sz * 0.3, -sz * (0.18 + 0.15 * fly)), P(-sz * 0.24, -sz * 0.02)], FIG + DIM);
  const kn = P(sz * 0.2, -sz * 0.06), ft = P(sz * 0.18, sz * 0.1);
  r.line(seat[0], seat[1], kn[0], kn[1], FIG); r.line(kn[0], kn[1], ft[0], ft[1], FIG);
  return hd;
}

// ---------------------------------------------------------------------------------------------- dragonkeep
// A tower on a lake of lava, a rope bridge to it from the cliff. The dragon circles the keep along the tangent of
// its ellipse (smaller and behind the tower on the far side), its wings beating with the beat; a kick is a breath
// of fire swept along the bridge that chars the planks. A knight runs across two steps a beat and the planks fall
// away behind him under gravity, turning as they drop, into the lava with a splash; in the door he goes and the
// bridge is re-laid a plank a beat from the cliff before he comes again. The princess waves from the top window on
// the snares. The kind is the dragon: a quick drake, a wyvern, a slow heavy wyrm. A drop lands the dragon on the
// bridge and the whole span goes into the lava, planks tumbling (the knight with them if he was on it).
const DRAGON_W = { drake: [3, 2, 1], wyvern: [2, 2, 2], wyrm: [1, 2, 3] };
const DRAGONS = { drake: { sz: 0.13, rate: 2, wing: LMID }, wyvern: { sz: 0.17, rate: 1, wing: FIG + DIM }, wyrm: { sz: 0.23, rate: 0.5, wing: COOL } };
const dragonkeep = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, DRAGON_W, bandOf(W.a)), planks: Array.from({ length: 16 }, () => ({ st: 0, y: 0, vy: 0, ang: 0, va: 0, delay: -1, burn: 0, char: 0 })),
      kn: { x: -0.08, st: 'run', t: 0, y: 0, vy: 0, ang: 0 }, gait: 0, th: rnd() * TAU, dx: 0, dy: 0, land: null, fire: null, wave: 0, embers: [], splash: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), tt = Math.floor(t * 30), lava = 0.72 * N, deck = 0.58 * N, tx = 0.82 * N, tw = 0.12 * N, bx0 = 0.14 * N, bx1 = tx - tw / 2, pw = (bx1 - bx0) / 16;
    if (f.section === 'change') w.kind = rollW(rnd, DRAGON_W, band);
    if (f.section === 'drop' && !w.land) w.land = { t: 0, st: 'down' };
    const K = DRAGONS[w.kind], sz = K.sz * N, ph = gait(w, f, dt, 2);
    for (const hh of hits) {
      if (isLow(hh) && !w.fire) { const x0 = bx0 + 0.05 * N + rnd() * (bx1 - bx0 - 0.35 * N); w.fire = { t: 0, x0, dir: 1 }; }
      else if (hh.kind === 'snare') w.wave = 0.6;
    }
    w.wave = Math.max(0, w.wave - dt);
    // the sky, the cliff on the left, the lava with its streaks running on the bass clock and its embers rising
    // quick and slowing
    stars(r, N, 24, 17);
    r.disc(0.3 * N, 0.12 * N, 0.05 * N, LMID);
    r.rect(0, lava, N, N - lava, HOT + DIM);
    for (let k = 0; k < 26; k++) { const x = ((hash(k, 1) + f.rel.bassClock * 0.02 * (1 + (k % 3))) % 1) * N, y = lava + 2 * u + hash(k, 2) * (N - lava - 3 * u); r.rect(x, y, (0.03 + 0.05 * hash(k, 3)) * N, mx1(u * 0.8), k % 4 ? HOT : BRIGHT); }
    if (rnd() < dt * (4 + 18 * f.rel.bassDrive)) w.embers.push({ x: rnd() * N, y: lava, vx: (rnd() - 0.5) * 0.04 * N, vy: -(0.1 + 0.1 * rnd()) * N, life: 1.2 + rnd() });
    w.embers = w.embers.filter((e) => { e.vy = follow(e.vy, -0.015 * N, dt, 0.8); e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt; r.rect(e.x, e.y, mx1(u), mx1(u), e.life > 0.7 ? BRIGHT : HOT); return e.life > 0; }).slice(-120);
    r.rect(0, deck, bx0, lava - deck, DARK);
    for (let y = deck + 3 * u; y < lava; y += 4 * u) for (let x = 2 * u; x < bx0 - u; x += 5 * u) if (hash(Math.round(x), Math.round(y)) < 0.4) r.rect(x, y, 2 * u, mx1(u), DARK + DIM);
    r.rect(bx0 - 2 * u, deck - 0.1 * N, 2 * u, 0.1 * N, DARK + DIM); // the rope post
    // the dragon's orbit: far side first, behind the tower
    w.th += dt * (0.35 + 0.6 * f.rel.midDrive + 0.3 * f.level) * (w.land ? 0 : 1);
    const ocx = 0.5 * N, ocy = 0.28 * N, orx = 0.42 * N, ory = 0.14 * N;
    let dxp = ocx + Math.cos(w.th) * orx, dyp = ocy + Math.sin(w.th) * ory, vx = -Math.sin(w.th) * orx, vy = Math.cos(w.th) * ory, far = Math.sin(w.th) < 0, dsc = 0.68 + 0.32 * (Math.sin(w.th) + 1) * 0.5;
    const fph = beatLocked(f) ? (f.beat.count + f.beat.phase) * K.rate : (w.fph = (w.fph || 0) + dt * bps(f) * K.rate); // (free-running: summed, so a change of tempo never jumps the wings)
    let flap = Math.cos(fph * TAU), jaw = w.fire ? 1 : 0.1;
    if (w.land) { // down onto the middle of the span, the planks let go under it, and up again
      const Ld = w.land, gx = 0.44 * N, gy = deck - sz * 0.22;
      Ld.t += dt;
      if (Ld.st === 'down') {
        w.dx = follow(w.dx || dxp, gx, dt, 0.35); w.dy = follow(w.dy || dyp, gy, dt, 0.35);
        if (Math.hypot(w.dx - gx, w.dy - gy) < 1.5 * u) { Ld.st = 'sit'; Ld.t = 0; s.shake = Math.max(s.shake, 0.8); for (const [i, p] of w.planks.entries()) if (p.st === 0) p.delay = Math.abs(i - 8) * 0.06 + 0.01; if (w.kn.st === 'run' && w.kn.x * N > bx0) { w.kn.st = 'fall'; w.kn.vy = 0; w.kn.y = deck; w.kn.ang = 0; } }
      } else if (Ld.st === 'sit') { flap = Ld.t < 0.12 ? -0.4 : Math.cos(fph * TAU * 2); jaw = 1; if (Ld.t > 0.9) { Ld.st = 'up'; Ld.t = 0; } } // the span goes from under it: it holds there on quick wingbeats
      else { w.dx = follow(w.dx, dxp, dt, 0.6); w.dy = follow(w.dy, dyp, dt, 0.6); if (Math.hypot(w.dx - dxp, w.dy - dyp) < 2 * u) w.land = null; }
      dxp = w.dx; dyp = w.dy; far = false; dsc = 1;
      if (Ld.st !== 'up') { vx = 1; vy = 0; }
    } else { w.dx = dxp; w.dy = dyp; }
    const ddir = vx >= 0 ? 1 : -1, bank = ddir > 0 ? Math.atan2(vy, vx) : Math.atan2(-vy, -vx);
    let mouth = null;
    // the breath: a cone from the mouth to a point swept along the bridge over half a second, the planks under it
    // alight; drawn with the dragon, so the tower hides it while the dragon is round the far side
    const breath = () => {
      if (!w.fire) return;
      const F = w.fire, q = (F.t += dt) / 0.5, lx = F.x0 + q * 0.3 * N;
      if (q >= 1) { w.fire = null; return; }
      r.poly([[mouth.mx, mouth.my], [lx - 0.05 * N, deck - 2 * u], [lx + 0.05 * N, deck - 2 * u]], HOT);
      r.poly([[mouth.mx, mouth.my], [lx - 0.02 * N, deck - 2 * u], [lx + 0.02 * N, deck - 2 * u]], BRIGHT);
      for (const [i, p] of w.planks.entries()) if (p.st === 0 && Math.abs(bx0 + (i + 0.5) * pw - lx) < 0.05 * N) p.burn = 1.2;
    };
    if (far) { mouth = dragonFly(r, dxp, dyp, sz * dsc, ddir, bank, flap, jaw, u, FIG, K.wing); breath(); }
    // the tower: stone, battlements, a cone roof, the door at the deck, the top window with the princess
    r.rect(tx - tw / 2, 0.14 * N, tw, lava - 0.14 * N, DARK);
    for (let y = 0.16 * N; y < lava; y += 4 * u) for (let x = tx - tw / 2 + 2 * u; x < tx + tw / 2 - 2 * u; x += 5 * u) if (hash(Math.round(x), Math.round(y)) < 0.35) r.rect(x, y, 2 * u, mx1(u), DARK + DIM);
    for (let x = tx - tw / 2; x < tx + tw / 2; x += 3 * u) r.rect(x, 0.14 * N - 2 * u, 1.5 * u, 2 * u, DARK);
    r.poly([[tx - tw * 0.6, 0.14 * N - 2 * u], [tx + tw * 0.6, 0.14 * N - 2 * u], [tx, 0.04 * N]], DARK + DIM);
    r.rect(tx - tw * 0.2, deck - 0.09 * N, tw * 0.4, 0.09 * N, BLACK);
    r.disc(tx, deck - 0.09 * N, tw * 0.2, BLACK);
    const wx = tx, wy = 0.22 * N;
    r.rect(wx - 0.03 * N, wy, 0.06 * N, 0.07 * N, BLACK);
    princess(r, wx, wy + 0.07 * N, 0.12 * N, -1, u, { wave: w.wave > 0 ? 2.5 + 0.4 * Math.sin(t * 25) : 0.4, gown: LMID });
    r.rect(wx - 0.03 * N, wy + 0.07 * N - 1.5 * u, 0.06 * N, 1.5 * u, DARK + DIM); // the sill
    // the bridge: the hand ropes sagging between the posts, the planks hanging from them; a fallen plank turns as it
    // drops to the lava and goes under in a splash
    const gone = w.planks.filter((p) => p.st === 2).length, ropeY = (q) => deck - 0.09 * N + 0.05 * N * 4 * q * (1 - q);
    r.rect(bx1, deck - 0.1 * N, 2 * u, 0.1 * N, DARK + DIM);
    if (gone < 14) { let px = bx0, py = ropeY(0); for (let k = 1; k <= 12; k++) { const q = k / 12, nx = lerp(bx0, bx1, q), ny = ropeY(q); r.line(px, py, nx, ny, LMID + DIM); px = nx; py = ny; } r.line(bx0, deck, bx1, deck, DARK + DIM); }
    else for (const [ax, dir] of [[bx0, 1], [bx1, -1]]) { let px = ax, py = deck - 0.09 * N; for (let k = 1; k <= 6; k++) { const q = k / 6, nx = ax + dir * 0.06 * N * Math.sin(q * 1.5 + t * 0.5) * q, ny = py + 0.04 * N; r.line(px, py, nx, ny, LMID + DIM); px = nx; py = ny; } }
    for (const [i, p] of w.planks.entries()) {
      const cx = bx0 + (i + 0.5) * pw;
      if (p.st === 0) {
        if (p.delay > 0 && (p.delay -= dt) <= 0) { p.st = 1; p.y = deck; p.vy = 0; p.ang = 0; p.va = (rnd() - 0.5) * 6; p.x = cx; }
        if (p.burn > 0) { p.burn -= dt; p.char = 1; flame(r, cx, deck, pw * 0.8, 0.05 * N * Math.min(1, p.burn * 2), tt, i * 3); }
        r.rect(cx - pw * 0.45, deck - 1.5 * u, pw * 0.9, 1.5 * u, p.char ? DARK + DIM : LMID);
        if (i % 4 === 2) r.line(cx, ropeY((i + 0.5) / 16), cx, deck - 1.5 * u, LMID + DIM);
      } else if (p.st === 1) {
        p.vy += GR * N * dt; p.y += p.vy * dt; p.ang += p.va * dt;
        const c = Math.cos(p.ang) * pw * 0.45, sn = Math.sin(p.ang) * pw * 0.45;
        r.stroke(p.x - c, p.y - sn, p.x + c, p.y + sn, mx1(1.5 * u), p.char ? DARK + DIM : LMID);
        if (p.y >= lava) { p.st = 2; for (let k = 0; k < 8; k++) w.splash.push({ x: p.x, y: lava, vx: (rnd() - 0.5) * 0.3 * N, vy: -(0.2 + 0.4 * rnd()) * N, life: 2, s: u, c: k % 2 ? HOT : BRIGHT }); }
      }
    }
    w.splash = drops(W, w.splash, lava, HOT).slice(-80);
    // the knight: two steps a beat across, the plank behind him let go a moment after he leaves it; in the door,
    // the bridge re-laid a plank a beat from the cliff, then out from the left again
    const Kn = w.kn, kh = 0.1 * N;
    if (Kn.st === 'run') {
      Kn.x += (pace(kh, f, 2) * dt) / N;
      const kx = Kn.x * N;
      for (const [i, p] of w.planks.entries()) if (p.st === 0 && p.delay < 0 && kx > bx0 + (i + 1) * pw + 0.02 * N) p.delay = 0.2;
      const J = walker(r, kx, deck, kh, FIG, ph, 1, {});
      r.poly([[J.sx - kh * 0.1, J.top + kh * 0.05], [J.sx - kh * 0.3, J.top - kh * 0.15], [J.sx - kh * 0.05, J.top - kh * 0.02]], HOT); // the plume
      r.stroke(J.sx, J.sy + kh * 0.1, J.sx + kh * 0.25, J.sy - kh * 0.05, mx1(u), BRIGHT); // the sword, held forward
      targets.push({ x: kx - kh * 0.3, y: deck - kh, w: kh * 0.6, h: kh });
      if (kx > bx1 - 0.02 * N) { Kn.st = 'in'; Kn.t = 0; }
    } else if (Kn.st === 'fall') {
      Kn.vy += GR * N * dt; Kn.y += Kn.vy * dt; Kn.ang += 3 * dt;
      const P = turn(Kn.x * N, Kn.y - kh * 0.5, Kn.ang);
      const a = P(0, -kh * 0.5), b = P(0, kh * 0.5);
      r.stroke(a[0], a[1], b[0], b[1], mx1(3 * u), FIG);
      if (Kn.y > lava) { Kn.st = 'in'; Kn.t = -2; for (let k = 0; k < 14; k++) w.splash.push({ x: Kn.x * N, y: lava, vx: (rnd() - 0.5) * 0.4 * N, vy: -(0.3 + 0.4 * rnd()) * N, life: 2, s: u, c: k % 2 ? HOT : BRIGHT }); }
    } else {
      Kn.t += dt;
      if (Kn.t > 0.5 && tick(w, f, dt)) { const p = w.planks.find((q) => q.st !== 0); if (p) { p.st = 0; p.delay = -1; p.char = 0; p.burn = 0; } }
      if (Kn.t > 1 && w.planks.every((p) => p.st === 0)) { Kn.st = 'run'; Kn.x = -0.08; }
    }
    // the near dragon drawn now, over everything, its breath with it
    if (!far) { mouth = dragonFly(r, dxp, dyp, sz * dsc, ddir, bank, flap, jaw, u, FIG, K.wing); breath(); }
    targets.push({ x: dxp - sz * 0.5, y: dyp - sz * 0.4, w: sz, h: sz * 0.7 });
  },
};

// ---------------------------------------------------------------------------------------------- onion
// A giant onion on the board, peeled a ring a beat from the outside in: every layer has its own pattern, and the
// ring that comes off goes in three pieces that fall under gravity, turning, and lie on the board. The one who
// watches (a profile at the right) weeps a tear on every snare: a drop with gravity to the board. A kick squashes
// the onion, a note recolours the layers. The kind is the vegetable: an onion, a cabbage with scalloped layers, or
// a parfait in a glass eaten a layer a beat by the spoon (the spoonful lobbed to the mouth on a parabola). The
// core reached (or a drop) is a flash and rings, and a new one rolls in from the left, turning at the speed it rolls.
const VEG_W = { onion: [3, 2, 2], cabbage: [2, 2, 1], parfait: [1, 2, 3] };
const onion = {
  init(W) { const { w, rnd } = W; Object.assign(w, { kind: rollW(rnd, VEG_W, bandOf(W.a)), peel: 0, gen: 1, pieces: [], tears: [], splash: [], sq: { x: 0, v: 0 }, flash: 0, roll: null, hue: 0, spoon: 0, lobs: [], cy: null, cvy: 0 }); },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), LAY = 8, board = 0.8 * N, bt = board - 2 * u, cx = 0.44 * N, R0 = 0.27 * N, g = GR * N;
    if (f.section === 'change') { w.kind = rollW(rnd, VEG_W, band); w.gen++; w.peel = 0; w.pieces.length = 0; w.roll = null; }
    const kind = w.kind, par = kind === 'parfait', PAL = [LMID, BRIGHT, MID, COOL, HOT];
    for (const hh of hits) {
      if (hh.kind === 'snare') w.tears.push({ x: 0.805 * N, y: 0.41 * N, vx: -0.05 * N, vy: 0, life: 3, s: 1.5 * u, c: COOL }); // off the cheek, forward and down
      else if (isLow(hh)) w.sq.v += 2.5 * hh.strength;
      else if (isTonal(hh)) w.hue = (w.hue + 1) % 5;
    }
    spring(w.sq, dt, 180, 10);
    const sq = clamp(w.sq.x, -0.3, 0.3), sx = 1 + sq, sy = 1 - sq;
    // the board, the watcher: a profile looking left, the eye that weeps, sadder the deeper the peel goes
    r.rect(0, board, N, N - board, DARK);
    r.rect(0.04 * N, bt, 0.74 * N, 2 * u, MID + DIM);
    r.rect(0.78 * N, 0.5 * N, 0.22 * N, board - 0.5 * N, FIG);
    r.disc(0.87 * N, 0.4 * N, 0.095 * N, FIG);
    r.poly([[0.785 * N, 0.4 * N], [0.74 * N, 0.44 * N], [0.785 * N, 0.46 * N]], FIG);
    r.rect(0.8 * N, 0.44 * N, 0.07 * N, 0.07 * N, FIG);
    const sad = w.peel / LAY;
    r.rect(0.795 * N, 0.395 * N, 2.5 * u, mx1(1.5 * u), WHITE);
    r.set(0.8 * N, 0.4 * N, BLACK);
    r.line(0.79 * N, 0.37 * N - sad * 1.5 * u, 0.83 * N, 0.37 * N + sad * 2 * u, FIG + DIM);
    r.line(0.785 * N, 0.47 * N + sad * 2 * u, 0.81 * N, 0.47 * N - sad * 1.5 * u, FIG + DIM);
    targets.push({ x: 0.775 * N, y: 0.3 * N, w: 0.2 * N, h: 0.2 * N });
    // a beat peels a ring (or spoons a layer); the core reached is the flash, then the roll-in
    const can = !w.roll && w.flash <= 0, cy0 = w.cy ?? bt - R0;
    if (tick(w, f, dt) && can && w.peel < LAY) {
      const k = w.peel++, Rm = R0 * (1 - (k + 0.5) / LAY), th = R0 / LAY, col = PAL[(k + w.hue) % 5];
      if (par) { // the spoonful to the mouth: a lob from the spoon that lands there in four tenths of a second
        w.spoon = 0.3;
        const x0 = cx + 0.01 * N, y0 = 0.3 * N + k * (0.42 * N) / LAY, mxp = 0.76 * N, myp = 0.44 * N, T = 0.4;
        w.lobs.push({ x0, y0, vx: (mxp - x0) / T, vy: (myp - y0 - 0.5 * g * T * T) / T, t: 0, T, c: col });
      } else for (let j = 0; j < 3; j++) {
        const am = (j / 3) * TAU + rnd() * 0.5, pts = [];
        for (let q = 0; q <= 6; q++) { const a = am + (q / 6 - 0.5) * 1.7; pts.push([(Math.cos(a) - Math.cos(am)) * Rm, (Math.sin(a) - Math.sin(am)) * Rm]); }
        w.pieces.push({ x: cx + Math.cos(am) * Rm, y: cy0 + Math.sin(am) * Rm, vx: Math.cos(am) * 0.18 * N, vy: Math.sin(am) * 0.18 * N - 0.12 * N, ang: 0, va: (rnd() - 0.5) * 5, pts, th, c: col, life: 4, rest: false });
      }
    }
    if (can && w.peel >= LAY) { w.flash = 0.6; s.shake = Math.max(s.shake, 0.3); }
    if (f.section === 'drop' && can) { w.peel = LAY; w.flash = 0.7; s.shake = Math.max(s.shake, 0.5); }
    if (w.flash > 0 && (w.flash -= dt) <= 0) { w.roll = { x: -R0, ang: 0 }; w.peel = 0; w.gen++; w.pieces.length = 0; }
    let ox = cx, ang = 0;
    if (w.roll) { // in from the left, slower as it nears its place, turning at the speed it rolls (the glass slides)
      const Rl = w.roll, v = 0.15 * N + (cx - Rl.x) * 1.4;
      Rl.x += v * dt;
      if (!par) Rl.ang += (v * dt) / R0;
      if (Rl.x >= cx - u) w.roll = null;
      else { ox = Rl.x; ang = Rl.ang; }
    }
    // it sits on the board: the bottom of what is left touches it (squashed about that point); a ring peeled off
    // leaves it a ring's thickness up, and it drops onto the board under gravity and squats as it lands
    const ca = Math.cos(ang), sa = Math.sin(ang), cab = kind === 'cabbage', Rv = R0 * (1 - Math.min(LAY, w.peel) / LAY);
    const Rb = cab ? Rv / (1 + 0.06 * Math.sin(Math.atan2(ca, sa) * 9 + w.gen)) : Rv, rest = bt - Rb * sy;
    if (!((w.cy ?? -1) >= 0) || w.cy >= rest - 0.01 || w.roll) { w.cy = rest; w.cvy = 0; }
    else {
      w.cy += w.cvy * dt + 0.5 * g * dt * dt; w.cvy += g * dt;
      if (w.cy >= rest) { w.sq.v += Math.min(1.5, (1.2 * w.cvy) / N); w.cy = rest; w.cvy = 0; }
    }
    const oy = w.cy;
    // the vegetable, per pixel: the layer at each cell's distance from the centre, its pattern (turning with it as
    // it rolls), the ring borders; the cabbage's layers scalloped round, the parfait's flat in the glass, spooned from the top
    const buf = r.buf, peel = w.peel, hue = w.hue, gen = w.gen;
    const patt = (k, x, y, base) => { const pid = Math.floor(hash(k, gen) * 4); return pid === 0 ? base : pid === 1 ? ((y >> 1) % 2 ? base : DARK) : pid === 2 ? (((x >> 1) + (y >> 1)) & 1 ? base : dim(base)) : (x % 4 === 0 && y % 4 === 0 ? DARK : base); };
    if (par) {
      const gx0 = 0.36 * N, gx1 = 0.64 * N, gy0 = 0.3 * N, gy1 = 0.72 * N, bandH = (gy1 - gy0) / LAY;
      r.rect(ox - 1.5 * u, gy1, 3 * u, 0.06 * N, LMID + DIM);
      r.rect(ox - 0.06 * N, bt - u, 0.12 * N, mx1(u), LMID + DIM);
      for (let y = Math.round(gy0); y < gy1; y++) {
        const q = (y - gy0) / (gy1 - gy0), half = lerp(gx1 - gx0, (gx1 - gx0) * 0.6, q) / 2, k = Math.min(LAY - 1, Math.floor(q * LAY));
        if (k < peel) continue;
        const base = PAL[(k + hue) % 5], edge = (y - gy0) % bandH < 1;
        for (let x = Math.max(0, Math.round(ox - half)); x < Math.min(N, Math.round(ox + half)); x++) buf[y * N + x] = edge ? dim(base) : patt(k, x, y, base);
      }
      for (let y = Math.round(gy0 - 2 * u); y < gy1; y++) { const q = clamp((y - gy0) / (gy1 - gy0)), half = lerp(gx1 - gx0, (gx1 - gx0) * 0.6, q) / 2; r.set(ox - half, y, COOL); r.set(ox + half, y, COOL); if (y % 3 === 0) r.set(ox - half + 2 * u, y, WHITE); }
      r.rect(ox - (gx1 - gx0) / 2, gy0 - 2 * u, gx1 - gx0, mx1(u), COOL);
      // the spoon from the watcher's hand to the top of what is left, dipping on the beat
      const topY = gy0 + Math.min(LAY, peel) * bandH, dip = w.spoon > 0 ? Math.sin(Math.PI * (1 - (w.spoon -= dt) / 0.3)) * bandH : 0;
      r.stroke(0.78 * N, 0.52 * N, ox + 0.02 * N, topY - 2 * u + dip, mx1(1.5 * u), LMID);
      oval(r, ox + 0.01 * N, topY - u + dip, 0.035 * N, 0.015 * N, LMID);
      targets.push({ x: gx0, y: gy0, w: gx1 - gx0, h: gy1 - gy0 });
    } else {
      const Rout = Rv * 1.07 + 2 * u, x0 = Math.max(0, Math.floor(ox - Rout * sx)), x1 = Math.min(N - 1, Math.ceil(ox + Rout * sx)), y0 = Math.max(0, Math.floor(oy - Rout * sy)), y1 = Math.min(N - 1, Math.ceil(oy + Rout * sy));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const dx = (x + 0.5 - ox) / sx, dy = (y + 0.5 - oy) / sy, lx = dx * ca + dy * sa, ly = dy * ca - dx * sa; // (lx, ly): in the vegetable's own turned frame
          let d = Math.sqrt(dx * dx + dy * dy);
          if (cab) d *= 1 + 0.06 * Math.sin(Math.atan2(ly, lx) * 9 + gen);
          const q = 1 - d / R0;
          if (q <= 0) continue;
          const k = Math.min(LAY - 1, Math.floor(q * LAY));
          if (k < peel) continue;
          const base = PAL[(k + hue) % 5];
          buf[y * N + x] = q * LAY - k < 0.14 ? dim(base) : k === LAY - 1 ? BRIGHT : patt(k, Math.floor(lx + 4096), Math.floor(ly + 4096), base);
        }
      // the sprout and the roots turn with the roll
      const Rn = Rv * 0.9;
      if (peel < LAY) {
        const P = turn(ox, oy, ang);
        const sp0 = P(0, -Rn * sy), sp1 = P(-0.02 * N, -Rn * sy - 0.06 * N), sp2 = P(0.025 * N, -Rn * sy - 0.07 * N);
        r.stroke(sp0[0], sp0[1], sp1[0], sp1[1], mx1(1.5 * u), COOL); r.stroke(sp0[0], sp0[1], sp2[0], sp2[1], mx1(1.5 * u), COOL);
        for (const k of [-0.02, 0, 0.02]) { const a = P(k * N, Rn * sy), b = P(k * N * 2, Rn * sy + 0.03 * N); r.line(a[0], a[1], b[0], b[1], DARK); }
      }
      targets.push({ x: ox - Rout, y: oy - Rout, w: 2 * Rout, h: 2 * Rout });
    }
    if (w.flash > 0) { // the core: a white flash and rings running out at one speed
      const q = par ? 0.7 - w.flash : 0.6 - w.flash, fy = par ? 0.5 * N : oy;
      r.disc(ox, fy, R0 * 0.3 * Math.max(0, 1 - q * 3), WHITE);
      for (let k = 0; k < 3; k++) circ(r, ox, fy, (q - k * 0.12) * 0.9 * N, k ? LMID : BRIGHT);
    }
    // the pieces fall and turn, and lie on the board; the spoonfuls fly to the mouth on their parabola
    w.pieces = w.pieces.filter((p) => {
      if (!p.rest) { p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.ang += p.va * dt; }
      else p.life -= dt;
      const c = Math.cos(p.ang), sn = Math.sin(p.ang), fl = bt - p.th * 0.4; // a stroke this thick lies on the board when its line is this high
      let low = -1e9, px = 0, py = 0;
      for (const [i, [lx, ly]] of p.pts.entries()) { const X = p.x + lx * c - ly * sn, Y = p.y + lx * sn + ly * c; if (Y > low) low = Y; if (i) r.stroke(px, py, X, Y, p.th * 0.8, p.c); px = X; py = Y; }
      if (!p.rest && low >= fl) { p.rest = true; p.y -= low - fl; }
      return p.life > 0;
    });
    w.lobs = w.lobs.filter((p) => { const tt = Math.min((p.t += dt), p.T); r.disc(p.x0 + p.vx * tt, p.y0 + p.vy * tt + 0.5 * g * tt * tt, 2 * u, p.c); return p.t < p.T; });
    w.tears = drops(W, w.tears, bt, COOL, w.splash);
    w.splash = plopRings(W, w.splash, COOL, 0.3, 0.06);
  },
};

// ---------------------------------------------------------------------------------------------- lordscastle
// An absurdly tall, thin castle for a very short lord. Needle towers over a curtain wall fly banners that ripple
// with the treble (the wave runs out from the pole and swings wider toward the free end); a queue of peasants
// shuffles a step a beat to a turnstile at the gate (every third beat one pushes through, the arm turning under his
// hand, and walks on into the gate, smaller as he goes in); a puppet booth's marionettes hop on the beat and bump on
// the snares; heralds on the wall raise their trumpets on the kicks and blow confetti. The kind is the skyline: one
// needle, twin towers, a stack. A drop sets the tallest tower swaying (it bends from its foot, the top the most) and
// flicks the tiny crown off its tip: it falls, bounces and lies where it stops until the skyline changes.
const SKY_W = { needle: [2, 2, 1], twin: [2, 1, 2], stack: [1, 2, 3] };
const SKYLINES = { needle: [[0.24, 0.46], [0.5, 0.15], [0.76, 0.46]], twin: [[0.2, 0.48], [0.38, 0.16], [0.62, 0.24], [0.8, 0.48]], stack: [[0.22, 0.45], [0.36, 0.3], [0.5, 0.14], [0.64, 0.26], [0.78, 0.38]] };
// a hop a beat under the common gravity: up to `hmax` cells, in the air as long as that takes, then standing
const hopY = (f, N, hmax) => { const T = 1 / bps(f), ta = Math.min(T, Math.sqrt((8 * hmax) / (GR * N))), q = (f.beat.phase * T) / ta; return q < 1 ? GR * N * ta * ta * 0.5 * q * (1 - q) : 0; };
// a banner from a pole at (x, y) flying downwind (+x), `len` long and `h` tall: the wave runs out from the pole,
// its swing growing toward the free end, which is cut in a swallowtail
function banner(r, x, y, len, h, ph, amp, col) {
  const n = Math.max(2, Math.round(len)), k = TAU / Math.max(4, len * 0.8);
  for (let i = 0; i < n; i++) {
    const q = i / n, y0 = y + Math.sin(i * k - ph) * amp * q;
    if (q < 0.75) vline(r, x + i, y0, y0 + h, col);
    else { const cut = h * 0.6 * ((q - 0.75) / 0.25); vline(r, x + i, y0, y0 + (h - cut) / 2, col); vline(r, x + i, y0 + (h + cut) / 2, y0 + h, col); }
  }
}
// a tiny crown `wd` wide standing on (x, y), turned by `ang` about that point
function crownAt(r, x, y, wd, ang) {
  const P = turn(x, y, ang);
  r.poly([P(-wd / 2, 0), P(wd / 2, 0), P(wd / 2, -wd * 0.32), P(-wd / 2, -wd * 0.32)], BRIGHT);
  for (const k of [-0.5, 0, 0.5]) r.poly([P((k - 0.22) * wd, -wd * 0.3), P((k + 0.22) * wd, -wd * 0.3), P(k * wd, -wd * 0.75)], BRIGHT);
  const j = P(0, -wd * 0.16);
  r.set(j[0], j[1], HOT);
}
const lordscastle = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, SKY_W, bandOf(W.a)), q0: 0, qT: 1, sway: { x: 0, v: 0 }, crown: { st: 'on', x: 0, y: 0, vx: 0, vy: 0, ang: 0, va: 0 }, fan: { x: 0, v: 0 },
      pup: [{ x: 0, v: 0 }, { x: 0, v: 0 }], confetti: [], sparks: [], clouds: [0, 1, 2].map((k) => ({ x: k * 0.45 + rnd() * 0.2, y: 0.08 + rnd() * 0.22, s: 0.6 + rnd() * 0.5 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a);
    if (f.section === 'change') { w.kind = rollW(rnd, SKY_W, band); w.sway.x = w.sway.v = 0; w.crown.st = 'on'; }
    const TW = SKYLINES[w.kind], tall = TW.reduce((m, q, i) => (q[1] < TW[m][1] ? i : m), 0), C = w.crown;
    const g = 0.9 * N, wb = 0.84 * N, wt = 0.62 * N, wx0 = 0.16 * N, wx1 = 0.84 * N, gateX = 0.5 * N, turnX = 0.4 * N, tw = 0.05 * N;
    if (f.section === 'drop' && Math.abs(w.sway.v) < 0.05 * N) { // the jolt: the top set swaying, the crown flicked off it
      const dir = rnd() < 0.5 ? -1 : 1;
      w.sway.v = dir * 0.25 * N;
      s.shake = Math.max(s.shake, 0.5);
      if (C.st === 'on') Object.assign(C, { st: 'fly', vx: dir * 0.22 * N, vy: -0.14 * N, va: dir * 7 });
    }
    spring(w.sway, dt, 20, 0.6); // a cantilever: about a second and a half a swing, dying away over several
    let snare = 0;
    for (const hh of hits) {
      if (isLow(hh)) { w.fan.v += 9 * hh.strength; w.blow = 1; }
      else if (hh.kind === 'snare') snare = Math.max(snare, hh.strength);
    }
    // the sky: the sun up on the left (the light comes from there), the clouds going downwind with the mids
    r.disc(0.1 * N, 0.11 * N, 0.05 * N, BRIGHT);
    for (const [k, c] of w.clouds.entries()) {
      const x = ((((c.x + f.rel.midClock * 0.012 * (1 + 0.3 * k)) % 1.4) + 1.4) % 1.4 - 0.2) * N, y = c.y * N, cs = 0.03 * N * c.s;
      r.disc(x, y, cs, LMID); r.disc(x + cs, y + cs * 0.3, cs * 0.8, LMID); r.disc(x - cs, y + cs * 0.35, cs * 0.7, LMID);
    }
    // the towers rise from behind the wall: courses of stone, the shade on the right, slits lit as it gets louder, a
    // cone roof, a pole with its banner; the tallest one bends from its foot as it sways (the top the most)
    let tip = null, tipA = 0;
    for (const [i, [fx, ft]] of TW.entries()) {
      const x = fx * N, top = ft * N, H = wt - top, b = i === tall ? w.sway.x : 0, wd = i === tall ? tw * 0.8 : tw;
      for (let y = Math.max(0, Math.round(top)); y < wt; y++) {
        const qq = (wt - y) / H, x0 = x - wd / 2 + b * qq * qq;
        r.rect(x0, y, wd, 1, (y - top) % (4 * u) < 1 ? DARK + DIM : MID);
        r.rect(x0 + wd * 0.7, y, wd * 0.3, 1, MID + DIM);
      }
      for (let k = 0, y = top + 0.05 * N; y < wt - 0.04 * N; k++, y += 0.07 * N) { const qq = (wt - y) / H; r.rect(x - 0.75 * u + b * qq * qq, y, mx1(1.5 * u), 3.5 * u, hash(i * 7 + k, 3) < f.level ? BRIGHT : BLACK); }
      const al = Math.atan((2 * b) / H), P = turn(x + b, top, al), rh = wd * 1.6;
      r.poly([P(-wd * 0.7, 0), P(wd * 0.7, 0), P(0, -rh)], i === tall ? HOT : DARK);
      const p0 = P(0, -rh), p1 = P(0, -rh - 0.05 * N), pb = P(0, -rh - 0.045 * N);
      r.line(p0[0], p0[1], p1[0], p1[1], DARK);
      banner(r, pb[0], pb[1], (i === tall ? 0.08 : 0.055) * N, 0.018 * N, f.rel.trebClock * 4 + i, (0.3 + 0.7 * Math.min(1, f.rel.trebDrive)) * 0.012 * N, i === tall ? HOT : i % 2 ? COOL : LMID);
      if (i === tall) { tip = p1; tipA = al; }
    }
    // the heralds on the wall walk, behind the parapet: a kick raises the trumpets, the pennants hang from them
    spring(w.fan, dt, 40, 7);
    const ang = lerp(-0.6, 0.7, clamp(w.fan.x)), hh2 = 0.065 * N, tl = 0.055 * N;
    for (const [hx, dir] of [[0.28 * N, -1], [0.72 * N, 1]]) {
      const J = walker(r, hx, wt, hh2, FIG, 0, dir, { hat: true, hatCol: HOT }), mx0 = hx + dir * hh2 * 0.1, my0 = J.head + hh2 * 0.04, cx = dir * Math.cos(ang), cy = -Math.sin(ang);
      const ex = mx0 + cx * tl, ey = my0 + cy * tl, a1 = [mx0 + cx * tl * 0.25, my0 + cy * tl * 0.25], a2 = [mx0 + cx * tl * 0.7, my0 + cy * tl * 0.7], pd = 0.03 * N;
      r.poly([a1, a2, [a2[0], a2[1] + pd], [(a1[0] + a2[0]) / 2, Math.max(a1[1], a2[1]) + pd * 0.6], [a1[0], a1[1] + pd]], HOT);
      r.stroke(mx0, my0, ex, ey, mx1(u), BRIGHT);
      r.poly([[ex - cx * u, ey - cy * u], [ex + cx * 2 * u - cy * 2 * u, ey + cy * 2 * u + cx * 2 * u], [ex + cx * 2 * u + cy * 2 * u, ey + cy * 2 * u - cx * 2 * u]], BRIGHT);
      r.line(J.sx, J.sy, a1[0], a1[1], FIG);
      if (w.blow) for (let k = 0; k < 5; k++) w.confetti.push({ x: ex, y: ey, vx: cx * (0.1 + 0.15 * rnd()) * N, vy: (cy * 0.15 - 0.08 * rnd()) * N, ph: rnd() * TAU, life: 2.5, c: pick(rnd, [HOT, COOL, BRIGHT]) });
    }
    w.blow = 0;
    // the curtain wall: courses, the merlons, the dark arch of the gate
    r.rect(wx0, wt, wx1 - wx0, wb - wt, MID);
    for (let y = wt + 3 * u; y < wb; y += 3 * u) r.rect(wx0, y, wx1 - wx0, mx1(u * 0.5), DARK + DIM);
    for (let x = wx0; x < wx1 - u; x += 4 * u) r.rect(x, wt - 2.5 * u, 2.5 * u, 2.5 * u, MID);
    r.rect(gateX - 0.045 * N, wb - 0.1 * N, 0.09 * N, 0.1 * N, BLACK);
    r.disc(gateX, wb - 0.1 * N, 0.045 * N, BLACK);
    // the crown: on the tip, or flying off it under gravity to bounce on the parapet or the ground and come to rest
    // upright (off the end of the wall it bounces back)
    if (C.st === 'on' && tip) { C.x = tip[0]; C.y = tip[1]; C.ang = tipA; }
    else if (C.st === 'fly') {
      const px = C.x, inW = (x) => x > wx0 && x < wx1;
      C.vy += GR * N * dt; C.x += C.vx * dt; C.y += C.vy * dt; C.ang += C.va * dt;
      const floor = inW(C.x) ? wt - 2.5 * u : wb;
      if (inW(C.x) && !inW(px) && C.y > floor) { C.x = px; C.vx *= -0.5; }
      else if (C.y >= floor) { C.y = floor; if (C.vy > 0.06 * N) { C.vy *= -0.45; C.vx *= 0.7; C.va *= 0.5; } else { C.st = 'rest'; C.vy = 0; } }
      if (C.x < -0.1 * N || C.x > 1.1 * N) C.st = 'gone';
    } else if (C.st === 'rest') C.ang = follow(C.ang, Math.round(C.ang / TAU) * TAU, dt, 0.12);
    if (C.st !== 'gone') { crownAt(r, C.x, C.y, Math.max(2.5, 3 * u), C.ang); targets.push({ x: C.x - 3 * u, y: C.y - 4 * u, w: 6 * u, h: 5 * u }); }
    // the puppet booth by the gate: two marionettes on strings hop on the beat and bump on a snare (equal masses, so
    // they trade their speeds, less what the bump takes), sprung back to their marks
    const bx = 0.7 * N, bw = 0.15 * N, btop = 0.68 * N, wy0 = 0.715 * N, wy1 = 0.8 * N, P0 = w.pup[0], P1 = w.pup[1];
    if (snare) { P0.v += 0.5 * N * snare; P1.v -= 0.5 * N * snare; }
    for (const p of w.pup) { spring(p, dt, 60, 5); if (Math.abs(p.x) > 0.035 * N) { p.x = Math.sign(p.x) * 0.035 * N; p.v *= -0.3; } } // the sides of the booth: a knock back off them
    const gap = 0.06 * N + P1.x - P0.x;
    if (gap < 0.03 * N && P0.v > P1.v) { const v0 = P0.v, v1 = P1.v; P0.v = 0.2 * v0 + 0.8 * v1; P1.v = 0.8 * v0 + 0.2 * v1; const c = (0.03 * N - gap) / 2; P0.x -= c; P1.x += c; burst(w.sparks, rnd, bx + (P0.x + P1.x) / 2, wy1 - 0.035 * N, 6, 0.25 * N, BRIGHT, 0.4); }
    r.rect(bx - bw / 2, btop, bw, g - btop, MID + DIM);
    for (let k = 0; k < 6; k++) r.poly([[bx - bw * 0.55 + k * bw * 0.183, btop], [bx - bw * 0.55 + (k + 1) * bw * 0.183, btop], [bx - bw * 0.55 + (k + 0.5) * bw * 0.183, btop + 0.025 * N]], k % 2 ? BRIGHT : HOT);
    r.rect(bx - bw * 0.55, btop - 0.012 * N, bw * 1.1, 0.012 * N, HOT);
    r.rect(bx - bw * 0.42, wy0, bw * 0.84, wy1 - wy0, BLACK);
    const hop = hopY(f, N, 0.02 * N), ph = 0.05 * N;
    for (const [i, p] of w.pup.entries()) {
      const px = bx + (i ? 0.03 : -0.03) * N + p.x, feet = wy1 - hop, hy = feet - ph * 0.8, sw = clamp(-p.v / (0.6 * N), -0.5, 0.5) * ph * 0.3;
      for (const k of [-1, 0, 1]) r.line(px + k * ph * 0.3, wy0, px + k * ph * 0.3, k ? feet - ph * 0.5 : hy - ph * 0.12, LMID + DIM);
      for (const k of [-1, 1]) r.line(px + k * ph * 0.06, feet - ph * 0.26, px + k * ph * 0.08 + sw, feet, FIG); // the legs trail the swing
      r.rect(px - ph * 0.13, feet - ph * 0.64, ph * 0.26, ph * 0.4, i ? HOT : COOL);
      for (const k of [-1, 1]) r.line(px + k * ph * 0.12, feet - ph * 0.6, px + k * ph * 0.3, feet - ph * 0.5, FIG);
      r.disc(px, hy, ph * 0.14, FIG);
      if (i) crown(r, px, hy - ph * 0.1, ph * 0.24, u);
      else r.poly([[px - ph * 0.15, hy - ph * 0.08], [px + ph * 0.15, hy - ph * 0.08], [px + ph * 0.3, hy - ph * 0.3], [px, hy - ph * 0.22], [px - ph * 0.3, hy - ph * 0.3]], LMID);
    }
    for (const k of [-1, 1]) r.rect(bx + k * bw * 0.42 - (k > 0 ? bw * 0.1 : 0), wy0, bw * 0.1, wy1 - wy0, HOT);
    r.rect(bx - bw * 0.45, wy1, bw * 0.9, mx1(1.5 * u), LMID);
    w.sparks = particles(W, w.sparks, BRIGHT).filter((p) => p.y < wy1).slice(-40); // out on the stage floor
    targets.push({ x: bx - bw * 0.42, y: wy0, w: bw * 0.84, h: wy1 - wy0 });
    // the queue: a step a beat (each a fifth of a body, the legs together again at its end), three steps apart; past
    // the turnstile a peasant walks on into the gate, up and smaller as he goes in, darker in its shadow
    if (tick(w, f, dt)) { if (w.qT < 1) w.q0++; w.qT = 0; }
    if (w.qT < 1 && (w.qT += dt * 2 * bps(f)) >= 1) { w.qT = 1; w.q0++; }
    const st = w.qT < 1 ? w.qT : 0, Q = w.q0 + st * st * (3 - 2 * st), lph = Math.PI * (w.q0 + st), h = 0.08 * N, sl = 0.2 * h, armL = 0.022 * N, aS = armL / sl, run = gateX - turnX - armL;
    const nLo = Math.ceil((Q - (run + armL) / sl) / 3) - 1, nHi = Math.floor((Q + (turnX + 0.06 * N) / sl) / 3);
    const who = (n, x, base, sc, inGate) => { const hs = h * (0.9 + 0.15 * hash(n, 2)) * sc, kk = hash(n, 3); walker(r, x, base, hs, inGate ? DARK : [FIG, MID, FIG + DIM][Math.floor(hash(n, 1) * 3)], lph + (n & 1) * Math.PI, 1, { coat: hash(n, 4) < 0.5, hat: kk < 0.3, cap: kk > 0.3 && kk < 0.6, hatCol: [HOT, COOL, LMID, DARK][Math.floor(hash(n, 5) * 4)] }); };
    for (let n = nLo; n <= nHi; n++) { const xn = turnX + (Q - 3 * n) * sl, e = (xn - turnX - armL) / run; if (e > 0 && e < 1) who(n, lerp(turnX + armL, gateX, e), lerp(g, wb, e), lerp(1, 0.8, e), e > 0.5); }
    // the turnstile: three arms a third of a turn apart, turned by whoever is passing; the far arms behind him
    const m = Math.floor((Q + aS) / 3), th = (TAU / 3) * (m + clamp((Q + aS - 3 * m) / (2 * aS))) + Math.PI, armY = g - 0.035 * N;
    const arms = (front) => { for (let k = 0; k < 3; k++) { const a = th + (k * TAU) / 3, sn = Math.sin(a); if (sn > 0 === front) r.stroke(turnX, armY, turnX + Math.cos(a) * armL, armY + sn * armL * 0.3, mx1(u), front ? FIG : FIG + DIM); } };
    arms(false);
    r.rect(turnX - u, g - 0.045 * N, 2 * u, 0.045 * N, FIG + DIM);
    for (let n = nLo; n <= nHi; n++) {
      const xn = turnX + (Q - 3 * n) * sl;
      if (xn < -0.05 * N || xn > turnX + armL) continue;
      r.rect(xn, g - mx1(u) * 0.5, h * 0.3, mx1(u), DARK + DIM);
      who(n, xn, g, 1, false);
      if (xn > turnX - armL) targets.push({ x: xn - h * 0.3, y: g - h, w: h * 0.6, h });
    }
    arms(true);
    r.disc(turnX, g - 0.045 * N, 1.5 * u, LMID);
    w.confetti = flutter(W, w.confetti, g, 0.01 * N, HOT).slice(-90);
  },
};

// ---------------------------------------------------------------------------------------------- gingerbread
// A kitchen table: the gingerbread man runs two quick steps a beat on his short legs, a rolling pin rolling after
// him (turning by the distance it rolls, never quite as quick as he is); at each end of the table he turns and hops
// over it (a parabola that clears it, started by how fast they close), the pin slowing and rolling back after him.
// A snare pops a candy button off his chest on a parabola (it bounces on the table, and the pin flattens it into
// crumbs); a kick sloshes the milk in the glass (the surface tilts, a hard one spills over the rim); the hats glint
// on the sugar. The kind is the kitchen: day, night (a candle that gutters on the hats) or the bakery (the oven
// glowing with the level). A drop sends him off the end of the table in a leap onto a fox's shadow crossing below,
// timed to be under him as he lands; it carries him off, and a fresh one pops up from the baking tray at the start.
const KITCHEN_W = { day: [2, 2, 1], night: [3, 1, 1], bakery: [1, 2, 3] };
const gingerbread = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, KITCHEN_W, bandOf(W.a)), gait: 0, man: { x: 0.3, dir: 1, y: 0, vy: 0, vx: 0, st: 'run', t: 0 }, pin: { x: 0.12, v: 0, ang: 0 }, buttons: 7,
      candy: [], crumbs: [], drips: [], plops: [], slosh: { x: 0, v: 0 }, fox: null, dropping: false, glint: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), B = bps(f), tt = Math.floor(t * 30); // tt: the flicker clock, by time
    if (f.section === 'change') w.kind = rollW(rnd, KITCHEN_W, band);
    // positions in screens: the table top, its ends, the floor; his height, the pin's radius; the fox's size
    const kind = w.kind, yT = 0.62, xL = 0.04, xR = 0.84, yF = 0.95, h = 0.14, rp = 0.035, fsz = 0.17, M = w.man, P = w.pin;
    const ph = gait(w, f, dt, 2), vRun = 0.64 * h * B; // two steps a beat, each a third of his height (no slip)
    const foxTop = yF - 0.7 * fsz, v0 = -0.3, tLeap = (-v0 + Math.sqrt(v0 * v0 + 2 * GR * (foxTop - yT))) / GR;
    let pop = 0;
    for (const hh of hits) {
      if (isLow(hh)) w.slosh.v += (rnd() < 0.5 ? -1 : 1) * 7 * hh.strength;
      else if (hh.kind === 'snare') pop = 1;
      else if (hh.kind === 'hat') w.glint = 1;
    }
    w.glint = Math.max(0, w.glint - dt * 4);
    if (f.section === 'drop' && !w.dropping && (M.st === 'run' || M.st === 'start')) { w.dropping = true; M.dir = 1; w.fox = { x: -0.25, ph: 0 }; s.shake = Math.max(s.shake, 0.3); }
    // the back wall: a window with the sun or the moon and stars, or the bakery's oven glowing with the level
    if (kind === 'bakery') {
      r.rect(0.12 * N, 0.08 * N, 0.05 * N, 0.14 * N, DARK + DIM);
      r.rect(0.06 * N, 0.2 * N, 0.36 * N, 0.42 * N, DARK);
      r.rect(0.1 * N, 0.3 * N, 0.28 * N, 0.2 * N, BLACK);
      flame(r, 0.24 * N, 0.5 * N, 0.2 * N, 0.12 * N * (0.6 + 0.6 * f.level), tt >> 1, 3);
      r.frame(0.1 * N, 0.3 * N, 0.28 * N, 0.2 * N, LMID + DIM);
    } else {
      const day = kind === 'day';
      r.rect(0.56 * N, 0.1 * N, 0.3 * N, 0.32 * N, day ? LMID : DARK);
      if (day) r.disc(0.78 * N, 0.2 * N, 0.04 * N, BRIGHT);
      else { for (let k = 0; k < 8; k++) r.set((0.57 + 0.28 * hash(k, 31)) * N, (0.11 + 0.3 * hash(k, 32)) * N, LMID); r.disc(0.66 * N, 0.18 * N, 0.03 * N, BRIGHT); }
      r.frame(0.56 * N, 0.1 * N, 0.3 * N, 0.32 * N, FIG + DIM);
      r.rect(0.705 * N - u * 0.5, 0.1 * N, mx1(u), 0.32 * N, FIG + DIM);
      r.rect(0.56 * N, 0.26 * N, 0.3 * N, mx1(u), FIG + DIM);
      for (const k of [0.52, 0.86]) r.poly([[k * N - 0.03 * N, 0.08 * N], [k * N + 0.03 * N, 0.08 * N], [k * N + 0.015 * N, 0.46 * N], [k * N - 0.015 * N, 0.46 * N]], HOT);
      r.rect(0.06 * N, 0.3 * N, 0.3 * N, mx1(1.5 * u), DARK + DIM); // a shelf of jars
      for (let k = 0; k < 4; k++) { const x = (0.09 + k * 0.07) * N, jh = (0.05 + 0.03 * hash(k, 33)) * N; r.rect(x, 0.3 * N - jh, 0.045 * N, jh, k % 2 ? COOL + DIM : MID + DIM); r.rect(x - u * 0.5, 0.3 * N - jh - 1.5 * u, 0.045 * N + u, 1.5 * u, DARK + DIM); }
    }
    // the floor, the legs, the top and the checked cloth hanging over its front
    r.rect(0, yF * N, N, N - yF * N, MID + DIM);
    for (const x of [xL + 0.03, xR - 0.055]) r.rect(x * N, yT * N, 0.025 * N, (yF - yT) * N, DARK);
    r.rect(xL * N, yT * N - u, (xR - xL) * N, 0.02 * N, LMID);
    for (let x = xL * N, k = 0; x < xR * N; x += 3 * u, k++) for (let j = 0; j < 2; j++) r.rect(x, yT * N + 0.012 * N + j * 3 * u, 3 * u, 3 * u, (k + j) % 2 ? HOT : BRIGHT);
    r.rect((xL + 0.02) * N, yT * N - 2 * u, 0.09 * N, mx1(1.5 * u), DARK + DIM); // the baking tray at the start
    // the glass of milk at the back of the table: the surface tilts on a slosh (a damped spring), spilling over the
    // high rim when it reaches it; the drops fall to the table and plop
    spring(w.slosh, dt, 50, 2.5);
    const gx = 0.52 * N, gb = yT * N - 0.01 * N, gw = 0.065 * N, gh = 0.09 * N, lvl = gb - gh * 0.75, tl = clamp(w.slosh.x, -0.9, 0.9);
    for (let x = Math.round(gx - gw / 2 + u); x < gx + gw / 2 - u; x++) vline(r, x, Math.max(gb - gh, lvl + tl * (x - gx)), gb - u, BRIGHT);
    for (const k of [-1, 1]) r.rect(gx + k * gw / 2 - (k > 0 ? u : 0), gb - gh, mx1(u), gh, COOL);
    r.rect(gx - gw / 2, gb - u, gw, mx1(u), COOL);
    if (Math.abs(tl) * gw * 0.5 > gh * 0.25 && w.drips.length < 30) { const sd = tl > 0 ? -1 : 1; for (let k = 0; k < 2; k++) w.drips.push({ x: gx + sd * gw / 2, y: gb - gh, vx: sd * (0.05 + 0.1 * rnd()) * N, vy: -0.05 * N * rnd(), life: 2, s: u, c: BRIGHT }); }
    w.drips = drops(W, w.drips, yT * N - u, BRIGHT, w.plops);
    w.plops = plopRings(W, w.plops, BRIGHT, 0.3, 0.06);
    if (w.glint > 0.4) for (let k = 0; k < 3; k++) r.set(gx - gw / 2 + hash(k, tt >> 2) * gw, gb - gh + hash(k + 5, tt >> 2) * gh * 0.4, WHITE);
    if (kind === 'night') { r.rect(0.7 * N - u, yT * N - 0.07 * N, 2 * u, 0.06 * N, BRIGHT); flame(r, 0.7 * N, yT * N - 0.07 * N, 2.5 * u, (0.03 - 0.015 * w.glint) * N, tt >> 1, 9); }
    // the man: running, hopping the pin when it comes at him, turning at the ends; on a drop off the right end in a
    // leap, onto the fox if it is there (else onto the floor, to wait for it), then riding it off
    const air = M.y < 0;
    if (M.st === 'run' || M.st === 'start') {
      if (air || M.vy < 0) { M.y += M.vy * dt + 0.5 * GR * dt * dt; M.vy += GR * dt; if (M.y >= 0) { M.y = 0; M.vy = 0; if (M.st === 'start') M.st = 'run'; } }
      if (M.st === 'run') {
        M.x += M.dir * vRun * dt;
        // the hop: its top over the middle of the pin, and high enough that his feet (wf either side of him) clear the
        // top of it all the way over at the speed they close; a hop that would come down past the end is a turn instead
        const d = (P.x - M.x) * M.dir, vc = vRun + Math.max(0, -P.v * M.dir), wf = 0.16 * h, H = Math.min(0.3, 2 * rp + 0.01 + 0.5 * GR * ((rp + wf) / vc) ** 2), reach = vc * Math.sqrt((2 * H) / GR);
        if (!air && d > 0 && d < reach + vc * dt) {
          const vj = (GR * Math.max(d, reach)) / vc, land = M.x + (M.dir * vRun * 2 * vj) / GR;
          if ((land > xR - 0.05 && !(w.dropping && M.dir > 0)) || land < xL + 0.07) M.dir = -M.dir;
          else { M.vy = -vj; M.y = -1e-6; }
        }
        if (w.dropping && M.dir > 0 && M.x >= xR - 0.01) { M.st = 'leap'; M.t = 0; M.vx = vRun; if (!(M.y < 0)) M.vy = v0; }
        else if (!w.dropping && M.dir > 0 && M.x > xR - 0.05) M.dir = -1;
        else if (M.dir < 0 && M.x < xL + 0.07) M.dir = 1;
      }
    } else if (M.st === 'leap') {
      M.t += dt; M.x += M.vx * dt; M.y += M.vy * dt + 0.5 * GR * dt * dt; M.vy += GR * dt;
      if (yT + M.y >= foxTop && w.fox && Math.abs(w.fox.x - M.x) < 0.1) M.st = 'ride';
      else if (yT + M.y >= yF) { M.y = yF - yT; M.st = 'wait'; }
    }
    // the pin rolls after him while he is on the table, slower than he runs (with the bass it gains)
    const tv = M.st === 'run' || M.st === 'start' ? Math.sign(M.x - P.x) * vRun * (0.6 + 0.3 * Math.min(1, f.rel.bassDrive)) : 0;
    P.v = follow(P.v, tv, dt, 0.5);
    P.x += P.v * dt;
    if (P.x < xL + rp) { P.x = xL + rp; P.v = Math.max(0, P.v); }
    if (P.x > xR - rp) { P.x = xR - rp; P.v = Math.min(0, P.v); }
    P.ang += (P.v * dt) / rp;
    const pcx = P.x * N, pcy = (yT - rp) * N, pr = rp * N, ca = Math.cos(P.ang), sa = Math.sin(P.ang);
    r.disc(pcx, pcy, pr, LMID);
    circ(r, pcx, pcy, pr - 0.5, DARK + DIM);
    r.line(pcx - ca * pr * 0.9, pcy - sa * pr * 0.9, pcx + ca * pr * 0.9, pcy + sa * pr * 0.9, DARK + DIM);
    r.disc(pcx, pcy, pr * 0.38, MID);
    r.set(pcx + ca * pr * 0.25, pcy + sa * pr * 0.25, DARK);
    targets.push({ x: pcx - pr, y: pcy - pr, w: 2 * pr, h: 2 * pr });
    // the fox's shadow: it sets its pace to be under him as he lands, its legs keeping step with the ground it covers
    const F = w.fox;
    let foxBack = null;
    if (F) {
      let v = M.st === 'run' ? (xR + vRun * tLeap - F.x) / Math.max(0.2, (xR - M.x) / vRun + tLeap) : M.st === 'leap' ? (M.x + M.vx * Math.max(0, tLeap - M.t) - F.x) / Math.max(0.15, tLeap - M.t) : M.st === 'wait' ? (M.x - F.x) / 0.4 : trot(fsz, f);
      v = clamp(v, 0.03, 0.6);
      F.x += v * dt;
      F.ph += (v * dt * Math.PI) / (0.4 * fsz);
      const Q = quad(r, F.x * N, yF * N, fsz * N, BLACK, F.ph, 1, u, { bushy: true, head: 0.45, ears: 0.1, earLen: 0.16, muzzle: 0.28, shadow: false, eye: BRIGHT });
      foxBack = Q.top;
      targets.push({ x: (F.x - fsz * 0.6) * N, y: (yF - 0.8 * fsz) * N, w: fsz * 1.3 * N, h: 0.8 * fsz * N });
      if (M.st === 'wait' && Math.abs(F.x - M.x) < 0.02) M.st = 'ride';
      if (M.st === 'ride') M.x = F.x - 0.01;
      if (M.st === 'ride' && F.x > 1.25) { w.fox = null; w.dropping = false; w.buttons = 7; Object.assign(M, { st: 'start', x: xL + 0.065, y: 0, vy: -0.5, dir: 1 }); }
    }
    // the man himself: his legs held still in the air and on the fox; a snare pops a button (or crumbs, when all
    // are gone) off on a parabola
    const mb = M.st === 'ride' && foxBack !== null ? foxBack : (yT + M.y) * N, still = M.y < 0 || M.st !== 'run';
    const bs = gingerman(r, M.x * N, mb, h * N, M.dir, still ? 0.6 : ph, u, w.buttons, [HOT, COOL, BRIGHT]);
    if (w.glint > 0.4) for (let k = 0; k < 2; k++) r.set(M.x * N + (hash(k, tt >> 2) - 0.5) * h * N * 0.4, mb - h * N * (0.3 + 0.5 * hash(k + 3, tt >> 2)), WHITE);
    targets.push({ x: M.x * N - h * N * 0.3, y: mb - h * N, w: h * N * 0.6, h: h * N });
    if (pop) {
      const k = w.buttons & 4 ? 2 : w.buttons & 2 ? 1 : w.buttons & 1 ? 0 : -1;
      if (k >= 0) { w.buttons &= ~(1 << k); w.candy.push({ x: bs[k][0], y: bs[k][1], vx: (-M.dir * 0.08 + (rnd() - 0.5) * 0.1) * N, vy: -(0.3 + 0.15 * rnd()) * N, s: mx1(h * N * 0.05), c: [HOT, COOL, BRIGHT][k], life: 30, rest: false }); }
      else for (let j = 0; j < 5; j++) w.crumbs.push({ x: M.x * N, y: mb - h * N * 0.5, vx: (rnd() - 0.5) * 0.3 * N, vy: -rnd() * 0.3 * N, life: 1.2, s: u, c: LMID + DIM, fl: mb <= yT * N && M.x > xL && M.x < xR ? yT * N - u : yF * N }); // onto the table, or the floor if he is off it
    }
    w.candy = w.candy.filter((p) => {
      if (!p.rest) {
        const over = p.y <= yT * N - u; // still above the table top: the top is under it while it is over the table
        p.vy += GR * N * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        const fl = over && p.x > xL * N && p.x < xR * N ? yT * N - u : yF * N;
        if (p.y >= fl) { p.y = fl; if (p.vy > 0.08 * N) { p.vy *= -0.4; p.vx *= 0.6; } else p.rest = true; }
      }
      if (p.rest && p.y < yF * N - 1 && Math.abs(p.x - pcx) < pr * 0.8) { for (let j = 0; j < 4; j++) w.crumbs.push({ x: p.x, y: p.y, vx: (rnd() - 0.5) * 0.2 * N, vy: -rnd() * 0.15 * N, life: 1, s: u, c: p.c }); return false; }
      r.disc(p.x, p.y - p.s, p.s, p.c);
      return (p.life -= dt) > 0;
    }).slice(-12);
    w.crumbs = tumble(W, w.crumbs, yT * N - u, LMID + DIM).slice(-60);
  },
};

// ---------------------------------------------------------------------------------------------- godmother
// The godmother in her bubble: it drifts with the mids, floating, and wobbles (a damped shape mode the beat sets
// ringing), her wings beating quicker with the treble; the wand sparkles on the hats, the dust drifting down at its
// slow terminal speed. A snare is a transformation, the wand's stream on it: the pumpkin swells into a carriage (the
// ribs turn to gilt, the wheels grow, a window lights) and the two mice into horses, over a few frames; the next
// snare turns them back. The potion vats bubble with the bass and burp on the kicks, steaming. The kind is where:
// a moonlit garden, the hearth, the road to the palace (the far castle small on its hill, the road converging on
// it). A drop pops the bubble (a ring running out, droplets falling) and she flashes back elsewhere, a new bubble
// growing round her.
const WHERE_W = { moonlit: [3, 2, 1], hearth: [2, 2, 1], road: [1, 2, 3] };
const godmother = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, WHERE_W, bandOf(W.a)), m: 0, mT: 0, wob: { x: 0, v: 0 }, home: [0.46, 0.36], pop: -1, flash: 0, grow: 1, dust: [], vb: [], splash: [], puffs: [], drops: [], stream: 0, gait: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), gy = 0.84 * N, kind = w.kind;
    if (f.section === 'change') w.kind = rollW(rnd, WHERE_W, band);
    let kick = 0, hat = false;
    for (const hh of hits) {
      if (isLow(hh)) kick = Math.max(kick, hh.strength);
      else if (hh.kind === 'snare') { w.mT = 1 - w.mT; w.stream = 0.35; }
      else if (hh.kind === 'hat') hat = true;
    }
    // where: the moonlit garden, the hearth, the road to the far palace
    if (kind === 'moonlit') { stars(r, N, 28, 41); r.disc(0.82 * N, 0.13 * N, 0.05 * N, BRIGHT); for (let k = 0; k < 10; k++) r.disc((k * 0.11 + 0.02) * N, gy - 0.05 * N, (0.05 + 0.02 * hash(k, 42)) * N, DARK + DIM); }
    else if (kind === 'hearth') {
      r.rect(0, 0, N, gy, MID + DIM);
      for (let y = 4 * u, k = 0; y < gy; y += 5 * u, k++) for (let x = (k % 2) * 4 * u; x < N; x += 8 * u) r.rect(x, y, mx1(u * 0.6), 5 * u, DARK + DIM);
      r.rect(0.02 * N, 0.42 * N, 0.4 * N, gy - 0.42 * N, BLACK);
      r.disc(0.22 * N, 0.42 * N, 0.2 * N, BLACK);
      r.rect(0, 0.4 * N, 0.44 * N, mx1(2 * u), DARK);
    } else {
      r.rect(0, 0.5 * N, N, 0.06 * N, HOT + DIM);
      r.poly([[0.62 * N, 0.56 * N], [0.86 * N, 0.56 * N], [0.8 * N, 0.48 * N], [0.68 * N, 0.48 * N]], DARK + DIM); // the hill, the palace small on it
      for (const [x, ht] of [[0.7, 0.1], [0.74, 0.14], [0.78, 0.09]]) { r.rect(x * N - 1.5 * u, (0.48 - ht) * N, 3 * u, ht * N, DARK + DIM); r.poly([[x * N - 2.5 * u, (0.48 - ht) * N], [x * N + 2.5 * u, (0.48 - ht) * N], [x * N, (0.44 - ht) * N]], DARK + DIM); }
      r.rect(0, 0.56 * N, N, gy - 0.56 * N, DARK + DIM);
      r.poly([[0.73 * N, 0.56 * N], [0.75 * N, 0.56 * N], [0.98 * N, gy], [0.44 * N, gy]], MID + DIM);
    }
    r.rect(0, gy, N, N - gy, DARK);
    // the vats at the left: bubbles swell on the surface at the rate of the bass and pop; a kick is a burp that
    // throws drops up to fall back in; the steam rises, slowing
    for (const [k, vx] of [0.1 * N, 0.27 * N].entries()) {
      const vy = gy - 0.09 * N, vw = 0.065 * N, col = k ? HOT : COOL;
      for (const j of [-1, 1]) r.stroke(vx + j * vw * 0.5, gy - 0.03 * N, vx + j * vw * 0.8, gy, mx1(1.5 * u), DARK);
      oval(r, vx, gy - 0.05 * N, vw, 0.045 * N, FIG + DIM);
      r.rect(vx - vw, vy, 2 * vw, mx1(1.5 * u), FIG);
      oval(r, vx, vy, vw * 0.9, 0.012 * N, col);
      if (rnd() < dt * (1 + 6 * f.rel.bassDrive)) w.vb.push({ x: vx + (rnd() - 0.5) * vw * 1.4, y: vy, s: (1 + 1.5 * rnd()) * u, t: 0, c: col });
      if (kick) { // the drops come down where their parabola does: back into the vat over its mouth, else on the floor
        w.vb.push({ x: vx, y: vy, s: 4 * u * kick, t: 0, c: col });
        for (let j = 0; j < 6; j++) { const x0 = vx + (rnd() - 0.5) * vw, dvx = (rnd() - 0.5) * 0.15 * N, dvy = -(0.2 + 0.3 * rnd()) * N * kick, xl = x0 + (dvx * 2 * -dvy) / (GR * N); w.drops.push({ x: x0, y: vy, vx: dvx, vy: dvy, life: 2, s: u, c: col, fl: Math.abs(xl - vx) < vw * 0.9 ? vy : gy }); }
      }
      if (rnd() < dt * (0.8 + 2 * f.level)) w.puffs.push(puff(vx + (rnd() - 0.5) * vw, vy - u, 0, -0.06 * N, 2));
    }
    w.vb = w.vb.filter((b) => { b.t += dt; if (b.t < 0.3) r.disc(b.x, b.y - (b.s * b.t) / 0.3, (b.s * b.t) / 0.3, b.c); else circ(r, b.x, b.y - b.s, b.s * (1 + (b.t - 0.3) * 12), LMID); return b.t < 0.4; }).slice(-40);
    w.drops = drops(W, w.drops, gy - 0.09 * N, COOL).slice(-60);
    w.puffs = smoke(W, w.puffs, 0.01 * N, LMID + DIM, BG).slice(-30);
    // the transformation, over a few frames toward the state the last snare asked for: the pumpkin swelling into
    // the carriage, the mice growing into horses in harness
    w.m = clamp(w.m + Math.sign(w.mT - w.m) * dt / 0.3);
    const m = ease(w.m), px = 0.6 * N, wr = 0.035 * N * m, rx = lerp(0.065, 0.1, m) * N, ry = lerp(0.055, 0.075, m) * N, cy = gy - 2 * wr * 0.9 - ry;
    for (const j of [-0.6, 0.6]) if (wr > u) { circ(r, px + j * rx, gy - wr, wr, FIG); r.line(px + j * rx - wr, gy - wr, px + j * rx + wr, gy - wr, FIG); r.line(px + j * rx, gy - 2 * wr, px + j * rx, gy, FIG); }
    oval(r, px, cy, rx, ry, m > 0.5 ? LMID : HOT);
    for (const j of [-0.75, -0.35, 0.35, 0.75]) { const hh = ry * Math.sqrt(1 - j * j); r.line(px + j * rx, cy - hh, px + j * rx, cy + hh, m > 0.5 ? BRIGHT : HOT + DIM); }
    if (m > 0.5) { r.rect(px - rx * 0.25, cy - ry * 0.45, rx * 0.5, ry * 0.5, BRIGHT); r.frame(px - rx * 0.25, cy - ry * 0.45, rx * 0.5, ry * 0.5, FIG); crown(r, px, cy - ry + u, rx * 0.35, u); }
    else r.stroke(px, cy - ry, px + 2 * u, cy - ry - 0.03 * N, mx1(1.5 * u), MID);
    targets.push({ x: px - rx, y: cy - ry, w: 2 * rx, h: gy - cy + ry });
    const hsz = lerp(0.045, 0.15, m) * N;
    for (const [k, hx] of [0.79, 0.92].entries()) {
      const x = lerp(px + rx + (0.04 + k * 0.06) * N, hx * N, m);
      if (m > 0.8) r.line(px + rx, cy, x + hsz * 0.3, gy - hsz * 0.55, LMID);
      quad(r, x, gy, hsz, m > 0.5 ? BRIGHT : LMID, 0, 1, u, { moving: false, head: lerp(0.3, 0.6 + 0.3 * f.beat.pulse, m), ears: 0.2, earLen: lerp(0.3, 0.12, m), muzzle: lerp(0.12, 0.22, m), shadow: m > 0.5, eye: DARK });
      if (m < 0.5) r.line(x - hsz * 0.4, gy - hsz * 0.4, x - hsz * 1.2, gy - u, LMID); // the mouse's long tail
    }
    // the bubble drifts with the mids round her home, wobbling: a shape mode kicked on the beat and by the kicks
    if (f.beat.on) w.wob.v += 1.5;
    if (kick) w.wob.v += 3 * kick;
    spring(w.wob, dt, 120, 3);
    const e = clamp(w.wob.x * 0.06, -0.15, 0.15), mc = f.rel.midClock, bx = (w.home[0] + Math.sin(mc * 0.5) * 0.16) * N, by = (w.home[1] + Math.sin(mc * 0.8 + 1) * 0.06) * N;
    const R = 0.1 * N * ease(w.grow), fh = 0.12 * N;
    if (f.section === 'drop' && w.pop < 0) { w.pop = 0; s.shake = Math.max(s.shake, 0.4); for (let k = 0; k < 18; k++) { const a = (k / 18) * TAU; w.splash.push({ x: bx + Math.cos(a) * R, y: by + Math.sin(a) * R, vx: Math.cos(a) * 0.3 * N, vy: Math.sin(a) * 0.3 * N - 0.1 * N, life: 1.5, c: COOL }); } }
    if (w.pop >= 0) {
      w.pop += dt;
      circ(r, w.popX ?? bx, w.popY ?? by, R + w.pop * 0.6 * N, LMID); // the ring from where it burst
      if (w.popX === undefined) { w.popX = bx; w.popY = by; }
      if (w.pop > 0.3 && w.flash <= 0) { w.home = [0.25 + rnd() * 0.5, 0.25 + rnd() * 0.18]; w.flash = 0.5; w.grow = 0; }
      if (w.pop > 0.6) { w.pop = -1; w.popX = w.popY = undefined; }
    }
    w.splash = drops(W, w.splash, gy, COOL).slice(-40); // the droplets of the burst bubble fall to the ground
    if (w.flash > 0) { w.flash -= dt; const q = 1 - w.flash / 0.5; r.disc(bx, by, 0.12 * N * (1 - q), WHITE); for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; r.line(bx + Math.cos(a) * 0.05 * N, by + Math.sin(a) * 0.05 * N, bx + Math.cos(a) * 0.18 * N * q, by + Math.sin(a) * 0.18 * N * q, BRIGHT); } }
    const shown = !(w.pop >= 0 && w.flash <= 0);
    w.wing = (w.wing || 0) + dt * TAU * (3 + 4 * f.rel.trebDrive); // the wingbeat's phase, quicker with the treble (summed, so a change of rate never jumps it)
    if (shown) {
      if (w.flash <= 0) w.grow = Math.min(1, w.grow + dt * 2);
      const flap = 0.5 + 0.5 * Math.sin(w.wing), dir = Math.cos(mc * 0.5) >= 0 ? 1 : -1;
      const tip = fairy(r, bx, by + fh * 0.5, fh, dir, u, flap);
      if (hat) for (let k = 0; k < 5; k++) w.dust.push({ x: tip[0], y: tip[1], vx: (rnd() - 0.5) * 0.12 * N, vy: -rnd() * 0.12 * N, life: 0.6 + rnd() * 0.6 });
      if (w.stream > 0) { w.stream -= dt; for (let k = 0; k < 12; k++) { const q = k / 12, sx = lerp(tip[0], px, q), sy = lerp(tip[1], cy, q) - Math.sin(q * Math.PI) * 0.08 * N; if (hash(k, (t * 30) | 0) < 0.7) r.rect(sx, sy, mx1(u), mx1(u), k % 2 ? BRIGHT : COOL); } }
      if (R > u) { circ(r, bx, by, R * (1 + e), COOL, (1 - e) / (1 + e)); for (let k = 0; k < 6; k++) { const a = 3.6 + k * 0.12; r.set(bx + Math.cos(a) * R * 0.75, by + Math.sin(a) * R * 0.75 * (1 - e), BRIGHT); } }
      targets.push({ x: bx - R, y: by - R, w: 2 * R, h: 2 * R });
    }
    // the dust: it drifts down at a slow terminal speed, twinkling out
    w.dust = w.dust.filter((p) => { p.vy = follow(p.vy, 0.04 * N, dt, 0.4); p.vx *= Math.exp(-dt * 2); p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.life > 0.5) { r.set(p.x, p.y, WHITE); r.set(p.x - 1, p.y, BRIGHT); r.set(p.x + 1, p.y, BRIGHT); r.set(p.x, p.y - 1, BRIGHT); r.set(p.x, p.y + 1, BRIGHT); } else if (hash(p.x | 0, (t * 20) | 0) < p.life * 2) r.set(p.x, p.y, BRIGHT); return p.life > 0; }).slice(-80);
  },
};

// ---------------------------------------------------------------------------------------------- bootedcat
// A cat in boots and a plumed hat fencing a hound in a tricorn. A kick is the cat's lunge: the sword arm turns down
// to the line at the shoulder, the front foot slides out with the back one planted, the hips sink as the stance
// widens, and the hound gives ground so the point falls short. A snare is the hound's attack, parried: the cat's
// blade goes up across it and the sparks fly from where the blades cross. A heavy snare is the cat's big pleading
// eyes: they grow huge and the hound's blade sinks. Both bounce on their toes on the beat, the points circling with
// the mids and the tail swishing with the treble. The kind is the arena: the inn (a lantern swinging from the beam
// as a pendulum, jolted by the kicks), the rooftops (chimney smoke on the wind), the barn (hay shaken down from the
// loft by the kicks). A drop is a cape sweep, round over the cat's head and back, raising a ring of dust.
const ARENA_W = { inn: [2, 2, 1], rooftop: [1, 2, 3], barn: [2, 1, 1] };
const segX = (a, b, c, d) => { const r1 = [b[0] - a[0], b[1] - a[1]], r2 = [d[0] - c[0], d[1] - c[1]], den = r1[0] * r2[1] - r1[1] * r2[0]; if (Math.abs(den) < 1e-9) return null; const p = ((c[0] - a[0]) * r2[1] - (c[1] - a[1]) * r2[0]) / den, q = ((c[0] - a[0]) * r1[1] - (c[1] - a[1]) * r1[0]) / den; return p >= 0 && p <= 1 && q >= 0 && q <= 1 ? [a[0] + p * r1[0], a[1] + p * r1[1]] : null; };
// a fencer `h` tall on `base` facing `dir`, the cat (boots, a plumed hat, a cape, a tail) or the hound (a long
// snout, a hanging ear, a tricorn): the feet `o.d` apart about `x` with straight legs (the hips sink as they
// spread), leaning into the lunge `o.L`, the sword arm turned at the shoulder to `o.arm` above the line it faces
// and the blade to `o.blade`. Returns the hand and the tip.
function fencer(r, cat, x, base, h, dir, u, o) {
  const l = h * 0.4, hipH = Math.sqrt(Math.max(0, l * l - (o.d / 2) ** 2)), hx = x, hy = base - hipH - o.hop, col = cat ? FIG : MID, lw = mx1(h * 0.07), boot = DARK;
  const lean = 0.12 + 0.4 * o.L, sx = hx + dir * Math.sin(lean) * h * 0.3, sy = hy - Math.cos(lean) * h * 0.3, hr = h * 0.11;
  if (cat) { // the cape behind the shoulders: a sweep turns its free edge round over the head and back
    const th = Math.PI / 2 + dir * 0.35 + dir * 4.2 * o.cape, cl = h * 0.38;
    r.poly([[sx - dir * h * 0.04, sy], [sx + dir * h * 0.03, sy], [sx + Math.cos(th - 0.25) * cl, sy + Math.sin(th - 0.25) * cl], [sx + Math.cos(th + 0.25) * cl, sy + Math.sin(th + 0.25) * cl]], HOT + DIM);
    let px = hx - dir * h * 0.05, py = hy; // the tail
    for (let k = 1; k <= 5; k++) { const q = k / 5, nx = hx - dir * (0.05 + q * 0.25) * h, ny = hy - q * h * 0.28 + Math.sin(q * 3 + o.tail) * h * 0.07 * o.tailA; r.stroke(px, py, nx, ny, mx1(h * 0.04), col); px = nx; py = ny; }
  }
  for (const k of [-1, 1]) { const fx = x + (k * dir * o.d) / 2, fy = base - o.hop; r.stroke(hx, hy, fx, fy, lw, col); if (cat) r.stroke(lerp(hx, fx, 0.5), lerp(hy, fy, 0.5), fx, fy, mx1(h * 0.09), boot); r.rect(fx - (dir > 0 ? h * 0.02 : h * 0.08), fy - u * 1.5, h * 0.1, 1.5 * u, boot); if (cat) r.rect(lerp(hx, fx, 0.5) - h * 0.05, lerp(hy, fy, 0.5) - u, h * 0.1, mx1(1.5 * u), HOT); }
  r.stroke(hx, hy, sx, sy, mx1(h * 0.15), col);
  // the off arm curled up behind for balance
  const bx = sx - dir * h * 0.12, by = sy - h * 0.08;
  r.line(sx, sy + h * 0.03, bx, by, col); r.line(bx, by, bx + dir * h * 0.03, by - h * 0.08, col);
  const hcx = sx + dir * h * 0.04, hcy = sy - hr * 1.15, E = o.eyes ?? 0;
  r.disc(hcx, hcy, hr, col);
  if (cat) {
    for (const k of [-0.6, 0.3]) r.poly([[hcx + k * hr - hr * 0.35, hcy - hr * 0.6], [hcx + k * hr + hr * 0.35, hcy - hr * 0.6], [hcx + k * hr + dir * hr * 0.1, hcy - hr * 1.5]], col);
    oval(r, hcx + dir * hr * 0.6, hcy + hr * 0.25, hr * 0.45, hr * 0.3, LMID);
    for (const k of [-1, 1]) r.line(hcx + dir * hr * 0.8, hcy + hr * 0.25, hcx + dir * hr * 1.6, hcy + hr * (0.25 + k * 0.25), LMID + DIM);
    if (E > 0.05) for (const k of [-0.45, 0.45]) { const er = hr * lerp(0.2, 0.55, E), ex = hcx + dir * hr * 0.2 + k * hr; r.disc(ex, hcy - hr * 0.1, er, WHITE); r.disc(ex + dir * er * 0.1, hcy - hr * 0.05, er * 0.75, BLACK); r.set(ex - er * 0.3, hcy - hr * 0.1 - er * 0.35, WHITE); }
    else { r.rect(hcx + dir * hr * 0.35 - u * 0.5, hcy - hr * 0.2, mx1(u * 1.2), mx1(u * 1.2), COOL); }
    const hb = hcy - hr * 0.75; // the hat: a brim, a crown, the plume arcing back
    r.rect(hcx - hr * 1.5, hb, hr * 3, mx1(1.5 * u), DARK);
    r.rect(hcx - hr * 0.6, hb - hr * 0.8, hr * 1.2, hr * 0.8, DARK);
    let px = hcx - dir * hr * 0.3, py = hb - hr * 0.7;
    for (let k = 1; k <= 4; k++) { const q = k / 4, nx = hcx - dir * hr * (0.3 + q * 1.6), ny = hb - hr * (0.7 + Math.sin(q * 2.2) * 0.9) + q * o.hop * 0.5; r.stroke(px, py, nx, ny, mx1(hr * 0.35 * (1 - q * 0.5)), HOT); px = nx; py = ny; }
  } else {
    r.stroke(hcx, hcy, hcx + dir * hr * 1.6, hcy + hr * 0.35, mx1(hr * 0.9), col);
    r.rect(hcx + dir * hr * 1.6 - u, hcy + hr * 0.1, 2 * u, 2 * u, BLACK);
    r.poly([[hcx - dir * hr * 0.2, hcy - hr * 0.5], [hcx - dir * hr * 0.9, hcy - hr * 0.3], [hcx - dir * hr * (0.8 + 0.4 * E), hcy + hr * (0.9 + 0.5 * E)]], MID + DIM);
    r.rect(hcx + dir * hr * 0.35 - u * 0.5, hcy - hr * 0.3, mx1(u * 1.2), mx1(u * 1.2), BLACK);
    r.poly([[hcx - hr * 1.4, hcy - hr * 0.55], [hcx + hr * 1.4, hcy - hr * 0.55], [hcx, hcy - hr * 1.5]], DARK);
  }
  // the sword arm from the shoulder, straight; the cup guard; the blade
  const ax = sx, ay = sy + h * 0.03, al = h * 0.32, hd = [ax + dir * Math.cos(o.arm) * al, ay - Math.sin(o.arm) * al], bl = h * 0.8;
  r.stroke(ax, ay, hd[0], hd[1], mx1(h * 0.05), col);
  const tp = [hd[0] + dir * Math.cos(o.blade) * bl, hd[1] - Math.sin(o.blade) * bl];
  r.line(hd[0], hd[1], tp[0], tp[1], BRIGHT);
  r.disc(hd[0] + dir * Math.cos(o.blade) * u * 1.5, hd[1] - Math.sin(o.blade) * u * 1.5, mx1(1.6 * u), LMID);
  return { hd, tp };
}
const bootedcat = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, ARENA_W, bandOf(W.a)), cT: 9, hT: 9, clashed: true, eyes: 0, cape: -1, lantern: { a: 0.3, w: 0 }, sparks: [], hay: [], puffs: [], dust: -1 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), gy = 0.84 * N, kind = w.kind, h = 0.26 * N;
    if (f.section === 'change') w.kind = rollW(rnd, ARENA_W, band);
    if (f.section === 'drop' && w.cape < 0) { w.cape = 0; w.dust = 0; s.shake = Math.max(s.shake, 0.3); }
    let kick = 0;
    for (const hh of hits) {
      if (isLow(hh)) { kick = Math.max(kick, hh.strength); if (w.cT > 0.3) w.cT = 0; }
      else if (hh.kind === 'snare') { if (hh.strength > 0.85) w.eyes = 1.6; else if (w.hT > 0.3) { w.hT = 0; w.clashed = false; } }
    }
    // the arena
    if (kind === 'inn') {
      r.rect(0, 0, N, 0.06 * N, DARK);
      for (const x of [0.06, 0.94]) r.rect(x * N - 0.02 * N, 0, 0.04 * N, gy, DARK);
      r.rect(0.66 * N, 0.6 * N, 0.26 * N, 0.025 * N, MID + DIM);
      for (const x of [0.68, 0.88]) r.rect(x * N, 0.625 * N, 0.015 * N, gy - 0.625 * N, DARK + DIM);
      for (const x of [0.72, 0.8]) { r.rect(x * N, 0.56 * N, 0.03 * N, 0.04 * N, LMID); r.rect(x * N + 0.03 * N, 0.57 * N, u, 0.02 * N, LMID); }
      const Lp = w.lantern, ll = 0.14 * N; // the lantern: a pendulum from the beam, jolted by the kicks
      if (kick) Lp.w += 0.8 * kick;
      swing(Lp, dt, ll, N, 0.3);
      const lx = 0.5 * N + Math.sin(Lp.a) * ll, ly = 0.06 * N + Math.cos(Lp.a) * ll;
      r.line(0.5 * N, 0.06 * N, lx, ly, DARK);
      r.rect(lx - 2 * u, ly, 4 * u, 5 * u, DARK); r.rect(lx - u, ly + u, 2 * u, 3 * u, f.level > 0.3 || f.beat.pulse > 0.5 ? BRIGHT : HOT);
    } else if (kind === 'rooftop') {
      stars(r, N, 30, 51); r.disc(0.15 * N, 0.14 * N, 0.045 * N, BRIGHT);
      for (let k = 0; k < 6; k++) { const x = k * 0.19 * N, ht = (0.12 + 0.1 * hash(k, 52)) * N; r.poly([[x - 0.1 * N, gy - 0.1 * N], [x + 0.1 * N, gy - 0.1 * N], [x, gy - 0.1 * N - ht]], DARK + DIM); }
      r.rect(0.8 * N, gy - 0.22 * N, 0.05 * N, 0.22 * N, DARK);
      if (rnd() < dt * (2 + 4 * f.level)) w.puffs.push(puff(0.825 * N, gy - 0.23 * N, 0, -0.06 * N, 3));
      w.puffs = smoke(W, w.puffs, 0.04 * N * (0.5 + f.rel.midDrive)).slice(-30);
    } else {
      for (let x = 0; x < N; x += 5 * u) r.rect(x, 0, mx1(u * 0.6), gy, MID + DIM);
      r.rect(0, 0.3 * N, N, 0.03 * N, DARK);
      for (const [x, y] of [[0.04, 0.72], [0.16, 0.72], [0.1, 0.6], [0.8, 0.72], [0.9, 0.72]]) { r.rect(x * N, y * N, 0.11 * N, 0.12 * N, LMID); for (let k = 1; k < 3; k++) r.rect(x * N, y * N + k * 0.04 * N, 0.11 * N, mx1(u * 0.6), MID); }
      if (kick) for (let k = 0; k < 8; k++) w.hay.push({ x: rnd() * N, y: 0.33 * N, vx: 0, vy: 0.05 * N, ph: rnd() * TAU, life: 2, c: LMID });
      w.hay = flutter(W, w.hay, gy, 0.01 * N, LMID).slice(-60);
    }
    r.rect(0, gy, N, N - gy, kind === 'rooftop' ? DARK : MID + DIM);
    for (let x = 0, k = 0; x < N; x += 7 * u, k++) r.rect(x, gy + (k % 2) * 2 * u, mx1(u * 0.6), N - gy, DARK + DIM);
    // the moves: the lunge and the attack are a quick extension and a slower recovery; the eyes come up and hold
    w.cT += dt; w.hT += dt; w.eyes = Math.max(0, w.eyes - dt);
    const env = (q) => (q < 0.12 ? ease(q / 0.12) : Math.max(0, 1 - (q - 0.12) / 0.4)), cL = env(w.cT), hL = env(w.hT), E = Math.min(1, (1.6 - w.eyes) / 0.2, w.eyes / 0.3);
    const hop = hopY(f, N, 0.012 * N), mc = f.rel.midClock, d0 = h * 0.35;
    if (w.cape >= 0 && (w.cape += dt) > 0.9) w.cape = -1;
    const sweep = w.cape >= 0 ? Math.sin((Math.PI * w.cape) / 0.9) : 0;
    const cd = d0 + cL * h * 0.45, hd = d0 + hL * h * 0.45, back = cL * 0.06 * N;
    const C = fencer(r, true, 0.3 * N + (cd - d0) / 2, gy, h, 1, u, { d: cd, L: cL, hop, arm: lerp(lerp(0.25, 0.05, cL), 0.75, hL), blade: lerp(lerp(0.45 + 0.07 * Math.sin(mc * 4), 0, cL), 1.3, hL), eyes: E, cape: sweep, tail: f.rel.trebClock * 2, tailA: 0.4 + Math.min(1, f.rel.trebDrive) });
    const D = fencer(r, false, 0.7 * N - (hd - d0) / 2 + back, gy, h, -1, u, { d: hd + back * 0.5, L: hL, hop, arm: lerp(lerp(0.25, 0, hL), -0.6, E), blade: lerp(lerp(0.4 + 0.07 * Math.cos(mc * 3.3), -0.05, hL), -1.2, E), eyes: E });
    // the clash: once an attack reaches its full extension, sparks from where the blades cross
    if (!w.clashed && w.hT >= 0.12) { w.clashed = true; const p = segX(C.hd, C.tp, D.hd, D.tp) || [(C.tp[0] + D.tp[0]) / 2, (C.tp[1] + D.tp[1]) / 2]; burst(w.sparks, rnd, p[0], p[1], 12, 0.4 * N, BRIGHT, 0.5); burst(w.sparks, rnd, p[0], p[1], 5, 0.3 * N, HOT, 0.4); }
    w.sparks = particles(W, w.sparks, BRIGHT).filter((p) => p.y < gy).slice(-60); // out on the floor
    if (w.dust >= 0) { w.dust += dt; circ(r, 0.3 * N, gy, w.dust * 0.5 * N, LMID, 0.2); circ(r, 0.3 * N, gy, w.dust * 0.35 * N, LMID + DIM, 0.2); if (w.dust > 1) w.dust = -1; }
    targets.push({ x: 0.3 * N - h * 0.3, y: gy - h, w: h * 0.6, h });
    targets.push({ x: 0.7 * N - h * 0.3, y: gy - h, w: h * 0.6, h });
  },
};

// ---------------------------------------------------------------------------------------------- wolfgrandma
// The bedroom: the wolf in a bonnet in the bed, the girl with her basket by the door. Each section change grows his
// ears, eyes and teeth a step (three stages, then back to the start); the bed creaks on the beat (a spring under
// the mattress bounces all that is on it), the blanket breathes with the bass; a kick snaps his jaws (and in a
// storm lights the window), a snare startles the girl back on her heels, the hats make the candle gutter. The kind
// is the light: the candle, the moon at the window, a storm. A drop is the woodcutter: his axe bites through the
// door twice and it splits, the planks toppling toward us about their feet to lie flat on the floor, the light
// pouring in round his figure, and the wolf dives under the blanket, trembling there until the next section.
const LIGHT_W = { candle: [2, 2, 1], moonlit: [3, 1, 1], storm: [1, 2, 3] };
const wolfgrandma = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, LIGHT_W, bandOf(W.a)), stage: 0, grow: 0, bed: { x: 0, v: 0 }, girl: { x: 0, v: 0 }, jaw: 0, gutter: 0, flash: 0, axe: -1, planks: [], dive: 0, puffs: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), gy = 0.86 * N, tt = Math.floor(t * 30); // tt: the flicker clock, by time
    if (f.section === 'change') { w.kind = rollW(rnd, LIGHT_W, band); w.stage = (w.stage + 1) % 3; w.axe = -1; w.planks.length = 0; }
    if (f.section === 'drop' && w.axe < 0) w.axe = 0;
    const kind = w.kind;
    for (const hh of hits) {
      if (isLow(hh)) { w.jaw = 1; if (kind === 'storm' && hh.strength > 0.6) w.flash = 1; }
      else if (hh.kind === 'snare') w.girl.v -= 4 * hh.strength;
      else if (hh.kind === 'hat') w.gutter = 1;
    }
    if (f.beat.on) w.bed.v += 1.6 + 2 * f.rel.bassDrive;
    spring(w.bed, dt, 150, 7); spring(w.girl, dt, 40, 6);
    w.jaw = Math.max(0, w.jaw - dt * 5); w.gutter = Math.max(0, w.gutter - dt * 3); w.flash = Math.max(0, w.flash - dt * 4);
    w.grow = follow(w.grow, w.stage, dt, 0.4);
    // the floor and the window: the moon, the storm's rain and lightning, or the curtains drawn
    r.rect(0, gy, N, N - gy, DARK);
    for (let x = 0, k = 0; x < N; x += 6 * u, k++) r.rect(x, gy, mx1(u * 0.5), N - gy, DARK + DIM);
    const wx = 0.56 * N, wy = 0.12 * N, ww = 0.22 * N, wh = 0.26 * N;
    r.rect(wx, wy, ww, wh, w.flash > 0.3 ? WHITE : DARK + DIM);
    if (kind === 'moonlit') { r.disc(wx + ww * 0.65, wy + wh * 0.3, 0.035 * N, BRIGHT); for (let k = 0; k < 6; k++) r.set(wx + hash(k, 61) * ww, wy + hash(k, 62) * wh, LMID); }
    else if (kind === 'storm') {
      for (let k = 0; k < 14; k++) { const x = wx + hash(k, 63) * ww, y = wy + ((hash(k, 64) + f.rel.trebClock * 0.3 + t * 0.8) % 1) * wh; r.line(x, y, x - 1.5 * u, Math.min(wy + wh - 1, y + 3 * u), COOL + DIM); }
      if (w.flash > 0.3) { let x = wx + ww * 0.6, y = wy; for (let k = 0; k < 5; k++) { const nx = x + (hash(k, tt >> 3) - 0.5) * ww * 0.3, ny = y + wh / 5; r.line(x, y, nx, ny, BRIGHT); x = nx; y = ny; } }
    } else for (const k of [0, 1]) r.rect(wx + k * ww * 0.5, wy, ww * 0.5, wh, HOT + DIM);
    r.frame(wx, wy, ww, wh, FIG + DIM); r.rect(wx + ww / 2 - u * 0.5, wy, mx1(u), wh, FIG + DIM); r.rect(wx, wy + wh / 2, ww, mx1(u), FIG + DIM);
    // the door, and the woodcutter's axe: two bites through it, then it splits; the planks topple toward us about
    // their feet (a rod about its end: angular acceleration 3g/2L sin) and lie flat; the light pours in
    const dx0 = 0.06 * N, dw = 0.14 * N, dtop = 0.5 * N, dl = gy - dtop;
    if (w.axe >= 0) w.axe += dt;
    const split = w.axe >= 0.8;
    if (split && !w.planks.length) { for (let k = 0; k < 3; k++) w.planks.push({ th: 0.02 + 0.03 * rnd(), om: 0, rest: false }); s.shake = Math.max(s.shake, 0.6); }
    if (split) {
      r.rect(dx0, dtop, dw, dl, BRIGHT);
      r.poly([[dx0, gy], [dx0 + dw, gy], [dx0 + dw + 0.2 * N, N], [dx0 - 0.02 * N, N]], LMID);
      const J = walker(r, dx0 + dw * 0.5, gy, 0.27 * N, DARK, 0, 1, { cap: true, hatCol: DARK });
      r.stroke(J.sx, J.sy, J.sx + 0.04 * N, J.top - 0.04 * N, mx1(1.5 * u), DARK); r.poly([[J.sx + 0.03 * N, J.top - 0.06 * N], [J.sx + 0.07 * N, J.top - 0.05 * N], [J.sx + 0.05 * N, J.top - 0.01 * N]], DARK);
    } else {
      r.rect(dx0, dtop, dw, dl, MID + DIM);
      for (const k of [1, 2]) r.rect(dx0 + (k * dw) / 3, dtop, mx1(u * 0.6), dl, DARK + DIM);
      r.disc(dx0 + dw * 0.85, dtop + dl * 0.55, mx1(1.2 * u), LMID);
      const bite = w.axe >= 0 ? w.axe % 0.45 : 1;
      if (w.axe >= 0 && bite < 0.25) { const ax = dx0 + dw * 0.5, ay = dtop + dl * 0.4, p = 0.04 * N * Math.sin((Math.PI * bite) / 0.25); r.poly([[ax, ay - 0.02 * N], [ax + p, ay], [ax, ay + 0.02 * N]], BRIGHT); if (bite < dt) s.shake = Math.max(s.shake, 0.4); }
    }
    for (const [k, p] of w.planks.entries()) {
      if (!p.rest) { p.om += ((3 * GR * N) / (2 * dl)) * Math.sin(p.th) * dt; p.th += p.om * dt; if (p.th >= Math.PI / 2) { p.th = Math.PI / 2; p.om *= -0.2; if (Math.abs(p.om) < 0.3) p.rest = true; } }
      const x0 = dx0 + (k * dw) / 3, pw = dw / 3, ty = gy - dl * Math.cos(p.th) + dl * Math.sin(p.th) * 0.3;
      r.poly([[x0, gy], [x0 + pw, gy], [x0 + pw * 1.1, ty], [x0 - pw * 0.1, ty]], LMID + DIM);
      r.line(x0, gy, x0 - pw * 0.1, ty, DARK + DIM);
    }
    // the candle on its stand: the flame tall with the level, guttering on the hats and smoking
    r.rect(0.38 * N, 0.7 * N, 0.08 * N, gy - 0.7 * N, DARK + DIM);
    r.rect(0.415 * N, 0.64 * N, 0.012 * N, 0.06 * N, BRIGHT);
    flame(r, 0.421 * N + w.gutter * 2 * u, 0.64 * N, 0.02 * N, (0.025 + 0.025 * f.level) * N * (1 - 0.6 * w.gutter), tt >> 1, 71);
    if (w.gutter > 0.6 && rnd() < 0.3) w.puffs.push(puff(0.421 * N, 0.6 * N, 0, -0.04 * N, 1.5));
    w.puffs = smoke(W, w.puffs, 0.005 * N, LMID + DIM, DARK + DIM).slice(-20);
    // the bed: the frame stays, the mattress and all on it bounce; the wolf's head on the pillow, the blanket over him
    const bx0 = 0.5 * N, bx1 = 0.94 * N, by = w.bed.x * 2.5 * u, my = 0.66 * N + by;
    r.rect(bx1 - 0.03 * N, 0.48 * N, 0.03 * N, gy - 0.48 * N, DARK);
    r.rect(bx0, 0.6 * N, 0.025 * N, gy - 0.6 * N, DARK);
    r.rect(bx0, 0.7 * N, bx1 - bx0, 0.03 * N, DARK);
    r.rect(bx0 + 0.025 * N, my, bx1 - bx0 - 0.055 * N, 0.04 * N, LMID);
    oval(r, bx1 - 0.075 * N, my - 0.008 * N, 0.045 * N, 0.018 * N, BRIGHT);
    w.dive = follow(w.dive, split ? 1 : 0, dt, 0.15);
    const G = 1 + 0.5 * w.grow, hr = 0.05 * N, hx = bx1 - 0.1 * N, hy = my - 0.05 * N + w.dive * 0.1 * N;
    r.disc(hx + hr * 0.3, hy - hr * 0.1, hr * 1.05, LMID); // the bonnet, frilled, tied under the chin
    for (let k = 0; k < 7; k++) { const a = -2.4 + k * 0.6; r.disc(hx + hr * 0.3 + Math.cos(a) * hr * 1.05, hy - hr * 0.1 + Math.sin(a) * hr * 1.05, mx1(hr * 0.22), BRIGHT); }
    for (const k of [0.05, 0.6]) { const ex = hx + k * hr, el = hr * 0.75 * G; r.poly([[ex - hr * 0.28, hy - hr * 0.55], [ex + hr * 0.28, hy - hr * 0.55], [ex + hr * 0.08, hy - hr * 0.55 - el]], MID); }
    r.disc(hx, hy, hr * 0.8, MID);
    const sl = hr * 1.5, hg = [hx - hr * 0.4, hy + hr * 0.2], ja = 0.05 + 0.55 * w.jaw, ts = mx1(u * (0.7 + 0.7 * w.grow)), nt = 3 + Math.round(w.grow) * 2;
    r.poly([[hx - hr * 0.3, hy - hr * 0.4], [hx - hr * 0.3 - sl, hy - hr * 0.05], [hg[0], hg[1]]], MID);
    for (let k = 0; k < nt; k++) { const q = (k + 0.5) / nt, tx = lerp(hg[0], hx - hr * 0.3 - sl, q), ty = lerp(hg[1], hy - hr * 0.05, q); r.poly([[tx - ts * 0.6, ty - 0.5], [tx + ts * 0.6, ty - 0.5], [tx, ty + ts]], WHITE); }
    const lj = [hg[0] - Math.cos(ja) * sl * 0.85, hg[1] + Math.sin(ja) * sl * 0.85];
    r.stroke(hg[0], hg[1], lj[0], lj[1], mx1(hr * 0.35), MID);
    r.rect(hx - hr * 0.3 - sl - u, hy - hr * 0.15, 2 * u, 2 * u, BLACK);
    const er = mx1(hr * 0.16 * G);
    r.disc(hx - hr * 0.2, hy - hr * 0.3, er, kind === 'candle' ? BRIGHT : HOT); r.set(hx - hr * 0.2 - er * 0.3, hy - hr * 0.3, BLACK);
    targets.push({ x: hx - hr * 2.2, y: hy - hr * 2, w: hr * 3.5, h: hr * 3 });
    const bl = w.dive > 0.4 ? bx1 - 0.035 * N : bx1 - 0.15 * N, sh = w.dive > 0.4 ? (hash(tt, 72) - 0.5) * 1.5 * u : 0, hump = (0.025 + 0.004 * Math.sin(f.rel.bassClock)) * N;
    oval(r, lerp(bx0, bl, 0.55) + sh, my - 0.005 * N, (bl - bx0) * 0.42, hump, HOT);
    r.rect(bx0 + 0.02 * N + sh, my - 0.005 * N, bl - bx0 - 0.02 * N, 0.05 * N, HOT);
    for (let x = bx0 + 0.03 * N; x < bl - 2 * u; x += 0.04 * N) r.rect(x + sh, my - 0.005 * N, mx1(u * 0.6), 0.05 * N, HOT + DIM);
    // the girl by the door: the red hood and cape, the basket on her arm (it hangs plumb); a snare sets her back on
    // her heels: she leans about her planted feet
    const gx = 0.3 * N, gh = 0.24 * N, lean = clamp(w.girl.x * 0.12, -0.35, 0.35), Tf = turn(gx, gy, lean), T = (dx, dy) => Tf(dx, dy - gh * 0.45), dir = 1;
    for (const k of [-1, 1]) { const hp = T(k * gh * 0.04, gh * 0.33); r.line(hp[0], hp[1], gx + k * gh * 0.05, gy, FIG); }
    r.poly([T(-gh * 0.16, gh * 0.33), T(gh * 0.16, gh * 0.33), T(gh * 0.07, -gh * 0.05), T(-gh * 0.07, -gh * 0.05)], MID);
    r.poly([T(-gh * 0.1, -gh * 0.42), T(-gh * 0.22, gh * 0.3), T(-gh * 0.02, gh * 0.25), T(gh * 0.06, -gh * 0.3)], HOT);
    const hd = T(dir * gh * 0.02, -gh * 0.38);
    r.disc(hd[0], hd[1], gh * 0.1, HOT); r.disc(hd[0] + dir * gh * 0.03, hd[1] + gh * 0.01, gh * 0.07, LMID);
    r.set(hd[0] + dir * gh * 0.06, hd[1] - gh * 0.01, BLACK);
    const sh2 = T(dir * gh * 0.05, -gh * 0.2), hand = T(dir * gh * 0.16, -gh * 0.02);
    r.line(sh2[0], sh2[1], hand[0], hand[1], LMID);
    r.poly([[hand[0] - gh * 0.08, hand[1] + gh * 0.03], [hand[0] + gh * 0.08, hand[1] + gh * 0.03], [hand[0] + gh * 0.06, hand[1] + gh * 0.13], [hand[0] - gh * 0.06, hand[1] + gh * 0.13]], LMID + DIM);
    r.rect(hand[0] - gh * 0.07, hand[1] + gh * 0.02, gh * 0.14, mx1(u * 1.2), COOL);
    for (let k = 0; k <= 8; k++) { const a = Math.PI + (k / 8) * Math.PI; r.set(hand[0] + Math.cos(a) * gh * 0.07, hand[1] + gh * 0.03 + Math.sin(a) * gh * 0.07, LMID + DIM); } // the handle
    targets.push({ x: gx - gh * 0.25, y: gy - gh, w: gh * 0.5, h: gh });
  },
};

// ---------------------------------------------------------------------------------------------- beanstalk
// A beanstalk grows into the clouds a spiral segment a beat (two strands winding a half turn round each other per
// segment, a leaf unfurling at each joint, rustling on the hats), swaying with the mids and bending most at the
// top. The boy climbs it hand over hand, a reach a beat (a hand up, then the pull), into the clouds and back down
// two reaches a beat. Up on the cloud bank stands the giant's castle: his footsteps on the kicks jolt the bank,
// shake the stalk and knock dust down from under the clouds; his goose at the bank's edge lays a golden egg on the
// snares, which drops to the field, bounces and rolls to rest. The kind is the hour: dawn, day or a starry night.
// A drop: the boy slides down, two chops at the foot on the beat, and the stalk topples about its foot under
// gravity, lands, withers where it lies, and a new one sprouts from the stump.
const HOUR2_W = { dawn: [2, 2, 1], day: [1, 2, 3], starry: [3, 1, 1] };
// the stalk from its foot (x0, base), `len` long, leaning `th` about the foot, the top bent sideways by `bend` (a
// stem bends most at its tip); `full` the height a grown one reaches, `seg` the segment, `grow` how far grown
function stalk(r, x0, base, len, full, seg, th, bend, R, u, grow, rustle, col, leaf) {
  const c = Math.cos(th), sn = Math.sin(th), map = (s, lat) => [x0 + s * sn + lat * c, base - s * c + lat * sn], st = mx1(1.5 * u);
  for (const front of [false, true])
    for (let s = 0; s < len; s += 0.7) {
      const sw = bend * (s / full) ** 2, rr = R * (1 - 0.5 * (s / full));
      for (let j = 0; j < 2; j++) { const a = (s / seg) * Math.PI + j * Math.PI; if (Math.sin(a) > 0 !== front) continue; const p = map(s, sw + Math.cos(a) * rr); r.rect(p[0] - st / 2, p[1] - st / 2, st, st, front ? col : dim(col)); }
    }
  for (let k = 1; k * seg < len; k++) {
    const s = k * seg, sc = clamp((grow - k) / 1.5), side = k % 2 ? 1 : -1, sw = bend * (s / full) ** 2, L = 0.045 * r.N * sc;
    if (sc <= 0) continue;
    r.poly([map(s, sw + side * R), map(s + L * 0.45, sw + side * (R + L * 0.45)), map(s + L * 0.3, sw + side * (R + L + rustle)), map(s - L * 0.05, sw + side * (R + L * 0.55))], leaf);
  }
}
const beanstalk = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, HOUR2_W, bandOf(W.a)), segs: 0, grow: 0, sway: { x: 0, v: 0 }, bank: { x: 0, v: 0 }, boy: { st: 'wait', c: 0, n: 0, reach: 0, chops: 0, swing: 0 }, fell: null, drop: false,
      eggs: [], dust: [], chips: [], rustle: 0, honk: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), gy = 0.92 * N, x0 = 0.4 * N, cb = 0.28 * N, full = gy - cb + 0.04 * N, seg = 0.04 * N, B = bps(f), kind = w.kind;
    if (f.section === 'change') w.kind = rollW(rnd, HOUR2_W, band);
    const maxSeg = Math.ceil(full / seg), Bo = w.boy, onTick = tick(w, f, dt);
    let kick = 0, egg = 0;
    for (const hh of hits) {
      if (isLow(hh)) kick = Math.max(kick, hh.strength);
      else if (hh.kind === 'snare') egg = 1;
      else if (hh.kind === 'hat') w.rustle = 1;
    }
    w.rustle = Math.max(0, w.rustle - dt * 4);
    if (f.section === 'drop' && !w.drop && w.segs > 4) { w.drop = true; if (Bo.st !== 'wait') Bo.st = 'slide'; }
    // the sky for the hour, the field
    if (kind === 'starry') { stars(r, N, 40, 81, LMID); r.disc(0.12 * N, 0.08 * N, 0.04 * N, BRIGHT); }
    else if (kind === 'dawn') { r.rect(0, 0.62 * N, N, 0.3 * N, HOT + DIM); r.disc(0.84 * N, 0.8 * N, 0.07 * N, HOT); }
    else r.disc(0.12 * N, 0.07 * N, 0.045 * N, BRIGHT);
    r.rect(0, 0.8 * N, N, 0.04 * N, DARK + DIM);
    r.rect(0, gy, N, N - gy, MID + DIM);
    for (let k = 0; k < 7; k++) r.rect(0, gy + 1.5 * u + k * 2.5 * u, N, mx1(u * 0.5), DARK + DIM);
    // the stalk grows a segment a beat to the clouds (the new one swelling out over the beat); a kick shakes it
    if (onTick && w.segs < maxSeg) w.segs++;
    w.grow = follow(w.grow, w.segs, dt, 0.15);
    if (kick) { w.sway.v += (rnd() < 0.5 ? -1 : 1) * 0.15 * N * kick; w.bank.v += 0.3 * N * kick; s.shake = Math.max(s.shake, 0.15 * kick); for (let k = 0; k < 4 * kick; k++) w.dust.push({ x: (0.3 + rnd() * 0.7) * N, y: cb + 0.03 * N, vy: 0, life: 1.5 + rnd() }); } // off the underside of the bank
    spring(w.sway, dt, 9, 1.2);
    spring(w.bank, dt, 80, 9);
    const bend = w.sway.x + Math.sin(f.rel.midClock * 0.7) * 0.012 * N, len = Math.min(full, w.grow * seg), col = MID, leaf = LMID;
    // the felled one: it turns about its foot (a rod about its end), lands, and withers where it lies
    const F = w.fell;
    if (F) {
      if (!F.down) { F.om += ((3 * GR * N) / (2 * F.len)) * Math.sin(F.th) * dt; F.th += F.om * dt; if (F.th >= Math.PI / 2) { F.th = Math.PI / 2; F.down = true; s.shake = Math.max(s.shake, 0.6); for (let k = 0; k < 20; k++) w.chips.push({ x: x0 + rnd() * F.len, y: gy, vx: (rnd() - 0.5) * 0.2 * N, vy: -rnd() * 0.3 * N, life: 1, s: u, c: DARK + DIM }); } }
      else if ((F.wither += dt) > 4) w.fell = null;
      if (w.fell) stalk(r, x0, gy - 2 * u, F.len, full, seg, F.th, 0, 0.012 * N * (1 - (F.wither || 0) / 5), u, F.segs + 2, 0, F.wither > 1 ? DARK : col, F.wither > 1 ? MID + DIM : leaf);
    }
    stalk(r, x0, gy, len, full, seg, 0, bend, 0.012 * N, u, w.grow, w.rustle * 2 * u, col, leaf);
    const at = (h) => x0 + bend * (h / full) ** 2; // the stalk's axis at a height
    // the cloud bank (jolted by the footsteps), the castle on it, the goose at its edge
    const jb = w.bank.x * 0.4, cy = 0.21 * N + jb; // (bank.x is in cells: a jolt of a cell or two)
    for (let k = 0; k < 11; k++) r.disc((0.27 + k * 0.075) * N, cy + 0.04 * N + hash(k, 82) * 0.02 * N, (0.045 + 0.02 * hash(k, 83)) * N, LMID);
    for (let k = 0; k < 11; k++) r.disc((0.29 + k * 0.075) * N, cy + hash(k, 84) * 0.02 * N, (0.05 + 0.02 * hash(k, 85)) * N, BRIGHT);
    for (const [x, ht, wd] of [[0.66, 0.12, 0.05], [0.74, 0.17, 0.06], [0.83, 0.1, 0.05]]) { const top = cy - 0.03 * N - ht * N; r.rect(x * N, top, wd * N, ht * N, DARK + DIM); for (let k = 0; k < 3; k++) r.rect(x * N + k * wd * N * 0.4, top - 2 * u, wd * N * 0.2, 2 * u, DARK + DIM); r.rect(x * N + wd * N * 0.35, top + ht * N * 0.3, wd * N * 0.3, ht * N * 0.2, kind === 'starry' || f.level > 0.7 ? HOT : DARK); }
    w.honk = Math.max(0, w.honk - dt * 3);
    const gx = 0.29 * N, gyy = cy - 0.035 * N, nk = 0.035 * N * (1 + 0.5 * w.honk);
    oval(r, gx, gyy, 0.028 * N, 0.016 * N, WHITE);
    r.stroke(gx - 0.02 * N, gyy - 0.005 * N, gx - 0.025 * N, gyy - nk, mx1(1.5 * u), WHITE);
    r.disc(gx - 0.026 * N, gyy - nk, mx1(2 * u), WHITE);
    r.rect(gx - 0.026 * N - 3 * u, gyy - nk, 2 * u, mx1(u), HOT);
    if (egg) { w.honk = 1; w.eggs.push({ x: gx - 0.01 * N, y: gyy + 0.01 * N, vx: -0.06 * N, vy: 0, rest: false, ang: 0 }); }
    // the eggs: they drop from the edge, bounce on the field losing most of their speed, roll (turning by the way they
    // go, the gleam with them) and rest
    for (const e of w.eggs) {
      if (!e.rest) { e.vy += GR * N * dt; e.x += e.vx * dt; e.y += e.vy * dt; if (e.y >= gy) { e.y = gy; if (e.vy > 0.08 * N) { e.vy *= -0.4; e.vx *= 0.8; } else { e.vy = 0; e.ang += (e.vx * dt) / (2.3 * u); e.vx *= Math.exp(-dt * 3); if (Math.abs(e.vx) < 0.005 * N) e.rest = true; } } }
      const c = Math.cos(e.ang), sn = Math.sin(e.ang);
      oval(r, e.x, e.y - 2.5 * u, 2 * u, 2.6 * u, HOT); r.set(e.x - u * c + u * sn, e.y - 2.5 * u - u * sn - u * c, BRIGHT);
    }
    if (w.eggs.length > 12) w.eggs.shift();
    w.dust = w.dust.filter((p) => { p.vy = follow(p.vy, 0.15 * N, dt, 0.3); p.y += p.vy * dt; p.life -= dt; if (p.life > 0.5 || hash(p.x | 0, (t * 20) | 0) < p.life * 2) r.set(p.x, p.y, DARK + DIM); return p.life > 0 && p.y < gy; }).slice(-40); // the dust settles at a low terminal speed
    // the boy: up a reach a beat (the hand goes up on the beat, the body follows in the first half of it), never
    // above the tip, into the clouds, a rest there, down two reaches a beat; a drop: down the stalk in a slide, two
    // chops on the beat at the foot, and it goes
    const reach = 0.035 * N, top = gy - cb + 0.02 * N, bh = 0.07 * N;
    if (onTick) {
      Bo.n++;
      if (Bo.st === 'wait' && !w.drop && Bo.n > 3 && w.segs > 4) { Bo.st = 'up'; Bo.n = 0; }
      else if (Bo.st === 'up') Bo.reach = Math.min(Bo.reach + reach, len - 0.06 * N, top);
      else if (Bo.st === 'down') Bo.reach = Math.max(0, Bo.reach - 2 * reach);
      else if (Bo.st === 'hidden' && Bo.n > 4) Bo.st = 'down';
      else if (Bo.st === 'chop') { Bo.swing = 0.2; Bo.chops++; for (let k = 0; k < 6; k++) w.chips.push({ x: x0, y: gy - 3 * u, vx: (0.1 + rnd() * 0.2) * N * (rnd() < 0.5 ? -1 : 1), vy: -rnd() * 0.3 * N, life: 1, s: u, c: LMID }); if (Bo.chops >= 2) { w.fell = { th: 0.03, om: 0, len, segs: w.segs, down: false, wither: 0 }; w.segs = 0; w.grow = 0; w.drop = false; Bo.st = 'wait'; Bo.n = 0; Bo.chops = 0; } }
    }
    if (Bo.st === 'slide') { Bo.reach = Math.max(0, Bo.reach - 0.6 * N * dt); Bo.c = Bo.reach; if (Bo.reach <= 0) { Bo.st = 'chop'; Bo.chops = 0; } }
    else Bo.c = follow(Bo.c, Bo.reach, dt, 0.08);
    if (Bo.st === 'up' && Bo.reach >= top - 1) { Bo.st = 'hidden'; Bo.n = 0; }
    if (Bo.st === 'down' && Bo.c < 1) { Bo.st = 'wait'; Bo.n = 0; Bo.c = 0; }
    if (w.drop && Bo.st === 'wait') { Bo.st = 'chop'; Bo.chops = 0; }
    Bo.swing = Math.max(0, Bo.swing - dt);
    if (Bo.st === 'wait' || Bo.st === 'chop') {
      const bx = x0 - 0.05 * N, J = walker(r, bx, gy, bh, FIG, 0, 1, { cap: true, hatCol: HOT }), ang = Bo.st === 'chop' ? (Bo.swing > 0 ? lerp(-0.3, 1.9, Bo.swing / 0.2) : 1.9) : -0.4;
      if (Bo.st === 'chop') { const hx = J.sx + Math.cos(-ang) * bh * 0.35, hy = J.sy + Math.sin(-ang) * bh * 0.35; r.line(J.sx, J.sy, hx, hy, DARK); r.poly([[hx, hy], [hx + Math.cos(-ang + 1.2) * 3 * u, hy + Math.sin(-ang + 1.2) * 3 * u], [hx + Math.cos(-ang + 0.4) * 4 * u, hy + Math.sin(-ang + 0.4) * 4 * u]], BRIGHT); }
      targets.push({ x: bx - bh * 0.3, y: gy - bh, w: bh * 0.6, h: bh });
    } else if (Bo.st !== 'hidden') {
      const by = gy - Bo.c - bh * 0.3, ax = at(gy - by), up = (Bo.n + (Bo.st === 'up' ? 0 : 1)) % 2, x = ax - 0.012 * N;
      r.stroke(x, by, x, by - bh * 0.4, mx1(bh * 0.18), FIG);
      r.disc(x - u * 0.5, by - bh * 0.52, bh * 0.12, FIG);
      r.rect(x - bh * 0.13, by - bh * 0.64, bh * 0.26, mx1(bh * 0.07), HOT);
      for (const k of [0, 1]) { const hy = by - bh * (k === up ? 0.75 : 0.45); r.line(x, by - bh * 0.35, ax, hy, FIG); }
      for (const k of [0, 1]) r.line(x, by, ax + (k ? 1 : -1) * u, by + bh * (k ? 0.25 : 0.15), FIG);
      targets.push({ x: x - bh * 0.3, y: by - bh * 0.7, w: bh * 0.6, h: bh });
    }
    w.chips = tumble(W, w.chips, gy, LMID).slice(-60);
  },
};

// ---------------------------------------------------------------------------------------------- trollbridge
// A stone bridge over a river that runs toward us out of its arch, the flow (the streaks quicken and spread as they
// near, by the bass clock) mirroring the bridge upside down below the waterline. Three goats cross it in order,
// small, middle and big, each a bell at the throat that swings and rings on the hats; the bigger the goat the slower
// its stride and the longer, so they keep together, their legs keeping step with the road under them. A snare pops
// the troll up from under the arch (a spring: he rises over the parapet and sinks back); a kick knocks grit off the
// arch into the water. The kind is the weather: a meadow day, mist over the water, a sunset. A drop: the big goat
// lowers its horns and charges, the troll goes over on a parabola into the river with a splash, floats off toward
// us; then he swims back up under the arch and the goats come round again.
const WEATHER_W = { meadow: [2, 2, 1], misty: [3, 1, 1], sunset: [1, 2, 3] };
const GOATS = [{ sz: 0.07, steps: 2, col: LMID }, { sz: 0.1, steps: 1.5, col: BRIGHT }, { sz: 0.14, steps: 1, col: FIG }];
const trollbridge = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, WEATHER_W, bandOf(W.a)), goats: GOATS.map((g, i) => ({ x: -0.15 - i * 0.3, ph: 0, bell: { a: 0, w: 0 }, lit: 0 })), tr: { st: 'hide', pop: { x: 0, v: 0 }, x: 0.5, y: 0, vx: 0, vy: 0, ang: 0, t: 0 }, butt: false, grit: [], plops: [], splash: [], rings: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), B = bps(f), wl = 0.72 * N, kind = w.kind, T = w.tr;
    if (f.section === 'change') w.kind = rollW(rnd, WEATHER_W, band);
    if (f.section === 'drop' && !w.butt && T.st === 'hide') w.butt = true;
    const deck = (x) => (x < 0.18 || x > 0.82 ? 0.6 : 0.6 - 0.07 * Math.sin((Math.PI * (x - 0.18)) / 0.64)) * N; // the road over the hump
    const arch = (x) => { const q = (x - 0.5 * N) / (0.2 * N); return wl - 0.1 * N * Math.sqrt(Math.max(0, 1 - q * q)); }; // the underside of the arch
    let hat = 0;
    for (const hh of hits) {
      if (hh.kind === 'snare' && T.st === 'hide') T.pop.v += 9 * hh.strength;
      else if (hh.kind === 'hat') hat = hh.strength;
      else if (isLow(hh)) for (let k = 0; k < 3; k++) { const x = (0.34 + rnd() * 0.32) * N; w.grit.push({ x, y: arch(x), vx: 0, vy: 0, life: 2, s: u, c: DARK + DIM }); } // off the underside of the arch
    }
    // the sky, the far hills, the banks
    if (kind === 'sunset') { r.rect(0, 0.3 * N, N, 0.3 * N, HOT + DIM); r.disc(0.2 * N, 0.45 * N, 0.06 * N, HOT); }
    else r.disc(0.82 * N, 0.12 * N, 0.045 * N, BRIGHT);
    for (let k = 0; k < 6; k++) r.disc((k * 0.2 + 0.05) * N, 0.62 * N, (0.12 + 0.05 * hash(k, 91)) * N, DARK + DIM);
    r.rect(0, 0.6 * N, 0.2 * N, wl - 0.6 * N, MID + DIM); r.rect(0.8 * N, 0.6 * N, 0.2 * N, wl - 0.6 * N, MID + DIM);
    // the bridge: stone courses, the arch, the far parapet; the troll's eyes glinting in its dark when he hides
    r.poly([[0.17 * N, wl], [0.17 * N, deck(0.18)], ...[0.3, 0.4, 0.5, 0.6, 0.7].map((q) => [q * N, deck(q)]), [0.83 * N, deck(0.82)], [0.83 * N, wl]], MID);
    for (let y = Math.round(0.56 * N); y < wl; y += Math.round(3 * u) || 1) for (let x = 0.17 * N + ((y / (3 * u)) & 1) * 3 * u; x < 0.83 * N; x += 6 * u) if (y > deck(x / N) + u) r.rect(x, y, mx1(u * 0.6), 3 * u, MID + DIM);
    for (let x = 0.17 * N; x < 0.83 * N; x += 1) { const top = deck(x / N); r.rect(x, top - 2 * u, 1, 2 * u, LMID + DIM); }
    for (let x = Math.round(0.3 * N); x < 0.7 * N; x++) vline(r, x, arch(x), wl, BLACK);
    if (T.st === 'hide' && T.pop.x < 0.2) for (const k of [-1, 1]) r.rect(0.5 * N + k * 1.5 * u - u * 0.5, wl - 0.05 * N, mx1(u), mx1(u), f.beat.pulse > 0.5 ? HOT : HOT + DIM);
    // the goats in order, each stepping with its own stride (its legs keep step with the road it covers, and stand
    // when it stands); a hat swings the bells (pendulums from the strap, the small goat's quicker) and rings them; on
    // a drop the big one charges the troll
    const G = w.goats;
    for (const [i, g] of G.entries()) {
      const D = GOATS[i], sz = D.sz * N, big = i === 2;
      let v = 0.4 * D.sz * B * D.steps;
      if (big && w.butt && T.st === 'block' && g.x > 0.32) v *= 2.5;
      if (big && T.st === 'block' && g.x + D.sz * 0.55 >= T.x) { T.st = 'fly'; T.vx = 0.22 * N; T.vy = -0.7 * N; T.y = wl + 0.08 * N; T.ang = 0; s.shake = Math.max(s.shake, 0.6); w.butt = false; }
      const step = T.st === 'block' && !big && g.x > 0.3 && g.x < 0.45 ? 0 : v * dt;
      g.x += step;
      g.ph += (step * Math.PI) / (0.4 * D.sz);
      if (hat) g.bell.w += (rnd() < 0.5 ? -1 : 1) * 6 * hat;
      swing(g.bell, dt, 0.14 * sz, N, 2);
      g.lit = Math.abs(g.bell.w) > 2 ? 1 : Math.max(0, g.lit - dt * 4);
      if (g.x > -0.2 && g.x < 1.2) {
        const gx = g.x * N, Q = quad(r, gx, deck(g.x), sz, D.col, g.ph, 1, u, { moving: step > 0, horns: true, head: big && w.butt && g.x > 0.3 ? 0.1 : 0.5, ears: 0.3, earLen: 0.1, muzzle: 0.2, bell: g.bell.a, bellLit: g.lit > 0.5, shadow: false });
        r.line(Q.hx + sz * 0.05, Q.hy + sz * 0.06, Q.hx + sz * 0.02, Q.hy + sz * 0.16, D.col); // the beard
        targets.push({ x: gx - sz * 0.5, y: deck(g.x) - sz * 0.8, w: sz, h: sz * 0.8 });
      }
    }
    if (G[2].x > 1.25 && T.st === 'hide') G.forEach((g, i) => { g.x = -0.15 - i * 0.3; });
    // the troll in front of the arch, standing in the water (drawn before the reflection, so the water mirrors him
    // too): popping up on a spring, or blocking the big goat on a drop
    spring(T.pop, dt, 30, 4);
    if (T.st === 'hide' && w.butt && G[2].x > 0.2 && G[2].x < 0.4) T.st = 'block';
    const lvl = T.st === 'block' ? 1 : clamp(T.pop.x), th = 0.34 * N;
    if (T.st === 'hide' || T.st === 'block') { if (lvl > 0.05) troll(r, 0.5 * N, wl + 0.08 * N + (1 - lvl) * th * 0.9, th, 0, u, lvl > 0.6 ? 1 : 0, wl); T.x = 0.5; }
    // the reflection: the rows above the waterline mirrored below it, dimmed, rippled by the flow
    const buf = r.buf, rh = Math.min(N - wl, 0.2 * N), wli = Math.round(wl), wc = kind === 'misty' ? LMID + DIM : COOL + DIM;
    for (let y = wli; y < wli + rh && y < N; y++) {
      const sy = 2 * wli - y - 1, dx = Math.round(Math.sin(y * 0.7 + f.rel.bassClock * 4) * u * (0.5 + (y - wl) / rh)), row = y * N, srow = sy * N;
      if (sy < 0) continue;
      for (let x = 0; x < N; x++) { const c = buf[srow + Math.min(N - 1, Math.max(0, x + dx))]; buf[row + x] = c === BG || (x + y) & 1 ? wc : dim(c); }
    }
    if (wli + rh < N) r.rect(0, wli + rh, N, N - wli - rh, COOL + DIM);
    // the flow toward us: streaks born at the arch, quickening and lengthening as they near
    for (let k = 0; k < 30; k++) { const p = (hash(k, 92) + f.rel.bassClock * 0.08) % 1, y = wl + (N - wl) * p * p, x = (0.15 + 0.7 * hash(k, 93)) * N + (hash(k, 94) - 0.5) * p * 0.6 * N, l = (1 + 6 * p) * u; r.rect(x - l / 2, y, l, mx1(u * 0.6), LMID + DIM); }
    if (kind === 'misty') for (let k = 0; k < 4; k++) { const y = wl - 0.02 * N + k * 0.05 * N, x = ((f.rel.midClock * 0.02 * (k + 1) + hash(k, 95)) % 1.4 - 0.2) * N; checker(r, x, y, 0.4 * N, 0.025 * N, LMID, BG); }
    w.grit = drops(W, w.grit, wl, DARK + DIM, w.plops).slice(-30);
    w.plops = plopRings(W, w.plops, LMID, 0.3, 0.1);
    // the troll butted over in a parabola, into the river with a splash, floating off toward us, swimming back up
    if (T.st === 'fly') {
      T.vy += GR * N * dt; T.x += (T.vx * dt) / N; T.y += T.vy * dt; T.ang += 5 * dt;
      troll(r, T.x * N, T.y, th, T.ang, u, 1, N);
      if (T.y > 0.8 * N && T.vy > 0) { T.st = 'float'; T.t = 0; for (let k = 0; k < 16; k++) w.splash.push({ x: T.x * N, y: 0.8 * N, vx: (rnd() - 0.5) * 0.4 * N, vy: -(0.2 + 0.4 * rnd()) * N, life: 2, s: u, c: BRIGHT }); for (let k = 0; k < 3; k++) w.rings.push({ x: T.x * N, y: 0.8 * N, t: -k * 0.15 }); }
    } else if (T.st === 'float') { // carried toward us with the flow, nearer and so lower and bigger, bobbing
      T.t += dt; const q = T.t / 4, y = lerp(0.8, 1.15, q * q) * N;
      troll(r, T.x * N, y + Math.sin(t * 5) * u, th * (1 + q * 0.6), 0.2 * Math.sin(t * 2), u, 0, y - th * 0.05);
      if (q >= 1) { T.st = 'back'; T.t = 0; }
    } else if (T.st === 'back') { // swimming back up under the arch: farther, so higher and smaller
      T.t += dt; const q = Math.min(1, T.t / 5), y = lerp(N, wl + 0.02 * N, q), x = lerp(T.x, 0.5, q) * N;
      r.disc(x, y, 0.03 * N * (1.4 - 0.6 * q), MID); r.rect(x - 0.03 * N, y + u, 0.06 * N, u, LMID + DIM);
      if (q >= 1) { T.st = 'hide'; T.pop.x = T.pop.v = 0; }
    }
    if (T.st !== 'hide' || lvl > 0.2) targets.push({ x: T.x * N - th * 0.3, y: wl - th * 0.6, w: th * 0.6, h: th * 0.6 });
    w.splash = drops(W, w.splash, 0.8 * N, BRIGHT).slice(-60);
    w.rings = w.rings.filter((q) => { q.t += dt; if (q.t > 0) circ(r, q.x, q.y, q.t * 0.25 * N, BRIGHT, 0.3); return q.t < 0.8; });
  },
};
// the troll `h` tall, his feet at (x, base), turned `ang` about his middle: a lumpy head, a big nose, tusks, a hair
// tuft, the arms up when `up`; whatever is below `cut` (the water) is not drawn
function troll(r, x, base, h, ang, u, up, cut) {
  const P = turn(x, base - h * 0.5, ang), q = (dx, dy) => P(dx * h, dy * h + h * 0.5), clip = (p) => [p[0], Math.min(p[1], cut)];
  const body = [q(-0.2, -0.05), q(0.2, -0.05), q(0.24, -0.55), q(-0.24, -0.55)].map(clip);
  r.poly(body, MID);
  for (const k of [-1, 1]) { const sh = q(k * 0.22, -0.52), hd = up ? q(k * 0.38, -0.85) : q(k * 0.34, -0.2); if (hd[1] < cut || sh[1] < cut) r.stroke(sh[0], sh[1], hd[0], Math.min(hd[1], cut), mx1(h * 0.08), MID); if (hd[1] < cut) r.disc(hd[0], hd[1], mx1(h * 0.05), MID); }
  const hc = q(0, -0.72);
  if (hc[1] - h * 0.16 < cut) {
    r.disc(hc[0], hc[1], h * 0.17, MID);
    const nz = q(0.02, -0.68); r.disc(nz[0], nz[1], h * 0.07, LMID + DIM);
    for (const k of [-0.07, 0.07]) { const e = q(k, -0.77); r.rect(e[0] - u * 0.5, e[1] - u * 0.5, mx1(u * 1.2), mx1(u * 1.2), HOT); }
    for (const k of [-0.08, 0.08]) { const a = q(k, -0.6), b = q(k * 1.1, -0.66); r.line(a[0], a[1], b[0], b[1], WHITE); }
    const tf = q(0, -0.88), tf2 = q(0.06, -0.97); r.stroke(tf[0], tf[1], tf2[0], tf2[1], mx1(u * 1.5), DARK);
  }
}

// ---------------------------------------------------------------------------------------------- frogprince
// A pond seen from its bank, the pads smaller the farther off they float (size by the distance below the horizon).
// The frog hops pad to pad a hop a beat, each a parabola under the common gravity that lands before the next beat;
// the pad dips under him on its spring and sends a ripple out; his throat puffs on the beat. A kick is the golden
// ball tossed from the bank: it splashes in, sinks out of sight and its bubbles come up and pop. The princess sits
// on the bank and sighs on the snares; dragonflies dart to a new spot on the hats and hover. The kind is the hour:
// morning mist, noon, dusk. A drop is the kiss: he hops to her side, a flash, and there stands a prince; the next
// drop makes him a frog again, and back to the pads he goes.
const POND_W = { mist: [3, 2, 1], noon: [1, 2, 3], dusk: [2, 1, 2] };
const PADS = [[0.42, 0.6], [0.62, 0.56], [0.82, 0.62], [0.55, 0.71], [0.78, 0.79], [0.42, 0.86], [0.64, 0.92]];
const frogprince = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, POND_W, bandOf(W.a)), pad: 0, hop: null, st: 'frog', t: 0, flash: 0, dips: PADS.map(() => ({ x: 0, v: 0 })), rings: [], ball: null, bubs: [], splash: [], plops: [], sigh: 0, puffs: [],
      flies: [0, 1, 2].map(() => ({ x: 0.3 + rnd() * 0.6, y: 0.3 + rnd() * 0.3, tx: 0.5, ty: 0.4 })), croak: 0 });
    for (const d of w.flies) { d.tx = d.x; d.ty = d.y; }
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.42 * N, kind = w.kind, B = bps(f), sc = (y) => clamp((y - hz) / (0.5 * N), 0.15, 1.2);
    if (f.section === 'change') w.kind = rollW(rnd, POND_W, band);
    const bank = [0.29 * N, 0.645 * N]; // where he sits by her on the bank
    if (f.section === 'drop' && w.flash <= 0) { if (w.st === 'frog') w.kissReq = true; else if (w.st === 'prince') { w.flash = 0.5; w.st = 'unkiss'; } }
    if (w.kissReq && w.st === 'frog') { // the kiss: as soon as he is down, a hop to her side
      if (!w.hop) { w.kissReq = false; const [x0, y0] = w.pos || [PADS[w.pad][0] * N, PADS[w.pad][1] * N]; w.hop = { x0, y0, x1: bank[0], y1: bank[1], T: 0.6, t: 0, to: -1 }; w.st = 'tobank'; }
    }
    let kick = 0;
    for (const hh of hits) {
      if (isLow(hh)) kick = Math.max(kick, hh.strength);
      else if (hh.kind === 'snare') w.sigh = 1;
      else if (hh.kind === 'hat') for (const d of w.flies) if (rnd() < 0.6) { d.tx = clamp(d.x + (rnd() - 0.5) * 0.3, 0.3, 0.95); d.ty = clamp(d.y + (rnd() - 0.5) * 0.2, 0.2, 0.62); }
    }
    // the sky for the hour, the far trees, the far bank, the water with its shimmer drifting on the bass
    if (kind === 'dusk') { r.rect(0, 0.25 * N, N, hz - 0.25 * N, HOT + DIM); r.disc(0.7 * N, hz, 0.06 * N, HOT); }
    else r.disc(0.85 * N, 0.12 * N, 0.045 * N, BRIGHT);
    for (let k = 0; k < 9; k++) r.disc((k * 0.12 + 0.03) * N, hz - 0.02 * N, (0.06 + 0.03 * hash(k, 101)) * N, DARK + DIM);
    r.rect(0, hz, N, 0.06 * N, MID + DIM);
    r.rect(0, 0.48 * N, N, N - 0.48 * N, COOL + DIM);
    for (let k = 0; k < 26; k++) { const y = 0.5 * N + hash(k, 102) * 0.5 * N, l = (2 + 6 * sc(y)) * u, x = ((hash(k, 103) + f.rel.bassClock * 0.01 * sc(y)) % 1) * N; r.rect(x, y, l, mx1(u * 0.5), LMID + DIM); }
    for (let k = 0; k < 14; k++) { const x = (0.32 + k * 0.05) * N, sw = Math.sin(f.rel.midClock + k) * 1.5 * u; r.line(x, hz + 0.05 * N, x + sw, hz + 0.01 * N - hash(k, 104) * 0.03 * N, MID); } // reeds
    if (kind === 'mist') for (let k = 0; k < 3; k++) checker(r, ((f.rel.midClock * 0.02 * (k + 1) + hash(k, 105)) % 1.4 - 0.3) * N, (0.46 + k * 0.05) * N, 0.45 * N, 0.025 * N, LMID, BG);
    // the near bank on the left, the princess sitting on it; a snare is a sigh (the shoulders lift, a breath goes up)
    r.poly([[0, 0.5 * N], [0.3 * N, 0.5 * N], [0.34 * N, 0.66 * N], [0.22 * N, 0.72 * N], [0, 0.76 * N]], MID + DIM);
    for (let k = 0; k < 8; k++) r.line((0.02 + k * 0.035) * N, 0.6 * N + k * 0.008 * N, (0.025 + k * 0.035) * N, 0.58 * N + k * 0.008 * N, MID);
    w.sigh = Math.max(0, w.sigh - dt * 1.2);
    const kiss = w.st === 'kiss' ? Math.sin(Math.PI * clamp(w.t / 0.5)) : 0, sigh = Math.sin(Math.PI * w.sigh);
    const Pr = princess(r, 0.17 * N, 0.645 * N, 0.22 * N, 1, u, { sit: true, sigh, wave: kiss * 1.2, gown: DARK });
    if (w.sigh > 0.9 && w.sigh - dt * 1.2 <= 0.9) w.puffs.push(puff(Pr.sx + 0.03 * N, Pr.hy, 0.02 * N, -0.04 * N, 1.5));
    w.puffs = smoke(W, w.puffs, 0, LMID, BG).slice(-10);
    targets.push({ x: 0.17 * N - 0.06 * N, y: 0.645 * N - 0.2 * N, w: 0.12 * N, h: 0.2 * N });
    // the golden ball: tossed from her hand on a kick, a parabola into the pond (over a ground track from under her
    // hand to where it comes down, its height foreshortened with the distance like everything on the pond), a
    // splash; it sinks, fading with the depth, and its bubbles rise to the top (slower on screen the farther) and pop
    if (kick && (!w.ball || w.ball.st === 'sink')) { const x1 = (0.45 + rnd() * 0.4) * N, y1 = (0.6 + rnd() * 0.25) * N, x0 = Pr.sx + 0.03 * N, g0 = 0.645 * N; w.ball = { st: 'fly', x0, g0, h0: (g0 - Pr.sy) / sc(g0), x1, y1, x: x0, y: Pr.sy, T: 0.7, t: 0 }; }
    const Ba = w.ball;
    if (Ba) {
      if (Ba.st === 'fly') {
        const q = Math.min((Ba.t += dt), Ba.T), e = q / Ba.T, gq = lerp(Ba.g0, Ba.y1, e), br = mx1(0.014 * N * sc(gq));
        Ba.x = lerp(Ba.x0, Ba.x1, e); Ba.y = gq - sc(gq) * (Ba.h0 * (1 - e) + 0.5 * GR * N * q * (Ba.T - q));
        r.disc(Ba.x, Ba.y, br, HOT); r.set(Ba.x - br * 0.4, Ba.y - br * 0.4, BRIGHT);
        if (Ba.t >= Ba.T) { Ba.st = 'sink'; Ba.y = Ba.y1; Ba.t = 0; w.rings.push({ x: Ba.x, y: Ba.y, t: 0, s: sc(Ba.y) }); for (let k = 0; k < 10; k++) w.splash.push({ x: Ba.x, y: Ba.y, vx: (rnd() - 0.5) * 0.2 * N, vy: -(0.15 + 0.3 * rnd()) * N * sc(Ba.y), life: 1.5, s: u, c: BRIGHT, fl: Ba.y }); }
      } else { const br = mx1(0.014 * N * sc(Ba.y)); Ba.t += dt; const dpt = Math.min(1, Ba.t / 2.5); if (dpt < 0.8) { r.disc(Ba.x, Ba.y + dpt * 3 * u, br * (1 - dpt * 0.4), dpt < 0.4 ? HOT + DIM : MID + DIM); } if (rnd() < dt * 6 * (1 - dpt)) w.bubs.push({ ...bubble(Ba.x + (rnd() - 0.5) * 2 * u, Ba.y + dpt * 3 * u + 3 * u, mx1(u * 0.8), rnd), top: Ba.y }); if (Ba.t > 3) w.ball = null; }
    }
    w.bubs = w.bubs.filter((b) => { b.y -= 0.03 * N * sc(b.top) * dt; if (b.pop < 0 && b.y <= b.top) b.pop = 0; if (b.pop >= 0) { b.pop += dt; circ(r, b.x, b.y, b.s * (1 + b.pop * 12), LMID, 0.4); } else circ(r, b.x, b.y, b.s, LMID); return b.pop < 0.12; }).slice(-30);
    w.splash = drops(W, w.splash, N, BRIGHT).slice(-40); // each falls back to the water where it rose
    // the pads, each on a spring: dipped when he lands and when he leaves, bobbing back; a lotus on one
    for (const [i, [px, py]] of PADS.entries()) {
      const d = w.dips[i]; spring(d, dt, 60, 4);
      const k = sc(py * N), x = px * N, y = py * N + d.x * u * 2 * k, rx = 0.09 * N * k;
      oval(r, x, y, rx, rx * 0.35, MID); oval(r, x, y - u * 0.4, rx * 0.88, rx * 0.3, LMID);
      r.poly([[x, y], [x + rx, y - rx * 0.1], [x + rx * 0.9, y + rx * 0.2]], COOL + DIM);
      if (i === 2) { for (const a of [-0.6, 0, 0.6]) r.poly([[x - rx * 0.25 + a * rx * 0.2, y - u], [x + rx * 0.25 + a * rx * 0.2, y - u], [x + a * rx * 0.5, y - rx * 0.45]], HOT); }
    }
    w.rings = w.rings.filter((q) => { q.t += dt; circ(r, q.x, q.y, q.t * 0.15 * N * q.s, LMID, 0.35); if (q.t > 0.15) circ(r, q.x, q.y, (q.t - 0.15) * 0.15 * N * q.s, LMID + DIM, 0.35); return q.t < 0.9; });
    // the frog: on the beat a hop to the next pad that lands before the next one (a parabola over the ground track
    // between them, as high as gravity lets in that time and foreshortened by the distance, like his size); the pad
    // he left and the pad he lands on both dip; on the bank, the kiss and the flash
    if (w.st === 'frog' && !w.hop && tick(w, f, dt)) {
      const to = (w.pad + 1 + Math.floor(rnd() * 2)) % PADS.length, T = Math.min(0.85 / B, 0.6);
      w.hop = { x0: PADS[w.pad][0] * N, y0: PADS[w.pad][1] * N, x1: PADS[to][0] * N, y1: PADS[to][1] * N, T, t: 0, to };
      w.dips[w.pad].v += 3;
    }
    w.croak = f.beat.pulse;
    let fx, fy, fg = 0, leap = 0; // fg: the ground under him, which sets his size (not how high he is)
    if (w.hop) {
      const H = w.hop; H.t += dt;
      const q = Math.min(H.t, H.T); fx = lerp(H.x0, H.x1, q / H.T); fg = lerp(H.y0, H.y1, q / H.T); fy = fg - sc(fg) * 0.5 * GR * N * q * (H.T - q); leap = Math.sin(Math.PI * (q / H.T));
      if (H.t >= H.T) { w.hop = null; if (H.to >= 0) { w.pad = H.to; w.dips[H.to].v += 6; w.rings.push({ x: H.x1, y: H.y1, t: 0, s: sc(H.y1) }); } else { w.st = 'kiss'; w.t = 0; } w.pos = [H.x1, H.y1]; }
    } else if (w.st === 'frog') { fx = PADS[w.pad][0] * N; fy = PADS[w.pad][1] * N + w.dips[w.pad].x * u * 2 * sc(PADS[w.pad][1] * N); w.pos = null; }
    else { fx = bank[0]; fy = bank[1]; }
    if (w.st === 'kiss' && (w.t += dt) > 0.5 && w.flash <= 0) { w.flash = 0.5; w.st = 'turning'; }
    const prince = w.st === 'prince' || (w.st === 'turning' && w.flash < 0.25) || (w.st === 'unkiss' && w.flash > 0.25);
    if (w.flash > 0) { w.flash -= dt; if (w.flash <= 0) { if (w.st === 'turning') w.st = 'prince'; else if (w.st === 'unkiss') { w.st = 'frog'; w.hop = { x0: bank[0], y0: bank[1], x1: PADS[0][0] * N, y1: PADS[0][1] * N, T: 0.6, t: 0, to: 0 }; } } }
    const fsz = 0.15 * N * sc(fg || fy);
    if (prince) {
      const ph = 0.2 * N, J = walker(r, fx, fy - hopY(f, N, 0.008 * N), ph, FIG, 0, -1, { coat: true });
      r.poly([[J.sx - ph * 0.02, J.sy], [J.sx + ph * 0.2, J.sy], [J.sx + ph * 0.24, fy - ph * 0.1], [J.sx + ph * 0.05, fy - ph * 0.15]], HOT);
      crown(r, fx, J.top + ph * 0.02, ph * 0.14, u);
      targets.push({ x: fx - ph * 0.25, y: fy - ph, w: ph * 0.5, h: ph });
    } else {
      frog(r, fx, fy, fsz * (w.st === 'turning' ? 1 + (0.5 - w.flash) : 1), w.hop ? (w.hop.x1 >= w.hop.x0 ? 1 : -1) : -1, u, leap, w.hop ? 0 : w.croak);
      targets.push({ x: fx - fsz * 0.6, y: fy - fsz * 0.6, w: fsz * 1.2, h: fsz * 0.6 });
    }
    if (w.flash > 0) { const q = 1 - Math.abs(w.flash - 0.25) / 0.25; r.disc(bank[0], bank[1] - 0.06 * N, 0.1 * N * q, WHITE); for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU + t; r.line(bank[0] + Math.cos(a) * 0.04 * N, bank[1] - 0.06 * N + Math.sin(a) * 0.04 * N, bank[0] + Math.cos(a) * 0.16 * N * q, bank[1] - 0.06 * N + Math.sin(a) * 0.16 * N * q, BRIGHT); } }
    // the dragonflies dart to where the hats send them and hover there, wings a blur
    for (const d of w.flies) {
      d.x = follow(d.x, d.tx, dt, 0.07); d.y = follow(d.y, d.ty, dt, 0.07);
      const x = d.x * N + Math.sin(t * 7 + d.tx * 9) * u * 0.5, y = d.y * N + Math.cos(t * 9 + d.ty * 7) * u * 0.5, l = 0.025 * N * sc(Math.max(hz + 0.1 * N, d.y * N + 0.15 * N)), wing = ((t * 40) | 0) % 2;
      r.line(x - l / 2, y, x + l / 2, y, COOL); r.set(x + l / 2, y, BRIGHT);
      for (const k of [-1, 1]) r.line(x, y, x - l * 0.2, y + k * l * (wing ? 0.35 : 0.2) - (wing ? l * 0.1 : 0), LMID);
    }
  },
};

const WORLDS = { ogreswamp, exiles, dragonkeep, onion, lordscastle, gingerbread, godmother, bootedcat, wolfgrandma, beanstalk, trollbridge, frogprince };
registerFamily('fairy', WORLD_DEFS, WORLDS);
export const FAIRY_STYLE = makeMixStyle('FAIRY TALE', ['fairy']);
