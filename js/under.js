// The underground, mixed: rave, club and sound-system culture as pictures. A warehouse rave, a dub sound system,
// two decks from above, a tracker screen, an oscilloscope, a pirate-radio roof, a free party in a forest, a cellar
// club, crate digging, a dual cassette deck, a modular wall and a dubplate lathe. The visual tropes only: no
// brands, logos, club names or people from anywhere, no words. Every world draws with the palette roles, so any
// palette, treatment and layout of the mixer fits; each has a table of kinds weighed by the arousal band, rolled
// again on a section change, with a heavy turn on a drop.
import { clamp, lerp } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow, ease,
  beatLocked, hash, pickW, walker, particles, burst, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  warehouse: { name: 'warehouse rave', va: [[H, H], [M, H], [H, M]], pals: ['neon', 'noir', 'toxic', 'thermal', 'cga'], fx: ['none', 'crt', 'vhs'] },
  soundsystem: { name: 'sound system', va: [[H, M], [M, M], [M, L]], pals: ['amber', 'gold', 'tape', 'toxic', 'nineties'], fx: ['none', 'vhs', 'film'] },
  turntables: { name: 'two decks', va: [[H, M], [M, M], [M, L]], pals: ['silver', 'noir', 'gold', 'nineties', 'neon'], fx: ['none', 'crt', 'vhs'] },
  tracker: { name: 'tracker screen', va: [[M, M], [L, M]], pals: ['phosphor', 'amber', 'cga', 'midnight', 'toxic'], fx: ['crt', 'none', 'code'] },
  scope: { name: 'oscilloscope', va: [[M, M], [L, M]], pals: ['phosphor', 'amber', 'noir', 'thermal', 'silver'], fx: ['crt', 'none', 'kaleido'], geo: true },
  pirateradio: { name: 'pirate radio roof', va: [[L, M], [M, L]], pals: ['midnight', 'noir', 'neon', 'amber', 'silver'], fx: ['film', 'vhs', 'none'] },
  freeparty: { name: 'free party', va: [[H, H], [M, H], [H, M]], pals: ['midnight', 'toxic', 'amber', 'neon', 'tape'], fx: ['none', 'film', 'vhs'] },
  basement: { name: 'basement club', va: [[H, H], [M, H], [H, M]], pals: ['noir', 'neon', 'thermal', 'amber', 'tape'], fx: ['none', 'vhs', 'crt', 'film'] },
  crates: { name: 'crate digging', va: [[H, M], [M, M], [M, L]], pals: ['tape', 'gold', 'nineties', 'vapor', 'amber'], fx: ['none', 'film', 'vhs'] },
  tapedeck: { name: 'dual cassette', va: [[M, M], [L, M]], pals: ['silver', 'tape', 'noir', 'amber', 'vapor'], fx: ['none', 'vhs', 'film'] },
  modular: { name: 'modular wall', va: [[M, M], [L, M]], pals: ['noir', 'silver', 'neon', 'toxic', 'cga'], fx: ['none', 'crt', 'code'] },
  lathe: { name: 'cutting lathe', va: [[M, M], [L, M]], pals: ['silver', 'noir', 'gold', 'tape', 'amber'], fx: ['none', 'film', 'crt'] },
};

// the arousal band a mood falls in (low, mid, high): the kind tables below weigh their kinds by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const NO10 = new Float32Array(10);
const b10 = (f) => f.band10 || NO10; // the ten band levels, zeros when the frame has none
const beatS = (f) => (f.bpm ? 60 / f.bpm : 0.5); // seconds per beat
// a clock in beats: the analysis's count and phase while it has the tempo, else free-running at two a second
function beatT(W) {
  const { f, w, dt } = W;
  w.bt = beatLocked(f) ? f.beat.count + f.beat.phase : (w.bt || 0) + dt * (f.bpm ? f.bpm / 60 : 2);
  return w.bt;
}
// a jump on the beat: a parabola `hgt` high over one beat from phase `ph`, back on the floor in between
const hop = (bt, ph, hgt, len = 0.5) => { const p = ((bt + ph) % 1) / len; return p < 1 ? 4 * p * (1 - p) * hgt : 0; };
const VUK = 260, VUC = 22; // a VU needle: a stiff, lightly under-damped second-order follower, so it overshoots a little
function vuStep(m, target, dt) { // in steps of 20 ms at most: stepped whole at the 0.1 s frame cap this spring runs away
  const n = Math.ceil(dt / 0.02), h = dt / n;
  for (let k = 0; k < n; k++) { m.v += (VUK * (target - m.x) - VUC * m.v) * h; m.x += m.v * h; }
}
// a circle as points along its rim (r.ring walks the whole box, too dear for the big ones)
function rim(r, cx, cy, rad, col, u) {
  const n = Math.max(8, Math.ceil((TAU * rad) / Math.max(1, u * 0.9))), s = Math.max(1, Math.round(u));
  for (let k = 0; k < n; k++) { const a = (k / n) * TAU; r.rect(cx + Math.cos(a) * rad - s / 2, cy + Math.sin(a) * rad - s / 2, s, s, col); }
}
// a dancer silhouette: feet on `base`, h tall, `jump` cells in the air, arms up or down, the body leaning by `lean`
function dancer(r, x, base, h, col, jump, up, lean = 0) {
  const y = base - jump, hw = h * 0.16, head = h * 0.2, lw = Math.max(1, hw * 0.6);
  r.rect(x - hw * 0.9, y - h * 0.34, lw, h * 0.34, col);
  r.rect(x + hw * 0.3, y - h * 0.34, lw, h * 0.34, col);
  r.rect(x - hw + lean, y - h * 0.78, 2 * hw, h * 0.46, col);
  r.disc(x + lean * 1.6, y - h * 0.78 - head * 0.5, head * 0.5, col);
  if (up) { r.line(x - hw + lean, y - h * 0.72, x - hw * 2 + lean, y - h * 1.08, col); r.line(x + hw + lean, y - h * 0.72, x + hw * 2 + lean, y - h * 1.08, col); }
  else { r.line(x - hw + lean, y - h * 0.72, x - hw * 1.7 + lean, y - h * 0.42, col); r.line(x + hw + lean, y - h * 0.72, x + hw * 1.7 + lean, y - h * 0.42, col); }
}
// a speaker box: a cabinet with a cone whose rim pushes out by `push` (0..1 of its radius)
const dim = (c) => (c < DIM ? c + DIM : c); // the dimmed twin of a role (the dimmed ones, black and white stay)
function cab(r, x, y, bw, bh, push, u, col = DARK, cone = MID) {
  r.rect(x, y, bw, bh, col);
  r.frame(x, y, bw, bh, dim(col));
  const rad = Math.min(bw, bh) * 0.36 * (1 + 0.12 * push);
  r.ring(x + bw / 2, y + bh / 2, rad, Math.max(1, u), cone);
  r.disc(x + bw / 2, y + bh / 2, rad * 0.35, push > 0.5 ? LMID : cone);
}
// a hand: a palm with four fingers toward (dx, dy)
function hand(r, x, y, sz, dx, dy, col) {
  r.disc(x, y, sz, col);
  const len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  for (let k = -1.5; k <= 1.5; k++) r.line(x + nx * k * sz * 0.5, y + ny * k * sz * 0.5, x + nx * k * sz * 0.55 + (dx / len) * sz * 1.6, y + ny * k * sz * 0.55 + (dy / len) * sz * 1.6, col);
}

// ---------------------------------------------------------------------------------------------- warehouse
// A warehouse rave in perspective: a crowd of silhouettes (more of them as the energy rises) each hopping on the
// beat with its own phase and height, the dj far back between speaker stacks, a smoke machine filling the floor
// and thinning again. The rig is the kind: laser fans sweep on the snares, moving heads swing on the beat, a
// strobe whites the whole frame on the heavy kicks (every kick in the strobe room), the uv room glows cool. A
// drop is a blackout for a beat and then a strobe burst.
const RIGS = {
  lasers: { laser: true, heads: 0, every: false, uv: false },
  heads: { laser: false, heads: 3, every: false, uv: false },
  strobe: { laser: false, heads: 0, every: true, uv: false },
  uv: { laser: false, heads: 2, every: false, uv: true },
};
const RIG_W = { lasers: [1, 2, 3], heads: [2, 3, 2], strobe: [0, 1, 3], uv: [3, 2, 1] };

