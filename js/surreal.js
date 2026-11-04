// Surreal tableaux, mixed. Twelve absurd dream scenes in the spirit of cut-out animation, old engravings and dream
// painting, every image an original one: a pig flying on a carpet of playing cards toward giants at the horizon, a
// bare foot stamping on a cut-out show, soft clocks draped over a desert, men in bowler hats hanging over a street,
// a garden of hybrid creatures, fish in the air of a city, a staircase that always rises, giants walking through a
// tiny town, a hut on chicken legs, an angler on the moon, an eye for a balloon, a tea party that never ends. No
// paintings or films copied, no names, no letters. Each world has a kinds table weighed by the arousal band,
// re-rolled on a section change, with a heavy turn on a drop; all of them move by one physics: gravity is mixer's
// (its particles'), light things fall at a terminal speed and flutter, soft bodies sag under it, legs plant their
// feet, smoke slows as it rises and bubbles speed up to their terminal speed, lines hang in catenaries, pendulums
// swing about their pivots, poured streams fly parabolas.
import { Raster, clamp, lerp, BAYER } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, isLow, isTonal, follow,
  wrapAngle, ease, beatLocked, hash, pickW, walker, particles, burst, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight; `themes`
// are what each one is about (meaning.js)
export const WORLD_DEFS = {
  cardpig: { name: 'the pig on the cards', va: [[H, L], [H, M], [M, L]], pals: ['dreamsky', 'engraving', 'pastel', 'candy', 'parchment'], fx: ['none', 'film', 'frame'], themes: ['dream', 'play'] },
  stompfoot: { name: 'the stamping foot', va: [[H, M], [H, H], [M, H]], pals: ['engraving', 'parchment', 'sepia', 'candy', 'pastel'], fx: ['none', 'film', 'frame', 'kaleido'], themes: ['play', 'machine'] },
  meltclocks: { name: 'the soft clocks', va: [[L, M], [H, L], [L, L]], pals: ['dreamsky', 'sepia', 'parchment', 'vapor', 'cult'], fx: ['none', 'film', 'vhs'], themes: ['dream', 'lonely'] },
  bowlerrain: { name: 'the men in bowler hats', va: [[L, M], [H, L], [L, L]], pals: ['dreamsky', 'midnight', 'inkwash', 'sepia', 'ice'], fx: ['none', 'film', 'frame'], themes: ['dream', 'paranoia', 'street'] },
  boschgarden: { name: 'the garden of delights', va: [[H, M], [H, H], [M, H]], pals: ['engraving', 'pastel', 'parchment', 'candy', 'dreamsky'], fx: ['none', 'frame', 'kaleido', 'film'], themes: ['nature', 'occult', 'love'] },
  fishsky: { name: 'fish in the sky', va: [[H, L], [H, M], [M, L]], pals: ['dreamsky', 'ice', 'vapor', 'midnight', 'pastel'], fx: ['none', 'vhs', 'kaleido', 'film'], themes: ['dream', 'nature'] },
  endlessstairs: { name: 'the endless stairs', va: [[L, M], [H, L], [L, L]], pals: ['engraving', 'inkwash', 'sepia', 'parchment', 'cult'], fx: ['none', 'film', 'kaleido'], themes: ['paranoia', 'dream', 'machine'] },
  giantwalk: { name: 'the walking giants', va: [[H, L], [H, M], [M, L]], pals: ['engraving', 'parchment', 'dreamsky', 'sepia', 'pastel'], fx: ['none', 'film', 'frame'], themes: ['dream', 'nature', 'glory'] },
  chickenhut: { name: 'the hut on hen\'s legs', va: [[L, M], [H, M]], pals: ['engraving', 'parchment', 'midnight', 'cult', 'inkwash'], fx: ['none', 'film', 'vhs', 'frame'], themes: ['occult', 'nature'] },
  moonfishing: { name: 'fishing for stars', va: [[H, L], [H, M], [M, L]], pals: ['midnight', 'dreamsky', 'cult', 'vapor', 'ice'], fx: ['none', 'film'], themes: ['night', 'dream', 'lonely'] },
  eyeballoon: { name: 'the eye balloon', va: [[L, M], [H, L], [L, L]], pals: ['dreamsky', 'midnight', 'cult', 'sepia', 'vapor'], fx: ['none', 'film', 'vhs'], themes: ['paranoia', 'dream'] },
  teaparty: { name: 'the endless tea party', va: [[H, M], [H, H], [M, H]], pals: ['candy', 'pastel', 'engraving', 'parchment', 'vapor'], fx: ['none', 'frame', 'kaleido', 'film'], themes: ['play', 'dream'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the kinds tables weigh their variants by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const GR = 1.6; // gravity, screens per second squared: what mixer's `particles` fall with, so everything falls alike
const bps = (f) => (f.bpm ? f.bpm / 60 : 2);
const mx1 = (u) => Math.max(1, u);
const dim = (c) => (c < DIM ? c + DIM : c);
// a beat tick for what goes a step per beat: the beat itself when locked, else every half second
const tick = (w, f, dt) => (beatLocked(f) ? f.beat.on : (w.tickT = (w.tickT || 0) + dt) >= 0.5 && ((w.tickT = 0), true));
// beats so far with the fraction: the beat clock when locked, else free-running at the tempo
const beatsOf = (w, f, dt) => (w.bt = beatLocked(f) ? f.beat.count + f.beat.phase : (w.bt || 0) + dt * bps(f));
// a damped spring `o` = { x: offset from rest, v }: stiffness k and damping c per second
const spring = (o, dt, k, c) => { o.v += (-k * o.x - c * o.v) * dt; o.x += o.v * dt; };
// a pendulum `p` = { a: angle from hanging straight down (+ toward +x), w: its rate } on a line `len` cells long,
// under gravity `g` (cells/s²), its pivot accelerating by (ax, ay); `damp` per second; substepped so a long frame
// cannot blow it up
function swing(p, dt, len, g, damp = 0.5, ax = 0, ay = 0) {
  const n = Math.ceil(dt / 0.02), h = dt / n;
  for (let i = 0; i < n; i++) { p.w += (-((g - ay) * Math.sin(p.a) + ax * Math.cos(p.a)) / len - damp * p.w) * h; p.a += p.w * h; }
}
// a local frame at (ox, oy) turned by `a`: a point mapper for anything that leans, banks or swings
const turn = (ox, oy, a) => { const c = Math.cos(a), s = Math.sin(a); return (dx, dy) => [ox + dx * c - dy * s, oy + dx * s + dy * c]; };
// a filled ellipse, radii rx and ry
const oval = (r, cx, cy, rx, ry, c) => { if (rx > 0.3 && ry > 0.3) r.ring(cx, cy, rx / 2, rx, c, ry / rx); };
// a thin circle (an ellipse when squashed by sy) in O(R) cells: ripples, rings, sound
function circ(r, cx, cy, R, c, sy = 1) {
  if (R < 0.6) { r.set(cx, cy, c); return; }
  const n = Math.max(8, Math.ceil(R * 7));
  for (let k = 0; k < n; k++) { const a = (k / n) * TAU; r.set(cx + Math.cos(a) * R, cy + Math.sin(a) * R * sy, c); }
}
// the knee of a two-bone limb from the hip (hx, hy) to the foot (fx, fy), bones l1 and l2: `side` -1 puts the
// knee on the +x side of a leg pointing down (a knee forward for a figure facing right), +1 on the -x side (a bird's
// heel, which points back)
function knee(hx, hy, fx, fy, l1, l2, side) {
  const dx = fx - hx, dy = fy - hy, D = Math.hypot(dx, dy) || 1e-6, d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, D));
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return [hx + (dx / D) * a - (dy / D) * h * side, hy + (dy / D) * a + (dx / D) * h * side];
}
// a band of rows y0..y1 dithered in colour `c`, its density going from d0 at the top to d1 at the bottom: a glow
// on the horizon, a sky darkening, a mist
function band(r, y0, y1, c, d0, d1) {
  const N = r.N, buf = r.buf, a = Math.max(0, Math.floor(y0)), b = Math.min(N, Math.ceil(y1)), span = Math.max(1, y1 - y0);
  for (let y = a; y < b; y++) {
    const d = d0 + ((d1 - d0) * (y - y0)) / span, row = (y & 7) << 3;
    if (d <= 0) continue;
    for (let x = 0, i = y * N; x < N; x++, i++) if (BAYER[row | (x & 7)] < d) buf[i] = c;
  }
}
// engraving: every `step`th row of a box in colour `c`, the shading lines of an old print
function hatch(r, x, y, w, h, c, step = 2) { for (let yy = Math.ceil(y); yy < y + h; yy += step) r.rect(x, yy, w, 1, c); }
// a few stars from a hash in the top `top` of the sky; `tw` (a frame counter) makes some twinkle
function stars(r, N, n, seed, top, col, tw = 0) {
  for (let k = 0; k < n; k++) r.set(hash(seed + k, 1) * N, hash(seed + k, 2) * N * top, hash(seed + k, tw) < 0.12 ? BRIGHT : col);
}
// a hop `o` = { y: height above rest (negative is up), vy }: gravity brings it down, a landing bounces a little
const hop = (o, dt, g) => { o.vy += g * dt; o.y += o.vy * dt; if (o.y >= 0) { o.y = 0; o.vy = o.vy > 0.04 * g ? -o.vy * 0.25 : 0; } };
// smoke: a puff rises ever slower (drag), its drift relaxing to the wind's, and grows and thins out as it ages
const puff = (x, y, vx, vy, life = 2.5) => ({ x, y, vx, vy, life, age: 0 });
function smoke(W, list, wind, col, col2) {
  const { r, dt, u } = W, k = Math.exp(-dt * 0.9);
  for (const p of list) {
    p.vy *= k;
    p.vx = p.vx * k + wind * (1 - k);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.age += dt;
    const sz = u * (1.2 + p.age * 1.8);
    if (p.life > 1 || hash(p.x | 0, (p.age * 15) | 0) < p.life) { oval(r, p.x, p.y, sz, sz * 0.8, col); if (sz > 3 * u) oval(r, p.x - sz * 0.25, p.y - sz * 0.25, sz * 0.45, sz * 0.35, col2); }
  }
  return list.filter((p) => p.life > 0);
}
// dust kicked up where a foot comes down: thrown out along the ground and up, slowed hard by the air (it is light),
// settling back onto the ground it rose from (y) and never through it; `k` scales it with the depth (1/z)
function kick(list, rnd, x, y, n, sp, life, k = 1) {
  for (let i = 0; i < n; i++) { const a = -0.15 - rnd() * (Math.PI - 0.3), v = sp * k * (0.35 + 0.65 * rnd()); list.push({ x, y, g: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.55, k, life: life * (0.6 + 0.4 * rnd()) }); }
}
function dust(W, list, col) {
  const { r, N, dt, u } = W, d = Math.exp(-dt * 3.5);
  for (const p of list) {
    p.vx *= d; p.vy = p.vy * d + 0.4 * GR * N * p.k * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.y >= p.g) { p.y = p.g; p.vy = 0; }
    r.rect(p.x, p.y - mx1(u), mx1(u), mx1(u), col);
  }
  return list.filter((p) => p.life > 0);
}
// a bird in flight at (x, y), `sz` across, its wings at `ph` (up at 0, down at π)
function bird(r, x, y, sz, ph, c) {
  const lift = Math.cos(ph) * sz * 0.35;
  r.line(x - sz / 2, y - lift, x, y, c);
  r.line(x, y, x + sz / 2, y - lift, c);
  r.set(x, y + 1, c);
}
// a cut-out cloud `wd` wide sitting on the line y: lumps on a flat bottom, a light catching the top
const CLOUD = [[0.2, -0.1, 0.17], [0.42, -0.2, 0.22], [0.66, -0.13, 0.18], [0.84, -0.07, 0.12]];
function cloud(r, x, y, wd, c, c2) {
  for (const [dx, dy, rr] of CLOUD) r.disc(x + dx * wd, y + dy * wd, rr * wd, c);
  r.rect(x + 0.06 * wd, y - 0.1 * wd, 0.86 * wd, 0.1 * wd, c);
  if (c2 !== undefined) r.disc(x + 0.38 * wd, y - 0.3 * wd, 0.08 * wd, c2);
}
// a line of length `len` hanging between (x1, y1) and (x2, y2) under gravity: a catenary, straight when taut
function catenary(r, x1, y1, x2, y2, len, c) {
  if (x2 < x1) { let q = x1; x1 = x2; x2 = q; q = y1; y1 = y2; y2 = q; }
  const h = x2 - x1, v = y1 - y2, chord = Math.hypot(h, v);
  if (len <= chord * 1.002 || h < 1) { r.line(x1, y1, x2, y2, c); return; }
  // 2a·sinh(h/2a) = √(len² − v²) fixes the catenary's parameter a; the rise v places its lowest point
  const target = Math.sqrt(len * len - v * v);
  let lo = h * 1e-3, hi = h * 1e4;
  for (let i = 0; i < 40; i++) { const m = Math.sqrt(lo * hi); if (2 * m * Math.sinh(h / (2 * m)) > target) lo = m; else hi = m; }
  const a = Math.sqrt(lo * hi), xm = (x1 + x2) / 2 - a * Math.atanh(v / len), c1 = Math.cosh((x1 - xm) / a);
  const n = Math.max(4, Math.min(24, Math.ceil(h / 2)));
  let px = x1, py = y1;
  for (let k = 1; k <= n; k++) {
    const x = x1 + (h * k) / n, y = y1 + a * (c1 - Math.cosh((x - xm) / a));
    r.line(px, py, x, y, c);
    px = x;
    py = y;
  }
}
// two feet of a walker `k` (0 or 1) at gait phase `ph` (a cycle is two steps): planted while the body passes over
// (it slides back at the speed of travel, so it stays put on the ground), swung forward and lifted the other half.
// Returns the foot's offset from the hips along the walk (±A) and its lift (0..1)
const STEP = [0, 0];
function step(ph, k, A) {
  let q = ph / TAU + k * 0.5;
  q -= Math.floor(q);
  if (q < 0.5) { STEP[0] = A - 4 * A * q; STEP[1] = 0; }
  else { const s = (q - 0.5) * 2; STEP[0] = -A + 2 * A * (s * s * (3 - 2 * s)); STEP[1] = Math.sin(Math.PI * s); }
  return STEP;
}

// ---------------------------------------------------------------------------------------------- cardpig
// A pig flies across a land at dusk on a carpet of playing cards, toward giants standing at the horizon: huge slow
// silhouettes, the smaller the farther, whose heads turn to follow it as it goes by; hills and clouds pass at their
// depths. The carpet's edge cards beat like wings on the beat and lift it; a snare peels a card off to flutter down
// (a terminal speed, a sway, a tumble) and fall behind; a kick brings a card flying in to fill the gap; a note
// lights a giant's eyes. The mount is the kind: the cards, an umbrella the pig hangs from (swinging when the flight
// speeds up or slows, the cards on its ribs), or a teacup with the cards fanned out behind it like a tail. A drop:
// the giants reach out, and the pig banks and dives between the legs of the one ahead and climbs back.
const MOUNT_W = { cards: [2, 3, 3], umbrella: [3, 1, 1], teacup: [1, 2, 2] };
const SLOTS = { cards: 7, umbrella: 5, teacup: 5 };
const deal = (kind, rnd, has) => Array.from({ length: SLOTS[kind] }, () => ({ has, coming: false, suit: Math.floor(rnd() * 4), sx: 0, sy: 0, ang: 0, cw: 1, ch: 1 }));

// a suit's pip `pr` cells in radius at (x, y): heart and diamond in red, spade and club in ink
function pip(r, x, y, pr, suit) {
  const c = suit < 2 ? HOT : FIG;
  if (pr < 1.6) { r.set(x, y, c); if (pr > 1.1) r.set(x, y - 1, c); return; }
  if (suit === 0) { r.disc(x - pr * 0.45, y - pr * 0.25, pr * 0.5, c); r.disc(x + pr * 0.45, y - pr * 0.25, pr * 0.5, c); r.poly([[x - pr * 0.95, y - pr * 0.1], [x + pr * 0.95, y - pr * 0.1], [x, y + pr * 0.95]], c); }
  else if (suit === 1) r.poly([[x, y - pr], [x + pr * 0.7, y], [x, y + pr], [x - pr * 0.7, y]], c);
  else if (suit === 2) { r.disc(x - pr * 0.45, y + pr * 0.2, pr * 0.48, c); r.disc(x + pr * 0.45, y + pr * 0.2, pr * 0.48, c); r.poly([[x - pr * 0.93, y + pr * 0.1], [x + pr * 0.93, y + pr * 0.1], [x, y - pr]], c); r.rect(x - 0.5, y + pr * 0.3, 1, pr * 0.7, c); }
  else { for (const [dx, dy] of [[0, -0.45], [-0.45, 0.1], [0.45, 0.1]]) r.disc(x + dx * pr, y + dy * pr, pr * 0.38, c); r.rect(x - 0.5, y + pr * 0.2, 1, pr * 0.8, c); }
}
// a playing card centred at (x, y), `cw` by `ch` cells, turned by `ang`; `vis` is how much of the face shows as it
// tumbles (the cosine of its flip: below zero its back shows, red): a white face, an ink edge, the pip in the middle
function card(r, x, y, cw, ch, ang, vis, suit) {
  const hw = (cw / 2) * Math.max(0.15, Math.abs(vis)), hh = ch / 2, c = Math.cos(ang), s = Math.sin(ang);
  const P = (dx, dy) => [x + dx * c - dy * s, y + dx * s + dy * c];
  const a = P(-hw, -hh), b = P(hw, -hh), d = P(hw, hh), e = P(-hw, hh);
  r.poly([a, b, d, e], vis >= 0 ? BRIGHT : HOT);
  r.line(a[0], a[1], b[0], b[1], FIG); r.line(b[0], b[1], d[0], d[1], FIG); r.line(d[0], d[1], e[0], e[1], FIG); r.line(e[0], e[1], a[0], a[1], FIG);
  if (vis > 0.45) pip(r, x, y, Math.min(hw, hh) * 0.75, suit);
}
// a pig `sz` across the body, sitting on (x, y) facing right and turned by `ang`: an ink outline, the body, the head
// with its snout and an ear, a curl of a tail; `dangle` lets the legs hang
const PIG = [[-0.32, -0.42, 0.4], [0.15, -0.45, 0.42], [0.62, -0.74, 0.3]];
function pig(r, x, y, sz, ang, u, dangle) {
  const P = turn(x, y, ang), o = mx1(u * 0.7), lw = mx1(sz * 0.12);
  for (const [hx, kx, ky] of [[-0.36, -0.4, 0.18], [-0.2, -0.16, 0.2], [0.22, 0.28, 0.18], [0.36, 0.44, 0.2]]) {
    const a = P(hx * sz, -0.15 * sz), b = P(kx * sz, (dangle ? ky : 0.02) * sz);
    r.stroke(a[0], a[1], b[0], b[1], lw, FIG);
  }
  for (const [dx, dy, rr] of PIG) { const [px, py] = P(dx * sz, dy * sz); r.disc(px, py, rr * sz + o, FIG); }
  const sn = P(0.92 * sz, -0.68 * sz);
  r.disc(sn[0], sn[1], 0.13 * sz + o, FIG);
  for (const [dx, dy, rr] of PIG) { const [px, py] = P(dx * sz, dy * sz); r.disc(px, py, rr * sz, LMID); }
  r.disc(sn[0], sn[1], 0.13 * sz, LMID);
  const n1 = P(0.96 * sz, -0.72 * sz), n2 = P(0.96 * sz, -0.62 * sz), ey = P(0.7 * sz, -0.86 * sz);
  r.set(n1[0], n1[1], FIG); r.set(n2[0], n2[1], FIG); r.rect(ey[0] - 0.5, ey[1] - 0.5, mx1(u * 0.9), mx1(u * 0.9), FIG);
  r.poly([P(0.42 * sz, -0.9 * sz), P(0.62 * sz, -0.98 * sz), P(0.44 * sz, -1.22 * sz)], HOT); // the ear
  const tl = P(-0.78 * sz, -0.58 * sz);
  circ(r, tl[0], tl[1], mx1(0.09 * sz), FIG);
  return P;
}
// a giant standing on (x, base), `h` tall, in profile facing left in a long coat: the head turned by g.yaw (-1
// looking left, 0 at us, 1 right), a hat by g.hat, the eyes lit by g.eye, the arms hanging or reaching toward
// (tx, ty) by g.reach. `part` 1 draws all but the near leg, 2 the near leg alone (so a pig can pass between them)
function giant(r, x, base, h, col, g, tx, ty, part) {
  const lw = mx1(h * 0.045), hip = base - h * 0.47, sh = base - h * 0.81, far = dim(col);
  if (part & 1) {
    r.stroke(x - h * 0.01, hip, x - h * 0.07, base, lw, far); // the far leg, a little ahead
    const aim = Math.atan2(ty - sh, tx - x);
    const fa = Math.PI / 2 + 0.1 + wrapAngle(aim - Math.PI / 2 - 0.1) * g.reach * 0.7;
    r.stroke(x + h * 0.03, sh, x + h * 0.03 + Math.cos(fa) * h * 0.37, sh + Math.sin(fa) * h * 0.37, lw, far);
    r.poly([[x - h * 0.07, sh - h * 0.03], [x + h * 0.07, sh - h * 0.03], [x + h * 0.12, base - h * 0.4], [x - h * 0.14, base - h * 0.4]], col);
    r.rect(x - h * 0.02, sh - h * 0.07, h * 0.04, h * 0.06, col);
    const hy = base - h * 0.91, hr = h * 0.06, yaw = g.yaw;
    r.disc(x, hy, hr, col);
    if (g.hat === 1) r.poly([[x - hr * 1.1, hy - hr * 0.4], [x + hr * 1.1, hy - hr * 0.4], [x + hr * 0.15, hy - hr * 3.2]], col);
    else if (g.hat === 2) { r.rect(x - hr * 1.9, hy - hr * 0.75, hr * 3.8, mx1(hr * 0.3), col); r.rect(x - hr * 0.85, hy - hr * 1.7, hr * 1.7, hr * 1.05, col); }
    // the face turned by yaw: the nose out on the side it looks to, the eyes coming round with it
    r.poly([[x + yaw * hr * 0.75, hy - hr * 0.25], [x + yaw * hr * (0.75 + 0.55 * Math.abs(yaw)), hy + hr * 0.3], [x + yaw * hr * 0.7, hy + hr * 0.38]], col);
    const ec = g.eye > 0.1 ? COOL : dim(LMID), es = mx1(hr * (0.22 + 0.15 * g.eye)), spread = (1 - Math.abs(yaw)) * hr * 0.42, ex = x + yaw * hr * 0.42;
    r.rect(ex - spread - es / 2, hy - hr * 0.22, es, es, ec);
    if (spread > es) r.rect(ex + spread - es / 2, hy - hr * 0.22, es, es, ec);
    const na = Math.PI / 2 + 0.05 + wrapAngle(aim - Math.PI / 2 - 0.05) * g.reach;
    const hx = x - h * 0.03 + Math.cos(na) * h * 0.4, hy2 = sh + Math.sin(na) * h * 0.4;
    r.stroke(x - h * 0.03, sh, hx, hy2, lw, col);
    r.disc(hx, hy2, lw * 0.9, col);
  }
  if (part & 2) r.stroke(x + h * 0.02, hip, x + h * 0.05, base, lw, col); // the near leg
}

