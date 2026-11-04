// Y2K ETHEREAL, mixed. The glossy turn of the millennium as worlds: a cyber heaven of clouds, angels and chrome, orbs
// bouncing in a white void, aero water with bubbles and fish, a chrome tunnel, holographic butterflies, a halo, a
// winged heart on a monitor, an empty pool room, glass panels and a cursor, a crystal temple, a low-poly model on
// a turntable, a feather over a moonlit sea. Original shapes only: no logos, no brand UI, no text. Every world rolls
// a variant table weighed by the mood's arousal band, re-rolls it on a section change and goes heavy on a drop.
import { clamp, lerp, bayer } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, pickW, isLow, isTonal, follow,
  ease, beatLocked, hash, particles, burst, shiftRow, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  cyberheaven: { name: 'cyber heaven', va: [[H, L], [M, L], [H, M]], pals: ['chrome', 'pearl', 'aero', 'ice', 'hologram'], fx: ['none', 'film'] },
  chromeorbs: { name: 'chrome orbs', va: [[H, M], [H, H], [M, M]], pals: ['chrome', 'silver', 'pearl', 'aero'], fx: ['none', 'crt'] },
  aerogloss: { name: 'aero gloss', va: [[H, L], [M, L], [H, M]], pals: ['aero', 'ice', 'crystal', 'candy'], fx: ['none', 'crt', 'film'] },
  chrometunnel: { name: 'chrome tunnel', va: [[H, M], [H, H], [M, M]], pals: ['chrome', 'hologram', 'silver', 'midnight'], fx: ['none', 'kaleido', 'crt'], geo: true },
  butterflies: { name: 'holo butterflies', va: [[H, M], [H, H], [M, M]], pals: ['hologram', 'candy', 'vapor', 'pearl'], fx: ['none', 'kaleido', 'vhs'], geo: true },
  halo: { name: 'the halo', va: [[H, L], [M, L], [H, M]], pals: ['hologram', 'midnight', 'pearl', 'crystal'], fx: ['none', 'film'] },
  heartmonitor: { name: 'heart monitor', va: [[M, M], [M, H]], pals: ['hologram', 'candy', 'midnight', 'crystal'], fx: ['none', 'crt', 'vhs'] },
  liminalpool: { name: 'liminal pool', va: [[L, M], [L, L]], pals: ['aero', 'ice', 'pearl', 'midnight'], fx: ['none', 'vhs', 'film'] },
  glasspanes: { name: 'glass panes', va: [[H, M], [H, H], [M, M]], pals: ['aero', 'chrome', 'pearl', 'ice'], fx: ['none', 'crt'] },
  crystaltemple: { name: 'crystal temple', va: [[H, L], [M, L], [H, M]], pals: ['crystal', 'pearl', 'ice', 'hologram'], fx: ['none', 'film'] },
  modelviewer: { name: 'model viewer', va: [[M, M], [M, H]], pals: ['chrome', 'silver', 'hologram', 'midnight'], fx: ['none', 'crt', 'vhs'] },
  feathersea: { name: 'feather sea', va: [[H, L], [M, L], [H, M]], pals: ['midnight', 'silver', 'pearl', 'hologram'], fx: ['none', 'film', 'vhs'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the variant tables below weigh their kinds by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bpsOf = (f) => (f.bpm ? f.bpm / 60 : 2);
// the phase within the bar (four beats), 0..1, free-running when the beat is not locked
const barPhase = (f, t) => (beatLocked(f) ? ((f.beat.count % 4) + f.beat.phase) / 4 : (t * 0.5) % 1);
// a sine table for the per-pixel loops: `sinL(x)` for x in radians, any sign
const SN = 1024, SK = SN / TAU, SIN = Float32Array.from({ length: SN }, (_, i) => Math.sin((i / SN) * TAU));
const sinL = (x) => SIN[((x * SK) | 0) & (SN - 1)];
// the one energy knob: bass above the track's own average, the level, the mids
const energy = (f) => clamp(0.5 * f.rel.bassDrive + 0.3 * f.level + 0.2 * f.rel.midDrive);
// the value ramp, dark to light, and the light-side ramp a glossy highlight climbs
const RAMP = [DARK, MID, LMID, BRIGHT];
const rampAt = (v) => RAMP[clamp(v) * 3.999 | 0];

// a ring (or an ellipse ring with sy < 1) filled row by row from its two spans, so a ring wider than the screen
// costs its rows, not its area; the ring's rows that fall off the raster are skipped
function ringFast(r, cx, cy, ro, ri, c, sy = 1) {
  const N = r.N, buf = r.buf, y0 = Math.max(0, Math.ceil(cy - ro * sy - 0.5)), y1 = Math.min(N - 1, Math.floor(cy + ro * sy - 0.5));
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / sy, q = ro * ro - dy * dy;
    if (q <= 0) continue;
    const xo = Math.sqrt(q), xi = Math.abs(dy) < ri ? Math.sqrt(ri * ri - dy * dy) : 0;
    const a0 = Math.max(0, Math.round(cx - xo)), a1 = Math.min(N, Math.round(cx - xi)), b0 = Math.max(0, Math.round(cx + xi)), b1 = Math.min(N, Math.round(cx + xo));
    if (a1 > a0) buf.fill(c, y * N + a0, y * N + a1);
    if (b1 > b0) buf.fill(c, y * N + b0, y * N + b1);
  }
}

// a glossy ball: the ramp DARK→MID→LMID→BRIGHT→WHITE as discs shrinking toward the light (lx, ly is a unit vector
// toward it); `base` tints the dark side (an accent reflected in chrome); `sq` > 1 squashes it, sq wider, 1/sq lower
function glossBall(r, cx, cy, R, lx, ly, base = DARK, sq = 1) {
  const sy = 1 / (sq * sq), Ry = R / sq, E = (x, y, rad, c) => (sq === 1 ? r.disc(x, y, rad, c) : ringFast(r, x, y, rad, 0, c, sy));
  R *= sq;
  E(cx, cy, R, base);
  E(cx + lx * R * 0.14, cy + ly * Ry * 0.14, R * 0.86, MID);
  E(cx + lx * R * 0.3, cy + ly * Ry * 0.3, R * 0.62, LMID);
  E(cx + lx * R * 0.42, cy + ly * Ry * 0.42, R * 0.4, BRIGHT);
  if (R > 2.5) E(cx + lx * R * 0.5, cy + ly * Ry * 0.5, Math.max(1, R * 0.16), WHITE);
}

// a damped spring on o[x] (velocity o[v]) toward `to`, stepped in slices of at most 1/120 s so that a kick rings the
// same at 10 frames a second as at 60 (one big step loses most of the swing at a low frame rate)
function spring(o, x, v, to, k, c, dt) {
  for (let n = Math.ceil(dt * 120), h = dt / n; n > 0; n--) { o[v] += (-(o[x] - to) * k - o[v] * c) * h; o[x] += o[v] * h; }
}

// a chrome ball: a fake environment, sky above a sharp horizon, ground below, a rim, and the glint toward the light
function chromeBall(r, cx, cy, R, lx, ly, u, tint = -1) {
  const N = r.N, buf = r.buf, hz = cy + R * 0.08;
  for (let y = Math.max(0, Math.ceil(cy - R - 0.5)); y <= Math.min(N - 1, Math.floor(cy + R - 0.5)); y++) {
    const dy = y + 0.5 - cy, q = R * R - dy * dy;
    if (q <= 0) continue;
    const xw = Math.sqrt(q), x0 = Math.max(0, Math.round(cx - xw)), x1 = Math.min(N, Math.round(cx + xw));
    if (x1 <= x0) continue;
    const v = dy / R; // -1 top .. 1 bottom
    const c = y < hz - 0.5 ? (v < -0.72 ? LMID : v < -0.2 ? BRIGHT : LMID) : y < hz + Math.max(1, u) - 0.5 ? FIG : v > 0.8 ? MID : v > 0.45 ? DARK : tint >= 0 ? tint : DARK + DIM;
    buf.fill(c, y * N + x0, y * N + x1);
    if (xw > 2) { buf[y * N + x0] = y < hz ? MID : DARK; buf[y * N + x1 - 1] = y < hz ? MID : DARK; } // the rim
  }
  if (R > 2) r.disc(cx + lx * R * 0.45, cy + ly * R * 0.45, Math.max(1, R * 0.15), WHITE);
}

// a lens flare: a cross glint with tapering arms, a ring or two around it
function flare(r, x, y, R, u, c, rings = true) {
  const lw = Math.max(1, u);
  r.rect(x - R, y - lw / 2, 2 * R, lw, c);
  r.rect(x - lw / 2, y - R, lw, 2 * R, c);
  r.rect(x - R * 0.5, y - lw, R, 2 * lw, c);
  r.rect(x - lw, y - R * 0.5, 2 * lw, R, c);
  r.disc(x, y, Math.max(1, R * 0.18), WHITE);
  if (rings && R > 4 * u) { ringFast(r, x, y, R * 0.55, R * 0.55 - lw, c); ringFast(r, x, y, R * 0.95, R * 0.95 - lw, c + (c < 8 ? DIM : 0)); }
}

// a rounded rectangle, row by row
function rrect(r, x, y, w, h, rad, c) {
  const N = r.N, buf = r.buf, y0 = Math.round(y), y1 = Math.round(y + h);
  rad = Math.min(rad, w / 2, h / 2);
  for (let yy = Math.max(0, y0); yy < Math.min(N, y1); yy++) {
    const dy = yy + 0.5 - y, e = dy < rad ? rad - dy : dy > h - rad ? dy - (h - rad) : 0, inset = e > 0 ? rad - Math.sqrt(Math.max(0, rad * rad - e * e)) : 0;
    const a = Math.max(0, Math.round(x + inset)), b = Math.min(N, Math.round(x + w - inset));
    if (b > a) buf.fill(c, yy * N + a, yy * N + b);
  }
}

// a low-poly angel as a silhouette: a robe, a head, two wings spread by `flap` (0 folded .. 1 up), a halo ring;
// h is the height of the body, the wings reach h wide each side
function angel(r, x, y, h, flap, col, haloCol, u) {
  const hw = h * 0.22, head = h * 0.14, sh = y - h * 0.62, tip = sh - h * (0.75 * flap - 0.15), mid = sh + h * (0.2 - 0.3 * flap);
  for (const d of [-1, 1]) { // the wings: two facets each, the far one a shade behind
    r.poly([[x + d * hw * 0.8, sh], [x + d * h * 0.95, tip], [x + d * h * 0.55, mid + h * 0.05]], col);
    r.poly([[x + d * hw * 0.8, sh + h * 0.08], [x + d * h * 0.55, mid + h * 0.05], [x + d * h * 0.3, mid + h * 0.32]], col);
  }
  r.poly([[x - hw * 0.5, sh - h * 0.05], [x + hw * 0.5, sh - h * 0.05], [x + hw * 1.3, y], [x - hw * 1.3, y]], col); // the robe
  r.disc(x, sh - head * 0.9, head * 0.55, col);
  if (h > 8 * u) r.ring(x, sh - head * 1.9, head * 0.75, Math.max(1, u * 0.8), haloCol, 0.45);
  else r.rect(x - head * 0.8, sh - head * 1.9, head * 1.6, 1, haloCol);
}

// a cursor arrow (an original pointer: a tilted dart with a notch), tip at (x, y)
function cursor(r, x, y, s, inner, outer) {
  const pts = [[x, y], [x, y + 9 * s], [x + 2.4 * s, y + 7 * s], [x + 4 * s, y + 10.5 * s], [x + 5.6 * s, y + 9.6 * s], [x + 4.1 * s, y + 6.4 * s], [x + 7 * s, y + 6.4 * s]];
  r.poly(pts, outer);
  r.poly(pts.map(([px, py]) => [x + (px - x) * 0.72 + 0.4 * s, y + (py - y) * 0.72 + 1.2 * s]), inner);
}

// a perspective grid floor from the horizon hz down to the bottom: lines to the vanishing point, rows at 1/z
function gridFloor(r, N, hz, vx, phase, cols, rows, c, u) {
  for (let k = -cols; k <= cols; k++) r.line(vx, hz, vx + k * N * 0.34, N, c);
  for (let k = 0; k < rows; k++) {
    const zz = 1 + (k + 1 - phase) * (6 / rows), y = hz + (N - hz) / zz;
    if (y < N) r.rect(0, y, N, zz < 1.6 ? Math.max(1, u) : 1, c);
  }
}

// ---------------------------------------------------------------------------------------------- cyberheaven
// A sea of clouds in three layers under a sun with god rays turning on the mid clock; low-poly angels float over
// it, wings flapping once a beat, bodies bobbing on the treble, halos as rings; chrome spheres hang near the sun
// with its glint on them. A kick sends a shock ring out of the sun, a snare lifts the angels, a tonal hit drops a
// lens flare where it landed and tints the chrome, a hat sparkles a cloud top. On a drop the clouds part and a
// column of light rises from below. The host (how many angels, spheres, rays) is rolled by the arousal band.
const HEAVEN = { dawn: { angels: 3, spheres: 2, rays: 6 }, choir: { angels: 6, spheres: 3, rays: 9 }, host: { angels: 10, spheres: 4, rays: 12 } };
const HEAVEN_W = { dawn: [3, 2, 1], choir: [2, 3, 2], host: [0, 1, 3] };
const newAngel = (rnd) => ({ x: rnd(), y: 0.28 + rnd() * 0.3, s: 0.55 + rnd() * 0.55, ph: rnd() * TAU, bp: (rnd() - 0.5) * 0.2, vx: (rnd() - 0.5) * 0.02, oy: 0, ovy: 0 });

const cyberheaven = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), kind = rollW(rnd, HEAVEN_W, band);
    const clouds = [];
    for (let k = 0; k < 3; k++) for (let i = 0; i < 6; i++) clouds.push({ k, x: (i + rnd()) / 6, y: [0.54, 0.64, 0.78][k] + rnd() * [0.05, 0.07, 0.12][k], s: 0.8 + rnd() * 0.5 });
    Object.assign(w, { kind, clouds, angels: Array.from({ length: HEAVEN[kind].angels }, () => newAngel(rnd)), flares: [], rings: [], sparks: [], tint: -1, tintT: 0, part: 0, halo: 0, glow: 0,
      spheres: Array.from({ length: 4 }, (_, i) => ({ x: 0.2 + 0.6 * ((i * 0.37 + rnd() * 0.1) % 1), y: 0.12 + rnd() * 0.3, R: 0.04 + rnd() * 0.035, ph: rnd() * TAU })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), K = HEAVEN[w.kind], sx = 0.5 * N, sy = 0.2 * N;
    for (const h of hits) {
      if (isLow(h)) { w.rings.push({ R: 0.08 * N, life: 0.6 }); w.halo = 0.18; }
      else if (h.kind === 'snare') for (const an of w.angels) an.ovy -= 0.23 * h.strength;
      else if (h.kind === 'hat') { const c = pick(rnd, w.clouds); w.sparks.push({ x: c.x, y: c.y - 0.04 * c.s, t: 0.25 }); }
      else if (isTonal(h)) { w.flares.push({ x: h.x * N, y: h.y * 0.5 * N, R: (5 + 9 * h.strength) * u, life: 0.5 }); w.tint = h.pc % 2 ? HOT : COOL; w.tintT = 0.5; }
    }
    if (f.section === 'drop') { w.part = 1; for (let k = 0; k < 2; k++) w.angels.push(newAngel(rnd)); w.flares.push({ x: sx, y: sy, R: 14 * u, life: 0.8 }); s.shake = Math.max(s.shake, 0.3); }
    else if (f.section === 'change') w.kind = rollW(rnd, HEAVEN_W, band);
    const want = HEAVEN[w.kind].angels;
    if (w.angels.length < want) w.angels.push(newAngel(rnd)); else if (w.angels.length > want && rnd() < dt) w.angels.pop();
    w.part *= Math.exp(-dt / 3);
    w.halo -= dt; w.tintT -= dt;
    w.glow = follow(w.glow, f.level, dt, 0.3);
    const pulse = f.beat.pulse, R = 0.07 * N * (1 + 0.1 * pulse + 0.1 * w.glow);
    // the rays, turning on the mid clock, then the sun
    const a0 = f.rel.midClock * 0.15, hw = 0.035 + 0.02 * w.glow;
    for (let k = 0; k < K.rays; k++) {
      const a = a0 + (k * TAU) / K.rays, len = 1.6 * N;
      r.poly([[sx, sy], [sx + Math.cos(a - hw) * len, sy + Math.sin(a - hw) * len], [sx + Math.cos(a + hw) * len, sy + Math.sin(a + hw) * len]], LMID);
    }
    ringFast(r, sx, sy, R * 1.5, R * 1.5 - Math.max(1, u), LMID);
    r.disc(sx, sy, R, BRIGHT);
    r.disc(sx, sy, R * 0.5, WHITE);
    w.rings = w.rings.filter((q) => { q.R += dt * 0.7 * N; q.life -= dt; ringFast(r, sx, sy, q.R, q.R - Math.max(1, 1.5 * u * q.life / 0.6), q.life > 0.3 ? BRIGHT : LMID); return q.life > 0; });
    // the chrome spheres, lit by the sun, bobbing on the treble
    for (let i = 0; i < K.spheres; i++) {
      const sp = w.spheres[i], cx = sp.x * N, cy = (sp.y + 0.015 * Math.sin(f.rel.trebClock * 0.7 + sp.ph)) * N, dx = sx - cx, dy = sy - cy, d = Math.hypot(dx, dy) || 1;
      chromeBall(r, cx, cy, sp.R * N * (1 + 0.05 * pulse), dx / d, dy / d, u, w.tintT > 0 ? w.tint : -1);
    }
    // the clouds, far to near; a drop parts them from the middle and the light comes up through the gap
    const col = (k) => [MID, LMID, BRIGHT][k], part = ease(w.part) * 0.35;
    for (let k = 0; k < 3; k++) {
      if (k === 1 && w.part > 0.01) {
        const cw = (0.05 + 0.1 * ease(w.part)) * N, top = N - ease(w.part) * (N - sy);
        r.rect(sx - cw, top, 2 * cw, N - top, BRIGHT);
        r.rect(sx - cw * 0.4, top, cw * 0.8, N - top, WHITE);
      }
      const speed = (0.012 + 0.02 * k) * (0.3 + f.rel.bassDrive);
      for (const c of w.clouds) {
        if (c.k !== k) continue;
        c.x += speed * dt;
        if (c.x > 1.15) c.x -= 1.3;
        const cx = (c.x + Math.sign(c.x - 0.5) * part * (1 - Math.abs(c.x - 0.5))) * N, cy = c.y * N, rr = [0.045, 0.06, 0.085][k] * N * c.s;
        r.disc(cx, cy, rr, col(k));
        r.disc(cx - rr * 1.1, cy + rr * 0.3, rr * 0.75, col(k));
        r.disc(cx + rr * 1.15, cy + rr * 0.25, rr * 0.8, col(k));
        r.disc(cx + rr * 0.3, cy - rr * 0.45, rr * 0.7, col(k));
        r.rect(cx - rr * 1.8, cy + rr * 0.5, rr * 3.6, rr * 0.6, col(k));
        if (k > 0) r.rect(cx - rr * 1.5, cy + rr * 1.05, rr * 3, Math.max(1, u * 0.8), [MID, LMID, BRIGHT][k - 1]); // the underside
      }
    }
    // the angels, far to near: wings up on the beat, a bob on the treble, a lift on a snare that springs back
    const locked = beatLocked(f), near = w.angels.reduce((m, an) => (an.s > m.s ? an : m), w.angels[0]);
    w.angels.sort((p, q) => p.s - q.s);
    for (const an of w.angels) {
      an.x += an.vx * dt * (0.5 + f.rel.midDrive);
      if (an.x < -0.1) an.x += 1.2; else if (an.x > 1.1) an.x -= 1.2;
      spring(an, 'oy', 'ovy', 0, 30, 4, dt);
      const ph = locked ? f.beat.phase + an.bp : t * 1.4 + an.ph / TAU, flap = 0.5 + 0.5 * Math.cos(TAU * ph);
      const h = 0.1 * N * an.s, x = an.x * N, y = (an.y + an.oy + 0.012 * Math.sin(f.rel.trebClock * 0.8 + an.ph)) * N;
      angel(r, x, y, h, flap, an.s < 0.8 ? MID : FIG, w.halo > 0 ? WHITE : w.tintT > 0 && an === near ? w.tint : BRIGHT, u);
    }
    if (near) targets.push({ x: near.x * N - 0.1 * N * near.s, y: (near.y + near.oy) * N - 0.1 * N * near.s, w: 0.2 * N * near.s, h: 0.12 * N * near.s });
    // flares on the tonal hits, sparkles on the hats
    w.flares = w.flares.filter((q) => { q.life -= dt; flare(r, q.x, q.y, q.R * (0.4 + 1.2 * Math.max(0, q.life)), u, BRIGHT); return q.life > 0; });
    w.sparks = w.sparks.filter((q) => { q.t -= dt; r.rect(q.x * N - 2 * u, q.y * N, 5 * u, 1, WHITE); r.rect(q.x * N, q.y * N - 2 * u, 1, 5 * u, WHITE); return q.t > 0; });
    if (w.flares.length > 6) w.flares.splice(0, w.flares.length - 6);
    targets.push({ x: sx - R, y: sy - R, w: 2 * R, h: 2 * R });
  },
};

