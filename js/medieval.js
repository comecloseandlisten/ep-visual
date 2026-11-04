// Medieval absurd, mixed. Twelve scenes of knights doing modern things, in original pixel silhouettes only: no
// brands, logos, letters or real people (an energy can is a plain white can with a stripe, a phone is a glowing
// slab). A knight on a bicycle past the castles, a great-hall rave, a petrol station for horses, a joust on
// bicycles, a pizza run on a scooter, monks vaping in the scriptorium, a trebuchet throwing furniture, a dragon
// barbecue, a tavern with a stage, a lowrider chariot, a square of peasants on their slabs, a courtyard skate spot.
// Each world has a kinds table weighed by the arousal band, re-rolled on a section change, with a heavy variant on
// a drop; all of them move by the same physics: wheels roll at the speed of travel and pedals turn with it, thrown
// things fly parabolas and fall with the gravity of mixer's particles, springs and pendulums swing about their
// pivots, smoke rises and slows, gaits keep step with the beat.
import { Raster, clamp, lerp } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow,
  followAngle, ease, beatLocked, hash, pickW, walker, particles, burst, shiftRow, shiftRows, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  bikeknight: { name: 'knight on a bicycle', va: [[H, M], [H, H], [M, M]], pals: ['parchment', 'tape', 'sepia', 'cinema', 'gameboy'], fx: ['none', 'film', 'frame'] },
  castlerave: { name: 'great hall rave', va: [[H, H], [M, H], [H, M]], pals: ['neon', 'royal', 'gold', 'midnight', 'candy'], fx: ['none', 'crt', 'vhs'] },
  gasstation: { name: 'the horse pump', va: [[M, L], [H, M], [M, M]], pals: ['tape', 'sepia', 'parchment', 'nineties'], fx: ['none', 'film', 'vhs'] },
  bikejoust: { name: 'joust on bicycles', va: [[H, H], [M, H], [H, M]], pals: ['royal', 'warband', 'parchment', 'cinema'], fx: ['none', 'frame', 'manga'] },
  pizzaknight: { name: 'pizza knight', va: [[H, M], [H, H], [M, M]], pals: ['midnight', 'neon', 'tape', 'nineties'], fx: ['none', 'crt', 'vhs'] },
  scriptorium: { name: 'the scriptorium', va: [[M, L], [H, M], [M, M]], pals: ['parchment', 'sepia', 'candy', 'gameboy'], fx: ['none', 'film', 'frame'] },
  trebuchet: { name: 'the trebuchet', va: [[M, H], [M, M]], pals: ['warband', 'parchment', 'royal', 'sepia'], fx: ['none', 'frame', 'film'] },
  dragonbbq: { name: 'dragon barbecue', va: [[M, L], [H, M], [M, M]], pals: ['candy', 'parchment', 'nineties', 'tape'], fx: ['none', 'vhs', 'film'] },
  tavernstage: { name: 'tavern stage', va: [[H, H], [M, H], [H, M]], pals: ['gold', 'neon', 'tape', 'royal'], fx: ['none', 'crt', 'vhs', 'manga'] },
  lowrider: { name: 'lowrider chariot', va: [[H, M], [H, H], [M, M]], pals: ['neon', 'midnight', 'nineties', 'gold'], fx: ['crt', 'none', 'vhs'] },
  peasantphones: { name: 'peasants on their slabs', va: [[M, L], [H, M], [M, M]], pals: ['midnight', 'parchment', 'sepia', 'neon'], fx: ['none', 'crt', 'film'] },
  courtyardskate: { name: 'courtyard skate spot', va: [[H, M], [H, H], [M, M]], pals: ['nineties', 'candy', 'parchment', 'gameboy'], fx: ['none', 'vhs', 'manga'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the kinds tables weigh their variants by it; a section change
// re-rolls the kind, a drop brings each world's heavy variant
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const GR = 1.6; // gravity, screens per second squared: what mixer's `particles` fall with, so everything falls alike
const bps = (f) => (f.bpm ? f.bpm / 60 : 2);
const mx1 = (u) => Math.max(1, u);
// one column of cells from y0 down to y1, rounded the way Raster.rect rounds, without a fill call per row
const vline = (r, x, y0, y1, c) => { const N = r.N, xi = Math.round(x); if (xi < 0 || xi >= N) return; for (let y = Math.max(0, Math.round(y0)), e = Math.min(N, Math.round(y1)); y < e; y++) r.buf[y * N + xi] = c; };
// the gait phase: a step per beat (the legs alternate, so a full cycle is two beats); free-running without a tempo
const gait = (w, f, dt) => (w.gait = beatLocked(f) ? (f.beat.count + f.beat.phase) * Math.PI : w.gait + dt * Math.PI * bps(f));
// how far a walker `h` tall travels per second at a step per beat: its stride (the feet swing a tenth of h each way)
const pace = (h, f) => 0.2 * h * bps(f);
// a horse bounds once per beat and covers nine tenths of its size per bound
const canter = (sz, f) => 0.9 * sz * bps(f);
// a damped spring `o` = { x: offset from rest, v }: stiffness k and damping c per second, its rest moved to `to` by a
// drive; in steps of a 60th of a second at most, so a slow frame cannot blow a stiff one up
const spring = (o, dt, k, c, to = 0) => { const n = Math.ceil(dt * 60), h = dt / n; for (let i = 0; i < n; i++) { o.v += (-k * (o.x - to) - c * o.v) * h; o.x += o.v * h; } };
// a thing `x0` (0..1 across) of a layer scrolled `d` cells to the left, wrapped round a strip `m` wider than the screen
// on each side: it leaves one edge whole before it comes in at the other, at exactly the layer's speed
const wrapX = (x0, d, N, m) => { const S = N + 2 * m; return ((((x0 * S - d) % S) + S) % S) - m; };
// a foot through its stride (one per 2π of `q`), on the ground for `duty` of it: there it sweeps from ahead (+1) to
// behind (-1) at a steady rate, so it stands still on the ground when the body covers 2/duty half-sweeps a stride;
// then it lifts and swings forward. Returns [sweep, lift 0..1] in a shared pair.
const STRIDE = [0, 0];
function stride(q, duty) {
  q = q / TAU - Math.floor(q / TAU);
  if (q < duty) { STRIDE[0] = 1 - (2 * q) / duty; STRIDE[1] = 0; }
  else { const s = (q - duty) / (1 - duty); STRIDE[0] = 2 * s - 1; STRIDE[1] = Math.sin(Math.PI * s); }
  return STRIDE;
}
// a vertical wave `o` = { r: radius of a disc, ph } for the pulse of a loudspeaker cone with the bass
const cone = (r, x, y, rad, u, drive) => { r.ring(x, y, rad, mx1(u), LMID); r.disc(x, y, rad * (0.45 + 0.2 * drive), MID); r.disc(x, y, rad * 0.15, LMID); };

// a fire `h` tall and `wd` wide standing on (x, base): tongues that jump with `tt` (a frame counter), a bright core
function flame(r, x, base, wd, h, tt, seed) {
  for (let k = 0; k < 5; k++) {
    const q = k / 5, ww = wd * (1 - q * 0.75) * (0.8 + 0.4 * hash(seed + k, tt)), j = (hash(seed + 9 + k, tt) - 0.5) * wd * q;
    r.rect(x - ww / 2 + j, base - h * (q + 0.22), ww, h * 0.24, k === 0 || hash(seed + 20 + k, tt) < 0.6 ? HOT : BRIGHT);
  }
  r.rect(x - wd * 0.2, base - h * 0.4, wd * 0.4, h * 0.4, BRIGHT);
}

// smoke: a puff rises ever slower (drag), drifts with the wind, grows and thins out as it ages; `sc` its distance scale
const puff = (x, y, vx, vy, life = 2.5, sc = 1) => ({ x, y, vx, vy, life, age: 0, sc });
function smoke(W, list, wind, col = LMID, col2 = DARK + DIM) {
  const { r, dt, u } = W, k = Math.exp(-dt * 0.7);
  for (const p of list) {
    p.vy *= k;
    p.vx *= k;
    p.x += (p.vx + wind * p.sc) * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.age += dt;
    const sz = u * (1 + p.age * 1.6) * p.sc;
    if (p.life > 0.8 || hash(p.x | 0, (p.age * 20) | 0) < p.life) checker(r, p.x - sz / 2, p.y - sz / 2, sz, sz, col, col2);
  }
  return list.filter((p) => p.life > 0);
}
// a square of two colours in a checker: a haze that shows against a light sky and a dark one alike
function checker(r, x, y, w, h, c1, c2) {
  const N = r.N, x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(N, Math.round(x + w)), y1 = Math.min(N, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) r.buf[yy * N + xx] = (xx + yy) & 1 ? c1 : c2;
}
// a leg from the hip to the foot in two bones of `len`, the knee bent toward `dir`
function leg2(r, hip, foot, len, dir, w, col) {
  const dx = foot[0] - hip[0], dy = foot[1] - hip[1], d = Math.hypot(dx, dy) || 1, hh = d < 2 * len ? Math.sqrt(len * len - (d * d) / 4) : 0;
  const kx = (hip[0] + foot[0]) / 2 + (dy / d) * hh * dir, ky = (hip[1] + foot[1]) / 2 - (dx / d) * hh * dir;
  r.stroke(hip[0], hip[1], kx, ky, w, col);
  r.stroke(kx, ky, foot[0], foot[1], w, col);
}

// debris that falls (`gs` the gravity's share, for a thing farther off), bounces on `floor` losing most of its speed
// and comes to rest there, sliding to a stop; a resting piece does not bounce on the one frame of gravity it gets
function tumble(W, list, floor, col, gs = 1) {
  const { r, dt, u, N } = W, G = GR * N * gs;
  for (const p of list) {
    p.x += p.vx * dt;
    p.y += (p.vy + 0.5 * G * dt) * dt;
    p.vy += G * dt;
    p.life -= dt;
    if (p.y >= floor) { p.y = floor; if (p.vy > 0.05 * N + G * dt) { p.vy *= -0.4; p.vx *= 0.6; } else { p.vy = 0; p.vx *= Math.exp(-dt * 12); } }
    r.rect(p.x - u * 0.5, p.y - p.s, p.s, p.s, p.c ?? col);
  }
  return list.filter((p) => p.life > 0);
}

// rolling hills from y0 (the crests) down to `bottom`, scrolled by `off` screen widths, folds per `seed`
function hills(r, N, y0, amp, bottom, off, seed, col) {
  const a = hash(seed, 1) * 6, b = hash(seed, 2) * 6;
  for (let x = 0; x < N; x++) {
    const q = (x / N + off) * 2, y = y0 + amp * (0.5 + 0.3 * Math.sin(q * 2.7 + a) + 0.2 * Math.sin(q * 6.1 + b));
    vline(r, x, y, bottom, col);
  }
}
const hillY = (N, y0, amp, off, seed, x) => { const a = hash(seed, 1) * 6, b = hash(seed, 2) * 6, q = (x / N + off) * 2; return y0 + amp * (0.5 + 0.3 * Math.sin(q * 2.7 + a) + 0.2 * Math.sin(q * 6.1 + b)); };

// a castle: a curtain wall with battlements between two towers under cone roofs, the keep behind; `wd` wide, `ht` tall
function castle(r, x, base, wd, ht, col, u) {
  const tw = wd * 0.2, th = ht * 1.7, m = mx1(u * 0.8);
  r.rect(x - wd * 0.14, base - ht * 1.35, wd * 0.28, ht * 1.35, col);
  r.rect(x - wd / 2, base - ht, wd, ht, col);
  for (let k = x - wd / 2 + m; k < x + wd / 2; k += 2 * m) r.rect(k, base - ht - m, m, m, col);
  for (const k of [-1, 1]) {
    const tx = x + k * (wd / 2 - tw * 0.4);
    r.rect(tx - tw / 2, base - th, tw, th, col);
    r.poly([[tx - tw * 0.7, base - th], [tx + tw * 0.7, base - th], [tx, base - th - tw * 1.3]], col);
  }
}

// a plain white can with one stripe round it, `s` tall
const can = (r, x, y, s, u) => { r.rect(x - s * 0.3, y - s, s * 0.6, s, WHITE); r.rect(x - s * 0.3, y - s * 0.6, s * 0.6, mx1(u * 0.8), HOT); };
// a glowing slab held upright: a dark frame, the glass lit `lit` (COOL), flashing (WHITE) or dark
const slab = (r, x, y, s, lit) => { r.rect(x - s * 0.3, y - s * 0.5, s * 0.6, s, DARK); r.rect(x - s * 0.22, y - s * 0.42, s * 0.44, s * 0.84, lit === 2 ? WHITE : lit ? COOL : BLACK); };

// a knight in plate on its feet: mixer's walker in `col` with a breastplate, pauldrons, a helm with a visor slit (or
// the visor up, showing a mouth), a plume; an apron over the plate when asked. Returns the walker's joints.
function knight(r, x, base, h, col, ph, dir, u, o = {}) {
  const J = walker(r, x, base, h, col, ph, dir, {}), hw = h * 0.17, head = h * 0.21;
  if (o.apron) r.rect(x - hw * 0.75, J.sy + h * 0.02, hw * 1.5, h * 0.38, BRIGHT);
  else r.rect(x - hw * 0.6, J.sy + h * 0.03, hw * 1.2, h * 0.2, LMID + DIM);
  for (const k of [-1, 1]) r.rect(x + k * hw * 0.8 - 1.5 * u, J.sy - 1.5 * u, 3 * u, 2.5 * u, LMID);
  r.disc(x, J.head, head * 0.56, LMID);
  if (o.open) { r.rect(dir > 0 ? x + head * 0.1 : x - head * 0.6, J.head - head * 0.6, head * 0.5, mx1(u), LMID); r.rect(dir > 0 ? x + head * 0.12 : x - head * 0.42, J.head - head * 0.05, head * 0.3, head * 0.25, BLACK); }
  else r.rect(x + dir * head * 0.08 - head * 0.35, J.head - head * 0.1, head * 0.7, mx1(u * 0.8), BLACK);
  if (o.plume) r.poly([[x, J.head - head * 0.5], [x - dir * head * 0.9, J.head - head * (0.85 + (o.fly ?? 0))], [x - dir * head * 0.25, J.head - head * 0.35]], HOT);
  return J;
}

// a helm on its own for the seated knights: a dome with the visor slit, looking `dir`
function helm(r, x, y, sz, dir, u, open = false) {
  r.disc(x, y, sz, LMID);
  if (open) { r.rect(x + dir * sz * 0.2 - (dir < 0 ? sz * 0.9 : 0), y - sz * 1.05, sz * 0.9, mx1(u), LMID); r.rect(x + dir * sz * 0.2 - (dir < 0 ? sz * 0.5 : 0), y - sz * 0.1, sz * 0.5, sz * 0.45, BLACK); }
  else r.rect(x + dir * sz * 0.15 - sz * 0.6, y - sz * 0.15, sz * 1.2, mx1(u * 0.8), BLACK);
}

// a horse `sz` long on `base`: the barrel, four legs through their stride `ph` when `moving`, the neck to a head
// lowered by `head` (0 up, 1 down to the ground), the tail; sunglasses on it when asked. A stride (2π of `ph`) covers
// nine tenths of sz, so canter() is a stride a beat: each hoof is down half of it, sweeping back a quarter of sz each
// way and so standing still on the ground; the hind pair lands, then the fore, and the back is highest in the moment
// all four are up. Returns the mouth and the withers, for a nozzle or a harness.
function horse(r, x, base, sz, col, ph, dir, u, o = {}) {
  const moving = o.moving ?? true, bob = moving ? (0.5 + 0.5 * Math.cos(ph + 0.22)) * sz * 0.08 : 0, by = base - sz * 0.5 - bob, lw = mx1(sz * 0.07), far = col < 8 ? col + DIM : col;
  const leg = (k, n) => { let a = k ? 0.1 : -0.1, lift = 0; if (moving) [a, lift] = stride(ph - k * 2.2 - n * 0.5, 0.5); const hip = x + dir * (k ? 0.3 : -0.3) * sz; r.stroke(hip, by + sz * 0.05, hip + dir * a * sz * 0.225, base - lift * sz * 0.15, lw, n ? col : far); };
  r.rect(x - sz * 0.45, base - mx1(u) * 0.5, sz * 0.9, mx1(u), o.shadow ?? DARK + DIM);
  leg(0, 0); leg(1, 0);
  r.ring(x, by, sz * 0.2, sz * 0.4, col, 0.5);
  const hd = o.head ?? 0, nx = x + dir * sz * 0.32, ny = by - sz * 0.05, hx = nx + dir * sz * (0.24 - 0.06 * hd), hy = ny - sz * 0.36 + hd * sz * 0.62;
  r.stroke(nx, ny, hx, hy, sz * 0.15, col);
  const ha = lerp(0.35, 1.35, hd), mxp = hx + dir * Math.cos(ha) * sz * 0.3, myp = hy + Math.sin(ha) * sz * 0.3;
  r.stroke(hx, hy, mxp, myp, sz * 0.12, col);
  r.poly([[hx - dir * sz * 0.03, hy - sz * 0.06], [hx + dir * sz * 0.04, hy - sz * 0.07], [hx + dir * sz * 0.02, hy - sz * 0.17]], col); // an ear
  if (o.shades) { r.rect(hx - sz * 0.06 + dir * sz * 0.04, hy - sz * 0.03, sz * 0.13, mx1(sz * 0.05), BLACK); r.set(hx + dir * sz * 0.07, hy - sz * 0.03, BRIGHT); }
  else r.set(hx + dir * sz * 0.05, hy - sz * 0.02, BRIGHT);
  r.stroke(x - dir * sz * 0.38, by - sz * 0.08, x - dir * sz * 0.58, by + sz * 0.12 - (moving ? Math.sin(ph) * sz * 0.1 : 0), mx1(u), col);
  leg(0, 1); leg(1, 1);
  return { mx: mxp, my: myp, wx: x + dir * sz * 0.2, wy: by - sz * 0.2, by };
}

// a dragon `sz` long on `base` facing `dir`: the tail swaying with `ph`, the body (lower when lying), a wing folded
// along the back or raised by `wing`, the neck up to a wedge head lowered by `head` (0..1) whose jaw opens by `jaw`.
// Returns the mouth (where the fire comes from) and the eye.
function dragon(r, x, base, sz, dir, u, o = {}) {
  const lie = o.lying ? 1 : 0, col = o.col ?? DARK, ph = o.ph ?? 0, by = base - sz * (0.3 - 0.12 * lie), wg = o.wing ?? 0, hd = o.head ?? 0;
  let px = x - dir * sz * 0.3, py = by;
  for (let k = 1; k <= 6; k++) { const q = k / 6, nx = x - dir * sz * (0.3 + q * 0.6), ny = by - q * q * sz * 0.15 + Math.sin(ph + q * 3) * q * sz * 0.08; r.stroke(px, py, nx, ny, mx1(sz * 0.09 * (1 - q * 0.8)), col); px = nx; py = ny; }
  r.poly([[px, py - sz * 0.02], [px - dir * sz * 0.09, py - sz * 0.07], [px - dir * sz * 0.1, py + sz * 0.04]], col);
  if (!lie) for (const k of [-0.22, 0.2]) r.rect(x + dir * k * sz - sz * 0.04, by, sz * 0.08, base - by, col);
  else for (const k of [-0.25, 0.22]) r.rect(x + dir * k * sz - sz * 0.05, base - sz * 0.08, sz * 0.14, sz * 0.08, col);
  r.ring(x, by, sz * 0.14, sz * 0.28, col, 0.55);
  r.poly([[x - dir * sz * 0.02, by - sz * 0.12], [x - dir * lerp(0.42, 0.12, wg) * sz, by - lerp(0.2, 0.6, wg) * sz], [x - dir * sz * 0.3, by - sz * 0.04]], col);
  if (wg > 0.2) r.line(x - dir * sz * 0.02, by - sz * 0.12, x - dir * lerp(0.42, 0.12, wg) * sz, by - lerp(0.2, 0.6, wg) * sz, col < 8 ? col + DIM : col);
  const nx = x + dir * sz * 0.22, ny = by - sz * 0.06, hx = nx + dir * sz * lerp(0.2, 0.3, hd), hy = lerp(by - sz * 0.42, base - sz * 0.1, hd);
  r.stroke(nx, ny, hx, hy, sz * 0.1, col);
  return dragonHead(r, hx, hy, sz, dir, u, o.jaw ?? 0, col, o.eye ?? HOT);
}
// the head alone: a wedge, the lower jaw hinged at its back and open by `jaw`, two horns, an eye; returns the mouth
function dragonHead(r, hx, hy, sz, dir, u, jaw, col, eye = HOT) {
  r.poly([[hx - dir * sz * 0.04, hy - sz * 0.07], [hx + dir * sz * 0.26, hy - sz * 0.02], [hx + dir * sz * 0.24, hy + sz * 0.02], [hx - dir * sz * 0.04, hy + sz * 0.04]], col);
  const ja = jaw * 0.7, jx = hx + dir * Math.cos(ja) * sz * 0.22, jy = hy + sz * 0.03 + Math.sin(ja) * sz * 0.22;
  r.stroke(hx, hy + sz * 0.03, jx, jy, mx1(sz * 0.04), col);
  for (const k of [0, 1]) r.line(hx - dir * sz * (0.02 + k * 0.05), hy - sz * 0.06, hx - dir * sz * (0.1 + k * 0.05), hy - sz * 0.16, col);
  r.rect(hx + dir * sz * 0.03 - u * 0.5, hy - sz * 0.04, mx1(u), mx1(u), eye);
  return { mx: hx + dir * sz * 0.22, my: hy + sz * 0.02, hx, hy };
}

// a wizard: mixer's walker in a long coat with a tall pointed hat and a beard; returns the walker's joints
function wizard(r, x, base, h, col, ph, dir, u) {
  const J = walker(r, x, base, h, col, ph, dir, { coat: true }), head = h * 0.21;
  r.poly([[x - head * 0.9, J.head - head * 0.3], [x + head * 0.9, J.head - head * 0.3], [x + dir * head * 0.25, J.head - head * 1.9]], col);
  r.rect(x - head * 0.9, J.head - head * 0.35, head * 1.8, mx1(u), col);
  r.rect(x + dir * head * 0.1 - head * 0.25, J.head + head * 0.2, head * 0.5, head * 0.5, LMID);
  return J;
}
// a monk: the walker in a robe with the hood up (the dark inside it); returns the walker's joints
function monk(r, x, base, h, col, ph, dir, u) {
  const J = walker(r, x, base, h, col, ph, dir, { coat: true }), head = h * 0.21;
  r.disc(x, J.head, head * 0.62, col);
  r.rect(x + dir * head * 0.05 - (dir < 0 ? head * 0.3 : 0), J.head - head * 0.15, head * 0.3, head * 0.3, BLACK);
  return J;
}

// a spoked wheel of radius R turned to `ang`: the rim, a hub, three spokes that show it rolling
function wheel(r, x, y, R, ang, u, col, fat = 1) {
  r.ring(x, y, R, mx1(u * fat), col);
  for (let k = 0; k < 3; k++) { const a = ang + (k * TAU) / 3; r.line(x, y, x + Math.cos(a) * R, y + Math.sin(a) * R, col); }
}

// a bicycle with its rear hub at (x, y) facing `dir`, pitched nose-up by -`pitch`: wheels of radius R turned to `wh`,
// the diamond frame, the crank at `ck` with both pedals, a saddle and the bars. Returns the seat, the shoulders' place,
// the pedals, the down tube's middle (for the bottle cage) and the local-to-screen transform.
function bicycle(r, x, y, R, wh, ck, pitch, u, col, dir = 1) {
  const c = Math.cos(pitch), s = Math.sin(pitch), P = (dx, dy) => [x + dir * (dx * c - dy * s), y + dx * s + dy * c];
  const fh = P(2.2 * R, 0), bb = P(0.9 * R, 0.1 * R), seat = P(0.5 * R, -1.6 * R), head = P(1.9 * R, -1.35 * R), bars = P(2.05 * R, -1.5 * R);
  wheel(r, x, y, R, wh, u, col);
  wheel(r, fh[0], fh[1], R, wh, u, col);
  const lw = mx1(u * 1.1);
  for (const [a, b] of [[[x, y], seat], [[x, y], bb], [bb, seat], [seat, head], [bb, head], [head, fh], [head, bars]]) r.stroke(a[0], a[1], b[0], b[1], lw, col);
  r.stroke(seat[0] - dir * 1.5 * u, seat[1], seat[0] + dir * 2 * u, seat[1], mx1(1.5 * u), col);
  r.ring(bb[0], bb[1], R * 0.3, mx1(u * 0.8), col);
  r.line(bb[0], bb[1] - R * 0.3, x, y - R * 0.12, col);
  r.line(bb[0], bb[1] + R * 0.3, x, y + R * 0.12, col);
  const pedals = [0, Math.PI].map((d) => { const a = ck + d, px = bb[0] + Math.cos(a) * R * 0.42, py = bb[1] + Math.sin(a) * R * 0.42; r.line(bb[0], bb[1], px, py, col); r.rect(px - 1.5 * u, py - u * 0.5, 3 * u, mx1(u), col); return [px, py]; });
  const dm = [(bb[0] + head[0]) / 2, (bb[1] + head[1]) / 2];
  return { seat, bars, pedals, bb, down: dm, P };
}

// the knight on a seat: hip at `hip`, leaning forward by `lean` (radians from upright), `h` the torso's length;
// the plate, a pauldron and the helm; returns the shoulder and the helm's place
function riderTorso(r, hip, h, lean, dir, u, open = false) {
  const sx = hip[0] + dir * Math.sin(lean) * h, sy = hip[1] - Math.cos(lean) * h;
  r.stroke(hip[0], hip[1], sx, sy, mx1(3.2 * u), FIG);
  r.stroke(lerp(hip[0], sx, 0.2), lerp(hip[1], sy, 0.2), lerp(hip[0], sx, 0.8), lerp(hip[1], sy, 0.8), mx1(1.6 * u), LMID + DIM);
  r.disc(sx, sy, mx1(1.8 * u), LMID);
  const hx = sx + dir * Math.sin(lean) * h * 0.28, hy = sy - Math.cos(lean) * h * 0.28;
  helm(r, hx, hy, h * 0.2, dir, u, open);
  return { sx, sy, hx, hy };
}

// ---------------------------------------------------------------------------------------------- bikeknight
// A knight in full plate on the road past the castles (two layers of hills at parallax, the road at the speed of
// travel): wheels rolling at v/r and pedals turning with them, the sword up and swinging on the kicks, a cigarette
// in the visor glowing on the hats with smoke that rises and slows behind him, a bottle in the other hand sloshing
// with every change of speed and every bump (a hop on the kicks), a plain can in the cage; a fluffy winged beast
// flying alongside flaps on the beat and loops on the snares. The ride is the kind: a bicycle, a scooter kicked along
// on the beat, a skateboard, a shopping cart
// with a horse trotting beside it pulling nothing. A drop is a ramp: he flies a parabola, wheelie first, and the
// beast dives under him.
const RIDE_W = { bicycle: [3, 3, 2], scooter: [2, 2, 2], skateboard: [1, 2, 3], cart: [1, 1, 2] };
const bikeknight = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { is: 'bikeknight', N: W.N, kind: rollW(rnd, RIDE_W, bandOf(W.a)), off: 0, wh: 0, ck: 0, spd: 0, hop: { y: 0, vy: 0 }, slosh: { x: 0, v: 0 }, swing: 0, glow: 0, drag: false, smoke: [],
      beast: { x: 0, y: 0, loop: -1 }, ramp: null, fly: null, pitch: 0, kick: 0, foot: 0, gait: 0, sunX: 0.2 + rnd() * 0.6 });
  },
  draw(W) {
    if (W.w.is !== 'bikeknight' || W.w.N !== W.N) bikeknight.init(W); // handed a bare state, or another size: start afresh
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), kind = w.kind, g = 0.8 * N, bx = 0.42 * N, G = GR * N;
    if (f.section === 'change') w.kind = rollW(rnd, RIDE_W, band);
    if (f.section === 'drop' && !w.ramp && !w.fly) w.ramp = { x: bx + 0.4 * N, w: 0.12 * N, h: 0.08 * N };
    const R = kind === 'bicycle' ? 6 * u : kind === 'scooter' ? 3 * u : kind === 'cart' ? 2.6 * u : 1.8 * u, wb = kind === 'bicycle' ? 2.2 * R : kind === 'scooter' ? 4 * R : kind === 'skateboard' ? 5 * R : 5.5 * R;
    // the ground: the road, or the ramp's slope till he leaves its lip (carried on past the lip for a front wheel over it)
    const surf = (x) => { const rp = w.ramp; return !rp || rp.done || x < rp.x ? g : g - ((x - rp.x) / rp.w) * rp.h; };
    // the speed: the bicycle's with the bass; the scooter and the board pushed every other beat and coasting between
    // (the foot planted on the road shoves for a fifth of a second, still on the road while the deck rolls on, then
    // swings back up); the cart at the trot of the horse beside it. The wheels turn at v/r, the pedals at the
    // chainring's gearing, and the bottle feels every change of speed.
    const spd0 = w.spd;
    if (kind === 'bicycle') w.spd = follow(w.spd, N * (0.1 + 0.12 * f.rel.bassDrive) * bps(f) / 2, dt, 0.6);
    else if (kind === 'cart') w.spd = follow(w.spd, canter(0.13 * N, f) * 0.5, dt, 0.4);
    else {
      if (f.beat.on && f.beat.count % 2 === 0 && w.kick <= 0 && !w.fly) { w.kick = 1; w.foot = bx + (kind === 'scooter' ? 1.3 : 2) * R; }
      if (w.kick > 0.5) { w.spd += 0.6 * N * dt; w.foot -= w.spd * dt; }
      w.spd = Math.max(0.03 * N, w.spd * Math.exp(-dt * 0.6));
    }
    w.kick = Math.max(0, w.kick - dt * 2.5);
    const ax = (w.spd - spd0) / dt;
    w.off += (w.spd * dt) / N;
    w.wh += (w.spd * dt) / R;
    w.ck += (w.spd * dt) / (R * 2.6);
    const Hp = w.hop;
    for (const h of hits) {
      if (isLow(h)) { w.swing = 1; if (!w.fly && w.kick <= 0 && Hp.y === 0 && Hp.vy === 0) Hp.vy = -0.25 * N * h.strength; w.slosh.v += (rnd() < 0.5 ? -1 : 1) * 5 * h.strength; } // a bump: a hop off the road
      else if (h.kind === 'snare' && w.beast.loop < 0) w.beast.loop = 0;
      else if (h.kind === 'hat') { w.glow = 1; w.drag = true; }
    }
    if (Hp.vy !== 0 || Hp.y < 0) { Hp.y += (Hp.vy + 0.5 * G * dt) * dt; Hp.vy += G * dt; if (Hp.y >= 0) { Hp.y = 0; Hp.vy = 0; } }
    // the bottle: the surface tilts toward a/g against the acceleration and swings back about it; a bump jostles it
    spring(w.slosh, dt, 55, 2.5, ax / G);
    w.swing = Math.max(0, w.swing - dt * 3);
    w.glow *= Math.exp(-dt * 5);
    const ph = gait(w, f, dt), off = w.off;
    // the sky, the far and the near hills with their castles, the road with its stones going by at the speed of travel
    r.disc(w.sunX * N, 0.18 * N, 0.06 * N, BRIGHT);
    for (let k = 0; k < 4; k++) { const cx = wrapX(hash(k, 21), -(f.rel.midClock * 0.004 + t * 0.003) * N, N, 0.08 * N), cy = (0.1 + 0.12 * hash(k, 22)) * N, cr = (0.02 + 0.02 * hash(k, 23)) * N; r.disc(cx, cy, cr, LMID); r.disc(cx + cr, cy + cr * 0.3, cr * 0.7, LMID); r.disc(cx - cr, cy + cr * 0.3, cr * 0.6, LMID); }
    hills(r, N, 0.42 * N, 0.12 * N, g, off * 0.25, 3, LMID);
    for (let k = 0; k < 3; k++) { const cx = wrapX(hash(k, 31), off * 0.25 * N, N, 0.1 * N); castle(r, cx, hillY(N, 0.42 * N, 0.12 * N, off * 0.25, 3, cx) + u, (0.08 + 0.04 * hash(k, 32)) * N, 0.05 * N, LMID + DIM, u); }
    hills(r, N, 0.58 * N, 0.1 * N, g, off * 0.55, 7, MID);
    for (let k = 0; k < 2; k++) { const cx = wrapX(hash(k, 41), off * 0.55 * N, N, 0.1 * N); castle(r, cx, hillY(N, 0.58 * N, 0.1 * N, off * 0.55, 7, cx) + u, (0.1 + 0.05 * hash(k, 42)) * N, 0.06 * N, MID + DIM, u); }
    r.rect(0, g, N, N - g, DARK);
    r.rect(0, g, N, mx1(u), MID + DIM);
    for (let k = 0; k < 12; k++) r.rect(wrapX(hash(k, 51), off * N, N, 3 * u), g + (0.02 + 0.15 * hash(k, 52)) * N, 3 * u, mx1(u), DARK + DIM);
    // the ramp coming up on a drop, the ride up it (pitched by the ground under both wheels), the flight off its lip and
    // the landing, the back wheel first and the front one coming down after it
    if (w.ramp) {
      const rp = w.ramp;
      rp.x -= w.spd * dt;
      r.poly([[rp.x, g + 1], [rp.x + rp.w, g - rp.h], [rp.x + rp.w, g + 1]], MID);
      if (!w.fly && !rp.done && bx > rp.x + rp.w) { rp.done = true; w.fly = { y: g - rp.h, vy: -w.spd * (rp.h / rp.w) }; w.pitch = -Math.atan2(rp.h, rp.w); Hp.y = 0; Hp.vy = 0; }
      if (rp.x + rp.w < -0.2 * N) w.ramp = null;
    }
    let y = g, pitch = 0;
    if (w.fly) {
      const F = w.fly;
      F.y += (F.vy + 0.5 * G * dt) * dt;
      F.vy += G * dt;
      w.pitch = follow(w.pitch, F.vy < 0 ? -0.5 : -0.12, dt, 0.25); // the wheelie, then level for the landing
      y = F.y; pitch = w.pitch;
      if (F.y >= g) { w.fly = null; Hp.vy = -0.2 * F.vy; s.shake = Math.max(s.shake, 0.4); } // a little rebound off the back wheel
    }
    if (!w.fly) { const sp = Math.atan2(surf(bx + wb) - surf(bx), wb); w.pitch = Math.min(sp, follow(w.pitch, sp, dt, 0.06)); y = surf(bx) + Hp.y; pitch = w.pitch; }
    const wind = -w.spd;
    // the ride and the knight on it: his hip, shoulders, the pedals or the deck for his feet
    let hip, dir = 1, torso = 0.085 * N, legs = null, cage = null, lean = 0.5, legLen = 0.065 * N;
    if (kind === 'bicycle') {
      const B = bicycle(r, bx, y - R, R, w.wh, w.ck, pitch, u, FIG);
      hip = B.seat; legs = B.pedals; cage = B.down;
    } else if (kind === 'scooter' || kind === 'skateboard') {
      const c = Math.cos(pitch), sn = Math.sin(pitch), P = (dx, dy) => [bx + dx * c - dy * sn, y - R + dx * sn + dy * c];
      const span = kind === 'scooter' ? 4 * R : 5 * R, deckY = kind === 'scooter' ? -0.4 * R : -0.9 * R, a = P(kind === 'scooter' ? 0.4 * R : -0.8 * R, deckY), b = P(kind === 'scooter' ? span - 0.4 * R : span + 0.8 * R, deckY);
      wheel(r, bx, y - R, R, w.wh, u, FIG, 1.4);
      const fw = P(span, 0);
      wheel(r, fw[0], fw[1], R, w.wh, u, FIG, 1.4);
      r.stroke(a[0], a[1], b[0], b[1], mx1(1.6 * u), FIG);
      if (kind === 'scooter') { const st = P(span - 0.3 * R, deckY), tp = P(span - 0.3 * R, -5.5 * R); r.stroke(st[0], st[1], tp[0], tp[1], mx1(1.2 * u), FIG); r.rect(tp[0] - 2.5 * u, tp[1] - u * 0.5, 5 * u, mx1(u), FIG); }
      const fx = kind === 'scooter' ? span * 0.45 : span * 0.5, standY = deckY - 0.3 * u;
      lean = kind === 'scooter' ? 0.15 : 0.45;
      torso = kind === 'scooter' ? 0.1 * N : 0.085 * N;
      legLen = 0.05 * N;
      hip = P(fx, standY - torso * (kind === 'scooter' ? 0.9 : 0.6));
      hip[1] += Math.sin(Math.PI * w.kick) * 2 * u; // the standing knee gives as he reaches down
      // the push: the near foot planted on the road where it came down, still there while the deck rolls on, then swung
      // back up to the deck through the air; the other foot stays on the deck
      const foot1 = P(fx - 0.5 * R, standY), home = P(fx + 0.6 * R, standY), q = (0.5 - w.kick) / 0.5;
      const foot2 = w.kick > 0.5 ? [w.foot, surf(w.foot)] : w.kick > 0 ? [lerp(w.foot, home[0], q), lerp(surf(w.foot), home[1], q) - Math.sin(Math.PI * q) * 3 * u] : home;
      legs = [foot1, foot2];
      cage = P(kind === 'scooter' ? 1 * R : 4 * R, deckY - 2 * u);
    } else { // the cart: a wire basket wider at the top, four small wheels, the handle; the horse trotting ahead of it
      const c = Math.cos(pitch), sn = Math.sin(pitch), P = (dx, dy) => [bx + dx * c - dy * sn, y - R + dx * sn + dy * c];
      const b0 = P(0.5 * R, -1.6 * R), b1 = P(6 * R, -1.6 * R), t0 = P(-0.3 * R, -5.5 * R), t1 = P(6.8 * R, -5.5 * R), hd = P(-2 * R, -6 * R), fw = P(5.5 * R, 0);
      wheel(r, bx, y - R, R, w.wh, u, FIG);
      wheel(r, fw[0], fw[1], R, w.wh, u, FIG);
      r.poly([t0, t1, b1, b0], DARK + DIM);
      for (let k = 0; k <= 4; k++) { const q = k / 4; r.line(lerp(t0[0], t1[0], q), lerp(t0[1], t1[1], q), lerp(b0[0], b1[0], q), lerp(b0[1], b1[1], q), MID); }
      for (let k = 0; k <= 3; k++) { const q = k / 3; r.line(lerp(t0[0], b0[0], q), lerp(t0[1], b0[1], q), lerp(t1[0], b1[0], q), lerp(t1[1], b1[1], q), MID); }
      r.stroke(t0[0], t0[1], hd[0], hd[1], mx1(1.2 * u), FIG);
      r.line(b0[0], b0[1], bx, y - R, FIG);
      r.line(b1[0], b1[1], fw[0], fw[1], FIG);
      hip = P(3.2 * R, -3 * R);
      legs = [P(5.6 * R, -2.6 * R), P(5.2 * R, -1.8 * R)];
      cage = P(1.2 * R, -3.5 * R);
      lean = 0.1;
      legLen = 0.045 * N;
      const hx = bx + 0.3 * N, sz = 0.13 * N, Hh = horse(r, hx, g, sz, FIG, ph, 1, u);
      r.line(Hh.wx - sz * 0.1, Hh.wy + sz * 0.1, Hh.wx - sz * 0.6, g - u, DARK); // the traces, hooked to nothing
      r.line(Hh.wx - sz * 0.1, Hh.wy + sz * 0.2, Hh.wx - sz * 0.55, g - u, DARK);
    }
    const T = riderTorso(r, hip, torso, lean, dir, u);
    for (const [k, foot] of legs.entries()) leg2(r, hip, foot, legLen, dir, mx1(1.8 * u), k === 0 ? FIG + DIM : FIG);
    if (cage) can(r, cage[0], cage[1] + 2 * u, 4 * u, u);
    // the sword arm up (a swing forward and back on a kick), the bottle arm forward with the slosh in the bottle,
    // the cigarette in the visor and its smoke
    const sa = -1.3 + 1.6 * Math.sin(Math.PI * (1 - w.swing)) * (w.swing > 0 ? 1 : 0), al = torso * 0.55, hx = T.sx + Math.cos(sa) * al, hy = T.sy + Math.sin(sa) * al;
    r.stroke(T.sx, T.sy, hx, hy, mx1(1.8 * u), FIG);
    r.stroke(hx, hy, hx + Math.cos(sa) * torso * 0.9, hy + Math.sin(sa) * torso * 0.9, mx1(1.3 * u), BRIGHT);
    r.stroke(hx - Math.sin(sa) * 2.5 * u, hy + Math.cos(sa) * 2.5 * u, hx + Math.sin(sa) * 2.5 * u, hy - Math.cos(sa) * 2.5 * u, mx1(u), DARK);
    const ba = 0.55, bhx = T.sx + Math.cos(ba) * al * 0.9, bhy = T.sy + Math.sin(ba) * al * 0.9, bw = 2.6 * u, bh = 6 * u, tl = Math.tan(clamp(w.slosh.x, -0.6, 0.6));
    r.stroke(T.sx, T.sy, bhx, bhy, mx1(1.8 * u), FIG + DIM);
    r.rect(bhx - bw / 2, bhy - bh, bw, bh, LMID);
    r.rect(bhx - bw * 0.2, bhy - bh - 2 * u, bw * 0.4, 2 * u, LMID);
    const lv = bhy - bh * 0.45;
    r.poly([[bhx - bw / 2, lv - tl * bw * 0.5], [bhx + bw / 2, lv + tl * bw * 0.5], [bhx + bw / 2, bhy], [bhx - bw / 2, bhy]], MID + DIM);
    r.line(bhx - bw / 2, lv - tl * bw * 0.5, bhx + bw / 2, lv + tl * bw * 0.5, BRIGHT);
    const cx = T.hx + torso * 0.2 * 1.1, cy = T.hy - 0.5 * u;
    r.rect(T.hx + torso * 0.1, cy, torso * 0.12, mx1(u * 0.7), WHITE);
    r.rect(cx, cy, mx1(u), mx1(u * 0.7), w.glow > 0.4 ? BRIGHT : HOT);
    if (w.drag || rnd() < dt * 2) { w.drag = false; w.smoke.push(puff(cx + u, cy - u, 0, -(0.04 + 0.03 * w.glow) * N, 1.6 + rnd())); } // a draw on each hat
    w.smoke = smoke(W, w.smoke, wind, LMID).slice(-60);
    // the beast: a cloud of fluff with a face and two wings beating on the beat; a loop on a snare, a dive under
    // the knight while he flies
    const Bt = w.beast, home = [bx - 0.22 * N, g - 0.34 * N + Math.sin(t * 1.7) * 2 * u];
    let tx = home[0], ty = home[1], rot = 0;
    if (w.fly) { tx = bx + 0.05 * N; ty = g - 0.05 * N; }
    if (Bt.loop >= 0) { const q = Bt.loop, Lr = 0.08 * N; tx += Math.sin(TAU * q) * Lr; ty -= (1 - Math.cos(TAU * q)) * Lr; rot = -TAU * q; Bt.loop += dt / 0.75; if (Bt.loop >= 1) Bt.loop = -1; } // nose along the loop (it turns anticlockwise)
    Bt.x = follow(Bt.x || tx, tx, dt, 0.18);
    Bt.y = follow(Bt.y || ty, ty, dt, 0.18);
    const bsz = 0.035 * N, flap = beatLocked(f) ? Math.cos(f.beat.phase * TAU) : Math.cos(t * 9), cr = Math.cos(rot), sr = Math.sin(rot), Q = (dx, dy) => [Bt.x + dx * cr - dy * sr, Bt.y + dx * sr + dy * cr];
    for (const k of [-1, 1]) { const wa = Q(k * bsz * 0.4, -bsz * 0.1), wt = Q(k * bsz * 2.1, bsz * (0.9 * flap - 0.7)), wb = Q(k * bsz * 1.3, bsz * 0.4); r.poly([wa, wt, wb], WHITE); r.line(wa[0], wa[1], wt[0], wt[1], LMID); r.line(wt[0], wt[1], wb[0], wb[1], LMID); }
    for (const [dx, dy, q] of [[0, 0, 1], [-0.7, 0.2, 0.7], [0.7, 0.15, 0.75], [-0.3, -0.5, 0.6], [0.4, -0.5, 0.6], [0, 0.5, 0.6]]) { const p = Q(dx * bsz, dy * bsz); r.disc(p[0] + u * 0.6, p[1] + u * 0.6, bsz * q, LMID); }
    for (const [dx, dy, q] of [[0, 0, 1], [-0.7, 0.2, 0.7], [0.7, 0.15, 0.75], [-0.3, -0.5, 0.6], [0.4, -0.5, 0.6], [0, 0.5, 0.6]]) { const p = Q(dx * bsz, dy * bsz); r.disc(p[0], p[1], bsz * q, WHITE); }
    const e1 = Q(bsz * 0.55, -bsz * 0.25), e2 = Q(bsz * 0.9, -bsz * 0.25);
    r.rect(e1[0] - u * 0.5, e1[1], mx1(u), mx1(u), BLACK);
    r.rect(e2[0] - u * 0.5, e2[1], mx1(u), mx1(u), BLACK);
    targets.push({ x: bx - 0.08 * N, y: y - 0.32 * N, w: 0.22 * N, h: 0.32 * N });
    targets.push({ x: Bt.x - bsz * 2, y: Bt.y - bsz * 1.5, w: bsz * 4, h: bsz * 3 });
  },
};


