// Tactical cinema, mixed: the visual tropes of the cinematic stealth-action game and the "strand" road game as
// pictures. A base from above with vision cones, a cardboard box in a corridor, a comms screen, a porter under a
// tower of packages, a rope over a chasm, a walking tank, two snipers in the snow, a nano swarm, a motorbike over
// the ridges, an industrial elevator, handprints on a tar beach, the long cutscene. Original silhouettes and sets
// only: no names, logos, character designs or words (the alert mark is a bar with a dot). Every world draws with
// the palette roles, so any palette, treatment and layout of the mixer fits; each has a table of kinds weighed by
// the arousal band, rolled again on a section change, with a heavy turn on a drop.
import { clamp, lerp, bayer } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow, wrapAngle, followAngle, ease,
  beatLocked, hash, pickW, walker, snowfall, particles, burst, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight; `themes`: what
// each is about, for the mixer's reading of the track's meaning
export const WORLD_DEFS = {
  visioncones: { name: 'vision cones', va: [[M, H], [M, M], [L, M]], pals: ['phosphor', 'military', 'noir', 'blueprint', 'thermal'], fx: ['hud', 'none', 'crt', 'code'], themes: ['paranoia', 'night', 'war'] },
  cardboard: { name: 'the cardboard box', va: [[M, H], [M, M], [L, M]], pals: ['military', 'noir', 'bureau', 'sepia', 'amber'], fx: ['film', 'none', 'vhs', 'crt'], themes: ['play', 'paranoia'] },
  codec: { name: 'the codec call', va: [[L, M], [L, L], [M, L]], pals: ['phosphor', 'amber', 'noir', 'blueprint', 'machine'], fx: ['crt', 'none', 'hud', 'code'], themes: ['machine', 'night', 'paranoia'] },
  porter: { name: 'the porter', va: [[M, L], [M, M], [L, L]], pals: ['ice', 'silver', 'sepia', 'midnight', 'bureau'], fx: ['film', 'none', 'vhs'], themes: ['lonely', 'nature', 'dream'] },
  ladderchasm: { name: 'the rope over the chasm', va: [[M, L], [M, M], [L, L]], pals: ['ice', 'silver', 'sepia', 'midnight', 'bureau'], fx: ['film', 'none', 'vhs'], themes: ['lonely', 'nature'] },
  walkingtank: { name: 'the walking tank', va: [[M, H], [M, M], [L, H]], pals: ['military', 'machine', 'thermal', 'noir', 'blueprint'], fx: ['hud', 'crt', 'none', 'film'], themes: ['war', 'machine', 'rage'] },
  sniperfield: { name: 'snipers in the snow', va: [[M, H], [L, M]], pals: ['ice', 'silver', 'noir', 'thermal', 'military'], fx: ['hud', 'film', 'none', 'vhs'], themes: ['war', 'paranoia', 'nature'] },
  nanoswarm: { name: 'the nano swarm', va: [[M, H], [H, H]], pals: ['machine', 'thermal', 'phosphor', 'blueprint', 'midnight'], fx: ['none', 'crt', 'hud', 'code'], themes: ['machine', 'rave', 'dream'] },
  motorbike: { name: 'the ridge rider', va: [[M, L], [M, M], [L, L]], pals: ['sepia', 'amber', 'silver', 'ice', 'bureau'], fx: ['film', 'none', 'vhs'], themes: ['lonely', 'speed', 'nature'] },
  elevator: { name: 'the long descent', va: [[L, M], [M, L]], pals: ['noir', 'bureau', 'machine', 'amber', 'phosphor'], fx: ['film', 'none', 'crt', 'vhs'], themes: ['machine', 'void', 'lonely'] },
  handprints: { name: 'handprints on the tar', va: [[L, M], [L, L]], pals: ['noir', 'silver', 'midnight', 'sepia', 'bureau'], fx: ['film', 'vhs', 'none'], themes: ['void', 'occult', 'lonely'] },
  cutscene: { name: 'the long cutscene', va: [[L, M], [L, L], [M, L]], pals: ['silver', 'noir', 'sepia', 'midnight', 'amber'], fx: ['film', 'none', 'vhs'], themes: ['lonely', 'dream', 'night'] },
};

// the arousal band a mood falls in (low, mid, high): the kind tables below weigh their kinds by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const beatS = (f) => (f.bpm ? 60 / f.bpm : 0.5); // seconds per beat
const dim = (c) => (c < DIM ? c + DIM : c); // the dimmed twin of a role (the dimmed ones, black and white stay)
const GRAV = 1.6; // screens a second squared: what the mixer's particles fall with
// a clock in beats: the analysis's count and phase while it has the tempo, else free-running at two a second
function beatT(W) {
  const { f, w, dt } = W;
  w.bt = beatLocked(f) ? f.beat.count + f.beat.phase : (w.bt || 0) + dt * (f.bpm ? f.bpm / 60 : 2);
  return w.bt;
}
// a sample of the waveform at q (0..1 across it); a sine of the level when the frame has none
const waveAt = (f, q, ph = 0) => { const wv = f.wave; return wv && wv.length ? wv[(q * wv.length) | 0] : Math.sin(q * TAU * 3 + ph) * 0.3 * f.level; };
// a rect and a disc drawn as a dither: only the pixels whose hash falls under `d` (0..1), the same ones every frame
function ditherRect(r, x, y, w, h, c, d) {
  if (d >= 1) { r.rect(x, y, w, h, c); return; }
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y)), x1 = Math.min(r.N, Math.round(x + w)), y1 = Math.min(r.N, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) if (hash(xx, yy) < d) r.buf[yy * r.N + xx] = c;
}
function ditherDisc(r, cx, cy, rad, c, d) {
  if (d >= 1) { r.disc(cx, cy, rad, c); return; }
  const r2 = rad * rad;
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2 && hash(x, y) < d) r.set(x, y, c);
    }
}
// a column one cell wide, h cells down from y: what rect(x, y, 1, h) draws, written straight into the buffer
function vcol(r, x, y, h, c) {
  const N = r.N, b = r.buf, xi = Math.round(x);
  if (xi < 0 || xi >= N) return;
  for (let i = Math.max(0, Math.round(y)) * N + xi, e = Math.min(N, Math.round(y + h)) * N; i < e; i += N) b[i] = c;
}
// the distance along a ray from (ox, oy) heading (dx, dy) to the segment a-b, `max` when it misses
function rayHit(ox, oy, dx, dy, ax, ay, bx, by, max) {
  const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
  if (den > -1e-9 && den < 1e-9) return max;
  const sx = ax - ox, sy = ay - oy, t = (sx * ey - sy * ex) / den, s = (sx * dy - sy * dx) / den;
  return t > 0 && t < max && s >= 0 && s <= 1 ? t : max;
}
// a smooth rolling ground line, 0..1 of the height, X in screens
const rolling = (X, s) => 0.5 + 0.22 * Math.sin(X * 1.7 + s) + 0.13 * Math.sin(X * 4.3 + s * 2.1) + 0.06 * Math.sin(X * 9.1 + s * 0.7);
// Two feet that stay planted while the hips go by (world units): a foot swings forward in an arc once the hips are
// more than half a stride ahead of it, the two alternating, and lands half a stride ahead of where the hips will
// be; standing still, nothing moves. fe = [{x, from, to, p}, ...], p = 1 when planted; `lift` of a foot is sin(pi p).
function stepFeet(fe, hipX, stride, speed, dt) {
  const sw = fe[0].p < 1 ? fe[0] : fe[1].p < 1 ? fe[1] : null;
  if (sw) { sw.p = Math.min(1, sw.p + (dt * Math.max(speed, stride * 0.6)) / (0.45 * stride)); sw.x = lerp(sw.from, sw.to, ease(sw.p)); return; }
  const rear = fe[0].x < fe[1].x ? fe[0] : fe[1];
  if (speed > 1e-3 && hipX - rear.x > stride * 0.5) { rear.from = rear.x; rear.to = hipX + stride * 0.95; rear.p = 0; }
}
const footLift = (fe) => (fe.p < 1 ? Math.sin(fe.p * Math.PI) : 0);
// the knee of a two-segment leg from the hip to the foot (law of cosines), bent to `side` (+1 forward on screen)
function knee(hx, hy, fx, fy, l1, l2, side) {
  const dx = fx - hx, dy = fy - hy, d = Math.max(1e-3, Math.hypot(dx, dy)), dd = Math.min(d, l1 + l2 - 1e-3);
  const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  return [hx + ux * a + side * -uy * h, hy + uy * a + side * ux * h];
}
// the alert mark: a bar with a dot under it, over (x, y)
function alertMark(r, x, y, u, c = HOT) {
  const bw = Math.max(1, Math.round(1.3 * u));
  r.rect(x - bw / 2, y - 6.5 * u, bw, 4 * u, c);
  r.rect(x - bw / 2, y - 1.5 * u, bw, bw, c);
}
// A catenary of length L hung between (x1, y1) and (x2, y2) (cells, y down) in a gravity tilted by `tilt` (radians,
// + toward +x): n + 1 points into the flat array `out`. Solved in the frame where the gravity points down: the
// parameter a from sinh(z)/z = sqrt(L^2 - v^2)/h with z = h/2a (bisection), then the lowest point; a taut one is straight.
function catenary(x1, y1, x2, y2, L, tilt, n, out) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, c = Math.cos(tilt), s = Math.sin(tilt);
  let ax = (x1 - mx) * c - (y1 - my) * s, ay = (x1 - mx) * s + (y1 - my) * c, bx = (x2 - mx) * c - (y2 - my) * s, by = (x2 - mx) * s + (y2 - my) * c;
  if (bx < ax) { [ax, bx] = [bx, ax]; [ay, by] = [by, ay]; }
  const h = Math.max(1e-3, bx - ax), v = ay - by, rho = Math.sqrt(Math.max(0, L * L - v * v)) / h; // v: how much higher b is (y up)
  let a = 0, x0 = 0, C = 0;
  if (rho > 1.0005) {
    let lo = 1e-3, hi = 8;
    for (let k = 0; k < 40; k++) { const z = (lo + hi) / 2; if (Math.sinh(z) / z > rho) hi = z; else lo = z; }
    const z = (lo + hi) / 2;
    a = h / (2 * z); x0 = (ax + bx) / 2 - a * Math.asinh(v / (2 * a * Math.sinh(z))); C = -ay - a * Math.cosh((ax - x0) / a);
  }
  for (let k = 0; k <= n; k++) {
    const x = ax + (h * k) / n, y = a ? -(a * Math.cosh((x - x0) / a) + C) : lerp(ay, by, k / n);
    out[2 * k] = mx + x * c + y * s; out[2 * k + 1] = my - x * s + y * c;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- visioncones
// A base from above: walls and crates, guards walking their waypoints with a vision cone each, cut by the walls
// (every cone edge is a ray cast against the wall segments, so the lit floor is exactly what the guard can see),
// a sneaking figure dashing from cover to cover on the beat and freezing while a cone sweeps by. A heavy snare
// raises the alert mark over a guard: the cones go hot and the guards converge on the last seen spot, then
// search, then go back to their rounds; a drop is a full alert, every cone hot and sweeping.
const BASE_W = { yard: [3, 2, 1], depot: [2, 3, 2], compound: [1, 2, 3] };
const BASES = { yard: { walls: 3, crates: 6, guards: 2, R: 0.32 }, depot: { walls: 5, crates: 8, guards: 3, R: 0.28 }, compound: { walls: 7, crates: 9, guards: 4, R: 0.25 } };
const RAYS = 28, HALF = 0.42;
const inRect = (b, x, y, m = 0) => x > b.x - m && x < b.x + b.w + m && y > b.y - m && y < b.y + b.h + m;
// a straight run from a to b that crosses no wall segment
function clearRun(segs, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1e-6;
  for (let i = 0; i < segs.length; i += 4) if (rayHit(ax, ay, dx / d, dy / d, segs[i], segs[i + 1], segs[i + 2], segs[i + 3], d) < d) return false;
  return true;
}
// the cone of a guard at (gx, gy) looking along `head`: RAYS rays cast against the walls, into `pts` (cells)
function castCone(segs, gx, gy, head, R, N, pts) {
  pts[0][0] = gx * N; pts[0][1] = gy * N;
  for (let k = 0; k <= RAYS; k++) {
    const a = head - HALF + (2 * HALF * k) / RAYS, dx = Math.cos(a), dy = Math.sin(a);
    let d = R;
    for (let i = 0; i < segs.length; i += 4) d = rayHit(gx, gy, dx, dy, segs[i], segs[i + 1], segs[i + 2], segs[i + 3], d);
    pts[k + 1][0] = (gx + dx * d) * N; pts[k + 1][1] = (gy + dy * d) * N;
  }
}
// 2 when the guard sees (x, y), 1 when his cone is about to, 0 otherwise
function sees(segs, g, R, x, y) {
  const dx = x - g.x, dy = y - g.y, d = Math.hypot(dx, dy);
  if (d > R) return 0;
  const da = Math.abs(wrapAngle(Math.atan2(dy, dx) - g.head));
  if (da > HALF * 1.6) return 0;
  if (!clearRun(segs, g.x, g.y, x, y)) return 0;
  return da < HALF ? 2 : 1;
}
function buildBase(W) {
  const { w, rnd } = W, K = BASES[w.kind], boxes = [], crates = [];
  const free = (b, m) => boxes.every((o) => !(b.x < o.x + o.w + m && b.x + b.w + m > o.x && b.y < o.y + o.h + m && b.y + b.h + m > o.y));
  for (let k = 0; k < 200 && boxes.length < K.walls; k++) {
    const vert = rnd() < 0.5, len = 0.12 + rnd() * 0.25, th = 0.03;
    const b = vert ? { x: 0.1 + rnd() * 0.77, y: 0.1 + rnd() * (0.8 - len), w: th, h: len } : { x: 0.1 + rnd() * (0.8 - len), y: 0.1 + rnd() * 0.77, w: len, h: th };
    if (free(b, 0.08)) boxes.push(b);
  }
  const nw = boxes.length;
  for (let k = 0; k < 300 && boxes.length < nw + K.crates; k++) {
    const sz = 0.04 + rnd() * 0.03, b = { x: 0.06 + rnd() * 0.86, y: 0.06 + rnd() * 0.86, w: sz, h: sz * (0.7 + rnd() * 0.6) };
    if (free(b, 0.06)) { boxes.push(b); crates.push(b); }
  }
  // what every cone is cast against: the four sides of each box and the rim of the base
  const segs = new Float32Array(16 + boxes.length * 16);
  segs.set([0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 0, 0]);
  boxes.forEach((b, i) => segs.set([b.x, b.y, b.x + b.w, b.y, b.x + b.w, b.y, b.x + b.w, b.y + b.h, b.x + b.w, b.y + b.h, b.x, b.y + b.h, b.x, b.y + b.h, b.x, b.y], 16 + i * 16));
  const open = (x, y) => x > 0.04 && x < 0.96 && y > 0.04 && y < 0.96 && boxes.every((b) => !inRect(b, x, y, 0.025));
  const spot = () => { for (let k = 0; k < 60; k++) { const x = rnd(), y = rnd(); if (open(x, y)) return [x, y]; } return [0.5, 0.5]; };
  const guards = [];
  for (let g = 0; g < K.guards; g++) {
    const wps = [spot()];
    for (let k = 0; k < 80 && wps.length < 4; k++) {
      const p = spot(), q = wps[wps.length - 1], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d > 0.15 && d < 0.5 && clearRun(segs, q[0], q[1], p[0], p[1])) wps.push(p);
    }
    const a = wps[0], z = wps[wps.length - 1], loop = wps.length > 2 && clearRun(segs, z[0], z[1], a[0], a[1]); // a round only if the way back is clear, else back and forth
    guards.push({ x: a[0], y: a[1], wps, wi: wps.length > 1 ? 1 : 0, dir: 1, loop, head: rnd() * TAU, ph: 0, wait: 0, scan: rnd() * TAU, sw: g % 2 ? 1 : -1 });
  }
  const sx = spot();
  Object.assign(w, { boxes, nw, crates, segs, guards, R: K.R, sneak: { x: sx[0], y: sx[1], tx: sx[0], ty: sx[1], moving: false, freeze: 0, ph: 0 }, mark: null, markT: 0 });
}
// a figure from above: feet that swap with `ph`, a bar of shoulders across the heading, a head; a gun ahead
function topFigure(r, x, y, head, h, ph, col, hc, gun) {
  const cx = Math.cos(head), sy = Math.sin(head), px = -sy, py = cx, st = Math.sin(ph) * h * 0.3, fs = Math.max(1, h * 0.18);
  r.rect(x + px * h * 0.2 + cx * st - fs / 2, y + py * h * 0.2 + sy * st - fs / 2, fs, fs, dim(col));
  r.rect(x - px * h * 0.2 - cx * st - fs / 2, y - py * h * 0.2 - sy * st - fs / 2, fs, fs, dim(col));
  r.stroke(x + px * h * 0.42, y + py * h * 0.42, x - px * h * 0.42, y - py * h * 0.42, Math.max(1.5, h * 0.3), col);
  if (gun) r.line(x + px * h * 0.25, y + py * h * 0.25, x + px * h * 0.25 + cx * h * 0.75, y + py * h * 0.25 + sy * h * 0.75, LMID);
  r.disc(x, y, Math.max(0.8, h * 0.22), hc);
}

const visioncones = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, BASE_W, bandOf(W.a)), alert: 0, search: 0, seen: null, drop: 0, flash: 0, blink: null, cone: Array.from({ length: RAYS + 2 }, () => [0, 0]) });
    buildBase(W);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, bs = beatS(f);
    if (f.section === 'change') { w.kind = rollW(rnd, BASE_W, bandOf(W.a)); buildBase(W); }
    const { segs, guards, sneak, boxes } = w;
    const raise = (g) => { w.mark = g; w.markT = 1.5; w.alert = 1; w.seen = [sneak.x, sneak.y]; };
    const nearest = () => guards.reduce((b, g) => (Math.hypot(g.x - sneak.x, g.y - sneak.y) < Math.hypot(b.x - sneak.x, b.y - sneak.y) ? g : b), guards[0]);
    if (f.section === 'drop') { w.drop = 8 * bs; raise(nearest()); }
    for (const h of hits) {
      if (h.kind === 'snare' && h.strength > 0.6 && w.alert < 0.5) raise(nearest());
      else if (isLow(h)) w.flash = Math.max(w.flash, h.strength);
      else if (isTonal(h) && w.crates.length) { const c = pick(rnd, w.crates); w.blink = { x: c.x + c.w / 2, y: c.y + c.h / 2, t: 0.6 }; }
    }
    // the alert decays over six beats into a search, the search over six more into the rounds
    if (w.drop > 0) { w.drop -= dt; w.alert = 1; } else w.alert = Math.max(0, w.alert - dt / (6 * bs));
    w.search = w.alert > 0 ? 1 : Math.max(0, w.search - dt / (6 * bs));
    w.flash *= Math.exp(-dt * 8);
    w.markT -= dt;
    const hot = w.alert > 0, drop = w.drop > 0, speed = (0.05 + 0.07 * f.rel.midDrive) * (hot ? 1.8 : 1), R = w.R * (1 + 0.08 * f.beat.pulse) * (hot ? 1.15 : 1);
    // the floor: a grid of studs, the rim
    const step = Math.max(2, Math.round(8 * u));
    for (let y = step / 2; y < N; y += step) for (let x = step / 2; x < N; x += step) r.set(x, y, DARK);
    // the guards: their rounds, or the run to the last seen spot (never through a wall: a guard stops at it and looks),
    // and afterwards back the way they came (each leg of a run was straight and clear) to the round they left
    for (const g of guards) {
      let moved = 0;
      if (hot && w.seen) {
        if (g.chase !== w.seen) { g.chase = w.seen; g.trail ||= []; if (g.trail.length < 8) g.trail.push([g.x, g.y]); } // where this run starts
        const dx = w.seen[0] - g.x, dy = w.seen[1] - g.y, d = Math.hypot(dx, dy);
        if (d > 0.06) {
          const st = Math.min(d, speed * dt), nx = g.x + (dx / d) * st, ny = g.y + (dy / d) * st;
          if (boxes.every((b) => !inRect(b, nx, ny, 0.02))) { g.x = nx; g.y = ny; moved = st; }
          g.head = followAngle(g.head, Math.atan2(dy, dx), dt, 0.2);
        } else g.head += Math.cos((g.scan += dt * 2.5)) * dt * 2.2; // at the spot: looking about
        if (drop) g.head += dt * 2 * g.sw; // full alert: the cones sweep round
      } else if (g.trail && g.trail.length) {
        g.chase = null;
        const [tx, ty] = g.trail[g.trail.length - 1], dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy), st = Math.min(d, speed * dt);
        if (d < 0.005) g.trail.pop();
        else { g.x += (dx / d) * st; g.y += (dy / d) * st; moved = st; g.head = followAngle(g.head, Math.atan2(dy, dx) + Math.sin(t * 3 + g.scan) * 0.6, dt, 0.25); }
      } else {
        const [tx, ty] = g.wps[g.wi], dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
        if (g.wait > 0) { g.wait -= dt; g.head += Math.cos((g.scan += dt * 2)) * dt * (w.search > 0 ? 2.5 : 0.9); }
        else if (d < 0.01 || g.wps.length < 2) {
          g.wait = 0.5 + rnd();
          const n = g.wps.length;
          if (g.loop) g.wi = (g.wi + 1) % n;
          else { if (g.wi + g.dir < 0 || g.wi + g.dir >= n) g.dir = -g.dir; g.wi = clamp(g.wi + g.dir, 0, n - 1); }
        } else {
          const st = Math.min(d, speed * dt);
          g.x += (dx / d) * st; g.y += (dy / d) * st; moved = st;
          g.head = followAngle(g.head, Math.atan2(dy, dx) + (w.search > 0 ? Math.sin(t * 3 + g.scan) * 0.6 : 0), dt, 0.25);
        }
        if (f.beat.on && !g.wait) g.scan += 0.3; // a glance on the beat
      }
      g.ph += moved / 0.012; // the feet swap with the ground covered
      castCone(segs, g.x, g.y, g.head, R, N, w.cone);
      r.poly(w.cone, hot ? HOT + DIM : w.search > 0 ? LMID + DIM : MID + DIM);
      const ec = w.flash > 0.3 ? BRIGHT : hot ? HOT : MID;
      r.line(w.cone[0][0], w.cone[0][1], w.cone[1][0], w.cone[1][1], ec);
      r.line(w.cone[0][0], w.cone[0][1], w.cone[RAYS + 1][0], w.cone[RAYS + 1][1], ec);
    }
    // the walls over the light, then the crates
    boxes.forEach((b, i) => {
      r.rect(b.x * N, b.y * N, Math.max(1, b.w * N), Math.max(1, b.h * N), i < w.nw ? LMID : MID);
      if (i >= w.nw) r.frame(Math.round(b.x * N), Math.round(b.y * N), Math.max(2, Math.round(b.w * N)), Math.max(2, Math.round(b.h * N)), DARK);
    });
    if (w.blink && (w.blink.t -= dt) > 0) r.rect(w.blink.x * N - u, w.blink.y * N - u, Math.max(1, 2 * u), Math.max(1, 2 * u), Math.floor(w.blink.t * 12) % 2 ? COOL : BRIGHT);
    // the sneak: freezes while a cone comes near, dashes to the next cover on the beat, is caught when a cone lands on it
    let near = 0, seenBy = null;
    for (const g of guards) { const v = sees(segs, g, R, sneak.x, sneak.y); if (v > near) { near = v; seenBy = g; } }
    if (near === 2 && w.alert < 0.5) raise(seenBy);
    if (near >= 1) { sneak.freeze = 0.4; if (sneak.moving) { sneak.moving = false; sneak.tx = sneak.x; sneak.ty = sneak.y; } }
    else sneak.freeze -= dt;
    if (f.beat.on && sneak.freeze <= 0 && !sneak.moving && (hot || f.beat.count % 2 === 0) && w.crates.length) {
      // the next cover: the far side of a crate from the nearest guard, a spot in the open that a straight dash
      // reaches without crossing a wall or a crate
      const g = nearest(), picks = [];
      for (const c of w.crates) {
        const cx = c.x + c.w / 2, cy = c.y + c.h / 2, d = Math.hypot(cx - sneak.x, cy - sneak.y);
        if (d < 0.1 || d > 0.42) continue;
        const ax = cx - g.x, ay = cy - g.y, al = Math.hypot(ax, ay) || 1, tx = clamp(cx + (ax / al) * (c.w / 2 + 0.025), 0.03, 0.97), ty = clamp(cy + (ay / al) * (c.h / 2 + 0.025), 0.03, 0.97);
        if (boxes.every((b) => !inRect(b, tx, ty, 0.012)) && clearRun(segs, sneak.x, sneak.y, tx, ty)) picks.push([tx, ty]);
      }
      if (picks.length) { const [tx, ty] = pick(rnd, picks); sneak.tx = tx; sneak.ty = ty; sneak.moving = true; }
    }
    if (sneak.moving) {
      const dx = sneak.tx - sneak.x, dy = sneak.ty - sneak.y, d = Math.hypot(dx, dy), st = Math.min(d, 0.45 * dt);
      if (d < 1e-4) sneak.moving = false; else { sneak.x += (dx / d) * st; sneak.y += (dy / d) * st; sneak.ph += st / 0.01; sneak.head = Math.atan2(dy, dx); }
      if (d <= st) sneak.moving = false;
    }
    const gh = 7 * u;
    for (const g of guards) { topFigure(r, g.x * N, g.y * N, g.head, gh, g.ph, hot ? HOT : LMID, FIG, true); targets.push({ x: g.x * N - gh / 2, y: g.y * N - gh / 2, w: gh, h: gh }); }
    topFigure(r, sneak.x * N, sneak.y * N, sneak.head ?? 0, sneak.freeze > 0 ? gh * 0.7 : gh * 0.85, sneak.ph, COOL, FIG, false);
    if (w.mark && w.markT > 0) alertMark(r, w.mark.x * N, w.mark.y * N - 2 * u, u);
    targets.push({ x: sneak.x * N - gh / 2, y: sneak.y * N - gh / 2, w: gh, h: gh });
    r.frame(0, 0, N, N, LMID);
  },
};

