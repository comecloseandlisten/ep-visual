// Crime pictures, mixed: the gangster film and the stoner comedy as visual tropes, twelve sets. A wiretap, a
// stakeout in a parked car, a smoky den, a circle passing a lit joint, a vault and its laser grid, a night getaway,
// a counting table, an interrogation under a swinging lamp, an old telephone exchange, a table of burner phones, a
// 1920s speakeasy and a meeting on a roof. Original silhouettes and sets only: no real people, gangs, colours or
// signs of any, no brands, no readable text or digits (money is plain banded rectangles, phones are glowing slabs);
// the smoking gear is a prop with an ember and smoke and nothing more, and nobody is hurt (a raid is lights, noise
// and people scattering). Each world has a kinds table weighed by the arousal band, rolled again on a section
// change, with a heavy turn on a drop, and answers the music continuously, on hits and on the beat. The physics
// are kept honest: smoke, steam and wax that rise on their warmth and slow as they climb, terminal speeds,
// pendulums at w = sqrt(g/L), catenaries, stick-slip friction, parabolas, reels at w = v/r, gaits in step.
import { clamp, lerp, bayer } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow, ease,
  beatLocked, hash, pickW, walker, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  wiretap: { name: 'the wiretap', va: [[L, M], [M, H], [M, M]], pals: ['tungsten', 'noir', 'tape', 'midnight', 'sepia'], fx: ['none', 'vhs', 'hud', 'film'], themes: ['paranoia', 'machine', 'night'] },
  stakeout: { name: 'the stakeout', va: [[L, M], [M, H], [M, M]], pals: ['midnight', 'noir', 'tungsten', 'tape', 'cinema'], fx: ['film', 'none', 'hud', 'vhs'], themes: ['night', 'paranoia', 'lonely'] },
  hotbox: { name: 'the hotbox', va: [[M, L], [H, L], [L, L]], pals: ['haze', 'vapor', 'toxic', 'velvet', 'tape'], fx: ['none', 'vhs', 'crt'], themes: ['dream', 'play'] },
  passcircle: { name: 'the circle', va: [[M, L], [H, L], [L, L]], pals: ['haze', 'midnight', 'vapor', 'tape', 'tungsten'], fx: ['none', 'film', 'vhs'], themes: ['dream', 'play', 'night'] },
  heist: { name: 'the heist', va: [[M, H], [H, H], [L, H]], pals: ['noir', 'neon', 'toxic', 'cinema', 'gold'], fx: ['none', 'hud', 'cards', 'crt'], themes: ['paranoia', 'machine', 'glory'] },
  getaway: { name: 'the getaway', va: [[M, H], [H, H], [L, H]], pals: ['neon', 'midnight', 'noir', 'cinema', 'toxic'], fx: ['none', 'film', 'cards', 'vhs'], themes: ['speed', 'street', 'night'] },
  countingroom: { name: 'the counting room', va: [[M, H], [L, M]], pals: ['tungsten', 'sepia', 'gold', 'noir', 'velvet'], fx: ['film', 'none', 'cards'], themes: ['glory', 'paranoia'] },
  interrogation: { name: 'the interrogation', va: [[L, M], [M, H], [M, M]], pals: ['noir', 'tungsten', 'sepia', 'cinema', 'midnight'], fx: ['film', 'none', 'vhs', 'cards'], themes: ['paranoia', 'rage'] },
  switchboard: { name: 'the exchange', va: [[L, M], [M, H], [M, M]], pals: ['sepia', 'tungsten', 'tape', 'noir', 'gold'], fx: ['none', 'film', 'crt'], themes: ['machine', 'paranoia'] },
  burners: { name: 'burner phones', va: [[M, H], [H, H], [L, H]], pals: ['toxic', 'neon', 'noir', 'haze', 'midnight'], fx: ['none', 'hud', 'vhs', 'cards'], themes: ['paranoia', 'machine', 'street'] },
  speakeasy: { name: 'the speakeasy', va: [[H, M], [H, H]], pals: ['velvet', 'gold', 'sepia', 'tungsten', 'cinema'], fx: ['film', 'none', 'cards'], themes: ['play', 'rave', 'night'] },
  rooftopmeet: { name: 'the meet on the roof', va: [[M, H], [L, M]], pals: ['midnight', 'noir', 'neon', 'haze', 'tungsten'], fx: ['film', 'none', 'hud', 'vhs'], themes: ['night', 'street', 'paranoia'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the kinds tables below weigh their kinds by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bpsOf = (f) => (f.bpm ? f.bpm / 60 : 2);
const beatS = (f) => (f.bpm ? 60 / f.bpm : 0.5);
// how many of a thing that comes `rate` times a second come this frame: a whole number, right on average at any dt
const spawns = (rnd, rate, dt) => { const n = rate * dt, k = Math.floor(n); return k + (rnd() < n - k ? 1 : 0); };
const SHADES = [DARK, MID, LMID, BRIGHT];
// gravity in cells a second squared for a set where a grown-up standing `hm` cells tall is 1.75 m: 9.81 m/s² to scale
const gOf = (hm) => (9.81 * hm) / 1.75;
// true once a beat: the tracker's beat while it has the tempo, else a free clock at the tempo (two a second without)
function beatTick(w, f, dt) {
  if (beatLocked(f)) return f.beat.on;
  w.bph = (w.bph || 0) + dt * bpsOf(f);
  if (w.bph < 1) return false;
  w.bph -= Math.floor(w.bph);
  return true;
}
// a clock in beats: the tracker's count and phase while it has the tempo, else free-running
function beatT(W) {
  const { f, w, dt } = W;
  w.bt = beatLocked(f) ? f.beat.count + f.beat.phase : (w.bt || 0) + dt * bpsOf(f);
  return w.bt;
}
// the waveform at q (0..1 across it), -1..1; without one, a wobble at the mid band's energy
const waveAt = (f, q, t) => (f.wave?.length ? f.wave[Math.min(f.wave.length - 1, (q * f.wave.length) | 0)]
  : Math.sin(q * 37 + t * 9) * Math.sin(q * 11 - t * 3) * 0.5 * (f.mid + 0.3 * f.rel.midDrive));
// rects, discs and polygons drawn as a dither: only the pixels whose hash falls under `d`, the same ones every frame
function ditherRect(r, x, y, w, h, c, d) {
  const N = r.N, x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(N, Math.round(x + w)), y1 = Math.min(N, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) if (hash(xx, yy) < d) r.buf[yy * N + xx] = c;
}
function ditherDisc(r, cx, cy, rad, c, d) {
  const N = r.N, r2 = rad * rad;
  for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(N - 1, cy + rad); y++)
    for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(N - 1, cx + rad); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2 && hash(x, y) < d) r.buf[y * N + x] = c;
    }
}
const XS = [];
function ditherPoly(r, pts, c, d) {
  const N = r.N;
  let top = Infinity, bottom = -Infinity;
  for (const p of pts) { top = Math.min(top, p[1]); bottom = Math.max(bottom, p[1]); }
  for (let y = Math.max(0, Math.floor(top)); y < Math.min(N, Math.ceil(bottom)); y++) {
    const yc = y + 0.5;
    XS.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xa, ya] = pts[j], [xb, yb] = pts[i];
      if ((ya <= yc) !== (yb <= yc)) XS.push(xa + ((yc - ya) / (yb - ya)) * (xb - xa));
    }
    XS.sort((p, q) => p - q);
    for (let k = 0; k + 1 < XS.length; k += 2)
      for (let x = Math.max(0, Math.round(XS[k])); x < Math.min(N, Math.round(XS[k + 1])); x++) if (d >= 1 || bayer(x, y) < d) r.buf[y * N + x] = c < 0 ? LIFT[r.buf[y * N + x]] : c;
  }
}
const LIGHT = -1; // as a colour to ditherPoly: lift what is there a step (a light falling on it) instead of painting (an ordered dither)
// One step up the value ramp, for what a light falls on: the dimmed roles to their own colour, black to dark.
const LIFT = Uint8Array.from([BG, BRIGHT, MID, LMID, BRIGHT, BRIGHT, HOT, COOL, BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DARK + DIM, WHITE]);
// A light at (lx, ly) along `ang`, half-angle `half`: rays fanned from it (axis first) lift what they cross one step
// up the value ramp and stop on the first solid pixel (an undimmed role or black: a figure, a table), lit itself, so
// whatever lies behind it is in its shadow. The dimmed roles are the walls, the floor and the air: lit, never in the
// way. The rays start at `y0` (the light seen through a door) and light only below `ylit`; the share `hot` of the
// cone round its axis is lifted twice, the outer sixth is a dither.
function castLight(W, lx, ly, ang, half, reach, hot = 0.3, y0 = -1e9, ylit = -1e9) {
  const { r, N, w } = W, buf = r.buf;
  if (!w.lm || w.lm.length !== N * N) { w.lm = new Uint32Array(N * N); w.gen = 0; }
  const lm = w.lm, gen = ++w.gen, hn = Math.max(1, Math.ceil((half * reach) / 0.6)), n = 2 * hn + 1;
  for (let i = 0; i < n; i++) {
    const q = (i & 1 ? 1 : -1) * (((i + 1) >> 1) / hn), e = Math.abs(q), a = ang + q * half, dx = Math.cos(a), dy = Math.sin(a), twice = e < hot;
    let x = lx, y = ly;
    for (let st = 0; st < reach; st++, x += dx, y += dy) {
      if (y < y0) continue;
      if (x < 0 || y < 0 || x >= N || y >= N) { if ((x < 0 && dx <= 0) || (x >= N && dx >= 0) || (y >= N && dy >= 0) || (y < 0 && dy <= 0)) break; continue; }
      const xi = x | 0, yi = y | 0, j = yi * N + xi, m = lm[j];
      let solid;
      if (m >>> 1 === gen) solid = m & 1;
      else {
        const c = buf[j];
        solid = (c > BG && c < DIM) || c === BLACK ? 1 : 0;
        if (y > ylit && (e < 0.83 || hash(xi, yi) < (1 - e) / 0.17)) { buf[j] = twice ? LIFT[LIFT[c]] : LIFT[c]; lm[j] = (gen << 1) | solid; }
      }
      if (solid) break;
    }
  }
}
// The light through an open door in the back wall, on the floor (a camera with its eye line at yh, the wall's foot
// at fy): each floor pixel is put back on the floor plane (depth z, 1 at the wall; X its place across, in the wall's
// cells) and the ray from it back toward the light, rising S cells per unit of depth, must reach the wall through the
// opening x0..x1 under its top, past the figure standing in it (black where the ray crosses the door) and past the
// boxes in the room `obs` ([X0, X1, za, zb, hb, ht]: across, from depth za to zb, between heights hb and ht). The lit
// floor (its dimmed roles) goes up a step, two through the middle of the door. Shadows fall at us, as they must.
function doorLight(W, yh, fy, x0, x1, top, S, obs) {
  const { r, N, w } = W, buf = r.buf, vx = N / 2, mid = (x0 + x1) / 2, hw = (x1 - x0) / 2;
  if (!w.lm || w.lm.length !== N * N) { w.lm = new Uint32Array(N * N); w.gen = 0; }
  const lm = w.lm, gen = ++w.gen;
  for (let y = Math.ceil(fy); y < N; y++) {
    const z = (fy - yh) / (y + 0.5 - yh), h = S * (1 - z);
    if (h >= fy - top) break;
    const wy = Math.round(fy - h), xa = Math.max(0, Math.floor(vx + (x0 - vx) / z)), xb = Math.min(N - 1, Math.ceil(vx + (x1 - vx) / z));
    for (let x = xa; x <= xb; x++) {
      const X = vx + (x + 0.5 - vx) * z, j = y * N + x, c = buf[j];
      if (X < x0 || X > x1 || c < DIM || c >= BLACK || buf[wy * N + Math.min(N - 1, X | 0)] === BLACK) continue;
      let shade = false;
      for (let k = 0; k < obs.length; k += 6) {
        if (obs[k + 3] <= z || X < obs[k] || X > obs[k + 1]) continue;
        const lo = S * (Math.max(obs[k + 2], z) - z), hi = S * (obs[k + 3] - z);
        if (hi >= obs[k + 4] && lo <= obs[k + 5]) { shade = true; break; }
      }
      if (shade) continue;
      buf[j] = Math.abs(X - mid) < hw * 0.55 && h < (fy - top) * 0.75 ? LIFT[LIFT[c]] : LIFT[c];
      lm[j] = gen << 1;
    }
  }
}
const isLit = (W, x, y) => { const { N, w } = W, xi = x | 0, yi = y | 0; return xi >= 0 && yi >= 0 && xi < N && yi < N && !!w.lm && w.lm[yi * N + xi] >>> 1 === w.gen; };
// Buoyant smoke and steam: a puff's rise relaxes toward a buoyant speed that falls away as it mixes and cools (so it
// slows as it climbs), its push sideways relaxes into the air's own drift `wind`, it sways a little, spreads and
// thins; a dither that fades with what is left of its life. p = {x, y, vx, vy, rise, rad, grow, life, max, dens}
function smoke(W, list, col, wind = 0, cap = 48) {
  const { r, t, dt } = W;
  if (list.length > cap) list.splice(0, list.length - cap);
  return list.filter((p) => {
    const age = p.max - p.life;
    p.vy = follow(p.vy, -p.rise * Math.exp(-age / (0.4 * p.max)), dt, 0.3);
    p.vx = follow(p.vx, wind, dt, 0.6);
    p.x += (p.vx + Math.sin(t * 2.3 + p.max * 7 + age * 1.7) * p.rad * 0.6) * dt;
    p.y += p.vy * dt;
    p.rad += p.grow * dt;
    p.life -= dt;
    ditherDisc(r, p.x, p.y, p.rad, col, p.dens * clamp(p.life / p.max) ** 0.7);
    return p.life > 0;
  });
}
// a two-part limb from (sx, sy) reaching for (tx, ty), `len` long in all, the joint bent to `side`; returns the hand
function arm(r, sx, sy, tx, ty, len, side, wd, col) {
  const l = len / 2, dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1e-3, dd = Math.min(d, len * 0.999), ux = dx / d, uy = dy / d;
  const hx = sx + ux * dd, hy = sy + uy * dd, a = dd / 2, k = Math.sqrt(Math.max(0, l * l - a * a)), ex = sx + ux * a - side * uy * k, ey = sy + uy * a + side * ux * k;
  r.stroke(sx, sy, ex, ey, wd, col);
  r.stroke(ex, ey, hx, hy, wd, col);
  return [hx, hy];
}
// A cord of length L hung from (x1, y1) to (x2, y2) (cells, y down), its gravity tilted by `tilt` (a swing): n + 1
// points into `out` along y = a·cosh((x − x0)/a) + c, solved where the gravity points straight down (a from
// sinh(z)/z = √(L² − v²)/h, z = h/2a, by bisection); a taut cord is straight, one hung from a single spot a V.
function catenary(x1, y1, x2, y2, L, tilt, n, out) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, c = Math.cos(tilt), s = Math.sin(tilt);
  let ax = (x1 - mx) * c - (y1 - my) * s, ay = -((x1 - mx) * s + (y1 - my) * c), bx = (x2 - mx) * c - (y2 - my) * s, by = -((x2 - mx) * s + (y2 - my) * c); // y up
  if (bx < ax) { [ax, bx] = [bx, ax]; [ay, by] = [by, ay]; }
  const h = bx - ax, v = by - ay, rho = Math.sqrt(Math.max(0, L * L - v * v)) / Math.max(h, 1e-6);
  let a = 0, x0 = 0, C = 0, low = 0;
  if (h < 0.5) low = Math.min(ay, by) - Math.max(0, L - Math.abs(v)) / 2;
  else if (rho > 1.0005) {
    let lo = 1e-4, hi = 12;
    for (let k = 0; k < 32; k++) { const z = (lo + hi) / 2; if (Math.sinh(z) / z > rho) hi = z; else lo = z; }
    const z = (lo + hi) / 2;
    a = h / (2 * z); x0 = (ax + bx) / 2 - a * Math.asinh(v / (2 * a * Math.sinh(z))); C = ay - a * Math.cosh((ax - x0) / a);
  }
  for (let k = 0; k <= n; k++) {
    const q = k / n;
    let X, Y;
    if (h < 0.5) { const top = q < 0.5 ? ay : by, p = q < 0.5 ? q * 2 : 2 - q * 2; X = ax + h * q; Y = lerp(top, low, p); }
    else { X = ax + h * q; Y = a ? a * Math.cosh((X - x0) / a) + C : lerp(ay, by, q); }
    out[2 * k] = mx + X * c - Y * s; out[2 * k + 1] = my - X * s - Y * c;
  }
  return out;
}
function polyline(r, pts, n, col, wd = 1) { for (let k = 0; k < n; k++) r.stroke(pts[2 * k], pts[2 * k + 1], pts[2 * k + 2], pts[2 * k + 3], wd, col); }
// a brick of bills from the side: plain banded rectangles, the sheets' edge a line of the lighter role
function brick(r, x, y, w, h, u) {
  r.rect(x, y, w, h, COOL);
  r.rect(x, y, w, Math.max(1, 0.5 * u), LMID);
  r.rect(x + w * 0.4, y, Math.max(1, w * 0.2), h, BRIGHT);
}
// A bill in the air: it falls toward its terminal speed (`vt`), its sideways speed relaxes into the wind, it sways
// as it glides (a leaf's pendulum, the fall quickest through the bottom of each swing) and tumbles (it shows its
// width as the cosine of its turn); on the ground `gy(x)` it lies flat and still. b = {x, y, vx, vy, ph, om, ang, down}
function flyBill(b, dt, vt, wind, gy, sway) {
  if (b.down) return;
  b.ph += dt * 5;
  b.vy = follow(b.vy, vt * (0.6 + 0.8 * Math.abs(Math.cos(b.ph))), dt, 0.18);
  b.vx = follow(b.vx, wind, dt, 0.35);
  b.x += (b.vx + Math.sin(b.ph) * sway) * dt;
  b.y += b.vy * dt;
  b.ang += b.om * dt;
  const g = gy(b.x);
  if (b.y >= g) { b.y = g; b.down = true; b.ang = 0; }
}
function drawBill(r, b, bw, bh) {
  const k = b.down ? 1 : Math.max(0.15, Math.abs(Math.cos(b.ang))), w = Math.max(1, bw * k), h = Math.max(1, b.down ? bh * 0.5 : bh);
  r.rect(b.x - w / 2, b.y - h, w, h, COOL);
  if (w > 2) r.rect(b.x - Math.max(0.5, w * 0.1), b.y - h, Math.max(1, w * 0.2), h, BRIGHT);
}

// ---------------------------------------------------------------------------------------------- wiretap
// A listening post: a reel-to-reel deck at a constant tape speed (each reel turns at w = v/r, the packs trading
// radius as the tape winds across, a fast rewind when it runs out), two VU needles with a meter's ballistics, the
// intercepted call on a scope from the waveform, an agent in headphones who leans in on the snares, a coffee whose
// steam slows as it rises. Kinds: a rented flat, the back of a van, a basement. A drop: the door slides open and
// the light floods in over the floor, a figure stands in it and everything in its way throws a shadow at us.
const WIRE_W = { flat: [3, 2, 1], van: [2, 3, 2], basement: [1, 2, 3] };
// a reel face-on: the flange with three windows turned to `th`, the tape pack (radius rp) showing through them
function reel(r, cx, cy, Rf, rp, rh, th) {
  const N = r.N, buf = r.buf, wd = Rf * 0.56, wr2 = (Rf * 0.27) ** 2, rp2 = rp * rp, rh2 = rh * rh * 0.3, Rf2 = Rf * Rf, Ri2 = (Rf - 1) * (Rf - 1);
  const w0x = Math.cos(th) * wd, w0y = Math.sin(th) * wd, w1x = Math.cos(th + TAU / 3) * wd, w1y = Math.sin(th + TAU / 3) * wd, w2x = Math.cos(th - TAU / 3) * wd, w2y = Math.sin(th - TAU / 3) * wd;
  for (let y = Math.max(0, Math.floor(cy - Rf)); y <= Math.min(N - 1, cy + Rf); y++)
    for (let x = Math.max(0, Math.floor(cx - Rf)); x <= Math.min(N - 1, cx + Rf); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy;
      if (d2 > Rf2) continue;
      const win = (dx - w0x) ** 2 + (dy - w0y) ** 2 < wr2 || (dx - w1x) ** 2 + (dy - w1y) ** 2 < wr2 || (dx - w2x) ** 2 + (dy - w2y) ** 2 < wr2;
      buf[y * N + x] = d2 < rh2 ? LMID : win ? (d2 < rp2 ? DARK : BLACK) : d2 > Ri2 ? LMID : MID;
    }
}
// where the tape meets a pack of radius rp at (cx, cy) on its run to the post (gx, gy): the tangent point on the side
// a clockwise reel pays out from (sgn 1) or winds onto (sgn -1)
const TP = [0, 0];
function tangentPt(cx, cy, rp, gx, gy, sgn) {
  const d = Math.max(rp + 1e-3, Math.hypot(gx - cx, gy - cy)), b = Math.atan2(gy - cy, gx - cx), k = Math.acos(rp / d);
  for (let i = 0; i < 2; i++) {
    const a = i ? b - k : b + k, tx = cx + rp * Math.cos(a), ty = cy + rp * Math.sin(a);
    if (sgn * (-Math.sin(a) * (gx - tx) + Math.cos(a) * (gy - ty)) > 0) { TP[0] = tx; TP[1] = ty; return TP; }
  }
  TP[0] = cx; TP[1] = cy + rp;
  return TP;
}