const warehouse = {
  init(W) {
    const { w, rnd } = W;
    const crowd = Array.from({ length: 90 }, () => ({ d: 1 + 2 * rnd(), X: (rnd() - 0.5) * 1.5, ph: rnd(), hj: 0.4 + rnd() * 0.6 })).sort((p, q) => q.d - p.d);
    Object.assign(w, { crowd, rig: rollW(rnd, RIG_W, bandOf(W.a)), vis: 0.5, fog: 0.3, strobe: 0, laser: 0, black: 0, burst: 0, puffT: 0, bt: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, horizon = 0.42 * N, bt = beatT(W);
    if (f.section === 'change') w.rig = rollW(rnd, RIG_W, bandOf(W.a));
    const rig = RIGS[w.rig];
    if (f.section === 'drop') { w.black = beatS(f); w.burst = 0.6; w.fog = Math.min(1, w.fog + 0.5); s.shake = Math.max(s.shake, 0.3); }
    for (const h of hits) {
      if (isLow(h) && (h.strength > 0.7 || rig.every)) w.strobe = 1;
      else if (h.kind === 'snare') w.laser = 0.35;
    }
    w.laser -= dt;
    // the smoke machine: a puff every eight beats (sooner when it is loud), the fog thinning in between
    if ((w.puffT += dt) > (f.level > 0.6 ? 3 : 5) * beatS(f)) { w.puffT = 0; w.fog = Math.min(1, w.fog + 0.35); }
    w.fog = follow(w.fog, 0, dt, 7);
    w.vis = follow(w.vis, 0.25 + 0.75 * clamp(0.6 * f.level + 0.5 * f.rel.bassDrive), dt, 1.5);
    if (w.black > 0) { w.black -= dt; r.fill(BLACK); return; } // the drop's blackout
    if (w.burst > 0) { w.burst -= dt; if ((t * 30 | 0) % 2 === 0) w.strobe = 1; }
    const strobe = w.strobe > 0;
    if (strobe) w.strobe--;
    const ink = strobe ? BLACK : rig.uv ? COOL + DIM : DARK;
    r.fill(strobe ? BRIGHT : BG);
    // the hall: a back wall with high windows, roof trusses, the floor
    if (!strobe) {
      r.rect(0, 0, N, horizon, DARK + DIM);
      for (let k = 0; k < 5; k++) r.rect((0.08 + k * 0.18) * N, 0.08 * N, 0.1 * N, 0.08 * N, rig.uv ? COOL + DIM : MID + DIM);
      for (let k = 0; k < 4; k++) r.line(0, (0.02 + k * 0.1) * N, N, (0.02 + k * 0.1) * N, DARK);
      r.rect(0, horizon, N, N - horizon, BG);
    }
    // moving heads on the beat (the uv room has two in cool), the laser fan on the snare
    if (!strobe && rig.heads) for (let i = 0; i < rig.heads; i++) {
      const hx = ((i + 1) / (rig.heads + 1)) * N, ang = Math.PI / 2 + 0.55 * Math.sin((bt / 4) * TAU + i * 2.1);
      r.poly([[hx, 2 * u], [hx + Math.cos(ang + 0.05) * N, 2 * u + Math.sin(ang + 0.05) * N], [hx + Math.cos(ang - 0.05) * N, 2 * u + Math.sin(ang - 0.05) * N]], rig.uv ? COOL + DIM : i % 2 ? HOT + DIM : LMID + DIM);
      r.rect(hx - 3 * u, 0, 6 * u, 3 * u, DARK);
    }
    if (!strobe && (rig.laser || w.burst > 0) && w.laser > 0) {
      const sw = Math.sin(t * 7) * 0.35;
      for (let i = 0; i < 9; i++) { const a = Math.PI / 2 + (i - 4) * 0.16 + sw; r.line(N / 2, 0.1 * N, N / 2 + Math.cos(a) * N * 1.2, 0.1 * N + Math.sin(a) * N * 1.2, i % 2 ? COOL : HOT); }
    }
    // the dj on a riser just past the crowd (depth dD on the crowd's scale: feet at horizon + k/d, size 1/d), a stack
    // each side; the near stacks at the screen's edges stand at depth 1
    const dD = 3.6, djX = N / 2, djB = horizon + (0.58 * N) / dD, cs = (0.16 * N) / dD, push = clamp(f.rel.bassAtt);
    r.rect(djX - 0.1 * N, djB - 0.02 * N, 0.2 * N, 0.02 * N, ink);
    walker(r, djX, djB - 0.02 * N, (0.3 * N) / dD, ink, 0, 1, { cap: true });
    r.rect(djX - 0.07 * N, djB - 0.07 * N, 0.14 * N, 0.025 * N, ink);
    for (const k of [-1, 1]) {
      for (let j = 0; j < 3; j++) cab(r, djX + k * 0.17 * N - cs / 2, djB - (j + 1) * cs, cs, cs, push, u, ink, strobe ? BLACK : MID);
      for (let j = 0; j < 3; j++) cab(r, k < 0 ? -0.05 * N : 0.89 * N, N - (j + 1) * 0.16 * N, 0.16 * N, 0.16 * N, push, u, ink, strobe ? BLACK : MID);
    }
    // the crowd, far to near: feet at horizon + k/d, size 1/d, a hop on the beat with its own phase and height
    const drive = 0.4 + 0.6 * clamp(f.rel.bassDrive);
    for (let i = 0; i < w.crowd.length; i++) {
      const c = w.crowd[i];
      if (hash(i, 11) > w.vis) continue;
      const base = horizon + (0.58 * N) / c.d, h = (0.3 * N) / c.d, x = N / 2 + (c.X * N) / c.d;
      if (x < -h || x > N + h) continue;
      const up = w.burst > 0 || (f.beat.pulse > 0.5 && hash(i, f.beat.count) < 0.5);
      dancer(r, x, base, h, ink, hop(bt, c.ph, c.hj * h * 0.22 * drive), up);
      if (rig.uv && !strobe && hash(i, 3) < 0.4) r.rect(x - u, base - h * 0.6, 2 * u, 2 * u, BRIGHT); // a white tee under the uv
    }
    // the fog over the floor, denser at the bottom, a ragged top drifting with time
    if (w.fog > 0.03 && !strobe) {
      const fogCol = rig.uv ? COOL + DIM : LMID + DIM, top = N - w.fog * 0.34 * N, fade = 6 * u, buf = r.buf;
      for (let x = 0; x < N; x++) {
        const tx = top + (hash(x >> 2, 3) - 0.5) * 6 * u + Math.sin(t * 0.7 + x * 0.09) * 2 * u;
        for (let y = Math.max(0, Math.round(tx)); y < N; y++) if (y - tx >= fade || ((x + y) & 1)) buf[y * N + x] = fogCol;
      }
    }
    targets.push({ x: djX - 0.1 * N, y: djB - 0.13 * N, w: 0.2 * N, h: 0.13 * N });
  },
};

// ---------------------------------------------------------------------------------------------- soundsystem
// A dub sound system: a stack of bass bins whose cones push out with the bass attack and spring back, horns that
// sparkle with the treble, the selector at the preamp with the sliders following the bands, a crowd skanking at
// half tempo, smoke and a string of bulbs that change on the beat. The stack is the kind: scoops, a wall, two
// towers or a horn-loaded rig. A drop spins the siren light for two bars and kicks the cones hard.
const STACKS = {
  scoops: { cols: 2, rows: [1.6, 1, 0.5] }, // two huge scoops under mids and horns
  wall: { cols: 3, rows: [1, 1, 0.5] },
  tower: { cols: 2, rows: [0.8, 0.8, 0.8, 0.5], gap: 0.1 }, // two tall columns with a gap
  horns: { cols: 3, rows: [1, 0.5, 0.5, 0.5] }, // one row of bins, three of horns
};
const STACK_W = { scoops: [2, 2, 3], wall: [2, 3, 2], tower: [3, 2, 1], horns: [1, 2, 2] };

const soundsystem = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, STACK_W, bandOf(W.a)), cx: 0, cv: 0, faders: new Float32Array(4), crowd: Array.from({ length: 14 }, (_, i) => ({ x: 0.04 + (i + rnd() * 0.6) / 14.5, s: 0.8 + rnd() * 0.4, ph: i % 2 })),
      siren: 0, sa: 0, smoke: [], bulbs: Array.from({ length: 11 }, (_, i) => i % 3), bt: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, B = b10(f), bt = beatT(W), g = 0.82 * N;
    if (f.section === 'change') { w.kind = rollW(rnd, STACK_W, bandOf(W.a)); for (let i = 0; i < 11; i++) w.bulbs[i] = Math.floor(rnd() * 3); }
    const K = STACKS[w.kind];
    if (f.section === 'drop') { w.siren = 8 * beatS(f); w.cv += 14; s.shake = Math.max(s.shake, 0.3); }
    // the cones: a spring pulled to the bass attack, under-damped so a kick rings once
    for (const h of hits) if (isLow(h)) w.cv += 6 * h.strength;
    for (let k = 0, n = Math.ceil(dt / 0.02), h = dt / n; k < n; k++) { w.cv += (420 * (clamp(f.rel.bassAtt) * 0.6 - w.cx) - 14 * w.cv) * h; w.cx += w.cv * h; } // 20 ms steps: steady at any frame rate
    const push = clamp(w.cx, -0.3, 1.2);
    if (f.beat.on) { for (let i = 0; i < 11; i++) w.bulbs[i] = (w.bulbs[i] + 1) % 3; }
    for (let k = 0; k < 4; k++) w.faders[k] = follow(w.faders[k], clamp(Math.max(B[k * 2], B[k * 2 + 1]) * 1.3), dt, 0.12);
    r.rect(0, g, N, N - g, DARK);
    r.rect(0, g, N, Math.max(1, u), DARK + DIM);
    // the bulbs on a sagging string between two poles
    for (const px of [0.06 * N, 0.94 * N]) r.rect(px - u / 2, 0.06 * N, Math.max(1, u), g - 0.06 * N, DARK + DIM);
    for (let i = 0; i < 11; i++) {
      const q = (i + 0.5) / 11, x = lerp(0.06 * N, 0.94 * N, q), y = 0.07 * N + 4 * 0.06 * N * q * (1 - q);
      if (i) { const q0 = (i - 0.5) / 11; r.line(lerp(0.06 * N, 0.94 * N, q0), 0.07 * N + 4 * 0.06 * N * q0 * (1 - q0), x, y, DARK + DIM); }
      r.disc(x, y + 2 * u, 1.6 * u, [HOT, COOL, BRIGHT][w.bulbs[i]]);
    }
    // the stack, bottom row first; the bins' cones push, the small boxes are horns that glint with the treble
    const sw = 0.42 * N, sx0 = 0.06 * N, unit = 0.12 * N, cw = sw / K.cols;
    let y = g;
    K.rows.forEach((rh, j) => {
      const bh = rh * unit;
      y -= bh;
      for (let i = 0; i < K.cols; i++) {
        const x = sx0 + i * cw + (K.gap && i ? K.gap * N : 0) - (K.gap ? (K.gap * N) / 2 : 0);
        if (rh >= 0.8) cab(r, x, y, cw - u, bh - u, push, u);
        else { // a horn: a flared mouth, bright specks with the treble
          r.rect(x, y, cw - u, bh - u, DARK);
          r.poly([[x + cw * 0.15, y + bh * 0.8], [x + cw * 0.85, y + bh * 0.8], [x + cw * 0.65, y + bh * 0.25], [x + cw * 0.35, y + bh * 0.25]], MID);
          if (hash(i + j * 7, t * 20 | 0) < f.rel.trebDrive) r.rect(x + cw * 0.5 - u, y + bh * 0.5, 2 * u, 2 * u, BRIGHT);
        }
      }
    });
    // the siren light on top of the stack: a dome, and on a drop a beam that goes round
    const topY = y, scx = sx0 + sw / 2;
    r.rect(scx - 2 * u, topY - 2 * u, 4 * u, 2 * u, DARK + DIM);
    if (w.siren > 0) {
      w.siren -= dt;
      w.sa += dt * TAU * 1.2;
      const bx = scx, by = topY - 4 * u;
      r.poly([[bx, by], [bx + Math.cos(w.sa + 0.25) * N, by + Math.sin(w.sa + 0.25) * N * 0.5], [bx + Math.cos(w.sa - 0.25) * N, by + Math.sin(w.sa - 0.25) * N * 0.5]], HOT + DIM);
      r.disc(bx, by, 3 * u, BRIGHT);
    } else r.disc(scx, topY - 4 * u, 3 * u, HOT + DIM);
    // the selector at the preamp table: four sliders following the bands, a nod on the beat
    const tx = 0.74 * N, ty = g - 0.12 * N;
    r.rect(tx - 0.12 * N, ty, 0.24 * N, 0.02 * N, DARK + DIM);
    for (const k of [-1, 1]) r.rect(tx + k * 0.1 * N - u, ty, 2 * u, g - ty, DARK + DIM);
    r.rect(tx - 0.1 * N, ty - 0.06 * N, 0.2 * N, 0.06 * N, DARK);
    for (let k = 0; k < 4; k++) {
      const fx = tx - 0.075 * N + k * 0.05 * N;
      r.rect(fx - u / 2, ty - 0.055 * N, Math.max(1, u), 0.05 * N, MID);
      r.rect(fx - 1.5 * u, ty - 0.01 * N - w.faders[k] * 0.04 * N, 3 * u, 1.5 * u, k < 2 ? HOT : COOL);
    }
    r.disc(tx + 0.085 * N, ty - 0.03 * N, 1.5 * u, f.beat.pulse > 0.6 ? BRIGHT : MID);
    walker(r, tx, ty - 0.06 * N + 0.01 * N * f.beat.pulse, 0.17 * N, FIG, 0, -1, { hat: true, hatCol: HOT });
    targets.push({ x: tx - 0.1 * N, y: ty - 0.2 * N, w: 0.2 * N, h: 0.2 * N });
    // the crowd skanking at half tempo: a lean to one side over two beats, the knee dip at the bottom
    for (const c of w.crowd) {
      const ph = ((bt / 2 + c.ph * 0.5) % 1) * TAU, lean = Math.sin(ph) * 3 * u * c.s, dip = Math.abs(Math.cos(ph)) * 0.06;
      const h = 0.2 * N * c.s * (1 - dip);
      dancer(r, c.x * N, N - 2 * u + (1 - c.s) * 6 * u, h, DARK, 0, Math.sin(ph) > 0.6, lean);
    }
    // smoke: a wisp a beat off the stack, rising slower as it spreads, drifting right
    if (f.beat.on) w.smoke.push({ x: scx + (rnd() - 0.5) * sw * 0.5, y: topY - 4 * u, vx: 2 * u, vy: -8 * u, r: 1.5 * u, life: 3 });
    w.smoke = w.smoke.filter((p) => {
      p.vy = follow(p.vy, -1.5 * u, dt, 1.2);
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 2 * u; p.life -= dt;
      if (p.life > 1 || ((t * 20) | 0) % 2 === 0) r.ring(p.x, p.y, p.r, Math.max(1, u), MID + DIM); // thinning: it flickers out
      return p.life > 0;
    }).slice(-24);
  },
};

// ---------------------------------------------------------------------------------------------- turntables
// Two decks and a mixer from above. The platters turn at 33 or 45 rpm; the rim has two rows of dots, 54 and 40,
// so at 30 frames a second the platter turns exactly one dot per frame at 33 rpm on the outer row and at 45 on
// the inner one: that row stands still, the other crawls. The tone arm swings about its pivot, the stylus moving
// in along a groove radius; a snare brings the hand in and the platter goes back a few frames (the dots show it);
// the crossfader follows mid against treble; the VU per band on the mixer. A section change flips a record (arm
// up, disc swapped, arm down at the lead-in); the second deck plays only on a drop, when the fader cuts on the beat.
const SETUPS = {
  lounge: { rpm: 33.333, two: false, scratch: 0.85 }, // one deck, 33, a scratch only on the hardest snare
  club: { rpm: 33.333, two: false, scratch: 0.6 },
  battle: { rpm: 45, two: false, scratch: 0 }, // 45, a scratch on every snare
  radio: { rpm: 45, two: true, scratch: 0.7 }, // both decks on
};
const SETUP_W = { lounge: [3, 1, 0], club: [2, 3, 1], battle: [0, 2, 3], radio: [1, 2, 2] };
const DOTS = [Math.round((30 * 60) / 33.333), Math.round((30 * 60) / 45)]; // one dot per 30 fps frame: 54 and 40
// the stylus: where the arm's arc (radius La about the pivot P) meets the groove circle (radius rg about C)
function stylusAt(cx, cy, px, py, La, rg) {
  const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy), a = (rg * rg - La * La + d * d) / (2 * d), h = Math.sqrt(Math.max(0, rg * rg - a * a));
  const mx = cx + (a * dx) / d, my = cy + (a * dy) / d;
  return [mx - (h * dy) / d, my + (h * dx) / d]; // the solution clockwise of the pivot line: from a rear-right pivot the headshell sits over the front right of the record
}

