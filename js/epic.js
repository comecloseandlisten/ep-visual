// Epic fantasy, mixed. Twelve scenes in the visual language of the high-fantasy epics, in original silhouettes
// only (no names, maps, emblems or characters from any book or film, no text): nine walking a mountain ridge, a
// chain of beacons, a dark tower with a sweeping eye of fire, a bridge over an abyss, a luminous wood, a white city
// under siege, green hills with round doors, a cave lake, the pillared mines, a cavalry charge at sunrise, the fire
// mountain, the tree shepherds. Each world has a kinds table weighed by the arousal band, re-rolled on a section
// change, with a heavy variant on a drop; all of them move by the same physics: gaits in step with the beat and
// travel matched to the stride, gravity on whatever is thrown or falls, shadows under things, far smaller than near.
import { Raster, clamp, lerp } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow,
  followAngle, ease, beatLocked, hash, pickW, walker, particles, burst, shiftRow, shiftRows, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  fellowship: { name: 'nine on the ridge', va: [[M, H], [H, H], [M, M]], pals: ['parchment', 'midnight', 'ice', 'sepia', 'cinema'], fx: ['film', 'none', 'frame'] },
  beacons: { name: 'the beacons', va: [[M, H], [H, H], [M, M]], pals: ['midnight', 'grimdark', 'ice', 'royal', 'noir'], fx: ['film', 'none', 'frame'] },
  darktower: { name: 'the dark tower', va: [[L, H], [M, H], [L, M]], pals: ['hell', 'crypt', 'grimdark', 'noir', 'midnight'], fx: ['none', 'film', 'crt'] },
  bridgeofshadow: { name: 'the bridge of shadow', va: [[L, H], [M, H], [L, M]], pals: ['hell', 'crypt', 'noir', 'grimdark', 'midnight'], fx: ['film', 'none', 'frame'] },
  elvenwood: { name: 'the luminous wood', va: [[M, L], [H, M], [H, L]], pals: ['crystal', 'midnight', 'ice', 'royal', 'parchment'], fx: ['none', 'film'] },
  siege: { name: 'the white city besieged', va: [[M, H], [H, H], [M, M]], pals: ['royal', 'warband', 'parchment', 'cinema', 'sepia'], fx: ['film', 'none', 'frame'] },
  greenhills: { name: 'the green hills', va: [[M, L], [H, M], [H, L]], pals: ['parchment', 'gold', 'sepia', 'warband', 'royal'], fx: ['none', 'frame', 'film'] },
  cavelake: { name: 'the cave lake', va: [[L, M], [L, L]], pals: ['noir', 'midnight', 'crypt', 'ice', 'grimdark'], fx: ['film', 'none', 'crt'] },
  mines: { name: 'the pillared mines', va: [[L, H], [M, H], [L, M]], pals: ['crypt', 'grimdark', 'noir', 'midnight', 'sepia'], fx: ['film', 'none', 'crt'] },
  charge: { name: 'the charge at sunrise', va: [[M, H], [H, H], [M, M]], pals: ['warband', 'gold', 'cinema', 'parchment', 'royal'], fx: ['film', 'none', 'frame'] },
  firemountain: { name: 'the fire mountain', va: [[L, H], [M, H], [L, M]], pals: ['hell', 'crypt', 'grimdark', 'noir'], fx: ['film', 'none', 'crt'] },
  treeshepherds: { name: 'the tree shepherds', va: [[M, L], [H, M], [H, L]], pals: ['parchment', 'warband', 'grimdark', 'sepia', 'ice'], fx: ['none', 'film', 'frame'] },
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
// a beat tick, free-running at 120 when the tempo is unknown
const tick = (w, f, dt) => { if (beatLocked(f)) return f.beat.on; if ((w.tick += dt) < 0.5) return false; w.tick = 0; return true; };
// the gait phase: a step per beat (the legs alternate, so a full cycle is two beats); free-running without a tempo
const gait = (w, f, dt) => (w.gait = beatLocked(f) ? (f.beat.count + f.beat.phase) * Math.PI : w.gait + dt * Math.PI * bps(f));
// how far a walker `h` tall travels per second at a step per beat: its stride (the feet swing a tenth of h each way)
const pace = (h, f) => 0.2 * h * bps(f);
// a horse bounds once per beat and covers nine tenths of its size per bound
const canter = (sz, f) => 0.9 * sz * bps(f);

// a mountain profile 0..1 along x (in screen widths), per seed: broad folds with jagged peaks on them
const peaks = (x, seed) => { const a = hash(seed, 1) * 6, b = hash(seed, 2) * 6; return 0.45 + 0.3 * Math.sin(x * 3.1 + a) + 0.15 * Math.sin(x * 7.3 + b) + 0.1 * Math.abs(Math.sin(x * 17 + a + b)); };
// a range from its profile down to `bottom`; `top` is where a full peak reaches; scrolled by `off` screen widths;
// snow on whatever stands above `cap`
function range(r, N, top, amp, bottom, off, seed, col, cap = -1, capCol = BRIGHT) {
  for (let x = 0; x < N; x++) {
    const p = peaks((x / N + off) * 2, seed), y = top + (1 - p) * amp;
    vline(r, x, y, bottom, col);
    if (cap > 0 && p > cap) vline(r, x, y, y + mx1((p - cap) * amp * 0.5), capCol);
  }
}

// a fire `h` tall and `wd` wide standing on (x, base): tongues that jump with `tt` (a frame counter), a bright core
function flame(r, x, base, wd, h, tt, seed) {
  for (let k = 0; k < 5; k++) {
    const q = k / 5, ww = wd * (1 - q * 0.75) * (0.8 + 0.4 * hash(seed + k, tt)), j = (hash(seed + 9 + k, tt) - 0.5) * wd * q;
    r.rect(x - ww / 2 + j, base - h * (q + 0.22), ww, h * 0.24, k === 0 || hash(seed + 20 + k, tt) < 0.6 ? HOT : BRIGHT);
  }
  r.rect(x - wd * 0.2, base - h * 0.4, wd * 0.4, h * 0.4, BRIGHT);
}

// smoke and dust: a puff rises (or spreads) ever slower, drifts with the wind, grows and thins out as it ages;
// `sc` is its distance scale: a far puff is smaller and the wind moves it less across the picture
const puff = (x, y, vy, life = 3, vx = 0, sc = 1) => ({ x, y, vx, vy, life, age: 0, sc });
function smoke(W, list, wind, col) {
  const { r, dt, u } = W, k = Math.exp(-dt * 0.6);
  for (const p of list) {
    p.vy *= k;
    p.vx *= k;
    p.x += (p.vx + wind * p.sc) * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.age += dt;
    const sz = u * (1 + p.age * 1.4) * p.sc;
    if (p.age < p.life || hash(p.x | 0, (p.age * 20) | 0) < 0.5) r.rect(p.x - sz / 2, p.y - sz / 2, sz, sz, col);
  }
  return list.filter((p) => p.life > 0);
}

// things that fall or drift slowly: snow, ash, leaves, motes; `vy` and `wind` in screens per second, a sway in cells
function drift(W, list, want, vy, wind, sway, col) {
  const { r, N, dt, t, rnd, u } = W;
  while (list.length < want) list.push({ x: rnd() * N, y: rnd() * N, s: rnd() * TAU });
  if (list.length > want) list.length = want;
  for (const p of list) {
    p.y += vy * N * dt;
    p.x += (wind * N + Math.sin(t * 1.3 + p.s) * sway * u) * dt;
    if (p.y > N) { p.y -= N + rnd() * 5 * u; p.x = rnd() * N; } else if (p.y < 0) { p.y += N; p.x = rnd() * N; }
    if (p.x > N) p.x -= N; else if (p.x < 0) p.x += N;
    r.rect(p.x, p.y, mx1(u), mx1(u), col);
  }
}

// a horse at the gallop: four legs in two pairs swinging with `ph` (a full cycle is one bound), the body bobbing
// with the bound, the neck, head and tail, a shadow under it; the far legs behind the body, the near pair over it
function horse(r, x, base, sz, col, ph, dir, u, shadow = DARK + DIM) {
  const bob = Math.abs(Math.sin(ph)) * sz * 0.1, by = base - sz * 0.5 - bob, lw = mx1(sz * 0.07), far = col < 8 ? col + DIM : col;
  const leg = (k, n) => { const a = Math.sin(ph + k * 2.2 + n * 0.5), hip = x + dir * (k ? 0.3 : -0.3) * sz; r.stroke(hip, by + sz * 0.05, hip + dir * a * sz * 0.22, base - Math.max(0, -a) * sz * 0.18, lw, n ? col : far); };
  r.rect(x - sz * 0.45, base - mx1(u) * 0.5, sz * 0.9, mx1(u), shadow);
  leg(0, 0); leg(1, 0);
  r.ring(x, by, sz * 0.2, sz * 0.4, col, 0.5);
  r.stroke(x + dir * sz * 0.32, by - sz * 0.05, x + dir * sz * 0.58, by - sz * 0.42, sz * 0.16, col);
  r.rect(dir > 0 ? x + sz * 0.5 : x - sz * 0.8, by - sz * 0.5, sz * 0.3, sz * 0.14, col);
  r.stroke(x - dir * sz * 0.38, by - sz * 0.08, x - dir * sz * 0.6, by + sz * 0.1 - Math.sin(ph) * sz * 0.1, mx1(u), col);
  leg(0, 1); leg(1, 1);
  return { sx: x, sy: by - sz * 0.1 };
}

// ---------------------------------------------------------------------------------------------- fellowship
// Nine silhouettes of different heights and gear walking a mountain ridge against a huge sky: a tall one with a
// staff, two with swords, an archer, one with an axe, four short ones in cloaks; in step with the beat while the
// ridge and the far ranges scroll under them at the pace of the tall one's stride. Clouds slide with the mids and
// their shadows with them over the slope. The season is the kind: summer, autumn (leaves), winter (snow), storm; a
// section change brings a storm in, a drop a great bird across the sky with its shadow running over the ridge.
const SEASON_W = { summer: [3, 2, 1], autumn: [2, 2, 1], winter: [2, 2, 2], storm: [0, 1, 3] };
const NINE = [[1, 'staff'], [0.86, 'sword'], [0.82, 'sword'], [0.8, 'bow'], [0.52, 'cloak'], [0.5, 'cloak'], [0.5, 'cloak'], [0.48, 'cloak'], [0.66, 'axe']];
const fellowship = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, SEASON_W, bandOf(W.a)), off: 0, gait: 0, flakes: [], spray: [], storm: 0, bird: null, glint: 0, sunX: 0.15 + rnd() * 0.3 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a);
    if (f.section === 'change') { w.kind = rollW(rnd, SEASON_W, band); w.storm = 1; }
    if (f.section === 'drop' && !w.bird) w.bird = { x: -0.15 * N, y: (0.1 + rnd() * 0.15) * N };
    for (const h of hits) if (h.kind === 'snare') w.glint = 0.2; else if (isLow(h) && w.storm > 0) w.storm = Math.min(1.2, w.storm + 0.08);
    w.storm = Math.max(0, w.storm - dt / 12);
    w.glint -= dt;
    const kind = w.kind, storm = kind === 'storm' ? Math.max(0.7, w.storm) : w.storm, snow = kind === 'winter' || storm > 0.3, ph = gait(w, f, dt), H0 = 0.11 * N * (1 + 0.15 * band);
    w.off += (pace(H0, f) / N) * dt; // the ground goes by at the tall one's stride, the far ranges slower
    const off = w.off, ridgeY = (x) => 0.74 * N + 0.04 * N * Math.sin((x / N + off) * 4.2 + 1) + 0.015 * N * Math.sin((x / N + off) * 11.3);
    // the sky: stars in winter, a sun (a moon in winter), a cloud bank that lowers with the storm; the clouds
    if (kind === 'winter') for (let k = 0; k < 40; k++) r.set(hash(k, 3) * N, hash(k, 4) * 0.45 * N, hash(k, 5 + ((t * 3) | 0)) < 0.9 ? LMID : BRIGHT);
    r.disc(w.sunX * N, 0.2 * N, 0.06 * N, kind === 'winter' ? BRIGHT : kind === 'autumn' ? HOT : LMID);
    if (storm > 0) for (let x = 0; x < N; x += 2) r.rect(x, 0, 2, 0.22 * N * clamp(storm) + 0.04 * N * Math.sin((x / N) * 9 + t * 0.7), DARK + DIM);
    const cl = f.rel.midClock * 0.03 + t * 0.004, clouds = [];
    for (let k = 0; k < 5; k++) clouds.push([((hash(k, 11) + cl * (0.6 + 0.4 * hash(k, 12))) % 1) * N, (0.26 + 0.1 * hash(k, 13)) * N, (0.025 + 0.03 * hash(k, 14)) * N]);
    range(r, N, 0.3 * N, 0.22 * N, N, off * 0.1, 5, LMID, snow ? 0.8 : -1);
    range(r, N, 0.42 * N, 0.2 * N, N, off * 0.3, 9, MID, snow ? 0.85 : -1);
    for (const [cx, cy, rad] of clouds) { const cc = storm > 0.3 ? MID + DIM : LMID; r.disc(cx, cy, rad, cc); r.disc(cx - rad * 0.9, cy + rad * 0.3, rad * 0.7, cc); r.disc(cx + rad * 0.9, cy + rad * 0.25, rad * 0.75, cc); }
    // the ridge they walk, snow on it in winter, the cloud shadows on it under the clouds
    for (let x = 0; x < N; x++) {
      const y = ridgeY(x);
      let sh = false;
      for (const c of clouds) if (Math.abs(x - c[0]) < c[2] * 1.6) { sh = true; break; }
      vline(r, x, y, N, sh ? DARK + DIM : DARK);
      if (snow) vline(r, x, y, y + mx1(1.5 * u), sh ? LMID : BRIGHT);
    }
    if (w.bird) { // the great bird: slow wingbeats, its shadow running over the ridge under it
      const b = w.bird, fl = Math.sin(t * 4), sz = 0.08 * N;
      b.x += dt * 0.3 * N;
      r.ring(b.x, ridgeY(b.x) + u, sz * 0.25, sz * 0.5, DARK + DIM, 0.2);
      r.stroke(b.x - sz * 0.45, b.y, b.x + sz * 0.45, b.y, mx1(2 * u), FIG);
      r.poly([[b.x + sz * 0.4, b.y - sz * 0.05], [b.x + sz * 0.62, b.y + sz * 0.02], [b.x + sz * 0.4, b.y + sz * 0.06]], FIG);
      for (const k of [0, 1]) r.poly([[b.x - sz * 0.2 + k * sz * 0.1, b.y], [b.x + sz * 0.2 + k * sz * 0.1, b.y], [b.x - sz * 0.15 + k * sz * 0.2, b.y - sz * (0.9 - k * 0.2) * fl]], FIG);
      if (b.x > 1.2 * N) w.bird = null;
    }
    // the nine, in step, the tall one in front; the bow slung on the back, the swords at the hip, the axe over
    // the shoulder, the hoods; a foot kicks up snow on the beat
    NINE.forEach(([sc, gear], i) => {
      const x = (0.86 - i * 0.085) * N, base = ridgeY(x), h = H0 * sc, hw = h * 0.17;
      if (gear === 'bow') r.ring(x - h * 0.1, base - h * 0.5, h * 0.24, mx1(0.8 * u), FIG);
      const J = walker(r, x, base, h, FIG, ph, 1, gear === 'cloak' ? { coat: true } : gear === 'axe' ? { coat: true, hat: true } : {});
      if (gear === 'staff') {
        r.line(J.sx + u, J.sy + h * 0.25, J.sx + 2 * u, J.top - h * 0.3, FIG);
        r.rect(J.sx + 2 * u - u * 0.5, J.top - h * 0.3 - 2 * u, mx1(1.5 * u), mx1(1.5 * u), f.beat.pulse > 0.5 || w.glint > 0 ? BRIGHT : FIG);
        r.poly([[x - h * 0.16, J.top + h * 0.05], [x + h * 0.16, J.top + h * 0.05], [x, J.top - h * 0.2]], FIG);
      } else if (gear === 'sword') r.stroke(x - hw, base - h * 0.42, x - hw - h * 0.22, base - h * 0.2, mx1(u), FIG);
      else if (gear === 'cloak') r.disc(x, J.head, h * 0.14, FIG);
      else if (gear === 'axe') { const ex = J.sx - h * 0.22, ey = J.top - h * 0.25; r.line(J.sx, J.sy, ex, ey, FIG); r.poly([[ex, ey - h * 0.12], [ex - h * 0.14, ey], [ex, ey + h * 0.1]], FIG); }
      if (f.beat.on && snow && i % 3 === 0) burst(w.spray, rnd, x, base, 2, 0.08 * N, BRIGHT, 0.4);
      if (i === 0) targets.push({ x: x - h * 0.3, y: base - h * 1.1, w: h * 0.6, h: h * 1.1 });
    });
    w.spray = particles(W, w.spray, BRIGHT);
    if (snow) drift(W, w.flakes, Math.round(60 * u * (0.6 + f.rel.trebDrive) * (1 + storm)), 0.12 + 0.1 * storm, 0.04 + 0.25 * storm, 3, BRIGHT);
    else if (kind === 'autumn') drift(W, w.flakes, Math.round(14 * u), 0.05, 0.03 + 0.02 * f.rel.trebDrive, 8, HOT);
    else w.flakes.length = 0;
  },
};

