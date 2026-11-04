// Grimdark, mixed: the gothic science fiction of the tabletop wargame, in silhouette. A hive city stacked to the
// sky, a cathedral warship in the void, a squad of iron giants, the storm beyond the veil, a god machine walking a
// burning city, a scrap convoy over the dunes, a candlelit inquest, a trench line in the rain, a tide of chitin, a
// tomb world waking, a dark shrine, fire from orbit. The visual language only: original shapes, no faction,
// insignia, emblem, name or character from anywhere, no words. Every world draws with the palette roles, so any
// palette, treatment and layout of the mixer fits. Each has a table of kinds weighted by the arousal band, rolled
// again on a section change; a drop brings the heavy variant.
import { clamp, lerp } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow, ease,
  beatLocked, hash, pickW, particles, burst, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  hivecity: { name: 'hive city', va: [[L, M], [L, H], [L, L]], pals: ['grimdark', 'noir', 'midnight', 'machine', 'amber', 'silver'], fx: ['film', 'none', 'vhs', 'crt'] },
  cathedralship: { name: 'cathedral ship', va: [[L, H], [M, H], [L, M]], pals: ['grimdark', 'midnight', 'royal', 'gold', 'silver', 'crypt'], fx: ['none', 'film', 'hud', 'crt'] },
  ironclad: { name: 'iron squad', va: [[L, H], [M, H], [L, M]], pals: ['military', 'grimdark', 'machine', 'hell', 'silver', 'royal'], fx: ['film', 'none', 'hud', 'crt'] },
  warpstorm: { name: 'warp storm', va: [[L, M], [M, H], [L, H]], pals: ['occult', 'crypt', 'midnight', 'toxic', 'hell', 'royal'], fx: ['none', 'vhs', 'crt', 'film'] },
  godmachine: { name: 'god machine', va: [[L, H], [M, H], [L, M]], pals: ['hell', 'grimdark', 'machine', 'amber', 'royal', 'gold'], fx: ['film', 'none', 'hud', 'crt'] },
  scrapconvoy: { name: 'scrap convoy', va: [[M, H], [L, H], [M, M]], pals: ['amber', 'hell', 'toxic', 'military', 'machine', 'grimdark'], fx: ['film', 'none', 'vhs', 'crt'] },
  inquest: { name: 'the inquest', va: [[L, M], [M, H], [L, L]], pals: ['crypt', 'occult', 'noir', 'amber', 'silver', 'gold'], fx: ['film', 'none', 'vhs', 'frame'] },
  trenchline: { name: 'trench line', va: [[L, H], [M, H], [L, M]], pals: ['military', 'grimdark', 'noir', 'silver', 'crypt'], fx: ['film', 'vhs', 'none', 'crt'] },
  swarmtide: { name: 'swarm tide', va: [[L, H], [M, H], [L, M]], pals: ['toxic', 'hell', 'military', 'grimdark', 'crypt', 'machine'], fx: ['film', 'none', 'hud', 'crt'] },
  tombworld: { name: 'tomb world', va: [[L, M], [M, H], [L, H]], pals: ['toxic', 'midnight', 'silver', 'noir', 'crypt', 'grimdark'], fx: ['none', 'film', 'crt', 'hud'] },
  darkshrine: { name: 'dark shrine', va: [[L, H], [M, H], [L, M]], pals: ['occult', 'hell', 'crypt', 'gold', 'royal', 'midnight'], fx: ['film', 'none', 'vhs', 'frame'] },
  orbitalfire: { name: 'orbital fire', va: [[L, H], [M, H], [L, M]], pals: ['midnight', 'machine', 'hell', 'grimdark', 'silver', 'royal'], fx: ['hud', 'none', 'film', 'crt'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const px = (u) => Math.max(1, u);
const G = 1.6; // the gravity every falling thing shares, in screens per second squared (as mixer's particles)

// a jagged bolt from (x0, y0) to (x1, y1) in n legs, every knee thrown sideways by up to jit; seed keeps its shape
function bolt(r, x0, y0, x1, y1, n, jit, seed, c, wd = 1) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  let ax = x0, ay = y0;
  for (let k = 1; k <= n; k++) {
    const q = k / n, j = k === n ? 0 : (hash(seed, k) - 0.5) * 2 * jit * Math.sin(q * Math.PI), bx = x0 + dx * q + nx * j, by = y0 + dy * q + ny * j;
    r.stroke(ax, ay, bx, by, wd, c);
    ax = bx; ay = by;
  }
}

// a hooded figure at x with its feet on base, h tall, leaning by lean: a cloak that widens to the hem, a hood, no face
function hooded(r, x, base, h, col, lean = 0) {
  const sh = lean * h * 0.1;
  r.poly([[x - h * 0.2, base], [x + h * 0.2, base], [x + h * 0.09 + sh, base - h * 0.72], [x - h * 0.09 + sh, base - h * 0.72]], col);
  r.disc(x + sh, base - h * 0.8, h * 0.15, col);
  return { hx: x + sh, hy: base - h * 0.8, sx: x + sh + h * 0.12, sy: base - h * 0.58 };
}

// a hex cell outline of radius R, and the honeycomb of a void shield lighting up around a hit as `life` runs out
function hex(r, cx, cy, R, c) {
  for (let k = 0; k < 6; k++) { const a0 = (k / 6) * TAU + TAU / 12, a1 = ((k + 1) / 6) * TAU + TAU / 12; r.line(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, cx + Math.cos(a1) * R, cy + Math.sin(a1) * R, c); }
}
function hexFlash(r, x, y, R, life, c) {
  const n = life > 0.6 ? 7 : life > 0.3 ? 4 : 1;
  for (let k = 0; k < n; k++) { const a = (k / 6) * TAU, d = k ? R * 1.73 : 0; hex(r, x + Math.cos(a) * d, y + Math.sin(a) * d, R, c); }
}

// a shadow on the ground under a thing that stands at x with its feet on g, hw wide
const shadow = (r, x, g, hw, c = DARK + DIM) => r.ring(x, g, hw * 0.5, hw, c, 0.3);
// points turned by a about (cx, cy)
const rot = (pts, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]); };
// a sine table for the per-pixel worlds: SIN[(phase * SINK) & 1023]
const SIN = new Float32Array(1024), SINK = 1024 / TAU;
for (let i = 0; i < 1024; i++) SIN[i] = Math.sin((i / 1024) * TAU);

// things that drift in the void: no gravity, a straight line until the life runs out
function drift(r, list, dt, u, col) {
  for (const p of list) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; r.rect(p.x, p.y, px(u), px(u), p.c ?? col); }
  return list.filter((p) => p.life > 0);
}

// ---------------------------------------------------------------------------------------------- hive city
// Towers stacked to the sky in three depths, the far ones small and faint; stacks that smoke with the mids, lit
// windows that flicker with the level; lightning jumps between the spires on a snare; a procession of hooded figures
// crosses a viaduct, candles up, swaying on the beat; two lift cages ride a tower's rails as a counterweight pair.
// A section change rebuilds the district; a drop tears the sky open red for four bars and the ash comes down.
const DISTRICTS = {
  spires: { n: [6, 7, 8], wmin: 0.03, wmax: 0.06, hmin: 0.3, hmax: 0.75, stacks: 0.2, spire: 0.8 }, // tall and thin, pointed tops
  blocks: { n: [5, 6, 7], wmin: 0.06, wmax: 0.12, hmin: 0.2, hmax: 0.5, stacks: 0.4, spire: 0.2 }, // wide habs, stepped tops
  forge: { n: [5, 6, 7], wmin: 0.05, wmax: 0.1, hmin: 0.25, hmax: 0.6, stacks: 0.8, spire: 0.4, glow: true }, // stacks everywhere, a fire at the foot
};
const DISTRICT_W = { spires: [2, 2, 2], blocks: [3, 2, 1], forge: [1, 2, 3] };

function hiveBuild(w, rnd, N, kind) {
  const D = DISTRICTS[kind], towers = [];
  [[0.42, 0.66, DARK + DIM, DARK], [0.68, 0.76, DARK, MID], [1, 0.9, MID, LMID]].forEach(([sc, base, col, win], l) => {
    const n = D.n[l];
    for (let i = 0; i < n; i++) {
      const wd = (D.wmin + rnd() * (D.wmax - D.wmin)) * N * sc, ht = (D.hmin + rnd() * (D.hmax - D.hmin)) * N * sc;
      towers.push({ x: ((i + rnd() * 0.7) / n) * N * 1.1 - 0.06 * N, w: wd, h: ht, base: base * N, l, sc, col, win, top: rnd() < D.spire ? 1 : rnd() < 0.5 ? 2 : 0, stack: rnd() < D.stacks, seed: Math.floor(rnd() * 9973) });
    }
  });
  w.towers = towers;
  w.lift = towers.filter((tw) => tw.l === 2).sort((a, b) => b.h - a.h)[0];
}

