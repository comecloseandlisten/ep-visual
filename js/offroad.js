// Off road, mixed: a motocross pack over tabletops and doubles, a freestyle show off a steel kicker, the whoops of a
// stadium supercross, a trials rider on the boulders, an enduro single-track through a forest, a rally raid across
// the dunes, monster trucks over a row of cars, a mud bog, a rock crawler on the slabs, quads on the dunes, a hill
// climb and the paddock at dusk. Original machines and riders only: no make, no logo, no race number, nothing to read.
// One model drives every machine: a rigid chassis on two or four wheels, each wheel on its own spring-damper over a
// heightfield (the tyre a circle, so it climbs a ledge it meets), the pitch (and the roll on four) from where the
// wheels are; with no wheel down the chassis flies an exact parabola and the rider pitches it in the air, any flip
// timed to come round before the wheels touch, the springs soaking the landing. What is thrown (roost, mud, water,
// sparks) flies exact parabolas under the one gravity of the family; dust slows in the air and settles. Every world
// has a kinds table weighed by the arousal band, rolled again on a section change, with its heavy turn on a drop.
import { clamp, bayer } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, WHITE, L, M, H, TAU, isLow, follow, ease, beatLocked, hash, pickW,
  walker, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight. The shows sit
// euphoric–tense–happy, the hard going tense–aggressive–focused, the slow craft focused–calm, the paddock calm–happy–melancholic
const RUSH = [[H, H], [M, H], [H, M]], GRIT = [[M, H], [L, H], [M, M]], CRAFT = [[M, M], [M, L]], REST = [[M, L], [H, M], [L, L]];
export const WORLD_DEFS = {
  motocross: { name: 'the motocross', va: RUSH, pals: ['dirt', 'nineties', 'tape', 'cinema'], fx: ['none', 'vhs', 'manga'], themes: ['speed', 'glory'] },
  freestylemx: { name: 'freestyle motocross', va: RUSH, pals: ['dirt', 'neon', 'nineties', 'cinema', 'midnight'], fx: ['none', 'manga', 'crt'], themes: ['glory', 'play', 'speed'] },
  whoops: { name: 'the whoops', va: RUSH, pals: ['midnight', 'dirt', 'neon', 'nineties'], fx: ['none', 'crt', 'vhs'], themes: ['speed', 'night'] },
  trials: { name: 'the trials section', va: CRAFT, pals: ['dirt', 'sepia', 'ice', 'tape'], fx: ['none', 'film'], themes: ['nature', 'play'] },
  enduro: { name: 'the enduro trail', va: GRIT, pals: ['dirt', 'military', 'tape', 'sepia'], fx: ['none', 'film', 'vhs'], themes: ['nature', 'speed'] },
  desertrally: { name: 'the rally raid', va: GRIT, pals: ['dunes', 'sepia', 'cinema', 'military'], fx: ['film', 'none', 'hud'], themes: ['lonely', 'speed', 'nature'] },
  monstertruck: { name: 'the monster trucks', va: RUSH, pals: ['dirt', 'neon', 'nineties', 'cinema'], fx: ['none', 'manga', 'crt'], themes: ['rage', 'play', 'machine'] },
  mudbog: { name: 'the mud bog', va: GRIT, pals: ['dirt', 'military', 'tape', 'sepia'], fx: ['none', 'vhs', 'film'], themes: ['rage', 'machine', 'nature'] },
  rockcrawl: { name: 'the rock crawler', va: CRAFT, pals: ['dunes', 'dirt', 'military', 'ice'], fx: ['none', 'film', 'hud'], themes: ['machine', 'nature'] },
  atvdunes: { name: 'quads on the dunes', va: RUSH, pals: ['dunes', 'dirt', 'nineties', 'cinema'], fx: ['none', 'vhs', 'film'], themes: ['play', 'speed', 'nature'] },
  hillclimb: { name: 'the hill climb', va: GRIT, pals: ['dirt', 'military', 'sepia', 'tape'], fx: ['none', 'film', 'manga'], themes: ['glory', 'rage'] },
  paddock: { name: 'the paddock at dusk', va: REST, pals: ['midnight', 'tape', 'sepia', 'dirt'], fx: ['film', 'vhs', 'none'], themes: ['night', 'lonely', 'machine'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the kinds tables weigh their variants by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bpsOf = (f) => (f.bpm ? f.bpm / 60 : 2);
const px1 = (u) => Math.max(1, u);
const dimC = (c) => (c < DIM ? c + DIM : c);
const GV = 2.2; // gravity, screens per second squared: G = GV N cells/s^2 for every machine, rider, clod, drop and spark
const kickOf = (hits) => hits.reduce((m, h) => (isLow(h) ? Math.max(m, h.strength) : m), 0);
const snareOf = (hits) => hits.some((h) => h.kind === 'snare');
// a beat tick for things that go a step per beat: the beat itself when locked, else counted out at the guessed tempo
const tick = (w, f, dt) => (beatLocked(f) ? f.beat.on : (w.tickT += dt * bpsOf(f)) >= 1 && ((w.tickT -= 1), true));
// how many of a thing that comes `rate` times a second come this frame (on average rate dt, at any frame length)
const emit = (rnd, rate, dt) => Math.floor(rate * dt + rnd());

// a column of cells from y0 down to y1, clipped
function vcol(r, x, y0, y1, c) {
  const N = r.N;
  if (x < 0 || x >= N) return;
  const a = Math.max(0, Math.round(y0)), b = Math.min(N, Math.round(y1));
  for (let i = a * N + x, e = b * N; i < e; i += N) r.buf[i] = c;
}
// a filled ellipse a row at a time: tyres, heads, puddles
function ell(r, cx, cy, rx, ry, c) {
  if (!(rx > 0 && ry > 0)) return;
  const N = r.N, y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(N - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const q = (y + 0.5 - cy) / ry;
    if (q * q >= 1) continue;
    const hw = rx * Math.sqrt(1 - q * q), a = Math.max(0, Math.round(cx - hw)), b = Math.min(N, Math.round(cx + hw));
    if (b > a) r.buf.fill(c, y * N + a, y * N + b);
  }
}
// a soft puff: the cells of a disc whose dither threshold is under `dens`, thinner toward the edge
function haze(r, cx, cy, R, c, dens) {
  if (dens <= 0 || R < 0.5) return;
  const N = r.N, buf = r.buf, R2 = R * R, x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(N - 1, Math.ceil(cx + R));
  for (let y = Math.max(0, Math.floor(cy - R)), y1 = Math.min(N - 1, Math.ceil(cy + R)); y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, e = (dx * dx + dy * dy) / R2;
      if (e < 1 && bayer(x, y) < dens * (1 - 0.7 * e)) buf[y * N + x] = c;
    }
}
// a polygon filled through the dither at `dens`: a light beam, a curtain of rain
function dpoly(r, pts, c, dens) {
  const N = r.N, buf = r.buf, xs = [];
  let top = Infinity, bot = -Infinity;
  for (const p of pts) { if (p[1] < top) top = p[1]; if (p[1] > bot) bot = p[1]; }
  for (let y = Math.max(0, Math.floor(top)); y < Math.min(N, Math.ceil(bot)); y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xa, ya] = pts[j], [xb, yb] = pts[i]; if ((ya <= yc) !== (yb <= yc)) xs.push(xa + ((yc - ya) / (yb - ya)) * (xb - xa)); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.round(xs[k])), e = Math.min(N, Math.round(xs[k + 1])); x < e; x++) if (bayer(x, y) < dens) buf[y * N + x] = c;
  }
}
// a far ridge scrolled to `off`: two waves of `amp` about y0 (frequency `fr` per cell), filled down to y1
function ridge(r, off, y0, amp, fr, y1, c, ph = 0) {
  for (let x = 0; x < r.N; x++) { const q = (x + off) * fr; vcol(r, x, y0 - amp * (0.6 * Math.sin(q + ph) + 0.4 * Math.sin(q * 2.3 + 1.7 + ph)), y1, c); }
}

// What is thrown flies an exact parabola under G (so the frame length never bends it): roost, clods, mud, water,
// sparks. It is gone when its life is out or once it is in the dirt under it (g: screen y at x, or null), rising or not.
function fly(W, list, G, g, cam = 0) {
  const { r, dt, u } = W;
  let n = 0;
  for (const p of list) {
    p.x += p.vx * dt;
    p.y += p.vy * dt + 0.5 * G * dt * dt;
    p.vy += G * dt;
    p.life -= dt;
    if (p.life <= 0 || (g && p.y > g(p.x))) continue;
    list[n++] = p;
    const sz = Math.max(1, p.s * u);
    r.rect(p.x - cam - sz / 2, p.y - sz / 2, sz, sz, p.c);
  }
  list.length = n;
}
// dust: kicked up, it slows in the air (linear drag, integrated exactly, so any frame length gives the same path) toward
// the wind and a slow settling speed, comes to rest on its own ground (p.g, if it has one) and spreads thin until it is
// gone; smoke (buoyancy b) the same, but the warm air lifts it, so it rises and slows
function dust(W, list, cam = 0, wind = 0) {
  const { r, dt, u } = W, c = 2.4, k = Math.exp(-dt * c), k1 = (1 - k) / c, vs = 4 * u;
  let n = 0;
  for (const p of list) {
    const ty = vs - p.b / c;
    p.x += wind * dt + (p.vx - wind) * k1;
    p.y += ty * dt + (p.vy - ty) * k1;
    p.vx = wind + (p.vx - wind) * k;
    p.vy = ty + (p.vy - ty) * k;
    if (p.g) { const gy = p.g(p.x, 0); if (p.y > gy) { p.y = gy; if (p.vy > 0) p.vy = 0; } }
    if ((p.age += dt) >= p.life) continue;
    list[n++] = p;
    const q = p.age / p.life;
    haze(r, p.x - cam, p.y, (p.r0 + q * p.gr) * u, p.c, 0.8 * (1 - q));
  }
  list.length = n;
}
const puff = (list, x, y, vx, vy, life, r0, gr, c, b = 0, g = null) => { if (list.length < 90) list.push({ x, y, vx, vy, life, age: 0, r0, gr, c, b, g }); };

// ---------------------------------------------------------------------------------------------- the machine
// A machine: a rigid chassis (x, y its middle in cells, a its pitch, b its roll) on wheels at lx along it and lz
// across (-1 the near side, 1 the far). A wheel hangs L0 under its mount at full droop; the ground, met by the tyre's
// circle, pushes it up by c, and the spring pushes back k c + d dc/dt, never pulls: the damper stiffer on the rebound
// than on the bump, past the travel a bump stop that gives back less than it took, the whole capped where a tyre
// squashes. `vxT` is the speed the rider wants, reached at `acc` (braked at `brk`) while a driven wheel bites; `tq`
// is the engine's pitch torque, a wheelie the rider holds under `wl` off the ground's angle (past it he brakes the rear);
// `hold` how much of the kick of a wheel the rider soaks with his body while only some are down (never the weight it
// carries, so a wheelie still comes down); `pop` the rider's spring off a lip, so the machine leaves along the face it
// was on. In the air the rider brings the pitch to `goal` by `goalT` seconds of air. The tyre is a circle on the ground
// (see `sink`); the spring is a vertical one at the mount, so the wheel rises straight up off its droop; past `cap`
// (the travel and the tyre's squash) it is solid.
function rig(o) {
  const R = o.R, four = !!o.four;
  const wh = (four ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : [[-1, 0], [1, 0]]).map(([s, z]) => ({ lx: (s * o.wb) / 2, lz: z, side: z > 0 ? 1 : 0, drive: four || s < 0, c: 0, on: false, hx: 0, hy: 0, gy: 0, cx: 0, sp: 0, w: 0 }));
  return { x: o.x || 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, b: 0, vb: 0, wb: o.wb, R, L0: o.L0, trav: o.trav, cap: o.trav + 0.35 * R, tw: o.tw || 0, k: o.k, d: o.d, kb: 12 * o.k,
    Ia: (0.3 * o.wb) ** 2, Ib: (0.8 * (o.tw || 1)) ** 2, wh, vxT: 0, acc: 0, brk: 0, tq: 0, wl: o.wl ?? 0.4, slip: 0, hold: o.hold ?? 0.93, pop: o.pop ?? 0, vam: o.vam ?? 6, wref: null, face: 0, sl: 0, slT: 0,
    air: false, airT: 0, hit: 0, took: false, goal: null, goalT: 0, rot: 0, pa0: 0, pt0: 0, pT: 1, g: null };
}
// How deep a tyre of radius R with its hub at (hx, hy) is in the ground g (y down, so > 0 is in), and where (sinkX):
// the deepest of its lower half over each whole cell of the ground (the grounds are straight between cells, so their
// corners are all met), its bottom and its two sides (a face it rolls into is felt at its side).
let sinkX = 0;
function sink(g, side, hx, hy, R) {
  let c = hy + R - g(hx, side);
  sinkX = hx;
  for (let k = -1; k <= 1; k += 2) { const q = hy - g(hx + k * R, side); if (q > c) { c = q; sinkX = hx + k * R; } }
  for (let xi = Math.ceil(hx - R), xe = hx + R; xi <= xe; xi++) { const dx = xi - hx, q = hy + Math.sqrt(Math.max(0, R * R - dx * dx)) - g(xi, side); if (q > c) { c = q; sinkX = xi; } }
  return c;
}
// a dirt bike: 10 units between the axles, wheels of 3, springs that sag 0.28 of their 3.2 of travel
const bikeRig = (k, x, G) => rig({ x, wb: 10 * k, R: 3 * k, L0: 3.6 * k, trav: 3.2 * k, k: G / (2 * 0.28 * 3.2 * k), d: 8 });
const bikeB = (k, pf = 0.55) => ({ hw: 5 * k, L0: 3.6 * k, R: 3 * k, pf }); // its geometry, for the jumps built for it
// One frame of a machine over the ground g(x, side) (the screen y of the dirt), in steps short enough for the stiffest
// spring: the springs' kick first, then the drift with gravity exact, so with no wheel down it is the true parabola.
// `onAir(V)` is called at the very step it leaves the ground (the rider's plan, at any frame length).
function ride(V, dt, G, g, onAir = null) {
  const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n, nw = V.wh.length, fmax = 7 * G;
  V.hit = 0;
  V.took = false;
  V.g = g;
  for (let s = 0; s < n; s++) {
    const ca = Math.cos(V.a), sa = Math.sin(V.a), sb = V.tw ? Math.sin(V.b) : 0;
    let F = 0, Ta = 0, Tb = 0, down = 0, drive = 0, lift = 0, lnx = 0, lny = 0;
    for (const wh of V.wh) {
      const mx = V.x + wh.lx * ca, my = V.y + wh.lx * sa + wh.lz * V.tw * sb, hx = mx - V.L0 * sa, hy = my + V.L0 * ca;
      const c = sink(g, wh.side, hx, hy, V.R), xk = sinkX;
      wh.gy = g(hx, wh.side);
      wh.hx = hx;
      wh.hy = hy - Math.max(0, Math.min(c, V.cap));
      if (c > 0) {
        const cv = (c - wh.c) / h;
        let fz = V.k * Math.min(c, V.trav) + V.d * cv * (cv < 0 ? 2.4 : 1);
        if (c > V.trav) fz += V.kb * (c - V.trav) * (cv < 0 ? 0.1 : 1);
        fz = fz < 0 ? 0 : fz > fmax ? fmax : fz;
        F += fz;
        Ta -= (mx - V.x) * fz;
        Tb -= wh.lz * V.tw * fz;
        down++;
        if (wh.drive) drive++;
        wh.c = c;
        wh.on = true;
        // the slope just behind where the tyre touches; the steepest rise of the last moments is held (the lip's)
        // (held while the whole machine passes over it, so a long wheelbase leaves along the lip, not off its top)
        const xc = (wh.cx = xk), bk = V.vx < 0 ? -1 : 1, s1 = (g(xc, wh.side) - g(xc - bk, wh.side)) * bk;
        if (s1 * bk <= V.sl * bk + 0.02) { V.sl = Math.min(s1 * bk, V.sl * bk) * bk; V.slT = 0; } else if ((V.slT += h) > Math.max(0.12, (1.2 * V.wb) / (Math.abs(V.vx) + 1))) { V.sl = s1; V.slT = 0; }
        if (c > V.cap) { // bottomed out: past the tyre's squash it is solid, so the chassis stops dead against the ground there,
          // along its normal (a blow at the contact: on a face it stops the machine going on into it, not only down)
          const sx = (g(xc + 1, wh.side) - g(xc - 1, wh.side)) / 2, nl = Math.sqrt(1 + sx * sx), nx = sx / nl, ny = -1 / nl;
          const rx = xc - V.x, ry = g(xc, wh.side) - V.y, vn = -((V.vx - V.va * ry) * nx + (V.vy + V.va * rx) * ny);
          if (vn > 0) { const rn = rx * ny - ry * nx, J = vn / (1 + (rn * rn) / V.Ia); V.vx += J * nx; V.vy += J * ny; V.va += (J * rn) / V.Ia; }
          if ((c - V.cap) / nl > lift) { lift = (c - V.cap) / nl; lnx = nx; lny = ny; }
        }
      } else { wh.c = 0; wh.on = false; }
    }
    const air = down === 0;
    V.x += lnx * lift;
    V.y += lny * lift;
    V.vy -= F * h;
    V.y += V.vy * h + 0.5 * G * h * h;
    V.vy += G * h;
    // in the air the pitch follows the rider's plan (see `plan`): the turn he takes off the lip, easing out to none as it
    // comes round to the landing's pitch, never a sudden stop
    if (air && V.goal !== null) { const q = Math.min(1, (V.airT + h - V.pt0) / V.pT); V.va = (V.pa0 + (V.goal - V.pa0) * q * (1.5 - 0.5 * q * q) - V.a) / h; }
    else if (!air) {
      // with some wheels down the rider soaks the kick of the springs with his body (never the weight a wheel carries, so
      // a wheelie still comes down), and popping off a lip all of it: his weight goes back with the rear, so the machine
      // leaves at the face's pitch instead of diving off it
      const lip = down < nw && V.pop; // (and off the gas for the pitch: with the front off the lip a wheelie is no use)
      if (lip) Ta *= 1 - V.hold;
      else if (down < nw && F > G) { const Ts = (Ta * G) / F; Ta = Ts + (Ta - Ts) * (1 - V.hold); }
      let tq = drive && !lip ? V.tq : 0;
      // the ground's line: under both tyres when all are down, else the face the tyres that are down are on (at a lip the
      // ground under the front hub is the floor of the gap, nothing the rider steers by)
      const gA = down === nw ? Math.atan2(V.wh[1].gy - V.wh[0].gy, V.wb) : Math.atan(V.sl), off = V.a - gA;
      if (tq) { const dir = V.face || (V.vx < 0 ? -1 : 1), rel = (V.a - (V.wref ?? gA)) * dir; if (tq * dir < 0) tq *= clamp((V.wl + rel) / 0.15, -1, 1); }
      // the rider soaks the pitching with his body, and fights the machine back once it is far off the ground's line
      if (V.wref === null && Math.abs(off) > 0.55 && !tq) tq -= Math.sign(off) * 40;
      V.va = clamp((V.va + (Ta / V.Ia + tq) * h) * Math.exp(-2.5 * h), -V.vam, V.vam); // past that the rider would be off
      // and never past 1.3 rad off that line on the ground: there he has shut it off and stood on the brake (no loop-out)
      const nxt = off + V.va * h;
      if ((nxt > 1.3 && V.va > 0) || (nxt < -1.3 && V.va < 0)) V.va = Math.abs(off) < 1.3 ? (Math.sign(nxt) * 1.3 - off) / h : 0;
    }
    V.a += V.va * h;
    if (V.tw) { V.vb += (Tb / V.Ib) * h; V.b += V.vb * h; }
    if (drive) V.vx += clamp(V.vxT - V.vx, -V.brk * h, V.acc * h);
    V.x += V.vx * h;
    if (air) {
      const off = !V.air;
      if (off) { V.air = true; V.airT = 0; V.took = true; if (V.pop && V.sl * V.vx < -0.05 * Math.abs(V.vx)) V.vy = V.vx * V.sl * V.pop; }
      V.airT += h;
      if (off && onAir) onAir(V); // the rider's plan for the flight, made the moment the last tyre leaves
    } else if (V.air) { V.air = false; V.hit = Math.max(V.hit, V.vy + F * h); V.goal = null; V.a -= V.rot; V.rot = 0; }
  }
  if (!V.air) V.a = ((((V.a + Math.PI) % TAU) + TAU) % TAU) - Math.PI; // a whole turn is no turn
  // rolling, a wheel turns at its hub's speed along the ground under it over its radius (the springs' bounce and the
  // fall onto it are no rolling); off the ground it keeps the spin it had
  for (const wh of V.wh) {
    if (wh.on) {
      const s = (g(wh.cx + 1, wh.side) - g(wh.cx - 1, wh.side)) / 2, hvx = V.vx - V.va * (wh.hy - V.y), hvy = V.vy + V.va * (wh.hx - V.x);
      wh.w = (hvx + hvy * s) / (Math.sqrt(1 + s * s) * V.R) + (wh.drive ? V.slip : 0);
    }
    wh.sp += wh.w * dt;
  }
}
// set a machine down at rest on the ground, its springs at their sag
function place(V, G, g) {
  const sag = G / (V.wh.length * V.k), gr = g(V.x - V.wb / 2, 0), gf = g(V.x + V.wb / 2, 0);
  V.a = Math.atan2(gf - gr, V.wb);
  V.y = (gr + gf) / 2 - V.L0 * Math.cos(V.a) - V.R + sag;
  V.vy = V.va = V.vb = V.b = V.airT = V.rot = 0;
  V.air = false;
  V.goal = null;
  for (const wh of V.wh) { wh.c = sag; wh.on = true; wh.cx = V.x + wh.lx; }
}
// when and where the machine comes down under its parabola: the first touch of either tyre, the chassis pitched to
// the ground beneath it, `lean` nose-up of it (as the rider will have it), and the slope there. The pitch it holds at
// the touch decides where the touch is, so the search is run again at the pitch found (damped, so a landing that
// curves fast settles) till the two agree; the slope given back is the one the last touch was found with.
function predict(V, G, g, side = 0, lean = 0) {
  const hw = V.wb / 2, sl = (x) => Math.atan2(g(x + hw, side) - g(x - hw, side), V.wb), up = lean * (Math.sign(V.vx) || 1);
  let aL = null, L = null;
  const reach = (t) => { // how far into the ground the deeper tyre would be (as `ride` meets it: a circle at full droop)
    const x = V.x + V.vx * t, y = V.y + V.vy * t + 0.5 * G * t * t, a = aL === null ? sl(x) - up : aL, ca = Math.cos(a), sa = Math.sin(a), hy = y + V.L0 * ca;
    return Math.max(sink(g, side, x - hw * ca - V.L0 * sa, hy - hw * sa, V.R), sink(g, side, x + hw * ca - V.L0 * sa, hy + hw * sa, V.R));
  };
  for (let it = 0; it < 4; it++) {
    let prev = reach(0), t = 0;
    L = null;
    for (let i = 0; i < 400 && !L; i++) {
      t += 0.01;
      const q = reach(t);
      if (q >= 0 && V.vy + G * t > 0) { // the slope of the ground under the two tyres there
        const tt = t - (0.01 * q) / Math.max(1e-6, q - prev), lx = V.x + V.vx * tt, a = aL === null ? sl(lx) - up : aL, ca = Math.cos(a), sa = Math.sin(a);
        const xr = lx - hw * ca - V.L0 * sa, xf = lx + hw * ca - V.L0 * sa;
        L = { t: tt, x: lx, a: Math.atan2(g(xf, side) - g(xr, side), xf - xr) };
      }
      prev = q;
    }
    if (!L) return { t, x: V.x + V.vx * t, a: 0 };
    const want = L.a - up;
    if ((aL !== null && Math.abs(want - aL) < 0.01) || it === 3) break;
    aL = aL === null ? want : 0.5 * (aL + want);
  }
  if (aL !== null) L.a = aL + up;
  return L;
}
// The rider's plan for a flight: the landing slope `lean` nose-up of it (rear wheel first), `rot` turns more (a flip,
// one 2π each) done `lead` seconds before the wheels touch. The turn is set off the lip (where the ground can give it)
// and eases out to none at the end, so nothing in the air starts a spin or stops one dead; off a plain jump the lip and
// the rider's weight change the turn it left with by no more than `vam`, and short of that it lands a little off its
// pitch. Planned from `ride`'s onAir, it is set at the step the last tyre leaves.
function plan(V, G, g, lean = 0.06, rot = 0, lead = 0.18, side = 0) {
  const L = predict(V, G, g, side, lean), dir = Math.sign(V.vx) || 1;
  if (rot && Math.abs(L.a - lean * dir + rot - V.a) > 12 * (L.t - lead)) rot = 0; // too little air to bring a flip round: none
  if (L.t < 0.15 && !rot) return L; // a skip off a bump: nothing to plan, the bike keeps the turn it had
  const T = rot ? Math.max(0.05, L.t - lead) : Math.max(0.5 * L.t, L.t - 0.15);
  let goal = L.a - lean * dir + rot;
  if (!rot) { const dw = clamp((1.5 * (goal - V.a)) / T - V.va, -V.vam, V.vam); goal = V.a + ((V.va + dw) * T) / 1.5; }
  V.rot = rot;
  V.goal = goal;
  V.pa0 = V.a;
  V.pt0 = V.airT;
  V.pT = T;
  V.goalT = V.airT + T; // on the clock of the air so far, set before the touch
  return L;
}
// roost: dirt the driven tyre throws back and up from the back of where it bites, faster the harder it spins
function roost(list, rnd, V, n, sp, c, s = 1) {
  const wh = V.vx < 0 ? V.wh[1] : V.wh[0], back = -(Math.sign(V.vx) || 1), x = wh.cx + back * 0.3 * V.R, y = (V.g ? V.g(x, wh.side) : wh.gy) - 0.6;
  for (let i = 0; i < n && list.length < 260; i++) list.push({ x, y, vx: V.vx * (0.1 + 0.3 * rnd()) + back * sp * (0.25 + 0.6 * rnd()), vy: -sp * (0.3 + 0.7 * rnd()), life: 1.4, s: rnd() < 0.3 ? 1.6 * s : s, c });
}

