// Pop art and the modernists, mixed: a screen print grid, a comic panel in Ben-Day dots, chunky dancing outlines,
// infinity dots, a Memphis still life, a deco sunburst, a constructivist wedge, weightless geometry, a
// constellation of blobs, paper cut-outs, a hanging mobile, an action painting and an op-art bulge. The visual
// language of each movement only: no artwork, name, brand or person from anywhere, no words. Every world draws
// with the palette roles, so any palette, treatment and layout of the mixer fits.
import { Raster, clamp, lerp } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, L, M, H, TAU, pick, isLow, isTonal, follow, followAngle, ease,
  beatLocked, hash, burst, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  screenprint: { name: 'screen print', va: [[H, M], [H, H], [M, M]], pals: ['popprint', 'candy', 'riso', 'nineties', 'benday'], fx: ['none', 'quad', 'film', 'mirror'], geo: true },
  benday: { name: 'comic print', va: [[H, H], [M, H], [H, M]], pals: ['benday', 'popprint', 'tabloid', 'cinema', 'riso'], fx: ['none', 'manga', 'film', 'quad'] },
  haring: { name: 'dancing outlines', va: [[H, H], [H, M], [M, H]], pals: ['popprint', 'benday', 'candy', 'nineties', 'bauhaus'], fx: ['none', 'quad'] },
  kusama: { name: 'infinity dots', va: [[L, M], [H, L], [M, L]], pals: ['popprint', 'candy', 'cult', 'vapor', 'benday'], fx: ['none', 'mirror', 'kaleido', 'film'], geo: true },
  memphis: { name: 'memphis still life', va: [[H, M], [H, H], [H, L]], pals: ['pastel', 'candy', 'nineties', 'popprint', 'riso'], fx: ['none', 'quad'] },
  deco: { name: 'deco sunburst', va: [[M, H], [M, M], [L, M]], pals: ['deco', 'gold', 'noir', 'silver', 'cinema', 'sepia'], fx: ['none', 'film', 'kaleido', 'mirror'], geo: true },
  constructivist: { name: 'the wedge', va: [[M, H], [L, H], [M, M]], pals: ['bauhaus', 'tabloid', 'bureau', 'riso', 'cinema'], fx: ['none', 'film', 'manga', 'quad'], geo: true },
  suprematist: { name: 'weightless geometry', va: [[M, L], [H, L], [M, M]], pals: ['bauhaus', 'tabloid', 'ice', 'riso', 'silver'], fx: ['none', 'film', 'mirror'], geo: true },
  miro: { name: 'constellation of blobs', va: [[H, L], [M, L], [M, M]], pals: ['bauhaus', 'pastel', 'riso', 'ice', 'sepia'], fx: ['none', 'film', 'kaleido'], geo: true },
  cutouts: { name: 'paper cut-outs', va: [[H, M], [H, L], [M, M]], pals: ['pastel', 'riso', 'bauhaus', 'candy', 'popprint'], fx: ['none', 'film'] },
  mobile: { name: 'the mobile', va: [[M, L], [H, L], [M, M]], pals: ['bauhaus', 'pastel', 'ice', 'tabloid', 'silver'], fx: ['none', 'film', 'mirror'], geo: true },
  drips: { name: 'action painting', va: [[L, H], [M, H], [L, M]], pals: ['bureau', 'tabloid', 'noir', 'riso', 'cult', 'bauhaus'], fx: ['none', 'film', 'quad', 'mirror'], heavy: true, geo: true },
  bulge: { name: 'op-art bulge', va: [[M, M], [M, H], [L, M]], pals: ['silver', 'noir', 'bauhaus', 'ice', 'vapor', 'tabloid'], fx: ['none', 'kaleido', 'mirror', 'crt'], heavy: true, geo: true },
};

// ---------------------------------------------------------------------------------------------- shared bits
// a rectangle turned by `a` about its centre, as a polygon
function rotRect(cx, cy, hw, hh, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [[cx - hw * c + hh * s, cy - hw * s - hh * c], [cx + hw * c + hh * s, cy + hw * s - hh * c], [cx + hw * c - hh * s, cy + hw * s + hh * c], [cx - hw * c - hh * s, cy - hw * s + hh * c]];
}