// ---------------------------------------------------------------------------------------------- beacons
// Seven beacons on seven summits, near-left to far-right, lit one after another on successive beats: each fire
// grows in, its smoke drifting downwind, sparks on the kicks; a rider gallops the valley road below, a bound per
// beat, spurred on by the snares; the camera drifts across the parallax ranges with the mids. The fires burn down
// after a while and the chain starts over; a drop resets it at once with a far bigger first fire. The kind is the
// hour: night, dusk, dawn, a blizzard.
const HOUR_W = { night: [3, 2, 1], dusk: [2, 2, 2], dawn: [1, 2, 2], blizzard: [0, 1, 2] };
const beacons = {
  init(W) {
    const { w, rnd } = W;
    const bs = Array.from({ length: 7 }, (_, i) => { const d = i / 6; return { x: 0.1 + d * 0.8 + (rnd() - 0.5) * 0.04, y: 0.76 - d * 0.34, sc: 1 - d * 0.68, lay: Math.min(3, Math.floor(d * 3.99)), lit: 0, fuel: 0, big: 1, sx: 0, top: 0 }; });
    Object.assign(w, { kind: rollW(rnd, HOUR_W, bandOf(W.a)), bs, next: 0, tick: 0, smoke: [], sparks: [], flakes: [], rx: -0.15, spur: 0, gait: 0, step: 0, flare: 0, moonX: 0.15 + rnd() * 0.2 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), tt = (t * 12) | 0, wind = 0.02 + 0.05 * f.rel.trebDrive;
    if (f.section === 'change') { w.kind = rollW(rnd, HOUR_W, band); for (const b of w.bs) if (b.fuel > 3) b.fuel = 3; }
    if (f.section === 'drop') { for (const b of w.bs) { b.lit = 0; b.fuel = 0; b.big = 1; } w.next = 1; Object.assign(w.bs[0], { big: 1.9, fuel: 40 }); w.flare = 1; s.shake = Math.max(s.shake, 0.3); }
    for (const h of hits) {
      if (isLow(h)) { w.flare = Math.max(w.flare, h.strength); for (const b of w.bs) if (b.lit > 0.3) burst(w.sparks, rnd, b.sx, b.top, 3, 0.14 * N * b.sc, BRIGHT, 0.6); }
      else if (h.kind === 'snare') w.spur = 1;
    }
    if (tick(w, f, dt)) { // the next summit takes the flame on the beat; all burnt down, the chain starts again
      if (w.next < 7) w.bs[w.next++].fuel = 24 + 8 * band;
      else if (w.bs.every((b) => b.fuel <= 0)) w.next = 0;
    }
    w.flare -= dt * 2;
    w.spur -= dt * 0.5;
    const kind = w.kind, pan = 0.05 * N * Math.sin(f.rel.midClock * 0.25 + t * 0.04);
    if (kind === 'night') { for (let k = 0; k < 50; k++) r.set(hash(k, 3) * N, hash(k, 4) * 0.5 * N, hash(k, 5 + ((t * 2) | 0)) < 0.92 ? LMID : BRIGHT); r.disc(w.moonX * N, 0.14 * N, 0.045 * N, BRIGHT); }
    else if (kind === 'dusk') { r.rect(0, 0.3 * N, N, 0.25 * N, HOT + DIM); r.disc(0.85 * N, 0.44 * N, 0.07 * N, HOT); }
    else if (kind === 'dawn') { r.rect(0, 0.25 * N, N, 0.3 * N, LMID + DIM); r.disc(0.15 * N, 0.42 * N, 0.06 * N, BRIGHT); }
    // the ranges, far to near, each moved less by the pan than the one before it; a beacon stands on a summit of
    // its own range: the pyre, the glow on the snow, the fire, its smoke
    const LAY = [DARK + DIM, DARK, MID, LMID];
    for (let Lr = 3; Lr >= 0; Lr--) {
      const par = 1 - Lr * 0.28, baseY = (0.76 - 0.34 * (Lr / 3)) * N;
      range(r, N, baseY - 0.01 * N, 0.11 * N * (1 - Lr * 0.15), N, (pan * par) / N, 21 + Lr, LAY[Lr], kind === 'blizzard' || kind === 'night' ? 0.82 : -1, Lr === 3 ? BRIGHT : LMID);
      for (const b of w.bs) {
        if (b.lay !== Lr) continue;
        const bx = b.x * N + pan * par, by = b.y * N, sc = b.sc, hh = 0.13 * N * sc * b.big * b.lit * (0.75 + 0.35 * f.rel.bassDrive + 0.5 * clamp(w.flare));
        b.sx = bx; b.top = by - 2 * u * sc - hh;
        r.poly([[bx - 0.09 * N * sc, by + 0.12 * N * sc], [bx, by], [bx + 0.09 * N * sc, by + 0.12 * N * sc]], LAY[Lr]);
        if (b.fuel > 0) b.fuel -= dt;
        b.lit = follow(b.lit, b.fuel > 0 ? 1 : 0, dt, b.fuel > 0 ? 0.7 : 2);
        if (b.lit > 0.05) r.ring(bx, by + u, 0.04 * N * sc, 0.08 * N * sc * b.lit, HOT + DIM, 0.3);
        r.rect(bx - 3 * u * sc, by - 2.5 * u * sc, 6 * u * sc, 2.5 * u * sc, BLACK);
        if (b.lit > 0.05) {
          flame(r, bx, by - 2 * u * sc, 0.06 * N * sc * b.big * (0.6 + 0.4 * b.lit), hh, tt, 31 + Lr * 7 + ((b.x * 100) | 0));
          if (w.smoke.length < 90 && rnd() < dt * 5 * b.lit) w.smoke.push(puff(bx + (rnd() - 0.5) * 2 * u, by - 2 * u * sc - hh, -0.05 * N * sc * (0.6 + 0.4 * b.lit), 3, 0, sc));
          targets.push({ x: bx - 0.05 * N * sc, y: by - hh - 2 * u, w: 0.1 * N * sc, h: hh + 3 * u });
        }
      }
    }
    w.smoke = smoke(W, w.smoke, wind * N, LMID + DIM);
    w.sparks = particles(W, w.sparks, BRIGHT);
    // the valley road and the rider: a bound per beat, dust at the hooves at every bound
    const ry = 0.94 * N, sz = 0.075 * N, ph = gait(w, f, dt) * 2;
    r.rect(0, ry - 0.02 * N, N, N - ry + 0.02 * N, MID + DIM);
    r.rect(0, ry + u, N, mx1(u), LMID + DIM);
    w.rx += (dt * canter(sz, f) * (1 + 0.5 * clamp(w.spur))) / N;
    if (w.rx > 1.15) w.rx = -0.15;
    const bound = Math.floor(ph / TAU);
    if (bound !== w.step) { w.step = bound; if (w.smoke.length < 95) w.smoke.push(puff(w.rx * N - sz * 0.4, ry, -0.03 * N, 1)); }
    const seat = horse(r, w.rx * N, ry, sz, FIG, ph, 1, u, BLACK);
    walker(r, seat.sx, seat.sy + sz * 0.2, sz * 0.6, FIG, 0, 1, { cap: true });
    r.stroke(seat.sx - sz * 0.1, seat.sy - sz * 0.2, seat.sx - sz * 0.45, seat.sy - sz * 0.1 + Math.sin(t * 9) * 2 * u, mx1(u), FIG);
    if (kind === 'blizzard') drift(W, w.flakes, Math.round(90 * u * (0.6 + f.rel.trebDrive)), 0.16, 0.2 + 0.1 * f.rel.trebDrive, 2, BRIGHT); else w.flakes.length = 0;
    targets.push({ x: w.rx * N - sz * 0.5, y: ry - sz * 1.1, w: sz, h: sz * 1.1 });
  },
};

// ---------------------------------------------------------------------------------------------- dark tower
// A black spiked tower under a red sky, a flaming lens between two prongs at its top sweeping a cone of light over
// the ground with the mids (brighter on the bass, a hard core on the beat), lightning on the snares, a volcano
// glowing to the left that throws embers on the kicks, a horde marching below in three rows at the tempo, the far
// rows smaller and slower, lit where the beam passes. The horde's kind: footmen, pikes, riders on beasts, giants
// among the ranks. A drop cracks the tower: the top comes down in debris, the lens falls and bursts, dust rolls
// out and the horde halts; the dark builds it back up much later.
const HORDE_W = { footmen: [3, 2, 1], pikes: [2, 2, 2], riders: [0, 1, 3], giants: [0, 1, 2] };
const darktower = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, HORDE_W, bandOf(W.a)), gait: 0, sc: [0, 0, 0], bolt: 0, boltX: 0.5, boltSeed: 0, top: 1, crack: 0, rebuild: 0, debris: [], lens: null, dust: [], embers: [], smoke: [], halt: 0, holdPh: 0, beamX: 0, beamW: 0, seed: rnd() * TAU });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), buf = r.buf, tt = (t * 12) | 0, gy = 0.8 * N, tx = 0.62 * N, topY = 0.1 * N;
    if (f.section === 'change') w.kind = rollW(rnd, HORDE_W, band);
    if (f.section === 'drop' && w.top >= 1 && w.crack <= 0) { w.crack = 0.5; w.halt = 2.5; w.holdPh = w.gait; }
    for (const h of hits) {
      if (h.kind === 'snare') { w.bolt = 0.12; w.boltX = 0.2 + rnd() * 0.6; w.boltSeed = Math.floor(rnd() * 1000); }
      else if (isLow(h)) { burst(w.embers, rnd, 0.15 * N, 0.36 * N, 4 + 8 * h.strength, 0.25 * N * h.strength, HOT, 1.2); s.shake = Math.max(s.shake, 0.15 * h.strength); }
    }
    w.bolt -= dt;
    w.halt -= dt;
    // the sky: a red glow rising from the horizon, dark streaks of cloud drifting; the ground; the volcano, its
    // crater pulsing on the beat, a lava streak, smoke
    const y0 = (0.3 * N) | 0, y1 = gy | 0;
    for (let y = y0; y < y1; y++) { const q = ((y - y0) / (y1 - y0)) * 1.3; for (let x = 0; x < N; x++) if (hash(x, y) < q) buf[y * N + x] = HOT + DIM; }
    for (let k = 0; k < 6; k++) { const cy = (0.08 + 0.16 * hash(k, 2)) * N, cx = ((hash(k, 3) + t * 0.006 * (1 + hash(k, 4))) % 1) * N, cw = (0.15 + 0.2 * hash(k, 5)) * N; r.rect(cx - cw / 2, cy, cw, mx1(2 * u), DARK); if (cx + cw / 2 > N) r.rect(cx - cw / 2 - N, cy, cw, mx1(2 * u), DARK); }
    r.rect(0, gy, N, N - gy, MID + DIM);
    const glow = 0.6 + 0.4 * f.rel.bassDrive;
    r.disc(0.15 * N, 0.36 * N, 0.07 * N * glow, HOT + DIM);
    r.poly([[-0.02 * N, gy], [0.12 * N, 0.36 * N], [0.18 * N, 0.36 * N], [0.34 * N, gy]], DARK);
    r.rect(0.12 * N, 0.355 * N, 0.06 * N, mx1(u), f.beat.pulse > 0.5 ? BRIGHT : HOT);
    r.stroke(0.14 * N, 0.36 * N, 0.07 * N + 0.01 * N * Math.sin(t), 0.6 * N, mx1(u), HOT);
    if (w.smoke.length < 40 && rnd() < dt * 4 * glow) w.smoke.push(puff(0.15 * N + (rnd() - 0.5) * 0.04 * N, 0.35 * N, -0.06 * N));
    w.smoke = smoke(W, w.smoke, 0.02 * N, DARK);
    w.embers = particles(W, w.embers, HOT);
    // the tower: a black spire with spikes down its sides; after a drop the cracks glow, then the top goes: debris
    // out and down, the lens after it, dust at the break; the beam only while the lens is up there
    if (w.crack > 0 && (w.crack -= dt) <= 0) {
      w.top = 0.55;
      w.rebuild = 9;
      const by = topY + (gy - topY) * 0.45;
      for (let k = 0; k < 16; k++) w.debris.push({ x: tx + (rnd() - 0.5) * 0.1 * N, y: lerp(topY, by, rnd()), vx: (rnd() - 0.5) * 0.35 * N, vy: -rnd() * 0.15 * N, sz: (1.5 + rnd() * 3) * u, life: 4 });
      w.lens = { x: tx, y: topY, vx: (rnd() - 0.5) * 0.1 * N, vy: 0 };
      for (let k = 0; k < 24; k++) w.dust.push(puff(tx + (rnd() - 0.5) * 0.08 * N, by, -rnd() * 0.08 * N, 3 + rnd() * 2, (rnd() - 0.5) * 0.3 * N));
      s.shake = Math.max(s.shake, 0.9);
    }
    if (w.rebuild > 0) w.rebuild -= dt; else if (w.top < 1) w.top = Math.min(1, w.top + dt * 0.05);
    const ty = gy - (gy - topY) * w.top, bw = 0.06 * N, tw = 0.025 * N + (bw - 0.025 * N) * (1 - w.top);
    r.poly([[tx - bw, gy], [tx - tw, ty], [tx + tw, ty], [tx + bw, gy]], BLACK);
    for (let y = gy - 0.08 * N; y > ty + 0.03 * N; y -= 0.07 * N) { const hw = bw + (0.025 * N - bw) * ((gy - y) / (gy - topY)); for (const k of [-1, 1]) r.poly([[tx + k * hw, y], [tx + k * (hw + 0.03 * N), y - 0.02 * N], [tx + k * hw, y - 0.035 * N]], BLACK); }
    if (w.crack > 0) { const cy = topY + (gy - topY) * 0.45; for (let k = 0; k < 5; k++) r.line(tx - bw * 0.6 + k * bw * 0.3, cy + (hash(k, 7) - 0.5) * 0.08 * N, tx - bw * 0.6 + (k + 1) * bw * 0.3, cy + (hash(k + 1, 7) - 0.5) * 0.08 * N, hash(k, tt) < 0.7 ? HOT : BRIGHT); }
    if (w.top >= 1) {
      for (const k of [-1, 1]) r.poly([[tx + k * tw * 0.4, ty], [tx + k * tw * 1.6, ty - 0.02 * N], [tx + k * tw * 1.2, ty - 0.08 * N]], BLACK);
      const ang = 0.75 * Math.sin(f.rel.midClock * 0.6 + w.seed), ly = ty - 0.03 * N, gx = tx + Math.tan(ang) * (gy - ly), hw = (0.06 * (gy - ly)) / Math.cos(ang) ** 2;
      r.poly([[tx, ly], [gx - hw, gy], [gx + hw, gy]], f.rel.bassDrive > 0.55 ? HOT : HOT + DIM);
      if (f.beat.pulse > 0.6) r.line(tx, ly, gx, gy, BRIGHT);
      r.ring(gx, gy, hw * 0.5, hw, LMID + DIM, 0.25);
      r.ring(tx, ly, 0.02 * N, 0.04 * N, HOT, 1.5);
      r.rect(tx - mx1(u) / 2, ly - 0.05 * N, mx1(u), 0.1 * N, BLACK);
      w.beamX = gx; w.beamW = hw;
      targets.push({ x: gx - hw, y: gy - 4 * u, w: 2 * hw, h: 6 * u });
    } else w.beamW = 0;
    w.debris = w.debris.filter((d) => { d.vy += GR * N * dt; d.x += d.vx * dt; d.y += d.vy * dt; if (d.y > gy) { d.y = gy; d.vy *= -0.3; d.vx *= 0.6; } d.life -= dt; r.rect(d.x - d.sz / 2, d.y - d.sz, d.sz, d.sz, BLACK); return d.life > 0; });
    if (w.lens) {
      const Ln = w.lens;
      Ln.vy += GR * N * dt; Ln.x += Ln.vx * dt; Ln.y += Ln.vy * dt;
      r.disc(Ln.x, Ln.y, 0.03 * N, HOT);
      r.disc(Ln.x, Ln.y, 0.012 * N, BRIGHT);
      if (Ln.y >= gy) { burst(w.embers, rnd, Ln.x, gy, 40, 0.4 * N, BRIGHT, 1); for (let k = 0; k < 10; k++) w.dust.push(puff(Ln.x, gy, -rnd() * 0.1 * N, 3, (rnd() - 0.5) * 0.4 * N)); s.shake = Math.max(s.shake, 1); w.lens = null; }
    }
    w.dust = smoke(W, w.dust, 0, MID + DIM);
    if (w.bolt > 0) { // a snare's bolt, jagged from the top of the sky; the tower's edge lit by it
      let x = w.boltX * N, y = 0;
      for (let k = 0; k < 7; k++) { const nx = x + (hash(w.boltSeed + k, 1) - 0.5) * 0.12 * N, ny = (k + 1) * 0.1 * N; r.stroke(x, y, nx, ny, w.bolt > 0.08 ? mx1(1.5 * u) : mx1(u), BRIGHT); x = nx; y = ny; }
      if (w.bolt > 0.08) r.rect(tx - bw, ty, mx1(u), gy - ty, LMID);
    }
    // the horde: three rows at three depths, each scrolling at its own stride, all in step; shadows under the feet;
    // the near row is mounted in the riders' kind and goes at a horse's pace
    const kind = w.kind, ph = w.halt > 0 ? w.holdPh : gait(w, f, dt), ROWS = [[0, 0.034], [0.05, 0.05], [0.1, 0.075]];
    ROWS.forEach(([dy, hs], k) => {
      const h = hs * N, y = gy + dy * N, riders = kind === 'riders' && k === 2, sp = h * (riders ? 1.6 : 0.8), n = Math.ceil(N / sp) + 2, span = n * sp;
      if (w.halt <= 0) w.sc[k] += (riders ? canter(h * 1.1, f) : pace(h, f)) * dt;
      for (let i = 0; i < n; i++) {
        const x = ((((i * sp - w.sc[k]) % span) + span) % span) - sp, role = hash(i * 7 + k, 13), lit = w.beamW > 0 && Math.abs(x - w.beamX) < w.beamW, col = lit ? LMID : BLACK;
        r.rect(x - h * 0.2, y - mx1(u) * 0.5, h * 0.4, mx1(u), DARK);
        if (riders) { const st = horse(r, x, y, h * 1.1, col, ph * 2, -1, u, DARK); walker(r, st.sx, st.sy + h * 0.2, h * 0.6, col, 0, -1, {}); continue; }
        if (kind === 'giants' && role < 0.12) { walker(r, x, y, h * 2, col, ph * 0.5, -1, { coat: true }); continue; }
        walker(r, x, y, h, col, ph, -1, { hat: role < 0.5 });
        if (kind === 'pikes' || role > 0.8) r.rect(x + h * 0.15, y - h * 1.7 - role * h * 0.3, mx1(u * 0.7), h * 0.9, col);
      }
    });
  },
};