// the rider's joints by pose, in units of the bike (x ahead, y down from the chassis middle): foot, knee, hip,
// shoulder, head, near hand, far hand, far foot, far knee
const POSE = {
  sit: [-0.6, 1, 1.6, -1.6, -2.8, -3.6, -0.2, -7.6, 0.8, -9.3, 2.6, -5.4, 2.6, -5.4, -0.6, 1, 1.6, -1.6],
  stand: [-0.6, 1, 1.8, -2.6, -2, -5.4, 0.6, -9, 1.6, -10.7, 2.6, -5.4, 2.6, -5.4, -0.6, 1, 1.8, -2.6],
  superman: [-11.2, -7.8, -7.8, -8, -4.4, -7.6, 0.2, -6.8, 1.8, -7.6, 2.6, -5.4, 2.6, -5.4, -11.4, -8.8, -7.8, -8.8],
  heel: [6.4, -8.6, 3, -8, -2.4, -4.2, -3, -8.4, -3, -10.2, 2.6, -5.4, 2.6, -5.4, 6.4, -9.2, 3, -8.6],
  nac: [-0.6, 1, 1.8, -2.6, -2.2, -5, -0.2, -8.8, 0.6, -10.4, 2.6, -5.4, 2.6, -5.4, -8.4, -6.4, -5.2, -6.8],
  nohand: [-0.6, 1, 1.8, -2.6, -2, -5.4, 0.4, -9.2, 1.2, -10.9, -2.6, -12.6, 3.4, -12.8, -0.6, 1, 1.8, -2.6],
  dab: [5, 1.6, 2.8, -1.4, -2.8, -3.8, 0.4, -7.6, 1.4, -9.2, 2.6, -5.4, 2.6, -5.4, -0.6, 1, 1.6, -1.6],
  climb: [-0.6, 1, 2.4, -2.2, -0.2, -4.8, 4.2, -7, 5.6, -8.2, 3, -5.2, 3, -5.2, -0.6, 1, 2.4, -2.2], // up a face: the weight forward over the bars
};
// The rider on a frame mapper P (in units of his machine), seated to standing by `st`, into a trick's pose by `p`,
// shifted by (ox, oy) on a machine that sits him elsewhere: the far limbs (`far`) before the machine, the rest after
function drawRider(r, P, k, o, far, ox = 0, oy = 0) {
  const B = POSE.sit, S = POSE.stand, T = POSE[o.pose] || S, st = o.st ?? 1, p = o.p || 0, kit = o.kit ?? COOL, pants = o.pants ?? FIG;
  const lw = (q) => Math.max(1, q * k), seg = (a, b, q, c) => r.stroke(a[0], a[1], b[0], b[1], lw(q), c);
  const Ju = (i) => { const bx = B[i] + (S[i] - B[i]) * st, by = B[i + 1] + (S[i + 1] - B[i + 1]) * st; return [bx + (T[i] - bx) * p + ox, by + (T[i + 1] - by) * p + oy]; };
  const J = (i) => P(...Ju(i));
  if (far) { const hp = J(4), k2 = J(16); seg(hp, k2, 1.3, dimC(pants)); seg(k2, J(14), 1.1, dimC(pants)); seg(J(6), J(12), 1, dimC(kit)); return; }
  const f1 = J(0), k1 = J(2), hp = J(4), sh = J(6), [hx, hy] = Ju(8), hd = P(hx, hy), [fx, fy] = Ju(0);
  seg(hp, k1, 1.4, pants);
  seg(k1, f1, 1.2, pants);
  seg(f1, P(fx + 1.3, fy + 0.2), 1, FIG);
  seg(hp, sh, 2.3, kit);
  seg(sh, J(10), 1.1, kit);
  ell(r, hd[0], hd[1], 1.55 * k, 1.55 * k * (o.sq ?? 1), o.helm ?? BRIGHT);
  seg(P(hx + 0.9, hy - 0.9), P(hx + 2.3, hy - 0.5), 0.7, o.plast ?? HOT);
  const gg = P(hx + 1, hy + 0.1);
  r.set(gg[0], gg[1], FIG);
}
// A dirt bike and its rider in profile: the chassis frame at (X, Y) turned by the pitch, the wheels where the springs
// hold them, the spokes turning with the wheels; `sq` squashes it all toward the ground line (the roll of a lean into
// a berm, of a whip in the air); the rider goes from seated to standing by `st` and into a trick's pose by `p`.
function drawBike(r, V, X, Y, k, o) {
  const dir = o.dir || 1, sq = o.sq ?? 1, hc = V.L0 + V.R, ca = Math.cos(V.a), sa = Math.sin(V.a), pl = o.plast ?? HOT;
  const C = (xx, yy) => { yy = (yy - hc) * sq + hc; return [X + xx * ca - yy * sa, Y + xx * sa + yy * ca]; };
  const P = (dx, dy) => C(dx * k * dir, dy * k), lw = (q) => Math.max(1, q * k), seg = (a, b, q, c) => r.stroke(a[0], a[1], b[0], b[1], lw(q), c), rider = o.rider !== false;
  if (rider) drawRider(r, P, k, o, true);
  let rear = null, front = null;
  for (const wh of V.wh) {
    const hb = C(wh.lx, V.L0), R = V.R; // at full droop, then straight up by what its spring takes (as `ride` has it)
    hb[1] -= Math.min(wh.c, V.cap) * sq;
    ell(r, hb[0], hb[1], R, R * sq, FIG);
    ell(r, hb[0], hb[1], R * 0.58, R * 0.58 * sq, MID);
    for (let j = 0; j < 3; j++) { const an = wh.sp + (j * TAU) / 3; r.line(hb[0], hb[1], hb[0] + Math.cos(an) * R * 0.55, hb[1] + Math.sin(an) * R * 0.55 * sq, DARK); }
    if (wh.lx * dir < 0) rear = hb; else front = hb;
  }
  const piv = P(-1.2, 0.6);
  seg(piv, rear, 1.1, DARK);
  seg(P(-2.6, -2.4), [(piv[0] + rear[0]) / 2, (piv[1] + rear[1]) / 2], 0.8, MID);
  r.poly([P(-2, -0.6), P(1.4, -1), P(2, 1.2), P(-0.6, 2), P(-2.2, 1.2)], DARK);
  seg(front, P(3.4, -3.8), 1.1, LMID);
  seg(P(3.2, -4.4), P(2.4, -5.6), 0.8, FIG);
  seg(P(-0.4, -0.2), P(-4.2, -1.6), 0.8, MID);
  seg(P(-4.2, -1.6), P(-6.6, -2.4), 1.4, LMID);
  r.poly([P(-8.2, -4), P(-5, -3.1), P(-1.4, -3.1), P(1.4, -3.7), P(3.6, -3.6), P(2.6, -1.6), P(0.2, -1.4), P(-2.4, -1.6), P(-4.6, -2.2)], pl);
  seg(P(-5.2, -3.3), P(-0.6, -3.4), 0.8, FIG);
  r.poly([P(3.4, -2.9), P(8.2, -2.5), P(7.6, -1.9), P(3.6, -2.2)], pl);
  if (rider) drawRider(r, P, k, o, false);
}
// a tyre seen from the side at (x, y): the rubber, its tread blocks turning with the wheel (`sp`), the rim and hub
function tyre(r, x, y, R, sp, sq, c, rim) {
  ell(r, x, y, R, R * sq, c);
  ell(r, x, y, R * 0.55, R * 0.55 * sq, rim);
  for (let j = 0; j < 6; j++) { const an = sp + (j * TAU) / 6; r.set(x + Math.cos(an) * R * 0.82, y + Math.sin(an) * R * 0.82 * sq, rim === MID ? DARK : MID); }
  for (let j = 0; j < 3; j++) { const an = sp + (j * TAU) / 3; r.line(x, y, x + Math.cos(an) * R * 0.5, y + Math.sin(an) * R * 0.5 * sq, DARK); }
}
// A machine on four wheels in profile (a quad, a pickup, a rally truck, a monster truck, a crawler), facing `dir`.
// The far wheels and the far side sit a step up and back (`D`, the depth of the picture) and dimmer; the roll (b)
// lifts one side against the other, so the roof shows as a strip that widens and thins; long-travel shocks run from
// the frame down to the hubs, where the springs hold them; the near wheels' tread turns with them.
const TRUCKS = {
  monster: { wb: 16, R: 5.5, L0: 7, trav: 6, sag: 0.35 },
  pickup: { wb: 14, R: 4, L0: 4.6, trav: 3.6, sag: 0.3 },
  rally: { wb: 15, R: 3.8, L0: 4.2, trav: 3.8, sag: 0.3 },
  crawler: { wb: 12, R: 4.4, L0: 5.2, trav: 6, sag: 0.3 },
  quad: { wb: 8, R: 2.7, L0: 3, trav: 2.6, sag: 0.3 },
};
const truckRig = (style, k, x, G, tw) => { const T = TRUCKS[style]; return rig({ x, four: true, wb: T.wb * k, R: T.R * k, L0: T.L0 * k, trav: T.trav * k, tw: tw * k, k: G / (4 * T.sag * T.trav * k), d: 2.2, hold: 0.85, wl: 0.3 }); };
const truckB = (style, k) => { const T = TRUCKS[style]; return { hw: (T.wb / 2) * k, L0: T.L0 * k, R: T.R * k, pf: 0.25 }; };
function drawTruck(r, V, X, Y, k, o) {
  const st = o.style, dir = o.dir || 1, D = o.D || [0, 0], ca = Math.cos(V.a), sa = Math.sin(V.a), sb = V.tw * Math.sin(V.b), body = o.col ?? HOT;
  const sx = o.sx ?? 1; // a quad turning about: its length foreshortened
  const C = (xx, yy) => [X + xx * sx * ca - yy * sa, Y + xx * sx * sa + yy * ca];
  const P = (dx, dy) => C(dx * k * dir, dy * k), lw = (q) => Math.max(1, q * k), seg = (a, b, q, c) => r.stroke(a[0], a[1], b[0], b[1], lw(q), c);
  const sh = (p, side) => [p[0] + (side > 0 ? D[0] : 0), p[1] + (side > 0 ? D[1] + sb : -sb)]; // a point on the far (1) or near (-1) side
  const hub = (wh) => { const p = C(wh.lx, V.L0); p[1] -= Math.min(wh.c, V.cap); return sh(p, wh.lz); }; // full droop, then straight up
  const quad = st === 'quad';
  if (quad && o.rider !== false) drawRider(r, (dx, dy) => sh(P(dx, dy), -1), k, o, true, 0.3, -1.6);
  for (const wh of V.wh) if (wh.lz > 0) { const h = hub(wh); tyre(r, h[0], h[1], V.R, wh.sp, 1, dimC(FIG), DARK + DIM); seg(h, sh(P((wh.lx / k) * dir, st === 'monster' ? -3 : -1), 1), 0.8, DARK + DIM); }
  const roof = (pts) => { const near = pts.map((p) => sh(P(...p), -1)), farp = pts.map((p) => sh(P(...p), 1)); r.poly([...near, ...farp.reverse()], LMID); };
  if (st === 'monster') {
    for (const wh of V.wh) if (wh.lz < 0) { const h = hub(wh); seg(sh(P((wh.lx / k) * dir - 1.2, -3.5), -1), h, 0.9, LMID); seg(sh(P((wh.lx / k) * dir + 1.2, -3.5), -1), h, 0.9, LMID); }
    r.poly([P(-7.5, -3.8), P(7.5, -3.8), P(7.5, -2.6), P(-7.5, -2.6)].map((p) => sh(p, -1)), DARK);
    roof([[-2.2, -14.5], [4, -14.5]]);
    r.poly([P(-10, -10.5), P(-2.5, -10.5), P(-2.2, -14.5), P(4, -14.5), P(6.2, -10.8), P(10.2, -10), P(10.2, -6.2), P(-10, -6.2)].map((p) => sh(p, -1)), body);
    r.poly([P(-1.6, -13.6), P(3.4, -13.6), P(5, -10.9), P(-1.6, -10.9)].map((p) => sh(p, -1)), o.glass ?? DARK);
    for (const ax of [-5.5, 6]) r.poly([P(ax - 4.2, -6.2), P(ax - 2.6, -8.2), P(ax + 2.6, -8.2), P(ax + 4.2, -6.2)].map((p) => sh(p, -1)), DARK);
  } else if (st === 'pickup') {
    roof([[-1.6, -10.2], [3.6, -10.2]]);
    r.poly([P(-9, -6.6), P(-2, -6.6), P(-1.6, -10.2), P(3.6, -10.2), P(5.4, -6.8), P(9, -6.2), P(9.2, -3.2), P(-9, -3.2)].map((p) => sh(p, -1)), body);
    r.poly([P(-1, -9.4), P(3, -9.4), P(4.4, -6.9), P(-1, -6.9)].map((p) => sh(p, -1)), o.glass ?? DARK);
    r.poly([P(-9, -3.2), P(9.2, -3.2), P(9.2, -2.4), P(-9, -2.4)].map((p) => sh(p, -1)), DARK);
    if (o.lights) { const l = sh(P(9.4, -5.2), -1); ell(r, l[0], l[1], 0.9 * k, 0.9 * k, BRIGHT); }
  } else if (st === 'rally') {
    roof([[3.6, -12.4], [9.6, -12.4]]);
    r.poly([P(-11, -11.2), P(2.6, -11.2), P(2.6, -3.4), P(-11, -3.4)].map((p) => sh(p, -1)), o.box ?? LMID);
    r.poly([P(3.4, -12.4), P(9.6, -12.4), P(10.6, -7), P(10.6, -3.4), P(3.4, -3.4)].map((p) => sh(p, -1)), body);
    r.poly([P(5.6, -11.6), P(9.4, -11.6), P(10, -8.4), P(5.6, -8.4)].map((p) => sh(p, -1)), o.glass ?? DARK);
    r.poly([P(-11, -3.4), P(10.6, -3.4), P(10.6, -2.5), P(-11, -2.5)].map((p) => sh(p, -1)), DARK);
    if (o.lights) { const l = sh(P(10.8, -5), -1); ell(r, l[0], l[1], k, k, WHITE); }
  } else if (st === 'crawler') {
    for (const wh of V.wh) if (wh.lz < 0) { const h = hub(wh); seg(sh(P((wh.lx / k) * dir * 0.55, -3.6), -1), h, 0.9, LMID); }
    const cage = [[[-6.4, -4], [-3.6, -10]], [[-3.6, -10], [3, -10]], [[3, -10], [6.4, -4]], [[-1, -10], [-1, -4]]];
    for (const [a, b] of cage) seg(sh(P(...a), 1), sh(P(...b), 1), 0.7, DARK + DIM); // the far side of the cage
    for (const q of [-3.6, 3]) seg(sh(P(q, -10), -1), sh(P(q, -10), 1), 0.7, DARK + DIM);
    r.poly([P(-6.6, -4.2), P(6.6, -4.2), P(6, -1.8), P(-6, -1.8)].map((p) => sh(p, -1)), body);
    for (const [a, b] of cage) seg(sh(P(...a), -1), sh(P(...b), -1), 0.9, DARK);
    const hd = sh(P(0.8, -6.6), -1); ell(r, hd[0], hd[1], 1.3 * k, 1.3 * k, o.helm ?? BRIGHT);
    const lb = sh(P(2, -10.6), -1); r.rect(lb[0] - 2.5 * k, lb[1], 5 * k, px1(0.8 * k), o.lights ? WHITE : DARK);
  } else { // the quad: racks over both wheels, a fat seat, the bars; the rider astride
    r.poly([P(-6.4, -3.2), P(-2.2, -3.4), P(-1.8, -2), P(-6, -1.6)].map((p) => sh(p, -1)), body);
    r.poly([P(2, -3.4), P(6.4, -3.1), P(6.2, -1.6), P(2.4, -2)].map((p) => sh(p, -1)), body);
    r.poly([P(-3.4, -4.4), P(1.6, -4.4), P(1.8, -3), P(-3.4, -3)].map((p) => sh(p, -1)), FIG);
    r.poly([P(-2, -2.6), P(2.2, -2.6), P(1.6, 0.4), P(-1.6, 0.4)].map((p) => sh(p, -1)), DARK);
    seg(sh(P(2, -3.6), -1), sh(P(2.9, -6.8), -1), 0.8, FIG);
  }
  for (const wh of V.wh) if (wh.lz < 0) { const h = hub(wh); tyre(r, h[0], h[1], V.R, wh.sp, 1, FIG, MID); }
  if (quad && o.rider !== false) drawRider(r, (dx, dy) => sh(P(dx, dy), -1), k, o, false, 0.3, -1.6);
}

// A rigid body tumbling down the dirt (a bike that looped out, a rider who bailed): its middle flies an exact parabola
// and turns at w between knocks; a point of it (an offset in its frame, with a radius: a tyre, a bar end) whose circle
// gets into the ground g takes, at the circle's point against the ground, an impulse along the ground's normal that
// sends it back at e of its speed (a knock slower than the fall of one step does not bounce: it rests), with friction
// along the ground, both turning the body (m 1, moment I). `down`: it touched the ground this frame.
function tumble(B, dt, G, g) {
  const n = Math.max(1, Math.ceil(dt / 0.006)), h = dt / n;
  B.down = false;
  for (let s = 0; s < n; s++) {
    B.x += B.vx * h;
    B.y += B.vy * h + 0.5 * G * h * h;
    B.vy += G * h;
    B.a += B.w * h;
    const ca = Math.cos(B.a), sa = Math.sin(B.a);
    for (const [ox, oy, rad] of B.pts) {
      const cx = ox * ca - oy * sa, cy = ox * sa + oy * ca, px = B.x + cx, gp = g(px), sl = (g(px + 1) - g(px - 1)) / 2, nl = Math.hypot(sl, 1), nx = sl / nl, ny = -1 / nl;
      const pen = (B.y + cy - gp) / nl + rad; // the circle's depth into the ground, along its normal
      if (pen <= 0) continue;
      B.down = true;
      B.x += nx * pen;
      B.y += ny * pen;
      const rx = cx - nx * rad, ry = cy - ny * rad, cvx = B.vx - B.w * ry, cvy = B.vy + B.w * rx, vn = cvx * nx + cvy * ny; // at the contact
      if (vn >= 0) continue;
      const tx = -ny, ty = nx, rn = rx * ny - ry * nx, rt = rx * ty - ry * tx, jn = (-(1 + (vn < -0.006 * G ? B.e : 0)) * vn) / (1 + (rn * rn) / B.I);
      const jt = clamp(-(cvx * tx + cvy * ty) / (1 + (rt * rt) / B.I), -B.mu * jn, B.mu * jn);
      B.vx += jn * nx + jt * tx;
      B.vy += jn * ny + jt * ty;
      B.w += (rn * jn + rt * jt) / B.I;
    }
  }
}
// a rope of length Lr hanging between two points (x0, y0) and (x1, y1), y down: its catenary, the lowest point at m
// along, y = y0 + A (cosh(m / A) - cosh((x - m) / A)), sagging, or the straight line once it is pulled taut; n + 1
// points along it
function catenary(x0, y0, x1, y1, Lr, n) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy), pts = [];
  if (Lr <= d * 1.0005 || Math.abs(dx) < 1e-3) { for (let i = 0; i <= n; i++) pts.push([x0 + (dx * i) / n, y0 + (dy * i) / n]); return pts; }
  const sx = dx < 0 ? -1 : 1, h = Math.abs(dx), want = Math.sqrt(Lr * Lr - dy * dy);
  let lo = 1e-3, hi = 1e4; // 2 A sinh(h / 2A) = want, solved for A by halving
  for (let i = 0; i < 50; i++) { const A = Math.sqrt(lo * hi), v = 2 * A * Math.sinh(Math.min(50, h / (2 * A))); if (v > want) lo = A; else hi = A; }
  const A = Math.sqrt(lo * hi), m = h / 2 + A * Math.atanh(Math.max(-0.999999, Math.min(0.999999, dy / Lr)));
  for (let i = 0; i <= n; i++) { const xx = (h * i) / n; pts.push([x0 + sx * xx, y0 + A * (Math.cosh(m / A) - Math.cosh((xx - m) / A))]); }
  return pts;
}