const cardpig = {
  init(W) {
    const { w, rnd, N } = W, kind = rollW(rnd, MOUNT_W, bandOf(W.a));
    Object.assign(w, { N, kind, camX: 0, v: 0.12 * N, slots: deal(kind, rnd, true), loose: [], incoming: [], poof: [], alt: { x: 0, v: 0 }, sw: { a: 0, w: 0 },
      bank: 0, dive: -1, want: 0, tg: null, lastY: 0.42 * N, pz: 1.6, side: 1, callT: 0,
      giants: [[0.2, 6.5], [0.66, 4.6], [1.08, 8]].map(([x, z]) => ({ X: (x - 0.5) * N * z, z, Hw: N * (2.3 + 0.5 * rnd()), hat: Math.floor(rnd() * 3), yaw: -1, eye: 0, reach: 0 })),
      clouds: Array.from({ length: 5 }, (_, i) => { const z = 6 + rnd() * 8; return { X: (i * 0.28 - 0.45) * N * z, z, y: 0.12 + rnd() * 0.24, w: 0.14 + rnd() * 0.12 }; }) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W;
    if (w.N !== N) cardpig.init(W);
    const band0 = bandOf(W.a), hz = 0.6 * N, G = 0.5 * N, cx = 0.5 * N, pulse = f.beat.pulse;
    // depth z: one cell on screen is z cells out there; the ground at depth z lies at hz + G/z
    const PX = (X, z) => cx + (X - w.camX) / z, PY = (A, z) => hz + (G - A) / z;
    const peel = (all) => { // the outermost cards go first, a side at a time
      const n = w.slots.length, mid = (n - 1) / 2;
      w.side = -w.side;
      for (let pass = 0; pass < n; pass++) {
        let best = -1;
        for (let i = 0; i < n; i++) if (w.slots[i].has && (best < 0 || (i - mid) * w.side > (best - mid) * w.side)) best = i;
        if (best < 0) return;
        const sl = w.slots[best], k0 = 1.6 / w.pz;
        sl.has = false;
        w.loose.push({ X: w.camX + (sl.sx - cx) * w.pz, A: G - (sl.sy - hz) * w.pz, z: w.pz, vX: w.v, vA: 0.08 * N, ph: rnd() * TAU, spin: 0, ang: sl.ang, cw: sl.cw / k0, ch: sl.ch / k0, suit: sl.suit, life: 8 });
        if (!all) return;
      }
    };
    const call = () => { const sl = w.slots.find((q) => !q.has && !q.coming); if (!sl) return; sl.coming = true; w.incoming.push({ sl, x: -0.06 * N, y: (0.06 + 0.3 * rnd()) * N, vx: 0.5 * N, vy: 0.1 * N, spin: rnd() * TAU, age: 0 }); };
    if (f.section === 'change') {
      const k = rollW(rnd, MOUNT_W, band0);
      if (k !== w.kind) { peel(true); w.kind = k; w.slots = deal(k, rnd, false); w.incoming.length = 0; burst(w.poof, rnd, 0.33 * N, 0.36 * N, 18, 0.35 * N, BRIGHT, 0.5); }
    }
    if (f.section === 'drop') w.want = 4;
    const v0 = w.v;
    w.v = follow(w.v, N * (0.08 + 0.2 * clamp(f.rel.bassDrive)), dt, 1.2);
    const acc = (w.v - v0) / Math.max(dt, 1e-3);
    w.camX += w.v * dt;
    for (const h of hits) {
      if (isLow(h)) { call(); w.alt.v += 0.1 * N * h.strength; }
      else if (h.kind === 'snare') peel(false);
      if (isTonal(h)) w.giants[h.pc % w.giants.length].eye = 1;
    }
    if ((w.callT += dt) > 0.3 && w.slots.every((q) => !q.has)) { w.callT = 0; call(); } // a bare mount deals itself a card at a time
    if (tick(w, f, dt)) w.alt.v -= 0.22 * N; // the wingbeat lifts
    spring(w.alt, dt, 16, 4.5);
    // the giants: off the left edge they come round again ahead, at a new depth
    for (const g of w.giants) {
      if (PX(g.X, g.z) < -0.25 * N && g !== w.tg) { g.z = 4 + rnd() * 4.5; g.Hw = N * (2.3 + 0.5 * rnd()); g.hat = Math.floor(rnd() * 3); g.X = w.camX + (1.15 * N + rnd() * 0.35 * N - cx) * g.z; g.yaw = -1; }
      g.eye = Math.max(0, g.eye - dt * 1.5);
      g.reach = follow(g.reach, w.dive >= 0 || w.want > 0 ? 1 : 0, dt, 0.35);
    }
    w.giants.sort((a, b) => b.z - a.z);
    if (w.want > 0) {
      w.want -= dt;
      if (w.dive < 0) {
        w.tg = null;
        for (const g of w.giants) { const gx = PX(g.X, g.z); if (gx > 0.5 * N && gx < 0.92 * N && (!w.tg || g.z < w.tg.z)) w.tg = g; }
        if (w.tg) { w.dive = 0; w.want = 0; }
      }
    }
    if (w.dive >= 0 && (w.dive += dt / 3.2) >= 1) { w.dive = -1; w.tg = null; }
    // the pig: cruising at depth 1.6, or on the dive out to the giant's depth and under its coat between its legs
    const yN = 0.42 * N + w.alt.x + Math.sin(f.rel.midClock * 1.7) * 1.5 * u;
    let pz = 1.6, pX = w.camX + (0.3 * N - cx) * 1.6, pA = G - (yN - hz) * 1.6;
    if (w.dive >= 0) { const q = w.dive, e = Math.sin(Math.PI * q) ** 2, g = w.tg; pz = lerp(pz, g.z, e); pX = lerp(pX, g.X + (q - 0.5) * 0.6 * g.Hw, e); pA = lerp(pA, 0.13 * g.Hw, e); }
    w.pz = pz;
    const px = PX(pX, pz), py = PY(pA, pz), k = 1.6 / pz, K = k * N;
    w.bank = follow(w.bank, clamp((py - w.lastY) / Math.max(dt, 1e-3) / (0.6 * N), -0.6, 0.6), dt, 0.12);
    w.lastY = py;
    for (const g of w.giants) g.yaw = follow(g.yaw, clamp((px - PX(g.X, g.z)) / (0.3 * N), -1, 1), dt, 0.8);

    // the sky at dusk, the sun on the horizon, the clouds
    band(r, 0.28 * N, hz, LMID, 0, 0.6);
    band(r, hz - 0.035 * N, hz, HOT, 0, 0.2);
    r.disc(0.72 * N, hz + 0.01 * N, 0.075 * N, HOT);
    r.disc(0.735 * N, hz - 0.005 * N, 0.03 * N, BRIGHT);
    for (const c of w.clouds) {
      c.X -= dt * N * 0.015 * (1 + f.rel.midDrive) * c.z;
      if (PX(c.X, c.z) < -c.w * N) { c.z = 6 + rnd() * 8; c.X = w.camX + (1.05 * N + rnd() * 0.3 * N - cx) * c.z; c.y = 0.12 + rnd() * 0.24; }
      cloud(r, PX(c.X, c.z), c.y * N, c.w * N, LMID, BRIGHT);
    }
    // the land: a layer of hills at depth z rolls by at 1/z of the flight
    const hills = (z, amp, len, p, col, hc = -1) => {
      const g = hz + G / z, off = w.camX / z, buf = r.buf;
      for (let x = 0; x < N; x++) {
        const q = (off + x) / len, top = g - amp * (0.55 + 0.3 * Math.sin(q + p) + 0.15 * Math.sin(q * 2.7 + p * 2.3));
        r.rect(x, top, 1, N, col);
        if (hc >= 0) for (let y = Math.max(0, Math.ceil(top / 3) * 3); y < N; y += 3) buf[y * N + x] = hc; // engraved furrows
      }
    };
    hills(10, 0.07 * N, 0.07 * N, 1, MID);
    // the giants far to near; the pig among them in its depth, between the near and the far leg of the one it
    // dives under
    const drawPig = () => {
      if (w.kind === 'cards') {
        const P = turn(px, py, w.bank), n = w.slots.length, mid = (n - 1) / 2;
        for (let i = 0; i < n; i++) {
          const d = i - mid, ad = Math.abs(d), wing = Math.max(0, ad - 1) / Math.max(1, mid - 1);
          const [sx, sy] = P(d * 0.034 * K, (0.012 - 0.004 * ad - wing * pulse * 0.03) * K), sl = w.slots[i];
          sl.sx = sx; sl.sy = sy; sl.ang = w.bank - Math.sign(d) * wing * (0.15 + 0.7 * pulse); sl.cw = 0.046 * K; sl.ch = 0.028 * K;
          if (sl.has) card(r, sx, sy, sl.cw, sl.ch, sl.ang, 1, sl.suit);
        }
        pig(r, px, py, 0.07 * K, w.bank, u, false);
      } else if (w.kind === 'umbrella') {
        // the pig hangs from the handle: a pendulum that lags when the flight speeds up, and the canopy beats on
        // the beat like a jellyfish
        swing(w.sw, dt, 0.09 * K, GR * N * k, 1.1, acc / pz);
        const P = turn(px, py, w.bank), rx = 0.095 * (1 - 0.12 * pulse), ry = 0.06 * (1 + 0.25 * pulse), cyl = -0.2, pts = [];
        for (let j = 0; j <= 8; j++) { const a = Math.PI + (j / 8) * Math.PI; pts.push(P(Math.cos(a) * rx * K, (cyl + Math.sin(a) * ry) * K)); }
        for (let j = 4; j >= 0; j--) { const lx = rx * (j / 2 - 1); pts.push(P(lx * K, cyl * K)); if (j) pts.push(P((lx - rx * 0.25) * K, (cyl + 0.014) * K)); }
        const top = P(0, (cyl - ry - 0.02) * K), grip = P(0, -0.1 * K);
        r.stroke(top[0], top[1], grip[0], grip[1], mx1(u), FIG);
        r.poly(pts, HOT);
        for (let j = 0; j <= 4; j++) { const tp = P(rx * (j / 2 - 1) * K, cyl * K), tt = P(0, (cyl - ry) * K); r.line(tt[0], tt[1], tp[0], tp[1], dim(HOT)); }
        for (let j = 0; j < 5; j++) {
          const tp = P(rx * (j / 2 - 1) * K, cyl * K), sl = w.slots[j], sa = w.bank + w.sw.a * 0.5 + Math.sin(t * 2.5 + j) * 0.08;
          sl.sx = tp[0] - Math.sin(sa) * 0.05 * K; sl.sy = tp[1] + Math.cos(sa) * 0.05 * K; sl.ang = sa; sl.cw = 0.026 * K; sl.ch = 0.036 * K;
          if (sl.has) { r.line(tp[0], tp[1], sl.sx, sl.sy - 0.018 * K, FIG); card(r, sl.sx, sl.sy, sl.cw, sl.ch, sl.ang, 1, sl.suit); }
        }
        const sa = w.bank + w.sw.a, Q = turn(grip[0], grip[1], sa), seat = Q(-0.01 * K, 0.1 * K);
        const PP = pig(r, seat[0], seat[1], 0.06 * K, sa, u, true), arm = PP(0.3 * 0.06 * K, -0.7 * 0.06 * K);
        r.stroke(arm[0], arm[1], grip[0], grip[1], mx1(0.8 * u), FIG);
        circ(r, grip[0] + 0.012 * K, grip[1], 0.012 * K, FIG);
      } else {
        // the teacup on its saucer, the cards fanned behind it opening on the beat
        const P = turn(px, py, w.bank);
        for (let j = 0; j < 5; j++) {
          const a = -2.6 + (j - 2) * 0.24 * (1 + 0.6 * pulse), c0 = P(-0.06 * K + Math.cos(a) * 0.05 * K, -0.03 * K + Math.sin(a) * 0.05 * K), sl = w.slots[j];
          sl.sx = c0[0]; sl.sy = c0[1]; sl.ang = w.bank + a + Math.PI / 2; sl.cw = 0.028 * K; sl.ch = 0.05 * K;
          if (sl.has) card(r, sl.sx, sl.sy, sl.cw, sl.ch, sl.ang, 1, sl.suit);
        }
        const sc = P(0, 0.004 * K);
        oval(r, sc[0], sc[1], 0.085 * K, mx1(0.012 * K), LMID);
        const seat = P(-0.005 * K, -0.035 * K);
        pig(r, seat[0], seat[1], 0.055 * K, w.bank, u, false);
        const cup = [];
        for (let j = 0; j <= 10; j++) { const a = (j / 10) * Math.PI; cup.push(P(Math.cos(a) * 0.06 * K, (-0.052 + Math.sin(a) * 0.05) * K)); }
        r.poly(cup, BRIGHT);
        for (let j = 0; j < 10; j++) r.line(cup[j][0], cup[j][1], cup[j + 1][0], cup[j + 1][1], FIG);
        const b1 = P(-0.055 * K, -0.035 * K), b2 = P(0.055 * K, -0.035 * K), hd = P(0.075 * K, -0.035 * K);
        r.stroke(b1[0], b1[1], b2[0], b2[1], mx1(0.012 * K), COOL);
        circ(r, hd[0], hd[1], 0.016 * K, FIG);
      }
      targets.push({ x: px - 0.1 * K, y: py - 0.14 * K, w: 0.2 * K, h: 0.16 * K });
    };
    let drawn = false;
    for (const g of w.giants) {
      const gx = PX(g.X, g.z), base = PY(0, g.z), h = g.Hw / g.z, col = g.z > 6.5 ? dim(MID) : DARK;
      if (!drawn && pz > g.z + 0.6) { drawPig(); drawn = true; }
      if (gx < -0.3 * N || gx > 1.3 * N) continue;
      if (!drawn && pz > g.z - 0.6) { giant(r, gx, base, h, col, g, px, py, 1); drawPig(); drawn = true; giant(r, gx, base, h, col, g, px, py, 2); }
      else giant(r, gx, base, h, col, g, px, py, 3);
      targets.push({ x: gx - 0.15 * h, y: base - h, w: 0.3 * h, h });
    }
    if (!drawn && pz > 2.6) { drawPig(); drawn = true; }
    hills(2.6, 0.08 * N, 0.11 * N, 4, DARK, dim(DARK));
    if (!drawn) drawPig();
    // the cards in the air: peeled ones flutter down at their terminal speed, swaying and tumbling, and fall
    // behind as the air slows them; called ones fly in to their gap
    w.loose = w.loose.filter((c) => {
      c.ph += dt * 4.5;
      c.spin += dt * 7;
      c.vX = follow(c.vX, Math.sin(c.ph) * 0.12 * N, dt, 0.5);
      c.vA = follow(c.vA, -0.07 * N * (1 + 0.6 * Math.cos(2 * c.ph)), dt, 0.25);
      c.X += c.vX * dt;
      c.A += c.vA * dt;
      c.life -= dt;
      const kk = 1.6 / c.z, sx = PX(c.X, c.z), sy = PY(c.A, c.z);
      card(r, sx, sy, c.cw * kk, c.ch * kk, c.ang + Math.sin(c.ph) * 0.5, Math.cos(c.spin), c.suit);
      return c.life > 0 && sx > -0.1 * N && sy < N + 0.05 * N;
    });
    w.incoming = w.incoming.filter((c) => {
      const sl = c.sl;
      c.vx += (60 * (sl.sx - c.x) - 11 * c.vx) * dt;
      c.vy += (60 * (sl.sy - c.y) - 11 * c.vy) * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.spin += dt * 9;
      c.age += dt;
      if (Math.hypot(sl.sx - c.x, sl.sy - c.y) < 2 * u || c.age > 1.6 || !w.slots.includes(sl)) { sl.has = w.slots.includes(sl); sl.coming = false; return false; }
      card(r, c.x, c.y, sl.cw, sl.ch, sl.ang + Math.sin(c.spin) * 0.6, Math.cos(c.spin * 0.5), sl.suit);
      return true;
    });
    w.poof = particles(W, w.poof, BRIGHT);
    // the near bushes rush by at the bottom, in front of everything
    const zb = 1.35, sp = 0.22 * N * zb, gb = hz + G / zb;
    for (let j = Math.floor((w.camX - cx * zb) / sp); j * sp < w.camX + cx * zb + sp; j++) {
      if (hash(j, 77) > 0.7) continue;
      const bx = PX(j * sp, zb), bs = (0.014 + 0.012 * hash(j, 78)) * N, th = bs * (1.5 + 1.5 * hash(j, 79));
      r.rect(bx - mx1(u * 0.6) / 2, gb - th, mx1(u * 0.6), th, BLACK); // a lone tree: a trunk and a round crown
      r.disc(bx, gb - th - bs * 0.6, bs, BLACK);
      r.disc(bx + bs * 0.9, gb - bs * 0.3, bs * 0.5, BLACK);
    }
  },
};

// ---------------------------------------------------------------------------------------------- stompfoot
// A cut-out show on a stage: engraved heads on their busts, a machine of cogs, a backdrop by kind (an engraved sky,
// a parlour, a city of domes). A giant bare foot hangs above, and on a heavy kick it stamps down behind the cast:
// ever faster, a dust burst where it lands and everything on the stage hops (the nearer the higher), then it lifts
// away slowly. A snare opens a head like a lid on its back hinge and something pops out: a flower that grows and
// blooms, a bird that flies off, a smaller head on a spring; the cogs turn a tooth a beat, meshing (the small one
// quicker, each the other way round); a note brings a cherub blowing a trumpet. A drop: the foot comes down on the
// whole scene and squashes it flat, and the scene springs back up after it, wobbling.
const SET_W = { sky: [3, 2, 1], parlour: [2, 2, 2], city: [1, 2, 3] };
const ITEMS = ['flower', 'bird', 'head'];

// a cog of `n` teeth on pitch radius R turned to `a`: the toothed rim, a web with four holes, the hub
function cog(r, x, y, R, n, a, col, hole, u) {
  const th = Math.max(1.4 * u, R * 0.2), w = ((Math.PI * R) / n) * 0.5, r0 = R - th / 2, r1 = R + th / 2;
  for (let i = 0; i < n; i++) {
    const b = a + (i / n) * TAU, c = Math.cos(b), s = Math.sin(b);
    r.poly([[x + c * r0 - s * w, y + s * r0 + c * w], [x + c * r1 - s * w * 0.6, y + s * r1 + c * w * 0.6], [x + c * r1 + s * w * 0.6, y + s * r1 - c * w * 0.6], [x + c * r0 + s * w, y + s * r0 - c * w]], col);
  }
  r.disc(x, y, r0 + 0.5, col);
  for (let i = 0; i < 4; i++) { const b = a + (i * TAU) / 4 + Math.PI / 4; r.disc(x + Math.cos(b) * R * 0.47, y + Math.sin(b) * R * 0.47, R * 0.17, hole); }
  r.disc(x, y, mx1(R * 0.13), hole);
}
// an engraved head on a bust at (x, base) facing `dir`, R the skull's radius, its crown lifted `lid` radians about
// a hinge at the back; `look` picks the hair (bald with a moustache, a powdered wig, slick dark hair). Returns the
// middle of the opening, where things come out
function bust(L, x, base, R, dir, lid, look, u) {
  const hy = base - R * 2.3, yc = hy - R * 0.25, skin = LMID, shade = dim(LMID), hair = look === 1 ? BRIGHT : look === 2 ? DARK : skin;
  L.rect(x - R * 1.15, base - R * 0.35, R * 2.3, R * 0.35, MID);
  const cb = base - R * 0.35, ct = hy + R * 1.05;
  L.poly([[x - R * 1.5, cb], [x + R * 1.5, cb], [x + R * 0.75, ct], [x - R * 0.75, ct]], DARK);
  for (let y = Math.ceil(ct) + 1; y < cb; y += 2) { const hw = R * lerp(0.75, 1.5, (y - ct) / (cb - ct)); L.rect(dir > 0 ? x - hw : x + hw * 0.5, y, hw * 0.5, 1, dim(DARK)); } // the shaded side, hatched
  L.rect(x - R * 0.35, hy + R * 0.55, R * 0.7, R * 0.6, skin);
  if (look === 1) for (let k = 0; k < 4; k++) L.disc(x - dir * R * (0.75 + 0.1 * (k & 1)), hy + R * (-0.1 + k * 0.32), R * 0.26, hair); // the wig's curls down the back
  // the head below the crown's cut, row by row; the crown on its hinge (or shut)
  for (let y = Math.ceil(yc); y <= hy + R; y++) { const hw = Math.sqrt(Math.max(0, R * R - (y + 0.5 - hy) ** 2)); L.rect(x - hw, y, 2 * hw, 1, skin); }
  for (let y = Math.ceil(hy - R * 0.1); y <= hy + R; y += 2) { const hw = Math.sqrt(Math.max(0, R * R - (y + 0.5 - hy) ** 2)); L.rect(dir > 0 ? x - hw : x + hw * 0.35, y, hw * 0.65, 1, shade); }
  L.poly([[x + dir * R * 0.85, hy - R * 0.2], [x + dir * R * 1.35, hy + R * 0.32], [x + dir * R * 0.85, hy + R * 0.42]], skin); // the nose
  L.poly([[x + dir * R * 0.95, hy + R * 0.45], [x + dir * R * 0.88, hy + R * 0.98], [x - dir * R * 0.15, hy + R * 1.05], [x - dir * R * 0.45, hy + R * 0.6]], skin); // the jaw
  L.rect(x + dir * R * 0.5 - mx1(u) / 2, hy - R * 0.08, mx1(u), mx1(u), FIG); // the eye
  L.line(x + dir * R * 0.35, hy - R * 0.25, x + dir * R * 0.8, hy - R * 0.3, FIG); // the brow
  L.line(x + dir * R * 0.62, hy + R * 0.66, x + dir * R * 0.92, hy + R * 0.62, FIG); // the mouth
  oval(L, x - dir * R * 0.12, hy + R * 0.12, R * 0.16, R * 0.24, shade); // the ear
  if (look === 0) L.poly([[x + dir * R * 0.55, hy + R * 0.45], [x + dir * R * 1.1, hy + R * 0.42], [x + dir * R * 0.75, hy + R * 0.58]], DARK);
  const hx = x - dir * R * 0.97, cut = Math.asin(0.25), pts = [], a = -dir * lid, c = Math.cos(a), s = Math.sin(a);
  if (lid > 0.04) oval(L, x, yc, R * Math.cos(cut), mx1(R * 0.2), BLACK); // the hollow inside
  for (let k = 0; k <= 10; k++) {
    const b = -(Math.PI - cut) + ((Math.PI - 2 * cut) * k) / 10, px = x + Math.cos(b) * R - hx, py = hy + Math.sin(b) * R - yc;
    pts.push([hx + px * c - py * s, yc + px * s + py * c]);
  }
  L.poly(pts, hair);
  if (lid > 0.04) for (let k = 0; k < 10; k++) L.line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], FIG);
  return [x, yc];
}
// a bare foot from the side, the toes to the left, its sole on y and `len` long from the toes to the heel; the leg
// goes up out of the picture; ink marks the toes and the ankle, hatching the shade at the back of the leg
function foot(r, x, y, len, u) {
  const L = len, heel = x + L * 0.5, ank = x + L * 0.28;
  r.rect(ank - L * 0.12, -2, L * 0.25, y - L * 0.3 + 2, LMID);
  r.poly([[x - L * 0.42, y], [heel - L * 0.06, y], [heel, y - L * 0.09], [heel - L * 0.03, y - L * 0.22], [ank + L * 0.13, y - L * 0.34], [ank - L * 0.12, y - L * 0.34], [x - L * 0.05, y - L * 0.2], [x - L * 0.38, y - L * 0.12]], LMID);
  r.disc(heel - L * 0.08, y - L * 0.09, L * 0.09, LMID);
  for (let k = 0; k < 5; k++) {
    const tx = x - L * (0.42 - k * 0.07), tr = L * (0.075 - k * 0.009);
    r.disc(tx, y - tr, tr, LMID);
    if (k) r.line(tx - tr * 0.9, y - tr * 1.5, tx - tr * 0.8, y - tr * 0.3, FIG);
  }
  r.rect(x - L * 0.5, y - L * 0.11, L * 0.055, L * 0.04, BRIGHT); // the nail of the big toe
  for (let yy = Math.max(0, Math.round(y - L * 0.36)) & ~1; yy > -1; yy -= 2) r.rect(ank + L * 0.06, yy, L * 0.07, 1, MID);
  circ(r, ank + L * 0.03, y - L * 0.27, L * 0.035, MID);
  r.rect(x - L * 0.5, y - mx1(u), L * 1.02, mx1(u), FIG);
}
// a cherub `s` tall flying at (x, y) facing `dir`: a round body and head, curls, wings beating at `ph`, a trumpet
// at the mouth; returns where the bell is
function cherub(r, x, y, s, dir, ph, blow, u) {
  const flap = Math.sin(ph) * 0.3;
  for (const [k, c] of [[0.12, LMID], [-0.05, BRIGHT]]) r.poly([[x - dir * s * 0.05, y - s * 0.28], [x - dir * s * (0.5 + k), y - s * (0.62 + flap)], [x - dir * s * (0.62 + k), y - s * (0.3 + flap * 0.5)], [x - dir * s * 0.12, y - s * 0.02]], c);
  r.disc(x - dir * s * 0.08, y + s * 0.22, s * 0.12, LMID);
  r.disc(x + dir * s * 0.08, y + s * 0.26, s * 0.11, LMID);
  r.disc(x, y, s * 0.26, LMID);
  r.disc(x + dir * s * 0.08, y - s * 0.38, s * 0.2, LMID);
  for (let k = 0; k < 3; k++) r.disc(x + dir * s * (-0.06 + k * 0.08), y - s * 0.56, s * 0.07, dim(HOT));
  r.set(x + dir * s * 0.18, y - s * 0.42, FIG);
  const mx = x + dir * s * 0.26, my = y - s * 0.32, bx = x + dir * s * 0.8, by = y - s * 0.48;
  r.stroke(mx, my, bx, by, mx1(u * 0.9), BRIGHT);
  const fl = s * (0.12 + 0.06 * blow);
  r.poly([[bx - dir * s * 0.05, by], [bx + dir * s * 0.1, by - fl], [bx + dir * s * 0.1, by + fl]], blow > 0 ? BRIGHT : LMID);
  r.stroke(x + dir * s * 0.15, y - s * 0.1, mx + dir * s * 0.1, my + s * 0.04, mx1(u), LMID); // the arm holding it
  return [bx + dir * s * 0.12, by];
}