// ---------------------------------------------------------------------------------------------- chromeorbs
// Glossy spheres bouncing in a white void over a perspective grid: real gravity, a 0.75 restitution at the floor,
// a shadow on the grid under each (light from the upper left), a DARK→BRIGHT→WHITE highlight ramp. At every
// landing the floor pushes back just enough to land the next bounce on a beat (the push shows as a ring); a kick
// kicks the grounded ones up, a snare flares the glints, a tonal hit tints the nearest orb's dark side, the grid
// flashes on the beat. A drop lets a big one fall from above. How many and how big is rolled by the arousal band.
const ORBS = { trio: { n: 3, R: 0.28 }, six: { n: 6, R: 0.2 }, swarm: { n: 10, R: 0.13 } };
const ORBS_W = { trio: [3, 2, 1], six: [2, 3, 2], swarm: [0, 1, 3] };
const ORB_G = 6; // world units per second squared; the camera is one unit over the floor
const newOrb = (rnd, R, i, n) => ({ x: -0.8 + (1.6 * (i + 0.5)) / n + (rnd() - 0.5) * 0.2, z: 1.4 + rnd() * 1.8, R: R * (0.8 + rnd() * 0.4), y: 1.5 + rnd() * 1.5, vy: 0, vx: (rnd() - 0.5) * 0.1, beats: R > 0.25 ? 2 : 1, sq: 0, tint: -1, tintT: 0 });
function orbBounce(o, W, rings) {
  const { f, rnd, dt } = W, bps = bpsOf(f);
  o.y = o.R;
  o.vy = Math.abs(o.vy) * 0.75;
  o.sq = 1;
  if (Math.abs(o.x) > 0.9) o.vx = -Math.sign(o.x) * Math.abs(o.vx);
  o.vx = clamp(o.vx + (rnd() - 0.5) * 0.04, -0.15, 0.15); // a nudge at each bounce, never a random walk off the floor
  let want;
  if (beatLocked(f)) { const toNext = (1 - f.beat.phase) / bps, T = (toNext > 0.3 / bps ? toNext : toNext + 1 / bps) + (o.beats - 1) / bps; want = (ORB_G * (T + dt)) / 2; } // the stepped flight lasts 2v/g less one step
  else want = o.vy > 1.2 ? o.vy : 1.2 + rnd() * 2;
  if (want > o.vy) rings.push({ x: o.x, z: o.z, R: o.R * 0.8, life: 0.35 });
  o.vy = want;
}

const chromeorbs = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), kind = rollW(rnd, ORBS_W, band);
    Object.assign(w, { kind, orbs: Array.from({ length: ORBS[kind].n }, (_, i) => newOrb(rnd, ORBS[kind].R, i, ORBS[kind].n)), big: null, rings: [], glint: 0, flash: 0, sparks: [] });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), hz = 0.42 * N, F = N - hz, lx = -0.6, ly = -0.8;
    const all = w.big ? [...w.orbs, w.big] : w.orbs;
    for (const h of hits) {
      if (isLow(h)) { for (const o of all) if (o.y - o.R < 0.02) { o.vy = Math.max(o.vy, 2.5 * h.strength); w.rings.push({ x: o.x, z: o.z, R: o.R * 0.8, life: 0.3 }); } w.flash = 0.12; }
      else if (h.kind === 'snare') w.glint = 0.15;
      else if (h.kind === 'hat') { const o = pick(rnd, all); w.sparks.push({ o, t: 0.2 }); }
      else if (isTonal(h)) { let best = all[0]; for (const o of all) if (Math.abs(o.x - (h.x * 2 - 1)) < Math.abs(best.x - (h.x * 2 - 1))) best = o; best.tint = h.pc % 2 ? HOT : COOL; best.tintT = 0.45; }
    }
    if (f.section === 'drop') w.big = { x: 0, z: 2.2, R: 0.45, y: 3.2, vy: 0, vx: 0, beats: 2, sq: 0, tint: -1, tintT: 0, big: true };
    else if (f.section === 'change') { w.kind = rollW(rnd, ORBS_W, band); w.orbs = Array.from({ length: ORBS[w.kind].n }, (_, i) => newOrb(rnd, ORBS[w.kind].R, i, ORBS[w.kind].n)); w.big = null; }
    w.glint -= dt; w.flash -= dt;
    // the floor, its horizon and the vanishing light
    r.rect(0, hz, N, Math.max(1, u), LMID);
    gridFloor(r, N, hz, N / 2, 0, 6, 10, w.flash > 0 || f.beat.pulse > 0.85 ? MID : LMID, u);
    r.disc(N / 2, hz, (0.03 + 0.02 * f.beat.pulse) * N, BRIGHT);
    // motion: gravity, the floor, a bounce that lands on the beat
    const list = w.big ? [...w.orbs, w.big] : w.orbs;
    for (const o of list) {
      o.vy -= ORB_G * dt;
      o.y += o.vy * dt;
      o.x += o.vx * dt;
      if (o.y < o.R && o.vy < 0) { orbBounce(o, W, w.rings); if (o.big) { s.shake = Math.max(s.shake, 0.5); w.rings.push({ x: o.x, z: o.z, R: o.R * 1.5, life: 0.6 }); } }
      o.sq *= Math.exp(-dt * 12);
      o.tintT -= dt;
    }
    list.sort((p, q) => q.z - p.z);
    // the shadows and the floor rings first: they lie on the grid, a circle on the floor at depth z seen 1/z as tall as wide
    for (const o of list) { const gx = N / 2 + (F * o.x) / o.z, gy = hz + F / o.z, rr = (F * o.R) / o.z; ringFast(r, gx + rr * 0.15, gy, rr * (0.95 - 0.08 * (o.y - o.R)), 0, o.y - o.R < 0.6 ? DARK : MID, 1 / o.z); }
    w.rings = w.rings.filter((q) => { q.life -= dt; const gx = N / 2 + (F * q.x) / q.z, gy = hz + F / q.z, rr = (F * q.R) / q.z * (1.2 + 2 * (0.35 - Math.max(0, q.life))); ringFast(r, gx, gy, rr, rr - Math.max(1, u), COOL, 1 / q.z); return q.life > 0; });
    // the orbs, far to near; one squashes only while it touches the floor, wider and lower, its bottom on the floor
    let near = null;
    for (const o of list) {
      const d = F / o.z, cx = N / 2 + o.x * d, cy = hz + (1 - o.y) * d, R = o.R * d;
      const sq = 1 + 0.2 * o.sq * clamp(1 - (o.y - o.R) / (0.3 * o.R)), cyS = cy + R - R / sq;
      glossBall(r, cx, cyS, R, lx, ly, o.tintT > 0 ? o.tint : DARK, sq);
      if (w.glint > 0) r.disc(cx + lx * R * sq * 0.5, cyS + (ly * R * 0.5) / sq, Math.max(1, R * 0.3), WHITE);
      if (!near || o.z < near.z) near = o;
    }
    w.sparks = w.sparks.filter((q) => { q.t -= dt; const o = q.o, d = F / o.z, x = N / 2 + o.x * d, y = hz + (1 - o.y - o.R) * d; r.rect(x - 2 * u, y, 5 * u, 1, WHITE); r.rect(x, y - 2 * u, 1, 5 * u, WHITE); return q.t > 0; });
    if (near) { const d = F / near.z, R = near.R * d; targets.push({ x: N / 2 + near.x * d - R, y: hz + (1 - near.y) * d - R, w: 2 * R, h: 2 * R }); }
  },
};

// ---------------------------------------------------------------------------------------------- aerogloss
// Aero: blue water with light shafts from a sun in the corner, glossy bubbles rising from the bottom (they
// accelerate to a terminal speed that grows with their size, and wobble), grass swaying on the treble clock,
// small fish cruising and darting on snares, and a glossy capsule panel in the middle pulsing with the bass (its
// dots light with the level). A snare pops the biggest bubble (a ring), a kick blows a few more from the bottom,
// a hat glints the caustics, a tonal hit lights a fish. On a drop a wave sweeps across and pushes everything.
const AERO = { shallows: { rate: 2, fish: 2, grass: 10, amp: 0.8 }, reef: { rate: 4, fish: 4, grass: 18, amp: 1 }, fizz: { rate: 8, fish: 3, grass: 14, amp: 1.3 } };
const AERO_W = { shallows: [3, 2, 0], reef: [2, 3, 2], fizz: [0, 1, 3] };
const newFish = (rnd, N) => ({ x: rnd() * N, y: (0.25 + rnd() * 0.55) * N, vx: 0, vy: 0, dir: rnd() < 0.5 ? -1 : 1, ph: rnd() * TAU, lit: 0 });

