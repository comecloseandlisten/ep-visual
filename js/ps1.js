// 32-BIT, mixed. The look of fifth-generation console 3D as original scenes: a survival-horror hallway under fixed
// cameras, a wobbly racing track, a platformer over a void, a fighting stage, a world map that curves away, a mech
// in the desert, a rail shooter through a station, a snowboard run, an isometric tactics map, a memory-card screen,
// a demo-disc menu and a night drive through the fog. One tiny software pipeline draws them all: vertices snapped to
// whole cells (and knocked a cell aside on the beat), flat faces lit from one direction, a painter's sort, affine
// stripes and checks that kink along a quad's diagonal, dithered ramps, and fog that pops faces in at a distance.
// No games, characters, logos or text: original shapes only. Every world rolls a variant table weighed by the
// mood's arousal band, re-rolls it on a section change and goes heavy on a drop.
import { clamp, lerp, BAYER } from './pixels.js';
import { FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pickW, isLow, isTonal, follow,
  wrapAngle, followAngle, ease, beatLocked, hash, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  mansion: { name: 'haunted hallway', va: [[L, M], [M, H], [L, L]], pals: ['midnight', 'noir', 'silver', 'tape', 'amber'], fx: ['film', 'vhs', 'crt', 'none'] },
  racer: { name: 'wobbly circuit', va: [[M, H], [H, H]], pals: ['nineties', 'neon', 'cga', 'crystal', 'candy'], fx: ['crt', 'none', 'hud'] },
  platformer3d: { name: 'floating platforms', va: [[H, M], [M, L], [M, M]], pals: ['candy', 'crystal', 'nineties', 'ice', 'neon'], fx: ['none', 'crt', 'frame'] },
  fightstage: { name: 'fighting stage', va: [[M, H], [L, H]], pals: ['nineties', 'cga', 'neon', 'tape', 'amber'], fx: ['crt', 'none', 'frame'] },
  worldmap: { name: 'world map', va: [[H, M], [M, L], [M, M]], pals: ['crystal', 'nineties', 'ice', 'candy', 'tape'], fx: ['none', 'crt', 'frame'] },
  mechbay: { name: 'desert mech', va: [[M, H], [H, H]], pals: ['amber', 'tape', 'phosphor', 'nineties', 'noir'], fx: ['hud', 'crt', 'none'] },
  railgun: { name: 'rail shooter', va: [[M, H], [H, H]], pals: ['neon', 'cga', 'midnight', 'phosphor', 'nineties'], fx: ['hud', 'crt', 'none'] },
  snowslope: { name: 'snowboard run', va: [[M, H], [H, H]], pals: ['ice', 'crystal', 'silver', 'candy', 'nineties'], fx: ['none', 'crt', 'vhs'] },
  tacticsgrid: { name: 'tactics map', va: [[M, M], [M, L]], pals: ['crystal', 'tape', 'nineties', 'amber', 'ice'], fx: ['frame', 'none', 'crt'] },
  memorycard: { name: 'memory card', va: [[H, M], [M, L], [M, M]], pals: ['silver', 'crystal', 'ice', 'midnight', 'candy'], fx: ['none', 'crt', 'vhs'] },
  discmenu: { name: 'demo disc menu', va: [[H, M], [M, L], [M, M]], pals: ['crystal', 'neon', 'nineties', 'midnight', 'cga'], fx: ['crt', 'none', 'vhs'] },
  fogcity: { name: 'night drive', va: [[L, M], [M, H], [L, L]], pals: ['midnight', 'noir', 'neon', 'amber', 'tape'], fx: ['vhs', 'film', 'crt', 'none'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the variant tables below weigh their kinds by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bpsOf = (f) => (f.bpm ? f.bpm / 60 : 2);
// the one energy knob: bass above the track's own average, the level, the mids
const energy = (f) => clamp(0.5 * f.rel.bassDrive + 0.3 * f.level + 0.2 * f.rel.midDrive);
// beats so far with the phase: the beat's own count when it is locked, else a clock at the tempo
function beats(W) { const { f, w, dt } = W; w.bt = beatLocked(f) ? f.beat.count + f.beat.phase : (w.bt || 0) + dt * bpsOf(f); return w.bt; }
const easeIO = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

// ---------------------------------------------------------------------------------------------- the pipeline
// One tiny software renderer for every world here, the way the fifth-generation consoles drew. A world point goes
// through the camera (yaw, pitch, roll) to the screen and lands on a whole cell: the snapping is where the era's
// jitter comes from, and on the beat every vertex is knocked a cell aside too. Faces are lit flat from one
// direction, stepped down the value ramp by the fog and dropped past the fog distance (they pop in there), painted
// far to near by a sort on depth within layers (1 ground, 2 what lies on it, 3 the rest), and filled with an affine
// "texture": stripes and checks interpolated in screen space, so a quad's bands kink along its diagonal; Gouraud
// levels come out as an ordered dither. Billboards (sprites) sort in with the faces.
const RAMP = [BLACK, DARK + DIM, DARK, MID + DIM, MID, LMID + DIM, LMID, BRIGHT + DIM, BRIGHT]; // the value ramp, 0..8
const PF = 0, PD = 1, PS = 2, PC = 3, PG = 4, PW = 5, TWO = 16; // flat, a 50 % dither, stripes, checks, Gouraud, lit windows; two-sided
const FIX = 32, NEAR = 0.12, MAXF = 1600, MAXS = 320, SPR = MAXF; // FIX + role: a fixed colour instead of a ramp level; ids < 2048
const C = { N: 125, x: 0, y: 0, z: 0, cy: 1, sy: 0, cp: 1, sp: 0, cr: 1, sr: 0, F: 100, hx: 62, hy: 62, ortho: 0, wob: 0, seed: 0,
  fogN: 20, fogF: 40, fogL: 1, Lx: 0, Ly: 1, Lz: 0, lk: 2.6, nf: 0, ns: 0, nk: 0, clipY: NaN }; // clipY: a floor faces are cut at
const IN = new Float64Array(10 * 5), VW = new Float64Array(10 * 5), CLP = new Float64Array(12 * 5), CLW = new Float64Array(10 * 5), BW = new Float64Array(24), MW = new Float64Array(3 * 160);
const FV = new Float32Array(MAXF * 40), FN = new Uint8Array(MAXF), FP = new Uint8Array(MAXF), F0 = new Uint8Array(MAXF), F1 = new Uint8Array(MAXF);
const KEY = new Float64Array(MAXF + MAXS), SP = Array.from({ length: MAXS }, () => ({ k: 0, x: 0, y: 0, z: 0, sc: 1, q: 0, a: 0, b: 0, c: 0 }));
const LIT = Uint8Array.from({ length: 256 }, (_, i) => (hash(i, 77) < 0.42 ? 1 : 0)); // which windows of a grid are lit
let XL = new Float32Array(256), XR = new Float32Array(256), VX = 0, VY = 0, VZ = 0, SX = 0, SY = 0, WX = 0, WY = 0, WZ = 0;
// ZK, when set, is the sort depth instead of the face's own (the face's depth only breaks ties): a track sorts by
// the order of its segments, the way the racing games of the day did
let ZK = NaN, LOFF = 0; // LOFF: which windows of a grid are lit, turned by a world
const fogC = (c, q) => (q > 0.6 && c < 8 ? c + DIM : c);

// a frame: the fog (faces start down the ramp toward level fogL at fogN and are gone past fogF), the beat's wobble
function begin(W, fogN, fogF, fogL) {
  const { N, f } = W;
  if (XL.length < N) { XL = new Float32Array(N); XR = new Float32Array(N); }
  C.N = N; C.fogN = fogN; C.fogF = fogF; C.fogL = fogL; C.nf = C.ns = C.nk = 0; C.ortho = 0; C.clipY = NaN;
  C.wob = f.beat.pulse > 0.6 ? 1 : 0; C.seed = f.beat.count | 0;
  ZK = NaN; LOFF = 0;
  mId();
}
// the eye at (x, y, z) looking along yaw (0 is +z, x to the right) and pitch (down is positive), focal F in cells
function cam(x, y, z, yaw, pitch, F, hx, hy, roll = 0) {
  C.x = x; C.y = y; C.z = z; C.cy = Math.cos(yaw); C.sy = Math.sin(yaw); C.cp = Math.cos(pitch); C.sp = Math.sin(pitch);
  C.cr = Math.cos(roll); C.sr = Math.sin(roll); C.F = F; C.hx = hx; C.hy = hy;
}
// the eye at (x, y, z) looking at (tx, ty, tz)
function look(x, y, z, tx, ty, tz, F, hx, hy, roll = 0) { cam(x, y, z, Math.atan2(tx - x, tz - z), Math.atan2(y - ty, Math.hypot(tx - x, tz - z)), F, hx, hy, roll); }
function light(x, y, z) { const l = Math.hypot(x, y, z); C.Lx = x / l; C.Ly = y / l; C.Lz = z / l; }
function view(x, y, z) {
  const dx = x - C.x, dy = y - C.y, dz = z - C.z, x1 = dx * C.cy - dz * C.sy, z1 = dx * C.sy + dz * C.cy, y1 = dy * C.cp + z1 * C.sp;
  VZ = z1 * C.cp - dy * C.sp; VX = x1 * C.cr + y1 * C.sr; VY = y1 * C.cr - x1 * C.sr;
}
// onto a whole cell, and a cell aside on the beat (the same cell always goes the same way, so shared corners agree)
function proj() {
  const k = C.ortho ? C.F : C.F / VZ;
  let x = Math.round(C.hx + VX * k), y = Math.round(C.hy - VY * k);
  if (C.wob) { const h = hash(x * 7 + y * 131, C.seed); x += ((h * 3) | 0) - 1; y += ((h * 27) | 0) % 3 - 1; }
  SX = x; SY = y;
}
// where a world point lands (false behind the eye); SX, SY and VZ hold the answer
function toScr(x, y, z) { view(x, y, z); if (VZ < NEAR) return false; const wb = C.wob; C.wob = 0; proj(); C.wob = wb; return true; }
const sortKey = (layer, z, i) => (layer * 1048576 + 1048575 - Math.min(1048575, Math.max(0, (z * 1024) | 0))) * 2048 + i;

// the polygon in IN (n corners of x, y, z, s, t in world space): culled when the eye is behind it (unless TWO),
// lit by its normal (computed from the first three corners when not given), fogged, clipped at the near plane,
// snapped and queued. `mat` is a ramp level (0..8, the albedo) or FIX + a role.
function face(n, mat, pat = PF, c1 = -1, layer = 3, zb = 0, nx = 0, ny = 0, nz = 0) {
  if (C.nf >= MAXF || C.nk >= MAXF + MAXS) return;
  const I = IN;
  if (!nx && !ny && !nz) {
    const ax = I[5] - I[0], ay = I[6] - I[1], az = I[7] - I[2], bx = I[10] - I[0], by = I[11] - I[1], bz = I[12] - I[2];
    nx = ay * bz - az * by; ny = az * bx - ax * bz; nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz);
    if (!l) return;
    nx /= l; ny /= l; nz /= l;
  }
  if (C.clipY === C.clipY) { // under the floor it is cut at: what is not up through it yet is not drawn
    let under = 0;
    for (let k = 0; k < n; k++) if (I[5 * k + 1] < C.clipY) under++;
    if (under === n) return;
    if (under) n = clipFloor(n);
  }
  let lam = nx * C.Lx + ny * C.Ly + nz * C.Lz;
  if (nx * (I[0] - C.x) + ny * (I[1] - C.y) + nz * (I[2] - C.z) >= 0) { if (!(pat & TWO)) return; lam = -lam; }
  pat &= 15;
  let zs = 0, behind = 0;
  for (let k = 0; k < n; k++) {
    const o = 5 * k;
    view(I[o], I[o + 1], I[o + 2]);
    VW[o] = VX; VW[o + 1] = VY; VW[o + 2] = VZ; VW[o + 3] = I[o + 3]; VW[o + 4] = I[o + 4];
    zs += VZ;
    if (VZ < NEAR) behind++;
  }
  const z = zs / n;
  if (behind === n || z > C.fogF) return; // behind the eye, or past the fog: not there yet
  const q = z <= C.fogN ? 0 : (z - C.fogN) / (C.fogF - C.fogN);
  let c0 = 0, cc = 0, li = -1;
  lam = lam < 0 ? 0 : lam;
  if (mat >= FIX) { c0 = mat - FIX; if ((lam < 0.12 || q > 0.6) && c0 < 8) c0 += DIM; cc = c1 < 0 ? c0 : fogC(c1, q); }
  else if (pat === PG) { // per-corner levels in s, each fogged by its own depth
    for (let k = 0; k < n; k++) { const o = 5 * k, zq = VW[o + 2] <= C.fogN ? 0 : Math.min(1, (VW[o + 2] - C.fogN) / (C.fogF - C.fogN)); VW[o + 3] += (C.fogL - VW[o + 3]) * zq; }
  } else {
    let lv = mat + C.lk * (lam - 0.5);
    lv += (C.fogL - lv) * q;
    lv = lv < 0 ? 0 : lv > 8 ? 8 : lv;
    li = Math.round(lv);
    if (pat === PF) { const fl = lv | 0, fr = lv - fl; if (fr > 0.36 && fr < 0.64) { pat = PD; c0 = RAMP[fl]; cc = RAMP[fl + 1]; } else c0 = cc = RAMP[li]; }
    else { c0 = RAMP[li]; cc = c1 >= 0 ? fogC(c1, q) : RAMP[Math.max(0, li + (c1 === -2 ? -1 : -2))]; } // the second colour: given, or one or two steps down
  }
  let src = VW, m = n;
  if (behind) { m = clipNear(n); src = CLP; }
  const fi = C.nf++, o = fi * 40;
  for (let k = 0; k < m; k++) {
    const s = 5 * k;
    VX = src[s]; VY = src[s + 1]; VZ = src[s + 2];
    proj();
    FV[o + 4 * k] = SX; FV[o + 4 * k + 1] = SY; FV[o + 4 * k + 2] = src[s + 3]; FV[o + 4 * k + 3] = src[s + 4];
  }
  if (pat === PD) { // the half-tone between two steps reads on a big face only; a small one takes the nearer step
    let a2 = 0;
    for (let k = 0; k < m; k++) { const k1 = (k + 1) % m; a2 += FV[o + 4 * k] * FV[o + 4 * k1 + 1] - FV[o + 4 * k1] * FV[o + 4 * k + 1]; }
    if (Math.abs(a2) < 0.012 * C.N * C.N) { pat = PF; c0 = cc = RAMP[li]; }
  }
  FN[fi] = m; FP[fi] = pat; F0[fi] = c0; F1[fi] = cc;
  KEY[C.nk++] = sortKey(layer, (ZK === ZK ? ZK + z * 0.001 : z) + zb, fi);
}
// the polygon in IN cut at the floor y = C.clipY, in world space, back into IN
function clipFloor(n) {
  const Y = C.clipY;
  let m = 0;
  for (let k = 0; k < n; k++) {
    const a = 5 * k, b = 5 * ((k + 1) % n), ya = IN[a + 1], yb = IN[b + 1];
    if (ya >= Y) { for (let j = 0; j < 5; j++) CLW[5 * m + j] = IN[a + j]; m++; }
    if ((ya >= Y) !== (yb >= Y)) { const t = (Y - ya) / (yb - ya); for (let j = 0; j < 5; j++) CLW[5 * m + j] = IN[a + j] + (IN[b + j] - IN[a + j]) * t; m++; }
  }
  for (let k = 0; k < 5 * m; k++) IN[k] = CLW[k];
  return m;
}
function clipNear(n) {
  let m = 0;
  for (let k = 0; k < n; k++) {
    const a = 5 * k, b = 5 * ((k + 1) % n), za = VW[a + 2], zb = VW[b + 2];
    if (za >= NEAR) { for (let j = 0; j < 5; j++) CLP[5 * m + j] = VW[a + j]; m++; }
    if ((za >= NEAR) !== (zb >= NEAR)) { const t = (NEAR - za) / (zb - za); for (let j = 0; j < 5; j++) CLP[5 * m + j] = VW[a + j] + (VW[b + j] - VW[a + j]) * t; m++; }
  }
  return m;
}
// a corner of the next face: world x, y, z and the texture's s, t
function qv(k, x, y, z, s = 0, t = 0) { const o = 5 * k; IN[o] = x; IN[o + 1] = y; IN[o + 2] = z; IN[o + 3] = s; IN[o + 4] = t; }
// a billboard of kind k at a world point (gone behind the eye and past the fog), for the world's sprite drawer:
// it gets the snapped screen point, `sc` the cells per world unit there, `q` the fog, and a, b, c as given
function spr(k, x, y, z, a = 0, b = 0, c = 0, layer = 3, zb = 0) {
  if (C.ns >= MAXS || C.nk >= MAXF + MAXS) return;
  view(x, y, z);
  if (VZ < NEAR || VZ > C.fogF) return;
  const p = SP[C.ns], zz = VZ;
  proj();
  p.k = k; p.x = SX; p.y = SY; p.z = zz; p.sc = C.ortho ? C.F : C.F / zz; p.q = zz <= C.fogN ? 0 : (zz - C.fogN) / (C.fogF - C.fogN); p.a = a; p.b = b; p.c = c;
  KEY[C.nk++] = sortKey(layer, (ZK === ZK ? ZK : zz) + zb, SPR + C.ns++);
}

// the model matrix (3x4, rows) and its stack: boxes and meshes go through it into the world
const MX = new Float64Array(12), MXS = new Float64Array(12 * 16);
let msp = 0;
function mId() { MX.fill(0); MX[0] = MX[5] = MX[10] = 1; msp = 0; }
function mPush() { MXS.set(MX, 12 * msp++); }
function mPop() { msp--; for (let k = 0; k < 12; k++) MX[k] = MXS[12 * msp + k]; }
function mT(x, y, z) { for (let i = 0; i < 12; i += 4) MX[i + 3] += MX[i] * x + MX[i + 1] * y + MX[i + 2] * z; }
function mRY(a) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 12; i += 4) { const p = MX[i], q = MX[i + 2]; MX[i] = p * c - q * s; MX[i + 2] = p * s + q * c; } } // +z turns to +x
function mRX(a) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 12; i += 4) { const p = MX[i + 1], q = MX[i + 2]; MX[i + 1] = p * c + q * s; MX[i + 2] = q * c - p * s; } } // -y tips to -z
function mRZ(a) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < 12; i += 4) { const p = MX[i], q = MX[i + 1]; MX[i] = p * c + q * s; MX[i + 1] = q * c - p * s; } } // -y tips to +x
function mS(x, y, z) { for (let i = 0; i < 12; i += 4) { MX[i] *= x; MX[i + 1] *= y; MX[i + 2] *= z; } }
function xf(x, y, z) { WX = MX[0] * x + MX[1] * y + MX[2] * z + MX[3]; WY = MX[4] * x + MX[5] * y + MX[6] * z + MX[7]; WZ = MX[8] * x + MX[9] * y + MX[10] * z + MX[11]; }

// a box in model space: centre, half sizes, the sides `mat` and the top `top`; the sides can carry a texture with
// `dens` repeats per unit (s across, t up)
const BXF = [[0, 4, 6, 2, -1, 0, 0], [1, 5, 7, 3, 1, 0, 0], [0, 1, 5, 4, 0, -1, 0], [2, 3, 7, 6, 0, 1, 0], [0, 1, 3, 2, 0, 0, -1], [4, 5, 7, 6, 0, 0, 1]];
function box(cx, cy, cz, hx, hy, hz, mat, top = mat, pat = PF, c1 = -1, dens = 1, layer = 3, zb = 0) {
  for (let k = 0; k < 8; k++) { xf(cx + (k & 1 ? hx : -hx), cy + (k & 2 ? hy : -hy), cz + (k & 4 ? hz : -hz)); BW[3 * k] = WX; BW[3 * k + 1] = WY; BW[3 * k + 2] = WZ; }
  for (let fi = 0; fi < 6; fi++) {
    const B = BXF[fi], ax = B[4], ay = B[5], az = B[6], p0 = 3 * B[0];
    let nx = MX[0] * ax + MX[1] * ay + MX[2] * az, ny = MX[4] * ax + MX[5] * ay + MX[6] * az, nz = MX[8] * ax + MX[9] * ay + MX[10] * az;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    if (nx * (BW[p0] - C.x) + ny * (BW[p0 + 1] - C.y) + nz * (BW[p0 + 2] - C.z) >= 0) continue;
    const S = dens * 2 * (fi < 2 ? hz : hx), T = dens * 2 * hy, flat = fi === 2 || fi === 3;
    for (let j = 0; j < 4; j++) { const p = 3 * B[j]; qv(j, BW[p], BW[p + 1], BW[p + 2], j === 1 || j === 2 ? S : 0, j > 1 ? T : 0); }
    face(4, fi === 3 ? top : mat, flat ? PF : pat, c1, layer, zb, nx, ny, nz);
  }
}
// a mesh in model space: V the corners (x, y, z), Fs the faces as corner lists wound so the normal points out
function mesh(ms, mat, layer = 3, zb = 0, mats = null) {
  const V = ms.v, nv = V.length / 3;
  for (let i = 0; i < nv; i++) { xf(V[3 * i], V[3 * i + 1], V[3 * i + 2]); MW[3 * i] = WX; MW[3 * i + 1] = WY; MW[3 * i + 2] = WZ; }
  for (let i = 0; i < ms.f.length; i++) {
    const fc = ms.f[i];
    for (let j = 0; j < fc.length; j++) { const p = 3 * fc[j]; qv(j, MW[p], MW[p + 1], MW[p + 2]); }
    face(fc.length, mats ? mats[i] : mat, PF, -1, layer, zb);
  }
}
// a two-sided triangle in model space (wings, fins)
function tri3(ax, ay, az, bx, by, bz, cx, cy, cz, mat, layer = 3) {
  xf(ax, ay, az); qv(0, WX, WY, WZ); xf(bx, by, bz); qv(1, WX, WY, WZ); xf(cx, cy, cz); qv(2, WX, WY, WZ);
  face(3, mat, PF | TWO, -1, layer);
}
// a shadow on the ground at height y: an octagon rx by rz turned to `yaw`, in a fixed role
function shadow(x, y, z, rx, rz, c, layer = 2, zb = 0, yaw = 0) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, lx = Math.cos(a) * rx, lz = -Math.sin(a) * rz; qv(k, x + lx * cy + lz * sy, y, z - lx * sy + lz * cy); }
  face(8, FIX + c, PF, -1, layer, zb, 0, 1, 0);
}

