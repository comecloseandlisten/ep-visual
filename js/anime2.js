// Anime, mixed, the second reel: more tropes of the drawn screen as worlds, original silhouettes only. Soldiers on
// grapple wires under a colossal wall, a drill mech stacking itself to pierce the cave, a dark forest of luminous
// flows, a school band that plays the track, a recital, an alchemy circle and the gate behind it, a casino wheel,
// a chessboard of giants, a free dive, mages above a cloud sea, a mountain pass at night, a train over a still
// sea, a mage charging one explosion, a caped hero against the monster of the day. Every world draws with the
// eight palette roles of the mixer, so any palette, treatment and layout fits; no character, title, logo or studio
// from anywhere, no text. Registered into the 'anime' family beside anime.js (the shared bits are copied from it,
// so neither file depends on the other).
import { Raster, clamp, lerp, makeNoise } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow, ease,
  beatLocked, hash, pickW, walker, particles, burst, registerFamily } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  wallgiants: { name: 'wall giants', va: [[M, H], [H, H]], pals: ['noir', 'cinema', 'sepia', 'silver', 'midnight', 'parchment'], fx: ['film', 'none', 'manga'] },
  spiraldrill: { name: 'spiral drill', va: [[H, H], [L, H], [H, M]], pals: ['neon', 'gold', 'cinema', 'candy', 'crystal'], fx: ['none', 'manga', 'crt'] },
  mushiforest: { name: 'luminous forest', va: [[M, L], [L, L], [H, L], [L, M]], pals: ['midnight', 'ice', 'crystal', 'sepia', 'parchment'], fx: ['none', 'film', 'vhs'] },
  schoolband: { name: 'school band', va: [[H, M], [M, M]], pals: ['candy', 'sepia', 'ice', 'gold', 'royal'], fx: ['none', 'film', 'vhs', 'crt'] },
  recital: { name: 'recital', va: [[M, L], [L, L], [H, L], [L, M]], pals: ['noir', 'silver', 'gold', 'royal', 'midnight', 'sepia'], fx: ['film', 'none', 'vhs'] },
  transmutation: { name: 'transmutation circle', va: [[M, H], [H, H]], pals: ['parchment', 'gold', 'sepia', 'crystal', 'royal', 'noir'], fx: ['none', 'film', 'manga'] },
  casino: { name: 'casino', va: [[H, M], [M, M]], pals: ['gold', 'royal', 'noir', 'neon', 'cinema'], fx: ['none', 'film', 'crt'] },
  giantchess: { name: 'giant chess', va: [[H, M], [M, M]], pals: ['ice', 'royal', 'parchment', 'silver', 'crystal', 'midnight'], fx: ['none', 'film'] },
  freedive: { name: 'free dive', va: [[M, L], [L, L], [H, L], [L, M]], pals: ['ice', 'crystal', 'midnight', 'silver'], fx: ['none', 'film', 'vhs'] },
  skymages: { name: 'sky mages', va: [[M, H], [H, H]], pals: ['cinema', 'sepia', 'gold', 'midnight', 'silver', 'royal'], fx: ['film', 'none', 'manga'] },
  tougedrift: { name: 'mountain pass', va: [[M, H], [H, H]], pals: ['midnight', 'neon', 'noir', 'silver', 'cinema'], fx: ['none', 'vhs', 'crt', 'film'] },
  seatrain: { name: 'train over the sea', va: [[M, L], [L, L], [H, L], [L, M]], pals: ['sepia', 'midnight', 'ice', 'candy', 'gold', 'silver'], fx: ['none', 'film', 'vhs'] },
  explosionmage: { name: 'explosion mage', va: [[H, H], [L, H], [H, M]], pals: ['cinema', 'gold', 'parchment', 'neon', 'noir'], fx: ['manga', 'none', 'film', 'crt'] },
  onepunch: { name: 'one punch', va: [[H, H], [L, H], [H, M]], pals: ['cinema', 'candy', 'neon', 'noir', 'gold', 'silver'], fx: ['manga', 'none', 'crt'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the variant tables below weigh their kinds by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bpsOf = (f) => (f.bpm ? f.bpm / 60 : 2);
// the colour a pitch class lights things in (keys, pieces, spells)
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
// a rotation by `a` about (cx, cy): local (px, py) to the screen
const rotAt = (cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return (px, py) => [cx + px * c - py * s, cy + px * s + py * c]; };
// a ground plane seen from eye height 1 with a focal length of F cells, the horizon at hz: (X across, Z away) to the screen
const groundProj = (cx, hz, F) => (X, Z) => [cx + (X * F) / Z, hz + F / Z];
// puffs of smoke, steam, dust or gas `{x, y, vx, vy, r, life}`: they slow in the air toward the drift (dx, dy) in
// cells per second, swell by `grow` units a second and thin out; the oldest go when there are more than `cap`
function puffs(W, list, dx, dy, grow, col, col2, cap = 120) {
  const { r, dt, u } = W;
  for (const p of list) {
    p.vx = follow(p.vx, dx, dt, 0.7); p.vy = follow(p.vy, dy, dt, 0.7);
    p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * grow * u; p.life -= dt;
    r.disc(p.x, p.y, p.r * Math.min(1, p.life * 2), p.life > 0.6 ? col : col2);
  }
  const out = list.filter((p) => p.life > 0);
  return out.length > cap ? out.slice(-cap) : out;
}
// a dimmed role: the same colour 35 % darker; black and white stay
const dim = (c) => (c < DIM ? c + DIM : c);

// ---------------------------------------------------------------------------------------------- wall giants
// Soldiers on grapple wires swinging between the rooftops under a colossal wall, giants walking slowly beyond it.
// Each wire is a true pendulum about its anchor (the angle accelerates by -g/L sin θ), let go at the bottom of the
// swing into a parabola; the next beat fires a new anchor ahead and the wire takes the flight up as a new swing.
// Gas bursts off the gear on the kicks, blade sparks on the snares, the giants' eyes light on the notes. A drop
// topples a giant: it falls as a stick about its feet, faster the further it leans, and the dust goes up where it
// lands behind the wall. A section change changes the hour.
const WALL_HOUR_W = { dawn: [3, 2, 1], noon: [2, 2, 2], dusk: [1, 2, 3] };
const WALL_SKY = { dawn: [MID + DIM, MID, LMID, HOT, LMID], noon: [COOL, LMID, LMID, BRIGHT, BRIGHT], dusk: [DARK, MID + DIM, HOT, LMID, LMID] };

const wallgiants = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a), roofs = [];
    for (let x = -0.1; x < 1.2;) { const bw = 0.08 + rnd() * 0.1; roofs.push({ x0: x, w: bw, top: 0.72 + rnd() * 0.14, win: Math.floor(rnd() * 100) }); x += bw + 0.01 + rnd() * 0.03; }
    Object.assign(w, { hour: rollW(rnd, WALL_HOUR_W, band), roofs, gas: [], sparks: [], dust: [], eyes: 0,
      squad: Array.from({ length: 2 + band }, (_, i) => ({ x: (0.1 + i * 0.22) * N, y: 0.5 * N, vx: 0.3 * N, vy: 0, mode: 'fly', dir: 1, ax: 0, ay: 0, L: 1, th: 0, om: 0, crouch: 0, flash: 0, roofY: 0 })),
      giants: Array.from({ length: 2 + (band > 0 ? 1 : 0) }, (_, i) => ({ x: 0.2 + i * 0.3 + rnd() * 0.1, dir: rnd() < 0.5 ? -1 : 1, h: 0.42 + rnd() * 0.16, ph: rnd() * TAU, fall: 0, fv: 0, down: 0 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), grav = G(N), wallTop = 0.46 * N, wallBot = 0.62 * N, night = w.hour === 'dusk';
    const roofAt = (x) => { for (const b of w.roofs) if (x >= b.x0 * N && x < (b.x0 + b.w) * N) return b.top * N; return N + 1; };
    const fire = (sd) => { // a new hook into the wall's lip, a short way ahead; the wire takes the flight as a swing about it
      const ax = sd.x + sd.dir * N * (0.12 + rnd() * 0.08), ay = wallTop + u, dx = sd.x - ax, dy = sd.y - ay, Lw = Math.hypot(dx, dy), th = Math.atan2(dx, dy);
      if (dy < 0.04 * N) return; // nothing to hook above
      Object.assign(sd, { ax, ay, L: Lw, th, om: (sd.vx * Math.cos(th) - sd.vy * Math.sin(th)) / Lw, mode: 'swing', flash: 0.15, hop: false });
    };
    for (const hh of hits) {
      if (isLow(hh)) { for (const sd of w.squad) if (sd.mode !== 'roof') for (let k = 0; k < 3; k++) w.gas.push({ x: sd.x, y: sd.y, vx: -sd.vx * 0.25 + (rnd() - 0.5) * N * 0.1, vy: -sd.vy * 0.25 + (rnd() - 0.5) * N * 0.1, r: 1.5 * u, life: 0.5 + 0.4 * hh.strength }); }
      else if (hh.kind === 'snare') { const sd = pick(rnd, w.squad); burst(w.sparks, rnd, sd.x + sd.dir * 3 * u, sd.y, 8, N * 0.35, BRIGHT, 0.35); sd.blade = 0.12; }
      else if (isTonal(hh)) w.eyes = 0.3;
    }
    if (f.section === 'drop') { const g = w.giants.find((q) => !q.fall && !q.down); if (g) { g.fall = 0.06; g.fv = 0; } }
    else if (f.section === 'change') w.hour = rollW(rnd, WALL_HOUR_W, band);
    w.eyes -= dt;
    const tick = beatTick(w, f, dt);
    // the sky and the giants beyond the wall, their legs behind it; a falling one rotates about its feet
    skyBands(r, N, wallTop, WALL_SKY[w.hour]);
    r.disc((w.hour === 'dawn' ? 0.2 : 0.75) * N, (w.hour === 'noon' ? 0.1 : 0.36) * N, 0.06 * N, w.hour === 'noon' ? BRIGHT : HOT);
    for (const g of w.giants) {
      const Hg = g.h * N, fy = wallBot + 0.12 * N;
      if (g.down > 0) { if ((g.down -= dt) <= 0) { g.fall = 0; g.fv = 0; g.dir = -g.dir; g.x = g.dir > 0 ? -0.15 : 1.15; } continue; }
      if (g.fall > 0) { g.fv += ((1.5 * grav) / Hg) * Math.sin(g.fall) * dt; g.fall += g.fv * dt; if (g.fall >= Math.PI / 2) { g.down = 5; g.fall = Math.PI / 2; burst(w.dust, rnd, (g.x + g.dir * g.h * 0.5) * N, wallTop + u, 24, N * 0.25, LMID, 1); for (let k = 0; k < 12; k++) w.dust.push({ x: (g.x + g.dir * g.h * (0.2 + rnd() * 0.6)) * N, y: wallTop, vx: (rnd() - 0.5) * N * 0.2, vy: -N * (0.1 + rnd() * 0.2), r: 2 * u, life: 1.5 + rnd() }); s.shake = Math.max(s.shake, 0.8); } }
      else { const v = 0.012 * (0.3 + f.rel.midDrive); g.x += g.dir * v * dt; g.ph += (v * N * dt * Math.PI) / (Hg * 0.25); if (g.x > 1.2) g.dir = -1; else if (g.x < -0.2) g.dir = 1; }
      const bob = g.fall ? 0 : Math.abs(Math.sin(g.ph)) * Hg * 0.015, P = rotAt(g.x * N, fy, g.fall * g.dir), hip = -Hg * 0.48 - bob, sh = -Hg * 0.82 - bob, sw = Hg * 0.18, swing = Math.sin(g.ph) * Hg * 0.1;
      for (const k of [-1, 1]) { const st = (k * g.dir > 0 ? swing : -swing) * 0.5; r.poly([P(k * sw * 0.5 - Hg * 0.06, hip), P(k * sw * 0.5 + Hg * 0.06, hip), P(k * sw * 0.5 + Hg * 0.05 + st, 0), P(k * sw * 0.5 - Hg * 0.05 + st, 0)], DARK); }
      r.poly([P(-sw, sh), P(sw, sh), P(sw * 0.7, hip), P(-sw * 0.7, hip)], DARK);
      for (const k of [-1, 1]) { const [ax, ay] = P(k * sw, sh + Hg * 0.02), [bx, by] = P(k * sw * 1.2 + (k * g.dir > 0 ? -swing : swing), hip + Hg * 0.02); r.stroke(ax, ay, bx, by, Math.max(1, Hg * 0.05), DARK); }
      const [hx, hy] = P(0, sh - Hg * 0.09);
      r.disc(hx, hy, Hg * 0.08, DARK);
      const [ex, ey] = P(g.dir * Hg * 0.03, sh - Hg * 0.1);
      r.rect(ex - Hg * 0.025, ey, Hg * 0.05, Math.max(1, u), w.eyes > 0 ? BRIGHT : HOT);
      if (hy < wallTop) targets.push({ x: hx - sw, y: hy - Hg * 0.1, w: sw * 2, h: wallTop - hy + Hg * 0.1 });
    }
    // the wall: a lip, the courses; it hides the giants' legs and whatever falls behind it
    r.rect(0, wallTop, N, N - wallTop, MID + DIM);
    r.rect(0, wallTop, N, 2 * u, LMID);
    for (let y = wallTop + 5 * u, i = 0; y < wallBot + 0.12 * N; y += 4 * u, i++) { r.rect(0, y, N, Math.max(1, u * 0.6), DARK + DIM); for (let x = i % 2 ? 5 * u : 0; x < N; x += 10 * u) r.rect(x, y - 4 * u, Math.max(1, u * 0.6), 4 * u, DARK + DIM); }
    w.dust = puffs(W, w.dust, 0, -N * 0.02, 6, LMID, MID + DIM, 80);
    // the rooftops, nearer: house fronts with windows, the roof lines the squad lands on
    for (const b of w.roofs) {
      const x = b.x0 * N, bw = b.w * N, top = b.top * N;
      r.rect(x, top, bw, N - top, night ? DARK + DIM : DARK);
      r.rect(x, top, bw, Math.max(1, u), night ? MID : LMID + DIM);
      for (let yy = top + 4 * u; yy < N; yy += 5 * u) for (let xx = x + 2 * u; xx < x + bw - 2 * u; xx += 4 * u) if (hash(b.win + Math.round(xx - x), Math.round(yy - top)) < 0.4) r.rect(xx, yy, 2 * u, 2 * u, night ? HOT + DIM : BLACK);
      r.rect(x + bw * 0.3, top - 3 * u, 2 * u, 3 * u, DARK);
    }
    // the squad: a swing about the anchor, the flight after letting go, a landing; a new wire on the beat
    const hgt = 0.1 * N, land = (sd, ry) => { sd.roofY = ry; sd.y = ry - hgt * 0.4; sd.mode = 'roof'; sd.crouch = 1; sd.vx = sd.vy = 0; sd.hop = false; burst(w.dust, rnd, sd.x, ry, 4, N * 0.1, LMID, 0.3); };
    for (const sd of w.squad) {
      if (sd.mode === 'swing') {
        const was = sd.th, L2 = Math.max(0.07 * N, sd.L - 0.08 * N * dt); // the gear reels the wire in: the swing tightens and quickens (L²ω is kept)
        sd.om *= (sd.L / L2) ** 2; sd.L = L2;
        sd.om -= (grav / sd.L) * Math.sin(sd.th) * dt;
        sd.th += sd.om * dt;
        sd.x = sd.ax + Math.sin(sd.th) * sd.L; sd.y = sd.ay + Math.cos(sd.th) * sd.L;
        sd.vx = sd.L * Math.cos(sd.th) * sd.om; sd.vy = -sd.L * Math.sin(sd.th) * sd.om;
        const ry = roofAt(sd.x);
        if (sd.y + hgt * 0.4 >= ry - u) land(sd, ry); // a roof in the way of the swing: straight onto it, never through it
        else if ((was * sd.dir < 0 && sd.th * sd.dir >= 0) || Math.abs(sd.th) > 1.3) sd.mode = 'fly'; // let go at the bottom, forward; a slack wire lets go too
      } else if (sd.mode === 'fly') {
        sd.vy += grav * dt; sd.x += sd.vx * dt; sd.y += sd.vy * dt;
        const ry = roofAt(sd.x);
        if (sd.vy > 0 && sd.y + hgt * 0.4 >= ry) land(sd, ry);
        else if (sd.hop ? sd.vy >= 0 : tick) fire(sd); // off a roof the hook goes at the top of the leap, in the air on the beat
      } else { sd.crouch *= Math.exp(-dt * 4); sd.y = sd.roofY - hgt * 0.4 * (1 - 0.35 * sd.crouch); if (tick) { sd.vx = sd.dir * N * 0.3; sd.vy = -N * 0.6; sd.mode = 'fly'; sd.hop = true; for (let k = 0; k < 3; k++) w.gas.push({ x: sd.x, y: sd.y + hgt * 0.3, vx: (rnd() - 0.5) * N * 0.1, vy: N * 0.1, r: 1.5 * u, life: 0.5 }); } }
      if (sd.x > 1.2 * N || sd.y > N + 0.1 * N) { sd.x = -0.12 * N; sd.y = (0.42 + rnd() * 0.1) * N; sd.vx = N * 0.3; sd.vy = -N * 0.1; sd.mode = 'fly'; }
      sd.flash -= dt; sd.blade = (sd.blade || 0) - dt;
      const d = sd.dir, onWire = sd.mode === 'swing', roof = sd.mode === 'roof';
      let ux = 0, uy = -1;
      if (onWire) { const L2 = Math.hypot(sd.ax - sd.x, sd.ay - sd.y) || 1; ux = (sd.ax - sd.x) / L2; uy = (sd.ay - sd.y) / L2; r.line(sd.ax, sd.ay, sd.x + ux * hgt * 0.6, sd.y + uy * hgt * 0.6, LMID); }
      if (onWire || sd.flash > 0) r.rect(sd.ax - u, sd.ay - u, 2 * u, 2 * u, sd.flash > 0 ? BRIGHT : LMID);
      const sp = Math.hypot(sd.vx, sd.vy) || 1, tx = roof ? 0 : sd.vx / sp, ty = roof ? 0 : sd.vy / sp, cr = roof ? sd.crouch : 0;
      const sx = sd.x + ux * hgt * 0.42 * (1 - 0.3 * cr), sy = sd.y + uy * hgt * 0.42 * (1 - 0.3 * cr); // the shoulders, up the wire or just up from the hip
      const cl = hgt * (0.3 + 0.3 * Math.min(1, sp / (N * 0.5)));
      r.stroke(sx, sy, sx - (roof ? d : tx) * cl, sy - ty * cl * 0.6 + hgt * (roof ? 0.35 : 0.12), Math.max(1, hgt * 0.14), DARK); // the cloak streams back
      r.stroke(sd.x, sd.y, sx, sy, Math.max(1, hgt * 0.26), FIG);
      if (onWire) r.stroke(sx, sy, sx + ux * hgt * 0.25, sy + uy * hgt * 0.25, Math.max(1, hgt * 0.1), FIG); // the arms up the wire to the grip
      else r.stroke(sx, sy, sx + d * hgt * 0.22, sy + hgt * 0.1 - ty * hgt * 0.1, Math.max(1, hgt * 0.1), FIG);
      r.disc(sx + d * hgt * 0.08, sy - hgt * 0.15, hgt * 0.15, FIG);
      for (const k of [-1, 1]) { const lx = roof ? sd.x + k * hgt * 0.14 : sd.x - tx * hgt * 0.38 + k * hgt * 0.06, ly = roof ? sd.roofY : sd.y - ty * hgt * 0.38 + hgt * 0.1 + k * hgt * 0.04; r.stroke(sd.x, sd.y, lx, ly, Math.max(1, hgt * 0.14), FIG); }
      if (sd.blade > 0) r.stroke(sx + d * hgt * 0.22, sy + hgt * 0.08, sx + d * hgt * 0.7, sy - hgt * 0.1, Math.max(1, u), BRIGHT);
      targets.push({ x: sd.x - hgt * 0.5, y: sd.y - hgt * 0.6, w: hgt, h: hgt * 1.1 });
    }
    w.gas = puffs(W, w.gas, 0, -N * 0.02, 5, LMID, LMID + DIM, 120);
    w.sparks = particles(W, w.sparks, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- spiral drill
// A drill mech in a cave: the drill on its head spins with the beat (its helix stripes advance), spiral energy winds
// up round it on the bass clock in the colour of the last note, and as the energy rises a smaller mech lands on
// its head, and a smaller one on that: the stack grows and shrinks with the level, smoothly, the drill always on
// top. Kicks stamp the ground and speed the drill, snares throw sparks off the tip. A drop is the breakthrough:
// the stack launches, the drill pierces the cave ceiling, the rock comes down under gravity, the daylight pours in
// through the hole and the stack falls back onto its feet; the next section closes the roof. Kinds: the drill.
const DRILL_W = { small: [3, 2, 1], medium: [2, 2, 2], huge: [1, 2, 3] };
const DRILL_LEN = { small: 0.18, medium: 0.26, huge: 0.36 };

// one unit of the stack with its feet at (x, base), `Hm` tall; returns the top of its head
function drillMech(r, x, base, Hm, u, pump, col) {
  const bw = Hm * 0.4, by = base - Hm * 0.22 - bw * (1 + 0.05 * pump);
  for (const k of [-1, 1]) { r.stroke(x + k * bw * 0.4, by + bw * 0.6, x + k * bw * 0.65, base, Math.max(1, Hm * 0.09), col); r.rect(x + k * bw * 0.65 - Hm * 0.08, base - Hm * 0.05, Hm * 0.16, Hm * 0.05, col); }
  r.disc(x, by, bw, col);
  r.rect(x - bw * 0.72, by - Hm * 0.07, bw * 1.44, Hm * 0.13, DARK);
  for (const k of [-1, 1]) r.rect(x + k * bw * 0.32 - u, by - u, Math.max(1, 2 * u), Math.max(1, 2 * u), pump > 0.5 ? BRIGHT : HOT);
  for (const k of [-1, 1]) r.stroke(x + k * bw * 0.9, by, x + k * bw * 1.3, by + Hm * 0.22, Math.max(1, Hm * 0.08), col);
  return by - bw;
}
// the drill: a cone up from `top`, each row a span of metal with three helix stripes wound round it, the front half
function drillCone(r, cx, top, len, bw, spin, u, lit) {
  for (let y = Math.floor(top - len); y < top; y++) {
    const q = (top - y) / len, hw = Math.max(0.5, (1 - q) * bw * 0.5);
    r.rect(cx - hw, y, 2 * hw, 1, lit ? LMID : MID);
    for (let k = 0; k < 3; k++) { const ph = (k / 3 + spin - q * 2.5) * TAU, c = Math.cos(ph); if (c > 0) r.rect(cx + Math.sin(ph) * hw - Math.max(0.5, hw * 0.15 * c), y, Math.max(1, hw * 0.3 * c), 1, DARK); }
  }
  r.rect(cx - u * 0.5, top - len - u, Math.max(1, u), 2 * u, BRIGHT);
}

const spiraldrill = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, DRILL_W, band), spin: 0, lvl: 0, stamp: 0, pc: Math.floor(rnd() * 12), dy: 0, dvy: 0, launch: false, hole: false, holeW: 0, rocks: [], sparks: [], dust: [], ph0: rnd() * TAU,
      stal: Array.from({ length: 9 }, (_, i) => [i * 0.115 + rnd() * 0.05, 0.05 + rnd() * 0.08, 0.02 + rnd() * 0.03]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), grav = G(N), g = 0.88 * N, cx = 0.5 * N, ceil = 0.2 * N, E = clamp(0.4 * f.level + 0.6 * f.rel.bassDrive), len = DRILL_LEN[w.kind] * N;
    for (const hh of hits) {
      if (isLow(hh)) { w.stamp = 1; w.spin += 0.15 * hh.strength; burst(w.dust, rnd, cx, g, 6, N * 0.2, LMID, 0.4); s.shake = Math.max(s.shake, 0.15 * hh.strength); }
      else if (hh.kind === 'snare') w.snare = 1;
      else if (isTonal(hh)) w.pc = hh.pc;
    }
    if (f.section === 'drop' && !w.launch) { w.launch = true; w.dvy = -N * 1.05; }
    else if (f.section === 'change') { w.kind = rollW(rnd, DRILL_W, band); w.hole = false; }
    w.stamp *= Math.exp(-dt * 6);
    w.spin += dt * (1.5 + 5 * f.rel.bassDrive + 3 * f.beat.pulse);
    w.lvl = follow(w.lvl, E * 3.2, dt, 0.5);
    // the stack: the base unit, then smaller ones on its head, the last one growing in with the fraction
    const H0 = 0.3 * N, n = Math.floor(w.lvl), frac = ease(w.lvl - n), heights = [];
    let base = g + w.dy, top = base, hm = H0;
    for (let k = 0; k <= n; k++) { const sc = k === n ? frac : 1; if (sc < 0.05) break; heights.push([base, hm * sc]); base -= hm * sc * 0.98; hm *= 0.62; }
    top = base;
    const tipY = top - len;
    // the launch: up under its own thrust, through the roof, down again under gravity onto its feet
    if (w.launch) {
      w.dvy += grav * dt; w.dy += w.dvy * dt;
      if (!w.hole && tipY <= ceil) { w.hole = true; w.holeW = 0.12 * N; s.shake = Math.max(s.shake, 1); for (let k = 0; k < 40; k++) w.rocks.push({ x: cx + (rnd() - 0.5) * 0.2 * N, y: ceil + rnd() * 3 * u, vx: (rnd() - 0.5) * N * 0.6, vy: -rnd() * N * 0.3, s: (1 + rnd() * 2) * u, life: 3 }); }
      if (w.dy >= 0 && w.dvy > 0) { w.dy = 0; if (w.dvy > N * 0.3) { w.dvy = -w.dvy * 0.25; w.stamp = 1; burst(w.dust, rnd, cx, g, 16, N * 0.3, LMID, 0.6); s.shake = Math.max(s.shake, 0.6); } else { w.dvy = 0; w.launch = false; } }
    }
    // the cave: the back, the ceiling with its stalactites and the hole, the daylight through it, the floor
    r.rect(0, 0, N, N, DARK + DIM);
    for (let k = 0; k < 6; k++) r.rect(hash(k, 1) * N, 0, (3 + hash(k, 2) * 10) * u, N, DARK);
    if (w.hole) { r.poly([[cx - w.holeW, ceil], [cx + w.holeW, ceil], [cx + w.holeW * 2.2, g], [cx - w.holeW * 2.2, g]], LMID + DIM); r.poly([[cx - w.holeW * 0.5, ceil], [cx + w.holeW * 0.5, ceil], [cx + w.holeW, g], [cx - w.holeW, g]], f.beat.pulse > 0.5 ? BRIGHT : LMID); }
    r.rect(0, 0, N, ceil, DARK);
    for (const [x, hgt, hw] of w.stal) if (!w.hole || Math.abs(x * N - cx) > w.holeW + hw * N) r.poly([[(x - hw) * N, ceil - u], [(x + hw) * N, ceil - u], [x * N, ceil + hgt * N]], DARK);
    if (w.hole) { r.rect(cx - w.holeW, 0, 2 * w.holeW, ceil, BRIGHT); for (const k of [-1, 1]) r.poly([[cx + k * w.holeW, 0], [cx + k * w.holeW * 1.3, 0], [cx + k * w.holeW * 1.1, ceil * 0.6], [cx + k * w.holeW, ceil]], DARK + DIM); }
    r.rect(0, g, N, N - g, MID + DIM);
    r.rect(0, g, N, Math.max(1, u), LMID + DIM);
    for (let k = 0; k < 10; k++) r.rect(hash(k, 3) * N, g + 2 * u + hash(k, 4) * (N - g - 4 * u), (2 + hash(k, 5) * 4) * u, 2 * u, DARK);
    // the spiral energy round the stack: the half behind it first, the mechs, then the half in front
    const colE = PC_COL[w.pc], stackH = g + w.dy - tipY, nP = 20 + Math.round(30 * E);
    const spiral = (front) => { for (let j = 0; j < nP; j++) { const q = j / nP, a = q * 9 - f.rel.bassClock * 3 + w.ph0, sn = Math.sin(a); if ((sn > 0) !== front) continue; const R = (0.07 + 0.12 * (1 - q)) * N * (1 + 0.6 * E); r.disc(cx + Math.cos(a) * R, g + w.dy - q * stackH, (0.8 + E) * u, front ? colE : dim(colE)); } };
    spiral(false);
    for (let k = heights.length - 1; k >= 0; k--) drillMech(r, cx, heights[k][0], heights[k][1], u, w.stamp, FIG);
    drillCone(r, cx, top, len, Math.max(4 * u, heights.length ? heights[heights.length - 1][1] * 0.5 : 6 * u), w.spin, u, f.beat.pulse > 0.6);
    spiral(true);
    if (w.snare > 0) { w.snare -= dt * 6; burst(w.sparks, rnd, cx, tipY, Math.max(1, Math.round(120 * dt)), N * 0.4, BRIGHT, 0.3); } // so many a second, whatever the frame rate
    // the rock coming down, the sparks, the dust off the feet
    w.rocks = w.rocks.filter((p) => { p.vy += grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.y >= g) { p.y = g; p.vy = -p.vy * 0.2; p.vx *= 0.5; if (Math.abs(p.vy) < N * 0.05) p.vy = 0; } r.rect(p.x - p.s * 0.5, p.y - p.s, p.s, p.s, DARK); return p.life > 0; });
    w.sparks = particles(W, w.sparks.filter((p) => p.y < g), BRIGHT);
    w.dust = puffs(W, w.dust, 0, -N * 0.02, 5, LMID + DIM, MID, 60);
    targets.push({ x: cx - H0 * 0.5, y: tipY, w: H0, h: g + w.dy - tipY });
  },
};

// ---------------------------------------------------------------------------------------------- luminous forest
// A dark forest where luminous flows rise through the trunks: thin glowing streams that follow the paths of a noise
// field, drifting as the mid clock turns the field, brighter when the bass is up, with beads running up them on
// the bass clock. A wanderer with a pack stands still and smokes a pipe (the smoke rises and slows in the air), a
// swarm of motes turns round a glowing spore and scatters on the snares before it gathers again, hats put out
// fireflies, the spore pulses on the beat. A drop is a surge of light through every stream; a section change is
// the season. Calm.
const FOREST_W = { spring: [3, 2, 1], summer: [2, 2, 2], autumn: [1, 2, 3] };

const mushiforest = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    const trunks = (n, x0, x1) => Array.from({ length: n }, () => ({ x: x0 + rnd() * (x1 - x0), w: 0.6 + rnd() * 0.8, lean: (rnd() - 0.5) * 0.08, top: rnd() * 0.15 }));
    Object.assign(w, { season: rollW(rnd, FOREST_W, band), noise: makeNoise(Math.floor(rnd() * 1e6)), surge: 0, smoke: [], smokeT: 0, flies: [], leaves: [], far: trunks(14, -0.05, 1.05), mid: trunks(8, -0.05, 1.05), near: trunks(3, 0.55, 1.05),
      streams: Array.from({ length: 7 }, () => ({ x0: 0.05 + rnd() * 0.9, y0: 0.6 + rnd() * 0.3, ph: rnd(), len: 22 + Math.floor(rnd() * 18) })),
      swarm: Array.from({ length: 22 }, () => ({ x: 0.66 * N + (rnd() - 0.5) * 0.1 * N, y: 0.5 * N + (rnd() - 0.5) * 0.1 * N, vx: 0, vy: 0, ph: rnd() * TAU, R: (3 + rnd() * 6) })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), g = 0.88 * N, wind = windOf(f) * 0.5, sx = 0.66 * N, sy = 0.5 * N, noise = w.noise;
    for (const hh of hits) {
      if (hh.kind === 'snare') for (const p of w.swarm) { const dx = p.x - sx, dy = p.y - sy, d = Math.hypot(dx, dy) || 1; p.vx += (dx / d) * N * (0.3 + 0.4 * hh.strength); p.vy += (dy / d) * N * (0.3 + 0.4 * hh.strength); }
      else if (hh.kind === 'hat') for (let k = 0; k < 3; k++) w.flies.push({ x: rnd() * N, y: (0.3 + rnd() * 0.5) * N, vx: (rnd() - 0.5) * N * 0.04, vy: (rnd() - 0.5) * N * 0.03, ph: rnd() * TAU, life: 3 + rnd() * 3 });
    }
    if (f.section === 'drop') w.surge = 1;
    else if (f.section === 'change') { w.season = rollW(rnd, FOREST_W, band); for (const st of w.streams) { st.x0 = 0.05 + rnd() * 0.9; st.y0 = 0.6 + rnd() * 0.3; } }
    w.surge = Math.max(0, w.surge - dt / 6);
    const bass = clamp(f.rel.bassDrive + w.surge), flowCol = bass > 0.55 ? BRIGHT : COOL, canopy = w.season === 'spring' ? HOT + DIM : w.season === 'summer' ? COOL + DIM : HOT + DIM;
    // the forest, far to near: trunks leaning a little, the canopy dark above, the ground; the nearer rows stand lower on
    // it. The standing forest never moves, so it is drawn once into a layer and copied in each frame
    const trunk = (rr, tr, wd, gy, col, canopyCol) => { const x = tr.x * N, top = tr.top * N; rr.poly([[x - wd, gy], [x + wd, gy], [x + wd * 0.7 + tr.lean * N, top], [x - wd * 0.7 + tr.lean * N, top]], col); if (canopyCol !== null) rr.disc(x + tr.lean * N, top, wd * 4, canopyCol); };
    if (!w.bg || w.bgN !== N) {
      const bg = new Raster(N);
      bg.fill(BG);
      for (const tr of w.far) trunk(bg, tr, tr.w * 1.5 * u, g, DARK + DIM, DARK + DIM);
      bg.rect(0, g, N, N - g, DARK + DIM);
      for (const tr of w.mid) trunk(bg, tr, tr.w * 3 * u, g + 0.035 * N, DARK, null);
      w.bg = bg.buf; w.bgN = N;
    }
    r.buf.set(w.bg);
    if (w.season !== 'summer') for (let k = 0; k < 30; k++) r.rect(hash(k, 1) * N, (0.02 + hash(k, 2) * 0.3) * N, Math.max(1, u), Math.max(1, u), canopy); // blossom or the last leaves in the dark canopy
    // the flows: traced through the field from their springs, a bead running up each on the bass clock
    const step = 2.8 * u, sc = 0.03 / u, beadQ = beatLocked(f) ? f.beat.count + f.beat.phase : f.rel.bassClock;
    for (const st of w.streams) {
      let x = st.x0 * N, y = st.y0 * N;
      const off = f.rel.midClock * 0.06 + st.ph * 10, len = Math.round(st.len * (1 + 0.3 * w.surge)), bead = Math.floor(((beadQ * 0.5 + st.ph) % 1) * len);
      for (let k = 0; k < len; k++) {
        const a = -Math.PI / 2 + (noise.fbm(x * sc + off, y * sc, 2) - 0.5) * 4.5, nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
        r.line(x, y, nx, ny, k > len * 0.7 ? dim(flowCol) : flowCol);
        if (k === bead) r.disc(nx, ny, 1.5 * u, BRIGHT);
        x = nx; y = ny;
        if (y < 0 || x < 0 || x > N) break;
      }
      r.disc(st.x0 * N, st.y0 * N, 1.5 * u, flowCol); // the spring
    }
    // the spore and its swarm: each mote is pulled back to its place in the ring and damped by the air
    const pulse = 1 + 0.5 * f.beat.pulse;
    r.disc(sx, sy, 4 * u * pulse, COOL + DIM);
    r.disc(sx, sy, 2 * u * pulse, w.surge > 0.5 ? BRIGHT : COOL);
    for (const p of w.swarm) {
      p.ph += dt * 1.2;
      const tx = sx + Math.cos(p.ph) * p.R * u, ty = sy + Math.sin(p.ph * 1.3) * p.R * u * 0.6;
      p.vx += (tx - p.x) * 4 * dt; p.vy += (ty - p.y) * 4 * dt; p.vx *= Math.exp(-dt * 2); p.vy *= Math.exp(-dt * 2);
      p.x += p.vx * dt; p.y += p.vy * dt;
      r.set(p.x, p.y, hash(Math.round(p.ph * 10), 1) < 0.5 ? BRIGHT : COOL);
    }
    // the wanderer: still, the pack on the back, the pipe, its smoke rising and slowing
    const fx = 0.3 * N, fh = 0.2 * N;
    r.rect(fx - fh * 0.2, g, fh * 0.4, Math.max(1, u), BLACK);
    r.rect(fx - fh * 0.42, g - fh * 0.78, fh * 0.26, fh * 0.42, DARK);
    const J = walker(r, fx, g, fh, FIG, 0, 1, { cap: true, hatCol: DARK });
    r.line(fx + fh * 0.08, J.head + fh * 0.03, fx + fh * 0.24, J.head + fh * 0.09, LMID);
    r.rect(fx + fh * 0.22, J.head + fh * 0.07, 2 * u, 2 * u, f.beat.pulse > 0.7 ? HOT : HOT + DIM);
    if ((w.smokeT += dt) > 0.3) { w.smokeT = 0; w.smoke.push({ x: fx + fh * 0.24, y: J.head + fh * 0.06, vx: N * 0.02, vy: -N * 0.07, r: u, life: 2.5 }); }
    w.smoke = puffs(W, w.smoke, wind * N * 0.02, -N * 0.012, 2.5, LMID + DIM, MID + DIM, 40);
    targets.push({ x: fx - fh * 0.45, y: g - fh * 1.05, w: fh * 0.8, h: fh * 1.05 });
    // the near trunks in front, the fireflies, the leaves of autumn
    for (const tr of w.near) trunk(r, tr, tr.w * 6 * u, g + 0.09 * N, BLACK, null);
    w.flies = w.flies.filter((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += Math.sin(t * 2 + p.ph) * dt * 2 * u; p.life -= dt; if (Math.sin(t * 5 + p.ph) > 0.2) r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), BRIGHT); return p.life > 0; });
    if (w.season === 'autumn') {
      if (w.leaves.length < 20 && rnd() < 9 * dt) w.leaves.push({ x: rnd() * N, y: 0, vx: 0, vy: 0, ph: rnd() * TAU });
      w.leaves = w.leaves.filter((p) => { p.vy = Math.min(N * 0.06, p.vy + N * 0.6 * dt); p.vx = follow(p.vx, wind * N * 0.05 + Math.sin(t * 1.5 + p.ph) * N * 0.04, dt, 0.5); p.x += p.vx * dt; p.y += p.vy * dt; r.rect(p.x, p.y, Math.max(1, 1.5 * u), Math.max(1, u), HOT + DIM); return p.y < g; });
    }
  },
};

