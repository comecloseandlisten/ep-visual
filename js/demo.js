// The demoscene, mixed. Classic effects from the Amiga and PC intros as worlds: a plasma, a texture tunnel, a
// rotozoomer, copper bars, metaballs, a twister, a voxel flyover, a dot object, a starfield with a wireframe cube,
// shade bobs, the fire and a lens. Each is drawn with the eight palette roles only, so any palette, treatment and
// layout of the mixer fits them; the per-pixel ones are `heavy` and keep to the main screen. No text, no logos.
import { Raster, clamp, lerp, makeNoise } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow,
  wrapAngle, followAngle, ease, beatLocked, hash, particles, burst, shiftRow, shiftRows, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  plasma: { name: 'plasma', va: [[H, M], [M, M], [H, L], [H, H]], pals: ['neon', 'vapor', 'thermal', 'candy', 'amiga', 'crystal'], fx: ['none', 'crt', 'kaleido'], heavy: true, geo: true },
  tunnel: { name: 'texture tunnel', va: [[H, H], [M, H], [H, M]], pals: ['amiga', 'c64', 'neon', 'zx', 'cga', 'phosphor'], fx: ['crt', 'none', 'kaleido'], heavy: true, geo: true },
  rotozoom: { name: 'rotozoomer', va: [[H, M], [H, H], [M, M]], pals: ['c64', 'amiga', 'cga', 'nineties', 'zx', 'candy'], fx: ['crt', 'none', 'kaleido'], heavy: true, geo: true },
  copper: { name: 'copper bars', va: [[H, M], [M, M], [H, H], [M, L]], pals: ['amiga', 'c64', 'gold', 'vapor', 'neon'], fx: ['crt', 'none'], geo: true },
  metaballs: { name: 'metaballs', va: [[H, M], [M, M], [H, L], [M, H]], pals: ['thermal', 'neon', 'toxic', 'crystal', 'candy'], fx: ['none', 'crt', 'kaleido'], heavy: true, geo: true },
  twister: { name: 'twister', va: [[L, H], [M, H], [H, H], [M, M]], pals: ['amiga', 'c64', 'gold', 'silver', 'neon'], fx: ['crt', 'none'], geo: true },
  voxel: { name: 'voxel flyover', va: [[H, M], [M, M], [H, H], [M, H]], pals: ['amiga', 'vapor', 'ice', 'gold', 'midnight'], fx: ['none', 'crt', 'hud'], heavy: true, geo: true },
  dots: { name: 'dot object', va: [[M, M], [H, M], [M, H], [H, H]], pals: ['phosphor', 'amber', 'crystal', 'blueprint', 'neon'], fx: ['crt', 'none', 'code'], geo: true },
  starfield: { name: 'starfield', va: [[M, H], [H, H], [M, M], [L, H]], pals: ['noir', 'silver', 'phosphor', 'blueprint', 'midnight', 'crystal'], fx: ['none', 'crt', 'code', 'hud'], geo: true },
  bobs: { name: 'shade bobs', va: [[H, L], [H, M], [M, L], [M, M]], pals: ['neon', 'vapor', 'thermal', 'candy', 'toxic'], fx: ['none', 'crt', 'kaleido'], heavy: true, geo: true },
  fire: { name: 'the fire', va: [[L, H], [M, H], [L, M]], pals: ['hell', 'thermal', 'amber', 'machine', 'toxic'], fx: ['none', 'crt', 'mirror'], heavy: true, geo: true },
  lens: { name: 'the lens', va: [[H, M], [M, M], [H, H]], pals: ['amiga', 'c64', 'cga', 'zx', 'blueprint', 'nineties'], fx: ['crt', 'none'], heavy: true, geo: true },
};

// ---------------------------------------------------------------------------------------------- shared bits
// a sine table for the per-pixel loops: `sinL(x)` for x in radians, any sign
const SN = 1024, SK = SN / TAU, SIN = Float32Array.from({ length: SN }, (_, i) => Math.sin((i / SN) * TAU));
const sinL = (x) => SIN[((x * SK) | 0) & (SN - 1)];
// the one energy knob the effects grow with: bass above the track's own average, the level, the mids
const energy = (f) => clamp(0.5 * f.rel.bassDrive + 0.3 * f.level + 0.2 * f.rel.midDrive);
// a role one step up the value ramp, for lit slopes and glass
const UP = [BG, FIG, MID, LMID, BRIGHT, BRIGHT, HOT, COOL];

// ---------------------------------------------------------------------------------------------- plasma
// Four sines summed per pixel (two axes, a diagonal, a radial one) and quantised onto a ramp that runs
// DARK→BRIGHT→HOT and back with COOL in the trough; the phases run on the bass and mid clocks, the ramp steps
// one band on every beat (colour cycling), a kick drops a ripple where it landed, a note retunes the rings.
const PCYC = [COOL, DARK, MID, LMID, BRIGHT, HOT, BRIGHT, LMID, MID, DARK];
function plasmaTables(W) {
  const { w, N } = W;
  w.N = N;
  w.rad = new Float32Array(N * N);
  w.val = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) w.rad[y * N + x] = (Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / N) * 9 * SK;
  w.rowS = new Float32Array(N);
  w.colS = new Float32Array(N);
  w.diagS = new Float32Array(2 * N);
}

const plasma = {
  init(W) {
    Object.assign(W.w, { lut: new Uint8Array(32), off: 0, ripples: [], rf: 1, rfTo: 1, stepT: 0 });
    plasmaTables(W);
  },
  draw(W) {
    const { r, N, u, dt, f, w, hits, targets } = W, buf = r.buf;
    if (w.N !== N) plasmaTables(W);
    for (const hh of hits) {
      if (isLow(hh)) { w.ripples.push({ x: hh.x * N, y: hh.y * N, r: 0, amp: 0.6 + hh.strength }); if (w.ripples.length > 3) w.ripples.shift(); }
      else if (isTonal(hh)) w.rfTo = 0.7 + (hh.pc / 11) * 0.8;
    }
    w.rf = follow(w.rf, w.rfTo, dt, 0.5);
    const step = beatLocked(f) ? f.beat.on : (w.stepT += dt) > 0.5;
    if (step) { w.stepT = 0; w.off = (w.off + 1) % PCYC.length; }
    if (f.section === 'change') w.off = (w.off + 5) % PCYC.length;
    for (let i = 0; i < 32; i++) w.lut[i] = PCYC[(i + w.off) % PCYC.length];
    const bc = f.rel.bassClock, mc = f.rel.midClock, t1 = bc * 1.1, t2 = mc * 0.8, t3 = (bc + mc) * 0.45, ph4 = (mc * 1.3 + bc * 0.3) * SK;
    const { rowS, colS, diagS, rad, val, lut } = w, ramp = 0.6 + 0.8 * clamp(f.rel.bassDrive), rf = w.rf; // |v| <= 4.4 keeps the lut index in 0..22
    for (let k = 0; k < N; k++) { colS[k] = Math.sin((k / N) * 5.5 + t1); rowS[k] = Math.sin((k / N) * 4.2 + t2); }
    for (let k = 0; k < 2 * N; k++) diagS[k] = Math.sin((k / N) * 3.1 + t3);
    for (let y = 0, i = 0; y < N; y++) {
      const ry = rowS[y];
      for (let x = 0; x < N; x++, i++) {
        const v = colS[x] + ry + diagS[x + y] + SIN[((rad[i] * rf + ph4) | 0) & 1023] * ramp;
        val[i] = v;
        buf[i] = lut[((v + 4.4) * 2.5) | 0];
      }
    }
    // the ripples: a band of raised value running out from where the kick landed
    w.ripples = w.ripples.filter((rp) => {
      rp.r += dt * N * 0.55;
      rp.amp *= Math.exp(-dt * 1.4);
      const r1 = rp.r + 2.5 * u, r0 = Math.max(0, rp.r - 2.5 * u), r12 = r1 * r1, r02 = r0 * r0, bump = rp.amp * 3;
      for (let y = Math.max(0, Math.floor(rp.y - r1)); y < Math.min(N, rp.y + r1); y++) {
        const dy2 = (y - rp.y) * (y - rp.y);
        for (let x = Math.max(0, Math.floor(rp.x - r1)); x < Math.min(N, rp.x + r1); x++) {
          const d2 = (x - rp.x) * (x - rp.x) + dy2;
          if (d2 > r12 || d2 < r02) continue;
          const i = y * N + x;
          buf[i] = lut[(((val[i] + 4.4) * 2.5 + bump) | 0) & 31];
        }
      }
      return rp.amp > 0.08 && rp.r < N * 0.8;
    });
    targets.push({ x: 0.3 * N, y: 0.3 * N, w: 0.4 * N, h: 0.4 * N });
  },
};