const turntables = {
  init(W) {
    const { w, rnd } = W;
    const deck = (lab) => ({ ang: rnd() * TAU, spd: 0, pos: 0.93, lab, flip: 0, scr: 0, scrV: 0, rest: 0 });
    Object.assign(w, { kind: rollW(rnd, SETUP_W, bandOf(W.a)), decks: [deck(HOT), deck(COOL)], both: 0, xf: 0.5, vu: new Float32Array(8), handT: 0, handDeck: 0, cutT: 0, bt: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, B = b10(f), R = 0.17 * N, cy = 0.46 * N, bt = beatT(W);
    if (f.section === 'change') w.kind = rollW(rnd, SETUP_W, bandOf(W.a));
    if (f.section === 'drop') { w.both = 16 * beatS(f); w.cutT = 8 * beatS(f); }
    w.both -= dt; w.cutT -= dt;
    const K = SETUPS[w.kind], two = K.two || w.both > 0;
    if (f.section === 'change') { const d = w.decks[two ? f.beat.count % 2 : 0]; if (!d.flip) d.flip = 1.2; } // a new record on a section
    for (const h of hits) {
      if (h.kind === 'snare' && h.strength >= K.scratch) { const d = w.decks[two ? Math.floor(rnd() * 2) : 0]; d.scr = 0.24; d.scrV = -1.8; w.handT = 0.4; w.handDeck = w.decks.indexOf(d); }
      else if (isLow(h) && w.cutT > 0) { const d = w.decks[f.beat.count % 2]; d.scr = 0.12; d.scrV = -1.2; }
    }
    // the crossfader: mid against treble, slammed side to side on the beat while a drop cuts
    const want = w.cutT > 0 ? f.beat.count % 2 : clamp(0.5 + 0.6 * (f.rel.trebDrive - f.rel.midDrive));
    w.xf = follow(w.xf, want, dt, w.cutT > 0 ? 0.04 : 0.25);
    for (let k = 0; k < 8; k++) w.vu[k] = Math.max(clamp(B[k + 1] * 1.3), w.vu[k] - dt * 2);
    const omega = (K.rpm / 60) * TAU;
    w.decks.forEach((d, i) => {
      const cx = (i ? 0.78 : 0.22) * N, on = i === 0 || two, px = cx + R * 1.25, py = cy - R * 1.25, La = R * 1.9;
      // the platter: nominal speed when on, a baby scratch on a snare (back, then forward), coasting to a stop when off
      if (d.scr > 0) { d.scr -= dt; d.scrV = follow(d.scrV, d.scr > 0.1 ? -1.8 : 2.2, dt, 0.05); d.spd = omega * d.scrV; }
      else d.spd = on ? follow(d.spd, omega, dt, 0.08) : follow(d.spd, 0, dt, 1.5);
      d.ang += d.spd * dt;
      // the stylus works inward while the record plays; a flip: arm out to the rest, a new disc, arm back to the lead-in
      if (on && !d.flip) d.pos = Math.max(0.42, d.pos - (dt / (48 * beatS(f))) * 0.5);
      if (d.pos <= 0.42 && !d.flip) d.flip = 1.2;
      let lift = 0;
      if (d.flip > 0) {
        d.flip -= dt;
        const q = 1 - d.flip / 1.2;
        if (q < 0.5) { lift = ease(q * 2); if (q + dt / 1.2 >= 0.5) { d.lab = pick(rnd, [HOT, COOL, BRIGHT, LMID]); d.pos = 0.93; d.ang = rnd() * TAU; } }
        else lift = 1 - ease((q - 0.5) * 2);
      }
      // the record: the platter, the grooves as rings, the label with a mark that turns, the two rows of strobe dots
      r.disc(cx, cy, R * 1.08, DARK);
      r.disc(cx, cy, R, DARK + DIM);
      for (let k = 0; k < 4; k++) rim(r, cx, cy, R * (0.5 + k * 0.11), DARK, u * 0.7);
      r.disc(cx, cy, R * 0.3, d.lab);
      r.disc(cx, cy, R * 0.04, DARK);
      r.rect(cx + Math.cos(d.ang) * R * 0.18 - u, cy + Math.sin(d.ang) * R * 0.18 - u, 2 * u, 2 * u, BG);
      for (let row = 0; row < 2; row++) {
        const n = DOTS[row], rad = R * (1.055 - row * 0.03), sz = Math.max(1, Math.round(u * 0.8));
        for (let k = 0; k < n; k++) { const a = d.ang + (k / n) * TAU; r.rect(cx + Math.cos(a) * rad - sz / 2, cy + Math.sin(a) * rad - sz / 2, sz, sz, LMID); }
      }
      // the tone arm: pivot, counterweight, the arm to the stylus (or to its rest when lifted), the headshell
      const [gx, gy] = stylusAt(cx, cy, px, py, La, R * d.pos), [rx, ry] = [cx + R * 1.22, cy + R * 0.65]; // the rest: La from the pivot, off the platter's edge
      const sx = lerp(gx, rx, lift), sy = lerp(gy, ry, lift), armC = lift > 0 ? BRIGHT : LMID;
      r.rect(rx - 1.5 * u, ry - 3 * u, 3 * u, 7 * u, DARK + DIM); // the arm rest
      r.disc(px, py, 3.5 * u, MID);
      r.stroke(px, py, px - (sx - px) * 0.25, py - (sy - py) * 0.25, 2.5 * u, MID);
      r.stroke(px, py, sx, sy, Math.max(1, 1.3 * u), armC);
      r.rect(sx - 2 * u, sy - 1.5 * u + (lift ? -2 * u : 0), 4 * u, 3 * u, armC);
      if (on && !lift) r.disc(cx + 0.15 * R, cy - 1.12 * R, 1.2 * u, f.beat.pulse > 0.5 ? BRIGHT : HOT); // the start light
      // the hand, scratching: on the far side of the platter from the stylus, pushing back and forth with it
      if (w.handT > 0 && w.handDeck === i) {
        const a = Math.PI * 1.15 + d.scrV * 0.08;
        hand(r, cx + Math.cos(a) * R * 0.7, cy + Math.sin(a) * R * 0.7, 3 * u, -Math.sin(a), Math.cos(a), FIG);
        r.stroke(cx + Math.cos(a) * R * 0.7, cy + Math.sin(a) * R * 0.7, cx + Math.cos(a) * R * 2.2, cy + Math.sin(a) * R * 1.2 + N * 0.3, 3 * u, FIG);
      }
      targets.push({ x: cx - R, y: cy - R, w: 2 * R, h: 2 * R });
    });
    w.handT -= dt;
    // the mixer between the decks: two channel strips of VU leds (bass up to treble), gain knobs, the crossfader
    const mx = N / 2, mw = 0.17 * N, my = cy - R * 1.2, mh = R * 2.6;
    r.rect(mx - mw / 2, my, mw, mh, DARK);
    r.frame(mx - mw / 2, my, mw, mh, DARK + DIM);
    for (const k of [-1, 1]) {
      const x = mx + k * mw * 0.24;
      for (let j = 0; j < 4; j++) {
        const v = w.vu[j * 2 + (k > 0 ? 1 : 0)], segs = 6;
        for (let q = 0; q < segs; q++) r.rect(x + (j - 1.5) * 3.2 * u - 1.2 * u, my + 0.4 * mh - q * 2 * u, 2.4 * u, 1.3 * u, q < v * segs ? (q >= 4 ? HOT : q >= 2 ? LMID : COOL) : DARK + DIM);
      }
      r.disc(x, my + 0.52 * mh, 2.5 * u, MID);
      r.line(x, my + 0.52 * mh, x + Math.cos(-2.2 + 4.4 * (k > 0 ? f.rel.trebDrive : f.rel.bassDrive)) * 2.5 * u, my + 0.52 * mh + Math.sin(-2.2 + 4.4 * (k > 0 ? f.rel.trebDrive : f.rel.bassDrive)) * 2.5 * u, BRIGHT);
      r.rect(x - u, my + 0.6 * mh, 2 * u, 0.25 * mh, DARK + DIM); // the channel fader slot
      r.rect(x - 2.5 * u, my + 0.6 * mh + 0.25 * mh * (1 - clamp((k > 0 ? w.decks[1].spd : w.decks[0].spd) / omega)), 5 * u, 2 * u, LMID);
    }
    r.rect(mx - mw * 0.4, my + mh - 3.5 * u, mw * 0.8, Math.max(1, u), MID);
    r.rect(mx - mw * 0.4 + w.xf * mw * 0.8 - 2 * u, my + mh - 5 * u, 4 * u, 4 * u, BRIGHT);
    for (let i = 0; i < 2; i++) r.disc(mx + (i ? 1 : -1) * mw * 0.3, my + 3 * u, 1.2 * u, (i === 0 || two) ? (f.beat.pulse > 0.5 ? BRIGHT : COOL) : DARK + DIM);
  },
};

// ---------------------------------------------------------------------------------------------- tracker
// A tracker screen: a scope strip across the top drawing the waveform, then four to eight channel columns of
// pattern cells scrolling up at the tempo, sixteen rows a bar, the play row held in the middle. A cell lights when
// its channel fires: the bass column on the kicks, the snare and hat columns on theirs, the melody columns by pitch
// class; VU bars per channel under the columns. A section change writes a new pattern; a drop fills every other
// row for a bar. Cells are blocks, never glyphs.
const TRK = { four: { ch: 4 }, six: { ch: 6 }, eight: { ch: 8 } };
const TRK_W = { four: [3, 2, 1], six: [2, 3, 2], eight: [0, 2, 3] };
const ROWS = 64;
function newPattern(rnd, ch) {
  const p = new Uint8Array(ROWS * ch), seed = Math.floor(rnd() * 1e6);
  for (let row = 0; row < ROWS; row++) for (let c = 0; c < ch; c++) {
    const h = hash(seed + row, c), on = c === 0 ? row % 4 === 0 || h < 0.1 : c === 1 ? row % 8 === 4 || h < 0.06 : c === 2 ? row % 2 === 0 || h < 0.2 : h < 0.35;
    p[row * ch + c] = on ? 1 + Math.floor(hash(seed + c * 131, row) * 12) : 0;
  }
  return p;
}

const tracker = {
  init(W) {
    const { w, rnd } = W, kind = rollW(rnd, TRK_W, bandOf(W.a));
    Object.assign(w, { kind, pat: newPattern(rnd, TRK[kind].ch), lit: new Float32Array(8), vu: new Float32Array(8), fill: 0, bt: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, B = b10(f), bt = beatT(W);
    if (f.section === 'change') { w.kind = rollW(rnd, TRK_W, bandOf(W.a)); w.pat = newPattern(rnd, TRK[w.kind].ch); }
    if (f.section === 'drop') w.fill = 4 * beatS(f);
    w.fill -= dt;
    const ch = TRK[w.kind].ch;
    if (w.pat.length !== ROWS * ch) w.pat = newPattern(rnd, ch);
    // hits light their channel: 0 bass, 1 snare, 2 hats, 3.. the melody columns by pitch class
    const mel = Math.max(1, ch - 3);
    for (const h of hits) {
      const c = isLow(h) ? 0 : h.kind === 'snare' ? 1 : h.kind === 'hat' ? 2 : 3 + (isTonal(h) ? h.pc % mel : ((t * 7) | 0) % mel);
      if (c < ch) { w.lit[c] = 1; w.vu[c] = Math.max(w.vu[c], h.strength); }
    }
    for (let c = 0; c < ch; c++) { w.lit[c] = Math.max(0, w.lit[c] - dt * 6); w.vu[c] = Math.max(w.vu[c] - dt * 1.6, c < 3 ? 0 : clamp(B[Math.min(9, 3 + c)] * 0.8)); } // ten bands only
    // the scope strip
    const sy0 = 0.03 * N, sh = 0.14 * N, wv = f.wave, x0 = 0.04 * N, sw = 0.92 * N;
    r.rect(x0, sy0, sw, sh, DARK + DIM);
    r.frame(x0, sy0, sw, sh, DARK);
    let ly = sy0 + sh / 2;
    for (let x = x0; x < x0 + sw; x += 1) {
      const q = (x - x0) / sw, v = wv?.length ? wv[Math.floor(q * wv.length)] : Math.sin(q * TAU * 3 + f.rel.midClock * 2) * 0.3 * f.level;
      const y = sy0 + sh / 2 - clamp(v * (w.fill > 0 ? 3 : 1), -1, 1) * sh * 0.45;
      r.line(x - 1, ly, x, y, w.fill > 0 ? BRIGHT : COOL);
      ly = y;
    }
    // the columns: sixteen rows a bar, four a beat, scrolling up with the beat clock, the play row in the middle
    const top = 0.2 * N, bottom = 0.9 * N, rowH = Math.max(2, (0.03 * N) | 0) + (ch <= 4 ? 1 : 0), playY = Math.round((top + bottom) / 2), cw = sw / ch;
    const rowF = bt * 4, playRow = Math.floor(rowF), frac = rowF - playRow;
    r.rect(x0, playY - u, sw, rowH + 2 * u, MID + DIM);
    for (let k = -(((playY - top) / rowH) | 0) - 1; k <= (((bottom - playY) / rowH) | 0) + 1; k++) {
      const row = (((playRow + k) % ROWS) + ROWS) % ROWS, y = playY + (k - frac) * rowH;
      if (y + rowH < top || y > bottom) continue;
      for (let c = 0; c < ch; c++) {
        const v = w.pat[row * ch + c], filled = w.fill > 0 && row % 2 === 0, x = x0 + c * cw + 1.5 * u;
        if (!v && !filled) { if (row % 4 === 0) r.rect(x, y + rowH / 2, cw - 3 * u, 1, DARK + DIM); continue; }
        const col = c === 0 ? HOT : c === 1 ? LMID : c === 2 ? MID : [COOL, BRIGHT, LMID, HOT][v % 4];
        r.rect(x, y + u * 0.5, (cw - 3 * u) * (c < 3 ? 1 : 0.3 + 0.7 * ((v - 1) / 12)), rowH - u, k === 0 && w.lit[c] > 0.5 ? BRIGHT : col);
      }
    }
    for (let c = 1; c < ch; c++) r.rect(x0 + c * cw - u / 2, top, Math.max(1, u), bottom - top, DARK + DIM);
    r.frame(x0, top, sw, bottom - top, DARK);
    // VU bars per channel under the columns
    for (let c = 0; c < ch; c++) { const x = x0 + c * cw + 1.5 * u; r.rect(x, N - 0.065 * N, cw - 3 * u, 0.04 * N, DARK + DIM); r.rect(x, N - 0.065 * N, (cw - 3 * u) * w.vu[c], 0.04 * N, w.vu[c] > 0.8 ? HOT : COOL); }
    targets.push({ x: x0, y: playY - u, w: sw, h: rowH + 2 * u });
  },
};

// ---------------------------------------------------------------------------------------------- scope
// An oscilloscope with phosphor persistence: every trace adds to a float buffer that fades with time, mapped to
// the value ramp. The kind: a lissajous of bass against mid (the phase turning with the band clocks), a waveform
// ring, a vector tunnel of squares born on each beat, or all three small. A snare is a feedback squeal: jagged
// bursts across the trace; a drop blows the trace up to the whole screen and lets it settle, trailing long.
const SCOPES = { lissajous: { lis: true }, ring: { ring: true }, tunnel: { tun: true }, all: { lis: true, ring: true, tun: true, small: true } };
const SCOPE_W = { lissajous: [3, 2, 1], ring: [2, 3, 2], tunnel: [1, 2, 3], all: [0, 1, 2] };
const RATIOS = [[1, 2], [2, 3], [3, 4], [3, 5], [1, 3]];
function accLine(acc, N, x0, y0, x1, y1, v) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let g = 0; g < 2048; g++) {
    if (x0 >= 0 && y0 >= 0 && x0 < N && y0 < N) acc[y0 * N + x0] += v;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

const scope = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, SCOPE_W, bandOf(W.a)), acc: null, ratio: pick(rnd, RATIOS), gain: 1, squeal: 0, tunnel: [], trail: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, cx = N / 2, cy = N / 2, buf = r.buf;
    if (!w.acc || w.acc.length !== N * N) w.acc = new Float32Array(N * N);
    const acc = w.acc;
    if (f.section === 'change') { w.kind = rollW(rnd, SCOPE_W, bandOf(W.a)); w.ratio = pick(rnd, RATIOS); }
    if (f.section === 'drop') { w.gain = 2.6; w.trail = 2; }
    for (const h of hits) { if (h.kind === 'snare' && h.strength > 0.5) w.squeal = 0.07; else if (isLow(h)) w.gain = Math.max(w.gain, 1 + 0.25 * h.strength); }
    w.gain = follow(w.gain, 1, dt, 0.6);
    w.trail -= dt;
    // the phosphor: the old light fades with time (slowly through a drop), then the buffer becomes the picture
    const k = Math.exp(-dt / (w.trail > 0 ? 0.8 : 0.22));
    for (let i = 0, n = N * N; i < n; i++) acc[i] *= k;
    const g = w.gain * (0.75 + 0.5 * f.level), v0 = 0.7 + 0.5 * f.beat.pulse, K = SCOPES[w.kind];
    if (K.lis) { // bass against mid: the amplitudes from the drives, the phase turning with the clocks
      const sm = K.small ? 0.55 : 1, ax = (0.12 + 0.3 * clamp(f.rel.bassDrive)) * N * g * sm, ay = (0.12 + 0.3 * clamp(f.rel.midDrive)) * N * g * sm, [a, b] = w.ratio, ph = f.rel.bassClock * 0.4, ph2 = f.rel.midClock * 0.2;
      const ox = K.small ? cx - 0.22 * N : cx, oy = K.small ? cy - 0.2 * N : cy;
      let px = ox + Math.sin(ph) * ax, py = oy + Math.sin(ph2) * ay;
      for (let i = 1; i <= 240; i++) { const p = (i / 240) * TAU, x = ox + Math.sin(a * p + ph) * ax, y = oy + Math.sin(b * p + ph2) * ay; accLine(acc, N, px, py, x, y, v0 * 0.5); px = x; py = y; }
    }
    if (K.ring) { // the waveform round a circle
      const wv = f.wave, n = wv?.length ? Math.min(256, wv.length) : 128, R0 = (K.small ? 0.14 : 0.28) * N * g, amp = (K.small ? 0.1 : 0.18) * N * g;
      const ox = K.small ? cx + 0.22 * N : cx, oy = K.small ? cy - 0.2 * N : cy;
      let px = 0, py = 0;
      for (let i = 0; i <= n; i++) {
        const q = i % n, sv = wv?.length ? wv[Math.floor((q / n) * wv.length)] : Math.sin((q / n) * TAU * 4 + f.rel.trebClock) * 0.3 * f.level;
        const a = (q / n) * TAU, rad = R0 + clamp(sv, -1, 1) * amp, x = ox + Math.cos(a) * rad, y = oy + Math.sin(a) * rad;
        if (i) accLine(acc, N, px, py, x, y, v0 * 0.6);
        px = x; py = y;
      }
    }
    if (K.tun) { // squares born far on each beat, coming out at a speed set by the energy, turning with the mid clock
      if (f.beat.on) w.tunnel.push({ z: 6 });
      const rot = f.rel.midClock * 0.3, oy = K.small ? cy + 0.22 * N : cy, sc = (K.small ? 0.2 : 0.42) * N * g;
      w.tunnel = w.tunnel.filter((q) => {
        q.z -= dt * (1.5 + 3 * f.rel.bassDrive);
        if (q.z < 0.45) return false;
        const sz = sc / q.z, a0 = rot + q.z * 0.25;
        for (let e = 0; e < 4; e++) { const a = a0 + (e / 4) * TAU, b = a0 + ((e + 1) / 4) * TAU; accLine(acc, N, cx + Math.cos(a) * sz, oy + Math.sin(a) * sz, cx + Math.cos(b) * sz, oy + Math.sin(b) * sz, v0 * 0.4 * Math.min(1, 1.5 / q.z)); }
        return true;
      });
      if (w.tunnel.length > 24) w.tunnel.splice(0, w.tunnel.length - 24);
    }
    if (w.squeal > 0) { // feedback: a jagged burst across the middle for a few hundredths of a second
      w.squeal -= dt;
      let px = 0, py = cy;
      for (let x = 0; x <= N; x += Math.max(1, 3 * u)) { const y = cy + (rnd() - 0.5) * N * 0.14 * g; accLine(acc, N, px, py, x, y, 0.6); px = x; py = y; }
    }
    for (let i = 0, n = N * N; i < n; i++) { const a = acc[i]; buf[i] = a > 1.1 ? BRIGHT : a > 0.55 ? COOL : a > 0.25 ? MID : a > 0.08 ? DARK : BG; }
    // the graticule under the trace, the bezel
    const step = N / 8;
    for (let j = 1; j < 8; j++) { const p = Math.round(j * step); for (let q = 0; q < N; q += j === 4 ? 1 : 2) { if (buf[p * N + q] === BG) buf[p * N + q] = DARK + DIM; if (buf[q * N + p] === BG) buf[q * N + p] = DARK + DIM; } }
    r.frame(0, 0, N, N, DARK);
    targets.push({ x: cx - 0.2 * N, y: cy - 0.2 * N, w: 0.4 * N, h: 0.4 * N });
  },
};

// ---------------------------------------------------------------------------------------------- pirateradio
// A tower-block roof at night: the aerial is the kind (a lattice mast, a long wire between two poles, a dish, two
// masts), radio waves as rings leaving it on every beat at one speed and fading, a transmitter box whose leds
// blink with the bands, two figures and a torch, the city lights below flickering with the treble. A drop brings
// the helicopter: its searchlight sweeps the roof and everyone ducks; a section change brings the rain.
const AERIALS = { mast: { masts: [0.3], wire: false, dish: false }, wire: { masts: [0.2, 0.62], wire: true, dish: false }, dish: { masts: [0.32], wire: false, dish: true }, stack: { masts: [0.26, 0.5], wire: false, dish: false } };
const AERIAL_W = { wire: [3, 2, 1], mast: [2, 3, 2], dish: [2, 2, 2], stack: [0, 1, 3] };

const pirateradio = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, AERIAL_W, bandOf(W.a)), rings: [], rain: [], rainT: 0, heli: 0, heliX: 0, torchA: 0.6,
      blocks: Array.from({ length: 9 }, (_, i) => ({ x: i / 9 + rnd() * 0.03, w: 0.07 + rnd() * 0.05, h: 0.08 + rnd() * 0.16 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, B = b10(f), roof = 0.7 * N, mastTop = 0.08 * N;
    if (f.section === 'change') { w.kind = rollW(rnd, AERIAL_W, bandOf(W.a)); w.rainT = 16 * beatS(f); }
    if (f.section === 'drop') { w.heli = 8 * beatS(f); w.heliX = rnd() < 0.5 ? -0.2 : 1.2; }
    const K = AERIALS[w.kind], srcX = (K.wire ? (K.masts[0] + K.masts[1]) / 2 : K.masts[f.beat.count % K.masts.length]) * N, srcY = K.wire ? mastTop + 0.05 * N : mastTop;
    if (f.beat.on) w.rings.push({ x: srcX, y: srcY, rad: 2 * u, age: 0 });
    for (const h of hits) if (h.kind === 'snare') w.torchA = 0.3 + rnd() * 0.8;
    // the sky, the stars, the city beyond the parapet: blocks with windows that flicker more with the treble
    for (let k = 0; k < 24; k++) r.set(hash(k, 1) * N, hash(k, 2) * 0.4 * N, hash(k, (t * 2) | 0) < 0.9 ? LMID : DARK);
    for (const b of w.blocks) {
      const x = b.x * N, bw = b.w * N, top = roof - b.h * N;
      r.rect(x, top, bw, roof - top, DARK + DIM);
      for (let wy = top + 2 * u, j = 0; wy < roof - 2 * u; wy += 3 * u, j++)
        for (let wx = x + 1.5 * u, i = 0; wx < x + bw - 2 * u; wx += 3 * u, i++) {
          const id = ((b.x * 1000) | 0) + i * 31 + j * 7, blink = hash(id, (t * (1 + 3 * f.rel.trebDrive) + hash(id, 9) * 7) | 0);
          if (hash(id, 5) < 0.55 && blink < 0.85) r.rect(wx, wy, Math.max(1, u), Math.max(1, u), blink < 0.1 ? HOT : LMID);
        }
    }
    // the roof slab and the parapet, a lift house
    r.rect(0, roof, N, N - roof, DARK);
    r.rect(0, roof - 2 * u, N, 2 * u, MID + DIM);
    r.rect(0.76 * N, roof - 0.12 * N, 0.16 * N, 0.12 * N, DARK + DIM);
    // the aerial: masts with cross braces and guy wires, the wire or the dish, a warning lamp blinking on top
    for (const mx of K.masts) {
      const x = mx * N;
      r.rect(x - u / 2, mastTop, Math.max(1, u), roof - mastTop, MID);
      for (let y = mastTop + 3 * u; y < roof; y += 6 * u) r.rect(x - 2 * u, y, 4 * u, Math.max(1, u * 0.7), MID + DIM);
      for (const k of [-1, 1]) r.line(x, mastTop + 4 * u, x + k * 0.12 * N, roof, DARK + DIM);
      r.disc(x, mastTop, 1.2 * u, ((t * 2) | 0) % 2 ? HOT : HOT + DIM);
    }
    if (K.wire) { const x0 = K.masts[0] * N, x1 = K.masts[1] * N, sag = 0.05 * N; for (let q = 0; q < 10; q++) { const a = q / 10, b = (q + 1) / 10; r.line(lerp(x0, x1, a), mastTop + 4 * sag * a * (1 - a), lerp(x0, x1, b), mastTop + 4 * sag * b * (1 - b), LMID + DIM); } }
    if (K.dish) { const x = K.masts[0] * N; r.ring(x + 0.05 * N, mastTop + 0.04 * N, 0.05 * N, 1.5 * u, LMID, 0.6); r.line(x + 0.05 * N, mastTop + 0.04 * N, x + 0.09 * N, mastTop + 0.02 * N, LMID); }
    // the rings: out at one speed, dimmer with age, gone past the edge
    const speed = 0.35 * N;
    w.rings = w.rings.filter((q) => {
      q.rad += speed * dt; q.age += dt;
      rim(r, q.x, q.y, q.rad, q.age < 0.3 ? BRIGHT : q.age < 0.9 ? COOL : COOL + DIM, u);
      return q.rad < 0.75 * N;
    });
    // the transmitter box by the mast: four leds on the bands, a cable up the mast, the power lamp on the beat
    const bx = K.masts[0] * N + 0.04 * N, by = roof - 0.07 * N;
    r.rect(bx, by, 0.1 * N, 0.07 * N, MID + DIM);
    r.frame(bx, by, 0.1 * N, 0.07 * N, DARK);
    for (let k = 0; k < 4; k++) r.rect(bx + 1.5 * u + k * 2.5 * u, by + 1.5 * u, 1.8 * u, 1.8 * u, B[k * 2 + 1] > 0.35 + k * 0.1 ? (k < 2 ? HOT : COOL) : DARK + DIM);
    r.disc(bx + 0.08 * N, by + 0.045 * N, 1.2 * u, f.beat.pulse > 0.4 ? BRIGHT : DARK + DIM);
    r.line(bx + 0.02 * N, by, K.masts[0] * N, by - 0.1 * N, DARK + DIM);
    // the helicopter on a drop: offscreen above, its nav light at the top edge, the searchlight sweeping the roof
    const duck = w.heli > 0;
    if (duck) {
      w.heli -= dt;
      w.heliX = follow(w.heliX, 0.5, dt, 1.5);
      const hx = w.heliX * N, lx = hx + Math.sin(t * 1.4) * 0.3 * N;
      r.poly([[hx - 2 * u, 0], [hx + 2 * u, 0], [lx + 0.09 * N, roof + 0.1 * N], [lx - 0.09 * N, roof + 0.1 * N]], LMID + DIM);
      r.ring(lx, roof + 0.1 * N, 0.09 * N, 2 * u, BRIGHT, 0.3);
      r.disc(hx, 1.5 * u, 1.5 * u, ((t * 6) | 0) % 2 ? HOT : DARK);
      s.shake = Math.max(s.shake, 0.08);
    }
    // two figures: one with the torch, both crouched while the helicopter is over
    const fh = (duck ? 0.11 : 0.17) * N;
    walker(r, 0.46 * N, roof + 0.1 * N, fh, FIG, duck ? 0 : 0.3 * Math.sin(t * 3), 1, { cap: true });
    const J = walker(r, 0.58 * N, roof + 0.13 * N, fh, FIG, 0, -1, { hat: true });
    const ta = w.torchA + Math.sin(t * 0.8) * 0.15, tx = J.sx, ty = J.sy;
    if (!duck) {
      r.poly([[tx, ty], [tx - Math.cos(ta - 0.12) * 0.4 * N, ty + Math.sin(ta - 0.12) * 0.4 * N], [tx - Math.cos(ta + 0.12) * 0.4 * N, ty + Math.sin(ta + 0.12) * 0.4 * N]], LMID + DIM);
      r.rect(tx - 2 * u, ty - u, 3 * u, 2 * u, BRIGHT);
    }
    // the rain for a while after a section change: at its terminal speed with a little wind, a tick where it lands
    if (w.rainT > 0) {
      w.rainT -= dt;
      while (w.rain.length < 60) w.rain.push({ x: rnd() * N * 1.2, y: -rnd() * N, land: roof + 0.3 * N * rnd() });
    }
    w.rain = w.rain.filter((d) => {
      d.y += dt * 1.1 * N; d.x -= dt * 0.25 * N;
      if (d.y >= d.land) { r.rect(d.x - u, d.land - u, 2 * u, Math.max(1, u), LMID); d.y = -rnd() * 0.3 * N; d.x = rnd() * N * 1.2; d.land = roof + 0.3 * N * rnd(); return w.rainT > 0; }
      r.line(d.x, d.y, d.x + 0.9 * u, d.y - 4 * u, LMID + DIM);
      return true;
    });
    targets.push({ x: bx, y: by, w: 0.1 * N, h: 0.07 * N });
  },
};

// ---------------------------------------------------------------------------------------------- freeparty
// A forest clearing at night: the rig between the trees, dancers round it hopping on the beat, the lights as the
// kind: car headlights, a van's lamp bar, bikes, or lanterns strung through the trees; dust drifts in the beams.
// A campfire with embers that rise and slow, a generator chugging a puff of smoke every beat. The sky lightens
// a step with every section (dawn arrives); a drop flashes every headlight full on at once.
const LIGHTS = {
  cars: { lamps: [[0.08, 0.6], [0.92, 0.6]], beam: 0.16, fire: 1 },
  vans: { lamps: [[0.1, 0.52], [0.12, 0.56], [0.9, 0.56]], beam: 0.22, fire: 1 },
  bikes: { lamps: [[0.14, 0.64], [0.86, 0.66], [0.2, 0.7]], beam: 0.1, fire: 1.6 },
  lanterns: { lamps: [], beam: 0, fire: 1.3 },
};
const LIGHT_W = { lanterns: [3, 2, 0], cars: [2, 3, 2], vans: [1, 2, 3], bikes: [1, 1, 2] };

const freeparty = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, LIGHT_W, bandOf(W.a)), dawn: 0, flash: 0, embers: [], puffs: [], dust: Array.from({ length: 40 }, () => ({ q: rnd(), s: rnd(), ph: rnd() * TAU })),
      trees: Array.from({ length: 7 }, (_, i) => ({ x: i < 4 ? 0.02 + i * 0.09 : 0.72 + (i - 4) * 0.1, h: 0.5 + rnd() * 0.3, w: 0.05 + rnd() * 0.04 })),
      dancers: Array.from({ length: 10 }, (_, i) => ({ x: 0.3 + (i / 10) * 0.4 + rnd() * 0.03, d: 1 + rnd() * 0.6, ph: rnd(), hj: 0.5 + rnd() * 0.5 })).sort((p, q) => q.d - p.d), bt: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, g = 0.76 * N, bt = beatT(W);
    if (f.section === 'change') { w.kind = rollW(rnd, LIGHT_W, bandOf(W.a)); w.dawn = Math.min(4, w.dawn + 1); }
    if (f.section === 'drop') w.flash = 0.35;
    w.flash -= dt;
    const K = LIGHTS[w.kind];
    for (const h of hits) if (isLow(h)) for (let k = 0; k < 4 * h.strength; k++) w.embers.push({ x: 0.17 * N + (rnd() - 0.5) * 3 * u, y: g - 2 * u, vx: (rnd() - 0.5) * 6 * u, vy: -(14 + rnd() * 10) * u, life: 1.2 + rnd() * 1.5 });
    // dawn: the sky in bands, lighter by a step per section, the ground lit last
    const skyC = [BG, DARK + DIM, DARK, MID + DIM, MID][w.dawn], hzC = [DARK + DIM, DARK, MID + DIM, MID, LMID][w.dawn];
    r.rect(0, 0, N, g, skyC);
    for (let y = 0.5 * N; y < g; y += 2) if (hash(y, 4) < (y - 0.5 * N) / (g - 0.5 * N)) r.rect(0, y, N, 1, hzC);
    if (w.dawn < 2) for (let k = 0; k < 30; k++) r.set(hash(k, 1) * N, hash(k, 2) * 0.5 * N, hash(k, 3) < 0.3 ? LMID : DARK);
    r.rect(0, g, N, N - g, w.dawn > 3 ? DARK : DARK + DIM);
    // the trees: trunks and ragged canopies either side
    for (const tr of w.trees) {
      const x = tr.x * N, top = g - tr.h * N;
      r.rect(x - u, top + 0.1 * N, 2 * u, g - top - 0.1 * N, BLACK);
      for (let k = 0; k < 4; k++) r.poly([[x, top + k * 0.08 * N], [x + tr.w * N * (1 + k * 0.4), top + (k + 1.2) * 0.08 * N], [x - tr.w * N * (1 + k * 0.4), top + (k + 1.2) * 0.08 * N]], BLACK);
    }
    // the rig between the trees, its cones with the bass; lanterns in the trees for that kind
    const push = clamp(f.rel.bassAtt), rx = 0.5 * N, rw = 0.2 * N;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) cab(r, rx - rw / 2 + i * rw * 0.5, g - 0.01 * N - (j + 1) * 0.07 * N, rw * 0.5 - u, 0.07 * N - u, push, u, DARK + DIM, MID + DIM);
    if (w.kind === 'lanterns') for (let k = 0; k < 9; k++) { const x = (0.1 + k * 0.1) * N, y = 0.3 * N + Math.sin(k * 1.7) * 0.05 * N; r.line(x, y - 3 * u, x, y, DARK); r.disc(x, y, 1.6 * u, (k + f.beat.count) % 3 ? HOT : BRIGHT); }
    // the headlights: a body behind each lamp, a beam toward the rig, dust drifting in it; all full on for a moment on a drop
    const beamC = w.flash > 0 ? BRIGHT : LMID + DIM;
    for (const [lx, ly] of K.lamps) {
      const x = lx * N, y = ly * N, dir = x < N / 2 ? 1 : -1, len = Math.abs(rx - x) * 0.95, h0 = K.beam * N;
      r.rect(dir > 0 ? x - 0.08 * N : x, y - 0.04 * N, 0.08 * N, 0.08 * N, BLACK);
      r.poly([[x, y - 1.5 * u], [x, y + 1.5 * u], [x + dir * len, y + h0 * 0.5 + 0.08 * N], [x + dir * len, y - h0 * 0.5 + 0.02 * N]], beamC);
      r.rect(x - 2 * u, y - 2 * u, 4 * u, 4 * u, w.flash > 0 ? WHITE : BRIGHT);
    }
    if (K.lamps.length) for (const d of w.dust) {
      const [lx, ly] = K.lamps[Math.floor(d.s * K.lamps.length)], x0 = lx * N, dir = x0 < N / 2 ? 1 : -1;
      d.q += dt * 0.03 * (1 + f.level);
      if (d.q > 1) d.q -= 1;
      r.rect(x0 + dir * d.q * Math.abs(rx - x0) * 0.95, ly * N + Math.sin(t * 0.6 + d.ph) * 0.03 * N * d.q + d.q * 0.05 * N, Math.max(1, u), Math.max(1, u), BRIGHT);
    }
    // the dancers, far to near, hopping on the beat with their own phase and height
    const drive = 0.4 + 0.6 * clamp(f.rel.bassDrive);
    for (const d of w.dancers) { const h = (0.17 * N) / d.d, base = g + (0.22 * N) / d.d - 0.1 * N; dancer(r, d.x * N, base, h, BLACK, hop(bt, d.ph, d.hj * h * 0.25 * drive), f.beat.pulse > 0.5 && hash((d.x * 100) | 0, f.beat.count) < 0.5); }
    // the campfire: logs, flames that lick with the level, embers that rise and slow
    const fx = 0.17 * N, fy = g - u;
    r.rect(fx - 4 * u, fy - 1.5 * u, 8 * u, 2 * u, DARK);
    for (let k = 0; k < 3; k++) { const fh = (0.05 + 0.04 * f.level * K.fire) * N * (0.7 + 0.3 * hash(k, (t * 12) | 0)); r.poly([[fx - (3 - k) * u, fy - u], [fx + (3 - k) * u, fy - u], [fx + (hash(k, (t * 9) | 0) - 0.5) * 3 * u, fy - fh]], k ? BRIGHT : HOT); }
    w.embers = w.embers.filter((e) => { e.vy = follow(e.vy, -1.5 * u, dt, 1); e.x += e.vx * dt + Math.sin(t * 5 + e.y * 0.1) * u * dt * 6; e.y += e.vy * dt; e.life -= dt; r.rect(e.x, e.y, Math.max(1, u), Math.max(1, u), e.life > 0.8 ? BRIGHT : HOT); return e.life > 0; }).slice(-120);
    // the generator: a box that shivers on the beat, a puff a beat that rises, slows, spreads and thins
    const gx = 0.84 * N, gy = g + 0.04 * N, jit = (f.beat.pulse > 0.3 ? rnd() - 0.5 : 0) * u;
    r.rect(gx - 0.05 * N + jit, gy - 0.06 * N, 0.1 * N, 0.06 * N, DARK + DIM);
    r.frame(gx - 0.05 * N + jit, gy - 0.06 * N, 0.1 * N, 0.06 * N, MID + DIM);
    r.rect(gx + 0.03 * N, gy - 0.09 * N, 1.5 * u, 0.03 * N, MID);
    if (f.beat.on) w.puffs.push({ x: gx + 0.035 * N, y: gy - 0.09 * N, vy: -10 * u, r: u, life: 1.6 });
    w.puffs = w.puffs.filter((p) => { p.vy = follow(p.vy, -1.5 * u, dt, 0.8); p.y += p.vy * dt; p.x += dt * 2 * u; p.r += dt * 2.5 * u; p.life -= dt; r.ring(p.x, p.y, p.r, Math.max(1, u), p.life > 0.6 ? MID + DIM : DARK); return p.life > 0; }).slice(-12);
    targets.push({ x: rx - rw / 2, y: g - 0.22 * N, w: rw, h: 0.22 * N });
  },
};