const wiretap = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, WIRE_W, bandOf(W.a)), q: 0.1 + rnd() * 0.6, rew: false, thL: rnd() * TAU, thR: rnd() * TAU, nd: [0, 0, 0, 0], lean: 0, leanT: 0,
      door: 0, doorT: 0, steam: [], motes: [], peak: 0, trace: 0, cnt: 0, puff: 0, cord: new Float32Array(26) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, yh = 0.4 * N, fy = 0.58 * N, bs = beatS(f), bt = beatT(W);
    if (f.section === 'change') w.kind = rollW(rnd, WIRE_W, bandOf(W.a));
    if (f.section === 'drop') { w.doorT = 8 * bs; s.shake = Math.max(s.shake, 0.15); }
    for (const h of hits) {
      if (h.kind === 'snare') w.leanT = 0.5;
      else if (isLow(h)) w.peak = Math.max(w.peak, h.strength);
      else if (h.kind === 'hat') w.cnt++;
      if (isTonal(h)) w.trace = 1;
    }
    w.leanT -= dt; w.doorT -= dt;
    w.lean = follow(w.lean, w.leanT > 0 ? 1 : 0, dt, 0.12);
    w.door = clamp(w.door + dt * (w.doorT > 0 ? 1 / 0.45 : -1 / 0.7));
    w.peak *= Math.exp(-dt * 5); w.trace *= Math.exp(-dt * 3);
    const K = w.kind, open = ease(w.door), dl = 0.48 * N, dw = 0.23 * N, dtop = 0.125 * N, ow = dw * open, ink = open > 0.3 ? BLACK : FIG;
    // the wall by kind; the floor in perspective (eye line yh, seams at even steps of depth)
    r.rect(0, 0, N, fy, DARK + DIM);
    if (K === 'flat') {
      for (let x = 2 * u; x < N; x += 6 * u) r.rect(x, 0, Math.max(1, 0.6 * u), fy, MID + DIM);
      const wx = 0.78 * N, wy = 0.14 * N, ww = 0.17 * N, wh = 0.22 * N;
      r.rect(wx - u, wy - u, ww + 2 * u, wh + 2 * u, LMID + DIM);
      r.rect(wx, wy, ww, wh, BLACK);
      for (let k = 0; k < 10; k++) r.rect(wx + hash(k, 5) * (ww - u), wy + hash(k, 6) * (wh - u), Math.max(1, u), Math.max(1, u), hash(k, 7) < 0.5 ? HOT + DIM : BRIGHT + DIM);
      for (let y = wy; y < wy + wh * 0.8; y += 2.5 * u) r.rect(wx, y, ww, Math.max(1, 1.2 * u), MID + DIM);
      r.rect(0, fy - 2 * u, N, 2 * u, MID + DIM);
    } else if (K === 'van') {
      r.rect(0, 0, N, 0.05 * N, BLACK);
      for (let y = 0.1 * N; y < fy; y += 0.1 * N) r.rect(0, y, N, Math.max(1, u), MID + DIM);
      r.rect(0.77 * N, 0.2 * N, 0.19 * N, fy - 0.2 * N, DARK);
      for (let j = 0; j < 3; j++) {
        const lv = j === 0 ? f.low : j === 1 ? f.mid : f.high; // the rack's meters, a row a band
        r.rect(0.78 * N, 0.23 * N + j * 0.09 * N, 0.17 * N, 0.05 * N, BLACK);
        for (let k = 0; k < 6; k++) r.rect(0.79 * N + k * 0.026 * N, 0.245 * N + j * 0.09 * N, 2 * u, 1.5 * u, k < lv * 7 ? (j ? COOL : HOT) : DARK + DIM);
      }
    } else {
      for (let j = 0, y = 0; y < fy; j++, y += 4 * u) for (let x = (j % 2) * -5 * u; x < N; x += 10 * u) r.rect(x + 0.5 * u, y + 0.5 * u, 9 * u, 3 * u, MID + DIM);
      for (const py of [0.03, 0.07]) { r.rect(0, py * N, N, 2.5 * u, MID); r.rect(0, py * N, N, Math.max(1, 0.7 * u), LMID); }
      r.rect(0.8 * N, 0.11 * N, 0.14 * N, 0.08 * N, LMID + DIM);
      for (let x = 0.81 * N; x < 0.94 * N; x += 3 * u) r.rect(x, 0.11 * N, Math.max(1, u), 0.08 * N, DARK + DIM);
      r.rect(0.83 * N, 0.3 * N, 0.07 * N, 0.1 * N, MID + DIM);
      r.rect(0.85 * N, 0.33 * N, 0.03 * N, 0.04 * N, f.beat.pulse > 0.5 ? HOT : DARK + DIM);
    }
    r.rect(0, fy, N, N - fy, MID + DIM);
    for (let k = 1; k < 9; k++) r.rect(0, yh + (fy - yh) / (1 - k * 0.085), N, Math.max(1, 0.6 * u), DARK + DIM);
    for (let k = 0; k <= 12; k++) { const q = k / 12; r.rect(lerp(0.3, 0.92, q) * N, lerp(0.8, 0.585, q) * N + Math.sin(q * 6) * 0.01 * N, Math.max(1, u), Math.max(1, u), DARK); } // the tap line along the floor to the wall
    // the door: a frame, the opening (the lit hall, a figure in it) and the panel sliding away into the wall
    r.rect(dl - 1.5 * u, dtop - 1.5 * u, dw + 3 * u, fy - dtop + 1.5 * u, DARK);
    if (ow > 0.5) {
      r.rect(dl, dtop, ow, fy - dtop, WHITE);
      r.rect(dl, fy - 0.04 * N, ow, 0.04 * N, BRIGHT + DIM);
      if (open > 0.7) { walker(r, dl + 0.075 * N, fy, 0.41 * N, BLACK, 0, -1, { hat: true }); targets.push({ x: dl + 0.02 * N, y: fy - 0.41 * N, w: 0.11 * N, h: 0.41 * N }); }
    }
    const px = dl + ow, part = (x, y, wd, h, c) => { const x1 = Math.min(x + wd, dl + dw); if (x1 > x) r.rect(x, y, x1 - x, h, c); };
    if (dw - ow > 0.5) {
      r.rect(px, dtop, dw - ow, fy - dtop, MID + DIM);
      if (K === 'van') { part(px + 0.03 * N, dtop + 0.05 * N, dw - 0.06 * N, 0.11 * N, BLACK); part(px + 0.02 * N, dtop + 0.24 * N, 0.04 * N, 0.015 * N, LMID); }
      else if (K === 'flat') { part(px + 0.03 * N, dtop + 0.04 * N, dw - 0.06 * N, 0.16 * N, DARK + DIM); part(px + 0.03 * N, dtop + 0.25 * N, dw - 0.06 * N, 0.16 * N, DARK + DIM); part(px + 0.02 * N, dtop + 0.22 * N, 0.025 * N, 0.02 * N, LMID); }
      else for (let k = 0; k < 6; k++) { part(px + 0.015 * N, dtop + (0.03 + k * 0.075) * N, Math.max(1, u), Math.max(1, u), LMID + DIM); part(px + dw - 0.02 * N, dtop + (0.03 + k * 0.075) * N, Math.max(1, u), Math.max(1, u), LMID + DIM); }
    }
    // the light from the door over the floor, before anything in the room is drawn over it: the room's things are
    // boxes in depth that shade it (the table's legs and top, the chair, the agent), each at its feet's depth
    const hx = 0.645 * N, hy = 0.555 * N, ff = 0.76 * N, phi = 0.12 + 0.4 * w.lean, kx = hx - 0.2 * N, ky = hy - 0.01 * N, tt = 0.418 * N;
    const sx = hx - Math.sin(phi) * 0.23 * N, sy = hy - Math.cos(phi) * 0.23 * N, hcx = sx - Math.sin(phi) * 0.07 * N - 0.01 * N, hcy = sy - Math.cos(phi) * 0.075 * N;
    if (ow > 0.5) {
      const Zf = (yf) => (fy - yh) / (yf - yh), hAt = (y, z) => fy - yh - (y - yh) * z, XW = (x, z) => N / 2 + (x - N / 2) * z, obs = [];
      const box = (xa, xb, z, za, zb, hb, ht) => { const X0 = XW(xa, z), X1 = XW(xb, z); if (X1 > dl && X0 < dl + ow) obs.push(X0, X1, za, zb, hb, ht); };
      const zn = Zf(0.829 * N), zf = Zf(0.746 * N), zc = Zf(ff + 0.01 * N), za = Zf(ff), th = hAt(tt, zn);
      for (const lx of [0.03, 0.47]) box(lx * N, lx * N + 0.018 * N, zn, zn, zn, 0, th);
      for (const lx of [0.12, 0.476]) box(lx * N, lx * N + 0.014 * N, zf, zf, zf, 0, th);
      box(0.02 * N, 0.5 * N, zn, zn, zf, th - 0.012 * N, th);
      for (const lx of [-0.04, 0.085]) box(hx + lx * N, hx + (lx + 0.014) * N, zc, zc, zc, 0, hAt(hy, zc));
      box(hx - 0.05 * N, hx + 0.11 * N, zc, zc - 0.03, zc + 0.03, hAt(hy + 0.027 * N, zc), hAt(hy, zc));
      box(hx + 0.085 * N, hx + 0.101 * N, zc, zc, zc, 0, hAt(hy - 0.2 * N, zc));
      box(kx - 0.01 * N, kx + 0.045 * N, za, za, za, 0, hAt(ky, za));
      box(kx, hx, za, za - 0.02, za + 0.02, hAt(hy, za), hAt(ky - 0.03 * N, za));
      box(Math.min(sx, hcx) - 0.05 * N, hx + 0.05 * N, za, za - 0.02, za + 0.02, hAt(hy, za), hAt(hcy - 0.048 * N, za));
      doorLight(W, yh, fy, dl, dl + ow, dtop, 0.6 * N, obs);
    }
    // what stands on the floor: the table's far legs (nearer the middle, shorter), the chair's legs, the agent's
    // shins, the table's near legs, each in front of the one before
    for (const lx of [0.12, 0.476]) r.rect(lx * N, tt + 0.02 * N, 0.014 * N, 0.746 * N - tt - 0.02 * N, DARK);
    r.rect(hx - 0.04 * N, hy + 0.02 * N, 0.014 * N, ff + 0.01 * N - hy - 0.02 * N, ink);
    r.rect(hx + 0.085 * N, hy + 0.02 * N, 0.014 * N, ff + 0.01 * N - hy - 0.02 * N, ink);
    r.stroke(kx + 0.01 * N, ky, kx + 0.02 * N, ff - 0.01 * N, 0.05 * N, ink);
    r.rect(kx - 0.025 * N, ff - 0.022 * N, 0.06 * N, 0.022 * N, ink);
    for (const lx of [0.03, 0.47]) r.rect(lx * N, tt + 0.02 * N, 0.018 * N, 0.829 * N - tt - 0.02 * N, MID);
    // the agent on his chair: the seat and back, the thigh, the back leaning in on the snare, the head, the headphones
    r.rect(hx - 0.05 * N, hy + 0.005 * N, 0.16 * N, 0.022 * N, ink);
    r.rect(hx + 0.085 * N, hy - 0.2 * N, 0.016 * N, 0.22 * N, ink);
    r.stroke(hx, hy - 0.02 * N, kx, ky, 0.06 * N, ink);
    r.stroke(hx + 0.01 * N, hy - 0.02 * N, sx, sy, 0.095 * N, ink);
    r.disc(hcx, hcy, 0.048 * N, ink);
    for (let k = 0; k < 6; k++) { const a0 = Math.PI + 0.35 + (k / 6) * (Math.PI - 0.7), a1 = Math.PI + 0.35 + ((k + 1) / 6) * (Math.PI - 0.7); r.stroke(hcx + Math.cos(a0) * 0.058 * N, hcy + Math.sin(a0) * 0.058 * N, hcx + Math.cos(a1) * 0.058 * N, hcy + Math.sin(a1) * 0.058 * N, Math.max(1, 0.014 * N), LMID); }
    r.rect(hcx - 0.012 * N, hcy - 0.028 * N, 0.032 * N, 0.056 * N, LMID);
    r.rect(hcx - 0.004 * N, hcy - 0.016 * N, 0.016 * N, 0.032 * N, DARK);
    targets.push({ x: hx - 0.25 * N, y: hcy - 0.06 * N, w: 0.36 * N, h: ff - hcy + 0.06 * N });
    // the table top, seen edge-on just under the eye line
    r.rect(0.02 * N, tt, 0.48 * N, 0.022 * N, MID);
    r.rect(0.02 * N, tt, 0.48 * N, Math.max(1, 0.5 * u), LMID);
    // the deck: the tape runs out of the left pack round a post, over the head, round a post onto the right pack
    const X0 = 0.04 * N, DH = 0.27 * N, Y0 = tt - DH, DW = 0.24 * N, Rf = 0.056 * N, rh = 0.014 * N, rm = 0.053 * N, cyR = Y0 + 0.065 * N, cxL = X0 + 0.064 * N, cxR = X0 + 0.176 * N;
    r.rect(X0, Y0, DW, DH, MID);
    r.rect(X0, Y0, DW, Math.max(1, u), LMID);
    const sp = w.rew ? -10 : 1, v = sp * 0.092 * N; // 19 cm/s at this scale, ten times that back on the rewind
    w.q += (dt * sp) / 90;
    if (w.q >= 1) { w.q = 1; w.rew = true; } else if (w.q <= 0) { w.q = 0; w.rew = false; }
    const rpL = Math.sqrt(rh * rh + (1 - w.q) * (rm * rm - rh * rh)), rpR = Math.sqrt(rh * rh + w.q * (rm * rm - rh * rh));
    w.thL += (v / rpL) * dt; w.thR += (v / rpR) * dt; // the same tape speed on both: the smaller pack spins faster
    const gy = Y0 + 0.145 * N, gxL = X0 + 0.03 * N, gxR = X0 + 0.21 * N, hdx = X0 + 0.12 * N;
    r.rect(hdx - 0.016 * N, gy - 0.012 * N, 0.032 * N, 0.02 * N, LMID);
    r.rect(hdx - 0.003 * N, gy - 0.012 * N, Math.max(1, 0.006 * N), 0.02 * N, DARK);
    let T = tangentPt(cxL, cyR, rpL, gxL, gy, 1);
    r.line(T[0], T[1], gxL, gy, DARK);
    T = tangentPt(cxR, cyR, rpR, gxR, gy, -1);
    r.line(gxR, gy, T[0], T[1], DARK);
    r.line(gxL, gy + Math.max(1, 0.008 * N), gxR, gy + Math.max(1, 0.008 * N), DARK);
    for (const gx of [gxL, gxR]) r.disc(gx, gy, Math.max(1, 0.008 * N), LMID);
    reel(r, cxL, cyR, Rf, rpL, rh, w.thL);
    reel(r, cxR, cyR, Rf, rpR, rh, w.thR);
    // the meters: each needle a damped spring toward its aim (a VU's ballistics, about a third of a second)
    const my = Y0 + 0.175 * N, mh = 0.05 * N, mw = 0.095 * N, nd = w.nd, n = Math.ceil(dt / 0.004);
    for (let i = 0; i < 2; i++) {
      const aim = clamp(i ? f.level * (0.85 + 0.35 * f.rel.trebDrive) + 0.25 * w.peak : f.level * 1.15 + 0.3 * w.peak);
      for (let k = 0; k < n; k++) { const hh = dt / n; nd[2 * i + 1] += (150 * (aim - nd[2 * i]) - 20 * nd[2 * i + 1]) * hh; nd[2 * i] += nd[2 * i + 1] * hh; }
      const mx = X0 + 0.02 * N + i * 0.115 * N, a = -Math.PI / 2 + (clamp(nd[2 * i], -0.05, 1.05) - 0.5) * 1.6, pvx = mx + mw / 2, pvy = my + mh + 0.02 * N;
      r.rect(mx, my, mw, mh, BRIGHT + DIM);
      r.rect(mx + mw * 0.7, my + 0.008 * N, mw * 0.25, Math.max(1, 0.6 * u), HOT);
      r.line(pvx, pvy, pvx + Math.cos(a) * 0.065 * N, pvy + Math.sin(a) * 0.065 * N, BLACK);
      r.rect(mx - u, my + mh, mw + 2 * u, 0.025 * N, MID);
      if (nd[2 * i] > 0.85) r.disc(mx + mw - 0.01 * N, my - 0.012 * N, Math.max(1, 0.007 * N), HOT);
    }
    r.disc(X0 + 0.02 * N, Y0 + 0.247 * N, Math.max(1, 0.008 * N), bt % 1 < 0.4 ? HOT : HOT + DIM); // recording: a blink a beat
    for (let i = 0; i < 3; i++) r.rect(X0 + 0.05 * N + i * 0.022 * N, Y0 + 0.24 * N, 0.018 * N, 0.016 * N, SHADES[Math.floor(w.cnt / 4 ** i) % 4]); // the counter rolls on the hats
    targets.push({ x: X0, y: Y0, w: DW, h: DH });
    // the scope: the call as it comes in
    const sx0 = 0.3 * N, sy0 = tt - 0.13 * N, sw0 = 0.14 * N, sh0 = 0.13 * N, ix = sx0 + 0.012 * N, iy = sy0 + 0.012 * N, iw = sw0 - 0.024 * N, ih = sh0 - 0.035 * N;
    r.rect(sx0, sy0, sw0, sh0, DARK);
    r.rect(ix, iy, iw, ih, BLACK);
    for (let gx = 1; gx < 4; gx++) for (let gq = 1; gq < 3; gq++) r.set(ix + (gx * iw) / 4, iy + (gq * ih) / 3, DARK + DIM);
    const col = w.trace > 0.3 ? BRIGHT : COOL, ns = Math.max(4, Math.round(iw));
    let qx = ix, qy = iy + ih / 2;
    for (let i = 0; i <= ns; i++) {
      const x = ix + (i / ns) * (iw - 1), y = iy + ih / 2 + clamp(waveAt(f, i / ns, t) * 1.6, -0.48, 0.48) * ih;
      if (i) r.line(qx, qy, x, y, col);
      qx = x; qy = y;
    }
    r.rect(sx0 + sw0 - 0.03 * N, sy0 + sh0 - 0.018 * N, Math.max(1, 0.008 * N), Math.max(1, 0.008 * N), f.rel.trebDrive > 0.5 ? COOL : DARK + DIM);
    // the coffee, his hand by it tapping the beat (down on the beat) or up at the ear cup while he leans in; the cord
    const cx = 0.47 * N;
    r.rect(cx - 0.014 * N, tt - 0.045 * N, 0.028 * N, 0.045 * N, LMID);
    r.ring(cx + 0.02 * N, tt - 0.025 * N, 0.009 * N, Math.max(1, 0.5 * u), LMID);
    r.rect(cx - 0.012 * N, tt - 0.045 * N, 0.024 * N, Math.max(1, 0.5 * u), DARK);
    const lean = w.lean > 0.5, tap = Math.sin(Math.PI * (bt % 1)) ** 2;
    arm(r, sx, sy + 0.015 * N, lean ? hcx + 0.02 * N : 0.43 * N, lean ? hcy + 0.005 * N : tt - 0.006 * N - 0.014 * N * tap, 0.27 * N, -1, 0.04 * N, ink);
    const jx = X0 + DW - 0.012 * N, jy = Y0 + DH - 0.03 * N, cd = Math.hypot(hcx - jx, hcy + 0.028 * N - jy);
    polyline(r, catenary(hcx, hcy + 0.028 * N, jx, jy, cd * 1.15, 0, 12, w.cord), 12, DARK);
    // dust turning in the light
    if (ow > 0.5) {
      while (w.motes.length < 24) w.motes.push({ x: dl - 0.1 * N + rnd() * (dw + 0.3 * N), y: fy + rnd() * (N - fy), p: rnd() * TAU });
      for (const m of w.motes) {
        if ((m.y -= dt * 0.012 * N) < fy) m.y = N - 1;
        const x = m.x + Math.sin(t * 0.7 + m.p) * 0.012 * N;
        if (isLit(W, x, m.y)) r.set(x, m.y, BRIGHT);
      }
    } else w.motes.length = 0;
    // the steam: a puff at a time off the cup, more with the level, blown off by the draught while the door is open
    for (w.puff -= dt; w.puff <= 0; w.puff += 0.1 / (0.5 + f.level)) {
      w.steam.push({ x: cx + (rnd() - 0.5) * 0.01 * N, y: tt - 0.047 * N, vx: 0, vy: -0.04 * N, rise: 0.07 * N, rad: 0.006 * N, grow: 0.012 * N, life: 1.8, max: 1.8, dens: 0.5 });
    }
    w.steam = smoke(W, w.steam, LMID, -0.3 * N * open);
  },
};

// ---------------------------------------------------------------------------------------------- stakeout
// Inside a parked car at night, from the back seat: the dash, two silhouettes, rain beading on the windscreen and the
// wipers sweeping up and back once a beat (each blade turning about its pivot, clearing the drops it passes), a
// coffee steaming on the dash; across the street the target's lit window with someone pacing in it. A snare raises
// the binoculars, a kick is the shutter (a white frame on the window for one beat), a hat sends a drop running, a
// note flickers the set inside. Kinds: what is watched, a motel, a tenement, a warehouse. A drop: the target walks
// out, the headlights come on and the car pulls out after them (the street slides by, the far towers slower), then
// the cut back to the wait.
const STAKE_W = { motel: [3, 2, 1], tenement: [2, 3, 2], warehouse: [1, 2, 3] };
const BLDG = { motel: { top: 0.2, floors: 2, tf: 1 }, tenement: { top: 0.08, floors: 4, tf: 2 }, warehouse: { top: 0.12, floors: 3, tf: 2 } };
// a rect clipped to the box bx0..bx1, by0..by1 (a window the figure is seen through)
function clipRect(r, x, y, w, h, c, bx0, by0, bx1, by1) { const x0 = Math.max(x, bx0), y0 = Math.max(y, by0), x1 = Math.min(x + w, bx1), y1 = Math.min(y + h, by1); if (x1 > x0 && y1 > y0) r.rect(x0, y0, x1 - x0, y1 - y0, c); }

