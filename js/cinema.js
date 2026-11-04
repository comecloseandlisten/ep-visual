// Cinema, mixed: the compositional language of auteur film as visual tropes, in silhouette and set. A symmetrical
// hotel corridor, a black slab on a plain at dawn, the slit-scan tunnel, a war room under a ring of light, two
// telepods and what comes out of the second, a television that breathes, a room of red curtains, the view up out
// of a car trunk, a courtyard of lit windows, birds settling on wires, a chess game on a stony beach, a rail trolley
// into the zone, samurai in the rain, the moon with a face. Original silhouettes and sets only: no character, title,
// actor, logo or word from anywhere. Every world draws with the palette roles, so any palette, treatment and layout
// of the mixer fits. Each has a table of kinds weighted by the arousal band, rolled again on a section change; a
// drop brings the heavy variant.
import { clamp, lerp } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow, followAngle, ease,
  beatLocked, hash, pickW, walker, particles, burst, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  hallway: { name: 'hotel corridor', va: [[L, M], [M, H], [L, H]], pals: ['cinema', 'silver', 'noir', 'tape', 'bureau', 'thermal'], fx: ['film', 'none', 'vhs'] },
  monolith: { name: 'the slab at dawn', va: [[L, M], [L, L], [M, L]], pals: ['sepia', 'silver', 'midnight', 'noir', 'tape', 'ice'], fx: ['film', 'none', 'crt'] },
  stargate: { name: 'slit-scan tunnel', va: [[L, M], [L, L], [M, L]], pals: ['thermal', 'midnight', 'machine', 'ice', 'cinema', 'silver'], fx: ['none', 'film', 'mirror', 'crt'], heavy: true, geo: true },
  warroom: { name: 'war room', va: [[M, H], [L, H], [M, M]], pals: ['noir', 'silver', 'bureau', 'machine', 'midnight', 'ice'], fx: ['film', 'none', 'crt', 'cards'] },
  telepods: { name: 'telepods', va: [[L, M], [M, H], [L, H]], pals: ['noir', 'machine', 'tape', 'sepia', 'ice', 'occult'], fx: ['film', 'none', 'vhs', 'crt'] },
  breathingtv: { name: 'breathing television', va: [[L, M], [M, H], [L, H]], pals: ['noir', 'machine', 'occult', 'tape', 'silver', 'thermal'], fx: ['vhs', 'none', 'film', 'crt'] },
  redroom: { name: 'red room', va: [[L, M], [M, H], [L, H]], pals: ['occult', 'noir', 'machine', 'cinema', 'midnight', 'silver'], fx: ['film', 'none', 'vhs'] },
  trunkshot: { name: 'trunk shot', va: [[M, H], [L, H], [M, M]], pals: ['cinema', 'noir', 'silver', 'tape', 'midnight', 'bureau'], fx: ['film', 'none', 'cards', 'vhs'] },
  rearwindow: { name: 'rear window', va: [[M, L], [M, M], [H, M]], pals: ['midnight', 'noir', 'tape', 'sepia', 'silver', 'bureau'], fx: ['film', 'none', 'crt'] },
  birdsonwires: { name: 'birds on the wires', va: [[M, L], [M, M], [H, M]], pals: ['silver', 'ice', 'sepia', 'noir', 'tape', 'bureau'], fx: ['film', 'none', 'cards'] },
  seventhseal: { name: 'chess on the beach', va: [[L, M], [L, L], [M, L]], pals: ['silver', 'noir', 'sepia', 'ice', 'midnight', 'bureau'], fx: ['film', 'none', 'crt'] },
  zone: { name: 'the zone', va: [[L, M], [L, L], [M, L]], pals: ['sepia', 'tape', 'silver', 'ice', 'noir', 'midnight'], fx: ['film', 'none', 'vhs'] },
  rainbattle: { name: 'battle in the rain', va: [[M, H], [L, H], [M, M]], pals: ['silver', 'noir', 'sepia', 'tape', 'ice', 'machine'], fx: ['film', 'none', 'crt'] },
  moonface: { name: 'the moon with a face', va: [[M, L], [M, M], [H, M]], pals: ['sepia', 'midnight', 'tape', 'silver', 'noir', 'cinema'], fx: ['film', 'none', 'cards', 'vhs'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const px = (u) => Math.max(1, u);
const G = 1.6; // the gravity every falling thing shares, in screens per second squared (as mixer's particles)
// a sine table for the per-pixel worlds: SIN[(phase * SINK) & 1023]
const SIN = new Float32Array(1024), SINK = 1024 / TAU;
for (let i = 0; i < 1024; i++) SIN[i] = Math.sin((i / 1024) * TAU);
// a shadow on the ground under a thing that stands at x with its feet on g, hw wide
const shadow = (r, x, g, hw, c = DARK + DIM) => r.ring(x, g, hw * 0.5, hw, c, 0.3);
// a filled ellipse
const oval = (r, cx, cy, rx, ry, c) => r.ring(cx, cy, rx * 0.5, rx, c, ry / rx);
// the bar clock: true on the first beat of a bar when the beat is known, else every 4 / bps seconds
function onBar(W, w, every = 4) {
  const { f, dt } = W, bps = f.bpm ? f.bpm / 60 : 2;
  if (beatLocked(f)) return f.beat.on && f.beat.count % every === 0;
  if ((w.barT = (w.barT || 0) + dt) < every / bps) return false;
  w.barT = 0;
  return true;
}
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
// a small bird at (x, y), sz across, facing dir: a body, a head with a beak, a tail, the wings up or down with `flap` (-1..1)
function bird(r, x, y, sz, col, flap, dir) {
  r.disc(x, y, sz * 0.32, col);
  r.disc(x + dir * sz * 0.3, y - sz * 0.22, sz * 0.18, col);
  r.line(x + dir * sz * 0.45, y - sz * 0.22, x + dir * sz * 0.62, y - sz * 0.16, col);
  r.line(x - dir * sz * 0.25, y, x - dir * sz * 0.6, y + sz * 0.15, col);
  if (flap !== 0) for (const k of [-1, 1]) r.line(x, y - sz * 0.1, x + k * sz * 0.5, y - sz * 0.1 - flap * sz * 0.45, col);
}
// a side-on dog at x with its feet on g, h at the shoulder, trotting with ph (diagonal pairs), facing dir
function dog(r, x, g, h, col, ph, dir) {
  const bl = h * 1.4, by = g - h * 0.55;
  r.rect(x - bl / 2, by - h * 0.35, bl, h * 0.4, col);
  r.disc(x + dir * (bl / 2 + h * 0.1), by - h * 0.4, h * 0.22, col);
  r.rect(x + dir * (bl / 2 + h * 0.05), by - h * 0.65, px(h * 0.08), h * 0.2, col);
  r.line(x - dir * bl * 0.5, by - h * 0.3, x - dir * (bl * 0.5 + h * 0.25), by - h * 0.65, col);
  for (const [k, p] of [[-0.4, 0], [-0.25, 1], [0.25, 1], [0.4, 0]]) { const sw = Math.sin(ph + p * Math.PI) * h * 0.2; r.line(x + k * bl, by, x + k * bl + sw, g, col); }
}

// ---------------------------------------------------------------------------------------------- hallway
// A hotel corridor in perfect one-point perspective: the carpet's pattern foreshortened to the vanishing point,
// doors receding on both walls, ceiling panels that pulse on the beat and flicker on the hats, a child on a tricycle
// pedalling toward us at the tempo (the feet going round on the cranks, the valve dots round the wheels), two
// identical figures hand in hand at the far end, a step nearer on every section change. A drop: the far doors open
// and a hot flood rolls up the corridor at us. Kinds: the carpet (hexagons, chevrons, diamonds).
const CARPETS = { hex: [3, 2, 1], chevron: [2, 2, 2], diamond: [1, 2, 3] };
const CARPET3 = [DARK, MID, HOT + DIM];
const hallway = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { carpet: rollW(rnd, CARPETS, band), trikeZ: 9 + rnd() * 2, wheel: 0, twinZ: 11, flick: new Float32Array(10), flood: -1, flash: 0, lamp: COOL, puffs: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, tt = t * 10 | 0;
    // the eye a unit above the carpet: a point (X, Y, z) lands at cx + X K / z, hz + Y K / z; walls at X = ±HW, the ceiling at Y = -CE, the far doors at ZE
    const cx = 0.5 * N, hz = 0.45 * N, K = 0.5 * N, HW = 0.8, CE = 0.8, ZE = 12, RW = 0.14, buf = r.buf, P = (X, Y, z) => [cx + (X * K) / z, hz + (Y * K) / z];
    for (const h of hits) {
      if (h.kind === 'hat') w.flick[Math.floor(rnd() * 10)] = 0.12;
      else if (h.kind === 'snare') w.flash = 0.08;
      else if (isLow(h)) { w.trikeZ -= 0.12 * h.strength; w.wheel += (0.12 * h.strength) / RW; s.shake = Math.max(s.shake, 0.1 * h.strength); } // the jolt nearer rolls the wheels too
      else if (isTonal(h)) w.lamp = h.pc % 2 ? HOT : COOL;
    }
    if (f.section === 'drop') w.flood = 0;
    else if (f.section === 'change') { w.carpet = rollW(rnd, CARPETS, band); w.twinZ = Math.max(2.2, w.twinZ * 0.72); }
    w.flash -= dt;
    for (let k = 0; k < 10; k++) w.flick[k] -= dt;
    if (w.flood >= 0 && (w.flood += (dt * bps) / 8) > 1) w.flood = -1; // the flood takes eight beats: four in, four draining
    // the tricycle rolls a door a beat, quicker with the bass; the wheels turn with the travel
    const v = 0.55 * bps * (0.6 + 0.4 * clamp(f.rel.bassDrive));
    w.trikeZ -= v * dt;
    w.wheel += (v * dt) / RW;
    if (w.trikeZ < 0.9) w.trikeZ = ZE - 0.6;
    // the box of the corridor: ceiling, walls, then the carpet a pixel at a time (its depth is the row's), the far wall
    const xe = (HW * K) / ZE, ye0 = (CE * K) / ZE, ye1 = K / ZE, z0 = (HW * K) / cx;
    r.rect(0, 0, N, hz, DARK);
    for (const sgn of [-1, 1]) {
      r.poly([[cx + sgn * cx, hz - (CE * K) / z0], [cx + sgn * xe, hz - ye0], [cx + sgn * xe, hz + ye1], [cx + sgn * cx, hz + K / z0]], MID);
      r.line(cx + sgn * cx, hz + (0.35 * K) / z0, cx + sgn * xe, hz + 0.35 * ye1, LMID); // the dado rail
      r.line(cx + sgn * cx, hz - (CE * K) / z0, cx + sgn * xe, hz - ye0, DARK + DIM);
    }
    const fl = w.flood, zf = fl < 0 ? -1 : fl < 0.5 ? ZE - (ZE - 0.9) * ease(fl * 2) : 0.9, drain = fl > 0.5 ? (fl - 0.5) * 2 : 0, car = w.carpet;
    for (let y = Math.ceil(hz + ye1); y < N; y++) {
      const z = K / (y - hz), xh = (HW * K) / z, zk = z / K, x0 = Math.max(0, Math.ceil(cx - xh)), x1 = Math.min(N, Math.floor(cx + xh)), row = y * N;
      const flooded = zf > 0 && z > zf, front = flooded && z < zf + 0.5;
      for (let x = x0; x < x1; x++) {
        const X = (x - cx) * zk;
        let c;
        if (flooded) c = front || hash(x, y + tt) < 0.03 ? BRIGHT : hash(x, y) < drain ? CARPET3[(x + y) & 1] : HOT;
        else if (car === 'hex') { // axial hex coordinates rounded to the nearest cell, three colours by (q - r) mod 3
          const q = (0.577 * X - 0.333 * z) / 0.35, rr = (0.667 * z) / 0.35;
          let qx = Math.round(q), rz = Math.round(rr);
          const sy = Math.round(-q - rr), dq = Math.abs(qx - q), dr = Math.abs(rz - rr), ds = Math.abs(sy + q + rr);
          if (dq > dr && dq > ds) qx = -rz - sy; else if (dr > ds) rz = -qx - sy;
          c = CARPET3[(((qx - rz) % 3) + 3) % 3];
        } else if (car === 'chevron') c = CARPET3[((Math.floor(X * 2.5 + Math.abs(((z * 1.5) % 2) - 1) * 1.5) % 3) + 3) % 3];
        else c = CARPET3[((Math.floor(X * 2 + z * 2) + Math.floor(X * 2 - z * 2)) & 1)];
        buf[row + x] = c;
      }
    }
    r.rect(cx - xe, hz - ye0, 2 * xe, ye0 + ye1, MID + DIM);
    const dw = (0.26 * K) / ZE, gap = fl >= 0 ? Math.min(dw, fl * 4 * dw) : 0; // the elevator doors, open on the flood
    r.rect(cx - dw, hz - (0.45 * K) / ZE, 2 * dw, (0.45 * K) / ZE + ye1, LMID);
    if (gap > 0) r.rect(cx - gap, hz - (0.45 * K) / ZE, 2 * gap, (0.45 * K) / ZE + ye1, HOT); else r.rect(cx, hz - (0.45 * K) / ZE, 1, (0.45 * K) / ZE + ye1, DARK);
    r.rect(cx - u, hz - (0.55 * K) / ZE, px(2 * u), px(u), w.lamp);
    // the doors on both walls and the panels on the ceiling, far to near
    for (let k = 9; k >= 0; k--) {
      const z = 1.4 + k * 1.1;
      if (z + 0.5 >= ZE) continue;
      for (const sgn of [-1, 1]) {
        const a = P(sgn * HW, 1, z), b = P(sgn * HW, 1, z + 0.5), c2 = P(sgn * HW, -0.35, z + 0.5), d = P(sgn * HW, -0.35, z);
        r.poly([a, b, c2, d], DARK + DIM);
        r.line(d[0], d[1], c2[0], c2[1], LMID + DIM);
        const kn = P(sgn * HW, 0.35, z + 0.4);
        r.rect(kn[0] - u * 0.5, kn[1], px(u * 0.8), px(u * 0.8), LMID);
      }
    }
    for (let k = 7; k >= 0; k--) {
      const z = 1 + k * 1.5, a = P(-0.28, -CE, z), b = P(0.28, -CE, z), c2 = P(0.28, -CE, z + 0.5), d = P(-0.28, -CE, z + 0.5);
      const off = w.flick[k] > 0 && (tt + k) % 2 === 0;
      r.poly([a, b, c2, d], off ? DARK + DIM : f.beat.pulse > 0.4 ? BRIGHT : LMID);
    }
    // the twins at the far end and the tricycle, the farther first
    const twins = () => {
      const z = w.twinZ, h = (0.9 * K) / z, base = hz + K / z, col = w.flash > 0 ? BRIGHT : FIG;
      for (const sgn of [-1, 1]) {
        const x = cx + (sgn * 0.17 * K) / z;
        shadow(r, x, base, h * 0.22);
        r.poly([[x - h * 0.17, base - h * 0.08], [x + h * 0.17, base - h * 0.08], [x + h * 0.08, base - h * 0.62], [x - h * 0.08, base - h * 0.62]], col);
        r.rect(x - h * 0.09, base - h * 0.1, px(h * 0.07), h * 0.1, col);
        r.rect(x + h * 0.02, base - h * 0.1, px(h * 0.07), h * 0.1, col);
        r.disc(x, base - h * 0.76, h * 0.13, col);
        r.stroke(x + sgn * h * 0.12, base - h * 0.55, x - sgn * h * 0.14, base - h * 0.42, px(h * 0.05), col); // the outer arm
        r.stroke(x - sgn * h * 0.08, base - h * 0.55, cx, base - h * 0.42, px(h * 0.05), col); // the joined hands
      }
      targets.push({ x: cx - h * 0.45, y: base - h, w: h * 0.9, h });
    };
    const trike = () => {
      const z = w.trikeZ, zf2 = z - 0.45, base = hz + K / z, col = FIG, th = w.wheel;
      shadow(r, cx, hz + K / zf2, (0.3 * K) / zf2, DARK + DIM);
      const wheel = (X, zz, rad) => { // a wheel seen edge-on: a slab, the valve dot going round it
        const [x, y] = P(X, 1 - rad, zz), rr = (rad * K) / zz;
        r.rect(x - px(rr * 0.22) / 2, y - rr, px(rr * 0.22), 2 * rr, col);
        const zd = zz - rad * Math.sin(th), [vx, vy] = P(X, 1 - rad - rad * Math.cos(th), zd);
        r.rect(vx - u * 0.5, vy - u * 0.5, px(u), px(u), BRIGHT);
      };
      wheel(-0.22, z, RW); wheel(0.22, z, RW);
      const [ax, ay] = P(0, 1 - RW, z), [fx2, fy2] = P(0, 1 - RW, zf2);
      r.stroke(ax, ay, fx2, fy2 - (0.2 * K) / zf2, px((0.05 * K) / z), col); // the frame up to the head tube
      const [sx, sy] = P(0, 0.58, z);
      r.rect(sx - (0.1 * K) / z, sy - (0.03 * K) / z, (0.2 * K) / z, px((0.06 * K) / z), col); // the seat
      r.rect(sx - (0.09 * K) / z, sy - (0.3 * K) / z, (0.18 * K) / z, (0.3 * K) / z, col); // the rider
      r.disc(sx, sy - (0.4 * K) / z, (0.09 * K) / z, col);
      const [hx0, hy0] = P(-0.2, 0.45, zf2), [hx1, hy1] = P(0.2, 0.45, zf2);
      r.stroke(hx0, hy0, hx1, hy1, px(u), col); // the handlebar, the arms to it
      r.stroke(sx - (0.07 * K) / z, sy - (0.25 * K) / z, hx0, hy0, px((0.04 * K) / z), col);
      r.stroke(sx + (0.07 * K) / z, sy - (0.25 * K) / z, hx1, hy1, px((0.04 * K) / z), col);
      wheel(0, zf2, RW);
      for (const sgn of [-1, 1]) { // the legs: hip to a knee held up, knee to the pedal on the crank of the front wheel
        const a = th + (sgn > 0 ? Math.PI : 0), [pxx, pyy] = P(sgn * 0.1, 1 - RW - 0.1 * Math.cos(a), zf2 - 0.1 * Math.sin(a));
        const [kx, ky] = P(sgn * 0.09, 0.62 - 0.1 * Math.sin(a) * 0.5, (z + zf2) / 2), [hx, hy] = P(sgn * 0.06, 0.6, z);
        r.stroke(hx, hy, kx, ky, px((0.05 * K) / z), col);
        r.stroke(kx, ky, pxx, pyy, px((0.05 * K) / z), col);
      }
      targets.push({ x: cx - (0.3 * K) / z, y: sy - (0.5 * K) / z, w: (0.6 * K) / z, h: (0.95 * K) / z });
    };
    if (w.twinZ > w.trikeZ) { twins(); trike(); } else { trike(); twins(); }
    if (fl >= 0 && fl < 0.5) s.shake = Math.max(s.shake, 0.15);
  },
};

// ---------------------------------------------------------------------------------------------- monolith
// A black slab on a plain at dawn. A band of apes (or suited figures) circles it; one steps nearer on each bar until
// it touches the face and leaps back. The sun climbs an arc toward the crescent over the slab a section at a time
// until the three line up; the slab's shadow swings and shortens with it. A kick throws a bone, up on a parabola and
// down again; a snare startles the band. A drop makes the cut: the bone in the air is a long ship in orbit over a
// starfield for four bars. Kinds: apes, suited.
const TRIBES = { apes: [3, 2, 1], suits: [1, 2, 3] };
function ape(r, x, base, h, col, dir, reach) {
  const d = dir;
  r.poly([[x - d * h * 0.22, base - h * 0.05], [x - d * h * 0.3, base - h * 0.5], [x - d * h * 0.05, base - h * 0.74], [x + d * h * 0.22, base - h * 0.66], [x + d * h * 0.3, base - h * 0.3], [x + d * h * 0.18, base]], col);
  r.disc(x + d * h * 0.2, base - h * 0.72, h * 0.14, col);
  r.rect(x + d * h * 0.1 - h * 0.1, base - h * 0.8, h * 0.2, px(h * 0.05), col); // the brow ridge
  const ax = lerp(x + d * h * 0.44, x + d * h * 0.5, reach), ay = lerp(base, base - h * 0.95, reach);
  r.stroke(x + d * h * 0.14, base - h * 0.58, ax, ay, px(h * 0.07), col); // the near arm, down to the knuckles or up to the slab
  r.stroke(x - d * h * 0.12, base - h * 0.3, x - d * h * 0.2, base, px(h * 0.07), col);
  return [ax, ay];
}
function suit(r, x, base, h, col, dir, reach) {
  const J = walker(r, x, base, h, col, 0, dir);
  r.disc(x, J.head, h * 0.14, col);
  r.rect(x - dir * J.hw * 1.5, J.sy, J.hw * 0.6, h * 0.3, col); // the pack on the back
  const ax = lerp(J.sx + dir * h * 0.1, J.sx + dir * h * 0.3, reach), ay = lerp(J.sy + h * 0.3, J.sy - h * 0.3, reach);
  r.stroke(J.sx, J.sy, ax, ay, px(h * 0.06), col);
  return [ax, ay];
}
const monolith = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { tribe: rollW(rnd, TRIBES, band), turn: 0, sunA: 0.12, bone: null, orbit: -1, ship: null, startle: 0, puffs: [], glow: 0,
      band: Array.from({ length: 6 }, (_, i) => ({ a: -1.3 + (i / 5) * 2.6 + (rnd() - 0.5) * 0.2, d: 2.5 + rnd() * 2.5, from: 0, to: 0, k: 1, mode: 'wait', reach: 0 })),
      stones: Array.from({ length: 24 }, () => [rnd(), rnd(), 0.5 + rnd()]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2;
    const hz = 0.58 * N, sx = 0.5 * N, sb = hz + 0.1 * N, SH = 0.34 * N, SW = 0.15 * N, apes = w.tribe === 'apes';
    const spot = (g) => [sx + Math.sin(g.a) * g.d * 0.09 * N, sb + Math.cos(g.a) * g.d * 0.03 * N];
    for (const h of hits) {
      if (isLow(h) && !w.bone && w.orbit < 0) { // the nearest of the band throws the bone
        const g = w.band.reduce((m, q) => (q.d < m.d ? q : m)), [x, y] = spot(g), hh = (y - hz) * 0.8;
        w.bone = { x: x + (x < sx ? 1 : -1) * hh * 0.2, y: y - hh * 0.6, g: y, vx: (rnd() - 0.5) * 0.12 * N, vy: -(0.72 + 0.25 * h.strength) * N, ang: rnd() * TAU, spin: (rnd() < 0.5 ? -1 : 1) * (5 + 4 * rnd()) };
      } else if (h.kind === 'snare') w.startle = 0.3;
      else if (isTonal(h)) w.glow = 1;
    }
    if (f.section === 'drop') {
      w.orbit = 16 / bps;
      const b = w.bone;
      w.ship = b ? { x: b.x, y: b.y, ang: b.ang } : { x: 0.5 * N, y: 0.45 * N, ang: -0.4 };
      w.bone = null;
    } else if (f.section === 'change') { w.tribe = rollW(rnd, TRIBES, band); w.sunA = Math.min(Math.PI / 2, w.sunA + Math.PI / 12); }
    w.sunA = Math.min(Math.PI / 2, w.sunA + dt * 0.004);
    w.startle -= dt; w.glow -= dt * 1.5;
    if (w.orbit > 0) { // the match cut: a starfield, the planet's limb, the long ship drifting where the bone was, its lights on the beat
      w.orbit -= dt;
      r.fill(BLACK);
      for (let k = 0; k < 90; k++) r.set(hash(k, 1) * N, hash(k, 2) * N, hash(k, (t * 3) | 0) < 0.1 ? DARK : BRIGHT);
      r.disc(0.5 * N, 2.05 * N, 1.35 * N, DARK + DIM);
      r.ring(0.5 * N, 2.05 * N, 1.35 * N, px(u), COOL + DIM);
      const S = w.ship;
      S.x += dt * 0.012 * N; S.y -= dt * 0.004 * N;
      S.ang = followAngle(S.ang, -0.25, dt, 2.5);
      const c = Math.cos(S.ang), sn = Math.sin(S.ang), L2 = 0.26 * N;
      r.stroke(S.x - c * L2, S.y - sn * L2, S.x + c * L2, S.y + sn * L2, px(2.5 * u), LMID);
      for (const q of [-1, -0.45, 0.45, 1]) r.disc(S.x + c * L2 * q, S.y + sn * L2 * q, q * q > 0.5 ? 3.5 * u : 2.5 * u, LMID);
      r.ring(S.x - c * L2 * 0.72, S.y - sn * L2 * 0.72, 4 * u, px(u), BRIGHT, 0.4);
      for (let k = 0; k < 7; k++) { const q = -0.9 + k * 0.3; r.rect(S.x + c * L2 * q - sn * 3 * u, S.y + sn * L2 * q + c * 3 * u, px(u), px(u), (k + f.beat.count) % 2 && f.beat.pulse > 0.5 ? BRIGHT : HOT); }
      targets.push({ x: S.x - L2, y: S.y - 0.06 * N, w: 2 * L2, h: 0.12 * N });
      return;
    }
    // the dawn: bands of sky, the sun on its arc with its halo, the crescent waiting at the top of the arc, the plain
    const Ra = 0.36 * N, sunx = sx - Math.cos(w.sunA) * Ra, suny = hz - Math.sin(w.sunA) * Ra, aligned = w.sunA > Math.PI / 2 - 0.12;
    r.rect(0, 0, N, 0.25 * N, DARK);
    r.rect(0, 0.25 * N, N, 0.2 * N, MID + DIM);
    r.rect(0, 0.45 * N, N, 0.08 * N, MID);
    r.rect(0, 0.53 * N, N, hz - 0.53 * N, LMID);
    oval(r, sunx, suny, 0.13 * N * (1 + 0.3 * Math.max(0, w.glow)), 0.09 * N, LMID);
    r.disc(sunx, suny, 0.045 * N * (1 + 0.1 * f.beat.pulse), aligned ? BRIGHT : HOT);
    r.disc(sx, hz - 0.5 * N, 0.04 * N, LMID);
    r.disc(sx + 0.015 * N, hz - 0.51 * N, 0.035 * N, DARK);
    if (aligned) r.rect(sx - u * 0.5, hz - 0.46 * N, px(u), 0.1 * N, BRIGHT);
    r.rect(0, hz, N, N - hz, MID + DIM);
    r.rect(0, hz, N, px(u), LMID + DIM);
    for (const [kx, ky, ks] of w.stones) { const y = hz + ky * ky * (N - hz); r.rect(kx * N, y, px(ks * u * (0.5 + 2 * ky)), px(u * ks * ky), DARK); }
    // the slab's shadow lies away from the sun and shortens as it climbs; the band, farther first, the slab between them
    // its ground direction swings from across (the sun low at the side) to toward us (the sun high ahead), the depth part foreshortened as the plain is
    const away = sunx < sx ? 1 : -1, shl = Math.min(0.55 * N, (SH * Math.cos(w.sunA)) / Math.max(0.3, Math.sin(w.sunA))), sdx = away * shl * Math.cos(w.sunA), sdy = shl * Math.sin(w.sunA) * 0.33;
    r.poly([[sx - SW / 2, sb], [sx + SW / 2, sb], [sx + SW / 2 + sdx, sb + sdy], [sx - SW / 2 + sdx, sb + sdy]], DARK + DIM);
    if (onBar(W, w)) { // one of the band acts: a hop nearer, or the touch and the leap back
      const g = w.band[w.turn % 6];
      w.turn++;
      if (g.mode === 'wait') { g.from = g.d; if (g.d > 1.4) { g.to = g.d - 1; g.mode = 'hop'; g.k = 0; } else { g.mode = 'touch'; g.k = 0; } }
    }
    let touching = null;
    const order = w.band.map((g) => ({ g, p: spot(g) })).sort((p, q) => p.p[1] - q.p[1]);
    let slabDrawn = false;
    const drawSlab = () => {
      r.poly([[sx + SW / 2, sb], [sx + SW / 2 + 0.03 * N, sb - 0.012 * N], [sx + SW / 2 + 0.03 * N, sb - SH - 0.012 * N], [sx + SW / 2, sb - SH]], DARK);
      r.rect(sx - SW / 2, sb - SH, SW, SH, BLACK);
      if (aligned) r.rect(sx - SW / 2, sb - SH, SW, px(u), BRIGHT);
      slabDrawn = true;
    };
    for (const { g, p } of order) {
      if (!slabDrawn && p[1] >= sb) drawSlab();
      if (g.mode === 'hop' || g.mode === 'back') { g.k = Math.min(1, g.k + dt / (g.mode === 'hop' ? 0.35 : 0.45)); g.d = lerp(g.from, g.to, ease(g.k)); if (g.k >= 1) g.mode = 'wait'; }
      else if (g.mode === 'touch') { g.k += dt; g.reach = Math.min(1, g.k * 3); if (g.k > 1.2 / bps) { g.mode = 'back'; g.from = g.d; g.to = 3 + rnd() * 2; g.k = 0; } }
      if (g.mode !== 'touch') g.reach = Math.max(0, g.reach - dt * 4);
      const [x, y0] = spot(g), hh = (y0 - hz) * 0.8, dir = x < sx ? 1 : -1;
      const hop = g.mode === 'hop' || g.mode === 'back' ? Math.sin(g.k * Math.PI) * hh * 0.3 : w.startle > 0 ? Math.sin((w.startle / 0.3) * Math.PI) * hh * 0.15 : 0;
      shadow(r, x, y0, hh * 0.3);
      const hand = apes ? ape(r, x, y0 - hop, hh, FIG, dir, g.reach) : suit(r, x, y0 - hop, hh, FIG, dir, g.reach);
      if (g.mode === 'touch' && g.reach >= 1) touching = hand;
      targets.push({ x: x - hh * 0.35, y: y0 - hh - hop, w: hh * 0.7, h: hh });
    }
    if (!slabDrawn) drawSlab();
    if (touching) { r.disc(touching[0], touching[1], 1.5 * u, BRIGHT); if (rnd() < 0.5) r.rect(touching[0] + (rnd() - 0.5) * 4 * u, touching[1] + (rnd() - 0.5) * 4 * u, px(u), px(u), BRIGHT); }
    // the bone: up, over, down to the ground it left, a puff where it lands
    const b = w.bone;
    if (b) {
      b.vy += G * N * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.ang += b.spin * dt;
      const c = Math.cos(b.ang) * 0.03 * N, sn = Math.sin(b.ang) * 0.03 * N;
      r.stroke(b.x - c, b.y - sn, b.x + c, b.y + sn, px(1.5 * u), BRIGHT);
      r.disc(b.x - c, b.y - sn, 1.3 * u, BRIGHT); r.disc(b.x + c, b.y + sn, 1.3 * u, BRIGHT);
      if (b.vy > 0 && b.y >= b.g) { burst(w.puffs, rnd, b.x, b.g, 6, 0.06 * N, MID, 0.4); w.bone = null; }
    }
    w.puffs = particles(W, w.puffs, MID);
  },
};

// ---------------------------------------------------------------------------------------------- stargate
// The slit-scan tunnel: two planes of streaked light (or two walls, or all four) rushing at us and meeting at the
// slit, the streaks textured by noise, quicker with the bass, their colour split between the accents by the pitch
// class; a bright ring runs down the tunnel every beat, a kick throws one from the far end. A section change flies
// over a solarised terrain for four beats; a drop folds the tunnel shut and leaves one figure standing in a bright
// room. Kinds: planes, walls, cross.
const GATES = { planes: [3, 2, 1], walls: [2, 2, 2], cross: [1, 2, 3] };
const SOLAR = [COOL, COOL + DIM, BRIGHT, HOT, HOT + DIM, BRIGHT, DARK, MID];
function gateTables(w, N) {
  const K = 0.5 * N, c = 0.5 * N;
  w.N = N; w.LZ = new Float32Array(N); w.ZK = new Float32Array(N); w.PUL = new Float32Array(N);
  for (let i = 0; i < N; i++) { const d = Math.max(0.5, Math.abs(i + 0.5 - c)), z = K / d; w.LZ[i] = Math.log(z); w.ZK[i] = z / K; }
}
const stargate = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    gateTables(w, N);
    const TER = new Float32Array(64 * 64);
    for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) { // a periodic height map: two octaves of bilinear lattice noise
      let v = 0;
      for (const [sc, amp] of [[8, 0.65], [16, 0.35]]) { const fx = (i / 64) * sc, fy = (j / 64) * sc, ix = Math.floor(fx), iy = Math.floor(fy), qx = fx - ix, qy = fy - iy; const n = (a, b) => hash((a % sc) + 1, (b % sc) + 1 + sc * 7); v += amp * lerp(lerp(n(ix, iy), n(ix + 1, iy), qx), lerp(n(ix, iy + 1), n(ix + 1, iy + 1), qx), qy); }
      TER[j * 64 + i] = v;
    }
    Object.assign(w, { kind: rollW(rnd, GATES, band), PH: Uint16Array.from({ length: 256 }, () => Math.floor(rnd() * 1024)), HU: Float32Array.from({ length: 256 }, () => rnd()), TER, clk: 0, hue: 0.5, kick: 0, kickAt: 0, land: 0, scroll: 0, room: 0, fold: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, buf = r.buf, cx = 0.5 * N;
    if (w.N !== N) gateTables(w, N);
    for (const h of hits) {
      if (isLow(h)) { w.kick = 1.2 * h.strength; w.kickAt = 2.6; }
      else if (h.kind === 'snare') for (let k = 0; k < 24; k++) w.PH[Math.floor(rnd() * 256)] = Math.floor(rnd() * 1024);
      if (isTonal(h)) w.hueTo = h.pc / 11;
    }
    if (f.section === 'drop') { w.room = 16 / bps; w.fold = 0; }
    else if (f.section === 'change') { w.kind = rollW(rnd, GATES, band); w.land = 4 / bps; }
    w.hue = follow(w.hue, w.hueTo ?? 0.5, dt, 0.6);
    w.clk += dt * (0.5 + 2.5 * clamp(f.rel.bassDrive)) * bps * 0.5;
    w.scroll += dt * (2 + 6 * clamp(f.rel.bassDrive));
    w.kickAt -= dt * 3; w.kick *= Math.exp(-dt * 2);
    let squash = 0;
    if (w.room > 0) { // the bright room: a floor grid to one vanishing point, a lone figure, the light pulsing with the beat
      w.room -= dt;
      w.fold = Math.min(1, w.fold + dt / 0.3);
      if (w.fold < 1) squash = 1 - w.fold * 0.96; // the tunnel folds into the slit first: every row pulled to the centre line
    }
    if (w.room > 0 && !squash) {
      const hz = 0.45 * N, K = 0.5 * N, grid = f.beat.pulse > 0.5 ? BRIGHT : LMID + DIM;
      r.fill(BRIGHT);
      r.rect(0, hz - 0.12 * N, N, 0.12 * N, LMID);
      for (let k = 1; k <= 8; k++) r.rect(0, hz + K / k, N, px(u), LMID + DIM);
      for (let X = -4; X <= 4; X++) r.line(cx + X * (N - hz), N, cx, hz, X % 2 ? grid : LMID + DIM); // X at the bottom edge's own depth K / (N - hz)
      r.rect(0, hz, N, px(u), LMID);
      const z = 1.6, h = (0.9 * K) / z, base = hz + K / z, fx = cx + Math.sin(t * 0.3) * 0.05 * N;
      shadow(r, fx, base, h * 0.25, LMID + DIM);
      walker(r, fx, base, h, FIG, 0, f.beat.count & 1 ? 1 : -1);
      targets.push({ x: fx - h * 0.25, y: base - h, w: h * 0.5, h });
      return;
    }
    if (w.land > 0) { // the false-colour flyover: the terrain posterised to a solarising ramp under an inverted sky
      w.land -= dt;
      const { ZK, TER } = w, hz = 0.5 * N;
      r.rect(0, 0, N, 0.2 * N, HOT + DIM);
      r.rect(0, 0.2 * N, N, 0.2 * N, HOT);
      r.rect(0, 0.4 * N, N, hz - 0.4 * N, BRIGHT);
      r.disc(0.7 * N, 0.3 * N, 0.07 * N, BLACK);
      const sc = w.scroll;
      for (let y = Math.ceil(hz) + 1; y < N; y++) {
        const zk = ZK[y], z = zk * 0.5 * N, iz = (Math.floor(z * 3 + sc) & 63) * 64, row = y * N;
        for (let x = 0; x < N; x++) buf[row + x] = SOLAR[(TER[iz + (Math.floor((x - cx) * zk * 6) & 63)] * 7.99) | 0];
      }
      return;
    }
    // the tunnel, a pixel at a time: which plane the ray meets, its depth (log, so the rush reads evenly), its lateral
    // streak; a slow pulse and a fine texture along each streak, the beat's ring and the kick's running down the depth
    const { LZ, ZK, PH, HU, PUL } = w, kind = w.kind === 'planes' ? 0 : w.kind === 'walls' ? 1 : 2, clk = w.clk, hue = w.hue;
    const lzBeat = 2.6 - 2.8 * f.beat.phase, kb = 0.5 + 0.5 * f.beat.pulse;
    for (let i = 0; i < N; i++) { const lz = LZ[i]; PUL[i] = Math.max(0, 1 - Math.abs(lz - lzBeat) * 4) * kb + Math.max(0, 1 - Math.abs(lz - w.kickAt) * 3) * w.kick; }
    const th0 = -0.75 + 0.2 * f.level, th1 = -0.25 + 0.1 * f.level, th2 = 0.35 - 0.15 * f.level, th3 = 0.95 - 0.2 * f.level;
    for (let y = 0; y < N; y++) {
      const dy = y - cx, ay = Math.abs(dy), ly = LZ[y], ky = ZK[y], py = PUL[y], row = y * N;
      for (let x = 0; x < N; x++) {
        const dx = x - cx;
        let lz, X, pul;
        if (kind === 0 || (kind === 2 && ay >= Math.abs(dx))) { lz = ly; X = dx * ky; pul = py; }
        else { lz = LZ[x]; X = dy * ZK[x]; pul = PUL[x]; }
        const st = (X * 6 + 4096) | 0, i1 = st & 255;
        const v = SIN[(((lz * 4.5 + clk) * SINK + PH[i1]) | 0) & 1023] + 0.25 * SIN[(((lz * 28 + clk * 3) * SINK + PH[(st * 7) & 255]) | 0) & 1023] + pul;
        buf[row + x] = v > th3 ? BRIGHT : v > th2 ? (HU[i1] < hue ? HOT : COOL) : v > th1 ? (HU[i1] < hue ? HOT + DIM : COOL + DIM) : v > th0 ? DARK : BG;
      }
    }
    if (kind !== 1) r.rect(0, cx - px(u) / 2, N, px(u), f.beat.pulse > 0.6 ? BRIGHT : BLACK); // the slit itself
    else r.rect(cx - px(u) / 2, 0, px(u), N, f.beat.pulse > 0.6 ? BRIGHT : BLACK);
    if (squash) { // the fold: the rows drawn toward the centre line, black beyond what is left
      const copy = buf.slice();
      for (let y = 0; y < N; y++) { const sy = Math.round(cx + (y - cx) / squash); if (sy < 0 || sy >= N) buf.fill(BLACK, y * N, y * N + N); else buf.set(copy.subarray(sy * N, sy * N + N), y * N); }
    }
  },
};