// ---------------------------------------------------------------------------------------------- cardboard
// A corridor from the side: a cardboard box shuffling along, one hop a beat (a little lift and a set-down), that
// stops dead whenever a guard's look or the camera's cone falls its way; the guards walk the corridor at their
// own pace and turn round on a snare, the camera pans with the mid clock, steam blows on the kicks, a lamp moves
// with the notes. A drop: the box leaps off, the figure under it sprints and dives into a floor vent in a
// parabola, and the grate slides shut; the box turns up again at the far end.
const HALL_W = { pipes: [3, 2, 1], lockers: [2, 3, 2], lab: [1, 2, 3] };
const HALLS = { pipes: { guards: 1, cams: 1 }, lockers: { guards: 2, cams: 1 }, lab: { guards: 2, cams: 2 } };
function buildHall(W) {
  const { w, rnd, N } = W, K = HALLS[w.kind];
  w.guards = Array.from({ length: K.guards }, (_, i) => ({ x: (0.2 + 0.5 * rnd()) * N, dir: i % 2 ? -1 : 1, ph: rnd() * TAU, turn: 0, hot: 0 }));
  w.cams = Array.from({ length: K.cams }, (_, i) => ({ x: (K.cams > 1 ? 0.25 + 0.5 * i : 0.55) * N, ph: rnd() * TAU }));
  w.vent = { x: (0.6 + rnd() * 0.25) * N };
  w.valve = (0.1 + rnd() * 0.8) * N;
}
const cardboard = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, HALL_W, bandOf(W.a)), box: { x: 0.12 * W.N, dir: 1, hop: null, hid: 0 }, dp: null, grate: 0, puffs: [], lamp: 2, alarm: 0, bt: 0 });
    buildHall(W);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.74 * N, bs = beatS(f), { box, vent } = w, gN = GRAV * N, bw = 14 * u, bh = 11 * u;
    if (f.section === 'change') { w.kind = rollW(rnd, HALL_W, bandOf(W.a)); buildHall(W); }
    if (f.section === 'drop' && !w.dp) { // the box thrown up off him, tumbling a quarter turn by the time it comes down on its side
      const y0 = g - bh / 2, vx = -box.dir * 0.25 * N, vy = -0.8 * N, T = (-vy + Math.sqrt(vy * vy + 2 * gN * (bh - bw) / 2)) / gN;
      w.dp = { t: 0, st: 0, fig: { x: box.x, y: g, vx: 0, vy: 0, ph: 0, dir: vent.x > box.x ? 1 : -1 }, loose: { x: box.x, y: y0, vx, vy, ang: 0, va: (Math.sign(vx) * Math.PI) / 2 / T, rest: false } };
      w.grate = 1;
    }
    for (const h of hits) {
      if (h.kind === 'snare' && w.guards.length) { const gd = pick(rnd, w.guards); gd.dir = -gd.dir; gd.turn = 0.4; }
      else if (isLow(h)) for (let k = 0; k < 6; k++) w.puffs.push({ x: w.valve, y: g - 0.3 * N, vx: (rnd() - 0.2) * 0.1 * N, vy: -(0.1 + rnd() * 0.15) * N, rad: u, life: 1 + rnd() * 0.6 });
      else if (isTonal(h)) w.lamp = h.pc % 6;
    }
    w.alarm = Math.max(0, w.alarm - dt);
    // the set: wall, floor, the dressing of the kind
    r.rect(0, 0, N, g, DARK + DIM);
    r.rect(0, g, N, N - g, DARK);
    r.rect(0, g, N, Math.max(1, u), MID);
    r.rect(0, 0.17 * N, N, Math.max(1, u), MID + DIM);
    for (let k = 0; k < 6; k++) { const lx = (0.1 + k * 0.16) * N; r.rect(lx - 3 * u, 0.17 * N, 6 * u, 1.5 * u, k === w.lamp ? BRIGHT : DARK); if (k === w.lamp) ditherRect(r, lx - 10 * u, 0.18 * N, 20 * u, 0.12 * N, MID, 0.3); }
    if (w.kind === 'pipes') {
      for (const py of [0.3, 0.42]) { r.rect(0, py * N, N, 3 * u, MID + DIM); r.rect(0, py * N, N, Math.max(1, u), LMID + DIM); for (let x = 0.05 * N; x < N; x += 0.18 * N) r.rect(x, py * N - u, 2 * u, 5 * u, MID); }
      r.ring(w.valve, 0.3 * N + 1.5 * u, 3 * u, Math.max(1, u), LMID);
    } else if (w.kind === 'lockers') {
      for (let x = 0.03 * N; x < N; x += 0.09 * N) { r.rect(x, 0.3 * N, 0.07 * N, g - 0.3 * N, MID + DIM); r.frame(Math.round(x), Math.round(0.3 * N), Math.round(0.07 * N), Math.round(g - 0.3 * N), DARK); for (let k = 0; k < 3; k++) r.rect(x + 0.02 * N, 0.34 * N + k * 2.5 * u, 0.03 * N, Math.max(1, u), DARK); }
    } else {
      for (let x = 0.08 * N; x < N; x += 0.3 * N) { r.rect(x, 0.28 * N, 0.18 * N, 0.2 * N, BG); r.frame(Math.round(x), Math.round(0.28 * N), Math.round(0.18 * N), Math.round(0.2 * N), LMID + DIM); }
      for (let k = 0; k < 10; k++) r.rect((0.1 + k * 0.085) * N, 0.6 * N, 2 * u, 2 * u, hash(k, f.beat.count) < 0.5 ? COOL : DARK);
      r.rect(0, 0.58 * N, N, 1.5 * u, MID + DIM);
    }
    if (w.kind !== 'pipes') { const vy = g - 0.3 * N; r.rect(w.valve - 3 * u, vy - 2 * u, 6 * u, 4 * u, DARK); for (let k = 0; k < 2; k++) r.rect(w.valve - 3 * u, vy - u + k * 2 * u, 6 * u, Math.max(1, 0.5 * u), MID + DIM); } // where the steam comes from (the lower pipe, in the pipes)
    // the vent in the floor: a dark hole under a slatted grate that slides open for the drop
    const vw = 12 * u, gx = vent.x - vw / 2 - w.grate * vw;
    r.rect(vent.x - vw / 2, g, vw, 2 * u, BLACK);
    r.rect(gx, g, vw, Math.max(1, 2 * u), LMID);
    for (let k = 1; k < 5; k++) r.rect(gx + (k * vw) / 5, g, Math.max(1, u * 0.8), 2 * u, DARK);
    // the camera: a housing under the ceiling, its cone panning with the mid clock; hot while the alarm is on
    let camOn = false;
    for (const c of w.cams) {
      const a = Math.sin(f.rel.midClock * 0.6 + c.ph) * 0.55, cy = 0.2 * N, fx = c.x + Math.tan(a) * (g - cy), sp = 5 * u + 0.03 * N;
      r.poly([[c.x, cy], [fx - sp, g], [fx + sp, g]], w.alarm > 0 ? HOT + DIM : COOL + DIM);
      r.rect(c.x - 3 * u, cy - 3 * u, 6 * u, 3 * u, MID);
      r.rect(c.x - u, cy - u, 2 * u, 2 * u, w.alarm > 0 ? HOT : COOL);
      if (!w.dp && Math.abs(box.x - fx) < sp + 3 * u) { camOn = true; if (box.hop && box.hop.p > 0.15 && box.hop.p < 0.85 && w.alarm <= 0) w.alarm = 2 * bs; }
    }
    // the guards: their own pace, a look cone ahead; on the alarm the nearest hurries to the box
    const ghh = 0.2 * N;
    let looked = camOn;
    for (const gd of w.guards) {
      const hurry = w.alarm > 0 && gd === w.guards[0];
      let v = (0.06 + 0.06 * f.rel.midDrive) * N * (hurry ? 2 : 1);
      if (hurry) { const d = box.x - gd.x; if (Math.abs(d) < 10 * u) v = 0; else gd.dir = Math.sign(d); }
      if (gd.turn > 0) { gd.turn -= dt; v = 0; }
      gd.x += gd.dir * v * dt;
      gd.ph += (v * dt * Math.PI) / (0.2 * ghh); // a step (half a cycle) for each fifth of his height covered: the walker's stride
      if (gd.x < 0.06 * N) gd.dir = 1; else if (gd.x > 0.94 * N) gd.dir = -1;
      const ex = gd.x + gd.dir * 2 * u, ey = g - ghh * 0.85, len = 0.26 * N;
      r.poly([[ex, ey], [ex + gd.dir * len, g], [ex + gd.dir * len * 0.95, ey - 2 * u]], hurry ? HOT + DIM : LMID + DIM);
      if ((box.x - ex) * gd.dir > 0 && (box.x - ex) * gd.dir < len) looked = true;
      walker(r, gd.x, g, ghh, FIG, gd.ph, gd.dir, { cap: true, hatCol: DARK });
      r.line(gd.x + gd.dir * 2 * u, g - ghh * 0.55, gd.x + gd.dir * 7 * u, g - ghh * 0.58, LMID);
      if (hurry) alertMark(r, gd.x, g - ghh - 2 * u, u);
      targets.push({ x: gd.x - ghh * 0.25, y: g - ghh, w: ghh * 0.5, h: ghh });
    }
    // the box: a hop a beat unless looked at, the hop a lift and a set-down over a third of the beat; looked at in
    // the middle of one, it stops where it is and is set straight down
    if (!w.dp) {
      if (looked) { box.hid = 0.3; if (box.hop) { box.hop.from = box.hop.to = box.x; box.hop.p = Math.max(box.hop.p, 1 - box.hop.p); } } else box.hid -= dt;
      if (f.beat.on && box.hid <= 0 && !box.hop) {
        let to = box.x + box.dir * 5 * u;
        if (to > 0.9 * N || to < 0.1 * N) { box.dir = -box.dir; to = box.x + box.dir * 5 * u; }
        box.hop = { from: box.x, to, p: 0 };
      }
      let lift = 0;
      if (box.hop) { box.hop.p = Math.min(1, box.hop.p + dt / (0.38 * bs)); lift = Math.sin(box.hop.p * Math.PI) * 3 * u; box.x = lerp(box.hop.from, box.hop.to, box.hop.p); if (box.hop.p >= 1) box.hop = null; }
      r.rect(box.x - bw / 2 + u, g - u, bw - 2 * u, Math.max(1, u), BLACK); // the shadow stays on the floor
      const by = g - bh - lift;
      r.rect(box.x - bw / 2, by, bw, bh, box.hid > 0 ? MID : LMID);
      r.frame(Math.round(box.x - bw / 2), Math.round(by), Math.round(bw), Math.round(bh), DARK);
      r.rect(box.x - u * 0.5, by, Math.max(1, u), bh * 0.4, DARK);
      r.rect(box.x - bw / 2, by + bh * 0.4, bw, Math.max(1, u), DARK);
      targets.push({ x: box.x - bw / 2, y: by, w: bw, h: bh });
    } else {
      // the drop: the box flies off and lands on its side, the figure sprints, dives into the vent, the grate shuts
      const D = w.dp, F = D.fig, B = D.loose, fh = 0.2 * N;
      D.t += dt;
      if (!B.rest) { // tumbling on its parabola; down on its side, it slides to a stop
        B.x += B.vx * dt; B.y += B.vy * dt + 0.5 * gN * dt * dt; B.vy += gN * dt; B.ang += B.va * dt;
        if (B.vy > 0 && B.y >= g - bw / 2) { B.rest = true; B.y = g - bw / 2; B.vy = 0; B.ang = (Math.sign(B.va) * Math.PI) / 2; }
      } else { B.vx *= Math.exp(-dt * 10); B.x += B.vx * dt; }
      if (B.rest) {
        r.rect(B.x - bh / 2, B.y - bw / 2, bh, bw, LMID);
        r.frame(Math.round(B.x - bh / 2), Math.round(B.y - bw / 2), Math.round(bh), Math.round(bw), DARK);
      } else {
        const c = Math.cos(B.ang), sn = Math.sin(B.ang), P = (dx, dy) => [B.x + dx * c - dy * sn, B.y + dx * sn + dy * c], q = [P(-bw / 2, -bh / 2), P(bw / 2, -bh / 2), P(bw / 2, bh / 2), P(-bw / 2, bh / 2)];
        r.poly(q, LMID);
        for (let k = 0; k < 4; k++) r.line(q[k][0], q[k][1], q[(k + 1) % 4][0], q[(k + 1) % 4][1], DARK);
      }
      if (D.st === 0) { // the sprint, to a stride short of the vent (never past it), then the dive
        const left = (vent.x - F.x) * F.dir - 7 * u, st = Math.min(0.55 * N * dt, Math.max(0, left));
        F.x += F.dir * st; F.ph += (st * Math.PI) / (0.2 * fh);
        if (left - st <= 1e-6) { const T = 0.35; D.st = 1; F.vx = (vent.x - F.x) / T; F.vy = (fh * 0.55) / T - 0.5 * gN * T; }
        walker(r, F.x, g, fh, FIG, F.ph, F.dir, { cap: true });
      } else if (D.st === 1) {
        F.x += F.vx * dt; F.y += F.vy * dt + 0.5 * gN * dt * dt; F.vy += gN * dt;
        const ang = Math.atan2(F.vy, F.vx * F.dir), len = fh * 0.8; // the body along its flight
        r.stroke(F.x, F.y - fh * 0.5, F.x + F.dir * Math.cos(ang) * len * 0.5, F.y - fh * 0.5 + Math.sin(ang) * len * 0.5, 3 * u, FIG);
        r.disc(F.x + F.dir * Math.cos(ang) * len * 0.5, F.y - fh * 0.5 + Math.sin(ang) * len * 0.5, 2 * u, FIG);
        r.rect(0, g + 2 * u, N, N - g - 2 * u, DARK); // the floor hides what has gone down the vent
        r.rect(vent.x - vw / 2, g + 2 * u, vw, 2 * u, BLACK);
        if (F.y - fh * 0.5 > g + 4 * u) D.st = 2;
      } else {
        w.grate = Math.max(0, w.grate - dt / 0.4);
        if (w.grate <= 0) { w.dp = null; box.x = F.dir > 0 ? 0.08 * N : 0.92 * N; box.dir = F.dir > 0 ? 1 : -1; box.hop = null; box.hid = 0; }
      }
      if (D.st < 2) targets.push({ x: F.x - fh * 0.3, y: F.y - fh, w: fh * 0.6, h: fh });
    }
    // steam: rises and slows, spreads and thins
    w.puffs = w.puffs.filter((p) => {
      p.vy = follow(p.vy, -0.02 * N, dt, 0.5); p.vx *= Math.exp(-dt); p.x += p.vx * dt; p.y += p.vy * dt; p.rad += dt * 4 * u; p.life -= dt;
      ditherDisc(r, p.x, p.y, p.rad, LMID, clamp(p.life * 0.8));
      return p.life > 0;
    });
    if (w.alarm > 0 && Math.floor(t * 8) % 2) r.rect(0, 0.17 * N, N, Math.max(1, u), HOT);
    if (w.dp && w.dp.t < 0.1) s.shake = Math.max(s.shake, 0.2);
  },
};