// ---------------------------------------------------------------------------------------------- basement
// A tiny arched-brick cellar: twenty silhouettes packed under the vault hopping on the beat (cut short where the
// ceiling is low), condensation that gathers on the bricks, falls under gravity and splashes, one strobe on the
// heavy kicks, a lamp on a cord that swings as a pendulum when a kick nudges it, its cone and pool of light going
// with it, a bar of bottles glowing in turn. The kind: one vault, two on a pillar, pipes along the ceiling (the
// drips come off them), a low one. A drop sets the smoke alarm blinking and the strobe on every kick for two bars.
const CELLARS = { vault: { arches: 1, pipes: false, ceil: 0.3 }, double: { arches: 2, pipes: false, ceil: 0.32 }, pipes: { arches: 1, pipes: true, ceil: 0.3 }, low: { arches: 1, pipes: false, ceil: 0.42 } };
const CELLAR_W = { vault: [2, 3, 2], double: [2, 2, 2], pipes: [3, 2, 1], low: [0, 2, 3] };

const basement = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, CELLAR_W, bandOf(W.a)), crowd: Array.from({ length: 20 }, (_, i) => ({ x: 0.1 + (i % 10) * 0.085 + rnd() * 0.04, row: i < 10 ? 1 : 0, ph: rnd(), hj: 0.4 + rnd() * 0.6 })),
      drops: [], splash: [], th: 0.2, om: 0, strobe: 0, alarm: 0, dripT: 0, bt: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bt = beatT(W), floor = 0.9 * N, cx = N / 2;
    if (f.section === 'change') w.kind = rollW(rnd, CELLAR_W, bandOf(W.a));
    if (f.section === 'drop') { w.alarm = 8 * beatS(f); w.om += 1.5; s.shake = Math.max(s.shake, 0.25); }
    const K = CELLARS[w.kind], spring = K.ceil * N + 0.12 * N, Rx = (0.42 * N) / K.arches, Ry = 0.12 * N; // the arches spring from `spring`, their crowns at K.ceil
    const g = 1.6 * N, Lc = 0.13 * N; // one gravity for the drips and the lamp's cord
    for (const h of hits) if (isLow(h)) { if (h.strength > 0.7 || w.alarm > 0) w.strobe = 1; w.om += (hash(f.beat.count, 1) < 0.5 ? -1 : 1) * 0.6 * h.strength; }
    w.alarm -= dt;
    // the lamp on its cord: theta'' = -(g / L) sin(theta) - damping * theta', a kick an impulse on the swing
    const w0 = Math.sqrt(g / Lc);
    w.om += (-w0 * w0 * Math.sin(w.th) - (0.4 + 0.8 * Math.abs(w.om)) * w.om) * dt;
    w.th += w.om * dt;
    const strobe = w.strobe > 0;
    if (strobe) w.strobe--;
    const ink = strobe ? BLACK : DARK + DIM, brick = strobe ? LMID : DARK, mortar = strobe ? BRIGHT : DARK + DIM, room = strobe ? BRIGHT : BG;
    // the brick face in courses, the arches cut out of it as the dark room beyond, a pillar between two
    r.fill(mortar);
    for (let y = 0, j = 0; y < floor; y += 3 * u, j++) for (let x = (j % 2) * -3 * u; x < N; x += 6 * u) r.rect(x + u * 0.5, y + u * 0.5, 5 * u, 2 * u, brick);
    const archY = (x) => { // the ceiling over x: the arch it is under, the spring line between two
      for (let a = 0; a < K.arches; a++) { const ax = cx + (a - (K.arches - 1) / 2) * 2 * Rx, dx = (x - ax) / (Rx * 0.96); if (Math.abs(dx) < 1) return spring - Ry * Math.sqrt(1 - dx * dx); }
      return spring + 2 * u;
    };
    for (let a = 0; a < K.arches; a++) {
      const ax = cx + (a - (K.arches - 1) / 2) * 2 * Rx;
      for (let y = Math.round(spring - Ry); y < floor; y++) { const q = y < spring ? (spring - y) / Ry : 0, hw = Rx * 0.96 * Math.sqrt(Math.max(0, 1 - q * q)); r.rect(ax - hw, y, 2 * hw, 1, room); }
    }
    r.rect(0, floor, N, N - floor, strobe ? LMID : DARK);
    if (K.pipes) for (const py of [K.ceil * N + 0.03 * N, K.ceil * N + 0.07 * N]) { r.rect(0.1 * N, py, 0.8 * N, 2 * u, strobe ? BLACK : MID + DIM); r.rect(0.1 * N, py, 0.8 * N, Math.max(1, u * 0.6), strobe ? BLACK : MID); }
    // the lamp: the cord from the crown, the shade, the cone of light along the cord's line and its pool on the floor
    const px = cx, py = K.ceil * N + 2 * u, sn = Math.sin(w.th), cs = Math.cos(w.th), lx = px + sn * Lc, ly = py + cs * Lc;
    if (!strobe) {
      const fx = lx + (sn / cs) * (floor - ly);
      r.poly([[lx - 3 * u * cs, ly + 3 * u * sn], [lx + 3 * u * cs, ly - 3 * u * sn], [fx + 0.2 * N, floor], [fx - 0.2 * N, floor]], MID + DIM);
      r.ring(fx, floor, 0.1 * N, 0.08 * N, LMID + DIM, 0.25);
    }
    r.line(px, py, lx, ly, strobe ? BLACK : MID);
    r.poly([[lx - 4 * u * cs, ly + 4 * u * sn], [lx + 4 * u * cs, ly - 4 * u * sn], [lx + 1.5 * u * cs - 3 * u * sn, ly - 1.5 * u * sn - 3 * u * cs], [lx - 1.5 * u * cs - 3 * u * sn, ly + 1.5 * u * sn - 3 * u * cs]], strobe ? BLACK : DARK);
    r.disc(lx + sn * 1.5 * u, ly + cs * 1.5 * u, 1.5 * u, strobe ? LMID : BRIGHT);
    // the smoke alarm by the crown, blinking after a drop
    r.disc(px + 0.1 * N, K.ceil * N + 3 * u, 2 * u, strobe ? BLACK : MID + DIM);
    r.rect(px + 0.1 * N - u, K.ceil * N + 2.5 * u, 2 * u, Math.max(1, u), w.alarm > 0 && ((t * 8) | 0) % 2 ? HOT : DARK + DIM);
    // the bar on the right: a counter, a shelf of bottles glowing in turn on the beat
    r.rect(0.78 * N, floor - 0.12 * N, 0.2 * N, 0.12 * N, strobe ? BLACK : DARK + DIM);
    r.rect(0.78 * N, floor - 0.12 * N, 0.2 * N, 2 * u, strobe ? BLACK : MID + DIM);
    for (let k = 0; k < 6; k++) { const bx = 0.8 * N + k * 0.03 * N, c = [COOL, HOT, BRIGHT][k % 3]; r.rect(bx, floor - 0.19 * N, 2 * u, 0.06 * N, (k + f.beat.count) % 3 === 0 ? c : c + DIM); r.rect(bx + u * 0.5, floor - 0.21 * N, Math.max(1, u), 0.02 * N, DARK); }
    // the crowd under the vault, the far row first: a hop on the beat, cut short where the ceiling is low
    const drive = 0.4 + 0.6 * clamp(f.rel.bassDrive);
    for (const c of w.crowd) {
      const x = c.x * N, h = c.row ? 0.19 * N : 0.24 * N, base = c.row ? floor - 0.05 * N : floor + 0.01 * N, top = archY(x);
      const jump = Math.min(hop(bt, c.ph, c.hj * h * 0.25 * drive), Math.max(0, base - h * 1.12 - top));
      dancer(r, x, base, h, ink, jump, f.beat.pulse > 0.5 && hash((c.x * 100) | 0, f.beat.count) < 0.5);
    }
    // condensation: a drop gathers on the ceiling (or a pipe) for a second, then falls under gravity and splashes
    if ((w.dripT += dt) > 1.6 - f.level) { w.dripT = 0; const x = 0.1 * N + rnd() * 0.8 * N; w.drops.push({ x, y: K.pipes ? K.ceil * N + 0.07 * N + 2 * u : archY(x), vy: 0, grow: 0 }); }
    const wet = strobe ? COOL : LMID;
    w.drops = w.drops.filter((d) => {
      if (d.grow < 1) { d.grow += dt; r.disc(d.x, d.y + d.grow * u, 0.6 * u + d.grow * 0.7 * u, wet); return true; }
      d.y += (d.vy + 0.5 * g * dt) * dt; d.vy += g * dt; // the exact fall step
      if (d.y >= floor) { burst(w.splash, rnd, d.x, floor, 3, 0.12 * N, wet, 0.3); return false; }
      r.rect(d.x - u * 0.5, d.y - 1.5 * u, Math.max(1, u), 2 * u, wet);
      return true;
    }).slice(-30);
    w.splash = particles(W, w.splash, wet);
    targets.push({ x: lx - 0.05 * N, y: ly - 0.05 * N, w: 0.1 * N, h: 0.1 * N });
  },
};