// meshes: a lathe of a profile [[radius, y], ...] round the y axis (spheres, cones, gems, discs), a prism of a
// star-shaped outline [[x, y], ...] (extruded along z, the caps fanned from the middle), a torus; the faces are
// turned to point away from `core(x, y, z)` (the point inside behind each face)
function orient(ms, core) {
  const V = ms.v, c = [0, 0, 0];
  for (const fc of ms.f) {
    const a = 3 * fc[0], b = 3 * fc[1], d = 3 * fc[2];
    const ax = V[b] - V[a], ay = V[b + 1] - V[a + 1], az = V[b + 2] - V[a + 2], bx = V[d] - V[a], by = V[d + 1] - V[a + 1], bz = V[d + 2] - V[a + 2];
    let mx = 0, my = 0, mz = 0;
    for (const i of fc) { mx += V[3 * i] / fc.length; my += V[3 * i + 1] / fc.length; mz += V[3 * i + 2] / fc.length; }
    core(mx, my, mz, c);
    if ((ay * bz - az * by) * (mx - c[0]) + (az * bx - ax * bz) * (my - c[1]) + (ax * by - ay * bx) * (mz - c[2]) < 0) fc.reverse();
  }
  return ms;
}
function lathe(prof, seg) {
  const v = [], f = [], ring = [];
  for (const [rr, y] of prof) {
    if (rr === 0) { ring.push([v.length / 3]); v.push(0, y, 0); continue; }
    const row = [];
    for (let k = 0; k < seg; k++) { const a = (k / seg) * TAU; row.push(v.length / 3); v.push(Math.sin(a) * rr, y, Math.cos(a) * rr); }
    ring.push(row);
  }
  for (let i = 0; i + 1 < ring.length; i++) {
    const A = ring[i], B = ring[i + 1];
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      if (A.length === 1) f.push([A[0], B[k], B[k1]]);
      else if (B.length === 1) f.push([A[k], A[k1], B[0]]);
      else f.push([A[k], A[k1], B[k1], B[k]]);
    }
  }
  const ys = prof.map((p) => p[1]), mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  return orient({ v: Float32Array.from(v), f }, (x, y, z, c) => { c[0] = 0; c[1] = mid; c[2] = 0; });
}
function prism(pts, d) {
  const v = [], f = [], n = pts.length;
  for (const z of [-d, d]) { for (const [x, y] of pts) v.push(x, y, z); v.push(0, 0, z); }
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    f.push([k, k1, n + 1 + k1, n + 1 + k]);
    f.push([n, k, k1]);
    f.push([2 * n + 1, n + 1 + k, n + 1 + k1]);
  }
  return orient({ v: Float32Array.from(v), f }, (x, y, z, c) => { c[0] = 0; c[1] = 0; c[2] = Math.abs(z) > d * 0.99 ? 0 : z; });
}
function torus(R, rr, n, m) {
  const v = [], f = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = (i / n) * TAU, b = (j / m) * TAU, q = R + rr * Math.cos(b); v.push(Math.cos(a) * q, rr * Math.sin(b), Math.sin(a) * q); }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const i1 = (i + 1) % n, j1 = (j + 1) % m; f.push([i * m + j, i1 * m + j, i1 * m + j1, i * m + j1]); }
  return orient({ v: Float32Array.from(v), f }, (x, y, z, c) => { const a = Math.atan2(z, x); c[0] = Math.cos(a) * R; c[1] = 0; c[2] = Math.sin(a) * R; });
}
const SPHERE = lathe([[0, 1], [0.5, 0.87], [0.87, 0.5], [1, 0], [0.87, -0.5], [0.5, -0.87], [0, -1]], 8);
const GEM = lathe([[0, 1], [0.6, 0.15], [0, -0.75]], 6);
const CONE = lathe([[0, 1], [1, 0], [0, 0]], 6);
const DISC = lathe([[0, 0.25], [1, 0.25], [1, -0.25], [0, -0.25]], 8);
const OCTA = lathe([[0, 1], [1, 0], [0, -1]], 4);
const STAR = prism(Array.from({ length: 10 }, (_, k) => { const a = (k / 10) * TAU, rr = k % 2 ? 0.45 : 1; return [Math.sin(a) * rr, Math.cos(a) * rr]; }), 0.25);
const HEART = prism(Array.from({ length: 12 }, (_, k) => { const a = (k / 12) * TAU; return [Math.sin(a) ** 3, (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16 + 0.15]; }), 0.25);
const TORUS = torus(1, 0.38, 10, 6);

// the rasteriser: one triangle of a queued face, edges walked into the span tables, the spans filled by pattern
function edge(xa, ya, xb, yb, r0, r1) {
  if (ya === yb) return;
  if (ya > yb) { let q = xa; xa = xb; xb = q; q = ya; ya = yb; yb = q; }
  const k = (xb - xa) / (yb - ya), y1 = Math.min(r1, Math.ceil(yb - 0.5) - 1);
  for (let y = Math.max(r0, Math.ceil(ya - 0.5)); y <= y1; y++) { const x = xa + (y + 0.5 - ya) * k; if (x < XL[y]) XL[y] = x; if (x > XR[y]) XR[y] = x; }
}
function tri(buf, N, a, b, c, pat, c0, c1) {
  const V = FV, x0 = V[a], y0 = V[a + 1], x1 = V[b], y1 = V[b + 1], x2 = V[c], y2 = V[c + 1];
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (!det) return;
  const r0 = Math.max(0, Math.ceil(Math.min(y0, y1, y2) - 0.5)), r1 = Math.min(N - 1, Math.ceil(Math.max(y0, y1, y2) - 0.5) - 1);
  if (r1 < r0 || Math.max(x0, x1, x2) < 0 || Math.min(x0, x1, x2) > N) return;
  for (let y = r0; y <= r1; y++) { XL[y] = 1e9; XR[y] = -1e9; }
  edge(x0, y0, x1, y1, r0, r1); edge(x1, y1, x2, y2, r0, r1); edge(x2, y2, x0, y0, r0, r1);
  let dsx = 0, dsy = 0, dtx = 0, dty = 0, s0 = 0, t0 = 0;
  if (pat >= PS) { // the affine gradients of s and t across the screen: no division by depth, hence the kink
    s0 = V[a + 2]; t0 = V[a + 3];
    const s1 = V[b + 2] - s0, s2 = V[c + 2] - s0, t1 = V[b + 3] - t0, t2 = V[c + 3] - t0;
    dsx = (s1 * (y2 - y0) - s2 * (y1 - y0)) / det; dsy = (s2 * (x1 - x0) - s1 * (x2 - x0)) / det;
    dtx = (t1 * (y2 - y0) - t2 * (y1 - y0)) / det; dty = (t2 * (x1 - x0) - t1 * (x2 - x0)) / det;
  }
  for (let y = r0; y <= r1; y++) {
    let xa = Math.round(XL[y]), xb = Math.round(XR[y]);
    if (xa < 0) xa = 0;
    if (xb > N) xb = N;
    if (xb <= xa) continue;
    const row = y * N;
    if (pat === PF) { buf.fill(c0, row + xa, row + xb); continue; }
    if (pat === PD) { for (let x = xa; x < xb; x++) buf[row + x] = (x + y) & 1 ? c1 : c0; continue; }
    let s = s0 + dsx * (xa + 0.5 - x0) + dsy * (y + 0.5 - y0), t = t0 + dtx * (xa + 0.5 - x0) + dty * (y + 0.5 - y0);
    if (pat === PS) for (let x = xa; x < xb; x++, s += dsx) buf[row + x] = ((s + 4096) | 0) & 1 ? c1 : c0;
    else if (pat === PC) for (let x = xa; x < xb; x++, s += dsx, t += dtx) buf[row + x] = (((s + 4096) | 0) + ((t + 4096) | 0)) & 1 ? c1 : c0;
    else if (pat === PG) { const by = (y & 7) << 3; for (let x = xa; x < xb; x++, s += dsx) { const k = (s + BAYER[by | (x & 7)]) | 0; buf[row + x] = RAMP[k < 0 ? 0 : k > 8 ? 8 : k]; } }
    else for (let x = xa; x < xb; x++, s += dsx, t += dtx) { const fs = (s + 4096) | 0, ft = (t + 4096) | 0, us = s + 4096 - fs, ut = t + 4096 - ft; buf[row + x] = us > 0.25 && us < 0.75 && ut > 0.3 && ut < 0.8 && LIT[((fs + LOFF) & 15) | ((ft & 15) << 4)] ? c1 : c0; }
  }
}
// everything queued, far to near within each layer; sprites go to `draw(r, W, p)`
function flush(r, W, draw = common) {
  const keys = KEY.subarray(0, C.nk).sort(), buf = r.buf, N = r.N;
  for (let i = 0; i < keys.length; i++) {
    const id = keys[i] % 2048;
    if (id >= SPR) { draw(r, W, SP[id - SPR]); continue; }
    const o = id * 40, n = FN[id];
    for (let k = 1; k + 1 < n; k++) tri(buf, N, o, o + 4 * k, o + 4 * k + 4, FP[id], F0[id], F1[id]);
  }
  C.nf = C.ns = C.nk = 0;
}

// rows y0..y1 dithered from ramp level l0 to l1 (the 8x8 Bayer table): skies, voids, backdrops
function dgrad(r, y0, y1, l0, l1) {
  const N = r.N, buf = r.buf, a = Math.max(0, Math.round(y0)), b = Math.min(N, Math.round(y1)), span = Math.max(1, y1 - y0);
  for (let y = a; y < b; y++) {
    const lv = l0 + ((l1 - l0) * (y + 0.5 - y0)) / span, by = (y & 7) << 3;
    for (let x = 0, i = y * N; x < N; x++, i++) { const k = (lv + BAYER[by | (x & 7)]) | 0; buf[i] = RAMP[k < 0 ? 0 : k > 8 ? 8 : k]; }
  }
}
// the backdrop of a camera: the sky dithered from level l0 high up to l1 at the horizon, and below the horizon the
// ground past the fog at level lg; the horizon is where the ground plane meets the sky, tilted with the roll
function backdrop(r, l0, l1, lg) {
  const N = r.N, buf = r.buf, hz = horizon(), span = 0.55 * N;
  for (let y = 0; y < N; y++) {
    const by = (y & 7) << 3;
    for (let x = 0, i = y * N; x < N; x++, i++) {
      const h = hz[0] + hz[1] * x, lv = y < h ? l1 + (l0 - l1) * Math.min(1, (h - y) / span) : lg, k = (lv + BAYER[by | (x & 7)]) | 0;
      buf[i] = RAMP[k < 0 ? 0 : k > 8 ? 8 : k];
    }
  }
}
// the horizon as y = a + b * x, from two directions level with the eye
const HZ = [0, 0];
function horizon() {
  const pt = (d) => { const dx = Math.sin(d), dz = Math.cos(d), x1 = dx * C.cy - dz * C.sy, z1 = dx * C.sy + dz * C.cy, y1 = z1 * C.sp, z2 = Math.max(1e-3, z1 * C.cp), vx = x1 * C.cr + y1 * C.sr, vy = y1 * C.cr - x1 * C.sr; return [C.hx + (vx * C.F) / z2, C.hy - (vy * C.F) / z2]; };
  const yaw = Math.atan2(C.sy, C.cy), [xa, ya] = pt(yaw - 0.3), [xb, yb] = pt(yaw + 0.3), b = (yb - ya) / (xb - xa || 1);
  HZ[0] = ya - b * xa; HZ[1] = b;
  return HZ;
}
// a disc filled where the Bayer threshold is under `dens`: smoke, dust, glows
function ddisc(r, cx, cy, rad, c, dens) {
  const N = r.N, buf = r.buf, y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(N - 1, Math.ceil(cy + rad)), r2 = rad * rad;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy, q = r2 - dy * dy;
    if (q < 0) continue;
    const xw = Math.sqrt(q), x0 = Math.max(0, Math.round(cx - xw)), x1 = Math.min(N, Math.round(cx + xw)), by = (y & 7) << 3;
    for (let x = x0; x < x1; x++) if (BAYER[by | (x & 7)] < dens) buf[y * N + x] = c;
  }
}
// the whole picture to black through the Bayer table, a fraction e of the way
function fadeOut(r, e) {
  const N = r.N, buf = r.buf;
  if (e <= 0) return;
  for (let y = 0; y < N; y++) { const by = (y & 7) << 3; for (let x = 0, i = y * N; x < N; x++, i++) if (BAYER[by | (x & 7)] < e) buf[i] = BLACK; }
}

// the sprites every world shares: a dot (a: its size in units, b: role), a puff of smoke or dust (a: radius in
// units, b: role, c: how dense 0..1), a streak (a, b: the screen point of its tail, c: role)
const K_DOT = 0, K_PUFF = 1, K_LINE = 2;
function common(r, W, p) {
  if (p.k === K_DOT) { const d = Math.max(1, p.a * p.sc); r.rect(p.x - d / 2, p.y - d / 2, d, d, fogC(p.b, p.q)); }
  else if (p.k === K_PUFF) ddisc(r, p.x, p.y, Math.max(1, p.a * p.sc), fogC(p.b, p.q), p.c);
  else if (p.k === K_LINE) r.line(p.x, p.y, p.a, p.b, fogC(p.c, p.q));
}
// 3D particles under gravity g (units/s², stepped exactly at any frame rate), queued as dots of their own size and
// colour, bouncing off a floor height or off `ground(x, z)`; returns the living
function parts3(W, list, g, size = 0.08, ground = null) {
  const dt = W.dt;
  for (const p of list) {
    p.x += p.vx * dt; p.y += (p.vy - 0.5 * g * dt) * dt; p.z += p.vz * dt; p.vy -= g * dt; p.life -= dt;
    const fl = ground ? ground(p.x, p.z) : p.floor;
    if (fl !== undefined && p.y < fl) { p.y = fl; if (p.vy < 0) p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    if (p.life > 0) spr(K_DOT, p.x, p.y, p.z, p.s || size, p.c);
  }
  return list.filter((p) => p.life > 0);
}
function burst3(list, rnd, x, y, z, n, sp, c, life, up = 0, floor = undefined) {
  for (let k = 0; k < n; k++) list.push({ x, y, z, vx: (rnd() - 0.5) * 2 * sp, vy: rnd() * sp + up, vz: (rnd() - 0.5) * 2 * sp, life: life * (0.5 + rnd() * 0.5), c, floor });
}
// smoke and dust: puffs that rise (or settle) slowing down, grow and thin out
function puffs(W, list) {
  const dt = W.dt;
  for (const p of list) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const k = Math.exp(-dt * (p.drag || 1.5)); p.vx *= k; p.vy *= k; p.vz *= k;
    p.r += p.grow * dt; p.life -= dt;
    if (p.life > 0) spr(K_PUFF, p.x, p.y, p.z, p.r, p.c, clamp(p.life / p.life0) * (p.dens || 0.8));
  }
  return list.filter((p) => p.life > 0);
}
const puff = (x, y, z, vx, vy, vz, r0, grow, life, c, dens = 0.8, drag = 1.5) => ({ x, y, z, vx, vy, vz, r: r0, grow, life, life0: life, c, dens, drag });

// a boxy figure at (x, y, z) turned to `head`: the legs swing by `sw` about the hips (a leg is 0.86 long, so the
// hips drop by its cosine and the feet stay on the floor), the arms swing against them or are held at `arm`
function figure(x, y, z, head, sw, arm, mt, mh, ml, roll = 0) {
  mPush();
  mT(x, y - 0.86 * (1 - Math.cos(sw)), z);
  mRY(head);
  mRZ(roll);
  box(0, 1.17, 0, 0.23, 0.3, 0.13, mt);
  box(0, 1.62, 0.01, 0.12, 0.14, 0.12, mh);
  for (let sd = -1; sd <= 1; sd += 2) {
    mPush(); mT(sd * 0.11, 0.86, 0); mRX(-sw * sd); box(0, -0.43, 0, 0.08, 0.43, 0.09, ml); mPop();
    mPush(); mT(sd * 0.31, 1.42, 0); mRX(arm === null ? sw * sd * 0.8 : -arm); box(0, -0.31, 0, 0.065, 0.31, 0.065, mt); mPop();
  }
  mPop();
}
// how far figure()'s legs carry the body by swing phase ph (a beat to each half swing) at swing amplitude S: the foot
// on the floor stays put, so the body goes exactly as far as that foot swings back under the hip
const gait = (ph, S) => { const n = Math.floor(ph + 0.5); return 0.86 * ((2 * n + 1) * Math.sin(S) - (n & 1 ? 1 : -1) * Math.sin(S * Math.sin(Math.PI * ph))); };
// a two-bone leg in model space from the hip (hy, hz) to the foot (fy, fz) at side x: the knee from the two
// lengths (forward, or backward for a bird leg), each bone a box along its line
function leg(x, hy, hz, fy, fz, l1, l2, wd, mat, back = false) {
  const dy = fy - hy, dz = fz - hz, d = clamp(Math.hypot(dy, dz), 0.05, l1 + l2 - 1e-3), a0 = Math.atan2(dz, -dy);
  const al = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), a1 = back ? a0 - al : a0 + al;
  const ky = hy - Math.cos(a1) * l1, kz = hz + Math.sin(a1) * l1, a2 = Math.atan2(fz - kz, -(fy - ky));
  mPush(); mT(x, hy, hz); mRX(-a1); box(0, -l1 / 2, 0, wd, l1 / 2, wd, mat); mPop();
  mPush(); mT(x, ky, kz); mRX(-a2); box(0, -l2 / 2, 0, wd * 0.85, l2 / 2, wd * 0.85, mat); mPop();
}

// ---------------------------------------------------------------------------------------------- mansion
// A survival-horror hallway under fixed cameras: the view cuts to the next preset angle when the figure crosses a
// trigger line. The figure walks on tank controls (turns in place toward the next mark, then walks, a step on every
// beat at the speed its stride gives) under lamps that brighten with the level and flicker on the hats and the
// kicks; a snare stops it to aim, a note tints a blank painting. Dithered walls, a runner, doors and frames. A
// section change loads the next hallway behind a door that swings slowly open toward us; a drop sends a shambling
// figure up from the far end.
const HALL_W = { manor: [3, 2, 1], ward: [1, 2, 3], cellar: [2, 2, 2] };
const HALLS = {
  manor: { hw: 1.7, h: 3.1, wall: 4.6, floor: 2.6, fogN: 7, fogF: 23 }, // panelled walls, boards and a red runner
  ward: { hw: 1.5, h: 2.8, wall: 5.4, floor: 4.2, fogN: 6, fogF: 21 }, // tiles, a checked floor
  cellar: { hw: 1.35, h: 2.4, wall: 3.4, floor: 2.2, fogN: 4, fogF: 17 }, // stone, low and close
};
const HALL_LEN = 24, LAMPZ = [3, 9, 15, 21], STRIDE = 0.42;

function newHall(w, rnd, kind) {
  w.kind = kind;
  w.side = rnd() < 0.5 ? -1 : 1;
  w.wp = [3, 7.4, 12.5, 18, 21.4].map((z, i) => [(i % 2 ? -1 : 1) * w.side * (0.3 + rnd() * 0.35), z]);
  Object.assign(w, { wi: 1, dir: 1, x: w.wp[0][0], z: w.wp[0][1], head: 0, state: 'turn', zone: -1, sh: null });
  w.doors = [[5, -1], [11, 1], [17, -1], [22.6, 1]].map(([z, sd]) => [z, sd * w.side]);
  w.frames = [[3, 1], [8, -1], [14, 1], [19.6, -1]].map(([z, sd]) => [z, sd * w.side]);
}

function hallway(W) {
  const { w, t } = W, K = HALLS[w.kind], hw = K.hw, hh = K.h, lamp = w.lamp;
  const glow = (z) => { let g = 0; for (const lz of LAMPZ) g += Math.exp(-(((z - lz) / 2.3) ** 2)); return Math.min(1, g) * lamp; };
  for (let z0 = 0; z0 < HALL_LEN; z0 += 2) {
    const z1 = z0 + 2, g0 = glow(z0), g1 = glow(z1);
    // the floor: boards across in the manor, checks in the ward, flags in the cellar
    qv(0, -hw, 0, z0, 0, 0); qv(1, hw, 0, z0, w.kind === 'manor' ? 7 : 4, 0); qv(2, hw, 0, z1, w.kind === 'manor' ? 7 : 4, 2); qv(3, -hw, 0, z1, 0, 2);
    face(4, K.floor + 0.6 * (g0 + g1), w.kind === 'manor' ? PS : PC, -1, 1, 0, 0, 1, 0);
    if (w.kind === 'manor') { qv(0, -0.55, 0.003, z0, 0); qv(1, 0.55, 0.003, z0, 0); qv(2, 0.55, 0.003, z1, 3); qv(3, -0.55, 0.003, z1, 3); face(4, FIX + HOT, PS, HOT + DIM, 1, -0.5, 0, 1, 0); }
    for (let sd = -1; sd <= 1; sd += 2) { // the walls: a dado below, the dithered plaster above, brighter under the lamps
      const x = sd * hw, dado = w.kind === 'cellar' ? 0.6 : 0.95;
      qv(0, x, 0, z0, 0, 0); qv(1, x, 0, z1, 2.5, 0); qv(2, x, dado, z1, 2.5, 1); qv(3, x, dado, z0, 0, 1);
      face(4, K.wall - 1.6 + g0 + g1, w.kind === 'manor' ? PS : PC, -1, 1, 0, -sd, 0, 0);
      qv(0, x, dado, z0, K.wall - 1.8 + 1.4 * g0); qv(1, x, dado, z1, K.wall - 1.8 + 1.4 * g1); qv(2, x, hh, z1, K.wall - 1 + 2.4 * g1); qv(3, x, hh, z0, K.wall - 1 + 2.4 * g0);
      face(4, 0, PG, -1, 1, 0, -sd, 0, 0);
    }
    qv(0, -hw, hh, z0, 0.6 + 2 * g0); qv(1, hw, hh, z0, 0.6 + 2 * g0); qv(2, hw, hh, z1, 0.6 + 2 * g1); qv(3, -hw, hh, z1, 0.6 + 2 * g1);
    face(4, 0, PG, -1, 1, 0, 0, -1, 0);
  }
  for (const [z, nz] of [[0, 1], [HALL_LEN, -1]]) { qv(0, -hw, 0, z, K.wall - 3); qv(1, hw, 0, z, K.wall - 3); qv(2, hw, hh, z, K.wall - 2); qv(3, -hw, hh, z, K.wall - 2); face(4, 0, PG, -1, 1, 0, 0, 0, nz); }
  for (const lz of LAMPZ) box(0, hh - 0.05, lz, 0.22, 0.05, 0.22, FIX + (lamp > 0.45 ? BRIGHT : LMID + DIM));
  // the doors: a frame standing off the wall, a panel of two boards, a knob
  for (const [z, sd] of w.doors) {
    const x = sd * hw;
    box(x - sd * 0.04, 1.12, z - 0.58, 0.05, 1.12, 0.05, K.wall - 2.4);
    box(x - sd * 0.04, 1.12, z + 0.58, 0.05, 1.12, 0.05, K.wall - 2.4);
    box(x - sd * 0.04, 2.29, z, 0.05, 0.06, 0.63, K.wall - 2.4);
    qv(0, x - sd * 0.01, 0, z - 0.53, 0, 0); qv(1, x - sd * 0.01, 0, z + 0.53, 2, 0); qv(2, x - sd * 0.01, 2.23, z + 0.53, 2, 1); qv(3, x - sd * 0.01, 2.23, z - 0.53, 0, 1);
    face(4, K.wall - 3, PS, -1, 2, 0, -sd, 0, 0);
    box(x - sd * 0.05, 1.05, z + 0.38, 0.03, 0.03, 0.03, FIX + LMID);
  }
  // the paintings: blank frames, the canvas tinted by a note
  w.frames.forEach(([z, sd], i) => {
    const x = sd * hw, y = 1.7, tint = w.tint > 0 && i === w.tintK;
    box(x - sd * 0.03, y + 0.38, z, 0.03, 0.04, 0.58, FIX + MID);
    box(x - sd * 0.03, y - 0.38, z, 0.03, 0.04, 0.58, FIX + MID);
    box(x - sd * 0.03, y, z - 0.54, 0.03, 0.34, 0.04, FIX + MID);
    box(x - sd * 0.03, y, z + 0.54, 0.03, 0.34, 0.04, FIX + MID);
    qv(0, x - sd * 0.012, y - 0.34, z - 0.5); qv(1, x - sd * 0.012, y - 0.34, z + 0.5); qv(2, x - sd * 0.012, y + 0.34, z + 0.5); qv(3, x - sd * 0.012, y + 0.34, z - 0.5);
    face(4, tint ? FIX + w.tintC : K.wall - 2 + 0.5 * Math.sin(t * 0.3 + i), PF, -1, 2, 0, -sd, 0, 0);
  });
}

// the loading door: black around, a frame, the panel swinging toward us on its hinge, a dim room beyond
function doorScene(W, e) {
  const { r, N } = W;
  r.fill(BLACK);
  begin(W, 3, 14, 0);
  cam(0, 1.25, -2.7, 0, 0.03, 0.95 * N, N / 2, N / 2);
  light(-0.2, 0.5, -1);
  qv(0, -1.4, 0, 4.5, 2.2); qv(1, 1.4, 0, 4.5, 2.2); qv(2, 1.4, 2.9, 4.5, 0.8); qv(3, -1.4, 2.9, 4.5, 0.8); face(4, 0, PG, -1, 1, 0, 0, 0, -1);
  qv(0, -1.4, 0, 0, 0); qv(1, 1.4, 0, 0, 0); qv(2, 1.4, 0, 4.5, 2.6); qv(3, -1.4, 0, 4.5, 2.6); face(4, 0, PG, -1, 1, 0, 0, 1, 0);
  for (const [x0, x1, y0, y1] of [[-3, -0.62, 0, 3.2], [0.62, 3, 0, 3.2], [-0.62, 0.62, 2.3, 3.2]]) { qv(0, x0, y0, 0, 1.2); qv(1, x1, y0, 0, 1.2); qv(2, x1, y1, 0, 0.6); qv(3, x0, y1, 0, 0.6); face(4, 0, PG, -1, 2, 0, 0, 0, -1); }
  box(-0.6, 1.15, -0.02, 0.05, 1.15, 0.06, 2.6); box(0.6, 1.15, -0.02, 0.05, 1.15, 0.06, 2.6); box(0, 2.3, -0.02, 0.65, 0.06, 0.06, 2.6);
  mPush(); mT(-0.55, 0, 0); mRY(1.9 * easeIO(e));
  box(0.55, 1.12, -0.03, 0.55, 1.12, 0.03, 3.4, 3.4, PS, -1, 1.2);
  box(1, 1.05, -0.08, 0.03, 0.03, 0.04, FIX + LMID);
  mPop();
  flush(r, W);
}

