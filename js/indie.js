// Indie game genres, mixed. Twelve worlds in the visual language of indie games, original art only: a bullet hell,
// a climb up a mountain chimney, a farm, a battle box, a bug knight's cavern, a village on a turning cube, a
// sand-surfer with a long scarf, a spaceship cutaway with its crew, a card battle, a metroidvania, a silhouette
// forest and a survivors arena. Each draws with the eight palette roles, so any palette, treatment and layout of
// the mixer fits; the variant tables are weighed by the mood's arousal band, re-rolled on a section change, the
// heavy one on a drop. No text, no names, no characters or assets from any actual game.
import { clamp, lerp } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow, wrapAngle, ease,
  beatLocked, hash, pickW, walker, particles, burst, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  danmaku: { name: 'bullet hell', va: [[M, H], [L, H], [H, H]], pals: ['neon', 'cga', 'midnight', 'crystal', 'toxic'], fx: ['none', 'crt'] },
  climb: { name: 'the climb', va: [[M, M], [M, H]], pals: ['ice', 'midnight', 'pastel', 'crystal', 'gameboy'], fx: ['none', 'crt', 'frame'] },
  farm: { name: 'the farm', va: [[M, L], [H, M], [H, L]], pals: ['pastel', 'gameboy', 'parchment', 'sepia', 'candy'], fx: ['none', 'crt', 'frame'] },
  dodgebox: { name: 'battle box', va: [[M, H], [L, H], [H, H]], pals: ['noir', 'cga', 'silver', 'amber'], fx: ['none', 'crt'] },
  caveknight: { name: 'bug knight', va: [[M, M], [M, H]], pals: ['midnight', 'noir', 'silver', 'crystal', 'cult'], fx: ['none', 'film', 'crt'] },
  rotatecube: { name: 'turning cube', va: [[M, L], [H, M], [H, L]], pals: ['pastel', 'parchment', 'crystal', 'amber', 'vapor'], fx: ['none', 'frame'] },
  desertscarf: { name: 'sand surfer', va: [[M, L], [H, M], [H, L]], pals: ['sepia', 'amber', 'parchment', 'pastel', 'vapor'], fx: ['film', 'none'] },
  shipcrew: { name: 'ship cutaway', va: [[M, H], [L, H], [H, H]], pals: ['cga', 'neon', 'midnight', 'amber', 'blueprint'], fx: ['none', 'crt', 'frame'] },
  cardbattle: { name: 'card battle', va: [[M, M], [L, M]], pals: ['parchment', 'midnight', 'cult', 'sepia', 'royal'], fx: ['none', 'frame', 'film'] },
  metroidmap: { name: 'metroidvania', va: [[M, M], [M, H]], pals: ['neon', 'cga', 'midnight', 'phosphor', 'warband'], fx: ['none', 'crt', 'frame'] },
  limbo: { name: 'silhouette forest', va: [[L, L], [L, M]], pals: ['noir', 'silver', 'sepia', 'midnight'], fx: ['film', 'none', 'vhs'] },
  survivors: { name: 'survivors arena', va: [[M, H], [L, H], [H, H]], pals: ['warband', 'cga', 'neon', 'crypt', 'amber'], fx: ['none', 'crt', 'frame'] },
};

// the arousal band a mood falls in (low, mid, high): the variant tables below weigh their kinds by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bpsOf = (f) => (f.bpm ? f.bpm / 60 : 2);

// particles without gravity, for the top-down worlds and for smoke: they drift, drag and fade
function drift(W, list, col, drag = 2) {
  const { r, u, dt } = W, k = Math.exp(-dt * drag);
  for (const p of list) {
    p.vx *= k; p.vy *= k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), p.c ?? col);
  }
  return list.filter((p) => p.life > 0);
}

// a column of one colour from y0 to y1 (exclusive), straight into the buffer: the heightfield layers draw with it
function vfill(r, x, y0, y1, c) {
  const N = r.N, X = Math.round(x);
  if (X < 0 || X >= N) return;
  const a = Math.max(0, Math.round(y0)), b = Math.min(N, Math.round(y1)), buf = r.buf;
  for (let y = a; y < b; y++) buf[y * N + X] = c;
}

// a crescent: an arc of short strokes centred on (cx, cy), radius R, about the centre angle a0, spanning `span`
// radians either side
function crescent(r, cx, cy, R, a0, span, lw, col, n = 9) {
  let px = cx + Math.cos(a0 - span) * R, py = cy + Math.sin(a0 - span) * R;
  for (let k = 1; k <= n; k++) {
    const a = a0 - span + (2 * span * k) / n, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    r.stroke(px, py, x, y, lw, col);
    px = x; py = y;
  }
}

// ---------------------------------------------------------------------------------------------- danmaku
// Bullet hell: a tiny ship weaving along the bottom, a boss silhouette at the top. Kicks fire rings of bullets
// from the boss, spiral arms turn with the bass clock, snares aim a stream at the ship, a drop sweeps a laser;
// a bullet that just misses the ship throws graze sparks. The pattern set and the boss's build are rolled by
// arousal band, re-rolled on a section change.
const PATTERNS = {
  rings: { ring: 18, arms: 0, aim: 3, wave: 0 }, // fat rings on the kick, a short aimed burst on the snare
  spirals: { ring: 8, arms: 3, aim: 2, wave: 0 }, // arms turning with the bass
  waves: { ring: 10, arms: 0, aim: 4, wave: 1 }, // sheets of bullets rippling down on the beat
  lasers: { ring: 12, arms: 2, aim: 5, wave: 0, laser: true }, // a sweeping beam on the hard snares too
};
const PATTERN_W = { rings: [3, 2, 1], waves: [2, 2, 1], spirals: [1, 3, 2], lasers: [0, 1, 3] };
const BOSSES = { moth: [3, 2, 1], crab: [1, 2, 2], eye: [1, 2, 3] };

// the boss at (x, y) with wingspan R, in its pose phase `ph`; flashes bright when it fires
function drawBoss(r, kind, x, y, R, ph, fl, u) {
  const c = fl ? BRIGHT : DARK, c2 = fl ? BRIGHT : MID;
  if (kind === 'moth') { // wide wings that beat, a furry body, two feelers
    const flap = 0.75 + 0.25 * Math.sin(ph * 2);
    for (const k of [-1, 1]) {
      r.poly([[x + k * R * 0.1, y - R * 0.1], [x + k * R, y - R * 0.45 * flap], [x + k * R * 0.9, y + R * 0.1], [x + k * R * 0.5, y + R * 0.4 * flap]], c);
      r.poly([[x + k * R * 0.45, y - R * 0.2 * flap], [x + k * R * 0.75, y - R * 0.3 * flap], [x + k * R * 0.6, y - R * 0.05]], c2);
      r.line(x + k * R * 0.05, y - R * 0.3, x + k * R * 0.3, y - R * 0.6, c);
    }
    r.rect(x - R * 0.1, y - R * 0.35, R * 0.2, R * 0.75, c);
    r.disc(x, y - R * 0.35, R * 0.12, c);
  } else if (kind === 'crab') { // a flat shell on legs, two claws that open and close
    r.poly([[x - R * 0.55, y], [x - R * 0.3, y - R * 0.3], [x + R * 0.3, y - R * 0.3], [x + R * 0.55, y], [x + R * 0.3, y + R * 0.25], [x - R * 0.3, y + R * 0.25]], c);
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) r.line(x + s * R * 0.4, y + R * (0.05 + k * 0.08), x + s * R * (0.7 + k * 0.1), y + R * (0.3 + k * 0.1 + 0.05 * Math.sin(ph * 3 + k)), c);
    const op = 0.15 + 0.15 * Math.abs(Math.sin(ph));
    for (const s of [-1, 1]) {
      r.stroke(x + s * R * 0.5, y - R * 0.1, x + s * R * 0.95, y - R * 0.35, 2.5 * u, c2);
      r.stroke(x + s * R * 0.95, y - R * 0.35, x + s * R * 1.1, y - R * (0.35 + op), 2 * u, c2);
      r.stroke(x + s * R * 0.95, y - R * 0.35, x + s * R * 1.12, y - R * (0.35 - op), 2 * u, c2);
    }
  } else { // eye: a ringed orb with a slit pupil that follows its phase, spikes round it
    r.ring(x, y, R * 0.55, Math.max(1, 1.5 * u), c);
    for (let k = 0; k < 8; k++) { const a = ph * 0.4 + (k * TAU) / 8; r.stroke(x + Math.cos(a) * R * 0.6, y + Math.sin(a) * R * 0.6, x + Math.cos(a) * R * 0.95, y + Math.sin(a) * R * 0.95, 1.5 * u, c); }
    r.disc(x, y, R * 0.42, c2);
    r.disc(x + Math.sin(ph * 0.7) * R * 0.1, y, R * 0.22, fl ? HOT : BRIGHT);
    r.rect(x + Math.sin(ph * 0.7) * R * 0.1 - u, y - R * 0.18, 2 * u, R * 0.36, BLACK);
  }
}

const danmaku = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { pat: rollW(rnd, PATTERN_W, band), boss: rollW(rnd, BOSSES, band), bullets: [], sparks: [], stars: Array.from({ length: 40 }, () => [rnd(), rnd(), rnd() < 0.3 ? 2 : 1]),
      sx: 0.5, sy: 0.84, hurt: 0, flash: 0, grazes: 0, spiral: 0, laser: null, swapT: 0, exhaust: [], bossPh: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, P = PATTERNS[w.pat], band = bandOf(W.a), drive = clamp(f.rel.bassDrive);
    if (f.section === 'change') { w.pat = rollW(rnd, PATTERN_W, band); w.boss = rollW(rnd, BOSSES, band); w.swapT = 0.6; }
    // the ship weaves with the mid clock, the boss drifts with the treble clock and bobs on the beat
    w.sx = 0.5 + 0.32 * Math.sin(f.rel.midClock * 0.9) * Math.cos(f.rel.midClock * 0.23);
    w.sy = 0.84 + 0.05 * Math.sin(f.rel.midClock * 1.7);
    const sx = w.sx * N, sy = w.sy * N, bR = 0.13 * N * (1 + 0.06 * f.beat.pulse);
    const bx = N / 2 + 0.22 * N * Math.sin(f.rel.trebClock * 0.35), by = 0.17 * N + 2 * u * Math.sin(t * 1.3) - 2.5 * u * f.beat.pulse, ex = bx, ey = by + bR * 0.3;
    w.bossPh += dt * (1 + 2 * drive);
    const shoot = (a, v, c, delay = 0, big = false) => { if (w.bullets.length < 420) w.bullets.push({ x: ex, y: ey, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c, delay, big, grazed: false }); };
    const vb = N * (0.22 + 0.25 * drive);
    for (const h of hits) {
      if (isLow(h)) { // a ring, offset half a step from the last one so the rings interleave
        w.flash = 0.1;
        const n = P.ring + Math.round(6 * h.strength), off = (f.beat.count % 2) * (Math.PI / n);
        for (let k = 0; k < n; k++) shoot(off + (k * TAU) / n, vb * (0.8 + 0.4 * h.strength), HOT, 0, h.strength > 0.8);
      } else if (h.kind === 'snare') { // a stream aimed at where the ship is now, one bullet after another
        const a = Math.atan2(sy - ey, sx - ex);
        for (let k = 0; k < P.aim; k++) shoot(a + (rnd() - 0.5) * 0.06, vb * 1.5, COOL, k * 0.06);
        if (P.laser && h.strength > 0.8 && !w.laser) w.laser = { t: 0, dur: 1.2, a0: a - 0.5, a1: a + 0.5 };
      } else if (isTonal(h) && P.wave) { // a sheet of bullets, its ripple set by the pitch
        for (let k = -4; k <= 4; k++) shoot(Math.PI / 2 + k * 0.12, vb * (0.9 + 0.15 * Math.sin(k + h.pc)), LMID, Math.abs(k) * 0.03);
      }
    }
    // the spiral arms: a bullet per arm every so far along the bass clock
    if (w.spiral < f.rel.bassClock - 1) w.spiral = f.rel.bassClock;
    if (P.arms) while (w.spiral < f.rel.bassClock) { w.spiral += 0.16; for (let k = 0; k < P.arms; k++) shoot(w.spiral * 2.2 + (k * TAU) / P.arms, vb * 0.8, HOT); }
    if (f.beat.on && P.wave && f.beat.count % 2 === 0) for (let k = -5; k <= 5; k++) shoot(Math.PI / 2 + k * 0.1, vb * 0.7, LMID, Math.abs(k) * 0.05);
    if (f.section === 'drop') { w.laser = { t: 0, dur: 2.2, a0: 0.25, a1: Math.PI - 0.25 }; s.shake = Math.max(s.shake, 0.5); }
    w.flash -= dt; w.hurt -= dt; w.swapT -= dt;
    // the backdrop: stars streaming down, quicker with the level; the far ones are dim and slow
    for (const st of w.stars) {
      st[1] = (st[1] + dt * (0.08 + 0.25 * f.level) * (st[2] === 2 ? 1 : 0.45)) % 1;
      r.rect(st[0] * N, st[1] * N, Math.max(1, u * 0.6 * st[2]), Math.max(1, u * st[2]), st[2] === 2 ? LMID : DARK + DIM);
    }
    // the laser: a thin warning line first, then the beam sweeping from a0 to a1
    if (w.laser) {
      const Lz = w.laser, q = Lz.t / Lz.dur, a = lerp(Lz.a0, Lz.a1, ease(q)), len = N * 1.5;
      if (Lz.t < 0.3) r.line(ex, ey, ex + Math.cos(a) * len, ey + Math.sin(a) * len, HOT + DIM);
      else {
        r.stroke(ex, ey, ex + Math.cos(a) * len, ey + Math.sin(a) * len, 7 * u * Math.min(1, (Lz.t - 0.3) * 5), HOT);
        r.stroke(ex, ey, ex + Math.cos(a) * len, ey + Math.sin(a) * len, 2.5 * u, BRIGHT);
        const dd = Math.abs(Math.sin(a) * (sx - ex) - Math.cos(a) * (sy - ey)); // the ship's distance from the beam line
        if (dd < 4 * u && w.hurt <= 0) { w.hurt = 0.5; s.shake = Math.max(s.shake, 0.4); }
        s.shake = Math.max(s.shake, 0.12);
      }
      if ((Lz.t += dt) > Lz.dur) w.laser = null;
    }
    drawBoss(r, w.boss, bx, by, bR, w.bossPh, w.flash > 0 || w.swapT > 0, u);
    targets.push({ x: bx - bR, y: by - bR * 0.5, w: 2 * bR, h: bR });
    // the bullets fly their headings and leave by the edges; a near miss grazes, a hit flashes the ship
    const bw = Math.max(1, 2 * u);
    w.bullets = w.bullets.filter((b) => {
      if ((b.delay -= dt) > 0) return true;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -4 * u || b.x > N + 4 * u || b.y < -4 * u || b.y > N + 4 * u) return false;
      const d = Math.hypot(b.x - sx, b.y - sy + 2 * u);
      if (d < 1.6 * u && w.hurt <= 0) { w.hurt = 0.7; s.shake = Math.max(s.shake, 0.35); burst(w.sparks, rnd, sx, sy, 14, N * 0.35, BRIGHT, 0.5); return false; }
      if (!b.grazed && d < 5 * u) { b.grazed = true; w.grazes++; for (let k = 0; k < 3; k++) w.sparks.push({ x: b.x, y: b.y, vx: b.vx * 0.3 + (rnd() - 0.5) * N * 0.2, vy: b.vy * 0.3 - N * 0.2, life: 0.3, c: BRIGHT }); }
      if (b.big) r.disc(b.x, b.y, 2.2 * u, b.c); else r.rect(b.x - u, b.y - u, bw, bw, b.c);
      return true;
    });
    w.sparks = particles(W, w.sparks, BRIGHT);
    // the ship: a dart with two fins, the exhaust streaming back down the screen, a blink while it is hurt
    for (let k = 0, n = Math.max(1, Math.round(30 * dt)); k < n; k++) w.exhaust.push({ x: sx + (rnd() - 0.5) * u, y: sy + 3 * u, vx: (rnd() - 0.5) * N * 0.05, vy: N * (0.15 + 0.2 * f.level), life: 0.25, c: f.beat.pulse > 0.5 ? BRIGHT : HOT }); // so many a second, whatever the frame rate
    w.exhaust = drift(W, w.exhaust, HOT, 1);
    if (w.hurt <= 0 || Math.floor(t * 20) % 2) {
      r.poly([[sx, sy - 5 * u], [sx + 3.5 * u, sy + 3 * u], [sx, sy + 1.5 * u], [sx - 3.5 * u, sy + 3 * u]], FIG);
      r.rect(sx - u * 0.5, sy - 2 * u, Math.max(1, u), 3 * u, COOL);
      r.rect(sx - u * 0.5, sy, Math.max(1, u), Math.max(1, u), w.hurt > 0 ? HOT : BRIGHT); // the hitbox
    }
    targets.push({ x: sx - 4 * u, y: sy - 5 * u, w: 8 * u, h: 9 * u });
    for (let k = 0; k < w.grazes % 16; k++) r.rect(2 * u + k * 2.5 * u, N - 3 * u, Math.max(1, 1.5 * u), 2 * u, COOL);
  },
};

// ---------------------------------------------------------------------------------------------- climb
// A pixel platformer up a mountain: a climber in the gap between two rock towers, clinging to a wall and climbing
// it (quicker with the energy), wall-jumping across on a kick (a parabola to the far wall), dashing straight
// across on a snare with afterimages, standing on the ledges it lands on; crumbly ledges go from under it, gems
// float in the gap, a flag is planted ahead on a section change. The biome is rolled by arousal band and
// re-rolled on a section change; a drop is the summit, with stars and a blizzard. The height is a bar of pips.
const BIOMES = {
  snow: { rock: MID, rim: LMID, fall: 'snow', wind: 1 },
  forest: { rock: DARK, rim: MID, fall: 'leaves', wind: 0.5, vines: true },
  ruins: { rock: DARK, rim: MID, fall: 'dust', wind: 0.3, bricks: true },
  summit: { rock: MID, rim: BRIGHT, fall: 'snow', wind: 2.5, stars: true },
};
const BIOME_W = { snow: [3, 2, 1], forest: [2, 2, 1], ruins: [1, 2, 2], summit: [0, 1, 2] };

// the climber with its feet (or its hanging point) at (cx, cy): clinging to the wall on side sd, standing, in the
// air, or dashing; the hair streams toward hx
function drawClimber(r, cx, cy, H0, col, pose, ph, sd, u, hx) {
  const bw = 2 * u, lw = Math.max(1, u);
  if (pose === 'cling') {
    const a = Math.sin(ph), wx = cx + sd * bw * 1.3;
    r.rect(cx - bw * 0.8, cy - H0 * 0.62, bw * 1.6, H0 * 0.42, col);
    r.stroke(cx, cy - H0 * 0.55, wx, cy - H0 * (0.88 + 0.1 * a), lw, col);
    r.stroke(cx, cy - H0 * 0.48, wx, cy - H0 * (0.72 - 0.1 * a), lw, col);
    r.stroke(cx, cy - H0 * 0.24, wx, cy - H0 * (0.1 + 0.08 * a), lw, col);
    r.stroke(cx, cy - H0 * 0.22, wx, cy + H0 * (0.04 - 0.08 * a), lw, col);
    r.disc(cx, cy - H0 * 0.78, H0 * 0.16, col);
  } else if (pose === 'stand') {
    r.rect(cx - bw * 0.8, cy - H0 * 0.72, bw * 1.6, H0 * 0.42, col);
    r.rect(cx - bw * 0.7, cy - H0 * 0.3, lw, H0 * 0.3, col);
    r.rect(cx + bw * 0.1, cy - H0 * 0.3, lw, H0 * 0.3, col);
    r.rect(cx - bw * 1.1, cy - H0 * 0.68, lw, H0 * 0.32, col);
    r.rect(cx + bw * 0.6, cy - H0 * 0.68, lw, H0 * 0.32, col);
    r.disc(cx, cy - H0 * 0.88, H0 * 0.16, col);
  } else if (pose === 'dash') {
    r.rect(cx - bw * 1.6, cy - H0 * 0.55, bw * 3.2, H0 * 0.3, col);
    r.stroke(cx + hx * bw, cy - H0 * 0.5, cx + hx * bw * 2.4, cy - H0 * 0.3, lw, col);
    r.disc(cx - hx * bw * 1.8, cy - H0 * 0.5, H0 * 0.16, col);
  } else { // in the air: arms up and out, legs apart
    r.rect(cx - bw * 0.8, cy - H0 * 0.7, bw * 1.6, H0 * 0.4, col);
    r.stroke(cx - bw * 0.5, cy - H0 * 0.3, cx - bw * 1.3, cy, lw, col);
    r.stroke(cx + bw * 0.5, cy - H0 * 0.3, cx + bw * 1.1, cy - H0 * 0.1, lw, col);
    r.stroke(cx - bw * 0.6, cy - H0 * 0.65, cx - bw * 1.6, cy - H0 * 0.95, lw, col);
    r.stroke(cx + bw * 0.6, cy - H0 * 0.65, cx + bw * 1.6, cy - H0 * 0.9, lw, col);
    r.disc(cx, cy - H0 * 0.86, H0 * 0.16, col);
  }
  const hy = cy - H0 * (pose === 'cling' ? 0.84 : pose === 'dash' ? 0.56 : 0.94), hxx = pose === 'dash' ? cx - hx * bw * 1.8 : cx;
  for (let k = 1; k <= 3; k++) r.rect(hxx + hx * k * u * 0.9 - u * 0.5, hy - u + k * u * 0.25, Math.max(1, u), Math.max(1, u), HOT);
}

