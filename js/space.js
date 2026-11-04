// Space opera, mixed. The visual language of the genre as worlds: the jump from a cockpit, a run along a trench on
// a mechanical moon, an alien bar with a band, a duel of glowing blades over a reactor shaft, assault walkers on a
// snowfield, capital ships over a planet's limb, a dark throne hall, two suns setting over a desert homestead, a
// bounty hunter on a jetpack over the traffic lanes, a tactical hologram, a corridor chase behind blast doors and a
// canyon race. Original silhouettes only: no name, logo, prop or character from any film, no text. Every world draws
// with the palette roles, so any palette, treatment and layout of the mixer fits.
import { Raster, clamp, lerp } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow,
  followAngle, ease, beatLocked, hash, pickW, walker, snowfall, particles, burst, shiftRow, shiftRows, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  hyperspace: { name: 'the jump', va: [[M, M], [L, M], [L, L]], pals: ['midnight', 'noir', 'silver', 'blueprint', 'phosphor', 'ice'], fx: ['none', 'crt', 'hud', 'film'] },
  trench: { name: 'trench run', va: [[M, H], [H, H], [L, H]], pals: ['noir', 'machine', 'silver', 'blueprint', 'military', 'phosphor'], fx: ['hud', 'crt', 'none', 'film'] },
  cantina: { name: 'the cantina', va: [[M, L], [H, M], [H, L]], pals: ['sepia', 'amber', 'cinema', 'noir', 'neon'], fx: ['film', 'none', 'vhs'] },
  energyduel: { name: 'blade duel', va: [[M, H], [L, H], [L, M]], pals: ['noir', 'midnight', 'thermal', 'silver', 'neon', 'ice'], fx: ['film', 'none', 'manga', 'crt'] },
  walkers: { name: 'the walkers', va: [[M, H], [H, H], [L, H]], pals: ['ice', 'silver', 'noir', 'military', 'blueprint'], fx: ['film', 'hud', 'none', 'crt'] },
  fleet: { name: 'the fleet', va: [[M, H], [H, H], [L, H]], pals: ['midnight', 'noir', 'silver', 'blueprint', 'neon', 'machine'], fx: ['none', 'film', 'hud', 'crt'] },
  throne: { name: 'the throne hall', va: [[M, H], [L, H], [L, M]], pals: ['noir', 'midnight', 'silver', 'machine', 'thermal'], fx: ['film', 'none', 'crt'] },
  twinsuns: { name: 'two suns', va: [[M, L], [H, M], [H, L]], pals: ['amber', 'sepia', 'cinema', 'thermal', 'neon', 'midnight'], fx: ['film', 'none', 'vhs'] },
  jetpack: { name: 'the bounty hunter', va: [[M, H], [H, H], [L, H]], pals: ['neon', 'noir', 'machine', 'midnight', 'cinema', 'amber'], fx: ['none', 'crt', 'hud', 'manga'] },
  holotable: { name: 'the holotable', va: [[M, M], [L, M], [L, L]], pals: ['blueprint', 'phosphor', 'ice', 'midnight', 'noir', 'amber'], fx: ['hud', 'crt', 'none', 'film'] },
  blastdoors: { name: 'blast doors', va: [[M, H], [H, H], [L, H]], pals: ['silver', 'noir', 'machine', 'ice', 'military'], fx: ['none', 'crt', 'film', 'manga'] },
  podrace: { name: 'the canyon race', va: [[M, H], [H, H], [L, H]], pals: ['amber', 'sepia', 'cinema', 'thermal', 'military', 'neon'], fx: ['none', 'film', 'manga', 'crt'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the kinds tables below weigh their entries by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
// fixed stars from a hash, in the top `yMax` of the picture
function stars(r, N, n, seed, yMax = 1, c = LMID) {
  for (let k = 0; k < n; k++) r.set(hash(k, seed) * N, hash(k, seed + 1) * yMax * N, hash(k, seed + 2) < 0.2 ? BRIGHT : c);
}
// energy bolts: straight segments that keep travelling along their heading until their life runs out
function bolts(W, list, c) {
  const { r, dt } = W;
  for (const b of list) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    r.stroke(b.x, b.y, b.x - b.vx * b.len, b.y - b.vy * b.len, b.w || 1, b.c ?? c);
  }
  return list.filter((b) => b.life > 0);
}
// debris in orbit: no gravity, it drifts on and spins; returns the survivors
function drift(W, list, c) {
  const { r, dt, u } = W;
  for (const p of list) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), p.c ?? c);
  }
  return list.filter((p) => p.life > 0);
}
// a circle as a polygon of lines, for the radii where Raster.ring would cost the frame
function circ(r, cx, cy, rad, c, seg = 24) {
  let px = cx + rad, py = cy;
  for (let k = 1; k <= seg; k++) { const a = (k / seg) * TAU, x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad; r.line(px, py, x, y, c); px = x; py = y; }
}
// a rectangle turned by `a` about its centre, as a polygon
function rotRect(cx, cy, hw, hh, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [[cx + hw * c - hh * s, cy + hw * s + hh * c], [cx - hw * c - hh * s, cy - hw * s + hh * c], [cx - hw * c + hh * s, cy - hw * s - hh * c], [cx + hw * c + hh * s, cy + hw * s - hh * c]];
}
// a jagged lightning bolt from (x0, y0) to (x1, y1) with `depth` levels of branching; branches end short of the target
function arc(r, rnd, x0, y0, x1, y1, c, depth, u) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), n = Math.max(2, Math.round(len / (4 * u)));
  let px = x0, py = y0;
  for (let k = 1; k <= n; k++) {
    const q = k / n, jit = (k < n ? (rnd() - 0.5) * 6 * u : 0), x = x0 + dx * q - (dy / len) * jit, y = y0 + dy * q + (dx / len) * jit;
    r.line(px, py, x, y, c);
    if (depth > 0 && k % 3 === 0 && k < n - 1 && rnd() < 0.6) { const a = Math.atan2(dy, dx) + (rnd() - 0.5) * 1.6, l = len * (0.25 + rnd() * 0.2); arc(r, rnd, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, c, depth - 1, u); }
    px = x; py = y;
  }
}
// the beat as a continuous count (beats and the phase within the current one); a steady two a second when there is none
const beatPos = (f, t) => (beatLocked(f) ? f.beat.count + f.beat.phase : t * 2);

// ---------------------------------------------------------------------------------------------- hyperspace
// Through a cockpit: a star field rushing past, a planet growing ahead as we close on it (its size is 1/distance),
// an asteroid field we bank away from on the snares, the engine glow humming with the bass. A drop is the jump:
// the stars stretch into lines, then a tunnel of light, and we come out on the next destination. A section change
// picks the destination after the next jump: an ice world, a desert, a gas giant with rings or a moon that is a
// station; the jump also happens on its own once the planet fills the view.
const DEST_W = { ice: [3, 2, 1], desert: [2, 2, 2], giant: [2, 2, 2], station: [0, 1, 3] };
const newRock = (rnd, z) => ({ x: (rnd() - 0.5) * 3, y: (rnd() - 0.5) * 2.2, z, s: 0.05 + rnd() * 0.12, a: rnd() * TAU, va: (rnd() - 0.5) * 2, k: Math.floor(rnd() * 100) });

const hyperspace = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { stars: Array.from({ length: 110 }, () => ({ x: (rnd() - 0.5) * 2.4, y: (rnd() - 0.5) * 2.4, z: 0.3 + rnd() * 3 })), rocks: [], dest: rollW(rnd, DEST_W, band), next: null,
      dist: 14, ox: (rnd() - 0.5) * 0.6, oy: (rnd() - 0.4) * 0.4, jump: 0, jumpLen: 2.2, bank: 0, camx: 0, dodge: 0, hum: 0, lights: [0, 0, 0, 0] });
    for (let i = 0; i < 6; i++) w.rocks.push(newRock(rnd, 1 + rnd() * 3));
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, cx = N / 2, cy = N / 2, band = bandOf(W.a);
    const speed = 0.5 + 0.8 * W.a + 0.8 * f.rel.bassDrive + 0.3 * f.beat.pulse;
    if (f.section === 'change') w.next = rollW(rnd, DEST_W, band);
    if (f.section === 'drop' && w.jump <= 0) { w.jump = w.jumpLen = 2.8; if (band > 0 && !w.next) w.next = 'station'; }
    if (w.jump <= 0 && w.dist < 1.15) { w.jump = w.jumpLen = 2.2; } // close enough: the next jump on its own
    for (const hh of hits) {
      if (hh.kind === 'snare' && w.jump <= 0) { // bank away from the nearest rock in the way
        let near = null;
        for (const k of w.rocks) if (Math.abs(k.x) < 0.8 && (!near || k.z < near.z)) near = k;
        w.dodge = near ? -Math.sign(near.x || 1) * 0.5 : (rnd() < 0.5 ? -0.5 : 0.5);
      } else if (isLow(hh)) w.hum = Math.max(w.hum, hh.strength);
      else if (hh.kind === 'hat') w.lights[Math.floor(rnd() * 4)] = 0.3;
    }
    w.camx = follow(w.camx, w.dodge, dt, 0.25);
    w.dodge = follow(w.dodge, 0, dt, 0.9);
    w.bank = follow(w.bank, -w.camx * 0.7, dt, 0.3);
    w.hum = Math.max(0, w.hum - dt * 1.5);
    const cs = Math.cos(w.bank), sn = Math.sin(w.bank);
    const proj = (x, y, z) => { const px = ((x - w.camx) / z) * N * 0.5, py = (y / z) * N * 0.5; return [cx + px * cs - py * sn, cy + px * sn + py * cs]; };
    const inJump = w.jump > 0, jq = inJump ? 1 - w.jump / w.jumpLen : 0; // 0 at the start of the jump, 1 at the end
    if (inJump) {
      w.jump -= dt;
      if (w.jump <= 0) { // out the other side: the next destination, far off, the rocks dealt afresh
        w.dest = w.next || rollW(rnd, DEST_W, band); w.next = null; w.dist = 14; w.ox = (rnd() - 0.5) * 0.6; w.oy = (rnd() - 0.4) * 0.4;
        w.rocks.length = 0;
        for (let i = 0; i < 6; i++) w.rocks.push(newRock(rnd, 1 + rnd() * 3));
      }
    } else w.dist = Math.max(1, w.dist - dt * speed * 0.55);
    // the stars: dots, streaks as the jump winds up, the tunnel of light at full stretch, and back to dots
    const stretch = inJump ? (jq < 0.25 ? jq / 0.25 : jq > 0.85 ? (1 - jq) / 0.15 : 1) : 0, tunnel = inJump && jq > 0.25 && jq < 0.85;
    for (const st of w.stars) {
      st.z -= dt * speed * (inJump ? 6 : 1);
      if (st.z < 0.15) { st.z = 3.2; st.x = (rnd() - 0.5) * 2.4; st.y = (rnd() - 0.5) * 2.4; }
      const [sx, sy] = proj(st.x, st.y, st.z);
      if (stretch > 0.05) { const [ex, ey] = proj(st.x, st.y, st.z * (1 - 0.6 * stretch)); r.line(sx, sy, ex, ey, st.z < 1.2 ? BRIGHT : LMID); }
      else r.set(sx, sy, st.z < 1 ? BRIGHT : st.z < 2 ? LMID : MID);
    }
    if (tunnel) { // rings of light coming at us, the walls of the tunnel streaked with the bass
      const ph = (t * 3) % 1;
      for (let k = 0; k < 7; k++) { const z = 0.25 + (((k - ph) % 7) + 7) % 7 * 0.5, rad = (0.9 * N) / z; if (rad < 0.7 * N) circ(r, cx, cy, rad, k % 2 ? COOL : BRIGHT, 28); } // z falls with time: the rings grow toward us
      for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU + w.bank, l0 = (0.08 + hash(k, 5) * 0.1) * N; r.line(cx + Math.cos(a) * l0, cy + Math.sin(a) * l0, cx + Math.cos(a) * N, cy + Math.sin(a) * N, hash(k, 6 + (f.beat.count & 1)) < 0.5 ? COOL + DIM : LMID + DIM); }
      r.disc(cx, cy, (0.03 + 0.05 * f.level) * N, BRIGHT);
    }
    // the destination, growing as 1/distance, sliding to the middle as we aim at it; drawn row by row: bands, the dark side
    if (!inJump || jq > 0.85) {
      const R = (0.9 * N) / w.dist, px = cx + w.ox * N * (w.dist / 14) + w.camx * 4 * u, py = cy + w.oy * N * (w.dist / 14), kind = w.dest;
      const base = kind === 'ice' ? BRIGHT : kind === 'desert' ? LMID : kind === 'giant' ? MID : DARK, bandC = kind === 'ice' ? LMID : kind === 'desert' ? MID : kind === 'giant' ? LMID : MID;
      if (kind === 'giant') r.ring(px, py, R * 1.7, Math.max(1, R * 0.25), LMID + DIM, 0.22); // the rings behind, then the planet over them
      for (let y = Math.max(0, Math.floor(py - R)); y <= Math.min(N - 1, py + R); y++) {
        const dy = (y + 0.5 - py) / R, cw = Math.sqrt(Math.max(0, 1 - dy * dy)) * R;
        if (cw < 0.5) continue;
        const lat = Math.floor((dy + 1) * 5.5), banded = kind === 'giant' ? lat % 2 === 0 : kind === 'ice' ? Math.abs(dy) > 0.65 : kind === 'desert' ? hash(lat, 3) < 0.3 : false;
        r.rect(px - cw, y, 2 * cw, 1, banded ? bandC : base);
        r.rect(px + cw * 0.45, y, cw * 0.55, 1, DARK + DIM); // the night side
      }
      if (kind === 'giant') r.ring(px, py + R * 0.08, R * 1.7, Math.max(1, R * 0.25), LMID, 0.22);
      if (kind === 'station') { // a grey sphere with an equator trench and rows of lit windows
        r.rect(px - R * 0.98, py - Math.max(1, R * 0.05), R * 1.4, Math.max(1, R * 0.1), BLACK);
        for (let k = 0; k < 40; k++) { const a = hash(k, 11) * Math.PI - Math.PI / 2, b = hash(k, 12) * Math.PI - Math.PI / 2, x = px + Math.cos(b) * Math.sin(a) * R, y = py + Math.sin(b) * R; if (x < px + R * 0.4 && R > 6 * u && hash(k, 13 + (f.beat.count >> 2)) < 0.7) r.set(x, y, COOL); }
      }
      if (R > 2 * u) targets.push({ x: px - R, y: py - R, w: 2 * R, h: 2 * R });
    }
    // the rocks: coming at us, spinning, dodged on the snare; far to near, more of them when the treble is up
    const want = inJump ? 0 : 4 + band * 3 + Math.round(4 * f.rel.trebDrive);
    while (w.rocks.length < want) w.rocks.push(newRock(rnd, 3 + rnd() * 2));
    w.rocks.sort((p, q) => q.z - p.z);
    let nearest = null;
    for (const k of w.rocks) {
      k.z -= dt * speed * 0.6;
      k.a += k.va * dt;
      if (k.z < 0.2) Object.assign(k, newRock(rnd, 3.5 + rnd() * 1.5));
      const [sx, sy] = proj(k.x, k.y, k.z), sz = (k.s * N) / k.z;
      if (sz < 0.6) { r.set(sx, sy, MID); continue; }
      const pts = [];
      for (let i = 0; i < 7; i++) { const a = k.a + (i / 7) * TAU, rr = sz * (0.7 + 0.3 * hash(k.k, i)); pts.push([sx + Math.cos(a) * rr, sy + Math.sin(a) * rr]); }
      r.poly(pts, k.z < 1 ? LMID : MID);
      r.disc(sx + sz * 0.3, sy + sz * 0.2, sz * 0.35, DARK); // the shadowed side, away from the light
      if (!nearest || k.z < nearest.z) nearest = { x: sx - sz, y: sy - sz, w: 2 * sz, h: 2 * sz, z: k.z };
    }
    if (nearest && !inJump) targets.push(nearest);
    if (w.jump > 0 && w.jump < 0.12) r.fill(BRIGHT); // the flash coming out
    // the cockpit: canopy struts, a console with the engine glow in its corners and four lamps that blink on the hats
    r.poly([[0, 0], [0.22 * N, 0], [0.34 * N, 0.2 * N], [0.3 * N, 0.22 * N], [0, 0.06 * N]], DARK);
    r.poly([[N, 0], [0.78 * N, 0], [0.66 * N, 0.2 * N], [0.7 * N, 0.22 * N], [N, 0.06 * N]], DARK);
    r.rect(0, 0.84 * N, N, 0.16 * N, DARK);
    r.rect(0, 0.84 * N, N, Math.max(1, u), MID);
    const glow = (0.03 + 0.06 * (f.rel.bassDrive + w.hum)) * N;
    for (const gx of [0.08 * N, 0.92 * N]) { r.disc(gx, 0.95 * N, glow, COOL + DIM); r.disc(gx, 0.95 * N, glow * 0.5, COOL); }
    for (let k = 0; k < 4; k++) { w.lights[k] -= dt; r.rect(0.42 * N + k * 0.045 * N, 0.9 * N, 0.03 * N, 2 * u, w.lights[k] > 0 || (f.beat.pulse > 0.6 && k === f.beat.count % 4) ? HOT : MID + DIM); }
    r.ring(cx, cy, 0.05 * N, Math.max(1, u), COOL + DIM);
    s.shake = Math.max(s.shake, inJump && jq < 0.3 ? 0.4 * jq / 0.3 : 0);
  },
};

// ---------------------------------------------------------------------------------------------- trench
// A run along a trench cut into a mechanical moon: the walls in perspective, greebled, the floor stripes coming at
// us at the speed of the bass; turrets on the rims rise and fire up at us on the kicks (bolts as straight
// segments), the pursuers' bolts cross the view from behind on the snares and spark on the walls, and at the end a
// target port that a drop rushes us into: it fills the view, a flash, and the run begins again. The trench is
// narrow and dense, a canyon of pipes, or wide and sparse, by arousal and re-rolled at a section change.
const TRENCH_W = { narrow: [1, 2, 3], canyon: [2, 2, 2], wide: [3, 2, 1] };
const TRENCH = { narrow: { hw: 0.55, dens: 3 }, canyon: { hw: 0.85, dens: 2 }, wide: { hw: 1.25, dens: 1 } };