const stompfoot = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { N, kind: rollW(rnd, SET_W, bandOf(W.a)), lay: new Raster(N), foot: { st: 0, y: 0.2 * N, v: 0, x: 0.45 * N, tx: 0.45 * N, t: 0, flat: false }, sq: { x: 0, v: 0 },
      heads: [[0.12, 1, 0], [0.66, -1, 1], [0.88, -1, 2]].map(([x, dir, look]) => ({ x, dir, look, lid: 0, lv: 0, open: 0, item: '', grow: 0, ext: 0, ev: 0, hop: { y: 0, vy: 0 } })),
      mach: { y: 0, vy: 0 }, birds: [], cherubs: [], notes: [], dust: [], puffs: [], lastStomp: -9, clouds: [0.1, 0.45, 0.8].map((x) => ({ x, y: 0.12 + rnd() * 0.25, w: 0.18 + rnd() * 0.1 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W;
    if (w.N !== N || w.lay.N !== N) stompfoot.init(W);
    const gb = 0.79 * N, gf = 0.9 * N, H0 = 0.36 * N, F = w.foot, g = GR * N;
    if (f.section === 'change') w.kind = rollW(rnd, SET_W, bandOf(W.a));
    // a drop: the foot comes forward over the cast (growing as it nears us) and down on all of it
    if (f.section === 'drop' && !F.flat) { F.flat = true; F.st = 1; F.v = 0.3 * N; F.tx = 0.5 * N; }
    F.len = follow(F.len || 0.42 * N, F.flat ? N : 0.42 * N, dt, 0.12);
    if (F.flat) F.x = follow(F.x, 0.5 * N, dt, 0.1);
    const stomp = () => {
      const len = F.len;
      s.shake = Math.max(s.shake, F.flat ? 1 : 0.7);
      for (const k of [-0.45, 0.5]) kick(w.dust, rnd, F.x + k * len, F.flat ? gf : gb, 14, 0.45 * N, 0.9);
      for (const hd of w.heads) if (hd.hop.y === 0) hd.hop.vy = -0.6 * N * Math.exp(-Math.abs(hd.x * N - F.x) / (0.3 * N));
      if (w.mach.y === 0) w.mach.vy = -0.6 * N * Math.exp(-Math.abs(0.38 * N - F.x) / (0.3 * N));
      w.lastStomp = t;
    };
    for (const h of hits) {
      if (isLow(h) && h.strength > 0.6 && F.st === 0 && t - w.lastStomp > 1.1) { F.st = 1; F.v = 1.5 * N; F.x = F.tx; F.tx = (0.3 + 0.4 * rnd()) * N; }
      else if (h.kind === 'snare') {
        const shut = w.heads.filter((hd) => hd.open <= 0 && hd.lid < 0.05);
        if (shut.length) { const hd = shut[Math.floor(rnd() * shut.length)]; hd.open = 1.8; hd.item = ITEMS[Math.floor(rnd() * 3)]; hd.flew = false; }
      }
      if (isTonal(h)) {
        if (w.cherubs.length < 3) { const dir = rnd() < 0.5 ? 1 : -1; w.cherubs.push({ x: dir > 0 ? -0.1 * N : 1.1 * N, y: (0.1 + 0.2 * rnd()) * N, tx: (0.2 + 0.6 * rnd()) * N, ty: (0.1 + 0.22 * rnd()) * N, vx: 0, vy: 0, dir, life: 5, blow: 0.5, pc: h.pc, emit: 0 }); }
        else for (const c of w.cherubs) { c.blow = 0.5; c.pc = h.pc; }
      }
    }
    // the foot: hovering high, stamping down ever faster, resting a moment, lifting away slowly
    if (F.st === 0) { F.y = follow(F.y, 0.2 * N + Math.sin(f.rel.bassClock * 1.3) * 0.02 * N, dt, 0.4); F.x = follow(F.x, F.tx, dt, 0.8); }
    else if (F.st === 1) {
      F.v += 8 * g * dt;
      F.y += F.v * dt;
      const floor = F.flat ? gf - H0 * 0.14 : gb;
      if (F.y >= floor) { F.y = floor; F.st = 2; F.t = 0; stomp(); }
    } else if (F.st === 2) { if ((F.t += dt) > (F.flat ? 0.5 : 0.18)) { F.st = 3; F.t = 0; F.y0 = F.y; } }
    else if (F.st === 3) {
      F.t += dt;
      const top = F.flat ? -0.1 * N : 0.2 * N, k = ease(F.t / (F.flat ? 1.4 : 0.9));
      F.y = lerp(F.y0, top, k);
      if (k >= 1) { F.st = 0; F.flat = false; }
    }
    // the scene's spring: squashed under the flat foot, it pushes back up after it as it lifts, and wobbles
    spring(w.sq, dt, 140, 4.5);
    if (F.flat) { const most = (gf - F.y) / H0 - 1; if (w.sq.x > most) { w.sq.x = most; w.sq.v = Math.min(w.sq.v, 0); } }
    const bt = beatsOf(w, f, dt), ib = Math.floor(bt), steps = ib + ease(Math.min(1, (bt - ib) * 4));

    // the backdrop and the stage
    if (w.kind === 'sky') {
      for (const c of w.clouds) {
        c.x -= dt * 0.012 * (1 + f.rel.midDrive);
        if (c.x < -c.w) { c.x = 1.05; c.y = 0.12 + rnd() * 0.25; }
        cloud(r, c.x * N, c.y * N, c.w * N, LMID, BRIGHT);
        hatch(r, c.x * N + 0.08 * c.w * N, c.y * N - 0.08 * c.w * N, 0.8 * c.w * N, 0.08 * c.w * N, MID, 2);
      }
      for (let x = 0; x < N; x += 2) { const top = gb - 0.08 * N - Math.sin(x * 0.05) * 0.03 * N - Math.sin(x * 0.13) * 0.012 * N; hatch(r, x, top, 1, gb - top, MID, 2); }
    } else if (w.kind === 'parlour') {
      for (let x = 0; x < N; x += 0.08 * N) r.rect(x, 0, 0.03 * N, gb, dim(LMID));
      r.rect(0, 0.08 * N, N, mx1(1.5 * u), DARK);
      r.rect(0, gb - 0.12 * N, N, 0.12 * N, MID);
      hatch(r, 0, gb - 0.12 * N, N, 0.12 * N, dim(MID), 3);
      r.rect(0.38 * N, 0.16 * N, 0.24 * N, 0.2 * N, DARK); // a picture in a frame: a small landscape with a sun
      r.rect(0.4 * N, 0.18 * N, 0.2 * N, 0.16 * N, LMID);
      r.rect(0.4 * N, 0.28 * N, 0.2 * N, 0.06 * N, MID);
      r.disc(0.53 * N, 0.24 * N, 0.025 * N, HOT);
    } else {
      for (let k = 0; k < 7; k++) {
        const x = (k * 0.16 - 0.02) * N, wd = (0.07 + 0.04 * hash(k, 5)) * N, ht = (0.2 + 0.25 * hash(k, 6)) * N, col = k & 1 ? dim(MID) : MID;
        r.rect(x, gb - ht, wd, ht, col);
        if (hash(k, 7) < 0.5) { r.disc(x + wd / 2, gb - ht, wd * 0.5, col); r.rect(x + wd / 2 - u * 0.5, gb - ht - wd * 0.9, mx1(u), wd * 0.4, col); }
        else r.poly([[x, gb - ht], [x + wd, gb - ht], [x + wd / 2, gb - ht - wd * 1.2]], col);
        for (let yy = gb - ht + 3 * u; yy < gb - 4 * u; yy += 5 * u) for (let xx = x + 2 * u; xx < x + wd - 2 * u; xx += 4 * u) if (hash(Math.round(xx), Math.round(yy)) < 0.4) r.rect(xx, yy, mx1(u), mx1(1.5 * u), LMID);
      }
    }
    r.rect(0, gb, N, N - gb, MID);
    for (let y = gb + 2 * u, k = 1; y < N; y += 3 * u * k, k++) r.rect(0, y, N, mx1(u * 0.6), dim(MID)); // the boards closer together far off
    // the foot behind the cast, its shadow on the boards growing darker as it comes down
    if (!F.flat) {
      const near = clamp(F.y / gb);
      if (near > 0.3) oval(r, F.x + 0.02 * N, gb, F.len * 0.55 * near, mx1(0.02 * N * near), DARK);
      foot(r, F.x, F.y, F.len, u);
    } else if (F.y > gf - H0 * 1.6) oval(r, F.x, gf - u, F.len * 0.5, mx1(0.02 * N), DARK);
    // the cast, drawn on a layer of its own and laid onto the stage squashed by the spring (and widened, as the
    // squashed do)
    const L = w.lay;
    L.buf.fill(255);
    for (const hd of w.heads) {
      hd.open -= dt;
      const tgt = hd.open > 0.4 ? 1.5 : 0;
      hd.lv += (90 * (tgt - hd.lid) - 7 * hd.lv) * dt;
      hd.lid += hd.lv * dt;
      if (hd.lid < 0) { hd.lid = 0; hd.lv = -hd.lv * 0.3; }
      hop(hd.hop, dt, g);
      const R = 0.06 * N, x = hd.x * N, [ox, oy] = bust(L, x, gf + hd.hop.y, R, hd.dir, hd.lid, hd.look, u);
      const out = hd.open > 0.55 && hd.lid > 0.9;
      if (hd.item === 'flower') {
        hd.grow = follow(hd.grow, out ? 1 : 0, dt, 0.15);
        if (hd.grow > 0.05) {
          const top = oy - hd.grow * 0.13 * N, sway = Math.sin(t * 2 + hd.x * 9) * 0.01 * N * hd.grow;
          L.stroke(ox, oy, ox + sway, top, mx1(u), COOL);
          L.poly([[ox + sway * 0.5, oy - hd.grow * 0.06 * N], [ox + sway * 0.5 + 0.03 * N * hd.grow, oy - hd.grow * 0.08 * N], [ox + sway * 0.5, oy - hd.grow * 0.07 * N]], COOL);
          const pr = 0.022 * N * hd.grow;
          for (let k = 0; k < 6; k++) L.disc(ox + sway + Math.cos((k * TAU) / 6 + t) * pr, top + Math.sin((k * TAU) / 6 + t) * pr, pr * 0.6, HOT);
          L.disc(ox + sway, top, pr * 0.55, BRIGHT);
        }
      } else if (hd.item === 'head') {
        hd.ev += (160 * ((out ? 1 : 0) - hd.ext) - 6 * hd.ev) * dt; // a jack-in-the-box: a stiff spring, overshooting
        hd.ext += hd.ev * dt;
        if (hd.ext > 0.03) {
          const e = Math.max(0, hd.ext) * 0.11 * N, top = oy - e, r2 = R * 0.42;
          for (let k = 0; k < 6; k++) L.line(ox + (k & 1 ? 1 : -1) * r2 * 0.4, oy - (e * k) / 6, ox + (k & 1 ? -1 : 1) * r2 * 0.4, oy - (e * (k + 1)) / 6, FIG);
          L.disc(ox, top - r2, r2, LMID);
          L.poly([[ox + hd.dir * r2 * 0.8, top - r2 * 1.2], [ox + hd.dir * r2 * 1.4, top - r2 * 0.7], [ox + hd.dir * r2 * 0.8, top - r2 * 0.6]], LMID);
          L.set(ox + hd.dir * r2 * 0.4, top - r2 * 1.1, FIG);
          L.rect(ox - r2 * 0.9, top - r2 * 2.05, r2 * 1.8, mx1(u), DARK);
          L.rect(ox - r2 * 0.5, top - r2 * 2.7, r2, r2 * 0.7, DARK);
        }
      } else if (hd.item === 'bird' && out && !hd.flew) { hd.flew = true; w.birds.push({ x: ox, y: oy, vx: hd.dir * 0.25 * N, vy: -0.45 * N, ph: 0 }); }
      targets.push({ x: x - R * 1.5, y: gf + hd.hop.y - R * 3.3, w: R * 3, h: R * 3.3 });
    }
    // the machine: a plinth, three posts and three cogs that mesh, a tooth of the big one a beat; a chimney puffing
    hop(w.mach, dt, g);
    const mx = 0.3 * N, my = gf + w.mach.y, mm = 0.0085 * N, rA = 6 * mm, rB = 4 * mm, rC = 8 * mm, p1 = -0.55, p2 = 0.7;
    const ax = mx, ay = my - 0.15 * N, bx = ax + (rA + rB) * Math.cos(p1), by = ay + (rA + rB) * Math.sin(p1), cx2 = bx + (rB + rC) * Math.cos(p2), cy2 = by + (rB + rC) * Math.sin(p2);
    const tA = (steps * TAU) / 12, tB = (-tA * 12) / 8 + p1 + Math.PI - (Math.PI - p1 * 12) / 8, tC = (-tB * 8) / 16 + p2 + Math.PI - (Math.PI - p2 * 8) / 16;
    L.rect(mx - 0.07 * N, my - 0.03 * N, 0.33 * N, 0.03 * N, DARK);
    hatch(L, mx - 0.07 * N, my - 0.03 * N, 0.33 * N, 0.03 * N, MID, 2);
    for (const [px, py] of [[ax, ay], [bx, by], [cx2, cy2]]) L.stroke(px, py, px + 0.01 * N, my - 0.03 * N, mx1(2 * u), DARK);
    L.rect(mx + 0.2 * N, my - 0.2 * N, 0.025 * N, 0.17 * N, DARK);
    if (tick(w, f, dt)) w.puffs.push(puff(mx + 0.212 * N, my - 0.21 * N, 0.02 * N, -0.12 * N, 2.2));
    cog(L, ax, ay, rA, 12, tA, DARK, LMID, u);
    cog(L, bx, by, rB, 8, tB, FIG, LMID, u);
    cog(L, cx2, cy2, rC, 16, tC, DARK, LMID, u);
    targets.push({ x: mx - 0.07 * N, y: by - rB, w: 0.33 * N, h: my - by + rB });
    // lay the cast onto the stage: rows above the front line squashed toward it, columns spread about the middle
    const ky = Math.max(0.1, 1 + w.sq.x), kx = Math.min(1.45, 1 / Math.sqrt(ky)), lb = L.buf, buf = r.buf, gfr = Math.round(gf), mid = N / 2;
    for (let y = 0; y < N; y++) {
      const sy = y >= gfr ? y : Math.round(gfr - (gfr - y) / ky);
      if (sy < 0 || sy >= N) continue;
      const row = sy * N, o = y * N;
      for (let x = 0; x < N; x++) { const sx = kx === 1 ? x : Math.round(mid + (x - mid) / kx); if (sx >= 0 && sx < N) { const v = lb[row + sx]; if (v !== 255) buf[o + x] = v; } }
    }
    if (F.flat) foot(r, F.x, F.y, F.len, u);
    w.puffs = smoke(W, w.puffs, -0.02 * N, LMID, BRIGHT).slice(-20);
    // the birds from the heads, flapping up and away
    w.birds = w.birds.filter((b) => {
      b.vy = follow(b.vy, -0.12 * N, dt, 0.6);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ph += dt * 16;
      bird(r, b.x, b.y, mx1(5 * u), b.ph, FIG);
      return b.y > -0.05 * N && b.x > -0.05 * N && b.x < 1.05 * N;
    });
    // the cherubs: they glide in, hover beating their wings, blow on the notes, and leave
    w.cherubs = w.cherubs.filter((c) => {
      c.life -= dt;
      if (c.life < 1.2) { c.tx = c.dir > 0 ? 1.2 * N : -0.2 * N; c.ty = -0.1 * N; }
      c.vx += (4 * (c.tx - c.x) - 3 * c.vx) * dt;
      c.vy += (4 * (c.ty - c.y) - 3 * c.vy) * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.blow -= dt;
      if (Math.abs(c.vx) > 0.02 * N) c.dir = Math.sign(c.vx);
      const [bx2, by2] = cherub(r, c.x, c.y + Math.sin(t * 7) * u, 0.1 * N, c.dir, t * 14, c.blow, u);
      if (c.blow > 0 && (c.emit -= dt) <= 0) { c.emit = 0.15; w.notes.push({ x: bx2, y: by2, vx: c.dir * 0.3 * N, vy: -0.04 * N, t: 0, c: c.pc % 2 ? HOT : COOL }); }
      targets.push({ x: c.x - 0.05 * N, y: c.y - 0.06 * N, w: 0.1 * N, h: 0.1 * N });
      return c.life > 0;
    });
    w.notes = w.notes.filter((n) => { n.t += dt; n.x += n.vx * dt; n.y += n.vy * dt; circ(r, n.x, n.y, mx1(u * 0.8) + n.t * 0.02 * N, n.c, 1); return n.t < 0.5; });
    w.dust = dust(W, w.dust, LMID);
  },
};

// ---------------------------------------------------------------------------------------------- meltclocks
// A dream desert: soft clocks draped over the branch of a dead tree, over the edge of a plinth and of a box, each a
// soft body (a grid of points hanging under gravity from where its fold is caught, held by its stiffness), sagging
// more as the bass softens them and jiggling on the kicks; their hands tick a notch a beat and spin round on a
// snare, a note lights a case; ants crawl round a rim a step per hat; an elephant on spindly legs walks slowly
// across the far sand, one leg a beat, its feet planted (the body is carried along as the mean of them), its
// shadows long away from the low sun. The hour is the kind (dawn, noon, dusk: where the sun stands and how the
// shadows lie). A drop: the clocks drip, blobs stretching from their lowest points, falling and splashing.
const HOUR_W = { dawn: [3, 1, 1], noon: [1, 2, 3], dusk: [2, 2, 1] };
const SUN = { dawn: [0.86, 0.52, -1, 1.4], noon: [0.5, 0.1, 0.15, 0.25], dusk: [0.12, 0.53, 1, 1.4] }; // x, y, shadow direction, shadow length
const CG = 7, RIM = 32;

// a soft clock: a CG x CG grid of points over the face's square, simulated in the sheet's own unfolded plane: the
// rows above the fold line `fy` lie on top of the support (no pull along it, held by friction: a ledge) or hang
// down its far side (gravity the other way: a branch); the rows below hang in front. Distance constraints along the
// grid, across its diagonals and two apart (the stiffness the bass softens); the middle of the fold is caught
function softClock(cx, fy, R, mode, floor, g) {
  const n = CG * CG, sp = (2 * R) / (CG - 1), jf = 2, X = new Float32Array(n), Y = new Float32Array(n), A = [], B = [], RL = [], KD = [];
  for (let j = 0; j < CG; j++) for (let i = 0; i < CG; i++) { X[j * CG + i] = cx + (i - (CG - 1) / 2) * sp; Y[j * CG + i] = fy + (j - jf) * sp; }
  const add = (a, b, k) => { A.push(a); B.push(b); RL.push(Math.hypot(X[a] - X[b], Y[a] - Y[b])); KD.push(k); };
  for (let j = 0; j < CG; j++) for (let i = 0; i < CG; i++) {
    const k = j * CG + i;
    if (i + 1 < CG) add(k, k + 1, 0);
    if (j + 1 < CG) add(k, k + CG, 0);
    if (i + 1 < CG && j + 1 < CG) { add(k, k + CG + 1, 1); add(k + 1, k + CG, 1); }
    if (i + 2 < CG) add(k, k + 2, 2);
    if (j + 2 < CG) add(k, k + 2 * CG, 2);
  }
  const c = { X, Y, OX: X.slice(), OY: Y.slice(), X0: X.slice(), Y0: Y.slice(), A: Int16Array.from(A), B: Int16Array.from(B), RL: Float32Array.from(RL), RL0: Float32Array.from(RL), KD: Uint8Array.from(KD),
    cx, cy: fy + (3 - jf) * sp, fy, R, sp, mode, floor, pin: [jf * CG + 3], drips: [], dripT: 0, spin: 0, spinV: 0, lit: 0, litc: HOT, rim: [] };
  for (let k = 0; k < 120; k++) clockStep(c, 0.012, g, 0.35, 0.06, 0); // hung up and settled before the first frame
  return c;
}
function clockStep(c, dt, g, ks, kb, creep) {
  // fixed 12 ms steps whatever the frame rate (the time left over waits for the next frame), so the sheet's
  // stiffness, its damping and the jolts are the same at any dt
  const h = 0.012, { X, Y, OX, OY, A, B, RL, RL0, KD } = c, np = X.length, nc = A.length, ledge = c.mode === 'ledge';
  c.acc = (c.acc || 0) + dt;
  const n = Math.min(12, Math.floor(c.acc / h + 1e-9));
  c.acc = Math.min(h, c.acc - n * h);
  for (let s = 0; s < n; s++) {
    for (let p = 0; p < np; p++) {
      const on = Y[p] < c.fy, f = on && ledge ? 0.5 : 0.985, a = on ? (ledge ? 0 : -g) : g;
      const vx = (X[p] - OX[p]) * f, vy = (Y[p] - OY[p]) * f;
      OX[p] = X[p]; OY[p] = Y[p];
      X[p] += vx; Y[p] += vy + a * h * h;
    }
    for (let it = 0; it < 3; it++) {
      for (let q = 0; q < nc; q++) {
        const a = A[q], b = B[q], k = KD[q] === 2 ? kb : KD[q] === 1 ? ks * 0.4 : ks, dx = X[b] - X[a], dy = Y[b] - Y[a], d = Math.sqrt(dx * dx + dy * dy) || 1e-6, m = ((d - RL[q]) / d) * 0.5 * k;
        X[a] += dx * m; Y[a] += dy * m; X[b] -= dx * m; Y[b] -= dy * m;
      }
      for (const p of c.pin) { X[p] = c.X0[p]; Y[p] = c.Y0[p]; }
    }
    for (let p = 0; p < np; p++) if (Y[p] > c.floor) { Y[p] = c.floor; X[p] = lerp(X[p], OX[p], 0.5); } // it heaps on the ground, it cannot go through
  }
  // the creep: under its own weight the sheet flows (its rest lengths give way), and slowly recovers its shape
  for (let q = 0; q < nc; q++) if (KD[q] !== 2) { const dx = X[B[q]] - X[A[q]], dy = Y[B[q]] - Y[A[q]]; RL[q] += ((Math.sqrt(dx * dx + dy * dy) - RL[q]) * creep - (RL[q] - RL0[q]) * 0.12) * dt; }
}
// where a point of the face (rx, ry from its centre, at rest) is now, in the unfolded plane, into `o`
function onFace(c, rx, ry, o) {
  const gx = Math.min(CG - 1.001, Math.max(0, (rx + c.R) / c.sp)), gy = Math.min(CG - 1.001, Math.max(0, (ry + c.R) / c.sp)), i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, k = j * CG + i, X = c.X, Y = c.Y;
  o[0] = (X[k] * (1 - fx) + X[k + 1] * fx) * (1 - fy) + (X[k + CG] * (1 - fx) + X[k + CG + 1] * fx) * fy;
  o[1] = (Y[k] * (1 - fx) + Y[k + 1] * fx) * (1 - fy) + (Y[k + CG] * (1 - fx) + Y[k + CG + 1] * fx) * fy;
  return o;
}
// the unfolded plane onto the screen: above the fold the sheet lies foreshortened on the ledge's top, or hangs down
// behind the branch
const fold = (c, y) => (y >= c.fy ? y : c.mode === 'ledge' ? c.fy - (c.fy - y) * 0.35 : 2 * c.fy - y);
const P2 = [0, 0];
// the clock's two halves: `back` the part over the fold (dimmed behind a branch, lying on a ledge), else the front;
// the rim as a polygon split at the fold, the face, the case's edge, the twelve marks, the hands
function clockDraw(r, c, back, hour, minute, u) {
  const pts = [], behind = back && c.mode === 'branch';
  let prev = null;
  for (let k = 0; k <= RIM; k++) {
    const a = (k / RIM) * TAU, o = onFace(c, Math.cos(a) * c.R, Math.sin(a) * c.R, P2), x = o[0], y = o[1], here = y < c.fy;
    if (prev && prev[2] !== here) { const q = (c.fy - prev[1]) / (y - prev[1] || 1e-6); pts.push([prev[0] + (x - prev[0]) * q, c.fy]); }
    if (here === back && k < RIM) pts.push([x, fold(c, y)]);
    prev = [x, y, here];
  }
  if (pts.length < 3) return;
  const face = behind ? dim(LMID) : BRIGHT, edge = c.lit > 0.1 ? c.litc : behind ? dim(MID) : MID;
  r.poly(pts, face);
  for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length]; if (p[1] !== c.fy || q[1] !== c.fy) r.stroke(p[0], p[1], q[0], q[1], mx1(1.3 * u), edge); }
  if (behind) return;
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU, o = onFace(c, Math.cos(a) * c.R * 0.8, Math.sin(a) * c.R * 0.8, P2); if ((o[1] < c.fy) === back) r.set(o[0], fold(c, o[1]), FIG); }
  for (const [ang, len, wd] of [[hour, 0.45, 1.4], [minute, 0.72, 1]]) {
    let px = -1, py = -1;
    for (let k = 0; k <= 3; k++) {
      const o = onFace(c, Math.cos(ang) * c.R * len * (k / 3), Math.sin(ang) * c.R * len * (k / 3), P2), x = o[0], y = fold(c, o[1]), ok = (o[1] < c.fy) === back;
      if (k && ok && px >= 0) r.stroke(px, py, x, y, mx1(wd * u), FIG);
      px = ok ? x : -1; py = y;
    }
  }
  const o = onFace(c, 0, 0, P2);
  if ((o[1] < c.fy) === back) r.disc(o[0], fold(c, o[1]), mx1(u), HOT);
}
// an elephant on stilts walking toward `dir`, `sz` the body's length, `legH` how high it is carried: the feet (x on
// the ground g) far hind, far fore, near hind, near fore, `lift` how high each is off the ground; long thin legs
// each with a small joint, the trunk swaying, a slender tower on its back
function stiltElephant(r, feet, lift, g, sz, legH, dir, ph, col, u) {
  const bx = (feet[0] + feet[1] + feet[2] + feet[3]) / 4, by = g - legH + Math.sin(ph * 2) * u * 0.5, far = dim(col), l = legH * 0.53;
  const leg = (k) => {
    const tx = bx + dir * sz * (k & 1 ? 0.28 : -0.3), ty = by + sz * 0.05, fx = feet[k], fy = g - lift[k], c = k < 2 ? far : col;
    const [kx, ky] = knee(tx, ty, fx, fy, l, l, k & 1 ? dir : -dir);
    r.line(tx, ty, kx, ky, c);
    r.line(kx, ky, fx, fy, c);
    r.rect(fx - u, fy - mx1(u), mx1(2 * u), mx1(u), c);
  };
  leg(0); leg(1);
  r.rect(bx - dir * sz * 0.48, by - sz * 0.05, mx1(u * 0.6), sz * 0.3, far); // the tail
  oval(r, bx, by - sz * 0.1, sz * 0.44, sz * 0.25, col);
  r.rect(bx - sz * 0.13, by - sz * 0.4, sz * 0.26, sz * 0.07, LMID); // the saddle cloth and the tower on it
  r.poly([[bx - sz * 0.07, by - sz * 0.4], [bx + sz * 0.07, by - sz * 0.4], [bx, by - sz * 1.15]], LMID);
  r.rect(bx - u * 0.5, by - sz * 1.2, mx1(u), sz * 0.08, HOT);
  const hx = bx + dir * sz * 0.5, hy = by - sz * 0.14;
  r.disc(hx, hy, sz * 0.17, col);
  oval(r, hx - dir * sz * 0.08, hy + sz * 0.02, sz * 0.09, sz * 0.15, far); // the ear
  let tx = hx + dir * sz * 0.14, ty = hy + sz * 0.05;
  for (let k = 1; k <= 5; k++) { const a = Math.PI / 2 - dir * (0.25 + 0.2 * Math.sin(ph + k * 0.6)), nx = tx + Math.cos(a) * sz * 0.09, ny = ty + Math.sin(a) * sz * 0.09; r.stroke(tx, ty, nx, ny, mx1(sz * (0.09 - k * 0.012)), col); tx = nx; ty = ny; }
  r.line(hx + dir * sz * 0.1, hy + sz * 0.1, hx + dir * sz * 0.22, hy + sz * 0.13, BRIGHT); // a tusk
  r.set(hx + dir * sz * 0.06, hy - sz * 0.05, BRIGHT);
  leg(2); leg(3);
  return [bx, by];
}

const meltclocks = {
  init(W) {
    const { w, rnd, N } = W, kind = rollW(rnd, HOUR_W, bandOf(W.a)), g = GR * N, S = SUN[kind];
    Object.assign(w, { N, kind, sun: [S[0], S[1]], sd: S[2], sl: S[3], melt: 0, ants: 0, antStep: 0,
      clocks: [softClock(0.34 * N, 0.44 * N, 0.085 * N, 'branch', 0.93 * N, g), softClock(0.64 * N, 0.72 * N, 0.08 * N, 'ledge', 0.885 * N, g), softClock(0.91 * N, 0.875 * N, 0.055 * N, 'ledge', 0.97 * N, g)],
      el: { feet: new Float32Array(4), lift: new Float32Array(4), sw: -1, from: 0, to: 0, p: 1, i: 0, dir: rnd() < 0.5 ? 1 : -1, ph: 0 } });
    const E = w.el, x0 = (E.dir > 0 ? 0.25 : 0.75) * N, S2 = 0.06 * N;
    for (let k = 0; k < 4; k++) E.feet[k] = x0 + E.dir * ((k & 1 ? 0.28 : -0.3) * 0.13 * N + (k * 0.25 - 0.375) * S2);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W;
    if (w.N !== N) meltclocks.init(W);
    const hz = 0.6 * N, g = GR * N, bass = clamp(f.rel.bassDrive), E = w.el, eg = 0.665 * N, esz = 0.13 * N, legH = 0.33 * N;
    if (f.section === 'change') w.kind = rollW(rnd, HOUR_W, bandOf(W.a));
    if (f.section === 'drop') w.melt = 8;
    const S = SUN[w.kind];
    w.sun[0] = follow(w.sun[0], S[0], dt, 2); w.sun[1] = follow(w.sun[1], S[1], dt, 2); w.sd = follow(w.sd, S[2], dt, 2); w.sl = follow(w.sl, S[3], dt, 2);
    for (const h of hits) {
      if (isLow(h)) for (const c of w.clocks) for (let p = 0; p < c.Y.length; p++) c.OY[p] = c.Y[p] + (c.Y[p] < c.fy ? 1 : -1) * 0.002 * N * h.strength; // a jolt: down, on either side of the fold (0.002 N a 12 ms step)
      else if (h.kind === 'snare') w.clocks[Math.floor(rnd() * 3)].spinV = TAU / 0.5;
      else if (h.kind === 'hat') w.antStep++;
      if (isTonal(h)) { const c = w.clocks[h.pc % 3]; c.lit = 1; c.litc = h.pc % 2 ? COOL : HOT; }
    }
    // the elephant: a leg a beat, far hind, far fore, near hind, near fore, each swung a stride ahead and set down
    if (tick(w, f, dt)) { if (E.sw >= 0) { E.feet[E.sw] = E.to; E.lift[E.sw] = 0; } E.sw = E.i++ % 4; E.from = E.feet[E.sw]; E.to = E.from + E.dir * 0.06 * N; E.p = 0; }
    // the swing takes the whole tick (a beat, or the half second without a lock): the foot comes down on the next one
    if (E.sw >= 0 && E.p < 1) { E.p = Math.min(1, E.p + dt * (beatLocked(f) ? bps(f) : 2)); const q = E.p * E.p * (3 - 2 * E.p); E.feet[E.sw] = lerp(E.from, E.to, q); E.lift[E.sw] = Math.sin(Math.PI * E.p) * 0.025 * N; }
    E.ph += dt * 2;
    const ebx = (E.feet[0] + E.feet[1] + E.feet[2] + E.feet[3]) / 4;
    if (E.dir * (ebx - 0.5 * N) > 0.8 * N) { const sh = -E.dir * 1.65 * N; for (let k = 0; k < 4; k++) E.feet[k] += sh; E.from += sh; E.to += sh; } // off one side, back in at the other
    // the soft clocks: the bass softens them, a drop melts them
    w.melt = Math.max(0, w.melt - dt);
    const melt = w.melt > 0, ks = (0.42 - 0.2 * bass) * (melt ? 0.7 : 1), kb = 0.06 * (1 - 0.6 * bass) * (melt ? 0.3 : 1), creep = 0.6 * bass + (melt ? 1.5 : 0);
    for (const c of w.clocks) {
      clockStep(c, dt, g, ks, kb, creep);
      c.spin += c.spinV * dt; c.spinV *= Math.exp(-dt * 3); c.lit = Math.max(0, c.lit - dt * 1.2);
    }

    // the sky, the glow on the horizon, the sun; the far sea and a mesa; the sand with its lines running to the
    // horizon; the shadows away from the sun
    band(r, 0.25 * N, hz, LMID, 0, 0.7);
    const sx = w.sun[0] * N, sy = w.sun[1] * N;
    r.disc(sx, sy, 0.05 * N, w.kind === 'noon' ? BRIGHT : HOT);
    r.rect(0, hz - 0.012 * N, 0.4 * N, 0.012 * N, dim(COOL));
    for (let x = 0; x < 0.4 * N; x += 5 * u) r.rect(x + ((t * 3) % 5) * u, hz - 0.008 * N, 2 * u, mx1(u * 0.5), LMID);
    r.poly([[0.68 * N, hz], [0.72 * N, hz - 0.05 * N], [0.86 * N, hz - 0.05 * N], [0.9 * N, hz]], MID);
    r.rect(0, hz, N, N - hz, LMID);
    for (const z of [9, 6, 4.2, 3, 2.2, 1.6, 1.2]) r.rect(0, hz + (0.36 * N) / z, N, mx1(u * 0.5), dim(LMID));
    const sd = w.sd, sl = w.sl;
    for (let k = 0; k < 4; k++) r.line(E.feet[k], eg, E.feet[k] + sd * legH * sl, eg + 0.006 * N, dim(LMID)); // the stilts' shadows
    oval(r, ebx + sd * (legH + 0.03 * N) * sl, eg + 0.008 * N, esz * 0.45, mx1(0.01 * N), dim(LMID));
    // the plinth's and the box's and the tree's shadows on the sand
    r.poly([[0.54 * N, 0.885 * N], [0.8 * N, 0.885 * N], [0.8 * N + sd * 0.16 * N * sl, 0.9 * N], [0.54 * N + sd * 0.16 * N * sl, 0.9 * N]], dim(MID));
    r.stroke(0.165 * N, 0.93 * N, 0.165 * N + sd * 0.45 * N * sl, 0.95 * N, mx1(1.5 * u), dim(MID));
    // the elephant, far off on the sand, before everything nearer
    const [ex, ey] = stiltElephant(r, E.feet, E.lift, eg, esz, legH, E.dir, E.ph, DARK, u);
    targets.push({ x: ex - esz * 0.6, y: ey - esz * 1.2, w: esz * 1.2, h: legH + esz * 1.2 });
    // the dead tree and its long branch; the first clock hangs over it (its back flap behind the branch)
    const tx = 0.165 * N, ty = 0.44 * N, A = w.clocks[0], hour = (beatsOf(w, f, dt) * TAU) / 720, ticks = Math.floor(w.bt);
    r.poly([[tx - 0.022 * N, 0.93 * N], [tx + 0.026 * N, 0.93 * N], [tx + 0.01 * N, ty], [tx - 0.006 * N, ty - 0.01 * N]], DARK);
    for (const [x0, y0, x1, y1] of [[tx, 0.6 * N, tx - 0.07 * N, 0.52 * N], [tx - 0.05 * N, 0.545 * N, tx - 0.08 * N, 0.55 * N], [tx, ty, tx - 0.03 * N, 0.36 * N]]) r.stroke(x0, y0, x1, y1, mx1(u), DARK);
    const branch = () => { r.stroke(tx, ty, 0.44 * N, ty, mx1(1.8 * u), DARK); r.stroke(0.44 * N, ty, 0.47 * N, ty - 0.03 * N, mx1(u), DARK); };
    branch();
    const hands = (c) => [-Math.PI / 2 + hour + c.spin / 12, -Math.PI / 2 + (ticks * TAU) / 60 + c.spin];
    clockDraw(r, A, true, ...hands(A), u);
    branch();
    clockDraw(r, A, false, ...hands(A), u);
    // the plinth and the box, a clock lying over the edge of each
    r.rect(0.54 * N, 0.72 * N, 0.26 * N, 0.165 * N, MID);
    hatch(r, 0.54 * N, 0.73 * N, 0.26 * N, 0.155 * N, dim(MID), 3);
    r.poly([[0.54 * N, 0.72 * N], [0.8 * N, 0.72 * N], [0.83 * N, 0.69 * N], [0.57 * N, 0.69 * N]], LMID);
    r.poly([[0.8 * N, 0.72 * N], [0.83 * N, 0.69 * N], [0.83 * N, 0.855 * N], [0.8 * N, 0.885 * N]], DARK);
    for (const back of [true, false]) clockDraw(r, w.clocks[1], back, ...hands(w.clocks[1]), u);
    r.rect(0.84 * N, 0.875 * N, 0.17 * N, 0.095 * N, MID);
    r.poly([[0.84 * N, 0.875 * N], [N, 0.875 * N], [N, 0.86 * N], [0.855 * N, 0.86 * N]], LMID);
    for (const back of [true, false]) clockDraw(r, w.clocks[2], back, ...hands(w.clocks[2]), u);
    // the ants: a file round the plinth clock's rim, a step per hat, their legs alternating
    const B = w.clocks[1];
    w.ants = follow(w.ants, w.antStep * 0.05, dt, 0.06);
    for (let k = 0; k < 8; k++) {
      const a = w.ants - k * 0.2 + 1.2, o = onFace(B, Math.cos(a) * B.R * 0.9, Math.sin(a) * B.R * 0.9, P2), x = o[0], y = fold(B, o[1]);
      const o2 = onFace(B, Math.cos(a + 0.08) * B.R * 0.9, Math.sin(a + 0.08) * B.R * 0.9, [0, 0]), dx = o2[0] - x, dy = fold(B, o2[1]) - y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      for (let s2 = -1; s2 <= 1; s2++) r.set(x + ux * s2 * mx1(u), y + uy * s2 * mx1(u), FIG);
      const lg = (w.antStep + k) & 1 ? 1 : -1;
      r.set(x - uy * mx1(u) + ux * lg, y + ux * mx1(u) + uy * lg, FIG);
      r.set(x + uy * mx1(u) - ux * lg, y - ux * mx1(u) - uy * lg, FIG);
    }
    // a drop: drips swell at each clock's lowest point, stretch on a thinning neck, let go, fall faster and
    // faster, and splash flat on the ground
    for (const c of w.clocks) {
      if (w.melt > 0 && (c.dripT -= dt) <= 0) {
        c.dripT = 0.5 + rnd() * 0.5;
        let best = 0, by = -1;
        for (let k = 0; k < RIM; k++) { const a = (k / RIM) * TAU, o = onFace(c, Math.cos(a) * c.R, Math.sin(a) * c.R, P2); if (o[1] >= c.fy && o[1] > by) { by = o[1]; best = a; } }
        c.drips.push({ a: best + (rnd() - 0.5) * 0.3, L: 0, v: 0, st: 0, x: 0, y: 0, vy: 0, life: 3, rr: u });
      }
      c.drips = c.drips.filter((d) => {
        if (d.st === 0) {
          const o = onFace(c, Math.cos(d.a) * c.R * 0.97, Math.sin(d.a) * c.R * 0.97, P2), ax = o[0], ay = fold(c, o[1]);
          d.v = follow(d.v, 0.07 * N, dt, 0.7);
          d.L += d.v * dt;
          d.rr = mx1(u) * (1 + d.L / (0.025 * N));
          r.stroke(ax, ay, ax, ay + d.L, mx1(u * 0.8), BRIGHT);
          r.disc(ax, ay + d.L, d.rr + 0.6, FIG);
          r.disc(ax, ay + d.L, d.rr, BRIGHT);
          if (d.L > 0.045 * N) { d.st = 1; d.x = ax; d.y = ay + d.L; d.vy = d.v; }
        } else if (d.st === 1) {
          d.vy += g * dt;
          d.y += d.vy * dt;
          if (d.y >= c.floor) { d.st = 2; d.y = c.floor; d.age = 0; }
          else { oval(r, d.x, d.y, d.rr * 0.9 + 0.6, d.rr * (1 + d.vy / N) + 0.6, FIG); oval(r, d.x, d.y, d.rr * 0.9, d.rr * (1 + d.vy / N), BRIGHT); }
        } else {
          d.age += dt;
          d.life -= dt;
          const rx = d.rr * (1 + 1.6 * Math.min(1, d.age / 0.25));
          if (d.life > 1 || hash(d.x | 0, (t * 12) | 0) < d.life) { oval(r, d.x, d.y, rx + 0.6, rx * 0.3 + 0.6, FIG); oval(r, d.x, d.y, rx, rx * 0.3, BRIGHT); }
        }
        return d.life > 0;
      });
      targets.push({ x: c.cx - c.R, y: c.fy - c.R * 0.3, w: 2 * c.R, h: 2.2 * c.R });
    }
  },
};