// ---------------------------------------------------------------------------------------------- school band
// A music room in the afternoon light: a four-piece that plays the track. The drummer's sticks travel to the kick
// drum on the kicks and the snare on the snares (the heads push back), the hi-hat chatters on the hats and the
// guitarist strums on them, the bassist plucks on the bass hits, the keyboardist's hands go to the key of each
// note and the keys light by pitch class, the amps' cones push with the bass, heads nod on the beat, the window
// light slides across the floor with the sun (the mid clock). A drop is the jump: all four leave the floor together
// on one parabola and land together. Kinds: the room.
const ROOM_W = { clubroom: [3, 2, 1], gym: [2, 2, 2], livehouse: [1, 2, 3] };
const BLACKKEY = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

const schoolband = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { room: rollW(rnd, ROOM_W, band), kick: 0, snr: 0, hat: 0, strum: 0, pluck: 0, crash: 0, preK: 0, preS: 0, snrBeat: 1, keys: new Float32Array(24), keyCol: new Uint8Array(24), handL: 0.3, handR: 0.7, hx1: 0, hx2: 0, jy: 0, jvy: 0, pcG: 4, posters: Array.from({ length: 5 }, () => [rnd(), rnd(), rnd()]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = 0.84 * N, live = w.room === 'livehouse', gym = w.room === 'gym';
    for (const hh of hits) {
      if (hh.kind === 'kick') { w.kick = 1; if (hh.strength > 0.8) w.crash = 1; }
      else if (hh.kind === 'bass') w.pluck = 1;
      else if (hh.kind === 'snare') { w.snr = 1; w.snrBeat = f.beat.count % 2; }
      else if (hh.kind === 'hat' || hh.kind === 'perc') { w.hat = 1; w.strum = 1; }
      if (isTonal(hh)) { const i = hh.pc + 12 * (hash(f.beat.count, hh.pc) < 0.5 ? 0 : 1); w.keys[i] = 1; w.keyCol[i] = PC_COL[hh.pc]; if (i < 12) w.handL = i / 24; else w.handR = i / 24; w.pcG = hh.pc; }
    }
    if (f.section === 'drop' && w.jy <= 0) w.jvy = Math.sqrt(2 * G(N) * 0.08 * N);
    else if (f.section === 'change') w.room = rollW(rnd, ROOM_W, band);
    for (const k of ['kick', 'snr', 'hat', 'strum', 'pluck', 'crash']) w[k] *= Math.exp(-dt * (k === 'hat' ? 14 : k === 'crash' ? 2 : 8));
    for (let i = 0; i < 24; i++) w.keys[i] *= Math.exp(-dt * 4);
    if (w.jvy > 0 || w.jy > 0) { w.jvy -= G(N) * dt; w.jy += w.jvy * dt; if (w.jy <= 0) { w.jy = 0; w.jvy = 0; s.shake = Math.max(s.shake, 0.3); } } // the jump: up and back onto the floor under gravity
    // the sticks wind up and come down over the last third of each beat, to be at the drum as it lands (the kick's every
    // beat, the snare's on the beats it last played); a hit takes them the rest of the way
    const pre = beatLocked(f) ? Math.max(0, (f.beat.phase - 0.7) / 0.3) ** 2 * 0.6 : 0;
    w.preK = Math.max(w.preK * Math.exp(-dt * 10), pre); w.preS = Math.max(w.preS * Math.exp(-dt * 10), (f.beat.count + 1) % 2 === w.snrBeat ? pre : 0);
    const base = g - w.jy, nod = f.beat.pulse * 1.2 * u, sun = (0.08 + 0.14 * Math.sin(f.rel.midClock * 0.3)) * N; // the people leave the floor; the kit, the amps and the keyboard stay on it
    // the room: the back wall, the windows and their light across the floor, the posters, the bunting or the spots
    r.rect(0, 0, N, g, live ? DARK + DIM : MID + DIM);
    r.rect(0, g, N, N - g, live ? DARK : MID);
    r.rect(0, g, N, Math.max(1, u), live ? MID + DIM : LMID);
    if (!live) for (const wx of [0.58, 0.78]) {
      const x = wx * N, ww = 0.13 * N, y0 = 0.14 * N, y1 = 0.5 * N;
      r.rect(x, y0, ww, y1 - y0, BRIGHT);
      r.rect(x + ww / 2 - u * 0.5, y0, Math.max(1, u), y1 - y0, DARK + DIM); r.rect(x, (y0 + y1) / 2, ww, Math.max(1, u), DARK + DIM);
      r.poly([[x + sun, g], [x + ww + sun, g], [x + ww + sun * 2, N], [x + sun * 2, N]], LMID); // the light on the floor, off the wall by the sill
    }
    if (gym) for (let k = 0; k < 12; k++) { const x = (k * N) / 12; r.poly([[x, 0.08 * N + Math.sin(k) * 2 * u], [x + N / 12, 0.08 * N + Math.sin(k + 1) * 2 * u], [x + N / 24, 0.15 * N]], k % 2 ? HOT : COOL); }
    else if (!live) for (const [px, py, pc] of w.posters) r.rect(0.04 * N + px * 0.4 * N, 0.1 * N + py * 0.3 * N, 0.07 * N, 0.09 * N, pc < 0.5 ? HOT + DIM : COOL + DIM);
    if (live) for (let k = 0; k < 3; k++) { const x = (0.2 + k * 0.3) * N, on = (k + f.beat.count) % 3 === 0 || f.beat.pulse > 0.8; r.poly([[x - 2 * u, 0.04 * N], [x + 2 * u, 0.04 * N], [x + 0.12 * N, g], [x - 0.12 * N, g]], on ? (k % 2 ? HOT + DIM : COOL + DIM) : DARK); r.rect(x - 3 * u, 0.02 * N, 6 * u, 3 * u, on ? BRIGHT : MID); }
    // the amps: cabinets whose cones push with the bass
    for (const [ax, big] of [[0.06, 1], [0.6, 0.8]]) { const x = ax * N, sz = 0.13 * N * big, cone = sz * 0.3 * (1 + 0.12 * clamp(f.rel.bassAtt) + 0.08 * f.rel.bassDrive + 0.1 * w.pluck); r.rect(x - sz / 2, g - sz, sz, sz, DARK); r.disc(x, g - sz * 0.45, cone, DARK + DIM); r.disc(x, g - sz * 0.45, cone * 0.45, MID + DIM); r.rect(x - sz * 0.4, g - sz * 0.92, sz * 0.8, sz * 0.1, LMID + DIM); r.rect(x + sz * 0.3, g - sz * 0.9, 2 * u, 2 * u, HOT); }
    // the drummer behind the kit: the heads push back when struck, the hi-hat chatters, the crash wobbles
    const K = 0.12 * N, dx = 0.5 * N, kr = K * 0.55 * (1 + 0.06 * w.kick), kcy = g - K * 0.56;
    r.rect(dx - K * 0.3, base - K * 2.1, K * 0.6, K * 1.6, FIG);
    r.disc(dx, base - K * 2.25 + nod, K * 0.26, FIG);
    const shL = [dx - K * 0.3, base - K * 1.95], shR = [dx + K * 0.3, base - K * 1.95];
    r.disc(dx, kcy, kr, LMID); r.ring(dx, kcy, kr, Math.max(1, u), w.kick > 0.6 ? BRIGHT : DARK); r.disc(dx, kcy, kr * 0.25, DARK);
    const snX = dx - K * 1.15, snY = g - K * 1.25 + w.snr * 1.5 * u;
    r.rect(snX - u * 0.5, snY, Math.max(1, u), g - snY, DARK + DIM);
    r.rect(snX - K * 0.3, snY - K * 0.12, K * 0.6, K * 0.26, LMID); r.rect(snX - K * 0.3, snY - K * 0.12, K * 0.6, Math.max(1, u), w.snr > 0.6 ? BRIGHT : LMID + DIM);
    const hhX = dx - K * 1.85, hhY = g - K * 1.65;
    r.rect(hhX - u * 0.5, hhY, Math.max(1, u), g - hhY, DARK + DIM);
    r.rect(hhX - K * 0.3, hhY, K * 0.6, Math.max(1, u), w.hat > 0.5 ? BRIGHT : LMID); r.rect(hhX - K * 0.3, hhY - u - w.hat * 2 * u, K * 0.6, Math.max(1, u), w.hat > 0.5 ? BRIGHT : LMID);
    const crX = dx + K * 1.45, crY = g - K * 2.05, tilt = Math.sin(t * 9) * w.crash * 3 * u;
    r.rect(crX - u * 0.5, crY, Math.max(1, u), g - crY, DARK + DIM);
    r.line(crX - K * 0.4, crY - tilt, crX + K * 0.4, crY + tilt, w.crash > 0.5 ? BRIGHT : LMID);
    r.rect(dx + K * 0.75, g - K * 0.9, K * 0.6, K * 0.6, LMID); r.rect(dx + K * 0.75, g - K * 0.9, K * 0.6, Math.max(1, u), DARK);
    const stick = (sh, rest, tgt, k) => { const tx = lerp(rest[0], tgt[0], k), ty = lerp(rest[1], tgt[1], k), hx = lerp(sh[0], tx, 0.6), hy = lerp(sh[1], ty, 0.6); r.stroke(sh[0], sh[1], hx, hy, Math.max(1, K * 0.1), FIG); r.line(hx, hy, tx, ty, LMID); };
    stick(shL, [dx - K * 0.7, base - K * 1.7], [snX + K * 0.1, snY - K * 0.12], Math.max(w.snr, w.preS));
    stick(shR, [dx + K * 0.6, base - K * 1.6], [dx + K * 0.15, kcy - kr + u], Math.max(w.kick, w.preK));
    targets.push({ x: dx - K * 2.2, y: base - K * 2.6, w: K * 4.4, h: K * 2.6 });
    // the guitarist and the bassist in front: a strum on the hats, a pluck on the bass; the fret hand at the note
    const stringed = (x, h, long, hand, fret, pluckK) => {
      r.rect(x - h * 0.2, g, h * 0.4, Math.max(1, u), BLACK);
      const J = walker(r, x, base, h, FIG, 0.35, 1, {}), by = J.sy + h * 0.42, bx = x + h * 0.08, nx = x - h * (long ? 0.5 : 0.38), ny = J.sy + h * (long ? 0.02 : 0.08);
      r.disc(bx, by, h * (long ? 0.11 : 0.13), DARK); r.disc(bx - h * 0.1, by - h * 0.04, h * 0.1, DARK);
      r.stroke(bx - h * 0.1, by - h * 0.02, nx, ny, Math.max(1, h * 0.05), DARK);
      r.line(bx, by, nx, ny, LMID);
      r.disc(lerp(nx, bx - h * 0.1, 0.15 + 0.6 * fret), lerp(ny, by - h * 0.02, 0.15 + 0.6 * fret), h * 0.035, FIG);
      r.disc(bx + h * 0.03, by - h * 0.1 + hand * h * 0.2 + pluckK * h * 0.04, h * 0.04, FIG);
      r.disc(x, J.head + nod, h * 0.105, FIG);
      targets.push({ x: x - h * 0.5, y: base - h * 1.05, w: h, h: h * 1.05 });
    };
    stringed(0.2 * N, 0.3 * N, false, 1 - w.strum, w.pcG / 11, 0);
    stringed(0.72 * N, 0.3 * N, true, 0.5, 1 - w.pcG / 11, w.pluck);
    // the keyboardist behind the keys: the keys light by pitch class, a hand goes to each note
    const kx0 = 0.76 * N, kw = 0.22 * N, ky = g - 0.17 * N, kh = 0.26 * N, px = kx0 + kw / 2;
    walker(r, px, base, kh, FIG, 0, 1, {});
    r.disc(px, base - kh * 0.86 + nod, kh * 0.105, FIG);
    r.rect(kx0 - u, ky - 2 * u, kw + 2 * u, 5 * u, DARK);
    for (let i = 0; i < 24; i++) { const x = kx0 + (i / 24) * kw; r.rect(x, ky, kw / 24 - u * 0.4, 3 * u, w.keys[i] > 0.1 ? w.keyCol[i] : BLACKKEY[i % 12] ? DARK + DIM : LMID); }
    for (const k of [-1, 1]) r.rect(kx0 + kw / 2 + k * kw * 0.4, ky + 3 * u, 2 * u, g - ky - 3 * u, DARK);
    w.hx1 = follow(w.hx1 || kx0 + kw * 0.3, kx0 + w.handL * kw, dt, 0.08); w.hx2 = follow(w.hx2 || kx0 + kw * 0.7, kx0 + w.handR * kw, dt, 0.08);
    for (const hx of [w.hx1, w.hx2]) r.disc(hx, ky - u, kh * 0.04, FIG);
    targets.push({ x: kx0, y: base - kh * 1.05, w: kw, h: kh * 1.05 });
  },
};

