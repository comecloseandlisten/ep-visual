// Street culture, mixed: a freight yard at night with a piece growing on a car, a legal wall and its crew, a street
// skate spot, a basement punk show, a xerox zine spread, a lamp post under its stickers, a cypher under a bridge,
// a BMX dirt line, a black-metal show in a snowy forest, a tattoo studio, the top deck of the night bus and a
// soundclash. The visual tropes only: abstract wildstyle shapes (arrows, bars, bubbles, blocks), never a letter, no
// crew, brand, band or person from anywhere. Every world draws with the palette roles, so any palette, treatment
// and layout of the mixer fits; each has a table of kinds weighed by the arousal band, re-rolled on a section
// change, with the heavy one on a drop.
import { clamp, lerp, bayer } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow, ease,
  beatLocked, hash, pickW, walker, snowfall, particles, burst, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  trainyard: { name: 'the train yard', va: [[L, M], [M, L], [L, L]], pals: ['midnight', 'noir', 'tape', 'silver'], fx: ['film', 'vhs', 'none'] },
  wallofhame: { name: 'the legal wall', va: [[M, M], [H, M]], pals: ['nineties', 'candy', 'popprint', 'tape'], fx: ['none', 'vhs', 'film'] },
  skatespot: { name: 'the skate spot', va: [[H, H], [M, H], [H, M]], pals: ['nineties', 'tape', 'candy', 'tabloid'], fx: ['vhs', 'none', 'film'] },
  punkshow: { name: 'the basement show', va: [[H, H], [M, H], [H, M]], pals: ['noir', 'toxic', 'tape', 'silver'], fx: ['vhs', 'film', 'none'] },
  zine: { name: 'the zine spread', va: [[M, M], [H, M]], pals: ['tabloid', 'riso', 'popprint', 'silver'], fx: ['none', 'film', 'quad'] },
  stickerpost: { name: 'the sticker post', va: [[L, M], [M, L], [L, L]], pals: ['tape', 'noir', 'riso', 'midnight'], fx: ['none', 'film', 'vhs'] },
  cypher: { name: 'the cypher', va: [[M, M], [H, M]], pals: ['midnight', 'noir', 'nineties', 'tape'], fx: ['film', 'none', 'vhs'] },
  dirtjumps: { name: 'the dirt line', va: [[H, H], [M, H], [H, M]], pals: ['sepia', 'tape', 'nineties', 'candy'], fx: ['none', 'vhs', 'film'] },
  forestshow: { name: 'the forest show', va: [[L, H], [L, M]], pals: ['noir', 'silver', 'midnight', 'toxic'], fx: ['film', 'vhs', 'none'] },
  tattooflash: { name: 'the tattoo studio', va: [[M, M], [H, M]], pals: ['tabloid', 'riso', 'sepia', 'noir'], fx: ['none', 'film'] },
  nightbus: { name: 'the night bus', va: [[L, M], [M, L], [L, L]], pals: ['midnight', 'noir', 'neon', 'silver'], fx: ['vhs', 'film', 'none'] },
  soundclash: { name: 'the soundclash', va: [[H, H], [M, H], [H, M]], pals: ['neon', 'toxic', 'nineties', 'candy'], fx: ['none', 'crt', 'manga', 'quad'] },
};

// the arousal band a mood falls in (low, mid, high): the kind tables below weigh their kinds by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bpsOf = (f) => (f.bpm ? f.bpm / 60 : 2);
const px1 = (u) => Math.max(1, u);
// the leg phase of a figure `h` tall after it moved `dx` cells: a stride per 0.63 h, so the legs keep up with the travel
const stride = (ph, dx, h) => ph + Math.abs(dx) / (0.1 * h);

// ---------------------------------------------------------------------------------------------- shared bits
// A piece without letters: the moves of one only. Bars and arrows that lean, bubbles, blocks with a 3D drop. Every
// element goes through the stages of a real one: a sketch line, the fill, the outline, the highlight; `st` is how
// far it is. In unit coordinates of its box.
const PIECE_W = { bubble: [3, 2, 1], throwup: [2, 2, 2], wildstyle: [1, 2, 3], blockbuster: [1, 2, 3] };
function makePiece(rnd, style) {
  const n = style === 'throwup' ? 4 : style === 'blockbuster' ? 5 : 7 + Math.floor(rnd() * 3), cols = style === 'throwup' ? [HOT, BRIGHT] : [HOT, COOL, BRIGHT, LMID], els = [];
  for (let i = 0; i < n; i++) {
    const kind = style === 'bubble' || style === 'throwup' ? 'bubble' : style === 'blockbuster' ? 'block' : rnd() < 0.4 ? 'arrow' : 'bar';
    els.push({ kind, cx: (i + 0.5) / n + (rnd() - 0.5) * 0.05, cy: 0.5 + (rnd() - 0.5) * 0.25, w: (0.9 + rnd() * 0.35) / n, h: 0.5 + rnd() * 0.4,
      sl: (rnd() - 0.5) * (style === 'wildstyle' ? 0.7 : 0.15), dir: rnd() < 0.5 ? 1 : -1, c: cols[i % cols.length], st: 0 });
  }
  return { style, els, at: 0 };
}
// the polygon of an element in a box (x, y, w, h in cells)
function elPoly(e, b) {
  const cx = b.x + e.cx * b.w, cy = b.y + e.cy * b.h, hw = e.w * b.w * 0.5, hh = e.h * b.h * 0.5, s = e.sl * hh;
  if (e.kind === 'arrow') { // a bar with a head on one end
    const d = e.dir, hy = cy - d * hh, ny = cy - d * hh * 0.45;
    return [[cx - hw + s * d, ny], [cx - hw * 1.8 + s * d, ny], [cx + s * d * 1.2, hy], [cx + hw * 1.8 + s * d, ny], [cx + hw + s * d, ny], [cx + hw - s * d, cy + d * hh], [cx - hw - s * d, cy + d * hh]];
  }
  return [[cx - hw + s, cy - hh], [cx + hw + s, cy - hh], [cx + hw - s, cy + hh], [cx - hw - s, cy + hh]];
}
function outline(r, pts, w, c) { for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) r.stroke(pts[j][0], pts[j][1], pts[i][0], pts[i][1], w, c); }
// the stage an element is at, drawn: the sketch (a thin line), the fill (blocks get their 3D drop first), the
// outline, the highlight; `dim` for a piece in the dark
function drawPiece(r, P, b, u, dim = 0) {
  for (const e of P.els) {
    if (e.st < 1) continue;
    const fill = e.c + dim;
    if (e.kind === 'bubble') {
      const cx = b.x + e.cx * b.w, cy = b.y + e.cy * b.h, R = e.w * b.w * 0.62, sy = (e.h * b.h) / (2 * R);
      if (e.st < 2) { r.ring(cx, cy, R, px1(u), MID + dim, sy); continue; }
      r.ring(cx, cy, R * 0.5, R, fill, sy);
      if (e.st >= 3) r.ring(cx, cy, R, px1(1.2 * u), FIG, sy);
      if (e.st >= 4) r.ring(cx - R * 0.3, cy - R * sy * 0.35, R * 0.18, px1(u), BRIGHT, 0.6);
      continue;
    }
    const pts = elPoly(e, b);
    if (e.st < 2) { outline(r, pts, px1(u * 0.8), MID + dim); continue; }
    if (e.kind === 'block') { const d = b.h * 0.08; r.poly(pts.map(([x, y]) => [x + d, y + d]), DARK + dim); r.poly([[pts[1][0], pts[1][1]], [pts[1][0] + d, pts[1][1] + d], [pts[2][0] + d, pts[2][1] + d], [pts[2][0], pts[2][1]]], DARK + dim); }
    r.poly(pts, fill);
    if (e.st >= 3) outline(r, pts, px1(1.2 * u), FIG);
    if (e.st >= 4) { const [x0, y0] = pts[0], [x1, y1] = pts[1]; r.stroke(lerp(x0, x1, 0.15), y0 + b.h * 0.06, lerp(x0, x1, 0.45), y1 + b.h * 0.06, px1(u), BRIGHT); }
  }
}
// the position of an element (where the can points)
const elAt = (e, b) => [b.x + e.cx * b.w, b.y + e.cy * b.h];
// one stroke of the stage `from` -> `from + 1` on the first element waiting for it; false when none is
function paintStep(P, from) {
  const i = P.els.findIndex((e) => e.st === from);
  if (i < 0) return false;
  P.els[i].st = from + 1;
  P.at = i;
  return true;
}
const pieceDone = (P) => P.els.every((e) => e.st >= 4);
// the sketch goes on the beat, the fills on the kicks, the outlines on the snares, the highlights on the hats
function paintOn(P, f, hits) {
  let did = -1;
  if (f.beat.on && paintStep(P, 0)) did = 0;
  for (const h of hits) {
    if (isLow(h)) { if (paintStep(P, 1)) did = 1; }
    else if (h.kind === 'snare') { if (paintStep(P, 2)) did = 2; }
    else if (h.kind === 'hat' || h.kind === 'perc') { if (paintStep(P, 3)) did = 3; }
  }
  return did;
}

// a spray can: the body, a band of its colour, the cap; `h` tall, standing or in a hand
function sprayCan(r, x, y, h, c, u) {
  r.rect(x - h * 0.22, y - h * 0.8, h * 0.44, h * 0.8, LMID);
  r.rect(x - h * 0.22, y - h * 0.5, h * 0.44, h * 0.2, c);
  r.rect(x - h * 0.12, y - h, h * 0.24, h * 0.2, DARK);
}
// an arm from the shoulder toward (tx, ty) as far as it reaches, a can in the hand; returns the hand
function armWithCan(r, J, tx, ty, reach, c, u) {
  const dx = tx - J.sx, dy = ty - J.sy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, reach / d), hx = J.sx + dx * k, hy = J.sy + dy * k;
  r.stroke(J.sx, J.sy, hx, hy, px1(1.2 * u), FIG);
  sprayCan(r, hx, hy + 2 * u, 4 * u, c, u);
  return [hx, hy];
}
// a figure crouched low: folded legs, the body a lump, the head
function croucher(r, x, base, h, c, dir) {
  r.rect(x - h * 0.3, base - h * 0.22, h * 0.6, h * 0.22, c);
  r.ring(x, base - h * 0.4, h * 0.15, h * 0.3, c, 0.75);
  r.disc(x + dir * h * 0.08, base - h * 0.62, h * 0.11, c);
}
// a speaker cone that pumps with the bass
function cone(r, cx, cy, R, pump, u) {
  r.ring(cx, cy, R * (1 + 0.12 * pump), px1(u), LMID);
  r.disc(cx, cy, R * 0.45 * (1 + 0.3 * pump), MID);
  r.disc(cx, cy, R * 0.15, DARK);
}
// mist and dust: slow particles that drag and settle rather than fall
function drift(W, list, gfall, drag) {
  const { r, N, dt, u } = W;
  for (const p of list) {
    p.vx *= drag; p.vy = p.vy * drag + gfall * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    r.rect(p.x, p.y, px1(u), px1(u), p.c);
  }
  return list.filter((p) => p.life > 0);
}
function puff(list, rnd, x, y, n, sp, c, life, dirx = 0) {
  for (let k = 0; k < n; k++) { const a = rnd() * TAU; list.push({ x, y, vx: Math.cos(a) * sp * rnd() + dirx * sp * 0.5, vy: Math.sin(a) * sp * rnd() * 0.6 - sp * 0.3, life: life * (0.5 + rnd()), c }); }
}
// a shadow on the ground, away from a light at lx: a flat dark wedge from the feet
function shadow(r, x, g, h, lx, u, cap) {
  const away = x < lx ? -1 : 1, len = Math.min(cap, h * (0.5 + 1.6 * Math.abs(x - lx) / cap));
  r.poly([[x - h * 0.12, g], [x + h * 0.12, g], [x + away * len, g + 1.5 * u], [x + away * len * 0.8, g - 0.5 * u]], DARK + DIM);
}

// ---------------------------------------------------------------------------------------------- train yard
// A freight yard at night: a car under the stars, two painters at its side with cans and head torches, the piece
// growing stroke by stroke in stages over the bars: sketch lines on the beat, fills on the kicks, outlines on the
// snares, highlights on the hats. The mist of the cans drifts and settles. A drop brings the watchman's torch
// sweeping along the car, the painters crouch till it passes; a section sends a train past on the far track,
// and once the piece is done the car is shunted out and a blank one rolls in. The kind of piece follows the arousal.
const trainyard = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { piece: makePiece(rnd, rollW(rnd, PIECE_W, band)), next: null, mist: [], beam: null, far: null, carX: 0, shunt: 0, spray: [0, 0], px: [0.36, 0.64], ph: [0, 0], crouch: 0,
      stars: Array.from({ length: 40 }, () => [rnd(), rnd() * 0.3, rnd()]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.82 * N, band = bandOf(W.a);
    const P = w.piece, cx = w.carX * N, box = { x: cx + 0.2 * N, y: 0.46 * N, w: 0.6 * N, h: 0.28 * N };
    // sections: a train on the far track, and the shunt when the piece is finished; a drop: the watchman
    if (f.section === 'change') { w.far = { x: 1.3, v: 0.35 + 0.2 * rnd() }; w.next = rollW(rnd, PIECE_W, band); if (pieceDone(P) && !w.shunt) w.shunt = 1; }
    if (f.section === 'drop') { w.beam = { x: -0.25 }; w.next = 'blockbuster'; }
    if (w.shunt) { // the car slides out left, a blank one comes in from the right
      w.carX -= dt * 0.5;
      if (w.carX < -1.1) { w.carX = 1.1; w.piece = makePiece(rnd, w.next || rollW(rnd, PIECE_W, band)); w.next = null; w.shunt = 2; }
      if (w.shunt === 2 && w.carX <= 0) { w.carX = 0; w.shunt = 0; }
    }
    const did = w.shunt ? -1 : paintOn(P, f, hits);
    if (did >= 0) { const e = P.els[P.at]; w.spray[e.cx < 0.5 ? 0 : 1] = 0.35; }
    // the sky: stars that twinkle with the treble, the far track with its signal
    for (let i = 0; i < w.stars.length; i++) { const st = w.stars[i]; if (hash(i, Math.floor(t * 3 + st[2] * 9)) < 0.6 + 0.4 * f.rel.trebDrive) r.rect(st[0] * N, st[1] * N, px1(u), px1(u), st[2] < 0.3 ? BRIGHT : LMID); }
    r.rect(0, 0.42 * N, N, px1(u), DARK);
    if (w.far) { // the far train: a row of dark cars, their windows lit, sliding left behind the near car
      w.far.x -= dt * w.far.v;
      for (let k = 0; k < 6; k++) { const x = (w.far.x + k * 0.27) * N; r.rect(x, 0.33 * N, 0.25 * N, 0.09 * N, DARK); for (let q = 0; q < 5; q++) r.rect(x + (0.03 + q * 0.045) * N, 0.35 * N, 0.025 * N, 0.03 * N, hash(k, q) < 0.7 ? LMID : DARK + DIM); }
      if (w.far.x < -1.8) w.far = null;
    }
    r.rect(0, g, N, N - g, DARK + DIM);
    for (let x = -0.1 * N; x < N; x += 0.08 * N) r.rect(x, g - u, 0.05 * N, px1(u), DARK); // the sleepers
    r.rect(0, g - 2 * u, N, px1(u), MID);
    // the car: a dim box with ribs, a door seam, bogies; the pools of the head torches where the painters work
    const top = 0.4 * N;
    r.rect(cx + 0.1 * N, top, 0.8 * N, g - 5 * u - top, MID + DIM);
    r.rect(cx + 0.1 * N, top, 0.8 * N, 2 * u, DARK);
    for (let k = 1; k < 16; k++) r.rect(cx + (0.1 + k * 0.05) * N, top + 2 * u, px1(u * 0.7), g - 7 * u - top, DARK + DIM);
    r.rect(cx + 0.5 * N - u, top + 2 * u, 2 * u, g - 7 * u - top, DARK);
    for (const bx of [0.22, 0.78]) for (const k of [-1, 1]) r.disc(cx + bx * N + k * 0.045 * N, g - 3 * u, 3.5 * u, DARK);
    // each painter's element: the one in hand when it is in his half, else the first of his half; his torch pools on it
    const tg = [0, 1].map((i) => { const e = P.els.filter((q) => (q.cx < 0.5) === (i === 0))[0] || P.els[0]; return (P.els[P.at].cx < 0.5) === (i === 0) ? P.els[P.at] : e; });
    const beamOn = w.beam && !w.shunt;
    if (!beamOn) for (let i = 0; i < 2; i++) { const [ex, ey] = elAt(tg[i], box); r.ring(ex, ey, 0.06 * N, 0.12 * N, LMID + DIM, 0.8); }
    drawPiece(r, P, box, u, DIM);
    // the watchman's torch: a cone from the right fence, its pool sliding along the car; the painters crouch meanwhile
    if (w.beam) {
      w.beam.x += dt * 0.42;
      const bx = w.beam.x * N, by = 0.6 * N;
      r.poly([[N + 2 * u, 0.5 * N], [bx - 0.08 * N, by - 0.1 * N], [bx + 0.08 * N, by + 0.1 * N]], LMID + DIM);
      r.ring(bx, by, 0.07 * N, 0.14 * N, LMID, 0.7);
      if (w.beam.x > 1.3) w.beam = null;
    }
    w.crouch = follow(w.crouch, beamOn ? 1 : 0, dt, 0.15);
    // the painters: each works his half, the arm on the element in hand, the can hissing mist that drifts and settles.
    // They stand on the ground, not on the car: while it is shunted they stay put with the can down, and walk (the legs
    // keeping up with the distance) to where the next one's element will stop
    for (let i = 0; i < 2; i++) {
      const tgt = tg[i], [ex, ey] = elAt(tgt, box), h = 0.2 * N, p0 = w.px[i];
      w.px[i] = follow(w.px[i], clamp(ex / N - w.carX, 0.15, 0.85) + (i ? 0.03 : -0.03), dt, 0.6);
      const x = w.px[i] * N;
      w.ph[i] = stride(w.ph[i], (w.px[i] - p0) * N, h);
      if (w.crouch > 0.5) { croucher(r, x, g, h, FIG, i ? -1 : 1); r.rect(x + (i ? -1 : 1) * h * 0.1, g - h * 0.68, px1(u), px1(u), w.crouch > 0.9 ? FIG : BRIGHT); continue; }
      const J = walker(r, x, g, h, FIG, w.ph[i] + 0.2 * Math.sin(t * 2 + i), i ? -1 : 1, { cap: true });
      r.rect(x - u, J.head - 3 * u, 2 * u, 2 * u, BRIGHT); // the head torch
      w.spray[i] -= dt;
      const [hx, hy] = w.shunt ? armWithCan(r, J, x + (i ? -1 : 1) * h * 0.3, g - h * 0.2, h * 0.5, tgt.c, u) : armWithCan(r, J, ex, ey, h * 0.5, tgt.c, u);
      if (w.spray[i] > 0 && w.mist.length < 260) for (let k = 0; k < 2 + 4 * f.rel.bassDrive; k++) w.mist.push({ x: hx + (ex - hx) * (0.6 + rnd() * 0.4), y: hy + (ey - hy) * (0.6 + rnd() * 0.4), vx: (rnd() - 0.5) * 10 * u, vy: (rnd() - 0.6) * 8 * u, life: 0.8 + rnd(), c: tgt.c + DIM });
      if (f.beat.on) r.rect(hx + (rnd() - 0.5) * 2 * u, hy - 4 * u, px1(u), px1(u), BRIGHT); // the pea rattles
      targets.push({ x: x - h * 0.3, y: g - h * 1.1, w: h * 0.6, h: h * 1.1 });
    }
    w.mist = drift(W, w.mist, 5 * u, Math.exp(-dt * 1.6));
    if (did === 1) s.shake = Math.max(s.shake, 0.05);
    targets.push({ x: box.x, y: box.y, w: box.w, h: box.h });
  },
};