const hivecity = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a), kind = rollW(rnd, DISTRICT_W, band);
    hiveBuild(w, rnd, N, kind);
    Object.assign(w, { kind, smoke: [], ash: [], bolt: null, light: 0, rift: 0, liftPh: rnd() * TAU, walkers: Array.from({ length: 7 + band * 2 }, (_, i) => ({ o: i * 0.11 + rnd() * 0.05, h: 0.9 + rnd() * 0.2 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, tt = t * 6 | 0;
    const spires = w.towers.filter((tw) => tw.l > 0);
    for (const h of hits) {
      if (h.kind === 'snare' && spires.length > 1) { // a strike between two spire tops
        const a = pick(rnd, spires); let b = pick(rnd, spires); if (b === a) b = spires[(spires.indexOf(a) + 1) % spires.length];
        w.bolt = { ax: a.x + a.w / 2, ay: a.base - a.h - (a.top === 1 ? a.w * 1.8 : 0), bx: b.x + b.w / 2, by: b.base - b.h - (b.top === 1 ? b.w * 1.8 : 0), seed: Math.floor(rnd() * 9973) };
        w.light = 0.14;
      }
    }
    if (f.section === 'drop') w.rift = (16 / bps);
    else if (f.section === 'change') { w.kind = rollW(rnd, DISTRICT_W, band); hiveBuild(w, rnd, N, w.kind); }
    w.light -= dt; w.rift -= dt;
    w.liftPh += dt * (0.3 + 0.8 * clamp(f.rel.midDrive));
    // the sky: an ash cloud ceiling, the strike's flash, the rift of a drop pouring red light from above
    for (let y = 0; y < 0.14 * N; y++) for (let x = 0; x < N; x++) if (hash(x, y + (t * 2 | 0)) < 0.5 - y / (0.14 * N) * 0.5) r.buf[y * N + x] = DARK + DIM;
    if (w.light > 0.09) r.rect(0, 0, N, 0.75 * N, DARK + DIM);
    if (w.rift > 0) {
      const k = Math.min(1, (16 / bps - w.rift) * 2) * Math.min(1, w.rift), R = (0.1 + 0.35 * k) * N;
      r.ring(0.5 * N, -0.02 * N, R * 0.5, R, HOT + DIM, 0.3);
      r.ring(0.5 * N, -0.02 * N, R * 0.3, R * 0.6, HOT, 0.3);
      r.ring(0.5 * N, -0.02 * N, R * 0.12, R * 0.25, BRIGHT, 0.3);
      for (let k2 = 0; k2 < 3; k2++) w.ash.push({ x: rnd() * N, y: -2 * u, vy: (0.05 + rnd() * 0.05) * N, ph: rnd() * TAU });
    }
    // the towers, far to near: the body, the top, the windows that flicker with the level, the stacks that smoke
    const lit = 0.25 + 0.3 * f.level;
    for (const tw of w.towers) {
      const { x, w: wd, h, base, col, sc } = tw, top = base - h;
      r.rect(x, top, wd, h, col);
      if (tw.top === 1) { r.poly([[x, top], [x + wd, top], [x + wd / 2, top - wd * 1.2]], col); r.rect(x + wd / 2 - px(u * sc) / 2, top - wd * 1.8, px(u * sc), wd * 0.7, col); }
      else if (tw.top === 2) { r.rect(x + wd * 0.2, top - wd * 0.35, wd * 0.6, wd * 0.35, col); r.rect(x + wd * 0.38, top - wd * 0.6, wd * 0.24, wd * 0.3, col); }
      else r.rect(x - u * sc, top, wd + 2 * u * sc, px(1.5 * u * sc), col);
      if (tw.l === 2) for (const k of [-1, 1]) r.stroke(x + (k > 0 ? wd : 0) + k * wd * 0.35, base, x + (k > 0 ? wd : 0), base - h * 0.3, px(1.5 * u), col); // the buttresses
      const st = Math.max(1.5, 3.5 * u * sc);
      for (let yy = top + st, iy = 0; yy < base - st; yy += st * 1.4, iy++) for (let xx = x + st * 0.6, ix = 0; xx < x + wd - st * 0.5; xx += st, ix++) {
        const hsh = hash(tw.seed + ix, iy);
        if (hsh < lit) r.rect(xx, yy, px(u * sc), px(1.6 * u * sc), hsh < 0.04 && tw.l === 2 ? HOT : hash(ix + tw.seed, iy + tt) < 0.1 ? col : tw.win);
      }
      if (tw.stack) { // a chimney, and the smoke off it with the mids
        const cx = x + wd * 0.72, cy = top - wd * 0.55;
        r.rect(cx - wd * 0.08, cy, wd * 0.16, wd * 0.6, col);
        if (rnd() < dt * (1.5 + 5 * clamp(f.rel.midDrive)) * sc && w.smoke.length < 180) w.smoke.push({ x: cx, y: cy, vx: (0.01 + rnd() * 0.015) * N, vy: -(0.06 + rnd() * 0.06) * N * sc, life: 2 + rnd() * 1.5, sc });
      }
      if (tw.l === 2 && DISTRICTS[w.kind].glow) for (let k = 0; k < 4; k++) r.rect(x + rnd() * wd, 0.86 * N - rnd() * 3 * u, px(u), px(u), k ? HOT : BRIGHT);
    }
    w.smoke = w.smoke.filter((p) => { p.vy = follow(p.vy, -0.015 * N, dt, 1.2); p.x += p.vx * dt + Math.sin(t * 1.5 + p.life * 3) * u * dt * 4; p.y += p.vy * dt; p.life -= dt; r.rect(p.x, p.y, px(u * p.sc), px(u * p.sc), p.life > 1 ? LMID + DIM : DARK); return p.life > 0 && p.y > 0; });
    for (let y = Math.round(0.78 * N); y < N; y++) for (let x = 0; x < N; x++) if (hash(x, y) < (y - 0.78 * N) / (0.16 * N)) r.buf[y * N + x] = DARK + DIM; // the murk the lower levels fade into
    if (DISTRICTS[w.kind].glow) for (let x = 0; x < N; x += 2) if (hash(x, tt) < 0.5) r.rect(x, 0.86 * N - u, 2, px(u), HOT + DIM);
    // the lift rails on the tallest tower: two cages on one cable, one up as the other comes down, slow at the ends
    const lt = w.lift;
    if (lt) {
      const rx = lt.x + lt.w + 1.5 * u, top = lt.base - lt.h + 2 * u, k = 0.5 + 0.5 * Math.sin(w.liftPh);
      r.rect(rx, top, px(u), lt.base - top, LMID + DIM);
      r.rect(rx + 4 * u, top, px(u), lt.base - top, LMID + DIM);
      for (const [q, dx] of [[k, 0], [1 - k, 4 * u]]) { const cy = lerp(lt.base - 6 * u, top, q); r.frame(Math.round(rx + dx - 1.5 * u), Math.round(cy), Math.round(4 * u), Math.round(5 * u), LMID); r.rect(rx + dx - 0.5 * u, cy + 2 * u, px(1.5 * u), px(u), f.beat.pulse > 0.5 ? BRIGHT : COOL); }
      targets.push({ x: rx - 2 * u, y: lerp(lt.base - 6 * u, top, k), w: 8 * u, h: 5 * u });
    }
    // the viaduct and the procession along it: candles up, swaying together on the beat, in at one pylon and out at the other
    const by = 0.6 * N, x0 = 0.12 * N, x1 = 0.86 * N, span = x1 - x0, sway = Math.sin((beatLocked(f) ? f.beat.phase : (t * bps) % 1) * TAU) * 0.7;
    for (const x of [x0, x1]) { r.rect(x - 3 * u, by - 10 * u, 6 * u, 0.9 * N - by + 10 * u, DARK); r.poly([[x - 4 * u, by - 10 * u], [x + 4 * u, by - 10 * u], [x, by - 15 * u]], DARK); }
    r.rect(x0, by, span, px(2 * u), MID);
    for (let k = 0; k < 6; k++) r.ring(x0 + (k + 0.5) * (span / 6), by + 2 * u, span / 12 - 2 * u, px(1.5 * u), DARK, 0.6);
    r.rect(x0, by - 2.5 * u, span, px(u), MID + DIM); // the parapet
    const adv = f.rel.bassClock * 0.03 + t * 0.004;
    w.walkers.forEach((wk, i) => {
      const q = (wk.o + adv) % 1, x = x0 + 3 * u + q * (span - 6 * u), h = 0.07 * N * wk.h;
      const J = hooded(r, x, by, h, FIG, sway);
      r.rect(J.sx - u * 0.5, J.sy - h * 0.3, px(u), h * 0.3, FIG);
      r.rect(J.sx - u * 0.5, J.sy - h * 0.3 - 2 * u, px(u), px(u), hash(i, tt) < 0.3 ? BRIGHT : HOT);
      if (i === 0) targets.push({ x: x - h * 0.3, y: by - h, w: h * 0.6, h });
    });
    if (w.bolt && w.light > 0) { bolt(r, w.bolt.ax, w.bolt.ay, w.bolt.bx, w.bolt.by, 9, 0.05 * N, w.bolt.seed + (w.light * 40 | 0), BRIGHT, px(1.2 * u)); r.disc(w.bolt.ax, w.bolt.ay, 2 * u, BRIGHT); r.disc(w.bolt.bx, w.bolt.by, 2 * u, BRIGHT); }
    // the ash: down slowly, drifting, gone into the murk
    w.ash = w.ash.filter((p) => { p.y += p.vy * dt; p.x += Math.sin(t * 1.2 + p.ph) * u * dt * 6; r.rect(p.x, p.y, px(u), px(u), hash(p.ph * 100 | 0, 1) < 0.5 ? LMID : LMID + DIM); return p.y < 0.9 * N; });
    if (w.ash.length > 400) w.ash.splice(0, w.ash.length - 400);
  },
};

// ---------------------------------------------------------------------------------------------- cathedral ship
// A gothic warship in the void, prow ram to the left, buttresses and spires along its spine, the engines aglow with
// the bass, a star behind it. Kicks are the broadsides: lances run out to the raiders far off (small for the
// distance) and burst on them; snares are their return fire, caught by the void shields in a flash of hex cells
// where each shot lands; a drop launches the boarding torpedoes from both decks, which cross and strike home. Hull
// lights blink on the beat; a section change brings the next class of ship. Nothing here falls: the void has no down.
const SHIPS = {
  escort: { len: 0.44, hgt: 0.07, spires: 2, dome: false, guns: 2 }, // lean, two spires, quick
  cruiser: { len: 0.62, hgt: 0.1, spires: 4, dome: false, guns: 4 }, // the line ship: a long gun deck
  ark: { len: 0.8, hgt: 0.14, spires: 6, dome: true, guns: 5 }, // a cathedral afloat: a dome, a forest of spires, the broadest ram
};
const SHIP_W = { escort: [3, 2, 1], cruiser: [2, 2, 2], ark: [0, 1, 3] };
const newRaider = (rnd) => ({ x: 0.06 + rnd() * 0.2, y: 0.18 + rnd() * 0.64, sz: 0.04 + rnd() * 0.04, ph: rnd() * TAU, hp: 3, flash: 0, dead: 0 });

const cathedralship = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { cls: rollW(rnd, SHIP_W, band), raiders: Array.from({ length: 3 }, () => newRaider(rnd)), lances: [], shots: [], flashes: [], torps: [], sparks: [], gun: 0, star: [0.76 + rnd() * 0.1, 0.22 + rnd() * 0.1] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), S = SHIPS[w.cls];
    const len = S.len * N, hgt = S.hgt * N, cx = 0.52 * N + Math.sin(f.rel.midClock * 0.3) * 0.02 * N, cy = 0.52 * N + Math.sin(t * 0.4) * 2 * u, x0 = cx - len * 0.5, x1 = cx + len * 0.5;
    const ports = Array.from({ length: S.guns }, (_, i) => [x0 + len * (0.3 + (0.5 * i) / Math.max(1, S.guns - 1)), cy + hgt * 0.25]);
    const alive = w.raiders.filter((q) => q.dead <= 0);
    for (const h of hits) {
      if (isLow(h) && alive.length) { // a broadside: one gun per kick, two on a heavy one, out to the nearest raider
        for (let k = 0; k < (h.strength > 0.8 ? 2 : 1); k++) { const [gx, gy] = ports[w.gun++ % ports.length], tg = pick(rnd, alive); w.lances.push({ x0: gx, y0: gy, tg, t: 0 }); }
        s.shake = Math.max(s.shake, 0.15);
      } else if (h.kind === 'snare' && alive.length) { const q = pick(rnd, alive); w.shots.push({ x: q.x * N, y: q.y * N, vx: (cx - q.x * N), vy: (cy - q.y * N) }); }
    }
    if (f.section === 'drop') for (let k = 0; k < 6; k++) { const up = k % 2 ? -1 : 1; w.torps.push({ x: x0 + len * (0.35 + 0.1 * (k >> 1)), y: cy - up * hgt * 0.5, vx: -0.2 * N, vy: -up * 0.35 * N, tg: alive.length ? alive[k % alive.length] : null, life: 6 }); }
    else if (f.section === 'change') w.cls = rollW(rnd, SHIP_W, band);
    // the void: a field of stars, the star behind the ship with its corona breathing with the level
    for (let k = 0; k < 70; k++) r.rect(hash(k, 1) * N, hash(k, 2) * N, px(u * 0.7), px(u * 0.7), hash(k, 3) < 0.3 ? LMID : LMID + DIM);
    const sx = w.star[0] * N, sy = w.star[1] * N, sr = (0.08 + 0.02 * f.level) * N;
    for (let y = sy - sr * 1.6; y < sy + sr * 1.6; y++) for (let x = sx - sr * 1.6; x < sx + sr * 1.6; x++) { const d = Math.hypot(x - sx, y - sy) / sr; if (d > 1 && d < 1.6 && hash(x | 0, y | 0) < (1.6 - d) * 0.8) r.set(x, y, LMID + DIM); }
    r.disc(sx, sy, sr, BRIGHT);
    // the raiders far off, each its own small dark wedge, turning on station; hit, they flash, broken, they come apart
    for (const q of w.raiders) {
      q.flash -= dt;
      if (q.dead > 0) { if ((q.dead -= dt) <= 0) Object.assign(q, newRaider(rnd)); continue; }
      q.ph += dt * 0.4;
      const qx = (q.x + Math.sin(q.ph) * 0.02) * N, qy = (q.y + Math.cos(q.ph * 0.7) * 0.02) * N, sz = q.sz * N, c = q.flash > 0 ? BRIGHT : MID;
      r.poly([[qx - sz * 0.6, qy], [qx + sz * 0.5, qy - sz * 0.35], [qx + sz * 0.6, qy + sz * 0.3]], c);
      r.rect(qx - sz * 0.1, qy - sz * 0.5, sz * 0.12, sz * 0.5, c);
      r.line(qx - sz * 0.6, qy, qx + sz * 0.5, qy - sz * 0.35, q.flash > 0 ? BRIGHT : LMID); // the lit edge toward the star
      r.rect(qx + sz * 0.55, qy - sz * 0.05, px(u), px(u), f.beat.pulse > 0.4 ? HOT : HOT + DIM);
      q.sx = qx; q.sy = qy;
      targets.push({ x: qx - sz * 0.6, y: qy - sz * 0.5, w: sz * 1.2, h: sz * 0.9 });
    }
    // the ship: hull, ram, the gun deck, the spine with its spires and buttresses, the dome of an ark, the engines
    r.poly([[x0, cy], [x0 + len * 0.1, cy - hgt * 0.45], [x1 - len * 0.06, cy - hgt * 0.5], [x1, cy - hgt * 0.3], [x1, cy + hgt * 0.4], [x0 + len * 0.12, cy + hgt * 0.6]], DARK);
    r.poly([[x0 - len * 0.07, cy + hgt * 0.05], [x0 + len * 0.02, cy - hgt * 0.3], [x0 + len * 0.02, cy + hgt * 0.4]], LMID);
    r.rect(x0 + len * 0.1, cy - hgt * 0.45, len * 0.84, px(u), MID);
    for (const [gx, gy] of ports) r.rect(gx - 1.5 * u, gy - 1.5 * u, 3 * u, 3 * u, MID);
    const spine0 = x0 + len * 0.3, spineW = len * 0.6, top = cy - hgt * 0.45;
    r.rect(spine0, top - hgt * 0.45, spineW, hgt * 0.45, DARK);
    for (let k = 0; k < S.spires; k++) {
      const spx = spine0 + spineW * ((k + 0.5) / S.spires), sh = hgt * (0.7 + 0.5 * hash(k, 11)), sw = Math.max(2 * u, len * 0.012);
      r.rect(spx - sw / 2, top - hgt * 0.45 - sh, sw, sh, DARK);
      r.poly([[spx - sw * 1.2, top - hgt * 0.45 - sh], [spx + sw * 1.2, top - hgt * 0.45 - sh], [spx, top - hgt * 0.45 - sh - sw * 3]], MID);
      r.stroke(spx - sw * 3, top - hgt * 0.2, spx - sw * 0.5, top - hgt * 0.45 - sh * 0.5, px(u), MID); // the buttress leaning on it
    }
    if (S.dome) { r.disc(spine0 + spineW * 0.5, top - hgt * 0.45, hgt * 0.45, DARK); r.rect(spine0 + spineW * 0.5 - u, top - hgt * 1.2, 2 * u, hgt * 0.35, MID); }
    for (let k = 0; k < 7; k++) r.rect(x0 + len * (0.15 + k * 0.1), cy + hgt * 0.05, px(u), px(u), (k + f.beat.count) % 2 && f.beat.pulse > 0.5 ? BRIGHT : LMID + DIM); // the running lights
    const glow = hgt * (0.35 + 0.8 * clamp(f.rel.bassDrive));
    for (const k of [-0.25, 0.05, 0.3]) { r.rect(x1 - 2 * u, cy + hgt * k - hgt * 0.1, 3 * u, hgt * 0.16, MID); r.rect(x1 + u, cy + hgt * k - hgt * 0.06, glow * (0.8 + 0.4 * hash(k * 10 | 0, t * 20 | 0)), hgt * 0.1, HOT); r.rect(x1 + u, cy + hgt * k - hgt * 0.02, glow * 0.4, hgt * 0.03, BRIGHT); }
    targets.push({ x: x0 - len * 0.07, y: top - hgt * 1.5, w: len * 1.07, h: hgt * 2.1 });
    // the lances run out to their raider over a quarter second, burn there for a moment, then the burst
    w.lances = w.lances.filter((ln) => {
      ln.t += dt;
      const tx = ln.tg.sx ?? ln.tg.x * N, ty = ln.tg.sy ?? ln.tg.y * N, k = Math.min(1, ln.t / 0.25);
      r.stroke(ln.x0, ln.y0, lerp(ln.x0, tx, k), lerp(ln.y0, ty, k), ln.t < 0.45 ? px(1.8 * u) : px(u), ln.t < 0.45 ? BRIGHT : COOL);
      r.disc(ln.x0, ln.y0, 2 * u, BRIGHT);
      if (k >= 1 && !ln.hit) { ln.hit = true; ln.tg.flash = 0.15; if (--ln.tg.hp <= 0 && ln.tg.dead <= 0) { ln.tg.dead = 3; burst(w.sparks, rnd, tx, ty, 14, 0.25 * N, MID, 1.5); } burst(w.sparks, rnd, tx, ty, 5, 0.15 * N, BRIGHT, 0.4); }
      return ln.t < 0.6;
    });
    // the return fire crosses at a steady speed and breaks on the shield; the torpedoes steer in and strike home
    const inShield = (x, y) => ((x - cx) / (len * 0.62)) ** 2 + ((y - cy) / (hgt * 2.4)) ** 2 <= 1;
    w.shots = w.shots.filter((sh) => {
      const sp = Math.hypot(sh.vx, sh.vy) || 1;
      sh.x += (sh.vx / sp) * 0.9 * N * dt; sh.y += (sh.vy / sp) * 0.9 * N * dt;
      r.rect(sh.x - u, sh.y - u, 2 * u, 2 * u, HOT);
      if (inShield(sh.x, sh.y)) { w.flashes.push({ x: sh.x, y: sh.y, life: 1 }); return false; }
      return sh.x > -0.1 * N && sh.x < 1.1 * N && sh.y > -0.1 * N && sh.y < 1.1 * N;
    });
    w.flashes = w.flashes.filter((fl) => { fl.life -= dt * 3; hexFlash(r, fl.x, fl.y, 3 * u, fl.life, fl.life > 0.7 ? BRIGHT : COOL); return fl.life > 0; });
    w.torps = w.torps.filter((tp) => {
      tp.life -= dt;
      const tg = tp.tg && tp.tg.dead <= 0 ? tp.tg : null, tx = tg ? tg.sx : -0.2 * N, ty = tg ? tg.sy : tp.y;
      const want = Math.atan2(ty - tp.y, tx - tp.x), cur = Math.atan2(tp.vy, tp.vx), sp = 0.45 * N;
      let da = want - cur; da = Math.atan2(Math.sin(da), Math.cos(da));
      const a = cur + clamp(da, -dt * 2.5, dt * 2.5);
      tp.vx = Math.cos(a) * sp; tp.vy = Math.sin(a) * sp;
      tp.x += tp.vx * dt; tp.y += tp.vy * dt;
      r.stroke(tp.x, tp.y, tp.x - Math.cos(a) * 4 * u, tp.y - Math.sin(a) * 4 * u, px(1.5 * u), LMID);
      r.rect(tp.x - Math.cos(a) * 5 * u, tp.y - Math.sin(a) * 5 * u, px(u), px(u), HOT);
      if (tg && Math.hypot(tp.x - tx, tp.y - ty) < 3 * u) { tg.flash = 0.3; tg.hp -= 2; burst(w.sparks, rnd, tx, ty, 10, 0.2 * N, HOT, 0.6); if (tg.hp <= 0) { tg.dead = 3; burst(w.sparks, rnd, tx, ty, 12, 0.25 * N, MID, 1.5); } return false; }
      return tp.life > 0 && tp.x > -0.2 * N;
    });
    w.sparks = drift(r, w.sparks, dt, u, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- ironclad
// A squad of giants in power armour advancing right in a heavy gait, one stride per beat, the shoulders rocking with
// it, the ground going by under the planted foot. Kicks are the bolt guns: a flash at the muzzle, a tracer across,
// an impact on whoever stands ahead or on the ground where it comes down; a snare raises the chain blade and revs it,
// the teeth running round. A drop brings a pod down a ballistic line that slams in (a ring, dust, the doors open) and
// two wide-plated giants step out to join the line. Marks of armour: the bulky mark, the terminator plate, the lean scout.
const MARKS = {
  bulky: { h: 0.2, pad: 1, stride: 0.5, leg: 0.42 }, // the standard plate: broad pads, a square pack
  terminator: { h: 0.22, pad: 1.5, stride: 0.34, leg: 0.36 }, // wider still, short legs, a short stride; the pod's cargo
  scout: { h: 0.19, pad: 0.7, stride: 0.66, leg: 0.48 }, // lean, long-legged, the longest stride
};
const MARK_W = { bulky: [3, 2, 1], terminator: [0, 1, 3], scout: [2, 2, 1] };

// a giant facing right, hip at x, feet on g, h tall; k is how far the swing of this stride has come (0..1), lead
// says which foot swings; returns the muzzle and the shoulder the chain blade rises from
function drawGiant(r, x, g, h, K, k, lead, u, col, rev, revT) {
  const stride = K.stride * h, legH = K.leg * h, lift = Math.sin(k * Math.PI) * h * 0.08, bob = -Math.sin(k * Math.PI) * h * 0.03, rock = Math.sin(k * Math.PI) * lead * h * 0.025;
  const fa = x + stride * (k - 0.5), fb = x + stride * (0.5 - k), hipY = g - legH + bob, lw = h * 0.11;
  shadow(r, x, g, h * 0.3);
  r.stroke(x - h * 0.04, hipY, lead > 0 ? fa : fb, g - (lead > 0 ? lift : 0) - lw * 0.4, lw, col); // the far leg first
  r.rect((lead > 0 ? fa : fb) - lw * 0.7, g - (lead > 0 ? lift : 0) - lw * 0.8, lw * 1.5, lw * 0.8, col);
  const chestY = hipY - h * 0.34, padY = chestY + h * 0.02;
  r.rect(x - h * 0.27, chestY + h * 0.02, h * 0.14, h * 0.26, col); // the pack
  for (const k2 of [-0.24, -0.17]) r.rect(x + k2 * h, chestY - h * 0.06, h * 0.05, h * 0.08, col);
  r.poly([[x - h * 0.16, hipY + h * 0.02], [x + h * 0.14, hipY + h * 0.02], [x + h * 0.2, chestY], [x - h * 0.18, chestY]], col); // the trunk
  r.disc(x - h * 0.04, padY - h * 0.02 - rock, h * 0.11 * K.pad, col); // the far pad, higher on the planted side
  r.rect(x + h * 0.03, chestY - h * 0.1, h * 0.12, h * 0.12, col); // the helm, set low between the pads
  r.rect(x + h * 0.11, chestY - h * 0.06, h * 0.04, px(u), HOT);
  r.disc(x + h * 0.12, padY + rock, h * 0.12 * K.pad, col); // the near pad
  r.stroke(x + h * 0.14, padY + h * 0.08, x + h * 0.28, chestY + h * 0.2, lw * 0.8, col); // the arm to the gun
  r.rect(x + h * 0.22, chestY + h * 0.14, h * 0.28, h * 0.09, col);
  r.rect(x + h * 0.3, chestY + h * 0.23, h * 0.06, h * 0.08, col);
  r.rect(x + h * 0.36, chestY + h * 0.16, h * 0.14, px(u), DARK);
  r.stroke(x + h * 0.04, hipY, lead > 0 ? fb : fa, g - (lead > 0 ? 0 : lift) - lw * 0.4, lw, col); // the near leg last
  r.rect((lead > 0 ? fb : fa) - lw * 0.7, g - (lead > 0 ? 0 : lift) - lw * 0.8, lw * 1.5, lw * 0.8, col);
  r.rect(x - h * 0.02, hipY - h * 0.1, h * 0.04, h * 0.1, DARK); // the plate lines
  if (rev > 0) { // the chain blade up from the far shoulder, its teeth running while it revs
    const bx = x - h * 0.06, by = padY - h * 0.06, tx = bx + h * 0.16, ty = by - h * 0.42, ph = Math.floor(revT * 40);
    r.stroke(bx, by, tx, ty, h * 0.07, MID);
    for (let i = 0; i < 8; i++) { const q = i / 8; r.rect(lerp(bx, tx, q) - h * 0.035, lerp(by, ty, q), px(1.5 * u), px(1.5 * u), (i + ph) % 2 ? BRIGHT : DARK); r.rect(lerp(bx, tx, q) + h * 0.02, lerp(by, ty, q), px(1.5 * u), px(1.5 * u), (i + ph + 1) % 2 ? BRIGHT : DARK); }
  }
  return { mx: x + h * 0.5, my: chestY + h * 0.185, top: padY - h * 0.14 * K.pad };
}

const ironclad = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { mark: rollW(rnd, MARK_W, band), squad: [0.25, 0.42, 0.59].map((x, i) => ({ x, tx: x, mark: null, rev: 0, revT: 0, flash: 0 })), count: 0, ph: 0, planted: true, tracers: [], dust: [], sparks: [], foes: [], pod: null, shooter: 0 });
    for (let i = 0; i < 3; i++) w.foes.push({ wx: 1.1 + i * 0.5 + rnd() * 0.3, down: 0, flash: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, g = 0.8 * N, K = MARKS[w.mark], h = K.h * N, stride = K.stride * h;
    // the gait: a beat starts the swing, which is done by mid-beat; the ground scrolls under the planted foot meanwhile
    if (beatLocked(f) ? f.beat.on : (w.ph += dt * bps) >= 1) { w.ph = 0; w.count++; w.planted = false; }
    const phase = beatLocked(f) ? f.beat.phase : w.ph, k = ease(Math.min(1, phase / 0.5)), lead = w.count % 2 ? 1 : -1, scroll = (w.count + k) * stride;
    const dscroll = scroll - (w.scroll ?? scroll);
    w.scroll = scroll;
    if (k >= 1 && !w.planted) { // the foot comes down
      w.planted = true;
      s.shake = Math.max(s.shake, w.mark === 'terminator' ? 0.35 : 0.15);
      for (const gi of w.squad) burst(w.dust, rnd, gi.x * N + stride * 0.5, g, 4, 0.12 * N, LMID + DIM, 0.6);
    }
    for (const foe of w.foes) { foe.wx -= dscroll / N; if (foe.wx < -0.1) { foe.wx = 1.1 + rnd() * 0.4; foe.down = 0; } }
    if (w.pod && w.pod.landed) w.pod.x -= dscroll;
    for (const p of w.dust) p.x -= dscroll; // the dust and the sparks are the ground's: they go by with it
    for (const p of w.sparks) p.x -= dscroll;
    const ahead = (x) => w.foes.filter((q) => q.down <= 0 && q.wx * N > x + 0.1 * N && q.wx < 1.05).sort((a, b) => a.wx - b.wx)[0];
    for (const hh of hits) {
      if (isLow(hh)) { // the next gun in line fires at whoever is ahead, or at the ground far out
        const gi = w.squad[w.shooter++ % w.squad.length], mz = gi.mz || { mx: gi.x * N + h * 0.5, my: g - h * 0.6 }, tg = ahead(gi.x * N);
        const tx = tg ? tg.wx * N : mz.mx + 0.45 * N, ty = tg ? g - 0.05 * N : g, a = Math.atan2(ty - mz.my, tx - mz.mx);
        w.tracers.push({ x: mz.mx, y: mz.my, vx: Math.cos(a) * 2.6 * N, vy: Math.sin(a) * 2.6 * N, tx, ty, tg });
        gi.flash = 0.06;
        s.shake = Math.max(s.shake, 0.1);
      } else if (hh.kind === 'snare') { const gi = pick(rnd, w.squad); gi.rev = 0.6; }
    }
    if (f.section === 'drop' && !w.pod) w.pod = { x: 0.78 * N, y: -0.25 * N, vx: -0.3 * N, vy: 1.3 * N, landed: false, open: 0, out: 0 };
    else if (f.section === 'change') w.mark = rollW(rnd, MARK_W, band);
    // the sky burning low over the plain, far smoke columns going by slow, the ground and its rubble going by fast
    const tt = t * 8 | 0, glow = 0.25 + 0.5 * clamp(f.rel.bassDrive);
    for (let y = Math.round(g - 0.12 * N); y < g; y++) for (let x = 0; x < N; x++) if (hash(x, y + tt) < ((y - g + 0.12 * N) / (0.12 * N)) * glow) r.buf[y * N + x] = HOT + DIM;
    for (let i = 0; i < 6; i++) { const sx = (((hash(i, 21) * 1.5 - scroll / N * 0.25) % 1.5) + 1.5) % 1.5 * N - 0.25 * N; r.rect(sx, g - 0.3 * N - hash(i, 22) * 0.15 * N, 2 * u + hash(i, 23) * 3 * u, 0.3 * N + hash(i, 22) * 0.15 * N, DARK + DIM); }
    r.rect(0, g, N, N - g, DARK);
    for (let i = 0; i < 40; i++) { const sx = (((hash(i, 31) * 1.3 - scroll / N) % 1.3) + 1.3) % 1.3 * N - 0.15 * N, sy = g + hash(i, 32) * (N - g); r.rect(sx, sy, px(u + hash(i, 33) * 2 * u), px(u), hash(i, 34) < 0.5 ? MID : DARK + DIM); }
    // whoever stands ahead: dark, small, flashing when hit, flat on the ground when down
    for (const foe of w.foes) {
      foe.flash -= dt;
      const fx = foe.wx * N, fh = 0.1 * N, c = foe.flash > 0 ? BRIGHT : MID;
      if (foe.down > 0) { foe.down -= dt; r.rect(fx - fh * 0.5, g - 2 * u, fh, 2 * u, c); continue; }
      shadow(r, fx, g, fh * 0.2);
      r.rect(fx - fh * 0.12, g - fh * 0.75, fh * 0.24, fh * 0.75, c);
      r.disc(fx, g - fh * 0.85, fh * 0.12, c);
      r.rect(fx - fh * 0.3, g - fh * 0.55, fh * 0.3, px(u), c);
      targets.push({ x: fx - fh * 0.3, y: g - fh, w: fh * 0.6, h: fh });
    }
    // the squad, back to front; the newcomers close up to their slot in the line
    for (const gi of w.squad) {
      gi.x = follow(gi.x, gi.tx, dt, 0.8);
      gi.rev -= dt; gi.flash -= dt;
      if (gi.rev > 0) gi.revT += dt; else gi.revT = 0;
      const KK = MARKS[gi.mark || w.mark], gh = KK.h * N;
      gi.mz = drawGiant(r, gi.x * N, g, gh, KK, k, lead, u, FIG, gi.rev, gi.revT);
      if (gi.flash > 0) { r.disc(gi.mz.mx + 2 * u, gi.mz.my, 3 * u, BRIGHT); r.poly([[gi.mz.mx + 2 * u, gi.mz.my - 3 * u], [gi.mz.mx + 9 * u, gi.mz.my], [gi.mz.mx + 2 * u, gi.mz.my + 3 * u]], HOT); }
      targets.push({ x: gi.x * N - gh * 0.3, y: gi.mz.top, w: gh * 0.8, h: g - gi.mz.top });
    }
    // the tracers run their heading from the muzzle and burst where they land: on a foe, or in the dirt
    w.tracers = w.tracers.filter((tr) => {
      const step = Math.hypot(tr.vx, tr.vy) * dt, left = Math.hypot(tr.tx - tr.x, tr.ty - tr.y);
      if (left <= step) {
        if (tr.tg) { tr.tg.flash = 0.15; tr.tg.down = 2 + rnd() * 2; burst(w.sparks, rnd, tr.tx, tr.ty, 8, 0.25 * N, HOT, 0.4); }
        else burst(w.dust, rnd, tr.tx, tr.ty, 8, 0.2 * N, LMID + DIM, 0.6);
        return false;
      }
      tr.x += tr.vx * dt; tr.y += tr.vy * dt;
      r.stroke(tr.x, tr.y, tr.x - (tr.vx / (step / dt)) * 6 * u, tr.y - (tr.vy / (step / dt)) * 6 * u, px(u), HOT);
      r.rect(tr.x - u * 0.5, tr.y - u * 0.5, px(u), px(u), BRIGHT);
      return tr.x < 1.1 * N;
    });
    // the pod: down its line under gravity, the retros lit near the ground, the slam, the doors, the two who step out
    if (w.pod) {
      const P = w.pod;
      if (!P.landed) {
        P.vy += G * N * dt;
        P.x += P.vx * dt; P.y += P.vy * dt;
        if (P.y >= g - 0.06 * N) { P.y = g - 0.06 * N; P.landed = true; s.shake = Math.max(s.shake, 0.9); burst(w.dust, rnd, P.x, g, 30, 0.45 * N, LMID + DIM, 1); burst(w.sparks, rnd, P.x, g, 10, 0.3 * N, HOT, 0.5); }
        r.stroke(P.x - P.vx * 0.12, P.y - P.vy * 0.12, P.x, P.y, 3 * u, HOT + DIM); // the burn of the line behind it
        if (P.y > g - 0.35 * N) for (let i = 0; i < 4; i++) r.rect(P.x - 3 * u + rnd() * 6 * u, P.y + 0.05 * N + rnd() * 5 * u, 2 * u, 2 * u, i ? HOT : BRIGHT);
      } else {
        P.open = Math.min(1, P.open + dt * 2);
        if (P.open >= 1 && P.out < 2 && w.squad.length < 5) { P.out++; const back = Math.min(...w.squad.map((q) => q.tx)); if (back > 0.2) w.squad.unshift({ x: P.x / N, tx: back - 0.14, mark: 'terminator', rev: 0, revT: 0, flash: 0 }); }
        if (P.open < 0.5) r.ring(P.x, g, (0.05 + P.open * 0.5) * N, px(1.5 * u), LMID, 0.3);
      }
      const ph = P.landed ? P.open : 0;
      r.poly([[P.x - 0.06 * N, P.y + 0.06 * N], [P.x + 0.06 * N, P.y + 0.06 * N], [P.x + 0.05 * N, P.y - 0.06 * N], [P.x, P.y - 0.1 * N], [P.x - 0.05 * N, P.y - 0.06 * N]], MID);
      for (const sgn of [-1, 1]) { const a = lerp(-Math.PI / 2, sgn > 0 ? 0 : Math.PI, ph); r.stroke(P.x + sgn * 0.03 * N, P.y + 0.06 * N, P.x + sgn * 0.03 * N + Math.cos(a) * 0.1 * N, P.y + 0.06 * N + Math.sin(a) * 0.1 * N, 2 * u, LMID); }
      r.rect(P.x - u, P.y - 0.03 * N, 2 * u, 2 * u, P.landed ? COOL : HOT);
      targets.push({ x: P.x - 0.07 * N, y: P.y - 0.1 * N, w: 0.14 * N, h: 0.17 * N });
      if (P.landed && P.x < -0.15 * N) w.pod = null;
    }
    if (w.squad.length > 5) w.squad.shift();
    w.dust = particles(W, w.dust, LMID + DIM);
    w.sparks = particles(W, w.sparks, HOT);
  },
};

// ---------------------------------------------------------------------------------------------- warp storm
// The sea beyond the veil: bands of storm in the two accents swirling with the clocks, faces that gather in the
// noise (two eyes and a mouth that never quite resolve) and dissolve again, and a ship inside its bubble of shield,
// calm within, the storm flattened against it without. Hats ripple the bubble, snares bring clawed hands out of the
// storm to press on it (and dent it), the beat pulses the ship's lights; a drop drops the shield for a bar and the
// storm pours in. Weathers: the tide (slow bands), the maelstrom (a hard swirl), the maw (more faces).
const WEATHERS = {
  tide: { swirl: 0.5, speed: 0.6, faces: 2 },
  maelstrom: { swirl: 2.4, speed: 1.4, faces: 2 },
  maw: { swirl: 1.2, speed: 0.9, faces: 4 },
};
const WEATHER_W = { tide: [3, 2, 1], maelstrom: [1, 2, 3], maw: [1, 2, 2] };
function warpTables(w, N) {
  w.N = N;
  w.D = new Float32Array(N * N); w.A = new Float32Array(N * N); w.NZ = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dx = (x + 0.5) / N - 0.5, dy = (y + 0.5) / N - 0.5, i = y * N + x; w.D[i] = Math.hypot(dx, dy); w.A[i] = Math.atan2(dy, dx); w.NZ[i] = (hash(x >> 2, y >> 2) - 0.5) * 0.7; }
}
const newFace = (rnd, R) => { const a = rnd() * TAU, d = R * 1.6 + rnd() * 0.15; return { x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d, sz: 0.14 + rnd() * 0.12, t: 0, life: 3 + rnd() * 3, seed: Math.floor(rnd() * 9973), va: (rnd() - 0.5) * 0.01 }; };

const warpstorm = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    warpTables(w, N);
    Object.assign(w, { weather: rollW(rnd, WEATHER_W, band), faces: [], ripples: [], claws: [], fail: 0, calm: 0.26, c1: 0, c2: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, Wt = WEATHERS[w.weather], R = 0.26, cx = 0.5 * N, cy = 0.5 * N, tt = t * 10 | 0;
    if (w.N !== N) warpTables(w, N);
    for (const h of hits) {
      if (h.kind === 'hat') w.ripples.push({ a: rnd() * TAU, t: 0 });
      else if (h.kind === 'snare' && w.claws.length < 3) w.claws.push({ a: rnd() * TAU, t: 0, seed: Math.floor(rnd() * 9973) });
      else if (isLow(h)) for (const fc of w.faces) fc.sz = Math.min(0.3, fc.sz + 0.02 * h.strength); // the faces swell on the bass
    }
    if (f.section === 'drop') w.fail = 4 / bps;
    else if (f.section === 'change') w.weather = rollW(rnd, WEATHER_W, band);
    w.fail -= dt;
    w.calm = follow(w.calm, w.fail > 0 ? 0 : R, dt, w.fail > 0 ? 0.2 : 0.7);
    w.c1 += dt * (0.5 + 1.5 * clamp(f.rel.bassDrive)) * Wt.speed;
    w.c2 += dt * (0.3 + 1.2 * clamp(f.rel.midDrive)) * Wt.speed;
    // the storm, a pixel at a time: rings running in, a swirl running round, the fixed grain tearing their edges;
    // one accent where the field is high, the other where it is low, dark between; the calm inside the bubble
    const { D, A, NZ } = w, buf = r.buf, k1 = 28, k2 = 9 * Wt.swirl, c1 = w.c1 * SINK, c2 = w.c2 * SINK, th = 1.15 - 0.45 * f.level, th2 = th * 0.45, calm = w.calm, swirl = 3;
    for (let i = 0, n = N * N; i < n; i++) {
      const d = D[i], v = SIN[((d * k1) * SINK - c1 | 0) & 1023] + SIN[((A[i] * swirl + d * k2) * SINK + c2 | 0) & 1023] + NZ[i];
      if (d < calm) buf[i] = v > th ? DARK : BG;
      else buf[i] = v > th ? HOT : v > th2 ? HOT + DIM : v < -th ? COOL : v < -th2 ? COOL + DIM : DARK;
    }
    // the faces: eyes and a mouth that are only ever part there, denser as they come, thinner as they go
    while (w.faces.length < Wt.faces) w.faces.push(newFace(rnd, R));
    w.faces = w.faces.filter((fc) => {
      fc.t += dt;
      const k = Math.sin(Math.PI * Math.min(1, fc.t / fc.life)) * 0.9, sz = fc.sz * N, ang = Math.atan2(fc.y - 0.5, fc.x - 0.5) + Math.PI / 2;
      fc.x += Math.cos(ang) * fc.va * dt * 10 * Wt.swirl; fc.y += Math.sin(ang) * fc.va * dt * 10 * Wt.swirl;
      const fx = fc.x * N, fy = fc.y * N;
      for (const sgn of [-1, 1]) { const ex = fx + sgn * sz * 0.28, ey = fy - sz * 0.1, er = sz * 0.14; for (let y = ey - er; y <= ey + er; y++) for (let x = ex - er; x <= ex + er; x++) if ((x - ex) ** 2 + (y - ey) ** 2 <= er * er && hash((x | 0) + fc.seed, (y | 0) + tt) < k) r.set(x, y, BLACK); }
      for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU; if (hash(i + fc.seed, tt + 3) < k) r.rect(fx + Math.cos(a) * sz * 0.22, fy + sz * 0.25 + Math.sin(a) * sz * 0.1 * (1 + f.beat.pulse * 0.6), px(u), px(u), BLACK); }
      if (k > 0.3) targets.push({ x: fx - sz * 0.45, y: fy - sz * 0.3, w: sz * 0.9, h: sz * 0.7 });
      return fc.t < fc.life && fc.x > -0.2 && fc.x < 1.2 && fc.y > -0.2 && fc.y < 1.2;
    });
    if (w.faces.length > Wt.faces) w.faces.length = Wt.faces;
    // the claws: an arm out of the dark, a palm with four fingers pressing in on the bubble, then gone again
    w.claws = w.claws.filter((cl) => {
      cl.t += dt;
      const press = cl.t < 0.3 ? ease(cl.t / 0.3) : cl.t < 0.9 ? 1 : Math.max(0, 1 - (cl.t - 0.9) / 0.4), rad = R * N * (1.4 - 0.3 * press), ca = Math.cos(cl.a), sa = Math.sin(cl.a);
      const hx = cx + ca * rad, hy = cy + sa * rad;
      cl.press = press;
      r.stroke(cx + ca * N * 0.8, cy + sa * N * 0.8, hx, hy, 4 * u, BLACK);
      r.disc(hx, hy, 3.5 * u, BLACK);
      for (let i = 0; i < 4; i++) { const fa = cl.a + Math.PI + (i - 1.5) * 0.45 * (1 - press * 0.5), fl = (5 + hash(cl.seed, i) * 3) * u; r.stroke(hx, hy, hx + Math.cos(fa) * fl, hy + Math.sin(fa) * fl, px(1.8 * u), BLACK); r.rect(hx + Math.cos(fa) * fl, hy + Math.sin(fa) * fl, px(u), px(u), BRIGHT); }
      return cl.t < 1.3;
    });
    // the bubble: a ring of points that flicker with the treble, dented where a hand presses, gone while it fails
    if (w.fail <= 0 && w.calm > R * 0.5) {
      const n = Math.round(80 * u) + 24, flick = 0.1 + 0.4 * clamp(f.rel.trebDrive);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        let dent = 0;
        for (const cl of w.claws) { let da = a - cl.a; da = Math.atan2(Math.sin(da), Math.cos(da)); dent += cl.press * Math.exp(-(da * da) / 0.12); }
        const rr = w.calm * N * (1 - dent * 0.1);
        if (hash(i, tt) > flick) r.rect(cx + Math.cos(a) * rr - u * 0.5, cy + Math.sin(a) * rr - u * 0.5, px(u), px(u), dent > 0.3 ? BRIGHT : f.beat.pulse > 0.6 ? COOL : COOL + DIM);
      }
    } else for (let i = 0; i < 6; i++) r.rect(cx + (rnd() - 0.5) * 0.2 * N, cy + (rnd() - 0.5) * 0.08 * N, 2 * u, 2 * u, i ? HOT : BRIGHT); // the storm on the hull
    w.ripples = w.ripples.filter((rp) => { rp.t += dt; const rr = w.calm * N; r.ring(cx + Math.cos(rp.a) * rr, cy + Math.sin(rp.a) * rr, rp.t * 14 * u, px(u), rp.t < 0.15 ? BRIGHT : COOL, 1); return rp.t < 0.4; });
    // the ship, small in its calm: hull, ram, two spires, the lights on the beat
    const len = 0.2 * N, hgt = 0.045 * N, x0 = cx - len * 0.5, x1 = cx + len * 0.5, lit = w.fail <= 0;
    r.poly([[x0, cy], [x0 + len * 0.1, cy - hgt * 0.5], [x1 - len * 0.05, cy - hgt * 0.5], [x1, cy - hgt * 0.2], [x1, cy + hgt * 0.5], [x0 + len * 0.12, cy + hgt * 0.7]], FIG);
    r.poly([[x0 - len * 0.08, cy + hgt * 0.1], [x0 + len * 0.02, cy - hgt * 0.4], [x0 + len * 0.02, cy + hgt * 0.5]], LMID);
    for (const k of [0.42, 0.62]) { r.rect(x0 + len * k - u, cy - hgt * 1.5, 2 * u, hgt, FIG); r.rect(x0 + len * k - u * 0.5, cy - hgt * 2, px(u), hgt * 0.5, FIG); }
    for (let k = 0; k < 5; k++) r.rect(x0 + len * (0.2 + k * 0.15), cy + hgt * 0.1, px(u), px(u), lit && (k + f.beat.count) % 2 && f.beat.pulse > 0.5 ? BRIGHT : lit ? HOT : DARK);
    r.rect(x1 + u, cy, hgt * (0.4 + 0.6 * clamp(f.rel.bassDrive)), px(u), lit ? HOT : HOT + DIM);
    if (w.fail > 0) s.shake = Math.max(s.shake, 0.2);
    targets.push({ x: x0 - len * 0.1, y: cy - hgt * 2, w: len * 1.2, h: hgt * 3 });
  },
};