// ---------------------------------------------------------------------------------------------- castlerave
// The great hall as a rave: torches on the pillars strobing on the heavy kicks, a jester at the turntable on the
// dais (the platter at thirty-three turns a minute, a nod on the beat, headphones), knights in plate dancing
// stiffly in a row (a new pose each beat, a spark where the plate clanks), a monk pouring behind the bar on the
// hats, lasers from the chandelier on the snares, plain banners swaying with the mids, smoke along the floor. The
// crowd is the kind: a few, packed, the whole court. A drop puts a dragon's head through the window to breathe fire
// across the hall while everyone ducks.
const CROWD_W = { few: [3, 2, 1], packed: [1, 2, 2], court: [1, 1, 2] };
const castlerave = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { is: 'castlerave', N: W.N, kind: rollW(rnd, CROWD_W, bandOf(W.a)), platter: 0, strobe: 0, lasers: [], sparks: [], fog: [], pour: 0, dragon: null, fire: [], poses: new Uint8Array(12) });
  },
  draw(W) {
    if (W.w.is !== 'castlerave' || W.w.N !== W.N) castlerave.init(W);
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = 0.84 * N, kind = w.kind, tt = (t * 12) | 0;
    if (f.section === 'change') w.kind = rollW(rnd, CROWD_W, band);
    if (f.section === 'drop' && !w.dragon) w.dragon = { t: 0 };
    const n = kind === 'few' ? 4 : kind === 'packed' ? 7 : 9;
    for (const h of hits) {
      if (isLow(h) && h.strength > 0.6) w.strobe = 0.08;
      else if (h.kind === 'snare') for (let k = 0; k < 3; k++) w.lasers.push({ x: (0.1 + rnd() * 0.8) * N, t: 0.18, c: k % 2 ? HOT : COOL });
      else if (h.kind === 'hat') w.pour = 0.3;
    }
    w.strobe -= dt;
    w.pour -= dt;
    w.platter += dt * TAU * (33.3 / 60); // thirty-three and a third a minute, whatever the tempo
    const D = w.dragon, breathing = D && D.t > 0.8 && D.t < 2.4, duck = D && D.t > 0.6 && D.t < 2.8;
    if (D) { D.t += dt; if (D.t > 3.6) w.dragon = null; }
    const strobe = w.strobe > 0;
    // the hall: the wall, the pillars with their torches, the windows (the sky beyond), the banners, the chandelier
    r.rect(0, 0, N, g, strobe ? MID : MID + DIM);
    for (let k = 0; k < 5; k++) {
      const px = (0.1 + k * 0.2) * N;
      if (k < 4) { const wx = px + 0.1 * N; r.rect(wx - 0.03 * N, 0.2 * N, 0.06 * N, 0.22 * N, BG); r.poly([[wx - 0.03 * N, 0.2 * N], [wx + 0.03 * N, 0.2 * N], [wx, 0.14 * N]], BG); r.rect(wx - u * 0.5, 0.14 * N, mx1(u), 0.28 * N, DARK + DIM); }
      r.rect(px - 0.02 * N, 0, 0.04 * N, g, DARK);
      r.rect(px - 0.025 * N, 0, 0.05 * N, 0.03 * N, DARK + DIM);
      r.rect(px - u, 0.5 * N, 2 * u, 0.05 * N, DARK + DIM);
      flame(r, px, 0.5 * N, (strobe ? 7 : 4) * u, (strobe ? 11 : 7) * u * (0.8 + 0.4 * f.level), tt, k * 7);
      if (strobe) r.disc(px, 0.47 * N, 0.06 * N, BRIGHT);
    }
    for (let k = 0; k < 4; k++) { // the banners: plain cloth in two colours, swaying with the mids
      const bxp = (0.2 + k * 0.2) * N - 0.07 * N, sw = Math.sin(t * 1.6 + k) * (1 + 3 * f.rel.midDrive) * u, c = k % 2 ? HOT : COOL;
      r.rect(bxp - 0.025 * N, 0.04 * N, 0.05 * N, 0.12 * N, c);
      r.poly([[bxp - 0.025 * N, 0.16 * N], [bxp + 0.025 * N, 0.16 * N], [bxp + sw, 0.2 * N]], c);
      r.rect(bxp - 0.03 * N, 0.035 * N, 0.06 * N, mx1(u), LMID);
    }
    const chx = 0.5 * N, chy = 0.12 * N;
    r.rect(chx - u * 0.5, 0, mx1(u), chy, DARK);
    r.ring(chx, chy, 0.07 * N, mx1(1.5 * u), DARK, 0.35);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; r.rect(chx + Math.cos(a) * 0.07 * N - u * 0.5, chy + Math.sin(a) * 0.025 * N - 2 * u, mx1(u), 2 * u, hash(k, tt) < 0.85 ? BRIGHT : HOT); }
    w.lasers = w.lasers.filter((l) => { l.t -= dt; if (l.t > 0) r.line(chx, chy, l.x, g, l.t > 0.09 ? l.c : l.c + DIM); return l.t > 0; });
    // the floor, the dais with the turntable and the jester, the bar with the monk
    r.rect(0, g, N, N - g, DARK);
    for (let x = 0; x < N; x += 0.1 * N) r.rect(x, g, mx1(u), N - g, DARK + DIM);
    r.rect(0, g, N, mx1(u), MID + DIM);
    const dx0 = 0.72 * N, dy = g - 0.07 * N;
    r.rect(dx0, dy, N - dx0, 0.07 * N, MID);
    r.rect(dx0, dy, N - dx0, mx1(u), LMID);
    const tx = 0.86 * N, ty = dy - 0.05 * N;
    // the jester behind the decks, standing on the dais (the decks hide his legs); he crouches behind them to duck
    const jh = 0.15 * N * (duck ? 0.55 : 1), J = walker(r, tx, dy - 0.005 * N, jh, FIG, 0.2 * Math.sin(t * 3), -1, {});
    const nod = f.beat.pulse * 2 * u;
    r.poly([[tx - jh * 0.12, J.head - jh * 0.08 + nod], [tx + jh * 0.12, J.head - jh * 0.08 + nod], [tx + jh * 0.2, J.head - jh * 0.3 + nod], [tx, J.head - jh * 0.22 + nod], [tx - jh * 0.2, J.head - jh * 0.3 + nod]], HOT);
    for (const k of [-0.2, 0.2]) r.rect(tx + k * jh - u * 0.5, J.head - jh * 0.3 + nod, mx1(u), mx1(u), BRIGHT);
    for (const k of [-1, 1]) r.rect(tx + k * jh * 0.11 - u, J.head - u + nod, 2 * u, 2.5 * u, DARK);
    r.ring(tx, J.head + nod, jh * 0.12, mx1(u), DARK, 0.8);
    r.rect(tx - 0.1 * N, ty, 0.2 * N, 0.05 * N, DARK);
    r.rect(tx - 0.1 * N, ty, 0.2 * N, mx1(u), LMID + DIM);
    r.ring(tx - 0.04 * N, ty + u, 0.035 * N, mx1(u), LMID, 0.45);
    r.rect(tx - 0.04 * N + Math.cos(w.platter) * 0.03 * N - u * 0.5, ty + u + Math.sin(w.platter) * 0.013 * N - u * 0.5, mx1(u), mx1(u), BRIGHT);
    for (let k = 0; k < 5; k++) r.rect(tx + 0.02 * N + k * 0.012 * N, ty + 0.012 * N + (hash(k, (t * 4) | 0) < 0.5 ? 0 : u), mx1(u), 2 * u, k < 3 ? COOL : HOT);
    targets.push({ x: tx - 0.12 * N, y: ty - 0.14 * N, w: 0.24 * N, h: 0.2 * N });
    // the monk on the floor behind the bar, the counter in front of him, the glasses standing on it
    const brx = 0.08 * N, bar = g - 0.065 * N;
    monk(r, brx, g, 0.13 * N, FIG, 0, 1, u);
    r.rect(0, g - 0.06 * N, 0.16 * N, 0.06 * N, MID);
    r.rect(0, bar, 0.17 * N, mx1(u), LMID);
    r.rect(brx + 0.02 * N, bar - 2.5 * u, 2 * u, 2.5 * u, LMID);
    if (w.pour > 0) { r.rect(brx + 0.04 * N, g - 0.11 * N, 3 * u, 3 * u, LMID); r.rect(brx + 0.04 * N + u, g - 0.09 * N, mx1(u * 0.8), bar - (g - 0.09 * N), COOL); }
    for (let k = 0; k < 4; k++) r.rect(0.015 * N + k * 0.025 * N, bar - 2 * u, 2 * u, 2 * u, LMID);
    // the knights in a row: stiff, a pose per beat, held until the next; a clank spark where the arm snaps up; a hop a
    // cell high on every beat, off the floor on it and down again under gravity a fifth of a second later
    const G = GR * N, hopT = Math.sqrt((8 * u) / G), since = (beatLocked(f) ? f.beat.phase : (t * bps(f)) % 1) / bps(f), bounce = since < hopT ? 0.5 * G * since * (hopT - since) : 0;
    for (let k = 0; k < n; k++) {
      const kx = (0.2 + (k + 0.5) * (0.5 / n)) * N, kh = 0.15 * N * (duck ? 0.65 : 1);
      if (f.beat.on && hash(k, f.beat.count) < 0.7) { w.poses[k] = (w.poses[k] + 1 + (hash(k + 5, f.beat.count) < 0.5 ? 1 : 0)) % 3; burst(w.sparks, rnd, kx + 0.03 * N, g - kh * 0.75, 3, 0.15 * N, BRIGHT, 0.3); }
      const J2 = knight(r, kx, g - bounce, kh, FIG, 0.3 * (k % 2 ? 1 : -1), k % 2 ? -1 : 1, u, { plume: k % 3 === 0 });
      const pose = w.poses[k], sx = J2.sx, sy = J2.sy;
      if (pose === 1 || pose === 2) r.stroke(sx, sy, sx + 0.04 * N, sy - kh * 0.4, mx1(1.5 * u), FIG);
      if (pose === 2 || pose === 0) r.stroke(kx - J2.hw, sy, kx - J2.hw - 0.04 * N, pose === 2 ? sy - kh * 0.4 : sy + kh * 0.1, mx1(1.5 * u), FIG);
    }
    targets.push({ x: 0.2 * N, y: g - 0.16 * N, w: 0.5 * N, h: 0.16 * N });
    // the dragon's head in at the right window on a drop: the neck, the head, the fire across the hall
    if (D) {
      const k = D.t < 0.8 ? ease(D.t / 0.8) : D.t > 2.8 ? 1 - ease((D.t - 2.8) / 0.8) : 1, hx = lerp(1.05 * N, 0.8 * N, k), hy = 0.33 * N, sz = 0.32 * N;
      r.stroke(N + 0.02 * N, 0.3 * N, hx + 0.03 * N, hy, sz * 0.1, DARK);
      const Mh = dragonHead(r, hx, hy, sz, -1, u, breathing ? 1 : 0.2, DARK, BRIGHT);
      if (breathing) { for (let q = 0; q < 180 * dt; q++) w.fire.push({ x: Mh.mx, y: Mh.my, vx: -(0.5 + rnd() * 0.3) * N, vy: (rnd() - 0.6) * 0.1 * N, life: 0.9, s: 2 * u }); if (D.t < 1) s.shake = Math.max(s.shake, 0.4); }
    }
    // the breath: slowed by the air, and the hot gas rising as it goes
    w.fire = w.fire.filter((p) => { p.vx *= Math.exp(-dt * 1.3); p.vy -= GR * N * 0.15 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.s += dt * 4 * u; r.rect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s, p.life > 0.5 ? BRIGHT : HOT); return p.life > 0 && p.x > -p.s; });
    w.sparks = particles(W, w.sparks, BRIGHT).filter((p) => p.y < g);
    if (rnd() < dt * (3 + 10 * f.level)) w.fog.push(puff(rnd() * N, g - u, (rnd() - 0.5) * 0.06 * N, -0.004 * N, 3 + rnd() * 2, 1.4));
    w.fog = smoke(W, w.fog, 0, MID, DARK).slice(-80);
  },
};