// ---------------------------------------------------------------------------------------------- the dirt
// A course laid ahead of the camera into a ring of M cells: the height of the dirt above the base line (h) and one
// more channel per cell (k: a berm's bank); laid a feature at a time, `feats` keeps where the lips are and the speed
// each jump was built for.
const course = (M) => ({ M, h: new Float32Array(M), k: new Float32Array(M), end: 0, feats: [] });
function cAt(C, x, a = C.h) {
  const M = C.M, xf = Math.floor(x), i = ((xf % M) + M) % M, j = i + 1 === M ? 0 : i + 1;
  return a[i] + (a[j] - a[i]) * (x - xf);
}
function lay(C, len, fn, kf) {
  len = Math.max(1, Math.round(len));
  for (let i = 0; i < len; i++) { const j = (C.end + i) % C.M; C.h[j] = fn(i / len, i, len); C.k[j] = kf ? kf(i / len, i, len) : 0; }
  C.end += len;
}
// where a tyre (the rear, side -1, or the front, 1) touches the ground, off the middle of a machine B (half wheelbase
// hw, droop L0, radius R) pitched by a (x ahead, y down)
const tyreAt = (B, a, side) => { const c = Math.cos(a), s = Math.sin(a); return [side * B.hw * c - B.L0 * s, side * B.hw * s + B.L0 * c + B.R]; };
// a kicker's face h1 high over `up` cells: a curve up to a straight lip (the last fifth) of slope tA = h1 / 0.6 up
const kickH = (x, h1, up) => { const tA = h1 / (0.6 * up), Lc = 0.8 * up; return x < Lc ? (tA * x * x) / (2 * Lc) : tA * (x - 0.4 * up); };
// The flight off such a kicker: the rider pops along its straight lip at v; as the rear tyre rolls off the edge it is
// a fifth of its radius under the lip and the machine has the pitch it leaves with (B.pf of the face's, as measured:
// over a short lip a bike's rear is still low on the curve and the bump-stop kicks its nose down a little, off a steep
// kicker it keeps near the face's, a truck's long wheelbase dips it). From there the
// middle flies its parabola while the rider turns the machine to the landing's pitch, a little nose-up of the ramp so
// the rear tyre touches first. The landing's crest (h2) sits where the front tyre's path is still `m` over it; its
// straight ramp runs from there through where the rear tyre comes down, at 0.6 h2, so the path, concave, stays above
// the ramp and meets it at a shallow angle (a soft landing, never a graze of the knuckle); the ramp goes on to 0.25 h2
// and curves out to the flat, gently (no g-out). `gap` is how far past the lip the crest is, T the time to the
// touchdown, s the ramp's slope, `len` the landing's length.
function flight(G, v, h1, up, h2, m, B) {
  const tA = h1 / (0.6 * up), k = G / (v * v), r0 = tyreAt(B, -B.pf * Math.atan(tA), -1), xm = 0.1 * B.R - r0[0], hm = h1 - 0.22 * B.R + r0[1];
  // the middle leaves from (xm, hm) off the lip; a tyre at offset o off it comes down to the height H at x =
  const at = (H, o) => xm + o[0] + (tA + Math.sqrt(Math.max(0, tA * tA - 2 * k * (H + o[1] - hm)))) / k;
  let s = tA, xc = 0, xp = 0;
  for (let it = 0; it < 3; it++) { // the landing's pitch depends on the ramp, the ramp on where the touchdown is
    const aL = Math.atan(s) - 0.07;
    xc = at(h2 + m, tyreAt(B, aL, 1));
    xp = at(0.6 * h2 + B.R * (Math.sqrt(1 + s * s) - 1), tyreAt(B, aL, -1));
    s = (0.4 * h2) / Math.max(1, xp - xc);
  }
  return { T: (xp - xm) / v, gap: Math.max(4, xc), s, len: landLen(h2, s) };
}
// the landing x past its crest: the straight ramp down to a quarter of its height, then a circular arc out to the flat,
// the gentlest curve the height left allows, so the speed down the ramp is turned level with no g-out
const landR = (h2, s) => (0.25 * h2) / (1 - 1 / Math.sqrt(1 + s * s));
const landLen = (h2, s) => (0.75 * h2) / s + (landR(h2, s) * s) / Math.sqrt(1 + s * s);
const landH = (x, h2, s) => { const x1 = (0.75 * h2) / s, r = landR(h2, s), xe = landLen(h2, s); return x < x1 ? h2 - s * x : x < xe ? r - Math.sqrt(Math.max(0, r * r - (xe - x) ** 2)) : 0; };
// A jump built for a speed `v` (see `flight`): between the lip and the landing the lip height (a table), down the
// back and up the landing's face (a double), or two humps under the flight as well (a triple)
function jumpLay(C, G, v, h1, up, h2, table, m, B) {
  up = Math.round(up);
  const x0 = C.end, { T, gap, s, len } = flight(G, v, h1, up, h2, m, B);
  lay(C, up, (q, i) => kickH(i, h1, up));
  const b = Math.min(gap * 0.3, h1), fr = Math.min(gap * 0.4, h2 * 1.5), mid = (q) => (q > 0.3 && q < 0.7 ? 0.55 * h1 * Math.sin(((q - 0.3) / 0.2) * Math.PI) ** 2 : 0);
  lay(C, gap, table === true ? (q) => h1 + (h2 - h1) * q : (q, i, n) => (i < b ? h1 * 0.5 * (1 + Math.cos((Math.PI * i) / b)) : i > n - fr ? h2 * 0.5 * (1 - Math.cos((Math.PI * (i - n + fr)) / fr)) : table ? mid(q) : 0));
  lay(C, len, (q, i) => landH(i, h2, s));
  C.feats.push({ lip: x0 + up, v, end: C.end, T });
}
// A track on a course seen from the side, a little from above: the bank of a berm behind, the lit top from the far
// edge (`far` above the near one) to the near edge, the face toward us with its clods scrolling with it
function trackDraw(r, N, u, C, cam, base, far, top = LMID, face = MID) {
  const cu = Math.max(2, Math.round(2.5 * u));
  for (let x = 0; x < N; x++) {
    const wx = x + cam, yn = base - cAt(C, wx), yt = yn + far, bank = cAt(C, wx, C.k), wi = Math.floor(wx), y0 = Math.round(yn);
    if (bank > 0.02) { // the berm: a banked wall of dirt, its lip lit, two ruts swept round its face
      const hb = bank * 0.12 * N, yb = yt - hb;
      vcol(r, x, yb, yt, face);
      vcol(r, x, yb, yb + px1(u), top);
      for (const q of [0.35, 0.65]) { const yy = Math.round(yb + hb * q); if (yy >= 0 && yy < N) r.buf[yy * N + x] = DARK; }
    }
    vcol(r, x, yt, yn, top);
    vcol(r, x, yn, N, face);
    for (let yy = Math.max(y0 + cu, 0); yy < N; yy += cu) if (hash(wi, yy - y0) < 0.14) r.buf[yy * N + x] = DARK;
  }
}
// the run-up rule: the speed the next jump ahead was built for once its lip is within `near` cells (and until the rear
// wheel, `back` behind the middle, is off it), else the pace; the rider pops off a lip he is on (`pop`), no other bump
function paceFor(C, x, pace, near, eps, back = 0, V = null) {
  let jp = null;
  for (const ft of C.feats) if (ft.lip && ft.lip > x - back && (!jp || ft.lip < jp.lip)) jp = ft;
  if (V) V.pop = jp && jp.lip - x < 2 * back ? 1 : 0;
  return jp && jp.lip - x < near ? jp.v * (1 + eps) : pace;
}

// ---------------------------------------------------------------------------------------------- motocross
// A pack of riders on a track in profile, the camera riding along: tabletops, doubles or the big doubles by the
// arousal, each built for a speed the riders hold on its run-up, leaving the lips on parabolas and landing on the
// downslopes rear wheel first, the rear squatting. The pace follows the bass; a kick opens the throttle (the rear
// squats and roosts), a snare lays a berm ahead that the bikes lean into, foot out; on the beat a rider in the air
// whips it flat and back before the landing. A drop is a new moto: the gate falls and the pack goes for the holeshot.
const MX_W = { tables: [3, 2, 1], doubles: [2, 3, 2], bigs: [0, 1, 3] };
// the jumps of a kind: kicker height and length, landing height (u), the speed it is built for (screens a second)
const MX_J = { tables: [8, 17, 9, 0.74, true], doubles: [10, 21, 11, 0.82, false], bigs: [13, 27, 14, 0.95, false] };
const MX_PL = [HOT, COOL, BRIGHT, LMID, HOT, COOL], MX_KIT = [COOL, HOT, HOT, COOL, BRIGHT, BRIGHT], MX_HE = [BRIGHT, BRIGHT, COOL, HOT, HOT, COOL];
function mxNext(w, G, N, u, rnd) {
  const C = w.C;
  if (w.bermQ) { w.bermQ = false; lay(C, 0.45 * N, (q) => 1.2 * u * Math.sin(Math.PI * q), (q) => Math.sin(Math.PI * q) ** 0.5); return; }
  if (rnd() < 0.35) { lay(C, (0.12 + 0.2 * rnd()) * N, () => 0); return; }
  const [h1, up, h2, v, tab] = MX_J[w.kind], e = 0.85 + 0.3 * rnd();
  jumpLay(C, G, v * N, h1 * u * e, up * u * e, h2 * u * e, tab, 2 * u, bikeB(0.85 * u));
  lay(C, 0.12 * N, () => 0); // the run-out, flat for a rider who lands long
}
const motocross = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, MX_W, bandOf(W.a)), N: 0, C: null, riders: [], roost: [], dust: [], cam: 0, bermQ: false, gate: null, n: 4 + bandOf(W.a) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, G = GV * N, base = 0.8 * N, ld = 1.2 * u, kb = 0.85 * u, n = w.n, far = -(n - 1) * ld;
    if (w.N !== N) { // the course and the pack for this size
      w.N = N;
      w.C = course(Math.ceil(6 * N));
      w.cam = 0;
      w.roost.length = w.dust.length = 0;
      w.gate = null;
      lay(w.C, 0.8 * N, () => 0);
      w.riders = Array.from({ length: n }, (_, i) => {
        const lo = (i - n + 1) * ld, g = (x) => base + lo - cAt(w.C, x), V = bikeRig(kb, (0.1 + (0.62 * ((i * 7) % n)) / n) * N, G);
        place(V, G, g);
        return { V, g, i, eps: (rnd() - 0.5) * 0.012, gas: 0, whip: 0, whipT: 0, lean: 0, go: 0 };
      });
    }
    const C = w.C;
    if (f.section === 'change') w.kind = rollW(rnd, MX_W, bandOf(W.a));
    if (f.section === 'drop') { // a new moto: the track from a gate, the pack lined up behind it
      C.h.fill(0); C.k.fill(0); C.feats.length = 0;
      const gx = Math.ceil(w.cam + 0.4 * N);
      C.end = gx;
      lay(C, 0.9 * N, () => 0);
      w.bermQ = true;
      w.gate = { x: gx, th: 0.05, om: 0, t: 0 };
      for (const R of w.riders) { R.V.x = gx - R.V.wb / 2 - R.V.R - 1.5 * u; R.V.vx = 0; place(R.V, G, R.g); R.go = 0.25 + rnd() * 0.25; R.whipT = 0; }
      s.shake = Math.max(s.shake, 0.3);
    }
    while (C.end < w.cam + 2.3 * N) mxNext(w, G, N, u, rnd);
    if (C.feats.length > 12) C.feats = C.feats.filter((ft) => ft.end > w.cam - N);
    // hits: a kick opens the throttles, a snare lays a berm ahead
    const kick = kickOf(hits);
    if (kick) for (const R of w.riders) if (!R.V.air) R.gas = Math.max(R.gas, 0.3 + 0.5 * kick);
    if (snareOf(hits)) w.bermQ = true;
    // the gate falls back like a rod about its hinge: dth^2 = 3 G / (2 len) sin th
    if (w.gate) {
      const gt = w.gate, len = 5 * u;
      gt.t += dt;
      for (let k = 0; k < 4; k++) { gt.om += ((3 * G) / (2 * len)) * Math.sin(gt.th) * (dt / 4); gt.th = Math.min(Math.PI / 2, gt.th + gt.om * (dt / 4)); }
      if (gt.th >= Math.PI / 2) gt.om = 0;
      if (gt.t > 4 && gt.x < w.cam - 0.2 * N) w.gate = null;
    }
    const pace = N * (0.62 + 0.12 * bandOf(W.a) + 0.12 * clamp(f.rel.bassDrive));
    let mx = 0, lead = null;
    for (const R of w.riders) {
      const V = R.V;
      const own = pace * (1 + 0.05 * Math.sin(t * 0.31 + R.i * 2.3)); // each holds his own line, so they swap places
      let vT = paceFor(C, V.x, own, 0.7 * N, R.eps, V.wb, V);
      if (vT === own) vT *= V.x < w.cam + 0.15 * N ? 1.12 : V.x > w.cam + 0.85 * N ? 0.88 : 1;
      const bank = cAt(C, V.x, C.k);
      vT *= 1 - 0.3 * bank;
      let tq = -150 * R.gas;
      if (w.gate && w.gate.t < R.go) { vT = 0; tq = 0; } // behind the gate, then the launch: wide open, the front up
      else if (w.gate && w.gate.t < R.go + 0.6) { R.gas = 1; tq = -260; }
      V.vxT = vT;
      V.acc = (0.5 + 0.6 * R.gas) * G;
      V.brk = 1.2 * G;
      V.tq = V.wh[0].on ? tq : 0;
      R.gas = Math.max(0, R.gas - dt * 1.2);
      if (f.beat.on && V.air && V.goal !== null && V.goalT - V.airT > 0.42) { R.whip = 0; R.whipT = Math.min(0.5, V.goalT - V.airT - 0.14); }
      ride(V, dt, G, R.g, (V) => plan(V, G, R.g, 0.07));
      if (R.whipT > 0 && (R.whip += dt) >= R.whipT) R.whipT = 0;
      R.lean = follow(R.lean, 0.7 * bank, dt, 0.12);
      if (V.hit > 0) { puff(w.dust, V.wh[0].hx, V.wh[0].gy, -0.1 * V.vx, -6 * u, 0.9, 1.5, 3, LMID + DIM, 0, R.g); if (V.hit > 0.5 * N) s.shake = Math.max(s.shake, 0.2); }
      if (V.wh[0].on && (R.gas > 0.05 || bank > 0.3)) roost(w.roost, rnd, V, 2 * emit(rnd, 30, dt), 0.35 * N * (1 + bank), rnd() < 0.5 ? MID : DARK);
      if (V.wh[0].on && V.vx > 0.3 * N) for (let k = emit(rnd, 8, dt); k > 0; k--) puff(w.dust, V.wh[0].hx, V.wh[0].gy - u, -0.15 * V.vx, -4 * u, 1.2, 1, 3, LMID + DIM, 0, R.g);
      mx += V.x;
      if (!lead || V.x > lead.V.x) lead = R;
    }
    // the camera rides with the pack
    const vMean = w.riders.reduce((q, R) => q + R.V.vx, 0) / n;
    w.cam = follow(w.cam + vMean * dt, mx / n - 0.5 * N, dt, 0.6);
    // the far hills, a tree line, the fence with its plain banners and the crowd bobbing on the beat
    ridge(r, w.cam * 0.12, 0.5 * N, 0.05 * N, 0.02 / u, N, MID + DIM);
    ridge(r, w.cam * 0.3, 0.6 * N, 0.025 * N, 0.11 / u, N, COOL + DIM, 2);
    const fo = w.cam * 0.7, fy = 0.67 * N, hs = 2.6 * u;
    r.rect(0, fy, N, N - fy, MID + DIM);
    for (let i = Math.floor(fo / hs), e = Math.ceil((fo + N) / hs); i <= e; i++) {
      const x = i * hs - fo, bob = f.beat.pulse * u * (hash(i, 7) < 0.5 ? 1.3 : 0.4);
      ell(r, x, fy - 3.4 * u - bob, 1.1 * u, 1.1 * u, hash(i, 3) < 0.5 ? FIG : DARK);
      r.rect(x - 1.2 * u, fy - 2.4 * u - bob, 2.4 * u, 2.4 * u + bob, hash(i, 5) < 0.4 ? dimC(HOT) : DARK);
    }
    const pw = 0.16 * N;
    for (let i = Math.floor(fo / pw), e = Math.ceil((fo + N) / pw); i <= e; i++) r.rect(i * pw - fo + u, fy, pw - 2 * u, 2.4 * u, [HOT, COOL, BRIGHT][Math.floor(hash(i, 11) * 3)]);
    trackDraw(r, N, u, C, w.cam, base, far);
    if (w.gate) { // the gate: a flap per lane on its hinge, the post at the end
      const gt = w.gate, len = 5 * u;
      for (let i = 0; i < n; i++) { const gy = base - cAt(C, gt.x) + (i - n + 1) * ld, x = gt.x - w.cam; r.stroke(x, gy, x - Math.sin(gt.th) * len, gy - Math.cos(gt.th) * len, px1(1.2 * u), i === n - 1 ? LMID : MID); }
      r.rect(gt.x - w.cam + u, base - cAt(C, gt.x) + far - 7 * u, px1(u), 7 * u, FIG);
    }
    dust(W, w.dust, w.cam);
    for (const R of w.riders) {
      const V = R.V, sq = Math.cos(R.whipT > 0 ? 1.1 * Math.sin(Math.PI * Math.min(1, R.whip / R.whipT)) : R.lean);
      drawBike(r, V, V.x - w.cam, V.y, kb, { plast: MX_PL[R.i], kit: MX_KIT[R.i], helm: MX_HE[R.i], sq, st: V.air || R.gas > 0.2 ? 1 : 0.4, pose: R.lean > 0.25 ? 'dab' : 'stand', p: R.lean > 0.25 ? clamp((R.lean - 0.25) * 3) : 0 });
    }
    fly(W, w.roost, G, (x) => base - cAt(C, x), w.cam);
    if (lead) targets.push({ x: lead.V.x - w.cam - 8 * kb, y: lead.V.y - 12 * kb, w: 16 * kb, h: 18 * kb });
  },
};

// ---------------------------------------------------------------------------------------------- freestyle
// A freestyle show: a deck and a roll-in, a steel kicker, a dirt landing, the crowd in the dark below. The riders wait
// their turn on the deck and drop in on the kicks, run up to the speed the jump was built for and fly with the camera;
// a snare in the air is a trick timed to the air left: a whip, a nac-nac, a superman, a heel clicker; a snare on the
// run-up can be a backflip, pulled off the lip (the only place a turn can come from) at the rate that brings it round
// before the wheels touch. Pyro goes up on every landing and comes down on the dirt, the crowd's arms with it; the
// crowd bobs and the lights flash on the beat. A drop brings out the big ramp: a double backflip.
const FMX_W = { whips: [3, 2, 1], stretch: [2, 3, 2], flips: [0, 1, 3] };
const FMX_T = { whips: ['whip', 'nac', 'whip'], stretch: ['superman', 'heel', 'nac'], flips: ['flip', 'superman', 'flip'] };
// the show's course, x from the deck: the deck and its roll-in, the run-up, the kicker and the landing built for the
// speed `v` like any jump (see `flight`), the gap under the flight bare
function fmxCourse(N, G, big) {
  const Lc = Math.ceil((big ? 4.3 : 3.8) * N), h = new Float32Array(Lc + 1), dH = 0.3 * N, d0 = 0.32 * N, d1 = 0.75 * N, k0 = 1.15 * N;
  const h1 = (big ? 0.2 : 0.16) * N, up = Math.round(h1 / (0.6 * (big ? 1.43 : 1.19))), v = (big ? 0.98 : 0.92) * N, h2 = h1 + 0.02 * N;
  const { gap, s, len } = flight(G, v, h1, up, h2, 0.02 * N, bikeB(0.9 * N / 125, 0.85)), lip = k0 + up, crest = lip + gap, face = 0.6 * h2; // (off a steep kicker the bike leaves near its pitch)
  for (let x = 0; x <= Lc; x++) {
    let y = 0;
    if (x < d0) y = dH;
    else if (x < d1) y = dH * 0.5 * (1 + Math.cos((Math.PI * (x - d0)) / (d1 - d0)));
    else if (x >= k0 && x <= lip) y = kickH(x - k0, h1, up);
    else if (x > crest - face && x < crest) y = h2 * 0.5 * (1 - Math.cos((Math.PI * (x - crest + face)) / face));
    else if (x >= crest && x < crest + len) y = landH(x - crest, h2, s);
    h[x] = y;
  }
  return { h, Lc, lip, k0, v, crest, end: crest + len, big, d1 };
}
const fAt = (F, x) => { if (x <= 0) return F.h[0]; if (x >= F.Lc) return F.h[F.Lc]; const i = x | 0; return F.h[i] + (F.h[i + 1] - F.h[i]) * (x - i); };
const freestylemx = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, FMX_W, bandOf(W.a)), N: 0, F: null, riders: [], sparks: [], dust: [], cam: 0, idle: 0, cheer: 0, pend: false, flash: 0, hold: 0, at: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, G = GV * N, base = 0.86 * N, kb = 0.9 * u, band = bandOf(W.a), bps = bpsOf(f);
    const g = (x) => base - fAt(w.F, x), slot = (j) => (0.26 - 0.085 * j) * N;
    if (w.N !== N) {
      w.N = N;
      w.F = fmxCourse(N, G, false);
      w.cam = 0;
      w.riders = [0, 1, 2].map((i) => { const V = bikeRig(kb, slot(i), G); place(V, G, g); return { V, i, st: 'q', q: i, trick: null, arm: false, t0: 0, T: 0, whip: 0, whipT: 0 }; });
      w.sparks.length = w.dust.length = 0;
    }
    // the course is only rebuilt with nobody on it: the big ramp for a drop, the plain one again on a section change
    const busy = w.riders.some((R) => R.st === 'go' || R.st === 'out');
    if (f.section === 'change') { w.kind = rollW(rnd, FMX_W, band); if (w.F.big) w.pend = 'plain'; }
    if (f.section === 'drop') w.pend = 'big';
    if (w.pend && !busy) { w.F = fmxCourse(N, G, w.pend === 'big'); w.pend = false; }
    const F = w.F, act = w.riders.find((R) => R.st === 'go');
    // a kick (or a while of nothing, on a beat) drops the first of the queue in, once the camera is back on the deck
    w.idle += dt;
    const kick = kickOf(hits), first = w.riders.find((R) => R.st === 'q' && R.q === 0);
    if (!act && first && w.cam < 0.06 * N && Math.abs(first.V.x - slot(0)) < 2 * u && ((kick > 0.3 && w.idle > 0.8) || (w.idle > 6 / bps && f.beat.on))) {
      first.st = 'go';
      first.trick = null;
      first.arm = false;
      w.idle = 0;
      for (const R of w.riders) if (R.st === 'q') R.q = Math.max(0, R.q - 1);
    }
    const snare = snareOf(hits);
    for (const R of w.riders) {
      const V = R.V;
      if (R.st === 'q' || R.st === 'back') { // rolling up to the place in the queue, idling there
        const want = slot(R.st === 'back' ? 2 : R.q);
        V.vxT = clamp((want - V.x) * 3, -0.12 * N, 0.25 * N);
        V.acc = V.brk = 0.6 * G;
        if (R.st === 'back' && V.x > want - 2 * u) { R.st = 'q'; R.q = w.riders.filter((o) => o.st === 'q' && o !== R).length; }
      } else if (R.st === 'out') { V.vxT = 0.8 * F.v; V.acc = 0.5 * G; V.brk = 1.4 * G; } // riding out under the camera's back
      else { // off the deck at a walk, then the roll-in gives what gravity gives (no gas), held at the jump's speed
        const fall = Math.sqrt(2 * G * Math.max(0, 0.3 * N - fAt(F, V.x))), sl = (fAt(F, V.x - 1) - fAt(F, V.x + 1)) / 2;
        V.vxT = V.x > F.crest ? 0.45 * F.v : V.x > F.d1 ? F.v : Math.min(F.v, Math.max(0.2 * N, fall / Math.sqrt(1 + sl * sl)));
        V.acc = 2 * G;
        V.brk = 1.4 * G;
      }
      // a snare on the run-up and he means to flip it, off the lip; one in the air is a trick for the air that is left
      // (a body move: the turn of the machine in the air is the one it left the lip with)
      if (R.st === 'go' && snare && !R.trick) {
        const tr = FMX_T[w.kind][Math.floor(rnd() * 3)];
        if (!V.air && V.x < F.lip) R.arm = tr === 'flip';
        else if (V.air && V.goal !== null && V.goalT - V.airT > 0.42) {
          const left = V.goalT - V.airT;
          if (tr === 'whip') { R.trick = tr; R.whip = 0; R.whipT = left - 0.15; }
          else { R.trick = tr === 'flip' ? 'superman' : tr; R.t0 = V.airT; R.T = left - 0.2; }
        }
      }
      V.pop = Math.abs(V.x - F.lip) < 2 * V.wb ? 1 : 0;
      ride(V, dt, G, g, (V) => {
        if (R.st !== 'go') return;
        if (Math.abs(V.wh[0].hx - F.lip) > V.wb) plan(V, G, g, 0.04);
        else if (F.big || R.arm) { plan(V, G, g, 0.08, (F.big ? -2 : -1) * TAU, 0.2); R.trick = V.rot ? (F.big ? 'double' : 'flip') : null; R.T = 0; }
        else plan(V, G, g, 0.08);
        R.arm = false;
      });
      if (R.whipT > 0 && (R.whip += dt) >= R.whipT) R.whipT = 0;
      if (V.hit > 0 && R.st === 'go' && V.x > F.lip) { // the landing: pyro off both sides of it, the crowd up, the camera holds on it
        for (const px of [F.crest - 0.07 * N, F.end + 0.05 * N]) for (let k = 0; k < 14; k++) w.sparks.push({ x: px, y: g(px) - 2 * u, vx: (rnd() - 0.5) * 0.15 * N, vy: -Math.sqrt(2 * G * 0.3 * N) * (0.75 + 0.35 * rnd()), life: 1.1 + 0.5 * rnd(), s: 1, c: rnd() < 0.5 ? HOT : BRIGHT });
        w.cheer = 1.6;
        w.hold = 0.8;
        w.at = clamp(V.x - 0.45 * N, 0, F.Lc - N);
        R.st = 'out';
        R.trick = null;
        s.shake = Math.max(s.shake, 0.25);
        for (let k = 0; k < 3; k++) puff(w.dust, V.wh[0].hx, V.wh[0].gy, -0.2 * V.vx * rnd(), -8 * u * rnd(), 1.2, 2, 4, LMID + DIM, 0, g);
      }
      if ((R.st === 'out' || R.st === 'go') && V.x > F.Lc - 0.04 * N) { // out of the arena; back round to the deck behind the camera
        R.st = 'back';
        V.x = -0.15 * N;
        V.vx = 0.2 * N;
        place(V, G, g);
      }
    }
    // the camera flies with the rider in the air, holds on the landing, then swings back to the deck
    const on = w.riders.find((R) => R.st === 'go');
    w.hold -= dt;
    w.cam = clamp(follow(w.cam + (on ? on.V.vx * dt : 0), on ? clamp(on.V.x - 0.38 * N, 0, F.Lc - N) : w.hold > 0 ? w.at : 0, dt, on ? 0.3 : 0.4), 0, F.Lc - N);
    const cam = w.cam;
    if (f.beat.on) w.flash = 1;
    w.flash *= Math.exp(-dt * 6);
    w.cheer -= dt;
    // the stands in the dark, their crowd a speckle, the lights on top sweeping
    r.rect(0, 0.3 * N, N, base - 0.3 * N, DARK + DIM);
    for (let y = Math.round(0.33 * N); y < base; y += Math.max(2, Math.round(2 * u))) for (let x = 0; x < N; x += 2) if (hash(Math.floor(x + cam * 0.4), y) < 0.3 + 0.2 * f.level) r.buf[y * N + x] = MID + DIM;
    for (let k = 0; k < 4; k++) {
      const lx = ((((k * 0.3 + 0.1) * N - cam * 0.2) % (1.2 * N)) + 1.2 * N) % (1.2 * N) - 0.1 * N, sw = Math.sin(f.rel.trebClock * 0.8 + k * 1.9) * 0.5;
      dpoly(r, [[lx, 0.29 * N], [lx + Math.sin(sw - 0.1) * N, N], [lx + Math.sin(sw + 0.1) * N, N]], BRIGHT, 0.08 + 0.12 * w.flash);
      ell(r, lx, 0.29 * N, 1.8 * u, 1.2 * u, w.flash > 0.4 ? WHITE : BRIGHT);
    }
    // the course: the deck on its scaffold, the steel kicker, the dirt landing, the floor
    const sc = Math.max(3, Math.round(4 * u));
    for (let x = 0; x < N; x++) {
      const wx = x + cam, hh = fAt(F, wx), y = base - hh;
      vcol(r, x, base, N, MID + DIM);
      if (hh < 0.5) continue;
      if (wx < F.d1 + 2) { vcol(r, x, y, base, DARK); vcol(r, x, y, y + px1(u), LMID); if (Math.floor(wx) % sc === 0) vcol(r, x, y, base, MID); }
      else if (wx >= F.k0 && wx <= F.lip + 1) { vcol(r, x, y, base, DARK + DIM); vcol(r, x, y, y + px1(1.5 * u), BRIGHT); if (Math.floor(wx) % sc === 0) vcol(r, x, y + 2 * u, base, MID); }
      else { vcol(r, x, y, base, MID); vcol(r, x, y, y + px1(u), LMID); }
    }
    for (const px of [F.crest - 0.07 * N, F.end + 0.05 * N]) r.rect(px - cam - 1.5 * u, g(px) - 2.5 * u, 3 * u, 2.5 * u, FIG);
    dust(W, w.dust, cam);
    for (const R of w.riders) {
      const V = R.V, tp = R.trick && R.T > 0 ? Math.sin(Math.PI * clamp((V.airT - R.t0) / R.T)) : 0;
      const sq = R.whipT > 0 ? Math.cos(1.2 * Math.sin(Math.PI * Math.min(1, R.whip / R.whipT))) : 1;
      drawBike(r, V, V.x - cam, V.y, kb, { plast: [HOT, COOL, BRIGHT][R.i], kit: [BRIGHT, HOT, COOL][R.i], helm: [HOT, BRIGHT, HOT][R.i], sq, st: R.st === 'go' ? 1 : 0, pose: R.trick && R.trick !== 'double' && R.trick !== 'whip' ? R.trick : 'stand', p: tp });
      if (R.st === 'go') targets.push({ x: V.x - cam - 8 * kb, y: V.y - 12 * kb, w: 16 * kb, h: 18 * kb });
    }
    fly(W, w.sparks, G, g, cam);
    // the crowd in front, nearer than the floor, bobbing on the beat, arms up after a landing
    const co = cam * 1.3, cw = 3.2 * u;
    for (let i = Math.floor(co / cw), e = Math.ceil((co + N) / cw); i <= e; i++) {
      const x = i * cw - co, y = N - 2.6 * u - f.beat.pulse * u * (hash(i, 1) < 0.5 ? 1.2 : 0.3) - hash(i, 2) * u;
      ell(r, x, y, 1.3 * u, 1.3 * u, FIG);
      r.rect(x - 1.8 * u, y + u, 3.6 * u, N - y, FIG);
      if (w.cheer > 0 && hash(i, 4) < 0.6) r.stroke(x + u, y + u, x + 2 * u, y - 4 * u, px1(0.8 * u), FIG);
    }
  },
};