// ---------------------------------------------------------------------------------------------- god machine
// A titan walks a burning city, one stride a bar, the city going by under it: the foot comes down, the ground
// shakes, whatever stands under it comes apart, the rubble falling as rubble does. Kicks fire the head cannons,
// shells that drop on arcs out ahead; snares are the tanks below answering, their shells climbing to the titan and
// breaking on its shields in flashes of hex; the eyes pulse on the beat, the banner swings as it walks. A drop
// brings the walking cathedral. Classes: two legs, four, and the cathedral that walks.
const TITANS = {
  biped: { H: 0.6, legs: 2, stride: 0.2, wide: 0.3 }, // the upright war engine: two columns for legs
  quad: { H: 0.48, legs: 4, stride: 0.18, wide: 0.5 }, // a long carapace on four legs, a diagonal gait
  cathedral: { H: 0.72, legs: 2, stride: 0.15, wide: 0.42, dome: true }, // a dome and spires on a walking keep
};
const TITAN_W = { biped: [3, 2, 1], quad: [2, 2, 2], cathedral: [0, 1, 2] };
const newBlock = (rnd, wx, far) => ({ wx, w: (far ? 0.03 : 0.05) + rnd() * (far ? 0.03 : 0.06), h: (far ? 0.08 : 0.1) + rnd() * (far ? 0.12 : 0.22), hp: 1, fire: rnd() < 0.4, far });

const godmachine = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, TITAN_W, band), near: Array.from({ length: 14 }, (_, i) => newBlock(rnd, i * 0.12 + rnd() * 0.05, false)), far: Array.from({ length: 16 }, (_, i) => newBlock(rnd, i * 0.1 + rnd() * 0.04, true)),
      tanks: Array.from({ length: 3 }, (_, i) => ({ wx: 0.1 + i * 0.5 + rnd() * 0.2, flash: 0, ph: 0 })), bars: 0, ph: 0, planted: true, scroll: 0, shells: [], flashes: [], debris: [], smoke: [], muzzle: 0, bannerA: 0, bannerV: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, g = 0.84 * N, T = TITANS[w.kind], H = T.H * N, X = 0.45 * N, stride = T.stride * N, tt = t * 8 | 0;
    // the stride: a bar long, the swing over its first half, the city going by under the planted foot meanwhile
    let barPh;
    if (beatLocked(f)) { barPh = ((f.beat.count % 4) + f.beat.phase) / 4; if (f.beat.on && f.beat.count % 4 === 0) { w.bars++; w.planted = false; } }
    else { w.ph += (dt * bps) / 4; if (w.ph >= 1) { w.ph = 0; w.bars++; w.planted = false; } barPh = w.ph; }
    const k = ease(Math.min(1, barPh / 0.5)), lead = w.bars % 2 ? 1 : -1, scroll = (w.bars + k) * stride, dscroll = scroll - w.scroll;
    w.scroll = scroll;
    const crush = (b, dmg, col) => { if (b.hp <= 0) return; b.hp = Math.max(0, b.hp - dmg); for (let i = 0; i < 7; i++) w.debris.push({ x: (b.wx + rnd() * b.w) * N - scroll, y: g - b.h * N * (b.hp + rnd() * 0.3), vx: (rnd() - 0.5) * 0.35 * N, vy: -rnd() * 0.4 * N, life: 1 + rnd(), c: col }); };
    const footX = (sw) => X + (sw ? stride * (k - 0.5) : stride * (0.5 - k)), footW = H * 0.1;
    if (k >= 1 && !w.planted) { // the foot comes down on whatever is under it
      w.planted = true;
      s.shake = Math.max(s.shake, w.kind === 'cathedral' ? 1 : 0.7);
      const fx = footX(true);
      for (const b of w.near) { const bx = b.wx * N - scroll + b.w * N * 0.5; if (Math.abs(bx - fx) < footW + b.w * N * 0.5) crush(b, 1, DARK); }
      for (let i = 0; i < 14; i++) w.debris.push({ x: fx + (rnd() - 0.5) * footW * 2, y: g, vx: (rnd() - 0.5) * 0.5 * N, vy: -rnd() * 0.25 * N, life: 0.8, c: LMID + DIM });
    }
    for (const b of w.near) if (b.wx * N - scroll < -0.2 * N) Object.assign(b, newBlock(rnd, b.wx + 1.7, false));
    for (const b of w.far) if (b.wx * N - scroll * 0.4 < -0.1 * N) Object.assign(b, newBlock(rnd, b.wx + 1.6 / 0.4, true));
    const headY = g - H * 0.95, aim = (x0, y0, x1, y1, Tt) => ({ vx: (x1 - x0) / Tt, vy: (y1 - y0) / Tt - 0.5 * G * N * Tt }); // the launch that lands there in Tt seconds
    for (const h of hits) {
      if (isLow(h)) { // the head cannons, out ahead
        for (const sgn of [-1, 1]) { const mx = X + H * 0.3, my = headY + H * 0.04 + sgn * H * 0.03, tx = X + (0.35 + rnd() * 0.25) * N; w.shells.push({ x: mx, y: my, ...aim(mx, my, tx, g, 0.55 + rnd() * 0.1), big: true }); }
        w.muzzle = 0.08;
        s.shake = Math.max(s.shake, 0.25);
      } else if (h.kind === 'snare') { // a tank answers: a shell up to the body, broken on the shield
        const tk = pick(rnd, w.tanks), tx = tk.wx * N - scroll, ty = g - 3 * u;
        if (tx > -0.1 * N && tx < 1.1 * N) { const sh = { x: tx + Math.sign(X - tx) * 5 * u, y: ty - 3 * u, ...aim(tx, ty, X + (rnd() - 0.5) * H * 0.3, g - H * (0.5 + rnd() * 0.3), 0.7), big: false, tg: true, T: 0.7, t: 0 }; w.shells.push(sh); tk.flash = 0.08; }
      }
    }
    if (f.section === 'drop') w.kind = 'cathedral';
    else if (f.section === 'change') w.kind = rollW(rnd, TITAN_W, band);
    w.muzzle -= dt;
    // the sky burning low behind the far blocks, the far city, the near city with its fires and smoke
    const glow = 0.3 + 0.5 * clamp(f.rel.bassDrive);
    for (let y = Math.round(g - 0.3 * N); y < g; y++) for (let x = 0; x < N; x++) if (hash(x, y + tt) < ((y - g + 0.3 * N) / (0.3 * N)) ** 2 * glow) r.buf[y * N + x] = HOT + DIM;
    for (const b of w.far) { const bx = b.wx * N - scroll * 0.4, bh = b.h * N; r.rect(bx, g - 0.02 * N - bh, b.w * N, bh, DARK + DIM); if (b.fire) r.rect(bx + b.w * N * 0.3, g - 0.02 * N - bh - 2 * u, px(u), 2 * u, hash(b.wx * 100 | 0, tt) < 0.5 ? HOT : HOT + DIM); }
    for (const b of w.near) {
      const bx = b.wx * N - scroll, bh = b.h * N * b.hp, bw = b.w * N;
      if (bh < u) { r.rect(bx - 2 * u, g - 2 * u, bw + 4 * u, 2 * u, DARK); continue; } // the rubble of it
      r.rect(bx, g - bh, bw, bh, DARK);
      for (let y = g - bh + 3 * u; y < g - 2 * u; y += 4 * u) for (let x = bx + 2 * u; x < bx + bw - u; x += 3 * u) if (hash(Math.round(b.wx * 100 + x - bx), Math.round(y)) < 0.3) r.rect(x, y, px(u), px(u), b.fire && y < g - bh + 0.1 * N ? HOT : LMID + DIM);
      if (b.fire && b.hp > 0.5) { // the fire on the roof, the smoke off it slowing as it climbs
        const fh = (0.03 + 0.04 * f.level) * N;
        for (let i = 0; i < 4; i++) r.rect(bx + rnd() * bw, g - bh - rnd() * fh, 2 * u, 2 * u, i % 2 ? HOT : BRIGHT);
        if (rnd() < dt * 3 && w.smoke.length < 120) w.smoke.push({ x: bx + rnd() * bw, y: g - bh - fh, vy: -0.12 * N, vx: 0.02 * N, life: 2 });
      }
    }
    w.smoke = w.smoke.filter((p) => { p.vy = follow(p.vy, -0.02 * N, dt, 1); p.x += p.vx * dt - dscroll; p.y += p.vy * dt; p.life -= dt; r.rect(p.x, p.y, 2 * u, 2 * u, p.life > 1 ? DARK : DARK + DIM); return p.life > 0 && p.y > 0; });
    r.rect(0, g, N, N - g, MID + DIM);
    for (let i = 0; i < 30; i++) r.rect((((hash(i, 41) * 1.4 - scroll / N) % 1.4) + 1.4) % 1.4 * N - 0.2 * N, g + hash(i, 42) * (N - g), px(2 * u), px(u), DARK);
    // the tanks: small, going by with the ground, firing on the snares
    for (const tk of w.tanks) {
      tk.flash -= dt; tk.ph += dt * 4;
      let tx = tk.wx * N - scroll;
      if (tx < -0.1 * N) { tk.wx += 1.7; tx = tk.wx * N - scroll; }
      const dir = Math.sign(X - tx) || 1;
      r.rect(tx - 6 * u, g - 2.5 * u, 12 * u, 2.5 * u, DARK);
      for (let i = 0; i < 6; i++) r.rect(tx - 6 * u + i * 2 * u + (Math.floor(tk.ph) % 2) * u, g - u, px(u), px(u), MID);
      r.rect(tx - 5 * u, g - 5 * u, 10 * u, 2.5 * u, DARK);
      r.rect(tx - 2.5 * u, g - 7 * u, 5 * u, 2 * u, DARK);
      r.stroke(tx + dir * 2 * u, g - 6 * u, tx + dir * 8 * u, g - 9 * u, px(1.2 * u), DARK);
      if (tk.flash > 0) r.disc(tx + dir * 9 * u, g - 9.5 * u, 2 * u, BRIGHT);
      targets.push({ x: tx - 6 * u, y: g - 8 * u, w: 12 * u, h: 8 * u });
    }
    // the titan: the legs (the far ones first), the hull, the cannons, the head, the dome and spires of a cathedral
    const hipY = g - H * 0.5, lw = H * 0.09, legs = [];
    if (T.legs === 4) for (const [dx, sw, far] of [[-0.22, false, true], [0.18, true, true], [-0.12, true, false], [0.28, false, false]]) legs.push({ dx, sw: sw === (lead > 0), far });
    else legs.push({ dx: -0.06, sw: lead < 0, far: true }, { dx: 0.06, sw: lead > 0, far: false });
    for (const lg of legs.filter((q) => q.far)) shadow(r, footX(lg.sw) + lg.dx * H, g, H * 0.12, DARK);
    const drawLeg = (lg) => {
      const fx = footX(lg.sw) + lg.dx * H, lift = lg.sw ? Math.sin(k * Math.PI) * H * 0.07 : 0, kneeY = hipY + H * 0.22, kx = lerp(X + lg.dx * H, fx, 0.5) - (lg.sw ? H * 0.04 : 0), c = lg.far ? DARK : MID;
      r.stroke(X + lg.dx * H, hipY, kx, kneeY - lift * 0.5, lw, c);
      r.stroke(kx, kneeY - lift * 0.5, fx, g - lift - lw * 0.4, lw * 0.85, c);
      r.rect(fx - lw * 1.1, g - lift - lw * 0.8, lw * 2.2, lw * 0.8, c);
      r.disc(kx, kneeY - lift * 0.5, lw * 0.7, c);
    };
    for (const lg of legs) if (lg.far) drawLeg(lg);
    const bob = -Math.sin(k * Math.PI) * H * 0.015, wide = T.wide * H, topY = hipY - H * 0.42 + bob;
    r.poly([[X - wide * 0.5, hipY + H * 0.05 + bob], [X + wide * 0.55, hipY + H * 0.05 + bob], [X + wide * 0.7, topY + H * 0.1], [X + wide * 0.4, topY], [X - wide * 0.45, topY], [X - wide * 0.6, topY + H * 0.12]], MID);
    r.rect(X - wide * 0.45, topY + H * 0.02, wide * 0.85, px(u), LMID);
    for (let i = 0; i < 4; i++) r.rect(X - wide * 0.4 + i * wide * 0.25, topY + H * 0.08, wide * 0.12, H * 0.2, DARK + DIM); // the plates
    for (const sgn of [-1, 1]) r.rect(X + wide * 0.25, topY - H * 0.02 + sgn * H * 0.03 + H * 0.03, wide * 0.5, H * 0.035, DARK); // the head cannons
    if (w.muzzle > 0) r.disc(X + wide * 0.78, topY + H * 0.04, 4 * u, BRIGHT);
    r.rect(X + wide * 0.3, topY - H * 0.1, wide * 0.3, H * 0.1, DARK); // the head
    for (const sgn of [0, 1]) r.rect(X + wide * (0.45 + sgn * 0.08), topY - H * 0.06, 2 * u, px(1.5 * u), f.beat.pulse > 0.4 ? BRIGHT : HOT);
    if (T.dome) { r.disc(X, topY - H * 0.02, wide * 0.32, MID); for (const q of [-0.5, -0.25, 0.25, 0.5]) { const sx = X + q * wide, sh = H * (0.18 + 0.08 * Math.abs(q)); r.rect(sx - 1.5 * u, topY - sh, 3 * u, sh, DARK); r.poly([[sx - 3 * u, topY - sh], [sx + 3 * u, topY - sh], [sx, topY - sh - 5 * u]], DARK); } r.rect(X - u, topY - wide * 0.34 - H * 0.08, 2 * u, H * 0.08, LMID); }
    // the banner under the hull, a pendulum pushed by every stride
    const bl = H * 0.2, om = Math.sqrt((G * N) / bl);
    if (k < 0.05 && !w.planted) w.bannerV += 0.5 * om * -lead;
    w.bannerV -= (w.bannerA * om * om + w.bannerV * 0.3) * dt; w.bannerA += w.bannerV * dt;
    const bx0 = X - wide * 0.72, by0 = topY + H * 0.14 + bob, sA = Math.sin(w.bannerA), cA = Math.cos(w.bannerA), bw = H * 0.035;
    r.rect(bx0 - bw * 1.3, by0 - u, wide * 0.3, px(u), DARK); // the crossbar out from the hull it hangs from
    r.poly([[bx0 - bw, by0], [bx0 + bw, by0], [bx0 + bw * 0.7 + sA * bl, by0 + cA * bl], [bx0 + sA * (bl - bw), by0 + cA * (bl - bw)], [bx0 - bw * 0.7 + sA * bl, by0 + cA * bl]], HOT + DIM);
    r.rect(bx0 - u + sA * bl * 0.5, by0 + cA * bl * 0.5 - u, 2 * u, 2 * u, HOT); // the mark on the cloth, no more than a mark
    for (const lg of legs) if (!lg.far) { shadow(r, footX(lg.sw) + lg.dx * H, g, H * 0.12, DARK); drawLeg(lg); }
    targets.push({ x: X - wide * 0.7, y: topY - H * 0.1 - (T.dome ? wide * 0.3 : 0), w: wide * 1.5, h: g - topY + H * 0.1 });
    // the shells: the titan's drop on arcs out ahead and burst in the city, the tanks' climb to the shield and break there
    w.shells = w.shells.filter((sh) => {
      sh.vy += G * N * dt;
      sh.x += sh.vx * dt - dscroll; sh.y += sh.vy * dt;
      if (sh.tg) sh.t += dt;
      r.disc(sh.x, sh.y, sh.big ? 2 * u : 1.2 * u, sh.big ? LMID : BRIGHT);
      if (sh.big) r.rect(sh.x - Math.sign(sh.vx) * 4 * u, sh.y, 3 * u, px(u), HOT);
      if (sh.tg && sh.t >= sh.T) { w.flashes.push({ x: sh.x, y: sh.y, life: 1 }); return false; }
      if (sh.y >= g) {
        if (sh.big) { for (const b of w.near) if (Math.abs(b.wx * N - scroll + b.w * N * 0.5 - sh.x) < 0.08 * N) crush(b, 0.6, DARK); for (let i = 0; i < 16; i++) w.debris.push({ x: sh.x, y: g, vx: (rnd() - 0.5) * 0.6 * N, vy: -rnd() * 0.5 * N, life: 0.7 + rnd() * 0.5, c: i % 3 ? HOT : BRIGHT }); s.shake = Math.max(s.shake, 0.4); }
        else burst(w.debris, rnd, sh.x, g, 5, 0.2 * N, MID, 0.4);
        return false;
      }
      return sh.x > -0.1 * N && sh.x < 1.1 * N;
    });
    w.flashes = w.flashes.filter((fl) => { fl.life -= dt * 3.5; hexFlash(r, fl.x, fl.y, 3.5 * u, fl.life, fl.life > 0.7 ? BRIGHT : COOL); return fl.life > 0; });
    for (const p of w.debris) p.x -= dscroll;
    w.debris = particles(W, w.debris, DARK);
    if (w.debris.length > 300) w.debris.splice(0, w.debris.length - 300);
  },
};