// ---------------------------------------------------------------------------------------------- gasstation
// A petrol station for horses: a canopy on two pillars with lamps that flicker on the hats, a pump whose counter
// is three windows of bars rolling with the beat (the last the fastest), a wizard holding the nozzle to a horse
// that drinks from it and swallows on the beat, a knight carrying snacks from the shop to a cart and back at a
// walker's pace, a delivery dragon idling at the far pump, a puff from its nostrils every beat rising and slowing.
// The hour is the kind: day, dusk, night (the lamps carry the scene). A drop: the horse backfires sparks and gallops
// off at the canter, the wizard runs after it, the nozzle whips off on a parabola and lies there till they are back.
const HOUR_W = { day: [3, 2, 1], dusk: [2, 2, 2], night: [1, 2, 3] };
const gasstation = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { is: 'gasstation', N: W.N, kind: rollW(rnd, HOUR_W, bandOf(W.a)), lamps: new Float32Array(4), gulp: 1, kx: 0.22, kdir: 1, carry: true, pile: 0, gait: 0, puffs: [], sparks: [], dust: [], flee: 0, fleeT: 0, hx: 0.68, wx: 0.56, noz: null, snort: 0, snorts: 0 });
  },
  draw(W) {
    if (W.w.is !== 'gasstation' || W.w.N !== W.N) gasstation.init(W);
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = 0.8 * N, kind = w.kind, night = kind === 'night', dusk = kind === 'dusk';
    if (f.section === 'change') w.kind = rollW(rnd, HOUR_W, band);
    if (f.section === 'drop' && !w.flee) { w.flee = 1; w.fleeT = 0; for (let k = 0; k < 24; k++) w.sparks.push({ x: w.hx * N - 0.07 * N, y: g - 0.07 * N, vx: -(0.1 + rnd() * 0.4) * N, vy: -(rnd() - 0.2) * 0.3 * N, life: 0.5 + rnd() * 0.5, s: mx1(u), c: k % 2 ? BRIGHT : HOT }); s.shake = Math.max(s.shake, 0.4); }
    const ph = gait(w, f, dt), hsz = 0.14 * N;
    for (const h of hits) {
      if (h.kind === 'hat') w.lamps[Math.floor(rnd() * 4)] = 0.12;
      else if (isLow(h) && !w.flee) burst(w.dust, rnd, w.hx * N + 0.03 * N, g, 5, 0.12 * N * h.strength, LMID + DIM, 0.4); // a hoof stamps
      else if (h.kind === 'snare') { w.snort = 0.25; w.snorts = 3; } // the snort's puffs leave the nostrils once the head is drawn
    }
    for (let k = 0; k < 4; k++) w.lamps[k] -= dt;
    w.snort -= dt;
    if (f.beat.on) w.gulp = 0;
    w.gulp = Math.min(1, w.gulp + dt * 3);
    // the sky by the hour, the far hills, the shop, the canopy with its lamps (light cones at night), the ground
    if (night) for (let k = 0; k < 40; k++) r.set(hash(k, 3) * N, hash(k, 4) * 0.4 * N, hash(k, 5 + ((t * 2) | 0)) < 0.9 ? LMID : BRIGHT);
    else r.disc((dusk ? 0.1 : 0.8) * N, (dusk ? 0.5 : 0.15) * N, 0.06 * N, dusk ? HOT : BRIGHT);
    hills(r, N, 0.5 * N, 0.1 * N, g, 0, 11, night ? DARK + DIM : LMID);
    r.rect(0, g, N, N - g, night ? DARK + DIM : DARK);
    r.rect(0, g, N, mx1(u), night ? DARK : MID + DIM);
    r.rect(0.02 * N, 0.5 * N, 0.22 * N, g - 0.5 * N, MID);
    r.rect(0.01 * N, 0.48 * N, 0.24 * N, 0.03 * N, DARK);
    r.rect(0.05 * N, 0.56 * N, 0.07 * N, 0.08 * N, night || dusk ? BRIGHT : LMID + DIM);
    r.rect(0.16 * N, 0.62 * N, 0.05 * N, g - 0.62 * N, DARK);
    const cy = 0.4 * N;
    for (const px of [0.3, 0.76]) r.rect(px * N - 1.5 * u, cy, 3 * u, g - cy, DARK);
    r.rect(0.26 * N, cy - 0.035 * N, 0.54 * N, 0.035 * N, MID);
    r.rect(0.26 * N, cy - 0.04 * N, 0.54 * N, mx1(u), LMID);
    for (let k = 0; k < 4; k++) {
      const lx = (0.36 + k * 0.12) * N, on = w.lamps[k] <= 0;
      if (on && (night || dusk)) r.poly([[lx - 2 * u, cy + 2 * u], [lx + 2 * u, cy + 2 * u], [lx + 0.07 * N, g], [lx - 0.07 * N, g]], night ? DARK : MID);
      r.rect(lx - 2 * u, cy, 4 * u, 2 * u, on ? BRIGHT : DARK);
    }
    // the pump: the body, the counter of three windows of rolling bars, the hose sagging to the nozzle
    const pxp = 0.47 * N, pw = 0.07 * N, pt = g - 0.17 * N;
    r.rect(pxp - pw / 2, pt, pw, g - pt, LMID);
    r.rect(pxp - pw / 2 - u, g - 2 * u, pw + 2 * u, 2 * u, DARK);
    r.rect(pxp - pw / 2, pt, pw, mx1(u), BRIGHT);
    const beatQ = beatLocked(f) ? f.beat.count + f.beat.phase : t * bps(f);
    for (let k = 0; k < 3; k++) {
      const wx = pxp - pw * 0.4 + k * pw * 0.28, ww = pw * 0.22, wy = pt + 0.02 * N, wh = 0.035 * N, per = 2 * u, offv = ((beatQ * [0.25, 1, 4][k] * per) % per + per) % per;
      r.rect(wx, wy, ww, wh, BLACK);
      for (let yy = wy - per + offv; yy < wy + wh; yy += per) if (yy >= wy && yy + mx1(u * 0.8) <= wy + wh + 0.01) r.rect(wx + u * 0.5, yy, ww - u, mx1(u * 0.8), BRIGHT);
    }
    r.rect(pxp - pw * 0.35, pt + 0.07 * N, pw * 0.7, 0.03 * N, DARK + DIM);
    // the horse and the wizard: at the pump, bolting, gone, or walking back; the hose and the nozzle follow. The legs go
    // with the speed: the horse's stride covers 0.9 of its length (a stride a beat at canter()), the wizard's step a
    // fifth of his height (a step a beat at pace())
    let hx = w.hx * N, wxp = w.wx * N, hv = 0, wv = 0;
    if (w.flee === 1) { // the bolt: the horse at the canter, the wizard running after it
      w.fleeT += dt;
      hv = canter(hsz, f) * 1.2; wv = pace(0.16 * N, f) * 2.6;
      hx += hv * dt; wxp += wv * dt;
      if (wxp > N + 0.1 * N) { w.flee = 2; w.fleeT = 0; }
    } else if (w.flee === 2) { if ((w.fleeT += dt) > 2.5) { w.flee = 3; hx = N + 0.2 * N; wxp = N + 0.08 * N; } }
    else if (w.flee === 3) { // the walk back, the wizard ahead, each stopping at home; home again they pick the nozzle up
      hv = hx > 0.68 * N ? pace(hsz * 1.4, f) : 0; wv = wxp > 0.56 * N ? pace(0.16 * N, f) : 0;
      hx = Math.max(0.68 * N, hx - hv * dt); wxp = Math.max(0.56 * N, wxp - wv * dt);
      if (wxp <= 0.56 * N && hx <= 0.68 * N + u) { w.flee = 0; w.noz = null; }
    }
    w.hx = hx / N; w.wx = wxp / N;
    const Hh = horse(r, hx, g, hsz, FIG, (ph * hv) / canter(hsz, f) * 2, w.flee === 1 ? 1 : -1, u, { moving: hv > 0, head: w.flee ? 0 : 0.55 });
    if (!w.flee && w.gulp < 1) r.disc(lerp(Hh.mx, Hh.wx, w.gulp) - hsz * 0.05, lerp(Hh.my, Hh.wy, w.gulp), 1.8 * u, FIG); // the swallow going down the neck
    if (w.flee === 1 && w.fleeT > 0.4 && !w.noz) w.noz = { x: Hh.mx, y: Hh.my, vx: -0.25 * N, vy: -0.35 * N, down: false }; // out of its mouth, the hose whipping it back
    const Jw = wizard(r, wxp, g, 0.16 * N, FIG, (ph * wv) / pace(0.16 * N, f), w.flee === 1 ? 1 : -1, u);
    let nx, ny;
    if (w.noz) { const Nz = w.noz, G = GR * N; if (!Nz.down) { Nz.x += Nz.vx * dt; Nz.y += (Nz.vy + 0.5 * G * dt) * dt; Nz.vy += G * dt; if (Nz.y >= g - u) { Nz.y = g - u; Nz.down = true; } } nx = Nz.x; ny = Nz.y; }
    else if (w.flee === 1) { nx = Hh.mx; ny = Hh.my; }
    else { nx = Hh.mx - hsz * 0.02; ny = Hh.my - hsz * 0.02; r.stroke(Jw.sx, Jw.sy, nx + 2 * u, ny, mx1(1.5 * u), FIG); }
    const hx0 = pxp + pw / 2, hy0 = pt + 0.1 * N, sag = Math.max(0, 0.12 * N - Math.abs(nx - hx0) * 0.3);
    let lx = hx0, ly = hy0;
    for (let k = 1; k <= 8; k++) { const q = k / 8, cxq = lerp(hx0, nx, q), cyq = lerp(hy0, ny, q) + Math.sin(q * Math.PI) * sag; r.line(lx, ly, cxq, cyq, DARK); lx = cxq; ly = cyq; }
    r.rect(nx - 2 * u, ny - u, 4 * u, 2 * u, DARK);
    // the knight with the snacks between the shop door and the cart, a walker's pace, the pile in the cart growing
    const kh = 0.15 * N, kxp = w.kx * N;
    w.kx += (w.kdir * pace(kh, f) * dt) / N;
    if (w.kx > 0.36) { w.kx = 0.36; w.kdir = -1; w.carry = false; w.pile = (w.pile + 1) % 6; } else if (w.kx < 0.2) { w.kx = 0.2; w.kdir = 1; w.carry = true; }
    r.rect(0.37 * N, g - 0.05 * N, 0.07 * N, 0.04 * N, MID);
    r.ring(0.39 * N, g - u, 2 * u, mx1(u), DARK);
    r.ring(0.425 * N, g - u, 2 * u, mx1(u), DARK);
    for (let k = 0; k < w.pile; k++) r.rect(0.375 * N + (k % 3) * 0.02 * N, g - 0.06 * N - Math.floor(k / 3) * 2 * u, 0.018 * N, 2 * u, k % 2 ? BRIGHT : LMID);
    const Jk = knight(r, kxp, g, kh, FIG, ph, w.kdir, u, {});
    if (w.carry) for (let k = 0; k < 3; k++) r.rect(kxp + w.kdir * kh * 0.12 - 0.012 * N, Jk.sy + kh * 0.1 - k * 2.5 * u, 0.025 * N, 2.5 * u, k % 2 ? LMID : BRIGHT);
    // the delivery dragon idling at the far pump with a box strapped on, its nostrils puffing on the beat
    const dxp = 0.9 * N, Dg = dragon(r, dxp, g, 0.3 * N, -1, u, { ph: t * 1.5, head: w.snort > 0 ? 0.05 : 0.15, jaw: w.snort > 0 ? 0.6 : 0.1 + 0.1 * f.beat.pulse });
    const nox = Dg.hx - 0.3 * N * 0.23, noy = Dg.hy - 0.3 * N * 0.03; // the nostrils, at the tip of the snout
    for (; w.snorts > 0; w.snorts--) w.puffs.push(puff(nox, noy, -(0.03 + rnd() * 0.04) * N, -(0.04 + rnd() * 0.04) * N, 2));
    if (f.beat.on) w.puffs.push(puff(nox, noy, -0.01 * N, -0.06 * N, 2.5));
    r.rect(dxp - 0.05 * N, g - 0.16 * N, 0.08 * N, 0.06 * N, LMID);
    r.rect(dxp - 0.05 * N, g - 0.135 * N, 0.08 * N, mx1(u), HOT);
    w.puffs = smoke(W, w.puffs, 0.008 * N).slice(-40);
    w.sparks = tumble(W, w.sparks, g, HOT);
    w.dust = particles(W, w.dust, LMID + DIM).filter((p) => p.y < g);
    targets.push({ x: hx - hsz * 0.6, y: g - hsz * 0.9, w: hsz * 1.2, h: hsz * 0.9 });
    targets.push({ x: kxp - kh * 0.3, y: g - kh, w: kh * 0.6, h: kh });
  },
};