const mansion = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { bt: 0, pbt: null, legA: 1, door: 0, next: null, aim: 0, flick: 0, tint: 0, tintC: HOT, tintK: 0, lampS: 0.6, lamp: 0.6 });
    newHall(w, rnd, rollW(rnd, HALL_W, bandOf(W.a)));
  },
  draw(W) {
    const { r, N, dt, f, w, rnd, hits, targets, s, t } = W, band = bandOf(W.a);
    for (const h of hits) {
      if (isLow(h)) { w.flick = Math.max(w.flick, 0.6 * h.strength); s.shake = Math.max(s.shake, 0.12 * h.strength); }
      else if (h.kind === 'snare') w.aim = 0.6;
      else if (h.kind === 'hat') w.flick = Math.max(w.flick, 0.3);
      else if (isTonal(h)) { w.tint = 1.2; w.tintC = h.pc % 2 ? HOT : COOL; w.tintK = h.pc % 4; }
    }
    if (f.section === 'change' && w.door <= 0) { w.door = 3.6; w.next = rollW(rnd, HALL_W, band); }
    if (f.section === 'drop') w.sh = { x: -w.side * 0.4, z: HALL_LEN - 1.5, head: Math.PI };
    const bt = beats(W), K = HALLS[w.kind];
    w.aim -= dt; w.tint -= dt;
    w.flick *= Math.exp(-dt * 7);
    w.lampS = follow(w.lampS, 0.35 + 0.65 * f.level, dt, 0.2);
    w.lamp = w.lampS * (1 - w.flick * (hash(Math.floor(t * 20), 5) < 0.5 ? 1 : 0.3));
    const was = w.door;
    w.door -= dt;
    if (was > 0.3 && w.door <= 0.3) newHall(w, rnd, w.next);
    const e = 3.6 - w.door;
    if (was > 0 && e > 0.4 && w.door > 0.3) { doorScene(W, (e - 0.4) / 2.9); return; }
    // tank controls: turn in place to face the next mark, then walk straight, a step a beat, carried by the foot on the
    // floor (it stays planted); the stride eases down to a shuffle while it turns and to nothing while it aims
    const tgt = w.wp[w.wi], dx = tgt[0] - w.x, dz = tgt[1] - w.z, dist = Math.hypot(dx, dz), aiming = w.aim > 0;
    w.legA = follow(w.legA, aiming ? 0 : w.state === 'turn' ? 0.3 : 1, dt, 0.08);
    const S = STRIDE * w.legA, sw = S * Math.sin(Math.PI * bt), b0 = clamp(w.pbt ?? bt, bt - 0.5, bt);
    w.pbt = bt;
    if (!aiming && w.state === 'turn') {
      const d = wrapAngle(Math.atan2(dx, dz) - w.head), st = 2.4 * dt;
      if (Math.abs(d) <= st) { w.head += d; w.state = 'walk'; } else w.head += Math.sign(d) * st;
    } else if (!aiming) {
      const step = Math.min(dist, gait(bt, S) - gait(b0, S));
      w.x += Math.sin(w.head) * step; w.z += Math.cos(w.head) * step;
      if (dist - step < 0.02) { if (w.wi + w.dir < 0 || w.wi + w.dir >= w.wp.length) w.dir = -w.dir; w.wi += w.dir; w.state = 'turn'; }
    }
    // the fixed cameras: a zone each, the cut when the figure crosses a line
    const zone = w.z < 8 ? 0 : w.z < 15 ? 1 : 2, sd = w.side, hw = K.hw - 0.25, ch = K.h - 0.3;
    w.zone = zone;
    if (zone === 0) look(sd * hw, ch, 0.3, -sd * 0.3, 0.9, 7.5, 0.95 * N, N / 2, N / 2);
    else if (zone === 1) look(-sd * hw, ch, 17.6, sd * 0.2, 0.8, 9, 0.95 * N, N / 2, N / 2);
    else look(sd * hw, ch, 12.4, -sd * 0.3, 0.8, 21.5, 0.95 * N, N / 2, N / 2);
    r.fill(BLACK);
    begin(W, K.fogN, K.fogF, 0.4);
    light(0.15, 1, 0.25);
    hallway(W);
    shadow(w.x, 0.006, w.z, 0.34, 0.26, BLACK);
    figure(w.x, 0, w.z, w.head, sw, aiming ? 1.45 : null, 5, 6.5, 3);
    if (w.sh) { // the shambler: drags one leg, arms out, sways; stops a step short of the figure, its legs coming to rest
      const q = w.sh, ddx = w.x - q.x, ddz = w.z - q.z, dd = Math.hypot(ddx, ddz);
      q.head = followAngle(q.head, Math.atan2(ddx, ddz), dt, 0.8);
      q.amp = follow(q.amp ?? 1, dd > 1.3 ? 1 : 0, dt, 0.25);
      const S2 = 0.3 * q.amp, lsw = S2 * Math.sin(Math.PI * bt * 0.5);
      if (dd > 1.3) { const st = Math.min(dd - 1.3, gait(bt * 0.5, S2) - gait(b0 * 0.5, S2)); q.x += Math.sin(q.head) * st; q.z += Math.cos(q.head) * st; } // a stride every two beats, on the planted foot
      shadow(q.x, 0.006, q.z, 0.34, 0.26, BLACK);
      figure(q.x, 0, q.z, q.head, lsw, 1.3, 2.4, 4.4, 1.8, 0.12 * Math.sin(Math.PI * bt * 0.5));
    }
    flush(r, W);
    if (toScr(w.x, 1.8, w.z)) { const tx = SX, ty = SY, sc = C.F / VZ; if (toScr(w.x, 0, w.z)) targets.push({ x: tx - 0.4 * sc, y: ty, w: 0.8 * sc, h: SY - ty }); }
    if (was > 0 && e <= 0.4) fadeOut(r, e / 0.4); // the view goes black before the door
  },
};

// ---------------------------------------------------------------------------------------------- racer
// A wobbly circuit from behind the car: the road is a strip of quads cut every two units along a track that curves
// and climbs (its heading and height are sums of sines, so any stretch is known without driving it), banded across
// the affine way, rumble strips at the edges; palms, cacti, blank signs and blocks stand by it and pop in at the
// fog (the strip runs on well past it, so nothing ends nearer). The sun keeps its bearing as the road turns under it.
// The speed follows the energy, a kick bounces the body on its springs and dampers (the wheels stay on the road), a snare
// throws it into a drift with smoke off the rear wheels, a note lights the signs, the beat flashes the tail lights.
// Circuits: city (blocks with lit windows, a skyline), coast (palms, the sea on the right, a sun), desert (cacti,
// mesas). A drop takes the road into a tunnel with lights strobing past.
const CIRCUIT_W = { city: [2, 2, 2], coast: [3, 2, 1], desert: [1, 2, 3] };
const CIRCUITS = { city: { hills: 0.35, verge: 3.4, far: 2.5 }, coast: { hills: 0.8, verge: 5.8, far: 3.5 }, desert: { hills: 1, verge: 6.2, far: 4 } };
const RW = 3.2, K_PALM = 8, K_SIGN = 9, K_CACTUS = 10;
// the track: the heading at distance s is the integral of a curvature of two sines, the height two more
const trackH = (s, ph) => -1.3 * Math.cos(s / 37 + ph) - 0.26 * Math.cos(s / 13 + 2 * ph);
const trackY = (s, ph, k) => k * (3 * Math.sin(s / 60 + ph) + 1.2 * Math.sin(s / 23 + 3 * ph));
// the strip from s0 in steps of two, in a frame whose origin is the track at s0 + 2 (the camera's spot) heading +z
function strip(w, s0, n, hk) {
  const ref = trackH(s0 + 2, w.ph), hb = trackH(s0 + 1, w.ph) - ref;
  let x = -Math.sin(hb) * 2, z = -Math.cos(hb) * 2;
  for (let k = 0; k <= n; k++) {
    const sk = s0 + 2 * k, hm = trackH(sk + 1, w.ph) - ref;
    w.PX[k] = x; w.PZ[k] = z; w.PY[k] = trackY(sk, w.ph, hk); w.HD[k] = trackH(sk, w.ph) - ref;
    x += Math.sin(hm) * 2; z += Math.cos(hm) * 2;
  }
  w.n = n; w.s0 = s0;
}
// the point on the strip at track distance s, lateral offset lat (right is +) and height up, into WX, WY, WZ;
// returns the heading there
function onStrip(w, s, lat, up = 0) {
  const kf = (s - w.s0) / 2, k = Math.max(0, Math.min(w.n - 1, Math.floor(kf))), fr = kf - k, h = lerp(w.HD[k], w.HD[k + 1], fr);
  WX = lerp(w.PX[k], w.PX[k + 1], fr) + Math.cos(h) * lat; WY = lerp(w.PY[k], w.PY[k + 1], fr) + up; WZ = lerp(w.PZ[k], w.PZ[k + 1], fr) - Math.sin(h) * lat;
  return h;
}
function racerSpr(r, W, p) {
  if (p.k < 8) { common(r, W, p); return; }
  const s = p.sc, x = p.x, y = p.y, q = p.q, lw = Math.max(1, 0.3 * s);
  if (p.k === K_PALM) { // a trunk curving out from the road, fronds drooping from the crown
    const mx = x + p.a * 0.4 * s, tx = x + p.a * 1.4 * s, ty = y - 5.2 * s;
    r.stroke(x, y, mx, y - 2.6 * s, lw, fogC(MID, q));
    r.stroke(mx, y - 2.6 * s, tx, ty, lw, fogC(MID, q));
    for (let k = 0; k < 6; k++) { const a = (Math.PI * k) / 5, ex = tx + Math.cos(a) * 2.2 * s, ey = ty - Math.sin(a) * 0.8 * s; r.stroke(tx, ty, ex, ey, Math.max(1, 0.22 * s), fogC(LMID, q)); r.stroke(ex, ey, ex + Math.cos(a) * 0.5 * s, ey + 1 * s, Math.max(1, 0.16 * s), fogC(LMID, q)); }
  } else if (p.k === K_SIGN) { // a blank board on two posts, its panel lit by a note
    const bw = 3.2 * s, bh = 1.7 * s, top = y - 3.8 * s;
    r.rect(x - bw * 0.35, top + bh, lw, y - top - bh, fogC(MID, q));
    r.rect(x + bw * 0.35 - lw, top + bh, lw, y - top - bh, fogC(MID, q));
    r.rect(x - bw / 2, top, bw, bh, fogC(LMID, q));
    r.rect(x - bw / 2 + lw, top + lw, bw - 2 * lw, bh - 2 * lw, fogC(p.b > 0 ? p.c : DARK, q));
  } else { // a cactus: a column and two arms
    const cw = Math.max(1, 0.55 * s);
    r.rect(x - cw / 2, y - 3.2 * s, cw, 3.2 * s, fogC(MID, q));
    r.rect(x - 1.3 * s, y - 1.9 * s, 1.3 * s, cw, fogC(MID, q)); r.rect(x - 1.3 * s, y - 2.7 * s, cw, 0.8 * s + cw, fogC(MID, q));
    r.rect(x, y - 1.4 * s, 1.1 * s, cw, fogC(MID, q)); r.rect(x + 1.1 * s - cw, y - 2.3 * s, cw, 0.9 * s + cw, fogC(MID, q));
  }
}

const racer = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, CIRCUIT_W, bandOf(W.a)), ph: rnd() * TAU, s: rnd() * 400, v: 15, by: 0, vby: 0, drift: 0, driftT: 0, dsign: 1, ox: 0,
      smoke: [], smokeT: 0, tun0: -1e9, tun1: -1e9, sign: 0, signC: HOT, n: 0, s0: 0, PX: new Float32Array(80), PY: new Float32Array(80), PZ: new Float32Array(80), HD: new Float32Array(80) });
  },
  draw(W) {
    const { r, N, dt, f, w, rnd, hits, targets, t } = W, band = bandOf(W.a);
    for (const h of hits) {
      if (isLow(h)) w.vby += 0.9 + 1.2 * h.strength; // a bump: the body thrown up on its springs
      else if (h.kind === 'snare') { w.dsign = -w.dsign; w.driftT = w.dsign * (0.25 + 0.25 * h.strength); }
      else if (isTonal(h)) { w.sign = 0.5; w.signC = h.pc % 2 ? HOT : COOL; }
    }
    if (f.section === 'change') w.kind = rollW(rnd, CIRCUIT_W, band);
    if (f.section === 'drop') { w.tun0 = w.s + 34; w.tun1 = w.tun0 + w.v * 9; }
    const K = CIRCUITS[w.kind], fogF = 72;
    w.v = follow(w.v, 12 + 28 * energy(f), dt, 1);
    w.s += w.v * dt;
    w.driftT *= Math.exp(-dt * 2.2);
    w.drift = follow(w.drift, w.driftT, dt, 0.12);
    w.ox = follow(w.ox, -w.drift * 2.2, dt, 0.5); // the rear steps out, the car slides to the outside
    // the suspension: the body on stiff damped springs over the wheels (up, down past rest, settled), in steps short
    // enough for the spring at any frame rate, against the bump stops
    for (let k = 0, n = Math.ceil(dt / 0.01), hs = dt / n; k < n; k++) { w.vby += (-150 * w.by - 7 * w.vby) * hs; w.by += w.vby * hs; }
    if (w.by < -0.15) { w.by = -0.15; w.vby = Math.max(0, w.vby); } else if (w.by > 0.4) { w.by = 0.4; w.vby = Math.min(0, w.vby); }
    w.sign -= dt;
    strip(w, w.s - 10, 76, K.hills); // 152 units of road: past the fog even where a bend brings the far end round
    const camS = w.s - 8, inT = camS > w.tun0 && camS < w.tun1, ref = trackH(camS, w.ph);
    onStrip(w, w.s + 7, w.ox * 0.5, 0.3);
    const lx = WX, ly = WY, lz = WZ;
    onStrip(w, camS, w.ox * 0.6, 2.7);
    look(WX, WY, WZ, lx, ly, lz, 0.95 * N, N / 2, 0.36 * N);
    begin(W, inT ? 8 : 28, inT ? 44 : fogF, inT ? 0 : K.far);
    light(0.54 * Math.sin(1.1 - ref), 1, 0.54 * Math.cos(1.1 - ref)); // the sun's bearing in the world, turned into the strip's frame
    if (inT) r.fill(BLACK);
    else { // the sky, and far off the skyline, the mesas or the sun on the bearing they keep as the road turns
      backdrop(r, 1.2, 5.6, K.far);
      const hz = horizon(), yaw0 = Math.atan2(C.sy, C.cy);
      if (w.kind === 'coast') { const sa = wrapAngle(1.1 - ref - yaw0); if (Math.abs(sa) < 0.9) { const sx = C.hx + Math.tan(sa) * C.F; ddisc(r, sx, hz[0] + hz[1] * sx - 0.03 * N, 0.11 * N, HOT, 0.85); } }
      else for (let x = 0; x < N; x++) {
        const b = yaw0 + Math.atan((x - C.hx) / C.F) + ref, hy = hz[0] + hz[1] * x;
        const m = w.kind === 'city' ? (hash(Math.floor(b * 30) + 500, 9) < 0.7 ? hash(Math.floor(b * 30), 3) * 0.1 : 0) : Math.max(0, Math.sin(b * 3 + 1) + 0.5 * Math.sin(b * 7.3) - 0.4) > 0.3 ? 0.06 : 0.015;
        r.rect(x, hy - m * N, 1, m * N, w.kind === 'city' ? DARK : MID + DIM);
      }
    }
    // the road, segment by segment: verges, the banded road, rumble strips; the tunnel's walls, roof and lights
    let X0 = 0, Y0 = 0, Z0 = 0, X1 = 0, Y1 = 0, Z1 = 0, CA = 1, SA = 0, CB = 1, SB = 0, SK = 0;
    const band2 = (la, lb, mat, pat, cc, zb, dens, off = 0) => {
      qv(0, X0 + CA * la, Y0, Z0 - SA * la, SK * dens + off, la); qv(1, X0 + CA * lb, Y0, Z0 - SA * lb, SK * dens + off, lb);
      qv(2, X1 + CB * lb, Y1, Z1 - SB * lb, (SK + 2) * dens + off, lb); qv(3, X1 + CB * la, Y1, Z1 - SB * la, (SK + 2) * dens + off, la);
      face(4, mat, pat | TWO, cc, 3, zb);
    };
    const wall = (l, y0, y1, lv0, lv1) => { qv(0, X0 + CA * l, Y0 + y0, Z0 - SA * l, lv0); qv(1, X1 + CB * l, Y1 + y0, Z1 - SB * l, lv0); qv(2, X1 + CB * l, Y1 + y1, Z1 - SB * l, lv1); qv(3, X0 + CA * l, Y0 + y1, Z0 - SA * l, lv1); face(4, 0, PG | TWO, -1, 3, 0.25); };
    for (let k = 0; k < w.n; k++) {
      SK = w.s0 + 2 * k; X0 = w.PX[k]; Y0 = w.PY[k]; Z0 = w.PZ[k]; X1 = w.PX[k + 1]; Y1 = w.PY[k + 1]; Z1 = w.PZ[k + 1];
      ZK = SK + 2 - camS; // a segment sorts by its far edge: whatever stands on it comes after
      CA = Math.cos(w.HD[k]); SA = Math.sin(w.HD[k]); CB = Math.cos(w.HD[k + 1]); SB = Math.sin(w.HD[k + 1]);
      const tk = SK > w.tun0 && SK < w.tun1;
      if (!tk) {
        band2(-RW - 16, -RW - 0.5, K.verge, w.kind === 'desert' ? PC : PF, -1, 0.3, 0.25);
        if (w.kind === 'coast') band2(RW + 0.5, RW + 22, FIX + COOL, PS, COOL + DIM, 0.3, 0.35, t * 0.6);
        else band2(RW + 0.5, RW + 16, K.verge, w.kind === 'desert' ? PC : PF, -1, 0.3, 0.25);
      }
      band2(-RW, RW, 3.6, PS, -2, 0.2, 0.4);
      band2(-RW - 0.5, -RW, FIX + HOT, PS, BRIGHT, 0.1, 0.5);
      band2(RW, RW + 0.5, FIX + HOT, PS, BRIGHT, 0.1, 0.5);
      if (tk) {
        wall(-RW - 0.9, 0, 3.4, 2.4, 1); wall(RW + 0.9, 0, 3.4, 2.4, 1);
        qv(0, X0 - CA * (RW + 0.9), Y0 + 3.4, Z0 + SA * (RW + 0.9), 0.6); qv(1, X0 + CA * (RW + 0.9), Y0 + 3.4, Z0 - SA * (RW + 0.9), 0.6);
        qv(2, X1 + CB * (RW + 0.9), Y1 + 3.4, Z1 - SB * (RW + 0.9), 0.6); qv(3, X1 - CB * (RW + 0.9), Y1 + 3.4, Z1 + SB * (RW + 0.9), 0.6);
        face(4, 0, PG | TWO, -1, 3, 0.25);
        if (Math.floor(SK / 6) !== Math.floor((SK + 2) / 6)) { // a light in the roof every six units, strobing as they pass
          const sm = Math.floor((SK + 2) / 6) * 6, hm = onStrip(w, sm, 0, 3.32);
          ZK = sm - camS;
          mPush(); mT(WX, WY, WZ); mRY(hm); box(0, 0, 0, 0.7, 0.05, 0.35, FIX + ((sm / 6 + f.beat.count) % 2 && f.beat.pulse < 0.5 ? LMID : WHITE)); mPop();
        }
      }
    }
    // the roadside, at fixed spots along the track, as far as the strip goes (the fog decides what shows)
    for (let j = Math.floor((w.s - 4) / 8); j * 8 + 4 < w.s0 + 2 * w.n; j++) {
      const sj = j * 8 + hash(j, 1) * 4, sd = hash(j, 2) < 0.5 ? -1 : 1;
      if (sj < w.s - 5 || (sj > w.tun0 - 2 && sj < w.tun1 + 2)) continue;
      ZK = sj - camS;
      if (w.kind === 'city') {
        const hm = onStrip(w, sj, sd * (RW + 5 + hash(j, 3) * 3), 0), hb = 5 + hash(j, 4) * 12;
        mPush(); mT(WX, WY, WZ); mRY(hm); box(0, hb / 2, 0, 2.2, hb / 2, 3, 2.8, 3.4, PW, hash(j, 5) < 0.5 ? BRIGHT : HOT, 0.8); mPop();
      } else if (j % 3 === 0) { onStrip(w, sj, sd * (RW + 1.6), 0); spr(K_SIGN, WX, WY, WZ, 0, w.sign > 0 ? 1 : 0, w.signC); }
      else { const ss = w.kind === 'coast' ? -1 : sd; onStrip(w, sj, ss * (RW + 2.2 + hash(j, 3) * 2.5), 0); spr(w.kind === 'coast' ? K_PALM : K_CACTUS, WX, WY, WZ, ss); }
    }
    // the car on the road, the body on its springs over the wheels, its shadow under it
    const hC = onStrip(w, w.s, w.ox, 0), cx = WX, cy = WY, cz = WZ, slope = Math.atan((trackY(w.s + 1, w.ph, K.hills) - trackY(w.s - 1, w.ph, K.hills)) / 2);
    ZK = w.s - camS - 2.2; // past the segments under it, the shadow first and then the car, its faces far to near
    shadow(cx - (C.Lx / C.Ly) * 0.45, cy + 0.02, cz - (C.Lz / C.Ly) * 0.45, 0.95, 1.85, BLACK, 3, 0, hC + w.drift); // cast from the body's middle away from the sun
    ZK = w.s - camS - 2.32;
    mPush(); mT(cx, cy, cz); mRY(hC + w.drift); mRX(-slope);
    for (let k = 0; k < 4; k++) box(k & 1 ? 0.84 : -0.84, 0.3, k & 2 ? 1.2 : -1.2, 0.17, 0.3, 0.3, 1.2);
    mT(0, w.by, 0);
    box(0, 0.64, 0, 0.94, 0.24, 1.95, 5, FIX + HOT);
    box(0, 1.06, -0.3, 0.72, 0.19, 0.95, 3, 4.5);
    box(0, 1.02, -1.86, 0.9, 0.04, 0.16, 2.6);
    const tl = FIX + (f.beat.pulse > 0.6 || Math.abs(w.driftT) > 0.15 ? WHITE : HOT);
    for (let sd = -1; sd <= 1; sd += 2) box(sd * 0.62, 0.7, -1.96, 0.2, 0.06, 0.02, tl);
    mPop();
    // the drift's smoke off the rear wheels where the drift has swung them out (fifteen pairs a second), kept in track
    // coordinates: it stays where it was made as the car drives off
    if (Math.abs(w.drift) > 0.16) {
      const cd = Math.cos(w.drift), sn = Math.sin(w.drift);
      for (w.smokeT = Math.min(2, w.smokeT + dt * 15); w.smokeT >= 1 && w.smoke.length < 24; w.smokeT--) for (let sd = -1; sd <= 1; sd += 2) w.smoke.push({ s: w.s - 1.2 * cd - sd * 0.84 * sn, lat: w.ox + sd * 0.84 * cd - 1.2 * sn, y: 0.25, r: 0.2, life: 0.8 });
    }
    w.smoke = w.smoke.filter((p) => {
      p.life -= dt; p.y += dt * 0.6; p.r += dt * 0.55;
      if (p.s > w.s0) { ZK = p.s - camS - 0.5; onStrip(w, p.s, p.lat, p.y); spr(K_PUFF, WX, WY, WZ, p.r, LMID, clamp(p.life / 0.8) * 0.55); }
      return p.life > 0;
    });
    flush(r, W, racerSpr);
    if (toScr(cx, cy + 1.4, cz)) { const ty = SY, tx = SX, sc = C.F / VZ; targets.push({ x: tx - sc, y: ty, w: 2 * sc, h: 1.4 * sc }); }
  },
};

// ---------------------------------------------------------------------------------------------- platformer3d
// A platformer from behind: boxy platforms float over a void and the round hero hops one a beat on a true
// parabola (the hop takes the beat and lands on the next top as the next beat comes; the landing squashes it). A
// kick at the takeoff hops higher with a puff of dust, a snare spins it in the air, a note collects the nearest gem
// ahead (it flies up spinning, slowing, and is gone in a sparkle); the platforms bob with the bass, the lives row
// blinks on the beat. Biomes: lava (a glowing sea far below, embers), ice (snow), jungle (vines). A drop
// reshuffles the platforms and sends the hero over one in a big jump.
const BIOME_W = { lava: [1, 2, 3], ice: [2, 2, 1], jungle: [3, 2, 2] };
const BIOMES = { lava: { side: 1.8, top: 4, rim: HOT, sky: [0.8, 2.2] }, ice: { side: 5.2, top: FIX + BRIGHT, rim: COOL, sky: [6.8, 3.2] }, jungle: { side: 2.6, top: FIX + COOL, rim: LMID, sky: [5.4, 1.6] } };
function newPlat(rnd, last) {
  const z = last ? last.z + 2.7 + rnd() * 1.1 : 0, x = last ? clamp(last.x + (rnd() - 0.5) * 3.2, -3, 3) : 0, y = last ? clamp(last.y + (rnd() - 0.5) * 1.4, -1.4, 1.4) : 0;
  return { x, y, z, tx: x, ty: y, hx: 0.85 + rnd() * 0.5, hz: 0.8 + rnd() * 0.45, ph: rnd() * TAU, gem: last && rnd() < 0.55 ? 1 : 0, gemT: 0, gc: rnd() < 0.7 ? COOL : HOT };
}
const platTop = (p, bc) => p.y + 0.12 * Math.sin(bc + p.ph);