// ---------------------------------------------------------------------------------------------- bowlerrain
// Men in bowler hats and dark coats hang in the air over a quiet street at dusk, each at his depth (the farther
// the smaller, and the higher his line on the street), bobbing gently; one tips his hat a beat (it hops off his head
// and drops back onto it); a kick dips them all. On the road stands an empty frame on an easel that shows a blue day
// sky with its clouds drifting by; a note lights a window; a snare sets an apple hovering before the face of the man
// in front. The kind is how they hang: in a lattice, scattered, or drifting by in a stream. A drop: they all come
// down like snow, slowly, at their terminal speed, swaying; they land on the street, stand, and rise again to where
// they hung (and more come down with them from above, who go back up and away).
const MEN_W = { lattice: [3, 2, 1], scatter: [2, 2, 2], stream: [1, 2, 3] };

// a man in a bowler hat, frontal, his feet on (x, y), `h` tall: legs, a coat with its sleeves, a white collar and a
// red tie, the face, the hat lifted off his head by `lift` cells
function bowler(r, x, y, h, col, lift, u) {
  const lw = mx1(h * 0.07);
  r.rect(x - h * 0.085, y - h * 0.3, lw, h * 0.3, col);
  r.rect(x + h * 0.015, y - h * 0.3, lw, h * 0.3, col);
  r.poly([[x - h * 0.15, y - h * 0.73], [x + h * 0.15, y - h * 0.73], [x + h * 0.18, y - h * 0.27], [x - h * 0.18, y - h * 0.27]], col);
  r.rect(x - h * 0.205, y - h * 0.68, h * 0.06, h * 0.33, col);
  r.rect(x + h * 0.145, y - h * 0.68, h * 0.06, h * 0.33, col);
  if (h > 8) { r.rect(x - h * 0.035, y - h * 0.73, h * 0.07, h * 0.06, BRIGHT); r.rect(x - h * 0.012, y - h * 0.69, mx1(h * 0.025), h * 0.12, HOT); }
  else r.set(x, y - h * 0.7, BRIGHT);
  r.disc(x, y - h * 0.82, h * 0.095, LMID);
  const hy = y - h * 0.9 - lift;
  oval(r, x, hy, h * 0.09, h * 0.065, col);
  r.rect(x - h * 0.14, hy + h * 0.035, h * 0.28, mx1(h * 0.03), col);
}

const bowlerrain = {
  init(W) {
    const { w, rnd, N } = W, kind = rollW(rnd, MEN_W, bandOf(W.a));
    Object.assign(w, { N, kind, men: [], extra: [], hatI: 0, apple: 0, appleS: 0, wins: new Float32Array(15), rain: false });
    w.men = bowlerrain.place(W, kind).map((p) => ({ ...p, X: p.Xt, A: p.At, z: p.zt, ph: rnd() * TAU, bob: { x: 0, v: 0 }, hat: { y: 0, vy: 0 }, st: 0, vA: 0, wait: 0, dx: 0 }));
  },
  // where they hang, sixteen of them: spots on the screen for the feet at a depth, turned into the street's frame
  // (X across, A above the road); a new kind sends each man gliding to his new spot
  place(W, kind) {
    const { rnd, N } = W, hz = 0.6 * N, K = 0.32 * N, out = [];
    const at = (sx, sy, z) => out.push({ Xt: (sx - 0.5) * N * z, At: K - (sy * N - hz) * z, zt: z });
    if (kind === 'lattice') for (const [z, n, y0] of [[3.6, 6, 0.18], [2.5, 5, 0.3], [1.7, 5, 0.46]]) for (let i = 0; i < n; i++) at((i + 0.5 + (n & 1) * 0.25) / n, y0, z);
    else for (let i = 0; i < 16; i++) at(0.04 + rnd() * 0.92, 0.1 + rnd() * 0.4, 1.5 + rnd() * 2.6);
    return out;
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W;
    if (w.N !== N) bowlerrain.init(W);
    const hz = 0.6 * N, K = 0.32 * N, cx = 0.5 * N, g = GR * N, PX = (X, z) => cx + X / z, PY = (A, z) => hz + (K - A) / z;
    if (f.section === 'change') { const k = rollW(rnd, MEN_W, bandOf(W.a)); if (k !== w.kind && !w.rain) { w.kind = k; bowlerrain.place(W, k).forEach((p, i) => Object.assign(w.men[i], p)); } }
    if (f.section === 'drop') {
      w.rain = true;
      for (const m of w.men) { m.st = 1; m.vA = 0; }
      for (let i = 0; i < 10; i++) { const z = 1.5 + rnd() * 2.5; w.extra.push({ X: (rnd() - 0.5) * N * z, A: K + (0.65 + rnd() * 0.5) * N * z, z, ph: rnd() * TAU, bob: { x: 0, v: 0 }, hat: { y: 0, vy: 0 }, st: 1, vA: 0, wait: 0, dx: 0, At: K + 0.75 * N * z, up: z }); }
    }
    for (const h of hits) {
      if (isLow(h)) for (const m of w.men) m.bob.v += 0.25 * N * h.strength;
      else if (h.kind === 'snare') w.apple = 1.6;
      if (isTonal(h)) w.wins[h.pc % 15] = 1;
    }
    if (tick(w, f, dt) && w.men.length) { const m = w.men[w.hatI++ % w.men.length]; if (m.hat.y === 0) m.hat.vy = -0.45 * N; }
    w.apple -= dt;
    w.appleS = follow(w.appleS, w.apple > 0 ? 1 : 0, dt, 0.07);
    // each man: hanging on his spring and bobbing, or falling like snow, standing on the street, rising again
    const all = w.men.concat(w.extra);
    let busy = false;
    for (const m of all) {
      spring(m.bob, dt, 5, 2.2);
      hop(m.hat, dt, g);
      if (m.st === 0) {
        if (w.kind === 'stream') { m.Xt += 0.03 * N * m.z * dt; if (PX(m.Xt, m.z) > 1.1 * N) { m.Xt -= 1.2 * N * m.z; m.X -= 1.2 * N * m.z; } }
        m.X = follow(m.X, m.Xt, dt, 1.5); m.A = follow(m.A, m.At, dt, 1.5); m.z = follow(m.z, m.zt, dt, 1.5);
      }
      if (m.st === 1) {
        m.vA = follow(m.vA, -0.22 * N, dt, 0.5);
        m.A += m.vA * dt;
        m.dx = Math.sin(t * 1.3 + m.ph) * 0.03 * N;
        if (m.A <= 0) { m.A = 0; m.st = 2; m.wait = 1 + rnd() * 2; m.vA = 0; }
      } else if (m.st === 2) { if ((m.wait -= dt) <= 0) m.st = 3; }
      else if (m.st === 3) {
        m.vA = follow(m.vA, 0.18 * N * (m.up || 1), dt, 0.8);
        m.A += m.vA * dt;
        m.dx *= Math.exp(-dt);
        if (m.A >= m.At) { m.A = m.At; m.st = 0; m.bob.v = -m.vA * 0.3; m.vA = 0; }
      }
      if (m.st) busy = true;
    }
    if (!busy) w.rain = false;
    w.extra = w.extra.filter((m) => m.st !== 0);
    all.sort((a, b) => b.z - a.z);

    // the dusk sky, the houses with their windows, the pavement and the road
    band(r, 0, 0.42 * N, MID, 0.9, 0);
    for (let k = 0; k < 6; k++) {
      const x0 = (k * 0.2 - 0.04) * N, wd = 0.2 * N, top = (0.3 + 0.1 * hash(k, 31)) * N, base = PY(0, 4.5), col = k & 1 ? MID : dim(MID);
      r.rect(x0, top, wd, base - top, col);
      r.rect(x0 - u, top - 0.02 * N, wd + 2 * u, 0.02 * N, DARK);
      r.rect(x0 + wd * 0.65, top - 0.06 * N, 0.025 * N, 0.04 * N, DARK);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const lit = w.wins[(k * 3 + i + j * 7) % 15]; r.rect(x0 + wd * (0.14 + i * 0.28), top + (0.05 + j * 0.13) * N, wd * 0.16, 0.08 * N, lit > 0.15 ? (lit > 0.6 ? BRIGHT : LMID) : DARK); }
      r.rect(x0 + wd * 0.42, base - 0.07 * N, wd * 0.16, 0.07 * N, DARK);
    }
    for (let k = 0; k < 15; k++) w.wins[k] = Math.max(0, w.wins[k] - dt * 0.4);
    r.rect(0, PY(0, 4.5), N, PY(0, 3) - PY(0, 4.5), LMID);
    r.rect(0, PY(0, 3), N, N - PY(0, 3), dim(MID));
    r.rect(0, PY(0, 3), N, mx1(u), DARK);
    for (const z of [2.4, 1.8, 1.3, 1]) r.rect(0, PY(0, z), N, mx1(u * 0.5), dim(DARK));
    // the frame on its easel (at depth 2.2) and the lamp (1.8) take their places among the men
    const frame = () => {
      const fx = 0.06 * N, fy = 0.38 * N, fw = 0.25 * N, fh = 0.27 * N, b = 0.018 * N, base = PY(0, 2.2), ix = fx + b, iy = fy + b, iw = fw - 2 * b, ih = fh - 2 * b;
      r.stroke(fx + fw * 0.2, fy + fh, fx + fw * 0.1, base, mx1(1.5 * u), DARK);
      r.stroke(fx + fw * 0.8, fy + fh, fx + fw * 0.9, base, mx1(1.5 * u), DARK);
      r.stroke(fx + fw * 0.5, fy + fh * 0.5, fx + fw * 0.5, base - 0.01 * N, mx1(u), DARK);
      r.rect(fx, fy, fw, fh, DARK);
      r.frame(Math.round(fx + b * 0.4), Math.round(fy + b * 0.4), Math.round(fw - b * 0.8), Math.round(fh - b * 0.8), LMID);
      r.rect(ix, iy, iw, ih, LMID);
      // its clouds drift across the day it shows, clipped to the frame
      for (let k = 0; k < 3; k++) {
        const cxk = ix + ((k * 0.41 + f.rel.midClock * 0.025) % 1.4 - 0.2) * iw, cyk = iy + (0.25 + 0.25 * k) * ih;
        for (const [dx, dy, rx, ry] of [[0, 0, 0.22, 0.08], [0.12, -0.05, 0.14, 0.08], [-0.1, -0.02, 0.1, 0.06]]) {
          const ex = cxk + dx * iw, ey = cyk + dy * ih, RX = rx * iw, RY = ry * ih;
          for (let y = Math.max(Math.ceil(iy), Math.ceil(ey - RY)); y < Math.min(iy + ih, ey + RY); y++) { const hw = RX * Math.sqrt(Math.max(0, 1 - ((y - ey) / RY) ** 2)), a = Math.max(ix, ex - hw), bb = Math.min(ix + iw, ex + hw); if (bb > a) r.rect(a, y, bb - a, 1, BRIGHT); }
        }
      }
      targets.push({ x: fx, y: fy, w: fw, h: fh });
    };
    const lamp = () => {
      const lx = 0.4 * N, base = PY(0, 1.8), top = 0.42 * N, fl = 0.75 + 0.25 * Math.sin(t * 23) * f.rel.trebDrive;
      r.stroke(lx, base, lx, top, mx1(1.5 * u), DARK);
      r.rect(lx - 0.02 * N, top - 0.045 * N, 0.04 * N, 0.045 * N, DARK);
      r.rect(lx - 0.013 * N, top - 0.038 * N, 0.026 * N, 0.03 * N, fl > 0.6 ? BRIGHT : LMID);
      r.poly([[lx - 0.026 * N, top - 0.045 * N], [lx + 0.026 * N, top - 0.045 * N], [lx, top - 0.065 * N]], DARK);
      oval(r, lx, base, 0.07 * N, 0.012 * N, LMID);
    };
    let fr = false, lp = false;
    for (const m of all) {
      if (!fr && m.z < 2.2) { frame(); fr = true; }
      if (!lp && m.z < 1.8) { lamp(); lp = true; }
      const h = (0.24 * N) / m.z, x = PX(m.X, m.z) + m.dx / m.z, y = PY(m.A + Math.sin(t * 0.9 + m.ph) * 0.012 * N - m.bob.x, m.z);
      bowler(r, x, y, h, m.z > 3 ? DARK : FIG, -m.hat.y / m.z, u);
      if (h > 12) targets.push({ x: x - h * 0.2, y: y - h, w: h * 0.4, h });
    }
    if (!fr) frame();
    if (!lp) lamp();
    // the man in front, and the apple before his face
    bowler(r, 0.8 * N, 1.38 * N, 0.95 * N, FIG, 0, u);
    if (w.appleS > 0.05) {
      const ax = 0.8 * N, ay = 0.59 * N + Math.sin(t * 2.2) * 1.5 * u, R = 0.075 * N * w.appleS;
      r.disc(ax - R * 0.35, ay, R * 0.8, HOT);
      r.disc(ax + R * 0.35, ay, R * 0.8, HOT);
      r.disc(ax, ay + R * 0.15, R * 0.85, HOT);
      r.disc(ax - R * 0.4, ay - R * 0.3, R * 0.2, BRIGHT);
      r.stroke(ax, ay - R * 0.7, ax + R * 0.1, ay - R * 1.1, mx1(u), DARK);
      r.poly([[ax + R * 0.08, ay - R * 0.95], [ax + R * 0.55, ay - R * 1.25], [ax + R * 0.3, ay - R * 0.85]], COOL);
    }
    targets.push({ x: 0.68 * N, y: 0.45 * N, w: 0.24 * N, h: 0.55 * N });
  },
};

// ---------------------------------------------------------------------------------------------- boschgarden
// A garden of strange delights seen from on high: giant fruits with tiny figures climbing them (a snare makes one
// slip and fall), pools with bathers who splash on the kicks (the drops fly parabolas back into the water and ring
// it), a hollow tree-man with a lit room in his shell (a note lights it) and a ring of tiny dancers on his hat a step
// a beat, and a parade of hybrid creatures (a bird-headed walker, a fish on legs, a walking egg, a beetle with a lute
// for a back) crossing in step, a step a beat, their feet planted. The kind is the garden's mood: a pond (a wide pool,
// a short parade), an orchard, or a carnival (a long parade under pennants); a new one sends newcomers in at the back
// of the parade or the extra ones off. A drop: they leave the parade and dance in a ring, the far side small, behind.
const GARDEN_W = { pond: [3, 1, 1], orchard: [2, 3, 1], carnival: [1, 2, 3] };
const CREATURES = ['birdman', 'legfish', 'egg', 'lutebeetle'];
const GARDENS = { pond: { n: 4, pool: 1.25, splash: 2, flags: 0 }, orchard: { n: 5, pool: 0.85, splash: 1, flags: 0 }, carnival: { n: 7, pool: 1, splash: 1, flags: 1 } };

// a creature `s` tall at (x, base) facing `dir`, its feet at gait phase `ph`, A the half-stride: two legs (six for
// the beetle) planted while the body passes over them
function creature(r, kind, x, base, s, dir, ph, A, u) {
  const lw = mx1(s * 0.06), legs = (hipY, cfar, cnear, n = 2) => {
    for (let k = 0; k < n; k++) {
      const st = step(ph, k & 1, A), fx = x + dir * (st[0] + (n > 2 ? (k - 2.5) * s * 0.12 : 0)), fy = base - st[1] * s * 0.12;
      r.line(x + dir * (n > 2 ? (k - 2.5) * s * 0.1 : 0), hipY, fx, fy, k & 1 ? cnear : cfar);
      if (lw > 1) r.line(x + dir * (n > 2 ? (k - 2.5) * s * 0.1 : 0) + 1, hipY, fx + 1, fy, k & 1 ? cnear : cfar);
    }
  };
  if (kind === 'birdman') {
    legs(base - s * 0.42, dim(FIG), FIG);
    r.poly([[x - s * 0.13, base - s * 0.4], [x + s * 0.13, base - s * 0.4], [x + s * 0.09, base - s * 0.78], [x - s * 0.09, base - s * 0.78]], DARK);
    r.disc(x + dir * s * 0.03, base - s * 0.86, s * 0.11, LMID);
    r.poly([[x + dir * s * 0.1, base - s * 0.9], [x + dir * s * 0.42, base - s * 0.78], [x + dir * s * 0.1, base - s * 0.82]], HOT);
    r.set(x + dir * s * 0.06, base - s * 0.89, FIG);
    r.stroke(x - dir * s * 0.12, base - s * 0.7, x - dir * s * 0.16, base - s * 1.05, mx1(u), DARK); // a staff with a pennant
    r.poly([[x - dir * s * 0.16, base - s * 1.05], [x - dir * s * 0.4, base - s * 0.98 + Math.sin(ph) * s * 0.03], [x - dir * s * 0.16, base - s * 0.92]], COOL);
  } else if (kind === 'legfish') {
    legs(base - s * 0.38, dim(FIG), FIG);
    oval(r, x, base - s * 0.55, s * 0.36, s * 0.17, COOL);
    r.poly([[x - dir * s * 0.3, base - s * 0.55], [x - dir * s * 0.55, base - s * (0.72 + Math.sin(ph) * 0.05)], [x - dir * s * 0.55, base - s * (0.38 - Math.sin(ph) * 0.05)]], COOL);
    r.poly([[x - dir * s * 0.1, base - s * 0.7], [x + dir * s * 0.1, base - s * 0.7], [x - dir * s * 0.05, base - s * 0.85]], dim(COOL));
    r.disc(x + dir * s * 0.22, base - s * 0.6, mx1(s * 0.04), BRIGHT);
    r.set(x + dir * s * 0.22, base - s * 0.6, FIG);
    for (let k = 0; k < 3; k++) r.line(x - dir * s * (0.05 - k * 0.1), base - s * 0.48, x - dir * s * (0.1 - k * 0.1), base - s * 0.62, dim(COOL));
  } else if (kind === 'egg') {
    legs(base - s * 0.28, dim(FIG), FIG);
    oval(r, x, base - s * 0.58, s * 0.22, s * 0.32, BRIGHT);
    let px = x - s * 0.2, py = base - s * 0.6;
    for (let k = 1; k <= 5; k++) { const nx = x - s * 0.2 + k * s * 0.08, ny = base - s * (0.6 + (k & 1 ? 0.05 : -0.03)); r.line(px, py, nx, ny, FIG); px = nx; py = ny; }
    r.set(x + dir * s * 0.06, base - s * 0.64, FIG); r.set(x + dir * s * 0.12, base - s * 0.64, FIG);
  } else {
    legs(base - s * 0.2, dim(FIG), FIG, 6);
    oval(r, x, base - s * 0.32, s * 0.36, s * 0.2, MID);
    r.disc(x - dir * s * 0.05, base - s * 0.36, mx1(s * 0.06), FIG); // the sound hole
    r.stroke(x - dir * s * 0.2, base - s * 0.4, x - dir * s * 0.55, base - s * 0.7, mx1(s * 0.06), DARK); // the neck, the pegbox bent back
    r.stroke(x - dir * s * 0.55, base - s * 0.7, x - dir * s * 0.65, base - s * 0.62, mx1(s * 0.05), DARK);
    for (let k = 0; k < 4; k++) r.set(x - dir * s * (0.25 + k * 0.09), base - s * (0.43 + k * 0.08), LMID);
    r.disc(x + dir * s * 0.36, base - s * 0.3, s * 0.08, DARK);
    r.line(x + dir * s * 0.4, base - s * 0.36, x + dir * s * 0.55, base - s * 0.5, DARK);
  }
}
// a giant fruit on the ground at (x, base), `R` across, by kind: a strawberry with its seeds and its leaves, a pair of
// cherries, a blue orb with a crown; returns the centre its climbers go round
function fruit(r, kind, x, base, R, u) {
  if (kind === 0) {
    const cy = base - R * 0.9;
    r.disc(x, cy, R * 0.75, HOT);
    r.poly([[x - R * 0.72, cy + R * 0.2], [x + R * 0.72, cy + R * 0.2], [x, base]], HOT);
    for (let k = 0; k < 14; k++) r.set(x + (hash(k, 3) - 0.5) * R * 1.2, cy + (hash(k, 4) - 0.4) * R * 1.1, BRIGHT);
    for (let k = -2; k <= 2; k++) r.poly([[x, cy - R * 0.6], [x + k * R * 0.25, cy - R * 0.95], [x + k * R * 0.12 + R * 0.08, cy - R * 0.62]], COOL);
    return [x, cy, R * 0.78];
  }
  if (kind === 1) {
    for (const k of [-1, 1]) { r.stroke(x + k * R * 0.5, base - R * 0.7, x + k * R * 0.05, base - R * 1.8, mx1(u * 1.2), COOL); r.disc(x + k * R * 0.5, base - R * 0.55, R * 0.55, HOT); r.disc(x + k * R * 0.5 - R * 0.2, base - R * 0.75, R * 0.12, BRIGHT); }
    return [x + R * 0.5, base - R * 0.55, R * 0.57];
  }
  const cy = base - R;
  r.disc(x, cy, R, COOL);
  r.disc(x - R * 0.35, cy - R * 0.35, R * 0.22, BRIGHT);
  for (let k = 0; k < 5; k++) r.poly([[x + (k - 2) * R * 0.18, cy - R * 0.9], [x + (k - 2) * R * 0.25, cy - R * 1.25], [x + (k - 1.5) * R * 0.18, cy - R * 0.92]], dim(COOL));
  return [x, cy, R];
}

const boschgarden = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { N, kind: '', parade: [], drops: [], rings: [], ring: -1, lamp: 0, lampC: HOT, poolK: 1, flagK: 0,
      fruitK: [0, 1, 2].map((i) => (i + Math.floor(rnd() * 3)) % 3), climbers: Array.from({ length: 6 }, (_, i) => ({ fr: i % 3, a: Math.PI * (0.55 + 0.3 * rnd()), side: i & 1 ? 1 : -1, fall: null, wait: 0 })),
      bathers: Array.from({ length: 5 }, (_, i) => ({ x: 0.07 + i * 0.065 + rnd() * 0.02, ph: rnd() * TAU })) });
    boschgarden.set(W, rollW(rnd, GARDEN_W, bandOf(W.a)));
  },
  // who parades: those already walking walk on, newcomers join at the back off the left edge, the extra ones walk off
  // the right edge and are gone
  set(W, kind) {
    const { w, rnd, N } = W, G = GARDENS[kind], first = !w.parade.length, stay = w.parade.filter((c) => !c.leave);
    w.kind = kind;
    stay.forEach((c, i) => { if (i >= G.n) c.leave = true; });
    let back = Math.min(-0.15 * N, ...stay.map((c) => c.x)) - 0.18 * N;
    for (let i = stay.length; i < G.n; i++, back -= 0.18 * N) w.parade.push({ kind: CREATURES[i % 4], x: first ? (i / G.n) * 1.3 * N - 0.15 * N : back, s: (0.12 + 0.04 * rnd()) * N, px: 0, py: 0, leave: false });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W;
    if (w.N !== N) boschgarden.init(W);
    const hz = 0.27 * N, pathY = 0.66 * N, b = bps(f), G = GARDENS[w.kind];
    w.poolK = follow(w.poolK, G.pool, dt, 1.5); w.flagK = follow(w.flagK, G.flags, dt, 0.8);
    if (f.section === 'change') { const k = rollW(rnd, GARDEN_W, bandOf(W.a)); if (k !== w.kind) boschgarden.set(W, k); }
    if (f.section === 'drop') w.ring = 0;
    const pool = { x: 0.24 * N, y: 0.86 * N, rx: 0.2 * N * w.poolK, ry: 0.065 * N * w.poolK };
    for (const h of hits) {
      if (isLow(h)) for (const bt of w.bathers) if (rnd() < 0.6) for (let k = 0; k < 4 * G.splash; k++) w.drops.push({ x: bt.x * N, y: pool.y - 0.012 * N, vx: (rnd() - 0.5) * 0.3 * N, vy: -(0.3 + 0.35 * rnd()) * N * h.strength });
      else if (h.kind === 'snare') { const c = w.climbers.find((q) => !q.fall && q.wait <= 0); if (c) c.slip = true; }
      if (isTonal(h)) { w.lamp = 1; w.lampC = h.pc % 2 ? COOL : HOT; }
    }
    // the sky, far hills, pink towers on the horizon, the garden's ground
    band(r, 0, hz, LMID, 0, 0.6);
    for (let x = 0; x < N; x += 1) { const top = hz - (0.04 + 0.025 * Math.sin(x * 0.07) + 0.015 * Math.sin(x * 0.19)) * N; r.rect(x, top, 1, hz - top + 1, dim(MID)); }
    for (const [x, h] of [[0.12, 0.13], [0.55, 0.17], [0.86, 0.11]]) {
      const X = x * N, H = h * N;
      r.poly([[X - 0.02 * N, hz], [X + 0.02 * N, hz], [X + 0.008 * N, hz - H], [X - 0.008 * N, hz - H]], dim(HOT));
      r.disc(X, hz - H, 0.018 * N, dim(HOT));
      r.rect(X - u * 0.5, hz - H - 0.05 * N, mx1(u), 0.035 * N, dim(HOT));
    }
    r.rect(0, hz, N, N - hz, LMID);
    for (let y = hz + 2 * u, k = 1; y < N; y += 1.5 * u * k, k++) r.rect(0, y, N, mx1(u * 0.5), dim(LMID));
    for (let k = 0; k < 9; k++) { const x = (k * 0.12 + 0.03) * N, y = hz + (0.02 + 0.05 * hash(k, 51)) * N, s = (0.02 + 0.015 * hash(k, 52)) * N; r.disc(x, y, s, dim(COOL)); r.disc(x + s * 0.8, y + s * 0.2, s * 0.7, dim(COOL)); r.set(x - s * 0.3, y - s * 0.4, HOT); } // shrubs with a berry
    r.rect(0, pathY - 0.01 * N, N, 0.02 * N, BRIGHT);
    // the fruits and their climbers: up round the skin a little at a time, a wave from the top, and a slip on a
    // snare: a fall on a parabola to the ground, and back to the foot of it
    const spots = [0.42, 0.62, 0.2]; // three fruits: the far left one stands behind the pool's bank
    const fc = w.fruitK.map((k, i) => fruit(r, k, spots[i] * N, 0.6 * N, (0.07 + 0.015 * i) * N, u));
    for (const c of w.climbers) {
      const [fx, fy, fr] = fc[c.fr];
      if (c.fall) {
        c.fall.vy += GR * N * dt;
        c.fall.x += c.fall.vx * dt;
        c.fall.y += c.fall.vy * dt;
        if (c.fall.y >= 0.6 * N) { c.fall = null; c.a = Math.PI * 0.55; c.wait = 1; }
        else { walker(r, c.fall.x, c.fall.y, 0.022 * N, BRIGHT, t * 20, c.side, {}); continue; }
      }
      c.wait -= dt;
      const target = -Math.PI / 2 + 0.15;
      if (c.wait <= 0) c.a = follow(c.a, Math.max(target, c.a - 0.6), dt * (0.3 + f.rel.midDrive), 2);
      const cxp = fx + Math.cos(c.side > 0 ? c.a : Math.PI - c.a) * fr, cyp = fy + Math.sin(c.a) * fr;
      if (c.slip) { c.slip = false; c.fall = { x: cxp, y: cyp, vx: c.side * 0.15 * N, vy: -0.2 * N }; continue; }
      walker(r, cxp, cyp, 0.022 * N, BRIGHT, f.rel.midClock * 6, c.side, {});
    }
    // the hollow tree-man: trunk legs, an egg-shell body open at the back on a lit room, a head turned back over
    // his shoulder, a flat hat with tiny dancers going round it a step a beat
    const tx = 0.83 * N, tb = 0.92 * N, by = 0.56 * N, sway = Math.sin(t * 0.7) * f.rel.bassDrive * 2 * u;
    for (const k of [-1, 1]) r.poly([[tx + k * 0.035 * N - 0.012 * N, tb], [tx + k * 0.035 * N + 0.012 * N, tb], [tx + k * 0.02 * N + 0.008 * N, by + 0.03 * N], [tx + k * 0.02 * N - 0.008 * N, by + 0.03 * N]], DARK);
    oval(r, tx + sway, by, 0.085 * N, 0.065 * N, BRIGHT);
    oval(r, tx - 0.03 * N + sway, by + 0.005 * N, 0.045 * N, 0.04 * N, DARK);
    w.lamp = Math.max(0, w.lamp - dt * 0.8);
    r.disc(tx - 0.035 * N + sway, by - 0.005 * N, mx1(0.008 * N), w.lamp > 0.2 ? w.lampC : dim(LMID));
    for (const k of [-0.05, -0.02]) r.rect(tx + k * N + sway, by + 0.012 * N, mx1(u), 0.015 * N, LMID);
    const hx = tx + 0.01 * N + sway, hy = by - 0.1 * N;
    r.rect(hx - 0.008 * N, hy, 0.016 * N, 0.04 * N, LMID);
    r.disc(hx, hy, 0.032 * N, LMID);
    r.poly([[hx - 0.03 * N, hy], [hx - 0.052 * N, hy + 0.008 * N], [hx - 0.03 * N, hy + 0.012 * N]], LMID);
    r.set(hx - 0.02 * N, hy - 0.006 * N, FIG);
    oval(r, hx, hy - 0.035 * N, 0.075 * N, 0.016 * N, MID);
    const bt = beatsOf(w, f, dt);
    for (let k = 0; k < 5; k++) {
      const a = (Math.floor(bt) + ease((bt % 1) * 2) + k * 1.2) * 0.5, dx = Math.cos(a) * 0.06 * N, dy = Math.sin(a) * 0.012 * N, front = Math.sin(a) > 0;
      r.rect(hx + dx - u * 0.5, hy - 0.05 * N + dy - (front ? 0 : u), mx1(u), mx1(2.2 * u), front ? BRIGHT : LMID);
    }
    targets.push({ x: tx - 0.09 * N, y: hy - 0.06 * N, w: 0.18 * N, h: tb - hy + 0.06 * N });
    // the parade, a step a beat in step together; or, after a drop, the ring dance, the far side small
    const ph = bt * Math.PI, v = 0.05 * N * b, A = v / (2 * b), n = w.parade.length;
    if (w.ring >= 0) { w.ring += dt; if (w.ring > 16 / b) w.ring = -1; }
    const gather = w.ring >= 0 ? clamp(Math.min(w.ring, 16 / b - w.ring) * b) : 0;
    const order = [];
    for (let i = 0; i < n; i++) {
      const c = w.parade[i];
      if (gather <= 0) { c.x += v * dt; if (c.x > 1.15 * N) { if (c.leave) c.gone = true; else c.x -= 1.3 * N; } }
      const a = (i / n) * TAU + w.ring * (v / (0.24 * N)), rx = 0.5 * N + Math.cos(a) * 0.24 * N, ry = pathY + Math.sin(a) * 0.06 * N;
      c.px = lerp(c.x, rx, gather); c.py = lerp(pathY, ry, gather); c.sc = lerp(1, 1 + 0.18 * Math.sin(a), gather); c.dir = gather > 0.5 ? (Math.sin(a) > 0 ? -1 : 1) : 1;
      c.st = lerp(1, Math.abs(Math.sin(a)), gather); // round the ring only the across part of the walk shows, and the stride with it: the feet stay planted
      order.push(c);
    }
    order.sort((p, q) => p.py - q.py);
    for (const c of order) {
      creature(r, c.kind, c.px, c.py, c.s * c.sc, c.dir, ph, A * c.st, u);
      if (w.flagK > 0.05 && c.kind !== 'birdman') { const top = c.py - c.s * (0.7 + 0.5 * w.flagK); r.line(c.px - c.dir * c.s * 0.1, c.py - c.s * 0.5, c.px - c.dir * c.s * 0.1, top, DARK); r.poly([[c.px - c.dir * c.s * 0.1, top], [c.px - c.dir * c.s * (0.4 + 0.05 * Math.sin(t * 6 + c.x)), top + c.s * 0.06], [c.px - c.dir * c.s * 0.1, top + c.s * 0.12]], (c.s * 7) & 1 ? HOT : COOL); } // carnival pennants
      targets.push({ x: c.px - c.s * 0.4, y: c.py - c.s, w: c.s * 0.8, h: c.s });
    }
    w.parade = w.parade.filter((c) => !c.gone);
    // the pool and its bathers; the drops of their splashing, and the rings where they fall back
    oval(r, pool.x, pool.y, pool.rx, pool.ry, COOL);
    oval(r, pool.x, pool.y - 0.006 * N, pool.rx * 0.92, pool.ry * 0.75, dim(COOL));
    for (const bt2 of w.bathers) {
      const bx = bt2.x * N, byy = pool.y - 0.01 * N + Math.sin(t * 1.5 + bt2.ph) * u;
      r.rect(bx - 0.012 * N, byy - 0.006 * N, 0.024 * N, 0.01 * N, LMID);
      r.disc(bx, byy - 0.016 * N, 0.009 * N, LMID);
      r.set(bx - 0.003 * N, byy - 0.026 * N, DARK);
    }
    w.drops = w.drops.filter((d) => {
      d.vy += GR * N * dt; d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.vy > 0 && d.y >= pool.y - 0.01 * N) { if (Math.abs(d.x - pool.x) < pool.rx * 0.95) w.rings.push({ x: d.x, y: d.y, t: 0 }); return false; } // back in the water it rings it; on the grass it soaks in
      r.rect(d.x, d.y, mx1(u), mx1(u), BRIGHT);
      return true;
    }).slice(-80);
    w.rings = w.rings.filter((q) => { q.t += dt; circ(r, q.x, q.y, q.t * 0.08 * N, BRIGHT, 0.35); return q.t < 0.3; });
  },
};