// ---------------------------------------------------------------------------------------------- bikejoust
// The tiltyard: two knights with lances charging at each other along the tilt, the near one this side of the
// rail, the far one beyond it and smaller; pedals turning with the travel, the pass once every few bars and the
// turn out of frame. Peasants in the stands wave on the beat, two heralds' trumpets flare on the snares, the
// pennants flap with the treble. The mounts are the kind: bicycles, motorbikes that smoke at the tempo, pogo
// sticks that hop once a beat (a parabola each, the spring taking the landing). A drop arms the clash: one knight
// flies off on a parabola, his plate scatters and bounces, his mount rolls on riderless and keels over.
const MOUNT_W = { bicycle: [3, 3, 2], motorbike: [1, 2, 3], pogo: [2, 1, 1] };
const bikejoust = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { is: 'bikejoust', N: W.N, kind: rollW(rnd, MOUNT_W, bandOf(W.a)), A: { x: -0.12, dir: 1, wh: 0, ck: 0, hop: 0 }, B: { x: 1.12, dir: -1, wh: 0, ck: 0, hop: 0 }, wait: 0, met: false, armed: false, clash: null, flare: 0, stomp: 0, sparks: [], puffs: [], gait: 0,
      crowd: Array.from({ length: 28 }, (_, i) => ({ x: 0.08 + (i % 14) * 0.065 + rnd() * 0.02, row: i < 14 ? 0 : 1, h: 0.8 + rnd() * 0.4, c: i % 3 })) });
  },
  draw(W) {
    if (W.w.is !== 'bikejoust' || W.w.N !== W.N) bikejoust.init(W);
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), kind = w.kind, g = 0.8 * N, far = g - 0.035 * N;
    if (f.section === 'change') w.kind = rollW(rnd, MOUNT_W, band);
    if (f.section === 'drop') w.armed = true;
    for (const h of hits) { if (h.kind === 'snare') w.flare = 0.25; else if (isLow(h)) w.stomp = 1; } // the stands stamp on the kicks
    w.flare -= dt;
    w.stomp = Math.max(0, w.stomp - dt * 5);
    const ph = gait(w, f, dt), R = kind === 'motorbike' ? 4.5 * u : 5 * u, v = kind === 'pogo' ? 0.1 * N * bps(f) : 0.14 * N * bps(f) * (kind === 'motorbike' ? 1.4 : 1);
    // the sky and the field, the pavilions with their pennants, the stands with the crowd, the heralds, the tilt rail
    r.disc(0.78 * N, 0.14 * N, 0.06 * N, BRIGHT);
    hills(r, N, 0.36 * N, 0.08 * N, g, 0, 17, LMID);
    r.rect(0, g, N, N - g, MID);
    r.rect(0, g, N, mx1(u), LMID);
    for (const [px, c] of [[0.08, HOT], [0.92, COOL]]) {
      const pw = 0.14 * N, top = 0.3 * N;
      r.rect(px * N - pw / 2, 0.44 * N, pw, 0.1 * N, c);
      r.poly([[px * N - pw * 0.6, 0.44 * N], [px * N + pw * 0.6, 0.44 * N], [px * N, top]], c);
      for (let k = -2; k <= 2; k++) r.rect(px * N - pw / 2 + (k + 2) * pw * 0.2, 0.44 * N, pw * 0.1, 0.1 * N, BRIGHT);
      r.rect(px * N - u * 0.5, top - 0.05 * N, mx1(u), 0.05 * N, DARK);
      const flap = Math.sin(t * 6 + px) * (1 + 4 * f.rel.trebDrive) * u;
      r.poly([[px * N, top - 0.05 * N], [px * N + 0.03 * N, top - 0.04 * N + flap], [px * N, top - 0.03 * N]], BRIGHT);
    }
    r.rect(0.16 * N, 0.5 * N, 0.68 * N, 0.1 * N, DARK + DIM);
    for (const c of w.crowd) {
      const cx = c.x * N, cy = (c.row ? 0.58 : 0.53) * N + w.stomp * 1.5 * u, ch = 0.045 * N * c.h, up = f.beat.pulse > 0.35 && hash(c.x * 1000 | 0, f.beat.count) < 0.7;
      r.rect(cx - ch * 0.25, cy - ch * 0.7, ch * 0.5, ch * 0.7, [DARK, MID, LMID + DIM][c.c]);
      r.disc(cx, cy - ch * 0.82, ch * 0.16, LMID);
      for (const k of [-1, 1]) r.disc(cx + k * ch * 0.4, up ? cy - ch * 1.05 : cy - ch * 0.5, mx1(ch * 0.1), LMID);
    }
    for (const [hx, dir] of [[0.19, 1], [0.81, -1]]) { // the heralds and their long trumpets
      const X = hx * N, Y = 0.5 * N;
      walker(r, X, Y, 0.08 * N, FIG, 0, dir, {});
      const ex = X + dir * 0.09 * N, ey = Y - 0.09 * N;
      r.stroke(X + dir * 0.01 * N, Y - 0.055 * N, ex, ey, mx1(1.2 * u), LMID);
      r.disc(ex, ey, 2 * u, w.flare > 0 ? BRIGHT : LMID);
      if (w.flare > 0) { const k = 1 - w.flare / 0.25; for (let q = 0; q < 5; q++) { const a = -0.9 + q * 0.45; r.line(ex + dir * Math.cos(a) * 3 * u, ey + Math.sin(a) * 3 * u, ex + dir * Math.cos(a) * (4 + 10 * k) * u, ey + Math.sin(a) * (4 + 10 * k) * u, BRIGHT); } }
    }
    r.rect(0, 0.46 * N, N, mx1(u), DARK + DIM);
    r.rect(0, far - 0.02 * N, N, mx1(1.5 * u), DARK); // the tilt: a rail on posts between the two lists
    for (let x = 0.04 * N; x < N; x += 0.08 * N) r.rect(x - u * 0.5, far - 0.02 * N, mx1(u), 0.055 * N, DARK + DIM);
    // the pass: both ride in, meet in the middle (sparks, the lances kicked up), ride out, and come again after a bar
    const C = w.clash;
    if (w.wait > 0) { if ((w.wait -= dt) <= 0) { w.A.x = -0.12; w.B.x = 1.12; w.met = false; w.clash = null; } }
    for (const K of [w.A, w.B]) { // the wheels and the cranks turn the way he rides, at v over the radius he has (the far one's is smaller)
      const sc = K === w.B ? 0.9 : 1;
      if (!(C && C.loser === K) && w.wait <= 0) { K.x += (K.dir * v * dt) / N; K.wh += (K.dir * v * dt) / (R * sc); K.ck += (K.dir * v * dt) / (R * sc * 2.6); }
    }
    if (!w.met && w.A.x >= w.B.x - 0.05) {
      w.met = true;
      const mxp = ((w.A.x + w.B.x) / 2) * N;
      burst(w.sparks, rnd, mxp, g - 0.14 * N, 12, 0.3 * N, BRIGHT, 0.4);
      if (w.armed) { // the clash: one of them unhorsed, his plate everywhere, his mount going on alone
        w.armed = false;
        const loser = rnd() < 0.5 ? w.A : w.B, base = loser === w.A ? g : far;
        w.clash = { loser, fly: { x: loser.x * N, y: base - 0.14 * N, vx: -loser.dir * 0.22 * N, vy: -0.45 * N, rot: 0, down: false }, bike: { x: loser.x * N, v: kind === 'pogo' ? 0 : loser.dir * v, wh: loser.wh, tilt: 0 }, pieces: [] }; // a pogo stick has nothing to roll on: it just falls
        for (let k = 0; k < 10; k++) w.clash.pieces.push({ x: loser.x * N, y: base - 0.12 * N, vx: (rnd() - 0.5) * 0.5 * N, vy: -(0.1 + rnd() * 0.4) * N, life: 4, s: mx1(2 * u), c: k % 2 ? LMID : LMID + DIM });
        s.shake = Math.max(s.shake, 0.6);
      } else s.shake = Math.max(s.shake, 0.15);
    }
    if (w.wait <= 0 && w.A.x > 1.15 && w.B.x < -0.15) w.wait = 60 / (f.bpm || 120) * 4;
    const kick = w.met && !C ? Math.max(0, 1 - Math.abs(w.A.x - w.B.x) * 6) : 0; // the lances up as they glance off
    // a knight on his mount at (x, base), facing dir, at scale sc; the lance level, raised by `up`
    const rider = (K, base, sc, up) => {
      const X = K.x * N, Rs = R * sc, nh = bps(f) < 1.4 ? 2 : 1, hopPh = ((beatLocked(f) ? f.beat.phase : (t * bps(f)) % 1) * nh) % 1;
      let hip, lean = 0.55, legs, torso = 0.08 * N * sc, legLen = 0.06 * N * sc;
      if (kind === 'pogo') { // the hop: a parabola a beat long (two to a slow beat) under the field's gravity, so as high as
        // that makes it (g T²/8, less far off), the spring shortest at the landing
        const T = 1 / (bps(f) * nh), hop = 4 * hopPh * (1 - hopPh) * (GR * N * sc * T * T) / 8, comp = hopPh < 0.08 || hopPh > 0.92 ? 1 - Math.min(hopPh, 1 - hopPh) / 0.08 : 0, foot = base - hop, stick = 0.09 * N * sc * (1 - 0.3 * comp);
        r.stroke(X, foot, X, foot - stick, mx1(1.5 * u), MID);
        for (let k = 0; k < 4; k++) r.rect(X - 2 * u, foot - stick * 0.1 - k * stick * 0.08 * (1 - 0.4 * comp), 4 * u, mx1(u), LMID);
        r.rect(X - 2.5 * u, foot - stick * 0.45, 5 * u, mx1(u), MID);
        r.rect(X - 3 * u, foot - stick - u, 6 * u, mx1(u), MID);
        hip = [X - K.dir * 0.01 * N, foot - stick - 0.05 * N * sc];
        legs = [[X - 2 * u, foot - stick * 0.45], [X + 2 * u, foot - stick * 0.45]];
        lean = 0.15;
      } else if (kind === 'motorbike') {
        const fx = X + K.dir * 2.4 * Rs;
        wheel(r, X, base - Rs, Rs, K.wh, u, FIG, 1.6);
        wheel(r, fx, base - Rs, Rs, K.wh, u, FIG, 1.6);
        r.poly([[X - K.dir * 0.3 * Rs, base - Rs * 1.3], [X + K.dir * 2 * Rs, base - Rs * 1.1], [X + K.dir * 2.3 * Rs, base - Rs * 2.1], [X + K.dir * 1.2 * Rs, base - Rs * 2], [X + K.dir * 0.2 * Rs, base - Rs * 2.3]], FIG);
        r.stroke(X + K.dir * 2.1 * Rs, base - Rs * 2, X + K.dir * 2.5 * Rs, base - Rs * 2.6, mx1(1.2 * u), FIG);
        r.rect(X + K.dir * 1.6 * Rs - 1.5 * u, base - Rs * 1.6, 3 * u, 2 * u, HOT);
        if (f.beat.on) w.puffs.push(puff(X - K.dir * 0.5 * Rs, base - Rs * 0.7, -K.dir * 0.05 * N, -0.03 * N, 1.5));
        hip = [X + K.dir * 0.7 * Rs, base - Rs * 2.3];
        legs = [[X + K.dir * 1.3 * Rs, base - Rs * 0.9], [X + K.dir * 1.5 * Rs, base - Rs * 0.8]];
        lean = 0.5;
      } else {
        const B = bicycle(r, X, base - Rs, Rs, K.wh, K.ck, 0, u, FIG, K.dir);
        hip = B.seat; legs = B.pedals;
      }
      const T = riderTorso(r, hip, torso, lean, K.dir, u);
      for (const [k, foot] of legs.entries()) leg2(r, hip, foot, legLen, K.dir, mx1(1.8 * u), k ? FIG : FIG + DIM);
      const la = up * -0.9 - kick * 0.5, hx = T.sx + K.dir * Math.cos(la) * torso * 0.5, hy = T.sy + Math.sin(la) * torso * 0.5 + torso * 0.15;
      r.stroke(T.sx, T.sy, hx, hy, mx1(1.8 * u), FIG);
      r.stroke(hx - K.dir * Math.cos(la) * 0.04 * N, hy - Math.sin(la) * 0.04 * N, hx + K.dir * Math.cos(la) * 0.2 * N * sc, hy + Math.sin(la) * 0.2 * N * sc, mx1(1.5 * u), LMID);
      r.disc(hx + K.dir * Math.cos(la) * 0.02 * N, hy + Math.sin(la) * 0.02 * N, 2.5 * u, MID);
      r.rect(hx - K.dir * 0.02 * N - 2 * u, hy - 0.03 * N, 4 * u, 0.045 * N, k2(K)); // the shield on the near arm
      targets.push({ x: X - 0.1 * N, y: base - 0.25 * N * sc, w: 0.2 * N, h: 0.25 * N * sc });
    };
    const k2 = (K) => (K === w.A ? HOT : COOL);
    // the far knight first (beyond the rail), then the rail's near side, then the near knight
    if (!(C && C.loser === w.B)) rider(w.B, far, 0.9, C && C.loser === w.A ? 1 : 0);
    r.rect(0, far - 0.02 * N, N, mx1(u), DARK + DIM);
    if (!(C && C.loser === w.A)) rider(w.A, g, 1, C && C.loser === w.B ? 1 : 0);
    if (C) { // the unhorsed one in the air and down, his mount rolling on and over, the plate bouncing about
      const Fy = C.fly, base = C.loser === w.A ? g : far, sc = C.loser === w.A ? 1 : 0.9, G = GR * N * sc; // farther off, everything a tenth smaller, gravity's pull on screen too
      if (!Fy.down) { Fy.x += Fy.vx * sc * dt; Fy.y += (Fy.vy * sc + 0.5 * G * dt) * dt; Fy.vy += (G / sc) * dt; Fy.rot += dt * 7; if (Fy.y >= base - 0.02 * N) { Fy.down = true; Fy.y = base - 0.02 * N; s.shake = Math.max(s.shake, 0.3); } }
      if (Fy.down) { r.rect(Fy.x - 0.06 * N, Fy.y - 0.03 * N, 0.12 * N, 0.03 * N, FIG); helm(r, Fy.x + 0.07 * N, Fy.y - 0.02 * N, 0.016 * N, 1, u); }
      else { const c = Math.cos(Fy.rot), sn = Math.sin(Fy.rot); r.stroke(Fy.x - c * 0.04 * N, Fy.y - sn * 0.04 * N, Fy.x + c * 0.04 * N, Fy.y + sn * 0.04 * N, mx1(3 * u), FIG); helm(r, Fy.x + c * 0.055 * N, Fy.y + sn * 0.055 * N, 0.016 * N, 1, u); for (const k of [-1, 1]) r.stroke(Fy.x, Fy.y, Fy.x - sn * k * 0.04 * N, Fy.y + c * k * 0.04 * N, mx1(1.5 * u), FIG); }
      const Bk = C.bike;
      Bk.v *= Math.exp(-dt * 0.5); Bk.x += Bk.v * dt; Bk.wh += Bk.v * dt / (R * sc);
      if (Math.abs(Bk.v) < 0.08 * N) Bk.tilt = Math.min(1, Bk.tilt + dt * 2.5);
      const sy = Math.cos(Bk.tilt * Math.PI / 2), by = base - R * sc * sy;
      if (kind === 'pogo') r.stroke(Bk.x, base, Bk.x + 0.09 * N * (1 - sy) * Math.sign(Bk.v || 1), base - 0.09 * N * sy, mx1(1.5 * u), MID);
      else { for (const k of [0, 2.2]) r.ring(Bk.x + k * R * sc * Math.sign(Bk.v || 1), by, R * sc, mx1(u), FIG, Math.max(0.08, sy)); r.line(Bk.x, by, Bk.x + 1.1 * R * sc * Math.sign(Bk.v || 1), by - 1.5 * R * sc * sy, FIG); r.line(Bk.x + 2.2 * R * sc * Math.sign(Bk.v || 1), by, Bk.x + 1.1 * R * sc * Math.sign(Bk.v || 1), by - 1.5 * R * sc * sy, FIG); }
      C.pieces = tumble(W, C.pieces, base, LMID, sc);
      if (w.wait <= 0 && Fy.down && ((C.loser === w.A && w.B.x < -0.15) || (C.loser === w.B && w.A.x > 1.15))) w.wait = 60 / (f.bpm || 120) * 4;
    }
    w.sparks = particles(W, w.sparks, BRIGHT);
    w.puffs = smoke(W, w.puffs, 0).slice(-40);
  },
};

// ---------------------------------------------------------------------------------------------- pizzaknight
// A knight on a scooter with a pizza through the village at night: houses at two depths going by, lit windows,
// the cobbles at the speed of travel, the wheels at v/r; the box on the rack leans against every acceleration as
// an inverted pendulum held by its strap and settles again; dogs give chase on the snares at a running gait and
// fall behind; potholes on the kicks (the body drops onto its springs over the wheels and springs back, the box is
// thrown off the rack on the rebound and lands). The street is the kind: a lane, the market street, the high street
// (how many windows are lit, how close the houses). A drop is the town's drawbridge going up ahead: he rides up it,
// flies the parabola over the moat and lands on the far bank.
const STREET_W = { lane: [3, 2, 1], market: [1, 2, 2], highstreet: [1, 1, 2] };
const pizzaknight = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { is: 'pizzaknight', N: W.N, kind: rollW(rnd, STREET_W, bandOf(W.a)), off: 0, wh: 0, spd: 0.2 * W.N, boost: 0, bump: { x: 0, v: 0 }, box: { th: 0, om: 0, h: 0, vy: 0 }, dogs: [], gate: null, fly: null, pitch: 0, moon: 0.15 + rnd() * 0.2, puffs: [] });
  },
  draw(W) {
    if (W.w.is !== 'pizzaknight' || W.w.N !== W.N) pizzaknight.init(W);
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), kind = w.kind, g = 0.82 * N, bx = 0.4 * N, R = 3.2 * u, wb = 4.2 * R, G = GR * N;
    if (f.section === 'change') w.kind = rollW(rnd, STREET_W, band);
    const cruise = N * (0.1 + 0.12 * f.rel.bassDrive) * bps(f) / 2;
    if (f.section === 'drop' && !w.gate && !w.fly) { // the moat sized once, to seven tenths of the flight he will have off the plank (at the run-up's speed, the plank all the way up)
      const Lp = 0.16 * N, sp = cruise + 0.3 * N, vy0 = sp * Math.tan(0.5), T = (vy0 + Math.sqrt(vy0 * vy0 + 2 * G * Math.sin(0.5) * Lp)) / G;
      w.gate = { x: bx + 0.75 * N, ang: 0, Lp, moat: 0.7 * sp * T, launched: false };
    }
    for (const h of hits) {
      if (isLow(h)) { w.bump.v += 0.45 * N * h.strength; if (w.box.h >= 0 && w.box.vy === 0) w.box.vy = -(0.2 + 0.2 * h.strength) * N; } // a pothole: the body drops onto its springs, the box (if it is on the rack) is thrown on the rebound
      else if (h.kind === 'snare') { w.boost = 1.6; if (w.dogs.length < 3) w.dogs.push({ x: -0.08 * N, v: w.spd, ph: rnd() * TAU, tire: 0 }); } // out of an alley, already running
    }
    w.boost -= dt;
    // the speed and the acceleration (what the box feels): a base with the bass, a surge when a dog is after him,
    // flat out for the jump
    const want = cruise + (w.boost > 0 ? 0.1 * N : 0) + (w.gate && !w.fly ? 0.3 * N : 0);
    const spd0 = w.spd;
    w.spd = w.fly ? w.spd : follow(w.spd, want, dt, 0.5);
    const ax = (w.spd - spd0) / dt;
    w.off += (w.spd * dt) / N;
    w.wh += (w.spd * dt) / R;
    // the body on its springs over the wheels, stopped at the ends of their travel
    spring(w.bump, dt, 240, 12);
    if (Math.abs(w.bump.x) > 0.6 * R) { w.bump.x = Math.sign(w.bump.x) * 0.6 * R; if (w.bump.v * w.bump.x > 0) w.bump.v = 0; }
    // the box: strapped upright on the rack, its weight pulling it on the way it leans and its inertia pushing it back
    // as he speeds up (both through its own lever, a quarter of a point mass's), the strap pulling it upright
    const Bx = w.box, Lb = 0.02 * N;
    Bx.om += ((0.25 / Lb) * (G * Math.sin(Bx.th) - ax * Math.cos(Bx.th)) - 40 * Bx.th - 5 * Bx.om) * dt;
    Bx.th = clamp(Bx.th + Bx.om * dt, -1, 1);
    if (Bx.vy !== 0 || Bx.h < 0) { Bx.h += (Bx.vy + 0.5 * G * dt) * dt; Bx.vy += G * dt; if (Bx.h >= 0) { Bx.h = 0; Bx.vy = 0; Bx.om += 2 * (rnd() - 0.5); } }
    const off = w.off, lit = kind === 'lane' ? 0.3 : kind === 'market' ? 0.5 : 0.8, dens = kind === 'highstreet' ? 9 : kind === 'market' ? 7 : 5;
    // the night: a moon, the far houses, the near houses with their lit windows, the cobbled street
    r.disc(w.moon * N, 0.15 * N, 0.05 * N, BRIGHT);
    for (let k = 0; k < 30; k++) r.set(hash(k, 61) * N, hash(k, 62) * 0.35 * N, LMID);
    const house = (k, layer, col) => {
      const sc = layer ? 0.7 : 0.4, hw = (0.07 + 0.05 * hash(k, 71 + layer)) * N, hh = (0.12 + 0.12 * hash(k, 72 + layer)) * N * (layer ? 1.4 : 1), x = wrapX(hash(k, 73 + layer), off * sc * N, N, hw), base = layer ? g : g - 0.08 * N;
      r.rect(x - hw / 2, base - hh, hw, hh, col);
      r.poly([[x - hw * 0.6, base - hh], [x + hw * 0.6, base - hh], [x, base - hh - hw * 0.5]], col === DARK ? MID + DIM : col);
      if (layer) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) r.rect(x - hw * 0.3 + i * hw * 0.4, base - hh * 0.8 + j * hh * 0.4, hw * 0.2, hh * 0.22, hash(k * 4 + i + j * 2, 74) < lit ? (hash(k * 4 + i + j * 2, (t * 3) | 0) < 0.96 ? BRIGHT : LMID) : DARK + DIM);
    };
    for (let k = 0; k < 6; k++) house(k, 0, MID + DIM);
    r.rect(0, g - 0.08 * N, N, 0.08 * N, MID + DIM);
    for (let k = 0; k < dens; k++) house(k, 1, DARK);
    r.rect(0, g, N, N - g, DARK + DIM);
    r.rect(0, g, N, mx1(u), MID + DIM);
    for (let k = 0; k < 20; k++) r.rect(wrapX(hash(k, 81), off * N, N, 3 * u), g + (0.02 + 0.14 * hash(k, 82)) * N, 3 * u, mx1(u), MID + DIM);
    // the gate and the rising drawbridge on a drop: the ride up the plank (pitched by the ground under both wheels), the
    // flight off its end along it, the moat, the far bank
    if (w.gate) {
      const Gt = w.gate;
      Gt.x -= w.spd * dt;
      Gt.ang = Math.min(0.5, Gt.ang + dt * 0.5); // all the way up before he can reach its end
      const ex = Gt.x + Math.cos(Gt.ang) * Gt.Lp, ey = g - Math.sin(Gt.ang) * Gt.Lp, moatEnd = Gt.x + Math.cos(Gt.ang) * Gt.Lp + Gt.moat;
      r.rect(Gt.x, g - 2 * u, moatEnd - Gt.x, N - g + 2 * u, COOL + DIM); // the moat
      for (let k = 0; k < 6; k++) r.rect(Gt.x + hash(k, 91) * (moatEnd - Gt.x), g + hash(k, 92) * 0.1 * N, 3 * u, mx1(u), COOL);
      r.rect(moatEnd, g, N, N - g, DARK + DIM); // the far bank
      r.rect(moatEnd, g, N, mx1(u), MID + DIM);
      for (const k of [-1, 1]) { r.rect(Gt.x + k * 0.06 * N - 0.03 * N, 0.3 * N, 0.06 * N, g - 0.3 * N, DARK); for (let q = 0; q < 3; q++) r.rect(Gt.x + k * 0.06 * N - 0.03 * N + q * 0.024 * N, 0.28 * N, 0.012 * N, 0.02 * N, DARK); }
      r.rect(Gt.x - 0.03 * N, 0.44 * N, 0.06 * N, 0.08 * N, DARK + DIM);
      r.stroke(Gt.x, g, ex, ey, mx1(2.5 * u), MID); // the plank, hinged at the sill, its far end up in the air
      r.line(ex, ey, Gt.x + 0.02 * N, 0.44 * N, DARK); // the chains to the gatehouse
      if (!w.fly && !Gt.launched && bx > ex) { Gt.launched = true; w.fly = { y: ey, vy: -w.spd * Math.tan(Gt.ang) }; w.pitch = -Gt.ang; }
      if (Gt.x + Gt.Lp + Gt.moat < -0.3 * N) w.gate = null;
    }
    // the ground under x: the street, or the plank on his way up it (its line carried on past the end)
    const surf = (x) => { const Gt = w.gate; return !Gt || Gt.launched || x < Gt.x ? g : g - (x - Gt.x) * Math.tan(Gt.ang); };
    let y = g, pitch = 0;
    if (w.fly) {
      const F = w.fly;
      F.y += (F.vy + 0.5 * G * dt) * dt; F.vy += G * dt;
      w.pitch = follow(w.pitch, F.vy < 0 ? -0.35 : -0.05, dt, 0.3); // nose up, then down to the back wheel first
      y = F.y; pitch = w.pitch;
      if (F.y >= g && F.vy > 0) { w.fly = null; w.bump.v += F.vy * 0.5; Bx.vy = -0.3 * N; s.shake = Math.max(s.shake, 0.4); }
    }
    if (!w.fly) { const sp = Math.atan2(surf(bx + wb) - surf(bx), wb); w.pitch = Math.min(sp, follow(w.pitch, sp, dt, 0.06)); y = surf(bx); pitch = w.pitch; }
    // the scooter: a step-through with a headlamp, the rack behind the seat, the knight in his plate on it; the wheels on
    // the ground, the body and all on it riding its springs above them, the fork between
    const c = Math.cos(pitch), sn = Math.sin(pitch), yb = y + w.bump.x, P = (dx, dy) => [bx + dx * c - dy * sn, yb - R + dx * sn + dy * c];
    const fw = [bx + wb * c, y - R + wb * sn], seat = P(1.2 * R, -2.6 * R), deck = P(2.2 * R, -1.1 * R), stem = P(3.9 * R, -3.4 * R), rack = P(-0.2 * R, -2.9 * R);
    wheel(r, bx, y - R, R, w.wh, u, FIG, 1.4);
    wheel(r, fw[0], fw[1], R, w.wh, u, FIG, 1.4);
    r.poly([P(0.2 * R, -1.6 * R), P(0.6 * R, -2.4 * R), P(2 * R, -2.4 * R), P(3.6 * R, -1.6 * R), P(4 * R, -1.2 * R), P(2.6 * R, -0.9 * R)], FIG);
    r.stroke(deck[0], deck[1], stem[0], stem[1], mx1(1.4 * u), FIG);
    r.stroke(stem[0], stem[1], fw[0], fw[1], mx1(1.2 * u), FIG);
    r.rect(stem[0] - 2.5 * u, stem[1] - u, 5 * u, mx1(u), FIG);
    const lamp = P(3.8 * R, -2.6 * R);
    r.rect(lamp[0], lamp[1] - u, 2 * u, 2 * u, BRIGHT);
    r.poly([[lamp[0] + 2 * u, lamp[1] - u], [lamp[0] + 0.25 * N, lamp[1] - 0.05 * N], [lamp[0] + 0.25 * N, lamp[1] + 0.06 * N], [lamp[0] + 2 * u, lamp[1] + u]], LMID + DIM);
    r.stroke(seat[0] - 2 * u, seat[1], seat[0] + 2 * u, seat[1], mx1(1.5 * u), FIG);
    r.stroke(rack[0] - 2 * u, rack[1], rack[0] + 3 * u, rack[1], mx1(u), FIG);
    if (f.beat.on) { const ex = P(-0.3 * R, -0.6 * R); w.puffs.push(puff(ex[0], ex[1], -0.03 * N, -0.025 * N, 1.2)); } // the exhaust, a puff a beat
    w.puffs = smoke(W, w.puffs, -w.spd).slice(-30); // left behind in the still air
    const T = riderTorso(r, seat, 0.08 * N, 0.35, 1, u);
    leg2(r, seat, P(2.6 * R, -1.2 * R), 0.05 * N, 1, mx1(1.8 * u), FIG);
    r.stroke(T.sx, T.sy, stem[0] - u, stem[1] + u, mx1(1.6 * u), FIG);
    // the box on the rack, upright on its strap, leaning back when he speeds up, in the air after a pothole
    const bw = 7 * u, bh = 4 * u, th = Bx.th, hx = rack[0] + 0.5 * u, hy = rack[1] - u + Bx.h, cb = Math.cos(th), sb = Math.sin(th);
    const Q = (dx, dy) => [hx + dx * cb - dy * sb, hy + dx * sb + dy * cb];
    r.poly([Q(-bw / 2, 0), Q(bw / 2, 0), Q(bw / 2, -bh), Q(-bw / 2, -bh)], BRIGHT);
    r.poly([Q(-bw / 2, -bh), Q(bw / 2, -bh), Q(bw / 2, -bh - u), Q(-bw / 2, -bh - u)], HOT);
    const dq = Q(0, -bh * 0.5);
    r.rect(dq[0] - u, dq[1] - u * 0.5, 2 * u, mx1(u), HOT);
    // the dogs: in from behind at a run, close on him, tire and drop back. A stride per 1.6 lengths of ground at their
    // speed, each paw down a quarter of it sweeping back as fast as the ground goes by; hind pair, fore pair, then all
    // four up, the back highest
    w.dogs = w.dogs.filter((d) => {
      d.tire += dt;
      const want = d.tire < 2.5 ? w.spd + 0.12 * N : w.spd - 0.1 * N;
      d.v = follow(d.v, want, dt, 0.4);
      d.x += (d.v - w.spd) * dt;
      if (d.x > bx - 0.1 * N) { d.x = bx - 0.1 * N; d.v = Math.min(d.v, w.spd); } // at his back wheel, no faster than him
      const L = 0.06 * N; d.ph += (Math.max(0, d.v) / (1.6 * L)) * TAU * dt;
      const X = d.x, Y = g - L * 0.3 - (0.5 + 0.5 * Math.cos(d.ph - 5.28)) * L * 0.08;
      r.ring(X, Y, L * 0.15, L * 0.3, FIG, 0.5);
      r.disc(X + L * 0.42, Y - L * 0.12, L * 0.14, FIG);
      r.rect(X + L * 0.5, Y - L * 0.1, L * 0.14, L * 0.08, FIG);
      r.stroke(X - L * 0.4, Y - L * 0.05, X - L * 0.6, Y - L * 0.3, mx1(u), FIG);
      for (const [k, ofs] of [[0.3, 2.2], [0.3, 2.7], [-0.3, 0], [-0.3, 0.5]]) { const [a, lift] = stride(d.ph - ofs, 0.25); r.stroke(X + k * L, Y + L * 0.05, X + k * L + a * L * 0.2, g - lift * L * 0.12, mx1(u), FIG); }
      return d.x > -0.15 * N;
    });
    targets.push({ x: bx - 0.06 * N, y: y - 0.26 * N, w: 0.2 * N, h: 0.26 * N });
  },
};