const climb = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { alt: 0, x: 0, vx: 0, vy: 0, st: 'cling', sd: -1, on: -1, cam: 0, biome: rollW(rnd, BIOME_W, bandOf(W.a)), got: {}, broken: {}, flag: null,
      ghosts: [], flakes: [], pops: [], ph: 0, dashT: 0, crumble: 0, gems: 0, spark: 0, swapT: 0, dashOk: true, jumpT: -1 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, T = N / 14, B = BIOMES[w.biome], g = 2.4 * N, bw = 2 * u, H0 = 0.085 * N;
    const sm = (q) => q * q * (3 - 2 * q);
    const edge = (A, side) => { // the inner edge of a wall at altitude A: per-row values, smoothed between rows
      const k = Math.floor(A / T), q = sm(A / T - k);
      return side < 0 ? N * lerp(0.22 + 0.12 * hash(k, 11), 0.22 + 0.12 * hash(k + 1, 11), q) : N * lerp(0.78 - 0.12 * hash(k, 12), 0.78 - 0.12 * hash(k + 1, 12), q);
    };
    const ledge = (k) => { // the ledge in row k, if any: which wall it juts from, how far, where its top is
      if (k < 1 || hash(k, 13) >= 0.3) return null;
      const side = hash(k, 14) < 0.5 ? -1 : 1, top = k * T + 0.5 * T, len = T * (0.9 + 0.8 * hash(k, 15)), wx = edge(top, side);
      return { k, side, top, x0: side < 0 ? wx : wx - len, x1: side < 0 ? wx + len : wx, crumbly: hash(k, 16) < 0.35 };
    };
    const gemAt = (k) => (k > 0 && hash(k, 17) < 0.3 && !w.got[k] ? { x: lerp(edge(k * T, -1), edge(k * T, 1), 0.3 + 0.4 * hash(k, 18)), alt: k * T + 0.85 * T } : null);
    const sy = (A) => 0.6 * N + (w.cam - A);
    if (f.section === 'drop') { w.biome = 'summit'; w.swapT = 0.5; }
    else if (f.section === 'change') {
      w.biome = rollW(rnd, BIOME_W, bandOf(W.a)); w.swapT = 0.5;
      for (let k = Math.floor(w.alt / T) + 2; k < Math.floor(w.alt / T) + 40; k++) if (ledge(k)) { w.flag = { k, done: false }; break; }
    }
    const wind = B.wind * Math.sin(f.rel.midClock * 0.8) * N * 0.06;
    // hits: a kick is a jump (off the wall, or off the ledge toward the far wall), a snare a dash, a note a sparkle
    for (const h of hits) {
      if (isLow(h)) {
        if (w.st === 'cling') { w.vx = -w.sd * N * 0.7; w.vy = N * (1.05 + 0.25 * h.strength); w.st = 'air'; w.dashOk = true; }
        else if (w.st === 'stand') { const Lg = ledge(w.on); w.vx = -(Lg ? Lg.side : 1) * N * 0.7; w.vy = N * (1.05 + 0.25 * h.strength); w.st = 'air'; w.dashOk = true; }
      } else if (h.kind === 'snare' && w.dashT <= 0 && t - w.jumpT > 0.12 && (w.st === 'cling' || (w.st === 'air' && w.dashOk))) {
        const dir = w.st === 'cling' ? -w.sd : Math.sign(w.vx) || 1, far = dir > 0 ? edge(w.alt, 1) - w.x : w.x - edge(w.alt, -1);
        w.vx = dir * N * 1.3; w.vy = Math.max(0, w.vy); w.dashT = Math.min(0.55, far / (N * 1.3) + 0.1); w.st = 'air'; w.dashOk = false; // straight across to the far wall, keeping what rise it had
      } else if (isTonal(h)) w.spark = 0.25;
      if (isLow(h) && w.st === 'air') w.jumpT = t;
    }
    const prevAlt = w.alt, prevCam = w.cam;
    if (w.st === 'cling') { // climbing the wall, quicker with the energy; a ledge on this wall is climbed onto
      const v = T * (0.5 + 1.8 * clamp(f.rel.midDrive));
      w.alt += v * dt;
      w.ph += ((v * dt) / (T * 0.5)) * Math.PI;
      w.x = edge(w.alt, w.sd) - w.sd * bw;
      const k = Math.floor(w.alt / T), Lg = ledge(k);
      if (Lg && Lg.side === w.sd && !w.broken[k] && prevAlt < Lg.top && w.alt >= Lg.top) { w.alt = Lg.top; w.st = 'stand'; w.on = k; w.crumble = 0; w.standT = t; w.x = Lg.side < 0 ? Lg.x0 + bw * 1.5 : Lg.x1 - bw * 1.5; }
    } else if (w.st === 'air') {
      if (w.dashT > 0) { w.dashT -= dt; w.ghosts.push({ x: w.x, alt: w.alt, life: 0.3 }); if (w.dashT <= 0) w.vx *= 0.3; }
      else { w.vy -= g * dt; w.alt += 0.5 * g * dt * dt; } // with the half step the flight is the exact parabola at any frame rate
      w.x += w.vx * dt;
      w.alt += w.vy * dt;
      const xl = edge(w.alt, -1), xr = edge(w.alt, 1);
      if (w.x - bw <= xl) { w.x = xl + bw; w.sd = -1; w.st = 'cling'; w.vx = w.vy = 0; w.dashT = 0; }
      else if (w.x + bw >= xr) { w.x = xr - bw; w.sd = 1; w.st = 'cling'; w.vx = w.vy = 0; w.dashT = 0; }
      if (w.st === 'air' && w.vy < 0) // a ledge top crossed on the way down is landed on
        for (let k = Math.floor(w.alt / T) - 1; k <= Math.floor(prevAlt / T) + 1; k++) {
          const Lg = ledge(k);
          if (!Lg || w.broken[k] || prevAlt < Lg.top - 0.01 || w.alt > Lg.top || w.x < Lg.x0 - bw || w.x > Lg.x1 + bw) continue;
          w.alt = Lg.top; w.st = 'stand'; w.on = k; w.vx = w.vy = 0; w.crumble = 0; w.standT = t; w.dashOk = true;
          if (w.flag && w.flag.k === k && !w.flag.done) { w.flag.done = true; burst(w.pops, rnd, w.x, sy(w.alt) - H0, 16, N * 0.4, BRIGHT, 0.6); }
          break;
        }
    } else { // standing; a crumbly ledge shakes and goes, and the climber grabs the wall it hung from; a long
      // wait with no kick, and it takes to the wall again by itself
      const Lg = ledge(w.on), gone = Lg && Lg.crumbly && (w.crumble += dt) > 0.5;
      if (gone) {
        w.broken[w.on] = t || 1e-6; // when it broke: the slab is drawn falling for a moment
        for (let k = 0; k < 10; k++) w.pops.push({ x: lerp(Lg.x0, Lg.x1, rnd()), y: sy(Lg.top) + T * 0.2 * rnd(), vx: (rnd() - 0.5) * N * 0.1, vy: 0, life: 0.9, c: B.rock });
        if (w.flag && w.flag.k === w.on) w.flag = null;
      }
      if (Lg && (gone || t - w.standT > 3)) { w.sd = Lg.side; w.st = 'cling'; w.x = edge(w.alt, w.sd) - w.sd * bw; }
    }
    for (let k = Math.floor(w.alt / T) - 1; k <= Math.floor(w.alt / T) + 1; k++) {
      const gm = gemAt(k);
      if (gm && Math.hypot(gm.x - w.x, gm.alt - w.alt - H0 * 0.5) < 1.2 * T) { w.got[k] = true; w.gems++; burst(w.pops, rnd, gm.x, sy(gm.alt), 10, N * 0.3, COOL, 0.5); }
    }
    w.cam = follow(w.cam, w.alt, dt, 0.5);
    const camD = w.cam - prevCam; // everything on screen falls by this much as the camera rises
    w.spark -= dt; w.swapT -= dt;

    // the sky, the far peaks (a slow parallax) and the clouds between the towers (a quicker one)
    if (B.stars) for (let k = 0; k < 40; k++) r.set(hash(k, 31) * N, hash(k, 32) * N * 0.7, (k + f.beat.count) % 5 ? LMID + DIM : LMID);
    for (let k = 0; k < 5; k++) { const px = N * (0.1 + k * 0.2), ty = 0.55 * N + hash(k, 33) * 0.15 * N + 0.15 * w.cam, by = Math.max(N, N + 0.15 * w.cam); r.poly([[px - 0.22 * N, by], [px, ty], [px + 0.22 * N, by]], DARK + DIM); }
    for (let k = Math.floor((0.5 * w.cam - 0.5 * N) / (0.5 * N)); k <= Math.floor((0.5 * w.cam + 0.5 * N) / (0.5 * N)) + 1; k++) {
      const cy = 0.6 * N + 0.5 * w.cam - k * 0.5 * N, cx = N * (0.3 + 0.4 * hash(k, 34)) + Math.sin(t * 0.2 + k) * 4 * u;
      for (const [dx, rr] of [[0, 0.03], [-0.035, 0.02], [0.035, 0.022]]) r.disc(cx + dx * N, cy, rr * N, LMID);
    }
    // the two walls, row by row: the right one's face catches the light, the left one's is in shadow
    for (let y = 0; y < N; y++) {
      const A = w.cam + (0.6 * N - y), xl = edge(A, -1), xr = edge(A, 1), mortar = B.bricks && (A / (T * 0.5)) % 1 < 0.12;
      r.rect(0, y, xl, 1, mortar ? DARK + DIM : B.rock);
      r.rect(xr, y, N - xr, 1, mortar ? DARK + DIM : B.rock);
      r.rect(xl - u, y, Math.max(1, u), 1, DARK + DIM);
      r.rect(xr, y, Math.max(1, u), 1, B.rim);
      const hs = hash(Math.floor(A), 35);
      if (hs < 0.12) r.set(hs * 8 * xl, y, DARK + DIM);
      else if (hs > 0.9) r.set(xr + (hs - 0.9) * 10 * (N - xr), y, B.rim + DIM);
    }
    // the ledges with their icicles or vines, the gems, the flag
    const k0 = Math.floor((w.cam - 0.45 * N) / T), k1 = Math.floor((w.cam + 0.65 * N) / T);
    for (let k = k0; k <= k1; k++) {
      const Lg = ledge(k), fell = Lg && w.broken[k] ? t - w.broken[k] : -1; // a broken one: its slab falls under g for a moment
      if (Lg && fell < 0.7) {
        const jit = w.st === 'stand' && w.on === k && w.crumble > 0 ? (rnd() - 0.5) * 1.5 * u : 0, y = sy(Lg.top - (fell > 0 ? 0.5 * g * fell * fell : 0)), wl = Lg.x1 - Lg.x0;
        r.rect(Lg.x0 + jit, y, wl, T * 0.45, B.rock);
        r.rect(Lg.x0 + jit, y, wl, Math.max(1, u), B.rim);
        r.rect(Lg.x0 + jit, y + T * 0.45 - u, wl, Math.max(1, u), DARK + DIM);
        if (Lg.crumbly) for (let i = 1; i <= 2; i++) r.rect(Lg.x0 + (wl * i) / 3 + jit, y + u, Math.max(1, u), T * 0.25, DARK + DIM);
        if (fell >= 0) continue; // nothing hangs from the falling slab
        const ex = Lg.side < 0 ? Lg.x1 - 2 * u : Lg.x0 + 2 * u;
        if (B.vines) r.line(ex, y + T * 0.45, ex + Math.sin(t * 1.5 + k) * 2 * u + wind * 0.03, y + T * 1.5, COOL);
        else if (B.fall === 'snow') for (const q of [0.3, 0.7]) r.poly([[Lg.x0 + wl * q - u, y + T * 0.45], [Lg.x0 + wl * q + u, y + T * 0.45], [Lg.x0 + wl * q, y + T * 0.8]], LMID);
      }
      const gm = gemAt(k);
      if (gm) {
        const gy = sy(gm.alt) - 1.2 * u * f.beat.pulse, c = w.spark > 0 ? BRIGHT : COOL;
        r.poly([[gm.x, gy - 2.5 * u], [gm.x + 2 * u, gy], [gm.x, gy + 2.5 * u], [gm.x - 2 * u, gy]], c);
        r.set(gm.x - u * 0.5, gy - u, BRIGHT);
      }
    }
    if (w.flag) {
      const Lg = ledge(w.flag.k), fy = sy(Lg.top), px = Lg.side < 0 ? Lg.x1 - 2 * u : Lg.x0 + 2 * u, wd = Math.abs(wind) > u ? Math.sign(wind) : -Lg.side;
      const fl = T * (0.4 + 0.4 * Math.min(1, Math.abs(wind) / (0.06 * N)));
      r.rect(px - u * 0.5, fy - T * 0.95, Math.max(1, u), T * 0.95, LMID);
      r.poly([[px, fy - T * 0.95], [px + wd * fl, fy - T * 0.8 + Math.sin(t * 9) * u * 0.8], [px, fy - T * 0.6]], w.flag.done ? BRIGHT : HOT);
      if (w.flag.done && fy > N + T) w.flag = null;
    }
    // the afterimages, the climber, its falling things
    w.ghosts = w.ghosts.filter((gh) => { r.rect(gh.x - bw, sy(gh.alt) - H0 * 0.6, 2 * bw, H0 * 0.35, FIG + DIM); return (gh.life -= dt) > 0; });
    const cy = sy(w.alt), col = w.swapT > 0 && Math.floor(t * 20) % 2 ? BRIGHT : FIG;
    const hx = w.st === 'air' ? -(Math.sign(w.vx) || 1) : w.st === 'cling' ? -w.sd : wind >= 0 ? 1 : -1;
    drawClimber(r, w.x, cy, H0, col, w.st === 'air' && w.dashT > 0 ? 'dash' : w.st, w.ph, w.sd, u, hx);
    targets.push({ x: w.x - 4 * u, y: cy - H0, w: 8 * u, h: H0 });
    const want = B.fall === 'snow' ? Math.round(30 + 60 * f.level * (B.wind > 2 ? 2 : 1)) : B.fall === 'leaves' ? 18 : 25;
    while (w.flakes.length < want) w.flakes.push({ x: rnd() * N, y: rnd() * N, s: rnd() * TAU });
    if (w.flakes.length > want) w.flakes.length = want;
    const fv = B.fall === 'snow' ? N * (0.12 + 0.15 * f.level) : B.fall === 'leaves' ? N * 0.06 : N * 0.015;
    for (const fl of w.flakes) {
      fl.y += dt * fv + camD;
      fl.x += dt * (wind + Math.sin(t * 1.3 + fl.s) * 3 * u * (B.fall === 'leaves' ? 3 : 1));
      if (fl.y > N) { fl.y = -rnd() * 0.1 * N; fl.x = rnd() * N; } else if (fl.y < -2 * u) fl.y = N;
      if (fl.x < 0) fl.x += N; else if (fl.x >= N) fl.x -= N;
      if (B.fall === 'leaves') r.rect(fl.x, fl.y, Math.max(1, 1.5 * u), Math.max(1, u), (fl.s > 3 ? HOT : COOL) + DIM);
      else r.rect(fl.x, fl.y, Math.max(1, u * 0.8), Math.max(1, u * 0.8), B.fall === 'snow' ? BRIGHT : LMID + DIM);
    }
    for (const p of w.pops) { p.y += camD; p.vy += (g - 1.6 * N) * dt; } // the debris falls with this world's g, not the helper's
    w.pops = particles(W, w.pops, BRIGHT);
    for (let k = 0; k < Math.floor(w.alt / (0.35 * N)) % 24; k++) r.rect(2 * u, N - 4 * u - k * 3 * u, 2.5 * u, 2 * u, LMID);
    for (let k = 0; k < w.gems % 12; k++) r.rect(3 * u + k * 3.5 * u, 2 * u, 2 * u, 2 * u, COOL);
  },
};

// ---------------------------------------------------------------------------------------------- farm
// A farming sim from above: tilled plots whose crops grow a stage per beat in turns (seed, sprout, plant, fruit),
// picked on a kick (the fruit pops out, falls and is gathered), a farmer in a hat walking the rows and watering
// on a snare (drops that fall and splash), hens pecking on the beat, butterflies on the notes, a scarecrow in
// the wind. A day and a night every eight bars (the sun and the moon arc over the fence, the roles dim at night,
// fireflies come out); the season is rolled by arousal band and changed on a section change; a drop is rain
// that ripens the whole field at once.
const SEASONS = {
  spring: { soil: MID, crop: COOL, fruit: HOT, fall: 'petals', every: 4 },
  summer: { soil: MID, crop: COOL, fruit: HOT, fall: null, every: 3 },
  autumn: { soil: DARK, crop: HOT, fruit: BRIGHT, fall: 'leaves', every: 4 },
  winter: { soil: DARK, crop: LMID, fruit: COOL, fall: 'snow', every: 8, snow: true },
};
const SEASON_W = { spring: [2, 2, 2], summer: [1, 3, 2], autumn: [2, 2, 1], winter: [2, 1, 1] };