// ---------------------------------------------------------------------------------------------- codec
// A comms screen: two faceless portraits in frames left and right, speaking in turn, a scanline waveform of the
// mid band across the face of whoever talks and a flat line on the other; a frequency dial between them steps
// with the tonal hits, the frames pulse on the kicks, static on the snares, a carrier dot blinks on the beat and
// a bar rolls down the screen with the bars. A drop: a third portrait pushes up from below and the frequency slews.
const CALL_W = { duo: [3, 2, 1], ops: [2, 3, 2], crisis: [1, 2, 3] };
const CALLS = { duo: { every: 8 }, ops: { every: 4 }, crisis: { every: 2 } };
const BUSTS = ['plain', 'beret', 'headset', 'longhair', 'bandana'];
// a bust in a frame: shoulders, neck, a head with its dressing; faceless. The face area is returned for the waveform.
function bust(r, x, y, w, h, B, col, u) {
  const cx = x + w / 2, hr = w * 0.16, hy = y + h * 0.4;
  r.rect(x + w * 0.12, y + h * 0.66, w * 0.76, h * 0.4, col);
  r.rect(cx - w * 0.07 - B.sh * w * 0.1, y + h * 0.56, w * 0.14 + B.sh * w * 0.2, h * 0.12, col);
  r.disc(cx, hy, hr, col);
  if (B.kind === 'beret') { r.rect(cx - hr * 1.2, hy - hr * 0.95, hr * 2.4, hr * 0.5, dim(col)); r.rect(cx - hr * 0.9, hy - hr * 1.35, hr * 1.5, hr * 0.5, dim(col)); }
  else if (B.kind === 'headset') { r.ring(cx, hy, hr * 1.05, Math.max(1, u), LMID, 1); r.rect(cx + hr * 0.8, hy - hr * 0.2, hr * 0.5, hr * 0.8, LMID); r.line(cx + hr, hy + hr * 0.6, cx + hr * 0.2, hy + hr * 1.1, LMID); }
  else if (B.kind === 'longhair') { r.rect(cx - hr * 1.3, hy - hr * 0.6, hr * 0.5, hr * 2.6, dim(col)); r.rect(cx + hr * 0.8, hy - hr * 0.6, hr * 0.5, hr * 2.6, dim(col)); r.rect(cx - hr, hy - hr * 1.1, hr * 2, hr * 0.6, dim(col)); }
  else if (B.kind === 'bandana') { r.rect(cx - hr * 1.05, hy - hr * 0.55, hr * 2.1, hr * 0.35, LMID); r.line(cx + hr, hy - hr * 0.4, cx + hr * 1.8, hy + hr * 0.4, LMID); }
  return { fx: cx - hr * 0.8, fy: hy, fw: hr * 1.6, fh: hr * 1.2 };
}
const codec = {
  init(W) {
    const { w, rnd } = W;
    const mk = () => ({ kind: pick(rnd, BUSTS), sh: rnd() });
    Object.assign(w, { kind: rollW(rnd, CALL_W, bandOf(W.a)), busts: [mk(), mk(), mk()], talker: 0, freq: 0.5, ftarget: 0.5, stat: 0, pulse: 0, dp: null, bits: Array.from({ length: 24 }, () => rnd() < 0.4), bt: 0, slew: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, bs = beatS(f), bt = beatT(W), K = CALLS[w.kind];
    if (f.section === 'change') { w.kind = rollW(rnd, CALL_W, bandOf(W.a)); w.busts[w.talker] = { kind: pick(rnd, BUSTS), sh: rnd() }; }
    if (f.section === 'drop') w.dp = { t: 0, len: 8 * bs };
    for (const h of hits) {
      if (h.kind === 'snare') w.stat = Math.max(w.stat, h.strength);
      else if (isLow(h)) w.pulse = Math.max(w.pulse, h.strength);
      else if (isTonal(h)) w.ftarget = h.pc / 11;
      else if (h.kind === 'hat') for (let k = 0; k < 3; k++) w.bits[Math.floor(rnd() * w.bits.length)] ^= true;
    }
    if (f.beat.on && f.beat.count % K.every === 0) w.talker = 1 - w.talker;
    w.stat *= Math.exp(-dt * 5); w.pulse *= Math.exp(-dt * 6);
    if (w.dp) { w.dp.t += dt; if ((w.slew -= dt) <= 0) { w.slew = 0.25 * bs; w.ftarget = rnd(); } if (w.dp.t > w.dp.len + 0.5 * bs) w.dp = null; }
    w.freq = follow(w.freq, w.ftarget, dt, 0.08);
    const voice = f.rel.midDrive > 0.12 || f.level > 0.25, intr = w.dp ? clamp(w.dp.t < 0.5 * bs ? w.dp.t / (0.5 * bs) : w.dp.t > w.dp.len ? 1 - (w.dp.t - w.dp.len) / (0.5 * bs) : 1) : 0;
    // the rolling bar of the screen, once in four beats, on the background only
    const by = ((bt / 4) % 1) * N;
    for (let y = Math.floor(by - 3 * u); y <= by + 3 * u; y++) if (y >= 0 && y < N) for (let x = 0; x < N; x++) if (r.buf[y * N + x] === BG) r.buf[y * N + x] = DARK + DIM;
    // the two portraits, and the one from below
    const fw = 0.32 * N, fh = 0.42 * N, fy = 0.2 * N, frames = [[0.06 * N, fy], [0.62 * N, fy]];
    if (intr > 0) frames.push([0.34 * N, lerp(N + 2, 0.56 * N, ease(intr))]);
    frames.forEach(([x, y], i) => {
      const talking = voice && (intr > 0.5 ? i === 2 : i === w.talker);
      r.rect(x, y, fw, fh, DARK);
      const face = bust(r, x, y, fw, fh, w.busts[i], MID, u);
      // the waveform of the voice, scanline by scanline across the face; a flat line when silent
      const amp = face.fh * 0.5 * (0.5 + f.rel.midDrive), n = Math.max(4, Math.round(face.fw));
      for (let k = 0; k < n; k++) {
        const px = face.fx + (k / n) * face.fw, v = talking ? waveAt(f, k / n, f.rel.midClock) * 2.5 : 0, yy = face.fy + clamp(v, -1, 1) * amp;
        if (talking) r.rect(px, Math.min(yy, face.fy), 1, Math.max(1, Math.abs(yy - face.fy)), k % 2 ? COOL : BRIGHT);
        else r.set(px, face.fy, COOL + DIM);
      }
      if (talking && w.stat > 0.08) { // static: speckle and torn rows, inside this frame only
        const n2 = Math.round(w.stat * fw * fh * 0.08);
        for (let k = 0; k < n2; k++) r.set(x + rnd() * fw, y + rnd() * fh, rnd() < 0.5 ? LMID : BLACK);
        for (let yy = Math.round(y); yy < y + fh; yy += 2) if (rnd() < w.stat * 0.5) {
          const dx = Math.round((rnd() - 0.5) * w.stat * 6 * u), x0 = Math.round(x), x1 = Math.min(N, Math.round(x + fw)), row = r.buf.subarray(yy * N + x0, yy * N + x1), cp = row.slice();
          for (let xx = 0; xx < row.length; xx++) row[xx] = cp[(((xx - dx) % row.length) + row.length) % row.length];
        }
      }
      r.frame(Math.round(x), Math.round(y), Math.round(fw), Math.round(fh), w.pulse > 0.4 ? BRIGHT : talking ? LMID : MID);
      if (w.kind === 'crisis' && talking && w.stat > 0.5) alertMark(r, x + fw / 2, y - 2 * u, u);
      targets.push({ x, y, w: fw, h: fh });
    });
    // the frequency dial between them: ticks, the needle stepping with the notes, the carrier dot, the meter
    const dx0 = 0.41 * N, dw = 0.18 * N, dy = 0.47 * N;
    r.rect(dx0, dy, dw, Math.max(1, u), MID);
    for (let k = 0; k <= 8; k++) r.rect(dx0 + (k / 8) * dw, dy - (k % 4 ? 1.5 : 3) * u, Math.max(1, u * 0.8), (k % 4 ? 1.5 : 3) * u, LMID);
    const nx = dx0 + w.freq * dw;
    r.rect(nx - u * 0.5, dy - 4 * u, Math.max(1, u), 7 * u, BRIGHT);
    r.rect(nx - u, dy + 3 * u, Math.max(1, 2 * u), Math.max(1, 2 * u), HOT);
    r.disc(0.5 * N, 0.38 * N, 2 * u, f.beat.pulse > 0.5 ? BRIGHT : DARK);
    const lvl = Math.round(f.level * 8);
    for (let k = 0; k < 8; k++) r.rect(dx0 + k * (dw / 8), 0.56 * N, dw / 8 - u, 2 * u, k < lvl ? (k > 5 ? HOT : COOL) : DARK);
    if (w.kind !== 'duo') w.bits.forEach((on, i) => r.rect(0.06 * N + i * ((0.88 * N) / 24), 0.7 * N, (0.88 * N) / 24 - u, 2 * u, on ? LMID : DARK)); // the data strip
    if (w.kind === 'crisis' && w.pulse > 0.3) r.frame(0, 0, N, N, HOT);
    if (w.dp && w.dp.t < 0.1) r.rect(0, 0, N, N, w.dp.t < 0.05 ? WHITE : BG);
  },
};

// ---------------------------------------------------------------------------------------------- porter
// A lone porter crossing a desolate country from the side, a tower of packages strapped to the back: the tower
// is an inverted pendulum (it leans with the slope and with every change of pace, the porter leans against it),
// the packages shift on the kicks and the top one falls off, bounces and is left behind when the lean goes past
// the limit; the feet stay planted while the hips go by. Time-rain on a section greys the grass where it fell,
// a stream opens ahead and a ladder is laid over it; tethered floating figures hide as dither until the shoulder
// scanner fans out on a snare and points at them. A drop: a stumble, the packages tumble, he gets up and re-stacks.
const TRAIL_W = { plain: [3, 2, 1], rocks: [2, 3, 2], ruins: [1, 2, 3] };
const TRAILS = { plain: { pk: 4, speed: 0.05 }, rocks: { pk: 5, speed: 0.06 }, ruins: { pk: 7, speed: 0.07 } };
function stackTower(w, n, u) {
  w.tower = { th: 0, om: 0, pk: [] };
  let h = 0;
  for (let k = 0; k < n; k++) { const hh = (4 - k * 0.25) * u, ww = (10 - k * 0.8) * u; w.tower.pk.push({ h, hh, ww, sh: 0 }); h += hh; }
}
const porter = {
  init(W) {
    const { w, rnd, N, u } = W;
    Object.assign(w, { kind: rollW(rnd, TRAIL_W, bandOf(W.a)), seed: rnd() * 10, X: 0, v: 0, vPrev: 0, feet: [{ x: -2 * u, from: 0, to: 0, p: 1 }, { x: 3 * u, from: 0, to: 0, p: 1 }], loose: [], rain: 0, grey: [],
      ghosts: [], scan: 0, scanAt: null, streams: [], props: [], st: null, drops: Array.from({ length: 60 }, () => ({ x: rnd() * N, y: rnd() * N })), nextProp: 0.5 * N, nextGhost: 0.8 * N, dust: [] });
    stackTower(w, TRAILS[w.kind].pk, u);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bs = beatS(f), xp = 0.36 * N, gN = GRAV * N, K = TRAILS[w.kind], T = w.tower;
    // the ground at a world X (cells): rolling country, dips carved where the streams are; what he stands on is that or a laid ladder
    const gnd = (X) => { let y = (0.52 + 0.2 * (rolling(X / N, w.seed) - 0.5)) * N; for (const S of w.streams) { const d = Math.abs(X - S.X) / (S.w / 2); if (d < 1) y += S.depth * (1 - d * d); } return y; };
    const stand = (X) => { let y = gnd(X); for (const S of w.streams) if (S.ladder >= 1 && Math.abs(X - S.X) < S.w / 2 + 2 * u) y = Math.min(y, lerp(S.y0, S.y1, (X - S.X + S.w / 2) / S.w)); return y; };
    if (f.section === 'change') {
      w.kind = rollW(rnd, TRAIL_W, bandOf(W.a)); w.rain = 8 * bs; w.grey.push([w.X + 0.07 * N, w.X + 0.07 * N]); if (w.grey.length > 8) w.grey.shift();
      if (!w.streams.some((S) => S.X > w.X)) { const X = w.X + 0.9 * N, sw = 0.12 * N; w.streams.push({ X, w: sw, depth: 0.06 * N, ladder: 0, y0: 0, y1: 0 }); }
    }
    if (f.section === 'drop' && !w.st) w.st = { t: 0 };
    for (const h of hits) {
      if (isLow(h)) { T.om += (rnd() - 0.5) * 2 * h.strength * 1.8; T.pk.forEach((p, k) => { p.sh += (rnd() - 0.5) * u * h.strength * (k / T.pk.length) * 2; }); }
      else if (h.kind === 'snare' && h.strength > 0.4) { w.scan = 1; w.scanAt = null; let best = 0.5 * N; for (const gh of w.ghosts) { const d = Math.abs(gh.X - w.X); if (d < best) { best = d; w.scanAt = gh; } } if (w.scanAt) w.scanAt.rev = 1; }
    }
    // pace: slow, surging a little on the beat, held while a ladder is laid or he is down
    const laying = w.streams.find((S) => S.ladder < 1 && w.X > S.X - S.w / 2 - 0.08 * N && w.X < S.X);
    let want = (K.speed + 0.07 * f.rel.bassDrive) * N * (1 + 0.3 * f.beat.pulse);
    if (Math.abs(T.th) > 0.25) want *= 0.5;
    if (laying || w.st) want = 0;
    w.v = follow(w.v, want, dt, 0.4);
    const ax = (w.v - w.vPrev) / Math.max(dt, 1e-3);
    w.vPrev = w.v;
    w.X += w.v * dt;
    if (laying) { laying.ladder = Math.min(1, laying.ladder + dt / 0.6); laying.y0 = gnd(laying.X - laying.w / 2 - u); laying.y1 = gnd(laying.X + laying.w / 2 + u); }
    // the tower: an inverted pendulum on the back, the porter's lean the control; theta > 0 is a lean backward
    const Lt = Math.max(2 * u, T.pk.length ? T.pk[T.pk.length - 1].h + T.pk[T.pk.length - 1].hh : 2 * u), w2 = gN / Lt;
    const slope = (stand(w.X + 3 * u) - stand(w.X - 3 * u)) / (6 * u), thEq = Math.atan(slope) * 0.5;
    if (!w.st && T.pk.length) { // (in steps of 1/120 s: a short tower is a stiff one)
      for (let n = Math.ceil(dt * 120), hs = dt / n, k = 0; k < n; k++) {
        const acc = w2 * Math.sin(T.th) + (ax / Lt) * Math.cos(T.th) - 2.4 * w2 * (T.th - thEq) - 0.9 * Math.sqrt(w2) * T.om;
        T.om += acc * hs; T.th += T.om * hs;
      }
      T.pk.forEach((p) => { p.sh *= Math.exp(-dt * 2); });
    }
    // feet, hips, body: the hips ride highest as he passes over the planted foot (while the other swings)
    const stride = 0.075 * N;
    if (!w.st) stepFeet(w.feet, w.X, stride, w.v, dt);
    const legH = 0.09 * N, lift = Math.max(footLift(w.feet[0]), footLift(w.feet[1])), hy0 = stand(w.X) - legH - lift * u;
    // the world: far ridges, near ridges, the ground column by column, grass or greyed grass on top, water in the streams
    const drawX = (X) => xp + (X - w.X);
    for (let x = 0; x < N; x++) {
      const X = w.X + (x - xp), gy = gnd(X);
      const far = (0.38 + 0.1 * (rolling(X / N * 0.3 + 3, w.seed + 1) - 0.5)) * N, mid = (0.45 + 0.12 * (rolling(X / N * 0.55 + 7, w.seed + 2) - 0.5)) * N;
      vcol(r, x, far, Math.max(0, gy - far), LMID + DIM);
      vcol(r, x, mid, Math.max(0, gy - mid), MID + DIM);
      vcol(r, x, gy, N - gy, DARK);
      const grey = w.grey.some(([a, b]) => X >= a && X <= b);
      vcol(r, x, gy, Math.max(1, 1.5 * u), grey ? MID + DIM : COOL + DIM);
      for (const S of w.streams) if (Math.abs(X - S.X) < S.w / 2 * 0.8) { const lvl = gnd(S.X - S.w / 2) + 2 * u; if (gy > lvl) vcol(r, x, lvl, gy - lvl, COOL + DIM); }
    }
    // props of the kind, ahead of him as he walks, forgotten behind
    while (w.nextProp < w.X + 0.8 * N) { w.props.push({ X: w.nextProp, k: rnd(), h: (3 + rnd() * 6) * u }); w.nextProp += (0.25 + rnd() * 0.5) * N; }
    w.props = w.props.filter((p) => p.X > w.X - 0.5 * N);
    for (const p of w.props) {
      const x = drawX(p.X), gy = gnd(p.X);
      if (w.kind === 'rocks') r.disc(x, gy + p.h * 0.2, p.h * 0.7, DARK + DIM);
      else if (w.kind === 'ruins') { r.rect(x - 1.5 * u, gy - p.h * 2, 3 * u, p.h * 2, DARK + DIM); if (p.k < 0.5) r.rect(x - 3 * u, gy - p.h * 2, 6 * u, Math.max(1, u), MID + DIM); }
      else if (p.k < 0.3) r.rect(x, gy - p.h, Math.max(1, u), p.h, DARK + DIM);
    }
    // the ladders laid over the streams: swung down from the near bank, then flat across it
    for (const S of w.streams) if (S.ladder > 0) {
      const x0 = drawX(S.X - S.w / 2 - u), y0 = S.y0, a = (-Math.PI / 2) * (1 - ease(S.ladder)), len = S.w + 2 * u, x1 = x0 + Math.cos(a) * len, y1 = lerp(y0, S.y1, ease(S.ladder)) + Math.sin(a) * len;
      for (const k of [-1, 1]) r.line(x0, y0 + k * u, x1, y1 + k * u, LMID);
      for (let q = 0.1; q < 1; q += 0.15) r.rect(lerp(x0, x1, q) - u * 0.5, lerp(y0, y1, q) - u, Math.max(1, u), 2 * u + 1, LMID);
    }
    w.streams = w.streams.filter((S) => S.X > w.X - 0.6 * N);
    // the floating figures on their tethers, a dither until the scanner shows them
    while (w.nextGhost < w.X + 0.8 * N) { w.ghosts.push({ X: w.nextGhost, hov: (0.1 + rnd() * 0.08) * N, rev: 0, ph: rnd() * TAU }); w.nextGhost += (0.5 + rnd() * 0.8) * N; }
    w.ghosts = w.ghosts.filter((gh) => gh.X > w.X - 0.5 * N);
    for (const gh of w.ghosts) {
      gh.rev = Math.max(0, gh.rev - dt * 0.5);
      const x = drawX(gh.X), gy = gnd(gh.X), fy = gy - gh.hov + Math.sin(t * 0.7 + gh.ph) * 2 * u, d = 0.15 + 0.85 * gh.rev, fh = 0.1 * N;
      let ly = gy;
      for (let k = 1; k <= 4; k++) { const ny = lerp(gy, fy, k / 4); if (hash(k, Math.floor(gh.X)) < d + 0.2) r.line(x + Math.sin(t + k) * u, ly, x + Math.sin(t + k + 1) * u, ny, dim(COOL)); ly = ny; }
      ditherRect(r, x - 2 * u, fy - fh * 0.75, 4 * u, fh * 0.45, FIG, d);
      ditherRect(r, x - 1.5 * u, fy - fh * 0.3, 1.2 * u, fh * 0.3, FIG, d);
      ditherRect(r, x + 0.3 * u, fy - fh * 0.3, 1.2 * u, fh * 0.3, FIG, d);
      ditherDisc(r, x, fy - fh * 0.85, 1.8 * u, FIG, d);
    }
    // the loose packages: thrown, falling, bouncing, left behind
    for (const p of w.loose) { // (one coming back goes up to its own slot on the back, over the pivot)
      if (p.back) { p.back.p = Math.min(1, p.back.p + dt / 0.3); const q = p.back.p; p.X = lerp(p.back.X0, w.X + (w.pvo || 0), q); p.y = lerp(p.back.y0, p.back.y1, q) - Math.sin(q * Math.PI) * 6 * u; continue; }
      if (!p.rest) {
        p.vy += gN * dt; p.X += p.vx * dt; p.y += p.vy * dt;
        const gy = gnd(p.X) - p.hh / 2;
        if (p.y > gy) { p.y = gy; if (p.vy > 0.04 * N) p.vy = -p.vy * 0.35; else { p.vy = 0; p.rest = true; } p.vx *= 0.6; }
      }
      const x = drawX(p.X);
      r.rect(x - p.ww / 2, p.y - p.hh / 2, p.ww, p.hh, p.c);
      r.frame(Math.round(x - p.ww / 2), Math.round(p.y - p.hh / 2), Math.max(2, Math.round(p.ww)), Math.max(2, Math.round(p.hh)), DARK);
    }
    w.loose = w.loose.filter((p) => p.back || p.X > w.X - 0.45 * N);
    // the porter: legs to the planted feet (the knee forward), the body leaning against the tower (forward as it tips
    // back, and into the slope), the tower, the straps
    const dirLean = 0.2 + T.th * 0.5 - thEq, down = w.st ? clamp(w.st.t < 0.35 ? w.st.t / 0.35 : w.st.t < 2 ? 1 : w.st.t < 2.6 ? 1 - (w.st.t - 2) / 0.6 : 0) : 0;
    const hy = hy0 + down * legH * 0.8, bodyA = lerp(dirLean, 1.35, ease(down)), bl = 0.1 * N;
    const shx = xp + Math.sin(bodyA) * bl, shy = hy - Math.cos(bodyA) * bl;
    for (const fe of w.feet) {
      const fx = drawX(fe.x), fy = stand(fe.x) - footLift(fe) * 2.5 * u, [kx, ky] = knee(xp, hy, fx, fy, legH * 0.56, legH * 0.56, -1);
      r.stroke(xp, hy, kx, ky, Math.max(1, 1.6 * u), FIG);
      r.stroke(kx, ky, fx, fy, Math.max(1, 1.6 * u), FIG);
      r.rect(fx - u, fy - u, 2.5 * u, Math.max(1, u), FIG);
    }
    r.stroke(xp, hy, shx, shy, Math.max(2, 3 * u), FIG);
    r.disc(shx + Math.sin(bodyA) * 2.5 * u, shy - Math.cos(bodyA) * 2.5 * u, 2 * u, FIG);
    r.stroke(shx, shy, shx + 3 * u, shy + 4 * u, Math.max(1, 1.3 * u), FIG);
    // the tower from the pivot at the shoulders, each package up the lean, shifted its own way
    const pvx = shx - 2 * u, pvy = shy + u, pX = w.X + pvx - xp; // pX: the pivot in the world
    w.pvo = pvx - xp;
    T.pk.forEach((p, k) => {
      const cx = pvx - Math.sin(T.th) * (p.h + p.hh / 2) + p.sh, cy = pvy - Math.cos(T.th) * (p.h + p.hh / 2);
      r.rect(cx - p.ww / 2, cy - p.hh / 2, p.ww, p.hh, k % 2 ? LMID : MID);
      r.frame(Math.round(cx - p.ww / 2), Math.round(cy - p.hh / 2), Math.max(2, Math.round(p.ww)), Math.max(2, Math.round(p.hh)), DARK);
    });
    if (T.pk.length) { const top = T.pk[T.pk.length - 1], tx = pvx - Math.sin(T.th) * (top.h + top.hh), ty = pvy - Math.cos(T.th) * (top.h + top.hh); r.line(tx, ty, shx + 3 * u, shy + 2 * u, DARK); }
    // the top package falls off past the limit: from where it was, with the speed it had, off the top of the lean; he
    // catches the rest (a jerk that takes most of its swing), and no other goes until it is back within bounds
    if (Math.abs(T.th) < 0.25) T.spill = false;
    if (!w.st && !T.spill && Math.abs(T.th) > 0.36 && T.pk.length > 1) {
      const p = T.pk.pop(), hh = p.h + p.hh / 2;
      w.loose.push({ X: pX - Math.sin(T.th) * hh + p.sh, y: pvy - Math.cos(T.th) * hh, vx: w.v - Math.cos(T.th) * T.om * hh, vy: Math.sin(T.th) * T.om * hh, ww: p.ww, hh: p.hh, c: T.pk.length % 2 ? LMID : MID, rest: false });
      T.om *= 0.4; T.spill = true;
    }
    // the shoulder scanner: a mast whose arms fan out on a snare, then a pointer to the figure it found
    w.scan = Math.max(0, w.scan - dt / 1.5);
    const mx = shx + 2 * u, my = shy - 3 * u, open = clamp(w.scan * 2 - 0.4);
    r.rect(mx - u * 0.5, my, Math.max(1, u), 3 * u, LMID);
    for (const k of [-1, 1]) for (const a of [0.4, 0.9]) r.line(mx, my, mx + Math.sin(a * open) * 3.5 * u * k, my - Math.cos(a * open) * 3.5 * u, w.scan > 0 ? COOL : LMID);
    if (w.scanAt && w.scan > 0.3) { const gx = drawX(w.scanAt.X), gy = gnd(w.scanAt.X) - w.scanAt.hov; for (let q = 0; q < 1; q += 0.08) r.set(lerp(mx, gx, q), lerp(my, gy, q), COOL); }
    // the stumble: down, the packages tumble; up again; the packages come back one by one
    if (w.st) {
      const S = w.st;
      S.t += dt;
      if (S.t - dt <= 0 && T.pk.length) { // the first frame: everything on the back flies
        T.pk.forEach((p, k) => { const hh = p.h + p.hh / 2; w.loose.push({ X: pX - Math.sin(T.th) * hh + p.sh, y: pvy - Math.cos(T.th) * hh, vx: (0.1 + rnd() * 0.2) * N, vy: -(0.1 + rnd() * 0.3) * N, ww: p.ww, hh: p.hh, c: k % 2 ? LMID : MID, rest: false, mine: k }); }); // each from where it was on the back
        T.pk.length = 0; T.th = 0; T.om = 0; s.shake = Math.max(s.shake, 0.4);
      }
      if (S.t > 2.6) { // one package a quarter second, back to its slot in order
        const mine = w.loose.filter((p) => p.mine !== undefined).sort((a, b) => a.mine - b.mine);
        const idx = Math.floor((S.t - 2.6) / 0.25);
        if (idx < mine.length && !mine[idx].back) { const k = mine[idx].mine; mine[idx].back = { p: 0, X0: mine[idx].X, y0: mine[idx].y, y1: pvy - (4 * k - 0.125 * k * (k - 1)) * u - mine[idx].hh / 2 }; } // the middle of its slot (stackTower's heights)
        for (const p of mine) if (p.back && p.back.p >= 1) { const k = p.mine; const h = T.pk.length ? T.pk[T.pk.length - 1].h + T.pk[T.pk.length - 1].hh : 0; T.pk.push({ h, hh: p.hh, ww: p.ww, sh: 0 }); w.loose.splice(w.loose.indexOf(p), 1); }
        if (!mine.length || (idx >= mine.length && mine.every((p) => !p.back))) { w.st = null; w.loose = w.loose.filter((p) => p.mine === undefined); }
      }
    }
    // time-rain over the country ahead of him; it greys the grass it falls on
    if (w.rain > 0) {
      w.rain -= dt;
      const G = w.grey[w.grey.length - 1];
      if (G) G[1] = Math.max(G[1], w.X + 0.66 * N);
      for (const d of w.drops) {
        d.y += dt * 1.4 * N; d.x -= dt * 0.1 * N;
        if (d.y > gnd(w.X + (d.x - xp))) { d.y = -rnd() * 0.2 * N; d.x = xp + 0.05 * N + rnd() * (0.95 * N - xp); }
        if (d.x > xp + 0.05 * N) r.rect(d.x, d.y, 1, 3 * u, LMID + DIM);
      }
    }
    w.grey = w.grey.filter(([, b]) => b > w.X - 0.5 * N);
    targets.push({ x: xp - 6 * u, y: hy - 0.2 * N, w: 12 * u, h: 0.2 * N + legH });
  },
};

// ---------------------------------------------------------------------------------------------- ladderchasm
// A chasm from the side, ladders and ropes across it, every rope a catenary of its own length hung in the gravity
// the wind tilts, so a gust (the treble) swings it about its chord. A porter crosses the top rope hand over hand, a
// reach a beat: the rope takes his weight in a V (he hangs where the two lengths either side of his grip meet), it
// bounces on the kicks, and he swings under it as a pendulum, pushed by the gusts and by every reach. Birds circle
// far below, a pebble drops off the lip on a snare; a drop: the lookout on the near rim throws a new rope across in
// a parabola, the anchor bites the far wall and the rope is hauled into its catenary (the oldest of two is cut loose).
const CHASM_W = { gorge: [3, 2, 1], canyon: [2, 3, 2], icefall: [1, 2, 3] };
const CHASMS = { gorge: { gap: 0.5, ropes: 1, ladders: 1, birds: 5, jag: 1 }, canyon: { gap: 0.62, ropes: 2, ladders: 1, birds: 7, jag: 1.4 }, icefall: { gap: 0.44, ropes: 1, ladders: 2, birds: 2, jag: 0.4 } };
function buildChasm(W) {
  const { w, rnd, N, u } = W, K = CHASMS[w.kind], eL = new Float32Array(N), eR = new Float32Array(N);
  const topL = Math.round(0.4 * N), topR = Math.round(0.36 * N), p1 = rnd() * TAU, p2 = rnd() * TAU, p3 = rnd() * TAU;
  for (let y = 0; y < N; y++) {
    const q = y / N, j = (Math.sin(q * 7.1 + p1) * 0.022 + Math.sin(q * 17.3 + p2) * 0.01) * K.jag * N;
    eL[y] = y < topL ? -1 : (0.5 - K.gap / 2 + 0.05 * (q - 0.4) + Math.sin(q * 5.3 + p3) * 0.02) * N + j;
    eR[y] = y < topR ? N + 1 : (0.5 + K.gap / 2 - 0.04 * (q - 0.36) + Math.sin(q * 4.1 + p1) * 0.02) * N + j * 0.8;
  }
  const span = (kind, ax, ay, bx, by, slack) => ({ kind, ax, ay, bx, by, sx: ax, L: Math.hypot(bx - ax, by - ay) * slack, tilt: 0, tv: 0, cut: null, thrown: false });
  const spans = [span('main', eL[topL], topL, eR[topR], topR, 1.03)];
  for (let k = 0; k < K.ladders; k++) { // a ladder where the walls come closest in its band of the depth, its ends on the ledges
    let best = Math.round((0.5 + k * 0.13) * N), bw = 1e9;
    for (let y = Math.round((0.45 + k * 0.13) * N); y < (0.56 + k * 0.13) * N; y++) if (eR[y] - eL[y] < bw) { bw = eR[y] - eL[y]; best = y; }
    spans.push(span('ladder', eL[best] - u, best, eR[best] + u, best, 1));
  }
  for (let k = 0; k < K.ropes; k++) { const y1 = Math.round((0.42 + rnd() * 0.22) * N), y2 = clamp(Math.round(y1 + (rnd() - 0.5) * 0.08 * N), topR + 2, N - 1); spans.push(span('rope', eL[y1], y1, eR[y2], y2, 1.02 + rnd() * 0.05)); }
  const birds = Array.from({ length: K.birds }, () => {
    const cy = (0.62 + rnd() * 0.16) * N, yy = Math.round(cy), half = (eR[yy] - eL[yy]) / 2;
    return { cx: (eL[yy] + eR[yy]) / 2, cy, R: Math.max(2 * u, half * (0.3 + rnd() * 0.45)), th: rnd() * TAU, om: (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.3), ph: rnd() * TAU, flap: 0 };
  });
  Object.assign(w, { eL, eR, spans, birds, mt: rnd() * TAU, cat: new Float32Array(34) });
  if (!w.pt || w.N !== N) w.pt = { st: 'in', x: -0.05 * N, ph: 0, s: 0.03, g0: 0, g1: 0.05, reach: null, phi: 0, om: 0, b: 0, bv: 0, load: 0, tOut: 0, init: true, hx: 0, hy: 0, vx: 0, vy: 0 };
  w.N = N;
}
const ladderchasm = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, CHASM_W, bandOf(W.a)), wind: 0, pebbles: [], chips: [], throw: null, N: 0, pt: null });
    buildChasm(W);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bs = beatS(f), g = GRAV * N;
    if (f.section === 'change') w.kind = rollW(rnd, CHASM_W, bandOf(W.a));
    if (f.section === 'change' || w.N !== N) buildChasm(W);
    const { eL, eR, spans, pt } = w, M = spans[0], topL = M.ay, topR = M.by, lookX = eL[topL] - 0.14 * N, fh = 0.12 * N;
    const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n; // the stiff bits in steps of 1/120 s
    // the wind: gusts that rise with the treble, blowing toward +x
    w.wind = follow(w.wind, (0.12 + f.rel.trebDrive) * (0.6 + 0.4 * Math.sin(t * 0.8 + Math.sin(t * 0.31) * 3)), dt, 0.35);
    const Fw = w.wind * 0.25 * g;
    for (const hh of hits) {
      if (isLow(hh)) pt.bv += 0.05 * N * hh.strength;
      else if (hh.kind === 'snare') { const left = rnd() < 0.5, y = left ? topL : topR; w.pebbles.push({ x: left ? eL[y] + 1 : eR[y] - 1, y: y + 1, vx: (left ? 1 : -1) * (0.01 + rnd() * 0.03) * N, vy: 0 }); }
      else if (isTonal(hh) && w.birds.length) w.birds[hh.pc % w.birds.length].flap = 0.8;
    }
    if (f.section === 'drop' && !w.throw) {
      const thrown = spans.filter((sp) => sp.thrown && !sp.cut);
      if (thrown.length >= 2) { const o = thrown[0]; o.cut = { th: Math.atan2(o.bx - o.ax, o.by - o.ay), om: 0 }; }
      const ty = Math.round(clamp(topR + (0.04 + rnd() * 0.12) * N, topR + 1, N - 1));
      w.throw = { st: 0, t: 0, tx: eR[ty] + 0.5, ty, x0: lookX + 2 * u, y0: topL - fh * 0.95, x: 0, y: 0, vx: 0, vy: 0, L0: 0 };
    }
    // far ridges through the gap, the depths darkening away below, birds circling there, a mist drifting with the mids
    for (let x = 0; x < N; x++) { const ym = (0.27 + 0.02 * Math.sin((x / N) * 9 + w.mt) + 0.008 * Math.sin((x / N) * 23 + w.mt * 2)) * N; vcol(r, x, ym, 0.5 * N - ym, LMID + DIM); }
    for (const b of w.birds) {
      b.th += b.om * dt * (0.6 + 0.8 * f.rel.midDrive); b.flap = Math.max(0, b.flap - dt);
      if (f.beat.on && rnd() < 0.15) b.flap = Math.max(b.flap, 0.4);
    }
    // the far end of the chasm fades down into the dark: haze, shadow, black, an ordered dither between the tones
    const TONE = [LMID + DIM, MID + DIM, DARK + DIM, BLACK, BLACK];
    for (let y = Math.round(0.5 * N); y < N; y++) {
      const x0 = Math.max(0, Math.floor(eL[y])), x1 = Math.min(N, Math.ceil(eR[y])), q = ((y / N - 0.5) / 0.5) * 3.2, k = Math.floor(q), fr = q - k, row = y * N;
      for (let x = x0; x < x1; x++) r.buf[row + x] = bayer(x, y) < fr ? TONE[k + 1] : TONE[k];
    }
    for (const b of w.birds) { // nearer on the front half of its circle: lower and bigger; the light on their backs
      const z = Math.sin(b.th), sc = 1 / (1 - 0.18 * z), x = b.cx + Math.cos(b.th) * b.R, y = b.cy + z * b.R * 0.18, sp = 2.4 * u * sc;
      const wing = b.flap > 0 ? Math.sin((b.ph += dt * 16)) * 0.9 : 0.25;
      r.line(x, y, x - sp, y - sp * wing, LMID); r.line(x, y, x + sp, y - sp * wing, LMID); r.set(x, y, BRIGHT);
    }
    const off = f.rel.midClock * 0.05 * N, dens = 0.25 + 0.4 * f.level; // the mist: a smooth field drifting with the mids
    for (let y = Math.round(0.64 * N); y < 0.84 * N; y++) {
      const m = dens * Math.exp(-(((y / N - 0.74) / 0.05) ** 2)), x0 = Math.max(0, Math.floor(eL[y])), x1 = Math.min(N, Math.ceil(eR[y]));
      for (let x = x0; x < x1; x++) if (bayer(x, y) < m * (0.5 + 0.5 * Math.sin((x + off) / (5 * u) + Math.sin(y / (3 * u) + t * 0.3) * 1.5))) r.buf[y * N + x] = LMID + DIM;
    }
    // the walls: lit from the upper left, so the right wall's face catches the light and the left one's is in shadow;
    // ledges and cracks in the rock, bands of strata in the canyon, the ice smooth and streaked
    const ice = w.kind === 'icefall', wc = ice ? LMID + DIM : w.kind === 'canyon' ? MID + DIM : DARK, sh = Math.max(1, Math.round(2 * u));
    for (let y = 0; y < N; y++) {
      const l = eL[y], rr = eR[y], st = w.kind === 'canyon' && hash(y >> 2, 3) < 0.35 ? DARK : wc, ledge = hash(y >> 1, 11) < (ice ? 0.035 : 0.07);
      if (l > 0) {
        r.rect(0, y, l, 1, st); r.rect(l - sh, y, sh, 1, ice ? MID + DIM : DARK + DIM); r.set(l - 1, y, BLACK);
        if (ledge) r.rect(l - 4 * u - hash(y, 5) * 6 * u, y, 3 * u, 1, ice ? BRIGHT : MID + DIM);
      }
      if (rr < N) {
        r.rect(rr, y, N - rr, 1, st); r.rect(rr, y, sh, 1, ice ? BRIGHT : LMID);
        if (ledge) r.rect(rr + sh + hash(y, 6) * 4 * u, y, 4 * u, 1, ice ? BRIGHT : LMID + DIM);
      }
      for (let k = 0; k < 4; k++) { // cracks: a few wandering columns
        const cx = (k < 2 ? hash(k, 77) * l : rr + hash(k, 78) * (N - rr)) + Math.sin(y * 0.3 + k) * u;
        if ((k < 2 ? l > 0 : rr < N) && hash(k + 9, y >> 3) < 0.6) r.set(cx, y, ice ? COOL + DIM : DARK + DIM);
      }
    }
    r.rect(0, topL, eL[topL], Math.max(1, (ice ? 2 : 1) * u), ice ? BRIGHT : LMID);
    r.rect(eR[topR], topR, N - eR[topR], Math.max(1, (ice ? 2 : 1) * u), ice ? BRIGHT : LMID);
    // the porter: walks to the anchor, steps off and hangs, reaches a grip a beat, climbs out on the far rim and away
    const ax = M.ax, ay = M.ay, bx = M.bx, by = M.by, dAB = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / dAB, ny = (bx - ax) / dAB;
    pt.load = follow(pt.load, pt.st === 'hang' ? 1 : 0, dt, 0.12);
    if (pt.st === 'in') {
      pt.x += 0.11 * N * dt; pt.ph += (0.11 * N * dt * Math.PI) / (0.2 * fh); // a step for each fifth of his height
      if (pt.x >= ax - 2 * u) Object.assign(pt, { st: 'hang', s: 0.03, g0: 0, g1: 0.05, reach: null, phi: -0.9, om: 0, init: true });
    } else if (pt.st === 'hang') {
      if (f.beat.on && !pt.reach && pt.g1 < 0.97) pt.reach = { from: pt.g0, to: Math.min(0.99, pt.g1 + 0.055), p: 0 };
      if (pt.reach && (pt.reach.p += dt / (0.4 * bs)) >= 1) { pt.g0 = pt.g1; pt.g1 = pt.reach.to; pt.reach = null; pt.bv += 0.012 * N; }
      pt.s = follow(pt.s, pt.reach ? pt.g1 : (pt.g0 + pt.g1) / 2, dt, 0.12);
      if (pt.s > 0.95 && !pt.reach) { pt.st = 'out'; pt.tOut = 0; }
    } else if (pt.st === 'out') {
      pt.tOut += dt;
      if (pt.tOut > 0.6) { pt.x = (pt.x > bx ? pt.x : bx + 3 * u) + 0.11 * N * dt; pt.ph += (0.11 * N * dt * Math.PI) / (0.2 * fh); if (pt.x > 1.05 * N) { pt.st = 'wait'; pt.tOut = 0; } }
    } else if ((pt.tOut += dt) > 1.5) { pt.st = 'in'; pt.x = -0.05 * N; }
    // where he hangs: the two lengths of rope either side of the grip meet there (inextensible), plus the bounce
    const rA = pt.s * M.L, rB = (1 - pt.s) * M.L, aa = (rA * rA - rB * rB + dAB * dAB) / (2 * dAB), hv = Math.sqrt(Math.max(0, rA * rA - aa * aa));
    for (let k = 0; k < n; k++) { pt.bv += (-64 * pt.b - 4 * pt.bv) * h; pt.b += pt.bv * h; }
    const hx = ax + ((bx - ax) * aa) / dAB + nx * (hv + pt.b), hy = ay + ((by - ay) * aa) / dAB + ny * (hv + pt.b);
    if (pt.st === 'hang') {
      if (pt.init) { pt.hx = hx; pt.hy = hy; pt.vx = 0; pt.vy = 0; pt.init = false; }
      const vx = (hx - pt.hx) / dt, vy = (hy - pt.hy) / dt, axP = clamp((vx - pt.vx) / dt, -3 * g, 3 * g), ayP = clamp((vy - pt.vy) / dt, -3 * g, 3 * g), lb = 0.55 * fh;
      pt.hx = hx; pt.hy = hy; pt.vx = vx; pt.vy = vy;
      // the body a pendulum under the hands: gravity less the hands' acceleration, the wind on him, a little damping
      for (let k = 0; k < n; k++) { pt.om += (-((g - ayP) * Math.sin(pt.phi) - (Fw - axP) * Math.cos(pt.phi)) / lb - 1.2 * pt.om) * h; pt.phi += pt.om * h; }
    }
    // the ropes swing about their chords toward the angle the wind tilts their gravity to
    for (const sp of spans) if (sp.kind !== 'ladder' && !sp.cut) {
      const c = Math.hypot(sp.bx - sp.ax, sp.by - sp.ay), sag = Math.sqrt(Math.max(1e-4, (3 * c * Math.max(0, sp.L - c)) / 8)), om2 = (1.25 * g) / Math.max(sag, u), eq = Math.atan(w.wind * 0.6);
      for (let k = 0; k < n; k++) { sp.tv += (-om2 * (sp.tilt - eq) - 1.5 * sp.tv) * h; sp.tilt += sp.tv * h; }
    }
    // the spans: ladders on their ledges (two lashed end to end on the ice, the lashing sagging), ropes, the cut one
    const cat = w.cat;
    const rails = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0) || 1, ox = (-(y1 - y0) / len) * 1.5 * u, oy = ((x1 - x0) / len) * 1.5 * u;
      r.line(x0 - ox, y0 - oy, x1 - ox, y1 - oy, LMID); r.line(x0 + ox, y0 + oy, x1 + ox, y1 + oy, MID);
      for (let q = 3 * u; q < len; q += 3 * u) { const px = x0 + ((x1 - x0) * q) / len, py = y0 + ((y1 - y0) * q) / len; r.line(px - ox, py - oy, px + ox, py + oy, MID); }
    };
    for (const sp of spans) {
      if (sp.kind === 'ladder') {
        if (ice) { const jx = (sp.ax + sp.bx) / 2, jy = (sp.ay + sp.by) / 2 + 1.2 * u; rails(sp.ax, sp.ay, jx, jy); rails(jx, jy, sp.bx, sp.by); r.rect(jx - u, jy - 1.5 * u, 2 * u, 3 * u, HOT); }
        else rails(sp.ax, sp.ay, sp.bx, sp.by);
        continue;
      }
      if (sp.thrown) r.line(sp.sx, sp.ay - 0.5, sp.ax, sp.ay - 0.5, MID); // over the rim from its stake
      if (sp.cut) { // cut loose at the far end: it falls about the near lip like a rod and hangs down the wall
        const C = sp.cut, Lh = sp.L;
        for (let k = 0; k < n; k++) { C.om += (-((1.5 * g) / Lh) * Math.sin(C.th) - 1.0 * C.om) * h; C.th += C.om * h; if (C.th < 0.06) { C.th = 0.06; C.om = Math.max(0, C.om); } }
        r.line(sp.ax, sp.ay, sp.ax + Math.sin(C.th) * Lh, sp.ay + Math.cos(C.th) * Lh, LMID);
        continue;
      }
      catenary(sp.ax, sp.ay, sp.bx, sp.by, sp.L, sp.tilt, 16, cat);
      if (sp === M && pt.load > 0.02) { // under the porter: the catenary pulled into the V of his weight
        for (let k = 0; k <= 16; k++) { const x = cat[2 * k], vy = x <= hx ? lerp(ay, hy, (x - ax) / Math.max(1e-3, hx - ax)) : lerp(hy, by, (x - hx) / Math.max(1e-3, bx - hx)); cat[2 * k + 1] = lerp(cat[2 * k + 1], vy, pt.load); }
        if (pt.load > 0.97) { r.line(ax, ay, hx, hy, LMID); r.line(hx, hy, bx, by, LMID); continue; }
      }
      for (let k = 0; k < 16; k++) r.line(cat[2 * k], cat[2 * k + 1], cat[2 * k + 2], cat[2 * k + 3], LMID);
      if (sp !== M) for (let k = 4; k < 16; k += 4) { // flags on it: lighter than the rope, they lean further and flutter
        const fa = Math.atan(w.wind * 1.4) + 0.25 * w.wind * Math.sin(t * 11 + k * 3);
        r.stroke(cat[2 * k], cat[2 * k + 1], cat[2 * k] + Math.sin(fa) * 3 * u, cat[2 * k + 1] + Math.cos(fa) * 3 * u, Math.max(1, 1.2 * u), k === 8 ? HOT : BRIGHT);
      }
    }
    // pebbles: off the lip, falling, knocked back off the walls with less each time, gone into the dark
    w.pebbles = w.pebbles.filter((p) => {
      for (let k = 0; k < n; k++) {
        p.vy += g * h; p.x += p.vx * h; p.y += p.vy * h;
        const yy = clamp(Math.round(p.y), 0, N - 1);
        if (p.x < eL[yy]) { p.x = eL[yy] + 0.5; p.vx = Math.abs(p.vx) * 0.4; p.vy *= 0.6; } else if (p.x > eR[yy]) { p.x = eR[yy] - 0.5; p.vx = -Math.abs(p.vx) * 0.4; p.vy *= 0.6; }
      }
      r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), LMID);
      return p.y < N;
    });
    // the lookout on the near rim, his coil of rope; the throw: wind up, the anchor's parabola onto the far wall, the haul
    walker(r, lookX, topL, fh, FIG, 0, 1, { coat: true });
    r.ring(lookX + 3 * u, topL - 1.2 * u, 1.6 * u, Math.max(1, u), MID);
    const T = 0.85, TH = w.throw, armL = fh * 0.3, shx = lookX + 0.6 * u, shy = topL - fh * 0.72;
    let arm = Math.PI - 0.2; // from straight up, clockwise: hanging at rest
    if (TH) {
      TH.t += dt;
      if (TH.st === 0) { // the wind-up back over the shoulder and the swing through; he lets go forward and up
        arm = TH.t < 0.2 ? lerp(Math.PI - 0.2, 5.4, ease(TH.t / 0.2)) : lerp(5.4, 6.8, clamp((TH.t - 0.2) / 0.15));
        if (TH.t >= 0.35) { TH.st = 1; TH.t = 0; TH.x0 = shx + Math.sin(6.8) * armL; TH.y0 = shy - Math.cos(6.8) * armL; TH.vx = (TH.tx - TH.x0) / T; TH.vy = (TH.ty - TH.y0) / T - 0.5 * g * T; }
      }
      const ex = eL[topL], sx = lookX + 3 * u;
      if (TH.st === 1) {
        arm = lerp(6.8, 7.7, clamp(TH.t / 0.2));
        const tt = Math.min(TH.t, T); TH.x = TH.x0 + TH.vx * tt; TH.y = TH.y0 + TH.vy * tt + 0.5 * g * tt * tt;
        if (TH.t >= T) { TH.st = 2; TH.t = 0; burst(w.chips, rnd, TH.tx, TH.ty, 8, 0.15 * N, LMID, 0.6); s.shake = Math.max(s.shake, 0.25); TH.L0 = Math.hypot(TH.tx - ex, TH.ty - topL) * 1.15 + 2 * u; }
      }
      if (TH.st >= 1) { // the line paid out behind it from the coil, slack in flight, over the lip, hauled in once it bites
        const tx = TH.st === 1 ? TH.x : TH.tx, ty = TH.st === 1 ? TH.y : TH.ty, over = tx > ex, x0 = over ? ex : sx;
        const len = TH.st === 1 ? Math.hypot(tx - x0, ty - topL) * 1.15 + 2 * u : lerp(TH.L0, Math.hypot(tx - ex, ty - topL) * 1.025, ease(TH.t / 0.8));
        if (over) r.line(sx, topL - 0.5, ex, topL - 0.5, MID);
        catenary(x0, topL, tx, ty, len, 0, 16, cat);
        for (let k = 0; k < 16; k++) r.line(cat[2 * k], cat[2 * k + 1], cat[2 * k + 2], cat[2 * k + 3], LMID);
        r.rect(tx - u, ty - u, 2 * u, 2 * u, HOT);
      }
      if (TH.st === 2 && TH.t > 0.8) {
        spans.push({ kind: 'rope', ax: ex, ay: topL, bx: TH.tx, by: TH.ty, sx, L: Math.hypot(TH.tx - ex, TH.ty - topL) * 1.025, tilt: 0, tv: 0, cut: null, thrown: true });
        w.throw = null;
        const cuts = spans.filter((sp) => sp.cut);
        if (cuts.length > 1) spans.splice(spans.indexOf(cuts[0]), 1);
      }
    }
    r.stroke(shx, shy, shx + Math.sin(arm) * armL, shy - Math.cos(arm) * armL, Math.max(1, 1.4 * u), FIG);
    targets.push({ x: lookX - fh * 0.3, y: topL - fh, w: fh * 0.6, h: fh });
    // the porter himself
    if (pt.st === 'hang') {
      const sv = Math.max(pt.s, 1e-3), sb = Math.max(1 - pt.s, 1e-3);
      const hp = (q) => (q <= pt.s ? [lerp(ax, hx, q / sv), lerp(ay, hy, q / sv)] : [lerp(hx, bx, (q - pt.s) / sb), lerp(hy, by, (q - pt.s) / sb)]);
      const dx = Math.sin(pt.phi), dy = Math.cos(pt.phi), fx = dy, fy = -dx; // down the body, and to his front
      const Sx = hx + dx * 0.3 * fh, Sy = hy + dy * 0.3 * fh, Hx = Sx + dx * 0.4 * fh, Hy = Sy + dy * 0.4 * fh;
      const Kx = Hx + dx * 0.26 * fh + fx * 0.08 * fh, Ky = Hy + dy * 0.26 * fh + fy * 0.08 * fh, Fx = Kx + dx * 0.26 * fh - fx * 0.04 * fh, Fy = Ky + dy * 0.26 * fh - fy * 0.04 * fh;
      const back = (a, b) => [Sx + dx * a * fh - fx * b * fh, Sy + dy * a * fh - fy * b * fh];
      r.poly([back(0.03, 0.08), back(0.5, 0.08), back(0.5, 0.36), back(0.03, 0.36)], MID); // the pack
      const pk = [back(0.03, 0.36), back(0.5, 0.36)]; r.line(pk[0][0], pk[0][1], pk[1][0], pk[1][1], DARK);
      const h0 = hp(pt.reach ? pt.g1 : pt.g0), h1 = pt.reach ? (() => { const a = hp(pt.reach.from), b = hp(pt.reach.to), q = ease(pt.reach.p); return [lerp(a[0], b[0], q), lerp(a[1], b[1], q) - Math.sin(q * Math.PI) * 3 * u]; })() : hp(pt.g1);
      r.stroke(Sx, Sy, h0[0], h0[1], Math.max(1, 1.4 * u), FIG); r.stroke(Sx, Sy, h1[0], h1[1], Math.max(1, 1.4 * u), FIG);
      r.stroke(Sx, Sy, Hx, Hy, Math.max(2, 3.2 * u), FIG);
      r.stroke(Hx, Hy, Kx, Ky, Math.max(1, 2 * u), FIG); r.stroke(Kx, Ky, Fx, Fy, Math.max(1, 1.8 * u), FIG);
      r.disc(Sx + fx * 0.08 * fh - dx * 0.07 * fh, Sy + fy * 0.08 * fh - dy * 0.07 * fh, Math.max(1, 0.13 * fh), FIG);
      targets.push({ x: Math.min(hx, Fx) - 0.25 * fh, y: Math.min(hy, Fy), w: Math.abs(Fx - hx) + 0.5 * fh, h: Math.abs(Fy - hy) + 0.1 * fh });
    } else if (pt.st !== 'wait') {
      let x = pt.x, base = topL;
      if (pt.st === 'out') { const q = ease(pt.tOut / 0.6); x = pt.tOut > 0.6 ? pt.x : lerp(hx, bx + 3 * u, q); base = pt.tOut > 0.6 ? topR : lerp(hy + 1.2 * fh, topR, q); }
      walker(r, x, base, fh, FIG, pt.ph, 1, {});
      r.rect(x - fh * 0.42, base - fh * 0.78, fh * 0.28, fh * 0.4, MID);
      targets.push({ x: x - fh * 0.4, y: base - fh, w: fh * 0.8, h: fh });
    }
    w.chips = particles(W, w.chips, LMID);
  },
};