const trench = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { prog: 0, kind: rollW(rnd, TRENCH_W, band), turrets: [], bolts: [], sparks: [], portZ: 60 + rnd() * 30, rush: 0, flash: 0, camx: 0, dodge: 0, bob: 0 });
    for (let i = 0; i < 8; i++) w.turrets.push({ z: 4 + i * 4 + rnd() * 2, side: i % 2 ? 1 : -1, up: 0, fire: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, K = TRENCH[w.kind], band = bandOf(W.a);
    const hz = 0.42 * N, cx0 = N / 2, segLen = 1.6, far = 26, speed = (3 + 4 * W.a + 4 * f.rel.bassDrive) * (w.rush > 0 ? 3 : 1);
    if (f.section === 'change') w.kind = rollW(rnd, TRENCH_W, band);
    if (f.section === 'drop' && w.rush <= 0) { w.rush = 2; w.portZ = Math.min(w.portZ, 12); }
    w.prog += dt * speed;
    w.portZ -= dt * speed;
    w.rush -= dt;
    w.flash -= dt;
    if (w.portZ < 0.8) { w.flash = 0.15; w.portZ = 70 + rnd() * 30; s.shake = Math.max(s.shake, 0.8); } // through the port: the run restarts
    const bob = f.beat.pulse * 0.6 * u;
    w.camx = follow(w.camx, w.dodge * K.hw * 0.5, dt, 0.3);
    w.dodge = follow(w.dodge, 0, dt, 1.2);
    const proj = (x, y, z) => [cx0 + ((x - w.camx) / z) * N * 0.42, hz + (y / z) * N * 0.42 + bob];
    // the walls, far to near: a slab per segment, shaded by distance, the rims above, the floor stripes between
    const frac = (w.prog / segLen) % 1, n = Math.ceil(far / segLen);
    stars(r, N, 30, 21, 0.3);
    for (let i = n; i >= 0; i--) {
      const z0 = Math.max(0.25, (i - frac) * segLen), z1 = Math.max(0.26, (i + 1 - frac) * segLen), id = Math.floor(w.prog / segLen) + i;
      if (z0 >= far) continue;
      const shade = z0 < 3 ? MID : z0 < 7 ? DARK : z0 < 14 ? DARK + DIM : BG;
      for (const side of [-1, 1]) {
        const [xa, ya] = proj(side * K.hw, 1, z0), [xb, yb] = proj(side * K.hw, 1, z1), [xc, yc] = proj(side * K.hw, -0.9, z1), [xd, yd] = proj(side * K.hw, -0.9, z0);
        r.poly([[xa, ya], [xb, yb], [xc, yc], [xd, yd]], shade);
        r.line(xd, yd, xc, yc, z0 < 7 ? LMID : MID + DIM); // the rim
        r.line(xd, yd, xa, ya, z0 < 7 ? DARK + DIM : BG); // the seam between the plates
        if (z0 < 12) for (let g = 0; g < K.dens; g++) { // greebles on the wall face: boxes at hashed heights, a lit slit now and then
          const hy = -0.7 + 1.4 * hash(id * 7 + g, side + 2), hh = 0.1 + 0.2 * hash(id * 7 + g, 5), zq = z0 + (z1 - z0) * (0.2 + 0.6 * hash(id * 7 + g, 6));
          const [gx, gy] = proj(side * K.hw, hy, zq), [, gy2] = proj(side * K.hw, hy + hh, zq), gw = Math.max(1, (0.12 * N * 0.42) / zq);
          r.rect(side < 0 ? gx : gx - gw, gy, gw, Math.max(1, gy2 - gy), hash(id, g + 9) < 0.15 ? COOL : z0 < 4 ? DARK : MID + DIM);
        }
      }
      const [fx0, fy0] = proj(-K.hw, 1, z0), [fx1] = proj(K.hw, 1, z0);
      r.rect(fx0, fy0, fx1 - fx0, Math.max(1, (1.5 * u) / Math.max(1, z0 * 0.5)), (id & 1) === (f.beat.count & 1) ? LMID : MID + DIM); // the floor stripe, flashing on the beat
    }
    // the port at the end: a dark socket with a lit frame, growing as we close
    if (w.portZ < far) {
      const [px, py] = proj(0, 0.9, w.portZ), pw = (0.14 * N * 0.42) / w.portZ, ph = pw * 0.6;
      r.rect(px - pw, py - ph * 2, 2 * pw, 2 * ph, BLACK);
      r.frame(Math.round(px - pw), Math.round(py - ph * 2), Math.round(2 * pw), Math.round(2 * ph), f.beat.pulse > 0.4 ? HOT : LMID);
      targets.push({ x: px - pw, y: py - ph * 2, w: 2 * pw, h: 2 * ph });
    }
    // the turrets on the rims: the nearest one ahead rises and fires on a kick; the pursuers fire past us on a snare
    for (const hh of hits) {
      if (isLow(hh)) {
        let best = null;
        for (const T of w.turrets) { const z = T.z - w.prog; if (z > 2 && z < 16 && (!best || z < best.z - w.prog)) best = T; }
        if (best) { // from the barrel's tip, aimed at us with a little scatter: most pass by, some end in a wall
          best.up = 1; best.fire = 0.1;
          const z = best.z - w.prog, x0 = best.side * (K.hw - 0.12), y0 = -1.3, dx = w.camx - x0 + (rnd() - 0.5) * 0.8, dy = -y0 + (rnd() - 0.5) * 0.6, dz = 0.3 - z, l = Math.hypot(dx, dy, dz), sp = 10;
          w.bolts.push({ x: x0, y: y0, z, vx: (dx / l) * sp, vy: (dy / l) * sp, vz: (dz / l) * sp, life: 2.5, c: hh.strength > 0.7 ? BRIGHT : HOT });
        }
      } else if (hh.kind === 'snare') {
        const side = rnd() < 0.5 ? -1 : 1;
        w.bolts.push({ x: side * K.hw * 0.7 + w.camx, y: -0.3 + rnd() * 0.5, z: 0.4, vx: -side * 0.5 * rnd(), vy: 0.1, vz: 14, life: 2, c: COOL });
        w.dodge = -side * 0.5;
      }
    }
    for (const T of w.turrets) {
      if (T.z - w.prog < 0.5) { T.z += 32 + rnd() * 4; T.up = 0; }
      const z = T.z - w.prog;
      if (z > far) continue;
      T.up = Math.max(0, T.up - dt * 0.25);
      T.fire -= dt;
      const rise = Math.min(1, T.up * 3), [bx, by] = proj(T.side * K.hw, -0.9 - 0.25 * rise, z), sz = (0.1 * N * 0.42) / z;
      r.rect(bx - sz * 0.6, by - sz * 0.8, sz * 1.2, sz * 0.8, z < 6 ? LMID : MID); // the housing
      const ex = cx0 - bx, ey = hz + bob - (by - sz * 0.6), el = Math.hypot(ex, ey) || 1, tx = bx + (ex / el) * sz * 1.3, ty = by - sz * 0.6 + (ey / el) * sz * 1.3; // the barrel, trained on us
      r.stroke(bx, by - sz * 0.6, tx, ty, Math.max(1, sz * 0.25), T.fire > 0 ? BRIGHT : z < 6 ? LMID : MID);
      if (T.fire > 0) r.disc(tx, ty, sz * 0.5, BRIGHT);
    }
    // the bolts in the trench's own space: a segment from where it is back along its heading; a wall ends it in sparks
    w.bolts = w.bolts.filter((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt;
      if (b.z < 0.2 || b.z > far) return false;
      const [x0, y0] = proj(b.x, b.y, b.z), [x1, y1] = proj(b.x - b.vx * 0.06, b.y - b.vy * 0.06, b.z - b.vz * 0.06);
      r.stroke(x0, y0, x1, y1, Math.max(1, (1.4 * u) / Math.max(0.5, b.z * 0.4)), b.c);
      if (Math.abs(b.x) > K.hw || b.y > 1) { burst(w.sparks, rnd, x0, y0, 10, (N * 0.35) / Math.max(1, b.z * 0.5), BRIGHT, 0.4); return false; } // into a wall or the floor
      return b.life > 0;
    });
    w.sparks = particles(W, w.sparks, BRIGHT);
    if (w.flash > 0) r.fill(BRIGHT);
    // the canopy frame: a bar low across and a reticle that drifts with the dodge
    r.rect(0, 0.9 * N, N, 0.1 * N, DARK);
    r.rect(0, 0.9 * N, N, Math.max(1, u), MID);
    r.ring(cx0 - w.camx * 8 * u, hz + bob, 0.045 * N, Math.max(1, u), COOL);
    r.rect(0.3 * N, 0.94 * N, 0.4 * N * clamp(1 - w.portZ / 90), 2 * u, HOT);
    if (w.rush > 0) s.shake = Math.max(s.shake, 0.3);
  },
};

// ---------------------------------------------------------------------------------------------- cantina
// An alien bar from across the room: the counter with a bartender polishing a glass, booths along the back wall
// with their lamps, a four-piece band on a low stage playing in time (the arms land on the beat), and at the table
// in front five builds of alien, heads nodding to the music, a holographic board game between them whose pieces
// hop to new squares on the hats. On a heavy snare one of them fires a single shot into the ceiling: sparks fall,
// a scorch stays, nobody is hurt. The band's line-up goes by arousal and is re-rolled at a section change; a drop
// gets the whole room bobbing and the lamps strobing for a few bars.
const BAND_W = { horns: [3, 2, 1], strings: [2, 2, 2], drums: [1, 2, 3], synth: [2, 1, 1] };
const LINEUP = { horns: ['horn', 'horn', 'drum', 'keys'], strings: ['lute', 'flute', 'drum', 'horn'], drums: ['drum', 'drum', 'horn', 'keys'], synth: ['keys', 'keys', 'horn', 'flute'] };
const ALIENS = ['tall', 'squat', 'horned', 'tentacled', 'hooded'];

// an alien build at x with its feet on `base`, h tall, nodding by `nod` (0..1), swaying its loose parts with `ph`
function drawAlien(r, kind, x, base, h, col, nod, ph, u) {
  const hy = base - h * 0.88 + nod * 2 * u;
  switch (kind) {
    case 'tall': // a reed of a body, a long neck, a small head, arms hanging to the knees
      r.rect(x - h * 0.07, base - h * 0.62, h * 0.14, h * 0.62, col);
      r.rect(x - h * 0.025, base - h * 0.78, h * 0.05, h * 0.18, col);
      r.disc(x, hy + h * 0.04, h * 0.07, col);
      for (const k of [-1, 1]) r.stroke(x + k * h * 0.09, base - h * 0.58, x + k * h * 0.14, base - h * 0.2, Math.max(1, u), col);
      break;
    case 'squat': // wide and low, the dome of the head straight on the shoulders
      r.rect(x - h * 0.36, base - h * 0.55, h * 0.72, h * 0.55, col);
      r.disc(x, base - h * 0.55 + nod * 2 * u, h * 0.26, col);
      for (const k of [-1, 1]) r.rect(x + k * h * 0.38 - 1.5 * u, base - h * 0.5, 3 * u, h * 0.3, col);
      break;
    case 'horned': // a walker with two horns curving out of the head
      walker(r, x, base, h, col, 0, 1, {});
      for (const k of [-1, 1]) { r.stroke(x + k * h * 0.06, hy, x + k * h * 0.14, hy - h * 0.12, Math.max(1, 1.5 * u), col); r.stroke(x + k * h * 0.14, hy - h * 0.12, x + k * h * 0.22, hy - h * 0.1, Math.max(1, u), col); }
      break;
    case 'tentacled': // a bulb of a head, tentacles trailing from it that sway on the mids
      r.rect(x - h * 0.16, base - h * 0.6, h * 0.32, h * 0.6, col);
      r.disc(x, hy, h * 0.17, col);
      for (let k = 0; k < 4; k++) { const tx = x + (k - 1.5) * h * 0.1; r.stroke(tx, hy + h * 0.1, tx + Math.sin(ph + k * 1.7) * h * 0.08, hy + h * 0.34, Math.max(1, 1.5 * u), col); }
      break;
    default: // a hooded robe, nothing in the hood but dark
      r.poly([[x - h * 0.28, base], [x + h * 0.28, base], [x + h * 0.14, base - h * 0.7], [x - h * 0.14, base - h * 0.7]], col);
      r.poly([[x - h * 0.17, base - h * 0.66], [x + h * 0.17, base - h * 0.66], [x + h * 0.08, hy - h * 0.1 + nod * 2 * u], [x - h * 0.08, hy - h * 0.1 + nod * 2 * u]], col);
      r.rect(x - h * 0.06, hy - h * 0.04 + nod * 2 * u, h * 0.12, h * 0.1, BLACK);
  }
}
// a player on the stage with its instrument; `up` is the arm position (1 raised, 0 down on the beat)
function drawPlayer(r, kind, x, base, h, col, up, u) {
  const J = walker(r, x, base, h, col, 0, 1, {}), sy = J.sy + h * 0.05;
  switch (kind) {
    case 'horn': { const ex = x + h * 0.45, ey = J.head + h * 0.12 - up * h * 0.25; r.stroke(x + h * 0.1, J.head + h * 0.02, ex, ey, Math.max(1, 1.5 * u), col); r.disc(ex, ey, h * 0.09, col); r.stroke(x, sy, ex - h * 0.1, ey, Math.max(1, u), col); break; }
    case 'drum': // a barrel in front, two sticks that come down on the beat
      r.rect(x - h * 0.3, base - h * 0.42, h * 0.6, h * 0.3, col);
      r.rect(x - h * 0.3, base - h * 0.42, h * 0.6, Math.max(1, u), LMID);
      for (const k of [-1, 1]) r.stroke(x + k * h * 0.12, sy, x + k * h * 0.18, base - h * 0.44 - up * h * 0.22, Math.max(1, u), col);
      break;
    case 'keys': // a flat box on legs at the waist, the hands on it bobbing
      r.rect(x - h * 0.32, base - h * 0.5, h * 0.64, h * 0.08, col);
      for (const k of [-1, 1]) { r.rect(x + k * h * 0.28 - u, base - h * 0.42, 2 * u, h * 0.42, col); r.rect(x + k * h * 0.14 - 1.5 * u, base - h * 0.55 - up * 1.5 * u, 3 * u, 2 * u, col); }
      break;
    case 'flute': r.stroke(x + h * 0.05, J.head + h * 0.03, x + h * 0.45, J.head + h * 0.05 + up * u, Math.max(1, 1.2 * u), col); r.stroke(x, sy, x + h * 0.3, J.head + h * 0.06, Math.max(1, u), col); break;
    default: // a lute: a round body at the belly, a neck up and out, the strumming hand going up and down
      r.disc(x + h * 0.05, base - h * 0.42, h * 0.12, col);
      r.stroke(x + h * 0.1, base - h * 0.48, x + h * 0.4, base - h * 0.7, Math.max(1, 1.5 * u), col);
      r.rect(x + h * 0.02, base - h * 0.5 + up * 3 * u, 3 * u, 2 * u, col);
  }
}

const cantina = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { band: rollW(rnd, BAND_W, band), up: 0, armT: 0, cloth: 0, snap: 0, hum: 0, pieces: Array.from({ length: 6 }, () => ({ u: rnd() * 1.6 - 0.8, v: rnd() * 1.6 - 0.8, tu: 0, tv: 0, q: 1 })),
      shots: [], sparks: [], scorch: [], lastShot: -9, party: 0, lamps: [HOT, COOL, HOT], order: ALIENS.slice().sort(() => rnd() - 0.5), nods: [0, 0, 0, 0, 0], ax: 0.6 * N, ay: 0.7 * N });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, wy = 0.6 * N, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2;
    if (f.section === 'change') w.band = rollW(rnd, BAND_W, band);
    if (f.section === 'drop') w.party = 8 / bps;
    w.party -= dt;
    if (f.beat.on) { w.up = 1 - w.up; w.armT = 0; for (let k = 0; k < 5; k++) if (w.party > 0 || hash(k, f.beat.count) < 0.5) w.nods[k] = 1; if (w.party > 0) w.lamps = w.lamps.map((c) => (c === HOT ? COOL : HOT)); }
    for (const hh of hits) {
      if (hh.kind === 'hat') { const pc = w.pieces[Math.floor(rnd() * 6)]; if (pc.q >= 1) { pc.tu = pc.u; pc.tv = pc.v; pc.u = rnd() * 1.6 - 0.8; pc.v = rnd() * 1.6 - 0.8; pc.q = 0; } }
      else if (hh.kind === 'snare') { w.snap = 0.12; if (hh.strength > 0.7 && t - w.lastShot > 2.5) { w.lastShot = t; w.shots.push({ x: w.ax, y: w.ay, vx: 0.15 * N * (rnd() - 0.5), vy: -1.6 * N, len: 0.08, c: HOT }); } }
      else if (isTonal(hh)) w.lamps[hh.pc % 3] = hh.pc % 2 ? HOT : COOL;
    }
    w.armT += dt * bps * (w.party > 0 ? 2 : 1);
    w.snap -= dt;
    const up = w.up ? 1 - Math.min(1, w.armT) : Math.min(1, w.armT); // the arms swing between the beats and land on them
    // the room: the back wall with three booth arches and their lamps, the floor coming toward us
    r.rect(0, 0, N, wy, DARK + DIM);
    r.rect(0, wy, N, N - wy, DARK);
    r.rect(0, wy, N, Math.max(1, u), MID + DIM);
    for (let k = 0; k < 3; k++) {
      const bx = (0.2 + k * 0.3) * N, br = 0.09 * N;
      r.ring(bx, wy - 0.02 * N, br, Math.max(1, 1.5 * u), MID, 1);
      r.rect(bx - br, wy - 0.02 * N, 2 * br, 0.02 * N, DARK + DIM);
      r.rect(bx - 1.5 * u, wy - br * 1.6, 3 * u, 2 * u, w.lamps[k]);
      r.disc(bx, wy - br * 1.6 + 3 * u, 2 * u + f.beat.pulse * u, w.lamps[k] + DIM);
      walker(r, bx + (k - 1) * 0.03 * N, wy - 0.01 * N, 0.1 * N, DARK, 0, 1, { hat: k === 1 }); // someone in each booth
    }
    for (const sc of w.scorch) { sc.life -= dt; r.disc(sc.x, sc.y, 2 * u, DARK); }
    w.scorch = w.scorch.filter((sc) => sc.life > 0);
    // the stage at the back right, the band on it
    const stY = wy + 0.04 * N;
    r.rect(0.6 * N, stY - 0.035 * N, 0.4 * N, 0.035 * N, MID);
    r.rect(0.6 * N, stY - 0.035 * N, 0.4 * N, Math.max(1, u), LMID);
    LINEUP[w.band].forEach((kind, i) => drawPlayer(r, kind, (0.66 + i * 0.085) * N, stY - 0.035 * N, 0.15 * N, FIG, kind === 'drum' ? up : 1 - up, u));
    // the counter at the back left: the bartender behind it polishing, the cloth circling, snapping on a snare
    const cy = wy + 0.06 * N, bx = 0.2 * N;
    r.rect(bx - 0.03 * N, cy - 0.22 * N, 0.06 * N, 0.12 * N, FIG);
    r.disc(bx, cy - 0.26 * N, 0.035 * N, FIG);
    w.cloth += dt * (3 + 4 * f.level);
    const hx = bx + 0.05 * N + Math.cos(w.cloth) * 0.02 * N * (w.snap > 0 ? 2.5 : 1), hy = cy - 0.15 * N + Math.sin(w.cloth) * 0.015 * N;
    r.stroke(bx + 0.02 * N, cy - 0.19 * N, hx, hy, Math.max(1, 1.5 * u), FIG);
    r.rect(hx - 1.5 * u, hy - 1.5 * u, 3 * u, 3 * u, BRIGHT);
    r.rect(bx + 0.04 * N, cy - 0.14 * N, 2.5 * u, 4 * u, COOL); // the glass
    r.rect(0.02 * N, cy - 0.1 * N, 0.38 * N, 0.1 * N, MID);
    r.rect(0.02 * N, cy - 0.1 * N, 0.38 * N, Math.max(1, u), LMID);
    for (let k = 0; k < 5; k++) r.rect((0.05 + k * 0.07) * N, cy - 0.13 * N, 2 * u, 3 * u, k % 2 ? COOL + DIM : HOT + DIM); // bottles along it
    // the table in front with the five of them behind it, nodding; the horned one is the one with the blaster
    const tx = 0.5 * N, ty = 0.86 * N, rx = 0.26 * N, ry = 0.045 * N;
    w.order.forEach((kind, i) => {
      w.nods[i] = Math.max(0, w.nods[i] - dt * 4);
      const x = tx + (i - 2) * 0.1 * N, base = ty - 0.02 * N, h = (kind === 'tall' ? 0.3 : kind === 'squat' ? 0.17 : kind === 'horned' ? 0.24 : kind === 'tentacled' ? 0.2 : 0.23) * N;
      drawAlien(r, kind, x, base, h, FIG, w.nods[i], f.rel.midClock * 1.5 + i, u);
      if (kind === 'horned') { w.ax = x + h * 0.22; w.ay = base - h * 0.5; r.rect(w.ax - 1.5 * u, w.ay - u, 4 * u, 2 * u, DARK); }
      targets.push({ x: x - h * 0.3, y: base - h, w: h * 0.6, h });
    });
    r.ring(tx, ty, rx * 0.5, rx, MID, ry / rx);
    r.ring(tx, ty, rx * 0.5, rx, LMID, (ry / rx) * 0.5);
    // the game: pieces that hop square to square on the hats, flickering the way a projection does
    for (const p of w.pieces) {
      if (p.q < 1) p.q = Math.min(1, p.q + dt * 3.5);
      const q = p.q, cu = lerp(p.tu, p.u, q), cv = lerp(p.tv, p.v, q), lift = Math.sin(Math.PI * q) * 4 * u, px = tx + cu * rx * 0.8, py = ty + cv * ry * 0.7 - lift;
      if ((Math.floor(t * 30) + Math.floor(p.u * 10)) % 5 === 0) continue;
      r.rect(px - u, py - 4 * u, 2 * u, 4 * u, COOL);
      r.rect(px - 1.5 * u, py - 5 * u, 3 * u, 1.5 * u, COOL);
    }
    // the one shot: up into the ceiling, sparks down from where it hit
    w.shots = w.shots.filter((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt;
      r.stroke(b.x, b.y, b.x - b.vx * b.len, b.y - b.vy * b.len, Math.max(1, 1.5 * u), b.c);
      if (b.y < 0.03 * N) { burst(w.sparks, rnd, b.x, 0.03 * N, 16, N * 0.35, BRIGHT, 0.7); w.scorch.push({ x: b.x, y: 0.03 * N, life: 12 }); s.shake = Math.max(s.shake, 0.3); return false; }
      return true;
    });
    w.sparks = particles(W, w.sparks, HOT);
    if (w.party > 0 && f.beat.on) for (let k = 0; k < 20; k++) r.rect(rnd() * N, rnd() * wy, 2 * u, Math.max(1, u), BRIGHT); // the lights in the smoke
  },
};