// ---------------------------------------------------------------------------------------------- scriptorium
// Monks at their desks under the arched windows: quills that scratch on the hats (the lines on the page grow with
// them), the middle one blowing a huge vape cloud on the kicks (it rises, spreads and thins), the right one
// headbanging on the beat to a lute plugged into an amp whose cone pumps with the bass, candles guttering, a cat
// on the left desk swatting at the quill on the snares, illuminated borders round the pages and no letters on
// them. The hour is the kind: morning, noon, night (the windows and the candles). A drop rings the bell: it swings
// as a pendulum from its beam, a wave at every stroke, and the monks panic, arms up, running on the spot.
const SHIFT_W = { morning: [3, 2, 1], noon: [2, 2, 1], night: [1, 2, 3] };
const scriptorium = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { is: 'scriptorium', N: W.N, kind: rollW(rnd, SHIFT_W, bandOf(W.a)), scratch: new Float32Array(3), prog: new Float32Array(3).map(() => rnd()), lines: new Uint8Array(3).map(() => Math.floor(rnd() * 5)), cloud: [], blow: false, paw: 0, bell: { th: 0, om: 0, last: 1 }, waves: [], gait: 0, strum: 0 });
  },
  draw(W) {
    if (W.w.is !== 'scriptorium' || W.w.N !== W.N) scriptorium.init(W);
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), kind = w.kind, g = 0.84 * N, tt = (t * 10) | 0, night = kind === 'night';
    if (f.section === 'change') w.kind = rollW(rnd, SHIFT_W, band);
    if (f.section === 'drop' && Math.abs(w.bell.om) < 0.5) { w.bell.om = 5; s.shake = Math.max(s.shake, 0.2); } // a swing to some 80°, short of where its rope would go slack
    for (const h of hits) {
      if (h.kind === 'hat') { const k = Math.floor(rnd() * 3); w.scratch[k] = 0.2; w.strum = 0.12; }
      else if (isLow(h)) w.blow = true; // the cloud leaves his mouth once he is drawn
      else if (h.kind === 'snare') w.paw = 1;
    }
    w.paw = Math.max(0, w.paw - dt * 4);
    w.strum -= dt;
    for (let k = 0; k < 3; k++) if ((w.scratch[k] -= dt) > 0) { w.prog[k] += dt * 1.5; if (w.prog[k] > 1) { w.prog[k] = 0; w.lines[k] = (w.lines[k] + 1) % 6; } }
    // the bell: a pendulum from the beam, damped; the clapper strikes at each end of the swing
    const B = w.bell, Lb = 0.12 * N;
    B.om += (-((GR * N) / Lb) * Math.sin(B.th) - 0.25 * B.om) * dt;
    B.th += B.om * dt;
    const sgn = Math.sign(B.om) || B.last;
    if (sgn !== B.last && Math.abs(B.th) > 0.1) { w.waves.push({ t: 0 }); s.shake = Math.max(s.shake, 0.15 * Math.min(1, Math.abs(B.th))); }
    B.last = sgn;
    const panic = Math.abs(B.th) > 0.12 || Math.abs(B.om) > 0.8, ph = gait(w, f, dt);
    // the room: the wall, three arched windows by the hour, the beam and the bell, the floor
    r.rect(0, 0, N, g, MID + DIM);
    for (let k = 0; k < 3; k++) {
      const wx = (0.2 + k * 0.3) * N, ww = 0.1 * N, wt = 0.14 * N, wb = 0.5 * N, col = night ? DARK + DIM : kind === 'noon' ? BRIGHT : BG;
      r.rect(wx - ww / 2, wt + ww / 2, ww, wb - wt - ww / 2, col);
      r.disc(wx, wt + ww / 2, ww / 2, col);
      if (night) for (let q = 0; q < 5; q++) r.set(wx - ww / 2 + hash(q, k) * ww, wt + hash(q + 5, k) * (wb - wt), hash(q, tt >> 2) < 0.9 ? LMID : BRIGHT);
      r.rect(wx - u * 0.5, wt, mx1(u), wb - wt, DARK + DIM);
      if (kind === 'noon') r.poly([[wx - ww / 2, wb], [wx + ww / 2, wb], [wx + ww / 2 + 0.08 * N, g], [wx - ww / 2 + 0.08 * N, g]], MID);
    }
    r.rect(0.3 * N, 0.03 * N, 0.4 * N, 0.025 * N, DARK);
    // the bell hangs on along its rope: `V(across, down)` in the rope's frame, the clapper on its axis
    const ca = Math.cos(B.th), sa = Math.sin(B.th), bxp = 0.5 * N + sa * Lb, byp = 0.055 * N + ca * Lb, V = (a, d) => [bxp + ca * a + sa * d, byp - sa * a + ca * d];
    r.line(0.5 * N, 0.055 * N, bxp, byp, DARK);
    r.poly([V(-0.02 * N, 0), V(0.02 * N, 0), V(0.045 * N, 0.06 * N), V(-0.045 * N, 0.06 * N)], LMID);
    const cl = V(0, 0.065 * N), mid = V(0, 0.03 * N);
    r.rect(cl[0] - u, cl[1] - u, 2 * u, 2 * u, DARK);
    w.waves = w.waves.filter((wv) => { wv.t += dt * 2; r.ring(mid[0], mid[1], wv.t * 0.12 * N, mx1(u), wv.t < 0.5 ? BRIGHT : LMID, 0.7); return wv.t < 1; });
    r.rect(0, g, N, N - g, DARK);
    for (let x = 0; x < N; x += 0.08 * N) r.rect(x, g, mx1(u), N - g, DARK + DIM);
    // three desks: a sloped top on legs, a page with an illuminated border and lines growing with the hats, a candle;
    // behind each a monk (seated, or up and running on the spot in the panic); the middle one faces left
    let mox = 0.5 * N, moy = 0.6 * N; // the middle one's mouth, where his cloud comes out
    for (let k = 0; k < 3; k++) {
      const dx = (0.2 + k * 0.3) * N, dw = 0.18 * N, top = g - 0.14 * N, mh = 0.17 * N, bend = k === 2 ? f.beat.pulse * 4 * u : 0;
      if (panic) { const J = monk(r, dx, g, mh, FIG, ph * 2.5, k === 1 ? -1 : 1, u); for (const sg of [-1, 1]) r.stroke(dx + sg * mh * 0.17, J.sy, dx + sg * mh * 0.32, J.sy - mh * 0.35, mx1(1.5 * u), FIG); if (k === 1) { mox = dx - mh * 0.1; moy = J.head + mh * 0.02; } }
      else {
        r.rect(dx - mh * 0.2, top - mh * 0.3, mh * 0.4, mh * 0.3 + 2 * u, FIG);
        r.disc(dx + bend * 0.5, top - mh * 0.42 + bend, mh * 0.13, FIG);
        r.rect(dx + (k === 1 ? -1 : 1) * mh * 0.03 - mh * 0.05, top - mh * 0.44 + bend, mh * 0.08, mh * 0.08, BLACK);
        if (k === 1) { mox = dx - mh * 0.11; moy = top - mh * 0.38; }
      }
      r.poly([[dx - dw / 2, top + 0.02 * N], [dx + dw / 2, top - 0.01 * N], [dx + dw / 2, top + 0.01 * N], [dx - dw / 2, top + 0.04 * N]], MID);
      for (const sg of [-1, 1]) r.rect(dx + sg * dw * 0.4 - u, top + 0.03 * N, 2 * u, g - top - 0.03 * N, DARK);
      const px = dx - dw * 0.3, py = top - 0.005 * N, pw = dw * 0.5, phh = 0.03 * N;
      r.rect(px, py, pw, phh, BRIGHT);
      for (let i = 0; i < 8; i++) { const c = [HOT, COOL, LMID][(i + k) % 3]; r.rect(px + (i * pw) / 8, py, mx1(u), mx1(u), c); r.rect(px + (i * pw) / 8, py + phh - u, mx1(u), mx1(u), c); }
      for (let j = 0; j < 6; j++) { const full = j < w.lines[k] ? 1 : j === w.lines[k] ? w.prog[k] : 0; if (full > 0) r.rect(px + 2 * u, py + 2 * u + (j * (phh - 4 * u)) / 6, (pw - 4 * u) * full * (0.7 + 0.3 * hash(j, k)), mx1(u * 0.7), DARK); }
      if (!panic) { // the quill from the hand to the line it is on, jittering while it scratches
        const qx = px + 2 * u + (pw - 4 * u) * w.prog[k] * (0.7 + 0.3 * hash(w.lines[k], k)), qy = py + 2 * u + (w.lines[k] * (phh - 4 * u)) / 6 + (w.scratch[k] > 0 ? (hash(tt, k) - 0.5) * 1.5 * u : 0);
        r.line(qx, qy, qx + 0.03 * N, qy - 0.05 * N, LMID);
        r.stroke(dx + (k === 1 ? -1 : 1) * mh * 0.15, top - mh * 0.15, qx + 0.01 * N, qy - 0.012 * N, mx1(1.3 * u), FIG);
      }
      const cx = dx + dw * 0.38, cy = top - 0.012 * N;
      if (night) r.disc(cx, cy - 0.03 * N, 0.05 * N, MID);
      r.rect(cx - u, cy - 0.025 * N, 2 * u, 0.025 * N, LMID);
      flame(r, cx, cy - 0.025 * N, 2.5 * u, (3 + 2 * hash(k, tt >> 1) + 3 * f.rel.trebDrive) * u, tt, k * 3);
      targets.push({ x: dx - dw / 2, y: top - mh * 0.6, w: dw, h: mh * 0.6 + 0.04 * N });
    }
    // the vaper's cloud (from the middle desk), the lute and the amp at the right desk, the cat on the left one
    if (w.blow) { w.blow = false; for (let q = 0; q < 14; q++) w.cloud.push(puff(mox, moy, -(0.03 + rnd() * 0.08) * N, -(0.02 + rnd() * 0.04) * N, 2.5 + rnd() * 1.5, 1.6 + rnd())); } // out of his mouth, the way he faces
    w.cloud = smoke(W, w.cloud, 0.005 * N, BRIGHT, LMID).slice(-120);
    const ax = 0.93 * N, ay = g - 0.09 * N;
    r.rect(ax - 0.04 * N, ay, 0.08 * N, 0.09 * N, DARK);
    r.rect(ax - 0.04 * N, ay, 0.08 * N, mx1(u), LMID + DIM);
    cone(r, ax, ay + 0.05 * N, 0.025 * N * (1 + 0.12 * f.rel.bassDrive + 0.08 * f.beat.pulse), u, f.rel.bassDrive);
    const lx = 0.8 * N + 0.035 * N, ly = g - 0.19 * N;
    r.ring(lx, ly, 0.014 * N, 0.028 * N, LMID, 0.8);
    r.disc(lx + 0.004 * N, ly - 0.002 * N, 0.006 * N, DARK);
    r.stroke(lx, ly, lx + 0.06 * N, ly - 0.035 * N, mx1(1.6 * u), DARK);
    for (let q = 0; q < 3; q++) r.line(lx - 0.005 * N + q * u * 0.8, ly - 0.01 * N, lx + 0.045 * N + q * u * 0.4, ly - 0.035 * N, w.strum > 0 ? BRIGHT : LMID);
    let cxq = lx + 0.01 * N, cyq = ly + 0.01 * N;
    for (let q = 1; q <= 6; q++) { const k = q / 6, nx = lerp(lx + 0.01 * N, ax - 0.03 * N, k), ny = lerp(ly + 0.01 * N, ay + 0.02 * N, k) + Math.sin(k * Math.PI) * 0.06 * N; r.line(cxq, cyq, nx, ny, DARK); cxq = nx; cyq = ny; }
    const catX = 0.2 * N + 0.07 * N, catY = g - 0.14 * N - 0.012 * N;
    r.ring(catX, catY - 0.015 * N, 0.01 * N, 0.02 * N, FIG, 0.7);
    r.disc(catX - 0.025 * N, catY - 0.03 * N, 0.014 * N, FIG);
    for (const sg of [-1, 1]) r.poly([[catX - 0.025 * N + sg * 0.006 * N, catY - 0.04 * N], [catX - 0.025 * N + sg * 0.014 * N, catY - 0.04 * N], [catX - 0.025 * N + sg * 0.01 * N, catY - 0.052 * N]], FIG);
    r.stroke(catX + 0.02 * N, catY - 0.02 * N, catX + 0.035 * N, catY - 0.045 * N + Math.sin(t * 2) * 2 * u, mx1(u), FIG);
    for (const sg of [-1, 1]) r.set(catX - 0.025 * N + sg * 0.005 * N, catY - 0.032 * N, w.paw > 0 ? BRIGHT : COOL);
    if (w.paw > 0) { const k = Math.sin(Math.PI * w.paw); r.stroke(catX - 0.02 * N, catY - 0.02 * N, catX - 0.02 * N - k * 0.035 * N, catY - 0.02 * N + k * 0.01 * N, mx1(u), FIG); }
  },
};