// ---------------------------------------------------------------------------------------------- walkingtank
// A two-legged walking tank from the side, in a hangar or out on a snowfield, pacing its end of the floor: reverse
// knees, each foot planted while the body goes by and swung ahead once the hips have passed it (a stomp, a dip of the
// body, grit, a print in the snow). Its rail cannon charges with the bass, the coils lighting one by one, the muzzle
// glowing, and fires on the beat once full, a straight slug to the first thing in its line. Every kick lobs a missile
// from the back pod in a parabola with a smoke trail at the small figure with the launcher: he keeps behind the
// pillars (they stand in the tank's row, so a missile or the slug bursts on the pillar it touches), runs in front of
// them to the next one when a missile is coming, and steps out to fire back on a snare. A drop: it rears up, the
// lights flicker and die, only its eye and coils glowing in the dark until they come back.
const TANK_W = { snowfield: [3, 2, 1], hangar: [2, 3, 2], depot: [1, 2, 3] };
// in the dark only what gives off light keeps its colour; the rest goes to black, the pale things to a ghost of themselves
const DARKMAP = Uint8Array.from({ length: 18 }, (_, v) => ([HOT, COOL, WHITE, HOT + DIM, COOL + DIM].includes(v) ? v : [FIG, LMID, MID, BRIGHT, BRIGHT + DIM, FIG + DIM].includes(v) ? DARK + DIM : BLACK));
// a beam of light from a lamp at (x0, y0), w0 wide, to (x1, y1), w1 wide, as an ordered dither of density d thinning away
function ditherCone(r, x0, y0, w0, x1, y1, w1, c, d) {
  const N = r.N;
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(N, y1); y++) {
    const q = (y - y0) / (y1 - y0), cx = lerp(x0, x1, q), hw = lerp(w0, w1, q) / 2, dd = d * (1 - 0.5 * q);
    for (let x = Math.max(0, Math.round(cx - hw)); x < Math.min(N, cx + hw); x++) if (bayer(x, y) < dd) r.buf[y * N + x] = c;
  }
}
function buildYard(W) {
  const { w, rnd, N } = W, snow = w.kind === 'snowfield';
  w.pillars = [0.12, 0.27, 0.42].map((x) => ({ x: (x + (rnd() - 0.5) * 0.03) * N, w: (snow ? 0.055 : 0.042) * N, top: snow ? (0.4 + rnd() * 0.2) * N : 0.1 * N, dents: [] }));
}
const walkingtank = {
  init(W) {
    const { w, rnd, N } = W, x = 0.76 * N;
    Object.assign(w, { kind: rollW(rnd, TANK_W, bandOf(W.a)), missiles: [], rockets: [], booms: [], debris: [], puffs: [], marks: [], snow: [], dp: null, beam: null, N });
    w.T = { x, tx: x, v: 0, feet: [{ x: x - 0.03 * N, from: 0, to: 0, p: 1 }, { x: x + 0.03 * N, from: 0, to: 0, p: 1 }], lp: [1, 1], b: 0, bv: 0, pitch: 0, pv: 0, rec: 0, rv: 0, e: 0, charge: 0, eye: COOL, ping: 0 };
    buildYard(W);
    const p = w.pillars[1];
    w.fig = { x: p.x - p.w / 2 - 0.022 * N, ci: 1, mode: 'cover', tx: 0, ph: 0, reload: 0, shoot: false, aim: 0, knock: 0, dir: 1, lane: 0 };
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W;
    if (w.N !== N) walkingtank.init(W);
    const bs = beatS(f), g = GRAV * N, gy = 0.82 * N, T = w.T, F = w.fig, fh = 0.11 * N, dir = -1, laneY = 0.03 * N;
    if (f.section === 'change') { w.kind = rollW(rnd, TANK_W, bandOf(W.a)); buildYard(W); F.mode = 'run'; F.shoot = false; }
    const P = w.pillars, snow = w.kind === 'snowfield', cover = (i) => P[i].x - P[i].w / 2 - 0.022 * N;
    if (f.section === 'change') F.tx = cover(F.ci);
    if (f.section === 'drop' && !w.dp) { w.dp = { t: 0 }; s.shake = Math.max(s.shake, 0.5); }
    let lights = 1;
    if (w.dp) { // rear up; the lights stutter and die; eight beats of dark; they stutter back
      const d = w.dp, off0 = 1.3, off1 = off0 + 8 * bs;
      d.t += dt;
      lights = d.t < 0.3 ? 1 : d.t < off0 ? (hash(Math.floor(d.t * 14), 5) < 0.45 ? 1 : 0) : d.t < off1 ? 0 : hash(Math.floor(d.t * 14), 6) < 0.6 ? 1 : 0;
      if (d.t > off1 + 0.5) w.dp = null;
    }
    // the tank paces its end of the floor: a new spot now and then on a bar; it can back up as well
    if (f.beat.on && f.beat.count % 4 === 0 && rnd() < 0.6) T.tx = (0.66 + rnd() * 0.2) * N;
    const far = Math.abs(T.tx - T.x) > 0.01 * N;
    T.v = follow(T.v, far ? Math.sign(T.tx - T.x) * (0.035 + 0.05 * f.rel.midDrive) * N : 0, dt, 0.5);
    T.x = clamp(T.x + T.v * dt, 0.62 * N, 0.88 * N);
    const stride = 0.13 * N, hipH = 0.26 * N, md = T.v >= 0 ? 1 : -1; // the feet step the way it walks
    for (const fe of T.feet) { fe.x *= md; fe.from *= md; fe.to *= md; }
    stepFeet(T.feet, T.x * md, stride, Math.abs(T.v), dt);
    for (const fe of T.feet) { fe.x *= md; fe.from *= md; fe.to *= md; }
    T.feet.forEach((fe, i) => { // a foot comes down: the stomp
      if (T.lp[i] < 1 && fe.p >= 1) {
        T.bv += 0.03 * N; s.shake = Math.max(s.shake, 0.12);
        for (let k = 0; k < 5; k++) w.debris.push({ x: fe.x + (rnd() - 0.5) * 0.06 * N, y: gy, vx: (rnd() - 0.5) * 0.2 * N, vy: -rnd() * 0.18 * N, life: 0.5, c: snow ? BRIGHT : MID, gy });
        if (snow) w.marks.push({ x: fe.x, k: 1 });
      }
      T.lp[i] = fe.p;
    });
    // springs: the body's dip, the rear-up of the drop, the recoil of the hull on its mount
    const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n, pT = w.dp && w.dp.t < 0.9 ? 0.38 : 0;
    for (let k = 0; k < n; k++) {
      T.bv += (-100 * T.b - 8 * T.bv) * h; T.b += T.bv * h;
      T.pv += (-30 * (T.pitch - pT) - 6 * T.pv) * h; T.pitch += T.pv * h;
      T.rv += (-80 * T.rec - 10 * T.rv) * h; T.rec += T.rv * h;
    }
    const hx = T.x, hy = gy - hipH + T.b - T.pitch * 0.05 * N, cp = Math.cos(T.pitch), sp = Math.sin(T.pitch);
    const Pt = (lx, ly) => [hx + dir * ((lx * cp - ly * sp) * N - T.rec), hy - (lx * sp + ly * cp) * N]; // hull-local (forward, up) in N
    // the rail: aims at the figure's chest, charges with the bass, fires on the beat when full
    const [pvx, pvy] = Pt(-0.02, 0.12), fy0 = gy + F.lane * laneY, at = Math.atan2(pvy - (fy0 - 0.6 * fh), (F.x - pvx) * dir) - T.pitch;
    T.e = follow(T.e, clamp(at, -0.35, 0.5), dt, 0.5);
    const ea = T.e + T.pitch, bdx = dir * Math.cos(ea), bdy = -Math.sin(ea), mzx = pvx + bdx * 0.25 * N, mzy = pvy + bdy * 0.25 * N;
    T.charge = Math.min(1, T.charge + dt * (0.04 + 0.35 * f.rel.bassDrive));
    T.ping = Math.max(0, T.ping - dt / bs);
    if (f.beat.on) T.ping = 1;
    const boom = (x, y, k, pl) => {
      w.booms.push({ x, y, t: 0, k });
      for (let i = 0; i < 8 * k; i++) { const a = -Math.PI * rnd(), v = (0.1 + rnd() * 0.25) * N * k; w.debris.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + rnd() * 0.5, c: rnd() < 0.5 ? LMID : HOT, gy: y >= gy ? y : gy }); }
      for (let i = 0; i < 4; i++) w.puffs.push({ x: x + (rnd() - 0.5) * 4 * u, y: y - rnd() * 3 * u, r: 2 * u, vy: -0.05 * N, life: 1.2 });
      if (pl) pl.dents.push(y); else w.marks.push({ x, k: 0, y });
      if (w.marks.length > 16) w.marks.shift();
      s.shake = Math.max(s.shake, 0.3 * k);
      if (!pl && Math.abs(x - F.x) < 0.05 * N && Math.abs(y - fy0) < 0.04 * N) F.knock = 1.2;
    };
    // the pillar a straight run or a missile in the tank's row touches first
    const pillarAt = (x, y) => P.find((p) => Math.abs(x - p.x) < p.w / 2 && y > p.top);
    if (T.charge >= 1 && f.beat.on) {
      let ex = mzx, ey = mzy, pl = null;
      for (let d = 0; d < 1.6 * N; d += 0.5) {
        ex = mzx + bdx * d; ey = mzy + bdy * d;
        if (ey >= gy || ex < 0 || ex >= N || ey < 0) break;
        if (F.lane < 0.5 && (pl = pillarAt(ex, ey))) break;
        if (Math.abs(ex - F.x) < 0.2 * fh && ey > fy0 - fh && ey < fy0) { F.knock = 1.5; break; }
      }
      w.beam = { x0: mzx, y0: mzy, x1: ex, y1: Math.min(ey, gy), t: 0.14 };
      boom(ex, Math.min(ey, gy), 1.3, pl);
      T.charge = 0; T.rv += 0.4 * N;
    }
    for (const hh of hits) {
      if ((hh.kind === 'kick' || (hh.kind === 'bass' && hh.strength > 0.7)) && w.missiles.length < 6) { // a missile from the pod, lobbed at him
        const [lx, ly] = Pt(-0.08, 0.135), lane = F.lane > 0.5 ? 1 : 0, tx = F.x + (rnd() - 0.5) * 0.08 * N, ty = gy + lane * laneY, TT = 0.8 + (Math.abs(tx - lx) / N) * 0.6;
        w.missiles.push({ x: lx, y: ly, vx: (tx - lx) / TT, vy: (ty - ly) / TT - 0.5 * g * TT, lane, ty, lp: 0 });
        if (Math.abs(tx - F.x) < 0.08 * N && F.mode !== 'run') { // he sees where it will come down: off to the nearest other pillar clear of it
          let best = -1, bd = 1e9;
          P.forEach((p, i) => { const d = Math.abs(cover(i) - F.x); if (i !== F.ci && Math.abs(cover(i) - tx) > 0.08 * N && d < bd) { bd = d; best = i; } });
          if (best >= 0) { F.ci = best; F.tx = cover(best); F.mode = 'run'; F.shoot = false; }
        }
      } else if (hh.kind === 'snare' && F.mode === 'cover' && F.reload <= 0 && F.knock <= 0) { F.mode = 'run'; F.shoot = true; F.tx = P[F.ci].x + P[F.ci].w / 2 + 0.03 * N; }
      else if (isTonal(hh)) T.eye = hh.pc % 2 ? COOL : HOT;
    }
    // the figure: in cover he is in the pillars' row; to run or to shoot he steps out in front of them
    F.reload = Math.max(0, F.reload - dt); F.knock = Math.max(0, F.knock - dt);
    F.lane = F.knock > 0 ? F.lane : F.mode === 'cover' ? Math.max(0, F.lane - dt / 0.15) : Math.min(1, F.lane + dt / 0.15);
    if (F.knock <= 0 && F.mode === 'run' && F.lane >= 1) {
      const d = F.tx - F.x, st = Math.min(Math.abs(d), 0.3 * N * dt);
      F.x += Math.sign(d) * st; F.ph += (st * Math.PI) / (0.2 * fh); if (Math.abs(d) > 0.5) F.dir = Math.sign(d);
      if (Math.abs(F.tx - F.x) < 0.5) { if (F.shoot) { F.mode = 'out'; F.aim = 0.3; F.shoot = false; } else F.mode = 'cover'; }
    } else if (F.knock <= 0 && F.mode === 'out') {
      F.dir = 1; F.aim -= dt;
      if (F.aim <= 0 || T.charge > 0.85) {
        if (F.aim <= 0) { // the rocket: straight from the tube at the hull
          const sx = F.x + 0.45 * fh, sy = fy0 - 0.8 * fh, [cx, cy] = Pt(0.02, 0.05), d = Math.hypot(cx - sx, cy - sy) || 1;
          w.rockets.push({ x: sx, y: sy, vx: ((cx - sx) / d) * 0.85 * N, vy: ((cy - sy) / d) * 0.85 * N, lp: 0 });
          w.puffs.push({ x: F.x - 0.3 * fh, y: sy, r: 1.5 * u, vy: -0.02 * N, life: 0.8 }); // the back-blast
          F.reload = 1.2;
        }
        F.mode = 'run'; F.tx = cover(F.ci);
      }
    }
    // the set: the hangar's wall, roof, lamps and their light, or the snowfield and its floodlights
    if (snow) {
      for (let x = 0; x < N; x++) { const ym = (0.5 + 0.05 * Math.sin(x * 0.05 + 1) + 0.025 * Math.sin(x * 0.13)) * N; vcol(r, x, ym, gy - ym, MID + DIM); }
      r.rect(0, 0.66 * N, N, gy - 0.66 * N, LMID + DIM);
      for (const mx of [0.04 * N, 0.96 * N]) { r.rect(mx - u, 0.3 * N, 2 * u, gy - 0.3 * N, DARK); r.rect(mx - 3 * u, 0.29 * N, 6 * u, 2.5 * u, lights ? BRIGHT : DARK); if (lights) ditherCone(r, mx, 0.31 * N, 4 * u, mx + (mx < N / 2 ? 0.16 : -0.16) * N, gy, 0.26 * N, LMID, 0.15 + 0.2 * f.level); }
    } else {
      for (let x = Math.round(0.05 * N); x < N; x += Math.round(0.1 * N)) r.rect(x, 0.1 * N, Math.max(1, u), gy - 0.1 * N, DARK + DIM);
      r.rect(0, 0, N, 0.1 * N, DARK);
      for (let x = 0; x < N; x += Math.max(2, Math.round(6 * u))) r.line(x, 0.1 * N, x + 3 * u, 0.02 * N, MID + DIM); // the roof trusses
      for (const lx of [0.15, 0.4, 0.65, 0.9]) {
        r.line(lx * N, 0.1 * N, lx * N, 0.13 * N, MID); r.rect(lx * N - 3 * u, 0.13 * N, 6 * u, 1.5 * u, lights ? BRIGHT : DARK);
        if (lights) ditherCone(r, lx * N, 0.145 * N, 5 * u, lx * N, gy, 0.22 * N, LMID + DIM, 0.3 + 0.35 * f.level);
      }
      if (w.kind === 'depot') { const on = Math.sin(t * 6) > 0; r.rect(0.55 * N, 0.16 * N, 3 * u, 3 * u, on ? HOT : DARK); if (on && lights) ditherCone(r, 0.55 * N + 1.5 * u, 0.18 * N, 3 * u, 0.6 * N, 0.4 * N, 0.12 * N, HOT + DIM, 0.3); }
    }
    r.rect(0, gy, N, N - gy, snow ? LMID : DARK);
    r.rect(0, gy, N, Math.max(1, u), snow ? BRIGHT : MID);
    for (let x = 0; x < N; x += Math.max(2, Math.round(9 * u))) r.rect(x, gy + laneY + 2 * u, Math.max(1, 5 * u), Math.max(1, 0.5 * u), snow ? LMID + DIM : DARK + DIM); // seams nearer the eye
    for (const m of w.marks) {
      if (m.k) r.rect(m.x - 0.03 * N, gy, 0.06 * N, Math.max(1, u), MID + DIM); // the tank's print in the snow
      else { const my = m.y ?? gy; r.rect(m.x - 3 * u, my, 6 * u, Math.max(1, u), BLACK); r.rect(m.x - 2 * u, my - u, 4 * u, Math.max(1, u), DARK + DIM); }
    }
    if (w.marks.length > 16) w.marks.splice(0, w.marks.length - 16);
    // the tank: the far leg, the hull and its kit, the near leg
    const leg = (fe, farLeg) => {
      const fx = fe.x, fyy = gy - footLift(fe) * 0.05 * N - 0.012 * N, [kx, ky] = knee(hx, hy, fx, fyy, 0.16 * N, 0.16 * N, dir), c = farLeg ? DARK : MID, wd = farLeg ? 3.2 * u : 3.8 * u;
      r.stroke(hx, hy, kx, ky, Math.max(2, wd), c); r.stroke(kx, ky, fx, fyy, Math.max(2, wd * 0.8), c);
      r.disc(kx, ky, Math.max(1, 2.4 * u), farLeg ? DARK + DIM : LMID);
      r.rect(fx - 0.035 * N, fyy, 0.07 * N, 0.012 * N, farLeg ? DARK : MID); r.rect(fx - 0.04 * N, fyy + 0.006 * N, 2 * u, 0.006 * N, DARK);
    };
    leg(T.feet[0], true);
    const hull = [Pt(-0.13, 0), Pt(0.12, 0), Pt(0.17, 0.035), Pt(0.13, 0.08), Pt(0.06, 0.105), Pt(-0.12, 0.095)];
    r.poly(hull, MID);
    for (let k = 0; k < hull.length; k++) { const a = hull[k], b = hull[(k + 1) % hull.length]; r.line(a[0], a[1], b[0], b[1], k === 3 || k === 4 ? LMID : DARK); }
    const seam = (x0, y0, x1, y1, c) => { const a = Pt(x0, y0), b = Pt(x1, y1); r.line(a[0], a[1], b[0], b[1], c); };
    seam(-0.05, 0.005, -0.05, 0.09, DARK); seam(0.06, 0.005, 0.06, 0.1, DARK); seam(-0.12, 0.05, 0.13, 0.05, DARK + DIM);
    for (let k = 0; k < 4; k++) seam(-0.115 + k * 0.012, 0.015, -0.115 + k * 0.012, 0.04, DARK); // vents
    const pod = [Pt(-0.115, 0.095), Pt(-0.04, 0.097), Pt(-0.04, 0.135), Pt(-0.115, 0.135)];
    r.poly(pod, LMID + DIM);
    for (let k = 0; k < 3; k++) { const [tx, ty] = Pt(-0.105 + k * 0.022, 0.135); r.rect(tx - u, ty - u, 2 * u, Math.max(1, u), DARK); }
    const [ex0, ey0] = Pt(0.145, 0.05);
    r.disc(ex0, ey0, Math.max(1, 0.012 * N), T.eye);
    if (T.ping > 0) r.ring(ex0, ey0, (1 - T.ping) * 0.08 * N + 2 * u, Math.max(1, 0.6 * u), dim(T.eye));
    r.disc(hx, hy, Math.max(1, 0.022 * N), DARK); // the hip joint stays on the legs; the hull recoils on its mount above it
    // the rail: two bars, six coils lit as it charges, the muzzle glowing near full
    r.stroke(pvx, pvy, mzx, mzy, Math.max(2, 3 * u), DARK);
    r.line(pvx - bdy * 1.4 * u, pvy + bdx * 1.4 * u, mzx - bdy * 1.4 * u, mzy + bdx * 1.4 * u, LMID);
    for (let k = 0; k < 6; k++) {
      const q = 0.15 + k * 0.13, cx = pvx + bdx * q * 0.25 * N, cy = pvy + bdy * q * 0.25 * N, lit = T.charge > (k + 1) / 6.5;
      r.disc(cx, cy, Math.max(1, 1.6 * u), lit ? (T.charge >= 1 && Math.floor(t * 10) % 2 ? HOT : T.charge > 0.85 ? WHITE : COOL) : DARK + DIM);
    }
    if (T.charge > 0.5) ditherDisc(r, mzx, mzy, (2 + 5 * T.charge) * u, COOL, (T.charge - 0.5) * 1.1);
    leg(T.feet[1], false);
    targets.push({ x: Math.min(hull[0][0], hull[2][0]), y: hy - 0.14 * N, w: 0.3 * N, h: 0.14 * N + hipH });
    // the figure, the pillars, the figure again if he is out in front of them
    const drawFig = () => {
      const base = gy + F.lane * laneY;
      if (F.knock > 0) { r.rect(F.x - 0.4 * fh, base - 0.16 * fh, 0.8 * fh, 0.16 * fh, FIG); r.disc(F.x + 0.45 * fh, base - 0.1 * fh, 0.11 * fh, FIG); return; }
      const hgt = F.mode === 'cover' ? fh * 0.72 : fh, o = walker(r, F.x, base, hgt, FIG, F.mode === 'run' ? F.ph : 0, F.dir, { cap: true, hatCol: DARK });
      r.stroke(F.x - F.dir * 0.3 * hgt, o.sy - 0.02 * hgt, F.x + F.dir * 0.5 * hgt, o.sy - 0.06 * hgt, Math.max(1, 1.8 * u), MID); // the launcher on his shoulder
      targets.push({ x: F.x - 0.3 * fh, y: base - hgt, w: 0.6 * fh, h: hgt });
    };
    if (F.lane < 0.5) drawFig();
    for (const p of P) {
      r.rect(p.x - p.w / 2, p.top, p.w, gy - p.top, snow ? MID : MID + DIM);
      r.rect(p.x - p.w / 2, p.top, Math.max(1, u), gy - p.top, LMID); r.rect(p.x + p.w / 2 - u, p.top, Math.max(1, u), gy - p.top, DARK);
      if (snow) { r.rect(p.x - p.w / 2, p.top - u, p.w, 1.5 * u, BRIGHT); for (let k = 0; k < 3; k++) r.line(p.x - p.w / 2 + hash(k, 3) * p.w, p.top, p.x - p.w / 2 + hash(k, 4) * p.w, p.top + 2 * u, DARK); }
      else { r.rect(p.x - p.w / 2 - u, 0.1 * N, p.w + 2 * u, 2 * u, MID); r.rect(p.x - p.w / 2 - u, gy - 2 * u, p.w + 2 * u, 2 * u, MID); }
      for (const dy of p.dents) { r.disc(p.x + p.w / 2 - u, dy, 1.6 * u, BLACK); r.set(p.x + p.w / 2 - 2 * u, dy - u, HOT + DIM); }
      if (p.dents.length > 6) p.dents.shift();
    }
    if (F.lane >= 0.5) drawFig();
    // missiles: a parabola from the pod with a trail of smoke behind; into the pillars' row only if he was in cover
    w.missiles = w.missiles.filter((m) => {
      const steps = Math.max(1, Math.ceil((Math.hypot(m.vx, m.vy) * dt) / (1.5 * u))), hm = dt / steps;
      for (let k = 0; k < steps; k++) { // (the exact step of a parabola, so it comes down where it was aimed)
        m.x += m.vx * hm; m.y += m.vy * hm + 0.5 * g * hm * hm; m.vy += g * hm;
        if ((m.lp += hm) > 0.025) { m.lp = 0; w.puffs.push({ x: m.x, y: m.y, r: 0.8 * u, vy: 0, life: 0.9 }); }
        const pl = m.lane ? null : pillarAt(m.x, m.y);
        if (m.y >= m.ty || pl) { boom(m.x, Math.min(m.y, m.ty), 1, pl); return false; }
        if (m.x < -5 * u || m.x > N + 5 * u) return false;
      }
      const v = Math.hypot(m.vx, m.vy) || 1, tx = m.x - (m.vx / v) * 3 * u, ty = m.y - (m.vy / v) * 3 * u;
      r.stroke(tx, ty, m.x, m.y, Math.max(1, 1.5 * u), LMID); r.set(tx, ty, HOT);
      return true;
    });
    w.rockets = w.rockets.filter((m) => {
      const steps = Math.max(1, Math.ceil((Math.hypot(m.vx, m.vy) * dt) / (1.5 * u))), hm = dt / steps, [x0, y0] = Pt(-0.13, 0.11), [x1, y1] = Pt(0.17, 0);
      for (let k = 0; k < steps; k++) {
        m.x += m.vx * hm; m.y += m.vy * hm;
        if ((m.lp += hm) > 0.03) { m.lp = 0; w.puffs.push({ x: m.x, y: m.y, r: 0.6 * u, vy: 0, life: 0.6 }); }
        if (m.x > Math.min(x0, x1) && m.x < Math.max(x0, x1) && m.y > Math.min(y0, y1) && m.y < Math.max(y0, y1)) { boom(m.x, m.y, 0.6, null); T.bv += 0.015 * N; T.rv += 0.1 * N; return false; }
        if (m.x > N + 5 * u || m.y < -5 * u) return false;
      }
      r.stroke(m.x - (m.vx / 0.85 / N) * 2.5 * u, m.y - (m.vy / 0.85 / N) * 2.5 * u, m.x, m.y, Math.max(1, 1.2 * u), BRIGHT);
      return true;
    });
    // the slug's line, the bursts, the grit (it lands and bounces), the smoke (it rises, slowing, and spreads)
    if (w.beam && (w.beam.t -= dt) > 0) { const B = w.beam; r.stroke(B.x0, B.y0, B.x1, B.y1, Math.max(2, 4 * u), COOL); r.stroke(B.x0, B.y0, B.x1, B.y1, Math.max(1, 1.6 * u), WHITE); }
    w.booms = w.booms.filter((b) => { b.t += dt; const q = b.t / 0.3; if (q < 1) { r.disc(b.x, b.y, (1.5 + 6 * q) * u * b.k, q < 0.25 ? WHITE : HOT); r.ring(b.x, b.y, (2.5 + 9 * q) * u * b.k, Math.max(1, u), LMID); } return q < 1; });
    w.debris = w.debris.filter((p) => {
      p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > p.gy) { p.y = p.gy; if (p.vy > 0.05 * N) { p.vy *= -0.3; p.vx *= 0.6; } else { p.vy = 0; p.vx *= Math.exp(-dt * 15); } } // a bounce, or sliding to a stop
      r.rect(p.x, p.y - u, Math.max(1, u), Math.max(1, u), p.c);
      return (p.life -= dt) > 0;
    });
    if (w.puffs.length > 160) w.puffs.splice(0, w.puffs.length - 160);
    w.puffs = w.puffs.filter((p) => {
      p.vy = follow(p.vy, -0.03 * N, dt, 0.6); p.y += p.vy * dt; p.r += dt * 2.5 * u;
      ditherDisc(r, p.x, p.y, p.r, LMID + DIM, clamp(p.life * 0.8));
      return (p.life -= dt) > 0;
    });
    if (snow) snowfall(W, w.snow, Math.round((40 + 120 * f.rel.trebDrive) * (N / 125)), 0.18, BRIGHT);
    if (!lights) for (let i = 0; i < r.buf.length; i++) r.buf[i] = DARKMAP[r.buf[i]];
  },
};