// ---------------------------------------------------------------------------------------------- crates
// Crate digging: a crate of records, the front sleeve folded forward on every beat (down about its bottom edge,
// its art foreshortening away, the next one behind it showing), a hand that pulls one out on a snare and carries
// it to the test deck, where the disc goes on the platter and turns at 33 under the arm; dust motes adrift in a
// sunbeam, a wall of sleeves behind, a plain dot for a price tag. The kind: a shop, a market table under the sky,
// an attic under a bulb, a listening booth with the big deck. A drop: the one on top is a rare one and glows.
const SHOPS = { shop: { wall: true, sun: true, bulb: false, sky: false }, market: { wall: false, sun: false, bulb: false, sky: true }, attic: { wall: true, sun: false, bulb: true, sky: false }, booth: { wall: true, sun: true, bulb: false, sky: false, big: true } };
const SHOP_W = { attic: [3, 2, 1], shop: [2, 3, 2], market: [2, 2, 2], booth: [0, 2, 3] };
const ART = [HOT, COOL, LMID, BRIGHT, MID];
// a sleeve standing on `yb`, sz wide and sz * sy tall (sy < 1 as it folds down): a ground, one shape, a frame, maybe the price dot
function sleeve(r, x, yb, sz, seed, sy = 1, glow = false) {
  if (sy < 0.05) return;
  const a = (hash(seed, 1) * 5) | 0, b = hash(seed, 2), c = hash(seed, 3), top = yb - sz * sy;
  r.rect(x, top, sz, sz * sy, glow ? HOT : ART[a]);
  const ink = glow ? BRIGHT : ART[(a + 1 + ((b * 3) | 0)) % 5];
  if (c < 0.33) r.rect(x + sz * 0.1, top + sz * sy * (0.2 + b * 0.5), sz * 0.8, sz * 0.18 * sy, ink);
  else if (c < 0.66) r.ring(x + sz * (0.3 + b * 0.4), top + sz * sy * 0.5, sz * 0.125, sz * 0.25, ink, sy);
  else r.rect(x + sz * (0.15 + b * 0.3), top + sz * sy * 0.15, sz * 0.35, sz * 0.7 * sy, ink);
  r.frame(x, top, sz, sz * sy, DARK + DIM);
  if (hash(seed, 4) < 0.4) r.disc(x + sz * 0.85, top + sz * sy * 0.15, Math.max(1, sz * 0.05), BRIGHT);
}