// ---------------------------------------------------------------------------------------------- recital
// A concert hall: a grand piano in one spotlight, the keys lighting by pitch class on the notes and the hammers
// inside the lid jumping with them, the pianist's hands going to the key, a violinist whose bow slides across the
// strings with the mid clock, petals coming down through the light (gravity to a terminal speed, a drift in the
// hall's air), the heads of the audience across the front. A kick is a forte (the pianist leans in, the light
// flares), a snare a flick of the bow, a hat a glint in the chandelier. A drop is the standing ovation: a flash,
// the silhouettes rise and clap for a few bars. Kinds: the hall.
const HALL_W = { salon: [3, 2, 1], concert: [2, 2, 2], opera: [1, 2, 3] };
const HALL_ROWS = { salon: 2, concert: 3, opera: 4 };

const recital = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { hall: rollW(rnd, HALL_W, band), keys: new Float32Array(24), keyCol: new Uint8Array(24), hands: [0.35, 0.6], hx: [0, 0], petals: [], forte: 0, flick: 0, glint: 0, glintI: 0, ova: 0, ovaT: 0, flash: 0, heads: Array.from({ length: 60 }, () => rnd()), claps: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), g = 0.72 * N, lx = 0.42 * N, bps = bpsOf(f), rows = HALL_ROWS[w.hall];
    for (const hh of hits) {
      if (isTonal(hh)) { const i = hh.pc + 12 * (hash(f.beat.count, hh.pc) < 0.5 ? 0 : 1); w.keys[i] = 1; w.keyCol[i] = PC_COL[hh.pc]; w.hands[i < 12 ? 0 : 1] = i / 24; }
      if (isLow(hh)) w.forte = Math.max(w.forte, hh.strength);
      else if (hh.kind === 'snare') w.flick = 1;
      else if (hh.kind === 'hat') { w.glint = 0.1; w.glintI = Math.floor(rnd() * 12); }
    }
    if (f.section === 'drop') { w.ova = 8 / bps; w.ovaT = 0; w.flash = 0.07; }
    else if (f.section === 'change') w.hall = rollW(rnd, HALL_W, band);
    w.forte *= Math.exp(-dt * 4); w.flick *= Math.exp(-dt * 6); w.glint -= dt; w.ova -= dt; w.ovaT += dt;
    for (let i = 0; i < 24; i++) w.keys[i] *= Math.exp(-dt * 3);
    const rise = w.ova > 0 ? ease(w.ovaT * 1.5) : ease(1 + w.ova * 1.2), lit = clamp(0.5 + 0.5 * f.level + w.forte);
    // the hall: dark, the chandelier (not in the salon), the spotlight down onto the stage, the pool of light
    if (w.hall !== 'salon') for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU, tier = k % 3, cx = 0.72 * N + Math.cos(a) * (0.05 + 0.02 * tier) * N, cy = 0.06 * N + tier * 0.025 * N + Math.sin(a) * 0.012 * N; r.line(cx, cy - 0.02 * N, cx, cy, LMID + DIM); r.disc(cx, cy, 1.2 * u, w.glint > 0 && k === w.glintI ? BRIGHT : LMID); }
    r.poly([[lx - 0.03 * N, 0], [lx + 0.03 * N, 0], [lx + 0.32 * N, g], [lx - 0.3 * N, g]], lit > 0.9 ? LMID : lit > 0.6 ? LMID + DIM : MID + DIM);
    r.rect(0, g, N, 0.04 * N, DARK);
    r.ring(lx, g, 0.16 * N, 0.32 * N, lit > 0.8 ? LMID : LMID + DIM, 0.15);
    r.rect(0, g + 0.04 * N, N, N - g - 0.04 * N, BG);
    // the piano: the wing of the body, the lid propped open, the hammers inside, the keys along the front
    const kx0 = 0.22 * N, kw = 0.3 * N, ky = g - 0.13 * N;
    for (const px of [kx0 + 0.02 * N, kx0 + kw - 0.02 * N, 0.6 * N]) r.rect(px - u, ky, 2 * u, g - ky, FIG);
    r.poly([[kx0, ky], [kx0 + kw, ky], [0.64 * N, g - 0.3 * N], [0.56 * N, g - 0.42 * N], [0.3 * N, g - 0.36 * N], [0.2 * N, g - 0.24 * N]], FIG);
    r.poly([[0.3 * N, g - 0.36 * N], [0.56 * N, g - 0.42 * N], [0.5 * N, g - 0.62 * N], [0.28 * N, g - 0.56 * N]], DARK);
    r.line(0.3 * N, g - 0.36 * N, 0.28 * N, g - 0.56 * N, LMID + DIM); r.line(0.56 * N, g - 0.42 * N, 0.5 * N, g - 0.62 * N, LMID + DIM);
    r.line(0.5 * N, g - 0.4 * N, 0.52 * N, g - 0.56 * N, LMID); // the prop stick
    for (let i = 0; i < 12; i++) { const hx = 0.31 * N + (i / 12) * 0.23 * N, jump = Math.max(w.keys[i], w.keys[i + 12]) * 2.5 * u; r.rect(hx, g - 0.38 * N - (i / 12) * 0.03 * N - jump, Math.max(1, u), 2 * u, jump > u ? BRIGHT : LMID + DIM); }
    r.rect(kx0 - u, ky - 3 * u, kw + 2 * u, 3 * u, FIG);
    for (let i = 0; i < 24; i++) { const x = kx0 + (i / 24) * kw; r.rect(x, ky - 2.5 * u, kw / 24 - u * 0.4, 2.5 * u, w.keys[i] > 0.1 ? w.keyCol[i] : BLACKKEY[i % 12] ? DARK : BRIGHT); }
    // the pianist from behind, on the bench, leaning in on a forte; the hands at the notes
    const px = kx0 + kw * 0.5, ph = 0.2 * N, lean = w.forte * ph * 0.08;
    r.rect(px - ph * 0.25, g - ph * 0.3, ph * 0.5, ph * 0.3, DARK);
    r.rect(px - ph * 0.22, ky - ph * 0.4 + lean, ph * 0.44, ph * 0.45 - lean, FIG);
    r.disc(px, ky - ph * 0.52 + lean, ph * 0.12, FIG);
    for (const k of [0, 1]) { w.hx[k] = follow(w.hx[k] || kx0 + w.hands[k] * kw, kx0 + w.hands[k] * kw, dt, 0.07); r.stroke(px + (k ? 1 : -1) * ph * 0.2, ky - ph * 0.3 + lean, w.hx[k], ky - 3 * u, Math.max(1, ph * 0.07), FIG); r.disc(w.hx[k], ky - 3 * u, ph * 0.04, FIG); }
    targets.push({ x: kx0, y: g - 0.62 * N, w: 0.44 * N, h: 0.62 * N });
    // the violinist: the bow slides across the strings with the mid clock, a flick on the snare
    const vx = 0.8 * N, vh = 0.3 * N, J = walker(r, vx, g, vh, FIG, 0, -1, {}), chin = J.head + vh * 0.14, bo = Math.sin(f.rel.midClock * 2) * 0.45 + w.flick * 0.3;
    r.stroke(vx - vh * 0.08, chin, vx - vh * 0.36, chin - vh * 0.06, Math.max(1, vh * 0.04), DARK);
    r.disc(vx - vh * 0.1, chin, vh * 0.07, DARK);
    r.stroke(vx + vh * 0.12, J.sy + vh * 0.06, vx - vh * 0.3, chin - vh * 0.05, Math.max(1, vh * 0.05), FIG); // the left arm along the neck
    const bcx = vx - vh * 0.13, bcy = chin - vh * 0.02, bl = vh * 0.3, bax = Math.cos(0.9), bay = Math.sin(0.9);
    r.line(bcx - bax * bl * (0.5 + bo), bcy + bay * bl * (0.5 + bo), bcx + bax * bl * (0.5 - bo), bcy - bay * bl * (0.5 - bo), LMID);
    r.stroke(vx + vh * 0.12, J.sy + vh * 0.06, bcx + bax * bl * (0.5 - bo), bcy - bay * bl * (0.5 - bo), Math.max(1, vh * 0.05), FIG); // the bow arm to the frog
    targets.push({ x: vx - vh * 0.45, y: g - vh * 1.05, w: vh * 0.8, h: vh * 1.05 });
    // the petals: down through the light at a terminal speed, drifting; brighter in the beam
    if (w.petals.length < 14 + 24 * f.level && rnd() < 9 * dt) w.petals.push({ x: lx + (rnd() - 0.5) * 0.1 * N, y: 0, vx: 0, vy: 0, ph: rnd() * TAU });
    w.petals = w.petals.filter((p) => { p.vy = Math.min(N * 0.07, p.vy + G(N) * dt); p.vx = follow(p.vx, Math.sin(t * 1.2 + p.ph) * N * 0.04, dt, 0.6); p.x += p.vx * dt; p.y += p.vy * dt; const inBeam = Math.abs(p.x - lx) < 0.03 * N + 0.29 * N * (p.y / g); r.rect(p.x, p.y, Math.max(1, 1.5 * u), Math.max(1, u), inBeam ? BRIGHT : MID + DIM); return p.y < g; });
    // the audience, far rows first, the near ones lower and bigger over them; on the ovation they rise, clapping
    for (let row = 0; row < rows; row++) {
      const y = (0.8 + row * 0.065) * N - rise * 0.05 * N, hr = (2.2 + row * 0.9) * u, n = 8 + row * 3;
      for (let i = 0; i < n; i++) { const x = ((i + 0.5) / n) * N + (w.heads[(row * 13 + i) % 60] - 0.5) * 3 * u, bob = rise > 0 ? Math.sin(t * 9 + i) * u * rise : 0; r.disc(x, y + bob, hr, w.ova > 0 ? DARK : BLACK); r.rect(x - hr * 1.6, y + hr * 0.7 + bob, hr * 3.2, N - y, w.ova > 0 ? DARK : BLACK); if (rise > 0.5 && hash(i, Math.floor(t * 8) + row) < 0.3) r.rect(x + hr * 0.8, y - hr * 1.2, Math.max(1, u), Math.max(1, u), BRIGHT); }
    }
    if (w.flash > 0) { w.flash -= dt; r.fill(WHITE); }
  },
};