// ---------------------------------------------------------------------------------------------- sniperfield
// A snowfield in perspective (one horizon; whatever stands on the snow meets it at horizon + k/z and is sized by 1/z)
// with two snipers lying far apart, one near, one a speck at the trees. Their breath clouds on the beat (out of the
// mouth, slowing in the air, rising, carried downwind, thinning), a scope glints on a snare, a heavy kick sends a
// tracer across: a straight line in space bent only by the crosswind, so on screen it slows going away and quickens
// coming in, and it throws up snow where it lands. Snow falls in three depths, the treble is the wind; a wolf trots
// across on a section, leaving prints. A drop: a round into a tree, its load of snow drops off and the branches spring up.
const SNOW_W = { open: [3, 2, 1], forest: [2, 3, 2], blizzard: [1, 2, 3] };
const SNOWS = { open: { trees: 7, fog: 0, flakes: 1 }, forest: { trees: 20, fog: 0.15, flakes: 1 }, blizzard: { trees: 12, fog: 0.55, flakes: 2.5 } };
const SF = { yh: 0.34, fz: 0.9, camH: 1.5 }; // the field's camera: the horizon and focal length (of N), its height (m)
const PA = [0, 0, 0], PB = [0, 0, 0];
// a point of the field (metres: X right, Y up, Z ahead) to cells: o = [x, y, cells a metre there]
const pj = (N, X, Y, Z, o) => { const k = (SF.fz * N) / Math.max(0.5, Z); o[0] = N / 2 + X * k; o[1] = SF.yh * N + (SF.camH - Y) * k; o[2] = k; return o; };
// an upright triangle, apex (ax, ay), its base hw either side at y = by, as an ordered dither of density d
function ditherTri(r, ax, ay, hw, by, c, d) {
  const N = r.N, h = by - ay;
  if (h <= 0) return;
  for (let y = Math.max(0, Math.round(ay)); y < Math.min(N, Math.round(by)); y++) {
    const w = (hw * (y + 0.5 - ay)) / h;
    for (let x = Math.max(0, Math.round(ax - w)); x < Math.min(N, Math.round(ax + w)); x++) if (d >= 1 || bayer(x, y) < d) r.buf[y * N + x] = c;
  }
}
const SNIPERS = [{ fx: -1.3, fz: 4.2, hx: -0.6, hz: 5.6 }, { fx: 5, fz: 31.5, hx: 4.6, hz: 30 }];
const FL_SP = [0.07, 0.14, 0.28], FL_DR = [0.02, 0.05, 0.1]; // the three depths of falling snow: speed, how far the wind carries it
function buildField(W) {
  const { w, rnd } = W, K = SNOWS[w.kind];
  w.trees = [];
  for (let k = 0; k < 400 && w.trees.length < K.trees; k++) {
    const Z = 12 + rnd() * 60, X = (rnd() * 2 - 1) * Z * 0.6;
    if (Math.abs(X - lerp(-0.6, 4.6, (Z - 5.6) / 24.4)) < 2.5 && Z < 33) continue; // keep the line between them clear
    w.trees.push({ X, Z, H: 5 + rnd() * 4, load: true, spr: null });
  }
  w.trees.sort((a, b) => b.Z - a.Z);
}
const sniperfield = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, SNOW_W, bandOf(W.a)), wind: 0, breath: [], shots: 0, tracers: [], parts: [], chunks: [], glint: null, wolf: null, prints: [], sparkle: 0, items: [], N,
      fl: Float32Array.from({ length: 1200 }, (_, i) => (i % 3 === 2 ? Math.floor(rnd() * 3) : rnd() * N)) });
    buildField(W);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W;
    if (w.N !== N) sniperfield.init(W);
    if (f.section === 'change') { w.kind = rollW(rnd, SNOW_W, bandOf(W.a)); buildField(W); if (!w.wolf) { const Z = 10 + rnd() * 8, dir = rnd() < 0.5 ? 1 : -1; w.wolf = { X: -dir * Z * 0.62, Z, dir, ph: 0, last: -1 }; } }
    const K = SNOWS[w.kind], yh = SF.yh * N, n = Math.max(1, Math.ceil(dt * 60)), h = dt / n;
    w.wind = follow(w.wind, (f.rel.trebDrive - 0.15) * 1.5 + 0.4 * Math.sin(t * 0.37), dt, 0.8); // m/s across the field, + to the right
    const sway = Math.sin(t * 1.3) * 0.015 * (0.3 + f.rel.midDrive) + Math.sin(t * 3.1) * 0.004; // the near rifle wanders with the mids
    // the snipers: head, aim along the line to the other, the muzzle, the scope, the mouth
    const S = SNIPERS.map((q, i) => {
      const o = SNIPERS[1 - i], dx = o.hx - q.hx, dz = o.hz - q.hz, l = Math.hypot(dx, dz), a = i ? 0 : sway, ax = (dx / l) * Math.cos(a) - (dz / l) * Math.sin(a), az = (dx / l) * Math.sin(a) + (dz / l) * Math.cos(a);
      return { ...q, ax, az, mx: q.hx + ax * 1.15, mz: q.hz + az * 1.15, sx: q.hx + ax * 0.3, sz: q.hz + az * 0.3 };
    });
    const tracer = (from, X, Y, Z, tree) => {
      const dx = X - from.mx, dy = Y - 0.3, dz = Z - from.mz, l = Math.hypot(dx, dy, dz), v0 = 140;
      w.tracers.push({ x: from.mx, y: 0.3, z: from.mz, vx: (dx / l) * v0, vy: (dy / l) * v0, vz: (dz / l) * v0, t: 0, T: l / v0, aw: w.wind * 12, tree });
      w.glint = { who: from === S[0] ? 0 : 1, t: 0.6 };
    };
    for (const hh of hits) {
      if (isLow(hh) && hh.strength > 0.6 && w.tracers.length < 4) { const k = w.shots++ % 2, o = S[1 - k]; tracer(S[k], o.hx + (rnd() - 0.5) * 1.6, 0, o.hz + (rnd() - 0.5) * (k ? 1 : 3)); }
      else if (hh.kind === 'snare') w.glint = { who: rnd() < 0.7 ? 1 : 0, t: 1 };
      else if (hh.kind === 'hat') w.sparkle = 0.15;
    }
    if (f.section === 'drop') { // the near one fires into a tree, the nearest still holding its snow (else at the other)
      const tr = w.trees.filter((q) => q.load).sort((a, b) => a.Z - b.Z)[0];
      if (tr) tracer(S[0], tr.X, 1.6, tr.Z - 0.2, tr); else tracer(S[0], S[1].hx, 0, S[1].hz - 1, null);
      s.shake = Math.max(s.shake, 0.3);
    }
    // the sky: a low sun ahead on the left (so the shadows fall to the right and toward the eye), the haze, the far treeline
    r.disc(0.18 * N, yh - 0.1 * N, 0.04 * N, BRIGHT);
    for (let y = Math.round(yh - 0.08 * N); y < yh; y++) { const q = 1 - (yh - y) / (0.08 * N); for (let x = 0; x < N; x++) if (bayer(x, y) < q * 0.8) r.buf[y * N + x] = LMID + DIM; }
    for (let x = 0; x < N; x += Math.max(1, Math.round(2.5 * u))) { const th = (0.01 + 0.02 * hash(x, 9)) * N; ditherTri(r, x, yh - th, th * 0.35, yh + 1, DARK + DIM, 1 - K.fog * 0.8); }
    // the snow: hazier with distance, wind-carved ridges near the eye, fixed to the ground
    for (let y = Math.ceil(yh); y < N; y++) {
      const Z = (SF.camH * SF.fz * N) / (y + 0.5 - yh), q = clamp((Z - 6) / 30), k = (SF.fz * N) / Z, row = y * N, zc = Math.floor(Z * 2.5), edge = Z * 2.5 - zc < 0.15 && Z < 26;
      for (let x = 0; x < N; x++) r.buf[row + x] = edge && hash(Math.floor(((x - N / 2) / k) * 1.2), zc) < 0.1 ? MID + DIM : bayer(x, y) < q ? LMID + DIM : LMID;
    }
    if ((w.sparkle -= dt) > 0) for (let k = 0; k < 14; k++) r.set(hash(k, f.beat.count) * N, (0.55 + 0.45 * hash(k + 40, f.beat.count)) * N, WHITE);
    // the trees' shadows on the snow, the wolf's prints
    for (const T of w.trees) { pj(N, T.X, 0, T.Z, PA); pj(N, T.X + T.H * 0.9, 0, T.Z - T.H * 0.35, PB); r.stroke(PA[0], PA[1], PB[0], PB[1], Math.max(1, 0.18 * PA[2]), LMID + DIM); }
    for (const p of w.prints) { pj(N, p.X, 0, p.Z, PA); r.set(PA[0], PA[1], MID + DIM); }
    // far to near: the trees, the far sniper, the wolf, the falling snow loads, the near sniper
    const items = w.items;
    items.length = 0;
    w.trees.forEach((T, i) => items.push([T.Z, 0, i]));
    items.push([S[1].hz, 1, 1], [S[0].hz - 1, 1, 0]);
    if (w.wolf) items.push([w.wolf.Z, 2, 0]);
    w.chunks.forEach((c, i) => items.push([c.Z, 3, i]));
    items.sort((a, b) => b[0] - a[0]);
    const sniper = (q, near) => {
      const P = (X, Y, Z) => { pj(N, X, Y, Z, PA); return [PA[0], PA[1], PA[2]]; };
      const lx = -q.az, lz = q.ax, F = [q.fx, q.fz], Hh = [lerp(q.fx, q.hx, 0.45), lerp(q.fz, q.hz, 0.45)], Sh = [lerp(q.fx, q.hx, 0.8), lerp(q.fz, q.hz, 0.8)];
      const body = [P(Sh[0] + lx * 0.22, 0.28, Sh[1] + lz * 0.22), P(Sh[0] - lx * 0.22, 0.28, Sh[1] - lz * 0.22), P(Hh[0] - lx * 0.2, 0.2, Hh[1] - lz * 0.2), P(Hh[0] + lx * 0.2, 0.2, Hh[1] + lz * 0.2)];
      for (const sg of [1, -1]) { const a = P(Hh[0] + sg * lx * 0.1, 0.18, Hh[1] + sg * lz * 0.1), b = P(F[0] + sg * lx * 0.25, 0.08, F[1] + sg * lz * 0.25); r.stroke(a[0], a[1], b[0], b[1], Math.max(1, 0.15 * a[2]), FIG); }
      r.poly(body, FIG);
      const hd = P(q.hx, 0.32, q.hz), mz = P(q.mx, 0.3, q.mz), sb = P(Sh[0] + lx * 0.08, 0.3, Sh[1] + lz * 0.08), sc = P(q.sx, 0.4, q.sz);
      for (const sg of [1, -1]) { const a = P(Sh[0] + sg * lx * 0.2, 0.26, Sh[1] + sg * lz * 0.2), e = P(q.hx + q.ax * 0.3 + sg * lx * 0.22, 0.06, q.hz + q.az * 0.3 + sg * lz * 0.22); r.stroke(a[0], a[1], e[0], e[1], Math.max(1, 0.1 * a[2]), FIG); }
      r.stroke(sb[0], sb[1], mz[0], mz[1], Math.max(1, 0.06 * sb[2]), DARK);
      r.rect(sc[0] - 0.08 * sc[2], sc[1] - 0.03 * sc[2], Math.max(1, 0.16 * sc[2]), Math.max(1, 0.06 * sc[2]), MID);
      r.disc(hd[0], hd[1], Math.max(0.6, 0.12 * hd[2]), FIG);
      if (near) { r.disc(hd[0], hd[1] - 0.04 * hd[2], Math.max(0.6, 0.11 * hd[2]), MID); targets.push({ x: Math.min(body[2][0], hd[0]) - 2 * u, y: hd[1] - 0.15 * hd[2], w: Math.abs(mz[0] - body[2][0]) + 4 * u, h: Math.abs(body[2][1] - hd[1]) + 0.3 * hd[2] }); }
    };
    for (const [, kind, i] of items) {
      if (kind === 0) { // a fir: tiers of branches, the snow on top of each, hazier with distance in the blizzard
        const T = w.trees[i], d = 1 - K.fog * clamp((T.Z - 10) / 40);
        pj(N, T.X, 0, T.Z, PA);
        const bx = PA[0], by = PA[1], k = PA[2], H = T.H;
        ditherTri(r, bx, by - 0.16 * H * k, 0.04 * H * k, by, DARK, d);
        for (let j = 0; j < 4; j++) {
          const y0 = H * (0.1 + 0.2 * j) + (T.spr ? T.spr[j].o * 0.08 * H : 0), y1 = H * (0.46 + 0.2 * j), hw = (0.27 - 0.05 * j) * H;
          ditherTri(r, bx, by - y1 * k, hw * k, by - y0 * k, T.Z < 30 ? DARK : DARK + DIM, d);
          if (T.load) ditherTri(r, bx, by - y1 * k, hw * 0.55 * k, by - (y0 + 0.17 * H) * k, BRIGHT, d);
        }
        if (T.spr) for (const sp of T.spr) for (let k2 = 0; k2 < n; k2++) { sp.v += (-40 * sp.o - 3 * sp.v) * h; sp.o += sp.v * h; }
      } else if (kind === 1) sniper(S[i], i === 0);
      else if (kind === 2) { // the wolf: a trot, the diagonal legs together, steps in time with the ground it covers
        const Wf = w.wolf, P = (X, Y) => { pj(N, X, Y, Wf.Z, PA); return [PA[0], PA[1], PA[2]]; }, dX = Wf.dir;
        const body0 = P(Wf.X - dX * 0.5, 0.62), body1 = P(Wf.X + dX * 0.45, 0.66), k = body0[2];
        for (const [ox, phs, nearLeg] of [[0.38, 0, false], [-0.38, Math.PI, false], [0.38, Math.PI, true], [-0.38, 0, true]]) {
          const a = Wf.ph + phs, top = P(Wf.X + dX * ox, 0.5), foot = P(Wf.X + dX * (ox + Math.sin(a) * 0.22), Math.max(0, Math.cos(a)) * 0.08);
          r.stroke(top[0], top[1], foot[0], foot[1], Math.max(1, 0.08 * k), nearLeg ? FIG : MID);
        }
        r.stroke(body0[0], body0[1], body1[0], body1[1], Math.max(1, 0.32 * k), FIG);
        const hd = P(Wf.X + dX * 0.68, 0.78), sn = P(Wf.X + dX * 0.9, 0.72), tl = P(Wf.X - dX * 0.85, 0.48 + 0.05 * Math.sin(Wf.ph * 0.5));
        r.disc(hd[0], hd[1], Math.max(0.6, 0.13 * k), FIG); r.stroke(hd[0], hd[1], sn[0], sn[1], Math.max(1, 0.08 * k), FIG);
        r.line(hd[0], hd[1] - 0.1 * k, hd[0] - dX * 0.04 * k, hd[1] - 0.22 * k, FIG); r.stroke(body0[0], body0[1], tl[0], tl[1], Math.max(1, 0.08 * k), FIG);
        targets.push({ x: Math.min(tl[0], sn[0]), y: hd[1] - 0.2 * k, w: Math.abs(sn[0] - tl[0]), h: 0.85 * k });
      } else { const c = w.chunks[i]; pj(N, c.X, c.Y, c.Z, PA); ditherDisc(r, PA[0], PA[1], Math.max(0.8, c.s * PA[2]), BRIGHT, 0.9); }
    }
    // the wolf trots on; a print each time a foot comes down; gone off the edge of the view
    if (w.wolf) {
      const Wf = w.wolf, v = 2.8;
      // a cycle for every 0.88 m: a foot swings 0.22 m either way of its hip, so the planted one stays put; a pair
      // comes down at each half cycle (a = pi/2), and its prints are where those feet are (the near side nearer)
      Wf.X += Wf.dir * v * dt; Wf.ph += ((v * dt) / 0.88) * TAU;
      const k = Math.floor((Wf.ph - Math.PI / 2) / Math.PI);
      if (k !== Wf.last) {
        Wf.last = k;
        const phs = k & 1 ? Math.PI : 0, s0 = 0.22 * Math.sin(Wf.ph + phs), fo = phs ? -0.38 : 0.38; // fo: the far leg of the pair; the near one is its opposite
        w.prints.push({ X: Wf.X + Wf.dir * (fo + s0), Z: Wf.Z + 0.1 }, { X: Wf.X + Wf.dir * (-fo + s0), Z: Wf.Z - 0.1 });
        if (w.prints.length > 80) w.prints.splice(0, w.prints.length - 80);
      }
      if (Math.abs(Wf.X) > Wf.Z * 0.7) w.wolf = null;
    }
    // the falling loads: gravity, then a puff of powder where they land
    w.chunks = w.chunks.filter((c) => {
      c.vy -= 9.8 * dt; c.Y += c.vy * dt;
      if (c.Y > 0) return true;
      for (let k = 0; k < 10; k++) w.parts.push({ X: c.X, Y: 0.05, Z: c.Z, vx: (rnd() - 0.5) * 3, vy: rnd() * 2.5, vz: (rnd() - 0.5) * 2, life: 0.8, c: BRIGHT });
      w.breath.push({ X: c.X, Y: 0.3, Z: c.Z, vx: 0, vy: 0.2, vz: 0, R: c.s, life: 1.4, L: 1.4 });
      return false;
    });
    // breath on the beat: from each mouth in turn, along the aim, rising and slowing into the wind, spreading
    if (f.beat.on) { const q = S[f.beat.count % 2]; w.breath.push({ X: q.hx + q.ax * 0.15, Y: 0.33, Z: q.hz + q.az * 0.15, vx: q.ax * 0.9, vy: 0.1, vz: q.az * 0.9, R: 0.06, life: 1.8, L: 1.8 }); }
    const air = 1 - Math.exp(-dt * 1.6);
    w.breath = w.breath.filter((b) => {
      b.vx += (w.wind - b.vx) * air; b.vz -= b.vz * air; b.vy += (0.15 - b.vy) * air;
      b.X += b.vx * dt; b.Y += b.vy * dt; b.Z += b.vz * dt; b.R += dt * 0.16;
      pj(N, b.X, b.Y, b.Z, PA);
      ditherDisc(r, PA[0], PA[1], Math.max(0.7, b.R * PA[2]), BRIGHT, 0.75 * (b.life / b.L));
      return (b.life -= dt) > 0;
    });
    // tracers: a streak along the straight path, drifting with the crosswind; snow (or bark) thrown up where they land
    w.tracers = w.tracers.filter((q) => {
      q.t = Math.min(q.T, q.t + dt);
      const at = (tt, o) => pj(N, q.x + q.vx * tt + 0.5 * q.aw * tt * tt, q.y + q.vy * tt, q.z + q.vz * tt, o);
      at(Math.max(0, q.t - 0.02), PB); at(q.t, PA);
      r.stroke(PB[0], PB[1], PA[0], PA[1], Math.max(1, 0.05 * PA[2]), HOT); r.set(PA[0], PA[1], WHITE);
      if (q.t < q.T) return true;
      const X = q.x + q.vx * q.T + 0.5 * q.aw * q.T * q.T, Y = q.y + q.vy * q.T, Z = q.z + q.vz * q.T;
      for (let k = 0; k < 14; k++) w.parts.push({ X, Y, Z, vx: (rnd() - 0.5) * 2.5, vy: 1 + rnd() * 4, vz: (rnd() - 0.5) * 2, life: 1, c: q.tree && k < 6 ? DARK : BRIGHT });
      if (q.tree) { // the load comes off, tier by tier, the branches spring up
        const T = q.tree; T.load = false; T.spr = [0, 1, 2, 3].map((j) => ({ o: 0, v: 2 + j * 0.4 }));
        for (let j = 0; j < 12; j++) { const tier = j >> 2, hw = (0.27 - 0.05 * tier) * T.H * 0.5; w.chunks.push({ X: T.X + (rnd() * 2 - 1) * hw, Y: T.H * (0.38 + 0.2 * tier) + rnd() * 0.3, Z: T.Z - 0.3 - rnd() * 0.4, vy: 0, s: 0.1 + rnd() * 0.12 }); }
      } else w.breath.push({ X, Y: 0.2, Z, vx: 0, vy: 0.3, vz: 0, R: 0.15, life: 1, L: 1 });
      if (Z < 12) s.shake = Math.max(s.shake, 0.2);
      return false;
    });
    if (w.parts.length > 300) w.parts.splice(0, w.parts.length - 300);
    w.parts = w.parts.filter((p) => {
      p.vy -= 9.8 * dt; p.X += p.vx * dt; p.Y += p.vy * dt; p.Z += p.vz * dt;
      if (p.Y < 0) { const k = Math.exp(-dt * 20); p.Y = 0; p.vy = 0; p.vx *= k; p.vz *= k; p.life -= dt * 2; } // sliding to a stop in the snow
      pj(N, p.X, p.Y, p.Z, PA); r.rect(PA[0], PA[1], Math.max(1, 0.06 * PA[2]), Math.max(1, 0.06 * PA[2]), p.c);
      return (p.life -= dt) > 0;
    });
    // the glint of a scope: a star that flares and fades
    if (w.glint && (w.glint.t -= dt * 1.5) > 0) {
      const q = S[w.glint.who], L = (1 + 6 * w.glint.t) * u;
      pj(N, q.sx, 0.42, q.sz, PA);
      r.line(PA[0] - L, PA[1], PA[0] + L, PA[1], BRIGHT); r.line(PA[0], PA[1] - L * 0.7, PA[0], PA[1] + L * 0.7, BRIGHT); r.set(PA[0], PA[1], WHITE);
      if (w.glint.who) targets.push({ x: PA[0] - 3 * u, y: PA[1] - 3 * u, w: 6 * u, h: 6 * u });
    }
    // falling snow in three depths: the nearer, the bigger, the faster, the more the wind carries it
    const fl = w.fl, cnt = Math.min(400, Math.round((40 + 140 * f.level) * K.flakes * (N / 125)));
    for (let i = 0; i < cnt; i++) {
      const o = i * 3, l = fl[o + 2], sz = l === 2 ? Math.max(1, 1.6 * u) : Math.max(1, 0.8 * u);
      fl[o + 1] += FL_SP[l] * N * dt; fl[o] += (w.wind * FL_DR[l] * N + Math.sin(t * 1.3 + i) * 2 * u) * dt;
      if (fl[o + 1] > N) { fl[o + 1] -= N + rnd() * 5 * u; fl[o] = rnd() * N; }
      if (fl[o] < 0) fl[o] += N; else if (fl[o] >= N) fl[o] -= N;
      r.rect(fl[o], fl[o + 1], sz, sz, l ? BRIGHT : LMID);
    }
  },
};

// ---------------------------------------------------------------------------------------------- nanoswarm
// A few thousand points in a flow field: each is pulled by a spring to its place in the current shape (a hand, a
// turning sphere, a turning ring, a standing silhouette) while a curl field (no sources, no sinks: it only stirs)
// carries it about, so a change of shape on the beat pours them through one another like a fluid. The mids stir the
// field harder, a kick sends a shock out from where it lands, a snare scatters a few that run hot, a note lights a
// band across them, the shape breathes on the beat; drawn by density, thicker is brighter, the near side of the
// sphere and the ring thicker than the far. A drop: they harden into armour plates over a silhouette, every point
// snapping onto its plate, the plates shut and hold for six beats, then burst apart into points again.
const SWARM_W = { drift: [3, 2, 1], forms: [2, 3, 2], storm: [1, 2, 3] };
const SWARMS = { drift: { every: 8, flow: 0.6, cycle: ['sphere', 'ring', 'sphere', 'figure'] }, forms: { every: 4, flow: 1, cycle: ['hand', 'sphere', 'figure', 'ring'] },
  storm: { every: 2, flow: 1.6, cycle: ['figure', 'hand', 'ring', 'sphere', 'hand'] } };