const crates = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, SHOP_W, bandOf(W.a)), front: Math.floor(rnd() * 1000), flip: 0, flipped: 0, pull: null, disc: null, ang: 0, arm: 0, rare: 0, thump: 0,
      motes: Array.from({ length: 30 }, () => ({ q: rnd(), p: rnd(), ph: rnd() * TAU })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W;
    if (f.section === 'change') w.kind = rollW(rnd, SHOP_W, bandOf(W.a));
    if (f.section === 'drop') w.rare = 8 * beatS(f);
    w.rare -= dt;
    const K = SHOPS[w.kind], floor = 0.92 * N, cx0 = 0.3 * N, cw = 0.3 * N, ch = 0.2 * N, ctop = floor - ch, sz = cw * 0.8, fy = ctop + 0.6 * ch; // the crate, the sleeves' feet inside it
    const dR = (K.big ? 0.13 : 0.1) * N, dx = 0.76 * N, dy = 0.3 * N; // the test deck
    for (const h of hits) {
      if (h.kind === 'snare' && !w.pull && w.flip <= 0) { w.pull = { t: 0, seed: w.front }; w.front++; }
      else if (isLow(h)) w.thump = 1;
    }
    w.thump *= Math.exp(-dt * 12);
    // one sleeve a beat folds forward about its bottom edge; when it is flat the next one is the front
    if (f.beat.on && w.flip <= 0 && !w.pull) w.flip = 1e-3;
    if (w.flip > 0) { w.flip += dt / 0.25; if (w.flip >= 1) { w.flip = 0; w.front++; w.flipped++; } }
    // the room: a wall of sleeves and the sunbeam, a market's sky, an attic's bulb
    if (K.sky) { r.rect(0, 0, N, 0.5 * N, DARK + DIM); r.rect(0, 0.5 * N, N, floor - 0.5 * N, DARK); r.rect(0.08 * N, 0.5 * N, 0.84 * N, 2 * u, MID + DIM); }
    else r.rect(0, 0, N, floor, DARK + DIM);
    if (K.wall) for (let j = 0; j < 3; j++) { for (let i = 0; i < 7; i++) sleeve(r, 0.08 * N + i * 0.12 * N, 0.08 * N + (j + 1) * 0.12 * N, 0.1 * N, 7 + i + j * 7); r.rect(0.06 * N, 0.08 * N + (j + 1) * 0.12 * N, 0.88 * N, Math.max(1, u), MID + DIM); }
    if (K.sun) r.poly([[0, 0], [0.22 * N, 0], [0.75 * N, floor], [0.4 * N, floor]], LMID + DIM);
    if (K.bulb) { r.line(0.5 * N, 0, 0.5 * N, 0.1 * N, MID); r.disc(0.5 * N, 0.11 * N, 2 * u, BRIGHT); r.poly([[0.5 * N - 2 * u, 0.11 * N], [0.5 * N + 2 * u, 0.11 * N], [0.8 * N, floor], [0.2 * N, floor]], LMID + DIM); }
    r.rect(0, floor, N, N - floor, DARK);
    // dust motes adrift in the light: settling very slowly, wandering sideways, jolted when the crate is thumped
    const beam = K.sun ? (q, p) => [lerp(p * 0.22 * N, 0.4 * N + p * 0.35 * N, q), q * floor] : K.bulb ? (q, p) => [lerp(0.5 * N + (p - 0.5) * 4 * u, 0.2 * N + p * 0.6 * N, q), lerp(0.11 * N, floor, q)] : null;
    if (beam) for (const m of w.motes) {
      m.q += dt * (0.008 + 0.01 * f.level) + w.thump * dt * 0.3 * (hash((m.ph * 100) | 0, 1) - 0.5);
      m.p += dt * 0.02 + Math.sin(t * 0.7 + m.ph) * dt * 0.03;
      m.q -= Math.floor(m.q); m.p -= Math.floor(m.p);
      const [x, y] = beam(m.q, m.p);
      r.rect(x, y, Math.max(1, u), Math.max(1, u), BRIGHT);
    }
    // the crate: the edges of the sleeves behind, the front one (folding on the beat), the front panel, the flipped pile leaning on it
    const jolt = w.thump * u, glow = w.rare > 0;
    r.rect(cx0, ctop - jolt, cw, ch, MID + DIM);
    for (let k = 4; k >= 1; k--) r.rect(cx0 + cw * 0.1 + k * u, fy - sz * (1 + k * 0.02) - jolt, sz, 2 * u, k % 2 ? DARK : MID);
    sleeve(r, cx0 + cw * 0.1 + u, fy - 2 * u - jolt, sz, w.front + 1); // the one behind the front
    const sy = w.flip > 0 ? Math.cos((w.flip * Math.PI) / 2) : 1;
    sleeve(r, cx0 + cw * 0.1, fy - jolt, sz, w.front, sy, glow && !w.pull);
    if (glow && !w.pull && sy > 0.5) r.frame(cx0 + cw * 0.1 - 2 * u, fy - jolt - sz * sy - 2 * u, sz + 4 * u, sz * sy + 4 * u, f.beat.pulse > 0.5 ? BRIGHT : HOT);
    if (!w.pull) targets.push({ x: cx0 + cw * 0.1, y: fy - jolt - sz, w: sz, h: sz });
    r.rect(cx0, ctop + 0.1 * ch - jolt, cw, ch * 0.9, DARK);
    r.frame(cx0, ctop + 0.1 * ch - jolt, cw, ch * 0.9, MID + DIM);
    for (let k = 0; k < w.flipped % 9; k++) r.rect(cx0 + cw * 0.08, ctop + 0.1 * ch - jolt - (k + 1) * 1.2 * u, cw * 0.84, Math.max(1, u * 0.7), k % 2 ? LMID : MID);
    // the test deck: the platter, the record on it turning at 33 with the arm down, the sleeve it came from laid beside it
    const omega = (33.333 / 60) * TAU;
    r.rect(dx - dR * 1.4, dy - dR * 1.3, dR * 2.8, dR * 2.6, DARK);
    r.disc(dx, dy, dR * 1.05, MID + DIM);
    w.arm = follow(w.arm, w.disc ? 1 : 0, dt, 0.4);
    if (w.disc) {
      w.ang += omega * dt;
      r.disc(dx, dy, dR, DARK + DIM);
      for (let k = 0; k < 3; k++) rim(r, dx, dy, dR * (0.5 + k * 0.14), DARK, u * 0.7);
      r.disc(dx, dy, dR * 0.3, ART[(hash(w.disc.seed, 1) * 5) | 0]);
      r.rect(dx + Math.cos(w.ang) * dR * 0.18 - u, dy + Math.sin(w.ang) * dR * 0.18 - u, 2 * u, 2 * u, BG);
      r.rect(dx - dR * 1.3, dy + dR * 1.15, sz * 0.8, 2 * u, ART[(hash(w.disc.seed, 1) * 5) | 0]);
    }
    r.disc(dx, dy, 0.6 * u + 0.5, LMID);
    const pvx = dx + dR * 1.15, pvy = dy - dR * 1.1, sx = lerp(pvx, dx + dR * 0.65, w.arm), sy2 = lerp(dy + dR * 0.6, dy + dR * 0.25, w.arm);
    r.disc(pvx, pvy, 2.5 * u, MID);
    r.stroke(pvx, pvy, sx, sy2, Math.max(1, u), w.arm > 0.5 ? LMID : LMID + DIM);
    r.rect(sx - 1.5 * u, sy2 - u, 3 * u, 2 * u, LMID);
    if (K.big) { r.ring(dx + dR * 1.9, dy - dR * 0.4, dR * 0.4, 1.5 * u, FIG, 1.1); for (const k of [-1, 1]) r.rect(dx + dR * 1.9 + k * dR * 0.42 - 1.5 * u, dy - dR * 0.4 - u, 3 * u, 4 * u, FIG); } // headphones on their hook
    // the hand: it lifts the front sleeve out, carries it to the deck, and the disc is on the platter
    if (w.pull) {
      const P = w.pull, q = (P.t += dt), lift = Math.min(1, q / 0.4), carry = clamp((q - 0.4) / 0.5);
      const hx = lerp(cx0 + cw * 0.1, dx - dR * 1.3, carry), hy = lerp(fy - lift * (sz + 0.04 * N), dy + dR * 1.15, carry);
      if (q < 0.9) {
        sleeve(r, hx, hy, sz, P.seed, 1, glow);
        if (glow) r.frame(hx - 2 * u, hy - sz - 2 * u, sz + 4 * u, sz + 4 * u, f.beat.pulse > 0.5 ? BRIGHT : HOT);
        hand(r, hx + sz * 0.5, hy - sz - 2 * u, 2.5 * u, 0, 1, FIG);
        r.stroke(hx + sz * 0.5, hy - sz - 2 * u, hx + sz * 0.5 + 0.1 * N, 0, 3 * u, FIG);
        targets.push({ x: hx, y: hy - sz, w: sz, h: sz });
      } else { w.disc = { seed: P.seed }; w.pull = null; }
    }
  },
};

// ---------------------------------------------------------------------------------------------- tapedeck
// A dual cassette deck: the reels turn at the tape's one linear speed, so the supply reel spins up as its pack
// shrinks and the take-up slows as its grows (omega = v / r, pack areas conserved), auto-reversing at the end; VU
// needles on under-damped ballistics bounce with the low and high bands (led ladders on the cheaper decks); the
// counter wheels roll with the tape, the higher ones only as the one below passes nine; the record led lights on
// the second deck while it dubs (a section change starts and stops it). A drop is a pause: the reels stop for a
// beat, then come back with a wow and a flutter that die away.
const DECKS = { walkman: { n: 1, meter: 'led', scale: 1.2 }, hifi: { n: 2, meter: 'needle', scale: 1 }, boombox: { n: 2, meter: 'led', scale: 1.1 }, studio: { n: 2, meter: 'needle', scale: 0.9, counters: 2 } };
const DECK_W = { walkman: [3, 1, 0], hifi: [2, 3, 1], boombox: [1, 2, 3], studio: [1, 2, 2] };
// a meter: the face, the arc of ticks (the last two hot), the needle from its pivot at angle -0.75..0.75 for x 0..1
function meter(r, x, y, mw, mh, v, u) {
  r.rect(x, y, mw, mh, LMID + DIM);
  r.frame(x, y, mw, mh, DARK);
  const px = x + mw / 2, py = y + mh * 0.95, len = mh * 0.8;
  for (let k = 0; k <= 6; k++) { const a = -0.75 + (k / 6) * 1.5; r.rect(px + Math.sin(a) * len - u * 0.5, py - Math.cos(a) * len, Math.max(1, u), 2 * u, k >= 5 ? HOT : DARK); }
  const a = -0.75 + clamp(v) * 1.5;
  r.line(px, py, px + Math.sin(a) * len * 0.95, py - Math.cos(a) * len * 0.95, FIG);
  r.disc(px, py, 1.5 * u, DARK);
}
// the mark of a counter digit on a wheel: one to three blocks and a bar, never a numeral; clipped to the window y0..y1
function clipRect(r, x, y, ww, hh, c, y0, y1) { const a = Math.max(y, y0), b = Math.min(y + hh, y1); if (b > a) r.rect(x, a, ww, b - a, c); }
function digitMark(r, x, y, ww, hh, d, c, y0, y1) {
  const n = 1 + (d % 3), bw = (ww * 0.8) / 3;
  for (let k = 0; k < n; k++) clipRect(r, x + ww * 0.1 + k * bw + bw * 0.2, y + hh * 0.3, Math.max(1, bw * 0.6), hh * 0.4, c, y0, y1);
  if (d >= 3) clipRect(r, x + ww * 0.1, y + hh * (d >= 6 ? 0.12 : 0.78), ww * 0.8, Math.max(1, hh * 0.1), c, y0, y1);
}