// ---------------------------------------------------------------------------------------------- transmutation circle
// An alchemy circle on the ground (rings, inscribed polygons, marks that are not letters) and a figure beside it
// that claps on the beat and presses its hands to the ground on the kicks: the circle lights with arcs of lightning
// and the ground inside rises into pillars and spikes that grow, hold a beat or two, and crumble back to rubble
// under gravity; the notes light the rings in their colours. A drop opens the great gate behind: the doors swing
// inward in perspective, the dark doorway shows and shadow tendrils reach out of it toward the figure, then the
// doors close. Kinds: the circle.
const CIRCLE_W = { simple: [3, 2, 1], double: [2, 2, 2], grand: [1, 2, 3] };
const CIRCLES = { simple: { rings: 2, sides: 3 }, double: { rings: 3, sides: 4 }, grand: { rings: 4, sides: 6 } };

const transmutation = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, CIRCLE_W, band), lit: 0, arcT: 0, press: 0, pillars: [], rubble: [], ringCol: [], ringLife: new Float32Array(4), gate: 0, gateT: 0, rot: 0, tend: Array.from({ length: 6 }, () => rnd()) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.4 * N, cx = 0.5 * N, cy = 0.76 * N, R = 0.3 * N, sy = 0.36, C = CIRCLES[w.kind], bps = bpsOf(f), grav = G(N);
    for (const hh of hits) {
      if (isLow(hh)) {
        w.lit = Math.max(w.lit, hh.strength); w.arcT = 0.12; w.press = 1; s.shake = Math.max(s.shake, 0.2 * hh.strength);
        for (let k = 0, n = 1 + Math.round(hh.strength * 2); k < n; k++) { const a = rnd() * TAU, rad = 0.15 + rnd() * 0.7; w.pillars.push({ x: cx + Math.cos(a) * R * rad, y: cy + Math.sin(a) * R * rad * sy, h: 0, hmax: (0.08 + rnd() * 0.18) * N * (0.6 + rad * 0.4), w: (2 + rnd() * 4) * u, spike: rnd() < 0.5, mode: 0, hold: 0.4 + 1 / bps, crumbT: 0 }); }
      } else if (isTonal(hh)) { const k = hh.pc % C.rings; w.ringCol[k] = PC_COL[hh.pc]; w.ringLife[k] = 1; }
    }
    if (f.section === 'drop' && w.gate <= 0) { w.gateT = 0; w.gate = 0.001; }
    else if (f.section === 'change') { w.kind = rollW(rnd, CIRCLE_W, band); for (const p of w.pillars) p.mode = 2; }
    w.lit *= Math.exp(-dt * 3); w.arcT -= dt; w.press *= Math.exp(-dt * 5); w.rot += dt * 0.15 * (0.3 + f.rel.midDrive);
    for (let k = 0; k < 4; k++) w.ringLife[k] *= Math.exp(-dt * 2);
    if (w.gate > 0) { w.gateT += dt; const hold = 8 / bps; w.gate = w.gateT < 1.5 ? w.gateT / 1.5 : w.gateT < 1.5 + hold ? 1 : Math.max(0, 1 - (w.gateT - 1.5 - hold) / 2); if (w.gateT > 1.5 + hold + 2) w.gate = 0; }
    // the night plain, the great gate at the back (its doors swing inward in perspective when it opens)
    skyBands(r, N, hz, [BG, BG, DARK + DIM, DARK]);
    for (let k = 0; k < 30; k++) r.set(hash(k, 1) * N, hash(k, 2) * hz * 0.9, hash(k, 3 + Math.floor(t * 2)) < 0.8 ? MID : LMID);
    r.rect(0, hz, N, N - hz, MID + DIM);
    const gx0 = cx - 0.2 * N, gx1 = cx + 0.2 * N, gtop = hz - 0.33 * N, gbot = hz + 0.02 * N, phi = ease(w.gate) * 1.35;
    r.rect(gx0, gtop, gx1 - gx0, gbot - gtop, BLACK); // the doorway
    if (w.gate > 0) for (let k = 0; k < 8; k++) if (hash(k, Math.floor(t * 6)) < 0.5) r.set(gx0 + 0.1 * N + hash(k, 7) * 0.2 * N, gtop + 0.05 * N + hash(k, 8) * 0.2 * N, HOT + DIM); // eyes in the dark
    for (const [hx, sg] of [[gx0, 1], [gx1, -1]]) { const fx = hx + sg * 0.2 * N * Math.cos(phi), sc = 1 / (1 + 0.6 * Math.sin(phi)); r.poly([[hx, gtop], [hx, gbot], [fx, hz + (gbot - hz) * sc], [fx, hz + (gtop - hz) * sc]], DARK); r.line(fx, hz + (gtop - hz) * sc, fx, hz + (gbot - hz) * sc, LMID + DIM); } // the free edge recedes toward the horizon: its foot stays on the ground
    for (const px of [gx0 - 0.04 * N, gx1]) { r.rect(px, gtop - 0.04 * N, 0.04 * N, gbot - gtop + 0.04 * N, DARK + DIM); r.rect(px, gtop - 0.04 * N, 0.04 * N, 2 * u, LMID + DIM); }
    r.rect(gx0 - 0.06 * N, gtop - 0.06 * N, gx1 - gx0 + 0.12 * N, 0.04 * N, DARK + DIM);
    r.poly([[gx0 - 0.06 * N, gtop - 0.06 * N], [gx1 + 0.06 * N, gtop - 0.06 * N], [cx, gtop - 0.14 * N]], DARK + DIM);
    // the circle: the rings lit by the kicks and the notes, the inscribed polygon turning slowly, the marks
    const base = w.lit > 0.6 ? BRIGHT : w.lit > 0.25 ? COOL : COOL + DIM;
    for (let k = 0; k < C.rings; k++) { const rk = R * (1 - k * (0.7 / C.rings)); r.ring(cx, cy, rk, Math.max(1, 1.2 * u), w.ringLife[k] > 0.15 ? w.ringCol[k] : base, sy); }
    const pts = Array.from({ length: C.sides }, (_, i) => { const a = (i / C.sides) * TAU + w.rot; return [cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95 * sy]; });
    for (let i = 0; i < C.sides; i++) { const q = pts[(i + (C.sides > 4 ? 2 : 1)) % C.sides]; r.line(pts[i][0], pts[i][1], q[0], q[1], base); }
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU - w.rot * 0.5, l = (1.5 + 2 * hash(i, 1)) * u; r.line(cx + Math.cos(a) * (R - l), cy + Math.sin(a) * (R - l) * sy, cx + Math.cos(a) * (R + l), cy + Math.sin(a) * (R + l) * sy, base); }
    r.ring(cx, cy, R * 0.12, Math.max(1, u), base, sy);
    if (w.arcT > 0) for (let k = 0; k < 3; k++) { // the arcs: jagged, redrawn every few frames, up off the ring
      const seed = Math.floor(t * 30) * 5 + k, a = hash(seed, 1) * TAU;
      let x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R * sy;
      const top = y - (0.1 + 0.15 * hash(seed, 2)) * N;
      for (let i = 0; i < 5; i++) { const nx = x + (hash(seed, 10 + i) - 0.5) * 8 * u, ny = y + (top - y) / (5 - i); r.line(x, y, nx, ny, i < 3 ? BRIGHT : COOL); x = nx; y = ny; }
    }
    // the shadow tendrils out of the doorway toward the figure, as far as the gate is open
    const fx = cx - R * 1.3, fh = 0.26 * N;
    if (w.gate > 0) for (let k = 0; k < 6; k++) {
      const x0 = gx0 + 0.04 * N + w.tend[k] * 0.32 * N, y0 = gbot, tx = fx + fh * 0.2, ty = hz + (0.86 - 0.4) * N * 0.6, len = ease(w.gate) * (0.55 + 0.45 * hash(k, 3)), n = 7;
      let lx = x0, ly = y0;
      for (let i = 1; i <= n; i++) { const q = (i / n) * len, px = x0 + (tx - x0) * q + Math.sin(q * 7 + t * 3 + k) * 6 * u * q, py = y0 + (ty - y0) * q + Math.cos(q * 5 + t * 2.5 + k) * 3 * u * q; r.stroke(lx, ly, px, py, Math.max(1, (3 - 2 * q) * u), BLACK); lx = px; ly = py; }
      for (const d of [-0.5, 0, 0.5]) r.line(lx, ly, lx + Math.cos(d + 0.3 + k) * 4 * u, ly + Math.sin(d + 0.3 + k) * 3 * u, BLACK);
    }
    // the figure: hands together on the beat, down onto the ground on a kick
    const hgt = fh * (1 - 0.25 * clamp(w.press * 1.5)), J = walker(r, fx, cy + 0.04 * N, hgt, FIG, 0, 1, { coat: true }), chest = J.sy + hgt * 0.15;
    if (w.press > 0.3) for (const k of [-1, 1]) r.stroke(fx + k * J.hw * 0.8, J.sy, fx + fh * 0.35 + k * fh * 0.06, cy + 0.03 * N, Math.max(1, hgt * 0.07), FIG);
    else { const sp = (1 - f.beat.pulse) * hgt * 0.14; for (const k of [-1, 1]) { r.stroke(fx + k * J.hw * 0.8, J.sy, fx + fh * 0.2 + k * sp, chest, Math.max(1, hgt * 0.07), FIG); r.disc(fx + fh * 0.2 + k * sp, chest, hgt * 0.045, FIG); } }
    targets.push({ x: fx - fh * 0.4, y: cy + 0.04 * N - fh * 1.05, w: fh * 0.8, h: fh * 1.05 });
    // the pillars and spikes inside the circle, far ones first: they shoot up, hold, and crumble into rubble
    w.pillars.sort((a, b) => a.y - b.y);
    w.pillars = w.pillars.filter((p) => {
      if (p.mode === 0) { p.h = follow(p.h, p.hmax, dt, 0.08); if (p.h > p.hmax * 0.97) { p.mode = 1; } }
      else if (p.mode === 1) { if ((p.hold -= dt) <= 0) p.mode = 2; }
      else { p.h -= N * 0.6 * dt; if ((p.crumbT += dt) > 0.05) { p.crumbT = 0; w.rubble.push({ x: p.x + (rnd() - 0.5) * p.w, y: p.y - p.h, vx: (rnd() - 0.5) * N * 0.25, vy: -rnd() * N * 0.1, life: 1, g: p.y }); } }
      if (p.h <= 0) return false;
      const tw = p.spike ? p.w * 0.25 : p.w;
      r.poly([[p.x - p.w, p.y], [p.x + p.w, p.y], [p.x + tw, p.y - p.h], [p.x - tw, p.y - p.h]], DARK);
      r.poly([[p.x - p.w, p.y], [p.x - p.w * 0.4, p.y], [p.x - tw * 0.4, p.y - p.h], [p.x - tw, p.y - p.h]], LMID + DIM);
      r.ring(p.x, p.y, p.w, Math.max(1, u), w.lit > 0.4 ? BRIGHT : DARK + DIM, 0.35);
      return true;
    });
    w.rubble = w.rubble.filter((p) => { p.vy += grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.y > p.g) { p.y = p.g; p.vy = 0; p.vx = 0; } r.rect(p.x, p.y - u, Math.max(1, u), Math.max(1, u), DARK); return p.life > 0; });
  },
};

// ---------------------------------------------------------------------------------------------- casino
// A casino table under a chandelier: the roulette wheel is spun every eight beats and slows as a real wheel does
// (its angular speed decays), the ball runs the rim the other way, loses speed, spirals inward and drops into a
// pocket timed to land on a beat, then turns with the wheel. Cards are flung on the snares and spin and slide to a
// stop on the felt (friction), a chip is tossed onto a stack on every beat (a small parabola), the dealer's hands
// go where the work is, the chandelier glints on the hats. A drop is all-in: chips cascade from the dealer's end,
// bounce on the felt and settle. Kinds: the felt.
const FELT_W = { green: [3, 2, 1], red: [2, 2, 2], blue: [1, 2, 3] };
const FELT_COL = { green: COOL + DIM, red: HOT + DIM, blue: DARK };

const casino = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { felt: rollW(rnd, FELT_W, band), wheelA: 0, om: 0, ball: null, cards: [], toss: [], loose: [], glint: 0, glintI: 0, spinCount: 0, handL: 0, handR: 0, spinFlash: 0,
      stacks: Array.from({ length: 3 + band }, (_, i) => ({ x: (0.18 + i * (0.64 / (2 + band))) , n: 2 + Math.floor(rnd() * 5), c: [HOT, BRIGHT, COOL][i % 3] })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), cx = 0.5 * N, cy = 0.5 * N, R = 0.17 * N, sy = 0.55, grav = G(N), bps = bpsOf(f), hx = 0.42 * N, hy = 0.3 * N;
    for (const hh of hits) {
      if (hh.kind === 'snare') { const dir = rnd() < 0.5 ? -1 : 1; w.cards.push({ x: 0.58 * N, y: 0.32 * N, vx: dir * N * (0.25 + rnd() * 0.5), vy: N * (0.45 + 0.4 * hh.strength), rot: 0, om: dir * (8 + rnd() * 8), pip: rnd() < 0.5 ? HOT : DARK, age: 0 }); w.handR = 1; w.handDir = dir; }
      else if (hh.kind === 'hat') { w.glint = 0.1; w.glintI = Math.floor(rnd() * 7); }
    }
    if (f.section === 'drop') { for (let k = 0; k < 50; k++) w.loose.push({ x: cx + (rnd() - 0.5) * 0.3 * N, y: 0.3 * N - rnd() * 0.1 * N, vx: (rnd() - 0.5) * N * 0.5, vy: N * (0.1 + rnd() * 0.3), land: (0.62 + rnd() * 0.33) * N, c: [HOT, BRIGHT, COOL][k % 3], life: 6 + rnd() * 3, delay: rnd() * 0.8 }); if (w.loose.length > 150) w.loose.splice(0, w.loose.length - 150); }
    else if (f.section === 'change') w.felt = rollW(rnd, FELT_W, band);
    if (beatTick(w, f, dt)) {
      if (w.spinCount++ % 8 === 0 && !w.ball) { w.om = 5 + rnd() * 3; w.ball = { a: w.wheelA + Math.PI, om: -(9 + rnd() * 3), T: 6 / bps, t: 0, c0: f.beat.count, pocket: -1 }; w.handL = 1; w.spinFlash = 0.2; } // every eighth beat: the wheel goes round, the ball the other way, timed to drop six beats on
      const st = pick(rnd, w.stacks), T = 0.35, x0 = 0.5 * N, y0 = 0.3 * N, tx = st.x * N, ty = 0.86 * N - st.n * 1.2 * u;
      w.toss.push({ x: x0, y: y0, vx: (tx - x0) / T, vy: (ty - y0) / T - 0.5 * grav * T, t: 0, T, st });
    }
    w.om *= Math.exp(-dt * 0.22); w.om = Math.max(0, w.om - 0.04 * dt); w.wheelA += w.om * dt;
    w.glint -= dt; w.spinFlash -= dt; w.handL *= Math.exp(-dt * 1.5); w.handR *= Math.exp(-dt * 3);
    // the room: the chandelier, the dealer behind the table, the felt and its rim
    r.rect(0.3 * N, 0.04 * N, 0.4 * N, Math.max(1, u), LMID + DIM);
    for (let k = 0; k < 7; k++) { const lx = (0.32 + k * 0.06) * N, len = (0.03 + 0.02 * Math.sin(k * 1.3)) * N; r.rect(lx - u * 0.5, 0.04 * N, Math.max(1, u), len, LMID + DIM); r.disc(lx, 0.04 * N + len, 1.5 * u, w.glint > 0 && k === w.glintI ? BRIGHT : f.beat.pulse > 0.7 ? LMID : LMID + DIM); if (w.glint > 0 && k === w.glintI) for (const d of [0, Math.PI / 2]) r.line(lx + Math.cos(d) * 4 * u, 0.04 * N + len + Math.sin(d) * 4 * u, lx - Math.cos(d) * 4 * u, 0.04 * N + len - Math.sin(d) * 4 * u, BRIGHT); }
    r.rect(0.38 * N, 0.14 * N, 0.24 * N, 0.14 * N, DARK); r.disc(0.5 * N, 0.13 * N, 0.045 * N, FIG); r.rect(0.47 * N, 0.17 * N, 0.06 * N, 0.09 * N, FIG);
    r.rect(0, 0.26 * N, N, N - 0.26 * N, FELT_COL[w.felt]);
    r.rect(0, 0.26 * N, N, 3 * u, LMID + DIM); r.rect(0, 0.29 * N, N, Math.max(1, u), BLACK);
    for (let k = 0; k < 5; k++) r.frame(Math.round((0.1 + k * 0.17) * N), Math.round(0.68 * N), Math.round(0.12 * N), Math.round(0.08 * N), LMID + DIM); // the betting boxes
    // the wheel: the rim, the pockets turning with it, the hub, the ball on its run or in its pocket
    r.ring(cx, cy, R * 0.5, R, DARK, sy); r.ring(cx, cy, R * 1.04, Math.max(2, 3 * u), LMID, sy);
    for (let i = 0; i < 24; i++) { const a = w.wheelA + (i / 24) * TAU, c = i === 0 ? COOL : i % 2 ? HOT : DARK + DIM; r.stroke(cx + Math.cos(a) * R * 0.7, cy + Math.sin(a) * R * 0.7 * sy, cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95 * sy, Math.max(1, R * 0.11), c); }
    r.ring(cx, cy, R * 0.25, R * 0.5, MID, sy);
    for (let k = 0; k < 4; k++) { const a = w.wheelA + (k / 4) * TAU; r.line(cx, cy, cx + Math.cos(a) * R * 0.45, cy + Math.sin(a) * R * 0.45 * sy, k % 2 ? BRIGHT : LMID); }
    r.disc(cx, cy, 2 * u, BRIGHT);
    if (w.ball) {
      const B = w.ball;
      B.t += dt;
      const q = beatLocked(f) ? (f.beat.count >= B.c0 + 6 ? 1 : Math.min(0.999, (f.beat.count + f.beat.phase - B.c0) / 6)) : Math.min(1, B.t / B.T); // six beats on the beat grid itself when there is one: the drop is the frame of the sixth beat
      if (q < 1) { const sm = q * q * (3 - 2 * q); B.om2 = B.om * (1 - q) + w.om * q; B.a += B.om2 * dt; B.r = R * (1 - 0.18 * sm); } // the spiral ends at the pocket radius: no jump as it drops in
      else { if (B.pocket < 0) { B.pocket = ((Math.round(((B.a - w.wheelA) / TAU) * 24) % 24) + 24) % 24; B.flash = 0.3; } B.a = w.wheelA + (B.pocket / 24) * TAU; B.r = R * 0.82; } // the pocket as 0..23, so the landing is seen as one
      B.flash = (B.flash || 0) - dt;
      r.disc(cx + Math.cos(B.a) * B.r, cy + Math.sin(B.a) * B.r * sy, 1.4 * u, B.flash > 0 ? HOT : BRIGHT);
      if (B.flash > 0) r.ring(cx, cy, R * 1.04 + (0.3 - B.flash) * 0.3 * N, Math.max(1, u), BRIGHT, sy);
      if (B.pocket >= 0 && B.t > B.T + 3 && w.om < 0.2) w.ball = null; // the croupier lifts it once the wheel has all but stopped
    }
    targets.push({ x: cx - R, y: cy - R * sy, w: 2 * R, h: 2 * R * sy });
    // the dealer's hands: one at the wheel for the spin, one flinging the cards, both back to rest after
    const lhx = lerp(hx, cx - R * 0.8, w.handL), lhy = lerp(hy, cy - R * sy * 0.5, w.handL), rhx = lerp(0.58 * N, 0.58 * N + (w.handDir || 1) * 0.08 * N, w.handR), rhy = lerp(hy, 0.38 * N, w.handR);
    for (const [px, py] of [[lhx, lhy], [rhx, rhy]]) { r.disc(px, py, 2.5 * u, LMID); for (let k = -1; k <= 1; k++) r.line(px + k * 1.5 * u, py + 2 * u, px + k * 2 * u, py + 5 * u, LMID); }
    // the cards: they fly, spin and slide to a stop (the felt's friction takes a steady bite out of the speed and the spin
    // until both are gone); the chips tossed onto the stacks; the stacks
    w.cards = w.cards.filter((c) => {
      const sp = Math.hypot(c.vx, c.vy), k = sp > N * 0.9 * dt ? (sp - N * 0.9 * dt) / sp : 0;
      c.vx *= k; c.vy *= k; c.om = Math.sign(c.om) * Math.max(0, Math.abs(c.om) - 16 * dt); c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.om * dt; c.age += dt;
      const P = rotAt(c.x, c.y, c.rot), cw = 3 * u, ch = 4 * u;
      r.poly([P(-cw, -ch), P(cw, -ch), P(cw, ch), P(-cw, ch)], BRIGHT);
      r.rect(c.x - u, c.y - u, Math.max(1, 2 * u), Math.max(1, 2 * u), c.pip);
      return c.age < 8 && c.y < N && c.x > 0 && c.x < N;
    }).slice(-14);
    w.toss = w.toss.filter((p) => { p.t += dt; p.vy += grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; r.ring(p.x, p.y, 1.2 * u, 2.4 * u, p.st.c, 0.45); if (p.t >= p.T) { p.st.n = p.st.n >= 14 ? 1 : p.st.n + 1; return false; } return true; });
    for (const st of w.stacks) { const x = st.x * N, y = 0.86 * N; for (let i = 0; i < st.n; i++) r.ring(x, y - i * 1.2 * u, 1.4 * u, 2.8 * u, i % 3 === 2 ? LMID : st.c, 0.45); r.ring(x, y - st.n * 1.2 * u, 1.4 * u, 2.8 * u, BRIGHT, 0.45); }
    // the all-in cascade: chips poured from the far end, each falling to its own spot on the felt and bouncing
    w.loose = w.loose.filter((p) => {
      if ((p.delay -= dt) > 0) return true;
      p.vy += grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.y >= p.land) { p.y = p.land; p.vy = -p.vy * 0.4; p.vx *= 0.6; if (Math.abs(p.vy) < N * 0.05) { p.vy = 0; p.vx = 0; } }
      r.ring(p.x, p.y, 1.2 * u, 2.4 * u, p.c, 0.45);
      return p.life > 0;
    });
  },
};