const farm = {
  init(W) {
    const { w, rnd } = W, C = 8, R = 5;
    Object.assign(w, { C, R, plots: Array.from({ length: C * R }, () => ({ stage: Math.floor(rnd() * 4), wet: 0 })), season: rollW(rnd, SEASON_W, bandOf(W.a)),
      fm: { x: 0.5, y: 0.6, gx: 0.5, gy: 0.6, ph: 0, dir: 1, water: 0 }, hens: Array.from({ length: 3 }, (_, i) => ({ x: 0.2 + 0.3 * i, y: 0.93, gx: 0.3 + 0.2 * i, gy: 0.93, ph: 0, dir: 1, peck: 0 })),
      fruits: [], drops: [], flies: [], flakes: [], sparks: [], day: 0.1, rain: 0, basket: 0, swapT: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, { C, R } = w, S = SEASONS[w.season], bps = bpsOf(f), fm = w.fm;
    const fx0 = 0.08 * N, fy0 = 0.3 * N, pw = (0.84 * N) / C, ph = (0.6 * N) / R;
    const pcx = (i) => fx0 + ((i % C) + 0.5) * pw, pcy = (i) => fy0 + (Math.floor(i / C) + 0.5) * ph;
    const plotAt = (x, y) => { const cx = Math.floor((x - fx0) / pw), cy = Math.floor((y - fy0) / ph); return cx >= 0 && cy >= 0 && cx < C && cy < R ? cy * C + cx : -1; };
    const step = (o, v) => { // a figure toward its goal at v cells a second, legs in step with the ground covered; true when there
      const dx = (o.gx - o.x) * N, dy = (o.gy - o.y) * N, d = Math.hypot(dx, dy);
      if (d < 1.5 * u) return true;
      const st = Math.min(d, v * dt);
      o.x += ((dx / d) * st) / N; o.y += ((dy / d) * st) / N; o.ph += (st / (3 * u)) * Math.PI;
      if (Math.abs(dx) > u) o.dir = Math.sign(dx);
      return false;
    };
    w.day = (w.day + (dt * bps) / 32) % 1;
    const night = w.day >= 0.5, D = night ? DIM : 0, dusk = w.day > 0.46 && w.day < 0.5, dawn = w.day > 0.96;
    if (f.section === 'drop') { w.rain = 6; for (const p of w.plots) p.stage = 3; }
    else if (f.section === 'change') { w.season = rollW(rnd, SEASON_W, bandOf(W.a)); w.swapT = 0.5; }
    if (f.beat.on) { // a stage of growth, in turns round the field; the hens peck
      for (let i = 0; i < w.plots.length; i++) if ((i * 7 + f.beat.count) % S.every === 0 && w.plots[i].stage < 3) w.plots[i].stage++;
      w.hens.forEach((hn, i) => { if ((f.beat.count + i) % 2 === 0) hn.peck = 0.15; });
    }
    for (const h of hits) {
      if (isLow(h)) { // the ripe plots nearest the farmer are picked: the fruit pops out, falls and lies there
        const ripe = w.plots.map((p, i) => i).filter((i) => w.plots[i].stage === 3).sort((a, b) => Math.hypot(pcx(a) - fm.x * N, pcy(a) - fm.y * N) - Math.hypot(pcx(b) - fm.x * N, pcy(b) - fm.y * N));
        for (const i of ripe.slice(0, 1 + Math.round(2 * h.strength))) {
          w.plots[i].stage = 0;
          for (let k = 0; k < 3; k++) w.fruits.push({ x: pcx(i) + (rnd() - 0.5) * pw * 0.5, y: pcy(i) - 2 * u, vx: (rnd() - 0.5) * N * 0.2, vy: -N * (0.3 + 0.3 * rnd()), gy: pcy(i) + ph * 0.3 * rnd(), down: false, bounced: false });
        }
      } else if (h.kind === 'snare') fm.water = 0.5;
      else if (isTonal(h) && w.flies.length < 6) { const left = rnd() < 0.5; w.flies.push({ x: left ? -2 * u : N + 2 * u, dir: left ? 1 : -1, y: N * (0.35 + 0.5 * rnd()), s: rnd() * TAU, c: [HOT, COOL, BRIGHT][h.pc % 3] }); }
    }
    // the farmer goes to the fruit on the ground, else to a ripe plot, else wherever
    if (step(fm, N * (0.08 + 0.14 * clamp(f.level))) || (f.beat.on && f.beat.count % 4 === 0)) {
      const lying = w.fruits.filter((fr) => fr.down), ripe = w.plots.map((p, i) => i).filter((i) => w.plots[i].stage === 3);
      if (lying.length) { const fr = lying[0]; fm.gx = fr.x / N; fm.gy = fr.y / N; }
      else if (ripe.length) { const i = pick(rnd, ripe); fm.gx = (pcx(i) - pw * 0.45) / N; fm.gy = (pcy(i) + ph * 0.3) / N; }
      else { fm.gx = 0.1 + rnd() * 0.8; fm.gy = 0.35 + rnd() * 0.55; }
    }
    for (const hn of w.hens) { if (step(hn, N * (0.04 + 0.05 * f.level))) { hn.gx = 0.1 + rnd() * 0.8; hn.gy = 0.88 + rnd() * 0.08; } hn.peck -= dt; }
    fm.water -= dt; w.swapT -= dt; w.rain -= dt;
    for (const p of w.plots) p.wet = w.rain > 0 ? 3 : Math.max(0, p.wet - dt);

    // the sky and the far ground, the sun or the moon arcing over the hills, the barn, the fence
    const grass = (S.snow ? BRIGHT : LMID) + D;
    if (night) for (let k = 0; k < 25; k++) r.set(hash(k, 41) * N, hash(k, 42) * 0.1 * N, (k + f.beat.count) % 4 ? LMID + DIM : LMID);
    const sa = ((w.day % 0.5) / 0.5) * Math.PI, sunX = N / 2 - Math.cos(sa) * 0.45 * N, sunY = 0.115 * N - Math.sin(sa) * 0.095 * N;
    r.disc(sunX, sunY, 3 * u * (1 + 0.1 * f.beat.pulse), night ? LMID : BRIGHT);
    if (night) r.disc(sunX + 1.5 * u, sunY - u, 2.4 * u, BG);
    r.rect(0, 0.12 * N, N, N, grass);
    for (const [hx, hr] of [[0.25, 0.1], [0.6, 0.13], [0.9, 0.08]]) r.disc(hx * N, 0.17 * N, hr * N, MID + D);
    r.rect(0.74 * N, 0.16 * N, 0.12 * N, 0.09 * N, HOT + D);
    r.poly([[0.73 * N, 0.165 * N], [0.8 * N, 0.11 * N], [0.87 * N, 0.165 * N]], DARK + D);
    r.rect(0.785 * N, 0.19 * N, 0.03 * N, 0.03 * N, night ? BRIGHT : DARK + D);
    for (let x = 0.02 * N; x < N; x += 0.05 * N) r.rect(x, 0.235 * N, Math.max(1, u), 0.04 * N, DARK + D);
    r.rect(0, 0.245 * N, N, Math.max(1, u), DARK + D);
    r.rect(0, 0.265 * N, N, Math.max(1, u), DARK + D);
    // the plots and their crops, leaning with the wind; wet soil is darker
    const lean = Math.sin(f.rel.midClock * 1.2) * 1.5 * u;
    for (let i = 0; i < w.plots.length; i++) {
      const p = w.plots[i], row = Math.floor(i / C), Dp = D || ((dusk && row % 2) || (dawn && row % 2 === 0) ? DIM : 0);
      const X = fx0 + (i % C) * pw, Y = fy0 + row * ph, cx = pcx(i), cy = pcy(i), soil = p.wet > 0 ? DARK + DIM : S.soil + Dp;
      r.rect(X + u, Y + u, pw - 2 * u, ph - 2 * u, soil);
      for (const q of [0.3, 0.7]) r.rect(X + u, Y + ph * q, pw - 2 * u, Math.max(1, u), (S.soil === DARK ? DARK + DIM : DARK + Dp));
      if (S.snow) r.rect(X + u, Y + u, pw - 2 * u, Math.max(1, u), BRIGHT + Dp);
      const lx = cx + lean * (0.3 + 0.2 * (i % 3)), c = S.crop + Dp;
      if (p.stage === 0) r.rect(cx - u * 0.5, cy - u * 0.5, Math.max(1, u), Math.max(1, u), BRIGHT + Dp);
      else if (p.stage === 1) r.line(cx, cy + u, lx, cy - 2 * u, c);
      else {
        r.line(cx, cy + u, lx, cy - 4 * u, c);
        r.line(cx, cy - u, lx - 3 * u, cy - 3 * u, c);
        r.line(cx, cy - 2 * u, lx + 3 * u, cy - 4 * u, c);
        if (p.stage === 3) for (const [dx, dy] of [[-2.5, -2.5], [2.5, -3.5], [0.5, -1]]) r.disc(lx + dx * u, cy + dy * u, 1.2 * u, S.fruit + Dp);
      }
    }
    // the fruit in the air and on the ground, gathered when the farmer comes by
    w.fruits = w.fruits.filter((fr) => {
      if (!fr.down) {
        fr.y += (fr.vy + 0.8 * N * dt) * dt; fr.vy += 1.6 * N * dt; fr.x += fr.vx * dt; // the exact parabola step
        if (fr.y >= fr.gy) { fr.y = fr.gy; if (fr.bounced) { fr.down = true; fr.vx = 0; } else { fr.bounced = true; fr.vy = -fr.vy * 0.4; fr.vx *= 0.5; } }
      } else if (Math.hypot(fr.x - fm.x * N, fr.y - fm.y * N) < 4 * u) { w.basket++; burst(w.sparks, rnd, fr.x, fr.y - 2 * u, 5, N * 0.2, BRIGHT, 0.3); return false; }
      if (!fr.down) r.rect(fr.x - u, fr.gy - u * 0.5, 2 * u, Math.max(1, u), DARK + DIM); // its shadow on the ground it will land on
      r.disc(fr.x, fr.y - 1.2 * u, 1.3 * u, S.fruit + D);
      return true;
    });
    // the figures, nearest last: the hens, the farmer with the can, the scarecrow swaying on its pole
    const figs = [...w.hens.map((hn) => ({ y: hn.y * N, hen: hn })), { y: fm.y * N, farmer: true }, { y: 0.62 * N, scare: true }].sort((a, b) => a.y - b.y);
    for (const fg of figs) {
      if (fg.hen) {
        const hn = fg.hen, X = hn.x * N, Y = hn.y * N, c = BRIGHT + D, st = Math.sin(hn.ph) * u;
        r.rect(X - 2 * u + st * 0.5, Y - u, Math.max(1, u), Math.max(1, u), HOT + D);
        r.rect(X + u - st * 0.5, Y - u, Math.max(1, u), Math.max(1, u), HOT + D);
        r.rect(X - 2.5 * u, Y - 4 * u, 5 * u, 3 * u, c);
        const hy = hn.peck > 0 ? Y - 2 * u : Y - 5.5 * u, hx = X + hn.dir * 3 * u;
        r.rect(hx - u, hy - u, 2 * u, 2 * u, c);
        r.rect(hx + hn.dir * u, hy, Math.max(1, u), Math.max(1, u), HOT + D);
        r.rect(hx - u * 0.5, hy - 2 * u, Math.max(1, u), Math.max(1, u), HOT + D);
        targets.push({ x: X - 4 * u, y: Y - 7 * u, w: 8 * u, h: 7 * u });
      } else if (fg.farmer) {
        const X = fm.x * N, Y = fm.y * N, col = w.swapT > 0 && Math.floor(t * 20) % 2 ? BRIGHT : FIG;
        const J = walker(r, X, Y, 0.1 * N, col, fm.ph, fm.dir, { hat: true, hatCol: MID + D });
        const canX = J.sx + fm.dir * 2.5 * u, canY = J.sy + 0.03 * N;
        r.rect(canX - 2 * u, canY, 4 * u, 3 * u, LMID + D);
        if (fm.water > 0) { // the can tips: drops leave the spout and fall to the row in front
          r.rect(canX + fm.dir * 2 * u, canY - u, 2 * u, Math.max(1, u), LMID + D);
          for (let k = 0, n = Math.max(1, Math.round(60 * dt)); k < n; k++) w.drops.push({ x: canX + fm.dir * 3.5 * u, y: canY - u, vx: fm.dir * N * (0.1 + 0.08 * rnd()), vy: -N * 0.05, gy: Y + u + rnd() * 2 * u });
        }
        targets.push({ x: X - 0.04 * N, y: Y - 0.1 * N, w: 0.08 * N, h: 0.1 * N });
      } else { // the scarecrow leans with the wind, pivoting on its base
        const bx = 0.955 * N, by = fg.y, tx = bx + lean * 1.5, ty = by - 0.14 * N;
        r.stroke(bx, by, tx, ty, Math.max(1, u), DARK + D);
        r.rect(tx - 0.03 * N, ty + 0.045 * N, 0.06 * N, Math.max(1, u), DARK + D);
        r.rect(tx - 0.012 * N, ty + 0.035 * N, 0.024 * N, 0.05 * N, MID + D);
        r.disc(tx, ty + 0.02 * N, 0.015 * N, LMID + D);
        r.rect(tx - 0.02 * N, ty + 0.003 * N, 0.04 * N, Math.max(1, u), DARK + D);
        r.rect(tx - 0.012 * N, ty - 0.012 * N, 0.024 * N, 0.016 * N, DARK + D);
      }
    }
    // the water drops fall to the soil and splash; the butterflies flutter across; what the season sheds
    w.drops = w.drops.filter((d) => {
      d.y += (d.vy + 0.8 * N * dt) * dt; d.vy += 1.6 * N * dt; d.x += d.vx * dt;
      if (d.y >= d.gy) { const i = plotAt(d.x, d.y); if (i >= 0) w.plots[i].wet = 4; w.sparks.push({ x: d.x, y: d.gy, vx: (rnd() - 0.5) * N * 0.1, vy: -N * 0.1, life: 0.15, c: COOL + D }); return false; }
      r.rect(d.x, d.y, Math.max(1, u), Math.max(1, u), COOL + D);
      return true;
    });
    w.flies = w.flies.filter((b) => {
      b.x += b.dir * N * (0.06 + 0.06 * f.level) * dt;
      b.y += Math.sin(t * 7 + b.s) * 6 * u * dt;
      const ww = (Math.floor(t * 12 + b.s) % 2 ? 1.5 : 0.8) * u;
      r.rect(b.x - ww, b.y - u * 0.5, ww, Math.max(1, u), b.c + D);
      r.rect(b.x, b.y - u * 0.5, ww, Math.max(1, u), b.c + D);
      return b.x > -N * 0.1 && b.x < N * 1.1;
    });
    const want = S.fall ? (S.fall === 'snow' ? 40 : 16) : 0;
    while (w.flakes.length < want) w.flakes.push({ x: rnd() * N, y: rnd() * N, s: rnd() * TAU });
    if (w.flakes.length > want) w.flakes.length = want;
    for (const fl of w.flakes) {
      fl.y += dt * N * (S.fall === 'snow' ? 0.08 : 0.04);
      fl.x += dt * (lean * 2 + Math.sin(t * 1.5 + fl.s) * 3 * u);
      if (fl.y > N) { fl.y = -rnd() * 0.05 * N; fl.x = rnd() * N; }
      if (fl.x < 0) fl.x += N; else if (fl.x >= N) fl.x -= N;
      r.rect(fl.x, fl.y, Math.max(1, u * (S.fall === 'snow' ? 0.8 : 1.4)), Math.max(1, u * 0.8), (S.fall === 'snow' ? BRIGHT : S.fall === 'leaves' ? HOT : S.fruit) + D);
    }
    if (w.rain > 0) for (let k = 0; k < 60; k++) { const x = rnd() * N, y = 0.1 * N + rnd() * 0.9 * N; r.line(x, y, x - 1.2 * u, y + 3 * u, COOL + D); }
    if (night) for (let k = 0; k < 10; k++) if (hash(k, Math.floor(t * 3)) < 0.5) r.rect(hash(k, 43) * N + Math.sin(t + k) * 3 * u, 0.35 * N + hash(k, 44) * 0.55 * N + Math.cos(t * 0.7 + k) * 2 * u, Math.max(1, u), Math.max(1, u), COOL);
    w.sparks = particles(W, w.sparks, BRIGHT);
    for (let k = 0; k < w.basket % 20; k++) r.rect(2 * u + k * 2.5 * u, N - 3 * u, Math.max(1, 1.5 * u), 2 * u, S.fruit);
  },
};

// ---------------------------------------------------------------------------------------------- dodgebox
// A battle box: a white frame, black inside, a small diamond steering away from whatever comes at it. Kicks drop
// bars from the top (they fall and land on the floor), the beat pops short bars up from the floor (up and back
// down), snares send homing darts or sweeping bars with a gap, balls bounce with gravity and lose a little each
// time; a hit flashes the frame. The box changes shape on a section change; on a drop it stretches tall and a
// barrage falls in columns. An enemy silhouette above the box bobs on the beat and raises an arm to attack.
const ATTACKS = {
  bones: { fall: 1, pop: 1 }, // bars from the top on the kick, floor pops on the beat
  balls: { ball: 1, pop: 1 }, // bouncing balls on the kick
  darts: { dart: 1, fall: 1 }, // homing darts on the snare, bars on the kick
  sweeps: { sweep: 1, pop: 1, ball: 1 }, // bars with a gap sweeping across on the snare
};
const ATTACK_W = { bones: [3, 2, 1], balls: [2, 2, 2], darts: [1, 2, 3], sweeps: [1, 2, 2] };

const dodgebox = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { atk: rollW(rnd, ATTACK_W, bandOf(W.a)), bw: 0.42, bh: 0.3, tw: 0.42, th: 0.3, px: 0.5, py: 0.75, vx: 0, vy: 0, shots: [], sparks: [], hp: 20, hurt: 0, arm: 0, barrage: 0, mode: HOT, regen: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, A = ATTACKS[w.atk], band = bandOf(W.a), drive = clamp(f.rel.midDrive);
    if (f.section === 'drop') { w.tw = 0.22; w.th = 0.62; w.barrage = 3; }
    else if (f.section === 'change') { w.atk = rollW(rnd, ATTACK_W, band); w.tw = 0.3 + 0.3 * rnd(); w.th = 0.22 + 0.2 * rnd(); }
    w.bw = follow(w.bw, w.tw, dt, 0.3); w.bh = follow(w.bh, w.th, dt, 0.3);
    const cx = N / 2, y1 = 0.88 * N, x0 = cx - (w.bw * N) / 2, x1 = cx + (w.bw * N) / 2, y0 = y1 - w.bh * N, bx = x1 - x0, bh = y1 - y0;
    const clipRect = (x, y, ww, hh, c) => { const ax = Math.max(x, x0), ay = Math.max(y, y0), bx2 = Math.min(x + ww, x1), by2 = Math.min(y + hh, y1); if (bx2 > ax && by2 > ay) r.rect(ax, ay, bx2 - ax, by2 - ay, c); };
    const px = w.px * N, py = w.py * N, vb = N * (0.3 + 0.3 * drive);
    for (const h of hits) {
      if (isLow(h)) {
        w.arm = 0.3;
        const n = 1 + Math.round(2 * h.strength);
        if (A.ball) for (let k = 0; k < n; k++) w.shots.push({ k: 'ball', x: x0 + bx * (0.2 + 0.6 * rnd()), y: y0 + 3 * u, vx: (rnd() < 0.5 ? -1 : 1) * vb * 0.7, vy: 0, life: 5 });
        else for (let k = 0; k < n; k++) w.shots.push({ k: 'bar', x: x0 + bx * (0.1 + 0.8 * rnd()), y: y0 - bh * 0.3, vy: 0, h: bh * (0.2 + 0.15 * rnd()), life: 4 });
      } else if (h.kind === 'snare') {
        w.arm = 0.3;
        if (A.dart) { const side = rnd() < 0.5 ? -1 : 1; w.shots.push({ k: 'dart', x: cx + side * (bx / 2 + 6 * u), y: y0 + bh * rnd(), a: side < 0 ? 0 : Math.PI, v: vb * 1.3, life: 3, inside: false }); }
        else if (A.sweep) { const side = rnd() < 0.5 ? -1 : 1; w.shots.push({ k: 'sweep', x: side < 0 ? x0 - 3 * u : x1 + 3 * u, vx: -side * vb * 0.9, gy: y0 + bh * (0.25 + 0.5 * rnd()), gh: bh * 0.32, life: 4 }); }
        else for (let k = 0; k < 2; k++) w.shots.push({ k: 'bar', x: x0 + bx * (0.1 + 0.8 * rnd()), y: y0 - bh * 0.3, vy: 0, h: bh * 0.25, life: 4 });
      } else if (isTonal(h)) w.mode = h.pc % 2 ? COOL : HOT;
    }
    if (f.beat.on && A.pop && w.barrage <= 0) w.shots.push({ k: 'pop', x: x0 + bx * (0.1 + 0.8 * rnd()), y: y1, vy: -N * (0.55 + 0.25 * drive), h: bh * 0.3, life: 3 });
    if (f.beat.on && w.barrage > 0) for (let x = x0 + 3 * u + (f.beat.count % 2) * 5 * u; x < x1 - 2 * u; x += 10 * u) w.shots.push({ k: 'bar', x, y: y0 - bh * 0.4, vy: 0, h: bh * 0.25, life: 4 });
    w.barrage -= dt; w.hurt -= dt; w.arm -= dt;
    if ((w.regen += dt) > 2 && w.hp < 20) { w.hp++; w.regen = 0; }
    // steering: pushed off by what is near, pulled to the gap of a sweep, otherwise wandering with the mid clock
    let sx = 0, sy = 0;
    const Rr = 0.14 * N, g = 1.3 * N, dmx = 2 * u;
    for (const sh of w.shots) {
      if (sh.k === 'sweep') { if (Math.abs(sh.x - px) < 0.3 * N) sy += ((sh.gy + sh.gh / 2 - py) / N) * 6; continue; }
      const dx = px - sh.x, dy = sh.k === 'pop' ? 0 : py - (sh.k === 'bar' ? sh.y + sh.h : sh.y), d = Math.hypot(dx, dy) || 1, wgt = sh.k === 'bar' ? 2 : 1;
      if (d < Rr) { sx += (dx / d) * (1 - d / Rr) * wgt; sy += (dy / d) * (1 - d / Rr) * wgt; }
    }
    const wx = cx + 0.3 * bx * Math.sin(f.rel.midClock * 1.1), wy = y0 + bh * (0.5 + 0.3 * Math.sin(f.rel.midClock * 0.7));
    const tx = sx * N * 0.6 + (wx - px) * 1.5, ty = sy * N * 0.6 + (wy - py) * 1.5, vmax = N * (0.25 + 0.4 * drive), tl = Math.hypot(tx, ty) || 1, sc = Math.min(1, vmax / tl);
    w.vx = follow(w.vx, tx * sc, dt, 0.1); w.vy = follow(w.vy, ty * sc, dt, 0.1);
    w.px = clamp(w.px + (w.vx * dt) / N, (x0 + dmx) / N, (x1 - dmx) / N);
    w.py = clamp(w.py + (w.vy * dt) / N, (y0 + dmx) / N, (y1 - dmx) / N);
    const dx = w.px * N, dy = w.py * N;

    // the enemy over the box: a hooded shape, bobbing on the beat, an arm up when it attacks
    const ex = cx, ey = y0 - 0.06 * N - 2.5 * u * f.beat.pulse;
    r.poly([[ex - 0.07 * N, ey], [ex - 0.04 * N, ey - 0.1 * N], [ex + 0.04 * N, ey - 0.1 * N], [ex + 0.07 * N, ey]], DARK);
    r.disc(ex, ey - 0.11 * N, 0.035 * N, MID);
    for (const k of [-1, 1]) r.rect(ex + k * 0.014 * N - u, ey - 0.115 * N, 2 * u, Math.max(1, 1.5 * u), w.hurt > 0 ? HOT : BLACK);
    const aa = w.arm > 0 ? -1.4 + (0.3 - w.arm) * 2 : 0.5;
    r.stroke(ex + 0.05 * N, ey - 0.05 * N, ex + 0.05 * N + Math.cos(aa) * 0.06 * N, ey - 0.05 * N + Math.sin(aa) * 0.06 * N, 2 * u, DARK);
    targets.push({ x: ex - 0.07 * N, y: ey - 0.15 * N, w: 0.14 * N, h: 0.15 * N });
    // the box, and everything inside it clipped to it
    r.rect(x0, y0, bx, bh, BLACK);
    const lw = Math.max(1, u * (1 + 0.8 * f.beat.pulse)), fc = w.hurt > 0 ? HOT : WHITE;
    r.rect(x0 - lw, y0 - lw, bx + 2 * lw, lw, fc); r.rect(x0 - lw, y1, bx + 2 * lw, lw, fc); r.rect(x0 - lw, y0, lw, bh, fc); r.rect(x1, y0, lw, bh, fc);
    let hit = false;
    w.shots = w.shots.filter((sh) => {
      sh.life -= dt;
      if (sh.k === 'bar' || sh.k === 'pop') { // falling: lands on the floor and is gone, with a puff where it landed
        sh.y += (sh.vy + 0.5 * g * dt) * dt; sh.vy += g * dt; // the exact parabola step: the pops rise the same at any frame rate
        if (sh.k === 'bar' && sh.y + sh.h >= y1) { for (let k = 0; k < 3; k++) w.sparks.push({ x: sh.x + (rnd() - 0.5) * 3 * u, y: y1 - u, vx: (rnd() - 0.5) * N * 0.15, vy: -N * 0.1, life: 0.2, c: LMID }); return false; }
        if (sh.k === 'pop' && sh.vy > 0 && sh.y >= y1) return false;
        clipRect(sh.x - u, sh.y, Math.max(1, 2 * u), sh.h, WHITE);
        if (Math.abs(sh.x - dx) < 2 * u && dy > sh.y - 1.5 * u && dy < sh.y + sh.h + 1.5 * u) hit = true;
      } else if (sh.k === 'ball') { // gravity, walls and floor; each bounce keeps four fifths of the speed
        sh.y += (sh.vy + 0.5 * g * dt) * dt; sh.vy += g * dt; sh.x += sh.vx * dt;
        if (sh.x < x0 + 2 * u) { sh.x = x0 + 2 * u; sh.vx = Math.abs(sh.vx); } else if (sh.x > x1 - 2 * u) { sh.x = x1 - 2 * u; sh.vx = -Math.abs(sh.vx); }
        if (sh.y > y1 - 2 * u) { sh.y = y1 - 2 * u; sh.vy = -Math.abs(sh.vy) * 0.8; if (Math.abs(sh.vy) < 0.05 * N) sh.vy = 0; }
        r.disc(sh.x, sh.y, 2 * u, WHITE);
        if (Math.hypot(sh.x - dx, sh.y - dy) < 3.5 * u) hit = true;
      } else if (sh.k === 'dart') { // homes on the diamond, turning so much a second, and leaves through the far wall
        const want = Math.atan2(dy - sh.y, dx - sh.x);
        sh.a += clamp(wrapAngle(want - sh.a), -2.5 * dt, 2.5 * dt);
        sh.x += Math.cos(sh.a) * sh.v * dt; sh.y += Math.sin(sh.a) * sh.v * dt;
        const inBox = sh.x > x0 && sh.x < x1 && sh.y > y0 && sh.y < y1;
        if (inBox) sh.inside = true; else if (sh.inside) return false;
        clipRect(sh.x - u, sh.y - u, 2 * u, 2 * u, HOT);
        clipRect(sh.x - Math.cos(sh.a) * 3 * u - u * 0.5, sh.y - Math.sin(sh.a) * 3 * u - u * 0.5, Math.max(1, u), Math.max(1, u), HOT + DIM);
        if (Math.hypot(sh.x - dx, sh.y - dy) < 2.5 * u) hit = true;
      } else { // a sweep: a bar the height of the box with a gap in it
        sh.x += sh.vx * dt;
        if ((sh.vx > 0 && sh.x > x1 + 4 * u) || (sh.vx < 0 && sh.x < x0 - 4 * u)) return false;
        clipRect(sh.x - u, y0, Math.max(1, 2 * u), sh.gy - y0, WHITE);
        clipRect(sh.x - u, sh.gy + sh.gh, Math.max(1, 2 * u), y1 - sh.gy - sh.gh, WHITE);
        if (Math.abs(sh.x - dx) < 2 * u && (dy < sh.gy + 1.5 * u || dy > sh.gy + sh.gh - 1.5 * u)) hit = true;
      }
      return sh.life > 0;
    });
    if (hit && w.hurt <= 0) { w.hurt = 0.4; w.hp = Math.max(0, w.hp - 1); s.shake = Math.max(s.shake, 0.3); burst(w.sparks, rnd, dx, dy, 10, N * 0.3, w.mode, 0.4); }
    if (w.hurt <= 0 || Math.floor(t * 24) % 2) r.poly([[dx, dy - 2.5 * u], [dx + 2.2 * u, dy], [dx, dy + 2.5 * u], [dx - 2.2 * u, dy]], w.mode);
    w.sparks = particles(W, w.sparks, LMID);
    targets.push({ x: dx - 3 * u, y: dy - 3 * u, w: 6 * u, h: 6 * u });
    for (let k = 0; k < 20; k++) r.rect(x0 + k * 3 * u, y1 + 3 * u + lw, 2 * u, 2 * u, k < w.hp ? HOT : DARK);
  },
};

// ---------------------------------------------------------------------------------------------- caveknight
// A bug knight in a cavern: a small horned silhouette with a nail walking a path of stepped rock past glowing
// fungi, stalactites dripping overhead, spores floating. Quicker with the bass; a kick is a jump (and a slash,
// a crescent in front of it, flipped with the facing), bugs fly in on the hats and are cut down, spikes in the
// pits are bounced off with a down-slash (pogo). A section change puts a bench ahead, where it sits a moment; a
// drop brings a boss bug that hovers and spits until it is cut down.
const caveknight = {
  init(W) {
    Object.assign(W.w, { x: 0, cam: 0, fy: 0, vy: 0, air: false, dir: 1, ph: 0, slash: 0, pogo: 0, hurt: 0, rest: 0, bench: null, boss: null, bugs: [], spores: [], drips: [], sparks: [], souls: [], gems: 0, swapT: 0, start: true });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, SW = N / 6, gBase = 0.78 * N, g = 3 * N, H0 = 0.11 * N, ceil = 0.12 * N;
    const seg = (xw) => Math.floor(xw / SW);
    const isPit = (i) => i > 3 && hash(i, 51) < 0.16 && hash(i - 1, 51) >= 0.16;
    const level = (i) => (isPit(i) ? -1 : Math.floor(hash(i, 52) * 3)); // -1 is a pit
    const groundY = (xw) => { const l = level(seg(xw)); return l < 0 ? gBase + 0.1 * N : gBase - l * 0.07 * N; };
    const spikeTop = gBase + 0.05 * N;
    if (w.start) { w.fy = groundY(w.x); w.cam = w.x - 0.38 * N; w.start = false; }
    if (f.section === 'change') { w.bench = { x: w.x + 0.6 * N }; w.swapT = 0.4; }
    else if (f.section === 'drop' && !w.boss) w.boss = { x: w.cam + 0.8 * N, y: gBase - 0.22 * N, hp: 12, flash: 0, ph: 0, dead: 0, cool: 1, spit: [] };
    const bossOn = w.boss && !w.boss.dead;
    // hits: a kick jumps and slashes, a hat sends a bug in, a note is a glint on the fungi
    let glint = 0;
    for (const h of hits) {
      if (isLow(h)) {
        if (!w.air && w.rest <= 0) { w.vy = -N * (0.95 + 0.25 * h.strength); w.air = true; }
        w.slash = 0.18;
      } else if (h.kind === 'hat' && w.bugs.length < 8) w.bugs.push({ x: w.cam + N + 3 * u, y: gBase - N * (0.15 + 0.3 * rnd()), s: rnd() * TAU, v: N * (0.12 + 0.1 * rnd()) });
      else if (isTonal(h)) glint = 1;
      if (h.kind === 'snare' && bossOn && w.boss.cool <= 0) { // the boss spits an arc at the knight
        const B = w.boss, dx = w.x - B.x, tt = 0.7;
        B.spit.push({ x: B.x, y: B.y, vx: dx / tt, vy: (gBase - B.y) / tt - 0.5 * g * tt, life: 2 }); // the lob that lands there in tt under the cave's g
        B.cool = 0.4;
      }
    }
    // the walk: ahead unless resting on the bench or squaring up to the boss; a step up or a pit ahead is jumped
    const v = N * (0.09 + 0.2 * clamp(f.rel.bassDrive));
    let moving = w.rest <= 0;
    if (bossOn) { const want = w.boss.x - 0.16 * N; w.dir = Math.sign(want - w.x) || 1; if (Math.abs(want - w.x) < 2 * u) moving = false; }
    else w.dir = 1;
    let blocked = false; // rock ahead above the feet is a wall: it stops there (and jumps it from the ground) until it is over the top
    if (moving) { const nx = w.x + w.dir * v * dt; if (groundY(nx + w.dir * 3 * u) >= w.fy - 0.5 * u) w.x = nx; else blocked = true; w.ph += (v * dt) / (H0 * 0.3) * Math.PI; }
    if (!w.air && moving) { const ahead = groundY(w.x + w.dir * 5 * u); if (blocked || ahead < w.fy - u || (w.dir > 0 && level(seg(w.x + 5 * u)) < 0)) { w.vy = -N * 1.05; w.air = true; } }
    if (w.bench && !w.air && w.rest <= 0 && !w.bench.sat && Math.abs(w.x - w.bench.x) < 2 * u) { w.rest = 2; w.bench.sat = true; }
    w.rest -= dt;
    const gy = groundY(w.x);
    if (w.air) {
      w.fy += (w.vy + 0.5 * g * dt) * dt; w.vy += g * dt; // the exact parabola step: the same height at any frame rate
      if (level(seg(w.x)) < 0 && w.vy > 0 && w.fy >= spikeTop) { // the pogo: a down-slash off the spike tips
        w.fy = spikeTop; w.vy = -N * 1.15; w.pogo = 0.15; s.shake = Math.max(s.shake, 0.15); // high enough to clear the pit's far side at any step
        burst(w.sparks, rnd, w.x, spikeTop, 6, N * 0.25, BRIGHT, 0.3);
      } else if (w.vy > 0 && w.fy >= gy) { w.fy = gy; w.vy = 0; w.air = false; }
    } else if (w.fy < gy - 0.5 * u) w.air = true; // walked off an edge
    else w.fy = gy;
    if (!bossOn) w.cam = follow(w.cam, w.x - 0.38 * N, dt, 0.25);
    w.slash -= dt; w.pogo -= dt; w.hurt -= dt; w.swapT -= dt;
    const hx = w.x - w.cam, hy = w.fy, pulse = f.beat.pulse;

    // the back of the cave in parallax (slow pillars, nearer stalagmites), then the ceiling with its stalactites
    for (let k = Math.floor((w.cam * 0.3) / (0.35 * N)) - 1; k < Math.floor((w.cam * 0.3 + N) / (0.35 * N)) + 1; k++) {
      const px = k * 0.35 * N - w.cam * 0.3 + hash(k, 53) * 0.1 * N, pw = (0.04 + 0.05 * hash(k, 54)) * N;
      r.rect(px, ceil, pw, gBase + 0.1 * N - ceil, DARK + DIM);
      r.rect(px - pw * 0.3, ceil, pw * 1.6, 3 * u, DARK + DIM);
    }
    for (let k = Math.floor((w.cam * 0.6) / (0.2 * N)) - 1; k < Math.floor((w.cam * 0.6 + N) / (0.2 * N)) + 1; k++) {
      const px = k * 0.2 * N - w.cam * 0.6, hh = (0.08 + 0.12 * hash(k, 55)) * N;
      r.poly([[px - 3 * u, gBase + 0.02 * N], [px, gBase + 0.02 * N - hh], [px + 3 * u, gBase + 0.02 * N]], DARK);
    }
    r.rect(0, 0, N, ceil, DARK);
    for (let i = seg(w.cam) - 1; i <= seg(w.cam + N) + 1; i++) {
      for (let k = 0; k < 2; k++) {
        const sx = i * SW + (0.2 + 0.6 * k + 0.2 * hash(i, 56 + k)) * SW - w.cam, len = (0.04 + 0.11 * hash(i, 58 + k)) * N, hw = 1.5 * u + 2 * u * hash(i, 60 + k);
        r.poly([[sx - hw, ceil], [sx + hw, ceil], [sx, ceil + len]], DARK);
        if (f.beat.on && hash(i * 2 + k, f.beat.count) < 0.12) w.drips.push({ x: sx + w.cam, y: ceil + len, vx: 0, vy: 0, life: 3, c: COOL }); // in world x: it stays under its stalactite
      }
    }
    // the ground, stepped, with spikes in the pits; the fungi glow on the beat; the bench
    for (let i = seg(w.cam) - 1; i <= seg(w.cam + N) + 1; i++) {
      const x = i * SW - w.cam, l = level(i);
      if (l < 0) {
        r.rect(x, gBase + 0.1 * N, SW, N, MID);
        for (let k = 0; k < 5; k++) r.poly([[x + (k * SW) / 5, gBase + 0.1 * N], [x + ((k + 0.5) * SW) / 5, spikeTop], [x + ((k + 1) * SW) / 5, gBase + 0.1 * N]], LMID);
      } else {
        const gy2 = gBase - l * 0.07 * N;
        r.rect(x, gy2, SW, N - gy2, MID);
        r.rect(x, gy2, SW, Math.max(1, u), LMID);
        if (level(i - 1) >= 0 && level(i - 1) < l) r.rect(x, gy2, Math.max(1, u), (l - level(i - 1)) * 0.07 * N, LMID);
        if (hash(i, 62) < 0.5) {
          const mx = x + (0.2 + 0.6 * hash(i, 63)) * SW, cap = (2 + 1.5 * hash(i, 64)) * u, glow = pulse > 0.3 || glint;
          if (glow) r.ring(mx, gy2 - 2.5 * u, cap * 2 * (1.2 - 0.4 * pulse), Math.max(1, u), COOL + DIM);
          r.rect(mx - u * 0.5, gy2 - 3 * u, Math.max(1, u), 3 * u, LMID);
          r.disc(mx, gy2 - 3 * u, cap, glow && pulse > 0.7 ? BRIGHT : COOL);
        }
      }
    }
    if (w.bench) {
      const bxs = w.bench.x - w.cam, by = groundY(w.bench.x);
      r.rect(bxs - 5 * u, by - 4 * u, 10 * u, Math.max(1, 1.5 * u), LMID);
      r.rect(bxs - 4 * u, by - 2.5 * u, Math.max(1, u), 2.5 * u, LMID); r.rect(bxs + 3 * u, by - 2.5 * u, Math.max(1, u), 2.5 * u, LMID);
      r.rect(bxs - 5 * u, by - 7 * u, 10 * u, Math.max(1, u), LMID);
      if (bxs < -0.2 * N) w.bench = null;
    }
    // the boss bug: hovers on buzzing wings, flashes when cut, falls when done
    if (w.boss) {
      const B = w.boss, bxs = B.x - w.cam;
      B.ph += dt * 8; B.flash -= dt; B.cool -= dt;
      if (B.dead) { B.vy = (B.vy || 0) + g * dt; B.y += B.vy * dt; if (B.y > gBase + 0.2 * N) w.boss = null; }
      else B.y = gBase - 0.22 * N + 2 * u * Math.sin(t * 2.5) - 2 * u * pulse;
      if (w.boss) {
        const c = B.flash > 0 ? BRIGHT : DARK, R = 0.07 * N;
        for (const k of [-1, 1]) r.poly([[bxs, B.y - R * 0.4], [bxs + k * R * 1.6, B.y - R * (1.1 + 0.3 * Math.sin(B.ph))], [bxs + k * R * 0.9, B.y]], LMID + DIM);
        r.disc(bxs, B.y, R, c);
        r.disc(bxs - R * 0.9, B.y + R * 0.2, R * 0.5, c);
        for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) r.line(bxs + sd * R * 0.5, B.y + R * (0.3 + k * 0.2), bxs + sd * R * (1.1 + k * 0.1), B.y + R * (0.9 + k * 0.15), c);
        r.rect(bxs - R * 1.2, B.y + R * 0.05, 2 * u, Math.max(1, 1.5 * u), HOT);
        targets.push({ x: bxs - R * 1.5, y: B.y - R, w: 3 * R, h: 2 * R });
        B.spit = B.spit.filter((p) => {
          p.y += (p.vy + 0.5 * g * dt) * dt; p.vy += g * dt; p.x += p.vx * dt; p.life -= dt;
          if (Math.abs(p.x - w.x) < 3 * u && p.y > hy - H0 && p.y < hy && w.hurt <= 0) { w.hurt = 0.5; s.shake = Math.max(s.shake, 0.3); return false; }
          r.disc(p.x - w.cam, p.y, 1.5 * u, HOT);
          return p.life > 0 && p.y < groundY(p.x);
        });
      }
    }
    // the bugs fly in on the hats, bobbing; the slash catches those in front, and their souls fly to the knight
    const arcX = hx + w.dir * 0.07 * N, arcY = hy - 0.06 * N;
    w.bugs = w.bugs.filter((b) => {
      b.x -= b.v * dt; b.y += Math.sin(t * 5 + b.s) * 4 * u * dt;
      const sx = b.x - w.cam;
      if (w.slash > 0.1 && Math.hypot(sx - arcX, b.y - arcY) < 0.09 * N) { burst(w.sparks, rnd, sx, b.y, 8, N * 0.3, LMID, 0.4); w.souls.push({ x: sx, y: b.y, vx: 0, vy: -N * 0.2 }); return false; }
      const wing = Math.floor(t * 20 + b.s) % 2 ? 2.5 : 1;
      r.rect(sx - 1.5 * u, b.y - u, 3 * u, 2 * u, DARK);
      r.rect(sx - wing * u, b.y - 2 * u, wing * 2 * u, Math.max(1, u), LMID);
      return sx > -0.1 * N;
    });
    if (w.slash > 0.1 && bossOn && Math.hypot(w.boss.x - w.cam - arcX, w.boss.y - arcY) < 0.13 * N && w.boss.flash <= 0) { w.boss.hp--; w.boss.flash = 0.15; s.shake = Math.max(s.shake, 0.3); if (w.boss.hp <= 0) { w.boss.dead = 1; burst(w.sparks, rnd, w.boss.x - w.cam, w.boss.y, 24, N * 0.5, LMID, 0.7); } }
    // the knight: cloak, horned head, two eyes, the nail; the slash arcs in front, the pogo below
    const col = w.hurt > 0 && Math.floor(t * 20) % 2 ? BRIGHT : FIG, sit = w.rest > 0, by = sit ? hy - 2 * u : hy, legs = sit ? 0 : Math.sin(w.ph) * 1.5 * u;
    r.stroke(hx - 1.5 * u + legs, by - H0 * 0.25, hx - 2 * u - legs, by, Math.max(1, u), col);
    r.stroke(hx + 1.5 * u - legs, by - H0 * 0.25, hx + 2 * u + legs, by, Math.max(1, u), col);
    r.poly([[hx - H0 * 0.18, by - H0 * 0.2], [hx - H0 * 0.12, by - H0 * 0.62], [hx + H0 * 0.12, by - H0 * 0.62], [hx + H0 * 0.2, by - H0 * 0.2]], col);
    r.disc(hx, by - H0 * 0.72, H0 * 0.18, col);
    for (const k of [-1, 1]) { r.stroke(hx + k * H0 * 0.1, by - H0 * 0.85, hx + k * H0 * 0.22, by - H0 * 1.02, Math.max(1, u), col); r.stroke(hx + k * H0 * 0.22, by - H0 * 1.02, hx + k * H0 * 0.3, by - H0 * 1.14, Math.max(1, u), col); }
    for (const k of [-1, 1]) r.rect(hx + k * H0 * 0.07 - u * 0.5, by - H0 * 0.74, Math.max(1, u), Math.max(1, 1.5 * u), BRIGHT);
    if (w.pogo > 0) { r.stroke(hx, by - H0 * 0.3, hx, by + H0 * 0.35, Math.max(1, 1.2 * u), LMID); crescent(r, hx, by + H0 * 0.2, 0.05 * N, Math.PI / 2, 0.9, Math.max(1, 1.5 * u), BRIGHT, 7); }
    else if (w.slash > 0) { r.stroke(hx, by - H0 * 0.4, hx + w.dir * H0 * 0.7, by - H0 * 0.45, Math.max(1, 1.2 * u), LMID); crescent(r, arcX, arcY, 0.06 * N, w.dir > 0 ? 0 : Math.PI, 1.0, Math.max(1, 1.5 * u), w.slash > 0.1 ? BRIGHT : LMID); }
    else r.stroke(hx + w.dir * H0 * 0.1, by - H0 * 0.42, hx + w.dir * H0 * 0.55, by - H0 * (sit ? 0.1 : 0.25), Math.max(1, 1.2 * u), LMID);
    targets.push({ x: hx - 0.05 * N, y: by - H0 * 1.15, w: 0.1 * N, h: H0 * 1.15 });
    // the spores float in the cave air; the drips fall to the floor; the souls come home
    const wantS = Math.round(14 + 20 * f.level);
    while (w.spores.length < wantS) w.spores.push({ x: w.cam + rnd() * N, y: ceil + rnd() * (gBase - ceil), s: rnd() * TAU });
    if (w.spores.length > wantS) w.spores.length = wantS;
    for (const sp of w.spores) {
      sp.x -= dt * 2 * u; sp.y += Math.sin(t * 0.8 + sp.s) * 2 * u * dt;
      const sx = sp.x - w.cam;
      if (sx < -2 * u) sp.x += N + 4 * u;
      r.rect(sx, sp.y, Math.max(1, u * 0.8), Math.max(1, u * 0.8), Math.floor(t * 2 + sp.s) % 3 ? COOL + DIM : COOL);
    }
    w.drips = w.drips.filter((d) => { d.y += (d.vy + 0.5 * g * dt) * dt; d.vy += g * dt; const sx = d.x - w.cam; if (d.y >= groundY(d.x)) { for (let k = 0; k < 2; k++) w.sparks.push({ x: sx, y: d.y, vx: (rnd() - 0.5) * N * 0.1, vy: -N * 0.12, life: 0.15, c: COOL }); return false; } r.rect(sx, d.y, Math.max(1, u), 2 * u, COOL); return true; });
    w.souls = w.souls.filter((sl) => { sl.vx += (hx - sl.x) * 12 * dt; sl.vy += (hy - H0 * 0.6 - sl.y) * 12 * dt; sl.x += sl.vx * dt; sl.y += sl.vy * dt; r.rect(sl.x - u * 0.5, sl.y - u * 0.5, Math.max(1, u), Math.max(1, u), BRIGHT); if (Math.hypot(sl.x - hx, sl.y - hy + H0 * 0.6) < 2 * u) { w.gems++; return false; } return true; });
    w.sparks = particles(W, w.sparks, LMID);
    for (let k = 0; k < w.gems % 16; k++) r.rect(2 * u + k * 2.5 * u, 2 * u, Math.max(1, 1.5 * u), 2 * u, COOL);
  },
};

