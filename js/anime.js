// Anime, mixed: the tropes of the drawn screen as worlds, original silhouettes only. A railway crossing with the
// train rushing past, a school rooftop in the wind, a magical transformation in a column of light, a shonen
// power-up with the ground cracking, a mecha hangar and its catapult, a summer festival with fireworks, an idol
// stage seen from the penlights, a samurai in a bamboo grove, two ninja on the rooftops under the moon, a classroom
// in the afternoon light, a mech against a creature on the city horizon, a night train window. Every world draws
// with the eight palette roles of the mixer, so any palette, treatment and layout fits; no character, title, logo
// or studio from anywhere, no text.
import { clamp, lerp } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow, ease,
  beatLocked, hash, pickW, walker, particles, burst, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  railcrossing: { name: 'railway crossing', va: [[M, L], [L, L], [H, L]], pals: ['candy', 'vapor', 'sepia', 'midnight', 'ice', 'tape'], fx: ['none', 'film', 'vhs'] },
  rooftop: { name: 'school rooftop', va: [[M, L], [L, L], [H, L]], pals: ['ice', 'candy', 'vapor', 'sepia', 'midnight', 'nineties'], fx: ['none', 'film', 'vhs'] },
  transform: { name: 'transformation', va: [[H, M], [H, L]], pals: ['candy', 'neon', 'vapor', 'gold', 'nineties'], fx: ['none', 'crt'] },
  powerup: { name: 'power-up', va: [[M, H], [L, H], [H, H]], pals: ['cinema', 'neon', 'thermal', 'gold', 'cga', 'noir'], fx: ['manga', 'none', 'crt'] },
  hangar: { name: 'mecha hangar', va: [[M, H], [L, H], [H, H]], pals: ['noir', 'silver', 'neon', 'ice', 'cga', 'midnight'], fx: ['none', 'film', 'crt'] },
  festival: { name: 'summer festival', va: [[H, M], [H, H]], pals: ['midnight', 'candy', 'neon', 'gold', 'vapor'], fx: ['none', 'film'] },
  idol: { name: 'idol stage', va: [[H, M], [H, H]], pals: ['neon', 'candy', 'nineties', 'gold', 'cga'], fx: ['none', 'crt', 'vhs'] },
  bamboo: { name: 'bamboo grove', va: [[L, M], [M, M]], pals: ['sepia', 'ice', 'silver', 'noir', 'midnight', 'cinema'], fx: ['film', 'none', 'manga'] },
  ninja: { name: 'ninja rooftops', va: [[M, H], [L, H], [H, H]], pals: ['midnight', 'noir', 'silver', 'neon', 'cinema'], fx: ['none', 'manga', 'film'] },
  classroom: { name: 'afternoon classroom', va: [[M, L], [L, L], [H, L]], pals: ['sepia', 'ice', 'candy', 'tape', 'vapor'], fx: ['none', 'film', 'vhs'] },
  mechabattle: { name: 'mech against the creature', va: [[M, H], [L, H], [H, H]], pals: ['midnight', 'noir', 'cinema', 'thermal', 'neon', 'silver'], fx: ['film', 'manga', 'none', 'crt'] },
  trainwindow: { name: 'night train window', va: [[M, L], [L, L], [H, L]], pals: ['midnight', 'noir', 'neon', 'vapor', 'ice', 'silver'], fx: ['none', 'vhs', 'film'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the variant tables below weigh their kinds by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bpsOf = (f) => (f.bpm ? f.bpm / 60 : 2);
// the colour a pitch class lights things in (fireworks, penlights, signs)
const PC_COL = [HOT, COOL, BRIGHT, LMID, HOT, COOL, BRIGHT, HOT, COOL, LMID, BRIGHT, HOT];
// the gravity every falling thing shares, in cells per second squared (the same as `particles`)
const G = (N) => N * 1.6;
// the wind of a frame: how far above its average the treble is, gusting with the treble clock; 0..~1.3
const windOf = (f) => (0.2 + 0.8 * f.rel.trebDrive) * (1 + 0.3 * Math.sin(f.rel.trebClock * 2.1));
// a one-per-bar counter when the beat is locked, a free-running one at the tempo otherwise: returns true on a new bar
function barTick(w, f, dt, key = 'barPh') {
  if (beatLocked(f)) return f.beat.on && f.beat.count % 4 === 0;
  w[key] = (w[key] || 0) + dt * bpsOf(f) / 4;
  if (w[key] < 1) return false;
  w[key] -= 1; // keep the remainder: the tempo must not depend on the frame rate
  return true;
}
// a one-per-beat tick the same way
function beatTick(w, f, dt, key = 'beatPh') {
  if (beatLocked(f)) return f.beat.on;
  w[key] = (w[key] || 0) + dt * bpsOf(f);
  if (w[key] < 1) return false;
  w[key] -= 1;
  return true;
}

// long hair off a head at (x, hy) of a figure `h` tall: swept back and up by the wind, hanging when it is still
function hairOf(r, x, hy, head, h, wind, col) {
  const lift = Math.min(1, Math.abs(wind)), side = wind < 0 ? -1 : 1, len = h * (0.22 + 0.22 * lift), sag = h * 0.22 * (1 - lift), lx = x + side * (head * 0.45 + len);
  r.poly([[x - head * 0.5, hy - head * 0.35], [x + head * 0.5, hy - head * 0.35], [lx, hy - head * 0.1 + sag], [lx - side * len * 0.2, hy + head * 0.5 + sag], [x - side * head * 0.35, hy + head * 0.55]], col);
}

// a figure in the wind: the walker rig, then long hair, a skirt, a tie or a scarf that stream downwind. `wind` is
// signed (+ blows to the right) and its size says how far they lift; `ph` moves the legs
function windFigure(r, x, base, h, col, ph, dir, wind, u, o = {}) {
  const J = walker(r, x, base, h, col, ph, dir, o), head = h * 0.21, hy = J.head, lift = Math.min(1, Math.abs(wind)), side = wind < 0 ? -1 : 1;
  if (o.skirt) { // from the hips to the knee, the downwind hem lifted
    const top = J.sy + h * 0.28, bot = base - h * 0.22, hw = J.hw * 1.15, fl = lift * h * 0.2;
    r.poly([[x - hw, top], [x + hw, top], [x + hw * 1.4 + (side > 0 ? fl : 0), bot - (side > 0 ? fl * 0.5 : 0)], [x - hw * 1.4 - (side < 0 ? fl : 0), bot - (side < 0 ? fl * 0.5 : 0)]], col);
  }
  if (o.hair) hairOf(r, x, hy, head, h, wind, col);
  if (o.tie) { // a tie or a ribbon off the collar, lifted by the wind
    const ty = J.sy + h * 0.03, len = h * 0.15;
    r.stroke(x, ty, x + side * len * (0.2 + 0.8 * lift), ty + len * (1.1 - lift), Math.max(1, u), o.tieCol ?? HOT);
  }
  if (o.scarf) { // a long scarf streaming behind the neck
    const ny = hy + head * 0.6, len = h * (0.25 + 0.35 * lift);
    r.stroke(x, ny, x + side * len, ny - len * 0.3 * lift + Math.sin(ph * 3) * h * 0.04, Math.max(1, 1.5 * u), o.scarfCol ?? HOT);
  }
  return J;
}

// a figure sitting on an edge at (x, seat), facing `dir`: the thighs along the edge, the shins hanging over it and
// swinging about the knee by `swing`, a hand on the ledge, hair and a scarf in the wind
function sitter(r, x, seat, h, col, dir, wind, swing, u, o = {}) {
  const hw = h * 0.17, head = h * 0.21, torso = h * 0.42, shY = seat - torso, hy = shY - head * 0.55, kx = x + dir * h * 0.28, x0 = Math.min(x, kx) - hw * 0.5, x1 = Math.max(x, kx) + hw * 0.5;
  r.rect(x0, seat - h * 0.1, x1 - x0, h * 0.1, col);
  for (const k of [0, 1]) { const a = swing * 0.5 * (k ? 0.6 : 1), sx0 = kx - dir * k * hw * 0.9, len = h * 0.3; r.stroke(sx0, seat, sx0 + Math.sin(a) * dir * len, seat + Math.cos(a) * len, Math.max(1, hw * 0.55), col); }
  r.rect(x - hw, shY, 2 * hw, torso - h * 0.08, col);
  r.stroke(x + dir * hw * 0.8, shY + h * 0.05, x + dir * hw * 1.6, seat - h * 0.1, Math.max(1, hw * 0.5), col);
  r.disc(x, hy, head * 0.5, col);
  if (o.hair) hairOf(r, x, hy, head, h, wind, col);
  if (o.scarf) { const lift = Math.min(1, Math.abs(wind)), side = wind < 0 ? -1 : 1, ny = hy + head * 0.6, len = h * (0.25 + 0.35 * lift); r.stroke(x, ny, x + side * len, ny - len * 0.3 * lift, Math.max(1, 1.5 * u), o.scarfCol ?? HOT); }
  return { top: hy - head * 0.5, head: hy, sy: shY };
}

// a lumpy cloud of discs, `w` wide and `h` high
function cloud(r, x, y, w, h, col) {
  r.disc(x, y, h * 0.5, col);
  r.disc(x - w * 0.3, y + h * 0.1, h * 0.38, col);
  r.disc(x + w * 0.32, y + h * 0.12, h * 0.4, col);
  r.rect(x - w * 0.3, y, w * 0.62, h * 0.45, col);
}

// a sky of stacked bands, `cols` from the top down to y1
function skyBands(r, N, y1, cols) {
  const bh = y1 / cols.length;
  for (let i = 0; i < cols.length; i++) r.rect(0, i * bh, N, bh + 1, cols[i]);
}

// a near-vertical run `wd` wide from (x0, y0) to (x1, y1), filled a row at a time: cheaper than a stroke for stalks
function vrun(r, x0, y0, x1, y1, wd, col) {
  const N = r.N, buf = r.buf, ya = Math.max(0, Math.round(Math.min(y0, y1))), yb = Math.min(N, Math.round(Math.max(y0, y1))), hw = wd / 2, k = y1 === y0 ? 0 : (x1 - x0) / (y1 - y0);
  for (let y = ya; y < yb; y++) {
    const xc = x0 + (y + 0.5 - y0) * k, xa = Math.max(0, Math.round(xc - hw)), xb = Math.min(N, Math.max(xa + 1, Math.round(xc + hw)));
    if (xa < N && xb > 0) buf.fill(col, y * N + xa, y * N + xb);
  }
}

// Things that fall: petals, leaves, snow, each `{x, y, vx, vy, s}` in cells. Gravity pulls them, the air holds them
// to a terminal speed `vt`, the wind carries them and they flutter; on the ground `g` they lie for a moment and go.
function fallers(W, list, want, vt, wind, g, flutter, col, shape) {
  const { r, N, dt, u, rnd } = W, grav = G(N);
  while (list.length < want) list.push({ x: rnd() * N * 1.4 - 0.2 * N, y: -rnd() * N * 0.5, vx: 0, vy: rnd() * vt, s: rnd() * TAU, lie: 0 });
  if (list.length > want) list.length = want;
  for (const p of list) {
    if (p.lie > 0) {
      if ((p.lie -= dt) <= 0) { p.x = rnd() * N * 1.4 - 0.2 * N; p.y = -rnd() * 0.2 * N; p.vy = 0; }
      else r.rect(p.x, g - u, Math.max(1, u), Math.max(1, u), col);
      continue;
    }
    p.vy = Math.min(vt, p.vy + grav * dt);
    p.vx = follow(p.vx, wind * N * 0.12 + Math.sin(p.s + p.y * 0.08) * flutter * N * 0.05, dt, 0.4);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y >= g) { p.lie = 0.4 + rnd() * 0.8; p.y = g; continue; }
    if (p.x > N * 1.2 || p.x < -0.2 * N) { p.x = rnd() * N * 1.4 - 0.2 * N; p.y = -rnd() * 0.2 * N; }
    if (shape === 'leaf') r.line(p.x, p.y, p.x + 2 * u * Math.cos(p.s + p.y * 0.1), p.y + 1.5 * u, col);
    else if (shape === 'petal') { r.rect(p.x, p.y, Math.max(1, 1.5 * u), Math.max(1, u), col); }
    else r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), col);
  }
}

// `particles` for light things (petals, embers, ribbon bits, leaf halves): gravity held to a terminal speed `vt`,
// the air slowing them sideways toward the wind (cells per second)
function drifters(W, list, vt, col, wind = 0) {
  const { r, N, dt, u } = W, grav = G(N);
  for (const p of list) {
    p.vy = Math.min(vt, p.vy + grav * dt);
    p.vx = follow(p.vx, wind, dt, 0.5);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), p.c ?? col);
  }
  return list.filter((p) => p.life > 0);
}

// ---------------------------------------------------------------------------------------------- railway crossing
// A railway crossing from the road side: the sky in bands, a tree, the tracks, a signal post whose lamp pair blinks
// in turn on the beat, the barrier down across the road while the train rushes past, a silhouette waiting at the
// pole with hair and skirt in the wind (the treble), petals, leaves or snow coming down on the wind and lying a
// moment on the road. A heavy kick calls the train for a bar, its lit windows strobing and its slipstream tearing
// at the hair; a snare rings the bell; a tonal hit shakes a flurry out of the tree. A section change changes the
// season or the hour, a drop sends a long freight through.
const SEASON_W = { sakura: [3, 2, 2], summer: [1, 2, 3], autumn: [2, 2, 1], snow: [2, 1, 1] };
const HOUR_W = { sunset: [3, 2, 2], noon: [1, 2, 3], dusk: [2, 2, 1], night: [2, 1, 1] };
const SKY_OF = { sunset: [MID, LMID, HOT, LMID, BRIGHT], noon: [COOL, LMID, LMID, BRIGHT, BRIGHT], dusk: [DARK, MID, MID, HOT, LMID], night: [BG, BG, DARK, DARK, DARK + DIM] };