// ---------------------------------------------------------------------------------------------- fishsky
// Fish swim through the air of a city: schools that hold together, align and keep apart (boids, kept within the sky
// over the roofs), turning together on a snare; a whale drifts between the far and the near buildings with the bass,
// its tail beating; bubbles rise from the chimneys, quicker and quicker up to their terminal speed, swelling as they
// go; seaweed sways up from the roofs in the current. The kind is the water: a reef of small bright fish, the deep
// (one school, jellyfish that pulse up on the beat and sink between), or one big shoal of silver ones; a new water
// sends the old fish off and brings the new in from the sides. A drop: the sky floods, the water rising over the
// rooftops, and drains away.
const SEA_W = { reef: [3, 2, 1], deep: [2, 2, 1], shoal: [1, 2, 3] };
const SCHOOLS = { reef: [[14, HOT], [12, COOL]], deep: [[16, LMID]], shoal: [[34, BRIGHT]] };

const fishsky = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { N, kind: '', schools: [], bubs: [], jelly: [], whale: { x: 0.2 * N, y: 0.4 * N, v: 0.03 * N, kick: 0, ph: 0, py: 0.4 * N }, flood: -1, lvl: N + 4 });
    fishsky.set(W, rollW(rnd, SEA_W, bandOf(W.a)));
  },
  // a new water: the schools there swim off out of the sides and the new ones come in from them; the jellyfish of the
  // deep come down from above, or float off up
  set(W, kind) {
    const { w, rnd, N } = W, first = !w.schools.length;
    w.kind = kind;
    for (const sc of w.schools) sc.leave = true;
    for (const [i, [n, col]] of SCHOOLS[kind].entries()) {
      const side = i & 1 ? 1 : -1, cx = first ? (0.3 + 0.4 * i) * N : side > 0 ? 1.15 * N : -0.15 * N, cy = (0.2 + 0.1 * i) * N, head = first ? rnd() * TAU : side > 0 ? Math.PI : 0;
      w.schools.push({ col, head, leave: false, X: Float32Array.from({ length: n }, () => cx + (rnd() - 0.5) * 0.15 * N), Y: Float32Array.from({ length: n }, () => cy + (rnd() - 0.5) * 0.1 * N),
        VX: Float32Array.from({ length: n }, () => Math.cos(head) * 0.1 * N), VY: Float32Array.from({ length: n }, () => Math.sin(head) * 0.05 * N) });
    }
    for (const j of w.jelly) j.leave = true;
    if (kind === 'deep') for (let i = 0; i < 3; i++) w.jelly.push({ x: (0.2 + 0.3 * i) * N, y: first ? (0.25 + 0.1 * i) * N : -0.06 * N - i * 0.05 * N, vy: 0, pulse: 0, leave: false });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W;
    if (w.N !== N) fishsky.init(W);
    if (f.section === 'change') { const k = rollW(rnd, SEA_W, bandOf(W.a)); if (k !== w.kind) fishsky.set(W, k); }
    if (f.section === 'drop') w.flood = 0;
    const roof = 0.58 * N, bass = clamp(f.rel.bassDrive), mid = clamp(f.rel.midDrive);
    // the buildings: a far row (lighter), a near row (darker) with chimneys, water towers and seaweed on top
    const far = [], near = [];
    for (let k = 0; k < 7; k++) far.push([(k * 0.16 - 0.03) * N, (0.13 + 0.1 * hash(k, 41)) * N, (0.38 + 0.12 * hash(k, 42)) * N]);
    for (let k = 0; k < 5; k++) near.push([(k * 0.22 - 0.02) * N, (0.16 + 0.05 * hash(k, 43)) * N, roof + (0.04 + 0.16 * hash(k, 44)) * N]);
    for (const h of hits) {
      if (isLow(h)) { w.whale.kick = 1; for (const [x, wd, top] of near) if (hash(Math.round(x), 2) < 0.7) for (let k = 0; k < 3; k++) w.bubs.push({ x: x + wd * 0.75, y: top - 0.05 * N, vy: -0.02 * N, s: (0.6 + rnd() * 0.8) * u, ph: rnd() * TAU }); }
      else if (h.kind === 'snare') for (const sc of w.schools) sc.head += (rnd() < 0.5 ? 1 : -1) * (Math.PI * 0.5 + rnd() * Math.PI * 0.5);
    }
    const on = tick(w, f, dt);
    // the flood: up over the roofs in four beats, held, drained
    let lvlT = N + 4;
    if (w.flood >= 0) { w.flood += dt * bps(f); const q = w.flood < 4 ? ease(w.flood / 4) : w.flood < 10 ? 1 : 1 - ease((w.flood - 10) / 4); lvlT = lerp(N + 4, 0.3 * N, q); if (w.flood > 14) w.flood = -1; }
    w.lvl = lvlT;
    band(r, 0.3 * N, roof, LMID, 0, 0.5);
    for (const [x, wd, top] of far) { r.rect(x, top, wd, N - top, dim(LMID)); for (let yy = top + 3 * u; yy < N; yy += 5 * u) for (let xx = x + 2 * u; xx < x + wd - 2 * u; xx += 4 * u) if (hash(Math.round(xx), Math.round(yy)) < 0.3) r.rect(xx, yy, mx1(u), mx1(1.5 * u), BRIGHT); }
    // the whale, between the rows: it drifts with the bass, beats its tail, pitches with its climb
    const Wh = w.whale;
    Wh.kick = Math.max(0, Wh.kick - dt * 1.5);
    Wh.v = follow(Wh.v, (0.015 + 0.05 * bass + 0.04 * Wh.kick) * N, dt, 1);
    Wh.x += Wh.v * dt;
    if (Wh.x > 1.4 * N) Wh.x = -0.4 * N;
    Wh.ph += dt * (1.5 + 3 * bass + 3 * Wh.kick);
    const wy = 0.38 * N + Math.sin(t * 0.25) * 0.06 * N, pitch = clamp((wy - Wh.py) / Math.max(dt, 1e-3) / (0.2 * N), -0.3, 0.3);
    Wh.py = wy;
    const L = 0.36 * N, P = turn(Wh.x, wy, pitch);
    for (let k = 0; k <= 12; k++) {
      const q = k / 12, th = (q < 0.25 ? 0.6 + 1.6 * q : 1 - 0.8 * (q - 0.25) ** 1.5) * 0.075 * N, bend = Math.sin(Wh.ph - q * 2.5) * q * q * 0.05 * N;
      const [px, py] = P(L * (0.4 - q), bend);
      r.disc(px, py, Math.max(u, th), DARK);
      if (th > 2 * u) r.rect(px - th * 0.6, py + th * 0.35, th * 1.2, th * 0.45, MID);
    }
    const [tx, ty] = P(-L * 0.62, Math.sin(Wh.ph - 2.5) * 0.05 * N), fl = Math.cos(Wh.ph - 2.5);
    r.poly([[tx, ty], [tx - 0.06 * N, ty - 0.05 * N * (0.6 + fl * 0.4)], [tx - 0.03 * N, ty], [tx - 0.06 * N, ty + 0.05 * N * (0.6 - fl * 0.4)]], DARK);
    const [ex, ey] = P(L * 0.3, -0.01 * N), [fx2, fy2] = P(L * 0.12, 0.04 * N);
    r.set(ex, ey, BRIGHT);
    r.poly([[fx2, fy2], [fx2 - 0.05 * N, fy2 + 0.05 * N], [fx2 - 0.03 * N, fy2 + 0.01 * N]], DARK);
    for (let k = 0; k < 6; k++) { const [bx, by] = P(L * (0.25 - k * 0.07), -0.04 * N); r.set(bx, by, LMID); }
    targets.push({ x: Wh.x - L * 0.7, y: wy - 0.08 * N, w: L * 1.15, h: 0.16 * N });
    for (const [x, wd, top] of near) {
      r.rect(x, top, wd, N - top, DARK);
      for (let yy = top + 4 * u; yy < N; yy += 6 * u) for (let xx = x + 3 * u; xx < x + wd - 3 * u; xx += 5 * u) r.rect(xx, yy, 2 * u, 3 * u, hash(Math.round(xx), Math.round(yy) + (on ? 1 : 0)) < 0.35 ? LMID : dim(DARK));
      r.rect(x + wd * 0.7, top - 0.05 * N, 0.025 * N, 0.05 * N, DARK); // a chimney
      if (hash(Math.round(x), 2) < 0.7 && rnd() < dt * (1 + 4 * f.level)) w.bubs.push({ x: x + wd * 0.71 + 0.012 * N, y: top - 0.05 * N, vy: 0, s: (0.6 + rnd() * 0.8) * u, ph: rnd() * TAU });
      if (hash(Math.round(x), 3) < 0.5) { r.rect(x + wd * 0.2, top - 0.06 * N, 0.04 * N, 0.04 * N, DARK); r.rect(x + wd * 0.21, top - 0.02 * N, mx1(u), 0.02 * N, DARK); r.rect(x + wd * 0.2 + 0.03 * N, top - 0.02 * N, mx1(u), 0.02 * N, DARK); }
      // the seaweed: strands up from the roof, the wave of the current running up them
      for (let s2 = 0; s2 < 3; s2++) {
        let px = x + wd * (0.35 + s2 * 0.1), py = top, a = -Math.PI / 2;
        for (let k = 0; k < 6; k++) { a = -Math.PI / 2 + Math.sin(t * 1.4 - k * 0.6 + s2 + x) * (0.2 + 0.5 * bass) * ((k + 1) / 6); const nx = px + Math.cos(a) * 0.018 * N, ny = py + Math.sin(a) * 0.018 * N; r.stroke(px, py, nx, ny, mx1(1.4 * u), COOL); px = nx; py = ny; }
      }
    }
    // the bubbles: they speed up to their terminal speed, wobble, swell as the pressure drops, and pop
    w.bubs = w.bubs.filter((bb) => {
      bb.vy = follow(bb.vy, -0.16 * N, dt, 0.6);
      bb.y += bb.vy * dt;
      bb.x += Math.sin(t * 6 + bb.ph) * 2 * u * dt;
      bb.s += dt * 0.25 * u;
      if (bb.y < w.lvl - 0.01 * N && w.lvl < N) { circ(r, bb.x, w.lvl, bb.s * 2, BRIGHT, 0.4); return false; }
      circ(r, bb.x, bb.y, bb.s, BRIGHT);
      return bb.y > -0.02 * N;
    }).slice(-90);
    // the jellyfish of the deep: a beat squeezes the bell and they jet up (harder the deeper they have sunk, so they
    // keep to the middle of the sky), the water slows them at once, they sink between; the drift is integrated exactly
    for (const j of w.jelly) {
      if (on) { j.vy -= 0.22 * N * (j.leave ? 1 : clamp((j.y - 0.1 * N) / (0.3 * N))); j.pulse = 1; }
      const sink = j.leave ? -0.04 * N : 0.055 * N, e = Math.exp(-dt / 0.2);
      j.y += sink * dt + (j.vy - sink) * 0.2 * (1 - e);
      j.vy = sink + (j.vy - sink) * e;
      if (!j.leave) j.y = Math.min(j.y, roof - 0.1 * N);
      j.pulse = Math.max(0, j.pulse - dt * 3);
      const bw = 0.035 * N * (1 - 0.3 * j.pulse), bh = 0.025 * N * (1 + 0.4 * j.pulse);
      for (let k = 0; k < 4; k++) { let px = j.x - bw * 0.6 + k * bw * 0.4, py = j.y; for (let s2 = 0; s2 < 4; s2++) { const nx = px + Math.sin(t * 3 + k + s2) * u, ny = py + 0.012 * N; r.line(px, py, nx, ny, LMID); px = nx; py = ny; } }
      for (let y = Math.ceil(j.y - bh); y <= j.y; y++) { const hw = bw * Math.sqrt(Math.max(0, 1 - ((y - j.y) / bh) ** 2)); r.rect(j.x - hw, y, 2 * hw, 1, HOT); }
      targets.push({ x: j.x - bw, y: j.y - bh, w: 2 * bw, h: bh + 0.05 * N });
    }
    w.jelly = w.jelly.filter((j) => !j.leave || j.y > -0.1 * N);
    // the schools: cohesion, alignment, separation, a heading they share, and the sky's walls (the leaving ones head
    // out through them)
    const vmax = (0.12 + 0.12 * mid) * N, vmin = vmax * 0.4, box = [0.04 * N, 0.06 * N, 0.96 * N, roof - 0.06 * N];
    for (const sc of w.schools) {
      const { X, Y, VX, VY } = sc, n = X.length;
      let mx = 0, my = 0, mvx = 0, mvy = 0;
      for (let i = 0; i < n; i++) { mx += X[i]; my += Y[i]; mvx += VX[i]; mvy += VY[i]; }
      mx /= n; my /= n; mvx /= n; mvy /= n;
      if (sc.leave) { sc.head = followA(sc.head, mx < 0.5 * N ? Math.PI : 0, dt); if (mx < -0.15 * N || mx > 1.15 * N) sc.gone = true; }
      else if (mx < box[0] + 0.1 * N) sc.head = followA(sc.head, 0, dt); else if (mx > box[2] - 0.1 * N) sc.head = followA(sc.head, Math.PI, dt);
      if (my < box[1] + 0.06 * N) sc.head = followA(sc.head, 0.5 * Math.sign(Math.cos(sc.head) || 1), dt); else if (my > box[3] - 0.06 * N) sc.head = followA(sc.head, -0.5 * Math.sign(Math.cos(sc.head) || 1), dt);
      const gx = Math.cos(sc.head) * vmax, gy = Math.sin(sc.head) * vmax * 0.5, sep = (w.kind === 'shoal' ? 0.032 : 0.045) * N;
      for (let i = 0; i < n; i++) {
        let ax = (mx - X[i]) * 0.35 + (mvx - VX[i]) * 1.2 + (gx - VX[i]) * 1.4, ay = (my - Y[i]) * 0.35 + (mvy - VY[i]) * 1.2 + (gy - VY[i]) * 1.4;
        for (let j = 0; j < n; j++) { if (j === i) continue; const dx = X[i] - X[j], dy = Y[i] - Y[j], d2 = dx * dx + dy * dy; if (d2 < sep * sep && d2 > 1e-6) { const d = Math.sqrt(d2), k = ((sep - d) / sep) * 40; ax += (dx / d) * k * sep; ay += (dy / d) * k * sep; } }
        if (!sc.leave) { if (X[i] < box[0]) ax += (box[0] - X[i]) * 20; else if (X[i] > box[2]) ax -= (X[i] - box[2]) * 20; }
        if (Y[i] < box[1]) ay += (box[1] - Y[i]) * 20; else if (Y[i] > box[3]) ay -= (Y[i] - box[3]) * 20;
        VX[i] += ax * dt; VY[i] += ay * dt;
        const sp = Math.hypot(VX[i], VY[i]) || 1, cl = clamp(sp, vmin, vmax) / sp;
        VX[i] *= cl; VY[i] *= cl;
        X[i] += VX[i] * dt; Y[i] += VY[i] * dt;
        const c = Math.cos(Math.atan2(VY[i], VX[i])), s3 = Math.sin(Math.atan2(VY[i], VX[i])), fl2 = (w.kind === 'shoal' ? 2.5 : 3.5) * u, tw = Math.sin(t * 12 + i) * 0.5;
        r.poly([[X[i] + c * fl2, Y[i] + s3 * fl2], [X[i] - s3 * fl2 * 0.4, Y[i] + c * fl2 * 0.4], [X[i] - c * fl2, Y[i] - s3 * fl2], [X[i] + s3 * fl2 * 0.4, Y[i] - c * fl2 * 0.4]], sc.col);
        r.poly([[X[i] - c * fl2, Y[i] - s3 * fl2], [X[i] - c * fl2 * 1.7 - s3 * fl2 * (0.6 + tw), Y[i] - s3 * fl2 * 1.7 + c * fl2 * (0.6 + tw)], [X[i] - c * fl2 * 1.7 + s3 * fl2 * (0.6 - tw), Y[i] - s3 * fl2 * 1.7 - c * fl2 * (0.6 - tw)]], sc.col);
      }
      targets.push({ x: mx - 0.06 * N, y: my - 0.04 * N, w: 0.12 * N, h: 0.08 * N });
    }
    w.schools = w.schools.filter((sc) => !sc.gone);
    // the flood: everything under the water darkened, its surface rippling
    if (w.lvl < N) {
      const y0 = Math.max(0, Math.ceil(w.lvl)), buf = r.buf;
      for (let i = y0 * N; i < N * N; i++) if (buf[i] < DIM) buf[i] += DIM;
      for (let x = 0; x < N; x++) { const y = w.lvl + Math.sin(x * 0.15 + t * 3) * 1.2 * u; r.set(x, y, BRIGHT); r.set(x, y + 1, LMID); }
    }
  },
};
// an angle eased toward another, the short way round, at a turning rate of about a radian a second
const followA = (a, to, dt) => a + wrapAngle(to - a) * Math.min(1, dt * 1.5);

// ---------------------------------------------------------------------------------------------- endlessstairs
// A staircase that always rises: fourteen steps round the top of a square tower, each a little higher than the
// last, and the last one up meets the first. The drawing is an honest projection of a stair that does not close:
// its end lies a step's worth along the line of sight from its start, so the two meet on the screen and every step
// is drawn exactly as its neighbours expect (far to near). Hooded figures climb it a step a beat forever. Beside
// it an aqueduct of the same make: the water runs downhill all along its zigzag (it does, every stretch), comes out
// at the top of a tower and falls, ever faster and thinner, onto a mill wheel that turns with the flow and feeds
// the channel again. Towers with bells that swing on a snare; a kick sends a surge down the water; a note lights a
// lantern. The kind: all climbing, lanterns, or half of them going down forever. A drop: the view turns a quarter
// round and gravity turns with it: the figures stand on the walls and walk on along them, and it turns back.
const CLIMB_W = { ascend: [3, 2, 1], lanterns: [2, 2, 1], both: [1, 2, 3] };
// the stair's cells round the tower: five along +x, five along +y, two back along -x and two along -y; the
// fifteenth cell is the first again, three cells over, three up and three nearer: one and the same on the screen
const STAIR = (() => { const c = [[0, 0]]; for (const [dx, dy, n] of [[1, 0, 5], [0, 1, 5], [-1, 0, 2], [0, -1, 2]]) for (let k = 0; k < n; k++) { const [x, y] = c[c.length - 1]; c.push([x + dx, y + dy]); } return c; })();
// the view looks down steeply enough (screen y = 0.7 of a cell per unit across, 1 per unit up) that the line of sight
// runs along (1, 1, 1.4): the loop climbs 1.4 x 3 = 4.2 in fourteen steps of 0.3
const NS = 14, LAM = 1.4, RISE = (LAM * 3) / NS;

// a wall hanging `depth` cells down from its top edge (xa, ya)-(xb, yb), its sides plumb: filled column by column
function wall(r, xa, ya, xb, yb, depth, col) {
  if (xb < xa) { let q = xa; xa = xb; xb = q; q = ya; ya = yb; yb = q; }
  const N = r.N, buf = r.buf, x0 = Math.max(0, Math.round(xa)), x1 = Math.min(N, Math.round(xb)), k = (yb - ya) / Math.max(1e-6, xb - xa);
  for (let x = x0; x < x1; x++) { const yt = ya + (x + 0.5 - xa) * k, y0 = Math.max(0, Math.round(yt)), y1 = Math.min(N, Math.round(yt + depth)); for (let i = y0 * N + x, e = y1 * N; i < e; i += N) buf[i] = col; }
}
// a hooded figure `h` tall standing on (x, y) facing `dir`, its legs at `ph`: a robe, a pointed hood, a lantern
function monk(r, x, y, h, dir, ph, lit, lantern, u) {
  const st = Math.sin(ph) * h * 0.08;
  r.rect(x - h * 0.1 + st, y - h * 0.18, mx1(h * 0.08), h * 0.18, FIG);
  r.rect(x + h * 0.03 - st, y - h * 0.18, mx1(h * 0.08), h * 0.18, FIG);
  r.poly([[x - h * 0.2, y - h * 0.12], [x + h * 0.2, y - h * 0.12], [x + h * 0.1, y - h * 0.75], [x - h * 0.1, y - h * 0.75]], DARK);
  r.poly([[x - h * 0.13, y - h * 0.68], [x + h * 0.13, y - h * 0.68], [x - dir * h * 0.05, y - h]], DARK);
  r.rect(x + dir * h * 0.02 - h * 0.04, y - h * 0.78, h * 0.08, h * 0.07, BLACK);
  if (lantern) { const lx = x + dir * h * 0.2, ly = y - h * 0.38; r.line(x + dir * h * 0.08, y - h * 0.5, lx, ly - h * 0.08, FIG); r.rect(lx - h * 0.05, ly - h * 0.08, h * 0.1, h * 0.12, lit > 0.1 ? BRIGHT : dim(HOT)); }
}