// ---------------------------------------------------------------------------------------------- the legal wall
// A legal wall with a crew on the scaffold: the piece goes up in stages (sketch on the beat, fills on the kicks,
// outlines on the snares, highlights on the hats), a boombox pumps on the bass, the cans on the ground rattle
// on the hats. A section change rolls the buff over it in grey and a fresh piece starts; a drop is the final
// highlight pass, then the crew steps back to look.
const wallofhame = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { piece: makePiece(rnd, rollW(rnd, PIECE_W, band)), buff: -1, buffed: false, back: 0, spark: 0, mist: [], px: [0.3, 0.65, 0.5], ph: [0, 0, 0], shake: new Float32Array(5), cans: [HOT, COOL, BRIGHT, LMID, HOT].map((c, i) => ({ c, x: 0.16 + i * 0.028 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, g = 0.84 * N, band = bandOf(W.a), plank = 0.48 * N;
    const P = w.piece, box = { x: 0.15 * N, y: 0.2 * N, w: 0.7 * N, h: 0.5 * N };
    if (f.section === 'change' && w.buff < 0) w.buff = 0;
    if (f.section === 'drop') { for (const e of P.els) e.st = 4; w.spark = 0.8; w.back = 2.5; }
    const did = w.buff >= 0 || w.back > 0 ? -1 : paintOn(P, f, hits);
    for (const h of hits) if (h.kind === 'hat' || h.kind === 'perc') w.shake[Math.floor(rnd() * 5)] = 0.35;
    // the wall with its courses, the piece on it, the buff when it comes: a roller and the grey behind it
    r.rect(0.04 * N, 0.1 * N, 0.92 * N, g - 0.1 * N, MID);
    for (let y = 0.1 * N; y < g; y += 3 * u) for (let x = 0.04 * N + ((y / (3 * u)) & 1) * 3 * u; x < 0.96 * N; x += 6 * u) if (hash(Math.round(x), Math.round(y)) < 0.25) r.rect(x, y, 2 * u, px1(u * 0.6), MID + DIM);
    if (w.buffed) r.rect(box.x - 2 * u, box.y - 2 * u, box.w + 4 * u, box.h + 4 * u, LMID + DIM);
    drawPiece(r, P, box, u);
    if (w.buff >= 0) {
      w.buff += dt / 2.4;
      r.rect(box.x - 2 * u, box.y - 2 * u, Math.min(1, w.buff) * (box.w + 4 * u), box.h + 4 * u, LMID + DIM);
      if (w.buff >= 1) { w.buff = -1; w.buffed = true; w.piece = makePiece(rnd, rollW(rnd, PIECE_W, band)); }
    }
    r.rect(0, g, N, N - g, DARK);
    r.rect(0, g, N, px1(u), LMID);
    // the scaffold: poles, the plank, braces, a ladder
    const x0 = 0.1 * N, x1 = 0.9 * N;
    r.rect(x0 - u, 0.1 * N, 2 * u, g - 0.1 * N, DARK);
    r.rect(x1 - u, 0.1 * N, 2 * u, g - 0.1 * N, DARK);
    r.rect(x0, plank, x1 - x0, 1.5 * u, LMID);
    r.line(x0, plank, x0 + 0.12 * N, g, DARK); r.line(x1, plank, x1 - 0.12 * N, g, DARK);
    for (const k of [-1, 1]) r.rect(0.12 * N + k * 2.5 * u, plank, px1(u), g - plank, LMID + DIM);
    for (let y = plank + 3 * u; y < g; y += 3.5 * u) r.rect(0.12 * N - 2.5 * u, y, 5 * u, px1(u * 0.7), LMID + DIM);
    // the crew: two on the plank, one on the ground; each follows the element in his zone and reaches for it
    const zone = (e, i) => (i === 2 ? e.cy >= 0.5 : e.cy < 0.5 && (e.cx < 0.5) === (i === 0));
    for (let i = 0; i < 3; i++) {
      const base = i === 2 ? g : plank, h = 0.2 * N, cur = P.els[P.at], tgt = zone(cur, i) ? cur : P.els.find((e) => zone(e, i)) || cur, [ex, ey] = elAt(tgt, box);
      const want = w.back > 0 && i === 2 ? 0.5 : clamp(ex / N + (i === 0 ? -0.04 : i === 1 ? 0.04 : -0.03), 0.16, 0.84), busy = w.buff >= 0 && i === 2, p0 = w.px[i];
      w.px[i] = follow(w.px[i], busy ? 0.15 + Math.min(1, w.buff) * 0.7 : want, dt, 0.5);
      w.ph[i] = stride(w.ph[i], (w.px[i] - p0) * N, h); // the legs go with the distance walked, and stop with it
      const x = w.px[i] * N, J = walker(r, x, base + (w.back > 0 && i === 2 ? 0.04 * N : 0), h, FIG, w.ph[i], i === 1 ? -1 : 1, { cap: i !== 1 });
      if (busy) { r.stroke(J.sx, J.sy, x + 0.06 * N, box.y + 2 * u, px1(1.2 * u), DARK); r.rect(x + 0.02 * N, box.y - 2 * u, 0.08 * N, 3 * u, LMID); } // the roller on its pole
      else if (w.back > 0) r.stroke(J.sx, J.sy, J.sx + 4 * u, J.sy + h * 0.4, px1(1.2 * u), FIG);
      else {
        const [hx, hy] = armWithCan(r, J, ex, ey, h * 0.5, tgt.c, u);
        if (did >= 0 && zone(cur, i) && w.mist.length < 200) for (let k = 0; k < 5; k++) w.mist.push({ x: ex + (rnd() - 0.5) * 4 * u, y: ey + (rnd() - 0.5) * 4 * u, vx: (rnd() - 0.5) * 10 * u, vy: (rnd() - 0.6) * 8 * u, life: 0.6 + rnd() * 0.6, c: tgt.c });
        if (f.beat.pulse > 0.6) r.rect(hx - u, hy - 5 * u, 2 * u, px1(u), BRIGHT);
      }
      targets.push({ x: x - h * 0.3, y: base - h * 1.1, w: h * 0.6, h: h * 1.1 });
    }
    w.back -= dt;
    w.mist = drift(W, w.mist, 5 * u, Math.exp(-dt * 1.8));
    if (w.spark > 0) { w.spark -= dt; for (const e of P.els) if (rnd() < 0.5) { const [ex, ey] = elAt(e, box); r.rect(ex + (rnd() - 0.5) * e.w * box.w, ey + (rnd() - 0.5) * e.h * box.h, px1(u), px1(u), WHITE); } }
    // the cans in a row: a shaken one jitters, its pea a bright dot bouncing inside; the boombox, cones on the bass
    for (let i = 0; i < 5; i++) {
      const c = w.cans[i], sh = w.shake[i], j = sh > 0 ? Math.sin(t * 60 + i) * sh * 3 * u : 0;
      sprayCan(r, c.x * N + j, g, 7 * u, c.c, u);
      if (sh > 0) { r.rect(c.x * N + j - u * 0.5, g - 3 * u - Math.abs(Math.sin(t * 40)) * 3 * u, px1(u), px1(u), BRIGHT); w.shake[i] = sh - dt; }
    }
    const bx = 0.8 * N, bw = 0.18 * N, bh = 0.09 * N, by = g - bh;
    r.rect(bx - bw / 2, by, bw, bh, DARK);
    r.rect(bx - bw / 2 - u, by - 2 * u, bw + 2 * u, 2 * u, FIG);
    for (const k of [-1, 1]) cone(r, bx + k * bw * 0.3, by + bh * 0.52, bh * 0.32, f.rel.bassDrive, u);
    r.rect(bx - bw * 0.08, by + bh * 0.3, bw * 0.16, bh * 0.4, f.beat.pulse > 0.5 ? HOT : DARK + DIM);
    targets.push({ x: box.x, y: box.y, w: box.w, h: box.h });
  },
};

// ---------------------------------------------------------------------------------------------- skate spot
// A street spot in profile: a stair set with a handrail, a flat rail, a ledge or a pit to clear, by the arousal.
// The skater rolls in at the tempo and pushes on the beat; a kick is an ollie (a true parabola, the board under
// the feet, nose up then down), a snare in the air a flip (the board turning about its long axis, timed to come
// round before the landing, caught on it), a rail caught on the way down is a grind with sparks. A drop is the
// bail: the tumble under gravity, the board rolling away on its own. A filmer with a fisheye follows, low.
const SPOT_W = { stairs: [2, 2, 2], rail: [1, 2, 3], ledge: [3, 2, 1], gap: [0, 1, 3] };
const skatespot = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, SPOT_W, bandOf(W.a)), x: -0.15 * W.N, y: 0, vy: 0, air: false, grind: false, flip: 0, flipR: 0, push: 0, bail: null, board: null, sparks: [], dust: [], fx: -0.3 * W.N, fresh: true,
      bricks: Array.from({ length: 9 }, () => [rnd(), rnd() * 0.4, 0.04 + rnd() * 0.08]) });
  },
  draw(W) {
    // G is gravity in cells/s^2; LB the half-length of the tumbling body; the deck rides 3.2 u over the ground (the wheels,
    // radius u, hang 2.2 u under it), the feet 1 u over the deck
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.82 * N, G = 2.2 * N, bps = bpsOf(f), K = w.kind, up = g - 0.12 * N, LB = 0.07 * N, DK = 3.2 * u, pitX = 0.48 * N, pitW = 0.12 * N;
    const gy = (x) => { const q = x / N; if (K === 'stairs') return q < 0.45 ? up : q < 0.62 ? up + (Math.floor((q - 0.45) / 0.0425) + 1) * 0.03 * N : g; return K === 'gap' && q > 0.48 && q < 0.6 ? 2 * N : g; };
    const rail = K === 'stairs' ? [0.43 * N, up - 0.06 * N, 0.64 * N, g - 0.06 * N] : K === 'rail' ? [0.4 * N, g - 0.055 * N, 0.66 * N, g - 0.055 * N] : K === 'ledge' ? [0.4 * N, g - 0.05 * N, 0.66 * N, g - 0.05 * N] : null;
    const railY = (x) => rail[1] + ((x - rail[0]) / (rail[2] - rail[0])) * (rail[3] - rail[1]);
    const reset = () => { w.x = -0.15 * N; w.y = w.kind === 'stairs' ? g - 0.12 * N : g; w.vy = 0; w.air = w.grind = false; w.flip = w.flipR = 0; w.bail = null; w.board = null; };
    if (w.fresh) { w.fresh = false; reset(); }
    if (f.section === 'change') { w.kind = rollW(rnd, SPOT_W, bandOf(W.a)); reset(); }
    const v = N * bps * (0.11 + 0.05 * f.rel.bassDrive) * (w.push > 0 ? 1.15 : 1);
    const startBail = () => { w.bail = { t: 0, x: w.x, y: w.y - DK - u - 0.085 * N, vx: v, vy: Math.min(w.vy, 0) - 0.2 * N, a: 0, down: false, flat: 0 }; w.board = { x: w.x, y: w.y - DK, vx: v * 1.3, vy: -0.25 * N, roll: 0, down: false }; w.air = w.grind = false; w.flipR = 0; s.shake = Math.max(s.shake, 0.3); };
    if (!w.bail) {
      for (const h of hits) {
        if (isLow(h) && !w.air) { w.vy = -N * (0.5 + 0.4 * h.strength); w.air = true; w.grind = false; }
        else if (h.kind === 'snare' && w.air && !w.flipR) { // the flip rate is set so the board comes round exactly by the landing
          // y grows downward: y + vy t + G t^2 / 2 = landY, so t = (-vy + sqrt(vy^2 + 2 G (landY - y))) / G; the landing
          // spot is where the parabola comes down, found by iterating the ground under it
          let tRem = (-w.vy + Math.sqrt(Math.max(0, w.vy * w.vy + 2 * G * (g - w.y)))) / G;
          for (let k = 0; k < 2; k++) { const landY = Math.min(g, gy(w.x + v * tRem)); tRem = (-w.vy + Math.sqrt(Math.max(0, w.vy * w.vy + 2 * G * (landY - w.y)))) / G; }
          if (tRem > 0.2) { w.flipR = (TAU * (tRem > 0.7 && h.strength > 0.7 ? 2 : 1)) / tRem; w.flip = 0; }
        }
      }
      if (f.section === 'drop') startBail();
      if (f.beat.on && !w.air && !w.grind) w.push = 0.3;
    }
    w.push -= dt;
    if (w.bail) { // the tumble: gravity, a spin that lies flat on the ground, a slide that dies; the board bounces and rolls off
      const B = w.bail, D = w.board;
      B.t += dt;
      // whatever has dropped below the rim of the pit is in it: it hits the walls and goes on down out of sight
      const walls = (o) => { if (K === 'gap' && o.y > g) { const x0 = pitX + 2 * u, x1 = pitX + pitW - 2 * u; if (o.x < x0 || o.x > x1) { o.x = clamp(o.x, x0, x1); o.vx = 0; } } };
      B.y += B.vy * dt + 0.5 * G * dt * dt; B.vy += G * dt; B.x += B.vx * dt; walls(B); // exact parabolas at any dt
      // the body is a stick about B.y: its low end is LB |cos a| below; it is down when that touches, and flops to the
      // nearest flat angle, the low end kept on the ground as it goes over
      const gb = gy(B.x);
      if (!B.down && B.y + LB * Math.abs(Math.cos(B.a)) + 2 * u >= gb) { B.down = true; B.flat = Math.round((B.a - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2; }
      if (B.down) { B.a = follow(B.a, B.flat, dt, 0.15); B.y = gb - 2 * u - LB * Math.abs(Math.cos(B.a)); B.vy = 0; B.vx *= Math.exp(-dt * 3); } else B.a += 7 * dt;
      D.y += D.vy * dt + 0.5 * G * dt * dt; D.vy += G * dt; D.x += D.vx * dt; walls(D);
      const gd = gy(D.x) - DK;
      if (D.y >= gd) { D.y = gd; D.vy = Math.abs(D.vy) < 0.05 * N ? 0 : -D.vy * 0.3; if (!D.vy) D.down = true; }
      D.vx *= Math.exp(-dt * (D.down ? 0.9 : 0.1));
      D.roll += (D.vx * dt) / (1.2 * u);
      if (B.t > 2) reset();
    } else {
      const prevY = w.y;
      w.x += v * dt;
      if (w.air) { // the exact parabola step, so the flip timed on it comes round at the landing whatever the frame rate
        w.y += w.vy * dt + 0.5 * G * dt * dt; w.vy += G * dt; w.flip += w.flipR * dt;
        if (rail && w.vy > 0 && w.x > rail[0] && w.x < rail[2]) { const ry = railY(w.x); if (prevY <= ry && w.y >= ry) { w.y = ry; w.vy = 0; w.air = false; w.grind = true; w.flipR = 0; w.flip = 0; } }
        const gnd = gy(w.x);
        if (w.air && w.y >= gnd) { w.y = gnd; w.vy = 0; w.air = false; w.flipR = 0; w.flip = 0; puff(w.dust, rnd, w.x, gnd, 5, 10 * u, LMID + DIM, 0.4, -1); }
        else if (w.air && w.y >= g + 0.5 * u) startBail(); // into the pit
      } else if (w.grind) {
        w.y = railY(w.x);
        for (const k of [-3.5, 3.5]) puff(w.sparks, rnd, w.x + k * u, w.y + u, 1, 22 * u, BRIGHT, 0.25, -1);
        if (w.x > rail[2]) { w.grind = false; w.air = true; w.vy = 0; }
      } else {
        const gnd = gy(w.x);
        if (gnd > w.y + 0.5 * u) { w.air = true; w.vy = 0; } else w.y = gnd;
      }
      if (w.x > 1.15 * N) reset();
    }
    // the spot: a back wall with its blocks and a fence, the upper level and the steps, the rail or the ledge, the pit
    r.rect(0, 0.2 * N, N, g - 0.2 * N, MID + DIM);
    for (const [bx, by, bw] of w.bricks) r.rect(bx * N, (0.25 + by) * N, bw * N, 0.06 * N, DARK + DIM);
    for (let x = 0; x < N; x += 4 * u) r.rect(x, 0.2 * N - 4 * u, px1(u), 4 * u, DARK);
    r.rect(0, 0.2 * N - 4 * u, N, px1(u), DARK);
    r.rect(0, g, N, N - g, DARK);
    r.rect(0, g, N, px1(u), LMID);
    if (K === 'stairs') {
      r.rect(0, up, 0.45 * N, g - up, MID);
      r.rect(0, up, 0.45 * N, px1(u), LMID);
      for (let k = 0; k < 4; k++) { const sx = (0.45 + k * 0.0425) * N, sy = up + (k + 1) * 0.03 * N; r.rect(sx, sy, 0.0425 * N + 1, g - sy, MID); r.rect(sx, sy, 0.0425 * N + 1, px1(u), LMID); }
    } else if (K === 'ledge') { r.rect(rail[0], rail[1], rail[2] - rail[0], g - rail[1], MID); r.rect(rail[0], rail[1], rail[2] - rail[0], px1(u), LMID); }
    else if (K === 'gap') { r.rect(pitX, g, pitW, N - g, BLACK); r.rect(pitX, g, pitW, px1(u), LMID + DIM); }
    if (rail && K !== 'ledge') { for (const q of [0.1, 0.5, 0.9]) { const x = lerp(rail[0], rail[2], q); r.rect(x - u * 0.6, railY(x), 1.2 * u, Math.min(g, gy(x)) - railY(x), LMID + DIM); } r.stroke(rail[0], rail[1], rail[2], rail[3], px1(1.5 * u), LMID); }
    // the board: a line that turns about its own length; the wheels on whichever side faces down
    const board = (x, y, ang, flip) => {
      const c = Math.cos(ang), sn = Math.sin(ang), Lb = 7 * u, fc = Math.cos(flip), wo = 2.2 * u * fc;
      r.stroke(x - Lb * c, y - Lb * sn, x + Lb * c, y + Lb * sn, px1(u * (0.8 + 1.4 * Math.abs(fc))), fc >= 0 ? DARK : HOT);
      for (const k of [-4, 4]) r.disc(x + k * u * c - wo * sn, y + k * u * sn + wo * c, px1(u), fc >= 0 ? DARK : LMID);
    };
    w.sparks = particles(W, w.sparks, BRIGHT);
    w.dust = drift(W, w.dust, 3 * u, Math.exp(-dt * 2));
    if (w.bail) {
      const B = w.bail, D = w.board, c = Math.cos(B.a), sn = Math.sin(B.a);
      r.stroke(B.x - LB * sn, B.y + LB * c, B.x + LB * sn, B.y - LB * c, px1(2.5 * u), FIG);
      r.disc(B.x + LB * 1.15 * sn, B.y - LB * 1.15 * c, 2.5 * u, FIG);
      board(D.x, D.y, 0, 0);
      for (const k of [-4, 4]) r.rect(D.x + k * u + Math.cos(D.roll) * u * 0.6, D.y + 2.2 * u + Math.sin(D.roll) * u * 0.6, px1(u * 0.7), px1(u * 0.7), BRIGHT); // a spot on each wheel shows it rolling
      targets.push({ x: B.x - LB, y: B.y - LB, w: 2 * LB, h: 2 * LB });
    } else {
      // the nose (ahead, +x) up while rising (vy < 0 means up on screen), level at the top, down toward the landing
      const h = 0.17 * N, tilt = w.air ? 0.45 * clamp(w.vy / (0.8 * N), -1, 1) : w.grind ? Math.atan2(rail[3] - rail[1], rail[2] - rail[0]) : 0;
      board(w.x, w.y - DK, tilt, w.flip);
      walker(r, w.x, w.y - DK - u, h * (w.air ? 0.86 : 1), FIG, w.push > 0 ? Math.sin(t * 14) : 0.3, 1, { cap: true, hatCol: HOT });
      targets.push({ x: w.x - h * 0.3, y: w.y - DK - u - h * 1.05, w: h * 0.6, h: h * 1.05 + DK + u });
    }
    // the filmer: low, rolling along behind, the fisheye on the skater
    w.fx = follow(w.fx, clamp((w.bail ? w.bail.x : w.x) - 0.2 * N, 0.06 * N, 0.94 * N), dt, 0.35);
    const fh = 0.15 * N, fy = g + 0.04 * N;
    croucher(r, w.fx, fy, fh, FIG, 1);
    r.rect(w.fx + fh * 0.2, fy - fh * 0.55, fh * 0.22, fh * 0.16, DARK);
    r.ring(w.fx + fh * 0.44, fy - fh * 0.47, 2.2 * u, px1(u), COOL);
    r.rect(w.fx + fh * 0.44 - u * 0.5, fy - fh * 0.47 - u * 0.5, px1(u), px1(u), BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- basement show
// A basement show: a band on a low stage (the drummer hitting on the kicks and snares, the guitarist windmilling
// with the beat, the singer bent over the mic), the pit in front: a circle running round, a pogo on the beat, or
// the two halves of a wall of death, by the arousal. Beer cans fly on the hats and bounce off the floor, strings
// of lights swing as pendulums, kicked by the kicks; a drop is a stage dive, a parabola into the crowd and across
// it on raised arms.
const PIT_W = { circle: [2, 2, 3], pogo: [3, 2, 1], wall: [0, 1, 3] };
const punkshow = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { pit: rollW(rnd, PIT_W, bandOf(W.a)), crowd: Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * TAU, rr: 0.85 + rnd() * 0.3, x: 0, y: 0, h: 0, vy: 0, side: i % 2 ? 1 : -1, ph: rnd() * TAU, sx: rnd() })),
      cans: [], diver: null, th: 0, om: 0, stickL: 0, kickF: 0, fast: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, bps = bpsOf(f), G = 2.2 * N, floor = 0.95 * N, stY = 0.72 * N, cx = 0.68 * N, cy = 0.8 * N, rx = 0.25 * N, ry = 0.07 * N;
    if (f.section === 'change') w.pit = rollW(rnd, PIT_W, bandOf(W.a));
    for (const h of hits) {
      if (isLow(h)) { w.kickF = 0.1; w.om += 3 * h.strength; for (let k = 0; k < 3; k++) { const c = pick(rnd, w.crowd); c.rr = clamp(c.rr + (rnd() - 0.5) * 0.4, 0.6, 1.25); } }
      else if (h.kind === 'snare') w.stickL = 1;
      else if ((h.kind === 'hat' || h.kind === 'perc') && w.cans.length < 30) { const c = pick(rnd, w.crowd); w.cans.push({ x: c.x, y: c.y - 0.1 * N, vx: (rnd() - 0.5) * 0.5 * N, vy: -(0.3 + rnd() * 0.3) * N, a: rnd() * TAU, av: (rnd() - 0.5) * 20, rest: 0 }); }
      if (isLow(h) && h.strength > 0.9 && !w.diver && rnd() < 0.15) w.diver = { x: 0.4 * N, y: stY - 0.1 * N, vx: 0.4 * N, vy: -0.5 * N, ph: 0, t: 0 };
    }
    if (f.section === 'drop') { w.diver = { x: 0.4 * N, y: stY - 0.1 * N, vx: 0.45 * N, vy: -0.6 * N, ph: 0, t: 0 }; w.fast = 4; }
    w.fast -= dt; w.kickF -= dt; w.stickL = Math.max(0, w.stickL - dt * 6);
    // the room: the back wall and its posters (blocks only), pipes under the ceiling, the strings of lights swinging
    r.rect(0, 0.12 * N, N, floor - 0.12 * N, DARK + DIM);
    for (let k = 0; k < 5; k++) { const x = (0.05 + k * 0.2 + hash(k, 1) * 0.08) * N, y = (0.2 + hash(k, 2) * 0.15) * N; r.rect(x, y, 0.1 * N, 0.13 * N, k % 2 ? LMID + DIM : HOT + DIM); r.rect(x + 2 * u, y + 2 * u, 0.1 * N - 4 * u, 0.05 * N, DARK); }
    r.rect(0, 0, N, 0.12 * N, DARK);
    r.rect(0, 0.04 * N, N, 2 * u, MID + DIM); r.rect(0, 0.08 * N, N, 1.5 * u, MID + DIM);
    w.om += -(2.2 / 0.04) * w.th * dt - 0.6 * w.om * dt; // a pendulum: g over the cord length (0.04 N, as drawn), damped
    w.th += w.om * dt;
    for (let k = 0; k < 2; k++) {
      const y0 = (0.13 + k * 0.05) * N, sag = 0.05 * N;
      for (let i = 0; i <= 14; i++) {
        const q = i / 14, x = (0.03 + q * 0.94) * N, y = y0 + sag * 4 * q * (1 - q), Lc = 0.04 * N, bx = x + Lc * Math.sin(w.th + k * 0.2), by = y + Lc * Math.cos(w.th + k * 0.2);
        r.line(x, y, bx, by, MID + DIM);
        if (hash(i, k * 7 + Math.floor(t * 10)) < 0.4 + 0.6 * (1 - f.rel.trebDrive * 0.7)) r.disc(bx, by, px1(1.2 * u), [HOT, COOL, BRIGHT][(i + k) % 3]);
      }
    }
    // the stage and the band
    r.rect(0, stY, 0.42 * N, floor - stY, DARK);
    r.rect(0, stY, 0.42 * N, px1(u), MID);
    const bh = 0.17 * N;
    { // the drummer: a kick drum that flashes on the kick, a snare, a cymbal, the sticks snapping down on the hits
      const dx = 0.32 * N, base = stY - 0.02 * N;
      r.disc(dx - bh * 0.1, base - bh * 0.2, bh * 0.22, w.kickF > 0 ? BRIGHT : LMID); r.ring(dx - bh * 0.1, base - bh * 0.2, bh * 0.22, px1(u), MID);
      r.rect(dx + bh * 0.15, base - bh * 0.5, bh * 0.25, bh * 0.1, LMID); r.rect(dx + bh * 0.26, base - bh * 0.4, px1(u), bh * 0.4, MID);
      r.rect(dx - bh * 0.55, base - bh * 0.85, bh * 0.3, px1(u), LMID); r.rect(dx - bh * 0.4, base - bh * 0.85, px1(u), bh * 0.85, MID);
      const J = walker(r, dx, base - bh * 0.3, bh * 0.75, FIG, 0, 1, {});
      const aL = -1.1 + 1.2 * w.stickL, aR = -0.6 + 0.9 * Math.max(0, w.kickF * 10);
      r.stroke(J.sx - bh * 0.3, J.sy, J.sx - bh * 0.3 + Math.cos(aL) * bh * 0.3, J.sy + Math.sin(aL) * bh * 0.3, px1(u), LMID);
      r.stroke(J.sx, J.sy, J.sx + Math.cos(aR) * bh * 0.3, J.sy + Math.sin(aR) * bh * 0.3, px1(u), LMID);
    }
    { // the guitarist: the arm goes round once per beat
      const gx = 0.1 * N, J = walker(r, gx, stY, bh, FIG, 0.3 * Math.sin(t * 3), 1, {}), ang = (beatLocked(f) ? f.beat.count + f.beat.phase : t * bps) * TAU;
      r.poly([[gx - bh * 0.2, J.sy + bh * 0.25], [gx + bh * 0.25, J.sy + bh * 0.05], [gx + bh * 0.3, J.sy + bh * 0.22], [gx - bh * 0.1, J.sy + bh * 0.45]], HOT);
      r.stroke(gx + bh * 0.3, J.sy + bh * 0.12, gx + bh * 0.6, J.sy - bh * 0.1, px1(u), LMID);
      r.stroke(J.sx, J.sy, J.sx + Math.cos(ang) * bh * 0.4, J.sy + Math.sin(ang) * bh * 0.4, px1(1.3 * u), FIG);
    }
    { // the singer bent over the mic, further with the level
      const sx = 0.23 * N, lean = 0.5 + 0.5 * f.level, top = stY - bh * 0.95;
      r.rect(sx + bh * 0.3 - u * 0.6, stY - bh * 0.8, 1.2 * u, bh * 0.8, LMID); r.rect(sx + bh * 0.3 - 1.5 * u, stY - bh * 0.84, 3 * u, 2 * u, MID);
      r.rect(sx - bh * 0.08, stY - bh * 0.35, bh * 0.07, bh * 0.35, FIG); r.rect(sx + bh * 0.03, stY - bh * 0.35, bh * 0.07, bh * 0.35, FIG);
      const hx = sx + lean * bh * 0.3, hy = top + lean * bh * 0.35;
      r.stroke(sx, stY - bh * 0.35, hx, hy, px1(2.5 * u), FIG);
      r.disc(hx + bh * 0.08, hy - bh * 0.02, bh * 0.1, FIG);
      r.stroke(hx, hy + bh * 0.05, sx + bh * 0.28, stY - bh * 0.78, px1(u), FIG);
    }
    // the pit: the ring running round (a bump on a kick), the pogo on the beat, or the wall of death on the bar
    const q8 = ((f.beat.count % 8) + f.beat.phase) / 8;
    const order = w.crowd.map((c, i) => i);
    for (const c of w.crowd) {
      if (w.pit === 'circle' || w.fast > 0) c.a += dt * bps * 0.9 * (w.fast > 0 ? 1.8 : 1);
      c.rr = follow(c.rr, 1, dt, 1.5);
      let tx = cx + Math.cos(c.a) * rx * c.rr, ty = cy + Math.sin(c.a) * ry * c.rr;
      if (w.pit === 'pogo' && w.fast <= 0) { tx = (0.46 + c.sx * 0.5) * N; ty = cy + Math.sin(c.a) * ry * 0.6; if (f.beat.on && !c.h) c.vy = -N * (0.35 + rnd() * 0.25); }
      else if (w.pit === 'wall' && w.fast <= 0) { const spread = q8 < 0.5 ? 1 : q8 < 0.62 ? 1 - (q8 - 0.5) / 0.12 : 0; tx = lerp(cx + Math.cos(c.a) * rx * 0.5, cx + c.side * rx * 0.95, spread); ty = cy + Math.sin(c.a) * ry; if (q8 >= 0.6 && q8 < 0.63 && f.beat.phase < 0.1) c.rr = 0.7 + rnd() * 0.6; }
      const x0 = c.x, y0 = c.y;
      c.x = c.x ? follow(c.x, tx, dt, 0.18) : tx; c.y = c.y ? follow(c.y, ty, dt, 0.18) : ty;
      c.vy += G * dt; c.h += c.vy * dt; if (c.h > 0) { c.h = 0; c.vy = 0; }
      if (x0) c.ph = stride(c.ph, Math.hypot(c.x - x0, ((c.y - y0) * rx) / ry), 0.12 * N); // the legs by the way run on the floor (y is depth, foreshortened)
    }
    order.sort((i, j) => w.crowd[i].y - w.crowd[j].y);
    for (const i of order) {
      const c = w.crowd[i], depth = (c.y - (cy - ry)) / (2 * ry), hh = 0.12 * N * (0.8 + 0.35 * depth), dir = Math.cos(c.a) >= 0 ? -1 : 1;
      const J = walker(r, c.x, c.y + c.h, hh, FIG, c.ph, dir, {});
      if (f.beat.pulse > 0.5 && hash(i, f.beat.count) < 0.5) r.stroke(J.sx, J.sy, J.sx + dir * hh * 0.15, J.sy - hh * 0.4, px1(u), FIG);
    }
    // the diver: off the stage edge on a parabola, caught at the crowd's height and carried across on raised arms, dropped at the end
    if (w.diver) {
      const D = w.diver;
      D.t += dt;
      if (D.ph === 0 || D.ph === 2) { D.vy += G * dt; D.y += D.vy * dt; D.x += D.vx * dt; if (D.ph === 0 && D.vy > 0 && D.y >= cy - 0.13 * N && D.x > 0.44 * N) { D.ph = 1; D.vx = 0.13 * N; D.y = cy - 0.13 * N; } if (D.ph === 2 && D.y > cy) w.diver = null; }
      else { D.x += D.vx * dt; D.y = cy - 0.13 * N + Math.sin(t * 6) * u; for (let k = 0; k < 4; k++) r.line(D.x - 0.06 * N + k * 0.04 * N, D.y + 0.06 * N, D.x - 0.05 * N + k * 0.04 * N, D.y + 2 * u, FIG); if (D.x > 0.93 * N || D.t > 5) { D.ph = 2; D.vy = 0; D.vx = 0.05 * N; } }
      if (w.diver) { const Lb = 0.07 * N; r.stroke(D.x - Lb, D.y + (D.ph === 1 ? 0 : -Lb * 0.3), D.x + Lb, D.y + (D.ph === 1 ? 0 : Lb * 0.3), px1(2.5 * u), FIG); r.disc(D.x + Lb * 1.1, D.y, 2.5 * u, FIG); targets.push({ x: D.x - Lb, y: D.y - Lb * 0.5, w: 2 * Lb, h: Lb }); }
    }
    // the cans: thrown, turning, under gravity; they bounce off the floor and lose it, then lie still a moment
    w.cans = w.cans.filter((c) => {
      c.vy += G * dt; c.y += c.vy * dt; c.x += c.vx * dt; c.a += c.av * dt;
      if (c.y >= floor - u) { c.y = floor - u; if (Math.abs(c.vy) < 0.08 * N) { c.vy = 0; c.vx *= Math.exp(-dt * 6); c.av = 0; c.a = Math.round(c.a / Math.PI) * Math.PI; c.rest += dt; } else { c.vy = -c.vy * 0.45; c.vx *= 0.7; c.av *= 0.5; } }
      const dx = Math.cos(c.a) * 2 * u, dy = Math.sin(c.a) * 2 * u;
      r.stroke(c.x - dx, c.y - dy, c.x + dx, c.y + dy, px1(1.6 * u), LMID);
      r.rect(c.x - u * 0.5, c.y - u * 0.5, px1(u), px1(u), HOT);
      return c.rest < 2 && c.x > -0.1 * N && c.x < 1.1 * N;
    });
    r.rect(0, floor, N, N - floor, DARK);
    targets.push({ x: 0.05 * N, y: stY - bh, w: 0.35 * N, h: bh });
  },
};