// ---------------------------------------------------------------------------------------------- giant chess
// A chessboard the size of a plain under a vast sky, giant pieces on it: one of them moves one square per bar,
// sliding, its shadow under it, the others glowing in the colour of each note's pitch class, the clouds sliding on
// the mid clock. On a drop the mover takes a neighbour: the taken piece shatters into fragments that fall under
// gravity onto the board, and a new piece rises on the far rank at the next section. Kinds: the set, classic,
// abstract or creatures.
const SET_W = { classic: [3, 2, 1], abstract: [2, 2, 2], creatures: [1, 2, 3] };

// a piece of `set` and `type` (0 pawn, 1 rook, 2 bishop, 3 knight, 4 queen, 5 king) with its base at (x, by), `hs` tall
function chessPiece(r, set, type, x, by, hs, ws, col, u) {
  r.ring(x, by, ws * 0.5, ws, col, 0.3);
  if (set === 'classic') {
    const top = [0.5, 0.75, 0.85, 0.4, 0.9, 0.95][type] * hs;
    r.poly([[x - ws * 0.35, by], [x + ws * 0.35, by], [x + ws * (type === 1 ? 0.4 : 0.22), by - top], [x - ws * (type === 1 ? 0.4 : 0.22), by - top]], col);
    if (type === 0) r.disc(x, by - hs * 0.6, ws * 0.3, col);
    else if (type === 1) for (const k of [-1, 0, 1]) r.rect(x + k * ws * 0.3 - ws * 0.1, by - hs * 0.9, ws * 0.2, hs * 0.15, col);
    else if (type === 2) { r.ring(x, by - hs * 0.9, ws * 0.1, ws * 0.3, col, 1.4); r.line(x - ws * 0.05, by - hs * 1.05, x + ws * 0.1, by - hs * 0.85, LMID + DIM); }
    else if (type === 3) r.poly([[x - ws * 0.3, by - hs * 0.4], [x + ws * 0.3, by - hs * 0.4], [x + ws * 0.45, by - hs * 0.85], [x + ws * 0.1, by - hs * 0.98], [x - ws * 0.42, by - hs * 0.72]], col);
    else if (type === 4) for (const k of [-1, 0, 1]) r.poly([[x + k * ws * 0.2 - ws * 0.1, by - hs * 0.9], [x + k * ws * 0.2 + ws * 0.1, by - hs * 0.9], [x + k * ws * 0.2, by - hs * 1.1]], col);
    else { r.rect(x - ws * 0.05, by - hs * 1.2, ws * 0.1, hs * 0.25, col); r.rect(x - ws * 0.18, by - hs * 1.12, ws * 0.36, hs * 0.08, col); }
  } else if (set === 'abstract') {
    if (type === 0) { r.rect(x - ws * 0.15, by - hs * 0.3, ws * 0.3, hs * 0.3, col); r.disc(x, by - hs * 0.5, ws * 0.3, col); }
    else if (type === 1) r.rect(x - ws * 0.42, by - hs * 0.7, ws * 0.84, hs * 0.7, col);
    else if (type === 2) r.poly([[x - ws * 0.35, by], [x + ws * 0.35, by], [x, by - hs]], col);
    else if (type === 3) { r.rect(x - ws * 0.4, by - hs * 0.45, ws * 0.5, hs * 0.45, col); r.rect(x - ws * 0.4, by - hs * 0.9, ws * 0.8, hs * 0.45, col); }
    else if (type === 4) { r.poly([[x - ws * 0.3, by], [x + ws * 0.3, by], [x, by - hs * 1.1]], col); r.ring(x, by - hs * 0.6, ws * 0.35, Math.max(1, u), LMID, 0.4); }
    else { r.rect(x - ws * 0.22, by - hs * 1.05, ws * 0.44, hs * 1.05, col); r.disc(x, by - hs * 1.1, ws * 0.3, col); }
  } else {
    const eye = (ex, ey) => r.rect(ex - u * 0.5, ey - u * 0.5, Math.max(1, u), Math.max(1, u), HOT);
    if (type === 0) { r.disc(x, by - hs * 0.3, ws * 0.4, col); eye(x + ws * 0.15, by - hs * 0.35); }
    else if (type === 1) { r.ring(x, by - hs * 0.1, ws * 0.3, ws * 0.6, col, 0.8); for (const k of [-1, 1]) r.rect(x + k * ws * 0.45 - ws * 0.1, by - hs * 0.15, ws * 0.2, hs * 0.15, col); eye(x + ws * 0.3, by - hs * 0.3); }
    else if (type === 2) { r.poly([[x - ws * 0.35, by], [x + ws * 0.35, by], [x + ws * 0.15, by - hs * 0.9], [x - ws * 0.15, by - hs * 0.9]], col); r.disc(x, by - hs * 0.9, ws * 0.22, col); eye(x, by - hs * 0.9); }
    else if (type === 3) { r.poly([[x - ws * 0.3, by], [x + ws * 0.3, by], [x + ws * 0.5, by - hs * 0.8], [x + ws * 0.1, by - hs * 1.05], [x - ws * 0.4, by - hs * 0.7]], col); for (const k of [-1, 1]) r.poly([[x + k * ws * 0.2, by - hs * 0.5], [x + k * ws * 0.9, by - hs * 0.95], [x + k * ws * 0.6, by - hs * 0.35]], col); eye(x + ws * 0.2, by - hs * 0.85); }
    else if (type === 4) { r.disc(x, by - hs * 0.5, ws * 0.38, col); for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + (k - 1.5) * 0.7; r.stroke(x, by - hs * 0.55, x + Math.cos(a) * hs * 0.5, by - hs * 0.55 + Math.sin(a) * hs * 0.5, Math.max(1, ws * 0.12), col); } eye(x - ws * 0.1, by - hs * 0.5); eye(x + ws * 0.1, by - hs * 0.5); }
    else { r.rect(x - ws * 0.3, by - hs * 0.9, ws * 0.6, hs * 0.9, col); for (const k of [-1, 1]) r.poly([[x + k * ws * 0.3, by - hs * 0.9], [x + k * ws * 0.5, by - hs * 1.2], [x + k * ws * 0.05, by - hs * 0.9]], col); eye(x - ws * 0.12, by - hs * 0.75); eye(x + ws * 0.12, by - hs * 0.75); }
  }
}

const giantchess = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), pieces = [];
    const taken = new Set();
    for (let i = 0; i < 6; i++) { let c, k; do { c = Math.floor(rnd() * 8); k = Math.floor(rnd() * 6) + 1; } while (taken.has(c * 8 + k)); taken.add(c * 8 + k); pieces.push({ c, k, type: Math.floor(rnd() * 6), side: i % 2, glow: 0, gc: HOT, born: 1 }); }
    Object.assign(w, { set: rollW(rnd, SET_W, band), pieces, move: null, who: 0, frags: [], capture: false, newOne: 0, clouds: Array.from({ length: 4 }, () => [rnd(), 0.05 + rnd() * 0.2, 0.06 + rnd() * 0.08]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.42 * N, F = 0.5 * N, Z0 = 1.3, P = groundProj(0.5 * N, hz, F), grav = G(N);
    const at = (c, k) => w.pieces.find((p) => p.c === c && p.k === k && p !== (w.move && w.move.p));
    for (const hh of hits) if (isTonal(hh) && w.pieces.length) { const p = w.pieces[(hh.pc + f.beat.count) % w.pieces.length]; p.glow = 1; p.gc = PC_COL[hh.pc]; }
    if (f.section === 'drop') w.capture = true;
    else if (f.section === 'change') { w.set = rollW(rnd, SET_W, band); if (w.pieces.length < 6) { let c = Math.floor(rnd() * 8); while (at(c, 7)) c = (c + 1) % 8; w.pieces.push({ c, k: 7, type: Math.floor(rnd() * 6), side: w.pieces.length % 2, glow: 0, gc: HOT, born: 0 }); } }
    for (const p of w.pieces) { p.glow *= Math.exp(-dt * 1.5); p.born = Math.min(1, p.born + dt); }
    // one square per bar: the mover slides to a free neighbour; on a drop it slides onto the nearest other piece
    if (barTick(w, f, dt) && !w.move && w.pieces.length) {
      const p = w.pieces[w.who++ % w.pieces.length];
      let tgt = null;
      if (w.capture && w.pieces.length > 1) { let best = 1e9; for (const q of w.pieces) if (q !== p) { const d = Math.abs(q.c - p.c) + Math.abs(q.k - p.k); if (d < best) { best = d; tgt = q; } } w.capture = false; w.move = { p, c0: p.c, k0: p.k, c1: tgt.c, k1: tgt.k, t: 0, T: 0.6 + 0.1 * best, victim: tgt }; }
      else { const opts = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].filter(([dc, dk]) => p.c + dc >= 0 && p.c + dc < 8 && p.k + dk >= 0 && p.k + dk < 8 && !at(p.c + dc, p.k + dk)); if (opts.length) { const [dc, dk] = pick(rnd, opts); w.move = { p, c0: p.c, k0: p.k, c1: p.c + dc, k1: p.k + dk, t: 0, T: 0.6, victim: null }; } }
    }
    if (w.move) {
      const m = w.move; m.t += dt;
      const q = ease(Math.min(1, m.t / m.T));
      m.p.fc = lerp(m.c0, m.c1, q); m.p.fk = lerp(m.k0, m.k1, q);
      if (m.t >= m.T) {
        m.p.c = m.c1; m.p.k = m.k1; m.p.fc = m.p.fk = undefined;
        if (m.victim) { // the taken piece shatters: fragments off its body, down onto the board
          const [vx, vy] = P(m.victim.c - 3.5, Z0 + m.victim.k + 0.5), sc = F / (Z0 + m.victim.k + 0.5), hs = 1.7 * sc;
          for (let i = 0; i < 26; i++) w.frags.push({ x: vx + (rnd() - 0.5) * 0.5 * sc, y: vy - rnd() * hs, vx: (rnd() - 0.5) * sc * 1.6, vy: -rnd() * sc * 1.2, s: Math.max(1, (0.06 + rnd() * 0.1) * sc), g: vy + (rnd() - 0.5) * 0.2 * sc, life: 2.5, c: m.victim.side ? LMID : FIG });
          w.pieces.splice(w.pieces.indexOf(m.victim), 1); s.shake = Math.max(s.shake, 0.6);
        } else s.shake = Math.max(s.shake, 0.12);
        w.move = null;
      }
    }
    // the sky, the far haze, the board rank by rank from the far edge, a bright marker running the near rim on the beat
    skyBands(r, N, hz, [DARK + DIM, MID + DIM, MID, LMID, LMID]);
    r.disc(0.78 * N, 0.12 * N, 0.05 * N, BRIGHT);
    for (const c of w.clouds) cloud(r, ((c[0] + f.rel.midClock * 0.02) % 1.3 - 0.15) * N, c[1] * N, c[2] * 2.5 * N, c[2] * N, LMID + DIM);
    r.rect(0, hz, N, N - hz, MID + DIM);
    r.poly([P(-4.4, Z0 - 0.4), P(4.4, Z0 - 0.4), P(4.4, Z0 + 8.4), P(-4.4, Z0 + 8.4)], DARK);
    for (let k = 7; k >= 0; k--) for (let c = 0; c < 8; c++) r.poly([P(c - 4, Z0 + k), P(c - 3, Z0 + k), P(c - 3, Z0 + k + 1), P(c - 4, Z0 + k + 1)], (c + k) % 2 ? LMID : DARK + DIM);
    const [mx, my] = P(-4.2 + 8.4 * f.beat.phase, Z0 - 0.2); r.rect(mx - u, my - u, 2 * u, 2 * u, BRIGHT);
    // the pieces, far to near: a shadow under each, away from the sun at the right; the mover lifted a little on the beat while it slides
    const order = [...w.pieces].sort((a, b) => (b.fk ?? b.k) - (a.fk ?? a.k));
    for (const p of order) {
      const kk = p.fk ?? p.k, cc = p.fc ?? p.c, Z = Z0 + kk + 0.5, [x, by] = P(cc - 3.5, Z), sc = F / Z, hs = 1.7 * sc * ease(p.born), ws = 0.55 * sc, lift = p.fc !== undefined ? f.beat.pulse * 0.1 * sc : 0;
      r.ring(x - ws * 0.6, by + 0.3 * u, ws * 0.45, ws * 0.9, DARK, 0.3);
      chessPiece(r, w.set, p.type, x, by - lift, hs, ws, p.glow > 0.2 ? p.gc : p.side ? LMID : FIG, u);
      if (p.glow > 0.5) r.ring(x, by - hs * 0.5, hs * 0.5, Math.max(1, u), p.gc, 1.2);
      if (kk < 5) targets.push({ x: x - ws, y: by - hs * 1.2, w: ws * 2, h: hs * 1.2 + ws * 0.3 });
    }
    w.frags = w.frags.filter((p) => { p.vy += grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.y >= p.g) { p.y = p.g; p.vy = -p.vy * 0.2; p.vx *= 0.5; } r.rect(p.x - p.s / 2, p.y - p.s, p.s, p.s, p.c); return p.life > 0; });
  },
};

// ---------------------------------------------------------------------------------------------- free dive
// Under the sea: the light goes in bands from the bright surface to the dark below, deeper every section (the
// pressure darkens everything until the dive is over and it surfaces), rays sway from the surface with the mid
// clock, divers sink feet-first, turn head-down and swim off with their fins beating, bubbles rise (they
// accelerate to a terminal speed, wobble, and grow as the pressure drops), a school of fish keeps a loose formation
// and darts away from the nearest diver on the snares, the divers breathe out on the beat. A drop is a whale
// crossing behind it all. Kinds: the water.
const WATER_W = { lagoon: [3, 2, 1], reef: [2, 2, 2], trench: [1, 2, 3] };
const WATER_SHIFT = { lagoon: 0, reef: 1, trench: 2 };
const SEA_RAMP = [BRIGHT, LMID, COOL, COOL, MID, MID + DIM, DARK, DARK + DIM, BLACK];