// ---------------------------------------------------------------------------------------------- warroom
// A dark hall: a round table under a ring of light, a council of silhouettes around it, every head turned to whoever
// speaks (a new one each beat, under his own beam), a wall-sized map of invented continents with arcs of light
// tracing paths across it on the kicks (a ballistic bulge, a flash where each lands, the scar left behind), a phone
// at the table's edge that shakes on the snares, a board of lamps below the map lit by the notes. A drop launches
// everything at once and the ring light fails and flickers. Kinds: one map, a triptych, a map with side scopes.
const BOARDS = { map: [3, 2, 1], triptych: [2, 2, 2], wrap: [1, 2, 3] };
function continents(rnd) {
  const MW = 96, MH = 40, mask = new Uint8Array(MW * MH), blobs = [];
  for (let k = 0; k < 9; k++) blobs.push([rnd() * MW, 6 + rnd() * (MH - 12), 5 + rnd() * 12, 3 + rnd() * 6]);
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    let on = 0;
    for (const [bx, by, rx, ry] of blobs) { const dx = (i - bx) / rx, dy = (j - by) / ry; if (dx * dx + dy * dy < 1 - 0.35 * hash(i, j)) on = 1; }
    mask[j * MW + i] = on;
  }
  return { MW, MH, mask };
}
const warroom = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, BOARDS, band), ...continents(rnd), arcs: [], flashes: [], scars: [], speaker: 0, ring: 0, flicker: 0, board: new Float32Array(12), blink: -1, blinkT: 0,
      men: Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * TAU + 0.15, look: 0, h: 0.9 + rnd() * 0.2 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, buf = r.buf, tt = t * 12 | 0;
    const cx = 0.5 * N, ty = 0.68 * N, rx = 0.3 * N, ry = 0.075 * N, ly = 0.46 * N, { MW, MH, mask } = w;
    const land = (q) => { for (let k = 0; k < 40; k++) { const i = Math.floor(q() * MW), j = Math.floor(q() * MH); if (mask[j * MW + i]) return [i / MW, j / MH]; } return [q(), q()]; };
    const launch = () => { const [x0, y0] = land(rnd), [x1, y1] = land(rnd); if (Math.abs(x1 - x0) < 0.08) return; w.arcs.push({ x0, y0, x1, y1, h: 0.25 + rnd() * 0.3, t: 0, T: (1.5 + rnd()) / bps }); };
    for (const h of hits) {
      if (isLow(h) && h.strength > 0.35) launch();
      else if (h.kind === 'snare') w.ring = 0.5;
      else if (h.kind === 'hat') { w.blink = Math.floor(rnd() * 144); w.blinkT = 0.15; }
      if (isTonal(h)) w.board[h.pc] = 1;
    }
    if (f.section === 'drop') { for (let k = 0; k < 14; k++) launch(); w.flicker = 8 / bps; }
    else if (f.section === 'change') w.kind = rollW(rnd, BOARDS, band);
    if (f.beat.on) w.speaker = (w.speaker + 1 + Math.floor(rnd() * 3)) % 9;
    w.ring -= dt; w.flicker -= dt; w.blinkT -= dt;
    for (let k = 0; k < 12; k++) w.board[k] *= Math.exp(-dt * 1.5);
    const lit = w.flicker <= 0 || hash(tt, 5) < 0.45;
    if (w.arcs.length > 40) w.arcs.splice(0, w.arcs.length - 40);
    // the map panels: the sea with its grid, the land, then the paths in flight, the flashes and the scars
    const mx0 = 0.08 * N, my0 = 0.07 * N, mw = 0.84 * N, mh = 0.33 * N, tri = w.kind === 'triptych', wrap = w.kind === 'wrap';
    const pw = wrap ? 0.6 * N : mw, px0 = wrap ? cx - pw / 2 : mx0;
    for (let y = Math.round(my0); y < my0 + mh; y++) {
      const j = Math.min(MH - 1, Math.floor(((y - my0) / mh) * MH)), row = y * N, gy = ((y - my0) / mh) * 12 % 1 < 0.08;
      for (let x = Math.round(px0); x < px0 + pw; x++) {
        const q = (x - px0) / pw;
        if (tri && ((q > 0.323 && q < 0.343) || (q > 0.657 && q < 0.677))) { buf[row + x] = BG; continue; }
        const i = Math.min(MW - 1, Math.floor(q * MW));
        buf[row + x] = mask[j * MW + i] ? MID : gy || (q * 24) % 1 < 0.04 ? DARK : DARK + DIM;
      }
    }
    r.frame(px0 - 1, my0 - 1, pw + 2, mh + 2, LMID + DIM);
    if (w.blinkT > 0) r.rect(px0 + ((w.blink % 24) / 24) * pw, my0 + (Math.floor(w.blink / 24) / 6) * mh, pw / 24, mh / 6, COOL + DIM);
    if (wrap) for (const sgn of [-1, 1]) { // the side scopes: a sweep going round, a blip on the beat
      const scx = cx + sgn * 0.42 * N, scy = my0 + mh / 2, R = 0.06 * N, a = t * 2 * sgn;
      r.disc(scx, scy, R, DARK + DIM); r.ring(scx, scy, R, px(u), LMID + DIM);
      r.line(scx, scy, scx + Math.cos(a) * R, scy + Math.sin(a) * R, COOL);
      if (f.beat.pulse > 0.3) r.rect(scx + Math.cos(a - 0.6) * R * 0.6, scy + Math.sin(a - 0.6) * R * 0.6, px(u), px(u), BRIGHT);
    }
    const M = (x, y) => [px0 + x * pw, my0 + y * mh];
    for (const sc of w.scars) { const [x, y] = M(sc[0], sc[1]); r.rect(x - u * 0.5, y - u * 0.5, px(u), px(u), HOT + DIM); }
    w.arcs = w.arcs.filter((a) => {
      a.t += dt;
      const qh = Math.min(1, a.t / a.T), n = 20, steps = Math.ceil(qh * n);
      let [lx, ly2] = M(a.x0, a.y0);
      for (let k = 1; k <= steps; k++) {
        const q = Math.min(qh, k / n), [x, y] = M(lerp(a.x0, a.x1, q), lerp(a.y0, a.y1, q) - a.h * Math.sin(Math.PI * q));
        if (k % 2) r.line(lx, ly2, x, y, k === steps ? BRIGHT : COOL);
        lx = x; ly2 = y;
      }
      r.rect(lx - u * 0.5, ly2 - u * 0.5, px(u), px(u), BRIGHT);
      if (qh >= 1) { w.flashes.push({ x: a.x1, y: a.y1, t: 0 }); w.scars.push([a.x1, a.y1]); if (w.scars.length > 40) w.scars.shift(); s.shake = Math.max(s.shake, 0.1); return false; }
      return true;
    });
    w.flashes = w.flashes.filter((fl) => { fl.t += dt; const [x, y] = M(fl.x, fl.y); r.ring(x, y, fl.t * 0.08 * N, px(u), fl.t < 0.15 ? BRIGHT : HOT); if (fl.t < 0.12) r.disc(x, y, 2 * u, BRIGHT); return fl.t < 0.6; });
    for (let k = 0; k < 12; k++) r.rect(mx0 + k * (mw / 12) + u, my0 + mh + 2 * u, mw / 12 - 2 * u, 2.5 * u, w.board[k] > 0.4 ? COOL : w.board[k] > 0.08 ? COOL + DIM : DARK);
    // the hall: the floor, the light cone and the ring, the table, the council around it, the far side first
    r.rect(0, ty, N, N - ty, DARK);
    if (lit) { r.poly([[cx - rx * 0.85, ly], [cx + rx * 0.85, ly], [cx + rx * 1.05, ty], [cx - rx * 1.05, ty]], DARK); r.ring(cx, ly, rx * 0.85, px(1.5 * u), f.level > 0.5 ? BRIGHT : LMID, 0.22); }
    r.rect(cx - u, 0, px(2 * u), ly - rx * 0.85 * 0.22, DARK + DIM);
    const men = w.men.map((m, i) => { const sn = Math.sin(m.a); return { m, i, x: cx + rx * 1.1 * Math.cos(m.a), y: ty + ry * 1.12 * sn, h: (0.11 + 0.05 * (sn + 1) * 0.5) * N * m.h, near: sn > 0 }; }).sort((p, q) => p.y - q.y);
    const spk = men.find((m) => m.i === w.speaker);
    const drawMan = (m) => {
      const col = lit ? FIG : DARK + DIM, me = m.i === w.speaker;
      m.m.look = follow(m.m.look, me ? 0 : Math.sign(spk.x - m.x) * 0.6, dt, 0.25);
      const J = walker(r, m.x, m.y + m.h * 0.12 + (me ? -f.beat.pulse * 1.5 * u : 0), m.h, col, 0, m.m.look >= 0 ? 1 : -1);
      r.rect(m.x + m.m.look * m.h * 0.1 - m.h * 0.08, J.head - m.h * 0.08, m.h * 0.16, px(1.2 * u), col); // the cap's brim, turned to the speaker
      if (me && lit) { r.poly([[cx - 2 * u, ly], [cx + 2 * u, ly], [m.x + m.h * 0.15, J.head - m.h * 0.12], [m.x - m.h * 0.15, J.head - m.h * 0.12]], LMID + DIM); r.rect(m.x - u, J.head - m.h * 0.04, px(2 * u), px(u), BRIGHT); targets.push({ x: m.x - m.h * 0.25, y: J.top, w: m.h * 0.5, h: m.h }); }
    };
    for (const m of men) if (!m.near) drawMan(m);
    oval(r, cx, ty, rx, ry, lit ? LMID + DIM : DARK + DIM);
    oval(r, cx, ty + ry * 0.25, rx * 0.97, ry * 0.9, lit ? MID + DIM : DARK);
    r.rect(cx - rx, ty, 2 * rx, ry * 0.5, DARK + DIM);
    for (const m of men) if (m.near) drawMan(m);
    const phx = cx + rx * 0.55 + (w.ring > 0 ? (rnd() - 0.5) * 2 * u : 0), phy = ty + ry * 0.5;
    r.rect(phx - 3.5 * u, phy - 2.5 * u, 7 * u, 2.5 * u, lit ? FIG : DARK);
    r.rect(phx - 4 * u, phy - 4 * u + (w.ring > 0 && tt % 2 ? -u : 0), 8 * u, px(1.5 * u), lit ? FIG : DARK);
    if (w.ring > 0 && tt % 2) r.rect(phx - u, phy - 3 * u, px(u), px(u), HOT);
    if (w.ring > 0) targets.push({ x: phx - 5 * u, y: phy - 6 * u, w: 10 * u, h: 8 * u });
    if (w.flicker > 0) s.shake = Math.max(s.shake, 0.08);
  },
};