// ---------------------------------------------------------------------------------------------- rotatecube
// A 2D world that is a 3D cube: a pixel village on each of its four faces, seen in perspective with the two faces
// that are toward the camera; the view turns a quarter about the vertical axis on a section change, a half on a
// drop. A figure walks round the cube (with the mid clock) and hops on a kick; fragments of the cube orbit it,
// spinning, glowing on the hats and kicked outward on a snare; the sun arcs over it and lights the faces it
// falls on, at night the windows light; the sea below reflects it all.
const TX = 32, WIN = 100;
function paintVillage(rnd) {
  const tex = new Uint8Array(4 * TX * TX), chimneys = [];
  const put = (fc, x, y, c) => { if (x >= 0 && y >= 0 && x < TX && y < TX) tex[fc * TX * TX + y * TX + x] = c; };
  const box = (fc, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(fc, x + i, y + j, c); };
  for (let fc = 0; fc < 4; fc++) {
    box(fc, 0, 0, TX, 26, DARK); box(fc, 0, 26, TX, 6, LMID); box(fc, 0, 29, TX, 2, MID);
    for (let k = 0; k < 16; k++) put(fc, Math.floor(rnd() * TX), Math.floor(rnd() * 22), DARK + DIM);
    for (let k = 0; k < 2; k++) { const x = 1 + Math.floor(rnd() * (TX - 2)); box(fc, x, 22, 1, 4, DARK + DIM); box(fc, x - 1, 19, 3, 4, COOL); box(fc, x - 2, 20, 5, 2, COOL); }
    const n = 2 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const hw = 2 + Math.floor(rnd() * 3), hh = 4 + Math.floor(rnd() * 4), x = 2 + Math.floor(((k + rnd() * 0.5) * (TX - 4)) / n), y = 26 - hh;
      box(fc, x, y, hw * 2, hh, MID);
      for (let j = 0; j <= hw; j++) box(fc, x + hw - 1 - j, y - 1 - hw + j, 2 + 2 * j, 1, HOT);
      box(fc, x + hw - 1, 24, 1, 2, DARK);
      put(fc, x + 1, y + 1, WIN); put(fc, x + hw * 2 - 2, y + 1, WIN);
      if (k === 0) { box(fc, x + hw * 2 - 3, y - hw - 1, 1, hw, DARK); chimneys.push([x + hw * 2 - 2.5, y - hw - 1]); }
    }
    box(fc, 0, 0, 1, TX, DARK + DIM); box(fc, TX - 1, 0, 1, TX, DARK + DIM);
  }
  return { tex, chimneys };
}

const rotatecube = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { ...paintVillage(rnd), th: 0.3, thTo: 0.3, day: 0.15, p: 0.5, ph: 0, hop: 0, hopV: 0, dir: 1, smoke: [],
      frags: Array.from({ length: 7 }, (_, k) => ({ a: (k / 7) * TAU, R: 1.8 + 0.6 * rnd(), R0: 0, y: -0.6 + 1.2 * rnd(), sp: rnd() * TAU, w: 0.4 + rnd() * 0.8, glow: 0 })) });
    for (const fg of w.frags) fg.R0 = fg.R;
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, D = 3.2, F = 0.58 * N * (1 + 0.03 * f.beat.pulse), cx = N / 2, cy = 0.46 * N, buf = r.buf, sea = 0.8 * N;
    if (f.section === 'drop') w.thTo += Math.PI;
    else if (f.section === 'change') w.thTo += (rnd() < 0.5 ? -1 : 1) * Math.PI / 2;
    w.th = follow(w.th, w.thTo, dt, 0.25);
    w.day = (w.day + (dt * bpsOf(f)) / 32) % 1;
    const sg = w.day * TAU, night = Math.sin(sg) < 0, sunX = cx - Math.cos(sg) * 0.42 * N, sunY = cy - Math.sin(sg) * 0.36 * N;
    const sdx = -Math.cos(sg), sdy = Math.sin(sg), sdz = 0.35;
    const proj = (x, y, z) => { const d = D - z; return [cx + (F * x) / d, cy - (F * y) / d, d]; };
    for (const h of hits) {
      if (isLow(h) && w.hop <= 0) w.hopV = 1.2 + 0.4 * h.strength;
      else if (h.kind === 'snare') for (const fg of w.frags) fg.R = fg.R0 + 0.7;
      else if (h.kind === 'hat') { const fg = pick(rnd, w.frags); fg.glow = 0.25; fg.sp += 1; }
      else if (isTonal(h)) w.puff = 3;
    }
    if (w.hop > 0 || w.hopV > 0) { w.hopV -= 4 * dt; w.hop = Math.max(0, w.hop + w.hopV * dt); if (w.hop === 0 && w.hopV < 0) w.hopV = 0; }
    for (const fg of w.frags) { fg.R = follow(fg.R, fg.R0, dt, 0.4); fg.a += dt * fg.w * (0.4 + 1.2 * clamp(f.rel.trebDrive)); fg.sp += dt * (1 + 2 * clamp(f.rel.trebDrive)); fg.glow -= dt; }
    // the sky: stars by night, the sun or the moon on its arc behind the cube
    if (night) for (let k = 0; k < 40; k++) r.set(hash(k, 71) * N, hash(k, 72) * sea, (k + f.beat.count) % 6 ? LMID + DIM : LMID);
    r.disc(sunX, sunY, (night ? 3.5 : 4.5) * u, night ? LMID : BRIGHT);
    if (night) r.disc(sunX + 1.8 * u, sunY - u, 2.8 * u, BG);
    else r.ring(sunX, sunY, 7 * u, Math.max(1, u), BRIGHT + DIM);
    // a wireframe for a fragment: its eight corners projected, twelve edges
    const fragDraw = (fg) => {
      const X = Math.cos(fg.a) * fg.R, Z = Math.sin(fg.a) * fg.R, sz = 0.07, c = fg.glow > 0 ? BRIGHT : COOL, ca = Math.cos(fg.sp), sa = Math.sin(fg.sp), pts = [];
      for (let k = 0; k < 8; k++) { const lx = (k & 1 ? 1 : -1) * sz, ly = (k & 2 ? 1 : -1) * sz, lz = (k & 4 ? 1 : -1) * sz; pts.push(proj(X + lx * ca - lz * sa, fg.y + ly, Z + lx * sa + lz * ca)); }
      for (let k = 0; k < 8; k++) for (const b of [1, 2, 4]) if (!(k & b)) r.line(pts[k][0], pts[k][1], pts[k | b][0], pts[k | b][1], c);
    };
    for (const fg of w.frags) if (Math.sin(fg.a) * fg.R < -0.4) fragDraw(fg);
    // the faces, column by column: the ray through the column meets the face plane at `a`, the depth gives the
    // scale of the column; the texture row is read per pixel
    const faces = [];
    for (let i = 0; i < 4; i++) { const phi = w.th + (i * Math.PI) / 2, cphi = Math.cos(phi), sphi = Math.sin(phi); if (cphi > 1 / D) faces.push({ i, cphi, sphi, lit: !night && sphi * sdx + cphi * sdz + 0.2 * sdy > 0.1 }); }
    let xmin = N, xmax = 0, front = faces[0];
    for (const fc of faces) if (fc.cphi > front.cphi) front = fc;
    for (let X = 0; X < N; X++) {
      const dx = (X + 0.5 - cx) / F;
      for (const fc of faces) {
        const a = (fc.sphi - (D - fc.cphi) * dx) / (fc.sphi * dx - fc.cphi);
        if (a < -1 || a > 1) continue;
        const depth = D - (fc.cphi - a * fc.sphi), ys = F / depth, inv = 1 / ys, top = cy - ys, bottom = cy + ys;
        const tu = Math.min(TX - 1, Math.floor(((a + 1) / 2) * TX)), base = fc.i * TX * TX + tu, shade = fc.lit ? 0 : DIM;
        if (X < xmin) xmin = X;
        if (X > xmax) xmax = X;
        for (let y = Math.max(0, Math.ceil(top)); y < Math.min(N, bottom); y++) {
          const b = (cy - y - 0.5) * inv, tv = Math.min(TX - 1, Math.max(0, Math.floor(((1 - b) / 2) * TX)));
          const c = w.tex[base + tv * TX];
          buf[y * N + X] = c === WIN ? (night ? BRIGHT : DARK + DIM) : c < DIM ? c + shade : c;
        }
        break;
      }
    }
    // the figure walking round the perimeter, on whichever face it is on; the smoke from the front chimney
    w.p = (w.p + dt * (0.04 + 0.22 * clamp(f.rel.midDrive))) % 4;
    const fi = Math.floor(w.p), fa = (w.p - fi) * 2 - 1, phi = w.th + (fi * Math.PI) / 2;
    if (Math.cos(phi) > 1 / D) {
      const at = (a) => proj(Math.sin(phi) + a * Math.cos(phi), -0.82 + w.hop * 0.3, Math.cos(phi) - a * Math.sin(phi));
      const [sx, sy, depth] = at(fa), [nx] = at(fa + 0.01), hgt = (0.3 * F) / depth;
      w.dir = nx >= sx ? 1 : -1;
      w.ph += (dt * (0.04 + 0.22 * clamp(f.rel.midDrive)) * 2 * F) / depth / (hgt * 0.35) * Math.PI;
      walker(r, sx, sy, hgt, FIG, w.hop > 0 ? 0.6 : w.ph, w.dir, { cap: true, hatCol: HOT });
      targets.push({ x: sx - hgt * 0.3, y: sy - hgt, w: hgt * 0.6, h: hgt });
    }
    if (front) {
      const [tx, ty] = w.chimneys[front.i], a = (tx / TX) * 2 - 1, b = 1 - (ty / TX) * 2, [sx, sy] = proj(front.sphi + a * front.cphi, b, front.cphi - a * front.sphi);
      if ((w.puff = (w.puff || 0) - 1) >= 0 || rnd() < 0.05 + 0.1 * f.level) w.smoke.push({ x: sx, y: sy, vx: (rnd() - 0.5) * N * 0.03 + sdx * -0.01 * N, vy: -N * (0.08 + 0.04 * rnd()), life: 1.2, c: LMID + DIM });
    }
    w.smoke = drift(W, w.smoke, LMID + DIM, 1.5);
    for (const fg of w.frags) if (Math.sin(fg.a) * fg.R >= -0.4) fragDraw(fg);
    // the sea: everything above the waterline, upside down, dimmed and swaying
    for (let y = Math.round(sea); y < N; y++) {
      const sy = Math.round(2 * sea - y), off = Math.round(Math.sin(y * 0.6 + t * 2) * u * (0.5 + f.level));
      if (sy < 0) continue;
      for (let x = 0; x < N; x++) { const sx = x + off; const c = sx >= 0 && sx < N ? buf[sy * N + sx] : BG; buf[y * N + x] = c < DIM ? c + DIM : c; }
    }
    r.rect(0, sea, N, Math.max(1, u * 0.6), LMID + DIM);
    if (xmax > xmin) targets.push({ x: xmin, y: cy - (F / (D - 1)) * 0.8, w: xmax - xmin, h: (F / (D - 1)) * 1.6 });
  },
};