// ---------------------------------------------------------------------------------------------- tunnel
// A texture tunnel from angle and depth tables twice the screen size, so the centre can wander on the mid clock:
// a checker, rings or spokes of the ramp, lit at the rim, dark at the far end, a COOL ring every eighth. Speed from
// the energy, a kick boosts it, a snare reverses the twist, a drop is warp speed (stripes stretched), the rim HOT on the beat.
function tunnelTables(W) {
  const { w, N } = W, N2 = 2 * N, n = N2 * N2;
  Object.assign(w, { N, N2, ang: new Float32Array(n), dep: new Float32Array(n), shd: new Uint8Array(n) });
  for (let y = 0; y < N2; y++)
    for (let x = 0; x < N2; x++) {
      const dx = x + 0.5 - N, dy = y + 0.5 - N, d = Math.hypot(dx, dy) / N, i = y * N2 + x;
      w.ang[i] = (Math.atan2(dy, dx) / TAU + 0.5) * 16;
      w.dep[i] = Math.min(80, 8 / (d + 0.02));
      w.shd[i] = d > 0.5 ? 0 : d > 0.28 ? 1 : d > 0.15 ? 2 : d > 0.065 ? 3 : 4;
    }
}
const TUN_LIT = [BRIGHT, LMID, MID, DARK, BG], TUN_DRK = [MID, DARK, DARK + DIM, BG, BG];

const tunnel = {
  init(W) {
    Object.assign(W.w, { fly: 0, rot: 0, tw: 0.08, twDir: 1, warp: 0, boost: 0, mode: Math.floor(W.rnd() * 3), lit: TUN_LIT.slice() });
    tunnelTables(W);
  },
  draw(W) {
    const { r, N, dt, f, w, hits, targets } = W, buf = r.buf;
    if (w.N !== N) tunnelTables(W);
    for (const hh of hits) {
      if (isLow(hh)) w.boost = Math.max(w.boost, hh.strength);
      else if (hh.kind === 'snare') w.twDir = -w.twDir;
    }
    if (f.section === 'drop') w.warp = 1;
    if (f.section === 'change') w.mode = (w.mode + 1) % 3;
    w.warp *= Math.exp(-dt / 1.6);
    w.boost *= Math.exp(-dt * 5);
    w.tw = follow(w.tw, w.twDir * 0.09, dt, 0.25);
    w.fly += dt * (3 + 14 * energy(f)) * (1 + 3 * w.warp) * (1 + 1.5 * w.boost);
    w.rot += dt * (0.4 + 2 * f.rel.trebDrive) * w.twDir;
    const mc = f.rel.midClock, ox = Math.round(N / 2 + 0.22 * N * Math.sin(mc * 0.9)), oy = Math.round(N / 2 + 0.22 * N * Math.cos(mc * 0.65));
    const { ang, dep, shd, N2, lit } = w, vs = 1 / (1 + 2.5 * w.warp), fly = w.fly + 4096, rot = w.rot * 2.5 + 4096, tw = w.tw;
    const mu = w.mode === 1 ? 0 : 1, mv = w.mode === 2 ? 0 : 1;
    lit[0] = f.beat.pulse > 0.55 ? HOT : BRIGHT;
    for (let y = 0, i = 0; y < N; y++) {
      let j = (y + oy) * N2 + ox;
      for (let x = 0; x < N; x++, i++, j++) {
        const s = shd[j];
        if (s === 4) { buf[i] = BG; continue; }
        const dv = dep[j] * vs, vv = dv + fly, uu = ang[j] + rot + tw * dv, vi = vv | 0;
        const k = ((uu | 0) & mu) + (vi & mv);
        buf[i] = (vi & 7) === 0 && s < 3 ? COOL : k & 1 ? lit[s] : TUN_DRK[s];
      }
    }
    targets.push({ x: ox - 0.08 * N, y: oy - 0.08 * N, w: 0.16 * N, h: 0.16 * N });
  },
};

// ---------------------------------------------------------------------------------------------- rotozoom
// A tiled pattern rotating and zooming, read with two running texture coordinates per row (a disc and a
// diagonal, a checker with a stud, rings on a grid, a diagonal plaid): the zoom pulses with the beat and
// breathes with the bass clock, the spin runs on the treble, a kick zooms in, a snare reverses the spin, a note
// swaps the accents and a section change swaps the design.
function rotoTile(k, acc) {
  const T = new Uint8Array(256), A = acc ? COOL : HOT, B = acc ? HOT : COOL;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
      let c;
      if (k === 0) c = d < 2.5 ? BRIGHT : d < 5 ? MID : x === y || x === y + 1 ? A : x < 2 && y > 13 ? B : DARK;
      else if (k === 1) c = (x >> 3) === (y >> 3) ? (Math.abs(dx) < 2 && Math.abs(dy) < 2 ? A : (x & 7) === 7 || (y & 7) === 7 ? LMID : MID) : (x & 7) === 7 || (y & 7) === 7 ? BG : DARK;
      else if (k === 2) c = d < 1.8 ? A : d > 3.8 && d < 5.2 ? B : d > 6.6 && d < 7.6 ? LMID : x === 0 || y === 0 ? BG : DARK;
      else c = ((x + y) & 7) < 3 ? BRIGHT : ((x + y) & 7) < 5 ? MID : ((x - y) & 7) === 0 ? A : DARK;
      T[y * 16 + x] = c;
    }
  return T;
}