const tapedeck = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, DECK_W, bandOf(W.a)), decks: [{ frac: 0.15 + rnd() * 0.5, dir: 1, angS: 0, angT: 0, run: true }, { frac: 0.05 + rnd() * 0.2, dir: 1, angS: 0, angT: 0, run: false }],
      vu: [{ x: 0, v: 0 }, { x: 0, v: 0 }], peak: new Float32Array(2), pause: 0, wob: -1, dub: false, kick: 0, snare: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, B = b10(f);
    if (f.section === 'change') { w.kind = rollW(rnd, DECK_W, bandOf(W.a)); w.dub = !w.dub; }
    if (f.section === 'drop') { w.pause = beatS(f); w.wob = -1; }
    const K = DECKS[w.kind];
    for (const h of hits) { if (isLow(h)) w.kick = h.strength; else if (h.kind === 'snare') w.snare = h.strength; }
    w.kick *= Math.exp(-dt * 10); w.snare *= Math.exp(-dt * 10);
    // the transport: stopped through a pause, then a wow (slow) and a flutter (fast) that die away over a few seconds
    let mul = 1;
    if (w.pause > 0) { w.pause -= dt; mul = 0; if (w.pause <= 0) w.wob = 0; }
    else if (w.wob >= 0) { w.wob += dt; mul = 1 + 0.28 * Math.sin(TAU * 0.7 * w.wob) * Math.exp(-w.wob / 1.2) + 0.06 * Math.sin(TAU * 7 * w.wob) * Math.exp(-w.wob / 0.8); if (w.wob > 4) w.wob = -1; }
    w.decks[1].run = w.dub;
    // the reels: pack radii from the tape on each side (areas conserved), the tape's linear speed from the side's
    // length and the tape's thickness, omega = v / r on each hub
    const rh = 0.022 * N * K.scale, Rf = 0.055 * N * K.scale, F = 1 / (64 * beatS(f)), tau = 0.002 * N, v = (F * (Rf * Rf - rh * rh) * Math.PI) / tau;
    const packs = (d) => [Math.sqrt(rh * rh + (1 - d.frac) * (Rf * Rf - rh * rh)), Math.sqrt(rh * rh + d.frac * (Rf * Rf - rh * rh))];
    for (const d of w.decks) {
      if (!d.run) continue;
      d.frac += F * mul * dt * d.dir;
      if (d.frac >= 1) { d.frac = 1; d.dir = -1; } else if (d.frac <= 0) { d.frac = 0; d.dir = 1; } // auto-reverse at the end
      const [rS, rT] = packs(d);
      d.angS -= ((v * mul * d.dir) / rS) * dt; d.angT -= ((v * mul * d.dir) / rT) * dt; // the tape runs along the bottom, so going forward both hubs turn anticlockwise
    }
    // the VU: left on the low bands, right on the high, the needles on their ballistics, a peak that falls back
    const tl = clamp(0.5 * f.level + 0.5 * Math.max(B[1], B[2], B[3]) + 0.4 * w.kick), tr = clamp(0.5 * f.level + 0.5 * Math.max(B[6], B[7], B[8]) + 0.4 * w.snare);
    vuStep(w.vu[0], tl, dt); vuStep(w.vu[1], tr, dt);
    w.peak[0] = Math.max(tl, w.peak[0] - dt * 0.6); w.peak[1] = Math.max(tr, w.peak[1] - dt * 0.6);
    // the face, the meters along the top
    r.rect(0.04 * N, 0.1 * N, 0.92 * N, 0.8 * N, MID + DIM);
    r.frame(0.04 * N, 0.1 * N, 0.92 * N, 0.8 * N, LMID + DIM);
    if (K.meter === 'needle') for (let k = 0; k < 2; k++) meter(r, (0.08 + k * 0.24) * N, 0.14 * N, 0.21 * N, 0.14 * N, w.vu[k].x, u);
    else for (let k = 0; k < 2; k++) for (let i = 0; i < 12; i++) { const on = i < (k ? tr : tl) * 12, pk = i === Math.floor(w.peak[k] * 11.99); r.rect((0.08 + i * 0.035) * N, (0.15 + k * 0.05) * N, 0.025 * N, 0.03 * N, pk ? HOT : on ? (i >= 9 ? HOT : i >= 6 ? LMID : COOL) : DARK + DIM); }
    // the counters: the count from the tape run, each wheel a window with its mark rolling up as the wheel turns
    const nC = K.counters || 1;
    for (let c = 0; c < nC; c++) {
      const d = w.decks[Math.min(c, K.n - 1)], count = d.frac * 999, x0 = (0.6 + c * 0.17) * N, y0 = (0.15 + (nC > 1 ? 0 : 0.03)) * N, ww = 0.04 * N, hh = 0.06 * N;
      const p0 = count % 10, d0 = Math.floor(p0), r0 = p0 - d0, d1 = Math.floor(count / 10) % 10, r1 = d0 === 9 ? r0 : 0, d2 = Math.floor(count / 100) % 10, r2 = d0 === 9 && d1 === 9 ? r0 : 0;
      [[d2, r2], [d1, r1], [d0, r0]].forEach(([dg, roll], k) => {
        const x = x0 + k * (ww + u), y = y0;
        r.rect(x, y, ww, hh, BLACK);
        digitMark(r, x, y - roll * hh, ww, hh, dg, LMID, y, y + hh); // this digit rolling up out of the window
        if (roll > 0) digitMark(r, x, y + (1 - roll) * hh, ww, hh, (dg + 1) % 10, LMID, y, y + hh); // the next one coming up from below
        r.frame(x, y, ww, hh, DARK);
      });
    }
    // the windows: the cassette, the reels, the tape over the guides and the head, the lamps
    const ww = K.n === 1 ? 0.5 * N : 0.4 * N, wh = 0.28 * N, wy = 0.4 * N;
    w.decks.slice(0, K.n).forEach((d, i) => {
      const wx = K.n === 1 ? 0.25 * N : (0.08 + i * 0.44) * N, cxl = wx + ww * 0.3, cxr = wx + ww * 0.7, cy = wy + wh * 0.42, [rS, rT] = packs(d);
      r.rect(wx, wy, ww, wh, DARK);
      r.frame(wx, wy, ww, wh, DARK + DIM);
      r.rect(wx + ww * 0.08, wy + wh * 0.1, ww * 0.84, wh * 0.62, DARK + DIM);
      r.rect(wx + ww * 0.12, wy + wh * 0.14, ww * 0.76, wh * 0.1, LMID + DIM);
      const [xS, xT] = d.dir > 0 ? [cxl, cxr] : [cxr, cxl], rL = d.dir > 0 ? rS : rT, rR = d.dir > 0 ? rT : rS;
      r.disc(xS, cy, rS, DARK); r.disc(xT, cy, rT, DARK);
      r.ring(xS, cy, rS, Math.max(1, u * 0.6), MID + DIM); r.ring(xT, cy, rT, Math.max(1, u * 0.6), MID + DIM);
      for (const [x, ang] of [[xS, d.angS], [xT, d.angT]]) { r.disc(x, cy, rh, MID); for (let k = 0; k < 3; k++) { const a = ang + (k * Math.PI) / 3; r.line(x - Math.cos(a) * rh * 0.8, cy - Math.sin(a) * rh * 0.8, x + Math.cos(a) * rh * 0.8, cy + Math.sin(a) * rh * 0.8, BG); } }
      const gy = wy + wh * 0.84;
      r.line(cxl, cy + rL, wx + ww * 0.16, gy, LMID + DIM);
      r.line(wx + ww * 0.16, gy, wx + ww * 0.84, gy, LMID + DIM);
      r.line(wx + ww * 0.84, gy, cxr, cy + rR, LMID + DIM);
      r.rect(wx + ww * 0.44, gy - 2 * u, ww * 0.12, 2 * u, MID); // the head
      r.disc(wx + ww * 0.7, gy + 2 * u, 1.5 * u, LMID); // the capstan and the pinch roller
      r.disc(wx + ww * 0.78, gy + 2.5 * u, 2 * u, MID);
      // the lamps under the window: play, pause, record (the dubbing deck)
      const ly = wy + wh + 3 * u;
      r.rect(wx + 2 * u, ly, 3 * u, 2 * u, d.run && w.pause <= 0 ? COOL : DARK + DIM);
      r.rect(wx + 7 * u, ly, 3 * u, 2 * u, w.pause > 0 ? BRIGHT : DARK + DIM);
      r.rect(wx + 12 * u, ly, 3 * u, 2 * u, (i === 1 || K.n === 1) && w.dub && w.pause <= 0 ? HOT : DARK + DIM);
      for (let k = 0; k < 6; k++) r.rect(wx + ww - (k + 1) * 5 * u, ly - u, 4 * u, 4 * u, MID); // the transport keys
      targets.push({ x: wx, y: wy, w: ww, h: wh });
    });
    r.disc(0.92 * N, 0.14 * N, 1.5 * u, f.beat.pulse > 0.5 ? BRIGHT : LMID + DIM); // the power lamp winks on the beat
  },
};

// ---------------------------------------------------------------------------------------------- modular
// A modular synth wall: rows of modules with knobs, jacks and leds blinking with the bands, patch cables hanging
// in loops between the jacks (a parabola stands for the catenary) that sway as pendulums of their own sag when
// the hand re-patches one on a section change, a sequencer row stepping two to the beat, a scope module drawing
// the waveform. The kind: a suitcase of one row, two rows of big panels, a euro rack of three, a wall of four. A
// drop flashes every led and yanks a cable, which swings from its one jack until the hand plugs it back.
const RACKS = { suitcase: { rows: 1, cols: 5, big: true }, big: { rows: 2, cols: 4, big: true }, euro: { rows: 3, cols: 6, big: false }, wall: { rows: 4, cols: 7, big: false } };
const RACK_W = { suitcase: [3, 2, 0], big: [2, 2, 2], euro: [1, 3, 2], wall: [0, 1, 3] };
const CABLE_C = [HOT, COOL, BRIGHT, LMID];
function buildRack(w, rnd, N, u) {
  const K = RACKS[w.kind], x0 = 0.04 * N, y0 = 0.06 * N, mw = (0.92 * N) / K.cols, mh = (0.88 * N) / K.rows, mods = [], jacks = [];
  for (let j = 0; j < K.rows; j++) for (let i = 0; i < K.cols; i++) {
    const x = x0 + i * mw, y = y0 + j * mh, n = j * K.cols + i, m = { x, y, w: mw, h: mh, knobs: [], leds: [], jacks: [], role: 'plain' };
    if (j === K.rows - 1 && i === 0) m.role = 'seq'; else if (j === 0 && i === K.cols - 1) m.role = 'scope';
    if (m.role === 'plain') {
      const nk = K.big ? 4 : 2 + ((hash(n, 1) * 3) | 0);
      for (let k = 0; k < nk; k++) m.knobs.push({ x: x + mw * (0.28 + 0.44 * (k % 2)), y: y + mh * (0.24 + 0.22 * Math.floor(k / 2)), a: hash(n, k + 20) * 4.5 - 2.25, r: (K.big ? 3.2 : 2.2) * u });
      for (let k = 0; k < 2; k++) m.leds.push({ x: x + mw * (0.25 + 0.5 * k), y: y + mh * 0.1, band: (hash(n, k + 30) * 10) | 0, thr: 0.25 + hash(n, k + 40) * 0.45 });
    }
    const nj = m.role === 'scope' ? 2 : 4;
    for (let k = 0; k < nj; k++) m.jacks.push({ x: x + mw * (k * 0.22 + 0.17), y: y + mh * (m.role === 'seq' ? 0.9 : 0.82) });
    mods.push(m); jacks.push(...m.jacks);
  }
  const cables = [];
  for (let k = 0; k < 4 + K.rows * 2; k++) { const a = pick(rnd, jacks), b = pick(rnd, jacks); if (a !== b) cables.push({ a, b, col: CABLE_C[k % 4], slack: 0.03 * N + rnd() * 0.06 * N, sw: 0, sa: rnd() * TAU, yank: null }); }
  Object.assign(w, { mods, jacks, cables, N });
}