// ---------------------------------------------------------------------------------------------- scrap convoy
// A raider convoy over the dunes, the camera running alongside: the dunes go by at the speed of the wheels, which
// turn at that speed, and the bodies ride their springs over every crest (the big gun's recoil rocks them too);
// exhaust slows as it rises. Hats are tracers everywhere, kicks the big guns, shells on arcs ahead; snares a burst
// of speed that throws the light rigs off the crests. A drop sends a rammer in from behind: it hits the rear rig and
// comes apart, the parts flying as parts do. Mixes: the light buggies, the gun trucks, the war party with the boss.
const RIGS = {
  bike: { len: 0.07, hgt: 0.03, wheel: 0.016, wb: 0.045, mass: 0.6, spikes: 1, gun: 0 },
  buggy: { len: 0.11, hgt: 0.045, wheel: 0.024, wb: 0.07, mass: 1, spikes: 2, gun: 1 },
  truck: { len: 0.17, hgt: 0.07, wheel: 0.032, wb: 0.11, mass: 1.6, spikes: 3, gun: 2 },
  boss: { len: 0.22, hgt: 0.09, wheel: 0.04, wb: 0.14, mass: 2.4, spikes: 4, gun: 2, claw: true },
};
const CONVOYS = { light: ['buggy', 'bike', 'buggy', 'bike'], guns: ['truck', 'buggy', 'truck', 'buggy'], war: ['boss', 'truck', 'buggy', 'truck'] };
const CONVOY_W = { light: [3, 2, 1], guns: [2, 2, 2], war: [0, 1, 3] };
const newRig = (kind, x) => ({ kind, x, y: 0, vy: 0, ang: 0, spin: 0, flash: 0, snap: 0 });

const scrapconvoy = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), mix = rollW(rnd, CONVOY_W, band);
    Object.assign(w, { mix, rigs: CONVOYS[mix].map((k, i) => newRig(k, 0.82 - i * 0.22)), scroll: 0, boost: 0, tracers: [], shells: [], smoke: [], dust: [], parts: [], rammer: null, wheel: null, off: rnd() * 100 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), base = 0.72 * N;
    const dune = (x) => base - Math.sin((x + w.off * N) * (TAU / (0.45 * N))) * 0.06 * N - Math.sin((x + w.off * N) * (TAU / (0.17 * N)) + 1) * 0.022 * N;
    const farDune = (x) => 0.6 * N - Math.sin(x * (TAU / (0.7 * N)) + 2) * 0.03 * N - Math.sin(x * (TAU / (0.23 * N))) * 0.01 * N;
    for (const h of hits) {
      if (h.kind === 'hat') { const rg = pick(rnd, w.rigs), R = RIGS[rg.kind]; w.tracers.push({ x: rg.x * N + R.len * N * 0.3, y: rg.y - R.hgt * N * 0.6, vx: 2 * N, vy: -(0.1 + rnd() * 0.3) * N }); }
      else if (isLow(h)) for (const rg of w.rigs) if (RIGS[rg.kind].gun === 2) { // the big guns, the recoil into the springs
        const R = RIGS[rg.kind], mx = rg.x * N + R.len * N * 0.35, my = rg.y - R.hgt * N * 1.3;
        w.shells.push({ x: mx, y: my, vx: 1.1 * N, vy: -0.55 * N });
        rg.vy += (0.5 * N) / R.mass; rg.flash = 0.07;
        s.shake = Math.max(s.shake, 0.2);
      } else if (h.kind === 'snare') { w.boost = 1; for (const rg of w.rigs) if (RIGS[rg.kind].claw) rg.snap = 0.4; }
    }
    if (f.section === 'drop' && !w.rammer) w.rammer = { ...newRig('truck', -0.25), vx: 0.45, va: 0, hit: false, life: 5 };
    else if (f.section === 'change') { w.mix = rollW(rnd, CONVOY_W, band); w.rigs.forEach((rg, i) => { rg.kind = CONVOYS[w.mix][i % CONVOYS[w.mix].length]; }); }
    w.boost *= Math.exp(-dt * 1.2);
    const v = (0.22 + 0.4 * clamp(f.rel.bassDrive) + 0.35 * w.boost) * N; // the speed of travel, in cells a second
    w.scroll += v * dt;
    const sc = w.scroll;
    // the sky and the low sun, the far dunes going by slow, the near dunes going by at speed, a crest line and lee shade
    r.disc(0.78 * N, 0.52 * N, 0.09 * N, HOT);
    r.disc(0.78 * N, 0.52 * N, 0.06 * N, BRIGHT);
    for (let x = 0; x < N; x++) { const y = farDune(x + sc * 0.3); r.rect(x, y, 1, N - y, DARK + DIM); for (let yy = y - 0.1 * N; yy < y; yy++) if (hash(x, yy | 0) < (yy - y + 0.1 * N) / (0.1 * N) * 0.5) r.set(x, yy, DARK + DIM); } // the far dunes under their haze
    if (!w.ys || w.ys.length !== N) w.ys = new Float32Array(N);
    const ys = w.ys;
    let prev = dune(sc - 1), lo = N, hi = 0;
    for (let x = 0; x < N; x++) { const y = dune(x + sc); ys[x] = y; lo = Math.min(lo, y); hi = Math.max(hi, y); }
    r.rect(0, hi, N, N - hi, MID);
    for (let y = Math.max(0, Math.floor(lo)); y < hi + 1 && y < N; y++) for (let x = 0; x < N; x++) if (y + 0.5 >= ys[x]) r.buf[y * N + x] = MID;
    for (let x = 0; x < N; x++) { const y = ys[x]; if (y > prev) r.rect(x, y, 1, 0.045 * N, MID + DIM); else r.rect(x, y, 1, px(u), LMID); prev = y; } // the lee of each crest in shade
    for (let i = 0; i < 40; i++) { const x = (((hash(i, 51) * 1.3 - sc / N) % 1.3) + 1.3) % 1.3 * N - 0.15 * N; r.rect(x, dune(x + sc) + 2 * u + hash(i, 52) * 0.2 * N, px(2 * u), px(u), MID + DIM); }
    // the rigs, rear to front: the wheels on the dune, the body on its springs under gravity, free in the air off a crest
    const drawRig = (rg, extraAng = 0) => {
      const R = RIGS[rg.kind], len = R.len * N, hgt = R.hgt * N, wr = R.wheel * N, X = rg.x * N;
      const x1 = X - R.wb * N * 0.5, x2 = X + R.wb * N * 0.5, y1 = dune(x1 + sc) - wr, y2 = dune(x2 + sc) - wr, gy = (y1 + y2) / 2;
      const kS = 60, cS = 6, rest = (G * N) / kS, target = gy - hgt * 0.5 - rest;
      if (rg.y === 0) { rg.y = target; rg.vy = 0; }
      const comp = rg.y - target;
      rg.vy += (G * N - (comp > 0 ? comp * kS + rg.vy * cS : 0)) * dt;
      rg.y += rg.vy * dt;
      const air = rg.y < target - rest * 0.8, want = air ? rg.ang : Math.atan2(y2 - y1, x2 - x1);
      rg.ang = follow(rg.ang, want, dt, 0.12) + extraAng;
      rg.spin += (v * dt) / wr;
      rg.flash -= dt; rg.snap -= dt;
      const cy = rg.y, c = Math.cos(rg.ang), sn = Math.sin(rg.ang);
      shadow(r, X, gy + wr, len * 0.45, DARK);
      for (const [wx, wy] of [[x1, air ? cy + hgt * 0.5 + rest : y1], [x2, air ? cy + hgt * 0.5 + rest : y2]]) {
        r.ring(wx, wy, wr * 0.75, wr * 0.5, DARK);
        r.line(wx - Math.cos(rg.spin) * wr * 0.7, wy - Math.sin(rg.spin) * wr * 0.7, wx + Math.cos(rg.spin) * wr * 0.7, wy + Math.sin(rg.spin) * wr * 0.7, LMID);
        r.line(wx + Math.sin(rg.spin) * wr * 0.7, wy - Math.cos(rg.spin) * wr * 0.7, wx - Math.sin(rg.spin) * wr * 0.7, wy + Math.cos(rg.spin) * wr * 0.7, LMID);
        if (!air && v > 0.1 * N && rnd() < dt * 8) w.dust.push({ x: wx - wr, y: wy + wr, vx: -v * 0.4 - rnd() * 0.1 * N, vy: -(0.05 + rnd() * 0.1) * N, life: 0.6 });
      }
      const body = rot([[-len * 0.5, 0], [len * 0.45, 0], [len * 0.5, -hgt * 0.5], [len * 0.2, -hgt], [-len * 0.35, -hgt], [-len * 0.5, -hgt * 0.6]], X, cy + hgt * 0.5, rg.ang);
      r.poly(body, rg.flash > 0 ? LMID : FIG);
      for (let i = 0; i < R.spikes; i++) { const sx = -len * 0.3 + (i / Math.max(1, R.spikes - 1)) * len * 0.45; r.poly(rot([[sx - 1.5 * u, -hgt], [sx + 1.5 * u, -hgt], [sx, -hgt - 4 * u]], X, cy + hgt * 0.5, rg.ang), LMID); }
      const [[ex, ey]] = rot([[-len * 0.42, -hgt]], X, cy + hgt * 0.5, rg.ang);
      r.rect(ex - u, ey - 4 * u, 2 * u, 4 * u, DARK);
      if (rnd() < dt * (4 + 8 * clamp(f.rel.bassDrive)) && w.smoke.length < 150) w.smoke.push({ x: ex, y: ey - 4 * u, vx: -v - rnd() * 0.05 * N, vy: -(0.1 + rnd() * 0.08) * N, life: 1.2 + rnd() * 0.6 });
      if (R.gun === 2) { const [[gx, gy2], [mx, my]] = rot([[len * 0.02, -hgt], [len * 0.35, -hgt * 1.3]], X, cy + hgt * 0.5, rg.ang); r.stroke(gx, gy2, mx, my, px(2.2 * u), DARK); r.rect(gx - 3 * u, gy2 - 3 * u, 6 * u, 4 * u, DARK); if (rg.flash > 0) r.disc(mx, my, 3 * u, BRIGHT); }
      else if (R.gun === 1) { const [[gx, gy2], [mx, my]] = rot([[len * 0.05, -hgt], [len * 0.3, -hgt * 1.1]], X, cy + hgt * 0.5, rg.ang); r.stroke(gx, gy2, mx, my, px(1.3 * u), DARK); }
      if (R.claw) { // the claw out front: open with the beat, snapping shut on a snare
        const open = rg.snap > 0 ? 0.05 : 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(f.beat.phase * TAU)), [[ax, ay], [bx, by]] = rot([[len * 0.5, -hgt * 0.7], [len * 0.75, -hgt * 0.5]], X, cy + hgt * 0.5, rg.ang);
        r.stroke(ax, ay, bx, by, px(2 * u), DARK);
        for (const sgn of [-1, 1]) r.stroke(bx, by, bx + Math.cos(rg.ang + sgn * open) * len * 0.15, by + Math.sin(rg.ang + sgn * open) * len * 0.15, px(1.8 * u), rg.snap > 0 ? BRIGHT : LMID);
        if (rg.snap > 0.3) burst(w.dust, rnd, bx + Math.cos(rg.ang) * len * 0.15, by, 3, 0.15 * N, BRIGHT, 0.3);
      }
      r.rect(body[1][0] - 2 * u, body[1][1] - hgt * 0.35, 2 * u, px(u), f.beat.pulse > 0.5 ? BRIGHT : HOT); // the headlamp
      targets.push({ x: X - len * 0.5, y: cy - hgt * 0.6, w: len, h: hgt * 1.6 + wr });
      return { tail: X - len * 0.5, nose: X + len * 0.5, cy };
    };
    for (const rg of w.rigs) drawRig(rg);
    // the rammer: in from behind, into the rear rig, over it goes, the parts flying; then it sits in the sand and goes by
    if (w.rammer) {
      const Rm = w.rammer, rear = w.rigs[w.rigs.length - 1], R = RIGS[rear.kind];
      Rm.life -= dt;
      if (!Rm.hit) {
        Rm.x += Rm.vx * dt;
        if (Rm.x * N + RIGS.truck.len * N * 0.5 >= rear.x * N - R.len * N * 0.5) {
          Rm.hit = true; Rm.vx = 0.05; Rm.va = -4; Rm.vy = -0.5 * N; Rm.airT = 0;
          rear.vy -= 0.25 * N; rear.ang -= 0.2;
          s.shake = Math.max(s.shake, 0.9);
          const hx = rear.x * N - R.len * N * 0.5, hy = rear.y;
          for (let i = 0; i < 24; i++) w.parts.push({ x: hx, y: hy, vx: (rnd() - 0.5) * 0.8 * N, vy: -rnd() * 0.7 * N, life: 1 + rnd(), c: i % 4 === 0 ? HOT : i % 4 === 1 ? LMID : FIG });
          w.wheel = { x: hx, y: hy, vx: -0.1 * N, vy: -0.55 * N, r: RIGS.truck.wheel * N, spin: 0, bounces: 0 };
        }
        drawRig(Rm);
      } else { // tumbling under gravity, then down for good
        Rm.vx *= Math.exp(-dt * 2); Rm.x += (Rm.vx - v / N) * dt;
        Rm.airT += dt;
        const R2 = RIGS.truck, X = Rm.x * N, gy = dune(X + sc) - R2.wheel * N - R2.hgt * N * 0.5;
        if (Rm.airT < 0.6 || Rm.y < gy) { Rm.vy += G * N * dt; Rm.y += Rm.vy * dt; Rm.ang += Rm.va * dt; Rm.va *= Math.exp(-dt * 0.5); }
        if (Rm.y >= gy && Rm.airT >= 0.6) { if (Rm.vy > 0.2 * N) { burst(w.dust, rnd, X, gy + R2.hgt * N, 10, 0.3 * N, MID, 0.5); s.shake = Math.max(s.shake, 0.4); } Rm.y = gy; Rm.vy = 0; Rm.va = 0; Rm.ang = follow(Rm.ang, Math.round(Rm.ang / Math.PI) * Math.PI, dt, 0.2); }
        const body = rot([[-R2.len * N * 0.5, 0], [R2.len * N * 0.45, 0], [R2.len * N * 0.5, -R2.hgt * N * 0.5], [R2.len * N * 0.2, -R2.hgt * N], [-R2.len * N * 0.35, -R2.hgt * N]], X, Rm.y + R2.hgt * N * 0.5, Rm.ang);
        r.poly(body, LMID + DIM);
        for (let i = 0; i < 3; i++) r.rect(X + (rnd() - 0.5) * R2.len * N * 0.5, Rm.y - rnd() * 4 * u, 2 * u, 2 * u, i ? HOT : BRIGHT);
        if (rnd() < dt * 8) w.smoke.push({ x: X, y: Rm.y - 2 * u, vx: -v, vy: -0.15 * N, life: 1.5 });
      }
      if (Rm.life <= 0 || Rm.x < -0.4) w.rammer = null;
    }
    if (w.wheel) { // the wheel that came off: it flies, bounces losing speed, rolls, and goes by with the ground
      const wh = w.wheel, gy = dune(wh.x + sc) - wh.r;
      wh.vy += G * N * dt; wh.x += (wh.vx - v) * dt; wh.y += wh.vy * dt; wh.spin += ((wh.vx - v) * dt) / wh.r;
      if (wh.y >= gy) { wh.y = gy; if (wh.vy > 0.15 * N && wh.bounces < 3) { wh.vy = -wh.vy * 0.45; wh.bounces++; } else wh.vy = 0; wh.vx *= 0.9; }
      r.ring(wh.x, wh.y, wh.r * 0.75, wh.r * 0.5, DARK);
      r.line(wh.x - Math.cos(wh.spin) * wh.r * 0.7, wh.y - Math.sin(wh.spin) * wh.r * 0.7, wh.x + Math.cos(wh.spin) * wh.r * 0.7, wh.y + Math.sin(wh.spin) * wh.r * 0.7, LMID);
      if (wh.x < -0.1 * N) w.wheel = null;
    }
    // the shells on their arcs, the tracers on their lines, both into the sand where they come down; the smoke and dust
    w.shells = w.shells.filter((sh) => { sh.vy += G * N * dt; sh.x += (sh.vx - v) * dt; sh.y += sh.vy * dt; r.disc(sh.x, sh.y, 1.5 * u, LMID); if (sh.y >= dune(sh.x + sc)) { burst(w.dust, rnd, sh.x, sh.y, 14, 0.35 * N, MID, 0.6); burst(w.parts, rnd, sh.x, sh.y, 6, 0.3 * N, HOT, 0.4); s.shake = Math.max(s.shake, 0.3); return false; } return sh.x < 1.1 * N; });
    w.tracers = w.tracers.filter((tr) => { tr.x += (tr.vx - v) * dt; tr.y += tr.vy * dt; r.stroke(tr.x, tr.y, tr.x - 5 * u, tr.y + 1.2 * u, px(u), HOT); r.rect(tr.x, tr.y, px(u), px(u), BRIGHT); if (tr.y >= dune(tr.x + sc)) { burst(w.dust, rnd, tr.x, tr.y, 3, 0.12 * N, MID, 0.3); return false; } return tr.x < 1.1 * N && tr.y > -0.1 * N; });
    w.smoke = w.smoke.filter((p) => { p.vy = follow(p.vy, -0.02 * N, dt, 0.8); p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; r.rect(p.x, p.y, 2 * u, 2 * u, p.life > 0.8 ? DARK : DARK + DIM); return p.life > 0 && p.x > -0.1 * N; });
    for (const p of w.dust) p.x -= v * dt * 0.5;
    w.dust = particles(W, w.dust, MID + DIM);
    w.parts = particles(W, w.parts, LMID);
    if (w.dust.length > 250) w.dust.splice(0, w.dust.length - 250);
  },
};