// ---------------------------------------------------------------------------------------------- zine
// A xerox zine spread: halftone photos (dithered gradients), cut-outs that shift and re-stack on the beat, tape
// strips, text as bundles of grey lines (never letters), one accent colour. The stapler stamps on the snare, the
// specks of the copier come with the level, a section turns the page in perspective, a drop splashes the accent
// ink across the spread and lets it run.
const ZINE_W = { photo: [3, 2, 1], collage: [2, 2, 2], grid: [1, 2, 3] };
function rotRect(cx, cy, hw, hh, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [[cx - hw * c + hh * s, cy - hw * s - hh * c], [cx + hw * c + hh * s, cy + hw * s - hh * c], [cx + hw * c - hh * s, cy + hw * s + hh * c], [cx - hw * c - hh * s, cy - hw * s + hh * c]];
}
function zinePage(rnd, kind, z) {
  const it = [], text = (x, y, w, h) => it.push({ t: 'text', x, y, w, h, seed: Math.floor(rnd() * 999), z: z++ });
  if (kind === 'photo') { it.push({ t: 'half', x: 0.08, y: 0.08, w: 0.84, h: 0.5, seed: Math.floor(rnd() * 99), z: z++ }); it.push({ t: 'bar', x: 0.08, y: 0.62, w: 0.6 + rnd() * 0.3, h: 0.05, pulse: 0, z: z++ }); text(0.08, 0.7, 0.4, 0.24); text(0.54, 0.7, 0.38, 0.24); }
  else if (kind === 'grid') { for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) { if (rnd() < 0.7) it.push({ t: 'half', x: 0.08 + i * 0.45, y: 0.07 + j * 0.3, w: 0.38, h: 0.2, seed: Math.floor(rnd() * 99), z: z++ }); else text(0.08 + i * 0.45, 0.07 + j * 0.3, 0.38, 0.2); } }
  else { it.push({ t: 'half', x: 0.1 + rnd() * 0.3, y: 0.1 + rnd() * 0.2, w: 0.45, h: 0.3, seed: Math.floor(rnd() * 99), z: z++ }); text(0.08, 0.68, 0.84, 0.25); for (let k = 0; k < 5; k++) it.push({ t: 'cut', x: 0.1 + rnd() * 0.7, y: 0.1 + rnd() * 0.55, s: 0.08 + rnd() * 0.12, a: (rnd() - 0.5) * 0.8, shape: Math.floor(rnd() * 3), c: k === 0 ? HOT : k % 2 ? FIG : MID, z: z++ }); }
  for (let k = 0; k < 3; k++) it.push({ t: 'tape', x: rnd() < 0.5 ? 0.04 : 0.88, y: 0.06 + rnd() * 0.85, a: (rnd() - 0.5) * 1.2, z: z++ });
  it.push({ t: 'cut', x: 0.75 + rnd() * 0.15, y: 0.12 + rnd() * 0.7, s: 0.07, a: 0, shape: 1, c: HOT, z: z++ });
  return it;
}
const zine = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, ZINE_W, band), z: 200, turn: -1, flipped: false, stamp: 0, staples: [], splash: null, pages: [] });
    w.pages = [zinePage(rnd, w.kind, 0), zinePage(rnd, rollW(rnd, ZINE_W, band), 100)];
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), buf = r.buf;
    const PX = 0.06 * N, PY = 0.08 * N, PW = 0.44 * N, PH = 0.84 * N, spine = 0.5 * N;
    if (f.section === 'change' && w.turn < 0) w.turn = 0;
    if (f.section === 'drop') { const bl = [], x0 = 0.15 + rnd() * 0.2, y0 = 0.2 + rnd() * 0.3; for (let k = 0; k < 7; k++) bl.push({ x: x0 + k * 0.09 + (rnd() - 0.5) * 0.04, y: y0 + k * 0.05 + (rnd() - 0.5) * 0.08, R: 0.02 + rnd() * 0.035, len: 0, v: (0.1 + rnd() * 0.2) * N }); w.splash = bl; }
    const shuffle = (pg, amt, turn) => { const cuts = pg.filter((i) => i.t === 'cut'); if (!cuts.length) return; const c = pick(rnd, cuts); c.x = clamp(c.x + (rnd() - 0.5) * amt, 0.06, 0.9); c.y = clamp(c.y + (rnd() - 0.5) * amt, 0.06, 0.9); c.a += (rnd() - 0.5) * turn; c.z = w.z++; };
    for (const h of hits) {
      if (h.kind === 'snare') { w.stamp = 0.12; if (w.staples.length < 14) w.staples.push(0.1 + rnd() * 0.8); }
      else if (isLow(h)) for (const pg of w.pages) { shuffle(pg, 0.1, 0.4); const bar = pg.find((i) => i.t === 'bar'); if (bar) bar.pulse = 1; }
    }
    if (f.beat.on) for (const pg of w.pages) shuffle(pg, 0.04, 0.3);
    // the desk and the two pages; the items of each page in their stacking order
    r.rect(0, 0, N, N, DARK);
    const page = (side, items) => {
      const ox = side ? spine : PX;
      r.rect(ox, PY, PW, PH, BRIGHT);
      for (const it of [...items].sort((a, b) => a.z - b.z)) {
        const x = ox + it.x * PW, y = PY + it.y * PH;
        if (it.t === 'half') { // a halftone: a lit gradient with a dark subject in it, thresholded by the dither matrix
          const bw = it.w * PW, bhh = it.h * PH, x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(N, Math.round(x + bw)), y1 = Math.min(N, Math.round(y + bhh));
          const sx = 0.3 + (it.seed % 5) * 0.1, sy = 0.35 + ((it.seed >> 2) % 4) * 0.1, dirx = it.seed % 2 ? 1 : -1;
          for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
            const qx = (xx - x) / bw, qy = (yy - y) / bhh, d = Math.hypot((qx - sx) * 1.4, (qy - sy) * 2);
            const v = 0.25 + 0.5 * (dirx > 0 ? qx : 1 - qx) + 0.3 * qy - (d < 0.3 ? 0.55 : d < 0.4 ? 0.3 : 0) + (hash(xx, yy) - 0.5) * 0.12;
            buf[yy * N + xx] = bayer(xx, yy) > v ? FIG : BRIGHT;
          }
          r.frame(x0, y0, x1 - x0, y1 - y0, FIG);
        } else if (it.t === 'text') { for (let ly = y, k = 0; ly < y + it.h * PH - u; ly += 3 * u, k++) r.rect(x, ly, it.w * PW * (k % 5 === 4 ? 0.3 + hash(k, it.seed) * 0.4 : 0.85 + hash(k, it.seed) * 0.15), px1(1.2 * u), MID); }
        else if (it.t === 'bar') { it.pulse *= Math.exp(-dt * 8); r.rect(x, y - it.pulse * 2 * u, it.w * PW, it.h * PH + it.pulse * 4 * u, HOT); }
        else if (it.t === 'tape') r.poly(rotRect(x, y, 0.09 * PW, 0.02 * PH, it.a), LMID);
        else { // a cut-out: a torn rectangle, a round sticker or a triangle, with its edge when it is not ink itself
          const S = it.s * PW;
          if (it.shape === 1) { r.disc(x, y, S * 0.7, it.c); if (it.c !== FIG) r.ring(x, y, S * 0.7, px1(u), FIG); }
          else {
            const pts = it.shape === 0 ? rotRect(x, y, S, S * 0.7, it.a) : [[x + Math.cos(it.a) * S, y + Math.sin(it.a) * S], [x + Math.cos(it.a + 2.1) * S, y + Math.sin(it.a + 2.1) * S], [x + Math.cos(it.a + 4.2) * S, y + Math.sin(it.a + 4.2) * S]];
            r.poly(pts, it.c);
            if (it.c !== FIG) outline(r, pts, px1(u), FIG);
          }
        }
      }
    };
    page(0, w.pages[0]);
    page(1, w.pages[1]);
    r.rect(spine - u, PY, 2 * u, PH, DARK + DIM);
    for (const sy of w.staples) r.rect(spine - 2.5 * u, PY + sy * PH, 5 * u, px1(u), FIG);
    // the splash: blobs of the accent along a streak, drips that run down and slow
    if (w.splash) for (const b of w.splash) {
      const x = PX + b.x * (N - 2 * PX), y = PY + b.y * PH;
      r.disc(x, y, b.R * N, HOT);
      b.len += b.v * dt; b.v *= Math.exp(-dt * 1.2);
      r.rect(x - u * 0.5, y, px1(u), Math.min(b.len, PY + PH - y), HOT);
      r.disc(x, Math.min(y + b.len, PY + PH), px1(1.4 * u), HOT);
    }
    // the copier's specks
    const n = Math.round((20 + 60 * f.level * (1 + f.rel.trebDrive)) * u * u), tt = Math.floor(t * 20);
    for (let k = 0; k < n; k++) { const x = PX + hash(k, tt) * (N - 2 * PX), y = PY + hash(k + 777, tt) * PH; if (r.get(x, y) === BRIGHT) r.set(x, y, FIG); }
    // the page turn: the right page swings up about the spine and over onto the left one, whose new face is what was on
    // its back. Seen from above the spine, the lifted free edge comes nearer the eye, so it draws larger (its x and its
    // height both by H / (H - PW sin a), the camera H = 5 PW over the desk), never smaller
    if (w.turn >= 0) {
      w.turn += dt / 1.3;
      const p = Math.min(1, w.turn), sc = 5 / (5 - Math.sin(Math.PI * p)), xe = spine + PW * Math.cos(Math.PI * p) * sc, k = PH * 0.5 * (sc - 1);
      if (!w.flipped) { w.flipped = true; w.pages[1] = zinePage(rnd, rollW(rnd, ZINE_W, band), w.z); w.z += 100; }
      r.poly([[spine, PY], [xe, PY - k], [xe, PY + PH + k], [spine, PY + PH]], p < 0.5 ? LMID : BRIGHT);
      if (p >= 0.5) r.poly([[spine, PY], [lerp(spine, xe, 0.15), PY - k * 0.15], [lerp(spine, xe, 0.15), PY + PH + k * 0.15], [spine, PY + PH]], LMID);
      if (w.turn >= 1) { w.turn = -1; w.flipped = false; w.kind = rollW(rnd, ZINE_W, band); w.pages[0] = zinePage(rnd, w.kind, w.z); w.z += 100; w.splash = null; w.staples.length = 0; }
    }
    // the stapler at the corner of the desk, its lever down for the stamp
    w.stamp -= dt;
    const sx = 0.86 * N, sy = 0.95 * N;
    r.rect(sx - 0.07 * N, sy - 1.5 * u, 0.14 * N, 1.5 * u, DARK + DIM);
    r.stroke(sx + 0.06 * N, sy - 3 * u, sx - 0.06 * N, sy - (w.stamp > 0 ? 3 : 5.5) * u, px1(2.5 * u), MID);
    targets.push({ x: PX, y: PY, w: N - 2 * PX, h: PH });
  },
};