// ---------------------------------------------------------------------------------------------- whoops
// A supercross stadium at night, the camera riding with the leader through a whoops section: a rhythm of mounds a fast
// bike skims (each wheel's spring soaking a whoop, the chassis and the rider's knees staying level), a slow one rolls
// through mound by mound, small doubles between in the rhythm kind. The pace follows the bass, a kick opens the
// throttle (roost), a snare pops flashbulbs in the stands, the light banks pulse on the beat. A drop lays the triple:
// one long jump over two humps, built for the speed the riders hit it at.
const WH_W = { skim: [1, 2, 3], rhythm: [2, 2, 1], deep: [3, 1, 0] };
// a kind's whoops: spacing and height (u), the speed they are ridden at (screens a second)
const WH_K = { skim: [11, 3, 0.95], rhythm: [12, 3.5, 0.78], deep: [15, 5.5, 0.55] };
function whNext(w, G, N, u, rnd, kb) {
  const C = w.C, [sp, hh, vv] = WH_K[w.kind];
  if (w.triQ) { w.triQ = false; lay(C, 0.35 * N, () => 0); jumpLay(C, G, 1.02 * N, 13 * u, 27 * u, 14 * u, 'triple', 2.5 * u, bikeB(kb)); lay(C, 0.25 * N, () => 0); return; }
  const r0 = rnd();
  if (r0 < 0.6) { // a whoops section: n mounds, ridden at the kind's speed from a little before them
    const n = 6 + Math.floor(rnd() * 6), s1 = Math.round(sp * u);
    lay(C, 0.18 * N, () => 0);
    const x0 = C.end;
    lay(C, n * s1, (q, i) => hh * u * Math.sin((Math.PI * i) / s1) ** 2);
    C.feats.push({ whoop: [x0 - 0.15 * N, C.end], v: vv * N, end: C.end });
    lay(C, 0.1 * N, () => 0);
  } else if (w.kind === 'rhythm' && r0 < 0.85) { jumpLay(C, G, 0.8 * N, 6 * u, 13 * u, 7 * u, false, 1.5 * u, bikeB(kb)); lay(C, 0.12 * N, () => 0); }
  else lay(C, (0.15 + 0.15 * rnd()) * N, () => 0);
}
const whoops = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, WH_W, bandOf(W.a)), N: 0, C: null, riders: [], roost: [], dust: [], cam: 0, triQ: false, flash: [], pulse: 0, n: 1 + bandOf(W.a) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, G = GV * N, base = 0.86 * N, ld = 1.4 * u, kb = 0.85 * u, n = w.n, far = -n * ld;
    if (w.N !== N) {
      w.N = N;
      w.C = course(Math.ceil(6 * N));
      w.cam = 0;
      w.roost.length = w.dust.length = w.flash.length = 0;
      lay(w.C, 0.6 * N, () => 0);
      w.riders = Array.from({ length: n }, (_, i) => { const lo = (i - n + 1) * ld, g = (x) => base + lo - cAt(w.C, x), V = bikeRig(kb, (0.5 - 0.17 * i) * N, G); place(V, G, g); return { V, g, i, gas: 0 }; });
    }
    const C = w.C;
    if (f.section === 'change') w.kind = rollW(rnd, WH_W, bandOf(W.a));
    if (f.section === 'drop') w.triQ = true;
    while (C.end < w.cam + 2.3 * N) whNext(w, G, N, u, rnd, kb);
    if (C.feats.length > 12) C.feats = C.feats.filter((ft) => ft.end > w.cam - N);
    const kick = kickOf(hits);
    if (kick) for (const R of w.riders) R.gas = Math.max(R.gas, 0.3 + 0.5 * kick);
    if (snareOf(hits)) for (let k = 0; k < 7; k++) w.flash.push([rnd() * N, (0.18 + 0.4 * rnd()) * N, 0.1]);
    if (f.beat.on) w.pulse = 1;
    w.pulse *= Math.exp(-dt * 5);
    const pace = N * (0.62 + 0.08 * bandOf(W.a) + 0.12 * clamp(f.rel.bassDrive)), lead = w.riders[0];
    let mx = 0;
    for (const R of w.riders) {
      const V = R.V, own = pace * (1 + clamp((lead.V.x - 0.16 * N * R.i - V.x) / N, -0.12, 0.12)); // the followers hold their gap
      let vT = paceFor(C, V.x, own, 0.7 * N, 0.003 * R.i, V.wb, V);
      for (const ft of C.feats) if (ft.whoop && V.x > ft.whoop[0] && V.x < ft.whoop[1]) vT = ft.v * (1 + 0.05 * clamp(f.rel.bassDrive) - 0.02 * R.i);
      V.vxT = vT;
      V.acc = (0.5 + 0.5 * R.gas) * G;
      V.brk = 1.2 * G;
      V.tq = -110 * R.gas;
      R.gas = Math.max(0, R.gas - dt * 1.2);
      ride(V, dt, G, R.g, (V) => plan(V, G, R.g, 0.07));
      if (V.hit > 0.3 * N) puff(w.dust, V.wh[0].hx, V.wh[0].gy, -0.1 * V.vx, -5 * u, 0.8, 1.5, 3, LMID + DIM, 0, R.g);
      if (V.wh[0].on && R.gas > 0.05) roost(w.roost, rnd, V, 2 * emit(rnd, 30, dt), 0.35 * N, rnd() < 0.5 ? MID : DARK);
      mx += V.x;
    }
    w.cam = follow(w.cam + lead.V.vx * dt, lead.V.x - 0.62 * N, dt, 0.5);
    // the stadium: the roof truss and its light banks pulsing on the beat, the stands and their flashbulbs, the wall
    r.rect(0, 0.17 * N, N, 0.47 * N, DARK + DIM);
    for (let y = Math.round(0.19 * N); y < 0.62 * N; y += Math.max(2, Math.round(2 * u))) for (let x = 0; x < N; x += 2) if (hash(Math.floor(x + w.cam * 0.25), y) < 0.32 + 0.25 * f.level) r.buf[y * N + x] = MID + DIM;
    w.flash = w.flash.filter((fl) => (fl[2] -= dt) > 0);
    for (const [fx, fy] of w.flash) { r.rect(fx - u, fy - u, 2 * u, 2 * u, WHITE); r.rect(fx - 2.5 * u, fy, 5 * u, px1(0.5 * u), BRIGHT); }
    r.rect(0, 0.1 * N, N, px1(u), DARK);
    for (let k = 0; k < 6; k++) {
      const lx = ((k + 0.5) * N) / 6 - ((w.cam * 0.05) % (N / 6));
      haze(r, lx, 0.12 * N, (4 + 3 * w.pulse) * u, BRIGHT, 0.25 + 0.45 * w.pulse);
      for (let j = -1; j <= 1; j++) r.rect(lx + j * 2 * u - 0.7 * u, 0.11 * N, 1.4 * u, 1.4 * u, w.pulse > 0.5 ? WHITE : BRIGHT);
    }
    const fo = w.cam * 0.8, pw = 0.2 * N;
    r.rect(0, 0.62 * N, N, 0.05 * N, DARK);
    for (let i = Math.floor(fo / pw), e = Math.ceil((fo + N) / pw); i <= e; i++) r.rect(i * pw - fo + u, 0.63 * N, pw - 2 * u, 0.03 * N, [HOT, COOL, BRIGHT][Math.floor(hash(i, 9) * 3)]);
    r.rect(0, 0.67 * N, N, N - 0.67 * N, DARK + DIM);
    trackDraw(r, N, u, C, w.cam, base, far);
    dust(W, w.dust, w.cam);
    for (const R of w.riders) drawBike(r, R.V, R.V.x - w.cam, R.V.y, kb, { plast: [HOT, COOL, BRIGHT][R.i], kit: [BRIGHT, HOT, COOL][R.i], helm: [COOL, BRIGHT, HOT][R.i], st: 1 });
    fly(W, w.roost, G, (x) => base - cAt(C, x), w.cam);
    targets.push({ x: lead.V.x - w.cam - 8 * kb, y: lead.V.y - 12 * kb, w: 16 * kb, h: 18 * kb });
  },
};

// ---------------------------------------------------------------------------------------------- trials
// A trials rider among the rocks, standing, feet up the whole way: the camera creeps with him over boulders and logs,
// the section's kind by the arousal. At a step too tall to roll he stops and balances; on a kick the engine lifts the
// front (its torque against the weight on the rear tyre) over the edge and sets it down on top, and on the next hit
// he hops the rear up after it, a parabola timed to land on the top. Logs and low steps are bunny hops; ledges he
// rolls off, rear wheel first. On the beat, on the flat, he stalls on the rear wheel at its balance point for a beat.
// A drop lays two boulders with a gap between, and the jump across it.
const TR_W = { slabs: [3, 2, 1], boulders: [2, 2, 2], logs: [1, 2, 3] };
function trNext(w, N, u, rnd) {
  const C = w.C, L = w.lv, k = w.kind;
  if (w.gapQ) { // two boulders and the gap between them, the far one a little higher
    w.gapQ = false;
    const up = (7 + 3 * rnd()) * u, D = (14 + 6 * rnd()) * u;
    lay(C, 10 * u, () => L);
    C.feats.push({ type: 'step', x: C.end, h: up });
    lay(C, 1.5 * u, (q) => L + up * Math.sin((q * Math.PI) / 2));
    lay(C, 24 * u, () => L + up);
    C.feats.push({ type: 'gap', x: C.end, x1: C.end + Math.round(D), top: L + up + 2 * u });
    lay(C, D, () => L - 0.4 * N);
    lay(C, 30 * u, () => L + up + 2 * u);
    w.lv = L + up + 2 * u;
    return;
  }
  const r0 = rnd();
  lay(C, (8 + 12 * rnd()) * u, () => L);
  if ((k === 'logs' && r0 < 0.6) || r0 < 0.15) { // a log across the way
    const rr = (2.4 + 1.4 * rnd()) * u;
    C.feats.push({ type: 'log', x: C.end, h: 2 * rr });
    lay(C, 2 * rr, (q, i) => L + Math.sqrt(Math.max(0, rr * rr - (i + 0.5 - rr) ** 2)));
  } else if (L > 0.1 * N || (L > 0 && r0 > 0.8)) { // a ledge down
    const dn = Math.min(L, (4 + 6 * rnd()) * u);
    C.feats.push({ type: 'ledge', x: C.end, h: dn });
    lay(C, 1.2 * u, (q) => L - dn * q * q);
    w.lv = L - dn;
  } else { // a step up onto a boulder, or a slab ramped up
    const up = k === 'slabs' ? (4 + 4 * rnd()) * u : (4 + 2.5 * rnd()) * u, slab = k === 'slabs' && r0 > 0.45;
    if (!slab) C.feats.push({ type: 'step', x: C.end, h: up });
    lay(C, (slab ? 2.2 * up / u : 1.5) * u, (q) => L + up * (slab ? q : Math.sin((q * Math.PI) / 2)));
    w.lv = L + up;
  }
}
const trials = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, TR_W, bandOf(W.a)), N: 0, C: null, R: null, cam: 0, lv: 0, gapQ: false, dust: [], flags: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, G = GV * N, base = 0.8 * N, kb = 1.05 * u, bps = bpsOf(f);
    if (w.N !== N) {
      w.N = N;
      w.C = course(Math.ceil(5 * N));
      w.lv = 0;
      lay(w.C, 0.5 * N, () => 0);
      w.dust.length = 0;
      const V = bikeRig(kb, 0.3 * N, G);
      V.hold = 0.5;
      V.pop = 0;
      w.R = { V, mv: 'ride', t: 0, ft: null, cool: 2 };
      place(V, G, (x) => base - cAt(w.C, x));
      w.cam = 0;
    }
    const C = w.C, R = w.R, V = R.V, g = (x) => base - cAt(C, x), hw = V.wb / 2;
    if (f.section === 'change') w.kind = rollW(rnd, TR_W, bandOf(W.a));
    if (f.section === 'drop') w.gapQ = true;
    while (C.end < w.cam + 2 * N) trNext(w, N, u, rnd);
    if (C.feats.length > 10) C.feats = C.feats.filter((ft) => (ft.x1 || ft.x) > w.cam - 0.5 * N);
    const kick = kickOf(hits) > 0.3, hit = kick || snareOf(hits), fx = V.wh[1].hx;
    let nx = null; // the next thing ahead of the front tyre
    for (const ft of C.feats) if (ft.x > fx - V.R && ft !== R.ft && (!nx || ft.x < nx.x)) nx = ft;
    const hop = (xt, yt, T) => { V.vx = V.vxT = (xt - V.x) / T; V.vy = (yt - V.y - 0.5 * G * T * T) / T; R.mv = 'air'; R.t = 0; };
    const restY = (h) => base - h - V.L0 - V.R + G / (2 * V.k); // the middle's height at rest on a top of height h
    const pace = N * (0.1 + 0.08 * clamp(f.rel.bassDrive));
    let tq = 0;
    R.t += dt;
    R.cool -= dt * bps; // beats till the next stall
    switch (R.mv) {
      case 'ride':
        V.vxT = pace;
        V.wl = 0.4;
        if (nx && !V.air) {
          const dx = nx.x - fx;
          if (nx.type === 'step' && nx.h > 0.9 * V.R && dx < V.R + 0.6 * u) { R.mv = 'wait'; R.t = 0; R.ft = nx; }
          else if ((nx.type === 'log' || nx.type === 'step') && dx < 1.5 * V.R) { R.ft = nx; hop(V.x + 2.2 * V.R + nx.h * 0.5, Math.min(V.y, restY(cAt(C, nx.x + nx.h)) ) - nx.h * 0.4, 0.4); }
          else if (nx.type === 'gap' && dx < 0.5 * V.R) { R.ft = nx; hop(nx.x1 + hw + 3 * u, restY(nx.top), 0.55); }
          else if (nx.type === 'ledge' && dx < 0.3 * V.R) { R.ft = nx; V.vy = -0.12 * N; V.vx = V.vxT = 1.4 * pace; R.mv = 'air'; R.t = 0; } // off a ledge: a little hop so it lands rear first
        }
        if (f.beat.on && R.cool <= 0 && !V.air && (!nx || nx.x - fx > 2.4 * hw) && Math.abs(V.a) < 0.15) { R.mv = 'stall'; R.t = 0; R.cool = 6; }
        break;
      case 'wait': // a trackstand at the foot of the step, then the front up on a kick (or after a while)
        V.vxT = 0;
        if ((kick && R.t > 0.25) || R.t > 2 / bps) { R.mv = 'front'; R.t = 0; }
        break;
      case 'front': // the front lifted by the engine (no higher than it takes), the rear creeping in, till the front tyre is over the top
        V.vxT = 0.05 * N;
        V.wref = 0;
        V.vam = 3;
        V.wl = clamp(Math.asin(Math.min(1, (R.ft.h + 1.5 * u) / V.wb)) + 0.1, 0.3, 0.85);
        tq = -260;
        if ((V.wh[1].hy + V.R < base - R.ft.h - cAt(C, R.ft.x - V.R) - 1.5 * u && fx > R.ft.x + 0.4 * V.R) || R.t > 1.5) { R.mv = 'set'; R.t = 0; }
        break;
      case 'set': // the front let down onto the top
        V.vxT = 0.03 * N;
        if ((V.wh[1].on && fx > R.ft.x) || R.t > 1) { R.mv = 'perch'; R.t = 0; }
        break;
      case 'perch': // perched across the edge; the rear hops up after it on the next hit
        V.vxT = 0;
        if ((hit && R.t > 0.2) || R.t > 1 / bps) hop(R.ft.x + hw + 2 * u, restY(cAt(C, R.ft.x + hw + 2 * u)) - 1.5 * u, 0.38);
        break;
      case 'stall': // up on the rear wheel to its balance point, held for a beat
        V.vxT = 0;
        V.wref = 0;
        V.wl = 0.95;
        tq = R.t < 60 / Math.max(60, f.bpm || 120) ? -240 : 0;
        if (R.t > 1.5 * (60 / Math.max(60, f.bpm || 120))) { R.mv = 'ride'; R.t = 0; V.wref = null; }
        break;
      default: // in the air: hold the speed of the hop till the wheels are down
        V.vxT = V.vx;
        V.wref = null;
        V.vam = 6;
        if (!V.air && R.t > 0.1) { R.mv = 'ride'; R.t = 0; }
    }
    V.tq = tq;
    V.acc = V.brk = 0.8 * G;
    ride(V, dt, G, g, (V) => plan(V, G, g, 0.12));
    if (V.hit > 0.2 * N) { puff(w.dust, V.wh[0].hx, V.wh[0].gy, 0, -5 * u, 0.9, 1.5, 3, LMID + DIM, 0, g); if (V.hit > 0.5 * N) s.shake = Math.max(s.shake, 0.15); }
    w.cam = follow(w.cam, V.x - 0.4 * N, dt, 0.6);
    const cam = w.cam;
    // the mountains, the pines, the rocks with their cracks, the section's tape on its stakes
    ridge(r, cam * 0.1, 0.38 * N, 0.08 * N, 0.012 / u, N, LMID + DIM);
    for (let x = 0; x < N; x++) { const q = x + cam * 0.35, y = 0.6 * N - 0.04 * N * Math.abs(((q / (5 * u)) % 2) - 1) - 0.03 * N * hash(Math.floor(q / (5 * u)), 3); vcol(r, x, y, N, COOL + DIM); }
    for (let x = 0; x < N; x++) {
      const wx = x + cam, y = g(wx), wi = Math.floor(wx);
      vcol(r, x, y, N, MID);
      vcol(r, x, y, y + px1(u), LMID);
      if (hash(wi, 5) < 0.06) vcol(r, x, y + 2 * u, y + (3 + 5 * hash(wi, 6)) * u, DARK);
    }
    for (const ft of C.feats) if (ft.type === 'log') { const cx = ft.x + ft.h / 2 - cam, cy = g(ft.x + ft.h / 2) + ft.h / 2; r.ring(cx, cy, ft.h * 0.32, px1(0.8 * u), LMID); r.disc(cx, cy, ft.h * 0.12, DARK); }
    for (let i = Math.floor(cam / (0.45 * N)), e = Math.ceil((cam + N) / (0.45 * N)); i <= e; i++) {
      const sx = i * 0.45 * N + 0.2 * N * hash(i, 1), x = sx - cam, y = g(sx);
      r.rect(x, y - 7 * u, px1(0.6 * u), 7 * u, DARK);
      r.rect(x, y - 7 * u, 2.6 * u, 1.6 * u, hash(i, 2) < 0.5 ? HOT : COOL);
    }
    dust(W, w.dust, cam);
    drawBike(r, V, V.x - cam, V.y, kb, { plast: COOL, kit: HOT, helm: BRIGHT, st: 1 });
    targets.push({ x: V.x - cam - 8 * kb, y: V.y - 12 * kb, w: 16 * kb, h: 18 * kb });
  },
};