const freedive = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { water: rollW(rnd, WATER_W, band), depth: 0, bubbles: [], whale: null, fc: { x: 0.65 * N, y: 0.55 * N, vx: 0, vy: 0 }, scare: 0,
      divers: Array.from({ length: 2 + (band > 0 ? 1 : 0) }, (_, i) => ({ x: (0.25 + i * 0.22) * N, y: (0.05 - i * 0.14) * N, mode: 0, a: 0, ph: 0, turnAt: (0.3 + rnd() * 0.25) * N, dir: rnd() < 0.5 ? -1 : 1, tt: 0 })),
      fish: Array.from({ length: 16 }, (_, i) => ({ x: 0.65 * N + (rnd() - 0.5) * 0.15 * N, y: 0.55 * N + (rnd() - 0.5) * 0.08 * N, vx: 0, vy: 0, ox: (rnd() - 0.5) * 0.16 * N, oy: (rnd() - 0.5) * 0.08 * N })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), shift = Math.min(5, WATER_SHIFT[w.water] + w.depth), fc = w.fc;
    const nearest = (x, y) => { let best = null, bd = 1e9; for (const d of w.divers) { const q = (d.x - x) ** 2 + (d.y - y) ** 2; if (q < bd) { bd = q; best = d; } } return best; };
    for (const hh of hits) {
      if (hh.kind === 'snare') { const d = nearest(fc.x, fc.y), dx = fc.x - d.x, dy = fc.y - d.y, L2 = Math.hypot(dx, dy) || 1; for (const q of w.fish) { q.vx += (dx / L2) * N * (0.25 + 0.3 * hh.strength) + (rnd() - 0.5) * N * 0.2; q.vy += (dy / L2) * N * (0.15 + 0.2 * hh.strength); } fc.vx += (dx / L2) * N * 0.1; fc.vy += (dy / L2) * N * 0.06; w.scare = 0.5; }
      else if (hh.kind === 'hat') for (let k = 0; k < 3; k++) w.bubbles.push({ x: rnd() * N, y: N + 2 * u, vy: 0, r: (0.5 + rnd()) * u, ph: rnd() * TAU });
    }
    if (f.section === 'drop' && !w.whale) w.whale = { x: -0.4 * N, dir: 1, y: (0.25 + rnd() * 0.2) * N };
    else if (f.section === 'change') { w.depth = (w.depth + 1) % 4; if (w.depth === 0) w.water = rollW(rnd, WATER_W, band); }
    w.scare -= dt;
    // the water: bands of light darkening with depth, the rays swaying from the surface, the whale behind them
    for (let i = 0; i < 8; i++) r.rect(0, (i * N) / 8, N, N / 8 + 1, SEA_RAMP[Math.min(8, i + shift)]);
    if (w.whale) {
      const wh = w.whale, L = 0.5 * N, hh = L * 0.14, tail = Math.sin(t * 2) * hh * 0.6;
      wh.x += wh.dir * N * 0.05 * dt;
      r.ring(wh.x, wh.y, L * 0.25, L * 0.5, DARK, 0.28);
      r.poly([[wh.x - wh.dir * L * 0.45, wh.y], [wh.x - wh.dir * L * 0.62, wh.y - hh * 0.8 + tail], [wh.x - wh.dir * L * 0.56, wh.y + tail * 0.3], [wh.x - wh.dir * L * 0.62, wh.y + hh * 0.8 + tail]], DARK);
      r.poly([[wh.x, wh.y + hh * 0.4], [wh.x + wh.dir * L * 0.12, wh.y + hh * 0.4], [wh.x - wh.dir * L * 0.05, wh.y + hh * 1.1]], DARK);
      r.rect(wh.x + wh.dir * L * 0.36, wh.y - hh * 0.25, Math.max(1, u), Math.max(1, u), LMID);
      targets.push({ x: wh.x - L * 0.5, y: wh.y - hh, w: L, h: hh * 2 });
      if (wh.x > 1.5 * N) w.whale = null;
    }
    for (let k = 0, n = Math.max(2, 7 - shift); k < n; k++) { const x0 = (0.08 + (k / n) * 0.9 + 0.02 * Math.sin(f.rel.midClock * 0.7 + k)) * N, tilt = 0.16 * Math.sin(f.rel.midClock * 0.5 + k * 1.7) * N, yEnd = (0.68 - 0.08 * shift) * N; r.poly([[x0 - u, 0], [x0 + u, 0], [x0 + tilt + 0.03 * N, yEnd], [x0 + tilt - 0.02 * N, yEnd]], f.beat.pulse > 0.6 && k % 2 ? LMID : LMID + DIM); }
    // the school: each fish is drawn to its slot about the centre, the centre wanders; the dart of a snare fades
    fc.vx += (0.65 * N + Math.sin(t * 0.3) * 0.2 * N - fc.x) * 3 * dt; fc.vy += (0.55 * N + Math.cos(t * 0.23) * 0.1 * N - fc.y) * 3 * dt; fc.vx *= Math.exp(-dt * 2.5); fc.vy *= Math.exp(-dt * 2.5); fc.x += fc.vx * dt; fc.y += fc.vy * dt;
    if (fc.x < 0.1 * N || fc.x > 0.9 * N) { fc.x = clamp(fc.x, 0.1 * N, 0.9 * N); fc.vx = -fc.vx * 0.5; } // the school turns back at the edges
    if (fc.y < 0.15 * N || fc.y > 0.9 * N) { fc.y = clamp(fc.y, 0.15 * N, 0.9 * N); fc.vy = -fc.vy * 0.5; }
    for (const q of w.fish) {
      q.vx += (fc.x + q.ox - q.x) * 4 * dt + fc.vx * dt * 2; q.vy += (fc.y + q.oy - q.y) * 4 * dt; q.vx *= Math.exp(-dt * 2.5); q.vy *= Math.exp(-dt * 2.5);
      q.x += q.vx * dt; q.y += q.vy * dt;
      const sp = Math.hypot(q.vx, q.vy) || 1, dx = q.vx / sp, dy = q.vy / sp, L = 2.2 * u;
      r.poly([[q.x + dx * L, q.y + dy * L], [q.x - dx * L - dy * L * 0.5, q.y - dy * L + dx * L * 0.5], [q.x - dx * L + dy * L * 0.5, q.y - dy * L - dx * L * 0.5]], w.scare > 0 ? BRIGHT : FIG);
    }
    // the divers: feet-first down, a turn head-down about the middle, then off with the fins beating
    for (const d of w.divers) {
      const h = 0.2 * N;
      if (d.mode === 0) { d.y += N * 0.09 * dt; if (d.y > d.turnAt) { d.mode = 1; d.tt = 0; } }
      else if (d.mode === 1) { d.tt += dt; d.a = Math.PI * ease(d.tt / 1.2) * d.dir; d.y += N * 0.03 * dt; if (d.tt >= 1.2) { d.mode = 2; d.tt = 0; } }
      else { d.tt += dt; const want = Math.PI * d.dir - d.dir * 0.7 * ease(d.tt); d.a = want; const sp = N * 0.1 * (0.6 + 0.4 * f.level); d.x += -Math.sin(d.a) * sp * dt * -1; d.y += Math.cos(d.a) * sp * dt * -1; d.ph += (sp * dt * Math.PI) / (h * 0.4); if (d.x < -0.2 * N || d.x > 1.2 * N || d.y > 1.2 * N) { d.mode = 0; d.a = 0; d.y = -0.15 * N; d.x = (0.15 + rnd() * 0.7) * N; d.turnAt = (0.3 + rnd() * 0.3) * N; d.dir = rnd() < 0.5 ? -1 : 1; } }
      const Pd = rotAt(d.x, d.y, d.a), hw = h * 0.12, kick = d.mode === 2 ? Math.sin(d.ph) * h * 0.18 : 0;
      r.poly([Pd(-hw, -h * 0.18), Pd(hw, -h * 0.18), Pd(hw * 0.8, h * 0.22), Pd(-hw * 0.8, h * 0.22)], FIG);
      const [hx, hy] = Pd(0, -h * 0.3); r.disc(hx, hy, h * 0.1, FIG);
      for (const k of [-1, 1]) { const [ax, ay] = Pd(k * hw, -h * 0.14), [bx, by] = Pd(k * hw * (d.mode === 2 ? 1.1 : 1.3), d.mode === 2 ? -h * 0.45 : h * 0.15); r.stroke(ax, ay, bx, by, Math.max(1, h * 0.05), FIG); }
      for (const k of [-1, 1]) { const [ax, ay] = Pd(k * hw * 0.5, h * 0.2), [bx, by] = Pd(k * hw * 0.6 + kick * k, h * 0.55), [fx, fy] = Pd(k * hw * 0.6 + kick * k * 1.6, h * 0.75); r.stroke(ax, ay, bx, by, Math.max(1, h * 0.06), FIG); r.stroke(bx, by, fx, fy, Math.max(1, h * 0.09), DARK); }
      if (f.beat.on && d.mode !== 0 && f.beat.count % 2 === 0) for (let k = 0; k < 4; k++) w.bubbles.push({ x: hx + (rnd() - 0.5) * 2 * u, y: hy, vy: 0, r: (0.4 + rnd() * 0.8) * u, ph: rnd() * TAU });
      targets.push({ x: d.x - h * 0.45, y: d.y - h * 0.45, w: h * 0.9, h: h * 0.9 });
    }
    // the bubbles: up to a terminal speed that goes with their size, wobbling, growing as the pressure drops
    if (rnd() < 1.8 * dt) w.bubbles.push({ x: rnd() * N, y: N, vy: 0, r: (0.4 + rnd() * 0.6) * u, ph: rnd() * TAU });
    w.bubbles = w.bubbles.filter((b) => { b.vy = follow(b.vy, -N * (0.08 + 0.05 * Math.sqrt(b.r / u)), dt, 0.5); b.y += b.vy * dt; b.x += Math.sin(t * 5 + b.ph) * b.r * 4 * dt; b.r += dt * 0.25 * u; if (b.r > 1.5 * u) r.ring(b.x, b.y, b.r, Math.max(1, u * 0.6), LMID); else r.rect(b.x, b.y, Math.max(1, u), Math.max(1, u), LMID); return b.y > -b.r; }).slice(-120);
  },
};

// ---------------------------------------------------------------------------------------------- sky mages
// Mage soldiers flying in formation above a cloud sea at a low sun: they bob gently, cloaks streaming, rifles
// levelled. Flak comes up on the kicks: shells rise from under the clouds, slow under gravity and burst at the top
// of their climb into smoke that drifts and thins; the rifles flash on the snares with a tracer out ahead; the
// cloaks flap on the beat. A drop is the dive: the whole formation pitches down through the cloud tops and pulls
// up again. Kinds: the formation.
const FORM2_W = { wedge: [3, 2, 1], line: [2, 2, 2], swarm: [1, 2, 3] };
const FORMS2 = { wedge: [[0, 0], [-1, 0.9], [1, 0.9], [-2, 1.8], [2, 1.8]], line: [[-2, 0], [-1, 0.1], [0, 0], [1, 0.1], [2, 0]], swarm: [[0, 0], [-1.3, 0.6], [0.9, 1.1], [-0.4, 1.7], [1.8, 0.4], [-2, 1.4]] };

const skymages = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { form: rollW(rnd, FORM2_W, band), shells: [], smoke: [], sparks: [], flashes: [], mz: null, dive: null, phs: Array.from({ length: 6 }, () => rnd() * TAU), scroll: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.64 * N, grav = G(N), bps = bpsOf(f), slots = FORMS2[w.form], cx = 0.46 * N, cy0 = 0.34 * N;
    let cy = cy0, pitch = 0;
    if (w.dive) { const D = w.dive; D.t += dt; const q = D.t / D.T; cy = cy0 + 0.34 * N * Math.sin(Math.PI * q); pitch = Math.atan2(0.34 * N * Math.PI / D.T * Math.cos(Math.PI * q), N * 0.5); if (q >= 1) w.dive = null; }
    for (const hh of hits) {
      if (isLow(hh)) { const tx = cx + (rnd() - 0.5) * 0.5 * N, ty = cy + (rnd() - 0.5) * 0.2 * N; w.shells.push({ x: tx + (rnd() - 0.5) * 0.1 * N, y: hz + 2 * u, vy: -Math.sqrt(2 * grav * Math.max(0.05 * N, hz - ty)), vx: 0, s: hh.strength }); } // the speed that tops out at the formation's height (a short one during the dive, when it is down in the clouds)
      else if (hh.kind === 'snare') w.mz = { i: Math.floor(rnd() * slots.length), t: 0.1 };
    }
    if (f.section === 'drop' && !w.dive) w.dive = { t: 0, T: 4 / bps };
    else if (f.section === 'change') w.form = rollW(rnd, FORM2_W, band);
    w.scroll += dt * (0.01 + 0.02 * f.rel.midDrive);
    // the sky at the low sun, the far cloud sea sliding; the near clouds come after the mages, so a dive goes down into them
    skyBands(r, N, hz, [DARK + DIM, MID + DIM, LMID + DIM, HOT, LMID]);
    r.disc(0.76 * N, hz - 0.03 * N, 0.07 * N, BRIGHT); r.ring(0.76 * N, hz - 0.03 * N, 0.09 * N, Math.max(1, u), HOT);
    const seaLayer = (y0, sz, col, speed) => { for (let k = -1; k < 14; k++) { const x = ((k / 12 + w.scroll * speed) % 1.1) * N * 1.1 - 0.05 * N + hash(k, 1) * 3 * u; cloud(r, x, y0 + hash(k, 2) * sz * 0.4, sz * 2.4, sz, col); } r.rect(0, y0 + sz * 0.3, N, N - y0 - sz * 0.3, col); };
    seaLayer(hz + 0.01 * N, 0.05 * N, LMID + DIM, 0.4);
    const drawMages = () => {
      slots.forEach(([sx, sz], i) => {
        const bob = Math.sin(t * 1.3 + w.phs[i]) * 2 * u, x = cx + sx * 0.09 * N, y = cy + sz * 0.07 * N + bob, h = 0.08 * N, Pm = rotAt(x, y, pitch), flap = Math.sin(t * 7 + w.phs[i]) * u * (0.6 + f.beat.pulse);
        r.poly([Pm(-h * 0.1, -h * 0.1), Pm(-h * 0.1, h * 0.1), Pm(-h * 0.9, h * 0.3 + flap), Pm(-h * 0.75, -h * 0.15 + flap)], DARK); // the cloak streams back
        r.stroke(...Pm(-h * 0.1, h * 0.12), ...Pm(-h * 0.45, h * 0.3), Math.max(1, h * 0.08), FIG); // the legs trail
        r.poly([Pm(-h * 0.2, -h * 0.15), Pm(h * 0.25, -h * 0.1), Pm(h * 0.2, h * 0.15), Pm(-h * 0.2, h * 0.18)], FIG);
        r.disc(...Pm(h * 0.3, -h * 0.22), h * 0.12, FIG);
        r.rect(...Pm(h * 0.26, -h * 0.4), h * 0.1, h * 0.1, HOT); // the hat's badge
        const [mx, my] = Pm(h * 1.1, h * 0.05);
        r.stroke(...Pm(h * 0.1, h * 0.05), mx, my, Math.max(1, h * 0.06), DARK); // the rifle
        if (w.mz && w.mz.i === i) { r.disc(mx, my, 2.5 * u, BRIGHT); const [tx, ty] = Pm(h * 5, h * 0.05); r.line(mx, my, tx, ty, LMID); }
        targets.push({ x: x - h, y: y - h * 0.5, w: h * 2, h: h });
      });
    };
    drawMages();
    seaLayer(hz + 0.07 * N, 0.08 * N, LMID, 1);
    if (w.mz && (w.mz.t -= dt) <= 0) w.mz = null;
    // the flak: shells up out of the clouds, slowing under gravity, bursting at the top of the climb
    w.shells = w.shells.filter((sh) => {
      sh.vy += grav * dt; sh.y += sh.vy * dt;
      r.rect(sh.x - u * 0.5, sh.y, Math.max(1, u), 2 * u, LMID); r.line(sh.x, sh.y + 2 * u, sh.x, sh.y + 5 * u, HOT + DIM);
      if (sh.vy >= 0) { w.flashes.push({ x: sh.x, y: sh.y, t: 0.07 }); for (let k = 0; k < 5; k++) w.smoke.push({ x: sh.x, y: sh.y, vx: (rnd() - 0.5) * N * 0.3, vy: (rnd() - 0.5) * N * 0.3, r: 1.5 * u, life: 1 + rnd() * 0.6 }); burst(w.sparks, rnd, sh.x, sh.y, 6, N * 0.3, HOT, 0.3); s.shake = Math.max(s.shake, 0.15 * sh.s); return false; }
      return true;
    });
    w.flashes = w.flashes.filter((q) => { q.t -= dt; r.disc(q.x, q.y, 4 * u, BRIGHT); return q.t > 0; });
    w.smoke = puffs(W, w.smoke, N * 0.02, -N * 0.005, 2.5, DARK, MID + DIM, 60);
    w.sparks = particles(W, w.sparks, HOT);
  },
};

// ---------------------------------------------------------------------------------------------- mountain pass
// A mountain pass at night from behind the car: the road ahead is projected row by row from a track of hairpins and
// straights (the centre line is integrated through the curvature, so the bends ahead really bend), guardrail posts
// and trees come up the sides at the speed of travel, the headlights light the road and the trees they point at,
// the speed goes with the energy. A snare is a drift: the car yaws, the tail swings out, the tyres smoke and the
// tail-lights smear; a kick is the downshift, a jolt and a flash from the exhaust. A drop is the long straight, a
// rival pulling past and away, then the next hairpin. Kinds: the weather.
const PASS_W = { clear: [3, 2, 1], mist: [2, 2, 2], rain: [1, 2, 3] };

// the track ahead: straights and hairpins of alternating hand, as far as `upto`
function passTrack(rnd, list, upto) {
  let end = list.length ? list[list.length - 1].s1 : 0, hand = list.length ? -Math.sign(list[list.length - 1].c || 1) : 1;
  while (end < upto) {
    const kind = rnd(), len = kind < 0.4 ? 8 + rnd() * 10 : kind < 0.8 ? 12 + rnd() * 8 : 10 + rnd() * 6, c = kind < 0.4 ? 0 : kind < 0.8 ? hand * (0.7 + rnd() * 0.5) : hand * 0.25;
    if (c) hand = -hand;
    list.push({ s0: end, s1: end + len, c });
    end += len;
  }
}

const tougedrift = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), track = [];
    passTrack(rnd, track, 200);
    Object.assign(w, { weather: rollW(rnd, PASS_W, band), track, pos: 0, yaw: 0, swing: 0, smoke: [], trail: [], rival: null, jolt: 0, brake: 0, rain: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.47 * N, F = 0.55 * N, cx = 0.5 * N, buf = r.buf;
    const segAt = (sx) => { for (const sg of w.track) if (sx < sg.s1) return sg; return w.track[w.track.length - 1]; };
    const cur = segAt(w.pos);
    for (const hh of hits) {
      if (hh.kind === 'snare') { const sign = cur.c ? Math.sign(cur.c) : rnd() < 0.5 ? -1 : 1; w.yaw += sign * (0.35 + 0.4 * hh.strength); w.brake = 0.25; } // the nose goes into the bend
      else if (isLow(hh)) { w.jolt = 1; s.shake = Math.max(s.shake, 0.1 * hh.strength); }
    }
    if (f.section === 'drop') { // the long straight from here, then the next hairpin; the rival comes up alongside
      cur.s1 = w.pos + 4; w.track.length = w.track.indexOf(cur) + 1;
      w.track.push({ s0: cur.s1, s1: cur.s1 + 60, c: 0 }); passTrack(rnd, w.track, cur.s1 + 200);
      w.rival = { z: 0.6, v: 2 };
    } else if (f.section === 'change') w.weather = rollW(rnd, PASS_W, band);
    // the run: faster with the energy, slower through the hairpins; the yaw settles into the bend (positive = the nose to
    // the right, the hand of a right-hander), the tail hangs out to the outside after it
    const v = (6 + 8 * f.level + 5 * f.rel.bassDrive) * (Math.abs(cur.c) > 0.5 ? 0.7 : 1);
    w.pos += v * dt;
    if (w.track[w.track.length - 1].s1 < w.pos + 150) passTrack(rnd, w.track, w.pos + 250);
    while (w.track.length > 1 && w.track[0].s1 < w.pos - 2) w.track.shift();
    w.yaw = follow(w.yaw, cur.c * 0.2, dt, 0.5); w.swing = follow(w.swing, w.yaw * 1.4, dt, 0.3); w.jolt *= Math.exp(-dt * 10); w.brake -= dt;
    // the sky, the ridge, the ground; then the road row by row from the near edge to the horizon
    r.rect(0, 0, N, hz, BG);
    for (let k = 0; k < 40; k++) r.set(hash(k, 1) * N, hash(k, 2) * hz * 0.8, hash(k, 3 + Math.floor(t * 3)) < 0.85 ? MID : LMID);
    for (let x = 0; x < N; x += 2) r.rect(x, hz - (0.06 + 0.08 * Math.abs(Math.sin(x * 0.021 / u + 1)) + 0.03 * hash(x >> 2, 9)) * N, 2, N, DARK);
    r.rect(0, hz, N, N - hz, DARK + DIM);
    if (w.weather === 'mist') r.rect(0, hz - 0.02 * N, N, 0.08 * N, MID + DIM);
    let slope = 0, lat = 0, zPrev = 0, si = 0, lastPost = [null, null], rivalRow = null;
    const reach = 15, cw = 1.3, roadCol = MID + DIM, litCol = MID, yawL = w.yaw * 1.4;
    for (let y = N - 1; y > hz; y--) {
      const z = F / (y - hz), sx = w.pos + z;
      while (si < w.track.length - 1 && sx >= w.track[si].s1) si++;
      const sg = w.track[si], dz = zPrev ? z - zPrev : 0;
      slope += sg.c * dz; lat += slope * dz; zPrev = z;
      const k = F / z, X = cx + (lat + w.swing * 0.4) * k, hw = 1.6 * k, row = y * N; // the car sits to the outside of the centre line, so the line shifts the other way
      const xa = Math.max(0, Math.round(X - hw)), xb = Math.min(N, Math.round(X + hw));
      if (xb > xa) {
        buf.fill(roadCol, row + xa, row + xb);
        if (z < reach) { const la = Math.max(xa, Math.round(X + (yawL * z - cw - 0.3 * z) * k)), lb = Math.min(xb, Math.round(X + (yawL * z + cw + 0.3 * z) * k)); if (lb > la) buf.fill(litCol, row + la, row + lb); }
        if (hw > 2) { buf.fill(LMID + DIM, row + xa, row + Math.min(xb, xa + Math.max(1, Math.round(0.08 * k)))); buf.fill(LMID + DIM, row + Math.max(xa, xb - Math.max(1, Math.round(0.08 * k))), row + xb); }
        if (sx % 3 < 1.5 && hw > 3) { const da = Math.max(xa, Math.round(X - 0.05 * k)), db = Math.min(xb, Math.max(da + 1, Math.round(X + 0.05 * k))); buf.fill(LMID, row + da, row + db); }
      }
      if (w.rival && !rivalRow && z >= w.rival.z) rivalRow = { X, k, y };
      if (Math.floor(sx / 2.5) !== Math.floor((sx - dz) / 2.5) && dz > 0) { // a guardrail post each 2.5 units, the rail to the one before
        for (const side of [-1, 1]) { const px = X + side * (hw + 0.25 * k), hp = 0.5 * k, i = side < 0 ? 0 : 1; r.rect(px - Math.max(0.5, 0.05 * k), y - hp, Math.max(1, 0.1 * k), hp, LMID + DIM); if (lastPost[i]) r.line(lastPost[i][0], lastPost[i][1], px, y - hp, LMID + DIM); lastPost[i] = [px, y - hp]; }
      }
      if (Math.floor(sx / 5) !== Math.floor((sx - dz) / 5) && dz > 0 && k > 1.2 && z > 4) { // trees each 5 units, where the hash puts them, lit when the beams point at them
        const idx = Math.floor(sx / 5);
        for (const side of [-1, 1]) { if (hash(idx, side + 5) > 0.75) continue; const off = 2.6 + hash(idx, side + 7) * 2.5, th = (2 + hash(idx, side + 9) * 2) * k, tx = X + side * off * k, lit = z < reach * 1.4 && Math.abs(side * off - yawL * z) < cw + 0.35 * z; r.poly([[tx, y - th], [tx + 0.6 * k, y], [tx - 0.6 * k, y]], lit ? LMID + DIM : DARK); }
      }
    }
    // the rival on the drop: alongside at first, then pulling away up the road and merging to the centre line
    if (w.rival) {
      const R = w.rival; R.v += dt * 3; R.z += R.v * dt;
      if (rivalRow) { const { X, k, y } = rivalRow, lx = X + Math.max(0, 1 - R.z / 10) * 1.1 * k, cw2 = 0.9 * k, ch = 0.5 * k; r.rect(lx - cw2, y - ch, 2 * cw2, ch, DARK); r.rect(lx - cw2 * 0.8, y - ch * 1.7, cw2 * 1.6, ch * 0.8, DARK); for (const q of [-1, 1]) r.rect(lx + q * cw2 * 0.7 - 0.12 * k, y - ch * 0.7, Math.max(1, 0.24 * k), Math.max(1, 0.12 * k), HOT); targets.push({ x: lx - cw2, y: y - ch * 1.7, w: cw2 * 2, h: ch * 1.7 }); }
      if (R.z > 120) w.rival = null;
    }
    if (w.weather === 'rain') { while (w.rain.length < 60 * u) w.rain.push({ x: rnd() * N, y: rnd() * N }); for (const d of w.rain) { d.y += N * 1.2 * dt; d.x -= N * 0.2 * dt; if (d.y > N) { d.y = -rnd() * 0.1 * N; d.x = rnd() * N * 1.2; } r.line(d.x, d.y, d.x + u, d.y - 3 * u, LMID + DIM); } }
    // the car: yawed into the bend and slid out to the outside in a drift, the tyres smoking, the tail-lights smearing where it went
    const carX = cx - w.swing * 0.12 * N, carY = 0.87 * N + w.jolt * u, cw3 = 0.12 * N, ch3 = 0.05 * N, Pc = rotAt(carX, carY, w.yaw * 0.35);
    for (const q of [-1, 1]) r.poly([Pc(q * cw3 * 0.8 - cw3 * 0.12, -ch3 * 0.2), Pc(q * cw3 * 0.8 + cw3 * 0.12, -ch3 * 0.2), Pc(q * cw3 * 0.8 + cw3 * 0.12, ch3 * 0.9), Pc(q * cw3 * 0.8 - cw3 * 0.12, ch3 * 0.9)], BLACK);
    r.poly([Pc(-cw3, -ch3), Pc(cw3, -ch3), Pc(cw3, ch3 * 0.6), Pc(-cw3, ch3 * 0.6)], FIG);
    r.poly([Pc(-cw3 * 0.75, -ch3 * 2.4), Pc(cw3 * 0.75, -ch3 * 2.4), Pc(cw3 * 0.9, -ch3), Pc(-cw3 * 0.9, -ch3)], FIG);
    r.poly([Pc(-cw3 * 0.6, -ch3 * 2.2), Pc(cw3 * 0.6, -ch3 * 2.2), Pc(cw3 * 0.7, -ch3 * 1.2), Pc(-cw3 * 0.7, -ch3 * 1.2)], DARK);
    const lights = [-1, 1].map((q) => Pc(q * cw3 * 0.72, -ch3 * 0.4));
    for (const [lx, ly] of lights) r.rect(lx - 2.5 * u, ly - u, 5 * u, Math.max(1, 2 * u), w.brake > 0 ? BRIGHT : HOT);
    if (w.jolt > 0.5) r.disc(...Pc(-cw3 * 0.5, ch3 * 0.7), 2 * u, BRIGHT);
    w.trail.push({ l: lights[0], r: lights[1], t }); while (w.trail.length > 40 || (w.trail.length && t - w.trail[0].t > 0.4)) w.trail.shift(); // the last 0.4 s of the lights, whatever the frame rate
    for (let i = 1; i < w.trail.length; i++) { const a = w.trail[i - 1], b = w.trail[i], c = t - b.t < 0.2 ? HOT : HOT + DIM; r.line(a.l[0], a.l[1], b.l[0], b.l[1], c); r.line(a.r[0], a.r[1], b.r[0], b.r[1], c); }
    // the smoke stays on the road behind, so with the camera running on it comes down the screen toward us, to the outside
    if (Math.abs(w.yaw) > 0.12) for (const q of [-1, 1]) w.smoke.push({ x: carX + q * cw3 * 0.8, y: carY + ch3 * 0.8, vx: -w.yaw * N * 0.2 + (rnd() - 0.5) * N * 0.1, vy: N * 0.05, r: 1.5 * u, life: 0.7 + rnd() * 0.5 });
    w.smoke = puffs(W, w.smoke, 0, N * 0.02 * v, 6, LMID + DIM, MID + DIM, 70);
    targets.push({ x: carX - cw3, y: carY - ch3 * 2.4, w: cw3 * 2, h: ch3 * 3.3 });
  },
};