const aerogloss = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a), kind = rollW(rnd, AERO_W, band);
    Object.assign(w, { kind, bubbles: [], pops: [], sparks: [], fish: Array.from({ length: 4 }, () => newFish(rnd, N)), grass: Array.from({ length: 18 }, (_, k) => ({ x: (k + rnd()) / 18, h: 0.12 + rnd() * 0.1, ph: rnd() * TAU })),
      px: 0, pv: 0, spawn: 0, wave: null, lit: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), K = AERO[w.kind], sx = 0.74 * N, sy = 0.1 * N;
    const blow = (x, n, big) => { for (let k = 0; k < n; k++) w.bubbles.push({ x: x + (rnd() - 0.5) * 6 * u, y: N + 2 * u, vy: 0, vx: 0, r: (big ? 2.5 : 1.2) * u * (0.6 + rnd()), ph: rnd() * TAU }); };
    for (const h of hits) {
      if (isLow(h)) { w.pv += 2.6 * h.strength; blow(h.x * N, 3, false); }
      else if (h.kind === 'snare') {
        let big = null;
        for (const b of w.bubbles) if (b.y < N && (!big || b.r > big.r)) big = b;
        if (big) { w.pops.push({ x: big.x, y: big.y, R: big.r, life: 0.3 }); w.bubbles.splice(w.bubbles.indexOf(big), 1); }
        const fi = pick(rnd, w.fish); fi.vx = fi.dir * 0.7 * N * h.strength; fi.vy = (rnd() - 0.5) * 15 * u;
      } else if (h.kind === 'hat') w.sparks.push({ x: rnd(), y: 0.2 + rnd() * 0.5, t: 0.2 });
      else if (isTonal(h)) pick(rnd, w.fish).lit = 0.3;
    }
    if (f.section === 'drop') { w.wave = -0.2 * N; blow(0.5 * N, 14, true); w.pv += 4.4; }
    else if (f.section === 'change') w.kind = rollW(rnd, AERO_W, band);
    spring(w, 'px', 'pv', 0, 60, 6, dt);
    // the wave front this frame runs from w0 to w1 and shoves what it passes, once
    const w0 = w.wave, w1 = w0 === null ? null : w0 + dt * 0.9 * N, swept = (x) => w0 !== null && x > w0 && x <= w1;
    // the light shafts and the sun
    for (let k = 0; k < 3; k++) {
      const a = 2.05 + k * 0.22 + 0.06 * Math.sin(f.rel.midClock * 0.5 + k), hw = 0.035, len = 1.6 * N;
      r.poly([[sx, sy], [sx + Math.cos(a - hw) * len, sy + Math.sin(a - hw) * len], [sx + Math.cos(a + hw) * len, sy + Math.sin(a + hw) * len]], LMID);
    }
    for (let k = 0; k < 28; k++) { // caustic dashes drifting with the treble
      const x = ((hash(k, 1) + f.rel.trebClock * 0.01 * (1 + (k % 3))) % 1) * N, y = (0.18 + 0.7 * hash(k, 2)) * N;
      r.rect(x, y, (2 + (k % 3)) * u, 1, LMID);
    }
    ringFast(r, sx, sy, 0.1 * N, 0.1 * N - Math.max(1, u), LMID);
    flare(r, sx, sy, (0.1 + 0.08 * f.level) * N, u, BRIGHT, false);
    r.disc(sx, sy, 0.045 * N, BRIGHT);
    r.disc(sx, sy, 0.02 * N, WHITE);
    // the grass, swaying on the treble clock and leaning with the treble
    for (let k = 0; k < K.grass; k++) {
      const g = w.grass[k], bx = g.x * N, bh = g.h * N * K.amp, sw = (0.25 * Math.sin(f.rel.trebClock * 0.9 + g.ph) + 0.2 * f.rel.trebDrive) * bh;
      r.stroke(bx, N, bx + sw * 0.3, N - bh * 0.5, 2 * u, HOT);
      r.stroke(bx + sw * 0.3, N - bh * 0.5, bx + sw, N - bh, 1.2 * u, HOT);
    }
    // the fish: a cruise, a dart on a snare that the drag brings back to the cruise, a turn at the edges
    for (let i = 0; i < K.fish; i++) {
      const fi = w.fish[i], cruise = 0.04 * N * (0.5 + f.level);
      if (swept(fi.x)) fi.vx += 0.3 * N;
      fi.vx = follow(fi.vx, fi.dir * cruise, dt, 0.5); fi.vy = follow(fi.vy, 0, dt, 0.4);
      fi.x += fi.vx * dt;
      fi.y = clamp(fi.y + (fi.vy + Math.sin(t * 0.8 + fi.ph) * 2 * u) * dt, 0.2 * N, 0.85 * N); // the darts stay in the water
      if (fi.x < 0.04 * N) { fi.dir = 1; fi.vx = Math.abs(fi.vx); } else if (fi.x > 0.96 * N) { fi.dir = -1; fi.vx = -Math.abs(fi.vx); }
      fi.lit -= dt;
      const len = 4 * u, c = fi.lit > 0 ? BRIGHT : COOL, d = fi.dir;
      ringFast(r, fi.x, fi.y, len, 0, c, 0.5);
      r.poly([[fi.x - d * len * 0.8, fi.y], [fi.x - d * len * 1.7, fi.y - len * 0.6], [fi.x - d * len * 1.7, fi.y + len * 0.6]], c);
      r.set(fi.x + d * len * 0.5, fi.y - u * 0.5, FIG);
    }
    // the capsule panel: a shadow, the body, the gloss, the dots lit with the level
    const scale = 1 + 0.08 * w.px + 0.05 * f.rel.bassDrive + 0.03 * f.beat.pulse, pw = 0.46 * N * scale, ph = 0.1 * N * scale, px0 = 0.5 * N - pw / 2, py0 = 0.55 * N - ph / 2;
    rrect(r, px0 + 2 * u, py0 + 3 * u, pw, ph, ph / 2, DARK);
    rrect(r, px0, py0, pw, ph, ph / 2, MID);
    rrect(r, px0 + u, py0 + u, pw - 2 * u, ph * 0.45, ph * 0.4, LMID);
    r.rect(px0 + ph * 0.4, py0 + 1.5 * u, pw - 0.8 * ph, Math.max(1, u), BRIGHT);
    w.lit = follow(w.lit, f.level, dt, 0.1);
    for (let i = 0; i < 8; i++) r.disc(px0 + ph * 0.5 + ((pw - ph) * (i + 0.5)) / 8, py0 + ph * 0.68, Math.max(1, 1.3 * u), (i + 0.5) / 8 < w.lit ? BRIGHT : DARK);
    targets.push({ x: px0, y: py0, w: pw, h: ph });
    // the bubbles: buoyancy toward a terminal speed that grows with the size, a wobble, a pop at the surface
    w.spawn += dt * K.rate * (0.5 + f.rel.trebDrive);
    while (w.spawn > 1 && w.bubbles.length < 40) { w.spawn--; blow(rnd() * N, 1, rnd() < 0.3); }
    w.spawn = Math.min(w.spawn, 2);
    let biggest = null;
    w.bubbles = w.bubbles.filter((b) => {
      const vt = (0.06 + 0.05 * (b.r / u)) * N;
      b.vy += (-vt - b.vy) * 3 * dt;
      b.vx = follow(b.vx, Math.sin(t * 5 + b.ph) * b.r * 12.6, dt, 1 / 3);
      b.y += b.vy * dt; b.x += b.vx * dt;
      if (swept(b.x)) b.vx += 0.6 * N;
      if (b.y < b.r + 0.02 * N || b.x < -b.r || b.x > N + b.r) { w.pops.push({ x: b.x, y: b.y, R: b.r, life: 0.2 }); return false; }
      ringFast(r, b.x, b.y, b.r, Math.max(0, b.r - Math.max(1, u)), LMID);
      if (b.r > 2 * u) { r.disc(b.x - b.r * 0.4, b.y - b.r * 0.4, Math.max(1, b.r * 0.25), BRIGHT); r.set(b.x + b.r * 0.35, b.y + b.r * 0.35, MID); }
      if (!biggest || b.r > biggest.r) biggest = b;
      return true;
    });
    if (biggest) targets.push({ x: biggest.x - biggest.r, y: biggest.y - biggest.r, w: 2 * biggest.r, h: 2 * biggest.r });
    w.pops = w.pops.filter((p) => { p.life -= dt; const R = p.R * (1 + 3 * (0.3 - Math.max(0, p.life))); ringFast(r, p.x, p.y, R, R - 1, BRIGHT); return p.life > 0; });
    w.sparks = w.sparks.filter((q) => { q.t -= dt; r.rect(q.x * N - 2 * u, q.y * N, 5 * u, 1, WHITE); r.rect(q.x * N, q.y * N - 2 * u, 1, 5 * u, WHITE); return q.t > 0; });
    // the wave of a drop: a lighter front sweeping left to right, dithered thinner toward its tail
    if (w.wave !== null) { // (it starts off the left edge, so `null` and not a negative x says there is none)
      w.wave = w1;
      const bw = 0.15 * N, x0 = Math.max(0, Math.round(w.wave - bw)), x1 = Math.min(N, Math.round(w.wave)), buf = r.buf;
      for (let x = x0; x < x1; x++) {
        const p = (w.wave - x) / bw, top = (0.05 + 0.04 * Math.sin(t * 9 + (x * 0.3) / u)) * N;
        for (let y = Math.max(0, top | 0); y < N; y++) if (bayer(x, y) < (1 - p) * 0.75) buf[y * N + x] = p < 0.12 ? BRIGHT : LMID;
      }
      if (w.wave > 1.3 * N) w.wave = null;
    }
  },
};

// ---------------------------------------------------------------------------------------------- chrometunnel
// A tunnel of chrome rings receding to a bright end, one ring spacing per beat: with the beat locked the rings sit
// at integer depths minus the beat phase, so a ring passes the camera on every beat; sizes and thickness go with
// 1/z, the tunnel curves gently on the mid clock. Between the rings wireframe hearts, stars or butterflies tumble
// in true 3D (two rotations, then the projection). A kick lurches the camera, a snare spins the shapes, a tonal
// hit flashes the nearest ring HOT or COOL, a hat glints one. On a drop the tunnel bends away and more shapes come.
function loopOf(n, fn) { const a = new Float32Array(2 * n); for (let i = 0; i < n; i++) { const [x, y] = fn(i / n); a[2 * i] = x; a[2 * i + 1] = y; } return a; }
const SHAPES = {
  heart: [loopOf(28, (p) => { const t = p * TAU; return [(16 * Math.sin(t) ** 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]; })],
  star: [loopOf(10, (p) => { const t = p * TAU - Math.PI / 2, rr = Math.round(p * 10) % 2 ? 0.45 : 1; return [Math.cos(t) * rr, Math.sin(t) * rr]; })],
  fly: [...[[0.45, -0.3, 0.5], [-0.45, -0.3, 0.5], [0.33, 0.42, 0.33], [-0.33, 0.42, 0.33]].map(([cx, cy, rr]) => loopOf(10, (p) => [cx + Math.cos(p * TAU) * rr, cy + Math.sin(p * TAU) * rr * 0.8])),
    Float32Array.from([0, -0.9, 0, 0.8])],
};
const TUNNEL = { hearts: { motif: 'heart', rings: 10, shapes: 2 }, stars: { motif: 'star', rings: 12, shapes: 3 }, flutter: { motif: 'fly', rings: 14, shapes: 3 } };
const TUNNEL_W = { hearts: [3, 2, 1], stars: [1, 2, 3], flutter: [2, 2, 2] };
const newShape = (rnd, motif, zmax) => ({ motif, z: 2 + rnd() * (zmax - 3), ang: rnd() * TAU, angX: (rnd() - 0.5) * 0.8, spin: 0.8 + rnd() * 1.2, ox: (rnd() - 0.5) * 0.9, oy: (rnd() - 0.5) * 0.9, c: pick(rnd, [HOT, COOL, BRIGHT]) });

const chrometunnel = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), kind = rollW(rnd, TUNNEL_W, band), K = TUNNEL[kind];
    Object.assign(w, { kind, ph: 0, lurch: 0, bx: 0, by: 0, bend: 0, spinV: 0, flashT: 0, flashC: HOT, glintK: -1, glintT: 0, heavy: 0,
      shapes: Array.from({ length: K.shapes }, () => newShape(rnd, K.motif, K.rings)) });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), K = TUNNEL[w.kind], zmax = K.rings + 1, locked = beatLocked(f);
    for (const h of hits) {
      if (isLow(h)) { w.lurch = Math.max(w.lurch, h.strength); s.shake = Math.max(s.shake, 0.2 * h.strength); }
      else if (h.kind === 'snare') w.spinV += 6 * h.strength;
      else if (h.kind === 'hat') { w.glintK = Math.floor(rnd() * K.rings); w.glintT = 0.15; }
      else if (isTonal(h)) { w.flashT = 0.3; w.flashC = h.pc % 2 ? HOT : COOL; }
    }
    if (f.section === 'drop') { const a = rnd() * TAU; w.bx = Math.cos(a); w.by = Math.sin(a) * 0.6; w.bend = 1; w.heavy = 8; }
    else if (f.section === 'change') { w.kind = rollW(rnd, TUNNEL_W, band); for (const sh of w.shapes) sh.motif = TUNNEL[w.kind].motif; }
    const speed = locked ? bpsOf(f) : 1 + 2 * energy(f);
    if (!locked) w.ph = (w.ph + speed * dt) % 1;
    const phase = locked ? f.beat.phase : w.ph;
    w.lurch *= Math.exp(-dt * 5); w.bend *= Math.exp(-dt / 1.5); w.spinV *= Math.exp(-dt * 1.5); w.flashT -= dt; w.glintT -= dt; w.heavy -= dt;
    const sway = 0.12 * Math.sin(f.rel.midClock * 0.3), swayY = 0.08 * Math.cos(f.rel.midClock * 0.23), bend = ease(w.bend) * 0.4;
    const cxAt = (z) => N / 2 + (sway + w.bx * bend) * N * (z / zmax) ** 2, cyAt = (z) => N / 2 + (swayY + w.by * bend) * N * (z / zmax) ** 2;
    const zOf = (k) => Math.max(0.3, k + 1 - phase - 0.3 * w.lurch);
    // the bright end, then the rings far to near
    const ex = cxAt(zmax), ey = cyAt(zmax), eR = (0.045 + 0.03 * f.beat.pulse) * N;
    ringFast(r, ex, ey, eR * 1.8, eR * 1.8 - Math.max(1, u), LMID);
    r.disc(ex, ey, eR, BRIGHT);
    r.disc(ex, ey, eR * 0.5, WHITE);
    const want = K.shapes + (w.heavy > 0 ? 3 : 0);
    while (w.shapes.length < want) w.shapes.push(newShape(rnd, K.motif, zmax));
    let nearK = 0; // the nearest ring still inside the frame: the one a tonal hit flashes
    while (nearK < K.rings - 1 && (0.5 * N) / zOf(nearK) > 0.8 * N) nearK++;
    // a shape in 3D: turned about y, then x, half a size of SZ world units in all three axes, then each point at 1/z
    const SZ = 0.22, drawShape = (sh) => {
      const loops = SHAPES[sh.motif], ca = Math.cos(sh.ang), sa = Math.sin(sh.ang), cb = Math.cos(sh.angX), sb = Math.sin(sh.angX), size = SZ * N, oxs = sh.ox * 0.5 * N, oys = sh.oy * 0.5 * N;
      let bx0 = N, by0 = N, bx1 = 0, by1 = 0;
      for (const L of loops) {
        const n = L.length / 2;
        let px = 0, py = 0;
        for (let i = 0; i <= n; i++) {
          const j = i % n, x = L[2 * j], y = L[2 * j + 1], x1 = x * ca, z1 = -x * sa, y2 = y * cb - z1 * sb, z2 = y * sb + z1 * cb, d = 1 / (sh.z + z2 * SZ);
          const sx = cxAt(sh.z) + (oxs + x1 * size) * d, sy = cyAt(sh.z) + (oys + y2 * size) * d;
          if (i && (n > 2 || i === 1)) r.line(px, py, sx, sy, sh.c);
          if (sx < bx0) bx0 = sx; if (sx > bx1) bx1 = sx; if (sy < by0) by0 = sy; if (sy > by1) by1 = sy;
          if (n === 2 && i === 1) break;
          px = sx; py = sy;
        }
      }
      if (sh === w.shapes[0]) targets.push({ x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 });
    };
    for (let k = K.rings - 1; k >= 0; k--) {
      const z = zOf(k), rad = (0.55 * N) / z, th = Math.max(1, (0.05 * N) / z), cx = cxAt(z), cy = cyAt(z);
      // first the shapes between this ring and the one behind it, so this ring and the nearer ones pass over them
      for (const sh of w.shapes) if (sh.z > z && (k === K.rings - 1 || sh.z <= zOf(k + 1))) drawShape(sh);
      if (rad - th > 0.8 * N) continue; // past the camera's frame
      const lit = w.flashT > 0 && k === nearK ? w.flashC : LMID;
      ringFast(r, cx, cy, rad + th / 2, rad - th / 2, DARK);
      ringFast(r, cx, cy - th * 0.35, rad + th / 2, rad - th / 2, lit);
      r.disc(cx, cy - rad, th * (w.glintT > 0 && w.glintK === k ? 0.9 : 0.55), WHITE);
      r.disc(cx - rad * 0.7, cy - rad * 0.7, th * 0.35, BRIGHT);
      r.disc(cx + rad * 0.7, cy - rad * 0.7, th * 0.35, BRIGHT);
    }
    for (const sh of w.shapes) if (sh.z <= zOf(0)) drawShape(sh); // nearer than the nearest ring
    // the shapes come on with the rings and turn; past the camera they go back to the far end
    w.shapes = w.shapes.filter((sh, i) => {
      sh.z -= speed * dt;
      sh.ang += (sh.spin + w.spinV) * dt;
      sh.angX += 0.4 * dt;
      if (sh.z < 0.5) { if (i >= want) return false; Object.assign(sh, newShape(rnd, K.motif, zmax), { z: zmax - 0.5 }); }
      return true;
    });
  },
};