const platformer3d = {
  init(W) {
    const { w, rnd } = W;
    w.plats = [newPlat(rnd, null)];
    while (w.plats.length < 13) w.plats.push(newPlat(rnd, w.plats[w.plats.length - 1])); // the last lies past the fog: new ones come up out of it
    Object.assign(w, { kind: rollW(rnd, BIOME_W, bandOf(W.a)), bt: 0, t0: null, len: 1, big: false, sq: 0, spinE: 1, boost: 0, boostS: 0, head: 0, gems: 0, dust: [], spark: [], cx: 0, cy: 3, cz: -7, hx: 0, hy: 0, hz: 0,
      motes: Array.from({ length: 40 }, () => [rnd(), rnd(), rnd()]) });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, t } = W, band = bandOf(W.a), K = BIOMES[w.kind];
    const bt = beats(W), hb = f.bpm > 140 ? 2 : 1, bc = f.rel.bassClock;
    if (w.t0 === null || bt < w.t0 - 0.01 || bt - w.t0 > 8) { w.t0 = Math.floor(bt / hb) * hb; w.len = hb; } // (re)lock the hops to the beat
    let p = (bt - w.t0) / w.len;
    for (const h of hits) {
      if (isLow(h)) { if (p < 0.12) w.boost = Math.max(w.boost, 0.6 * h.strength); }
      else if (h.kind === 'snare') { if (w.spinE >= 1) w.spinE = 0; }
      else if (isTonal(h)) { const g = w.plats.find((q, i) => i > 0 && q.gem === 1); if (g) { g.gem = 2; g.gemT = 0; } }
    }
    if (f.section === 'change') w.kind = rollW(rnd, BIOME_W, band);
    if (f.section === 'drop') { w.big = true; for (let i = 2; i < w.plats.length; i++) { const q = w.plats[i]; q.tx = clamp(q.x + (rnd() - 0.5) * 4, -3.5, 3.5); q.ty = clamp(q.y + (rnd() - 0.5) * 2, -1.8, 1.8); } }
    // the hop: from the platform under the hero to the next (two on a big jump), landing as the beat comes round
    while (p >= 1) {
      const n = w.len > hb ? 2 : 1;
      for (let k = 0; k < n; k++) { w.plats.shift(); w.plats.push(newPlat(rnd, w.plats[w.plats.length - 1])); }
      w.t0 += w.len; w.sq = 1; w.boost = 0;
      const A = w.plats[0];
      for (let k = 0; k < 4; k++) w.dust.push(puff(w.hx, platTop(A, bc) + 0.05, w.hz, (rnd() - 0.5) * 1.6, 0.3, (rnd() - 0.5) * 1.6, 0.12, 0.5, 0.5, LMID, 0.7, 3));
      w.len = w.big ? 2 * hb : hb; w.big = false;
      p = (bt - w.t0) / w.len;
    }
    for (const q of w.plats) { q.x = follow(q.x, q.tx, dt, 0.3); q.y = follow(q.y, q.ty, dt, 0.3); }
    const A = w.plats[0], B = w.len > hb ? w.plats[2] : w.plats[1], ya = platTop(A, bc), yb = platTop(B, bc);
    w.boostS = follow(w.boostS, w.boost, dt, 0.05);
    const apex = (w.len > hb ? 3.2 : 1.05) + w.boostS;
    w.hx = lerp(A.x, B.x, p); w.hz = lerp(A.z, B.z, p); w.hy = lerp(ya, yb, p) + 4 * apex * p * (1 - p); // a parabola: linear across, quadratic up
    w.head = followAngle(w.head, Math.atan2(B.x - A.x, B.z - A.z), dt, 0.15);
    w.sq *= Math.exp(-dt * 9);
    w.spinE = Math.min(1, w.spinE + dt / 0.45);
    // the camera trails the hero, a little above
    w.cx = follow(w.cx, w.hx * 0.75, dt, 0.4); w.cy = follow(w.cy, w.hy + 2.5, dt, 0.5); w.cz = follow(w.cz, w.hz - 5, dt, 0.25);
    look(w.cx, w.cy, w.cz, w.hx * 0.9, w.hy + 0.3, w.hz + 3.5, 0.95 * N, N / 2, 0.55 * N);
    dgrad(r, 0, N, K.sky[0], K.sky[1]);
    if (w.kind === 'lava') { const y0 = 0.62 * N; for (let y = Math.round(y0); y < N; y++) { const d = (y - y0) / (N - y0), by = (y & 7) << 3; for (let x = 0; x < N; x++) if (BAYER[by | (x & 7)] < d * 0.8) r.buf[y * N + x] = HOT + (d < 0.5 ? DIM : 0); } }
    for (const [mx, my, mk] of w.motes) { // embers rising, snow falling, vines swaying
      if (w.kind === 'lava') r.rect(mx * N, (((my - t * (0.05 + 0.05 * mk)) % 1) + 1) % 1 * N, Math.max(1, u), Math.max(1, u), (t * 4 + mk * 9) % 2 < 1 ? HOT : BRIGHT);
      else if (w.kind === 'ice') r.rect((mx * N + Math.sin(t + mk * 6) * 3 * u + N) % N, ((my + t * (0.04 + 0.04 * mk)) % 1) * N, Math.max(1, u), Math.max(1, u), BRIGHT);
      else if (mk < 0.35) { const len = (0.1 + 0.3 * my) * N, sw = Math.sin(t * 0.8 + mk * 20) * 3 * u; r.stroke(mx * N, 0, mx * N + sw, len, Math.max(1, u), DARK); r.disc(mx * N + sw, len, 1.5 * u, COOL + DIM); }
    }
    begin(W, 14, 36, K.sky[1] + 0.5);
    light(-0.4, 1, -0.5);
    if (w.kind === 'lava') for (let k = 0; k < 6; k++) { const z0 = w.cz + k * 8; qv(0, -40, -12, z0, 0); qv(1, 40, -12, z0, 0); qv(2, 40, -12, z0 + 8, 2); qv(3, -40, -12, z0 + 8, 2); face(4, FIX + HOT, PS | TWO, HOT + DIM, 1); }
    // the platforms: a slab with a rim of the biome's accent, a gem over some
    for (const q of w.plats) {
      const top = platTop(q, bc);
      box(q.x, top - 0.38, q.z, q.hx, 0.3, q.hz, K.side);
      box(q.x, top - 0.04, q.z, q.hx + 0.05, 0.04, q.hz + 0.05, FIX + K.rim, K.top);
      if (q.gem === 1) { mPush(); mT(q.x, top + 1 + 0.1 * Math.sin(t * 3 + q.ph), q.z); mRY(t * 2.5 + q.ph); mS(0.3, 0.4, 0.3); mesh(GEM, FIX + q.gc, 4); mPop(); }
      else if (q.gem === 2) { // collected: up and away, slowing, spinning faster, gone in a sparkle
        const e = (q.gemT += dt) / 0.6, gy = top + 1 + 2.6 * (1 - (1 - Math.min(1, e)) ** 2), sc = 1 - clamp((e - 0.7) / 0.3);
        if (e >= 1) { q.gem = 0; w.gems++; burst3(w.spark, rnd, q.x, gy, q.z, 12, 2.2, BRIGHT, 0.6, 1); }
        else { mPush(); mT(q.x, gy, q.z); mRY(t * 14); mS(0.3 * sc + 0.01, 0.4 * sc + 0.01, 0.3 * sc + 0.01); mesh(GEM, FIX + (e > 0.5 ? WHITE : q.gc), 4); mPop(); }
      }
    }
    // the shadow on the highest top under the hero, smaller the higher it is
    let sh = null, shy = -1e9, sx = w.hx, sz = w.hz;
    for (const q of w.plats) { const top = platTop(q, bc), ox = w.hx - (C.Lx / C.Ly) * (w.hy - top), oz = w.hz - (C.Lz / C.Ly) * (w.hy - top); if (Math.abs(ox - q.x) < q.hx && Math.abs(oz - q.z) < q.hz && top <= w.hy + 0.01 && top > shy) { sh = q; shy = top; sx = ox; sz = oz; } }
    if (sh) { const k = 1 / (1 + 0.35 * (w.hy - shy)); shadow(sx, shy + 0.01, sz, 0.42 * k, 0.36 * k, DARK + DIM, 3, -0.8); }
    // the hero: a ball on two feet, squashed on landing about its feet, spun by a snare
    const sq = w.sq, sy = 1 - 0.32 * sq, sxz = 1 + 0.18 * sq;
    mPush(); mT(w.hx, w.hy, w.hz); mRY(w.head + TAU * ease(w.spinE)); mS(sxz, sy, sxz);
    mPush(); mT(0, 0.46, 0); mS(0.46, 0.46, 0.46); mesh(SPHERE, 6.4, 4); mPop();
    for (let sd = -1; sd <= 1; sd += 2) { box(sd * 0.19, 0.06, 0.06, 0.11, 0.06, 0.16, FIX + HOT, FIX + HOT, PF, -1, 1, 4); box(sd * 0.15, 0.6, 0.41, 0.05, 0.08, 0.03, FIX + BLACK, FIX + BLACK, PF, -1, 1, 4); }
    mPop();
    w.dust = puffs(W, w.dust);
    w.spark = parts3(W, w.spark, 2.5, 0.07);
    flush(r, W);
    if (toScr(w.hx, w.hy + 1, w.hz)) { const tx = SX, ty = SY, sc = C.F / VZ; targets.push({ x: tx - 0.5 * sc, y: ty, w: sc, h: sc }); }
    // the lives row: plain round icons, one more for every few gems, the last blinking on the beat
    const nl = Math.min(6, 3 + Math.floor(w.gems / 6));
    for (let i = 0; i < nl; i++) r.disc(0.07 * N + i * 6 * u, 0.07 * N, 2.2 * u, i === nl - 1 && f.beat.pulse > 0.5 ? BRIGHT : HOT);
  },
};

// ---------------------------------------------------------------------------------------------- fightstage
// A fighting-game stage seen from the side: two boxy fighters bob in their stance on the beat (the feet stay
// planted, the knees take it), shuffle with the bass in and out of reach and step to keep their spacing. A kick throws
// a punch (the arm swings about the shoulder; when the fist reaches the other one, sparks fly from it and the other one
// slides back), a snare a kick (the leg swings up about the hip from where the foot stood); the crowd of flat
// billboards bobs at the back. Stages: dojo (boards, paper
// screens), street (blocks with lit windows), shrine (pillars, a gate, a low sun). A drop darkens the stage for a
// super: a leaping uppercut that launches the other fighter on a parabola, a bounce, a slide.
const STAGE_W = { dojo: [3, 2, 1], street: [1, 2, 3], shrine: [2, 2, 2] };
const K_FAN = 8, K_STAR = 9;
const newFighter = (x, dir) => ({ x, y: 0, vx: 0, vy: 0, dir, air: false, pe: 0, pt: 1, ke: 0, kt: 1, flash: 0, hit: false, fx: x, fy: 1.2, fz: 0, feet: [{ x: x - dir * 0.3, y: 0, e: 1, from: 0, to: 0 }, { x: x + dir * 0.28, y: 0, e: 1, from: 0, to: 0 }] });
// the punch and kick curves: out fast, back slower (0 at rest, 1 at full reach)
const strike = (e) => (e >= 1 ? 0 : e < 0.3 ? e / 0.3 : 1 - (e - 0.3) / 0.7);
function fightSpr(r, W, p) {
  if (p.k < 8) { common(r, W, p); return; }
  const s = p.sc, x = p.x, y = p.y;
  if (p.k === K_FAN) { // a fan at the back: a head, shoulders, arms up when it jumps
    const c = p.c, up = p.a;
    r.rect(x - 0.24 * s, y - 1.1 * s, 0.48 * s, 1.1 * s, c);
    r.disc(x, y - 1.32 * s, 0.17 * s, c);
    if (up > 0.3) { r.stroke(x - 0.2 * s, y - 1 * s, x - 0.38 * s, y - 1.75 * s, Math.max(1, 0.1 * s), c); r.stroke(x + 0.2 * s, y - 1 * s, x + 0.38 * s, y - 1.75 * s, Math.max(1, 0.1 * s), c); }
    if (p.b) r.rect(x - 0.24 * s, y - 0.95 * s, 0.48 * s, Math.max(1, 0.12 * s), p.b);
  } else { // the flash where a blow lands: a four-point star
    const R = p.a * s;
    r.poly([[x, y - R], [x + R * 0.25, y - R * 0.25], [x + R, y], [x + R * 0.25, y + R * 0.25], [x, y + R], [x - R * 0.25, y + R * 0.25], [x - R, y], [x - R * 0.25, y - R * 0.25]], WHITE);
    r.disc(x, y, R * 0.3, p.c);
  }
}
function fighter(F, hipY, mb, mh, acc, uppercut) {
  const lz = (k) => (F.feet[k].x - F.x) * F.dir;
  mPush(); mT(F.x, F.y, 0); mRY(F.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  for (let k = 0; k < 2; k++) { // the legs: by IK to the planted feet; the front one swings up on a kick, from where it stood out to full reach
    const lx = k ? 0.12 : -0.12, ke = k ? strike(F.ke) : 0, py = F.feet[k].y - F.y + 0.08, pz = lz(k);
    let fy = py, fz = pz;
    if (ke > 0) { const a = lerp(Math.atan2(pz, hipY - py), 1.55, ke), rr = lerp(Math.hypot(pz, hipY - py), 0.93, ke); fy = hipY - rr * Math.cos(a); fz = rr * Math.sin(a); }
    leg(lx, hipY, 0, fy, fz, 0.5, 0.5, 0.075, mb);
    box(lx, fy - 0.04, fz + 0.06, 0.06, 0.04, 0.12, mb);
  }
  mPush(); mT(0, hipY, 0); mRX(0.12 + 0.2 * strike(F.pe));
  box(0, 0.32, 0, 0.21, 0.3, 0.13, F.flash > 0 ? FIX + WHITE : mb);
  box(0, 0.02, 0, 0.19, 0.05, 0.12, FIX + acc);
  box(0, 0.8, 0.04, 0.12, 0.13, 0.12, F.flash > 0 ? FIX + WHITE : mh);
  for (let k = 0; k < 2; k++) { // the arms: a guard up, the near one punching out from the shoulder
    const pe = k === 0 ? strike(F.pe) : 0, up = uppercut && k === 0, tu = up ? 2.7 : lerp(0.55, 1.5, pe), tf = up ? 2.9 : lerp(2.5, 1.55, pe);
    mPush(); mT(k ? 0.29 : -0.29, 0.56, 0); mRX(-tu);
    box(0, -0.17, 0, 0.065, 0.17, 0.065, mb);
    mT(0, -0.34, 0); mRX(-(tf - tu));
    box(0, -0.16, 0, 0.055, 0.16, 0.055, mb);
    box(0, -0.37, 0, 0.075, 0.075, 0.075, FIX + acc);
    if (k === 0) { xf(0, -0.37, 0); F.fx = WX; F.fy = WY; F.fz = WZ; }
    mPop();
  }
  mPop();
  mPop();
}

const fightstage = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, STAGE_W, bandOf(W.a)), bt: 0, f: [newFighter(-0.55, 1), newFighter(0.55, -1)], turn: 0, sparks: [], stars: [], sup: 0, supA: 0, cx: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s, t } = W, band = bandOf(W.a);
    const bt = beats(W), [A, B] = w.f;
    for (const h of hits) {
      if (isLow(h) && w.sup <= 0) { const F = w.f[w.turn]; if (F.pt >= 1 && !F.air) { F.pt = 0; F.hit = false; w.turn ^= 1; } }
      else if (h.kind === 'snare' && w.sup <= 0) { const F = w.f[w.turn]; if (F.kt >= 1 && F.pt >= 1 && !F.air) { F.kt = 0; F.hit = false; w.turn ^= 1; } }
    }
    if (f.section === 'change') w.kind = rollW(rnd, STAGE_W, band);
    if (f.section === 'drop' && w.sup <= 0) { w.sup = 2.6; w.supA = w.turn; w.turn ^= 1; }
    // the super: a crouch in the dark, then the leap and the launch
    const supE = 2.6 - w.sup;
    w.sup -= dt;
    if (w.sup > 0 && supE < 0.4 && supE + dt >= 0.4) {
      const P = w.f[w.supA], Q = w.f[w.supA ^ 1];
      P.vy = 6; P.air = true; P.vx = P.dir * 1;
      Q.vy = 7.5; Q.air = true; Q.vx = P.dir * 3.2; Q.flash = 0.2;
      burst3(w.sparks, rnd, (P.x + Q.x) / 2, 1.5, -0.2, 26, 3.5, BRIGHT, 0.6, 1.5);
      w.stars.push({ x: (P.x + Q.x) / 2, y: 1.5, life: 0.2, a: 0.9 });
      s.shake = Math.max(s.shake, 1);
    }
    // each fighter: the strikes, the body (its spacing, a knock back, the air), the feet that step to keep under it
    const dip = 0.06 * f.beat.pulse, shuffle = 0.12 * Math.sin(f.rel.bassClock * 0.9);
    for (let i = 0; i < 2; i++) {
      const F = w.f[i], O = w.f[i ^ 1];
      F.pt = Math.min(1, F.pt + dt / 0.34); F.kt = Math.min(1, F.kt + dt / 0.42); F.flash -= dt;
      F.pe = F.pt; F.ke = F.kt;
      if (!F.hit && ((F.pt >= 0.3 && F.pt < 1) || (F.kt >= 0.3 && F.kt < 1))) { // at full reach (whatever the frame rate): it lands only on a body the fist or the foot touches
        F.hit = true;
        const kick = F.kt < 1, hx = F.x + F.dir * (kick ? 0.93 : 0.84), hy = kick ? 0.88 : 1.2;
        if (!O.air && Math.abs(O.x - hx) < (kick ? 0.3 : 0.21)) {
          burst3(w.sparks, rnd, hx, hy, -0.15, 10, 2.4, i ? COOL : HOT, 0.35, 0.8);
          w.stars.push({ x: hx, y: hy, life: 0.1, a: 0.35 });
          O.vx += F.dir * 2.2; O.flash = 0.1;
          s.shake = Math.max(s.shake, 0.3);
        }
      }
      if (F.air) { F.y += (F.vy - 9 * dt) * dt; F.vy -= 18 * dt; F.x += F.vx * dt; if (F.y <= 0) { F.y = 0; if (F.vy < -3) F.vy = -F.vy * 0.35; else { F.vy = 0; F.air = false; F.feet[0].x = F.x - F.dir * 0.3; F.feet[1].x = F.x + F.dir * 0.28; } } }
      else {
        const home = (i ? 0.55 - shuffle : -0.55 + shuffle) + w.cx, walk = clamp(home - F.x, -1.2 * dt, 1.2 * dt) * (Math.abs(F.vx) < 0.4 ? 1 : 0); // at striking range: the shuffle takes them in and out of reach
        F.x += F.vx * dt + walk;
        if (Math.abs(F.vx) > 0.6) for (const ft of F.feet) ft.x += F.vx * dt; // knocked back: it slides on its feet
        F.vx *= Math.exp(-dt * 5);
      }
      F.dir = O.x > F.x ? 1 : -1;
      const rest = [F.x - F.dir * 0.3, F.x + F.dir * 0.28];
      for (let k = 0; k < 2; k++) {
        const ft = F.feet[k], other = F.feet[k ^ 1];
        if (F.air) { ft.x = F.x + F.dir * (k ? 0.2 : -0.15); ft.y = F.y + 0.3; ft.e = 1; continue; }
        if (ft.e < 1) { ft.e = Math.min(1, ft.e + dt / 0.14); ft.x = lerp(ft.from, ft.to, ft.e); ft.y = 0.1 * Math.sin(Math.PI * ft.e); }
        else { ft.y = 0; if (Math.abs(ft.x - rest[k]) > 0.2 && other.e >= 1 && F.kt >= 1) { ft.from = ft.x; ft.to = rest[k]; ft.e = 0; } }
      }
    }
    w.cx = follow(w.cx, 0, dt, 2);
    const mid = (A.x + B.x) / 2, dark = w.sup > 0 && w.sup < 2.6 ? clamp(Math.min(supE / 0.15, w.sup / 0.5)) : 0;
    look(mid + 1.1 * Math.sin(t * 0.13), 2.1 + 0.2 * energy(f), -4.2 + 0.5 * energy(f), mid, 1, 0.5, 0.95 * N, N / 2, 0.5 * N);
    // the backdrop: a dithered sky, or the dark of a super
    if (dark > 0.5) r.fill(BLACK); else dgrad(r, 0, 0.5 * N, 0.6, w.kind === 'shrine' ? 5.5 : 3.4);
    begin(W, 14, 32, dark > 0.5 ? 0 : 2);
    light(-0.5, 1, -0.6);
    const K = w.kind, fl = dark > 0.5 ? 1.2 : K === 'dojo' ? 4.4 : K === 'street' ? 3.4 : 3.8;
    const sx = K === 'dojo' ? 0 : K === 'street' ? 0.4 : 0.5, sz = K === 'dojo' ? 1.6 : 0; // boards across, slabs, flagstones
    for (let k = 0; k < 4; k++) { const z0 = -4 + k * 2.75, z1 = z0 + 2.75; qv(0, -10, 0, z0, -10 * sx + z0 * sz, 0.4 * z0); qv(1, 10, 0, z0, 10 * sx + z0 * sz, 0.4 * z0); qv(2, 10, 0, z1, 10 * sx + z1 * sz, 0.4 * z1); qv(3, -10, 0, z1, -10 * sx + z1 * sz, 0.4 * z1); face(4, fl, K === 'street' ? PC : PS, -2, 1, 0, 0, 1, 0); }
    if (dark <= 0.5) {
      if (K === 'dojo') { // the back wall, screens of paper in their frames, two posts
        qv(0, -12, 0, 9.5, 1.5); qv(1, 12, 0, 9.5, 1.5); qv(2, 12, 4.5, 9.5, 3); qv(3, -12, 4.5, 9.5, 3); face(4, 0, PG, -1, 1, 0, 0, 0, -1);
        for (let k = -3; k <= 3; k++) box(k * 2.3, 2.2, 9.4, 0.95, 1.2, 0.05, FIX + LMID + DIM, FIX + LMID, PS, LMID, 1.4);
        for (const x of [-5.5, 5.5]) box(x, 2.2, 6.6, 0.18, 2.2, 0.18, 2.2);
      } else if (K === 'street') for (let k = -3; k <= 3; k++) { const hb = 4 + hash(k + 9, 4) * 6; box(k * 3.4, hb / 2, 12 + hash(k, 2) * 2, 1.6, hb / 2, 1.4, 2.2, 2.6, PW, hash(k, 5) < 0.5 ? BRIGHT : HOT, 1.1); }
      else { // a low sun, a gate of two pillars and a lintel, stone lanterns
        if (toScr(mid + 2, 3.6, 30)) ddisc(r, SX, SY, 0.13 * N, HOT, 0.75);
        for (const x of [-2.4, 2.4]) box(x, 2, 8, 0.2, 2, 0.2, 2.4);
        box(0, 3.9, 8, 3.2, 0.14, 0.25, FIX + HOT); box(0, 3.4, 8, 2.7, 0.08, 0.14, 2.4);
        for (const x of [-5, 5]) { box(x, 0.4, 6.5, 0.22, 0.4, 0.22, 4.5); box(x, 0.95, 6.5, 0.32, 0.12, 0.32, 3.5); }
      }
      box(0, 0.45, 7, 10, 0.45, 0.06, 2, 3, PS, -2, 1.5); // the rail, the crowd behind it
      for (let k = 0; k < 30; k++) { const row = k % 2, x = -7 + (k >> 1) * 1 + row * 0.5, ph = bt + (k % 3) * 0.33, up = Math.max(0, Math.sin(Math.PI * ph)) ** 2; spr(K_FAN, x, 0.3 * up + row * 0.3, 7.6 + row * 0.8, up, hash(k, 3) < 0.25 ? (k & 1 ? HOT : COOL) : 0, row ? DARK + DIM : DARK); }
    }
    // the fighters, their shadows on the floor smaller as they rise
    for (let i = 0; i < 2; i++) {
      const F = w.f[i], k = 1 / (1 + 0.5 * F.y);
      shadow(F.x - (C.Lx / C.Ly) * F.y, 0.01, -(C.Lz / C.Ly) * F.y, 0.55 * k, 0.32 * k, DARK + DIM, 2);
      const up = w.sup > 0 && i === w.supA && F.air, hipY = (w.sup > 0 && supE < 0.4 && i === w.supA ? 0.8 : 0.93) - (F.air ? 0 : dip);
      fighter(F, hipY, i ? 4.4 : 6, 7, i ? COOL : HOT, up);
    }
    w.sparks = parts3(W, w.sparks, 9, 0.07);
    w.stars = w.stars.filter((q) => { q.life -= dt; spr(K_STAR, q.x, q.y, -0.3, q.a, 0, HOT); return q.life > 0; });
    flush(r, W, fightSpr);
    if (dark > 0 && supE < 0.5) for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; if (toScr(w.f[w.supA].x, 1.2, 0)) r.line(SX + Math.cos(a) * 0.12 * N, SY + Math.sin(a) * 0.12 * N, SX + Math.cos(a) * N, SY + Math.sin(a) * N, k % 2 ? BRIGHT : HOT); }
    for (const F of w.f) if (toScr(F.x, 1.9 + F.y, 0)) { const tx = SX, ty = SY, sc = C.F / VZ; targets.push({ x: tx - 0.4 * sc, y: ty, w: 0.8 * sc, h: 1.9 * sc }); }
  },
};

// ---------------------------------------------------------------------------------------------- worldmap
// A world map from above: low-poly tiles over a height field (sea, sand, plains, forest as billboard trees, hills,
// peaks with snow), the ground dropping away with the square of the distance so the world curves off at the
// horizon. An airship flies over at the energy's speed, propellers spinning with the treble, its shadow on the
// ground where the light puts it; a kick bobs it on its lift, a note colours its lamp, the hats twinkle the towns,
// the water runs with the bass. A hard snare swirls the screen into a battle for a bar (a row of monsters, a party
// that steps up to strike on each beat), then back. A drop sends a dragon's shadow across the land. Continents:
// green, desert, frost, isles.
const CONT_W = { green: [3, 2, 1], desert: [1, 2, 3], frost: [2, 2, 1], isles: [2, 1, 2] };
const CONTS = {
  green: { sea: 0.42, sand: 6.2, plain: 4.6, forest: 2.8, hill: 4, peak: 5.6, water: COOL },
  desert: { sea: 0.3, sand: 6.6, plain: 6, forest: 4.4, hill: 5, peak: 6.2, water: COOL },
  frost: { sea: 0.4, sand: 7, plain: 7.4, forest: 3, hill: 6, peak: 7.6, water: LMID },
  isles: { sea: 0.55, sand: 6.6, plain: 4.8, forest: 2.8, hill: 4.2, peak: 5.6, water: COOL },
};
const K_TREE = 8, K_TOWN = 9;
const ENVELOPE = lathe([[0, 1], [0.6, 0.75], [0.95, 0.3], [0.95, -0.3], [0.6, -0.75], [0, -1]], 8);
function mapSpr(r, W, p) {
  if (p.k < 8) { common(r, W, p); return; }
  const s = p.sc, x = p.x, y = p.y;
  if (p.k === K_TREE) { r.poly([[x, y - 0.75 * s], [x + 0.28 * s, y - 0.08 * s], [x - 0.28 * s, y - 0.08 * s]], fogC(p.c, p.q)); r.rect(x - Math.max(0.5, 0.04 * s), y - 0.1 * s, Math.max(1, 0.08 * s), 0.1 * s + 1, fogC(DARK + DIM, p.q)); }
  else r.rect(x, y, Math.max(1, 0.06 * s), Math.max(1, 0.06 * s), p.c);
}
function mapTables(W) {
  const { w, N } = W;
  w.N = N; w.pa = new Uint8Array(N * N); w.pr = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dx = x + 0.5 - N / 2, dy = y + 0.5 - N / 2; w.pa[y * N + x] = (((Math.atan2(dy, dx) / TAU) * 256) | 0) & 255; w.pr[y * N + x] = Math.hypot(dx, dy) / (0.71 * N); }
}
// the battle: a row of monsters on the left, a party of three on the right, each beat one steps up to strike
function battle(W, e, bt) {
  const { r, N, w } = W;
  dgrad(r, 0, 0.55 * N, 1.5, 5);
  dgrad(r, 0.55 * N, N, 3, 1.4);
  begin(W, 10, 30, 1);
  look(0.6, 2.6, -6.2, 0.4, 0.8, 0.5, 0.95 * N, N / 2, N / 2);
  light(0.3, 1, -0.6);
  for (let k = 0; k < 3; k++) { qv(0, -7, 0, -3 + k * 3, -7 * 0.6, 0); qv(1, 7, 0, -3 + k * 3, 7 * 0.6, 0); qv(2, 7, 0, k * 3, 7 * 0.6, 1.8); qv(3, -7, 0, k * 3, -7 * 0.6, 1.8); face(4, 3.4, PC, -2, 1, 0, 0, 1, 0); }
  const who = Math.floor(e) % 3, ph = e - Math.floor(e), lunge = Math.sin(Math.PI * Math.min(1, ph * 1.6));
  for (let k = 0; k < 3; k++) { // the monsters: blobs bouncing, the one struck flashing
    const x = -2.4 + (k - 1) * 0.4, z = (k - 1) * 1.5, R = 0.45 + 0.15 * ((k + w.seedB) % 3), hop = Math.abs(Math.sin(Math.PI * (bt + k * 0.3))) * 0.25, hit = k === who && ph > 0.3 && ph < 0.5;
    shadow(x, 0.01, z, R * 0.9, R * 0.7, DARK + DIM);
    mPush(); mT(x, hop + R * 0.9, z); mRY(Math.PI / 2); mS(R, R * 0.9, R); mesh(SPHERE, hit ? FIX + WHITE : 3.2 + k * 0.6); mPop();
    for (let sd = -1; sd <= 1; sd += 2) box(x + R * 0.8, hop + R * 1.1, z + sd * R * 0.35, 0.03, 0.07, 0.06, FIX + HOT);
  }
  for (let k = 0; k < 3; k++) { // the party, facing the monsters, the one whose turn it is stepping in
    const step = k === who ? 1.4 * lunge : 0, x = 2.4 + k * 0.35 - step, z = (k - 1) * 1.4;
    shadow(x, 0.01, z, 0.3, 0.22, DARK + DIM);
    figure(x, 0, z, -Math.PI / 2, k === who ? 0.3 * Math.sin(Math.PI * ph * 2) : 0, k === who ? 1.2 * lunge + 0.2 : null, 5 + k * 0.6, 6.6, 3, 0);
    if (k === who && ph > 0.3 && ph < 0.5) spr(K_DOT, -2.4 + (who - 1) * 0.4 + 0.3, 1, (who - 1) * 1.5, 0.5, WHITE);
  }
  flush(r, W, mapSpr);
}