// ---------------------------------------------------------------------------------------------- train over the sea
// A train running on a trestle over a still sea at dusk, the camera running with it: the sleepers, the piles and
// the buoys slide past at the speed of travel and the wheels turn at that speed, the far islands slower, the sun
// not at all; the whole scene is mirrored in the water, dimmer, with a slow ripple; a few silhouettes sit in the
// lit windows (one nods on the beat), birds cross on the hats. A section change brings a station: the train slows
// into it, stops a few beats and pulls out. A drop is night falling: the sky darkens, the stars come out and the
// windows glow brighter on the water. Kinds: the hour. Calm.
const DUSK_W = { amber: [3, 2, 1], rose: [2, 2, 2], blue: [1, 2, 3] };
const DUSK_SKY = { amber: [MID + DIM, MID, HOT, LMID, BRIGHT], rose: [MID, LMID, HOT, HOT, LMID], blue: [DARK, DARK, MID + DIM, MID, LMID] };
const NIGHT_SKY = [BG, BG, DARK + DIM, MID + DIM, MID + DIM]; // a glow left on the horizon, so the train and the platform still stand against it

const seatrain = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { hour: rollW(rnd, DUSK_W, band), pos: 0, v: 0.3 * N, night: 0, nightT: 0, station: null, stop: 0, birds: [], sunX: 0.2 + rnd() * 0.5,
      isles: Array.from({ length: 3 }, (_, i) => [i * 0.5 + rnd() * 0.3, 0.04 + rnd() * 0.05, 0.15 + rnd() * 0.15]), folk: Array.from({ length: 20 }, () => rnd()) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), wl = 0.56 * N, ty = wl - 3 * u, bps = bpsOf(f), buf = r.buf;
    for (const hh of hits) if (hh.kind === 'hat' && w.birds.length < 6) w.birds.push({ x: rnd() < 0.5 ? -0.05 * N : 1.05 * N, y: (0.1 + rnd() * 0.3) * N, dir: 0, ph: rnd() * TAU, v: N * (0.25 + 0.2 * hh.strength) });
    for (const b of w.birds) if (!b.dir) b.dir = b.x < 0 ? 1 : -1;
    if (f.section === 'drop') w.nightT = 32 / bps;
    else if (f.section === 'change') { w.hour = rollW(rnd, DUSK_W, band); if (!w.station) w.station = { x0: w.pos + 1.4 * N }; }
    w.nightT -= dt;
    w.night = follow(w.night, w.nightT > 0 ? 1 : 0, dt, 2.5);
    // the run: a cruising speed with the energy, braking for the platform, a few beats' stop, then away
    let want = N * (0.18 + 0.2 * f.level + 0.1 * f.rel.bassDrive);
    if (w.station) { const sx = w.station.x0 - w.pos; if (sx < 0.1 * N && w.stop === 0 && w.v > N * 0.01) want = 0; else if (sx < 0.1 * N && w.stop === 0) { w.stop = 4 / bps; want = 0; } else if (w.stop > 0) { w.stop -= dt; want = 0; if (w.stop <= 0) w.stop = -1; } if (sx < -1.6 * N) { w.station = null; w.stop = 0; } }
    w.v = follow(w.v, want, dt, want ? 1.6 : 1.0);
    w.pos += w.v * dt;
    // the sky, the sun sinking as night falls, the stars, the islands far off sliding slowly
    const sky = w.night > 0.66 ? NIGHT_SKY : w.night > 0.33 ? DUSK_SKY.blue : DUSK_SKY[w.hour];
    skyBands(r, N, wl, sky);
    if (w.night > 0.3) for (let k = 0; k < 50; k++) if (hash(k, 4) < w.night) r.set(hash(k, 1) * N, hash(k, 2) * wl * 0.9, hash(k, 3 + Math.floor(t * 2)) < 0.85 ? MID : BRIGHT);
    r.disc(w.sunX * N, wl - 0.2 * N + w.night * 0.12 * N, 0.05 * N, w.night > 0.5 ? LMID : BRIGHT);
    for (const [ix, ih, iw] of w.isles) { const x = ((((ix * N - w.pos * 0.12) % (1.6 * N)) + 1.6 * N) % (1.6 * N)) - 0.3 * N; r.poly([[x, wl], [x + iw * N * 0.4, wl - ih * N], [x + iw * N * 0.7, wl - ih * N * 0.6], [x + iw * N, wl]], DARK + DIM); }
    w.birds = w.birds.filter((b) => { b.x += b.dir * b.v * dt; b.ph += dt * 12; const fl = Math.sin(b.ph) * 1.5 * u; r.line(b.x - 2.5 * u, b.y - fl, b.x, b.y, DARK); r.line(b.x, b.y, b.x + 2.5 * u, b.y - fl, DARK); return b.x > -0.1 * N && b.x < 1.1 * N; });
    // the station, when it comes: a platform behind the track, a roof on posts, lamps, a bench, a few waiting
    if (w.station) {
      const sx = w.station.x0 - w.pos, sl = 1.4 * N, py = ty - 2 * u, roof = ty - 0.2 * N;
      r.rect(sx, py, sl, 4 * u, MID + DIM); r.rect(sx, py, sl, Math.max(1, u), LMID + DIM);
      r.rect(sx, roof, sl, 2 * u, DARK);
      for (let x = sx + 0.06 * N, i = 0; x < sx + sl; x += 0.18 * N, i++) { r.rect(x, roof, 1.5 * u, py - roof, DARK); r.disc(x + 0.09 * N, roof + 4 * u, 1.5 * u, w.night > 0.4 ? BRIGHT : LMID); if (hash(i, 3) < 0.5) walker(r, x + 0.06 * N, py, 0.1 * N, DARK, 0, -1, { coat: true }); } // who waits by which post is fixed, so nobody flickers as the platform slides
      r.rect(sx + 0.3 * N, py - 3 * u, 0.08 * N, 3 * u, DARK);
    }
    // the trestle and the track: piles, the deck, the sleepers and the rails sliding at the speed of travel
    for (let x = ((-w.pos % (0.12 * N)) + 0.12 * N) % (0.12 * N); x < N; x += 0.12 * N) { r.rect(x - u, ty, 2 * u, wl - ty + u, DARK); r.line(x - 3 * u, wl, x + 3 * u, ty + 2 * u, DARK + DIM); }
    r.rect(0, ty, N, 3 * u, DARK);
    for (let x = ((-w.pos % (5 * u)) + 5 * u) % (5 * u); x < N; x += 5 * u) r.rect(x, ty - u, 2.5 * u, Math.max(1, u), DARK + DIM);
    r.rect(0, ty - 1.5 * u, N, Math.max(1, u * 0.7), LMID);
    // the train, the camera running with it: cars, lit windows and the ones inside, wheels turning with the run
    const cl = 0.19 * N, gap = 0.015 * N, ch = 0.12 * N, wr = 1.8 * u, x0 = 0.5 * N - 2 * (cl + gap) + gap / 2, winCol = w.night > 0.5 ? BRIGHT : LMID;
    for (let i = 0; i < 4; i++) {
      const x = x0 + i * (cl + gap), by = ty - 1.5 * u - wr;
      r.rect(x, by - ch, cl, ch, DARK);
      r.rect(x, by - ch, cl, Math.max(1, u), MID + DIM);
      for (let k = 0; k < 5; k++) { const wx = x + cl * (0.06 + k * 0.19), ww = cl * 0.13, wy = by - ch * 0.82, wh = ch * 0.4; r.rect(wx, wy, ww, wh, winCol); if (hash(i * 5 + k, 1) < 0.45) { const nod = i * 5 + k === 7 ? f.beat.pulse * u : 0; r.disc(wx + ww * 0.5, wy + wh * 0.55 + nod, ww * 0.22, DARK); r.rect(wx + ww * 0.15, wy + wh * 0.7 + nod, ww * 0.7, wh * 0.3, DARK); } }
      for (const q of [0.15, 0.3, 0.7, 0.85]) { const wx = x + cl * q, ang = w.pos / wr; r.disc(wx, by, wr, BLACK); r.line(wx, by, wx + Math.cos(ang) * wr, by + Math.sin(ang) * wr, LMID); }
      if (i === 3) { r.poly([[x + cl, by - ch], [x + cl + 3 * u, by - ch * 0.5], [x + cl + 3 * u, by], [x + cl, by]], DARK); r.rect(x + cl + u, by - ch * 0.4, 2 * u, 2 * u, BRIGHT); }
    }
    targets.push({ x: x0, y: ty - ch - 2 * u, w: 4 * cl + 3 * gap, h: ch + 2 * u });
    // the sea: everything above the waterline mirrored below it, dimmer, each row shifted by a slow ripple
    const amp0 = (0.4 + 1.2 * f.level) * u;
    for (let y = Math.ceil(wl); y < N; y++) {
      const d = y - wl, sy = Math.round(wl - 1 - d * 0.85), off = Math.round(Math.sin(d * 0.5 / u + t * 1.6 + hash(y, 2) * 2) * amp0 * (0.3 + d / (N - wl)));
      const row = y * N, srow = sy * N;
      if (sy < 0) { buf.fill(sky[0] < DIM ? sky[0] + DIM : sky[0], row, row + N); continue; }
      for (let x = 0; x < N; x++) { let sxp = x + off; if (sxp < 0) sxp = 0; else if (sxp >= N) sxp = N - 1; const c = buf[srow + sxp]; buf[row + x] = c < DIM ? c + DIM : c; }
    }
    for (let k = 0; k < 6; k++) { const x = (((k * 0.17 * N - w.pos) % (1.1 * N)) + 1.1 * N) % (1.1 * N) - 0.05 * N, y = wl + (0.05 + hash(k, 1) * 0.3) * N; r.rect(x, y, 3 * u, Math.max(1, u), LMID); } // the glints of the swell
  },
};

// ---------------------------------------------------------------------------------------------- explosion mage
// A robed mage on a plain charging one spell over the bars: the glow at the staff grows with the energy that has
// gone in, the rune ring round the feet widens and turns, the wind rises and the robe and the grass lean with it,
// pebbles lift off the ground as the charge nears full. Kicks pulse the glow with a crackle of arcs, snares throw
// sparks off the staff, the ring's marks step on the beat. The drop (or a full charge and a heavy kick) is the one
// explosion, far across the plain: a flash, a shockwave ring, a mushroom cloud that rises and slows as it swells,
// debris on parabolas, the pebbles dropping; then the mage falls over and the charge starts again. Kinds: the hour.
const HOUR2_W = { day: [3, 2, 1], dusk: [2, 2, 2], night: [1, 2, 3] };
const HOUR2_SKY = { day: [COOL, LMID, LMID, BRIGHT], dusk: [DARK, MID + DIM, HOT, LMID], night: [BG, BG, DARK + DIM, DARK] };