const endlessstairs = {
  init(W) {
    const { w, rnd, N } = W, kind = rollW(rnd, CLIMB_W, bandOf(W.a));
    Object.assign(w, { N, kind, monks: Array.from({ length: 5 }, (_, i) => ({ s: i * 2.8, down: kind === 'both' && (i & 1) === 1, lit: 0 })), bells: [{ a: 0, w: 0 }, { a: 0, w: 0 }],
      flow: 0.5, surge: 0, wheel: 0, om: 1, drops: [], splash: [], rot: 0, turnT: -1, tmp: null });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W;
    if (w.N !== N || !w.tmp || w.tmp.length !== N * N) { if (w.N !== N) endlessstairs.init(W); w.tmp = new Uint8Array(N * N); }
    if (f.section === 'change') { // a new kind may turn some of them round: each goes on from the step it is on
      w.kind = rollW(rnd, CLIMB_W, bandOf(W.a));
      const st0 = Math.floor(w.bt || 0) + ease(Math.min(1, ((w.bt || 0) % 1) * 2.5));
      w.monks.forEach((m, i) => { const down = w.kind === 'both' && (i & 1) === 1; if (down !== m.down) { m.s += (m.down ? -st0 : st0) - (down ? -st0 : st0); m.down = down; } });
    }
    if (f.section === 'drop' && w.turnT < 0) w.turnT = 0;
    const s0 = 0.072 * N, ax = 0.866 * s0, ay = (LAM / 2) * s0, az = s0, ox = 0.3 * N, oy = 0.13 * N, D = 14, b = bps(f);
    const PX = (X, Y) => ox + (X - Y) * ax, PY = (X, Y, Z) => oy + (X + Y) * ay - Z * az;
    for (const h of hits) {
      if (isLow(h)) w.surge = Math.min(1.5, w.surge + 0.6 * h.strength);
      else if (h.kind === 'snare') for (const bl of w.bells) bl.w += (rnd() < 0.5 ? -1 : 1) * 4;
      if (isTonal(h)) w.monks[h.pc % w.monks.length].lit = 1;
    }
    w.surge = Math.max(0, w.surge - dt * 0.8);
    w.flow = follow(w.flow, 0.35 + 0.6 * clamp(f.rel.midDrive) + w.surge, dt, 0.5);
    // the sky; towers far off that widen as they rise, with bells swinging in their tops
    band(r, 0.45 * N, N, LMID, 0, 0.5);
    for (const [k, tx, th] of [[0, 0.06, 0.55], [1, 0.93, 0.62]]) {
      const X = tx * N, top = N - th * N, bl = w.bells[k];
      swing(bl, dt, 0.03 * N, GR * N, 0.6);
      r.poly([[X - 0.025 * N, N], [X + 0.025 * N, N], [X + 0.04 * N, top], [X - 0.04 * N, top]], dim(MID));
      for (let y = top + 0.05 * N; y < N; y += 0.07 * N) r.rect(X - 0.006 * N, y, 0.012 * N, 0.02 * N, DARK);
      r.rect(X - 0.05 * N, top - 0.012 * N, 0.1 * N, 0.012 * N, MID);
      r.rect(X - 0.035 * N, top - 0.07 * N, 0.07 * N, 0.058 * N, dim(MID));
      r.rect(X - 0.025 * N, top - 0.062 * N, 0.05 * N, 0.045 * N, LMID);
      const bx = X + Math.sin(bl.a) * 0.02 * N, by = top - 0.06 * N + Math.cos(bl.a) * 0.02 * N;
      r.line(X, top - 0.062 * N, bx, by, FIG);
      r.poly([[bx - 0.012 * N, by + 0.012 * N], [bx + 0.012 * N, by + 0.012 * N], [bx + 0.006 * N, by - 0.006 * N], [bx - 0.006 * N, by - 0.006 * N]], HOT);
      r.poly([[X - 0.045 * N, top - 0.07 * N], [X + 0.045 * N, top - 0.07 * N], [X, top - 0.12 * N]], dim(MID));
    }
    // the aqueduct: from the wheel at A it runs away from us down a gentle slope, a zigzag of four stretches that
    // ends, on the screen, at the top of the tower over the wheel; there it falls
    const sw = 0.06 * N, Ax = 0.79 * N, Ay = 0.86 * N, Q = (dx, dy, dz) => [Ax + (dx - dy) * 0.866 * sw, Ay + (dx + dy) * 0.5 * sw - dz * sw];
    const legs = [[0, 0, 0], [0, -3, -0.25], [-2, -3, -0.5], [-2, -4, -0.75], [-4, -4, -1]], cpts = legs.map(([x, y, z]) => Q(x, y, z));
    for (let k = legs.length - 1; k > 0; k--) {
      const [x, y, z] = legs[k], g0 = Q(x, y, z - 1.2);
      r.rect(g0[0] - 0.012 * N, cpts[k][1], 0.024 * N, g0[1] - cpts[k][1], MID); // a pier under each bend
      r.stroke(cpts[k][0], cpts[k][1], cpts[k - 1][0], cpts[k - 1][1], mx1(0.025 * N), DARK);
      r.stroke(cpts[k][0], cpts[k][1] - u, cpts[k - 1][0], cpts[k - 1][1] - u, mx1(0.012 * N), COOL);
    }
    // the water in the channel: dashes running from the wheel to the far end at the speed of the flow
    for (let k = 0; k < 4; k++) {
      const [x0, y0] = cpts[k], [x1, y1] = cpts[k + 1], len = Math.hypot(x1 - x0, y1 - y0);
      for (let d = ((t * w.flow * 0.15 * N) % (0.04 * N)); d < len; d += 0.04 * N) { const q = d / len; r.rect(x0 + (x1 - x0) * q, y0 + (y1 - y0) * q - u, mx1(1.5 * u), mx1(u), BRIGHT); }
    }
    // the tower over the wheel, up to where the channel's far end meets it, and the channel's last bend laid on
    // top of it
    const [Bx, By] = cpts[4], gtop = Q(0, 0, -1.2);
    r.rect(Ax - 0.035 * N, By, 0.035 * N, gtop[1] - By, MID);
    r.rect(Ax, By + 0.012 * N, 0.03 * N, gtop[1] - By - 0.012 * N, DARK);
    for (let y = By + 0.03 * N; y < gtop[1] - 0.02 * N; y += 0.05 * N) r.rect(Ax - 0.022 * N, y, 0.01 * N, 0.018 * N, DARK);
    r.poly([[Ax - 0.035 * N, By], [Ax, By - 0.012 * N], [Ax + 0.03 * N, By], [Ax, By + 0.012 * N]], LMID);
    r.stroke(cpts[3][0], cpts[3][1], Bx, By, mx1(0.025 * N), DARK);
    r.stroke(cpts[3][0], cpts[3][1] - u, Bx, By - u, mx1(0.012 * N), COOL);
    // the fall: drops leave the spout at the channel's speed and fall faster and faster, the stream thinning
    const wy = Ay - 0.035 * N;
    if ((w.dropT = (w.dropT || 0) - dt) <= 0) { w.dropT = 0.02 / w.flow; w.drops.push({ x: Bx + 0.004 * N + (rnd() - 0.5) * 0.008 * N, y: By, vy: 0.1 * N * w.flow }); }
    w.drops = w.drops.filter((d) => {
      d.vy += GR * N * dt;
      d.y += d.vy * dt;
      if (d.y >= wy) { if (rnd() < 0.3) w.splash.push({ x: d.x, y: wy, vx: (rnd() - 0.5) * 0.2 * N, vy: -rnd() * 0.25 * N, life: 0.4 }); return false; }
      const thin = 0.1 * N / Math.max(0.1 * N, d.vy);
      r.rect(d.x + (d.x - Bx - 0.004 * N) * (thin - 1), d.y, mx1(u * (0.5 + thin)), mx1(d.vy * 0.025), d.vy > 0.5 * N ? BRIGHT : LMID);
      return true;
    }).slice(-150);
    // the mill wheel: driven by the water's weight on its paddles, held back by its own drag
    w.om = follow(w.om, 0.4 + 2.2 * w.flow, dt, 1.2);
    w.wheel -= w.om * dt; // the water's weight on the paddles on its near side turns it that way
    const wx = Ax + 0.045 * N, wr = 0.045 * N;
    for (let k = 0; k < 8; k++) { const a = w.wheel + (k * TAU) / 8, c = Math.cos(a), s2 = Math.sin(a); r.stroke(wx, wy + 0.04 * N, wx + c * wr, wy + 0.04 * N + s2 * wr, mx1(u), DARK); r.rect(wx + c * wr - 0.008 * N, wy + 0.04 * N + s2 * wr - 0.008 * N, 0.016 * N, 0.016 * N, MID); }
    circ(r, wx, wy + 0.04 * N, wr * 0.8, DARK);
    r.disc(wx, wy + 0.04 * N, mx1(1.5 * u), FIG);
    w.splash = particles(W, w.splash, BRIGHT);
    targets.push({ x: wx - wr, y: wy - wr * 0.2, w: 2 * wr, h: 2 * wr });

    // the staircase: each step a block from its tread down out of the picture, drawn far to near; the figures
    // stand on their treads among them
    const bt = beatsOf(w, f, dt), stepT = Math.floor(bt) + ease(Math.min(1, (bt % 1) * 2.5)), on = [];
    for (const m of w.monks) {
      const s = m.s + (m.down ? -stepT : stepT), i0 = Math.floor(s), fr = s - i0, a = ((i0 % NS) + NS) % NS, c0 = STAIR[a], c1 = STAIR[a + 1];
      const z0 = a * RISE, z1 = (a + 1) * RISE, x = lerp(PX(c0[0] + 0.5, c0[1] + 0.5), PX(c1[0] + 0.5, c1[1] + 0.5), fr), y = lerp(PY(c0[0] + 0.5, c0[1] + 0.5, z0), PY(c1[0] + 0.5, c1[1] + 0.5, z1), fr) - Math.sin(Math.PI * fr) * 0.012 * N;
      const dir = Math.sign(PX(c1[0], c1[1]) - PX(c0[0], c0[1]) || 1) * (m.down ? -1 : 1), key = Math.max(c0[0] + c0[1], c1[0] + c1[1] - (a === NS - 1 ? 6 : 0));
      m.lit = Math.max(0, m.lit - dt * 0.7);
      on.push({ m, x, y, dir, key, ph: s * Math.PI, done: false });
    }
    const order = [];
    for (let i = 0; i < NS; i++) order.push(i);
    order.sort((p, q) => STAIR[p][0] + STAIR[p][1] - STAIR[q][0] - STAIR[q][1]);
    const turned = w.turnT >= 0, hm = 0.075 * N;
    for (const i of order) {
      const [cx, cy] = STAIR[i], Z = i * RISE;
      const a = [PX(cx, cy), PY(cx, cy, Z)], b2 = [PX(cx + 1, cy), PY(cx + 1, cy, Z)], c = [PX(cx + 1, cy + 1), PY(cx + 1, cy + 1, Z)], d = [PX(cx, cy + 1), PY(cx, cy + 1, Z)];
      wall(r, b2[0], b2[1], c[0], c[1], D * az, MID); // the face toward +x
      wall(r, d[0], d[1], c[0], c[1], D * az, DARK); // the face toward +y
      for (let k = 1; k < 9; k++) { const yy = k * 0.045 * N; r.line(b2[0], b2[1] + yy, c[0], c[1] + yy, dim(MID)); r.line(d[0], d[1] + yy, c[0], c[1] + yy, dim(DARK)); } // the courses of stone
      r.poly([a, b2, c, d], LMID);
      r.line(d[0], d[1], c[0], c[1], FIG);
      r.line(b2[0], b2[1], c[0], c[1], FIG);
      r.line(a[0], a[1], d[0], d[1], dim(LMID));
      if (i % 2 === 0) for (const [p0, p1, col] of [[b2, c, DARK], [d, c, BLACK]]) { const mx2 = (p0[0] + p1[0]) / 2, my2 = (p0[1] + p1[1]) / 2 + 0.1 * N; r.rect(mx2 - 0.007 * N, my2, 0.014 * N, 0.03 * N, col); r.disc(mx2, my2, 0.007 * N, col); } // arched windows
      if (!turned) for (const o of on) if (!o.done && o.key === cx + cy) { o.done = true; monk(r, o.x, o.y, hm, o.dir, o.ph, o.m.lit, w.kind === 'lanterns', u); targets.push({ x: o.x - hm * 0.25, y: o.y - hm, w: hm * 0.5, h: hm }); }
    }
    // a drop: the view turns a quarter round and back; the figures, standing by the new gravity, keep their feet on
    // whatever is under them now: the walls
    if (turned) {
      w.turnT += dt * b;
      const tq = w.turnT < 2 ? ease(w.turnT / 2) : w.turnT < 14 ? 1 : 1 - ease((w.turnT - 14) / 2), th = tq * Math.PI / 2;
      if (w.turnT > 16) w.turnT = -1;
      const buf = r.buf, tmp = w.tmp, c = Math.cos(th), s2 = Math.sin(th), m = N / 2;
      tmp.set(buf);
      for (let y = 0; y < N; y++) {
        const dy = y + 0.5 - m;
        let fx = m + (0.5 - m) * c + dy * s2, fy = m - (0.5 - m) * s2 + dy * c;
        for (let i = y * N, e = i + N; i < e; i++, fx += c, fy -= s2) buf[i] = fx >= 0 && fy >= 0 && fx < N && fy < N ? tmp[(fy | 0) * N + (fx | 0)] : BG;
      }
      for (const o of on) {
        const dx = o.x - m, dy = o.y - m, x = m + dx * c - dy * s2;
        let y = m + dx * s2 + dy * c - 3 * u;
        const yi0 = Math.round(y), xi = Math.round(x);
        if (xi < 0 || xi >= N) continue;
        for (let k = 0; k < 0.12 * N && y < N - 1; k++, y++) { const v = buf[Math.round(y) * N + xi]; if (v !== BG && v !== LMID && v !== COOL && v !== BRIGHT) break; }
        if (yi0 < 0) continue;
        monk(r, x, y, hm, o.dir, o.ph, o.m.lit, w.kind === 'lanterns', u);
        targets.push({ x: x - hm * 0.25, y: y - hm, w: hm * 0.5, h: hm });
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------- giantwalk
// A tiny town at the feet of giants walking slowly by: a giant takes a step a bar, the foot planted while the body
// goes over it and the other swung ahead and set down on the bar line, and the ground shakes, the dust flies, the
// roofs rattle (a hop and a fall back, the nearer the higher) and the people jump; tiny people stand on the giants'
// hats and hop a beat; birds nesting in a beard fly off on the hats and circle home; a snare rings the church bell; a
// note lights a window. The kind is who walks: a pair, an old one alone, a procession of three going smaller into
// the distance. A drop: the nearest giant sits down by the town, and the town falls into his shadow and lights up.
const GIANT_W = { pair: [3, 2, 1], elder: [2, 2, 1], procession: [1, 2, 3] };
const GIANTS = { pair: [[1, 0.8], [1.45, 0.8]], elder: [[1, 0.82]], procession: [[1, 0.78], [1.35, 0.78], [1.8, 0.78]] }; // depth, height at depth 1

// a giant walking right, its hips at (x, hy), the planted foot at fa and the swinging one at fb (lifted by `lift`) on
// the ground g, `H` tall: legs bent at the knee, a long coat, a big beard, a wide hat. The legs keep who they are:
// `nearSwing` says whether the near one is the swinging one this step; the arm across from the swinging leg comes
// forward by `arm` (-1 back .. 1 forward), the other goes back. Returns the hat's brim and the beard
function giantWalker(r, x, hy, fa, fb, lift, g, H, arm, nearSwing, col, beard, u) {
  const l = H * 0.27, lw = mx1(H * 0.055), far = dim(col), armFar = nearSwing ? arm : -arm;
  const leg = (fx, fy, c) => { const [kx, ky] = knee(x, hy, fx, fy, l, l, -1); r.stroke(x, hy, kx, ky, lw, c); r.stroke(kx, ky, fx, fy, lw, c); r.rect(fx - lw * 0.5, fy - lw * 0.8, lw * 2.2, lw * 0.8, c); };
  if (nearSwing) leg(fa, g, far); else leg(fb, g - lift, far);
  const sy = hy - H * 0.36;
  r.stroke(x + H * 0.02, sy + H * 0.04, x + H * 0.02 + armFar * H * 0.18, sy + H * 0.33, lw * 0.9, far); // the far arm
  r.poly([[x - H * 0.1, sy], [x + H * 0.1, sy], [x + H * 0.14, hy + H * 0.08], [x - H * 0.13, hy + H * 0.08]], col);
  hatch(r, x - H * 0.12, sy + H * 0.05, H * 0.07, hy - sy, far, 2);
  if (nearSwing) leg(fb, g - lift, col); else leg(fa, g, col);
  const hx = x + H * 0.03, hdy = sy - H * 0.07, hr = H * 0.065;
  r.disc(hx, hdy, hr, LMID);
  r.poly([[hx + hr * 0.8, hdy - hr * 0.2], [hx + hr * 1.3, hdy + hr * 0.25], [hx + hr * 0.8, hdy + hr * 0.3]], LMID);
  r.set(hx + hr * 0.45, hdy - hr * 0.25, FIG);
  r.poly([[hx - hr * 0.3, hdy + hr * 0.2], [hx + hr * 0.95, hdy + hr * 0.35], [hx + hr * 0.6, hdy + hr * 2.6], [hx + hr * 0.1, hdy + hr * 2.9], [hx - hr * 0.4, hdy + hr * 1.2]], beard);
  hatch(r, hx - hr * 0.2, hdy + hr * 0.8, hr * 0.8, hr * 1.6, dim(beard), 2);
  r.rect(hx - hr * 2.2, hdy - hr * 0.95, hr * 4.4, mx1(hr * 0.3), col);
  r.rect(hx - hr * 1, hdy - hr * 2.2, hr * 2, hr * 1.35, col);
  r.rect(hx - hr * 1, hdy - hr * 1.15, hr * 2, mx1(hr * 0.2), HOT);
  r.stroke(x - H * 0.02, sy + H * 0.04, x - H * 0.02 - armFar * H * 0.18, sy + H * 0.33, lw, col); // the near arm
  return { bx: hx, by: hdy - hr * 0.95, bw: hr * 2.2, nx: hx + hr * 0.4, ny: hdy + hr * 1.4, nr: hr };
}

const giantwalk = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { N, kind: '', giants: [], houses: Array.from({ length: 12 }, (_, i) => ({ x: (i + 0.15 * rnd()) * 0.088 * N, w: (0.05 + 0.025 * rnd()) * N, h: (0.04 + 0.025 * rnd()) * N, roof: { y: 0, vy: 0 }, lit: 0 })),
      people: Array.from({ length: 7 }, () => ({ x: rnd() * N, d: rnd() < 0.5 ? -1 : 1, hop: { y: 0, vy: 0 }, ph: rnd() * TAU })), dust: [], bell: { a: 0, w: 0 }, sit: 0, sitT: -1, bar: -1, shade: 0 });
    giantwalk.set(W, rollW(rnd, GIANT_W, bandOf(W.a)));
  },
  // who walks: the giants already walking walk on, newcomers come in from off the left, the ones no longer wanted
  // walk off the right and are gone; the first of them (the nearest) is the one with the nests, who sits on a drop
  set(W, kind) {
    const { w, rnd, N } = W, spec = GIANTS[kind], first = !w.giants.length, stay = w.giants.filter((G) => !G.leave);
    w.kind = kind;
    stay.forEach((G, i) => { if (i >= spec.length) G.leave = true; });
    for (let i = stay.length; i < spec.length; i++) {
      const [z, h] = spec[i], H = (h * N) / z, S = H * 0.36, x = first ? (0.15 + 0.35 * i + 0.1 * rnd()) * N : -0.35 * N - (i - stay.length) * 0.35 * N;
      w.giants.push({ z, H, S, st: x, sw: x - S / 2, ns: false, lead: first && i === 0, beard: kind === 'elder' ? BRIGHT : MID, leave: false,
        birds: first && i === 0 ? Array.from({ length: 3 + (kind === 'elder' ? 3 : 0) }, (_, k) => ({ k, fly: 0, x: 0, y: 0, vx: 0, vy: 0, ph: rnd() * TAU })) : [], folk: Array.from({ length: 3 }, (_, k) => ({ k, hop: { y: 0, vy: 0 } })) });
    }
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W;
    if (w.N !== N) giantwalk.init(W);
    const hz = 0.5 * N, K = 0.36 * N, gy = (z) => hz + K / z, townY = 0.9 * N, g = GR * N;
    if (f.section === 'change') { const k = rollW(rnd, GIANT_W, bandOf(W.a)); if (k !== w.kind) giantwalk.set(W, k); }
    if (f.section === 'drop' && w.sitT < 0) w.sitT = 0;
    const bt = beatsOf(w, f, dt), bar = Math.floor(bt / 4), p = (bt / 4) % 1;
    const sitting = w.sitT >= 0;
    if (sitting) { w.sitT += dt * bps(f); if (w.sitT > 20) w.sitT = -1; }
    w.sit = follow(w.sit, sitting && w.sitT < 17 ? 1 : 0, dt, 0.5);
    for (const h of hits) {
      if (h.kind === 'hat') { const gi = w.giants[0], bd = gi.birds.find((q) => !q.fly); if (bd) { bd.fly = 3 + rnd() * 2; bd.vx = (rnd() - 0.3) * 0.3 * N; bd.vy = -0.35 * N; } }
      else if (h.kind === 'snare') w.bell.w += (rnd() < 0.5 ? -1 : 1) * 5;
      if (isTonal(h)) w.houses[h.pc % w.houses.length].lit = 1;
    }
    // the sky, far hills, the clouds drifting
    band(r, 0.3 * N, hz, LMID, 0, 0.55);
    for (let k = 0; k < 4; k++) { const cx = ((k * 0.31 + f.rel.midClock * 0.01) % 1.3 - 0.15) * N; cloud(r, cx, (0.1 + 0.07 * k) * N, (0.16 + 0.04 * k) * N, LMID, BRIGHT); }
    for (let x = 0; x < N; x++) { const top = hz - (0.02 + 0.02 * Math.sin(x * 0.04) + 0.01 * Math.sin(x * 0.11)) * N; r.rect(x, top, 1, N - top, dim(MID)); }
    r.rect(0, hz + 0.02 * N, N, N, MID);
    for (const z of [3, 2, 1.5, 1.2]) r.rect(0, gy(z), N, mx1(u * 0.5), dim(MID));
    // the giants, far to near, a step a bar
    const newBar = w.bar !== bar;
    w.bar = bar;
    const walkers = w.giants.slice().sort((a, b) => b.z - a.z);
    for (const G of walkers) {
      const H = G.H, ground = gy(G.z), gi = G.lead ? 0 : 1;
      // the one who sits keeps both feet down, and gets up into his next step only on a bar line
      let release = false;
      if (gi === 0) { if (w.sit > 0.02) G.hold = true; else if (newBar && G.hold) { G.hold = false; release = true; } }
      const still = gi === 0 && !!G.hold;
      if (newBar && !still && !release) { // the swung foot comes down on the bar line: the shake, the dust, the town jumps
        const land = G.st + G.S / 2;
        G.sw = G.st; G.st = land; G.ns = !G.ns;
        if (gi === 0 || w.kind !== 'procession') s.shake = Math.max(s.shake, 0.8 / G.z);
        kick(w.dust, rnd, land, ground, 14, 0.3 * N, 0.9, 1 / G.z);
        for (const hs of w.houses) { const d = Math.abs(hs.x + hs.w / 2 - land); if (hs.roof.y === 0) hs.roof.vy = -0.25 * N * Math.exp(-d / (0.2 * N)) / G.z; }
        for (const pp of w.people) if (pp.hop.y === 0) pp.hop.vy = -0.2 * N * Math.exp(-Math.abs(pp.x - land) / (0.25 * N)) / G.z;
      }
      const q = still ? 0 : p, sq = q * q * (3 - 2 * q), fb = G.sw + (G.st + G.S / 2 - G.sw) * sq, lift = Math.sin(Math.PI * q) * H * 0.07;
      let hx = G.st - G.S / 4 + (G.S / 2) * q, hy = ground - H * 0.5;
      if (gi === 0) { hx = lerp(hx, G.st - G.S * 0.1, w.sit); hy = lerp(hy, ground - H * 0.14, w.sit); }
      if (hx > 1.35 * N) { if (G.leave) { G.gone = true; continue; } const sh = -1.75 * N; G.st += sh; G.sw += sh; hx += sh; }
      const col = G.z > 1.3 ? dim(DARK) : DARK, arm = -Math.cos(Math.PI * q) * (0.3 + 0.4 * f.level) * (1 - (gi === 0 ? w.sit : 0));
      const top = giantWalker(r, hx, hy, G.st, still ? G.sw : fb, still ? 0 : lift, ground, H, arm, G.ns, col, G.beard, u);
      targets.push({ x: hx - H * 0.2, y: hy - H * 0.55, w: H * 0.4, h: ground - hy + H * 0.55 });
      // the people on the hat: a hop a beat
      for (const fk of G.folk) {
        if (f.beat.on && fk.hop.y === 0 && (fk.k + (f.beat.count | 0)) % 2 === 0) fk.hop.vy = -0.2 * N / G.z;
        hop(fk.hop, dt, g / G.z);
        const px = top.bx + (fk.k - 1) * top.bw * 0.6, py = top.by + fk.hop.y;
        r.rect(px - mx1(0.5 * u), py - 0.016 * N / G.z, mx1(u), 0.016 * N / G.z, FIG);
        r.set(px, py - 0.02 * N / G.z, LMID);
        if (fk.hop.y < 0) r.set(px + 1, py - 0.018 * N / G.z, FIG);
      }
      // the birds in the beard: nesting, flying off, circling back home
      for (const bd of G.birds) {
        const nx = top.nx + ((bd.k % 3) - 1) * top.nr * 0.5, ny = top.ny + Math.floor(bd.k / 3) * top.nr * 0.6 + (bd.k % 3) * top.nr * 0.3;
        if (bd.fly > 0) {
          bd.fly -= dt;
          const homing = bd.fly < 1.5;
          bd.vx += ((homing ? (nx - bd.x) * 4 : Math.cos(t * 1.3 + bd.k) * 0.3 * N) - bd.vx * (homing ? 2.5 : 0.8)) * dt;
          bd.vy += ((homing ? (ny - bd.y) * 4 : Math.sin(t * 1.7 + bd.k) * 0.3 * N) - bd.vy * (homing ? 2.5 : 0.8)) * dt;
          bd.x += bd.vx * dt; bd.y += bd.vy * dt; bd.ph += dt * 16;
          if (bd.fly <= 0) bd.fly = 0;
          bird(r, bd.x, bd.y, mx1(4 * u), bd.ph, FIG);
        } else { bd.x = nx; bd.y = ny; oval(r, nx, ny + u, 0.012 * N, mx1(0.005 * N), dim(MID)); r.rect(nx - u, ny - 1.5 * u, mx1(2 * u), mx1(1.5 * u), FIG); }
      }
    }
    w.giants = w.giants.filter((G) => !G.gone);
    // the town: houses in a row, roofs that hop when a foot lands near and fall back; the church and its bell;
    // its people walking about
    w.shade = follow(w.shade, w.sit, dt, 0.6);
    const G0 = w.giants[0], sx0 = G0.st;
    for (const hs of w.houses) {
      hop(hs.roof, dt, g);
      hs.lit = Math.max(0, hs.lit - dt * 0.5);
      const x = hs.x, top = townY - hs.h;
      r.rect(x, top, hs.w, hs.h, LMID);
      r.poly([[x - hs.w * 0.1, top + hs.roof.y], [x + hs.w * 1.1, top + hs.roof.y], [x + hs.w * 0.5, top - hs.h * 0.7 + hs.roof.y]], HOT);
      const inShade = w.shade > 0.3 && Math.abs(x + hs.w / 2 - sx0) < 0.32 * N * w.shade;
      r.rect(x + hs.w * 0.3, top + hs.h * 0.3, mx1(hs.w * 0.25), mx1(hs.h * 0.3), hs.lit > 0.2 || inShade ? BRIGHT : DARK);
    }
    const cx = 0.53 * N, ct = townY - 0.1 * N;
    r.rect(cx - 0.025 * N, ct, 0.05 * N, 0.1 * N, LMID);
    r.poly([[cx - 0.025 * N, ct], [cx + 0.025 * N, ct], [cx, ct - 0.07 * N]], DARK);
    swing(w.bell, dt, 0.012 * N, g, 0.8);
    const bx = cx + Math.sin(w.bell.a) * 0.012 * N, by = ct - 0.01 * N + Math.cos(w.bell.a) * 0.012 * N;
    r.line(cx, ct - 0.01 * N, bx, by, FIG);
    r.rect(bx - 0.005 * N, by - 0.004 * N, 0.01 * N, 0.008 * N, HOT);
    // the shadow of the one sitting down: the ground, the houses and the street in it darkened, the windows lit
    if (w.shade > 0.02) {
      const buf = r.buf, ry = 0.17 * N, cy = N, rx = 0.36 * N * w.shade; // an oval shadow on the ground, its edge dithered
      for (let y = Math.max(0, Math.round(cy - ry)); y < N; y++) {
        const hw = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)), row = (y & 7) << 3;
        for (let x = Math.max(0, Math.round(sx0 - hw)); x < Math.min(N, Math.round(sx0 + hw)); x++) { const i = y * N + x, edge = (hw - Math.abs(x - sx0)) / (0.04 * N); if (buf[i] < DIM && buf[i] !== BRIGHT && (edge > 1 || BAYER[row | (x & 7)] < edge)) buf[i] += DIM; }
      }
    }
    for (const pp of w.people) {
      pp.x += pp.d * 0.02 * N * dt;
      if (pp.x < 0 || pp.x > N) pp.d = -pp.d;
      hop(pp.hop, dt, g);
      walker(r, pp.x, townY + 0.035 * N + pp.hop.y, 0.02 * N, FIG, t * 5 * Math.PI + pp.ph, pp.d, {}); // a third of a house high; legs at 5π a second carry 0.02 N a second, the planted foot put
    }
    w.dust = dust(W, w.dust, LMID);
  },
};

// ---------------------------------------------------------------------------------------------- chickenhut
// A hut on a hen's legs walking through a birch forest: a bird's gait, the heel joint bending back, a foot planted
// while the hut goes over it and the other lifted high with its toes curled and set down ahead; the forest goes by
// at its depths. Smoke from its chimney, slowing as it rises and drifting behind; a hag flying past in a mortar,
// steering with a pestle on the snares; leaves coming down on the hats; a note lights the window. The kind is the
// gait: a stroll (a step every other beat), a trot (a step a beat), or hops on the kicks. A section change turns it
// round to walk the other way. A drop: it squats down on the ground and its door swings open on a lit room.
const GAIT_W = { stroll: [3, 2, 1], trot: [1, 2, 2], hop: [0, 1, 3] };