// ---------------------------------------------------------------------------------------------- telepods
// A laboratory with two pods joined by sagging cables. A figure walks in, steps into the first pod, the door shuts;
// on a snare both pods flash and it steps out of the second a little changed, and walks back round to go again: the
// limbs longer, a second pair, the head wider, two eyes, antennae, over the sections, until the drop makes the full
// change and the lab lights die for four bars. Kicks jump lightning along the cables, the notes light the console.
// Kinds: the era of the lab (brass, chrome, plastic).
const ERAS = { brass: [3, 2, 1], chrome: [2, 2, 2], plastic: [1, 2, 3] };
// the subject at x with its feet on base, h tall, m of the way from a human rig to an insect rig, walking with ph, facing dir
function rig(r, x, base, h, m, col, ph, dir, u) {
  const legH = h * (0.32 + 0.12 * m), bodyH = h * 0.4, hipY = base - legH, shY = hipY - bodyH, lw = px(h * 0.06), hw = h * (0.17 - 0.07 * m);
  for (const k of [-1, 1]) { // legs: the knee ahead for the human, behind and higher for the insect
    const sw = Math.sin(ph + (k > 0 ? Math.PI : 0)) * h * 0.1, hx = x + k * h * 0.05, fx = hx + sw * dir, kx = (hx + fx) / 2 + dir * h * 0.07 * (1 - 2.2 * m), ky = hipY + legH * (0.5 - 0.25 * m);
    r.stroke(hx, hipY, kx, ky, lw, col);
    r.stroke(kx, ky, fx, base, lw, col);
  }
  r.rect(x - hw, shY, 2 * hw, bodyH, col);
  if (m > 0.2) r.disc(x - dir * h * 0.1, hipY - h * 0.02, h * 0.13 * (m - 0.2), col); // the abdomen
  const hy = shY - h * 0.1, hr = h * 0.1;
  oval(r, x, hy, hr * (1 + 0.7 * m), hr * (1 - 0.3 * m), col);
  if (m > 0.3) for (const k of [-1, 1]) { const es = px(Math.min(u * (0.6 + m), 4 * u * (m - 0.3))); r.rect(x + k * hr * (0.5 + 0.5 * m) - es / 2, hy - hr * 0.2, es, es, COOL); } // the eyes grow in
  if (m > 0.6) for (const k of [-1, 1]) { const q = (m - 0.6) / 0.4; r.line(x + k * hr * 0.5, hy - hr * 0.6, x + k * hr * (0.5 + 1.1 * q), hy - hr * (0.6 + 1.7 * q), col); } // the antennae grow out of the brow
  const armL = h * (0.3 + 0.25 * m), sw = Math.sin(ph) * 0.5;
  for (const k of [-1, 1]) { const ax = x + k * hw, ang = sw * k; r.stroke(ax, shY + h * 0.03, ax + Math.sin(ang) * armL * dir + k * h * 0.04 * m, shY + h * 0.03 + Math.cos(ang) * armL, lw, col); }
  if (m > 0.4) { const l2 = ((m - 0.4) / 0.6) * h * 0.3; for (const k of [-1, 1]) r.stroke(x + k * hw, shY + bodyH * 0.5, x + k * (hw + l2 * 0.8), shY + bodyH * 0.5 + l2 * 0.6 + Math.sin(ph) * k * l2 * 0.2, lw, col); }
  return { hy, shY };
}
const telepods = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { era: rollW(rnd, ERAS, band), fig: { x: 0.04, state: 'walk', ph: 0, k: 0, dir: 1 }, morph: 0, doorA: 0, doorB: 0, flash: 0, zap: 0, zapK: 0, zapSeed: 0, dark: 0, lamps: new Float32Array(12), waitB: 0, gauge: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, tt = t * 12 | 0, E = w.era;
    const g = 0.8 * N, ax = 0.26 * N, bx = 0.74 * N, PW = 0.16 * N, PH = 0.46 * N, top = g - PH, F = w.fig, cx = 0.5 * N;
    let sent = false;
    for (const h of hits) {
      if (isLow(h)) { w.zap = 0.12; w.zapK = Math.floor(rnd() * 3); w.zapSeed = Math.floor(rnd() * 9973); s.shake = Math.max(s.shake, 0.12 * h.strength); }
      else if (h.kind === 'snare') sent = true;
      if (isTonal(h)) w.lamps[h.pc] = 1;
    }
    if (f.section === 'drop') { w.dark = 16 / bps; w.morph = 1; }
    else if (f.section === 'change') { w.era = rollW(rnd, ERAS, band); w.morph = Math.min(1, w.morph + 0.2); }
    w.zap -= dt; w.flash -= dt;
    if (w.dark > 0 && (w.dark -= dt) <= 0) { w.morph = 0; Object.assign(F, { x: 0.04, state: 'walk', ph: 0, k: 0, dir: 1 }); } // the lights come back on a new subject
    for (let k = 0; k < 12; k++) w.lamps[k] *= Math.exp(-dt * 2);
    w.gauge = follow(w.gauge, f.level, dt, 0.15);
    const dark = w.dark > 0, litFrame = !dark || w.zap > 0 || w.flash > 0;
    // the subject's round: in from the left, into pod A, the wait for a snare, out of pod B, back round to A
    const h = 0.26 * N, sp = 0.09 * bps;
    if (F.state === 'walk' || F.state === 'walk2') {
      const to = ax / N, dx = Math.sign(to - F.x) * Math.min(Math.abs(to - F.x), sp * dt);
      F.x += dx; F.ph += (Math.abs(dx) * N) / (0.1 * h); F.dir = dx < 0 ? -1 : 1;
      if (Math.abs(F.x - to) < 0.003) { F.state = 'enter'; F.k = 0; F.x = to; }
    } else if (F.state === 'enter') { F.k += dt; if (F.k > 0.4) { F.state = 'wait'; w.waitB = 0; } }
    else if (F.state === 'wait') {
      if (f.beat.on) w.waitB++;
      if (sent || w.waitB >= 4) { w.flash = 0.25; F.state = 'emerge'; F.k = 0; F.x = bx / N; w.morph = Math.min(1, w.morph + 0.12); s.shake = Math.max(s.shake, 0.3); }
    } else if (F.state === 'emerge') { F.k += dt; if (F.k > 0.5) { F.state = 'walk2'; } }
    w.doorA = follow(w.doorA, (F.state === 'walk' || F.state === 'walk2') && Math.abs(F.x - ax / N) < 0.12 ? 1 : F.state === 'enter' && F.k < 0.25 ? 1 : 0, dt, 0.1);
    w.doorB = follow(w.doorB, F.state === 'emerge' || (F.state === 'walk2' && Math.abs(F.x - bx / N) < 0.1) ? 1 : 0, dt, 0.1);
    // the lab: a tiled wall, the floor, the console between the pods; in the dark only the pilot lights and the bolts
    if (!litFrame) r.fill(BLACK);
    else {
      for (let y = 0; y < g; y += 12 * u) r.rect(0, y, N, px(u), DARK + DIM);
      for (let x = 0; x < N; x += 12 * u) r.rect(x, 0, px(u), g, DARK + DIM);
      r.rect(0, g, N, N - g, DARK);
      r.rect(0, g, N, px(u), MID);
    }
    const shell = litFrame ? (E === 'brass' ? MID : E === 'chrome' ? LMID : MID + DIM) : DARK + DIM, trim = litFrame ? (E === 'brass' ? HOT + DIM : E === 'chrome' ? BRIGHT : COOL) : DARK;
    const pod = (x, open, inside) => { // a pod of the era: its shell, a door that slides up, the window on what is inside
      const dw = PW * 0.6, dh = PH * 0.72, dx0 = x - dw / 2, dy0 = g - dh;
      if (E === 'brass') { r.rect(x - PW / 2, top + PW * 0.3, PW, PH - PW * 0.3, shell); r.disc(x, top + PW * 0.3, PW / 2, shell); for (let k = 0; k < 5; k++) r.rect(x - PW / 2 + 1.5 * u, top + PW * 0.5 + k * (PH * 0.2), px(u), px(u), trim); r.ring(x, top + PW * 0.3, PW * 0.2, px(u), trim); }
      else if (E === 'chrome') { r.rect(x - PW / 2, top + PW * 0.5, PW, PH - PW * 0.5, shell); r.disc(x, top + PW * 0.5, PW / 2, shell); r.rect(x - PW / 2 + u, top + PW * 0.4, px(1.5 * u), PH - PW * 0.4, trim); }
      else { r.rect(x - PW / 2, top, PW, PH, shell); r.rect(x - PW / 2 + u, top + u, PW - 2 * u, px(2 * u), trim); r.rect(x + PW / 2 - 3 * u, top + 4 * u, px(2 * u), PH * 0.5, f.beat.pulse > 0.5 && litFrame ? BRIGHT : trim); }
      r.rect(dx0, dy0, dw, dh, w.flash > 0 ? BRIGHT : litFrame ? DARK : BLACK); // the interior
      if (inside && w.flash <= 0) rig(r, x, g, h, w.morph, litFrame ? FIG : DARK, 0, 1, u);
      r.rect(dx0, dy0, dw, dh * (1 - open), shell); // the door, up out of the way when open
      r.rect(dx0, dy0 + dh * (1 - open) - u, dw, px(u), trim);
      r.rect(x - u, top - 3 * u, px(2 * u), px(2 * u), (tt + (x > cx ? 1 : 0)) % 2 ? HOT : HOT + DIM); // the pilot light
    };
    const insideA = F.state === 'enter' || F.state === 'wait', insideB = F.state === 'emerge' && F.k < 0.25;
    if (litFrame) { // the console: a desk, the lamps the notes light, a gauge needle at the level
      r.rect(cx - 0.12 * N, g - 0.1 * N, 0.24 * N, 0.1 * N, E === 'plastic' ? MID + DIM : MID);
      r.rect(cx - 0.12 * N, g - 0.1 * N, 0.24 * N, px(u), LMID);
      for (let k = 0; k < 12; k++) r.rect(cx - 0.11 * N + k * 0.0183 * N, g - 0.08 * N, px(1.2 * u), px(1.2 * u), w.lamps[k] > 0.3 ? trim : w.lamps[k] > 0.05 ? DARK : DARK + DIM);
      r.ring(cx, g - 0.03 * N, 0.03 * N, px(u), LMID + DIM, 0.6);
      const ga = Math.PI + w.gauge * Math.PI;
      r.line(cx, g - 0.03 * N, cx + Math.cos(ga) * 0.028 * N, g - 0.03 * N + Math.sin(ga) * 0.017 * N, HOT);
    }
    pod(ax, w.doorA, insideA);
    pod(bx, w.doorB, insideB);
    // the cables, sagging between the pod tops, humming with the mids; a bolt down one of them on a kick
    for (let k = 0; k < 3; k++) {
      const y0 = top - 2 * u + k * 2 * u, sag = (0.07 + 0.02 * k) * N, hum = 2 * u * clamp(f.rel.midDrive), zap = w.zap > 0 && w.zapK === k;
      let lx = ax, ly = y0;
      for (let i = 1; i <= 14; i++) {
        const q = i / 14, x = lerp(ax, bx, q), y = y0 + sag * 4 * q * (1 - q) + Math.sin(t * 9 + q * 12 + k) * hum * Math.sin(q * Math.PI) + (zap ? (hash(w.zapSeed + i, tt) - 0.5) * 6 * u : 0);
        r.line(lx, ly, x, y, zap ? BRIGHT : litFrame ? LMID + DIM : DARK);
        lx = x; ly = y;
      }
    }
    if (w.zap > 0) { r.disc(ax, top - 2 * u, 3 * u, BRIGHT); r.disc(bx, top - 2 * u, 3 * u, BRIGHT); }
    if (w.flash > 0) bolt(r, ax + PW / 2, g - PH * 0.5, bx - PW / 2, g - PH * 0.5, 9, 6 * u, tt, BRIGHT, px(1.5 * u));
    // the subject on foot, with its shadow; eyes in the dark
    if (F.state === 'walk' || F.state === 'walk2' || (F.state === 'emerge' && F.k >= 0.25)) {
      const x = F.x * N;
      if (litFrame) shadow(r, x, g, h * 0.22);
      rig(r, x, g, h, w.morph, litFrame ? FIG : DARK, F.ph, F.dir, u);
      if (!litFrame) for (const k of [-1, 1]) r.rect(x + k * h * 0.06 - u * 0.5, g - h * 0.82, px(u), px(u), COOL);
      targets.push({ x: x - h * 0.3, y: g - h, w: h * 0.6, h });
    } else targets.push({ x: (insideA ? ax : bx) - PW / 2, y: top, w: PW, h: PH });
  },
};