// a starburst of n points between two radii, every point a little different when `jag` is set
function star(cx, cy, n, ro, ri, rot, jag = 0) {
  const pts = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = rot + (i / (2 * n)) * TAU, rr = (i % 2 ? ri : ro) * (1 + jag * (hash(i, n) - 0.5));
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

// a lens (an eye, a leaf, a petal) of length `len` turned by `a`, `b` the belly as a fraction of the length
function lens(cx, cy, len, b, a, n = 12) {
  const c = Math.cos(a), s = Math.sin(a), pts = [];
  for (let k = 0; k < 2 * n; k++) {
    const i = k < n ? k : 2 * n - k, t = -1 + (2 * i) / n, x = t * len * 0.5, y = (k < n ? -1 : 1) * (1 - t * t) * b * len * 0.5;
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return pts;
}

// the four print roles dealt out afresh
function deal4(rnd) {
  const a = [BG, FIG, HOT, COOL];
  for (let i = 3; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------------------------------------------------------------------------------------------- screenprint
// A screen print grid of one silhouette (a profile, a flower, a banana, a skull): one, four or nine tiles as the
// energy rises, changing on the bar, every tile with its own deal of the roles and its three layers a pixel or
// two out of register. The beat re-deals the colours, a kick knocks the registration further out.
const SUBJECTS = ['profile', 'flower', 'banana', 'skull'];

// the subject into three tile layers (the ground, the silhouette, the detail), 1 where the layer prints
function subject([g, s, d], kind, T) {
  const P = (pts) => pts.map(([x, y]) => [x * T, y * T]);
  g.rect(T * 0.06, T * 0.06, T * 0.88, T * 0.88, 1);
  if (kind === 'profile') {
    s.disc(T * 0.46, T * 0.42, T * 0.25, 1);
    s.poly(P([[0.56, 0.2], [0.68, 0.3], [0.71, 0.42], [0.77, 0.5], [0.71, 0.54], [0.73, 0.6], [0.67, 0.65], [0.62, 0.72], [0.5, 0.66], [0.5, 0.4]]), 1);
    s.rect(T * 0.4, T * 0.6, T * 0.16, T * 0.22, 1);
    s.poly(P([[0.18, 0.94], [0.82, 0.94], [0.7, 0.8], [0.3, 0.8]]), 1);
    d.disc(T * 0.4, T * 0.38, T * 0.27, 1);
    d.disc(T * 0.5, T * 0.45, T * 0.24, 0);
    d.poly(lens(T * 0.6, T * 0.43, T * 0.1, 0.4, 0), 1);
    d.rect(T * 0.66, T * 0.55, T * 0.07, T * 0.03, 1);
  } else if (kind === 'flower') {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; s.disc(T * (0.5 + Math.cos(a) * 0.2), T * (0.4 + Math.sin(a) * 0.2), T * 0.13, 1); }
    s.rect(T * 0.48, T * 0.52, T * 0.04, T * 0.4, 1);
    s.poly(lens(T * 0.62, T * 0.78, T * 0.24, 0.45, -0.6), 1);
    d.disc(T * 0.5, T * 0.4, T * 0.1, 1);
    d.line(T * 0.52, T * 0.86, T * 0.72, T * 0.7, 1);
  } else if (kind === 'banana') {
    s.disc(T * 0.5, T * 0.5, T * 0.38, 1);
    s.disc(T * 0.5, T * 0.34, T * 0.36, 0);
    s.rect(T * 0.1, T * 0.42, T * 0.08, T * 0.1, 1);
    s.rect(T * 0.82, T * 0.42, T * 0.08, T * 0.1, 1);
    d.disc(T * 0.5, T * 0.52, T * 0.33, 1);
    d.disc(T * 0.5, T * 0.4, T * 0.33, 0);
    d.rect(T * 0.1, T * 0.42, T * 0.06, T * 0.08, 1);
  } else {
    s.disc(T * 0.5, T * 0.42, T * 0.28, 1);
    s.rect(T * 0.34, T * 0.5, T * 0.32, T * 0.26, 1);
    s.disc(T * 0.38, T * 0.72, T * 0.05, 1);
    s.disc(T * 0.62, T * 0.72, T * 0.05, 1);
    d.disc(T * 0.4, T * 0.42, T * 0.08, 1);
    d.disc(T * 0.6, T * 0.42, T * 0.08, 1);
    d.poly(P([[0.5, 0.5], [0.55, 0.6], [0.45, 0.6]]), 1);
    for (let i = 0; i < 5; i++) d.rect(T * (0.37 + i * 0.065), T * 0.64, Math.max(1, T * 0.015), T * 0.1, 1);
  }
}

const screenprint = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: pick(rnd, SUBJECTS), drawn: '', g: 1, T: 0, lay: null, deal: Array.from({ length: 9 }, () => deal4(rnd)), bump: 0, gen: 0, clock: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W;
    for (const hh of hits) if (isLow(hh)) { w.bump = Math.min(1, w.bump + hh.strength); w.gen++; }
    w.bump *= Math.exp(-dt * 4);
    if (f.beat.on) for (let k = 0; k < 9; k++) if (rnd() < 0.5) w.deal[k] = deal4(rnd);
    if (f.section === 'change') w.kind = pick(rnd, SUBJECTS);
    const energy = clamp(0.5 * f.rel.bassDrive + 0.3 * f.level + 0.2 * Math.min(1, f.onsetRate / 6)), wantG = energy > 0.7 ? 3 : energy > 0.4 ? 2 : 1;
    if (f.bpm ? f.beat.on && f.beat.count % 4 === 0 : (w.clock += dt) > 2) { w.clock = 0; w.g = wantG; }
    const g = w.g, T = Math.floor(N / g), x0 = Math.floor((N - g * T) / 2);
    if (w.T !== T || w.drawn !== w.kind) { w.T = T; w.drawn = w.kind; w.lay = [0, 1, 2].map(() => new Raster(T)); subject(w.lay, w.kind, T); }
    const [L0, L1, L2] = w.lay.map((q) => q.buf), buf = r.buf, mag = (0.8 + 2.5 * w.bump) * u, ox = [0, 0, 0], oy = [0, 0, 0];
    for (let k = 0; k < g * g; k++) {
      const roles = w.deal[k], tx0 = x0 + (k % g) * T, ty0 = x0 + Math.floor(k / g) * T;
      for (let l = 0; l < 3; l++) { // every layer sits a pixel or two off, in its own direction
        const a = hash(k * 3 + l, w.gen) * TAU, m = mag * (0.4 + hash(k * 3 + l, w.gen + 99) * 0.8);
        ox[l] = Math.round(Math.cos(a) * m); oy[l] = Math.round(Math.sin(a) * m);
      }
      for (let y = 0; y < T; y++) {
        const row = (ty0 + y) * N + tx0, y0 = y - oy[0], y1 = y - oy[1], y2 = y - oy[2], in0 = y0 >= 0 && y0 < T, in1 = y1 >= 0 && y1 < T, in2 = y2 >= 0 && y2 < T;
        for (let x = 0; x < T; x++) {
          const x2 = x - ox[2], x1 = x - ox[1], xx = x - ox[0];
          buf[row + x] = in2 && x2 >= 0 && x2 < T && L2[y2 * T + x2] ? roles[3]
            : in1 && x1 >= 0 && x1 < T && L1[y1 * T + x1] ? roles[2]
              : in0 && xx >= 0 && xx < T && L0[y0 * T + xx] ? roles[1] : roles[0];
        }
      }
    }
    targets.push({ x: x0 + T * 0.2, y: x0 + T * 0.2, w: T * 0.6, h: T * 0.6 });
  },
};

// ---------------------------------------------------------------------------------------------- benday
// A comic panel printed in Ben-Day dots: an eye with a tear, a wave or an empty speech bubble, one per scene, and
// a starburst that grows on the kicks. The dot size follows the shading and the level, a snare pops a new burst
// with radiating lines where it landed, the tear drops on the bar, the wave rolls with the mids.
const PANELS = ['eye', 'wave', 'bubble'];
// an ink only prints on its own paper: cool dots on the ground, hot shading on a white, ink shading on the water
const PAPER = new Uint8Array(32).fill(255);
PAPER[COOL] = BG; PAPER[HOT] = BRIGHT; PAPER[FIG] = COOL;

const benday = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: pick(rnd, PANELS), ink: null, rad2: new Float32Array(8), cell: 0, dx2: new Float32Array(0), grow: 0, pops: [], tear: 0, drop: null, amp: 0.5, bx: 0.25 + rnd() * 0.5, by: 0.22 + rnd() * 0.15, rot: rnd() * TAU });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s } = W, lw = Math.max(1, Math.round(1.6 * u)), cell = Math.max(3, Math.round(3.2 * u));
    if (!w.ink || w.ink.N !== N) w.ink = new Raster(N);
    const ink = w.ink, ib = ink.buf, buf = r.buf;
    for (const hh of hits) {
      if (isLow(hh)) { w.grow = Math.min(1.5, w.grow + hh.strength * 0.8); s.shake = Math.max(s.shake, 0.2 * hh.strength); }
      else if (hh.kind === 'snare') { w.pops.push({ x: hh.x * N, y: hh.y * N, life: 0.5, rot: rnd() * TAU, c: rnd() < 0.5 ? HOT : COOL }); if (w.pops.length > 4) w.pops.shift(); }
    }
    if (f.section === 'change') w.kind = pick(rnd, PANELS);
    w.grow *= Math.exp(-dt * 2.5);
    w.rot += dt * 0.3;
    w.amp = follow(w.amp, f.rel.bassDrive, dt, 0.3);
    // the sky prints in cool dots, bigger toward the bottom
    for (let b = 0; b < 6; b++) ink.rect(0, (b / 6) * N, N, N / 6 + 1, COOL + 32 * (b + 1));
    if (w.kind === 'eye') {
      const cx = N / 2, cy = 0.5 * N, len = 0.72 * N, look = Math.sin(f.beat.phase * TAU) * 1.5 * u;
      r.poly(lens(cx, cy, len, 0.5, 0, 10), FIG);
      r.poly(lens(cx, cy, len - 4 * lw, 0.5, 0, 10), BRIGHT);
      ink.poly(lens(cx, cy - len * 0.08, len - 4 * lw, 0.34, 0, 10), HOT + 32 * 3); // the lid's shadow, printed on the white
      r.disc(cx + look, cy, 0.13 * N * (1 + 0.06 * f.beat.pulse), COOL);
      r.disc(cx + look, cy, 0.06 * N, FIG);
      r.disc(cx + look + 0.04 * N, cy - 0.04 * N, 0.02 * N, BRIGHT);
      for (let i = 0; i < 5; i++) { const a = -Math.PI * (0.25 + i * 0.125), x = cx + Math.cos(a) * len * 0.42, y = cy + Math.sin(a) * len * 0.22; r.stroke(x, y, x + Math.cos(a) * 0.07 * N, y + Math.sin(a) * 0.1 * N, lw, FIG); }
      for (let i = 0; i < 4; i++) { const q0 = i / 4 - 0.5, q1 = (i + 1) / 4 - 0.5, by = (q) => cy - len * (0.36 + 0.1 * (1 - 4 * q * q)); r.stroke(cx + q0 * len * 0.8, by(q0), cx + q1 * len * 0.8, by(q1), lw * 1.5, FIG); }
      // the tear fills up through the bar and drops on the next one
      w.tear = Math.min(1, w.tear + dt * (f.bpm ? f.bpm / 240 : 0.5));
      if (f.beat.on && f.beat.count % 4 === 0 && w.tear >= 1 && !w.drop) { w.drop = { y: cy + len * 0.22, vy: 0 }; w.tear = 0; }
      const tx = cx + len * 0.3, tr = (1 + 2.5 * w.tear) * u;
      r.disc(tx, cy + len * 0.2 + tr, tr, COOL);
      if (w.drop) {
        w.drop.vy += dt * N * 0.8;
        w.drop.y += w.drop.vy * dt;
        r.poly([[tx, w.drop.y - 6 * u], [tx + 3 * u, w.drop.y], [tx - 3 * u, w.drop.y]], COOL);
        r.disc(tx, w.drop.y, 3 * u, COOL);
        r.disc(tx - u, w.drop.y - u, u, BRIGHT);
        if (w.drop.y > N + 6 * u) w.drop = null;
      }
      targets.push({ x: cx - 0.14 * N, y: cy - 0.14 * N, w: 0.28 * N, h: 0.28 * N });
    } else if (w.kind === 'wave') {
      const ph = f.rel.midClock * 0.5, amp = 0.12 * N * (0.6 + 0.8 * w.amp), base = 0.6 * N, pts = [], n = 18;
      let crest = 0, cy = N;
      for (let i = 0; i <= n; i++) { const x = (i / n) * N, y = base - amp * (0.5 + 0.5 * Math.sin((i / n) * TAU * 1.2 - ph)); pts.push([x, y]); if (y < cy) { cy = y; crest = x; } }
      const body = pts.concat([[N, N], [0, N]]);
      r.poly(body, COOL);
      ink.poly(body.map(([x, y]) => [x, y + 0.1 * N]), FIG + 32 * 2);
      ink.poly(body.map(([x, y]) => [x, y + 0.28 * N]), FIG + 32 * 4);
      r.disc(crest, cy + 0.08 * N, 0.09 * N, COOL);
      r.disc(crest - 0.02 * N, cy + 0.1 * N, 0.045 * N, BRIGHT);
      for (let i = 0; i < n; i++) { if (pts[i][1] < base - amp * 0.75) r.disc(pts[i][0], pts[i][1], (1.2 + hash(i, 7) * 2.2) * u * (1 + 0.3 * f.beat.pulse), BRIGHT); r.stroke(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], lw, FIG); }
      targets.push({ x: crest - 0.1 * N, y: cy - 0.05 * N, w: 0.2 * N, h: 0.2 * N });
    } else {
      const bw = 0.62 * N * (1 + 0.03 * f.beat.pulse), bh = 0.36 * N * (1 + 0.03 * f.beat.pulse), bx = N / 2 - bw / 2, by = 0.5 * N, rr = 0.07 * N;
      const bubble = (inset, c) => {
        const x = bx + inset, y = by + inset, ww = bw - 2 * inset, hh = bh - 2 * inset, cr = rr - inset;
        r.rect(x + cr, y, ww - 2 * cr, hh, c);
        r.rect(x, y + cr, ww, hh - 2 * cr, c);
        for (const [px, py] of [[x + cr, y + cr], [x + ww - cr, y + cr], [x + cr, y + hh - cr], [x + ww - cr, y + hh - cr]]) r.disc(px, py, cr, c);
      };
      bubble(0, FIG);
      // the tail roots inside the top edge and points up at the burst; its outline reaches past the inner tip
      const tail = (d, c) => r.poly([[bx + bw * 0.3 - d, by + 4 * lw], [bx + bw * 0.45 + d, by + 4 * lw], [w.bx * N, w.by * N + 0.12 * N * (1 + w.grow) - 2 * d]], c);
      tail(2 * lw, FIG);
      bubble(2 * lw, BRIGHT);
      tail(0, BRIGHT);
      ink.rect(bx + bw * 0.6, by + bh * 0.55, bw * 0.4 - 2 * lw, bh * 0.45 - 2 * lw, HOT + 32 * 2); // the shaded corner
      targets.push({ x: bx, y: by, w: bw, h: bh });
    }
    // the starburst over it all, bigger on every kick, and the snare's pops with their lines
    const R = (0.1 + 0.14 * w.grow) * N, sx = w.bx * N, sy = w.by * N;
    r.poly(star(sx, sy, 10, R + lw, R * 0.6 + lw, w.rot, 0.25), FIG);
    r.poly(star(sx, sy, 10, R, R * 0.6, w.rot, 0.25), HOT);
    r.poly(star(sx, sy, 10, R * 0.55, R * 0.3, w.rot + 0.2, 0.25), BRIGHT);
    w.pops = w.pops.filter((p) => (p.life -= dt) > 0);
    for (const p of w.pops) {
      const k = 1 - p.life / 0.5, pr = (0.04 + 0.08 * ease(k)) * N;
      for (let i = 0; i < 12; i++) { const a = p.rot + (i / 12) * TAU, l1 = pr * (1.6 + 0.6 * hash(i, 1) + k); r.line(p.x + Math.cos(a) * pr * 1.3, p.y + Math.sin(a) * pr * 1.3, p.x + Math.cos(a) * l1, p.y + Math.sin(a) * l1, FIG); }
      r.poly(star(p.x, p.y, 8, pr + lw, pr * 0.55 + lw, p.rot, 0.3), FIG);
      r.poly(star(p.x, p.y, 8, pr, pr * 0.55, p.rot, 0.3), p.c);
    }
    // the print: a dot per cell of the grid wherever the ink raster says so, its size by the shade and the level;
    // the distance to the cell centre along x comes from two tables, one per row parity (every other row shifts)
    if (w.cell !== cell || w.dx2.length !== 2 * N) {
      w.cell = cell; w.dx2 = new Float32Array(2 * N);
      for (let x = 0; x < N; x++) for (let p = 0; p < 2; p++) { const off = p * 0.5, dx = x + 0.5 - (Math.floor(x / cell - off) + 0.5 + off) * cell; w.dx2[p * N + x] = dx * dx; }
    }
    for (let l = 0; l < 8; l++) { const rad = cell * (0.08 + 0.065 * l) * (0.75 + 0.5 * f.level); w.rad2[l] = rad * rad; }
    const rad2 = w.rad2, dx2 = w.dx2;
    for (let y = 0; y < N; y++) {
      const row = Math.floor(y / cell), dy = y + 0.5 - (row + 0.5) * cell, dy2 = dy * dy, o = (row & 1) * N;
      for (let x = 0, i = y * N; x < N; x++, i++) {
        const v = ib[i];
        if (v !== 255 && buf[i] === PAPER[v & 31] && dx2[o + x] + dy2 <= rad2[v >> 5]) buf[i] = v & 31;
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------- haring
// Chunky outlined figures dancing in a row, more of them as the energy rises, motion dashes round their hands and
// feet that pulse with the treble, a radiating heart or sun over them. The pose steps on every beat, a strong
// kick is a jump, a snare swaps the fill colours round.
const POSES = [[1, 1], [0, 0], [2, 1], [1, 0]]; // [arms, legs]: arms 0 down, 1 up, 2 one up; legs 0 together, 1 apart

// a figure of thick strokes; `extra` widens every stroke, so drawn twice it gets an outline
function dancer(r, x, base, h, arms, legs, c, extra, lean) {
  const bw = h * 0.14 + extra, lw = h * 0.09 + extra, hip = base - h * 0.42, neck = base - h * 0.76, hx = x + lean * h * 0.08, spread = legs ? 0.18 : 0.06;
  const limb = (x0, y0, x1, y1) => { r.stroke(x0, y0, x1, y1, lw, c); r.disc(x1, y1, lw / 2, c); };
  r.stroke(x, hip, hx, neck, bw, c);
  r.disc(x, hip, bw / 2, c);
  r.disc(hx, neck, bw / 2, c);
  r.disc(hx, neck - h * 0.14, h * 0.11 + extra / 2, c);
  const feet = [[x - h * spread, base], [x + h * spread, base]], ay = (up) => (up ? neck - h * 0.3 : neck + h * 0.25);
  const hands = [[hx - h * 0.26, ay(arms !== 0)], [hx + h * 0.26, ay(arms === 1)]];
  for (const [fx, fy] of feet) limb(x, hip, fx, fy);
  for (const [px, py] of hands) limb(hx, neck - h * 0.02, px, py);
  return { hands, feet, cx: x, cy: hip };
}

const haring = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { n: 3, icon: rnd() < 0.5 ? 'heart' : 'sun', colOff: 0, jumpT: 1, clock: 0, step: 0, pose: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s } = W, lw = Math.max(1, Math.round(1.4 * u)), base = 0.86 * N, treb = f.rel.trebDrive;
    for (const hh of hits) {
      if (isLow(hh) && hh.strength > 0.7 && w.jumpT >= 1) { w.jumpT = 0; s.shake = Math.max(s.shake, 0.15); }
      else if (hh.kind === 'snare') w.colOff++;
    }
    const energy = clamp(0.5 * f.rel.bassDrive + 0.3 * f.level + 0.2 * Math.min(1, f.onsetRate / 6)), want = 2 + Math.round(energy * 4);
    if (f.bpm ? f.beat.on && f.beat.count % 4 === 0 : (w.clock += dt) > 2) { w.clock = 0; w.n = want; }
    if (beatLocked(f) ? f.beat.on : (w.step += dt) > 0.5) { w.step = 0; w.pose++; }
    w.jumpT = Math.min(1, w.jumpT + dt * 2.5);
    // the jump is a parabola (constant gravity) that comes back to the floor; the ground line sits under the outlined feet
    const jt = w.jumpT, jump = 4 * jt * (1 - jt) * 0.12 * N, n = w.n, h = clamp(1.6 * N / n, 0.2 * N, 0.42 * N), fills = [HOT, COOL, LMID, MID, BRIGHT];
    r.rect(0, base + h * 0.045 + lw, N, lw, FIG);
    for (let i = 0; i < n; i++) {
      const x = (N * (i + 0.5)) / n, [arms, legs] = w.jumpT < 1 ? [1, 0] : POSES[(w.pose + i) % 4], lean = Math.sin(f.beat.phase * TAU + i) * 0.5;
      dancer(r, x, base - jump, h, arms, legs, FIG, 2 * lw, lean);
      const J = dancer(r, x, base - jump, h, arms, legs, fills[(i + w.colOff) % 5], 0, lean);
      // motion dashes: three short lines fanning out from every hand and foot, longer with the treble
      const dl = (1.5 + 5 * treb) * u;
      for (const [px, py] of J.hands.concat(J.feet)) {
        const a0 = Math.atan2(py - J.cy, px - J.cx);
        for (let k = -1; k <= 1; k++) { const a = a0 + k * 0.45, g = h * 0.16; r.stroke(px + Math.cos(a) * g, py + Math.sin(a) * g, px + Math.cos(a) * (g + dl), py + Math.sin(a) * (g + dl), lw, FIG); }
      }
      targets.push({ x: x - h * 0.3, y: base - jump - h, w: h * 0.6, h });
    }
    // the icon over the crowd with its rays, which reach out on the beat
    const ix = N / 2, iy = 0.16 * N, ir = 0.06 * N * (1 + 0.1 * f.beat.pulse);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.13; r.stroke(ix + Math.cos(a) * ir * 1.5, iy + Math.sin(a) * ir * 1.5, ix + Math.cos(a) * ir * (2.1 + 0.8 * f.beat.pulse), iy + Math.sin(a) * ir * (2.1 + 0.8 * f.beat.pulse), lw, FIG); }
    if (w.icon === 'sun') { r.disc(ix, iy, ir + lw, FIG); r.disc(ix, iy, ir, HOT); }
    else {
      for (const ex of [lw, 0]) {
        const c = ex ? FIG : HOT;
        r.disc(ix - ir * 0.5, iy - ir * 0.3, ir * 0.55 + ex, c);
        r.disc(ix + ir * 0.5, iy - ir * 0.3, ir * 0.55 + ex, c);
        r.poly([[ix - ir * 1.05 - ex, iy - ir * 0.1], [ix + ir * 1.05 + ex, iy - ir * 0.1], [ix, iy + ir * 1.1 + ex]], c);
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------- kusama
// Infinity dots: pumpkin-like forms and tentacles, one more grown in on every section, all covered in dots whose
// size breathes with the bass, over a field of ground dots drifting with the mids; a snare flips the dot phase,
// a drop turns the forms inside out for a while, the tentacles sway to the mid clock.
const FORM = new Uint8Array(32);
for (const c of [HOT, COOL, LMID, MID]) FORM[c] = 1;

function newForm(rnd, kind, grow) {
  return { kind, x: 0.15 + rnd() * 0.7, y: 0.45 + rnd() * 0.35, s: 0.16 + rnd() * 0.14, c: pick(rnd, [HOT, COOL, LMID, MID]), grow, ph: rnd() * TAU, dir: rnd() < 0.5 ? -1 : 1 };
}

const kusama = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { forms: [], vary: Float32Array.from({ length: 64 }, () => 0.7 + rnd() * 0.6), flip: 0, inv: 0, bass: 0.3 });
    for (let k = 0; k < 4; k++) w.forms.push(newForm(rnd, k % 2 ? 'tentacle' : 'pumpkin', 1));
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, buf = r.buf;
    for (const hh of hits) if (hh.kind === 'snare') w.flip ^= 1;
    if (f.section === 'change') { w.forms.push(newForm(rnd, rnd() < 0.5 ? 'tentacle' : 'pumpkin', 0)); if (w.forms.length > 6) w.forms.shift(); }
    if (f.section === 'drop') w.inv = 3;
    w.inv = Math.max(0, w.inv - dt);
    w.bass = follow(w.bass, f.rel.bassDrive, dt, 0.15);
    let big = null;
    for (const fm of w.forms) {
      fm.grow = Math.min(1, fm.grow + dt * 0.8);
      const S = fm.s * N * ease(fm.grow) * (1 + 0.04 * f.beat.pulse);
      if (fm.kind === 'pumpkin') {
        const x = fm.x * N, y = fm.y * N + Math.sin(t * 0.7 + fm.ph) * 1.5 * u;
        for (let i = -2; i <= 2; i++) { const ai = Math.abs(i); r.disc(x + i * S * 0.4, y + ai * S * 0.04, S * 0.46 - ai * S * 0.07, fm.c); r.disc(x + i * S * 0.36, y - S * 0.2 + ai * S * 0.04, S * 0.36 - ai * S * 0.06, fm.c); }
        r.rect(x - S * 0.06, y - S * 0.74, S * 0.12, S * 0.22, FIG);
        if (!big || S > big.S) big = { x, y, S };
      } else {
        for (let i = 0; i < 14; i++) {
          const p = i / 13, px = fm.x * N + Math.sin(p * 3 + f.rel.midClock * 0.6 * fm.dir + fm.ph) * S * 0.6 * p, py = N - p * S * 2.6;
          r.disc(px, py, S * (0.3 - 0.22 * p), fm.c);
        }
      }
    }
    if (big) targets.push({ x: big.x - big.S, y: big.y - big.S * 0.5, w: 2 * big.S, h: big.S });
    // the dots: a fine grid on the forms, a coarser drifting one on the ground, sizes a little different per cell
    const cf = Math.max(3, Math.round(3.6 * u)), cb = Math.max(4, Math.round(5 * u)), inv = w.inv > 0;
    const rf = cf * (0.2 + 0.2 * w.bass + 0.08 * f.beat.pulse), rb = cb * (0.14 + 0.1 * w.bass);
    const ofx = w.flip * cf * 0.5, obx = f.rel.midClock * 3 * u + w.flip * cb * 0.5, oby = f.rel.trebClock * 1.5 * u, vary = w.vary;
    for (let y = 0; y < N; y++) {
      const rowF = Math.floor((y + ofx) / cf), dyF = y + ofx + 0.5 - (rowF + 0.5) * cf, rowB = Math.floor((y + oby) / cb), dyB = y + oby + 0.5 - (rowB + 0.5) * cb;
      for (let x = 0, i = y * N; x < N; x++, i++) {
        const v = buf[i];
        if (v === BG) {
          const col = Math.floor((x + obx) / cb), dx = x + obx + 0.5 - (col + 0.5) * cb, rad = rb * vary[(col * 7 + rowB * 13) & 63];
          if (dx * dx + dyB * dyB <= rad * rad) buf[i] = DARK;
        } else if (FORM[v]) {
          const col = Math.floor((x + ofx) / cf), dx = x + ofx + 0.5 - (col + 0.5) * cf, rad = rf * vary[(col * 5 + rowF * 11) & 63], on = dx * dx + dyF * dyF <= rad * rad;
          if (inv ? !on : on) buf[i] = FIG;
        }
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------- memphis
// A Memphis still life: pastel solids (a cylinder, a cone, a ball, a zigzag, a squiggle, a striped block) on a
// terrazzo floor, all bouncing on the beat and spinning with the mids; a kick drops a new one in from the top, a
// snare makes them hop, the treble throws confetti, a new section sets the table again.
const SOLIDS = ['cyl', 'cone', 'ball', 'zig', 'squiggle', 'stripes'];

// `h`/`vy` are the fall of a dropped solid (height above the floor line, in cells); `p`/`amp` the beat hop it settles into
function solid(rnd, x) {
  return { kind: pick(rnd, SOLIDS), x: x ?? 0.1 + rnd() * 0.8, s: 0.14 + rnd() * 0.14, c: pick(rnd, [HOT, COOL, LMID, MID, BRIGHT]), rot: rnd() * TAU, spin: (rnd() - 0.5) * 3, ph: rnd(), air: false, h: 0, vy: 0, p: 1, amp: 0 };
}

// a block of stripes: the block in FIG, the stripes across it in BRIGHT
function striped(r, cx, cy, hw, hh, a, n, lw) {
  r.poly(rotRect(cx, cy, hw, hh, a), FIG);
  for (let k = 0; k < n; k++) { const d = ((k + 0.5) / n - 0.5) * 2 * hw; r.poly(rotRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, hw / n * 0.45, hh - lw, a), BRIGHT); }
}

const memphis = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { solids: Array.from({ length: 5 }, () => solid(rnd)), chips: Array.from({ length: 40 }, () => ({ x: rnd(), y: rnd(), s: 1 + rnd() * 2.5, a: rnd() * TAU, c: pick(rnd, [MID, LMID, DARK, HOT, COOL]) })),
      confetti: [], hop: 0, panel: rnd() * TAU, bt: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, lw = Math.max(1, Math.round(1.2 * u)), fy = 0.74 * N;
    for (const hh of hits) {
      if (isLow(hh)) { const sd = solid(rnd, 0.1 + hh.x * 0.8); sd.air = true; sd.h = fy + sd.s * N; w.solids.push(sd); if (w.solids.length > 7) w.solids.shift(); }
      else if (hh.kind === 'snare') w.hop = 1;
    }
    if (f.section === 'change') { w.solids = Array.from({ length: 5 }, () => solid(rnd)); w.panel = rnd() * TAU; }
    w.hop *= Math.exp(-dt * 5);
    striped(r, 0.24 * N, 0.3 * N, 0.14 * N, 0.2 * N, w.panel + t * 0.05, 5, lw);
    r.rect(0, fy, N, N - fy, LMID);
    for (const ch of w.chips) r.poly(rotRect(ch.x * N, ch.y < 0.5 ? fy + ch.y * 2 * (N - fy) : ch.y * N * 0.7, ch.s * u, ch.s * 0.6 * u, ch.a), ch.c);
    const bp = beatLocked(f) ? f.beat.phase : (w.bt = (w.bt + dt * (f.bpm ? f.bpm / 60 : 2)) % 1), amp = 0.05 * N * (0.4 + 0.8 * f.rel.bassDrive) + 0.05 * N * w.hop, g = 6 * N;
    let last = null;
    for (const sd of w.solids) {
      sd.rot += dt * sd.spin * (0.3 + 1.5 * f.rel.midDrive);
      const S = sd.s * N, x = sd.x * N, a = sd.rot, c = sd.c;
      let lift;
      if (sd.air) { // a dropped solid falls under gravity and bounces out on the floor line, then joins the hop in phase
        sd.vy += g * dt;
        sd.h -= sd.vy * dt;
        if (sd.h <= 0) { sd.h = 0; sd.vy *= -0.35; if (sd.vy > -0.3 * N) { sd.air = false; sd.ph = (1 - bp) % 1; sd.p = 0; sd.amp = amp; } }
        lift = sd.h;
      } else { // the beat hop: one parabola per beat, back on the floor at the beat, its height set at take-off
        const p = (bp + sd.ph) % 1;
        if (p < sd.p) sd.amp = amp;
        sd.p = p;
        lift = 4 * p * (1 - p) * sd.amp;
      }
      const yb = fy - lift;
      // the turning shapes ride on their lowest corner instead of hanging in the air
      let oy = yb - S * 0.5;
      const onFloor = (hw, hh) => { oy = yb - hw * Math.abs(Math.sin(a)) - hh * Math.abs(Math.cos(a)); };
      const at = (lx, ly) => [x + lx * Math.cos(a) - ly * Math.sin(a), oy + lx * Math.sin(a) + ly * Math.cos(a)];
      if (sd.kind === 'cyl') {
        r.rect(x - S * 0.3 - lw, yb - S - lw, S * 0.6 + 2 * lw, S + lw, FIG);
        r.ring(x, yb - S, S * 0.15 + lw / 2, S * 0.3 + lw, FIG, 0.4);
        r.rect(x - S * 0.3, yb - S, S * 0.6, S, c);
        for (const sa of [a, a + Math.PI]) if (Math.sin(sa) > 0) { const sw = Math.max(1, 2 * u * Math.sin(sa)); r.rect(x + Math.cos(sa) * S * 0.27 - sw / 2, yb - S, sw, S, BRIGHT); } // a stripe round the cylinder shows on the front face only
        r.ring(x, yb - S, S * 0.15, S * 0.3, LMID, 0.4);
      } else if (sd.kind === 'cone') {
        const tip = Math.sin(a) * S * 0.08;
        r.ring(x, yb, S * 0.19 + lw / 2, S * 0.38 + lw, FIG, 0.35);
        r.poly([[x - S * 0.38 - lw, yb + lw], [x + S * 0.38 + lw, yb + lw], [x + tip, yb - S * 1.1 - 2 * lw]], FIG);
        r.ring(x, yb, S * 0.19, S * 0.38, DARK, 0.35);
        r.poly([[x - S * 0.38, yb], [x + S * 0.38, yb], [x + tip, yb - S * 1.1]], c);
      } else if (sd.kind === 'ball') {
        r.disc(x, yb - S * 0.42, S * 0.42 + lw, FIG);
        r.disc(x, yb - S * 0.42, S * 0.42, c);
        for (const sa of [a, a + Math.PI]) if (Math.sin(sa) > 0) r.disc(x + Math.cos(sa) * S * 0.28, yb - S * 0.42 + Math.sin(sa) * S * 0.12, S * 0.09, MID); // the spot on the ball comes round the front
        r.disc(x - S * 0.15, yb - S * 0.58, S * 0.1, BRIGHT);
      } else if (sd.kind === 'zig') {
        onFloor(S * 0.54, S * 0.14 + lw);
        for (let k = 0; k < 6; k++) { const [x0, y0] = at((k - 3) * S * 0.18, k % 2 ? -S * 0.14 : S * 0.14), [x1, y1] = at((k - 2) * S * 0.18, k % 2 ? S * 0.14 : -S * 0.14); r.stroke(x0, y0, x1, y1, 2 * lw, FIG); }
      } else if (sd.kind === 'squiggle') {
        onFloor(S * 0.65, S * 0.16 + 1.75 * lw);
        for (const [ww, cc] of [[3.5 * lw, FIG], [1.6 * lw, c]])
          for (let k = 0; k < 15; k++) { const [x0, y0] = at((k / 15 - 0.5) * S * 1.3, Math.sin((k / 15) * TAU * 1.5) * S * 0.16), [x1, y1] = at(((k + 1) / 15 - 0.5) * S * 1.3, Math.sin(((k + 1) / 15) * TAU * 1.5) * S * 0.16); r.stroke(x0, y0, x1, y1, ww, cc); }
      } else { onFloor(S * 0.45, S * 0.35); striped(r, x, oy, S * 0.45, S * 0.35, a, 4, lw); }
      last = { x: x - S * 0.5, y: yb - S * 1.1, w: S, h: S * 1.1 };
    }
    if (last) targets.push(last);
    // confetti from the top with the treble (so many a second, whatever the frame rate), swaying down at its
    // terminal speed until it lands somewhere on the floor, where it lies for a moment
    for (let k = (f.rel.trebDrive * 75 + 3) * dt; k > 0; k--) if (rnd() < k && w.confetti.length < 120) w.confetti.push({ x: rnd() * N, y: -2 * u, vy: (0.1 + rnd() * 0.15) * N, ph: rnd() * TAU, land: fy + rnd() * (N - fy), rest: 0.8, c: pick(rnd, [HOT, COOL, BRIGHT, FIG]) });
    w.confetti = w.confetti.filter((cf) => {
      if (cf.y < cf.land) {
        cf.y = Math.min(cf.land, cf.y + cf.vy * dt);
        cf.x += Math.sin(t * 4 + cf.ph) * 6 * u * dt;
        if (Math.sin(t * 3 + cf.ph) > 0) r.rect(cf.x, cf.y, 2 * u, Math.max(1, u), cf.c); else r.rect(cf.x, cf.y, Math.max(1, u), 2 * u, cf.c);
        return true;
      }
      r.rect(cf.x, cf.y, 2 * u, Math.max(1, u), cf.c);
      return (cf.rest -= dt) > 0;
    });
  },
};

// ---------------------------------------------------------------------------------------------- deco
// An Art Deco sunburst: a fan of rays from behind a skyline of stepped towers, concentric arcs rippling out on
// the beat, chevrons climbing with the bass clock under it all; one bright ray sweeps round with the beat, the
// towers grow with the low end and their windows light on the hats.
const deco = {
  init(W) {
    const { w, rnd } = W, n = 16 + 4 * Math.floor(rnd() * 3), lut = new Uint8Array(1025);
    // the ray under a pixel by its pseudo-angle q = dx / (|dx| + dy), so the fan needs no atan2 per pixel
    for (let i = 0; i <= 1024; i++) { const q = (i / 1024) * 2 - 1; lut[i] = Math.min(n - 1, Math.floor((Math.atan2(1 - Math.abs(q), q) / Math.PI) * n)); }
    Object.assign(w, { n, lut, bass: 0.3, lit: 0.2, sweepT: 0,
      towers: Array.from({ length: 6 }, (_, i) => ({ x: 0.08 + i * 0.17 + rnd() * 0.06, w: 0.08 + rnd() * 0.07, h: 0.18 + rnd() * 0.3, steps: 3 + Math.floor(rnd() * 3) })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, hits, targets } = W, buf = r.buf, n = w.n, lut = w.lut, cx = N / 2, cy = 0.72 * N, R0 = 0.11 * N * (1 + 0.12 * f.beat.pulse), lw = Math.max(1, Math.round(1.2 * u));
    for (const hh of hits) if (hh.kind === 'hat' || hh.kind === 'perc') w.lit = Math.min(1, w.lit + 0.15);
    w.lit = Math.max(0.1, w.lit - dt * 0.25);
    w.bass = follow(w.bass, f.rel.bassDrive, dt, 0.2);
    r.fill(DARK);
    // the fan: rays alternate two values, the swept one is bright and its neighbours light on the beat; arcs over it
    const sweep = beatLocked(f) ? (f.beat.count * 2 + Math.floor(f.beat.phase * 2)) % n : Math.floor((w.sweepT += dt * 3)) % n;
    const sp = 0.09 * N, ripple = beatLocked(f) ? f.beat.phase : (t * 1.5) % 1, R02 = R0 * R0, hz = Math.floor(cy), lit = f.beat.pulse > 0.4;
    for (let y = 0; y < hz; y++) {
      const dy = cy - y - 0.5;
      for (let x = 0, i = y * N; x < N; x++, i++) {
        const dx = x + 0.5 - cx, d2 = dx * dx + dy * dy;
        if (d2 < R02) { buf[i] = BRIGHT; continue; }
        const k = lut[((dx / (Math.abs(dx) + dy) + 1) * 512) | 0], rel = (k - sweep + n) % n;
        let c = rel === 0 ? BRIGHT : (rel === 1 || rel === n - 1) && lit ? LMID : k & 1 ? MID : DARK;
        const b = (Math.sqrt(d2) - R0) / sp - ripple;
        if (b >= 0 && b % 1 < 0.1) c = FIG;
        buf[i] = c;
      }
    }
    // the skyline: stepped towers that climb with the bass, windows lit by the hats
    const hz2 = Math.round(cy);
    r.rect(0, hz2, N, N - hz2, DARK);
    w.towers.forEach((tw, ti) => {
      const hh = tw.h * N * (0.7 + 0.6 * w.bass), bw = tw.w * N, x = tw.x * N;
      for (let k = 0; k < tw.steps; k++) {
        const sw = bw * (1 - (k / tw.steps) * 0.75), top = cy - hh * ((k + 1) / tw.steps);
        r.rect(x - sw / 2, top, sw, hh / tw.steps + 1, FIG);
      }
      r.rect(x - u / 2, cy - hh - 0.05 * N, Math.max(1, u), 0.05 * N, FIG);
      for (let wy = cy - 3 * u, j = 0; wy > cy - hh + 2 * u; wy -= 3 * u, j++)
        for (let wx = -1; wx <= 1; wx++) if (hash(ti * 100 + j, wx + 1) < w.lit) r.rect(x + wx * 2.5 * u - u / 2, wy, Math.max(1, u), Math.max(1, u), DARK);
      targets.push({ x: x - bw / 2, y: cy - hh, w: bw, h: hh });
    });
    // chevrons climbing with the bass clock
    const band = 0.78 * N, rs = 0.055 * N, climb = ((f.rel.bassClock * 0.25) % 1) * rs, zw = N / 8;
    for (let j = 0; j < 5; j++) {
      const y0 = N + rs * 0.5 - climb - j * rs;
      if (y0 < band + rs * 0.4) continue;
      for (let k = 0; k < 8; k++) r.stroke(k * zw, y0 + (k % 2 ? 0 : rs * 0.7), (k + 1) * zw, y0 + (k % 2 ? rs * 0.7 : 0), lw, LMID);
    }
    r.rect(0, band - lw, N, lw, FIG);
  },
};

// ---------------------------------------------------------------------------------------------- constructivist
// A diagonal composition: a big hot wedge driving at a circle, bars alongside it that reach out with the bass, a
// grid of small marks ticking with the hats, rings; the wedge strikes the circle on every kick, the whole thing
// tilts to a new angle on a section and bobs with the mid clock.
const constructivist = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { ang: -0.55, angT: -0.55, strike: 0, tick: 0, bass: 0.3,
      bars: Array.from({ length: 5 }, (_, i) => ({ y: -0.34 + i * 0.09, len: 0.3 + rnd() * 0.3, th: 0.012 + rnd() * 0.02, c: i === 2 ? COOL : FIG })) });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s } = W, cx = 0.44 * N + Math.sin(f.rel.midClock * 0.5) * 2 * u, cy = 0.52 * N + Math.cos(f.rel.midClock * 0.4) * 2 * u;
    for (const hh of hits) {
      if (isLow(hh)) { w.strike = 1; s.shake = Math.max(s.shake, 0.3 * hh.strength); }
      else if (hh.kind === 'hat' || hh.kind === 'perc') w.tick++;
    }
    if (f.section === 'change') { const d = 0.35 + rnd() * 0.5; w.angT = w.ang + d > 1.1 ? w.ang - d : w.ang - d < -1.1 ? w.ang + d : w.ang + (rnd() < 0.5 ? -d : d); }
    w.ang = followAngle(w.ang, w.angT, dt, 0.6);
    w.strike *= Math.exp(-dt * 7);
    w.bass = follow(w.bass, f.rel.bassDrive, dt, 0.12);
    const a = w.ang, c = Math.cos(a), sn = Math.sin(a), P = (x, y) => [cx + (x * c - y * sn) * N, cy + (x * sn + y * c) * N], st = w.strike;
    const bar = (x0, y, len, th, col) => { const [bx, by] = P(x0 + len / 2, y); r.poly(rotRect(bx, by, (len / 2) * N, (th / 2) * N, a), col); };
    bar(-0.9, 0.46, 1.8, 0.012, FIG);
    for (const b of w.bars) bar(-0.62, b.y, b.len * (0.45 + 0.9 * w.bass) + 0.02 * f.beat.pulse, b.th, b.c);
    // the wedge and the circle it beats: the tip drives in on the kick, the circle gives
    r.poly([P(-0.72, -0.15), P(-0.72, 0.11), P(-0.02 + 0.1 * st, 0)], HOT); // at full strike the tip reaches the circle's edge (at 0.08 once it has given)
    const [ox, oy] = P(0.21 + 0.04 * st, 0), R = 0.17 * N;
    r.disc(ox, oy, R, FIG);
    r.ring(ox, oy, R * 0.72, Math.max(1, 1.5 * u), BRIGHT);
    if (st > 0.55) r.disc(ox, oy, R * 0.45, BRIGHT);
    const [kx, ky] = P(0.42, -0.27), [qx, qy] = P(0.28, 0.3);
    r.disc(kx, ky, 0.05 * N, COOL);
    r.ring(qx, qy, 0.07 * N, Math.max(1, 1.5 * u), LMID);
    // the marks: a grid of small squares, the hats tick through them, the beat lights a column
    const col = f.beat.count % 6;
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 6; i++) {
        const [mx, my] = P(0.02 + i * 0.07, 0.17 + j * 0.07), k = j * 6 + i;
        r.poly(rotRect(mx, my, 0.012 * N, 0.012 * N, a), k === w.tick % 24 ? HOT : i === col && f.beat.pulse > 0.3 ? LMID : MID);
      }
    targets.push({ x: ox - R, y: oy - R, w: 2 * R, h: 2 * R });
  },
};