// a hen's leg from the hip to the foot, the heel joint behind (dir is where it walks): a feathered drumstick, a
// scaly shank, three toes ahead and one behind, curled while the foot is up
function henLeg(r, hx, hy, fx, fy, l, dir, col, curl, u) {
  const [kx, ky] = knee(hx, hy, fx, fy, l, l, dir);
  r.stroke(hx, hy, kx, ky, mx1(l * 0.28), col === LMID ? MID : dim(MID));
  r.stroke(kx, ky, fx, fy, mx1(l * 0.11), col);
  for (const a of [-0.5, 0, 0.45]) { const ta = (dir > 0 ? 0 : Math.PI) + a * dir + curl * dir * 1.2, tl = l * (0.32 - curl * 0.15); r.line(fx, fy, fx + Math.cos(ta) * tl, fy + Math.sin(ta) * tl * (curl ? 1 : 0.15), col); }
  r.line(fx, fy, fx - dir * l * 0.15, fy - l * 0.03, col);
}
// the hut: a log cabin `wd` wide standing on (x, y) facing `dir`, narrowed by `sc` as it turns round, a thatched
// roof, a chimney, a window, and a door that swings open by `door`
function hut(r, x, y, wd, sc, dir, door, lit, u) {
  const hw = (wd / 2) * Math.max(0.08, sc), ht = wd * 0.62;
  r.rect(x - hw, y - ht, 2 * hw, ht, MID);
  for (let k = 1; k < 6; k++) r.rect(x - hw, y - (ht * k) / 6, 2 * hw, mx1(u * 0.7), DARK);
  r.rect(x - hw - u, y - mx1(u * 1.5), 2 * hw + 2 * u, mx1(u * 1.5), DARK);
  r.frame(Math.round(x - hw), Math.round(y - ht), Math.round(2 * hw), Math.round(ht), FIG); // cut out with an ink edge
  const roof = [[x - hw * 1.25, y - ht], [x + hw * 1.25, y - ht], [x + hw * 0.2, y - ht - wd * 0.48], [x - hw * 0.2, y - ht - wd * 0.48]];
  r.poly(roof, LMID);
  hatch(r, x - hw * 0.9, y - ht - wd * 0.4, hw * 1.8, wd * 0.38, dim(LMID), 2);
  for (let k = 0; k < 4; k++) r.line(roof[k][0], roof[k][1], roof[(k + 1) % 4][0], roof[(k + 1) % 4][1], FIG);
  r.rect(x + dir * hw * 0.45 - wd * 0.04, y - ht - wd * 0.5, wd * 0.08, wd * 0.2, DARK);
  if (sc < 0.25) return [x + dir * hw * 0.45, y - ht - wd * 0.5];
  const wx = x + dir * hw * 0.45, dw = wd * 0.16 * sc, dx = x - dir * hw * 0.35;
  r.rect(wx - wd * 0.08 * sc, y - ht * 0.72, wd * 0.16 * sc, wd * 0.15, lit > 0.1 ? (lit > 0.5 ? BRIGHT : HOT) : DARK);
  r.rect(dx - dw / 2, y - ht * 0.78, dw, ht * 0.75, door > 0.05 ? BRIGHT : DARK);
  if (door > 0.05) { const ow = dw * Math.cos(door * 1.4); r.rect(dx - dw / 2 - (dir > 0 ? ow : 0), y - ht * 0.78, ow, ht * 0.75, DARK); r.rect(dx - dw * 0.2, y - ht * 0.6, dw * 0.4, ht * 0.4, HOT); }
  return [x + dir * hw * 0.45, y - ht - wd * 0.5];
}
// a hag in a mortar flying at (x, y) toward `dir`, the pestle held like a steering oar at `oar` radians
function mortar(r, x, y, sz, dir, oar, u) {
  r.poly([[x - sz * 0.35, y - sz * 0.2], [x + sz * 0.35, y - sz * 0.2], [x + sz * 0.22, y + sz * 0.2], [x - sz * 0.22, y + sz * 0.2]], DARK);
  r.rect(x - sz * 0.38, y - sz * 0.24, sz * 0.76, mx1(sz * 0.08), MID);
  r.poly([[x - sz * 0.15, y - sz * 0.22], [x + sz * 0.15, y - sz * 0.22], [x + dir * sz * 0.1, y - sz * 0.62], [x - dir * sz * 0.08, y - sz * 0.5]], FIG);
  r.disc(x + dir * sz * 0.08, y - sz * 0.6, sz * 0.11, LMID);
  r.poly([[x - dir * sz * 0.05, y - sz * 0.72], [x + dir * sz * 0.2, y - sz * 0.66], [x - dir * sz * 0.12, y - sz * 0.5]], HOT);
  r.line(x + dir * sz * 0.17, y - sz * 0.6, x + dir * sz * 0.3, y - sz * 0.52, LMID);
  const px = x - dir * sz * 0.05, py = y - sz * 0.45, ex = px - dir * Math.cos(oar) * sz * 0.9, ey = py + Math.sin(oar) * sz * 0.9;
  r.stroke(px, py, ex, ey, mx1(u), LMID);
  r.disc(ex, ey, mx1(sz * 0.08), LMID);
}

const chickenhut = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { N, kind: rollW(rnd, GAIT_W, bandOf(W.a)), X: 0, camX: -0.5 * N, dir: 1, yaw: 0, turnT: -1, st: 0, sw: -0.06 * N, lastStep: -1, hold: true, air: null, puffs: [], dust: [], leaves: [],
      witch: { x: -0.3 * N, y: 0.2 * N, vx: 0, vy: 0, dir: 1, oar: 0.4, ov: 0, wait: 1 }, lit: 0, squat: 0, sqT: -1, door: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W;
    if (w.N !== N) chickenhut.init(W);
    const g = GR * N, ground = 0.88 * N, l = 0.13 * N, S = 0.12 * N, bt = beatsOf(w, f, dt);
    if (f.section === 'change') { w.kind = rollW(rnd, GAIT_W, bandOf(W.a)); if (w.turnT < 0) w.turnT = 0; }
    if (f.section === 'drop' && w.sqT < 0) w.sqT = 0;
    // squatting: the legs fold, the hut sits on the ground, the door opens; and up again
    if (w.sqT >= 0) { w.sqT += dt * bps(f); if (w.sqT > 16) w.sqT = -1; }
    w.squat = follow(w.squat, w.sqT >= 0 && w.sqT < 13 ? 1 : 0, dt, 0.35);
    w.door = follow(w.door, w.sqT > 2 && w.sqT < 12 ? 1 : 0, dt, 0.3);
    // turning round: a cut-out turned on its axis, the legs marking time
    if (w.turnT >= 0) { w.turnT += dt / 1.2; if (w.turnT >= 0.5 && w.yawSide !== w.turnT >= 0.5) { w.dir = -w.dir; const k = w.st; w.st = w.sw; w.sw = k; } w.yawSide = w.turnT >= 0.5; if (w.turnT >= 1) w.turnT = -1; }
    const sc = w.turnT >= 0 ? Math.abs(Math.cos(w.turnT * Math.PI)) : 1, dir = w.dir, canMove = w.turnT < 0 && w.squat < 0.05;
    for (const h of hits) {
      if (isLow(h)) {
        if (w.kind === 'hop' && !w.air && canMove) w.air = { y: 0, vy: -0.45 * N * h.strength, vx: dir * 0.3 * N };
        else if (w.kind !== 'hop') s.shake = Math.max(s.shake, 0.15);
      } else if (h.kind === 'snare') { w.witch.ov = 9; w.witch.vy += (rnd() < 0.5 ? -1 : 1) * 0.12 * N; w.witch.vx += w.witch.dir * 0.1 * N; }
      else if (h.kind === 'hat') for (let k = 0; k < 2; k++) w.leaves.push({ x: rnd() * N, y: 0.05 * N + rnd() * 0.2 * N, vx: 0, vy: 0, ph: rnd() * TAU, life: 5 });
      if (isTonal(h)) w.lit = 1;
    }
    w.lit = Math.max(0, w.lit - dt * 0.7);
    // the gait: two feet, the stance one planted, the other swung a stride ahead over a step's time; or a hop
    let hx, hy, fa = w.st, fb, liftB = 0, curl = 0, tuck = 0;
    // a pause (turning, squatting) ends only on a step's line, so the feet never jump
    const per = w.kind === 'stroll' ? 0.5 : 1, sb = bt * per, si = Math.floor(sb);
    if (!canMove || w.kind === 'hop') w.hold = true;
    if (si !== w.lastStep) {
      if (canMove && w.kind !== 'hop') { if (w.hold) w.hold = false; else { const land = w.st + dir * S / 2; w.sw = w.st; w.st = land; w.ns = !w.ns; kick(w.dust, rnd, land - w.camX, ground, 4, 0.08 * N, 0.5); } }
      w.lastStep = si;
    }
    const moving = canMove && !w.hold && w.kind !== 'hop', q = moving ? sb - si : 0;
    if (w.air) { // a hop: a parabola, the feet going with the body (curled, tucked up under it once off the ground)
      const A = w.air;
      A.vy += g * dt; A.y += A.vy * dt; w.st += A.vx * dt; w.sw += A.vx * dt;
      if (A.y >= 0) { A.y = 0; w.air = null; s.shake = Math.max(s.shake, 0.4); kick(w.dust, rnd, w.st - w.camX, ground, 10, 0.2 * N, 0.6); }
      hx = (w.st + w.sw) / 2; hy = ground - l * 1.75 + A.y; fa = w.st; fb = w.sw; curl = 1;
      tuck = clamp(-A.y / (0.02 * N));
    } else if (!moving) {
      hx = (w.st + w.sw) / 2; hy = ground - l * 1.75; fb = w.sw;
    } else {
      const e = q * q * (3 - 2 * q);
      fb = w.sw + (w.st + dir * S / 2 - w.sw) * e; liftB = Math.sin(Math.PI * q) * 0.07 * N; curl = q > 0.1 && q < 0.85 ? 1 : 0;
      hx = w.st - dir * S / 4 + dir * (S / 2) * q; hy = ground - l * 1.75 - Math.sin(Math.PI * q) * 0.008 * N;
    }
    hy = lerp(hy, ground - l * 0.35, w.squat);
    w.X = hx;
    const cam0 = w.camX;
    w.camX = follow(w.camX, hx - 0.45 * N, dt, 0.9);
    const dc = w.camX - cam0;
    // the forest: far, middle and near birches at their depths
    const layer = (z, sp, wd, col, mark, seed) => {
      const off = w.camX / z;
      for (let j = Math.floor((off - wd) / sp); j * sp < off + N + wd; j++) {
        if (hash(j, seed) < 0.4) continue;
        const x = j * sp - off + hash(j, seed + 1) * sp * 0.5, top = -5, bw = mx1(wd * (0.6 + 0.6 * hash(j, seed + 2)));
        r.rect(x, top, bw, N, col);
        if (mark >= 0) for (let k = 0; k < 10; k++) { const yy = hash(j, seed + 10 + k) * N; r.rect(x + (hash(k, j) < 0.5 ? 0 : bw * 0.5), yy, bw * 0.5, mx1(u * (0.6 + hash(j, k))), mark); }
      }
    };
    band(r, 0, 0.5 * N, LMID, 0.3, 0);
    layer(3, 0.1 * N, 1.2 * u, DARK, -1, 11);
    band(r, 0.62 * N, 0.82 * N, dim(LMID), 0, 0.6);
    layer(1.8, 0.17 * N, 2.5 * u, LMID, FIG, 23);
    r.rect(0, 0.82 * N, N, N, dim(MID));
    // pebbles, each going by at its own depth's pace (the horizon of the floor is at 0.79 N): those level with the
    // feet exactly at the feet's, so a planted foot stays put among them
    for (let k = 0; k < 30; k++) { const y = 0.83 * N + hash(k, 6) * 0.15 * N, kz = (y - 0.79 * N) / (ground - 0.79 * N), x = ((hash(k, 5) * 1.5 * N - w.camX * kz) % (1.5 * N) + 1.5 * N) % (1.5 * N) - 0.2 * N; r.rect(x, y, mx1(u), mx1(2 * u), MID); }
    // the hut and its legs, the smoke from the chimney slowing as it climbs, left behind as it walks
    const sx = hx - w.camX, fsx = fa - w.camX, fbx = fb - w.camX, hipY = hy;
    // the legs keep who they are: the far one drawn first, whichever of them is swinging
    const footY = (y) => (tuck > 0 ? Math.min(y, hipY + l * 1.75 - tuck * 0.04 * N) : y); // off the ground the feet ride up with the hut
    const legSw = (c) => henLeg(r, sx, hipY, fbx, footY(ground - liftB), l, dir, c, curl, u), legSt = (c) => henLeg(r, sx, hipY, fsx, footY(ground), l, dir, c, tuck > 0 ? 1 : 0, u);
    if (w.ns) { legSt(dim(LMID)); legSw(LMID); } else { legSw(dim(LMID)); legSt(LMID); }
    const [chx, chy] = hut(r, sx, hipY, 0.22 * N, sc, dir, w.door, w.lit, u);
    if (w.door > 0.3) r.poly([[sx - dir * 0.04 * N, ground], [sx - dir * 0.12 * N, ground + 0.08 * N], [sx + dir * 0.02 * N, ground + 0.08 * N], [sx - dir * 0.0 * N, ground]], dim(BRIGHT));
    targets.push({ x: sx - 0.13 * N, y: hipY - 0.26 * N, w: 0.26 * N, h: ground - hipY + 0.26 * N });
    for (const p of w.puffs) p.x -= dc;
    for (const p of w.dust) p.x -= dc;
    w.dust = dust(W, w.dust, LMID);
    if (rnd() < dt * (2 + 5 * f.level)) w.puffs.push(puff(chx, chy, w.air ? w.air.vx : moving ? dir * (S / 2) * bps(f) * per : 0, -0.18 * N, 2.5)); // the smoke leaves with the hut's own speed
    w.puffs = smoke(W, w.puffs, -dir * 0.01 * N, LMID, BRIGHT).slice(-40);
    // the near trees, in front of everything
    layer(0.7, 0.45 * N, 6 * u, BRIGHT, FIG, 37);
    // leaves on the hats: down at their terminal speed, swaying
    w.leaves = w.leaves.filter((lf) => {
      lf.ph += dt * 4;
      lf.vy = follow(lf.vy, 0.08 * N, dt, 0.5);
      lf.vx = follow(lf.vx, Math.sin(lf.ph) * 0.08 * N, dt, 0.3);
      lf.x += lf.vx * dt - dc;
      lf.y += lf.vy * dt;
      lf.life -= dt;
      r.rect(lf.x, lf.y, mx1(1.5 * u * Math.abs(Math.cos(lf.ph))), mx1(u), Math.cos(lf.ph) > 0 ? HOT : dim(HOT));
      return lf.life > 0 && lf.y < ground;
    });
    // the hag in her mortar: across the sky, a stroke of the pestle on each snare to steer, then gone a while
    const Wt = w.witch;
    if (Wt.wait > 0) { if ((Wt.wait -= dt) <= 0) { Wt.dir = rnd() < 0.5 ? 1 : -1; Wt.x = Wt.dir > 0 ? -0.15 * N : 1.15 * N; Wt.y = (0.12 + 0.2 * rnd()) * N; Wt.vx = Wt.dir * 0.2 * N; Wt.vy = 0; } }
    else {
      Wt.vx = follow(Wt.vx, Wt.dir * 0.2 * N, dt, 1.5);
      Wt.vy = follow(Wt.vy, Math.sin(t * 1.2) * 0.03 * N, dt, 0.8);
      Wt.x += Wt.vx * dt; Wt.y = clamp(Wt.y + Wt.vy * dt, 0.06 * N, 0.45 * N);
      Wt.ov += (-30 * (Wt.oar - 0.4) - 5 * Wt.ov) * dt; Wt.oar += Wt.ov * dt;
      mortar(r, Wt.x, Wt.y, 0.08 * N, Wt.dir, Wt.oar, u);
      targets.push({ x: Wt.x - 0.05 * N, y: Wt.y - 0.06 * N, w: 0.1 * N, h: 0.08 * N });
      if (Wt.x < -0.25 * N || Wt.x > 1.25 * N) Wt.wait = 2 + rnd() * 3;
    }
  },
};

// ---------------------------------------------------------------------------------------------- moonfishing
// Someone sits in the curve of a crescent moon fishing for stars over the clouds. The line hangs from the rod's tip
// to the floating bait (a small star) as a catenary; stars swim about down there, and on a note one bites: the line
// goes taut, the rod bends with the pull and the moon tips toward it, the star fights, is reeled in up the line,
// swung over and dropped into a bucket (it falls into it), and a new bait is cast out on a parabola and floats. The
// moon rocks a little on the beat and bobs on the kicks; a snare jigs the rod; the clouds drift by below. The kind
// is the angler: a sleeper in a nightcap, a child in a straw hat, a cat. A drop: a big catch, a whole ringed planet
// hauled up out of the clouds on the line, the rod bent double and the moon tipped, before it slips off and away.
const ANGLER_W = { sleeper: [3, 2, 1], child: [2, 2, 2], cat: [1, 2, 3] };

// a five-pointed star at (x, y), radius R, turned by a
function star5(r, x, y, R, a, c) {
  if (R < 1.5) { r.set(x, y, c); if (R >= 1) { r.set(x - 1, y, c); r.set(x + 1, y, c); r.set(x, y - 1, c); r.set(x, y + 1, c); } return; }
  const pts = [];
  for (let k = 0; k < 10; k++) { const b = a - Math.PI / 2 + (k * Math.PI) / 5, rr = k & 1 ? R * 0.45 : R; pts.push([x + Math.cos(b) * rr, y + Math.sin(b) * rr]); }
  r.poly(pts, c);
}