const railcrossing = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { season: rollW(rnd, SEASON_W, band), hour: rollW(rnd, HOUR_W, band), bar: 0, train: null, flakes: [], flurry: [], bell: 0, gust: 0, sunX: 0.3 + rnd() * 0.4,
      treeX: 0.1 + rnd() * 0.08, hills: Array.from({ length: 5 }, (_, i) => [i * 0.25 - 0.1 + rnd() * 0.1, 0.1 + rnd() * 0.1, 0.25 + rnd() * 0.2]), clouds: Array.from({ length: 4 }, () => [rnd(), 0.1 + rnd() * 0.3, 0.1 + rnd() * 0.1]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = bpsOf(f);
    const trackY = 0.74 * N, postY = 0.8 * N, roadY = 0.86 * N, px = 0.3 * N, night = w.hour === 'night', petalCol = w.season === 'sakura' ? HOT : w.season === 'autumn' ? HOT + DIM : BRIGHT;
    const callTrain = (cars, strength) => { // it starts far enough out to arrive once the barrier is down (0.7 s)
      const L = cars * 0.22 * N, v = clamp((N + L) / (4 / bps), 0.6 * N, 2.4 * N) * (0.8 + 0.4 * strength);
      w.train = { x: -0.1 * N - v * 0.7, cars, L, v };
    };
    for (const hh of hits) {
      if (isLow(hh) && hh.strength > 0.6 && !w.train && w.bar < 0.1) callTrain(3 + Math.round(rnd() * 3), hh.strength);
      else if (hh.kind === 'snare') { w.bell = 0.4; w.gust = Math.max(w.gust, 0.6 * hh.strength); }
      else if (isTonal(hh) && w.season !== 'summer') for (let k = 0; k < 6; k++) w.flurry.push({ x: (w.treeX + (rnd() - 0.5) * 0.16) * N, y: (0.33 + rnd() * 0.15) * N, vx: N * (0.05 + rnd() * 0.15), vy: -rnd() * N * 0.05, life: 1.5 + rnd(), c: petalCol }); // out of the canopy
    }
    if (f.section === 'drop') callTrain(9, 1);
    else if (f.section === 'change') { if (rnd() < 0.5) w.season = rollW(rnd, SEASON_W, band); else w.hour = rollW(rnd, HOUR_W, band); w.flakes.length = 0; }
    // the barrier: down while a train is called or passing, lifting after it has gone; it pivots at the post
    const wantDown = !!w.train;
    w.bar = clamp(w.bar + (wantDown ? 1 : -0.6) * dt * 1.5);
    w.gust *= Math.exp(-dt * 3);
    w.bell -= dt;
    const slip = w.train && w.train.x > 0.2 * N && w.train.x - w.train.L < N ? 0.9 : 0, wind = windOf(f) + w.gust + slip;
    skyBands(r, N, trackY, SKY_OF[w.hour]);
    if (night) { for (let k = 0; k < 40; k++) r.set(hash(k, 1) * N, hash(k, 2) * 0.6 * N, k % 3 ? LMID : BRIGHT); r.disc(w.sunX * N, 0.18 * N, 0.06 * N, BRIGHT); }
    else r.disc(w.sunX * N, (w.hour === 'noon' ? 0.12 : w.hour === 'dusk' ? 0.6 : 0.5) * N, (w.hour === 'noon' ? 0.05 : 0.09) * N, w.hour === 'noon' ? BRIGHT : HOT);
    for (const c of w.clouds) cloud(r, ((c[0] + f.rel.midClock * 0.02) % 1.3 - 0.15) * N, c[1] * N, c[2] * 2 * N, c[2] * N, night ? DARK : LMID);
    for (const [hx, hh, hw] of w.hills) r.poly([[hx * N, trackY], [(hx + hw / 2) * N, trackY - hh * N], [(hx + hw) * N, trackY]], night ? DARK + DIM : MID + DIM);
    // the tree: a trunk and a canopy in the season's colour, bare in winter
    const tx = w.treeX * N, canopy = w.season === 'snow' ? DARK : w.season === 'summer' ? COOL + DIM : petalCol;
    r.rect(tx - 2 * u, 0.5 * N, 4 * u, trackY - 0.5 * N, DARK);
    for (const [dx, dy, l] of [[-1, -1, 0.1], [1, -0.8, 0.1], [0.2, -1.3, 0.1]]) r.stroke(tx, 0.52 * N, tx + dx * l * N, 0.52 * N + dy * l * N, 1.5 * u, DARK);
    if (w.season !== 'snow') for (const [dx, dy, rr] of [[0, -0.13, 0.08], [-0.09, -0.08, 0.06], [0.09, -0.07, 0.065], [0.03, -0.17, 0.05]]) r.disc(tx + dx * N, 0.5 * N + dy * N, rr * N * (1 + 0.04 * Math.sin(t * 2 + dx * 30) * wind), canopy);
    if (w.season === 'summer') for (let k = 0; k < 8; k++) if (hash(k, Math.floor(t * 10 + k)) < 0.3 + 0.4 * f.rel.trebDrive) r.rect(tx + (hash(k, 11) - 0.5) * 0.2 * N, (0.36 + hash(k, 12) * 0.16) * N, Math.max(1, u), Math.max(1, u), BRIGHT); // cicada light in the leaves
    // the track bed and the rails, then the road nearer, below
    r.rect(0, trackY - 3 * u, N, roadY - trackY + 3 * u, w.season === 'snow' ? LMID : MID);
    r.rect(0, trackY - 3 * u, N, Math.max(1, u), DARK + DIM);
    r.rect(0, trackY - u, N, Math.max(1, u), LMID);
    for (let x = 0; x < N; x += 5 * u) r.rect(x, trackY, 3 * u, Math.max(1, u), DARK);
    r.rect(0, roadY, N, N - roadY, w.season === 'snow' ? LMID + DIM : DARK);
    r.rect(0, roadY, N, Math.max(1, u), LMID + DIM);
    for (let x = 0; x < N; x += 8 * u) r.rect(x, roadY + 4 * u, 4 * u, Math.max(1, u), LMID + DIM);
    // the train, behind the post: cars with lit windows that strobe, wheels rolling at its speed
    if (w.train) {
      const T = w.train;
      T.x += T.v * dt;
      const ch = 0.13 * N, cl = 0.2 * N, wr = 2.2 * u;
      for (let i = 0; i < T.cars; i++) {
        const cx = T.x - i * 0.22 * N - cl;
        if (cx > N || cx + cl < 0) continue;
        r.rect(cx, trackY - ch - wr, cl, ch, i === 0 ? MID : DARK);
        if (i === 0) r.poly([[cx + cl, trackY - ch - wr], [cx + cl + 4 * u, trackY - ch * 0.4 - wr], [cx + cl + 4 * u, trackY - wr], [cx + cl, trackY - wr]], MID);
        for (let k = 0; k < 4; k++) { const lit = hash(i * 4 + k, Math.floor(t * 12)) < 0.75; r.rect(cx + cl * (0.08 + k * 0.23), trackY - ch * 0.85 - wr, cl * 0.16, ch * 0.4, lit ? (f.beat.pulse > 0.5 ? BRIGHT : LMID) : DARK + DIM); }
        for (const q of [0.18, 0.82]) { const wx = cx + cl * q, ang = T.x / wr; r.disc(wx, trackY - wr, wr, BLACK); r.line(wx, trackY - wr, wx + Math.cos(ang) * wr, trackY - wr + Math.sin(ang) * wr, LMID); }
      }
      if (T.x > 0 && T.x < N + 4 * u) r.rect(T.x + 2 * u, trackY - ch * 0.55 - wr, 2 * u, 2 * u, BRIGHT); // the headlamp
      if (T.x > cl && T.x < N) targets.push({ x: T.x - cl, y: trackY - ch - wr, w: cl, h: ch });
      if (T.x - T.L > N + 0.1 * N) w.train = null;
    }
    // the signal post: a crossbuck, the lamp pair, the bell, the barrier pivoting at the post
    const ph = 0.3 * N;
    r.rect(px - 1.5 * u, postY - ph, 3 * u, ph, DARK);
    r.rect(px - 6 * u, postY - 1.5 * u, 12 * u, 2 * u, DARK);
    for (const k of [-1, 1]) r.stroke(px - k * 7 * u, postY - ph - 2 * u, px + k * 7 * u, postY - ph + 6 * u, 2 * u, LMID);
    r.rect(px - 7 * u, postY - ph + 8 * u, 14 * u, 5 * u, DARK);
    const blinking = w.bar > 0.1 || w.train, left = f.beat.count % 2 === 0;
    for (const k of [-1, 1]) { const on = blinking && (k < 0) === left; r.disc(px + k * 4 * u, postY - ph + 10.5 * u, (1.6 + (on ? 0.8 * f.beat.pulse : 0)) * u, on ? HOT : DARK + DIM); }
    const by = postY - ph + 15 * u;
    r.disc(px + 6 * u, by, 2 * u, w.bell > 0.3 ? BRIGHT : LMID);
    if (w.bell > 0) r.ring(px + 6 * u, by, (3 + (0.4 - w.bell) * 20) * u, Math.max(1, u), LMID);
    const ang = lerp(-Math.PI / 2, 0, ease(w.bar)), bl = 0.45 * N, pvx = px + 2 * u, pvy = postY - ph * 0.45;
    for (let k = 0; k < 7; k++) { const q0 = k / 7, q1 = (k + 1) / 7; r.stroke(pvx + Math.cos(ang) * bl * q0, pvy + Math.sin(ang) * bl * q0, pvx + Math.cos(ang) * bl * q1, pvy + Math.sin(ang) * bl * q1, 2.5 * u, k % 2 ? HOT : BRIGHT); }
    r.disc(pvx, pvy, 2.5 * u, DARK);
    // the one waiting: hair and skirt in the wind, a step back when the train comes
    w.step = follow(w.step || 0, slip ? 1 : 0, dt, 0.25); // a step back from the slipstream
    const fx = (0.56 + 0.02 * w.step) * N, fh = 0.26 * N;
    r.rect(fx - fh * 0.2, roadY, fh * 0.4, Math.max(1, u), BLACK);
    const J = windFigure(r, fx, roadY, fh, FIG, 0.08 * Math.sin(t * 1.3), -1, wind, u, { hair: true, skirt: true, tie: true, tieCol: night ? LMID : HOT });
    r.rect(fx - fh * 0.05, J.sy + fh * 0.12, fh * 0.1, fh * 0.14, DARK); // a satchel at the hip
    targets.push({ x: fx - fh * 0.35, y: roadY - fh * 1.1, w: fh * 0.7, h: fh * 1.1 });
    // what the season brings down, and the flurry off the tree
    const want = Math.round((w.season === 'summer' ? 0 : w.season === 'snow' ? 60 + 60 * f.level : 20 + 40 * f.level) * u);
    fallers(W, w.flakes, want, w.season === 'snow' ? N * 0.08 : w.season === 'autumn' ? N * 0.14 : N * 0.12, wind, roadY + 3 * u, w.season === 'snow' ? 0.3 : 1, w.season === 'snow' ? BRIGHT : petalCol, w.season === 'autumn' ? 'leaf' : w.season === 'snow' ? 'dot' : 'petal');
    w.flurry = drifters(W, w.flurry.filter((p) => p.y < roadY), N * 0.12, petalCol, wind * N * 0.12); // petals, not stones: a terminal speed, carried by the wind
    if (slip) s.shake = Math.max(s.shake, 0.08);
  },
};

// ---------------------------------------------------------------------------------------------- school rooftop
// A school rooftop: the fence along the back edge, a water tank with a flag, two silhouettes (one leaning on the
// fence, one sitting on the ledge), clouds sliding on the mid clock, a plane drawing its contrail. The wind (the
// treble) lifts hair, skirts and ties; a kick is a gust; a snare sends a bird across; the one on the ledge swings
// a foot on the beat. A drop flips the sky to a dramatic dusk with a huge moon for a few bars; a section change
// changes the hour.
const ROOF_HOUR_W = { afternoon: [3, 2, 2], golden: [2, 2, 1], overcast: [1, 2, 2], clear: [2, 2, 3] };
const ROOF_SKY = { afternoon: [COOL, LMID, LMID, BRIGHT], golden: [LMID, HOT, LMID, BRIGHT], overcast: [MID, MID, LMID, LMID], clear: [COOL, COOL, LMID, BRIGHT] };

const rooftop = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { hour: rollW(rnd, ROOF_HOUR_W, band), clouds: Array.from({ length: 5 }, () => [rnd() * 1.4, 0.06 + rnd() * 0.3, 0.08 + rnd() * 0.1]), plane: { x: -0.1, y: 0.1 + rnd() * 0.12, trail: [] }, birds: [], gust: 0, nightT: 0, moonX: 0.6 + rnd() * 0.2, tankX: 0.14 + rnd() * 0.06, swing: 0, trailT: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), g = 0.72 * N, night = w.nightT > 0, wind = windOf(f) + w.gust;
    for (const hh of hits) {
      if (isLow(hh)) w.gust = Math.max(w.gust, 0.5 * hh.strength);
      else if (hh.kind === 'snare') w.birds.push({ x: rnd() < 0.5 ? -0.05 * N : 1.05 * N, y: (0.15 + rnd() * 0.3) * N, dir: 0, ph: rnd() * TAU, v: N * (0.35 + 0.3 * hh.strength) });
    }
    for (const b of w.birds) if (!b.dir) b.dir = b.x < 0 ? 1 : -1;
    if (f.section === 'drop') w.nightT = 16 / bpsOf(f);
    else if (f.section === 'change') w.hour = rollW(rnd, ROOF_HOUR_W, band);
    w.nightT -= dt;
    w.gust *= Math.exp(-dt * 2.5);
    // the sky: the hour's bands, or the drop's dusk with the huge moon and stars
    if (night) {
      skyBands(r, N, g, [BG, DARK, DARK, MID + DIM]);
      for (let k = 0; k < 50; k++) if (hash(k, 3) * 0.7 * N < g) r.set(hash(k, 1) * N, hash(k, 3) * 0.7 * N, hash(k, 2 + Math.floor(t * 3)) < 0.8 ? LMID : BRIGHT);
      r.disc(w.moonX * N, 0.3 * N, 0.2 * N, BRIGHT);
      for (const [dx, dy, rr] of [[-0.06, -0.04, 0.04], [0.05, 0.06, 0.03], [0.08, -0.08, 0.02]]) r.disc((w.moonX + dx) * N, (0.3 + dy) * N, rr * N, BRIGHT + DIM);
    } else {
      skyBands(r, N, g, ROOF_SKY[w.hour]);
      if (w.hour !== 'overcast') r.disc(0.8 * N, (w.hour === 'golden' ? 0.5 : 0.14) * N, 0.06 * N, w.hour === 'golden' ? HOT : BRIGHT);
    }
    for (const c of w.clouds) cloud(r, ((c[0] + f.rel.midClock * 0.03) % 1.4 - 0.2) * N, c[1] * N, c[2] * 2.2 * N, c[2] * N, night ? DARK + DIM : w.hour === 'overcast' ? LMID + DIM : BRIGHT);
    // the plane and its contrail: where it was, fading; it crosses slowly and comes back round
    const P = w.plane;
    P.x += dt * 0.025;
    if (P.x > 1.15) { P.x = -0.15; P.y = 0.08 + rnd() * 0.14; P.trail.length = 0; }
    if ((w.trailT += dt) > 0.12) { w.trailT = 0; P.trail.push({ x: P.x, y: P.y, age: 0 }); if (P.trail.length > 40) P.trail.shift(); }
    for (const q of P.trail) { q.age += dt; if (q.age < 8) r.rect(q.x * N - 1.5 * u, q.y * N - (q.age < 3 ? 0 : 0.5 * u), 3 * u, Math.max(1, (q.age < 3 ? 1 : 1.5) * u), q.age < 3 ? BRIGHT : LMID + DIM); } // it spreads and thins as it ages
    r.rect(P.x * N - 2 * u, P.y * N - u, 4 * u, Math.max(1, u), night ? LMID : FIG);
    r.rect(P.x * N - 0.5 * u, P.y * N - 1.5 * u, Math.max(1, u), 3 * u, night ? LMID : FIG);
    // the birds: along their heading, wings beating
    w.birds = w.birds.filter((b) => {
      b.x += b.dir * b.v * dt;
      b.ph += dt * 14;
      const fl = Math.sin(b.ph) * 2 * u;
      r.line(b.x - 3 * u, b.y - fl, b.x, b.y, FIG);
      r.line(b.x, b.y, b.x + 3 * u, b.y - fl, FIG);
      return b.x > -0.1 * N && b.x < 1.1 * N;
    });
    // the roof: the fence posts and mesh along the back edge, the floor, the ledge in front
    const fy = g - 0.24 * N;
    for (let x = 0.02 * N; x < N; x += 0.12 * N) r.rect(x, fy, Math.max(1, 1.5 * u), g - fy, DARK);
    r.rect(0, fy, N, Math.max(1, u), DARK);
    r.rect(0, fy + 0.1 * N, N, Math.max(1, u), DARK + DIM);
    for (let y = fy + 2 * u; y < g; y += 3 * u) for (let x = ((y / (3 * u)) | 0) % 2 ? 1.5 * u : 0; x < N; x += 3 * u) r.set(x, y, DARK + DIM);
    r.rect(0, g, N, N - g, MID);
    r.rect(0, g, N, Math.max(1, u), LMID);
    for (let x = 0; x < N; x += 0.1 * N) r.rect(x, g + 2 * u, Math.max(1, u), N - g, MID + DIM);
    // the water tank on its legs, a flag on its pole flapping with the wind
    const tx = w.tankX * N, th = 0.16 * N, tw = 0.14 * N, ty = g - 0.3 * N;
    for (const k of [-1, 1]) r.rect(tx + k * tw * 0.35 - u, ty + th, 2 * u, g - ty - th, DARK);
    r.rect(tx - tw / 2, ty, tw, th, DARK);
    r.rect(tx - tw / 2, ty, tw, 2 * u, MID);
    r.rect(tx - tw * 0.45, ty + th * 0.3, tw * 0.9, Math.max(1, u), MID + DIM);
    r.rect(tx + tw * 0.3, ty - 0.1 * N, Math.max(1, u), 0.1 * N, DARK);
    const fl = Math.min(1, wind), fw = 0.07 * N * (0.3 + 0.7 * fl);
    r.poly([[tx + tw * 0.3, ty - 0.1 * N], [tx + tw * 0.3 + fw, ty - 0.1 * N + Math.sin(f.rel.trebClock * 6) * 2 * u * fl + (1 - fl) * 3 * u], [tx + tw * 0.3 + fw * 0.9, ty - 0.06 * N + (1 - fl) * 5 * u], [tx + tw * 0.3, ty - 0.055 * N]], HOT);
    // the two: one at the fence, hands on the rail, hair streaming; one on the ledge, a foot swinging on the beat
    const h = 0.24 * N, ax = 0.62 * N;
    r.rect(ax - h * 0.2, g, h * 0.4, Math.max(1, u), BLACK);
    const JA = windFigure(r, ax, g, h, FIG, 0, -1, wind, u, { hair: true, skirt: true, tie: true, tieCol: night ? LMID : HOT });
    r.stroke(JA.sx, JA.sy, ax - h * 0.22, fy + 0.1 * N, Math.max(1, 1.2 * u), FIG);
    targets.push({ x: ax - h * 0.3, y: g - h * 1.1, w: h * 0.6, h: h * 1.1 });
    const bx = 0.84 * N, ly = N - 0.08 * N;
    r.rect(0.74 * N, ly, 0.26 * N, N - ly, DARK);
    r.rect(0.74 * N, ly, 0.26 * N, Math.max(1, u), LMID);
    w.swing = follow(w.swing, f.beat.pulse, dt, 0.08);
    const sh = h * 0.9, JB = sitter(r, bx, ly, sh, FIG, -1, wind, w.swing, u, { hair: true, scarf: true, scarfCol: COOL });
    targets.push({ x: bx - sh * 0.45, y: JB.top, w: sh * 0.7, h: ly + sh * 0.3 - JB.top });
  },
};

// ---------------------------------------------------------------------------------------------- transformation
// A magical transformation: a silhouette lifted into a column of light, turning, with ribbons (or feathers, stars,
// petals) spiralling round it on the bass clock, sparkles off the hats and a flash on every beat. The sequence goes
// by bars: rising, spinning, the flash where the outfit changes, the drop to the floor and the pose; then it begins
// again. A drop restarts it bigger, a section change changes what spirals.
const RIBBON_W = { ribbons: [3, 2, 2], feathers: [2, 2, 1], stars: [1, 2, 3], petals: [2, 2, 2] };