const stakeout = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, STAKE_W, bandOf(W.a)), drops: [], streaks: [], steam: [], wipe: [Math.PI, Math.PI], bino: 0, binoT: 0, snap: 0, tv: 0, pace: rnd() * TAU, bob: 0,
      dp: null, cam: 0, vcam: 0, lights: 0, cut: 0, puff: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bs = beatS(f), bt = beatT(W), band = bandOf(W.a), base = 0.47 * N, dash = 0.66 * N;
    if (f.section === 'change' && !w.dp) w.kind = rollW(rnd, STAKE_W, band);
    const K = BLDG[w.kind], fh = (base - K.top * N) / K.floors, tb = 5, wx0 = tb * 0.12 + 0.03; // the target's bay and its window's left edge (world, in screens)
    if (f.section === 'drop' && !w.dp) { w.dp = { t: 0, x: tb * 0.12 + 0.06, ph: 0 }; s.shake = Math.max(s.shake, 0.1); }
    for (const h of hits) {
      if (h.kind === 'snare') w.binoT = 1.2;
      else if (isLow(h)) w.snap = bs;
      else if (h.kind === 'hat' && w.drops.length) { const d = pick(rnd, w.drops); d.vy = 0.15 * N; d.oy = d.y; }
      if (isTonal(h)) w.tv = 0.3;
    }
    w.binoT -= dt; w.snap -= dt; w.tv -= dt; w.cut -= dt;
    w.bino = follow(w.bino, w.binoT > 0 ? 1 : 0, dt, 0.15);
    // the drop: the target out of the door and away along the far pavement, the car after them, then the cut
    const D = w.dp;
    if (D) {
      D.t += dt;
      if (D.t > 0.5) { const st = 0.06 * dt; D.x += st; D.ph += st / (0.1 * 0.076); } // a radian of stride every tenth of the height walked: the planted foot keeps still
      // the car rolls out and keeps pace a little behind: its speed eases toward closing the gap (no faster than it
      // can pick up speed), so the street slides by quickly at first, then at the walker's pace
      if (D.t > 1.2) w.vcam = follow(w.vcam, clamp((D.x - 0.55 - w.cam) * 1.6, 0, 0.3), dt, 0.6);
      w.cam += w.vcam * dt;
      if (D.t > 16 * bs) { w.dp = null; w.cam = w.vcam = 0; w.cut = 0.25; }
    }
    w.lights = follow(w.lights, D && D.t > 0.3 ? 1 : 0, dt, 0.08);
    const cam = w.cam, X = (wx) => (wx - cam) * N;
    // the night: sky, far towers (half the slide, they are further), the building across the street by kind
    r.rect(0, 0, N, dash, DARK + DIM);
    for (let b = Math.floor(cam * 0.5 / 0.09) - 1, e = b + 14; b < e; b++) {
      const x = (b * 0.09 - cam * 0.5) * N, hgt = (0.12 + 0.2 * hash(b, 3)) * N;
      r.rect(x, base - fh - hgt * 0.6 - 0.1 * N, 0.08 * N, hgt, BLACK);
      for (let k = 0; k < 4; k++) if (hash(b, k + 9) < 0.35) r.rect(x + (0.01 + 0.015 * k) * N, base - fh - hgt * 0.6 - 0.07 * N + hash(k, b) * hgt * 0.5, Math.max(1, u), Math.max(1, u), HOT + DIM);
    }
    r.rect(0, K.top * N, N, base - K.top * N, DARK);
    for (let b = Math.floor(cam / 0.12) - 1, e = b + 11; b < e; b++) {
      const bx = X(b * 0.12);
      if (w.kind === 'tenement' && b % 3 === 0) for (let k = 1; k < K.floors; k++) { const y = K.top * N + k * fh; r.rect(bx, y - u, 0.12 * N, Math.max(1, u), MID + DIM); r.line(bx + 0.01 * N, y, bx + 0.11 * N, y - fh + u, MID + DIM); } // the fire escape
      for (let k = 0; k < K.floors; k++) {
        const y0 = K.top * N + k * fh + fh * 0.25, isT = b === tb && k === K.floors - 1 - K.tf;
        if (w.kind === 'warehouse' && k > 0) { if (k === K.floors - 1 && b % 2 === 0) { r.rect(bx + 0.015 * N, y0, 0.09 * N, fh * 0.75, MID + DIM); for (let y = y0; y < y0 + fh * 0.75; y += 2 * u) r.rect(bx + 0.015 * N, y, 0.09 * N, Math.max(1, 0.5 * u), DARK + DIM); } continue; }
        if (isT) continue;
        const lit = hash(b, k * 7 + 3) < 0.28;
        r.rect(bx + 0.03 * N, y0, 0.06 * N, fh * 0.5, lit ? (hash(b, k) < 0.5 ? HOT + DIM : LMID + DIM) : BLACK);
      }
      if (w.kind === 'motel') { r.rect(bx, K.top * N + fh - u, 0.12 * N, Math.max(1, u), MID + DIM); for (let k = 0; k < 4; k++) r.rect(bx + k * 0.03 * N, K.top * N + fh * 0.7, Math.max(1, 0.5 * u), fh * 0.3, MID + DIM); r.rect(bx + 0.045 * N, base - fh * 0.6, 0.03 * N, fh * 0.6, BLACK); }
    }
    // the target's window: lit, a set flickering on the notes, someone pacing the room (seen to the waist, the head
    // bobbing with each step); the door under it, and the frame the shutter leaves for a beat
    const tfy = K.top * N + (K.floors - 1 - K.tf) * fh + fh * 0.25, twx = X(wx0), tww = 0.06 * N, twh = fh * 0.5;
    r.rect(twx, tfy, tww, twh, w.tv > 0 && Math.floor(t * 20) % 2 ? LMID : BRIGHT);
    if (!D) {
      const sp = 0.7 + 1.1 * f.rel.midDrive, px = twx + tww / 2 + Math.sin((w.pace += dt * sp * 0.5)) * tww * 0.9, ph = 0.004 * N;
      w.bob += dt * sp * 0.5 * Math.abs(Math.cos(w.pace)) * 6;
      const hy = tfy + twh * 0.3 + Math.abs(Math.sin(w.bob)) * ph;
      clipRect(r, px - 0.012 * N, hy + 0.012 * N, 0.024 * N, twh, BLACK, twx, tfy, twx + tww, tfy + twh);
      for (let yy = Math.floor(hy - 0.01 * N); yy <= hy + 0.01 * N; yy++) for (let xx = Math.floor(px - 0.01 * N); xx <= px + 0.01 * N; xx++) if ((xx + 0.5 - px) ** 2 + (yy + 0.5 - hy) ** 2 < (0.01 * N) ** 2 && xx >= twx && xx < twx + tww && yy >= tfy) r.set(xx, yy, BLACK);
    }
    r.rect(twx + tww * 0.25, base - fh * 0.62, tww * 0.5, fh * 0.62, D && D.t < 1 ? BRIGHT : MID + DIM);
    if (w.snap > 0) r.frame(Math.round(twx - 2 * u), Math.round(tfy - 2 * u), Math.round(tww + 4 * u), Math.round(twh + 4 * u), WHITE);
    targets.push({ x: twx, y: tfy, w: tww, h: twh });
    // the pavement, the street lamps (their pools), the road with its dashes, the lot we are parked on
    r.rect(0, base, N, 0.02 * N, MID + DIM);
    for (let k = Math.floor(cam / 0.9) - 1; k < Math.floor(cam / 0.9) + 3; k++) {
      const lx = X(0.25 + k * 0.9);
      ditherPoly(r, [[lx - 0.01 * N, 0.27 * N], [lx + 0.01 * N, 0.27 * N], [lx + 0.09 * N, base + 0.02 * N], [lx - 0.09 * N, base + 0.02 * N]], LMID + DIM, 0.3);
      r.rect(lx - 0.004 * N, 0.27 * N, Math.max(1, 0.008 * N), base - 0.27 * N, BLACK);
      r.rect(lx - 0.015 * N, 0.262 * N, 0.03 * N, 0.01 * N, BRIGHT);
    }
    r.rect(0, base + 0.02 * N, N, 0.09 * N, DARK + DIM);
    for (let k = Math.floor(cam / 0.16) - 1; k < Math.floor(cam / 0.16) + 8; k++) r.rect(X(k * 0.16), base + 0.06 * N, 0.07 * N, Math.max(1, 0.6 * u), LMID + DIM);
    r.rect(0, base + 0.11 * N, N, dash - base - 0.11 * N, MID + DIM);
    // the target out on the pavement on the drop
    if (D && D.t > 0.5) { const hP = 0.076 * N, x = X(D.x); walker(r, x, base + 0.01 * N, hP, BLACK, D.ph, 1, { hat: true, coat: true }); targets.push({ x: x - hP * 0.3, y: base - hP, w: hP * 0.6, h: hP }); }
    // headlights: two beams over the ground and the far wall, from under the dash
    if (w.lights > 0.05) for (const k of [-1, 1]) {
      ditherPoly(r, [[0.5 * N + k * 0.04 * N, dash], [0.5 * N + k * 0.32 * N, dash], [0.5 * N + k * 0.17 * N, base + 0.02 * N], [0.5 * N + k * 0.05 * N, base + 0.02 * N]], LIGHT, w.lights);
      ditherPoly(r, [[0.5 * N + k * 0.05 * N, base + 0.02 * N], [0.5 * N + k * 0.17 * N, base + 0.02 * N], [0.5 * N + k * 0.17 * N, base - 0.05 * N], [0.5 * N + k * 0.05 * N, base - 0.05 * N]], LIGHT, w.lights * 0.7);
    }
    // rain falling outside, more with the level, slanting back past us once the car is moving
    const want = Math.round((20 + 70 * f.level) * (0.6 + 0.2 * band)), sl = 0.1 + w.vcam;
    while (w.streaks.length < want) w.streaks.push({ x: rnd() * N, y: rnd() * dash });
    if (w.streaks.length > want) w.streaks.length = want;
    for (const p of w.streaks) { p.y += dt * 0.9 * N; p.x -= dt * sl * N; if (p.y > dash) { p.y = 0; p.x = rnd() * N * (1 + sl); } r.line(p.x, p.y, p.x + sl * 0.033 * N, p.y - 0.03 * N, LMID + DIM); }
    // the drops on the glass: they bead at a rate with the level, the big ones creep, a hat sends one running
    const roofY = (x) => 0.04 * N + 0.05 * N * ((x - 0.5 * N) / (0.5 * N)) ** 2;
    for (let k = rnd() * 1; k < dt * (12 + 50 * f.level); k++) if (w.drops.length < 140) w.drops.push({ x: rnd() * N, y: 0.06 * N + rnd() * (dash - 0.06 * N), s: rnd() < 0.2 ? 2 : 1, vy: 0 });
    const piv = [[0.27 * N, dash + 0.01 * N, 0.4 * N], [0.69 * N, dash + 0.01 * N, 0.36 * N]], A = 1.75, ph = bt % 1;
    const now = Math.PI + A * Math.sin(Math.PI * ph) ** 2; // a crank's sweep: up and back once a beat, slowing to turn at both ends
    w.drops = w.drops.filter((d) => {
      if (d.vy) { d.y += d.vy * dt; if (d.y > dash) return false; r.line(d.x, d.oy, d.x, d.y, LMID + DIM); }
      else if (d.s > 1) { d.y += 0.012 * N * dt; if (d.y > dash) return false; } // a big one is heavy enough to creep down the glass
      for (let i = 0; i < 2; i++) {
        const [px, py, L] = piv[i], dx = d.x - px, dy = d.y - py, rr = Math.hypot(dx, dy);
        if (dy >= 0 || rr > L || rr < 0.2 * L) continue; // only the blade wipes (0.2 L out to L), not the arm
        const a = Math.atan2(dy, dx) + TAU, lo = Math.min(w.wipe[i], now), hi = Math.max(w.wipe[i], now);
        if (a >= lo && a <= hi) return false; // the blade went over it
      }
      r.rect(d.x, d.y, Math.max(1, d.s * u * 0.8), Math.max(1, d.s * u * 0.8), LMID);
      if (d.s > 1) r.set(d.x, d.y, BRIGHT);
      return true;
    });
    w.wipe[0] = w.wipe[1] = now;
    // the car: roof, pillars, mirror, dash with its glow, the wipers, the coffee
    for (let x = 0; x < N; x++) r.rect(x, 0, 1, roofY(x), BLACK);
    r.poly([[0, 0], [0.1 * N, 0], [0.05 * N, dash], [0, dash]], BLACK);
    r.poly([[N, 0], [0.9 * N, 0], [0.95 * N, dash], [N, dash]], BLACK);
    r.rect(0.5 * N - u, 0, Math.max(1, 2 * u), 0.1 * N, BLACK);
    r.rect(0.43 * N, 0.09 * N, 0.14 * N, 0.045 * N, BLACK);
    r.rect(0.44 * N, 0.1 * N, 0.12 * N, Math.max(1, 0.5 * u), LMID + DIM);
    for (const [px, py, Lw] of piv) {
      const ca = Math.cos(now), sa = Math.sin(now);
      r.stroke(px, py, px + ca * Lw * 0.25, py + sa * Lw * 0.25, Math.max(1, 0.014 * N), BLACK);
      r.stroke(px + ca * Lw * 0.2, py + sa * Lw * 0.2, px + ca * Lw, py + sa * Lw, Math.max(1, 0.008 * N), BLACK);
    }
    r.rect(0, dash, N, N - dash, BLACK);
    r.rect(0.47 * N, dash + 0.06 * N, 0.08 * N, 0.025 * N, f.rel.bassDrive > 0.5 ? HOT : HOT + DIM);
    for (const gx of [0.22, 0.32]) r.ring(gx * N, dash + 0.06 * N, 0.025 * N, Math.max(1, 0.6 * u), COOL + DIM);
    const cx = 0.51 * N;
    r.rect(cx - 0.014 * N, dash - 0.045 * N, 0.028 * N, 0.045 * N, MID);
    r.rect(cx - 0.016 * N, dash - 0.05 * N, 0.032 * N, 0.008 * N, LMID);
    for (w.puff -= dt; w.puff <= 0; w.puff += 0.12 / (0.5 + f.level)) { w.steam.push({ x: cx + (rnd() - 0.5) * 0.01 * N, y: dash - 0.05 * N, vx: 0, vy: -0.04 * N, rise: 0.06 * N, rad: 0.006 * N, grow: 0.012 * N, life: 1.6, max: 1.6, dens: 0.45 }); }
    w.steam = smoke(W, w.steam, LMID);
    // the two in front, from behind: driver at the wheel (the camera up to the eye on a shot), passenger (binoculars)
    r.ring(0.27 * N, 0.8 * N, 0.17 * N, Math.max(2, 0.025 * N), BLACK);
    for (const [hx, hy, i] of [[0.27 * N, 0.52 * N, 0], [0.75 * N, 0.53 * N, 1]]) {
      r.poly([[hx - 0.15 * N, N], [hx - 0.13 * N, hy + 0.13 * N], [hx - 0.06 * N, hy + 0.08 * N], [hx + 0.06 * N, hy + 0.08 * N], [hx + 0.13 * N, hy + 0.13 * N], [hx + 0.15 * N, N]], BLACK);
      r.rect(hx - 0.025 * N, hy + 0.03 * N, 0.05 * N, 0.06 * N, BLACK);
      r.disc(hx, hy, 0.07 * N, BLACK);
      if (i === 1 && w.bino > 0.05) { // the elbows come up and out, the glasses' barrels show either side of the head
        const by = hy + (1 - w.bino) * 0.12 * N;
        for (const k of [-1, 1]) { r.stroke(hx + k * 0.13 * N, hy + 0.14 * N, hx + k * 0.12 * N, by + 0.04 * N, 0.04 * N, BLACK); r.rect(hx + k * 0.065 * N - (k < 0 ? 0.03 * N : 0), by - 0.02 * N, 0.03 * N, 0.035 * N, BLACK); }
      }
      if (i === 0 && w.snap > 0) { r.stroke(hx - 0.12 * N, hy + 0.14 * N, hx - 0.09 * N, hy + 0.02 * N, 0.04 * N, BLACK); r.rect(hx - 0.13 * N, hy - 0.03 * N, 0.07 * N, 0.04 * N, BLACK); }
      // the headrest (nearer us than the head) on its two posts, the seat's back with rounded shoulders
      for (const k of [-1, 1]) r.rect(hx + k * 0.035 * N - 0.004 * N, hy + 0.12 * N, Math.max(1, 0.008 * N), 0.07 * N, MID);
      r.poly([[hx - 0.065 * N, hy + 0.075 * N], [hx - 0.05 * N, hy + 0.05 * N], [hx + 0.05 * N, hy + 0.05 * N], [hx + 0.065 * N, hy + 0.075 * N], [hx + 0.065 * N, hy + 0.125 * N], [hx - 0.065 * N, hy + 0.125 * N]], DARK);
      r.rect(hx - 0.05 * N, hy + 0.052 * N, 0.1 * N, Math.max(1, 0.5 * u), MID);
      r.poly([[hx - 0.14 * N, N], [hx - 0.14 * N, hy + 0.22 * N], [hx - 0.1 * N, hy + 0.18 * N], [hx + 0.1 * N, hy + 0.18 * N], [hx + 0.14 * N, hy + 0.22 * N], [hx + 0.14 * N, N]], DARK);
      r.rect(hx - 0.1 * N, hy + 0.182 * N, 0.2 * N, Math.max(1, 0.5 * u), MID);
      targets.push({ x: hx - 0.07 * N, y: hy - 0.07 * N, w: 0.14 * N, h: 0.14 * N });
    }
    if (w.cut > 0) r.fill(BLACK);
  },
};

// ---------------------------------------------------------------------------------------------- hotbox
// A smoky den seen from where the TV is: a couch with two sunk into it, a lava lamp in the near corner, a glass
// water pipe on the low table (a prop: an ember, bubbles, smoke), a cat on the couch's arm. The lamp's wax is
// heated in the pool at the bottom, rises by buoyancy (warm wax is lighter, the bigger blob the quicker), cools at the
// top and sinks; blobs merge and split and the volume is kept. The pipe's chamber bubbles on the beat, each bubble
// rising to its terminal speed; a kick is a big exhale (smoke rising on its warmth, slowing, spreading, thinning),
// the TV's flicker on everything goes with the treble, a snare flicks the cat's tail. Kinds: a lounge, a
// panelled basement, a dorm with lights on a string. A drop: a haze rises off the floor and clears over two bars.
const DEN_W = { lounge: [3, 2, 1], basement: [2, 3, 2], dorm: [1, 2, 3] };
// the wax: blobs {x, y, v, T, vol} in a glass of height 1 (y from the bottom), a pool of volume `pool` at the bottom
// heated at `heat`; a blob's radius goes as the cube root of its volume
const blobR = (vol) => 0.16 * Math.cbrt(vol);
function lavaStep(L, dt, heat, rnd) {
  const hp = 0.05 + 0.06 * L.pool;
  L.T = Math.min(1, L.T + heat * dt);
  if (L.T > 0.72 && L.pool > 0.5 && L.blobs.length < 6) { // a blob pulls free of the pool
    const vol = 0.2 + 0.25 * rnd();
    L.pool -= vol; L.T -= 0.2;
    L.blobs.push({ x: (rnd() - 0.5) * 0.06, y: hp + blobR(vol) * 0.6, v: 0, T: 0.8, vol });
  }
  for (const b of L.blobs) {
    const r = blobR(b.vol);
    b.T += b.y < 0.15 ? heat * dt : (0.62 - 0.45 * b.y - b.T) * 0.4 * dt; // the bottom heats it, the column above cools it (the top most)
    const vt = clamp(1.1 * (b.T - 0.5) * (r / 0.12) ** 2, -0.3, 0.3); // its buoyancy against the drag: a terminal speed
    b.v = follow(b.v, vt, dt, 0.25);
    b.y += b.v * dt;
    b.x = clamp(b.x + Math.sin(b.y * 9 + b.vol * 20) * 0.02 * dt, -0.08 + r * 0.3, 0.08 - r * 0.3);
    if (b.y > 1 - r * 0.8) { b.y = 1 - r * 0.8; b.v = Math.min(b.v, 0); }
  }
  for (let i = 0; i < L.blobs.length; i++) { // touching blobs run together; a big quick one tears in two
    const a = L.blobs[i];
    if (a.y - blobR(a.vol) * 0.6 < hp && a.v <= 0) { L.T = (L.T * L.pool + a.T * a.vol) / (L.pool + a.vol); L.pool += a.vol; L.blobs.splice(i--, 1); continue; }
    for (let j = i + 1; j < L.blobs.length; j++) {
      const b = L.blobs[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.55 * (blobR(a.vol) + blobR(b.vol))) {
        const vol = a.vol + b.vol;
        Object.assign(a, { x: (a.x * a.vol + b.x * b.vol) / vol, y: (a.y * a.vol + b.y * b.vol) / vol, v: (a.v * a.vol + b.v * b.vol) / vol, T: (a.T * a.vol + b.T * b.vol) / vol, vol });
        L.blobs.splice(j--, 1);
      }
    }
    if (a.vol > 0.45 && Math.abs(a.v) > 0.12 && L.blobs.length < 7) {
      const half = a.vol / 2, d = blobR(half) * 1.15 * Math.sign(a.v);
      a.vol = half;
      L.blobs.push({ x: a.x + 0.01, y: a.y - d, v: a.v * 0.6, T: a.T, vol: half });
      a.y += d * 0.3;
    }
  }
}
// someone sunk into a couch, from the front: the knees toward us, shins to the floor, the body slid down and over
// by `lean`, the head lolling by `nod`; one arm along the couch's back. Returns the mouth.
function slumped(r, x, seat, floor, h, col, lean, nod, side) {
  for (const k of [-1, 1]) { r.rect(x + k * h * 0.1 - h * 0.035, seat - h * 0.02, h * 0.07, floor - seat + h * 0.02, col); r.rect(x + k * h * 0.1 - h * 0.045, floor - h * 0.025, h * 0.09, h * 0.025, col); }
  r.rect(x - h * 0.15, seat - h * 0.06, h * 0.3, h * 0.07, col);
  const hipY = seat - h * 0.04, sx = x + lean * h * 0.08, sy = hipY - h * 0.22;
  r.poly([[x - h * 0.11, hipY], [x + h * 0.11, hipY], [sx + h * 0.12, sy + h * 0.03], [sx - h * 0.12, sy + h * 0.03]], col);
  r.rect(sx - h * 0.12, sy, h * 0.24, h * 0.04, col);
  r.stroke(sx + side * h * 0.11, sy + h * 0.02, sx + side * h * 0.3, sy - h * 0.02, h * 0.05, col);
  r.stroke(sx - side * h * 0.11, sy + h * 0.02, x - side * h * 0.05, seat - h * 0.07, h * 0.05, col);
  const hx = sx + nod * h * 0.035, hy = sy - h * 0.07 + Math.abs(nod) * h * 0.012;
  r.rect(sx - h * 0.025, sy - h * 0.03, h * 0.05, h * 0.04, col);
  r.disc(hx, hy, h * 0.065, col);
  return [hx + nod * h * 0.01, hy + h * 0.035];
}

const hotbox = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, DEN_W, bandOf(W.a)), lava: { pool: 1.4, T: 0.5, blobs: [{ x: 0, y: 0.6, v: 0, T: 0.5, vol: 0.3 }] }, bubbles: [], puffs: [], wisp: [], ember: 0,
      haze: null, tail: 0, flick: 0, tv: 0.5, who: 0, nod: [0, 0], wispT: 0, exhale: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, bs = beatS(f), band = bandOf(W.a), beat = beatTick(w, f, dt);
    if (f.section === 'change') w.kind = rollW(rnd, DEN_W, band);
    if (f.section === 'drop') w.haze = { t: 0 };
    const seat = 0.6 * N, floor = 0.72 * N, h = 0.5 * N, xs = [0.39 * N, 0.62 * N], mouths = [];
    w.tv = follow(w.tv, 0.35 + 0.55 * f.rel.trebDrive, dt, 0.08);
    for (const hh of hits) {
      if (hh.kind === 'kick') w.exhale++;
      else if (hh.kind === 'snare') w.flick = 1;
      else if (hh.kind === 'hat') w.tv = Math.min(1, w.tv + 0.3);
      if (isTonal(hh)) { const b = w.lava.blobs[hh.pc % Math.max(1, w.lava.blobs.length)]; if (b) b.T = Math.min(1, b.T + 0.15); }
    }
    w.flick *= Math.exp(-dt * 3);
    // the room by kind
    r.rect(0, 0, N, floor, DARK + DIM);
    if (w.kind === 'lounge') {
      r.rect(0.52 * N, 0.08 * N, 0.26 * N, 0.24 * N, BLACK);
      r.disc(0.72 * N, 0.13 * N, 0.025 * N, BRIGHT + DIM);
      for (let k = 0; k < 8; k++) r.set(0.53 * N + hash(k, 41) * 0.24 * N, 0.09 * N + hash(k, 42) * 0.22 * N, LMID + DIM);
      r.frame(Math.round(0.52 * N), Math.round(0.08 * N), Math.round(0.26 * N), Math.round(0.24 * N), MID + DIM);
      r.rect(0.65 * N - 0.5 * u, 0.08 * N, Math.max(1, u), 0.24 * N, MID + DIM);
    } else if (w.kind === 'basement') {
      for (let x = 0; x < N; x += 7 * u) r.rect(x, 0, Math.max(1, 0.7 * u), floor, MID + DIM);
      r.rect(0.6 * N, 0.04 * N, 0.2 * N, 0.07 * N, LMID + DIM);
      for (const rr of [0.07, 0.05, 0.03, 0.012]) r.disc(0.24 * N, 0.2 * N, rr * N, rr === 0.05 || rr === 0.012 ? HOT + DIM : MID + DIM);
    } else {
      r.rect(0.08 * N, 0.12 * N, 0.13 * N, 0.18 * N, MID + DIM); r.disc(0.145 * N, 0.2 * N, 0.04 * N, HOT + DIM);
      r.rect(0.66 * N, 0.14 * N, 0.12 * N, 0.17 * N, COOL + DIM); r.poly([[0.72 * N, 0.17 * N], [0.76 * N, 0.27 * N], [0.68 * N, 0.27 * N]], DARK + DIM);
      const pts = catenary(0.03 * N, 0.05 * N, 0.97 * N, 0.05 * N, 1.06 * N, 0, 16, w.str || (w.str = new Float32Array(34)));
      polyline(r, pts, 16, MID + DIM);
      for (let k = 1; k < 16; k += 1.5) { const i = Math.floor(k), on = (i + (f.beat.count & 1)) % 2 === 0; r.disc(pts[2 * i], pts[2 * i + 1] + 1.5 * u, Math.max(1, 1.2 * u), on ? (i % 3 ? HOT : COOL) : DARK); }
    }
    r.rect(0, floor, N, N - floor, MID + DIM);
    for (let y = floor + 3 * u; y < N; y += 5 * u) for (let x = (y / u) % 2 ? 0 : 3 * u; x < N; x += 6 * u) r.rect(x, y, Math.max(1, u), Math.max(1, u), DARK + DIM);
    // the couch against the wall, the two on it, the cat on the right arm
    r.rect(0.17 * N, 0.42 * N, 0.66 * N, seat - 0.42 * N, MID);
    r.rect(0.17 * N, 0.42 * N, 0.66 * N, Math.max(1, u), LMID);
    r.rect(0.17 * N, seat, 0.66 * N, floor - seat - 0.02 * N, DARK);
    r.rect(0.2 * N, seat - 0.02 * N, 0.6 * N, 0.03 * N, LMID);
    for (const ax of [0.15, 0.79]) { r.rect(ax * N, 0.5 * N, 0.06 * N, floor - 0.5 * N - 0.02 * N, MID); r.rect(ax * N, 0.5 * N, 0.06 * N, Math.max(1, u), LMID); }
    for (let i = 0; i < 2; i++) {
      w.nod[i] = follow(w.nod[i], Math.sin(f.rel.bassClock * 0.9 + i * 2) * 0.8 + (f.beat.pulse > 0.6 ? 0.3 : 0), dt, 0.25); // heads loll with the bass and dip on the beat
      mouths.push(slumped(r, xs[i], seat, floor, h, FIG, i ? 0.6 : -0.5, w.nod[i], i ? 1 : -1));
      targets.push({ x: xs[i] - 0.08 * N, y: seat - 0.2 * N, w: 0.16 * N, h: floor - seat + 0.2 * N });
    }
    const cx = 0.82 * N, cy = 0.5 * N;
    w.tail += dt * (1.2 + 6 * w.flick);
    r.rect(cx - 0.025 * N, cy - 0.05 * N, 0.05 * N, 0.05 * N, BLACK);
    r.disc(cx - 0.005 * N, cy - 0.065 * N, 0.022 * N, BLACK);
    for (const k of [-1, 1]) r.poly([[cx - 0.005 * N + k * 0.02 * N, cy - 0.08 * N - (w.flick > 0.3 && k > 0 ? 0.006 * N : 0)], [cx - 0.005 * N + k * 0.006 * N, cy - 0.07 * N], [cx - 0.005 * N + k * 0.02 * N, cy - 0.06 * N]], BLACK);
    let tx = cx + 0.025 * N, ty = cy - 0.005 * N;
    for (let k = 0; k < 6; k++) { const a = -0.3 + Math.sin(w.tail - k * 0.6) * (0.5 + 0.6 * w.flick) - k * 0.25, nx = tx + Math.cos(a) * 0.012 * N, ny = ty + Math.sin(a) * 0.012 * N; r.stroke(tx, ty, nx, ny, Math.max(1, 0.01 * N), BLACK); tx = nx; ty = ny; }
    // the low table and the pipe on it: a chamber of water, the neck, the stem down into the water with the bowl
    const tt = 0.745 * N;
    r.rect(0.3 * N, tt, 0.4 * N, 0.025 * N, MID);
    r.rect(0.3 * N, tt, 0.4 * N, Math.max(1, u), LMID);
    for (const lx of [0.32, 0.66]) r.rect(lx * N, tt + 0.025 * N, 0.02 * N, 0.88 * N - tt, DARK);
    const px = 0.44 * N, cw = 0.035 * N, chT = tt - 0.06 * N, wl = tt - 0.03 * N; // chamber top, water line
    r.ring(px, tt - 0.03 * N, cw, Math.max(1, 0.6 * u), LMID, 0.85);
    r.rect(px - cw * 0.8, wl, cw * 1.6, tt - wl - 0.003 * N, COOL + DIM);
    r.rect(px - 0.009 * N, tt - 0.17 * N, 0.018 * N, 0.115 * N, LMID + DIM);
    r.frame(Math.round(px - 0.01 * N), Math.round(tt - 0.17 * N), Math.max(2, Math.round(0.02 * N)), Math.round(0.115 * N), LMID);
    const bx0 = px - 0.06 * N, by0 = tt - 0.07 * N; // the bowl, out on its stem
    r.stroke(bx0, by0, px - 0.006 * N, tt - 0.012 * N, Math.max(1, 0.006 * N), LMID);
    r.rect(bx0 - 0.012 * N, by0 - 0.01 * N, 0.024 * N, 0.012 * N, LMID);
    if (beat) { w.ember = 1; for (let k = 0; k < 4 + band; k++) w.bubbles.push({ x: px - 0.006 * N + (rnd() - 0.5) * 0.008 * N, y: tt - 0.012 * N, v: 0, vt: (0.08 + 0.06 * rnd()) * N }); }
    w.ember *= Math.exp(-dt * 2.5);
    r.rect(bx0 - 0.009 * N, by0 - 0.012 * N, 0.018 * N, Math.max(1, 0.005 * N), w.ember > 0.4 ? BRIGHT : w.ember > 0.1 ? HOT : HOT + DIM);
    w.bubbles = w.bubbles.filter((b) => { b.v = follow(b.v, b.vt, dt, 0.06); b.y -= b.v * dt; b.x += Math.sin(b.y * 2 + b.vt) * 0.003 * N * dt * 10; if (b.y < wl) return false; r.set(b.x, b.y, BRIGHT); return true; }); // up to its terminal speed in a few hundredths, burst at the surface
    for (w.wispT -= dt; w.wispT <= 0; w.wispT += 0.35) { w.wisp.push({ x: bx0, y: by0 - 0.015 * N, vx: 0, vy: -0.03 * N, rise: 0.05 * N, rad: 0.004 * N, grow: 0.008 * N, life: 2, max: 2, dens: 0.35 }); }
    w.wisp = smoke(W, w.wisp, LMID, 0, 12);
    // a kick: a big exhale from one of them in turn, rising on its warmth and spreading
    for (; w.exhale > 0; w.exhale--) {
      const [mx, my] = mouths[(w.who = 1 - w.who)];
      for (let k = 0; k < 7; k++) w.puffs.push({ x: mx + (rnd() - 0.5) * 0.02 * N, y: my, vx: (rnd() - 0.5) * 0.12 * N + (w.who ? 0.04 : -0.04) * N, vy: -0.01 * N * rnd(), rise: (0.05 + 0.04 * rnd()) * N, rad: 0.012 * N, grow: (0.02 + 0.01 * rnd()) * N, life: 3 + rnd() * 1.5, max: 4.5, dens: 0.65 });
    }
    w.puffs = smoke(W, w.puffs, LMID, 0, 60);
    // the TV's light from where we stand: a flickering lift on everything it reaches, strongest in the middle
    const flick = w.tv * (0.75 + 0.25 * Math.sin(t * 23 + Math.sin(t * 7) * 3)), buf = r.buf;
    for (let y = Math.round(0.36 * N); y < N; y++) {
      const fy = 1 - Math.abs(y / N - 0.65) / 0.35;
      for (let x = Math.round(0.12 * N); x < Math.round(0.88 * N); x++) { const d = flick * fy * (1 - Math.abs(x / N - 0.5) / 0.4) * 0.4; if (bayer(x, y) < d) buf[y * N + x] = LIFT[buf[y * N + x]]; }
    }
    // the lava lamp in the near corner, glowing on its own: the glass, the wax by metaballs, the pool, base and cap
    const L = w.lava, gx = 0.075 * N, gy0 = 0.52 * N, gh = 0.17 * N, half = (q) => gh * 0.2 * (1 - 0.35 * ((q - 0.4) / 0.6) ** 2);
    lavaStep(L, dt, 0.18 + 0.3 * f.rel.bassDrive + 0.1 * band, rnd);
    const hp = 0.05 + 0.06 * L.pool;
    for (let y = Math.round(gy0); y < gy0 + gh; y++) {
      const q = 1 - (y + 0.5 - gy0) / gh, hw = half(q);
      for (let x = Math.round(gx - hw); x < gx + hw; x++) {
        const xg = (x + 0.5 - gx) / gh;
        let F = q < hp + 0.01 * Math.sin(x * 0.7 + t * 2) ? 1.5 : 0;
        for (const b of L.blobs) { const dx = xg - b.x, dy = q - b.y, rr = blobR(b.vol); F += (rr * rr) / (dx * dx + dy * dy + 1e-4); }
        r.set(x, y, F >= 2.4 ? BRIGHT : F >= 1 ? HOT : HOT + DIM);
      }
    }
    r.poly([[gx - gh * 0.17, gy0 + gh], [gx + gh * 0.17, gy0 + gh], [gx + gh * 0.3, gy0 + gh * 1.35], [gx - gh * 0.3, gy0 + gh * 1.35]], MID);
    r.poly([[gx - gh * 0.08, gy0 - gh * 0.12], [gx + gh * 0.08, gy0 - gh * 0.12], [gx + gh * 0.13, gy0], [gx - gh * 0.13, gy0]], MID);
    r.rect(0, gy0 + gh * 1.35, 0.17 * N, N - gy0 - gh * 1.35, DARK);
    r.rect(0, gy0 + gh * 1.35, 0.17 * N, Math.max(1, u), MID);
    targets.push({ x: gx - gh * 0.3, y: gy0 - gh * 0.12, w: gh * 0.6, h: gh * 1.47 });
    // the drop: a haze off the floor, risen in a second and gone over two bars
    if (w.haze) {
      const H = w.haze, top = floor + 0.04 * N - 0.5 * N * ease(H.t / 1.2), d = 0.65 * (1 - H.t / (8 * bs));
      if ((H.t += dt) > 8 * bs) w.haze = null;
      else for (let y = Math.max(0, Math.round(top - 0.03 * N)); y < N; y++) {
        const dd = d * clamp(0.25 + (y - top) / (0.3 * N)); // thickest on the floor, thinning up to its rolling top
        for (let x = 0; x < N; x++) if (y > top + Math.sin(x * 0.09 + t * 1.3) * 0.015 * N && bayer(x, y) < dd) buf[y * N + x] = LMID + DIM;
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------- passcircle
// A circle sitting out at night, seen from a little above (each seat on the ground in perspective: nearer is lower
// and bigger, drawn far to near), passing a lit joint one seat a beat: the holder draws on it (the ember flares on
// the kick), then reaches out and the next one reaches in and takes it. A snare blows a smoke ring that widens,
// rises and slows as it widens (its push shared by more and more air) and fades. Kinds: the setting, a garden with
// a lantern, a roof over the city, a beach with a fire. A drop: something is funny; everyone rocks back laughing.
const CIRCLE_W = { garden: [3, 2, 1], rooftop: [2, 3, 2], beach: [1, 2, 2] };
function ditherRing(r, cx, cy, R, th, c, d, sy = 1) {
  const N = r.N, ro = R + th / 2, ri = Math.max(0, R - th / 2);
  for (let y = Math.max(0, Math.floor(cy - ro * sy)); y <= Math.min(N - 1, cy + ro * sy); y++)
    for (let x = Math.max(0, Math.floor(cx - ro)); x <= Math.min(N - 1, cx + ro); x++) {
      const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / sy, dd = Math.sqrt(dx * dx + dy * dy);
      if (dd <= ro && dd >= ri && bayer(x, y) < d) r.buf[y * N + x] = c;
    }
}
function liftDisc(r, cx, cy, rad) { const N = r.N; for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(N - 1, cy + rad); y++) for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(N - 1, cx + rad); x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad) r.buf[y * N + x] = LIFT[r.buf[y * N + x]]; }