const rotozoom = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { a: rnd() * TAU, dir: rnd() < 0.5 ? -1 : 1, k: Math.floor(rnd() * 4), acc: 0, kick: 0, tile: null });
    w.tile = rotoTile(w.k, w.acc);
  },
  draw(W) {
    const { r, N, dt, f, w, hits, targets } = W, buf = r.buf;
    for (const hh of hits) {
      if (isLow(hh)) w.kick = Math.max(w.kick, hh.strength);
      else if (hh.kind === 'snare') w.dir = -w.dir;
      else if (isTonal(hh) && hh.strength > 0.5) { w.acc ^= 1; w.tile = rotoTile(w.k, w.acc); }
    }
    if (f.section === 'change') { w.k = (w.k + 1) % 4; w.tile = rotoTile(w.k, w.acc); }
    if (f.section === 'drop') w.kick = 2;
    w.kick *= Math.exp(-dt * 4);
    w.a += dt * (0.3 + 1.8 * f.rel.trebDrive) * w.dir;
    const bc = f.rel.bassClock, mc = f.rel.midClock, tiles = (5 + 2.2 * Math.sin(bc * 0.5)) / (1 + 0.35 * f.beat.pulse + 0.5 * w.kick);
    const z = (16 * tiles) / N, c = Math.cos(w.a) * z, s = Math.sin(w.a) * z, ox = 40 * Math.sin(mc * 0.3), oy = 40 * Math.cos(mc * 0.23), tile = w.tile;
    let ux0 = ox - (N / 2) * c + (N / 2) * s + 4096, uy0 = oy - (N / 2) * s - (N / 2) * c + 4096;
    for (let y = 0, i = 0; y < N; y++) {
      let ux = ux0, uy = uy0;
      for (let x = 0; x < N; x++, i++) {
        buf[i] = tile[(((uy | 0) & 15) << 4) | ((ux | 0) & 15)];
        ux += c; uy += s;
      }
      ux0 -= s; uy0 += c;
    }
    targets.push({ x: 0.35 * N, y: 0.35 * N, w: 0.3 * N, h: 0.3 * N });
  },
};

// ---------------------------------------------------------------------------------------------- copper
// Copper bars: gradient bars of seven bands (DARK to BRIGHT and back, the shoulders HOT on the odd bars, COOL on
// the even) bouncing as sines on the bass clock over a dotted raster; their number grows with the energy, a kick
// adds a bar where it landed that fades out, a snare makes them all jump, the raster steps on the beat.
const COP = [DARK, MID, LMID, BRIGHT, LMID, MID, DARK];
const copper = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { bars: Array.from({ length: 12 }, () => ({ sp: 0.5 + rnd() * 0.7, ph: rnd() * TAU, amp: 0.2 + rnd() * 0.22, on: 0 })), extra: [], jump: 0, jv: 0, e: 0, dotPh: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, buf = r.buf;
    w.e = follow(w.e, energy(f), dt, 0.4);
    const want = 2 + Math.round(10 * w.e);
    for (const hh of hits) {
      if (isLow(hh)) { w.extra.push({ y: hh.y, vy: (rnd() - 0.5) * 0.5, life: 1.4, acc: hh.strength > 0.7 ? HOT : COOL }); if (w.extra.length > 6) w.extra.shift(); }
      else if (hh.kind === 'snare') w.jv = -2.2 * (0.5 + hh.strength);
    }
    w.jv += (-w.jump * 70 - w.jv * 7) * dt;
    w.jump += w.jv * dt;
    if (f.beat.on) w.dotPh ^= 1;
    const g = Math.max(2, Math.round(4 * u)), o = w.dotPh ? g >> 1 : 0, dc = f.beat.pulse > 0.5 ? MID : DARK;
    for (let y = o; y < N; y += g) for (let x = o; x < N; x += g) buf[y * N + x] = dc;
    const bh = Math.max(1, Math.round(1.9 * u)), bc = f.rel.bassClock;
    const bar = (yc, acc, dim) => { for (let b = 0; b < 7; b++) r.rect(0, yc + (b - 3.5) * bh, N, bh, (b === 2 || b === 4 ? acc : COP[b]) + (dim ? DIM : 0)); };
    let first = -1;
    w.bars.forEach((b, k) => {
      b.on = follow(b.on, k < want ? 1 : 0, dt, 0.3);
      if (b.on < 0.08) return;
      const yc = N * (0.5 + b.amp * Math.sin(bc * b.sp + b.ph) + w.jump * 0.12);
      if (first < 0) first = yc;
      bar(yc, k % 2 ? HOT : COOL, b.on < 0.5);
    });
    w.extra = w.extra.filter((x) => {
      x.y += x.vy * dt;
      x.life -= dt;
      bar(N * (x.y + w.jump * 0.12), x.acc, x.life < 0.5);
      return x.life > 0;
    });
    if (first >= 0) targets.push({ x: 0.3 * N, y: first - 4 * bh, w: 0.4 * N, h: 8 * bh });
  },
};

// ---------------------------------------------------------------------------------------------- metaballs
// Blobs on lissajous paths summed as r²/d² per pixel and cut into iso-bands of the ramp, HOT in the cores; their
// number grows with the energy, the bass inflates them, the beat swells the iso level, a kick launches a new
// blob from where it landed toward the middle, a snare throws them apart, a section change re-rolls their paths.
const MB_LUT = Uint8Array.from({ length: 16 }, (_, i) => (i < 3 ? BG : i < 4 ? DARK : i < 5 ? MID : i < 7 ? LMID : i < 12 ? BRIGHT : HOT));
const newBlob = (rnd, k) => ({ fx: 0.4 + rnd() * 0.6, fy: 0.4 + rnd() * 0.6, px: rnd() * TAU, py: rnd() * TAU, ax: 0.15 + rnd() * 0.2, ay: 0.15 + rnd() * 0.2,
  x: 0.5, y: 0.5, vx: 0, vy: 0, on: 0, k, life: Infinity, sz: 0.045 + rnd() * 0.03 });