// ---------------------------------------------------------------------------------------------- trebuchet
// A trebuchet on the left throwing furniture at a castle wall on the right. The counterweight falls under gravity
// and swings the arm (the arm's own equation: the torque goes with the cosine of its angle), the sling lets go
// before the top, so the load flies a true parabola, tumbling, and hits the wall where it meets it (debris with
// gravity, a block knocked out) or clears it and lands behind; peasants crank it back one notch a beat at the
// windlass; a knight with a dish on his helm tracks every shot. The load is the kind: a cart, a fridge, a bathtub,
// a sofa. A drop brings the wall down, the blocks falling and bouncing; a section change rebuilds it.
const LOAD_W = { cart: [2, 2, 2], fridge: [3, 2, 1], bathtub: [2, 2, 1], sofa: [1, 2, 3] };
const TH0 = 3.5, THR0 = 2.1; // the arm wound (the long arm down behind) and where the sling lets go, in radians, y up
const trebuchet = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { is: 'trebuchet', N: W.N, kind: rollW(rnd, LOAD_W, bandOf(W.a)), th: TH0, om: 0, K: 2, state: 'armed', thr: THR0, shots: [], debris: [], holes: new Uint8Array(18), fall: null, notch: 0, gait: 0, dish: 0, dust: [], flash: 0 });
  },
  draw(W) {
    if (W.w.is !== 'trebuchet' || W.w.N !== W.N) trebuchet.init(W);
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), kind = w.kind, g = 0.8 * N, G = GR * N;
    const ax = 0.24 * N, ay = 0.5 * N, Ll = 0.22 * N, Ls = 0.07 * N, Lsl = 0.14 * N, wx0 = 0.78 * N, bw = 0.04 * N, bh = 0.04 * N, cols = 3, rows = 6, wallTop = g - rows * bh;
    if (f.section === 'change') { w.kind = rollW(rnd, LOAD_W, band); w.holes.fill(0); w.fall = null; }
    if (f.section === 'drop' && !w.fall) { w.fall = []; for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (!w.holes[j * cols + i]) w.fall.push({ x: wx0 + (i + 0.5) * bw + (rnd() - 0.5) * 0.02 * N, y: wallTop + (j + 1) * bh, vx: (rnd() - 0.5) * 0.12 * N, vy: -rnd() * 0.05 * N, life: 30, s: bh * 0.9, c: (i + j) % 2 ? LMID : LMID + DIM }); s.shake = Math.max(s.shake, 0.7); }
    // a shot: the arm let go on a kick when it is wound; the sling's release angle, and so the arc, with the strength
    for (const h of hits) { if (isLow(h) && w.state === 'armed' && h.strength > 0.35) { w.state = 'firing'; w.thr = THR0 + (h.strength - 0.7) * 0.4; w.K = 2.04; } else if (h.kind === 'snare') w.flash = 0.08; } // the dish pings on a snare
    if (w.fall && !w.fall.length) w.fall = null; // the rubble gone: the masons have been
    const P = (th, L) => [ax + Math.cos(th) * L, ay - Math.sin(th) * L]; // along the long arm at angle th (y up), in cells
    if (w.state === 'firing' || w.state === 'settling') { // in steps of a 120th of a second (the swing by velocity Verlet), so the throw is the same at any frame rate
      const n = Math.ceil(dt * 120), h = dt / n;
      for (let i = 0; i < n; i++) {
        const th0 = w.th, om0 = w.om;
        if (w.state === 'firing') { const a0 = w.K * Math.cos(w.th); w.th += w.om * h + 0.5 * a0 * h * h; w.om += 0.5 * (a0 + w.K * Math.cos(w.th)) * h; }
        else { w.om += (w.K * Math.cos(w.th) - 1.2 * w.om) * h; w.th += w.om * h; }
        if (w.state === 'firing' && w.th <= w.thr) { // the release, at the angle itself: the load leaves the sling at the tip's speed, square to the arm, spinning on the way the sling swung
          const q = (th0 - w.thr) / (th0 - w.th), om = lerp(om0, w.om, q), [lx, ly] = P(w.thr, Ll + Lsl), sp = -om * (Ll + Lsl);
          w.shots.push({ x: lx, y: ly, vx: sp * Math.sin(w.thr), vy: sp * Math.cos(w.thr), rot: 0, rotV: -om * 0.5, kind, lead: (1 - q + n - 1 - i) * h }); // (sin, -cos) with y up, so y down flips the second; `lead` the rest of this frame
          w.state = 'settling';
          w.flash = 0.1;
        }
      }
      if (w.state === 'settling' && Math.abs(w.om) < 0.25 && Math.abs(w.th - Math.PI / 2) < 0.15) { w.state = 'winding'; w.notch = 0; w.om = 0; }
    } else if (w.state === 'winding' && f.beat.on) { w.th = Math.min(TH0, w.th + (TH0 - Math.PI / 2) / 8); w.notch++; if (w.th >= TH0 - 1e-3) w.state = 'armed'; }
    w.flash -= dt;
    const ph = gait(w, f, dt);
    // the field: the sky, a far ridge, the ground; the castle: the keep behind, the wall of blocks (or its rubble)
    r.disc(0.6 * N, 0.14 * N, 0.05 * N, BRIGHT);
    hills(r, N, 0.4 * N, 0.1 * N, g, 0, 23, LMID);
    r.rect(0, g, N, N - g, MID);
    r.rect(0, g, N, mx1(u), LMID);
    castle(r, 0.93 * N, g, 0.22 * N, 0.2 * N, MID + DIM, u);
    if (!w.fall) {
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (!w.holes[j * cols + i]) r.rect(wx0 + i * bw + u * 0.3, wallTop + j * bh + u * 0.3, bw - u * 0.6, bh - u * 0.6, (i + j) % 2 ? LMID : LMID + DIM);
      for (let i = 0; i < cols * 2; i += 2) r.rect(wx0 + i * bw * 0.5, wallTop - bh * 0.5, bw * 0.5, bh * 0.5, LMID);
    } else w.fall = tumble(W, w.fall, g, LMID);
    // the trebuchet: the A-frame, the arm about its axle, the counterweight hanging from the short end, the sling
    // and the load (on the ground behind while wound, swept up as the arm goes), the windlass and its crew
    for (const k of [-1, 1]) r.stroke(ax, ay, ax + k * 0.09 * N, g, mx1(2 * u), DARK);
    r.rect(ax - 0.12 * N, g - 1.5 * u, 0.24 * N, mx1(2 * u), DARK);
    const [tx, ty] = P(w.th, Ll), [sx, sy] = P(w.th + Math.PI, Ls);
    r.stroke(sx, sy, tx, ty, mx1(2.5 * u), MID);
    r.disc(ax, ay, 2 * u, DARK);
    r.rect(sx - 0.03 * N, sy + 0.01 * N, 0.06 * N, 0.05 * N, DARK); // the counterweight, hinged so it hangs plumb
    r.line(sx, sy, sx, sy + 0.01 * N, DARK);
    const windX = 0.07 * N, windY = g - 0.045 * N;
    r.ring(windX, windY, 0.02 * N, mx1(1.5 * u), DARK);
    for (const k of [0, 1]) { const a = (w.notch * 0.6 + k * Math.PI); r.line(windX, windY, windX + Math.cos(a) * 0.035 * N, windY + Math.sin(a) * 0.035 * N, MID); }
    if (w.state === 'winding') r.line(windX, windY, tx, ty, LMID + DIM);
    const crew = w.state === 'winding', lean = crew ? f.beat.pulse * 3 * u : 0;
    for (let k = 0; k < 3; k++) { const px = windX + 0.03 * N + k * 0.028 * N; walker(r, px + lean, g, 0.1 * N, FIG, crew ? ph : 0, -1, { cap: k === 1 }); r.stroke(px + lean - 0.01 * N, g - 0.07 * N, windX + 0.02 * N, windY - 0.01 * N, mx1(u), FIG); }
    let lpos;
    const rest = g - loadFoot(kind, N, u); // the load lying in the trough on its own bottom
    if (w.state === 'armed' || w.state === 'winding') lpos = [ax - 0.2 * N, rest];
    else if (w.state === 'firing') { const [ex, ey] = P(w.th, Ll + Lsl), k = clamp((TH0 - w.th) / 0.5); lpos = [lerp(ax - 0.2 * N, ex, k), lerp(rest, ey, k)]; }
    if (lpos) { r.line(tx, ty, lpos[0], lpos[1], LMID + DIM); drawLoad(r, kind, lpos[0], lpos[1], 0, N, u); }
    else r.line(tx, ty, tx + Math.cos(w.th + 2.3) * Lsl * 0.5, ty - Math.sin(w.th + 2.3) * Lsl * 0.5 + Lsl * 0.4, LMID + DIM); // the empty sling hanging
    // the loads in flight: a true parabola each, tumbling; the hit where the path first meets a block still standing (the
    // load `cr` round) or the ground, found along the step, not after it: debris from there, that block knocked out
    const cr = 0.022 * N, solid = (x, y) => !w.fall && x >= wx0 && x < wx0 + cols * bw && y >= wallTop && y < g && !w.holes[Math.floor((y - wallTop) / bh) * cols + Math.floor((x - wx0) / bw)];
    w.shots = w.shots.filter((p) => {
      const st = p.lead >= 0 ? p.lead : dt, x0 = p.x, y0 = p.y, vy0 = p.vy;
      p.lead = -1;
      // where the load is a fraction q into this step, on its parabola, and what it touches there: a block's face (1),
      // a block's top (2), the ground (3); the first touch found in steps of a cell, then pinned down by halving
      let qx = x0, qy = y0, hit = 0, qa = 0, qb = 1;
      const touch = (q) => { const tq = st * q; qx = x0 + p.vx * tq; qy = y0 + (vy0 + 0.5 * G * tq) * tq; return solid(qx + cr, qy) ? 1 : solid(qx, qy + cr) ? 2 : qy + cr >= g ? 3 : 0; };
      for (let k = 1, n = Math.max(1, Math.ceil((Math.hypot(p.vx, vy0) * st) / (0.01 * N))); k <= n; k++) if (touch(k / n)) { qa = (k - 1) / n; qb = k / n; hit = 1; break; }
      if (hit) { for (let b = 0; b < 8; b++) { const qm = (qa + qb) / 2; if (touch(qm)) qb = qm; else qa = qm; } hit = touch(qb); }
      p.x += p.vx * st; p.y += (vy0 + 0.5 * G * st) * st; p.vy += G * st; p.rot += p.rotV * st;
      if (hit) {
        const onWall = hit < 3, cx = hit === 1 ? qx + cr : qx, cy = hit === 1 ? qy : hit === 2 ? qy + cr : g;
        for (let k = 0; k < 16; k++) w.debris.push({ x: cx, y: cy, vx: onWall ? -(0.05 + rnd() * 0.35) * N : (rnd() - 0.5) * 0.5 * N, vy: -(0.05 + rnd() * 0.45) * N, life: 1.5 + rnd(), s: mx1(1.5 * u), c: k % 3 ? (onWall ? LMID : MID + DIM) : loadCol(p.kind) }); // off the wall they fly back
        if (onWall) { const j = clamp(Math.floor((cy - wallTop) / bh), 0, rows - 1), i = clamp(Math.floor((cx - wx0) / bw), 0, cols - 1); w.holes[j * cols + i] = 1; if (hash(j, w.shots.length) < 0.5 && i + 1 < cols) w.holes[j * cols + i + 1] = 1; }
        s.shake = Math.max(s.shake, onWall ? 0.5 : 0.25);
        return false;
      }
      drawLoad(r, p.kind, p.x, p.y, p.rot, N, u);
      return p.x < 1.3 * N;
    });
    w.debris = tumble(W, w.debris, g, LMID);
    // the knight with the dish on his helm: it swings to the nearest load in the air, else back to the wall
    const kx = 0.5 * N, kh = 0.15 * N, J = knight(r, kx, g, kh, FIG, 0, 1, u, {});
    const near = w.shots.length ? w.shots[w.shots.length - 1] : null, aim = near ? Math.atan2(near.y - (J.top - 4 * u), near.x - kx) : -0.3;
    w.dish = followAngle(w.dish, aim, dt, 0.15);
    const dxp = kx, dyp = J.top - 4 * u, ca = Math.cos(w.dish), sa = Math.sin(w.dish);
    r.line(kx, J.top, dxp, dyp, LMID);
    r.ring(dxp - ca * u, dyp - sa * u, 3 * u, mx1(u), LMID);
    r.rect(dxp - ca * 4 * u - u * 0.5, dyp - sa * 4 * u - u * 0.5, mx1(u), mx1(u), DARK);
    r.rect(dxp + ca * 2 * u - u * 0.5, dyp + sa * 2 * u - u * 0.5, mx1(u), mx1(u), w.flash > 0 ? BRIGHT : HOT);
    targets.push({ x: ax - 0.24 * N, y: ay - Ll, w: 0.48 * N, h: g - ay + Ll });
    for (const p of w.shots) targets.push({ x: p.x - 0.04 * N, y: p.y - 0.04 * N, w: 0.08 * N, h: 0.08 * N });
  },
};
const loadCol = (kind) => (kind === 'fridge' ? WHITE : kind === 'bathtub' ? BRIGHT : kind === 'sofa' ? HOT : MID);
// how far the load's lowest point (feet, wheels, base) is below its centre when it stands upright
const loadFoot = (kind, N, u) => 0.045 * N * (kind === 'fridge' ? 0.8 : kind === 'cart' ? 0.48 : 0.4) + (kind === 'bathtub' ? u : kind === 'cart' ? 0.5 * u : 0);
// the load at (x, y) turned by `rot`: a cart with two wheels, a tall white fridge, a tub on four feet, a sofa
function drawLoad(r, kind, x, y, rot, N, u) {
  const c = Math.cos(rot), sn = Math.sin(rot), Q = (dx, dy) => [x + dx * c - dy * sn, y + dx * sn + dy * c], S = 0.045 * N;
  const box = (x0, y0, x1, y1, col) => r.poly([Q(x0, y0), Q(x1, y0), Q(x1, y1), Q(x0, y1)], col);
  switch (kind) {
    case 'fridge': box(-S * 0.35, -S * 0.8, S * 0.35, S * 0.8, WHITE); { const a = Q(-S * 0.35, -S * 0.2), b = Q(S * 0.35, -S * 0.2); r.line(a[0], a[1], b[0], b[1], DARK); } { const h1 = Q(S * 0.2, 0), h2 = Q(S * 0.2, S * 0.5); r.line(h1[0], h1[1], h2[0], h2[1], DARK); } break;
    case 'bathtub': r.poly([Q(-S * 0.8, -S * 0.3), Q(S * 0.8, -S * 0.3), Q(S * 0.6, S * 0.3), Q(-S * 0.6, S * 0.3)], BRIGHT); for (const k of [-0.5, 0.5]) { const p = Q(k * S, S * 0.4); r.rect(p[0] - u, p[1] - u, 2 * u, 2 * u, DARK); } { const p = Q(S * 0.7, -S * 0.45); r.rect(p[0] - u, p[1] - u, 2 * u, 2 * u, LMID); } break;
    case 'sofa': box(-S * 0.8, -S * 0.1, S * 0.8, S * 0.4, HOT); box(-S * 0.8, -S * 0.5, S * 0.8, -S * 0.1, HOT + DIM); box(-S * 0.9, -S * 0.3, -S * 0.65, S * 0.4, HOT); box(S * 0.65, -S * 0.3, S * 0.9, S * 0.4, HOT); break;
    default: box(-S * 0.6, -S * 0.3, S * 0.6, S * 0.25, MID); box(-S * 0.6, -S * 0.35, S * 0.6, -S * 0.3, LMID); for (const k of [-0.4, 0.4]) { const p = Q(k * S, S * 0.3); r.ring(p[0], p[1], S * 0.18, mx1(u), DARK); }
  }
}

// ---------------------------------------------------------------------------------------------- dragonbbq
// A back-garden barbecue with the dragon for a grill: it lies with its jaw under the grate and breathes on the
// kicks, the sausages pop off the bars in little parabolas and land again; knights in aprons turn them with tongs
// on the snares (the one at the tongs' tip flicked highest), the nearest raises a plain can on the beat; a cooler of
// cans, bunting on the fence swinging with the treble, a peasant on a ring in the moat bobbing on the bass (a float
// on its spring). The party is the kind: a few, a crowd, the village (how many knights and sausages). A drop: the
// dragon rears and sneezes a fireball lobbed over the knights into the moat; everyone flinches, the peasant goes
// under, smoke behind it, steam where it lands.
const GUEST_W = { few: [3, 2, 1], crowd: [1, 2, 2], village: [1, 1, 3] };
const dragonbbq = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { is: 'dragonbbq', N: W.N, kind: rollW(rnd, GUEST_W, bandOf(W.a)), saus: Array.from({ length: 8 }, (_, i) => ({ q: (i + 0.5) / 8, h: 0, vy: 0, rot: 0, rotV: 0 })), fire: 0, flip: 0, flo: { x: 0, v: 0 }, sneeze: null, ball: null, trail: 0, puffs: [], flinch: 0, under: 0, splash: [], sunX: 0.15 + rnd() * 0.2 });
  },
  draw(W) {
    if (W.w.is !== 'dragonbbq' || W.w.N !== W.N) dragonbbq.init(W);
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), kind = w.kind, g = 0.8 * N, tt = (t * 12) | 0, nK = kind === 'few' ? 2 : kind === 'crowd' ? 3 : 4, nS = kind === 'few' ? 4 : kind === 'crowd' ? 6 : 8, G = GR * N;
    const gx0 = 0.4 * N, gx1 = 0.6 * N, gy = g - 0.11 * N, mx = 0.82 * N;
    if (f.section === 'change') w.kind = rollW(rnd, GUEST_W, band);
    if (f.section === 'drop' && !w.sneeze && !w.ball) w.sneeze = { t: 0 };
    for (const h of hits) {
      if (isLow(h)) { w.fire = 1; for (const sg of w.saus) if (sg.h >= 0 && sg.vy === 0 && rnd() < 0.7) { sg.vy = -(0.08 + 0.22 * rnd() * h.strength) * N; sg.rotV = (rnd() - 0.5) * 12; } }
      else if (h.kind === 'snare') { w.flip = 1; const sg = w.saus[2]; if (sg.h >= 0 && sg.vy === 0) { sg.vy = -0.4 * N; sg.rotV = 9; } } // the tongs flick up the one at their tip
    }
    w.fire *= Math.exp(-dt * 5);
    w.flip = Math.max(0, w.flip - dt * 2.5);
    w.flinch -= dt; w.under -= dt;
    // the garden: the sky, a fence with bunting, the lawn, the moat with the peasant on his ring
    r.disc(w.sunX * N, 0.16 * N, 0.06 * N, BRIGHT);
    r.rect(0, 0.5 * N, 0.78 * N, 0.14 * N, LMID);
    for (let x = 0; x < 0.78 * N; x += 3 * u) r.rect(x, 0.5 * N, mx1(u), 0.14 * N, LMID + DIM);
    for (const px of [0.05, 0.72]) r.rect(px * N - u, 0.36 * N, 2 * u, 0.28 * N, DARK);
    for (let k = 0; k < 12; k++) {
      const q0 = k / 12, q1 = (k + 1) / 12, x0 = lerp(0.05 * N, 0.72 * N, q0), x1 = lerp(0.05 * N, 0.72 * N, q1), y0 = 0.36 * N + Math.sin(q0 * Math.PI) * 0.06 * N, y1 = 0.36 * N + Math.sin(q1 * Math.PI) * 0.06 * N;
      r.line(x0, y0, x1, y1, DARK);
      const sw = Math.sin(t * 5 + k) * (0.5 + 4 * f.rel.trebDrive) * u;
      r.poly([[x0, y0], [x1, y1], [(x0 + x1) / 2 + sw, (y0 + y1) / 2 + 0.035 * N]], k % 2 ? HOT : COOL);
    }
    r.rect(0, g, N, N - g, MID);
    r.rect(0, g, N, mx1(u), LMID);
    r.rect(0.78 * N, g - 2 * u, N, N - g + 2 * u, COOL + DIM);
    for (let k = 0; k < 8; k++) r.rect(0.78 * N + hash(k, 7) * 0.22 * N, g + hash(k, 8) * 0.15 * N, 3 * u, mx1(u), COOL);
    const Fl = w.flo, eq = -2.5 * u * f.rel.bassDrive * Math.sin(f.rel.bassClock * 2); // the float: a spring about the water, driven by the bass
    spring(Fl, dt, 30, 2, eq);
    const fy = g + Fl.x;
    r.ring(mx, fy, 0.035 * N, 0.016 * N, HOT, 0.45);
    if (w.under <= 0) { r.rect(mx - 0.012 * N, fy - 0.04 * N, 0.024 * N, 0.03 * N, FIG); r.disc(mx, fy - 0.05 * N, 0.014 * N, FIG); for (const sg of [-1, 1]) r.stroke(mx + sg * 0.012 * N, fy - 0.035 * N, mx + sg * 0.03 * N, fy - 0.02 * N - f.beat.pulse * 0.02 * N, mx1(u), FIG); }
    // the dragon lying as the grill, the fire under the grate on the kicks, the grate on its legs, the sausages
    const D = w.sneeze, rear = D ? (D.t < 0.5 ? ease(D.t / 0.5) : D.t < 1.2 ? 1 : 1 - ease((D.t - 1.2) / 0.8)) : 0;
    const Dm = dragon(r, 0.3 * N, g, 0.36 * N, 1, u, { lying: true, head: lerp(0.92, 0.1, rear), jaw: rear > 0.9 ? 1 : 0.3 + 0.7 * w.fire, ph: t * 1.2, wing: 0.1 });
    if (w.fire > 0.05) for (let k = 0; k < 5; k++) flame(r, gx0 + ((k + 0.5) / 5) * (gx1 - gx0), gy + 0.03 * N, 3 * u, (2 + 9 * w.fire) * u, tt, k * 5);
    r.rect(gx0, gy, gx1 - gx0, mx1(1.5 * u), DARK);
    for (let x = gx0; x < gx1; x += 2.5 * u) r.rect(x, gy - u, mx1(u), mx1(u), DARK);
    for (const k of [gx0 + u, gx1 - 2 * u]) r.rect(k, gy, mx1(u), g - gy, DARK);
    for (let i = 0; i < nS; i++) {
      const sg = w.saus[i];
      if (sg.vy !== 0 || sg.h < 0) { sg.h += (sg.vy + 0.5 * G * dt) * dt; sg.vy += G * dt; sg.rot += sg.rotV * dt; if (sg.h >= 0) { sg.h = 0; sg.vy = 0; sg.rotV = 0; } }
      else sg.rot = follow(sg.rot, Math.round(sg.rot / Math.PI) * Math.PI, dt, 0.08); // down at a slant, it rolls flat on the bars
      const sx = lerp(gx0 + 3 * u, gx1 - 3 * u, sg.q), sy = gy - 1.5 * u + sg.h, c = Math.cos(sg.rot) * 2.5 * u, sn = Math.sin(sg.rot) * 2.5 * u;
      r.stroke(sx - c, sy - sn, sx + c, sy + sn, mx1(2 * u), HOT);
    }
    // the knights in aprons behind the grate, one with the tongs; the cooler and the cans
    for (let k = 0; k < nK; k++) {
      const kx = (0.62 + k * 0.045) * N - (k === 0 ? 0.26 * N : 0), kh = 0.15 * N * (w.flinch > 0 ? 0.7 : 1), dir = k === 0 ? 1 : -1, J = knight(r, kx, g - 0.01 * N, kh, FIG, 0, dir, u, { apron: true });
      if (k === 0) { // the tongs: held level to the third sausage on the bars, flicked up with it on a snare and back
        const a = -0.1 - 0.7 * Math.sin(Math.PI * w.flip), hx = J.sx + Math.cos(a) * kh * 0.3, hy = J.sy + Math.sin(a) * kh * 0.3;
        r.stroke(J.sx, J.sy, hx, hy, mx1(1.5 * u), FIG);
        for (const sg of [-1, 1]) r.line(hx, hy, hx + Math.cos(a + sg * 0.15) * kh * 0.25, hy + Math.sin(a + sg * 0.15) * kh * 0.25, LMID);
      } else if (k === 1) { const up = w.flinch > 0 ? 1 : f.beat.pulse; r.stroke(J.sx, J.sy, J.sx - 0.02 * N, J.sy - up * kh * 0.35, mx1(1.5 * u), FIG); can(r, J.sx - 0.02 * N, J.sy - up * kh * 0.35, 4 * u, u); }
      else if (w.flinch > 0) for (const sg of [-1, 1]) r.stroke(kx + sg * kh * 0.15, J.sy, kx + sg * kh * 0.3, J.sy - kh * 0.35, mx1(1.5 * u), FIG);
      targets.push({ x: kx - kh * 0.3, y: g - kh, w: kh * 0.6, h: kh });
    }
    r.rect(0.66 * N, g - 0.05 * N, 0.08 * N, 0.05 * N, COOL);
    r.rect(0.655 * N, g - 0.055 * N, 0.09 * N, mx1(1.5 * u), BRIGHT);
    for (let k = 0; k < 3; k++) can(r, 0.675 * N + k * 0.025 * N, g - 0.055 * N, 4 * u, u);
    // the sneeze: the fireball out of the mouth on an arc into the moat, smoke behind it, steam where it lands
    if (D) {
      D.t += dt;
      if (D.t >= 0.5 && !D.fired) { D.fired = true; w.ball = { x: Dm.mx, y: Dm.my, vx: 0.5 * N, vy: -0.35 * N }; w.flinch = 1.4; w.under = 1.6; s.shake = Math.max(s.shake, 0.5); } // lobbed over the knights' heads, down in the moat
      if (D.t > 2) w.sneeze = null;
    }
    if (w.ball) {
      const B = w.ball, x0 = B.x, y0 = B.y;
      B.x += B.vx * dt; B.y += (B.vy + 0.5 * G * dt) * dt; B.vy += G * dt; // thrown, it falls like everything else
      if (B.y >= g) { const q = (g - y0) / (B.y - y0), hx = lerp(x0, B.x, q); w.ball = null; // where it meets the water, not a frame on
        if (hx > 0.78 * N) { for (let k = 0; k < 10; k++) w.puffs.push(puff(hx, g, (rnd() - 0.5) * 0.1 * N, -(0.05 + rnd() * 0.08) * N, 2.5, 1.5)); burst(w.splash, rnd, hx, g, 20, 0.4 * N, COOL, 0.7); }
      } else if (B.x > 1.1 * N) w.ball = null;
      else {
        r.disc(B.x, B.y, 0.035 * N, HOT); r.disc(B.x - 0.01 * N, B.y, 0.018 * N, BRIGHT);
        for (w.trail += dt * 30; w.trail >= 1; w.trail--) w.puffs.push(puff(B.x - 0.03 * N, B.y, -0.02 * N, -0.03 * N, 2, 1.5)); // thirty puffs a second, whatever the frame
      }
    }
    w.splash = particles(W, w.splash, COOL);
    w.puffs = smoke(W, w.puffs, 0.01 * N).slice(-80);
    targets.push({ x: 0.1 * N, y: g - 0.2 * N, w: 0.5 * N, h: 0.2 * N });
  },
};

