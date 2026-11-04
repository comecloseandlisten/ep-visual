// Openings, mixed: the animation language of the cult title sequences as worlds, original silhouettes only. Paint on
// glass morphing on the beat, a still figure while the world lifts off round it, a shot list cut on the beat, red ink
// thrown at the lens between grey city shots, a crew snapping into dramatic poses, the palette whipped inside out on
// every hit, manga panels sliding in, a crowd sprinting at the camera, the slow tilt up into the sky, a rainbow
// shockwave, an express train's slipstream on a platform and an emblem slammed together. Timed like the real thing:
// cuts on the beat, poses on twos (twelve a second), holds and smash cuts. Every world draws with the eight palette
// roles of the mixer, so any palette, treatment and layout fits; no character, design, title, logo or studio from
// anywhere, no text or kana (the sound-effect marks are wavy shapes and triangles), no gore: the red is ink and paint.
import { Raster, clamp, lerp, bayer } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow, ease,
  beatLocked, hash, pickW, walker, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  psychopaint: { name: 'paint on glass', va: [[H, H], [H, M], [H, L]], themes: ['dream', 'rave', 'love'], pals: ['psychedelic', 'candy', 'vapor', 'neon', 'popprint'], fx: ['none', 'crt', 'vhs'], heavy: true },
  psychicaura: { name: 'psychic aura', va: [[H, H], [H, M], [H, L]], themes: ['dream', 'paranoia', 'glory'], pals: ['psychedelic', 'neon', 'candy', 'vapor', 'cinema'], fx: ['none', 'crt', 'manga'] },
  filmcuts: { name: 'film cuts', va: [[M, H], [L, H], [L, M]], themes: ['night', 'lonely', 'paranoia'], pals: ['redfilm', 'noir', 'cinema', 'mangaink'], fx: ['none', 'film', 'vhs'] },
  inksplatter: { name: 'red ink', va: [[M, H], [L, H], [L, M]], themes: ['rage', 'street', 'war'], pals: ['redfilm', 'mangaink', 'noir', 'cinema'], fx: ['none', 'film', 'cards'] },
  posecrew: { name: 'dramatic poses', va: [[H, H], [M, H], [L, H]], themes: ['glory', 'rage', 'street'], pals: ['mangaink', 'popprint', 'psychedelic', 'benday', 'neon'], fx: ['none', 'manga', 'cards'] },
  palettewhip: { name: 'palette whip', va: [[H, H], [M, H], [L, H]], themes: ['rave', 'speed', 'street'], pals: ['popprint', 'benday', 'psychedelic', 'mangaink', 'neon', 'candy'], fx: ['none', 'manga', 'cards', 'crt'], heavy: true },
  mangapanels: { name: 'manga panels', va: [[H, H], [M, H], [L, H]], themes: ['speed', 'glory', 'play'], pals: ['mangaink', 'benday', 'popprint', 'noir'], fx: ['none', 'manga', 'cards'] },
  runningcrowd: { name: 'running crowd', va: [[H, H], [H, M], [M, M]], themes: ['speed', 'play', 'glory'], pals: ['cinema', 'candy', 'popprint', 'vapor', 'neon'], fx: ['none', 'manga', 'film'] },
  skypan: { name: 'tilt to the sky', va: [[H, H], [H, M], [M, M]], themes: ['dream', 'lonely', 'nature'], pals: ['vapor', 'candy', 'cinema', 'psychedelic', 'neon'], fx: ['none', 'film', 'vhs'] },
  rainbowburst: { name: 'rainbow burst', va: [[H, H], [H, M], [H, L]], themes: ['glory', 'rave', 'dream'], pals: ['psychedelic', 'neon', 'candy', 'vapor', 'popprint'], fx: ['none', 'crt', 'manga'], heavy: true },
  platformwind: { name: 'platform slipstream', va: [[M, H], [L, H], [L, M]], themes: ['speed', 'machine', 'lonely'], pals: ['redfilm', 'noir', 'cinema', 'vapor', 'neon'], fx: ['none', 'film', 'vhs'] },
  logoslam: { name: 'emblem slam', va: [[H, H], [H, M], [M, M]], themes: ['glory', 'play', 'rave'], pals: ['popprint', 'neon', 'cinema', 'candy', 'psychedelic', 'benday'], fx: ['none', 'crt', 'cards'], heavy: true, geo: true },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the kinds tables below weigh their entries by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bpsOf = (f) => (f.bpm ? f.bpm / 60 : 2);
// the colour a pitch class lights things in
const PC_COL = [HOT, COOL, BRIGHT, LMID, HOT, COOL, BRIGHT, HOT, COOL, LMID, BRIGHT, HOT];
// the posterized paint box the psychedelic worlds cycle through: warm, light, cold, down to dark
const RAMP = [HOT, BRIGHT, LMID, COOL, MID, DARK];
// the gravity every falling thing shares, in cells per second squared (the same as `particles`)
const G = (N) => N * 1.6;
// the wind of a frame: how far above its average the treble is, gusting with the treble clock; 0..~1.3
const windOf = (f) => (0.2 + 0.8 * f.rel.trebDrive) * (1 + 0.3 * Math.sin(f.rel.trebClock * 2.1));
// animating on twos: a time held for two frames of film, so poses and boiling lines change twelve times a second
const twos = (t) => Math.floor(t * 12) / 12;
// a one-per-beat tick when the beat is locked, a free-running one at the tempo otherwise
function beatTick(w, f, dt, key = 'beatPh') {
  if (beatLocked(f)) return f.beat.on;
  w[key] = (w[key] || 0) + dt * bpsOf(f);
  if (w[key] < 1) return false;
  w[key] -= 1; // keep the remainder: the tempo must not depend on the frame rate
  return true;
}
// where we are in beats (call once a frame): a count of our own, free-running at the tempo, that follows the beat's
// count and phase while the beat is locked; when the lock comes (or comes back) it carries on from where it was,
// snapped to the nearest beat, so the beat finding or losing its lock never throws anything hundreds of beats on
function beatPos(w, f, dt) {
  if (beatLocked(f)) {
    const b = f.beat.count + f.beat.phase;
    if (!w.bLock) { w.bLock = true; w.bOff = Math.round((w.bpos || 0) - b); }
    return (w.bpos = b + w.bOff);
  }
  w.bLock = false;
  return (w.bpos = (w.bpos || 0) + dt * bpsOf(f));
}

// an underdamped spring stepped exactly, so it neither blows up nor drifts at any frame rate: o[k] toward `to`, its
// velocity in o[kv], natural frequency w0 (radians a second), damping ratio z < 1 (how far it overshoots)
function spring(o, k, kv, to, dt, w0, z) {
  const a = z * w0, wd = w0 * Math.sqrt(1 - z * z), e = Math.exp(-a * dt), c = Math.cos(wd * dt), s = Math.sin(wd * dt), d = o[k] - to, v = o[kv];
  o[k] = to + e * (d * c + ((v + a * d) / wd) * s);
  o[kv] = e * (v * c - ((a * v + w0 * w0 * d) / wd) * s);
}

// a disc (ri = 0) or a ring between ri and ro by scanlines, cheap at any size; `sy` squashes it into an ellipse
function span(r, cx, cy, ri, ro, c, sy = 1) {
  const N = r.N, buf = r.buf, y0 = Math.max(0, Math.floor(cy - ro * sy)), y1 = Math.min(N - 1, Math.ceil(cy + ro * sy));
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / sy, oo = ro * ro - dy * dy;
    if (oo <= 0) continue;
    const xo = Math.sqrt(oo), ii = ri * ri - dy * dy, xi = ii > 0 ? Math.sqrt(ii) : 0, row = y * N;
    if (xi <= 0) { const a = Math.max(0, Math.round(cx - xo)), b = Math.min(N, Math.round(cx + xo)); if (b > a) buf.fill(c, row + a, row + b); continue; }
    let a = Math.max(0, Math.round(cx - xo)), b = Math.min(N, Math.round(cx - xi));
    if (b > a) buf.fill(c, row + a, row + b);
    a = Math.max(0, Math.round(cx + xi)); b = Math.min(N, Math.round(cx + xo));
    if (b > a) buf.fill(c, row + a, row + b);
  }
}

// point lists reused for the turned shapes, one per vertex count, so drawing a shape allocates nothing of its own
const POOL = Array.from({ length: 33 }, (_, n) => Array.from({ length: n }, () => [0, 0]));
// a shape from unit points `P` (flat x0, y0, x1, y1, ...) scaled by `s`, turned by `a` and placed at (x, y)
function shape(r, P, x, y, s, a, c, sx = 1) {
  const n = P.length >> 1, out = POOL[n], cs = Math.cos(a) * s, sn = Math.sin(a) * s;
  for (let i = 0; i < n; i++) { const px = P[2 * i] * sx, py = P[2 * i + 1]; out[i][0] = x + px * cs - py * sn; out[i][1] = y + px * sn + py * cs; }
  r.poly(out, c);
}
// unit points moved so their bounding box is centred on the origin, with its half extents (for resting on the ground)
function centred(P) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < P.length; i += 2) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); }
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  return { P: P.map((v, i) => v - (i % 2 ? my : mx)), hx: (x1 - x0) / 2, hy: (y1 - y0) / 2 };
}

// the joint angles of a pose (radians; a limb at 0 hangs straight down, + swings it toward +x): `lean` tips the torso,
// `hd` the head, `tw` is how wide the shoulders read as the body turns
const PK = ['lean', 'hd', 'aL', 'eL', 'aR', 'eR', 'lL', 'kL', 'lR', 'kR', 'tw'];
const pose = (lean, hd, aL, eL, aR, eR, lL, kL, lR, kR, tw) => ({ lean, hd, aL, eL, aR, eR, lL, kL, lR, kR, tw });
const STAND = pose(0, 0, -0.12, 0.1, 0.12, -0.1, -0.06, 0, 0.06, 0, 0.8);
// the same pose seen in a mirror
function mirrorPose(P, out) {
  out.lean = -P.lean; out.hd = -P.hd; out.tw = P.tw;
  out.aL = -P.aR; out.eL = -P.eR; out.aR = -P.aL; out.eR = -P.eL;
  out.lL = -P.lR; out.kL = -P.kR; out.lR = -P.lL; out.kR = -P.kL;
  return out;
}
const J = { x: 0, y: 0 }; // where the last limb ended
// a limb from (x0, y0): the upper part at angle a, the lower bent on by k, a joint between
function limb(r, x0, y0, a, l1, k, l2, wd, c) {
  const x1 = x0 + Math.sin(a) * l1, y1 = y0 + Math.cos(a) * l1, x2 = x1 + Math.sin(a + k) * l2, y2 = y1 + Math.cos(a + k) * l2;
  r.stroke(x0, y0, x1, y1, wd, c);
  r.stroke(x1, y1, x2, y2, wd, c);
  r.disc(x1, y1, wd * 0.5, c);
  J.x = x2; J.y = y2;
}
const RIG = { hx: 0, hy: 0, hr: 0, sx: 0, sy: 0, top: 0, hip: 0 };
// the knee angle that brings a leg (the thigh at `a`, lengths l1 and l2) down to reach `e` below the hip, bending the
// way the knee already bends
const bendTo = (a, k, e, l1, l2) => (k >= 0 ? 1 : -1) * Math.acos(clamp((e - l1 * Math.cos(a)) / l2, -1, 1)) - a;
// a jointed silhouette `h` tall standing at (x, base) in pose `P`: the hips sit so the lower foot is on the ground
// (`air` lifts it off, `heft` thickens the limbs); with `ol` >= 0 a heavy outline `lw` thick in that role goes round it
// first; with `plant` both feet stand on the ground (the longer leg's knee gives, so the stance sinks instead of one
// foot hovering)
function rig(r, x, base, h, P, col, ol = -1, lw = 0, air = 0, heft = 1, plant = false) {
  const th = h * 0.3, l1 = h * 0.235, l2 = h * 0.235, u1 = h * 0.16, u2 = h * 0.16, hr = h * 0.075, wd = Math.max(1, h * 0.065 * heft), hw = h * 0.05;
  const eL = l1 * Math.cos(P.lL) + l2 * Math.cos(P.lL + P.kL), eR = l1 * Math.cos(P.lR) + l2 * Math.cos(P.lR + P.kR);
  let kL = P.kL, kR = P.kR;
  if (plant && eL > eR) kL = bendTo(P.lL, kL, eR, l1, l2); else if (plant && eR > eL) kR = bendTo(P.lR, kR, eL, l1, l2);
  const hip = base - (plant ? Math.min(eL, eR) : Math.max(eL, eR)) - air;
  const nx = Math.cos(P.lean), ny = Math.sin(P.lean), sw = h * 0.1 * P.tw, sx = x + ny * th, sy = hip - nx * th, ha = P.lean + P.hd;
  const hx = sx + Math.sin(ha) * hr * 1.7, hy = sy - Math.cos(ha) * hr * 1.7;
  for (let pass = ol >= 0 ? 0 : 1; pass < 2; pass++) {
    const c = pass ? col : ol, e = pass ? 0 : 2 * lw, Wd = wd + e;
    limb(r, x - hw, hip, P.lL, l1, kL, l2, Wd, c);
    r.disc(J.x, J.y, Wd * 0.6, c);
    limb(r, x + hw, hip, P.lR, l1, kR, l2, Wd, c);
    r.disc(J.x, J.y, Wd * 0.6, c);
    r.stroke(x, hip, sx, sy, Math.max(Wd, sw * 1.5 + e), c); // the torso
    r.stroke(sx - nx * sw, sy - ny * sw, sx + nx * sw, sy + ny * sw, Wd, c); // the shoulders
    limb(r, sx - nx * sw, sy - ny * sw, P.aL, u1, P.eL, u2, Wd * 0.85, c);
    r.disc(J.x, J.y, Wd * 0.55, c);
    limb(r, sx + nx * sw, sy + ny * sw, P.aR, u1, P.eR, u2, Wd * 0.85, c);
    r.disc(J.x, J.y, Wd * 0.55, c);
    r.disc(hx, hy, hr + e / 2, c);
  }
  RIG.hx = hx; RIG.hy = hy; RIG.hr = hr; RIG.sx = sx; RIG.sy = sy; RIG.top = hy - hr; RIG.hip = hip;
  return RIG;
}

// a runner seen from the front, coming at us: `ph` the gait in cycles (a step with each foot per cycle, the feet
// striking at 0 and 0.5), the swing knee lifting toward us so that leg reads shorter, the arms pumping against the
// legs, the body highest in the flight between strikes; `amp` 1 is a sprint, ~0.35 a walk; `bw` the build's breadth
function sprinter(r, x, base, h, ph, amp, bw, col, hair = 0, air = 0, tuck = 0) {
  const s = Math.sin(ph * TAU), bob = Math.abs(s) * h * 0.035 * amp, legH = h * 0.46, hip = base - legH - bob - air, hw = h * 0.065 * bw;
  const lw = Math.max(1, h * 0.075 * bw), sh = hip - h * 0.3, sw = h * 0.12 * bw, head = h * 0.085;
  for (let k = -1; k <= 1; k += 2) {
    const lift = Math.max(tuck, Math.max(0, k < 0 ? s : -s) * amp), hx = x + k * hw, knee = hip + legH * (0.5 - 0.32 * lift), foot = base - air - legH * 0.42 * lift;
    r.stroke(hx, hip, hx - k * hw * 0.25 * lift, knee, lw * (1 + 0.25 * lift), col); // the thigh, foreshortened as it comes at us
    r.stroke(hx - k * hw * 0.25 * lift, knee, hx + k * hw * 0.1, foot, lw, col);
    r.rect(hx + k * hw * 0.1 - lw * 0.7, foot - lw * 0.5, lw * 1.4, lw * 0.9, col);
    // the arm on this side pumps with the other leg: forward and up to the chin, or back and down by the hip
    const fw = tuck > 0 ? 1 : (k < 0 ? -s : s) * 0.5 * amp + 0.5, ex = x + k * sw * 1.35, ey = sh + h * 0.13, hx2 = x + k * lerp(sw * 1.5, sw * 0.45, fw), hy2 = lerp(sh + h * 0.24, sh - h * 0.02, fw);
    r.stroke(x + k * sw, sh, ex, ey, lw * 0.85, col);
    r.stroke(ex, ey, hx2, hy2, lw * 0.85, col);
    r.disc(hx2, hy2, lw * 0.55, col);
  }
  r.poly([[x - sw, sh], [x + sw, sh], [x + hw * 1.3, hip + lw * 0.3], [x - hw * 1.3, hip + lw * 0.3]], col);
  if (hair) r.disc(x, sh - head * 1.2, head * 1.35, col); // long hair blown out behind the head
  r.disc(x, sh - head * 1.1, head, col);
  return sh - head * 2.1;
}

// long hair off a head at (x, hy) of a figure `h` tall: swept back and up by the wind, hanging when it is still
function hairOf(r, x, hy, head, h, wind, col) {
  const lift = Math.min(1, Math.abs(wind)), side = wind < 0 ? -1 : 1, len = h * (0.22 + 0.22 * lift), sag = h * 0.22 * (1 - lift), lx = x + side * (head * 0.45 + len);
  r.poly([[x - head * 0.5, hy - head * 0.35], [x + head * 0.5, hy - head * 0.35], [lx, hy - head * 0.1 + sag], [lx - side * len * 0.2, hy + head * 0.5 + sag], [x - side * head * 0.35, hy + head * 0.55]], col);
}

// a figure standing side-on in a long coat: the hem and the hair stream downwind (`wind` signed, + blows to the
// right) and flap quicker the harder it blows (`ph` the flap clock); the body itself does not move
function coatFigure(r, x, base, h, col, wind, ph, u, hair = true) {
  const side = wind < 0 ? -1 : 1, lift = Math.min(1, Math.abs(wind)), head = h * 0.1, hy = base - h + head, sh = hy + head * 1.5, hip = base - h * 0.47;
  r.rect(x - h * 0.065, hip, h * 0.055, base - hip, col);
  r.rect(x + h * 0.01, hip, h * 0.055, base - hip, col);
  const fl = Math.sin(ph) * h * 0.035 * lift, hem = base - h * 0.17, out = h * (0.06 + 0.3 * lift), up = h * 0.16 * lift;
  const dx = side > 0 ? [h * 0.1, h * 0.1 + out] : [-h * 0.1 - out, -h * 0.1]; // the downwind hem goes out and up
  r.poly([[x - h * 0.09, sh], [x + h * 0.09, sh], [x + dx[1], hem - (side > 0 ? up : 0) + fl], [x + (dx[0] + dx[1]) / 2, hem + fl * 0.5], [x + dx[0], hem - (side < 0 ? up : 0) + fl]], col);
  r.stroke(x + side * h * 0.05, sh + h * 0.03, x + side * h * 0.07, hip + h * 0.05, Math.max(1, h * 0.05), col); // an arm by the side
  r.disc(x, hy, head, col);
  r.rect(x - head * 0.5, hy + head * 0.7, head, sh - hy - head * 0.7 + 1, col);
  if (hair) hairOf(r, x, hy, head * 2, h, wind, col);
  return hy - head;
}

// a lumpy cloud of discs, `w` wide and `h` high
function cloud(r, x, y, w, h, col) {
  r.disc(x, y, h * 0.5, col);
  r.disc(x - w * 0.3, y + h * 0.1, h * 0.38, col);
  r.disc(x + w * 0.32, y + h * 0.12, h * 0.4, col);
  r.rect(x - w * 0.3, y, w * 0.62, h * 0.45, col);
}

// film grain: a sprinkle of dimmed cells between rows y0 and y1
function grain(r, rnd, amt, y0, y1) {
  const N = r.N, buf = r.buf, n = (y1 - y0) * N;
  for (let k = Math.round(n * amt); k > 0; k--) { const i = y0 * N + Math.floor(rnd() * n); if (buf[i] < 8) buf[i] += DIM; }
}

// speed lines out from (cx, cy): `n` of them from about r0 to past the frame, dealt afresh with `seed`
function speedLines(r, cx, cy, n, r0, seed, c1, c2) {
  const N = r.N;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash(i, seed) * 0.25, l0 = r0 * (0.75 + 0.7 * hash(i, seed + 7)), ca = Math.cos(a), sa = Math.sin(a);
    r.line(cx + ca * l0, cy + sa * l0, cx + ca * N * 1.5, cy + sa * N * 1.5, i % 2 ? c1 : c2);
  }
}

// Rigid shards of a frozen frame `src`: each a convex piece (local points `p` round its centroid, flat), now at
// (x, y) turned by `a`, every cell sampled back from where it was cut out at (sx, sy): the picture rides on the piece.
// `cutShards` cuts the pieces from convex polygons and throws them out from (ox, oy).
function cutShards(list, polys, ox, oy, N, rnd, power) {
  for (const P of polys) {
    const n = P.length >> 1;
    let cx = 0, cy = 0;
    for (let k = 0; k < n; k++) { cx += P[2 * k] / n; cy += P[2 * k + 1] / n; }
    const p = new Float32Array(2 * n);
    for (let k = 0; k < n; k++) { p[2 * k] = P[2 * k] - cx; p[2 * k + 1] = P[2 * k + 1] - cy; }
    const dx = cx - ox, dy = cy - oy, d = Math.hypot(dx, dy) || 1, sp = power * N * (0.5 + 0.6 * rnd()) * (0.4 + d / N);
    list.push({ p, v: new Float32Array(2 * n), n, x: cx, y: cy, sx: cx, sy: cy, a: 0, vx: (dx / d) * sp, vy: (dy / d) * sp - power * N * (0.5 + 0.5 * rnd()), w: (rnd() - 0.5) * 6 * power });
  }
}
// they fly and tumble under gravity (rigid: a steady spin about the centroid, which falls on its parabola, stepped
// exactly); returns the ones still on screen
function drawShards(W, list, src, edge) {
  const { r, N, dt } = W, buf = r.buf, g = G(N);
  for (const q of list) {
    q.x += q.vx * dt; q.y += q.vy * dt + 0.5 * g * dt * dt; q.vy += g * dt; q.a += q.w * dt;
    const c = Math.cos(q.a), s = Math.sin(q.a), n = q.n, P = q.p, V = q.v;
    let y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < n; k++) { const lx = P[2 * k], ly = P[2 * k + 1], X = q.x + lx * c - ly * s, Y = q.y + lx * s + ly * c; V[2 * k] = X; V[2 * k + 1] = Y; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
    q.top = y0;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(N, Math.ceil(y1)); y++) {
      const yc = y + 0.5;
      let xa = Infinity, xb = -Infinity;
      for (let k = 0, j = n - 1; k < n; j = k++) {
        const ya = V[2 * j + 1], yb = V[2 * k + 1];
        if ((ya <= yc) !== (yb <= yc)) { const xx = V[2 * j] + ((yc - ya) / (yb - ya)) * (V[2 * k] - V[2 * j]); if (xx < xa) xa = xx; if (xx > xb) xb = xx; }
      }
      const a0 = Math.max(0, Math.round(xa)), a1 = Math.min(N, Math.round(xb)), dy = yc - q.y;
      for (let x = a0; x < a1; x++) {
        const dx = x + 0.5 - q.x, sx = (q.sx + dx * c + dy * s) | 0, sy = (q.sy - dx * s + dy * c) | 0;
        buf[y * N + x] = sx >= 0 && sy >= 0 && sx < N && sy < N ? src[sy * N + sx] : edge;
      }
      if (a1 > a0) { buf[y * N + a0] = edge; buf[y * N + a1 - 1] = edge; } // the cut edge catches the light
    }
  }
  return list.filter((q) => q.top < N);
}