// ---------------------------------------------------------------------------------------------- butterflies
// A swarm of holographic butterflies around a floating light: boids-lite (apart from the close ones, along with
// the neighbours, toward an orbit around the light, kept inside the frame, speed capped), wings beating once a
// beat each with its own phase, short fading trails, colours by pitch class (a tonal hit recolours the ones near
// where it landed). A kick flares the light and pushes them out, a snare scatters the headings and snaps the wings
// open, a hat sparkles one. On a drop they burst outward and come back to the light over four bars.
const FLOCK = { few: { n: 14, vmax: 0.16 }, swarm: { n: 26, vmax: 0.2 }, storm: { n: 40, vmax: 0.26 } };
const FLOCK_W = { few: [3, 2, 0], swarm: [2, 3, 2], storm: [0, 1, 3] };
const FLY_COLS = [HOT, COOL, BRIGHT], TL = 10;
const newFly = (rnd, N) => ({ x: rnd() * N, y: rnd() * N, vx: (rnd() - 0.5) * 0.1 * N, vy: (rnd() - 0.5) * 0.1 * N, ph: rnd() * TAU, c: Math.floor(rnd() * 3), tr: new Float32Array(2 * TL).fill(-9), th: 0, sz: 0.8 + rnd() * 0.5 });

const butterflies = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a), kind = rollW(rnd, FLOCK_W, band);
    Object.assign(w, { kind, flies: Array.from({ length: FLOCK[kind].n }, () => newFly(rnd, N)), scatter: 0, flareT: 0, boost: 0, sparks: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), K = FLOCK[w.kind], bps = bpsOf(f), locked = beatLocked(f);
    const lx = N / 2 + 0.2 * N * Math.sin(f.rel.midClock * 0.35), ly = N / 2 + 0.15 * N * Math.cos(f.rel.midClock * 0.27);
    const away = (b, sp) => { const dx = b.x - lx, dy = b.y - ly, d = Math.hypot(dx, dy) || 1; b.vx += (dx / d) * sp; b.vy += (dy / d) * sp; };
    for (const h of hits) {
      if (isLow(h)) { w.flareT = 0.25; for (const b of w.flies) away(b, 0.15 * N * h.strength); }
      else if (h.kind === 'snare') { w.boost = 0.12; for (const b of w.flies) { const a = (rnd() - 0.5) * 1.2, c = Math.cos(a), sn = Math.sin(a), vx = b.vx; b.vx = vx * c - b.vy * sn; b.vy = vx * sn + b.vy * c; } }
      else if (h.kind === 'hat') w.sparks.push({ b: pick(rnd, w.flies), t: 0.2 });
      else if (isTonal(h)) {
        const hx = h.x * N, hy = h.y * N, ci = h.pc % 3;
        let any = false, best = w.flies[0];
        for (const b of w.flies) { const d = Math.hypot(b.x - hx, b.y - hy); if (d < 0.25 * N) { b.c = ci; any = true; } if (d < Math.hypot(best.x - hx, best.y - hy)) best = b; }
        if (!any) best.c = ci;
      }
    }
    if (f.section === 'drop') { w.scatter = 1; for (const b of w.flies) away(b, 0.6 * N); }
    else if (f.section === 'change') w.kind = rollW(rnd, FLOCK_W, band);
    const want = FLOCK[w.kind].n;
    if (w.flies.length < want) w.flies.push(Object.assign(newFly(rnd, N), { x: lx, y: ly })); else if (w.flies.length > want) w.flies.pop();
    w.scatter = Math.max(0, w.scatter - dt / (16 / bps));
    w.flareT -= dt; w.boost -= dt;
    // the light
    const LR = (2.5 + 1.5 * f.beat.pulse) * u;
    ringFast(r, lx, ly, LR * 2.2, LR * 2.2 - Math.max(1, u), LMID);
    r.disc(lx, ly, LR, BRIGHT);
    r.disc(lx, ly, LR * 0.5, WHITE);
    if (w.flareT > 0) flare(r, lx, ly, (8 + 10 * w.flareT) * u, u, BRIGHT);
    // the flock
    const flies = w.flies, n = flies.length, vmax = K.vmax * N * (0.6 + 0.6 * f.level), near2 = (0.15 * N) ** 2, sep = 6 * u, sep2 = sep * sep, mg = 0.06 * N;
    const coh = (1 - w.scatter) * 1.8, orbit = 0.12 * N, ph0 = locked ? f.beat.phase : t * 1.6;
    for (let i = 0; i < n; i++) {
      const b = flies[i];
      let ax = 0, ay = 0, avx = 0, avy = 0, cnt = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const o = flies[j], dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 > near2) continue;
        cnt++; avx += o.vx; avy += o.vy;
        if (d2 < sep2) { const d = Math.sqrt(d2) + 0.01; ax -= (dx / d) * (sep - d) * 40; ay -= (dy / d) * (sep - d) * 40; }
      }
      if (cnt) { ax += (avx / cnt - b.vx) * 1.5; ay += (avy / cnt - b.vy) * 1.5; }
      const dx = lx - b.x, dy = ly - b.y, d = Math.hypot(dx, dy) || 1;
      ax += (dx / d) * (d - orbit) * coh + (-dy / d) * 0.5 * vmax;
      ay += (dy / d) * (d - orbit) * coh + (dx / d) * 0.5 * vmax;
      if (b.x < mg) ax += (mg - b.x) * 8; else if (b.x > N - mg) ax -= (b.x - N + mg) * 8;
      if (b.y < mg) ay += (mg - b.y) * 8; else if (b.y > N - mg) ay -= (b.y - N + mg) * 8;
      b.vx += ax * dt; b.vy += ay * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > vmax) { b.vx *= vmax / sp; b.vy *= vmax / sp; }
      b.x = clamp(b.x + b.vx * dt, -0.05 * N, 1.05 * N); b.y = clamp(b.y + b.vy * dt, -0.05 * N, 1.05 * N);
      // the trail, dimmer behind
      b.tr[2 * b.th] = b.x; b.tr[2 * b.th + 1] = b.y; b.th = (b.th + 1) % TL;
      const dim = FLY_COLS[b.c] + DIM;
      for (let k = 2; k < TL; k += 2) { const q = (b.th - 1 - k + 2 * TL) % TL; r.set(b.tr[2 * q], b.tr[2 * q + 1], dim); }
      // the wings about the heading, spread by the beat
      const hd = Math.atan2(b.vy, b.vx), ca = Math.cos(hd), sa = Math.sin(hd), flap = w.boost > 0 ? 1 : 0.5 + 0.5 * Math.cos(TAU * ph0 + b.ph), spd = (0.2 + 0.8 * flap) * b.sz, S = 4 * u * b.sz;
      const col = hash(i, (t * 10) | 0) < 0.12 ? WHITE : FLY_COLS[b.c];
      const P = (fx, fy) => [b.x + fx * ca - fy * sa, b.y + fx * sa + fy * ca];
      for (const dd of [-1, 1]) {
        r.poly([P(0.4 * S, 0), P(0.9 * S, dd * 1.1 * S * spd), P(-0.2 * S, dd * S * spd), P(-0.3 * S, 0)], col);
        r.poly([P(-0.2 * S, 0), P(-0.5 * S, dd * 0.8 * S * spd), P(-1.0 * S, dd * 0.5 * S * spd), P(-0.8 * S, 0)], col);
      }
      const [hx, hy] = P(0.6 * S, 0), [tx, ty] = P(-0.7 * S, 0);
      r.line(hx, hy, tx, ty, FIG);
    }
    w.sparks = w.sparks.filter((q) => { q.t -= dt; const b = q.b; r.rect(b.x - 3 * u, b.y, 7 * u, 1, WHITE); r.rect(b.x, b.y - 3 * u, 1, 7 * u, WHITE); return q.t > 0; });
    if (n) targets.push({ x: flies[0].x - 5 * u, y: flies[0].y - 5 * u, w: 10 * u, h: 10 * u });
    targets.push({ x: lx - LR * 2, y: ly - LR * 2, w: LR * 4, h: LR * 4 });
  },
};

// ---------------------------------------------------------------------------------------------- halo
// A giant torus halo in perspective: a ring of small quads tilted toward us, one lit segment running around once
// a bar with a fading tail, the far side dark, the near side drawn over the figure standing inside it; rays turn
// behind on the mid clock, stars twinkle. A kick raises the figure's arms (a spring) and brightens the rays, a
// snare flashes every segment, a tonal hit colours the lit one, a hat glints a star. On a drop the halo tilts to
// face the camera and spins up, the arms stay raised. The size, a counter-turning inner ring and a floating figure
// come with the arousal band.
const HALOS = { shrine: { R: 0.22, tube: 0.03, S: 40, inner: false, float: 0 }, seraph: { R: 0.3, tube: 0.035, S: 48, inner: true, float: 0 }, ascend: { R: 0.34, tube: 0.04, S: 56, inner: true, float: 1 } };
const HALO_W = { shrine: [3, 2, 1], seraph: [2, 3, 2], ascend: [1, 2, 3] };

const halo = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, HALO_W, band), tilt: 1.15, spinX: 0, spinV: 0, drop: 0, flash: 0, arm: 0, armV: 0, rays: 0, litC: WHITE, litT: 0, twinkle: [],
      stars: Array.from({ length: 40 }, (_, i) => [hash(i, 7), hash(i, 8) * 0.75]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), K = HALOS[w.kind], cx = N / 2, cy = 0.42 * N;
    for (const h of hits) {
      if (isLow(h)) { w.armV += 4.5 * h.strength; w.rays = 0.25; }
      else if (h.kind === 'snare') w.flash = 0.15;
      else if (h.kind === 'hat') w.twinkle.push({ i: Math.floor(rnd() * 40), t: 0.2 });
      else if (isTonal(h)) { w.litC = h.pc % 2 ? HOT : COOL; w.litT = 0.5; }
    }
    if (f.section === 'drop') { w.drop = 3.5; w.spinV += 6; s.shake = Math.max(s.shake, 0.3); }
    else if (f.section === 'change') w.kind = rollW(rnd, HALO_W, band);
    w.drop -= dt; w.flash -= dt; w.rays -= dt; w.litT -= dt;
    w.tilt = follow(w.tilt, w.drop > 0 ? 0.15 : 1.15, dt, w.drop > 0 ? 0.3 : 1.2);
    w.spinV *= Math.exp(-dt * 0.8);
    w.spinX += w.spinV * dt;
    spring(w, 'arm', 'armV', w.drop > 0 ? 1 : 0, 40, 5, dt);
    const spin = f.rel.midClock * 0.2 + w.spinX;
    // the stars and the rays behind everything
    for (let i = 0; i < 40; i++) { const [px, py] = w.stars[i]; r.set(px * N, py * N, hash(i, (t * 2) | 0) > 0.85 ? BRIGHT : MID); }
    w.twinkle = w.twinkle.filter((q) => { q.t -= dt; const [px, py] = w.stars[q.i]; r.rect(px * N - 2 * u, py * N, 5 * u, 1, WHITE); r.rect(px * N, py * N - 2 * u, 1, 5 * u, WHITE); return q.t > 0; });
    const rc = w.rays > 0 ? MID : DARK, ra = f.rel.midClock * 0.1;
    for (let k = 0; k < 8; k++) { const a = ra + (k * TAU) / 8, hw = 0.04, len = 1.5 * N; r.poly([[cx, cy], [cx + Math.cos(a - hw) * len, cy + Math.sin(a - hw) * len], [cx + Math.cos(a + hw) * len, cy + Math.sin(a + hw) * len]], rc); }
    // the segments: the far half, the figure, the near half; the lit one runs around once a bar
    const R = K.R * N * (1 + 0.02 * f.beat.pulse), tw = K.tube * N, F = 2.2 * R, ct = Math.cos(w.tilt), st = Math.sin(w.tilt), S = K.S, litK = Math.floor(barPhase(f, t) * S);
    const segs = (Rr, tube, sp, dir, pass) => {
      for (let k = 0; k < S; k++) {
        const a0 = (k / S) * TAU * dir + sp, a1 = ((k + 1) / S) * TAU * dir + sp;
        if ((Math.sin((a0 + a1) / 2) * st > 0) !== (pass === 0)) continue;
        const back = (((litK - k) % S) + S) % S, c = w.flash > 0 ? BRIGHT : back === 0 ? (w.litT > 0 ? w.litC : WHITE) : back < 3 ? BRIGHT : back < 6 ? LMID : pass === 0 ? DARK : MID;
        const pts = [];
        for (const [a, rr] of [[a0, Rr - tube / 2], [a1, Rr - tube / 2], [a1, Rr + tube / 2], [a0, Rr + tube / 2]]) {
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr, d = F / (F + y * st);
          pts.push([cx + x * d, cy + y * ct * d]);
        }
        r.poly(pts, c);
      }
    };
    const fh = 0.42 * N, lift = K.float ? (0.05 + 0.01 * Math.sin(f.rel.trebClock * 0.6)) * N : 0, base = 0.86 * N - lift, hw = 0.06 * N;
    if (K.float) ringFast(r, cx, 0.86 * N, 0.1 * N, 0, LMID, 0.25); // the light under the feet it floats on
    segs(R, tw, spin, 1, 0);
    if (K.inner) segs(R * 0.62, tw * 0.6, -spin * 1.3, -1, 0);
    r.poly([[cx - hw * 0.6, base - fh * 0.72], [cx + hw * 0.6, base - fh * 0.72], [cx + hw * 1.3, base], [cx - hw * 1.3, base]], FIG);
    r.disc(cx, base - fh * 0.82, fh * 0.085, FIG);
    const sy0 = base - fh * 0.68, aa = lerp(0.25, 2.2, clamp(w.arm));
    for (const d of [-1, 1]) r.stroke(cx + d * hw * 0.6, sy0, cx + d * (hw * 0.6 + Math.sin(aa) * fh * 0.3), sy0 + Math.cos(aa) * fh * 0.3, Math.max(1, 1.5 * u), FIG);
    if (K.inner) segs(R * 0.62, tw * 0.6, -spin * 1.3, -1, 1);
    segs(R, tw, spin, 1, 1);
    targets.push({ x: cx - hw * 1.3, y: base - fh * 0.92, w: hw * 2.6, h: fh * 0.92 });
  },
};