const transform = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, RIBBON_W, band), phase: 0, y: 0, vy: 0, turn: 0, big: 0, flash: 0, sparks: [], rings: [], scatter: [], barPh: 0, land: 0, orbs: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), cx = 0.5 * N, g = 0.86 * N, H = 0.36 * N * (1 + 0.2 * w.big), bps = bpsOf(f);
    const restart = () => { w.phase = 0; w.scatter.length = 0; w.land = 0; };
    for (const hh of hits) {
      if (hh.kind === 'hat' || hh.kind === 'perc') for (let k = 0; k < 4; k++) { const a = rnd() * TAU, d = H * (0.2 + rnd() * 0.5); w.sparks.push({ x: cx + Math.cos(a) * d, y: g - w.y - H * 0.5 + Math.sin(a) * d * 0.9, vx: (rnd() - 0.5) * N * 0.1, vy: -(0.02 + rnd() * 0.08) * N, life: 0.8 + rnd() * 0.8 }); }
      else if (isLow(hh) && hh.strength > 0.7) w.flash = Math.max(w.flash, 0.5 * hh.strength);
      else if (isTonal(hh) && w.orbs.length < 6) w.orbs.push({ a: rnd() * TAU, life: 1.6, c: PC_COL[hh.pc] });
    }
    if (f.section === 'drop') { restart(); w.big = 1; }
    else if (f.section === 'change') { w.kind = rollW(rnd, RIBBON_W, band); if (rnd() < 0.5) restart(); }
    if (barTick(w, f, dt)) { w.phase = (w.phase + 1) % 5; if (w.phase === 2) { w.flash = 1; for (let k = 0; k < 40; k++) { const a = rnd() * TAU; w.scatter.push({ x: cx + Math.cos(a) * H * 0.3, y: g - w.y - H * 0.5 + Math.sin(a) * H * 0.4, vx: Math.cos(a) * N * (0.3 + rnd() * 0.4), vy: Math.sin(a) * N * 0.3 - N * 0.2, life: 1 + rnd() }); } } if (w.phase === 0) w.land = 0; }
    if (f.beat.on) w.rings.push({ R: 0, life: 0.35 }); // the flash on the beat: a ring out over the floor
    w.big = Math.max(0, w.big - dt / (24 / bps));
    w.flash *= Math.exp(-dt * 7);
    // where she is: lifted by the column while rising and spinning, dropped by gravity for the pose
    if (w.phase < 3) { w.y = follow(w.y, H * (0.35 + 0.15 * w.big), dt, 0.8); w.vy = 0; }
    else if (w.y > 0) { w.vy += G(N) * dt; w.y -= w.vy * dt; if (w.y <= 0) { w.y = 0; w.vy = 0; w.land = 1; w.rings.push({ R: 0, life: 0.6 }); burst(w.sparks, rnd, cx, g, 20, N * 0.4, BRIGHT, 0.5); s.shake = Math.max(s.shake, 0.3); } }
    w.turn += dt * (w.phase === 1 ? 5 + 6 * f.rel.bassDrive : w.phase < 3 ? 1.2 : 0.3) * (w.phase === 4 ? 0 : 1);
    const cy = g - w.y - H * 0.5, lvl = clamp(0.4 + 0.6 * f.level + 0.3 * f.beat.pulse + w.flash);
    // the column of light down onto the floor, brighter with the level, flaring on the beat
    const cw = 0.14 * N * (1 + 0.6 * lvl) * (1 + 0.3 * w.big);
    r.rect(cx - cw * 1.5, 0, cw * 3, g, MID + DIM);
    r.rect(cx - cw, 0, cw * 2, g, w.flash > 0.5 ? BRIGHT : lvl > 0.75 ? LMID : MID);
    r.rect(cx - cw * 0.4, 0, cw * 0.8, g, w.flash > 0.3 ? WHITE : lvl > 0.6 ? BRIGHT : LMID);
    for (let x = Math.floor(cx - cw * 1.5); x < cx + cw * 1.5; x++) if (hash(x, Math.floor(t * 8)) < 0.08) r.rect(x, (((hash(x, 5) - t * 0.04) % 1) + 1) % 1 * g, 1, 3 * u, BRIGHT); // motes drifting up the beam's updraft
    r.rect(0, g, N, N - g, DARK);
    r.ring(cx, g, cw * 1.5, Math.max(1, u), LMID, 0.22);
    r.disc(cx, g, cw, w.flash > 0.5 ? BRIGHT : LMID);
    r.ring(cx, g, cw, 1, MID, 0.22);
    w.rings = w.rings.filter((q) => { q.R += dt * N * 0.9; q.life -= dt; r.ring(cx, g, q.R, Math.max(1, 1.5 * u), BRIGHT, 0.22); return q.life > 0; });
    // the helices: one per ribbon, advancing with the bass clock; the half behind her first
    const nRib = 3 + band + (w.big > 0.3 ? 2 : 0), tight = w.phase === 1 ? 0.6 : 1, R = H * (0.42 * tight + 0.1 * Math.sin(t * 1.3)) * (w.phase === 4 ? 0.2 : 1), pitch = 0.22 / u, spin = f.rel.bassClock * 2.5;
    const spiral = (front) => {
      for (let k = 0; k < nRib; k++) {
        const a0 = (k / nRib) * TAU, col = k % 2 ? HOT : COOL, cc = front ? col : col + DIM;
        let lx = 0, ly = 0, lon = false, j = 0;
        for (let y = cy - H * 0.75; y <= cy + H * 0.75; y += 2 * u, j++) {
          const ang = a0 + (y - cy) * pitch - spin, d = Math.sin(ang);
          if ((d < 0) !== !front) { lon = false; continue; }
          const x = cx + Math.cos(ang) * R, sc = 0.6 + 0.4 * Math.abs(d);
          if (w.kind === 'ribbons') { if (lon) r.stroke(lx, ly, x, y, Math.max(1, 2.2 * u * sc), cc); }
          else if (j % 4 === 0) {
            if (w.kind === 'feathers') { r.stroke(x, y, x - Math.cos(ang) * 4 * u, y + 3 * u * sc, Math.max(1, 2 * u * sc), cc); r.line(x, y, x - Math.cos(ang) * 4 * u, y + 3 * u * sc, BRIGHT); }
            else if (w.kind === 'stars') { const q = 2 * u * sc; r.rect(x - q, y - 0.5 * u, 2 * q, Math.max(1, u), cc); r.rect(x - 0.5 * u, y - q, Math.max(1, u), 2 * q, cc); r.set(x, y, BRIGHT); }
            else { r.disc(x, y, 1.5 * u * sc, cc); r.disc(x + 1.5 * u, y + u, 1.2 * u * sc, cc); }
          }
          lx = x; ly = y; lon = true;
        }
      }
    };
    spiral(false);
    // her: a silhouette whose width turns with her, hair floating in the updraft, the outfit after the flash
    const ca = Math.cos(w.turn), hw = H * 0.16 * (0.35 + 0.65 * Math.abs(ca)), head = H * 0.11, col = w.flash > 0.4 ? BRIGHT : FIG, side = ca >= 0 ? -1 : 1, air = w.y > 2 * u;
    const hipY = cy + H * 0.1, shY = cy - H * 0.22, hy = shY - head * 1.1;
    if (air) r.rect(cx - hw * 0.5, hipY, hw, H * 0.4, col); // feet together, pointed
    else for (const k of [-1, 1]) r.rect(cx + k * hw * 0.5 - hw * 0.3, hipY, hw * 0.6, H * 0.4, col);
    if (w.phase >= 2 || w.land) r.poly([[cx - hw, hipY - H * 0.05], [cx + hw, hipY - H * 0.05], [cx + hw * 2.6 * (1 + w.flash), hipY + H * 0.22], [cx - hw * 2.6 * (1 + w.flash), hipY + H * 0.22]], col); // the skirt
    r.poly([[cx - hw * 0.8, shY], [cx + hw * 0.8, shY], [cx + hw * 0.6, hipY], [cx - hw * 0.6, hipY]], col);
    r.disc(cx, hy, head, col);
    const lift = air ? 0.75 : 0.25, hl = head * (2 + 1.5 * lift);
    r.poly([[cx - head, hy - head * 0.3], [cx + head, hy - head * 0.3], [cx + side * (head + hl * 0.6), hy - hl * 0.8 * lift + head], [cx + side * (head * 0.5 + hl * 0.9), hy + head * (2 - 1.5 * lift)], [cx - side * head * 0.6, hy + head * 1.2]], col);
    if (w.phase === 1) { r.stroke(cx - hw * 0.8, shY + H * 0.03, cx + hw * 0.6, shY + H * 0.18, Math.max(1, H * 0.05), col); r.stroke(cx + hw * 0.8, shY + H * 0.03, cx - hw * 0.6, shY + H * 0.18, Math.max(1, H * 0.05), col); } // arms crossed
    else if (w.phase === 2 || w.phase === 0) for (const k of [-1, 1]) r.stroke(cx + k * hw * 0.8, shY + H * 0.02, cx + k * (hw + H * 0.28), shY - H * (w.phase === 2 ? 0.22 : 0.02), Math.max(1, H * 0.05), col); // arms spread
    else { // the pose: one arm up with the star, the other on the hip
      r.stroke(cx - hw * 0.8, shY + H * 0.02, cx - hw * 0.4, hy - H * 0.3, Math.max(1, H * 0.05), col);
      r.stroke(cx + hw * 0.8, shY + H * 0.02, cx + hw * 1.6, hipY - H * 0.02, Math.max(1, H * 0.05), col);
      const sx = cx - hw * 0.4, sy = hy - H * 0.36, sr = (3 + 1.5 * f.beat.pulse) * u, sa = t * 2;
      for (const d of [0, Math.PI / 2]) r.stroke(sx + Math.cos(sa + d) * sr, sy + Math.sin(sa + d) * sr, sx - Math.cos(sa + d) * sr, sy - Math.sin(sa + d) * sr, Math.max(1, u), BRIGHT);
      r.disc(sx, sy, 1.5 * u, WHITE);
    }
    spiral(true);
    // the orbs a note adds, circling her for a moment
    w.orbs = w.orbs.filter((o) => { o.a += dt * 3; o.life -= dt; r.disc(cx + Math.cos(o.a) * H * 0.55, cy + Math.sin(o.a) * H * 0.2, (1 + 0.8 * Math.min(1, o.life)) * u, o.c); return o.life > 0; });
    // sparkles drift up and slow in the warm column, the scattered ribbon bits fall
    w.sparks = w.sparks.filter((p) => { p.vx *= Math.exp(-dt * 2); p.vy = follow(p.vy, -N * 0.03, dt, 0.6); p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), p.life > 0.4 ? BRIGHT : LMID); return p.life > 0 && p.y > 0; });
    w.scatter = drifters(W, w.scatter.filter((p) => p.y < g), N * 0.35, HOT); // ribbon bits: they flutter down, not drop like stones
    if (w.flash > 0.85) r.fill(WHITE);
    targets.push({ x: cx - H * 0.3, y: cy - H * 0.55, w: H * 0.6, h: H * 1.1 });
  },
};

// ---------------------------------------------------------------------------------------------- power-up
// A shonen power-up on a barren plain: the figure crouches when the music is low and stands as it builds, an aura
// of flames (or lightning, or smoke) rising round it with the level, hair standing up with the energy, the ground
// cracking in rings on the kicks (the cracks stay and grow), rocks lifting off the ground with the bass and
// dropping back when it goes, speed lines on the heavy kicks, sparks on the snare, orbs circling on the notes. A
// drop is the scream: a shockwave ring and every rock thrown up; a section change changes the aura.
const AURA_W = { flames: [3, 2, 2], lightning: [1, 2, 3], smoke: [2, 2, 1] };

const powerup = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { aura: rollW(rnd, AURA_W, band), energy: 0, cracks: [], rings: [], sparks: [], dust: [], lines: 0, scream: 0, big: 0, smoke: [], orbs: [], smokeT: 0,
      rocks: Array.from({ length: 9 }, (_, i) => ({ x: 0.5 + (i - 4) * 0.095 + (rnd() - 0.5) * 0.05, y: 0, vy: 0, s: 2 + rnd() * 3, rot: rnd() * TAU, h0: 0.12 + rnd() * 0.25, fly: 0 })),
      crags: Array.from({ length: 7 }, (_, i) => [i * 0.16 - 0.05 + rnd() * 0.06, 0.05 + rnd() * 0.12, 0.12 + rnd() * 0.12]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = 0.78 * N, cx = 0.5 * N, grav = G(N);
    w.energy = follow(w.energy, clamp(0.5 * f.level + 0.6 * f.rel.bassDrive + 0.2 * f.rel.midDrive), dt, 0.25);
    const E = w.energy, H = 0.34 * N, crouch = 1 - clamp((E - 0.25) / 0.3), fh = H * (1 - 0.22 * crouch);
    for (const hh of hits) {
      if (isLow(hh)) { // the ground answers: a ring out from the feet, the cracks grow or another opens
        w.rings.push({ R: 0, life: 0.8 });
        for (const c of w.cracks) c.l = Math.min(0.5 * N, c.l + 0.02 * N * hh.strength);
        if (w.cracks.length < 12) w.cracks.push({ a: rnd() * Math.PI, l: 0.03 * N, j: (rnd() - 0.5) * 0.8 });
        if (hh.strength > 0.75) w.lines = 0.12;
        s.shake = Math.max(s.shake, 0.25 * hh.strength);
      } else if (hh.kind === 'snare') burst(w.sparks, rnd, cx + (rnd() - 0.5) * fh * 0.5, g - fh * (0.3 + rnd() * 0.5), 10, N * 0.4, w.aura === 'lightning' ? COOL : BRIGHT, 0.4);
      else if (isTonal(hh) && w.orbs.length < 6) w.orbs.push({ a: rnd() * TAU, life: 1.5, c: PC_COL[hh.pc] });
    }
    if (f.section === 'drop') { w.scream = 1; w.big = 1; s.shake = Math.max(s.shake, 1); for (const k of w.rocks) { k.vy = -N * (0.6 + rnd() * 0.5); k.fly = 2; k.y = Math.max(k.y, 1); } burst(w.dust, rnd, cx, g, 30, N * 0.6, LMID, 0.7); }
    else if (f.section === 'change') w.aura = rollW(rnd, AURA_W, band);
    w.scream -= dt * 0.9;
    w.big = Math.max(0, w.big - dt / 8);
    w.lines -= dt;
    // the plain: a dark sky, far crags, the ground
    skyBands(r, N, 0.55 * N, [BG, BG, DARK + DIM, DARK]);
    for (const [x, hh, ww] of w.crags) r.poly([[x * N, 0.56 * N], [(x + ww * 0.4) * N, (0.56 - hh) * N], [(x + ww) * N, 0.56 * N]], DARK);
    r.rect(0, 0.55 * N, N, g - 0.55 * N, DARK + DIM);
    r.rect(0, g, N, N - g, MID);
    r.rect(0, g, N, Math.max(1, u), LMID + DIM);
    for (const c of w.cracks) { const ex = cx + Math.cos(c.a) * c.l, ey = g + Math.sin(c.a) * c.l * 0.35; r.line(cx, g, ex, ey, DARK); r.line(ex, ey, ex + Math.cos(c.a + c.j) * c.l * 0.35, ey + Math.sin(c.a + c.j) * c.l * 0.12, DARK); }
    w.rings = w.rings.filter((q) => { q.R += dt * N * 0.7; q.life -= dt; r.ring(cx, g, q.R, Math.max(1, 1.5 * u), LMID, 0.3); return q.life > 0; });
    // the aura behind the figure
    const R = fh * (0.6 + 0.5 * E) * (1 + w.big), pulse = 1 + 0.3 * f.beat.pulse;
    if (w.aura === 'flames' || w.aura === 'lightning') {
      const base = w.aura === 'flames' ? fh * 1.35 * E * pulse : fh * 0.35 * E * pulse, col = w.aura === 'flames' ? HOT : COOL;
      for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        const q = (x - cx) / R, fl = 0.55 + 0.45 * hash(x, Math.floor(t * 16)), wave = 0.25 * Math.sin(f.rel.bassClock * 5 - q * 4), ha = base * (1.1 - q * q) * (fl + wave);
        if (ha > 0) { r.rect(x, g - ha, 1, ha, col); if (Math.abs(q) < 0.5 && ha > 4 * u) r.rect(x, g - ha * 0.5, 1, ha * 0.5, w.aura === 'flames' ? BRIGHT : COOL + DIM); }
      }
    }
    if (w.aura === 'lightning') for (let k = 0; k < 2 + Math.round(5 * E); k++) { // bolts out from the body, redrawn every few frames
      const seed = Math.floor(t * 18) * 7 + k, a = hash(seed, 1) * TAU;
      let x = cx + (hash(seed, 2) - 0.5) * fh * 0.3, y = g - fh * (0.3 + hash(seed, 3) * 0.6);
      for (let i = 0; i < 5; i++) { const nx = x + Math.cos(a + (hash(seed, 10 + i) - 0.5) * 1.5) * R * 0.25, ny = y + Math.sin(a + (hash(seed, 20 + i) - 0.5) * 1.5) * R * 0.25; r.line(x, y, nx, ny, i < 2 ? BRIGHT : COOL); x = nx; y = ny; }
    }
    if (w.aura === 'smoke') { // puffs off the feet and shoulders that rise, slow and swell
      if ((w.smokeT += dt * (2 + 20 * E)) > 1) { w.smokeT = 0; w.smoke.push({ x: cx + (rnd() - 0.5) * fh * 0.5, y: g - rnd() * fh * 0.3, vx: (rnd() - 0.5) * N * 0.1, vy: -N * (0.15 + 0.2 * E), r: 2 * u, life: 1.6 + rnd() }); }
      w.smoke = w.smoke.filter((p) => { p.vy = follow(p.vy, -N * 0.03, dt, 1); p.vx *= Math.exp(-dt); p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 5 * u; p.life -= dt; r.disc(p.x, p.y, p.r * Math.min(1, p.life * 2), p.life > 1 ? DARK : MID + DIM); return p.life > 0; }).slice(-80);
    }
    // the figure: a power stance, lower in the crouch, fists down, the hair rising with the energy
    const hw = fh * 0.17, legH = fh * 0.3, bodyH = fh * 0.4, bodyTop = g - legH - bodyH, head = fh * 0.2, hy = bodyTop - head * 0.5 + crouch * head * 0.2, sp = fh * 0.12 * (1 + crouch), scale = 1 + 0.04 * f.beat.pulse;
    for (const k of [-1, 1]) { r.stroke(cx + k * hw * 0.5, g - legH, cx + k * sp, g - legH * 0.5, Math.max(1, hw * 0.6), FIG); r.stroke(cx + k * sp, g - legH * 0.5, cx + k * sp * 0.9, g, Math.max(1, hw * 0.6), FIG); }
    r.poly([[cx - hw * 1.3 * scale, bodyTop], [cx + hw * 1.3 * scale, bodyTop], [cx + hw * 0.8, g - legH], [cx - hw * 0.8, g - legH]], FIG);
    for (const k of [-1, 1]) { r.stroke(cx + k * hw * 1.2, bodyTop + fh * 0.03, cx + k * hw * 1.9, bodyTop + bodyH * 0.6, Math.max(1, hw * 0.55), FIG); r.disc(cx + k * hw * 1.9, bodyTop + bodyH * 0.65, hw * 0.4, FIG); }
    r.disc(cx, hy, head * 0.5, FIG);
    for (let k = -2; k <= 2; k++) { // five locks: hanging when calm, standing up and out when charged
      const a = -Math.PI / 2 + k * (0.18 + 0.1 * (1 - E)) + (1 - E) * k * 0.4, len = head * (0.5 + 1.6 * E + 0.3 * f.beat.pulse * E), bx = cx + k * head * 0.2, by = hy - head * 0.35;
      r.poly([[bx - head * 0.12, by], [bx + head * 0.12, by], [bx + Math.cos(a) * len, by + Math.sin(a) * len * (E > 0.3 ? 1 : -0.3)]], FIG);
    }
    r.rect(cx - head * 0.2, hy - head * 0.05, head * 0.4, Math.max(1, u), E > 0.6 && f.beat.pulse > 0.5 ? BRIGHT : HOT); // the eyes lit
    // the rocks: lifted by the bass, dropped by gravity when it goes, their shadows under them on the ground
    for (const k of w.rocks) {
      const kx = k.x * N, want = k.fly > 0 ? 0 : f.rel.bassDrive > 0.45 ? k.h0 * N * f.rel.bassDrive * (1 + w.big) : 0;
      if (k.fly > 0) k.fly -= dt;
      if (want > 0) { k.y = follow(k.y, want, dt, 0.6) + Math.sin(t * 2 + k.s) * u * 0.1; k.vy = 0; k.rot += dt * 0.6; }
      else if (k.y > 0) { k.vy += grav * dt; k.y -= k.vy * dt; if (k.y <= 0) { k.y = 0; if (k.vy > N * 0.25) { k.vy = -k.vy * 0.3; k.y = 0.01; burst(w.dust, rnd, kx, g, 3, N * 0.15, LMID, 0.3); } else k.vy = 0; } }
      const sz = k.s * u, ry = g - k.y - sz * 0.6, c = Math.cos(k.rot), sn = Math.sin(k.rot), P = (px, py) => [kx + px * c * sz - py * sn * sz, ry + px * sn * sz + py * c * sz];
      r.rect(kx - sz * (1 - 0.4 * Math.min(1, k.y / (0.3 * N))), g, sz * 2 * (1 - 0.4 * Math.min(1, k.y / (0.3 * N))), Math.max(1, u), DARK + DIM);
      r.poly([P(-0.8, 0.5), P(-0.5, -0.6), P(0.4, -0.7), P(0.9, 0.1), P(0.5, 0.6)], k.y > 0 ? LMID : MID + DIM);
    }
    if (w.lines > 0) for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU + hash(i, 1) * 0.15, l0 = (0.22 + hash(i, 2) * 0.2) * N; r.line(cx + Math.cos(a) * l0, g - fh * 0.5 + Math.sin(a) * l0, cx + Math.cos(a) * N * 1.5, g - fh * 0.5 + Math.sin(a) * N * 1.5, i % 2 ? BRIGHT : FIG); }
    if (w.scream > 0) { const R2 = (1 - w.scream) * 1.3 * N; r.ring(cx, hy, R2, Math.max(2, 3 * u), BRIGHT); r.ring(cx, hy, R2 * 0.8, Math.max(1, 1.5 * u), HOT); }
    w.orbs = w.orbs.filter((o) => { o.a += dt * 4; o.life -= dt; r.disc(cx + Math.cos(o.a) * fh * 0.55, g - fh * 0.5 + Math.sin(o.a) * fh * 0.25, 1.5 * u, o.c); return o.life > 0; });
    w.sparks = particles(W, w.sparks.filter((p) => p.y < g), BRIGHT);
    w.dust = particles(W, w.dust.filter((p) => p.y < g + u), LMID);
    targets.push({ x: cx - fh * 0.4, y: g - fh * 1.15, w: fh * 0.8, h: fh * 1.15 });
  },
};