// ---------------------------------------------------------------------------------------------- bridge of shadow
// A narrow stone bridge over an abyss in a vast dark hall, fire rolling far below with the bass: a robed figure
// with a staff facing a giant whose whip lashes over its head in an arc on the snares; the staff slams on the heavy
// kicks, a ring of light running out along the deck and dust shaken from under it. The giant's kind: flame (a mane
// of fire, a whip of fire), shadow (a dark winged form, cold eyes, a whip of cold light), stone (a cracked bulk, a
// chain). A drop breaks the bridge: the span under the giant drops away with it, the whip catches the figure's
// leg and drags it to the edge, it hangs there, then falls; a bar later the scene is whole again.
const GIANT_W = { flame: [1, 2, 3], shadow: [3, 2, 1], stone: [2, 2, 1] };
const bridgeofshadow = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, GIANT_W, bandOf(W.a)), lash: 0, hit: false, slam: 0, rings: [], dust: [], sparks: [], phase: 'stand', pt: 0, cy: 0, cvy: 0, rot: 0, fx: 0.36, fy: 0, fvy: 0, tick: 0, bar: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), buf = r.buf, tt = (t * 12) | 0, by = 0.6 * N, bt = 0.05 * N, cx = 0.56 * N, gx = 0.78 * N, GH = 0.46 * N, FH = 0.2 * N, kind = w.kind;
    if (f.section === 'change') w.kind = rollW(rnd, GIANT_W, band);
    const stand = w.phase === 'stand';
    if (f.section === 'drop' && stand) {
      Object.assign(w, { phase: 'break', pt: 0, cy: 0, cvy: 0, rot: 0, fy: 0, fvy: 0, lash: 0, slam: 0 });
      s.shake = Math.max(s.shake, 0.8);
      for (let k = 0; k < 20; k++) w.dust.push({ x: cx + rnd() * 0.08 * N, y: by + bt, vx: (rnd() - 0.5) * 0.1 * N, vy: rnd() * 0.05 * N, life: 2, c: MID });
    }
    for (const h of hits) if (stand) { if (h.kind === 'snare') { w.lash = 1; w.hit = false; } else if (isLow(h) && h.strength > 0.55 && w.slam <= 0) w.slam = 1; }
    if (w.slam > 0) {
      const was = w.slam;
      w.slam -= dt * 3.3;
      if (was > 0.5 && w.slam <= 0.5) { // the staff meets the deck
        w.rings.push({ x: w.fx * N + FH * 0.3, t: 0 });
        s.shake = Math.max(s.shake, 0.45);
        for (let k = 0; k < 8; k++) w.dust.push({ x: w.fx * N + (rnd() - 0.3) * 0.2 * N, y: by + bt, vx: 0, vy: 0, life: 1.5, c: MID + DIM });
      }
    }
    w.lash = Math.max(0, w.lash - dt * 2.8);
    // the hall: the abyss, the fire far down in it, the chasm walls, columns lost in the dark; the deck
    r.rect(0, by + bt, N, N - by - bt, BLACK);
    const fy0 = (0.86 * N) | 0;
    for (let y = fy0; y < N; y++) { const q = (y - fy0) / (N - fy0); for (let x = 0; x < N; x++) if (hash(x, y) < q * (0.4 + 0.4 * Math.sin(f.rel.bassClock + x * 0.1 + y * 0.3))) buf[y * N + x] = HOT + DIM; }
    r.poly([[0, by + bt], [0.1 * N, by + bt], [0.03 * N, N], [0, N]], DARK);
    r.poly([[N, by + bt], [0.9 * N, by + bt], [0.97 * N, N], [N, N]], DARK);
    for (const px of [0.08, 0.3, 0.7, 0.92]) r.rect(px * N - 0.02 * N, 0, 0.04 * N, by, DARK + DIM);
    const deck = (x0, x1, y, rot = 0) => {
      if (!rot) { r.rect(x0, y, x1 - x0, bt, MID); r.rect(x0, y, x1 - x0, mx1(u), LMID); r.rect(x0, y + bt - mx1(u), x1 - x0, mx1(u), DARK); for (let x = x0 + 0.03 * N; x < x1; x += 0.07 * N) r.rect(x, y + u, mx1(u * 0.7), bt - 2 * u, DARK); return; }
      const c = Math.cos(rot), sn = Math.sin(rot), hl = (x1 - x0) / 2, mxp = (x0 + x1) / 2, P = (dx, dy) => [mxp + dx * c - dy * sn, y + bt / 2 + dx * sn + dy * c];
      r.poly([P(-hl, -bt / 2), P(hl, -bt / 2), P(hl, bt / 2), P(-hl, bt / 2)], MID);
      r.stroke(...P(-hl, -bt / 2), ...P(hl, -bt / 2), mx1(u), LMID);
    };
    deck(0, cx, by);
    if (stand) deck(cx, 0.97 * N, by);
    else { // the broken span and whoever stands on it go down; the whip takes the figure to the edge, then over
      w.pt += dt;
      w.cvy += GR * N * dt; w.cy += w.cvy * dt; w.rot += dt * 0.5;
      if (w.cy < 1.2 * N) deck(cx, 0.97 * N, by + w.cy, w.rot);
      if (w.phase === 'break') { if (w.pt > 0.35) w.fx = follow(w.fx, cx / N - 0.03, dt, 0.15); if (w.pt > 0.9) { w.phase = 'hang'; w.pt = 0; } }
      else if (w.phase === 'hang') { if (w.pt > 1) { w.phase = 'fall'; w.pt = 0; } }
      else if (w.phase === 'fall') { w.fvy += GR * N * dt; w.fy += w.fvy * dt; if (w.fy > N) { w.phase = 'gone'; w.bar = 0; } }
      else if (tick(w, f, dt) && ++w.bar >= 4) { w.phase = 'stand'; w.fx = 0.36; }
    }
    // the giant: legs, a broad torso breathing with the beat, horns, the near arm hanging, the far arm up with the
    // whip; a mane of fire, wings, or the cracks of stone, by kind
    const gyo = stand ? 0 : w.cy, g0 = by + gyo, br = 0.02 * GH * f.beat.pulse, body = kind === 'stone' ? MID : DARK, hx = gx - GH * 0.3, hy2 = g0 - GH * 0.95 - br, wc = kind === 'flame' ? HOT : kind === 'shadow' ? COOL : MID;
    if (gyo < 1.3 * N) {
      for (const k of [-1, 1]) r.rect(gx + k * GH * 0.1 - GH * 0.05, g0 - GH * 0.2, GH * 0.1, GH * 0.2, body);
      if (kind === 'shadow') for (const k of [-1, 1]) r.poly([[gx + k * GH * 0.2, g0 - GH * 0.65], [gx + k * GH * 0.75, g0 - GH * 1.05 - br], [gx + k * GH * 0.55, g0 - GH * 0.45]], DARK + DIM);
      r.poly([[gx - GH * 0.14, g0 - GH * 0.2], [gx + GH * 0.14, g0 - GH * 0.2], [gx + GH * 0.27, g0 - GH * 0.72 - br], [gx - GH * 0.27, g0 - GH * 0.72 - br]], body);
      const hy = g0 - GH * 0.82 - br;
      r.disc(gx, hy, GH * 0.09, body);
      for (const k of [-1, 1]) r.poly([[gx + k * GH * 0.05, hy - GH * 0.05], [gx + k * GH * 0.2, hy - GH * 0.22], [gx + k * GH * 0.1, hy - GH * 0.02]], body);
      r.stroke(gx + GH * 0.22, g0 - GH * 0.68 - br, gx + GH * 0.3, g0 - GH * 0.3, GH * 0.08, body);
      r.stroke(gx - GH * 0.22, g0 - GH * 0.68 - br, hx, hy2, GH * 0.08, body);
      if (kind === 'flame') {
        for (const [dx, hh] of [[-0.18, 0.16], [0, 0.22], [0.18, 0.16], [-0.3, 0.12], [0.3, 0.12]]) flame(r, gx + dx * GH, g0 - GH * 0.7 - br - (Math.abs(dx) < 0.1 ? GH * 0.2 : 0), GH * 0.12, GH * hh * (0.7 + 0.5 * f.rel.bassDrive), tt, 40 + (((dx + 1) * 10) | 0));
        for (let k = 0; k < 4; k++) r.line(gx - GH * 0.1 + k * GH * 0.07, g0 - GH * 0.3 - k * GH * 0.08, gx - GH * 0.05 + k * GH * 0.07, g0 - GH * 0.5 - k * GH * 0.05, HOT);
      } else if (kind === 'stone') for (let k = 0; k < 5; k++) r.line(gx - GH * 0.2 + k * GH * 0.1, g0 - GH * 0.25 - hash(k, 3) * GH * 0.2, gx - GH * 0.15 + k * GH * 0.1, g0 - GH * 0.55 - hash(k, 4) * GH * 0.15, DARK);
      for (const k of [-1, 1]) r.rect(gx + k * GH * 0.035 - u, hy - u, mx1(1.5 * u), mx1(1.5 * u), kind === 'shadow' ? COOL : BRIGHT);
      targets.push({ x: gx - GH * 0.3, y: g0 - GH * 1.05, w: GH * 0.6, h: GH * 1.05 });
    }
    // the whip: slack when at rest, an arc over the giant's head on a lash, the tip bright; taut to the figure's
    // ankle once the bridge is gone
    const fxN = w.fx * N, len = GH * 0.6;
    if (stand) {
      const q = w.lash > 0 ? ease(1 - w.lash) : 0, th = w.lash > 0 ? lerp(-0.5, -2.8, q) : 1.8, bend = w.lash > 0 ? 0.9 * Math.sin(Math.PI * q) : 0.5;
      let px = hx, py = hy2;
      for (let i = 1; i <= 8; i++) { const a = th + bend * (i / 8) ** 2, nx = hx + Math.cos(a) * len * (i / 8), ny = hy2 + Math.sin(a) * len * (i / 8); r.stroke(px, py, nx, ny, mx1(u * (1.6 - i / 8)), i === 8 ? BRIGHT : kind === 'stone' && i % 2 ? DARK : wc); px = nx; py = ny; }
      if (w.lash > 0 && q > 0.7 && !w.hit) { w.hit = true; burst(w.sparks, rnd, px, py, 10, 0.2 * N, BRIGHT, 0.5); s.shake = Math.max(s.shake, 0.2); w.fx -= 0.01; }
    } else if (w.phase !== 'gone' && w.pt + (w.phase === 'break' ? 0 : 1) > 0.3) r.stroke(hx, hy2, w.phase === 'break' ? fxN + FH * 0.05 : cx - FH * 0.05, w.phase === 'break' ? by - FH * 0.1 : by + w.fy + FH * 0.8, mx1(u), wc);
    // the figure: a robe, a wide hat, the staff raised, or planted with the slam; at the edge by the hands, then down
    if (w.phase === 'hang' || w.phase === 'fall') {
      const top = by + w.fy, ex = cx - FH * 0.08;
      for (const k of [-1, 1]) r.stroke(ex + k * FH * 0.1, top, ex + k * FH * 0.12, top + FH * 0.3, mx1(u), FIG);
      r.rect(ex - FH * 0.15, top + FH * 0.28, FH * 0.3, FH * 0.35, FIG);
      r.disc(ex, top + FH * 0.2, FH * 0.1, FIG);
      for (const k of [-1, 1]) r.rect(ex + k * FH * 0.08 - FH * 0.04, top + FH * 0.6, FH * 0.08, FH * 0.3, FIG);
      r.rect(cx - FH * 0.5, by - mx1(u), FH * 0.35, mx1(u), FIG);
      targets.push({ x: ex - FH * 0.3, y: top, w: FH * 0.6, h: FH * 0.9 });
    } else if (w.phase !== 'gone') {
      const q = w.slam > 0.5 ? (1 - w.slam) * 2 : w.slam * 2, J = walker(r, fxN, by, FH, FIG, 0, 1, { coat: true, hat: true });
      const ax = lerp(J.sx + FH * 0.1, J.sx + FH * 0.15, q), ay = lerp(J.top - FH * 0.5, by - FH * 0.95, q), bx = lerp(J.sx + FH * 0.05, J.sx + FH * 0.1, q), byy = lerp(J.sy + FH * 0.4, by, q);
      r.stroke(bx, byy, ax, ay, mx1(u), LMID);
      r.disc(ax, ay, mx1(1.5 * u), f.beat.pulse > 0.4 || q > 0.6 ? BRIGHT : COOL);
      targets.push({ x: fxN - FH * 0.3, y: by - FH * 1.2, w: FH * 0.6, h: FH * 1.2 });
    }
    w.rings = w.rings.filter((rg) => { rg.t += dt * 1.6; if (rg.t < 0.15) r.rect(rg.x - u, by - 0.35 * N, 2 * u, 0.35 * N, BRIGHT); r.ring(rg.x, by, rg.t * 0.4 * N, mx1(1.5 * u), rg.t < 0.4 ? BRIGHT : COOL, 0.22); return rg.t < 1; });
    w.dust = particles(W, w.dust, MID + DIM);
    w.sparks = particles(W, w.sparks, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- luminous wood
// A luminous forest: tall silver trunks in three parallax layers leaning with the trebles, stairways spiralling up
// the near ones, floating lights drifting among them (more with every tonal hit, all of them flaring on the beat),
// a river along the bottom that mirrors everything above it, broken by ripples that run with the bass, a lady of
// the wood on a platform raising her hand on the beat and letting a light go. The kind is the hour: night, dawn
// (mist), starlit, festival (lantern strings swinging between the trunks). A drop turns the canopy gold and the
// leaves come down, fluttering at their own slow terminal speed, to float away on the water.
const WOOD_W = { night: [3, 2, 1], dawn: [2, 2, 2], starlit: [2, 1, 1], festival: [0, 1, 3] };
const elvenwood = {
  init(W) {
    const { w, rnd } = W, layer = (n, seed) => Array.from({ length: n }, (_, i) => (i + 0.2 + 0.6 * hash(seed, i)) / n);
    Object.assign(w, { kind: rollW(rnd, WOOD_W, bandOf(W.a)), far: layer(7, 3), mid: layer(5, 4), near: [0.2 + rnd() * 0.1, 0.55 + rnd() * 0.08, 0.86 + rnd() * 0.06], lights: [], leaves: [], gold: 0, fallT: 0, arm: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), buf = r.buf, tt = (t * 10) | 0, gy = 0.8 * N, kind = w.kind, sway = f.rel.trebClock * 0.4;
    if (f.section === 'change') w.kind = rollW(rnd, WOOD_W, band);
    if (f.section === 'drop') { w.gold = 1; w.fallT = 5; }
    for (const h of hits) if (isTonal(h)) for (let k = 0; k < 4; k++) w.lights.push({ x: h.x * N + (rnd() - 0.5) * 6 * u, y: Math.min(gy - u, h.y * N) + (rnd() - 0.5) * 6 * u, s: rnd() * TAU, life: 5 + rnd() * 3, c: h.pc % 2 ? COOL : BRIGHT });
    // the sky and the canopy: leaves thinning downward with a sparkle in them, gold after a drop
    if (kind === 'starlit' || kind === 'night') for (let k = 0; k < 30; k++) r.set(hash(k, 3) * N, hash(k, 4) * 0.5 * N, LMID);
    if (kind === 'dawn') r.rect(0, 0.45 * N, N, gy - 0.45 * N, LMID + DIM);
    const cy1 = (0.22 * N) | 0;
    for (let y = 0; y < cy1; y++) { const q = 0.6 - (y / cy1) * 0.55; for (let x = 0; x < N; x++) { const hv = hash(x, y); if (hv < q) buf[y * N + x] = hv < q * w.gold ? HOT : hash(x + 1, y + tt) < 0.03 ? BRIGHT : COOL + DIM; } }
    // the trunks, far to near, each leaning a little with the wind; a highlight down the lit side of the near ones
    const trunk = (x, tw, col, hi, lean) => {
      r.poly([[x - tw / 2, gy], [x + tw / 2, gy], [x + tw / 2 + lean, 0], [x - tw / 2 + lean, 0]], col);
      if (hi >= 0) r.poly([[x - tw / 2, gy], [x - tw / 2 + tw * 0.25, gy], [x - tw / 2 + tw * 0.25 + lean, 0], [x - tw / 2 + lean, 0]], hi);
      r.poly([[x - tw * 0.9, gy], [x + tw * 0.9, gy], [x + tw / 2, gy - tw * 0.8], [x - tw / 2, gy - tw * 0.8]], col);
    };
    w.far.forEach((px, i) => trunk(px * N, 0.018 * N, MID + DIM, -1, Math.sin(sway + i) * 0.006 * N));
    w.mid.forEach((px, i) => trunk(px * N, 0.03 * N, MID, -1, Math.sin(sway + i * 1.7) * 0.01 * N));
    // the lights: a few always, more with the trebles and the tonal hits, drifting up and swaying; half of them
    // behind the near trunks, half in front
    const want = Math.round((15 + 40 * f.rel.trebDrive) * u);
    while (w.lights.length < want) w.lights.push({ x: rnd() * N, y: rnd() * gy, s: rnd() * TAU, life: Infinity, c: COOL });
    const bright = f.beat.pulse > 0.6;
    w.lights = w.lights.filter((p) => { p.y -= dt * 0.012 * N; p.x += Math.sin(t * 0.9 + p.s) * 3 * u * dt; p.life -= dt; if (p.y < 0) { p.y = gy - 2 * u; p.x = rnd() * N; } return p.life > 0; });
    const drawLights = (from) => { const sz = bright ? mx1(2 * u) : mx1(u); for (let i = from; i < w.lights.length; i += 2) { const p = w.lights[i]; r.rect(p.x - sz / 2, p.y - sz / 2, sz, sz, bright ? BRIGHT : p.c); } };
    drawLights(0);
    w.near.forEach((px, i) => {
      const x = px * N, tw = 0.06 * N, lean = Math.sin(sway * 0.8 + i * 2.3) * 0.012 * N, step = (k, front) => { const a = k * 0.75 + i, y = gy - k * 0.036 * N, sx = x + Math.cos(a) * tw * 0.85 + (lean * (gy - y)) / gy; if (Math.sin(a) > 0 === front) r.rect(sx - tw * 0.22, y, tw * 0.44, mx1(u), front ? DARK : LMID + DIM); };
      for (let k = 1; k < 22; k++) step(k, false);
      trunk(x, tw, LMID, BRIGHT, lean);
      for (let k = 1; k < 22; k++) step(k, true);
    });
    if (kind === 'festival') for (let k = 0; k < 2; k++) { const x0 = w.near[k] * N, x1 = w.near[k + 1] * N; for (let i = 1; i < 8; i++) { const q = i / 8, lx = lerp(x0, x1, q) + Math.sin(f.rel.trebClock * 1.5 + i + k) * 2 * u, ly = 0.3 * N + 0.06 * N * Math.sin(Math.PI * q); r.rect(lx - u, ly, 2 * u, 3 * u, bright ? BRIGHT : HOT); } }
    // the platform and the lady: a gown, the arm rising on the beat and a light let go from the hand
    const lx = w.near[1] * N - 0.08 * N, ly = 0.46 * N, LH = 0.13 * N;
    r.rect(lx - 0.06 * N, ly, 0.16 * N, mx1(1.5 * u), LMID);
    r.rect(lx - 0.06 * N, ly + 1.5 * u, 0.16 * N, mx1(u), DARK);
    const J = walker(r, lx, ly, LH, BRIGHT, 0, -1, {});
    r.poly([[lx - LH * 0.1, ly - LH * 0.5], [lx + LH * 0.1, ly - LH * 0.5], [lx + LH * 0.22, ly], [lx - LH * 0.22, ly]], BRIGHT);
    w.arm = follow(w.arm, f.beat.pulse, dt, 0.08);
    const aa = lerp(0.6, -1.3, w.arm), ax = J.sx - Math.cos(aa) * LH * 0.35, ay = J.sy + Math.sin(aa) * LH * 0.35;
    r.stroke(J.sx, J.sy, ax, ay, mx1(u), BRIGHT);
    if (w.arm > 0.5) r.disc(ax, ay, mx1(1.5 * u), COOL);
    if (f.beat.on) w.lights.push({ x: ax, y: ay, s: rnd() * TAU, life: 6, c: BRIGHT });
    targets.push({ x: lx - LH * 0.4, y: ly - LH * 1.1, w: LH * 0.8, h: LH * 1.1 });
    // the river: everything above mirrored across the waterline, dimmed, the rows broken by ripples
    r.rect(0, gy, N, N - gy, COOL + DIM);
    const shift = (f.rel.bassClock * 6) | 0, g0 = gy | 0;
    for (let y = g0; y < N; y++) {
      if ((y + shift) % 5 === 0) continue;
      const sy = 2 * g0 - y - 1, dx = Math.round(Math.sin(y * 0.6 + t * 2) * u);
      if (sy < 0) break;
      for (let x = 0; x < N; x++) { const sx = x + dx; if (sx < 0 || sx >= N) continue; const c = buf[sy * N + sx]; buf[y * N + x] = c === BG ? COOL + DIM : c < 8 ? c + DIM : c; }
    }
    drawLights(1);
    // the golden fall: leaves let go from the canopy, fluttering down no faster than a leaf falls, floating off
    if (w.fallT > 0) { w.fallT -= dt; for (let k = 0; k < 2 * u; k++) if (w.leaves.length < 160 * u) w.leaves.push({ x: rnd() * N, y: rnd() * 0.2 * N, vy: 0, s: rnd() * TAU, onWater: 0 }); }
    else w.gold = follow(w.gold, 0, dt, 5);
    w.leaves = w.leaves.filter((p) => {
      if (p.y < gy) { p.vy = Math.min(p.vy + GR * N * dt, 0.08 * N); p.y += p.vy * dt; p.x += Math.sin(t * 3 + p.s) * 8 * u * dt; if (p.y >= gy) { p.y = gy; p.onWater = 2; } }
      else { p.onWater -= dt; p.x += 0.02 * N * dt; }
      r.rect(p.x, p.y, mx1(u), mx1(u), HOT);
      return p.y < gy || p.onWater > 0;
    });
  },
};

// ---------------------------------------------------------------------------------------------- siege
// A tiered white city on a mountain spur, besieged from the plain: siege towers rolling closer on wheels that turn
// with the ground covered, catapults lobbing stones on true parabolas (their shadows on the plain under them,
// dust where they strike the walls), volleys of arrows on the snares from both sides, a ram at the gate striking
// on the kicks, a crowd at the lines. The besiegers' kind: footmen, towers, great tusked beasts carrying towers,
// engines. A drop sends riders across the plain at a bound per beat, the crowd scattering before them; the sun
// moves on with every section: night, dawn, day, dusk.
const SIEGE_W = { footmen: [3, 2, 1], towers: [2, 2, 2], beasts: [0, 1, 3], engines: [1, 2, 2] };
const TIERS = [[0.6, 0.09], [0.655, 0.18], [0.71, 0.27], [0.765, 0.36], [0.82, 0.45]]; // the left face and the top height of each ring
function siegeGear(w, rnd) { // the engines on the plain, by kind
  const kind = w.kind;
  w.towers = Array.from({ length: kind === 'towers' ? 3 : kind === 'beasts' ? 0 : 1 }, (_, i) => ({ x: 0.06 + i * 0.13 + rnd() * 0.04, ang: 0, stop: false }));
  w.cats = Array.from({ length: kind === 'engines' ? 3 : 2 }, (_, i) => ({ x: 0.06 + i * 0.1, arm: 0, cool: 0 }));
  w.beasts = kind === 'beasts' ? [{ x: -0.05 + rnd() * 0.1 }, { x: 0.22 + rnd() * 0.1 }] : [];
}
const siege = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, SIEGE_W, bandOf(W.a)), cycle: 1, sunY: 0.95, stones: [], arrows: [], dust: [], sparks: [], ram: 0, riders: [], ridePh: 'none', rideT: 0, scatter: 0, gait: 0, tick: 0, beatN: 0 });
    siegeGear(w, rnd);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), gy = 0.78 * N, wallX = 0.6 * N, kind = w.kind;
    if (f.section === 'change') { w.kind = rollW(rnd, SIEGE_W, band); w.cycle = (w.cycle + 1) % 4; siegeGear(w, rnd); }
    if (f.section === 'drop' && w.ridePh === 'none') { w.ridePh = 'in'; w.rideT = 0; w.riders = Array.from({ length: 6 }, (_, i) => ({ x: -0.08 - i * 0.07 - rnd() * 0.03, lane: i % 3, stop: 0.5 - i * 0.055 })); }
    const faceX = (y) => { for (const [lx, th] of TIERS) if (y > gy - th * N) return lx * N; return N; };
    const fire = (c) => { // the arm goes over and the stone leaves it on the parabola that reaches its mark on the wall
      if (c.cool > 0) return;
      c.cool = 1.5; c.arm = 1;
      const x0 = c.x * N + 0.03 * N, y0 = gy - 0.07 * N, R = (0.6 + rnd() * 0.2) * N - x0, D = y0 - (gy - (0.05 + rnd() * 0.35) * N), th = 1.05, c2 = Math.cos(th) ** 2;
      const v = Math.sqrt((GR * N * R * R) / (2 * c2 * Math.max(0.05 * N, R * Math.tan(th) - D)));
      w.stones.push({ x: x0, y: y0, vx: v * Math.cos(th), vy: -v * Math.sin(th) });
    };
    for (const h of hits) {
      if (isLow(h)) { if (h.strength > 0.6) fire(w.cats[Math.floor(rnd() * w.cats.length)]); if (w.ram <= 0) w.ram = 1; }
      else if (h.kind === 'snare') for (let k = 0; k < 5; k++) {
        const a = 0.9 + rnd() * 0.3, v = (0.55 + rnd() * 0.15) * N, b = 2.1 + rnd() * 0.4, v2 = (0.35 + rnd() * 0.15) * N;
        w.arrows.push({ x: (0.3 + rnd() * 0.2) * N, y: gy, vx: v * Math.cos(a), vy: -v * Math.sin(a), life: 0, ex: 0, ey: 0 });
        w.arrows.push({ x: (0.6 + rnd() * 0.1) * N, y: gy - (0.1 + rnd() * 0.3) * N, vx: v2 * Math.cos(b), vy: -v2 * Math.sin(b), life: 0, ex: 0, ey: 0 });
      }
    }
    if (tick(w, f, dt) && ++w.beatN % 8 === 0) fire(w.cats[Math.floor(w.beatN / 8) % w.cats.length]);
    // the sky and the sun by the hour of the cycle; the plain, the spur, the rings of the city, the spire, the gate
    w.sunY = follow(w.sunY, [1.1, 0.68, 0.22, 0.66][w.cycle], dt, 4);
    const night = w.sunY > 0.9, lit = night ? LMID : BRIGHT, shade = night ? MID : LMID;
    if (night) for (let k = 0; k < 40; k++) r.set(hash(k, 3) * N, hash(k, 4) * 0.6 * N, LMID);
    if (w.cycle === 1) r.rect(0, gy - 0.2 * N, N, 0.2 * N, LMID + DIM); else if (w.cycle === 3) r.rect(0, gy - 0.15 * N, N, 0.15 * N, HOT + DIM);
    r.disc(0.8 * N, w.sunY * N, 0.07 * N, w.cycle === 3 ? HOT : BRIGHT);
    r.rect(0, gy, N, N - gy, MID);
    r.poly([[0.5 * N, gy], [0.72 * N, 0.2 * N], [N, 0.14 * N], [N, gy]], DARK + DIM);
    TIERS.forEach(([lx, th], k) => {
      const x = lx * N, top = gy - th * N, h = 0.09 * N;
      r.rect(x, top, N - x, h, lit);
      r.rect(x, top, 0.03 * N, h, shade);
      r.rect(x, top, N - x, mx1(u), BRIGHT);
      for (let wx = x + 0.05 * N; wx < N; wx += 0.04 * N) if (hash(wx | 0, k) < 0.7) r.rect(wx, top + h * 0.35, mx1(u), h * 0.3, night ? HOT : DARK);
    });
    r.poly([[0.76 * N, gy - 0.3 * N], [0.62 * N, gy - 0.28 * N], [0.76 * N, gy - 0.24 * N]], shade);
    r.rect(0.86 * N, 0.12 * N, 0.03 * N, gy - 0.57 * N, lit);
    r.poly([[0.85 * N, 0.13 * N], [0.875 * N, 0.04 * N], [0.9 * N, 0.13 * N]], lit);
    r.rect(wallX, gy - 0.06 * N, 0.025 * N, 0.06 * N, DARK);
    r.disc(wallX + 0.0125 * N, gy - 0.06 * N, 0.0125 * N, DARK);
    targets.push({ x: wallX - 0.02 * N, y: gy - 0.09 * N, w: 0.07 * N, h: 0.09 * N });
    // the towers roll up (the wheels turn with the ground covered) and drop their ramps at the wall
    for (const tw of w.towers) {
      const th = 0.3 * N, wd = 0.07 * N, rw = 0.018 * N;
      if (!tw.stop) { const v = 0.012 * N * (1 + f.rel.bassDrive); tw.x += (v * dt) / N; tw.ang += (v * dt) / rw; if (tw.x * N + wd >= wallX - 0.005 * N) tw.stop = true; }
      const x = tw.x * N;
      r.rect(x - 0.01 * N, gy - mx1(u) * 0.5, wd + 0.02 * N, mx1(u), DARK + DIM);
      r.rect(x, gy - rw - th, wd, th, DARK);
      for (let k = 1; k < 5; k++) r.rect(x, gy - rw - th * (k / 5), wd, mx1(u * 0.7), LMID + DIM);
      for (const wx of [x + rw, x + wd - rw]) { r.disc(wx, gy - rw, rw, DARK); for (let k = 0; k < 2; k++) { const a = tw.ang + k * 1.57; r.line(wx + Math.cos(a) * rw, gy - rw + Math.sin(a) * rw, wx - Math.cos(a) * rw, gy - rw - Math.sin(a) * rw, LMID); } }
      if (tw.stop) r.poly([[x + wd, gy - rw - th], [wallX + 0.01 * N, gy - 0.09 * N], [wallX + 0.01 * N, gy - 0.07 * N], [x + wd, gy - rw - th + 0.02 * N]], LMID + DIM);
    }
    // the catapults: a frame on wheels, the arm cocked back, over in a snap, back slowly; the stones, each with its
    // shadow on the plain, dust where they land
    for (const c of w.cats) {
      const x = c.x * N;
      c.cool -= dt; c.arm = Math.max(0, c.arm - dt * 2.5);
      r.rect(x, gy - 0.03 * N, 0.07 * N, 0.03 * N, DARK);
      for (const wx of [x + 0.012 * N, x + 0.058 * N]) r.disc(wx, gy - 0.01 * N, 0.012 * N, DARK + DIM);
      const a = c.arm > 0.85 ? lerp(-2.3, -0.9, (1 - c.arm) / 0.15) : c.arm > 0 ? lerp(-0.9, -2.3, (0.85 - c.arm) / 0.85) : -2.3, px = x + 0.03 * N, py = gy - 0.03 * N;
      r.stroke(px, py, px + Math.cos(a) * 0.09 * N, py + Math.sin(a) * 0.09 * N, mx1(1.2 * u), DARK);
      r.rect(px + Math.cos(a) * 0.09 * N - u, py + Math.sin(a) * 0.09 * N - u, 2 * u, 2 * u, MID);
    }
    w.stones = w.stones.filter((st) => {
      st.vy += GR * N * dt; st.x += st.vx * dt; st.y += st.vy * dt;
      const hgt = gy - st.y, fx = faceX(st.y);
      r.rect(st.x - hgt * 0.25 - 1.5 * u, gy - u, 3 * u * (1 - 0.5 * clamp(hgt / (0.4 * N))), mx1(u), DARK + DIM);
      r.disc(st.x, st.y, 1.6 * u, DARK);
      if (st.y >= gy || st.x >= fx) { burst(w.dust, rnd, Math.min(st.x, fx), Math.min(st.y, gy), 12, 0.2 * N, LMID, 0.6); s.shake = Math.max(s.shake, 0.3); return false; }
      return true;
    });
    w.arrows = w.arrows.filter((a) => {
      if (a.life > 0) { a.life -= dt; r.line(a.x, a.y, a.x - a.ex, a.y - a.ey, LMID); return a.life > 0; }
      a.vy += GR * N * dt; a.x += a.vx * dt; a.y += a.vy * dt;
      const sp = Math.hypot(a.vx, a.vy) || 1, ex = (a.vx / sp) * 3 * u, ey = (a.vy / sp) * 3 * u;
      r.line(a.x, a.y, a.x - ex, a.y - ey, LMID);
      if (a.y >= gy || (a.vx > 0 && a.x >= faceX(a.y))) { a.life = 0.8; a.ex = ex; a.ey = ey; a.y = Math.min(a.y, gy); }
      return true;
    });
    // the ram under its roof, the log driven forward on the kicks; sparks off the gate
    const rx = wallX - 0.12 * N;
    if (w.ram > 0) { const was = w.ram; w.ram -= dt * 3; if (was > 0.5 && w.ram <= 0.5) { s.shake = Math.max(s.shake, 0.35); burst(w.sparks, rnd, wallX, gy - 0.03 * N, 8, 0.15 * N, BRIGHT, 0.4); } }
    const q = w.ram > 0.5 ? (1 - w.ram) * 2 : Math.max(0, w.ram) * 2;
    r.poly([[rx - 0.01 * N, gy - 0.05 * N], [rx + 0.05 * N, gy - 0.08 * N], [rx + 0.11 * N, gy - 0.05 * N]], DARK);
    r.rect(rx, gy - 0.05 * N, 0.1 * N, 0.05 * N, DARK + DIM);
    r.rect(rx + 0.01 * N + q * 0.025 * N, gy - 0.03 * N, 0.1 * N, mx1(1.5 * u), MID);
    for (const wx of [rx + 0.015 * N, rx + 0.085 * N]) r.disc(wx, gy - 0.008 * N, 0.008 * N, DARK);
    // the crowd at the lines, standing until the riders come, then running; the beasts, a step every two beats
    const ph = gait(w, f, dt), run = w.scatter > 0;
    w.scatter -= dt;
    for (let i = 0; i < 18; i++) {
      const h = 0.032 * N, role = hash(i, 9), x = (0.04 + i * 0.028) * N - (run ? (1 - clamp(w.scatter / 2)) * 0.12 * N * (0.5 + hash(i, 5)) : 0);
      walker(r, x, gy + 0.015 * N, h, FIG, run ? ph * 2 + i : 0.3, run ? -1 : 1, { hat: role < 0.4 });
      if (role > 0.6) r.rect(x + h * 0.15, gy + 0.015 * N - h * 1.6, mx1(u * 0.7), h * 0.8, FIG);
    }
    for (const b of w.beasts) {
      const sz = 0.16 * N, legH = sz * 0.5, going = b.x < 0.42, ph2 = going ? ph * 0.5 : 0;
      if (going) b.x += (pace(legH, f) * 0.5 * dt) / N;
      const x = b.x * N;
      r.rect(x - sz * 0.5, gy - mx1(u) * 0.5, sz, mx1(u), DARK + DIM);
      for (const k of [-0.32, -0.12, 0.12, 0.32]) { const a = Math.sin(ph2 + (k < 0 ? 0 : 2.2) + (Math.abs(k) > 0.2 ? 0 : 0.5)); r.stroke(x + k * sz, gy - legH, x + k * sz + a * legH * 0.25, gy - Math.max(0, -a) * legH * 0.2, sz * 0.07, DARK); }
      r.ring(x, gy - legH - sz * 0.12, sz * 0.2, sz * 0.4, DARK, 0.6);
      r.rect(x + sz * 0.4, gy - legH - sz * 0.3, sz * 0.25, sz * 0.22, DARK);
      r.stroke(x + sz * 0.6, gy - legH - sz * 0.15, x + sz * 0.85, gy - legH + sz * 0.05, mx1(1.5 * u), LMID);
      r.rect(x - sz * 0.25, gy - legH - sz * 0.6, sz * 0.5, sz * 0.3, DARK + DIM);
      targets.push({ x: x - sz * 0.5, y: gy - legH - sz * 0.6, w: sz, h: legH + sz * 0.6 });
    }
    // the riders: in at a bound per beat, dust at the hooves, a halt before the gate, then back the way they came
    if (w.ridePh !== 'none') {
      w.rideT += dt;
      const sz = 0.055 * N, v = canter(sz, f);
      for (const rd of w.riders) {
        const moving = w.ridePh === 'in' ? rd.x < rd.stop : w.ridePh === 'out';
        if (moving) rd.x += ((w.ridePh === 'out' ? -v : v) * dt) / N;
        if (w.ridePh === 'in') rd.x = Math.min(rd.x, rd.stop);
        const x = rd.x * N, y = gy + 0.01 * N + rd.lane * 0.012 * N, dir = w.ridePh === 'out' ? -1 : 1;
        const seat = horse(r, x, y, sz, FIG, moving ? ph * 2 + rd.lane : 0.2, dir, u);
        walker(r, seat.sx, seat.sy + sz * 0.2, sz * 0.6, FIG, 0, dir, { cap: true });
        r.line(seat.sx, seat.sy - sz * 0.1, seat.sx + dir * sz * 0.6, seat.sy + sz * 0.05, LMID);
        if (moving && f.beat.on && w.dust.length < 120) burst(w.dust, rnd, x - dir * sz * 0.4, y, 3, 0.1 * N, LMID + DIM, 0.6);
      }
      if (w.ridePh === 'in' && w.riders.every((rd) => rd.x >= rd.stop)) { w.ridePh = 'halt'; w.rideT = 0; w.scatter = 2; }
      else if (w.ridePh === 'halt' && w.rideT > 3) w.ridePh = 'out';
      else if (w.ridePh === 'out' && w.riders.every((rd) => rd.x < -0.15)) w.ridePh = 'none';
    }
    w.dust = particles(W, w.dust, LMID);
    w.sparks = particles(W, w.sparks, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- green hills
// Rolling hills with round doors set into their sides, chimney smoke rising ever slower (more of it with the
// level), a mill whose sails turn with the mids, a party tree hung with lanterns swinging on their strings with
// the trebles, small folk dancing in a ring that turns a step per beat, hopping on it; fireworks on the kicks
// (up ever slower under gravity, a burst near the top, sparks raining down), a dragon-shaped one on a drop that
// climbs, loops the sky and bursts. Kinds by the hour: day, evening, night, harvest (haystacks, an autumn tree).
const HILLS_W = { day: [3, 2, 1], evening: [2, 2, 2], night: [1, 2, 3], harvest: [2, 1, 1] };
const greenhills = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, HILLS_W, bandOf(W.a)), smoke: [], rockets: [], sparks: [], ring: 0, ringT: 0, gait: 0, tick: 0, hop: 0, nth: 0, dragon: null, trail: [], glowDoor: -1, glowT: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), tt = (t * 12) | 0, kind = w.kind;
    if (f.section === 'change') w.kind = rollW(rnd, HILLS_W, band);
    if (f.section === 'drop' && !w.dragon) { w.dragon = { x0: (0.35 + rnd() * 0.3) * N, s: 0 }; w.trail.length = 0; }
    for (const h of hits) {
      if (isLow(h) && h.strength > 0.4) w.rockets.push({ x: (0.25 + rnd() * 0.5) * N, y: 0.86 * N, vx: (rnd() - 0.5) * 0.04 * N, vy: -(0.9 + 0.35 * h.strength) * N, c: [HOT, COOL, BRIGHT][w.nth++ % 3] });
      else if (h.kind === 'snare') w.hop = 1;
      else if (isTonal(h)) { w.glowDoor = h.pc % 3; w.glowT = 0.5; }
    }
    w.hop = Math.max(0, w.hop - dt * 3); // the snare's hop: up and down again in a third of a second
    w.glowT -= dt;
    if (tick(w, f, dt)) w.ringT += TAU / 32; // the ring turns a step per beat
    w.ring = follow(w.ring, w.ringT, dt, 0.12);
    const ph = gait(w, f, dt), night = kind === 'night';
    // the sky by the hour; the hills, far to near, lighter with the distance
    if (night) { r.rect(0, 0, N, 0.66 * N, DARK); for (let k = 0; k < 40; k++) r.set(hash(k, 3) * N, hash(k, 4) * 0.55 * N, hash(k, 5 + ((t * 2) | 0)) < 0.9 ? LMID : BRIGHT); r.disc(0.8 * N, 0.14 * N, 0.04 * N, BRIGHT); }
    else if (kind === 'evening') { r.rect(0, 0.4 * N, N, 0.3 * N, HOT + DIM); r.disc(0.15 * N, 0.5 * N, 0.05 * N, HOT); }
    else r.disc(0.82 * N, 0.14 * N, 0.05 * N, kind === 'harvest' ? HOT : BRIGHT);
    const hill = (x, k) => (k === 0 ? 0.6 * N - 0.08 * N * Math.sin((x / N) * 4.5 + 1) - 0.03 * N * Math.sin((x / N) * 11) : k === 1 ? 0.72 * N - 0.08 * N * Math.sin((x / N) * 3.2 + 2.5) - 0.02 * N * Math.sin((x / N) * 9 + 1) : 0.88 * N - 0.06 * N * Math.sin((x / N) * 2.6 + 0.4));
    const HC = [LMID, MID, MID + DIM];
    for (let x = 0; x < N; x++) vline(r, x, hill(x, 0), N, HC[0]);
    // the mill on the far hill: a tower and four sails turning with the mids
    const mx = 0.14 * N, my = hill(mx, 0);
    r.poly([[mx - 0.03 * N, my + 0.01 * N], [mx + 0.03 * N, my + 0.01 * N], [mx + 0.02 * N, my - 0.09 * N], [mx - 0.02 * N, my - 0.09 * N]], DARK);
    for (let k = 0; k < 4; k++) { const a = f.rel.midClock * 1.2 + (k * Math.PI) / 2, ex = mx + Math.cos(a) * 0.075 * N, ey = my - 0.09 * N + Math.sin(a) * 0.075 * N; r.line(mx, my - 0.09 * N, ex, ey, DARK); r.stroke(lerp(mx, ex, 0.3), lerp(my - 0.09 * N, ey, 0.3), ex, ey, mx1(2 * u), LMID + DIM); }
    for (let x = 0; x < N; x++) vline(r, x, hill(x, 1), N, HC[1]);
    // round doors in the middle hill, a window beside each, a chimney with its smoke; haystacks at harvest
    [0.22, 0.47, 0.84].forEach((dx, i) => {
      const x = dx * N, y = hill(x, 1) + 0.035 * N, rad = 0.028 * N, open = w.glowDoor === i && w.glowT > 0;
      r.disc(x, y, rad + mx1(u), LMID);
      r.disc(x, y, rad, open ? BRIGHT : i === 1 ? HOT : i === 0 ? COOL : DARK);
      r.rect(x - u, y - u, 2 * u, 2 * u, open ? HOT : BRIGHT);
      r.rect(x + rad * 1.6, y - rad * 0.3, rad * 0.5, rad * 0.5, open || night ? HOT : BRIGHT);
      r.frame(x + rad * 1.6 - u, y - rad * 0.3 - u, rad * 0.5 + 2 * u, rad * 0.5 + 2 * u, LMID);
      r.rect(x - rad * 2.2, hill(x - rad * 2.2, 1) - 0.03 * N, 0.012 * N, 0.03 * N, DARK);
      if (w.smoke.length < 70 && rnd() < dt * (1 + 3 * f.level)) w.smoke.push(puff(x - rad * 2.2 + 0.006 * N, hill(x - rad * 2.2, 1) - 0.03 * N, -(0.04 + 0.05 * f.level) * N, 3.5));
      if (kind === 'harvest' && i < 2) { const hx = x + 0.1 * N, hy = hill(hx, 1); r.ring(hx, hy + u, 0.012 * N, 0.024 * N, LMID, 0.7); }
    });
    w.smoke = smoke(W, w.smoke, 0.012 * N, night ? MID : LMID);
    // the party tree: a trunk, a crown, lanterns swinging from it on their strings, bright on the beat
    const tx = 0.68 * N, ty = hill(tx, 1) + 0.01 * N, crown = kind === 'harvest' ? HOT + DIM : DARK;
    r.rect(tx - 0.012 * N, ty - 0.14 * N, 0.024 * N, 0.14 * N, DARK);
    for (const [cx, cy, cr] of [[0, -0.19, 0.07], [-0.06, -0.15, 0.05], [0.06, -0.15, 0.05], [0, -0.13, 0.05]]) r.disc(tx + cx * N, ty + cy * N, cr * N, crown);
    for (let k = 0; k < 9; k++) {
      const a0 = (k / 9) * TAU, px = tx + Math.cos(a0) * 0.09 * N, py = ty - 0.16 * N + Math.sin(a0) * 0.05 * N, sw = 0.35 * Math.sin(f.rel.trebClock * 1.3 + k * 1.1), Ls = 0.03 * N;
      const lx = px + Math.sin(sw) * Ls, ly = py + Math.cos(sw) * Ls;
      r.line(px, py, lx, ly, LMID + DIM);
      r.rect(lx - u, ly, 2 * u, 3 * u, f.beat.pulse > 0.5 ? BRIGHT : HOT);
    }
    for (let x = 0; x < N; x++) vline(r, x, hill(x, 2), N, HC[2]);
    // the dancers: eight in a ring, the far ones first and smaller, each hopping on the beat (all of them on a snare):
    // a hop is a parabola, off the ground on the beat and back down on the next
    const rcx = 0.4 * N, rcy = hill(rcx, 2) + 0.03 * N, order = Array.from({ length: 8 }, (_, i) => i).sort((a, b) => Math.sin(w.ring + (a / 8) * TAU) - Math.sin(w.ring + (b / 8) * TAU));
    const bq = beatLocked(f) ? f.beat.phase : (w.gait / Math.PI) % 1, hq = 1 - w.hop, jump = Math.max(4 * bq * (1 - bq), 4 * hq * (1 - hq)) * 3 * u;
    for (const i of order) {
      const a = w.ring + (i / 8) * TAU, sn = Math.sin(a), x = rcx + Math.cos(a) * 0.1 * N, y = rcy + sn * 0.028 * N, h = 0.036 * N * (1 + 0.2 * sn);
      r.rect(x - h * 0.2, y - mx1(u) * 0.5, h * 0.4, mx1(u), DARK + DIM);
      walker(r, x, y - jump, h, FIG, ph + i * 0.4, sn > 0 ? -1 : 1, { hat: i % 2 === 0, coat: i % 3 === 0 });
    }
    targets.push({ x: rcx - 0.12 * N, y: rcy - 0.07 * N, w: 0.24 * N, h: 0.1 * N });
    // the fireworks: each rocket slows as it climbs and bursts at the top of its arc, where it stops rising; the sparks fall
    w.rockets = w.rockets.filter((rk) => {
      rk.vy += GR * N * dt; rk.x += rk.vx * dt; rk.y += rk.vy * dt;
      r.line(rk.x, rk.y, rk.x - rk.vx * 0.04, rk.y - rk.vy * 0.04, BRIGHT);
      if (rk.vy >= 0) { burst(w.sparks, rnd, rk.x, rk.y, 26, 0.3 * N, rk.c, 1); r.disc(rk.x, rk.y, 3 * u, BRIGHT); return false; }
      return true;
    });
    if (w.dragon) { // the dragon firework: a climb, a loop, a climb, the burst; the trail is where it has been
      const d = w.dragon, y0 = 0.86 * N, R = 0.1 * N, cyL = y0 - 0.3 * N - R, v = 0.45 * N, total = 0.45 * N + TAU * R;
      d.s += (v * dt) / total;
      const L = d.s * total;
      let x, y;
      if (L < 0.3 * N) { x = d.x0; y = y0 - L; } else if (L < 0.3 * N + TAU * R) { const a = Math.PI / 2 + (L - 0.3 * N) / R; x = d.x0 + Math.cos(a) * R; y = cyL + Math.sin(a) * R; } else { x = d.x0; y = y0 - 0.3 * N - (L - 0.3 * N - TAU * R); }
      w.trail.push([x, y, t]);
      while (w.trail.length > 60 || (w.trail.length && t - w.trail[0][2] > 1)) w.trail.shift(); // the last second of its path, whatever the frame rate
      const nT = w.trail.length;
      w.trail.forEach(([px, py], i) => r.rect(px - u * 0.5, py - u * 0.5, mx1(u * (0.6 + i / nT)), mx1(u * (0.6 + i / nT)), i < nT / 3 ? HOT + DIM : HOT));
      const prev = w.trail[Math.max(0, w.trail.length - 4)], ang = Math.atan2(y - prev[1], x - prev[0]);
      r.disc(x, y, 2 * u, BRIGHT);
      r.rect(x + Math.cos(ang) * 2.5 * u - u, y + Math.sin(ang) * 2.5 * u - u, 2 * u, 2 * u, HOT);
      for (const k of [-1, 1]) r.line(x, y, x + Math.cos(ang + k * 1.9) * 4 * u, y + Math.sin(ang + k * 1.9) * 4 * u, HOT);
      if (d.s >= 1) { burst(w.sparks, rnd, x, y, 70, 0.45 * N, HOT, 1.4); burst(w.sparks, rnd, x, y, 30, 0.3 * N, BRIGHT, 1); w.dragon = null; }
    }
    w.sparks = particles(W, w.sparks, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- cave lake
// An underground lake under a ceiling of stalactites: a thin crouched creature on a rock, bobbing and muttering,
// its head tilting one way on one beat and the other way on the next, its eyes glowing with the level; a fish
// leaping on the snares along a parabola with splash rings where it leaves and lands; a small gold ring on the
// shore glinting on the beat; drips forming at the stalactite tips and falling under gravity to ripple the water;
// everything above the waterline mirrored in it, broken by ripples that run with the bass. Kinds: still, dripping,
// glow-worms on the ceiling, a shoal. A drop: the creature leaps in, and climbs back onto its rock a while later.
const CAVE_W = { still: [3, 2, 1], dripping: [2, 2, 2], glowworms: [1, 2, 2], shoal: [1, 1, 2] };
const cavelake = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, CAVE_W, bandOf(W.a)), tips: Array.from({ length: 12 }, (_, i) => [(i + 0.5 + (rnd() - 0.5) * 0.6) / 12, 0.1 + rnd() * 0.22]), fish: [], drips: [], rings: [], drops: [], tilt: 0, glint: 0, leap: null, gone: 0, climb: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), buf = r.buf, wy = 0.66 * N, ix = 0.62 * N, kind = w.kind;
    if (f.section === 'change') w.kind = rollW(rnd, CAVE_W, band);
    if (f.section === 'drop' && !w.leap && w.gone <= 0 && w.climb <= 0) w.leap = { x: ix - 0.03 * N, y: wy - 0.14 * N, vx: -0.3 * N, vy: -0.45 * N };
    const splash = (x, n = 1) => { for (let k = 0; k < n; k++) w.rings.push({ x, t: -k * 0.15 }); };
    const drip = () => { const tip = pick(rnd, w.tips); w.drips.push({ x: tip[0] * N, y: tip[1] * N, vy: 0, form: 0 }); };
    for (const h of hits) {
      if (h.kind === 'snare') for (let k = 0; k < (kind === 'shoal' ? 3 : 1); k++) { const x = (0.25 + rnd() * 0.25) * N; w.fish.push({ x, y: wy, vx: (rnd() - 0.3) * 0.2 * N, vy: -(0.35 + rnd() * 0.15) * N }); splash(x); }
      else if (h.kind === 'hat') drip();
      else if (isLow(h) && h.strength > 0.6) s.shake = Math.max(s.shake, 0.1);
    }
    if (rnd() < dt * (0.3 + 2 * f.rel.trebDrive + (kind === 'dripping' ? 2.5 : 0))) drip();
    if (f.beat.on) w.glint = 0.12;
    w.glint -= dt;
    w.tilt = follow(w.tilt, (f.beat.count % 2 ? 1 : -1) * 2 * u, dt, 0.08);
    // the cave: walls either side, the ceiling, stalactites, glow-worms; the island rock
    r.poly([[0, 0], [0.12 * N, 0], [0.08 * N, 0.3 * N], [0.16 * N, wy], [0, wy]], DARK + DIM);
    r.poly([[N, 0], [0.86 * N, 0], [0.9 * N, 0.25 * N], [0.84 * N, wy], [N, wy]], DARK + DIM);
    for (let x = 0; x < N; x += 2) r.rect(x, 0, 2, 0.05 * N + 0.03 * N * Math.sin((x / N) * 7) + 0.02 * N * Math.sin((x / N) * 19), DARK);
    for (const [px, py] of w.tips) { const x = px * N, dy = py * N; r.poly([[x - 0.025 * N, 0.04 * N], [x + 0.025 * N, 0.04 * N], [x, dy]], DARK); r.line(x - 0.02 * N, 0.05 * N, x - 0.004 * N, dy - 0.02 * N, DARK + DIM); }
    if (kind === 'glowworms') for (let k = 0; k < 40; k++) if (hash(k, 7 + ((t * 2) | 0)) < 0.8) r.set(hash(k, 1) * N, hash(k, 2) * 0.3 * N, COOL);
    r.poly([[ix - 0.13 * N, wy + u], [ix - 0.1 * N, wy - 0.05 * N], [ix - 0.03 * N, wy - 0.085 * N], [ix + 0.06 * N, wy - 0.07 * N], [ix + 0.12 * N, wy + u]], MID);
    r.poly([[ix - 0.08 * N, wy - 0.055 * N], [ix - 0.03 * N, wy - 0.08 * N], [ix + 0.04 * N, wy - 0.065 * N]], LMID + DIM);
    // the creature: a round back, the head low and forward, thin arms down to the rock, the eyes; bobbing with
    // the beat, the head tilting on alternate beats, the mouth working; mid-leap, or climbing back up
    const drawIt = (cx, cy, spread) => {
      r.disc(cx, cy, 0.045 * N, FIG);
      r.rect(cx - 0.05 * N, cy + 0.02 * N, 0.08 * N, 0.025 * N, FIG);
      const hx = cx - 0.045 * N + (spread ? -2 * u : w.tilt), hy = cy - 0.03 * N - (spread ? 2 * u : 0);
      r.disc(hx, hy, 0.027 * N, FIG);
      for (const k of [-1, 1]) r.stroke(cx - 0.02 * N + k * 0.02 * N, cy, cx - 0.045 * N + k * 0.035 * N + (spread ? k * 0.03 * N : 0), cy + (spread ? -0.02 * N : 0.075 * N), mx1(u), FIG);
      for (const k of [-1, 1]) r.rect(hx - 0.012 * N + (k > 0 ? 0.018 * N : 0), hy - 0.005 * N, mx1(1.5 * u), mx1(1.5 * u), f.level > 0.6 || f.beat.pulse > 0.7 ? BRIGHT : COOL);
      if (hash((t * 8) | 0, 1) < 0.5) r.rect(hx - 0.02 * N, hy + 0.012 * N, mx1(1.5 * u), mx1(u), DARK);
      targets.push({ x: cx - 0.09 * N, y: cy - 0.07 * N, w: 0.15 * N, h: 0.12 * N });
    };
    if (w.leap) {
      const Lp = w.leap;
      Lp.vy += GR * N * dt; Lp.x += Lp.vx * dt; Lp.y += Lp.vy * dt;
      drawIt(Lp.x, Lp.y, true);
      if (Lp.y >= wy - 0.02 * N) { splash(Lp.x, 3); for (let k = 0; k < 24; k++) w.drops.push({ x: Lp.x, y: wy, vx: (rnd() - 0.5) * 0.4 * N, vy: -(0.1 + rnd() * 0.35) * N, life: 0.7 }); s.shake = Math.max(s.shake, 0.3); w.leap = null; w.gone = 3; }
    } else if (w.gone > 0) { if ((w.gone -= dt) <= 0) w.climb = 1; }
    else if (w.climb > 0) { w.climb -= dt; drawIt(lerp(ix - 0.03 * N, ix - 0.08 * N, w.climb), lerp(wy - 0.11 * N, wy + 0.02 * N, ease(w.climb)), false); }
    else drawIt(ix - 0.02 * N, wy - 0.11 * N + Math.sin(t * 2.2) * u + f.beat.pulse * 1.5 * u, false);
    // the fish in the air and the drips forming and falling, all of it above the water so it is mirrored too
    w.fish = w.fish.filter((fs) => {
      fs.vy += GR * N * dt; fs.x += fs.vx * dt; fs.y += fs.vy * dt;
      const a = Math.atan2(fs.vy, fs.vx), c = Math.cos(a) * 2.5 * u, sn = Math.sin(a) * 2.5 * u;
      r.stroke(fs.x - c, fs.y - sn, fs.x + c, fs.y + sn, mx1(1.5 * u), LMID);
      r.line(fs.x - c, fs.y - sn, fs.x - c * 1.6 - sn * 0.6, fs.y - sn * 1.6 + c * 0.6, LMID);
      if (fs.vy > 0 && fs.y >= wy) { splash(fs.x); return false; }
      return true;
    });
    w.drips = w.drips.filter((d) => {
      if (d.form < 1) { d.form += dt * 2; r.rect(d.x - u * 0.5, d.y, mx1(u), mx1(u * d.form * 1.5), COOL); return true; }
      d.vy += GR * N * dt; d.y += d.vy * dt;
      r.rect(d.x - u * 0.5, d.y - 2 * u, mx1(u), 2 * u, COOL);
      if (d.y >= wy) { w.rings.push({ x: d.x, t: 0, small: true }); return false; }
      return true;
    });
    // the water: everything above mirrored across the waterline and dimmed, the rows broken by ripples; then the
    // splash rings on it, the droplets, the shore in front with the ring glinting on it
    r.rect(0, wy, N, N - wy, COOL + DIM);
    const shift = (f.rel.bassClock * 5) | 0, w0 = wy | 0;
    for (let y = w0; y < N; y++) {
      if ((y + shift) % 6 === 0) continue;
      const sy = 2 * w0 - y - 1, dx = Math.round(Math.sin(y * 0.5 + t * 1.5) * u);
      if (sy < 0) break;
      for (let x = 0; x < N; x++) { const sx = x + dx; if (sx < 0 || sx >= N) continue; const c = buf[sy * N + sx]; buf[y * N + x] = c === BG ? COOL + DIM : c < 8 ? c + DIM : c; }
    }
    w.rings = w.rings.filter((rg) => { rg.t += dt * 1.4; if (rg.t > 0) r.ring(rg.x, wy, rg.t * (rg.small ? 0.03 : 0.07) * N, mx1(u), rg.t < 0.4 ? LMID : COOL, 0.28); return rg.t < 1; });
    w.drops = particles(W, w.drops, COOL);
    r.poly([[0, wy - 0.02 * N], [0.1 * N, wy + 0.01 * N], [0.22 * N, wy + 0.1 * N], [0.26 * N, N], [0, N]], MID + DIM);
    r.ring(0.1 * N, wy + 0.06 * N, 2 * u, mx1(u), w.glint > 0 ? BRIGHT : LMID + DIM, 0.6);
    if (w.glint > 0) r.set(0.1 * N + 2 * u, wy + 0.06 * N - 2 * u, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- mines
// Vast pillared halls in one-point perspective, column after column receding to the vanishing point, a party of
// four walking into them behind a torch whose reach pulses with the beat (the columns lit as far as it goes, the
// hall sliding past at the pace of their stride); drums in the deep on the heavy kicks (the picture shakes, dust
// falls from above, the torch flares), a bucket dropped down a well on a snare that clatters in rings of sound,
// pairs of eyes lighting in the dark on the hats. Kinds: pillars, a bridge over a chasm, arches, tombs. A drop: a
// wall of eyes rushes in out of the dark and the party runs.
const HALL_W = { pillars: [3, 2, 1], bridge: [1, 2, 2], arches: [1, 2, 3], tombs: [2, 1, 1] };
const mines = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, HALL_W, bandOf(W.a)), zoff: 0, gait: 0, eyes: [], dust: [], well: null, run: 0, flare: 0, rush: false });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), tt = (t * 12) | 0, kind = w.kind, cx = 0.5 * N, hy = 0.42 * N, k = 0.3 * N, S = 2.5, Zp = 2.2;
    const sx = (X, Z) => cx + (X * k) / Z, sy = (Y, Z) => hy + ((1 - Y) * k) / Z;
    if (f.section === 'change') w.kind = rollW(rnd, HALL_W, band);
    if (f.section === 'drop' && w.run <= 0) { w.run = 8; w.rush = true; for (let i = 0; i < 40; i++) w.eyes.push({ X: (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 3.2), Z: 14 + rnd() * 6, Y: 0.3 + rnd() * 0.5, life: 12, rush: true, id: i }); }
    for (const h of hits) {
      if (isLow(h) && h.strength > 0.6) { s.shake = Math.max(s.shake, 0.5 * h.strength); w.flare = 0.25; for (let i = 0; i < 16; i++) w.dust.push({ x: rnd() * N, y: -rnd() * 0.1 * N, vx: 0, vy: 0, life: 2, c: MID + DIM }); }
      else if (h.kind === 'snare' && !w.well) w.well = { Z: 3.5, X: 1.0, by: 0.5, vy: 0, down: false, rings: [], t: 0 };
      else if (h.kind === 'hat') w.eyes.push({ X: (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 2.5), Z: 6 + rnd() * 12, Y: 0.3 + rnd() * 0.4, life: 1.5 + rnd() * 1.5, rush: false, id: Math.floor(rnd() * 1000) });
    }
    w.flare -= dt;
    w.run -= dt;
    const ph = gait(w, f, dt), running = w.run > 0, v = 0.18 * bps(f) * (running ? 2.5 : 1); // world units per second: the stride, at a step per beat
    w.zoff += v * dt;
    const reach = 4 + 3 * f.level + 2 * f.beat.pulse + (w.flare > 0 ? 2 : 0), shadeOf = (Z) => { const b = 1 - (Z - Zp) / reach; return b > 0.66 ? LMID : b > 0.33 ? MID : b > 0.05 ? DARK : -1; };
    // the floor: joints sliding toward us, the lines converging; the chasm either side of the walkway in the bridge
    if (kind === 'bridge') { r.poly([[cx, hy], [cx - k, hy + 2 * k], [0, hy + 2 * k], [0, hy]], BLACK); r.poly([[cx, hy], [cx + k, hy + 2 * k], [N, hy + 2 * k], [N, hy]], BLACK); }
    for (let j = 0; j < 10; j++) { const Z = ((((j * S - w.zoff) % (10 * S)) + 10 * S) % (10 * S)) + 0.8, y = sy(0, Z), c = shadeOf(Z); if (c >= 0 && Z > 0.8) r.rect(kind === 'bridge' ? sx(-0.5, Z) : 0, y, kind === 'bridge' ? sx(0.5, Z) - sx(-0.5, Z) : N, mx1(u * 0.7), c === LMID ? MID : DARK + DIM); }
    for (const X of kind === 'bridge' ? [-0.5, 0.5] : [-3.2, -1.4, 1.4, 3.2]) r.line(cx, hy, sx(X, 0.5), sy(0, 0.5), DARK + DIM);
    r.ring(cx, sy(0, Zp), 0.06 * N, 0.12 * N * (0.8 + 0.3 * f.beat.pulse), LMID + DIM, 0.3);
    // the columns, far to near, lit by the torch's reach, a darker facet on the outer side, a capital and a base;
    // arches between the near files in that kind, a stone box in the tombs
    const cols = [];
    for (let j = 0; j < 8; j++) { const Z = ((((j * S - w.zoff) % (8 * S)) + 8 * S) % (8 * S)) + 1; for (const X of [-3.2, -1.4, 1.4, 3.2]) cols.push([Z, X]); }
    cols.sort((a, b) => b[0] - a[0]);
    for (const [Z, X] of cols) {
      const c = shadeOf(Z);
      if (c < 0) continue;
      const x = sx(X, Z), hw = (0.18 * k) / Z, top = sy(3.5, Z), base = sy(0, Z);
      r.rect(x - hw, top, 2 * hw, base - top, c);
      r.rect(X < 0 ? x - hw : x + hw * 0.4, top, hw * 0.6, base - top, c === LMID ? MID : c === MID ? DARK : DARK + DIM);
      r.rect(x - hw * 1.4, base - hw * 0.5, hw * 2.8, hw * 0.5, c);
      if (top > -hw) r.rect(x - hw * 1.4, top, hw * 2.8, hw * 0.6, c);
      if (kind === 'arches' && X === 1.4) { const rad = (1.4 * k) / Z; for (let i = 0; i < 7; i++) { const a0 = Math.PI + (i * Math.PI) / 7, a1 = Math.PI + ((i + 1) * Math.PI) / 7; r.stroke(cx + Math.cos(a0) * rad, top + Math.sin(a0) * rad * 0.6, cx + Math.cos(a1) * rad, top + Math.sin(a1) * rad * 0.6, mx1(hw * 0.5), c); } }
    }
    if (kind === 'tombs') { const Z = ((((4 * S - w.zoff) % (8 * S)) + 8 * S) % (8 * S)) + 1, c = shadeOf(Z); if (c >= 0) { r.rect(sx(-0.5, Z), sy(0.6, Z), sx(0.5, Z) - sx(-0.5, Z), sy(0, Z) - sy(0.6, Z), c); r.rect(sx(-0.55, Z), sy(0.65, Z), sx(0.55, Z) - sx(-0.55, Z), sy(0.6, Z) - sy(0.65, Z) + mx1(u), c === LMID ? BRIGHT : LMID); } }
    // the well and the bucket: it drops under gravity, then the clatter rings out; the well slides past with the hall
    if (w.well) {
      const wl = w.well;
      wl.Z -= v * dt; wl.t += dt;
      const x = sx(wl.X, wl.Z), y = sy(0, wl.Z), rad = (0.35 * k) / wl.Z;
      r.ring(x, y, rad, mx1(u), MID, 0.4);
      if (!wl.down) { wl.vy += GR * N * dt; wl.by -= (wl.vy * dt * wl.Z) / k; if (wl.by <= 0) { wl.down = true; for (let i = 0; i < 4; i++) wl.rings.push(-i * 0.2); } r.rect(x - 1.5 * u, sy(wl.by, wl.Z) - 2 * u, 3 * u, 2 * u, DARK); }
      wl.rings = wl.rings.map((q) => q + dt * 1.8).filter((q) => q < 1);
      for (const q of wl.rings) if (q > 0) r.ring(x, y, rad + q * 0.15 * N, mx1(u), LMID + DIM, 0.4);
      if (wl.Z < 1.2 || wl.t > 4) w.well = null;
    }
    // eyes in the dark: a pair each, blinking; the rush comes on fast out of the far dark and stops short of us
    w.eyes = w.eyes.filter((e) => {
      e.life -= dt;
      if (e.rush) { e.Z = Math.max(4, e.Z - 6 * dt); if (e.Z <= 4) e.life = Math.min(e.life, 2); }
      if (e.Z < 1 || hash(e.id, (t * 3) | 0) < 0.1) return e.life > 0;
      const x = sx(e.X, e.Z), y = sy(e.Y, e.Z), gap = (0.12 * k) / e.Z, c = e.life < 0.5 ? COOL + DIM : COOL;
      r.rect(x - gap - u * 0.5, y, mx1(u), mx1(u), c);
      r.rect(x + gap - u * 0.5, y, mx1(u), mx1(u), c);
      return e.life > 0;
    });
    // the party: four walking in, the second with the torch; their legs in step, faster at the run
    [[-0.5, 2.0], [-0.17, 2.3], [0.17, 2.1], [0.5, 2.4]].forEach(([X, Z], i) => {
      const x = sx(X, Z), base = sy(0, Z), h = (0.9 * k) / Z;
      r.rect(x - h * 0.2, base - mx1(u) * 0.5, h * 0.4, mx1(u), DARK);
      const J = walker(r, x, base, h, FIG, running ? ph * 2 + i : ph + i * 0.3, 1, { hat: i === 0, coat: i === 3 });
      if (i === 1) { r.line(J.sx, J.sy, J.sx + 2 * u, J.top - h * 0.3, DARK); flame(r, J.sx + 2 * u, J.top - h * 0.3, 3 * u, (5 + 2.5 * f.beat.pulse + (w.flare > 0 ? 3 : 0)) * u, tt, 7); }
      if (i === 1) targets.push({ x: x - h * 0.3, y: base - h * 1.3, w: h * 0.6, h: h * 1.3 });
    });
    w.dust = particles(W, w.dust, MID + DIM);
  },
};