// ---------------------------------------------------------------------------------------------- the inquest
// A candlelit chamber: shelves of books, a cloaked investigator with a lantern whose light reaches with the bass,
// servo-skulls (a skull, an antenna, one lit eye, a thruster under it) that lift on the beat, strips of parchment
// with wax seals swaying from the shelves, candles that gutter on the hats. A snare sends a rat along the skirting,
// a note sends a skull to a new spot; a drop lights the sigil hidden in the floor, a spiked circle, for two bars.
// Chambers: the library, the archive of hanging scrolls, the bare cell with its chains.
const CHAMBERS = {
  library: { shelves: 3, strips: 3, skulls: 2, chains: 0 },
  archive: { shelves: 1, strips: 7, skulls: 2, chains: 0 },
  cell: { shelves: 0, strips: 1, skulls: 3, chains: 3 },
};
const CHAMBER_W = { library: [3, 2, 1], archive: [2, 2, 2], cell: [1, 2, 3] };
// what the lantern makes of every role inside its reach
const LIT = Uint8Array.from([DARK, FIG, MID, LMID, BRIGHT, BRIGHT, HOT, COOL, BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, BLACK, WHITE]);
function inquestBuild(w, rnd, N, kind) {
  const C = CHAMBERS[kind];
  w.kind = kind;
  w.shelves = Array.from({ length: C.shelves }, (_, i) => ({ x: 0.5 + i * 0.17 + rnd() * 0.03, y: 0.2 + rnd() * 0.1, rows: 3 + Math.floor(rnd() * 2) }));
  w.strips = Array.from({ length: C.strips }, (_, i) => ({ x: 0.45 + ((i + rnd() * 0.5) / C.strips) * 0.5, y: 0.12, len: 0.1 + rnd() * 0.14, ph: rnd() * TAU, amp: 0.05 + rnd() * 0.05 }));
  w.chains = Array.from({ length: C.chains }, (_, i) => ({ x: 0.55 + i * 0.15 + rnd() * 0.05, len: 0.2 + rnd() * 0.2, ph: rnd() * TAU, amp: 0.04 }));
  w.candles = Array.from({ length: 3 }, (_, i) => ({ x: 0.5 + i * 0.2 + rnd() * 0.05, y: C.shelves ? 0.2 + rnd() * 0.3 : 0.62 }));
  while (w.skulls.length < C.skulls) w.skulls.push({ x: 0.4 + rnd() * 0.5, y: 0.3 + rnd() * 0.2, tx: 0.4 + rnd() * 0.5, ty: 0.3 + rnd() * 0.2, ph: rnd() * TAU });
  w.skulls.length = C.skulls;
}

const inquest = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { skulls: [], rat: null, sigil: 0, gutter: 0, lantA: 0.2, lantV: 0, bump: 0, motes: Array.from({ length: 24 }, () => ({ x: rnd(), y: rnd(), s: rnd() * TAU })) });
    inquestBuild(w, rnd, N, rollW(rnd, CHAMBER_W, band));
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, g = 0.8 * N, tt = t * 15 | 0, buf = r.buf;
    for (const h of hits) {
      if (h.kind === 'hat') w.gutter = 0.3;
      else if (h.kind === 'snare' && !w.rat) w.rat = { x: -0.05, t: 0 };
      else if (isLow(h)) { w.bump = Math.max(w.bump, 0.5 * h.strength); w.lantV += 0.8 * h.strength; }
      else if (isTonal(h)) { const sk = pick(rnd, w.skulls); sk.tx = 0.38 + rnd() * 0.55; sk.ty = 0.25 + rnd() * 0.3; }
    }
    if (f.section === 'drop') w.sigil = 8 / bps;
    else if (f.section === 'change') inquestBuild(w, rnd, N, rollW(rnd, CHAMBER_W, band));
    w.gutter -= dt; w.sigil -= dt; w.bump *= Math.exp(-dt * 4);
    // the room in its own dark: the floor in planks, the skirting, the shelves and their books, the chains, the strips
    r.rect(0, g, N, N - g, DARK + DIM);
    for (let i = 0; i < 9; i++) r.rect(0, g + i * (N - g) / 9, N, px(u), BG);
    r.rect(0, g - 2 * u, N, 2 * u, DARK);
    for (const sh of w.shelves) {
      const X = sh.x * N, Y = sh.y * N, hgt = g - Y - 0.02 * N, wd = 0.13 * N;
      r.rect(X - u, Y, wd + 2 * u, hgt, DARK);
      for (let k = 0; k < sh.rows; k++) {
        const ry = Y + ((k + 1) / sh.rows) * hgt - 2 * u;
        r.rect(X, ry, wd, px(1.5 * u), MID + DIM);
        for (let b = 0, bx = X + u; bx < X + wd - 2 * u; b++) { const bw = 2 * u + hash(b + k * 7, sh.x * 100 | 0) * 2 * u, bh = 5 * u + hash(b, k + (sh.x * 100 | 0)) * 4 * u; if (hash(b, k * 3) < 0.85) r.rect(bx, ry - bh, bw, bh, hash(b * 5, k) < 0.2 ? HOT + DIM : hash(b * 5, k) < 0.5 ? MID + DIM : DARK); bx += bw + u; }
      }
    }
    for (const c of w.chains) { // a pendulum, its period from its length, pushed by the bass
      const len = c.len * N, om = Math.sqrt((G * N) / len);
      c.ph += dt * om; c.amp = Math.min(0.4, c.amp + w.bump * 0.01); c.amp *= Math.exp(-dt * 0.2);
      const a = c.amp * Math.sin(c.ph), X = c.x * N, ex = X + Math.sin(a) * len, ey = Math.cos(a) * len;
      for (let k = 0; k < 10; k++) r.stroke(lerp(X, ex, k / 10), lerp(0, ey, k / 10), lerp(X, ex, (k + 1) / 10), lerp(0, ey, (k + 1) / 10), k % 2 ? px(1.6 * u) : px(u), MID + DIM);
      r.ring(ex, ey + 2 * u, 2.5 * u, px(u), MID);
    }
    if (w.strips.length) r.rect(0.42 * N, 0.12 * N - u, 0.56 * N, px(u), DARK); // the rail the parchment hangs from
    for (const st of w.strips) { // parchment hanging from the rail, swaying in the draught, a seal at the bottom
      const len = st.len * N, om = Math.sqrt((G * N) / len) * 0.8, a = st.amp * Math.sin(st.ph += dt * om) + 0.03 * Math.sin(t * 0.7), X = st.x * N, Y = st.y * N, ex = X + Math.sin(a) * len, ey = Y + Math.cos(a) * len;
      r.stroke(X, Y, ex, ey, px(3 * u), LMID + DIM);
      r.rect(X - u, Y - u, 2 * u, 2 * u, MID);
      r.disc(ex, ey, 1.6 * u, HOT + DIM);
    }
    for (const c of w.candles) { r.rect(c.x * N - u, c.y * N - 5 * u, 2 * u, 5 * u, LMID); }
    // the investigator, the lantern on its chain from the hand: a pendulum the bass pushes
    const ix = 0.3 * N, ih = 0.28 * N, J = hooded(r, ix, g, ih, MID, 0.05);
    r.stroke(J.sx, J.sy, J.sx + ih * 0.18, J.sy + ih * 0.12, px(2 * u), MID);
    const hx = J.sx + ih * 0.18, hy = J.sy + ih * 0.12, cl = 0.05 * N, om = Math.sqrt((G * N) / cl);
    w.lantV -= (w.lantA * om * om + w.lantV * 0.4) * dt; w.lantA += w.lantV * dt;
    const lx = hx + Math.sin(w.lantA) * cl, ly = hy + Math.cos(w.lantA) * cl;
    r.line(hx, hy, lx, ly, LMID + DIM);
    // the skulls: toward their spots, up on the beat from the thruster under them
    for (const sk of w.skulls) {
      sk.x = follow(sk.x, sk.tx, dt, 1.5); sk.y = follow(sk.y, sk.ty, dt, 1.5);
      sk.ph += dt;
      const X = sk.x * N, Y = sk.y * N - f.beat.pulse * 3 * u + Math.sin(sk.ph * 2) * u;
      r.disc(X, Y, 3 * u, LMID);
      r.rect(X - 2 * u, Y + 2 * u, 4 * u, 2 * u, LMID);
      r.rect(X - 2.2 * u, Y - u, px(1.4 * u), px(1.4 * u), BLACK);
      r.rect(X + 0.6 * u, Y - u, px(1.4 * u), px(1.4 * u), f.beat.pulse > 0.5 ? BRIGHT : HOT);
      r.rect(X, Y - 8 * u, px(u), 5 * u, MID);
      r.rect(X, Y - 9 * u, px(u), px(u), (t * 4 | 0) % 2 ? COOL : COOL + DIM);
      r.rect(X - u, Y + 4 * u, 2 * u, px(u), hash(sk.ph * 50 | 0, 1) < 0.6 ? HOT : BRIGHT);
      r.line(X + 2 * u, Y + 3 * u, X + 5 * u, Y + 7 * u, MID + DIM);
      targets.push({ x: X - 4 * u, y: Y - 9 * u, w: 8 * u, h: 14 * u });
    }
    // the rat along the skirting to its hole; the sigil in the floor when a drop lights it
    if (w.rat) {
      const rt = w.rat;
      rt.x += dt * 0.35; rt.t += dt;
      const X = rt.x * N, Y = g - 1.5 * u;
      r.ring(X, Y, 1.5 * u, 3 * u, MID + DIM, 0.5);
      r.disc(X + 3 * u, Y, 1.2 * u, MID + DIM);
      r.line(X - 3 * u, Y, X - 7 * u, Y - Math.sin(rt.t * 12) * 1.5 * u, MID + DIM);
      for (const k of [-1.5, 1.5]) r.rect(X + k * u + Math.sin(rt.t * 25 + k) * u, Y + 1.5 * u, px(u), px(u), MID + DIM);
      if (rt.x > 0.92) w.rat = null;
    }
    r.ring(0.93 * N, g - u, 2.5 * u, 2.5 * u, BLACK, 0.8); // the hole
    if (w.sigil > 0) {
      const k = Math.min(1, w.sigil * 2, (8 / bps - w.sigil) * 2), cx = 0.6 * N, cy = 0.9 * N, R = 0.16 * N * k, rotA = t * 0.3, c = f.beat.pulse > 0.5 ? BRIGHT : COOL;
      for (let y = cy - R * 0.35; y <= cy + R * 0.35; y++) for (let x = cx - R; x <= cx + R; x++) if (((x - cx) / R) ** 2 + ((y - cy) / (R * 0.35)) ** 2 < 1 && hash(x | 0, (y | 0) + tt) < 0.25) r.set(x, y, COOL + DIM);
      r.ring(cx, cy, R, px(1.2 * u), c, 0.35);
      r.ring(cx, cy, R * 0.55, px(u), c, 0.35);
      for (let i = 0; i < 8; i++) { const a = rotA + (i / 8) * TAU, ca = Math.cos(a), sa = Math.sin(a) * 0.35; r.poly([[cx + ca * R - sa * 4 * u, cy + sa * R + ca * 1.4 * u], [cx + ca * R + sa * 4 * u, cy + sa * R - ca * 1.4 * u], [cx + ca * R * 1.35, cy + sa * R * 1.35]], c); }
    }
    // the light: everything inside the lantern's reach lifted a step, the fringe dithered; then what burns on its own
    const R = (0.2 + 0.14 * clamp(f.rel.bassDrive) + 0.1 * w.bump) * N, R2 = R * R, Ri = R * 0.72, x0 = Math.max(0, lx - R | 0), x1 = Math.min(N - 1, lx + R | 0), y0 = Math.max(0, ly - R | 0), y1 = Math.min(N - 1, ly + R | 0);
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - ly, row = y * N;
      for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - lx, d2 = dx * dx + dy * dy; if (d2 < R2) { const d = Math.sqrt(d2); if (d < Ri || hash(x, y) < (R - d) / (R - Ri)) buf[row + x] = LIT[buf[row + x]]; } }
    }
    for (const mt of w.motes) { mt.y -= dt * 0.004; mt.x += Math.sin(t * 0.5 + mt.s) * dt * 0.01; if (mt.y < 0) mt.y = 1; const X = mt.x * N, Y = mt.y * N; if ((X - lx) ** 2 + (Y - ly) ** 2 < R2 * 0.6) r.rect(X, Y, px(u), px(u), LMID + DIM); }
    r.frame(Math.round(lx - 2 * u), Math.round(ly - 3 * u), Math.round(4 * u), Math.round(6 * u), LMID);
    r.rect(lx - u, ly - 2 * u, 2 * u, 4 * u, w.bump > 0.2 ? BRIGHT : HOT);
    targets.push({ x: ix - ih * 0.3, y: g - ih, w: ih * 0.7, h: ih });
    for (const c of w.candles) { const fh = (w.gutter > 0 ? 1 + hash(c.x * 100 | 0, tt) * 2 : 2 + hash(c.x * 100 | 0, tt)) * u; r.rect(c.x * N - u * 0.5, c.y * N - 5 * u - fh, px(u), fh, HOT); r.rect(c.x * N - u * 0.5, c.y * N - 5 * u - fh - u, px(u), px(u), w.gutter > 0 && hash(c.x * 50 | 0, tt) < 0.5 ? HOT + DIM : BRIGHT); }
  },
};

// ---------------------------------------------------------------------------------------------- trench line
// A trench in the rain, seen from the side: the fire step, the parapet of sandbags, masked soldiers with their
// rifles over it. Hats are their shots, red streaks out to the right; kicks the shells coming in on their arcs under
// gravity, each a crater, a burst of mud and a jolt; snares send a flare up that pops and comes down slowly under its
// chute. A drop sends a tank over: it bridges the gap, noses up onto the parapet, teeters and comes down on the far
// side. Sectors: a quiet one, a barrage, an assault with the enemy coming across the open ground.
const SECTORS = {
  quiet: { men: 3, shells: 1, wave: false },
  barrage: { men: 4, shells: 2, wave: false },
  assault: { men: 5, shells: 2, wave: true },
};
const SECTOR_W = { quiet: [3, 2, 1], barrage: [2, 2, 2], assault: [1, 2, 3] };