const passcircle = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, CIRCLE_W, band), n: 5 + band, ember: 0, rings: [], puffs: [], sparks: [], laugh: 0, flies: [], blowT: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), bt = beatT(W), yh = 0.42 * N, F = 0.8 * N, Hc = 1.4, Z0 = 4, R = 1.5;
    if (f.section === 'change') { w.kind = rollW(rnd, CIRCLE_W, band); w.n = 5 + band; }
    if (f.section === 'drop') w.laugh = 1;
    const n = w.n, k = Math.floor(bt) % n, p = bt - Math.floor(bt), K = w.kind, cx = N / 2, cy = yh + (F * Hc) / Z0;
    for (const h of hits) {
      if (h.kind === 'kick') w.ember = 1;
      else if (h.kind === 'snare') w.blowT = 0.01;
      else if (isTonal(h) && w.flies.length < 12) w.flies.push({ x: (0.1 + 0.8 * rnd()) * N, y: (0.45 + 0.2 * rnd()) * N, life: 2, ph: rnd() * TAU });
    }
    w.ember *= Math.exp(-dt * 2.2);
    w.laugh *= Math.exp(-dt / 1.4);
    // the night behind, by setting; stars that twinkle with the treble
    r.rect(0, 0, N, yh + 0.12 * N, DARK + DIM);
    for (let i = 0; i < 40; i++) if (hash(i, 77) > 0.2 * f.rel.trebDrive * (1 + Math.sin(t * 3 + i))) r.set(hash(i, 71) * N, hash(i, 72) * yh, i % 5 ? LMID + DIM : BRIGHT);
    if (K === 'garden') {
      r.rect(0, yh + 0.12 * N, N, N, DARK + DIM);
      for (let x = 0; x < N; x += 3 * u) r.rect(x, 0.5 * N - hash(x | 0, 3) * 0.01 * N, Math.max(1, 2 * u), 0.045 * N, MID + DIM);
      for (let i = 0; i < 6; i++) r.disc(hash(i, 31) * N, 0.55 * N, (0.04 + 0.03 * hash(i, 32)) * N, DARK);
      r.rect(0.86 * N, 0.2 * N, 0.025 * N, 0.36 * N, BLACK);
      for (let i = 0; i < 7; i++) r.disc(0.87 * N + (hash(i, 51) - 0.5) * 0.2 * N, 0.2 * N + (hash(i, 52) - 0.5) * 0.14 * N, 0.05 * N, BLACK);
    } else if (K === 'rooftop') {
      for (let b = 0; b < 12; b++) {
        const x = (b * 0.09 - 0.02) * N, top = (0.18 + 0.2 * hash(b, 61)) * N;
        r.rect(x, top, 0.08 * N, 0.56 * N - top, BLACK);
        for (let y = top + 0.02 * N, j = 0; y < 0.54 * N; y += 0.03 * N, j++) for (let q = 0; q < 3; q++) if (hash(b * 7 + q, j) < 0.3 + 0.15 * Math.sin(t * 0.5 + b + j)) r.rect(x + (0.012 + q * 0.024) * N, y, Math.max(1, u), Math.max(1, 1.5 * u), q % 2 ? HOT + DIM : BRIGHT + DIM);
      }
      r.rect(0.12 * N, 0.28 * N, 0.07 * N, 0.08 * N, DARK); r.rect(0.13 * N, 0.36 * N, Math.max(1, u), 0.1 * N, DARK); r.rect(0.18 * N, 0.36 * N, Math.max(1, u), 0.1 * N, DARK);
      r.rect(0, 0.54 * N, N, N, DARK);
      r.rect(0, 0.54 * N, N, 0.012 * N, MID);
      for (let k2 = 1; k2 < 6; k2++) r.rect(0, yh + (F * Hc) / (9 - k2 * 1.2), N, Math.max(1, 0.5 * u), DARK + DIM);
    } else {
      r.disc(0.78 * N, 0.13 * N, 0.04 * N, BRIGHT);
      r.rect(0, yh, N, 0.11 * N, DARK);
      for (let y = Math.round(yh); y < yh + 0.11 * N; y += 2) { const sp = 0.012 * N + (y - yh) * 0.3; for (let x = 0.78 * N - sp; x < 0.78 * N + sp; x += 2) if (hash(x | 0, (y + Math.floor(t * 4)) | 0) < 0.4) r.set(x, y, LMID + DIM); } // the moon's path on the water, wider nearer
      r.rect(0, yh + 0.11 * N, N, N, MID + DIM);
      for (let i = 0; i < 30; i++) r.set(hash(i, 81) * N, yh + 0.12 * N + hash(i, 82) * 0.45 * N, DARK + DIM);
    }
    // the middle of the circle: a lantern, nothing, a fire (flames with the level, sparks that fly up and fall)
    if (K === 'garden') { r.rect(cx - 0.012 * N, cy - 0.04 * N, 0.024 * N, 0.04 * N, DARK); r.rect(cx - 0.008 * N, cy - 0.034 * N, 0.016 * N, 0.026 * N, f.beat.pulse > 0.5 ? BRIGHT : HOT); liftDisc(r, cx, cy - 0.02 * N, 0.05 * N); }
    else if (K === 'beach') {
      for (const k3 of [-1, 1]) r.stroke(cx - 0.04 * N, cy + k3 * 0.006 * N, cx + 0.04 * N, cy - k3 * 0.006 * N, Math.max(1, 0.012 * N), DARK);
      const fh2 = (0.05 + 0.05 * f.level) * N;
      for (let j = 0; j < 4; j++) { const sw = Math.sin(t * 9 + j * 1.7) * 0.008 * N, hj = fh2 * (0.6 + 0.4 * hash(j, Math.floor(t * 12))); r.poly([[cx - 0.02 * N + j * 0.012 * N, cy], [cx - 0.008 * N + j * 0.012 * N, cy], [cx - 0.014 * N + j * 0.012 * N + sw, cy - hj]], j % 2 ? HOT : BRIGHT); }
      liftDisc(r, cx, cy - 0.02 * N, 0.09 * N);
      if (rnd() < dt * 8) w.sparks.push({ x: cx + (rnd() - 0.5) * 0.03 * N, y: cy - fh2 * 0.5, vx: (rnd() - 0.5) * 0.05 * N, vy: -(0.25 + 0.2 * rnd()) * N, life: 1.2, c: HOT });
    }
    // the seats, far ones first: each a cross-legged figure facing in, the joint going round one seat a beat
    const P = [];
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU + 0.25, X = R * Math.cos(th), Z = Z0 + R * Math.sin(th), s = F / Z;
      P.push({ i, x: cx + (F * X) / Z, y: yh + (F * Hc) / Z, s, Z, dir: X < 0 ? 1 : -1 });
    }
    const A = P[k], B = P[(k + 1) % n], Pz = P[(k + n - 1) % n];
    const mouth = (q) => [q.x + q.dir * 0.09 * q.s - q.dir * Math.sin(w.laugh * 0.5) * 0.42 * q.s, q.y - 0.6 * q.s + w.laugh * 0.06 * q.s];
    const meet = (a, b) => [(a.x + b.x) / 2, (a.y + b.y) / 2 - 0.4 * (a.s + b.s) / 2];
    const [mA0, mA1] = mouth(A), [gx, gy] = meet(A, B), [hx0, hy0] = meet(Pz, A);
    let jx, jy;
    if (p < 0.2) { const q = ease(p / 0.2); jx = lerp(hx0, mA0, q); jy = lerp(hy0, mA1, q); }
    else if (p < 0.6) { jx = mA0; jy = mA1; }
    else { const q = ease((p - 0.6) / 0.28); jx = lerp(mA0, gx, q); jy = lerp(mA1, gy, q); }
    const order = [...P].sort((a, b) => b.Z - a.Z);
    for (const q of order) {
      const s = q.s, lean = w.laugh * (0.45 + 0.1 * Math.sin(t * 26 + q.i)) + 0.06 * Math.sin(f.rel.bassClock + q.i), x = q.x, y = q.y;
      r.poly([[x - 0.27 * s, y], [x + 0.27 * s, y], [x + 0.3 * s, y - 0.05 * s], [x + 0.13 * s, y - 0.12 * s], [x - 0.13 * s, y - 0.12 * s], [x - 0.3 * s, y - 0.05 * s]], FIG); // knees out, shins crossed
      const hipY = y - 0.09 * s, shx = x - q.dir * Math.sin(lean) * 0.42 * s, shy = hipY - Math.cos(lean) * 0.42 * s;
      r.poly([[x - 0.11 * s, hipY], [x + 0.11 * s, hipY], [shx + 0.14 * s, shy + 0.03 * s], [shx + 0.11 * s, shy], [shx - 0.11 * s, shy], [shx - 0.14 * s, shy + 0.03 * s]], FIG);
      r.rect(shx - 0.035 * s, shy - 0.06 * s, 0.07 * s, 0.07 * s, FIG);
      r.disc(shx + q.dir * 0.02 * s, shy - 0.13 * s, 0.09 * s, FIG);
      // arms: the holder's hand with the joint, the next one's reaching for the meeting point, the rest at rest
      let tx = x + q.dir * 0.2 * s, ty = hipY - 0.02 * s;
      if (q === A) { tx = jx; ty = jy; }
      else if (q === B && p > 0.6) { const qq = ease((p - 0.6) / 0.28); tx = lerp(tx, gx, qq); ty = lerp(ty, gy, qq); }
      else if (q === Pz && p < 0.2) { tx = lerp(hx0, tx, ease(p / 0.2)); ty = lerp(hy0, ty, ease(p / 0.2)); }
      arm(r, shx + q.dir * 0.06 * s, shy + 0.04 * s, tx, ty, 0.62 * s, q.dir, Math.max(1, 0.08 * s), FIG);
      if (q.Z < Z0) targets.push({ x: x - 0.3 * s, y: shy - 0.25 * s, w: 0.6 * s, h: y - shy + 0.25 * s });
    }
    // the joint: paper and an ember that flares as it is drawn on, a glow on the face while it does
    const js = A.s, lit = p >= 0.2 && p < 0.6;
    r.line(jx, jy, jx + A.dir * 0.07 * js, jy - 0.015 * js, LMID);
    const ex = jx + A.dir * 0.07 * js, ey = jy - 0.015 * js;
    if (lit && w.ember > 0.5) liftDisc(r, ex, ey, 0.12 * js);
    r.rect(ex - 0.5, ey - 0.5, Math.max(1, 0.025 * js), Math.max(1, 0.025 * js), lit && w.ember > 0.6 ? BRIGHT : w.ember > 0.2 ? HOT : HOT + DIM);
    if (rnd() < dt * 4) w.puffs.push({ x: ex, y: ey, vx: 0, vy: -0.02 * N, rise: 0.04 * N, rad: 0.004 * N, grow: 0.01 * N, life: 1.5, max: 1.5, dens: 0.4 });
    // a snare: a ring blown from the holder toward the middle; it widens as R² grows with time and its speed falls
    // as 1/R² (the same push shared by more air), it rises on its warmth and fades
    if (w.blowT > 0) { w.blowT = 0; const [mx, my] = mouth(A); w.rings.push({ x: mx, y: my, vx: (cx - mx) * 0.6, vy: -0.02 * N, R0: 0.03 * A.s, R: 0.03 * A.s, age: 0 }); }
    w.rings = w.rings.filter((g) => {
      g.age += dt;
      g.R = Math.sqrt(g.R0 * g.R0 + 0.004 * N * N * g.age);
      const k2 = (g.R0 / g.R) ** 2;
      g.vy = follow(g.vy, -0.05 * N, dt, 0.8);
      g.x += g.vx * k2 * dt; g.y += g.vy * Math.max(k2, 0.3) * dt;
      ditherRing(r, g.x, g.y, g.R, Math.max(1, 0.3 * g.R), LMID, clamp(1 - g.age / 3), 0.55);
      return g.age < 3;
    });
    w.puffs = smoke(W, w.puffs, LMID + DIM, 0, 30);
    w.sparks = sparks(W, w.sparks, gOf(0.35 * N), 0); // a grown-up at the circle's middle is 0.35 of the height
    w.flies = w.flies.filter((fl) => { fl.life -= dt; fl.x += Math.sin(t * 2 + fl.ph) * 0.03 * N * dt; fl.y += Math.cos(t * 1.7 + fl.ph) * 0.02 * N * dt; if (Math.sin(t * 9 + fl.ph) > 0) r.set(fl.x, fl.y, K === 'rooftop' ? HOT : COOL); return fl.life > 0; });
  },
};

// ---------------------------------------------------------------------------------------------- heist
// A vault from the side: a grid of laser beams between two posts sweeping up and down (each a straight line, cut off
// where a body stands in it), a figure in black taking a new shape on every beat, the one that keeps clear of the
// beams for the coming beat; at the round door a safecracker with an ear to it, the dial clicking a notch on each
// hat, the wheel spun on a snare and running down under its friction (a steady angular deceleration), a drill on
// the door biting on the kicks and throwing sparks in parabolas. Kinds: the crew, alone, two, three with a lookout.
// A drop: the door swings open on its hinge in perspective onto shelves of banded stacks, the alarm lights strobing.
const HEIST_W = { solo: [3, 2, 1], duo: [1, 3, 2], crew: [0, 1, 3] };
const BEAMS = { solo: 3, duo: 4, crew: 5 };
// shapes for the figure in the grid: head, neck, hip, knee, foot, knee, foot, elbow, hand, elbow, hand (x forward,
// y up from the floor, in heights)
const POSES = [
  [0.02, 0.93, 0.01, 0.83, 0, 0.5, 0.03, 0.26, 0.02, 0, -0.02, 0.26, -0.04, 0, 0.05, 0.67, 0.06, 0.52, -0.05, 0.67, -0.04, 0.52], // standing tall
  [0, 0.95, 0, 0.85, 0, 0.52, 0.02, 0.27, 0.02, 0, -0.02, 0.27, -0.02, 0, 0.06, 1, 0.04, 1.13, -0.05, 0.99, -0.03, 1.12], // up on the toes, arms high
  [0.14, 0.42, 0.08, 0.37, -0.1, 0.2, 0.1, 0.25, 0.06, 0, 0.04, 0.2, -0.08, 0, 0.18, 0.28, 0.26, 0.14, 0.14, 0.25, 0.22, 0.08], // crouched low
  [-0.32, 0.36, -0.25, 0.38, 0, 0.3, 0.2, 0.32, 0.24, 0, 0.15, 0.28, 0.12, 0, -0.33, 0.27, -0.42, 0.17, -0.28, 0.28, -0.36, 0.14], // bent back under
  [0.06, 0.78, 0.05, 0.68, 0, 0.4, 0.26, 0.24, 0.38, 0, -0.17, 0.2, -0.38, 0, 0.18, 0.7, 0.32, 0.76, -0.14, 0.7, -0.3, 0.78], // a long lunge, arms out
  [-0.32, 0.12, -0.25, 0.22, 0.02, 0.34, 0.18, 0.22, 0.26, 0, 0.22, 0.2, 0.3, 0, -0.3, 0.1, -0.36, 0, -0.26, 0.11, -0.32, 0], // a bridge, belly up
];
const BONES = [0, 1, 1, 2, 2, 3, 3, 4, 2, 5, 5, 6, 1, 7, 7, 8, 1, 9, 9, 10];
function segDist(ax, ay, bx, by, cx, cy, dx, dy) {
  const o = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  if (o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 && o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0) return 0;
  const pd = (px, py, sx, sy, ex, ey) => { const vx = ex - sx, vy = ey - sy, l2 = vx * vx + vy * vy || 1e-9, q = clamp(((px - sx) * vx + (py - sy) * vy) / l2); return Math.hypot(px - sx - q * vx, py - sy - q * vy); };
  return Math.min(pd(ax, ay, cx, cy, dx, dy), pd(bx, by, cx, cy, dx, dy), pd(cx, cy, ax, ay, bx, by), pd(dx, dy, ax, ay, bx, by));
}
// the beams at sweep clock `sc`: beam i runs from the left post at one height to the right post at another (fractions
// of the posts' height), the two ends set crosswise and each sweeping on its own
const beamY = (i, n, sc, side) => 0.12 + 0.7 * hash(i * 2 + side, n) + 0.08 * Math.sin(sc * (0.9 + 0.23 * i) + i * 2.1 + side * (1.3 + i));