// ---------------------------------------------------------------------------------------------- mecha hangar
// A mecha hangar: a giant robot in its gantry (bulky, slim, or winged), lamps chasing along the catwalks one step
// per beat, technicians walking the catwalks, steam off the vents on the hats, beacons turning, a floodlight on the
// snare, the eyes flashing and the frame jolting on the kicks, wall screens changing on the notes. A drop is the
// catapult launch: the catwalks pull back, the door opens, the unit slides out on the rail with its jets lit and the
// camera shaking; the next unit rolls in after. A section change swaps the unit in the gantry.
const MECH_W = { bulky: [3, 2, 1], slim: [2, 2, 2], winged: [1, 2, 3] };
const MECHS = { bulky: { hip: 0.3, sh: 0.52, leg: 0.14 }, slim: { hip: 0.2, sh: 0.34, leg: 0.08 }, winged: { hip: 0.2, sh: 0.36, leg: 0.08 } };

// a mech with its feet at (x, g), `H` tall; `jolt` drops the frame, `eyes` lights the visor, `spread` opens the wings
function drawMech(r, kind, x, g, H, u, jolt, eyes, spread, flame) {
  const K = MECHS[kind], hip = K.hip * H, sh = K.sh * H, legW = K.leg * H, legH = H * 0.42, hy = g - legH - jolt, torsoTop = hy - H * 0.36, col = FIG;
  for (const k of [-1, 1]) { r.rect(x + k * hip * 0.5 - legW / 2, hy, legW, legH + jolt, col); r.rect(x + k * hip * 0.5 - legW * 0.7, g - H * 0.04, legW * 1.4, H * 0.04, col); }
  if (kind === 'winged') for (const k of [-1, 1]) r.poly([[x + k * sh * 0.3, torsoTop + H * 0.06], [x + k * (sh * 0.3 + H * 0.45 * spread), torsoTop - H * 0.25 * spread], [x + k * (sh * 0.3 + H * 0.5 * spread), torsoTop + H * 0.02], [x + k * sh * 0.3, torsoTop + H * 0.2]], DARK);
  r.poly([[x - sh * 0.5, torsoTop], [x + sh * 0.5, torsoTop], [x + hip * 0.5, hy], [x - hip * 0.5, hy]], col);
  for (const k of [-1, 1]) {
    if (kind === 'bulky') r.rect(x + k * sh * 0.5 - (k > 0 ? 0 : H * 0.14), torsoTop - H * 0.03, H * 0.14, H * 0.1, col);
    r.rect(x + k * sh * 0.52 - (k > 0 ? 0 : legW), torsoTop + H * 0.06, legW, H * 0.3, col);
  }
  r.rect(x - H * 0.05, torsoTop - H * 0.1, H * 0.1, H * 0.1, col);
  if (kind !== 'bulky') r.poly([[x - u, torsoTop - H * 0.1], [x + u, torsoTop - H * 0.1], [x, torsoTop - H * 0.2]], col);
  r.rect(x - H * 0.04, torsoTop - H * 0.07, H * 0.08, Math.max(1, 1.2 * u), eyes > 0 ? HOT : COOL);
  r.rect(x - H * 0.02, torsoTop + H * 0.08, H * 0.04, H * 0.04, flame ? BRIGHT : eyes > 0 ? BRIGHT : HOT);
  for (let y = torsoTop + H * 0.05; y < hy; y += H * 0.08) r.rect(x - hip * 0.35, y, hip * 0.7, Math.max(1, u * 0.7), DARK); // panel seams
  return { top: torsoTop - H * 0.2, half: sh * 0.5 + legW };
}

const hangar = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, MECH_W, band), x: 0.42, v: 0, dock: 1, door: 0, launch: 0, back: 0, steam: [], jets: [], eyes: 0, jolt: 0, flood: 0, beaconA: 0, screens: Array.from({ length: 15 }, () => rnd()),
      techs: Array.from({ length: 4 + band }, (_, i) => ({ lv: i % 3, p: rnd(), dir: rnd() < 0.5 ? -1 : 1, ph: rnd() * TAU, side: i % 2 ? 1 : -1 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = 0.86 * N, H = 0.6 * N, cx = 0.42 * N, tw = 0.05 * N, lt = cx - 0.3 * N, rt = cx + 0.3 * N;
    for (const hh of hits) {
      if (isLow(hh)) { w.eyes = 0.12; w.jolt = 1; s.shake = Math.max(s.shake, 0.12 * hh.strength); }
      else if (hh.kind === 'snare') w.flood = 0.25;
      else if (hh.kind === 'hat' || hh.kind === 'perc') for (const side of [-1, 1]) for (let k = 0; k < 3; k++) w.steam.push({ x: (side < 0 ? lt + tw : rt) + side * u, y: g - H * (0.35 + 0.3 * Math.round(rnd())), vx: side * N * (0.1 + rnd() * 0.15), vy: -N * 0.04 * rnd(), r: 1.5 * u, life: 1.2 + rnd() });
      else if (isTonal(hh)) for (let k = 0; k < 4; k++) w.screens[Math.floor(rnd() * 15)] = rnd();
    }
    if (f.section === 'drop' && !w.launch) w.launch = 1;
    else if (f.section === 'change' && !w.launch) w.kind = rollW(rnd, MECH_W, band);
    w.eyes -= dt; w.flood -= dt; w.jolt *= Math.exp(-dt * 10);
    // the launch: undock, open the door, run the rail; then the next unit rolls in and docks again
    if (w.launch) {
      w.launch += dt;
      w.dock = clamp(w.dock - dt * 1.4);
      w.door = clamp(w.door + dt * 0.9);
      if (w.launch > 1.1 && w.x < 1.6) { w.v += dt * 1.1; w.x += w.v * dt; s.shake = Math.max(s.shake, 0.5); for (let k = 0; k < 4; k++) w.jets.push({ x: (w.x - 0.1) * N, y: g - H * (0.05 + rnd() * 0.35), vx: -N * (0.5 + rnd() * 0.6), vy: (rnd() - 0.5) * N * 0.15, life: 0.3 + rnd() * 0.3, c: k % 2 ? HOT : BRIGHT }); }
      if (w.x >= 1.6) { w.back += dt; if (w.back > 1.5) { w.launch = 0; w.back = 0; w.v = 0; w.x = -0.5; w.kind = rollW(rnd, MECH_W, band); } }
    } else {
      w.x = follow(w.x, 0.42, dt, 0.9);
      if (Math.abs(w.x - 0.42) < 0.01) { w.dock = clamp(w.dock + dt * 0.8); w.door = clamp(w.door - dt * 0.6); }
    }
    // the hall: wall panels, the screens, the floor with its hazard strip and the rail, the door on the right
    r.rect(0, 0, N, g, DARK + DIM);
    for (let x = 0; x < N; x += 0.1 * N) r.rect(x, 0, Math.max(1, u), g, DARK);
    for (let y = 0.1 * N; y < g; y += 0.2 * N) r.rect(0, y, N, Math.max(1, u), DARK);
    for (let i = 0; i < 15; i++) { const sx = 0.76 * N + (i % 5) * 0.045 * N, sy = 0.1 * N + Math.floor(i / 5) * 0.05 * N, v = w.screens[i]; r.rect(sx, sy, 0.035 * N, 0.035 * N, DARK); r.rect(sx + u, sy + 0.035 * N - u - v * 0.028 * N, 0.035 * N - 2 * u, v * 0.028 * N, v > 0.7 ? HOT : COOL); }
    const dx0 = 0.88 * N;
    r.rect(dx0, 0.2 * N, N - dx0, g - 0.2 * N, BG);
    if (w.door > 0) { r.rect(dx0, 0.2 * N + (g - 0.2 * N) * 0.5 * (1 - w.door), N - dx0, (g - 0.2 * N) * w.door, COOL + DIM); for (let k = 0; k < 8; k++) r.set(dx0 + hash(k, 4) * (N - dx0), 0.2 * N + hash(k, 5) * (g - 0.2 * N), BRIGHT); }
    r.rect(dx0, 0.2 * N, N - dx0, (g - 0.2 * N) * 0.5 * (1 - w.door), MID + DIM);
    r.rect(dx0, g - (g - 0.2 * N) * 0.5 * (1 - w.door), N - dx0, (g - 0.2 * N) * 0.5 * (1 - w.door), MID + DIM);
    r.rect(0, g, N, N - g, MID);
    for (let x = 0; x < N; x += 6 * u) r.rect(x, g + 2 * u, 3 * u, 2 * u, HOT);
    r.rect(0, g, N, Math.max(1, u), LMID);
    r.rect(cx - 0.1 * N, g - u, N, Math.max(1, u), w.launch > 1 ? BRIGHT : LMID + DIM);
    if (w.flood > 0) r.poly([[0.06 * N, 0.06 * N], [0.1 * N, 0.05 * N], [w.x * N + H * 0.3, g - H * 0.4], [w.x * N - H * 0.3, g - H * 0.1]], LMID + DIM);
    r.rect(0.05 * N, 0.04 * N, 0.05 * N, 0.03 * N, w.flood > 0 ? BRIGHT : DARK);
    // the gantry: two towers with braces, the beacons on top, the catwalks reaching in to the unit
    w.beaconA += dt * 5 * (0.5 + f.rel.trebDrive); // the beacons turn faster with the treble: integrated, so they never jump
    for (const x of [lt, rt - tw]) {
      r.rect(x, 0.1 * N, tw, g - 0.1 * N, DARK);
      for (let y = 0.1 * N; y < g - 0.06 * N; y += 0.06 * N) r.line(x, y, x + tw, y + 0.06 * N, LMID + DIM);
      r.rect(x, 0.1 * N, tw, Math.max(1, u), LMID);
      const bx = x + tw / 2, by = 0.09 * N, ba = w.beaconA, face = Math.cos(ba) > 0.5;
      r.rect(bx - 1.5 * u, by - 3 * u, 3 * u, 3 * u, face ? HOT : HOT + DIM);
      r.line(bx, by - 1.5 * u, bx + Math.cos(ba) * 0.1 * N, by - 1.5 * u + Math.sin(ba) * 0.03 * N, face ? HOT : HOT + DIM);
    }
    const mech = { half: H * 0.3 };
    const walks = [];
    for (let lv = 0; lv < 3; lv++) {
      const y = g - H * (0.3 + lv * 0.27), reach = (0.3 * N - tw - (lv === 2 ? H * 0.2 : lv === 1 ? MECHS[w.kind].sh * H * 0.55 : MECHS[w.kind].hip * H * 0.6)) * w.dock;
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? lt + tw : rt - tw - reach, len = reach;
        r.rect(x0, y, len, 2 * u, MID);
        r.rect(x0, y - 4 * u, len, Math.max(1, u), LMID + DIM);
        for (let i = 0, x = x0 + 2 * u; x < x0 + len - u; x += 0.05 * N, i++) r.rect(x, y - 1.5 * u, 1.5 * u, 1.5 * u, (i + f.beat.count + (side > 0 ? 2 : 0)) % 4 === 0 ? BRIGHT : DARK + DIM);
        walks.push({ x0, len, y, side });
      }
    }
    // the technicians, tiny, walking their catwalk and turning at its ends
    const v = 0.08 * (0.3 + f.rel.midDrive + 0.3 * f.level);
    for (const tc of w.techs) {
      const wk = walks[tc.lv * 2 + (tc.side > 0 ? 1 : 0)];
      if (wk.len < 4 * u) continue;
      tc.p += tc.dir * dt * v * N / Math.max(1, wk.len);
      if (tc.p > 1) { tc.p = 1; tc.dir = -1; } else if (tc.p < 0) { tc.p = 0; tc.dir = 1; }
      tc.ph += (dt * v * Math.PI) / (0.2 * 0.05); // the stride keeps up with the travel: a step of a fifth of the height per half swing
      walker(r, wk.x0 + tc.p * wk.len, wk.y, 0.05 * N, LMID, tc.ph, tc.dir, { cap: true, hatCol: HOT });
    }
    // the unit itself, and its jets when it runs
    const mx = w.x * N;
    if (mx > -H && mx < N + H) {
      const J = drawMech(r, w.kind, mx, g, H, u, w.jolt * 1.5 * u, w.eyes, clamp(0.3 + 0.7 * f.level + (w.launch > 1 ? 1 : 0)), w.launch > 1.1);
      mech.half = J.half;
      targets.push({ x: mx - J.half, y: J.top, w: J.half * 2, h: g - J.top });
    }
    w.jets = particles(W, w.jets.filter((p) => p.y < g), HOT);
    w.steam = w.steam.filter((p) => { p.vx *= Math.exp(-dt * 2); p.vy = follow(p.vy, -N * 0.025, dt, 0.6); p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 3 * u; p.life -= dt; r.disc(p.x, p.y, p.r * Math.min(1, p.life), LMID + DIM); return p.life > 0; }).slice(-120);
  },
};

// ---------------------------------------------------------------------------------------------- summer festival
// A summer festival lane at night: food stalls with glowing fronts behind the lane, two strings of lanterns swinging
// on the treble clock, silhouettes in yukata strolling past, fireworks over the roofs. A kick launches a shell that
// climbs, slows under gravity and bursts at its apex in the colour of the last note's pitch class, the embers
// falling and fading; a snare lights a sparkler in someone's hand; a hat flickers a stall front; a drop is a
// barrage. A section change changes the lanterns and who is out.
const LANTERN_W = { round: [3, 2, 2], long: [2, 2, 1], paper: [1, 2, 3] };

const festival = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { lantern: rollW(rnd, LANTERN_W, band), shells: [], sparks: [], pc: Math.floor(rnd() * 12), queue: 0, queueT: 0, sparkler: null,
      stalls: Array.from({ length: 4 }, (_, i) => ({ x: 0.02 + i * 0.26 + rnd() * 0.04, w: 0.19 + rnd() * 0.04, h: 0.2 + rnd() * 0.06, c: i % 2 ? HOT : COOL, flick: 0, bits: Array.from({ length: 6 }, () => rnd() < 0.6) })),
      folk: Array.from({ length: 3 + band }, () => ({ x: rnd(), dir: rnd() < 0.5 ? 1 : -1, ph: rnd() * TAU, h: 0.2 + rnd() * 0.03, fan: rnd() < 0.5, mask: rnd() < 0.4, c: rnd() < 0.5 ? DARK : FIG })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, g = 0.8 * N, bps = bpsOf(f), band = bandOf(W.a), grav = G(N);
    const launch = (strength) => { const top = (0.28 + 0.35 * strength + rnd() * 0.1) * N; w.shells.push({ x: (0.1 + rnd() * 0.8) * N, y: g - 0.14 * N, vx: (rnd() - 0.5) * N * 0.06, vy: -Math.sqrt(2 * grav * top), c: PC_COL[w.pc], trail: 0 }); };
    for (const hh of hits) {
      if (isTonal(hh)) w.pc = hh.pc;
      if (isLow(hh) && hh.strength > 0.5) launch(hh.strength);
      else if (hh.kind === 'snare') w.sparkler = { who: Math.floor(rnd() * w.folk.length), t: 0.7 };
      else if (hh.kind === 'hat') pick(rnd, w.stalls).flick = 0.1;
    }
    if (f.section === 'drop') w.queue = 8;
    else if (f.section === 'change') { w.lantern = rollW(rnd, LANTERN_W, band); for (const p of w.folk) { p.fan = rnd() < 0.5; p.mask = rnd() < 0.4; } }
    if (w.queue > 0 && (w.queueT -= dt) <= 0) { w.queueT = 0.18; w.queue--; launch(0.75 + rnd() * 0.25); }
    for (let k = 0; k < 40; k++) r.set(hash(k, 1) * N, hash(k, 2) * 0.5 * N, hash(k, 3 + Math.floor(t * 2)) < 0.85 ? MID : LMID);
    // the shells climb and slow, burst at the top; the embers fall through the air and fade
    w.shells = w.shells.filter((sh) => {
      sh.vy += grav * dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      r.rect(sh.x, sh.y, Math.max(1, u), Math.max(1, 2 * u), BRIGHT);
      if ((sh.trail += dt) > 0.04) { sh.trail = 0; w.sparks.push({ x: sh.x, y: sh.y, vx: (rnd() - 0.5) * N * 0.04, vy: 0, life: 0.25, c: LMID }); }
      if (sh.vy >= 0) { burst(w.sparks, rnd, sh.x, sh.y, 36 + Math.round(24 * f.level), N * 0.42, sh.c, 1.2); burst(w.sparks, rnd, sh.x, sh.y, 10, N * 0.15, BRIGHT, 0.6); return false; }
      return true;
    });
    // the embers: half gravity and the air holding them to a terminal speed, slowing sideways, fading as they go
    w.sparks = w.sparks.filter((p) => { p.vy = Math.min(N * 0.3, p.vy + grav * 0.5 * dt); p.vx *= Math.exp(-dt * 0.8); p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.y < g - 0.1 * N) r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), p.life > 0.4 ? p.c : p.c < DIM ? p.c + DIM : p.c); return p.life > 0 && p.y < g; }).slice(-900);
    // the stalls behind the lane: a body, a striped awning, the lit counter
    const sb = g - 0.03 * N;
    for (const st of w.stalls) {
      st.flick -= dt;
      const x = st.x * N, ww = st.w * N, hh = st.h * N, lit = st.flick > 0 ? BRIGHT : LMID;
      r.rect(x, sb - hh, ww, hh, DARK);
      r.rect(x + 2 * u, sb - hh * 0.55, ww - 4 * u, hh * 0.4, lit);
      for (let k = 0; k < 6; k++) if (st.bits[k]) r.rect(x + 3 * u + k * (ww - 6 * u) / 6, sb - hh * 0.5, (ww - 6 * u) / 6 - u, hh * 0.12, st.c);
      for (let k = 0; k < 6; k++) r.poly([[x - 2 * u + k * (ww + 4 * u) / 6, sb - hh * 1.12], [x - 2 * u + (k + 1) * (ww + 4 * u) / 6, sb - hh * 1.12], [x - u + (k + 1) * (ww + 2 * u) / 6, sb - hh], [x - u + k * (ww + 2 * u) / 6, sb - hh]], k % 2 ? st.c : BRIGHT);
      r.rect(x + ww * 0.5 - 1.5 * u, sb - hh * 0.95, 3 * u, 4 * u, f.beat.pulse > 0.6 ? BRIGHT : st.c);
    }
    r.rect(0, sb, N, N - sb, MID + DIM);
    r.rect(0, g, N, N - g, MID);
    r.rect(0, g, N, Math.max(1, u), LMID + DIM);
    // the lantern strings: a sag between the poles, each lantern a pendulum off its cord
    for (const [y0, sz, n] of [[0.26, 2.2, 11], [0.4, 3, 9]]) {
      const sag = 0.05 * N, Y = (x) => y0 * N + sag * Math.sin((Math.PI * x) / N);
      for (let x = 0; x < N; x += 3 * u) r.line(x, Y(x), x + 3 * u, Y(x + 3 * u), DARK);
      for (let i = 0; i < n; i++) {
        const lx = ((i + 0.5) / n) * N, a = (0.12 + 0.35 * f.rel.trebDrive) * Math.sin(f.rel.trebClock * 3 + i * 0.9) + 0.06 * Math.sin(t * 1.5 + i), len = sz * 1.6 * u, px = lx + Math.sin(a) * len, py = Y(lx) + Math.cos(a) * len, glow = f.beat.pulse > 0.6 ? BRIGHT : i % 2 ? HOT : LMID;
        r.line(lx, Y(lx), px, py, DARK);
        if (w.lantern === 'round') { r.disc(px, py + sz * u, sz * u, glow); r.rect(px - u, py, 2 * u, Math.max(1, u), DARK); }
        else if (w.lantern === 'long') { r.rect(px - sz * 0.6 * u, py, sz * 1.2 * u, sz * 2.4 * u, glow); r.rect(px - sz * 0.6 * u, py + sz * 1.2 * u, sz * 1.2 * u, Math.max(1, u), HOT + DIM); }
        else r.poly([[px, py], [px + sz * u, py + sz * 1.2 * u], [px, py + sz * 2.4 * u], [px - sz * u, py + sz * 1.2 * u]], glow);
      }
    }
    for (const x of [0.03, 0.97]) r.rect(x * N - u, 0.24 * N, 2 * u, g - 0.24 * N, DARK);
    // the strollers in yukata, a fan or a mask, one with the sparkler
    if (w.sparkler && (w.sparkler.t -= dt) <= 0) w.sparkler = null;
    w.folk.forEach((p, i) => {
      p.x += p.dir * dt * 0.03 * bps * 0.7;
      if (p.x > 1.15 || p.x < -0.15) { p.dir = -p.dir; p.x = clamp(p.x, -0.14, 1.14); }
      p.ph += dt * bps * Math.PI * 0.9;
      const fh = p.h * N, x = p.x * N;
      r.rect(x - fh * 0.2, g, fh * 0.4, Math.max(1, u), BLACK);
      const J = walker(r, x, g, fh, p.c, p.ph * 0.6, p.dir, {});
      r.poly([[x - J.hw * 1.2, J.sy + fh * 0.1], [x + J.hw * 1.2, J.sy + fh * 0.1], [x + J.hw * 1.1, g - fh * 0.04], [x - J.hw * 1.1, g - fh * 0.04]], p.c); // the robe to the ankles
      r.rect(x - J.hw * 1.3, J.sy + fh * 0.3, J.hw * 2.6, Math.max(1, 1.5 * u), i % 2 ? HOT : COOL); // the sash
      r.rect(x - fh * 0.05, J.head - fh * 0.14, fh * 0.1, fh * 0.05, p.c);
      if (p.mask) r.disc(x - p.dir * fh * 0.08, J.head - fh * 0.06, fh * 0.07, LMID);
      const hx = J.sx + p.dir * fh * 0.08, hy = J.sy + fh * 0.3;
      if (w.sparkler && w.sparkler.who === i) { r.line(hx, hy, hx + p.dir * fh * 0.1, hy - fh * 0.15, LMID); burst(w.sparks, rnd, hx + p.dir * fh * 0.1, hy - fh * 0.15, 3, N * 0.12, BRIGHT, 0.25); }
      else if (p.fan) r.poly([[hx, hy], [hx + p.dir * fh * 0.14, hy - fh * 0.1], [hx + p.dir * fh * 0.15, hy + fh * 0.02]], COOL);
      targets.push({ x: x - fh * 0.3, y: g - fh * 1.05, w: fh * 0.6, h: fh * 1.05 });
    });
  },
};