// ---------------------------------------------------------------------------------------------- desertscarf
// A robed figure sand-surfing down the dunes toward a far mountain with a light on it: three dune layers in
// parallax, ruins standing on them, a long scarf trailing in the apparent wind (a chain that follows the neck),
// sand thrown up from the board. The speed follows the energy (and the slope: quicker downhill); a kick is a
// jump off the dune, a crest at speed throws it into the air too; cloth creatures fly in on the snares; a
// section change brings the night with its stars, and the next the day again.
const desertscarf = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { scroll: 0, v: 0, y: 0, vy: 0, vg: 0, air: false, scarf: Array.from({ length: 12 }, () => ({ x: 0, y: 0 })), creatures: [], sand: [], stars: Array.from({ length: 50 }, () => [rnd(), rnd() * 0.5]), night: false, glint: -1, glintT: 0, shoot: null, init: true });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, sx = 0.3 * N, H0 = 0.12 * N, g = 2.2 * N, D = w.night ? DIM : 0;
    const gy0 = (xw) => 0.72 * N + 0.07 * N * Math.sin(xw / (0.31 * N)) + 0.03 * N * Math.sin(xw / (0.117 * N) + 1);
    const gy1 = (xl) => 0.62 * N + 0.05 * N * Math.sin(xl / (0.4 * N) + 2) + 0.02 * N * Math.sin(xl / (0.15 * N));
    const gy2 = (xl) => 0.56 * N + 0.03 * N * Math.sin(xl / (0.5 * N) + 4);
    if (f.section === 'change') w.night = !w.night;
    const xw = sx + w.scroll, slope = (gy0(xw + 2 * u) - gy0(xw - 2 * u)) / (4 * u);
    if (w.init) { w.y = gy0(xw); w.init = false; for (const p of w.scarf) { p.x = sx; p.y = w.y - H0 * 0.78; } }
    for (const h of hits) {
      if (isLow(h) && !w.air) { w.vy = -N * (0.45 + 0.4 * h.strength) - Math.max(0, -slope) * w.v * 0.8; w.air = true; }
      else if (h.kind === 'snare' && w.creatures.length < 4) w.creatures.push({ pts: Array.from({ length: 7 }, (_, i) => ({ x: N + 4 * u + i * 2.5 * u, y: N * (0.2 + 0.3 * rnd()) })), vx: -N * (0.25 + 0.15 * rnd()), s: rnd() * TAU });
      else if (isTonal(h)) { if (w.night) w.shoot = { x: 0.2 * N + (h.pc / 11) * 0.6 * N, y: 0.05 * N, t: 0 }; else { w.glint = h.pc % 12; w.glintT = 0.3; } }
    }
    // the speed: the energy, and gravity along the slope; the surfer rides the dune or flies off it
    const target = N * (0.14 + 0.25 * f.level + 0.2 * clamp(f.rel.bassDrive)) * (1 + 1.2 * clamp(slope, -0.4, 0.4));
    w.v = follow(w.v, target, dt, 0.4);
    const yOld = w.y;
    w.scroll += w.v * dt;
    const xw2 = sx + w.scroll, gnow = gy0(xw2);
    if (w.air) { w.y += (w.vy + 0.5 * g * dt) * dt; w.vy += g * dt; if (w.vy > 0 && w.y >= gnow) { w.y = gnow; w.vy = 0; w.vg = 0; w.air = false; for (let k = 0; k < 6; k++) w.sand.push({ x: sx + (rnd() - 0.5) * 4 * u, y: gnow, vx: -w.v + (rnd() - 0.5) * N * 0.3, vy: -N * (0.2 + 0.3 * rnd()), life: 0.5 }); } }
    else { // riding: it leaves the dune only where the sand falls away faster than a free fall from its last vertical speed would
      const vy0 = w.vg, yFree = yOld + vy0 * dt + 0.5 * g * dt * dt;
      if (gnow > yFree + 0.5 * u) { w.air = true; w.y = yFree; w.vy = vy0 + g * dt; } else { w.y = gnow; w.vg = (gnow - yOld) / dt; }
    }
    const tilt = w.air ? Math.atan2(w.vy, w.v) * 0.5 : Math.atan(slope), ux = Math.cos(tilt), uy = Math.sin(tilt);
    w.glintT -= dt;

    // the sky: the stars by night, the far mountain with its light, the beam taller on the beat
    if (w.night) for (const [stx, sty] of w.stars) r.set(stx * N, sty * N, hash(Math.floor(stx * 1000), f.beat.count) < 0.2 ? LMID : LMID + DIM);
    else { r.rect(0, 0.4 * N, N, 0.12 * N, LMID + DIM); r.disc(0.15 * N, 0.2 * N, 5 * u, BRIGHT); }
    if (w.shoot) { const sh = w.shoot; sh.t += dt; r.line(sh.x + sh.t * N * 0.6, sh.y + sh.t * N * 0.25, sh.x + (sh.t - 0.08) * N * 0.6, sh.y + (sh.t - 0.08) * N * 0.25, BRIGHT); if (sh.t > 0.5) w.shoot = null; }
    const mx = 0.7 * N, my = 0.22 * N;
    r.poly([[mx - 0.22 * N, 0.56 * N], [mx - 0.04 * N, my + 0.02 * N], [mx, my], [mx + 0.03 * N, my + 0.03 * N], [mx + 0.2 * N, 0.56 * N]], DARK + (w.night ? DIM : 0));
    r.rect(mx - u * 0.5, my - 0.12 * N * f.beat.pulse - 2 * u, Math.max(1, u), 0.12 * N * f.beat.pulse + 2 * u, BRIGHT);
    r.disc(mx, my - u, (1.5 + 1.5 * f.beat.pulse) * u, BRIGHT);
    // the dunes far to near, each with the ruins that stand on it (drawn after the dune, before the nearer one)
    const ruins = (k, px, by, c, z) => { // z: the layer's scale, smaller the farther back it stands
      const kind = Math.floor(hash(k, 81) * 3), hh = (0.06 + 0.05 * hash(k, 82)) * N * z, s = u * z;
      if (kind === 0) for (const dx of [-3 * s, 3 * s]) r.rect(px + dx - s, by - hh * (dx < 0 ? 1 : 0.6), 2 * s, hh * (dx < 0 ? 1 : 0.6), c);
      else if (kind === 1) { r.rect(px - 5 * s, by - hh, 2 * s, hh, c); r.rect(px + 3 * s, by - hh, 2 * s, hh, c); r.ring(px, by - hh, 5 * s, 2 * s, c); r.rect(px - 6 * s, by - hh - 2 * s, 12 * s, 1.5 * s, c); }
      else { r.rect(px - 3 * s, by - hh * 1.3, 6 * s, hh * 1.3, c); r.rect(px - 4 * s, by - hh * 1.3, 8 * s, 1.5 * s, c); }
    };
    const layer = (gyf, pf, col, rc, spacing) => {
      const sc = w.scroll * pf;
      for (let x = 0; x < N; x++) vfill(r, x, gyf(x + sc), N, col);
      for (let k = Math.floor(sc / spacing) - 1; k <= Math.floor((sc + N) / spacing) + 1; k++) if (hash(k, 83) < 0.4) { const lx = k * spacing + hash(k, 84) * spacing * 0.5; ruins(k, lx - sc, gyf(lx), rc, Math.sqrt(pf)); }
    };
    layer(gy2, 0.25, w.night ? DARK + DIM : LMID + DIM, DARK + DIM, 0.8 * N);
    layer(gy1, 0.55, MID + D, DARK + (w.night ? DIM : 0), 0.9 * N);
    layer(gy0, 1, LMID + D, DARK, 1.1 * N);
    // the surfer's shadow on the sand (the sun is up and to the left), the board, the robe, the hood
    const fy = w.y, gyS = gy0(xw2), shrink = clamp(1 - (gyS - fy) / (0.3 * N), 0.3, 1);
    r.ring(sx + 2 * u + (gyS - fy) * 0.3, gyS, 3 * u * shrink, 2 * u * shrink, DARK + DIM, 0.35);
    r.stroke(sx - 6 * u * ux, fy - 6 * u * uy, sx + 6 * u * ux, fy + 6 * u * uy, Math.max(1, 1.5 * u), DARK);
    const px = (a, b) => [sx + a * ux - b * uy, fy + a * uy - b * ux]; // along the board, up from it
    r.poly([px(-H0 * 0.22, 0), px(H0 * 0.22, 0), px(H0 * 0.12, H0 * 0.7), px(-H0 * 0.12, H0 * 0.7)], FIG);
    const [hx, hy] = px(0, H0 * 0.84);
    r.disc(hx, hy, H0 * 0.17, FIG);
    r.disc(hx - H0 * 0.06, hy - H0 * 0.04, H0 * 0.1, LMID + D);
    const [ax, ay] = px(-H0 * 0.1, H0 * 0.55);
    r.stroke(ax, ay, ax - H0 * 0.3, ay + H0 * 0.15, Math.max(1, u), FIG);
    targets.push({ x: sx - H0 * 0.4, y: fy - H0, w: H0 * 0.8, h: H0 });
    // the scarf: the first point rides the neck, the rest are blown back and down, each held a segment from the last
    const [nx, ny] = px(-H0 * 0.05, H0 * 0.72), seg = H0 * 0.14, wind = w.v * 0.9 + N * 0.06 * Math.sin(f.rel.midClock);
    w.scarf[0].x = nx; w.scarf[0].y = ny;
    for (let i = 1; i < w.scarf.length; i++) { const p = w.scarf[i]; p.x -= wind * dt * (0.6 + 0.4 * (i / 12)); p.y += (N * 0.25 - Math.abs(wind) * 0.08) * dt + Math.sin(t * 7 + i * 0.8) * u * 0.5; }
    for (let pass = 0; pass < 2; pass++) for (let i = 1; i < w.scarf.length; i++) { const p = w.scarf[i], q = w.scarf[i - 1], dx = p.x - q.x, dy = p.y - q.y, l = Math.hypot(dx, dy) || 1; p.x = q.x + (dx / l) * seg; p.y = q.y + (dy / l) * seg; }
    for (let i = 1; i < w.scarf.length; i++) { const p = w.scarf[i], q = w.scarf[i - 1]; r.stroke(q.x, q.y, p.x, p.y, i < 6 ? 2 * u : Math.max(1, 1.2 * u), w.glintT > 0 && i === w.glint ? BRIGHT : HOT); }
    // the sand off the board, falling back to the dune; the cloth creatures, chains that follow a swooping head
    if (!w.air) for (let k = 0, n = Math.max(1, Math.round((1 + Math.floor(w.v / (0.2 * N))) * 30 * dt)); k < n; k++) w.sand.push({ x: sx - 5 * u * ux, y: fy - 5 * u * uy, vx: -w.v * (1 + 0.3 * rnd()) + (rnd() - 0.5) * N * 0.1, vy: -N * (0.1 + 0.3 * rnd()), life: 0.6 }); // left behind in the world, so it streams back on the screen
    w.sand = w.sand.filter((p) => { p.y += (p.vy + 0.5 * g * dt) * dt; p.vy += g * dt; p.x += p.vx * dt; p.life -= dt; if (p.life <= 0 || p.y > gy0(p.x + w.scroll)) return false; r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), BRIGHT); return true; });
    w.creatures = w.creatures.filter((c) => {
      const hd = c.pts[0];
      hd.x += c.vx * dt; hd.y += Math.sin(t * 2.5 + c.s) * 10 * u * dt;
      for (let i = 1; i < c.pts.length; i++) { const p = c.pts[i], q = c.pts[i - 1]; p.y += Math.sin(t * 8 + i) * u * 0.6; const dx = p.x - q.x, dy = p.y - q.y, l = Math.hypot(dx, dy) || 1; p.x = q.x + (dx / l) * 2.5 * u; p.y = q.y + (dy / l) * 2.5 * u; }
      for (let i = 1; i < c.pts.length; i++) r.stroke(c.pts[i - 1].x, c.pts[i - 1].y, c.pts[i].x, c.pts[i].y, i < 3 ? 2.5 * u : Math.max(1, 1.2 * u), LMID + D);
      r.rect(hd.x - u, hd.y - u, 2 * u, 2 * u, COOL);
      targets.push({ x: hd.x - 2 * u, y: hd.y - 3 * u, w: 16 * u, h: 6 * u });
      return hd.x > -0.2 * N;
    });
  },
};

// ---------------------------------------------------------------------------------------------- shipcrew
// A spaceship in cutaway: two decks of rooms (engines, shields, weapons, bridge above; the reactor, oxygen, the
// medbay, the hold below), a tiny crew walking the decks and climbing the ladders between them, going where
// they are needed on the beat. The bass drives the engines, the mid band the shield bubble, the treble the
// weapons; a hard snare starts a fire that spreads until the crew beats it out; an enemy outside fires on the
// kicks (the shots fly, the shield flashes where they land, or the hull burns); on the hats the turret fires
// back; a drop breaches the hull: the air rushes out, the doors seal, a patch goes on.
const DECK = [0.36, 0.52], DECK_H = 0.14, COLS = [0.12, 0.27, 0.42, 0.57, 0.69], LADDERS = [0.19, 0.49];
const ROOM_SYS = [['eng', 'shd', 'wpn', 'brg'], ['core', 'oxy', 'med', 'hold']];
const roomOf = (c, d) => ({ x0: COLS[c], x1: COLS[c + 1], y0: DECK[d], y1: DECK[d] + DECK_H, sys: ROOM_SYS[d][c] });

const shipcrew = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { crew: Array.from({ length: 4 }, (_, k) => ({ x: 0.2 + 0.12 * k, d: k % 2, path: [], ph: 0, dir: 1, home: k })), fires: [], smoke: [], shots: [], sparks: [], exhaust: [], breach: null, patches: [], air: [],
      stars: Array.from({ length: 50 }, () => [rnd(), rnd(), rnd() < 0.35 ? 2 : 1]), enemy: { flash: 0 }, shieldHit: 0, hitAt: null, bob: 0, o2: 1 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bass = clamp(f.rel.bassDrive), mid = clamp(f.rel.midDrive), treb = clamp(f.rel.trebDrive);
    const bobY = 1.5 * u * Math.sin(t * 0.9), Y = (q) => q * N + bobY, X = (q) => q * N, floorY = (d) => Y(DECK[d] + DECK_H) - u;
    const shieldsUp = mid > 0.25, scx = X(0.405), scy = Y(0.51), srx = 0.34 * N, sry = 0.21 * N;
    const colOf = (x) => Math.min(3, Math.max(0, COLS.findIndex((c, i) => i < 4 && x >= c && x < COLS[i + 1])));
    const burning = (c, d) => w.fires.some((fr) => fr.c === c && fr.d === d);
    const startFire = (c, d) => { if (w.fires.filter((fr) => fr.c === c && fr.d === d).length < 8) w.fires.push({ c, d, x: lerp(COLS[c] + 0.02, COLS[c + 1] - 0.02, rnd()), hp: 1, t: 0 }); };
    if (f.section === 'drop' && !w.breach) {
      const c = Math.floor(rnd() * 4), d = rnd() < 0.5 ? 0 : 1;
      w.breach = { c, d, x: lerp(COLS[c] + 0.03, COLS[c + 1] - 0.03, rnd()), t: 6 };
      s.shake = Math.max(s.shake, 0.5);
    }
    for (const h of hits) {
      if (isLow(h)) w.shots.push({ x: X(0.86) - 6 * u, y: Y(0.5) + (rnd() - 0.5) * 0.2 * N, vx: -N * 0.9, vy: 0, foe: true, life: 3 });
      else if (h.kind === 'snare' && h.strength > 0.6) startFire(Math.floor(rnd() * 4), rnd() < 0.5 ? 0 : 1);
      else if (h.kind === 'hat') w.shots.push({ x: X(0.49), y: Y(0.34), vx: N * 1.1, vy: (Y(0.5) - Y(0.34)) / ((X(0.86) - X(0.49)) / (N * 1.1)), foe: false, life: 2 });
    }
    // the crew: on the beat the idle go where the fire is, else to their stations or wherever; ladders between decks
    for (const cm of w.crew) {
      if (!cm.path.length && f.beat.on && (cm.home + f.beat.count) % 2 === 0) {
        const fire = w.fires.find((fr) => !(w.breach && fr.c === w.breach.c && fr.d === w.breach.d));
        let c = fire ? fire.c : rnd() < 0.5 ? cm.home : Math.floor(rnd() * 4), d = fire ? fire.d : rnd() < 0.5 ? 0 : 1;
        if (w.breach && c === w.breach.c && d === w.breach.d) { c = (c + 1) % 4; }
        const tx = lerp(COLS[c] + 0.03, COLS[c + 1] - 0.03, fire ? 0.5 : rnd());
        if (d !== cm.d) { const lx = Math.abs(LADDERS[0] - cm.x) < Math.abs(LADDERS[1] - cm.x) ? LADDERS[0] : LADDERS[1]; cm.path.push([lx, cm.d], [lx, d]); }
        cm.path.push([tx, d]);
      }
      if (cm.path.length) {
        const [tx, td] = cm.path[0], v = (0.07 + 0.08 * f.level) * N * dt;
        if (td !== cm.d) { cm.climb = true; cm.cy = cm.cy ?? floorY(cm.d) - bobY; const ty = floorY(td) - bobY; cm.cy += Math.sign(ty - cm.cy) * Math.min(v, Math.abs(ty - cm.cy)); cm.ph += (v / (2 * u)) * Math.PI; if (Math.abs(cm.cy - ty) < 0.5) { cm.d = td; cm.cy = undefined; cm.climb = false; cm.path.shift(); } } // the climb in the ship's own frame, so it bobs with the hull
        else { const dx = tx * N - cm.x * N; if (Math.abs(dx) < u) cm.path.shift(); else { cm.x += (Math.sign(dx) * Math.min(v, Math.abs(dx))) / N; cm.dir = Math.sign(dx); cm.ph += (v / (2.2 * u)) * Math.PI; } }
      }
    }
    // the fires spread in their room and die under the crew; the breach blows for a while, then it is patched
    w.fires = w.fires.filter((fr) => {
      fr.t += dt;
      if (fr.t > 0.7 && rnd() < 0.5) { fr.t = 0; startFire(fr.c, fr.d); }
      for (const cm of w.crew) if (cm.d === fr.d && !cm.climb && Math.abs(cm.x - fr.x) * N < 6 * u) fr.hp -= dt * 1.2;
      if (fr.hp <= 0) { for (let k = 0; k < 4; k++) w.smoke.push({ x: X(fr.x), y: floorY(fr.d) - 3 * u, vx: (rnd() - 0.5) * N * 0.05, vy: -N * 0.1, life: 0.6, c: LMID }); return false; }
      return true;
    });
    if (w.breach && (w.breach.t -= dt) <= 0) { w.patches.push({ c: w.breach.c, d: w.breach.d, x: w.breach.x }); if (w.patches.length > 6) w.patches.shift(); w.breach = null; }
    w.o2 = clamp(w.o2 + (w.breach ? -0.12 : 0.05) * dt);
    w.shieldHit -= dt; w.enemy.flash -= dt;

    // space: two layers of stars streaming left, quicker with the level
    for (const st of w.stars) {
      st[0] = ((st[0] - dt * (0.05 + 0.2 * f.level) * (st[2] === 2 ? 1 : 0.4)) % 1 + 1) % 1;
      r.rect(st[0] * N, st[1] * N, Math.max(1, u * 0.7 * st[2]), Math.max(1, u * 0.6), st[2] === 2 ? LMID : DARK + DIM);
    }
    // the engine flames and exhaust, the shield bubble, the hull
    for (const q of [0.44, 0.58]) {
      r.poly([[X(0.12), Y(q - 0.025)], [X(0.12), Y(q + 0.025)], [X(0.075), Y(q + 0.035)], [X(0.075), Y(q - 0.035)]], DARK);
      const fl = (0.03 + 0.1 * bass) * N * (1 + 0.15 * f.beat.pulse);
      r.poly([[X(0.075), Y(q - 0.03)], [X(0.075), Y(q + 0.03)], [X(0.075) - fl, Y(q)]], HOT);
      r.poly([[X(0.075), Y(q - 0.015)], [X(0.075), Y(q + 0.015)], [X(0.075) - fl * 0.55, Y(q)]], BRIGHT);
      if (rnd() < 0.3 + bass) w.exhaust.push({ x: X(0.075) - fl, y: Y(q) + (rnd() - 0.5) * 2 * u, vx: -N * (0.3 + 0.4 * bass), vy: (rnd() - 0.5) * N * 0.05, life: 0.5, c: HOT + DIM });
    }
    w.exhaust = drift(W, w.exhaust, HOT + DIM, 0.5);
    if (shieldsUp) r.ring(scx, scy, srx, Math.max(1, u * (0.8 + 1.5 * mid)), w.shieldHit > 0 ? BRIGHT : mid > 0.6 ? COOL : COOL + DIM, sry / srx);
    r.poly([[X(0.08), Y(0.51)], [X(0.12), Y(0.33)], [X(0.6), Y(0.33)], [X(0.74), Y(0.51)], [X(0.6), Y(0.69)], [X(0.12), Y(0.69)]], MID);
    r.rect(X(0.46), Y(0.325) - 3 * u, 0.06 * N, 3 * u, DARK); // the turret housing
    r.rect(X(0.5) - u, Y(0.325) - 4.5 * u, 4 * u, Math.max(1, 1.5 * u), treb > 0.5 ? BRIGHT : LMID);
    // the rooms: dark inside, a lit floor, their system in each; doors between them, ladders between the decks
    for (let d = 0; d < 2; d++)
      for (let c = 0; c < 4; c++) {
        const R = roomOf(c, d), x0 = X(R.x0) + u, x1 = X(R.x1) - u, y0 = Y(R.y0) + u, y1 = Y(R.y1) - u, cx = (x0 + x1) / 2, fy = floorY(d), sealed = w.breach && w.breach.c === c && w.breach.d === d;
        r.rect(x0, y0, x1 - x0, y1 - y0, sealed ? DARK + DIM : DARK);
        r.rect(x0, fy, x1 - x0, Math.max(1, u), LMID);
        if (c < 3) r.rect(x1 - u * 0.5, fy - 4 * u, Math.max(1, 1.5 * u), 4 * u, sealed || (w.breach && w.breach.c === c + 1 && w.breach.d === d) ? HOT : BG); // the door, red when shut
        switch (R.sys) {
          case 'eng': for (let k = 0; k < 3; k++) r.rect(x0 + 2 * u, y0 + 2 * u + k * 3 * u, x1 - x0 - 4 * u, Math.max(1, u), (k + Math.floor(f.rel.bassClock * 3)) % 3 ? MID : HOT); break;
          case 'core': { const R2 = (3 + 3 * bass) * u * (1 + 0.2 * f.beat.pulse); r.ring(cx, (y0 + fy) / 2, R2 + 1.5 * u, Math.max(1, u), MID); r.disc(cx, (y0 + fy) / 2, R2, HOT); r.disc(cx, (y0 + fy) / 2, R2 * 0.5, BRIGHT); break; }
          case 'shd': r.ring(cx, (y0 + fy) / 2, 4 * u, Math.max(1, 1.5 * u), mid > 0.25 ? COOL : COOL + DIM); r.disc(cx, (y0 + fy) / 2, 1.5 * u + 1.5 * u * mid, mid > 0.6 ? BRIGHT : COOL); break;
          case 'oxy': r.rect(cx - 3 * u, y0 + 2 * u, 6 * u, fy - y0 - 2 * u, MID); r.rect(cx - 2 * u, fy - (fy - y0 - 3 * u) * w.o2, 4 * u, (fy - y0 - 3 * u) * w.o2, w.o2 < 0.4 ? HOT : COOL); break;
          case 'wpn': r.rect(cx - 4 * u, fy - 4 * u, 8 * u, 4 * u, MID); r.rect(cx - 3 * u, fy - 3.5 * u, 6 * u * treb, Math.max(1, u), treb > 0.5 ? BRIGHT : LMID); break;
          case 'med': r.rect(x0 + 2 * u, fy - 3 * u, 8 * u, 3 * u, LMID); r.rect(x0 + 2 * u, fy - 5 * u, 2 * u, 2 * u, LMID); r.rect(x1 - 5 * u, y0 + 2 * u, 3 * u, Math.max(1, u), HOT); r.rect(x1 - 4 * u, y0 + u, Math.max(1, u), 3 * u, HOT); break;
          case 'brg': for (let k = 0; k < 6; k++) r.rect(x0 + 2 * u + (k % 3) * 2.5 * u, y0 + 2 * u + Math.floor(k / 3) * 2.5 * u, 1.5 * u, 1.5 * u, hash(k, f.beat.count) < 0.5 ? COOL : DARK + DIM); r.rect(x1 - 4 * u, y0 + 2 * u, 3 * u, 5 * u, LMID + DIM); break;
          default: for (let k = 0; k < 3; k++) r.rect(x0 + 2 * u + k * 3.5 * u, fy - 3 * u - (k === 1 ? 3 * u : 0), 3 * u, 3 * u + (k === 1 ? 3 * u : 0), MID);
        }
      }
    for (const lx of LADDERS) { for (const dx of [-1.2, 1.2]) r.rect(X(lx) + dx * u - u * 0.5, Y(DECK[0]) + 3 * u, Math.max(1, u), Y(DECK[1] + DECK_H) - Y(DECK[0]) - 4 * u, LMID + DIM); for (let y = Y(DECK[0]) + 5 * u; y < Y(DECK[1] + DECK_H) - 2 * u; y += 2.5 * u) r.rect(X(lx) - 1.2 * u, y, 2.4 * u, Math.max(1, u), LMID + DIM); }
    for (const p of w.patches) r.rect(X(p.x) - 3 * u, p.d ? Y(0.69) - 2 * u : Y(0.33), 6 * u, 2 * u, LMID);
    // the crew, the fires with their smoke, the breach with the air streaming out of it
    for (const cm of w.crew) {
      const cxp = X(cm.x), cy = cm.climb ? cm.cy + bobY : floorY(cm.d), hh = 0.065 * N;
      if (cm.climb) { r.rect(cxp - 1.5 * u, cy - hh * 0.75, 3 * u, hh * 0.45, FIG); r.disc(cxp, cy - hh * 0.85, hh * 0.13, FIG); for (const k of [-1, 1]) { r.line(cxp + k * u, cy - hh * 0.7, cxp + k * 1.5 * u, cy - hh * (0.95 + 0.1 * k * Math.sin(cm.ph)), FIG); r.line(cxp + k * u, cy - hh * 0.3, cxp + k * 1.5 * u, cy - hh * (0.1 - 0.1 * k * Math.sin(cm.ph)), FIG); } }
      else walker(r, cxp, cy, hh, FIG, cm.path.length ? cm.ph : 0, cm.dir, { cap: true, hatCol: [HOT, COOL, LMID, BRIGHT][cm.home] });
      targets.push({ x: cxp - 3 * u, y: cy - hh, w: 6 * u, h: hh });
    }
    for (const fr of w.fires) {
      const fx = X(fr.x), fy = floorY(fr.d), fl = Math.floor(t * 14 + fr.x * 100) % 2;
      r.rect(fx - 1.5 * u, fy - 3 * u, 3 * u, 3 * u, HOT);
      r.rect(fx - u + (fl ? u : 0), fy - 5 * u, 2 * u, 2 * u, fl ? BRIGHT : HOT);
      if (rnd() < 0.3) w.smoke.push({ x: fx, y: fy - 5 * u, vx: (rnd() - 0.5) * N * 0.04, vy: -N * 0.12, life: 0.7, c: DARK + DIM, top: Y(DECK[fr.d]) + 2 * u });
    }
    w.smoke = drift(W, w.smoke.filter((p) => !(p.top !== undefined && p.y < p.top)), DARK + DIM, 1.5);
    if (w.breach) {
      const B = w.breach, hx = X(B.x), hy = B.d ? Y(0.69) : Y(0.33), out = B.d ? 1 : -1;
      r.rect(hx - 3 * u, hy - 2 * u, 6 * u, 4 * u, BG);
      for (const k of [-3, 3]) r.rect(hx + k * u - u * 0.5, hy - 2 * u - out * u, Math.max(1, u), 2 * u, LMID);
      for (let k = 0; k < 3; k++) w.air.push({ x: lerp(X(COLS[B.c]) + 2 * u, X(COLS[B.c + 1]) - 2 * u, rnd()), y: Y(DECK[B.d]) + 2 * u + rnd() * (DECK_H * N - 4 * u), hx, hy, out, life: 1.5 });
    }
    w.air = w.air.filter((p) => {
      const dx = p.hx - p.x, dy = p.hy - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > 2 * u && !p.past) { p.x += (dx / d) * N * 0.5 * dt; p.y += (dy / d) * N * 0.5 * dt; } else { p.past = true; p.y += p.out * N * 0.7 * dt; p.x += (p.vx = (p.vx || (rnd() - 0.5) * N * 0.2)) * dt; }
      r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), LMID);
      return (p.life -= dt) > 0;
    });
    // the shots: the enemy's land on the shield, or on the hull and start a fire; ours cross to the enemy
    w.shots = w.shots.filter((sh) => {
      sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.life -= dt;
      if (sh.foe) {
        const e = ((sh.x - scx) / srx) ** 2 + ((sh.y - scy) / sry) ** 2;
        if (shieldsUp && e <= 1) { w.shieldHit = 0.15; burst(w.sparks, rnd, sh.x, sh.y, 8, N * 0.25, COOL, 0.3); return false; }
        if (sh.x < X(0.74 - 0.14 * Math.min(1, Math.abs((sh.y - bobY) / N - 0.51) / 0.18))) { const c = colOf(sh.x / N), d = sh.y < Y(0.51) ? 0 : 1; startFire(c, d); s.shake = Math.max(s.shake, 0.35); burst(w.sparks, rnd, sh.x, sh.y, 8, N * 0.3, HOT, 0.4); return false; } // the hull's slanted bow at this height
        r.rect(sh.x - 2 * u, sh.y - u * 0.5, 4 * u, Math.max(1, u), HOT);
      } else {
        if (sh.x > X(0.86) - 5 * u) { w.enemy.flash = 0.15; burst(w.sparks, rnd, sh.x, sh.y, 6, N * 0.25, BRIGHT, 0.3); return false; }
        r.rect(sh.x - 2 * u, sh.y - u * 0.5, 4 * u, Math.max(1, u), COOL);
      }
      return sh.life > 0;
    });
    w.sparks = particles(W, w.sparks, BRIGHT);
    // the enemy outside, bobbing on the beat; it flashes when hit
    const ex = X(0.88), ey = Y(0.5) + 2 * u * Math.sin(t * 1.4) - 2 * u * f.beat.pulse, ec = w.enemy.flash > 0 ? BRIGHT : DARK;
    r.poly([[ex - 7 * u, ey], [ex, ey - 5 * u], [ex + 10 * u, ey - 3 * u], [ex + 10 * u, ey + 3 * u], [ex, ey + 5 * u]], ec);
    r.rect(ex - 9 * u, ey - u, 3 * u, 2 * u, w.enemy.flash > 0 ? BRIGHT : HOT);
    for (const k of [-1, 1]) r.rect(ex + 3 * u, ey + k * 6 * u - u, 7 * u, 2 * u, ec);
    targets.push({ x: ex - 9 * u, y: ey - 7 * u, w: 19 * u, h: 14 * u });
  },
};