// ---------------------------------------------------------------------------------------------- suprematist
// Weightless geometry: a big dark square, a cross, a circle and a scatter of thin bars drifting at slight angles
// over the ground, faster with the energy. A snare snaps them all into a new arrangement, square to one axis, that
// relaxes back into tilts and drift; a drop swaps the ground and the figures for a bar; the beat lights one bar.
function shapes8(rnd) {
  const list = [{ kind: 'square', s: 0.26, c: FIG }, { kind: 'cross', s: 0.16, c: HOT }, { kind: 'circle', s: 0.09, c: FIG }];
  for (let i = 0; i < 6; i++) list.push({ kind: 'bar', s: 0.12 + rnd() * 0.22, th: 0.012 + rnd() * 0.03, c: pick(rnd, [FIG, HOT, COOL, DARK, FIG]) });
  for (const sh of list) Object.assign(sh, { x: 0.15 + rnd() * 0.7, y: 0.15 + rnd() * 0.7, a: (rnd() - 0.5) * 0.6, ta: (rnd() - 0.5) * 0.6, vx: (rnd() - 0.5) * 0.02, vy: (rnd() - 0.5) * 0.02 });
  return list;
}

const suprematist = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { shapes: shapes8(rnd), flip: 0, lit: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, energy = clamp(0.5 * f.rel.bassDrive + 0.3 * f.level + 0.2 * f.rel.midDrive), speed = (0.3 + 2.5 * energy) * N;
    for (const hh of hits)
      if (hh.kind === 'snare') { // the snap: a new place for everything, all of it square to one axis
        const axis = pick(rnd, [0, Math.PI / 4, -Math.PI / 4]);
        for (const sh of w.shapes) Object.assign(sh, { x: 0.15 + rnd() * 0.7, y: 0.15 + rnd() * 0.7, a: axis, ta: axis + (rnd() - 0.5) * 0.5, vx: (rnd() - 0.5) * 0.02, vy: (rnd() - 0.5) * 0.02 });
      }
    if (f.section === 'drop') w.flip = 2;
    w.flip = Math.max(0, w.flip - dt);
    if (f.beat.on) w.lit = 3 + (f.beat.count % 6);
    const flipped = w.flip > 0, col = (c) => (flipped ? (c === FIG ? BG : c === DARK ? LMID : c) : c);
    if (flipped) r.fill(FIG);
    w.shapes.forEach((sh, i) => {
      sh.x += sh.vx * speed * dt / N;
      sh.y += sh.vy * speed * dt / N;
      if (sh.x < 0.08) sh.vx = Math.abs(sh.vx); else if (sh.x > 0.92) sh.vx = -Math.abs(sh.vx);
      if (sh.y < 0.08) sh.vy = Math.abs(sh.vy); else if (sh.y > 0.92) sh.vy = -Math.abs(sh.vy);
      sh.a = follow(sh.a, sh.ta, dt, 2);
      const x = sh.x * N, y = sh.y * N, S = sh.s * N, c = i === w.lit && f.beat.pulse > 0.3 ? (sh.c === HOT ? COOL : HOT) : col(sh.c);
      if (sh.kind === 'square') { r.poly(rotRect(x, y, S / 2 * (1 + 0.02 * f.beat.pulse), S / 2 * (1 + 0.02 * f.beat.pulse), sh.a), c); targets.push({ x: x - S / 2, y: y - S / 2, w: S, h: S }); }
      else if (sh.kind === 'cross') { r.poly(rotRect(x, y, S / 2, S * 0.14, sh.a), c); r.poly(rotRect(x, y, S * 0.14, S / 2, sh.a), c); }
      else if (sh.kind === 'circle') r.disc(x, y, S, c);
      else r.poly(rotRect(x, y, S / 2, Math.max(0.6 * u, (sh.th / 2) * N), sh.a), c);
    });
  },
};