const metaballs = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { blobs: Array.from({ length: 8 }, (_, k) => newBlob(rnd, k)), shots: [], e: 0, bx: new Float32Array(16), by: new Float32Array(16), bw: new Float32Array(16),
      ax: new Float32Array(16), aw: new Float32Array(16), ay2: new Float32Array(16) });
  },
  draw(W) {
    const { r, N, dt, f, w, rnd, hits, targets } = W, buf = r.buf, { bx, by, bw } = w;
    w.e = follow(w.e, energy(f), dt, 0.5);
    const want = 3 + Math.round(5 * w.e), bc = f.rel.bassClock, mc = f.rel.midClock;
    for (const hh of hits) {
      if (isLow(hh)) {
        const dx = 0.5 - hh.x, dy = 0.5 - hh.y, d = Math.hypot(dx, dy) || 1;
        w.shots.push({ x: hh.x, y: hh.y, vx: (dx / d) * 0.5, vy: (dy / d) * 0.5, life: 2.6, sz: 0.04 + 0.03 * hh.strength });
        if (w.shots.length > 6) w.shots.shift();
      } else if (hh.kind === 'snare') {
        for (const b of w.blobs) { const dx = b.x - 0.5, dy = b.y - 0.5, d = Math.hypot(dx, dy) || 1; b.vx += (dx / d) * 0.6 * hh.strength; b.vy += (dy / d) * 0.6 * hh.strength; }
      }
    }
    if (f.section === 'change') w.blobs.forEach((b, k) => { const nb = newBlob(rnd, k); Object.assign(b, { fx: nb.fx, fy: nb.fy, px: nb.px, py: nb.py, ax: nb.ax, ay: nb.ay }); });
    const grow = (1 + 0.5 * f.rel.bassDrive) * (1 + 0.12 * f.beat.pulse);
    let n = 0;
    w.blobs.forEach((b, k) => {
      b.on = follow(b.on, k < want ? 1 : 0, dt, 0.5);
      b.x = follow(b.x, 0.5 + b.ax * Math.sin(bc * b.fx + b.px), dt, 0.35) + b.vx * dt;
      b.y = follow(b.y, 0.5 + b.ay * Math.sin(mc * b.fy + b.py), dt, 0.35) + b.vy * dt;
      b.vx *= Math.exp(-dt * 2.5); b.vy *= Math.exp(-dt * 2.5);
      if (b.on < 0.03) return;
      const R = b.sz * N * grow * b.on;
      bx[n] = b.x * N; by[n] = b.y * N; bw[n] = R * R; n++;
    });
    w.shots = w.shots.filter((sh) => {
      sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.life -= dt;
      const R = sh.sz * N * grow * Math.min(1, sh.life);
      if (n < 16) { bx[n] = sh.x * N; by[n] = sh.y * N; bw[n] = R * R; n++; }
      return sh.life > 0;
    });
    // per row only the blobs that can still reach a band take part
    const { ax, aw, ay2 } = w;
    for (let y = 0, i = 0; y < N; y++) {
      let m = 0;
      for (let k = 0; k < n; k++) { const d = y + 0.5 - by[k], q = d * d + 1; if (bw[k] / q > 0.02) { ax[m] = bx[k]; aw[m] = bw[k]; ay2[m] = q; m++; } }
      if (!m) { buf.fill(BG, i, i + N); i += N; continue; }
      for (let x = 0; x < N; x++, i++) {
        let s = 0;
        for (let k = 0; k < m; k++) { const d = x + 0.5 - ax[k]; s += aw[k] / (d * d + ay2[k]); }
        buf[i] = MB_LUT[s >= 3.9 ? 15 : (s * 4) | 0];
      }
    }
    if (n) targets.push({ x: bx[0] - Math.sqrt(bw[0]), y: by[0] - Math.sqrt(bw[0]), w: 2 * Math.sqrt(bw[0]), h: 2 * Math.sqrt(bw[0]) });
  },
};

// ---------------------------------------------------------------------------------------------- twister
// The twisting column: four faces shaded DARK, MID, LMID, BRIGHT, the twist a sine along the height that runs on
// the mid clock, over raster lines rising with the bass clock. The column breathes with the bass and the beat, a
// kick widens it, a snare sends a kink travelling down it, a drop splits it in two for a while.
const twister = {
  init(W) {
    Object.assign(W.w, { rot: W.rnd() * TAU, kinks: [], two: 0, twoT: 0, bump: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, hits, targets, s } = W, buf = r.buf;
    for (const hh of hits) {
      if (hh.kind === 'snare') { w.kinks.push({ y: -0.1, amp: 1.4 * (0.4 + hh.strength), v: 0.9 }); if (w.kinks.length > 4) w.kinks.shift(); }
      else if (isLow(hh)) { w.bump = Math.max(w.bump, hh.strength); if (hh.strength > 0.8) s.shake = Math.max(s.shake, 0.25); }
    }
    if (f.section === 'drop') w.twoT = 8;
    w.twoT -= dt;
    w.two = follow(w.two, w.twoT > 0 ? 1 : 0, dt, 0.5);
    w.bump *= Math.exp(-dt * 6);
    w.kinks = w.kinks.filter((k) => { k.y += k.v * dt; k.amp *= Math.exp(-dt * 0.5); return k.y < 1.3 && k.amp > 0.05; });
    if (f.beat.on) w.rot += 0.2;
    w.rot += dt * (0.5 + 1.5 * f.rel.midDrive);
    const g = Math.max(3, Math.round(6 * u)), sh = (g - (Math.round(f.rel.bassClock * 20 * u) % g)) % g; // the lines rise as the clock advances
    for (let y = sh; y < N; y += g) r.rect(0, y, N, 1, DARK + DIM);
    const mc = f.rel.midClock, hw0 = N * (0.13 + 0.06 * f.rel.bassDrive + 0.03 * f.beat.pulse) * (1 + 0.25 * w.bump);
    const face = (y, xa, xb, c) => { if (xb > xa) buf.fill(c, y * N + Math.max(0, Math.round(xa)), y * N + Math.min(N, Math.round(xb))); };
    const column = (cx, hw, ph) => {
      if (hw < 1) return;
      for (let y = 0; y < N; y++) {
        const yn = y / N;
        let a = w.rot + ph + Math.sin(yn * 4.5 + mc * 1.3) * 1.2;
        for (const k of w.kinks) { const d = (yn - k.y) / 0.08; a += k.amp * Math.exp(-d * d); }
        const x0 = cx + hw * Math.sin(a), x1 = cx + hw * Math.cos(a), x2 = 2 * cx - x0, x3 = 2 * cx - x1;
        face(y, x0, x1, DARK); face(y, x1, x2, MID); face(y, x2, x3, LMID); face(y, x3, x0, BRIGHT);
      }
      targets.push({ x: cx - hw, y: 0.3 * N, w: 2 * hw, h: 0.4 * N });
    };
    column(N * (0.5 - 0.25 * w.two), hw0 * (1 - 0.35 * w.two), 0);
    if (w.two > 0.02) column(N * (0.5 + 0.25 * w.two), hw0 * 0.65 * w.two, 1.1);
  },
};

// ---------------------------------------------------------------------------------------------- voxel
// A voxel landscape flown over column by column with a y-buffer in a pinhole view: a tiled noise heightmap shaded by
// height (water COOL, shore DARK, slopes MID and LMID with the ones facing us lit, peaks BRIGHT or HOT at sunset), fog
// far off, a sun over the horizon. Height and speed from the energy (never below the ground), a kick dips, a snare
// banks into a turn, a beat rings out over the ground.
function voxelMap(W) {
  const { w, seed } = W, S = 128, noise = makeNoise((seed | 0) + 77), map = new Float32Array(S * S), sc = 9;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const fx = x / S, fy = y / S;
      const a = noise.fbm(fx * sc, fy * sc, 4), b = noise.fbm((fx - 1) * sc, fy * sc, 4), c = noise.fbm(fx * sc, (fy - 1) * sc, 4), d = noise.fbm((fx - 1) * sc, (fy - 1) * sc, 4);
      map[y * S + x] = clamp((lerp(lerp(a, b, fx), lerp(c, d, fx), fy) - 0.5) * 1.7 + 0.5);
    }
  w.map = map;
}