// ---------------------------------------------------------------------------------------------- cardbattle
// A card battle: a hand of five fanned at the bottom (faces with a shape each, no words), the deck and the discard
// as stacks, an energy orb that fills with the level. A kick plays the first card: it rises, flips and goes off
// (a slash at the enemy, a shield dome, a burst of fire, a drain beam back to the orb) and a new card is drawn;
// the enemy on the right lunges on a snare, taken on the shield pips or on the health bar; a note changes its
// intent glyph. A section change deals a new hand and a new enemy; a drop brings a boss for a while.
const CARDS = {
  strike: { c: HOT, fx: 'slash', cost: 1, sym: 'tri' },
  guard: { c: COOL, fx: 'dome', cost: 1, sym: 'disc' },
  flare: { c: BRIGHT, fx: 'fire', cost: 2, sym: 'star' },
  leech: { c: LMID, fx: 'beam', cost: 2, sym: 'ring' },
};
const CARD_W = { strike: [2, 3, 3], guard: [3, 2, 1], flare: [1, 2, 3], leech: [2, 2, 1] };
const ENEMIES = { hood: [3, 2, 1], beast: [1, 2, 2], orb: [1, 2, 3] };

// a card centred on (x, y), turned by rot, `flip` from 1 (the face) through 0 (edge on) to -1 (the back)
function drawCard(r, x, y, cw, ch, rot, flip, K, u) {
  const ca = Math.cos(rot), sa = Math.sin(rot), fw = Math.max(1, cw * Math.abs(flip));
  const P = (a, b) => [x + a * ca - b * sa, y + a * sa + b * ca];
  const pts = [P(-fw / 2, -ch / 2), P(fw / 2, -ch / 2), P(fw / 2, ch / 2), P(-fw / 2, ch / 2)];
  if (flip < 0) { r.poly(pts, DARK); r.poly([P(0, -ch * 0.25), P(fw * 0.3, 0), P(0, ch * 0.25), P(-fw * 0.3, 0)], MID); return; }
  r.poly(pts, BRIGHT);
  for (let k = 0; k < 4; k++) r.stroke(pts[k][0], pts[k][1], pts[(k + 1) % 4][0], pts[(k + 1) % 4][1], Math.max(1, u), K.c);
  for (let k = 0; k < K.cost; k++) { const [px, py] = P(-fw / 2 + 2.5 * u + k * 2.5 * u, -ch / 2 + 2.5 * u); r.rect(px - u * 0.75, py - u * 0.75, Math.max(1, 1.5 * u), Math.max(1, 1.5 * u), K.c); }
  const c = K.c === BRIGHT ? HOT : K.c, [cx, cy] = P(0, ch * 0.08);
  if (K.sym === 'tri') r.poly([P(0, -ch * 0.12), P(fw * 0.3, ch * 0.22), P(-fw * 0.3, ch * 0.22)], c);
  else if (K.sym === 'disc') { r.disc(cx, cy, ch * 0.17, c); r.disc(cx, cy, ch * 0.07, BRIGHT); }
  else if (K.sym === 'star') for (let k = 0; k < 4; k++) { const [ax, ay] = P(Math.cos(k * 0.785) * fw * 0.3, ch * 0.08 + Math.sin(k * 0.785) * ch * 0.2), [bx, by] = P(-Math.cos(k * 0.785) * fw * 0.3, ch * 0.08 - Math.sin(k * 0.785) * ch * 0.2); r.stroke(ax, ay, bx, by, Math.max(1, u), c); }
  else r.ring(cx, cy, ch * 0.15, Math.max(1, 1.5 * u), MID);
}

// the enemy standing at x on the floor y, shaped by kind; `br` is how it breathes, fl a flash
function drawFoe(r, kind, x, y, S, br, fl, u) {
  const c = fl ? BRIGHT : DARK, c2 = fl ? BRIGHT : MID;
  if (kind === 'hood') { r.poly([[x - S * 0.3, y], [x - S * 0.15, y - S * (0.9 + br)], [x + S * 0.15, y - S * (0.9 + br)], [x + S * 0.3, y]], c); r.disc(x, y - S * (0.85 + br), S * 0.17, c); r.rect(x - S * 0.1, y - S * (0.84 + br), S * 0.08, S * 0.04, HOT); r.rect(x + S * 0.32, y - S * 1.2, Math.max(1, u), S * 1.2, c2); r.disc(x + S * 0.32, y - S * 1.22, S * 0.08, HOT); }
  else if (kind === 'beast') { r.poly([[x - S * 0.5, y], [x - S * 0.45, y - S * 0.4], [x - S * 0.1, y - S * (0.7 + br)], [x + S * 0.35, y - S * (0.55 + br)], [x + S * 0.5, y - S * 0.2], [x + S * 0.4, y]], c); for (const k of [-0.35, -0.05, 0.25]) r.rect(x + k * S, y - S * 0.25, S * 0.08, S * 0.25, c); r.disc(x + S * 0.4, y - S * (0.6 + br), S * 0.16, c); for (const k of [-1, 1]) r.stroke(x + S * 0.4 + k * S * 0.08, y - S * (0.72 + br), x + S * 0.4 + k * S * 0.22, y - S * (0.95 + br), Math.max(1, u), c2); r.rect(x + S * 0.47, y - S * (0.62 + br), S * 0.06, S * 0.04, HOT); }
  else if (kind === 'orb') { const oy = y - S * (0.7 + br); r.ring(x, oy, S * 0.3, Math.max(1, 1.5 * u), c2); r.disc(x, oy, S * 0.22, c); r.disc(x, oy, S * 0.09, HOT); for (let k = 0; k < 5; k++) { const a = Math.PI * 0.6 + k * 0.45 + 0.2 * Math.sin(br * 20 + k); r.line(x + Math.cos(a) * S * 0.3, oy + Math.sin(a) * S * 0.3, x + Math.cos(a) * S * 0.5, oy + Math.sin(a) * S * 0.5 + S * 0.15, c2); } }
  else { r.poly([[x - S * 0.55, y], [x - S * 0.4, y - S * (1.3 + br)], [x + S * 0.4, y - S * (1.3 + br)], [x + S * 0.55, y]], c); r.rect(x - S * 0.25, y - S * (1.6 + br), S * 0.5, S * 0.35, c); for (const k of [-1, 1]) { r.stroke(x + k * S * 0.2, y - S * (1.6 + br), x + k * S * 0.45, y - S * (2 + br), 2 * u, c2); } for (const k of [-1, 1]) r.rect(x + k * S * 0.1 - S * 0.04, y - S * (1.48 + br), S * 0.08, S * 0.05, HOT); r.stroke(x - S * 0.5, y - S * 0.9, x - S * 0.9, y - S * 0.5, 2.5 * u, c); }
}

const cardbattle = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { hand: [], deck: 15, discard: 0, orb: 0.5, block: 3, hp: 10, enemy: { kind: rollW(rnd, ENEMIES, band), flash: 0, lunge: 0, hp: 8, struck: false, intent: 0 }, bossT: 0, fx: [], sparks: [], hurt: 0, clink: 0, lastKick: 0 });
    for (let i = 0; i < 5; i++) w.hand.push({ kind: rollW(rnd, CARD_W, band), st: 'hand', x: 0.5, y: 0.85, t: 1 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), cw = 0.1 * N, ch = 0.15 * N, E = w.enemy, floor = 0.66 * N, exBase = 0.76 * N;
    const slot = (i) => [N / 2 + (i - 2) * 0.105 * N, 0.85 * N + Math.abs(i - 2) * 0.012 * N - 1.2 * u * f.beat.pulse * ((i + f.beat.count) % 2), (i - 2) * 0.16];
    const draw = (i) => { if (w.deck <= 0) { w.deck = w.discard; w.discard = 0; } w.deck--; w.hand[i] = { kind: rollW(rnd, CARD_W, band), st: 'draw', x: 0.08, y: 0.86, t: 0 }; };
    if (f.section === 'drop') { w.bossT = 12; E.kind = 'boss'; E.hp = 30; E.flash = 0.3; }
    else if (f.section === 'change') { for (let i = 0; i < 5; i++) { w.discard++; draw(i); } if (w.bossT <= 0) { E.kind = rollW(rnd, ENEMIES, band); E.hp = 8; E.flash = 0.3; } }
    if (w.bossT > 0 && (w.bossT -= dt) <= 0) { E.kind = rollW(rnd, ENEMIES, band); E.hp = 8; E.flash = 0.3; }
    w.orb = follow(w.orb, f.level, dt, 0.5);
    for (const h of hits) {
      if (isLow(h) && t - w.lastKick > 0.3) { // the first card in the hand is played
        const i = w.hand.findIndex((c) => c.st === 'hand');
        if (i >= 0) { const c = w.hand[i]; c.st = 'play'; c.t = 0; w.lastKick = t; w.orb = Math.max(0, w.orb - CARDS[c.kind].cost * 0.15); }
      } else if (h.kind === 'snare' && E.lunge <= 0) { E.lunge = 1; E.struck = false; }
      else if (isTonal(h)) E.intent = h.pc % 3;
    }
    const ex = exBase + (E.lunge > 0 ? -0.12 * N * Math.sin(Math.PI * (1 - E.lunge)) : 0) + (E.flash > 0 ? 2 * u : 0);
    if (E.lunge > 0) { // the attack lands at the top of the lunge: on the shield pips if there are any, else on the health
      const was = E.lunge;
      E.lunge -= dt * 1.6;
      if (was > 0.5 && E.lunge <= 0.5 && !E.struck) {
        E.struck = true;
        w.fx.push({ k: 'claw', x: 0.32 * N, y: 0.62 * N, t: 0 });
        if (w.block > 0) { w.block = Math.max(0, w.block - (E.kind === 'boss' ? 3 : 2)); w.clink = 0.3; } else { w.hp = Math.max(0, w.hp - 1); w.hurt = 0.4; s.shake = Math.max(s.shake, 0.35); }
      }
    }
    E.flash -= dt; w.clink -= dt; w.hurt -= dt;
    // the playing card: up and flipping, then its effect, then off to the discard and a fresh card from the deck
    for (let i = 0; i < 5; i++) {
      const c = w.hand[i], [hx, hy] = slot(i);
      if (c.st === 'hand') { c.x = follow(c.x, hx / N, dt, 0.15); c.y = follow(c.y, hy / N, dt, 0.15); }
      else if (c.st === 'draw') { c.t += dt * 4; const e = ease(c.t); c.x = lerp(0.08, hx / N, e); c.y = lerp(0.86, hy / N, e) - 0.05 * 4 * e * (1 - e); if (c.t >= 1) c.st = 'hand'; } // lifted off the deck in a small arc
      else if (c.st === 'play') {
        c.t += dt * 3;
        c.x = lerp(hx / N, 0.5, ease(Math.min(1, c.t))); c.y = lerp(hy / N, 0.45, ease(Math.min(1, c.t)));
        if (c.t >= 1 && !c.fired) { // the effect
          c.fired = true;
          const K = CARDS[c.kind];
          if (K.fx === 'slash') { w.fx.push({ k: 'slash', x: ex - 0.06 * N, y: 0.5 * N, t: 0 }); E.hp -= 2; E.flash = 0.08; burst(w.sparks, rnd, ex, 0.5 * N, 8, N * 0.3, HOT, 0.4); }
          else if (K.fx === 'dome') { w.fx.push({ k: 'dome', x: 0.22 * N, y: 0.72 * N, t: 0 }); w.block = Math.min(12, w.block + 3); }
          else if (K.fx === 'fire') { w.fx.push({ k: 'fire', x: ex, y: 0.5 * N, t: 0 }); E.hp -= 3; E.flash = 0.12; burst(w.sparks, rnd, ex, 0.5 * N, 20, N * 0.45, HOT, 0.6); s.shake = Math.max(s.shake, 0.3); }
          else { w.fx.push({ k: 'beam', x: ex, y: 0.5 * N, t: 0 }); E.hp -= 1; E.flash = 0.06; }
          if (E.hp <= 0) { burst(w.sparks, rnd, ex, 0.5 * N, 24, N * 0.5, BRIGHT, 0.7); E.kind = w.bossT > 0 ? 'boss' : rollW(rnd, ENEMIES, band); E.hp = w.bossT > 0 ? 30 : 8; E.flash = 0.3; }
        }
        if (c.t >= 2) { w.discard++; draw(i); }
      }
    }
    // the floor and the far wall, the enemy breathing and bobbing on the beat with its intent above it
    r.rect(0, floor, N, N - floor, DARK);
    r.rect(0, floor, N, Math.max(1, u), MID);
    for (let x = 0; x < N; x += 0.1 * N) r.rect(x, 0.2 * N, Math.max(1, u * 0.6), floor - 0.2 * N, DARK + DIM);
    const S = (E.kind === 'boss' ? 0.22 : 0.16) * N, br = 0.03 * Math.sin(t * 2) - 0.02 * f.beat.pulse;
    drawFoe(r, E.kind, ex, floor, S, br, E.flash > 0, u);
    const iy = floor - S * (E.kind === 'boss' ? 2.2 : 1.45) - 2 * u * f.beat.pulse;
    if (E.intent === 0) r.poly([[ex, iy - 3 * u], [ex + 3 * u, iy + 2 * u], [ex - 3 * u, iy + 2 * u]], HOT);
    else if (E.intent === 1) r.ring(ex, iy, 2.5 * u, Math.max(1, u), COOL);
    else for (let k = 0; k < 3; k++) r.line(ex - 3 * u + k * 2 * u, iy + (k % 2 ? -2 : 2) * u, ex - u + k * 2 * u, iy + (k % 2 ? 2 : -2) * u, BRIGHT);
    targets.push({ x: ex - S * 0.6, y: floor - S * (E.kind === 'boss' ? 2 : 1.3), w: S * 1.2, h: S * (E.kind === 'boss' ? 2 : 1.3) });
    for (let k = 0; k < Math.max(0, Math.min(30, E.hp)); k++) r.rect(ex - S * 0.5 + k * 2 * u, floor + 3 * u, Math.max(1, 1.5 * u), 2 * u, HOT);
    // the effects
    w.fx = w.fx.filter((e) => {
      e.t += dt;
      if (e.k === 'slash') crescent(r, e.x, e.y, 0.09 * N * (0.7 + e.t), 0.3, 1.1, Math.max(1, 2 * u * (1 - e.t * 3)), e.t < 0.1 ? BRIGHT : HOT);
      else if (e.k === 'claw') for (let k = 0; k < 3; k++) r.stroke(e.x + k * 3 * u, e.y - 0.08 * N + e.t * 0.1 * N, e.x + k * 3 * u + 4 * u, e.y + e.t * 0.1 * N, Math.max(1, 1.2 * u), w.clink > 0 ? COOL : HOT);
      else if (e.k === 'dome') crescent(r, e.x, e.y, 0.14 * N * Math.min(1, e.t * 4), Math.PI * 1.5, Math.PI * 0.5, Math.max(1, 1.5 * u), e.t < 0.2 ? BRIGHT : COOL, 12);
      else if (e.k === 'fire') for (let k = 0; k < 3; k++) r.ring(e.x, e.y, (0.04 + e.t * 0.4 + k * 0.03) * N, Math.max(1, u), k ? HOT + DIM : HOT);
      else { r.line(e.x, e.y, 0.1 * N, 0.74 * N, LMID + DIM); for (let k = 0; k < 5; k++) { const q = (k / 5 + e.t * 1.5) % 1; r.disc(lerp(e.x, 0.1 * N, q), lerp(e.y, 0.74 * N, q), 1.5 * u, BRIGHT); } if (e.t > 0.5) w.orb = Math.min(1, w.orb + dt * 0.4); }
      return e.t < (e.k === 'dome' ? 0.6 : e.k === 'beam' ? 0.9 : 0.3);
    });
    w.sparks = particles(W, w.sparks, HOT);
    // the orb, its liquid rippling on the beat; the health pips; the shield pips; the piles; the hand
    const ox = 0.1 * N, oy = 0.74 * N, oR = 0.055 * N;
    r.disc(ox, oy, oR + u, MID);
    r.disc(ox, oy, oR, DARK);
    for (let y = Math.floor(oy - oR); y <= oy + oR; y++) { const lvl = oy + oR - 2 * oR * w.orb + Math.sin(y * 0.3 + t * 4) * u * f.beat.pulse; if (y < lvl) continue; const hw = Math.sqrt(Math.max(0, oR * oR - (y + 0.5 - oy) ** 2)); r.rect(ox - hw, y, 2 * hw, 1, COOL); }
    for (let k = 0; k < 10; k++) r.rect(0.03 * N, 0.6 * N - k * 3 * u, 3 * u, 2 * u, k < w.hp ? (w.hurt > 0 ? BRIGHT : HOT) : DARK);
    for (let k = 0; k < w.block; k++) r.poly([[0.17 * N + k * 3.5 * u, 0.66 * N], [0.17 * N + k * 3.5 * u + 2.5 * u, 0.66 * N], [0.17 * N + k * 3.5 * u + 2.5 * u, 0.68 * N], [0.17 * N + k * 3.5 * u + 1.25 * u, 0.695 * N], [0.17 * N + k * 3.5 * u, 0.68 * N]], w.clink > 0 ? BRIGHT : COOL);
    for (let k = 0; k < Math.min(8, w.deck); k++) r.rect(0.03 * N, 0.8 * N - k * 0.6 * u, cw * 0.8, ch * 0.8, k % 2 ? DARK : MID);
    for (let k = 0; k < Math.min(8, w.discard); k++) r.rect(0.89 * N, 0.8 * N - k * 0.6 * u, cw * 0.8, ch * 0.8, k % 2 ? DARK + DIM : MID + DIM);
    const order = w.hand.map((c, i) => i).sort((a, b) => (w.hand[a].st === 'play' ? 1 : 0) - (w.hand[b].st === 'play' ? 1 : 0));
    for (const i of order) {
      const c = w.hand[i], rot = c.st === 'play' ? slot(i)[2] * (1 - Math.min(1, c.t)) : slot(i)[2];
      const flip = c.st === 'play' ? (c.t < 1 ? Math.cos(TAU * c.t) : c.t < 1.5 ? 1 : Math.cos(TAU * (c.t - 1.5))) : c.st === 'draw' ? -Math.cos(Math.PI * c.t) : 1; // a whole turn on the way up: face to face, no jump
      const q = c.st === 'play' && c.t > 1.5 ? clamp((c.t - 1.5) * 2) : -1; // the toss to the discard: a steady drift, a parabola up and over
      const px = q >= 0 ? lerp(0.5, 0.93, q) : c.x, py = q >= 0 ? lerp(0.45, 0.86, q) - 0.14 * 4 * q * (1 - q) : c.y;
      drawCard(r, px * N, py * N, cw, ch, rot, flip, CARDS[c.kind], u);
    }
    targets.push({ x: 0.5 * N - cw, y: 0.45 * N - ch / 2, w: 2 * cw, h: ch });
  },
};