// ---------------------------------------------------------------------------------------------- miro
// A constellation of biomorphic blobs joined by thin lines, with asterisk stars, an eye or two and a crescent,
// all bobbing gently with the mids; a tonal hit lights the blob of its pitch class hot or cool and lets it cool
// down through the ramp, a kick dips the lot, the stars flicker with the treble, the lines rewire on a section
// and a dot runs along one of them every beat.
function wire(rnd, n) {
  const lines = [];
  for (let i = 0; i < n; i++) { let j = Math.floor(rnd() * n); if (j === i) j = (j + 1) % n; lines.push([i, j]); }
  return lines;
}

const miro = {
  init(W) {
    const { w, rnd } = W, n = 7;
    Object.assign(w, {
      blobs: Array.from({ length: n }, (_, i) => ({ x: 0.08 + ((i * 0.43 + rnd() * 0.1) % 0.84), y: 0.12 + rnd() * 0.76, s: 0.04 + rnd() * 0.05, c: pick(rnd, [FIG, HOT, COOL, MID, LMID]), ph: rnd() * TAU, lit: 0, lc: HOT,
        lobes: [[rnd() - 0.5, rnd() - 0.5, 0.5 + rnd() * 0.3], [rnd() - 0.5, rnd() - 0.5, 0.4 + rnd() * 0.3]] })),
      lines: wire(rnd, n), stars: Array.from({ length: 9 }, () => ({ x: rnd(), y: rnd(), s: 2 + rnd() * 3, ph: rnd() })),
      eyes: Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => ({ x: 0.15 + rnd() * 0.7, y: 0.15 + rnd() * 0.7, s: 0.05 + rnd() * 0.04, a: rnd() - 0.5 })),
      moon: { x: 0.2 + rnd() * 0.6, y: 0.1 + rnd() * 0.2 }, dip: 0, run: 0, bob: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, lw = Math.max(1, Math.round(u));
    for (const hh of hits) {
      if (isLow(hh)) w.dip = Math.min(1, w.dip + 0.6 * hh.strength);
      if (isTonal(hh)) { const b = w.blobs[hh.pc % w.blobs.length]; b.lit = 1; b.lc = hh.pc % 2 ? HOT : COOL; }
    }
    if (f.section === 'change') w.lines = wire(rnd, w.blobs.length);
    if (f.beat.on) w.run = Math.floor(rnd() * w.lines.length);
    w.dip *= Math.exp(-dt * 4);
    w.bob += dt * (0.6 + 1.2 * f.rel.midDrive); // the bobbing phase accumulates, so a change of pace never jumps it
    const bob = (ph) => Math.sin(w.bob + ph) * 2 * u + Math.sin(w.dip * Math.PI) * 4 * u, pos = (b) => [b.x * N, b.y * N + bob(b.ph)];
    const mx = w.moon.x * N, my = w.moon.y * N + bob(1), mr = 0.06 * N;
    r.disc(mx, my, mr, HOT);
    r.disc(mx + mr * 0.45, my - mr * 0.2, mr * 0.85, BG);
    for (const [i, j] of w.lines) { const [x0, y0] = pos(w.blobs[i]), [x1, y1] = pos(w.blobs[j]); r.line(x0, y0, x1, y1, FIG); }
    const [ri, rj] = w.lines[w.run % w.lines.length], [ax, ay] = pos(w.blobs[ri]), [bx, by] = pos(w.blobs[rj]), ph = beatLocked(f) ? f.beat.phase : (t * 2) % 1;
    r.disc(lerp(ax, bx, ph), lerp(ay, by, ph), 1.5 * u, FIG);
    for (const b of w.blobs) {
      b.lit *= Math.exp(-dt * 1.2);
      const [x, y] = pos(b), S = b.s * N * (1 + 0.1 * b.lit), c = b.lit > 0.75 ? BRIGHT : b.lit > 0.5 ? LMID : b.lit > 0.08 ? b.lc : b.c;
      r.disc(x, y, S, c);
      for (const [lx, ly, ls] of b.lobes) r.disc(x + lx * S * 1.4, y + ly * S * 1.4, S * ls, c);
      targets.push({ x: x - S * 1.3, y: y - S * 1.3, w: S * 2.6, h: S * 2.6 });
    }
    // the stars flicker with the treble, the eyes look along the beat
    for (const st of w.stars) {
      if (hash(Math.floor(t * 6 + st.ph * 7), Math.floor(st.s * 10)) > 0.3 + 0.6 * f.rel.trebDrive) continue;
      const x = st.x * N, y = st.y * N, l = st.s * u;
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI; r.line(x - Math.cos(a) * l, y - Math.sin(a) * l, x + Math.cos(a) * l, y + Math.sin(a) * l, FIG); }
    }
    for (const e of w.eyes) {
      const x = e.x * N, y = e.y * N + bob(e.a * 5), S = e.s * N, look = Math.sin(f.beat.phase * TAU) * S * 0.25;
      r.poly(lens(x, y, S * 2, 0.5, e.a), FIG);
      r.poly(lens(x, y, S * 2 - 2 * lw, 0.5, e.a), BRIGHT);
      r.disc(x + look, y, S * 0.3, FIG);
    }
  },
};