const voxel = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { px: rnd() * 128, py: rnd() * 128, head: rnd() * TAU, headTo: 0, dip: 0, camH: 0.7, water: 0.3, waterTo: 0.3, sunset: rnd() < 0.3 ? 1 : 0, sunAz: rnd() * TAU });
    w.headTo = w.head;
    voxelMap(W);
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, buf = r.buf, map = w.map;
    for (const hh of hits) {
      if (hh.kind === 'snare') w.headTo += (rnd() < 0.5 ? -1 : 1) * (0.4 + 0.5 * hh.strength);
      else if (isLow(hh)) w.dip = Math.max(w.dip, hh.strength);
    }
    if (f.section === 'change') { w.sunset ^= 1; w.waterTo = 0.22 + rnd() * 0.2; }
    if (f.section === 'drop') w.headTo += Math.PI;
    w.dip *= Math.exp(-dt * 5);
    w.water = follow(w.water, w.waterTo, dt, 1.5);
    w.head = followAngle(w.head, w.headTo, dt, 0.6);
    const e = energy(f), speed = 128 * (0.03 + 0.12 * e), bank = clamp(wrapAngle(w.headTo - w.head), -1, 1), fx = Math.cos(w.head), fy = Math.sin(w.head);
    w.px = (((w.px + fx * speed * dt) % 128) + 128) % 128;
    w.py = (((w.py + fy * speed * dt) % 128) + 128) % 128;
    const px = w.px + 4096, py = w.py + 4096, FOV = 1.1, TF = 2 * Math.tan(FOV / 2), at = (x, y) => map[(((y | 0) & 127) << 7) | ((x | 0) & 127)];
    // the camera rides the energy and dips on a kick, but stays above the ground under it, ahead, and at the sides of the nearest rings
    let floor = 0;
    for (let z = 0; z <= 8; z += 2) floor = Math.max(floor, at(px + fx * z, py + fy * z));
    for (let k = -1; k <= 1; k += 2) for (let z = 2; z <= 4; z += 2) { const tx = (k * TF) / 2; floor = Math.max(floor, at(px + (fx - fy * tx) * z, py + (fy + fx * tx) * z)); } // the left and right edge rays
    w.camH = follow(w.camH, Math.max(0.55 + 0.35 * e - 0.2 * w.dip, floor + 0.15), dt, 0.3);
    // a pinhole view: the columns spread by tan over the FOV, the horizon is one line that banking tilts through the
    // middle and a nose dip lifts; a column's top is horizon + (camH - h) * F / z with z the depth along the view axis
    const camH = Math.max(w.camH, floor + 0.08), hz = 0.45 * N - 2 * u * w.dip, F = 7 * N, tilt = -0.25 * bank, water = w.water, sunset = w.sunset; // banking into a right turn lifts the right end
    const peak = sunset ? HOT : BRIGHT, fog = DARK + DIM, glow = (sunset ? HOT : LMID) + DIM, b6 = Math.round(6 * u), b2 = Math.max(1, Math.round(2.5 * u));
    // the sky: a haze band along the horizon, tilted with it
    for (let x = 0; x < N; x++) {
      const h0 = (hz + tilt * (x - N / 2)) | 0;
      for (let yy = h0 - b6 < 0 ? 0 : h0 - b6; yy < (h0 < N ? h0 : N); yy++) buf[yy * N + x] = yy >= h0 - b2 ? glow : fog;
    }
    // the sun: where its bearing lands in the same projection, over the horizon there
    const da = wrapAngle(w.sunAz - w.head);
    if (Math.abs(da) < 1) {
      const sunX = N * (0.5 + Math.tan(da) / TF), sunY = hz + tilt * (sunX - N / 2) - 9 * u;
      if (sunX > -0.1 * N && sunX < 1.1 * N) { r.disc(sunX, sunY, 5 * u * (1 + 0.15 * f.beat.pulse), sunset ? HOT : BRIGHT); targets.push({ x: sunX - 5 * u, y: sunY - 5 * u, w: 10 * u, h: 10 * u }); }
    }
    const ringZ = 2 + (1 - f.beat.pulse) * 88;
    for (let x = 0; x < N; x++) {
      const tx = (x / N - 0.5) * TF, dx = fx - fy * tx, dy = fy + fx * tx, len = Math.sqrt(1 + tx * tx), hzx = hz + tilt * (x - N / 2);
      let yb = N, hp = 0;
      for (let z = 2, dz = 0.5; z < 90; z += dz, dz *= 1.025) {
        let h = map[((((py + dy * z) | 0) & 127) << 7) | (((px + dx * z) | 0) & 127)];
        let c;
        if (h < water) { h = water; c = COOL; } else { c = h < water + 0.08 ? DARK : h < 0.45 ? MID : h < 0.68 ? LMID : peak; if (h - hp > 0.02 * dz && c !== peak) c = UP[c]; } // the slopes facing us are lit
        hp = h;
        const sy = (hzx + ((camH - h) * F) / z) | 0;
        if (sy >= yb) continue;
        const d = z * len; // the distance from the camera: the beat's ring is a circle on the ground, the fog a sphere
        if (Math.abs(d - ringZ) < 1.5) c = BRIGHT; else if (d > 50) c += DIM;
        for (let yy = sy < 0 ? 0 : sy; yy < yb; yy++) buf[yy * N + x] = c;
        yb = sy < 0 ? 0 : sy;
        if (yb === 0) break;
      }
      for (let yy = hzx < 0 ? 0 : hzx | 0; yy < yb; yy++) buf[yy * N + x] = fog; // the ground runs on into the haze up to the horizon
    }
  },
};

// ---------------------------------------------------------------------------------------------- dots
// A dot object of four hundred points (a sphere, a torus, a lissajous knot; the next morphs in on a section change)
// spinning on the bass and mid clocks in perspective, the back dots dim and the front ones BRIGHT; the beat and the
// kicks swell it, a snare blows the dots outward and a spring pulls them back, a note lights a run of them COOL.
function dotShape(kind, n, out) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, g = i * 2.399963;
    let x, y, z;
    if (kind === 0) { const ph = Math.acos(1 - 2 * t); x = Math.sin(ph) * Math.cos(g); y = Math.sin(ph) * Math.sin(g); z = Math.cos(ph); }
    else if (kind === 1) { const v = i * 0.7639, q = 0.68 + 0.3 * Math.cos(v); x = q * Math.cos(g); y = q * Math.sin(g); z = 0.3 * Math.sin(v); }
    else { const a = t * TAU; x = Math.sin(3 * a + 1.2) * 0.9; y = Math.sin(2 * a) * 0.9; z = Math.sin(5 * a + 0.4) * 0.9; }
    out[3 * i] = x; out[3 * i + 1] = y; out[3 * i + 2] = z;
  }
}