// ---------------------------------------------------------------------------------------------- tavernstage
// A tavern with a stage: a bard shredding an electric lute (a strum on every hat, the head whipped back on the
// snares with the hair flying), a knight singing into the mic whose visor opens on the tonal hits, an amp stack
// pumping with the bass, patrons at the tables raising their mugs on the beat (the foam slops when they come
// down), a hearth, candles. The house is the kind: an inn, a hall, a feast (how many tables). A drop is the brawl:
// chairs and mugs fly on parabolas and bounce or shatter, the patrons swing at each other, and the bard plays on.
const HOUSE_W = { inn: [3, 2, 1], hall: [1, 2, 2], feast: [1, 1, 3] };
const tavernstage = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { is: 'tavernstage', N: W.N, kind: rollW(rnd, HOUSE_W, bandOf(W.a)), strum: 0, whip: 0, visor: 0, lift: new Float32Array(8), want: new Uint8Array(8), hold: new Float32Array(8), slops: [], brawl: null, thrown: [], shards: [], down: new Uint8Array(8), throwT: 0 });
  },
  draw(W) {
    if (W.w.is !== 'tavernstage' || W.w.N !== W.N) tavernstage.init(W);
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), kind = w.kind, g = 0.84 * N, tt = (t * 12) | 0, nT = kind === 'inn' ? 2 : kind === 'hall' ? 3 : 4, G = GR * N;
    if (f.section === 'change') w.kind = rollW(rnd, HOUSE_W, band);
    if (f.section === 'drop' && !w.brawl) { w.brawl = { t: 0 }; w.down.fill(0); s.shake = Math.max(s.shake, 0.3); }
    for (const h of hits) {
      if (h.kind === 'hat') w.strum = 0.1;
      else if (h.kind === 'snare') w.whip = 1;
      else if (isLow(h)) burst(w.slops, rnd, 0.09 * N, g - 0.04 * N, 4 + 6 * h.strength, 0.2 * N, HOT, 0.6); // the hearth spits embers
      else if (isTonal(h)) w.visor = 0.35;
    }
    w.strum -= dt; w.visor -= dt;
    w.whip = Math.max(0, w.whip - dt * 3);
    const Bw = w.brawl;
    if (Bw) { Bw.t += dt; if (Bw.t > 6) w.brawl = null; }
    // the room: the back wall with its beams, the hearth, the stage with the amp stack, the floor
    r.rect(0, 0, N, g, MID + DIM);
    for (const y of [0.1, 0.3]) r.rect(0, y * N, N, 0.02 * N, DARK + DIM);
    for (let x = 0.05 * N; x < N; x += 0.3 * N) r.rect(x, 0, 0.02 * N, g, DARK + DIM);
    r.rect(0.02 * N, g - 0.22 * N, 0.14 * N, 0.22 * N, DARK);
    r.rect(0.045 * N, g - 0.16 * N, 0.09 * N, 0.16 * N, BLACK);
    flame(r, 0.09 * N, g - 0.01 * N, 0.05 * N, (0.06 + 0.04 * f.rel.bassDrive) * N, tt, 3);
    r.rect(0, g, N, N - g, DARK);
    for (let x = 0; x < N; x += 0.06 * N) r.rect(x, g, mx1(u), N - g, DARK + DIM);
    const sx0 = 0.6 * N, sy = g - 0.06 * N;
    r.rect(sx0, sy, N - sx0, 0.06 * N, MID);
    r.rect(sx0, sy, N - sx0, mx1(u), LMID);
    for (const [ax, ay] of [[0.66 * N, sy - 0.2 * N], [0.66 * N, sy - 0.1 * N]]) { r.rect(ax - 0.045 * N, ay, 0.09 * N, 0.1 * N, DARK); r.rect(ax - 0.045 * N, ay, 0.09 * N, mx1(u), LMID + DIM); cone(r, ax, ay + 0.05 * N, 0.03 * N * (1 + 0.15 * f.rel.bassDrive + 0.1 * f.beat.pulse), u, f.rel.bassDrive); }
    // the bard: a feathered cap, the lute across him, the strum hand flicking, the head whipped back on a snare
    const bxp = 0.76 * N, bh = 0.17 * N, Jb = walker(r, bxp, sy, bh, FIG, 0.2 * Math.sin(t * 4), -1, {});
    const wh = w.whip, hx = bxp + wh * 0.02 * N, hy = Jb.head - wh * 0.02 * N;
    if (wh > 0) { r.rect(bxp - bh * 0.1, Jb.head - bh * 0.1, bh * 0.2, bh * 0.2, MID + DIM); } // the neck where the head was
    r.disc(hx, hy, bh * 0.105, FIG);
    r.poly([[hx, hy - bh * 0.1], [hx + bh * 0.12, hy - bh * 0.05], [hx + bh * (0.3 + 0.3 * wh), hy - bh * (0.25 + 0.2 * wh)], [hx + bh * 0.05, hy - bh * 0.18]], HOT); // the feather, flying
    for (let k = 0; k < 3; k++) r.line(hx + bh * 0.05 + k * u, hy - bh * 0.05, hx + bh * (0.2 + 0.25 * wh) + k * u, hy + bh * (0.1 - 0.2 * wh), LMID + DIM); // the hair
    const lx = bxp - bh * 0.1, ly = Jb.sy + bh * 0.2;
    r.ring(lx, ly, 0.014 * N, 0.028 * N, LMID, 0.8);
    r.disc(lx - 0.003 * N, ly, 0.006 * N, DARK);
    r.stroke(lx, ly, lx - 0.07 * N, ly - 0.035 * N, mx1(1.6 * u), DARK);
    for (let q = 0; q < 3; q++) r.line(lx + 0.01 * N, ly - 0.01 * N + q * u, lx - 0.065 * N, ly - 0.04 * N + q * u, w.strum > 0 ? BRIGHT : LMID);
    r.stroke(bxp + bh * 0.1, Jb.sy + bh * 0.05, lx + 0.005 * N, ly + (w.strum > 0 ? 0.015 : -0.01) * N, mx1(1.5 * u), FIG);
    let cx0 = lx + 0.02 * N, cy0 = ly + 0.02 * N;
    for (let q = 1; q <= 5; q++) { const k = q / 5, nx = lerp(lx + 0.02 * N, 0.66 * N, k), ny = lerp(ly + 0.02 * N, sy - 0.02 * N, k) + Math.sin(k * Math.PI) * 0.04 * N; r.line(cx0, cy0, nx, ny, DARK); cx0 = nx; cy0 = ny; }
    // the singer: a knight at the mic, the visor up while a note sounds
    const kx = 0.9 * N, kh = 0.17 * N, Jk = knight(r, kx, sy, kh, FIG, 0, -1, u, { open: w.visor > 0, plume: true, fly: 0.2 * f.beat.pulse });
    r.rect(kx - 0.035 * N - u * 0.5, Jk.head, mx1(u), sy - Jk.head, DARK);
    r.rect(kx - 0.05 * N, sy - 1.5 * u, 0.03 * N, mx1(1.5 * u), DARK);
    r.disc(kx - 0.035 * N, Jk.head, 2 * u, w.visor > 0 ? BRIGHT : LMID);
    targets.push({ x: 0.68 * N, y: sy - 0.22 * N, w: 0.3 * N, h: 0.22 * N });
    // the tables and the patrons, two to a table facing in, each with a mug: up on the beat, down after, a slop of
    // foam when it lands; in the brawl the arms swing, some go down, chairs and mugs fly
    for (let i = 0; i < nT; i++) {
      const tx = (0.1 + i * 0.13) * N + 0.08 * N, tw = 0.08 * N, ty = g - 0.07 * N;
      r.rect(tx - tw / 2, ty, tw, 1.5 * u, DARK + DIM);
      r.rect(tx - 1.5 * u, ty, 3 * u, g - ty, DARK + DIM);
      r.rect(tx - u, ty - 0.02 * N, 2 * u, 0.02 * N, LMID);
      flame(r, tx, ty - 0.02 * N, 2 * u, (2.5 + 1.5 * hash(i, tt >> 1)) * u, tt, 20 + i);
      for (const side of [0, 1]) {
        const k = i * 2 + side, dir = side ? -1 : 1, px = tx - dir * tw * 0.65, ph2 = 0.1 * Math.sin(t * 2 + k);
        if (Bw && !w.down[k] && hash(k, 99) < 0.35 && Bw.t > 1 + hash(k, 98) * 3) w.down[k] = 1;
        if (!Bw) w.down[k] = 0;
        if (w.down[k]) { r.rect(px - 0.04 * N, g - 0.025 * N, 0.08 * N, 0.025 * N, FIG); r.disc(px + dir * 0.045 * N, g - 0.015 * N, 0.015 * N, FIG); continue; }
        const J = walker(r, px, g, 0.13 * N, FIG, ph2, dir, { hat: k % 3 === 0, cap: k % 3 === 1 });
        if (f.beat.on && hash(k, f.beat.count) < 0.6 && !Bw) { w.want[k] = 1; w.hold[k] = 0.3; }
        if ((w.hold[k] -= dt) <= 0) w.want[k] = 0;
        const was = w.lift[k];
        w.lift[k] = follow(w.lift[k], w.want[k], dt, 0.07);
        const mxp = J.sx + dir * 0.015 * N, myp = J.sy + 0.03 * N - w.lift[k] * 0.07 * N;
        if (was > 0.08 && w.lift[k] <= 0.08 && was - w.lift[k] > 0.6 * dt) for (let q = 0; q < 4; q++) w.slops.push({ x: mxp, y: myp - 3 * u, vx: (rnd() - 0.5) * 0.15 * N, vy: -(0.05 + rnd() * 0.15) * N, life: 0.6 }); // set down hard, the foam slops over the rim
        if (Bw) { const sw = Math.sin(t * 9 + k) > 0 ? 1 : 0; r.stroke(J.sx, J.sy, J.sx + dir * (0.02 + 0.03 * sw) * N, J.sy - sw * 0.02 * N, mx1(1.5 * u), FIG); }
        else { r.stroke(J.sx, J.sy, mxp, myp + 2 * u, mx1(1.5 * u), FIG); mug(r, mxp, myp, u, dir); }
      }
    }
    if (Bw) { // the brawl: a chair or a mug thrown every so often from one side of the room to the other
      if ((w.throwT -= dt) <= 0) { w.throwT = 0.3; const side = rnd() < 0.5 ? 1 : -1, x = side > 0 ? 0.1 * N : 0.58 * N; w.thrown.push({ x, y: g - 0.12 * N, vx: side * (0.25 + rnd() * 0.25) * N, vy: -(0.3 + rnd() * 0.25) * N, rot: 0, rotV: side * (4 + rnd() * 6), kind: rnd() < 0.4 ? 'chair' : 'mug', life: 6 }); }
    }
    // in flight a true parabola, tumbling; the floor met by the lowest corner of the thing as it is turned: a mug
    // shatters there, a chair bounces, comes to rest and tips over onto its legs or a side
    w.thrown = w.thrown.filter((p) => {
      const mugs = p.kind === 'mug', pts = mugs ? MUG : CHAIR, sc = mugs ? u : 0.03 * N;
      p.life -= dt;
      if (!p.rest) { p.x += p.vx * dt; p.y += (p.vy + 0.5 * G * dt) * dt; p.vy += G * dt; p.rot += p.rotV * dt; }
      else p.rot = follow(p.rot, Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2), dt, 0.12);
      const low = lowest(pts, p.rot, sc);
      if (p.rest) p.y = g - low;
      else if (p.y + low >= g) {
        if (mugs) { for (let q = 0; q < 8; q++) w.shards.push({ x: p.x, y: g, vx: (rnd() - 0.5) * 0.3 * N, vy: -(0.05 + rnd() * 0.25) * N, life: 0.8, s: mx1(u), c: LMID }); return false; }
        p.y = g - low; p.vy = -p.vy * 0.35; p.vx *= 0.6; p.rotV *= 0.5;
        if (Math.abs(p.vy) < 0.05 * N + G * dt) { p.vy = 0; p.vx = 0; p.rotV = 0; p.rest = true; }
      }
      if (p.kind === 'mug') mug(r, p.x, p.y, u, 1, p.rot);
      else { const c = Math.cos(p.rot), sn = Math.sin(p.rot), Q = (dx, dy) => [p.x + dx * c - dy * sn, p.y + dx * sn + dy * c], S = 0.03 * N; const a = Q(-S, 0), b = Q(S, 0), c2 = Q(S, -S * 1.6), d = Q(-S * 0.7, S * 0.8), e = Q(S * 0.7, S * 0.8); r.stroke(a[0], a[1], b[0], b[1], mx1(1.5 * u), MID); r.stroke(b[0], b[1], c2[0], c2[1], mx1(1.5 * u), MID); r.line(a[0], a[1], d[0], d[1], MID); r.line(b[0], b[1], e[0], e[1], MID); }
      return p.life > 0 && p.x > -0.1 * N && p.x < 1.1 * N;
    });
    w.shards = tumble(W, w.shards, g, LMID);
    // the drops (foam, embers) land on a table top when they come down onto one, else on the floor
    const onTable = (x) => { for (let i = 0; i < nT; i++) if (Math.abs(x - (0.18 + i * 0.13) * N) < 0.04 * N) return true; return false; }, top = g - 0.07 * N;
    for (const p of w.slops) p.y0 = p.y;
    w.slops = particles(W, w.slops, BRIGHT).filter((p) => p.y < g && !(p.y0 < top && p.y >= top && onTable(p.x)));
    targets.push({ x: 0.1 * N, y: g - 0.16 * N, w: 0.5 * N, h: 0.16 * N });
  },
};
// the outlines of the thrown things in their own units (a chair in its size, a mug in cells/u, the handle out to 3.4),
// and how far below its centre the lowest corner of one is when it is turned by `rot`
const CHAIR = [[-1, 0], [1, 0], [1, -1.6], [-0.7, 0.8], [0.7, 0.8]], MUG = [[-1.5, -3], [1.5, -3], [1.5, 2], [-1.5, 2], [3.4, 0]];
const lowest = (pts, rot, sc) => { const c = Math.cos(rot), sn = Math.sin(rot); let m = -Infinity; for (const [dx, dy] of pts) m = Math.max(m, (dx * sn + dy * c) * sc); return m; };
// a mug: a tankard with a handle on the `dir` side and foam on top, turned by `rot` when thrown
function mug(r, x, y, u, dir, rot = 0) {
  const c = Math.cos(rot), sn = Math.sin(rot), Q = (dx, dy) => [x + dx * c - dy * sn, y + dx * sn + dy * c];
  r.poly([Q(-1.5 * u, -2 * u), Q(1.5 * u, -2 * u), Q(1.5 * u, 2 * u), Q(-1.5 * u, 2 * u)], LMID);
  r.poly([Q(-1.5 * u, -3 * u), Q(1.5 * u, -3 * u), Q(1.5 * u, -2 * u), Q(-1.5 * u, -2 * u)], BRIGHT);
  const h = Q(dir * 2.2 * u, 0);
  r.ring(h[0], h[1], 1.2 * u, mx1(u * 0.8), LMID);
}

// ---------------------------------------------------------------------------------------------- lowrider
// A horse in sunglasses pulling a lowered coach down the night road past the castles (two layers of silhouettes
// at parallax, the road at the speed of its canter): cool underglow on the road, the spoked rims at v/r, the body
// on two springs that the hydraulics pump on the beat, front and back by turns (the wheels stay on the road, the
// body rides the springs), the subwoofers in the back pumping with the bass, a knight leaning out of the window.
// The crew is the kind: one knight, two, a posse (how many lean out, how many cones). A drop is the hop: both
// pumps at once and the whole coach leaves the road, a parabola, and lands on its springs.
const CREW_W = { solo: [3, 2, 1], duo: [1, 2, 2], posse: [1, 1, 3] };
const lowrider = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { is: 'lowrider', N: W.N, kind: rollW(rnd, CREW_W, bandOf(W.a)), off: 0, wh: 0, fr: { x: 0, v: 0 }, bk: { x: 0, v: 0 }, hop: null, gait: 0, side: 0, wave: 0, moon: 0.7 + rnd() * 0.2 });
  },
  draw(W) {
    if (W.w.is !== 'lowrider' || W.w.N !== W.N) lowrider.init(W);
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), kind = w.kind, g = 0.8 * N, R = 5.5 * u, hsz = 0.15 * N, cx = 0.38 * N;
    if (f.section === 'change') w.kind = rollW(rnd, CREW_W, band);
    if (f.section === 'drop' && !w.hop) { w.hop = { y: 0, vy: -0.55 * N }; w.fr.v -= 0.3 * N; w.bk.v -= 0.3 * N; }
    const spd = canter(hsz, f), ph = gait(w, f, dt), nK = kind === 'solo' ? 1 : kind === 'duo' ? 2 : 3;
    w.off += (spd * dt) / N;
    w.wh += (spd * dt) / R;
    if (f.beat.on) { (w.side ? w.fr : w.bk).v -= (0.5 + 0.4 * f.rel.bassDrive) * N; w.side ^= 1; } // the pump: one end up, then the other
    for (const h of hits) { if (isLow(h) && h.strength > 0.8) w.fr.v -= 0.15 * N; else if (h.kind === 'snare') w.wave = 0.35; } // a heavy kick jolts the front; a snare, the arm out of the window goes up
    w.wave = Math.max(0, w.wave - dt);
    // the springs, stopped dead at the rams' full stroke and on the bump stops above the axles
    for (const sp of [w.fr, w.bk]) { spring(sp, dt, 110, 5); if (sp.x < -0.07 * N) { sp.x = -0.07 * N; sp.v = Math.max(0, sp.v); } else if (sp.x > 0.4 * R) { sp.x = 0.4 * R; sp.v = Math.min(0, sp.v); } }
    let lift = 0;
    if (w.hop) { const Hp = w.hop, G = GR * N; Hp.y += (Hp.vy + 0.5 * G * dt) * dt; Hp.vy += G * dt; lift = Hp.y; if (Hp.y >= 0) { lift = 0; w.fr.v += Hp.vy * 0.5; w.bk.v += Hp.vy * 0.5; w.hop = null; s.shake = Math.max(s.shake, 0.4); } }
    // the night: stars, the moon, the far castles, the near wall with lit windows, the road with torches going by
    for (let k = 0; k < 40; k++) r.set(hash(k, 3) * N, hash(k, 4) * 0.45 * N, hash(k, 5 + ((t * 2) | 0)) < 0.92 ? LMID : BRIGHT);
    r.disc(w.moon * N, 0.14 * N, 0.05 * N, BRIGHT);
    hills(r, N, 0.5 * N, 0.08 * N, g, w.off * 0.15, 19, MID + DIM);
    for (let k = 0; k < 3; k++) { const X = wrapX(hash(k, 33), w.off * 0.15 * N, N, 0.1 * N); castle(r, X, hillY(N, 0.5 * N, 0.08 * N, w.off * 0.15, 19, X) + u, (0.1 + 0.06 * hash(k, 34)) * N, 0.06 * N, MID + DIM, u); }
    for (let k = 0; k < 4; k++) {
      const X = ((((hash(k, 43) - w.off * 0.45) % 1) + 1) % 1) * (1.3 * N) - 0.15 * N, hw = (0.08 + 0.06 * hash(k, 44)) * N, hh = (0.14 + 0.1 * hash(k, 45)) * N;
      r.rect(X - hw / 2, g - hh, hw, hh, DARK);
      for (let i = X - hw / 2 + u; i < X + hw / 2; i += 3 * u) r.rect(i, g - hh - 1.5 * u, 1.5 * u, 1.5 * u, DARK);
      for (let j = 0; j < 2; j++) if (hash(k * 2 + j, 46) < 0.7) r.rect(X - hw * 0.25 + j * hw * 0.35, g - hh * 0.7, 2 * u, 3 * u, hash(k * 2 + j, (t * 2) | 0) < 0.95 ? BRIGHT : HOT);
    }
    r.rect(0, g, N, N - g, DARK + DIM);
    r.rect(0, g, N, mx1(u), MID + DIM);
    for (let k = 0; k < 8; k++) r.rect(wrapX(hash(k, 53), w.off * N, N, 6 * u), g + 0.08 * N, 6 * u, mx1(u), LMID + DIM);
    for (let k = 0; k < 3; k++) { const X = wrapX(hash(k, 55), w.off * N, N, 0.1 * N); r.rect(X - u, g - 0.1 * N, 2 * u, 0.1 * N, DARK); flame(r, X, g - 0.1 * N, 3 * u, 5 * u, (t * 12) | 0, k); } // standing by the road, they go by with it
    // the horse at the canter in its shades (a stride a beat), the traces back to the coach
    const Hh = horse(r, cx + 0.3 * N, g, hsz, FIG, 2 * ph, 1, u, { shades: true });
    // the coach: the underglow on the road, the body on its two springs over the wheels, the rims, the trunk with
    // the cones, the knights leaning out
    const fy = g - 1.5 * R + w.fr.x + lift, by = g - 1.5 * R + w.bk.x + lift, bx0 = cx - 13 * u, bx1 = cx + 13 * u;
    const glow = 0.8 + 0.5 * f.rel.bassDrive + 0.3 * f.beat.pulse;
    r.ring(cx, g + u, 16 * u * glow, 2.5 * u, f.beat.pulse > 0.5 ? COOL : COOL + DIM, 0.18);
    for (const k of [-1, 1]) r.line(Hh.wx - hsz * 0.15, Hh.wy + hsz * 0.15 + k * u, bx1, fy + 3 * u + k * u, DARK);
    r.poly([[bx0, by], [bx1, fy], [bx1, fy - 5 * u], [bx1 - 8 * u, fy - 10 * u], [bx0 + 7 * u, by - 10 * u], [bx0, by - 5 * u]], FIG);
    r.poly([[bx0 + 1, by + 1.5 * u], [bx1, fy + 1.5 * u], [bx1, fy], [bx0 + 1, by]], COOL); // the glow strip under the sill
    r.rect(bx1 - 1.5 * u, fy - 4 * u, 2 * u, 2 * u, BRIGHT);
    r.rect(bx0, by - 4 * u, 2 * u, 2 * u, HOT);
    const win = (q) => [lerp(bx0, bx1, q) + 2 * u, lerp(by, fy, q) - 8 * u];
    for (const q of [0.45, 0.7]) { const p = win(q); r.rect(p[0] - 3 * u, p[1] - u, 6 * u, 4 * u, LMID + DIM); }
    const tr = win(0.12);
    r.rect(tr[0] - 4 * u, tr[1] - 3 * u, 9 * u, 7 * u, DARK); // the trunk open, the cones in it
    for (let k = 0; k < Math.min(nK, 2); k++) cone(r, tr[0] - 1.5 * u + k * 4.5 * u, tr[1] + 0.5 * u, 2.2 * u * (1 + 0.25 * f.rel.bassDrive + 0.15 * f.beat.pulse), u, f.rel.bassDrive);
    for (let k = 0; k < nK; k++) { // a knight out of the window, the elbow on the sill, one on the roof when it is a posse
      const p = win(k === 0 ? 0.7 : k === 1 ? 0.45 : 0.3), onRoof = k === 2;
      const hip = onRoof ? [p[0], p[1] - 4 * u] : [p[0] + 3 * u, p[1] + 3 * u];
      const T = riderTorso(r, hip, 0.07 * N, onRoof ? 0 : 0.5, 1, u);
      if (!onRoof) r.stroke(T.sx, T.sy, T.sx + 0.03 * N, T.sy + (w.wave > 0 && k === 0 ? -0.05 : 0.05) * N, mx1(1.6 * u), FIG);
      else { r.stroke(T.sx, T.sy, T.sx - 0.02 * N, T.sy - 0.04 * N - f.beat.pulse * 2 * u, mx1(1.6 * u), FIG); leg2(r, hip, [p[0] - 5 * u, p[1] - 1.5 * u], 0.04 * N, 1, mx1(1.6 * u), FIG); leg2(r, hip, [p[0] + 5 * u, p[1] - 1.5 * u], 0.04 * N, 1, mx1(1.6 * u), FIG); }
    }
    for (const X of [cx - 9 * u, cx + 9 * u]) { wheel(r, X, g - R + lift, R, w.wh, u, LMID, 1.3); r.ring(X, g - R + lift, R * 0.55, mx1(u), LMID); for (let k = 0; k < 6; k++) { const a = w.wh + (k * TAU) / 6; r.line(X, g - R + lift, X + Math.cos(a) * R * 0.9, g - R + lift + Math.sin(a) * R * 0.9, k % 2 ? LMID : LMID + DIM); } r.disc(X, g - R + lift, 1.2 * u, BRIGHT); }
    for (const [X, sp] of [[cx - 9 * u, w.bk], [cx + 9 * u, w.fr]]) r.rect(X - u, g - 1.5 * R + sp.x + lift, 2 * u, Math.max(1, -sp.x + 0.5 * R), DARK + DIM); // the rams between axle and body
    targets.push({ x: bx0, y: Math.min(fy, by) - 14 * u, w: bx1 - bx0, h: 14 * u + 1.5 * R });
    targets.push({ x: cx + 0.3 * N - hsz * 0.6, y: g - hsz * 0.9, w: hsz * 1.2, h: hsz * 0.9 });
  },
};