// ---------------------------------------------------------------------------------------------- cutouts
// Paper cut-outs: leaves, algae, corals, stars and dancing figures in flat colours, a frieze that slides with the
// mid clock; a kick cuts a new shape in, scaling up where it landed, the dancers' limbs swing on the beat, a
// section change gathers the dancers into a ring for a few bars before the frieze goes on.
const CUTS = ['leaf', 'algae', 'coral', 'dancer', 'star', 'dancer'];
// the frieze loops round a band wider than the screen by the biggest shape on either side, so nothing pops at the edges
const BAND = 1.7, MARG = 0.35, wrapX = (x) => ((x % BAND) + BAND) % BAND;

function cut(rnd, x) {
  return { kind: pick(rnd, CUTS), x: x ?? rnd() * BAND, y: 0.15 + rnd() * 0.7, s: 0.12 + rnd() * 0.12, c: pick(rnd, [HOT, COOL, FIG, MID, LMID]), a: (rnd() - 0.5) * 0.8, born: 0, ra: rnd() * TAU };
}

const cutouts = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { cuts: Array.from({ length: 9 }, (_, i) => cut(rnd, ((i + rnd()) * BAND) / 9)), ring: -1, ringLen: 6 });
  },
  draw(W) {
    const { r, N, t, dt, f, w, rnd, hits, targets } = W, scroll = f.rel.midClock * 0.03;
    for (const hh of hits)
      if (isLow(hh)) {
        const c = cut(rnd, wrapX(hh.x + MARG - scroll)); // so that it appears right where the hit landed
        c.born = t; c.y = clamp(hh.y, 0.15, 0.85);
        w.cuts.push(c);
        if (w.cuts.length > 12) w.cuts.shift();
      }
    if (f.section === 'change') { // the ring forms: every dancer keeps its own place on it from here on
      w.ring = 0;
      let nd = 0, di = 0;
      for (const c of w.cuts) if (c.kind === 'dancer') nd++;
      for (const c of w.cuts) if (c.kind === 'dancer') c.ra = (di++ / nd) * TAU;
    }
    if (w.ring >= 0 && (w.ring += dt) > w.ringLen) w.ring = -1;
    const k = w.ring < 0 ? 0 : ease(Math.min(1, w.ring * 1.2, (w.ringLen - w.ring) * 1.2)), sw = Math.sin(f.beat.phase * TAU) * 0.5;
    for (const c of w.cuts) {
      const sc = (c.born ? ease((t - c.born) * 4) : 1) * (1 + 0.03 * f.beat.pulse), col = c.c;
      let x = (wrapX(c.x + scroll) - MARG) * N, y = c.y * N, S = c.s * N * sc;
      if (k > 0) {
        if (c.kind === 'dancer') { const a = c.ra + t * 0.25; x = lerp(x, N / 2 + Math.cos(a) * 0.3 * N, k); y = lerp(y, N / 2 + Math.sin(a) * 0.3 * N, k); }
        else S *= 1 - 0.7 * k;
      }
      if (S < 0.5) continue;
      if (c.kind === 'leaf') {
        r.poly(lens(x, y, S * 2.2, 0.45, c.a), col);
        for (const sg of [-1, 1]) r.disc(x - Math.sin(c.a) * sg * S * 0.45, y + Math.cos(c.a) * sg * S * 0.45, S * 0.35, col);
      } else if (c.kind === 'algae') {
        const ad = -Math.PI / 2 + c.a * 0.5, dx = Math.cos(ad), dy = Math.sin(ad);
        r.stroke(x - dx * S, y - dy * S, x + dx * S, y + dy * S, S * 0.12, col);
        for (let i = -2; i <= 2; i++) r.poly(lens(x + dx * i * S * 0.42, y + dy * i * S * 0.42, S * 0.9, 0.5, ad + (i % 2 ? 1.1 : -1.1)), col);
      } else if (c.kind === 'coral') {
        r.stroke(x, y + S, x, y - S * 0.1, S * 0.18, col);
        for (const da of [-0.7, 0, 0.7]) { const a = -Math.PI / 2 + da + c.a * 0.3, ex = x + Math.cos(a) * S * 0.9, ey = y - S * 0.1 + Math.sin(a) * S * 0.9; r.stroke(x, y - S * 0.1, ex, ey, S * 0.14, col); r.disc(ex, ey, S * 0.13, col); }
      } else if (c.kind === 'star') r.poly(star(x, y, 4, S * 0.8, S * 0.3, c.a), col);
      else {
        const limb = (x0, y0, ang, len) => { r.stroke(x0, y0, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len, S * 0.26, col); r.disc(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len, S * 0.13, col); };
        r.poly(lens(x, y, S * 1.4, 0.6, Math.PI / 2 + c.a * 0.3), col);
        r.disc(x + Math.sin(c.a) * S * 0.2, y - S * 0.85, S * 0.22, col);
        limb(x - S * 0.2, y - S * 0.5, -Math.PI * 0.75 - sw * 0.6, S * 0.7);
        limb(x + S * 0.2, y - S * 0.5, -Math.PI * 0.25 + sw * 0.6, S * 0.7);
        limb(x - S * 0.1, y + S * 0.6, Math.PI * 0.65 + sw * 0.3, S * 0.75);
        limb(x + S * 0.1, y + S * 0.6, Math.PI * 0.35 - sw * 0.3, S * 0.75);
        targets.push({ x: x - S, y: y - S * 1.1, w: 2 * S, h: 2.4 * S });
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------- mobile
// A hanging mobile: a balanced tree of arms with discs and leaves on wires, every arm a damped pendulum of its
// own; a hit pushes the arm nearest to where it landed (a snare shakes the top one), the bass sways the top arm
// slowly, the leaves breathe with the beat; a section change hangs new leaves.
const leafOf = (rnd) => ({ leaf: true, r: 0.035 + rnd() * 0.035, kind: rnd() < 0.6 ? 'disc' : 'leaf', c: pick(rnd, [HOT, COOL, FIG, MID]) });
const weight = (n) => (n.leaf ? n.r * n.r * 400 : weight(n.l) + weight(n.r) + 0.5);

function buildArm(rnd, depth, len) {
  const kid = () => (depth > 1 && (depth > 3 || rnd() < 0.6) ? buildArm(rnd, depth - 1, len * (0.55 + rnd() * 0.2)) : leafOf(rnd));
  const l = kid(), rr = kid(), wl = weight(l), wr = weight(rr);
  return { len, l, r: rr, piv: wr / (wl + wr), wL: 0.08 + rnd() * 0.14, wR: 0.08 + rnd() * 0.14, phi: (rnd() - 0.5) * 0.2, dphi: 0, px: 0, py: 0 };
}

function rehang(n, rnd) {
  for (const k of ['l', 'r']) if (n[k].leaf) Object.assign(n[k], leafOf(rnd), { r: n[k].r }); else rehang(n[k], rnd);
}

const mobile = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { root: buildArm(rnd, 4, 0.38), arms: [] });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, lw = Math.max(1, Math.round(1.3 * u)), arms = w.arms, G = 4 * N;
    for (const hh of hits) {
      if (hh.kind === 'snare') { w.root.dphi += (rnd() < 0.5 ? -1 : 1) * 0.8 * hh.strength; continue; }
      if (!arms.length) continue;
      const hx = hh.x * N, hy = hh.y * N, imp = isLow(hh) ? 1.6 * hh.strength : 0.6 * hh.strength;
      let best = arms[0], bd = Infinity;
      for (const n of arms) { const d = Math.hypot(n.px - hx, n.py - hy); if (d < bd) { bd = d; best = n; } }
      // a push down on the arm where the hit landed: its torque grows with the lever, a long heavy arm turns less
      const lev = clamp((hx - best.px) / (best.len * N * 0.5), -1, 1);
      best.dphi += lev * imp * Math.sqrt(Math.min(2.5, 0.3 / best.len));
    }
    if (f.section === 'change') rehang(w.root, rnd);
    arms.length = 0;
    let big = null;
    // every arm a damped pendulum about its pivot (its balance point); the children hang from its ends on wires that
    // are pendulums of their own, swung by the sideways acceleration of the end they hang from
    const step = (n, px, py, force) => {
      const om = 2.2 / Math.sqrt(n.len / 0.3);
      n.dphi += (-om * om * Math.sin(n.phi) - 0.25 * om * n.dphi + force) * dt;
      n.phi += n.dphi * dt;
      if (Math.abs(n.phi) > 0.7) { n.phi = Math.sign(n.phi) * 0.7; if (n.phi * n.dphi > 0) n.dphi *= -0.3; } // the stop takes the speed away
      n.px = px; n.py = py;
      arms.push(n);
      const c = Math.cos(n.phi), s = Math.sin(n.phi), Ln = n.len * N;
      const lx = px - n.piv * Ln * c, ly = py - n.piv * Ln * s, rx = px + (1 - n.piv) * Ln * c, ry = py + (1 - n.piv) * Ln * s;
      r.stroke(lx, ly, rx, ry, lw, FIG);
      r.disc(px, py, lw, FIG);
      for (const [kid, ex, ey, wl] of [[n.l, lx, ly, n.wL], [n.r, rx, ry, n.wR]]) {
        const Lw = wl * N;
        if (kid.sx === undefined) Object.assign(kid, { wa: 0, wv: 0, sx: ex, svx: 0 });
        const vx = (ex - kid.sx) / dt, ax = clamp((vx - kid.svx) / dt, -20 * N, 20 * N);
        kid.sx = ex; kid.svx = vx;
        kid.wv += (-(G / Lw) * Math.sin(kid.wa) - (ax / Lw) * Math.cos(kid.wa) - 1.5 * kid.wv) * dt;
        kid.wa += kid.wv * dt;
        if (Math.abs(kid.wa) > 1) { kid.wa = Math.sign(kid.wa); if (kid.wa * kid.wv > 0) kid.wv *= -0.3; }
        const ws = Math.sin(kid.wa), wc = Math.cos(kid.wa), kx = ex + ws * Lw, ky = ey + wc * Lw;
        r.line(ex, ey, kx, ky, FIG);
        if (kid.leaf) {
          const R = kid.r * N * (1 + 0.1 * f.beat.pulse), cx = ex + ws * (Lw + R), cy = ey + wc * (Lw + R);
          if (kid.kind === 'disc') r.disc(cx, cy, R, kid.c); else r.poly(lens(ex + ws * (Lw + R * 1.2), ey + wc * (Lw + R * 1.2), R * 2.4, 0.45, Math.PI / 2 - kid.wa), kid.c);
          if (!big || R > big.R) big = { x: cx, y: cy, R };
        } else step(kid, kx, ky, 0);
      }
    };
    r.line(N / 2, 0, N / 2, 0.05 * N, FIG);
    step(w.root, N / 2, 0.05 * N, 0.2 * Math.sin(f.rel.bassClock * 0.7) * f.rel.bassDrive);
    if (big) targets.push({ x: big.x - big.R, y: big.y - big.R, w: 2 * big.R, h: 2 * big.R });
  },
};