// a whip pan: every row slid along by `off` and smeared over `len` cells (a dithered motion blur along x)
function whipBlur(r, off, len, tmp) {
  const N = r.N, buf = r.buf;
  for (let y = 0; y < N; y++) {
    const row = y * N;
    tmp.set(buf.subarray(row, row + N));
    for (let x = 0; x < N; x++) { const sx = (x - off - ((x * 7 + y * 13) % len)) % N; buf[row + x] = tmp[sx < 0 ? sx + N : sx]; }
  }
}

// things knocked loose and lifted, as unit shapes centred on their box: a rock, a boulder, a car (wheels drawn
// apart), a lamp post, a road sign, a bench, a bin, a length of pipe; `s` sizes them in cells at N = 125 to the scale
// of a person 1.75 m tall standing 0.15 of the frame high (a car 4.2 m long, a lamp post 4.5 m), and the worlds scale
// them by distance; `st` is the angle step they come to rest on
const DEBRIS = {
  rock: { ...centred([-1, 0.4, -0.7, -0.5, 0.2, -0.8, 0.9, -0.3, 1, 0.4, 0.4, 0.8, -0.5, 0.75]), s: 4.8, st: 0 },
  boulder: { ...centred([-1, 0.5, -0.9, -0.3, -0.3, -0.85, 0.5, -0.7, 1, -0.1, 0.85, 0.6, 0, 0.8]), s: 9.6, st: 0 },
  car: { ...centred([-1.7, 0.45, -1.7, -0.15, -0.95, -0.3, -0.55, -0.85, 0.55, -0.85, 1.0, -0.3, 1.7, -0.2, 1.7, 0.45]), s: 13, st: Math.PI, wheels: true },
  lamp: { ...centred([-0.12, 2, 0.12, 2, 0.12, -1.65, 0.85, -1.65, 0.85, -1.9, -0.12, -2]), s: 12, st: Math.PI / 2 },
  sign: { ...centred([-0.08, 1.5, 0.08, 1.5, 0.08, -0.25, 0.6, -0.8, 0, -1.4, -0.6, -0.8, -0.08, -0.25]), s: 9, st: Math.PI / 2 },
  bench: { ...centred([-1.3, -0.15, 1.3, -0.15, 1.3, 0.1, 1.05, 0.1, 1.05, 0.6, 0.85, 0.6, 0.85, 0.1, -0.85, 0.1, -0.85, 0.6, -1.05, 0.6, -1.05, 0.1, -1.3, 0.1]), s: 7.4, st: Math.PI },
  bin: { ...centred([-0.55, -0.8, 0.55, -0.8, 0.45, 0.8, -0.45, 0.8]), s: 6, st: Math.PI / 2 },
  pipe: { ...centred([-2, -0.3, 2, -0.3, 2, 0.3, -2, 0.3]), s: 8, st: Math.PI / 2 },
};
// how high its centre sits when it rests on the ground at angle `a` (the half height of its turned box)
const restOf = (D, a, s) => (Math.abs(Math.cos(a)) * D.hy + Math.abs(Math.sin(a)) * D.hx) * s;
// a piece of debris drawn at (x, y) (y its centre on screen), turned by its angle
function drawDebris(r, k, x, y, u, col, wheel) {
  const D = DEBRIS[k.k], s = D.s * u * k.z;
  shape(r, D.P, x, y, s, k.rot, col);
  if (D.wheels) for (let i = -1; i <= 1; i += 2) { const px = i * 1.0, py = D.hy - 0.45, c = Math.cos(k.rot), sn = Math.sin(k.rot); r.disc(x + (px * c - py * sn) * s, y + (px * sn + py * c) * s, 0.42 * s, wheel); }
}
// one step of a piece's life: resting, lifted toward `want` cells over its rest on a soft buoyant spring (it rises,
// slows and hangs, turning slowly), or thrown (gravity, a bounce that loses most of its speed, then it settles)
function debrisStep(k, want, dt, g) {
  const D = DEBRIS[k.k], s = D.s * k.z * k.u;
  if (k.mode === 1) {
    spring(k, 'y', 'vy', restOf(D, k.rot, s) + want, dt, 1.3, 0.9);
    k.rot += k.w * dt;
  } else if (k.mode === 2) {
    // the flight stepped exactly (a parabola does not depend on the frame rate), the bounce at the instant it lands
    const e = Math.exp(-dt * 0.3), rest = restOf(D, k.rot + k.w * dt, s), y0 = k.y, v0 = k.vy;
    k.x += k.vx * (1 - e) / 0.3; k.vx *= e; k.rot += k.w * dt;
    k.y = y0 + v0 * dt - 0.5 * g * dt * dt; k.vy = v0 - g * dt;
    if (k.y <= rest && k.vy < 0) {
      const tc = y0 > rest ? (v0 + Math.sqrt(v0 * v0 + 2 * g * (y0 - rest))) / g : 0, vc = Math.min(0, v0 - g * tc), left = Math.max(0, dt - tc);
      if (vc < -g * 0.12) { const vb = -vc * 0.3; k.w *= 0.5; k.vx *= 0.6; k.y = rest + vb * left - 0.5 * g * left * left; k.vy = vb - g * left; if (k.y < rest) { k.y = rest; k.vy = 0; } }
      else { k.y = rest; k.vy = 0; k.vx = 0; k.mode = 0; }
    }
  } else {
    if (D.st > 0) k.rot = follow(k.rot, Math.round(k.rot / D.st) * D.st, dt, 0.12); // it tips onto a face
    k.w = 0; k.vy = 0;
    k.y = restOf(D, k.rot, s);
  }
}

// ---------------------------------------------------------------------------------------------- paint on glass
// Paint on glass: a silhouette of thick paint morphing on the beat from a figure to a flower to a face to a spiral
// (the signed distances of two shapes blended), its outline boiling (jittered afresh on twos), strokes of paint
// round it cycling through a posterized ramp with the mids. A kick swells the paint, a snare sends a ripple out, a
// note turns the inner colours, the treble boils the line harder. Kinds: contour rings, clear glass with a few
// strokes, a swirl; a drop bursts the figure into radiating rainbow paint thrown out across the glass.
const PAINT_W = { contour: [2, 2, 3], glass: [3, 2, 1], swirl: [1, 2, 3] };
const PAINT_K = { contour: 0, glass: 1, swirl: 2 };
const sdCap = (px, py, ax, ay, bx, by, rr) => { const bax = bx - ax, bay = by - ay, h = clamp(((px - ax) * bax + (py - ay) * bay) / (bax * bax + bay * bay)); return Math.hypot(px - ax - bax * h, py - ay - bay * h) - rr; };
const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k); return lerp(b, a, h) - k * h * (1 - h); };
// the four shapes as signed distances (negative inside), in units of the frame
function paintShape(kind, x, y) {
  if (kind === 0) { // a figure, arms flung up
    let d = Math.hypot(x - 0.5, y - 0.25) - 0.075;
    d = smin(d, sdCap(x, y, 0.5, 0.36, 0.5, 0.56, 0.07), 0.04);
    d = smin(d, sdCap(x, y, 0.47, 0.38, 0.31, 0.2, 0.034), 0.03);
    d = smin(d, sdCap(x, y, 0.53, 0.38, 0.69, 0.2, 0.034), 0.03);
    d = smin(d, sdCap(x, y, 0.47, 0.56, 0.38, 0.84, 0.042), 0.03);
    return smin(d, sdCap(x, y, 0.53, 0.56, 0.62, 0.84, 0.042), 0.03);
  }
  if (kind === 1) { // a flower: six round petals on a stem with a leaf
    const dx = x - 0.5, dy = y - 0.38, rr = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const d = Math.min((rr - (0.16 + 0.07 * Math.cos(6 * a))) * 0.75, sdCap(x, y, 0.5, 0.5, 0.5, 0.88, 0.018));
    return smin(d, sdCap(x, y, 0.5, 0.74, 0.65, 0.65, 0.035), 0.02);
  }
  if (kind === 2) { // a mask of a face: an oval with the eyes and the mouth cut through
    const e = (Math.hypot((x - 0.5) / 0.22, (y - 0.47) / 0.29) - 1) * 0.22;
    return Math.max(e, -Math.min(Math.hypot(x - 0.42, y - 0.42) - 0.04, Math.hypot(x - 0.58, y - 0.42) - 0.04, sdCap(x, y, 0.43, 0.61, 0.57, 0.61, 0.022)));
  }
  const dx = x - 0.5, dy = y - 0.48, rr = Math.hypot(dx, dy), v = rr / 0.13 - Math.atan2(dy, dx) / TAU, fr = v - Math.round(v); // a spiral band of three turns, open between them
  return Math.max(Math.abs(fr) * 0.13 - 0.025, rr - 0.38);
}
// how far a kick may swell each shape: the spiral's gaps have to stay open
const PAINT_SW = [1, 1, 1, 0.35];
// the paint a note fills the shape with: the accents and the light and middle values, never the darkest, so the black
// line and the eyes cut into it always show
const PAINT_IN = [HOT, COOL, BRIGHT, MID, LMID, HOT];
// a smooth noise for the boil and every cell's angle and distance from the middle; the four shapes' distance fields
// are made when first needed (paintField)
function paintFields(w, N) {
  const NN = N * N, S = Math.max(3, Math.round(N / 14));
  Object.assign(w, { N, fields: [null, null, null, null], nz: new Float32Array(NN), ang: new Uint8Array(NN), rad: new Float32Array(NN) });
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x, px = (x + 0.5) / N, py = (y + 0.5) / N;
      const gx = x / S, gy = y / S, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      w.nz[i] = lerp(lerp(hash(ix, iy), hash(ix + 1, iy), sx), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx), sy);
      const dx = px - 0.5, dy = py - 0.48;
      w.ang[i] = Math.floor((Math.atan2(dy, dx) / TAU + 1) * 256) & 255;
      w.rad[i] = Math.hypot(dx, dy) * N;
    }
}
// one shape's distance field, made the first time the paint flows into it (so a world swapped in never stalls on all
// four); past 128 cells on a grid of every other cell, filled in between (the fields are smooth), so the frame that
// makes one stays inside the budget
function paintField(w, k) {
  if (w.fields[k]) return w.fields[k];
  const N = w.N, F = (w.fields[k] = new Float32Array(N * N));
  if (N <= 128) { for (let y = 0, i = 0; y < N; y++) for (let x = 0; x < N; x++, i++) F[i] = paintShape(k, (x + 0.5) / N, (y + 0.5) / N) * N; return F; }
  const M = (N >> 1) + 2, g = new Float32Array(M * M);
  for (let gy = 0; gy < M; gy++) for (let gx = 0; gx < M; gx++) g[gy * M + gx] = paintShape(k, (2 * gx + 0.5) / N, (2 * gy + 0.5) / N) * N;
  for (let y = 0, i = 0; y < N; y++) {
    const ty = (y & 1) * 0.5, r0 = (y >> 1) * M;
    for (let x = 0; x < N; x++, i++) { const tx = (x & 1) * 0.5, j = r0 + (x >> 1); F[i] = (g[j] + (g[j + 1] - g[j]) * tx) * (1 - ty) + (g[j + M] + (g[j + M + 1] - g[j + M]) * tx) * ty; }
  }
  return F;
}

const psychopaint = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, PAINT_W, band), from: 0, to: 0, mt: 9, cyc: 0, hue: 0, swell: 0, rips: [], burst: 9, blobs: [], beats: 0 });
    w.to = w.from = Math.floor(rnd() * 4);
    paintFields(w, N);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = bpsOf(f), cx = 0.5 * N, cy = 0.48 * N;
    if (w.N !== N) paintFields(w, N);
    for (const hh of hits) {
      if (isLow(hh)) { w.swell = Math.min(8 * u, w.swell + 3 * u * hh.strength); s.shake = Math.max(s.shake, 0.12 * hh.strength); }
      else if (hh.kind === 'snare') { if (w.rips.length < 4) w.rips.push({ R: 0.1 * N }); }
      else if (isTonal(hh)) w.hue = hh.pc % 6;
    }
    if (f.section === 'drop') { // the figure bursts: rainbow rays out from it and blobs of paint flung across the glass
      w.burst = 0;
      if (w.blobs.length > 48) w.blobs.length = 48;
      for (let k = 0; k < 48; k++) { const a = (k / 48) * TAU + rnd() * 0.1, v = N * (0.5 + rnd() * 0.9); w.blobs.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rr: (1.5 + rnd() * 2.5) * u, c: RAMP[k % 6] }); }
      s.shake = Math.max(s.shake, 0.6);
    } else if (f.section === 'change') { w.kind = rollW(rnd, PAINT_W, band); w.to = (w.to + 1 + Math.floor(rnd() * 3)) % 4; }
    // the morph: on the beat (every other one when calm) the paint flows from one shape to the next over half a beat
    if (beatTick(w, f, dt) && ++w.beats % (band ? 1 : 2) === 0) { w.from = w.to; w.to = (w.to + 1) % 4; w.mt = 0; }
    w.mt += dt;
    w.burst += dt;
    w.swell *= Math.exp(-dt * 5);
    w.cyc = (w.cyc + dt * (0.4 + 2.5 * f.rel.midDrive)) % 6;
    const m = ease(clamp(twos(w.mt) / (0.5 / bps))), A = paintField(w, w.from), B = paintField(w, w.to), nz = w.nz, ang = w.ang, rad = w.rad, buf = r.buf, NN = N * N;
    const off = Math.floor(hash(Math.floor(t * 12), 77) * NN), boil = (1 + 2 * f.rel.trebDrive) * u, lw = Math.max(1.3, (1.1 + 1.0 * f.level + 0.9 * f.beat.pulse) * u), lh = lw + 2.5 * u;
    const fo = 1 / ((2.6 + 2 * (1 - clamp(f.rel.bassDrive))) * u), cyc = w.cyc, hue = w.hue, kind = PAINT_K[w.kind], sw = w.swell * lerp(PAINT_SW[w.from], PAINT_SW[w.to], m);
    const bt = w.burst, Rb = bt < 2.4 ? N * 1.25 * (bt < 1.6 ? ease(bt / 0.8) : 1 - ease((bt - 1.6) / 0.8)) : -1, rk = 1 / (4 * u), rs = bt * 9;
    // the silhouette reads first: solid paint in the note's colour inside the shape, the boiling black ink line round
    // the outside of it (never eating into it), a margin of clear glass, and only then the strokes round it
    const inA = PAINT_IN[hue];
    for (let i = 0; i < NN; i++) {
      let j = i + off;
      if (j >= NN) j -= NN;
      const d = A[i] + (B[i] - A[i]) * m + (nz[j] - 0.5) * boil - sw;
      if (rad[i] < Rb) buf[i] = RAMP[(((ang[i] * 12) >> 8) + ((rad[i] * rk - rs + 6000) | 0)) % 6]; // the burst's rays
      else if (d < 0) buf[i] = inA;
      else if (d < lw) buf[i] = BLACK;
      else if (d < lh) buf[i] = BG;
      else {
        const k = kind === 2 ? ((d - lh) * fo + ang[i] * 0.047 - cyc + 6000) | 0 : ((d - lh) * fo - cyc + 6000) | 0;
        buf[i] = kind === 1 ? (k % 4 === 0 && d < 0.22 * N ? RAMP[(k >> 2) % 6] : BG) : RAMP[k % 6];
      }
    }
    // a snare's ripple running out through the paint
    w.rips = w.rips.filter((q) => { q.R += dt * N * 0.8; span(r, cx, cy, q.R - 1.2 * u, q.R + 1.2 * u, BRIGHT); return q.R < 0.85 * N; });
    // the flung paint slides out over the glass and drags to a stop where it sticks (the drag integrated exactly, so it
    // stops at the same place at any frame rate); it goes with the burst
    if (bt < 2.4) for (const p of w.blobs) {
      const k = Math.exp(-dt * 2.5), q = (1 - k) / 2.5;
      p.x += p.vx * q; p.y += p.vy * q;
      p.vx *= k; p.vy *= k;
      const rr = p.rr * (bt > 1.8 ? 1 - (bt - 1.8) / 0.6 : 1);
      if (rr > 0.3) { r.disc(p.x, p.y, rr + u, FIG); r.disc(p.x, p.y, rr, p.c); }
    } else if (w.blobs.length) w.blobs.length = 0;
    targets.push({ x: 0.3 * N, y: 0.15 * N, w: 0.4 * N, h: 0.75 * N });
  },
};

// ---------------------------------------------------------------------------------------------- psychic aura
// A small figure standing still while the world gives way round it: lamp posts, cars, signs and rocks lift off the
// ground on a buoyant rise and hang there turning slowly, the skyline bends away, a plain bar fills with the energy
// (no digits). When it is full, or on a drop, everything is blown upward in a rainbow shockwave and comes back down
// under gravity, bouncing and settling, and the bar starts again. A kick fills the bar and rings the ground, a snare
// jolts what floats, a note turns the aura, the beat pulses it. Kinds: a street, a quarry, a yard.
const AURA_W = { street: [3, 2, 2], quarry: [1, 2, 3], yard: [2, 2, 1] };
const AURA_SKY = [BG, BG, DARK + DIM, DARK, MID + DIM];
const AURA_SET = { street: ['lamp', 'car', 'rock', 'sign', 'car', 'lamp', 'rock', 'bin'], quarry: ['rock', 'boulder', 'pipe', 'rock', 'boulder', 'rock', 'pipe'], yard: ['bench', 'sign', 'rock', 'lamp', 'bin', 'rock', 'bench'] };

// the pieces of a kind, each at its own distance (z is its scale: 1 stands where the figure does, nearer is bigger and
// lower, its ground at hz + (g0 - hz) z), sorted far to near
function auraSet(w, rnd, N, u) {
  w.items = AURA_SET[w.kind].map((k, i) => {
    const side = i % 2 ? 1 : -1, z = 0.5 + rnd() * 0.75, x = 0.5 + side * (0.14 + (i >> 1) * 0.12 + rnd() * 0.04) * (z > 1 ? 1.3 : 1);
    return { k, x: x * N, y: restOf(DEBRIS[k], 0, DEBRIS[k].s * z * u), vx: 0, vy: 0, rot: 0, w: 0, mode: 0, th: 0.12 + rnd() * 0.5, hov: 0.12 + rnd() * 0.25, z, u };
  }).sort((a, b) => a.z - b.z);
  w.bld = Array.from({ length: 9 }, (_, i) => [i / 9 - 0.02 + rnd() * 0.02, 0.07 + rnd() * 0.06, 0.12 + rnd() * 0.2]);
}

// the figure: small, still, the hair lifting a little in its own field
function aFig(r, cx, g0, fh, meter) {
  const fg = rig(r, cx, g0, fh, STAND, FIG);
  r.poly([[fg.hx - fg.hr, fg.hy], [fg.hx + fg.hr, fg.hy], [fg.hx + fg.hr * 0.6, fg.hy - fg.hr * (1.6 + meter)], [fg.hx - fg.hr * 0.6, fg.hy - fg.hr * (1.4 + meter)]], FIG);
}