// ---------------------------------------------------------------------------------------------- energyduel
// Two silhouettes with glowing blades, one HOT, one COOL, on a catwalk over a reactor shaft whose depth lines
// converge below. A kick is the left one's strike, a snare the right one's; a strike into a guard is a clash that
// throws sparks (they fall), one that lands flashes the other and staggers them. The blades leave afterimages. A
// drop is the shove: one slides back along the catwalk and the floor's debris lifts and falls again; a section
// change sends a lift platform up between them, and they hold their guard till it has passed. The arena goes by
// arousal: the catwalk, a hangar, a lava shore, a snowfield.
const ARENA_W = { catwalk: [2, 2, 3], hangar: [3, 2, 1], lava: [1, 2, 3], snow: [2, 2, 1] };
const duelist = (x, dir, c) => ({ x, dir, c, swing: 0, hit: 0, vx: 0, trail: [] });

const energyduel = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { A: duelist(0.33, 1, HOT), B: duelist(0.67, -1, COOL), arena: rollW(rnd, ARENA_W, band), sparks: [], debris: [], flakes: [], embers: [], lift: null, flash: 0, shove: 0, shoved: null, hum: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), arena = w.arena, cx = N / 2;
    const g = (arena === 'catwalk' ? 0.64 : 0.78) * N, h = 0.26 * N;
    const guard = w.lift && Math.abs(w.lift.y - g) < 0.3 * N; // the lift between them: nobody strikes across it
    const strike = (att, def, strength) => {
      if (att.swing > 0 || guard) return;
      att.swing = 1;
      const mx = ((att.x + def.x) / 2) * N, my = g - h * 0.55;
      if (def.swing <= 0 && rnd() < 0.7) { // met by the guard: a clash, sparks off the crossing
        burst(w.sparks, rnd, mx, my, 12 + 14 * strength, N * 0.5, BRIGHT, 0.5);
        for (let k = 0; k < 6; k++) w.sparks.push({ x: mx, y: my, vx: (rnd() - 0.5) * N * 0.4, vy: -rnd() * N * 0.3, life: 0.4, c: rnd() < 0.5 ? att.c : def.c });
        w.flash = 0.05;
        s.shake = Math.max(s.shake, 0.3);
      } else { def.hit = 1; def.vx = att.dir * 0.25 * strength; s.shake = Math.max(s.shake, 0.4 * strength); }
    };
    for (const hh of hits) {
      if (isLow(hh)) strike(w.A, w.B, hh.strength);
      else if (hh.kind === 'snare') strike(w.B, w.A, hh.strength);
      else if (hh.kind === 'hat') w.hum = 0.1;
    }
    if (f.section === 'drop') { // the shove: the other flies back, the floor's loose bits lift and come down
      const who = rnd() < 0.5 ? w.A : w.B, other = who === w.A ? w.B : w.A;
      w.shove = 0.6; w.shoved = other; other.vx = who.dir * 1.6; other.hit = 1; s.shake = Math.max(s.shake, 0.8);
      for (let k = 0; k < 24; k++) w.debris.push({ x: (other.x + (rnd() - 0.5) * 0.3) * N, y: g - rnd() * 2 * u, vx: who.dir * N * (0.1 + rnd() * 0.4), vy: -N * (0.3 + rnd() * 0.6), life: 1.5, c: rnd() < 0.3 ? LMID : MID });
    } else if (f.section === 'change') { w.lift = { y: N + 0.1 * N, vy: -0.3 * N }; if (rnd() < 0.3) w.arena = rollW(rnd, ARENA_W, band); }
    w.shove -= dt; w.flash -= dt; w.hum -= dt;
    const gap = 0.3 + 0.04 * Math.sin(f.rel.midClock * 0.7);
    for (const F of [w.A, w.B]) {
      F.swing -= dt * 4.5; F.hit -= dt * 5;
      F.x += F.vx * dt; F.vx *= Math.exp(-dt * 4); // a slide that friction stops
      F.x = clamp(follow(F.x, 0.5 - (F.dir * gap) / 2, dt, 2.5), 0.08, 0.92);
    }
    // the arenas, back to front
    if (arena === 'catwalk') { // the shaft: a far wall of lit panels, the pit below with its rings closing on the glow at the bottom
      r.rect(0, 0, N, g, DARK + DIM);
      for (let k = 0; k < 12; k++) for (let j = 0; j < 5; j++) r.rect((0.04 + k * 0.08) * N, (0.08 + j * 0.1) * N, 2 * u, 3 * u, hash(k, j + (f.beat.count >> 1)) < 0.4 ? COOL + DIM : DARK);
      const vy = 1.45 * N, hw = 0.46 * N;
      r.disc(cx, N, (0.08 + 0.12 * f.rel.bassDrive) * N, HOT + DIM);
      r.disc(cx, N, (0.03 + 0.06 * f.rel.bassDrive) * N, HOT);
      for (const d of [1.25, 1.6, 2.1, 3, 4.5, 7, 12]) { const y = g + (vy - g) * (1 - 1 / d); r.rect(cx - hw / d, y, (2 * hw) / d, 1, d < 3 && f.beat.pulse > 0.5 ? LMID : MID + DIM); }
      for (const k of [-1, -0.5, 0.5, 1]) r.line(cx + k * hw, g, cx + (k * hw) / 12, g + (vy - g) * (1 - 1 / 12), MID + DIM);
      r.rect(0, g, N, 0.035 * N, MID);
      r.rect(0, g, N, Math.max(1, u), LMID);
      for (let x = 0; x < N; x += 0.1 * N) r.rect(x, g - 0.09 * N, Math.max(1, u), 0.09 * N, MID + DIM); // the rail posts
      r.rect(0, g - 0.09 * N, N, Math.max(1, u), MID);
    } else if (arena === 'hangar') { // a floor running back to a tall door, a parked craft to one side
      r.rect(0, 0, N, 0.5 * N, DARK + DIM);
      r.rect(0, 0.5 * N, N, 0.5 * N, DARK);
      for (const d of [1.2, 1.5, 2, 3, 5]) r.rect(0, 0.5 * N + 0.5 * N * (1 - 1 / d), N, 1, MID + DIM); // the floor seams, closer together toward the back
      r.rect(0.38 * N, 0.12 * N, 0.24 * N, 0.38 * N, DARK);
      r.frame(Math.round(0.38 * N), Math.round(0.12 * N), Math.round(0.24 * N), Math.round(0.38 * N), MID);
      r.rect(0.5 * N - u, 0.12 * N, 2 * u, 0.38 * N, f.beat.pulse > 0.6 ? COOL : COOL + DIM);
      r.poly([[0.06 * N, 0.5 * N], [0.3 * N, 0.5 * N], [0.26 * N, 0.42 * N], [0.12 * N, 0.4 * N]], MID + DIM);
      r.rect(0.12 * N, 0.36 * N, 0.08 * N, 0.05 * N, MID + DIM);
    } else if (arena === 'lava') { // black rock, a river of light below, embers up off it slowing as they rise
      r.rect(0, 0, N, g, DARK + DIM);
      r.rect(0, 0.4 * N, N, g - 0.4 * N, HOT + DIM);
      r.rect(0, 0.46 * N, N, g - 0.46 * N, DARK + DIM);
      r.rect(0, g, N, N - g, DARK);
      r.rect(0, 0.88 * N, N, 0.08 * N, HOT);
      for (let k = 0; k < 14; k++) r.rect(((hash(k, 31) + t * 0.05) % 1) * N, 0.89 * N + hash(k, 32) * 0.06 * N, 4 * u, 1, BRIGHT);
      if (rnd() < 0.3 + f.rel.bassDrive) w.embers.push({ x: rnd() * N, y: 0.88 * N, vx: (rnd() - 0.5) * 4 * u, vy: -N * (0.15 + rnd() * 0.2), life: 2 + rnd() });
      w.embers = w.embers.filter((e) => { e.vy = follow(e.vy, -0.02 * N, dt, 0.8); e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt; r.rect(e.x, e.y, Math.max(1, u), Math.max(1, u), e.life > 1 ? BRIGHT : HOT); return e.life > 0; }).slice(-120);
    } else { // snow: a white plain, a crashed hull half buried, flakes
      r.rect(0, 0, N, g, DARK + DIM);
      r.rect(0, g, N, N - g, BRIGHT);
      r.rect(0, g, N, Math.max(1, u), LMID);
      r.poly([[0.62 * N, g], [0.95 * N, g], [0.93 * N, g - 0.12 * N], [0.8 * N, g - 0.2 * N], [0.66 * N, g - 0.08 * N]], DARK);
      r.rect(0.84 * N, g - 0.17 * N, 0.025 * N, 0.025 * N, COOL + DIM);
      snowfall(W, w.flakes, 40, 0.12 + 0.1 * f.rel.trebDrive, BRIGHT);
    }
    // the lift: up from below, through the catwalk, out the top; drawn in the fighters' plane
    if (w.lift) {
      const Lf = w.lift;
      Lf.y += Lf.vy * dt;
      if (Lf.y < -0.2 * N) w.lift = null;
      else {
        r.rect(cx - 2 * u, Lf.y + 0.035 * N, 4 * u, N, DARK + DIM); // the piston under it
        r.rect(cx - 0.09 * N, Lf.y, 0.18 * N, 0.035 * N, LMID);
        for (const k of [-1, 1]) r.rect(cx + k * 0.09 * N - (k > 0 ? 1.5 * u : 0), Lf.y - 0.1 * N, Math.max(1, 1.5 * u), 0.1 * N, MID);
        r.rect(cx - 0.09 * N, Lf.y - 0.1 * N, 0.18 * N, Math.max(1, u), MID);
      }
    }
    // the fighters: a silhouette each, the arm pivoting at the shoulder, the blade on from the hand with its afterimages
    for (const F of [w.A, w.B]) {
      const x = F.x * N, col = F.hit > 0.5 ? BRIGHT : FIG, k = F.swing > 0 ? ease(1 - F.swing) : -1, bob = f.beat.pulse * u;
      const lunge = k >= 0 ? Math.sin(Math.PI * k) * h * 0.15 : 0, fx = x + F.dir * lunge;
      r.ring(fx, g + u, h * 0.15, h * 0.3, arena === 'snow' ? LMID : BLACK, 0.15); // the shadow under the feet
      const J = walker(r, fx, g - bob, h, col, 0.2 * Math.sin(t * 2 + F.dir), F.dir, {});
      if (F === w.B) r.poly([[fx - F.dir * h * 0.14, J.sy - h * 0.02 - bob], [fx + F.dir * h * 0.12, J.sy - bob], [fx + F.dir * h * 0.06, g - h * 0.1 - bob], [fx - F.dir * h * 0.28, g - h * 0.05 - bob]], col); // the cloak
      const ang = k >= 0 ? lerp(-2.2, 0.5, k) : w.shove > 0 && w.shoved !== F ? -1.3 : -0.9, sx = J.sx, sy = J.sy + h * 0.04;
      const hx = sx + F.dir * Math.cos(ang) * h * 0.28, hy = sy + Math.sin(ang) * h * 0.28, tx = hx + F.dir * Math.cos(ang - 0.2) * h * 0.75, ty = hy + Math.sin(ang - 0.2) * h * 0.75;
      r.stroke(sx, sy, hx, hy, Math.max(1, h * 0.06), col);
      F.trail.push([hx, hy, tx, ty, t]);
      while (F.trail.length > 24 || (F.trail.length && t - F.trail[0][4] > 0.23)) F.trail.shift(); // a quarter second of afterimage, whatever the frame rate
      for (let i = 0; i < F.trail.length - 1; i += 2) { const [a, b, c, d] = F.trail[i]; r.line(a, b, c, d, F.c + DIM); }
      const bw = Math.max(1, (1.6 + 1.6 * f.level + (w.hum > 0 ? 1 : 0)) * u);
      r.stroke(hx, hy, tx, ty, bw, F.c);
      r.line(hx, hy, tx, ty, BRIGHT);
      r.rect(hx - 1.5 * u, hy - 1.5 * u, 3 * u, 3 * u, LMID); // the hilt
      if (w.shove > 0 && w.shoved !== F) r.ring(sx + F.dir * h * 0.4, sy, h * (0.1 + (0.6 - w.shove) * 0.5), Math.max(1, u), LMID + DIM, 1); // the push, rippling out of the free hand
      targets.push({ x: fx - h * 0.3, y: g - h, w: h * 0.6, h });
    }
    w.sparks = particles(W, w.sparks, BRIGHT);
    w.debris = particles(W, w.debris, MID).filter((p) => p.y < g + 2 * u || p.vy < 0);
    if (w.flash > 0) r.rect(0, g, N, 0.02 * N, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- walkers
// Assault walkers striding across a snowfield toward us, a stride a beat: a real four-legged trot, the diagonal
// pairs swinging in turn and every planted foot standing still in the snow while the body goes on over it. The
// head cannons fire on the kicks (the bolts plough into the snow ahead), speeders circle the lead walker and fire
// at its legs on the snares. A drop is the tow cable: a speeder winds its line round the legs, the walker tangles,
// tips over its front feet and comes down under gravity in a burst of snow. The build goes by arousal: the
// four-legged walker, a two-legged scout, a hover tank with no legs at all; a section change re-rolls it.
const BUILD_W = { quad: [3, 2, 2], biped: [2, 2, 1], hover: [1, 2, 3] };
// legs: [hip offset along the body, phase (0 or half a cycle), near side, knee side]; gun: [reach ahead, below the top]
const BUILDS = { quad: { H: 2.2, legs: [[0.45, 0, 1, 1], [-0.45, 0.5, 1, -1], [0.45, 0.5, 0, 1], [-0.45, 0, 0, -1]], seg: 0.9, gun: [1.9, 0.2] }, biped: { H: 1.4, legs: [[0.05, 0, 1, -1], [-0.05, 0.5, 0, -1]], seg: 0.55, gun: [0.6, 0.5] }, hover: { H: 0.9, legs: [], seg: 0, gun: [0.8, 0.35] } };
const newWalker = (rnd, kind, bp, d) => ({ kind, b0: bp, d0: d, x0: (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 1.6), topple: null, stop: null, down: 0, flash: 0 });

const walkers = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), kind = rollW(rnd, BUILD_W, band);
    Object.assign(w, { kind, list: [], speeders: [{ a: 0, om: 1.1, R: 2.2, fire: 0 }, { a: 2.5, om: 0.8, R: 3, fire: 0 }], bolts: [], puffs: [], flakes: [], trip: null, lastBeat: -1, ridge: Array.from({ length: 24 }, () => rnd()) });
    for (let i = 0; i < 2 + band; i++) w.list.push(newWalker(rnd, kind, 0, 3 + i * 2.2 + rnd()));
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.42 * N, cx = N / 2, K = 0.5 * N, S = 0.9, bp = beatPos(f, t);
    const P = (x, d, y) => [cx + (x / d) * K, hz + ((1 - y) / d) * K]; // the world: x across, d away, y up from the snow
    const where = (A) => { const q = Math.max(0, (A.stop ?? bp) - A.b0), d = Math.max(0.6, A.d0 - q * S * 0.75); return { d, x: A.x0 - Math.sign(A.x0) * q * S * 0.3 }; }; // a toppled one stays where it fell
    if (f.section === 'change') w.kind = rollW(rnd, BUILD_W, band);
    // the sky, the far ridge, the snow, the haze over it
    r.rect(0, 0, N, hz, DARK + DIM);
    stars(r, N, 24, 41, 0.3);
    for (let x = 0; x < N; x++) { const i = (x / N) * 23, k = Math.floor(i), rh = lerp(w.ridge[k], w.ridge[k + 1], i - k) * 0.06 * N; r.rect(x, hz - rh, 1, rh, DARK); }
    r.rect(0, hz, N, N - hz, BRIGHT);
    r.rect(0, hz, N, 0.03 * N, LMID);
    for (let k = 0; k < 40; k++) { const d = 1.2 + 9 * hash(k, 43) ** 2, [dx, dy] = P((hash(k, 44) - 0.5) * 2 * d, d, 0); r.rect(dx - (0.3 * K) / d, dy, (0.6 * K) / d, Math.max(1, u), LMID); } // drifts, foreshortened with the field
    // the walkers keep coming; one at the front is the lead the speeders circle
    const want = 2 + band + (w.trip ? 1 : 0);
    while (w.list.length < want) w.list.push(newWalker(rnd, w.kind, bp, 7 + rnd() * 3));
    for (const A of w.list) if (where(A).d < 1.1 || (A.down > 0 && (A.down -= dt) <= 0 && A.topple)) Object.assign(A, newWalker(rnd, w.kind, bp, 8 + rnd() * 3));
    w.list.sort((a, b) => where(b).d - where(a).d);
    let lead = null;
    for (const A of w.list) if (!A.topple) lead = A;
    const L = lead ? where(lead) : { x: 0, d: 4 };
    // hits: the lead fires forward on a kick, a speeder fires at its legs on a snare; the drop is the cable
    for (const hh of hits) {
      if (isLow(hh) && lead && lead.kind !== 'hover') { const B = BUILDS[lead.kind], dir = -Math.sign(lead.x0); lead.flash = 0.08; for (const k of [-0.08, 0.08]) w.bolts.push({ x: L.x + dir * B.gun[0], d: L.d + k, y: B.H - B.gun[1], vx: dir * 5, vd: 0, vy: -1.6, life: 2 }); } // from the muzzles
      else if (isLow(hh) && lead) { const B = BUILDS.hover, dir = -Math.sign(lead.x0); lead.flash = 0.08; w.bolts.push({ x: L.x + dir * B.gun[0], d: L.d - 0.2, y: B.H - B.gun[1], vx: 0, vd: -4, vy: -1.2, life: 1 }); }
      else if (hh.kind === 'snare') { const sp = w.speeders[Math.floor(rnd() * 2)]; sp.fire = 0.08; const sx = L.x + Math.cos(sp.a) * sp.R, sd = Math.max(0.7, L.d + Math.sin(sp.a) * sp.R); w.bolts.push({ x: sx, d: sd, y: 0.6, vx: (L.x - sx) * 3, vd: (L.d - sd) * 3, vy: 0, life: 0.33, hitLeg: true }); }
    }
    if (f.section === 'drop' && !w.trip && lead) {
      if (lead.kind === 'hover') { lead = newWalker(rnd, 'quad', bp, 3.2); w.list.push(lead); }
      w.trip = { who: lead, turns: 0 };
    }
    // the speeders: round the lead on ellipses in the snow's plane; the one on the cable winds in close and fast
    for (let i = 0; i < 2; i++) {
      const sp = w.speeders[i], tripping = w.trip && i === 0;
      sp.R = follow(sp.R, tripping ? 0.9 : 2.2 + i * 0.8, dt, 0.4);
      sp.a += dt * sp.om * (tripping ? 3 : 1 + 0.6 * f.rel.trebDrive);
      sp.fire -= dt;
      if (tripping) { w.trip.turns += (dt * sp.om * 3) / TAU; if (w.trip.turns > 3 && !w.trip.who.topple) { w.trip.who.topple = { th: 0.05, om: 0 }; w.trip.who.stop = bp; w.trip.who.down = 4; } if (w.trip.who.topple && w.trip.who.topple.th > 1.4) w.trip = null; }
    }
    // everything in the field, far to near: the walkers with their shadows, the speeders between them
    const items = w.list.map((A) => ({ d: where(A).d, A })).concat(w.speeders.map((sp, i) => ({ d: Math.max(0.7, L.d + Math.sin(sp.a) * sp.R), sp, i })));
    items.sort((a, b) => b.d - a.d);
    const beatNow = Math.floor(bp), plant = beatNow !== w.lastBeat;
    w.lastBeat = beatNow;
    for (const it of items) {
      if (it.sp) { // a speeder: a flat hull with a tail fin, low over the snow, a cannon flash when it fires
        const sp = it.sp, sx = L.x + Math.cos(sp.a) * sp.R, sd = it.d, [px, py] = P(sx, sd, 0.55), sz = (0.18 * N) / sd, dir = Math.sin(sp.a) < 0 ? -1 : 1;
        r.ring(P(sx, sd, 0)[0] - sz * 0.15, P(sx, sd, 0)[1], sz * 0.3, sz * 0.6, LMID, 0.2); // the shadow in the snow, away from the light like the walkers'
        r.rect(px - sz * 0.6, py - sz * 0.12, sz * 1.2, sz * 0.24, DARK);
        r.rect(px - dir * sz * 0.5 - sz * 0.08, py - sz * 0.4, sz * 0.16, sz * 0.3, DARK);
        r.rect(px + dir * sz * 0.3, py - sz * 0.22, sz * 0.2, sz * 0.12, DARK);
        if (sp.fire > 0) r.disc(px + dir * sz * 0.65, py, sz * 0.15, HOT);
        if (w.trip && it.i === 0 && w.trip.who && !w.trip.who.topple) { const [lx, ly] = P(L.x, L.d, 0.5); r.line(px, py, lx, ly, DARK); for (let k = 0; k < Math.min(3, Math.floor(w.trip.turns)); k++) r.rect(lx - (0.12 * N) / L.d, ly - k * 2 * u, (0.24 * N) / L.d, Math.max(1, u), DARK); } // the cable and its wraps
        continue;
      }
      const A = it.A, B = BUILDS[A.kind], { x, d } = where(A), dir = -Math.sign(A.x0), sc = K / d, [bx, gy] = P(x, d, 0), col = DARK, far = DARK + DIM;
      A.flash -= dt;
      r.ring(bx - sc * 0.3, gy, sc * 0.45, sc * 0.9, LMID, 0.16); // the shadow, away from the light on the right
      if (A.topple) { // over the front feet: the whole frame turns about them, the legs stiff and crossed, down into the snow
        const T = A.topple, pvx = bx + dir * sc * Math.max(...B.legs.map((l) => l[0])), pvy = gy;
        if (T.th < 1.45) { T.om += 5 * Math.sin(T.th) * dt; T.th += T.om * dt; if (T.th >= 1.45) { T.th = 1.45; s.shake = Math.max(s.shake, 0.9); burst(w.puffs, rnd, pvx + dir * sc * 1.6, gy, 30, (N * 0.35) / Math.max(1, d * 0.5), LMID, 0.8); } }
        const th = T.th * dir, c = Math.cos(th), sn = Math.sin(th), R = (lx, ly) => [pvx + (lx - pvx) * c - (ly - pvy) * sn, pvy + (lx - pvx) * sn + (ly - pvy) * c];
        const body = [[bx - dir * sc * 0.9, gy - sc * B.H], [bx + dir * sc * 0.7, gy - sc * B.H], [bx + dir * sc * 0.7, gy - sc * (B.H - 0.7)], [bx - dir * sc * 0.9, gy - sc * (B.H - 0.7)]].map(([px, py]) => R(px, py));
        r.poly(body, col);
        for (const [hx, , , side] of B.legs) { const [ax, ay] = R(bx + dir * sc * hx, gy - sc * (B.H - 0.7)), [fx, fy] = R(bx + dir * sc * (hx + side * 0.3), gy); r.stroke(ax, ay, fx, fy, Math.max(1, sc * 0.08), col); }
        const [hx2, hy2] = R(bx + dir * sc * 1.3, gy - sc * (B.H - 0.3));
        r.rect(hx2 - sc * 0.25, hy2 - sc * 0.2, sc * 0.5, sc * 0.4, col);
        targets.push({ x: bx - sc, y: gy - sc * B.H, w: 2 * sc, h: sc * B.H });
        continue;
      }
      if (A.kind === 'hover') { // the tank: a hull floating on its downwash, a turret turning toward us, puffs under it on the beat
        const hov = 0.45 + 0.08 * Math.sin(t * 2 + A.d0), [hx, hy] = P(x, d, hov);
        r.poly([[hx - sc * 0.9, hy], [hx + sc * 0.9, hy], [hx + sc * 0.7, hy - sc * 0.4], [hx - sc * 0.7, hy - sc * 0.4]], col);
        r.rect(hx - sc * 0.3, hy - sc * 0.7, sc * 0.6, sc * 0.3, col);
        r.stroke(hx, hy - sc * 0.55, hx + dir * sc * 0.8, hy - sc * 0.6, Math.max(1, sc * 0.07), col);
        for (const k of [-0.6, 0, 0.6]) r.rect(hx + k * sc - sc * 0.08, hy - sc * 0.1, sc * 0.16, sc * 0.1, f.beat.pulse > 0.5 ? COOL : COOL + DIM);
        if (plant) burst(w.puffs, rnd, hx, gy, 4, (N * 0.15) / Math.max(1, d * 0.5), LMID, 0.4);
        targets.push({ x: hx - sc * 0.9, y: hy - sc * 0.7, w: sc * 1.8, h: sc * 0.7 });
        continue;
      }
      // the legs: far side first, then the body, then the near side. The feet are placed in the field's own space
      // along the stride the body makes in a beat (vx across, vd toward us), so a planted foot stands on one spot
      // of the snow (and nearer the camera, so lower) while the body goes on over it; a foot plants on the beat
      // with a puff of snow
      const hipY = gy - sc * (B.H - 0.7), seg = B.seg * sc, pair = beatNow % 2, vx = dir * 0.3 * S, vd = -0.75 * S;
      const leg = (hx, off, near, side) => {
        const q = (bp * 0.5 + off) % 1, st = q < 0.5 ? 0.5 - 2 * q : 2 * q - 1.5, lift = q < 0.5 ? 0 : Math.sin(Math.PI * ((q - 0.5) / 0.5)) * 0.3; // st: half a stride ahead at the plant, half behind at the lift
        const ax = bx + dir * sc * hx, [fx, fy] = P(x + dir * hx + vx * st, d + vd * st, lift), mx = (ax + fx) / 2, my = (hipY + fy) / 2;
        const D = Math.hypot(fx - ax, fy - hipY), bend = Math.sqrt(Math.max(0, seg * seg - (D / 2) * (D / 2))), nx = -(fy - hipY) / (D || 1), ny = (fx - ax) / (D || 1);
        const kx = mx + nx * bend * side * dir, ky = my + ny * bend * side * dir, c = near ? col : far, lw = Math.max(1, sc * (near ? 0.1 : 0.08));
        r.stroke(ax, hipY, kx, ky, lw, c);
        r.stroke(kx, ky, fx, fy, lw, c);
        r.rect(fx - sc * 0.12, fy - sc * 0.04, sc * 0.24, Math.max(1, sc * 0.06), c);
        if (plant && ((off === 0) === (pair === 0)) && near) burst(w.puffs, rnd, fx, fy, 3, (N * 0.12) / Math.max(1, d * 0.5), LMID, 0.4);
      };
      for (const [hx, off, near, side] of B.legs) if (!near) leg(hx, off, near, side);
      if (A.kind === 'quad') {
        r.rect(Math.min(bx - dir * sc * 0.9, bx + dir * sc * 0.7), gy - sc * B.H, sc * 1.6, sc * 0.7, col);
        r.stroke(bx + dir * sc * 0.7, gy - sc * (B.H - 0.15), bx + dir * sc * 1.15, gy - sc * (B.H - 0.35), Math.max(1, sc * 0.18), col); // the neck
        r.rect(Math.min(bx + dir * sc * 1.1, bx + dir * sc * 1.6), gy - sc * (B.H - 0.1), sc * 0.5, sc * 0.4, col); // the head
        for (const k of [-0.1, 0.1]) r.rect(Math.min(bx + dir * sc * 1.6, bx + dir * sc * 1.95), gy - sc * (B.H - 0.2 + k), sc * 0.35, Math.max(1, sc * 0.05), A.flash > 0 ? BRIGHT : col); // the cannons
      } else { // the scout: a round body on two legs, a chin gun
        r.disc(bx, gy - sc * (B.H - 0.35), sc * 0.4, col);
        r.rect(Math.min(bx + dir * sc * 0.25, bx + dir * sc * 0.6), gy - sc * (B.H - 0.5), sc * 0.35, Math.max(1, sc * 0.08), A.flash > 0 ? BRIGHT : col);
        r.rect(bx - sc * 0.15, gy - sc * (B.H - 0.55), sc * 0.3, sc * 0.1, BLACK);
      }
      for (const [hx, off, near, side] of B.legs) if (near) leg(hx, off, near, side);
      targets.push({ x: bx - sc, y: gy - sc * B.H, w: 2.2 * sc, h: sc * B.H });
    }
    // the bolts, in the field's own space: forward and down into the snow, or from a speeder into the lead's legs
    w.bolts = w.bolts.filter((b) => {
      b.x += b.vx * dt; b.d += b.vd * dt; b.y += b.vy * dt; b.life -= dt;
      const [x0, y0] = P(b.x, b.d, b.y), [x1, y1] = P(b.x - b.vx * 0.05, b.d - b.vd * 0.05, b.y - b.vy * 0.05);
      r.stroke(x0, y0, x1, y1, Math.max(1, (1.5 * u) / Math.max(0.6, b.d * 0.4)), b.hitLeg ? COOL : HOT);
      if (b.y <= 0 || b.d < 0.6) { burst(w.puffs, rnd, x0, y0, 8, (N * 0.25) / Math.max(1, b.d * 0.5), LMID, 0.5); return false; }
      if (b.hitLeg && b.life <= 0) { burst(w.puffs, rnd, x0, y0, 6, (N * 0.2) / Math.max(1, b.d * 0.5), HOT, 0.4); return false; }
      return b.life > 0;
    });
    w.puffs = particles(W, w.puffs, LMID);
    snowfall(W, w.flakes, 50, 0.08 + 0.12 * f.rel.trebDrive, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- fleet
// Capital ships over the limb of a planet: two big silhouettes, the near one large and the far one small, trading
// fire on the beats, the bolts crossing the gap at a speed and flashing where they land, the shields rippling; a
// kick is the main battery, the hats launch fighter pairs that weave across and back, a snare picks one off. No
// gravity up here: a drop breaks one cruiser into chunks that drift apart turning, fires along the breaks, till a
// new ship streaks in to take its place. The pair of classes goes by arousal and is re-rolled at a section change.
const PAIR_W = { 'wedge/block': [2, 2, 2], 'saucer/hammer': [2, 2, 1], 'ring/wedge': [1, 2, 2], 'block/hammer': [1, 1, 2] };
// a ship of class `cls` at (x, y), sz its half-length, facing dir, the engines at the back glowing by `eng`
function drawShip(r, cls, x, y, sz, dir, col, u, eng) {
  const E = (dy) => r.disc(x - dir * sz * 1.05, y + dy * sz, sz * (0.07 + 0.06 * eng), HOT);
  switch (cls) {
    case 'wedge': r.poly([[x + dir * sz * 1.2, y], [x - dir * sz * 0.9, y - sz * 0.38], [x - dir * sz * 0.9, y + sz * 0.38]], col); r.rect(x - dir * sz * 0.7 - sz * 0.12, y - sz * 0.5, sz * 0.24, sz * 0.14, col); for (const dy of [-0.2, 0, 0.2]) E(dy); break;
    case 'block': r.rect(x - sz, y - sz * 0.22, sz * 2, sz * 0.44, col); r.rect(x - dir * sz * 0.5 - sz * 0.15, y - sz * 0.55, sz * 0.3, sz * 0.35, col); for (let k = 0; k < 4; k++) r.rect(x - sz * 0.6 + k * sz * 0.4, y - sz * 0.3, sz * 0.12, sz * 0.08, col); for (const dy of [-0.12, 0.12]) E(dy); break;
    case 'saucer': r.ring(x + dir * sz * 0.3, y, sz * 0.4, sz * 0.8, col, 0.32); r.rect(x - dir * sz * 1.1, y - sz * 0.08, sz * 1.1, sz * 0.16, col); r.disc(x + dir * sz * 0.3, y - sz * 0.1, sz * 0.14, col); E(0); break;
    case 'hammer': r.rect(x - sz, y - sz * 0.1, sz * 1.9, sz * 0.2, col); r.rect(x + dir * sz * 0.9 - sz * 0.12, y - sz * 0.55, sz * 0.24, sz * 1.1, col); r.rect(x - dir * sz * 0.3 - sz * 0.1, y - sz * 0.3, sz * 0.2, sz * 0.2, col); for (const dy of [-0.08, 0.08]) E(dy); break;
    default: r.ring(x, y, sz * 0.7, sz * 0.18, col); r.disc(x, y, sz * 0.22, col); r.rect(x - dir * sz * 1.1, y - sz * 0.06, sz * 0.45, sz * 0.12, col); E(0);
  }
}

const fleet = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    const pair = rollW(rnd, PAIR_W, band).split('/');
    Object.assign(w, { pair, bolts: [], fighters: [], ripples: [], bits: [], wreck: null, warp: 0, turn: 0, flashes: [], xc: 0.55 + rnd() * 0.1 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), eng = clamp(f.rel.bassDrive);
    const ships = [{ x: 0.24 * N, y: 0.56 * N, sz: 0.15 * N, dir: 1, d: 1 }, { x: 0.76 * N, y: 0.42 * N, sz: 0.09 * N, dir: -1, d: 1.65 }];
    if (f.section === 'change') w.pair = rollW(rnd, PAIR_W, band).split('/');
    if (f.section === 'drop' && !w.wreck) { // the break-up: three chunks of the hull, each with its own drift and spin
      const i = rnd() < 0.5 ? 0 : 1, S0 = ships[i];
      w.wreck = { i, t: 0, pieces: [-0.6, 0.05, 0.65].map((k) => ({ x: S0.x + S0.dir * k * S0.sz, y: S0.y, vx: (rnd() - 0.5) * 0.03 * N + S0.dir * k * 0.015 * N, vy: (rnd() - 0.5) * 0.03 * N, a: 0, om: (rnd() - 0.5) * 1.2, hw: S0.sz * 0.45, hh: S0.sz * (0.14 + rnd() * 0.12) })) };
      for (let k = 0; k < 40; k++) w.bits.push({ x: S0.x + (rnd() - 0.5) * S0.sz * 2, y: S0.y + (rnd() - 0.5) * S0.sz * 0.5, vx: (rnd() - 0.5) * 0.15 * N, vy: (rnd() - 0.5) * 0.15 * N, life: 3 + rnd() * 3, c: rnd() < 0.3 ? HOT : LMID });
      s.shake = Math.max(s.shake, 0.6);
    }
    // the sky, the planet's limb below with its thin atmosphere, the night side to the right
    stars(r, N, 60, 51, 1, LMID);
    const xc = w.xc * N, yc = 1.7 * N, R = 1.02 * N;
    for (let x = 0; x < N; x++) { const dx = x - xc, yl = yc - Math.sqrt(Math.max(0, R * R - dx * dx)); if (yl < N) { r.rect(x, yl, 1, N - yl, x > 0.7 * N ? DARK : MID); r.rect(x, yl - 1.5 * u, 1, 1.5 * u, f.level > 0.6 ? BRIGHT : LMID); r.rect(x, yl - 4 * u, 1, 2.5 * u, COOL + DIM); } }
    // the bolts: on the beat each ship takes its turn, a kick is the near one's main battery; impacts flash and ripple the shield
    const fire = (from, to, heavy) => {
      const S0 = ships[from], S1 = ships[to];
      const gx = S0.x + S0.dir * S0.sz * (0.3 + rnd() * 0.5), gy = S0.y + (rnd() - 0.5) * S0.sz * 0.3, tx = S1.x + (rnd() - 0.5) * S1.sz * 1.4, ty = S1.y + (rnd() - 0.5) * S1.sz * 0.4;
      const len = Math.hypot(tx - gx, ty - gy), sp = N * (heavy ? 0.7 : 0.55);
      w.bolts.push({ x: gx, y: gy, vx: ((tx - gx) / len) * sp, vy: ((ty - gy) / len) * sp, life: len / sp, T: len / sp, len: heavy ? 0.09 : 0.06, w: heavy ? 2 * u : Math.max(1, u), c: heavy ? HOT : from === 0 ? HOT : COOL, to, heavy });
    };
    if (f.beat.on && !w.wreck) { fire(w.turn, 1 - w.turn, false); w.turn = 1 - w.turn; }
    for (const hh of hits) {
      if (isLow(hh) && hh.strength > 0.5 && !(w.wreck && w.wreck.i === 0)) fire(0, 1, true);
      else if (hh.kind === 'hat' && w.fighters.length < 8 + 16 * f.level) { const from = Math.floor(rnd() * 2); for (const k of [-1, 1]) w.fighters.push({ from, p: 0, off: k * 0.025 * N + (rnd() - 0.5) * 0.03 * N, sp: 0.35 + rnd() * 0.2 }); }
      else if (hh.kind === 'snare') {
        if (w.fighters.length) { const i = Math.floor(rnd() * w.fighters.length), F = w.fighters[i]; const [fx, fy] = fleetFighter(ships, F, N); for (let k = 0; k < 8; k++) w.bits.push({ x: fx, y: fy, vx: (rnd() - 0.5) * 0.2 * N, vy: (rnd() - 0.5) * 0.2 * N, life: 0.5, c: BRIGHT }); w.fighters.splice(i, 1); }
        else for (let k = 0; k < 3; k++) if (!w.wreck) fire(1, 0, false);
      }
    }
    w.bolts = w.bolts.filter((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      const S1 = ships[b.to], scale = 1 / lerp(ships[1 - b.to].d, S1.d, 1 - clamp(b.life / b.T)); // thinner as it goes away, thicker as it comes near
      r.stroke(b.x, b.y, b.x - b.vx * b.len * scale, b.y - b.vy * b.len * scale, Math.max(1, b.w * scale), b.c);
      if (b.life <= 0) { w.flashes.push({ x: b.x, y: b.y, r: (b.heavy ? 0.035 : 0.02) * N / S1.d, t: 0.15 }); if (!(w.wreck && w.wreck.i === b.to)) w.ripples.push({ i: b.to, t: 0 }); return false; }
      return true;
    });
    // the ships, the far one behind; a wreck instead of the one that broke, till the replacement streaks in
    for (let i = 1; i >= 0; i--) {
      const S0 = ships[i];
      if (w.wreck && w.wreck.i === i) {
        const Wk = w.wreck;
        Wk.t += dt;
        for (const p of Wk.pieces) { p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.om * dt; r.poly(rotRect(p.x, p.y, p.hw, p.hh, p.a), FIG); if (hash(Math.floor(t * 12), p.hw | 0) < 0.6) r.rect(p.x + Math.cos(p.a) * p.hw * (rnd() - 0.5) * 2, p.y + Math.sin(p.a) * p.hw * (rnd() - 0.5) * 2, 2 * u, 2 * u, HOT); } // fires along the breaks
        targets.push({ x: Wk.pieces[1].x - S0.sz, y: Wk.pieces[1].y - S0.sz * 0.4, w: 2 * S0.sz, h: S0.sz * 0.8 });
        if (Wk.t > 7) { w.wreck = null; w.warp = 0.35; }
        continue;
      }
      if (w.warp > 0 && i === (w.lastWreck ?? i)) { r.rect(S0.dir > 0 ? -N : S0.x, S0.y - u, N * 1.2 * (w.warp / 0.35) + S0.sz, 2 * u, BRIGHT); }
      drawShip(r, w.pair[i], S0.x, S0.y, S0.sz, S0.dir, FIG, u, eng);
      targets.push({ x: S0.x - S0.sz * 1.1, y: S0.y - S0.sz * 0.6, w: S0.sz * 2.2, h: S0.sz * 1.2 });
    }
    if (w.wreck) w.lastWreck = w.wreck.i;
    w.warp -= dt;
    // the fighters: out to the other ship and back on a weave, smaller the farther they are; the shields and the flashes
    w.fighters = w.fighters.filter((F) => {
      F.p += dt * F.sp;
      const [fx, fy, d] = fleetFighter(ships, F, N), sz = Math.max(1, (1.6 * u) / d);
      r.rect(fx - sz / 2, fy - sz / 2, sz, sz, BRIGHT);
      r.rect(fx - sz / 2 - (F.p < 1 ? 1 : -1) * (F.from === 0 ? 1 : -1) * sz, fy, sz, Math.max(1, sz * 0.5), LMID + DIM);
      return F.p < 2;
    });
    w.ripples = w.ripples.filter((rp) => { rp.t += dt; const S0 = ships[rp.i]; r.ring(S0.x, S0.y, S0.sz * (1.25 + rp.t * 0.5), Math.max(1, u), rp.t < 0.1 ? COOL : COOL + DIM, 0.5); return rp.t < 0.3; });
    w.flashes = w.flashes.filter((fl) => { fl.t -= dt; r.disc(fl.x, fl.y, fl.r * (1 + (0.15 - fl.t) * 3), fl.t > 0.08 ? BRIGHT : HOT); return fl.t > 0; });
    w.bits = drift(W, w.bits, LMID);
  },
};
// where a fighter is on its run: out to the other ship (p 0..1) and back (1..2), weaving; returns [x, y, depth]
function fleetFighter(ships, F, N) {
  const A = ships[F.from], B = ships[1 - F.from], q = F.p < 1 ? F.p : 2 - F.p;
  return [lerp(A.x, B.x, q), lerp(A.y, B.y, q) + F.off + Math.sin(F.p * TAU * 2) * 0.04 * N, lerp(A.d, B.d, q)];
}