const worldmap = {
  init(W) {
    const { w, rnd } = W, S = 64, H = new Float32Array(S * S), base = new Float32Array(16 * 16);
    for (let i = 0; i < 256; i++) base[i] = rnd();
    const at = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), g = (i, j) => base[(j & 15) * 16 + (i & 15)]; return lerp(lerp(g(xi, yi), g(xi + 1, yi), sx), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), sx), sy); };
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) H[j * S + i] = 0.65 * at(i / 4, j / 4) + 0.35 * at(i / 2 + 7.3, j / 2 + 3.1); // wraps every 64 tiles
    Object.assign(w, { H, kind: rollW(rnd, CONT_W, bandOf(W.a)), bt: 0, ax: 0, az: rnd() * 64, alt: 3.1, ay: 0, vy: 0, lamp: HOT, bat: 0, batT: 1, batB: 0, cool: 0, dragon: 0, seedB: 0, N: 0 });
    mapTables(W);
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, t } = W, band = bandOf(W.a), K = CONTS[w.kind], H = w.H;
    if (w.N !== N) mapTables(W);
    const bt = beats(W), bps = bpsOf(f);
    for (const h of hits) {
      if (isLow(h)) w.vy += 0.9 * h.strength;
      else if (h.kind === 'snare' && h.strength > 0.6 && w.bat <= 0 && w.cool <= 0) { w.bat = w.batT = 0.5 + 4 / bps + 0.25; w.batB = bt + 0.5 * bps; w.seedB = Math.floor(rnd() * 3); }
      else if (isTonal(h)) w.lamp = h.pc % 2 ? HOT : COOL;
    }
    if (f.section === 'change') w.kind = rollW(rnd, CONT_W, band);
    if (f.section === 'drop') w.dragon = 3;
    // the airship: forward at the energy's speed, weaving; it climbs over the hills under and ahead of it (it never
    // flies into one), and its height rides a spring above that (a kick lifts it, it settles)
    w.az += (1.2 + 2.6 * energy(f)) * dt;
    w.ax = 3 * Math.sin(w.az * 0.05);
    const sea = K.sea, hAt = (i, j) => H[(j & 63) * 64 + (i & 63)], elev = (h) => (h < sea ? 0 : (h - sea) * 4 + Math.max(0, h - 0.72) * 9);
    let hill = 0;
    for (let dz = -2; dz <= 7; dz++) for (let dx = -1; dx <= 2; dx++) hill = Math.max(hill, elev(hAt(Math.floor(w.ax) + dx, Math.floor(w.az) + dz)));
    w.alt = Math.max(follow(w.alt, Math.max(3.1, hill + 0.8), dt, 0.5), hill + 0.35); // (and at once, when a new land comes up under it)
    w.vy += (-w.ay * 6 - w.vy * 2.2) * dt; w.ay += w.vy * dt;
    w.cool -= dt; w.dragon -= dt;
    if (w.bat > 0) { // the battle: the swirl in, a bar of it, a white flash out
      const e = w.batT - w.bat;
      w.bat -= dt;
      if (w.bat <= 0) w.cool = 4;
      if (e > 0.5 && w.bat > 0.25) { battle(W, Math.max(0, bt - w.batB), bt); return; }
      if (w.bat <= 0.25 && w.bat > 0) { r.fill(WHITE); return; }
    }
    const ax = w.ax, az = w.az, ay = w.alt + w.ay, R = 20, hd = Math.atan2(0.15 * Math.cos(az * 0.05), 1);
    const drop = (x, z) => ((x - ax) ** 2 + (z - az) ** 2) / (2 * R);
    look(ax - 1.4, ay + 5.4, az - 6, ax, 0, az + 3, 0.95 * N, N / 2, 0.4 * N);
    backdrop(r, 1.5, 6, 1.5);
    begin(W, 12, 21, 2);
    light(0.25, 1, -0.2);
    // the tiles: two flat triangles each, coloured by height; water runs with the bass; wide enough that the fog, not
    // the edge of the patch, is where the land stops
    const i0 = Math.floor(ax) - 13, j0 = Math.floor(az) - 5, wave = f.rel.bassClock * 0.4;
    for (let j = j0; j < j0 + 22; j++) for (let i = i0; i < i0 + 26; i++) {
      const h00 = hAt(i, j), h10 = hAt(i + 1, j), h01 = hAt(i, j + 1), h11 = hAt(i + 1, j + 1), ha = (h00 + h10 + h01 + h11) / 4;
      const y00 = elev(h00) - drop(i, j), y10 = elev(h10) - drop(i + 1, j), y01 = elev(h01) - drop(i, j + 1), y11 = elev(h11) - drop(i + 1, j + 1);
      if (ha < sea) { qv(0, i, y00, j, j + wave, 0); qv(1, i + 1, y10, j, j + wave, 0); qv(2, i + 1, y11, j + 1, j + 1 + wave, 0); qv(3, i, y01, j + 1, j + 1 + wave, 0); face(4, FIX + K.water, PS | TWO, K.water + DIM, 1); continue; }
      const mat = ha < sea + 0.04 ? K.sand : ha < 0.6 ? K.plain : ha < 0.68 ? K.forest : ha < 0.78 ? K.hill : ha < 0.86 ? K.peak : FIX + BRIGHT;
      qv(0, i, y00, j); qv(1, i + 1, y10, j); qv(2, i + 1, y11, j + 1); face(3, mat, PF | TWO, -1, 1);
      qv(0, i, y00, j); qv(1, i + 1, y11, j + 1); qv(2, i, y01, j + 1); face(3, mat, PF | TWO, -1, 1);
      const ym = (y00 + y10 + y01 + y11) / 4, hh = hash(i, j);
      if (mat === K.forest) for (let k = 0; k < 2; k++) spr(K_TREE, i + 0.3 + 0.4 * k, ym, j + 0.3 + 0.4 * hash(j, i + k), 0, 0, k ? DARK : DARK + DIM);
      else if (hh < 0.05 && (mat === K.plain || mat === K.sand)) { // a town: a few houses, a tower, lights that twinkle with the hats
        for (let k = 0; k < 3; k++) box(i + 0.3 + 0.2 * k, ym + 0.08, j + 0.35 + 0.25 * hash(i + k, j), 0.07, 0.08, 0.07, 6, FIX + HOT);
        box(i + 0.62, ym + 0.2, j + 0.7, 0.05, 0.2, 0.05, 5, FIX + COOL);
        if (f.beat.pulse > 0.4 || hash(i, Math.floor(t * 8)) < 0.3) spr(K_TOWN, i + 0.5, ym + 0.25, j + 0.5, 0, 0, BRIGHT, 3, -0.5);
      }
    }
    // the airship's shadow where the light drops it, the dragon's shadow on a drop
    const gy = (x, z) => elev(hAt(Math.floor(x), Math.floor(z))) - drop(x, z), ah = ay - gy(ax, az), sxp = ax - (C.Lx / C.Ly) * ah, szp = az - (C.Lz / C.Ly) * ah;
    shadow(sxp, gy(sxp, szp) + 0.02, szp, 0.5, 1.15, DARK, 2);
    if (w.dragon > 0) {
      const e = 1 - w.dragon / 3, dx = ax - 12 + 24 * e, dz = az + 7 - 4 * e, flap = Math.sin(t * 9) * 0.4, y0 = gy(dx, dz) + 0.03;
      for (const [x0, z0, x1, z1, x2, z2] of [[0, 1.6, -0.5, -1.4, 0.5, -1.4], [0, 0.4, -2.8, 0.2 + flap, -0.6, -0.6], [0, 0.4, 2.8, 0.2 + flap, 0.6, -0.6]]) {
        qv(0, dx + x0, y0, dz + z0); qv(1, dx + x1, y0, dz + z1); qv(2, dx + x2, y0, dz + z2); face(3, FIX + BLACK, PF | TWO, -1, 2, 0, 0, 1, 0);
      }
    }
    // the airship: an envelope, a gondola, fins, two propellers spinning with the treble, a lamp
    mPush(); mT(ax, ay, az); mRY(hd);
    mPush(); mT(0, 0.85, 0); mRX(Math.PI / 2); mS(0.62, 1.55, 0.62); mesh(ENVELOPE, 5.4); mPop();
    box(0, 0.12, 0.1, 0.2, 0.13, 0.5, 3, 4);
    box(0, 0.85, -1.4, 0.015, 0.3, 0.16, FIX + HOT); box(0, 0.85, -1.4, 0.3, 0.015, 0.16, FIX + HOT);
    for (let sd = -1; sd <= 1; sd += 2) { mPush(); mT(sd * 0.38, 0.12, -0.42); mRZ(f.rel.trebClock * 8 + t * 14); box(0, 0, 0, 0.3, 0.035, 0.012, FIX + LMID); mPop(); }
    box(0, 0.12, 0.62, 0.05, 0.05, 0.03, FIX + w.lamp);
    mPop();
    flush(r, W, mapSpr);
    if (toScr(ax, ay + 1.5, az)) { const tx = SX, ty = SY, sc = C.F / VZ; targets.push({ x: tx - 0.8 * sc, y: ty, w: 1.6 * sc, h: 1.6 * sc }); }
    if (w.bat > 0) { // the swirl: arms of black winding in from the edge until the screen is gone
      const e = clamp((w.batT - w.bat) / 0.5), buf = r.buf, pa = w.pa, pr = w.pr, rot = t * 2;
      for (let i = 0; i < N * N; i++) { const q = pa[i] / 256 * 3 + (1 - pr[i]) * 1.5 + rot; if (q - Math.floor(q) < e * 1.1) buf[i] = BLACK; }
    }
  },
};

// ---------------------------------------------------------------------------------------------- mechbay
// A boxy mech walking a desert, seen over its shoulder: a step on every beat, the stance foot planted where it
// landed while the body passes over it (two-bone legs by IK, knees forward or bird legs back), the body lowest at
// each footfall with a thud and a puff of dust. A kick fires a missile from the shoulder pod on a ballistic arc
// with a smoke trail, the hats a burst of tracers from the spinning gatling, a snare slides the lock-on brackets to
// the next target; enemy mechs walk in out of the fog. Ground: dunes (dithered), a salt flat (checks), a canyon
// (mesa walls). A drop fires the big cannon: a beam, a flash, a mushroom cloud of dithered puffs rising and slowing.
const MECH_W = { dunes: [2, 2, 2], flats: [2, 2, 1], canyon: [1, 2, 3] };
const groundY = (kind, x, z) => (kind === 'dunes' ? 0.6 * Math.sin(x * 0.3 + z * 0.15) + 0.4 * Math.sin(z * 0.23 - x * 0.1) : 0);
const GRAV = 9.8;

const mechbay = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, MECH_W, bandOf(W.a)), back: rnd() < 0.4, bt: 0, pbt: null, k: null, bz: 0, D: 1.6, feet: [{ x: -0.95, z: -0.8, from: -0.8, to: -0.8 }, { x: 0.95, z: 0.8, from: 0.8, to: 0.8 }],
      foes: [], missiles: [], tracers: [], smoke: [], sparks: [], lock: 0, rx: 0, ry: 0, rw: 0, rh: 0, fire: 0, spin: 0, beam: 0, mush: null, spawnT: 0.5 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s, t } = W, band = bandOf(W.a), kind = w.kind, gyAt = (x, z) => groundY(kind, x, z);
    const bt = beats(W), dbt = w.pbt === null ? 0 : clamp(bt - w.pbt, 0, 0.5), k = Math.floor(bt), p = bt - k;
    w.pbt = bt;
    if (f.section === 'change') w.kind = rollW(rnd, MECH_W, band);
    // the gait: the body moves a stride a beat; at each beat the foot behind swings to land half a stride ahead of
    // where the body will be when the next beat comes, so the one on the ground stays put
    const D = (w.D = follow(w.D, 1.3 + energy(f), dt, 1.5));
    if (w.k === null || Math.abs(k - w.k) > 1) { // (re)plant: the stance foot where this point of the step has it, the other mid-swing
      w.k = k;
      const F = w.feet[k & 1], G = w.feet[(k & 1) ^ 1];
      G.z = w.bz + D * (0.5 - p); F.from = w.bz - D * (0.5 + p); F.to = F.from + 2 * D;
    }
    if (k !== w.k) {
      w.k = k;
      const F = w.feet[k & 1], G = w.feet[(k & 1) ^ 1];
      F.from = F.z; F.to = w.bz + 1.5 * D;
      s.shake = Math.max(s.shake, 0.12);
      for (let i = 0; i < 3; i++) w.smoke.push(puff(G.x + (rnd() - 0.5), gyAt(G.x, G.z) + 0.2, G.z + (rnd() - 0.5), (rnd() - 0.5) * 2, 0.5, (rnd() - 0.5) * 2, 0.3, 0.7, 0.9, LMID, 0.6, 2.5));
    }
    w.bz += D * dbt;
    const SW = w.feet[k & 1];
    SW.z = lerp(SW.from, SW.to, easeIO(p));
    const fy = (F, sw) => gyAt(F.x, F.z) + (sw ? 0.55 * Math.sin(Math.PI * p) : 0);
    const hipY = (gyAt(-0.95, w.feet[0].z) + gyAt(0.95, w.feet[1].z)) / 2 + 2.75 + 0.12 * Math.sin(Math.PI * p);
    // the enemies walk in out of the fog
    w.spawnT -= dt;
    if (w.spawnT <= 0 && w.foes.filter((e) => !e.dead).length < 3) { w.spawnT = 2 + rnd() * 2; w.foes.push({ x: (rnd() < 0.5 ? -1 : 1) * (4 + rnd() * 8), z: w.bz + 43, hp: 2, ph: rnd() * TAU, dead: 0, flash: 0 }); }
    for (const e of w.foes) { if (!e.dead) { e.z -= 1.2 * dt; e.ph += dt * 4.6; } else e.dead += dt; e.flash -= dt; }
    w.foes = w.foes.filter((e) => e.z > w.bz - 6 && e.dead < 0.8);
    const live = w.foes.filter((e) => !e.dead), tgt = live.length ? live[w.lock % live.length] : null;
    const aim = (T) => (tgt ? [tgt.x, gyAt(tgt.x, tgt.z) + 1.5, tgt.z - 1.2 * T] : [-3, 0, w.bz + 22]); // led by the time of flight
    for (const h of hits) {
      if (isLow(h) && w.missiles.length < 6) { // a missile on a ballistic arc: v0 so that it meets the target after T
        const x0 = -1.62, y0 = hipY + 2.15, z0 = w.bz + 0.4, T = 1.3, [tx, ty, tz] = aim(T);
        w.missiles.push({ x0, y0, z0, x: x0, y: y0, z: z0, vx: (tx - x0) / T, vy: (ty - y0) / T + 0.5 * GRAV * T, vz: (tz - z0) / T, age: 0, T, tgt, sm: 0 });
      } else if (h.kind === 'hat') { // a burst from the gatling, straight at the target
        w.fire = 0.18;
        const x0 = 1.62, y0 = hipY + 0.85, z0 = w.bz + 1.85, [tx, ty, tz] = aim(0.3), d = Math.hypot(tx - x0, ty - y0, tz - z0) || 1;
        for (let i = 0; i < 3; i++) w.tracers.push({ x: x0, y: y0, z: z0 - i * 1.2, vx: ((tx - x0) / d) * 70, vy: ((ty - y0) / d) * 70, vz: ((tz - z0) / d) * 70, life: d / 70 + i * 0.017, tgt });
      } else if (h.kind === 'snare') w.lock++;
    }
    if (f.section === 'drop') { w.beam = 0.3; w.mush = { x: 2, z: w.bz + 34, e: 0 }; s.shake = 1; }
    w.fire -= dt; w.beam -= dt;
    w.spin += dt * (w.fire > 0 ? 40 : 2);
    // the view over the right shoulder, the desert sky, the haze
    look(5.4, hipY + 2.6, w.bz - 9.4, -0.5, hipY + 0.2, w.bz + 6, 0.95 * N, N / 2, 0.5 * N);
    backdrop(r, 2.6, 6.6, 4.6);
    begin(W, 22, 44, 4.6);
    light(0.45, 0.85, -0.35);
    // the ground: dithered dunes lit by their slope, or checks of a salt flat; rocks; the canyon's walls; it reaches
    // the fog on the left too, where the view looks across it
    for (let gz = Math.floor((w.bz - 9) / 4) * 4; gz < w.bz + 46; gz += 4) for (let gx = -40; gx < 24; gx += 4) {
      if (kind === 'dunes') {
        const lvAt = (x, z) => { const a = 0.3 * x + 0.15 * z, b = 0.23 * z - 0.1 * x, dx = 0.18 * Math.cos(a) - 0.04 * Math.cos(b), dz = 0.09 * Math.cos(a) + 0.092 * Math.cos(b), l = Math.hypot(dx, 1, dz); return 5.6 + 3 * ((-dx * C.Lx + C.Ly - dz * C.Lz) / l - 0.6); };
        qv(0, gx, gyAt(gx, gz), gz, lvAt(gx, gz)); qv(1, gx + 4, gyAt(gx + 4, gz), gz, lvAt(gx + 4, gz)); qv(2, gx + 4, gyAt(gx + 4, gz + 4), gz + 4, lvAt(gx + 4, gz + 4)); qv(3, gx, gyAt(gx, gz + 4), gz + 4, lvAt(gx, gz + 4));
        face(4, 0, PG | TWO, -1, 1);
      } else { qv(0, gx, 0, gz, gx * 0.5, gz * 0.5); qv(1, gx + 4, 0, gz, gx * 0.5 + 2, gz * 0.5); qv(2, gx + 4, 0, gz + 4, gx * 0.5 + 2, gz * 0.5 + 2); qv(3, gx, 0, gz + 4, gx * 0.5, gz * 0.5 + 2); face(4, kind === 'flats' ? 6.6 : 5.6, (kind === 'flats' ? PC : PS) | TWO, -2, 1, 0, 0, 1, 0); }
      const hh = hash(gx * 7 + 3, gz);
      if (hh < 0.1 && Math.abs(gx + 2) > 3) { const rs = 0.3 + hh * 5; box(gx + 2, gyAt(gx + 2, gz + 2) + rs * 0.5, gz + 2, rs, rs * 0.6, rs * 0.8, 3.2, 4.2); }
    }
    if (kind === 'canyon') for (let cz = Math.floor((w.bz - 8) / 8) * 8; cz < w.bz + 46; cz += 8) for (let sd = -1; sd <= 1; sd += 2) { const hh = 5 + hash(cz, sd + 5) * 6; box(sd * (17 + hash(cz, sd) * 3), hh / 2, cz + 4, 2.5, hh / 2, 4, 3.8, 5); }
    // the enemies: small walkers, legs swung from the hips (the body lowered by the swing, so the feet stay down); one
    // shot down topples over backward about its feet, faster as it goes, and lies on the sand
    for (const e of live.concat(w.foes.filter((q) => q.dead))) {
      const sw = e.dead ? 0 : 0.35 * Math.sin(e.ph), gy = gyAt(e.x, e.z) - 1.25 * (1 - Math.cos(sw)), fall = Math.min(Math.PI / 2, 4.5 * e.dead * e.dead);
      shadow(e.x - (C.Lx / C.Ly) * 1.2 * Math.cos(fall), gyAt(e.x, e.z) + 0.02, e.z - (C.Lz / C.Ly) * 1.2 * Math.cos(fall) + 1.2 * Math.sin(fall), 0.9, 0.7, DARK);
      mPush(); mT(e.x, gy + 0.33 * Math.sin(fall), e.z); mRY(Math.PI); mT(0, 0, -0.17); mRX(-fall); mT(0, 0, 0.17); // about the heels, coming to rest on its back
      for (let sd = -1; sd <= 1; sd += 2) { mPush(); mT(sd * 0.42, 1.3, 0); mRX(-sw * sd); box(0, -0.65, 0, 0.15, 0.65, 0.17, 2.6); mPop(); }
      const fl = e.flash > 0 || e.dead > 0 ? FIX + WHITE : 3.4;
      box(0, 1.7, 0, 0.62, 0.42, 0.5, e.flash > 0 || e.dead > 0 ? fl : 2.6, 3.6);
      box(0, 2.2, 0.22, 0.26, 0.14, 0.25, e.flash > 0 || e.dead > 0 ? fl : 2.2);
      box(0, 2.2, 0.48, 0.12, 0.05, 0.02, FIX + HOT);
      mPop();
    }
    // the mech: legs by IK to the feet, a hull, the pod, the gatling (its barrels spin while it fires), the cannon
    const shx = -(C.Lx / C.Ly) * 1.6, shz = w.bz - (C.Lz / C.Ly) * 1.6;
    shadow(shx, gyAt(shx, shz) + 0.02, shz, 1.6, 1.2, DARK); // on the sand where the light puts it (the body bobs, its shadow does not)
    mPush(); mT(0, 0, w.bz);
    for (let i = 0; i < 2; i++) {
      const F = w.feet[i], sw = (k & 1) === i, y = fy(F, sw), z = F.z - w.bz;
      leg(F.x, hipY, 0, y + 0.22, z, 1.6, 1.6, 0.22, 2.4, w.back);
      box(F.x, y + 0.11, z + 0.15, 0.34, 0.11, 0.58, 2, 3);
    }
    mT(0, hipY, 0);
    box(0, 0, 0, 1, 0.28, 0.65, 2.2);
    box(0, 1, 0.05, 1.3, 0.78, 1, 3.4, 4.4);
    box(0, 1.1, 1.06, 0.66, 0.22, 0.03, FIX + COOL, FIX + COOL, PS, COOL + DIM, 2.5);
    box(-1.62, 1.7, 0.05, 0.42, 0.4, 0.6, 2.8, 3.8, PC, DARK + DIM, 3);
    box(0, 2.05, -0.3, 0.18, 0.18, 1.35, 2.2, 3);
    box(1.62, 0.85, 0.3, 0.27, 0.27, 0.8, 2.8, 3.6);
    mPush(); mT(1.62, 0.85, 1.45); mRZ(w.spin); for (let b = 0; b < 3; b++) box(Math.cos((b * TAU) / 3) * 0.11, Math.sin((b * TAU) / 3) * 0.11, 0, 0.04, 0.04, 0.35, 1.8); mPop();
    if (w.fire > 0 && (t * 30) % 2 < 1) box(1.62, 0.85, 1.9, 0.14, 0.14, 0.06, FIX + WHITE);
    mPop();
    // missiles on their arcs (stepped exactly and no further than the time of flight, so one comes down on its aim at
    // any frame rate), a puff of smoke every fifteenth of a second where it was then, a shadow on the sand under the
    // light; where they come down, a blast and damage
    w.missiles = w.missiles.filter((m) => {
      const a0 = m.age;
      m.age = Math.min(m.T, m.age + dt);
      for (m.sm += (m.age - a0) * 15; m.sm >= 1; m.sm--) { const q = m.age - (m.sm - 1) / 15; w.smoke.push(puff(m.x0 + m.vx * q, m.y0 + (m.vy - 0.5 * GRAV * q) * q, m.z0 + m.vz * q, 0, 0.4, 0, 0.18, 0.5, 0.9, LMID, 0.7, 2)); }
      m.x = m.x0 + m.vx * m.age; m.y = m.y0 + (m.vy - 0.5 * GRAV * m.age) * m.age; m.z = m.z0 + m.vz * m.age;
      const mg = gyAt(m.x, m.z), mh = Math.max(0, m.y - mg);
      spr(K_DOT, m.x, m.y, m.z, 0.3, BRIGHT);
      spr(K_DOT, m.x - (C.Lx / C.Ly) * mh, mg + 0.03, m.z - (C.Lz / C.Ly) * mh, 0.3, DARK, 0, 2);
      if (m.age < m.T && m.y > mg) return true;
      for (let i = 0; i < 6; i++) w.smoke.push(puff(m.x, Math.max(m.y, gyAt(m.x, m.z)) + 0.3, m.z, (rnd() - 0.5) * 3, 1 + rnd() * 2, (rnd() - 0.5) * 3, 0.4, 1.2, 1, i < 3 ? HOT : MID, 0.85, 2.5));
      for (const e of live) if (Math.hypot(e.x - m.x, e.z - m.z) < 2.5) { e.flash = 0.15; if (--e.hp <= 0) e.dead = 0.01; }
      s.shake = Math.max(s.shake, 0.3);
      return false;
    });
    w.tracers = w.tracers.filter((q) => {
      q.life -= dt;
      const st = dt + Math.min(0, q.life); // no further than where it runs out: at the target
      q.x += q.vx * st; q.y += q.vy * st; q.z += q.vz * st;
      if (toScr(q.x - q.vx * 0.025, q.y - q.vy * 0.025, q.z - q.vz * 0.025)) spr(K_LINE, q.x, q.y, q.z, SX, SY, BRIGHT);
      if (q.life > 0) return true;
      burst3(w.sparks, rnd, q.x, q.y, q.z, 3, 2, HOT, 0.3, 1);
      if (q.tgt && !q.tgt.dead) q.tgt.flash = 0.08;
      return false;
    });
    // the mushroom: a stem of puffs shot up and slowing, then a cap rolling out from its top
    if (w.mush) {
      const M = w.mush, gy = gyAt(M.x, M.z);
      M.e += dt;
      if (M.e < 2.2) for (M.ps = (M.ps || 0) + dt * 15; M.ps >= 1; M.ps--) w.smoke.push(puff(M.x + (rnd() - 0.5), gy + 0.5, M.z + (rnd() - 0.5), 0, 9 * (1 - M.e / 2.6), 0, 1.2, 0.5, 5, M.e < 0.8 ? HOT : MID, 0.85, 0.9)); // fifteen a second
      if (M.e > 0.7 && M.e < 2.6) for (M.pc = (M.pc || 0) + dt * 60; M.pc >= 1; M.pc--) { const a = rnd() * TAU; w.smoke.push(puff(M.x, gy + 8.5, M.z, Math.cos(a) * 3, 0.8, Math.sin(a) * 3, 1.4, 0.6, 4, M.e < 1.4 ? HOT : LMID, 0.8, 0.9)); }
      if (M.e > 7) w.mush = null;
    }
    if (w.smoke.length > 140) w.smoke.splice(0, w.smoke.length - 140);
    w.smoke = puffs(W, w.smoke);
    w.sparks = parts3(W, w.sparks, 9, 0.08);
    flush(r, W);
    // the beam of the cannon and its flash; the lock-on brackets sliding to the target
    if (w.beam > 0 && w.mush && toScr(0, hipY + 2.05, w.bz + 1.1)) { const x0 = SX, y0 = SY; if (toScr(w.mush.x, gyAt(w.mush.x, w.mush.z) + 0.5, w.mush.z)) { r.stroke(x0, y0, SX, SY, 3 * u, WHITE); r.stroke(x0, y0, SX, SY, 1.2 * u, HOT); } if (w.beam > 0.24) r.fill(WHITE); }
    if (tgt && toScr(tgt.x, gyAt(tgt.x, tgt.z) + 2.5, tgt.z)) {
      const ty = SY, tx = SX;
      if (toScr(tgt.x, gyAt(tgt.x, tgt.z), tgt.z)) {
        const hgt = SY - ty, wd = hgt * 0.75, bl = Math.max(2, hgt * 0.25), lw = Math.max(1, u), c = f.beat.pulse > 0.5 ? BRIGHT : HOT;
        w.rx = follow(w.rx, tx - wd / 2, dt, 0.08); w.ry = follow(w.ry, ty, dt, 0.08); w.rw = follow(w.rw, wd, dt, 0.08); w.rh = follow(w.rh, hgt, dt, 0.08);
        for (const [cx, cy, dx, dy] of [[w.rx, w.ry, 1, 1], [w.rx + w.rw, w.ry, -1, 1], [w.rx, w.ry + w.rh, 1, -1], [w.rx + w.rw, w.ry + w.rh, -1, -1]]) { r.rect(dx > 0 ? cx : cx - bl, dy > 0 ? cy : cy - lw, bl, lw, c); r.rect(dx > 0 ? cx : cx - lw, dy > 0 ? cy : cy - bl, lw, bl, c); }
        targets.push({ x: w.rx, y: w.ry, w: w.rw, h: w.rh });
      }
    }
    if (toScr(0, hipY + 2.5, w.bz)) { const tx = SX, ty = SY, sc = C.F / VZ; targets.push({ x: tx - 1.6 * sc, y: ty, w: 3.2 * sc, h: (hipY + 2.5) * sc }); }
  },
};