const psychicaura = {
  init(W) {
    const { w, rnd, N, u } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, AURA_W, band), meter: 0.2, cool: 0, rings: [], hue: 0, pulse: 0, flash: 0, cut: 0, bend: 0 });
    auraSet(w, rnd, N, u);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g0 = 0.8 * N, cx = 0.5 * N, grav = G(N), fh = 0.15 * N;
    const energy = clamp(0.45 * f.rel.bassDrive + 0.35 * f.level + 0.3 * f.rel.midDrive);
    const blow = (p) => { // the release: every piece thrown up and out, a rainbow shockwave, the bar emptied
      for (const k of w.items) { k.mode = 2; k.vy = Math.sqrt(2 * grav * N * (0.3 + 0.35 * rnd()) * p) * k.z; k.vx = (k.x - cx) * 0.5 * p; k.w = (rnd() - 0.5) * 7; } // up and out; on screen a far piece moves (and falls) less
      w.rings.push({ R: fh * 0.3, v: N * 1.1 * p });
      w.flash = 0.03; w.meter = 0; w.cool = 2.2; // a white frame, about 30 ms at any frame rate
      s.shake = Math.max(s.shake, 0.7);
    };
    for (const hh of hits) {
      if (isLow(hh)) { w.meter = clamp(w.meter + 0.05 * hh.strength); w.rings.push({ R: fh * 0.3, v: N * 0.5, thin: 1 }); s.shake = Math.max(s.shake, 0.12 * hh.strength); }
      else if (hh.kind === 'snare') { for (const k of w.items) if (k.mode === 1) k.vy += N * 0.12 * hh.strength * k.z; }
      else if (isTonal(hh)) w.hue = hh.pc % 6;
    }
    if (f.section === 'drop') blow(1.4);
    else if (f.section === 'change') { w.kind = rollW(rnd, AURA_W, band); auraSet(w, rnd, N, u); w.cut = 1; } // a cut to another place
    if (beatTick(w, f, dt)) { w.pulse = 1; w.rings.push({ R: fh * 0.3, v: N * 0.35, thin: 1 }); }
    w.meter = clamp(w.meter + dt * (energy - 0.32) * 0.35);
    if (w.meter >= 1) blow(1);
    w.cool -= dt; w.pulse *= Math.exp(-dt * 5);
    w.bend = follow(w.bend, w.meter * (0.4 + energy), dt, 0.3);
    // the sky and the skyline, its towers bent away from the figure as the power builds
    const hz = 0.62 * N;
    for (let k = 0; k < 5; k++) r.rect(0, (k / 5) * hz, N, hz / 5 + 1, AURA_SKY[k]);
    for (const [bx, bw, bh] of w.bld) {
      const x0 = bx * N, x1 = (bx + bw) * N, lean = ((x0 + x1) / 2 - cx) / N * w.bend * 0.35 * N, top = hz - bh * N * (1 - 0.15 * w.bend);
      r.poly([[x0, hz], [x1, hz], [x1 + lean, top], [x0 + lean, top]], DARK);
    }
    r.rect(0, hz, N, N - hz, DARK + DIM);
    r.rect(0, (hz + g0) / 2, N, N, MID + DIM);
    r.rect(0, g0, N, N - g0, MID);
    // the shockwaves: a release is six bands of the ramp, a kick or a beat one thin ring along the ground
    w.rings = w.rings.filter((q) => {
      q.R += q.v * dt;
      if (q.thin) span(r, cx, g0, q.R - u, q.R + u, LMID, 0.25);
      else for (let k = 0; k < 6; k++) span(r, cx, g0 - fh * 0.5, Math.max(0, q.R - (k + 1) * 4 * u), q.R - k * 4 * u, RAMP[(k + w.hue) % 6]);
      return q.R < (q.thin ? 0.7 * N : 1.6 * N);
    });
    // the aura round the figure: rings of the ramp growing with the bar, shimmering on twos
    const AR = fh * (0.45 + 1.1 * w.meter) * (1 + 0.15 * w.pulse), sh = Math.floor(t * 12);
    for (let k = 3; k >= 0; k--) { const R = AR * (0.55 + 0.15 * k) + (hash(k, sh) - 0.5) * 2 * u; span(r, cx, g0 - fh * 0.5, Math.max(0, R - 1.5 * u), R, RAMP[(k + w.hue + sh) % 6]); }
    // the pieces, far to near, the figure among them at its distance: lifted heights, gravity and throws all scale
    // with a piece's distance on screen; their shadows on the ground under them shrink as they rise
    let drawn = false;
    for (const k of w.items) {
      if (!drawn && k.z > 1) { drawn = true; aFig(r, cx, g0, fh, w.meter); }
      if (k.mode === 0 && w.cool <= 0 && w.meter > k.th) { k.mode = 1; k.w = (rnd() - 0.5) * 0.9; }
      else if (k.mode === 1 && w.meter < k.th - 0.1) k.mode = 2; // let go: it drops
      debrisStep(k, k.hov * N * k.z * clamp((w.meter - k.th) / (1 - k.th) + 0.3), dt, grav * k.z);
      if (k.x < -0.2 * N || k.x > 1.2 * N) { k.x = clamp(k.x, -0.2 * N, 1.2 * N); k.vx = -k.vx * 0.5; }
      const gy = hz + (g0 - hz) * k.z, sz = DEBRIS[k.k].hx * DEBRIS[k.k].s * k.z * u, far = clamp(k.y / (0.5 * N));
      r.rect(k.x - sz * (1 - 0.6 * far), gy, 2 * sz * (1 - 0.6 * far), Math.max(1, u * k.z), DARK);
      if (k.mode === 1) for (let q = 0; q < 4; q++) drawDebris(r, k, k.x + (q < 2 ? (q ? u : -u) : 0), gy - k.y + (q < 2 ? 0 : q === 2 ? u : -u), u, RAMP[(w.hue + sh) % 6], RAMP[(w.hue + sh) % 6]); // the glow of the hold on it
      drawDebris(r, k, k.x, gy - k.y, u, k.mode ? LMID : k.z < 0.8 ? MID + DIM : MID, DARK);
    }
    if (!drawn) aFig(r, cx, g0, fh, w.meter);
    targets.push({ x: cx - fh * 0.3, y: g0 - fh * 1.1, w: fh * 0.6, h: fh * 1.1 });
    // the bar, a plain frame filling up: no digits
    const bx = 0.06 * N, by = 0.06 * N, bw = 0.3 * N, bh = Math.max(3, 3 * u);
    r.frame(bx, by, bw, bh, FIG);
    r.rect(bx + 1, by + 1, (bw - 2) * w.meter, bh - 2, w.meter > 0.9 && sh % 2 ? BRIGHT : HOT);
    if (w.flash > 0 || w.cut > 0) { r.fill(WHITE); w.cut = 0; }
    w.flash -= dt;
  },
};

// ---------------------------------------------------------------------------------------------- film cuts
// A cinematic opening cut on the beat from a shot list: a figure in a lit doorway down a corridor in one-point
// perspective, a car at night with the street lamps going over, a long dinner table, a slow-motion walk toward the
// camera, a rooftop at dusk; letterboxed, with grain. The cuts come every beat to every fourth with the arousal, a
// snare is a smash cut with a one-frame white flash, a kick bumps the camera and flickers the light, a note colours
// the light, the camera creeps in with the bass. Kinds: the shot list, dealt afresh on a section change; a drop is a
// hard red frame with a huge silhouette against it.
const SHOT_W = { doorway: [3, 2, 1], carnight: [3, 2, 2], table: [2, 2, 1], walk: [2, 2, 2], roof: [1, 2, 3] };
const DUSK = [DARK, MID, HOT, LMID];
const BOKEH = [MID + DIM, LMID + DIM, HOT + DIM, COOL + DIM];

// down a corridor to a lit door with a figure in it; the camera dollies in (quicker with the bass, the distance
// integrated so it never jumps), the door's light lies along the floor and the figure's shadow stretches from its
// feet toward us
function shotDoorway(W, w) {
  const { r, N, f, targets } = W, cx = (0.45 + w.var * 0.1) * N, hz = 0.46 * N, F = 0.55 * N, A = 1.1, CH = 1.5, CE = 1.0;
  const Zc = Math.min(6.4, w.zc), zf = 9 - Zc, kC = A / CE, kF = A / CH, s = F / zf, fy = hz + CH * s;
  r.rect(0, 0, N, N, DARK + DIM);
  r.poly([[cx - kC * (hz + N), -N], [cx + kC * (hz + N), -N], [cx + A * s, hz - CE * s], [cx - A * s, hz - CE * s]], DARK);
  r.poly([[cx - kF * (2 * N - hz), 2 * N], [cx + kF * (2 * N - hz), 2 * N], [cx + A * s, fy], [cx - A * s, fy]], MID + DIM);
  for (let j = 1; j < 12; j++) { // the floor joints and the ceiling lamps, fixed in the corridor, coming at us as we move
    const z = 9 - j * 0.8 - Zc;
    if (z < 0.4) break;
    const y = hz + (CH * F) / z;
    if (y < N) r.rect(cx - (A * F) / z, y, (2 * A * F) / z, 1, DARK);
    if (j % 3 === 0) r.rect(cx - (0.15 * F) / z, hz - (CE * F) / z, (0.3 * F) / z, Math.max(1, (0.05 * F) / z), LMID);
  }
  r.rect(cx - A * s, hz - CE * s, 2 * A * s, (CE + CH) * s, MID);
  const dw = 0.45 * s, dh = 2 * s, lit = w.flick > 0 && (Math.floor(W.t * 15) & 1) ? LMID : w.lit, z2 = Math.max(1.2, zf * 0.45), z3 = Math.max(1.4, zf * 0.62);
  r.poly([[cx - dw, fy], [cx + dw, fy], [cx + (0.9 * F) / z2, hz + (CH * F) / z2], [cx - (0.9 * F) / z2, hz + (CH * F) / z2]], LMID + DIM);
  r.rect(cx - dw, fy - dh, 2 * dw, dh, lit);
  r.rect(cx - dw * 0.6, fy - dh * 0.9, dw * 1.2, dh * 0.9, lit === LMID ? BRIGHT : WHITE);
  r.poly([[cx - 0.1 * s, fy], [cx + 0.1 * s, fy], [cx + (0.22 * F) / z3, hz + (CH * F) / z3], [cx - (0.22 * F) / z3, hz + (CH * F) / z3]], DARK); // its shadow
  rig(r, cx, fy, 1.75 * s, STAND, BLACK);
  targets.push({ x: cx - dw, y: fy - dh, w: 2 * dw, h: dh });
}

// a car at night from the back seat: the road coming at us, a street lamp going over every beat (the speed is set
// so), the two in front from behind, rimmed with light as a lamp passes over
function shotCar(W, w) {
  const { r, N, u, targets } = W, cx = 0.5 * N, hz = 0.42 * N, F = 0.6 * N, CH = 1.2, sp = 12, d = w.dist;
  r.rect(0, 0, N, hz, BG);
  r.rect(0, hz, N, N - hz, DARK + DIM);
  r.poly([[cx - 1, hz], [cx + 1, hz], [cx + (3.5 / CH) * (2 * N - hz), 2 * N], [cx - (3.5 / CH) * (2 * N - hz), 2 * N]], DARK);
  for (let j = 13; j >= 0; j--) {
    const z0 = j * 4 - (d % 4) + 1, z1 = z0 + 1.6;
    if (z0 < 0.6) continue;
    const y0 = hz + (CH * F) / z0, y1 = hz + (CH * F) / z1;
    r.poly([[cx - (0.08 * F) / z0, y0], [cx + (0.08 * F) / z0, y0], [cx + (0.08 * F) / z1, y1], [cx - (0.08 * F) / z1, y1]], LMID + DIM);
  }
  let over = 0;
  for (let j = 7; j >= 0; j--) { // far to near
    const z = j * sp - (d % sp) + 0.8, side = (Math.floor(d / sp) + j) % 2 ? 1 : -1;
    if (z < 0.4) continue;
    const q = F / z, x = cx + side * 4 * q, yh = hz - 3.8 * q, yb = hz + CH * q, pw = Math.max(1, 0.08 * q);
    r.rect(x - pw / 2, yh, pw, yb - yh, DARK);
    r.disc(x - side * 0.35 * q, yh, Math.max(1, 0.45 * q), LMID + DIM);
    r.disc(x - side * 0.35 * q, yh, Math.max(1, 0.2 * q), BRIGHT);
    if (z < 3) over = Math.max(over, 1 - z / 3);
  }
  r.rect(0, 0, N, 0.07 * N, BLACK);
  r.poly([[0, 0], [0.13 * N, 0], [0.03 * N, 0.78 * N], [0, 0.78 * N]], BLACK);
  r.poly([[N, 0], [0.87 * N, 0], [0.97 * N, 0.78 * N], [N, 0.78 * N]], BLACK);
  r.rect(0, 0.76 * N, N, 0.24 * N, BLACK);
  for (let k = 0; k < 4; k++) r.rect((0.52 + k * 0.05) * N, 0.79 * N, 2 * u, Math.max(1, u), w.lit);
  span(r, 0.3 * N, 0.92 * N, 0.13 * N, 0.155 * N, DARK);
  for (let k = 0; k < 2; k++) {
    const x = (0.3 + k * 0.4) * N, y = 0.58 * N;
    if (over > 0.2) { r.disc(x, y - u * (1 + 2 * over), 0.075 * N, LMID); r.rect(x - 0.15 * N, y + 0.08 * N - u * 2 * over, 0.3 * N, 0.05 * N, LMID); }
    r.disc(x, y, 0.075 * N, BLACK);
    r.poly([[x - 0.17 * N, N], [x + 0.17 * N, N], [x + 0.15 * N, y + 0.09 * N], [x - 0.15 * N, y + 0.09 * N]], BLACK);
    r.rect(x - 0.035 * N, y + 0.05 * N, 0.07 * N, 0.05 * N, BLACK);
  }
  targets.push({ x: 0.2 * N, y: 0.5 * N, w: 0.6 * N, h: 0.2 * N });
}

// a long dinner table in one-point perspective, diners down both sides and one at its head against the window;
// they turn to look at us on a snare, the candles flicker with the treble and flare on the beat
function shotTable(W, w) {
  const { r, N, u, t, f, targets } = W, cx = 0.5 * N, hz = 0.4 * N, F = 0.6 * N, dz = w.st * 0.25, ty = (z) => hz + (0.45 * F) / z;
  r.rect(0, 0, N, hz, MID + DIM);
  r.rect(0, hz, N, N - hz, DARK);
  const zb = 12 - dz, sb = F / zb;
  r.rect(cx - 3 * sb, hz - 2.2 * sb, 6 * sb, 3.5 * sb, DARK);
  r.rect(cx - 0.8 * sb, hz - 1.6 * sb, 1.6 * sb, 1.4 * sb, w.lit);
  const zn = 1.3, zf = 11 - dz;
  r.poly([[cx - (0.6 * F) / zn, ty(zn)], [cx + (0.6 * F) / zn, ty(zn)], [cx + (0.6 * F) / zf, ty(zf)], [cx - (0.6 * F) / zf, ty(zf)]], LMID + DIM);
  const sh = F / (zf + 0.4);
  r.rect(cx - 0.2 * sh, ty(zf + 0.4) - 0.5 * sh, 0.4 * sh, 0.5 * sh, BLACK);
  r.disc(cx, ty(zf + 0.4) - 0.63 * sh, 0.12 * sh, BLACK);
  for (let j = 6; j >= 0; j--) {
    const z = 2.2 + j * 1.45 - dz;
    if (z < 1.2) continue;
    const s = F / z, y = ty(z);
    for (let side = -1; side <= 1; side += 2) {
      const x = cx + side * 0.95 * s;
      r.rect(x - 0.24 * s, y - 0.75 * s, 0.48 * s, 0.85 * s, DARK + DIM); // the chair back
      r.rect(x - 0.21 * s, y - 0.45 * s, 0.42 * s, 0.7 * s, BLACK);
      r.disc(x, y - 0.58 * s, 0.12 * s, BLACK);
      if (w.turn > 0.3 && hash(j, side + 5) < 0.75) r.disc(x - side * 0.03 * s, y - 0.58 * s, 0.075 * s, MID + DIM); // a face turned to us
    }
    if (j % 2 === 0) { // a candle down the middle of the table
      const fl = 0.5 + 0.5 * hash(j, Math.floor(t * 12)) * (0.4 + f.rel.trebDrive), fr = Math.max(0.6, (0.05 + 0.04 * fl + 0.03 * f.beat.pulse) * s);
      r.rect(cx - Math.max(0.5, 0.02 * s), y - 0.25 * s, Math.max(1, 0.04 * s), 0.25 * s, LMID);
      r.disc(cx, y - 0.25 * s - fr, fr, fl > 0.7 ? WHITE : BRIGHT);
    }
  }
  targets.push({ x: cx - 0.8 * sb, y: hz - 1.6 * sb, w: 1.6 * sb, h: 1.4 * sb });
}

// a slow-motion walk toward the camera, low down: the figure grows as 1/distance, its feet on the ground at that
// distance, a step every 0.75 m of the way (so the stride keeps pace with the approach); the street lights behind
// out of focus
function shotWalk(W, w) {
  const { r, N, u, t, targets } = W, cx = (0.4 + w.var * 0.2) * N, hz = 0.58 * N, F = 0.6 * N, CH = 0.6;
  r.rect(0, 0, N, hz, BG);
  r.rect(0, hz, N, N - hz, DARK);
  for (let k = 0; k < 24; k++) r.disc(hash(k, 3) * N, hz - (0.04 + hash(k, 4) * 0.32) * N, (2 + hash(k, 5) * 5) * u * (1 + 0.1 * Math.sin(t * 0.7 + k)), BOKEH[k % 4]);
  r.poly([[cx - 1, hz], [cx + 1, hz], [cx + (2.5 / CH) * (2 * N - hz), 2 * N], [cx - (2.5 / CH) * (2 * N - hz), 2 * N]], DARK + DIM);
  const z = Math.max(2.2, 5.5 - w.st * 0.45), hgt = (1.75 * F) / z, base = hz + (CH * F) / z;
  r.rect(cx - hgt * 0.12, base, hgt * 0.24, Math.max(1, hgt * 0.02), BLACK);
  sprinter(r, cx, base, hgt, (5.5 - z) / 1.5, 0.35, 1, FIG);
  targets.push({ x: cx - hgt * 0.2, y: base - hgt, w: hgt * 0.4, h: hgt });
}

// a rooftop at dusk: the sky in bands, the sun going down behind the skyline, a figure on the edge with the coat
// and the hair in the wind (the flap's phase integrated, so a change of wind changes its speed, never jumps it)
function shotRoof(W, w) {
  const { r, N, u, t, f, targets } = W, hz = 0.64 * N, wind = windOf(f) * (w.var < 0.5 ? 1 : -1), tw = Math.floor(t * 6);
  for (let k = 0; k < 4; k++) r.rect(0, (k * hz) / 4, N, hz / 4 + 1, DUSK[k]);
  r.disc(0.7 * N, hz, 0.1 * N, BRIGHT);
  for (let k = 0; k < 12; k++) {
    const x = (k / 12) * N, bw = N / 12 + u, bh = (0.05 + hash(k, 9) * 0.2) * N;
    r.rect(x, hz - bh, bw, bh + 1, DARK);
    for (let j = 0; j < 4; j++) if (hash(k * 4 + j, tw) < 0.3) r.rect(x + (1 + (j % 2) * 3) * u, hz - bh + (2 + (j >> 1) * 4) * u, Math.max(1, u), Math.max(1, u), LMID);
  }
  r.rect(0, hz, N, 0.82 * N - hz, DARK + DIM);
  r.rect(0, 0.82 * N, N, 0.18 * N, BLACK);
  w.flap += W.dt * (6 + 10 * Math.abs(wind));
  const top = coatFigure(r, (0.3 + w.var * 0.15) * N, 0.82 * N, 0.3 * N, BLACK, wind, w.flap, u);
  targets.push({ x: (0.22 + w.var * 0.15) * N, y: top, w: 0.16 * N, h: 0.82 * N - top });
}

// the drop: a hard red frame, a huge silhouette from the waist up pushed in slowly
function shotRed(W, w) {
  const { r, N } = W, z = 1 + 0.03 * w.st, cx = 0.52 * N, Y = (v) => N - (N - v) * z;
  r.fill(HOT);
  r.poly([[cx - 0.46 * N * z, N], [cx + 0.44 * N * z, N], [cx + 0.34 * N * z, Y(0.64 * N)], [cx + 0.1 * N * z, Y(0.55 * N)], [cx - 0.12 * N * z, Y(0.55 * N)], [cx - 0.36 * N * z, Y(0.65 * N)]], BLACK);
  r.poly([[cx - 0.16 * N * z, Y(0.6 * N)], [cx - 0.05 * N * z, Y(0.45 * N)], [cx - 0.02 * N * z, Y(0.6 * N)]], BLACK); // the collar up
  r.rect(cx - 0.06 * N * z, Y(0.48 * N), 0.12 * N * z, 0.09 * N * z, BLACK);
  r.disc(cx, Y(0.37 * N), 0.15 * N * z, BLACK);
}
const SHOTS = { doorway: shotDoorway, carnight: shotCar, table: shotTable, walk: shotWalk, roof: shotRoof };

function dealShots(w, rnd, band) {
  w.list = [];
  while (w.list.length < 3) { const k = rollW(rnd, SHOT_W, band); if (!w.list.includes(k)) w.list.push(k); }
}
function cutTo(w, rnd) {
  w.shot = pick(rnd, w.list.filter((k) => k !== w.shot));
  w.st = 0; w.zc = 0; w.var = rnd();
}

const filmcuts = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { list: [], shot: '', st: 0, zc: 0, var: 0, flashT: 0, red: 0, flick: 0, dist: 0, turn: 0, lit: BRIGHT, bc: 0, last: -9, flap: 0 });
    dealShots(w, rnd, bandOf(W.a));
    cutTo(w, rnd);
  },
  draw(W) {
    const { r, N, t, dt, f, w, rnd, hits, s } = W, band = bandOf(W.a), bps = bpsOf(f), bar = Math.round(0.12 * N);
    for (const hh of hits) {
      if (isLow(hh)) { w.flick = 0.25; s.shake = Math.max(s.shake, 0.2 * hh.strength); }
      else if (hh.kind === 'snare' && hh.strength > 0.5 && t - w.last > 0.25 && w.red <= 0) { cutTo(w, rnd); w.flashT = 0.03; w.last = t; w.turn = 1; }
      else if (isTonal(hh)) w.lit = hh.pc % 3 === 0 ? COOL : hh.pc % 3 === 1 ? BRIGHT : LMID;
    }
    if (f.section === 'drop') { w.red = 8 / bps; w.st = 0; }
    else if (f.section === 'change') { dealShots(w, rnd, band); cutTo(w, rnd); }
    if (beatTick(w, f, dt) && ++w.bc % [4, 2, 1][band] === 0 && w.red <= 0) { cutTo(w, rnd); w.last = t; }
    if (w.red > 0 && (w.red -= dt) <= 0) cutTo(w, rnd);
    w.st += dt; w.zc += dt * (0.25 + 0.5 * f.rel.bassDrive); w.flick -= dt;
    w.turn *= Math.exp(-dt * 0.7);
    w.dist += dt * 12 * bps; // a street lamp every 12 m, one a beat
    if (w.red > 0) shotRed(W, w); else SHOTS[w.shot](W, w);
    r.rect(0, 0, N, bar, BLACK);
    r.rect(0, N - bar, N, bar, BLACK);
    grain(r, rnd, 0.006 + 0.012 * f.level, bar, N - bar);
    if (w.flashT > 0) { w.flashT -= dt; r.fill(WHITE); } // a white frame, about 30 ms at any frame rate
  },
};