// the plates of the armour over the silhouette, quads in the unit square (left side; the right is its mirror)
const PLATES = (() => {
  const L = [[[0.44, 0.13], [0.56, 0.13], [0.57, 0.245], [0.43, 0.245]], [[0.31, 0.28], [0.4, 0.27], [0.41, 0.35], [0.3, 0.36]], [[0.41, 0.29], [0.495, 0.29], [0.495, 0.42], [0.41, 0.4]],
    [[0.33, 0.42], [0.39, 0.42], [0.385, 0.57], [0.335, 0.57]], [[0.41, 0.58], [0.485, 0.58], [0.485, 0.71], [0.415, 0.71]], [[0.415, 0.735], [0.485, 0.735], [0.485, 0.88], [0.42, 0.88]]];
  const out = [L[0]];
  for (const q of L.slice(1)) { const m = q.map(([x, y]) => [1 - x, y]); out.push(q, [m[1], m[0], m[3], m[2]]); } // corners kept top-left, top-right, bottom-right, bottom-left
  for (let i = 0; i < 3; i++) out.push([[0.42, 0.43 + 0.045 * i], [0.58, 0.43 + 0.045 * i], [0.575, 0.47 + 0.045 * i], [0.425, 0.47 + 0.045 * i]]);
  return out;
})();
function inHand(x, y) {
  if (x > 0.38 && x < 0.62 && y > 0.45 && y < 0.7) return true;
  if (x > 0.42 && x < 0.58 && y > 0.69 && y < 0.86) return true;
  if (y < 0.47) for (const [a, b, top] of [[0.383, 0.423, 0.22], [0.442, 0.482, 0.18], [0.501, 0.541, 0.2], [0.56, 0.6, 0.26]]) if (x > a && x < b && y > top) return true;
  const tx = x - 0.385, ty = y - 0.62, along = -0.6 * tx - 0.8 * ty, across = Math.abs(0.8 * tx - 0.6 * ty); // the thumb, out to the upper left
  return along > 0 && along < 0.17 && across < 0.028;
}
function inFigure(x, y) {
  const dx = Math.abs(x - 0.5), hy = y - 0.2;
  if (dx * dx + hy * hy < 0.003) return true;
  if (y > 0.25 && y < 0.3) return dx < 0.025;
  if (y > 0.28 && y < 0.56 && dx < 0.1 - (y - 0.28) * 0.08) return true;
  if (y > 0.29 && y < 0.6 && dx > 0.11 && dx < 0.165 - (y - 0.29) * 0.06) return true;
  return y > 0.55 && y < 0.88 && dx > 0.012 && dx < 0.085;
}
function buildSwarm(W) {
  const { w, rnd, N } = W, P = Math.round(clamp(0.2 * N * N, 600, 8000));
  const pts2 = (inside) => { const a = new Float32Array(2 * P); for (let i = 0; i < P; i++) { let x, y, k = 0; do { x = rnd(); y = rnd(); } while (!inside(x, y) && ++k < 200); a[2 * i] = x; a[2 * i + 1] = y; } return a; };
  const sph = new Float32Array(3 * P), tor = new Float32Array(3 * P), pl = new Uint8Array(P), ab = new Float32Array(2 * P);
  for (let i = 0; i < P; i++) { // a Fibonacci sphere; a torus at random angles; a plate and a spot on it, by area
    const yy = 1 - (2 * (i + 0.5)) / P, rr = Math.sqrt(1 - yy * yy), a = i * 2.39996;
    sph[3 * i] = Math.cos(a) * rr; sph[3 * i + 1] = yy; sph[3 * i + 2] = Math.sin(a) * rr;
    const u1 = rnd() * TAU, v1 = rnd() * TAU, R = 0.3 + 0.045 * Math.cos(v1);
    tor[3 * i] = Math.cos(u1) * R; tor[3 * i + 1] = 0.045 * Math.sin(v1); tor[3 * i + 2] = Math.sin(u1) * R;
    pl[i] = Math.floor(rnd() * PLATES.length); ab[2 * i] = rnd(); ab[2 * i + 1] = rnd();
  }
  Object.assign(w, { N, P, px: Float32Array.from({ length: P }, () => 0.2 + rnd() * 0.6), py: Float32Array.from({ length: P }, () => 0.2 + rnd() * 0.6), vx: new Float32Array(P), vy: new Float32Array(P),
    heat: new Float32Array(P), hand: pts2(inHand), figure: pts2(inFigure), sph, tor, pl, ab, dens: new Uint8Array(N * N), mark: new Uint8Array(N * N), gu: new Float32Array(25 * 25), gv: new Float32Array(25 * 25) });
}
const nanoswarm = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, SWARM_W, bandOf(W.a)), si: 0, rot: 0, hard: null, band: null, stir: 1, N: 0 });
    buildSwarm(W);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W;
    if (w.N !== N) buildSwarm(W);
    if (f.section === 'change') { w.kind = rollW(rnd, SWARM_W, bandOf(W.a)); w.si = 0; }
    const K = SWARMS[w.kind], bs = beatS(f), P = w.P, { px, py, vx, vy, heat } = w;
    if (f.section === 'drop' && !w.hard) w.hard = { t: 0, st: 0 };
    if (f.beat.on && !w.hard && f.beat.count % K.every === 0) { w.si = (w.si + 1) % K.cycle.length; w.stir = 1; }
    w.stir *= Math.exp(-dt * 1.2); // a change of shape stirs the field up, then it settles
    const shape = w.hard && w.hard.st < 2 ? 'armour' : K.cycle[w.si % K.cycle.length];
    w.rot += dt * (0.5 + 0.8 * f.rel.midDrive);
    for (const hh of hits) {
      if (isLow(hh)) { // a shock out from where it landed
        const cx = hh.x, cy = hh.y, imp = 0.5 * hh.strength;
        for (let i = 0; i < P; i++) { const dx = px[i] - cx, dy = py[i] - cy, d = Math.sqrt(dx * dx + dy * dy) + 0.02, e = (imp * Math.exp(-d / 0.25)) / d; vx[i] += dx * e; vy[i] += dy * e; }
      } else if (hh.kind === 'snare') for (let k = 0; k < P * 0.08; k++) { const i = Math.floor(rnd() * P), a = rnd() * TAU; vx[i] += Math.cos(a) * 0.5; vy[i] += Math.sin(a) * 0.5; heat[i] = 1; }
      else if (isTonal(hh)) w.band = { y: 0.15 + (0.7 * hh.pc) / 11, t: 0.5 };
    }
    // the drop: snap onto the plates, hold six beats, burst
    let solid = false;
    if (w.hard) {
      const Hd = w.hard;
      Hd.t += dt;
      if (Hd.st === 0 && Hd.t > 0.6) { Hd.st = 1; Hd.t = 0; }
      else if (Hd.st === 1) { solid = true; if (Hd.t > 6 * bs) { Hd.st = 2; Hd.t = 0; for (let i = 0; i < P; i++) { const a = rnd() * TAU, sp = 0.3 + rnd() * 0.6; vx[i] += (px[i] - 0.5) * 3 + Math.cos(a) * sp; vy[i] += (py[i] - 0.5) * 3 + Math.sin(a) * sp; } s.shake = Math.max(s.shake, 0.4); } }
      else if (Hd.st === 2 && Hd.t > 1.5) w.hard = null;
    }
    // the field and the springs; everything in the unit square
    const amp = 0.009 * (0.3 + 1.7 * f.rel.midDrive) * K.flow * (0.6 + 2 * w.stir), a1 = t * 0.7, b1 = -t * 0.5, a2 = t * 0.4, b2 = t * 0.9, gu = w.gu, gv = w.gv;
    for (let j = 0; j < 25; j++) for (let i = 0; i < 25; i++) { // the curl of a stream function, on a coarse grid, read back bilinearly
      const x = i / 24, y = j / 24, s1 = Math.sin(6.3 * x + a1), c1 = Math.cos(6.3 * x + a1), s2 = Math.sin(7.7 * y + b1), c2 = Math.cos(7.7 * y + b1), s3 = Math.sin(9.1 * y + a2), c3 = Math.cos(9.1 * y + a2), s4 = Math.sin(8.3 * x + b2), c4 = Math.cos(8.3 * x + b2);
      gu[j * 25 + i] = amp * (-7.7 * s1 * s2 + 0.6 * 9.1 * c3 * c4); gv[j * 25 + i] = -amp * (6.3 * c1 * c2 - 0.6 * 8.3 * s3 * s4);
    }
    const kS = shape === 'armour' ? 80 : 40, damp = Math.exp(-dt * (shape === 'armour' ? 12 : 5)), sc = 1 + 0.05 * f.beat.pulse, sR = 0.28 * sc;
    const cr = Math.cos(w.rot), sr = Math.sin(w.rot), ct = Math.cos(0.35), st = Math.sin(0.35), cq = Math.cos(1.05), sq = Math.sin(1.05);
    const T2 = shape === 'hand' ? w.hand : shape === 'figure' ? w.figure : null, T3 = shape === 'sphere' ? w.sph : shape === 'ring' ? w.tor : null;
    const ring = shape === 'ring', c0 = ring ? cq : ct, s0 = ring ? sq : st, rS = ring ? sc : sR; // the ring tilted further than the sphere
    const dens = w.dens, mark = w.mark, band = w.band && (w.band.t -= dt) > 0 ? w.band.y : -1, fast2 = 0.09;
    dens.fill(0); mark.fill(0);
    for (let i = 0; i < P; i++) {
      let tx, ty, wt = 1;
      if (T2) { tx = 0.5 + (T2[2 * i] - 0.5) * sc; ty = 0.5 + (T2[2 * i + 1] - 0.5) * sc; }
      else if (T3) {
        const x = T3[3 * i], y = T3[3 * i + 1], z = T3[3 * i + 2], x1 = x * cr + z * sr, z1 = -x * sr + z * cr;
        const y2 = y * c0 - z1 * s0, z2 = y * s0 + z1 * c0;
        tx = 0.5 + x1 * rS; ty = 0.5 + y2 * rS;
        const lit = (-0.55 * x1 - 0.6 * y2 - 0.58 * z2) / (ring ? 0.35 : 1); // the near side lit from the upper left, the far side dim
        wt = z2 < 0 ? 1 + (lit > 0.25 ? 1 : 0) + (lit > 0.65 ? 1 : 0) : 1;
      } else { // a spot on its plate: the bilinear blend of the plate's corners
        const q = PLATES[w.pl[i]], a = w.ab[2 * i], b = w.ab[2 * i + 1];
        tx = (q[0][0] * (1 - a) + q[1][0] * a) * (1 - b) + (q[3][0] * (1 - a) + q[2][0] * a) * b; ty = (q[0][1] * (1 - a) + q[1][1] * a) * (1 - b) + (q[3][1] * (1 - a) + q[2][1] * a) * b;
      }
      const x = px[i], y = py[i], gx = clamp(x, 0, 0.9999) * 24, gy = clamp(y, 0, 0.9999) * 24, i0 = gx | 0, j0 = gy | 0, ax = gx - i0, ay = gy - j0, g0 = j0 * 25 + i0;
      const fu = (gu[g0] * (1 - ax) + gu[g0 + 1] * ax) * (1 - ay) + (gu[g0 + 25] * (1 - ax) + gu[g0 + 26] * ax) * ay, fv = (gv[g0] * (1 - ax) + gv[g0 + 1] * ax) * (1 - ay) + (gv[g0 + 25] * (1 - ax) + gv[g0 + 26] * ax) * ay;
      vx[i] = vx[i] * damp + kS * (tx - x) * dt; vy[i] = vy[i] * damp + kS * (ty - y) * dt;
      const nx = x + (vx[i] + (solid ? 0 : fu)) * dt, ny = y + (vy[i] + (solid ? 0 : fv)) * dt;
      px[i] = nx; py[i] = ny;
      if (heat[i] > 0) heat[i] = Math.max(0, heat[i] - dt * 2);
      const ix = (nx * N) | 0, iy = (ny * N) | 0;
      if (ix < 0 || iy < 0 || ix >= N || iy >= N) continue;
      const c = iy * N + ix;
      dens[c] = Math.min(255, dens[c] + wt);
      const m = heat[i] > 0.3 ? 3 : band >= 0 && Math.abs(ny - band) < 0.025 ? 2 : vx[i] * vx[i] + vy[i] * vy[i] > fast2 ? 1 : 0;
      if (m > mark[c]) mark[c] = m;
    }
    // the containment: faint rings and ticks turning with the bass clock
    r.ring(N / 2, N / 2, 0.46 * N, Math.max(1, 0.6 * u), DARK + DIM);
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU + f.rel.bassClock * 0.1; r.line(N / 2 + Math.cos(a) * 0.44 * N, N / 2 + Math.sin(a) * 0.44 * N, N / 2 + Math.cos(a) * 0.48 * N, N / 2 + Math.sin(a) * 0.48 * N, k % 6 ? DARK : MID); }
    if (solid) { // the armour: the plates shut, their top edges catching the light, a pulse on the beat
      for (const q of PLATES) {
        r.poly(q.map(([x, y]) => [x * N, y * N]), MID);
        r.line(q[0][0] * N, q[0][1] * N, q[1][0] * N, q[1][1] * N, f.beat.pulse > 0.5 ? BRIGHT : LMID);
        r.line(q[3][0] * N, q[3][1] * N, q[2][0] * N, q[2][1] * N, DARK);
      }
      r.rect(0.46 * N, 0.19 * N, 0.08 * N, Math.max(1, 0.012 * N), f.beat.pulse > 0.5 ? HOT : COOL); // the visor slit
      targets.push({ x: 0.3 * N, y: 0.12 * N, w: 0.4 * N, h: 0.77 * N });
      return;
    }
    const buf = r.buf;
    for (let c = 0, NN = N * N; c < NN; c++) {
      const d = dens[c];
      if (!d) continue;
      const m = mark[c];
      buf[c] = m === 3 ? HOT : m === 2 ? COOL : m === 1 ? (d > 1 ? COOL : COOL + DIM) : d >= 4 ? BRIGHT : d >= 3 ? LMID : d >= 2 ? MID : MID + DIM;
    }
    targets.push({ x: 0.25 * N, y: 0.15 * N, w: 0.5 * N, h: 0.75 * N });
  },
};

// ---------------------------------------------------------------------------------------------- motorbike
// A motorbike crossing a desolate country from the side, the camera riding along: far ridges and nearer ones sliding
// by slower the farther they are, the ground under it the real one, the wheels rolling on it at the speed of travel
// and the rear one leaving a track wherever it touches. Each end of the frame sits on a spring over its wheel and a
// wheel hangs free when the ground drops away from it: a kick puts a stone under the front wheel, so the front bumps
// and then the rear, a wheelbase later; the cargo box strapped on the back jiggles on its own spring. Dust off the
// rear wheel, an exhaust puff on the beat, gravel on a snare, time-rain on a section greying the ground it falls on.
// A drop: it opens up for the ridge ahead and goes off its lip in a parabola; the landing presses the springs down hard.
const BIKE_W = { steppe: [3, 2, 1], badlands: [2, 3, 2], ashfield: [1, 2, 3] };
const BIKES = { steppe: { amp: 0.05, speed: 0.15 }, badlands: { amp: 0.09, speed: 0.18 }, ashfield: { amp: 0.07, speed: 0.22 } };
const motorbike = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, BIKE_W, bandOf(W.a)), seed: rnd() * 10, X: 0, v: 0.15 * N, rocks: [], ramp: null, boost: 0, susp: [{ y: 0, v: 0, on: true }, { y: 0, v: 0, on: true }], prevG: null,
      box: { dx: 0, dy: 0, vx: 0, vy: 0 }, pv: 0, rot: 0, track: [], gcol: new Float32Array(N), lastT: 0, dust: [], stones: [], puffs: [], rain: 0, grey: [], drops: Array.from({ length: 50 }, () => [rnd() * N, rnd() * N]), lamp: COOL, ash: [], cat: new Float32Array(26), N });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W;
    if (w.N !== N) motorbike.init(W);
    if (f.section === 'change') { w.kind = rollW(rnd, BIKE_W, bandOf(W.a)); w.rain = 8 * beatS(f); w.grey.push([w.X - 0.4 * N, w.X - 0.4 * N]); if (w.grey.length > 6) w.grey.shift(); }
    const K = BIKES[w.kind], g = GRAV * N, xb = 0.4 * N, Z = 1.3 * N, wb = 0.15 * Z, R = 0.03 * Z, l0 = 0.035 * Z, kS = 196, cS = 9.8, sx = (X) => xb + X - w.X; // Z: the size of the bike
    if (f.section === 'drop' && !w.ramp) { const X0 = w.X + (N - xb) + 0.03 * N; w.ramp = { X0, X1: X0 + 0.14 * N, h: 0.07 * N }; w.boost = 4; } // the ridge comes in from beyond the edge
    // the ground: rolling country, a kicker for the drop (a lip and a drop-off), the stones the kicks put down
    const base = (X) => (0.72 + K.amp * 1.6 * (rolling((X / N) * 0.9, w.seed) - 0.5)) * N;
    const gnd = (X) => {
      let y = base(X);
      const Rp = w.ramp;
      if (Rp && X >= Rp.X0 && X <= Rp.X1) { const q = (X - Rp.X0) / (Rp.X1 - Rp.X0); y -= Rp.h * q * q; }
      for (const k of w.rocks) { const d = (X - k.X) / k.w; if (d > -1 && d < 1) y -= k.h * (1 - d * d) ** 2; }
      return y;
    };
    for (const hh of hits) {
      if (isLow(hh) && w.rocks.length < 8) w.rocks.push({ X: w.X + wb / 2 + R + (0.01 + rnd() * 0.02) * N, h: (0.006 + 0.01 * hh.strength) * N, w: 0.012 * N });
      else if (hh.kind === 'snare') for (let k = 0; k < 6; k++) w.stones.push({ X: w.X - wb / 2, y: gnd(w.X - wb / 2) - u, vx: -(0.05 + rnd() * 0.2) * N, vy: -(0.15 + rnd() * 0.25) * N, life: 1.2 });
      else if (isTonal(hh)) w.lamp = hh.pc % 2 ? COOL : HOT;
    }
    // the ride: each end of the frame a mass on a spring over its wheel; a wheel off the ground hangs and the end falls free
    const S0 = w.susp[0], S1 = w.susp[1], onAny = S0.on || S1.on;
    w.boost = Math.max(0, w.boost - dt);
    if (onAny) w.v = follow(w.v, (K.speed + 0.1 * f.rel.bassDrive) * N * (w.boost > 0 ? 1.9 : 1), dt, 0.8);
    w.X += w.v * dt;
    w.rot += (w.v * dt) / R; // rolling without slipping (and spinning on in the air)
    const Xs = [w.X - wb / 2, w.X + wb / 2], gy = [gnd(Xs[0]) - R, gnd(Xs[1]) - R];
    if (!w.prevG) { w.prevG = gy.slice(); w.susp.forEach((S, e) => { S.y = gy[e] - l0 + g / kS; S.v = 0; }); }
    const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n, v0 = S0.v;
    w.susp.forEach((S, e) => {
      const wv = (gy[e] - w.prevG[e]) / dt, was = S.on;
      for (let k = 0; k < n; k++) {
        const yg = w.prevG[e] + wv * (k + 1) * h, l = yg - S.y;
        if (l > l0) S.v += g * h; // hanging clear
        else S.v += (g - kS * (l0 - l) - cS * clamp(S.v - wv, -0.6 * N, 0.6 * N)) * h;
        S.y += S.v * h;
        if (yg - S.y < 0.008 * Z) { S.y = yg - 0.008 * Z; S.v = Math.min(S.v, wv); } // bottomed out
      }
      S.on = gy[e] - S.y <= l0 + 0.5;
      if (S.on && !was && S.v - wv > 0.25 * N) { // touchdown
        s.shake = Math.max(s.shake, clamp((S.v - wv) / N) * 0.6);
        for (let k = 0; k < 8; k++) w.dust.push({ X: Xs[e] + (rnd() - 0.5) * 0.04 * N, y: gy[e] + R, vx: (rnd() - 0.5) * 0.3 * N, vy: -rnd() * 0.12 * N, r: u, life: 1 });
      }
    });
    w.prevG = gy;
    // the box on the rack: its own spring, shaken by how the rear of the frame and the bike speed up
    const B = w.box, ayA = (S0.v - v0) / dt, axA = (w.v - w.pv) / dt;
    w.pv = w.v;
    for (let k = 0; k < n; k++) { B.vx += (-150 * B.dx - 8 * B.vx - axA * 0.3) * h; B.vy += (-150 * B.dy - 8 * B.vy - clamp(ayA, -6 * g, 6 * g)) * h; B.dx += B.vx * h; B.dy += B.vy * h; }
    B.dx = clamp(B.dx, -0.01 * Z, 0.01 * Z); B.dy = clamp(B.dy, -0.012 * Z, 0.012 * Z);
    // the track: wherever the rear wheel touches, a mark in the ground
    if (S0.on && w.X - w.lastT > 1.5 * u) { w.lastT = w.X; w.track.push(Xs[0]); if (w.track.length > 300) w.track.shift(); }
    w.rocks = w.rocks.filter((k) => k.X > w.X - xb - 0.1 * N);
    if (w.ramp && w.ramp.X1 < w.X - xb - 0.1 * N) w.ramp = null;
    // the sky: a low sun ahead, so the shadows fall back; far ridges, nearer ones (mesas in the badlands)
    r.disc(0.84 * N, 0.3 * N, 0.05 * N, BRIGHT);
    ditherDisc(r, 0.84 * N, 0.3 * N, 0.09 * N, LMID, 0.3);
    for (let x = 0; x < N; x++) {
      const Xf = (w.X * 0.15 + x) / N, Xm = (w.X * 0.4 + x) / N;
      const yf = (0.5 + 0.1 * (rolling(Xf * 0.7 + 3, w.seed + 1) - 0.5)) * N;
      let ym = (0.58 + 0.12 * (rolling(Xm * 1.1 + 7, w.seed + 2) - 0.5)) * N;
      if (w.kind === 'badlands') ym = Math.min(ym + 0.02 * N, Math.max(ym, 0.55 * N)); // flat tops
      vcol(r, x, yf, N - yf, LMID + DIM); vcol(r, x, ym, N - ym, MID + DIM);
    }
    // the ground, its top greyed where the time-rain fell, the track, the stones
    const top = w.kind === 'ashfield' ? MID : w.kind === 'badlands' ? LMID : COOL + DIM, gcol = w.gcol, gAt = (X) => gcol[clamp(Math.round(sx(X)), 0, N - 1)]; // the ground, column by column, for this frame
    for (let x = 0; x < N; x++) {
      const X = w.X + x - xb, y = (gcol[x] = gnd(X));
      let grey = false;
      for (const G of w.grey) if (X >= G[0] && X <= G[1]) grey = true;
      vcol(r, x, y, N - y, DARK);
      vcol(r, x, y, Math.max(1, 1.5 * u), grey ? MID + DIM : top);
      if (hash(Math.floor(X / (2 * u)), 5) < 0.08) r.set(x, y + 3 * u + hash(Math.floor(X), 6) * 0.1 * N, DARK + DIM);
    }
    for (const X of w.track) { const x = sx(X); if (x >= 0 && x < N) r.set(x, gcol[x | 0] + 0.5, BLACK); }
    for (const k of w.rocks) r.disc(sx(k.X), gAt(k.X) + k.h * 0.3, Math.max(1, k.w * 0.6), MID);
    // the props of the country: poles and their sagging wires, boulders, dead trees; fixed to the ground
    const P0 = Math.floor((w.X - xb) / (0.5 * N)) - 1;
    for (let k = P0; k < P0 + 4; k++) {
      const X = (k + hash(k, 3) * 0.6) * 0.5 * N, x = sx(X), y = gnd(X);
      if (w.kind === 'steppe') {
        const X2 = (k + 1 + hash(k + 1, 3) * 0.6) * 0.5 * N, ht = 0.22 * N;
        r.rect(x - 0.5 * u, y - ht, Math.max(1, 1.2 * u), ht, DARK); r.rect(x - 3 * u, y - ht + 2 * u, 6 * u, Math.max(1, u), DARK);
        catenary(x, y - ht + 2 * u, sx(X2), gnd(X2) - ht + 2 * u, (X2 - X) * 1.02, 0, 12, w.cat);
        for (let q = 0; q < 12; q++) r.line(w.cat[2 * q], w.cat[2 * q + 1], w.cat[2 * q + 2], w.cat[2 * q + 3], DARK + DIM);
      } else if (w.kind === 'badlands') r.disc(x, y + 0.01 * N, (0.02 + 0.03 * hash(k, 4)) * N, MID + DIM);
      else { const ht = (0.1 + 0.08 * hash(k, 4)) * N; r.stroke(x, y, x + 2 * u, y - ht, Math.max(1, 1.6 * u), DARK); r.line(x + u, y - ht * 0.6, x + 6 * u, y - ht * 0.85, DARK); r.line(x + 1.5 * u, y - ht * 0.8, x - 3 * u, y - ht, DARK); }
    }
    // the frame from the two spring ends; the shadow on the ground (the sun ahead throws it back); dust, puffs
    const xr = sx(Xs[0]), xf = sx(Xs[1]), yr = S0.y, yf = S1.y, L = Math.hypot(xf - xr, yf - yr), ax = (xf - xr) / L, ay = (yf - yr) / L, ux = ay, uy = -ax;
    const C = (a, b) => [xr + ax * a + ux * b, yr + ay * a + uy * b]; // along the frame from the rear end, and up from it
    const hgt = Math.max(0, (gy[0] + gy[1]) / 2 + R - (yr + yf) / 2 - l0 - R);
    r.rect(xr - 0.02 * N - hgt * 0.5, gAt(w.X) - u, wb + 0.04 * N - hgt * 0.2, Math.max(1, u), BLACK);
    if (S0.on && rnd() < dt * (8 + 30 * f.rel.bassDrive)) w.dust.push({ X: Xs[0] - R, y: gy[0] + R, vx: -0.05 * N * rnd(), vy: -0.06 * N * rnd(), r: u, life: 1.2 });
    if (f.beat.on) { const [ex, ey] = C(-0.012 * Z, -0.012 * Z); w.puffs.push({ X: w.X + ex - xb, y: ey, r: u, vy: -0.04 * N, life: 1 }); }
    if (w.dust.length > 60) w.dust.splice(0, w.dust.length - 60);
    w.dust = w.dust.filter((p) => { p.vx *= Math.exp(-dt * 3); p.vy = follow(p.vy, 0.01 * N, dt, 0.8); p.X += p.vx * dt; p.y += p.vy * dt; p.r += dt * 2 * u; ditherDisc(r, sx(p.X), p.y, p.r, LMID + DIM, clamp(p.life * 0.5)); return (p.life -= dt) > 0; });
    w.puffs = w.puffs.filter((p) => { p.vy = follow(p.vy, -0.01 * N, dt, 0.6); p.y += p.vy * dt; p.r += dt * 2.5 * u; ditherDisc(r, sx(p.X), p.y, p.r, MID + DIM, clamp(p.life * 0.7)); return (p.life -= dt) > 0; });
    // the wheels: tyre, rim, three spokes turned by the distance rolled
    const wheel = (cx, cy) => {
      r.ring(cx, cy, R - 0.6 * u, Math.max(1, 1.6 * u), DARK); r.ring(cx, cy, R * 0.6, Math.max(1, 0.6 * u), MID);
      for (let k = 0; k < 3; k++) { const a = w.rot + (k * Math.PI) / 3; r.line(cx - Math.cos(a) * R * 0.6, cy - Math.sin(a) * R * 0.6, cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6, MID); }
      r.disc(cx, cy, Math.max(1, 0.8 * u), LMID);
    };
    const hr = [xr, Math.min(gy[0], S0.y + l0)], hf = [xf, Math.min(gy[1], S1.y + l0)];
    wheel(hr[0], hr[1]); wheel(hf[0], hf[1]);
    // the swingarm and its shock (a coil that shortens as it takes the load), the fork (its legs slide), the frame
    const piv = C(0.04 * Z, -0.012 * Z), shk = C(0.015 * Z, 0.008 * Z), arm = [lerp(piv[0], hr[0], 0.55), lerp(piv[1], hr[1], 0.55)];
    r.stroke(piv[0], piv[1], hr[0], hr[1], Math.max(1, 1.6 * u), MID);
    for (let k = 0; k < 5; k++) { const q0 = k / 5, q1 = (k + 1) / 5, o = (k % 2 ? 1 : -1) * 0.8 * u; r.line(lerp(shk[0], arm[0], q0) + o, lerp(shk[1], arm[1], q0), lerp(shk[0], arm[0], q1) - o, lerp(shk[1], arm[1], q1), LMID); }
    const head = C(wb - 0.008 * Z, 0.022 * Z);
    r.stroke(head[0], head[1], hf[0], hf[1], Math.max(1, 1.4 * u), LMID); r.stroke(head[0] + 1.5 * u, head[1], hf[0] + 1.5 * u, hf[1], Math.max(1, 0.8 * u), MID);
    const poly = (pts, c) => r.poly(pts.map(([a, b]) => C(a * Z, b * Z)), c);
    poly([[0.035, -0.022], [0.095, -0.022], [0.1, 0.004], [0.03, 0.004]], DARK + DIM); // the engine
    poly([[0.075, 0.004], [0.125, 0.004], [0.12, 0.026], [0.085, 0.03]], MID); // the tank
    poly([[0.005, 0.008], [0.08, 0.008], [0.078, 0.017], [0.01, 0.016]], DARK); // the seat
    const [e0x, e0y] = C(0.05 * Z, -0.02 * Z), [e1x, e1y] = C(-0.012 * Z, -0.012 * Z);
    r.stroke(e0x, e0y, e1x, e1y, Math.max(1, 1.4 * u), MID); // the exhaust
    const [lx, ly] = C(wb + 0.004 * Z, 0.022 * Z);
    r.disc(lx, ly, Math.max(1, 1.4 * u), BRIGHT); r.set(lx + 2 * u, ly, w.lamp);
    // the rider, leaning into the speed; the box on the rack, strapped down, jiggling
    const lean = 0.35 + clamp(w.v / N, 0, 0.5) * 0.8, hip = C(0.05 * Z, 0.022 * Z), shd = [hip[0] + (ax * Math.sin(lean) + ux * Math.cos(lean)) * 0.05 * Z, hip[1] + (ay * Math.sin(lean) + uy * Math.cos(lean)) * 0.05 * Z];
    const hd = [shd[0] + ux * 0.016 * Z + ax * 0.008 * Z, shd[1] + uy * 0.016 * Z + ay * 0.008 * Z], bar = C(wb - 0.014 * Z, 0.04 * Z), kn = C(0.09 * Z, 0.024 * Z), ft = C(0.065 * Z, -0.016 * Z);
    r.stroke(hip[0], hip[1], kn[0], kn[1], Math.max(1, 1.8 * u), FIG); r.stroke(kn[0], kn[1], ft[0], ft[1], Math.max(1, 1.6 * u), FIG);
    r.stroke(hip[0], hip[1], shd[0], shd[1], Math.max(2, 2.8 * u), FIG); r.stroke(shd[0], shd[1], bar[0], bar[1], Math.max(1, 1.3 * u), FIG);
    r.disc(hd[0], hd[1], Math.max(1, 0.013 * Z), FIG); r.rect(hd[0] - 0.004 * Z, hd[1] - 0.004 * Z, 0.012 * Z, Math.max(1, 0.5 * u), MID); // the helmet's visor line
    const bc = C(-0.004 * Z + B.dx, 0.034 * Z - B.dy), bw = 0.026 * Z, bh = 0.021 * Z;
    r.poly([[bc[0] - ax * bw - ux * bh, bc[1] - ay * bw - uy * bh], [bc[0] + ax * bw - ux * bh, bc[1] + ay * bw - uy * bh], [bc[0] + ax * bw + ux * bh, bc[1] + ay * bw + uy * bh], [bc[0] - ax * bw + ux * bh, bc[1] - ay * bw + uy * bh]], LMID);
    const rk0 = C(-0.012 * Z, 0.012 * Z), rk1 = C(0.012 * Z, 0.012 * Z);
    r.line(bc[0] - ax * bw * 0.5 + ux * bh, bc[1] - ay * bw * 0.5 + uy * bh, rk0[0], rk0[1], DARK); r.line(bc[0] + ax * bw * 0.5 + ux * bh, bc[1] + ay * bw * 0.5 + uy * bh, rk1[0], rk1[1], DARK);
    r.line(bc[0] - ax * bw * 0.9, bc[1] - ay * bw * 0.9, bc[0] + ax * bw * 0.9, bc[1] + ay * bw * 0.9, DARK);
    targets.push({ x: xr - R, y: hd[1] - 0.02 * N, w: wb + 2 * R, h: Math.max(hr[1], hf[1]) + R - hd[1] + 0.02 * N });
    // gravel off the rear tyre: thrown back, falling, bouncing on the ground
    w.stones = w.stones.filter((p) => {
      p.vy += g * dt; p.X += p.vx * dt; p.y += p.vy * dt;
      const yg = gnd(p.X); if (p.y > yg) { p.y = yg; if (p.vy > 0.05 * N) { p.vy *= -0.3; p.vx *= 0.6; } else { p.vy = 0; p.vx *= Math.exp(-dt * 15); } } // a bounce, or sliding to a stop
      r.rect(sx(p.X), p.y - u, Math.max(1, u), Math.max(1, u), LMID);
      return (p.life -= dt) > 0;
    });
    // time-rain: it falls straight in the world, so riding through it the streaks lean back; it greys what it touches
    if (w.rain > 0) {
      w.rain -= dt;
      const G = w.grey[w.grey.length - 1];
      if (G) G[1] = Math.max(G[1], w.X + N - xb);
      const vr = 1.2 * N, lx2 = (-w.v / vr) * 4 * u;
      for (const d of w.drops) {
        d[1] += vr * dt; d[0] -= w.v * dt;
        if (d[1] > N || d[0] < 0) { d[1] = -rnd() * 0.3 * N; d[0] = rnd() * N * 1.2; }
        r.line(d[0], d[1], d[0] - lx2, d[1] - 4 * u, LMID + DIM);
      }
    }
    if (w.kind === 'ashfield') snowfall(W, w.ash, Math.round(30 * (N / 125)), 0.05, MID + DIM);
  },
};