// ---------------------------------------------------------------------------------------------- breathingtv
// A television in an empty room, a chair and a standing lamp for company. The screen swells with the bass (the
// picture magnified through the dome of the glass, a highlight sliding over it), snow bursts on the snares, veins of
// light spread under the casing with the mids, a hat rolls a hum bar down the picture, a tonal hit tints it. A drop
// presses a hand out through the glass and lets it sink back. Kinds: the programme (bars, rings, snow).
const PROGRAMMES = { bars: [3, 2, 1], rings: [2, 2, 2], snow: [1, 2, 3] };
const BARS = [BRIGHT, LMID, COOL, MID, HOT, DARK, BLACK];
const breathingtv = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    const veins = [];
    for (let k = 0; k < 8; k++) { // veins from the screen's edge out over the cabinet: four random-walk legs each
      const a = rnd() * TAU, pts = [[Math.cos(a) * 0.17, Math.sin(a) * 0.13]];
      for (let i = 1; i <= 4; i++) { const p = pts[i - 1]; pts.push([p[0] + Math.cos(a + (rnd() - 0.5) * 1.4) * 0.025, p[1] + Math.sin(a + (rnd() - 0.5) * 1.4) * 0.025]); }
      veins.push(pts);
    }
    Object.assign(w, { prog: rollW(rnd, PROGRAMMES, band), bump: 0, stat: 0, roll: -1, tint: COOL, hand: 0, veins, hz: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, tt = t * 14 | 0, buf = r.buf;
    const g = 0.8 * N, scx = 0.5 * N, scy = 0.47 * N, sw = 0.34 * N, sh = 0.26 * N;
    for (const h of hits) {
      if (h.kind === 'snare') w.stat = 0.1 + 0.1 * h.strength;
      else if (h.kind === 'hat') w.roll = 0;
      if (isTonal(h)) w.tint = h.pc % 2 ? HOT : COOL;
    }
    if (f.section === 'drop') w.hand = 8 / bps;
    else if (f.section === 'change') w.prog = rollW(rnd, PROGRAMMES, band);
    w.stat -= dt; w.hand -= dt;
    if (w.roll >= 0 && (w.roll += dt * 2.5) > 1) w.roll = -1;
    const handK = w.hand > 0 ? Math.sin(Math.PI * (1 - (w.hand * bps) / 8)) : 0;
    const want = Math.max(clamp(f.rel.bassDrive) * 0.9, handK * 1.3);
    w.bump = follow(w.bump, want, dt, want > w.bump ? 0.05 : 0.35);
    const b = w.bump, sc = 1 + 0.3 * b;
    // the room: wall, floor, the chair, the lamp and its pool on the floor, the cabinet on its legs
    r.rect(0, g, N, N - g, DARK);
    r.rect(0, g, N, px(u), MID + DIM);
    const chx = 0.15 * N, chh = 0.2 * N;
    r.rect(chx - 0.05 * N, g - chh * 0.5, 0.1 * N, px(2 * u), FIG);
    r.rect(chx + 0.04 * N, g - chh, px(2 * u), chh * 0.5, FIG);
    for (const k of [-0.045, 0.045]) r.rect(chx + k * N, g - chh * 0.5, px(u), chh * 0.5, FIG);
    const lx = 0.85 * N, pool = 0.09 * N * (1 + 0.15 * f.beat.pulse);
    oval(r, lx, g, pool, pool * 0.3, LMID + DIM);
    r.rect(lx - u * 0.5, g - 0.42 * N, px(u), 0.42 * N, FIG);
    r.poly([[lx - 0.05 * N, g - 0.42 * N], [lx + 0.05 * N, g - 0.42 * N], [lx + 0.035 * N, g - 0.5 * N], [lx - 0.035 * N, g - 0.5 * N]], LMID);
    oval(r, lx, g - 0.5 * N, 0.035 * N, 0.012 * N, BRIGHT);
    const cw = 0.44 * N, ch = 0.38 * N, cy0 = scy - ch * 0.5;
    r.rect(scx - cw / 2, cy0, cw, ch, MID);
    r.frame(scx - cw / 2, cy0, cw, ch, LMID + DIM);
    for (const k of [-0.18, 0.18]) r.rect(scx + k * N - u, cy0 + ch, px(2 * u), g - cy0 - ch, MID);
    r.rect(scx + cw / 2 - 4 * u, cy0 + ch - 4 * u, px(1.5 * u), px(1.5 * u), f.beat.pulse > 0.5 ? HOT : HOT + DIM);
    for (let k = 0; k < 3; k++) r.ring(scx + cw / 2 - 4 * u, cy0 + ch - 9 * u - k * 4 * u, 1.2 * u, px(u), LMID + DIM);
    // the veins under the casing: more of each shows with the mids, pulsing hot on the beat
    const nv = clamp(f.rel.midDrive) * 4.5, vc = f.beat.pulse > 0.5 ? HOT : HOT + DIM;
    for (const pts of w.veins) for (let i = 1; i <= Math.min(4, Math.floor(nv)); i++) r.line(scx + pts[i - 1][0] * N * sc, scy + pts[i - 1][1] * N * sc, scx + pts[i][0] * N * sc, scy + pts[i][1] * N * sc, vc);
    // the picture through the swelling glass: a rounded screen grown by the bump, each pixel's source pulled in toward
    // the centre by the dome's magnification; bars rolling, rings running out with the bass, or snow with a shadow in it
    const rx = sw / 2, ry = sh / 2, x0 = Math.max(0, Math.floor(scx - rx * sc)), x1 = Math.min(N, Math.ceil(scx + rx * sc)), y0 = Math.max(0, Math.floor(scy - ry * sc)), y1 = Math.min(N, Math.ceil(scy + ry * sc));
    const prog = w.stat > 0 ? 'snow' : w.prog, roll = w.roll, clk = f.rel.bassClock * 1.5, barOff = t * 0.15, s2 = sc * sc, tint = w.tint;
    for (let y = y0; y < y1; y++) {
      const ey = (y + 0.5 - scy) / ry, row = y * N;
      for (let x = x0; x < x1; x++) {
        const ex = (x + 0.5 - scx) / rx, d2 = ex * ex + ey * ey;
        if (Math.max(Math.abs(ex), Math.abs(ey)) > sc || d2 > 1.7 * s2) continue;
        const m = 1 + 0.6 * b * (1 - d2 / (2 * s2)), px2 = ex / m, py2 = ey / m;
        let c;
        if (prog === 'snow') c = hash(x + tt * 7, y + tt) < (Math.abs(px2) < 0.25 && py2 > -0.35 ? 0.3 : 0.55) ? LMID : DARK;
        else if (prog === 'bars') c = BARS[(((px2 + 1) * 3.5 + barOff) | 0) % 7];
        else { const v = SIN[(((Math.sqrt(d2) * 18 - clk) * SINK) | 0) & 1023]; c = v > 0.5 ? BRIGHT : v > -0.2 ? tint : DARK; }
        if (roll >= 0 && Math.abs(py2 - (roll * 2 - 1)) < 0.08) c = LMID;
        buf[row + x] = c;
      }
    }
    if (b > 0.08) { oval(r, scx - rx * 0.4 * sc, scy - ry * 0.45 * sc, rx * 0.16 * b, ry * 0.1 * b, BRIGHT); r.ring(scx, scy, rx * sc, px(u), LMID, ry / rx); }
    if (handK > 0.05) { // the hand pressing out: a palm, a thumb, four fingers, the glass stretched bright around it
      const hs = sw * 0.36 * handK, hx = scx, hy = scy + ry * 0.15;
      r.ring(hx, hy, hs * 0.75, px(1.5 * u), BRIGHT, 1.1);
      oval(r, hx, hy, hs * 0.42, hs * 0.5, BLACK);
      for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + (k - 1.5) * 0.32, l2 = hs * (k === 0 || k === 3 ? 0.75 : 0.9); r.stroke(hx + Math.cos(a) * hs * 0.3, hy + Math.sin(a) * hs * 0.3, hx + Math.cos(a) * l2, hy + Math.sin(a) * l2, px(hs * 0.16), BLACK); }
      r.stroke(hx - hs * 0.35, hy + hs * 0.05, hx - hs * 0.8, hy - hs * 0.3, px(hs * 0.16), BLACK);
      s.shake = Math.max(s.shake, 0.15 * handK);
      targets.push({ x: hx - hs, y: hy - hs, w: 2 * hs, h: 2 * hs });
    } else targets.push({ x: scx - rx * sc, y: scy - ry * sc, w: 2 * rx * sc, h: 2 * ry * sc });
  },
};

// ---------------------------------------------------------------------------------------------- redroom
// A room of hanging curtains, every fold a sine column waving with the treble, a zigzag floor in perspective to
// one vanishing point, a small figure dancing backward on the beat (a reversed walk, the arms up), a floor lamp that
// strobes on the snares, a kick for a jump, a hat for a glint on a fold. A drop parts the curtains on a long
// corridor of more curtains receding to the same point. Kinds: the drapes (plain, tall with a valance, doubled).
const DRAPES = { plain: [3, 2, 1], tall: [2, 2, 2], double: [1, 2, 3] };
const redroom = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { drape: rollW(rnd, DRAPES, band), col: new Uint8Array(N), N, fx: 0.5, dir: 1, from: 0.5, to: 0.5, step: 1, ph: 0, jump: 0, jy: 0, strobe: 0, glint: 0, part: 0, clk: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, tt = t * 15 | 0, buf = r.buf;
    const hz = 0.52 * N, g = 0.7 * N, cx = 0.5 * N, K = 0.5 * N;
    if (w.N !== N) { w.col = new Uint8Array(N); w.N = N; }
    for (const h of hits) {
      if (h.kind === 'snare') w.strobe = 0.3;
      else if (isLow(h) && w.jy >= 0 && w.jump >= 0) w.jump = -0.55 * N * h.strength; // only off the floor
      else if (h.kind === 'hat') w.glint = 0.08;
    }
    if (f.section === 'drop') w.part = 16 / bps;
    else if (f.section === 'change') w.drape = rollW(rnd, DRAPES, band);
    w.strobe -= dt; w.glint -= dt; w.part -= dt;
    w.clk += dt * (0.4 + 1.5 * clamp(f.rel.bassDrive));
    const lit = w.strobe > 0 && tt % 2 === 0, D = w.drape, fw = D === 'tall' ? 0.55 : D === 'double' ? 1.7 : 1;
    // the curtains: one colour per column from the fold's sine, drawn row by row
    const tc = f.rel.trebClock;
    for (let x = 0; x < N; x++) {
      const p = (x / u) * fw * 0.9 + 0.7 * Math.sin(tc * 0.8 + (x / N) * 5) + 0.3 * Math.sin(tc * 0.37 + (x / N) * 11), v = SIN[((p * SINK) | 0) & 1023];
      w.col[x] = lit ? (v > 0.45 ? BRIGHT : v > -0.35 ? LMID : HOT) : v > 0.45 ? HOT : v > -0.35 ? HOT + DIM : D === 'double' && v < -0.85 ? MID + DIM : DARK;
    }
    for (let y = 0; y < g; y++) buf.set(w.col, y * N);
    if (D === 'tall') for (let x = 0; x < N; x++) { const hem = 0.05 * N + Math.abs(SIN[(((x / u) * 0.4 * SINK) | 0) & 1023]) * 0.03 * N; r.rect(x, 0, 1, hem, w.col[x] === DARK ? HOT + DIM : DARK); }
    for (let x = 0; x < N; x += 2) r.rect(x, g - px(u) - (x % 4 ? 0 : u), 2, px(u), DARK + DIM); // the hem
    if (w.glint > 0) r.rect(rnd() * N, rnd() * g * 0.5, px(u), px(1.5 * u), BRIGHT);
    // the floor: the zigzag at the depth of each row, to the vanishing point behind the curtains
    const A = lit ? BLACK : BRIGHT, B = lit ? BRIGHT : BLACK;
    for (let y = Math.round(g); y < N; y++) {
      const z = K / (y - hz), zk = z / K, row = y * N, tri = Math.abs(((z * 1.2) % 2) - 1) * 1.5;
      for (let x = 0; x < N; x++) buf[row + x] = Math.floor((x - cx) * zk * 1.5 + tri) & 1 ? A : B;
    }
    // the parting: the gap opens over two beats and closes over the last two; through it, walls of folds, the floor
    // and a dark ceiling at the depth each ray reaches, to the same vanishing point
    if (w.part > 0) {
      const T = 16 / bps, k = Math.min(1, ((T - w.part) * bps) / 2, (w.part * bps) / 2), gap = ease(k) * 0.24 * N, zc = K / (g - hz), Wc = (gap * zc) / K, Hc = 1.1, clk = w.clk;
      for (let y = 0; y < g; y++) {
        const dy = y - hz, row = y * N;
        for (let x = Math.ceil(cx - gap); x < cx + gap; x++) {
          const dx = x - cx, zw = (Wc * K) / Math.max(0.5, Math.abs(dx)), zf = dy > 0 ? K / dy : 1e9, zce = dy < 0 ? (Hc * K) / -dy : 1e9, z = Math.min(zw, zf, zce);
          let c;
          if (z > 14) c = BLACK;
          else if (z === zw) { const v = SIN[(((Math.log(z) * 14 + clk) * SINK) | 0) & 1023]; c = z > 8 ? DARK : v > 0.45 ? HOT : v > -0.35 ? HOT + DIM : DARK; }
          else if (z === zf) c = Math.floor(dx * (z / K) * 1.5 + Math.abs(((z * 1.2) % 2) - 1) * 1.5) & 1 ? A : B;
          else c = DARK + DIM;
          buf[row + x] = c;
        }
      }
      r.rect(cx - gap - u, 0, px(u), g, BRIGHT);
      r.rect(cx + gap, 0, px(u), g, BRIGHT);
    }
    // the lamp at the right, the dancer: a step backward on every beat (the legs cycling in reverse), the arms up and
    // swaying, a turn at either end of the floor, a jump on the kick
    const lx = 0.87 * N;
    r.rect(lx - u * 0.5, g - 0.3 * N, px(u), 0.3 * N + 0.06 * N, FIG);
    r.poly([[lx - 0.045 * N, g - 0.3 * N], [lx + 0.045 * N, g - 0.3 * N], [lx + 0.03 * N, g - 0.37 * N], [lx - 0.03 * N, g - 0.37 * N]], w.strobe > 0 ? (lit ? BRIGHT : LMID) : MID);
    if (w.strobe > 0 && !lit) oval(r, lx, g - 0.3 * N, 0.04 * N, 0.015 * N, BRIGHT);
    if (f.beat.on) { // a step back: the next place, a turn when the floor runs out
      w.from = w.fx; w.to = w.fx - w.dir * 0.05; w.step = 0;
      if (w.to < 0.18 || w.to > 0.72) { w.dir = -w.dir; w.to = w.fx - w.dir * 0.05; }
    }
    if (w.step < 1) { const q = Math.min(1, w.step + dt / 0.28); w.ph -= (q - w.step) * Math.PI; w.step = q; w.fx = lerp(w.from, w.to, ease(q)); }
    if (w.jump < 0 || w.jy < 0) { w.jy += w.jump * dt; w.jump += G * N * dt; if (w.jy > 0) { w.jy = 0; w.jump = 0; } }
    const fy = g + 0.1 * N, fh = (fy - hz) * 0.6, fx = w.fx * N, lean = Math.sin(f.beat.phase * TAU) * 0.08, col = lit ? BLACK : FIG;
    shadow(r, fx, fy, fh * 0.25, lit ? LMID : DARK + DIM);
    const J = walker(r, fx + lean * fh, fy + w.jy, fh, col, w.ph, w.dir, { coat: true });
    for (const k of [-1, 1]) r.stroke(fx + lean * fh + k * J.hw, J.sy, fx + lean * fh + k * fh * 0.3 + Math.sin(t * 3 + k) * fh * 0.1, J.top - fh * 0.2, px(fh * 0.06), col); // J already rides the jump
    targets.push({ x: fx - fh * 0.35, y: fy - fh * 1.2 + w.jy, w: fh * 0.7, h: fh * 1.2 });
    if (lit) s.shake = Math.max(s.shake, 0.05);
  },
};

// ---------------------------------------------------------------------------------------------- trunkshot
// The look up out of a car trunk: a dark rim round a piece of sky and three silhouettes leaning in over it, heads
// nodding on the beat, one pointing down at the lens on a snare, a cigarette end glowing on the notes, the car
// rocking on the kicks. A drop lowers the lid to black and lifts it again on the next bar. Kinds: day with clouds,
// night with headlights, rain that falls into the lens and splashes on it.
const SKIES = { day: [3, 2, 1], night: [1, 2, 2], rain: [1, 2, 3] };
const trunkshot = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { sky: rollW(rnd, SKIES, band), lid: 0, closing: false, point: -1, pointT: 0, ember: 0, jolt: 0, drops: [], splashes: [], twinkle: 0,
      men: [{ ax: 0.08, ay: 0.5, ux: 1, uy: -0.1 }, { ax: 0.38, ay: 0.12, ux: 0.35, uy: 1 }, { ax: 0.88, ay: 0.3, ux: -0.8, uy: 0.6 }].map((m, i) => ({ ...m, hat: i !== 1, sway: rnd() * TAU })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, tt = t * 12 | 0, buf = r.buf;
    const ox0 = 0.08 * N, oy0 = 0.12 * N, ow = 0.84 * N, oh = 0.72 * N, R = 0.14 * N, cx = 0.5 * N, cy = 0.48 * N, SK = w.sky;
    for (const h of hits) {
      if (isLow(h)) { w.jolt = 0.15; s.shake = Math.max(s.shake, 0.2 * h.strength); }
      else if (h.kind === 'snare') { w.point = (w.point + 1) % 3; w.pointT = 0.7; }
      else if (h.kind === 'hat') w.twinkle = 0.1;
      if (isTonal(h)) w.ember = 1;
    }
    if (f.section === 'drop') w.closing = true;
    else if (f.section === 'change') w.sky = rollW(rnd, SKIES, band);
    if (w.closing && w.lid >= 1 && onBar(W, w)) w.closing = false;
    w.lid = clamp(w.lid + (w.closing ? 1 : -1) * dt * bps);
    w.pointT -= dt; w.jolt -= dt; w.twinkle -= dt; w.ember -= dt * 2;
    // the sky of the kind: a sun and clouds, stars and headlights, or rain falling into the lens
    if (SK === 'day') {
      r.fill(LMID);
      r.disc(0.7 * N, 0.3 * N, 0.07 * N * (1 + 0.1 * f.bright), BRIGHT);
      r.ring(0.7 * N, 0.3 * N, 0.11 * N, px(u), BRIGHT + DIM);
      for (let k = 0; k < 5; k++) { const x = ((hash(k, 3) + t * 0.01) % 1.2) * N - 0.1 * N, y = (0.15 + hash(k, 4) * 0.6) * N; oval(r, x, y, (0.08 + hash(k, 5) * 0.06) * N, 0.03 * N, w.twinkle > 0 && k === tt % 5 ? WHITE : BRIGHT); }
    } else if (SK === 'night') {
      r.fill(DARK);
      for (let k = 0; k < 70; k++) r.set(hash(k, 1) * N, hash(k, 2) * N, hash(k, w.twinkle > 0 ? tt : 9) < 0.2 ? BRIGHT : LMID + DIM);
      r.poly([[0, 0.3 * N], [0, 0.7 * N], [0.6 * N, 0.62 * N], [0.6 * N, 0.38 * N]], DARK + DIM);
      for (const y of [0.42, 0.56]) { r.disc(0.1 * N, y * N, 0.05 * N, BRIGHT); r.ring(0.1 * N, y * N, 0.075 * N, px(u), LMID); }
    } else {
      r.fill(MID);
      r.disc(0.65 * N, 0.2 * N, 0.09 * N, LMID + DIM);
      const want = Math.round(20 + 40 * clamp(f.rel.trebDrive));
      while (w.drops.length < want) w.drops.push({ X: (rnd() - 0.5) * 2, Y: (rnd() - 0.5) * 2, h: 1 + rnd() * 6 });
      w.drops = w.drops.filter((d) => { // a drop at height h over the lens lands at c + (X, Y) K / h: it rushes outward as it falls
        d.h -= dt * 4;
        if (d.h < 0.08) { const sx = cx + (d.X * 0.3 * N) / 0.08, sy = cy + (d.Y * 0.3 * N) / 0.08; if (sx > -0.05 * N && sx < 1.05 * N && sy > -0.05 * N && sy < 1.05 * N) w.splashes.push({ x: sx, y: sy, t: 0 }); return false; }
        const k = (0.3 * N) / d.h, k2 = (0.3 * N) / (d.h + 0.15);
        r.line(cx + d.X * k2, cy + d.Y * k2, cx + d.X * k, cy + d.Y * k, LMID);
        return true;
      });
      if (w.drops.length > want) w.drops.length = want;
    }
    // the three over the rim: a body in from the edge, a big head near the lens, a hat, the nod, the arm that points
    const ptCol = SK === 'day' ? BLACK : BLACK;
    w.men.forEach((m, i) => {
      const jolt = w.jolt > 0 ? (hash(i, tt) - 0.5) * 3 * u : 0, len = Math.hypot(m.ux, m.uy), ux = m.ux / len, uy = m.uy / len, nod = f.beat.pulse * 0.03 * N + Math.sin(t * 0.7 + m.sway) * 0.01 * N * f.level;
      const ax = m.ax * N + jolt, ay = m.ay * N, L2 = 0.2 * N + nod, nx = -uy, ny = ux, hx = ax + ux * L2, hy = ay + uy * L2, sw = 0.16 * N;
      r.poly([[ax - nx * sw - ux * 0.2 * N, ay - ny * sw - uy * 0.2 * N], [ax + nx * sw - ux * 0.2 * N, ay + ny * sw - uy * 0.2 * N], [hx + nx * sw * 0.55, hy + ny * sw * 0.55], [hx - nx * sw * 0.55, hy - ny * sw * 0.55]], ptCol);
      r.disc(hx + ux * 0.07 * N, hy + uy * 0.07 * N, 0.085 * N, ptCol);
      if (m.hat) { const bx = hx + ux * 0.14 * N, by = hy + uy * 0.14 * N; r.stroke(bx - nx * 0.11 * N, by - ny * 0.11 * N, bx + nx * 0.11 * N, by + ny * 0.11 * N, px(2 * u), ptCol); r.disc(bx + ux * 0.03 * N, by + uy * 0.03 * N, 0.06 * N, ptCol); }
      if (i === 2 && w.ember > 0) r.rect(hx - nx * 0.06 * N + ux * 0.1 * N - u, hy - ny * 0.06 * N + uy * 0.1 * N - u, px(2 * u), px(2 * u), w.ember > 0.5 ? BRIGHT : HOT);
      if (w.point === i && w.pointT > 0) { // the arm toward the lens: short and thick, the hand a big disc, out fast and back slowly
        const k = w.pointT > 0.5 ? ease((0.7 - w.pointT) / 0.2) : w.pointT / 0.5, sx = ax + ux * 0.06 * N + nx * sw * 0.6, sy = ay + uy * 0.06 * N + ny * sw * 0.6;
        const ex = lerp(sx, cx, 0.45 * k), ey = lerp(sy, cy, 0.45 * k);
        r.stroke(sx, sy, ex, ey, px(4 * u + 3 * u * k), ptCol);
        r.disc(ex, ey, (0.03 + 0.04 * k) * N, ptCol);
        r.rect(ex + (cx - ex) * 0.5 - u, ey + (cy - ey) * 0.5 - u, px(2 * u), px(2 * u), ptCol);
        targets.push({ x: ex - 0.06 * N, y: ey - 0.06 * N, w: 0.12 * N, h: 0.12 * N });
      } else targets.push({ x: hx - 0.1 * N, y: hy - 0.1 * N, w: 0.2 * N, h: 0.2 * N });
    });
    w.splashes = w.splashes.filter((sp) => { sp.t += dt; r.ring(sp.x, sp.y, sp.t * 0.1 * N, px(u), sp.t < 0.1 ? BRIGHT : LMID); return sp.t < 0.4; });
    // the rim of the trunk, and the lid coming down over it: hinged along the far edge, 135 degrees open, its near edge seen
    // from the eye D below the opening (so it creeps at first and comes down fast at the end)
    const th = (1 - w.lid) * Math.PI * 0.75, D = 0.5 * oh, top = oy0 + 0.5 * oh + ((oh * Math.cos(th) - 0.5 * oh) * D) / (D + oh * Math.sin(th));
    r.rect(0, 0, N, Math.max(top, oy0), BLACK);
    r.rect(0, oy0 + oh, N, N - oy0 - oh, BLACK);
    r.rect(0, 0, ox0, N, BLACK);
    r.rect(ox0 + ow, 0, N - ox0 - ow, N, BLACK);
    for (const [kx, ky] of [[ox0 + R, oy0 + R], [ox0 + ow - R, oy0 + R], [ox0 + R, oy0 + oh - R], [ox0 + ow - R, oy0 + oh - R]]) { // the rounded corners
      const sx = kx < cx ? -1 : 1, sy = ky < cy ? -1 : 1;
      for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) if (x * x + y * y > R * R) { const yy = Math.round(ky + sy * y), xx = Math.round(kx + sx * x); if (yy >= 0 && yy < N && xx >= 0 && xx < N) buf[yy * N + xx] = BLACK; }
    }
    if (w.lid > 0 && w.lid < 1) r.rect(ox0, top - u, ow, px(u), LMID); // light along the lid's edge
    if (w.lid >= 1) r.rect(ox0 + 0.1 * N, oy0 + oh - u, ow - 0.2 * N, px(u), f.beat.pulse > 0.6 ? LMID : DARK);
  },
};