// ---------------------------------------------------------------------------------------------- heartmonitor
// A glossy winged heart over a monitor panel. The heart beats on kicks (a scale impulse into a decaying spring),
// the wings flap on snares (another spring), sparkles fly off it with gravity; below, an ECG trace scrolls at a
// speed tied to the tempo with a real QRS spike written in at every kick and a small bump at every hat, a blip on
// the beat, a meter of bars at the right. On a drop the trace goes flat for one beat and the heart stops; then
// one big beat. The size of the heart and the speed of the trace come with the arousal band.
const HEARTS = { calm: { hs: 0.11, speed: 0.2, spark: 3 }, pulse: { hs: 0.13, speed: 0.25, spark: 6 }, racing: { hs: 0.15, speed: 0.33, spark: 10 } };
const HEARTS_W = { calm: [3, 2, 0], pulse: [2, 3, 2], racing: [0, 1, 3] };
const QRS = [[0, 0], [0.12, -0.12], [0.22, 0], [0.35, 1], [0.48, -0.3], [0.58, 0], [0.8, 0.18], [1, 0]];
const qrs = (p) => { for (let i = 1; i < QRS.length; i++) if (p <= QRS[i][0]) return lerp(QRS[i - 1][1], QRS[i][1], (p - QRS[i - 1][0]) / (QRS[i][0] - QRS[i - 1][0])); return 0; };
function heartShape(r, hx, hy, S, c) {
  r.disc(hx - 0.5 * S, hy - 0.35 * S, 0.52 * S, c);
  r.disc(hx + 0.5 * S, hy - 0.35 * S, 0.52 * S, c);
  r.poly([[hx - 0.98 * S, hy - 0.2 * S], [hx + 0.98 * S, hy - 0.2 * S], [hx, hy + 0.9 * S]], c);
}

const heartmonitor = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, HEARTS_W, band), N, hs: 1, hv: 0, fl: 0, flv: 0, ecg: new Float32Array(N), head: 0, sp: -1, spA: 1, bp: -1, flat: 0, big: false, sparks: [], glints: [], blip: 0, tint: BRIGHT, tintT: 0, lv: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), K = HEARTS[w.kind], bps = bpsOf(f);
    if (w.N !== N) { w.N = N; w.ecg = new Float32Array(N); }
    const hx = 0.5 * N, hy = 0.32 * N;
    for (const h of hits) {
      if (w.flat > 0) continue; // the flatline: nothing gets through
      if (isLow(h)) { w.hv += 5 * h.strength; w.sp = 0; w.spA = 0.7 + 0.5 * h.strength; burst(w.sparks, rnd, hx + (rnd() - 0.5) * 0.2 * N, hy, K.spark, 0.3 * N, BRIGHT, 0.5); }
      else if (h.kind === 'snare') w.flv += 12 * h.strength;
      else if (h.kind === 'hat') { w.bp = 0; w.glints.push({ x: hx + (rnd() - 0.5) * 0.4 * N, y: hy + (rnd() - 0.5) * 0.3 * N, t: 0.2 }); }
      else if (isTonal(h)) { w.tint = h.pc % 2 ? HOT : COOL; w.tintT = 0.4; }
    }
    if (f.section === 'drop') { w.flat = 1 / bps; w.big = true; w.sp = -1; w.bp = -1; }
    else if (f.section === 'change') w.kind = rollW(rnd, HEARTS_W, band);
    if (w.flat > 0 && (w.flat -= dt) <= 0 && w.big) { // the big beat after the flatline
      w.big = false; w.hv += 12; w.sp = 0; w.spA = 1.6; w.flv += 17; s.shake = Math.max(s.shake, 0.5);
      burst(w.sparks, rnd, hx, hy, 24, 0.45 * N, WHITE, 0.7);
    }
    const flat = w.flat > 0;
    spring(w, 'hs', 'hv', flat ? 0.9 : 1, 120, 8, dt);
    spring(w, 'fl', 'flv', 0, 60, 6, dt);
    w.tintT -= dt; w.blip -= dt;
    if (f.beat.on) w.blip = 0.15;
    // the monitor panel: a rounded dark slab with a dot grid, the trace, the head blip, the meter
    const px0 = 0.05 * N, py0 = 0.62 * N, pw = 0.9 * N, ph = 0.33 * N, yb = py0 + ph * 0.55, A = ph * 0.4, step = Math.max(3, Math.round(6 * u));
    rrect(r, px0, py0, pw, ph, 3 * u, DARK);
    for (let y = py0 + step; y < py0 + ph - u; y += step) for (let x = px0 + step; x < px0 + pw - 0.12 * N; x += step) r.set(x, y, MID + DIM);
    const tx0 = Math.round(px0 + 2 * u), tx1 = Math.round(px0 + pw - 0.12 * N), ecg = w.ecg, spL = Math.max(6, 10 * u), bpL = Math.max(4, 7 * u);
    w.head += dt * K.speed * N * bps;
    while (w.head >= 1) {
      w.head--;
      ecg.copyWithin(tx0, tx0 + 1, tx1);
      let v = flat ? 0 : (hash(t * 1000 | 0, tx1) - 0.5) * 0.03;
      if (w.sp >= 0) { v += w.spA * qrs(w.sp / spL); if (++w.sp > spL) w.sp = -1; }
      if (w.bp >= 0) { v += 0.12 * Math.sin((Math.PI * w.bp) / bpL); if (++w.bp > bpL) w.bp = -1; }
      ecg[tx1 - 1] = v;
    }
    for (let x = tx0; x < tx1 - 1; x++) r.line(x, yb - ecg[x] * A, x + 1, yb - ecg[x + 1] * A, flat ? BRIGHT : COOL);
    r.rect(tx1 - 1, yb - ecg[tx1 - 1] * A - u, Math.max(1, 1.5 * u), Math.max(1, 2 * u), WHITE);
    if (w.blip > 0) r.disc(tx1 - 1, py0 + 2.5 * u, Math.max(1, 1.2 * u), BRIGHT);
    w.lv = follow(w.lv, f.level, dt, 0.1);
    const bars = [f.rel.bassDrive, f.rel.midDrive, f.rel.trebDrive, w.lv, Math.min(1, f.onsetRate / 8)];
    for (let i = 0; i < 5; i++) { const bh = clamp(bars[i]) * ph * 0.7, bx = px0 + pw - 0.1 * N + i * 0.018 * N; r.rect(bx, py0 + ph * 0.85 - bh, Math.max(1, 1.2 * u), bh, i === 3 ? BRIGHT : COOL); }
    // the wings, then the heart over their roots; the flap turns the feathers about the shoulders
    const S = K.hs * N * w.hs, fold = flat ? 0.6 : 0, feathers = [[1.7, 0.3], [1.45, 0.55], [1.1, 0.8]];
    for (const d of [-1, 1]) {
      const sx = hx + d * 0.75 * S, sy = hy - 0.3 * S;
      for (let k = 2; k >= 0; k--) {
        const [len, a0] = feathers[k], a = -a0 + 0.55 * w.fl + fold, Lf = len * S, dx = Math.cos(a) * d, dy = Math.sin(a), wd = 0.22 * S;
        r.poly([[sx, sy], [sx + dx * Lf * 0.5 - dy * wd * d, sy + dy * Lf * 0.5 + dx * wd * d], [sx + dx * Lf, sy + dy * Lf], [sx + dx * Lf * 0.5 + dy * wd * d, sy + dy * Lf * 0.5 - dx * wd * d]], k === 2 ? LMID : BRIGHT);
        if (k === 0 && w.tintT > 0) r.disc(sx + dx * Lf, sy + dy * Lf, Math.max(1, 1.5 * u), w.tint);
      }
    }
    heartShape(r, hx, hy + 0.02 * S, S * 1.08, DARK);
    heartShape(r, hx, hy, S, flat ? HOT + DIM : HOT);
    r.poly([[hx - 0.9 * S, hy + 0.08 * S], [hx + 0.9 * S, hy + 0.08 * S], [hx, hy + 0.9 * S]], HOT + DIM);
    r.disc(hx - 0.55 * S, hy - 0.55 * S, S * (0.14 + 0.06 * f.beat.pulse), WHITE);
    r.disc(hx - 0.25 * S, hy - 0.62 * S, Math.max(1, S * 0.07), BRIGHT);
    w.sparks = particles(W, w.sparks, BRIGHT);
    w.glints = w.glints.filter((q) => { q.t -= dt; r.rect(q.x - 2 * u, q.y, 5 * u, 1, WHITE); r.rect(q.x, q.y - 2 * u, 1, 5 * u, WHITE); return q.t > 0; });
    targets.push({ x: hx - S, y: hy - 0.9 * S, w: 2 * S, h: 1.8 * S });
  },
};

// ---------------------------------------------------------------------------------------------- liminalpool
// An empty tiled pool room in one-point perspective: a far wall with a door, side walls with a tile band, a
// ceiling with fluorescent tubes, a tiled floor with a basin cut into it. The pool floor carries caustics, a
// per-pixel sum of three sines whose phases run on the bass; the water (dry, half full or overflowing by the
// arousal band, and the level moves when it changes) is dithered over it so the floor shows through. A lone ring
// drifts and bobs on the water, a snare drips a ripple, a hat flickers a tube, a kick sags the lights and lifts
// the caustics, the meniscus flashes on the beat. On a drop the far door swings open on a dark doorway and a
// breeze runs ripples over the water.
const POOLS = { dry: -1.6, half: -1.3, full: -0.97 };
const POOLS_W = { dry: [3, 2, 1], half: [2, 3, 2], full: [1, 2, 3] };

const liminalpool = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), kind = rollW(rnd, POOLS_W, band);
    Object.assign(w, { kind, lv: POOLS[kind], c1: rnd() * 10, c2: rnd() * 10, c3: rnd() * 10, caust: 0, sag: 0, door: 0, doorV: 1, breeze: 0, flick: new Float32Array(4), ripples: [], rx: 0.2, rz: 2.4, rph: rnd() * TAU, bob: 0, bobV: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), hz = 0.45 * N, F = 0.55 * N, buf = r.buf;
    const X = (x, z) => N / 2 + (x * F) / z, Y = (h, z) => hz + (h * F) / z; // h: how far below the eye (the floor is 1)
    for (const h of hits) {
      if (isLow(h)) { w.caust = 1; w.sag = 0.1; w.bobV -= 0.55 * h.strength; }
      else if (h.kind === 'snare') w.ripples.push({ x: (rnd() - 0.5) * 1.6, z: 2.2 + rnd() * 1.1, R: 0.05, life: 0.8 });
      else if (h.kind === 'hat') w.flick[Math.floor(rnd() * 4)] = 0.3;
    }
    if (f.section === 'drop') { w.door = Math.max(w.door, 0.01); w.doorV = 1; w.breeze = 4; w.flick.fill(0.4); }
    else if (f.section === 'change') { w.kind = rollW(rnd, POOLS_W, band); w.doorV = -1; } // the door swings shut again
    w.lv = follow(w.lv, POOLS[w.kind], dt, 2.5);
    if (w.door > 0) w.door = clamp(w.door + w.doorV * dt);
    w.caust *= Math.exp(-dt * 3); w.sag -= dt; w.breeze -= dt;
    const cs = (0.5 + 3 * f.rel.bassDrive) * (w.breeze > 0 ? 3 : 1) * dt;
    w.c1 += cs * 1.1; w.c2 += cs * 0.9; w.c3 += cs * 1.3;
    const zf = 4, wx = 1.6, lv = w.lv, hw = -lv, over = lv > -1, wet = lv > -1.58;
    // the room, far to near, every edge on a line to the vanishing point: a slab runs from z = 0.8, nearer than the
    // frame, to the far wall; the far wall and its doorway, the ceiling with the tubes, the floor and its tiles
    const slab = (x0, h0, x1, h1, c) => r.poly([[X(x0, 0.8), Y(h0, 0.8)], [X(x0, zf), Y(h0, zf)], [X(x1, zf), Y(h1, zf)], [X(x1, 0.8), Y(h1, 0.8)]], c);
    r.rect(X(-wx, zf), Y(-1, zf), X(wx, zf) - X(-wx, zf), Y(1, zf) - Y(-1, zf), LMID);
    const dx0 = X(0.5, zf), dx1 = X(1.0, zf), dy0 = Y(-0.15, zf), dy1 = Y(1, zf);
    if (w.door > 0) r.rect(dx0, dy0, dx1 - dx0, dy1 - dy0, BLACK); // the dark doorway (its leaf stands on the floor, below)
    else { r.rect(dx0, dy0, dx1 - dx0, dy1 - dy0, MID); r.frame(dx0, dy0, dx1 - dx0, dy1 - dy0, DARK); r.set(dx1 - 2 * u, (dy0 + dy1) / 2, FIG); }
    slab(-wx, -1, wx, -1, MID); // the ceiling
    for (let k = 0; k < 4; k++) { // the tubes, flickering
      const z = 1.4 + k * 0.7, tw = (0.5 * F) / z, th = Math.max(1, (0.06 * F) / z), tx = N / 2 - tw / 2, ty = Y(-0.95, z);
      w.flick[k] -= dt;
      const on = w.flick[k] > 0 ? hash(k, (t * 30) | 0) < 0.5 : hash(k, (t * 12) | 0) > 0.03;
      r.rect(tx - u, ty - u, tw + 2 * u, th + 2 * u, on ? LMID : MID);
      r.rect(tx, ty, tw, th, on ? (w.sag > 0 ? LMID : w.flick[k] > 0 ? WHITE : BRIGHT) : DARK);
    }
    slab(-wx, 1, wx, 1, BG); // the floor
    for (let k = -4; k <= 4; k++) r.line(X(k * 0.4, zf), Y(1, zf), X(k * 0.4, 0.8), Y(1, 0.8), MID);
    for (let j = 0; j < 8; j++) { const z = 1 + j * 0.4; if (z < zf) r.rect(X(-wx, z), Y(1, z), X(wx, z) - X(-wx, z), 1, MID); }
    if (w.door > 0) { // the leaf swinging toward us on its hinge (shut again after a section change), over the floor it stands on
      const a = ease(w.door) * 1.9, fx = 0.5 + 0.5 * Math.cos(a), fz = zf - 0.5 * Math.sin(a);
      r.poly([[dx0, dy0], [X(fx, fz), Y(-0.15, fz)], [X(fx, fz), Y(1, fz)], [dx0, dy1]], MID);
    }
    // the basin: its floor with grout, the far and side inner walls, the coping
    const pz0 = 1.6, pz1 = 3.4, pf = 1.6;
    const rim = () => { // the floor between us and the basin hides all of it that lies below its near edge (seen from the eye at
      // height 1 the basin floor shows only from z = pf * pz0 on, the water from hw * pz0 on)
      r.poly([[X(-1, pz0), Y(1, pz0)], [X(1, pz0), Y(1, pz0)], [X(1, 0.8), Y(1, 0.8)], [X(-1, 0.8), Y(1, 0.8)]], BG);
      for (let k = -2; k <= 2; k++) r.line(X(k * 0.4, pz0), Y(1, pz0), X(k * 0.4, 0.8), Y(1, 0.8), MID);
      for (const z of [1, 1.4, pz0]) r.rect(X(-1, z), Y(1, z), X(1, z) - X(-1, z), 1, MID);
    };
    r.poly([[X(-1, pz1), Y(pf, pz1)], [X(1, pz1), Y(pf, pz1)], [X(1, pz0), Y(pf, pz0)], [X(-1, pz0), Y(pf, pz0)]], MID);
    for (let k = -2; k <= 2; k++) r.line(X(k * 0.4, pz1), Y(pf, pz1), X(k * 0.4, pz0), Y(pf, pz0), DARK + DIM);
    for (let j = 0; j < 5; j++) { const z = pz0 + j * 0.4; r.rect(X(-1, z), Y(pf, z), X(1, z) - X(-1, z), 1, DARK + DIM); }
    // the caustics on the pool floor: three sines in world space, brighter with the bass and the kick
    const thr = 2.3 - 0.5 * clamp(f.rel.bassDrive) - 0.4 * w.caust - (wet ? 0 : 0.3), ya = Math.max(0, Math.ceil(Y(pf, pz1))), yb = Math.min(N - 1, Math.floor(Y(pf, pz0)));
    for (let y = ya; y <= yb; y++) {
      const z = (pf * F) / (y + 0.5 - hz), kx = z / F, x0 = Math.max(0, Math.ceil(X(-1, z))), x1 = Math.min(N - 1, Math.floor(X(1, z))), rowT = sinL(z * 9 + w.c2), i0 = y * N;
      for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5 - N / 2) * kx, v = sinL(px * 9 + w.c1) + rowT + sinL((px + z) * 6 + w.c3);
        if (v > thr) buf[i0 + x] = v > thr + 0.5 ? BRIGHT : LMID;
      }
    }
    r.poly([[X(-1, pz1), Y(1, pz1)], [X(1, pz1), Y(1, pz1)], [X(1, pz1), Y(pf, pz1)], [X(-1, pz1), Y(pf, pz1)]], DARK);
    for (const d of [-1, 1]) r.poly([[X(d, pz1), Y(1, pz1)], [X(d, pz0), Y(1, pz0)], [X(d, pz0), Y(pf, pz0)], [X(d, pz1), Y(pf, pz1)]], DARK + DIM);
    if (over) rim(); // an overflow covers the near floor too, so the rim goes under the water
    // the water: dithered over whatever is under it; inside the basin, or over the whole floor when it overflows
    if (wet) {
      const wz0 = over ? 0.8 : pz0, wz1 = over ? zf : pz1, ww = over ? wx : 1, hh = over ? 1 : hw;
      const wa = Math.max(0, Math.ceil(Y(hh, wz1))), wb = Math.min(N - 1, Math.floor(Y(hh, wz0))), rip = w.breeze > 0 ? 1 : 0;
      for (let y = wa; y <= wb; y++) {
        const z = (hh * F) / (y + 0.5 - hz), x0 = Math.max(0, Math.ceil(X(-ww, z))), x1 = Math.min(N - 1, Math.floor(X(ww, z))), i0 = y * N;
        const line = rip && ((y + ((w.c1 * 20) | 0)) % 5 === 0);
        for (let x = x0; x <= x1; x++) if (line ? ((x + y) & 3) === 0 : bayer(x, y) < 0.5) buf[i0 + x] = line ? LMID : DARK;
      }
      const mc = f.beat.pulse > 0.8 ? BRIGHT : LMID;
      r.rect(X(-ww, wz1), Y(hh, wz1), X(ww, wz1) - X(-ww, wz1), 1, mc); // the meniscus at the far edge
      if (!over) for (const d of [-1, 1]) r.line(X(d, wz1), Y(hh, wz1), X(d, wz0), Y(hh, wz0), mc);
      w.ripples = w.ripples.filter((q) => { q.life -= dt; q.R += dt * 0.6; const z = clamp(q.z, wz0 + 0.1, wz1 - 0.1), rr = (q.R * F) / z; ringFast(r, X(q.x, z), Y(hh, z), rr, rr - 1, q.life > 0.4 ? LMID : MID, hh / z); return q.life > 0; });
    } else w.ripples.length = 0;
    // the ring, drifting on the water (or lying on the dry floor), bobbing with the bass
    spring(w, 'bob', 'bobV', 0, 30, 4, dt);
    w.rx = 0.25 * Math.sin(f.rel.bassClock * 0.07 + w.rph); w.rz = 2.5 + 0.5 * Math.cos(f.rel.bassClock * 0.05 + w.rph);
    const rh = wet ? hw + w.bob * 0.1 + 0.02 * Math.sin(f.rel.bassClock * 0.5) : pf, rz = w.rz, rr = (0.28 * F) / rz, rcx = X(w.rx, rz), rcy = Y(rh, rz), sy = rh / rz;
    ringFast(r, rcx, rcy, rr, rr * 0.55, HOT, sy);
    ringFast(r, rcx - rr * 0.25, rcy - rr * sy * 0.78, rr * 0.22, rr * 0.22 - Math.max(1, u), BRIGHT, 0.5);
    targets.push({ x: rcx - rr, y: rcy - rr * sy, w: 2 * rr, h: 2 * rr * sy });
    if (!over) rim(); // the near floor over the basin, its water and the ring in it
    // the side walls, with the tile band and the grout
    for (const d of [-1, 1]) {
      slab(d * wx, 1, d * wx, -1, LMID);
      slab(d * wx, 0.1, d * wx, 0.3, MID);
      for (let j = 1; j < 8; j++) { const z = 0.8 + j * 0.45; if (z < zf) r.line(X(d * wx, z), Y(-1, z), X(d * wx, z), Y(1, z), MID); }
    }
    if (w.door > 0.5) targets.push({ x: dx0, y: dy0, w: dx1 - dx0, h: dy1 - dy0 });
  },
};