// ---------------------------------------------------------------------------------------------- elevator
// A long ride down an industrial shaft in an open cage, the camera riding with it: the shaft goes up past it, a floor
// beam crossing the cage floor on the beat (a floor a beat, or one every other beat in the deeper kinds), each
// landing's lamp sweeping its light up the cage as it goes by, catching the edges of the still figure inside, who
// listens while a small comms frame talks (the waveform when the frame has one, else the mid band). The hoist cables
// hum with the bass (a standing wave between the crosshead and the top), the treble strikes sparks off the guide
// shoes, a kick jolts the cage on its cables; the counterweights' cables run up the side twice as fast as the shaft
// and on a section change a counterweight passes, its chain below it. A drop: it brakes and bounces on its cables,
// the lights die, then the emergency red comes on and it sets off again.
const SHAFT_W = { mine: [3, 2, 1], tower: [2, 3, 2], foundry: [1, 2, 3] };
const SHAFTS = { mine: { fpb: 0.5 }, tower: { fpb: 1 }, foundry: { fpb: 0.5 } };
// under the emergency light: what was light goes red, what was dark goes black, the figure a silhouette
const REDMAP = Uint8Array.from({ length: 18 }, (_, v) => ([LMID, BRIGHT, WHITE, COOL, HOT].includes(v) ? HOT : [MID, LMID + DIM, BRIGHT + DIM, COOL + DIM, HOT + DIM].includes(v) ? HOT + DIM : v === FIG ? DARK : BLACK));
const elevator = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kinds: [{ i0: -1e9, kind: rollW(rnd, SHAFT_W, bandOf(W.a)) }], y: 0, v: 0, jy: 0, jv: 0, stop: null, sparks: [], cw: [{ st: 0, y: 0 }, { st: 0, y: 0 }], stat: 0, chan: 0.3, N });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W;
    if (w.N !== N) elevator.init(W);
    const bs = beatS(f), S = 0.5 * N, yF = 0.8 * N, kindOf = (i) => { let k = w.kinds[0].kind; for (const e of w.kinds) if (e.i0 <= i) k = e.kind; return k; };
    if (f.section === 'change') { // the shaft changes from the floors not yet in sight; a counterweight comes up past
      w.kinds.push({ i0: Math.floor((w.y - yF + N) / S) + 1, kind: rollW(rnd, SHAFT_W, bandOf(W.a)) }); if (w.kinds.length > 3) w.kinds.shift();
      const c = w.cw.find((q) => q.st === 0) || w.cw.find((q) => q.st === 2); // (the next car's, once both have gone by)
      if (c) { c.st = 1; c.y = N + 0.05 * N; }
    }
    if (f.section === 'drop' && !w.stop) { w.stop = { t: 0 }; w.jv += 0.5 * N; s.shake = Math.max(s.shake, 0.35); } // the brakes bite
    for (const hh of hits) {
      if (isLow(hh)) w.jv += 0.12 * N * hh.strength;
      else if (hh.kind === 'snare') w.stat = Math.max(w.stat, hh.strength);
      else if (isTonal(hh)) w.chan = hh.pc / 11;
    }
    // the ride: a floor a beat (phase-locked to the beat while there is one); braking, the dark and the red for a drop
    const fpb = SHAFTS[kindOf(Math.floor((w.y - yF) / S) + 1)].fpb;
    let want = (S * fpb) / bs, mode = 0;
    if (w.stop) {
      const st = w.stop, t1 = 0.3, t2 = t1 + 2 * bs, t3 = t2 + 4 * bs, t4 = t3 + 3 * bs;
      st.t += dt;
      if (st.t < t3) want = 0;
      mode = st.t < t1 ? 0 : st.t < t2 ? 1 : 2;
      if (st.t >= t4) w.stop = null;
    }
    w.v = follow(w.v, want, dt, w.stop && w.stop.t < 0.3 ? 0.07 : 0.6);
    w.y += w.v * dt;
    if (beatLocked(f) && !w.stop) { const ph = ((f.beat.count + f.beat.phase) * fpb) % 1, e = ((((ph - (w.y / S) % 1) % 1) + 1.5) % 1) - 0.5; w.y += e * S * (1 - Math.exp(-dt / 0.4)); }
    const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
    for (let k = 0; k < n; k++) { w.jv += (-81 * w.jy - 2.7 * w.jv) * h; w.jy += w.jv * h; } // the cage bouncing on its cables
    const jy = clamp(w.jy, -0.05 * N, 0.05 * N);
    // the shaft: side walls and the back wall, their joints fixed to the shaft so they go up past
    const i0 = Math.ceil((w.y - yF - 0.6 * N) / S), i1 = Math.floor((w.y - yF + 1.5 * N) / S), wyOf = (y) => y + w.y - yF;
    for (let y = 0; y < N; y++) {
      const wy = Math.floor(wyOf(y)), kind = kindOf(Math.floor(wy / S) + 1), wall = kind === 'mine' ? DARK : kind === 'tower' ? MID + DIM : DARK + DIM;
      r.rect(0, y, 0.12 * N, 1, wall); r.rect(0.88 * N, y, 0.12 * N, 1, wall);
      if (hash(wy >> 1, 3) < 0.1) { r.set(hash(wy, 4) * 0.12 * N, y, kind === 'mine' ? MID + DIM : DARK); r.set(0.88 * N + hash(wy, 5) * 0.12 * N, y, kind === 'mine' ? MID + DIM : DARK); }
      if ((wy % Math.round(S / 4)) === 0) r.rect(0.12 * N, y, 0.76 * N, 1, DARK + DIM);
    }
    for (let x = Math.round(0.12 * N); x < 0.88 * N; x += Math.round(0.12 * N)) r.rect(x, 0, Math.max(1, 0.5 * u), N, DARK + DIM);
    // the floors: a landing on the back wall (a gate, a lamp over it, its light on the wall), and the beam under it
    const lamps = [];
    for (let i = i0; i <= i1; i++) {
      const sy = i * S - w.y + yF, kind = kindOf(i);
      r.rect(0.34 * N, sy - 0.3 * N, 0.32 * N, 0.3 * N, kind === 'foundry' ? DARK : BLACK);
      if (kind === 'foundry') ditherRect(r, 0.35 * N, sy - 0.2 * N, 0.3 * N, 0.2 * N, HOT + DIM, 0.35 + 0.3 * f.level);
      for (let x = 0.36 * N; x < 0.65 * N; x += 0.03 * N) r.rect(x, sy - 0.29 * N, Math.max(1, 0.6 * u), 0.29 * N, kind === 'mine' ? DARK + DIM : MID + DIM);
      r.frame(Math.round(0.34 * N), Math.round(sy - 0.3 * N), Math.round(0.32 * N), Math.round(0.3 * N), kind === 'mine' ? MID : LMID + DIM);
      const ly = sy - 0.34 * N, lc = kind === 'tower' ? COOL : kind === 'mine' ? HOT : BRIGHT;
      ditherDisc(r, 0.5 * N, ly, (0.06 + 0.03 * f.level) * N, LMID + DIM, 0.35); r.rect(0.48 * N, ly - u, 0.04 * N, 2 * u, lc);
      lamps.push(ly);
      if (kind === 'mine') { r.rect(0.12 * N, sy, 0.76 * N, 0.03 * N, MID); r.rect(0.12 * N, sy + 0.012 * N, 0.76 * N, Math.max(1, 0.5 * u), DARK); }
      else { r.rect(0.12 * N, sy, 0.76 * N, 0.025 * N, DARK); r.rect(0.12 * N, sy, 0.76 * N, Math.max(1, u), LMID); r.rect(0.12 * N, sy + 0.025 * N - u, 0.76 * N, Math.max(1, u), MID); }
    }
    // the guide rails and their brackets; the counterweights' lanes: cables above a block, its chain below
    for (const gx of [0.245, 0.755]) {
      r.rect(gx * N - 0.5 * u, 0, Math.max(1, u), N, LMID);
      for (let wy = Math.ceil(wyOf(0) / (S / 2)) * (S / 2); wy < wyOf(N); wy += S / 2) r.rect(gx * N - 2 * u, wy - w.y + yF, 4 * u, 1.5 * u, MID);
    }
    w.cw.forEach((c, k) => {
      const cx = (0.8 + 0.05 * k) * N, mk = (yy, L = 0.1 * N, on = 1.5 * u) => (((yy + 2 * w.y) % L) + L) % L < on; // marks fixed to what moves at twice the shaft's speed
      if (c.st === 1) { c.y -= 2 * w.v * dt; if (c.y < -0.3 * N) c.st = 2; }
      const top = c.st === 0 ? N : c.st === 1 ? c.y : -1; // where the cables end and the chain begins
      for (let y = 0; y < N; y++) {
        if (y < top) { r.set(cx - u, y, MID); r.set(cx + u, y, MID); if (mk(y)) { r.set(cx - u, y, LMID); r.set(cx + u, y, LMID); } }
        else if (y > top + 0.25 * N && mk(y, (0.1 * N) / 1.7, (1.5 * u) / 1.7)) r.set(cx, y, DARK); // the chain, its links going up with the weight
      }
      if (c.st === 1) { r.rect(cx - 0.022 * N, c.y, 0.044 * N, 0.25 * N, DARK); r.frame(Math.round(cx - 0.022 * N), Math.round(c.y), Math.round(0.044 * N), Math.round(0.25 * N), MID); for (let q = 1; q < 5; q++) r.rect(cx - 0.022 * N, c.y + q * 0.05 * N, 0.044 * N, Math.max(1, 0.5 * u), MID + DIM); }
    });
    // the cage: hoist cables humming (a standing wave), the crosshead, posts, the mesh at the back, the floor plate
    const ct = 0.22 * N + jy, cb = yF + jy, amp = (0.3 + 2.2 * f.rel.bassDrive) * u * Math.sin(t * 31);
    for (const cx of [0.48, 0.5, 0.52]) for (let k = 0; k < 8; k++) { const y0 = (ct * k) / 8, y1 = (ct * (k + 1)) / 8; r.line(cx * N + amp * Math.sin((Math.PI * y0) / ct), y0, cx * N + amp * Math.sin((Math.PI * y1) / ct), y1, LMID); }
    for (let x = Math.round(0.28 * N); x < 0.72 * N; x += Math.max(2, Math.round(3 * u))) vcol(r, x, ct + 0.025 * N, cb - ct - 0.025 * N, DARK + DIM);
    r.rect(0.27 * N, (ct + cb) / 2, 0.46 * N, Math.max(1, u), DARK + DIM);
    // the figure, still; his pack behind his shoulders; lit at the edges as a landing's lamp goes by
    const fx = 0.48 * N, fb = cb, fh = 0.34 * N;
    r.rect(fx - 0.07 * N, fb - fh * 0.9, 0.14 * N, 0.13 * N, MID); r.frame(Math.round(fx - 0.07 * N), Math.round(fb - fh * 0.9), Math.round(0.14 * N), Math.round(0.13 * N), DARK);
    r.rect(fx - 0.045 * N, fb - fh * 0.45, 0.035 * N, fh * 0.45, FIG); r.rect(fx + 0.01 * N, fb - fh * 0.45, 0.035 * N, fh * 0.45, FIG);
    r.poly([[fx - 0.055 * N, fb - fh * 0.86], [fx + 0.055 * N, fb - fh * 0.86], [fx + 0.065 * N, fb - fh * 0.4], [fx - 0.065 * N, fb - fh * 0.4]], FIG);
    r.rect(fx - 0.08 * N, fb - fh * 0.84, 0.022 * N, fh * 0.4, FIG); r.rect(fx + 0.058 * N, fb - fh * 0.84, 0.022 * N, fh * 0.4, FIG);
    const cwNear = w.cw.some((c) => c.st === 1 && c.y > 0.1 * N && c.y < 0.8 * N), hx = fx + (cwNear ? 0.006 * N : 0);
    r.disc(hx, fb - fh * 0.93, 0.03 * N, FIG); r.rect(hx - 0.032 * N, fb - fh * 0.99, 0.064 * N, 0.022 * N, FIG); // the head and the hood
    const fy0 = Math.max(0, Math.round(fb - fh)), fx0 = Math.round(fx - 0.09 * N), fx1 = Math.round(fx + 0.09 * N);
    for (const ly of lamps) for (let y = Math.max(fy0, Math.round(ly - 0.07 * N)); y < Math.min(fb, ly + 0.07 * N, N); y++) {
      let a = -1, b = -1;
      for (let x = fx0; x < fx1; x++) if (r.buf[y * N + x] === FIG) { if (a < 0) a = x; b = x; }
      if (a >= 0) { r.buf[y * N + a] = LMID; r.buf[y * N + b] = LMID; }
    }
    targets.push({ x: fx - 0.08 * N, y: fb - fh, w: 0.16 * N, h: fh });
    r.rect(0.25 * N, ct, 0.5 * N, 0.025 * N, DARK); r.rect(0.25 * N, ct, 0.5 * N, Math.max(1, u), LMID); r.disc(0.5 * N, ct - 0.008 * N, 0.012 * N, MID);
    r.rect(0.258 * N, ct, 0.014 * N, cb - ct, MID); r.rect(0.728 * N, ct, 0.014 * N, cb - ct, MID);
    r.rect(0.25 * N, cb, 0.5 * N, 0.03 * N, MID); r.rect(0.25 * N, cb, 0.5 * N, Math.max(1, u), LMID); r.rect(0.25 * N, cb + 0.03 * N, 0.5 * N, Math.max(1, u), DARK);
    for (let k = 0; k < 6; k++) { const yy = ct + 0.04 * N + k * 0.09 * N; r.line(0.69 * N, yy, 0.725 * N, yy + 0.045 * N, LMID + DIM); r.line(0.725 * N, yy, 0.69 * N, yy + 0.045 * N, LMID + DIM); } // the folded gate
    // sparks off the guide shoes with the treble, while it moves; they fall as they would anywhere in the cage
    for (const [gx, gy] of [[0.245, ct + 0.01 * N], [0.755, ct + 0.01 * N], [0.245, cb - 0.01 * N], [0.755, cb - 0.01 * N]]) {
      r.rect(gx * N - 1.5 * u, gy - 1.5 * u, 3 * u, 3 * u, DARK);
      if (rnd() < dt * 30 * f.rel.trebDrive * clamp(w.v / S)) for (let k = 0; k < 3; k++) w.sparks.push({ x: gx * N, y: gy, vx: (gx < 0.5 ? -1 : 1) * (0.05 + rnd() * 0.1) * N, vy: -rnd() * 0.12 * N, life: 0.5 });
    }
    w.sparks = w.sparks.filter((p) => { p.vy += GRAV * N * dt; p.x += p.vx * dt; p.y += p.vy * dt; r.set(p.x, p.y, p.life > 0.3 ? BRIGHT : HOT); return (p.life -= dt) > 0; });
    // the drop's lights: dead, then the emergency red with a beacon turning on the crosshead
    if (mode === 1) for (let i = 0; i < r.buf.length; i++) r.buf[i] = DARKMAP[r.buf[i]];
    else if (mode === 2) {
      for (let i = 0; i < r.buf.length; i++) r.buf[i] = REDMAP[r.buf[i]];
      const a = t * 5, bx = 0.5 * N, by = ct - 0.02 * N;
      r.poly([[bx, by], [bx + Math.cos(a - 0.2) * 0.5 * N, by + Math.sin(a - 0.2) * 0.3 * N], [bx + Math.cos(a + 0.2) * 0.5 * N, by + Math.sin(a + 0.2) * 0.3 * N]], HOT + DIM);
      r.disc(bx, by, Math.max(1, 0.014 * N), HOT);
    }
    // the comms frame: a faceless bust, the voice as a waveform (silent: a flat line), a channel needle, static on a snare
    const qx = 0.04 * N, qy = 0.04 * N, qw = 0.32 * N, qh = 0.12 * N, mid = qy + qh / 2, wv = f.wave, has = wv && wv.length;
    r.rect(qx, qy, qw, qh, BLACK); r.frame(Math.round(qx), Math.round(qy), Math.round(qw), Math.round(qh), LMID);
    r.disc(qx + 0.045 * N, qy + 0.05 * N, 0.018 * N, MID); r.rect(qx + 0.02 * N, qy + 0.075 * N, 0.05 * N, 0.04 * N, MID);
    let loud = 0;
    for (let x = Math.round(qx + 0.09 * N); x < qx + qw - 2 * u; x++) {
      const q = Math.max(0, (x - qx - 0.09 * N) / (qw - 0.09 * N)), v = has ? wv[Math.min(wv.length - 1, (q * wv.length) | 0)] * 3 : Math.sin(q * TAU * 5 + f.rel.midClock * 6) * f.mid * 0.8, yy = clamp(v, -1, 1) * qh * 0.38; // (the first column rounds to just left of the trace's start)
      loud = Math.max(loud, Math.abs(v));
      r.rect(x, mid + Math.min(0, yy), 1, Math.max(1, Math.abs(yy)), COOL);
    }
    r.rect(qx + 0.09 * N + w.chan * (qw - 0.12 * N), qy + qh - 2.5 * u, Math.max(1, u), 2 * u, BRIGHT);
    r.rect(qx + qw - 4 * u, qy + 2 * u, 2 * u, 2 * u, loud > 0.05 ? HOT : DARK);
    if ((w.stat *= Math.exp(-dt * 5)) > 0.08) for (let k = 0; k < w.stat * 60; k++) r.set(qx + rnd() * qw, qy + rnd() * qh, rnd() < 0.5 ? LMID : DARK);
    targets.push({ x: qx, y: qy, w: qw, h: qh });
  },
};