const explosionmage = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { hour: rollW(rnd, HOUR2_W, band), charge: 0, pulse: 0, blast: null, fall: 0, fv: 0, lie: 0, sparks: [], debris: [], dust: [], flash: 0, markA: 0,
      pebbles: Array.from({ length: 12 }, () => ({ x: 0.1 + rnd() * 0.35, y: 0, vy: 0, h: 0.06 + rnd() * 0.12, s: rnd() * TAU })), grass: Array.from({ length: 40 }, () => [rnd(), rnd()]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.6 * N, g = 0.8 * N, mx = 0.26 * N, h = 0.3 * N, grav = G(N), bps = bpsOf(f), night = w.hour === 'night';
    const tipX = mx + h * 0.55, tipY = g - h * 1.15;
    const blast = () => { w.blast = { t: 0, x: 0.78 * N, y: 0.72 * N, capY: 0.72 * N, vy: -N * 0.5, rc: 0.03 * N }; w.flash = 0.07; w.charge = 0; w.fall = 0.05; w.fv = 0; s.shake = Math.max(s.shake, 1); burst(w.debris, rnd, 0.78 * N, 0.72 * N, 40, N * 0.8, DARK, 2); for (const p of w.debris) if (p.g === undefined) p.g = 0.72 * N + rnd() * 0.12 * N; for (let k = 0; k < 14; k++) w.dust.push({ x: 0.78 * N + (rnd() - 0.5) * 0.1 * N, y: 0.72 * N, vx: (rnd() - 0.5) * N * 0.6, vy: -rnd() * N * 0.1, r: 3 * u, life: 2.5 + rnd() }); }; // each piece of debris lands on the plain around the crater, nearer ones lower
    for (const hh of hits) {
      if (isLow(hh)) { w.pulse = 1; if (w.charge > 1.3 && hh.strength > 0.75 && !w.blast) blast(); }
      else if (hh.kind === 'snare') burst(w.sparks, rnd, tipX, tipY, 6, N * 0.3, BRIGHT, 0.4);
    }
    if (f.section === 'drop' && !w.blast && w.fall === 0) blast();
    else if (f.section === 'change') w.hour = rollW(rnd, HOUR2_W, band);
    w.pulse *= Math.exp(-dt * 6);
    if (w.fall === 0 && w.lie <= 0) w.charge = Math.min(1.5, w.charge + dt * (0.02 + 0.05 * f.level + 0.05 * f.rel.bassDrive) * bps * 0.5);
    const ch = clamp(w.charge), wind = ch * (0.5 + 0.5 * f.rel.trebDrive) + 0.1 * windOf(f);
    if (beatLocked(f)) w.markA = ((f.beat.count % 12) + ease(f.beat.phase)) * (TAU / 12); else w.markA += dt * bps * (TAU / 12);
    // the fall after the blast: over about the feet like a felled post, lying a few beats, then up again
    if (w.fall > 0) { if (w.lie > 0) { w.lie -= dt; if (w.lie <= 0) { w.fall = 0; w.fv = 0; } } else { w.fv += ((1.5 * grav) / h) * Math.sin(w.fall) * dt; w.fall += w.fv * dt; if (w.fall >= Math.PI / 2) { w.fall = Math.PI / 2; w.lie = 4 / bps; burst(w.dust, rnd, mx - h * 0.6, g, 8, N * 0.15, LMID, 0.5); } } }
    // the plain: the sky of the hour, far hills, the ground and its grass leaning in the wind
    skyBands(r, N, hz, HOUR2_SKY[w.hour]);
    if (night) for (let k = 0; k < 30; k++) r.set(hash(k, 1) * N, hash(k, 2) * hz * 0.9, LMID);
    r.disc(0.8 * N, (night ? 0.15 : 0.2) * N, 0.05 * N, night ? BRIGHT : HOT);
    r.poly([[0, hz], [0.2 * N, hz - 0.05 * N], [0.45 * N, hz - 0.02 * N], [0.7 * N, hz - 0.07 * N], [N, hz - 0.01 * N], [N, hz + u], [0, hz + u]], DARK + DIM);
    r.rect(0, hz, N, N - hz, MID + DIM);
    for (const [gx, gy] of w.grass) { const x = gx * N, y = hz + gy * (N - hz), l = (2 + 3 * gy) * u, lean = wind * (1 - Math.min(1, Math.abs(x - mx) / (0.5 * N))) * l; r.line(x, y, x + lean + Math.sin(t * 3 + gx * 20) * u * 0.5, y - l, DARK + DIM); }
    // the explosion: the flash, the shockwave over the ground and up, the stem and the cap rising and slowing
    if (w.blast) {
      const B = w.blast; B.t += dt;
      B.vy = follow(B.vy, -N * 0.012, dt, 1.3); B.capY += B.vy * dt; B.rc += dt * N * (0.06 / (1 + B.t));
      const age = B.t, hot = age < 1.2, col = hot ? HOT : age < 3 ? LMID : age < 5 ? MID + DIM : DARK + DIM;
      if (age < 1.4) { const R = age * 1.3 * N; r.ring(B.x, B.y, R, Math.max(2, 3 * u), age < 0.5 ? BRIGHT : LMID, 0.3); r.ring(B.x, B.y, R * 0.8, Math.max(1, 2 * u), age < 0.5 ? BRIGHT : LMID + DIM); }
      const sw = B.rc * 0.45;
      r.rect(B.x - sw, B.capY, sw * 2, B.y - B.capY, col);
      r.disc(B.x, B.capY, B.rc, col); r.disc(B.x - B.rc * 0.7, B.capY + B.rc * 0.3, B.rc * 0.6, col); r.disc(B.x + B.rc * 0.7, B.capY + B.rc * 0.3, B.rc * 0.6, col);
      if (hot) { r.disc(B.x, B.capY, B.rc * 0.5, BRIGHT); r.rect(B.x - sw * 0.4, B.capY, sw * 0.8, B.y - B.capY, BRIGHT); }
      r.ring(B.x, B.y, B.rc * 1.4, Math.max(1, 2 * u), col, 0.3);
      if (age > 1.2) r.ring(B.x, B.capY, B.rc * 1.1, Math.max(1, u), hot ? BRIGHT : LMID + DIM, 0.4);
      targets.push({ x: B.x - B.rc, y: B.capY - B.rc, w: B.rc * 2, h: B.y - B.capY + B.rc });
      if (age > 8) w.blast = null;
    }
    w.dust = puffs(W, w.dust, 0, -N * 0.015, 6, LMID + DIM, MID + DIM, 60);
    w.debris = w.debris.filter((p) => { p.vy += grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.vy > 0 && p.y >= p.g) return false; r.rect(p.x, p.y, Math.max(1, 1.5 * u), Math.max(1, 1.5 * u), DARK); return p.life > 0; });
    // the rune ring round the feet, its marks stepping on the beat; a second one against it when the charge is up
    const R = (0.05 + 0.22 * ch) * N, ringCol = ch > 0.8 ? BRIGHT : ch > 0.4 ? COOL : COOL + DIM;
    if (w.fall === 0) {
      r.ring(mx, g, R, Math.max(1, 1.2 * u), ringCol, 0.3);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + w.markA; r.rect(mx + Math.cos(a) * R - u, g + Math.sin(a) * R * 0.3 - u, Math.max(1, 2 * u), Math.max(1, 2 * u), i % 3 ? ringCol : BRIGHT); }
      if (ch > 0.5) { r.ring(mx, g, R * 0.6, Math.max(1, u), ringCol, 0.3); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU - w.markA * 1.5; r.line(mx + Math.cos(a) * R * 0.5, g + Math.sin(a) * R * 0.15, mx + Math.cos(a) * R * 0.7, g + Math.sin(a) * R * 0.21, ringCol); } }
    }
    // the mage: the robe and the hat leaning from the wind, the staff up, the glow at its tip; felled after the blast
    const Pm = rotAt(mx, g, -w.fall), lean = wind * h * 0.08;
    r.rect(mx - h * 0.3, g, h * 0.6, Math.max(1, u), DARK);
    r.poly([Pm(-h * 0.14, -h * 0.72), Pm(h * 0.14, -h * 0.72), Pm(h * 0.3 + lean * 2, 0), Pm(-h * 0.3 + lean * 2.5, 0)], FIG);
    const [hx, hy] = Pm(0, -h * 0.82);
    r.disc(hx, hy, h * 0.1, FIG);
    r.poly([Pm(-h * 0.25 + lean, -h * 0.86), Pm(h * 0.25 + lean * 0.5, -h * 0.86), Pm(lean * 3, -h * 1.2 + Math.abs(lean))], FIG);
    const [sx0, sy0] = Pm(h * 0.12, -h * 0.6), [sx1, sy1] = Pm(h * 0.55, -h * 1.15);
    r.stroke(sx0, sy0, sx1, sy1, Math.max(1, h * 0.06), FIG);
    r.stroke(sx0 - h * 0.1, sy0 - h * 0.1, sx1 + (sx0 - sx1) * -0.15, sy1 + (sy0 - sy1) * -0.15, Math.max(1, h * 0.035), DARK);
    if (w.fall === 0) {
      const gr = (1.5 + 9 * ch) * u * (1 + 0.3 * w.pulse + 0.1 * f.beat.pulse);
      r.disc(sx1, sy1, gr, ch > 0.9 ? BRIGHT : HOT); r.disc(sx1, sy1, gr * 0.5, BRIGHT);
      if (w.pulse > 0.3) for (let k = 0; k < 4; k++) { const seed = Math.floor(t * 30) * 4 + k, a = hash(seed, 1) * TAU; let x = sx1, y = sy1; for (let i = 0; i < 4; i++) { const nx = x + Math.cos(a + (hash(seed, 3 + i) - 0.5) * 1.5) * gr * 0.6, ny = y + Math.sin(a + (hash(seed, 7 + i) - 0.5) * 1.5) * gr * 0.6; r.line(x, y, nx, ny, i < 2 ? BRIGHT : COOL); x = nx; y = ny; } }
    }
    targets.push({ x: mx - h * 0.4, y: g - h * 1.25, w: h * 1.1, h: h * 1.25 });
    // the pebbles: lifted as the charge builds, bobbing; dropped under gravity when it is spent
    for (const p of w.pebbles) {
      const px = p.x * N, want = ch > 0.3 && w.fall === 0 ? (ch - 0.3) * p.h * N * 1.4 : 0;
      if (want > 0) { p.y = follow(p.y, want, dt, 0.6); p.vy = 0; }
      else if (p.y > 0) { p.vy += grav * dt; p.y -= p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; } }
      const py = g + (p.x - 0.26) * 0.3 * N * 0.3, bob = p.y > u && want > 0 ? Math.sin(t * 2 + p.s) * u * 0.4 : 0; // the bob is in the drawing only, not in the height it holds
      if (p.y > u) r.rect(px - u, py, 2 * u, Math.max(1, u * 0.6), DARK + DIM);
      r.rect(px - u, py - p.y - bob - 1.5 * u, 2 * u, Math.max(1, 1.5 * u), p.y > u ? LMID : MID);
    }
    w.sparks = particles(W, w.sparks.filter((p) => p.y < g), BRIGHT);
    if (w.flash > 0) { w.flash -= dt; r.fill(WHITE); }
  },
};

// ---------------------------------------------------------------------------------------------- one punch
// A caped hero and the monster of the day on the plain outside the city: the monster charges in (its gait keeps up
// with its speed), swings on the snares (the hero sidesteps, leaving an after-image), and every kick is one punch
// that sends it flying out of frame on a parabola, the harder the hit the faster and farther; the next one comes in
// from the other side and the hero turns to meet it. A drop is the serious punch: a shockwave that parts the clouds
// overhead for a few bars. Kinds: the monster, beast, mech or blob.
const MONSTER_W = { beast: [3, 2, 1], mech: [2, 2, 2], blob: [1, 2, 3] };

// the monster with its feet at (x, g), `H` tall, facing `d`, rotated by `rot` about its middle in flight; `ph` is
// the gait, `sw` how far into a swing, `sq` the squash of a hit
function monster(r, kind, x, g, H, d, rot, ph, sw, sq, u) {
  const P = rotAt(x, g - H * 0.5, rot), col = FIG;
  if (kind === 'blob') {
    const hop = Math.abs(Math.sin(ph)) * H * 0.1, ry = H * 0.42 * (1 - 0.3 * sq) + hop * 0.2, rx = H * 0.45 * (1 + 0.3 * sq);
    r.ring(...P(0, H * 0.5 - ry - hop), ry * 0.5 * (rx / ry), ry * (rx / ry), col, ry / rx);
    for (const [ex, ey, es] of [[-0.2, -0.1, 0.06], [0.15, -0.18, 0.08], [0.3, 0.05, 0.05]]) r.disc(...P(ex * H * d, H * 0.5 - ry - hop + ey * H), es * H, BRIGHT);
    r.stroke(...P(d * H * 0.1, H * 0.5 - ry * 0.5 - hop), ...P(d * H * 0.5, H * 0.5 - ry * 0.6 - hop), Math.max(1, H * 0.06), col);
    return;
  }
  const bob = Math.abs(Math.sin(ph)) * H * 0.03;
  if (kind === 'beast') {
    r.ring(...P(0, H * 0.05 - bob), H * 0.2, H * 0.4, col, 0.75);
    for (let k = 0; k < 4; k++) { const fx = (k < 2 ? 0.25 : -0.3) * H * d + (k % 2 ? 0.08 : -0.08) * H, st = Math.sin(ph + (k % 2 ? Math.PI : 0) + (k < 2 ? 0 : 1)) * H * 0.1; r.stroke(...P(fx, H * 0.2 - bob), ...P(fx + st, H * 0.5), Math.max(1, H * 0.09), col); }
    r.disc(...P(d * H * 0.45, -H * 0.1 - bob - sw * H * 0.05), H * 0.2, col);
    for (const k of [-1, 1]) r.poly([P(d * H * 0.45 + k * H * 0.08, -H * 0.25 - bob), P(d * H * 0.45 + k * H * 0.3, -H * 0.5 - bob), P(d * H * 0.45 + k * H * 0.16, -H * 0.2 - bob)], col);
    r.rect(...P(d * H * 0.5, -H * 0.14 - bob), Math.max(1, 2 * u), Math.max(1, u), HOT);
    r.stroke(...P(d * H * 0.3, -H * 0.05 - bob), ...P(d * H * (0.3 + 0.45 * sw), H * 0.15 - sw * H * 0.3), Math.max(1, H * 0.08), col); // the paw that swings
    r.stroke(...P(-d * H * 0.35, -bob), ...P(-d * H * 0.7, -H * 0.2 + Math.sin(ph * 0.5) * H * 0.1), Math.max(1, H * 0.05), col);
    return;
  }
  r.poly([P(-H * 0.25, -H * 0.3 - bob), P(H * 0.25, -H * 0.3 - bob), P(H * 0.2, H * 0.2 - bob), P(-H * 0.2, H * 0.2 - bob)], col);
  r.rect(...P(-H * 0.14, -H * 0.5 - bob), H * 0.28, H * 0.2, col);
  r.rect(...P(-H * 0.1 + d * H * 0.04, -H * 0.44 - bob), H * 0.16, Math.max(1, u), HOT);
  for (const k of [-1, 1]) { const lift = Math.max(0, Math.sin(ph + (k > 0 ? 0 : Math.PI))) * H * 0.08; r.rect(...P(k * H * 0.16 - H * 0.06, H * 0.2 - bob), H * 0.12, H * 0.3 - lift + bob, col); r.rect(...P(k * H * 0.16 - H * 0.08, H * 0.42 - lift), H * 0.16, H * 0.08, col); }
  r.stroke(...P(d * H * 0.25, -H * 0.25 - bob), ...P(d * H * (0.3 + 0.4 * sw), -H * 0.05 - sw * H * 0.35), Math.max(1, H * 0.1), col);
  r.stroke(...P(-d * H * 0.25, -H * 0.25 - bob), ...P(-d * H * 0.35, H * 0.05), Math.max(1, H * 0.1), col);
}

const onepunch = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, MONSTER_W, band), dir: 1, punch: 0, dodge: 0, serious: 0, gap: 0, gapT: 0, gapX: 0.5 * N, sparks: [], lines: 0, shock: null, flash: 0, mon: { x: 1.3 * N, y: 0, mode: 'in', vx: 0, vy: 0, rot: 0, rv: 0, ph: 0, H: 0.42 * N, sw: 0, sq: 0, hop: 0 }, count: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = 0.8 * N, hx0 = 0.5 * N, h = 0.22 * N, grav = G(N), bps = bpsOf(f), m = w.mon, d = w.dir;
    const spawn = () => { w.count++; w.kind = rollW(rnd, MONSTER_W, band); w.dir = -w.dir; const nd = w.dir; Object.assign(m, { x: hx0 + nd * 0.8 * N, y: 0, mode: 'in', vx: 0, vy: 0, rot: 0, rv: 0, ph: 0, H: (0.36 + rnd() * 0.14) * N, sw: 0, sq: 0 }); };
    const near = m.mode !== 'fly' && Math.abs(m.x - hx0) < m.H * 0.75;
    const hit = (strength, serious) => { // the punch lands: the monster leaves on a parabola, faster the harder the hit
      w.punch = 1; w.lines = 0.1;
      if (!near) return;
      m.mode = 'fly'; m.vx = d * N * (0.9 + 1.6 * strength) * (serious ? 1.6 : 1); m.vy = -N * (0.25 + 0.6 * strength); m.rv = d * (5 + 9 * strength); m.sq = 1;
      burst(w.sparks, rnd, hx0 + d * h * 0.6, g - h * 0.75, 14 + (serious ? 30 : 0), N * 0.5, BRIGHT, 0.4); s.shake = Math.max(s.shake, serious ? 1 : 0.4 * strength);
    };
    for (const hh of hits) {
      if (isLow(hh)) hit(hh.strength, false);
      else if (hh.kind === 'snare' && m.mode !== 'fly' && near) { m.sw = 1; w.dodge = 1; }
    }
    if (f.section === 'drop') { w.serious = 1; w.gapX = hx0 + d * 0.15 * N; w.gapT = 8 / bps + 1; w.shock = { R: 0, life: 0.9 }; w.flash = 0.035; hit(1, true); }
    else if (f.section === 'change' && m.mode !== 'fly') w.kind = rollW(rnd, MONSTER_W, band);
    w.punch *= Math.exp(-dt * 7); w.dodge *= Math.exp(-dt * 4); w.lines -= dt; m.sw *= Math.exp(-dt * 4); m.sq *= Math.exp(-dt * 10); w.gapT -= dt;
    w.gap = follow(w.gap, w.gapT > 0 ? 0.3 * N : 0, dt, w.gapT > 0 ? 0.3 : 1.5);
    // the monster: in at a charge, standing in reach, or flying out; a new one from the other side after
    if (m.mode === 'in') { const v = N * 0.45, step = Math.min(v * dt, Math.max(0, Math.abs(m.x - hx0) - m.H * 0.6)); m.x -= Math.sign(m.x - hx0) * step; m.ph += (step * Math.PI) / (m.H * 0.3); if (step < v * dt * 0.5) m.mode = 'stand'; }
    else if (m.mode === 'stand') { if (w.kind === 'blob') m.ph = beatLocked(f) ? f.beat.phase * Math.PI : t * bps * Math.PI; }
    else { // the flight: a parabola, and a weak punch has it back on the ground before the edge, where it bounces and tumbles on out
      m.vy += grav * dt; m.x += m.vx * dt; m.y += m.vy * dt; m.rot += m.rv * dt;
      if (m.y >= 0 && m.vy > 0) { m.y = 0; if (m.vy > N * 0.12) { m.vy = -m.vy * 0.35; m.vx *= 0.85; m.rv *= 0.6; s.shake = Math.max(s.shake, 0.2); burst(w.sparks, rnd, m.x, g, 6, N * 0.2, LMID + DIM, 0.4); } else m.vy = 0; } // a real bounce costs speed; settled, it slides on out
      if (m.x < -0.5 * N || m.x > 1.5 * N) spawn();
    }
    // the sky, the cloud bank (parted by the serious punch), the ruined skyline, the ground
    skyBands(r, N, g, [COOL, LMID, LMID, BRIGHT, BRIGHT]);
    for (let k = -1; k < 10; k++) { const x = (k / 8 + f.rel.midClock * 0.004) * N * 1.1 - 0.05 * N, y = (0.14 + 0.06 * Math.sin(k * 2.3)) * N; if (Math.abs(x - w.gapX) > w.gap + 0.05 * N) cloud(r, x, y, 0.28 * N, 0.1 * N, LMID); else if (w.gap > 2 * u) { const q = Math.sign(x - w.gapX) || 1; cloud(r, w.gapX + q * (w.gap + 0.08 * N), y - 0.02 * N, 0.2 * N, 0.08 * N, LMID); } }
    if (w.gap > 2 * u) r.poly([[w.gapX - w.gap * 0.5, 0], [w.gapX + w.gap * 0.5, 0], [w.gapX + w.gap * 1.2, g], [w.gapX - w.gap * 1.2, g]], w.serious > 0.6 ? BRIGHT : LMID); // the light through the parted clouds
    for (let k = 0; k < 12; k++) { const bx = k * 0.085 * N + hash(k, 1) * 0.03 * N, bh = (0.05 + hash(k, 2) * 0.12) * N; r.rect(bx, g - bh, 0.05 * N, bh, DARK + DIM); if (hash(k, 3) < 0.5) r.poly([[bx, g - bh], [bx + 0.05 * N, g - bh - 0.03 * N * hash(k, 4)], [bx + 0.05 * N, g - bh]], DARK + DIM); }
    r.rect(0, g, N, N - g, MID + DIM);
    r.rect(0, g, N, Math.max(1, u), LMID + DIM);
    // the monster's shadow on the ground under it (smaller the higher it flies), the monster (it stands behind the hero's line), then the hero
    const shk = clamp(1 + m.y / (0.5 * N), 0.3, 1);
    r.ring(m.x, g, m.H * 0.2 * shk, m.H * 0.4 * shk, DARK + DIM, 0.3);
    monster(r, w.kind, m.x, g + m.y, m.H, -d, m.rot, m.ph, m.sw, m.sq, u);
    if (m.mode === 'fly' && w.serious > 0.3) for (let k = 1; k < 5; k++) r.disc(m.x - m.vx * 0.02 * k, g + m.y - m.H * 0.5 - m.vy * 0.02 * k, m.H * 0.15 * (1 - k / 5), k % 2 ? BRIGHT : LMID);
    targets.push({ x: m.x - m.H * 0.5, y: g + m.y - m.H, w: m.H, h: m.H });
    const hx = hx0 - d * w.dodge * 0.08 * N;
    const hero = (x, col, capeCol) => {
      const J = walker(r, x, g, h, col, 0.3, d, {}), wind = 0.4 + windOf(f) * 0.5 + w.punch, flap = Math.sin(t * 9) * u * 0.6;
      r.poly([[x - d * J.hw, J.sy], [x + d * J.hw * 0.4, J.sy], [x - d * (J.hw + h * 0.45 * wind), J.sy + h * 0.5 - h * 0.1 * wind + flap], [x - d * (J.hw + h * 0.25 * wind), J.sy + h * 0.65]], capeCol);
      r.rect(x - J.hw, J.sy, 2 * J.hw, h * 0.4, col);
      r.disc(x, J.head, h * 0.11, col);
      const fx = x + d * (J.hw + h * (0.1 + 0.5 * w.punch)), fy = J.sy + h * 0.05 - w.punch * h * 0.02;
      r.stroke(x + d * J.hw * 0.8, J.sy + h * 0.04, fx, fy, Math.max(1, h * 0.08), col); r.disc(fx, fy, h * 0.06, col);
      return [fx, fy];
    };
    if (w.dodge > 0.3) hero(hx0, DARK + DIM, HOT + DIM); // where he was a moment ago
    const [fx, fy] = hero(hx, FIG, HOT);
    if (w.lines > 0) for (let i = 0; i < 10; i++) { const a = d > 0 ? (i - 4.5) * 0.12 : Math.PI + (i - 4.5) * 0.12, l0 = h * 0.4 + hash(i, 1) * h * 0.4; r.line(fx + Math.cos(a) * l0, fy + Math.sin(a) * l0, fx + Math.cos(a) * N, fy + Math.sin(a) * N, i % 2 ? BRIGHT : FIG); }
    if (w.shock) { const S = w.shock; S.R += dt * N * 1.6; S.life -= dt; r.ring(fx, fy, S.R, Math.max(2, 3 * u), S.life > 0.6 ? BRIGHT : LMID); r.ring(fx, g, S.R * 1.1, Math.max(1, 2 * u), LMID + DIM, 0.3); if (S.life <= 0) w.shock = null; }
    w.serious = Math.max(0, w.serious - dt / 3);
    targets.push({ x: hx - h * 0.5, y: g - h * 1.05, w: h, h: h * 1.05 });
    w.sparks = particles(W, w.sparks.filter((p) => p.y < g), BRIGHT);
    if (w.flash > 0) { w.flash -= dt; r.fill(WHITE); }
  },
};

const WORLDS = { wallgiants, spiraldrill, mushiforest, schoolband, recital, transmutation, casino, giantchess, freedive, skymages, tougedrift, seatrain, explosionmage, onepunch };
registerFamily('anime', WORLD_DEFS, WORLDS);