// ---------------------------------------------------------------------------------------------- drips
// An action painting kept on its own canvas: a hand wandering on a lissajous driven by the clocks drips long thin
// lines with blobs along them, more of them with the energy, the colour layer cycling every bar; a kick
// flings splatter from the hand, a snare throws an arc across the canvas, every beat drops a blob, and a new
// section washes the canvas back toward the ground.
const LAYERS = [FIG, HOT, COOL, DARK];

const drips = {
  init(W) {
    Object.assign(W.w, { cv: null, hx: -1, hy: -1, ci: 0, parts: [], wash: 0, washGen: 0, barT: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W;
    if (!w.cv || w.cv.N !== N) { w.cv = new Raster(N); w.cv.fill(BG); w.hx = -1; w.parts = []; }
    const cv = w.cv, cb = cv.buf, energy = clamp(0.4 * f.rel.bassDrive + 0.3 * f.level + 0.3 * f.rel.midDrive), col = LAYERS[w.ci % 4], lw = Math.max(1, u * (0.8 + 1.2 * f.rel.bassDrive));
    if (f.bpm ? f.beat.on && f.beat.count % 4 === 0 : (w.barT += dt) > 2) { w.barT = 0; w.ci++; }
    if (f.section === 'change') w.wash = 0.2;
    // the hand: it only moves while the music does, so a quiet part leaves the canvas alone
    const bc = f.rel.bassClock, mc = f.rel.midClock, tc = f.rel.trebClock;
    const hx = N * (0.5 + 0.28 * Math.sin(bc * 0.9 + 1.3) + 0.17 * Math.sin(mc * 0.37 + t * 0.05)), hy = N * (0.5 + 0.28 * Math.sin(mc * 0.7 + 0.4) + 0.17 * Math.cos(tc * 0.23 + t * 0.03));
    const d = w.hx < 0 ? N : Math.hypot(hx - w.hx, hy - w.hy);
    if (d < 0.3 * N) {
      cv.stroke(w.hx, w.hy, hx, hy, lw, col);
      const steps = Math.max(1, Math.round(d / (2 * u)));
      for (let k = 0; k < steps; k++)
        if (rnd() < 0.06 + 0.3 * energy) {
          const px = lerp(w.hx, hx, k / steps), py = lerp(w.hy, hy, k / steps);
          cv.disc(px, py, (0.6 + rnd() * 1.6) * u, col);
          if (rnd() < 0.25) cv.rect(px - u * 0.4, py, Math.max(1, u * 0.8), (2 + rnd() * 6) * u, col); // a drip running down
        }
    }
    w.hx = hx; w.hy = hy;
    for (const hh of hits) {
      if (isLow(hh)) burst(w.parts, rnd, hx, hy, Math.round(5 + 12 * hh.strength), N * (0.5 + hh.strength), col, 0.4);
      else if (hh.kind === 'snare') { // an arc flung from the hand, thinning as it goes
        const a = rnd() * TAU, v = N * (0.6 + rnd() * 0.6), vx = Math.cos(a) * v, vy = Math.sin(a) * v - N * 0.5;
        for (let k = 0; k < 40; k++) { const tt = k * 0.03; if (hash(k, w.ci) < 0.7) cv.disc(hx + vx * tt, hy + vy * tt + N * 0.6 * tt * tt, (0.5 + (1 - k / 40) * 2) * u, col); } // ½gt² with the splatter's g
      }
    }
    if (f.beat.on) cv.disc(hx, hy, (2 + 3 * f.beat.pulse) * u, col);
    w.parts = w.parts.filter((p) => { // splatter: a streak while it flies, a spot where it lands
      const ox = p.x, oy = p.y;
      p.vy += N * 1.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if ((p.life -= dt) > 0) cv.line(ox, oy, p.x, p.y, p.c);
      else cv.disc(p.x, p.y, (0.6 + hash(Math.round(ox), Math.round(oy)) * 1.5) * u, p.c);
      return p.life > 0;
    });
    if (w.wash > 0) { // the wash, a fifth of a second: dim a share of the paint, then take it off (the same share a second at any frame rate)
      w.wash -= dt; w.washGen++;
      const share = 1 - Math.pow(0.6, dt * 30);
      for (let i = 0; i < cb.length; i++) { const v = cb[i]; if (v !== BG && hash(i, w.washGen) < share) cb[i] = v < DIM ? v + DIM : BG; }
    }
    r.buf.set(cb);
    r.disc(hx, hy, lw, col);
    targets.push({ x: hx - 4 * u, y: hy - 4 * u, w: 8 * u, h: 8 * u });
  },
};

// ---------------------------------------------------------------------------------------------- bulge
// An op-art bulge: a grid of squares (or discs) that swell, spread and brighten under a sphere pushing through it,
// the sphere's strength with the bass and its place with the mid and treble clocks; a snare pushes a second one
// through where it landed, which sinks back; the grid itself breathes with the beat.
const bulge = {
  init(W) {
    Object.assign(W.w, { round: W.rnd() < 0.4, bass: 0.3, b2: null });
  },
  draw(W) {
    const { r, N, dt, f, w, hits, targets } = W, G = clamp(Math.round(N / 9), 6, 22), cs = N / G;
    for (const hh of hits) if (hh.kind === 'snare') w.b2 = { x: hh.x * N, y: hh.y * N, s: 0.9 * hh.strength, R: 0.3 * N };
    w.bass = follow(w.bass, f.rel.bassDrive, dt, 0.1);
    if (w.b2 && (w.b2.s *= Math.exp(-dt * 2)) < 0.05) w.b2 = null;
    const B = [{ x: N / 2 + 0.3 * N * Math.sin(f.rel.midClock * 0.5), y: N / 2 + 0.3 * N * Math.cos(f.rel.trebClock * 0.35), s: 0.25 + 0.9 * w.bass + 0.2 * f.beat.pulse, R: 0.42 * N }];
    if (w.b2) B.push(w.b2);
    const base = cs * 0.52 * (1 + 0.08 * f.beat.pulse), RAMP = [DARK, MID, LMID, BRIGHT];
    // two passes: the flat cells first, the risen ones over them. Every cell is pushed out along the radius from each
    // bulge's centre by a stretch that fades smoothly to nothing at the rim, so cells never pass each other and the
    // rim never pinches; where the grid is squeezed, a cell is held inside the narrowest spacing round it (the
    // smallest stretch of the local Jacobian jxx, jyy, jxy), so it never overlaps any of its eight neighbours.
    for (let pass = 0; pass < 2; pass++)
      for (let j = 0; j < G; j++)
        for (let i = 0; i < G; i++) {
          const x0 = (i + 0.5) * cs, y0 = (j + 0.5) * cs;
          let x = x0, y = y0, h = 0, jxx = 1, jyy = 1, jxy = 0;
          for (const b of B) {
            const dx = x0 - b.x, dy = y0 - b.y, dd = Math.hypot(dx, dy);
            if (dd >= b.R) continue;
            if (dd < 1e-3) { h += b.s; continue; }
            const q = dd / b.R, e = 1 - q * q, k = 0.34 * b.s * e * e, gq = (-1.36 * b.s * q * e) / (b.R * dd); // k, and dk/dq over R·d
            x += dx * k; y += dy * k; h += b.s * Math.sqrt(e);
            jxx += k + dx * dx * gq; jyy += k + dy * dy * gq; jxy += dx * dy * gq;
          }
          if ((h > 0.3) !== (pass === 1)) continue;
          const room = (jxx + jyy) / 2 - Math.hypot((jxx - jyy) / 2, jxy);
          const S = Math.min((base * (1 + 0.55 * h)) / 2, 0.47 * cs * Math.max(0.1, room)), c = RAMP[Math.min(3, Math.floor(h * 2.8 + 0.6))];
          if (w.round) r.disc(x, y, S, c); else r.rect(x - S, y - S, 2 * S, 2 * S, c);
        }
    targets.push({ x: B[0].x - 0.1 * N, y: B[0].y - 0.1 * N, w: 0.2 * N, h: 0.2 * N });
  },
};

const WORLDS = { screenprint, benday, haring, kusama, memphis, deco, constructivist, suprematist, miro, cutouts, mobile, drips, bulge };

registerFamily('pop', WORLD_DEFS, WORLDS);
export const POP_STYLE = makeMixStyle('POP ART', ['pop']);