// ---------------------------------------------------------------------------------------------- metroidmap
// A metroidvania: a small armoured hero with an arm cannon running through a chain of rooms, each a step up or
// down from the last, doors between them shot open on a kick (the shot flies to the door), jumps on a snare,
// crawlers and fliers shot down for the energy they drop. A minimap in the corner lights the rooms explored; on
// a section change an upgrade waits ahead on a stand and adds a move (a higher jump, a dash on the hats with
// afterimages, a second jump, a charged shot); a drop makes the next door a boss door with a boss behind it.
const MOVES = ['high', 'dash', 'double', 'charge'];
const metroidmap = {
  init(W) {
    Object.assign(W.w, { x: 0.3, cam: 0, fy: 0, vy: 0, air: false, dj: false, dir: 1, ph: 0, doors: {}, room: 0, moves: [], item: null, foes: {}, shots: [], pellets: [], sparks: [], ghosts: [], dash: 0, hurt: 0, energy: 0, boss: null, bossDoor: -1, flash: 0, seen: 0, lv: [1], init: true });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, RW = N, gBase = 0.78 * N, g = 3 * N, H0 = 0.1 * N;
    const lvl = (k) => { // the floor level of room k: a step up or down from the last, remembered once walked
      if (k <= 0) return 1;
      while (w.lv.length <= k) { const i = w.lv.length, h = hash(i, 91); w.lv.push(Math.max(0, Math.min(2, w.lv[i - 1] + (h < 0.3 ? 1 : h < 0.6 ? -1 : 0)))); }
      return w.lv[k];
    };
    const floorOf = (k) => gBase - lvl(k) * 0.09 * N;
    const plats = (k) => (hash(k, 92) < 0.7 ? [{ x: k * RW + RW * (0.25 + 0.4 * hash(k, 93)), y: floorOf(k) - N * (0.13 + 0.08 * hash(k, 94)), w: 0.16 * N }] : []);
    const roomAt = (x) => Math.floor(x / RW);
    if (w.init) { w.x = 0.3 * N; w.fy = floorOf(0); w.init = false; }
    const hx0 = w.x, k0 = roomAt(hx0);
    // rooms come into being as they are reached: their crawler on the floor, maybe a flier
    for (let k = w.seen; k <= k0 + 2; k++) { w.foes[k] = []; if (k > 0 && hash(k, 95) < 0.8) w.foes[k].push({ x: k * RW + RW * 0.6, y: 0, vx: -N * 0.06, hp: 2, fly: false, flash: 0 }); if (k > 1 && hash(k, 96) < 0.5) w.foes[k].push({ x: k * RW + RW * 0.5, y: 0.2 * N, vx: -N * 0.1, hp: 1, fly: true, flash: 0, s: hash(k, 97) * TAU }); }
    w.seen = Math.max(w.seen, k0 + 3);
    if (f.section === 'change' && w.moves.length < 4 && !w.item) w.item = { x: w.x + 0.45 * N, k: w.moves.length, bob: 0 };
    if (f.section === 'drop' && !w.boss) { w.bossDoor = k0 + 1; w.boss = { k: k0 + 1, hp: 10, flash: 0, cool: 1, shots: [], dead: 0 }; if (!w.doors[k0 + 1] || w.doors[k0 + 1].open <= 0) w.doors[k0 + 1] = { open: 0, hp: 3 }; }
    const has = (m) => w.moves.includes(m), fighting = w.boss && !w.boss.dead && k0 === w.boss.k;
    for (const h of hits) {
      if (isLow(h)) { const big = has('charge') && h.strength > 0.8; w.shots.push({ x: w.x + w.dir * 4 * u, y: w.fy - H0 * 0.55, vx: w.dir * N * 1.4, big, dmg: big ? 3 : 1, life: 1.2 }); w.flash = 0.06; }
      else if (h.kind === 'snare') {
        const jv = N * (has('high') ? 1.25 : 1.0);
        if (!w.air) { w.vy = -jv; w.air = true; w.dj = has('double'); } else if (w.dj) { w.vy = -jv * 0.85; w.dj = false; for (let k = 0; k < 4; k++) w.sparks.push({ x: w.x + (rnd() - 0.5) * 4 * u, y: w.fy, vx: (rnd() - 0.5) * N * 0.2, vy: N * 0.1, life: 0.3, c: LMID }); }
      } else if (h.kind === 'hat' && has('dash') && w.dash <= -0.5) w.dash = 0.15;
    }
    // the run: ahead unless a shut door is in the way or the boss is in the room; steps up are jumped
    const doorX = (k0 + 1) * RW, dk = w.doors[k0 + 1] || { open: 0, hp: w.bossDoor === k0 + 1 ? 3 : 1 };
    w.doors[k0 + 1] = dk;
    let v = N * (0.1 + 0.2 * clamp(f.rel.bassDrive)) * (w.dash > 0 ? 3.5 : 1);
    if (fighting) { w.dir = 1; const want = w.boss.k * RW + 0.25 * RW; v = Math.abs(want - w.x) < 2 * u ? 0 : v * Math.sign(want - w.x); }
    else if (dk.open < 1 && w.x > doorX - 7 * u) v = 0;
    let blocked = false; // a higher floor ahead is a wall until the feet clear it (a dash too); from the ground it is jumped
    if (v) { const nx = w.x + v * dt; if (floorOf(roomAt(nx + Math.sign(v) * 3 * u)) >= w.fy - u) w.x = nx; else blocked = true; w.ph += (Math.abs(v) * dt) / (H0 * 0.32) * Math.PI; }
    if (w.dash > 0) w.ghosts.push({ x: w.x, y: w.fy, life: 0.25 });
    w.dash -= dt;
    const prevY = w.fy, fl = floorOf(roomAt(w.x));
    if (!w.air && v > 0 && (blocked || floorOf(roomAt(w.x + 6 * u)) < w.fy - u)) { w.vy = -N * 1.1; w.air = true; w.dj = has('double'); } // clears two steps with a little to spare
    if (w.air) {
      w.fy += (w.vy + 0.5 * g * dt) * dt; w.vy += g * dt; // the exact parabola step: the same height at any frame rate
      if (w.vy > 0) {
        let land = null;
        if (w.fy >= fl) land = fl;
        for (const p of plats(roomAt(w.x))) if (prevY <= p.y && w.fy >= p.y && Math.abs(w.x - p.x) < p.w / 2) land = Math.min(land ?? p.y, p.y);
        if (land !== null) { w.fy = land; w.vy = 0; w.air = false; }
      }
    } else {
      const onPlat = plats(roomAt(w.x)).some((p) => Math.abs(w.fy - p.y) < u && Math.abs(w.x - p.x) < p.w / 2);
      if (!onPlat && w.fy < fl - u) w.air = true; else if (!onPlat) w.fy = fl;
    }
    if (roomAt(w.x) !== w.room) { w.room = roomAt(w.x); s.shake = Math.max(s.shake, 0.1); }
    const pd = w.doors[k0]; // the door behind shuts once the hero is well past it
    if (pd && pd.open >= 1 && w.x > k0 * RW + 10 * u) pd.shut = true;
    w.cam = follow(w.cam, fighting ? w.boss.k * RW : w.x - 0.3 * N, dt, 0.3);
    if (w.item && w.x > w.item.x - 3 * u && !w.air) { w.moves.push(MOVES[w.item.k]); w.item = null; w.flash = 0.4; s.shake = Math.max(s.shake, 0.3); burst(w.sparks, rnd, w.x, w.fy - H0 * 0.5, 20, N * 0.4, BRIGHT, 0.6); }
    w.hurt -= dt; w.flash -= dt;

    // the far layer through the windows, the back wall with its grid, the floors, the platforms, the doors
    for (let k = -1; k < 3; k++) { const bx = ((k * 0.5 * N - w.cam * 0.2) % (1.5 * N) + 1.5 * N) % (1.5 * N) - 0.25 * N; r.rect(bx, 0.25 * N, 0.06 * N, 0.2 * N, DARK + DIM); r.rect(bx + 0.1 * N, 0.3 * N, 0.04 * N, 0.15 * N, DARK + DIM); }
    for (let gx = -((w.cam % (0.1 * N)) + 0.1 * N) % (0.1 * N); gx < N; gx += 0.1 * N) r.rect(gx, 0, Math.max(1, u * 0.5), N, DARK + DIM);
    for (let gy = 0; gy < N; gy += 0.1 * N) r.rect(0, gy, N, Math.max(1, u * 0.5), DARK + DIM);
    for (let k = roomAt(w.cam) - 1; k <= roomAt(w.cam + N) + 1; k++) {
      const x = k * RW - w.cam, fy = floorOf(k);
      r.rect(x, fy, RW, N - fy, MID);
      r.rect(x, fy, RW, Math.max(1, u), LMID);
      for (let q = 0; q < RW; q += 0.1 * N) r.rect(x + q, fy + 3 * u, Math.max(1, u), N - fy, DARK + DIM);
      r.rect(x, 0, RW, 0.12 * N, MID);
      r.rect(x, 0.12 * N - u, RW, Math.max(1, u), DARK);
      for (const p of plats(k)) { r.rect(p.x - p.w / 2 - w.cam, p.y, p.w, 3 * u, LMID); r.rect(p.x - p.w / 2 - w.cam, p.y + 3 * u, p.w, Math.max(1, u), DARK); }
      const d = w.doors[k], dx = x, top = Math.min(floorOf(k - 1), fy) - 0.17 * N, bot = Math.max(floorOf(k - 1), fy), bossy = w.bossDoor === k, fc = bossy ? HOT : LMID;
      if (k > 0) {
        r.rect(dx - 3 * u, top, 6 * u, bot - top, fc);
        const op = d ? (d.shut ? 1 - Math.min(1, (d.shutT = (d.shutT || 0) + dt) * 4) : ease(d.open)) : 0;
        r.rect(dx - 2 * u, top + 2 * u, 4 * u, (bot - top - 2 * u) * (1 - op), bossy ? HOT + DIM : COOL);
        r.rect(dx - 2 * u, top + 2 * u, 4 * u, Math.max(1, u), DARK);
      }
    }
    // the upgrade on its stand; the foes patrolling and bobbing; the shots and what they hit
    if (w.item) { const ix = w.item.x - w.cam, iy = floorOf(roomAt(w.item.x)); w.item.bob += dt * 3; r.rect(ix - 3 * u, iy - 4 * u, 6 * u, 4 * u, DARK); r.disc(ix, iy - 7 * u + Math.sin(w.item.bob) * u, 2.5 * u + 0.5 * u * f.beat.pulse, BRIGHT); r.ring(ix, iy - 7 * u + Math.sin(w.item.bob) * u, 4 * u * (1 + 0.3 * f.beat.pulse), Math.max(1, u), COOL); }
    const hy = w.fy;
    for (let k = Math.max(0, roomAt(w.cam) - 1); k <= roomAt(w.cam + N) + 1; k++) {
      if (!w.foes[k]) continue;
      w.foes[k] = w.foes[k].filter((e) => {
        if (e.fly) { e.x += e.vx * dt; e.y = 0.2 * N + Math.sin(t * 3 + e.s) * 0.04 * N; if (e.x < k * RW + 0.1 * RW || e.x > k * RW + 0.9 * RW) e.vx = -e.vx; }
        else { e.x += e.vx * dt; if (e.x < k * RW + 0.08 * RW || e.x > k * RW + 0.92 * RW) e.vx = -e.vx; }
        e.flash -= dt;
        const sx = e.x - w.cam, fy = floorOf(k), c = e.flash > 0 ? BRIGHT : DARK, ey = e.fly ? e.y : fy;
        if (e.fly) { const wing = Math.floor(t * 16) % 2 ? 3 : 1.5; r.rect(sx - 2 * u, ey - 1.5 * u, 4 * u, 3 * u, c); r.rect(sx - wing * u, ey - 2.5 * u, 2 * wing * u, Math.max(1, u), c); }
        else { r.disc(sx, ey - 2.5 * u, 3.5 * u, c); r.rect(sx - 4 * u, ey - 2.5 * u, 8 * u, 2.5 * u, c); for (let q = 0; q < 4; q++) r.rect(sx - 3.5 * u + q * 2 * u + (Math.floor(t * 10) % 2 ? u * 0.5 : 0), ey - u, Math.max(1, u), Math.max(1, u), LMID); }
        if (Math.abs(sx - (w.x - w.cam)) < 4 * u && Math.abs(ey - (e.fly ? 0 : 3 * u) - (hy - H0 * 0.5)) < H0 * 0.6 && w.hurt <= 0) { w.hurt = 0.6; s.shake = Math.max(s.shake, 0.25); }
        targets.push({ x: sx - 4 * u, y: ey - 5 * u, w: 8 * u, h: 5 * u });
        return true;
      });
    }
    w.shots = w.shots.filter((sh) => { // swept over the way it came this frame, so nothing is skipped between frames
      const x0 = sh.x;
      sh.x += sh.vx * dt; sh.life -= dt;
      const sx = sh.x - w.cam, k = roomAt(sh.x), kd = Math.floor((sh.x + 3 * u) / RW), d = w.doors[kd]; // kd: the last door slab on the way
      if (sh.vx > 0 && kd * RW >= x0 - 3 * u && d && d.open < 1) { d.hp -= sh.dmg; if (d.hp <= 0) d.open = 1e-3; burst(w.sparks, rnd, kd * RW - 3 * u - w.cam, sh.y, 6, N * 0.25, COOL, 0.3); return false; }
      for (const e of w.foes[k] || []) { const ey = e.fly ? e.y : floorOf(k) - 2.5 * u; if (e.x > Math.min(x0, sh.x) - 4 * u && e.x < Math.max(x0, sh.x) + 4 * u && Math.abs(ey - sh.y) < 4 * u) { e.hp -= sh.dmg; e.flash = 0.12; if (e.hp <= 0) { w.foes[k].splice(w.foes[k].indexOf(e), 1); burst(w.sparks, rnd, sx, ey, 10, N * 0.3, LMID, 0.4); w.pellets.push({ x: e.x, y: ey, vy: -N * 0.2, fl: floorOf(k) }); } return false; } }
      if (w.boss && !w.boss.dead && k === w.boss.k && sh.x > w.boss.k * RW + 0.62 * RW) { w.boss.hp -= sh.dmg; w.boss.flash = 0.15; burst(w.sparks, rnd, sx, sh.y, 8, N * 0.3, HOT, 0.4); if (w.boss.hp <= 0) { w.boss.dead = 1; for (let q = 0; q < 5; q++) w.pellets.push({ x: w.boss.k * RW + 0.7 * RW + (rnd() - 0.5) * 0.1 * N, y: floorOf(k) - 0.2 * N, vy: -N * 0.3 * rnd(), fl: floorOf(k) }); } return false; }
      if (sh.big) r.disc(sx, sh.y, 2.2 * u, (Math.floor(t * 30) % 2) ? BRIGHT : COOL); else r.rect(sx - 2 * u, sh.y - u * 0.5, 4 * u, Math.max(1, u), BRIGHT);
      return sh.life > 0;
    });
    for (const k in w.doors) { const d = w.doors[k]; if (d.open > 0 && d.open < 1) d.open = Math.min(1, d.open + dt * 3); }
    w.pellets = w.pellets.filter((p) => { p.vy += g * dt; p.y += p.vy * dt; if (p.y >= p.fl - u) { p.y = p.fl - u; p.vy = 0; } const sx = p.x - w.cam; if (Math.abs(p.x - w.x) < 4 * u && Math.abs(p.y - (hy - H0 * 0.4)) < H0 * 0.6) { w.energy++; return false; } r.rect(sx - u, p.y - 1.5 * u, 2 * u, 2 * u, (Math.floor(t * 6) % 2) ? COOL : BRIGHT); return sx > -0.1 * N; });
    // the boss: a hulking shape at the far end of its room, firing arcs on the beat; it falls when it is done
    if (w.boss) {
      const B = w.boss, bx = B.k * RW + 0.75 * RW - w.cam, fy = floorOf(B.k), S = 0.11 * N;
      B.flash -= dt; B.cool -= dt;
      if (B.dead) { B.dead += dt; if (B.dead > 1.5) { w.boss = null; w.bossDoor = -1; } }
      else if (fighting && f.beat.on && f.beat.count % 2 === 0) { const tt = 0.8, dx = w.x - (bx + w.cam), dy = hy - (fy - S); B.shots.push({ x: bx + w.cam - S * 0.6, y: fy - S, vx: dx / tt, vy: dy / tt - 0.5 * g * tt, life: 2.5 }); } // the lob that lands on the hero in tt under the room's g
      if (w.boss) {
        const c = B.flash > 0 ? BRIGHT : B.dead ? DARK + DIM : DARK, sq = B.dead ? Math.min(1, B.dead) : 0;
        r.poly([[bx - S * 0.7, fy], [bx - S * 0.5, fy - S * (1.6 - sq)], [bx + S * 0.5, fy - S * (1.8 - sq)], [bx + S * 0.7, fy]], c);
        r.disc(bx - S * 0.4, fy - S * (1.5 - sq), S * 0.3, c);
        r.rect(bx - S * 0.55, fy - S * (1.55 - sq), S * 0.1, S * 0.08, HOT);
        for (let q = 0; q < 3; q++) r.rect(bx - S * 0.5 + q * S * 0.4, fy - S * 0.3, S * 0.15, S * 0.3, c);
        targets.push({ x: bx - S * 0.8, y: fy - S * 1.9, w: S * 1.6, h: S * 1.9 });
        B.shots = B.shots.filter((p) => { p.y += (p.vy + 0.5 * g * dt) * dt; p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (Math.abs(p.x - w.x) < 3 * u && p.y > hy - H0 && p.y < hy && w.hurt <= 0) { w.hurt = 0.6; s.shake = Math.max(s.shake, 0.3); return false; } r.disc(p.x - w.cam, p.y, 1.5 * u, HOT); return p.life > 0 && p.y < floorOf(roomAt(p.x)); });
      }
    }
    // the hero: afterimages while dashing, a helmet, the arm cannon, a flash at the muzzle
    w.ghosts = w.ghosts.filter((gh) => { r.rect(gh.x - w.cam - 2 * u, gh.y - H0 * 0.8, 4 * u, H0 * 0.6, FIG + DIM); return (gh.life -= dt) > 0; });
    const hx = w.x - w.cam, col = w.hurt > 0 && Math.floor(t * 20) % 2 ? BRIGHT : w.flash > 0.1 ? BRIGHT : FIG;
    const J = walker(r, hx, hy, H0, col, w.air ? 0.6 : w.ph, w.dir, { cap: true, hatCol: HOT });
    r.rect(J.sx + (w.dir > 0 ? 0 : -H0 * 0.3), J.sy + H0 * 0.1, H0 * 0.3, H0 * 0.12, LMID); // the arm cannon
    if (w.flash > 0) r.disc(J.sx + w.dir * H0 * 0.35, J.sy + H0 * 0.16, 1.5 * u, BRIGHT);
    targets.push({ x: hx - 4 * u, y: hy - H0, w: 8 * u, h: H0 });
    w.sparks = particles(W, w.sparks, LMID);
    // the minimap: the rooms explored around the current one, on a thin grid; the moves owned; the energy
    const mc = 3 * u, mx0 = 2 * u, my0 = 2 * u, cols = 11, rows = 5;
    r.rect(mx0, my0, cols * mc, rows * mc, BLACK);
    for (let i = 0; i <= cols; i++) r.rect(mx0 + i * mc, my0, Math.max(1, u * 0.5), rows * mc, DARK + DIM);
    for (let j = 0; j <= rows; j++) r.rect(mx0, my0 + j * mc, cols * mc, Math.max(1, u * 0.5), DARK + DIM);
    for (let k = Math.max(0, k0 - 5); k <= k0 + 5; k++) {
      if (k > k0 && k !== w.bossDoor) continue;
      const cx = mx0 + (k - k0 + 5) * mc, cy = my0 + (2 + lvl(k0) - lvl(k)) * mc;
      if (cy < my0 || cy >= my0 + rows * mc) continue;
      r.rect(cx + u * 0.5, cy + u * 0.5, mc - u, mc - u, k === w.bossDoor ? HOT : k === k0 ? (Math.floor(t * 4) % 2 ? BRIGHT : LMID) : LMID + DIM);
    }
    w.moves.forEach((m, i) => { const ix = N - 5 * u - i * 6 * u, iy = 4 * u; if (m === 'high') r.poly([[ix, iy - 2 * u], [ix + 2.5 * u, iy + u], [ix - 2.5 * u, iy + u]], LMID); else if (m === 'dash') { r.rect(ix - 2.5 * u, iy, 5 * u, Math.max(1, u), LMID); r.rect(ix - 2.5 * u, iy - 2 * u, 3 * u, Math.max(1, u), LMID + DIM); } else if (m === 'double') { r.rect(ix - 2 * u, iy - 2 * u, 4 * u, Math.max(1, u), LMID); r.rect(ix - 2 * u, iy, 4 * u, Math.max(1, u), LMID); } else r.disc(ix, iy, 2 * u, LMID); });
    for (let k = 0; k < w.energy % 16; k++) r.rect(N - 3 * u - k * 2.5 * u, N - 3 * u, Math.max(1, 1.5 * u), 2 * u, COOL);
  },
};