// ---------------------------------------------------------------------------------------------- sticker post
// A lamp post, a sign pole or a junction box under its stickers: every hit adds one (a circle, a slanted
// rectangle, a star, an eye; never a word), a hand slaps the kick's on. They weather: dim with age, a corner
// peels, the oldest fall off. A section brings rain streaking down; a drop wheat-pastes a big poster over the lot,
// the paste running. The lamp flickers on the beat, a moth circles it faster with the treble.
const POST_W = { lamp: [3, 2, 1], sign: [2, 2, 2], box: [1, 2, 3] };
const stickerpost = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, POST_W, bandOf(W.a)), st: [], hand: null, rain: 0, poster: null, moth: rnd() * TAU, drops: [], age: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, g = 0.9 * N, K = w.kind, cx = 0.5 * N, top = 0.08 * N;
    // the x range of the surface at a height: the pole, the plates of the sign, the whole box
    const span = (y) => (K === 'box' && y > 0.3 * N ? 0.13 * N : K === 'sign' && ((y > 0.22 * N && y < 0.36 * N) || (y > 0.4 * N && y < 0.5 * N)) ? (y < 0.38 * N ? 0.15 : 0.1) * N : 0.035 * N);
    const place = (c, s) => { const y = lerp(top + 0.08 * N, g - 0.04 * N, rnd()), sp = span(y); return { x: cx + (rnd() - 0.5) * 2 * Math.max(0, sp - s * 0.4), y, s, c, shape: Math.floor(rnd() * 4), age: 0, corner: Math.floor(rnd() * 4), a: (rnd() - 0.5) * 0.8 }; };
    if (f.section === 'change') { w.kind = rollW(rnd, POST_W, bandOf(W.a)); w.rain = 4; }
    if (f.section === 'drop' && !w.poster) w.poster = { t: 0, drips: Array.from({ length: 5 }, () => ({ x: (rnd() - 0.5) * 0.24, len: 0, v: (0.03 + rnd() * 0.05) * N })) };
    for (const h of hits) {
      const c = isTonal(h) ? [HOT, COOL, BRIGHT, LMID][h.pc % 4] : h.kind === 'snare' ? BRIGHT : h.kind === 'hat' ? COOL : HOT, s = (2.5 + 3 * h.strength) * u;
      if (isLow(h)) { if (!w.hand) w.hand = { t: 0, st: place(c, s) }; }
      else if (rnd() < 0.6) w.st.push(place(c, s));
    }
    while (w.st.length > 44) w.st.shift();
    w.rain -= dt;
    const wet = w.rain > 0;
    // the lamp and its light; a flicker on the beat, the moth round the lamp
    const lampY = top + 0.02 * N, dim = f.beat.on && hash(f.beat.count, 3) < 0.35;
    r.poly([[cx - 2 * u, lampY], [cx + 2 * u, lampY], [cx + 0.34 * N, g], [cx - 0.34 * N, g]], dim ? DARK : LMID + DIM);
    r.rect(0, g, N, N - g, DARK);
    r.rect(0, g, N, px1(u), MID);
    if (K === 'box') { r.rect(cx - 0.13 * N, 0.3 * N, 0.26 * N, g - 0.3 * N, MID); r.rect(cx - u * 0.5, 0.33 * N, px1(u), g - 0.36 * N, DARK); r.rect(cx + 0.02 * N, 0.58 * N, 2 * u, 3 * u, DARK); r.rect(cx - 0.13 * N, 0.3 * N, 0.26 * N, 2 * u, LMID); }
    r.rect(cx - 0.035 * N, top, 0.07 * N, (K === 'box' ? 0.3 * N : g) - top, MID);
    r.rect(cx - 0.035 * N, top, px1(u), (K === 'box' ? 0.3 * N : g) - top, LMID);
    if (K === 'sign') for (const [y, hh, ww] of [[0.22, 0.14, 0.15], [0.4, 0.1, 0.1]]) { r.rect(cx - ww * N, y * N, 2 * ww * N, hh * N, MID + DIM); r.frame(Math.round(cx - ww * N), Math.round(y * N), Math.round(2 * ww * N), Math.round(hh * N), LMID); r.poly([[cx - ww * N * 0.5, (y + hh * 0.5) * N - 2 * u], [cx + ww * N * 0.3, (y + hh * 0.5) * N - 2 * u], [cx + ww * N * 0.3, (y + hh * 0.5) * N - 4 * u], [cx + ww * N * 0.7, (y + hh * 0.5) * N], [cx + ww * N * 0.3, (y + hh * 0.5) * N + 4 * u], [cx + ww * N * 0.3, (y + hh * 0.5) * N + 2 * u], [cx - ww * N * 0.5, (y + hh * 0.5) * N + 2 * u]], LMID); }
    r.rect(cx - 0.06 * N, top - 0.04 * N, 0.12 * N, 0.04 * N, DARK);
    r.disc(cx, lampY, 2.5 * u, dim ? LMID : BRIGHT);
    w.moth += dt * (3 + 6 * f.rel.trebDrive);
    r.rect(cx + Math.cos(w.moth) * 0.05 * N, lampY + 0.02 * N + Math.sin(w.moth * 1.3) * 0.02 * N, px1(u), px1(u), LMID);
    // the stickers, oldest first: dimmed with age, a corner peeling after a while
    const sticker = (st, c) => {
      const { x, y, s } = st;
      if (st.shape === 0) { r.disc(x, y, s, c); r.ring(x, y, s, px1(u * 0.8), FIG); }
      else if (st.shape === 1) { const pts = rotRect(x, y, s * 1.2, s * 0.7, st.a); r.poly(pts, c); outline(r, pts, px1(u * 0.8), FIG); }
      else if (st.shape === 2) { const pts = []; for (let i = 0; i < 10; i++) { const a = st.a + (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? s * 0.45 : s; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); } r.poly(pts, c); }
      else { r.ring(x, y, s * 0.6, s * 1.2, c, 0.55); r.disc(x, y, s * 0.4, FIG); r.rect(x - u * 0.5, y - u * 0.5, px1(u), px1(u), BRIGHT); }
    };
    for (const st of w.st) {
      st.age += dt * (wet ? 3 : 1);
      sticker(st, st.age > 14 && st.c < 8 ? st.c + DIM : st.c);
      if (st.age > 6) { const k = Math.min(1, (st.age - 6) / 16) * st.s * 0.9, sx = st.corner & 1 ? 1 : -1, sy = st.corner & 2 ? 1 : -1; r.poly([[st.x + sx * st.s, st.y + sy * st.s], [st.x + sx * (st.s - k), st.y + sy * st.s], [st.x + sx * st.s, st.y + sy * (st.s - k)]], DARK); }
    }
    // the hand: in from the right with the sticker, the slap, and out again
    if (w.hand) {
      const H = w.hand, q = H.t < 0.14 ? ease(H.t / 0.14) : H.t < 0.24 ? 1 : 1 - ease((H.t - 0.24) / 0.3), hx = lerp(N + 0.05 * N, H.st.x + 2 * u, q), hy = lerp(H.st.y + 0.12 * N, H.st.y, q);
      if (H.t < 0.14) sticker({ ...H.st, x: hx - 2 * u, y: hy }, H.st.c); // in the hand only on the way in: after the slap it is on the post
      if (H.t >= 0.14 && !H.done) { H.done = true; w.st.push(H.st); }
      r.stroke(N + 2 * u, hy + 0.16 * N, hx + 2 * u, hy + 2 * u, px1(3 * u), FIG);
      r.disc(hx + 1.5 * u, hy, 3 * u, FIG);
      H.t += dt;
      if (H.t > 0.54) w.hand = null;
    }
    // the rain: streaks down the surface and drops off the lamp hood
    if (wet) {
      const tt = Math.floor(t * 30);
      for (let k = 0; k < 10 * u; k++) { const y = top + hash(k, tt) * (g - top), sp = span(y); r.rect(cx + (hash(k + 50, tt) - 0.5) * 2 * sp, y, px1(u * 0.7), 3 * u, LMID); }
      if (rnd() < 0.5) w.drops.push({ x: cx + (rnd() - 0.5) * 0.12 * N, y: top, vx: 0, vy: 0.3 * N, life: 1 });
    }
    w.drops = particles(W, w.drops, COOL).filter((p) => p.y < g);
    // the poster: pasted from the top down over everything, the paste running below it; it weathers like the rest
    if (w.poster) {
      const P = w.poster, px0 = cx - 0.15 * N, py0 = 0.28 * N, ph = 0.42 * N, shown = Math.min(1, P.t / 0.7) * ph;
      P.t += dt;
      r.rect(px0, py0, 0.3 * N, shown, LMID);
      if (shown > ph * 0.6) { r.ring(cx, py0 + ph * 0.38, 0.07 * N, 2.5 * u, HOT); r.rect(px0 + 0.05 * N, py0 + ph * 0.72, 0.2 * N, 2 * u, FIG); r.rect(px0 + 0.05 * N, py0 + ph * 0.8, 0.14 * N, 2 * u, FIG); }
      if (P.t < 0.7) { r.stroke(N + 2 * u, py0 + shown + 0.16 * N, cx + 0.05 * N, py0 + shown, px1(3 * u), FIG); r.rect(cx - 0.05 * N, py0 + shown - u, 0.1 * N, 2 * u, MID); }
      else { w.st = w.st.filter((st) => st.y < py0 || st.y > py0 + ph); for (const d of P.drips) { d.len += d.v * dt; d.v *= Math.exp(-dt * 0.8); r.rect(cx + d.x * N, py0 + ph, px1(u), Math.min(d.len, g - py0 - ph), LMID + DIM); } }
      if (P.t > 10) { const k = Math.min(1, (P.t - 10) / 10) * 0.12 * N; r.poly([[px0 + 0.3 * N, py0 + ph], [px0 + 0.3 * N - k, py0 + ph], [px0 + 0.3 * N, py0 + ph - k]], DARK); }
      if (P.t > 30) w.poster = null;
    }
    targets.push({ x: cx - 0.15 * N, y: top, w: 0.3 * N, h: g - top });
  },
};