const trenchline = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { sector: rollW(rnd, SECTOR_W, band), men: Array.from({ length: 5 }, (_, i) => ({ x: 0.26 + i * 0.03, fire: 0, bolt: 0 })), rain: [], shells: [], craters: [], mud: [], flares: [], streaks: [], foes: [], tank: null, ripple: 0, boltI: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), S = SECTORS[w.sector], gs = 0.6 * N, gf = 0.86 * N, x1 = 0.22 * N, x2 = 0.42 * N, pH = 0.06 * N, tt = t * 10 | 0;
    const men = w.men.slice(0, S.men);
    for (const h of hits) {
      if (h.kind === 'hat') { const m = pick(rnd, men); m.fire = 0.08; const mx = m.x * N + 0.12 * N, my = gs - 0.06 * N; w.streaks.push({ x: mx, y: my, vx: 3 * N, vy: -0.15 * N }); }
      else if (isLow(h)) for (let k = 0; k < S.shells; k++) { // in from the upper right on a true arc, down in the open ground or on the parapet
        const xl = rnd() < 0.25 ? x2 + (rnd() - 0.3) * 0.08 * N : (0.5 + rnd() * 0.48) * N, vy0 = 0.3 * N, drop = gs + 0.1 * N, T = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * G * N * drop)) / (G * N);
        w.shells.push({ x: xl + 0.35 * N, y: -0.1 * N, vx: -0.35 * N / T, vy: vy0, xl });
      } else if (h.kind === 'snare' && w.flares.length < 3) w.flares.push({ x: 0.3 * N, y: gs + 0.05 * N, vx: 0.25 * N, vy: -1 * N, chute: false, sway: rnd() * TAU });
    }
    if (f.section === 'drop' && !w.tank) w.tank = { x: -0.25 * N, slam: false, th: 0, om: 0 };
    else if (f.section === 'change') w.sector = rollW(rnd, SECTOR_W, band);
    if (f.beat.on) { w.ripple = 1; men[w.boltI++ % men.length].bolt = 0.3; }
    w.ripple *= Math.exp(-dt * 4);
    if (S.wave && w.foes.length < 4 && rnd() < dt * 0.4) w.foes.push({ x: 1.05, ph: rnd() * TAU, down: 0 });
    // the ground: the near side, the trench cut into it, the open ground beyond, the craters, the parapet on the lip
    r.rect(0, gs, N, N - gs, MID);
    for (let i = 0; i < 25; i++) r.rect(hash(i, 61) * N, gs + hash(i, 62) * (N - gs), px(2 * u), px(u), DARK);
    for (const c of w.craters) { r.ring(c.x, c.y, c.w * 0.5, c.w, DARK, 0.35); r.ring(c.x, c.y - u, c.w, px(1.5 * u), MID + DIM, 0.3); } // each on the ground the shell found: the open ground, the parapet, the trench floor
    r.rect(x1, gs, x2 - x1, gf - gs, DARK + DIM);
    for (let y = gs; y < gf; y += 3 * u) { r.rect(x1, y, px(u), 2 * u, MID + DIM); r.rect(x2 - u, y, px(u), 2 * u, MID + DIM); } // the revetment
    r.rect(x1, gf, x2 - x1, N - gf, DARK);
    for (let x = x1; x < x2; x += 2) if (((x / 2 | 0) + (w.ripple > 0.3 ? 1 : 0) + (t * 3 | 0)) % 3 === 0) r.rect(x, gf, 2, px(u), COOL + DIM); // the water in the bottom
    r.rect(x2 - 0.06 * N, gs + 0.1 * N, 0.06 * N, gf - gs - 0.1 * N, MID + DIM); // the fire step
    r.poly([[x2 - 2 * u, gs], [x2 + 0.12 * N, gs], [x2 + 0.09 * N, gs - pH * 0.6], [x2 + 0.02 * N, gs - pH * 0.6]], MID + DIM); // the parapet mound
    for (let k = 0; k < 3; k++) for (let i = 0; i < 4; i++) r.ring(x2 + (i + (k % 2) * 0.5) * 5 * u - 2 * u, gs - pH + k * 2.6 * u + 1.3 * u, 1.4 * u, 2.8 * u, k === 2 ? LMID + DIM : LMID, 0.5); // the sandbags
    // the men on the step, masks and helmets, rifles over the bags; one works the bolt on each beat
    men.forEach((m, i) => {
      m.fire -= dt; m.bolt -= dt;
      const X = m.x * N, base = gs + 0.1 * N, hgt = 0.2 * N, rec = m.fire > 0 ? 1.5 * u : 0, duck = i % 2 ? 0 : 1.5 * u;
      r.rect(X - hgt * 0.12, base - hgt * 0.72 + duck, hgt * 0.24, hgt * 0.72 - duck, LMID + DIM);
      r.disc(X, base - hgt * 0.82 + duck, hgt * 0.1, LMID + DIM);
      r.rect(X + hgt * 0.05, base - hgt * 0.8 + duck, hgt * 0.1, hgt * 0.06, DARK); // the snout of the mask
      r.rect(X + hgt * 0.02, base - hgt * 0.86 + duck, px(1.2 * u), px(1.2 * u), COOL);
      r.rect(X - hgt * 0.14, base - hgt * 0.93 + duck, hgt * 0.28, hgt * 0.05, DARK);
      r.stroke(X - rec, base - hgt * 0.72 + duck, X + 0.12 * N - rec, base - hgt * 0.72 + duck - 0.02 * N, px(1.4 * u), DARK);
      if (m.bolt > 0) r.rect(X + 2 * u - (0.3 - m.bolt) * 10 * u, base - hgt * 0.75 + duck, 2 * u, px(u), LMID);
      if (m.fire > 0) r.disc(X + 0.12 * N, base - hgt * 0.72 + duck - 0.02 * N, 2.5 * u, BRIGHT);
      targets.push({ x: X - hgt * 0.15, y: base - hgt * 0.95, w: hgt * 0.3, h: hgt * 0.5 });
    });
    // the enemy coming across the open ground, dropped by the streaks that reach them
    w.foes = w.foes.filter((fo) => {
      if (fo.down > 0) { fo.down -= dt; r.rect(fo.x * N - 4 * u, gs - 2 * u, 8 * u, 2 * u, DARK); return fo.down > 0; }
      fo.x -= dt * 0.03; fo.ph += dt * 6;
      const X = fo.x * N, hgt = 0.11 * N;
      r.rect(X - hgt * 0.12, gs - hgt * 0.7, hgt * 0.24, hgt * 0.7, MID + DIM);
      r.disc(X, gs - hgt * 0.8, hgt * 0.1, MID + DIM);
      for (const k of [-1, 1]) r.rect(X + k * hgt * 0.06 - u + Math.sin(fo.ph + (k > 0 ? 0 : Math.PI)) * hgt * 0.08, gs - hgt * 0.3, 2 * u, hgt * 0.3, MID + DIM);
      targets.push({ x: X - hgt * 0.2, y: gs - hgt, w: hgt * 0.4, h: hgt });
      return fo.x > x2 / N + 0.08;
    });
    // the streaks out to the right, the shells down their arcs, the craters they leave, the mud they throw
    w.streaks = w.streaks.filter((st) => {
      st.x += st.vx * dt; st.y += st.vy * dt;
      r.stroke(st.x - 8 * u, st.y + 0.4 * u, st.x, st.y, px(u), HOT);
      const fo = w.foes.find((q) => q.down <= 0 && Math.abs(q.x * N - st.x) < 4 * u && st.y > gs - 0.12 * N);
      if (fo) { fo.down = 3; burst(w.mud, rnd, st.x, st.y, 4, 0.15 * N, DARK, 0.3); return false; }
      return st.x < 1.1 * N && st.y > -0.1 * N;
    });
    w.shells = w.shells.filter((sh) => {
      sh.vy += G * N * dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      r.disc(sh.x, sh.y, 1.5 * u, DARK);
      r.line(sh.x, sh.y, sh.x - sh.vx * 0.04, sh.y - sh.vy * 0.04, LMID + DIM);
      const land = sh.x > x2 ? gs - (sh.x < x2 + 0.1 * N ? pH : 0) : sh.x > x1 ? gf : gs;
      if (sh.y >= land) {
        w.craters.push({ x: sh.x, y: land, w: (0.03 + rnd() * 0.03) * N });
        if (w.craters.length > 10) w.craters.shift();
        for (let i = 0; i < 18; i++) w.mud.push({ x: sh.x, y: land, vx: (rnd() - 0.5) * 0.6 * N, vy: -rnd() * 0.7 * N, life: 0.6 + rnd() * 0.6, c: i % 3 ? DARK : MID });
        r.disc(sh.x, land - 2 * u, 5 * u, BRIGHT);
        s.shake = Math.max(s.shake, 0.5);
        return false;
      }
      return true;
    });
    w.mud = particles(W, w.mud, DARK);
    // the tank: across the gap on its length, the nose up the face of the mound with the rear on the ground, over the
    // crest on its belly; once its weight is past the crest it tips about it under gravity, faster and faster, till
    // the nose meets the far ground (the slam), then it slides off the crest and the rear comes down the far face
    if (w.tank) {
      const T = w.tank, L = 0.3 * N, half = L * 0.5, v = 0.16 * N, xc = x2 + 0.05 * N;
      T.x += v * dt;
      const c = T.x, nose = c + half, rear = c - half;
      let th, cy; // the pitch, nose up positive, and the height of the hull's middle
      if (nose < xc) { const hn = pH * clamp((nose - x2) / (xc - x2)); th = Math.asin(hn / L); cy = gs - half * Math.sin(th); }
      else if (c <= xc) { th = Math.asin(Math.min(1, pH / (xc - rear))); cy = gs - half * Math.sin(th); T.th = th; T.om = 0; }
      else if (!T.slam) {
        T.om += ((12 * G * N * (c - xc)) / (L * L)) * Math.cos(T.th) * dt; T.th -= T.om * dt; // a plank on a fulcrum: the torque of the overhang
        const land = -Math.asin(Math.min(1, pH / (c - xc + half)));
        if (T.th <= land) { T.th = land; T.slam = true; s.shake = Math.max(s.shake, 0.6); burst(w.mud, rnd, c + half * Math.cos(land), gs, 12, 0.3 * N, DARK, 0.5); }
        th = T.th; cy = gs - pH + (xc - c) * Math.sin(th);
      } else if (rear < xc) { th = -Math.asin(Math.min(1, pH / (c - xc + half))); cy = gs - pH + (xc - c) * Math.sin(th); }
      else { const q = ease(clamp((rear - xc) / (0.06 * N))); th = -Math.asin(Math.min(1, pH / L)) * (1 - q); cy = gs - pH * 0.5 * (1 - q); }
      const hull = rot([[-L * 0.5, 0], [L * 0.5, 0], [L * 0.5, -0.05 * N], [L * 0.4, -0.08 * N], [-L * 0.45, -0.08 * N]], c, cy, -th);
      r.poly(hull, MID + DIM);
      r.poly(rot([[-L * 0.15, -0.08 * N], [L * 0.12, -0.08 * N], [L * 0.1, -0.13 * N], [-L * 0.12, -0.13 * N]], c, cy, -th), MID);
      const [[gx0, gy0], [gx1, gy1], [e0x, e0y], [e1x, e1y]] = rot([[L * 0.1, -0.11 * N], [L * 0.55, -0.12 * N], [-L * 0.45, -0.08 * N], [L * 0.4, -0.08 * N]], c, cy, -th);
      r.stroke(gx0, gy0, gx1, gy1, px(1.5 * u), MID);
      r.line(e0x, e0y, e1x, e1y, LMID + DIM); // the lit top edge
      const links = rot(Array.from({ length: 14 }, (_, i) => [-L * 0.48 + ((i + ((T.x / (1.5 * u)) % 2)) / 14) * L * 0.96, -u]), c, cy, -th);
      links.forEach(([lx, ly], i) => r.rect(lx, ly, px(1.5 * u), px(u), i % 2 ? MID : LMID + DIM));
      targets.push({ x: c - L * 0.5, y: cy - 0.14 * N, w: L, h: 0.14 * N });
      if (T.x > 1.3 * N) w.tank = null;
    }
    // the flares: up on a true arc, a pop at the top, then down slow and swaying under the chute, lighting the rain
    w.flares = w.flares.filter((fl) => {
      if (!fl.chute) { fl.vy += G * N * dt; fl.x += fl.vx * dt; fl.y += fl.vy * dt; r.line(fl.x, fl.y, fl.x - fl.vx * 0.05, fl.y - fl.vy * 0.05, LMID); if (fl.vy >= 0) { fl.chute = true; r.disc(fl.x, fl.y, 4 * u, BRIGHT); } return true; }
      fl.sway += dt * 1.5; fl.y += 0.035 * N * dt; fl.x += Math.sin(fl.sway) * 0.02 * N * dt;
      const R = 0.11 * N;
      for (let y = fl.y - R; y <= fl.y + R; y++) for (let x = fl.x - R; x <= fl.x + R; x++) { const d2 = (x - fl.x) ** 2 + (y - fl.y) ** 2; if (d2 < R * R && hash(x | 0, (y | 0) + tt) < 0.25 * (1 - d2 / (R * R))) r.set(x, y, LMID + DIM); }
      r.ring(fl.x, fl.y - 5 * u, 4 * u, px(u), LMID, 0.6);
      for (const k of [-4, 4]) r.line(fl.x + k * u, fl.y - 5 * u, fl.x, fl.y, LMID + DIM);
      r.disc(fl.x, fl.y, 1.8 * u, BRIGHT);
      r.rect(fl.x - u, fl.y + 2 * u, 2 * u, 2 * u, HOT);
      targets.push({ x: fl.x - 5 * u, y: fl.y - 7 * u, w: 10 * u, h: 12 * u });
      return fl.y < gs - 2 * u;
    });
    // the rain: a slant of streaks at one speed, more of it with the level, each gone where it meets the ground
    const want = Math.round((30 + 70 * f.level) * u);
    while (w.rain.length < want) w.rain.push({ x: rnd() * 1.2 * N, y: rnd() * N });
    if (w.rain.length > want) w.rain.length = want;
    for (const d of w.rain) {
      d.x -= 0.18 * N * dt; d.y += 1.3 * N * dt;
      const land = d.x > x1 && d.x < x2 ? gf : gs;
      if (d.y > land || d.x < 0) { d.x = rnd() * 1.2 * N; d.y = -rnd() * 0.2 * N; }
      r.line(d.x, d.y, d.x + 0.6 * u, d.y - 4 * u, LMID + DIM);
    }
  },
};

// ---------------------------------------------------------------------------------------------- swarm tide
// A tide of chitin over the ridge at the right and down the slope at the firing line on the left, more of it with
// the energy: runners low on six legs, leapers that go in bounds (parabolas, landing back on the slope), spitters
// that stop and lob acid on arcs. Hats are the line's rifles, tracers up the slope that drop the first thing in the
// way; kicks the cannon, a shell with a blast; snares the flamer, a fan of fire swept up the slope that drops what it
// touches. A drop brings the bio-tank over the ridge, a hill of plates on many legs. Broods: the skitter, the mixed, the tide.
const BUGS = {
  runner: { sz: 0.07, v: 0.22, hp: 1 }, // low, six legs, a tail
  leaper: { sz: 0.075, v: 0.18, hp: 1, leap: true }, // the same with the hind legs long: bounds
  spitter: { sz: 0.09, v: 0.12, hp: 2, spit: true }, // a swollen sac, stops at range and lobs acid
};
const BROODS = { skitter: { runner: 5, leaper: 1, spitter: 0 }, mixed: { runner: 3, leaper: 2, spitter: 1 }, tide: { runner: 4, leaper: 3, spitter: 2 } };
const BROOD_W = { skitter: [3, 2, 1], mixed: [2, 2, 2], tide: [0, 1, 3] };

// a bug facing left at (x, y), sz across, its legs on ph; dead ones are a lump
function drawBug(r, K, x, y, sz, ph, u, col, dead) {
  if (dead) { r.ring(x, y, sz * 0.15, sz * 0.3, col, 0.4); return; }
  for (let i = 0; i < 6; i++) { // three pairs in a tripod gait: the odd legs half a cycle behind the even ones, every tripod moving as one
    const lx = x - sz * 0.25 + (i % 3) * sz * 0.25, sw = Math.sin(ph + (i % 2) * Math.PI) * sz * 0.28;
    r.stroke(lx, y - sz * 0.2, lx + sw, y, px(u), col);
  }
  r.ring(x, y - sz * 0.22, sz * 0.18, sz * 0.36, col, 0.55);
  r.rect(x - sz * 0.2, y - sz * 0.3, sz * 0.4, px(u), DARK); // the plate line
  if (K.spit) r.disc(x + sz * 0.2, y - sz * 0.38, sz * 0.18, COOL + DIM);
  r.disc(x - sz * 0.45, y - sz * 0.2, sz * 0.12, col);
  r.rect(x - sz * 0.5, y - sz * 0.24, px(u), px(u), HOT);
  for (const k of [-1, 1]) r.line(x - sz * 0.5, y - sz * 0.2, x - sz * 0.68, y - sz * 0.2 + k * sz * 0.1 * (1 + 0.5 * Math.sin(ph * 2)), col); // the mandibles
  r.line(x + sz * 0.3, y - sz * 0.25, x + sz * 0.6, y - sz * 0.45 + Math.sin(ph * 0.5) * sz * 0.1, col); // the tail
  for (const k of [-1, 1]) r.stroke(x - sz * 0.3, y - sz * 0.3, x - sz * 0.5 + k * sz * 0.05, y - sz * 0.55, px(u), col); // the claws up
}

const swarmtide = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { brood: rollW(rnd, BROOD_W, band), bugs: [], tracers: [], shells: [], acid: [], sparks: [], flame: 0, flameA: 0, line: Array.from({ length: 4 }, (_, i) => ({ x: 0.1 + i * 0.045, fire: 0 })), beast: null, ph: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, Br = BROODS[w.brood], tt = t * 8 | 0;
    const ground = (x) => (x < 0.3 * N ? 0.78 * N : x < 0.86 * N ? 0.78 * N - ((x - 0.3 * N) / (0.56 * N)) * 0.28 * N : 0.5 * N + ((x - 0.86 * N) / (0.14 * N)) * 0.12 * N);
    const slope = Math.atan2(-0.28, 0.56), aim = (x0, y0, x1, y1, Tt) => ({ vx: (x1 - x0) / Tt, vy: (y1 - y0) / Tt - 0.5 * G * N * Tt });
    const live = () => w.bugs.filter((b) => !b.dead);
    const kill = (b, burn) => { if (b.dead) return; b.dead = 1.2; b.burn = burn; b.vy = 0; burst(w.sparks, rnd, b.x, b.y - 2 * u, burn ? 6 : 4, 0.2 * N, burn ? HOT : COOL, 0.4); };
    const nozzle = { x: 0.27 * N, y: ground(0.27 * N) - 4 * u };
    for (const h of hits) {
      if (h.kind === 'hat' && w.tracers.length < 5) { // a rifle: the tracer at the first thing up the slope; most go over it into the ridge
        const m = pick(rnd, w.line), mx = m.x * N + 6 * u, my = ground(m.x * N) - 6 * u, miss = rnd() < 0.55, tg = w.beast && w.beast.hp > 0 && rnd() < 0.4 ? w.beast : miss ? null : live().filter((b) => b.x > mx + 0.05 * N).sort((a, b) => a.x - b.x)[0];
        const tx = tg ? tg.x : (0.6 + rnd() * 0.3) * N, ty = tg ? tg.y - (tg === w.beast ? 0.1 * N : 2 * u) : ground(tx), a = Math.atan2(ty - my, tx - mx);
        w.tracers.push({ x: mx, y: my, vx: Math.cos(a) * 3 * N, vy: Math.sin(a) * 3 * N, tg, tx, ty });
        m.fire = 0.06;
      } else if (isLow(h) && t - (w.cannonT || -9) > 0.5) { // the cannon into the thick of it, twice a second at most
        const L = live(), tx = w.beast && w.beast.hp > 0 ? w.beast.x : L.length ? L.reduce((q, b) => q + b.x, 0) / L.length : 0.6 * N, mx = 0.06 * N, my = ground(mx) - 8 * u;
        w.shells.push({ x: mx, y: my, ...aim(mx, my, tx, ground(tx), 0.6) });
        w.flashC = 0.08; w.cannonT = t;
        s.shake = Math.max(s.shake, 0.2);
      } else if (h.kind === 'snare' && w.flame <= -0.3) { w.flame = 0.4; w.flameA = -0.05; }
    }
    if (f.section === 'drop' && !w.beast) w.beast = { x: 1.15 * N, hp: 24, ph: 0, step: 0, sink: 0 };
    else if (f.section === 'change') w.brood = rollW(rnd, BROOD_W, band);
    w.flame -= dt; w.flashC = (w.flashC || 0) - dt;
    // the swarm comes over the ridge with the energy, a pulse of it on the beat
    const rate = 0.6 + 4 * f.level + 3 * clamp(f.rel.bassDrive), cap = 30 + 10 * band;
    if (f.beat.on) w.ph = 1;
    const spawn = () => { const kind = rollW(rnd, { runner: [Br.runner], leaper: [Br.leaper], spitter: [Br.spitter] }, 0); w.bugs.push({ kind, x: (1.02 + rnd() * 0.08) * N, y: 0, vy: 0, air: false, hp: BUGS[kind].hp, ph: rnd() * TAU, dead: 0, burn: false, spitT: rnd() * 2, stop: (0.5 + rnd() * 0.15) * N, sz: BUGS[kind].sz * N * (0.85 + rnd() * 0.3) }); };
    if (live().length < cap && rnd() < dt * rate) spawn();
    if (w.ph > 0 && live().length < cap) { w.ph = 0; if (f.level > 0.5) { spawn(); spawn(); } }
    // the sky lit low over the ridge, the slope and the ridge, the stones on it
    for (let y = Math.round(0.3 * N); y < 0.6 * N; y++) for (let x = Math.round(0.5 * N); x < N; x++) if (hash(x, y + tt) < ((y - 0.3 * N) / (0.3 * N)) * 0.35 * ((x - 0.5 * N) / (0.5 * N))) r.buf[y * N + x] = HOT + DIM;
    for (let x = 0; x < N; x++) { const gy = ground(x); r.rect(x, gy, 1, N - gy, MID); r.rect(x, gy, 1, px(u), LMID + DIM); }
    for (let i = 0; i < 20; i++) { const x = hash(i, 71) * N; r.rect(x, ground(x) + 2 * u + hash(i, 72) * 0.1 * N, px(2 * u), px(u), DARK); }
    // the line: men kneeling behind sandbags, the cannon at the left, the flamer at the right end
    for (let i = 0; i < 6; i++) r.ring(0.3 * N + i * 3 * u - 7 * u, ground(0.3 * N) - 1.2 * u, u, 2.5 * u, LMID + DIM, 0.5);
    for (const m of w.line) {
      m.fire -= dt;
      const X = m.x * N, gy = ground(X), hgt = 0.09 * N;
      r.rect(X - hgt * 0.15, gy - hgt * 0.6, hgt * 0.3, hgt * 0.6, MID);
      r.disc(X, gy - hgt * 0.7, hgt * 0.12, MID);
      r.rect(X - hgt * 0.17, gy - hgt * 0.82, hgt * 0.34, hgt * 0.06, LMID);
      r.stroke(X, gy - hgt * 0.55, X + 7 * u, gy - hgt * 0.55 + 7 * u * Math.tan(slope), px(1.3 * u), DARK);
      if (m.fire > 0) r.disc(X + 7.5 * u, gy - hgt * 0.55 + 7 * u * Math.tan(slope), 2 * u, BRIGHT);
    }
    const cx0 = 0.06 * N, cg = ground(cx0);
    r.rect(cx0 - 6 * u, cg - 4 * u, 12 * u, 4 * u, DARK);
    r.stroke(cx0, cg - 5 * u, cx0 + 10 * u, cg - 10 * u, px(2 * u), DARK);
    r.ring(cx0 - 3 * u, cg - 2 * u, 2 * u, 1.5 * u, MID);
    if (w.flashC > 0) r.disc(cx0 + 11 * u, cg - 10.5 * u, 3 * u, BRIGHT);
    targets.push({ x: 0.04 * N, y: ground(0.1 * N) - 0.1 * N, w: 0.26 * N, h: 0.12 * N });
    // the flamer: the fan sweeps up the slope while it burns; what it reaches goes down burning
    if (w.flame > 0) {
      w.flameA = follow(w.flameA, -0.5, dt, 0.3);
      const reach = 0.26 * N, a = w.flameA + slope * 0.5;
      for (let i = 0; i < 7; i++) { const ra = a + (i - 3) * 0.045, len = reach * (0.6 + 0.4 * hash(i, tt)); r.stroke(nozzle.x, nozzle.y, nozzle.x + Math.cos(ra) * len, nozzle.y + Math.sin(ra) * len, px(2.2 * u), i % 2 ? HOT : BRIGHT); }
      for (let i = 0; i < 5; i++) w.sparks.push({ x: nozzle.x + Math.cos(a) * reach * rnd(), y: nozzle.y + Math.sin(a) * reach * rnd(), vx: (rnd() - 0.5) * 0.1 * N, vy: -(0.05 + rnd() * 0.1) * N, life: 0.4, c: BRIGHT });
      for (const b of w.bugs) { const d = Math.hypot(b.x - nozzle.x, b.y - nozzle.y), ba = Math.atan2(b.y - 2 * u - nozzle.y, b.x - nozzle.x); if (d < reach && Math.abs(ba - a) < 0.2) kill(b, true); }
    }
    r.rect(nozzle.x - 3 * u, nozzle.y - u, 6 * u, 2 * u, DARK);
    // the bugs: down the slope on their legs, the leapers in bounds, the spitters stopping to lob; the dead a lump with embers
    w.bugs = w.bugs.filter((b) => {
      const K = BUGS[b.kind], gy = ground(b.x);
      if (b.dead) { b.dead -= dt; b.y = gy; drawBug(r, K, b.x, b.y, b.sz, 0, u, DARK, true); if (b.burn && rnd() < 0.5) r.rect(b.x + (rnd() - 0.5) * b.sz * 0.5, b.y - b.sz * 0.3 - rnd() * 3 * u, px(u), px(u), rnd() < 0.5 ? HOT : BRIGHT); return b.dead > 0; }
      const speed = K.v * N * (0.7 + 0.6 * f.level), stopped = K.spit && b.x < b.stop;
      if (b.air) { b.vy += G * N * dt; b.x -= speed * 1.6 * dt; b.y += b.vy * dt; if (b.y >= ground(b.x)) { b.air = false; b.y = ground(b.x); burst(w.sparks, rnd, b.x, b.y, 2, 0.1 * N, MID, 0.3); } }
      else { if (!stopped) { b.x -= speed * dt; b.ph += (speed * dt) / (b.sz * 0.18); } b.y = ground(b.x); if (K.leap && rnd() < dt * 0.6) { b.air = true; b.vy = -0.5 * N; } } // the legs cycle at the rate their reach covers the ground
      if (stopped && (b.spitT -= dt) <= 0) { b.spitT = 1.2 + rnd(); const tx = (0.1 + rnd() * 0.18) * N; w.acid.push({ x: b.x - b.sz * 0.2, y: b.y - b.sz * 0.4, ...aim(b.x, b.y - b.sz * 0.4, tx, ground(tx), 0.8) }); }
      r.rect(b.x - b.sz * 0.3, gy, b.sz * 0.6, px(u), DARK); // its shadow on the slope
      drawBug(r, K, b.x, b.y, b.sz, b.ph, u, b.flash > 0 ? BRIGHT : MID, false); // mid against the sky, their feet on the slope
      b.flash = (b.flash || 0) - dt;
      if (b.x < 0.28 * N) { s.shake = Math.max(s.shake, 0.1); return false; } // over the bags and gone
      return true;
    });
    if (w.bugs.length) { const b = w.bugs.find((q) => !q.dead); if (b) targets.push({ x: b.x - b.sz * 0.6, y: b.y - b.sz * 0.6, w: b.sz * 1.2, h: b.sz * 0.7 }); }
    // the bio-tank: a hill of plates on eight legs, a step per beat down the slope, down for good when it has taken enough
    if (w.beast) {
      const B = w.beast, sz = 0.3 * N;
      if (B.hp > 0) { if (f.beat.on) { B.step = 1; s.shake = Math.max(s.shake, 0.3); } B.x -= dt * 0.08 * N * (0.5 + B.step); B.step *= Math.exp(-dt * 3); B.ph += dt * 3 * (0.5 + B.step); }
      else B.sink = Math.min(1, B.sink + dt * 0.7);
      const gy = ground(B.x) + B.sink * sz * 0.5, col = B.flash > 0 ? BRIGHT : MID;
      B.flash = (B.flash || 0) - dt;
      for (let i = 0; i < 8; i++) { const lx = B.x - sz * 0.4 + i * sz * 0.11, sw = Math.sin(B.ph + (i % 2) * Math.PI + i * 0.4) * sz * 0.08; r.stroke(lx, gy - sz * 0.22, lx + sw * 0.5, gy - sz * 0.1, px(2 * u), col); r.stroke(lx + sw * 0.5, gy - sz * 0.1, lx + sw, gy, px(2 * u), col); }
      r.ring(B.x, gy - sz * 0.25, sz * 0.25, sz * 0.5, col, 0.6);
      for (let k = 1; k < 4; k++) r.ring(B.x, gy - sz * 0.25, sz * 0.5 * (k / 4), px(u), DARK, 0.6); // the plates
      r.disc(B.x - sz * 0.52, gy - sz * 0.22, sz * 0.14, col);
      for (const k of [-1, 1]) r.stroke(B.x - sz * 0.6, gy - sz * 0.2, B.x - sz * 0.8, gy - sz * 0.2 + k * sz * 0.12, px(2 * u), col);
      for (const k of [-0.03, 0.03]) r.rect(B.x - sz * 0.58, gy - sz * 0.26 + k * sz, 2 * u, 2 * u, HOT);
      if (B.sink > 0) for (let i = 0; i < 6; i++) r.rect(B.x + (rnd() - 0.5) * sz, gy - rnd() * 4 * u, 2 * u, 2 * u, i ? HOT : BRIGHT);
      targets.push({ x: B.x - sz * 0.8, y: gy - sz * 0.6, w: sz * 1.4, h: sz * 0.6 });
      if (B.x < 0.3 * N || B.sink >= 1) w.beast = null;
    }
    // the tracers to what they were fired at, the shell down its arc and its blast, the acid on its arcs
    w.tracers = w.tracers.filter((tr) => {
      const step = Math.hypot(tr.vx, tr.vy) * dt;
      if (Math.hypot(tr.tx - tr.x, tr.ty - tr.y) <= step) {
        if (tr.tg === w.beast && w.beast) { w.beast.hp--; w.beast.flash = 0.1; burst(w.sparks, rnd, tr.tx, tr.ty, 4, 0.2 * N, BRIGHT, 0.3); }
        else if (tr.tg && !tr.tg.dead) { tr.tg.flash = 0.1; if (--tr.tg.hp <= 0) kill(tr.tg, false); }
        else burst(w.sparks, rnd, tr.tx, tr.ty, 3, 0.15 * N, MID, 0.3);
        return false;
      }
      tr.x += tr.vx * dt; tr.y += tr.vy * dt;
      r.stroke(tr.x - (tr.vx / step) * dt * 5 * u, tr.y - (tr.vy / step) * dt * 5 * u, tr.x, tr.y, px(u), HOT);
      r.rect(tr.x, tr.y, px(u), px(u), BRIGHT);
      return tr.x < 1.1 * N && tr.y > -0.1 * N;
    });
    w.shells = w.shells.filter((sh) => {
      sh.vy += G * N * dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt;
      r.disc(sh.x, sh.y, 1.5 * u, LMID);
      if (sh.y >= ground(sh.x)) {
        for (const b of w.bugs) if (Math.hypot(b.x - sh.x, b.y - sh.y) < 0.06 * N) kill(b, false);
        if (w.beast && Math.abs(w.beast.x - sh.x) < 0.15 * N) { w.beast.hp -= 4; w.beast.flash = 0.15; }
        for (let i = 0; i < 16; i++) w.sparks.push({ x: sh.x, y: sh.y, vx: (rnd() - 0.5) * 0.6 * N, vy: -rnd() * 0.5 * N, life: 0.5 + rnd() * 0.4, c: i % 3 ? HOT : BRIGHT });
        r.disc(sh.x, sh.y - 3 * u, 6 * u, BRIGHT);
        s.shake = Math.max(s.shake, 0.4);
        return false;
      }
      return sh.x < 1.1 * N;
    });
    w.acid = w.acid.filter((ac) => {
      ac.vy += G * N * dt; ac.x += ac.vx * dt; ac.y += ac.vy * dt;
      r.disc(ac.x, ac.y, 1.3 * u, COOL);
      r.rect(ac.x - ac.vx * 0.03, ac.y - ac.vy * 0.03, px(u), px(u), COOL + DIM);
      if (ac.y >= ground(ac.x)) { burst(w.sparks, rnd, ac.x, ac.y, 8, 0.2 * N, COOL, 0.5); return false; }
      return ac.x > -0.1 * N;
    });
    w.sparks = particles(W, w.sparks, HOT);
    if (w.sparks.length > 300) w.sparks.splice(0, w.sparks.length - 300);
  },
};