const moonfishing = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { N, kind: rollW(rnd, ANGLER_W, bandOf(W.a)), rock: { x: 0, v: 0 }, bob: { x: 0, v: 0 }, side: 1, ten: 0, jig: 0,
      bait: { st: 'float', x: 0.72 * N, y: 0.72 * N, vx: 0, vy: 0, fx: 0.72 * N, fy: 0.72 * N, t: 0, catch: null }, len: 0.3 * N,
      fish: Array.from({ length: 6 }, (_, i) => ({ x: (0.45 + 0.09 * i) * N, y: (0.66 + 0.08 * rnd()) * N, ph: rnd() * TAU, R: (0.016 + 0.008 * rnd()) * N })),
      fall: null, bucket: 1, planet: null, drift: 0, poof: [], tw: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W;
    if (w.N !== N) moonfishing.init(W);
    const g = GR * N, B = w.bait, R = 0.17 * N;
    if (f.section === 'change') { const k = rollW(rnd, ANGLER_W, bandOf(W.a)); if (k !== w.kind) { w.kind = k; burst(w.poof, rnd, 0.36 * N, 0.33 * N, 16, 0.25 * N, BRIGHT, 0.5); } } // a puff, and someone else sits there
    if (f.section === 'drop' && !w.planet) { w.planet = { x: B.x, y: 1.15 * N, st: 'up', t: 0, vx: 0, vy: 0 }; B.st = 'planet'; B.catch = null; w.fall = null; }
    for (const h of hits) {
      if (isTonal(h) && B.st === 'float') { // the nearest star darts at the bait and is hooked
        let best = null, bd = 1e9;
        for (const fs of w.fish) { const d = Math.hypot(fs.x - B.x, fs.y - B.y); if (d < bd) { bd = d; best = fs; } }
        if (best) { B.st = 'fight'; B.t = 0; B.catch = { R: best.R, c: h.pc % 2 ? BRIGHT : HOT }; best.x = rnd() < 0.5 ? -0.05 * N : 1.05 * N; best.y = (0.7 + 0.15 * rnd()) * N; }
      }
      if (isLow(h)) w.bob.v -= 0.12 * N * h.strength;
      else if (h.kind === 'snare') w.jig = 1;
      else if (h.kind === 'hat') w.tw++;
    }
    if (tick(w, f, dt)) { w.side = -w.side; w.rock.v += w.side * 0.12; }
    // the moon: rocked by the beat and by the pull on the line, which acts at the rod's length from its middle
    const pull = B.st === 'fight' || B.st === 'reel' ? 0.7 : B.st === 'planet' ? 1.6 : 0;
    w.ten = follow(w.ten, pull, dt, 0.2);
    w.rock.v += (-6 * w.rock.x - 1.5 * w.rock.v + w.ten * 1.2) * dt;
    w.rock.x += w.rock.v * dt;
    spring(w.bob, dt, 12, 3);
    w.jig = Math.max(0, w.jig - dt * 4);
    const C = [0.34 * N, 0.3 * N + w.bob.x], P = turn(C[0], C[1], w.rock.x);
    // the sky: stars that twinkle on the hats, and clouds below drifting at two depths
    stars(r, N, 50, 3, 0.65, LMID, w.tw);
    for (const [y0, sp, col, seed] of [[0.74, 0.012, dim(LMID), 61], [0.84, 0.03, LMID, 71]]) {
      const off = f.rel.midClock * sp * N;
      for (let k = -1; k < 8; k++) { const x = ((k * 0.19 * N - off) % (1.52 * N) + 1.52 * N) % (1.52 * N) - 0.2 * N, s2 = (0.12 + 0.06 * hash(k, seed)) * N; r.disc(x, y0 * N, s2 * 0.5, col); r.disc(x + s2 * 0.5, y0 * N - s2 * 0.15, s2 * 0.45, col); r.disc(x - s2 * 0.5, y0 * N + s2 * 0.1, s2 * 0.35, col); }
      r.rect(0, y0 * N + 0.03 * N, N, N, col);
    }
    // the planet of the drop, under the clouds' top layer until it is hauled up
    const Pl = w.planet;
    if (Pl) {
      Pl.t += dt;
      if (Pl.st === 'up') { Pl.y = follow(Pl.y, 0.66 * N, dt, 1.2); Pl.x = follow(Pl.x, 0.68 * N, dt, 1.2); if (Pl.t > 5) { Pl.st = 'off'; B.st = 'cast0'; } }
      else { Pl.vx += 0.04 * N * dt; Pl.vy -= 0.02 * N * dt; Pl.x += Pl.vx * dt; Pl.y += Pl.vy * dt; if (Pl.x > 1.3 * N) w.planet = null; }
      if (w.planet) {
        const pr = 0.075 * N;
        r.disc(Pl.x, Pl.y, pr, MID);
        for (let k = -2; k <= 2; k++) r.rect(Pl.x - pr * Math.sqrt(1 - (k * 0.35) ** 2), Pl.y + k * pr * 0.35, 2 * pr * Math.sqrt(1 - (k * 0.35) ** 2), mx1(u), k & 1 ? dim(MID) : LMID);
        circ(r, Pl.x, Pl.y, pr * 1.6, BRIGHT, 0.25);
        circ(r, Pl.x, Pl.y, pr * 1.5, LMID, 0.25);
        targets.push({ x: Pl.x - pr * 1.6, y: Pl.y - pr, w: pr * 3.2, h: pr * 2 });
      }
    }
    // the crescent: the outer circle's lower arc between the horns, back along the inner circle's
    const moon = [];
    for (let k = 0; k <= 16; k++) { const a = -0.608 + (k / 16) * (3.75 + 0.608); moon.push(P(Math.cos(a) * R, Math.sin(a) * R)); }
    for (let k = 0; k <= 16; k++) { const a = 3.405 - (k / 16) * (3.405 + 0.263); moon.push(P(Math.cos(a) * R * 0.85, -0.35 * R + Math.sin(a) * R * 0.85)); }
    r.poly(moon, BRIGHT);
    for (let k = 17; k < 33; k++) r.line(moon[k][0], moon[k][1], moon[k + 1][0], moon[k + 1][1], LMID);
    for (const [cx2, cy2, cr] of [[-0.3, 0.7, 0.07], [0.35, 0.68, 0.05], [0.0, 0.88, 0.06]]) { const [a1, b1] = P(cx2 * R, cy2 * R); r.disc(a1, b1, cr * R, LMID); }
    // the bucket of caught stars, the angler, the rod bent by the pull and lifted by a jig
    const bk = P(-0.3 * R, 0.43 * R);
    r.poly([[bk[0] - 0.035 * N, bk[1] - 0.04 * N], [bk[0] + 0.035 * N, bk[1] - 0.04 * N], [bk[0] + 0.026 * N, bk[1] + 0.01 * N], [bk[0] - 0.026 * N, bk[1] + 0.01 * N]], DARK);
    for (let k = 0; k < Math.min(6, w.bucket); k++) star5(r, bk[0] - 0.022 * N + k * 0.009 * N, bk[1] - 0.042 * N - (k & 1) * u, mx1(1.2 * u), t + k, k & 1 ? HOT : BRIGHT);
    const seat = P(0.12 * R, 0.45 * R), sx = seat[0], sy = seat[1], kind = w.kind;
    r.rect(sx - 0.02 * N, sy - 0.05 * N, 0.04 * N, 0.05 * N, kind === 'cat' ? DARK : FIG);
    r.stroke(sx + 0.01 * N, sy - 0.005 * N, sx + 0.045 * N, sy + 0.035 * N + Math.sin(t * 3) * u, mx1(1.5 * u), kind === 'cat' ? DARK : FIG);
    const hx = sx, hy = sy - 0.07 * N;
    r.disc(hx, hy, 0.022 * N, kind === 'cat' ? DARK : LMID);
    if (kind === 'sleeper') { r.poly([[hx - 0.024 * N, hy - 0.008 * N], [hx + 0.024 * N, hy - 0.008 * N], [hx - 0.05 * N, hy + 0.03 * N]], HOT); r.disc(hx - 0.05 * N, hy + 0.032 * N, mx1(0.006 * N), BRIGHT); r.line(hx + 0.004 * N, hy, hx + 0.014 * N, hy, FIG); }
    else if (kind === 'child') { r.rect(hx - 0.04 * N, hy - 0.012 * N, 0.08 * N, mx1(0.008 * N), LMID); r.rect(hx - 0.02 * N, hy - 0.028 * N, 0.04 * N, 0.018 * N, LMID); r.rect(hx - 0.02 * N, hy - 0.016 * N, 0.04 * N, mx1(u), HOT); r.set(hx + 0.01 * N, hy + 0.003 * N, FIG); }
    else { for (const k of [-1, 1]) r.poly([[hx + k * 0.02 * N, hy - 0.005 * N], [hx + k * 0.006 * N, hy - 0.015 * N], [hx + k * 0.022 * N, hy - 0.035 * N]], DARK); r.set(hx + 0.008 * N, hy - 0.004 * N, COOL); r.set(hx - 0.004 * N, hy - 0.004 * N, COOL); r.stroke(sx - 0.02 * N, sy - 0.01 * N, sx - 0.05 * N, sy - 0.05 * N + Math.sin(t * 2) * 2 * u, mx1(u), DARK); }
    const a0 = -0.55 + w.rock.x - w.jig * 0.5, bend = w.ten * 0.45 + 0.05, rl = 0.2 * N, base = [sx + 0.02 * N, sy - 0.035 * N];
    let rx0 = base[0], ry0 = base[1];
    for (let k = 1; k <= 6; k++) { const a = a0 + bend * (k / 6) ** 2, nx = rx0 + Math.cos(a) * rl / 6, ny = ry0 + Math.sin(a) * rl / 6; r.stroke(rx0, ry0, nx, ny, mx1(u * (1.6 - k * 0.15)), FIG); rx0 = nx; ry0 = ny; }
    r.stroke(sx + 0.012 * N, sy - 0.04 * N, base[0] + 0.01 * N, base[1] - 0.004 * N, mx1(1.2 * u), kind === 'cat' ? DARK : FIG);
    const tipX = rx0, tipY = ry0;
    targets.push({ x: sx - 0.04 * N, y: hy - 0.04 * N, w: 0.1 * N, h: sy - hy + 0.06 * N });
    // the wild stars swim slowly about over the clouds
    for (const fs of w.fish) {
      fs.ph += dt * 0.6;
      fs.x += Math.cos(fs.ph) * 0.03 * N * dt + (fs.x < 0.4 * N ? 0.02 * N * dt : fs.x > 0.95 * N ? -0.02 * N * dt : 0);
      fs.y += Math.sin(fs.ph * 1.3) * 0.015 * N * dt;
      star5(r, fs.x, fs.y, fs.R, fs.ph * 0.3, Math.sin(t * 3 + fs.ph) > 0.7 ? BRIGHT : LMID);
    }
    // the bait and the line
    B.t += dt;
    let taut = false;
    if (B.st === 'float') {
      B.fx = 0.83 * N + Math.sin(t * 0.4) * 0.04 * N; B.fy = 0.7 * N + Math.sin(t * 0.7) * 0.01 * N * (1 + f.level);
      B.x = follow(B.x, B.fx, dt, 0.8); B.y = follow(B.y, B.fy - w.jig * 0.03 * N, dt, 0.3);
      w.len = Math.hypot(B.x - tipX, B.y - tipY) * 1.2;
    } else if (B.st === 'fight' || B.st === 'reel') {
      taut = true;
      w.len = Math.hypot(B.x - tipX, B.y - tipY); // taut: as long as it reaches, and shorter as it is reeled in
      if (B.st === 'fight') { B.x += Math.sin(t * 17) * 0.02 * N * dt * 10; B.y += Math.cos(t * 13) * 0.01 * N * dt * 10; if (B.t > 1) { B.st = 'reel'; B.t = 0; } }
      else { const dx = tipX - B.x, dy = tipY - B.y, d = Math.hypot(dx, dy), sp = (w.kind === 'cat' ? 0.4 : 0.25) * N * dt; if (d < sp + 2 * u) { B.st = 'swing'; B.t = 0; B.x0 = B.x; B.y0 = B.y; } else { B.x += (dx / d) * sp; B.y += (dy / d) * sp; } }
    } else if (B.st === 'swing') { // swung over the bucket on the line, and let go
      const q = Math.min(1, B.t / 0.6), tx = bk[0], ty = bk[1] - 0.09 * N;
      B.x = lerp(B.x0, tx, q); B.y = lerp(B.y0, ty, q) - Math.sin(Math.PI * q) * 0.08 * N;
      w.len = Math.hypot(B.x - tipX, B.y - tipY) * 1.05; // a short line, all but taut under the star's weight
      if (q >= 1) { w.fall = { x: B.x, y: B.y, vy: 0, R: B.catch.R, c: B.catch.c }; B.st = 'cast0'; }
    } else if (B.st === 'cast0') { B.st = 'cast'; B.x = tipX; B.y = tipY; B.vx = 0.32 * N; B.vy = -0.15 * N; B.catch = null; w.len = 0; } // reeled right in, then paid out with the cast
    else if (B.st === 'cast') { // the cast: out on a parabola, and the star bait floats where it comes down
      B.vy += g * dt; B.x += B.vx * dt; B.y += B.vy * dt;
      w.len = Math.max(w.len, Math.hypot(B.x - tipX, B.y - tipY) * 1.02);
      if (B.vy > 0 && B.y > 0.7 * N) { B.st = 'float'; B.vx = 0; B.vy = 0; }
    } else if (B.st === 'planet' && Pl) { taut = true; B.x = Pl.x; B.y = Pl.y - 0.075 * N; if (Pl.st === 'off') B.st = 'cast0'; }
    if (taut) catenary(r, tipX, tipY, B.x, B.y, 0, FIG);
    else if (B.st !== 'cast0') catenary(r, tipX, tipY, B.x, B.y, w.len, FIG);
    if (B.catch) star5(r, B.x, B.y, B.catch.R, t * 5, B.catch.c);
    else if (B.st !== 'planet') star5(r, B.x, B.y, mx1(1.3 * u), t, BRIGHT);
    // the caught star falling into the bucket
    if (w.fall) { const F = w.fall; F.vy += g * dt; F.y += F.vy * dt; star5(r, F.x, F.y, F.R, t * 4, F.c); if (F.y > bk[1] - 0.04 * N) { w.fall = null; w.bucket = w.bucket % 6 + 1; } }
    targets.push({ x: B.x - 0.02 * N, y: B.y - 0.02 * N, w: 0.04 * N, h: 0.04 * N });
    w.poof = particles(W, w.poof, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- eyeballoon
// A hot-air balloon that is a giant eye, rising over a marsh: it floats where its warm air's lift meets its weight
// (the air thinning with height), the bass and the burner on the kicks heating it so it rises, damped, and settles
// when they ease; a basket hangs below on ropes and swings as a pendulum when the balloon speeds or slows. The eye
// darts its gaze to a new point of the sky on every beat (a saccade, then still), blinks on a snare; a note lights
// a will-o'-the-wisp over the reeds; the water mirrors it all, rippled. The kind is the hour (dawn mist, dusk,
// night). A drop: it turns to look straight at you, and the pupil opens wide.
const EYE_W = { dawn: [3, 1, 1], dusk: [2, 2, 1], night: [1, 2, 3] };

const eyeballoon = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { N, kind: rollW(rnd, EYE_W, bandOf(W.a)), A: 0.15 * N, vA: 0, heat: 0.6, boost: 0, flame: 0, lx: 0, ly: 0, look: 0, blink: -1, dil: 0, stare: -1,
      x: 0.5 * N, vx: 0, bk: { a: 0, w: 0 }, wisps: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W;
    if (w.N !== N) eyeballoon.init(W);
    const wl = 0.8 * N, g = GR * N, kind = w.kind;
    if (f.section === 'change') w.kind = rollW(rnd, EYE_W, bandOf(W.a));
    if (f.section === 'drop') w.stare = 0;
    for (const h of hits) {
      if (isLow(h)) { w.boost = Math.min(1, w.boost + 0.3 * h.strength); w.flame = 0.25; }
      else if (h.kind === 'snare' && w.blink < 0) w.blink = 0;
      if (isTonal(h)) w.wisps.push({ x: (0.1 + 0.8 * rnd()) * N, y: wl - (0.02 + 0.06 * rnd()) * N, life: 2.5, ph: rnd() * TAU, c: h.pc % 2 ? COOL : BRIGHT });
    }
    // lift: the warm air's buoyancy falls off with height (the air thins); weight; drag
    w.boost = Math.max(0, w.boost - dt * 0.4);
    w.heat = follow(w.heat, 0.25 + 0.75 * clamp(f.rel.bassDrive) + w.boost, dt, 1.5);
    const Hs = 0.32 * N, acc = 0.7 * N * ((1 + w.heat) * Math.exp(-w.A / Hs) - 1) - 0.9 * w.vA;
    w.vA += acc * dt;
    w.A += w.vA * dt;
    if (w.A < 0.07 * N) { w.A = 0.07 * N; w.vA = Math.max(0, w.vA); } // the basket sets down on the water
    if (w.A > 0.42 * N) { w.A = 0.42 * N; w.vA = Math.min(0, w.vA); }
    const vx0 = w.vx;
    w.vx = Math.cos(t * 0.13) * 0.012 * N;
    w.x += w.vx * dt;
    const ax = (w.vx - vx0) / Math.max(dt, 1e-3);
    if (w.stare >= 0) { w.stare += dt * bps(f); if (w.stare > 16) w.stare = -1; }
    const staring = w.stare >= 0, R = 0.15 * N * (1 + 0.12 * (staring ? Math.min(1, w.stare) : 0)), cx = w.x, cy = 0.6 * N - w.A;
    // the gaze: a new point of the sky each beat, reached in a flick (or straight at us while it stares)
    if (tick(w, f, dt)) w.look++;
    const tx = staring ? 0 : Math.cos(w.look * 2.4) * 0.75, ty = staring ? 0 : Math.sin(w.look * 2.4) * 0.55 - 0.1;
    w.lx = follow(w.lx, tx, dt, 0.035); w.ly = follow(w.ly, ty, dt, 0.035);
    w.dil = follow(w.dil, staring ? 1 : 0, dt, 0.5);
    // the sky by the hour
    if (kind === 'night') { stars(r, N, 50, 5, 0.75, LMID, (t * 3) | 0); r.disc(0.85 * N, 0.12 * N, 0.04 * N, LMID); }
    else band(r, 0.35 * N, wl, kind === 'dusk' ? HOT : LMID, 0, kind === 'dusk' ? 0.28 : 0.7);
    if (kind === 'dusk') r.disc(0.2 * N, wl - 0.02 * N, 0.06 * N, HOT);
    for (let x = 0; x < N; x++) { const top = wl - (0.03 + 0.015 * Math.sin(x * 0.09) + 0.01 * Math.sin(x * 0.23)) * N; r.rect(x, top, 1, wl - top, dim(MID)); } // the far bank of trees
    // the basket on its ropes: a pendulum hung from the balloon's mouth, swung by its accelerations
    const mouthY = cy + R * 0.95, ropeL = 0.11 * N;
    swing(w.bk, dt, ropeL, g, 0.7, ax, -acc);
    const bx = cx + Math.sin(w.bk.a) * ropeL, by = mouthY + Math.cos(w.bk.a) * ropeL;
    for (const k of [-1, 1]) r.line(cx + k * R * 0.22, mouthY - R * 0.05, bx + k * 0.025 * N, by - 0.012 * N, FIG);
    r.rect(bx - 0.03 * N, by - 0.012 * N, 0.06 * N, 0.035 * N, MID);
    hatch(r, bx - 0.03 * N, by - 0.008 * N, 0.06 * N, 0.03 * N, DARK, 2);
    r.disc(bx + 0.01 * N, by - 0.02 * N, 0.008 * N, LMID);
    r.rect(bx - 0.002 * N, by - 0.022 * N, 0.008 * N, mx1(u), FIG);
    w.flame = Math.max(0, w.flame - dt);
    if (w.flame > 0) { r.poly([[cx - R * 0.08, mouthY + 0.01 * N], [cx + R * 0.08, mouthY + 0.01 * N], [cx, mouthY - R * 0.4]], HOT); r.poly([[cx - R * 0.04, mouthY], [cx + R * 0.04, mouthY], [cx, mouthY - R * 0.22]], BRIGHT); }
    r.poly([[cx - R * 0.3, cy + R * 0.9], [cx + R * 0.3, cy + R * 0.9], [cx + R * 0.2, mouthY + 0.01 * N], [cx - R * 0.2, mouthY + 0.01 * N]], DARK);
    // the eye: the white, its veins, the iris and the pupil where it looks (foreshortened on the ball), a glint
    r.disc(cx, cy, R + mx1(u), FIG);
    r.disc(cx, cy, R, BRIGHT);
    for (let k = 0; k < 6; k++) { let px = cx + Math.cos(k * 1.05 + 0.3) * R * 0.97, py = cy + Math.sin(k * 1.05 + 0.3) * R * 0.97; for (let s2 = 0; s2 < 4; s2++) { const nx = px + (cx - px) * 0.15 + Math.sin(k * 3 + s2) * 0.01 * N, ny = py + (cy - py) * 0.15 + Math.cos(k * 2 + s2) * 0.01 * N; r.line(px, py, nx, ny, HOT); px = nx; py = ny; } }
    const ix = cx + w.lx * R * 0.62, iy = cy + w.ly * R * 0.62, ri = R * 0.42, fx = 1 - 0.45 * Math.abs(w.lx), fy = 1 - 0.45 * Math.abs(w.ly);
    oval(r, ix, iy, ri * fx, ri * fy, kind === 'dusk' ? HOT : COOL);
    oval(r, ix, iy, ri * 0.8 * fx, ri * 0.8 * fy, kind === 'dusk' ? dim(HOT) : dim(COOL));
    const pr = ri * (0.38 + 0.5 * w.dil);
    oval(r, ix, iy, pr * fx, pr * fy, BLACK);
    r.disc(ix - ri * 0.3, iy - ri * 0.35, mx1(ri * 0.13), WHITE);
    // the lids: the upper comes down and the lower up on a blink
    if (w.blink >= 0) {
      w.blink += dt / 0.22;
      const c = Math.sin(Math.PI * Math.min(1, w.blink)), yl = cy - R + 2 * R * c * 0.62, yb = cy + R - 2 * R * c * 0.38;
      for (let y = Math.floor(cy - R); y < yl; y++) { const hw = Math.sqrt(Math.max(0, R * R - (y + 0.5 - cy) ** 2)); r.rect(cx - hw, y, 2 * hw, 1, LMID); }
      for (let y = Math.ceil(yb); y <= cy + R; y++) { const hw = Math.sqrt(Math.max(0, R * R - (y + 0.5 - cy) ** 2)); r.rect(cx - hw, y, 2 * hw, 1, LMID); }
      const hw1 = Math.sqrt(Math.max(0, R * R - (yl - cy) ** 2));
      r.rect(cx - hw1, yl, 2 * hw1, mx1(u), FIG);
      for (let k = -3; k <= 3; k++) r.line(cx + k * hw1 * 0.28, yl, cx + k * hw1 * 0.3, yl + 0.012 * N, FIG);
      if (w.blink >= 1) w.blink = -1;
    }
    targets.push({ x: cx - R, y: cy - R, w: 2 * R, h: by - cy + R + 0.03 * N });
    // the marsh: the water mirrors what is above it, rippled more toward us and darker; reeds; mist; the wisps
    const buf = r.buf, w0 = Math.round(wl);
    for (let y = w0; y < N; y++) {
      const sy = 2 * w0 - y - 1, k = (y - w0) / (N - w0), off = Math.round(Math.sin(y * 0.8 + t * 2.5) * (0.5 + 2.5 * k) * u);
      if (sy < 0) continue;
      for (let x = 0; x < N; x++) { const sx = Math.min(N - 1, Math.max(0, x + off)), v = buf[sy * N + sx]; buf[y * N + x] = v < DIM ? v + DIM : v; }
    }
    r.rect(0, w0, N, mx1(u * 0.6), LMID);
    for (let k = 0; k < 26; k++) {
      const x = hash(k, 81) * N, hgt = (0.04 + 0.06 * hash(k, 82)) * N, base = wl + (0.005 + 0.15 * hash(k, 83)) * N, lean = Math.sin(t * 1.1 + x * 0.05) * (0.5 + f.level) * 1.5 * u;
      r.line(x, base, x + lean, base - hgt, DARK);
      if (hash(k, 84) < 0.5) oval(r, x + lean, base - hgt + 0.012 * N, mx1(0.005 * N), 0.012 * N, MID);
    }
    for (let y = Math.round(wl - 0.05 * N); y < wl + 0.05 * N; y++) {
      const row = (y & 7) << 3, q = 1 - Math.abs(y - wl) / (0.05 * N), sh = (f.rel.midClock * 8) | 0;
      for (let x = 0; x < N; x++) if (BAYER[row | ((x + sh) & 7)] < q * (kind === 'dawn' ? 0.55 : 0.28) * (0.6 + 0.4 * Math.sin(x * 0.05 + t * 0.3))) buf[y * N + x] = LMID;
    }
    w.wisps = w.wisps.filter((p) => {
      p.life -= dt; p.ph += dt * 3;
      const x = p.x + Math.sin(p.ph) * 2 * u, y = p.y + Math.cos(p.ph * 0.7) * 1.5 * u;
      if (p.life > 0.6 || hash(x | 0, (t * 20) | 0) < p.life) { r.disc(x, y, mx1(1.2 * u), p.c); r.set(x, y - 2 * u, LMID); }
      return p.life > 0;
    });
  },
};

// ---------------------------------------------------------------------------------------------- teaparty
// The tea party that never ends: a long table running out of the picture both ways, odd guests behind it (a hare, a
// dormouse asleep in a teapot snoring with the bass, a figure in a tall hat, an owl, a cat, a lady with a plume),
// a cup at every place. On every bar they all move one place down, each hopping on its arc to the next chair; on
// the hats two neighbours clink cups; on a kick someone pours, the tea flying in a parabola into the next cup; a
// snare wakes the dormouse a moment; they nod on the beat; a note flares the candles of the chandelier, which swings
// from the ceiling on its chain. The kind is the room: a parlour, a garden under a pergola, a hall. A drop: the
// table turns upside down up onto the ceiling, and they carry on with their tea there, gravity turned over for them
// (the tea pours upward), and come back down.
const ROOM_W = { parlour: [3, 2, 1], garden: [2, 2, 2], hall: [1, 2, 3] };
const CAST = ['hare', 'dormouse', 'hatter', 'owl', 'cat', 'plume'];

// a guest of `kind` seated behind the table, its middle at x, the table top at y, `s` its size; `nod` bobs the head,
// `wake` (the dormouse) pops it up out of its teapot
function guest(r, kind, x, y, s, nod, wake, t, u) {
  const hy = y - s * 0.55 + nod;
  if (kind === 'dormouse') {
    const py = y - s * 0.12, my = py - s * 0.18 - wake * s * 0.18;
    r.disc(x, my, s * 0.12, MID);
    for (const k of [-1, 1]) r.disc(x + k * s * 0.1, my - s * 0.1, s * 0.05, MID);
    if (wake > 0.3) { r.set(x - s * 0.04, my - s * 0.01, FIG); r.set(x + s * 0.04, my - s * 0.01, FIG); }
    else { r.line(x - s * 0.06, my, x - s * 0.02, my, FIG); r.line(x + s * 0.02, my, x + s * 0.06, my, FIG); }
    oval(r, x, py, s * 0.22, s * 0.16, BRIGHT);
    r.rect(x - s * 0.22, py - s * 0.03, s * 0.44, mx1(s * 0.04), COOL);
    r.stroke(x + s * 0.2, py, x + s * 0.36, py - s * 0.12, mx1(s * 0.05), BRIGHT);
    circ(r, x - s * 0.24, py, s * 0.07, BRIGHT);
    if (wake < 0.3) circ(r, x + s * 0.14, my - s * 0.06, s * (0.04 + 0.03 * Math.sin(t)), BRIGHT);
    return;
  }
  const body = kind === 'owl' ? MID : kind === 'cat' ? DARK : kind === 'hare' ? LMID : FIG;
  r.poly([[x - s * 0.2, y], [x + s * 0.2, y], [x + s * 0.13, hy + s * 0.12], [x - s * 0.13, hy + s * 0.12]], body);
  if (kind === 'owl') {
    r.disc(x, hy, s * 0.17, MID);
    for (const k of [-1, 1]) { r.disc(x + k * s * 0.07, hy, s * 0.06, BRIGHT); r.set(x + k * s * 0.07, hy, FIG); r.poly([[x + k * s * 0.12, hy - s * 0.12], [x + k * s * 0.17, hy - s * 0.24], [x + k * s * 0.05, hy - s * 0.14]], MID); }
    r.poly([[x - s * 0.02, hy + s * 0.04], [x + s * 0.02, hy + s * 0.04], [x, hy + s * 0.09]], HOT);
    return;
  }
  const head = kind === 'cat' ? DARK : kind === 'hare' ? LMID : LMID;
  r.disc(x, hy, s * 0.13, head);
  if (kind === 'hare') { for (const k of [-1, 1]) { r.poly([[x + k * s * 0.03, hy - s * 0.1], [x + k * s * 0.1, hy - s * 0.1], [x + k * s * 0.08, hy - s * 0.55]], LMID); r.line(x + k * s * 0.065, hy - s * 0.13, x + k * s * 0.075, hy - s * 0.42, HOT); } r.rect(x - s * 0.02, hy + s * 0.07, s * 0.04, s * 0.04, BRIGHT); }
  if (kind === 'cat') { for (const k of [-1, 1]) r.poly([[x + k * s * 0.03, hy - s * 0.08], [x + k * s * 0.13, hy - s * 0.06], [x + k * s * 0.11, hy - s * 0.22]], DARK); for (let k = 0; k < 3; k++) r.line(x - s * 0.1, hy - s * 0.02 + k * s * 0.05, x + s * 0.1, hy - s * 0.02 + k * s * 0.05, dim(DARK)); r.rect(x - s * 0.07, hy + s * 0.03, s * 0.14, mx1(u), BRIGHT); }
  const ec = kind === 'cat' ? COOL : FIG;
  r.set(x - s * 0.045, hy - s * 0.02, ec); r.set(x + s * 0.045, hy - s * 0.02, ec);
  if (kind === 'hatter') { r.rect(x - s * 0.2, hy - s * 0.12, s * 0.4, mx1(s * 0.04), DARK); r.poly([[x - s * 0.12, hy - s * 0.12], [x + s * 0.12, hy - s * 0.12], [x + s * 0.16, hy - s * 0.52], [x - s * 0.16, hy - s * 0.52]], DARK); r.rect(x - s * 0.13, hy - s * 0.22, s * 0.26, mx1(s * 0.05), HOT); r.rect(x - s * 0.08, hy + s * 0.18, s * 0.16, s * 0.05, HOT); r.rect(x - s * 0.07, hy + s * 0.06, s * 0.14, mx1(u), FIG); }
  if (kind === 'plume') { oval(r, x, hy - s * 0.12, s * 0.2, s * 0.05, MID); r.stroke(x + s * 0.05, hy - s * 0.15, x + s * 0.25, hy - s * 0.4 + Math.sin(t * 2) * s * 0.03, mx1(s * 0.05), HOT); r.stroke(x + s * 0.12, hy - s * 0.22, x + s * 0.2, hy - s * 0.32, mx1(s * 0.06), HOT); }
}
// a teacup on the table at (x, y), `s` its size, tea in it to `fill`
function teacup(r, x, y, s, fill) {
  r.poly([[x - s * 0.5, y - s * 0.6], [x + s * 0.5, y - s * 0.6], [x + s * 0.32, y], [x - s * 0.32, y]], BRIGHT);
  circ(r, x + s * 0.55, y - s * 0.35, s * 0.18, BRIGHT);
  r.rect(x - s * 0.7, y, s * 1.4, mx1(s * 0.12), LMID);
  if (fill > 0.05) r.rect(x - s * 0.42, y - s * 0.55, s * 0.84, mx1(s * 0.15), MID);
}

const teaparty = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { N, kind: rollW(rnd, ROOM_W, bandOf(W.a)), lay: new Raster(N), clink: null, pours: [], fills: new Float32Array(16), wake: 0, wakeV: 0, wakeT: 0, flipT: -1, chand: { a: 0, w: 0 }, flare: 0, puffs: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W;
    if (w.N !== N || w.lay.N !== N) teaparty.init(W);
    const g = GR * N, ty = 0.66 * N, sp = 0.17 * N, sz = 0.2 * N, C = CAST.length, bt = beatsOf(w, f, dt), bar = Math.floor(bt / 4), q = clamp(((bt / 4) % 1) * 4);
    if (f.section === 'change') w.kind = rollW(rnd, ROOM_W, bandOf(W.a));
    if (f.section === 'drop' && w.flipT < 0) w.flipT = 0;
    const kmin = Math.floor(-0.6 * N / sp) - 1, kmax = Math.ceil(1.1 * N / sp) + 1, seatX = (k) => k * sp + 0.08 * N, hopping = q < 1;
    for (const h of hits) {
      if (h.kind === 'hat' && !w.clink && !hopping) { const k = 1 + Math.floor(rnd() * 4); w.clink = { k, t: 0 }; }
      else if (isLow(h) && w.pours.length < 2) { const k = 1 + Math.floor(rnd() * 4); if (!w.pours.some((p) => p.k === k)) w.pours.push({ k, t: 0 }); w.chand.w += (rnd() < 0.5 ? -1 : 1) * 0.6 * h.strength; }
      else if (h.kind === 'snare') w.wakeV += 6;
      if (isTonal(h)) w.flare = 1;
    }
    w.wakeV += (-40 * w.wake - 5 * w.wakeV) * dt;
    w.wake = clamp(w.wake + w.wakeV * dt, 0, 1);
    w.flare = Math.max(0, w.flare - dt * 1.2);
    // the room: the wall by kind, the floor, the ceiling with a chandelier swinging on its chain
    const ceil = 0.12 * N, floor = 0.78 * N;
    if (w.kind === 'parlour') {
      for (let x = 0; x < N; x += 0.06 * N) r.rect(x, ceil, 0.025 * N, floor - ceil, dim(LMID));
      r.rect(0, 0.5 * N, N, mx1(1.5 * u), DARK);
      for (const fx of [0.12, 0.72]) { r.rect(fx * N, 0.2 * N, 0.16 * N, 0.2 * N, DARK); r.rect(fx * N + 0.015 * N, 0.215 * N, 0.13 * N, 0.17 * N, LMID); r.disc(fx * N + 0.08 * N, 0.29 * N, 0.035 * N, MID); r.rect(fx * N + 0.05 * N, 0.32 * N, 0.06 * N, 0.06 * N, MID); }
    } else if (w.kind === 'garden') {
      r.rect(0, 0.3 * N, N, floor - 0.3 * N, MID);
      for (let k = 0; k < 90; k++) r.rect(hash(k, 91) * N, (0.3 + 0.45 * hash(k, 92)) * N, 2 * u, 2 * u, dim(MID));
      for (let x = 0; x < N; x += 0.05 * N) r.disc(x, 0.3 * N, 0.03 * N, MID);
    } else {
      for (const fx of [0.08, 0.42, 0.76]) { r.rect(fx * N, 0.22 * N, 0.16 * N, 0.45 * N, LMID); r.disc(fx * N + 0.08 * N, 0.22 * N, 0.08 * N, LMID); r.rect(fx * N + 0.075 * N, 0.15 * N, mx1(u), 0.52 * N, DARK); r.rect(fx * N, 0.42 * N, 0.16 * N, mx1(u), DARK); }
    }
    r.rect(0, floor, N, N - floor, w.kind === 'garden' ? LMID : MID);
    if (w.kind === 'hall') for (let y = floor, k = 0; y < N; y += 0.04 * N * (1 + k * 0.4), k++) for (let x = (k & 1) * 0.06 * N; x < N; x += 0.12 * N) r.rect(x, y, 0.06 * N, 0.04 * N * (1 + k * 0.4), DARK);
    else for (let y = floor + 0.03 * N, k = 1; y < N; y += 0.02 * N * k, k++) r.rect(0, y, N, mx1(u * 0.6), dim(MID));
    r.rect(0, 0, N, ceil, DARK);
    for (let x = 0.05 * N; x < N; x += 0.2 * N) r.rect(x, 0, 0.04 * N, ceil + 0.01 * N, w.kind === 'garden' ? dim(MID) : FIG);
    if (w.kind === 'garden') for (let k = 0; k < 12; k++) { const x = hash(k, 93) * N; r.stroke(x, ceil, x + Math.sin(t + k) * u, ceil + (0.04 + 0.05 * hash(k, 94)) * N, mx1(u), COOL); }
    swing(w.chand, dt, 0.16 * N, g, 0.4);
    const chx = 0.5 * N + Math.sin(w.chand.a) * 0.16 * N, chy = ceil + Math.cos(w.chand.a) * 0.16 * N;
    r.line(0.5 * N, ceil, chx, chy, FIG);
    r.rect(chx - 0.06 * N, chy, 0.12 * N, mx1(1.5 * u), LMID);
    for (let k = -2; k <= 2; k++) { const cxk = chx + k * 0.028 * N; r.rect(cxk - u * 0.5, chy - 0.02 * N, mx1(u), 0.02 * N, BRIGHT); r.disc(cxk, chy - 0.025 * N - w.flare * 0.006 * N, mx1(u * (1 + w.flare)), w.flare > 0.3 ? BRIGHT : HOT); }
    // the table and its party, drawn on a layer of their own (so that it can turn over)
    const L = w.lay;
    L.buf.fill(255);
    for (let k = kmin; k <= kmax; k++) { const x = seatX(k); L.rect(x - 0.045 * N, ty - 0.2 * N, 0.09 * N, 0.2 * N, MID); L.disc(x, ty - 0.2 * N, 0.045 * N, MID); L.rect(x - 0.03 * N, ty - 0.19 * N, 0.06 * N, 0.12 * N, dim(MID)); } // the chair backs
    for (let k = kmin; k <= kmax; k++) {
      const g0 = (((k - bar) % C) + C) % C, kind = CAST[g0], x = hopping ? lerp(seatX(k - 1), seatX(k), q) : seatX(k), lift = hopping ? 4 * q * (1 - q) * (g / (8 * bps(f) ** 2)) : 0; // a beat in the air under g: as high as g T² / 8
      guest(L, kind, x, ty - lift, sz, f.beat.pulse * 1.2 * u, kind === 'dormouse' ? w.wake : 0, f.rel.bassClock * 2, u);
    }
    L.rect(0, ty, N, 0.012 * N, BRIGHT);
    for (let x = 0; x < N; x += 0.04 * N) L.disc(x + 0.02 * N, ty + 0.08 * N, 0.02 * N, BRIGHT);
    L.rect(0, ty, N, 0.08 * N, BRIGHT);
    for (let x = 0; x < N; x += 0.04 * N) L.line(x, ty + 0.012 * N, x + 0.01 * N, ty + 0.09 * N, LMID);
    for (let k = kmin; k <= kmax; k++) { const x = seatX(k) - sp / 2; L.rect(x - 0.008 * N, ty + 0.09 * N, 0.016 * N, 0.9 * N - ty - 0.09 * N, DARK); }
    // the cups at the places, the clinks, the pours
    for (let k = 0; k <= 5; k++) {
      const x = seatX(k) - 0.035 * N, cl = w.clink && (k === w.clink.k || k === w.clink.k + 1), side = w.clink && k === w.clink.k ? 1 : -1;
      let cx = x, cy = ty;
      if (cl) { const c2 = w.clink.t < 0.12 ? ease(w.clink.t / 0.12) : 1 - ease((w.clink.t - 0.12) / 0.2), mx2 = (seatX(w.clink.k) + seatX(w.clink.k + 1)) / 2 - 0.035 * N; cx = lerp(x, mx2 - side * 0.018 * N, c2); cy = lerp(ty, ty - 0.12 * N, c2); }
      w.fills[k] = Math.max(0, w.fills[k] - dt * 0.05);
      teacup(L, cx, cy, 0.032 * N, w.fills[k]);
      if (w.fills[k] > 0.3 && rnd() < dt * 2) w.puffs.push(puff(cx, cy - 0.025 * N, 0, -0.04 * N, 1.4));
    }
    if (w.clink) {
      w.clink.t += dt;
      if (w.clink.t > 0.1 && w.clink.t < 0.2) { const mx2 = (seatX(w.clink.k) + seatX(w.clink.k + 1)) / 2 - 0.035 * N, my2 = ty - 0.15 * N; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7]]) L.line(mx2 + dx * 0.01 * N, my2 + dy * 0.01 * N, mx2 + dx * 0.025 * N, my2 + dy * 0.025 * N, BRIGHT); }
      if (w.clink.t > 0.32) w.clink = null;
    }
    w.pours = w.pours.filter((p) => {
      p.t += dt;
      const tilt = Math.min(1, p.t / 0.15) * (p.t > 0.75 ? Math.max(0, 1 - (p.t - 0.75) / 0.15) : 1), px = seatX(p.k) + 0.02 * N, py = ty - 0.12 * N;
      const P = turn(px, py, tilt * 0.9);
      const body = [P(-0.03 * N, -0.02 * N), P(0.03 * N, -0.02 * N), P(0.035 * N, 0.025 * N), P(-0.035 * N, 0.025 * N)];
      L.poly(body, BRIGHT);
      const [spx, spy] = P(0.06 * N, -0.015 * N), [b0x, b0y] = P(0.03 * N, 0.005 * N);
      L.stroke(b0x, b0y, spx, spy, mx1(0.008 * N), BRIGHT);
      if (tilt > 0.6) { // the stream: the tea flies a parabola from the spout to the next cup, whose time of flight is T
        const cxp = seatX(p.k + 1) - 0.035 * N, cyp = ty - 0.02 * N, T = 0.32, vx = (cxp - spx) / T, vy = (cyp - spy - 0.5 * g * T * T) / T;
        let lx = spx, ly = spy;
        for (let k = 1; k <= 12; k++) { const tt = (T * k) / 12, x = spx + vx * tt, y = spy + vy * tt + 0.5 * g * tt * tt; L.stroke(lx, ly, x, y, mx1(1.5 * u), (k + Math.floor(t * 20)) % 3 ? MID : LMID); lx = x; ly = y; }
        if (p.k + 1 <= 5) w.fills[p.k + 1] = Math.min(1, w.fills[p.k + 1] + dt * 2);
      }
      return p.t < 0.9;
    });
    w.puffs = smoke({ r: L, dt, u }, w.puffs, 0, LMID, BRIGHT).slice(-20);
    // lay the party into the room: right side up, or turned over onto the ceiling (a half turn about its long axis)
    let th = 0;
    if (w.flipT >= 0) { w.flipT += dt * bps(f); th = Math.PI * (w.flipT < 2 ? ease(w.flipT / 2) : w.flipT < 14 ? 1 : 1 - ease((w.flipT - 14) / 2)); if (w.flipT > 16) w.flipT = -1; }
    const ct = Math.cos(th), cy0 = 0.62 * N, cy1 = ceil + 0.9 * N - cy0, cyT = lerp(cy0, cy1, (1 - ct) / 2), lb = L.buf, buf = r.buf;
    if (Math.abs(ct) > 0.04) for (let y = 0; y < N; y++) {
      const sy = Math.round(cy0 + (y - cyT) / ct);
      if (sy < 0 || sy >= N) continue;
      const row = sy * N, o = y * N;
      for (let x = 0; x < N; x++) { const v = lb[row + x]; if (v !== 255) buf[o + x] = v; }
    } else r.rect(0, cyT - u, N, mx1(2 * u), BRIGHT);
    targets.push({ x: seatX(1) - 0.1 * N, y: cyT - 0.3 * N * Math.abs(ct), w: sp * 4, h: 0.4 * N * Math.abs(ct) + 2 });
  },
};

const WORLDS = { cardpig, stompfoot, meltclocks, bowlerrain, boschgarden, fishsky, endlessstairs, giantwalk, chickenhut, moonfishing, eyeballoon, teaparty };
registerFamily('surreal', WORLD_DEFS, WORLDS);
export const SURREAL_STYLE = makeMixStyle('SURREAL', ['surreal']);