const heist = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, HEIST_W, bandOf(W.a)), sc: rnd() * 10, pose: Float32Array.from(POSES[0]), from: Float32Array.from(POSES[0]), to: 0, pt: 1, dial: 0, click: 0,
      wheel: 0, om: 0, sparks: [], bite: 0, open: 0, dp: 0, blink: -1, blinkT: 0, pts: Array.from({ length: 32 }, () => [0, 0]), back: Array.from({ length: 32 }, () => [0, 0]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bs = beatS(f), band = bandOf(W.a), fl = 0.82 * N, hF = 0.36 * N;
    if (f.section === 'change') w.kind = rollW(rnd, HEIST_W, band);
    if (f.section === 'drop') { w.dp = 16 * bs; s.shake = Math.max(s.shake, 0.3); }
    const nb = BEAMS[w.kind], rate = 0.5 + 1.2 * f.rel.midDrive + 0.3 * band, px0 = 0.05 * N, px1 = 0.5 * N, pTop = 0.24 * N, pH = fl - pTop;
    if (w.fx === undefined || w.fN !== N) { w.fx = w.fx0 = 0.27 * N; w.fN = N; }
    w.sc += dt * rate;
    for (const h of hits) {
      if (h.kind === 'kick') { w.bite = 1; s.shake = Math.max(s.shake, 0.08); }
      else if (h.kind === 'hat') { w.dial += TAU / 40; w.click = 0.08; }
      else if (h.kind === 'snare' && w.dp <= 0) w.om = Math.max(w.om, 5 + 3 * h.strength); // spun by hand: up to the hand's speed, never past it
      if (isTonal(h)) { w.blink = h.pc % nb; w.blinkT = 0.15; }
    }
    w.click -= dt; w.blinkT -= dt; w.dp -= dt;
    w.bite *= Math.exp(-dt * 6);
    // the wheel runs down under a steady friction torque: the same loss of spin every second until it stops
    const fr = 3 * dt;
    w.om = Math.abs(w.om) <= fr ? 0 : w.om - Math.sign(w.om) * fr;
    w.wheel += w.om * dt;
    // on the beat the figure steps to a spot and takes the shape there that keeps furthest from the beams through the
    // coming beat (sampled at three moments of it), a step at most to either side
    if (beatTick(w, f, dt)) {
      let best = w.to, bx = w.fx, bestD = -Infinity;
      const clear = [];
      for (let c = -2; c <= 2; c++) {
        const cx0 = clamp(w.fx + c * 0.04 * N, px0 + 0.1 * N, px1 - 0.1 * N);
        for (let k = 0; k < POSES.length; k++) {
          const P = POSES[k];
          let dmin = Infinity;
          for (let a = 0; a < 3; a++) {
            const sc = w.sc + rate * bs * (0.15 + 0.4 * a);
            for (let i = 0; i < nb; i++) {
              const ay = fl - beamY(i, nb, sc, 0) * pH, by = fl - beamY(i, nb, sc, 1) * pH;
              for (let b = 0; b < BONES.length; b += 2) {
                const p = BONES[b] * 2, q = BONES[b + 1] * 2;
                dmin = Math.min(dmin, segDist(px0, ay, px1, by, cx0 + P[p] * hF, fl - P[p + 1] * hF, cx0 + P[q] * hF, fl - P[q + 1] * hF) - (BONES[b] === 0 ? 0.07 * hF : 0.03 * hF));
              }
            }
          }
          if (dmin > 0.02 * hF && k !== w.to) clear.push(k, cx0);
          if (dmin > bestD) { bestD = dmin; best = k; bx = cx0; }
        }
      }
      if (clear.length) { const i = 2 * Math.floor(rnd() * (clear.length / 2)); best = clear[i]; bx = clear[i + 1]; } // any shape that clears them will do
      w.from.set(w.pose); w.to = best; w.pt = 0; w.fx0 = w.fx; w.fx = bx;
    }
    w.pt = Math.min(1, w.pt + dt / (0.3 * bs));
    const T = POSES[w.to], e = ease(w.pt), fx = lerp(w.fx0, w.fx, e);
    for (let i = 0; i < 22; i++) w.pose[i] = lerp(w.from[i], T[i], e);
    // the room, the hole behind the door (the vault: shelves of banded stacks, a glint running over them)
    r.rect(0, 0, N, fl, DARK + DIM);
    for (let x = 0; x < N; x += 0.16 * N) r.rect(x, 0, Math.max(1, 0.5 * u), fl, MID + DIM);
    r.rect(0, fl, N, N - fl, MID + DIM);
    r.rect(0, fl, N, Math.max(1, u), LMID + DIM);
    const cx = 0.77 * N, cy = 0.5 * N, R = 0.21 * N, D = 1.6 * N, Td = 0.06 * N;
    w.open = follow(w.open, w.dp > 0 ? 1.25 : 0, dt, 0.5);
    if (w.open > 0.02) {
      r.disc(cx, cy, R, BRIGHT + DIM);
      for (let k = 0; k < 3; k++) {
        const sy = cy - R * 0.55 + k * R * 0.5;
        r.rect(cx - R, sy, 2 * R, Math.max(1, u), MID);
        for (let j = 0; j < 7; j++) { const bx = cx - R * 0.85 + j * R * 0.25, bh = 0.035 * N; if (Math.hypot(bx + 0.04 * N - cx, sy - bh / 2 - cy) < R * 0.92) brick(r, bx, sy - bh, 0.05 * N, bh, u); }
      }
      const gl = cx - R + ((t * 0.6) % 1) * 2.4 * R; // the gleam: a slant of light passing over the stacks
      for (let y = Math.round(cy - R); y < cy + R; y++) for (let k = 0; k < 3; k++) { const x = Math.round(gl - (y - cy) * 0.5 + k); if (Math.hypot(x - cx, y - cy) < R * 0.95 && r.get(x, y) === COOL) r.set(x, y, WHITE); }
      r.ring(cx, cy, R, Math.max(1, 1.5 * u), BLACK);
    }
    // the door: a thick disc turned `open` about its hinge on the right, in perspective (the free edge swings at us
    // and grows); back face first, then the front with its rings, bolts, wheel and dial
    const ph = w.open, cph = Math.cos(ph), sph = Math.sin(ph), hx = cx + R;
    const P = (X, Y, Zd, out) => { const Xr = X * cph + Zd * sph, Zr = -X * sph + Zd * cph, k = D / (D - Zr); out[0] = hx + Xr * k; out[1] = cy + Y * k; return out; };
    for (let k = 0; k < 32; k++) { const a = (k / 32) * TAU; P(Math.cos(a) * R - R, Math.sin(a) * R, -Td, w.back[k]); P(Math.cos(a) * R - R, Math.sin(a) * R, 0, w.pts[k]); }
    if (ph > 0.02) r.poly(w.back, DARK);
    r.poly(w.pts, MID);
    const q = [0, 0], q2 = [0, 0];
    for (const rr of [0.92, 0.7, 0.3]) for (let k = 0; k < 32; k++) { const a0 = (k / 32) * TAU, a1 = ((k + 1) / 32) * TAU; P(Math.cos(a0) * R * rr - R, Math.sin(a0) * R * rr, 0, q); P(Math.cos(a1) * R * rr - R, Math.sin(a1) * R * rr, 0, q2); r.line(q[0], q[1], q2[0], q2[1], rr === 0.3 ? DARK : LMID); }
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; P(Math.cos(a) * R * 0.82 - R, Math.sin(a) * R * 0.82, 0, q); r.rect(q[0] - u, q[1] - u, Math.max(1, 2 * u), Math.max(1, 2 * u), LMID); }
    for (let k = 0; k < 3; k++) { const a = w.wheel + (k / 3) * TAU; P(-R, 0, 0, q); P(Math.cos(a) * R * 0.28 - R, Math.sin(a) * R * 0.28, 0, q2); r.stroke(q[0], q[1], q2[0], q2[1], Math.max(1, 0.012 * N), BRIGHT); r.disc(q2[0], q2[1], Math.max(1, 0.01 * N), BRIGHT); }
    P(-R, 0, 0, q); r.disc(q[0], q[1], 0.02 * N, LMID);
    const dcx = -R * 1.55, dcy = R * 0.15; // the dial: ticks round it turning a notch a hat, the index mark fixed above
    P(dcx, dcy, 0, q); r.disc(q[0], q[1], 0.035 * N * cph + 0.01 * N, DARK);
    for (let k = 0; k < 10; k++) { const a = w.dial + (k / 10) * TAU; P(dcx + Math.cos(a) * 0.028 * N, dcy + Math.sin(a) * 0.028 * N, 0, q2); r.set(q2[0], q2[1], k ? LMID : HOT); }
    P(dcx, dcy - 0.042 * N, 0, q2); r.rect(q2[0] - 0.5, q2[1] - u, Math.max(1, u), Math.max(1, u), w.click > 0 ? WHITE : BRIGHT);
    targets.push({ x: cx - R, y: cy - R, w: 2 * R, h: 2 * R });
    // the drill on its stand at the door's foot: the bit turning with the bass, biting and sparking on the kicks
    const jit = w.bite > 0.3 ? (rnd() - 0.5) * 2 * u : 0, mx = 0.9 * N + jit, my = 0.64 * N, tx = 0.83 * N, ty = 0.6 * N;
    r.line(mx, my + 0.03 * N, 0.86 * N, fl, DARK); r.line(mx, my + 0.03 * N, 0.95 * N, fl, DARK);
    r.rect(mx - 0.025 * N, my - 0.02 * N, 0.06 * N, 0.05 * N, DARK);
    r.rect(mx - 0.02 * N, my - 0.012 * N, Math.max(1, 0.01 * N), Math.max(1, 0.01 * N), w.bite > 0.2 ? HOT : COOL + DIM);
    for (let k = 0; k < 6; k++) { const q3 = k / 6; r.rect(lerp(mx - 0.025 * N, tx, q3), lerp(my, ty, q3), Math.max(1, u), Math.max(1, u), (k + Math.floor(f.rel.bassClock * 8)) % 2 ? LMID : DARK); }
    if (w.bite > 0.95) for (let k = 0; k < 10; k++) { const a = -Math.PI * (0.05 + 0.5 * rnd()), v = (0.3 + 0.4 * rnd()) * N; w.sparks.push({ x: tx, y: ty, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + 0.4 * rnd(), c: rnd() < 0.5 ? BRIGHT : HOT }); }
    // the safecracker: bent with an ear to the door by the dial, a hand on it; on the drop he steps back from it
    w.bend = follow(w.bend ?? 0.45, w.dp > 0 ? 0 : 0.45, dt, 0.3);
    w.scx = follow(w.scx ?? 0.585 * N, w.dp > 0 ? 0.53 * N : 0.585 * N, dt, 0.4);
    const sx = w.scx, sh = hF, bd = w.bend, hipY = fl - 0.48 * sh, shx = sx + Math.sin(bd) * 0.32 * sh, shy = hipY - Math.cos(bd) * 0.32 * sh;
    for (const k of [-1, 1]) arm(r, sx, hipY, sx + k * 0.06 * sh, fl, 0.5 * sh, -1, Math.max(1, 0.07 * sh), FIG);
    r.stroke(sx, hipY, shx, shy, Math.max(2, 0.13 * sh), FIG);
    const hcx = shx + Math.sin(bd) * 0.12 * sh, hcy = shy - Math.cos(bd) * 0.12 * sh;
    r.disc(hcx, hcy, 0.09 * sh, FIG);
    r.rect(hcx - 0.09 * sh, hcy - 0.1 * sh, 0.17 * sh, 0.06 * sh, FIG);
    P(dcx, dcy, 0, q); arm(r, shx, shy + 0.03 * sh, w.dp > 0 ? shx + 0.1 * sh : q[0] - 0.015 * N, w.dp > 0 ? shy + 0.3 * sh : q[1], sh * 0.42, 1, Math.max(1, sh * 0.05), FIG);
    targets.push({ x: sx - sh * 0.15, y: hcy - 0.1 * sh, w: sh * 0.45, h: fl - hcy + 0.1 * sh });
    if (w.kind === 'crew') { const lx = 0.02 * N; walker(r, lx, fl, hF * 0.95, FIG, 0, 1, {}); ditherPoly(r, [[lx + 0.04 * N, fl - hF * 0.6], [lx + 0.2 * N, fl - 0.02 * N], [lx + 0.1 * N, fl]], LIGHT, 0.8); }
    // the posts and the figure in the grid (its bones, a head), then the beams, each stopping where the body is
    for (const x of [px0, px1]) { r.rect(x - 0.012 * N, pTop, 0.024 * N, pH, DARK); r.rect(x - 0.012 * N, pTop, 0.024 * N, Math.max(1, u), LMID); }
    const pz = w.pose;
    for (let b = 0; b < BONES.length; b += 2) { const p = BONES[b] * 2, q4 = BONES[b + 1] * 2; r.stroke(fx + pz[p] * hF, fl - pz[p + 1] * hF, fx + pz[q4] * hF, fl - pz[q4 + 1] * hF, Math.max(1.5, (b === 2 ? 0.1 : 0.06) * hF), FIG); }
    r.disc(fx + pz[0] * hF, fl - pz[1] * hF, 0.065 * hF, FIG);
    targets.push({ x: fx - 0.45 * hF, y: fl - 1.15 * hF, w: 0.9 * hF, h: 1.15 * hF });
    for (let i = 0; i < nb; i++) {
      const ay = fl - beamY(i, nb, w.sc, 0) * pH, by = fl - beamY(i, nb, w.sc, 1) * pH;
      r.disc(px0 + 0.012 * N, ay, Math.max(1, 0.008 * N), HOT); r.disc(px1 - 0.012 * N, by, Math.max(1, 0.008 * N), HOT);
      if (i === w.blink && w.blinkT > 0) continue;
      const n = Math.ceil(px1 - px0), buf = r.buf;
      for (let k = 0; k <= n; k++) {
        const x = Math.round(px0 + k), y = Math.round(ay + ((by - ay) * k) / n);
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        if (buf[y * N + x] === FIG) { r.disc(x, y, Math.max(1, 0.006 * N), HOT); break; } // a red dot where it lands on the body
        buf[y * N + x] = HOT;
      }
    }
    w.sparks = sparks(W, w.sparks, gOf(hF), 0); // parabolas under the room's gravity
    // the alarm on the drop: two beacons under the ceiling, their beams wheeling over the walls, red and blue in turn
    if (w.dp > 0) for (const [bx, k] of [[0.3 * N, 0], [0.75 * N, 1]]) {
      const on = (Math.floor(t * 8) + k) % 2 === 0, a = t * 7 + k * Math.PI;
      r.disc(bx, 0.02 * N, 0.025 * N, on ? (k ? COOL : HOT) : DARK);
      ditherPoly(r, [[bx, 0.03 * N], [bx + Math.cos(a - 0.2) * N, 0.03 * N + Math.abs(Math.sin(a - 0.2)) * N], [bx + Math.cos(a + 0.2) * N, 0.03 * N + Math.abs(Math.sin(a + 0.2)) * N]], LIGHT, 0.6);
    }
  },
};

// ---------------------------------------------------------------------------------------------- getaway
// A night chase from the side, the camera riding with the car through a city in layers (the far towers slowest): the
// wheels roll at w = v/r, the body rides on its springs; a kick bottoms it out and the scraping throws sparks in
// parabolas behind, a snare is a drift (the car slews, its tail swinging round, smoke off the rear tyres), a hat
// throws bills from the back window that drop to their terminal speed, drift and tumble while the air brakes them
// to the road's speed and they settle on it. Behind, the police lights strobe red and blue on alternate beats. Kinds:
// the district rolling in on a section change, docks, downtown, works. A drop: a raised bridge, the jump (a
// parabola until the ground comes up to meet it), the springs taking the landing; the police stop at the edge.
const DIST_W = { docks: [3, 2, 1], downtown: [2, 3, 2], works: [1, 2, 3] };
const RIDES = { sedan: { L: 0.3, h: 0.055, cab: [0.22, 0.62], cabH: 0.05 }, coupe: { L: 0.27, h: 0.045, cab: [0.3, 0.62], cabH: 0.04 }, van: { L: 0.3, h: 0.08, cab: [0.05, 0.72], cabH: 0.04 } };
const RIDE_W = { sedan: [3, 2, 1], coupe: [1, 2, 3], van: [2, 2, 1] };
const kindAt = (list, b) => { let k = list[0].k; for (const e of list) if (b >= e.from) k = e.k; return k; };
// sparks and glowing bits under the scene's own gravity, carried by `drift` (the road going by under the camera)
function sparks(W, list, g, drift) {
  const { r, dt, u } = W;
  return list.filter((p) => { p.vy += g * dt; p.x += (p.vx + drift) * dt; p.y += p.vy * dt; p.life -= dt; r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), p.c); return p.life > 0; });
}

const getaway = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a), k = rollW(rnd, DIST_W, band);
    Object.assign(w, { ride: rollW(rnd, RIDE_W, band), far: [{ from: -1e9, k }], mid: [{ from: -1e9, k }], S: 0, v: 0.8 * N, wh: 0, sb: 0, vsb: 0, y: 0, vy: 0, air: false, pitch: 0, om: 0,
      yaw: 0, drift: 0, sparks: [], bills: [], smoke: [], br: null, cop: 0.08 * N, vN: N });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), road = 0.8 * N, sx = 0.45 * N, g = gOf(0.115 * N), R = RIDES[w.ride], L = R.L * N, rw = 0.033 * N;
    if (w.vN !== N) { w.y = 0; w.vy = 0; w.vN = N; }
    if (f.section === 'change') { const k = rollW(rnd, DIST_W, band); w.far.push({ from: Math.floor((N + w.S * 0.12) / (0.07 * N)) + 1, k }); w.mid.push({ from: Math.floor((N + w.S * 0.4) / (0.18 * N)) + 1, k }); if (w.far.length > 3) { w.far.shift(); w.mid.shift(); } }
    if (f.section === 'drop' && !w.br) w.br = { X0: w.S + 1.1 * N, Lb: 0.5 * N, Gw: 0.35 * N, tan: Math.tan(0.24) };
    for (const h of hits) {
      if (h.kind === 'kick') w.vsb += (0.2 + 0.2 * h.strength) * N; // the springs bottom out
      else if (h.kind === 'snare' && !w.air) w.drift = 1;
      else if ((h.kind === 'hat' || isTonal(h)) && w.bills.length < 40) for (let k = 0; k < 1 + (h.strength > 0.6 ? 1 : 0); k++) w.bills.push({ x: sx - L * 0.12, y: road - rw - R.h * N - R.cabH * N * 0.5, vx: -0.05 * N * rnd(), vy: -(0.1 + 0.15 * rnd()) * N, ph: rnd() * TAU, om: (rnd() - 0.5) * 14, ang: 0, down: false });
    }
    // the ground under world position X: the road, or the bridge's two raised leaves with the river between
    const B = w.br, hAt = (X) => {
      if (!B) return 0;
      const d = X - B.X0;
      if (d < 0 || d > 2 * B.Lb + B.Gw) return 0;
      if (d < B.Lb) return d * B.tan;
      if (d < B.Lb + B.Gw) return -0.3 * N;
      return (2 * B.Lb + B.Gw - d) * B.tan;
    };
    // speed: with the bass, held steady for the jump; a drift scrubs some off
    const want = B ? 1.1 * N : (0.55 + 0.55 * f.rel.bassDrive + 0.1 * band) * N;
    w.v = follow(w.v, want * (1 - 0.25 * w.drift), dt, B ? 0.2 : 0.8);
    const dX = w.v * dt;
    w.S += dX;
    // the ride: on the ground the wheels follow it unless it falls away faster than gravity can pull the car down
    // (then it flies, a parabola), in the air it falls until the ground comes up to meet it (the landing goes into the springs)
    const gNow = hAt(w.S), gNext = hAt(w.S + dX);
    if (!w.air) {
      const vyG = (gNext - gNow) / Math.max(dt, 1e-4);
      if (gNext < gNow + w.vy * dt - 0.5 * g * dt * dt - 0.5) { w.air = true; w.om = -0.25; }
      else { w.vsb += Math.max(0, vyG - w.vy) * 0.5; w.vy = vyG; w.y = gNext; } // the ground rising under the wheels loads the springs
    }
    if (w.air) {
      w.vy -= g * dt; w.y += w.vy * dt; w.pitch += w.om * dt;
      if (w.y <= gNext) { // down: it takes the ground's own rise or fall (a leaf sloping away is followed, not hopped down), the rest into the springs
        const vyG = (gNext - gNow) / Math.max(dt, 1e-4), hit = Math.max(0, vyG - w.vy);
        w.y = gNext; w.vy = vyG; w.air = false; w.vsb += hit * 0.6; s.shake = Math.max(s.shake, clamp(hit / N));
      }
    } else { // on the ground the body lies along it, wheel to wheel, while both wheels have ground under them
      const hF = hAt(w.S + L * 0.33), hR = hAt(w.S - L * 0.33);
      if (hF > -0.1 * N && hR > -0.1 * N) w.pitch = follow(w.pitch, Math.atan2(hF - hR, L * 0.66), dt, 0.06);
    }
    if (w.y < -0.25 * N) w.y = -0.25 * N;
    if (B && w.S > B.X0 + 2 * B.Lb + B.Gw + 1.2 * N) w.br = null;
    // the springs: the body's offset over the wheels, a damped spring; bottoming out scrapes the underside
    for (let k = 0, n = Math.ceil(dt / 0.005); k < n; k++) { const hh = dt / n; w.vsb += (-140 * w.sb - 11 * w.vsb) * hh; w.sb += w.vsb * hh; }
    if (w.sb > 0.02 * N) { w.sb = 0.02 * N; w.vsb = Math.min(0, w.vsb); for (let k = 0; k < 8; k++) w.sparks.push({ x: sx - L * 0.3 + rnd() * L * 0.2, y: road - w.y, vx: -(0.1 + 0.3 * rnd()) * N + w.v * 0.1, vy: -(0.1 + 0.25 * rnd()) * N, life: 0.5 + 0.3 * rnd(), c: rnd() < 0.5 ? BRIGHT : HOT }); }
    w.sb = Math.max(w.sb, -0.012 * N);
    w.drift = Math.max(0, w.drift - dt / 0.7);
    w.yaw = follow(w.yaw, Math.sin(Math.PI * w.drift) * 0.55, dt, 0.08);
    w.wh += (w.v / rw) * dt; // rolling: the wheel turns its own circumference for every length of road
    // the city in layers: far towers, the district's middle row, lamps along the far kerb
    r.rect(0, 0, N, road, DARK + DIM);
    for (let b = Math.floor((w.S * 0.12) / (0.07 * N)) - 1, e = b + 17; b < e; b++) {
      const x = b * 0.07 * N - w.S * 0.12, k = kindAt(w.far, b), hgt = (k === 'downtown' ? 0.3 : 0.16) * N * (0.5 + hash(b, 5)) + 0.08 * N;
      r.rect(x, road - 0.12 * N - hgt, 0.065 * N, hgt, BLACK);
      for (let j = 0; j < 6; j++) if (hash(b, j + 30) < 0.3) r.set(x + 0.01 * N + hash(j, b) * 0.045 * N, road - 0.12 * N - hgt + 0.02 * N + hash(b, j) * hgt * 0.8, HOT + DIM);
    }
    for (let b = Math.floor((w.S * 0.4) / (0.18 * N)) - 1, e = b + 8; b < e; b++) {
      const x = b * 0.18 * N - w.S * 0.4, k = kindAt(w.mid, b), base = road - 0.06 * N;
      if (k === 'docks') {
        if (hash(b, 9) < 0.5) { r.rect(x + 0.08 * N, base - 0.32 * N, 0.015 * N, 0.32 * N, DARK); r.rect(x + 0.02 * N, base - 0.3 * N, 0.16 * N, 0.012 * N, DARK); for (let q = 0; q < 6; q++) r.line(x + 0.08 * N, base - q * 0.05 * N, x + 0.095 * N, base - (q + 1) * 0.05 * N, MID + DIM); r.line(x + 0.03 * N, base - 0.29 * N, x + 0.03 * N, base - 0.2 * N, MID + DIM); }
        for (let q = 0; q < 3; q++) if (hash(b, q) < 0.7) r.rect(x + q * 0.055 * N, base - (q % 2 + 1) * 0.04 * N, 0.05 * N, (q % 2 + 1) * 0.04 * N, q % 2 ? HOT + DIM : COOL + DIM);
      } else if (k === 'downtown') {
        const hgt = (0.25 + 0.2 * hash(b, 4)) * N;
        r.rect(x + 0.01 * N, base - hgt, 0.15 * N, hgt, DARK);
        for (let yy = base - hgt + 0.02 * N, j = 0; yy < base - 0.02 * N; yy += 0.03 * N, j++) for (let q = 0; q < 5; q++) if (hash(b * 5 + q, j) < 0.35) r.rect(x + 0.02 * N + q * 0.027 * N, yy, Math.max(1, 1.5 * u), Math.max(1, 1.5 * u), q % 3 ? BRIGHT + DIM : HOT + DIM);
      } else {
        r.rect(x + 0.02 * N, base - 0.12 * N, 0.12 * N, 0.12 * N, DARK);
        if (hash(b, 2) < 0.6) { r.rect(x + 0.1 * N, base - 0.3 * N, 0.025 * N, 0.18 * N, DARK); r.rect(x + 0.1 * N, base - 0.27 * N, 0.025 * N, Math.max(1, u), HOT + DIM); }
        r.disc(x + 0.05 * N, base - 0.13 * N, 0.035 * N, MID + DIM);
      }
    }
    r.rect(0, road - 0.06 * N, N, 0.035 * N, MID + DIM);
    for (let b = Math.floor((w.S * 0.85) / (0.5 * N)) - 1; b < Math.floor((w.S * 0.85) / (0.5 * N)) + 3; b++) { const x = b * 0.5 * N - w.S * 0.85; r.rect(x, road - 0.3 * N, Math.max(1, 0.01 * N), 0.25 * N, DARK); r.rect(x - 0.02 * N, road - 0.3 * N, 0.03 * N, 0.01 * N, BRIGHT); }
    // the road, or the bridge: its leaves as slabs between their piers, the river under the gap
    if (B) for (const d of [0, 2 * B.Lb + B.Gw]) r.rect(B.X0 + d - w.S + sx - 0.03 * N, road - 0.2 * N, 0.06 * N, 0.2 * N, DARK);
    for (let x = 0; x < N; x++) {
      const X = w.S + (x - sx), hh = hAt(X), y = road - hh;
      if (hh < -0.1 * N) { r.rect(x, road + 0.08 * N, 1, N, DARK + DIM); if (hash(x, Math.floor(t * 6)) < 0.15) r.set(x, road + 0.09 * N + hash(x, 3) * 0.1 * N, LMID + DIM); continue; }
      r.rect(x, y, 1, 0.025 * N, LMID + DIM);
      r.rect(x, y + 0.025 * N, 1, N, hh > 0 ? BLACK : DARK + DIM);
    }
    for (let b = Math.floor(w.S / (0.12 * N)) - 3; b < Math.floor(w.S / (0.12 * N)) + 9; b++) { const x = b * 0.12 * N - w.S + sx; if (!B || hAt(b * 0.12 * N) === 0) r.rect(x, road + 0.06 * N, 0.05 * N, Math.max(1, 0.6 * u), LMID + DIM); }
    if (B) for (const [d, k] of [[B.Lb, 1], [B.Lb + B.Gw, -1]]) { const x = B.X0 + d - w.S + sx, y = road - B.Lb * B.tan; r.rect(x - (k > 0 ? 0.02 * N : 0), y - 0.03 * N, 0.02 * N, 0.03 * N, Math.floor(t * 4) % 2 ? HOT : HOT + DIM); }
    // the police behind (they stop at the bridge), the bar red on even beats, blue on odd
    w.cop = follow(w.cop, B && B.X0 - w.S < 0.6 * N ? -0.6 * N : 0.06 * N + 0.04 * N * Math.sin(t * 0.7), dt, B ? 0.5 : 1.5);
    const cop = w.cop, odd = Math.floor(beatT(W)) & 1;
    if (cop > -0.4 * N) {
      const cy = road - rw;
      r.rect(cop - 0.15 * N, cy - 0.05 * N, 0.28 * N, 0.045 * N, DARK); r.rect(cop - 0.07 * N, cy - 0.09 * N, 0.13 * N, 0.04 * N, DARK);
      r.rect(cop - 0.05 * N, cy - 0.105 * N, 0.04 * N, 0.015 * N, odd ? DARK + DIM : HOT); r.rect(cop - 0.01 * N, cy - 0.105 * N, 0.04 * N, 0.015 * N, odd ? COOL : DARK + DIM);
      ditherPoly(r, [[cop + 0.01 * N, cy - 0.1 * N], [cop + 0.2 * N, cy - 0.2 * N], [cop + 0.25 * N, cy + 0.02 * N]], LIGHT, f.beat.pulse * 0.6);
      for (const k of [-0.09, 0.08]) { r.disc(cop + k * N, cy, rw, BLACK); r.disc(cop + k * N, cy, rw * 0.45, MID); }
      ditherPoly(r, [[cop + 0.13 * N, cy - 0.03 * N], [cop + 0.42 * N, cy - 0.07 * N], [cop + 0.42 * N, cy + 0.03 * N]], LIGHT, 0.5);
    }
    // the car: the body over its springs, turned by the pitch, foreshortened by the drift with its tail showing
    const cy = road - w.y - rw, pc = Math.cos(w.pitch), ps = Math.sin(w.pitch), cyaw = Math.cos(w.yaw), tail = 0.09 * N * Math.sin(w.yaw);
    const Q = (lx, ly) => { const X = lx * cyaw; return [sx + X * pc + ly * ps, cy - X * ps + ly * pc]; };
    const by = w.sb - rw * 0.4, bh = R.h * N, x0 = -L / 2, x1 = L / 2;
    r.poly([Q(x0, by), Q(x1, by), Q(x1, by - bh * 0.8), Q(x1 - L * 0.06, by - bh), Q(x0, by - bh)], MID);
    r.poly([Q(x0 + L * R.cab[0], by - bh), Q(x0 + L * R.cab[1], by - bh), Q(x0 + L * (R.cab[1] - 0.06), by - bh - R.cabH * N), Q(x0 + L * (R.cab[0] + 0.05), by - bh - R.cabH * N)], MID);
    r.poly([Q(x0 + L * (R.cab[0] + 0.03), by - bh - 1), Q(x0 + L * (R.cab[1] - 0.03), by - bh - 1), Q(x0 + L * (R.cab[1] - 0.07), by - bh - R.cabH * N * 0.8), Q(x0 + L * (R.cab[0] + 0.06), by - bh - R.cabH * N * 0.8)], DARK);
    const hd = Q(x0 + L * (R.cab[1] - 0.12), by - bh - R.cabH * N * 0.4); r.disc(hd[0], hd[1], 0.012 * N, BLACK);
    r.line(...Q(x0, by - bh * 0.5), ...Q(x1, by - bh * 0.5), LMID);
    if (tail > 0.5) { const a = Q(x0, by), b2 = Q(x0, by - bh); r.poly([a, b2, [b2[0] - tail, b2[1]], [a[0] - tail, a[1]]], DARK); r.rect(a[0] - tail, b2[1] + bh * 0.2, Math.max(1, tail * 0.3), bh * 0.25, HOT); r.rect(a[0] - tail * 0.35, b2[1] + bh * 0.2, Math.max(1, tail * 0.3), bh * 0.25, HOT); }
    const tl = Q(x0, by - bh * 0.7); r.rect(tl[0] - u, tl[1], Math.max(1, 1.5 * u), Math.max(1, 1.5 * u), HOT);
    const hl = Q(x1, by - bh * 0.6); r.rect(hl[0] - u, hl[1], Math.max(1, 1.5 * u), Math.max(1, 1.5 * u), BRIGHT);
    ditherPoly(r, [hl, [hl[0] + 0.35 * N, hl[1] - 0.04 * N], [hl[0] + 0.35 * N, hl[1] + 0.06 * N]], LIGHT, 0.6);
    for (const k of [-0.33, 0.33]) {
      const c = Q(k * L, 0);
      r.disc(c[0], c[1], rw, BLACK);
      r.disc(c[0], c[1], rw * 0.5, MID);
      for (let j = 0; j < 3; j++) { const a = w.wh + (j * TAU) / 3; r.line(c[0], c[1], c[0] + Math.cos(a) * rw * 0.5, c[1] + Math.sin(a) * rw * 0.5, DARK); }
      if (w.drift > 0.2 && k < 0) for (let q = spawns(rnd, 21, dt); q > 0; q--) w.smoke.push({ x: c[0], y: c[1] + rw * 0.6, vx: -w.v * 0.3, vy: -0.02 * N, rise: 0.04 * N, rad: 0.01 * N, grow: 0.04 * N, life: 0.9, max: 0.9, dens: 0.6 });
    }
    targets.push({ x: sx - L / 2, y: cy - bh - R.cabH * N - rw, w: L, h: bh + R.cabH * N + 2 * rw });
    w.smoke = smoke(W, w.smoke, LMID, -w.v, 30);
    w.sparks = sparks(W, w.sparks, g, -w.v);
    // the bills: to their terminal speed, the air braking them back to the road's speed, a sway and a tumble; on the
    // road they go by with it
    w.bills = w.bills.filter((b) => {
      if (b.down) b.x -= w.v * dt; else flyBill(b, dt, 0.09 * N, -w.v, (x) => road - hAt(w.S + x - sx) - 0.003 * N, 0.04 * N);
      drawBill(r, b, 0.03 * N, 0.014 * N);
      return b.x > -0.05 * N && b.y < N;
    });
  },
};