// ---------------------------------------------------------------------------------------------- charge
// A cavalry charge down a slope at sunrise into a dark army: the horses at a bound per beat, the field running
// under them at the pace of the bound (the near tufts faster than the far ones), lowered spears, banners
// streaming with the trebles, the dark mass ahead bristling with pikes, arrows out of it on the snares, a horn
// on the kicks; the gap closes to the melee, the horses dropping to a trot, dust rising. Kinds: lancers,
// banners, heavy horse, light horse (bows, and they shoot back on the snares). A drop: the sun crests the hill
// behind the riders and a band of light sweeps down the field; the dark army turns and gives way before it. A
// section change is a fresh charge from the top of the slope.
const RIDER_W = { lancers: [2, 2, 2], banners: [2, 2, 1], heavy: [1, 2, 3], light: [2, 1, 1] };
const charge = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, RIDER_W, bandOf(W.a)), gap: 0.5, scroll: 0, flee: 0, gait: 0, bound: 0, dust: [], arrows: [], horn: 0, sunY: 0.6, sweep: -1, recoil: 0, riders: Array.from({ length: 7 }, (_, i) => ({ x: 0.1 + i * 0.05 + rnd() * 0.02, lane: i % 3, off: rnd() * 0.8 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), kind = w.kind, ground = (x) => 0.6 * N + 0.14 * N * (x / N) + 0.012 * N * Math.sin((x / N) * 9 + 1);
    if (f.section === 'change') { w.kind = rollW(rnd, RIDER_W, band); w.gap = 0.5; w.recoil = 0; }
    if (f.section === 'drop' && w.sweep < 0) { w.sweep = 0; w.recoil = 2.5; w.sunY = 0.38; }
    const melee = w.gap <= 0.02;
    for (const h of hits) {
      if (isLow(h)) { w.horn = 0.5; s.shake = Math.max(s.shake, 0.1 * h.strength); }
      else if (h.kind === 'snare') {
        const n = 4 + 4 * band;
        for (let k = 0; k < n; k++) { const a = 2.2 + rnd() * 0.3, v = (0.45 + rnd() * 0.2) * N, x = (0.5 + w.gap + rnd() * 0.4) * N; w.arrows.push({ x, y: ground(x) - 0.05 * N, vx: v * Math.cos(a), vy: -v * Math.sin(a), life: 0, ex: 0, ey: 0 }); }
        if (kind === 'light') for (const rd of w.riders) { const a = 0.9 + rnd() * 0.2, v = 0.5 * N; w.arrows.push({ x: rd.x * N, y: ground(rd.x * N) - 0.08 * N, vx: v * Math.cos(a), vy: -v * Math.sin(a), life: 0, ex: 0, ey: 0 }); }
      }
    }
    w.horn -= dt;
    w.recoil -= dt;
    const going = w.recoil > 0, trot = melee || going, runPace = 2.5 * pace(0.045 * N, f); // the army breaks at a run: its own stride, doubled
    const ph = gait(w, f, dt) * (trot ? 1 : 2), sz0 = 0.07 * N * (kind === 'heavy' ? 1.2 : kind === 'light' ? 0.9 : 1), v = canter(sz0, f) * (trot ? 0.5 : 1);
    if (going) { w.gap += (runPace * dt) / N; w.flee += runPace * dt; }
    w.gap = Math.max(0, w.gap - (v * dt) / N);
    w.scroll += v * dt;
    // the sky: the sun low behind the hill crest at the left, up over it after a drop, a glow around it; the far
    // range; the slope, lit where the band of light passes; tufts on the field running by, the near ones faster
    if (w.sweep >= 0) { w.sweep += dt * 0.7; if (w.sweep > 1.6) w.sweep = -1; }
    const bandX = w.sweep >= 0 ? w.sweep * 1.4 * N - 0.2 * N : -N, inBand = (x) => Math.abs(x - bandX) < 0.1 * N;
    r.disc(0.12 * N, w.sunY * N, 0.12 * N, HOT + DIM);
    r.disc(0.12 * N, w.sunY * N, 0.06 * N, BRIGHT);
    for (let k = 0; k < 4; k++) r.rect(0.2 * N + k * 0.1 * N, (0.3 + k * 0.06) * N, 0.3 * N, mx1(u), LMID + DIM);
    range(r, N, 0.34 * N, 0.2 * N, 0.75 * N, 0.02 + w.scroll / N / 40, 13, LMID);
    for (let x = 0; x < N; x++) vline(r, x, ground(x), N, inBand(x) ? LMID : MID);
    for (let k = 0; k < 30; k++) { const d = hash(k, 2), x = ((((hash(k, 1) * 1.2 * N - w.scroll * (0.6 + d)) % (1.2 * N)) + 1.2 * N) % (1.2 * N)) - 0.1 * N, y = ground(x) + d * (N - ground(x)) * 0.9; r.rect(x, y - 2 * u, mx1(u), 2 * u * (0.5 + d), MID + DIM); }
    // the dark army: three rows on the slope beyond the gap, pikes over them, a few plain banners; standing, or
    // turned and going when it recoils
    const xf = (0.5 + w.gap) * N;
    for (let row = 2; row >= 0; row--) {
      const h = 0.035 * N * (1 + 0.3 * row), sp = h * 0.6, lift = (2 - row) * 0.02 * N;
      for (let x = xf + row * 0.01 * N + (going ? w.flee % sp : 0); x < N + sp; x += sp) {
        const base = ground(x) - lift, i = Math.floor(x / sp), role = hash(i, row), col = inBand(x) ? BRIGHT : BLACK;
        walker(r, x, base, h, col, going ? w.gait * 2 + i : 0.3, going ? 1 : -1, { hat: role < 0.6 });
        if (role > 0.5) r.rect(x + h * 0.15, base - h * 1.8, mx1(u * 0.7), h * 1.1, col);
        if (role > 0.93) { r.rect(x, base - h * 2.3, mx1(u * 0.7), h * 1.6, col); r.poly([[x, base - h * 2.3], [x + h * 0.6, base - h * 2.1 + Math.sin(f.rel.trebClock * 2 + i) * h * 0.1], [x, base - h * 1.9]], HOT); }
      }
    }
    if (melee && w.dust.length < 100) w.dust.push(puff(xf + (rnd() - 0.5) * 0.1 * N, ground(xf), -0.04 * N, 2, (rnd() - 0.5) * 0.1 * N));
    // the riders: a bound per beat, spears down, banners back in the wind; dust at the hooves at every bound;
    // the horn from the lead rider on the kicks, rings of its call spreading
    const bound = Math.floor(ph / TAU);
    const stepNow = bound !== w.bound;
    w.bound = bound;
    const sorted = [...w.riders].sort((a, b) => a.lane - b.lane);
    sorted.forEach((rd, i) => {
      const sz = sz0 * (1 + 0.12 * rd.lane), x = rd.x * N, base = ground(x) + rd.lane * 0.012 * N, col = inBand(x) ? BRIGHT : FIG;
      if (stepNow && w.dust.length < 100) w.dust.push(puff(x - sz * 0.4, base, -0.03 * N, 1.2, -v * 0.3));
      const seat = horse(r, x, base, sz, col, ph + rd.off, 1, u, DARK);
      walker(r, seat.sx, seat.sy + sz * 0.2, sz * 0.6, col, 0, 1, { hat: kind === 'heavy', cap: kind !== 'heavy' });
      if (kind !== 'light') r.line(seat.sx - sz * 0.2, seat.sy - sz * 0.15, seat.sx + sz * 0.9, seat.sy + sz * 0.15, LMID); // the spear, lowered
      else r.ring(seat.sx - sz * 0.1, seat.sy - sz * 0.1, sz * 0.2, mx1(u * 0.8), LMID);
      if (kind === 'banners' ? i % 3 === 1 : i === sorted.length - 1) { const px = seat.sx - sz * 0.1, py = seat.sy - sz * 0.6; r.line(px, seat.sy, px, py, LMID); r.poly([[px, py], [px - sz * 0.45, py + sz * 0.08 + Math.sin(f.rel.trebClock * 2 + i) * sz * 0.08], [px, py + sz * 0.2]], HOT); }
      if (i === sorted.length - 1) {
        if (w.horn > 0) { r.poly([[seat.sx + sz * 0.1, seat.sy - sz * 0.35], [seat.sx + sz * 0.3, seat.sy - sz * 0.45], [seat.sx + sz * 0.3, seat.sy - sz * 0.25]], LMID); r.ring(seat.sx + sz * 0.3, seat.sy - sz * 0.35, (0.5 - w.horn) * 0.25 * N, mx1(u), w.horn > 0.3 ? BRIGHT : LMID + DIM); }
        targets.push({ x: x - sz * 0.5, y: base - sz * 1.2, w: sz * 1.1, h: sz * 1.2 });
      }
    });
    w.dust = smoke(W, w.dust, -v * 0.2, LMID + DIM);
    w.arrows = w.arrows.filter((a) => {
      if (a.life > 0) { a.life -= dt; r.line(a.x, a.y, a.x - a.ex, a.y - a.ey, LMID); return a.life > 0; }
      a.vy += GR * N * dt; a.x += a.vx * dt; a.y += a.vy * dt;
      const sp = Math.hypot(a.vx, a.vy) || 1, ex = (a.vx / sp) * 3 * u, ey = (a.vy / sp) * 3 * u;
      r.line(a.x, a.y, a.x - ex, a.y - ey, LMID);
      if (a.y >= ground(a.x)) { a.life = 0.6; a.ex = ex; a.ey = ey; a.y = ground(a.x); }
      return a.x > -N && a.x < 2 * N;
    });
  },
};