// ---------------------------------------------------------------------------------------------- glasspanes
// Empty glass panels floating in a sky: rounded, a soft shadow under each, a glossy top, only lines and dots
// inside. A cursor arrow glides to a panel and clicks it on the beat (the panel sinks toward its shadow and
// glows), a loading ring of dots turns once a bar, bubbles rise, clouds drift with the bass. A kick bobs the
// panels, a snare double-clicks (a ring from the cursor), a tonal hit colours the next glow, a hat sparkles a
// gloss. On a drop the panels fall with gravity, bounce once, and float back up into a fresh stack.
const PANES = { few: { n: 3, s: 1.3 }, desk: { n: 5, s: 1 }, cloud: { n: 7, s: 0.75 } };
const PANES_W = { few: [3, 2, 0], desk: [2, 3, 2], cloud: [0, 1, 3] };
const home = (i, n, N) => [N * (0.22 + (0.56 * (i + 0.5)) / n + (i % 2 ? 0.06 : -0.06)), N * (0.25 + 0.4 * ((i * 0.37) % 1))];
const newPane = (rnd, i, n, N, s) => { const [x, y] = home(i, n, N); return { hx: x, hy: y, x, y, w: N * (0.16 + rnd() * 0.1) * s, h: N * (0.12 + rnd() * 0.08) * s, d: 0.6 + rnd() * 0.4, ph: rnd() * TAU, press: 0, glow: 0, glowC: BRIGHT, rows: 2 + Math.floor(rnd() * 3), vy: 0, mode: 0, wait: 0, b: 0 }; };

const glasspanes = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a), kind = rollW(rnd, PANES_W, band), K = PANES[kind];
    Object.assign(w, { kind, panes: Array.from({ length: K.n }, (_, i) => newPane(rnd, i, K.n, N, K.s)), cx: N * 0.7, cy: N * 0.7, tgt: 0, tx: N / 2, ty: N / 2, clickT: 0, bob: 0, bobV: 0, ring: 0, nextC: BRIGHT,
      bubbles: [], spawn: 0, sparks: [], clouds: Array.from({ length: 4 }, (_, i) => ({ x: (i + rnd()) / 4, y: 0.1 + rnd() * 0.7, s: 0.7 + rnd() * 0.6 })) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), bps = bpsOf(f), locked = beatLocked(f), panes = w.panes;
    for (const h of hits) {
      if (isLow(h)) w.bobV += 21 * u * h.strength;
      else if (h.kind === 'snare') { w.ring = 0.3; const p = panes[w.tgt]; if (p) { p.glow = 0.25; p.glowC = w.nextC; } }
      else if (h.kind === 'hat') w.sparks.push({ p: pick(rnd, panes), k: rnd(), t: 0.2 });
      else if (isTonal(h)) w.nextC = h.pc % 2 ? HOT : COOL;
    }
    if (f.section === 'drop') { const shift = 1 + Math.floor(rnd() * (panes.length - 1)); panes.forEach((p, i) => { p.mode = 1; p.wait = i * 0.08; p.vy = 0; p.b = 0; [p.hx, p.hy] = home((i + shift) % panes.length, panes.length, N); }); }
    else if (f.section === 'change') { w.kind = rollW(rnd, PANES_W, band); const K = PANES[w.kind]; while (panes.length > K.n) panes.pop(); while (panes.length < K.n) panes.push(Object.assign(newPane(rnd, panes.length, K.n, N, K.s), { y: -0.2 * N })); panes.forEach((p, i) => { [p.hx, p.hy] = home(i, panes.length, N); }); }
    spring(w, 'bob', 'bobV', 0, 80, 7, dt);
    w.ring -= dt;
    // the click on the beat, then the next target; the cursor glides there within the beat
    const beat = locked ? f.beat.on : (w.clickT += dt) > 0.5;
    if (beat && panes.length) {
      w.clickT = 0;
      const p = panes[w.tgt];
      if (p && Math.hypot(w.cx - w.tx, w.cy - w.ty) < 4 * u) { p.press = 1; p.glow = 0.25; p.glowC = w.nextC; w.nextC = BRIGHT; }
      w.tgt = (w.tgt + 1 + Math.floor(rnd() * (panes.length - 1))) % panes.length;
      const q = panes[w.tgt];
      w.tx = q.x + (rnd() - 0.5) * q.w * 0.6; w.ty = q.y + (rnd() - 0.5) * q.h * 0.6;
    }
    const tau = 0.3 / bps;
    w.cx = follow(w.cx, w.tx, dt, tau); w.cy = follow(w.cy, w.ty, dt, tau);
    // the clouds, drifting with the bass
    for (const c of w.clouds) {
      c.x += dt * 0.015 * (0.3 + f.rel.bassDrive) * c.s;
      if (c.x > 1.2) c.x -= 1.4;
      const cx = c.x * N, cy = c.y * N, rr = 0.05 * N * c.s;
      r.disc(cx, cy, rr, BRIGHT); r.disc(cx - rr, cy + rr * 0.3, rr * 0.7, BRIGHT); r.disc(cx + rr * 1.1, cy + rr * 0.2, rr * 0.8, BRIGHT);
    }
    // the bubbles: buoyancy to a terminal speed, a wobble
    w.spawn += dt * (0.5 + f.rel.trebDrive);
    while (w.spawn > 1 && w.bubbles.length < 12) { w.spawn--; w.bubbles.push({ x: rnd() * N, y: N + 2 * u, vy: 0, r: (1.2 + rnd() * 1.5) * u, ph: rnd() * TAU }); }
    w.bubbles = w.bubbles.filter((b) => {
      b.vy += (-(0.05 + 0.03 * (b.r / u)) * N - b.vy) * 3 * dt;
      b.y += b.vy * dt; b.x += Math.sin(t * 4 + b.ph) * b.r * dt;
      ringFast(r, b.x, b.y, b.r, Math.max(0, b.r - 1), LMID);
      r.set(b.x - b.r * 0.4, b.y - b.r * 0.4, BRIGHT);
      return b.y > -b.r;
    });
    // the panels, deep to near: the fall of a drop, the return, the float; a pressed one sinks to its shadow
    panes.sort((a, b) => a.d - b.d);
    for (const p of panes) {
      if (p.mode === 1) { // falling, a bounce at the bottom, then home
        if ((p.wait -= dt) <= 0) { p.vy += 2.2 * N * dt; p.y += p.vy * dt; const floor = N - p.h / 2 - 2 * u; if (p.y > floor) { p.y = floor; p.vy = -p.vy * 0.3; if (p.b++ || Math.abs(p.vy) < 0.05 * N) { p.vy = 0; p.mode = 2; p.wait = 0.6; } } } // the second touch settles it
      } else if (p.mode === 2) {
        if ((p.wait -= dt) <= 0) { p.x = follow(p.x, p.hx, dt, 0.4); p.y = follow(p.y, p.hy, dt, 0.4); if (Math.abs(p.y - p.hy) < u) p.mode = 0; }
      } else {
        p.x = follow(p.x, p.hx + 0.03 * N * p.d * Math.sin(f.rel.midClock * 0.4 + p.ph), dt, 0.5);
        p.y = follow(p.y, p.hy + 0.02 * N * p.d * Math.cos(f.rel.midClock * 0.3 + p.ph) + w.bob * p.d, dt, 0.3);
      }
      p.press *= Math.exp(-dt * 10); p.glow -= dt;
      const sc = 1 - 0.06 * p.press, pw = p.w * sc, ph = p.h * sc, x0 = p.x - pw / 2, y0 = p.y - ph / 2 + 1.5 * u * p.press, rad = 3 * u * p.d, off = (1 - p.press) * p.d;
      rrect(r, x0 + 3 * u * off, y0 + 4 * u * off, pw, ph, rad, MID + DIM);
      rrect(r, x0, y0, pw, ph, rad, MID);
      rrect(r, x0 + u, y0 + u, pw - 2 * u, ph - 2 * u, rad, p.glow > 0 ? p.glowC : LMID);
      rrect(r, x0 + u, y0 + u, pw - 2 * u, ph * 0.42, rad, p.glow > 0 ? WHITE : BRIGHT);
      r.rect(x0 + rad, y0 + 1.5 * u, pw - 2 * rad, Math.max(1, u * 0.8), WHITE);
      for (let k = 0; k < p.rows; k++) { // the lines and the dots
        const ly = y0 + ph * (0.55 + 0.13 * k), lw = pw * (0.3 + 0.4 * hash(k, p.rows));
        if (ly + u > y0 + ph - 2 * u) break;
        r.disc(x0 + 3.5 * u, ly, Math.max(1, u * 0.9), p.glow > 0 ? FIG : MID);
        r.rect(x0 + 6 * u, ly - u * 0.5, lw, Math.max(1, u * 0.8), MID);
      }
    }
    w.sparks = w.sparks.filter((q) => { q.t -= dt; const x = q.p.x - q.p.w / 2 + q.k * q.p.w, y = q.p.y - q.p.h * 0.4; r.rect(x - 2 * u, y, 5 * u, 1, WHITE); r.rect(x, y - 2 * u, 1, 5 * u, WHITE); return q.t > 0; });
    // the loading ring, one turn a bar, and the cursor
    const bp = barPhase(f, t), lx = 0.9 * N, ly = 0.1 * N;
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + bp * TAU, back = k, rr = 5 * u; r.disc(lx + Math.cos(a) * rr, ly + Math.sin(a) * rr, Math.max(1, (back === 7 ? 1.6 + 0.6 * f.beat.pulse : 1.1) * u), back === 7 ? WHITE : back > 4 ? LMID : MID); }
    if (w.ring > 0) { const rr = (0.3 - w.ring) * 40 * u; ringFast(r, w.cx, w.cy, rr, rr - Math.max(1, u), BRIGHT); }
    cursor(r, w.cx, w.cy, 1.1 * u, WHITE, FIG);
    if (panes[w.tgt]) { const p = panes[w.tgt]; targets.push({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h }); }
  },
};

// ---------------------------------------------------------------------------------------------- crystaltemple
// Draws `fn` see-through: the rows it touches are copied first, then every pixel the drawing changed is put back
// where the dither says so, leaving `alpha` of the new marks over what was behind (the scratch buffer is kept)
function glassy(W, y0, y1, alpha, fn) {
  const { r, N, w } = W, buf = r.buf;
  if (!w.tmp || w.tmp.length !== N * N) w.tmp = new Uint8Array(N * N);
  const a = Math.max(0, Math.floor(y0)) * N, b = Math.min(N, Math.ceil(y1) + 1) * N;
  if (b <= a) return;
  w.tmp.set(buf.subarray(a, b), a);
  fn();
  for (let i = a; i < b; i++) if (buf[i] !== w.tmp[i] && bayer(i % N, (i / N) | 0) >= alpha) buf[i] = w.tmp[i];
}