// ---------------------------------------------------------------------------------------------- enduro
// A forest single-track, the camera riding along: roots and rocks under the wheels, each soaked by its spring; mud
// where the trail is wet, flicked off the tread (let go off the rim at the tread's own speed) and roosted off the back
// under power; branches whipping past in front, the trunks behind slower, the far wood slower still. The pace follows
// the bass, a kick is the throttle, a snare whips a branch past, the rider gets up on the pegs on the beat. A drop is
// a hill climb: the rear wheel spinning and roosting, the speed bleeding off up the slope (gravity against the drive);
// he crests it, or stalls with the front coming up and slides back down, brakes, rolls back for a longer run and tries
// it again faster.
const EN_W = { roots: [3, 2, 1], rocks: [2, 2, 2], mud: [1, 2, 3] };
function enNext(w, N, u, rnd) {
  const C = w.C, k = w.kind;
  if (w.hillQ) { // the climb: a smooth foot, a straight slope at 38 degrees, a rounded crest, and down the far side
    w.hillQ = false;
    const H = 0.3 * N, a = 0.12, Lh = H / (Math.tan(0.66) * (1 - a)), sm = (q) => (q < a ? (q * q) / (2 * a * (1 - a)) : q > 1 - a ? 1 - (1 - q) ** 2 / (2 * a * (1 - a)) : (q - a / 2) / (1 - a));
    lay(C, 0.3 * N, () => 0);
    const x0 = C.end;
    lay(C, Lh, (q) => H * sm(q));
    C.feats.push({ hill: [x0, C.end], end: C.end + N });
    lay(C, 0.12 * N, () => H);
    lay(C, 1.2 * N, (q) => H * (1 - sm(q)));
    return;
  }
  const len = Math.round((0.3 + 0.3 * rnd()) * N), ph = rnd() * TAU, mud = k === 'mud' ? rnd() < 0.7 : rnd() < 0.25, bw = Math.max(2, Math.round(3 * u));
  lay(C, len, (q, i) => {
    let hh = 2 * u * Math.sin(ph + (i / len) * TAU) ** 2; // the trail's own rolls
    // here and there a root across or a stone: a rounded bump a few cells wide, for a tyre to roll over
    const c = (Math.floor(i / bw) * 7919) % 97, b = Math.sin((Math.PI * ((i % bw) + 0.5)) / bw);
    if (k === 'roots' && c < 9) hh += 1.3 * u * b;
    if (k === 'rocks' && c < 18) hh += 2.4 * u * b * (0.4 + (0.6 * c) / 17);
    return hh;
  }, (q) => (mud && q > 0.2 && q < 0.85 ? 1 : 0));
}
const enduro = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, EN_W, bandOf(W.a)), N: 0, C: null, riders: [], cam: 0, hillQ: false, roost: [], mud: [], br: [], brT: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, G = GV * N, base = 0.84 * N, kb = 0.9 * u, n = bandOf(W.a) === 2 ? 2 : 1;
    if (w.N !== N) {
      w.N = N;
      w.C = course(Math.ceil(6 * N));
      w.cam = 0;
      w.roost.length = w.mud.length = w.br.length = 0;
      lay(w.C, 0.6 * N, () => 0);
      w.riders = Array.from({ length: n }, (_, i) => { const V = bikeRig(kb, (0.45 - 0.22 * i) * N, G); place(V, G, (x) => base - cAt(w.C, x)); return { V, i, gas: 0, hill: null, vs: 0, wait: 0, boost: 1, foot: 0, run: false, st: 0.4 }; });
    }
    const C = w.C, g = (x) => base - cAt(C, x), lead = w.riders[0];
    if (f.section === 'change') w.kind = rollW(rnd, EN_W, bandOf(W.a));
    if (f.section === 'drop') w.hillQ = true;
    while (C.end < w.cam + 2.4 * N) enNext(w, N, u, rnd);
    if (C.feats.length > 8) C.feats = C.feats.filter((ft) => ft.end > w.cam - N);
    const kick = kickOf(hits);
    if (kick) for (const R of w.riders) R.gas = Math.max(R.gas, 0.3 + 0.5 * kick);
    if (snareOf(hits) || (w.brT -= dt) < 0) { w.brT = 0.6 + rnd() * 1.4; w.br.push({ x: w.cam * 1.6 + N * (1.05 + 0.2 * rnd()), top: rnd() < 0.6, len: (0.25 + 0.3 * rnd()) * N, a: (rnd() - 0.5) * 0.8, ph: rnd() * TAU }); }
    const pace = N * (0.42 + 0.1 * bandOf(W.a) + 0.14 * clamp(f.rel.bassDrive));
    for (const R of w.riders) {
      const V = R.V, sl = (cAt(C, V.x + 1) - cAt(C, V.x - 1)) / 2, cs = Math.sqrt(1 + sl * sl);
      let hill = null;
      for (const ft of C.feats) if (ft.hill && V.x > ft.hill[0] - 2 && V.x < ft.hill[1]) hill = ft;
      V.tq = -90 * R.gas;
      V.slip = 0;
      if (R.wait > 0) { R.wait -= dt; V.vxT = 0; V.acc = V.brk = 1.2 * G; } // at the foot again, braked to a stop, catching his breath
      else if (hill || R.vs < 0) { // the climb: along the slope the drive pushes, gravity pulls back
        if (!R.hill) { R.hill = hill; R.vs = V.vx * cs; R.boost = 1; R.run = false; }
        if (R.vs >= 0) {
          R.vs += ((V.wh[0].on ? 0.5 + 0.1 * R.gas : 0) * G - (G * sl) / cs) * dt;
          if (R.vs < 0.1 * N) { V.tq = -170; V.wl = 0.6; } // stalling: the front comes up
          V.slip = 14;
        } else R.vs = Math.max(R.vs + ((-G * sl) / cs + (0.45 * G) / cs) * dt, -0.32 * N); // sliding back on the brakes
        V.vxT = R.vs / cs;
        V.acc = V.brk = 20 * G;
        if (V.x > R.hill.hill[1]) { R.hill = null; R.vs = 0; }
        else if (R.vs < 0 && V.x < R.hill.hill[0] - 0.12 * N) { R.foot = R.hill.hill[0]; R.hill = null; R.vs = 0; R.wait = 0.7; R.boost = 1.4; } // back at the foot
      } else {
        // the next try: roll back for a longer run, then at it faster
        if (R.boost > 1 && !R.run && V.x < R.foot - 0.35 * N) R.run = true;
        V.vxT = R.boost > 1 && !R.run ? -0.2 * N : (R.i ? pace * (1 + clamp((lead.V.x - 0.25 * N - V.x) / N, -0.2, 0.2)) : pace) * R.boost;
        V.acc = (0.5 + 0.5 * R.gas) * G;
        V.brk = 1.2 * G;
        V.wl = 0.4;
      }
      R.gas = Math.max(0, R.gas - dt * 1.2);
      ride(V, dt, G, g, (V) => plan(V, G, g, 0.1));
      R.st = follow(R.st, f.beat.pulse > 0.5 || R.hill ? 1 : 0.35, dt, 0.08);
      // the mud: off the tread at the rim's speed (tangent to the tyre, the hub's speed added), and roosted off the back
      const wet = cAt(C, V.x, C.k) > 0.5;
      for (const wh of V.wh) if ((wet || V.slip) && wh.on) for (let k = emit(rnd, wet ? 30 : 12, dt); k > 0; k--) {
        const an = Math.PI + rnd() * (Math.PI / 2), cx = wh.hx + Math.cos(an) * V.R, cy = wh.hy + Math.sin(an) * V.R, ws = wh.w * V.R;
        w.mud.push({ x: cx, y: cy, vx: V.vx - Math.sin(an) * ws, vy: V.vy + Math.cos(an) * ws, life: 1, s: 1, c: wet ? DARK : MID });
      }
      if (V.wh[0].on && (R.gas > 0.1 || V.slip)) roost(w.roost, rnd, V, 2 * emit(rnd, 30, dt), 0.3 * N, wet ? DARK : MID);
    }
    if (w.mud.length > 220) w.mud.splice(0, w.mud.length - 220);
    w.cam = follow(w.cam + lead.V.vx * dt, lead.V.x - 0.42 * N, dt, 0.5);
    const cam = w.cam;
    // the far wood, the trunks nearer, the trail with its mud, then the branches nearest of all
    ridge(r, cam * 0.15, 0.3 * N, 0.04 * N, 0.05 / u, N, COOL + DIM);
    for (let x = 0; x < N; x++) { const q = x + cam * 0.3, y = 0.42 * N - 0.06 * N * Math.abs(((q / (4 * u)) % 2) - 1); vcol(r, x, y, N, DARK + DIM); }
    const tw = 0.21 * N, to = cam * 0.6;
    for (let i = Math.floor(to / tw), e = Math.ceil((to + N) / tw); i <= e; i++) { const x = i * tw - to + hash(i, 4) * 0.1 * N, wd = (2 + 3 * hash(i, 5)) * u; r.rect(x, 0, wd, base - 0.04 * N, DARK); r.rect(x + wd * 0.3, 0, px1(0.5 * u), base - 0.04 * N, MID + DIM); }
    for (let x = 0; x < N; x++) {
      const wx = x + cam, y = g(wx), wet = cAt(C, wx, C.k) > 0.5;
      vcol(r, x, y, N, wet ? DARK : MID);
      vcol(r, x, y, y + px1(u), wet ? MID : LMID);
      if (hash(Math.floor(wx), 2) < 0.08) vcol(r, x, y + 2 * u, y + 3 * u, DARK);
    }
    for (const R of w.riders) drawBike(r, R.V, R.V.x - cam, R.V.y, kb, { plast: R.i ? COOL : HOT, kit: R.i ? HOT : COOL, helm: BRIGHT, st: R.st });
    fly(W, w.roost, G, g, cam);
    fly(W, w.mud, G, g, cam);
    w.br = w.br.filter((b) => b.x - cam * 1.6 > -0.6 * N);
    for (const b of w.br) { // a branch: a bough from off the edge, twigs and a fringe of leaves, swaying
      const x0 = b.x - cam * 1.6, y0 = b.top ? -2 * u : N + 2 * u, dir = b.top ? 1 : -1, an = b.a + 0.15 * Math.sin(t * 3 + b.ph);
      const x1 = x0 + Math.sin(an) * b.len * 0.5, y1 = y0 + dir * Math.cos(an) * b.len;
      r.stroke(x0, y0, x1, y1, px1(2.5 * u), FIG);
      for (let k = 1; k < 5; k++) { const q = k / 5, bx = x0 + (x1 - x0) * q, by = y0 + (y1 - y0) * q, l = (1 - q) * 0.12 * N; r.stroke(bx, by, bx + l * (k % 2 ? 1 : -1), by + dir * l * 0.6, px1(u), FIG); ell(r, bx + l * (k % 2 ? 1 : -1), by + dir * l * 0.6, 2.4 * u, 1.6 * u, COOL + DIM); }
    }
    targets.push({ x: lead.V.x - cam - 8 * kb, y: lead.V.y - 12 * kb, w: 16 * kb, h: 18 * kb });
  },
};

// ---------------------------------------------------------------------------------------------- rally raid
// A rally raid across the dunes, the camera with the bike, a truck behind it on the same line: up each long windward
// side, eased off over the crest to the speed that puts the landing on the slip face (at the slope sand rests at, steep
// enough to take it), a plume of sand behind each drifting downwind (the way the dunes face), the low sun on the side
// the windward faces turn to, heat shimmer bending the rows near the horizon, and the navigation roll on the bars up
// close in its box (plain lines and arrow marks, nothing to read), turned a line on every beat. The pace follows the
// bass, a kick is a burst of throttle (the plume thickens), a snare flashes the truck's lamps. A drop lays a big crest,
// sharp enough, taken flat out, to throw them a long way.
const DR_W = { erg: [3, 2, 1], chain: [1, 2, 2], crests: [0, 1, 3] };
// a kind's dunes: length and height (u), the windward slope at the crest
const DR_K = { erg: [150, 14, 0.18], chain: [100, 16, 0.3], crests: [110, 18, 0.45] };
function drNext(w, N, u, rnd, G) {
  const C = w.C, [L0, H0, top] = DR_K[w.kind], big = w.bigQ, e = 0.8 + 0.4 * rnd();
  w.bigQ = false;
  const H = (big ? 1.8 : 1) * H0 * u * e, Lw = (big ? 1.2 : 1) * L0 * u * e, sl = big ? 0.75 : top, p = Math.max(1.2, (sl * Lw) / H), Lf = H / 0.62;
  lay(C, Lw, (q) => H * q ** p); // the windward side, its slope sl at the crest
  // the speed over the crest whose parabola (off the windward slope s0) comes down 0.6 of the way down the slip face
  const s0 = (p * H) / Lw, xL = 0.6 * Lf, dL = H * (1 - 0.4 ** 1.15);
  C.feats.push({ crest: C.end, end: C.end + Lf, v: big ? 0 : Math.sqrt((G * xL * xL) / (2 * (dL + s0 * xL))) });
  lay(C, Lf, (q) => H * (1 - q) ** 1.15); // the slip face, at the angle of repose
  lay(C, (0.05 + 0.15 * rnd()) * N, () => 0);
}
const desertrally = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, DR_W, bandOf(W.a)), N: 0, C: null, bike: null, truck: null, cam: 0, bigQ: false, plume: [], roost: [], rb: 0, rbT: 0, tickT: 0, lamp: 0, gas: 0, row: null, marks: Array.from({ length: 16 }, () => [rnd(), rnd() < 0.5 ? -1 : 1, rnd()]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, G = GV * N, base = 0.88 * N, hz = 0.5 * N, kb = 0.8 * u, kt = 0.75 * u;
    if (w.N !== N) {
      w.N = N;
      w.C = course(Math.ceil(6 * N));
      w.cam = 0;
      w.plume.length = w.roost.length = 0;
      lay(w.C, 0.7 * N, () => 0);
      w.row = new Uint8Array(N);
      const g = (x) => base - cAt(w.C, x);
      w.bike = { V: bikeRig(kb, 0.5 * N, G) };
      w.truck = { V: truckRig('rally', kt, 0.16 * N, G, 2.4) };
      place(w.bike.V, G, g);
      place(w.truck.V, G, g);
    }
    const C = w.C, g = (x) => base - cAt(C, x), B = w.bike.V, T = w.truck.V;
    if (f.section === 'change') w.kind = rollW(rnd, DR_W, bandOf(W.a));
    if (f.section === 'drop') w.bigQ = true;
    while (C.end < w.cam + 2.4 * N) drNext(w, N, u, rnd, G);
    if (C.feats.length > 10) C.feats = C.feats.filter((ft) => ft.end > w.cam - N);
    const kick = kickOf(hits);
    if (kick) w.gas = Math.max(w.gas, 0.4 + 0.5 * kick);
    if (snareOf(hits)) w.lamp = 0.25;
    w.lamp -= dt;
    if (tick(w, f, dt)) w.rbT++; // the roll turns a line on the beat
    w.rb = follow(w.rb, w.rbT, dt, 0.08);
    const pace = N * (0.6 + 0.08 * bandOf(W.a) + 0.15 * clamp(f.rel.bassDrive));
    const nearCrest = (V) => C.feats.some((ft) => ft.crest && Math.abs(ft.crest - V.x) < 1.5 * V.wb);
    // over the next crest (till it is well off it) no faster than its slip face takes
    const crestV = (V, v) => { for (const ft of C.feats) if (ft.v && ft.crest > V.x - V.wb && ft.crest - V.x < 0.3 * N) v = Math.min(v, ft.v); return v; };
    B.vxT = crestV(B, pace * (1 + 0.15 * w.gas));
    B.acc = (0.5 + 0.5 * w.gas) * G;
    B.brk = G;
    B.tq = -80 * w.gas;
    B.pop = nearCrest(B) ? 1 : 0;
    T.vxT = crestV(T, pace * (1 + clamp((B.x - 0.36 * N - T.x) / N, -0.25, 0.25)));
    T.acc = 0.5 * G;
    T.brk = G;
    T.pop = nearCrest(T) ? 1 : 0;
    w.gas = Math.max(0, w.gas - dt);
    for (const V of [B, T]) {
      ride(V, dt, G, g, (V) => plan(V, G, g, 0.06));
      if (V.hit > 0.3 * N) for (let k = 0; k < 3; k++) puff(w.plume, V.wh[0].hx, V.wh[0].gy, -0.1 * V.vx, -6 * u * rnd(), 2.2, 3, 7, LMID, 0, g);
      if (V.wh[0].on) for (let k = emit(rnd, 6 + 10 * w.gas, dt); k > 0; k--) puff(w.plume, V.wh[0].hx - V.R, V.wh[0].gy - V.R * 0.5, -0.25 * V.vx, -4 * u, 2.4, 2, 6 + 4 * w.gas, LMID + (rnd() < 0.5 ? DIM : 0), 0, g);
      if (V.wh[0].on) roost(w.roost, rnd, V, emit(rnd, 25, dt), 0.3 * N, MID);
    }
    w.cam = follow(w.cam + B.vx * dt, B.x - 0.55 * N, dt, 0.5);
    const cam = w.cam;
    // the low sun, cut by bands of the sky; the far dunes and the nearer ones; the heat bending the rows over the sand
    const sx = 0.26 * N, sy = hz - 0.07 * N, sr = 0.11 * N; // low on the left: the light that lights the windward faces, which face left
    haze(r, sx, sy, sr * 1.8, BRIGHT, 0.35);
    r.disc(sx, sy, sr, HOT);
    for (let k = 0; k < 4; k++) r.rect(sx - sr, sy + sr * (0.2 + k * 0.2), 2 * sr, px1(u * (0.5 + k * 0.4)), BG);
    ridge(r, cam * 0.08, hz, 0.035 * N, 0.012 / u, N, MID + DIM);
    ridge(r, cam * 0.25, hz + 0.08 * N, 0.05 * N, 0.018 / u, N, LMID + DIM, 1.3);
    const row = w.row, amp = (0.6 + 1.6 * f.level) * u;
    for (let y = Math.round(hz - 0.06 * N); y < hz + 0.04 * N; y++) {
      const dx = Math.round(Math.sin(t * 7 + y * 0.9) * amp * (1 - Math.abs(y - hz) / (0.07 * N)));
      if (!dx || y < 0 || y >= N) continue;
      row.set(r.buf.subarray(y * N, y * N + N));
      for (let x = 0; x < N; x++) r.buf[y * N + x] = row[Math.min(N - 1, Math.max(0, x - dx))];
    }
    // the dunes: the windward sides lit, the slip faces in their shade, wind ripples on the lit sides
    for (let x = 0; x < N; x++) {
      const wx = x + cam, h0 = cAt(C, wx), y = base - h0, lee = cAt(C, wx + 1) < h0 - 0.05;
      vcol(r, x, y, N, lee ? MID : LMID);
      vcol(r, x, y, y + px1(u), lee ? LMID : BRIGHT);
      if (!lee && (Math.floor(wx / (3 * u)) + Math.floor(y / (2 * u))) % 5 === 0) vcol(r, x, y + 2 * u, y + 2.6 * u, MID + DIM);
    }
    dust(W, w.plume, cam, 0.04 * N); // the wind that built the dunes blows up their windward sides and over: to the right
    drawTruck(r, T, T.x - cam, T.y, kt, { style: 'rally', col: HOT, box: LMID, D: [0.8 * u, -1.2 * u], lights: w.lamp > 0 || f.beat.pulse > 0.7 });
    drawBike(r, B, B.x - cam, B.y, kb, { plast: COOL, kit: BRIGHT, helm: HOT, st: 1 });
    const bars = [B.x - cam + 2.6 * kb, B.y - 5.6 * kb];
    r.rect(bars[0] - kb, bars[1] - 1.5 * kb, 2 * kb, 1.2 * kb, BRIGHT); // the roll on the bars
    fly(W, w.roost, G, g, cam);
    // the roll up close: lines, a tulip mark for each (a dot, a stem, a turn), the column rule
    const bx = 2 * u, by = 2 * u, bw = 0.26 * N, bh = 0.17 * N, lh = 3.2 * u, fr = w.rb % 1;
    r.rect(bx - u, by - u, bw + 2 * u, bh + 2 * u, DARK);
    r.rect(bx, by, bw, bh, BRIGHT);
    for (let k = -1; k * lh < bh + lh; k++) {
      const y = by + (k + 1 - fr) * lh, m = w.marks[(((k + Math.floor(w.rb)) % 16) + 16) % 16];
      if (y < by || y > by + bh - u) continue;
      r.rect(bx + u, y, bw - 2 * u, px1(0.4 * u), MID);
      if (y + lh * 0.8 < by + bh) {
        const mx0 = bx + 0.2 * bw, my0 = y + lh * 0.75;
        r.rect(mx0 - 0.5 * u, my0 - 0.5 * u, px1(u), px1(u), FIG);
        r.line(mx0, my0, mx0, my0 - lh * 0.55, FIG);
        r.line(mx0, my0 - lh * 0.55, mx0 + m[1] * (1 + 2 * m[0]) * u, my0 - lh * 0.6, HOT);
        r.rect(bx + 0.42 * bw, y + lh * 0.45, (0.2 + 0.35 * m[2]) * bw, px1(0.5 * u), DARK + DIM);
      }
    }
    r.rect(bx + 0.36 * bw, by, px1(0.4 * u), bh, MID);
    targets.push({ x: B.x - cam - 8 * kb, y: B.y - 12 * kb, w: 16 * kb, h: 18 * kb });
  },
};