const dots = {
  init(W) {
    const { w, rnd } = W, n = 400;
    Object.assign(w, { n, A: new Float32Array(3 * n), B: new Float32Array(3 * n), P: new Float32Array(3 * n), kind: Math.floor(rnd() * 3), morph: 1, ex: 0, exv: 0, kick: 0, flash: new Float32Array(n) });
    dotShape(w.kind, n, w.A);
    dotShape(w.kind, n, w.B);
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, n = w.n, { A, B, P, flash } = w;
    for (const hh of hits) {
      if (hh.kind === 'snare') w.exv += 2.5 * hh.strength;
      else if (isLow(hh)) w.kick = Math.max(w.kick, hh.strength);
      else if (isTonal(hh)) { const k0 = Math.floor((hh.pc / 12) * n); for (let k = k0; k < Math.min(n, k0 + 30); k++) flash[k] = 1; }
    }
    if (f.section === 'change') {
      for (let i = 0; i < 3 * n; i++) A[i] = lerp(A[i], B[i], w.morph);
      w.kind = (w.kind + 1 + Math.floor(rnd() * 2)) % 3;
      dotShape(w.kind, n, B);
      w.morph = 0;
    }
    if (f.section === 'drop') w.exv += 4;
    w.morph = Math.min(1, w.morph + dt / 1.2);
    w.exv += (-w.ex * 40 - w.exv * 4) * dt;
    w.ex += w.exv * dt;
    w.kick *= Math.exp(-dt * 5);
    const yaw = f.rel.bassClock * 0.7, pit = f.rel.midClock * 0.5, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
    const R = N * 0.3 * (1 + 0.08 * f.beat.pulse + 0.12 * w.kick), cx = N / 2, cz = N / 2, m = w.morph, ex = w.ex;
    for (let i = 0; i < n; i++) {
      const s = 1 + ex * (0.5 + hash(i, 3)), x = lerp(A[3 * i], B[3 * i], m) * s, y = lerp(A[3 * i + 1], B[3 * i + 1], m) * s, z = lerp(A[3 * i + 2], B[3 * i + 2], m) * s;
      const x1 = x * cy + z * sy, z1 = z * cy - x * sy, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp, d = 3 / Math.max(0.5, 3 + z2); // the eye is 3 radii out; a blown-out dot never flips through it
      P[3 * i] = cx + x1 * R * d; P[3 * i + 1] = cz + y2 * R * d; P[3 * i + 2] = z2;
      flash[i] *= Math.exp(-dt * 5);
    }
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < n; i++) {
        const z = P[3 * i + 2];
        if ((z > 0) !== (pass === 0)) continue;
        const sz = z < -0.5 ? 2 * u : z < 0.3 ? u : 1, c = flash[i] > 0.3 ? COOL : z > 0.5 ? DARK + DIM : z > 0 ? MID + DIM : z > -0.5 ? LMID : BRIGHT;
        r.rect(P[3 * i] - sz / 2, P[3 * i + 1] - sz / 2, Math.max(1, sz), Math.max(1, sz), c);
      }
    targets.push({ x: cx - R * 0.7, y: cz - R * 0.7, w: R * 1.4, h: R * 1.4 });
  },
};

// ---------------------------------------------------------------------------------------------- starfield
// Stars flying out of the middle, sized and shaded by depth, streaking when the energy is up and at warp on a
// drop; in the centre a wireframe cube tumbling on the clocks that pulses on the beat, a kick knocks it aside
// and sets it spinning until the spring brings it back; a hat twinkles a star, a snare a handful.
const CUBE_E = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
const starfield = {
  init(W) {
    const { w, rnd } = W, n = 220;
    Object.assign(w, { n, sx: new Float32Array(n), sy: new Float32Array(n), sz: new Float32Array(n), pz: new Float32Array(n), warp: 0, kx: 0, ky: 0, kvx: 0, kvy: 0, spin: 0, spinV: 0, e: 0, tw: [], vx: new Float32Array(8), vy: new Float32Array(8), vz: new Float32Array(8) });
    for (let i = 0; i < n; i++) { w.sx[i] = rnd() * 2 - 1; w.sy[i] = rnd() * 2 - 1; w.sz[i] = w.pz[i] = 0.05 + rnd() * 0.95; }
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s } = W, n = w.n, cx = N / 2, cy = N / 2;
    for (const hh of hits) {
      if (isLow(hh)) { w.kvx += (0.5 - hh.x) * 2.5 * hh.strength; w.kvy += (0.5 - hh.y) * 2.5 * hh.strength; w.spinV += 7 * hh.strength * (rnd() < 0.5 ? -1 : 1); s.shake = Math.max(s.shake, 0.3 * hh.strength); }
      else if (hh.kind === 'hat') w.tw.push({ i: Math.floor(rnd() * n), t: 0.25 });
      else if (hh.kind === 'snare') for (let k = 0; k < 6; k++) w.tw.push({ i: Math.floor(rnd() * n), t: 0.3 });
    }
    if (f.section === 'drop') w.warp = 1;
    w.warp *= Math.exp(-dt / 2);
    w.e = follow(w.e, energy(f), dt, 0.3);
    const speed = (0.15 + 0.9 * w.e) * (1 + 6 * w.warp), streak = w.e > 0.5 || w.warp > 0.1, { sx, sy, sz, pz } = w;
    for (let i = 0; i < n; i++) {
      pz[i] = sz[i];
      let z = sz[i] - speed * dt;
      const px = cx + (sx[i] / z) * N * 0.5, py = cy + (sy[i] / z) * N * 0.5;
      if (z < 0.03 || px < 0 || py < 0 || px >= N || py >= N) { sz[i] = 1; sx[i] = rnd() * 2 - 1; sy[i] = rnd() * 2 - 1; continue; }
      sz[i] = z;
      const c = z < 0.25 ? BRIGHT : z < 0.5 ? LMID : z < 0.75 ? MID : DARK;
      if (streak && z < 0.8) r.line(cx + (sx[i] / pz[i]) * N * 0.5, cy + (sy[i] / pz[i]) * N * 0.5, px, py, c);
      const d = z < 0.25 ? 2 * u : z < 0.6 ? u : 1;
      r.rect(px - d / 2, py - d / 2, Math.max(1, d), Math.max(1, d), c);
    }
    w.tw = w.tw.filter((q) => {
      const z = sz[q.i], px = cx + (sx[q.i] / z) * N * 0.5, py = cy + (sy[q.i] / z) * N * 0.5;
      r.rect(px - 2 * u, py, 5 * u, 1, BRIGHT); r.rect(px, py - 2 * u, 1, 5 * u, BRIGHT);
      return (q.t -= dt) > 0;
    });
    // the cube
    w.kvx += (-w.kx * 50 - w.kvx * 5) * dt; w.kvy += (-w.ky * 50 - w.kvy * 5) * dt;
    w.kx += w.kvx * dt; w.ky += w.kvy * dt;
    w.spinV *= Math.exp(-dt * 1.5);
    w.spin += w.spinV * dt;
    const ax = f.rel.bassClock * 0.8 + w.spin, ay = f.rel.midClock * 0.6, ca = Math.cos(ax), sa = Math.sin(ax), cb = Math.cos(ay), sb = Math.sin(ay);
    const S = N * 0.14 * (1 + 0.25 * f.beat.pulse), ox = cx + w.kx * N, oy = cy + w.ky * N, { vx, vy, vz } = w, lw = Math.max(1, u);
    for (let k = 0; k < 8; k++) {
      const x = k & 1 ? 1 : -1, y = k & 2 ? 1 : -1, z = k & 4 ? 1 : -1;
      const y1 = y * ca - z * sa, z1 = y * sa + z * ca, x2 = x * cb + z1 * sb, z2 = z1 * cb - x * sb, d = 2.6 / (2.6 + z2);
      vx[k] = ox + x2 * S * d; vy[k] = oy + y1 * S * d; vz[k] = z2;
    }
    const ec = f.beat.pulse > 0.75 ? BRIGHT : FIG;
    for (const [a, b] of CUBE_E) if (vz[a] + vz[b] > 0) r.line(vx[a], vy[a], vx[b], vy[b], MID);
    for (const [a, b] of CUBE_E) if (vz[a] + vz[b] <= 0) r.stroke(vx[a], vy[a], vx[b], vy[b], lw, ec);
    for (let k = 0; k < 8; k++) if (vz[k] < 0) r.rect(vx[k] - u, vy[k] - u, Math.max(1, 2 * u), Math.max(1, 2 * u), BRIGHT);
    targets.push({ x: ox - S * 1.2, y: oy - S * 1.2, w: S * 2.4, h: S * 2.4 });
  },
};