// ---------------------------------------------------------------------------------------------- cypher
// A cypher under a bridge: a ring of figures with one in the middle gesturing (the arm pushes on the kicks, the
// head nods on the beat), a beatboxer whose cheek puffs on the snare, a car with its trunk open on speakers that
// pump with the bass, its headlights throwing the shadows long away from them. Trains cross the bridge on a
// section; a drop has the whole ring jumping with their hands up. The formation follows the arousal.
const CYPHER_W = { circle: [3, 2, 1], line: [2, 2, 2], crowd: [1, 2, 3] };
const cypher = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, CYPHER_W, bandOf(W.a)), folks: Array.from({ length: 12 }, (_, i) => ({ i, x: 0, y: 0, h: 0, vy: 0, ph: rnd() * TAU, walk: 0, sz: 0.9 + rnd() * 0.2, turn: 0 })), push: 0, puff: 0, train: null, jump: 0, glow: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, g = 0.86 * N, bps = bpsOf(f), K = w.kind, lx = 0.64 * N, cx = 0.36 * N;
    if (f.section === 'change') { w.kind = rollW(rnd, CYPHER_W, bandOf(W.a)); w.train = { x: 1.2, v: 0.3 + rnd() * 0.25, n: 4 + Math.floor(rnd() * 4) }; }
    if (f.section === 'drop') w.jump = 4;
    for (const h of hits) {
      if (isLow(h)) w.push = 1;
      else if (h.kind === 'snare') { w.puff = 1; for (let k = 0; k < 2; k++) pick(rnd, w.folks).turn = 0.5; }
      if (isTonal(h)) w.glow = 0.6;
    }
    w.push *= Math.exp(-dt * 7); w.puff *= Math.exp(-dt * 6); w.glow -= dt; w.jump -= dt;
    // the bridge overhead with a train on it, its piers, the girders
    r.rect(0, 0.09 * N, N, 0.1 * N, DARK);
    r.rect(0, 0.19 * N, N, 0.02 * N, DARK + DIM);
    for (let x = 0.02 * N; x < N; x += 0.06 * N) r.rect(x, 0.19 * N, 2 * u, 0.02 * N, DARK);
    r.rect(0, 0.08 * N, N, px1(u), MID + DIM);
    if (w.train) {
      w.train.x -= dt * w.train.v;
      for (let k = 0; k < w.train.n; k++) { const x = (w.train.x + k * 0.22) * N; r.rect(x, 0.025 * N, 0.2 * N, 0.055 * N, DARK); for (let q = 0; q < 5; q++) r.rect(x + (0.02 + q * 0.038) * N, 0.035 * N, 0.022 * N, 0.025 * N, hash(k, q) < 0.8 ? LMID : DARK + DIM); }
      if (w.train.x < -w.train.n * 0.25) w.train = null;
    }
    for (const px of [0.06, 0.9]) { r.rect(px * N, 0.21 * N, 0.06 * N, g - 0.21 * N, DARK); r.rect(px * N, 0.21 * N, px1(u), g - 0.21 * N, MID + DIM); }
    // the headlights: the beam along the ground to the left, the car behind it with its trunk up on the speakers
    r.rect(0, g, N, N - g, DARK + DIM);
    r.poly([[lx, g - 0.07 * N], [lx, g - 0.04 * N], [0, g + 0.03 * N], [0, g - 0.3 * N]], LMID + DIM);
    r.rect(0, g, N, px1(u), MID);
    const cw = 0.34 * N, ch = 0.1 * N, carY = g - ch;
    r.rect(lx, carY, cw, ch, MID);
    r.rect(lx + cw * 0.2, carY - ch * 0.55, cw * 0.5, ch * 0.55, MID);
    r.rect(lx + cw * 0.24, carY - ch * 0.48, cw * 0.42, ch * 0.4, w.glow > 0 ? COOL : DARK);
    r.poly([[lx + cw * 0.78, carY], [lx + cw * 0.98, carY], [lx + cw * 0.9, carY - ch * 0.9], [lx + cw * 0.74, carY - ch * 0.75]], MID); // the trunk lid, up
    r.rect(lx + cw * 0.76, carY + ch * 0.1, cw * 0.22, ch * 0.75, DARK);
    for (const q of [0.33, 0.66]) cone(r, lx + cw * 0.87, carY + ch * q + ch * 0.1, ch * 0.16, f.rel.bassDrive, u);
    for (const wq of [0.17, 0.8]) r.disc(lx + cw * wq, g - 3 * u, 3 * u, BLACK); // the wheels sit on the ground, not in it
    r.rect(lx - u, carY + ch * 0.25, 2 * u, 2.5 * u, BRIGHT);
    r.rect(lx + cw - u, carY + ch * 0.25, 2 * u, 2 * u, HOT);
    // the ring: by the formation, open toward us; the middle one gestures; shadows away from the headlights
    const n = K === 'crowd' ? 10 : K === 'line' ? 6 : 7, folks = w.folks.slice(0, n);
    const hb = 0.13 * N;
    for (let k = 0; k < n; k++) {
      const F = folks[k];
      let tx, ty;
      if (K === 'circle') { const a = 0.78 * Math.PI + (k / (n - 1)) * 1.44 * Math.PI; tx = cx + Math.cos(a) * 0.27 * N; ty = g - 0.01 * N + Math.sin(a) * 0.045 * N; }
      else if (K === 'line') { tx = 0.06 * N + k * 0.09 * N; ty = g - 0.03 * N + (k % 2) * 0.02 * N; }
      else { tx = 0.05 * N + (k % 5) * 0.12 * N + (k >= 5 ? 0.06 * N : 0); ty = g - 0.05 * N + (k >= 5 ? 0.045 * N : 0); }
      const x0 = F.x;
      F.x = F.x ? follow(F.x, tx, dt, 0.6) : tx; F.y = F.y ? follow(F.y, ty, dt, 0.6) : ty;
      if (x0) F.walk = stride(F.walk, F.x - x0, hb); // the legs step with the shuffle to a new formation
      if (w.jump > 0 && f.beat.on && !F.h) F.vy = -N * (0.3 + 0.15 * rnd());
      F.vy += 2.2 * N * dt; F.h += F.vy * dt; if (F.h > 0) { F.h = 0; F.vy = 0; }
      F.turn -= dt;
    }
    const all = [...folks.map((F) => ({ F, mc: false })), { F: { x: cx, y: g + 0.005 * N, h: 0, sz: 1, ph: 0, walk: 0, turn: 0, i: 99 }, mc: true }].sort((a, b) => a.F.y - b.F.y);
    for (const { F, mc } of all) {
      const h = hb * F.sz * (0.9 + 0.3 * ((F.y - g) / (0.05 * N) + 0.5)), dir = F.x < cx || mc ? 1 : -1;
      shadow(r, F.x, F.y, h, lx, u, 0.3 * N);
      const nod = f.beat.pulse * (F.i % 2 ? 1 : 0.5) * 1.5 * u;
      const J = walker(r, F.x, F.y + F.h, h, FIG, w.jump > 0 ? 0.6 : F.walk + 0.15 * Math.sin(t * 2 + F.ph), dir, { cap: mc || F.i % 3 === 0, hatCol: mc ? HOT : FIG });
      if (nod > 0.3 * u) r.rect(F.x - h * 0.1, J.head - h * 0.1 + nod, h * 0.2, px1(u), FIG);
      if (mc) { // the arm pushing forward on the kick, the head nodding
        r.stroke(J.sx, J.sy, J.sx + dir * h * (0.15 + 0.3 * w.push), J.sy - h * 0.1 - w.push * h * 0.1, px1(1.3 * u), FIG);
        if (w.push > 0.5) r.disc(J.sx + dir * h * 0.45, J.sy - h * 0.2, 1.5 * u, FIG);
        targets.push({ x: F.x - h * 0.4, y: J.top - 2 * u, w: h * 0.8, h: h + 2 * u });
      } else if (F.i === 0) r.disc(F.x + dir * h * 0.1, J.head + h * 0.02, h * 0.07 * (1 + 0.9 * w.puff), FIG); // the beatboxer's cheek
      if (w.jump > 0 || F.turn > 0) r.stroke(J.sx, J.sy, J.sx + dir * h * 0.1, J.sy - h * 0.42, px1(u), FIG); // hands up
    }
    targets.push({ x: lx, y: carY - ch, w: cw, h: 2 * ch });
  },
};