// ---------------------------------------------------------------------------------------------- railgun
// A rail shooter: the camera glides on a fixed path down a low-poly station (checked floor, dithered walls, beams,
// pillars, lights, crates), at a speed that follows the energy. Figures pop up from behind the crates as we come
// near; a kick snaps the plain ring of the reticle onto the nearest and fires (a muzzle flash, the gun kicks back,
// the figure flashes and drops), a snare is a reload (the gun dips and tilts away and back), a note tints the
// panels, the hats flicker the lights. Routes: dock (open on one side to the dark water), reactor (glowing
// panels, pipes), cargo (stacks of crates). A drop raises a turret out of the floor ahead that tracks us and fires
// on the beat; the rail slows before it.
const ROUTE_W = { dock: [2, 2, 2], reactor: [1, 2, 3], cargo: [3, 2, 1] };
const K_FOE = 8, K_FLASH = 9, SEG = 4;
const railX = (z) => 1.1 * Math.sin(z * 0.07);
function railSpr(r, W, p) {
  if (p.k < 8) { common(r, W, p); return; }
  const s = p.sc, x = p.x, y = p.y;
  if (p.k === K_FOE) { // a figure from the waist up, a gun held across, lit white when shot
    const c = p.b > 0 ? WHITE : fogC(FIG, p.q), lw = Math.max(1, 0.12 * s);
    r.rect(x - 0.28 * s, y - 0.95 * s, 0.56 * s, 0.95 * s, c);
    r.rect(x - 0.15 * s, y - 1.3 * s, 0.3 * s, 0.3 * s, c);
    r.rect(x - 0.1 * s, y - 1.2 * s, 0.2 * s, Math.max(1, 0.06 * s), p.b > 0 ? WHITE : HOT);
    r.stroke(x - 0.45 * s, y - 0.55 * s, x + 0.35 * s, y - 0.7 * s, lw * 1.4, p.b > 0 ? WHITE : fogC(DARK, p.q));
  } else { const R = p.a * s; r.poly([[x, y - R], [x + R * 0.3, y - R * 0.3], [x + R, y], [x + R * 0.3, y + R * 0.3], [x, y + R], [x - R * 0.3, y + R * 0.3], [x - R, y], [x - R * 0.3, y - R * 0.3]], WHITE); r.disc(x, y, R * 0.35, BRIGHT); }
}

const railgun = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, ROUTE_W, bandOf(W.a)), z: 0, v: 3, foes: new Map(), rx: N / 2, ry: N / 2, tx: N / 2, ty: N / 2, rr: 4, kick: 0, reload: 0, flash: 0, tint: COOL, boss: null, puffs: [], sparks: [] });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s, t } = W, band = bandOf(W.a), kind = w.kind;
    if (f.section === 'change') w.kind = rollW(rnd, ROUTE_W, band);
    if (f.section === 'drop' && !w.boss) w.boss = { z: w.z + 15, up: 0, t: 0, hp: 10, flash: 0, dead: 0 };
    // the rail: on at the energy's speed, slowing before the turret
    w.v = follow(w.v, 2.2 + 4.5 * energy(f), dt, 0.8);
    let v = w.v;
    if (w.boss) v = Math.min(v, Math.max(0, (w.boss.z - 7.5 - w.z) * 1.5));
    w.z += v * dt;
    const cz = w.z, cx = railX(cz), cy = 1.6 + 0.08 * Math.sin(cz * 0.9), yaw = Math.atan(1.1 * 0.07 * Math.cos(cz * 0.07)) + 0.1 * Math.sin(t * 0.4);
    cam(cx, cy, cz, yaw, 0.04, 0.95 * N, N / 2, N / 2);
    r.fill(BLACK);
    begin(W, 10, 26, 0.6);
    light(-0.3, 1, -0.4);
    // the station, a segment at a time: floor, walls, roof, beams, pillars, lights, crates, and who hides behind them
    const j0 = Math.floor(cz / SEG) - 1, flick = f.rel.trebDrive > 0.6 && hash(Math.floor(t * 15), 1) < 0.3, panel = kind === 'reactor';
    const live = [];
    for (let j = j0; j < j0 + 9; j++) {
      const z0 = j * SEG, z1 = z0 + SEG;
      qv(0, -4.5, 0, z0, 0, z0 * 0.5); qv(1, 4.5, 0, z0, 4, z0 * 0.5); qv(2, 4.5, 0, z1, 4, z1 * 0.5); qv(3, -4.5, 0, z1, 0, z1 * 0.5); face(4, kind === 'cargo' ? 3.6 : 4.4, PC, -2, 1, 0, 0, 1, 0);
      for (let sd = -1; sd <= 1; sd += 2) {
        if (kind === 'dock' && sd > 0) { // a rail, and below it the dark water running in bands
          box(4.4, 1, z0 + 2, 0.04, 0.04, 2, FIX + LMID); box(4.4, 0.5, z0, 0.04, 0.5, 0.04, FIX + LMID);
          qv(0, 4.5, -0.9, z0, z0 * 0.6 + t * 0.3); qv(1, 40, -0.9, z0, z0 * 0.6 + t * 0.3); qv(2, 40, -0.9, z1, z1 * 0.6 + t * 0.3); qv(3, 4.5, -0.9, z1, z1 * 0.6 + t * 0.3);
          face(4, FIX + DARK, PS, COOL + DIM, 1, 0, 0, 1, 0);
          continue;
        }
        qv(0, sd * 4.5, 0, z0, 1.2); qv(1, sd * 4.5, 0, z1, 1.2); qv(2, sd * 4.5, 4.2, z1, 3.4); qv(3, sd * 4.5, 4.2, z0, 3.4); face(4, 0, PG, -1, 1, 0, -sd, 0, 0);
        if (panel) { qv(0, sd * 4.48, 1.4, z0, 0); qv(1, sd * 4.48, 1.4, z1, 3); qv(2, sd * 4.48, 2.2, z1, 3); qv(3, sd * 4.48, 2.2, z0, 0); face(4, FIX + w.tint, PS, w.tint + DIM, 1, -0.5, -sd, 0, 0); box(sd * 4.3, 3.3, z0 + 2, 0.1, 0.1, 2, 2.6); }
        box(sd * 4.25, 2.1, z0, 0.25, 2.1, 0.25, 2.6, 3.4);
      }
      qv(0, -4.5, 4.2, z0, 1); qv(1, 4.5, 4.2, z0, 1); qv(2, 4.5, 4.2, z1, 1); qv(3, -4.5, 4.2, z1, 1); face(4, 0, PG, -1, 1, 0, 0, -1, 0);
      box(0, 4, z0, 4.5, 0.2, 0.2, 2.4);
      if (j % 2 === 0) box(0, 3.92, z0 + 2, 0.8, 0.06, 0.3, FIX + (flick ? LMID + DIM : f.beat.pulse > 0.5 ? WHITE : BRIGHT));
      const nc = kind === 'cargo' ? 2 : 1;
      for (let c = 0; c < nc; c++) {
        const hx = hash(j * 3 + c, 11), side = hx < 0.5 ? -1 : 1, x = side * (2.2 + 1.3 * hash(j, c + 21)), z = z0 + 1 + 2 * hash(j, c + 31), sz = 0.55 + 0.3 * hash(j, c + 41);
        if (Math.abs(x - railX(z)) < 1.5) continue;
        box(x, sz, z, sz, sz, sz, 4.6, 5.4, PS, -2, 1.2);
        if (hash(j, c + 51) < 0.4) box(x + 0.1, 2 * sz + sz * 0.6, z, sz * 0.6, sz * 0.6, sz * 0.6, 4, 5, PS, -2, 1.2);
        if (c === 0 && hash(j, 61) < 0.55) { // someone hides behind this crate: up as we come near, down when shot
          let q = w.foes.get(j);
          if (!q) { q = { j, x: x + (rnd() - 0.5) * 0.4, z: z + sz + 0.35, h: 2 * sz - 1, up: 0, dead: 0 }; w.foes.set(j, q); }
          const near = q.z - cz < 15 && q.z > cz + 2;
          if (!q.dead) q.up = Math.min(1, q.up + (near ? dt / 0.25 : 0));
          else q.dead += dt;
          const y = q.h + q.up * 1.3 - (q.dead > 0 ? 4 * q.dead * q.dead : 0);
          if (q.up > 0 && q.dead < 0.6) spr(K_FOE, q.x, y, q.z, 0, q.dead > 0 && q.dead < 0.15 ? 1 : 0);
          if (q.up > 0.8 && !q.dead) live.push(q);
        }
      }
    }
    for (const [j] of w.foes) if (j < j0) w.foes.delete(j);
    // the turret: up out of the floor, the head turning to us, the barrels firing on the beat
    const B = w.boss;
    if (B) {
      B.t += dt; B.flash -= dt;
      B.up = B.dead > 0 ? Math.max(0, B.up - dt / 1.2) : Math.min(1, B.t / 1.5);
      if (B.dead > 0) B.dead += dt;
      if (B.t > 9 && !B.dead) B.dead = 0.01;
      if (B.dead > 1.4) w.boss = null;
      const by = -3.3 * (1 - ease(B.up)), aimY = Math.atan2(cx - railX(B.z), cz - B.z), fire = !B.dead && B.up >= 1 && f.beat.pulse > 0.7;
      C.clipY = 0; // it comes up through the floor: what is still under it is not drawn
      mPush(); mT(railX(B.z), by, B.z);
      mPush(); mS(1.5, 2.2, 1.5); mT(0, 0.25, 0); mesh(DISC, 3.2); mPop();
      mRY(aimY);
      const hm = B.flash > 0 ? FIX + WHITE : 4.4;
      box(0, 1.55, 0, 0.9, 0.45, 0.8, hm, 5.2);
      box(0, 1.55, 0.82, 0.5, 0.18, 0.04, FIX + HOT);
      for (let sd = -1; sd <= 1; sd += 2) { box(sd * 0.45, 1.5, 1.3, 0.1, 0.1, 0.6, 2.4); if (fire) spr(K_FLASH, railX(B.z) + Math.sin(aimY) * 1.9 + Math.cos(aimY) * sd * 0.45, by + 1.5, B.z + Math.cos(aimY) * 1.9 - Math.sin(aimY) * sd * 0.45, 0.35); }
      mPop();
      C.clipY = NaN;
      if (fire) s.shake = Math.max(s.shake, 0.15);
      if (B.up >= 1 && !B.dead) live.unshift(B);
    }
    // the shots: a kick snaps the ring to the nearest figure up (or the turret) and fires; a snare reloads
    for (const h of hits) {
      if ((isLow(h) || h.kind === 'perc') && w.reload <= 0 && w.kick < 0.5) {
        w.kick = 1; w.flash = 0.06;
        const q = live.find((e) => e === B || (e.z - cz > 2.5 && toScr(e.x, e.h + 1.8, e.z) && SX > 0 && SX < N));
        if (q === B && B) { if (toScr(railX(B.z), 1.6, B.z)) { w.tx = SX; w.ty = SY; } B.flash = 0.08; burst3(w.sparks, rnd, railX(B.z), 1.8, B.z - 0.8, 6, 2, HOT, 0.4, 1); if (--B.hp <= 0) { B.dead = 0.01; for (let i = 0; i < 10; i++) w.puffs.push(puff(railX(B.z) + (rnd() - 0.5) * 2, 1.5, B.z, (rnd() - 0.5) * 2, 1 + rnd(), (rnd() - 0.5) * 2, 0.5, 1, 1.4, i < 4 ? HOT : MID, 0.8, 1.5)); } }
        else if (q) { toScr(q.x, q.h + 1.8, q.z); w.tx = SX; w.ty = SY; q.dead = 0.01; burst3(w.sparks, rnd, q.x, q.h + 1.6, q.z, 6, 1.6, BRIGHT, 0.4, 0.5); }
        else { w.tx = N * (0.3 + 0.4 * rnd()); w.ty = N * (0.35 + 0.2 * rnd()); }
      } else if (h.kind === 'snare' && w.reload <= 0) w.reload = 0.55;
      else if (isTonal(h)) w.tint = h.pc % 2 ? HOT : COOL;
    }
    w.kick *= Math.exp(-dt * 10); w.flash -= dt; w.reload -= dt;
    w.puffs = puffs(W, w.puffs);
    w.sparks = parts3(W, w.sparks, 6, 0.06);
    flush(r, W, railSpr);
    // the gun, in the camera's own space after the world: it kicks back on a shot, dips and tilts on a reload
    const re = w.reload > 0 ? Math.sin((Math.PI * (0.55 - w.reload)) / 0.55) : 0;
    cam(0, 0, 0, 0, 0, 0.95 * N, N / 2, N / 2);
    C.fogF = 100; C.fogN = 90;
    mId(); mT(0.42, -0.42 - 0.16 * re, 0.95 - 0.08 * w.kick); mRX(0.6 * re - 0.12 * w.kick); mRY(-0.12);
    box(0, 0, 0, 0.09, 0.1, 0.34, 3.4, 4.6);
    box(0, 0.04, 0.42, 0.045, 0.045, 0.14, 2.2);
    box(0, -0.18, -0.12, 0.06, 0.14, 0.07, 2.6);
    box(0, 0.12, -0.05, 0.03, 0.03, 0.08, FIX + HOT);
    flush(r, W);
    if (w.flash > 0 && w.reload <= 0) { // the muzzle flash at the end of the barrel
      mId(); mT(0.42, -0.42, 0.95); mRY(-0.12); xf(0, 0.04, 0.6);
      if (WZ > NEAR) { const fx = C.hx + (WX * C.F) / WZ, fy = C.hy - (WY * C.F) / WZ, R = 7 * u; r.poly([[fx, fy - R], [fx + R * 0.3, fy - R * 0.3], [fx + R, fy], [fx + R * 0.3, fy + R * 0.3], [fx, fy + R], [fx - R * 0.3, fy + R * 0.3], [fx - R, fy], [fx - R * 0.3, fy - R * 0.3]], WHITE); r.disc(fx, fy, R * 0.4, BRIGHT); }
    }
    // the reticle: a plain ring that jumps to where the shot went and drifts back toward the middle
    w.rx = follow(w.rx, w.tx, dt, 0.04); w.ry = follow(w.ry, w.ty, dt, 0.04);
    w.tx = follow(w.tx, N / 2, dt, 1.2); w.ty = follow(w.ty, N * 0.45, dt, 1.2);
    w.rr = follow(w.rr, (4 + 3 * w.kick) * u, dt, 0.05);
    r.ring(w.rx, w.ry, w.rr, Math.max(1, u), w.kick > 0.5 ? HOT : BRIGHT);
    targets.push({ x: w.rx - w.rr, y: w.ry - w.rr, w: 2 * w.rr, h: 2 * w.rr });
  },
};

// ---------------------------------------------------------------------------------------------- snowslope
// A snowboard run from behind: the slope is a strip of quads with moguls, lit per corner and dithered, falling away
// downhill; the rider weaves through gates of two poles (it steers for the next one, leaning into the turn), at a
// speed that follows the energy. A snare carves the turn hard with a spray of snow off the edge, a kick launches a
// jump (a parabola under gravity while the slope drops away below, a grab that tilts the board, a landing spray),
// pines stand by the run as billboards and pop in at the fog. Runs: groomed, powder (snowfall, more spray, more
// trees), night (lamp posts). A drop puts a cliff ahead: off the edge on a long parabola, down to the slope below.
const RUN_W = { groomed: [3, 2, 2], powder: [1, 2, 3], night: [2, 2, 1] };
const TS = 0.32, K_PINE = 8;
function slopeY(w, x, z) {
  let y = -z * TS + 0.14 * Math.sin(x * 1.1 + z * 0.7) + 0.09 * Math.sin(z * 1.7 - x * 0.6) - w.drop0;
  for (const c of w.cliffs) y -= c.h * clamp((z - c.z) / 0.7);
  return y;
}
function snowSpr(r, W, p) {
  if (p.k < 8) { common(r, W, p); return; }
  const s = p.sc, x = p.x, y = p.y, c = fogC(p.c, p.q);
  for (let k = 0; k < 3; k++) { const ty = y - (1.1 + k * 0.75) * s, bw = (0.9 - k * 0.22) * s; r.poly([[x, ty - 0.9 * s], [x + bw, ty + 0.25 * s], [x - bw, ty + 0.25 * s]], c); }
  r.rect(x - Math.max(0.5, 0.1 * s), y - 1.1 * s, Math.max(1, 0.2 * s), 1.1 * s, fogC(DARK + DIM, p.q));
  if (p.b) r.rect(x - 0.6 * s, y - 2.6 * s, 1.2 * s, Math.max(1, 0.12 * s), fogC(BRIGHT, p.q)); // snow on the boughs
}