// ---------------------------------------------------------------------------------------------- tomb world
// A hall under a black pyramid: ranks of metal skeletons receding to the back wall, smaller with the distance,
// waking rank by rank on the beats from the back (the eyes lighting, the heads coming up), then marching a rank
// nearer each beat, the nearest going out at our feet and a dormant one taking its place at the back. Snares are
// their arc rifles, bolts that jump across to the robbers at the sides; hats send scarabs skittering over the floor;
// the floor's glow lines run with the bass. A drop raises the monolith at the back out of the floor, dust and beams,
// for eight bars. Legions: the warriors, the swarm of lesser ones, the lords with a crowned one in front.
const LEGIONS = {
  warriors: { per: 5, sc: 1, lord: false, scarabs: 1 },
  swarm: { per: 8, sc: 0.72, lord: false, scarabs: 2 },
  lords: { per: 4, sc: 1.1, lord: true, scarabs: 1 },
};
const LEGION_W = { warriors: [3, 2, 1], swarm: [2, 2, 2], lords: [1, 2, 3] };
const SLOTS = [1.35, 1.9, 2.7, 3.8, 5.2, 7];

// a metal skeleton at (x, y) with its feet on y, h tall, awake by k (0 bowed and dark, 1 standing and lit); sw is
// the step (-1..1): the legs apart by it while the rank moves
function drawSkel(r, x, y, h, k, u, col, eye, lord, sw = 0) {
  const bow = (1 - k) * h * 0.1, lw = Math.max(1, h * 0.05);
  for (const sgn of [-1, 1]) r.rect(x + sgn * h * 0.07 - lw / 2 + sgn * sw * h * 0.05, y - h * 0.45, lw, h * 0.45, col);
  r.rect(x - h * 0.12, y - h * 0.5, h * 0.24, h * 0.06, col);
  r.rect(x - h * 0.14, y - h * 0.8 + bow * 0.5, h * 0.28, h * 0.3, col);
  for (let i = 1; i < 4; i++) r.rect(x - h * 0.11, y - h * 0.8 + bow * 0.5 + i * h * 0.07, h * 0.22, Math.max(1, h * 0.02), BG); // the slits of the ribs
  r.rect(x - h * 0.2, y - h * 0.68 + bow * 0.5, h * 0.4, lw, col); // the arms across, holding the rifle
  r.rect(x - h * 0.3, y - h * 0.7 + bow * 0.5, h * 0.6, Math.max(1, h * 0.04), LMID);
  r.rect(x + h * 0.3, y - h * 0.71 + bow * 0.5, Math.max(1, h * 0.04), Math.max(1, h * 0.06), k > 0.5 ? COOL : COOL + DIM);
  const hy = y - h * 0.9 + bow, hx = x + bow * 0.4;
  r.disc(hx, hy, h * 0.1, col);
  r.rect(hx - h * 0.06, hy + h * 0.06, h * 0.12, h * 0.05, col);
  for (const sgn of [-1, 1]) r.rect(hx + sgn * h * 0.04 - Math.max(1, h * 0.02), hy - h * 0.02, Math.max(1, h * 0.035), Math.max(1, h * 0.03), eye);
  if (lord) { for (const q of [-0.08, 0, 0.08]) r.rect(hx + q * h - Math.max(1, h * 0.015), hy - h * 0.1 - (q ? h * 0.06 : h * 0.1), Math.max(1, h * 0.03), q ? h * 0.06 : h * 0.1, LMID); r.rect(x - h * 0.34, y - h * 1.15 + bow, Math.max(1, h * 0.03), h * 1.15 - bow, LMID); r.disc(x - h * 0.33, y - h * 1.18 + bow, h * 0.06, COOL); }
  return { hx, hy, mx: x + h * 0.3, my: y - h * 0.7 + bow * 0.5 };
}

const tombworld = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { legion: rollW(rnd, LEGION_W, band), rows: SLOTS.map((d, i) => ({ slot: i, d, wake: 0, awake: false, off: rnd() * 0.3 })), bolts: [], scarabs: [], sparks: [], robbers: [{ x: 0.08, dead: 0, flash: 0 }, { x: 0.92, dead: 0, flash: 0 }], mono: null, ph: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, Lg = LEGIONS[w.legion], hy = 0.42 * N, cx = 0.5 * N, K = 0.5 * N, tt = t * 12 | 0;
    const floorY = (d) => hy + K / d;
    // the beat: the farthest dormant rank wakes; all awake, the ranks come a slot nearer, the nearest going round to the back
    if (beatLocked(f) ? f.beat.on : (w.ph += dt * bps) >= 1) {
      w.ph = 0;
      const dormant = w.rows.filter((q) => !q.awake).sort((a, b) => b.slot - a.slot)[0];
      if (dormant) dormant.awake = true;
      else for (const q of w.rows) { q.slot--; if (q.slot < 0) { q.slot = SLOTS.length - 1; q.awake = false; q.wake = 0; q.d = SLOTS[q.slot] + 1; } }
    }
    for (const h of hits) {
      if (h.kind === 'snare') { // an arc rifle in the front rank jumps a bolt to a robber
        const front = w.rows.filter((q) => q.awake).sort((a, b) => a.d - b.d)[0], rb = w.robbers.filter((q) => q.dead <= 0);
        if (front && rb.length && front.mz) { const tg = pick(rnd, rb); w.bolts.push({ x0: front.mz.mx, y0: front.mz.my, tg, t: 0, seed: Math.floor(rnd() * 9973) }); }
      } else if (h.kind === 'hat' && w.scarabs.length < 3 * Lg.scarabs) { const dir = rnd() < 0.5 ? 1 : -1; w.scarabs.push({ x: dir > 0 ? -0.05 : 1.05, y: 0.8 + rnd() * 0.12, dir, t: 0, seed: Math.floor(rnd() * 9973), n: 10 + Math.floor(rnd() * 8) }); }
      else if (isLow(h)) for (const q of w.rows) if (q.awake) q.off = 0.3 * h.strength; // a stamp in the ranks
    }
    if (f.section === 'drop' && !w.mono) w.mono = { t: 0, dur: 32 / bps };
    else if (f.section === 'change') { w.legion = rollW(rnd, LEGION_W, band); }
    // the hall: the pyramid's walls meeting over us, the floor and its glow lines running toward us with the bass
    r.poly([[-0.1 * N, N], [cx, 0.02 * N], [1.1 * N, N]], DARK + DIM);
    r.rect(0, hy, N, N - hy, BG);
    const run = f.rel.bassClock * 0.4, bright = clamp(f.rel.trebDrive);
    for (let i = 0; i < 14; i++) { const d = 1 + ((i - run) % 14 + 14) % 14 * 0.6, y = floorY(d), hw = (0.75 * N) / d; r.rect(cx - hw, y, hw * 2, px(u), i % 2 && bright > 0.5 ? COOL : COOL + DIM); }
    for (const d of [1.3, 2.2, 3.6, 5.5]) for (const sgn of [-1, 1]) { const x = cx + (sgn * 0.62 * N) / d, hh = (0.5 * N) / d, wd = Math.max(2 * u, (0.05 * N) / d); r.rect(x - wd / 2, floorY(d) - hh, wd, hh, DARK); r.rect(x - wd, floorY(d) - hh - wd * 0.5, wd * 2, wd * 0.5, DARK); r.rect(x - wd * 0.3, floorY(d) - hh + hh * 0.3, px(u), hh * 0.4, COOL + DIM); }
    for (const sgn of [-1, 1]) r.line(cx + sgn * N * 0.5, N, cx + sgn * N * 0.06, 0.1 * N, DARK); // the edges of the walls
    // the monolith at the back, up out of the floor over two bars, its beams turning, down again at the end
    if (w.mono) {
      const M2 = w.mono;
      M2.t += dt;
      const up = 8 / bps, k = M2.t < up ? ease(M2.t / up) : M2.t < M2.dur - up ? 1 : 1 - ease((M2.t - (M2.dur - up)) / up), d = 7.5, by = floorY(d), mw = (0.4 * N) / d, mh = k * (2.2 * N) / d;
      if (k <= 0 && M2.t > up) w.mono = null;
      else {
        r.poly([[cx - mw / 2, by], [cx + mw / 2, by], [cx + mw * 0.35, by - mh], [cx - mw * 0.35, by - mh]], BLACK);
        for (let i = 1; i < 6; i++) { const yy = by - mh * (i / 6); if (yy < by - 2 * u) r.rect(cx - mw * 0.22, yy, mw * (0.2 + 0.25 * hash(i, 3)), px(u), i % 2 ? COOL : COOL + DIM); } // the notches, marks and no more
        r.rect(cx - px(u) / 2, by - mh, px(u), mh, f.beat.pulse > 0.5 ? COOL : COOL + DIM);
        if (M2.t < up) { s.shake = Math.max(s.shake, 0.2); for (let i = 0; i < 3; i++) w.sparks.push({ x: cx + (rnd() - 0.5) * mw * 1.4, y: by, vx: (rnd() - 0.5) * 0.1 * N, vy: -rnd() * 0.12 * N, life: 0.8, c: LMID + DIM }); }
        for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + Math.sin(t * 0.5 + i * 2.1) * 0.5; r.line(cx, by - mh, cx + Math.cos(a) * 0.5 * N, by - mh + Math.sin(a) * 0.5 * N, COOL + DIM); }
        targets.push({ x: cx - mw, y: by - mh - 2 * u, w: mw * 2, h: mh + 4 * u });
      }
    }
    // the ranks, far to near: each at its depth, smaller and fainter the farther; waking lifts the head and lights the eyes
    w.rows.sort((a, b) => b.d - a.d);
    for (const row of w.rows) {
      row.d = follow(row.d, SLOTS[row.slot], dt, 0.25);
      row.wake = follow(row.wake, row.awake ? 1 : 0, dt, 0.35);
      row.off *= Math.exp(-dt * 6);
      const d = row.d, y = floorY(d) - row.off * 2 * u, h = ((0.3 * N) / d) * Lg.sc, col = d > 4.5 ? LMID + DIM : d > 2.4 ? MID : LMID, eye = row.wake > 0.5 ? (f.beat.pulse > 0.5 && row.awake ? BRIGHT : COOL) : BG;
      const n = Lg.per, span = (1.1 * N) / d, sw = Math.abs(d - SLOTS[row.slot]) > 0.03 ? Math.sin((beatLocked(f) ? f.beat.phase : w.ph) * Math.PI) : 0; // a step while the rank comes on
      for (let i = 0; i < n; i++) {
        const x = cx + (i - (n - 1) / 2) * (span / n) + Math.sin(i * 1.7) * u, lord = Lg.lord && i === Math.floor(n / 2) && row.slot === 0;
        shadow(r, x, y, h * 0.15, DARK);
        const J = drawSkel(r, x, y, lord ? h * 1.3 : h, row.wake, u, col, eye, lord, sw);
        if (i === n - 1) row.mz = J;
      }
      if (row.slot === 0) targets.push({ x: cx - span / 2, y: y - h, w: span, h });
    }
    // the robbers at our feet, down when a bolt finds them, back after a bar; the bolts, jagged anew every frame
    for (const rb of w.robbers) {
      rb.flash -= dt;
      const X = rb.x * N, hh = 0.14 * N, c = rb.flash > 0 ? BRIGHT : MID;
      if (rb.dead > 0) { rb.dead -= dt; r.rect(X - hh * 0.3, 0.9 * N - 2 * u, hh * 0.6, 2 * u, c); continue; }
      shadow(r, X, 0.9 * N, hh * 0.2, DARK);
      r.rect(X - hh * 0.12, 0.9 * N - hh * 0.7, hh * 0.24, hh * 0.7, c);
      r.disc(X, 0.9 * N - hh * 0.8, hh * 0.11, c);
      r.rect(X + (rb.x < 0.5 ? hh * 0.1 : -hh * 0.3), 0.9 * N - hh * 0.6, hh * 0.2, px(u), c);
      targets.push({ x: X - hh * 0.2, y: 0.9 * N - hh, w: hh * 0.4, h: hh });
    }
    w.bolts = w.bolts.filter((b) => {
      b.t += dt;
      const tx = b.tg.x * N, ty = 0.9 * N - 0.08 * N, k = Math.min(1, b.t / 0.22);
      bolt(r, b.x0, b.y0, lerp(b.x0, tx, k), lerp(b.y0, ty, k), 7, 4 * u, b.seed + (b.t * 60 | 0), b.t < 0.3 ? BRIGHT : COOL, px(u));
      if (k >= 1 && !b.hit) { b.hit = true; b.tg.flash = 0.15; b.tg.dead = 4 / bps; burst(w.sparks, rnd, tx, ty, 8, 0.25 * N, COOL, 0.4); }
      return b.t < 0.4;
    });
    // the scarabs, a knot of dots skittering across the floor, every one of them jittering on its own
    w.scarabs = w.scarabs.filter((sw) => {
      sw.t += dt; sw.x += sw.dir * dt * 0.3; sw.y += Math.sin(sw.t * 3 + sw.seed) * dt * 0.02;
      for (let i = 0; i < sw.n; i++) r.rect((sw.x + (hash(sw.seed + i, 1) - 0.5) * 0.06) * N + (hash(i, tt + sw.seed) - 0.5) * 2 * u, (sw.y + (hash(sw.seed + i, 2) - 0.5) * 0.02) * N + (hash(i + 7, tt) - 0.5) * u, px(u), px(u), i % 3 ? DARK : COOL + DIM);
      return sw.x > -0.1 && sw.x < 1.1;
    });
    w.sparks = particles(W, w.sparks, COOL);
  },
};

// ---------------------------------------------------------------------------------------------- dark shrine
// A shrine of spikes and chains: the altar, a spiked star turning slowly over it, braziers either side that flare on
// the kicks (their embers rising and slowing), chains from the roof swinging as pendulums, cultists in a half ring
// who kneel and rise with the beat, arms up when they stand. Snares flash the star and rattle the chains, hats gutter
// the altar candles, notes turn the brazier flames bright; a drop opens the portal behind the altar and a horned
// thing steps half through it, then it closes. Rites: the vigil, the sacrifice, the summoning (the portal never quite shut).
const RITES = {
  vigil: { n: 5, flare: 0.5, chains: 3, seep: false },
  sacrifice: { n: 7, flare: 1, chains: 4, seep: false },
  summoning: { n: 7, flare: 0.8, chains: 5, seep: true },
};
const RITE_W = { vigil: [3, 2, 1], sacrifice: [2, 2, 2], summoning: [1, 2, 3] };