// ---------------------------------------------------------------------------------------------- dirt line
// A BMX dirt line in profile, scrolling: rollers, doubles or the big set, by the arousal. The rider pumps on the
// beat, leaves a lip when the ground drops away faster than gravity would take him, jumps on the kicks (a
// parabola off the lip, landing on the downslope), throws a trick on a snare in the air: a tabletop tilt, or a
// backflip whose rate is set to come round before the landing. Dust puffs where the wheels land. A drop puts the
// big set in and a no-hander in the hang time.
const LINE_W = { rollers: [3, 2, 1], doubles: [2, 2, 2], bigset: [0, 1, 3] };
function lineOf(kind, N) {
  const S = [], add = (len, type, h0 = 0, h1 = 0) => { const x0 = S.length ? S[S.length - 1].x1 : 0; S.push({ x0, x1: x0 + len, type, h0, h1 }); };
  if (kind === 'rollers') for (let k = 0; k < 4; k++) { add(0.06 * N, 'flat'); add(0.2 * N, 'bump', 0.05 * N); }
  else if (kind === 'doubles') for (let k = 0; k < 2; k++) { add(0.2 * N, 'flat'); add(0.1 * N, 'up', 0, 0.09 * N); add(0.12 * N, 'flat'); add(0.15 * N, 'down', 0.09 * N, 0); }
  else { add(0.26 * N, 'flat'); add(0.12 * N, 'up', 0, 0.14 * N); add(0.22 * N, 'flat'); add(0.22 * N, 'down', 0.14 * N, 0); add(0.16 * N, 'flat'); add(0.2 * N, 'bump', 0.05 * N); }
  return { S, P: S[S.length - 1].x1 };
}
const heightAt = (Ln, x) => {
  const q = ((x % Ln.P) + Ln.P) % Ln.P;
  for (const s of Ln.S) if (q < s.x1) { const k = (q - s.x0) / (s.x1 - s.x0); return s.type === 'flat' ? 0 : s.type === 'up' ? s.h1 * k * k : s.type === 'down' ? s.h0 * (1 - k) * (1 - k) : s.h0 * Math.sin(k * Math.PI); }
  return 0;
};
const dirtjumps = {
  init(W) {
    const { w, rnd, N } = W, kind = rollW(rnd, LINE_W, bandOf(W.a));
    Object.assign(w, { kind, line: lineOf(kind, N), wx: 0, up: 0, vy: 0, air: false, spin: 0, spinR: 0, tableT: 0, tableD: 1, nohand: false, roll: 0, ped: 0, dust: [], N });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, base = 0.78 * N, G = 2.2 * N, bps = bpsOf(f), sx = 0.3 * N;
    if (w.N !== N) { w.N = N; w.line = lineOf(w.kind, N); w.wx = 0; w.up = 0; w.air = false; }
    const Ln = w.line, hAt = (x) => heightAt(Ln, x);
    if (f.section === 'change') { w.kind = rollW(rnd, LINE_W, bandOf(W.a)); w.line = lineOf(w.kind, N); }
    if (f.section === 'drop') { w.kind = 'bigset'; w.line = lineOf('bigset', N); w.nohand = true; }
    const vx = N * bps * (0.1 + 0.05 * f.rel.bassDrive);
    // the remaining time in the air, for the tricks: the landing height is where the parabola comes down
    const tRem = () => { let tt = Math.max(0, (w.vy + Math.sqrt(Math.max(0, w.vy * w.vy + 2 * G * w.up))) / G); for (let k = 0; k < 2; k++) { const hl = hAt(w.wx + vx * tt); tt = Math.max(0, (w.vy + Math.sqrt(Math.max(0, w.vy * w.vy + 2 * G * (w.up - hl)))) / G); } return tt; };
    for (const h of hits) {
      if (isLow(h) && !w.air) { w.vy = N * (0.35 + 0.35 * h.strength); w.air = true; }
      else if (h.kind === 'snare' && w.air && !w.spinR && w.tableT <= 0) { const tr = tRem(); if (tr > 0.75 && h.strength > 0.5) { w.spinR = TAU / tr; w.spin = 0; } else if (tr > 0.3) { w.tableT = tr; w.tableD = tr; } }
    }
    // the ride: on the ground the wheels follow the dirt; the lip throws him when the dirt falls away faster than a
    // fall would; in the air the parabola, the spin, the landing on the downslope with a puff
    const hPrev = w.up;
    w.wx += vx * dt;
    if (w.air) { // the exact parabola step, so the tricks timed on it finish at the landing whatever the frame rate
      w.up += w.vy * dt - 0.5 * G * dt * dt; w.vy -= G * dt; w.spin += w.spinR * dt; w.tableT -= dt;
      const hg = hAt(w.wx);
      if (w.up <= hg) { w.up = hg; w.vy = (hg - hAt(w.wx - vx * dt)) / dt; w.air = false; w.spin = 0; w.spinR = 0; w.tableT = 0; w.nohand = false; puff(w.dust, rnd, sx, base - hg, 8, 12 * u, LMID, 0.6, -1); }
    } else {
      const hg = hAt(w.wx), ball = hPrev + w.vy * dt - 0.5 * G * dt * dt;
      if (hg < ball - 0.2 * u) { w.air = true; w.up = ball; w.vy -= G * dt; } else { w.up = hg; w.vy = (hg - hPrev) / dt; }
    }
    w.roll += (vx * dt) / (3 * u); // the wheels (radius 3 u) turn with the distance
    if (!w.air) w.ped += (vx * dt) / (3 * u); // the cranks turn with them on the dirt and hold where they are in the air
    // the sky, the far hills slower, the dirt column by column with its crest
    r.disc(0.8 * N, 0.2 * N, 0.07 * N, HOT);
    for (let x = 0; x < N; x++) {
      const far = 0.5 * N + 0.06 * N * Math.sin((w.wx * 0.3 + x) * 0.025) + 0.03 * N * Math.sin((w.wx * 0.3 + x) * 0.071);
      r.rect(x, far, 1, base - far, DARK + DIM);
      const hh = hAt(w.wx - sx + x), y = base - hh;
      r.rect(x, y, 1, N - y, MID);
      r.rect(x, y, 1, px1(u), LMID);
      if (((w.wx - sx + x) / (4 * u) | 0) % 7 === 0) r.rect(x, y + 2 * u, 1, px1(u), MID + DIM);
    }
    r.rect(0, base + 0.08 * N, N, N - base - 0.08 * N, DARK);
    // the bike and the rider, turned by the spin about the bike's middle; a tabletop flattens it
    const cy = base - w.up - 3 * u, tab = w.tableT > 0 ? Math.sin(Math.PI * (1 - w.tableT / w.tableD)) * 0.9 : 0, sq = 1 - 0.55 * tab, ang = -w.spin;
    const ca = Math.cos(ang), sa = Math.sin(ang), P = (dx, dy) => [sx + dx * ca - dy * sq * sa, cy + dx * sa + dy * sq * ca];
    const crouch = w.air ? 0.4 : 0.15 + 0.35 * f.beat.pulse, wr = 3 * u;
    const rw = P(-4.5 * u, 0), fw = P(4.5 * u, 0), bb = P(-0.5 * u, -2 * u), seat = P(-2.5 * u, -6 * u), bars = P(3 * u, -7 * u);
    for (const wp of [rw, fw]) { r.ring(wp[0], wp[1], wr, px1(u), FIG, sq); for (let k = 0; k < 2; k++) { const a = w.roll + k * Math.PI / 2 + ang; r.line(wp[0] - Math.cos(a) * wr, wp[1] - Math.sin(a) * wr * sq, wp[0] + Math.cos(a) * wr, wp[1] + Math.sin(a) * wr * sq, LMID); } }
    r.line(rw[0], rw[1], bb[0], bb[1], HOT); r.line(bb[0], bb[1], seat[0], seat[1], HOT); r.line(seat[0], seat[1], bars[0], bars[1], HOT); r.line(bars[0], bars[1], fw[0], fw[1], HOT); r.line(rw[0], rw[1], seat[0], seat[1], HOT); r.line(bb[0], bb[1], bars[0], bars[1], HOT);
    const hip = P(-2 * u, -7 * u - 3 * u * (1 - crouch)), sh = P(0.5 * u, -12 * u + 3 * u * crouch), hd = P(1.5 * u, -15 * u + 3 * u * crouch);
    const ped = w.ped;
    for (const k of [0, Math.PI]) { const pd = P(-0.5 * u + Math.cos(ped + k) * 1.8 * u, -2 * u + Math.sin(ped + k) * 1.8 * u), kn = [(hip[0] + pd[0]) / 2 + 2 * u * ca, (hip[1] + pd[1]) / 2 - 1.5 * u]; r.stroke(hip[0], hip[1], kn[0], kn[1], px1(1.3 * u), FIG); r.stroke(kn[0], kn[1], pd[0], pd[1], px1(1.3 * u), FIG); }
    r.stroke(hip[0], hip[1], sh[0], sh[1], px1(2 * u), FIG);
    r.disc(hd[0], hd[1], 2.2 * u, FIG);
    const noh = w.nohand && w.air && w.tableT <= 0 && !w.spinR;
    for (const k of [-1, 1]) { const hand = noh ? P(k * 3 * u, -17 * u) : bars; r.stroke(sh[0], sh[1], hand[0], hand[1], px1(1.2 * u), FIG); }
    w.dust = drift(W, w.dust, 2 * u, Math.exp(-dt * 1.5));
    targets.push({ x: sx - 8 * u, y: cy - 18 * u, w: 16 * u, h: 22 * u });
  },
};

// ---------------------------------------------------------------------------------------------- forest show
// A black-metal show in a snowy forest: torches on stakes, silhouettes in spiked gear banging their heads on the
// beat, a banner of thorns (unreadable), fog low between the firs, snow coming down (a blizzard at the top of the
// arousal). The hats strobe the torches like a blast beat, a heavy snare flashes a corpse-paint mask out of the
// dark, a drop lights the bonfire and the sparks go up, slowing as they rise.
const FOREST_W = { clearing: [3, 2, 1], ritual: [2, 2, 2], blizzard: [1, 2, 3] };
function fir(r, x, by, h, c) {
  r.poly([[x, by - h], [x - h * 0.2, by - h * 0.55], [x + h * 0.2, by - h * 0.55]], c);
  r.poly([[x, by - h * 0.78], [x - h * 0.3, by - h * 0.28], [x + h * 0.3, by - h * 0.28]], c);
  r.poly([[x, by - h * 0.52], [x - h * 0.38, by - h * 0.04], [x + h * 0.38, by - h * 0.04]], c);
  r.rect(x - h * 0.04, by - h * 0.06, h * 0.08, h * 0.06, c);
}
const forestshow = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, FOREST_W, bandOf(W.a)), trees: Array.from({ length: 14 }, (_, i) => [(i + rnd()) / 14, rnd(), i % 2]), snow: [], strobe: 0, mask: 0, fire: 0, sparks: [], fog: 0,
      thorns: Array.from({ length: 13 }, () => rnd()), folk: Array.from({ length: 6 }, (_, i) => ({ x: 0.12 + i * 0.15 + rnd() * 0.04, h: 0.18 + rnd() * 0.04, ph: rnd() * TAU })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.8 * N, K = w.kind, buf = r.buf;
    if (f.section === 'change') w.kind = rollW(rnd, FOREST_W, bandOf(W.a));
    if (f.section === 'drop') { w.fire = 1; s.shake = Math.max(s.shake, 0.3); }
    for (const h of hits) {
      if (h.kind === 'hat' || h.kind === 'perc') w.strobe = 0.06;
      else if (h.kind === 'snare' && h.strength > 0.7) w.mask = 0.12;
      else if (isLow(h) && w.fire > 0) for (let k = 0; k < 8; k++) w.sparks.push({ x: 0.5 * N + (rnd() - 0.5) * 0.08 * N, y: g - 0.08 * N, vx: (rnd() - 0.5) * 0.2 * N, vy: -(0.3 + rnd() * 0.3) * N, life: 1.2 + rnd() });
    }
    w.strobe -= dt; w.mask -= dt; w.fire = Math.max(0, w.fire - dt / 14); w.fog += dt * 6 * u; // the fog drifts 6 units/s at any N
    const strobe = w.strobe > 0, nT = K === 'clearing' ? 10 : 14;
    // the firs in two rows, the far ones dimmer, the fog in a band between them (dithered, drifting), the snow ground
    for (let i = 0; i < nT; i++) { const [tx, ts, far] = w.trees[i]; if (far) fir(r, tx * N, g - 0.08 * N, (0.3 + 0.2 * ts) * N, DARK + DIM); }
    for (let y = Math.round(g - 0.14 * N); y < g; y++) { const k = (y - (g - 0.14 * N)) / (0.14 * N), ws = 0.07 / u, wf = w.fog * 0.03 / u; for (let x = 0; x < N; x++) if (hash(x + Math.floor(w.fog), y) < 0.35 * k + 0.2 * Math.sin(x * ws + wf)) buf[y * N + x] = LMID + DIM; }
    for (let i = 0; i < nT; i++) { const [tx, ts, far] = w.trees[i]; if (!far) fir(r, tx * N, g - 0.01 * N, (0.38 + 0.25 * ts) * N, DARK); }
    r.rect(0, g, N, N - g, LMID);
    r.rect(0, g, N, px1(u), BRIGHT);
    // the banner of thorns between two poles: a jagged shape, mirrored top and bottom, nothing to read in it
    const bx = 0.25 * N, by = 0.2 * N, bw = 0.5 * N, bh = 0.1 * N;
    for (const px of [bx, bx + bw]) r.rect(px - u, by - 0.04 * N, 2 * u, g - by + 0.04 * N, DARK);
    r.rect(bx, by, bw, bh, DARK);
    const th = [], tb = [];
    for (let i = 0; i < 13; i++) { const x = bx + (i / 12) * bw, k = w.thorns[i] * 0.4 + (i % 2 ? 0.05 : 0.3); th.push([x, by + bh * 0.5 - bh * k]); tb.push([x, by + bh * 0.5 + bh * k]); }
    r.poly([...th, ...tb.reverse()], LMID);
    // the torches: a stake, the flame, its pool on the snow; the strobe on the hats
    const nTor = K === 'ritual' ? 6 : 4;
    for (let i = 0; i < nTor; i++) {
      const x = (0.08 + (i + 0.5) * (0.84 / nTor)) * N, top = g - 0.16 * N, fl = hash(i, Math.floor(t * 14)) * 2 * u;
      r.ring(x, g, (strobe ? 0.11 : 0.07) * N, (strobe ? 0.22 : 0.14) * N, BRIGHT, 0.3);
      r.rect(x - u, top, 2 * u, g - top, DARK);
      r.poly([[x - 2.5 * u, top], [x + 2.5 * u, top], [x + u, top - 5 * u - fl], [x, top - 8 * u - fl * 2], [x - u, top - 5 * u - fl]], strobe ? BRIGHT : HOT);
      r.rect(x - u * 0.5, top - 3 * u, px1(u), 3 * u, BRIGHT);
    }
    // the bonfire: flames stacked and flickering, the sparks up and slowing, the glow on the snow
    if (w.fire > 0) {
      const fx = 0.5 * N, fh = (0.1 + 0.16 * w.fire) * N, tt = Math.floor(t * 12);
      r.ring(fx, g, 0.18 * N * w.fire, 0.36 * N * w.fire, BRIGHT, 0.25);
      for (let k = 0; k < 3; k++) { const dx = (k - 1) * 0.04 * N, hh = fh * (0.6 + 0.4 * hash(k, tt)); r.poly([[fx + dx - 0.05 * N, g], [fx + dx + 0.05 * N, g], [fx + dx + 0.015 * N, g - hh * 0.6], [fx + dx + (hash(k + 3, tt) - 0.5) * 0.03 * N, g - hh], [fx + dx - 0.015 * N, g - hh * 0.6]], k === 1 ? BRIGHT : HOT); }
      for (const k of [-1, 1]) r.stroke(fx + k * 0.07 * N, g - u, fx - k * 0.02 * N, g - 0.035 * N, px1(2 * u), DARK);
      if (w.sparks.length < 200) for (let k = 0; k < 2; k++) w.sparks.push({ x: fx + (rnd() - 0.5) * 0.06 * N, y: g - fh * 0.7, vx: (rnd() - 0.5) * 0.1 * N, vy: -(0.15 + rnd() * 0.25) * N, life: 1.5 + rnd() });
    }
    w.sparks = w.sparks.filter((p) => { p.vy = follow(p.vy, -0.03 * N, dt, 0.8); p.x += p.vx * dt + Math.sin(t * 4 + p.y * 0.1) * 6 * u * dt; p.y += p.vy * dt; p.life -= dt; r.rect(p.x, p.y, px1(u), px1(u), p.life > 0.8 ? BRIGHT : HOT); return p.life > 0 && p.y > 0; });
    // the silhouettes: spikes on the shoulders and wrists, long hair, the head going down on the beat
    for (let i = 0; i < w.folk.length; i++) {
      const F = w.folk[i], x = F.x * N, h = F.h * N, bang = ease(1 - f.beat.phase) * (i % 2 ? 1 : 0.6), dir = x < 0.5 * N ? 1 : -1;
      r.rect(x - h * 0.14, g - h * 0.45, h * 0.1, h * 0.45, FIG); r.rect(x + h * 0.04, g - h * 0.45, h * 0.1, h * 0.45, FIG);
      r.rect(x - h * 0.17, g - h * 0.78, h * 0.34, h * 0.35, FIG);
      for (const k of [-1, 1]) for (let q = 0; q < 3; q++) r.poly([[x + k * h * (0.08 + q * 0.06), g - h * 0.78], [x + k * h * (0.1 + q * 0.06), g - h * 0.92], [x + k * h * (0.12 + q * 0.06), g - h * 0.78]], FIG);
      const hx = x + dir * bang * h * 0.14, hy = g - h * 0.88 + bang * h * 0.14;
      r.disc(hx, hy, h * 0.1, FIG);
      for (let q = -1; q <= 1; q++) r.stroke(hx, hy, hx - dir * h * (0.1 + 0.25 * bang) + q * h * 0.05, hy + h * (0.25 - 0.3 * bang) + Math.abs(q) * h * 0.03, px1(1.2 * u), FIG); // the hair flying with the bang
      const ax = x + dir * h * 0.3, ay = g - h * 0.65 + bang * h * 0.15;
      r.stroke(x + dir * h * 0.15, g - h * 0.72, ax, ay, px1(1.2 * u), FIG);
      for (const q of [-1, 0, 1]) r.rect(ax + q * 1.5 * u - u * 0.5, ay - 2.5 * u, px1(u), 2 * u, FIG);
    }
    // the mask: a white face out of the dark, black round the eyes and the mouth, running down
    if (w.mask > 0) {
      const mx = 0.5 * N, my = 0.4 * N, R = 0.1 * N;
      r.ring(mx, my, R * 0.5, R, WHITE, 1.3);
      for (const k of [-1, 1]) { r.ring(mx + k * R * 0.42, my - R * 0.25, R * 0.14, R * 0.28, BLACK, 0.8); r.rect(mx + k * R * 0.42 - u, my - R * 0.1, 2 * u, R * 0.5, BLACK); }
      r.poly([[mx - R * 0.35, my + R * 0.65], [mx + R * 0.35, my + R * 0.65], [mx + R * 0.15, my + R * 0.95], [mx - R * 0.15, my + R * 0.95]], BLACK);
      targets.push({ x: mx - R, y: my - R * 1.3, w: 2 * R, h: 2.6 * R });
    }
    snowfall(W, w.snow, Math.round((K === 'blizzard' ? 150 : 60) * (0.5 + f.level) * u), K === 'blizzard' ? 0.5 : 0.18, BRIGHT);
    targets.push({ x: bx, y: by, w: bw, h: bh });
  },
};