// ---------------------------------------------------------------------------------------------- fire mountain
// The volcano from its flank: lava rivers running down the slope with the bass (bright bands flowing in them),
// ash falling slowly through the dark, two tiny figures climbing the cliff path, one holding the other up, a step
// per beat with their shadows on the rock; a chain at the first one's neck with a jewel glinting on the tonal
// hits and the beat; the crater glowing with the bass, a fountain out of it on the kicks, a rock knocked loose on
// a snare that bounces down the slope. Kinds: smoulder, flowing (more rivers), raging (a fountain all the time),
// ashen (thick ash). A drop: the jewel falls into the fire and the mountain erupts (rocks on ballistic arcs,
// clouds rolling down the flank, the path shedding stones, the picture shaking), then calm, and the two go down.
const PEAK_W = { smoulder: [3, 2, 1], flowing: [2, 2, 2], raging: [0, 1, 3], ashen: [2, 1, 1] };
const firemountain = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, PEAK_W, bandOf(W.a)), p: 0.05 + rnd() * 0.3, dir: 1, gait: 0, ash: [], rocks: [], clouds: [], sparks: [], chips: [], jewel: null, erupt: 0, flow: 0, glint: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), buf = r.buf, kind = w.kind, tt = (t * 12) | 0, crX = 0.72 * N, crY = 0.22 * N;
    const slopeY = (x) => { const q = x / N, pts = [[0, 0.9], [0.3, 0.72], [0.55, 0.45], [0.68, 0.23], [0.76, 0.23], [1, 0.42]]; let i = 0; while (i < pts.length - 2 && q > pts[i + 1][0]) i++; const [a, b] = [pts[i], pts[i + 1]]; return (lerp(a[1], b[1], clamp((q - a[0]) / (b[0] - a[0]))) + 0.008 * Math.sin(q * 40) + 0.01 * Math.sin(q * 13)) * N; };
    if (f.section === 'change') w.kind = rollW(rnd, PEAK_W, band);
    const erupting = w.erupt > 0;
    for (const h of hits) {
      if (isLow(h)) burst(w.sparks, rnd, crX + (rnd() - 0.5) * 0.04 * N, crY, 4 + 10 * h.strength, (0.25 + 0.2 * h.strength) * N, HOT, 1.2);
      else if (h.kind === 'snare' && h.strength > 0.5 && w.rocks.length < 12) w.rocks.push({ x: (0.56 + rnd() * 0.08) * N, y: slopeY(0.6 * N) - 0.03 * N, vx: -(0.1 + rnd() * 0.1) * N, vy: -0.1 * N, sz: (1.5 + rnd() * 2) * u, life: 5 });
      else if (isTonal(h)) w.glint = 0.15;
    }
    if (f.beat.on) w.glint = Math.max(w.glint, 0.1);
    w.glint -= dt;
    if (kind === 'raging' || erupting) burst(w.sparks, rnd, crX, crY, erupting ? 3 : 1, 0.35 * N, HOT, 1.2);
    w.flow += dt * (erupting ? 20 : 0);
    // the sky over the crater: its glow, embers in the air; the mountain, column by column; the lava rivers, bands
    // of brighter fire flowing down them with the bass
    const glow = 0.6 + 0.4 * f.rel.bassDrive + (erupting ? 0.6 : 0);
    r.disc(crX, crY, 0.1 * N * glow, HOT + DIM);
    for (let k = 0; k < 20; k++) r.set(crX + (hash(k, 1) - 0.5) * 0.4 * N, crY - hash(k, 2 + ((t * 0.5) | 0)) * 0.2 * N, k % 3 ? HOT : BRIGHT);
    for (let x = 0; x < N; x++) vline(r, x, slopeY(x), N, DARK);
    r.ring(crX, crY + 0.01 * N, 0.03 * N, 0.025 * N, HOT, 0.4);
    const rivers = kind === 'flowing' || erupting ? [[0.69, 0, 0.012], [0.7, 0, 0.05], [0.75, 1, 0.012]] : [[0.69, 0, 0.012], [0.75, 1, 0.03]], flow = f.rel.bassClock * 8 + w.flow;
    for (const [x0, side, off] of rivers) {
      for (let x = x0 * N; side ? x < N : x > 0; x += side ? 2 : -2) { const y = slopeY(x) + off * N + 0.01 * N * Math.sin(x * 0.2), q = (((x * 0.4) / u + (side ? -flow : flow)) % 7 + 7) % 7; r.rect(x, y, 2, mx1(1.5 * u * (1 + 0.5 * f.rel.bassDrive)), q < 2 ? BRIGHT : HOT); }
    }
    // the path and the two on it: the first leads, the second leans on him; a step per beat along the slope, their
    // shadows on the rock; the jewel on its chain, or falling; crouched while the mountain goes
    const pathX = (p) => lerp(0.05 * N, 0.64 * N, p), ph = gait(w, f, dt), FHt = 0.05 * N;
    for (let p = 0; p < 1; p += 0.02) r.rect(pathX(p), slopeY(pathX(p)) - u, 2 * u, mx1(u), LMID + DIM);
    if (!erupting && (w.dir > 0 ? w.p < 1 : w.p > 0)) { const x = pathX(w.p), slope = (slopeY(x + 2 * u) - slopeY(x)) / (2 * u); w.p += (w.dir * pace(FHt, f) * dt * Math.cos(Math.atan(slope))) / (0.59 * N); }
    if (w.p >= 1) { w.p = 1; if (!erupting && !w.jewel) w.rest = (w.rest || 0) + dt; if (w.rest > 6) { w.dir = -1; w.rest = 0; } }
    if (w.p <= 0) { w.p = 0; w.dir = 1; }
    const x1 = pathX(w.p), x2 = pathX(w.p - 0.025 * w.dir), y1 = slopeY(x1), y2 = slopeY(x2), crouch = erupting ? 0.7 : 1;
    r.rect(x2 - FHt * 0.2, y2 - mx1(u) * 0.5, FHt * 0.4, mx1(u), DARK + DIM);
    r.rect(x1 - FHt * 0.2, y1 - mx1(u) * 0.5, FHt * 0.4, mx1(u), DARK + DIM);
    const J2 = walker(r, x2, y2, FHt * 0.85 * crouch, FIG, erupting ? 0 : ph + 0.5, w.dir, { coat: true });
    const J1 = walker(r, x1, y1, FHt * crouch, FIG, erupting ? 0 : ph, w.dir, { coat: true });
    r.stroke(J1.sx - w.dir * FHt * 0.3, J1.sy, J2.sx, J2.sy, mx1(u), FIG);
    if (f.section === 'drop' && !w.jewel && !erupting) w.jewel = { x: J1.sx, y: J1.sy + 2 * u, vx: w.dir * 0.03 * N, vy: -0.05 * N };
    if (!w.jewel) { r.line(x1, J1.head + 2 * u, x1 + w.dir * u, J1.head + 4 * u, LMID); r.rect(x1 + w.dir * u - u * 0.5, J1.head + 4 * u, mx1(u), mx1(u), w.glint > 0 ? BRIGHT : HOT); }
    targets.push({ x: x1 - FHt * 0.5, y: y1 - FHt * 1.1, w: FHt, h: FHt * 1.1 });
    if (w.jewel) {
      const j = w.jewel;
      j.vy += GR * N * dt; j.x += j.vx * dt; j.y += j.vy * dt;
      r.rect(j.x - u * 0.5, j.y - u * 0.5, mx1(u), mx1(u), tt % 2 ? BRIGHT : HOT);
      const inFire = j.y >= slopeY(j.x) + 0.008 * N || (j.x > 0.66 * N && j.x < 0.78 * N && j.y >= crY);
      if (inFire) { // the eruption
        w.jewel = null; w.erupt = 7; w.rest = 0;
        s.shake = Math.max(s.shake, 1);
        for (let k = 0; k < 18; k++) w.rocks.push({ x: crX + (rnd() - 0.5) * 0.04 * N, y: crY, vx: (rnd() - 0.5) * 0.6 * N, vy: -(0.4 + rnd() * 0.5) * N, sz: (2 + rnd() * 3) * u, life: 6 });
        for (let k = 0; k < 22; k++) w.clouds.push(puff(crX + (rnd() - 0.5) * 0.08 * N, crY, -(0.1 + rnd() * 0.2) * N, 5 + rnd() * 3, (rnd() - 0.5) * 0.5 * N));
        for (let k = 0; k < 14; k++) { const px = pathX(rnd()); w.chips.push({ x: px, y: slopeY(px), vx: -rnd() * 0.05 * N, vy: 0, life: 3, c: MID }); }
      }
    }
    if (erupting) { w.erupt -= dt; if (w.erupt <= 0) w.dir = -1; if (rnd() < dt * 6 && w.clouds.length < 50) w.clouds.push(puff(crX + (rnd() - 0.5) * 0.06 * N, crY, -0.15 * N, 5, (rnd() - 0.5) * 0.4 * N)); s.shake = Math.max(s.shake, 0.3); }
    // rocks on their arcs, bouncing down the slope; the clouds rolling down the flank; ash all the while
    w.rocks = w.rocks.filter((rk) => {
      rk.vy += GR * N * dt; rk.x += rk.vx * dt; rk.y += rk.vy * dt; rk.life -= dt;
      const gy = slopeY(rk.x);
      if (rk.y >= gy) { rk.y = gy; rk.vy = -Math.abs(rk.vy) * 0.45; rk.vx = rk.vx * 0.85 + (rk.x < crX ? -1 : 1) * 0.04 * N; }
      r.rect(rk.x - rk.sz / 2, rk.y - rk.sz, rk.sz, rk.sz, rk.y < gy - 2 * u && hash(rk.sz * 10 | 0, tt) < 0.3 ? HOT : BLACK);
      return rk.life > 0 && rk.x > -0.1 * N && rk.x < 1.1 * N;
    });
    w.clouds = w.clouds.filter((p) => { const gy = slopeY(p.x); if (p.y > gy - 2 * u) { p.y = gy - 2 * u; p.vy = Math.min(p.vy, 0); p.vx += (p.x < crX ? -1 : 1) * 0.3 * N * dt; } return true; });
    w.clouds = smoke(W, w.clouds, 0, MID + DIM);
    w.sparks = particles(W, w.sparks, HOT);
    w.chips = particles(W, w.chips, MID);
    drift(W, w.ash, Math.round((20 + 30 * f.level) * u * (kind === 'ashen' ? 3 : 1) * (erupting ? 2 : 1)), 0.04, 0.01, 4, LMID + DIM);
  },
};