// ---------------------------------------------------------------------------------------------- idol stage
// An idol stage seen from the crowd: a sea of penlights in the foreground waving as one wave that runs across the
// hall on the beat, their colour the last note's pitch class (a few keep their own), three (or five, or one)
// silhouettes on the stage stepping a pose per beat, a backdrop of panels that changes each beat, lasers and spots
// on the snare, the footlights flaring on the kick, hats twinkling the panels. A drop is a jump and confetti; a
// section change changes the formation.
const FORM_W = { trio: [3, 2, 2], five: [1, 2, 3], solo: [2, 2, 1] };
const FORMS = { trio: [0.35, 0.5, 0.65], five: [0.26, 0.38, 0.5, 0.62, 0.74], solo: [0.5] };
const IDOL_POSES = [{ arms: [2.6, 2.6], dy: 0, legs: 0.3 }, { arms: [1.2, 2.9], dy: 0.02, legs: 1 }, { arms: [0.5, 0.5], dy: -0.03, legs: 0.6 }, { arms: [2.9, 1.2], dy: 0.02, legs: 1 }];

const idol = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    const crowd = Array.from({ length: 150 }, () => ({ q: 0.06 + rnd() * 0.94, x: rnd(), ph: rnd() * TAU, own: rnd() < 0.25 ? Math.floor(rnd() * 12) : -1 }));
    crowd.sort((a, b) => a.q - b.q);
    Object.assign(w, { form: rollW(rnd, FORM_W, band), crowd, pc: Math.floor(rnd() * 12), lasers: 0, flash: 0, conf: [], jy: 0, jvy: 0, ph: 0, twinkle: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), hz = 0.6 * N, stage = 0.56 * N, bps = bpsOf(f);
    for (const hh of hits) {
      if (isTonal(hh)) w.pc = hh.pc;
      if (hh.kind === 'snare') w.lasers = 0.3;
      else if (isLow(hh)) w.flash = Math.max(w.flash, hh.strength);
      else if (hh.kind === 'hat') for (let k = 0; k < 4; k++) w.twinkle.push({ i: Math.floor(rnd() * 32), t: 0.1 });
    }
    if (f.section === 'drop') { if (w.jy >= 0) w.jvy = -Math.sqrt(2 * G(N) * 0.08 * N); w.lasers = 1; for (let k = 0; k < 160; k++) w.conf.push({ x: rnd() * N, y: -rnd() * 0.3 * N, vx: (rnd() - 0.5) * N * 0.1, vy: 0, a: rnd() * TAU, c: [HOT, COOL, BRIGHT][k % 3] }); }
    else if (f.section === 'change') w.form = rollW(rnd, FORM_W, band);
    w.lasers -= dt; w.flash *= Math.exp(-dt * 6);
    if (w.jy < 0 || w.jvy < 0) { w.jvy += G(N) * dt; w.jy += w.jvy * dt; if (w.jy >= 0) { w.jy = 0; w.jvy = 0; } } // the jump: up off the stage and back onto it under gravity
    const q = beatLocked(f) ? f.beat.count + f.beat.phase : (w.ph += dt * bps);
    // the backdrop panels and the truss above the stage
    for (let i = 0; i < 32; i++) {
      const px = 0.15 * N + (i % 8) * 0.0875 * N, py = 0.1 * N + Math.floor(i / 8) * 0.1 * N, on = hash(i, f.beat.count) < 0.5 || w.flash > 0.6;
      r.rect(px + u, py + u, 0.0875 * N - 2 * u, 0.1 * N - 2 * u, on ? (i % 2 ? HOT : COOL) : DARK);
    }
    w.twinkle = w.twinkle.filter((tw) => { tw.t -= dt; r.rect(0.15 * N + (tw.i % 8) * 0.0875 * N + u, 0.1 * N + Math.floor(tw.i / 8) * 0.1 * N + u, 0.0875 * N - 2 * u, 0.1 * N - 2 * u, BRIGHT); return tw.t > 0; });
    r.rect(0.1 * N, 0.06 * N, 0.8 * N, 2 * u, DARK);
    for (let k = 0; k < 7; k++) r.rect((0.14 + k * 0.12) * N, 0.08 * N, 3 * u, 2 * u, (k + f.beat.count) % 3 === 0 ? BRIGHT : MID);
    if (w.lasers > 0) {
      for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + (i - 2.5) * 0.25 + Math.sin(t * 7 + i) * 0.1; r.line(N / 2, 0.08 * N, N / 2 + Math.cos(a) * N * 1.2, 0.08 * N + Math.sin(a) * N * 1.2, COOL); }
      for (const [lx, tx] of [[0.14, 0.4], [0.86, 0.6]]) r.poly([[lx * N - 2 * u, 0.09 * N], [lx * N + 2 * u, 0.09 * N], [(tx + 0.1) * N, stage], [(tx - 0.1) * N, stage]], LMID + DIM);
    }
    // the stage front and the footlights; the dancers stand on its edge, a pose per beat
    r.rect(0, stage, N, 0.08 * N, DARK);
    r.rect(0, stage, N, Math.max(1, u), LMID);
    for (let x = 0.04 * N; x < N; x += 0.08 * N) r.rect(x, stage + 2 * u, 2 * u, 2 * u, w.flash > 0.5 ? BRIGHT : f.beat.pulse > 0.5 ? HOT : MID);
    const k = Math.floor(q) % 4, p = ease((q % 1) * 1.6), A = IDOL_POSES[k], B = IDOL_POSES[(k + 1) % 4], Lp = (a, b) => lerp(a, b, p), xs = FORMS[w.form];
    xs.forEach((fx, i) => {
      const centre = i === (xs.length - 1) / 2, h = 0.3 * N * (centre ? 1 : 0.9), x = fx * N, mirror = i < (xs.length - 1) / 2 ? -1 : 1;
      const base = stage + Lp(A.dy, B.dy) * N + w.jy, legs = Lp(A.legs, B.legs), lw = Math.max(1, h * 0.09), legH = h * 0.33, spread = h * 0.1 * legs;
      for (const sgn of [-1, 1]) r.rect(x + sgn * spread - lw / 2, base - legH, lw, legH, FIG);
      const bodyH = h * 0.36, top = base - legH - bodyH;
      r.poly([[x - h * 0.13, top], [x + h * 0.13, top], [x + h * 0.22, top + bodyH], [x - h * 0.22, top + bodyH]], centre ? HOT : COOL); // the dress
      r.rect(x - h * 0.08, top, h * 0.16, bodyH * 0.5, FIG);
      const hy = top - h * 0.11;
      r.disc(x, hy, h * 0.1, FIG);
      r.poly([[x - h * 0.1, hy - h * 0.05], [x + h * 0.1, hy - h * 0.05], [x + h * 0.14 * mirror + h * 0.06 * Math.sin(q * TAU), hy + h * 0.25], [x - h * 0.14 * mirror, hy + h * 0.2]], FIG); // hair that follows the step
      r.rect(x - h * 0.03, hy - h * 0.13, h * 0.06, h * 0.05, HOT); // a ribbon
      const [al, ar] = mirror > 0 ? [Lp(A.arms[0], B.arms[0]), Lp(A.arms[1], B.arms[1])] : [Lp(A.arms[1], B.arms[1]), Lp(A.arms[0], B.arms[0])], armL = h * 0.3, sy = top + h * 0.03;
      r.stroke(x - h * 0.12, sy, x - h * 0.12 - Math.sin(al) * armL, sy + Math.cos(al) * armL, Math.max(1, h * 0.06), FIG);
      r.stroke(x + h * 0.12, sy, x + h * 0.12 + Math.sin(ar) * armL, sy + Math.cos(ar) * armL, Math.max(1, h * 0.06), FIG);
      targets.push({ x: x - h * 0.3, y: top - h * 0.25, w: h * 0.6, h: h + h * 0.25 });
    });
    // the crowd, far to near: heads, shoulders and penlights waving in one wave across the hall
    const wavePos = q, col0 = PC_COL[w.pc];
    for (const c of w.crowd) {
      const sc = c.q, y = hz + 0.36 * N * sc, x = c.x * N, rad = Math.max(0.6 * u, 0.06 * N * sc), len = 0.16 * N * sc;
      const a = 0.9 * Math.sin(TAU * (wavePos - c.x * 0.7)) * (0.5 + 0.5 * f.level) + 0.1 * Math.sin(t * 2 + c.ph);
      r.disc(x, y, rad, DARK);
      r.rect(x - rad * 1.5, y + rad * 0.6, rad * 3, rad * 1.6, DARK);
      const hx = x + rad * 1.1, hy = y - rad * 0.2, tipx = hx + Math.sin(a) * len, tipy = hy - Math.cos(a) * len;
      r.stroke(hx, hy, tipx, tipy, Math.max(1, 1.3 * u * sc), c.own >= 0 ? PC_COL[c.own] : col0);
      r.set(tipx, tipy, BRIGHT);
    }
    // confetti: it falls at a terminal speed, swaying
    w.conf = w.conf.filter((p) => {
      p.vy = Math.min(N * 0.12, p.vy + G(N) * dt);
      p.y += p.vy * dt;
      p.x += p.vx * dt + Math.sin((p.a += dt * 4)) * dt * 8 * u;
      r.rect(p.x, p.y, Math.max(1, Math.round(2 * u * Math.abs(Math.cos(p.a)))), Math.max(1, u), p.c);
      return p.y < N;
    }).slice(-400);
  },
};

// ---------------------------------------------------------------------------------------------- bamboo grove
// A samurai in a bamboo grove: three layers of stalks swaying with the wind (the far ones less, as far things
// do), leaves coming down on it, wind bands sweeping through with the treble, the figure still with the blade
// sheathed; the weather is sun shafts, rain or fog. A heavy kick is one draw-cut: a flash line across the screen,
// the nearest stalk split along it, the top sliding off and falling, then stillness and the blade going home; a
// snare cuts a falling leaf in two; a drop is three cuts in a row. A section change changes the weather and the
// grove grows back.
const WEATHER_W = { sun: [3, 2, 1], rain: [1, 2, 3], fog: [2, 2, 2] };