// ---------------------------------------------------------------------------------------------- throne
// A dark hall: a hooded figure on a raised throne, a kneeling one before it, guards in a row down each wall whose
// pikes tap the floor on the beat, tall windows with the fleet battle going on outside. On the snares lightning
// leaves the hooded figure's hands: branching arcs that end on the kneeling figure's outline and light the hall
// for a few frames (no gore). A drop shakes the hall and shatters a window: the shards fall and bounce on the
// floor. The lightning's style goes by arousal: a fork, a web of fine arcs, a single lance; a drop is the storm.
const BOLT_W = { fork: [2, 2, 1], web: [1, 2, 3], lance: [3, 1, 0] };
const tinyShip = (rnd, x0, x1, y0, y1) => ({ x: x0 + rnd() * (x1 - x0), y: y0 + rnd() * (y1 - y0), vx: (rnd() - 0.5) * 0.01, vy: (rnd() - 0.5) * 0.006 });

const throne = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { style: rollW(rnd, BOLT_W, band), arcs: 0, storm: 0, broken: -1, shards: [], outside: [0, 1].map(() => ({ ships: [tinyShip(rnd, 0, 1, 0.1, 0.9), tinyShip(rnd, 0, 1, 0.1, 0.9), tinyShip(rnd, 0, 1, 0.1, 0.9)], bolts: [], flash: 0 })), tremor: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), cx = N / 2, fy = 0.7 * N;
    if (f.section === 'change') { w.style = rollW(rnd, BOLT_W, band); if (w.broken >= 0 && rnd() < 0.5) w.broken = -1; }
    if (f.section === 'drop') { // the storm, the shake, a window going: shards out of its panes, falling
      w.storm = 2; s.shake = Math.max(s.shake, 1);
      if (w.broken < 0) {
        w.broken = Math.floor(rnd() * 2);
        const wx = w.broken ? 0.74 * N : 0.12 * N;
        for (let k = 0; k < 16; k++) w.shards.push({ x: wx + rnd() * 0.14 * N, y: 0.12 * N + rnd() * 0.34 * N, vx: (rnd() - 0.5) * 0.25 * N, vy: -rnd() * 0.1 * N, a: rnd() * TAU, om: (rnd() - 0.5) * 8, sz: (1.5 + rnd() * 2.5) * u, life: 4, bounced: false });
      }
    }
    for (const hh of hits) {
      if (hh.kind === 'snare') w.arcs = 0.1; // a tenth of a second of arcs
      else if (isTonal(hh)) w.outside[hh.pc % 2].flash = 0.1;
      else if (isLow(hh)) w.tremor = hh.strength;
    }
    w.storm -= dt; w.tremor *= Math.exp(-dt * 6);
    const lit = w.arcs > 0 || (w.storm > 0 && hash(Math.floor(t * 20), 3) < 0.6);
    // the hall: a back wall, pillars either side of the dais, the floor in perspective, the windows with the battle outside
    r.rect(0, 0, N, fy, lit ? DARK : DARK + DIM);
    r.rect(0, fy, N, N - fy, lit ? MID + DIM : DARK);
    for (const d of [1.3, 1.8, 2.8, 5]) r.rect(0, fy + (N - fy) * (1 - 1 / d), N, 1, lit ? MID : DARK + DIM);
    for (const k of [-1, 1]) r.rect(cx + k * 0.3 * N - 0.02 * N, 0, 0.04 * N, fy, lit ? MID + DIM : DARK);
    for (let i = 0; i < 2; i++) {
      const x0 = i ? 0.74 * N : 0.12 * N, ww = 0.14 * N, y0 = 0.1 * N, wh = 0.38 * N, O = w.outside[i];
      r.rect(x0, y0, ww, wh, BG);
      for (let k = 0; k < 16; k++) r.set(x0 + hash(k, 61 + i) * ww, y0 + hash(k, 62 + i) * wh, LMID);
      O.flash -= dt;
      for (const sh of O.ships) { // tiny wedges drifting, kept inside the panes
        sh.x = clamp(sh.x + sh.vx * dt * (1 + f.rel.midDrive), 0.05, 0.95); sh.y = clamp(sh.y + sh.vy * dt, 0.05, 0.95);
        if (sh.x <= 0.05 || sh.x >= 0.95) sh.vx = -sh.vx;
        r.rect(x0 + sh.x * ww - 1.5 * u, y0 + sh.y * wh - u, 3 * u, Math.max(1, u), O.flash > 0 ? BRIGHT : LMID);
      }
      if (f.beat.on || (w.storm > 0 && rnd() < 0.3)) { const a = pick(rnd, O.ships), b = pick(rnd, O.ships); if (a !== b) O.bolts.push({ q: 0, a, b, c: rnd() < 0.5 ? HOT : COOL }); }
      O.bolts = O.bolts.filter((bl) => { bl.q += dt * 2.5; const q = Math.min(1, bl.q), x = x0 + lerp(bl.a.x, bl.b.x, q) * ww, y = y0 + lerp(bl.a.y, bl.b.y, q) * wh; r.line(x, y, x0 + lerp(bl.a.x, bl.b.x, Math.max(0, q - 0.12)) * ww, y0 + lerp(bl.a.y, bl.b.y, Math.max(0, q - 0.12)) * wh, bl.c); if (bl.q >= 1) r.disc(x, y, 1.5 * u, BRIGHT); return bl.q < 1.1; });
      if (w.broken !== i) { // the mullions and the glass tint; the broken one is an open hole
        r.rect(x0 + ww / 2 - u, y0, 2 * u, wh, DARK);
        for (let k = 1; k < 4; k++) r.rect(x0, y0 + (k * wh) / 4, ww, Math.max(1, u), DARK);
      } else for (let k = 0; k < 6; k++) r.poly([[x0 + (k % 2 ? ww : 0), y0 + (k / 6) * wh], [x0 + (k % 2 ? ww - 3 * u : 3 * u), y0 + (k / 6) * wh + 2 * u], [x0 + (k % 2 ? ww : 0), y0 + ((k + 1) / 6) * wh]], LMID); // jags left in the frame
      r.frame(Math.round(x0 - u), Math.round(y0 - u), Math.round(ww + 2 * u), Math.round(wh + 2 * u), MID);
    }
    // the dais and the throne, the hooded one on it with the hands out, lifting with the bass
    for (let k = 0; k < 3; k++) r.rect(cx - (0.14 + k * 0.05) * N, 0.56 * N + k * 0.045 * N, (0.28 + k * 0.1) * N, 0.045 * N, k % 2 ? MID + DIM : DARK);
    r.disc(cx, 0.4 * N, (0.1 + 0.03 * f.beat.pulse) * N, HOT + DIM); // the glow behind the throne
    r.rect(cx - 0.06 * N, 0.22 * N, 0.12 * N, 0.34 * N, BLACK);
    r.rect(cx - 0.09 * N, 0.46 * N, 0.18 * N, 0.1 * N, BLACK);
    const hy = 0.36 * N, lift = 0.03 * N * f.rel.bassDrive + (w.arcs > 0 ? 0.02 * N : 0);
    r.poly([[cx - 0.055 * N, 0.56 * N], [cx + 0.055 * N, 0.56 * N], [cx + 0.045 * N, hy + 0.04 * N], [cx + 0.02 * N, hy - 0.05 * N], [cx - 0.02 * N, hy - 0.05 * N], [cx - 0.045 * N, hy + 0.04 * N]], FIG);
    r.rect(cx - 0.012 * N, hy - 0.025 * N, 0.024 * N, 0.025 * N, BLACK); // the dark of the hood
    const hands = [[cx - 0.065 * N, 0.5 * N - lift], [cx + 0.065 * N, 0.5 * N - lift]];
    for (const [hx, hyy] of hands) { r.stroke(hx > cx ? cx + 0.03 * N : cx - 0.03 * N, hy + 0.06 * N, hx, hyy, Math.max(1, 1.5 * u), FIG); r.rect(hx - 1.5 * u, hyy - u, 3 * u, 2 * u, w.arcs > 0 ? BRIGHT : FIG); }
    // the kneeling one before the dais, trembling with the bass; lit white while the arcs run
    const kx = cx + (w.tremor > 0.05 ? (rnd() - 0.5) * w.tremor * 2 * u : 0), ky = 0.8 * N, kh = 0.14 * N, kc = w.arcs > 0 ? BRIGHT : FIG;
    r.rect(kx - kh * 0.2, ky - kh * 0.1, kh * 0.4, kh * 0.1, kc); // the knee and shin along the floor
    r.rect(kx + kh * 0.1, ky - kh * 0.5, kh * 0.14, kh * 0.5, kc); // the up thigh
    r.rect(kx - kh * 0.18, ky - kh * 0.78, kh * 0.36, kh * 0.4, kc); // the hunched body
    r.disc(kx - kh * 0.02, ky - kh * 0.82, kh * 0.1, kc);
    r.stroke(kx - kh * 0.1, ky - kh * 0.6, kx - kh * 0.3, ky - kh * 0.15, Math.max(1, kh * 0.08), kc); // an arm down to the floor
    targets.push({ x: kx - kh * 0.35, y: ky - kh, w: kh * 0.7, h: kh });
    if (w.arcs > 0 || (w.storm > 0 && rnd() < 0.7)) { // the arcs, hand to figure: they end on its outline
      w.arcs -= dt;
      const ends = [[kx - kh * 0.02, ky - kh * 0.9], [kx + kh * 0.17, ky - kh * 0.5], [kx - kh * 0.18, ky - kh * 0.7], [kx - kh * 0.3, ky - kh * 0.15]];
      const n = w.style === 'web' ? 3 : w.style === 'lance' ? 1 : 2, depth = w.style === 'web' ? 3 : w.style === 'lance' ? 0 : 2;
      for (let k = 0; k < n; k++) { const [hx, hyy] = hands[k % 2], [ex, ey] = pick(rnd, ends); if (w.style === 'lance') r.stroke(hx, hyy, ex, ey, 2 * u, BRIGHT); arc(r, rnd, hx, hyy, ex, ey, k % 2 ? COOL : BRIGHT, depth, u); }
      r.ring(kx, ky + u, kh * 0.25, kh * 0.5, COOL + DIM, 0.3); // the floor lit under it
    }
    // the guards down both walls, nearer and bigger toward us, their pikes tapping the floor on the beat
    const tap = Math.sin(Math.PI * f.beat.phase) * 2 * u;
    for (let i = 0; i < 3; i++) for (const side of [-1, 1]) {
      const gx = cx + side * (0.46 - i * 0.07) * N, gb = (0.74 + i * 0.07) * N, gh = (0.12 + i * 0.025) * N;
      walker(r, gx, gb, gh, FIG, 0, -side, { cap: true, hatCol: LMID });
      const px = gx - side * gh * 0.22;
      r.rect(px - u / 2, gb - gh * 1.3 - tap, Math.max(1, u), gh * 1.3, FIG);
      r.poly([[px - 1.5 * u, gb - gh * 1.3 - tap], [px + 1.5 * u, gb - gh * 1.3 - tap], [px, gb - gh * 1.45 - tap]], LMID);
      if (f.beat.on) r.rect(px - 2 * u, gb - u, 4 * u, Math.max(1, u), LMID);
    }
    // the shards: down the wall under gravity, one bounce off the floor, then they lie there and fade
    w.shards = w.shards.filter((sh) => {
      sh.vy += N * 1.6 * dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.a += sh.om * dt; sh.life -= dt;
      if (sh.y > fy) { sh.y = fy; if (!sh.bounced) { sh.vy *= -0.3; sh.vx *= 0.5; sh.bounced = true; } else { sh.vy = 0; sh.vx = 0; sh.om = 0; } }
      r.poly([[sh.x + Math.cos(sh.a) * sh.sz, sh.y + Math.sin(sh.a) * sh.sz], [sh.x + Math.cos(sh.a + 2.3) * sh.sz, sh.y + Math.sin(sh.a + 2.3) * sh.sz], [sh.x + Math.cos(sh.a + 4.2) * sh.sz * 0.6, sh.y + Math.sin(sh.a + 4.2) * sh.sz * 0.6]], sh.life > 1 ? LMID : MID + DIM);
      return sh.life > 0;
    });
    if (w.storm > 0) s.shake = Math.max(s.shake, 0.3);
  },
};