// ---------------------------------------------------------------------------------------------- limbo
// A black-silhouette forest in fog: a grey sky in bands, a light up to the left whose rays flare on the beat,
// trees in three depths of parallax with fog drifting between them (the mid clock), rain when the mood is up
// and dust motes when it is not, a small black figure with two white eyes walking on (quicker with the level).
// A snare brings a giant spider's leg down ahead of it; traps swing on ropes as pendulums; a drop raises a
// huge machine in the back, its wheel turning at the tempo. Only the grey roles, black, and the white eyes.
const limbo = {
  init(W) {
    Object.assign(W.w, { x: 0, ph: 0, legs: [], machine: null, motes: [], smoke: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, H0 = 0.11 * N, bps = bpsOf(f), rain = W.a > 0.5;
    const gy = (xw) => 0.8 * N + 0.02 * N * Math.sin(xw / (0.3 * N)) + 0.01 * N * Math.sin(xw / (0.09 * N) + 2);
    const v = N * (0.04 + 0.12 * f.level);
    w.x += v * dt;
    w.ph += (v * dt) / (H0 * 0.3) * Math.PI;
    const hx = 0.35 * N, hxw = hx + w.x, hy = gy(hxw);
    for (const h of hits) {
      if (h.kind === 'snare' && w.legs.length < 3) w.legs.push({ xw: hxw + N * (0.15 + 0.45 * rnd()) * (rnd() < 0.75 ? 1 : -1), t: 0, side: rnd() < 0.5 ? -1 : 1 });
      else if (isLow(h) && w.machine) w.machine.puff = 3;
    }
    if (f.section === 'drop' && !w.machine) w.machine = { t: 0, life: 14, xw: w.x * 0.5 + 0.7 * N, rot: 0, puff: 0 };
    // the sky in bands, the light and its rays, a glow round it
    r.rect(0, 0, N, 0.3 * N, DARK);
    r.rect(0, 0.3 * N, N, 0.25 * N, MID);
    r.rect(0, 0.55 * N, N, N, LMID);
    const lx = 0.12 * N, ly = -0.02 * N, fl = 0.5 + 0.8 * f.beat.pulse;
    for (let k = 0; k < 6; k++) { const a = 0.35 + k * 0.17 + 0.02 * Math.sin(t * 0.5 + k), wd = (0.012 + 0.014 * hash(k, 101)) * fl, len = (0.84 * N - ly) / Math.sin(a); r.poly([[lx, ly], [lx + Math.cos(a - wd) * len, ly + Math.sin(a - wd) * len], [lx + Math.cos(a + wd) * len, ly + Math.sin(a + wd) * len]], k % 2 ? MID : LMID); }
    r.disc(lx, ly, (0.05 + 0.02 * f.beat.pulse) * N, LMID);
    r.disc(lx, ly, (0.025 + 0.015 * f.beat.pulse) * N, BRIGHT);
    // trees, far to near: trunks with a few branches, each layer with its parallax; fog between the layers
    const trees = (pf, spacing, col, wmul, hmul, near) => { // the far ones in three stacked blocks, the near ones tapered
      const sc = w.x * pf;
      for (let k = Math.floor(sc / spacing) - 1; k <= Math.floor((sc + N) / spacing) + 1; k++) {
        if (hash(k, 102) < 0.25) continue;
        const tx = k * spacing + hash(k, 103) * spacing * 0.6 - sc, tw = (1 + 2 * hash(k, 104)) * u * wmul, th = (0.35 + 0.4 * hash(k, 105)) * N * hmul, by = pf < 1 ? 0.8 * N + 0.03 * N * (1 - pf) : gy(tx + w.x);
        if (near) r.poly([[tx - tw, by], [tx - tw * 0.6, by - th], [tx + tw * 0.6, by - th], [tx + tw, by]], col);
        else for (let q = 0; q < 3; q++) { const ww = tw * (1 - q * 0.18); r.rect(tx - ww, by - (th * (q + 1)) / 3, 2 * ww, th / 3 + 1, col); }
        for (let b = 0; b < 3; b++) {
          const bh = by - th * (0.45 + 0.17 * b), sd = (b + k) % 2 ? 1 : -1, ex = tx + sd * (0.06 + 0.04 * hash(k, 106 + b)) * N, ey = bh - 0.05 * N;
          if (near) r.stroke(tx, bh, ex, ey, Math.max(1, tw * 0.5), col); else r.line(tx, bh, ex, ey, col);
        }
      }
    };
    const fog = (y0, amp, col, speed, seed) => { for (let x = 0; x < N; x++) vfill(r, x, y0 + amp * Math.sin(x / (0.12 * N) + f.rel.midClock * speed + seed) + amp * 0.5 * Math.sin(x / (0.04 * N) - f.rel.midClock * speed * 1.7), 0.82 * N, col); };
    trees(0.2, 0.09 * N, MID, 0.8, 0.8);
    fog(0.58 * N, 0.03 * N, LMID, 0.6, 1);
    // the machine in the back: a tower, a wheel turning at the tempo, a piston on the beat, smoke; it rises and sinks
    if (w.machine) {
      const M = w.machine; M.t += dt; M.rot += dt * bps * (Math.PI / 2);
      const lift = ease(Math.min(1, M.t / 2)) * (M.t > M.life - 2 ? ease((M.life - M.t) / 2) : 1), mx = M.xw - w.x * 0.5, base = 0.82 * N + (1 - lift) * 0.6 * N, R = 0.17 * N;
      r.rect(mx - 0.06 * N, base - 0.55 * N, 0.12 * N, 0.55 * N, BLACK);
      r.rect(mx + 0.1 * N, base - 0.3 * N, 0.05 * N, 0.3 * N, BLACK);
      r.ring(mx - 0.2 * N, base - R, R, 2.5 * u, BLACK);
      for (let k = 0; k < 4; k++) r.stroke(mx - 0.2 * N - Math.cos(M.rot + k * 0.785) * R, base - R - Math.sin(M.rot + k * 0.785) * R, mx - 0.2 * N + Math.cos(M.rot + k * 0.785) * R, base - R + Math.sin(M.rot + k * 0.785) * R, 2 * u, BLACK);
      const pist = base - 0.55 * N - 0.08 * N * Math.abs(Math.sin(Math.PI * f.beat.phase));
      r.rect(mx - 0.015 * N, pist, 0.03 * N, base - 0.55 * N - pist + u, BLACK);
      r.rect(mx - 0.04 * N, pist - 2 * u, 0.08 * N, 2.5 * u, BLACK);
      if ((M.puff = M.puff - 1) >= 0 || rnd() < 0.15) w.smoke.push({ x: mx + 0.125 * N, y: base - 0.3 * N, vx: (rnd() - 0.5) * N * 0.03 - N * 0.02, vy: -N * (0.06 + 0.04 * rnd()), life: 1.6, c: DARK });
      if (M.t > M.life) w.machine = null;
    }
    w.smoke = drift(W, w.smoke, DARK, 1.2);
    trees(0.5, 0.14 * N, DARK, 1.3, 1);
    fog(0.66 * N, 0.025 * N, LMID, 0.9, 4);
    // the spider legs: hip up out of frame, knee, the tip coming down to the ground ahead, planted, lifted again
    w.legs = w.legs.filter((lg) => {
      lg.t += dt / 1.1;
      const q = lg.t < 0.35 ? ease(lg.t / 0.35) : lg.t < 0.7 ? 1 : 1 - ease((lg.t - 0.7) / 0.3), tx = lg.xw - w.x, ty = lerp(-0.15 * N, gy(lg.xw), q);
      const hipx = tx + lg.side * 0.3 * N, hipy = -0.1 * N, kx = tx + lg.side * 0.16 * N, ky = Math.min(ty, 0.3 * N) - 0.15 * N * (1 - q * 0.3);
      r.stroke(hipx, hipy, kx, ky, 3.5 * u, BLACK);
      r.stroke(kx, ky, tx, ty, 2.5 * u, BLACK);
      if (q >= 1 && lg.t < 0.4) for (let k = 0; k < 2; k++) w.smoke.push({ x: tx + (rnd() - 0.5) * 4 * u, y: ty, vx: (rnd() - 0.5) * N * 0.1, vy: -N * 0.05, life: 0.4, c: MID });
      return lg.t < 1;
    });
    // the ground, the grass, the near trees, the swinging traps, the figure
    for (let x = 0; x < N; x++) { const y = gy(x + w.x); vfill(r, x, y, N, BLACK); if (hash(Math.floor(x + w.x), 107) < 0.25) { const bl = (2 + 3 * hash(Math.floor(x + w.x), 108)) * u; r.line(x, y, x + Math.sin(f.rel.midClock * 1.5 + x * 0.1) * 1.5 * u, y - bl, BLACK); } }
    trees(1, 0.55 * N, BLACK, 3, 1.4, true);
    const Lp = 0.42 * N, om = Math.sqrt((2.6 * N) / Lp);
    for (let k = Math.floor(w.x / (1.6 * N)); k <= Math.floor((w.x + N) / (1.6 * N)) + 1; k++) {
      const px = k * 1.6 * N + 0.3 * N - w.x, ang = 0.4 * Math.sin(om * t + hash(k, 109) * TAU), bx = px + Math.sin(ang) * Lp, by = -0.02 * N + Math.cos(ang) * Lp;
      r.stroke(px, -0.02 * N, bx, by, Math.max(1, u), BLACK);
      if (hash(k, 110) < 0.5) { r.frame(Math.round(bx - 4 * u), Math.round(by), 8 * u, 6 * u, BLACK); r.rect(bx - u * 0.5, by, Math.max(1, u), 6 * u, BLACK); }
      else { r.disc(bx, by + 3 * u, 3 * u, BLACK); for (let q = 0; q < 6; q++) r.line(bx, by + 3 * u, bx + Math.cos(q * 1.05) * 5 * u, by + 3 * u + Math.sin(q * 1.05) * 5 * u, BLACK); }
      if (k % 2 === 0) targets.push({ x: bx - 5 * u, y: by - u, w: 10 * u, h: 8 * u });
    }
    const J = walker(r, hx, hy, H0, BLACK, w.ph, 1, {});
    r.rect(hx - u * 0.5, J.head - u * 0.5, Math.max(1, u), Math.max(1, u), WHITE);
    r.rect(hx + 1.5 * u, J.head - u * 0.5, Math.max(1, u), Math.max(1, u), WHITE);
    targets.push({ x: hx - 4 * u, y: hy - H0, w: 8 * u, h: H0 });
    // the weather: rain in slanted streaks when the mood is up, slow motes when it is low
    if (rain) for (let k = 0; k < 50 + 60 * f.level; k++) { const x = rnd() * N, y = rnd() * N; r.line(x, y, x - 1.5 * u, y + 4 * u, y > gy(x + w.x) ? DARK : BLACK); }
    else {
      while (w.motes.length < 30) w.motes.push({ x: rnd() * N, y: rnd() * 0.8 * N, s: rnd() * TAU });
      for (const m of w.motes) { m.x += (Math.sin(t * 0.7 + m.s) * 3 * u - v * 0.3) * dt; m.y += Math.cos(t * 0.5 + m.s) * 2 * u * dt; if (m.x < 0) m.x += N; else if (m.x >= N) m.x -= N; r.rect(m.x, m.y, Math.max(1, u * 0.8), Math.max(1, u * 0.8), hash(Math.floor(m.s * 100), Math.floor(t * 2)) < 0.5 ? BRIGHT : LMID); }
    }
  },
};

// ---------------------------------------------------------------------------------------------- survivors
// A survivors-like from above: a hero in the middle, walking with the mid clock over scrolling ground, a crowd
// of simple foes pouring in from the edges (more of them with the energy) and closing in. The weapons go off
// by themselves: a whip arc on the kick (sides alternating), blades orbiting on circles, a garlic ring, axes
// thrown on the snare in parabolas, bolts homing on the hats; what dies drops a gem that flies to the hero. A
// section change is a level up: a flash and one more weapon; a drop is a boss wave. The timer is a bar.
const ARMS_W = { whip: [3, 2, 2], orbs: [2, 2, 2], garlic: [2, 1, 1], axes: [1, 2, 3], wand: [1, 2, 2] };

const survivors = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { ox: 0, oy: 0, dir: 1, ph: 0, foes: [], gems: [], parts: [], axes: [], bolts: [], arms: [rollW(rnd, ARMS_W, bandOf(W.a))], whip: 0, side: 1, orbA: 0, xp: 0, flash: 0, hurt: 0, kills: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, cx = N / 2, cy = N / 2, drive = clamp(0.6 * f.level + 0.5 * f.rel.bassDrive), T = N / 10, H0 = 0.09 * N;
    const has = (a) => w.arms.includes(a);
    // the hero walks a slow loop with the mid clock; the ground (and everything on it) slides the other way
    const vx = N * 0.07 * (0.3 + f.level) * Math.cos(f.rel.midClock * 0.6), vy = N * 0.07 * (0.3 + f.level) * Math.sin(f.rel.midClock * 0.45);
    w.ox += vx * dt; w.oy += vy * dt;
    w.ph += (Math.hypot(vx, vy) * dt) / (H0 * 0.3) * Math.PI;
    if (Math.abs(vx) > u) w.dir = Math.sign(vx);
    const hx = cx + w.ox, hy = cy + w.oy; // the hero in world coordinates
    const spawn = (kind, hp, sz) => { const a = rnd() * TAU, R = 0.75 * N; w.foes.push({ x: hx + Math.cos(a) * R, y: hy + Math.sin(a) * R, kind, hp, sz, flash: 0, s: rnd() * TAU }); };
    if (f.section === 'change') { const left = Object.keys(ARMS_W).filter((a) => !has(a)); if (left.length) w.arms.push(pickW(rnd, left, (a) => ARMS_W[a][bandOf(W.a)])); w.flash = 0.35; w.xp = 0; }
    else if (f.section === 'drop') { spawn(3, 40, 7 * u); for (let k = 0; k < 20; k++) spawn(Math.floor(rnd() * 3), 2, 3 * u); s.shake = Math.max(s.shake, 0.4); }
    for (const h of hits) {
      if (isLow(h) && has('whip')) { w.side = -w.side; w.whip = 0.15; }
      else if (h.kind === 'snare' && has('axes')) for (let k = 0; k < 2; k++) w.axes.push({ x: hx, y: hy - H0 * 0.5, vx: (k ? 1 : -1) * N * (0.2 + 0.2 * rnd()), vy: -N * (0.8 + 0.3 * h.strength), rot: 0, life: 2 });
      else if (h.kind === 'hat' && has('wand') && w.bolts.length < 6) w.bolts.push({ x: hx, y: hy - H0 * 0.5, a: rnd() * TAU, life: 2 });
    }
    const want = Math.round(8 + 80 * drive);
    while (w.foes.length < want) spawn(Math.floor(rnd() * 3), 2, 3 * u);
    w.whip -= dt; w.flash -= dt; w.hurt -= dt;
    w.orbA += dt * (2 + 2 * clamp(f.rel.trebDrive));
    const orbR = 0.13 * N * (1 + 0.1 * f.beat.pulse), nOrb = w.arms.length > 3 ? 3 : 2, garR = 0.1 * N * (1 + 0.3 * f.level);
    // the ground: tufts and stones on a grid, sliding under the hero
    for (let i = -1; i <= 11; i++) for (let j = -1; j <= 11; j++) {
      const gx = i * T - ((w.ox % T) + T) % T, gy = j * T - ((w.oy % T) + T) % T, ci = Math.floor((w.ox + gx) / T + 0.5), cj = Math.floor((w.oy + gy) / T + 0.5), hs = hash(ci, cj);
      if (hs < 0.5) r.rect(gx + hs * T, gy + hash(cj, ci) * T, Math.max(1, u), Math.max(1, u * (hs < 0.25 ? 2 : 1)), hs < 0.1 ? MID : DARK + DIM);
    }
    if (has('garlic')) r.ring(cx, cy, garR, Math.max(1, u), f.beat.pulse > 0.5 ? LMID : LMID + DIM);
    // the foes close in, bobbing on the beat; the weapons take them; a touch hurts the hero
    const kill = (e, sx, sy) => { w.kills++; burst(w.parts, rnd, sx, sy, e.kind === 3 ? 30 : 6, N * 0.25, e.kind === 3 ? HOT : LMID, 0.4); for (let k = 0; k < (e.kind === 3 ? 6 : 1); k++) w.gems.push({ x: e.x + (rnd() - 0.5) * 4 * u, y: e.y + (rnd() - 0.5) * 4 * u, vx: 0, vy: 0, fly: false }); };
    const spd = N * (0.05 + 0.1 * drive);
    w.foes = w.foes.filter((e) => {
      const dx = hx - e.x, dy = hy - e.y, d = Math.hypot(dx, dy) || 1, v = e.kind === 3 ? spd * 0.6 : e.kind === 1 ? spd * 1.4 : spd;
      if (d > 4 * u) { e.x += (dx / d) * v * dt; e.y += (dy / d) * v * dt; }
      else if (w.hurt <= 0) { w.hurt = 0.5; s.shake = Math.max(s.shake, 0.2); }
      e.flash -= dt;
      const sx = e.x - w.ox, sy = e.y - w.oy;
      if (sx < -0.2 * N || sx > 1.2 * N || sy < -0.2 * N || sy > 1.2 * N) return true;
      if (w.whip > 0.1 && (sx - cx) * w.side > 0 && Math.abs(sx - cx) < 0.24 * N && Math.abs(sy - cy) < 0.07 * N) { e.hp -= 2; e.flash = 0.1; }
      if (has('garlic') && Math.hypot(sx - cx, sy - cy) < garR + e.sz) e.hp -= dt * 2;
      if (has('orbs')) for (let k = 0; k < nOrb; k++) { const a = w.orbA + (k * TAU) / nOrb; if (Math.hypot(sx - (cx + Math.cos(a) * orbR), sy - (cy + Math.sin(a) * orbR)) < 3 * u + e.sz) { e.hp -= dt * 8; e.flash = 0.05; } }
      if (e.hp <= 0) { kill(e, sx, sy); return false; }
      const c = e.flash > 0 ? BRIGHT : e.kind === 3 ? HOT : MID, sz = e.sz, bob = e.kind === 0 ? 1 - 0.25 * f.beat.pulse : 1;
      if (e.kind === 0) { r.disc(sx, sy - sz * bob, sz * (2 - bob), c); r.rect(sx - sz * (2 - bob), sy - sz * bob, sz * 2 * (2 - bob), sz * bob, c); for (let q = 0; q < 3; q++) r.rect(sx - sz + q * sz, sy + (q % 2 ? 0 : -u), Math.max(1, u), Math.max(1, u), c); }
      else if (e.kind === 1) { const wing = Math.floor(t * 18 + e.s) % 2 ? 2.2 : 1.2; r.rect(sx - sz * 0.5, sy - sz, sz, sz * 1.5, c); r.rect(sx - sz * wing, sy - sz, sz * wing * 2, Math.max(1, u), c); }
      else if (e.kind === 2) { r.rect(sx - sz * 0.6, sy - sz * 2, sz * 1.2, sz * 2, c); r.disc(sx, sy - sz * 2.3, sz * 0.7, c); r.rect(sx - sz * 0.3, sy - sz * 2.4, Math.max(1, u), Math.max(1, u), BRIGHT); r.rect(sx + sz * 0.1, sy - sz * 2.4, Math.max(1, u), Math.max(1, u), BRIGHT); }
      else { r.disc(sx, sy - sz, sz, c); for (const k of [-1, 1]) r.stroke(sx + k * sz * 0.5, sy - sz * 1.6, sx + k * sz, sy - sz * 2.4, 2 * u, c); r.rect(sx - sz * 0.4, sy - sz * 1.1, sz * 0.25, sz * 0.2, BRIGHT); r.rect(sx + sz * 0.15, sy - sz * 1.1, sz * 0.25, sz * 0.2, BRIGHT); targets.push({ x: sx - sz, y: sy - sz * 2.5, w: 2 * sz, h: sz * 2.5 }); }
      return true;
    });
    // the axes fly up and fall under gravity, turning; the bolts home on the nearest foe
    w.axes = w.axes.filter((ax) => {
      ax.y += (ax.vy + 0.8 * N * dt) * dt; ax.vy += 1.6 * N * dt; ax.x += ax.vx * dt; ax.rot += dt * 10; ax.life -= dt; // the exact parabola step
      const sx = ax.x - w.ox, sy = ax.y - w.oy;
      r.stroke(sx - Math.cos(ax.rot) * 3 * u, sy - Math.sin(ax.rot) * 3 * u, sx + Math.cos(ax.rot) * 3 * u, sy + Math.sin(ax.rot) * 3 * u, Math.max(1, u), LMID);
      r.rect(sx + Math.cos(ax.rot) * 3 * u - 1.5 * u, sy + Math.sin(ax.rot) * 3 * u - 1.5 * u, 3 * u, 3 * u, BRIGHT);
      for (const e of w.foes) if (Math.hypot(e.x - ax.x, e.y - ax.y) < 4 * u + e.sz) { e.hp -= 3; e.flash = 0.1; }
      return ax.life > 0 && sy < N + 5 * u;
    });
    w.bolts = w.bolts.filter((b) => {
      let best = null, bd = 1e9;
      for (const e of w.foes) { const d = Math.hypot(e.x - b.x, e.y - b.y); if (d < bd) { bd = d; best = e; } }
      if (best) b.a += clamp(wrapAngle(Math.atan2(best.y - b.y, best.x - b.x) - b.a), -6 * dt, 6 * dt);
      b.x += Math.cos(b.a) * N * 0.6 * dt; b.y += Math.sin(b.a) * N * 0.6 * dt; b.life -= dt;
      if (best && bd < 3 * u + best.sz) { best.hp -= 2; best.flash = 0.1; return false; }
      r.rect(b.x - w.ox - u, b.y - w.oy - u, 2 * u, 2 * u, COOL);
      return b.life > 0;
    });
    // the gems: still until the hero is near, then they fly in; the whip arc, the blades, the hero
    const mag = 0.12 * N * (1 + f.level);
    if (w.gems.length > 120) w.gems.splice(0, w.gems.length - 120);
    w.gems = w.gems.filter((gm) => {
      const dx = hx - gm.x, dy = hy - H0 * 0.4 - gm.y, d = Math.hypot(dx, dy) || 1;
      if (!gm.fly && d < mag) gm.fly = true;
      if (gm.fly) { gm.vx += (dx / d) * N * 4 * dt; gm.vy += (dy / d) * N * 4 * dt; gm.x += gm.vx * dt; gm.y += gm.vy * dt; if (d < 3 * u) { w.xp++; return false; } }
      const sx = gm.x - w.ox, sy = gm.y - w.oy;
      r.poly([[sx, sy - 2 * u], [sx + 1.5 * u, sy], [sx, sy + 2 * u], [sx - 1.5 * u, sy]], f.beat.pulse > 0.6 ? BRIGHT : COOL);
      return true;
    });
    if (w.whip > 0) crescent(r, cx, cy - H0 * 0.4, 0.2 * N, w.side > 0 ? 0 : Math.PI, 0.45, Math.max(1, 2 * u * (w.whip / 0.15)), w.whip > 0.1 ? BRIGHT : LMID, 7);
    if (has('orbs')) for (let k = 0; k < nOrb; k++) { const a = w.orbA + (k * TAU) / nOrb, ox = cx + Math.cos(a) * orbR, oy = cy + Math.sin(a) * orbR; r.poly([[ox + Math.cos(a) * 3 * u, oy + Math.sin(a) * 3 * u], [ox - Math.sin(a) * 1.5 * u, oy + Math.cos(a) * 1.5 * u], [ox - Math.cos(a) * 3 * u, oy - Math.sin(a) * 3 * u], [ox + Math.sin(a) * 1.5 * u, oy - Math.cos(a) * 1.5 * u]], COOL); }
    const col = w.hurt > 0 && Math.floor(t * 20) % 2 ? HOT : w.flash > 0 ? BRIGHT : FIG;
    walker(r, cx, cy, H0, col, w.ph, w.dir, { hat: true, hatCol: w.flash > 0 ? BRIGHT : LMID });
    if (w.flash > 0) r.ring(cx, cy - H0 * 0.4, (0.35 - w.flash) * 1.2 * N, Math.max(1, 2 * u), BRIGHT);
    targets.push({ x: cx - 4 * u, y: cy - H0, w: 8 * u, h: H0 });
    w.parts = drift(W, w.parts, LMID, 3);
    // the timer across the top, the experience across the bottom, the weapons owned as pips
    r.rect(0, 0, N, Math.max(1, u), DARK);
    r.rect(0, 0, N * (((f.beat.count % 64) + f.beat.phase) / 64), Math.max(1, u), LMID);
    r.rect(0, N - u, N, Math.max(1, u), DARK);
    r.rect(0, N - u, N * ((w.xp % 30) / 30), Math.max(1, u), COOL);
    w.arms.forEach((a, i) => r.rect(2 * u + i * 4 * u, N - 5 * u, 3 * u, 2.5 * u, [HOT, COOL, LMID, BRIGHT, MID][Object.keys(ARMS_W).indexOf(a)]));
  },
};

const WORLDS = { danmaku, climb, farm, dodgebox, caveknight, rotatecube, desertscarf, shipcrew, cardbattle, metroidmap, limbo, survivors };

registerFamily('indie', WORLD_DEFS, WORLDS);
export const INDIE_STYLE = makeMixStyle('INDIE', ['indie']);