// ---------------------------------------------------------------------------------------------- rearwindow
// A courtyard at night, the building opposite a grid of windows, a silhouette scene in each: a dancer stepping on
// the beat, a pianist whose hands jump to the notes, a couple whose arms go up on the snares, a television flickering
// with the treble, a lamp and a plant, and one dark window where a cigarette end glows and flares on the kicks.
// Hats switch windows on and off. A drop puts every light out but one, and the dark window flashes on the beat.
// Kinds: brick (five by four), modern (four by three, balconies), tenement (six by five, fire escapes).
const FACADES = { brick: { cols: 5, rows: 4, ww: 0.1, wh: 0.11 }, modern: { cols: 4, rows: 3, ww: 0.15, wh: 0.15 }, tenement: { cols: 6, rows: 5, ww: 0.08, wh: 0.09 } };
const FACADE_W = { brick: [3, 2, 1], modern: [2, 2, 2], tenement: [1, 2, 3] };
function facade(w, rnd, kind) {
  const Fd = FACADES[kind], wins = [], scenes = ['smoker', 'dancer', 'dancer', 'pianist', 'couple', 'couple', 'tv', 'tv', 'pianist', 'lamp', 'lamp'];
  for (let j = 0; j < Fd.rows; j++) for (let i = 0; i < Fd.cols; i++) wins.push({ x: 0.08 + ((i + 0.5) / Fd.cols) * 0.84 - Fd.ww / 2, y: 0.08 + ((j + 0.5) / Fd.rows) * 0.7 - Fd.wh / 2, w: Fd.ww, h: Fd.wh, lit: rnd() < 0.75, scene: 'empty', hands: 0.5, handsTo: 0.5, arms: 0 });
  const order = wins.map((_, i) => i).sort((a, b) => hash(a, 77) - hash(b, 77));
  scenes.forEach((sc, k) => { if (k < order.length) { wins[order[k]].scene = sc; if (sc !== 'tv') wins[order[k]].lit = sc !== 'smoker'; } });
  w.kind = kind; w.wins = wins; w.smoker = wins.find((q) => q.scene === 'smoker') || wins[0];
}
const rearwindow = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    facade(w, rnd, rollW(rnd, FACADE_W, band));
    Object.assign(w, { blackout: 0, keep: 0, flash: 0, ember: 0, smoke: [], restore: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, tt = t * 12 | 0, Fd = FACADES[w.kind], g = 0.82 * N;
    for (const h of hits) {
      if (h.kind === 'hat') { const q = pick(rnd, w.wins); if (q.scene !== 'smoker' && w.blackout <= 0) q.lit = !q.lit; }
      else if (h.kind === 'snare') for (const q of w.wins) if (q.scene === 'couple') q.arms = 0.5;
      else if (isLow(h)) w.ember = 1;
      if (isTonal(h)) for (const q of w.wins) if (q.scene === 'pianist') q.handsTo = h.pc / 11;
    }
    if (f.section === 'drop') { w.blackout = 16 / bps; w.keep = Math.floor(rnd() * w.wins.length); w.flash = 0.07; w.flashBeats = 4; }
    else if (f.section === 'change') { facade(w, rnd, rollW(rnd, FACADE_W, band)); }
    if (w.blackout > 0) { w.blackout -= dt; if (f.beat.on && w.flashBeats > 0) { w.flash = 0.07; w.flashBeats--; } if (w.blackout <= 0) for (const q of w.wins) if (q.scene !== 'smoker' && rnd() < 0.75) q.lit = true; }
    w.ember -= dt * 1.5;
    for (const q of w.wins) { q.arms -= dt; q.hands = follow(q.hands, q.handsTo, dt, 0.06); }
    const out = w.blackout > 0, flashing = w.flash > 0;
    w.flash -= dt;
    // the facade of the kind: bricks or panels, the roofline with a water tank, balconies or fire escapes
    r.rect(0, 0.04 * N, N, g - 0.04 * N, w.kind === 'modern' ? DARK : DARK + DIM);
    if (w.kind === 'brick') { const bh = Math.max(2, Math.round(3 * u)); for (let j = 0, y = Math.round(0.04 * N); y < g; j++, y += bh) for (let x = j & 1 ? bh : 0; x < N; x += 2 * bh) if (hash(x, y) < 0.5) r.rect(x, y, px(2 * u), px(u), HOT + DIM); }
    r.rect(0.74 * N, -0.02 * N, 0.1 * N, 0.07 * N, DARK); r.poly([[0.73 * N, -0.02 * N], [0.85 * N, -0.02 * N], [0.79 * N, -0.05 * N]], DARK);
    for (const q of w.wins) {
      const x = q.x * N, y = q.y * N, ww = q.w * N, wh = q.h * N, lit = q.lit && !out || (out && w.wins[w.keep] === q && q.scene !== 'smoker');
      const dark = q.scene === 'smoker' || q.scene === 'tv', inside = lit && !dark;
      r.rect(x - u, y - u, ww + 2 * u, wh + 2 * u, MID + DIM); // the frame
      r.rect(x, y, ww, wh, inside ? LMID : DARK);
      if (q.scene === 'smoker' && flashing) { r.rect(x, y, ww, wh, WHITE); for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU + 0.3; r.line(x + ww / 2, y + wh / 2, x + ww / 2 + Math.cos(a) * 0.3 * N, y + wh / 2 + Math.sin(a) * 0.3 * N, BRIGHT); } s.shake = Math.max(s.shake, 0.2); }
      else if (q.scene === 'smoker') { // the man in the dark: a shape barely there, the ember by his head, a little smoke
        r.rect(x + ww * 0.3, y + wh * 0.35, ww * 0.4, wh * 0.65, out ? BLACK : DARK + DIM);
        r.disc(x + ww * 0.5, y + wh * 0.32, wh * 0.12, out ? BLACK : DARK + DIM);
        const glow = 0.3 + 0.3 * Math.sin(t * 1.5) + Math.max(0, w.ember);
        r.rect(x + ww * 0.62, y + wh * 0.42, px(u), px(u), glow > 0.9 ? BRIGHT : glow > 0.4 ? HOT : HOT + DIM);
        if (rnd() < dt * (2 + 9 * Math.max(0, w.ember))) w.smoke.push({ x: x + ww * 0.62, y: y + wh * 0.4, life: 1.2 });
      } else if (q.scene === 'tv') { if (lit) r.rect(x + ww * 0.15, y + wh * 0.2, ww * 0.7, wh * 0.6, hash(tt, 3) < 0.3 + 0.5 * clamp(f.rel.trebDrive) ? COOL : COOL + DIM); }
      else if (inside) {
        const fh = wh * 0.8, base = y + wh * 0.98, mx = x + ww / 2;
        if (q.scene === 'dancer') { // a step to one side and the other on the beat, one arm up
          const side = f.beat.count % 2 ? 1 : -1, dx = side * ww * 0.12 * ease(f.beat.pulse * 1.5 + 0.2), J = walker(r, mx + dx, base - f.beat.pulse * 1.5 * u, fh, FIG, side * 1.3, side);
          r.stroke(J.sx, J.sy, J.sx + side * fh * 0.15, J.top - fh * 0.15, px(fh * 0.07), FIG);
        } else if (q.scene === 'pianist') { // the keyboard, head and shoulders behind it, two hands that jump to the note
          r.rect(x + ww * 0.1, base - fh * 0.42, ww * 0.8, px(fh * 0.1), BRIGHT);
          for (let k = 0; k < 7; k++) r.rect(x + ww * (0.14 + k * 0.11), base - fh * 0.42, px(u * 0.8), px(fh * 0.06), BLACK);
          r.rect(mx - fh * 0.2, base - fh * 0.4, fh * 0.4, fh * 0.4, FIG);
          r.disc(mx, base - fh * 0.8, fh * 0.12, FIG);
          for (const k of [-1, 1]) r.rect(x + ww * (0.15 + q.hands * 0.5 + (k > 0 ? 0.15 : 0)), base - fh * 0.48, px(fh * 0.1), px(fh * 0.08), FIG);
        } else if (q.scene === 'couple') { // two facing, hands thrown up on the snare
          for (const k of [-1, 1]) { const J = walker(r, mx + k * ww * 0.2, base, fh * 0.9, FIG, 0, -k); const up = q.arms > 0; r.stroke(J.sx, J.sy, J.sx - k * fh * (up ? 0.12 : 0.25), up ? J.top - fh * 0.1 : J.sy + fh * 0.25, px(fh * 0.06), FIG); }
        } else if (q.scene === 'lamp') { r.poly([[x + ww * 0.6, y + wh * 0.5], [x + ww * 0.9, y + wh * 0.5], [x + ww * 0.85, y + wh * 0.35], [x + ww * 0.65, y + wh * 0.35]], BRIGHT); r.rect(x + ww * 0.74, y + wh * 0.5, px(u), wh * 0.45, FIG); for (let k = 0; k < 4; k++) r.line(x + ww * 0.25, base, x + ww * (0.1 + k * 0.1), y + wh * 0.5, FIG); }
        else for (const k of [0.1, 0.78]) r.rect(x + ww * k, y, ww * 0.12, wh, LMID + DIM);
        if (q.scene === 'dancer' || q.scene === 'couple') targets.push({ x, y, w: ww, h: wh });
      }
      if (w.kind === 'modern') { r.rect(x - 2 * u, y + wh, ww + 4 * u, px(1.5 * u), MID); for (let k = 0; k <= 5; k++) r.rect(x - 2 * u + (k / 5) * (ww + 4 * u), y + wh - 4 * u, px(u * 0.8), 4 * u, MID + DIM); }
    }
    if (w.kind === 'tenement') for (let i = 1; i < Fd.cols; i++) { // the fire escapes: landings between the columns and the stairs zigzagging between them
      const ex = 0.08 * N + (i / Fd.cols) * 0.84 * N, rh = (0.7 / Fd.rows) * N;
      for (let j = 0; j < Fd.rows; j++) { const ly = 0.08 * N + ((j + 0.5) / Fd.rows) * 0.7 * N + Fd.wh * N * 0.5 + u; r.rect(ex - 0.045 * N, ly, 0.09 * N, px(u), MID + DIM); r.line(ex + (j % 2 ? -0.04 : 0.04) * N, ly, ex + (j % 2 ? 0.04 : -0.04) * N, ly + rh, MID + DIM); }
    }
    w.smoke = w.smoke.filter((p) => { p.y -= dt * 3 * u * (0.4 + p.life / 1.2); p.x += Math.sin(t * 2 + p.life * 5) * dt * 2 * u; p.life -= dt; r.rect(p.x, p.y, px(u), px(u), LMID + DIM); return p.life > 0; }); // slowing as it cools
    // the yard below: a fence, a tree, a lamp post with its pool breathing on the beat
    r.rect(0, g, N, N - g, DARK);
    for (let x = 0; x < N; x += 3 * u) r.rect(x, g - 0.03 * N, px(u), 0.03 * N, DARK + DIM);
    r.rect(0.2 * N - u, g - 0.1 * N, px(2 * u), 0.1 * N, BLACK);
    r.disc(0.2 * N, g - 0.12 * N, 0.05 * N, BLACK);
    const lp = 0.78 * N, pool = 0.05 * N * (1 + 0.2 * f.beat.pulse);
    oval(r, lp, g + 0.02 * N, pool, pool * 0.3, out ? DARK + DIM : LMID + DIM);
    r.rect(lp - u * 0.5, g - 0.12 * N, px(u), 0.14 * N, BLACK);
    r.disc(lp, g - 0.12 * N, 1.5 * u, out ? DARK : BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- birdsonwires
// Telephone wires sagging between two poles, a schoolyard climbing frame below. A bird flies in every beat and
// lands on the next: a flap, a settle, the wire dips under it and springs (two modes of a plucked string, the sag
// deepening with the load), more of them as the music builds, the frame filling once the wires are full. Kicks tug
// the wires, snares make a few hop to another perch, hats ruffle one, a note turns a head. A drop puts the whole
// flock up at once in a swirl, and they come back two a beat. Kinds: three wires at dawn, four at noon, five in a storm.
const SKYLINES = { dawn: { n: 3, sky: [MID + DIM, MID, LMID], wind: 0.2 }, noon: { n: 4, sky: [LMID, LMID, BRIGHT], wind: 0.1 }, storm: { n: 5, sky: [DARK, DARK + DIM, MID + DIM], wind: 1 } };
const SKYLINE_W = { dawn: [3, 2, 1], noon: [2, 2, 2], storm: [1, 2, 3] };
const SLOTS = 9;
function wiresOf(w, rnd, N, kind) {
  const n = SKYLINES[kind].n;
  w.kind = kind;
  w.wires = Array.from({ length: n }, (_, k) => ({ y0: (0.26 + k * 0.065) * N, y1: (0.27 + k * 0.065 + (rnd() - 0.5) * 0.02) * N, sag: (0.045 + k * 0.008) * N, d1: 0, v1: 0, d2: 0, v2: 0 }));
  w.birds = [];
}
const birdsonwires = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    wiresOf(w, rnd, N, rollW(rnd, SKYLINE_W, band));
    Object.assign(w, { flock: 0, fc: 0, N });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, SKY = SKYLINES[w.kind], g = 0.88 * N;
    if (w.N !== N) { wiresOf(w, rnd, N, w.kind); w.N = N; }
    const x0 = 0.08 * N, x1 = 0.92 * N, wind = SKY.wind * (0.3 + clamp(f.rel.trebDrive)), T = beatLocked(f) ? 1 / bps : 0.5;
    const load = new Float32Array(6);
    for (const b of w.birds) if (b.state === 'perch' && b.wire >= 0) load[b.wire]++;
    const wireY = (k, q) => { const wr = w.wires[k]; return lerp(wr.y0, wr.y1, q) + wr.sag * (1 + 0.1 * load[k]) * 4 * q * (1 - q) + wr.d1 * Math.sin(Math.PI * q) + wr.d2 * Math.sin(TAU * q); };
    const wireX = (k, q) => lerp(x0, x1, q) + Math.sin(t * 1.3 + k) * wind * 0.012 * N * Math.sin(Math.PI * q);
    const fcx = 0.5 * N, FR = 0.15 * N, sz = 0.03 * N; // the climbing frame: a dome of three arcs; the birds' size
    const frameSlot = (i) => { const ring = i < 5 ? FR : FR * 0.66, a = i < 5 ? 0.35 + (i / 4) * 2.44 : 0.5 + ((i - 5) / 3) * 2.14; return [fcx + Math.cos(a) * ring, g - Math.sin(a) * ring * 0.55]; };
    const taken = (k, slot) => w.birds.some((b) => b.wire === k && b.slot === slot && b.state !== 'flock' && b.state !== 'leave');
    const freeSlot = () => { // a free perch: on the wires first, then on the frame
      for (let k = 0; k < 40; k++) { const wi = Math.floor(rnd() * w.wires.length), sl = Math.floor(rnd() * SLOTS); if (!taken(wi, sl)) return [wi, sl]; }
      for (let k = 0; k < 20; k++) { const sl = Math.floor(rnd() * 9); if (!taken(-1, sl)) return [-1, sl]; }
      return null;
    };
    const perchAt = (b) => (b.wire >= 0 ? [wireX(b.wire, 0.1 + (0.8 * b.slot) / (SLOTS - 1)), wireY(b.wire, 0.1 + (0.8 * b.slot) / (SLOTS - 1))] : frameSlot(b.slot));
    const unload = (b) => { // a bird leaving its wire lets it spring back up
      if (b.wire >= 0 && b.state === 'perch') { const q = 0.1 + (0.8 * b.slot) / (SLOTS - 1), wr = w.wires[b.wire]; wr.v1 -= 0.3 * N * Math.sin(Math.PI * q); wr.v2 -= 0.2 * N * Math.sin(TAU * q); }
    };
    const send = (b, to) => { unload(b); b.wire = to[0]; b.slot = to[1]; b.state = 'fly'; b.sx = b.x; b.sy = b.y; b.k = 0; b.T = T; };
    for (const h of hits) {
      if (isLow(h)) for (const wr of w.wires) wr.v1 += (rnd() - 0.5) * 0.3 * N * h.strength;
      else if (h.kind === 'snare') { for (let n = 0; n < 3; n++) { const b = pick(rnd, w.birds); if (b && b.state === 'perch') { const to = freeSlot(); if (to) send(b, to); } } }
      else if (h.kind === 'hat') { const b = pick(rnd, w.birds); if (b && b.state === 'perch') b.ruffle = 0.12; }
      if (isTonal(h)) { const b = pick(rnd, w.birds); if (b && b.state === 'perch') b.dir = h.pc % 2 ? 1 : -1; }
    }
    if (f.section === 'drop') { // all up at once; the wires spring back up
      w.flock = 8 / bps; w.fc = 0;
      for (const b of w.birds) if (b.state !== 'fly') { const p = perchAt(b); b.x = p[0]; b.y = p[1] - sz * 0.3; b.state = 'flock'; b.vx = (rnd() - 0.5) * 0.4 * N; b.vy = -(0.2 + rnd() * 0.3) * N; }
      for (const wr of w.wires) wr.v1 -= 0.25 * N;
    } else if (f.section === 'change') { const kind = rollW(rnd, SKYLINE_W, band); if (kind !== w.kind) { wiresOf(w, rnd, N, kind); load.fill(0); } }
    w.flock -= dt;
    w.fc += dt * 1.2;
    const want = Math.min(w.wires.length * SLOTS + 9, 4 + Math.round(18 * clamp(f.level * 0.7 + 0.5 * clamp(f.rel.bassDrive))));
    if (f.beat.on) {
      if (w.flock > 0) { /* still swirling */ }
      else if (w.birds.some((b) => b.state === 'flock')) { for (let n = 0; n < 2; n++) { const b = w.birds.find((q) => q.state === 'flock'); const to = b && freeSlot(); if (to) send(b, to); } }
      else if (w.birds.length < want) { const to = freeSlot(); if (to) { const side = rnd() < 0.5 ? -1 : 1, b = { x: side < 0 ? -0.04 * N : 1.04 * N, y: (0.1 + rnd() * 0.3) * N, dir: -side, ruffle: 0, settle: 0, flap: rnd() * TAU }; send(b, to); w.birds.push(b); } }
      else if (w.birds.length > want + 3) { const b = w.birds.find((q) => q.state === 'perch'); if (b) { const p = perchAt(b); unload(b); b.x = p[0]; b.y = p[1] - sz * 0.3; b.state = 'leave'; b.vx = b.dir * 0.3 * N; b.vy = -0.1 * N; } }
    }
    // the wires ring: two modes of a plucked string, damped, stepped finely enough to stay put at any frame time
    for (const wr of w.wires) for (let n = Math.ceil(dt / 0.02), h = dt / n; n > 0; n--) {
      wr.v1 += (-60 * wr.d1 - 3 * wr.v1) * h; wr.d1 += wr.v1 * h;
      wr.v2 += (-240 * wr.d2 - 5 * wr.v2) * h; wr.d2 += wr.v2 * h;
    }
    // the sky of the kind, a low sun at dawn, the poles with their crossarms, the ground, the frame
    r.rect(0, 0, N, 0.3 * N, SKY.sky[0]); r.rect(0, 0.3 * N, N, 0.3 * N, SKY.sky[1]); r.rect(0, 0.6 * N, N, g - 0.6 * N, SKY.sky[2]);
    if (w.kind === 'dawn') r.disc(0.2 * N, 0.72 * N, 0.07 * N, HOT);
    if (w.kind === 'storm') for (let k = 0; k < 40; k++) r.line(hash(k, 1) * N + (t * 0.3 % 1) * N - 0.5 * N, hash(k, 2) * g, hash(k, 1) * N + (t * 0.3 % 1) * N - 0.5 * N - wind * 3 * u, hash(k, 2) * g + 4 * u, MID + DIM);
    r.rect(0, g, N, N - g, MID + DIM);
    for (const xp of [x0, x1]) { r.rect(xp - 1.5 * u, 0.2 * N, px(3 * u), g - 0.2 * N, BLACK); r.rect(xp - 0.04 * N, 0.24 * N, 0.08 * N, px(1.5 * u), BLACK); r.rect(xp - 0.04 * N, 0.305 * N, 0.08 * N, px(1.5 * u), BLACK); }
    for (const sc of [1, 0.66, 0.33]) r.ring(fcx, g, FR * sc, px(1.2 * u), BLACK, 0.55);
    for (let k = 0; k < 7; k++) { const a = 0.2 + (k / 6) * 2.74; r.line(fcx, g - FR * 0.55, fcx + Math.cos(a) * FR, g - Math.sin(a) * FR * 0.55, BLACK); }
    r.rect(0, g + 1, N, N - g, MID + DIM);
    for (let k = 0; k < w.wires.length; k++) { // each wire as a polyline through its sag and its two modes
      let lx = wireX(k, 0), ly = wireY(k, 0);
      for (let i = 1; i <= 24; i++) { const q = i / 24, x = wireX(k, q), y = wireY(k, q); r.line(lx, ly, x, y, BLACK); lx = x; ly = y; }
    }
    // the birds: in flight toward a perch (an easing swoop that comes up to the wire), perched on the moving wire,
    // swirling as a flock about a centre that circles, or leaving
    const C = [0.5 * N + Math.cos(w.fc) * 0.18 * N, 0.42 * N + Math.sin(w.fc) * 0.1 * N];
    w.birds = w.birds.filter((b) => {
      b.ruffle -= dt; b.settle -= dt;
      if (b.state === 'fly') {
        b.k = Math.min(1, b.k + dt / b.T);
        const p = perchAt(b), e = ease(b.k);
        b.x = lerp(b.sx, p[0], e); b.y = lerp(b.sy, p[1] - sz * 0.3, e) + Math.sin(Math.PI * b.k) * 0.06 * N; // up to where it sits on the wire
        b.dir = p[0] > b.sx ? 1 : -1;
        b.flap += dt * 22;
        if (b.k >= 1) { b.state = 'perch'; b.settle = 0.3; if (b.wire >= 0) { const q = 0.1 + (0.8 * b.slot) / (SLOTS - 1), wr = w.wires[b.wire]; wr.v1 += 0.35 * N * Math.sin(Math.PI * q); wr.v2 += 0.25 * N * Math.sin(TAU * q); } }
        bird(r, b.x, b.y, sz, BLACK, Math.sin(b.flap), b.dir);
      } else if (b.state === 'perch') {
        const p = perchAt(b), bob = b.settle > 0 ? Math.sin((b.settle / 0.3) * TAU) * 1.5 * u : 0;
        b.x = p[0]; b.y = p[1] - sz * 0.3 + bob;
        bird(r, b.x, b.y, sz, BLACK, b.ruffle > 0 ? 0.8 : 0, b.dir);
      } else if (b.state === 'flock') { // boids-lite: toward the centre, round it, a little of its own
        const dx = C[0] - b.x, dy = C[1] - b.y, d = Math.hypot(dx, dy) || 1, own = hash(b.slot + 3, (t * 2) | 0) - 0.5;
        b.vx += ((dx / d) * 1.4 + (-dy / d) * 1.1 + own) * N * dt; b.vy += ((dy / d) * 1.4 + (dx / d) * 1.1 + own * 0.5) * N * dt;
        const sp = Math.hypot(b.vx, b.vy) || 1, cap = clamp(sp, 0.25 * N, 0.5 * N); b.vx *= cap / sp; b.vy *= cap / sp;
        b.x += b.vx * dt; b.y += b.vy * dt; b.dir = b.vx > 0 ? 1 : -1; b.flap += dt * 20;
        bird(r, b.x, b.y, sz, BLACK, Math.sin(b.flap), b.dir);
      } else { b.vy -= 0.05 * N * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.flap += dt * 20; bird(r, b.x, b.y, sz, BLACK, Math.sin(b.flap), b.dir); if (b.x < -0.08 * N || b.x > 1.08 * N || b.y < -0.05 * N) return false; }
      return true;
    });
    const fliers = w.birds.filter((b) => b.state === 'fly' || b.state === 'flock');
    if (fliers.length) { const b = fliers[0]; targets.push({ x: b.x - sz, y: b.y - sz, w: 2 * sz, h: 2 * sz }); }
    else targets.push({ x: x0, y: 0.24 * N, w: x1 - x0, h: 0.1 * N });
    if (w.flock > 0) s.shake = Math.max(s.shake, 0.05);
  },
};