// ---------------------------------------------------------------------------------------------- twinsuns
// A desert homestead at dusk: two suns going down together, one large and one small, the sky in light bands
// under them, condenser towers, a speeder passing low with its ground-effect dust, and two robots of different
// builds crossing: a tall thin one that takes a step a beat, a short boxy one that rolls. Meteors streak on the
// snares, the towers' lamps blink on the hats, the suns change colour at a section change (once they have set,
// the next one brings the next dusk), a drop sends a transport across in front of them. The homestead's skyline
// goes by arousal: the domes, a field of towers, mesas behind.
const HOME_W = { domes: [3, 2, 1], towers: [2, 2, 2], cliffs: [1, 2, 3] };
const SUNC = [HOT, BRIGHT, LMID];

const twinsuns = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { home: rollW(rnd, HOME_W, band), sunI: Math.floor(rnd() * 3), sink: 0, speeder: { x: -0.15, dir: 1, y: 0 }, dust: [], tall: { x: 0.1, tx: 0.1 }, boxy: { x: 0.9 }, streaks: [], blink: 0, transport: null, dusk: true });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), hzn = 0.62 * N, bps = f.bpm ? f.bpm / 60 : 2;
    const sx1 = 0.56 * N, R1 = 0.085 * N, R2 = 0.05 * N, sy1 = 0.42 * N + w.sink, sx2 = sx1 + 0.17 * N, sy2 = sy1 - 0.1 * N, c1 = SUNC[w.sunI % 3], c2 = SUNC[(w.sunI + 1) % 3];
    w.sink = Math.min(w.sink + dt * 0.004 * N, 0.8 * N); // both down the same line at the same rate; no need to go on past the ground
    const night = sy2 - R2 > hzn; // both down: the stars come out
    if (f.section === 'change') { w.sunI++; if (rnd() < 0.3) w.home = rollW(rnd, HOME_W, band); if (night) w.sink = 0; }
    if (f.section === 'drop' && !w.transport) w.transport = { x: -0.3, dir: 1 };
    for (const hh of hits) {
      if (hh.kind === 'snare') w.streaks.push({ x: (0.3 + rnd() * 0.7) * N, y: rnd() * 0.3 * N, life: 0.45, len: (0.1 + 0.1 * hh.strength) * N });
      else if (hh.kind === 'hat') w.blink = 0.15;
      else if (isLow(hh)) for (let k = 0; k < 6; k++) w.dust.push({ x: w.speeder.x * N + (rnd() - 0.5) * 0.1 * N, y: 0.84 * N, vx: (rnd() - 0.5) * 0.3 * N, vy: -rnd() * 0.15 * N, life: 0.6 });
    }
    w.blink -= dt;
    // the sky in bands, the suns with the bands of light across them, the stars once they are down
    const skyC = [DARK + DIM, DARK, MID + DIM, MID, LMID];
    for (let k = 0; k < 5; k++) r.rect(0, (k * 0.125) * N, N, 0.13 * N, night ? (k < 2 ? BG : DARK + DIM) : skyC[k]);
    if (night) stars(r, N, 50, 71, 0.6, BRIGHT);
    r.disc(sx1, sy1, R1 * (1.3 + 0.2 * f.level), c1 + DIM);
    r.disc(sx1, sy1, R1, c1);
    r.disc(sx2, sy2, R2 * 1.3, c2 + DIM);
    r.disc(sx2, sy2, R2, c2);
    for (let k = 0; k < 4; k++) { const y = sy1 + R1 * (0.15 + k * 0.22); r.rect(sx1 - R1 * 1.4, y, R1 * 2.8, Math.max(1, u * (0.5 + k * 0.4)), skyC[Math.min(4, 2 + k)]); }
    for (let k = 0; k < 2; k++) r.rect(sx2 - R2 * 1.4, sy2 + R2 * (0.3 + k * 0.35), R2 * 2.8, Math.max(1, u * 0.7), skyC[3]);
    // the transport, a drop's: a big flat hull crossing in front of the suns
    if (w.transport) {
      const T = w.transport, tx = T.x * N, ty = 0.4 * N;
      T.x += dt * 0.06;
      r.rect(tx - 0.13 * N, ty - 0.02 * N, 0.26 * N, 0.04 * N, DARK + DIM);
      r.rect(tx - 0.04 * N, ty - 0.06 * N, 0.07 * N, 0.04 * N, DARK + DIM);
      r.rect(tx - 0.15 * N, ty - 0.005 * N, 0.04 * N, 0.01 * N, DARK + DIM);
      for (let k = 0; k < 5; k++) r.rect(tx - 0.1 * N + k * 0.05 * N, ty - 0.005 * N, 1.5 * u, Math.max(1, u), (k + f.beat.count) % 2 ? COOL : COOL + DIM);
      if (T.x > 1.3) w.transport = null;
    }
    w.streaks = w.streaks.filter((st) => { st.life -= dt; const k = 1 - st.life / 0.45; r.line(st.x - st.len * k, st.y + st.len * 0.5 * k, st.x - st.len * Math.min(1, k + 0.3), st.y + st.len * 0.5 * Math.min(1, k + 0.3), st.life > 0.2 ? BRIGHT : LMID); return st.life > 0; });
    // the ground: dunes, the skyline of the homestead against the sky
    r.rect(0, hzn, N, N - hzn, MID + DIM);
    for (let x = 0; x < N; x++) { const y = hzn + 0.08 * N + 0.04 * N * Math.sin((x / N) * 4 + 1) + 0.015 * N * Math.sin((x / N) * 11); r.rect(x, y, 1, N - y, DARK + DIM); }
    r.rect(0, hzn, N, Math.max(1, u), LMID);
    const home = w.home, towerAt = (x, h) => { r.rect(x - u, hzn - h, 2 * u, h, DARK); r.rect(x - 3 * u, hzn - h, 6 * u, 1.5 * u, DARK); r.rect(x - 2 * u, hzn - h * 0.6, 4 * u, 2 * u, DARK); r.rect(x - u * 0.5, hzn - h - 1.5 * u, Math.max(1, u), Math.max(1, u), w.blink > 0 ? COOL : COOL + DIM); };
    if (home === 'domes') { for (const [dx, dr] of [[0.2, 0.07], [0.32, 0.05]]) r.ring(dx * N, hzn + u, dr * N * 0.5, dr * N, DARK, 0.6); r.rect(0.18 * N, hzn - 0.025 * N, 0.02 * N, 0.025 * N, w.blink > 0 ? HOT : HOT + DIM); r.rect(0.1 * N, hzn - 0.015 * N, 0.3 * N, 0.015 * N, DARK); towerAt(0.42 * N, 0.1 * N); }
    else if (home === 'towers') for (let k = 0; k < 6; k++) towerAt((0.08 + k * 0.14 + 0.03 * hash(k, 9)) * N, (0.08 + 0.1 * hash(k, 8)) * N);
    else { r.poly([[0.02 * N, hzn], [0.08 * N, hzn - 0.14 * N], [0.22 * N, hzn - 0.15 * N], [0.28 * N, hzn]], DARK + DIM); r.poly([[0.8 * N, hzn], [0.84 * N, hzn - 0.1 * N], [0.96 * N, hzn - 0.11 * N], [N, hzn]], DARK + DIM); r.ring(0.36 * N, hzn + u, 0.02 * N, 0.04 * N, DARK, 0.6); towerAt(0.45 * N, 0.08 * N); }
    r.rect(0, hzn + 0.08 * N, N, Math.max(1, u), LMID + DIM); // the dune crest's lit edge
    // the speeder: low over the sand, bobbing, dust blown back from under it; its shadow on the ground
    const S = w.speeder, g = 0.86 * N;
    S.x += S.dir * dt * (0.08 + 0.08 * f.level);
    if (S.x > 1.15) { S.x = 1.15; S.dir = -1; } else if (S.x < -0.15) { S.x = -0.15; S.dir = 1; }
    const spx = S.x * N, spy = g - 3 * u + Math.sin(t * 3) * 1.5 * u;
    r.ring(spx, g + u, 0.03 * N, 0.06 * N, DARK + DIM, 0.2);
    r.rect(spx - 0.07 * N, spy - 0.02 * N, 0.14 * N, 0.02 * N, FIG);
    r.rect(spx + S.dir * 0.015 * N - 0.015 * N, spy - 0.035 * N, 0.03 * N, 0.015 * N, FIG);
    r.rect(spx - S.dir * 0.06 * N - 0.005 * N, spy - 0.035 * N, 0.01 * N, 0.015 * N, FIG);
    r.rect(spx - S.dir * 0.07 * N - 0.004 * N, spy - 0.012 * N, 0.008 * N, 0.008 * N, HOT);
    if (rnd() < 0.6) w.dust.push({ x: spx + (rnd() - 0.5) * 0.1 * N, y: g, vx: -S.dir * N * (0.1 + rnd() * 0.2), vy: -rnd() * 0.08 * N, life: 0.5 });
    w.dust = particles(W, w.dust, LMID + DIM).filter((p) => p.y <= g + u);
    targets.push({ x: spx - 0.07 * N, y: spy - 0.04 * N, w: 0.14 * N, h: 0.05 * N });
    // the robots: the tall one a step a beat, the boxy one rolling at the same pace, both with their shadows toward us
    const Tl = w.tall, Bx = w.boxy, th = 0.17 * N, bh = 0.09 * N, gb = 0.93 * N;
    if (f.beat.on) Tl.tx += 0.02;
    Tl.x = follow(Tl.x, Tl.tx, dt, 0.1);
    if (Tl.x > 1.1) { Tl.x = -0.1; Tl.tx = -0.1; }
    Bx.x -= dt * 0.02 * bps;
    if (Bx.x < -0.1) Bx.x = 1.1;
    const tx = Tl.x * N, bx = Bx.x * N;
    r.ring(tx, gb + u, th * 0.1, th * 0.2, DARK + DIM, 0.3);
    r.rect(tx - th * 0.07, gb - th * 0.72, th * 0.14, th * 0.5, FIG);
    for (const k of [-1, 1]) r.rect(tx + k * th * 0.05 - u + Math.sin(Math.PI * beatPos(f, t)) * k * th * 0.06, gb - th * 0.24, 2 * u, th * 0.24, FIG);
    r.disc(tx, gb - th * 0.8, th * 0.09, FIG);
    r.rect(tx + th * 0.02, gb - th * 0.83, 2 * u, Math.max(1, u), COOL);
    for (const k of [-1, 1]) r.rect(tx + k * th * 0.1 - u, gb - th * 0.7, 2 * u, th * 0.35, FIG);
    r.ring(bx, gb + u, bh * 0.25, bh * 0.5, DARK + DIM, 0.3);
    r.rect(bx - bh * 0.4, gb - bh * 0.7, bh * 0.8, bh * 0.6, FIG);
    for (const k of [-1, 1]) r.rect(bx + k * bh * 0.45 - 1.5 * u, gb - bh * 0.45, 3 * u, bh * 0.45, FIG);
    r.ring(bx, gb - bh * 0.7, bh * 0.2, bh * 0.4, FIG, 0.6);
    const da = (Bx.x * N) / (bh * 0.4); // the dome turns with the travel
    r.rect(bx + Math.cos(da) * bh * 0.3 - u, gb - bh * 0.82 - Math.abs(Math.sin(da)) * bh * 0.1, 2 * u, 2 * u, f.beat.pulse > 0.5 ? HOT : COOL);
    targets.push({ x: tx - th * 0.2, y: gb - th * 0.9, w: th * 0.4, h: th * 0.9 });
  },
};