// ---------------------------------------------------------------------------------------------- countingroom
// A counting table seen from a little above, under a desk lamp's pool of light: a counter riffling bills from its
// hopper to its tray on the hats (its lamps, no digits, show how far it has got), stacks of banded bricks that grow
// a brick at a time with the level (each new one dropped on), a hand coming down flat on a stack on the kicks (the
// table jumps: loose bills and bands hop in small parabolas), a band flicked onto a stack on a snare, a cigar in the
// tray sending up a curl of smoke that slows and widens. Kinds: a back room, an office with a safe, a warehouse.
// A drop: the desk fan swings round to face the table and blows the bills up; they flutter, drift and settle.
const COUNT_W = { backroom: [3, 2, 1], office: [2, 3, 2], warehouse: [1, 2, 3] };
const COUNTS = { backroom: 4, office: 6, warehouse: 8 };

const countingroom = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, COUNT_W, bandOf(W.a)), lv: 0.4, stacks: Array.from({ length: 8 }, (_, i) => ({ n: 2, drop: 0, vd: 0, sq: 0, k: 0.6 + 0.6 * hash(i, 17) })), fed: 100, out: 0, riffle: 0,
      slap: 0, slapI: 0, hop: [], bands: [], loose: [], bills: [], smoke: [], puff: 0, fan: 0, fanT: 0, blade: 0, gust: 0 });
    for (let i = 0; i < 5; i++) w.loose.push({ U: (rnd() - 0.5) * 0.5, v: 0.55 + 0.4 * rnd(), z: 0, vz: 0, ang: rnd() });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bs = beatS(f), band = bandOf(W.a), yB = 0.52 * N, yF = 0.86 * N, g = gOf(0.45 * N);
    if (f.section === 'change') w.kind = rollW(rnd, COUNT_W, band);
    if (f.section === 'drop') { w.fanT = 8 * bs; w.gust = 1; }
    const ns = COUNTS[w.kind], TX = (U, v) => 0.5 * N + U * N * lerp(0.78, 1, v), TY = (v) => lerp(yB, yF, v);
    const SP = (i) => [-0.06 + (i % 4) * 0.1, 0.32 + Math.floor(i / 4) * 0.28 + (i % 2) * 0.05]; // the stacks' spots (U, v)
    for (const h of hits) {
      if (h.kind === 'kick') { w.slap = 1; w.slapI = Math.floor(rnd() * ns); s.shake = Math.max(s.shake, 0.12); }
      else if (h.kind === 'hat') { w.riffle = 0.25; w.fed -= 10; w.out += 10; }
      else if (h.kind === 'snare' && w.bands.length < 6) { const [U, v] = SP(Math.floor(rnd() * ns)); w.bands.push({ x: TX(0.3, 0.9), y: TY(0.9), tx: TX(U, v), ty: TY(v), q: 0 }); }
    }
    if (w.fed <= 0) { w.fed = 100; w.out = 0; const st = w.stacks[Math.floor(rnd() * ns)]; st.extra = (st.extra || 0) + 1; } // a counted brick goes onto a stack
    w.riffle -= dt; w.fanT -= dt;
    w.lv = follow(w.lv, f.level, dt, 1.2);
    // the room by kind, the table's top in perspective, its near edge and legs
    r.rect(0, 0, N, N, DARK + DIM);
    if (w.kind === 'office') { r.rect(0.06 * N, 0.2 * N, 0.16 * N, 0.3 * N, MID); r.ring(0.14 * N, 0.33 * N, 0.04 * N, Math.max(1, u), LMID); r.rect(0.18 * N, 0.31 * N, 0.02 * N, 0.04 * N, LMID); r.frame(Math.round(0.7 * N), Math.round(0.1 * N), Math.round(0.18 * N), Math.round(0.14 * N), MID + DIM); r.disc(0.79 * N, 0.17 * N, 0.04 * N, HOT + DIM); }
    else if (w.kind === 'warehouse') { for (let k = 0; k < 4; k++) { r.rect((0.03 + k * 0.12) * N, (0.3 - (k % 2) * 0.1) * N, 0.11 * N, (0.22 + (k % 2) * 0.1) * N, MID + DIM); r.line((0.03 + k * 0.12) * N, (0.3 - (k % 2) * 0.1) * N, (0.14 + k * 0.12) * N, 0.52 * N, DARK + DIM); } for (let x = 0.62 * N; x < N; x += 3 * u) r.rect(x, 0.05 * N, Math.max(1, u), 0.45 * N, MID + DIM); }
    else { r.rect(0.47 * N, 0, Math.max(1, u), 0.08 * N, DARK); for (let y = 0.1 * N; y < 0.5 * N; y += 0.1 * N) r.rect(0, y, N, Math.max(1, 0.5 * u), MID + DIM); }
    r.poly([[TX(-0.5, 0), yB], [TX(0.5, 0), yB], [TX(0.5, 1), yF], [TX(-0.5, 1), yF]], MID);
    r.rect(0, yF, N, 0.04 * N, DARK);
    r.rect(0, yF, N, Math.max(1, 0.5 * u), LMID);
    for (const lx of [0.06, 0.9]) r.rect(lx * N, yF + 0.04 * N, 0.04 * N, N, DARK);
    // the lamp's pool of light on the table (twice as bright under the shade), the lamp at the back
    ditherPoly(r, [[TX(-0.3, 0.05), TY(0.05)], [TX(0.3, 0.05), TY(0.05)], [TX(0.42, 0.95), TY(0.95)], [TX(-0.42, 0.95), TY(0.95)]], LIGHT, 1);
    ditherPoly(r, [[TX(-0.16, 0.1), TY(0.1)], [TX(0.16, 0.1), TY(0.1)], [TX(0.22, 0.75), TY(0.75)], [TX(-0.22, 0.75), TY(0.75)]], LIGHT, 0.5);
    const lx = TX(0, 0.06), ly = TY(0.06);
    r.rect(lx - 0.04 * N, ly - 0.012 * N, 0.08 * N, 0.012 * N, DARK); r.rect(lx - 0.005 * N, ly - 0.14 * N, 0.01 * N, 0.13 * N, DARK);
    r.poly([[lx - 0.09 * N, ly - 0.13 * N], [lx + 0.09 * N, ly - 0.13 * N], [lx + 0.07 * N, ly - 0.17 * N], [lx - 0.07 * N, ly - 0.17 * N]], COOL);
    r.rect(lx - 0.07 * N, ly - 0.13 * N, 0.14 * N, Math.max(1, 0.5 * u), BRIGHT);
    // the stacks: a brick drops onto one when the level (or the counter) calls for another, the hand slaps one flat
    w.slap = Math.max(0, w.slap - dt / (0.6 * bs));
    const order = [...Array(ns).keys()].sort((a, b) => SP(a)[1] - SP(b)[1]);
    for (const i of order) {
      const st = w.stacks[i], [U, v] = SP(i), want = clamp(Math.round(1 + w.lv * 6 * st.k) + (st.extra || 0), 1, 9);
      if (want > st.n) { st.n++; st.drop = 0.06 * N; st.vd = 0; } else if (want < st.n) st.n--;
      if (st.drop > 0) { st.vd += g * dt; st.drop = Math.max(0, st.drop - st.vd * dt); } // it falls the last bit onto the pile
      st.sq = follow(st.sq, i === w.slapI && w.slap > 0.6 ? 1 : 0, dt, 0.04);
      const sc = lerp(0.78, 1, v), bw = 0.075 * N * sc, bh = 0.016 * N * sc * (1 - 0.15 * st.sq), x = TX(U, v) - bw / 2, y0 = TY(v);
      r.rect(x + U * 0.06 * N, y0 - 0.004 * N + (v - 0.06) * 0.01 * N, bw, 0.006 * N, DARK); // its shadow on the table, cast away from the lamp at the back
      for (let k = 0; k < st.n; k++) { const yy = y0 - (k + 1) * bh - (k === st.n - 1 ? st.drop : 0); brick(r, x, yy, bw, bh, u); r.rect(x, yy, bw, Math.max(1, 0.3 * u), COOL + DIM); }
      r.rect(x, y0 - st.n * bh - st.drop - 0.008 * N * sc, bw, 0.008 * N * sc, LMID); // the top sheet
      if (i === 0) targets.push({ x, y: y0 - st.n * bh, w: bw, h: st.n * bh });
    }
    // loose bills and the band pile hop when the table is struck: a parabola up and back down (a little bounce)
    if (w.slap > 0.95) for (const o of w.loose) o.vz = Math.max(o.vz, 0.12 * N * (0.6 + 0.4 * rnd()));
    for (const o of w.loose) {
      o.vz -= g * dt; o.z += o.vz * dt;
      if (o.z <= 0) { o.z = 0; o.vz = o.vz < -0.02 * N ? -o.vz * 0.3 : 0; }
      const x = TX(o.U, o.v), y = TY(o.v) - o.z, sc = lerp(0.78, 1, o.v);
      if (o.z > 0.5) r.rect(x - 0.02 * N * sc, TY(o.v) - u, 0.04 * N * sc, Math.max(1, u), DARK);
      r.rect(x - 0.02 * N * sc, y - 0.006 * N, 0.04 * N * sc, 0.008 * N, COOL);
      r.rect(x - 0.004 * N, y - 0.006 * N, 0.008 * N, 0.008 * N, BRIGHT);
    }
    const bpx = TX(0.3, 0.9), bpy = TY(0.9);
    for (let k = 0; k < 5; k++) r.ring(bpx + (hash(k, 3) - 0.5) * 0.04 * N, bpy - 0.004 * N - (w.slap > 0.5 ? 0.01 * N * Math.sin(Math.PI * w.slap) : 0), 0.008 * N, Math.max(1, 0.5 * u), HOT, 0.5);
    // a flicked band: a parabola (steady across, a steady pull down) from the pile onto a stack
    w.bands = w.bands.filter((b) => { b.q += dt / 0.35; const q = Math.min(1, b.q), x = lerp(b.x, b.tx, q), y = lerp(b.y, b.ty, q) - 4 * q * (1 - q) * 0.08 * N; r.ring(x, y, 0.008 * N, Math.max(1, 0.5 * u), HOT, 0.5); return b.q < 1; });
    // the counter: bills riffle from the hopper over the drum to the tray; its lamps count along (no digits)
    const cx = TX(-0.32, 0.5), cyy = TY(0.5), cw = 0.17 * N;
    r.rect(cx - cw / 2, cyy - 0.09 * N, cw, 0.09 * N, DARK);
    r.rect(cx - cw / 2, cyy - 0.09 * N, cw, Math.max(1, u), MID);
    const hin = 0.004 * N * Math.ceil(w.fed / 10), hout = 0.004 * N * Math.ceil(w.out / 10);
    r.rect(cx - 0.03 * N, cyy - 0.09 * N - hin, 0.06 * N, hin, COOL); r.rect(cx - 0.004 * N, cyy - 0.09 * N - hin, 0.008 * N, hin, BRIGHT);
    r.rect(cx - 0.035 * N, cyy - 0.02 * N - hout, 0.07 * N, hout, COOL);
    if (w.riffle > 0) for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + ((t * 30 + k) % 4) * 0.5; r.line(cx, cyy - 0.06 * N, cx + Math.cos(a) * 0.04 * N, cyy - 0.06 * N + Math.sin(a) * 0.03 * N, LMID); }
    for (let k = 0; k < 8; k++) r.rect(cx - cw / 2 + 0.012 * N + k * 0.018 * N, cyy - 0.035 * N, Math.max(1, 0.01 * N), Math.max(1, 0.008 * N), k < (w.out / 100) * 8 ? COOL : k === (f.beat.count & 7) ? HOT + DIM : DARK + DIM);
    targets.push({ x: cx - cw / 2, y: cyy - 0.09 * N - hin, w: cw, h: 0.09 * N + hin });
    // the hand: down flat on a stack on the kick, then back up
    if (w.slap > 0) {
      const [U, v] = SP(w.slapI), st = w.stacks[w.slapI], hx = TX(U, v), sc = lerp(0.78, 1, v), top = TY(v) - st.n * 0.016 * N * sc - 0.01 * N, k = w.slap > 0.7 ? (1 - w.slap) / 0.3 : 1 - (0.7 - w.slap) / 0.7;
      const hy = lerp(-0.1 * N, top, clamp(k));
      r.stroke(hx + 0.12 * N, -0.02 * N, hx + 0.02 * N, hy - 0.02 * N, 0.05 * N, FIG);
      r.rect(hx - 0.045 * N, hy - 0.025 * N, 0.08 * N, 0.025 * N, FIG);
      r.rect(hx - 0.06 * N, hy - 0.012 * N, 0.02 * N, 0.012 * N, FIG);
    }
    // the ashtray and the cigar: smoke curling up from the ember, slowing and widening as it goes, blown by the fan
    const ax = TX(0.38, 0.72), ay = TY(0.72);
    r.ring(ax, ay - 0.006 * N, 0.025 * N, Math.max(1, 0.012 * N), LMID, 0.45);
    r.stroke(ax - 0.01 * N, ay - 0.008 * N, ax + 0.05 * N, ay - 0.016 * N, Math.max(1, 0.012 * N), MID);
    const ex = ax + 0.05 * N, ey = ay - 0.016 * N;
    r.rect(ex - 0.003 * N, ey - 0.005 * N, Math.max(1, 0.006 * N), Math.max(1, 0.01 * N), f.beat.pulse > 0.5 ? BRIGHT : HOT);
    // the fan at the back right: swinging side to side, on a drop round to the table at full speed; its wind on the
    // money and the smoke
    const blow = w.fanT > 0;
    w.fan = follow(w.fan, blow ? -1.25 : 0.55 * Math.sin(t * 0.7), dt, blow ? 0.25 : 0.6);
    w.blade += dt * (blow ? 40 : 18);
    const fx = TX(0.44, 0.15), fy = TY(0.15), wind = blow ? -0.6 * N * clamp(-w.fan / 1.2) : 0;
    r.rect(fx - 0.03 * N, fy - 0.01 * N, 0.06 * N, 0.01 * N, DARK); r.rect(fx - 0.004 * N, fy - 0.1 * N, 0.008 * N, 0.09 * N, DARK);
    const fr = 0.05 * N, cwf = Math.max(0.15, Math.abs(Math.cos(w.fan)));
    for (let k = 0; k < 3; k++) { const a = w.blade + (k * TAU) / 3; r.stroke(fx, fy - 0.12 * N, fx + Math.cos(a) * fr * 0.85 * cwf, fy - 0.12 * N + Math.sin(a) * fr * 0.85, Math.max(1, 0.02 * N), LMID); }
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; r.set(fx + Math.cos(a) * fr * cwf, fy - 0.12 * N + Math.sin(a) * fr, DARK); }
    r.disc(fx, fy - 0.12 * N, 0.008 * N, DARK);
    for (w.puff -= dt; w.puff <= 0; w.puff += 0.07) { w.smoke.push({ x: ex, y: ey - 0.004 * N, vx: 0, vy: -0.02 * N, rise: 0.06 * N, rad: 0.003 * N, grow: 0.01 * N, life: 2.6, max: 2.6, dens: 0.4 }); }
    w.smoke = smoke(W, w.smoke, LMID, wind * 0.5, 40);
    // the gust: the top sheets lift off the stacks and the loose ones go too; up, then fluttering down where they may
    if (w.gust > 0 && w.fanT < 8 * bs - 0.4) {
      w.gust = 0;
      for (let i = 0; i < ns; i++) { const [U, v] = SP(i); for (let k = 0; k < 3; k++) w.bills.push({ x: TX(U, v), y: TY(v) - w.stacks[i].n * 0.016 * N, v, vx: -0.2 * N * rnd(), vy: -(0.2 + 0.25 * rnd()) * N, ph: rnd() * TAU, om: (rnd() - 0.5) * 12, ang: rnd(), down: false }); }
    }
    w.bills = w.bills.filter((b) => {
      flyBill(b, dt, 0.08 * N, wind, (x) => (x > TX(-0.5, b.v) && x < TX(0.5, b.v) ? TY(b.v) : N + 0.1 * N), 0.04 * N);
      drawBill(r, b, 0.035 * N, 0.012 * N);
      return b.y < N;
    });
    if (w.bills.length > 40) w.bills.splice(0, w.bills.length - 40);
  },
};

// ---------------------------------------------------------------------------------------------- interrogation
// A bare room from the side: one lamp on a cord over the table, a pendulum (its swing integrated, w = sqrt(g/L) with
// g at the scale of the people in it), its cone of light cast from the bulb (the table and the two throw shadows,
// the walls take it where it reaches); a one-way mirror with the observers faint behind it, a clock that ticks the
// beat. A kick is a fist on the table (the cups jump, small parabolas, and land), a snare knocks the lamp (an
// impulse to its swing), a note stirs the observers. Kinds: the room, a precinct's block walls, a basement, a
// warehouse office. A drop: the lamp is sent swinging wide, its cone sweeping the walls.
const ROOM_W = { precinct: [3, 2, 1], basement: [2, 3, 2], warehouse: [1, 2, 3] };

const interrogation = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, ROOM_W, bandOf(W.a)), th: (rnd() - 0.5) * 0.3, om: 0, fist: 1, cups: [{ x: 0.46, z: 0, vz: 0 }, { x: 0.57, z: 0, vz: 0 }], obs: 0, flinch: 0, tick: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), fy = 0.8 * N, hP = 0.4 * N, g = gOf(hP), Lc = 0.36 * N, pvx = 0.5 * N, pvy = 0.02 * N;
    if (f.section === 'change') w.kind = rollW(rnd, ROOM_W, band);
    if (f.section === 'drop') { w.om += (w.om >= 0 ? 1 : -1) * 3.2; s.shake = Math.max(s.shake, 0.2); }
    for (const h of hits) {
      if (h.kind === 'kick') { w.fist = 0; w.flinch = 1; for (const c of w.cups) c.vz = Math.max(c.vz, (0.22 + 0.12 * h.strength) * N); s.shake = Math.max(s.shake, 0.1 * h.strength); }
      else if (h.kind === 'snare') w.om += (rnd() < 0.5 ? -1 : 1) * (0.5 + 0.4 * h.strength); // knocked: a kick to its angular speed
      if (isTonal(h)) w.obs = 1;
    }
    if (beatTick(w, f, dt)) w.tick++;
    // the swing: theta'' = -(g/L) sin(theta) - c theta', in small steps
    for (let k = 0, n = Math.ceil(dt / 0.004); k < n; k++) { const hh = dt / n; w.om += (-(g / Lc) * Math.sin(w.th) - 0.12 * w.om) * hh; w.th += w.om * hh; }
    w.fist = Math.min(1, w.fist + dt / 0.6); w.flinch *= Math.exp(-dt * 5); w.obs *= Math.exp(-dt * 1.5);
    // the room by kind (all of it dimmed roles: walls take the light, never block it)
    r.rect(0, 0, N, fy, DARK + DIM);
    if (w.kind === 'precinct') { for (let j = 0, y = 0; y < fy; j++, y += 0.05 * N) { r.rect(0, y, N, Math.max(1, 0.5 * u), BG + DIM); for (let x = (j % 2) * 0.06 * N; x < N; x += 0.12 * N) r.rect(x, y, Math.max(1, 0.5 * u), 0.05 * N, BG + DIM); } }
    else if (w.kind === 'basement') { for (const py of [0.05, 0.09]) { r.rect(0, py * N, N, 0.02 * N, MID + DIM); for (let x = 0.1 * N; x < N; x += 0.25 * N) r.rect(x, py * N - 0.004 * N, 0.012 * N, 0.028 * N, LMID + DIM); } r.rect(0.84 * N, 0.11 * N, 0.02 * N, fy - 0.11 * N, MID + DIM); }
    else { for (let x = 0; x < N; x += 0.025 * N) r.rect(x, 0, Math.max(1, 0.5 * u), fy, BG + DIM); r.rect(0, 0.12 * N, N, Math.max(1, u), MID + DIM); }
    r.rect(0, fy, N, N - fy, MID + DIM);
    for (let k = 1; k < 5; k++) r.rect(0, fy + k * k * 0.012 * N, N, Math.max(1, 0.5 * u), DARK + DIM);
    if (w.kind === 'basement') r.ring(0.5 * N, fy + 0.1 * N, 0.025 * N, Math.max(1, u), DARK + DIM, 0.35); // the drain
    // the one-way mirror: dark glass, two faint watchers behind it who stir on the notes, a streak of reflection
    const mx = 0.05 * N, my = 0.2 * N, mw = 0.3 * N, mh = 0.3 * N;
    r.rect(mx - 0.012 * N, my - 0.012 * N, mw + 0.024 * N, mh + 0.024 * N, MID + DIM);
    r.rect(mx, my, mw, mh, BG + DIM);
    for (let i = 0; i < 2; i++) {
      const ox = mx + (0.3 + 0.4 * i) * mw + Math.sin(t * 0.3 + i * 2) * 0.01 * N + (i ? w.obs * 0.02 * N : 0), oy = my + mh * 0.45;
      ditherDisc(r, ox, oy, 0.035 * N, DARK + DIM, 0.4);
      ditherRect(r, ox - 0.06 * N, oy + 0.04 * N, 0.12 * N, my + mh - oy - 0.04 * N, DARK + DIM, 0.4);
    }
    for (let k = 0; k < 3; k++) r.line(mx + (0.1 + k * 0.08) * mw, my + mh, mx + (0.3 + k * 0.08) * mw, my, MID + DIM);
    // the clock: two hands, the long one stepping once a beat (sixty steps round)
    const ccx = 0.86 * N, ccy = 0.2 * N;
    r.ring(ccx, ccy, 0.045 * N, Math.max(1, u), LMID + DIM);
    const a1 = (w.tick / 60) * TAU - Math.PI / 2, a2 = (w.tick / 720) * TAU - Math.PI / 2;
    r.line(ccx, ccy, ccx + Math.cos(a1) * 0.04 * N, ccy + Math.sin(a1) * 0.04 * N, LMID + DIM);
    r.line(ccx, ccy, ccx + Math.cos(a2) * 0.025 * N, ccy + Math.sin(a2) * 0.025 * N, LMID + DIM);
    // the table, the suspect on his chair (flinching on the kick), the one standing over the table, fists on it
    const tt = 0.6 * N;
    r.rect(0.32 * N, tt, 0.36 * N, 0.02 * N, MID);
    for (const lx of [0.34, 0.64]) r.rect(lx * N, tt + 0.02 * N, 0.015 * N, fy - tt - 0.02 * N, MID);
    const scx = 0.76 * N, seat = 0.66 * N;
    r.rect(scx - 0.04 * N, seat, 0.1 * N, 0.015 * N, DARK); r.rect(scx + 0.05 * N, seat - 0.16 * N, 0.012 * N, 0.17 * N, DARK);
    for (const lx of [-0.035, 0.05]) r.rect(scx + lx * N, seat, 0.01 * N, fy - seat, DARK);
    const lean = 0.25 - 0.3 * w.flinch, shx = scx - Math.sin(lean) * 0.17 * N, shy = seat - Math.cos(lean) * 0.17 * N;
    r.stroke(scx, seat - 0.02 * N, scx - 0.1 * N, seat - 0.02 * N, 0.045 * N, FIG);
    r.stroke(scx - 0.1 * N, seat - 0.02 * N, scx - 0.1 * N, fy, 0.04 * N, FIG);
    r.stroke(scx, seat - 0.02 * N, shx, shy, 0.075 * N, FIG);
    r.disc(shx - 0.01 * N, shy - 0.055 * N + 0.01 * N * (1 - w.flinch), 0.035 * N, FIG); // the head hangs, jerks up on the kick
    arm(r, shx, shy + 0.01 * N, 0.62 * N, tt - 0.005 * N, 0.2 * N, -1, 0.03 * N, FIG);
    targets.push({ x: scx - 0.12 * N, y: shy - 0.09 * N, w: 0.2 * N, h: fy - shy + 0.09 * N });
    const ix = 0.22 * N, hip = fy - 0.47 * hP, bend = 0.45, ishx = ix + Math.sin(bend) * 0.3 * hP, ishy = hip - Math.cos(bend) * 0.3 * hP;
    for (const k of [-1, 1]) arm(r, ix, hip, ix + k * 0.05 * hP, fy, 0.5 * hP, -1, 0.07 * hP, FIG);
    r.stroke(ix, hip, ishx, ishy, 0.13 * hP, FIG);
    r.disc(ishx + 0.06 * hP, ishy - 0.08 * hP, 0.08 * hP, FIG);
    const lift = Math.sin(Math.PI * w.fist) * 0.1 * N * (w.fist < 1 ? 1 : 0); // after the slam the fist comes up and back down
    arm(r, ishx, ishy + 0.03 * hP, 0.37 * N, tt - 0.012 * N - lift, 0.42 * hP, 1, 0.06 * hP, FIG);
    r.rect(0.36 * N, tt - 0.022 * N - lift, 0.03 * N, 0.022 * N, FIG);
    targets.push({ x: ix - 0.08 * N, y: ishy - 0.15 * hP, w: 0.2 * N, h: fy - ishy + 0.15 * hP });
    // the cups: up on the slam and back onto the table, a little bounce, then still
    for (const c of w.cups) {
      c.vz -= g * dt; c.z += c.vz * dt;
      if (c.z <= 0) { c.z = 0; c.vz = c.vz < -0.05 * N ? -c.vz * 0.3 : 0; }
      r.rect(c.x * N - 0.012 * N, tt - 0.03 * N - c.z, 0.024 * N, 0.03 * N, LMID);
      r.rect(c.x * N - 0.01 * N, tt - 0.03 * N - c.z, 0.02 * N, Math.max(1, 0.5 * u), DARK);
    }
    // the light: from the bulb along the cord, out of the shade; then the cord, the shade and the bulb over it
    const ax = Math.sin(w.th), ay = Math.cos(w.th), lx = pvx + ax * Lc, ly = pvy + ay * Lc, bright = 0.85 + 0.15 * f.level;
    castLight(W, lx + ax * 0.03 * N, ly + ay * 0.03 * N, Math.atan2(ay, ax), 0.5 * bright, 1.25 * N, 0.35);
    r.line(pvx, pvy, lx, ly, DARK);
    r.rect(pvx - 0.02 * N, 0, 0.04 * N, pvy, DARK);
    const qx = ay, qy = -ax; // across the shade
    r.poly([[lx - qx * 0.012 * N, ly - qy * 0.012 * N], [lx + qx * 0.012 * N, ly + qy * 0.012 * N], [lx + qx * 0.045 * N + ax * 0.035 * N, ly + qy * 0.045 * N + ay * 0.035 * N], [lx - qx * 0.045 * N + ax * 0.035 * N, ly - qy * 0.045 * N + ay * 0.035 * N]], DARK);
    r.disc(lx + ax * 0.035 * N, ly + ay * 0.035 * N, 0.012 * N, WHITE);
    targets.push({ x: lx - 0.05 * N, y: ly - 0.02 * N, w: 0.1 * N, h: 0.07 * N });
  },
};