// ---------------------------------------------------------------------------------------------- seventhseal
// A stony beach: a hooded figure and a knight over a chessboard laid in perspective, the knight's piece moving on
// the bar and the hood's on the beat after, waves rolling in from the horizon and breaking on the shingle (harder
// on the kicks), gulls crossing on the hats, the sea glinting in a column on the notes. A drop: a chain of
// silhouettes hand in hand dances along the ridge against a lit sky, one step a beat, the one with the scythe in
// front. Kinds: the weather (overcast, backlit, storm).
const SHORES = { overcast: { sky: [MID, MID + DIM, LMID], sea: DARK, foam: LMID, gulls: 3 }, backlit: { sky: [DARK, MID, BRIGHT], sea: DARK + DIM, foam: BRIGHT, gulls: 4 }, storm: { sky: [DARK + DIM, DARK, MID + DIM], sea: DARK + DIM, foam: BRIGHT, gulls: 6 } };
const SHORE_W = { overcast: [3, 2, 1], backlit: [2, 2, 2], storm: [1, 2, 3] };
function piece(r, x, y, sc, kind, c) {
  if (kind === 0) { r.rect(x - sc * 0.4, y - sc * 0.3, sc * 0.8, sc * 0.3, c); r.disc(x, y - sc * 0.55, sc * 0.3, c); }
  else if (kind === 1) { r.rect(x - sc * 0.4, y - sc * 0.9, sc * 0.8, sc * 0.9, c); r.rect(x - sc * 0.15, y - sc * 1.05, sc * 0.3, sc * 0.2, c === BRIGHT ? BLACK : BRIGHT); }
  else if (kind === 2) { r.rect(x - sc * 0.35, y - sc * 0.3, sc * 0.7, sc * 0.3, c); oval(r, x, y - sc * 0.7, sc * 0.28, sc * 0.45, c); r.rect(x - u1(sc), y - sc * 1.25, px(u1(sc) * 2), sc * 0.15, c); }
  else { r.rect(x - sc * 0.4, y - sc * 0.3, sc * 0.8, sc * 0.3, c); r.rect(x - sc * 0.22, y - sc * 1.1, sc * 0.44, sc * 0.8, c); r.disc(x, y - sc * 1.25, sc * 0.2, c); }
}
const u1 = (sc) => Math.max(0.5, sc * 0.08);
const seventhseal = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    const pieces = [];
    const spots = new Set();
    for (let k = 0; k < 12; k++) { let c, rw; do { c = Math.floor(rnd() * 8); rw = k < 6 ? Math.floor(rnd() * 3) : 5 + Math.floor(rnd() * 3); } while (spots.has(rw * 8 + c)); spots.add(rw * 8 + c); pieces.push({ c, rw, fc: c, fr: rw, k: 1, side: k < 6 ? 1 : 0, kind: k % 6 < 3 ? 0 : (k % 6) - 2 }); }
    Object.assign(w, { shore: rollW(rnd, SHORE_W, band), pieces, gulls: [], foam: [], glint: -1, glintT: 0, dance: 0, head: 0.05, headTo: 0.05, step: 1, dph: 0, reach: 0, flutter: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, SH = SHORES[w.shore];
    const hz = 0.47 * N, shore = 0.62 * N, K = 0.55 * N, cx = 0.5 * N, Pj = (X, z) => [cx + (X * K) / z, hz + K / z];
    let hardWave = 0;
    for (const h of hits) {
      if (isLow(h)) hardWave = Math.max(hardWave, h.strength);
      else if (h.kind === 'snare') { w.flutter = 0.3; for (const gl of w.gulls) gl.flap += 2; }
      else if (h.kind === 'hat' && w.gulls.length < SH.gulls) w.gulls.push({ x: rnd() < 0.5 ? -0.05 * N : 1.05 * N, y: (0.08 + rnd() * 0.25) * N, dir: 0, flap: rnd() * TAU, sp: (0.08 + rnd() * 0.06) * N });
      if (isTonal(h)) { w.glint = h.pc / 11; w.glintT = 0.4; }
    }
    for (const gl of w.gulls) if (!gl.dir) gl.dir = gl.x < 0 ? 1 : -1;
    if (f.section === 'drop') { w.dance = 32 / bps; w.head = 0.02; w.headTo = 0.02; }
    else if (f.section === 'change') w.shore = rollW(rnd, SHORE_W, band);
    w.dance -= dt; w.glintT -= dt; w.flutter -= dt; w.reach -= dt;
    // the sky in three bands, the headland on the right, the sea with its waves, the shingle
    r.rect(0, 0, N, 0.2 * N, SH.sky[0]); r.rect(0, 0.2 * N, N, 0.15 * N, SH.sky[1]); r.rect(0, 0.35 * N, N, hz - 0.35 * N, SH.sky[2]);
    const ridge = (q) => [0.5 * N + q * 0.5 * N, hz - 0.02 * N - Math.sin(Math.min(1, q * 1.3) * Math.PI * 0.5) * 0.2 * N + Math.sin(q * 9) * 0.01 * N];
    if (w.dance > 0) for (let i = 1; i <= 24; i++) { const a = ridge((i - 1) / 24), b = ridge(i / 24); r.stroke(a[0], a[1] - 0.05 * N, b[0], b[1] - 0.05 * N, 0.1 * N, LMID); r.stroke(a[0], a[1] - 0.02 * N, b[0], b[1] - 0.02 * N, 0.04 * N, BRIGHT); }
    const rp = [[0.5 * N, hz]]; for (let i = 0; i <= 24; i++) rp.push(ridge(i / 24)); rp.push([N, hz + 0.02 * N]);
    r.poly(rp, DARK);
    r.rect(0, hz, N, shore - hz, SH.sea);
    for (let k = 0; k < 4; k++) { // the crests a wavelength apart on the water, coming in at one speed: y = hz + K / z, so nearer ones are lower, farther apart and thicker; white at the shingle
      const q = (f.rel.bassClock * 0.22 + k / 4) % 1, dd = 1 / (4 - 3 * q), y = hz + (shore - hz) * dd, th = px(u * 2.5 * dd), breaking = q > 0.9;
      for (let x = 0; x < N; x += 2) r.rect(x, y + Math.sin((x / N) * TAU * 2 + k * 1.7 + t * 0.5) * 1.5 * u * dd, 2, th, breaking ? SH.foam : LMID + DIM);
      if (breaking && (hardWave > 0 || rnd() < dt * 9)) burst(w.foam, rnd, rnd() * N, shore - u, hardWave > 0 ? 4 : 1, (0.05 + 0.1 * hardWave) * N, SH.foam, 0.5);
    }
    if (hardWave > 0) r.rect(0, shore - 2 * u, N, px(2 * u), SH.foam);
    if (w.glintT > 0) for (let k = 0; k < 8; k++) r.rect(w.glint * N + (hash(k, 3) - 0.5) * 0.05 * N, hz + hash(k, 4) * (shore - hz), px(u), px(u), BRIGHT);
    r.rect(0, shore, N, N - shore, MID + DIM);
    for (let k = 0; k < 90; k++) { const q = hash(k, 5), y = shore + q * q * (N - shore); r.rect(hash(k, 6) * N, y, px(u * (0.5 + 2 * q)), px(u * (0.4 + 1.2 * q)), DARK); }
    w.foam = particles(W, w.foam, SH.foam);
    // the board in perspective, eight ranks foreshortened, the pieces on it (white near, black far), a move a bar
    const z0 = 1.35, z1 = 2.1, dz = (z1 - z0) / 8, X0 = -0.55, dX = 1.1 / 8;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) r.poly([Pj(X0 + j * dX, z0 + i * dz), Pj(X0 + (j + 1) * dX, z0 + i * dz), Pj(X0 + (j + 1) * dX, z0 + (i + 1) * dz), Pj(X0 + j * dX, z0 + (i + 1) * dz)], (i + j) & 1 ? BLACK : LMID);
    const bar = onBar(W, w), after = beatLocked(f) ? f.beat.on && f.beat.count % 4 === 1 : false;
    const move = (side) => {
      const mine = w.pieces.filter((p) => p.side === side && p.k >= 1);
      for (let n = 0; n < 12 && mine.length; n++) {
        const p = pick(rnd, mine), dc = Math.floor(rnd() * 3) - 1, dr = Math.floor(rnd() * 3) - 1, c = p.c + dc, rw = p.rw + dr;
        if ((!dc && !dr) || c < 0 || c > 7 || rw < 0 || rw > 7 || w.pieces.some((q) => q.c === c && q.rw === rw)) continue;
        p.fc = p.c; p.fr = p.rw; p.c = c; p.rw = rw; p.k = 0;
        return true;
      }
      return false;
    };
    if (bar) move(0);
    if (after || (!beatLocked(f) && w.barT >= 1 / bps && w.barT - dt < 1 / bps)) { if (move(1)) w.reach = 0.6; } // the hood answers on the beat after
    for (const p of w.pieces.slice().sort((a, b) => b.rw - a.rw)) { // far ranks first
      p.k = Math.min(1, p.k + dt / 0.3);
      const e = ease(p.k), c = lerp(p.fc, p.c, e), rw = lerp(p.fr, p.rw, e), z = z1 - (rw + 0.5) * dz, [x, y] = Pj(X0 + (c + 0.5) * dX, z);
      piece(r, x, y - Math.sin(p.k * Math.PI) * 2 * u, (0.07 * K) / z, p.kind, p.side ? BLACK : BRIGHT);
    }
    // the players: the hood behind the far corner reaching for its piece, the knight kneeling at the near corner
    const [hx, hy] = Pj(0.75, 2.35), hh = (0.75 * K) / 2.35, J = hooded(r, hx, hy, hh, BLACK, w.flutter > 0 ? Math.sin(t * 30) * 0.5 : 0);
    if (w.reach > 0) { const [tx, ty] = Pj(0.1, 1.9); r.stroke(J.sx - hh * 0.2, J.sy, lerp(J.sx, tx, Math.sin(Math.min(1, w.reach / 0.6) * Math.PI)), lerp(J.sy, ty, Math.sin(Math.min(1, w.reach / 0.6) * Math.PI)), px(hh * 0.07), BLACK); }
    const [kx, ky] = Pj(-0.85, 1.25), kh = (0.7 * K) / 1.25, Jk = walker(r, kx, ky, kh, FIG, 0, 1, { coat: true });
    r.disc(kx, Jk.head, kh * 0.14, FIG);
    r.rect(kx - kh * 0.24, Jk.sy + kh * 0.15, px(kh * 0.05), kh * 0.35, LMID); // the sword at the hip
    targets.push({ x: hx - hh * 0.3, y: hy - hh, w: hh * 0.6, h: hh });
    // the gulls, the dance along the ridge: a chain hand in hand, one step a beat, the scythe in front
    w.gulls = w.gulls.filter((gl) => { gl.x += gl.dir * gl.sp * dt; gl.y += Math.sin(t * 2 + gl.flap) * dt * 2 * u; gl.flap += dt * 9; const fl = Math.sin(gl.flap) * 2 * u; r.line(gl.x - 3 * u, gl.y - fl, gl.x, gl.y, SH.sky[0] === DARK + DIM ? LMID : DARK); r.line(gl.x, gl.y, gl.x + 3 * u, gl.y - fl, SH.sky[0] === DARK + DIM ? LMID : DARK); return gl.x > -0.1 * N && gl.x < 1.1 * N; });
    if (w.dance > 0) {
      if (f.beat.on) { w.headTo += 0.045; w.step = 0; }
      if (w.step < 1) { const q = Math.min(1, w.step + dt / 0.3); w.dph += (q - w.step) * Math.PI; w.step = q; }
      w.head = follow(w.head, w.headTo, dt, 0.1);
      const dh = 0.085 * N;
      let prev = null;
      for (let i = 0; i < 8; i++) {
        const q = w.head - i * 0.065;
        if (q < 0 || q > 1) { prev = null; continue; }
        const [x, y] = ridge(q), hop = Math.abs(Math.sin(w.dph + i * 0.4)) * 1.5 * u;
        const Jd = i === 0 ? hooded(r, x, y - hop, dh, BLACK) : walker(r, x, y - hop, dh * (0.85 + hash(i, 2) * 0.3), BLACK, w.dph + i * 0.4, 1, { coat: i % 2 === 0, hat: i % 3 === 0 });
        const hand = [x - dh * 0.2, y - hop - dh * 0.45];
        if (prev) r.line(prev[0], prev[1], hand[0] + dh * 0.4, hand[1], BLACK);
        prev = hand;
        if (i === 0) { r.line(x + dh * 0.2, y - hop, x + dh * 0.3, y - hop - dh * 1.3, BLACK); r.stroke(x + dh * 0.3, y - hop - dh * 1.3, x - dh * 0.05, y - hop - dh * 1.5, px(1.5 * u), BLACK); }
        if (i === 0) targets.push({ x: x - dh * 0.4, y: y - hop - dh * 1.6, w: dh * 0.8, h: dh * 1.6 });
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------- zone
// A rail trolley into the zone, from the trolley: the rails to one vanishing point, a sleeper a beat passing under,
// the wheels clicking on a joint every bar, the backs of two heads riding in front of us, long grass waving with
// the treble on both banks, trees going by in parallax. A kick throws a bolt with a ribbon tied to it, a true
// parabola ahead of the trolley, the ribbon trailing, the bolt then lying in the grass and passing us. A section
// change is a room where water drips from the ceiling, a drop landing on every beat, ripples where they land. A drop
// stops the trolley for a black dog crossing the rails ahead. Kinds: sepia, colour, night with a lamp on the near rails.
const MOODS = { sepia: { sky: LMID, haze: LMID + DIM, ground: MID + DIM, grass: MID, rail: LMID + DIM, tie: DARK + DIM, tree: DARK }, colour: { sky: BRIGHT, haze: LMID, ground: DARK + DIM, grass: COOL, rail: LMID, tie: DARK, tree: DARK + DIM }, night: { sky: DARK, haze: DARK + DIM, ground: BLACK, grass: DARK, rail: LMID, tie: DARK + DIM, tree: BLACK } };
const MOOD_W = { sepia: [3, 2, 1], colour: [2, 2, 2], night: [1, 2, 3] };
const zone = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { mood: rollW(rnd, MOOD_W, band), dist: 0, off: null, relock: true, sp: 1, joint: 0, bob: 0, bolt: null, trail: [], arm: 0, room: 0, drips: [], ripples: [], splash: [], sched: -1, stop: 0, dog: null,
      grass: Array.from({ length: 170 }, () => ({ X: (1 + rnd() * 2.6) * (rnd() < 0.5 ? -1 : 1), z: rnd() * 28, h: 0.25 + rnd() * 0.3, s: rnd() * TAU })),
      trees: Array.from({ length: 9 }, (_, i) => ({ X: (2.5 + rnd() * 4) * (i % 2 ? -1 : 1), z: rnd() * 40, h: 1.5 + rnd() * 1.5 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, MD = MOODS[w.mood];
    const hz = 0.45 * N, cx = 0.5 * N, K = 0.5 * N, P = (X, Y, z) => [cx + (X * K) / z, hz + (Y * K) / z], locked = beatLocked(f);
    for (const h of hits) if (isLow(h) && !w.bolt && w.room <= 0) { // the bolt, thrown ahead from the right-hand rider
      w.bolt = { X: 0.5, Y: 0.35, z: w.dist + 0.9, vX: (rnd() - 0.5) * 0.5, vY: -(1.4 + 0.5 * h.strength), vz: 2.2 + h.strength + bps * w.sp, down: false, t: 0 }; // the thrower's own speed goes with it
      w.trail.length = 0; w.arm = 0.3;
    }
    if (f.section === 'drop') { w.stop = 16 / bps; w.dog = { X: 4.5, ph: 0 }; }
    else if (f.section === 'change') { w.mood = rollW(rnd, MOOD_W, band); w.room = 8 / bps; w.drips.length = 0; w.ripples.length = 0; w.sched = -1; }
    w.stop -= dt; w.arm -= dt; w.bob *= Math.exp(-dt * 8);
    // the travel: a sleeper a beat, locked to the beat's phase while rolling, braked to a stop for the dog
    w.sp = follow(w.sp, w.stop > 0 ? 0 : 1, dt, 0.5);
    if (w.off === null) w.off = -(f.beat.count + f.beat.phase);
    if (locked && w.sp > 0.98) { if (w.relock) { w.off = w.dist - (f.beat.count + f.beat.phase); w.relock = false; } w.dist = f.beat.count + f.beat.phase + w.off; }
    else { w.dist += dt * bps * w.sp; w.relock = true; }
    const joint = Math.floor(w.dist / 4);
    if (joint !== w.joint) { w.joint = joint; w.bob = 1; s.shake = Math.max(s.shake, 0.1 * w.sp); }
    if (w.room > 0) { // the room: a window's light on the wet floor, a figure sat by the wall, the drips with gravity and their rings
      w.room -= dt;
      r.fill(DARK);
      const fy = 0.7 * N;
      r.rect(0, fy, N, N - fy, DARK + DIM);
      r.rect(0.1 * N, 0.12 * N, 0.08 * N, 0.3 * N, LMID);
      for (let y = Math.round(0.12 * N); y < N; y++) { const q = (y - 0.12 * N) / (0.88 * N), x0 = 0.18 * N + q * 0.25 * N, x1 = x0 + 0.08 * N + q * 0.3 * N; for (let x = Math.round(x0); x < x1; x++) if (hash(x, y) < 0.45 - 0.25 * q) r.buf[y * N + x] = y < fy ? MID + DIM : LMID + DIM; }
      hooded(r, 0.8 * N, fy + 0.06 * N, 0.2 * N, BLACK);
      const floorOf = (d) => fy + 0.03 * N + d * 0.2 * N, fall = Math.sqrt((2 * floorOf(0.5)) / (G * N)); // the fall from the ceiling to the middle of the floor
      w.drips = w.drips.filter((d) => {
        d.y += d.vy * dt + 0.5 * G * N * dt * dt; d.vy += G * N * dt; // exact under one gravity, so the landing does not drift with the frame time
        const floor = floorOf(d.d);
        r.rect(d.x, d.y - 2 * u, px(u), 3 * u, LMID);
        if (d.y >= floor) { w.ripples.push({ x: d.x, y: floor, t: 0, sc: 0.6 + d.d }); for (let k = 0; k < 3; k++) w.splash.push({ x: d.x, y: floor, vx: (rnd() - 0.5) * 0.08 * N, vy: -0.12 * N * rnd(), life: 0.25 }); return false; }
        return true;
      });
      if (locked) { // one drip a beat, let go `fall` seconds before it (advanced by what this frame is late) so it lands on the beat; new ones start next frame
        if (w.sched < f.beat.count) w.sched = f.beat.count;
        for (let n = 0; n < 4; n++) {
          const ttb = (w.sched + 1 - f.beat.count - f.beat.phase) / bps;
          if (ttb > fall) break;
          w.sched++;
          const late = fall - ttb;
          if (late < 0.25) w.drips.push({ x: 0.55 * N, y: 0.5 * G * N * late * late, vy: G * N * late, d: 0.5 });
        }
      }
      if (rnd() < dt * (1 + 4 * clamp(f.rel.trebDrive))) w.drips.push({ x: (0.25 + rnd() * 0.7) * N, y: 0, vy: 0, d: rnd() });
      w.ripples = w.ripples.filter((rp) => { rp.t += dt; for (let k = 0; k < 3; k++) { const q = rp.t - k * 0.12; if (q > 0) r.ring(rp.x, rp.y, q * 0.12 * N * rp.sc, px(u), q < 0.1 ? LMID : LMID + DIM, 0.3); } return rp.t < 0.7; });
      if (w.ripples.length > 24) w.ripples.splice(0, w.ripples.length - 24);
      w.splash = particles(W, w.splash, LMID);
      targets.push({ x: 0.5 * N, y: fy, w: 0.1 * N, h: 0.25 * N });
      return;
    }
    // the land: sky and haze, the ground, the trees in parallax, the far-to-near sleepers between the rails
    r.rect(0, 0, N, hz, MD.sky);
    r.rect(0, hz - 0.06 * N, N, 0.06 * N, MD.haze);
    r.rect(0, hz, N, N - hz, MD.ground);
    for (const tr of w.trees.slice().sort((a, b) => ((b.z - w.dist) % 40 + 40) % 40 - ((a.z - w.dist) % 40 + 40) % 40)) {
      const z = (((tr.z - w.dist) % 40) + 40) % 40 + 1.5, [x, y] = P(tr.X, 1, z), hh = (tr.h * K) / z;
      r.rect(x - px(u * 2 / z) / 2, y - hh * 0.45, px((u * 4) / z), hh * 0.45, MD.tree);
      oval(r, x, y - hh * 0.65, hh * 0.3, hh * 0.35, MD.tree);
    }
    const frac = w.dist - Math.floor(w.dist);
    for (let i = 30; i >= 0; i--) {
      const z = i + 1 - frac;
      if (z < 0.7) continue;
      const a = P(-0.75, 1, z), b = P(0.75, 1, z), c = P(0.75, 1, z + 0.18), d = P(-0.75, 1, z + 0.18), col = w.mood === 'night' && z < 4 ? MID : MD.tie;
      if (a[1] - c[1] < 1.2) r.line(a[0], a[1], b[0], b[1], col); else r.poly([a, b, c, d], col); // a far sleeper is thinner than a pixel
    }
    for (const X of [-0.5, 0.5]) r.poly([P(X - 0.04, 1, 0.7), P(X + 0.04, 1, 0.7), P(X + 0.04, 1, 60), P(X - 0.04, 1, 60)], MD.rail);
    if (w.mood === 'night') oval(r, cx, hz + K / 1.5, 0.3 * N, 0.08 * N, MID + DIM);
    // the grass on both banks, each blade bent by the wind, carried past us by the travel; the dog across the rails
    const wind = f.rel.trebClock * 1.5;
    for (const gb of w.grass) {
      const z = (((gb.z - w.dist) % 28) + 28) % 28 + 0.6, [x0, y0] = P(gb.X, 1, z), [x1, y1] = P(gb.X + Math.sin(wind + gb.X * 2 + gb.s) * 0.25, 1 - gb.h, z);
      r.line(x0, y0, x1, y1, z < 10 ? MD.grass : MD.grass === DARK ? DARK : MD.tie);
    }
    if (w.dog) {
      const D = w.dog, dX = -2.2 * dt;
      D.X += dX; D.ph += Math.abs(dX) * 9;
      const [x, y] = P(D.X, 1, 4), hh = (0.45 * K) / 4;
      shadow(r, x, y, hh * 0.8);
      dog(r, x, y, hh, BLACK, D.ph, -1);
      targets.push({ x: x - hh, y: y - hh, w: 2 * hh, h: hh });
      if (D.X < -5) w.dog = null;
    }
    // the bolt: thrown ahead of the trolley in ground coordinates, falling at six units a second squared, coming
    // back toward us once it lies in the grass; the ribbon is where it was over the last third of a second, a knot
    // every 30 ms of flight, and settles onto the ground once the bolt is down
    const B = w.bolt;
    if (B) {
      B.t += dt;
      if (!B.down) {
        B.vY += 6 * dt; B.X += B.vX * dt; B.Y += B.vY * dt; B.z += B.vz * dt;
        if (B.Y >= 1) { B.Y = 1; B.down = true; }
        const last = w.trail[w.trail.length - 1];
        if (!last || B.t - last[3] >= 0.03) w.trail.push([B.X, B.Y, B.z, B.t, 0]);
        while (w.trail.length && B.t - w.trail[0][3] > 0.35) w.trail.shift();
      } else for (const p of w.trail) if (p[1] < 1) { p[4] += 6 * dt; p[1] = Math.min(1, p[1] + p[4] * dt); }
      const zr = B.z - w.dist;
      if (zr < 0.5) w.bolt = null;
      else {
        let prev = null;
        for (const [X, Y, z] of w.trail) { const q = z - w.dist; if (q > 0.5) { const [x, y] = P(X, Y, q); if (prev) r.line(prev[0], prev[1], x, y, BRIGHT); prev = [x, y]; } }
        const [x, y] = P(B.X, B.Y, zr), sz = px((0.06 * K) / zr);
        if (!B.down) shadow(r, P(B.X, 1, zr)[0], P(B.X, 1, zr)[1], sz, DARK + DIM);
        r.rect(x - sz / 2, y - sz / 2, sz, sz, FIG);
        targets.push({ x: x - 3 * sz, y: y - 3 * sz, w: 6 * sz, h: 6 * sz });
      }
    }
    // the trolley: its front edge, the lever, the backs of two heads that dip on every joint; the arm that threw
    const bob = Math.sin(w.bob * Math.PI) * 2 * u;
    r.rect(0, 0.88 * N + bob * 0.5, N, N, DARK);
    r.rect(0, 0.88 * N + bob * 0.5, N, px(1.5 * u), MID);
    r.rect(0.88 * N, 0.62 * N, px(2 * u), 0.26 * N, BLACK);
    r.disc(0.3 * N, 0.93 * N + bob, 0.075 * N, BLACK); r.rect(0.18 * N, 0.98 * N + bob, 0.24 * N, 0.1 * N, BLACK);
    r.disc(0.68 * N, 0.95 * N + bob, 0.065 * N, BLACK); r.rect(0.57 * N, 0.99 * N + bob, 0.22 * N, 0.1 * N, BLACK);
    if (w.arm > 0) r.stroke(0.74 * N, 0.99 * N, 0.8 * N, 0.78 * N - (w.arm / 0.3) * 0.1 * N, px(2.5 * u), BLACK);
    if (!w.bolt && !w.dog) targets.push({ x: cx - 0.1 * N, y: hz - 0.05 * N, w: 0.2 * N, h: 0.1 * N });
  },
};

// ---------------------------------------------------------------------------------------------- rainbattle
// A muddy village street in heavy rain, the streaks slanting with the wind, puddles rippling, huts on both sides
// in perspective. Figures stand in the mud and strike on the kicks (the blade swinging about the shoulder, a lunge,
// mud off the foot), one slipping now and then; arrows come over on the snares in true arcs and stand in the mud
// where they land; the lanterns in the doorways answer the notes. A drop sends riders through at a gallop, mud
// flying from the hooves. Kinds: a duel, a melee, a siege (a palisade, fire arrows).
const FIGHTS = { duel: [3, 2, 1], melee: [2, 2, 2], siege: [1, 2, 3] };
const FIGHT_N = { duel: 2, melee: 4, siege: 5 };
// a fighter at x with its feet on base, h tall, facing dir, the blade at angle `sw` about the shoulder, fallen back by tilt
function samurai(r, x, base, h, col, dir, sw, tilt, lunge, u) {
  const c = Math.cos(tilt), sn = Math.sin(tilt), R = (dx, hh) => [x + dx - dir * sn * hh, base - c * hh]; // a point dx across and hh up, turned about the feet
  const [hx, hy] = R(0, 0.45 * h), [sx, sy] = R(dir * 0.12 * h, 0.78 * h), [sx2, sy2] = R(-dir * 0.1 * h, 0.76 * h), [nx, ny] = R(dir * 0.02 * h, 0.9 * h);
  r.stroke(hx, hy, x - 0.1 * h - lunge * 0.3, base, px(h * 0.08), col);
  r.stroke(hx, hy, x + 0.1 * h + lunge, base, px(h * 0.08), col);
  r.poly([R(-0.2 * h, 0.4 * h), R(0.2 * h, 0.4 * h), R(0.15 * h, 0.8 * h), R(-0.15 * h, 0.8 * h)], col);
  r.disc(nx, ny, h * 0.1, col);
  r.rect(nx - u, ny - h * 0.14, px(2 * u), px(h * 0.05), col); // the topknot
  const gx = sx + Math.cos(sw) * h * 0.18, gy = sy + Math.sin(sw) * h * 0.18;
  r.stroke(sx, sy, gx, gy, px(h * 0.06), col);
  r.stroke(sx2, sy2, gx, gy, px(h * 0.06), col);
  r.stroke(gx, gy, gx + Math.cos(sw) * h * 0.5, gy + Math.sin(sw) * h * 0.5, px(h * 0.035), LMID);
  return [gx + Math.cos(sw) * h * 0.5, gy + Math.sin(sw) * h * 0.5];
}
function horse(r, x, base, h, col, ph, dir, u) {
  const by = base - h * 0.55;
  oval(r, x, by, h * 0.55, h * 0.22, col);
  r.stroke(x + dir * h * 0.45, by - h * 0.1, x + dir * h * 0.75, by - h * 0.5, px(h * 0.16), col);
  oval(r, x + dir * h * 0.82, by - h * 0.55, h * 0.17, h * 0.1, col);
  r.stroke(x - dir * h * 0.55, by - h * 0.05, x - dir * h * 0.8, by + h * 0.3, px(h * 0.05), col);
  const hooves = [];
  for (const [k, o] of [[0.38, 0], [0.3, 0.5], [-0.3, Math.PI], [-0.4, Math.PI + 0.5]]) { // a gallop: the fore pair, the hind pair half a cycle behind
    const a = Math.sin(ph + o) * 0.7, jx = x + dir * k * h, fx = jx + dir * Math.sin(a) * h * 0.35, fy = base - Math.max(0, -Math.cos(ph + o)) * h * 0.1;
    r.stroke(jx, by + h * 0.1, fx, fy, px(h * 0.07), col);
    hooves.push([fx, fy]);
  }
  const rx = x - dir * h * 0.05, ry = by - h * 0.2; // the rider, a blade up
  r.rect(rx - h * 0.08, ry - h * 0.35, h * 0.16, h * 0.35, col);
  r.disc(rx, ry - h * 0.42, h * 0.08, col);
  r.stroke(rx + dir * h * 0.08, ry - h * 0.25, rx + dir * h * 0.3, ry - h * 0.7, px(h * 0.04), LMID);
  return hooves;
}
const rainbattle = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    const kind = rollW(rnd, FIGHTS, band);
    Object.assign(w, { kind, men: [], rain: [], arrows: [], stuck: [], mud: [], ripples: [], riders: [], lantern: new Float32Array(6), gust: 0, puddles: Array.from({ length: 5 }, (_, i) => ({ X: (rnd() - 0.5) * 2.4, z: 1.2 + i * 0.6 + rnd() * 0.3, rx: 0.35 + rnd() * 0.3 })) });
    rainbattle.cast(w, rnd, kind);
  },
  cast(w, rnd, kind) {
    const n = FIGHT_N[kind];
    w.kind = kind;
    w.men = Array.from({ length: n }, (_, i) => (kind === 'duel' ? { X: i ? 0.55 : -0.55, z: 1.6, dir: i ? -1 : 1 } : { X: -1.1 + (i / (n - 1)) * 2.2 + (rnd() - 0.5) * 0.3, z: 1.3 + hash(i, 4) * 1.6, dir: rnd() < 0.5 ? -1 : 1 }))
      .map((m) => ({ ...m, sw: -0.8, swTo: -0.8, state: 'stand', k: 0, tilt: 0 }));
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, siege = w.kind === 'siege';
    const hz = 0.5 * N, cx = 0.5 * N, K = 0.5 * N, P = (X, Y, z) => [cx + (X * K) / z, hz + (Y * K) / z];
    for (const h of hits) {
      if (isLow(h)) {
        const m = pick(rnd, w.men.filter((q) => q.state === 'stand'));
        if (m) { if (h.strength > 0.8 && rnd() < 0.3) { m.state = 'slip'; m.k = 0; } else { m.state = 'strike'; m.k = 0; } }
      } else if (h.kind === 'snare' && w.arrows.length < 12) {
        const side = rnd() < 0.5 ? -1 : 1, z = 1.1 + rnd() * 2.5; // it flies in the plane of the depth it will land at, so it is sized by it
        w.arrows.push({ x: side < 0 ? -0.04 * N : 1.04 * N, y: 0.42 * N, vx: -side * (0.45 + rnd() * 0.35) * N, vy: -(0.25 + rnd() * 0.3) * N, g: hz + K / z, z, fire: siege && rnd() < 0.6 });
      } else if (h.kind === 'hat') w.gust = 0.5;
      if (isTonal(h)) w.lantern[h.pc % 6] = 1;
    }
    if (f.section === 'drop') { w.riders = [0, 1, 2].map((i) => ({ X: 5 + i * 1.6, z: 1.7 + i * 0.4, ph: hash(i, 9) * TAU })); s.shake = Math.max(s.shake, 0.3); }
    else if (f.section === 'change') { const kind = rollW(rnd, FIGHTS, band); if (kind !== w.kind) rainbattle.cast(w, rnd, kind); }
    w.gust -= dt;
    for (let k = 0; k < 6; k++) w.lantern[k] *= Math.exp(-dt * 1.2);
    const wind = 0.3 * Math.sin(t * 0.4) + 0.5 * (clamp(f.rel.trebDrive) - 0.3) + (w.gust > 0 ? 0.6 : 0);
    // the sky and the street: ruts to the vanishing point, the puddles with their rings, the huts far to near
    r.rect(0, 0, N, hz, MID);
    r.rect(0, hz, N, N - hz, MID + DIM);
    for (const X of [-1.2, -0.4, 0.4, 1.2]) r.line(P(X, 1, 0.9)[0], P(X, 1, 0.9)[1], cx, hz, DARK + DIM);
    for (const pd of w.puddles) { const [x, y] = P(pd.X, 1, pd.z), rx = (pd.rx * K) / pd.z; oval(r, x, y, rx, rx * 0.25, LMID + DIM); if (rnd() < dt * (2 + 6 * f.level) && w.ripples.length < 16) w.ripples.push({ x: x + (rnd() - 0.5) * rx, y: y + (rnd() - 0.5) * rx * 0.3, t: 0, m: rx / N }); }
    w.ripples = w.ripples.filter((rp) => { rp.t += dt; r.ring(rp.x, rp.y, rp.t * 0.5 * rp.m * N + u, px(u), LMID, 0.3); return rp.t < 0.4; });
    if (siege) for (let k = -12; k <= 12; k++) { const [x, y] = P(k * 0.26, 1, 3.6), [, y2] = P(k * 0.26, -0.3, 3.6); r.rect(x - u * 0.5, y2, px(u), y - y2, DARK); } // the palisade, behind the huts
    const huts = [];
    for (const z of [3.2, 2.1, 1.35]) for (const sgn of [-1, 1]) huts.push({ z, sgn });
    huts.forEach(({ z, sgn }, i) => {
      const X0 = sgn * 1.6, X1 = sgn * 3.2, a = P(X0, 1, z), b = P(X1, 1, z), c = P(X1, -0.1, z), d = P(X0, -0.1, z), e = P(X0, -0.1, z + 1.3);
      r.poly([d, c, P(X1, -0.1, z + 1.3), e], DARK + DIM); // the side wall going back
      r.poly([a, b, c, d], DARK);
      r.poly([P(X0 - sgn * 0.15, -0.1, z), P(X1 + sgn * 0.15, -0.1, z), P(sgn * 2.4, -0.9, z)], DARK + DIM); // the thatch
      r.poly([P(sgn * 2.4, -0.9, z), P(sgn * 2.4, -0.9, z + 1.3), e, d], DARK);
      const dr = P(sgn * 1.9, 1, z), dr2 = P(sgn * 2.3, 0.3, z);
      r.rect(Math.min(dr[0], dr2[0]), dr2[1], Math.abs(dr2[0] - dr[0]), dr[1] - dr2[1], BLACK);
      const li = w.lantern[i % 6];
      r.disc(P(sgn * 2.5, 0.15, z)[0], P(sgn * 2.5, 0.15, z)[1], (0.05 * K) / z, li > 0.5 ? BRIGHT : li > 0.1 ? HOT : HOT + DIM);
    });
    // the fighters and the riders together, far to near: a stance that shifts on the beat, the strike about the shoulder
    // with a lunge and mud off the back foot, the slip (a fall back about the feet, then up again); the riders at a
    // gallop across the street, mud from the hooves, gone off the left
    for (const rd of w.riders) { rd.X -= 3 * dt; rd.ph += dt * 9.5; }
    w.riders = w.riders.filter((rd) => rd.X > -5);
    const cast = [...w.men, ...w.riders].sort((a, b) => b.z - a.z);
    for (const m of cast) {
      if (m.ph !== undefined) {
        const [x, base] = P(m.X, 1, m.z), h = (0.95 * K) / m.z;
        shadow(r, x, base, h * 0.6);
        const hooves = horse(r, x, base, h, BLACK, m.ph, -1, u);
        for (const [hx, hy] of hooves) if (hy >= base - u && rnd() < dt * 15) w.mud.push({ x: hx, y: hy, vx: (0.1 + rnd() * 0.2) * N, vy: -(0.1 + rnd() * 0.2) * N, life: 0.5 });
        s.shake = Math.max(s.shake, 0.12);
        targets.push({ x: x - h, y: base - h * 1.2, w: 2 * h, h: h * 1.2 });
        continue;
      }
      const [x, base] = P(m.X, 1, m.z), h = (0.95 * K) / m.z;
      let lunge = 0;
      if (m.state === 'strike') {
        m.k += dt / 0.25;
        if (m.k < 1) { m.sw = lerp(-1.9, 0.6, ease(m.k)); lunge = Math.sin(m.k * Math.PI) * h * 0.1; if (m.k + dt / 0.25 >= 1) { burst(w.mud, rnd, x - m.dir * h * 0.1, base, 7, 0.12 * N, DARK, 0.5); s.shake = Math.max(s.shake, 0.15); } }
        else if (m.k < 3) m.sw = lerp(0.6, -0.8, ease((m.k - 1) / 2)); else { m.state = 'stand'; m.sw = -0.8; }
      } else if (m.state === 'slip') {
        m.k += dt / 0.6;
        if (m.k < 1) { m.tilt = Math.sin(Math.min(1, m.k * 1.5) * Math.PI * 0.5) * 1.1; if (m.k + dt / 0.6 >= 1) burst(w.mud, rnd, x - m.dir * h * 0.3, base, 10, 0.15 * N, DARK, 0.5); }
        else if (m.k < 2.2) m.tilt = 1.1 * (1 - ease((m.k - 1) / 1.2)); else { m.state = 'stand'; m.tilt = 0; }
      } else m.sw = -0.8 + Math.sin(t * 1.5 + m.X) * 0.1 - f.beat.pulse * 0.2;
      const swScreen = m.dir > 0 ? m.sw : Math.PI - m.sw;
      shadow(r, x, base, h * 0.22);
      const tip = samurai(r, x, base - f.beat.pulse * u * 0.5, h, FIG, m.dir, swScreen, m.tilt, lunge, u);
      targets.push({ x: x - h * 0.35, y: base - h, w: h * 0.7, h });
      if (m.state === 'strike' && m.k < 1) r.rect(tip[0] - u * 0.5, tip[1] - u * 0.5, px(u), px(u), BRIGHT);
    }
    w.mud = particles(W, w.mud, DARK);
    if (w.mud.length > 200) w.mud.splice(0, w.mud.length - 200);
    // the arrows: along their arcs, pointed the way they fly, standing where they land for a while; fire arrows trail
    w.arrows = w.arrows.filter((a) => {
      a.vy += G * N * dt; a.x += a.vx * dt; a.y += a.vy * dt;
      const sp = Math.hypot(a.vx, a.vy) || 1, ux = a.vx / sp, uy = a.vy / sp, L2 = (0.1 * K) / a.z;
      r.line(a.x - ux * L2, a.y - uy * L2, a.x, a.y, LMID);
      r.line(a.x - ux * L2, a.y - uy * L2, a.x - ux * L2 * 1.2 - uy * 1.5 * u, a.y - uy * L2 * 1.2 + ux * 1.5 * u, LMID);
      if (a.fire) { r.rect(a.x - u, a.y - u, px(2 * u), px(2 * u), HOT); if (rnd() < dt * 18) w.mud.push({ x: a.x, y: a.y, vx: -ux * 0.05 * N, vy: -uy * 0.05 * N - 0.05 * N, life: 0.3, c: HOT }); }
      if (a.vy > 0 && a.y >= a.g) { w.stuck.push({ x: a.x, y: a.g, ux, uy, L: L2 * 0.9, life: 2, fire: a.fire }); if (w.stuck.length > 40) w.stuck.shift(); if (a.x > 0 && a.x < N) burst(w.mud, rnd, a.x, a.g, 3, 0.06 * N, DARK, 0.3); return false; }
      return a.x > -0.1 * N && a.x < 1.1 * N && a.y < N;
    });
    w.stuck = w.stuck.filter((a) => { a.life -= dt; r.line(a.x - a.ux * a.L, a.y - a.uy * a.L, a.x, a.y, LMID); if (a.fire && a.life > 1) r.rect(a.x - a.ux * a.L - u, a.y - a.uy * a.L - u, px(2 * u), px(2 * u), (t * 20 | 0) % 2 ? HOT : BRIGHT); return a.life > 0; });
    // the rain: streaks at terminal speed, slanted by the wind, each landing where its ground is, a tick there; as many per area at every N
    const want = Math.round((60 + 90 * f.level) * u * u);
    while (w.rain.length < want) w.rain.push({ x: rnd() * 1.4 * N - 0.2 * N, y: rnd() * N, g: hz + rnd() * rnd() * (N - hz) });
    if (w.rain.length > want) w.rain.length = want;
    const vy = 1.6 * N, vx = wind * 0.5 * vy;
    for (const d of w.rain) {
      d.x += vx * dt; d.y += vy * dt;
      if (d.y >= d.g) { r.rect(d.x - u, d.g, px(2 * u), 1, LMID); d.y = -rnd() * 0.1 * N; d.x = rnd() * 1.4 * N - 0.2 * N; d.g = hz + rnd() * rnd() * (N - hz); continue; }
      r.line(d.x, d.y, d.x - vx * 0.035, d.y - vy * 0.035, d.g > 0.8 * N ? LMID : LMID + DIM);
    }
  },
};

// ---------------------------------------------------------------------------------------------- moonface
// The moon of the earliest cinema: a round face in a starry sky (two eyes, a brow, a crescent cheek), astronomers in
// robes and pointed hats bowing on the beat below a long cannon that fires a bullet-shaped rocket every eight beats:
// up on a parabola, slowing at the top of the frame, down on the far side with a puff of dust; snares throw the
// astronomers' arms up, kicks jog the hand-cranked picture, hats twinkle the stars with faces, a note lights one.
// A drop aims the cannon at the moon's eye; the rocket lands in it and the moon grimaces for four bars, then it falls out.
// Kinds: the tinting (sepia, blue-tinted, hand-coloured).
const TINTS = { sepia: { sky: DARK, star: LMID + DIM, moon: LMID, cheek: MID, robe: [FIG, FIG, FIG, FIG], cannon: FIG }, tinted: { sky: COOL + DIM, star: LMID, moon: LMID, cheek: MID, robe: [HOT, COOL, HOT, COOL], cannon: FIG }, colour: { sky: DARK, star: COOL, moon: BRIGHT, cheek: LMID, robe: [HOT, COOL, LMID, HOT], cannon: LMID } };
const TINT_W = { sepia: [3, 2, 1], tinted: [2, 2, 2], colour: [1, 2, 3] };
const moonface = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { tint: rollW(rnd, TINT_W, band), aim: -0.9, rocket: null, plan: null, fireNow: false, grimace: 0, stuck: false, falling: null, smoke: [], dust: [], cream: [], jig: 0, twinkle: -1, twinkleT: 0, lit: -1, litT: 0, hail: 0, shots: 0, sacc: 0 });
  },
  plan(w, N, bps, toEye) {
    // the launch velocity that lands the rocket on its target in T seconds, under the shared gravity; the barrel
    // then points along it, so the muzzle (where the rocket starts) is found by iterating twice
    const g = G * N, T = toEye ? 1.2 : 1.6, tx = toEye ? 0.7 * N + 0.35 * 0.17 * N : (0.62 + hash(w.shots, 3) * 0.28) * N, ty = toEye ? 0.3 * N - 0.15 * 0.17 * N : 0.86 * N; // the flight time sets the height of the arc: the top of the frame, or the eye from above
    let a = w.aim;
    for (let i = 0; i < 6; i++) {
      const mx = 0.18 * N + Math.cos(a) * 0.32 * N, my = 0.82 * N + Math.sin(a) * 0.32 * N, vx = (tx - mx) / T, vy = (ty - my - 0.5 * g * T * T) / T;
      a = Math.atan2(vy, vx);
      w.plan = { vx, vy, a, toEye, T, tx, ty, N };
    }
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = f.bpm ? f.bpm / 60 : 2, TN = TINTS[w.tint], tt = t * 12 | 0;
    const g = 0.86 * N, mx = 0.7 * N, my = 0.3 * N, R = 0.17 * N, bx = 0.18 * N, by = 0.82 * N, BL = 0.32 * N;
    for (const h of hits) {
      if (isLow(h)) w.jig = 0.1;
      else if (h.kind === 'snare') w.hail = 0.4;
      else if (h.kind === 'hat') { w.twinkle = Math.floor(rnd() * 5); w.twinkleT = 0.15; }
      if (isTonal(h)) { w.lit = h.pc % 5; w.litT = 0.6; }
    }
    if (!w.plan || w.plan.N !== N) moonface.plan(w, N, bps, w.plan?.toEye ?? false);
    if (f.section === 'drop' && !w.stuck) { moonface.plan(w, N, bps, true); w.fireNow = true; } // fired as soon as the barrel is round and any shot in the air is down
    else if (f.section === 'change') w.tint = rollW(rnd, TINT_W, band);
    w.jig -= dt; w.hail -= dt; w.twinkleT -= dt; w.litT -= dt; w.grimace -= dt;
    w.aim = followAngle(w.aim, w.plan.a, dt, 0.3);
    const jig = w.jig > 0 ? (hash(tt, 2) - 0.5) * 2 * u : 0, jy = w.jig > 0 ? (hash(tt, 3) - 0.5) * 2 * u : 0;
    // the sky, the stars, five of them with faces; the moon with its cheek, its eyes and brows, the grimace
    r.fill(TN.sky);
    for (let k = 0; k < 60; k++) r.set(hash(k, 1) * N, hash(k, 2) * 0.85 * N, hash(k, tt) < 0.08 ? BRIGHT : TN.star);
    for (let k = 0; k < 5; k++) {
      const sx = (0.08 + hash(k, 7) * 0.5) * N + (k === 4 ? 0.3 * N : 0), sy = (0.08 + hash(k, 8) * 0.5) * N, big = w.twinkleT > 0 && w.twinkle === k, sz = (0.025 + (big ? 0.012 : 0)) * N, col = w.litT > 0 && w.lit === k ? HOT : big ? BRIGHT : TN.moon;
      r.line(sx - sz, sy, sx + sz, sy, col); r.line(sx, sy - sz, sx, sy + sz, col); r.disc(sx, sy, sz * 0.45, col);
      for (const kx of [-1, 1]) r.rect(sx + kx * sz * 0.18 - u * 0.4, sy - sz * 0.12, px(u * 0.8), px(u * 0.8), TN.sky);
      r.rect(sx - sz * 0.15, sy + sz * 0.15, sz * 0.3, px(u * 0.6), TN.sky);
    }
    const Mx = mx + jig, My = my + jy, grim = w.grimace > 0;
    r.disc(Mx, My, R, TN.moon);
    r.disc(Mx - R * 0.42, My + R * 0.1, R * 0.6, TN.cheek);
    r.disc(Mx - R * 0.2, My - R * 0.05, R * 0.6, TN.moon);
    for (const k of [-1, 1]) { // the eyes and the brows: a squint and an angry slant on the hit side when it grimaces
      const ex = Mx + k * R * 0.35, ey = My - R * 0.15, hit = grim && k > 0;
      if (hit) { r.stroke(ex - R * 0.14, ey + R * 0.04, ex + R * 0.14, ey - R * 0.04, px(1.5 * u), DARK); }
      else { r.disc(ex, ey, R * 0.1, DARK); r.rect(ex - R * 0.03, ey - R * 0.05, px(R * 0.05), px(R * 0.05), TN.moon); }
      const tilt = grim ? -k * R * 0.08 : k * R * 0.03;
      r.stroke(ex - R * 0.16, ey - R * 0.22 - tilt, ex + R * 0.16, ey - R * 0.22 + tilt, px(2 * u), DARK);
    }
    r.rect(Mx - u, My - R * 0.05, px(2 * u), R * 0.2, MID); // the nose
    if (grim) oval(r, Mx, My + R * 0.38, R * 0.18, R * 0.14, DARK); else r.stroke(Mx - R * 0.15, My + R * 0.4, Mx + R * 0.15, My + R * 0.38, px(1.5 * u), MID);
    if (w.stuck) { r.rect(Mx + R * 0.3, My - R * 0.2, R * 0.2, px(3 * u), FIG); r.rect(Mx + R * 0.44, My - R * 0.22, px(2 * u), px(2 * u), HOT); }
    if (w.grimace <= 0 && w.stuck) { w.stuck = false; w.falling = { x: Mx + R * 0.4, y: My - R * 0.15, vy: 0 }; w.shots++; moonface.plan(w, N, bps, false); }
    if (w.falling) { const F = w.falling; F.vy += G * N * dt; F.y += F.vy * dt; r.rect(F.x - 4 * u, F.y, 8 * u, px(3 * u), FIG); if (F.y >= g) { burst(w.dust, rnd, F.x, g, 8, 0.07 * N, MID, 0.6); w.falling = null; } } // down onto the ground, a puff
    // the ground, a telescope on legs at the right, the astronomers bowing on the beat, arms up on the snare
    r.rect(0, g, N, N - g, DARK);
    r.rect(0, g, N, px(u), MID);
    for (const k of [-1, 1]) r.line(0.88 * N + k * 0.03 * N, g, 0.88 * N, g - 0.1 * N, FIG);
    r.stroke(0.88 * N, g - 0.1 * N, 0.88 * N - 0.08 * N, g - 0.2 * N, px(2.5 * u), FIG);
    const bow = f.beat.pulse * 0.55;
    for (let i = 0; i < 4; i++) {
      const x = (0.36 + i * 0.1) * N, h = (0.13 + hash(i, 5) * 0.03) * N, col = TN.robe[i], lean = bow * (i % 2 ? 0.8 : 1), sn = Math.sin(lean), c = Math.cos(lean);
      const Rp = (dx, hh) => [x + dx - sn * hh, g - c * hh];
      r.poly([Rp(-h * 0.22, 0), Rp(h * 0.22, 0), Rp(h * 0.1, h * 0.7), Rp(-h * 0.1, h * 0.7)], col);
      const [hx, hy] = Rp(0, h * 0.8);
      r.disc(hx, hy, h * 0.12, col);
      r.poly([Rp(-h * 0.14, h * 0.86), Rp(h * 0.14, h * 0.86), Rp(h * 0.02, h * 1.3)], col); // the pointed hat
      if (w.hail > 0) for (const k of [-1, 1]) r.stroke(Rp(k * h * 0.1, h * 0.6)[0], Rp(k * h * 0.1, h * 0.6)[1], Rp(k * h * 0.3, h * 1.05)[0], Rp(k * h * 0.3, h * 1.05)[1], px(h * 0.07), col);
      else r.stroke(Rp(-h * 0.1, h * 0.6)[0], Rp(-h * 0.1, h * 0.6)[1], Rp(-h * 0.25, h * 0.35)[0], Rp(-h * 0.25, h * 0.35)[1], px(h * 0.07), col);
      if (i === 1) r.line(x + h * 0.25, g, x + h * 0.25, g - h * 1.1, col); // the staff
    }
    // the cannon: a wheel, the barrel on its pivot pointing along the planned flight; the shot on the eighth beat
    const ca = Math.cos(w.aim), sa = Math.sin(w.aim), muzx = bx + ca * BL, muzy = by + sa * BL;
    r.ring(bx, by, 0.05 * N, px(2 * u), TN.cannon);
    r.line(bx - 0.05 * N, by, bx + 0.05 * N, by, TN.cannon); r.line(bx, by - 0.05 * N, bx, by + 0.05 * N, TN.cannon);
    r.stroke(bx, by, bx + ca * BL * 0.5, by + sa * BL * 0.5, px(0.05 * N), TN.cannon);
    r.stroke(bx + ca * BL * 0.45, by + sa * BL * 0.45, muzx, muzy, px(0.038 * N), TN.cannon);
    r.ring(muzx, muzy, 0.02 * N, px(1.5 * u), TN.cannon);
    const fire = !w.rocket && !w.stuck && !w.falling && (w.fireNow ? Math.abs(w.aim - w.plan.a) < 0.08 : onBar(W, w, 8));
    if (fire) { // the launch solved once more from where the muzzle really is, so the shot lands on its mark however far round the barrel got
      const Pn = w.plan, vx = (Pn.tx - muzx) / Pn.T, vy = (Pn.ty - muzy - 0.5 * G * N * Pn.T * Pn.T) / Pn.T;
      w.fireNow = false;
      w.rocket = { x: muzx, y: muzy, vx, vy, t: 0, toEye: Pn.toEye, T: Pn.T };
      burst(w.smoke, rnd, muzx, muzy, 10, 0.1 * N, LMID, 1.2);
      s.shake = Math.max(s.shake, 0.35);
    }
    const RK = w.rocket;
    if (RK) {
      RK.x += RK.vx * dt; RK.y += RK.vy * dt + 0.5 * G * N * dt * dt; RK.vy += G * N * dt; RK.t += dt; // exact under one gravity
      const sp = Math.hypot(RK.vx, RK.vy) || 1, ux = RK.vx / sp, uy = RK.vy / sp, L2 = 0.035 * N;
      r.stroke(RK.x - ux * L2, RK.y - uy * L2, RK.x + ux * L2, RK.y + uy * L2, px(3 * u), LMID);
      r.disc(RK.x + ux * L2, RK.y + uy * L2, 1.6 * u, LMID);
      r.rect(RK.x - ux * L2 * 0.4 - u, RK.y - uy * L2 * 0.4 - u, px(2 * u), px(2 * u), DARK);
      for (w.sacc += dt * 21; w.sacc >= 1; w.sacc--) w.smoke.push({ x: RK.x - ux * L2, y: RK.y - uy * L2, vx: (rnd() - 0.5) * 0.02 * N, vy: 0.01 * N, life: 0.8 + rnd() * 0.4 }); // a puff every 48 ms of flight
      targets.push({ x: RK.x - 0.05 * N, y: RK.y - 0.05 * N, w: 0.1 * N, h: 0.1 * N });
      if (RK.toEye && RK.t >= RK.T) { w.rocket = null; w.stuck = true; w.grimace = 16 / bps; burst(w.cream, rnd, Mx + R * 0.35, My - R * 0.15, 16, 0.15 * N, BRIGHT, 0.9); s.shake = Math.max(s.shake, 0.4); }
      else if (!RK.toEye && RK.vy > 0 && RK.y >= g) { w.rocket = null; w.shots++; burst(w.dust, rnd, RK.x, g, 10, 0.08 * N, MID, 0.6); moonface.plan(w, N, bps, false); }
      else if (RK.x > 1.2 * N || RK.y > 1.2 * N) { w.rocket = null; w.shots++; moonface.plan(w, N, bps, false); }
    } else targets.push({ x: Mx - R, y: My - R, w: 2 * R, h: 2 * R });
    w.smoke = w.smoke.filter((p) => { p.vy = follow(p.vy, -0.02 * N, dt, 0.8); p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; r.rect(p.x, p.y, px(u * Math.min(2, 2.5 - p.life)), px(u), p.life > 0.6 ? LMID : MID + DIM); return p.life > 0; });
    w.dust = particles(W, w.dust, MID);
    w.cream = particles(W, w.cream, BRIGHT);
    if (w.smoke.length > 120) w.smoke.splice(0, w.smoke.length - 120);
  },
};

const WORLDS = { hallway, monolith, stargate, warroom, telepods, breathingtv, redroom, trunkshot, rearwindow, birdsonwires, seventhseal, zone, rainbattle, moonface };

registerFamily('cinema', WORLD_DEFS, WORLDS);
export const CINEMA_STYLE = makeMixStyle('CINEMA', ['cinema']);