// ---------------------------------------------------------------------------------------------- bobs
// Shade bobs: soft discs on lissajous paths added into an accumulation buffer that fades over time and is cut
// onto the ramp, the overlaps glowing HOT; their number grows with the energy, the beat brightens what they lay
// down, a kick turns them all around, a snare whites the screen for a frame, a section change re-rolls the paths.
const BOB_LUT = Uint8Array.from({ length: 16 }, (_, i) => (i < 1 ? BG : i < 3 ? DARK : i < 5 ? MID : i < 7 ? LMID : i < 10 ? BRIGHT : HOT));
function bobsTables(W) {
  const { w, N } = W, R = Math.max(2, Math.round(0.07 * N)), K = 2 * R + 1, ker = new Float32Array(K * K);
  for (let y = 0; y < K; y++) for (let x = 0; x < K; x++) { const d = Math.hypot(x - R, y - R) / R; ker[y * K + x] = d < 1 ? (1 - d * d) ** 1.5 : 0; }
  Object.assign(w, { N, R, K, ker, acc: new Float32Array(N * N) });
}
const bobPaths = (rnd) => Array.from({ length: 14 }, () => ({ fx: 0.5 + rnd() * 0.9, fy: 0.5 + rnd() * 0.9, px: rnd() * TAU, py: rnd() * TAU, on: 0 }));

const bobs = {
  init(W) {
    Object.assign(W.w, { paths: bobPaths(W.rnd), ph: W.rnd() * 10, dir: 1, e: 0, flash: 0 });
    bobsTables(W);
  },
  draw(W) {
    const { r, N, dt, f, w, rnd, hits, targets } = W, buf = r.buf;
    if (w.N !== N) bobsTables(W);
    for (const hh of hits) {
      if (isLow(hh)) w.dir = -w.dir;
      else if (hh.kind === 'snare' && hh.strength > 0.5) w.flash = 1;
    }
    if (f.section === 'change') w.paths = bobPaths(rnd);
    w.e = follow(w.e, energy(f), dt, 0.4);
    w.ph += dt * (0.6 + 1.6 * f.rel.midDrive) * w.dir;
    const { acc, ker, R, K } = w, fade = Math.exp(-dt / (0.35 + 0.7 * f.level)), want = 3 + Math.round(10 * w.e), amp = 1.3 * (1 + 0.5 * f.beat.pulse);
    for (let i = 0, n = N * N; i < n; i++) acc[i] *= fade;
    let first = null;
    w.paths.forEach((p, k) => {
      p.on = follow(p.on, k < want ? 1 : 0, dt, 0.4);
      if (p.on < 0.05) return;
      const x = N * (0.5 + 0.38 * Math.sin(w.ph * p.fx + p.px)), y = N * (0.5 + 0.38 * Math.sin(w.ph * p.fy + p.py)), a = amp * p.on * Math.min(3, 30 * dt); // laid down per second, not per frame
      first = first || { x, y };
      const x0 = Math.round(x) - R, y0 = Math.round(y) - R;
      for (let ky = 0; ky < K; ky++) {
        const yy = y0 + ky;
        if (yy < 0 || yy >= N) continue;
        for (let kx = 0; kx < K; kx++) { const xx = x0 + kx; if (xx >= 0 && xx < N) acc[yy * N + xx] += ker[ky * K + kx] * a; }
      }
    });
    if (w.flash) { w.flash = 0; buf.fill(BRIGHT); }
    else for (let i = 0, n = N * N; i < n; i++) { const v = acc[i] * 5; buf[i] = BOB_LUT[v >= 15 ? 15 : v | 0]; }
    if (first) targets.push({ x: first.x - R, y: first.y - R, w: 2 * R, h: 2 * R });
  },
};

// ---------------------------------------------------------------------------------------------- fire
// The fire: seeds along the bottom at the level, the heat is averaged upward and cooled so many rows a second (more
// at the bigger sizes, so it climbs the same), mapped BG→DARK→HOT→LMID→BRIGHT→WHITE; the bass and the beat feed the
// seeds, a kick throws a flare where it landed, a snare a burst of sparks that light the flames where they fall, a section change turns the wind.
const FIRE_LUT = [BG, DARK + DIM, DARK, HOT + DIM, HOT, LMID, BRIGHT, WHITE];
const firePasses = (N) => (N > 150 ? 3 : N > 90 ? 2 : 1);
// the two seed rows under the screen: a share of them at full heat, the rest glowing
function fireSeed(w, N, share, frame) {
  const n = N * N;
  for (let x = 0; x < N; x++) { const v = hash(x, frame) < share ? 1 : 0.3 * hash(x, frame + 7); w.heat[n + x] = v; w.heat[n + N + x] = v; }
}
// one row of climb: each cell the mean of the three below it (shifted by the wind) and the one under those,
// less the cooling, which is a blotchy field scrolling up with the flames so the tongues hold together
function fireStep(w, N, cool, wd, shift) {
  const { heat, cmap } = w, x0 = Math.max(1, 1 - wd), x1 = Math.min(N - 1, N - 1 - wd);
  for (let y = 0; y < N; y++) {
    const b = (y + 1) * N + wd, b2 = (y + 2) * N, row = y * N, crow = ((y + shift) % N) * N;
    for (let x = x0; x < x1; x++) {
      const v = (heat[b + x - 1] + heat[b + x] + heat[b + x + 1] + heat[b2 + x]) * 0.25 - cool * cmap[crow + x];
      heat[row + x] = v > 0 ? v : 0;
    }
    // the side cells the wind leaves out (one or two) cool off their neighbour, so none holds stale heat
    for (let x = x0 - 1; x >= 0; x--) heat[row + x] = heat[row + x + 1] * 0.7;
    for (let x = x1; x < N; x++) heat[row + x] = heat[row + x - 1] * 0.7;
  }
}
function fireTables(W) {
  const { w, N, u, seed } = W, n = N * N, noise = makeNoise((seed | 0) + 31), cmap = new Float32Array(n);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) cmap[y * N + x] = 0.25 + 2.2 * noise.fbm(x / (3.5 * u), y / (3.5 * u), 2) ** 1.5;
  Object.assign(w, { N, heat: new Float32Array(n + 2 * N), cmap });
  for (let k = 0; k < N; k++) { fireSeed(w, N, 0.7, k); fireStep(w, N, 2.1 / N, 0, k); } // already burning when it comes on
}