// ---------------------------------------------------------------------------------------------- switchboard
// An old telephone exchange from behind the operators: a board of jacks with a lamp over each, the lamps lit up the
// columns by the band levels; on the shelf the plugs, each on a cord hung as a catenary from its hole to wherever its
// plug is. On every beat one of the operators takes a plug up to a jack or pulls one out and brings it home (the
// hand carries it). A snare clips a tap onto a live line and a pulse runs down the cord; a kick thumps a plug home,
// a hat flips a key on the shelf, a note lights its column. Kinds: the size of the exchange, one operator, two,
// three. A drop: every lamp flashes and all the cords swing, pendulums at sqrt(g/sag), dying away.
const SWITCH_W = { manual: [3, 2, 1], bank: [2, 3, 2], exchange: [1, 2, 3] };
const BOARDS = { manual: { ops: 1, cords: 6 }, bank: { ops: 2, cords: 9 }, exchange: { ops: 3, cords: 12 } };
const COLS = 12, ROWS = 7;

const switchboard = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, SWITCH_W, bandOf(W.a)), cords: [], tap: null, flash: 0, swing: 0, swT: 0, keys: new Uint8Array(24), blink: new Float32Array(COLS), pts: new Float32Array(30), who: 0, thump: 0 });
    w.cords = Array.from({ length: 12 }, (_, i) => ({ jack: -1, x: 0, y: 0, mv: null, kick: 0 }));
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bs = beatS(f), band = bandOf(W.a), K = BOARDS[w.kind], bx0 = 0.06 * N, bx1 = 0.94 * N, by0 = 0.05 * N, by1 = 0.56 * N, shelf = 0.58 * N, g = gOf(0.4 * N);
    if (f.section === 'change') w.kind = rollW(rnd, SWITCH_W, band);
    if (f.section === 'drop') { w.flash = 2 * bs; w.swing = 1; w.swT = 0; s.shake = Math.max(s.shake, 0.15); }
    const nc = BOARDS[w.kind].cords, jx = (j) => bx0 + ((j % COLS) + 0.5) * ((bx1 - bx0) / COLS), jy = (j) => by0 + (Math.floor(j / COLS) + 0.75) * ((by1 - by0) / ROWS), hole = (i) => bx0 + ((i + 0.5) * (bx1 - bx0)) / 12;
    for (let i = nc; i < 12; i++) { const c = w.cords[i]; c.jack = -1; c.mv = null; } // cords beyond this board's count stay home
    const busy = new Set(w.cords.map((c) => c.jack));
    for (const h of hits) {
      if (h.kind === 'snare') { const live = w.cords.slice(0, nc).map((c, i) => (c.jack >= 0 && !c.mv ? i : -1)).filter((i) => i >= 0); if (live.length) w.tap = { i: pick(rnd, live), q: 0 }; }
      else if (h.kind === 'kick') { w.thump = 0.15; s.shake = Math.max(s.shake, 0.05); for (const c of w.cords) if (c.jack >= 0) c.kick = Math.max(c.kick, 0.4); }
      else if (h.kind === 'hat') w.keys[Math.floor(rnd() * 24)] ^= 1;
      if (isTonal(h)) w.blink[h.pc % COLS] = 0.3;
    }
    w.flash -= dt; w.thump -= dt; w.swT += dt;
    w.swing *= Math.exp(-dt / 1.6);
    for (let c = 0; c < COLS; c++) w.blink[c] -= dt;
    // the beat: one move, a plug up to a free jack or a plug home
    if (beatTick(w, f, dt)) {
      const i = Math.floor(rnd() * nc), c = w.cords[i];
      if (!c.mv) {
        if (c.jack < 0) { let j = Math.floor(rnd() * COLS * ROWS); for (let k = 0; k < 20 && busy.has(j); k++) j = Math.floor(rnd() * COLS * ROWS); c.mv = { fx: hole(i), fy: shelf, tj: j, q: 0 }; }
        else c.mv = { fx: jx(c.jack), fy: jy(c.jack), tj: -1, q: 0 }, (w.tap && w.tap.i === i) && (w.tap = null), (c.jack = -1);
        c.op = Math.min(K.ops - 1, Math.floor((hole(i) / N) * K.ops));
      }
    }
    // the board: jacks, and over each a lamp, the columns lit to the band levels (a note lights its own)
    r.rect(0, 0, N, N, DARK + DIM);
    r.rect(bx0 - 0.02 * N, by0 - 0.02 * N, bx1 - bx0 + 0.04 * N, by1 - by0 + 0.04 * N, DARK);
    r.rect(bx0, by0, bx1 - bx0, by1 - by0, MID);
    const lvl = (c) => { const b = f.band10; if (b && b.length) return b[Math.min(b.length - 1, Math.floor((c / COLS) * b.length))]; const q = c / (COLS - 1); return q < 0.5 ? lerp(f.low, f.mid, q * 2) : lerp(f.mid, f.high, q * 2 - 2 + 1); };
    const all = w.flash > 0 ? (Math.floor(t * 10) % 2 ? 2 : 0) : 1;
    for (let j = 0; j < COLS * ROWS; j++) {
      const c = j % COLS, row = Math.floor(j / COLS), x = jx(j), y = jy(j), on = all === 2 || (all === 1 && (w.blink[c] > 0 || (ROWS - row) / ROWS <= lvl(c) * 1.2));
      r.rect(x - 0.012 * N, y - 0.04 * N, 0.024 * N, 0.016 * N, on ? (w.blink[c] > 0 ? BRIGHT : row < 2 ? HOT : COOL) : DARK + DIM);
      r.disc(x, y, Math.max(1, 0.01 * N), BLACK);
      r.ring(x, y, Math.max(1, 0.012 * N), Math.max(1, 0.4 * u), LMID);
    }
    // the shelf with its holes and keys
    r.rect(0.02 * N, shelf, 0.96 * N, 0.05 * N, MID);
    r.rect(0.02 * N, shelf, 0.96 * N, Math.max(1, u), LMID);
    r.rect(0.02 * N, shelf + 0.05 * N, 0.96 * N, 0.02 * N, DARK);
    for (let k = 0; k < 24; k++) { const x = 0.05 * N + k * 0.038 * N; r.rect(x, shelf + 0.02 * N - (w.keys[k] ? 0.012 * N : 0), Math.max(1, 0.008 * N), 0.02 * N, w.keys[k] ? BRIGHT : LMID); }
    // the cords: a catenary from the hole to the plug, swung on the drop (gravity tilted with the swing, a pendulum
    // of the sag's length), twitching when a plug is thumped home
    for (let i = 0; i < nc; i++) {
      const c = w.cords[i], hx = hole(i);
      if (c.mv) { c.mv.q = Math.min(1, c.mv.q + dt / (0.55 * bs)); const tx = c.mv.tj >= 0 ? jx(c.mv.tj) : hx, ty = c.mv.tj >= 0 ? jy(c.mv.tj) : shelf - 0.01 * N, q = ease(c.mv.q); c.x = lerp(c.mv.fx, tx, q); c.y = lerp(c.mv.fy, ty, q) - Math.sin(Math.PI * q) * 0.04 * N; if (c.mv.q >= 1) { c.jack = c.mv.tj; c.mv = null; } }
      else if (c.jack >= 0) { c.x = jx(c.jack); c.y = jy(c.jack); }
      else { c.x = hx; c.y = shelf - 0.01 * N; }
      c.kick *= Math.exp(-dt * 4);
      const live = c.jack >= 0 || c.mv;
      if (live) {
        const d = Math.hypot(c.x - hx, c.y - shelf), L = d * 1.12 + 0.05 * N, sag = Math.sqrt(Math.max(0, L * L - d * d)) / 2 + 0.01 * N;
        const tilt = (0.5 * w.swing + 0.08 * c.kick) * Math.sin(Math.sqrt(g / sag) * w.swT + i * 0.7);
        catenary(hx, shelf, c.x, c.y + 0.012 * N, L, tilt, 14, w.pts);
        polyline(r, w.pts, 14, BLACK, Math.max(1, 0.008 * N));
        if (w.tap && w.tap.i === i) { // the tap: a clip on the line, a pulse running down it to the shelf
          w.tap.q = Math.min(1, w.tap.q + dt / 0.5);
          const kq = Math.round(7), kp = Math.round(14 * (1 - w.tap.q));
          r.rect(w.pts[2 * kq] - 0.012 * N, w.pts[2 * kq + 1] - 0.008 * N, 0.024 * N, 0.016 * N, HOT);
          r.line(w.pts[2 * kq], w.pts[2 * kq + 1], w.pts[2 * kq] + 0.15 * N, N, HOT + DIM);
          if (w.tap.q < 1) r.disc(w.pts[2 * kp], w.pts[2 * kp + 1], Math.max(1, 0.012 * N), WHITE);
        }
      }
      r.rect(c.x - 0.008 * N, c.y - 0.006 * N, 0.016 * N, 0.022 * N, i % 3 ? LMID : BRIGHT); // the plug
    }
    // the operators from behind: chair backs, shoulders, heads in headsets; a hand carries each plug that moves
    for (let k = 0; k < K.ops; k++) {
      const ox = ((k + 0.5) / K.ops) * N, oy = 0.66 * N, mv = w.cords.find((c, i) => i < nc && c.mv && c.op === k);
      r.poly([[ox - 0.13 * N, N], [ox - 0.12 * N, oy + 0.05 * N], [ox - 0.06 * N, oy], [ox + 0.06 * N, oy], [ox + 0.12 * N, oy + 0.05 * N], [ox + 0.13 * N, N]], FIG);
      r.rect(ox - 0.025 * N, oy - 0.03 * N, 0.05 * N, 0.04 * N, FIG);
      r.disc(ox, oy - 0.06 * N, 0.045 * N, FIG);
      r.disc(ox, oy - 0.085 * N, 0.04 * N, FIG); // hair up
      for (let q = 0; q <= 6; q++) { const a = Math.PI + (q / 6) * Math.PI; r.set(ox + Math.cos(a) * 0.05 * N, oy - 0.06 * N + Math.sin(a) * 0.05 * N, DARK); }
      r.rect(ox + 0.045 * N, oy - 0.07 * N, 0.012 * N, 0.025 * N, DARK);
      const tx = mv ? mv.x : ox + 0.08 * N, ty = mv ? mv.y + 0.02 * N : shelf + 0.01 * N;
      arm(r, ox + 0.07 * N, oy + 0.02 * N, tx, ty, 0.36 * N, -1, 0.025 * N, FIG);
      arm(r, ox - 0.07 * N, oy + 0.02 * N, ox - 0.09 * N, shelf + 0.015 * N, 0.36 * N, 1, 0.025 * N, FIG);
      r.rect(ox - 0.17 * N, 0.82 * N, 0.34 * N, 0.04 * N, DARK); r.rect(ox - 0.17 * N, 0.82 * N, 0.34 * N, Math.max(1, 0.5 * u), MID);
      targets.push({ x: ox - 0.12 * N, y: oy - 0.13 * N, w: 0.24 * N, h: 0.25 * N });
    }
    if (w.thump > 0) r.rect(bx0, by1 + 0.005 * N, bx1 - bx0, Math.max(1, 0.5 * u), BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- burners
// A table of burner phones seen from above (straight down, a height shown as a lift up the screen): slabs with a
// screen and a keypad of plain dots. A buzzing phone walks by stick and slip: each kick of its motor throws it into
// a hop (as high as the scene's gravity lets it go), it lands, friction stops it dead, the next kick moves it on, a
// little turned. Hits set phones buzzing, notes light their screens, a snare makes one ring (its screen pulsing on the
// beat, rings of sound), a kick thumps the table and they all jump. Kinds: whose table, a kitchen, a motel, a stash;
// a new count of phones slides in or is swept off. A drop: they all ring at once and one walks off the front edge:
// it falls, bounces on the floor, slides to a stop.
const BURN_W = { kitchen: [3, 2, 1], motel: [2, 3, 2], stash: [1, 2, 3] };
const PHONES = { kitchen: 6, motel: 9, stash: 12 };
const newPhone = (rnd, x, y) => ({ x, y, z: 0, vx: 0, vy: 0, vz: 0, a: (rnd() - 0.5) * 1.2, om: 0, d: rnd() < 0.5 ? -1 : 1, buzz: 0, ph: 0, lit: 0, ring: 0, off: 0, gone: false });

const burners = {
  init(W) {
    const { w, rnd, N } = W, n = PHONES[(w.kind = rollW(rnd, BURN_W, bandOf(W.a)))];
    Object.assign(w, { phones: [], floor: [], waves: [], walker: -1 });
    for (let i = 0; i < n; i++) w.phones.push(newPhone(rnd, (0.15 + 0.7 * hash(i, 3)) * N, (0.12 + 0.42 * hash(i, 4)) * N));
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bt = beatT(W), ty0 = 0.04 * N, edge = 0.62 * N, hT = 0.4 * N, kz = 0.7, g = gOf(1.6 * N), mu = 0.35;
    if (f.section === 'change') { // a new table's worth: the extra ones slide in from the left, the spare ones are swept off the back
      w.kind = rollW(rnd, BURN_W, band);
      const want = PHONES[w.kind], live = w.phones.filter((p) => !p.gone);
      for (let i = live.length; i < want; i++) { const p = newPhone(rnd, -0.05 * N, (0.15 + 0.4 * rnd()) * N); p.vx = (0.6 + 0.3 * rnd()) * N; w.phones.push(p); }
      for (let i = want; i < live.length; i++) { live[i].vy = -0.8 * N; live[i].swept = true; }
    }
    const live = w.phones.filter((p) => !p.gone && !p.swept);
    if (f.section === 'drop' && live.length) {
      for (const p of live) { p.ring = 3; p.buzz = 3; }
      const p = live.reduce((a, b) => (b.y > a.y ? b : a)); p.walk = true; p.a = 0.1; p.d = 1; p.buzz = 9; // the nearest the front edge, lying so its motor drives it forward, buzzing until it is over
    }
    for (const h of hits) {
      if (!live.length) break;
      if (h.kind === 'kick') { for (const p of live) if (p.z <= 0) p.vz = 0.45 * N * (0.6 + 0.4 * h.strength); s.shake = Math.max(s.shake, 0.06); }
      if (h.kind === 'snare') { const p = pick(rnd, live); p.ring = 1.5; p.buzz = 1.5; }
      else { const p = live[Math.floor(rnd() * live.length)]; p.buzz = Math.max(p.buzz, h.kind === 'hat' ? 0.12 : 0.35); }
      if (isTonal(h)) live[h.pc % live.length].lit = 0.7;
    }
    // the table from above, a lamp's pool on it, the near edge, the floor below with the legs
    r.rect(0, 0, N, N, DARK + DIM);
    r.rect(0.04 * N, ty0, 0.92 * N, edge - ty0, MID);
    for (let y = ty0 + 0.03 * N; y < edge; y += 0.045 * N) r.rect(0.04 * N, y + Math.sin(y) * u, 0.92 * N, Math.max(1, 0.5 * u), MID + DIM);
    ditherPoly(r, [[0.3 * N, 0.1 * N], [0.7 * N, 0.1 * N], [0.8 * N, 0.5 * N], [0.2 * N, 0.5 * N]], LIGHT, 0.5);
    if (w.kind === 'kitchen') { r.ring(0.85 * N, 0.12 * N, 0.035 * N, Math.max(1, 0.012 * N), LMID); r.disc(0.85 * N, 0.12 * N, 0.025 * N, DARK); r.rect(0.07 * N, 0.4 * N, 0.08 * N, 0.16 * N, LMID + DIM); }
    else if (w.kind === 'motel') { r.ring(0.12 * N, 0.12 * N, 0.04 * N, Math.max(1, 0.015 * N), LMID); r.rect(0.82 * N, 0.48 * N, 0.04 * N, 0.015 * N, BRIGHT); r.rect(0.86 * N, 0.47 * N, 0.05 * N, 0.03 * N, HOT); }
    else { for (let k = 0; k < 3; k++) brick(r, 0.8 * N, 0.08 * N + k * 0.035 * N, 0.12 * N, 0.03 * N, u); r.ring(0.12 * N, 0.5 * N, 0.04 * N, Math.max(1, 0.02 * N), LMID); }
    r.rect(0.04 * N, edge, 0.92 * N, 0.04 * N, DARK);
    r.rect(0.04 * N, edge, 0.92 * N, Math.max(1, 0.5 * u), LMID);
    for (const lx of [0.06, 0.9]) r.rect(lx * N, edge + 0.04 * N, 0.04 * N, hT * kz - 0.04 * N, DARK);
    r.rect(0, edge + hT * kz, N, N, DARK + DIM);
    // each phone: its motor kicks six times a second while it buzzes (a hop lasts 2 vz / g, a tenth of a second, so it
    // is down a while between kicks: that is the stick), each kick a hop and a push along its length;
    // in the air it flies, on the table friction (mu g) takes its speed and its turning away, and it sticks
    // stepped in hundredths: a hop lasts a tenth of a second, so a long frame must not land it before it has moved
    const fl = [], ns = Math.ceil(dt / 0.01), hs = dt / ns;
    for (const p of w.phones) {
      if (p.gone) continue;
      for (let st = 0; st < ns; st++) {
        p.buzz -= hs; p.ring -= hs; p.lit -= hs;
        if (p.buzz > 0 && !p.fall) {
          p.ph += hs * 6;
          if (p.ph >= 1) { p.ph -= 1; if (p.z <= 0) { const push = (p.walk ? 0.12 : 0.05) * N; p.vz = 0.45 * N; p.vx += Math.cos(p.a + Math.PI / 2) * push * p.d; p.vy += Math.sin(p.a + Math.PI / 2) * push * p.d; p.om += (p.walk ? 0 : rnd() - 0.5) * 1.6; } }
        }
        if (p.fall) { // off the edge: falling to the floor, bouncing, sliding to a stop there
          p.vz -= g * hs; p.z += p.vz * hs; p.y += p.vy * hs; p.x += p.vx * hs; p.a += p.om * hs;
          if (p.z <= -hT) { p.z = -hT; if (p.vz < -0.15 * N) { p.vz = -p.vz * 0.35; p.om *= 0.5; s.shake = Math.max(s.shake, 0.1); } else { p.vz = 0; const sp = Math.hypot(p.vx, p.vy), dv = mu * g * hs; if (sp <= dv) { p.vx = p.vy = 0; p.om = 0; } else { p.vx -= (p.vx / sp) * dv; p.vy -= (p.vy / sp) * dv; } } }
        } else {
          p.vz -= g * hs; p.z += p.vz * hs;
          if (p.z <= 0) { p.z = 0; p.vz = 0; const sp = Math.hypot(p.vx, p.vy), dv = mu * g * hs; if (sp <= dv) { p.vx = p.vy = 0; } else { p.vx -= (p.vx / sp) * dv; p.vy -= (p.vy / sp) * dv; } p.om *= Math.exp(-hs * 25); }
          p.x += p.vx * hs; p.y += p.vy * hs; p.a += p.om * hs;
          if (p.swept && p.y < -0.1 * N) p.gone = true;
          if (!p.swept) p.x = clamp(p.x, 0.07 * N, 0.93 * N);
          if (!p.swept && !p.walk && p.y > edge - 0.05 * N) { p.y = edge - 0.05 * N; p.vy = Math.min(0, p.vy); }
          if (!p.swept && p.y < ty0 + 0.05 * N) { p.y = ty0 + 0.05 * N; p.vy = Math.max(0, p.vy); }
          if (p.walk && p.y > edge) { p.fall = true; p.walk = false; p.vy = Math.max(p.vy, 0.1 * N); p.om = (rnd() - 0.5) * 6; } // over the edge it goes
        }
      }
      fl.push(p);
    }
    w.phones = w.phones.filter((p) => !p.gone);
    fl.sort((a, b) => (a.fall ? 1 : 0) - (b.fall ? 1 : 0) || a.y - b.y);
    for (const p of fl) {
      const ca = Math.cos(p.a), sa = Math.sin(p.a), hw = 0.03 * N, hl = 0.055 * N, sy = p.y - p.z * kz, gy = p.fall ? p.y + hT * kz : p.y;
      const P = (lx, ly, oy) => [p.x + lx * ca - ly * sa, oy + lx * sa + ly * ca];
      if (!p.fall || p.z <= -hT + 0.01 * N) { // its shadow on what it is over, cast away from the lamp over the middle of the table (further the higher it is)
        const k = 0.05 + (p.fall ? 0 : p.z / N), ox = (p.x - 0.5 * N) * k, oy = (p.y - 0.3 * N) * k + 0.004 * N, Q = (lx, ly) => { const q = P(lx, ly, gy); q[0] += ox; q[1] += oy; return q; };
        r.poly([Q(-hw, -hl), Q(hw, -hl), Q(hw, hl), Q(-hw, hl)], DARK + DIM);
      }
      const ring = p.ring > 0, on = p.lit > 0 || (ring && bt % 1 < 0.5);
      r.poly([P(-hw, -hl, sy), P(hw, -hl, sy), P(hw, hl, sy), P(-hw, hl, sy)], BLACK);
      r.poly([P(-hw * 0.75, -hl * 0.85, sy), P(hw * 0.75, -hl * 0.85, sy), P(hw * 0.75, -hl * 0.15, sy), P(-hw * 0.75, -hl * 0.15, sy)], on ? (ring ? BRIGHT : COOL) : DARK);
      for (let k = 0; k < 9; k++) { const [kx, ky] = P((((k % 3) - 1) * hw) / 2, hl * (0.1 + Math.floor(k / 3) * 0.25), sy); r.set(kx, ky, on ? LMID : MID); }
      if (ring && Math.floor(t * 6) % 2 === 0) for (const rr of [0.08, 0.12]) r.ring(p.x, sy, rr * N * (1 + 0.3 * ((t * 3) % 1)), Math.max(1, 0.5 * u), HOT, 0.8);
      if (p.y < edge && !p.fall) targets.push({ x: p.x - hl, y: sy - hl, w: 2 * hl, h: 2 * hl });
    }
  },
};

// ---------------------------------------------------------------------------------------------- speakeasy
// A 1920s speakeasy from the side: a trio on a little stage (the bass player's string ringing out when he plucks it
// on the bass, the drummer's foot and sticks on the kicks and snares, the cymbal wobbling on the hats, the horn
// lifting on the notes with notes rising from the bell), couples dancing a step on every beat, the door at the back
// whose peephole slides open at a knock (a kick), the bar with its bottles and barrels. Kinds: the room, a brick
// cellar, a lounge with curtains, a ballroom with a chandelier. A drop: a raid. The lights snap on, the door bursts
// open on torch beams, everyone runs for it and the bottles go down under the bar; then it all comes back.
const SPEAK_W = { cellar: [3, 2, 1], lounge: [2, 3, 2], ballroom: [1, 2, 3] };

const speakeasy = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, SPEAK_W, bandOf(W.a)), pluck: 0, kick: 0, snare: 0, cym: 0, horn: 0, notes: [], peep: 0, raid: 0, out: 0, bot: Array.from({ length: 12 }, (_, i) => ({ y: 0, v: 0, c: [COOL, HOT, LMID, BRIGHT][i % 4] })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bs = beatS(f), band = bandOf(W.a), bt = beatT(W), fy = 0.82 * N, st = 0.7 * N, g = gOf(0.3 * N);
    if (f.section === 'change') w.kind = rollW(rnd, SPEAK_W, band);
    if (f.section === 'drop') { w.raid = 16 * bs; s.shake = Math.max(s.shake, 0.3); }
    const raid = w.raid > 0;
    for (const h of hits) {
      if (h.kind === 'bass') w.pluck = h.strength;
      else if (h.kind === 'kick') { w.kick = 1; w.peep = 0.7; }
      else if (h.kind === 'snare') w.snare = 1;
      else if (h.kind === 'hat') w.cym = 1;
      if (isTonal(h) && h.kind !== 'bass') { w.horn = 1; if (w.notes.length < 12) w.notes.push({ x: 0.36 * N, y: 0.47 * N, vx: (0.03 + 0.03 * rnd()) * N, life: 1.6 }); }
    }
    w.raid -= dt; w.peep -= dt;
    for (const k of ['kick', 'snare', 'cym', 'horn']) w[k] *= Math.exp(-dt * 7);
    w.pluck *= Math.exp(-dt * 2.5);
    w.out = follow(w.out, raid ? 1 : 0, dt, raid ? 0.5 : 1.2); // how far out of the room everyone has run
    // the room by kind
    r.rect(0, 0, N, fy, DARK + DIM);
    if (w.kind === 'cellar') { for (let j = 0, y = 0.12 * N; y < fy; j++, y += 3 * u) for (let x = (j % 2) * 4 * u; x < N; x += 8 * u) r.rect(x, y, 7 * u, 2 * u, MID + DIM); for (let x = 0.1 * N; x < N; x += 0.3 * N) r.rect(x, 0, 0.04 * N, 0.12 * N, DARK); r.rect(0, 0.1 * N, N, 0.03 * N, DARK); }
    else if (w.kind === 'lounge') for (let x = 0; x < 0.42 * N; x += 0.035 * N) { r.rect(x, 0.05 * N, 0.02 * N, st - 0.05 * N, HOT + DIM); r.rect(x + 0.02 * N, 0.05 * N, 0.015 * N, st - 0.05 * N, DARK); }
    else { for (let x = 0; x < N; x += 0.06 * N) for (let y = 0.06 * N; y < fy; y += 0.08 * N) r.poly([[x + 0.03 * N, y], [x + 0.045 * N, y + 0.02 * N], [x + 0.03 * N, y + 0.04 * N], [x + 0.015 * N, y + 0.02 * N]], MID + DIM); r.line(0.55 * N, 0, 0.55 * N, 0.08 * N, DARK); for (let k = 0; k < 9; k++) r.set(0.55 * N + Math.cos(k) * 0.05 * N, 0.1 * N + Math.abs(Math.sin(k)) * 0.03 * N, f.beat.pulse > 0.5 ? WHITE : BRIGHT); }
    for (const sx2 of [0.48, 0.92]) { r.rect(sx2 * N - 0.01 * N, 0.3 * N, 0.02 * N, 0.03 * N, HOT); ditherPoly(r, [[sx2 * N - 0.01 * N, 0.3 * N], [sx2 * N + 0.01 * N, 0.3 * N], [sx2 * N + 0.06 * N, 0.18 * N], [sx2 * N - 0.06 * N, 0.18 * N]], LIGHT, 0.5); }
    r.rect(0, fy, N, N - fy, MID + DIM);
    for (let x = 0; x < N; x += 0.08 * N) r.rect(x, fy, Math.max(1, 0.5 * u), N - fy, DARK + DIM);
    // the door at the back: its peephole slides open at a knock, two eyes in it; on the raid it bursts open
    const dx = 0.62 * N, dw = 0.1 * N, dtop = 0.38 * N;
    r.rect(dx - 0.01 * N, dtop - 0.01 * N, dw + 0.02 * N, fy - dtop + 0.01 * N, DARK);
    if (raid) { r.rect(dx, dtop, dw, fy - dtop, WHITE); for (const k of [-1, 1]) ditherPoly(r, [[dx + dw / 2, 0.5 * N], [dx + dw / 2 + k * 0.3 * N + Math.sin(t * 3 + k) * 0.1 * N, fy + 0.15 * N], [dx + dw / 2 + k * 0.15 * N + Math.sin(t * 3 + k) * 0.1 * N, fy + 0.15 * N]], LIGHT, 0.7); }
    else {
      r.rect(dx, dtop, dw, fy - dtop, MID);
      r.rect(dx + 0.01 * N, dtop + 0.02 * N, dw - 0.02 * N, 0.15 * N, MID + DIM); r.rect(dx + 0.01 * N, dtop + 0.21 * N, dw - 0.02 * N, 0.2 * N, MID + DIM);
      const open = clamp(w.peep / 0.15) * (w.peep > 0 ? 1 : 0);
      r.rect(dx + 0.025 * N, dtop + 0.08 * N, dw - 0.05 * N, 0.02 * N, BLACK);
      if (open > 0) { for (const k of [0.4, 0.6]) r.rect(dx + k * dw - 0.004 * N, dtop + 0.087 * N, Math.max(1, 0.008 * N), Math.max(1, 0.006 * N), BRIGHT); }
      r.rect(dx + 0.025 * N + open * (dw - 0.05 * N), dtop + 0.08 * N, (dw - 0.05 * N) * (1 - open), 0.02 * N, MID); // the slide
      r.disc(dx + dw - 0.015 * N, dtop + 0.25 * N, Math.max(1, 0.008 * N), BRIGHT);
    }
    targets.push({ x: dx, y: dtop, w: dw, h: fy - dtop });
    // the bar: shelves of bottles (down under the counter in a raid, back up after), barrels, the counter
    const bx = 0.75 * N;
    r.rect(bx, 0.3 * N, N - bx, Math.max(1, u), MID); r.rect(bx, 0.42 * N, N - bx, Math.max(1, u), MID);
    for (let i = 0; i < 12; i++) {
      const b = w.bot[i], shelfY = i < 6 ? 0.3 * N : 0.42 * N, x = bx + 0.02 * N + (i % 6) * 0.038 * N;
      if (raid && w.raid < 16 * bs - (0.2 + i * 0.05)) { b.v += g * dt; b.y = Math.min(0.5 * N, b.y + b.v * dt); } // swept off and dropped under the bar
      else if (!raid) { b.v = 0; b.y = follow(b.y, 0, dt, 0.4 + i * 0.05); }
      const y = shelfY + b.y;
      if (y < 0.6 * N) { r.rect(x, y - 0.05 * N, 0.022 * N, 0.05 * N, b.c); r.rect(x + 0.007 * N, y - 0.07 * N, 0.008 * N, 0.02 * N, b.c); }
    }
    for (const [cx, cy] of [[0.985 * N, 0.72 * N], [0.9 * N, 0.72 * N]]) { r.disc(cx, cy, 0.05 * N, MID); for (const rr of [0.032, 0.05]) r.ring(cx, cy, rr * N, Math.max(1, 0.5 * u), DARK); }
    const bty = 0.58 * N;
    walker(r, 0.86 * N, bty + 0.24 * N, 0.4 * N, FIG, 0, -1, { hat: false });
    r.rect(bx - 0.02 * N, bty, N - bx + 0.02 * N, 0.025 * N, LMID);
    r.rect(bx - 0.01 * N, bty + 0.025 * N, N - bx, fy - bty - 0.025 * N, DARK);
    for (let x = bx; x < N; x += 0.05 * N) r.rect(x, bty + 0.05 * N, Math.max(1, 0.5 * u), fy - bty - 0.08 * N, MID + DIM);
    // the stage and the trio (they run for it in a raid too)
    r.rect(0, st, 0.42 * N, 0.03 * N, LMID); r.rect(0, st + 0.03 * N, 0.42 * N, fy - st - 0.03 * N, DARK);
    // running off to the left in a raid and walking back after, facing the way they go, the legs in step with it
    const away = w.out * 0.5 * N, hh = 0.3 * N, going = w.out > 0.005 && w.out < 0.995, way = raid ? -1 : 1, gait = (d) => d / (0.1 * hh);
    // the bass player and his bass: the string a standing wave from the bridge to the nut, ringing down after a pluck
    const bpx = 0.08 * N - away;
    walker(r, bpx, st, hh, FIG, gait(away), going ? way : 1, { hat: true });
    const bbx = bpx + 0.06 * N;
    r.disc(bbx, st - 0.08 * N, 0.045 * N, MID); r.disc(bbx, st - 0.14 * N, 0.035 * N, MID); r.rect(bbx - 0.006 * N, st - 0.3 * N, 0.012 * N, 0.17 * N, DARK);
    for (let k = 0; k < 12; k++) { const q = k / 12, q2 = (k + 1) / 12, a = w.pluck * 0.012 * N * Math.cos(t * 60); r.line(bbx + Math.sin(Math.PI * q) * a, lerp(st - 0.05 * N, st - 0.3 * N, q), bbx + Math.sin(Math.PI * q2) * a, lerp(st - 0.05 * N, st - 0.3 * N, q2), LMID); }
    arm(r, bpx + 0.02 * N, st - hh * 0.62, bbx + 0.005 * N + w.pluck * 0.02 * N, st - 0.12 * N, hh * 0.4, -1, Math.max(1, 0.025 * N), FIG);
    // the drummer behind his kit: the bass drum's head flashing on the kick, a stick down on the snare, the cymbal
    const dmx = 0.22 * N - away * 1.2;
    walker(r, dmx, st - 0.02 * N, hh * 0.85, FIG, gait(away * 1.2), going ? way : 1, {});
    r.disc(dmx + 0.02 * N, st - 0.05 * N + (w.kick > 0.5 ? 0.004 * N : 0), 0.05 * N, DARK); r.ring(dmx + 0.02 * N, st - 0.05 * N, 0.05 * N, Math.max(1, u), w.kick > 0.3 ? BRIGHT : LMID);
    r.rect(dmx + 0.07 * N, st - 0.1 * N, 0.05 * N, 0.03 * N, LMID); r.rect(dmx + 0.09 * N, st - 0.07 * N, Math.max(1, u), 0.07 * N, DARK);
    const ca = Math.sin(t * 25) * 0.25 * w.cym;
    r.line(dmx - 0.05 * N, st - 0.17 * N, dmx - 0.05 * N, st, DARK); r.stroke(dmx - 0.09 * N, st - 0.17 * N - Math.sin(ca) * 0.04 * N, dmx - 0.01 * N, st - 0.17 * N + Math.sin(ca) * 0.04 * N, Math.max(1, 0.012 * N), BRIGHT);
    arm(r, dmx + 0.02 * N, st - hh * 0.55, dmx + 0.085 * N, st - 0.11 * N - (1 - w.snare) * 0.05 * N, hh * 0.4, 1, Math.max(1, 0.025 * N), FIG);
    // the horn player: the horn comes up on a note and the notes rise from the bell, drifting and fading
    const hpx = 0.35 * N - away * 1.4, up = 0.15 + 0.35 * w.horn, hy = st - hh * 0.83;
    walker(r, hpx, st, hh, FIG, gait(away * 1.4), going ? way : -1, { hat: true });
    const bellx = hpx - Math.cos(up) * 0.09 * N, belly = hy - Math.sin(up) * 0.09 * N;
    r.stroke(hpx - 0.015 * N, hy, bellx, belly, Math.max(1, 0.012 * N), BRIGHT); r.disc(bellx, belly, 0.018 * N, BRIGHT);
    arm(r, hpx - 0.02 * N, st - hh * 0.62, hpx - 0.05 * N, hy + 0.01 * N, hh * 0.4, 1, Math.max(1, 0.025 * N), FIG);
    w.notes = w.notes.filter((n) => { n.life -= dt; n.x -= n.vx * dt; n.y -= 0.06 * N * dt; if (n.life < 1.2 || Math.floor(n.life * 8) % 2) { r.disc(n.x, n.y, Math.max(1, 0.008 * N), HOT); r.line(n.x + 0.007 * N, n.y, n.x + 0.007 * N, n.y - 0.025 * N, HOT); } return n.life > 0; });
    targets.push({ x: 0.02 * N - away, y: st - hh, w: 0.38 * N, h: hh });
    // the dancers, in couples further back on the floor (so a little smaller and higher): a step on every beat in
    // place, no gliding, a kick on the odd ones
    const pairs = w.kind === 'cellar' ? 1 : w.kind === 'lounge' ? 2 : 3, dh = hh * 0.85, dy = fy - 0.03 * N;
    for (let k = 0; k < pairs * 2; k++) {
      const side = k % 2 ? 1 : -1, x0 = (0.52 + (Math.floor(k / 2) - (pairs - 1) / 2) * 0.075 + side * 0.028) * N, run = w.out * (x0 < 0.6 * N ? -0.7 : 0.6) * N, x = x0 + run;
      if (x < -0.1 * N || x > 1.1 * N) continue;
      const hop = going ? 0 : Math.abs(Math.sin(Math.PI * bt)) * 0.01 * N, ph = going ? Math.abs(run) / (0.1 * dh) : Math.PI * bt + (k % 2) * Math.PI;
      walker(r, x, dy - hop, dh * (k % 2 ? 0.95 : 1), FIG, ph, going ? (Math.sign(run) || 1) * (raid ? 1 : -1) : -side, k % 2 ? { coat: true } : { hat: true });
      if (!going && !raid && Math.floor(bt) % 2 === 1) r.stroke(x, dy - hop - dh * 0.3, x - side * 0.04 * N, dy - hop - dh * 0.16, Math.max(1, dh * 0.05), FIG); // the Charleston kick
      if (k < 2) targets.push({ x: x - dh * 0.2, y: dy - dh, w: dh * 0.4, h: dh });
    }
    // the raid's light: everything a step up while the overheads are on
    if (raid) { const buf = r.buf; for (let i = 0; i < buf.length; i++) buf[i] = LIFT[buf[i]]; }
  },
};