const darkshrine = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { rite: rollW(rnd, RITE_W, band), rot: rnd() * TAU, flash: 0, flare: 0, tone: 0, gutter: 0, embers: [], portal: null, chains: Array.from({ length: 5 }, (_, i) => ({ x: 0.1 + i * 0.2 + rnd() * 0.06, len: 0.16 + rnd() * 0.16, ph: rnd() * TAU, amp: 0.05 + rnd() * 0.05 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, R = RITES[w.rite], g = 0.82 * N, ax = 0.5 * N, tt = t * 12 | 0;
    for (const h of hits) {
      if (isLow(h)) { w.flare = Math.min(1.5, w.flare + h.strength * R.flare); for (const c of w.chains) c.amp = Math.min(0.5, c.amp + 0.1 * h.strength); s.shake = Math.max(s.shake, 0.1); }
      else if (h.kind === 'snare') { w.flash = 0.2; for (const c of w.chains) c.ph += (rnd() - 0.5) * 0.4; }
      else if (h.kind === 'hat') w.gutter = 0.3;
      else if (isTonal(h)) w.tone = 0.4;
    }
    if (f.section === 'drop' && !w.portal) w.portal = { t: 0, dur: 16 / bps };
    else if (f.section === 'change') w.rite = rollW(rnd, RITE_W, band);
    w.flash -= dt; w.tone -= dt; w.gutter -= dt; w.flare *= Math.exp(-dt * 2.5);
    w.rot += dt * (0.2 + 0.9 * clamp(f.rel.midDrive));
    // the wall and its spikes, the floor, the fog along it with the level
    r.rect(0, 0, N, g, DARK + DIM);
    for (let i = 0; i < 12; i++) { const x = (i + 0.5) * (N / 12), hh = (0.05 + hash(i, 81) * 0.06) * N; r.poly([[x - 2.5 * u, 0], [x + 2.5 * u, 0], [x, hh]], DARK); r.poly([[x - 3 * u, g], [x + 3 * u, g], [x + (hash(i, 82) - 0.5) * 3 * u, g - hh * 1.4]], DARK); }
    r.rect(0, g, N, N - g, DARK);
    for (let y = Math.round(g - 0.06 * N); y < g; y++) for (let x = 0; x < N; x++) if (hash(x, y + (t * 3 | 0)) < (0.2 + 0.4 * f.level) * ((y - g + 0.06 * N) / (0.06 * N))) r.buf[y * N + x] = DARK;
    // the chains: pendulums with the period their length gives them, the bass pushing, the snare rattling them
    for (const c of w.chains.slice(0, R.chains)) {
      const len = c.len * N, om = Math.sqrt((G * N) / len);
      c.ph += dt * om; c.amp *= Math.exp(-dt * 0.15);
      const a = c.amp * Math.sin(c.ph), X = c.x * N, ex = X + Math.sin(a) * len, ey = Math.cos(a) * len;
      for (let k = 0; k < 12; k++) r.stroke(lerp(X, ex, k / 12), lerp(0, ey, k / 12), lerp(X, ex, (k + 1) / 12), lerp(0, ey, (k + 1) / 12), k % 2 ? px(1.8 * u) : px(u), k % 2 ? LMID + DIM : MID);
      r.poly([[ex - 2.5 * u, ey], [ex + 2.5 * u, ey], [ex, ey + 6 * u]], LMID); // a hook
    }
    // the portal behind the altar: open over two beats, the horned one half through, shut again at the end
    const seep = R.seep && !w.portal;
    if (w.portal || seep) {
      let k = 0.08, e = 0;
      if (w.portal) {
        const P = w.portal;
        P.t += dt;
        k = P.t < 2 / bps ? ease(P.t / (2 / bps)) : P.t < P.dur - 2 / bps ? 1 : Math.max(0, 1 - ease((P.t - (P.dur - 2 / bps)) / (2 / bps)));
        e = clamp((P.t - 2 / bps) / (4 / bps)) * k * (P.t < P.dur - 4 / bps ? 1 : clamp((P.dur - P.t) / (2 / bps)));
        if (P.t >= P.dur) w.portal = null;
      }
      const pw = Math.max(px(u), k * 0.1 * N), ph = 0.19 * N, py = g - 0.02 * N - ph;
      for (let y = py - ph; y <= py + ph; y++) for (let x = ax - pw; x <= ax + pw; x++) if (((x - ax) / pw) ** 2 + ((y - py) / ph) ** 2 <= 1) r.set(x, y, hash(x | 0, (y | 0) + tt) < 0.35 ? COOL + DIM : BLACK);
      r.ring(ax, py, pw, px(u), f.beat.pulse > 0.5 ? COOL : COOL + DIM, ph / pw);
      if (e > 0) { // horns over the rim, the bulk inside, one arm out and reaching
        const hh = 0.26 * N, bx = ax, by = py + ph * 0.3;
        r.poly([[bx - pw * 0.9, by], [bx + pw * 0.9, by], [bx + pw * 0.7, by - hh * 0.8], [bx - pw * 0.7, by - hh * 0.8]], BLACK);
        r.disc(bx, by - hh * 0.85, hh * 0.1, BLACK);
        for (const sgn of [-1, 1]) { r.stroke(bx + sgn * hh * 0.06, by - hh * 0.9, bx + sgn * hh * 0.18, by - hh * 1.1, px(2.5 * u), BLACK); r.stroke(bx + sgn * hh * 0.18, by - hh * 1.1, bx + sgn * hh * 0.22, by - hh * 1.25, px(1.5 * u), BLACK); }
        for (const sgn of [-1, 1]) r.rect(bx + sgn * hh * 0.035 - u, by - hh * 0.87, 2 * u, px(u), HOT);
        const reach = e * hh * 0.5, hx = bx - pw * 0.5 - reach, hy2 = by - hh * 0.5 + reach * 0.5;
        r.stroke(bx - pw * 0.5, by - hh * 0.65, hx, hy2, px(3 * u), BLACK);
        for (let i = 0; i < 3; i++) r.stroke(hx, hy2, hx - 4 * u + i * 3 * u, hy2 + 5 * u, px(1.5 * u), BLACK);
        targets.push({ x: bx - hh * 0.3 - reach, y: by - hh * 1.3, w: hh * 0.6 + reach, h: hh * 1.3 });
      }
    }
    // the altar and its candles, the star of rays turning over it, flashing on a snare
    r.rect(ax - 0.09 * N, g - 0.08 * N, 0.18 * N, 0.08 * N, MID);
    r.rect(ax - 0.1 * N, g - 0.09 * N, 0.2 * N, px(1.5 * u), LMID + DIM);
    for (const q of [-0.05, 0, 0.05]) { const cx = ax + q * N, fh = (w.gutter > 0 ? 1 + hash(q * 100 | 0, tt) * 2 : 2 + hash(q * 100 | 0, tt)) * u; r.rect(cx - u * 0.5, g - 0.09 * N - 4 * u, px(u), 4 * u, LMID); r.rect(cx - u * 0.5, g - 0.09 * N - 4 * u - fh, px(u), fh, HOT); r.rect(cx - u * 0.5, g - 0.09 * N - 5 * u - fh, px(u), px(u), BRIGHT); }
    const sx = ax, sy = 0.27 * N, sr = 0.08 * N, sc = w.flash > 0 ? BRIGHT : HOT;
    r.ring(sx, sy, sr, px(1.5 * u), sc);
    r.ring(sx, sy, sr * 0.35, px(u), sc);
    for (let i = 0; i < 8; i++) {
      const a = w.rot + (i / 8) * TAU, ca = Math.cos(a), sa = Math.sin(a), far = w.flash > 0 ? 2.2 : 1.7;
      r.stroke(sx + ca * sr * 0.45, sy + sa * sr * 0.45, sx + ca * sr * far, sy + sa * sr * far, px(i % 2 ? u : 1.6 * u), sc);
      r.poly([[sx + ca * sr - sa * 2.5 * u, sy + sa * sr + ca * 2.5 * u], [sx + ca * sr + sa * 2.5 * u, sy + sa * sr - ca * 2.5 * u], [sx + ca * sr * 1.3, sy + sa * sr * 1.3]], sc);
    }
    r.rect(sx - u, 0, 2 * u, sy - sr * 1.7, DARK); // what it hangs by
    targets.push({ x: sx - sr * 1.8, y: sy - sr * 1.8, w: sr * 3.6, h: sr * 3.6 });
    // the braziers: the bowl, the flame with the bass and the kicks, embers that climb and slow; a note turns them bright
    for (const bx of [0.2 * N, 0.8 * N]) {
      r.rect(bx - 1.5 * u, g - 0.12 * N, 3 * u, 0.12 * N, MID + DIM);
      r.poly([[bx - 0.05 * N, g - 0.16 * N], [bx + 0.05 * N, g - 0.16 * N], [bx + 0.03 * N, g - 0.12 * N], [bx - 0.03 * N, g - 0.12 * N]], MID);
      const fh = (0.05 + 0.08 * clamp(f.rel.bassDrive) + 0.1 * w.flare) * N, fl = 0.8 + 0.4 * hash(bx | 0, tt);
      r.poly([[bx - 0.04 * N, g - 0.16 * N], [bx + 0.04 * N, g - 0.16 * N], [bx + 0.015 * N, g - 0.16 * N - fh * 0.6 * fl], [bx, g - 0.16 * N - fh * fl], [bx - 0.015 * N, g - 0.16 * N - fh * 0.5 * fl]], HOT);
      r.poly([[bx - 0.02 * N, g - 0.16 * N], [bx + 0.02 * N, g - 0.16 * N], [bx, g - 0.16 * N - fh * 0.5 * fl]], w.tone > 0 ? BRIGHT : HOT + DIM);
      if (rnd() < dt * (3 + 12 * w.flare) && w.embers.length < 160) w.embers.push({ x: bx + (rnd() - 0.5) * 0.04 * N, y: g - 0.16 * N - fh * 0.5, vx: (rnd() - 0.5) * 0.04 * N, vy: -(0.15 + rnd() * 0.15) * N, life: 1.2 + rnd() });
      for (let y = g - 4 * u; y < g; y++) for (let x = bx - 0.1 * N; x < bx + 0.1 * N; x++) if (hash(x | 0, y + tt) < 0.15 + 0.3 * w.flare) r.set(x, y, HOT + DIM); // the light on the floor
    }
    w.embers = w.embers.filter((e) => { e.vy = follow(e.vy, -0.02 * N, dt, 0.7); e.x += e.vx * dt + Math.sin(t * 4 + e.life * 5) * u * dt * 5; e.y += e.vy * dt; e.life -= dt; r.rect(e.x, e.y, px(u), px(u), e.life > 0.8 ? BRIGHT : HOT); return e.life > 0 && e.y > 0; });
    // the cultists in their half ring, the far ones smaller, down on the knee and up again with the beats, arms up standing
    const ph = beatLocked(f) ? f.beat.phase : (t * bps) % 1, cnt = beatLocked(f) ? f.beat.count : Math.floor(t * bps), stand = cnt % 2 ? ease(ph) : 1 - ease(ph);
    const ring = Array.from({ length: R.n }, (_, i) => { const a = Math.PI * (0.1 + (0.8 * i) / (R.n - 1)); return { x: ax + Math.cos(a) * 0.34 * N, y: g - 0.02 * N + Math.sin(a) * 0.09 * N, a }; }).sort((p, q) => p.y - q.y);
    for (const c of ring) {
      const near = (c.y - (g - 0.02 * N)) / (0.09 * N), h = 0.12 * N * (0.75 + 0.35 * near) * (0.65 + 0.35 * stand);
      shadow(r, c.x, c.y, h * 0.22, BLACK);
      const J = hooded(r, c.x, c.y, h, MID, 0);
      if (stand > 0.6) for (const sgn of [-1, 1]) r.stroke(c.x + sgn * h * 0.1, c.y - h * 0.6, c.x + sgn * h * 0.22, c.y - h * (0.6 + 0.35 * (stand - 0.6) / 0.4), px(1.5 * u), MID);
      if (c === ring[ring.length - 1]) targets.push({ x: c.x - h * 0.3, y: c.y - h, w: h * 0.6, h });
    }
  },
};

// ---------------------------------------------------------------------------------------------- orbital fire
// A world from orbit: the limb of the planet across the lower half, day and night and the city lights of the night,
// a fleet in the orbit lane above drifting on (no down up here), the debris ring going round behind. Kicks are the
// lances, beams that run down to the surface, a flash and a ring of glow spreading where they land and a fault line
// cracking out from each strike; hats blink the fleet's point lights; snares drop a volley of torpedoes that fall the
// long fall under the planet's pull; a drop raises a blast dome the size of a continent. Doctrines: the siege (few, heavy),
// saturation (many, light), the end of the world (fire that stays).
const DOCTRINES = {
  siege: { ships: 3, lances: 1, wide: 1.5 },
  saturation: { ships: 5, lances: 3, wide: 0.8 },
  exterminatus: { ships: 4, lances: 2, wide: 1.2, fire: true },
};
const DOCTRINE_W = { siege: [3, 2, 1], saturation: [2, 2, 2], exterminatus: [0, 1, 3] };
function orbitTables(w, N, u) {
  const cx = 0.5 * N, cy = 1.55 * N, R = 1.1 * N, R2 = R * R, lx = -0.55, ly = -0.83, base = new Uint8Array(N * N), x0s = new Int16Array(N), x1s = new Int16Array(N), lights = [];
  for (let y = 0; y < N; y++) {
    const dy = y + 0.5 - cy, q = R2 - dy * dy;
    if (q <= 0) { x0s[y] = 0; x1s[y] = 0; continue; }
    const xr = Math.sqrt(q), x0 = Math.max(0, Math.ceil(cx - xr)), x1 = Math.min(N, Math.floor(cx + xr));
    x0s[y] = x0; x1s[y] = x1;
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx, lit = (dx * lx + dy * ly) / R, land = hash((x / (7 * u)) | 0, (y / (5 * u)) | 0) * 0.6 + hash((x / (15 * u)) | 0, (y / (10 * u)) | 0) > 0.95, i = y * N + x;
      const day = lit > 0.12 || (lit > -0.08 && hash(x, y) < (lit + 0.08) / 0.2);
      base[i] = day ? (land ? MID : DARK) : land ? DARK + DIM : BG + DIM;
      if (!day && land && hash(x + 3, y + 5) < 0.06) lights.push(i);
    }
  }
  Object.assign(w, { N, cx, cy, R, base, x0s, x1s, lights: Int32Array.from(lights), limb: Float32Array.from({ length: N }, (_, x) => { const dx = x + 0.5 - cx, q = R2 - dx * dx; return q > 0 ? cy - Math.sqrt(q) : N; }) });
}

const orbitalfire = {
  init(W) {
    const { w, rnd, N, u } = W, band = bandOf(W.a);
    orbitTables(w, N, u);
    const D = DOCTRINES[rollW(rnd, DOCTRINE_W, band)];
    Object.assign(w, { doctrine: Object.keys(DOCTRINES).find((k) => DOCTRINES[k] === D), ships: Array.from({ length: 5 }, (_, i) => ({ x: 0.1 + i * 0.2 + rnd() * 0.05, y: 0.1 + rnd() * 0.12, blink: 0 })), lances: [], glows: [], cracks: [], torps: [], ejecta: [], dome: null, fire: 0, ring: Array.from({ length: 70 }, () => rnd() * TAU), shipI: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, D = DOCTRINES[w.doctrine], tt = t * 6 | 0, buf = r.buf;
    if (w.N !== N) orbitTables(w, N, u);
    const { cx, cy, R, base, x0s, x1s, limb } = w, ships = w.ships.slice(0, D.ships);
    const spot = () => { const x = (0.15 + rnd() * 0.7) * N; return { x, y: limb[x | 0] + 0.08 * N + rnd() * (0.85 * N - limb[x | 0]) }; };
    const strike = (x, y, big) => { // the flash, the ring of glow, a fault line out of it, the ejecta up and back down
      w.glows.push({ x, y, t: 0, big });
      const pts = [[x, y]]; let a = rnd() * TAU;
      for (let i = 0; i < (big ? 5 : 3); i++) { a += (rnd() - 0.5) * 1.2; pts.push([pts[i][0] + Math.cos(a) * 3 * u * D.wide, pts[i][1] + Math.sin(a) * 2 * u * D.wide]); }
      w.cracks.push({ pts, t: 0 });
      if (w.cracks.length > 16) w.cracks.shift();
      for (let i = 0; i < (big ? 10 : 5); i++) w.ejecta.push({ x, y, vx: (rnd() - 0.5) * 0.3 * N, vy: -rnd() * 0.35 * N, life: 0.6 + rnd() * 0.4, c: i % 2 ? HOT : MID });
      w.last = { x, y };
      s.shake = Math.max(s.shake, big ? 0.35 : 0.15);
    };
    for (const h of hits) {
      if (isLow(h)) for (let k = 0; k < D.lances; k++) { const sh = ships[w.shipI++ % ships.length], tg = spot(); w.lances.push({ sx: sh.x * N, sy: sh.y * N + 3 * u, tx: tg.x, ty: tg.y, t: 0, big: D.wide > 1 }); }
      else if (h.kind === 'hat') pick(rnd, ships).blink = 0.1;
      else if (h.kind === 'snare') { const sh = pick(rnd, ships); for (let k = 0; k < 3; k++) w.torps.push({ x: sh.x * N + (k - 1) * 3 * u, y: sh.y * N + 4 * u, vx: 0.01 * N, vy: 0.12 * N + k * 0.02 * N }); }
    }
    if (f.section === 'drop' && w.last && !w.dome) w.dome = { x: w.last.x, y: w.last.y, t: 0, dur: 8 / bps };
    else if (f.section === 'change') w.doctrine = rollW(rnd, DOCTRINE_W, band);
    // space, the ring behind the planet going round (no gravity on anything here but the torpedoes), the planet and its limb
    for (let k = 0; k < 60; k++) { const x = hash(k, 91) * N, y = hash(k, 92) * N; if (y < limb[x | 0]) r.rect(x, y, px(u * 0.7), px(u * 0.7), hash(k, 93) < 0.3 ? LMID : LMID + DIM); }
    const spin = f.rel.midClock * 0.06 + t * 0.01;
    w.ring.forEach((a0, i) => { const a = a0 + spin, x = cx + Math.cos(a) * 1.5 * N, y = cy + Math.sin(a) * 1.2 * N; if (Math.sin(a) < 0 && y < limb[clamp(x | 0, 0, N - 1)]) r.rect(x, y, px(i % 5 ? u * 0.8 : 1.5 * u), px(i % 5 ? u * 0.8 : 1.5 * u), i % 5 ? LMID + DIM : LMID); });
    for (let y = 0; y < N; y++) if (x1s[y] > x0s[y]) buf.set(base.subarray(y * N + x0s[y], y * N + x1s[y]), y * N + x0s[y]);
    const tw = 0.4 + 0.6 * clamp(f.rel.trebDrive), lights = w.lights;
    for (let i = 0; i < lights.length; i++) if (hash(i, tt) < tw) buf[lights[i]] = i % 7 ? HOT + DIM : LMID;
    for (let x = 0; x < N; x++) { const y = limb[x]; if (y < N) { r.set(x, y - 1, LMID + DIM); if (x % 2 && hash(x, 7) < 0.5) r.set(x, y - 2, LMID + DIM); } } // the thin air at the edge
    // the fire that stays after the end begins, along the surface under the dome
    if (D.fire && w.fire > 0) for (let i = 0; i < 40 * w.fire; i++) { const x = rnd() * N, y = limb[x | 0] + 0.04 * N + rnd() * 0.3 * N; if (y < N) r.rect(x, y, px(u), px(u), rnd() < 0.3 ? HOT : HOT + DIM); }
    w.fire = Math.min(1, w.fire + (w.dome ? dt * 0.3 : 0)) * Math.exp(-dt * 0.02);
    // the cracks glow on, pulsing with the beat; the rings of glow spread flat on the surface and cool; the ejecta falls back
    for (const c of w.cracks) { c.t += dt; const col = f.beat.pulse > 0.6 ? HOT : c.t < 8 ? HOT : HOT + DIM; for (let i = 1; i < c.pts.length; i++) r.line(c.pts[i - 1][0], c.pts[i - 1][1], c.pts[i][0], c.pts[i][1], col); }
    w.glows = w.glows.filter((gl) => { gl.t += dt; const Rg = (0.012 + gl.t * 0.035) * N * (gl.big ? 1.5 : 1), k = 1 - gl.t / 1.6; if (gl.t < 0.15) r.disc(gl.x, gl.y, 3 * u, BRIGHT); r.ring(gl.x, gl.y, Rg, px(u) * (k > 0.5 ? 1.5 : 1), k > 0.6 ? HOT : HOT + DIM, 0.45); return gl.t < 1.6; });
    w.ejecta = particles(W, w.ejecta, HOT);
    // the dome of a drop: up out of the surface over a bar, the shock ring out along the ground ahead of it, then gone
    if (w.dome) {
      const Dm = w.dome;
      Dm.t += dt;
      const k = Dm.t < 4 / bps ? ease(Dm.t / (4 / bps)) : Math.max(0, 1 - (Dm.t - 4 / bps) / (4 / bps)), Rd = k * 0.28 * N;
      for (let y = Dm.y - Rd * 0.6; y <= Dm.y; y++) for (let x = Dm.x - Rd; x <= Dm.x + Rd; x++) if (((x - Dm.x) / Rd) ** 2 + ((y - Dm.y) / (Rd * 0.6)) ** 2 <= 1 && hash(x | 0, (y | 0) + tt) < 0.5 * k) r.set(x, y, Dm.t < 2 / bps ? BRIGHT : HOT);
      for (let i = 0; i < 40; i++) { const a = Math.PI + (i / 40) * Math.PI, b = Math.PI + ((i + 1) / 40) * Math.PI; r.stroke(Dm.x + Math.cos(a) * Rd, Dm.y + Math.sin(a) * Rd * 0.6, Dm.x + Math.cos(b) * Rd, Dm.y + Math.sin(b) * Rd * 0.6, px(2 * u), Dm.t < 2 / bps ? BRIGHT : HOT); }
      r.ring(Dm.x, Dm.y, Rd * 1.4, px(1.5 * u), LMID, 0.4);
      s.shake = Math.max(s.shake, 0.5 * k);
      targets.push({ x: Dm.x - Rd, y: Dm.y - Rd * 0.6, w: Rd * 2, h: Rd * 0.6 });
      if (Dm.t >= Dm.dur) w.dome = null;
    }
    // the lances run from ship to surface in a third of a second, burn a moment, and are gone; the torpedoes fall to the pull
    w.lances = w.lances.filter((ln) => {
      ln.t += dt;
      const k = Math.min(1, ln.t / 0.3), ex = lerp(ln.sx, ln.tx, k), ey = lerp(ln.sy, ln.ty, k);
      r.stroke(ln.sx, ln.sy, ex, ey, ln.t < 0.5 ? px((ln.big ? 2.2 : 1.4) * u) : px(u), ln.t < 0.5 ? BRIGHT : COOL);
      if (ln.t < 0.5) { r.line(ln.sx - 2 * u, ln.sy, ex - 2 * u, ey, COOL); r.line(ln.sx + 2 * u, ln.sy, ex + 2 * u, ey, COOL); }
      if (k >= 1 && !ln.hit) { ln.hit = true; strike(ln.tx, ln.ty, ln.big); }
      return ln.t < 0.7;
    });
    w.torps = w.torps.filter((tp) => {
      const dx = cx - tp.x, dy = cy - tp.y, d = Math.hypot(dx, dy), acc = (G * N * 0.25 * (R * R)) / (d * d);
      tp.vx += (dx / d) * acc * dt; tp.vy += (dy / d) * acc * dt;
      tp.x += tp.vx * dt; tp.y += tp.vy * dt;
      r.rect(tp.x - u * 0.5, tp.y - u * 0.5, px(u), px(1.5 * u), LMID);
      r.rect(tp.x - u * 0.5, tp.y - 2 * u, px(u), px(u), HOT);
      if (d <= R) { strike(tp.x, tp.y, false); return false; }
      return tp.y < N && tp.x > 0 && tp.x < N;
    });
    // the fleet in its lane, drifting on at one speed, lights on the beat and on the hats, the engines with the bass
    for (const sh of ships) {
      sh.x += dt * 0.012; if (sh.x > 1.12) sh.x -= 1.24;
      sh.blink -= dt;
      const X = sh.x * N, Y = sh.y * N, len = 0.11 * N, hgt = 0.02 * N;
      r.poly([[X - len * 0.5, Y], [X - len * 0.4, Y - hgt], [X + len * 0.45, Y - hgt], [X + len * 0.5, Y - hgt * 0.3], [X + len * 0.5, Y + hgt * 0.8], [X - len * 0.4, Y + hgt * 1.2]], MID);
      r.poly([[X - len * 0.58, Y + hgt * 0.1], [X - len * 0.5, Y - hgt * 0.6], [X - len * 0.5, Y + hgt * 0.9]], LMID);
      for (const q of [0.05, 0.25]) { r.rect(X + len * q - u, Y - hgt * 2.6, 2 * u, hgt * 1.6, MID); r.rect(X + len * q - u * 0.5, Y - hgt * 3.2, px(u), hgt * 0.6, LMID + DIM); }
      r.rect(X + len * 0.5, Y, hgt * (0.8 + 1.5 * clamp(f.rel.bassDrive)), px(u), HOT);
      r.rect(X - len * 0.2, Y + hgt * 0.3, px(u), px(u), sh.blink > 0 || (f.beat.pulse > 0.6 && f.beat.count % 2) ? BRIGHT : LMID + DIM);
      r.rect(X + len * 0.3, Y + hgt * 0.3, px(u), px(u), sh.blink > 0 || (f.beat.pulse > 0.6 && !(f.beat.count % 2)) ? BRIGHT : LMID + DIM);
      targets.push({ x: X - len * 0.6, y: Y - hgt * 3.2, w: len * 1.2, h: hgt * 4.4 });
    }
    if (w.last) targets.push({ x: w.last.x - 4 * u, y: w.last.y - 3 * u, w: 8 * u, h: 6 * u });
  },
};

const WORLDS = { hivecity, cathedralship, ironclad, warpstorm, godmachine, scrapconvoy, inquest, trenchline, swarmtide, tombworld, darkshrine, orbitalfire };

registerFamily('grim', WORLD_DEFS, WORLDS);
export const GRIM_STYLE = makeMixStyle('GRIMDARK', ['grim']);