// ---------------------------------------------------------------------------------------------- tree shepherds
// Tree giants walking a river valley past a ruined tower: a slow gait, a step every two beats, the ground
// shaking and dust rising at every footfall, their crowns swaying with the trebles, their eyes lit on the beat;
// birds flitting out of the crowns on the hats; saplings on the valley floor growing as time goes; a stone
// thrown at the tower on the heavy snares, on a true arc; a dam up the valley holding back the river. Kinds:
// spring, summer, autumn, storm (rain on the wind). A drop breaks the dam: the flood races across the floor as a
// wavefront, slowing as it spreads, carrying logs, slamming the tower, then draining away.
const VALE_W = { spring: [2, 2, 1], summer: [3, 2, 1], autumn: [2, 2, 2], storm: [0, 1, 3] };
const treeshepherds = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, VALE_W, band), gait: 0, giants: Array.from({ length: 2 + (band === 2 ? 1 : 0) }, (_, i) => ({ x: 0.2 + i * 0.3 + rnd() * 0.1, sz: 0.85 + rnd() * 0.3, off: rnd() * TAU, last: [0, 0] })),
      saps: Array.from({ length: 8 }, (_, i) => ({ x: 0.1 + i * 0.1 + rnd() * 0.05, h: rnd() * 0.5 })), birds: [], dust: [], stones: [], chips: [], flood: null, rain: [], debris: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), kind = w.kind, gy = 0.82 * N, damX = 0.1 * N, twX = 0.84 * N;
    if (f.section === 'change') w.kind = rollW(rnd, VALE_W, band);
    if (f.section === 'drop' && !w.flood) { w.flood = { front: damX, t: 0, hit: false, logs: Array.from({ length: 6 }, () => ({ x: damX - rnd() * 0.05 * N, bob: rnd() * TAU })) }; s.shake = Math.max(s.shake, 0.6); for (let k = 0; k < 14; k++) w.debris.push({ x: damX + rnd() * 0.02 * N, y: gy - rnd() * 0.12 * N, vx: (0.1 + rnd() * 0.3) * N, vy: -rnd() * 0.1 * N, life: 2.5, c: DARK }); }
    for (const h of hits) {
      if (h.kind === 'hat') { const g = pick(rnd, w.giants), GH = 0.42 * N * g.sz; w.birds.push({ x: g.x * N, y: gy - GH * 1.05, vx: (rnd() < 0.5 ? -1 : 1) * (0.15 + rnd() * 0.1) * N, vy: -0.04 * N, s: rnd() * TAU }); }
      else if (h.kind === 'snare' && h.strength > 0.6 && w.stones.length < 3) { // a stone at the tower, on the arc that gets there
        const g = w.giants.reduce((a, b) => (Math.abs(b.x - 0.84) < Math.abs(a.x - 0.84) ? b : a)), GH = 0.42 * N * g.sz, x0 = g.x * N + GH * 0.3, y0 = gy - GH * 0.8, R = twX - 0.03 * N - x0, D = y0 - 0.5 * N, th = 0.9, c2 = Math.cos(th) ** 2;
        if (R > 0.05 * N) { const v = Math.sqrt((GR * N * R * R) / (2 * c2 * Math.max(0.05 * N, R * Math.tan(th) - D))); w.stones.push({ x: x0, y: y0, vx: v * Math.cos(th), vy: -v * Math.sin(th) }); }
      }
      else if (isLow(h) && h.strength > 0.7) s.shake = Math.max(s.shake, 0.15);
    }
    const ph = gait(w, f, dt) * 0.5, leaf = kind === 'autumn' ? HOT + DIM : kind === 'storm' ? MID + DIM : kind === 'spring' ? LMID : MID;
    // the sky, the far hills, the floor; the dam and the river behind it; the ruined tower
    if (kind === 'storm') for (let x = 0; x < N; x += 2) r.rect(x, 0, 2, 0.2 * N + 0.04 * N * Math.sin((x / N) * 7 + t * 0.5), DARK + DIM);
    else r.disc(0.7 * N, 0.12 * N, 0.045 * N, kind === 'autumn' ? HOT : BRIGHT);
    range(r, N, 0.5 * N, 0.14 * N, gy, 0.03, 17, LMID);
    r.rect(0, gy, N, N - gy, MID);
    r.rect(0, gy, N, mx1(u), LMID + DIM);
    const level = w.flood ? Math.max(0.02, 0.12 - w.flood.t * 0.015) : 0.12;
    r.rect(0, gy - level * N, damX, level * N, COOL + DIM);
    r.rect(0, gy - level * N, damX, mx1(u), COOL);
    if (w.flood) { r.rect(damX - 0.02 * N, gy - 0.14 * N, 0.02 * N, 0.04 * N, DARK); r.rect(damX - 0.02 * N, gy - 0.02 * N, 0.02 * N, 0.02 * N, DARK); }
    else { r.rect(damX - 0.02 * N, gy - 0.14 * N, 0.02 * N, 0.14 * N, DARK); for (let y = gy - 0.12 * N; y < gy; y += 0.02 * N) r.rect(damX - 0.02 * N, y, 0.02 * N, mx1(u * 0.6), LMID + DIM); }
    r.rect(twX - 0.04 * N, 0.44 * N, 0.08 * N, gy - 0.44 * N, DARK);
    r.rect(twX - 0.04 * N, 0.44 * N, mx1(u), gy - 0.44 * N, LMID + DIM);
    r.poly([[twX - 0.04 * N, 0.44 * N], [twX - 0.02 * N, 0.4 * N], [twX, 0.45 * N], [twX + 0.02 * N, 0.38 * N], [twX + 0.04 * N, 0.44 * N]], DARK);
    for (let k = 0; k < 3; k++) r.rect(twX - 0.005 * N, (0.52 + k * 0.1) * N, 0.01 * N, 0.03 * N, BLACK);
    for (let k = 0; k < 4; k++) r.disc(twX + (hash(k, 3) - 0.5) * 0.14 * N, gy - u, 2 * u, DARK);
    // the saplings, growing; the giants, far to near: roots for feet, a step every two beats, the trunk, the branch
    // arms, the crown swaying, two eyes; the ground shakes and dust rises when a foot comes down
    for (const sp of w.saps) { sp.h = Math.min(1, sp.h + dt * 0.012); const x = sp.x * N, hh = 6 * u * sp.h; r.line(x, gy, x, gy - hh, DARK); r.rect(x - u, gy - hh, mx1(u), mx1(u), leaf); r.rect(x + u * 0.5, gy - hh * 0.6, mx1(u), mx1(u), leaf); }
    for (const g of [...w.giants].sort((a, b) => a.sz - b.sz)) {
      const GH = 0.42 * N * g.sz, v = 0.11 * GH * bps(f);
      g.x += (v * dt) / N;
      if (g.x > 1.25) g.x = -0.25;
      const x = g.x * N, phase = ph + g.off;
      r.ring(x, gy, GH * 0.12, GH * 0.24, DARK + DIM, 0.25);
      for (const k of [0, 1]) {
        const a = phase + k * Math.PI, fx = x + Math.sin(a) * GH * 0.11, lift = Math.max(0, Math.cos(a)) * GH * 0.08, fy = gy - lift, n = Math.floor((a - Math.PI / 2) / TAU);
        if (n !== g.last[k]) { g.last[k] = n; s.shake = Math.max(s.shake, 0.3 * g.sz); for (let i = 0; i < 5; i++) w.dust.push(puff(fx + (rnd() - 0.5) * GH * 0.1, gy, -0.04 * N, 1.2, (rnd() - 0.5) * 0.1 * N)); }
        r.stroke(x + (k ? 0.04 : -0.04) * GH, gy - GH * 0.42, fx, fy, GH * 0.07, DARK);
        r.disc(fx, fy, GH * 0.05, DARK);
        r.disc(fx + Math.sin(a) * GH * 0.03, fy + GH * 0.01, GH * 0.03, DARK);
      }
      r.poly([[x - GH * 0.08, gy - GH * 0.4], [x + GH * 0.08, gy - GH * 0.4], [x + GH * 0.11, gy - GH * 0.8], [x - GH * 0.11, gy - GH * 0.8]], DARK);
      const sw = Math.sin(f.rel.trebClock * 0.6 + g.off) * GH * 0.03;
      for (const k of [-1, 1]) { const ex = x + k * GH * 0.3 + sw, ey = gy - GH * 0.95; r.stroke(x + k * GH * 0.08, gy - GH * 0.72, ex, ey, GH * 0.045, DARK); r.line(ex, ey, ex + k * GH * 0.08 + sw, ey - GH * 0.1, DARK); r.line(ex, ey, ex - k * GH * 0.03 + sw, ey - GH * 0.12, DARK); }
      for (const [dx, dy, rad] of [[0, -1.05, 0.14], [-0.2, -0.98, 0.1], [0.2, -0.98, 0.1], [0, -0.92, 0.11]]) r.disc(x + dx * GH + sw * 1.5, gy + dy * GH, rad * GH, leaf);
      for (const k of [-1, 1]) r.rect(x + k * GH * 0.035 - u, gy - GH * 0.74, mx1(1.5 * u), mx1(1.5 * u), f.beat.pulse > 0.5 ? BRIGHT : LMID);
      targets.push({ x: x - GH * 0.35, y: gy - GH * 1.2, w: GH * 0.7, h: GH * 1.2 });
    }
    w.dust = smoke(W, w.dust, 0, LMID + DIM);
    // the stone on its arc to the tower, chips off the wall; the birds, flapping, away over the valley
    w.stones = w.stones.filter((st) => {
      st.vy += GR * N * dt; st.x += st.vx * dt; st.y += st.vy * dt;
      r.disc(st.x, st.y, 1.6 * u, DARK);
      if (st.x >= twX - 0.04 * N && st.y > 0.4 * N) { burst(w.chips, rnd, twX - 0.04 * N, st.y, 10, 0.15 * N, LMID, 0.6); s.shake = Math.max(s.shake, 0.2); return false; }
      return st.y < gy;
    });
    w.chips = particles(W, w.chips, LMID);
    w.birds = w.birds.filter((b) => {
      b.x += b.vx * dt; b.y += (b.vy + Math.sin(t * 6 + b.s) * 0.03 * N) * dt;
      const fl = Math.sin(t * 14 + b.s) * 1.5 * u;
      r.line(b.x - 2 * u, b.y - fl, b.x, b.y, FIG); r.line(b.x, b.y, b.x + 2 * u, b.y - fl, FIG);
      return b.x > -0.05 * N && b.x < 1.05 * N && b.y > -0.05 * N;
    });
    // the flood: the wavefront out of the broken dam, slowing as it goes, the crest bright, logs riding it; a
    // splash at the tower; the water drains away once it has run its course
    if (w.flood) {
      const F = w.flood, vF = 0.5 * N * Math.max(0.3, 1 - F.t / 8);
      F.t += dt;
      if (F.t < 8) F.front = Math.min(N + 0.1 * N, F.front + vF * dt);
      const fade = F.t > 10 ? Math.max(0, 1 - (F.t - 10) / 4) : 1, hAt = (x) => 0.06 * N * fade * (1 - 0.35 * clamp((x - damX) / Math.max(1, F.front - damX))) * (x > F.front - 0.05 * N ? 1.4 : 1);
      const pts = [[damX, gy]];
      for (let i = 0; i <= 12; i++) { const x = lerp(damX, F.front, i / 12); pts.push([x, gy - hAt(x)]); }
      pts.push([F.front, gy]);
      r.poly(pts, COOL + DIM);
      for (let i = 0; i < 12; i++) { const x = lerp(damX, F.front, i / 12); r.rect(x, gy - hAt(x), (F.front - damX) / 12 + 1, mx1(u), i > 9 ? BRIGHT : COOL); }
      for (const lg of F.logs) { if (lg.x < F.front - 0.03 * N) lg.x += vF * 0.85 * dt; r.rect(lg.x - 3 * u, gy - hAt(lg.x) - u + Math.sin(t * 4 + lg.bob) * u, 6 * u, 2 * u, DARK); }
      if (!F.hit && F.front >= twX - 0.04 * N) { F.hit = true; s.shake = Math.max(s.shake, 0.4); for (let k = 0; k < 24; k++) w.debris.push({ x: twX - 0.04 * N, y: gy - 0.04 * N, vx: -(rnd() * 0.3) * N, vy: -(0.1 + rnd() * 0.4) * N, life: 1, c: COOL }); }
      if (F.t > 14) w.flood = null;
    }
    w.debris = particles(W, w.debris, DARK);
    if (kind === 'storm') drift(W, w.rain, Math.round(100 * u), 0.7, 0.12 + 0.1 * f.rel.trebDrive, 0, COOL + DIM); else w.rain.length = 0;
  },
};

const WORLDS = { fellowship, beacons, darktower, bridgeofshadow, elvenwood, siege, greenhills, cavelake, mines, charge, firemountain, treeshepherds };
registerFamily('epic', WORLD_DEFS, WORLDS);
export const EPIC_STYLE = makeMixStyle('EPIC FANTASY', ['epic']);