const modular = {
  init(W) {
    const { w, rnd, N, u } = W;
    w.kind = rollW(rnd, RACK_W, bandOf(W.a));
    buildRack(w, rnd, N, u);
    Object.assign(w, { handT: 0, hx: 0, hy: 0, flashAll: 0, bt: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, B = b10(f), bt = beatT(W), g = 6 * N; // cells per second squared: the wall is a metre and a half tall
    if (w.N !== N) buildRack(w, rnd, N, u);
    if (f.section === 'change') { // a new rack now and then; the hand re-patches a cable (the yanked one first) and the loops sway
      if (rnd() < 0.4) { w.kind = rollW(rnd, RACK_W, bandOf(W.a)); buildRack(w, rnd, N, u); }
      const c = w.cables.find((q) => q.yank) || pick(rnd, w.cables);
      if (c) { c.yank = null; c.b = pick(rnd, w.jacks); c.sw = 4 * u; c.sa = 0; w.handT = 0.6; w.hx = c.b.x; w.hy = c.b.y; for (const o of w.cables) if (o !== c) o.sw = Math.max(o.sw, 1.2 * u); }
    }
    if (f.section === 'drop') {
      w.flashAll = 0.07;
      const loose = w.cables.filter((q) => !q.yank), c = loose.length ? pick(rnd, loose) : null;
      if (c) c.yank = { th: (rnd() < 0.5 ? -1 : 1) * 1.3, om: 0, L: Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y) + c.slack * 2 };
    }
    for (const h of hits) if (isLow(h) && h.strength > 0.6) for (const c of w.cables) if (c.yank) c.yank.om += (rnd() - 0.5) * 2; // a heavy kick shakes the hanging one
    // the panels: knobs, leds on their bands, jacks; the sequencer and the scope
    r.rect(0, 0, N, N, DARK + DIM);
    for (const m of w.mods) {
      r.rect(m.x + u * 0.5, m.y + u * 0.5, m.w - u, m.h - u, DARK);
      r.frame(m.x + u * 0.5, m.y + u * 0.5, m.w - u, m.h - u, MID + DIM);
      for (const k of m.knobs) { r.disc(k.x, k.y, k.r, MID); r.line(k.x, k.y, k.x + Math.cos(k.a - Math.PI / 2) * k.r, k.y + Math.sin(k.a - Math.PI / 2) * k.r, BRIGHT); }
      for (const l of m.leds) r.rect(l.x - u, l.y - u, 2 * u, 2 * u, w.flashAll > 0 || B[l.band] > l.thr ? (l.band < 3 ? HOT : COOL) : DARK + DIM);
      for (const j of m.jacks) { r.disc(j.x, j.y, 1.8 * u, LMID + DIM); r.disc(j.x, j.y, 0.9 * u, BLACK); }
      if (m.role === 'seq') { // eight steps, two to the beat: the running one bright, the gated ones lit
        const step = Math.floor(bt * 2) % 8;
        for (let k = 0; k < 8; k++) { const sx = m.x + m.w * (0.1 + k * 0.1125), sy = m.y + m.h * 0.5; r.disc(sx, sy - m.h * 0.2, 1.6 * u, MID); r.rect(sx - u, sy - u, 2 * u, 2 * u, k === step || w.flashAll > 0 ? BRIGHT : hash(k, 77) < 0.6 ? LMID + DIM : DARK + DIM); }
      } else if (m.role === 'scope') { // a small screen with the waveform
        const sx = m.x + m.w * 0.1, sy = m.y + m.h * 0.12, sw = m.w * 0.8, sh = m.h * 0.5, wv = f.wave;
        r.rect(sx, sy, sw, sh, BLACK);
        let ly = sy + sh / 2;
        for (let x = sx; x < sx + sw; x += 1) { const q = (x - sx) / sw, v = wv?.length ? wv[Math.floor(q * wv.length)] : Math.sin(q * TAU * 2 + f.rel.midClock) * 0.4 * f.level; const y = sy + sh / 2 - clamp(v, -1, 1) * sh * 0.45; r.line(x - 1, ly, x, y, COOL); ly = y; }
      }
    }
    w.flashAll -= dt;
    // the cables: a loop between two jacks swaying as a pendulum of its sag; a yanked one hangs from its one jack,
    // theta'' = -(g / L) sin(theta) - damping, bowing a little with the swing
    for (const c of w.cables) {
      c.sw *= Math.exp(-dt / 1.5);
      if (c.yank) {
        const Y = c.yank;
        Y.om += (-(g / Y.L) * Math.sin(Y.th) - 0.4 * Y.om) * dt; Y.th += Y.om * dt;
        const ex = c.a.x + Math.sin(Y.th) * Y.L, ey = c.a.y + Math.cos(Y.th) * Y.L, bow = Y.om * 0.02 * Y.L;
        let px = c.a.x, py = c.a.y;
        for (let k = 1; k <= 8; k++) { const q = k / 8, x = lerp(c.a.x, ex, q) - bow * 4 * q * (1 - q), y = lerp(c.a.y, ey, q); r.stroke(px, py, x, y, 1.4 * u, c.col); px = x; py = y; }
        r.disc(c.a.x, c.a.y, 1.6 * u, c.col);
        r.rect(ex - 1.5 * u, ey - 1.5 * u, 3 * u, 3 * u, LMID);
        continue;
      }
      const sag = Math.abs(c.b.x - c.a.x) * 0.1 + c.slack, w0 = Math.sqrt(g / Math.max(2 * u, sag));
      c.sa += w0 * dt;
      const dx = Math.sin(c.sa) * c.sw;
      let px = c.a.x, py = c.a.y;
      for (let k = 1; k <= 10; k++) { const q = k / 10, bell = 4 * q * (1 - q), x = lerp(c.a.x, c.b.x, q) + dx * bell, y = lerp(c.a.y, c.b.y, q) + sag * bell; r.stroke(px, py, x, y, 1.4 * u, c.col); px = x; py = y; }
      r.disc(c.a.x, c.a.y, 1.6 * u, c.col); r.disc(c.b.x, c.b.y, 1.6 * u, c.col);
    }
    if ((w.handT -= dt) > 0) { hand(r, w.hx, w.hy + 7 * u, 3 * u, 0, -1, FIG); r.stroke(w.hx, w.hy + 9 * u, w.hx + 0.08 * N, N, 3.5 * u, FIG); }
    const sq = w.mods.find((m) => m.role === 'seq');
    if (sq) targets.push({ x: sq.x, y: sq.y, w: sq.w, h: sq.h });
  },
};

// ---------------------------------------------------------------------------------------------- lathe
// A dubplate lathe from above: the lacquer turning at 33 or 45 on its platter, the cutting head on its rail
// working inward one groove pitch a turn (the cut part matte behind it, its grooves growing), swarf curling off the
// stylus into the suction tube, a VU on needle ballistics, a listener in headphones nodding on the beat. The kind:
// a seven-inch at 45, a twelve at 33, a mono head, a stereo pair of meters. A drop lifts the disc, turns it over
// about its vertical axis (its width going to nothing and back) and sets it down for a new side; a section change
// changes the groove pitch, so the head goes in faster or slower.
const LATHES = { seven: { R: 0.22, rpm: 45, meters: 1 }, twelve: { R: 0.3, rpm: 33.333, meters: 1 }, mono: { R: 0.27, rpm: 33.333, meters: 1 }, stereo: { R: 0.26, rpm: 45, meters: 2 } };
const LATHE_W = { seven: [1, 2, 3], twelve: [3, 2, 1], mono: [2, 2, 1], stereo: [1, 2, 2] };

const lathe = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, LATHE_W, bandOf(W.a)), ang: 0, pos: 0.95, pitch: 1, swarf: [], vu: [{ x: 0, v: 0 }, { x: 0, v: 0 }], flip: 0, side: 0, lab: HOT, kick: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, B = b10(f), cx = 0.4 * N, cy = 0.54 * N;
    if (f.section === 'change') { w.kind = rollW(rnd, LATHE_W, bandOf(W.a)); w.pitch = pick(rnd, [0.7, 1, 1.5, 2.2]); }
    if (f.section === 'drop' && w.flip <= 0) w.flip = 2.4;
    const K = LATHES[w.kind], R = K.R * N, omega = (K.rpm / 60) * TAU;
    for (const h of hits) {
      if (isLow(h)) w.kick = h.strength;
      else if (h.kind === 'snare' && w.flip <= 0) for (let k = 0; k < 6; k++) w.swarf.push({ fling: true, x: cx + R * w.pos, y: cy, vx: (rnd() - 0.2) * 0.3 * N, vy: (rnd() - 0.5) * 0.3 * N, life: 0.6 });
    }
    w.kick *= Math.exp(-dt * 10);
    // the flip: lift (the disc grows a little, a shadow falls), the turn over about the vertical axis (the width goes
    // to nothing and back, the side changes in the middle), set down; the head is up and the disc still the while
    let lift = 0, wid = 1;
    const up = w.flip > 0;
    if (up) {
      w.flip -= dt;
      const q = 2.4 - w.flip;
      if (q < 0.6) lift = ease(q / 0.6);
      else if (q < 1.6) { lift = 1; wid = Math.abs(Math.cos((q - 0.6) * Math.PI)); if (q - dt < 1.1 && q >= 1.1) { w.side ^= 1; w.pos = 0.95; w.lab = w.lab === HOT ? COOL : HOT; } }
      else lift = 1 - ease((q - 1.6) / 0.8);
    } else { // the cut: the lacquer at its speed, the head one groove pitch inward per turn
      w.ang += omega * dt;
      w.pos -= ((w.pitch * 0.0045 * N) / R) * (omega / TAU) * dt;
      if (w.pos <= 0.45) w.flip = 2.4;
    }
    // the bench, the platter, the shadow of a lifted disc, the lacquer (an ellipse while it turns over)
    r.rect(0, 0, N, N, DARK + DIM);
    r.rect(0.04 * N, 0.08 * N, 0.92 * N, 0.84 * N, MID + DIM);
    r.disc(cx, cy, R * 1.06, MID);
    r.ring(cx, cy, R * 1.06, Math.max(1, u), LMID + DIM);
    const Rd = R * (1 + 0.08 * lift);
    if (lift > 0.05) r.disc(cx + lift * 3 * u, cy + lift * 4 * u, Rd, DARK + DIM);
    for (let y = Math.floor(cy - Rd); y <= cy + Rd; y++) { const dy = y + 0.5 - cy, hw = Math.sqrt(Math.max(0, Rd * Rd - dy * dy)) * wid; if (hw >= 0.5) r.rect(cx - hw, y, 2 * hw, 1, DARK); }
    if (wid > 0.98) {
      // the cut annulus, matte, with a groove line every couple of cells; the label with its mark turning; the sheen
      if (w.pos < 0.94) { r.ring(cx, cy, (Rd * (0.95 + w.pos)) / 2, Rd * (0.95 - w.pos), DARK + DIM); for (let q = 0.95; q > w.pos; q -= (2.2 * u) / Rd) rim(r, cx, cy, Rd * q, DARK, u * 0.7); }
      r.disc(cx, cy, Rd * 0.2, w.lab);
      r.rect(cx + Math.cos(w.ang) * Rd * 0.13 - u, cy + Math.sin(w.ang) * Rd * 0.13 - u, 2 * u, 2 * u, BRIGHT);
      for (let a = 3.5; a < 4.1; a += 0.1) r.line(cx + Math.cos(a) * Rd * 0.8, cy + Math.sin(a) * Rd * 0.8, cx + Math.cos(a + 0.1) * Rd * 0.8, cy + Math.sin(a + 0.1) * Rd * 0.8, MID + DIM);
    }
    r.disc(cx, cy, 1.2 * u, LMID);
    // the rail, the carriage at the groove radius, the stylus arm down on the lacquer (up through a flip), the suction tube
    const hx = cx + R * w.pos, hy = cy - 0.1 * N, tipY = up ? cy - 0.03 * N : cy + w.kick * (rnd() - 0.5) * u;
    r.rect(cx, hy - u, R * 1.35, 2 * u, LMID + DIM);
    r.rect(hx - 0.025 * N, hy - 0.025 * N, 0.05 * N, 0.05 * N, MID);
    r.frame(hx - 0.025 * N, hy - 0.025 * N, 0.05 * N, 0.05 * N, LMID);
    r.stroke(hx, hy + 0.025 * N, hx, tipY, Math.max(1, 1.5 * u), LMID);
    r.rect(hx - u, tipY - u, 2 * u, 2 * u, BRIGHT);
    const mx = hx + 0.03 * N, my = cy - 0.02 * N;
    r.stroke(hx + 0.02 * N, hy + 0.02 * N, mx, my, Math.max(1, 1.2 * u), DARK);
    r.disc(mx, my, 1.5 * u, DARK + DIM);
    // the swarf: a thread off the stylus curling into the tube (more of it when it is loud); flung bits on a snare slow in the air
    if (!up && (rnd() < 0.6 + f.level)) w.swarf.push({ s: 0, k: rnd() * TAU });
    w.swarf = w.swarf.filter((p) => {
      if (p.fling) { p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt); p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), LMID); return p.life > 0; }
      p.s += dt * 2.5;
      const x = lerp(hx, mx, p.s) + Math.sin(p.s * 14 + p.k) * 1.5 * u * (1 - p.s), y = lerp(cy, my, p.s) + Math.cos(p.s * 14 + p.k) * 1.5 * u * (1 - p.s);
      r.rect(x, y, Math.max(1, u * 0.8), Math.max(1, u * 0.8), LMID);
      return p.s < 1;
    });
    if (w.swarf.length > 80) w.swarf.splice(0, w.swarf.length - 80);
    // the meters on the wall: mono on the level, stereo on the low and the high bands, a peak lamp
    for (let k = 0; k < K.meters; k++) {
      const band = k ? Math.max(B[6], B[7], B[8]) : Math.max(B[1], B[2], B[3]);
      const tgt = K.meters === 1 ? clamp(0.6 * f.level + 0.4 * f.rel.bassDrive + 0.4 * w.kick) : clamp(0.5 * f.level + 0.5 * band + (k ? 0 : 0.4 * w.kick));
      vuStep(w.vu[k], tgt, dt);
      meter(r, 0.72 * N, (0.1 + k * 0.16) * N, 0.22 * N, 0.13 * N, w.vu[k].x, u);
      r.disc(0.92 * N, (0.12 + k * 0.16) * N, 1.2 * u, w.vu[k].x > 0.8 ? HOT : DARK + DIM);
    }
    // the listener: shoulders, a head that nods on the beat, the headphones going with it
    const lx = 0.82 * N, ly = 0.76 * N + 2.5 * u * f.beat.pulse;
    r.rect(0.72 * N, 0.8 * N, 0.2 * N, 0.12 * N, FIG);
    r.disc(lx, ly, 0.045 * N, FIG);
    r.ring(lx, ly - 0.005 * N, 0.05 * N, 1.5 * u, COOL, 1);
    for (const k of [-1, 1]) r.rect(lx + k * 0.05 * N - 2 * u, ly - 2 * u, 4 * u, 5 * u, COOL);
    targets.push({ x: hx - 0.04 * N, y: hy - 0.04 * N, w: 0.08 * N, h: 0.08 * N });
  },
};

const WORLDS = { warehouse, soundsystem, turntables, tracker, scope, pirateradio, freeparty, basement, crates, tapedeck, modular, lathe };

registerFamily('under', WORLD_DEFS, WORLDS);
export const UNDER_STYLE = makeMixStyle('UNDERGROUND', ['under']);