// ---------------------------------------------------------------------------------------------- monster trucks
// An arena of dirt, the camera on the truck: a ramp, a row of old cars, a landing, the crowd beyond. On huge tyres
// and long-travel springs the truck takes the ramp at the speed the jump was built for and flies the cars on a
// parabola, the springs bottoming out as it lands; it turns round at the end and comes back slowly over the roofs,
// crushing them (a roof gives under a tyre loading it past what it holds, and stays down). Kicks are wheelies on the
// flat, the tyres throw clods, the crowd bobs and the lights flash on the beat. A drop: the next jump is a backflip,
// turned at what is left of 2π over what is left of the air, round before the landing.
const MT_W = { cars: [3, 2, 1], bus: [1, 2, 2], stack: [0, 1, 3] };
function mtArena(N, G, kind, kt) {
  const Lc = Math.ceil(2.3 * N), h = new Float32Array(Lc + 1), h1 = (kind === 'stack' ? 0.13 : 0.1) * N, up = Math.round(h1 / (0.6 * 0.9)), k0 = 0.42 * N, v = (kind === 'cars' ? 0.92 : 0.98) * N;
  const { gap, s, len } = flight(G, v, h1, up, h1, 0.03 * N, truckB('monster', kt)), lip = k0 + up, crest = lip + gap;
  const cars = [], n = kind === 'bus' ? 1 : 3, cl = kind === 'bus' ? 0.34 * N : 0.13 * N, ch = kind === 'bus' ? 0.08 * N : kind === 'stack' ? 0.1 * N : 0.06 * N;
  // the back faces of the ramp and the landing, so the truck can drive back over them: as long as the room beside the
  // cars allows, about 45 degrees at their steepest (a truck rolls down that; off a steeper one it would fall)
  const bk = Math.max(0.8 * h1, Math.min(1.6 * h1, (gap - n * cl) / 2));
  for (let x = 0; x <= Lc; x++) h[x] = x >= k0 && x <= lip ? kickH(x - k0, h1, up) : x > lip && x < lip + bk ? h1 * 0.5 * (1 + Math.cos((Math.PI * (x - lip)) / bk)) : x > crest - bk && x < crest ? h1 * 0.5 * (1 - Math.cos((Math.PI * (x - crest + bk)) / bk)) : x >= crest && x < crest + len ? landH(x - crest, h1, s) : 0;
  for (let i = 0; i < n; i++) { const x0 = lip + (gap - n * cl) / 2 + i * cl + 0.005 * N; cars.push({ x0, x1: x0 + cl - 0.01 * N, h: ch, crush: 0, c: [COOL, LMID, HOT][i % 3], stack: kind === 'stack' }); }
  return { h, Lc, lip, crest, end: crest + len, v, cars };
}
// a car's height at x: the body, the cabin with its sloped glass; crushed, both come down
function carH(c, x) {
  if (x < c.x0 || x > c.x1) return 0;
  const q = (x - c.x0) / (c.x1 - c.x0), k = 1 - 0.55 * Math.min(1, c.crush), body = 0.5 * c.h * Math.min(1, q / 0.1, (1 - q) / 0.1), cab = q < 0.25 || q > 0.75 ? 0 : q < 0.35 ? (q - 0.25) / 0.1 : q > 0.65 ? (0.75 - q) / 0.1 : 1;
  return k * (body + (c.h - 0.5 * c.h) * cab); // the bumpers round the ends, the cabin's glass sloped
}
const monstertruck = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, MT_W, bandOf(W.a)), N: 0, A: null, V: null, ph: 'run', pt: 0, dir: 1, cam: 0, clods: [], dust: [], flipQ: false, flip: false, wheelie: 0, flash: 0, idle: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, G = GV * N, base = 0.88 * N, kt = 0.9 * u, bps = bpsOf(f);
    const ground = (x) => { let hh = w.A ? (x <= 0 ? 0 : x >= w.A.Lc ? 0 : w.A.h[x | 0] + (w.A.h[Math.min(w.A.Lc, (x | 0) + 1)] - w.A.h[x | 0]) * (x - (x | 0))) : 0; if (w.A) for (const c of w.A.cars) hh = Math.max(hh, carH(c, x)); return hh; };
    const g = (x) => base - ground(x);
    if (w.N !== N) {
      w.N = N;
      w.A = mtArena(N, G, w.kind, kt);
      w.V = truckRig('monster', kt, 0.15 * N, G, 2.6);
      place(w.V, G, g);
      w.P = truckRig('monster', kt, w.A.Lc - 0.12 * N, G, 2.6); // the other truck, parked at the far end, its turn next
      place(w.P, G, g);
      w.ph = 'wait'; w.dir = 1; w.pt = 0; w.cam = 0;
      w.clods.length = w.dust.length = 0;
    }
    const A = w.A, V = w.V, kick = kickOf(hits);
    // a new show (new cars) only while the truck is back at the start
    if (f.section === 'change') { w.kind = rollW(rnd, MT_W, bandOf(W.a)); w.renew = true; }
    if (f.section === 'drop') w.flipQ = true;
    if (snareOf(hits)) for (const wh of V.wh) if (wh.on && wh.lz < 0) for (let k = 0; k < 4; k++) w.clods.push({ x: wh.hx, y: wh.gy - V.R * 0.3, vx: -w.dir * (0.1 + 0.2 * rnd()) * N + V.vx * 0.3, vy: -(0.25 + 0.35 * rnd()) * N, life: 2, s: 1.8, c: rnd() < 0.5 ? MID : DARK });
    if (f.beat.on) w.flash = 1;
    w.flash *= Math.exp(-dt * 6);
    w.pt += dt;
    const flat = V.x < A.lip - 0.25 * N || V.x > A.end + 0.05 * N;
    if (kick > 0.3 && flat && !V.air && (w.ph === 'brake' || w.ph === 'wait')) w.wheelie = 0.6;
    w.wheelie -= dt;
    if (w.ph === 'run') w.wheelie = 0;
    let vT = 0, tq = 0;
    switch (w.ph) {
      case 'run': vT = A.v; if (V.x > A.end + 0.1 * N && !V.air) { w.ph = 'brake'; w.pt = 0; } break;
      case 'brake': vT = 0; if (Math.abs(V.vx) < 0.02 * N && w.pt > 0.4) { w.ph = 'turn'; w.pt = 0; } break;
      case 'turn': vT = 0; if (w.pt > 0.8) { w.dir = -w.dir; w.ph = w.dir < 0 ? 'back' : 'wait'; w.pt = 0; } break; // a spin round on the spot
      case 'back': vT = -0.2 * N; if (V.x < 0.18 * N) { w.ph = 'brake'; w.pt = 0; } break; // slowly back over the roofs
      default: // at the start, facing the ramp: a new row of cars if it is time, then go on a kick (or after a bar)
        vT = 0;
        if (w.renew) { w.renew = false; w.A = mtArena(N, G, w.kind, kt); }
        if ((kick > 0.4 && w.pt > 0.8) || w.pt > 4 / bps) { w.ph = 'run'; w.pt = 0; w.flip = w.flipQ; w.flipQ = false; }
    }
    if (w.ph === 'brake' && w.dir < 0 && w.pt > 0.4 && Math.abs(V.vx) < 0.02 * N) { w.ph = 'turn'; w.pt = 0; }
    if (w.wheelie > 0) tq = -w.dir * 220;
    V.vxT = vT;
    V.acc = 0.6 * G;
    V.brk = 0.9 * G;
    V.tq = tq;
    V.wl = 0.55;
    V.face = w.dir;
    V.pop = w.ph === 'run' && Math.abs(V.x - A.lip) < 2 * V.wb ? 1 : 0;
    ride(V, dt, G, g, (V) => { if (w.flip && Math.abs(V.x - A.lip) < 2 * V.wb) { plan(V, G, g, 0.05, -TAU * w.dir, 0.2); w.flip = false; } else plan(V, G, g, 0.05); });
    if (V.hit > 0.3 * N) { s.shake = Math.max(s.shake, clamp(V.hit / N) * 0.6); for (let k = 0; k < 6; k++) { const px = V.x + (rnd() - 0.5) * V.wb; puff(w.dust, px, g(px), (rnd() - 0.5) * 0.2 * N, -6 * u * rnd(), 1.4, 3, 6, LMID + DIM, 0, g); } }
    // the cars give under a loaded tyre, and stay down
    for (const wh of V.wh) if (wh.on && wh.c > 0.55 * V.trav) for (const c of A.cars) if (wh.hx > c.x0 && wh.hx < c.x1) c.crush = Math.min(1, c.crush + dt * 2.5 * (wh.c / V.trav - 0.5));
    if (V.wh[0].on && Math.abs(V.vx - V.vxT) > 0.05 * N) roost(w.clods, rnd, V, emit(rnd, 30, dt), 0.3 * N, rnd() < 0.5 ? MID : DARK, 1.8);
    if (f.beat.on || rnd() < dt * 6 * f.rel.bassDrive) { // smoke off the stacks on the roof, wherever the roof is turned
      const ca = Math.cos(V.a), sa = Math.sin(V.a), sx = -w.dir * 2.5 * kt, sy = -15 * kt;
      puff(w.dust, V.x + sx * ca - sy * sa, V.y + sx * sa + sy * ca, -w.dir * 0.03 * N, -0.08 * N, 1, 0.8, 2.5, DARK + DIM, 0.15 * N);
    }
    w.cam = clamp(follow(w.cam + V.vx * dt, V.x - 0.5 * N, dt, 0.35), 0, A.Lc - N);
    const cam = w.cam;
    // the stands and the crowd bobbing on the beat, the light rig flashing; the floor, the ramps, the cars
    r.rect(0, 0.28 * N, N, 0.42 * N, DARK + DIM);
    for (let y = Math.round(0.3 * N); y < 0.68 * N; y += Math.max(2, Math.round(2.4 * u))) for (let x = 0; x < N; x += 2) { const hx = Math.floor(x + cam * 0.4); if (hash(hx, y) < 0.35) r.buf[(y - (hash(hx, 7) < 0.5 ? Math.round(f.beat.pulse * u) : 0)) * N + x] = MID + DIM; }
    for (let k = 0; k < 5; k++) { const lx = ((k + 0.5) * N) / 5; haze(r, lx, 0.24 * N, (3 + 3 * w.flash) * u, BRIGHT, 0.3 + 0.5 * w.flash); r.rect(lx - 1.5 * u, 0.23 * N, 3 * u, 1.5 * u, w.flash > 0.5 ? WHITE : BRIGHT); }
    r.rect(0, 0.7 * N, N, 0.04 * N, DARK);
    r.rect(0, 0.74 * N, N, base - 0.74 * N, MID + DIM); // the far side of the arena floor
    for (let x = 0; x < N; x++) { const wx = x + cam, hh = wx <= 0 || wx >= A.Lc ? 0 : A.h[wx | 0], y = base - hh; vcol(r, x, Math.min(y, base), N, MID); vcol(r, x, y, y + px1(u), LMID); }
    r.rect(0, base + 0.03 * N, N, N, DARK);
    for (const c of A.cars) { // a car: the body, the cabin, the dark glass, two wheels; crushed lower
      const x0 = c.x0 - cam, x1 = c.x1 - cam;
      if (x1 < 0 || x0 > N) continue;
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(N, x1); x++) { const hh = carH(c, x + cam), y = base - hh; vcol(r, x, y, base, c.c); if (hh > 0.55 * c.h * (1 - 0.55 * Math.min(1, c.crush))) vcol(r, x, y + u, y + Math.max(u, (hh - 0.5 * c.h * (1 - 0.55 * Math.min(1, c.crush))) * 0.7), DARK); }
      if (c.stack) r.rect(x0, base - 0.5 * c.h * (1 - 0.55 * Math.min(1, c.crush)), x1 - x0, px1(u), DARK);
      for (const q of [0.18, 0.82]) ell(r, x0 + (x1 - x0) * q, base - 0.6 * u, 1.6 * u, 1.6 * u, FIG);
    }
    dust(W, w.dust, cam);
    const Pk = w.P; // the parked truck revs on the beat: the body squats on its springs, smoke off its stacks
    Pk.vxT = 0; Pk.acc = Pk.brk = G; Pk.tq = f.beat.on ? 60 : 0; Pk.face = -1;
    ride(Pk, dt, G, g);
    if (f.beat.on) puff(w.dust, Pk.x + 2.5 * kt, Pk.y - 15 * kt, 0.03 * N, -0.08 * N, 1, 0.8, 2.5, DARK + DIM, 0.15 * N);
    drawTruck(r, Pk, Pk.x - cam, Pk.y, kt, { style: 'monster', dir: -1, col: COOL, D: [0.9 * u, -1.4 * u] });
    const sp = w.ph === 'turn' ? Math.cos(Math.PI * clamp(w.pt / 0.8)) : 1; // spinning round: its length foreshortened, end-on half way
    drawTruck(r, V, V.x - cam, V.y, kt, { style: 'monster', dir: sp < 0 ? -w.dir : w.dir, sx: Math.max(0.25, Math.abs(sp)), col: HOT, D: [0.9 * u, -1.4 * u] });
    fly(W, w.clods, G, g, cam);
    targets.push({ x: V.x - cam - 12 * kt, y: V.y - 16 * kt, w: 24 * kt, h: 22 * kt });
  },
};

// ---------------------------------------------------------------------------------------------- mud bog
// A mud pit and a jacked-up four-by-four ploughing through it: the tyres sink into the mud and spin, flinging it off
// the tread in arcs (some gobs come at the lens and stick to it, sliding down and fading), the mud a wave on its own
// surface pushed ahead and slopping back behind; the truck bogs and lurches, bouncing on the ruts of the bottom. The
// throttle follows the bass, a kick is a surge (the front lifts, the mud flies), a snare throws a gob at the lens, on
// the beat the tyres bite and the truck hops. A drop: it powers through and launches off the far bank.
const MB_W = { soup: [3, 2, 1], deep: [1, 2, 2], ruts: [0, 1, 3] };
const mudbog = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, MB_W, bandOf(W.a)), N: 0, V: null, mud: [], splats: [], mh: null, mv: null, surge: 0, launch: false, ph: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, G = GV * N, base = 0.78 * N, kt = 0.95 * u, k = w.kind;
    w.mlv = follow(w.mlv ?? 0.04, k === 'deep' ? 0.055 : k === 'soup' ? 0.035 : 0.04, dt, 2); // a new kind of pit fills or drains slowly
    w.rut = follow(w.rut ?? 0, k === 'ruts' ? 1 : 0, dt, 2);
    const p0 = 0.17 * N, p1 = 0.83 * N, floorH = -0.075 * N, lvl = floorH + w.mlv * N, bank = 0.08 * N, bank2 = 0.13 * N;
    // the ground: banks either side, ramps into and out of the pit (the far one a lip), its floor rutted in the rutted kind
    const ground = (x) => {
      if (x < p0) return 0;
      if (x < p0 + bank) return floorH * ease((x - p0) / bank);
      if (x < p1 - bank2) return floorH + 0.012 * N * w.rut * Math.sin(x * 0.45 / u) ** 2 + 0.003 * N * (1 - w.rut) * Math.sin(x * 0.2 / u);
      if (x < p1) return floorH * 0.5 * (1 + Math.cos((Math.PI * (x - p1 + bank2)) / bank2)); // the far bank, eased up to the ground
      return 0;
    };
    const g = (x) => base - ground(x), M = Math.ceil((p1 - p0) / (2 * u)) + 1;
    if (w.N !== N || !w.mh || w.mh.length !== M) {
      w.N = N;
      w.mh = new Float32Array(M);
      w.mv = new Float32Array(M);
      w.V = truckRig('pickup', kt, -0.3 * N, G, 2.4);
      place(w.V, G, g);
      w.mud.length = w.splats.length = 0;
    }
    const V = w.V;
    if (f.section === 'change') w.kind = rollW(rnd, MB_W, bandOf(W.a));
    if (f.section === 'drop') w.launch = true;
    const kick = kickOf(hits);
    if (kick) w.surge = Math.max(w.surge, 0.4 + 0.6 * kick);
    w.surge = Math.max(0, w.surge - dt * 1.5);
    const inPit = V.x > p0 && V.x < p1, depth = inPit ? clamp((lvl - ground(V.x)) / (0.08 * N)) : 0;
    // the run: across at a pace, the mud dragging it back (and the bog surging), all out on a drop
    const pace = N * (0.28 + 0.14 * clamp(f.rel.bassDrive)) * (w.launch ? 2.2 : 1);
    w.ph += dt * (2 + 4 * f.rel.bassDrive);
    V.vxT = inPit ? pace * (1 - 0.5 * depth * (w.launch ? 0.2 : 1)) * (1 + 0.25 * Math.sin(w.ph) + 0.6 * w.surge) : pace;
    V.acc = (inPit ? 0.35 : 0.6) * G;
    V.brk = 0.6 * G;
    V.tq = -160 * w.surge;
    V.slip = inPit ? 6 + 10 * f.rel.bassDrive + 10 * w.surge : 0;
    V.pop = w.launch && V.x > p1 - bank2 && V.x < p1 + 0.05 * N ? 1 : 0;
    if (f.beat.on && inPit && !V.air) V.vy -= 0.05 * N * (0.5 + depth); // the tyres bite: a hop
    ride(V, dt, G, g, (V) => plan(V, G, g, 0.05));
    if (V.hit > 0.35 * N) s.shake = Math.max(s.shake, 0.3);
    if (V.x > 1.35 * N) { V.x = -0.35 * N; place(V, G, g); V.vx = pace; w.launch = false; } // round again, off the screen
    // the mud's surface: a wave on a 2-cell grid, pushed down where the tyres are and carried off both ways
    const mh = w.mh, mv = w.mv, c2 = (0.5 * N) ** 2, ns = Math.ceil(dt / 0.012), h = dt / ns, dx2 = (2 * u) ** 2;
    for (const wh of V.wh) if (wh.lz < 0 && wh.hx > p0 && wh.hx < p1) { const i = Math.round((wh.hx - p0) / (2 * u)); if (i > 0 && i < M - 1) { mv[i] += Math.abs(V.vx) * 2 * dt * 30 * (0.5 + 0.5 * depth); mv[i + 1] -= Math.abs(V.vx) * dt * 30; } }
    for (let n = 0; n < ns; n++) {
      for (let i = 1; i < M - 1; i++) mv[i] += (c2 * (mh[i - 1] - 2 * mh[i] + mh[i + 1]) / dx2 - 3 * mv[i]) * h;
      for (let i = 1; i < M - 1; i++) mh[i] = clamp(mh[i] + mv[i] * h, -0.04 * N, 0.04 * N);
    }
    // what the tyres throw: off the tread at the rim's speed, the hub's added; a few gobs come at the lens
    for (const wh of V.wh) if (wh.lz < 0 && wh.on && wh.hx > p0 && wh.hx < p1) for (let q = emit(rnd, Math.min(30, 25 + 40 * w.surge), dt); q > 0; q--) {
      // off the upper back quarter of the tyre (the back is the left going right, the right going left)
      const an = V.vx < 0 ? -rnd() * (Math.PI / 2) : Math.PI + rnd() * (Math.PI / 2), ws = wh.w * V.R, cx = wh.hx + Math.cos(an) * V.R, cy = wh.hy + Math.sin(an) * V.R;
      w.mud.push({ x: cx, y: cy, vx: V.vx - Math.sin(an) * ws, vy: V.vy + Math.cos(an) * ws, life: 1.6, s: rnd() < 0.3 ? 1.8 : 1.1, c: rnd() < 0.6 ? DARK : MID, z: rnd() < (snareOf(hits) ? 0.5 : 0.04) ? 0.001 : 0 });
    }
    if (w.mud.length > 260) w.mud.splice(0, w.mud.length - 260);
    // the ground, the bank-side crowd, the pit walls
    ridge(r, 0, 0.5 * N, 0.03 * N, 0.04 / u, N, COOL + DIM);
    for (let i = 0; i < 9; i++) { const x = (i < 4 ? 0.02 + i * 0.045 : 0.83 + (i - 4) * 0.04) * N, hh = (0.11 + 0.02 * hash(i, 1)) * N; walker(r, x, base - ground(x), hh, DARK, f.beat.pulse * 0.6 * (hash(i, 2) - 0.5), i < 4 ? 1 : -1); }
    for (let x = 0; x < N; x++) { const y = g(x); vcol(r, x, y, N, MID); vcol(r, x, y, y + px1(u), LMID); }
    drawTruck(r, V, V.x, V.y, kt, { style: 'pickup', col: COOL, D: [0.8 * u, -1.1 * u], lights: f.beat.pulse > 0.6 });
    // the mud over the pit floor and over the tyres in it: its surface the wave
    for (let x = Math.max(0, Math.ceil(p0)); x < Math.min(N, p1); x++) {
      const i = Math.min(M - 1, Math.round((x - p0) / (2 * u))), ym = base - lvl + mh[i], yf = g(x);
      if (ym < yf) { vcol(r, x, ym, yf, DARK); vcol(r, x, ym, ym + px1(u), MID + DIM); if (hash(x, Math.floor(t * 4)) < 0.05) r.set(x, ym + 2 * u, LMID); }
    }
    // the flung mud: arcs under gravity; those at the lens grow as they come and stick to it
    let n = 0;
    for (const p of w.mud) {
      if (p.z > 0) { // coming at the lens: the same parabola, seen shrunk, the gob growing as it nears
        p.z += dt * 3.5;
        p.x += p.vx * dt * 0.4; p.y += (p.vy * dt + 0.5 * G * dt * dt) * 0.4; p.vy += G * dt;
        if (p.z >= 1) { const life = 2.5 + rnd(); w.splats.push({ x: p.x, y: p.y, r: (3 + 5 * rnd()) * u, L: life, life, vy: 0 }); continue; }
        ell(r, p.x, p.y, (1 + 4 * p.z) * u, (1 + 4 * p.z) * u, DARK); w.mud[n++] = p; continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt + 0.5 * G * dt * dt; p.vy += G * dt; p.life -= dt;
      const gy = p.x > p0 && p.x < p1 ? Math.min(g(p.x), base - lvl) : g(p.x);
      if (p.life <= 0 || (p.vy > 0 && p.y > gy)) continue;
      r.rect(p.x - p.s * u * 0.5, p.y - p.s * u * 0.5, p.s * u, p.s * u, p.c);
      w.mud[n++] = p;
    }
    w.mud.length = n;
    // on the lens: a gob, sliding down slow (thick mud on glass) and thinning out, a smear behind it
    w.splats = w.splats.filter((q) => (q.life -= dt) > 0);
    for (const q of w.splats) {
      q.vy = follow(q.vy, 0.05 * N * (0.3 + 0.7 * (1 - q.life / q.L)), dt, 0.5);
      q.y += q.vy * dt;
      const a = q.life / q.L;
      haze(r, q.x, q.y, q.r, DARK, 0.95 * a + 0.1);
      r.rect(q.x - 0.4 * q.r, q.y - 0.4 * q.r, px1(0.6 * u), px1(0.6 * u), LMID);
      vcol(r, Math.round(q.x), q.y - q.r - (1 - a) * 6 * u, q.y - q.r, DARK + DIM);
    }
    if (w.splats.length > 14) w.splats.splice(0, w.splats.length - 14);
    targets.push({ x: V.x - 10 * kt, y: V.y - 12 * kt, w: 20 * kt, h: 16 * kt });
  },
};