// ---------------------------------------------------------------------------------------------- tattoo studio
// A tattoo studio: flash sheets on the wall with the old motifs as plain shapes (a swallow, a dagger, a rose, an
// anchor, an eye, a panther) that swap on a section, an arm on the table under the lamp, the machine buzzing on
// the beat as its line grows along the arm with the mids; the ink is wiped on the snare, the kick presses the
// needle in. A drop flashes the finished piece in the accent. The motif on the arm follows the arousal.
const MOTIF_W = { dagger: [2, 2, 3], rose: [3, 2, 1], swallow: [3, 2, 1], anchor: [2, 2, 1], eye: [1, 2, 2], panther: [1, 2, 3] };
const circ = (cx, cy, rr, n = 10, from = 0, turns = 1) => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(from + (i / n) * TAU * turns) * rr, cy + Math.sin(from + (i / n) * TAU * turns) * rr]);
const MOTIFS = {
  dagger: [[[0.47, 0.05], [0.47, 0.28], [0.53, 0.28], [0.53, 0.05], [0.47, 0.05]], [[0.3, 0.3], [0.7, 0.3], [0.7, 0.35], [0.3, 0.35], [0.3, 0.3]], [[0.4, 0.35], [0.5, 0.95], [0.6, 0.35]], [[0.5, 0.42], [0.5, 0.8]]],
  rose: [Array.from({ length: 28 }, (_, i) => [0.5 + Math.cos(i * 0.5) * (0.04 + i * 0.011), 0.45 + Math.sin(i * 0.5) * (0.04 + i * 0.011) * 0.8]), [[0.35, 0.75], [0.15, 0.95], [0.3, 0.9]], [[0.65, 0.75], [0.85, 0.95], [0.7, 0.9]], [[0.5, 0.78], [0.5, 0.98]]],
  swallow: [[[0.5, 0.5], [0.22, 0.2], [0.05, 0.42], [0.35, 0.56]], [[0.5, 0.5], [0.78, 0.2], [0.95, 0.42], [0.65, 0.56]], [[0.42, 0.56], [0.36, 0.92]], [[0.58, 0.56], [0.64, 0.92]], circ(0.5, 0.42, 0.08, 8)],
  anchor: [circ(0.5, 0.12, 0.08, 8), [[0.5, 0.2], [0.5, 0.9]], [[0.3, 0.32], [0.7, 0.32]], circ(0.5, 0.55, 0.36, 10, 0.25 * Math.PI, 0.5), [[0.16, 0.73], [0.1, 0.6]], [[0.84, 0.73], [0.9, 0.6]]],
  eye: [[[0.05, 0.5], [0.3, 0.25], [0.7, 0.25], [0.95, 0.5], [0.7, 0.75], [0.3, 0.75], [0.05, 0.5]], circ(0.5, 0.5, 0.18, 10), circ(0.5, 0.5, 0.07, 6), [[0.5, 0.05], [0.5, 0.15]], [[0.25, 0.1], [0.3, 0.2]], [[0.75, 0.1], [0.7, 0.2]]],
  panther: [[[0.1, 0.6], [0.2, 0.35], [0.35, 0.25], [0.45, 0.08], [0.55, 0.25], [0.8, 0.3], [0.95, 0.5], [0.8, 0.75], [0.55, 0.85], [0.3, 0.8], [0.1, 0.6]], [[0.55, 0.45], [0.66, 0.42]], [[0.74, 0.6], [0.9, 0.6], [0.85, 0.7]], [[0.8, 0.62], [0.8, 0.72]], [[0.36, 0.5], [0.42, 0.56]]],
};
const motifLen = (st) => st.reduce((acc, s) => { for (let i = 1; i < s.length; i++) acc += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); return acc; }, 0);
const tattooflash = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), keys = Object.keys(MOTIFS);
    Object.assign(w, { motif: rollW(rnd, MOTIF_W, band), prog: 0, hold: 0, wipe: -1, press: 0, flash: 0, swap: 0, lampF: 0, sheets: Array.from({ length: 5 }, () => pick(rnd, keys)) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), keys = Object.keys(MOTIFS);
    const box = { x: 0.3 * N, y: 0.6 * N, w: 0.17 * N, h: 0.1 * N }, strokes = MOTIFS[w.motif], total = motifLen(strokes);
    if (f.section === 'change') { w.sheets = w.sheets.map(() => pick(rnd, keys)); w.swap = 0.3; w.motif = rollW(rnd, MOTIF_W, band); w.prog = 0; w.hold = 0; }
    if (f.section === 'drop') { w.flash = 0.7; w.prog = total; w.hold = 0.01; }
    for (const h of hits) {
      if (h.kind === 'snare') w.wipe = 0;
      else if (isLow(h)) w.press = 0.12;
      else if (h.kind === 'hat' || h.kind === 'perc') w.lampF = 0.05;
    }
    w.press -= dt; w.flash -= dt; w.swap -= dt; w.lampF -= dt;
    const buzz = f.beat.pulse > 0.3;
    if (w.hold > 0) { w.hold += dt; if (w.hold > 2.5) { w.hold = 0; w.prog = 0; w.motif = w.flash > 0 ? w.motif : rollW(rnd, MOTIF_W, band); w.flash = 0; } }
    else { w.prog += dt * total * (0.02 + 0.06 * f.rel.midDrive) * (buzz ? 1 : 0.4) + (f.beat.on ? total * 0.01 : 0); if (w.prog >= total) { w.prog = total; w.hold = 0.01; } }
    // the wall and the flash sheets, each with its motif in plain lines and a touch of the accent
    r.rect(0, 0, N, 0.5 * N, MID + DIM);
    for (let i = 0; i < 5; i++) {
      const sx = (0.04 + i * 0.19) * N, sy = 0.07 * N, sw = 0.16 * N, sh = 0.2 * N, mb = { x: sx + 0.02 * N, y: sy + 0.02 * N, w: sw - 0.04 * N, h: sh - 0.04 * N };
      r.rect(sx, sy, sw, sh, w.swap > 0 && hash(i, Math.floor(t * 20)) < 0.5 ? WHITE : BRIGHT);
      r.rect(sx - u, sy - u, sw + 2 * u, px1(u), DARK); r.rect(sx + sw * 0.4, sy - 2 * u, sw * 0.2, 3 * u, LMID);
      for (const st of MOTIFS[w.sheets[i]]) for (let k = 1; k < st.length; k++) r.line(mb.x + st[k - 1][0] * mb.w, mb.y + st[k - 1][1] * mb.h, mb.x + st[k][0] * mb.w, mb.y + st[k][1] * mb.h, FIG);
      r.disc(mb.x + mb.w * (0.2 + 0.6 * hash(i, 5)), mb.y + mb.h * 0.5, 1.5 * u, HOT);
    }
    // the table, the arm on it, the lamp over it
    r.rect(0, 0.5 * N, N, N * 0.5, DARK);
    r.rect(0.04 * N, 0.52 * N, 0.92 * N, 0.3 * N, MID);
    r.rect(0.04 * N, 0.52 * N, 0.92 * N, 2 * u, LMID);
    const lampOn = w.lampF <= 0;
    r.poly([[0.74 * N, 0.3 * N], [0.8 * N, 0.3 * N], [0.62 * N, 0.75 * N], [0.12 * N, 0.75 * N]], lampOn ? LMID : MID);
    r.rect(0.1 * N, 0.56 * N, 0.6 * N, 0.14 * N, LMID);
    r.disc(0.1 * N, 0.63 * N, 0.07 * N, LMID);
    r.disc(0.72 * N, 0.63 * N, 0.06 * N, LMID);
    for (let k = 0; k < 4; k++) r.stroke(0.75 * N, 0.6 * N + k * 0.02 * N, 0.82 * N, 0.57 * N + k * 0.03 * N, px1(1.6 * u), LMID);
    r.stroke(0.86 * N, 0, 0.77 * N, 0.28 * N, px1(1.5 * u), DARK);
    r.poly([[0.7 * N, 0.26 * N], [0.84 * N, 0.26 * N], [0.8 * N, 0.31 * N], [0.74 * N, 0.31 * N]], DARK);
    r.rect(0.74 * N, 0.3 * N, 0.06 * N, px1(1.5 * u), lampOn ? BRIGHT : LMID);
    // the line on the arm as far as it has got; the finished piece in the accent on the drop
    const drawPath = (upto, col, wd) => {
      let acc = 0, pt = null;
      for (const st of strokes) for (let i = 1; i < st.length; i++) {
        const [ax, ay] = st[i - 1], [bx, by] = st[i], Ls = Math.hypot(bx - ax, by - ay);
        if (acc >= upto) return pt || [box.x + ax * box.w, box.y + ay * box.h];
        const k = Math.min(1, (upto - acc) / Ls), ex = box.x + lerp(ax, bx, k) * box.w, ey = box.y + lerp(ay, by, k) * box.h;
        r.stroke(box.x + ax * box.w, box.y + ay * box.h, ex, ey, wd, col);
        pt = [ex, ey]; acc += Ls;
      }
      return pt || [box.x + box.w / 2, box.y + box.h / 2];
    };
    const [nx, ny] = drawPath(w.prog, w.flash > 0 ? HOT : FIG, px1((1.2 + (w.press > 0 ? 0.8 : 0)) * u));
    if (w.flash > 0 && Math.floor(t * 12) % 2) drawPath(total, BRIGHT, px1(2.5 * u));
    // the wipe: a towel across the arm from the right, a smear behind it
    if (w.wipe >= 0) {
      w.wipe += dt / 0.35;
      const wx = box.x + box.w * (1.1 - Math.min(1, w.wipe) * 1.2);
      r.rect(wx, box.y - 2 * u, 0.06 * N, box.h + 4 * u, LMID + DIM);
      for (let k = 0; k < 6; k++) r.rect(wx + 0.06 * N + hash(k, Math.floor(t * 30)) * 4 * u, box.y + hash(k + 9, Math.floor(w.wipe * 10)) * box.h, px1(u), px1(u), MID);
      if (w.wipe >= 1.2) w.wipe = -1;
    }
    // the machine on the point of the line, buzzing on the beat; the hand round it, the arm off to the right
    const jit = buzz ? (hash(Math.floor(t * 60), 1) - 0.5) * 1.5 * u : 0, mx = nx + 2 * u, my = ny - 2 * u + jit;
    if (w.hold <= 0 || w.flash > 0) {
      r.line(mx, my, nx, ny, LMID);
      r.rect(mx - 1.2 * u, my - 9 * u, 2.4 * u, 8 * u, DARK);
      r.ring(mx + 2 * u, my - 8 * u, 1.8 * u, px1(u), MID);
      if (buzz) r.rect(mx + 2 * u - u * 0.5, my - 8 * u - u * 0.5, px1(u), px1(u), COOL);
      r.disc(mx + 1.5 * u, my - 4 * u, 3 * u, FIG);
      r.stroke(mx + 3 * u, my - 4 * u, N, 0.5 * N, px1(3 * u), FIG);
      if (w.press > 0) r.rect(nx - u * 0.5, ny - u * 0.5, px1(u), px1(u), HOT);
    } else r.stroke(0.86 * N, 0.5 * N, N, 0.45 * N, px1(3 * u), FIG);
    for (let k = 0; k < 3; k++) r.ring((0.8 + k * 0.05) * N, 0.78 * N, 1.5 * u, px1(u), k ? FIG : HOT);
    targets.push({ x: box.x - 2 * u, y: box.y - 2 * u, w: box.w + 4 * u, h: box.h + 4 * u });
  },
};