// ---------------------------------------------------------------------------------------------- red ink
// Quick grey shots of a city cut on the beat (a skyline, a street canyon, a crossing from above, an overpass), and
// red ink thrown at the lens on the kicks: the drops fly out of the picture on their arcs, growing as they come, and
// splat on the glass where they hit, stick, spread a little and run down in slow drips before they drain away. A
// snare is a cut and a fine spray, a note lights the signals, the level speeds the traffic. Kinds: the shots the
// list is dealt from; a drop is one splash that wipes the whole lens red and drains away down it.
const CITY_W = { skyline: [3, 2, 1], canyon: [2, 2, 2], crossing: [1, 2, 3], overpass: [1, 2, 3] };

function citySkyline(W, w) {
  const { r, N, u, f } = W, hz = 0.72 * N;
  r.rect(0, 0, N, hz * 0.5, BRIGHT);
  r.rect(0, hz * 0.5, N, hz * 0.5, LMID);
  for (let k = 0; k < 3; k++) cloud(r, (((hash(k, 2) + f.rel.midClock * 0.01 * (k + 1)) % 1.3) - 0.15) * N, (0.1 + 0.1 * k) * N, 0.3 * N, 0.08 * N, LMID + DIM);
  for (let layer = 0; layer < 2; layer++)
    for (let k = 0; k < 9; k++) {
      const x = ((k + hash(k, layer + 30) * 0.5) / 9) * N, bw = (0.06 + hash(k, layer + 40) * 0.06) * N, bh = (0.15 + hash(k, layer + 50) * (0.3 + 0.15 * layer)) * N, c = layer ? DARK : MID;
      r.rect(x, hz - bh, bw, bh + 1, c);
      if (layer) for (let y = hz - bh + 3 * u; y < hz - 2 * u; y += 4 * u) for (let xx = x + 2 * u; xx < x + bw - 2 * u; xx += 3 * u) if (hash(Math.round(xx), Math.round(y)) < 0.35) r.set(xx, y, hash(Math.round(xx), w.tw) < 0.1 ? w.sig : MID);
    }
  r.rect(0, hz, N, N - hz, FIG);
}
// down a street between towers: the facades' tops, feet and window rows all run to the one vanishing point; the
// far end of the street is at 10 m, the cars' tail lights going away up it, lost in the haze before they get there
const CAR_Z = new Float32Array(6); // the canyon's cars' distances this frame (scratch)
function cityCanyon(W, w) {
  const { r, N, u } = W, cx = 0.5 * N, hz = 0.45 * N, F = 0.5 * N, ex = 0.08 * N, R = (1.5 * N) / ex, R0 = (0.5 * N) / ex;
  r.rect(0, 0, N, N, LMID);
  r.poly([[-N, hz - 0.3 * N * R], [cx - ex, hz - 0.3 * N], [cx - ex, hz + 0.05 * N], [-N, hz + 0.05 * N * R]], MID);
  r.poly([[2 * N, hz - 0.3 * N * R], [cx + ex, hz - 0.3 * N], [cx + ex, hz + 0.05 * N], [2 * N, hz + 0.05 * N * R]], DARK);
  r.poly([[cx - ex, hz + 0.05 * N], [cx + ex, hz + 0.05 * N], [2 * N, hz + 0.05 * N * R], [-N, hz + 0.05 * N * R]], MID + DIM);
  for (let j = 0; j < 7; j++) { const o = -0.27 * N + j * 0.045 * N; r.line(cx - ex, hz + o, 0, hz + o * R0, DARK + DIM); r.line(cx + ex, hz + o, N - 1, hz + o * R0, MID + DIM); }
  for (const z of [1.5, 2, 2.8, 4, 6]) { const q = F / z; for (let k = -1; k <= 1; k += 2) r.rect(cx + k * 1.6 * q, hz - 6 * q, Math.max(1, u), 7 * q, k < 0 ? DARK + DIM : MID + DIM); }
  // the traffic going away, faster with the level: each car comes out from under the frame (it has just passed us)
  // and is drawn far to near, so the nearer car in a lane covers the farther one
  for (let k = 0; k < 6; k++) CAR_Z[k] = 0.4 + ((hash(k, 1) * 9.6 + w.road * (0.8 + hash(k, 2)) * 2) % 9.6);
  for (let n = 0; n < 6; n++) {
    let k = 0;
    for (let j = 1; j < 6; j++) if (CAR_Z[j] > CAR_Z[k]) k = j;
    const z = CAR_Z[k], q = F / z, x = cx + (k % 2 ? 0.5 : -0.5) * q, y = hz + q;
    CAR_Z[k] = -1;
    if (z > 9) continue;
    r.rect(x - q * 0.45, y - q * 0.5, q * 0.9, q * 0.5, z > 7 ? MID : DARK);
    for (let s2 = -1; s2 <= 1; s2 += 2) r.rect(x + s2 * q * 0.33 - q * 0.05, y - q * 0.38, Math.max(1, q * 0.1), Math.max(1, q * 0.08), k === 0 ? w.sig : BRIGHT);
  }
}
function cityCrossing(W, w) {
  const { r, N, u } = W;
  r.rect(0, 0, N, N, MID);
  r.rect(0, 0, 0.06 * N, N, LMID);
  r.rect(0.94 * N, 0, 0.06 * N, N, LMID);
  for (let k = 0; k < 9; k++) r.rect(0.09 * N + k * 0.1 * N, 0.3 * N, 0.06 * N, 0.4 * N, BRIGHT);
  for (let k = 0; k < 16; k++) { // the crowd from above: shoulders and heads crossing both ways, the heads bobbing with each step
    const dir = k % 2 ? 1 : -1, sp = 0.05 + hash(k, 3) * 0.04, x = ((hash(k, 4) + dir * w.road * sp * 0.3) % 1.2 + 1.2) % 1.2 - 0.1, y = 0.32 + hash(k, 5) * 0.36, bob = Math.sin(w.road * sp * 30 + k) * 0.3 * u;
    r.rect(x * N - 2 * u, y * N - 1.2 * u, 4 * u, 2.4 * u, DARK);
    r.disc(x * N + dir * bob, y * N, 1.4 * u, FIG);
  }
  r.rect(0.93 * N, 0.12 * N, 3 * u, 6 * u, FIG);
  r.disc(0.93 * N + 1.5 * u, 0.12 * N + 1.8 * u, u, w.sig);
}
function cityOverpass(W, w) {
  const { r, N, u } = W, roll = w.road * 0.6;
  r.rect(0, 0, N, N, BRIGHT);
  r.rect(0, 0.55 * N, N, 0.45 * N, LMID);
  r.poly([[0, 0], [N, 0], [N, 0.3 * N], [0, 0.42 * N]], DARK);
  r.poly([[0, 0.42 * N], [N, 0.3 * N], [N, 0.33 * N], [0, 0.46 * N]], MID);
  for (let k = 0; k < 4; k++) { const x = (0.12 + k * 0.26) * N; r.poly([[x, 0.4 * N - k * 0.03 * N], [x + 0.05 * N, 0.4 * N - k * 0.03 * N], [x + 0.06 * N, N], [x - 0.01 * N, N]], DARK + DIM); }
  for (let k = 0; k < 5; k++) { // the cars along it, coming in and going out wholly off the frame
    const x = ((hash(k, 8) + roll * (0.6 + hash(k, 9))) % 1.35 - 0.2) * N, y = 0.4 * N - (x / N) * 0.12 * N; r.rect(x, y - 3 * u, 0.12 * N, 3 * u, FIG); r.rect(x, y - 2 * u, 0.12 * N + 0.06 * N, Math.max(1, u), MID + DIM); }
}
const CITY = { skyline: citySkyline, canyon: cityCanyon, crossing: cityCrossing, overpass: cityOverpass };

// a drop of ink thrown from the scene point (sx, sy) at depth 6 m toward the lens (at 1 m), aimed to land near the
// middle: its flight is a parabola under gravity, kept as the throw (start, velocity, time to the glass) and
// evaluated at its age, so it lands exactly where it was aimed at any frame rate
const INK_Z0 = 6, INK_G = 9.8;
function throwInk(w, rnd, N, sx, sy, n, small) {
  const F = 0.5 * N, X0 = ((sx - 0.5 * N) * INK_Z0) / F, Y0 = ((sy - 0.5 * N) * INK_Z0) / F;
  for (let k = 0; k < n && w.drops.length < 60; k++) {
    const vz = -(6 + 4 * rnd()) * (small ? 1.4 : 1), th = (INK_Z0 - 1) / -vz, tx = (rnd() - 0.5) * 1.3, tyy = (rnd() - 0.6) * 1.1;
    w.drops.push({ X0, Y0, vx: (tx - X0) / th, vy: (tyy - Y0 - 0.5 * INK_G * th * th) / th, vz, th, age: 0, rr: (small ? 0.008 : 0.02) + rnd() * (small ? 0.01 : 0.035), px: sx, py: sy });
  }
}

const inksplatter = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { list: [], shot: '', drops: [], splats: [], wipe: 9, bc: 0, road: 0, sig: COOL, tw: 0, seed: 1 });
    inkDeal(w, rnd, bandOf(W.a));
    w.shot = w.list[0];
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), cx = 0.5 * N, F = 0.5 * N;
    const cut = () => { w.shot = pick(rnd, w.list.filter((k) => k !== w.shot)); };
    for (const hh of hits) {
      if (isLow(hh)) { throwInk(w, rnd, N, hh.x * N, hh.y * N, Math.round(3 + 6 * hh.strength), false); s.shake = Math.max(s.shake, 0.15 * hh.strength); }
      else if (hh.kind === 'snare') { cut(); throwInk(w, rnd, N, hh.x * N, hh.y * N, 5, true); }
      else if (isTonal(hh)) w.sig = PC_COL[hh.pc] === HOT ? BRIGHT : PC_COL[hh.pc];
    }
    if (f.section === 'drop') { w.wipe = 0; s.shake = Math.max(s.shake, 0.5); }
    else if (f.section === 'change') { inkDeal(w, rnd, band); cut(); }
    if (beatTick(w, f, dt) && ++w.bc % [4, 2, 1][band] === 0) cut();
    w.road += dt * (0.3 + 1.2 * f.level);
    w.tw = Math.floor(t * 4);
    CITY[w.shot](W, w);
    grain(r, rnd, 0.008, 0, N);
    // the drops in flight: gravity on them, coming at us, bigger as they near; on the glass they splat
    w.drops = w.drops.filter((d) => {
      const a = (d.age = Math.min(d.th, d.age + dt)), Z = INK_Z0 + d.vz * a, sx = cx + ((d.X0 + d.vx * a) * F) / Z, sy = 0.5 * N + ((d.Y0 + d.vy * a + 0.5 * INK_G * a * a) * F) / Z;
      if (a >= d.th) {
        if (sx > -0.1 * N && sx < 1.1 * N && sy > -0.1 * N && sy < 1.1 * N) {
          const Rm = clamp(d.rr * F * 2.4, 1.5 * u, 0.12 * N), nd = Rm > 3 * u ? 1 + Math.floor(rnd() * 3) : 0;
          w.splats.push({ x: sx, y: sy, Rm, age: 0, life: 2.5 + rnd() * 3, seed: w.seed++, nd, dx: Float32Array.from({ length: 3 }, () => (rnd() - 0.5) * 1.4), len: new Float32Array(3), v0: 0.03 * N + rnd() * 0.04 * N });
          if (w.splats.length > 24) w.splats.shift();
        }
        return false;
      }
      r.line(d.px, d.py, sx, sy, HOT + DIM);
      r.disc(sx, sy, Math.max(0.6, (d.rr * F) / Z), HOT);
      d.px = sx; d.py = sy;
      return true;
    });
    // the splats on the lens: a quick spread to their size, a crown at the instant of the hit, then drips that run
    // down slower and slower as they use up the ink, and at the end of its life the splat drains away
    w.splats = w.splats.filter((p) => {
      p.age += dt;
      const k = p.age > p.life ? clamp(1 - (p.age - p.life) / 1.5) : 1, R = p.Rm * (1 - Math.exp(-p.age / 0.06)) * (0.35 + 0.65 * k);
      r.disc(p.x, p.y, R, HOT);
      for (let j = 0; j < 6; j++) { const a = hash(p.seed, j) * TAU, dd = R * (1.05 + 0.6 * hash(p.seed, j + 9)); r.disc(p.x + Math.cos(a) * dd, p.y + Math.sin(a) * dd, R * (0.12 + 0.22 * hash(p.seed, j + 19)) * k, HOT); }
      if (p.age < 0.12) for (let j = 0; j < 8; j++) { const a = hash(p.seed, j + 40) * TAU, ca = Math.cos(a), sa = Math.sin(a); r.stroke(p.x + ca * R, p.y + sa * R, p.x + ca * R * 1.9, p.y + sa * R * 1.9, Math.max(1, u), HOT); }
      for (let j = 0; j < p.nd; j++) {
        if (p.age > 0.25 + j * 0.3) p.len[j] += p.v0 * Math.exp(-p.len[j] / (p.Rm * 5)) * dt * k;
        const wd = Math.max(1, p.Rm * 0.22 * k), x = p.x + p.dx[j] * p.Rm * 0.6;
        r.rect(x - wd / 2, p.y, wd, p.len[j], HOT);
        r.disc(x, p.y + p.len[j], wd * 0.75, HOT);
      }
      return k > 0;
    });
    // a drop's splash: the front sweeps across the glass, then it all drains down it, faster as it goes
    if (w.wipe < 2.8) {
      const q = (w.wipe += dt);
      if (q < 0.35) for (let y = 0; y < N; y++) { const fx = (q / 0.35) * 1.4 * N - (y / N) * 0.4 * N + (hash(y >> 1, 3) - 0.5) * 0.06 * N; if (fx > 0) r.rect(0, y, fx, 1, HOT); }
      else for (let x = 0; x < N; x++) { const d = q - 0.35, top = 0.5 * 0.8 * N * d * d * (0.7 + 0.6 * hash(x >> 1, 5)); if (top < N) r.rect(x, top, 1, N - top, HOT); }
    }
    targets.push({ x: 0.35 * N, y: 0.35 * N, w: 0.3 * N, h: 0.3 * N });
  },
};
function inkDeal(w, rnd, band) {
  w.list = [];
  while (w.list.length < 3) { const k = rollW(rnd, CITY_W, band); if (!w.list.includes(k)) w.list.push(k); }
}

// ---------------------------------------------------------------------------------------------- dramatic poses
// Two or three silhouettes with heavy outlines snapping into exaggerated, twisted poses on the beat (a library of
// poses, each eased in over two or three frames on twos and then held), the flat background swapping its colour on
// the snares, abstract menace marks (wavy shapes and triangles, never letters) rising beside them and slowing as they
// go. A kick stamps them down, a note lights the lead's outline, the bass exaggerates the next pose. Kinds: a duo, a
// trio, a lead with two behind; a drop raises a spirit behind the lead, larger, ghostly, in another colour, mirroring
// the pose a moment late.
const CREW_W = { duo: [3, 2, 1], trio: [1, 2, 3], lead: [2, 2, 2] };
// [x, height as a share of the frame, facing]; the last one is the lead
const CREW = { duo: [[0.3, 0.55, 1], [0.68, 0.6, -1]], trio: [[0.2, 0.46, 1], [0.8, 0.46, -1], [0.5, 0.6, 1]], lead: [[0.18, 0.38, 1], [0.82, 0.38, -1], [0.5, 0.68, 1]] };
const POSES = [
  pose(-0.25, 0.3, -0.3, -0.5, 2.6, 2.2, -0.15, 0.1, 0.35, -0.5, 0.6), // a hand to the face, the hip thrown out
  pose(-0.45, -0.3, -1.45, 0, 1.9, 0.6, -0.4, 0.6, 0.25, -0.2, 1), // leaning back, one arm flung out
  pose(0.35, 0.5, -2.2, -1.6, 0.7, 1.5, -0.6, 1.2, 0.5, -1, 0.4), // twisted down, an arm over the head
  pose(0, 0, -2.4, 0.2, 2.4, -0.2, -0.35, 0.1, 0.35, -0.1, 1), // arms up in a V
  pose(0.2, -0.2, 1.5, 1, -1.2, -1.4, -0.1, 0.3, 0.6, -0.8, 0.7), // an arm across the body, the other cocked
  pose(0.5, 0.1, -0.5, -0.3, 1.7, 0, -0.7, 0.2, 0.7, -1.2, 0.8), // a lunge, pointing
  pose(-0.15, 0.4, -0.9, 1.9, 2.9, 0.4, 0.05, 0, 0.45, -0.7, 0.55), // a hand on the hip, the other straight up
  pose(-0.7, -0.5, -2.8, -0.3, 2, 1.5, -0.2, 0.9, 0.4, -0.3, 0.9), // bent over backward
];
const CREW_BG = [HOT, COOL, LMID, BRIGHT];
const TRI = [0, -1, 0.9, 0.7, -0.9, 0.7];

function crewOf(w, rnd) {
  w.figs = CREW[w.form].map(([x, hf, dir], i) => {
    const P = { ...STAND };
    return { x, hf, dir, P, A: { ...STAND }, B: { ...STAND }, t0: -9, i: Math.floor(rnd() * POSES.length) + i };
  });
}

const posecrew = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { form: rollW(rnd, CREW_W, band), bg: pick(rnd, CREW_BG), marks: [], stomp: 0, rim: HOT, rimT: 0, spirit: 0, spT: 0, sp: { ...STAND }, tmp: { ...STAND }, sr: null });
    crewOf(w, rnd);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = bpsOf(f), base = 0.9 * N, lw = Math.max(1, 1.3 * u);
    const mark = (x, y, big) => { if (w.marks.length < 24) w.marks.push({ x, y, vy: -N * (0.25 + 0.1 * rnd()), life: 1.6, kind: rnd() < 0.3 + 0.2 * band ? 1 : 0, sz: (big ? 16 : 10) * u * (0.8 + 0.4 * rnd()), ph: rnd() * TAU }); };
    for (const hh of hits) {
      if (isLow(hh)) { w.stomp = 1; s.shake = Math.max(s.shake, 0.2 * hh.strength); }
      else if (hh.kind === 'snare') { let c = w.bg; while (c === w.bg) c = pick(rnd, CREW_BG); w.bg = c; }
      else if (isTonal(hh)) { w.rim = PC_COL[hh.pc]; w.rimT = 0.4; }
      else if (hh.kind === 'hat' && rnd() < f.level) { const F0 = pick(rnd, w.figs); mark((F0.x + (rnd() < 0.5 ? -1 : 1) * 0.14) * N, base - F0.hf * N * 0.3, false); }
    }
    if (f.section === 'drop') { w.spirit = 8 / bps; w.spT = 0; mirrorPose(w.figs[w.figs.length - 1].P, w.sp); }
    else if (f.section === 'change') { w.form = rollW(rnd, CREW_W, band); crewOf(w, rnd); }
    // the snap: on the beat every one of them picks a new pose, exaggerated by the bass, mirrored when facing left
    if (beatTick(w, f, dt)) {
      const ex = 0.85 + 0.35 * clamp(f.rel.bassDrive);
      for (const F0 of w.figs) {
        Object.assign(F0.A, F0.P);
        F0.i = (F0.i + 1 + Math.floor(rnd() * (POSES.length - 1))) % POSES.length;
        const Q = F0.dir < 0 ? mirrorPose(POSES[F0.i], w.tmp) : POSES[F0.i];
        for (const k of PK) F0.B[k] = k === 'tw' ? Q[k] : Q[k] * ex;
        F0.t0 = t;
      }
      const F1 = pick(rnd, w.figs);
      mark((F1.x + (rnd() < 0.5 ? -1 : 1) * (0.12 + 0.08 * rnd())) * N, base - F1.hf * N * (0.2 + 0.3 * rnd()), true);
    }
    w.stomp *= Math.exp(-dt * 10); w.rimT -= dt;
    // the flat ground of colour, a darker floor under them
    r.fill(w.bg);
    r.rect(0, base, N, N - base, w.bg + DIM);
    // the menace marks: they rise and slow, drift a little and dim out
    w.marks = w.marks.filter((m) => {
      m.vy = follow(m.vy, -0.04 * N, dt, 0.4); m.y += m.vy * dt; m.x += Math.sin(t * 2 + m.ph) * dt * 3 * u; m.life -= dt; m.ph += dt * 4 * f.rel.trebDrive;
      const c = m.life < 0.35 ? FIG + DIM : FIG, sz = m.sz;
      if (m.kind) { shape(r, TRI, m.x, m.y, sz * 0.5, 0, c); shape(r, TRI, m.x + sz * 0.45, m.y + sz * 0.6, sz * 0.35, 0, c); shape(r, TRI, m.x, m.y, sz * 0.25, 0, HOT); }
      else for (let st = 0; st < 2; st++) {
        let px = 0, py = 0;
        for (let k = 0; k <= 5; k++) {
          const x = m.x + st * sz * 0.4 + Math.sin(k * 1.1 + m.ph + t * 3) * sz * 0.22, y = m.y + (k * sz) / 5;
          if (k) { r.stroke(px, py, x, y, Math.max(1, 1.6 * u), c); r.line(px, py, x, y, HOT); }
          px = x; py = y;
        }
      }
      return m.life > 0;
    });
    // the spirit behind the lead: a larger double in a cold colour, mirroring the lead's pose a moment late, fading in
    const lead = w.figs[w.figs.length - 1];
    if (w.spirit > 0) {
      w.spirit -= dt; w.spT += dt;
      const al = Math.min(1, w.spT / 0.8, w.spirit / 0.8);
      mirrorPose(lead.P, w.tmp);
      for (const k of PK) w.sp[k] = follow(w.sp[k], w.tmp[k], dt, 0.15);
      if (!w.sr || w.sr.N !== N) w.sr = new Raster(N);
      const sr = w.sr, sb = sr.buf, buf = r.buf, hf = lead.hf * N * 1.45;
      sr.fill(255);
      rig(sr, lead.x * N - lead.dir * 0.06 * N, base - 0.02 * N, hf, w.sp, COOL, COOL + DIM, 2 * lw, 0, 1, true);
      for (let y = 0; y < N; y++) for (let x = 0, i = y * N; x < N; x++, i++) if (sb[i] !== 255 && bayer(x, y) < al) buf[i] = sb[i];
    }
    // the crew, the lead last and in front; each pose eased in on twos over a tenth of a second and held
    for (const F0 of w.figs) {
      const e = ease(clamp((twos(t) - twos(F0.t0)) / 0.1));
      for (const k of PK) F0.P[k] = F0.A[k] + (F0.B[k] - F0.A[k]) * e;
      const h = F0.hf * N * (1 - 0.05 * w.stomp), isLead = F0 === lead;
      const J = rig(r, F0.x * N, base, h, F0.P, MID, isLead && w.rimT > 0 ? w.rim : FIG, lw * (isLead ? 1.6 : 1.1), 0, 1.3, true);
      targets.push({ x: F0.x * N - h * 0.3, y: J.top, w: h * 0.6, h: base - J.top });
    }
  },
};