// ---------------------------------------------------------------------------------------------- jetpack
// An armoured bounty hunter on a jetpack over a city of traffic lanes stacked in depth, the far lanes small and
// slow, the near one sliding past in front. Gravity pulls all the time; the pack's thrust holds the hover and a
// kick is an impulse with a flare of flame. A pursuing drone trades fire on the snares, sparks off the armour and
// off the drone till it bursts and the next one comes. A drop cuts the thrust: a dive down through the lanes, the
// flare catching at the bottom. The armour goes by arousal (plated, a light scout, a heavy rig) and is re-rolled
// at a section change; heavier rigs jump less on the same kick and burn a bigger flame.
const ARMOR_W = { plated: [2, 2, 2], scout: [3, 2, 1], heavy: [1, 2, 3] };
const ARMOR = { plated: { h: 0.16, sh: 1.4, pack: 1, mass: 1 }, scout: { h: 0.14, sh: 1, pack: 0.7, mass: 0.8 }, heavy: { h: 0.18, sh: 1.7, pack: 1.3, mass: 1.3 } };
const LANES = [{ d: 3.2, y: 0.3, v: 0.22 }, { d: 2.2, y: 0.46, v: -0.3 }, { d: 1.5, y: 0.62, v: 0.4 }, { d: 0.85, y: 0.84, v: -0.6 }];
// the hunter at (x, y), facing dir, in flight: the pack behind with its nozzles, the gun arm forward, the legs trailing
function drawHunter(r, kind, x, y, h, dir, u, flame, col, t) {
  const A = ARMOR[kind], bw = h * 0.16, sh = bw * A.sh;
  r.rect(x - dir * bw * 1.9 - bw * 0.7, y - h * 0.3, bw * 1.4, h * 0.42 * A.pack, DARK + DIM); // the pack
  for (const k of [-0.4, 0.4]) {
    const nx = x - dir * bw * 1.9 + k * bw * 0.5, ny = y - h * 0.3 + h * 0.42 * A.pack;
    r.rect(nx - u, ny, 2 * u, 2 * u, MID);
    if (flame > 0.02) { const fl = flame * h * (0.3 + 0.6 * hash(Math.floor(t * 40), k * 10)); r.poly([[nx - 1.5 * u, ny + 2 * u], [nx + 1.5 * u, ny + 2 * u], [nx + (hash(Math.floor(t * 30), 2) - 0.5) * 2 * u, ny + 2 * u + fl]], flame > 0.6 ? BRIGHT : HOT); }
  }
  for (const k of [-0.35, 0.35]) r.stroke(x + k * bw, y + h * 0.2, x - dir * h * 0.25 + k * bw, y + h * 0.42, Math.max(1, bw * 0.55), col); // the legs, trailing
  r.rect(x - bw, y - h * 0.3, 2 * bw, h * 0.5, col);
  r.rect(x - sh, y - h * 0.32, 2 * sh, h * 0.12, kind === 'scout' ? col : LMID); // the shoulder plates
  r.stroke(x, y - h * 0.2, x + dir * h * 0.3, y - h * 0.22, Math.max(1, bw * 0.5), col); // the gun arm
  r.rect(Math.min(x + dir * h * 0.3, x + dir * h * 0.42), y - h * 0.26, h * 0.12, bw * 0.5, DARK);
  const hy = y - h * 0.42;
  if (kind === 'heavy') { r.rect(x - bw * 0.9, hy - bw * 0.9, bw * 1.8, bw * 1.8, LMID); r.rect(x - bw * 0.8, hy - bw * 0.3, bw * 1.6, bw * 0.4, BLACK); }
  else if (kind === 'scout') { r.disc(x, hy, bw * 0.8, LMID); r.rect(Math.min(x + dir * bw * 0.1, x + dir * bw * 0.8), hy - bw * 0.2, bw * 0.7, Math.max(1, bw * 0.25), BLACK); }
  else { r.disc(x, hy, bw * 0.9, LMID); r.rect(x - bw * 0.9, hy, bw * 1.8, bw * 0.6, LMID); r.rect(x - bw * 0.3 + dir * bw * 0.3, hy - bw * 0.15, bw * 0.9, Math.max(1, bw * 0.3), BLACK); }
}

const jetpack = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, ARMOR_W, band), x: 0.45, y: 0.5, vx: 0, vy: 0, ty: 0.5, dir: 1, flame: 0, dive: 0, sx: 0, drone: { x: 0.2, y: 0.45, hp: 6, hit: 0, gone: 0 }, bolts: [], sparks: [], turn: 0, blink: 0,
      lanes: LANES.map((Ln, i) => ({ ...Ln, cars: Array.from({ length: 5 + i * 2 }, () => ({ p: rnd(), len: 0.5 + rnd() * 0.8, lit: 0 })), dash: 0 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), A = ARMOR[w.kind], g = 1.1 * N, D = w.drone;
    if (f.section === 'change') { w.kind = rollW(rnd, ARMOR_W, band); w.ty = 0.3 + rnd() * 0.35; }
    if (f.section === 'drop') { w.dive = 1.3; w.ty = 0.78; }
    for (const hh of hits) {
      if (isLow(hh) && w.dive <= 0) { w.vy -= (0.2 * N * hh.strength) / A.mass; w.flame = 1; }
      else if (hh.kind === 'snare') { // the exchange: the hunter's shot at the drone, or the drone's at the hunter
        if (D.gone <= 0) {
          const fromH = w.turn++ % 2 === 0, x0 = fromH ? w.x * N + w.dir * A.h * N * 0.4 : D.x * N, y0 = fromH ? w.y * N - A.h * N * 0.24 : D.y * N, x1 = fromH ? D.x * N : w.x * N, y1 = fromH ? D.y * N : w.y * N;
          const len = Math.hypot(x1 - x0, y1 - y0) || 1, sp = 1.6 * N;
          w.bolts.push({ x: x0, y: y0, vx: ((x1 - x0) / len) * sp, vy: ((y1 - y0) / len) * sp, life: len / sp, len: 0.05, c: fromH ? HOT : COOL, atDrone: fromH });
        }
      } else if (hh.kind === 'hat') { const Ln = w.lanes[Math.floor(rnd() * 4)]; pick(rnd, Ln.cars).lit = 0.2; }
    }
    // the flight: gravity always, the pack's thrust a hover controller round the target height, off during the dive
    w.dive -= dt; w.flame = Math.max(0, w.flame - dt * 4);
    const thrust = w.dive > 0 ? 0 : g + 6 * (w.y - w.ty) * N + 3 * w.vy;
    w.vy += (g - thrust) * dt;
    w.y += (w.vy * dt) / N;
    if (w.dive <= 0 && w.dive > -0.3 && w.flame < 0.5) w.flame = 1; // the flare catching at the bottom of the dive
    if (w.y > 0.9) { w.y = 0.9; w.vy = Math.min(0, w.vy); }
    if (w.y < 0.12) { w.y = 0.12; w.vy = Math.max(0, w.vy); }
    w.vx = 0.06 * N * Math.sin(f.rel.midClock * 0.5) + (w.dive > 0 ? 0.1 * N : 0);
    w.dir = w.vx >= 0 ? 1 : -1;
    const steady = w.dive > 0 ? 0 : clamp(thrust / g) * 0.25, flame = Math.max(steady, w.flame);
    // the city behind: towers in the far distance with lit windows, sliding slowest of all
    w.sx += (w.vx * dt) / N;
    const scroll = w.sx;
    for (let k = 0; k < 9; k++) { const bx = ((hash(k, 81) - scroll / 6) % 1 + 1) % 1 * N, bh = (0.3 + 0.4 * hash(k, 82)) * N, bw = (0.06 + 0.05 * hash(k, 83)) * N; r.rect(bx - bw / 2, N - bh, bw, bh, DARK + DIM); for (let j = 0; j < 6; j++) if (hash(k * 7 + j, 84 + (f.beat.count >> 3)) < 0.5) r.rect(bx - bw / 2 + 2 * u + (j % 2) * bw * 0.5, N - bh + 3 * u + Math.floor(j / 2) * 5 * u, 1.5 * u, 2 * u, LMID + DIM); }
    // the lanes, far to near: a guide line with its dashes, the vehicles with their lights; the near lane after the hunter
    const lane = (Ln) => {
      const ly = Ln.y * N, sc = 1 / Ln.d, rel = Ln.v * sc - (w.vx / N) * sc; // its own speed, less ours, both by the distance
      Ln.dash = (Ln.dash + rel * dt + 1) % 1;
      r.rect(0, ly + 0.012 * N * sc * 4, N, 1, MID + DIM);
      for (let k = -1; k < 12; k++) { const dx = ((k + Ln.dash) / 12) * N * 1.2 - 0.1 * N; r.rect(dx, ly + 0.012 * N * sc * 4, 0.03 * N * sc, 1, LMID + DIM); }
      for (const c of Ln.cars) {
        c.p = (c.p + rel * dt * 0.5 + 1) % 1; c.lit -= dt;
        const cx = c.p * 1.4 * N - 0.2 * N, cl = 0.12 * N * sc * c.len, ch = 0.035 * N * sc, dir = Ln.v > 0 ? 1 : -1, col = Ln.d > 2.5 ? DARK : Ln.d > 1.2 ? MID : LMID;
        r.rect(cx - cl / 2, ly - ch / 2, cl, ch, col);
        r.rect(cx - cl / 2 + cl * 0.2, ly - ch * 0.9, cl * 0.5, ch * 0.5, col);
        r.rect(cx + dir * cl / 2 - (dir > 0 ? 1.5 * u : 0), ly - ch * 0.3, 1.5 * u, Math.max(1, ch * 0.4), c.lit > 0 ? BRIGHT : LMID);
        r.rect(cx - dir * cl / 2 - (dir < 0 ? 1.5 * u : 0), ly - ch * 0.3, 1.5 * u, Math.max(1, ch * 0.4), HOT);
      }
      for (const k of [0, 1]) r.rect(k ? N - 3 * u : u, ly - 3 * u, 2 * u, 2 * u, (f.beat.count + k) % 2 ? HOT : COOL); // the lane signals, swapping on the beat
    };
    for (let i = 0; i < 3; i++) lane(w.lanes[i]);
    // the drone: keeps a distance behind, bobbing; its sparks; when it is down a new one comes from above
    if (D.gone > 0) { D.gone -= dt; if (D.gone <= 0) Object.assign(D, { x: w.x - w.dir * 0.3, y: -0.05, hp: 6 }); }
    else {
      D.x = follow(D.x, w.x - w.dir * 0.28, dt, 0.6);
      D.y = follow(D.y, w.y - 0.06 + Math.sin(t * 2.3) * 0.02, dt, 0.5);
      D.hit -= dt;
      const dx = D.x * N, dy = D.y * N, dr = 0.025 * N;
      r.disc(dx, dy, dr, D.hit > 0 ? BRIGHT : MID);
      r.rect(dx + w.dir * dr * 0.4, dy - dr * 0.25, dr * 0.5, dr * 0.5, D.hit > 0 ? HOT : COOL); // the lens, toward the hunter
      r.rect(dx - w.dir * dr * 1.3, dy - u, dr * 0.6, 2 * u, DARK);
      for (const k of [-1, 1]) r.rect(dx + k * dr * 0.8 - u, dy + dr * 0.8, 2 * u, 2 * u, f.beat.pulse > 0.5 ? COOL : COOL + DIM);
      targets.push({ x: dx - dr, y: dy - dr, w: 2 * dr, h: 2 * dr });
    }
    const hx = w.x * N, hy = w.y * N, hh = A.h * N;
    drawHunter(r, w.kind, hx, hy, hh, w.dir, u, flame, FIG, t);
    r.rect(hx - w.dir * hh * 0.3 - u, hy - hh * 0.28, 2 * u, Math.max(1, u), f.beat.pulse > 0.6 ? HOT : DARK); // the pack's pilot light
    targets.push({ x: hx - hh * 0.5, y: hy - hh * 0.55, w: hh, h: hh });
    // the bolts, each ending in sparks on what it was aimed at; the sparks fall
    w.bolts = w.bolts.filter((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      r.stroke(b.x, b.y, b.x - b.vx * b.len, b.y - b.vy * b.len, Math.max(1, u), b.c);
      if (b.life <= 0) {
        burst(w.sparks, rnd, b.x, b.y, 10, N * 0.4, BRIGHT, 0.5);
        if (b.atDrone && D.gone <= 0) { D.hit = 0.15; D.x -= w.dir * 0.02; if (--D.hp <= 0) { burst(w.sparks, rnd, D.x * N, D.y * N, 30, N * 0.5, HOT, 0.9); D.gone = 2.5; } }
        else w.vy -= 0.05 * N; // the hit knocks him up a little; the pack brings him back
        return false;
      }
      return true;
    });
    w.sparks = particles(W, w.sparks, BRIGHT);
    lane(w.lanes[3]); // the near lane, in front of everything
    if (w.dive > 0) s.shake = Math.max(s.shake, 0.2);
  },
};