// ---------------------------------------------------------------------------------------------- rooftopmeet
// A roof at night over the lit city: two figures in coats keep their distance; on a section change they walk to each
// other (the legs in step with the ground they cover), the briefcase changes hands and they go back to their places.
// Steam vents puff on the beat (rising on its warmth, slowing, spreading), pigeons on the parapet hop and flap on the
// hats, the windows light on the notes, a kick shakes a gust down the vents. Kinds: the weather, rolled again with
// each section, clear, drizzle, downpour. A drop: a helicopter comes over, its searchlight sweeping the roof, and
// both run and crouch behind the vents until it has gone.
const ROOF_W = { clear: [3, 2, 1], drizzle: [2, 3, 2], downpour: [1, 2, 3] };
const RAIN = { clear: 0, drizzle: 45, downpour: 130 };

const rooftopmeet = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, ROOF_W, bandOf(W.a)), figs: [{ x: 0.33 * N, home: 0.33 * N, dir: 1, ph: 0, crouch: 0 }, { x: 0.64 * N, home: 0.64 * N, dir: -1, ph: 0, crouch: 0 }], has: 0, ex: null,
      steam: [], drops: [], pig: Array.from({ length: 5 }, (_, i) => ({ x: (0.08 + i * 0.19 + 0.05 * rnd()) * N, z: 0, vz: 0, dir: rnd() < 0.5 ? -1 : 1 })), heli: null, lit: new Float32Array(40), gust: 0, vN: N });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bs = beatS(f), band = bandOf(W.a), roof = 0.74 * N, para = 0.66 * N, hP = 0.3 * N, g = gOf(hP), vents = [0.17 * N, 0.82 * N];
    if (w.vN !== N) { for (const F of w.figs) { F.x = (F.x / w.vN) * N; F.home = (F.home / w.vN) * N; } for (const p of w.pig) p.x = (p.x / w.vN) * N; w.vN = N; }
    if (f.section === 'change') { w.kind = rollW(rnd, ROOF_W, band); if (!w.ex && !w.heli) w.ex = { t: 0, give: w.has }; }
    if (f.section === 'drop' && !w.heli) { w.heli = { t: 0, x: 1.3 * N }; w.ex = null; }
    for (const h of hits) {
      if (h.kind === 'hat') { const p = pick(rnd, w.pig); if (p.z <= 0) p.vz = (0.2 + 0.15 * rnd()) * N; }
      else if (h.kind === 'kick') w.gust = 1;
      if (isTonal(h)) w.lit[(h.pc * 7 + Math.floor(rnd() * 3)) % 40] = 1.5;
    }
    w.gust *= Math.exp(-dt * 3);
    // the city behind: towers with their windows, the ones a note lit glowing a while
    r.rect(0, 0, N, roof, DARK + DIM);
    for (let i = 0; i < 9; i++) r.set(hash(i, 91) * N, hash(i, 92) * 0.3 * N, LMID + DIM);
    for (let b = 0; b < 10; b++) {
      const x = (b * 0.105 - 0.01) * N, top = (0.2 + 0.25 * hash(b, 93)) * N;
      r.rect(x, top, 0.095 * N, para - top, BLACK);
      for (let j = 0; j < 4; j++) { const k = (b * 4 + j) % 40, lit = w.lit[k] > 0 || hash(b, j + 50) < 0.35 + 0.2 * f.rel.trebDrive * Math.sin(t + b * j); r.rect(x + (0.015 + (j % 2) * 0.04) * N, top + (0.03 + Math.floor(j / 2) * 0.06) * N, 0.02 * N, 0.025 * N, w.lit[k] > 0 ? BRIGHT : lit ? HOT + DIM : DARK + DIM); }
    }
    for (let k = 0; k < 40; k++) w.lit[k] -= dt;
    // the parapet with the pigeons on it (a hop and a flap on the hats), the roof, the stair hut
    r.rect(0, para, N, roof - para, MID);
    r.rect(0, para, N, Math.max(1, u), LMID);
    for (const p of w.pig) {
      p.vz -= g * dt; p.z += p.vz * dt;
      if (p.z <= 0) { p.z = 0; p.vz = 0; }
      const y = para - p.z, flap = p.z > 0 ? (Math.floor(t * 16) % 2 ? -1 : 1) : 0;
      r.rect(p.x - 0.012 * N, y - 0.014 * N, 0.024 * N, 0.012 * N, DARK); r.disc(p.x + p.dir * 0.014 * N, y - 0.018 * N, 0.006 * N, DARK); r.rect(p.x + p.dir * 0.02 * N, y - 0.018 * N, Math.max(1, 0.006 * N), Math.max(1, 0.003 * N), HOT + DIM);
      if (flap) r.line(p.x, y - 0.012 * N, p.x - p.dir * 0.01 * N, y - 0.012 * N - flap * 0.014 * N, DARK);
    }
    r.rect(0, roof, N, N - roof, DARK);
    for (let k = 1; k < 5; k++) r.rect(0, roof + k * k * 0.015 * N, N, Math.max(1, 0.5 * u), DARK + DIM);
    r.rect(0.44 * N, roof - 0.2 * N, 0.13 * N, 0.2 * N, MID + DIM); r.rect(0.47 * N, roof - 0.15 * N, 0.05 * N, 0.15 * N, BLACK); r.rect(0.43 * N, roof - 0.21 * N, 0.15 * N, 0.015 * N, MID);
    // the two: the meet (walk in, the case changes hands, walk back), or the run for the vents under the light
    const H = w.heli, ex = w.ex, A = w.figs[0], B = w.figs[1];
    let caseX = null;
    if (H) { H.t += dt; for (let i = 0; i < 2; i++) { const F = w.figs[i], to = vents[i] + (i ? -0.035 : 0.035) * N; F.dir = to > F.x ? 1 : -1; const st = Math.min(Math.abs(to - F.x), 0.45 * N * dt); F.x += F.dir * st; F.ph += st / (0.1 * hP); F.crouch = follow(F.crouch, Math.abs(to - F.x) < 0.01 * N ? 1 : 0, dt, 0.12); } if (H.t > 16 * bs) { w.heli = null; } }
    else if (ex) {
      ex.t += dt / bs;
      const meet = [0.465 * N, 0.535 * N];
      for (let i = 0; i < 2; i++) {
        const F = w.figs[i], to = ex.t < 2.2 ? meet[i] : F.home, st = Math.min(Math.abs(to - F.x), 0.11 * N * dt / bs * 0.5);
        F.crouch = follow(F.crouch, 0, dt, 0.2);
        if (Math.abs(to - F.x) > 1e-3) { F.dir = to > F.x ? 1 : -1; F.x += F.dir * st; F.ph += st / (0.1 * hP); } else F.dir = i ? -1 : 1;
      }
      if (ex.t > 2.2 && ex.t < 3) caseX = lerp(w.figs[ex.give].x, w.figs[1 - ex.give].x, ease((ex.t - 2.2) / 0.8));
      if (ex.t >= 3 && w.has === ex.give) w.has = 1 - ex.give;
      if (ex.t > 6) w.ex = null;
    } else for (let i = 0; i < 2; i++) { const F = w.figs[i], to = F.home, st = Math.min(Math.abs(to - F.x), 0.2 * N * dt); F.crouch = follow(F.crouch, 0, dt, 0.25); if (Math.abs(to - F.x) > 1e-3) { F.dir = to > F.x ? 1 : -1; F.x += F.dir * st; F.ph += st / (0.1 * hP); } else F.dir = i ? -1 : 1; }
    for (let i = 0; i < 2; i++) {
      const F = w.figs[i], hh = hP * (1 - 0.52 * F.crouch), J = walker(r, F.x, roof, hh, FIG, F.crouch > 0.5 ? 0 : F.ph, F.dir, { coat: true, hat: true });
      const holds = caseX === null && w.has === i, cx = caseX ?? (holds ? J.sx + F.dir * 0.01 * N : null);
      if (cx !== null && (caseX !== null || holds)) { const cy = caseX !== null ? roof - hP * 0.42 : J.sy + hh * 0.36; r.rect(cx - 0.022 * N, cy, 0.044 * N, 0.032 * N, DARK); r.rect(cx - 0.008 * N, cy - 0.006 * N, 0.016 * N, 0.006 * N, DARK); r.rect(cx - 0.022 * N, cy, 0.044 * N, Math.max(1, 0.5 * u), LMID); }
      targets.push({ x: F.x - hh * 0.3, y: roof - hh, w: hh * 0.6, h: hh });
    }
    // the vents: a box and a stack each, a puff of steam up the stack on every beat (and a gust on a kick)
    const beat = beatTick(w, f, dt);
    for (const vx of vents) {
      r.rect(vx - 0.06 * N, roof - 0.15 * N, 0.12 * N, 0.15 * N, MID); r.rect(vx - 0.06 * N, roof - 0.15 * N, 0.12 * N, Math.max(1, u), LMID);
      for (let k = 1; k < 4; k++) r.rect(vx - 0.05 * N, roof - 0.15 * N + k * 0.035 * N, 0.1 * N, Math.max(1, 0.5 * u), DARK);
      r.rect(vx - 0.012 * N, roof - 0.24 * N, 0.024 * N, 0.09 * N, MID); r.rect(vx - 0.018 * N, roof - 0.245 * N, 0.036 * N, 0.01 * N, LMID);
      if (beat || w.gust > 0.9) for (let k = 0; k < 3; k++) w.steam.push({ x: vx + (rnd() - 0.5) * 0.01 * N, y: roof - 0.25 * N, vx: 0, vy: -(0.12 + 0.08 * f.rel.bassDrive) * N, rise: 0.08 * N, rad: 0.01 * N, grow: 0.03 * N, life: 2, max: 2, dens: 0.55 });
    }
    w.gust = w.gust > 0.9 ? 0.89 : w.gust;
    const wash = H && H.x < 1.1 * N ? (H.x - 0.5 * N) / N * -0.3 * N : 0; // the rotor's wash pushes the steam about
    w.steam = smoke(W, w.steam, LMID, wash - 0.02 * N, 48); // the night air drifts it the way the rain blows (to the left)
    // the rain, by the weather, with a splash where each drop lands
    const want = Math.round(RAIN[w.kind] * (0.7 + 0.6 * f.level));
    while (w.drops.length < want) w.drops.push({ x: rnd() * N * 1.2, y: rnd() * roof });
    if (w.drops.length > want) w.drops.length = want;
    for (const d of w.drops) { d.y += dt * 1.1 * N; d.x -= dt * 0.15 * N; if (d.y > roof + (d.x % 7) * u) { r.set(d.x, roof + 1, LMID); d.y = -rnd() * 0.1 * N; d.x = rnd() * N * 1.2; } r.line(d.x, d.y, d.x + 0.012 * N, d.y - 0.035 * N, LMID + DIM); }
    // the helicopter: in from the right, hanging there, the searchlight swinging over the roof; then away
    if (H) {
      H.x = H.t < 16 * bs - 1.5 ? follow(H.x, 0.62 * N, dt, 1.2) : H.x + dt * 0.5 * N;
      const hx = H.x + Math.sin(t * 0.9) * 0.03 * N, hy = 0.13 * N + Math.sin(t * 1.7) * 0.01 * N, a = Math.PI / 2 + 0.55 * Math.sin(H.t * 1.1), sp = 0.17;
      const ex2 = (ang) => [hx + Math.cos(ang) * ((roof - hy) / Math.max(0.2, Math.sin(ang))), roof + 0.02 * N];
      ditherPoly(r, [[hx, hy + 0.03 * N], ex2(a - sp), ex2(a + sp)], LIGHT, 0.55);
      const [lx2] = ex2(a); ditherPoly(r, [[lx2 - 0.07 * N, roof - 0.01 * N], [lx2 + 0.07 * N, roof - 0.01 * N], [lx2 + 0.09 * N, N], [lx2 - 0.09 * N, N]], LIGHT, 1);
      r.disc(hx, hy, 0.045 * N, BLACK); r.rect(hx, hy - 0.012 * N, 0.16 * N, 0.016 * N, BLACK); r.rect(hx + 0.15 * N, hy - 0.035 * N, 0.012 * N, 0.04 * N, BLACK);
      r.rect(hx - 0.04 * N, hy + 0.045 * N, 0.08 * N, Math.max(1, 0.006 * N), BLACK);
      r.rect(hx - 0.14 * N, hy - 0.055 * N, 0.28 * N, Math.max(1, 0.006 * N), Math.floor(t * 30) % 2 ? DARK : BLACK);
      r.rect(hx - 0.004 * N, hy - 0.055 * N, Math.max(1, 0.008 * N), 0.012 * N, BLACK);
      r.disc(hx - 0.02 * N, hy + 0.03 * N, Math.max(1, 0.008 * N), WHITE);
      r.disc(hx + 0.16 * N, hy - 0.035 * N, Math.max(1, 0.005 * N), Math.floor(t * 3) % 2 ? HOT : DARK);
      targets.push({ x: hx - 0.05 * N, y: hy - 0.05 * N, w: 0.22 * N, h: 0.1 * N });
      s.shake = Math.max(s.shake, 0.04);
    }
  },
};

const WORLDS = { wiretap, stakeout, hotbox, passcircle, heist, getaway, countingroom, interrogation, switchboard, burners, speakeasy, rooftopmeet };
registerFamily('crime', WORLD_DEFS, WORLDS);
export const CRIME_STYLE = makeMixStyle('GANGSTER', ['crime']);