// ---------------------------------------------------------------------------------------------- palette whip
// The colour-inversion trick: a scene (a skyline, a long stairway, a street crossing) whose palette is remapped hard
// on every hit (the complementary swap, the negative, two duotones, a red print), radial speed lines out from the
// kicks, a halftone freeze frame on a heavy snare, a punch-in on the beat, a note on the lamps; the stairway's
// climber takes a step a beat, the walkers on the crossing stride in step with their pace. Kinds: the three scenes;
// a drop freezes the frame and shatters it into shards that tumble away under gravity.
const WHIP_W = { skyline: [2, 2, 2], stairway: [3, 2, 1], crossing: [1, 2, 3] };
// role order BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL; the dimmed eight follow their bright twins
const remap = (m) => { const a = new Uint8Array(18); for (let i = 0; i < 8; i++) { a[i] = m[i]; a[i + 8] = m[i] < 8 ? m[i] + DIM : m[i]; } a[BLACK] = BLACK; a[WHITE] = WHITE; return a; };
const WHIPS = [
  remap([BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL]), // as drawn
  remap([HOT, FIG, COOL, COOL, HOT, BRIGHT, COOL, HOT]), // the complementary swap: the ground hot, the shade cold, the accents traded
  remap([FIG, BG, BRIGHT, LMID, MID, DARK, COOL, HOT]), // the negative: the ramp turned over
  remap([HOT, FIG, FIG, FIG, HOT, HOT, FIG, HOT]), // a duotone in ink and hot
  remap([COOL, FIG, FIG, DARK, COOL, BRIGHT, BRIGHT, FIG]), // a cold duotone
  remap([BRIGHT, HOT, HOT, HOT, BRIGHT, BRIGHT, FIG, FIG]), // a red print on white
];
// how dark each role prints in the halftone (0 white .. 7 solid)
const TONE = new Uint8Array([3, 7, 6, 4, 2, 0, 3, 3, 4, 7, 7, 5, 3, 1, 4, 4, 7, 0]);
const WSKY = [BG, COOL, LMID, BRIGHT];

function whipSkyline(sc, N, u, t, f, w) {
  const hz = 0.66 * N, tw = Math.floor(t * 6);
  for (let k = 0; k < 4; k++) sc.rect(0, (k * hz) / 4, N, hz / 4 + 1, WSKY[k]);
  sc.disc(0.7 * N, 0.5 * N, 0.09 * N, w.acc);
  for (let k = 0; k < 3; k++) cloud(sc, ((hash(k, 4) + f.rel.midClock * 0.015 * (k + 1)) % 1.3 - 0.15) * N, (0.12 + 0.09 * k) * N, 0.28 * N, 0.07 * N, LMID);
  for (let layer = 0; layer < 2; layer++)
    for (let k = 0; k < 10; k++) {
      const x = ((k + hash(k, layer + 20) * 0.6) / 10) * N, bw = (0.05 + hash(k, layer + 21) * 0.06) * N, bh = (0.12 + hash(k, layer + 22) * (0.25 + 0.15 * layer)) * N;
      sc.rect(x, hz - bh, bw, bh + 1, layer ? DARK : MID);
      if (layer) for (let y = hz - bh + 3 * u; y < hz - 2 * u; y += 4 * u) for (let xx = x + 2 * u; xx < x + bw - 2 * u; xx += 3 * u) if (hash(Math.round(xx) * 3 + Math.round(y), tw) < 0.3) sc.rect(xx, y, Math.max(1, u), Math.max(1, u), BRIGHT);
    }
  sc.rect(0, hz, N, N - hz, FIG);
}

// up a long stairway in perspective, the camera climbing behind the climber at an even pace: the steps come down
// past us, the climber goes up one step a beat (so the gap to us surges a little with each step), lamps every few
// steps, an archway every sixty
function whipStairs(sc, N, u, t, f, w) {
  const cx = 0.5 * N, hz = 0.6 * N, F = 0.5 * N, CH = 1.2, run = 0.35, rise = 0.18, cam = w.cam;
  sc.rect(0, 0, N, N, BG);
  sc.rect(0, 0, N, 0.25 * N, COOL);
  const i0 = Math.floor(cam), Y = (i) => (i - cam) * rise, Z = (i) => 1 + (i - cam) * run, yOf = (i, h) => hz + ((CH - h) * F) / Z(i);
  for (let i = i0 + 70; i >= i0; i--) { // far to near: the riser, then the tread on top of it
    const z = Z(i);
    if (z < 0.5) continue;
    const hw = (1.2 * F) / z, y0 = yOf(i, Y(i) + rise), y1 = yOf(i, Y(i));
    sc.rect(cx - hw, y0, 2 * hw, Math.max(1, y1 - y0), i % 2 ? MID : MID + DIM);
    const yt = yOf(i + 1, Y(i) + rise), hw2 = (1.2 * F) / Z(i + 1);
    sc.poly([[cx - hw2, yt], [cx + hw2, yt], [cx + hw, y0], [cx - hw, y0]], LMID);
    if (i % 6 === 0) for (let k = -1; k <= 1; k += 2) { // a lamp post at the side
      const x = cx + (k * 1.45 * F) / z, yb = yOf(i, Y(i)), yh = yOf(i, Y(i) + 2.2);
      sc.rect(x - Math.max(0.5, (0.04 * F) / z), yh, Math.max(1, (0.08 * F) / z), yb - yh, DARK);
      sc.disc(x, yh, Math.max(1, (0.12 * F) / z), w.acc);
    }
    if (i % 60 === 30) { // an archway over the steps
      const yb = yOf(i, Y(i)), yh = yOf(i, Y(i) + 3.2), pw = Math.max(1, (0.2 * F) / z);
      sc.rect(cx - (1.6 * F) / z, yh, pw, yb - yh, FIG);
      sc.rect(cx + (1.6 * F) / z - pw, yh, pw, yb - yh, FIG);
      sc.rect(cx - (1.6 * F) / z, yh - pw, (3.2 * F) / z, pw * 1.4, FIG);
    }
  }
  // the climber, six steps ahead: up one step a beat, legs in step (a stride is two steps)
  const c = Math.floor(w.climb) + ease(w.climb % 1), ic = c + 6, z = Z(ic), hgt = (1.7 * F) / z, yb = yOf(ic, (ic - cam) * rise);
  sprinter(sc, cx + 0.15 * F, yb, hgt, c / 2, 0.5, 1, FIG);
}

// a street crossing seen down the road: the stripes side by side across it, walkers crossing both ways, their legs
// striding in step with their pace (a stride every 1.07 m: as far as the drawn legs swing, so the foot on the ground
// stays put instead of skating), cars waiting behind the line, the signal lit
function whipCrossing(sc, N, u, t, f, w) {
  const cx = 0.5 * N, hz = 0.45 * N, F = 0.5 * N, CH = 1.5, P = (X, z) => cx + (X * F) / z, Yg = (z) => hz + (CH * F) / z;
  sc.rect(0, 0, N, hz, BG);
  for (let k = 0; k < 8; k++) { const x = (k / 8) * N, bh = (0.08 + hash(k, 31) * 0.15) * N; sc.rect(x, hz - bh, N / 8 + 1, bh + 1, k % 2 ? DARK : MID); }
  sc.rect(0, hz, N, N - hz, MID + DIM);
  sc.poly([[cx - 1, hz], [cx + 1, hz], [P(4.5, 0.5), Yg(0.5)], [P(-4.5, 0.5), Yg(0.5)]], DARK);
  for (let k = 0; k < 9; k++) { const X = -3.6 + k * 0.8; sc.poly([[P(X, 6), Yg(6)], [P(X + 0.45, 6), Yg(6)], [P(X + 0.45, 4), Yg(4)], [P(X, 4), Yg(4)]], BRIGHT); }
  for (let k = 0; k < 3; k++) { const z = 7.5 + k * 1.6, q = F / z, X = k % 2 ? 1.6 : -1.8; sc.rect(P(X, z) - q * 0.9, Yg(z) - q * 1.2, q * 1.8, q * 1.2, FIG); sc.rect(P(X, z) - q * 0.7, Yg(z) - q * 0.9, q * 1.4, q * 0.35, LMID + DIM); }
  const sx = P(4.2, 4), sq = F / 4;
  sc.rect(sx, Yg(4) - 2.6 * sq, Math.max(1, 0.08 * sq), 2.6 * sq, FIG);
  sc.rect(sx - 0.15 * sq, Yg(4) - 2.6 * sq, 0.38 * sq, 0.5 * sq, FIG);
  sc.disc(sx + 0.04 * sq, Yg(4) - 2.35 * sq, Math.max(1, 0.12 * sq), w.acc);
  for (const p of w.walkers) { // far to near, sorted at init; they wrap round well out of the frame
    p.X += p.v * w.dt;
    if (p.X > 6.5) p.X -= 13; else if (p.X < -6.5) p.X += 13;
    const q = F / p.z;
    walker(sc, P(p.X, p.z), Yg(p.z), 1.7 * q, FIG, (p.X / 1.07) * TAU * Math.sign(p.v), Math.sign(p.v), { coat: p.coat, hat: p.hat });
  }
}
const WHIP_SCENES = { skyline: whipSkyline, stairway: whipStairs, crossing: whipCrossing };

function whipTables(w, N, u) {
  w.N = N; w.sc = new Raster(N); w.frozen = new Uint8Array(N * N); w.cmap = new Int32Array(N); w.rmap = new Int32Array(N); w.tmpRow = new Uint8Array(N);
  const c = Math.max(3, Math.round(3 * u));
  w.cell = c; w.hx2 = new Float32Array(2 * N); w.hy2 = new Float32Array(N); w.hp = new Uint8Array(N);
  for (let y = 0; y < N; y++) { const row = Math.floor(y / c), dy = y + 0.5 - (row + 0.5) * c; w.hy2[y] = dy * dy; w.hp[y] = row & 1; }
  for (let p = 0; p < 2; p++) for (let x = 0; x < N; x++) { const off = p * 0.5, dx = x + 0.5 - (Math.floor(x / c - off) + 0.5 + off) * c; w.hx2[p * N + x] = dx * dx; }
  w.R2 = Float32Array.from({ length: 8 }, (_, l) => (l ? (c * (0.2 + 0.11 * l)) ** 2 : -1));
}

const palettewhip = {
  init(W) {
    const { w, rnd, N, u } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, WHIP_W, band), map: 0, punch: 0, lines: 0, lx: 0, ly: 0, half: 0, shards: [], shatter: 0, acc: HOT, climb: 0, cam: null, dt: 0,
      walkers: Array.from({ length: 7 }, () => ({ X: rnd() * 10 - 5, z: 4.1 + rnd() * 1.8, v: (rnd() < 0.5 ? -1 : 1) * (1.1 + rnd() * 0.5), coat: rnd() < 0.4, hat: rnd() < 0.2 })).sort((a, b) => b.z - a.z) });
    whipTables(w, N, u);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), buf = r.buf, cx = 0.5 * N;
    if (w.N !== N) whipTables(w, N, u);
    for (const hh of hits) {
      if (isLow(hh)) { let m = w.map; while (m === w.map) m = 2 + Math.floor(rnd() * 4); w.map = m; w.lines = 0.18; w.lx = hh.x * N; w.ly = hh.y * N; s.shake = Math.max(s.shake, 0.2 * hh.strength); }
      else if (hh.kind === 'snare') { if (hh.strength > 0.75) w.half = 0.5; else w.map = w.map === 1 ? 0 : 1; }
      else if (isTonal(hh)) w.acc = PC_COL[hh.pc];
    }
    if (f.section === 'change') w.kind = rollW(rnd, WHIP_W, band);
    if (beatTick(w, f, dt)) w.punch = 1;
    const bp = beatPos(w, f, dt);
    w.climb = bp; w.cam = w.cam === null ? bp : follow(w.cam, bp, dt, 0.25);
    w.punch *= Math.exp(-dt * 8); w.lines -= dt; w.half -= dt;
    if (w.shatter > 0) { // the frame in pieces, falling away; then the scene again, as drawn
      w.shatter -= dt;
      r.fill(BLACK);
      w.shards = drawShards(W, w.shards, w.frozen, WHITE);
      if (!w.shards.length || w.shatter <= 0) { w.shatter = 0; w.shards.length = 0; w.map = 0; }
      return;
    }
    // the scene into its own raster, unless a freeze frame holds it; then out through the whip's remap and the punch-in
    if (w.half <= 0) { w.dt = dt; WHIP_SCENES[w.kind](w.sc, N, u, t, f, w); }
    const z = 1 + 0.05 * w.punch, map = WHIPS[w.map], sb = w.sc.buf, cm = w.cmap, rm = w.rmap;
    for (let k = 0; k < N; k++) { const q = Math.round(cx + (k + 0.5 - cx) / z - 0.5); cm[k] = q < 0 ? 0 : q >= N ? N - 1 : q; rm[k] = cm[k] * N; }
    for (let y = 0, i = 0; y < N; y++) { const ro = rm[y]; for (let x = 0; x < N; x++, i++) buf[i] = map[sb[ro + cm[x]]]; }
    if (w.half > 0) { // the freeze frame, printed in halftone dots
      const hx2 = w.hx2, hy2 = w.hy2, hp = w.hp, R2 = w.R2;
      for (let y = 0, i = 0; y < N; y++) { const dy2 = hy2[y], o = hp[y] * N; for (let x = 0; x < N; x++, i++) buf[i] = hx2[o + x] + dy2 <= R2[TONE[buf[i]]] ? FIG : BRIGHT; }
    }
    if (w.lines > 0) speedLines(r, w.lx, w.ly, 40, 0.18 * N, Math.floor(t * 12), FIG, WHITE);
    if (f.section === 'drop') { // freeze this frame and break it
      w.frozen.set(buf);
      const n = 5, cs = N / n, polys = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x0 = i * cs, y0 = j * cs, x1 = x0 + cs, y1 = y0 + cs;
        if ((i + j) % 2) { polys.push([x0, y0, x1, y0, x1, y1]); polys.push([x0, y0, x1, y1, x0, y1]); }
        else { polys.push([x0, y0, x1, y0, x0, y1]); polys.push([x1, y0, x1, y1, x0, y1]); }
      }
      w.shards.length = 0;
      cutShards(w.shards, polys, cx, 0.5 * N, N, rnd, 1);
      w.shatter = 3;
      s.shake = Math.max(s.shake, 0.8);
    }
    targets.push({ x: 0.35 * N, y: 0.35 * N, w: 0.3 * N, h: 0.3 * N });
  },
};

// ---------------------------------------------------------------------------------------------- manga panels
// The screen splits into manga panels with slanted gutters, one sliding in per beat from its nearest edge with a
// springy overshoot, each a close-up toned in Ben-Day dots: narrowed eyes, a clenched fist trembling, a coin tossed
// spinning up and caught on the next beat, running feet in step with the ground, a hand reaching out at us. A kick
// fires speed lines through the page, a snare blinks the eyes, the treble spins the coin faster, a note tones the
// hand. Kinds: three tiers, four in a zigzag, five; after a bar's hold the page is dealt anew; a drop shatters the
// panels outward.
const PAGE_W = { three: [3, 2, 1], four: [2, 2, 2], five: [1, 2, 3] };
const PAGES = {
  three: [[0.02, 0.02, 0.98, 0.02, 0.98, 0.3, 0.02, 0.4], [0.02, 0.43, 0.98, 0.33, 0.98, 0.62, 0.02, 0.7], [0.02, 0.73, 0.98, 0.65, 0.98, 0.98, 0.02, 0.98]],
  four: [[0.02, 0.02, 0.58, 0.02, 0.48, 0.48, 0.02, 0.48], [0.61, 0.02, 0.98, 0.02, 0.98, 0.48, 0.51, 0.48], [0.02, 0.52, 0.38, 0.52, 0.48, 0.98, 0.02, 0.98], [0.41, 0.52, 0.98, 0.52, 0.98, 0.98, 0.51, 0.98]],
  five: [[0.02, 0.02, 0.55, 0.02, 0.45, 0.32, 0.02, 0.32], [0.58, 0.02, 0.98, 0.02, 0.98, 0.32, 0.48, 0.32], [0.02, 0.35, 0.98, 0.35, 0.98, 0.58, 0.02, 0.68], [0.02, 0.71, 0.4, 0.67, 0.3, 0.98, 0.02, 0.98], [0.43, 0.665, 0.98, 0.61, 0.98, 0.98, 0.33, 0.98]],
};
const CLOSE = ['eyes', 'fist', 'coin', 'feet', 'hand'];
// the tones a close-up prints (marks 40..43 in its raster): dots of ink on paper, their size by the tone
const TONE_INK = [LMID, MID, DARK, HOT], TONE_PAPER = [BRIGHT, BRIGHT, LMID, BRIGHT], TONE_R = [0.28, 0.42, 0.5, 0.36];
const EYE = [-1, 0, -0.6, -0.5, 0, -0.62, 0.6, -0.45, 1, 0, 0.6, 0.35, 0, 0.42, -0.6, 0.38];
const easeBack = (p) => { const c1 = 1.70158, q = p - 1; return 1 + (c1 + 1) * q * q * q + c1 * q * q; };

// each close-up, drawn over its panel's box x0..x1, y0..y1 (its ground first, over the whole box), cropped tight the
// way a close-up is: it is sized to the panel's long side and the short side cuts it
function closeUp(sc, kind, x0, y0, x1, y1, W, w, p, bp) {
  const { u, t, f } = W, lw = Math.max(1, 1.4 * u), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, S = 0.42 * Math.max(x1 - x0, y1 - y0), V = 0.5 * Math.min(x1 - x0, y1 - y0), ground = (c) => sc.rect(x0, y0, x1 - x0, y1 - y0, c);
  if (kind === 'eyes') { // narrowed eyes and hard brows, focus lines behind
    ground(40);
    for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU + hash(i, p.seed) * 0.2, ca = Math.cos(a), sa = Math.sin(a); sc.line(cx + ca * S * 0.42, cy + sa * S * 0.3, cx + ca * S * 1.2, cy + sa * S * 1.2, FIG); }
    sc.rect(cx - S, cy - S * 0.14, 2 * S, S * 0.28, 42);
    const belly = w.blink > 0 ? 0.08 : 0.3 + 0.1 * f.beat.pulse;
    for (let k = -1; k <= 1; k += 2) {
      const x = cx + k * S * 0.3;
      const hl = S * 0.2, hv = hl * belly * 1.8; // the half length, and the scale of the height: narrowed, or shut in a blink
      shape(sc, EYE, x, cy, hv + lw, 0, FIG, (hl + lw) / (hv + lw));
      shape(sc, EYE, x, cy, hv, 0, BRIGHT, hl / hv);
      if (belly > 0.1) { sc.disc(x + S * 0.02, cy, S * 0.065, FIG); sc.disc(x + S * 0.045, cy - S * 0.025, Math.max(1, S * 0.018), BRIGHT); }
      sc.stroke(x - k * S * 0.16, cy - S * 0.14, x + k * S * 0.15, cy - S * 0.08, Math.max(1, S * 0.04), FIG);
    }
  } else if (kind === 'fist') { // a clenched fist, trembling with the bass on twos
    const K = V * 1.5;
    ground(42);
    const j = (hash(p.seed, Math.floor(t * 12)) - 0.5) * K * 0.04 * (0.3 + f.rel.bassDrive), x = cx + j, y = cy + K * 0.05;
    sc.rect(x - K * 0.12, y + K * 0.15, K * 0.24, K, FIG);
    sc.rect(x - K * 0.1, y + K * 0.15, K * 0.2, K, MID);
    for (let pass = 0; pass < 2; pass++) {
      const e = pass ? 0 : lw, c = pass ? LMID : FIG;
      sc.rect(x - K * 0.22 - e, y - K * 0.12 - e, K * 0.44 + 2 * e, K * 0.3 + 2 * e, c);
      for (let k = 0; k < 4; k++) sc.disc(x - K * 0.165 + k * K * 0.11, y - K * 0.12, K * 0.06 + e, c);
      sc.stroke(x - K * 0.2, y + K * 0.08, x + K * 0.08, y + K * 0.02, K * 0.08 + 2 * e, c); // the thumb across
    }
    for (let k = 0; k < 3; k++) sc.line(x - K * 0.11 + k * K * 0.11, y - K * 0.06, x - K * 0.11 + k * K * 0.11, y + K * 0.12, FIG);
  } else if (kind === 'coin') { // tossed on every beat: up and down on its parabola, caught as the next beat lands; its spin
    // (faster with the treble) is a phase carried from frame to frame and shown on twos
    const K = V * 1.1;
    ground(40);
    const ph = bp % 1, hgt = 4 * K * 0.95 * ph * (1 - ph), y = cy + K * 0.55 - hgt, R = K * 0.24, sp = Math.cos(w.spinH), half = Math.abs(sp);
    sc.stroke(cx - K * 0.6, cy + K * 1.05, cx - K * 0.05, cy + K * 0.85, K * 0.2 + 2 * lw, FIG); // the thumb it flips off and lands back on
    sc.stroke(cx - K * 0.6, cy + K * 1.05, cx - K * 0.05, cy + K * 0.85, K * 0.2, LMID);
    for (let dy = -R; dy <= R; dy += 1) { const hw = R * Math.sqrt(Math.max(0, 1 - (dy / R) ** 2)); sc.rect(cx - hw * half - 1, y + dy, 2 * hw * half + 2, 1, FIG); sc.rect(cx - hw * half, y + dy, 2 * hw * half, 1, half > 0.3 ? (sp > 0 ? BRIGHT : LMID) : MID); }
    for (let k = 0; k < 3; k++) sc.line(cx - R - K * 0.08, y - R * 0.6 + k * R * 0.6, cx - R - K * 0.25, y - R * 0.6 + k * R * 0.6, FIG); // motion ticks
  } else if (kind === 'feet') { // running feet side-on: the planted foot rides back with the ground, the other swings forward
    const K = V * 1.0;
    ground(41);
    const g = cy + K * 0.35, stride = K * 1.2, gap = 0.3 * K, off = ((bp * stride) % gap + gap) % gap; // a stride a beat on the same clock as the feet
    sc.rect(x0, g, x1 - x0, y1 - g + 1, MID);
    for (let x = x0 - off; x < x1; x += gap) sc.rect(x, g + K * 0.06, K * 0.12, Math.max(1, u), FIG); // the ground going by at the planted foot's speed
    for (let k = 0; k < 2; k++) {
      const q = (bp + k * 0.5) % 1, A = stride * 0.2, st = q < 0.4, fx = st ? cx + A - (q / 0.4) * 2 * A : cx - A + ((q - 0.4) / 0.6) * 2 * A, fy = st ? g : g - Math.sin(((q - 0.4) / 0.6) * Math.PI) * K * 0.22;
      const hx = cx - K * 0.05, hy = cy - K * 0.8, kx = (hx + fx) / 2 + K * 0.12, ky = (hy + fy) / 2 - K * 0.05, c = k ? FIG : DARK;
      sc.stroke(hx, hy, kx, ky, K * 0.11, c);
      sc.stroke(kx, ky, fx, fy - K * 0.06, K * 0.09, c);
      sc.rect(fx - K * 0.05, fy - K * 0.1, K * 0.2, K * 0.1, c);
      sc.rect(fx - K * 0.05, fy - K * 0.02, K * 0.22, K * 0.02, BRIGHT);
    }
  } else { // a hand reaching out at us, fingers spread and foreshortened, the arm going back into the panel
    const K = V * 1.6;
    ground(43);
    const sz = K * (0.85 + 0.15 * f.level), x = cx + K * 0.05, y = cy + K * 0.05;
    for (let pass = 0; pass < 2; pass++) {
      const e = pass ? 0 : 2 * lw, c = pass ? LMID : FIG;
      sc.stroke(x, y, cx - K * 0.9, cy - K * 0.9, sz * 0.16 + e, c);
      for (let k = 0; k < 5; k++) { const a = -2.4 + k * 0.55, len = sz * (k === 0 ? 0.2 : 0.26 - 0.02 * Math.abs(k - 2)); sc.stroke(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, sz * 0.07 + e, c); sc.disc(x + Math.cos(a) * len, y + Math.sin(a) * len, sz * 0.035 + e / 2, c); }
      sc.disc(x, y, sz * 0.16 + e / 2, c);
    }
    for (let k = 0; k < 3; k++) sc.line(x - sz * 0.08, y - sz * 0.02 + k * sz * 0.04, x + sz * 0.06, y + k * sz * 0.04, MID);
  }
}