// ---------------------------------------------------------------------------------------------- night bus
// The top deck of the night bus, looking down the aisle: rows of seats in perspective with sleepers (heads on the
// glass) and nodders (heads down on the beat), the city sliding past the windows in parallax (lit windows and
// signs, seen only through the glass), the rain streaking the panes with the speed, condensation running. The
// route follows the arousal: suburbs, the centre, the motorway. A section is a stop: the bus slows, the doors
// light up, someone walks down the aisle and off. A drop brakes hard: a damped lurch forward and back, the bags
// sliding down the floor.
const ROUTE_W = { suburbs: [3, 2, 1], centre: [2, 2, 2], motorway: [1, 2, 3] };
function newLight(rnd, kind, i, spread) {
  const side = rnd() < 0.5 ? 1 : -1, z = spread ? 1 + rnd() * 38 : 34 + rnd() * 8;
  if (kind === 'motorway') return rnd() < 0.7 ? { side, D: 0.9, Y: -1.7, S: 0.14, c: BRIGHT, sign: false, z: spread ? (i % 10) * 4 + 1 : 38 + rnd() * 2 } : { side, D: 5 + rnd() * 4, Y: -(0.2 + rnd()), S: 0.2, c: LMID, sign: false, z };
  if (kind === 'centre') { const sign = rnd() < 0.5; return { side, D: 0.5 + rnd() * 2.5, Y: -(rnd() * 1.5), S: sign ? 0.35 + rnd() * 0.4 : 0.2 + rnd() * 0.2, c: sign ? pick(rnd, [HOT, COOL, BRIGHT]) : LMID, sign, z }; }
  return { side, D: 2 + rnd() * 4, Y: -(0.1 + rnd() * 0.9), S: 0.15 + rnd() * 0.2, c: rnd() < 0.15 ? HOT : LMID, sign: false, z };
}
const nightbus = {
  init(W) {
    const { w, rnd } = W, kind = rollW(rnd, ROUTE_W, bandOf(W.a));
    Object.assign(w, { kind, lights: Array.from({ length: 40 }, (_, i) => newLight(rnd, kind, i, true)), streaks: [], conds: [], seats: Array.from({ length: 16 }, () => rnd()), speed: 1, odo: 0, lurchT: 9, brake: 0, stop: null, dimT: 0, walkPh: 0,
      bags: [{ z: 2.6, v: 0, side: 1 }, { z: 4.9, v: 0, side: -1 }] });
    for (let i = 0; i < 44; i++) w.streaks.push({ side: i % 2 ? 1 : -1, z: 1 + rnd() * 9, Y: -0.55 + rnd() * 0.5, L: 0.08 + rnd() * 0.15 });
    for (let i = 0; i < 14; i++) w.conds.push({ side: i % 2 ? 1 : -1, z: 1.2 + rnd() * 7, Y: -0.5 + rnd() * 0.4, v: 0.01 + rnd() * 0.03 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, cx = 0.5 * N, hor = 0.42 * N, F = 0.55 * N, Wb = 1.1, Yt = -0.55, Yb = -0.02, Yc = -0.65, Yf = 0.9, zN = 0.9, zF = 14, K = w.kind;
    const SX = (X, z) => cx + (X * F) / z, SY = (Y, z) => hor + (Y * F) / z;
    if (f.section === 'change') { w.kind = rollW(rnd, ROUTE_W, bandOf(W.a)); if (!w.stop) w.stop = { t: 0, seat: -1 }; }
    if (f.section === 'drop') { w.lurchT = 0; w.brake = 1.4; for (const b of w.bags) b.v += 1.6; }
    for (const h of hits) {
      if (isLow(h) && h.strength > 0.8) w.dimT = 0.1;
      else if (h.kind === 'snare') for (let k = 0; k < 4; k++) { const st = w.streaks[Math.floor(rnd() * w.streaks.length)]; st.Y = Yt; st.z = 1 + rnd() * 9; }
    }
    // the speed: the route's cruise, the stop, the brake; the lurch a damped swing after the brake
    const cruise = (K === 'motorway' ? 9 : K === 'centre' ? 4 : 5.5) * (0.7 + 0.3 * f.level);
    let want = cruise;
    if (w.stop) { w.stop.t += dt; if (w.stop.t < 4.4) want = 0; if (w.stop.t > 6.5) w.stop = null; }
    if (w.brake > 0) { w.brake -= dt; want = 0.3; }
    w.speed = follow(w.speed, want, dt, w.brake > 0 ? 0.25 : 1.2);
    w.lurchT += dt; w.dimT -= dt; w.odo += w.speed * dt; // the distance gone, so the road moves with the speed, not with the clock
    const lurch = Math.exp(-2.2 * w.lurchT) * Math.sin(7 * w.lurchT);
    // the walls with the windows cut out, the outside only where a ray goes through the glass
    for (const side of [-1, 1]) {
      r.poly([[SX(side * Wb, zN), SY(Yc, zN)], [SX(side * Wb, zF), SY(Yc, zF)], [SX(side * Wb, zF), SY(Yf, zF)], [SX(side * Wb, zN), SY(Yf, zN)]], DARK);
      r.poly([[SX(side * Wb, zN), SY(Yt, zN)], [SX(side * Wb, zF), SY(Yt, zF)], [SX(side * Wb, zF), SY(Yb, zF)], [SX(side * Wb, zN), SY(Yb, zN)]], BG);
    }
    for (const L of w.lights) {
      L.z -= w.speed * dt;
      if (L.z < 0.6) Object.assign(L, newLight(rnd, K, 0, false));
      const sx = SX(L.side * (Wb + L.D), L.z), off = L.side * (sx - cx);
      if (off <= 0) continue;
      const zw = (Wb * F) / off;
      if (zw < zN || zw > zF) continue;
      const y0 = SY(Yt, zw), y1 = SY(Yb, zw), sz = (L.S * F) / L.z, sy = SY(L.Y, L.z), ya = Math.max(y0, sy - sz / 2), yb = Math.min(y1, sy + sz / 2);
      if (yb > ya) r.rect(sx - (L.sign ? sz : sz / 2), ya, L.sign ? 2 * sz : sz, yb - ya, L.c);
    }
    // the rain on the glass: streaks slanting back with the speed; the condensation running straight down
    const nS = Math.min(w.streaks.length, Math.round(16 + 28 * f.level)), slant = 0.25 + 0.2 * w.speed;
    for (let i = 0; i < nS; i++) {
      const st = w.streaks[i];
      st.Y += 0.22 * dt; st.z -= slant * dt;
      if (st.Y > Yb || st.z < zN) { st.Y = Yt; st.z = 1.5 + rnd() * 9; }
      const L2 = Math.min(st.L, Yb - st.Y);
      r.line(SX(st.side * Wb, st.z), SY(st.Y, st.z), SX(st.side * Wb, st.z - L2 * slant * 1.4), SY(st.Y + L2, st.z - L2 * slant * 1.4), LMID + DIM);
    }
    for (const c of w.conds) {
      c.Y += c.v * dt * (1 + f.rel.trebDrive);
      if (c.Y > Yb) { c.Y = Yt; c.z = 1.2 + rnd() * 7; }
      r.line(SX(c.side * Wb, c.z), SY(Math.max(Yt, c.Y - 0.12), c.z), SX(c.side * Wb, c.z), SY(c.Y, c.z), LMID + DIM);
      r.rect(SX(c.side * Wb, c.z), SY(c.Y, c.z), px1(u), px1(u), LMID);
    }
    // the ceiling, the floor, the front end: the window over the road with the lamps receding, the stairwell at the left
    r.poly([[SX(-Wb, zN), SY(Yc, zN)], [SX(Wb, zN), SY(Yc, zN)], [SX(Wb, zF), SY(Yc, zF)], [SX(-Wb, zF), SY(Yc, zF)]], DARK);
    r.poly([[SX(-Wb, zN), SY(Yf, zN)], [SX(Wb, zN), SY(Yf, zN)], [SX(Wb, zF), SY(Yf, zF)], [SX(-Wb, zF), SY(Yf, zF)]], DARK + DIM);
    r.rect(SX(-Wb, zF), SY(Yc, zF), SX(Wb, zF) - SX(-Wb, zF), SY(Yf, zF) - SY(Yc, zF), DARK);
    r.rect(SX(-Wb * 0.9, zF), SY(Yt, zF), SX(Wb * 0.9, zF) - SX(-Wb * 0.9, zF), SY(0.1, zF) - SY(Yt, zF), BG);
    for (let k = 0; k < 5; k++) { const z = zF + 3 + k * 5 - (w.odo % 5); for (const sd of [-1, 1]) r.rect(SX(sd * 1.6, z), SY(-1.4, z), px1(u), px1(u), LMID); }
    const doors = w.stop && w.stop.t > 1.6 && w.stop.t < 4.4;
    r.rect(SX(-Wb * 0.85, zF), SY(0.1, zF), SX(-Wb * 0.3, zF) - SX(-Wb * 0.85, zF), SY(Yf, zF) - SY(0.1, zF), doors ? BRIGHT : BLACK);
    // the seats, far to near, with their passengers: a sleeper against the glass, a nodder on the beat; the lurch
    // carries every head toward the front; the straps hang from the rail and lag behind
    for (let i = 7; i >= 0; i--) {
      const z = 1.3 + i * 1.15, far = i >= 4;
      for (const side of [-1, 1]) {
        const x0 = SX(side * 0.3, z), x1 = SX(side * 0.98, z), y0 = SY(-0.05, z), y1 = SY(Yf, z);
        r.rect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0, far ? MID + DIM : MID);
        r.rect(Math.min(x0, x1), y0, Math.abs(x1 - x0), px1(u), far ? LMID + DIM : LMID);
        const sv = w.seats[i * 2 + (side > 0 ? 1 : 0)];
        if (sv > 0.55) continue;
        const sleeper = sv < 0.25, R = (0.13 * F) / z;
        let hx = SX(side * (0.62 + (sleeper ? 0.12 : 0)), z), hy = SY(-0.28 + (sleeper ? 0.07 + 0.01 * Math.sin(t * 1.3 + i) : 0.08 * f.beat.pulse * (i % 2 ? 1 : 0.5)), z);
        hx += (cx - hx) * lurch * 0.3; hy += (hor - hy) * lurch * 0.3;
        r.rect(SX(side * 0.4, z) < SX(side * 0.84, z) ? SX(side * 0.4, z) : SX(side * 0.84, z), SY(-0.15, z) + (hor - SY(-0.15, z)) * lurch * 0.3, Math.abs(SX(side * 0.84, z) - SX(side * 0.4, z)), SY(-0.05, z) - SY(-0.15, z), FIG);
        r.disc(hx, hy, R, FIG);
      }
      if (i % 2 === 0) for (const side of [-1, 1]) { const zs = z + 0.5 * lurch, x = SX(side * 0.22, z); r.line(x, SY(-0.45, z), SX(side * 0.22, zs), SY(-0.3, zs), LMID + DIM); r.ring(SX(side * 0.22, zs), SY(-0.28, zs), px1(1.2 * u), px1(u), LMID); }
    }
    // the bags on the floor, sliding forward on the brake and stopping under the friction (a steady deceleration, so they do stop)
    for (const b of w.bags) {
      b.z += b.v * dt; b.v = Math.max(0, b.v - 2 * dt);
      if (b.z > zF - 1.5) { b.z = zF - 1.5; b.v = 0; }
      const z = b.z, x = SX(b.side * 0.5, z), y = SY(0.82, z), sz = (0.22 * F) / z;
      r.rect(x - sz / 2, y - sz * 0.8, sz, sz * 0.8, DARK);
      r.rect(x - sz / 2, y - sz * 0.8, sz, px1(u), LMID + DIM);
    }
    // the stop: someone gets up from a near seat and walks down the aisle to the stairs, smaller as he goes
    if (w.stop && w.stop.t > 1.8) {
      const S = w.stop;
      if (S.seat < 0) { S.seat = [0, 1, 2, 3, 4, 5].find((k) => w.seats[k] <= 0.55) ?? 0; w.seats[S.seat] = 1; S.z = 1.3 + Math.floor(S.seat / 2) * 1.15; }
      if (S.t < 4.4) { S.z = Math.min(zF - 0.6, S.z + dt * 3); w.walkPh += dt * 7; const hgt = (1.05 * F) / S.z; walker(r, SX(0, S.z), SY(Yf, S.z), hgt, FIG, w.walkPh, 1, { cap: true }); targets.push({ x: SX(0, S.z) - hgt * 0.3, y: SY(Yf, S.z) - hgt, w: hgt * 0.6, h: hgt }); }
    }
    r.rect(cx - u * 0.75, SY(Yc, zN), 1.5 * u, SY(Yc, zF) - SY(Yc, zN), w.dimT > 0 ? MID + DIM : LMID); // the strip light down the ceiling
    targets.push({ x: SX(-Wb * 0.9, zF), y: SY(Yt, zF), w: SX(Wb * 0.9, zF) - SX(-Wb * 0.9, zF), h: SY(0.1, zF) - SY(Yt, zF) });
  },
};

// ---------------------------------------------------------------------------------------------- soundclash
// Two rigs face each other across a hall; one plays per four bars, and the crowd flows to it, each at their own
// lag. The playing rig's cones pump with the bass and its lamp flashes on the beat; lighters and phones go up on
// the snare; a drop blares the horns, a burst of light across the hall; a section brings the referee's hand up
// between them. The size and the lag of the crowd follow the arousal.
const CLASH_W = { bass: [3, 2, 1], dub: [2, 2, 2], riot: [1, 2, 3] };
const soundclash = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, CLASH_W, bandOf(W.a)), crowd: Array.from({ length: 90 }, () => ({ x: rnd(), d: rnd(), tau: 0.5 + rnd() * 2.2, lit: 0, ph: rnd() * TAU, vy: 0, h: 0, phone: rnd() < 0.5 })), side: -1, flash: 0, horn: [0, 0], ref: 0 });
    w.order = w.crowd.map((c, i) => i).sort((i, j) => w.crowd[i].d - w.crowd[j].d);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, K = w.kind, floorY = 0.56 * N;
    const n = K === 'riot' ? 90 : K === 'dub' ? 70 : 50, lag = K === 'riot' ? 0.5 : K === 'dub' ? 0.8 : 1.1;
    if (f.section === 'change') { w.kind = rollW(rnd, CLASH_W, bandOf(W.a)); w.ref = 2.5; }
    const side = beatLocked(f) ? Math.floor(f.beat.count / 16) % 2 : Math.floor(t / 8) % 2;
    if (side !== w.side) { w.side = side; w.flash = 0.5; }
    if (f.section === 'drop') { w.horn[side] = 0.6; if (K === 'riot') w.horn[1 - side] = 0.6; s.shake = Math.max(s.shake, 0.4); for (const c of w.crowd) if (!c.h) c.vy = -N * (0.2 + 0.2 * rnd()); }
    for (const h of hits) if (h.kind === 'snare') for (let k = 0; k < 10; k++) pick(rnd, w.crowd).lit = 0.5;
    w.flash -= dt; w.ref -= dt; w.horn[0] -= dt; w.horn[1] -= dt;
    // the hall: the back wall, the lamps along the ceiling, the floor
    r.rect(0, 0, N, floorY, DARK);
    for (let k = 0; k < 5; k++) { const x = (0.14 + k * 0.18) * N; r.rect(x - u * 0.5, 0, px1(u), 0.06 * N, MID + DIM); r.disc(x, 0.07 * N, 2 * u, f.level > 0.5 && f.beat.pulse > 0.5 ? BRIGHT : LMID); }
    r.rect(0, floorY, N, N - floorY, DARK + DIM);
    r.rect(0, floorY, N, px1(u), MID);
    // the rigs: a horn on top, two mids, a bass bin; the cones pump only on the side that plays
    for (const sideK of [0, 1]) {
      const x0 = sideK ? 0.82 * N : 0.02 * N, bw = 0.16 * N, playing = sideK === side, pump = playing ? f.rel.bassDrive : 0;
      for (let k = 0; k < 3; k++) {
        const y = (0.26 + k * 0.18) * N, bh = 0.17 * N;
        r.rect(x0, y, bw, bh, k === 1 ? DARK + DIM : DARK);
        r.frame(Math.round(x0), Math.round(y), Math.round(bw), Math.round(bh), MID + DIM);
        if (k === 2) cone(r, x0 + bw * 0.5, y + bh * 0.5, bh * 0.36, pump, u);
        else if (k === 1) for (const q of [0.3, 0.7]) cone(r, x0 + bw * q, y + bh * 0.5, bh * 0.2, pump, u);
        else { r.poly([[x0 + bw * 0.5, y + bh * 0.5], [x0 + bw * 0.1, y + bh * 0.15], [x0 + bw * 0.9, y + bh * 0.15]], MID); r.poly([[x0 + bw * 0.5, y + bh * 0.5], [x0 + bw * 0.1, y + bh * 0.85], [x0 + bw * 0.9, y + bh * 0.85]], MID); }
      }
      const lamp = playing && (w.flash > 0 ? Math.floor(t * 16) % 2 === 0 : f.beat.pulse > 0.6);
      r.rect(x0 + bw * 0.3, 0.22 * N, bw * 0.4, 0.03 * N, lamp ? BRIGHT : MID + DIM);
      if (lamp) r.poly([[x0 + bw * 0.5, 0.25 * N], [x0 + bw * 0.5 + (sideK ? -0.3 : 0.3) * N, N], [x0 + bw * 0.5 + (sideK ? 0.08 : -0.08) * N, N]], LMID + DIM);
      if (w.horn[sideK] > 0) { const hx = x0 + bw * 0.5, hy = 0.34 * N, dir = sideK ? -1 : 1, k = 1 - w.horn[sideK] / 0.6; r.poly([[hx, hy], [hx + dir * N * (0.3 + 0.6 * k), hy - 0.25 * N], [hx + dir * N * (0.3 + 0.6 * k), hy + 0.3 * N]], Math.floor(t * 20) % 2 ? BRIGHT : HOT); }
      targets.push({ x: x0, y: 0.22 * N, w: bw, h: 0.56 * N });
    }
    // the referee on the stand between them, the hand up on a section
    r.rect(0.44 * N, 0.46 * N, 0.12 * N, 0.1 * N, MID + DIM);
    const J = walker(r, 0.5 * N, 0.46 * N, 0.14 * N, FIG, 0, 1, { hat: true, hatCol: BRIGHT });
    if (w.ref > 0) { r.stroke(J.sx, J.sy, J.sx + 2 * u, J.sy - 0.09 * N, px1(1.3 * u), FIG); r.disc(J.sx + 2 * u, J.sy - 0.1 * N, 1.5 * u, BRIGHT); }
    // the crowd flows to the side that plays, each at their own lag, bouncing on the beat; lighters and phones on the snare
    for (let k = 0; k < w.order.length; k++) {
      const i = w.order[k];
      if (i >= n) continue;
      const c = w.crowd[i], tx = side ? 0.58 + 0.36 * hash(i, 1) : 0.06 + 0.36 * hash(i, 1), h = (0.06 + 0.08 * c.d) * N, x0 = c.x;
      c.x = follow(c.x, tx, dt, c.tau * lag);
      c.ph = stride(c.ph, (c.x - x0) * N, h); // the legs by the distance walked: they slow and stop with the figure
      c.vy += 2.2 * N * dt; c.h += c.vy * dt; if (c.h > 0) { c.h = 0; c.vy = 0; }
      c.lit -= dt;
      const x = c.x * N, y = floorY + 0.04 * N + c.d * 0.36 * N + c.h - f.beat.pulse * 1.5 * u * (i % 3 ? 1 : 0), dir = tx > c.x ? 1 : -1;
      if (c.d < 0.35) { r.disc(x, y - h * 0.85, h * 0.12, FIG + DIM); r.rect(x - h * 0.17, y - h * 0.72, h * 0.34, h * 0.72, FIG + DIM); }
      else walker(r, x, y, h, FIG, c.ph, dir, { cap: i % 4 === 0 });
      if (c.lit > 0) { if (c.phone) r.rect(x + dir * h * 0.2, y - h * 1.1, 1.5 * u, 2 * u, COOL); else r.rect(x + dir * h * 0.2, y - h * 1.15 - hash(i, Math.floor(t * 20)) * u, px1(u), px1(1.5 * u), BRIGHT); }
    }
    targets.push({ x: 0.44 * N, y: 0.3 * N, w: 0.12 * N, h: 0.26 * N });
  },
};

const WORLDS = { trainyard, wallofhame, skatespot, punkshow, zine, stickerpost, cypher, dirtjumps, forestshow, tattooflash, nightbus, soundclash };

registerFamily('street', WORLD_DEFS, WORLDS);
export const STREET_STYLE = makeMixStyle('STREET', ['street']);