// ---------------------------------------------------------------------------------------------- rock crawler
// A rock crawler picking its way up a line of rocks, seen a little from above: the near wheels on the near rocks, the
// far ones on the far rocks a step behind; each wheel on its own long-travel spring, so the body takes its pitch and
// its roll from where the four of them are. It creeps one move per beat, a spotter walking backwards ahead of it and
// signalling on the snares; a kick blips the throttle (a puff of smoke). A drop: a ledge too tall to climb, and the
// winch: the line run out to an anchor on top hangs in its catenary, the drum reels it in till it pulls taut, and then
// it drags the crawler up the face.
const RC_W = { slabs: [3, 2, 1], boulders: [2, 2, 2], ledges: [1, 2, 3] };
function rcNext(w, N, u, rnd) {
  const C = w.C, L = w.lv, len = Math.round((0.18 + 0.15 * rnd()) * N);
  if (w.winchQ) { // the ledge, on both tracks, and an anchor on its top
    w.winchQ = false;
    const H = 0.12 * N;
    lay(C, 0.15 * N, () => L, () => L);
    C.feats.push({ ledge: C.end, face: C.end + 0.7 * H, top: L + H, anchor: C.end + 0.7 * H + 0.16 * N, end: C.end + 0.6 * N, done: false });
    lay(C, 0.7 * H, (q) => L + H * q, (q) => L + H * q); // a face of 55 degrees
    lay(C, 0.4 * N, () => L + H, () => L + H);
    w.lv = L + H;
    return;
  }
  const shape = (kind, q, i) => {
    if (kind === 'slab') return 0.08 * N * (q < 0.5 ? q * 2 : 1);
    if (kind === 'boulder') { const c = (i % 37) / 37; return 0.05 * N * Math.sin(Math.PI * Math.min(1, c * 1.6)) ** 0.7; }
    if (kind === 'ledge') return q > 0.4 ? 0.055 * N : 0;
    return 0;
  };
  const pickK = () => (w.kind === 'slabs' ? (rnd() < 0.6 ? 'slab' : 'boulder') : w.kind === 'boulders' ? 'boulder' : rnd() < 0.6 ? 'ledge' : 'boulder');
  const kn = pickK(), kf = rnd() < 0.5 ? kn : pickK(), down = L > 0.2 * N;
  // each track its own rock, so the wheels articulate; the line steps down again when it has climbed high
  lay(C, len, (q, i) => (down ? L - 0.1 * N * q : L) + shape(kn, q, i), (q, i) => (down ? L - 0.1 * N * q : L) + 0.7 * shape(kn, (q + 0.1) % 1, i + 5) + 0.2 * shape(kf, (q + 0.4) % 1, i + 11));
  w.lv = down ? L - 0.1 * N : L;
  if (!down && kn !== 'boulder') { const add = 0.04 * N; lay(C, 4 * u, (q) => L + add * q, (q) => L + add * q); w.lv = L + add; }
}
const rockcrawl = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, RC_W, bandOf(W.a)), N: 0, C: null, V: null, cam: 0, lv: 0, xT: 0, winchQ: false, winch: null, smoke: [], sig: 0, tickT: 0, sp: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, G = GV * N, base = 0.82 * N, kt = 0.95 * u, D = [1.2 * u, -2.4 * u];
    if (w.N !== N) {
      w.N = N;
      w.C = course(Math.ceil(5 * N));
      w.lv = 0;
      lay(w.C, 0.5 * N, () => 0, () => 0);
      w.V = truckRig('crawler', kt, 0.3 * N, G, 4.4);
      w.V.hold = 0.6;
      place(w.V, G, (x, side) => base - cAt(w.C, x, side ? w.C.k : w.C.h));
      w.xT = w.V.x;
      w.cam = 0;
      w.winch = null; // (its anchor was on the old course)
      w.smoke.length = 0;
    }
    const C = w.C, V = w.V, g = (x, side) => base - cAt(C, x, side ? C.k : C.h);
    // a point of the crawler's near side (in its units, x ahead, y down) wherever its pitch and roll have turned it
    const at = (px, py) => { const ca = Math.cos(V.a), sa = Math.sin(V.a); return [V.x + px * kt * ca - py * kt * sa, V.y + px * kt * sa + py * kt * ca - V.tw * Math.sin(V.b)]; };
    if (f.section === 'change') w.kind = rollW(rnd, RC_W, bandOf(W.a));
    if (f.section === 'drop' && !w.winch) w.winchQ = true;
    while (C.end < w.cam + 2 * N) rcNext(w, N, u, rnd);
    if (C.feats.length > 6) C.feats = C.feats.filter((ft) => ft.end > w.cam);
    const pipe = at(-6, -4);
    if (kickOf(hits)) { V.vy -= 0.02 * N; for (let k = 0; k < 3; k++) puff(w.smoke, pipe[0], pipe[1], -0.03 * N, -0.05 * N, 1.6, 1, 4, DARK + DIM, 0.12 * N); }
    if (snareOf(hits)) w.sig = 0.5;
    w.sig -= dt;
    if (rnd() < dt * 4 * f.level) puff(w.smoke, pipe[0], pipe[1], -0.02 * N, -0.03 * N, 1.2, 0.6, 2.5, DARK + DIM, 0.12 * N); // the engine idling
    // one move a beat: the target steps on, the crawler creeps to it
    const step = tick(w, f, dt);
    const ledge = C.feats.find((ft) => ft.ledge && !ft.done && ft.ledge > V.x - V.wb && ft.ledge < V.x + V.wb / 2 + V.R + 2 * u);
    const W8 = w.winch;
    if (ledge && !W8 && V.x + V.wb / 2 + V.R > ledge.ledge - 0.5 * u) { // at the foot of the ledge: run the line out to the anchor
      const [bx, by] = at(6.6, -2), ax = ledge.anchor, ay = base - ledge.top - 3 * u;
      w.winch = { ft: ledge, L: 1.3 * Math.hypot(ax - bx, ay - by), ph: 'reel', end: 0 };
    }
    if (w.winch) { // (the line runs from the drum on the front bumper, turned with the crawler)
      const wn = w.winch, [bx, by] = at(6.6, -2), ax = wn.ft.anchor, ay = base - wn.ft.top - 3 * u, d = Math.hypot(ax - bx, ay - by);
      if (wn.ph === 'reel') { wn.L = Math.max(d, wn.L - 0.07 * N * dt); if (wn.L <= d * 1.002) wn.ph = 'pull'; V.vxT = 0; }
      else if (wn.ph === 'pull') { wn.L = d; V.vam = 1.2; V.vxT = (0.06 * N * (ax - bx)) / d; if (V.wh[0].hx > wn.ft.face + u && V.wh[2].hx > wn.ft.face + u) { wn.ph = 'stow'; wn.end = 0; wn.ft.done = true; } }
      else { wn.end += dt * 2; V.vxT = 0.03 * N; V.vam = 6; if (wn.end >= 1) w.winch = null; }
      w.xT = V.x;
    } else {
      if (step) w.xT = Math.max(w.xT, V.x) + (0.028 + 0.016 * clamp(f.rel.bassDrive)) * N;
      V.vxT = clamp((w.xT - V.x) * 5, 0, 0.12 * N);
    }
    V.acc = 0.8 * G;
    V.brk = G;
    ride(V, dt, G, g);
    w.sp += Math.abs(V.vx) * dt; // the ground the spotter has walked
    w.cam = follow(w.cam, V.x - 0.4 * N, dt, 0.8);
    const cam = w.cam;
    // the sky, the far range, the rocks: the far track's band a step up and behind, then the near one, their tops lit
    ridge(r, cam * 0.1, 0.5 * N, 0.05 * N, 0.015 / u, N, LMID + DIM);
    for (let x = 0; x < N; x++) {
      const wx = x + cam, yf = g(wx - D[0], 1) + D[1], yn = g(wx, 0);
      vcol(r, x, yf, N, MID + DIM);
      vcol(r, x, yf, yf + px1(u), LMID);
      vcol(r, x, yn, N, MID);
      vcol(r, x, yn, yn + px1(u), LMID);
      if (hash(Math.floor(wx), 3) < 0.05) vcol(r, x, yn + 2 * u, yn + 6 * u, DARK);
    }
    // the spotter, walking backwards ahead, an arm up to signal
    const spx = V.x + 0.24 * N - cam, spy = g(V.x + 0.24 * N, 0), J = walker(r, spx, spy, 0.13 * N, FIG, (w.sp * TAU) / (0.052 * N), -1, { cap: true, hatCol: HOT }); // a stride of 0.4 his height a step cycle
    if (w.sig > 0) r.stroke(J.sx, J.sy, J.sx - 1.5 * u, J.sy - 0.07 * N, px1(u), FIG);
    dust(W, w.smoke, cam, -0.01 * N);
    drawTruck(r, V, V.x - cam, V.y, kt, { style: 'crawler', col: HOT, D, lights: f.beat.pulse > 0.6, helm: BRIGHT });
    if (w.winch) { // the line: its catenary while slack, straight once taut; the anchor stump on the top
      const wn = w.winch, bp = at(6.6, -2), bx = bp[0] - cam, by = bp[1], ax0 = wn.ft.anchor - cam, ay0 = base - wn.ft.top - 3 * u;
      const ax = wn.ph === 'stow' ? ax0 + (bx - ax0) * wn.end : ax0, ay = wn.ph === 'stow' ? ay0 + (by - ay0) * wn.end : ay0, L = wn.ph === 'stow' ? Math.hypot(ax - bx, ay - by) : wn.L;
      const pts = catenary(bx, by, ax, ay, L, 24);
      for (let i = 1; i < pts.length; i++) r.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], BRIGHT);
      r.rect(ax0 - 1.5 * u, ay0, 3 * u, 3 * u, DARK);
    }
    targets.push({ x: V.x - cam - 9 * kt, y: V.y - 11 * kt, w: 18 * kt, h: 16 * kt });
  },
};

// ---------------------------------------------------------------------------------------------- quads on the dunes
// Quads in a bowl between two dunes, the dunes behind drifting in layers: each charges up a face, its speed bled off
// by the slope (gravity against the drive along it), spins round near the top (end-on half way, its length
// foreshortened, the back wheels spraying sand round in an arc) and runs back down, across, up the other side. The
// throttle follows the bass, a kick is a burst of it (a plume), a snare spins a quad round where it is, the far
// crests glint on the beat. A drop sends one over the right crest: it leaves the lip, flies, lands on the far side,
// and comes back over later.
const AT_W = { carve: [3, 2, 1], race: [1, 2, 2], wild: [0, 1, 3] }; // how hard they ride
const AT_BOWL = { wide: [3, 1, 0], bowl: [2, 2, 1], steep: [0, 1, 3] }; // the bowl they ride, fixed once laid
const atvdunes = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, AT_W, bandOf(W.a)), bowl: rollW(rnd, AT_BOWL, bandOf(W.a)), N: 0, quads: [], plume: [], roost: [], sway: 0, jumpQ: false });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, G = GV * N, base = 0.9 * N, kq = 1.0 * u, k = w.bowl, ride1 = w.kind === 'carve' ? 0.8 : w.kind === 'wild' ? 1.25 : 1;
    const H = (k === 'steep' ? 0.22 : k === 'wide' ? 0.14 : 0.18) * N, lc = 0.02, rc = 0.84, f0 = k === 'wide' ? 0.32 : 0.36, f1 = k === 'wide' ? 0.54 : 0.5;
    // the bowl: the left dune's crest at the left edge, its face eased down to the floor, the right dune's face up to a
    // crest at 0.84 (a lip, steepest at the top) and its back beyond; no face steeper than a quad can climb
    const ground = (x) => {
      const q = x / N, sm = (v) => v * v * (3 - 2 * v);
      if (q < lc) return H * Math.max(0, 1 - ((lc - q) / 0.4) ** 2);
      if (q < f0) return H * (1 - sm((q - lc) / (f0 - lc)));
      if (q < f1) return 0;
      if (q < rc) return H * ((q - f1) / (rc - f1)) ** 1.5;
      return H * Math.max(0, 1 - (q - rc) / 0.45) ** 1.2;
    };
    const g = (x) => base - ground(x), sl = (x) => (ground(x + 1) - ground(x - 1)) / 2;
    const nq = 2 + (bandOf(W.a) > 0 ? 1 : 0);
    if (w.N !== N || w.quads.length !== nq) {
      w.N = N;
      w.quads = Array.from({ length: nq }, (_, i) => { const V = truckRig('quad', kq, (0.35 + 0.12 * i) * N, G, 1.6); place(V, G, g); return { V, i, dir: i % 2 ? -1 : 1, vs: 0.1 * N, ph: 'ride', pt: 0, gas: 0, jump: false }; });
      w.plume.length = w.roost.length = 0;
    }
    if (f.section === 'change') w.kind = rollW(rnd, AT_W, bandOf(W.a));
    if (f.section === 'drop') w.jumpQ = true;
    const kick = kickOf(hits), snare = snareOf(hits);
    if (w.jumpQ) { const qd = w.quads.find((q) => q.ph === 'ride' && q.dir > 0 && q.V.x < f1 * N && q.V.x > (f0 - 0.1) * N); if (qd) { qd.jump = true; w.jumpQ = false; } }
    for (const Q of w.quads) {
      const V = Q.V, s1 = sl(V.x), cs = Math.sqrt(1 + s1 * s1), upHill = s1 * Q.dir;
      if (kick) Q.gas = Math.max(Q.gas, 0.3 + 0.5 * kick);
      Q.gas = Math.max(0, Q.gas - dt);
      Q.pt += dt;
      if (Q.ph === 'ride') {
        // along the slope: the drive against gravity; near the top, or on a snare, it spins round
        const crestD = Q.dir > 0 ? rc * N - V.x : V.x - lc * N, easing = !Q.jump && upHill > 0.15 && crestD < 0.2 * N; // backing off to spin at the top
        const drive = (Q.jump ? 0.95 : easing ? -0.5 : (0.25 + 0.25 * clamp(f.rel.bassDrive)) * ride1 + 0.4 * Q.gas) * G;
        if (!V.air) Q.vs = Math.max(0, Q.vs + (drive - (G * upHill) / cs) * dt);
        Q.vs = Math.min(Q.vs, (Q.jump ? 1.2 : 0.6) * N);
        const nearTop = (Q.dir > 0 && V.x > (rc - 0.07) * N && V.x < rc * N) || (Q.dir < 0 && V.x < (lc + 0.08) * N);
        if (!Q.jump && !V.air && ((upHill > 0.25 && Q.vs < 0.08 * N) || (nearTop && Q.vs < 0.25 * N) || (snare && Q.i === 0 && Q.pt > 1 && Q.vs < 0.3 * N))) { Q.ph = 'spin'; Q.pt = 0; }
        if (Q.jump && V.x > 1.25 * N) { Q.ph = 'away'; Q.pt = 0; }
      } else if (Q.ph === 'spin') { Q.vs = 0; if (Q.pt > 0.6) { Q.dir = -Q.dir; Q.ph = 'ride'; Q.pt = 0; Q.vs = 0.12 * N; } }
      else { Q.vs = 0; if (Q.pt > 1.5) { Q.jump = false; Q.dir = -1; Q.ph = 'ride'; Q.pt = 0; V.x = 1.2 * N; place(V, G, g); Q.vs = 0.5 * N; } } // round the back of the dune, out of sight
      V.vxT = (Q.vs * Q.dir) / cs;
      V.acc = V.brk = 30 * G;
      V.pop = Q.jump && Math.abs(V.x - rc * N) < 1.5 * V.wb ? 1 : 0;
      ride(V, dt, G, g, (V) => { if (V.x > 0.6 * N) plan(V, G, g, 0.06); });
      if (V.hit > 0.3 * N) { s.shake = Math.max(s.shake, 0.2); for (let k2 = 0; k2 < 3; k2++) puff(w.plume, V.x, g(V.x), (rnd() - 0.5) * 0.1 * N, -5 * u, 2, 2.5, 6, LMID, 0, g); }
      // sand: the plume behind, the roost off the back wheels, an arc of it while spinning round
      if (!V.air) for (let k2 = emit(rnd, 8 + 20 * Q.gas, dt); k2 > 0; k2--) { const px = V.x - Q.dir * V.wb * 0.6; puff(w.plume, px, g(px) - u, -Q.dir * 0.05 * N, -4 * u, 2, 1.5, 5, LMID + (rnd() < 0.5 ? DIM : 0), 0, g); }
      // spinning round, the back wheels sweep an arc and throw sand off the surface all round it
      if (!V.air && Q.ph === 'spin') for (let k2 = emit(rnd, 30, dt); k2 > 0; k2--) { const an = rnd() * TAU, px = V.x + Math.cos(an) * V.wb * 0.5; w.roost.push({ x: px, y: g(px) - u, vx: Math.cos(an) * 0.3 * N, vy: -(0.2 + 0.3 * rnd()) * N, life: 1, s: 1, c: MID }); }
      else if (!V.air && Q.gas > 0.1) roost(w.roost, rnd, V, emit(rnd, 30, dt), 0.3 * N, MID);
    }
    w.sway = Math.sin(t * 0.13) * 0.03 * N;
    // the far dunes in layers drifting with the view, their crests glinting on the beat; the bowl, lit and shaded
    for (const [k3, y0, amp, fr, c] of [[0.1, 0.4, 0.07, 0.02, LMID + DIM], [0.25, 0.5, 0.08, 0.028, MID + DIM], [0.45, 0.6, 0.06, 0.04, MID]]) {
      for (let x = 0; x < N; x++) { // a dune's profile: a long windward rise to a sharp crest, a short steep slip face
        const q = ((x + w.sway * k3 * 10) * fr) / u, ph = (((q / TAU) % 1) + 1) % 1, prof = ph < 0.75 ? (ph / 0.75) ** 1.4 : 1 - (ph - 0.75) / 0.25, y = y0 * N - amp * N * prof;
        vcol(r, x, y, N, c);
        if (f.beat.pulse > 0.5 && Math.abs(ph - 0.75) < 0.012) r.set(x, y, BRIGHT); // the crests glint on the beat
      }
    }
    for (let x = 0; x < N; x++) { // the sand: lit where it faces the light, a skin of shade where it turns away
      const y = g(x), lit = sl(x) > -0.05;
      vcol(r, x, y, N, MID);
      vcol(r, x, y, y + 7 * u, lit ? LMID : MID + DIM);
      vcol(r, x, y, y + px1(u), lit ? BRIGHT : LMID);
      if (lit && (Math.floor(x / (3 * u)) + Math.floor(y / (2 * u))) % 5 === 0) vcol(r, x, y + 2 * u, y + 2.6 * u, MID + DIM);
    }
    dust(W, w.plume, 0, 0.02 * N);
    for (const Q of w.quads) {
      const V = Q.V, sp = Q.ph === 'spin' ? Math.cos(Math.PI * clamp(Q.pt / 0.6)) : 1;
      drawTruck(r, V, V.x, V.y, kq, { style: 'quad', dir: sp < 0 ? -Q.dir : Q.dir, sx: Math.max(0.3, Math.abs(sp)), col: [HOT, COOL, BRIGHT][Q.i], D: [0.6 * u, -0.8 * u], kit: [COOL, HOT, HOT][Q.i], helm: BRIGHT, plast: [HOT, COOL, BRIGHT][Q.i], st: Q.gas > 0.2 || V.air ? 1 : 0.3 });
      targets.push({ x: V.x - 7 * kq, y: V.y - 12 * kq, w: 14 * kq, h: 14 * kq });
    }
    fly(W, w.roost, G, g);
  },
};