const onBeat = (bp) => (bp % 1 < 0.25 ? Math.floor(bp) : Math.ceil(bp));
function dealPage(w, rnd, bp) {
  const bag = CLOSE.slice();
  w.panels = PAGES[w.form].map((P, i) => {
    let mx = 0, my = 0;
    for (let k = 0; k < 4; k++) { mx += P[2 * k] / 4; my += P[2 * k + 1] / 4; }
    const dx = mx - 0.5, dy = my - 0.5, d = Math.hypot(dx, dy) || 1, kind = bag.splice(Math.floor(rnd() * bag.length), 1)[0] || pick(rnd, CLOSE);
    return { P, kind, at: i, sx: Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0, sy: Math.abs(dx) > Math.abs(dy) ? 0 : Math.sign(dy) || 1, seed: Math.floor(rnd() * 1e6), V: new Float32Array(8) };
  });
  w.start = onBeat(bp); // the first panel starts in on this beat (the next one if this is well under way), the rest on the beats after
}

const mangapanels = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { form: rollW(rnd, PAGE_W, band), panels: [], start: 0, sc: null, frozen: null, shards: [], shatter: 0, blink: 0, kick: 0, spin: 0, spinH: 0, tw: -1 });
    dealPage(w, rnd, 0);
    w.start = -1;
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bp = beatPos(w, f, dt), buf = r.buf, lw = Math.max(1, Math.round(1.5 * u));
    if (!w.sc || w.sc.N !== N) { w.sc = new Raster(N); w.frozen = new Uint8Array(N * N); w.shards.length = 0; w.shatter = 0; }
    if (w.start < 0) w.start = onBeat(bp);
    for (const hh of hits) {
      if (isLow(hh)) { w.kick = 0.15; w.kx = hh.x * N; w.ky = hh.y * N; s.shake = Math.max(s.shake, 0.15 * hh.strength); }
      else if (hh.kind === 'snare') w.blink = 0.12;
    }
    w.blink -= dt; w.kick -= dt;
    w.spin += dt * (10 + 14 * f.rel.trebDrive);
    if (Math.floor(t * 12) !== w.tw) { w.tw = Math.floor(t * 12); w.spinH = w.spin; }
    if (f.section === 'change') { w.form = rollW(rnd, PAGE_W, band); dealPage(w, rnd, bp); }
    if (bp > w.start + w.panels.length + 4) dealPage(w, rnd, bp); // a bar's hold, then the next page
    if (w.shatter > 0) {
      w.shatter -= dt;
      r.fill(BG);
      w.shards = drawShards(W, w.shards, w.frozen, FIG);
      if (!w.shards.length || w.shatter <= 0) { w.shatter = 0; w.shards.length = 0; dealPage(w, rnd, bp); }
      return;
    }
    r.fill(BG);
    const sc = w.sc, sb = sc.buf, c = Math.max(3, Math.round(3 * u));
    for (const p of w.panels) {
      const q = clamp((bp - w.start - p.at) / 0.5);
      if (q <= 0) continue;
      const o = (1 - easeBack(q)) * N, V = p.V; // slid in from its edge, over and back
      let x0 = N, x1 = 0, y0 = N, y1 = 0;
      for (let k = 0; k < 4; k++) { V[2 * k] = p.P[2 * k] * N + p.sx * o; V[2 * k + 1] = p.P[2 * k + 1] * N + p.sy * o; x0 = Math.min(x0, V[2 * k]); x1 = Math.max(x1, V[2 * k]); y0 = Math.min(y0, V[2 * k + 1]); y1 = Math.max(y1, V[2 * k + 1]); }
      const bx0 = Math.max(0, Math.floor(x0)), bx1 = Math.min(N, Math.ceil(x1)), by0 = Math.max(0, Math.floor(y0)), by1 = Math.min(N, Math.ceil(y1));
      if (bx1 <= bx0 || by1 <= by0) continue;
      closeUp(sc, p.kind, x0, y0, x1, y1, W, w, p, bp); // in the panel's own box, so the picture rides in with it
      // copy what lies inside the panel, the tones printed as dots on the way
      for (let y = by0; y < by1; y++) {
        const yc = y + 0.5;
        let xa = Infinity, xb = -Infinity;
        for (let k = 0, j = 3; k < 4; j = k++) { const ya = V[2 * j + 1], yb = V[2 * k + 1]; if ((ya <= yc) !== (yb <= yc)) { const xx = V[2 * j] + ((yc - ya) / (yb - ya)) * (V[2 * k] - V[2 * j]); if (xx < xa) xa = xx; if (xx > xb) xb = xx; } }
        const a0 = Math.max(0, Math.round(xa)), a1 = Math.min(N, Math.round(xb)), row = Math.floor(y / c), dy = yc - (row + 0.5) * c, off = (row & 1) * 0.5 * c;
        for (let x = a0; x < a1; x++) {
          const v = sb[y * N + x];
          if (v >= 40) { const dx = ((x + 0.5 - off) % c + c) % c - 0.5 * c, rr = TONE_R[v - 40] * c; buf[y * N + x] = dx * dx + dy * dy <= rr * rr ? TONE_INK[v - 40] : TONE_PAPER[v - 40]; }
          else buf[y * N + x] = v;
        }
      }
      for (let k = 0, j = 3; k < 4; j = k++) r.stroke(V[2 * j], V[2 * j + 1], V[2 * k], V[2 * k + 1], lw, FIG);
      if (q >= 1) targets.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    if (w.kick > 0) speedLines(r, w.kx, w.ky, 36, 0.25 * N, Math.floor(t * 12), FIG, BRIGHT);
    if (f.section === 'drop') { // the page breaks: every panel a shard of this frame, thrown outward
      w.frozen.set(buf);
      w.shards.length = 0;
      cutShards(w.shards, w.panels.filter((p) => bp - w.start - p.at > 0).map((p) => Array.from(p.V)), 0.5 * N, 0.5 * N, N, rnd, 0.9);
      w.shatter = 3;
      s.shake = Math.max(s.shake, 0.6);
    }
  },
};

// ---------------------------------------------------------------------------------------------- running crowd
// A line of silhouettes of different builds sprinting at the camera as it tracks back at their pace: a full stride (a
// step with each foot) every beat, arms pumping against the legs, everyone sized by their distance, and the ground,
// the posts and the walls going away from us past them at that same speed (the camera backs away from everything they
// run past, so it all recedes into the vanishing point and the planted feet keep pace with it); speed lines from the
// vanishing point with the bass. A kick throws up dust at a footfall that stays behind on the ground they leave, a
// snare flashes the lines, a note colours the sky. Kinds: a street, a field, a bridge; a drop: everyone leaps, the frame
// freezes at the top of the leap, then they come down where they left the ground and run on.
const RUN_W = { street: [2, 2, 3], field: [3, 2, 1], bridge: [1, 2, 2] };
const BUILDS = [[1, 1, 0], [1.08, 0.85, 0], [1, 1.35, 0], [0.84, 0.95, 1], [0.95, 1.1, 1], [1.05, 1, 0]]; // height, breadth, long hair

function crowdOf(w, rnd, band) {
  const n = 3 + band;
  w.run = Array.from({ length: n }, (_, i) => ({ X: (i - (n - 1) / 2) * (4.6 / n) + (rnd() - 0.5) * 0.3, z: 2.7 + rnd() * 1.8, b: BUILDS[Math.floor(rnd() * BUILDS.length)], off: i % 2 ? 0.5 : 0 }));
  w.run.sort((a, b) => b.z - a.z);
}

const runningcrowd = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, RUN_W, band), dist: 0, dust: [], flash: 0, sky: COOL, leapT: -1, freeze: 0, froze: false });
    crowdOf(w, rnd, band);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = bpsOf(f), cx = 0.5 * N, hz = 0.45 * N, F = 0.55 * N, CH = 1.3, g = 9.8;
    const v0 = Math.sqrt(2 * g * 1.1), tA = v0 / g; // the leap: 1.1 m up, the top of it after tA
    if (f.section === 'drop' && w.leapT < 0) { w.leapT = 0; w.froze = false; }
    else if (f.section === 'change') { w.kind = rollW(rnd, RUN_W, band); crowdOf(w, rnd, band); }
    // time stands still in the freeze frame: nothing moves, not the ground, not the gait, not the leap
    let ft = dt;
    if (w.freeze > 0) { w.freeze -= dt; ft = 0; }
    const gp = beatPos(w, f, ft); // (held in the freeze when free-running; locked, the gait picks the beat up again after it)
    w.cyc = ft > 0 || w.cyc === undefined ? gp : w.cyc;
    const speed = 4.2 * bps; // a stride of 4.2 m per beat: the ground has to go away from us at this speed
    w.dist += speed * ft;
    if (w.leapT >= 0 && ft > 0) {
      const was = w.leapT;
      w.leapT += ft;
      if (!w.froze && was < tA && w.leapT >= tA) { w.leapT = tA; w.freeze = 1.6; w.froze = true; s.shake = Math.max(s.shake, 0.3); }
      if (w.leapT >= 2 * tA) w.leapT = -1;
    }
    const air = w.leapT >= 0 ? Math.max(0, v0 * w.leapT - 0.5 * g * w.leapT * w.leapT) : 0, still = w.freeze > 0;
    for (const hh of hits) {
      if (ft > 0 && isLow(hh)) { const R = pick(rnd, w.run); for (let k = 0; k < 8 && w.dust.length < 64; k++) w.dust.push({ X: R.X + (rnd() - 0.5) * 0.4, z: R.z + 0.2 * rnd(), h: 0, vX: (rnd() - 0.5) * 1.6, vz: 1 + 2 * rnd(), vh: 0.8 + 1.8 * rnd(), life: 0.6 + 0.3 * rnd() }); s.shake = Math.max(s.shake, 0.15 * hh.strength); }
      else if (hh.kind === 'snare') w.flash = 0.12;
      else if (isTonal(hh)) w.sky = PC_COL[hh.pc];
    }
    if (ft > 0) w.flash -= dt;
    // the sky and the ground; in the freeze the sky goes to one flat colour
    r.rect(0, 0, N, hz, still ? HOT : BG);
    if (!still) { r.rect(0, hz * 0.55, N, hz * 0.45, w.sky + DIM); r.rect(0, hz * 0.85, N, hz * 0.15, w.sky); }
    r.rect(0, hz, N, N - hz, w.kind === 'field' ? MID : DARK);
    const P = (X, z) => cx + (X * F) / z, Y = (h, z) => hz + ((CH - h) * F) / z, d = w.dist;
    // what they run past is fixed to the ground: at a depth that grows with the distance run (z = place + d), drawn far
    // to near; each new one comes in from beside the camera, out of the frame, and the oldest has shrunk away into the
    // vanishing point before it is dropped
    if (w.kind === 'street') { // the walls both sides, their joints and the lamp posts
      r.poly([[P(-6, 240), Y(9, 240)], [P(-6, 240), Y(0, 240)], [P(-6, 0.3), Y(0, 0.3)], [P(-6, 0.3), Y(9, 0.3)]], MID);
      r.poly([[P(6, 240), Y(9, 240)], [P(6, 240), Y(0, 240)], [P(6, 0.3), Y(0, 0.3)], [P(6, 0.3), Y(9, 0.3)]], LMID + DIM);
      r.poly([[P(-4, 240), Y(0, 240)], [P(4, 240), Y(0, 240)], [P(4, 0.3), Y(0, 0.3)], [P(-4, 0.3), Y(0, 0.3)]], MID + DIM);
      for (let j = 70; j >= 0; j--) { const z = j * 3 + (d % 3) + 0.5; for (let k = -1; k <= 1; k += 2) r.rect(P(k * 6, z), Y(9, z), 1, Y(0, z) - Y(9, z), DARK); }
      for (let j = 26; j >= 0; j--) { const z = j * 8 + (d % 8) + 1; for (let k = -1; k <= 1; k += 2) { r.rect(P(k * 4.6, z), Y(4.5, z), Math.max(1, (0.12 * F) / z), Y(0, z) - Y(4.5, z), FIG); r.disc(P(k * 4.2, z), Y(4.5, z), Math.max(1, (0.25 * F) / z), BRIGHT); } }
    } else if (w.kind === 'field') { // far hills, grass tufts and fence posts
      for (let k = 0; k < 5; k++) r.disc((k / 4) * N, hz + 0.06 * N, (0.14 + hash(k, 3) * 0.1) * N, DARK + DIM);
      r.rect(0, hz, N, N - hz, MID);
      for (let j = 0; j < 90; j++) { const z = ((hash(j, 1) * 30 + d) % 30) + 0.6, X = (hash(j, 2) - 0.5) * 16, q = F / z; r.stroke(P(X, z), Y(0, z), P(X, z) + q * 0.05, Y(0.25, z), Math.max(1, q * 0.04), MID + DIM); }
      for (let j = 22; j >= 0; j--) { const z = j * 4 + (d % 4) + 0.6; for (let k = -1; k <= 1; k += 2) r.rect(P(k * 4, z), Y(1.1, z), Math.max(1, (0.1 * F) / z), Y(0, z) - Y(1.1, z), FIG); }
      r.line(P(-4, 92), Y(1, 92), P(-4, 0.6), Y(1, 0.6), FIG);
      r.line(P(4, 92), Y(1, 92), P(4, 0.6), Y(1, 0.6), FIG);
    } else { // a bridge: water far below, the railings' posts and the towers with their cables
      r.rect(0, hz, N, N - hz, DARK);
      r.poly([[P(-3, 480), Y(0, 480)], [P(3, 480), Y(0, 480)], [P(3, 0.3), Y(0, 0.3)], [P(-3, 0.3), Y(0, 0.3)]], MID + DIM);
      for (let j = 45; j >= 0; j--) { const z = j * 2 + (d % 2) + 0.4; for (let k = -1; k <= 1; k += 2) r.rect(P(k * 3, z), Y(1.1, z), Math.max(1, (0.08 * F) / z), Y(0, z) - Y(1.1, z), FIG); }
      for (let k = -1; k <= 1; k += 2) r.line(P(k * 3, 92), Y(1.1, 92), P(k * 3, 0.4), Y(1.1, 0.4), FIG);
      for (let j = 2; j >= 0; j--) { // a tower every 150 m: the last three passed, the oldest a speck by the time it goes
        const tz = j * 150 + (d % 150) + 1;
        for (let k = -1; k <= 1; k += 2) { r.rect(P(k * 3.2, tz), Y(30, tz), Math.max(1, (0.8 * F) / tz), Y(0, tz) - Y(30, tz), FIG); for (let c = 1; c < 6; c++) r.line(P(k * 3.2, tz), Y(30 - c * 4, tz), P(k * 3.1, Math.max(0.5, tz - c * 9)), Y(1.1, Math.max(0.5, tz - c * 9)), DARK + DIM); }
      }
    }
    // speed lines out of the vanishing point: more with the bass, flaring on the snare, held still in the freeze
    const nl = Math.round(6 + 18 * clamp(f.rel.bassDrive) + (w.flash > 0 ? 14 : 0));
    speedLines(r, cx, hz, nl, 0.5 * N, still ? 1 : Math.floor(t * 12), w.flash > 0 ? WHITE : LMID, BRIGHT);
    // dust kicked up at a footfall: thrown back off the foot, up on its parabola and down onto the ground, which carries
    // it away from us behind the runners (in metres, seen through the same lens; drawn before them, it is behind them)
    w.dust = w.dust.filter((p) => {
      if (ft > 0) {
        p.X += p.vX * ft; p.z += (speed + p.vz) * ft; p.life -= ft;
        if (p.h > 0 || p.vh > 0) { p.h += p.vh * ft - 0.5 * g * ft * ft; p.vh -= g * ft; if (p.h <= 0) { p.h = 0; p.vh = 0; p.vz = 0; p.vX = 0; } }
      }
      const sz = Math.max(1, (0.07 * F) / p.z);
      r.rect(P(p.X, p.z) - sz / 2, Y(p.h, p.z) - sz, sz, sz, LMID + DIM);
      return p.life > 0;
    });
    // the runners, far to near: one stride a beat, every footfall on a beat (half lead with the other foot), sized by
    // their distance
    for (const R of w.run) {
      const q = F / R.z, h = 1.75 * R.b[0] * q, base = Y(0, R.z);
      const sw = h * 0.28 * (1 - 0.4 * clamp(air));
      r.rect(P(R.X, R.z) - sw / 2, base, sw, Math.max(1, h * 0.02), BLACK); // the shadow under each, smaller as they leave the ground
      const top = sprinter(r, P(R.X, R.z), base, h, w.cyc + R.off, 1, R.b[1], FIG, R.b[2], air * q, w.leapT >= 0 ? 0.8 : 0);
      targets.push({ x: P(R.X, R.z) - h * 0.2, y: top, w: h * 0.4, h: base - top });
    }
  },
};

// ---------------------------------------------------------------------------------------------- tilt to the sky
// The classic first shot: a slow tilt up from the street, past a tower, a tree or the wires, into a sky of clouds and
// birds, a hold, then a cut to a figure on a rooftop with the coat and the hair in the wind of the treble. The tilt
// turns the camera (up to 55 degrees, through one lens): the street drops away under the frame, the sky's bands of
// elevation bend round the zenith, and the tower's upright sides lean in toward a vanishing point that comes down out
// of infinity the higher we look (parallel while the camera is level). A snare is a lens flare along the line from the
// sun through the middle of the frame, a kick a whip pan with its blur, a note colours the sun, the beat flaps the
// birds. Kinds: what the tilt climbs; a drop cracks the sky into colour, piece by piece out from the sun, while the
// camera holds.
const SKY_W = { tower: [2, 2, 3], tree: [3, 2, 1], wires: [2, 2, 2] };
const SKYB = [BRIGHT, LMID, MID, DARK]; // the sky from the horizon up
const SKY_E = [33, 48, 62].map((e) => Math.sin((e * Math.PI) / 180)); // the elevations it changes band at, as sines
// the most the camera pitches up, and its height over the street, in units of the distance to what the tilt climbs
const SKY_TILT = (55 * Math.PI) / 180, SKY_HC = 0.457;
const CRACK_C = [HOT, COOL, BRIGHT, LMID, HOT + DIM, COOL + DIM, MID];
const FLARE = [[0.5, 3, BRIGHT], [1, 6, LMID + DIM], [1.4, 2, HOT], [1.8, 9, COOL + DIM], [2.3, 4, BRIGHT]]; // where along sun -> middle -> beyond, how big, what colour