// ---------------------------------------------------------------------------------------------- holotable
// A tactical hologram over a round table: a wireframe target turning in COOL under scan lines, officers'
// silhouettes round the table leaning in on the beat, the rim lights stepping round it. Blips arrive with the
// hits (a kick a capital ship, a hat a fighter) and come in along drawn arcs; a snare is interference across the
// projection; a drop zooms into the target with a rotating reticle. The target goes by arousal: a planet, a wheel
// station, a cratered moon, a convoy in formation; a section change re-rolls it.
const TARGET_W = { planet: [3, 2, 1], station: [1, 2, 2], moon: [2, 2, 1], convoy: [0, 1, 3] };

const holotable = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { target: rollW(rnd, TARGET_W, band), rot: 0, blips: [], jit: 0, zoom: 0, zoomT: 0, lean: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), cx = N / 2, ty = 0.74 * N, rx = 0.4 * N, ry = 0.11 * N, buf = r.buf;
    if (f.section === 'change') w.target = rollW(rnd, TARGET_W, band);
    if (f.section === 'drop') w.zoomT = 4;
    w.zoomT -= dt;
    w.zoom = follow(w.zoom, w.zoomT > 0 ? 1 : 0, dt, 0.4);
    w.rot += dt * (0.3 + 0.9 * f.rel.midDrive);
    for (const hh of hits) {
      if (isLow(hh) || hh.kind === 'hat') { const a0 = rnd() * TAU, side = rnd() < 0.5 ? -1 : 1; w.blips.push({ big: isLow(hh), q: 0, a0, side, sp: isLow(hh) ? 0.12 : 0.3 }); }
      else if (hh.kind === 'snare') w.jit = 0.1; // a tenth of a second of interference
    }
    const R = (0.16 + 0.14 * ease(w.zoom)) * N, hy = 0.42 * N + Math.sin(f.rel.bassClock * 0.4) * 1.5 * u, tau = 0.4, ct = Math.cos(tau), st = Math.sin(tau);
    // the room: a dark floor, the two at the far side of the table, the pedestal and the table with its rim lights
    r.rect(0, 0.6 * N, N, 0.4 * N, DARK + DIM);
    w.lean = follow(w.lean, f.beat.pulse, dt, 0.1);
    for (const k of [-1, 1]) { const J = walker(r, cx + k * 0.3 * N, 0.68 * N, 0.24 * N, DARK, 0, -k, { cap: true }); r.rect(J.sx - u, J.sy, 2 * u, 0.12 * N, COOL + DIM); } // the far officers, their fronts lit from the table
    r.rect(cx - 0.06 * N, ty, 0.12 * N, 0.26 * N, DARK);
    r.ring(cx, ty, rx * 0.5, rx, DARK, ry / rx);
    r.ring(cx, ty, rx, Math.max(1, 1.5 * u), MID, ry / rx);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; r.rect(cx + Math.cos(a) * rx * 0.9 - u, ty + Math.sin(a) * ry * 0.9 - u, 2 * u, 2 * u, k === f.beat.count % 16 ? BRIGHT : COOL + DIM); }
    for (let k = 0; k < 3; k++) { const v = [f.rel.bassDrive, f.rel.midDrive, f.rel.trebDrive][k]; for (let j = 0; j < 5; j++) r.rect(cx - 0.3 * N + k * 0.06 * N + j * 1.6 * u, ty + 0.02 * N, Math.max(1, u), Math.max(1, u * (1 + 2 * clamp(v * (j + 1) / 3))), COOL + DIM); } // readouts on the surface
    // the hologram: the target's wireframe, the front lines bright, the back dim; it hangs over the table
    const y0 = Math.max(0, Math.floor(hy - R * 1.3)), y1 = Math.min(N - 1, Math.ceil(hy + R * 1.3)), col = f.beat.on ? BRIGHT : COOL;
    const P3 = (X, Y, Z) => [cx + R * X, hy - R * (Y * ct - Z * st), Y * st + Z * ct];
    const T = w.target;
    if (T === 'convoy') { // wedges in a column, circling the table's middle
      for (let k = 0; k < 5; k++) { const a = w.rot * 0.6 + k * 0.35, X = Math.cos(a) * 0.8, Z = Math.sin(a) * 0.8, [x, y] = P3(X, 0.1 * Math.sin(k + t), Z), dx = -Math.sin(a) * 5 * u, dy = Math.cos(a) * 2 * u, c = Z > 0 ? col : COOL + DIM; r.line(x + dx, y + dy, x - dx * 0.6 + dy, y - dy * 0.6 - dx * 0.3, c); r.line(x + dx, y + dy, x - dx * 0.6 - dy, y - dy * 0.6 + dx * 0.3, c); r.line(x - dx * 0.6 + dy, y - dy * 0.6 - dx * 0.3, x - dx * 0.6 - dy, y - dy * 0.6 + dx * 0.3, c); }
    } else if (T === 'station') { // a wheel: the rim, the spokes turning, the hub
      r.ring(cx, hy, R * 0.95, Math.max(1, 1.5 * u), col, st);
      r.ring(cx, hy, R * 0.75, Math.max(1, u), COOL + DIM, st);
      for (let k = 0; k < 6; k++) { const a = w.rot + (k / 6) * TAU, [x, y] = P3(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95); r.line(cx, hy, x, y, Math.sin(a) > 0 ? col : COOL + DIM); }
      r.disc(cx, hy, R * 0.12, col);
      r.rect(cx - u, hy - R * 0.3, 2 * u, R * 0.6, COOL + DIM);
    } else { // a sphere: parallels as ellipses, meridians drawn point to point, craters on the moon
      const lats = T === 'moon' ? [-0.5, 0, 0.5] : [-0.9, -0.45, 0, 0.45, 0.9];
      for (const la of lats) r.ring(cx, hy - R * Math.sin(la) * ct, R * Math.cos(la), 1, COOL + DIM, st);
      for (let m = 0; m < 6; m++) {
        const lam = w.rot + (m / 6) * Math.PI;
        let px = 0, py = 0, pz = 0;
        for (let k = 0; k <= 14; k++) { const th = -Math.PI / 2 + (k / 14) * Math.PI, X = Math.cos(th) * Math.cos(lam), Z = Math.cos(th) * Math.sin(lam), [x, y, z] = P3(X, Math.sin(th), Z); if (k) r.line(px, py, x, y, (z + pz) > 0 ? col : COOL + DIM); px = x; py = y; pz = z; }
      }
      if (T === 'moon') for (let k = 0; k < 5; k++) { const a = w.rot + k * 1.3, el = -0.5 + k * 0.25, X = Math.cos(el) * Math.cos(a), Z = Math.cos(el) * Math.sin(a), [x, y, z] = P3(X, Math.sin(el), Z); if (z > 0.2) r.ring(x, y, R * 0.1 * z, 1, col, 0.6 + 0.4 * (1 - Math.abs(X))); }
      r.ring(cx, hy, R, 1, col, 1);
    }
    // the blips: in along arcs from the rim toward the target; a ship is a small wedge, a fighter a dot; the arc ahead is dotted
    const plane = (a, b) => [cx + a * rx * 0.85, hy + R * 0.25 + b * ry * 0.85];
    w.blips = w.blips.filter((B) => {
      B.q += dt * B.sp;
      const p0 = [Math.cos(B.a0), Math.sin(B.a0)], p1 = [Math.cos(B.a0) * 0.5 - Math.sin(B.a0) * B.side * 0.7, Math.sin(B.a0) * 0.5 + Math.cos(B.a0) * B.side * 0.7], p2 = [Math.cos(B.a0) * 0.22, Math.sin(B.a0) * 0.22];
      const at = (q) => { const i = 1 - q; return [i * i * p0[0] + 2 * i * q * p1[0] + q * q * p2[0], i * i * p0[1] + 2 * i * q * p1[1] + q * q * p2[1]]; };
      for (let q = B.q + 0.08; q < 1; q += 0.08) { const [a, b] = at(q), [x, y] = plane(a, b); r.set(x, y, COOL + DIM); }
      const [a, b] = at(Math.min(1, B.q)), [x, y] = plane(a, b), [a2, b2] = at(Math.min(1, B.q + 0.03)), [x2, y2] = plane(a2, b2);
      if (B.big) { const dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1, ux = (dx / l) * 4 * u, uy = (dy / l) * 4 * u; r.line(x + ux, y + uy, x - ux - uy * 0.6, y - uy + ux * 0.6, col); r.line(x + ux, y + uy, x - ux + uy * 0.6, y - uy - ux * 0.6, col); r.line(x - ux - uy * 0.6, y - uy + ux * 0.6, x - ux + uy * 0.6, y - uy - ux * 0.6, col); }
      else r.rect(x - u, y - u, 2 * u, 2 * u, col);
      if (B.q >= 1) r.ring(x, y, 3 * u, 1, BRIGHT, 0.5);
      return B.q < 1.05;
    });
    // the reticle on a zoom: two arcs turning round the target with their ticks
    if (w.zoom > 0.05) {
      const ra = R * 1.15, a0 = t * 1.5;
      for (const k of [0, Math.PI]) { let px = cx + Math.cos(a0 + k) * ra, py = hy + Math.sin(a0 + k) * ra; for (let i = 1; i <= 8; i++) { const a = a0 + k + (i / 8) * 1.3, x = cx + Math.cos(a) * ra, y = hy + Math.sin(a) * ra; r.line(px, py, x, y, HOT); px = x; py = y; } }
      for (let i = 0; i < 4; i++) { const a = -a0 * 0.7 + (i / 4) * TAU; r.line(cx + Math.cos(a) * ra * 0.9, hy + Math.sin(a) * ra * 0.9, cx + Math.cos(a) * ra * 1.05, hy + Math.sin(a) * ra * 1.05, HOT); }
    }
    // the projection's scan lines over its box, and the interference a snare puts across it
    for (let y = y0 + (y0 & 1); y <= y1; y += 2) for (let i = y * N, e = i + N; i < e; i++) if (buf[i] === COOL || buf[i] === BRIGHT) buf[i] += DIM;
    if (w.jit > 0) { w.jit -= dt; for (let y = y0; y <= y1; y++) if (rnd() < 0.3) shiftRow(buf, N, y, Math.round((rnd() - 0.5) * 8 * u)); const yb = y0 + Math.floor(rnd() * (y1 - y0)); r.rect(cx - R, yb, 2 * R, Math.max(1, u), LMID); }
    targets.push({ x: cx - R, y: hy - R, w: 2 * R, h: 2 * R });
    // the two nearest us, in the lower corners, backs to us, leaning in on the beat
    for (const k of [-1, 1]) { const ox = cx + k * 0.38 * N, oy = N + 0.02 * N - w.lean * 2 * u; r.rect(ox - 0.1 * N, oy - 0.22 * N, 0.2 * N, 0.22 * N, BLACK); r.disc(ox, oy - 0.26 * N, 0.06 * N, BLACK); r.rect(ox - 0.1 * N + (k > 0 ? 0 : 0.19 * N), oy - 0.22 * N, Math.max(1, u), 0.22 * N, COOL + DIM); }
  },
};

// ---------------------------------------------------------------------------------------------- blastdoors
// A station corridor from behind two rebels: white-armoured troopers down the hall advancing a step a beat and
// firing volleys on the snares, the rebels answering on the kicks; the bolts travel the corridor's length and
// spark where they land on a wall, a door or a chest plate (the trooper flinches back, nothing worse). A section
// change slides a blast door shut across the corridor between them, and the bolts spark on that till it opens. A
// drop is the compactor: the walls grind inward with grit falling, then let go. The corridor goes by arousal: the
// white panels, a dark one of pipes, a wide hangar bay.
const HALL_W = { white: [3, 2, 1], tech: [2, 2, 2], hangar: [1, 2, 3] };
const HALLS = { white: { hw: 1, wall: LMID, far: MID }, tech: { hw: 1, wall: DARK, far: DARK + DIM }, hangar: { hw: 1.8, wall: MID, far: DARK } };
const newTrooper = (rnd, z) => ({ x: (rnd() - 0.5) * 1.2, z, tz: z, flash: 0 });