// A temple of translucent crystal: columns in two rows (dithered, so what stands behind shows through, denser at
// the edges where the glass bends the light), glass angel statues on pedestals between them, a staircase rising
// to a light at the top. Across the aisle run rainbow refraction stripes, HOT/COOL/BRIGHT, sliding on the mid
// clock; one tread is marked per beat. A kick flares the light and runs a glow up the stairs, a snare whites the
// stripes, a tonal hit reorders them and colours a statue's halo, a hat glints a column. On a drop the view rises
// up the stairs into the light, a white-out, and the temple is there again. The band sets how many columns.
const TEMPLES = { nave: { cols: 4, gap: 1.0, statues: 2, top: -1.0 }, cloister: { cols: 6, gap: 0.7, statues: 3, top: -1.0 }, spire: { cols: 5, gap: 0.85, statues: 3, top: -1.6 } };
const TEMPLES_W = { nave: [3, 2, 1], cloister: [2, 3, 2], spire: [1, 2, 3] };
const STRIPES = [[HOT, COOL, BRIGHT], [COOL, BRIGHT, HOT], [BRIGHT, HOT, COOL]];

const crystaltemple = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, TEMPLES_W, band), asc: -1, cam: 0, flash: 0, flareT: 0, run: -1, white: 0, order: 0, haloC: BRIGHT, haloT: 0, glints: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), K = TEMPLES[w.kind], hz = 0.4 * N, F = 0.6 * N, buf = r.buf;
    const X = (x, z) => N / 2 + (x * F) / z, Y = (h, z) => hz + (h * F) / z;
    for (const h of hits) {
      if (isLow(h)) { w.flareT = 0.3; w.run = 0; }
      else if (h.kind === 'snare') w.white = 0.1;
      else if (h.kind === 'hat') w.glints.push({ k: Math.floor(rnd() * K.cols * 2), t: 0.2, p: rnd() });
      else if (isTonal(h)) { w.order = h.pc % 3; w.haloC = h.pc % 2 ? HOT : COOL; w.haloT = 0.5; }
    }
    if (f.section === 'drop') w.asc = 0;
    else if (f.section === 'change') w.kind = rollW(rnd, TEMPLES_W, band);
    if (w.asc >= 0) { w.asc += dt / 5; if (w.asc >= 1) { w.asc = -1; w.flash = 1; w.cam = 0; } else w.cam = ease(w.asc) * 5; }
    w.flash *= Math.exp(-dt * 2.5); w.flareT -= dt; w.white -= dt; w.haloT -= dt;
    if (w.run >= 0 && (w.run += dt * 1.6) > 1) w.run = -1;
    // climbing, the eye rises with the stairs: the floor the columns and statues stand on is then `lift` further below it
    const camK = w.cam / 0.45, lift = camK * 0.09, lit = beatLocked(f) ? f.beat.count % 12 : Math.floor(t * 2) % 12;
    // the stairs, far to near, and the light at the top
    const zt = 1.2 + (12 - camK) * 0.45, ht = 1 - (12 - camK) * 0.09 - 0.45, LR = ((0.2 + 0.08 * f.beat.pulse + 0.15 * Math.max(0, w.flareT)) * F) / zt;
    for (let k = 0; k < 6; k++) { const a = f.rel.midClock * 0.12 + (k * TAU) / 6, hw = 0.03, len = 1.6 * N, lx = X(0, zt), ly = Y(ht, zt); r.poly([[lx, ly], [lx + Math.cos(a - hw) * len, ly + Math.sin(a - hw) * len], [lx + Math.cos(a + hw) * len, ly + Math.sin(a + hw) * len]], LMID); }
    ringFast(r, X(0, zt), Y(ht, zt), LR * 1.6, LR * 1.6 - Math.max(1, u), LMID);
    r.disc(X(0, zt), Y(ht, zt), LR, BRIGHT);
    r.disc(X(0, zt), Y(ht, zt), LR * 0.55, WHITE);
    for (let k = 11; k >= 0; k--) {
      const kk = k - camK, z0 = 1.2 + kk * 0.45, z1 = z0 + 0.45, h = 1 - kk * 0.09;
      if (z0 < 0.9) continue;
      const runLit = w.run >= 0 && Math.abs(k - w.run * 12) < 1.2;
      r.poly([[X(-0.7, z1), Y(h, z1)], [X(0.7, z1), Y(h, z1)], [X(0.7, z0), Y(h, z0)], [X(-0.7, z0), Y(h, z0)]], runLit ? BRIGHT : LMID); // the tread
      r.rect(X(-0.7, z0), Y(h, z0), X(0.7, z0) - X(-0.7, z0), Math.max(1, Y(h + 0.09, z0) - Y(h, z0)), MID); // the riser below its near edge
      if (k === lit) r.rect(X(-0.7, z0), Y(h, z0), X(0.7, z0) - X(-0.7, z0), Math.max(1, u), WHITE);
    }
    // the refraction stripes across the aisle in front of the stairs, sliding on the mid clock, dithered
    const kNear = Math.max(0, Math.ceil(camK - 0.66)), zNear = 1.2 + (kNear - camK) * 0.45, hN = 1 - (kNear - camK) * 0.09, cols = STRIPES[w.order], bw = Math.max(3, 7 * u), off = f.rel.midClock * 6 * u;
    for (let y = Math.max(0, Math.ceil(Y(hN, zNear))); y < N; y++) { // on the plane of the nearest tread in view
      const z = (hN * F) / (y + 0.5 - hz), x0 = Math.max(0, Math.ceil(X(-0.7, z))), x1 = Math.min(N - 1, Math.floor(X(0.7, z))), i0 = y * N;
      for (let x = x0; x <= x1; x++) if (bayer(x, y) < 0.5) buf[i0 + x] = w.white > 0 ? BRIGHT : cols[(((x + y * 0.6 + off) / bw) | 0) % 3];
    }
    // the columns and the statues, far to near, see-through
    const items = [];
    for (let i = 0; i < K.cols; i++) for (const d of [-1, 1]) items.push({ kind: 0, z: 1.6 + i * K.gap - w.cam, d, i: i * 2 + (d > 0 ? 1 : 0) });
    for (let i = 0; i < K.statues; i++) for (const d of [-1, 1]) items.push({ kind: 1, z: 1.6 + (i + 0.5) * K.gap - w.cam, d, i });
    items.sort((p, q) => q.z - p.z);
    for (const it of items) {
      if (it.z < 0.9) continue;
      const z = it.z, cx = X(it.d * 1.1, z);
      if (it.kind === 0) {
        const cw = Math.max(2, (0.22 * F) / z), top = Math.max(0, Y(K.top + lift, z)), bot = Math.min(N, Y(1 + lift, z)), x0 = Math.round(cx - cw / 2), x1 = Math.round(cx + cw / 2), e = Math.max(1, Math.round(cw * 0.3));
        for (let y = Math.max(0, top | 0); y < bot; y++) {
          const i0 = y * N;
          for (let x = Math.max(0, x0); x < Math.min(N, x1); x++) {
            const bz = bayer(x, y), edge = x < x0 + e ? 0 : x >= x1 - e ? 2 : 1;
            if (edge === 1 ? bz < 0.35 : bz < 0.75) buf[i0 + x] = edge === 0 ? MID : edge === 2 ? BRIGHT : LMID;
          }
        }
        const cap = Math.max(1, (3 * u) / z); // the capital and the base, both at 1/z
        r.rect(x0 - u, top, cw + 2 * u, cap, LMID);
        r.rect(x0 - u, bot - cap, cw + 2 * u, cap, LMID);
      } else {
        const hgt = (0.5 * F) / z, base = Y(1 + lift, z) - (0.12 * F) / z, pw = (0.25 * F) / z;
        r.poly([[cx - pw * 0.6, base], [cx + pw * 0.6, base], [cx + pw * 0.5, Y(1 + lift, z)], [cx - pw * 0.5, Y(1 + lift, z)]], LMID);
        glassy(W, base - hgt * 1.05, base, 0.6, () => angel(r, cx, base, hgt, 0.6, BRIGHT, w.haloT > 0 ? w.haloC : f.beat.pulse > 0.7 ? WHITE : LMID, u));
      }
    }
    w.glints = w.glints.filter((q) => { q.t -= dt; const it = items.find((o) => o.kind === 0 && o.i === q.k); if (it && it.z >= 0.9) { const x = X(it.d * 1.1, it.z), y = lerp(Y(K.top + lift, it.z), Y(1 + lift, it.z), q.p); r.rect(x - 2 * u, y, 5 * u, 1, WHITE); r.rect(x, y - 2 * u, 1, 5 * u, WHITE); } return q.t > 0; });
    if (w.flash > 0.03) for (let y = 0, i = 0; y < N; y++) for (let x = 0; x < N; x++, i++) if (bayer(x, y) < w.flash) buf[i] = WHITE; // the white-out at the top of the stairs
    targets.push({ x: X(0, zt) - LR, y: Y(ht, zt) - LR, w: 2 * LR, h: 2 * LR });
  },
};

// ---------------------------------------------------------------------------------------------- modelviewer
// A low-poly figure of six boxes turning on a pedestal: the faces are shaded flat from one light (dot of the face
// normal with the light), back faces culled, the rest painted far to near; the turntable speed follows the level
// (a notch on the pedestal rim shows the turn). A snare toggles a wireframe over the faces, a kick shifts rows
// through the figure for a few frames (a texture glitch), a hat sparks a vertex, a tonal hit tints the lit faces.
// On a drop the figure snaps into a T-pose and holds it a second. A grid floor, a corner-bracket frame and a strip
// of meters and dots, no digits. The pose (idle, a walk in place on the beat, a dance) comes with the band.
const POSES_W = { idle: [3, 2, 0], walk: [1, 3, 2], dance: [0, 1, 3] };
const BOX_Q = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];
// box b: pivot p, centre c relative to the pivot, half sizes h, turned about Z by az then about X by ax at the pivot
function putBox(V, b, p, c, h, ax, az) {
  const cz = Math.cos(az), sz = Math.sin(az), cx = Math.cos(ax), sx = Math.sin(ax);
  for (let k = 0; k < 8; k++) {
    const x0 = c[0] + (k & 1 ? h[0] : -h[0]), y0 = c[1] + (k & 2 ? h[1] : -h[1]), z0 = c[2] + (k & 4 ? h[2] : -h[2]);
    const x1 = x0 * cz - y0 * sz, y1 = x0 * sz + y0 * cz, y2 = y1 * cx - z0 * sx, z2 = y1 * sx + z0 * cx, o = (b * 8 + k) * 3;
    V[o] = p[0] + x1; V[o + 1] = p[1] + y2; V[o + 2] = p[2] + z2;
  }
}