// the tilted lens: a point (X, Y, Z) of the camera's world (Y up, Z ahead) seen at a pitch whose cosine and sine are
// `ct`, `st`, focal length F (cells), the axis at (ox, oy); out in PJ: the screen point and its depth along the view
const PJ = { x: 0, y: 0, z: 1 };
function tiltProj(X, Y, Z, ct, st, F, ox, oy) {
  const z = Z * ct + Y * st;
  PJ.z = z; PJ.x = ox + (F * X) / z; PJ.y = oy - (F * (Y * ct - Z * st)) / z;
  return PJ;
}

// the sky's crack pattern: every cell's piece (the nearest of a handful of seeds, the first at the sun) and the seams
function crackTable(w, N, sunX, sunY) {
  const n = 14, sx = new Float32Array(n), sy = new Float32Array(n);
  for (let k = 0; k < n; k++) { sx[k] = k ? hash(k, 61) * N : sunX; sy[k] = k ? hash(k, 62) * N * 0.9 : sunY; }
  w.cellN = N; w.cell = new Uint8Array(N * N); w.seam = new Uint8Array(N * N); w.ct = new Float32Array(n); w.cdist = new Float32Array(n);
  for (let k = 0; k < n; k++) w.cdist[k] = Math.hypot(sx[k] - sunX, sy[k] - sunY) / N;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let best = 0, bd = Infinity;
    for (let k = 0; k < n; k++) { const d = (x - sx[k]) ** 2 + (y - sy[k]) ** 2; if (d < bd) { bd = d; best = k; } }
    w.cell[y * N + x] = best;
  }
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) { const i = y * N + x; if (w.cell[i] !== w.cell[i + 1] || w.cell[i] !== w.cell[i + N]) w.seam[i] = 1; }
}

const skypan = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, SKY_W, band), t0: null, T: 0, panX: 0, whip: 0, wdir: 1, jumped: true, flare: 0, sun: BRIGHT, crack: -1, birds: [], tmp: new Uint8Array(N), gust: 0, flap: 0 });
    for (let k = 0; k < 7; k++) w.birds.push({ dx: (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.035, dy: Math.ceil(k / 2) * 0.025, ph: rnd() * TAU });
    crackTable(w, N, 0.75 * N, 0.3 * N);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = bpsOf(f), bp = beatPos(w, f, dt), cx = 0.5 * N;
    if (w.cellN !== N) { crackTable(w, N, 0.75 * N, 0.3 * N); w.tmp = new Uint8Array(N); }
    if (w.t0 === null) w.t0 = bp;
    for (const hh of hits) {
      if (isLow(hh) && hh.strength > 0.6 && w.whip <= 0.05 && w.crack < 0) { w.whip = 1; w.wdir = rnd() < 0.5 ? -1 : 1; w.jumped = false; }
      else if (hh.kind === 'snare') w.flare = 0.5;
      else if (isTonal(hh)) w.sun = PC_COL[hh.pc];
    }
    if (f.section === 'drop') w.crack = 0;
    else if (f.section === 'change') { w.kind = rollW(rnd, SKY_W, band); w.t0 = bp; } // a new take
    // the take, in beats: sixteen of tilt, four of hold, sixteen on the roof; the camera holds while the sky is cracked
    let k = bp - w.t0;
    if (k >= 36) { w.t0 = bp; k = 0; w.kind = rollW(rnd, SKY_W, band); }
    const roof = k >= 20, cracking = w.crack >= 0;
    if (!cracking) w.T = ease(clamp(k / 16));
    if (cracking && (w.crack += dt) > 8 / bps + 1) w.crack = -1;
    w.flare -= dt;
    if (w.whip > 0) { w.whip = Math.max(0, w.whip - dt * 4); if (!w.jumped && w.whip < 0.5) { w.jumped = true; w.panX = clamp(w.panX + w.wdir * 0.18 * N, -0.25 * N, 0.25 * N); } }
    const px = w.panX, wind = windOf(f) + w.gust, buf = r.buf, F = 0.7 * N, oy = 0.5 * N, ox = cx + px, th = w.T * SKY_TILT, ct = Math.cos(th), st = Math.sin(th);
    const P3 = (X, Y) => tiltProj(X, Y, 1, ct, st, F, ox, oy); // a point on the face of what the tilt climbs (one distance ahead)
    // the sun: a direction up and to the right of the tilt (low over the roof in the last shot); a drop's crack runs
    // out from wherever it is
    let sunX = 0.75 * N + px, sunY = 0.62 * N, sunR = 0.07 * N;
    if (!roof) { const az = 0.73, el = 1.01, p = tiltProj(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el), ct, st, F, ox, oy); sunX = p.x; sunY = p.y; sunR = (0.07 * N) / p.z; }
    if (f.section === 'drop') crackTable(w, N, sunX, sunY);
    if (!roof) { // the sky in bands of elevation: a row's band edges fall where its elevation crosses them, so they bend
      // round the zenith as we look up
      for (let y = 0; y < N; y++) {
        const ys = (oy - y - 0.5) / F, A = ys * ct + st, B = 1 + ys * ys, row = y * N;
        if (A <= 0) { buf.fill(SKYB[0], row, row + N); continue; }
        const se = A / Math.sqrt(B);
        let b = 0;
        while (b < 3 && SKY_E[b] < se) b++;
        buf.fill(SKYB[b], row, row + N);
        for (let j = b - 1; j >= 0; j--) { // the lower bands, out toward the sides of the row
          const xs = Math.sqrt(Math.max(0, (A / SKY_E[j]) ** 2 - B)), a = Math.round(ox - F * xs), c = Math.round(ox + F * xs);
          if (a > 0) buf.fill(SKYB[j], row, row + Math.min(N, a));
          if (c < N) buf.fill(SKYB[j], row + Math.max(0, c), row + N);
        }
      }
    } else for (let b = 0; b < 4; b++) r.rect(0, (b * 0.7 * N) / 4, N, 0.18 * N, DUSK[b]);
    r.disc(sunX, sunY, sunR, w.sun);
    if (cracking) { // the sky in pieces of colour, out from the sun as the crack runs, healing again at the end
      const q = w.crack, end = 8 / bps, R = q < end ? q * 1.4 : Math.max(0, 1.4 * end - (q - end) * 3), cell = w.cell, seam = w.seam, NN = N * N, cts = w.ct;
      for (let j = 0; j < cts.length; j++) cts[j] = w.cdist[j] < R ? 1 : 0;
      for (let i = 0; i < NN; i++) { const c = cell[i]; if (cts[c]) buf[i] = seam[i] ? WHITE : CRACK_C[c % 7]; }
    }
    if (!roof) {
      // clouds high up ahead, drifting across with the mids in straight lines, wrapping round well out of the frame
      for (let j = 0; j < 6; j++) {
        const Z = 1 + hash(j, 9), H = Z * Math.tan(0.56 + hash(j, 5) * 0.7), Xw = 1.2 * (Z + H), X = (((hash(j, 6) + f.rel.midClock * 0.006 * (1 + (j % 3))) % 1) - 0.5) * 2 * Xw;
        const p = tiltProj(X, H, Z, ct, st, F, ox, oy), sc = Math.hypot(Z, H) / p.z; // as big as ever in the middle of the view
        if (p.z < 0.1 || p.y < -0.2 * N || p.y > 1.2 * N) continue;
        cloud(r, p.x, p.y, (0.18 + hash(j, 7) * 0.15) * N * sc, (0.05 + hash(j, 8) * 0.04) * N * sc, LMID);
      }
      // what the tilt climbs, standing one distance ahead on the street
      const yb = P3(0, -SKY_HC).y;
      if (w.kind === 'tower') { // its upright sides lean in toward the vanishing point of the tilt
        const a = 0.286, top = 2, x0 = P3(-a, -SKY_HC).x, x1 = P3(a, -SKY_HC).x, x2 = P3(a, top).x, y2 = PJ.y, x3 = P3(-a, top).x;
        r.poly([[x0, yb], [x1, yb], [x2, y2], [x3, y2]], DARK);
        for (let j = 0, Y = top - 0.046; Y > 0.046 - SKY_HC; j++, Y -= 0.08) { // the rows of windows
          const y = P3(0, Y).y, hgt = Math.max(1, P3(0, Y - 0.034).y - y);
          if (y < -2 || y > N) continue;
          for (let c = 0; c < 5; c++) { const xa = P3(-0.243 + c * 0.107, Y).x, xb = P3(-0.2 + c * 0.107, Y).x; r.rect(xa, y, Math.max(1, xb - xa), hgt, hash(c, j) < 0.25 ? BRIGHT : MID + DIM); }
        }
      } else if (w.kind === 'tree') { // a trunk, its boughs and the crown swaying in the wind
        const x0 = P3(-0.071, -SKY_HC).x, x1 = P3(0.071, -SKY_HC).x, x2 = P3(0.029, 1.29).x, y2 = PJ.y, x3 = P3(-0.029, 1.29).x;
        r.poly([[x0, yb], [x1, yb], [x2, y2], [x3, y2]], DARK);
        for (let j = 0; j < 6; j++) {
          const Y = j * 0.214, sd = j % 2 ? 1 : -1, sw = Math.sin(t * 1.3 + j) * 3 * u * wind, ax = P3(0, Y).x, ay = PJ.y, bx = P3(sd * (0.314 - j * 0.0286), Y + 0.171).x;
          r.stroke(ax, ay, bx + sw, PJ.y, Math.max(1, ((3 - j * 0.3) * u) / PJ.z), DARK);
        }
        for (let j = 0; j < 16; j++) { const sw = Math.sin(t * 1.5 + j * 0.7) * 4 * u * wind, p = P3((hash(j, 11) - 0.5) * 0.857, (1.05 - 0.85 * hash(j, 12)) / 0.7); r.disc(p.x + sw, p.y, ((0.05 + hash(j, 13) * 0.05) * N) / p.z, j % 3 ? MID : COOL + DIM); }
      } else { // utility poles (leaning in like the tower would) and the wires sagging between them
        for (const X of [-0.457, 0.457]) {
          const bx = P3(X, -SKY_HC).x, tx = P3(X, 1.07).x, ty = PJ.y, z = PJ.z, cxa = P3(X - 0.114, 1).x, cya = PJ.y, cxb = P3(X + 0.114, 1).x;
          r.stroke(bx, yb, tx, ty, Math.max(1, (3 * u) / z), DARK);
          r.stroke(cxa, cya, cxb, PJ.y, Math.max(1, (2 * u) / z), DARK);
        }
        for (let j = 0; j < 3; j++) { const Y = 0.989 - j * 0.043; let lx = 0, ly = 0; for (let k2 = 0; k2 <= 16; k2++) { const q = k2 / 16, x = P3(lerp(-0.457, 0.457, q), Y - 0.457 * q * (1 - q)).x, y = PJ.y; if (k2) r.line(lx, ly, x, y, FIG); lx = x; ly = y; } }
      }
      r.rect(0, yb, N, N, DARK + DIM);
      // the birds, a loose V flying straight across high up, wings beating on the beat
      const Xb = (((t * 0.025) % 1) - 0.5) * 6.3;
      for (const b of w.birds) {
        const fl = Math.sin(b.ph + bp * TAU) * 2 * u, p = tiltProj(Xb + b.dx * 2, 1.43 - b.dy * 2, 1.2, ct, st, F, ox, oy), x = p.x, y = p.y;
        if (p.z < 0.1) continue;
        r.line(x - 3 * u, y - fl, x, y, FIG); r.line(x, y, x + 3 * u, y - fl, FIG);
      }
    } else { // the roof: the city below, the edge, the figure in the wind (the flap's phase carried, never jumped)
      for (let j = 0; j < 12; j++) { const x = (j / 12) * N, bh = (0.06 + hash(j, 21) * 0.16) * N; r.rect(x, 0.7 * N - bh, N / 12 + 1, bh, DARK + DIM); }
      r.rect(0, 0.7 * N, N, 0.12 * N, DARK + DIM);
      r.rect(0, 0.82 * N, N, 0.18 * N, DARK);
      w.flap += dt * (6 + 10 * Math.abs(wind));
      const fx = 0.42 * N + px, top = coatFigure(r, fx, 0.82 * N, 0.34 * N, BLACK, -wind, w.flap, u);
      targets.push({ x: fx - 0.08 * N, y: top, w: 0.16 * N, h: 0.82 * N - top });
    }
    // the flare: discs and rings along the line from the sun through the middle of the frame, and a streak
    if (w.flare > 0) {
      const fl = w.flare / 0.5;
      r.rect(sunX - 0.4 * N * fl, sunY, 0.8 * N * fl, Math.max(1, u), WHITE);
      for (const [m, sz, c] of FLARE) { const x = sunX + (cx - sunX) * m, y = sunY + (0.5 * N - sunY) * m; if (sz > 5) span(r, x, y, sz * u * 0.7, sz * u, fl > 0.4 ? c : c >= DIM ? c : c + DIM); else r.disc(x, y, sz * u, fl > 0.4 ? c : c + DIM); }
    }
    // the whip pan: the frame slides and smears along x, the new framing landing under the blur
    if (w.whip > 0.02) { const p = 1 - w.whip; whipBlur(r, Math.round(w.wdir * (p < 0.5 ? p : p - 1) * 0.8 * N), 1 + Math.round(Math.sin(Math.PI * p) * 14 * u), w.tmp); }
  },
};

// ---------------------------------------------------------------------------------------------- rainbow burst
// A glowing figure hanging in the air at the centre, concentric rainbow shockwaves running out from it on the beat,
// its aura as big as the bass; cars, rocks and signs lifted off the ground round it, held up turning slowly and
// sinking back when the bass goes. A kick sends an extra wave and jolts them, a snare flashes the core, a note turns
// the ramp. Kinds: a city street, a crater, a floor of cloud; a drop is the full release: every piece flung outward
// on its arc, landing where gravity takes it, and the ones thrown out of sight fall back in from above.
const BURST_W = { city: [3, 2, 2], crater: [1, 2, 3], clouds: [2, 2, 1] };
const BURST_SET = { city: ['car', 'lamp', 'sign', 'car', 'rock', 'bin', 'sign', 'car', 'rock'], crater: ['rock', 'boulder', 'rock', 'boulder', 'rock', 'pipe', 'rock', 'boulder', 'rock'], clouds: ['rock', 'car', 'bench', 'rock', 'sign', 'boulder', 'lamp', 'rock', 'car'] };
const AIR_POSE = pose(0, 0, -1.9, 0.2, 1.9, -0.2, -0.25, 0.4, 0.25, -0.4, 1);

// the pieces round the figure, each at its own distance (z: its scale, its ground at hz + (g0 - hz) z), far to near
function burstSet(w, rnd, N, u) {
  w.items = BURST_SET[w.kind].map((k, i) => {
    const side = i % 2 ? 1 : -1, z = 0.45 + rnd() * 0.6;
    return { k, x: (0.5 + side * (0.1 + (i >> 1) * 0.1 + rnd() * 0.04)) * N, y: restOf(DEBRIS[k], 0, DEBRIS[k].s * z * u), vx: 0, vy: 0, rot: 0, w: 0, mode: 0, th: 0.15 + rnd() * 0.45, hov: 0.15 + rnd() * 0.3, z, u };
  }).sort((a, b) => a.z - b.z);
}
function burstTables(w, N) {
  w.N = N; w.Di = new Uint16Array(N * N); w.lut = new Uint8Array(Math.ceil(N * 1.5) + 2);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) w.Di[y * N + x] = Math.round(Math.hypot(x + 0.5 - 0.5 * N, y + 0.5 - 0.45 * N));
}

const rainbowburst = {
  init(W) {
    const { w, rnd, N, u } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, BURST_W, band), aura: 0.3, rings: [], hue: 0, cyc: 0, core: 0, release: 0 });
    burstSet(w, rnd, N, u);
    burstTables(w, N);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), cx = 0.5 * N, cy = 0.45 * N, g0 = 0.84 * N, hz = 0.58 * N, grav = G(N);
    if (w.N !== N) burstTables(w, N);
    w.aura = follow(w.aura, clamp(0.25 + 0.75 * f.rel.bassDrive), dt, 0.2);
    for (const hh of hits) {
      if (isLow(hh)) { const last = w.rings[w.rings.length - 1]; if (hh.strength > 0.7 && (!last || last.R > 0.2 * N)) w.rings.push({ R: 0, v: N * 0.6, bw: 2 * u }); for (const k of w.items) if (k.mode === 1) k.vy += N * 0.1 * hh.strength * k.z; s.shake = Math.max(s.shake, 0.15 * hh.strength); }
      else if (hh.kind === 'snare') w.core = 1;
      else if (isTonal(hh)) w.hue = hh.pc % 6;
    }
    if (f.section === 'drop') { // the release: every piece flung out from the figure on an arc, a ring of everything (the
      // blast measured by height over the ground at the piece's own distance, not down the screen, and thrown back up
      // off the ground under it, so nothing is driven into the ground)
      for (const k of w.items) { const dx = k.x - cx, dh = k.y - (g0 - cy) * k.z, d = Math.hypot(dx, dh) || 1, v = N * (1 + 0.6 * rnd()) * k.z; k.mode = 2; k.vx = (dx / d) * v; k.vy = (Math.abs(dh) / d) * v + N * 0.3 * k.z; k.w = (rnd() - 0.5) * 10; }
      for (let k = 0; k < 3; k++) w.rings.push({ R: -k * 14 * u, v: N * 1.3, bw: 3 * u });
      w.release = 1; w.core = 1; s.shake = Math.max(s.shake, 0.9);
    } else if (f.section === 'change') { w.kind = rollW(rnd, BURST_W, band); burstSet(w, rnd, N, u); w.core = 1; } // a white-out cut to the new place
    if (beatTick(w, f, dt) && w.rings.length < 6) w.rings.push({ R: 0, v: N * 0.45, bw: 1.5 * u });
    w.cyc = (w.cyc + dt * (1 + 3 * f.rel.midDrive)) % 6;
    w.core *= Math.exp(-dt * 6); w.release = Math.max(0, w.release - dt / 3);
    // the ground of the kind
    if (w.kind === 'city') { r.rect(0, 0, N, hz, BG); for (let j = 0; j < 10; j++) { const bh = (0.08 + hash(j, 41) * 0.2) * N; r.rect((j / 10) * N, hz - bh, N / 10 + 1, bh, DARK); } r.rect(0, hz, N, N - hz, MID + DIM); r.rect(0, (hz + g0) / 2, N, N, MID); }
    else if (w.kind === 'crater') { r.rect(0, 0, N, hz, DARK + DIM); r.rect(0, hz, N, N - hz, DARK); span(r, cx, g0, 0.3 * N, 0.36 * N, MID + DIM, 0.12); }
    else { r.rect(0, 0, N, hz, COOL + DIM); for (let j = 0; j < 9; j++) cloud(r, (j / 8) * N, hz + 0.02 * N, 0.2 * N, 0.08 * N, BRIGHT); r.rect(0, hz + 0.03 * N, N, N, BRIGHT); r.rect(0, (hz + g0) / 2, N, N, LMID); }
    // the aura and the waves, one pass through a table of colours by distance from the figure
    const lut = w.lut, Di = w.Di, buf = r.buf, NN = N * N, A = (0.08 + 0.2 * w.aura) * N * (1 + 0.1 * f.beat.pulse), ML = lut.length - 1;
    lut.fill(255);
    for (let d = 0; d < A && d <= ML; d++) lut[d] = d < A * 0.35 ? (w.core > 0.3 ? WHITE : BRIGHT) : RAMP[((((A - d) / (2.5 * u)) | 0) + ((w.cyc | 0) + w.hue)) % 6];
    w.rings = w.rings.filter((q) => {
      q.R += q.v * dt;
      for (let d = Math.max(0, Math.floor(q.R)); d < q.R + 6 * q.bw && d <= ML; d++) if (d >= A) lut[d] = RAMP[((((d - q.R) / q.bw) | 0) + w.hue) % 6];
      return q.R < ML;
    });
    for (let i = 0; i < NN; i++) { const v = lut[Di[i]]; if (v !== 255) buf[i] = v; }
    // the pieces: lifted while the aura is up past their mark, let go when it falls back, flung on the release
    for (const k of w.items) {
      if (k.mode === 0 && w.release <= 0.4 && w.aura > k.th && k.x > -0.1 * N && k.x < 1.1 * N) { k.mode = 1; k.w = (rnd() - 0.5) * 1.2; }
      else if (k.mode === 1 && w.aura < k.th - 0.1) k.mode = 2;
      debrisStep(k, k.hov * N * k.z * clamp((w.aura - k.th) / (1 - k.th) + 0.4), dt, grav * k.z);
      if (k.mode === 0 && (k.x < -0.1 * N || k.x > 1.1 * N)) { k.x = (0.1 + rnd() * 0.8) * N; k.y = 1.2 * N; k.vy = 0; k.vx = 0; k.mode = 2; } // thrown out of sight, it falls back in from above
      const gy = hz + (g0 - hz) * k.z, sz = DEBRIS[k.k].hx * DEBRIS[k.k].s * k.z * u, far = clamp(k.y / (0.5 * N));
      if (k.y < 0.9 * N) r.rect(k.x - sz * (1 - 0.6 * far), gy, 2 * sz * (1 - 0.6 * far), Math.max(1, u * k.z), DARK + DIM);
      drawDebris(r, k, k.x, gy - k.y, u, k.mode ? LMID : k.z < 0.7 ? MID + DIM : MID, DARK);
    }
    // the figure in the middle of it, arms out, held up in its own light, bobbing slowly
    const fh = 0.2 * N, by = cy + fh * 0.5 + Math.sin(t * 1.2) * 1.5 * u;
    rig(r, cx, by, fh, AIR_POSE, BLACK, w.core > 0.5 ? WHITE : -1, Math.max(1, u), 0, 1.2); // a silhouette against its own light
    targets.push({ x: cx - fh * 0.4, y: by - fh, w: fh * 0.8, h: fh });
  },
};