// ---------------------------------------------------------------------------------------------- hill climb
// A near-vertical hill and its crowd at the top, the riders going at it one after another. Up the face the drive
// fights gravity and loses, the speed bleeding off with the height (each one's run follows the bass, so they get to
// different heights); where a bike stalls the engine lifts the front, the weight passes behind the rear tyre and
// gravity takes it over backwards (a body pivoting on its tyre): the rider bails off the back and slides down, and
// the bike tumbles down the face as a rigid body, bouncing off it, till it is dragged off at the foot. The next goes
// on a kick once the face is clear; the crowd bobs on the beat. A drop: one makes it, over the lip and away.
const HC_W = { dirt: [3, 2, 1], ledges: [1, 2, 2], wall: [0, 1, 3] };
function hcHill(N, kind) {
  const x0 = Math.round(-0.45 * N), x1 = Math.round(1.3 * N), n = x1 - x0 + 1, y = new Float32Array(n), foot = 0.17 * N, top = 0.72 * N, yb = 0.9 * N, yt = 0.14 * N, pw = kind === 'wall' ? 2.2 : 1.7;
  for (let i = 0; i < n; i++) {
    const x = x0 + i;
    if (x < foot) y[i] = yb + (foot - x) * 0.3; // the run-in, falling away to the left
    else if (x < top) { const q = (x - foot) / (top - foot); y[i] = yb - (yb - yt - 0.04 * N) * q ** pw - (kind === 'ledges' ? 0.012 * N * ((q * 9) % 1 < 0.15 ? 1 : 0) : 0); }
    else if (x < top + 0.04 * N) y[i] = yt + 0.04 * N - 0.04 * N * Math.sin(((x - top) / (0.04 * N)) * (Math.PI / 2)) - 0.012 * N * Math.sin(((x - top) / (0.04 * N)) * Math.PI); // the lip
    else y[i] = yt;
  }
  // arc length along the climb, from the foot to the lip
  const sx = [], ss = [];
  let acc = 0;
  for (let x = Math.round(foot); x <= top + 0.02 * N; x++) { if (sx.length) acc += Math.hypot(1, y[x - x0] - y[x - 1 - x0]); sx.push(x); ss.push(acc); }
  return { y, x0, n, foot, top, yt, sx: Float32Array.from(sx), ss: Float32Array.from(ss), S: acc };
}
const hAt = (Hl, x) => { const i = x - Hl.x0, i0 = Math.max(0, Math.min(Hl.n - 2, Math.floor(i))); return Hl.y[i0] + (Hl.y[i0 + 1] - Hl.y[i0]) * Math.min(1, Math.max(0, i - i0)); };
function hcPos(Hl, s) { // the point at arc length s up the climb
  const ss = Hl.ss;
  let lo = 0, hi = ss.length - 1;
  s = Math.max(0, Math.min(ss[hi], s));
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] > s) hi = m; else lo = m; }
  const x = Hl.sx[lo] + (s - ss[lo]) / Math.max(1e-6, ss[hi] - ss[lo]);
  return [x, hAt(Hl, x)];
}
const hillclimb = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, HC_W, bandOf(W.a)), N: 0, Hl: null, bike: null, st: 'wait', tw: 0, s: 0, vs: 0, wa: 0, v0: 0, x: 0, vx: 0, px: 0, py: 0, amax: 0, ovx: 0, ovy: 0, oa0: 0, oT: 1, ot: 0, land: false, bodies: [], roost: [], overQ: false, over: false, cheer: 0, col: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, G = GV * N, kb = 0.95 * u, bps = bpsOf(f);
    if (w.N !== N || !w.Hl) { w.N = N; w.Hl = hcHill(N, w.kind); w.bike = bikeRig(kb, -0.3 * N, G); w.st = 'wait'; w.bodies = []; w.roost.length = 0; }
    const Hl = w.Hl, V = w.bike, g = (x) => hAt(Hl, x), hw = V.wb / 2, sag = G / (2 * V.k);
    if (f.section === 'change') { w.kind = rollW(rnd, HC_W, bandOf(W.a)); if (w.st === 'wait' && !w.bodies.length) w.Hl = hcHill(N, w.kind); }
    if (f.section === 'drop') w.overQ = true;
    // the work the climb takes against the drive, from the foot to the lip, for the run it needs
    const drive = 0.5 * G;
    if (!Hl.need) { let wk = 0; for (let i = 1; i < Hl.sx.length; i++) { const ds = Hl.ss[i] - Hl.ss[i - 1], sn = (g(Hl.sx[i - 1]) - g(Hl.sx[i])) / Math.max(1e-6, ds); wk += Math.max(0, G * sn - drive) * ds; } Hl.need = Math.sqrt(2 * wk); }
    const kick = kickOf(hits);
    w.tw += dt;
    // where a tyre's hub sits over x: its circle on the ground, touching it and nowhere into it (the points `ride` uses)
    const hubY = (x) => { const y = g(x) - V.R; return y - Math.max(0, sink(g, 0, x, y, V.R)); };
    // the frame from its rear hub (x, y) and its pitch, the wheels hung at the sag as `drawBike` hangs them
    const setFrom = (x, y, a) => { const ca = Math.cos(a), sa = Math.sin(a); V.a = a; V.x = x + hw * ca + V.L0 * sa; V.y = y + hw * sa - V.L0 * ca + sag; };
    const hub = (side) => { const ca = Math.cos(V.a), sa = Math.sin(V.a); return [V.x + side * hw * ca - V.L0 * sa, V.y + side * hw * sa + V.L0 * ca - sag]; };
    // the bike on the ground from its rear hub's x: the front hub a wheelbase on, on its own circle, the frame along them
    const poseAt = (xr) => {
      const yr = hubY(xr);
      let lo = xr, hi = xr + V.wb;
      for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2, dy = hubY(m) - yr; if ((m - xr) ** 2 + dy * dy < V.wb * V.wb) lo = m; else hi = m; }
      setFrom(xr, yr, Math.atan2(hubY(lo) - yr, lo - xr));
    };
    if (w.st === 'wait') {
      V.x = -0.3 * N;
      if (w.bodies.every((b) => b.gone) && ((kick > 0.4 && w.tw > 1) || w.tw > 5 / bps)) {
        w.over = w.overQ; w.overQ = false; w.st = 'run'; w.tw = 0; w.x = -0.3 * N; w.vx = 0; w.col = (w.col + 1) % 3;
        w.v0 = Hl.need * (w.over ? 1.15 : 0.45 + 0.35 * clamp(f.rel.bassDrive) + 0.1 * rnd());
      }
    }
    if (w.st === 'run') { // the run-in: on the gas up to the speed this one takes at the face
      w.vx = Math.min(w.v0, w.vx + 0.9 * G * dt);
      w.x += w.vx * dt;
      poseAt(w.x);
      if (w.x >= Hl.foot) { w.st = 'climb'; w.s = 0; w.vs = w.vx; }
    } else if (w.st === 'climb') { // up the face: the drive against gravity, along the slope
      const [x0, y0] = hcPos(Hl, w.s), [x1, y1] = hcPos(Hl, w.s + 1), sn = (y0 - y1) / Math.max(1e-6, Math.hypot(x1 - x0, y1 - y0));
      w.vs += (drive * (w.over ? 1.2 : 1) - G * sn) * dt;
      w.s += w.vs * dt;
      poseAt(hcPos(Hl, w.s)[0]);
      w.wa = 0;
      if (w.s >= Hl.S - 1) { // over the lip, the rear tyre at its top: off along the face there at its speed, the nose brought level by the touch
        const [lx0, ly0] = hcPos(Hl, Hl.S - 1), [lx1, ly1] = hcPos(Hl, Hl.S), ta = Math.atan2(ly1 - ly0, lx1 - lx0);
        w.st = 'over'; w.land = false; w.ovx = w.vs * Math.cos(ta); w.ovy = w.vs * Math.sin(ta); w.cheer = 2;
        w.oa0 = V.a; w.ot = 0; w.oT = Math.max(0.2, (-1.6 * w.ovy) / G);
      } else if (w.vs < 0.04 * N) { w.st = 'loop'; [w.px, w.py] = hub(-1); w.amax = V.a; }
    } else if (w.st === 'loop') { // pivoting on the rear hub: gravity on the weight about it, the engine lifting the front
      const n = Math.ceil(dt / 0.005), h = dt / n, I = hw * hw + V.L0 * V.L0 + (0.3 * V.wb) ** 2;
      for (let k = 0; k < n; k++) {
        const cx = hw * Math.cos(V.a) + V.L0 * Math.sin(V.a); // the weight's lead over the hub
        w.wa += ((G * cx) / I - 4) * h;
        V.a += w.wa * h;
        if (V.a > w.amax) { V.a = w.amax; w.wa = Math.min(0, w.wa); } // the front tyre on the face: no further down
      }
      setFrom(w.px, w.py, V.a);
      if (V.a < -Math.PI / 2 - 0.45) { // over backwards: the rider bails, the bike goes down on its own (turning about the hub as it was)
        const ca = Math.cos(V.a), sa = Math.sin(V.a), dx = V.x - w.px, dy = V.y - w.py, rvx = -w.wa * dy, rvy = w.wa * dx;
        // (its springs let out: the wheels where they were, at full droop, spinning on as they were)
        w.bodies.push({ kind: 'bike', x: V.x, y: V.y - sag, vx: rvx, vy: rvy, a: V.a, w: w.wa, e: 0.35, mu: 0.45, I: (0.3 * V.wb) ** 2 * 1.4, pts: [[-hw, V.L0, V.R], [hw, V.L0, V.R], [3 * kb, -5.5 * kb, 0], [-8 * kb, -4 * kb, 0]], rest: 0, gone: false, col: w.col, wh: V.wh.map((q) => ({ ...q, c: 0 })) });
        const sx = V.x + (-2 * kb) * ca - (-6 * kb) * sa, sy = V.y + (-2 * kb) * sa + (-6 * kb) * ca;
        w.bodies.push({ kind: 'rider', x: sx, y: sy, vx: rvx - 0.12 * N, vy: rvy - 0.1 * N, a: V.a + Math.PI / 2, w: -4, e: 0.2, mu: 0.6, I: (4 * kb) ** 2, pts: [[0, -4.5 * kb, 1.4 * kb], [0, 4.5 * kb, 0.6 * kb]], rest: 0, gone: false, col: w.col });
        w.st = 'wait'; w.tw = 0;
      }
    } else if (w.st === 'over') { // off the lip: an exact parabola, the nose easing down to level (as `plan` turns it), then away along the top
      if (!w.land) {
        V.x += w.ovx * dt; V.y += w.ovy * dt + 0.5 * G * dt * dt; w.ovy += G * dt;
        const q = Math.min(1, (w.ot += dt) / w.oT);
        V.a = w.oa0 * (1 - q * (1.5 - 0.5 * q * q));
        const hr = hub(-1), hf = hub(1);
        if (w.ovy > 0 && (hr[1] >= hubY(hr[0]) || hf[1] >= hubY(hf[0]))) { w.land = true; w.x = hr[0]; w.ovx = Math.max(w.ovx, 0.3 * N); }
      }
      if (w.land) { w.x += w.ovx * dt; poseAt(w.x); }
      if (V.x > 1.15 * N) { w.st = 'wait'; w.tw = 0; w.over = false; }
    }
    // the wheels: rolling at v / r on the ground, the rear spinning faster where it digs, both keeping their spin in the air
    const rw = V.wh[0], fw = V.wh[1];
    if (w.st === 'run') rw.w = fw.w = w.vx / V.R;
    else if (w.st === 'climb') { fw.w = w.vs / V.R; rw.w = (1.6 * w.vs) / V.R; }
    else if (w.st === 'loop') { rw.w = (0.3 * N) / V.R; fw.w *= Math.exp(-dt); }
    else if (w.st === 'over' && w.land) rw.w = fw.w = w.ovx / V.R;
    for (const wh of V.wh) { wh.c = sag; wh.sp += wh.w * dt; }
    if (w.st === 'climb' || w.st === 'loop' || w.st === 'run') for (let k = emit(rnd, 30, dt); k > 0; k--) { // roost off the spinning rear tyre, down the face
      const px = hub(-1)[0], ca = Math.cos(V.a);
      w.roost.push({ x: px, y: g(px) - 0.5, vx: -(0.15 + 0.25 * rnd()) * N * ca, vy: -(0.05 + 0.2 * rnd()) * N, life: 1.2, s: 1, c: rnd() < 0.5 ? MID : DARK });
    }
    // the tumbling: rigid bodies off the face; come to rest at the foot, they are dragged off by a marshal at a walk
    for (const b of w.bodies) {
      if (b.gone) continue;
      tumble(b, dt, G, g);
      const sp = Math.hypot(b.vx, b.vy);
      b.rest = sp < 0.03 * N && b.down ? b.rest + dt : 0;
      if (b.rest > 0.6 && !b.drag) { b.drag = true; b.x0 = b.x; }
      if (b.drag) { b.vx = -0.12 * N; b.w = 0; }
      if (b.x < -0.25 * N || b.y > 1.3 * N) b.gone = true;
      if (b.kind === 'bike') for (const wh of b.wh) { wh.w *= Math.exp(-dt * 0.5); wh.sp += wh.w * dt; } // free on their bearings
    }
    if (w.bodies.length > 6) w.bodies = w.bodies.filter((b) => !b.gone);
    w.cheer -= dt;
    // the sky, the crowd at the top bobbing on the beat (arms up when one makes it), the face with its ruts
    for (let x = 0; x < N; x++) { const y = g(x); vcol(r, x, y, N, MID); vcol(r, x, y, y + px1(u), LMID); if (hash(x, 1) < 0.1) vcol(r, x, y + 2 * u, y + 2 * u + 4 * u * hash(x, 2), DARK); }
    for (let i = 0; i < 12; i++) {
      const cx = (0.76 + 0.02 * i) * N + 0.01 * N * hash(i, 3), cy = Hl.yt - f.beat.pulse * u * (hash(i, 4) < 0.5 ? 1 : 0.3); // stood on the top, hopping on the beat
      ell(r, cx, cy - 4 * u, 1.3 * u, 1.3 * u, FIG);
      r.rect(cx - 1.4 * u, cy - 3 * u, 2.8 * u, 3 * u, hash(i, 5) < 0.4 ? HOT : DARK);
      if (w.cheer > 0) r.stroke(cx + u, cy - 3 * u, cx + 2 * u, cy - 7 * u, px1(0.7 * u), FIG);
    }
    r.rect(0.74 * N, Hl.yt - 12 * u, px1(0.6 * u), 12 * u, DARK);
    r.rect(0.74 * N, Hl.yt - 12 * u, 4 * u, 2.5 * u, f.beat.pulse > 0.5 ? HOT : COOL); // the flag at the top
    fly(W, w.roost, G, g);
    const cols = [[HOT, COOL], [COOL, HOT], [BRIGHT, HOT]];
    for (const b of w.bodies) {
      if (b.gone) continue;
      if (b.kind === 'bike') { const VV = { ...V, x: b.x, y: b.y, a: b.a, wh: b.wh }; drawBike(r, VV, b.x, b.y, kb, { plast: cols[b.col][0], rider: false }); }
      else { // the rider tumbling: head, body and limbs along his axis, flailing with the spin
        const ca = Math.cos(b.a), sa = Math.sin(b.a), P = (dx, dy) => [b.x + dx * ca - dy * sa, b.y + dx * sa + dy * ca], hd = P(0, -4.5 * kb), hp = P(0, 1 * kb);
        r.stroke(hd[0], hd[1], hp[0], hp[1], px1(2 * kb), cols[b.col][1]);
        for (const sgn of [-1, 1]) { const fo = P(sgn * 2 * kb, 4.5 * kb), ha = P(sgn * 3 * kb * Math.cos(t * 9), -2 * kb); r.stroke(hp[0], hp[1], fo[0], fo[1], px1(1.2 * kb), FIG); r.stroke(hd[0], hd[1], ha[0], ha[1], px1(kb), cols[b.col][1]); }
        ell(r, hd[0], hd[1], 1.5 * kb, 1.5 * kb, BRIGHT);
      }
      if (b.drag) walker(r, b.x - 4 * kb, g(b.x - 4 * kb), 0.13 * N, FIG, ((b.x0 - b.x) * TAU) / (0.052 * N), -1, { cap: true, hatCol: HOT }); // his steps in time with the ground he covers
    }
    if (w.st !== 'wait') {
      drawBike(r, V, V.x, V.y, kb, { plast: cols[w.col][0], kit: cols[w.col][1], helm: BRIGHT, st: 1, pose: 'climb', p: w.st === 'loop' ? 0.3 : clamp(-V.a / 0.9) });
      targets.push({ x: V.x - 8 * kb, y: V.y - 12 * kb, w: 16 * kb, h: 18 * kb });
    }
  },
};

// ---------------------------------------------------------------------------------------------- paddock
// A muddy paddock at dusk between the race and the night race: a bike on its stand with its rear wheel in the air, a
// mechanic revving it (the wheel spins up against the engine's torque and runs down against its own drag, a puff of
// smoke out of the pipe on every beat); another bike on a stand being hosed off, the water in arcs (exact parabolas)
// splashing off it and taking the mud off where it hits; a fire barrel throwing sparks that rise, slow and go out;
// generators shaking at the level, pit tents and vans behind. Kicks are rev blips, snares sweep the hose, hats pop
// the fire. A drop: the floodlights snap on for the night race, cones of light and their pools on the mud.
const PD_W = { rain: [3, 2, 1], wash: [2, 2, 2], rev: [1, 2, 3] };
const paddock = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, PD_W, bandOf(W.a)), N: 0, A: null, B: null, om: 0, smoke: [], water: [], sparks: [], drops: [], flood: 0, floodOn: false, aim: 0, mud: Array.from({ length: 9 }, () => [rnd() * 16 - 8, -rnd() * 4, 1]), rainP: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, G = GV * N, gy = 0.84 * N, kb = 1.75 * u, k = w.kind;
    if (w.N !== N) { w.N = N; w.A = bikeRig(kb, 0.28 * N, G); w.B = bikeRig(kb, 0.72 * N, G); w.smoke.length = w.water.length = w.sparks.length = w.drops.length = w.rainP.length = 0; }
    const A = w.A, Bk = w.B;
    if (f.section === 'change') { w.kind = rollW(rnd, PD_W, bandOf(W.a)); for (const m of w.mud) m[2] = 1; } // the washed bike back in the mud
    if (f.section === 'drop') w.floodOn = true;
    w.flood = w.floodOn ? Math.min(1, w.flood + dt * 12) : 0; // they snap on
    // the stands: both bikes up on them, the wheels hanging at full droop clear of the ground
    const stand = (V, x) => { V.x = x; V.y = gy - 7.4 * kb; V.a = 0; for (const wh of V.wh) wh.c = 0; };
    stand(A, 0.26 * N);
    stand(Bk, 0.7 * N);
    // the revving: the rear wheel's spin, driven by the throttle and run down by its own drag (first order, so exact)
    let blip = f.beat.on ? 0.35 : 0;
    for (const h of hits) if (isLow(h)) blip = Math.max(blip, 0.5 + 0.5 * h.strength);
    const thr = clamp((k === 'rev' ? 0.35 : 0.15) + 0.3 * f.rel.bassDrive + blip);
    w.om = follow(w.om, (thr * 90) / 1.6, dt, 1 / 1.6);
    A.wh[0].sp += w.om * dt;
    const pipe = [A.x - 6.6 * kb, A.y - 2.4 * kb];
    if (f.beat.on || blip > 0.5) for (let n = 0; n < 2 + Math.round(3 * blip); n++) puff(w.smoke, pipe[0], pipe[1], -0.05 * N * rnd(), -0.02 * N, 1.8, 1, 5, MID + DIM, 0.14 * N);
    // the hose: a jet of drops at the washed bike, sweeping on the snares, splashing where they hit it; ninety drops a
    // second (half that in the rain), each let go at its own moment of the frame, so the jet is unbroken at any frame rate
    const nz = [0.9 * N, gy - 0.12 * N];
    if (snareOf(hits)) w.aim = (rnd() - 0.5) * 0.5;
    const tx = Bk.x + w.aim * 12 * kb, ty = Bk.y - 2 * kb, T = 0.45, wvx = (tx - nz[0]) / T, wvy = (ty - nz[1] - 0.5 * G * T * T) / T;
    for (let n = emit(rnd, k === 'rain' ? 45 : 90, dt); n > 0; n--) {
      const vx = wvx * (0.95 + 0.1 * rnd()), vy = wvy * (0.95 + 0.1 * rnd()), ta = -rnd() * dt; // (set back by ta: the step below brings it out)
      w.water.push({ x: nz[0] + vx * ta, y: nz[1] + vy * ta + 0.5 * G * ta * ta, vx, vy: vy + G * ta, life: 1 - ta, s: 1, c: COOL, hit: false });
    }
    let n = 0;
    for (const p of w.water) {
      p.x += p.vx * dt; p.y += p.vy * dt + 0.5 * G * dt * dt; p.vy += G * dt; p.life -= dt;
      if (!p.hit && p.x < Bk.x + 8 * kb && p.x > Bk.x - 8 * kb && p.y > Bk.y - 5 * kb && p.y < Bk.y + 6 * kb) { // on the bike: a splash, and the mud there comes off
        p.hit = true;
        for (const m of w.mud) if (Math.hypot(Bk.x + m[0] * kb - p.x, Bk.y + m[1] * kb - p.y) < 3 * kb) m[2] = Math.max(0, m[2] - 0.04);
        for (let q = 0; q < 2; q++) w.drops.push({ x: p.x, y: p.y, vx: -p.vx * 0.2 + (rnd() - 0.5) * 0.15 * N, vy: -(0.05 + 0.15 * rnd()) * N, life: 0.5, s: 1, c: rnd() < 0.5 ? COOL : BRIGHT });
        continue;
      }
      if (p.life > 0 && p.y < gy) w.water[n++] = p;
    }
    w.water.length = n;
    if (w.drops.length > 120) w.drops.splice(0, w.drops.length - 120);
    // the fire barrel: sparks lifted by the hot air, slowing as it cools and mixes, drifting, going out
    const fb = [0.49 * N, gy - 0.1 * N];
    let pop = 0;
    for (const h of hits) if (h.kind === 'hat' || h.kind === 'perc') pop++;
    for (let q = emit(rnd, 8 + 20 * f.rel.trebDrive, dt) + pop * 2; q > 0; q--) w.sparks.push({ x: fb[0] + (rnd() - 0.5) * 3 * u, y: fb[1], vx: (rnd() - 0.5) * 0.06 * N, vy: -(0.25 + 0.3 * rnd()) * N, life: 1.2 + rnd(), L: 2 });
    n = 0;
    const kd = Math.exp(-dt * 1.8), k1 = (1 - kd) / 1.8, ax = 0.02 * N, ay = -0.04 * N;
    for (const p of w.sparks) { // the rise relaxes to the slow drift of the warm air (linear drag, integrated exactly)
      p.x += ax * dt + (p.vx - ax) * k1; p.y += ay * dt + (p.vy - ay) * k1;
      p.vx = ax + (p.vx - ax) * kd; p.vy = ay + (p.vy - ay) * kd;
      if ((p.life -= dt) > 0) w.sparks[n++] = p;
    }
    w.sparks.length = n;
    // the dusk: the sky in bands, a last glow low; the tents, vans and light poles in silhouette; the mud and its puddles
    const fl = w.flood;
    for (let y = Math.round(0.5 * N); y < gy; y += 2) for (let x = (y >> 1) & 1; x < N; x += 2) if (bayer(x, y) < ((y - 0.5 * N) / (0.3 * N)) * 0.6) r.buf[y * N + x] = HOT + DIM;
    haze(r, 0.15 * N, gy - 0.05 * N, 0.25 * N, HOT, 0.25);
    for (const [x0, w0, h0] of [[0.02, 0.3, 0.3], [0.58, 0.26, 0.34]]) { r.poly([[x0 * N, gy - h0 * N], [(x0 + w0) * N, gy - h0 * N], [(x0 + w0 + 0.03) * N, gy - (h0 - 0.05) * N], [(x0 - 0.03) * N, gy - (h0 - 0.05) * N]], DARK); r.rect(x0 * N, gy - (h0 - 0.05) * N, px1(u), (h0 - 0.05) * N, DARK); r.rect((x0 + w0) * N, gy - (h0 - 0.05) * N, px1(u), (h0 - 0.05) * N, DARK); }
    r.rect(0.33 * N, gy - 0.2 * N, 0.24 * N, 0.17 * N, DARK + DIM); // a van
    r.rect(0.53 * N, gy - 0.15 * N, 0.05 * N, 0.12 * N, DARK + DIM);
    for (const x of [0.16, 0.96]) {
      r.rect(x * N, gy - 0.62 * N, px1(1.4 * u), 0.62 * N, DARK);
      for (let j = -1; j <= 1; j++) { const lx = x * N + j * 3 * u, ly = gy - 0.62 * N; r.rect(lx - u, ly - u, 2 * u, 2 * u, fl > 0.5 ? WHITE : DARK); if (fl > 0) haze(r, lx, ly, 4 * u, BRIGHT, 0.5 * fl); }
      if (fl > 0) dpoly(r, [[x * N - 3 * u, gy - 0.61 * N], [x * N + 3 * u, gy - 0.61 * N], [x * N + 0.22 * N, gy], [x * N - 0.22 * N, gy]], BRIGHT, 0.16 * fl);
    }
    r.rect(0, gy, N, N - gy, MID);
    for (let y = Math.round(gy); y < N; y += Math.max(2, Math.round(2 * u))) for (let x = 0; x < N; x++) if (hash(x >> 1, y) < 0.12) r.buf[y * N + x] = DARK;
    // the puddles; lit, each shows a floodlight's glint only straight under a light that stands over it (a reflection keeps its x)
    for (const [px, py, pw] of [[0.12, 0.88, 0.1], [0.45, 0.93, 0.14], [0.8, 0.86, 0.08]]) {
      ell(r, px * N, py * N, pw * N, 0.012 * N, fl > 0.5 ? LMID : DARK + DIM);
      if (fl > 0.5) for (const lx of [0.16, 0.96]) if (Math.abs(lx - px) < 0.8 * pw) r.rect(lx * N - u, py * N - 0.4 * u, 2 * u, px1(0.8 * u), WHITE);
    }
    if (fl > 0) for (const x of [0.16, 0.96]) haze(r, x * N, gy + 0.06 * N, 0.17 * N, LMID, 0.3 * fl);
    // the generator, shaking with the level, smoking
    const gx = 0.03 * N + (rnd() - 0.5) * f.level * 1.2 * u;
    r.rect(gx, gy - 0.09 * N, 0.13 * N, 0.09 * N, LMID);
    r.rect(gx + 0.015 * N, gy - 0.075 * N, 0.1 * N, 0.03 * N, DARK);
    r.rect(gx + 0.1 * N, gy - 0.12 * N, px1(1.2 * u), 0.03 * N, DARK);
    if (rnd() < dt * 6) puff(w.smoke, gx + 0.1 * N, gy - 0.12 * N, 0, -0.02 * N, 1.5, 1, 3, DARK + DIM, 0.12 * N);
    // the fire barrel, its flames flickering
    r.rect(fb[0] - 4.5 * u, fb[1], 9 * u, gy - fb[1], DARK);
    r.rect(fb[0] - 4.5 * u, fb[1] + 3 * u, 9 * u, px1(0.8 * u), MID + DIM);
    for (let q = 0; q < 5; q++) { const fh = (4 + 5 * hash(q, Math.floor(t * 12))) * u * (0.7 + 0.5 * f.level); r.poly([[fb[0] - 4.5 * u + q * 1.8 * u, fb[1]], [fb[0] - 3.6 * u + q * 1.8 * u, fb[1] - fh], [fb[0] - 2.7 * u + q * 1.8 * u, fb[1]]], q % 2 ? HOT : BRIGHT); }
    for (const p of w.sparks) r.set(p.x, p.y, p.life > 0.6 ? BRIGHT : HOT);
    dust(W, w.smoke, 0, 0.01 * N); // smoke off the pipe and the generator, rising and drifting
    // the bikes on their stands, the mechanic crouched at the rear wheel, the washer with the hose
    for (const V of [A, Bk]) r.rect(V.x - 2 * kb, V.y + 2 * kb, 4 * kb, gy - V.y - 2 * kb, DARK);
    drawBike(r, A, A.x, A.y, kb, { plast: HOT, rider: false });
    drawBike(r, Bk, Bk.x, Bk.y, kb, { plast: COOL, rider: false });
    for (const m of w.mud) if (m[2] > 0.05) haze(r, Bk.x + m[0] * kb, Bk.y + m[1] * kb, 2.2 * kb, DARK, 0.9 * m[2]);
    const mj = walker(r, A.x + 9.5 * kb, gy, 0.24 * N, FIG, 0, -1, { cap: true, hatCol: DARK });
    r.stroke(mj.sx, mj.sy, A.x + 3 * kb, A.y - 5 * kb, px1(u), FIG); // a hand on the throttle
    const wj = walker(r, 0.93 * N, gy, 0.26 * N, FIG, 0, -1, {});
    r.stroke(wj.sx, wj.sy, nz[0], nz[1], px1(u), FIG);
    r.stroke(nz[0], nz[1], nz[0] + 0.06 * N, gy, px1(0.6 * u), COOL + DIM); // the hose back to its tap
    for (const p of w.water) r.set(p.x, p.y, COOL);
    fly(W, w.drops, G, (x) => gy);
    // the rain kind: a drizzle slanting down, rings on the puddles
    if (k === 'rain') {
      while (w.rainP.length < 60) w.rainP.push({ x: rnd() * N * 1.2, y: rnd() * gy, v: (0.8 + 0.4 * rnd()) * N });
      for (const p of w.rainP) { p.y += p.v * dt; p.x -= p.v * 0.15 * dt; if (p.y > gy) { p.y = 0; p.x = rnd() * N * 1.2; } r.line(p.x, p.y, p.x + 0.6 * u, p.y - 2.5 * u, LMID + DIM); }
    }
    targets.push({ x: A.x - 9 * kb, y: A.y - 5 * kb, w: 18 * kb, h: 12 * kb });
  },
};

const WORLDS = { motocross, freestylemx, whoops, trials, enduro, desertrally, monstertruck, mudbog, rockcrawl, atvdunes, hillclimb, paddock };
registerFamily('offroad', WORLD_DEFS, WORLDS);
export const OFFROAD_STYLE = makeMixStyle('OFF ROAD', ['offroad']);