const modelviewer = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, POSES_W, band), ang: rnd() * TAU, wire: false, glitch: 0, tpose: 0, tint: -1, tintT: 0, sparks: [], V: new Float32Array(6 * 8 * 3), P: new Float32Array(6 * 8 * 3), C: new Float32Array(6 * 3),
      tris: Array.from({ length: 72 }, () => ({ a: 0, b: 0, c: 0, z: 0, sh: 0, box: 0 })), lv: 0, rim: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), cxS = N / 2, cyS = 0.5 * N, F = 1.1 * N, camZ = 3.2;
    for (const h of hits) {
      if (isLow(h)) w.glitch = 0.12;
      else if (h.kind === 'snare') w.wire = !w.wire;
      else if (h.kind === 'hat') w.sparks.push({ v: Math.floor(rnd() * 48), t: 0.15 });
      else if (isTonal(h)) { w.tint = h.pc % 2 ? HOT : COOL; w.tintT = 0.3; }
    }
    if (f.section === 'drop') w.tpose = 1;
    else if (f.section === 'change') w.kind = rollW(rnd, POSES_W, band);
    w.glitch -= dt; w.tpose -= dt; w.tintT -= dt;
    w.lv = follow(w.lv, f.level, dt, 0.2);
    w.ang += dt * (0.4 + 2.5 * w.lv);
    w.rim = f.beat.on ? 1 : w.rim * Math.exp(-dt * 6);
    // the pose: joint angles by kind, a stride per two beats, the T-pose of a drop over all of it
    const ph = beatLocked(f) ? Math.PI * (f.beat.count + f.beat.phase) : t * 3, sw = Math.sin(ph), T = w.tpose > 0;
    let armX = 0, armZ = 0.15, legX = 0, bob = 0.01 * Math.sin(t * 2), nod = 0, hop = 0;
    if (w.kind === 'walk') { armX = -0.45 * sw; legX = 0.6 * sw; bob = 0; } // the arm swings against the leg on its side
    else if (w.kind === 'dance') { const p = beatLocked(f) ? f.beat.phase : (t * 2) % 1; armZ = 1.0 + 0.5 * sw; armX = 0.3 * Math.cos(ph); legX = 0.25 * sw; bob = 0; hop = 0.16 * p * (1 - p); nod = 0.15 * sw; } // a hop that lands on every beat
    if (T) { armX = 0; armZ = Math.PI / 2; legX = 0; bob = 0; nod = 0; hop = 0; }
    // the feet stay on the pedestal: a leg swung by legX reaches 0.9 cos + 0.09 |sin| down, so the hips drop the rest
    const hip = hop - (0.9 - 0.9 * Math.cos(legX) - 0.09 * Math.abs(Math.sin(legX))), V = w.V, P = w.P, C = w.C;
    putBox(V, 0, [0, hip + bob, 0], [0, 0.25, 0], [0.25, 0.36, 0.14], 0, 0);
    putBox(V, 1, [0, 0.62 + hip + bob, 0], [0, 0.18, 0], [0.14, 0.15, 0.14], nod, 0);
    putBox(V, 2, [-0.33, 0.55 + hip + bob, 0], [0, -0.33, 0], [0.07, 0.33, 0.07], armX, armZ);
    putBox(V, 3, [0.33, 0.55 + hip + bob, 0], [0, -0.33, 0], [0.07, 0.33, 0.07], -armX, -armZ);
    putBox(V, 4, [-0.13, -0.1 + hip, 0], [0, -0.45, 0], [0.09, 0.45, 0.09], legX, 0);
    putBox(V, 5, [0.13, -0.1 + hip, 0], [0, -0.45, 0], [0.09, 0.45, 0.09], -legX, 0);
    // the turntable, the view and the projection; the box centres for the facing test
    const ca = Math.cos(w.ang), sa = Math.sin(w.ang);
    for (let i = 0; i < 48; i++) { const x = V[3 * i], y = V[3 * i + 1], z = V[3 * i + 2], xv = x * ca + z * sa, zv = z * ca - x * sa + camZ; P[3 * i] = xv; P[3 * i + 1] = y; P[3 * i + 2] = zv; }
    for (let b = 0; b < 6; b++) { let x = 0, y = 0, z = 0; for (let k = 0; k < 8; k++) { x += P[(b * 8 + k) * 3]; y += P[(b * 8 + k) * 3 + 1]; z += P[(b * 8 + k) * 3 + 2]; } C[3 * b] = x / 8; C[3 * b + 1] = y / 8; C[3 * b + 2] = z / 8; }
    const Lx = -0.47, Ly = 0.66, Lz = -0.57, tris = w.tris;
    let n = 0;
    for (let b = 0; b < 6; b++) for (const q of BOX_Q) for (let half = 0; half < 2; half++) {
      const ia = b * 8 + q[0], ib = b * 8 + q[half ? 2 : 1], ic = b * 8 + q[half ? 3 : 2];
      const ax = P[3 * ia], ay = P[3 * ia + 1], az = P[3 * ia + 2], bx = P[3 * ib] - ax, by = P[3 * ib + 1] - ay, bz = P[3 * ib + 2] - az, cx = P[3 * ic] - ax, cy = P[3 * ic + 1] - ay, cz = P[3 * ic + 2] - az;
      let nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
      const mx = ax + (bx + cx) / 3, my = ay + (by + cy) / 3, mz = az + (bz + cz) / 3;
      if (nx * (mx - C[3 * b]) + ny * (my - C[3 * b + 1]) + nz * (mz - C[3 * b + 2]) < 0) { nx = -nx; ny = -ny; nz = -nz; } // outward
      if (nx * mx + ny * my + nz * mz >= 0) continue; // facing away from the eye at the origin
      const len = Math.hypot(nx, ny, nz) || 1, tri = tris[n++];
      tri.a = ia; tri.b = ib; tri.c = ic; tri.z = mz; tri.sh = Math.max(0, (nx * Lx + ny * Ly + nz * Lz) / len); tri.box = b;
    }
    const sx = (i) => cxS + (P[3 * i] * F) / P[3 * i + 2], sy = (i) => cyS - (P[3 * i + 1] * F) / P[3 * i + 2];
    // the floor and the pedestal under the feet, then the faces far to near, the wire over them
    const feetY = cyS + F / camZ, pr = 0.22 * N;
    gridFloor(r, N, cyS, cxS, 0, 6, 10, DARK, u);
    r.rect(cxS - pr, feetY, 2 * pr, 0.06 * N, MID);
    r.rect(cxS - pr, feetY + 0.05 * N, 2 * pr, Math.max(1, u), DARK);
    ringFast(r, cxS, feetY + 0.06 * N, pr, 0, DARK, 0.3);
    ringFast(r, cxS, feetY, pr, 0, w.rim > 0.5 ? BRIGHT : LMID, 0.3);
    r.disc(cxS + Math.cos(w.ang) * pr * 0.9, feetY + Math.sin(w.ang) * pr * 0.27, Math.max(1, 1.2 * u), Math.sin(w.ang) > 0 ? FIG : MID);
    const list = tris.slice(0, n).sort((p, q) => q.z - p.z);
    let x0 = N, y0 = N, x1 = 0, y1 = 0;
    for (const tri of list) {
      const pa = [sx(tri.a), sy(tri.a)], pb = [sx(tri.b), sy(tri.b)], pc = [sx(tri.c), sy(tri.c)];
      const lvl = tri.sh > 0.75 ? 3 : tri.sh > 0.45 ? 2 : tri.sh > 0.15 ? 1 : 0, c = T ? (lvl > 1 ? WHITE : BRIGHT) : lvl === 3 && w.tintT > 0 ? w.tint : RAMP[lvl];
      if (!(w.wire && !T)) r.poly([pa, pb, pc], c);
      if (w.wire || T) { r.line(pa[0], pa[1], pb[0], pb[1], COOL); r.line(pb[0], pb[1], pc[0], pc[1], COOL); r.line(pc[0], pc[1], pa[0], pa[1], COOL); }
      for (const p of [pa, pb, pc]) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    }
    if (w.glitch > 0) { const fr = (t * 60) | 0; for (let y = Math.max(0, y0 | 0); y < Math.min(N, y1); y += 3) if (hash(y, fr) < 0.5) { const dx = Math.round((hash(y, fr + 1) - 0.5) * 10 * u); for (let k = 0; k < 3 && y + k < N; k++) shiftRow(r.buf, N, y + k, dx); } }
    w.sparks = w.sparks.filter((q) => { q.t -= dt; const x = sx(q.v), y = sy(q.v); r.rect(x - 2 * u, y, 5 * u, 1, WHITE); r.rect(x, y - 2 * u, 1, 5 * u, WHITE); return q.t > 0; });
    // the frame brackets and the strip of meters and dots
    const bl = 0.06 * N, lw = Math.max(1, u);
    for (const [bx, by, dx, dy] of [[0.04 * N, 0.04 * N, 1, 1], [0.96 * N, 0.04 * N, -1, 1], [0.04 * N, 0.96 * N, 1, -1], [0.96 * N, 0.96 * N, -1, -1]]) { r.rect(dx > 0 ? bx : bx - bl, by, bl, lw, LMID); r.rect(bx, dy > 0 ? by : by - bl, lw, bl, LMID); }
    const mx = 0.08 * N, my = 0.08 * N, meters = [w.lv, f.rel.bassDrive, f.rel.midDrive, f.rel.trebDrive];
    r.rect(mx, my, 0.3 * N, 0.05 * N, DARK + DIM);
    for (let i = 0; i < 4; i++) r.rect(mx + 2 * u + i * 0.03 * N, my + 0.04 * N - clamp(meters[i]) * 0.03 * N, Math.max(1, 1.5 * u), clamp(meters[i]) * 0.03 * N, i ? COOL : BRIGHT);
    for (let i = 0; i < 6; i++) r.disc(mx + 0.16 * N + i * 0.022 * N, my + 0.025 * N, Math.max(1, u), i < Math.round(w.lv * 6) ? BRIGHT : MID);
    targets.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  },
};

// ---------------------------------------------------------------------------------------------- feathersea
// A dark glossy sea under a moon: wave crests coming toward us at 1/z spacing on the bass clock, the moon's
// glitter path mirrored under it in x and widening toward us, its dashes re-dealt every beat; cross glints for
// stars, a lens flare chain through the frame. A feather falls at a slow terminal speed, swinging side to side
// with its tilt following the swing, lands on the near water, floats two bars and sinks away. A snare gusts the
// feather, a kick swells the crests, a hat sparkles the glitter, a tonal hit colours the twinkles. On a drop a
// flurry of feathers comes down and the moon flares. The band sets the chop and the number of feathers.
const SEAS = { still: { feathers: 1, crest: 0.6, glitter: 1 }, breeze: { feathers: 2, crest: 1, glitter: 1.4 }, squall: { feathers: 3, crest: 1.5, glitter: 2 } };
const SEAS_W = { still: [3, 2, 1], breeze: [2, 3, 2], squall: [0, 1, 3] };
const newFeather = (rnd, N, high) => ({ x: (0.15 + rnd() * 0.7) * N, y: -(0.05 + (high ? rnd() * 0.6 : 0)) * N, vy: 0, vx: 0, ph: rnd() * TAU, amp: 0.05 * N * (0.7 + rnd() * 0.6), land: (0.86 + rnd() * 0.1) * N, mode: 0, ft: 0, sz: 0.8 + rnd() * 0.4 });

const feathersea = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a), kind = rollW(rnd, SEAS_W, band);
    Object.assign(w, { kind, feathers: Array.from({ length: SEAS[kind].feathers }, () => newFeather(rnd, N, false)), swell: 0, gust: 0, moon: 0, sparks: [], starC: BRIGHT, starT: 0, wph: 0, wn: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, band = bandOf(W.a), K = SEAS[w.kind], hz = 0.5 * N, mx = 0.62 * N, my = 0.22 * N, MR = 0.07 * N, bps = bpsOf(f);
    for (const h of hits) {
      if (isLow(h)) w.swell = Math.max(w.swell, h.strength);
      else if (h.kind === 'snare') { w.gust = 0.5; for (const fe of w.feathers) if (fe.mode === 0) fe.vx += (rnd() < 0.5 ? -1 : 1) * 0.2 * N * h.strength; }
      else if (h.kind === 'hat') w.sparks.push({ x: mx + (rnd() - 0.5) * 0.2 * N, y: hz + rnd() * 0.5 * N, t: 0.2 });
      else if (isTonal(h)) { w.starC = h.pc % 2 ? HOT : COOL; w.starT = 0.5; }
    }
    if (f.section === 'drop') { for (let k = 0; k < 18; k++) w.feathers.push(newFeather(rnd, N, true)); w.moon = 1; }
    else if (f.section === 'change') w.kind = rollW(rnd, SEAS_W, band);
    w.swell *= Math.exp(-dt * 3); w.gust -= dt; w.moon *= Math.exp(-dt / 2); w.starT -= dt;
    w.wph += dt * (0.15 + 0.4 * f.rel.bassDrive + 0.8 * w.swell);
    if (w.wph >= 1) { w.wph -= 1; w.wn++; } // every crest one row nearer: its row number steps down, so it is row + wn that names it
    // the sky: stars as cross glints, the moon, its flare chain
    for (let i = 0; i < 50; i++) {
      const x = hash(i, 21) * N, y = hash(i, 22) * hz * 0.9, tw = hash(i, (t * 3) | 0) > 0.8;
      if (tw) { r.rect(x - 2 * u, y, 5 * u, 1, w.starT > 0 ? w.starC : BRIGHT); r.rect(x, y - 2 * u, 1, 5 * u, w.starT > 0 ? w.starC : BRIGHT); }
      else { r.rect(x - u, y, 3 * u, 1, LMID); r.rect(x, y - u, 1, 3 * u, LMID); }
    }
    ringFast(r, mx, my, MR * (1.5 + 0.3 * f.beat.pulse), MR * 1.5 - Math.max(1, u), LMID);
    flare(r, mx, my, (0.1 + 0.08 * f.level + 0.25 * w.moon) * N, u, LMID);
    r.disc(mx, my, MR, BRIGHT);
    r.disc(mx - MR * 0.3, my - MR * 0.2, MR * 0.18, LMID); r.disc(mx + MR * 0.35, my + MR * 0.3, MR * 0.12, LMID);
    if (w.moon > 0.05) { const rr = MR * (1 + 6 * (1 - w.moon)); ringFast(r, mx, my, rr, rr - Math.max(1, u), WHITE); }
    for (let k = 1; k <= 4; k++) { const q = 0.45 * k, x = mx + (N / 2 - mx) * q, y = my + (N / 2 - my) * q, rr = [0.03, 0.015, 0.045, 0.02][k - 1] * N; ringFast(r, x, y, rr, k % 2 ? 0 : rr - Math.max(1, u), k % 2 ? MID + DIM : LMID + DIM); }
    // the sea: far rows dimmer, crests at 1/z spacing coming toward us, the glitter path under the moon
    r.rect(0, hz, N, 0.15 * N, DARK + DIM);
    r.rect(0, hz + 0.15 * N, N, N, DARK);
    r.rect(0, hz, N, 1, MID);
    const seed = beatLocked(f) ? f.beat.count : (t * 2) | 0, gl = K.glitter * (1 + w.moon) * (1 + 0.5 * f.rel.trebDrive), mirror = hz + (hz - my);
    ringFast(r, mx, mirror, MR * 1.4, 0, MID + DIM, 0.25);
    for (let j = 0; j < 14; j++) { // each crest keeps its dashes as it comes, and they spread out from the vanishing point
      const zz = 1 + (j - w.wph) * 0.35, y = hz + (N - hz) / zz, id = j + w.wn;
      if (y >= N || zz < 0.9) continue;
      const seg = (6 + 10 / zz) * u * K.crest, n = Math.ceil(N / (seg * 4)) + 1;
      for (let k = -n; k <= n; k++) { const sh = hash(id, k + 100) * seg * 2, x = N / 2 + k * seg * 2 + sh; if (hash(id + 50, k) < 0.6 * K.crest) r.rect(x, y, seg, zz < 1.4 ? Math.max(1, u) : 1, MID); }
    }
    for (let y = Math.ceil(hz) + 1; y < N; y += 2) {
      const d = (y - hz) / (N - hz), hw = (0.04 + 0.12 * d) * N * (1 + 0.5 * w.swell), dens = gl * (0.25 + 0.5 * Math.exp(-(((y - mirror) / (0.12 * N)) ** 2)));
      if (hash(y, seed) > dens) continue;
      const x = mx + (hash(y, seed + 7) - 0.5) * 2 * hw, len = (2 + 4 * d) * u;
      r.rect(x - len / 2, y, len, 1, d > 0.5 ? BRIGHT : LMID);
      if (hash(y, seed + 3) < 0.4 * dens) r.rect(mx + (hash(y, seed + 9) - 0.5) * 2 * hw - len / 4, y, len / 2, 1, LMID);
    }
    w.sparks = w.sparks.filter((q) => { q.t -= dt; r.rect(q.x - 2 * u, q.y, 5 * u, 1, WHITE); r.rect(q.x, q.y - 2 * u, 1, 5 * u, WHITE); return q.t > 0; });
    // the feathers: a slow terminal fall, a side-to-side swing with the tilt along the path, a float, a fade
    const want = K.feathers;
    while (w.feathers.length < want) w.feathers.push(newFeather(rnd, N, false));
    const wind = 0.01 * N * Math.sin(f.rel.midClock * 0.1) + (w.gust > 0 ? 0.03 * N : 0);
    w.feathers = w.feathers.filter((fe, i) => {
      const Lf = 11 * u * fe.sz, wd = 3.5 * u * fe.sz;
      let a, sq = 1, alpha = 1;
      if (fe.mode === 0) {
        const vt = 0.045 * N * fe.sz * (0.8 + 0.3 * f.rel.midDrive), om = 2.2;
        fe.vy += (vt - fe.vy) * 2 * dt;
        fe.vx = follow(fe.vx, wind, dt, 0.8);
        fe.ph += om * dt;
        const swing = fe.amp * om * Math.cos(fe.ph) * (1 + 0.5 * f.rel.midDrive);
        fe.x += (fe.vx + swing) * dt; fe.y += fe.vy * dt;
        a = -Math.atan2(fe.vx + swing, fe.vy) * 0.8 + 0.2 * Math.sin(fe.ph * 2);
        if (fe.x < -Lf) fe.x += N + 2 * Lf; else if (fe.x > N + Lf) fe.x -= N + 2 * Lf;
        if (fe.y >= fe.land) { fe.mode = 1; fe.ft = 8 / bps; fe.y = fe.land; }
      } else {
        fe.ft -= dt; fe.x += wind * 0.3 * dt;
        a = 0.3 * Math.sin(f.rel.bassClock * 0.5 + fe.ph); sq = 0.35;
        fe.y = fe.land + 0.5 * u * Math.sin(f.rel.bassClock + fe.ph);
        alpha = clamp(fe.ft / 1.5);
        if (fe.ft <= 0) return false;
      }
      const ca = Math.cos(a), sa = Math.sin(a), P = (px, py) => [fe.x + px * ca - py * sq * sa, fe.y + px * sa + py * sq * ca];
      const draw = () => {
        r.poly([P(0, -Lf * 0.5), P(wd * 0.3, -Lf * 0.25), P(wd * 0.5, 0), P(wd * 0.4, Lf * 0.25), P(0, Lf * 0.45), P(-wd * 0.4, Lf * 0.25), P(-wd * 0.5, 0), P(-wd * 0.3, -Lf * 0.25)], BRIGHT);
        const [tx, ty] = P(0, -Lf * 0.5), [bx, by] = P(0, Lf * 0.5);
        r.line(tx, ty, bx, by, LMID);
      };
      if (alpha < 1) glassy(W, fe.y - Lf, fe.y + Lf, alpha, draw); else draw();
      if (i === 0) targets.push({ x: fe.x - Lf, y: fe.y - Lf, w: 2 * Lf, h: 2 * Lf });
      return true;
    });
    if (w.feathers.length > want + 20) w.feathers.length = want + 20;
    targets.push({ x: mx - MR, y: my - MR, w: 2 * MR, h: 2 * MR });
  },
};

const WORLDS = { cyberheaven, chromeorbs, aerogloss, chrometunnel, butterflies, halo, heartmonitor, liminalpool, glasspanes, crystaltemple, modelviewer, feathersea };
registerFamily('y2k', WORLD_DEFS, WORLDS);
export const Y2K_STYLE = makeMixStyle('Y2K ETHEREAL', ['y2k']);