// ---------------------------------------------------------------------------------------------- peasantphones
// The market square, every peasant bent over a glowing slab: faces lit from below, thumbs scrolling on the hats,
// the stalls and the fountain behind (its jets rise and fall); a town crier on his box with a horn that blows on
// the snares, a ring of attention spreading across the square (heads lift as it passes and drop back to the
// glass); a knight at the right taking a picture of himself with a dragon that strikes a pose on the beat, the
// slab flashing every fourth. The hour is the kind: morning, dusk, night (how much the slabs are the light).
// A drop: every slab flashes in a wave spreading from the knight's across the square.
const SQUARE_W = { morning: [3, 2, 1], dusk: [2, 2, 2], night: [1, 2, 3] };
const peasantphones = {
  init(W) {
    const { w, rnd } = W;
    const folk = Array.from({ length: 16 }, (_, i) => ({ x: 0.06 + (i % 8) * 0.085 + rnd() * 0.05, y: 0.66 + Math.floor(i / 8) * 0.14 + rnd() * 0.08, hat: i % 3, thumb: rnd(), look: 0, flash: 0 })).sort((a, b) => a.y - b.y);
    Object.assign(w, { is: 'peasantphones', N: W.N, kind: rollW(rnd, SQUARE_W, bandOf(W.a)), folk, rings: [], wave: null, blow: 0, flash: 0, pose: 0, jets: [] });
  },
  draw(W) {
    if (W.w.is !== 'peasantphones' || W.w.N !== W.N) peasantphones.init(W);
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), kind = w.kind, night = kind === 'night', dusk = kind === 'dusk', tt = (t * 12) | 0;
    const crX = 0.1 * N, crY = 0.78 * N, kx = 0.78 * N, ky = 0.9 * N;
    if (f.section === 'change') w.kind = rollW(rnd, SQUARE_W, band);
    if (f.section === 'drop' && !w.wave) { w.wave = { r: 0 }; for (const p of w.folk) p.waved = false; }
    for (const h of hits) {
      if (h.kind === 'snare') { w.blow = 0.3; w.rings.push({ r: 0 }); }
      else if (h.kind === 'hat') for (const p of w.folk) if (hash(p.x * 977 | 0, (t * 50) | 0) < 0.5) p.thumb = (p.thumb + 0.25) % 1;
      else if (isLow(h)) for (let k = 0; k < 8; k++) w.jets.push({ x: 0.5 * N + (rnd() - 0.5) * 3 * u, y: 0.53 * N, vx: (rnd() - 0.5) * 0.1 * N, vy: -(0.25 + 0.2 * rnd()) * N * h.strength, life: 1 }); // the fountain surges
    }
    w.blow -= dt; w.flash -= dt;
    if (f.beat.on) { w.pose ^= 1; if (f.beat.count % 4 === 0) w.flash = 0.12; }
    if (f.beat.on || rnd() < dt * 6) for (let k = 0; k < 3; k++) w.jets.push({ x: 0.5 * N + (rnd() - 0.5) * 2 * u, y: 0.53 * N, vx: (rnd() - 0.5) * 0.06 * N, vy: -(0.15 + 0.1 * rnd() + 0.1 * f.level) * N, life: 1 });
    // the square: the sky by the hour, the houses and the stalls along the far side, the fountain, the paving
    if (night) for (let k = 0; k < 40; k++) r.set(hash(k, 3) * N, hash(k, 4) * 0.4 * N, hash(k, 5 + ((t * 2) | 0)) < 0.92 ? LMID : BRIGHT);
    else r.disc((dusk ? 0.15 : 0.75) * N, (dusk ? 0.44 : 0.12) * N, 0.06 * N, dusk ? HOT : BRIGHT);
    for (let k = 0; k < 7; k++) { const X = (0.02 + k * 0.15) * N, hw = 0.13 * N, hh = (0.2 + 0.1 * hash(k, 12)) * N; r.rect(X, 0.52 * N - hh, hw, hh, night ? DARK + DIM : MID + DIM); r.poly([[X - u, 0.52 * N - hh], [X + hw + u, 0.52 * N - hh], [X + hw / 2, 0.52 * N - hh - 0.06 * N]], DARK); for (let j = 0; j < 2; j++) r.rect(X + 0.03 * N + j * 0.06 * N, 0.52 * N - hh * 0.6, 2.5 * u, 3.5 * u, night && hash(k * 2 + j, 13) < 0.6 ? BRIGHT : DARK + DIM); }
    r.rect(0, 0.52 * N, N, N - 0.52 * N, night ? DARK : MID);
    for (let y = 0.54 * N; y < N; y += 0.05 * N) r.rect(0, y, N, mx1(u * 0.7), night ? DARK + DIM : MID + DIM);
    for (let k = 0; k < 4; k++) { // the stalls: a counter under a striped awning on two poles
      const X = (0.08 + k * 0.26) * N, sw = 0.12 * N, top = 0.46 * N;
      for (const q of [0, 1]) r.rect(X + q * sw - u, top, 2 * u, 0.08 * N, DARK);
      r.rect(X - 0.01 * N, top - 0.01 * N, sw + 0.02 * N, 0.025 * N, k % 2 ? HOT : COOL);
      for (let i = 0; i < 6; i++) r.rect(X - 0.01 * N + (i * (sw + 0.02 * N)) / 6, top - 0.01 * N, (sw + 0.02 * N) / 12, 0.025 * N, BRIGHT);
      r.rect(X, top + 0.05 * N, sw, 0.03 * N, LMID + DIM);
      if (night) { r.rect(X + sw / 2 - u, top + 0.012 * N, 2 * u, 2 * u, BRIGHT); r.disc(X + sw / 2, top + 0.02 * N, 0.03 * N, MID + DIM); }
    }
    r.ring(0.5 * N, 0.58 * N, 0.08 * N, 0.025 * N, LMID, 0.3);
    r.ring(0.5 * N, 0.575 * N, 0.06 * N, 0.01 * N, COOL + DIM, 0.3);
    r.rect(0.5 * N - 1.5 * u, 0.53 * N, 3 * u, 0.05 * N, LMID + DIM);
    w.jets = w.jets.filter((p) => { p.vy += GR * N * dt; p.x += p.vx * dt; p.y += p.vy * dt; r.rect(p.x, p.y, mx1(u), mx1(u), p.vy < 0 ? COOL : BRIGHT); return p.y < 0.575 * N; });
    // the crier on his box with the horn, the rings of attention it sends across the square
    r.rect(crX - 0.03 * N, crY - 0.04 * N, 0.06 * N, 0.04 * N, DARK);
    const Jc = walker(r, crX, crY - 0.04 * N, 0.13 * N, FIG, 0, 1, { hat: true, hatCol: HOT });
    const hx0 = crX + 0.02 * N, hy0 = Jc.head, hx1 = hx0 + 0.06 * N, hy1 = hy0 - 0.03 * N;
    r.poly([[hx0, hy0 - u], [hx1, hy1 - 2.5 * u], [hx1, hy1 + 2.5 * u], [hx0, hy0 + u]], w.blow > 0 ? BRIGHT : LMID);
    r.stroke(Jc.sx, Jc.sy, hx0 + u, hy0, mx1(1.5 * u), FIG);
    w.rings = w.rings.filter((rg) => { rg.r += dt * 0.6 * N; r.ring(hx1, hy1, rg.r, mx1(u), rg.r < 0.1 * N ? BRIGHT : LMID + DIM, 0.45); return rg.r < 1.2 * N; });
    const wvx = kx - 0.05 * N, wvy = ky - 0.1 * N; // the flash wave spreads from the knight's slab
    if (w.wave) { w.wave.r += dt * 0.7 * N; r.ring(wvx, wvy, w.wave.r, mx1(1.5 * u), WHITE, 0.5); if (w.wave.r > 1.4 * N) w.wave = null; }
    // the peasants, far to near: bent over the slab, the glow on the face, the thumb; heads up as a ring passes their
    // feet (each ring tested as it is drawn: the same centre, squashed the same)
    for (const p of w.folk) {
      const X = p.x * N, Y = p.y * N, h = lerp(0.09, 0.14, (p.y - 0.66) / 0.3) * N, dir = p.x < 0.5 ? 1 : -1;
      for (const rg of w.rings) if (Math.abs(Math.hypot(X - hx1, (Y - hy1) / 0.45) - rg.r) < 0.03 * N) p.look = 0.45;
      if (w.wave && !p.waved && Math.hypot(X - wvx, (Y - wvy) / 0.5) < w.wave.r) { p.waved = true; p.flash = 0.35; }
      p.look -= dt; p.flash -= dt;
      const up = p.look > 0, J = walker(r, X, Y, h, FIG, 0, dir, p.hat === 0 ? { hat: true } : p.hat === 1 ? { cap: true } : {});
      if (!up) r.disc(X + dir * h * 0.08, J.head + h * 0.06, h * 0.105, FIG); // the head bent to the glass
      const sxp = X + dir * h * 0.22, syp = up ? J.sy + h * 0.3 : J.sy + h * 0.12, lit = p.flash > 0 ? 2 : 1;
      r.stroke(J.sx, J.sy, sxp, syp + 2 * u, mx1(1.3 * u), FIG);
      slab(r, sxp, syp, h * 0.22, lit);
      if (!up || lit === 2) { r.rect(X + dir * h * 0.06 - u, J.head + h * 0.1, 2.5 * u, mx1(u), lit === 2 ? WHITE : night ? COOL : COOL + DIM); if (night) r.disc(X + dir * h * 0.1, J.head + h * 0.12, h * 0.16, lit === 2 ? BRIGHT : COOL + DIM); }
      if (!up) r.rect(sxp - u * 0.5, syp + h * 0.08 - p.thumb * h * 0.14, mx1(u), mx1(u), DARK);
      if (night && !up) { r.rect(X + dir * h * 0.06 - u, J.head + h * 0.1, 2.5 * u, mx1(u), lit === 2 ? WHITE : COOL); }
    }
    // the knight and the dragon posing: the slab out at arm's length, the flash every fourth beat, the pose by turns
    const Jk = knight(r, kx, ky, 0.15 * N, FIG, 0, -1, u, { plume: true }), armX = kx - 0.07 * N, armY = Jk.sy - 0.02 * N;
    r.stroke(Jk.sx, Jk.sy, armX, armY, mx1(1.5 * u), FIG);
    slab(r, armX, armY - u, 0.035 * N, w.flash > 0 ? 2 : 1);
    if (w.flash > 0) { r.disc(armX, armY, 0.04 * N, BRIGHT); r.rect(armX - 0.012 * N, armY - u, 0.024 * N, 2 * u, WHITE); }
    dragon(r, kx + 0.12 * N, ky, 0.26 * N, -1, u, { ph: t * 1.5, head: w.pose ? 0.05 : 0.3, wing: w.pose ? 0.9 : 0.2, jaw: w.pose ? 0.4 : 0.1, eye: w.flash > 0 ? BRIGHT : HOT, col: FIG + DIM });
    targets.push({ x: kx - 0.1 * N, y: ky - 0.2 * N, w: 0.32 * N, h: 0.2 * N });
    targets.push({ x: crX - 0.05 * N, y: crY - 0.2 * N, w: 0.14 * N, h: 0.2 * N });
  },
};

// ---------------------------------------------------------------------------------------------- courtyardskate
// The castle courtyard as a skate spot: a knight on a board rolling wall to wall (the wheels at v/r, a push on the
// beat when he slows, a kick-turn at each end), kickflips on the snares (the board turns once over in the air it
// has, done before it lands, the plate clanks at the landing), ollies on the kicks that land on whatever is under
// him, and onto the obstacle whenever he reaches it, grinding across with sparks and dropping off the end; a wizard
// filming with a crystal ball on a tripod that follows him, a priest shaking his fist on the beat. The obstacle is
// the kind: a stone ledge, a short stair, a rail. A drop: he heads for the moat, off the kicker on the bank, the
// parabola over the water, down the half-raised drawbridge into the gatehouse, and back out the same way.
const SPOT_W = { ledge: [3, 2, 1], stairs: [2, 2, 2], rail: [1, 2, 3] };
const courtyardskate = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { is: 'courtyardskate', N: W.N, kind: rollW(rnd, SPOT_W, bandOf(W.a)), x: 0.3 * W.N, dir: 1, spd: 0.2 * W.N, wh: 0, air: null, grind: false, push: 0, foot: 0, sparks: [], run: null, fist: 0, aim: 0, y: 0.82 * W.N, vyRide: 0, gone: 0 });
  },
  draw(W) {
    if (W.w.is !== 'courtyardskate' || W.w.N !== W.N) courtyardskate.init(W);
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), kind = w.kind, g = 0.82 * N, tt = (t * 12) | 0, G = GR * N;
    const ox0 = 0.42 * N, ox1 = 0.58 * N, oh = kind === 'rail' ? 0.035 * N : kind === 'stairs' ? 0.05 * N : 0.035 * N, bank = 0.78 * N, kx0 = 0.72 * N, kAng = 0.5, gate = 0.92 * N, pAng = 0.3, Lp = 0.13 * N;
    if (f.section === 'change') { w.kind = rollW(rnd, SPOT_W, band); w.grind = false; }
    if (f.section === 'drop' && !w.run) w.run = { ph: 'out', t: 0 };
    // the surface under x: the paving, the obstacle's top, the kicker on the bank, the plank over the moat, the sill
    const surf = (x) => {
      if (x >= kx0 && x < bank) return g - (x - kx0) * Math.tan(kAng);
      if (x >= bank && x < gate) { const px = gate - Lp * Math.cos(pAng); return x >= px ? g - (gate - x) * Math.tan(pAng) : 2 * N; }
      if (x >= gate) return g;
      if (kind === 'stairs') return x < ox0 ? g - oh : x < ox0 + 0.04 * N ? g - oh * 0.66 : x < ox0 + 0.08 * N ? g - oh * 0.33 : g;
      return x >= ox0 && x <= ox1 ? g - oh : g;
    };
    const Rn = w.run;
    // the speed: coasting, a push on the beat when slow (the foot planted beside the board shoves for a sixth of a
    // second, still on the ground as the board rolls on), and for the moat run as fast as takes him off the kicker and
    // down onto the drawbridge; the kick-turns at the walls
    const want = Rn ? 0.3 * N : 0.22 * N;
    w.spd = Math.max(0.05 * N, w.spd * Math.exp(-dt * (Rn ? 0 : 0.25)));
    w.fist = f.beat.pulse;
    const minX = kind === 'stairs' ? 0.1 * N : 0.08 * N;
    if (!Rn && !w.air) { if (w.dir > 0 && w.x > kx0 - 0.02 * N) w.dir = -1; else if (w.dir < 0 && w.x < minX) w.dir = 1; }
    if (Rn) { // the moat run: out over the water, in at the gate, a moment inside, back out the same way
      Rn.t += dt;
      if (Rn.ph === 'out' && w.x >= gate + 0.02 * N) { Rn.ph = 'gate'; Rn.t = 0; w.air = null; }
      else if (Rn.ph === 'gate' && Rn.t > 1) { Rn.ph = 'back'; w.dir = -1; w.x = gate + 0.02 * N; w.spd = 0.5 * N; }
      else if (Rn.ph === 'back' && w.x < kx0 - 0.03 * N && !w.air) w.run = null;
      if (Rn.ph === 'out' && w.dir < 0 && !w.air) w.dir = 1;
    }
    const inGate = (Rn && Rn.ph === 'gate') || w.gone > 0;
    if (w.gone > 0 && (w.gone -= dt) <= 0) { w.x = kx0 - 0.03 * N; w.y = g; w.dir = -1; w.spd = 0.15 * N; w.air = null; } // out of the moat onto the bank
    if (f.beat.on && w.spd < want && !w.air && !inGate && w.push <= 0) { w.push = 1; w.foot = w.x - w.dir * 2 * u; }
    if (w.push > 0.5 && !w.air) w.spd = Math.min(want, w.spd + 0.54 * N * dt);
    w.push = Math.max(0, w.push - dt * 3);
    const xPrev = w.x;
    if (!inGate) w.x += w.dir * w.spd * dt;
    w.wh += (w.dir * w.spd * dt) / (1.5 * u);
    w.x = clamp(w.x, 0.02 * N, gate + 0.03 * N);
    if (!w.air && surf(w.x) < surf(xPrev) - (1.5 * u + Math.abs(w.x - xPrev))) { w.x = xPrev; w.dir = -w.dir; } // rolled into a step too tall to ride up with no ollie in time: stopped at its foot, back the other way
    const nowS = surf(w.x), prevY = w.y, e = 0.002 * N, ahead = surf(xPrev + w.dir * e), fall = ahead < N ? Math.max(0, (ahead - surf(xPrev)) / e) : 0; // how fast the ground he was on falls away along his way
    if (!w.air && !inGate) { // the ground along this step: where it ends (the ledge, the kicker's lip, the plank's end; not where it merely slopes on down) he leaves it, with the speed he had along it, and flies the rest of the step
      let gy = w.y;
      for (let k = 1; k <= 6; k++) { const ss = surf(lerp(xPrev, w.x, k / 6)); if (ss >= N || ss > gy + u + (fall * Math.abs(w.x - xPrev)) / 6) { w.air = { y: gy, vy: Math.min(0, w.vyRide), roll: 0, rollV: 0, flip: false, lead: (1 - (k - 1) / 6) * dt }; w.grind = false; break; } gy = ss; }
    }
    // an ollie; a flip turns the board once over by the time he comes down on what will be under him then (a tenth of
    // the air to spare), and no further
    const ollie = (vy, flip) => {
      if (w.air || inGate || nowS >= N) return;
      vy = Math.max(-0.5 * N, vy + Math.min(0, w.vyRide));
      let tl = (2 * -vy) / G;
      if (flip) { const sl = surf(w.x + w.dir * w.spd * tl), d = vy * vy + 2 * G * (sl - w.y); if (sl < N && d > 0) tl = (-vy + Math.sqrt(d)) / G; }
      w.air = { y: w.y, vy, roll: 0, rollV: flip ? TAU / (0.9 * tl) : 0, flip }; w.grind = false;
    };
    for (const h of hits) { if (h.kind === 'snare') ollie(-0.45 * N, true); else if (isLow(h) && h.strength > 0.5) ollie(-0.3 * N, false); }
    if (!w.air && nowS < N) { // a step up ahead within the time an ollie takes to rise over it (a slope is not one): up onto it, high enough as he gets there
      const look = Math.max(0.05 * N, w.spd * 0.28);
      let prev = nowS;
      for (let k = 1; k <= 6; k++) { const d = (k * look) / 6, sv = surf(w.x + w.dir * d); if (sv >= N) break; if (sv < prev - 1.5 * u) { const hgt = nowS - sv + 0.012 * N, tt = d / Math.max(w.spd, 0.05 * N); ollie(-Math.max(Math.sqrt(2 * G * hgt), (hgt + 0.5 * G * tt * tt) / tt), false); break; } prev = sv; }
    }
    if (w.air) { // the parabola, the roll, the landing on whatever is under him (or in the moat); flown into the side of a step, knocked back off it
      const A = w.air, ta = A.lead >= 0 ? A.lead : dt; // (off a lip within the step: only the rest of it in the air)
      A.lead = -1;
      A.y += (A.vy + 0.5 * G * ta) * ta; A.vy += G * ta; A.roll = Math.min(A.flip ? TAU : 0, A.roll + A.rollV * ta);
      let sf = surf(w.x);
      if (sf < A.y - u && surf(xPrev) - sf > 1.5 * u + Math.abs(w.x - xPrev)) { w.x = xPrev; w.dir = -w.dir; w.spd *= 0.5; sf = surf(w.x); }
      w.y = A.y;
      if (A.vy > 0 && A.y >= sf) {
        w.y = sf; w.air = null;
        w.grind = kind !== 'stairs' && w.x >= ox0 && w.x <= ox1 && sf < g;
        burst(w.sparks, rnd, w.x, sf, 6, 0.2 * N, BRIGHT, 0.3);
        s.shake = Math.max(s.shake, 0.15);
      } else if (A.y >= g && w.x > bank && w.x < gate) { w.air = null; w.y = g; burst(w.sparks, rnd, w.x, g, 20, 0.35 * N, COOL, 0.6); w.run = null; w.gone = 1.5; } // the moat: a splash, under for a moment, then out at the bank
    } else { w.y = nowS; if (w.grind && (w.x < ox0 || w.x > ox1)) w.grind = false; }
    w.vyRide = w.air ? 0 : (w.y - prevY) / dt;
    if (w.grind && f.beat.pulse > 0.2) burst(w.sparks, rnd, w.x - w.dir * 3 * u, w.y, 2, 0.15 * N, BRIGHT, 0.25);
    // the courtyard: the curtain wall with its battlements, the keep, the gatehouse and the moat with the plank,
    // the paving, the obstacle
    r.rect(0, 0.3 * N, N, g - 0.3 * N, MID + DIM);
    for (let x = 0; x < N; x += 0.05 * N) r.rect(x, 0.28 * N, 0.025 * N, 0.02 * N, MID + DIM);
    for (let y = 0.34 * N; y < g; y += 0.06 * N) for (let x = (y / 0.06 / N) % 2 < 1 ? 0 : 0.04 * N; x < N; x += 0.08 * N) r.rect(x, y, 0.07 * N, mx1(u * 0.6), DARK + DIM);
    r.rect(0.02 * N, 0.08 * N, 0.16 * N, g - 0.08 * N, DARK);
    for (let x = 0.02 * N; x < 0.18 * N; x += 0.03 * N) r.rect(x, 0.06 * N, 0.015 * N, 0.02 * N, DARK);
    for (const [wx, wy] of [[0.06, 0.2], [0.12, 0.2], [0.09, 0.4]]) r.rect(wx * N, wy * N, 0.02 * N, 0.05 * N, f.beat.pulse > 0.5 && hash(wx * 100 | 0, f.beat.count) < 0.5 ? HOT : BLACK);
    r.rect(gate, 0.2 * N, N - gate, g - 0.2 * N, DARK);
    r.rect(gate + 0.01 * N, g - 0.16 * N, N - gate, 0.16 * N, BLACK);
    for (let x = gate; x < N; x += 0.03 * N) r.rect(x, 0.18 * N, 0.015 * N, 0.02 * N, DARK);
    r.rect(0, g, bank, N - g, MID);
    r.rect(0, g, bank, mx1(u), LMID);
    for (let x = 0.03 * N; x < bank; x += 0.06 * N) r.rect(x, g + 0.03 * N, 0.04 * N, mx1(u), MID + DIM);
    r.rect(bank, g - u, gate - bank, N - g + u, COOL + DIM);
    for (let k = 0; k < 5; k++) r.rect(bank + hash(k, 7) * (gate - bank), g + 0.02 * N + hash(k, 8) * 0.12 * N, 3 * u, mx1(u), COOL);
    r.rect(gate, g, N - gate, N - g, MID);
    r.poly([[kx0, g + 1], [bank, g - (bank - kx0) * Math.tan(kAng)], [bank, g + 1]], LMID + DIM); // the kicker on the bank
    const px0 = gate - Lp * Math.cos(pAng), py0 = g - Lp * Math.sin(pAng);
    r.stroke(gate, g, px0, py0, mx1(2.5 * u), MID); // the plank, hinged at the sill, its near end up
    r.line(px0, py0, gate + 0.01 * N, 0.45 * N, DARK);
    if (kind === 'ledge') { r.rect(ox0, g - oh, ox1 - ox0, oh, LMID); r.rect(ox0, g - oh, ox1 - ox0, mx1(u), BRIGHT); for (let x = ox0; x < ox1; x += 0.04 * N) r.rect(x, g - oh * 0.5, mx1(u), oh * 0.5, LMID + DIM); }
    else if (kind === 'stairs') { r.rect(0, g - oh, ox0, oh, LMID); r.rect(0, g - oh, ox0, mx1(u), BRIGHT); for (let k = 0; k < 2; k++) { r.rect(ox0 + k * 0.04 * N, g - oh * (0.66 - k * 0.33), 0.04 * N, oh * (0.66 - k * 0.33), LMID); r.rect(ox0 + k * 0.04 * N, g - oh * (0.66 - k * 0.33), 0.04 * N, mx1(u), BRIGHT); } }
    else { for (const X of [ox0 + u, ox1 - u]) r.rect(X - u, g - oh, 2 * u, oh, DARK); r.rect(ox0 - u, g - oh - u, ox1 - ox0 + 2 * u, mx1(1.5 * u), LMID); }
    // the wizard filming with the crystal ball on its tripod, the priest shaking his fist on the beat
    const wzx = kind === 'stairs' ? 0.22 * N : 0.18 * N, wzBase = surf(wzx);
    wizard(r, wzx, wzBase, 0.15 * N, FIG, 0, 1, u);
    const tbx = wzx + 0.06 * N, tby = wzBase - 0.075 * N;
    for (const k of [-0.02, 0, 0.02]) r.line(tbx, tby, tbx + k * N, wzBase, DARK);
    w.aim = followAngle(w.aim, Math.atan2(w.y - 0.08 * N - tby, w.x - tbx), dt, 0.2);
    r.disc(tbx, tby - 2 * u, 2.5 * u, COOL);
    r.rect(tbx + Math.cos(w.aim) * 1.5 * u - u * 0.5, tby - 2 * u + Math.sin(w.aim) * 1.5 * u - u * 0.5, mx1(u), mx1(u), BRIGHT);
    r.stroke(wzx + 0.02 * N, wzBase - 0.1 * N, tbx - u, tby, mx1(1.3 * u), FIG);
    const prx = 0.66 * N, Jp = walker(r, prx, g, 0.15 * N, FIG, 0, -1, { coat: true });
    r.poly([[prx - 0.016 * N, Jp.top + u], [prx + 0.016 * N, Jp.top + u], [prx, Jp.top - 0.035 * N]], BRIGHT);
    r.stroke(Jp.sx, Jp.sy, prx - 0.03 * N, Jp.sy - 0.05 * N - w.fist * 3 * u, mx1(1.5 * u), FIG);
    r.disc(prx - 0.03 * N, Jp.sy - 0.05 * N - w.fist * 3 * u, 1.8 * u, LMID);
    // the knight on the board: the deck turned by its roll (upside down shows the bright underside and the wheels
    // on top), the crouch, the feet off the board while it flips, the push leg back on the beat
    if (!inGate) {
      const A = w.air, roll = A ? A.roll : 0, cr = Math.cos(roll), X = w.x, Y = w.y - 1.5 * u, half = 4.5 * u, thick = Math.max(1, 2.2 * u * Math.abs(cr));
      const dir = w.dir, upside = cr < 0, wy = upside ? Y - 2 * u : Y + 1.5 * u;
      for (const k of [-3, 3]) r.ring(X + k * u, wy, 1.2 * u, mx1(u * 0.8), DARK);
      r.rect(X - half, Y - thick / 2, 2 * half, thick, upside ? HOT : DARK);
      if (!upside && thick > 1.5) r.rect(X - half, Y - thick / 2, 2 * half, mx1(u * 0.6), LMID + DIM);
      const lift = A && A.flip ? 2.5 * u : 0, hip = [X - dir * 1.5 * u, Y - 0.07 * N - lift], T = riderTorso(r, hip, 0.065 * N, 0.35, dir, u);
      // the push leg: planted where it came down while the board rolls on, then back up onto the deck through the air
      const home = [X - dir * 2.5 * u, Y - thick / 2 - lift], q = (0.5 - w.push) / 0.5, fy = surf(w.foot) < N ? surf(w.foot) : w.y;
      const pf = A || w.push <= 0 ? home : w.push > 0.5 ? [w.foot, fy] : [lerp(w.foot, home[0], q), lerp(fy, home[1], q) - Math.sin(Math.PI * q) * 2 * u];
      leg2(r, hip, [X + dir * 3 * u, Y - thick / 2 - lift], 0.045 * N, dir, mx1(1.7 * u), FIG);
      leg2(r, hip, pf, 0.045 * N, dir, mx1(1.7 * u), FIG + DIM);
      for (const k of [-1, 1]) r.stroke(T.sx, T.sy, T.sx + k * 0.035 * N, T.sy - (A ? 0.03 : 0.01) * N, mx1(1.5 * u), FIG);
      targets.push({ x: X - 0.06 * N, y: Y - 0.14 * N, w: 0.12 * N, h: 0.15 * N });
    }
    w.sparks = particles(W, w.sparks, BRIGHT).filter((p) => p.y < g + 0.02 * N);
  },
};

const WORLDS = { bikeknight, castlerave, gasstation, bikejoust, pizzaknight, scriptorium, trebuchet, dragonbbq, tavernstage, lowrider, peasantphones, courtyardskate };
registerFamily('medieval', WORLD_DEFS, WORLDS);
export const MEDIEVAL_STYLE = makeMixStyle('MEDIEVAL ABSURD', ['medieval']);