const bamboo = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    const layer = (n) => Array.from({ length: n }, () => ({ x: -0.05 + rnd() * 1.1, ph: rnd() * TAU, top: 0.02 + rnd() * 0.12, cut: 0, piece: null, node: rnd() }));
    Object.assign(w, { weather: rollW(rnd, WEATHER_W, band), far: layer(26), mid: layer(12), near: layer(6), leaves: [], halves: [], queue: 0, queueT: 0, pose: 0, flash: 0, flashA: -0.6, drops: [], splash: [], chink: 0, windS: 0, windPh: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = 0.84 * N, fx = 0.4 * N, fh = 0.3 * N, grav = G(N);
    const wind = (w.windS = follow(w.windS, windOf(f), dt, 0.25)); // stalks have inertia: the wind they bend to is smoothed
    const cut = () => { // the nearest whole stalk to the figure, along a diagonal through the chest
      const pool = w.near.filter((st) => !st.cut && Math.abs(st.x * N - fx) > fh * 0.2).concat(w.mid.filter((st) => !st.cut));
      if (!pool.length) return;
      const st = pool.reduce((m, q) => (Math.abs(q.x * N - fx) < Math.abs(m.x * N - fx) ? q : m));
      const ang = -0.5 - rnd() * 0.4, cy = g - fh * 0.6 + Math.tan(ang) * (st.x * N - fx);
      st.cut = Math.max(st.top * N + 4 * u, Math.min(g - 4 * u, cy));
      const qq = (g - st.cut) / (g - st.top * N), sw = (w.near.includes(st) ? 5 : 3) * wind * Math.sin(f.rel.trebClock * 1.5 + st.ph) * u; // where the bent stalk is at the cut
      st.piece = { x: st.x * N + sw * qq * qq, y: st.cut, vx: -N * 0.08, vy: N * 0.06, rot: 0, len: st.cut - st.top * N, t: 0, down: 0 };
      w.flash = 0.07; w.flashA = ang; w.pose = 1;
      s.shake = Math.max(s.shake, 0.3);
    };
    for (const hh of hits) {
      if (isLow(hh) && hh.strength > 0.65 && w.queue === 0) cut();
      else if (hh.kind === 'snare') { // a leaf in reach, cut in two
        const lf = w.leaves.find((p) => p.lie <= 0 && Math.abs(p.x - fx) < 0.3 * N && p.y > g - fh * 1.1 && p.y < g - fh * 0.2) || { x: fx + 0.2 * N, y: g - fh * 0.7, vx: 0, vy: 0 };
        for (const k of [-1, 1]) w.halves.push({ x: lf.x, y: lf.y, vx: lf.vx + k * N * 0.12, vy: -N * 0.08, life: 1.2 });
        if (lf.lie !== undefined) { lf.x = rnd() * N; lf.y = -rnd() * 0.2 * N; lf.vy = 0; }
        w.pose = Math.max(w.pose, 0.5); w.flash = 0.04; w.flashA = -0.3;
      }
    }
    if (f.section === 'drop') w.queue = 3;
    else if (f.section === 'change') { w.weather = rollW(rnd, WEATHER_W, band); for (const st of [...w.near, ...w.mid]) { st.cut = 0; st.piece = null; } }
    if (w.queue > 0 && (w.queueT -= dt) <= 0) { w.queueT = 0.16; w.queue--; cut(); }
    if (w.pose > 0 && (w.pose -= dt * 1.4) <= 0) w.chink = 0.2;
    w.chink -= dt; w.flash -= dt;
    // a stalk: its base on g, bent by the wind more toward the top; the cut ones stop at the cut
    const stalk = (st, amp, wd, col, nodes) => {
      const x = st.x * N, top = st.cut || st.top * N, sway = amp * wind * Math.sin(f.rel.trebClock * 1.5 + st.ph) * u, hgt = g - st.top * N;
      let lx = x, ly = g;
      for (let k = 1; k <= 6; k++) { const q = k / 6, y = g - hgt * q; if (y < top) { const qq = (g - top) / hgt; const ex = x + sway * qq * qq; vrun(r, lx, ly, ex, top, wd, col); break; } const ex = x + sway * q * q; vrun(r, lx, ly, ex, y, wd, col); lx = ex; ly = y; }
      if (nodes) for (let y = g - 0.06 * N * st.node; y > top; y -= 0.08 * N) { const q = (g - y) / hgt; r.rect(x + sway * q * q - wd * 0.6, y, wd * 1.2, Math.max(1, u * 0.7), BLACK); }
    };
    skyBands(r, N, g, [LMID, LMID, MID, MID]);
    for (const st of w.far) stalk(st, 1.5, Math.max(1, u * 0.8), w.weather === 'fog' ? MID + DIM : DARK + DIM, false);
    if (w.weather === 'sun') for (let k = 0; k < 4; k++) { const x0 = (0.3 + k * 0.2 + 0.1 * Math.sin(f.rel.midClock * 0.2 + k)) * N; r.poly([[x0, 0], [x0 + 0.06 * N, 0], [x0 - 0.3 * N + 0.06 * N, g], [x0 - 0.3 * N, g]], f.beat.pulse > 0.5 ? LMID : LMID + DIM); }
    if (w.weather === 'fog') for (let k = 0; k < 3; k++) { const y0 = (0.45 + k * 0.12) * N + Math.sin(f.rel.midClock * 0.4 + k) * 3 * u; for (let y = y0; y < y0 + 0.08 * N; y += 2) r.rect(((f.rel.midClock * 0.03 * (k + 1)) % 1) * N - N, y, 2 * N, 1, MID + DIM); }
    for (const st of w.mid) stalk(st, 3, Math.max(1, 2 * u), DARK, true);
    r.rect(0, g, N, N - g, MID + DIM);
    for (let x = 0; x < N; x += 5 * u) { r.line(x, g, x - 1.5 * u, g - 3 * u, DARK); r.line(x, g, x + 1.5 * u, g - 3 * u, DARK); }
    // the figure: hakama, the scabbard at the hip, a topknot; the cut pose is a lunge with the blade out
    const k = clamp(w.pose), lunge = k * fh * 0.1, hw = fh * 0.17;
    r.rect(fx - fh * 0.25, g, fh * 0.5, Math.max(1, u), DARK);
    for (const sgn of [-1, 1]) r.rect(fx + sgn * (hw * 0.6 + k * hw * 1.4) - hw * 0.45, g - fh * 0.3, hw * 0.9, fh * 0.3, FIG);
    r.poly([[fx - hw * 1.1 - lunge, g - fh * 0.55], [fx + hw * 1.1 - lunge, g - fh * 0.55], [fx + hw * 1.6 + k * hw, g - fh * 0.05], [fx - hw * 1.6 - k * hw * 2, g - fh * 0.05]], FIG);
    const shY = g - fh * 0.78, hx = fx - lunge * 1.5;
    r.rect(hx - hw, shY, hw * 2, fh * 0.25, FIG);
    r.disc(hx, shY - fh * 0.1, fh * 0.1, FIG);
    r.rect(hx - fh * 0.03, shY - fh * 0.24, fh * 0.06, fh * 0.07, FIG);
    const shoulderY = shY + fh * 0.02 + f.beat.pulse * u * 0.5;
    if (k > 0.05) { // the arm straight out along the cut, the blade beyond it
      const ca = Math.cos(w.flashA), sa = Math.sin(w.flashA), ax = hx + hw * 0.5, ay = shoulderY, ex = ax + ca * fh * 0.3, ey = ay + sa * fh * 0.3;
      r.stroke(ax, ay, ex, ey, Math.max(1, 1.5 * u), FIG);
      r.stroke(ex, ey, ex + ca * fh * 0.55, ey + sa * fh * 0.55, Math.max(1, 1.3 * u), BRIGHT);
    } else { // hands at the hilt, the scabbard back along the hip
      r.stroke(hx + hw * 0.6, shoulderY, hx - hw * 0.2, shY + fh * 0.22, Math.max(1, 1.5 * u), FIG);
      r.stroke(hx - hw * 0.2, shY + fh * 0.22, hx - hw * 2.4, shY + fh * 0.42, Math.max(1, 1.3 * u), DARK);
      r.stroke(hx - hw * 0.2, shY + fh * 0.22, hx + hw * 0.6, shY + fh * 0.16, Math.max(1, u), LMID);
      if (w.chink > 0) r.disc(hx - hw * 0.2, shY + fh * 0.22, 1.5 * u, BRIGHT);
    }
    targets.push({ x: fx - fh * 0.35, y: g - fh * 1.05, w: fh * 0.7, h: fh * 1.05 });
    // the near stalks, and the cut tops sliding off and falling
    for (const st of w.near) stalk(st, 5, Math.max(1, 4 * u), FIG, true);
    for (const st of [...w.near, ...w.mid]) {
      const pc = st.piece;
      if (!pc) continue;
      pc.t += dt;
      if (pc.down > 0) { // its foot on the ground: it topples flat and lies there a moment
        pc.down += dt; pc.rot = Math.min(Math.PI / 2, pc.rot + dt * 3);
        if (pc.down > 1.5) { st.piece = null; continue; }
      } else { // it slides along the cut first, then gravity takes it
        if (pc.t > 0.25) pc.vy += grav * dt;
        pc.x += pc.vx * dt; pc.y += pc.vy * dt; pc.rot += dt * 1.1;
        if (pc.y >= g) { pc.y = g; pc.down = dt; }
      }
      r.stroke(pc.x, pc.y, pc.x - Math.sin(pc.rot) * pc.len, pc.y - Math.cos(pc.rot) * pc.len, Math.max(1, (w.near.includes(st) ? 4 : 2) * u), w.near.includes(st) ? FIG : DARK);
    }
    if (w.flash > 0) { const ca = Math.cos(w.flashA), sa = Math.sin(w.flashA); r.stroke(fx - ca * N, g - fh * 0.6 - sa * N, fx + ca * N, g - fh * 0.6 + sa * N, 2 * u, WHITE); }
    // leaves on the wind, their cut halves, the wind bands, the weather in front
    fallers(W, w.leaves, Math.round((14 + 20 * f.level) * u), N * 0.1, wind, g, 1, DARK, 'leaf');
    w.halves = particles(W, w.halves.filter((p) => p.y < g), DARK);
    w.windPh += dt * (0.5 + f.rel.trebDrive); // the bands run faster with the treble: integrated, so they never jump
    for (let k = 0, n = Math.round(8 * f.rel.trebDrive); k < n; k++) { const x = ((hash(k, 1) + w.windPh * (0.5 + hash(k, 2) * 0.5)) % 1.2 - 0.1) * N, y = (0.15 + hash(k, 3) * 0.55) * N; r.rect(x, y, (6 + 8 * hash(k, 4)) * u, 1, LMID); }
    if (w.weather === 'rain') {
      const want = Math.round((50 + 80 * f.level) * u), v = N * 1.1;
      while (w.drops.length < want) w.drops.push({ x: rnd() * N * 1.2, y: -rnd() * N });
      if (w.drops.length > want) w.drops.length = want;
      for (const d of w.drops) { d.y += v * dt; d.x += wind * N * 0.1 * dt; if (d.y > g) { burst(w.splash, rnd, d.x, g, 2, N * 0.1, LMID, 0.2); d.y = -rnd() * 0.2 * N; d.x = rnd() * N * 1.2; } r.line(d.x, d.y, d.x - wind * 0.3 * u, d.y - 3 * u, LMID); } // the streak trails the fall: up and upwind
      w.splash = particles(W, w.splash.filter((p) => p.y <= g), LMID);
    }
  },
};

// ---------------------------------------------------------------------------------------------- ninja rooftops
// Two ninja on the rooftops under a huge moon: a skyline of roofs (a town, a castle wall or a pagoda), the two
// leaping roof to roof on alternate beats along true parabolas that land on the roof line, scarves in the wind,
// stars thrown on the snare that spin along a straight line and stick in the posts (a pip each at the top), a tile
// knocked loose on a heavy landing that slides down the roof and drops off the eave. A drop is smoke bombs: the
// smoke swells and when it thins they are elsewhere, and the moon runs red for a while; a section change rebuilds
// the skyline and clears the pips.
const ROOF_W = { town: [3, 2, 1], castle: [2, 2, 2], pagoda: [1, 2, 3] };

function buildRoofs(rnd, kind) {
  const roofs = [];
  let x = -0.05;
  while (x < 1.05) {
    const wd = kind === 'castle' ? 0.3 + rnd() * 0.2 : kind === 'pagoda' ? 0.12 + rnd() * 0.08 : 0.14 + rnd() * 0.12;
    const y = kind === 'castle' ? 0.6 + rnd() * 0.06 : kind === 'pagoda' ? 0.42 + rnd() * 0.3 : 0.52 + rnd() * 0.2;
    roofs.push({ x0: x, x1: x + wd, y, post: rnd() < 0.5, tiers: kind === 'pagoda' ? 2 + Math.floor(rnd() * 2) : 0 });
    x += wd + (kind === 'castle' ? 0 : 0.03 + rnd() * 0.05);
  }
  return roofs;
}

const ninja = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), kind = rollW(rnd, ROOF_W, band), roofs = buildRoofs(rnd, kind);
    Object.assign(w, { kind, roofs, pair: [0, 1].map((i) => ({ on: Math.min(roofs.length - 1, i * 2), p: 0.5, jump: null, crouch: 0, dir: 1 })), stars: [], pips: 0, smoke: [], blood: 0, tiles: [], moonX: 0.55 + rnd() * 0.2, clouds: Array.from({ length: 3 }, () => [rnd(), 0.1 + rnd() * 0.25, 0.1 + rnd() * 0.1]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), grav = G(N), bps = bpsOf(f), wind = windOf(f), T = 1 / bps;
    const roofY = (rf, x) => rf.y * N; // flat tops; the eaves hang below
    const where = (n) => { const rf = w.roofs[n.on]; return [lerp(rf.x0, rf.x1, n.p) * N, roofY(rf)]; };
    const leap = (n) => { // to a neighbouring roof: the parabola that lands exactly on it in one beat
      const to = (n.on + (rnd() < 0.8 ? 1 : -1) + w.roofs.length) % w.roofs.length, rf = w.roofs[to], p = 0.2 + rnd() * 0.6, [x0, y0] = where(n);
      let x1 = lerp(rf.x0, rf.x1, p) * N;
      if (x1 - x0 > N / 2) x1 -= N; else if (x0 - x1 > N / 2) x1 += N;
      const y1 = roofY(rf), tt = Math.max(0.3, Math.min(1, T));
      n.jump = { x0, y0, vx: (x1 - x0) / tt, vy: (y1 - y0) / tt - (grav * tt) / 2, t: 0, tt, to, p };
      n.dir = x1 > x0 ? 1 : -1;
    };
    for (const hh of hits) {
      if (hh.kind === 'snare') { // a star from the thrower's hand toward the far side, level
        const n = w.pair[Math.floor(rnd() * 2)], [x, y] = where(n);
        w.stars.push({ x, y: y - 0.07 * N, vx: n.dir * N * (0.8 + 0.4 * hh.strength), vy: (rnd() - 0.5) * N * 0.1, a: 0, stuck: false, life: 3 });
      } else if (isLow(hh) && hh.strength > 0.7) for (const n of w.pair) if (!n.jump) { const [x, y] = where(n); w.tiles.push({ x, y, vx: n.dir * N * 0.12, vy: 0, off: false, lie: 0, rf: w.roofs[n.on] }); }
    }
    if (f.section === 'drop') { for (const n of w.pair) { const [x, y] = where(n); for (let k = 0; k < 10; k++) w.smoke.push({ x: x + (rnd() - 0.5) * 6 * u, y: y - 4 * u, vx: (rnd() - 0.5) * N * 0.15, vy: -N * (0.05 + rnd() * 0.1), r: 3 * u, life: 2 }); n.hide = 0.8; } w.blood = 8 / bps; }
    else if (f.section === 'change') { w.kind = rollW(rnd, ROOF_W, band); w.roofs = buildRoofs(rnd, w.kind); for (const n of w.pair) { n.on = Math.min(w.roofs.length - 1, n.on); n.jump = null; } w.stars.length = 0; w.tiles.length = 0; w.pips = 0; }
    w.blood -= dt;
    if (beatTick(w, f, dt)) { w.who = 1 - (w.who || 0); const n = w.pair[w.who]; if (!n.jump && !(n.hide > 0)) leap(n); } // they take the beats in turn
    // the sky: stars, the huge moon with its seas, clouds across it on the mid clock
    for (let k = 0; k < 60; k++) if (hash(k, 3) < 0.9) r.set(hash(k, 1) * N, hash(k, 2) * 0.5 * N, hash(k, 4 + Math.floor(t * 3)) < 0.85 ? MID : BRIGHT);
    const mx = w.moonX * N, my = 0.3 * N, mr = 0.26 * N, mc = w.blood > 0 ? HOT : BRIGHT;
    r.disc(mx, my, mr, mc);
    for (const [dx, dy, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.3, 0.16], [0.35, -0.35, 0.1], [-0.1, 0.45, 0.12]]) r.disc(mx + dx * mr, my + dy * mr, rr * mr, mc + DIM);
    for (const c of w.clouds) cloud(r, ((c[0] + f.rel.midClock * 0.025) % 1.4 - 0.2) * N, c[1] * N, c[2] * 2.5 * N, c[2] * 0.8 * N, DARK);
    // the roofs: a wall below, tiles in rows, the eave, a post on some; the pagoda stacks tiers
    for (const rf of w.roofs) {
      const x0 = rf.x0 * N, x1 = rf.x1 * N, y = rf.y * N, wd = x1 - x0;
      r.rect(x0 + 3 * u, y, wd - 6 * u, N - y, DARK);
      for (let k = 0; k <= rf.tiers; k++) { const ty = y + k * 0.1 * N, inset = k * 2 * u; if (k) r.rect(x0 + 3 * u + inset, ty - 2 * u, wd - 6 * u - 2 * inset, 2 * u, FIG); r.poly([[x0 - 2 * u + inset, ty + 3 * u], [x0 + 3 * u + inset, ty - u], [x1 - 3 * u - inset, ty - u], [x1 + 2 * u - inset, ty + 3 * u]], FIG); }
      for (let yy = y + 6 * u; yy < N; yy += 5 * u) r.rect(x0 + 3 * u, yy, wd - 6 * u, Math.max(1, u * 0.6), DARK + DIM);
      if (w.kind === 'castle') for (let x = x0 + 3 * u; x < x1 - 6 * u; x += 6 * u) r.rect(x, y - 4 * u, 3 * u, 4 * u, FIG);
      if (rf.post) r.rect((x0 + x1) / 2 - u, y - 0.1 * N, 2 * u, 0.1 * N, FIG);
      for (let x = x0 + 6 * u; x < x1 - 6 * u; x += 8 * u) if (hash(Math.round(x), Math.round(y)) < 0.3) r.rect(x, y + 8 * u, 3 * u, 3 * u, HOT + DIM); // a lit window
    }
    // the two: in flight along their parabola, or crouched on the roof line; a scarf in the wind
    for (const n of w.pair) {
      let x, y, air = false;
      if (n.hide > 0) { n.hide -= dt; if (n.hide <= 0) { n.on = Math.floor(rnd() * w.roofs.length); n.p = 0.2 + rnd() * 0.6; } continue; }
      if (n.jump) {
        const J = n.jump;
        J.t += dt;
        x = J.x0 + J.vx * J.t; y = J.y0 + J.vy * J.t + grav * J.t * J.t * 0.5; air = true;
        if (J.t >= J.tt) { n.on = J.to; n.p = J.p; n.jump = null; n.crouch = 1; [x, y] = where(n); air = false; }
      } else { [x, y] = where(n); n.crouch *= Math.exp(-dt * 5); }
      const h = 0.12 * N, px = ((x % N) + N) % N, cr = air ? 0.3 : 0.5 * n.crouch, dir = n.dir;
      if (!air) r.rect(px - h * 0.25, y, h * 0.5, Math.max(1, u), BLACK);
      const hh = h * (1 - 0.35 * cr), bodyTop = y - hh;
      if (air) { r.stroke(px - dir * h * 0.1, y - hh * 0.4, px + dir * h * 0.25, y - hh * 0.05, Math.max(1, 1.5 * u), FIG); r.stroke(px - dir * h * 0.1, y - hh * 0.4, px - dir * h * 0.3, y - hh * 0.15, Math.max(1, 1.5 * u), FIG); }
      else for (const k of [-1, 1]) r.stroke(px + k * h * 0.08, y - hh * 0.35, px + k * h * (0.1 + 0.2 * cr), y, Math.max(1, 1.5 * u), FIG);
      r.rect(px - h * 0.12, bodyTop + hh * 0.22, h * 0.24, hh * 0.45, FIG);
      r.disc(px, bodyTop + hh * 0.13, h * 0.12, FIG);
      r.rect(px - h * 0.1 + (dir > 0 ? h * 0.05 : 0), bodyTop + hh * 0.1, h * 0.15, Math.max(1, u), LMID); // the eyes' slit
      r.stroke(px + dir * h * 0.12, bodyTop + hh * 0.3, px + dir * h * (air ? 0.35 : 0.25), bodyTop + hh * (air ? 0.1 : 0.5), Math.max(1, 1.2 * u), FIG);
      const sl = h * (0.3 + 0.3 * Math.min(1, wind) + (air ? 0.2 : 0)), sd = air ? -dir : wind > 0.5 ? 1 : -1;
      r.stroke(px, bodyTop + hh * 0.2, px + sd * sl, bodyTop + hh * 0.2 - sl * 0.25 + Math.sin(t * 9 + n.dir) * 1.5 * u, Math.max(1, 1.3 * u), HOT);
      targets.push({ x: px - h * 0.3, y: y - h * 1.1, w: h * 0.6, h: h * 1.1 });
    }
    // the stars: straight flight, spinning; those that reach a post stick in it, the rest fly off
    w.stars = w.stars.filter((st) => {
      if (!st.stuck) {
        st.x += st.vx * dt; st.y += st.vy * dt; st.a += dt * 30;
        for (const rf of w.roofs) if (rf.post && Math.abs(st.x - ((rf.x0 + rf.x1) / 2) * N) < 1.5 * u && st.y > rf.y * N - 0.1 * N && st.y < rf.y * N) { st.stuck = true; w.pips = Math.min(12, w.pips + 1); }
      } else st.life -= dt;
      const q = 2 * u;
      for (const d of [0, Math.PI / 2]) r.line(st.x + Math.cos(st.a + d) * q, st.y + Math.sin(st.a + d) * q, st.x - Math.cos(st.a + d) * q, st.y - Math.sin(st.a + d) * q, BRIGHT);
      return st.x > -0.1 * N && st.x < 1.1 * N && st.y > -0.1 * N && st.y < N && st.life > 0;
    });
    // a tile loosened by a landing: it slides along the roof, then drops off the edge
    w.tiles = w.tiles.filter((tl) => {
      if (!tl.off) { // on the roof: it slides, friction slowing it; past the eave it drops, else it comes to rest and is left
        tl.x += tl.vx * dt; tl.vx *= Math.exp(-dt * 0.5);
        if (tl.x < tl.rf.x0 * N || tl.x > tl.rf.x1 * N) tl.off = true;
        else if (Math.abs(tl.vx) < N * 0.01 && (tl.lie += dt) > 1) return false;
      } else { tl.vy += grav * dt; tl.y += tl.vy * dt; tl.x += tl.vx * dt; }
      r.rect(tl.x - u, tl.y - u, 2 * u, Math.max(1, u), LMID);
      return tl.y < N;
    });
    w.smoke = w.smoke.filter((p) => { p.vx *= Math.exp(-dt * 1.5); p.vy = follow(p.vy, -N * 0.02, dt, 0.8); p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 6 * u; p.life -= dt; r.disc(p.x, p.y, p.r * Math.min(1, p.life * 1.5), p.life > 1.2 ? LMID : MID + DIM); return p.life > 0; });
    for (let k = 0; k < w.pips; k++) { const px = 0.04 * N + k * 3 * u, py = 0.05 * N; r.line(px - u, py - u, px + u, py + u, BRIGHT); r.line(px - u, py + u, px + u, py - u, BRIGHT); }
  },
};