const fire = {
  init(W) {
    Object.assign(W.w, { wind: 0, frame: 0, owe: 0, step: 0, sparks: [], flares: [] });
    fireTables(W);
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, buf = r.buf;
    if (w.N !== N) fireTables(W);
    const { heat } = w, n = N * N;
    for (const hh of hits) {
      if (isLow(hh)) w.flares.push({ x: hh.x * N, y: hh.y * N, t: 0.12, s: hh.strength });
      else if (hh.kind === 'snare') for (let k = 0; k < 10 + 14 * hh.strength; k++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 1.6, sp = N * (0.3 + rnd() * 0.5); w.sparks.push({ x: hh.x * N, y: N - 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6 + rnd() * 0.7 }); }
    }
    if (f.section === 'change') w.wind = w.wind === 0 ? (rnd() < 0.5 ? -1 : 1) : 0;
    w.frame++;
    const lvl = clamp(0.5 * f.level + 0.5 * f.rel.bassDrive), passes = firePasses(N), cool = (3.2 - 2.2 * lvl) / N;
    fireSeed(w, N, clamp(0.25 + 0.7 * lvl + 0.3 * f.beat.pulse), w.frame);
    // the climb is so many rows a second: the steps are owed with dt and caught up (within bounds) after a dropped frame
    w.owe = Math.min(w.owe + dt * 30 * passes, 3 * passes);
    const steps = Math.min(2 * passes, w.owe | 0);
    w.owe -= steps;
    for (let p = 0; p < steps; p++, w.step = (w.step + 1) % N) fireStep(w, N, cool, w.wind, w.step);
    w.flares = w.flares.filter((fl) => {
      const R = (2 + 3 * fl.s) * u;
      for (let y = Math.max(0, Math.floor(fl.y - R)); y < Math.min(N, fl.y + R); y++)
        for (let x = Math.max(0, Math.floor(fl.x - R)); x < Math.min(N, fl.x + R); x++) if ((x - fl.x) ** 2 + (y - fl.y) ** 2 < R * R) heat[y * N + x] = 0.95;
      return (fl.t -= dt) > 0;
    });
    w.sparks = w.sparks.filter((sp) => {
      sp.vy += N * 0.5 * dt;
      sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      sp.life -= dt;
      const x = sp.x | 0, y = sp.y | 0;
      if (x >= 0 && x < N && y >= 0 && y < N) heat[y * N + x] = 1;
      return sp.life > 0 && sp.y < N;
    });
    for (let i = 0; i < n; i++) { const v = heat[i]; buf[i] = FIRE_LUT[v >= 0.999 ? 7 : (v * 8) | 0]; }
    for (const sp of w.sparks) r.rect(sp.x, sp.y, Math.max(1, u), Math.max(1, u), BRIGHT);
    targets.push({ x: 0.3 * N, y: 0.5 * N, w: 0.4 * N, h: 0.4 * N });
  },
};

// ---------------------------------------------------------------------------------------------- lens
// A magnifying lens over rings and a grid (or a checker with a diagonal, or nested squares): inside it the picture
// is pulled toward the centre and lifted a step up the ramp, with a rim and a highlight. It breathes with the bass
// and moves at the pace of the treble, a kick bulges it, the rim flashes on the beat, a second lens comes when the energy is up, a snare swaps the background.
function lensTables(W) {
  const { w, N, u } = W, n = N * N, dist = new Float32Array(n), sq = new Float32Array(n);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dx = x + 0.5 - N / 2, dy = y + 0.5 - N / 2; dist[y * N + x] = Math.hypot(dx, dy) / u + 4096; sq[y * N + x] = Math.max(Math.abs(dx), Math.abs(dy)) / u + 4096; }
  Object.assign(w, { N, dist, sq, bg: new Uint8Array(n), cxI: new Int32Array(N) });
}

const lens = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { pat: Math.floor(rnd() * 3), ph: rnd() * 10, scroll: 0, dir: 1, kick: 0, two: 0, p1: rnd() * TAU, p2: rnd() * TAU });
    lensTables(W);
  },
  draw(W) {
    const { r, N, u, dt, f, w, hits, targets } = W, buf = r.buf;
    if (w.N !== N) lensTables(W);
    for (const hh of hits) {
      if (hh.kind === 'snare') w.pat = (w.pat + 1) % 3;
      else if (isLow(hh)) w.kick = Math.max(w.kick, hh.strength);
    }
    if (f.section === 'change') w.dir = -w.dir;
    w.kick *= Math.exp(-dt * 5);
    w.ph += dt * (0.3 + 1.4 * f.rel.trebDrive);
    w.scroll += dt * (1 + 3 * f.rel.bassDrive) * w.dir;
    w.two = follow(w.two, energy(f) > 0.55 ? 1 : 0, dt, 0.6);
    // the background
    const { dist, sq, bg, cxI } = w, n = N * N, pat = w.pat, ph = w.scroll * 2, g = Math.max(2, Math.round(8 * u)), gm = Math.max(1, Math.round(16 * u));
    for (let x = 0; x < N; x++) cxI[x] = (x / g) | 0;
    const sh = (w.scroll | 0), d2 = (w.scroll * 3) | 0;
    for (let y = 0, i = 0; y < N; y++) {
      const cy = cxI[y], gy = y % gm === 0;
      for (let x = 0; x < N; x++, i++) {
        let c;
        if (pat === 0) c = gy || x % gm === 0 ? LMID : (((dist[i] + ph) | 0) & 7) < 3 ? MID : DARK;
        else if (pat === 1) c = ((x + y + d2) & 15) < 2 ? COOL : (cxI[x] + cy + sh) & 1 ? MID : DARK;
        else c = (((sq[i] - ph) | 0) & 7) < 3 ? LMID : ((x ^ y) & 4) ? DARK : DARK + DIM;
        bg[i] = c;
      }
    }
    buf.set(bg);
    // the lenses
    const Rl = N * (0.13 + 0.07 * f.rel.bassDrive + 0.02 * f.beat.pulse), bulge = 0.45 + 0.3 * w.kick, rim = f.beat.pulse > 0.6 ? BRIGHT : FIG;
    const glass = (lx, ly, R) => {
      if (R < 2) return;
      const R2 = R * R;
      for (let y = Math.max(0, Math.floor(ly - R)); y < Math.min(N, ly + R); y++) {
        const dy = y + 0.5 - ly, dy2 = dy * dy;
        for (let x = Math.max(0, Math.floor(lx - R)); x < Math.min(N, lx + R); x++) {
          const dx = x + 0.5 - lx, q = dx * dx + dy2;
          if (q >= R2) continue;
          const fac = 1 - bulge * Math.sqrt(1 - q / R2);
          const sx = (lx + dx * fac) | 0, sy = (ly + dy * fac) | 0;
          const c = bg[(sy < 0 ? 0 : sy >= N ? N - 1 : sy) * N + (sx < 0 ? 0 : sx >= N ? N - 1 : sx)];
          buf[y * N + x] = c < 8 ? UP[c] : c;
        }
      }
      r.ring(lx, ly, R, Math.max(1, u), rim);
      r.disc(lx - R * 0.45, ly - R * 0.45, R * 0.12, BRIGHT);
      targets.push({ x: lx - R, y: ly - R, w: 2 * R, h: 2 * R });
    };
    glass(N * (0.5 + 0.3 * Math.sin(w.ph + w.p1)), N * (0.5 + 0.3 * Math.sin(w.ph * 0.73 + w.p2)), Rl);
    if (w.two > 0.03) glass(N * (0.5 + 0.32 * Math.sin(w.ph * 0.61 + w.p2 + 2)), N * (0.5 + 0.3 * Math.sin(w.ph * 0.87 + w.p1 + 1)), Rl * 0.75 * w.two);
  },
};

const WORLDS = { plasma, tunnel, rotozoom, copper, metaballs, twister, voxel, dots, starfield, bobs, fire, lens };
registerFamily('demo', WORLD_DEFS, WORLDS);
export const DEMO_STYLE = makeMixStyle('DEMOSCENE', ['demo']);