const snowslope = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, RUN_W, bandOf(W.a)), x: 0, y: 0, z: 0, vx: 0, vy: 0, air: false, airT: 0, v: 8, cliffs: [], drop0: 0, spray: [], gph: rnd() * 10, cx: 0, cy: 3, cz: -6, flakes: Array.from({ length: 50 }, () => [rnd(), rnd(), rnd()]), flag: 0 });
    w.y = slopeY(w, 0, 0);
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s, t } = W, band = bandOf(W.a);
    const gateX = (g) => (g & 1 ? 1 : -1) * (2.2 + 1.2 * hash(g, 7)), gateZ = (g) => g * 14 + 7;
    for (const h of hits) {
      if (isLow(h) && !w.air && w.cliffs.every((c) => w.z > c.z + 1 || w.z < c.z - 6)) { w.air = true; w.airT = 0; w.vy = 3.8 + 2.4 * h.strength; burst3(w.spray, rnd, w.x, w.y + 0.1, w.z, 8, 1.6, BRIGHT, 0.5, 0.8); }
      else if (h.kind === 'snare' && !w.air) { const g = Math.floor((w.z - 7) / 14) + 1; w.vx += Math.sign(gateX(g) - w.x || 1) * 2.4 * h.strength; burst3(w.spray, rnd, w.x - Math.sign(w.vx) * 0.3, w.y + 0.15, w.z, 14 + (w.kind === 'powder' ? 12 : 0), 2.4, WHITE, 0.7, 1.4); }
      else if (isTonal(h)) w.flag = h.pc % 2 ? 1 : 0;
    }
    if (f.section === 'change') w.kind = rollW(rnd, RUN_W, band);
    if (f.section === 'drop' && !w.cliffs.some((c) => c.z > w.z - 4)) w.cliffs.push({ z: w.z + 8, h: 9 });
    while (w.cliffs.length && w.cliffs[0].z < w.z - 40) w.drop0 += w.cliffs.shift().h; // folded into the base once far behind
    // the ride: down the fall line at the energy's speed, steering for the next gate on a spring
    w.v = follow(w.v, 6 + 10 * energy(f), dt, 1.2);
    w.z += w.v * dt;
    const g = Math.floor((w.z - 7 + 1) / 14) + 1, tx = gateX(g);
    w.vx += ((tx - w.x) * 2.6 - w.vx * 1.6) * dt;
    w.x += w.vx * dt;
    const gy = slopeY(w, w.x, w.z);
    if (w.air) { w.y += (w.vy - 8 * dt) * dt; w.vy -= 16 * dt; w.airT += dt; if (w.y <= gy) { w.y = gy; w.air = false; burst3(w.spray, rnd, w.x, gy + 0.1, w.z, 10, 2, WHITE, 0.6, 1); s.shake = Math.max(s.shake, 0.2); } }
    else if (gy < w.y - 0.4) { w.air = true; w.airT = 0; w.vy = -TS * w.v; } // the ground fell away: off the edge, carrying the slope's own fall
    else w.y = gy;
    // the camera behind and above, lagging down a drop
    w.cx = follow(w.cx, w.x * 0.6, dt, 0.4); w.cy = follow(w.cy, w.y + 2.1, dt, 0.35); w.cz = w.z - 4.6;
    look(w.cx, w.cy, w.cz, w.x * 0.85, w.y - 0.3, w.z + 4, 0.95 * N, N / 2, 0.45 * N);
    const night = w.kind === 'night';
    dgrad(r, 0, N, night ? 0.4 : 4.4, night ? 2 : 7);
    begin(W, 16, 34, night ? 1 : 6);
    light(0.35, 1, 0.5);
    // the slope: rows of quads lit per corner by the moguls' slope, sorted in the order of the run, wide enough that it
    // runs into the fog at the sides too
    const base = night ? 3.6 : 6.4, lvAt = (x, z) => { const dx = 0.154 * Math.cos(x * 1.1 + z * 0.7) - 0.054 * Math.cos(z * 1.7 - x * 0.6), dz = 0.098 * Math.cos(x * 1.1 + z * 0.7) + 0.153 * Math.cos(z * 1.7 - x * 0.6); return base + 4 * (-dx * C.Lx - dz * C.Lz); };
    for (let z0 = Math.floor((w.z - 7) / 2) * 2; z0 < w.z + 36; z0 += 2) {
      ZK = z0 + 2 - w.cz;
      for (let x0 = -24; x0 < 24; x0 += 3) {
        qv(0, x0, slopeY(w, x0, z0), z0, lvAt(x0, z0)); qv(1, x0 + 3, slopeY(w, x0 + 3, z0), z0, lvAt(x0 + 3, z0));
        qv(2, x0 + 3, slopeY(w, x0 + 3, z0 + 2), z0 + 2, lvAt(x0 + 3, z0 + 2)); qv(3, x0, slopeY(w, x0, z0 + 2), z0 + 2, lvAt(x0, z0 + 2));
        face(4, 0, PG | TWO, -1, 3, 0.3);
      }
    }
    // gates, pines, lamps at their spots down the run
    for (let gg = Math.floor((w.z - 7) / 14); gateZ(gg) < w.z + 36; gg++) {
      const z = gateZ(gg), cxg = gateX(gg), c = (gg + w.flag) & 1 ? HOT : COOL, flap = 0.12 * Math.sin(t * 9 + gg) + 0.15 * f.beat.pulse;
      if (z < w.z - 6) continue;
      ZK = z - w.cz;
      for (let sd = -1; sd <= 1; sd += 2) {
        const px = cxg + sd * 1.3, py = slopeY(w, px, z);
        box(px, py + 0.9, z, 0.05, 0.9, 0.05, FIX + c);
        qv(0, px, py + 1.75, z); qv(1, px - sd * 0.55, py + 1.65 + flap, z + 0.1); qv(2, px - sd * 0.55, py + 1.25 + flap, z + 0.1); qv(3, px, py + 1.3, z); face(4, FIX + c, PF | TWO, -1, 3);
      }
    }
    const pz0 = Math.floor((w.z - 6) / 3) * 3, dense = w.kind === 'powder' ? 0.75 : 0.45;
    for (let pz = pz0; pz < w.z + 36; pz += 3) for (let sd = -1; sd <= 1; sd += 2) {
      if (hash(pz, sd + 3) > dense) continue;
      const px = sd * (6 + 5 * hash(pz, sd + 9));
      ZK = pz - w.cz;
      spr(K_PINE, px, slopeY(w, px, pz), pz, 0, w.kind === 'night' ? 0 : 1, hash(pz, sd) < 0.5 ? DARK : DARK + DIM);
      if (night && hash(pz, sd + 17) < 0.12) { const ly = slopeY(w, px - sd * 2, pz); box(px - sd * 2, ly + 1.6, pz, 0.06, 1.6, 0.06, 2); box(px - sd * 2, ly + 3.2, pz, 0.2, 0.06, 0.12, FIX + BRIGHT); spr(K_PUFF, px - sd * 2, ly + 3, pz, 1.2, BRIGHT, 0.25); }
    }
    // the rider's shadow on the slope under it, smaller the higher it flies, then the rider
    const hgt = w.y - gy, sk = 1 / (1 + 0.25 * hgt), sl = Math.atan(TS);
    ZK = w.z - w.cz - 1.2;
    const ox = w.x - (C.Lx / C.Ly) * hgt, oz = w.z - (C.Lz / C.Ly) * hgt;
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, x = ox + Math.cos(a) * 0.4 * sk, z = oz - Math.sin(a) * 0.9 * sk; qv(k, x, slopeY(w, x, z) + 0.03, z); }
    face(8, FIX + (night ? DARK + DIM : LMID), PF | TWO, -1, 3);
    ZK = w.z - w.cz - 1.4;
    const yaw = Math.atan2(w.vx, w.v), lean = clamp(-w.vx * 0.12, -0.5, 0.5), grab = w.air ? Math.sin(Math.min(Math.PI, w.airT * 3)) : 0;
    mPush(); mT(w.x, w.y, w.z); mRY(yaw); mRX(w.air ? -0.1 + 0.3 * grab : sl); mRZ(lean + 0.5 * grab);
    box(0, 0.04, 0, 0.17, 0.03, 0.82, FIX + HOT, FIX + HOT);
    mRY(-1.1); // the stance across the board, turned a little toward the fall line
    const hipY = 0.7 - 0.18 * grab;
    for (let sd = -1; sd <= 1; sd += 2) leg(sd * 0.22, hipY, 0, 0.1, 0.05, 0.42, 0.42, 0.07, 3);
    mT(0, hipY, 0); mRX(0.2 + 0.3 * grab);
    box(0, 0.28, 0, 0.2, 0.28, 0.12, 5.2, 6);
    box(0, 0.7, 0.03, 0.11, 0.12, 0.11, 6.4);
    for (let sd = -1; sd <= 1; sd += 2) { mPush(); mT(sd * 0.24, 0.48, 0); mRZ(sd * (grab > 0.3 && sd > 0 ? 0.3 : 1.15)); mRX(grab > 0.3 && sd > 0 ? -1.2 : 0); box(0, -0.25, 0, 0.055, 0.25, 0.055, 5.2); mPop(); }
    mPop();
    w.spray = parts3(W, w.spray, 9, 0.07, (x, z) => slopeY(w, x, z)); // it lands on the snow, never through it
    flush(r, W, snowSpr);
    if (w.kind !== 'groomed') for (const fl of w.flakes) r.rect(((fl[0] + Math.sin(t * 0.7 + fl[2] * 6) * 0.02) % 1) * N, ((fl[1] + t * (0.08 + 0.1 * fl[2])) % 1) * N, Math.max(1, u * (fl[2] < 0.3 ? 2 : 1)), Math.max(1, u), night ? LMID : WHITE);
    if (toScr(w.x, w.y + 1.4, w.z)) { const tx = SX, ty = SY, sc = C.F / VZ; targets.push({ x: tx - 0.6 * sc, y: ty, w: 1.2 * sc, h: 1.4 * sc }); }
  },
};

// ---------------------------------------------------------------------------------------------- tacticsgrid
// An isometric tactics map: columns of cubes at different heights in a true parallel view (each column painted as
// one, back to front, the way the grids of the day were), units of two sides that each move one tile a bar
// toward the other side, hopping up and down the levels on a parabola; a cursor tile blinks on the beat over the
// one whose turn it is. A kick is its attack: a slash over the target, a flash, plain bars rising off it where the
// numbers would be; a snare hands the turn on, a note rings a circle on a tile, water runs with the bass. A
// section turns the whole map a quarter round and repaints its ground. Terrain: meadow (water), ruins (pillars),
// desert. A drop summons a great winged creature down onto the middle of the map.
const TERRAIN_W = { meadow: [3, 2, 1], ruins: [1, 2, 3], desert: [2, 2, 2] };
const TERRAINS = { meadow: { top: 5.2, side: 3, water: 0.16, tall: 0 }, ruins: { top: 4.3, side: 3.2, water: 0, tall: 0.12 }, desert: { top: 6.2, side: 4.4, water: 0.04, tall: 0.03 } };
const G8 = 8, K_SLASH = 8, K_BAR = 9;
function newMap(w, rnd) {
  const T = TERRAINS[w.kind], b = Array.from({ length: 9 }, () => rnd());
  w.lv = new Uint8Array(G8 * G8); w.wet = new Uint8Array(G8 * G8);
  for (let j = 0; j < G8; j++) for (let i = 0; i < G8; i++) {
    const n = 0.5 + 0.25 * Math.sin(i * 0.9 + b[0] * 6) + 0.25 * Math.sin(j * 0.8 + b[1] * 6) + 0.2 * (b[2 + ((i * 3 + j) % 7)] - 0.5), k = j * G8 + i;
    w.lv[k] = 1 + Math.floor(clamp(n) * 3.99);
    if (w.lv[k] === 1 && rnd() < T.water * 4) w.wet[k] = 1;
    if (rnd() < T.tall) w.lv[k] = 7;
  }
}
const tileTop = (w, i, j) => 0.5 * w.lv[clamp(j, 0, G8 - 1) * G8 + clamp(i, 0, G8 - 1)] - (w.wet[j * G8 + i] ? 0.15 : 0);
function tactSpr(r, W, p) {
  if (p.k < 8) { common(r, W, p); return; }
  const s = p.sc, x = p.x, y = p.y;
  if (p.k === K_SLASH) { for (let k = 0; k < 7; k++) { const a0 = -0.9 + k * 0.28 + p.a * 2, R = 0.55 * s; r.stroke(x + Math.cos(a0) * R, y + Math.sin(a0) * R * 0.8 - 0.4 * s, x + Math.cos(a0 + 0.28) * R, y + Math.sin(a0 + 0.28) * R * 0.8 - 0.4 * s, Math.max(1, 0.08 * s * (k < 4 ? k + 1 : 7 - k)), WHITE); } }
  else r.rect(x - 0.05 * s, y - p.a * s, Math.max(1, 0.1 * s), p.a * s, p.c);
}

const tacticsgrid = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, TERRAIN_W, bandOf(W.a)), yaw: Math.PI / 4, yaw0: Math.PI / 4, yawT: Math.PI / 4, turn: 1, act: 0, lastBar: null, fx: [], bars: [], rings: [], summon: null,
      units: [[1, 1, 0], [2, 0, 0], [6, 6, 1], [5, 7, 1]].map(([i, j, team]) => ({ i, j, fi: i, fj: j, e: 1, team, flash: 0, hit: 0 })) });
    newMap(w, rnd);
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s, t } = W, band = bandOf(W.a), T = TERRAINS[w.kind];
    const bt = beats(W), bar = Math.floor(bt / 4);
    const at = (q) => { const e = clamp(q.e), x = lerp(q.fi, q.i, e), z = lerp(q.fj, q.j, e), y0 = tileTop(w, q.fi, q.fj), y1 = tileTop(w, q.i, q.j); return [x, lerp(y0, y1, e) + (q.e < 1 ? 4 * (0.35 + 0.5 * Math.abs(y1 - y0)) * e * (1 - e) : 0), z]; };
    if (f.section === 'change') { w.yaw0 = w.yaw; w.yawT += Math.PI / 2; w.turn = 0; w.kind = rollW(rnd, TERRAIN_W, band); } // the ground keeps its shape (the units stand on it), the terrain its new colours
    if (f.section === 'drop' && !w.summon) { // it comes down over the middle with its belly clear of the tallest tile there
      let top = 0;
      for (let j = 0; j < G8; j++) for (let i = 0; i < G8; i++) if (Math.hypot(i - (G8 / 2 - 0.5), j - (G8 / 2 - 0.5)) < 3.2) top = Math.max(top, tileTop(w, i, j));
      w.summon = { t: 0, land: Math.max(2.6, top + 1.1), rg: 0 };
    }
    // each bar every unit takes a step toward the nearest of the other side, unless it is already next to one
    if (w.lastBar === null) w.lastBar = bar;
    if (bar !== w.lastBar) {
      w.lastBar = bar;
      for (const q of w.units) {
        const foes = w.units.filter((o) => o.team !== q.team), o = foes.reduce((a, b) => (Math.abs(b.i - q.i) + Math.abs(b.j - q.j) < Math.abs(a.i - q.i) + Math.abs(a.j - q.j) ? b : a));
        if (Math.abs(o.i - q.i) + Math.abs(o.j - q.j) <= 1) continue;
        const di = Math.sign(o.i - q.i), dj = Math.sign(o.j - q.j), [ni, nj] = Math.abs(o.i - q.i) >= Math.abs(o.j - q.j) ? [q.i + di, q.j] : [q.i, q.j + dj];
        if (w.units.some((x) => x.i === ni && x.j === nj)) continue;
        q.fi = q.i; q.fj = q.j; q.i = ni; q.j = nj; q.e = 0;
      }
    }
    for (const q of w.units) { q.e = Math.min(1, q.e + (dt * bpsOf(f)) / 0.6); q.flash -= dt; }
    const A = w.units[w.act % w.units.length];
    for (const h of hits) {
      if (isLow(h)) { // the attack: on the nearest of the other side; a slash, a flash, bars rising off it
        const o = w.units.filter((x) => x.team !== A.team).reduce((a, b) => (Math.abs(b.i - A.i) + Math.abs(b.j - A.j) < Math.abs(a.i - A.i) + Math.abs(a.j - A.j) ? b : a));
        const [ox, oy, oz] = at(o);
        o.flash = 0.12; w.fx.push({ x: ox, y: oy + 0.8, z: oz, life: 0.25, a: rnd() });
        for (let k = 0; k < 3; k++) w.bars.push({ x: ox + (k - 1) * 0.18, y: oy + 1, z: oz, vy: 2.4 - k * 0.4, life: 0.9, h: 0.15 + 0.1 * h.strength * (k + 1), c: A.team ? COOL : HOT });
        s.shake = Math.max(s.shake, 0.2 * h.strength);
      } else if (h.kind === 'snare') w.act++;
      else if (isTonal(h)) w.rings.push({ i: Math.floor(rnd() * G8), j: Math.floor(rnd() * G8), life: 1, c: h.pc % 2 ? HOT : COOL });
    }
    // the view: parallel, a quarter turn per section, eased from rest to rest so it lands on the quarter exactly
    w.turn = Math.min(1, w.turn + dt / 0.9);
    w.yaw = w.turn >= 1 ? w.yawT : lerp(w.yaw0, w.yawT, easeIO(w.turn));
    const pitch = 0.62, cy = Math.cos(w.yaw), sy = Math.sin(w.yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), mx = G8 / 2 - 0.5, D = 60;
    dgrad(r, 0, N, 1, 3.6);
    begin(W, 1000, 2000, 1);
    cam(mx - sy * cp * D, 1 + sp * D, mx - cy * cp * D, w.yaw, pitch, (N / 12.5) * (1 + 0.04 * energy(f)), N / 2, 0.55 * N);
    C.ortho = 1;
    light(-0.5, 1, -0.3);
    const zk = (x, y, z) => { view(x, y, z); return VZ; };
    // the columns, each as one piece at the depth of its foot; water runs with the bass
    for (let j = 0; j < G8; j++) for (let i = 0; i < G8; i++) {
      const k = j * G8 + i, top = tileTop(w, i, j);
      ZK = zk(i, 0, j);
      if (w.wet[k]) { box(i, top / 2, j, 0.5, top / 2, 0.5, T.side - 0.6, T.side); const wv = f.rel.bassClock * 0.5; qv(0, i - 0.5, top + 0.001, j - 0.5, j + wv); qv(1, i + 0.5, top + 0.001, j - 0.5, j + wv); qv(2, i + 0.5, top + 0.001, j + 0.5, j + 1 + wv); qv(3, i - 0.5, top + 0.001, j + 0.5, j + 1 + wv); face(4, FIX + COOL, PS, COOL + DIM, 3, -0.001, 0, 1, 0); }
      else box(i, top / 2, j, 0.5, top / 2, 0.5, T.side, T.top + (w.lv[k] > 4 ? -0.8 : 0.18 * ((i + j) & 1)), w.kind === 'ruins' ? PC : PS, -2, 2);
    }
    // the cursor over the one whose turn it is, blinking with the beat; the rings of a note
    const [ax, ay, az] = at(A);
    if (f.beat.phase < 0.55) { ZK = zk(A.i, 0, A.j) - 0.002; const ty = tileTop(w, A.i, A.j) + 0.02; for (const [dx, dz, hx, hz] of [[0, -0.45, 0.5, 0.05], [0, 0.45, 0.5, 0.05], [-0.45, 0, 0.05, 0.5], [0.45, 0, 0.05, 0.5]]) box(A.i + dx, ty, A.j + dz, hx, 0.02, hz, FIX + BRIGHT); }
    w.rings = w.rings.filter((q) => { q.life -= dt * 0.8; ZK = zk(q.i, 0, q.j) - 0.002; const ty = tileTop(w, q.i, q.j) + 0.03, R = 0.45 * (1.2 - q.life * 0.4); for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, b = ((k + 1) / 8) * TAU; qv(0, q.i + Math.cos(a) * R, ty, q.j + Math.sin(a) * R); qv(1, q.i + Math.cos(b) * R, ty, q.j + Math.sin(b) * R); qv(2, q.i + Math.cos(b) * R * 0.8, ty, q.j + Math.sin(b) * R * 0.8); qv(3, q.i + Math.cos(a) * R * 0.8, ty, q.j + Math.sin(a) * R * 0.8); face(4, FIX + q.c, PF | TWO, -1, 3, 0, 0, 1, 0); } return q.life > 0; });
    // the units: small boxy figures, the side in its colour, bobbing with the level, hopping tile to tile
    for (const q of w.units) {
      const [x, y, z] = at(q), o = w.units.find((v) => v.team !== q.team), face0 = Math.atan2(o.i - q.i, o.j - q.j);
      // its shadow where the light puts it, on the top of the tile there (found twice over, as that tile's height moves it)
      const topAt = (px, pz) => tileTop(w, clamp(Math.round(px), 0, G8 - 1), clamp(Math.round(pz), 0, G8 - 1));
      let ty = topAt(x, z), shX = x, shZ = z;
      for (let k = 0; k < 2; k++) { const hh = Math.max(0, y - ty); shX = x - (C.Lx / C.Ly) * hh; shZ = z - (C.Lz / C.Ly) * hh; ty = topAt(shX, shZ); }
      const sk = 1 / (1 + 0.6 * Math.max(0, y - ty));
      ZK = zk(Math.round(shX), 0, Math.round(shZ)) - 0.0025;
      if (y >= ty - 0.01) shadow(shX, ty + 0.01, shZ, 0.3 * sk, 0.3 * sk, DARK + DIM, 3);
      ZK = zk(Math.round(x), 0, Math.round(z)) - 0.003;
      mPush(); mT(x, y + (q.e >= 1 ? 0.03 * f.level * Math.sin(t * 6 + q.team) : 0), z); mS(0.55, 0.55, 0.55);
      figure(0, 0, 0, face0, q.e < 1 ? 0.5 : 0, q.e < 1 ? null : 0.3, q.flash > 0 ? FIX + WHITE : FIX + (q.team ? COOL : HOT), 6.4, 3);
      mPop();
    }
    // the summon: down out of the sky onto the middle, wings beating, its shadow coming in over the tiles under the
    // light as it nears them, a ring of light where it lands
    if (w.summon) {
      const S = w.summon;
      S.t += dt;
      const down = S.t < 1.8 ? ease(S.t / 1.8) : S.t < 9 ? 1 : 1 - ease((S.t - 9) / 1.5), y = S.land + 14 * (1 - down), flap = Math.sin(t * 7) * 0.5;
      for (let j = 0; j < G8; j++) for (let i = 0; i < G8; i++) {
        const top = tileTop(w, i, j), hh = y - top;
        if (hh > 0 && Math.hypot(i - mx + (C.Lx / C.Ly) * hh, j - mx + (C.Lz / C.Ly) * hh) < 1.5) { ZK = zk(i, 0, j) - 0.002; qv(0, i - 0.5, top + 0.004, j - 0.5); qv(1, i + 0.5, top + 0.004, j - 0.5); qv(2, i + 0.5, top + 0.004, j + 0.5); qv(3, i - 0.5, top + 0.004, j + 0.5); face(4, FIX + DARK + DIM, PF, -1, 3, 0, 0, 1, 0); }
      }
      ZK = zk(mx, 0, mx) - 0.5;
      mPush(); mT(mx, y, mx); mRY(t * 0.3);
      mPush(); mS(1.2, 0.9, 1.7); mesh(SPHERE, 2.6); mPop();
      box(0, 0.7, 1.9, 0.45, 0.4, 0.55, 3.2); box(0, 0.8, 2.5, 0.25, 0.12, 0.25, FIX + HOT);
      for (let sd = -1; sd <= 1; sd += 2) { mPush(); mT(sd * 1, 0.4, 0); mRZ(sd * (0.5 + flap)); tri3(0, 0, 1, sd * 3.4, 0, -0.4, 0, 0, -1.2, 3.8); tri3(sd * 3.4, 0, -0.4, sd * 1.8, 0, -1.4, 0, 0, -1.2, 3.2); mPop(); }
      box(0, 0, -2.1, 0.2, 0.2, 0.9, 2.4);
      mPop();
      if (S.t > 1.7 && S.t < 2.3) { s.shake = Math.max(s.shake, 0.6); for (S.rg += dt * 30; S.rg >= 1; S.rg--) w.rings.push({ i: Math.round(mx), j: Math.round(mx), life: 1, c: BRIGHT }); } // thirty rings a second, whatever the frame rate
      if (S.t > 10.5) w.summon = null;
    }
    ZK = NaN;
    w.fx = w.fx.filter((q) => { q.life -= dt; spr(K_SLASH, q.x, q.y, q.z, q.a + q.life, 0, 0, 4); return q.life > 0; });
    w.bars = w.bars.filter((q) => { q.vy *= Math.exp(-dt * 2.5); q.y += q.vy * dt; q.life -= dt; spr(K_BAR, q.x, q.y, q.z, q.h, 0, q.life > 0.3 ? q.c : q.c + DIM, 4); return q.life > 0; });
    flush(r, W, tactSpr);
    if (toScr(ax, ay + 1, az)) targets.push({ x: SX - 0.4 * C.F, y: SY, w: 0.8 * C.F, h: 0.9 * C.F });
  },
};

// ---------------------------------------------------------------------------------------------- memorycard
// A memory-card screen: a dithered backdrop with a soft light drifting over it, fifteen save blocks in a frame,
// each a tiny low-poly object (a cube, a star, a disc, a heart, a gem, a ball) turning and wobbling in its slot;
// the blocks fill with the level and empty as it falls, the selection cursor steps a slot on every beat. A kick
// hops them all (they fall back and bounce in their slots), a snare flips the selected one over, a note tints it;
// below, the selected object large and turning, and plain bars for the bands. Card colours: grey, ice, ruby. A drop
// copies a block: it slides to a free slot leaving a jittering trail.
const CARD_W = { grey: [3, 2, 1], ice: [2, 2, 2], ruby: [1, 2, 3] };
const CARD_C = { grey: LMID, ice: COOL, ruby: HOT };
const ICONS = [null, STAR, DISC, HEART, GEM, SPHERE];
function icon(type, mat) { if (type === 0) box(0, 0, 0, 0.62, 0.62, 0.62, mat); else mesh(ICONS[type], mat); }

const memorycard = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, CARD_W, bandOf(W.a)), types: Array.from({ length: 15 }, () => Math.floor(rnd() * 6)), sc: new Float32Array(15), hy: new Float32Array(15), vy: new Float32Array(15),
      fill: 6, cur: 0, cx: 0, cy: 0, flip: 1, tint: 0, tintC: HOT, copy: null, extra: -1, lx: 0.3, ly: 0.3 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, t } = W, band = bandOf(W.a), fc = CARD_C[w.kind];
    for (const h of hits) {
      if (isLow(h)) { for (let i = 0; i < 15; i++) if (w.hy[i] <= 0.001) w.vy[i] = 2.2 * h.strength * (0.8 + 0.4 * hash(i, 3)); }
      else if (h.kind === 'snare') w.flip = 0;
      else if (isTonal(h)) { w.tint = 0.6; w.tintC = h.pc % 2 ? HOT : COOL; }
    }
    if (f.section === 'change') { w.kind = rollW(rnd, CARD_W, band); w.types = w.types.map((q) => (rnd() < 0.3 ? Math.floor(rnd() * 6) : q)); }
    if (f.beat.on) w.cur = (w.cur + 1) % 15;
    w.fill = follow(w.fill, 3 + f.level * 12, dt, 0.8);
    const nf = Math.round(w.fill);
    if (f.section === 'drop' && !w.copy) { let to = nf; while (to < 14 && to === w.cur) to++; w.copy = { from: w.cur, to: Math.min(14, to), e: 0, type: w.types[w.cur], trail: [] }; }
    w.flip = Math.min(1, w.flip + dt / 0.4); w.tint -= dt;
    // the backdrop: a vertical ramp with a soft light wandering over it, dithered
    w.lx = 0.5 + 0.35 * Math.sin(f.rel.midClock * 0.17 + t * 0.05); w.ly = 0.4 + 0.25 * Math.sin(f.rel.midClock * 0.11 + 1);
    const buf = r.buf, lx = w.lx * N, ly = w.ly * N, sg = 1 / (0.09 * N * N);
    for (let y = 0; y < N; y++) {
      const by = (y & 7) << 3, base = 1.2 + (2 * y) / N, dy2 = (y - ly) * (y - ly);
      for (let x = 0, i = y * N; x < N; x++, i++) { const k = (base + 2.6 / (1 + ((x - lx) * (x - lx) + dy2) * sg) + BAYER[by | (x & 7)]) | 0; buf[i] = RAMP[k > 8 ? 8 : k]; }
    }
    // the slots, laid out on a plane before a long lens; the frame round them and the cursor sliding slot to slot
    begin(W, 100, 200, 1);
    cam(0, 0.55, -16, 0, 0, 2 * N, N / 2, N / 2);
    light(-0.5, 0.8, -0.7);
    const slot = (i) => [((i % 5) - 2) * 1.3, 2 - Math.floor(i / 5) * 1.3];
    toScr(-3.35, 2.75, 0); const fx0 = SX, fy0 = SY; toScr(3.35, -1.35, 0);
    r.rect(fx0, fy0, SX - fx0, SY - fy0, DARK + DIM); r.frame(fx0, fy0, SX - fx0, SY - fy0, fc); r.frame(fx0 + u, fy0 + u, SX - fx0 - 2 * u, SY - fy0 - 2 * u, fc + DIM);
    const [cx0, cy0] = slot(w.cur);
    w.cx = follow(w.cx, cx0, dt, 0.06); w.cy = follow(w.cy, cy0, dt, 0.06);
    for (let i = 0; i < 15; i++) {
      const [x, y] = slot(i), on = i < nf || i === w.extra;
      w.sc[i] = follow(w.sc[i], on ? 1 : 0, dt, 0.12);
      toScr(x - 0.58, y + 0.58, 0); const sx0 = SX, sy0 = SY; toScr(x + 0.58, y - 0.58, 0);
      r.rect(sx0, sy0, SX - sx0, SY - sy0, on ? DARK : DARK + DIM);
      w.vy[i] -= 9 * dt; w.hy[i] += w.vy[i] * dt; // hops: up on a kick, down under gravity, a bounce that loses most of it
      if (w.hy[i] < 0) { w.hy[i] = 0; w.vy[i] = w.vy[i] < -0.8 ? -w.vy[i] * 0.35 : 0; }
      if (w.sc[i] < 0.03) continue;
      const sel = i === w.cur, spin = t * (0.8 + 1.6 * f.rel.trebDrive) * (sel ? 2.2 : 1) + i, wob = 0.35 * Math.sin(t * 1.3 + i * 1.7);
      mPush(); mT(x, y - 0.12 + w.hy[i] * 0.3, -0.2); mRY(spin); mRX(wob + (sel ? TAU * ease(w.flip) : 0)); mS(0.4 * w.sc[i], 0.4 * w.sc[i], 0.4 * w.sc[i]);
      icon(w.types[i], sel && w.tint > 0 ? FIX + w.tintC : 4.6 + (w.types[i] % 3) * 0.7);
      mPop();
    }
    // the copy: the block slides to its new slot, a trail of jittering ghosts behind it
    if (w.copy) {
      const P = w.copy, [x0, y0] = slot(P.from), [x1, y1] = slot(P.to);
      P.e += dt / 1.1;
      const e = easeIO(Math.min(1, P.e)), x = lerp(x0, x1, e), y = lerp(y0, y1, e) + 0.6 * Math.sin(Math.PI * e);
      P.trail.unshift([x, y]); if (P.trail.length > 12) P.trail.length = 12;
      for (let k = 3; k < P.trail.length; k += 3) { const [gx, gy] = P.trail[k]; mPush(); mT(gx + (hash(k, Math.floor(t * 20)) - 0.5) * 0.15, gy - 0.12, -0.6); mRY(t * 3); mS(0.36, 0.36, 0.36); icon(P.type, FIX + fc + DIM); mPop(); }
      mPush(); mT(x, y - 0.12, -0.8); mRY(t * 4); mS(0.42, 0.42, 0.42); icon(P.type, FIX + BRIGHT); mPop();
      if (P.e >= 1) { w.extra = P.to; w.types[P.to] = P.type; w.copy = null; }
    }
    // the panel below: the selected object large and turning, plain bars for the bands and the blocks used
    mPush(); mT(-2.3, -2.6, -1); mRY(t * 0.9); mRX(0.3); mS(0.7, 0.7, 0.7); icon(w.types[w.cur], w.tint > 0 ? FIX + w.tintC : 5.4); mPop();
    flush(r, W);
    toScr(w.cx - 0.62, w.cy + 0.62, 0); const qx = SX, qy = SY; toScr(w.cx + 0.62, w.cy - 0.62, 0);
    const blink = f.beat.pulse > 0.4 ? BRIGHT : fc;
    r.frame(qx, qy, SX - qx, SY - qy, blink); r.frame(qx - 1, qy - 1, SX - qx + 2, SY - qy + 2, blink);
    targets.push({ x: qx, y: qy, w: SX - qx, h: SY - qy });
    toScr(-0.9, -2, 0); const bx = SX, byy = SY, bw = 0.45 * N;
    [f.rel.bassDrive, f.rel.midDrive, f.rel.trebDrive].forEach((v, k) => { r.rect(bx, byy + k * 5 * u, bw, 2.5 * u, DARK); r.rect(bx, byy + k * 5 * u, bw * clamp(v), 2.5 * u, k ? COOL : HOT); });
    for (let i = 0; i < 15; i++) r.rect(bx + i * (bw / 15), byy + 16 * u, Math.max(1, bw / 15 - u), 2 * u, i < nf ? fc : DARK + DIM);
  },
};