// ---------------------------------------------------------------------------------------------- handprints
// A black tar beach in perspective (one horizon; whatever lies on the beach foreshortened: as wide as 1/z, as deep
// as 1/z^2). Handprints come one a beat in a trail toward the water, left hand, right hand, as if something crawled
// down into the sea; tar bubbles swell up out of the beach and the shallows at the slow constant speed a bubble has in
// a thick fluid (the bigger, the faster) and pop, a ring and droplets falling back; whale-like shapes drift over the
// sky, the far ones smaller and slower. A lone figure stands on the trail, going on toward the water with the mids
// and stepping back on every snare. A drop: a tar flood runs up the beach, slowing like the swash of a wave, over
// the prints and around his feet, and runs back, leaving the beach wiped.
const SHORE_W = { shore: [3, 2, 1], wreck: [2, 3, 2], storm: [1, 2, 3] };
const TB = { yh: 0.4, fz: 0.9, camH: 1.6 }; // the beach's camera: horizon and focal length (of N), height (m)
const pjT = (N, X, Y, Z, o) => { const k = (TB.fz * N) / Math.max(0.3, Z); o[0] = N / 2 + X * k; o[1] = TB.yh * N + (TB.camH - Y) * k; o[2] = k; return o; };
// a filled ellipse lying on the ground: rx across, ry deep (already foreshortened), cells
function groundEllipse(r, cx, cy, rx, ry, c) {
  const N = r.N;
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(N - 1, cy + ry); y++) {
    const q = (y + 0.5 - cy) / Math.max(0.5, ry), hw = rx * Math.sqrt(Math.max(0, 1 - q * q));
    if (hw >= 0.3) r.rect(cx - hw, y, Math.max(1, 2 * hw), 1, c);
  }
}
const handprints = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, SHORE_W, bandOf(W.a)), prints: [], k: 0, X0: 0, ph: rnd() * TAU, bubbles: [], rings: [], drops: [], flood: null, Zf: 8, back: null, wph: 0, song: 0, N,
      whales: [0, 1, 2].map((i) => ({ x: rnd(), y: 0.13 + i * 0.075 + rnd() * 0.03, d: 1 + i * 0.7, ph: rnd() * TAU, dir: rnd() < 0.5 ? 1 : -1 })), rain: Array.from({ length: 60 }, () => [rnd() * N, rnd() * N]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W;
    if (w.N !== N) handprints.init(W);
    if (f.section === 'change') w.kind = rollW(rnd, SHORE_W, bandOf(W.a));
    const bs = beatS(f), yh = TB.yh * N, Zw0 = 24, storm = w.kind === 'storm';
    if (f.section === 'drop' && !w.flood) { w.flood = { t: 0, reach: Zw0 }; s.shake = Math.max(s.shake, 0.3); }
    // where the water stops: a swash breathing with the level, or the flood's run-up (out fast, slowing, back)
    let Zw = Zw0 - 1.2 * (0.5 + 0.5 * Math.sin(t * 0.8)) * (0.4 + f.level);
    if (w.flood) {
      const F = w.flood, v0 = 16, a = 7, d = Math.max(0, v0 * F.t - 0.5 * a * F.t * F.t);
      F.t += dt;
      Zw = Math.min(Zw, Zw0 - d); F.reach = Math.min(F.reach, Zw);
      if (F.t > (2 * v0) / a) { w.prints = w.prints.filter((p) => p.Z < F.reach - 0.3); w.flood = null; w.k = 0; } // what it ran over is gone
    }
    const trailX = (Z) => w.X0 + 0.8 * Math.sin((Z - 3.2) * 0.6 + w.ph);
    for (const hh of hits) {
      if (isLow(hh) && w.bubbles.length < 24) w.bubbles.push({ X: (rnd() - 0.5) * 8, Z: Zw - 2 + rnd() * 5, R: 0.3 + 0.2 * hh.strength, h: 0 });
      else if (hh.kind === 'snare' && !w.back) w.back = { from: w.Zf, to: Math.max(5, w.Zf - 0.35), p: 0 };
      else if (isTonal(hh)) w.song = 1;
    }
    // a print a beat, a step on toward the water; at the water the trail starts again near the eye
    if (f.beat.on && !w.flood) {
      const Z = 3.2 + w.k * 0.55;
      if (Z > Zw - 0.8) { w.k = 0; w.X0 = (rnd() - 0.5) * 3; w.ph = rnd() * TAU; }
      else { const side = w.k % 2 ? 1 : -1; w.prints.push({ X: trailX(Z) + side * 0.2, Z, side, age: 0 }); w.k++; if (w.prints.length > 48) w.prints.shift(); }
    }
    if ((w.bubbles.length < 24 && rnd() < dt * (0.6 + 2.5 * f.rel.bassDrive) * (storm ? 2 : 1))) { const Z = 4 + rnd() * (Zw + 4); w.bubbles.push({ X: (rnd() - 0.5) * Z * 0.9, Z, R: 0.08 + rnd() * 0.25, h: 0 }); }
    // the sky: heavy and low; the whales drifting over, the far ones small and slow, their tails beating
    for (let y = 0; y < yh; y++) { const d = 0.35 * Math.max(0, Math.sin((y / N) * 47 + 1.3)) * (y / yh), row = y * N; if (d > 0.02) for (let x = 0; x < N; x++) if (bayer(x + Math.round(t * 2), y) < d) r.buf[row + x] = DARK + DIM; } // streaks of low cloud
    w.song = Math.max(0, w.song - dt);
    for (const Wh of w.whales) {
      Wh.x += (Wh.dir * dt * (0.006 + 0.02 * f.rel.midDrive)) / Wh.d; Wh.ph += dt * (1.2 / Wh.d);
      if (Wh.x > 1.35) Wh.x = -0.35; else if (Wh.x < -0.35) Wh.x = 1.35;
      const L = (0.42 * N) / Wh.d, cx = Wh.x * N, cy = (Wh.y + 0.01 * Math.sin(Wh.ph * 0.5)) * N, d = Wh.dir, c = Wh.d > 1.5 ? MID + DIM : DARK + DIM, fl = Math.sin(Wh.ph) * 0.12 * L;
      r.poly([[cx + d * 0.5 * L, cy - 0.01 * L], [cx + d * 0.47 * L, cy - 0.09 * L], [cx + d * 0.36 * L, cy - 0.13 * L], [cx, cy - 0.14 * L], [cx - d * 0.35 * L, cy - 0.06 * L], [cx - d * 0.55 * L, cy + fl * 0.4],
        [cx - d * 0.35 * L, cy + 0.07 * L], [cx, cy + 0.12 * L], [cx + d * 0.42 * L, cy + 0.08 * L], [cx + d * 0.49 * L, cy + 0.04 * L]], c); // a blunt head, the body tapering to the tail stock
      for (let g = 1; g < 4; g++) r.line(cx + d * (0.42 - g * 0.06) * L, cy + (0.06 + g * 0.01) * L, cx + d * (0.2 - g * 0.04) * L, cy + (0.08 + g * 0.01) * L, BG); // the throat grooves
      r.poly([[cx - d * 0.53 * L, cy + fl * 0.4], [cx - d * 0.7 * L, cy + fl - 0.09 * L], [cx - d * 0.62 * L, cy + fl], [cx - d * 0.7 * L, cy + fl + 0.09 * L]], c); // the flukes
      r.poly([[cx + d * 0.12 * L, cy + 0.08 * L], [cx - d * 0.05 * L, cy + 0.2 * L + fl * 0.3], [cx - d * 0.02 * L, cy + 0.08 * L]], c); // a fin
      r.set(cx + d * 0.36 * L, cy - 0.02 * L, w.song > 0 ? COOL : DARK);
    }
    // the sea up to where the water stops: tar, its swells shining where they catch the sky; then the beach
    const k0 = TB.camH * TB.fz * N, yw = yh + k0 / Zw;
    w.swell = ((w.swell || 0) + dt * 0.25 * (1 + f.level)) % 1; // the swells' phase (summed, so the level only changes their pace)
    for (let y = Math.ceil(yh); y < N; y++) {
      const Z = k0 / (y + 0.5 - yh), row = y * N;
      if (y < yw) {
        const cr = (Z / 3 + w.swell) % 1, crest = cr < 0.07 ? (Z < Zw + 4 ? LMID : LMID + DIM) : DARK; // crests running in to the shore
        r.buf.fill(crest, row, row + N);
        if (y > yw - Math.max(1, 1.2 * u)) r.buf.fill(LMID, row, row + N); // the edge of the water
      } else {
        const rip = (Z * 1.5) % 1 < 0.05 && Z < 14, kk = (TB.fz * N) / Z;
        for (let x = 0; x < N; x++) r.buf[row + x] = rip && hash(Math.floor(((x - N / 2) / kk) * 2), Math.floor(Z * 1.5)) < 0.5 ? MID + DIM : hash(x, y) < 0.03 ? DARK + DIM : DARK;
      }
    }
    // the wreck's ribs, far up the beach on the left
    if (w.kind === 'wreck') for (let i = 0; i < 6; i++) {
      const Z = 13 + i * 1.3, X = -6 - i * 0.15, h = 3.2 - i * 0.2;
      pjT(N, X, 0, Z, PA); pjT(N, X + 1.6, 0, Z, PB);
      const k = PA[2], x0 = PA[0], x1 = PB[0], yb = PA[1];
      for (let q = 0; q < 8; q++) { const a0 = (q / 8) * Math.PI, a1 = ((q + 1) / 8) * Math.PI; r.line(lerp(x0, x1, (1 - Math.cos(a0)) / 2), yb - Math.sin(a0) * h * k, lerp(x0, x1, (1 - Math.cos(a1)) / 2), yb - Math.sin(a1) * h * k, DARK + DIM); }
    }
    // the prints: a palm and five fingers toward the water, foreshortened; wet edges; they press in, and fade
    for (const p of w.prints) {
      p.age += dt;
      if (p.Z > Zw) continue; // under the water
      const press = clamp(p.age / 0.15), fade = 1 - clamp((p.age - 24 * bs) / (4 * bs));
      if (fade <= 0) continue;
      pjT(N, p.X, 0, p.Z, PA);
      const k = PA[2], fs = (TB.camH / p.Z) * 1.15, c = fade > 0.5 ? BLACK : DARK + DIM;
      groundEllipse(r, PA[0], PA[1], 0.12 * k * press, 0.13 * k * fs * press, c);
      if (press >= 1) {
        for (let j = 0; j < 5; j++) {
          const thumb = j === (p.side > 0 ? 0 : 4), fx = p.X + (j - 2) * 0.06 + (thumb ? -p.side * 0.05 : 0), fz = p.Z + 0.19 + (j === 0 || j === 4 ? 0.03 : 0.08) - (thumb ? 0.1 : 0); // palm down: a right hand's thumb on its left
          pjT(N, fx, 0, fz, PB);
          groundEllipse(r, PB[0], PB[1], 0.024 * PB[2], 0.08 * PB[2] * fs, c);
        }
        r.rect(PA[0] - 0.1 * k, PA[1] - 0.13 * k * fs - 1, 0.2 * k, 1, fade > 0.5 && p.age < 8 * bs ? LMID : LMID + DIM); // the far lip of the hollow catches the sky
      }
    }
    w.prints = w.prints.filter((p) => p.age < 28 * bs);
    // the bubbles: a dome rising at its terminal speed, a highlight on top; pop: a ring and droplets falling back
    w.bubbles = w.bubbles.filter((b) => {
      b.h += dt * 0.15 * (b.R / 0.25) ** 2; // a bubble's terminal speed in tar: slow, and as the square of its size
      pjT(N, b.X, 0, b.Z, PA);
      const k = PA[2], rx = b.R * k, ht = Math.min(b.h, b.R) * k, cx = PA[0], cy = PA[1];
      if (b.h < b.R) {
        for (let y = Math.floor(cy - ht); y <= cy; y++) { const q = (cy - y) / Math.max(0.5, ht), hw = rx * Math.sqrt(Math.max(0, 1 - q * q)); r.rect(cx - hw, y, Math.max(1, 2 * hw), 1, b.Z > Zw ? DARK + DIM : DARK); }
        r.set(cx - rx * 0.3, cy - ht * 0.75, LMID);
        return true;
      }
      w.rings.push({ X: b.X, Z: b.Z, R: b.R, t: 0 });
      for (let j = 0; j < 4 + b.R * 16; j++) { const a = rnd() * TAU, sp = (0.5 + rnd()) * (b.R / 0.25); w.drops.push({ X: b.X, Y: b.R * 0.8, Z: b.Z, vx: Math.cos(a) * sp * 0.6, vy: 1 + rnd() * 2 * (b.R / 0.25), vz: Math.sin(a) * sp * 0.6 }); }
      return false;
    });
    w.rings = w.rings.filter((q) => { q.t += dt; pjT(N, q.X, 0, q.Z, PA); const k = PA[2], rr = q.R * (1 + q.t * 3) * k; r.ring(PA[0], PA[1], rr, Math.max(1, 0.6 * u), LMID + DIM, (TB.camH / q.Z) * 1.15); return q.t < 0.5; });
    w.drops = w.drops.filter((p) => { p.vy -= 9.8 * dt; p.X += p.vx * dt; p.Y += p.vy * dt; p.Z += p.vz * dt; pjT(N, p.X, p.Y, p.Z, PA); r.rect(PA[0], PA[1], Math.max(1, 0.04 * PA[2]), Math.max(1, 0.04 * PA[2]), DARK + DIM); return p.Y > 0; });
    // the figure on the trail, from behind: on toward the water with the mids, a step back on a snare
    let moving = 0;
    if (w.back) { w.back.p = Math.min(1, w.back.p + dt / 0.3); w.Zf = lerp(w.back.from, w.back.to, ease(w.back.p)); moving = 1; if (w.back.p >= 1) w.back = null; }
    else { const st = (0.12 + 0.35 * f.rel.midDrive) * dt; if (w.Zf + st < Zw - 1.5) { w.Zf += st; moving = st / dt; } }
    w.Zf = clamp(w.Zf, 5, Math.max(5, Zw0 - 1.5));
    w.wph += moving * dt * 5;
    pjT(N, trailX(w.Zf), 0, w.Zf, PA);
    const k = PA[2], fx = PA[0], fy = PA[1], H = 1.75 * k, lift = Math.sin(w.wph) * 0.06 * k, lL = Math.max(0, lift), lR = Math.max(0, -lift); // the foot in the air is the one stepping
    r.rect(fx - 0.15 * k, fy - 0.45 * H - lL, 0.1 * k, 0.45 * H, FIG); r.rect(fx + 0.05 * k, fy - 0.45 * H - lR, 0.1 * k, 0.45 * H, FIG);
    r.rect(fx - 0.29 * k, fy - 0.8 * H + lR * 0.5, 0.07 * k, 0.38 * H, FIG); r.rect(fx + 0.22 * k, fy - 0.8 * H + lL * 0.5, 0.07 * k, 0.38 * H, FIG); // the arms swing against the legs
    r.poly([[fx - 0.21 * k, fy - 0.82 * H], [fx + 0.21 * k, fy - 0.82 * H], [fx + 0.26 * k, fy - 0.36 * H], [fx - 0.26 * k, fy - 0.36 * H]], FIG);
    r.rect(fx - 0.17 * k, fy - 0.8 * H, 0.34 * k, 0.3 * H, MID); r.frame(Math.round(fx - 0.17 * k), Math.round(fy - 0.8 * H), Math.round(0.34 * k), Math.round(0.3 * H), DARK); // the pack on his back
    r.disc(fx, fy - 0.9 * H, 0.11 * k, FIG); r.rect(fx - 0.12 * k, fy - 0.94 * H, 0.24 * k, 0.06 * H, FIG);
    targets.push({ x: fx - 0.27 * k, y: fy - H, w: 0.54 * k, h: H });
    if (Zw < w.Zf + 0.3) { r.rect(fx - 0.2 * k, fy - 0.08 * k, 0.4 * k, 0.08 * k, DARK); r.ring(fx, fy, 0.3 * k * (1 + 0.2 * Math.sin(t * 4)), Math.max(1, 0.5 * u), LMID + DIM, TB.camH / w.Zf); } // standing in the tar
    // the storm: tar rain falling, leaning in the wind
    if (storm) for (const d of w.rain) { d[1] += 0.9 * N * dt; d[0] -= 0.15 * N * dt; if (d[1] > N) { d[1] = -rnd() * 0.2 * N; d[0] = rnd() * N * 1.2; } r.line(d[0], d[1], d[0] + 1.5 * u, d[1] - 5 * u, DARK + DIM); }
  },
};

// ---------------------------------------------------------------------------------------------- cutscene
// The long cutscene, letterboxed: a camera on a circle round a lone figure, always looking at him, going slowly round
// (the mids hurry it), so the ground turns under him, the far hills and the sun slide round with the heading while the
// near stones sweep by faster, and he turns as the camera goes round him: he is a few boxes in space (a long coat, a
// hat, a cape), drawn from wherever the camera is. The treble is the wind in his cape, a hat lights the ember of his
// cigar (its smoke rises, slowing, downwind), a snare flares the lens on the brightest light in view (the sun, a lamp,
// or the ember), a kick pushes the camera in, he breathes out smoke every other beat. A drop: a hard cut to an abstract
// eye in close-up for one beat, its pupil opening with the bass, and back. A cliff edge, a beach, graves, a hangar.
const CUT_W = { cliff: [2, 2, 1], beach: [3, 1, 1], graves: [1, 3, 2], hangar: [1, 1, 3] };
const CUT_LIGHT = { cliff: [26, 9, -34], beach: [-24, 2, -45], graves: [-4, 1.3, 3.5], hangar: [2, 6.8, -6] }; // a practical light in each set (m)
const WIND = [0.8, 0, 0.6]; // the wind's way, in the world
// the convex hull of a few points (monotone chain): the silhouette of a box seen from anywhere
function hull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function buildCut(W) {
  const { w, rnd } = W, k = w.kind, obj = [];
  // nothing stands on the camera's circle (3-6.5 m out), so it never passes through anything
  const far = () => (rnd() < 0.2 ? 1.5 + rnd() * 1.2 : 6.8 + rnd() * 11);
  if (k === 'graves') for (let i = 0; i < 28; i++) { const a = rnd() * TAU, d = far(); obj.push({ t: 'stone', X: Math.cos(a) * d, Z: Math.sin(a) * d, h: 0.7 + rnd() * 0.5, a: 0.3, b: 0.09, face: rnd() < 0.5 ? 0 : Math.PI }); }
  else if (k === 'hangar') { for (let i = -2; i <= 1; i++) for (let j = -2; j <= 1; j++) if (Math.hypot(i * 6 + 3, j * 6 + 3) > 7) obj.push({ t: 'pillar', X: i * 6 + 3, Z: j * 6 + 3, h: 7, a: 0.4, b: 0.4, face: 0 }); }
  else for (let i = 0; i < 12; i++) { const a = rnd() * TAU, d = far(), X = Math.cos(a) * d, Z = Math.sin(a) * d; if (k === 'cliff' && Z < 0) continue; obj.push({ t: 'rock', X, Z, h: 0.25 + rnd() * 0.4 }); }
  w.obj = obj;
}
const cutscene = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, CUT_W, bandOf(W.a)), th: rnd() * TAU, push: 0, pv: 0, ws: 0.3, ember: 0, flare: 0, eye: null, smoke: [], N, off: new Float32Array(N), sa: new Float32Array(N), ca: new Float32Array(N),
      specks: Array.from({ length: 50 }, () => [rnd() * 20 - 10, rnd() * 2.5, rnd() * 20 - 10]) });
    for (let x = 0; x < N; x++) w.off[x] = Math.atan((x + 0.5 - N / 2) / (0.9 * N));
    buildCut(W);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W;
    if (w.N !== N) cutscene.init(W);
    if (f.section === 'change') { w.kind = rollW(rnd, CUT_W, bandOf(W.a)); buildCut(W); }
    const bs = beatS(f), yh = 0.46 * N, fz = 0.9 * N, camH = 1.6, kind = w.kind, buf = r.buf, bar = Math.round(0.12 * N);
    if (f.section === 'drop') w.eye = { t: 0 };
    for (const hh of hits) {
      if (isLow(hh)) w.pv += 1.5 * hh.strength;
      else if (hh.kind === 'snare') w.flare = Math.max(w.flare, hh.strength);
      else if (hh.kind === 'hat') w.ember = 1;
    }
    w.pv += (-8 * w.push - 4 * w.pv) * dt; w.push = clamp(w.push + w.pv * dt, -0.5, 1.5); // the push in, sprung back
    w.th += dt * (0.07 + 0.12 * f.rel.midDrive);
    w.ws = follow(w.ws, 0.2 + 1.2 * f.rel.trebDrive, dt, 0.4);
    w.ember *= Math.exp(-dt * 1.5); w.flare *= Math.exp(-dt * 3);
    if (w.eye && (w.eye.t += dt) > bs) w.eye = null;
    // the camera: on a circle of radius Rc round him, at eye height, looking at him
    const Rc = 4.6 - w.push, st = Math.sin(w.th), ct = Math.cos(w.th), Cx = Rc * st, Cz = Rc * ct, Fx = -st, Fz = -ct, Rx = ct, Rz = -st, heading = Math.atan2(Fx, Fz);
    const P3 = (X, Y, Z, o) => { const dx = X - Cx, dz = Z - Cz, zc = Math.max(0.05, dx * Fx + dz * Fz); o[0] = N / 2 + (fz * (dx * Rx + dz * Rz)) / zc; o[1] = yh - (fz * (Y - camH)) / zc; o[2] = zc; return o; };
    if (w.eye) { // the cut: an eye, close: lids, the white, the iris and its fibres, the pupil wide with the bass, a highlight from the sun's side
      r.fill(DARK);
      const cx = N / 2, cy = N / 2, Wd = 0.4 * N, top = 0.17 * N, bot = 0.13 * N, Ri = 0.13 * N, pr = Ri * (0.3 + 0.45 * clamp(f.rel.bassDrive));
      for (let x = Math.round(cx - Wd); x < cx + Wd; x++) {
        const q = 1 - ((x - cx) / Wd) ** 2, y0 = cy - top * q ** 0.8, y1 = cy + bot * q;
        for (let y = Math.max(bar, Math.round(y0)); y < Math.min(N - bar, y1); y++) {
          const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
          buf[y * N + x] = d < pr ? BLACK : d < Ri ? (hash(Math.floor(Math.atan2(dy, dx) * 14), 3) < 0.4 ? COOL : MID) : d < Ri + u ? DARK : LMID;
        }
        r.set(x, y0, FIG);
      }
      r.disc(cx - Ri * 0.4, cy - Ri * 0.45, Math.max(1, Ri * 0.18), WHITE);
      for (let k = 0; k < 9; k++) { const x = cx - Wd * 0.8 + (k / 8) * Wd * 1.6, q = 1 - ((x - cx) / Wd) ** 2, y0 = cy - top * q ** 0.8; r.stroke(x, y0, x + (x - cx) * 0.12, y0 - 0.05 * N, Math.max(1, u), FIG); }
      r.rect(0, 0, N, bar, BLACK); r.rect(0, N - bar, N, bar, BLACK);
      return;
    }
    // the sky by heading (the hills and the clouds turn with the camera), or the hangar's roof
    const off = w.off, sa = w.sa, ca = w.ca, sun = [-0.42, 0.2, -0.88], sunAz = Math.atan2(sun[0], sun[2]);
    if (kind === 'hangar') for (let y = bar; y < yh; y++) { // the roof: beams and lamps on a 3 m grid, row by row like the floor
      const tt = ((7 - camH) * fz) / (yh - y + 0.5), dx = (Rx * tt) / fz, dz = (Rz * tt) / fz, row = y * N;
      let px = Cx + Fx * tt + Rx * ((0.5 - N / 2) / fz) * tt, pz = Cz + Fz * tt + Rz * ((0.5 - N / 2) / fz) * tt;
      for (let x = 0; x < N; x++, px += dx, pz += dz) {
        const gx = px / 3 - Math.floor(px / 3), gz = pz / 3 - Math.floor(pz / 3);
        buf[row + x] = gx < 0.08 || gz < 0.08 ? DARK : Math.abs(gx - 0.5) < 0.07 && Math.abs(gz - 0.5) < 0.07 ? BRIGHT : DARK + DIM;
      }
    } else {
      // the far hills by heading, and the clouds: sin(4 az + 9 y/N + 0.3), split into its column and row halves; the
      // azimuth of a column falls to the right, as P3 projects the world (its right, +R, is the heading less 90 degrees)
      for (let x = 0; x < N; x++) {
        const az = heading - off[x], hm = (0.035 + 0.02 * Math.sin(3 * az + 1) + 0.012 * Math.sin(7 * az + 2) + 0.006 * Math.sin(13 * az)) * N;
        sa[x] = Math.sin(4 * az); ca[x] = Math.cos(4 * az);
        vcol(r, x, yh - hm, hm, kind === 'graves' ? DARK + DIM : MID + DIM);
      }
      for (let y = bar; y < yh; y++) {
        const sb = Math.sin((y / N) * 9 + 0.3), cb = Math.cos((y / N) * 9 + 0.3), row = y * N;
        for (let x = 0; x < N; x++) { const v = sa[x] * cb + ca[x] * sb; if (v > 0.55 && bayer(x, y) < 0.5 * (v - 0.55) && buf[row + x] === BG) buf[row + x] = LMID + DIM; }
      }
    }
    let sunX = -1, sunY = 0;
    const sRel = wrapAngle(sunAz - heading);
    if (kind !== 'hangar' && Math.abs(sRel) < 1.2) { sunX = N / 2 - fz * Math.tan(sRel); sunY = yh - (fz * Math.tan(0.2)) / Math.cos(sRel); if (sunX > -0.1 * N && sunX < 1.1 * N) { ditherDisc(r, sunX, sunY, 0.07 * N, LMID, 0.35); r.disc(sunX, sunY, 0.035 * N, BRIGHT); } else sunX = -1; }
    // the ground, pixel by pixel: the plane under him; past the cliff's lip the sea far below or the cliff's face
    for (let y = Math.ceil(yh); y < N - bar; y++) {
      const dy = y + 0.5 - yh, tt = (camH * fz) / dy, row = y * N, haze = clamp((tt - 10) / 45), sx = (Rx * tt) / fz, sz = (Rz * tt) / fz;
      let px = Cx + Fx * tt + Rx * ((0.5 - N / 2) / fz) * tt, pz = Cz + Fz * tt + Rz * ((0.5 - N / 2) / fz) * tt;
      for (let x = 0; x < N; x++, px += sx, pz += sz) {
        let c;
        if (kind === 'cliff' && pz < -0.8) {
          const xn = (x + 0.5 - N / 2) / fz, t2 = ((camH + 40) * fz) / dy, qz = Cz + (Fz + Rz * xn) * t2;
          if (qz > -0.8) { const tf = (-0.8 - Cz) / (Fz + Rz * xn), yf = camH - (dy / fz) * tf; c = Math.floor(-yf * 0.6) % 2 ? DARK : DARK + DIM; } // the face, in strata
          else { const qx = Cx + (Fx + Rx * xn) * t2; c = Math.sin(qx * 0.15 + qz * 0.4 + t * 0.8) > 0.88 ? LMID + DIM : MID + DIM; }
        } else if (kind === 'beach' && pz < -2.5 + 0.6 * Math.sin(t * 0.7)) c = pz > -2.8 + 0.6 * Math.sin(t * 0.7) ? LMID : Math.sin(px * 0.2 + pz * 0.6 + t) > 0.85 ? LMID + DIM : MID + DIM; // foam, the sea
        else if (kind === 'hangar') { const gx = ((px / 3) % 1 + 1) % 1, gz = ((pz / 3) % 1 + 1) % 1; c = gx < 0.03 || gz < 0.03 ? DARK + DIM : MID + DIM; }
        else { const hv = hash(Math.floor(px * 3), Math.floor(pz * 3)); c = kind === 'beach' ? (hv < 0.06 ? MID + DIM : LMID + DIM) : hv < 0.08 ? MID + DIM : DARK; if (kind === 'cliff' && pz < -0.7) c = MID; } // the lip
        buf[row + x] = haze > 0 && bayer(x, y) < haze * 0.8 ? LMID + DIM : c;
      }
    }
    // his shadow on the ground, thrown away from the low sun
    const shL = Math.min(5.5, kind === 'cliff' && sun[2] > 0 ? 0.7 / sun[2] : 5.5), sdx = -sun[0] / Math.hypot(sun[0], sun[2]), sdz = -sun[2] / Math.hypot(sun[0], sun[2]);
    if (kind !== 'hangar') { const q = [[-0.15, 0], [0.15, 0], [0.22, shL], [-0.22, shL]].map(([a, b]) => P3(sdz * a + sdx * b, 0, -sdx * a + sdz * b, [0, 0, 0])); if (q.every((p) => p[2] > 0.3)) r.poly(q, DARK + DIM); }
    // the stones, graves and pillars round him, far to near, the near ones after him
    const Fa = [0, 0, -1], Ra = [1, 0, 0], lw = (a, y, b) => [Ra[0] * a + Fa[0] * b, y, Ra[2] * a + Fa[2] * b]; // his own axes: right, up, forward
    const items = w.obj.map((o) => [P3(o.X, 0, o.Z, [0, 0, 0])[2], o]).filter((q) => q[0] > 0.4).sort((a, b) => b[0] - a[0]);
    const drawObj = (o) => {
      P3(o.X, 0, o.Z, PA); const k = fz / PA[2];
      if (o.t === 'rock') { r.disc(PA[0], PA[1] - o.h * 0.4 * k, o.h * 0.8 * k, DARK + DIM); r.disc(PA[0] - o.h * 0.2 * k, PA[1] - o.h * 0.6 * k, o.h * 0.35 * k, MID + DIM); return; }
      const psi = o.face - heading, hw = (o.a * Math.abs(Math.cos(psi)) + o.b * Math.abs(Math.sin(psi))) * k, top = PA[1] - o.h * k;
      r.rect(PA[0] - hw, top, 2 * hw, o.h * k, o.t === 'pillar' ? MID : MID + DIM);
      r.rect(PA[0] - hw, top, Math.max(1, 0.3 * hw), o.h * k, o.t === 'pillar' ? LMID : MID);
      if (o.t === 'stone') r.disc(PA[0], top, hw, MID + DIM);
    };
    for (const [z, o] of items) if (z > Rc) drawObj(o);
    // the figure: a long coat, legs, a cape blown downwind, a head and a hat; the cape before or after the coat as it lies
    const pr = (p) => P3(p[0], p[1], p[2], [0, 0, 0]);
    const coat = hull([[-0.24, 1.45, 0.12], [0.24, 1.45, 0.12], [0.24, 1.45, -0.12], [-0.24, 1.45, -0.12], [-0.3, 0.45, 0.16], [0.3, 0.45, 0.16], [0.3, 0.45, -0.16], [-0.3, 0.45, -0.16]].map(([a, y, b]) => pr(lw(a, y, b))));
    const ws = w.ws, cape = [];
    for (let j = 0; j <= 4; j++) {
      const q = j / 4, fl = Math.sin(t * 9 + q * 4) * 0.08 * ws * q, dsp = (0.45 * ws + fl) * q * q, row = [];
      for (const sgn of [-1, 1]) { const p = lw(sgn * lerp(0.24, 0.32, q), lerp(1.43, 0.35, q) + 0.15 * ws * q * q, lerp(-0.12, -0.22, q)); row.push(pr([p[0] + WIND[0] * dsp, p[1], p[2] + WIND[2] * dsp])); }
      cape.push(row);
    }
    const back = Fx * Fa[0] + Fz * Fa[2] > 0; // the camera behind him: the cape is the nearer
    const drawCape = () => { for (let j = 0; j < 4; j++) r.poly([cape[j][0], cape[j][1], cape[j + 1][1], cape[j + 1][0]], MID); };
    for (const sgn of [-1, 1]) { const a = pr(lw(sgn * 0.11, 0.5, 0)), b = pr(lw(sgn * 0.13, 0, 0.04)); r.stroke(a[0], a[1], b[0], b[1], Math.max(1, (0.13 * fz) / a[2]), FIG); }
    if (!back) drawCape();
    r.poly(coat, FIG);
    if (back) drawCape();
    const hd = pr(lw(0, 1.62, 0.02)), hr = (0.11 * fz) / hd[2];
    r.disc(hd[0], hd[1], hr, FIG);
    const brim = [], crown = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; brim.push(pr(lw(Math.cos(a) * 0.25, 1.72, Math.sin(a) * 0.25))); crown.push(pr(lw(Math.cos(a) * 0.13, 1.72, Math.sin(a) * 0.13)), pr(lw(Math.cos(a) * 0.12, 1.88, Math.sin(a) * 0.12))); }
    r.poly(hull(crown), FIG); r.poly(hull(brim), FIG);
    // the cigar and its ember (hidden behind his head when the camera is behind him), the smoke
    const tip = pr(lw(0, 1.56, 0.25)), mouth = pr(lw(0, 1.57, 0.1)), hidden = back && Math.hypot(tip[0] - hd[0], tip[1] - hd[1]) < hr;
    if (!hidden) { r.line(mouth[0], mouth[1], tip[0], tip[1], LMID); r.disc(tip[0], tip[1], Math.max(0.6, (0.02 + 0.03 * w.ember) * fz / tip[2]), w.ember > 0.4 ? WHITE : HOT); }
    const tipW = lw(0, 1.56, 0.25);
    if (w.ember > 0.9 || (f.beat.on && f.beat.count % 2 === 0)) { const big = f.beat.on; w.smoke.push({ p: big ? lw(0, 1.57, 0.12) : tipW.slice(), v: [WIND[0] * 0.2, 0.25, WIND[2] * 0.2 + (big ? -0.3 : 0)], R: big ? 0.05 : 0.02, life: big ? 2 : 1.4 }); if (w.smoke.length > 40) w.smoke.shift(); }
    const air = 1 - Math.exp(-dt * 1.2);
    w.smoke = w.smoke.filter((m) => {
      m.v[0] += (WIND[0] * ws - m.v[0]) * air; m.v[2] += (WIND[2] * ws - m.v[2]) * air; m.v[1] += (0.08 - m.v[1]) * air;
      m.p[0] += m.v[0] * dt; m.p[1] += m.v[1] * dt; m.p[2] += m.v[2] * dt; m.R += dt * 0.12;
      const q = P3(m.p[0], m.p[1], m.p[2], PA); if (q[2] > 1) ditherDisc(r, q[0], q[1], Math.min(0.12 * N, Math.max(0.6, (m.R * fz) / q[2])), LMID + DIM, 0.6 * clamp(m.life / 1.5)); // (none drawn right on the lens)
      return (m.life -= dt) > 0;
    });
    targets.push({ x: hd[0] - 0.35 * fz / hd[2], y: hd[1] - 0.3 * fz / hd[2], w: 0.7 * fz / hd[2], h: 1.95 * fz / hd[2] });
    for (const [z, o] of items) if (z <= Rc) drawObj(o);
    // specks on the wind (spray, sand, leaves, dust), streaming past at their depths
    for (const sp of w.specks) {
      sp[0] += WIND[0] * (1 + 5 * ws) * dt; sp[2] += WIND[2] * (1 + 5 * ws) * dt; sp[1] += Math.sin(t * 2 + sp[0]) * 0.2 * dt;
      if (sp[0] > 10) sp[0] -= 20;
      if (sp[2] > 10) sp[2] -= 20;
      const q = P3(sp[0], sp[1], sp[2], PA); if (q[2] > 0.5 && q[1] > bar && q[1] < N - bar) r.rect(q[0], q[1], Math.max(1, (0.03 * fz) / q[2]), Math.max(1, (0.03 * fz) / q[2]), kind === 'hangar' ? MID + DIM : LMID + DIM);
    }
    // the lens flare on the brightest light in view: the sun, the set's lamp, else his ember; ghosts along the line through the centre
    if (w.flare > 0.05) {
      let lx = sunX, ly = sunY;
      if (lx < 0) { const L = CUT_LIGHT[kind], q = pr(L); if (q[2] > 0.5 && q[0] > 0 && q[0] < N && q[1] > bar && q[1] < N - bar) { lx = q[0]; ly = q[1]; r.disc(lx, ly, Math.max(1, 1.5 * u), BRIGHT); } }
      if (lx < 0 && !hidden) { lx = tip[0]; ly = tip[1]; }
      if (lx >= 0) {
        const I = w.flare, sl = 0.45 * N * I;
        r.line(lx - sl, ly, lx + sl, ly, BRIGHT); r.line(lx - sl * 0.4, ly, lx + sl * 0.4, ly, WHITE);
        [[0.5, 2.5, LMID + DIM], [0.85, 1.2, COOL], [1.3, 4, LMID + DIM], [1.7, 2, COOL + DIM], [2.1, 6, LMID + DIM]].forEach(([k, rad, c]) => {
          const gx = lx + (N / 2 - lx) * k, gy = ly + (N / 2 - ly) * k;
          if (rad > 3) r.ring(gx, gy, rad * u * (0.6 + I), Math.max(1, 0.6 * u), c); else ditherDisc(r, gx, gy, rad * u * (0.6 + I), c, 0.7);
        });
      }
    }
    r.rect(0, 0, N, bar, BLACK); r.rect(0, N - bar, N, bar, BLACK);
  },
};

const WORLDS = { visioncones, cardboard, codec, porter, ladderchasm, walkingtank, sniperfield, nanoswarm, motorbike, elevator, handprints, cutscene };

registerFamily('stealth', WORLD_DEFS, WORLDS);
export const STEALTH_STYLE = makeMixStyle('TACTICAL CINEMA', ['stealth']);