// ---------------------------------------------------------------------------------------------- afternoon classroom
// A classroom in the afternoon, looking down the rows: windows on the left wall throwing bands of light across the
// floor that slide with the sun (the mid clock), curtains lifting in the wind (the treble), dust turning in the
// beams, desks in perspective rows and one silhouette at a desk nodding off: the head sinks through each beat and
// snaps up on the next. A kick rattles the panes and gusts the curtains; a snare is a bird's shadow across the
// floor; a tonal hit ticks the clock. A section change moves the clock on and turns the light orange; a drop is a
// cat jumping up onto the windowsill, where it sits until the hour changes.
const PERIOD_W = { noon: [1, 2, 3], afternoon: [3, 2, 2], evening: [2, 2, 1] };
const PERIODS = ['noon', 'afternoon', 'evening'];
const WINS = [[1.3, 2.2], [2.6, 3.6], [4.1, 5.4]]; // the windows along the left wall, in depth

const classroom = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { period: rollW(rnd, PERIOD_W, band), hour: Math.floor(rnd() * 12), tick: 0, gust: 0, motes: [], bird: null, cat: null, rattle: 0, deskRows: [1.7, 2.5, 3.6, 5.2], seat: 1 + Math.floor(rnd() * 2) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, hz = 0.42 * N, F = 0.5 * N, wind = windOf(f) + w.gust, evening = w.period === 'evening';
    const proj = (X, Y, d) => [0.5 * N + (X * F) / d, hz + ((1 - Y) * F) / d]; // X across (eye at 0), Y up from the floor (eye at 1), d away
    for (const hh of hits) {
      if (isLow(hh)) { w.gust = Math.max(w.gust, 0.6 * hh.strength); w.rattle = 0.1; s.shake = Math.max(s.shake, 0.08 * hh.strength); }
      else if (hh.kind === 'snare') w.bird = { d: 1.2 + rnd() * 2, X: -1.2, v: 2 + rnd() };
      else if (hh.kind === 'hat') for (let k = 0; k < 5; k++) w.motes.push({ X: -1.1 + rnd() * 1.6, Y: rnd() * 1.6, d: 1.2 + rnd() * 3.5, vy: 0.05 + rnd() * 0.1, ph: rnd() * TAU, life: 3 + rnd() * 3 });
      else if (isTonal(hh)) w.tick = 1;
    }
    if (f.section === 'drop' && !w.cat) w.cat = { Y: -0.6, vy: 0, d: 2.2, phase: 'up', t: 0 };
    else if (f.section === 'change') { w.period = PERIODS[(PERIODS.indexOf(w.period) + 1) % 3]; w.hour = (w.hour + 1) % 12; if (w.cat) w.cat.phase = 'down'; }
    w.gust *= Math.exp(-dt * 2.5); w.rattle -= dt; w.tick *= Math.exp(-dt * 6);
    // the room: the far wall with the board and the clock, the floor, the left wall with its windows
    const lightCol = evening ? HOT : w.period === 'noon' ? BRIGHT : LMID, skyCol = evening ? HOT + DIM : COOL;
    r.rect(0, 0, N, hz + F / 6, MID + DIM);
    r.rect(0, hz + F / 6, N, N, MID);
    const [bx0, by0] = proj(-0.6, 1.9, 6), [bx1, by1] = proj(0.6, 0.9, 6);
    r.rect(bx0, by0, bx1 - bx0, by1 - by0, DARK + DIM);
    r.frame(Math.round(bx0 - u), Math.round(by0 - u), Math.round(bx1 - bx0 + 2 * u), Math.round(by1 - by0 + 2 * u), LMID + DIM);
    const [cx, cy] = proj(0.85, 2.1, 6), cr = 0.025 * N;
    r.disc(cx, cy, cr, BRIGHT);
    r.ring(cx, cy, cr, Math.max(1, u * 0.7), DARK);
    const ha = -Math.PI / 2 + (w.hour / 12) * TAU, ma = -Math.PI / 2 + ((f.rel.midClock * 0.05) % 1) * TAU;
    r.line(cx, cy, cx + Math.cos(ha) * cr * 0.5, cy + Math.sin(ha) * cr * 0.5, DARK);
    r.line(cx, cy, cx + Math.cos(ma) * cr * 0.8, cy + Math.sin(ma) * cr * 0.8, DARK);
    if (w.tick > 0.3) r.set(cx + Math.cos(ma + 0.3) * cr * 0.85, cy + Math.sin(ma + 0.3) * cr * 0.85, HOT);
    r.poly([proj(-1.1, 0, 1), proj(-1.1, 0, 6), proj(-1.1, 2.4, 6), proj(-1.1, 2.4, 1)], DARK + DIM); // the left wall
    r.poly([proj(1.1, 0, 1), proj(1.1, 0, 6), proj(1.1, 2.4, 6), proj(1.1, 2.4, 1)], DARK + DIM); // the right wall: its floor line converges on the same point
    r.poly([proj(-1.1, 2.4, 1), proj(1.1, 2.4, 1), proj(1.1, 2.4, 6), proj(-1.1, 2.4, 6)], LMID + DIM); // the ceiling
    // the sun: per unit of height a ray travels `kx` into the room and `kd` down the row; low in the evening, so it
    // reaches further, and swinging slowly with the mid clock. The light on the floor is the window projected along it
    const reach = evening ? 2.6 : w.period === 'noon' ? 0.9 : 1.6, kx = reach / 2.1, kd = (0.35 * reach + 0.75 + 0.75 * Math.sin(f.rel.midClock * 0.2)) / 2.1;
    const onFloor = (Y, d) => proj(Math.min(1.05, -1.1 + Y * kx), 0, d + Y * kd);
    const inBeam = (X, Y, d) => { // back up the ray from a point in the room to the window wall: does it pass through a pane?
      if (X < -1.1) return false;
      const dy = (X + 1.1) / kx, Yw = Y + dy, dw = d - dy * kd;
      if (Yw < 0.8 || Yw > 2.1) return false;
      for (const [d0, d1] of WINS) if (dw >= d0 && dw <= d1) return true;
      return false;
    };
    for (const [d0, d1] of WINS) { // a window: the sky through it, a frame, the sill
      const jit = w.rattle > 0 ? (rnd() - 0.5) * u : 0;
      r.poly([proj(-1.1, 0.8, d0), proj(-1.1, 0.8, d1), proj(-1.1, 2.1, d1), proj(-1.1, 2.1, d0)].map(([x, y]) => [x + jit, y]), skyCol);
      const [mx, my0] = proj(-1.1, 2.1, (d0 + d1) / 2), [, my1] = proj(-1.1, 0.8, (d0 + d1) / 2);
      r.rect(mx - u * 0.5, my0, Math.max(1, u), my1 - my0, DARK);
      r.poly([proj(-1.1, 0.8, d0), proj(-1.1, 0.8, d1), proj(-1.0, 0.78, d1), proj(-1.0, 0.78, d0)], LMID + DIM);
      r.poly([onFloor(0.8, d0), onFloor(0.8, d1), onFloor(2.1, d1), onFloor(2.1, d0)], lightCol); // its light on the floor, off the wall by the sill's height
      // the curtain: hanging from the top, its free edge lifted by the wind
      const lift = clamp(wind) * 0.5, [c0x, c0y] = proj(-1.1, 2.1, d0), [c1x] = proj(-1.1, 2.1, d0 + 0.3), [e0x, e0y] = proj(-1.1 + lift * 0.6, 0.9 + lift * 0.9, d0 + 0.1), [e1x, e1y] = proj(-1.1 + lift * 0.7, 0.85 + lift, d0 + 0.45 + Math.sin(f.rel.trebClock * 4) * 0.08 * lift);
      r.poly([[c0x, c0y], [c1x, c0y], [e1x, e1y], [e0x, e0y]], BRIGHT);
    }
    if (w.bird) { // its shadow runs across the floor, fast
      const B = w.bird; B.X += B.v * dt;
      const [sx, sy] = proj(B.X, 0, B.d), sw = (0.05 * N) / B.d;
      r.rect(sx - sw, sy - sw * 0.2, sw * 2, Math.max(1, sw * 0.4), DARK);
      if (B.X > 1.4) w.bird = null;
    }
    // the desks, far to near; the one nodding off sits behind a desk in the second row
    for (let i = w.deskRows.length - 1; i >= 0; i--) {
      const d = w.deskRows[i];
      for (let c = -1; c <= 1; c++) {
        const X = c * 0.75;
        if (i === 1 && c === w.seat - 1) { // the sleeper: the head sinks through the beat and snaps up on it
          const sink = beatLocked(f) ? ease(f.beat.phase) : (1 + Math.sin(t * 2)) / 2, [hx, hy] = proj(X, 0.95, d + 0.6), hr = (0.07 * N) / (d + 0.6), drop = sink * hr * 1.6;
          r.rect(hx - hr * 1.7, hy + hr * 0.6, hr * 3.4, hr * 2.5, FIG);
          r.disc(hx + sink * hr * 0.4, hy + drop, hr, FIG);
          r.poly([[hx - hr * 0.9 + sink * hr * 0.4, hy + drop - hr * 0.4], [hx + hr * 0.9 + sink * hr * 0.4, hy + drop - hr * 0.4], [hx + sink * hr * 0.4, hy + drop - hr * 1.5]], FIG);
          targets.push({ x: hx - hr * 1.8, y: hy - hr * 1.5, w: hr * 3.6, h: hr * 4.5 });
        }
        const [ax, ay] = proj(X - 0.25, 0.45, d), [bx, by] = proj(X + 0.25, 0.45, d), [cxx, cyy] = proj(X + 0.25, 0.45, d + 0.35), [dx, dy] = proj(X - 0.25, 0.45, d + 0.35), [, fy] = proj(X, 0, d);
        r.rect(ax, ay, bx - ax, fy - ay, DARK);
        r.poly([[ax, ay], [bx, by], [cxx, cyy], [dx, dy]], LMID + DIM);
        for (const lx of [ax + u, bx - 2 * u]) r.rect(lx, ay, Math.max(1, u), fy - ay, DARK + DIM);
      }
    }
    // the cat: up onto the sill on a parabola, sitting with its tail swinging on the beat, down again at the hour
    if (w.cat) {
      const C = w.cat, [sx, sy] = proj(-1.0, 0.78, C.d), sc = (0.1 * N) / C.d;
      if (C.phase === 'up') { if (C.t === 0) C.vy = Math.sqrt(2 * 1.6 * (0.78 - C.Y + 0.15)); C.t += dt; C.vy -= 1.6 * dt; C.Y += C.vy * dt; if (C.vy < 0 && C.Y <= 0.78) { C.Y = 0.78; C.vy = 0; C.phase = 'sit'; } }
      else if (C.phase === 'down') { C.vy -= 1.6 * dt; C.Y += C.vy * dt; if (C.Y < -0.5) w.cat = null; }
      if (w.cat) {
        const [, yy] = proj(-1.0, C.Y, C.d), cx2 = sx + sc * 0.4;
        r.disc(cx2, yy - sc * 0.5, sc * 0.5, FIG);
        r.rect(cx2 - sc * 0.5, yy - sc * 0.6, sc, sc * 0.6, FIG);
        r.disc(cx2 - sc * 0.4, yy - sc * 1.1, sc * 0.32, FIG);
        for (const k of [-1, 1]) r.poly([[cx2 - sc * 0.4 + k * sc * 0.28, yy - sc * 1.25], [cx2 - sc * 0.4 + k * sc * 0.1, yy - sc * 1.3], [cx2 - sc * 0.4 + k * sc * 0.25, yy - sc * 1.6]], FIG);
        const ta = (C.phase === 'sit' ? 0.6 * Math.sin(f.beat.phase * TAU) : 0.8), tx = cx2 + sc * 0.5;
        r.stroke(tx, yy - sc * 0.4, tx + Math.cos(ta) * sc * 0.8, yy - sc * 0.4 - Math.sin(ta) * sc * 0.6, Math.max(1, u), FIG);
        targets.push({ x: cx2 - sc, y: yy - sc * 1.6, w: sc * 2, h: sc * 1.6 });
      }
    }
    // the dust: slow motes turning up through the room, seen only where a beam crosses them
    w.motes = w.motes.filter((m) => {
      m.Y += m.vy * dt; m.X += Math.sin(t * 0.7 + m.ph) * 0.05 * dt; m.life -= dt;
      if (inBeam(m.X, m.Y, m.d)) { const [x, y] = proj(m.X, m.Y, m.d); r.set(x, y, BRIGHT); }
      return m.life > 0 && m.Y < 2.3;
    }).slice(-120);
    if (w.motes.length < 20 + 40 * f.level) w.motes.push({ X: -1.1 + rnd() * 1.6, Y: rnd() * 1.6, d: 1.2 + rnd() * 3.5, vy: 0.04 + rnd() * 0.08, ph: rnd() * TAU, life: 3 + rnd() * 4 });
  },
};

// ---------------------------------------------------------------------------------------------- mech against the creature
// A giant mech and a creature (a serpent, a bug or a titan) on the city horizon, far silhouettes with the buildings
// in front of their feet, searchlights sweeping the sky on the mid clock. The mech punches on the kicks, the
// creature swings on the snares, each blow sparking where it lands and the one struck rocking back; buildings under
// the fight crumble into debris that falls; the city fires tracers on the notes. A drop is the beam clash: both
// beams meet between them in a sphere that swells for two bars and bursts. A section change changes the creature
// and rebuilds the district.
const CREATURE_W = { bug: [3, 2, 1], serpent: [2, 2, 2], titan: [1, 2, 3] };
const CREATURES = { bug: { H: 0.5, mouth: 0.42 }, serpent: { H: 0.9, mouth: 0.85 }, titan: { H: 1, mouth: 0.9 } };

// the creature at x with its feet on g, facing left, `ext` 0..1 how far into its swing; returns the mouth
function drawCreature(r, kind, x, g, H, u, ext, sway, col, pulse) {
  if (kind === 'bug') {
    const tilt = ext * H * 0.1;
    for (let k = 0; k < 6; k++) { const lx = x - H * 0.3 + k * H * 0.12, side = k % 2 ? 1 : -1, lift = Math.max(0, Math.sin(sway * 3 + k * 2.1)) * 2 * u; r.stroke(lx, g - H * 0.25 - (k < 3 ? tilt : 0), lx + side * H * 0.1, g - H * 0.35, 1.5 * u, col); r.stroke(lx + side * H * 0.1, g - H * 0.35, lx + side * H * 0.16, g - lift, 1.5 * u, col); }
    r.ring(x, g - H * 0.32 - tilt * 0.5, H * 0.28, H * 0.5, col, 0.55);
    r.rect(x - H * 0.3, g - H * 0.55 - tilt * 0.5, H * 0.6, Math.max(1, u), LMID + DIM);
    const gape = 0.3 + 0.7 * ext;
    r.stroke(x - H * 0.5, g - H * 0.3 - tilt, x - H * 0.75, g - H * (0.38 + 0.12 * gape) - tilt, 2.5 * u, col);
    r.stroke(x - H * 0.5, g - H * 0.26 - tilt, x - H * 0.73, g - H * (0.2 - 0.08 * gape) - tilt, 2.5 * u, col);
    r.rect(x - H * 0.46, g - H * 0.42 - tilt, 2.5 * u, 2.5 * u, pulse ? BRIGHT : HOT);
    return [x - H * 0.6, g - H * 0.3 - tilt];
  }
  if (kind === 'serpent') {
    let cx = x, cy = g;
    r.ring(x + H * 0.05, g - H * 0.04, H * 0.22, H * 0.08, col, 0.35);
    for (let i = 0; i < 12; i++) { const q = i / 11; cy = g - H * 0.9 * q; cx = x + Math.sin(q * 4 + sway) * H * 0.1 - ext * q * q * H * 0.4; r.disc(cx, cy, H * (0.1 - q * 0.03), col); }
    r.poly([[cx - H * 0.3, cy + H * 0.02], [cx + H * 0.12, cy + H * 0.03], [cx + H * 0.1, cy - H * 0.14], [cx - H * 0.1, cy - H * 0.15]], col);
    r.poly([[cx - H * 0.05, cy - H * 0.12], [cx - H * 0.1, cy - H * 0.3 - ext * H * 0.05], [cx + H * 0.12, cy - H * 0.1]], col);
    r.rect(cx - H * 0.14, cy - H * 0.06, 2.5 * u, 2.5 * u, pulse ? BRIGHT : HOT);
    return [cx - H * 0.3, cy + H * 0.02];
  }
  const lean = ext * H * 0.08;
  for (const k of [-0.2, 0.06]) r.rect(x + k * H, g - H * 0.45, H * 0.14, H * 0.45, col);
  r.poly([[x - H * 0.3 - lean, g - H * 0.88], [x + H * 0.3 - lean, g - H * 0.88], [x + H * 0.2, g - H * 0.42], [x - H * 0.2, g - H * 0.42]], col);
  const aa = lerp(-2.2, -0.2, ext), ax = x - H * 0.25 - lean, ay = g - H * 0.82;
  r.stroke(ax, ay, ax + Math.cos(aa) * H * 0.45, ay + Math.sin(aa) * H * 0.45, 4 * u, col);
  r.stroke(x + H * 0.25 - lean, ay, x + H * 0.38, g - H * 0.5, 4 * u, col);
  r.rect(x - H * 0.12 - lean, g - H * 1.02, H * 0.24, H * 0.16, col);
  for (const k of [-1, 1]) r.poly([[x + k * H * 0.1 - lean, g - H * 1.02], [x + k * H * 0.2 - lean, g - H * 1.22], [x + k * H * 0.02 - lean, g - H * 1.0]], col);
  r.rect(x - H * 0.1 - lean, g - H * 0.96, H * 0.08, 2 * u, pulse ? BRIGHT : HOT);
  return [x - H * 0.12 - lean, g - H * 0.93];
}