// ---------------------------------------------------------------------------------------------- discmenu
// A demo-disc menu: one large abstract shape spinning in a dithered void (a torus, an octahedron, a ring of cubes,
// a gem, a star), lit flat with a plain white highlight where the light glances off it; a selection ring of points
// circles it, its bright arc sweeping round once a beat; the next items wait small in a row below. The shape swells
// with the bass and spins with the treble; a kick pulses it, a snare flips the spin, a note lights faces in an
// accent, the hats sparkle the ring. A section sends the shape flying off and the next one in. Backdrops: void,
// grid, rays. A drop bursts the shape into points that fly out and fall back together into it.
const MENU_W = { void: [3, 2, 1], grid: [1, 2, 3], rays: [2, 2, 2] };
const MENU_SHAPES = 5;
// the points a shape bursts into: its corners, the middles of its edges and faces
function pointsOf(ms) {
  const V = ms.v, out = [];
  for (let i = 0; i < V.length; i += 3) out.push([V[i], V[i + 1], V[i + 2]]);
  for (const fc of ms.f) {
    let mx = 0, my = 0, mz = 0;
    for (let k = 0; k < fc.length; k++) { const a = 3 * fc[k], b = 3 * fc[(k + 1) % fc.length]; mx += V[a] / fc.length; my += V[a + 1] / fc.length; mz += V[a + 2] / fc.length; if (fc.length < 5) out.push([(V[a] + V[b]) / 2, (V[a + 1] + V[b + 1]) / 2, (V[a + 2] + V[b + 2]) / 2]); }
    out.push([mx, my, mz]);
  }
  return out.filter((p, i) => i % Math.max(1, Math.floor(out.length / 90)) === 0);
}
const RING8 = (() => { const out = []; for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; for (let c = 0; c < 8; c++) out.push([Math.cos(a) * 1.1 + (c & 1 ? 0.22 : -0.22), c & 2 ? 0.22 : -0.22, Math.sin(a) * 1.1 + (c & 4 ? 0.22 : -0.22)]); } return out; })();
const MENU_PTS = [pointsOf(TORUS), pointsOf(OCTA).map(([x, y, z]) => [x * 1.25, y * 1.25, z * 1.25]), RING8, pointsOf(GEM).map(([x, y, z]) => [x * 1.15, y * 1.35, z * 1.15]), pointsOf(STAR).map(([x, y, z]) => [x * 1.25, y * 1.25, z * 1.25])];
function menuShape(k, mat, acc, t) {
  const mats = acc >= 0 ? [] : null;
  if (k === 2) { for (let c = 0; c < 8; c++) { mPush(); mRY((c / 8) * TAU); mT(1.1, 0, 0); mRX(t * 1.5 + c); box(0, 0, 0, 0.24, 0.24, 0.24, acc >= 0 && c % 2 ? FIX + acc : mat); mPop(); } return; }
  const ms = [TORUS, OCTA, null, GEM, STAR][k];
  if (mats) for (let i = 0; i < ms.f.length; i++) mats.push(i % 3 === 0 ? FIX + acc : mat);
  mPush();
  if (k === 1) mS(1.25, 1.25, 1.25); else if (k === 3) mS(1.15, 1.35, 1.15); else if (k === 4) mS(1.25, 1.25, 1.25);
  mesh(ms, mat, 3, 0, mats);
  mPop();
}
function menuTables(W) {
  const { w, N } = W;
  w.N = N; w.pa = new Uint8Array(N * N); w.pr = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dx = x + 0.5 - N / 2, dy = y + 0.5 - 0.45 * N; w.pa[y * N + x] = (((Math.atan2(dy, dx) / TAU) * 256) | 0) & 255; w.pr[y * N + x] = Math.hypot(dx, dy) / N; }
}

const discmenu = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, MENU_W, bandOf(W.a)), cur: Math.floor(rnd() * MENU_SHAPES), next: -1, tr: 1, ang: 0, dir: 1, jolt: 0, bass: 0, kick: 0, acc: -1, accT: 0, sparks: new Float32Array(24), burst: -1, N: 0 });
    menuTables(W);
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, t } = W, band = bandOf(W.a);
    if (w.N !== N) menuTables(W);
    for (const h of hits) {
      if (isLow(h)) w.kick = Math.max(w.kick, h.strength);
      else if (h.kind === 'snare') { w.dir = -w.dir; w.jolt = 1; }
      else if (h.kind === 'hat') w.sparks[Math.floor(rnd() * 24)] = 0.25;
      else if (isTonal(h)) { w.acc = h.pc % 2 ? HOT : COOL; w.accT = 0.8; }
    }
    if (f.section === 'change' && w.tr >= 1) { w.next = (w.cur + 1 + Math.floor(rnd() * (MENU_SHAPES - 1))) % MENU_SHAPES; w.tr = 0; if (rnd() < 0.4) w.kind = rollW(rnd, MENU_W, band); }
    if (f.section === 'drop' && w.burst < 0) w.burst = 0;
    w.kick *= Math.exp(-dt * 6); w.jolt *= Math.exp(-dt * 4); w.accT -= dt;
    for (let k = 0; k < 24; k++) w.sparks[k] -= dt;
    w.bass = follow(w.bass, f.rel.bassDrive, dt, 0.15);
    w.ang += dt * (0.4 + 2.6 * f.rel.trebDrive + 3 * w.jolt) * w.dir;
    if (w.tr < 1) { w.tr = Math.min(1, w.tr + dt / 1.2); if (w.tr >= 1) { w.cur = w.next; w.next = -1; } }
    if (w.burst >= 0) { w.burst += dt / 2.4; if (w.burst >= 1) w.burst = -1; }
    // the backdrop: a dark void with a glow, a floor grid, or rays turning slowly
    const buf = r.buf, pa = w.pa, pr = w.pr, glow = 0.6 * w.kick;
    if (w.kind === 'rays') { const rot = (t * 6) | 0; for (let i = 0, y = 0; y < N; y++) { const by = (y & 7) << 3; for (let x = 0; x < N; x++, i++) { const lv = (((pa[i] + rot) >> 4) & 1 ? 2.6 : 1.6) + glow - pr[i] * 1.5, k = (lv + BAYER[by | (x & 7)]) | 0; buf[i] = RAMP[k < 0 ? 0 : k > 8 ? 8 : k]; } } }
    else { for (let i = 0, y = 0; y < N; y++) { const by = (y & 7) << 3; for (let x = 0; x < N; x++, i++) { const lv = 3.4 + glow - pr[i] * 4.2, k = (lv + BAYER[by | (x & 7)]) | 0; buf[i] = RAMP[k < 0 ? 0 : k > 8 ? 8 : k]; } } }
    begin(W, 40, 80, 1);
    cam(0, 0.4, -6.5, 0, 0.05, 0.95 * N, N / 2, 0.45 * N);
    light(-0.6, 0.8, -0.6);
    if (w.kind === 'grid') { // a floor of lines below the shape, running toward us with the bass clock
      const ph = (f.rel.bassClock * 0.5) % 1;
      for (let k = -8; k <= 8; k++) if (toScr(k * 1.2, -2, 30)) { const x0 = SX, y0 = SY; if (toScr(k * 1.2, -2, -1)) r.line(x0, y0, SX, SY, COOL + DIM); }
      for (let k = 0; k < 14; k++) { const z = 30 - (k + ph) * 2.2; if (z > 0 && toScr(-12, -2, z)) { const y0 = SY, x0 = SX; toScr(12, -2, z); r.line(x0, y0, SX, SY, COOL + DIM); } }
    }
    // the shape (two in flight during a change), scaled by the bass and the kick, spun by the treble
    const S = 1 + 0.35 * w.bass + 0.25 * w.kick, mat = 4.8, acc = w.accT > 0 ? w.acc : -1;
    const shapeAt = (k, x, sc, spin) => { mPush(); mT(x, 0.3, 0); mRY(w.ang + spin); mRX(0.45 + 0.3 * Math.sin(t * 0.5)); mS(sc, sc, sc); menuShape(k, mat, acc, t); mPop(); };
    if (w.burst >= 0) { // burst: the shape's points out and back, the faces gone until they meet again
      const e = w.burst, d = e < 0.25 ? ease(e / 0.25) : 1 - easeIO((e - 0.25) / 0.75), P = MENU_PTS[w.cur], ca = Math.cos(w.ang), sa = Math.sin(w.ang);
      for (let i = 0; i < P.length; i++) {
        const [px, py, pz] = P[i], l = Math.hypot(px, py, pz) || 1, k = 1 + d * (1.5 + 1.5 * hash(i, 7));
        const x = px * k + (hash(i, 8) - 0.5) * d, y = py * k + (hash(i, 9) - 0.5) * d, z = pz * k;
        spr(K_DOT, (x * ca + z * sa) * S, y * S + 0.3, (z * ca - x * sa) * S, 0.07 + 0.04 * (1 - l / 2), i % 5 ? BRIGHT : w.acc >= 0 ? w.acc : HOT);
      }
    } else if (w.tr < 1) { shapeAt(w.cur, 7 * w.tr * w.tr, S, 0); shapeAt(w.next, -7 * (1 - ease(w.tr)), S * (0.4 + 0.6 * ease(w.tr)), w.tr * 3); }
    else shapeAt(w.cur, 0, S, 0);
    // the selection ring: points on a tilted circle round it, the bright arc sweeping once a beat
    const sweep = TAU * (beatLocked(f) ? f.beat.phase : (t * 2) % 1);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU, d = (((sweep - a) % TAU) + TAU) % TAU, x = Math.cos(a) * 2.1 * S, z = Math.sin(a) * 2.1 * S;
      spr(K_DOT, x, 0.3 + z * 0.32, z * 0.95, 0.09, w.sparks[k] > 0 ? WHITE : d < 0.9 ? BRIGHT : d < 1.8 ? LMID : MID + DIM);
    }
    // the next items, small, in a row below
    for (let k = 1; k <= 3; k++) { mPush(); mT((k - 2) * 1.5, -2.3, 0.5); mRY(t * 0.8 + k); mRX(0.4); mS(0.32, 0.32, 0.32); menuShape((w.cur + k) % MENU_SHAPES, 3.6, -1, t); mPop(); }
    flush(r, W);
    // a plain highlight where the light glances off the shape: the corner nearest the half-way of light and eye
    if (w.burst < 0 && w.tr >= 1 && w.cur !== 2) {
      const ms = [TORUS, OCTA, null, GEM, STAR][w.cur], nv = ms.v.length / 3, hx = C.Lx, hy = C.Ly + 0.2, hz = C.Lz - 1, hl = Math.hypot(hx, hy, hz);
      mId(); mT(0, 0.3, 0); mRY(w.ang); mRX(0.45 + 0.3 * Math.sin(t * 0.5)); mS(S, S, S);
      if (w.cur === 1) mS(1.25, 1.25, 1.25); else if (w.cur === 3) mS(1.15, 1.35, 1.15); else if (w.cur === 4) mS(1.25, 1.25, 1.25);
      let best = -2, bx = 0, by = 0, bz = 0;
      for (let i = 0; i < nv; i++) { xf(ms.v[3 * i], ms.v[3 * i + 1], ms.v[3 * i + 2]); const dx = WX, dy = WY - 0.3, dz = WZ, l = Math.hypot(dx, dy, dz) || 1, q = (dx * hx + dy * hy + dz * hz) / (l * hl); if (q > best) { best = q; bx = WX; by = WY; bz = WZ; } }
      if (toScr(bx, by, bz)) { r.rect(SX - u, SY - u, Math.max(2, 2 * u), Math.max(2, 2 * u), WHITE); r.rect(SX - 2 * u, SY, Math.max(1, 4 * u), Math.max(1, u * 0.6), WHITE); }
    }
    for (let k = 1; k <= 3; k++) if (toScr((k - 2) * 1.5, -2.85, 0.5)) r.rect(SX - 3 * u, SY, 6 * u, Math.max(1, u), k === 1 && f.beat.pulse > 0.5 ? BRIGHT : MID);
    if (toScr(0, 0.3 + 1.6 * S, 0)) { const ty = SY; if (toScr(0, 0.3 - 1.6 * S, 0)) targets.push({ x: N / 2 - (SY - ty) / 2, y: ty, w: SY - ty, h: SY - ty }); }
  },
};

// ---------------------------------------------------------------------------------------------- fogcity
// A night drive through a city in the fog, from behind the bonnet: blocks of buildings with lit window grids pop
// in out of the fog, road lamps pass one a beat (the car's speed is the spacing times the tempo), each laying a
// pool of light on the road and a streak of reflection under it on the wet asphalt; the headlights throw two cones
// ahead, the horizon wobbles with the bass and a kick bumps the car. A snare is lightning in the rain (or the high
// beams), a note recolours the windows, the hats flicker them. Weather: rain (streaks), mist (a closer fog), clear.
// A drop lifts the fog for four bars: the whole skyline stands there, far towers and all, then the fog comes back.
const WEATHER_W = { rain: [2, 2, 3], mist: [3, 2, 1], clear: [1, 2, 2] };
const LS = 14, K_GLOW = 8, K_REFL = 9;
const roadX = (z) => 4 * Math.sin(z * 0.012);
function citySpr(r, W, p) {
  if (p.k < 8) { common(r, W, p); return; }
  if (p.k === K_GLOW) { ddisc(r, p.x, p.y, p.a * p.sc, fogC(BRIGHT, p.q), 0.3); ddisc(r, p.x, p.y, p.a * 0.45 * p.sc, fogC(BRIGHT, p.q), 0.7); return; }
  const N = r.N, buf = r.buf, x0 = Math.round(p.x - 0.25 * p.sc), x1 = Math.round(p.x + 0.25 * p.sc), y1 = Math.min(N, Math.round(p.y + p.a * p.sc));
  for (let y = Math.max(0, p.y); y < y1; y++) { const by = (y & 7) << 3, d = 0.6 * (1 - (y - p.y) / (y1 - p.y + 1)); for (let x = Math.max(0, x0); x < Math.min(N, x1); x++) if (BAYER[by | (x & 7)] < d) buf[y * N + x] = fogC(p.c, p.q); }
}

const fogcity = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, WEATHER_W, bandOf(W.a)), z: 0, pbt: null, by: 0, bv: 0, flash: 0, beams: 0, lit: BRIGHT, shift: 0, lift: 0, fog: 40,
      rain: Array.from({ length: 80 }, () => [rnd(), rnd(), 0.5 + rnd()]) });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, t } = W, band = bandOf(W.a), bps = bpsOf(f);
    for (const h of hits) {
      if (isLow(h)) w.bv += 0.5 * h.strength;
      else if (h.kind === 'snare' && h.strength > 0.5) { if (w.kind === 'rain' && rnd() < 0.5) w.flash = 0.12; else w.beams = 0.3; }
      else if (h.kind === 'hat') w.shift = Math.floor(rnd() * 16);
      else if (isTonal(h)) w.lit = [BRIGHT, HOT, COOL][h.pc % 3];
    }
    if (f.section === 'change') w.kind = rollW(rnd, WEATHER_W, band);
    if (f.section === 'drop') w.lift = 16 / bps;
    // the car: a lamp a beat, so the distance is the spacing times the beats (kept in step: a lamp passes on the beat)
    const bt = beats(W);
    if (w.pbt === null) w.z = LS * (bt - Math.floor(bt)) + LS * 4;
    else w.z += LS * clamp(bt - w.pbt, 0, 0.5);
    w.pbt = bt;
    w.bv += (-w.by * 40 - w.bv * 7) * dt; w.by += w.bv * dt; // the bump: a spring under the car
    w.flash -= dt; w.beams -= dt; w.lift -= dt;
    const fog0 = w.kind === 'mist' ? 24 : w.kind === 'rain' ? 34 : 46;
    w.fog = follow(w.fog, w.lift > 0 ? 170 : fog0, dt, w.lift > 0 ? 0.6 : 1.2);
    const z = w.z, x = roadX(z) + 1.7, hd = Math.atan(4 * 0.012 * Math.cos(z * 0.012)), roll = 0.035 * Math.sin(f.rel.bassClock * 0.5) + 0.25 * w.bv * 0.1;
    cam(x, 1.15 + w.by, z, hd + 0.03 * Math.sin(t * 0.3), 0.03 - 0.4 * w.bv * 0.05, 0.95 * N, N / 2, 0.47 * N, roll);
    const fogL = w.kind === 'clear' ? 0.6 : 1.5;
    if (w.flash > 0) backdrop(r, 7, 5.5, fogL); else backdrop(r, 0.2, w.kind === 'clear' ? 1.2 : 2.4, fogL);
    begin(W, w.fog * 0.45, w.fog, fogL);
    light(0.2, 1, -0.3);
    LOFF = w.shift;
    // the road: asphalt in strips, a dashed line, the kerbs
    for (let z0 = Math.floor((z - 4) / 4) * 4; z0 < z + w.fog; z0 += 4) {
      const xa = roadX(z0), xb = roadX(z0 + 4);
      qv(0, xa - 7, 0, z0, 1.6); qv(1, xa + 7, 0, z0, 1.6); qv(2, xb + 7, 0, z0 + 4, 1.6); qv(3, xb - 7, 0, z0 + 4, 1.6); face(4, 0, PG, -1, 1, 0, 0, 1, 0);
      if ((z0 / 4) % 2 === 0) { qv(0, xa - 0.08, 0.01, z0, 0); qv(1, xa + 0.08, 0.01, z0, 0); qv(2, xb + 0.08, 0.01, z0 + 2.4, 0); qv(3, xb - 0.08, 0.01, z0 + 2.4, 0); face(4, FIX + LMID + DIM, PF, -1, 2, 0, 0, 1, 0); }
      for (let sd = -1; sd <= 1; sd += 2) { qv(0, xa + sd * 7, 0.15, z0, 3); qv(1, xa + sd * 9.5, 0.15, z0, 3); qv(2, xb + sd * 9.5, 0.15, z0 + 4, 3); qv(3, xb + sd * 7, 0.15, z0 + 4, 3); face(4, 0, PG | TWO, -1, 1, 0, 0, 1, 0); }
    }
    // the blocks either side, windows lit in a grid; the far towers only show when the fog lifts
    for (let j = Math.floor((z - 10) / 10); j * 10 < z + w.fog; j++) for (let sd = -1; sd <= 1; sd += 2) {
      if (hash(j, sd + 40) < 0.15) continue;
      const len = 7.5 + 2 * hash(j, sd + 1), hgt = 6 + 24 * hash(j, sd + 2) ** 2, dep = 5 + 4 * hash(j, sd + 3), bx = roadX(j * 10 + 5) + sd * (10 + dep);
      box(bx, hgt / 2, j * 10 + len / 2, dep, hgt / 2, len / 2, 1.4 + hash(j, sd) * 0.8, 1, PW, w.lit, 0.9);
    }
    if (w.fog > 60) for (let k = 0; k < 18; k++) { const tz = z + 70 + k * 9, tx = (k & 1 ? 1 : -1) * (24 + 40 * hash(k, 5)), th = 20 + 40 * hash(k, 6); box(tx, th / 2, tz, 4, th / 2, 4, 1.2, 1, PW, w.lit, 0.6); }
    // the lamps: one pair every spacing; a post, an arm, a head, its glow, its pool on the road and its streak in it
    for (let k = Math.floor(z / LS); k * LS < z + w.fog; k++) { // as far as the fog lets anything show, so they come in with the rest
      const lz = k * LS;
      if (lz < z - 2) continue;
      for (let sd = -1; sd <= 1; sd += 2) {
        const lx = roadX(lz) + sd * 7.4, hx = lx - sd * 1.2;
        box(lx, 2.6, lz, 0.08, 2.6, 0.08, 2.4);
        box(lx - sd * 0.6, 5.15, lz, 0.6, 0.05, 0.06, 2.4);
        box(hx, 5.05, lz, 0.3, 0.07, 0.18, FIX + BRIGHT);
        spr(K_GLOW, hx, 5, lz, 0.9);
        shadow(hx, 0.02, lz, 2.4, 2.4, MID + DIM, 2);
        if (w.kind !== 'clear') spr(K_REFL, hx, 0.02, lz, 5.05, 0, LMID, 2); // the head mirrored in the wet road, as far below it as the head is above: a streak down to there
      }
    }
    // the headlights: two cones on the road ahead, bright near and fading
    const beam = w.beams > 0 ? 2.2 : 0;
    for (let sd = -1; sd <= 1; sd += 2) {
      const z0 = z + 2.5, z1 = z + 14 + 6 * beam, cx0 = x + sd * 0.7, c0 = roadX(z0) - roadX(z) + cx0, c1 = roadX(z1) - roadX(z) + cx0;
      qv(0, c0 - 0.5, 0.012, z0, 4.4 + beam); qv(1, c0 + 0.5, 0.012, z0, 4.4 + beam); qv(2, c1 + 2.2, 0.012, z1, 1.6); qv(3, c1 - 2.2, 0.012, z1, 1.6); face(4, 0, PG, -1, 2, 0, 0, 1, 0);
    }
    flush(r, W, citySpr);
    // the bonnet, in the car's own space: a crease down the middle, a lamp's sheen sliding down it as each passes
    const sheen = (bt % 1) * 3;
    cam(0, 0, 0, 0, 0, 0.95 * N, N / 2, 0.47 * N);
    C.fogN = 90; C.fogF = 100;
    for (let sd = -1; sd <= 1; sd += 2) { qv(0, 0, -0.72, 1.3, 1.4 + (sheen < 1 ? 2.5 * (1 - sheen) : 0)); qv(1, sd * 1.6, -0.84, 1.3, 1); qv(2, sd * 1.15, -0.8, 2.6, 1 + (sheen > 1 && sheen < 2 ? 2 : 0)); qv(3, 0, -0.71, 2.7, 1.6 + (sheen > 1 && sheen < 2 ? 2.5 : 0)); face(4, 0, PG | TWO, -1, 3); }
    flush(r, W);
    // the rain: streaks slanting down, more with the level
    if (w.kind !== 'mist') {
      const n = w.kind === 'rain' ? Math.round(30 + 50 * f.level) : 10;
      for (let i = 0; i < n; i++) { const q = w.rain[i], y = ((q[1] + t * (1.4 + q[2])) % 1.1) * N, xx = ((q[0] + t * 0.12) % 1) * N, l = (2 + 3 * q[2]) * u; r.line(xx, y, xx - l * 0.35, y + l, q[2] > 1.2 ? BRIGHT + DIM : LMID + DIM); }
    }
    if (toScr(x, 0.5, z + 12)) targets.push({ x: SX - 6 * u, y: SY - 6 * u, w: 12 * u, h: 12 * u });
  },
};

const WORLDS = { mansion, racer, platformer3d, fightstage, worldmap, mechbay, railgun, snowslope, tacticsgrid, memorycard, discmenu, fogcity };
registerFamily('ps1', WORLD_DEFS, WORLDS);
export const PS1_STYLE = makeMixStyle('32-BIT', ['ps1']);