const blastdoors = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { hall: rollW(rnd, HALL_W, band), troopers: [], bolts: [], sparks: [], door: null, press: 0, grit: [], flick: 0, lamp: HOT });
    for (let i = 0; i < 2 + band; i++) w.troopers.push(newTrooper(rnd, 5 + i * 1.5 + rnd()));
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), Hh = HALLS[w.hall], cx = N / 2, vy = 0.46 * N, K = 0.5 * N, far = 12;
    if (f.section === 'change') { if (rnd() < 0.3) w.hall = rollW(rnd, HALL_W, band); w.door = { z: 3 + rnd() * 2.5, q: 0, open: false, t: 0 }; }
    if (f.section === 'drop') w.press = 3.2;
    w.press -= dt; w.flick -= dt;
    const squeeze = w.press > 0 ? (w.press > 1.2 ? ease((3.2 - w.press) / 2) : ease(w.press / 1.2)) : 0, hw = Hh.hw * (1 - 0.55 * squeeze), hh = 0.8;
    const P = (x, y, z) => [cx + (x / z) * K, vy + ((0.5 - y) / z) * K]; // the hall: x across, y up from the floor, z away; the eye at half height
    for (const hhit of hits) {
      if (isLow(hhit)) { // a rebel fires at the nearest trooper
        const side = rnd() < 0.5 ? -1 : 1, T = w.troopers.reduce((m, q) => (!m || q.z < m.z ? q : m), null);
        if (T) { const x0 = side * 0.7, y0 = 0.55, z0 = 0.8, dx = T.x - x0, dy = 0.5 - y0, dz = T.z - z0, l = Math.hypot(dx, dy, dz), sp = 16; w.bolts.push({ x: x0, y: y0, z: z0, vx: (dx / l) * sp, vy: (dy / l) * sp, vz: (dz / l) * sp, c: HOT, at: T, hit: rnd() < 0.5 }); }
      } else if (hhit.kind === 'snare') for (let k = 0; k < 2 + Math.round(hhit.strength); k++) { // a volley back from the troopers
        const T = pick(rnd, w.troopers); if (!T) break;
        const x1 = (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5), y1 = 0.2 + rnd() * 0.6, dx = x1 - T.x, dy = y1 - 0.5, dz = 0.3 - T.z, l = Math.hypot(dx, dy, dz), sp = 16;
        w.bolts.push({ x: T.x, y: 0.5, z: T.z, vx: (dx / l) * sp, vy: (dy / l) * sp, vz: (dz / l) * sp, c: COOL, at: null, hit: false });
        T.flash = 0.06;
      } else if (hhit.kind === 'hat') w.flick = 0.08;
      else if (isTonal(hhit)) w.lamp = hhit.pc % 2 ? HOT : COOL;
    }
    // the corridor: four faces to the far end, seams at their depths closer together with distance, the strips of light
    const [lx0, ty0] = P(-hw, hh, 0.5), [rx0, by0] = P(hw, 0, 0.5), [lx1, ty1] = P(-hw, hh, far), [rx1, by1] = P(hw, 0, far);
    r.poly([[lx0, ty0], [rx0, ty0], [rx1, ty1], [lx1, ty1]], DARK + DIM); // the ceiling
    r.poly([[lx0, by0], [rx0, by0], [rx1, by1], [lx1, by1]], w.hall === 'white' ? MID : DARK); // the floor
    r.poly([[lx0, ty0], [lx1, ty1], [lx1, by1], [lx0, by0]], Hh.wall);
    r.poly([[rx0, ty0], [rx1, ty1], [rx1, by1], [rx0, by0]], Hh.wall);
    r.rect(lx1, ty1, rx1 - lx1, by1 - ty1, Hh.far);
    for (const z of [1, 1.5, 2.2, 3.2, 4.6, 6.5, 9]) { const [a, b] = P(-hw, hh, z), [c, d] = P(hw, 0, z); r.frame(Math.round(a), Math.round(b), Math.round(c - a), Math.round(d - b), w.hall === 'white' ? MID : DARK + DIM); }
    for (const side of [-1, 1]) { const [a, b] = P(side * hw * 0.98, hh * 0.98, 0.5), [c, d] = P(side * hw * 0.98, hh * 0.98, far); r.line(a, b, c, d, w.flick > 0 || f.beat.pulse > 0.7 ? COOL : COOL + DIM); }
    if (w.hall === 'tech') for (const yy of [0.3, 0.6]) for (const side of [-1, 1]) { const [a, b] = P(side * hw, yy, 0.5), [c, d] = P(side * hw, yy, far); r.stroke(a, b, c, d, Math.max(1, 1.5 * u), MID + DIM); }
    if (w.hall === 'hangar') { const [a, b] = P(-0.9, 0.5, far - 0.5), [c] = P(0.9, 0.5, far - 0.5); r.poly([[a, b], [c, b], [(a + c) / 2, b - (c - a) * 0.5]], DARK + DIM); for (const side of [-1, 1]) for (const z of [2, 4, 7]) { const [e, g] = P(side * hw * 0.8, 0.35, z), [h2, i2] = P(side * hw * 0.98, 0, z + 0.5); r.rect(Math.min(e, h2), g, Math.abs(h2 - e), i2 - g, DARK + DIM); } }
    const stripeZ = 0.6 + ((f.beat.count % 8) + f.beat.phase) * 1.4;
    { const [a, b] = P(-0.15, 0, stripeZ), [c] = P(0.15, 0, stripeZ); r.rect(a, b, c - a, Math.max(1, u), LMID); } // the floor's running light
    // the troopers advance a step a beat and hold at the near end; a door shut across hides those behind it; far to near
    if (f.beat.on) for (const T of w.troopers) T.tz = Math.max(2.4, T.tz - 0.25);
    for (const T of w.troopers) { T.z = follow(T.z, T.tz, dt, 0.12); T.flash -= dt; }
    w.troopers.sort((a, b) => b.z - a.z);
    const D = w.door;
    if (D) { D.t += dt; D.q = clamp(D.q + dt * (D.open ? -1.2 : 1.2)); if (D.t > 7 && !D.open) D.open = true; if (D.open && D.q <= 0) w.door = null; }
    const drawDoor = () => {
      if (!D || D.q <= 0) return;
      for (const side of [-1, 1]) { const [a, b] = P(side * hw, hh, D.z), [c, d] = P(side * hw * (1 - D.q), 0, D.z); r.rect(Math.min(a, c), b, Math.abs(c - a), d - b, MID); r.rect(c - (side > 0 ? 0 : 1.5 * u), b, Math.max(1, 1.5 * u), d - b, LMID); }
      const [lx, ly] = P(0, hh * 1.02, D.z);
      r.rect(lx - 1.5 * u, ly - 2 * u, 3 * u, 2 * u, Math.floor(t * 4) % 2 ? w.lamp : w.lamp + DIM);
    };
    let doorDrawn = false;
    for (const T of w.troopers) {
      if (D && D.q > 0 && T.z < D.z && !doorDrawn) { drawDoor(); doorDrawn = true; }
      if (D && D.q > 0.9 && T.z > D.z) continue; // behind the shut door
      const [fx, fy] = P(T.x, 0, T.z), th = (1.1 * K) / T.z, col = T.flash > 0 ? HOT : T.z > 6 ? BRIGHT + DIM : BRIGHT; // the far ones a touch dimmer through the haze
      r.ring(fx, fy, th * 0.1, th * 0.2, DARK + DIM, 0.3);
      const J = walker(r, fx, fy, th, col, (T.tz > 2.45 ? 0.4 : 0) * Math.sin((f.beat.count + f.beat.phase) * Math.PI + T.x * TAU), T.x < 0 ? 1 : -1, {}); // a step a beat: the legs alternate once per beat, and stand once they hold
      r.rect(fx - th * 0.09, J.head - th * 0.02, th * 0.18, Math.max(1, th * 0.05), BLACK); // the visor
      r.rect(fx - th * 0.26, J.sy - th * 0.02, th * 0.52, Math.max(1, th * 0.06), col);
      r.rect(fx + (T.x < 0 ? th * 0.1 : -th * 0.28), J.sy + th * 0.08, th * 0.18, Math.max(1, th * 0.05), DARK); // the rifle
      if (T === w.troopers[w.troopers.length - 1]) targets.push({ x: fx - th * 0.3, y: fy - th, w: th * 0.6, h: th });
    }
    if (!doorDrawn) drawDoor();
    // the bolts in the hall's own space: on to a trooper, a wall, the door or past us; sparks where they land
    w.bolts = w.bolts.filter((b) => {
      const pz = b.z;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.z < 0.3 || b.z > far) return false;
      const [x0, y0] = P(b.x, b.y, b.z), [x1, y1] = P(b.x - b.vx * 0.04, b.y - b.vy * 0.04, b.z - b.vz * 0.04), zz = Math.max(0.5, b.z);
      r.stroke(x0, y0, x1, y1, Math.max(1, (1.5 * u) / (zz * 0.5)), b.c);
      const spark = (n) => burst(w.sparks, rnd, x0, y0, n, (N * 0.3) / zz, BRIGHT, 0.4);
      if (D && D.q > 0 && ((pz < D.z) !== (b.z < D.z)) && Math.abs(b.x) > hw * (1 - D.q)) { spark(8); return false; } // into the door
      if (Math.abs(b.x) > hw || b.y > hh || b.y < 0) { spark(8); return false; } // into a wall, the ceiling, the floor
      if (b.at && b.z >= b.at.z - 0.2) { if (b.hit) { b.at.flash = 0.2; b.at.tz = Math.min(far - 1, b.at.tz + 0.6); spark(10); return false; } b.at = null; } // past the trooper's chest, or into it
      return true;
    });
    w.sparks = particles(W, w.sparks, BRIGHT);
    // the rebels nearest us, backs to the camera, leaning out from the corners to fire
    for (const side of [-1, 1]) { const [bx, by] = P(side * 0.75, 0, 1), h2 = 1.05 * K, lean = w.bolts.some((b) => b.c === HOT && b.z < 2) ? -side * 2 * u : 0; walker(r, bx + lean, by, h2, DARK, 0, -side, { cap: side > 0 }); r.rect(Math.min(bx + lean - side * h2 * 0.3, bx + lean - side * h2 * 0.5), by - h2 * 0.6, h2 * 0.2, Math.max(1, h2 * 0.05), MID); }
    // the compactor: grit shaken off the ceiling while the walls close, the whole picture shaking
    if (w.press > 0) {
      s.shake = Math.max(s.shake, 0.35 + 0.3 * squeeze);
      for (let k = 0; k < 3; k++) { const z = 0.6 + rnd() * 3; const [gx, gy] = P((rnd() - 0.5) * 2 * hw, hh, z); w.grit.push({ x: gx, y: gy, vx: 0, vy: 0, life: 1.2, c: rnd() < 0.5 ? MID : DARK, z }); }
    }
    w.grit = w.grit.filter((p) => { p.vy += (N * 1.6 * dt) / p.z; p.y += p.vy * dt; p.life -= dt; const fl = P(0, 0, p.z)[1]; if (p.y >= fl) return false; r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), p.c); return p.life > 0; });
    if (D && D.q > 0) targets.push({ x: P(-hw, hh, D.z)[0], y: P(0, hh, D.z)[1], w: P(hw, 0, D.z)[0] - P(-hw, hh, D.z)[0], h: P(0, 0, D.z)[1] - P(0, hh, D.z)[1] });
  },
};

// ---------------------------------------------------------------------------------------------- podrace
// A canyon race from the camera craft out in front: the walls recede on either side in perspective while the
// pods come up on us at speed, two engines on cables pulling a pod behind them, growing as they close and passing
// us at the edges. The engines' intakes glow with the bass, the binder arcs between them crackle on the hats, a
// kick boosts the leader, a snare banks the pack; a section change plants a flag gate behind us that the pods
// come through. A drop is the crash: the leader's engine tears loose, tumbles under gravity, bounces in the dust
// and the pod falls back. The builds go by arousal and are re-rolled at a section change.
const POD_W = { long: [3, 2, 1], stub: [2, 2, 2], ring: [1, 2, 2], split: [1, 2, 3] };
const PODS = { long: { sep: 0.9, er: 0.32, eh: 1.6, pod: 0.4 }, stub: { sep: 0.8, er: 0.45, eh: 1, pod: 0.55 }, ring: { sep: 1, er: 0.38, eh: 1.3, pod: 0.4, ring: true }, split: { sep: 1.5, er: 0.28, eh: 1.5, pod: 0.35 } };
const newPod = (rnd, kind, z) => ({ kind, z, x: (rnd() - 0.5) * 2.2, tx: 0, bank: 0, flare: 0, v: 0.85 + rnd() * 0.3, lost: null });

const podrace = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), kind = rollW(rnd, POD_W, band);
    Object.assign(w, { kind, pods: [], prog: 0, bank: 0, dust: [], smoke: [], gate: null, crash: null, arcs: 0 });
    for (let i = 0; i < 2 + band; i++) w.pods.push(newPod(rnd, kind, 4 + i * 5 + rnd() * 3));
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), cx = N / 2, hz = 0.48 * N, K = 0.5 * N, segLen = 1.4, far = 24;
    const speed = 5 + 5 * f.level + 4 * f.rel.bassDrive, camV = 7;
    if (f.section === 'change') { w.kind = rollW(rnd, POD_W, band); w.gate = { z: 1.2 }; }
    if (f.section === 'drop' && !w.crash) { // the crash: the nearest pod still well out loses its right engine
      const Pd = w.pods.filter((p) => p.z > 2.5 && !p.lost).sort((a, b) => a.z - b.z)[0];
      if (Pd) { const B = PODS[Pd.kind], [ex, ey] = podP(cx, hz, K, Pd.x + B.sep, Pd.z, 0.6, w.bank); Pd.lost = { x: ex, y: ey, vx: 0.25 * N, vy: -0.2 * N, a: 0, om: 6, z: Pd.z, bounced: false, t: 0 }; w.crash = Pd; s.shake = Math.max(s.shake, 0.7); }
    }
    for (const hh of hits) {
      if (isLow(hh)) { const Pd = w.pods.filter((p) => !p.lost).sort((a, b) => a.z - b.z)[0]; if (Pd) Pd.flare = 1; } // the boost: a burst of speed while the flare lasts, no jump
      else if (hh.kind === 'snare') { const k = rnd() < 0.5 ? -1 : 1; w.bank = k * 0.5; for (const p of w.pods) { p.bank = k * 0.7; p.tx = (rnd() - 0.5) * 2.2; } }
      else if (hh.kind === 'hat') w.arcs = 0.12;
    }
    w.bank *= Math.exp(-dt * 2.5); w.arcs -= dt;
    w.prog += dt * camV;
    const P = (x, z, y) => podP(cx, hz, K, x, z, y, w.bank);
    // the sky, the far haze, the ground with the track marks, then the walls far to near, their tops jagged
    r.rect(0, 0, N, hz, LMID + DIM);
    r.rect(0, hz - 0.04 * N, N, 0.04 * N, LMID);
    r.rect(0, hz, N, N - hz, MID + DIM);
    for (const k of [-0.6, 0.6]) { const [a, b] = P(k, 0.5, 0), [c, d] = P(k, far, 0); r.line(a, b, c, d, DARK + DIM); }
    const frac = (w.prog / segLen) % 1, base = Math.floor(w.prog / segLen), n = Math.ceil(far / segLen);
    for (let i = n; i >= 0; i--) {
      const z0 = Math.max(0.4, (i + frac) * segLen), z1 = (i + 1 + frac) * segLen, id = i - base;
      if (z0 >= far) continue;
      const shade = z0 < 3 ? DARK : z0 < 8 ? DARK + DIM : MID + DIM;
      for (const side of [-1, 1]) {
        const wx0 = side * (2.4 + 0.5 * hash(id, side + 7)), wx1 = side * (2.4 + 0.5 * hash(id + 1, side + 7)), h0 = 1.6 + 1.2 * hash(id, side + 9), h1 = 1.6 + 1.2 * hash(id + 1, side + 9);
        const [a, b] = P(wx0, z0, 0), [c, d] = P(wx1, z1, 0), [e, g] = P(wx1, z1, h1), [h2, i2] = P(wx0, z0, h0);
        r.poly([[a, b], [c, d], [e, g], [h2, i2]], shade);
        r.line(h2, i2, e, g, z0 < 8 ? LMID + DIM : MID);
        if (z0 < 6 && hash(id, side) < 0.5) { const [sx, sy] = P(wx0 * 0.98, (z0 + z1) / 2, h0 * 0.4); r.rect(sx - (4 * u) / z0, sy, Math.max(1, (6 * u) / z0), Math.max(1, (3 * u) / z0), DARK + DIM); } // a shelf of rock
      }
    }
    // the gate from the last section: a pole on each wall with its flag, receding with the walls
    if (w.gate) {
      const G = w.gate;
      G.z += dt * camV;
      if (G.z > far) w.gate = null;
      else for (const side of [-1, 1]) { const [a, b] = P(side * 2.3, G.z, 0), [c, d] = P(side * 2.3, G.z, 3.2), fw = (0.6 * K) / G.z; r.rect(a - u, d, 2 * u, b - d, LMID); r.poly([[c, d], [c - side * fw, d + fw * 0.3], [c, d + fw * 0.6]], side > 0 ? HOT : COOL); }
    }
    // the pods, far to near: the engines in front, the cables back to the pod behind them, all banking together
    w.pods.sort((a, b) => b.z - a.z);
    let nearest = null;
    for (const Pd of w.pods) {
      const B = PODS[Pd.kind];
      if (Pd.lost) { Pd.z += dt * camV * 0.6; Pd.lost.t += dt; if (Pd.lost.t > 3.5 || Pd.z > far) { Object.assign(Pd, newPod(rnd, w.kind, far - 2)); if (w.crash === Pd) w.crash = null; continue; } }
      else Pd.z -= dt * (speed * Pd.v * (1 + 0.3 * Pd.flare) - camV);
      if (Pd.z < 0.5) Object.assign(Pd, newPod(rnd, w.kind, far - 2 + rnd() * 2));
      Pd.x = follow(Pd.x, Pd.tx, dt, 1.5);
      Pd.bank *= Math.exp(-dt * 2); Pd.flare = Math.max(0, Pd.flare - dt * 3);
      const z = Pd.z, c = Math.cos(Pd.bank), sn = Math.sin(Pd.bank), er = (B.er * K) / z, glow = clamp(f.rel.bassDrive + Pd.flare + 0.3 * f.beat.pulse);
      const [px, py] = P(Pd.x, z + 1.2, 0.5), pr = (B.pod * K) / (z + 1.2); // the pod, farther back and so smaller
      const eng = [-1, 1].map((k) => { if (k > 0 && Pd.lost) return null; const [ex, ey] = P(Pd.x, z, 0.6); return [ex + k * B.sep * c * (K / z), ey + k * B.sep * sn * (K / z)]; });
      for (const k of [-1, 1]) { const [gx, gy] = P(Pd.x + k * B.sep, z, 0); if (!(k > 0 && Pd.lost)) r.ring(gx, gy, er * 0.6, er * 1.2, DARK + DIM, 0.2); } // the shadows on the ground under the engines
      r.ring(px, py, pr * 0.5, pr, LMID, 0.7);
      r.rect(px - pr * 0.25, py - pr * 0.75, pr * 0.5, pr * 0.45, FIG); // the pilot
      for (const e of eng) if (e) { r.line(e[0], e[1] + er * 0.3, px - pr * 0.3, py, DARK); r.line(e[0], e[1] + er * 0.3, px + pr * 0.3, py, DARK); } // the cables
      for (const e of eng) if (e) {
        const [ex, ey] = e;
        r.ring(ex, ey, er * 0.5, er, MID, B.eh / 1.6 + 0.3);
        r.ring(ex, ey, er * 0.3, er * 0.6, DARK, B.eh / 1.6 + 0.3); // the intake
        r.ring(ex, ey, er * 0.55, Math.max(1, er * 0.18), glow > 0.5 ? HOT : glow > 0.25 ? HOT + DIM : MID, B.eh / 1.6 + 0.3);
        if (B.ring) r.ring(ex, ey, er * 1.15, Math.max(1, u), LMID, B.eh / 1.6 + 0.3);
        if (z < 4 && rnd() < 0.5) w.dust.push({ x: ex + (rnd() - 0.5) * er, y: P(0, z, 0)[1], vx: (rnd() - 0.5) * 0.2 * N / z, vy: -rnd() * 0.1 * N / z, life: 0.5 });
      }
      if (eng[0] && eng[1] && w.arcs > 0) arc(r, rnd, eng[0][0] + er * 0.5, eng[0][1], eng[1][0] - er * 0.5, eng[1][1], hash(Math.floor(t * 30), 1) < 0.5 ? COOL : BRIGHT, 0, u); // the binder arc
      if (Pd.lost) { // the loose engine: a free body on the screen, tumbling, down under gravity, one bounce in the dust
        const Lo = Pd.lost, gy = P(0, Lo.z, 0)[1];
        Lo.vy += (N * 1.6 * dt) / Lo.z; Lo.x += Lo.vx * dt; Lo.y += Lo.vy * dt; Lo.a += Lo.om * dt; Lo.z += dt * camV * 0.3;
        if (Lo.y > gy) { Lo.y = gy; if (!Lo.bounced) { Lo.vy *= -0.4; Lo.om *= 0.5; Lo.bounced = true; burst(w.dust, rnd, Lo.x, gy, 20, (N * 0.4) / Lo.z, LMID, 0.7); s.shake = Math.max(s.shake, 0.5); } else { Lo.vy = 0; Lo.vx *= 0.9; Lo.om *= 0.9; } }
        const ler = (B.er * K) / Lo.z;
        r.poly(rotRect(Lo.x, Lo.y, ler * 1.6, ler * 0.8, Lo.a), MID);
        if (rnd() < 0.6) w.smoke.push({ x: Lo.x, y: Lo.y, vx: (rnd() - 0.5) * 3 * u, vy: -0.12 * N / Lo.z, life: 1.2 });
      }
      if (!nearest || z < nearest.z) nearest = { x: px - B.sep * (K / z) - er, y: py - pr, w: 2 * (B.sep * (K / z) + er), h: pr * 2 + er, z };
    }
    if (nearest) targets.push(nearest);
    w.dust = particles(W, w.dust, LMID + DIM).filter((p) => p.y <= hz + 0.52 * N);
    w.smoke = w.smoke.filter((p) => { p.vy = follow(p.vy, -0.01 * N, dt, 0.7); p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; r.disc(p.x, p.y, (1 + (1.2 - p.life) * 2) * u, DARK + DIM); return p.life > 0; }).slice(-80);
    if (Math.abs(w.bank) > 0.05) s.shake = Math.max(s.shake, 0.1);
  },
};
// a point of the canyon: x across, z away, y up from the ground; the horizon tilts with the bank
function podP(cx, hz, K, x, z, y, bank) {
  const px = (x / z) * K, py = -((y - 1) / z) * K;
  return [cx + px * Math.cos(bank) - py * Math.sin(bank) * 0.3, hz + py + px * Math.sin(bank) * 0.3];
}

const WORLDS = { hyperspace, trench, cantina, energyduel, walkers, fleet, throne, twinsuns, jetpack, holotable, blastdoors, podrace };

registerFamily('space', WORLD_DEFS, WORLDS);
export const SPACE_STYLE = makeMixStyle('SPACE OPERA', ['space']);