// ---------------------------------------------------------------------------------------------- platform slipstream
// A figure on a station platform as an express blasts through behind them: the slipstream whips the hair and the coat
// downwind, the papers on the platform fly up and tumble (light things only: the bench, the bin and the pillars stay
// put), the carriage windows strobe past at the tempo (the speed is set so a whole number of windows goes by every
// beat), the wheels turning at that speed. A kick calls the next train, a snare blares its headlamp, a note lights the
// windows, the treble is the breeze between trains. Kinds: an open platform, a subway, a night platform under lamps;
// a drop: the train is gone and the figure stands in sudden stillness, a few papers drifting down.
const PLAT_W = { open: [3, 2, 1], subway: [1, 2, 3], night: [2, 2, 2] };
const PAPER = [-1, -0.7, 1, -0.7, 1, 0.7, -1, 0.7];
// a sheet of paper: tumbling in the air (foreshortened as it turns), or a flat sliver lying on the platform
function drawPaper(r, p, u) {
  if (p.air) shape(r, PAPER, p.x, p.y, 2.5 * u, p.rot, BRIGHT, Math.max(0.2, Math.abs(Math.cos(p.rot * 0.7))));
  else r.rect(p.x - 3 * u, p.y, 6 * u, Math.max(1, u), BRIGHT);
}

const platformwind = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, PLAT_W, band), train: null, wind: 0, dir: 1, calm: 0, horn: 0, lit: BRIGHT, flap: 0,
      papers: Array.from({ length: 7 }, () => { const fy = (0.84 + rnd() * 0.13) * N; return { x: (0.05 + rnd() * 0.9) * N, y: fy, fy, vx: 0, vy: 0, rot: 0, w: 0, air: false, away: false, th: 0.35 + rnd() * 0.5 }; }) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = bpsOf(f), grav = G(N);
    const top = 0.22 * N, bot = 0.7 * N, rail = 0.76 * N, edge = 0.79 * N, ws = 0.12 * N, Lc = 0.6 * N;
    const call = (strength) => { // a whole number of windows a beat, near 1.8 frames a second across
      const k = Math.max(3, Math.round(((1.5 + 0.6 * strength) * N) / (ws * bps))), dir = rnd() < 0.5 ? 1 : -1, cars = 4 + Math.floor(rnd() * 5);
      w.train = { x: dir > 0 ? -0.05 * N : 1.05 * N, dir, v: ws * bps * k, len: cars * Lc };
    };
    for (const hh of hits) {
      if (isLow(hh) && !w.train && w.calm <= 0) call(hh.strength);
      else if (hh.kind === 'snare') w.horn = 0.3;
      else if (isTonal(hh)) w.lit = PC_COL[hh.pc];
    }
    if (f.section === 'drop') { // gone: the air stops dead, a few papers come down out of it
      w.train = null; w.wind = 0; w.calm = 8 / bps;
      for (let k = 0; k < 4; k++) { const p = w.papers[k]; p.air = true; p.away = false; p.x = (0.15 + rnd() * 0.7) * N; p.y = (0.25 + rnd() * 0.3) * N; p.vx = (rnd() - 0.5) * N * 0.05; p.vy = 0; p.w = (rnd() - 0.5) * 3; }
    } else if (f.section === 'change') w.kind = rollW(rnd, PLAT_W, band);
    w.calm -= dt; w.horn -= dt;
    // the slipstream: a push ahead of the nose, a gale along the body, a wake that dies away after the tail
    const T = w.train, fx = 0.45 * N;
    let want = 0;
    if (T) {
      T.x += T.dir * T.v * dt;
      const nose = (T.x - fx) * T.dir, tail = nose - T.len; // how far the nose is past the figure, and the tail
      want = nose > -0.35 * N && tail < 0 ? (nose > 0 ? 1.3 : 0.5 * (1 + nose / (0.35 * N))) * (T.v / (1.8 * N)) : 0;
      w.dir = T.dir;
      if (tail > 1.2 * N) w.train = null;
    }
    w.wind = follow(w.wind, want, dt, want > w.wind ? 0.12 : 0.9);
    const turb = 1 + 0.35 * Math.sin(t * 23) * (w.wind > 0.2 ? 1 : 0) + 0.2 * (hash(Math.floor(t * 12), 3) - 0.5), air = w.wind * turb, breeze = w.calm > 0 ? 0 : 0.25 * windOf(f);
    // the far side: sky and poles, a tiled wall, or the night
    if (w.kind === 'open') {
      r.rect(0, 0, N, 0.5 * N, BRIGHT); r.rect(0, 0, N, 0.12 * N, LMID);
      for (let k = 0; k < 4; k++) r.rect((0.1 + k * 0.27) * N, 0.04 * N, 2 * u, 0.4 * N, DARK);
      r.rect(0, 0.08 * N, N, Math.max(1, u), DARK);
      r.rect(0, 0.5 * N, N, 0.26 * N, MID + DIM);
    } else if (w.kind === 'subway') {
      r.rect(0, 0, N, rail, MID);
      for (let y = 0; y < rail; y += 4 * u) r.rect(0, y, N, Math.max(1, 0.5 * u), MID + DIM);
      for (let x = 0; x < N; x += 6 * u) r.rect(x, 0, Math.max(1, 0.5 * u), rail, MID + DIM);
      r.rect(0, 0, N, 0.06 * N, FIG);
      for (let k = 0; k < 5; k++) r.rect((0.08 + k * 0.2) * N, 0.06 * N, 0.08 * N, 2 * u, BRIGHT);
    } else {
      r.rect(0, 0, N, rail, BG);
      for (let k = 0; k < 30; k++) r.set(hash(k, 1) * N, hash(k, 2) * 0.4 * N, k % 4 ? LMID : BRIGHT);
      r.rect(0, 0.45 * N, N, 0.31 * N, DARK);
    }
    r.rect(0, bot, N, rail - bot + 2 * u, DARK); // the track bed
    // the train, the carriages' windows going by, the doors, the wheels rolling at its speed
    if (T) {
      const d = T.dir, nx = T.x, tx = T.x - d * T.len, x0 = Math.max(0, Math.min(nx, tx)), x1 = Math.min(N, Math.max(nx, tx));
      if (x1 > x0) {
        r.rect(x0, top, x1 - x0, bot - top, LMID);
        r.rect(x0, top + 0.05 * N, x1 - x0, 0.015 * N, HOT);
        r.rect(x0, bot - 0.06 * N, x1 - x0, 0.02 * N, MID);
        const wy = top + 0.1 * N, wh = 0.13 * N;
        // windows at fixed places along the train: every ws from the nose, a gap at each carriage's join
        const i0 = Math.max(0, Math.floor((d > 0 ? nx - x1 : x0 - nx) / ws) - 1), i1 = Math.min(Math.floor(T.len / ws) - 1, Math.ceil((d > 0 ? nx - x0 : x1 - nx) / ws) + 1);
        for (let i = i0; i <= i1; i++) {
          const along = i * ws + ws * 0.25, x = nx - d * along;
          if ((i % 5) === 4) { r.rect(x - d * ws * 0.4 - ws * 0.25, wy - 0.02 * N, ws * 0.5, bot - wy - 0.04 * N, MID); continue; } // the door
          r.rect(d > 0 ? x - ws * 0.6 : x + ws * 0.1, wy, ws * 0.5, wh, hash(i, 9) < 0.8 ? w.lit : DARK);
        }
        for (let i = 0; i <= T.len / Lc; i++) { const jx = nx - d * i * Lc; r.rect(jx - u, top, 2 * u, bot - top, DARK); } // the carriage joins
        const wr = 0.022 * N, wyc = rail - wr;
        for (let i = 0; i < T.len / Lc; i++) for (const q of [0.15, 0.28, 0.72, 0.85]) {
          const wx = nx - d * (i + q) * Lc, a = T.x / wr; // rolled through its travel over its radius, either way
          if (wx < -wr || wx > N + wr) continue;
          r.disc(wx, wyc, wr, FIG);
          r.line(wx, wyc, wx + Math.cos(a) * wr, wyc + Math.sin(a) * wr, MID);
        }
        // the nose, sloped, with its lamp
        if (nx > -0.1 * N && nx < 1.1 * N) { r.poly([[nx, top], [nx + d * 0.08 * N, top + 0.12 * N], [nx + d * 0.1 * N, bot], [nx, bot]], LMID); r.disc(nx + d * 0.08 * N, bot - 0.06 * N, (w.horn > 0 ? 3 : 1.5) * u, w.horn > 0 ? WHITE : BRIGHT); if (w.horn > 0) r.stroke(nx + d * 0.08 * N, bot - 0.06 * N, nx + d * 0.5 * N, bot - 0.1 * N, 2 * u, BRIGHT + DIM); }
        targets.push({ x: x0, y: top, w: x1 - x0, h: bot - top });
      }
    }
    // the near platform: its edge line, a warning lamp blinking on the beat while a train is near, the bench and the bin
    r.rect(0, rail, N, N - rail, w.kind === 'night' ? DARK + DIM : MID);
    r.rect(0, edge, N, Math.max(1, 1.5 * u), w.kind === 'night' ? LMID : BRIGHT);
    r.disc(0.9 * N, edge + 3 * u, 1.5 * u, T && f.beat.pulse > 0.4 ? HOT : DARK);
    if (w.kind === 'night') for (const lx of [0.2, 0.75]) { span(r, lx * N + u, 0.9 * N, 0, 0.12 * N, LMID + DIM, 0.3); r.rect(lx * N, 0.42 * N, 2 * u, 0.9 * N - 0.42 * N, FIG); r.disc(lx * N + u, 0.43 * N, 2.5 * u, BRIGHT); } // the lamps' pools of light on the platform
    r.rect(0.68 * N, 0.86 * N, 0.16 * N, 2 * u, DARK); r.rect(0.69 * N, 0.86 * N, 2 * u, 0.05 * N, DARK); r.rect(0.82 * N, 0.86 * N, 2 * u, 0.05 * N, DARK); // the bench
    r.rect(0.12 * N, 0.85 * N, 0.04 * N, 0.07 * N, DARK); // the bin
    // the papers: lying flat until the gust under them is enough, then carried on the air, tumbling, falling slowly;
    // the ones lying nearer than the figure are drawn after it
    for (const p of w.papers) {
      if (p.away) { if (w.wind > 0.5 && rnd() < dt) { p.away = false; p.air = true; p.x = w.dir > 0 ? -0.05 * N : 1.05 * N; p.y = p.fy - rnd() * 0.25 * N; p.vx = w.dir * N * 0.5; p.vy = 0; } continue; } // blown in from upwind
      if (!p.air && air > p.th) { p.air = true; p.vy = -N * (0.25 + 0.3 * rnd()) * air; p.w = (rnd() - 0.5) * 14; }
      if (p.air) {
        p.vx = follow(p.vx, w.dir * air * N * 1.1 + breeze * N * 0.1, dt, 0.25);
        p.vy = follow(p.vy, N * 0.12 - air * turb * N * 0.25, dt, 0.35); // a paper falls at a slow terminal speed, held up by the gusts
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += (p.w + w.dir * air * 6) * dt;
        if (p.y >= p.fy && p.vy > 0) { p.y = p.fy; p.air = false; p.vx = 0; p.vy = 0; p.rot = 0; }
        if (p.x < -0.1 * N || p.x > 1.1 * N || p.y < -0.1 * N) { p.away = true; continue; }
      }
      if (p.fy <= 0.92 * N) drawPaper(r, p, u);
    }
    // the figure: the coat's hem and the hair stream downwind, quicker the harder it blows; the body does not move
    w.flap += dt * (4 + 26 * air);
    const ftop = coatFigure(r, fx, 0.92 * N, 0.32 * N, FIG, w.dir * air + breeze, w.flap, u);
    targets.push({ x: fx - 0.08 * N, y: ftop, w: 0.16 * N, h: 0.92 * N - ftop });
    for (const p of w.papers) if (!p.away && p.fy > 0.92 * N) drawPaper(r, p, u);
    if (air > 0.6) s.shake = Math.max(s.shake, 0.05 * air);
  },
};

// ---------------------------------------------------------------------------------------------- emblem slam
// An emblem with no letters slammed together out of pieces: a star, a ring, a bolt, wings, chevrons, a shield, a
// gear, each flying in on the beat along a curving arc on a damped spring (so it overshoots and settles), turned and
// scaled down into place, a rotating sunburst behind, sparkles off its edges. A kick punches the whole emblem (its
// scale on a spring), a snare throws sparkles, a note colours the sunburst, the mids turn it faster. Kinds: four
// designs, rebuilt on a section change and every eight bars (the old pieces knocked away under gravity); a drop is
// a flash and a shockwave, the emblem shaking and holding.
const EMB_W = { star: [3, 2, 2], bolt: [1, 2, 3], crest: [2, 2, 1], gear: [1, 2, 2] };
const starPts = (n, ri) => Array.from({ length: 4 * n }, (_, i) => { const k = i >> 1, a = -Math.PI / 2 + (k / (2 * n)) * TAU, rr = k % 2 ? ri : 1; return i % 2 ? Math.sin(a) * rr : Math.cos(a) * rr; });
const gearPts = (n) => Array.from({ length: 8 * n }, (_, i) => { const k = i >> 1, a = (k / (4 * n)) * TAU, rr = k % 4 < 2 ? 1 : 0.8; return i % 2 ? Math.sin(a) * rr : Math.cos(a) * rr; });
const EMB_SH = {
  star: starPts(5, 0.45), spark: starPts(4, 0.3), gear: gearPts(6),
  bolt: [-0.35, -1, 0.45, -1, 0.05, -0.15, 0.5, -0.15, -0.4, 1, -0.05, 0.1, -0.5, 0.1],
  wing: [0, 0, 0.3, -0.55, 1, -0.75, 0.85, -0.45, 1.1, -0.35, 0.85, -0.15, 1, 0, 0.6, 0.15, 0, 0.25],
  chev: [-1, -0.2, 0, -0.8, 1, -0.2, 1, 0.3, 0, -0.3, -1, 0.3],
  shield: [-0.8, -0.9, 0.8, -0.9, 0.8, 0.1, 0, 0.95, -0.8, 0.1],
};
// [shape or ring, x, y (in emblem radii), scale (or the ring's inner and outer radius), turn, role, mirrored]
const EMBLEMS = {
  star: [['ring', 0, 0, [0.62, 0.78], 0, COOL], ['wing', -0.72, 0.05, 0.6, 0, LMID, -1], ['wing', 0.72, 0.05, 0.6, 0, LMID], ['star', 0, 0, 0.55, 0, HOT], ['chev', 0, 0.95, 0.3, 0, BRIGHT]],
  bolt: [['ring', 0, 0, [0.55, 0.72], 0, HOT], ['chev', 0, -0.92, 0.3, 0, LMID], ['chev', 0, 0.92, 0.3, Math.PI, LMID], ['bolt', 0, 0, 0.5, 0.15, BRIGHT]],
  crest: [['wing', -0.62, -0.1, 0.7, 0, HOT, -1], ['wing', 0.62, -0.1, 0.7, 0, HOT], ['shield', 0, 0, 0.6, 0, COOL], ['star', 0, -0.05, 0.28, 0, BRIGHT], ['chev', 0, 0.38, 0.22, 0, BRIGHT]],
  gear: [['gear', 0, 0, 0.75, 0, MID], ['ring', 0, 0, [0.38, 0.5], 0, BRIGHT], ['bolt', 0, 0, 0.32, 0.15, HOT], ['star', -0.9, -0.75, 0.16, 0, BRIGHT], ['star', 0.9, -0.75, 0.16, 0, BRIGHT]],
};

function buildEmblem(w, rnd, N) {
  for (const p of w.pieces) if (p.on) w.loose.push({ ...p, vx: p.x * 3 + (rnd() - 0.5) * N * 0.4, vy: -N * (0.3 + rnd() * 0.4), va: (rnd() - 0.5) * 8 }); // knocked away, out from the middle (x is from the emblem's centre)
  w.pieces = EMBLEMS[w.kind].map(([sh, x, y, sc, a, c, mx]) => ({ sh, tx: x, ty: y, sc, ta: a, c, mx: mx || 1, on: false, x: 0, y: 0, vx: 0, vy: 0, s: 1, vs: 0, a: 0, va: 0 }));
  w.next = 0; w.built = w.bp;
}
function drawPiece(r, p, x, y, R, z, col, grow) {
  const s = p.s * z;
  if (p.sh === 'ring') { span(r, x, y, p.sc[0] * R * s - grow, p.sc[1] * R * s + grow, col); return; }
  shape(r, EMB_SH[p.sh], x, y, p.sc * R * s + grow, p.a, col, p.mx);
}

const logoslam = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, EMB_W, band), pieces: [], loose: [], next: 0, built: null, bp: null, P: 1, vP: 0, shake: 0, wave: -1, flashT: 0, rot: 0, ray: HOT, sparks: [], hold: 0, swap: 0, N: 0 });
    buildEmblem(w, rnd, N);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), bps = bpsOf(f), cx = 0.5 * N, cy = 0.48 * N, R = 0.3 * N;
    w.bp = beatPos(w, f, dt);
    if (w.built === null) w.built = w.bp;
    if (w.N !== N) { // the sunburst's table: every cell's angle round the emblem, as a 16-bit turn
      w.N = N; w.ang = new Uint16Array(N * N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) w.ang[y * N + x] = Math.floor(((Math.atan2(y + 0.5 - cy, x + 0.5 - cx) / TAU + 1) % 1) * 65536) & 65535;
    }
    const spark = (n) => { for (let k = 0; k < n && w.sparks.length < 40; k++) { const a = rnd() * TAU, d = R * (0.5 + rnd() * 0.6); w.sparks.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, life: 0.4 + rnd() * 0.4, sz: (2 + rnd() * 3) * u }); } };
    for (const hh of hits) {
      if (isLow(hh)) { w.vP += 1.2 * hh.strength; s.shake = Math.max(s.shake, 0.15 * hh.strength); }
      else if (hh.kind === 'snare') spark(6);
      else if (hh.kind === 'hat') spark(2);
      else if (isTonal(hh)) w.ray = PC_COL[hh.pc];
    }
    if (f.section === 'drop') { w.flashT = 0.06; w.wave = 0; w.shake = 1; w.hold = 16; for (const p of w.pieces) if (!p.on) { p.on = true; p.x = p.tx * R; p.y = p.ty * R; } s.shake = Math.max(s.shake, 0.8); }
    else if (f.section === 'change' || (w.bp - w.built > 32 && w.hold <= 0)) { w.kind = rollW(rnd, EMB_W, band); buildEmblem(w, rnd, N); }
    // the next piece flies in on the beat: from off the frame, moving across its line in, so it curves, big and turned
    if (beatTick(w, f, dt)) {
      const p = w.pieces[w.next];
      if (p) {
        const a = (w.next * 2.4 + 0.7) % TAU, side = w.next % 2 ? 1 : -1;
        Object.assign(p, { on: true, x: Math.cos(a) * N * 0.9, y: Math.sin(a) * N * 0.9, vx: -Math.sin(a) * side * N * 2.2, vy: Math.cos(a) * side * N * 2.2, s: 2.2, vs: 0, a: p.ta + side * 1.6, va: 0 });
        w.next++;
      }
      w.swap = 0.1;
    }
    w.hold -= dt * bps; w.swap -= dt;
    spring(w, 'P', 'vP', 1, dt, 16, 0.3);
    w.shake *= Math.exp(-dt * 3);
    w.rot += dt * (0.3 + 1.5 * f.rel.midDrive);
    // the sunburst: rays turning round the emblem, swapping on the beat
    const n = [12, 16, 20][band], ru = Math.floor((w.rot / TAU) * 65536) & 65535, ang = w.ang, buf = r.buf, NN = N * N, A = w.swap > 0 ? BG : w.ray, B = w.swap > 0 ? w.ray : BG;
    for (let i = 0; i < NN; i++) buf[i] = ((((ang[i] + ru) & 65535) * n) >> 16) & 1 ? A : B;
    span(r, cx, cy, 0, R * 1.05 * w.P, DARK + DIM);
    // the shockwave of the drop
    if (w.wave >= 0) { w.wave += dt * N * 1.2; span(r, cx, cy, Math.max(0, w.wave - 3 * u), w.wave, WHITE); if (w.wave > N) w.wave = -1; }
    // the pieces on their springs; the knocked-away ones fall
    const ox = cx + Math.sin(t * 40) * w.shake * 3 * u, oy = cy + Math.cos(t * 33) * w.shake * 2 * u, z = w.P;
    w.loose = w.loose.filter((p) => { const g = G(N); p.x += p.vx * dt; p.y += p.vy * dt + 0.5 * g * dt * dt; p.vy += g * dt; p.a += p.va * dt; drawPiece(r, p, cx + p.x, cy + p.y, R, 1, p.c + DIM, 0); return cy + p.y < N * 1.3; });
    for (const p of w.pieces) {
      if (!p.on) continue;
      spring(p, 'x', 'vx', p.tx * R, dt, 11, 0.32);
      spring(p, 'y', 'vy', p.ty * R, dt, 11, 0.32);
      spring(p, 's', 'vs', 1, dt, 14, 0.3);
      spring(p, 'a', 'va', p.ta, dt, 10, 0.35);
      drawPiece(r, p, ox + p.x * z, oy + p.y * z, R, z, FIG, 1.5 * u);
      drawPiece(r, p, ox + p.x * z, oy + p.y * z, R, z, p.c, 0);
    }
    // sparkles: four-pointed glints that twinkle on twos
    w.sparks = w.sparks.filter((q) => { q.life -= dt; const tw = hash(Math.round(q.x), Math.floor(t * 12)) < 0.7 ? 1 : 0.5; shape(r, EMB_SH.spark, q.x, q.y, q.sz * tw * Math.min(1, q.life * 3), t * 2, WHITE); return q.life > 0; });
    targets.push({ x: cx - R, y: cy - R, w: 2 * R, h: 2 * R });
    if (w.flashT > 0) { w.flashT -= dt; r.fill(WHITE); } // a white flash, two frames long at 30 a second, as long at any rate
  },
};

const WORLDS = { psychopaint, psychicaura, filmcuts, inksplatter, posecrew, palettewhip, mangapanels, runningcrowd, skypan, rainbowburst, platformwind, logoslam };
registerFamily('openings', WORLD_DEFS, WORLDS);
export const OPENINGS_STYLE = makeMixStyle('OPENINGS', ['openings']);