const mechabattle = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { creature: rollW(rnd, CREATURE_W, band), punch: 0, swing: 0, clash: 0, clashX: 0.5, sphere: 0, debris: [], sparks: [], tracers: [], mechKick: 0, creKick: 0, eyes: 0, crumbleT: 0,
      city: Array.from({ length: 16 }, (_, i) => ({ x: i * 0.065 - 0.02 + rnd() * 0.01, w: 0.04 + rnd() * 0.025, h: 0.1 + rnd() * 0.14, hp: 1 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = 0.84 * N, grav = G(N), H = 0.56 * N, C = CREATURES[w.creature], CH = C.H * H, bps = bpsOf(f);
    const mx = 0.3 * N + w.mechKick * N, cxr = 0.72 * N + w.creKick * N, gc = g + 3 * u; // the city is nearer than the giants: its feet a little lower
    const crush = (b, dmg) => { if (b.hp <= 0.2) return; b.hp = Math.max(0.2, b.hp - dmg); for (let k = 0; k < 5; k++) w.debris.push({ x: (b.x + rnd() * b.w) * N, y: gc - b.h * b.hp * N, vx: (rnd() - 0.5) * N * 0.3, vy: -rnd() * N * 0.25, life: 1.5, c: k % 2 ? DARK : LMID + DIM }); };
    for (const hh of hits) {
      if (isLow(hh)) { w.punch = 1; w.punchHit = false; w.eyes = 0.15; }
      else if (hh.kind === 'snare') { w.swing = 1; w.swingHit = false; }
      else if (isTonal(hh)) { const b = pick(rnd, w.city); w.tracers.push({ x: (b.x + b.w / 2) * N, y: gc - b.h * b.hp * N, vx: (cxr - (b.x + b.w / 2) * N) * 0.9, vy: -N * 1.1, c: PC_COL[hh.pc] }); }
    }
    if (f.section === 'drop') { w.clash = 8 / bps; w.sphere = 0; w.clashX = 0.5; }
    else if (f.section === 'change') { w.creature = rollW(rnd, CREATURE_W, band); for (const b of w.city) b.hp = 1; }
    w.punch = Math.max(0, w.punch - dt * 3.2); w.swing = Math.max(0, w.swing - dt * 2.4); w.eyes -= dt;
    w.mechKick = follow(w.mechKick, 0, dt, 0.4); w.creKick = follow(w.creKick, 0, dt, 0.4);
    const pext = Math.sin(Math.PI * (1 - w.punch)) * (w.punch > 0 ? 1 : 0), sext = Math.sin(Math.PI * (1 - w.swing)) * (w.swing > 0 ? 1 : 0);
    // the sky, its glow over the city, the searchlights
    skyBands(r, N, g, [BG, BG, DARK + DIM, DARK, MID + DIM]);
    for (let k = 0; k < 3; k++) { const sx = (0.15 + k * 0.35) * N, a = -Math.PI / 2 + 0.55 * Math.sin(f.rel.midClock * 0.6 + k * 2.1) + (f.beat.on ? 0.03 : 0); r.poly([[sx - 2 * u, g], [sx + 2 * u, g], [sx + Math.cos(a) * 1.4 * N + 0.05 * N, g + Math.sin(a) * 1.4 * N], [sx + Math.cos(a) * 1.4 * N - 0.05 * N, g + Math.sin(a) * 1.4 * N]], LMID + DIM); }
    // the creature, swinging on the snare; the mech, punching on the kick; the blows land where they reach
    const pulse = f.beat.pulse > 0.5, [mouthX, mouthY] = drawCreature(r, w.creature, cxr, g, CH, u, sext, f.rel.bassClock, FIG, pulse);
    const J = drawMech(r, 'bulky', mx - pext * H * 0.06, g, H, u, 0, w.eyes, 0, false), shY = g - H * 0.74, fistX = mx + H * 0.3 + pext * H * 0.55, fistY = shY + H * 0.02;
    r.stroke(mx + H * 0.26, shY, fistX, fistY, 5 * u, FIG);
    r.disc(fistX, fistY, 3.5 * u, FIG);
    if (pext > 0.9 && !w.punchHit) { w.punchHit = true; burst(w.sparks, rnd, fistX + 3 * u, fistY, 18, N * 0.5, BRIGHT, 0.5); w.creKick = 0.03; s.shake = Math.max(s.shake, 0.5); for (const b of w.city) if (Math.abs((b.x + b.w / 2) * N - fistX) < 0.1 * N) crush(b, 0.3); }
    if (sext > 0.9 && !w.swingHit) { w.swingHit = true; burst(w.sparks, rnd, mx + H * 0.2, g - H * 0.75, 18, N * 0.5, HOT, 0.5); w.mechKick = -0.03; s.shake = Math.max(s.shake, 0.5); for (const b of w.city) if (Math.abs((b.x + b.w / 2) * N - cxr) < 0.25 * N) crush(b, 0.25); }
    if (w.clash > 0) { // the beams meet where the bass and the treble push the point; the sphere swells and bursts
      w.clash -= dt;
      w.clashX = clamp(w.clashX + (f.rel.bassDrive - f.rel.trebDrive) * 0.08 * dt, 0.38, 0.62);
      w.sphere = Math.min(0.2 * N, w.sphere + dt * 0.05 * N);
      const kx = w.clashX * N, ky = (shY + mouthY) / 2, jit = () => (rnd() - 0.5) * 2 * u;
      r.stroke(mx, shY + H * 0.08, kx, ky + jit(), 4 * u, COOL); r.stroke(mx, shY + H * 0.08, kx, ky, 1.5 * u, BRIGHT);
      r.stroke(mouthX, mouthY, kx, ky + jit(), 4 * u, HOT); r.stroke(mouthX, mouthY, kx, ky, 1.5 * u, BRIGHT);
      r.disc(kx, ky, w.sphere * (0.9 + 0.1 * rnd()), BRIGHT);
      r.ring(kx, ky, w.sphere, Math.max(1, 1.5 * u), f.beat.pulse > 0.5 ? HOT : COOL);
      s.shake = Math.max(s.shake, 0.45);
      if ((w.crumbleT += dt) > 0.2) { w.crumbleT = 0; for (const b of w.city) if (Math.abs((b.x + b.w / 2) * N - kx) < 0.15 * N) crush(b, 0.15); }
      if (w.clash <= 0) { burst(w.sparks, rnd, kx, ky, 60, N * 0.8, BRIGHT, 0.8); burst(w.sparks, rnd, kx, ky, 30, N * 0.5, HOT, 0.8); s.shake = Math.max(s.shake, 1); r.fill(WHITE); }
    }
    // the tracers from the roofs: up on an arc at the creature, bursting on it or falling back
    w.tracers = w.tracers.filter((p) => {
      p.vy += grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      r.line(p.x, p.y, p.x - p.vx * 0.03, p.y - p.vy * 0.03, p.c);
      if (Math.abs(p.x - cxr) < CH * 0.3 && p.y > g - CH && p.y < g) { burst(w.sparks, rnd, p.x, p.y, 6, N * 0.2, p.c, 0.3); return false; }
      return p.y < gc;
    });
    // the ground, then the city in front of their feet, crumbling where the fight is; the debris falls to the ground
    r.rect(0, g, N, N - g, DARK + DIM);
    r.rect(0, g, N, Math.max(1, u), MID);
    for (const b of w.city) {
      const bh = b.h * b.hp * N;
      r.rect(b.x * N, gc - bh, b.w * N, bh, DARK);
      for (let y = gc - bh + 2 * u; y < gc - 2 * u; y += 3 * u) for (let x = b.x * N + 1.5 * u; x < (b.x + b.w) * N - u; x += 2.5 * u) if (hash(Math.round(x), Math.round(y) + Math.floor(f.level * 3)) < 0.35) r.rect(x, y, Math.max(1, u), Math.max(1, u), LMID);
    }
    w.debris = particles(W, w.debris.filter((p) => p.y < gc), DARK);
    w.sparks = particles(W, w.sparks.filter((p) => p.y < g), BRIGHT);
    targets.push({ x: mx - J.half, y: J.top, w: J.half * 2, h: g - J.top });
    targets.push({ x: cxr - CH * 0.5, y: g - CH, w: CH, h: CH });
  },
};

// ---------------------------------------------------------------------------------------------- night train window
// A night train window from the seat: the frame and the sill, the city sliding past outside in three layers (far
// towers with pinpoint windows, blocks with lit grids and sign blocks, poles and hoardings flicking by), raindrops
// on the glass streaking back along the airflow, faster the faster the train runs (the level and the bass), the
// passenger's reflection ghosted in the glass. A kick jolts the car, a snare flashes a sign, the notes colour the
// signs, hats put more drops on the pane. A drop is a tunnel: darkness and its lamps strobing past, the reflection
// strong in the black glass; a section change is a station sliding by, the train slowing for it.
const RAIL_W = { rain: [3, 2, 2], clear: [2, 2, 1], snow: [1, 2, 2] };

const trainwindow = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    const blocks = (n, hmin, hmax) => Array.from({ length: n }, (_, i) => ({ x: i / n + rnd() * 0.04, w: 0.04 + rnd() * 0.07, h: hmin + rnd() * (hmax - hmin), sign: rnd() < 0.35, pc: Math.floor(rnd() * 12), seed: Math.floor(rnd() * 1000) }));
    Object.assign(w, { weather: rollW(rnd, RAIL_W, band), speed: 0.5, far: blocks(14, 0.12, 0.4), mid: blocks(9, 0.08, 0.28), hoard: blocks(4, 0.1, 0.16), drops: [], flakes: [], tunnel: 0, station: null, jolt: 0, farX: 0, midX: 0, nearX: 0, flash: 0, flashI: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), wx0 = 0.08 * N, wx1 = 0.92 * N, wy0 = 0.1 * N, wy1 = 0.7 * N, hzO = 0.58 * N, bps = bpsOf(f);
    for (const hh of hits) {
      if (isLow(hh)) { w.jolt = 1; s.shake = Math.max(s.shake, 0.1 * hh.strength); for (const d of w.drops) d.vx -= N * 0.08 * hh.strength; }
      else if (hh.kind === 'snare') { w.flash = 0.15; w.flashI = Math.floor(rnd() * w.mid.length); }
      else if (hh.kind === 'hat') for (let k = 0; k < 3; k++) w.drops.push({ x: wx0 + rnd() * (wx1 - wx0), y: wy0 + rnd() * (wy1 - wy0) * 0.6, vx: 0, vy: 0 });
      if (isTonal(hh)) pick(rnd, w.mid).pc = hh.pc;
    }
    if (f.section === 'drop') { w.tunnel = 8 / bps; s.shake = Math.max(s.shake, 0.3); }
    else if (f.section === 'change') { w.weather = rollW(rnd, RAIL_W, band); w.station = { x: 1.3, len: 1.7 }; }
    w.tunnel -= dt; w.flash -= dt;
    const inStation = w.station && w.station.x < 1.2 && w.station.x + w.station.len > -0.2;
    w.speed = follow(w.speed, (0.35 + 0.5 * f.level + 0.4 * f.rel.bassDrive) * (inStation ? 0.35 : 1), dt, 1.2);
    const jy = w.jolt > 0.5 ? -u : 0;
    w.jolt *= Math.exp(-dt * 12);
    w.farX = (w.farX - w.speed * 0.05 * dt + 2) % 1; w.midX = (w.midX - w.speed * 0.22 * dt + 2) % 1; w.nearX = (w.nearX - w.speed * 0.9 * dt + 2) % 1;
    if (w.station) { w.station.x -= w.speed * 0.9 * dt; if (w.station.x + w.station.len < -0.3) w.station = null; }
    // outside: the sky glow, the far towers, the blocks with their windows and signs, the ground and the near poles
    skyBands(r, N, hzO, [BG, BG, DARK + DIM, DARK]);
    const draw = (b, off, cols, lit, sz) => {
      const x = ((b.x + off) % 1.1 - 0.05) * N, bw = b.w * N * sz, bh = b.h * N * sz;
      r.rect(x, hzO - bh, bw, bh, cols);
      for (let y = hzO - bh + 2 * u; y < hzO - u; y += 3 * u * sz) for (let xx = x + u; xx < x + bw - u; xx += 2.5 * u * sz) if (hash(b.seed + Math.round(xx - x), Math.round(y) + f.beat.count) < 0.4) r.rect(xx, y, Math.max(1, u * sz), Math.max(1, u * sz), lit);
      return [x, bw, bh];
    };
    for (const b of w.far) draw(b, w.farX, DARK + DIM, LMID + DIM, 0.8);
    r.rect(0, hzO - 2 * u, N, 2 * u, DARK + DIM);
    w.mid.forEach((b, i) => { const [x, bw, bh] = draw(b, w.midX, DARK, LMID, 1); if (b.sign) r.rect(x + bw * 0.2, hzO - bh - 5 * u, bw * 0.6, 4 * u, w.flash > 0 && i === w.flashI ? BRIGHT : f.beat.pulse > 0.6 && i % 3 === 0 ? BRIGHT : PC_COL[b.pc]); });
    r.rect(0, hzO, N, N - hzO, DARK);
    r.rect(0, hzO + 3 * u, N, Math.max(1, u), MID + DIM);
    for (const b of w.hoard) { const x = ((b.x + w.nearX) % 1.1 - 0.05) * N; r.rect(x, hzO - b.h * N * 1.6, b.w * N * 1.3, b.h * N * 1.6, w.flash > 0.1 ? MID : DARK + DIM); }
    for (let k = 0; k < 4; k++) { const x = (((k / 4 + w.nearX) % 1) * 1.2 - 0.1) * N; r.rect(x, 0, 2 * u, hzO + 3 * u, BLACK); r.rect(x - 4 * u, 0.12 * N, 10 * u, Math.max(1, u), BLACK); }
    if (w.station) { // the platform: its lit edge, pillars, the roof and its lamps, a few waiting under them
      const sx = w.station.x * N, sl = w.station.len * N, py = hzO - 4 * u;
      r.rect(sx, py, sl, N - py, MID + DIM);
      r.rect(sx, py, sl, Math.max(1, u), BRIGHT);
      r.rect(sx, 0.2 * N, sl, 3 * u, DARK);
      for (let x = sx + 0.05 * N; x < sx + sl; x += 0.2 * N) { r.rect(x, 0.2 * N, 2 * u, py - 0.2 * N, DARK); r.disc(x + 0.08 * N, 0.2 * N + 5 * u, 1.5 * u, BRIGHT); r.poly([[x + 0.06 * N, 0.2 * N + 6 * u], [x + 0.1 * N, 0.2 * N + 6 * u], [x + 0.14 * N, py], [x + 0.02 * N, py]], LMID + DIM); if (hash(Math.round(x / u), 9) < 0.5) walker(r, x + 0.1 * N, py, 0.12 * N, FIG, 0, -1, { coat: true }); }
    }
    if (w.weather === 'snow') { // flakes outside, carried back by the run and drifting down
      while (w.flakes.length < 80 * u) w.flakes.push({ x: rnd() * N, y: rnd() * hzO });
      for (const p of w.flakes) { p.x -= (w.speed * 0.6 + 0.05) * N * dt; p.y += N * 0.06 * dt; if (p.x < 0) { p.x = N; p.y = rnd() * hzO; } if (p.y > hzO) p.y = 0; r.set(p.x, p.y + jy, LMID); }
    }
    if (w.tunnel > 0) { // the black of the tunnel, its lamps strobing past at the near speed
      r.rect(0, 0, N, N, BLACK);
      for (let k = 0; k < 5; k++) { const x = (((k / 5 + w.nearX * 2.5) % 1) * 1.2 - 0.1) * N, y = 0.22 * N; r.disc(x, y, 3 * u, LMID + DIM); r.disc(x, y, 1.5 * u, BRIGHT); r.rect(x - 1.5 * u, y + 3 * u, 3 * u, hzO - y, DARK + DIM); }
      r.rect(0, hzO, N, N - hzO, DARK + DIM);
    }
    if (jy) { const copy = r.buf.slice(); for (let y = 0; y < N - 1; y++) r.buf.set(copy.subarray((y + 1) * N, (y + 2) * N), y * N); } // the jolt lifts the view a cell
    // the reflection in the glass: the passenger's head and shoulders, dithered, solid against the tunnel's black
    const rx = 0.7 * N + Math.sin(f.rel.bassClock * 1.3) * 1.5 * u, ry = 0.5 * N + f.beat.pulse * u * 0.6, rc = w.tunnel > 0 ? MID : MID + DIM, every = w.tunnel > 0 ? 1 : 2;
    for (let y = Math.floor(ry - 0.07 * N); y < wy1; y++)
      for (let x = Math.floor(rx - 0.16 * N); x < rx + 0.16 * N; x++) {
        if ((x + y) % every) continue;
        const dx = x - rx, dy = y - ry, head = dx * dx + dy * dy < (0.065 * N) ** 2, body = y > ry + 0.07 * N && Math.abs(dx) < 0.13 * N + (y - ry - 0.07 * N) * 0.2;
        if (head || body) r.set(x, y, rc);
      }
    // the drops on the pane: blown back along the glass by the airflow, pulled down, gone at the frame
    if (w.weather === 'rain' && rnd() < 0.3 + 0.4 * f.level) w.drops.push({ x: wx1 - rnd() * (wx1 - wx0) * 0.3, y: wy0 + rnd() * (wy1 - wy0) * 0.5, vx: 0, vy: 0 });
    w.drops = w.drops.filter((d) => {
      d.vx = follow(d.vx, -w.speed * N * 0.4, dt, 0.5); d.vy = Math.min(N * 0.08, d.vy + N * 0.1 * dt);
      d.x += d.vx * dt; d.y += d.vy * dt;
      r.line(d.x, d.y, d.x - d.vx * 0.06, d.y - d.vy * 0.06, LMID);
      r.set(d.x, d.y, BRIGHT);
      return d.x > wx0 && d.y < wy1 && d.y > wy0;
    }).slice(-200);
    // the car around the window: the frame, the sill, the wall
    r.rect(0, 0, N, wy0, DARK);
    r.rect(0, wy1, N, N - wy1, DARK);
    r.rect(0, 0, wx0, N, DARK);
    r.rect(wx1, 0, N - wx1, N, DARK);
    r.frame(Math.round(wx0 - u), Math.round(wy0 - u), Math.round(wx1 - wx0 + 2 * u), Math.round(wy1 - wy0 + 2 * u), LMID + DIM);
    r.rect(0, wy1, N, 3 * u, MID + DIM);
    r.rect(wx0 - 2 * u, 0.42 * N, wx1 - wx0 + 4 * u, 2 * u, MID + DIM);
    for (let x = 0; x < N; x += 0.1 * N) r.rect(x, wy1 + 5 * u, Math.max(1, u), N - wy1, DARK + DIM);
    targets.push({ x: rx - 0.15 * N, y: ry - 0.07 * N, w: 0.3 * N, h: wy1 - ry + 0.07 * N });
  },
};

const WORLDS = { railcrossing, rooftop, transform, powerup, hangar, festival, idol, bamboo, ninja, classroom, mechabattle, trainwindow };
registerFamily('anime', WORLD_DEFS, WORLDS);
export const ANIME_STYLE = makeMixStyle('ANIME', ['anime']);
