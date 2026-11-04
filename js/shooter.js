// Shooters, mixed. The visual tropes of the team shooters, the co-op shooters, the physics puzzlers and the MOBAs as
// worlds: a bomb cart pushed along its track, a capture point, a sterile test chamber with two ovals, a walled city
// under a dark tower, a research facility and its cascade, a dusty map with two sites, three lanes from above, a
// neon lane with zip lines, four survivors in the dark, a rocket-jump playground and an engineer's nest. Original
// silhouettes and sets only: no logo, name, character design, emblem or readable text from any actual game. Each
// world has a kinds table weighted by the arousal band, re-rolled on a section change, with a heavy variant on a
// drop; the physics is real: impulses give parabolas, momentum goes through the ovals, the tripods keep one foot
// moving at a time, the riders slide down the sag, the cones light only what they reach. Every world draws with the
// palette roles, so any palette, treatment and layout of the mixer fits.
import { Raster, clamp, lerp } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow,
  followAngle, ease, beatLocked, hash, pickW, walker, snowfall, particles, burst, shiftRow, shiftRows, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  payload: { name: 'the payload', va: [[H, H], [M, H], [H, M]], pals: ['military', 'tape', 'sepia', 'cinema', 'ice'], fx: ['none', 'crt', 'frame', 'film'] },
  controlpoint: { name: 'the control point', va: [[H, H], [M, H], [H, M]], pals: ['military', 'cinema', 'tape', 'neon', 'bureau'], fx: ['none', 'frame', 'crt', 'hud'] },
  testchamber: { name: 'the test chamber', va: [[M, M], [H, M], [M, L]], pals: ['bureau', 'ice', 'blueprint', 'noir', 'phosphor'], fx: ['none', 'crt', 'hud', 'frame'] },
  citadel: { name: 'under the citadel', va: [[M, H], [L, H], [L, M]], pals: ['bureau', 'noir', 'sepia', 'military', 'machine'], fx: ['film', 'none', 'vhs', 'hud'] },
  researchlab: { name: 'the research facility', va: [[M, H], [L, H], [L, M]], pals: ['bureau', 'phosphor', 'toxic', 'noir', 'amber'], fx: ['crt', 'none', 'film', 'vhs'] },
  defusal: { name: 'two sites', va: [[M, H], [L, H], [L, M]], pals: ['sepia', 'military', 'tape', 'bureau', 'noir'], fx: ['none', 'hud', 'film', 'frame'] },
  lanes: { name: 'three lanes', va: [[H, H], [M, H], [H, M]], pals: ['military', 'blueprint', 'neon', 'phosphor', 'cinema'], fx: ['frame', 'none', 'crt', 'hud'] },
  heroshooter: { name: 'the neon lane', va: [[H, H], [M, H], [H, M]], pals: ['neon', 'cinema', 'ice', 'machine', 'noir'], fx: ['none', 'crt', 'frame', 'film'] },
  saferoom: { name: 'the safe room', va: [[M, H], [L, H], [L, M]], pals: ['noir', 'toxic', 'military', 'sepia', 'machine'], fx: ['film', 'vhs', 'none', 'crt'] },
  rocketarena: { name: 'rocket arena', va: [[H, H], [M, H], [H, M]], pals: ['cinema', 'military', 'neon', 'ice', 'blueprint'], fx: ['none', 'crt', 'frame', 'hud'] },
  engineernest: { name: 'the nest', va: [[M, M], [H, M], [M, L]], pals: ['military', 'amber', 'tape', 'blueprint', 'bureau'], fx: ['none', 'crt', 'frame'] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// the arousal band a mood falls in (low, mid, high): the kinds tables below weigh their entries by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bpsOf = (f) => (f.bpm ? f.bpm / 60 : 2);
const GRAV = 1.6; // screens per second squared: the gravity the mixer's particles fall with, so everything falls alike
const TEAM = [COOL, HOT]; // the two sides, by the accents: neither has a name
// the shadow under a thing: a flat dark pill on the ground plane under where it would land, narrower the higher it is
const shadow = (r, x, gy, wd, u) => r.rect(x - wd / 2, gy - u * 0.5, wd, Math.max(1, u), DARK + DIM);
// the floor of most side views: a body and a lighter lip
const ground = (r, N, g, u, lip = LMID, body = MID) => { r.rect(0, g, N, N - g, body); r.rect(0, g, N, Math.max(1, u), lip); };
// straight tracers that fade: {x0, y0, x1, y1, t}, bright while fresh
function tracers(W, list, c, speed = 6) {
  const { r, dt } = W;
  for (const tr of list) { tr.t -= dt * speed; r.line(tr.x0, tr.y0, tr.x1, tr.y1, tr.t > 0.5 ? BRIGHT : c); }
  return list.filter((tr) => tr.t > 0);
}
// smoke: rises, slows to a drift, fades
function smoke(W, list, c = LMID + DIM) {
  const { r, dt, u, t } = W;
  for (const p of list) { p.vy = follow(p.vy, -1.5 * u, dt, 1); p.x += p.vx * dt + Math.sin(t * 2 + (p.y * 0.2) / u) * u * dt * 3; p.y += p.vy * dt; p.life -= dt; r.rect(p.x, p.y, 2 * u, 2 * u, c); }
  return list.filter((p) => p.life > 0);
}
// a jagged bolt from a to b, `n` kinks, the kinks fresh every frame
function bolt(r, rnd, x0, y0, x1, y1, n, amp, c) {
  let px = x0, py = y0;
  for (let k = 1; k <= n; k++) {
    const q = k / n, nx = k === n ? x1 : lerp(x0, x1, q) + (rnd() - 0.5) * amp, ny = k === n ? y1 : lerp(y0, y1, q) + (rnd() - 0.5) * amp;
    r.line(px, py, nx, ny, c);
    px = nx; py = ny;
  }
}

// the nine class archetypes as silhouettes on the shared walker: a height, a girth, a hat, and the one thing each carries
const CLASSES = {
  scout: { h: 0.85, dress: { cap: true } }, // lean, a cap, the quick legs, a short gun
  soldier: { h: 1, dress: { hat: true } }, // a helmet, a tube carried over the shoulder
  pyro: { h: 1, dress: { coat: true } }, // a tank on the back, a hose with a pilot light
  demo: { h: 0.95, dress: { cap: true } }, // a launcher held low, a bottle at the hip
  heavy: { h: 1.1, dress: { coat: true } }, // wide, the big gun held across the belly
  engineer: { h: 0.9, dress: { hat: true, hatCol: LMID } }, // a hard hat and a wrench
  medic: { h: 1, dress: { coat: true } }, // a long coat, a pack on the back with a light
  sniper: { h: 1.05, dress: { hat: true } }, // a brimmed hat, the long rifle
  spy: { h: 1, dress: {} }, // slim, bareheaded, a band over the face, a knife
};
const CLASS_KEYS = Object.keys(CLASSES);
// a class at x with the feet on `base`, `h` the full height of the soldier; returns the walker's joints
function drawClass(r, kind, x, base, h, col, ph, dir, u) {
  const C = CLASSES[kind], hh = h * C.h, J = walker(r, x, base, hh, col, ph, dir, C.dress), hx = J.sx, hy = J.sy + hh * 0.14, w1 = Math.max(1, u), bx = x - dir * J.hw;
  switch (kind) {
    case 'scout': r.stroke(hx, hy, hx + dir * hh * 0.25, hy + hh * 0.04, 1.5 * u, DARK); break;
    case 'soldier': r.stroke(x - dir * hh * 0.32, J.top + hh * 0.03, x + dir * hh * 0.3, J.top + hh * 0.03, 3 * u, DARK); r.ring(x + dir * hh * 0.3, J.top + hh * 0.03, 1.6 * u, w1, LMID); break;
    case 'pyro': r.rect(bx - (dir > 0 ? 3 * u : 0), J.sy, 3 * u, hh * 0.35, MID); r.stroke(hx, hy, hx + dir * hh * 0.3, hy + hh * 0.1, 2 * u, DARK); r.rect(hx + dir * hh * 0.3 - u, hy + hh * 0.1 - 2 * u, 2 * u, 2 * u, HOT); break;
    case 'demo': r.stroke(hx, hy, hx + dir * hh * 0.22, hy + hh * 0.14, 2.5 * u, DARK); r.disc(hx + dir * hh * 0.06, hy + hh * 0.04, 1.6 * u, MID); r.rect(bx - (dir > 0 ? 2 * u : 0), base - hh * 0.48, 2 * u, 3.5 * u, LMID); break;
    case 'heavy': r.rect(x - J.hw * 1.4, J.sy, J.hw * 2.8, hh * 0.38, col); r.stroke(hx - dir * hh * 0.1, hy, hx + dir * hh * 0.42, hy + hh * 0.05, 3.5 * u, DARK); r.ring(hx + dir * hh * 0.42, hy + hh * 0.05, 2 * u, w1, LMID); break;
    case 'engineer': { const ex = hx + dir * hh * 0.18, ey = hy - hh * 0.2; r.stroke(hx, hy, ex, ey, 1.5 * u, LMID); r.rect(ex - 1.5 * u, ey - 2 * u, 3 * u, w1, LMID); r.rect(ex - 1.5 * u, ey - 2 * u, w1, 2 * u, LMID); r.rect(ex + 0.5 * u, ey - 2 * u, w1, 2 * u, LMID); break; }
    case 'medic': r.rect(bx - (dir > 0 ? 4 * u : 0), J.sy + hh * 0.02, 4 * u, hh * 0.3, LMID); r.rect(bx - (dir > 0 ? 3 * u : -u), J.sy + hh * 0.08, 2 * u, 2 * u, BRIGHT); r.stroke(hx, hy, hx + dir * hh * 0.2, hy, 2 * u, DARK); r.rect(hx + dir * hh * 0.2 - u, hy - u, 2 * u, 2 * u, COOL); break;
    case 'sniper': r.stroke(hx - dir * hh * 0.1, hy + hh * 0.05, hx + dir * hh * 0.55, hy - hh * 0.06, 1.5 * u, DARK); r.rect(hx + dir * hh * 0.12 - 1.5 * u, hy - hh * 0.02 - 2.5 * u, 3 * u, 1.5 * u, DARK); break;
    default: r.rect(x - hh * 0.1, J.head - 0.5 * u, hh * 0.2, w1, DARK); r.stroke(hx, hy, hx + dir * hh * 0.12, hy + hh * 0.02, w1, BRIGHT);
  }
  return J;
}

// ---------------------------------------------------------------------------------------------- payload
// A bomb cart on its track through a map with three checkpoints that light as it reaches them; two teams of the nine
// classes, each its own silhouette. The attackers push while the music carries them (the cart stops when it goes
// quiet and nobody is on it), the defenders fall back ahead of it. A kick is a rocket jump: a blast at the ground
// behind the feet, the impulse from it, a true parabola and a landing crouch; a snare is a shot across (a tracer,
// the one hit flashes, now and then drops and waits in the respawn door, which opens on a section change); hats
// are the sentry on its tripod, tracking the nearest attacker and firing. A drop is overtime: everyone piles onto
// the cart and it runs. The map: a desert, an industrial yard or snow, by the mood.
const MAP_W = { desert: [2, 2, 2], industrial: [1, 2, 3], snow: [3, 2, 1] };
const payload = {
  init(W) {
    const { w, rnd } = W, figs = [];
    for (let team = 0; team < 2; team++) CLASS_KEYS.forEach((kind, i) => figs.push({ team, kind, x: team ? 0.72 + i * 0.028 : 0.02 + i * 0.012, y: 0, vx: 0, vy: 0, air: false, ph: rnd() * TAU, lane: (rnd() - 0.5) * 0.05, dead: 0, flash: 0, fire: 0, crouch: 0, dir: team ? -1 : 1 }));
    Object.assign(w, { map: rollW(rnd, MAP_W, bandOf(W.a)), figs, cart: 0.08, wheel: 0, cps: [0.32, 0.56, 0.8].map((x) => ({ x, lit: 0 })), tracers: [], sparks: [], smoke: [], sentry: { a: Math.PI, x: 0.68, fire: 0 }, over: 0, door: 0, win: 0, snow: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.8 * N, bps = bpsOf(f), H0 = 0.13 * N, quiet = f.level < 0.2, cartX = w.cart * N;
    const live = (team) => w.figs.filter((q) => q.team === team && !q.dead);
    const nearest = (x, team) => { let best = null, bd = 9; for (const q of w.figs) if (q.team === team && !q.dead) { const d = Math.abs(q.x - x); if (d < bd) { bd = d; best = q; } } return best; };
    const shoot = (fx, fy, tg, kill) => { w.tracers.push({ x0: fx, y0: fy, x1: tg.x * N + (rnd() - 0.5) * 3 * u, y1: g + tg.lane * N - tg.y * N - H0 * 0.5, t: 1 }); tg.flash = 0.2; if (rnd() < kill) tg.dead = 6; }; // (one shot in the air falls the rest of the way)
    const jump = (q, k) => { // the blast at the ground behind the feet; the impulse points from it to the body
      const ex = q.x - q.dir * 0.02, dx = q.x - ex, dy = q.y + 0.06 + 0.005, len = Math.hypot(dx, dy) || 1, v = 0.75 + 0.5 * k;
      q.vx = (dx / len) * v; q.vy = (dy / len) * v; q.air = true;
      burst(w.sparks, rnd, ex * N, g + q.lane * N, 10, N * 0.35, HOT, 0.4);
      for (let i = 0; i < 6; i++) w.smoke.push({ x: ex * N, y: g + q.lane * N, vx: (rnd() - 0.5) * 8 * u, vy: -rnd() * 12 * u, life: 0.9 });
      s.shake = Math.max(s.shake, 0.25);
    };
    for (const h of hits) {
      if (isLow(h)) { for (const team of h.strength > 0.8 ? [0, 1] : [0]) { const q = live(team).find((p) => (p.kind === 'soldier' || p.kind === 'demo') && !p.air); if (q) jump(q, h.strength); } }
      else if (h.kind === 'snare') { const team = rnd() < 0.6 ? 1 : 0, sh = pick(rnd, live(team)), tg = sh && nearest(sh.x, 1 - team); if (sh && tg) { sh.fire = 0.12; sh.dir = tg.x > sh.x ? 1 : -1; shoot(sh.x * N + sh.dir * H0 * 0.3, g + sh.lane * N - sh.y * N - H0 * 0.55, tg, 0.3); } }
      else if (h.kind === 'hat' || h.kind === 'perc') { const tg = nearest(w.sentry.x, 0); if (tg && Math.abs(tg.x - w.sentry.x) < 0.32) { w.sentry.fire = 0.1; shoot(w.sentry.x * N + Math.cos(w.sentry.a) * 6 * u, g - 7 * u + Math.sin(w.sentry.a) * 6 * u, tg, 0.12); } }
    }
    if (f.section === 'drop') w.over = 8;
    const respawn = f.section === 'change', over = w.over > 0;
    w.over -= dt; w.door -= dt; w.sentry.fire -= dt;
    // the cart: pushed by whoever stands behind it on the ground, faster with the bass; a checkpoint lights as it passes
    const pushers = live(0).filter((q) => !q.air && q.x < w.cart && q.x > w.cart - 0.1).length;
    const vCart = w.win > 0 ? 0 : Math.min(3, pushers) * 0.012 * bps * (0.4 + f.rel.bassDrive) * (over ? 1.8 : 1);
    w.cart += vCart * dt;
    w.wheel += (vCart * dt) / 0.018; // the wheels roll at the speed of travel: the angle is the distance over their radius
    for (const cp of w.cps) if (!cp.lit && w.cart >= cp.x) { cp.lit = 1; burst(w.sparks, rnd, cp.x * N, g - 0.24 * N, 14, N * 0.3, BRIGHT, 0.6); }
    if (w.cart > 0.93 && w.win <= 0) { w.win = 3; burst(w.sparks, rnd, cartX, g - 0.05 * N, 40, N * 0.6, HOT, 1); s.shake = Math.max(s.shake, 1); for (const q of w.figs) if (Math.abs(q.x - w.cart) < 0.25) { q.dead = 2.5; q.air = false; q.y = 0; } }
    if (w.win > 0 && (w.win -= dt) <= 0) { w.cart = 0.08; for (const cp of w.cps) cp.lit = 0; }
    // the back, by the map
    if (w.map === 'desert') {
      r.disc(0.82 * N, 0.17 * N, 0.06 * N, BRIGHT);
      for (const [mx, mw, mh] of [[0.12, 0.24, 0.14], [0.46, 0.16, 0.1], [0.78, 0.3, 0.18]]) r.poly([[(mx - mw / 2) * N, g], [(mx - mw * 0.4) * N, g - mh * N], [(mx + mw * 0.4) * N, g - mh * N], [(mx + mw / 2) * N, g]], DARK + DIM);
      for (let k = 0; k < 4; k++) { const cx = (0.07 + k * 0.27) * N, ch = (0.08 + 0.03 * hash(k, 3)) * N; r.rect(cx - u, g - ch, 2 * u, ch, DARK); r.rect(cx - 4 * u, g - ch * 0.6, 3 * u, 1.5 * u, DARK); r.rect(cx - 4 * u, g - ch * 0.8, 1.5 * u, ch * 0.2, DARK); r.rect(cx + u, g - ch * 0.5, 3 * u, 1.5 * u, DARK); r.rect(cx + 2.5 * u, g - ch * 0.75, 1.5 * u, ch * 0.25, DARK); }
      ground(r, N, g, u, BRIGHT, LMID);
    } else if (w.map === 'industrial') {
      r.rect(0, 0.5 * N, N, 1.5 * u, MID);
      for (let k = 0; k < 5; k++) r.rect((0.1 + k * 0.2) * N, 0.5 * N, Math.max(1, u), g - 0.5 * N, MID);
      for (const sx of [0.15, 0.62]) { r.rect(sx * N - 2.5 * u, 0.28 * N, 5 * u, g - 0.28 * N, DARK); r.rect(sx * N - 3.5 * u, 0.28 * N, 7 * u, 2 * u, DARK); if (rnd() < dt * 5 * (0.3 + f.level)) w.smoke.push({ x: sx * N, y: 0.28 * N, vx: 3 * u, vy: -8 * u, life: 2.5 }); }
      r.disc(0.88 * N, g - 0.11 * N, 0.07 * N, DARK); for (const k of [-0.04, 0.04]) r.rect((0.88 + k) * N - u, g - 0.1 * N, 2 * u, 0.1 * N, DARK);
      ground(r, N, g, u, LMID, MID);
    } else {
      for (let k = 0; k < 6; k++) { const px = (0.04 + k * 0.19) * N, ph = (0.16 + 0.06 * hash(k, 5)) * N; r.poly([[px - 0.045 * N, g], [px, g - ph], [px + 0.045 * N, g]], DARK); r.poly([[px - 0.03 * N, g - ph * 0.45], [px, g - ph], [px + 0.03 * N, g - ph * 0.45]], DARK + DIM); }
      ground(r, N, g, u, BRIGHT, LMID);
      snowfall(W, w.snow, 50, 0.1, BRIGHT);
    }
    // the track and its ties, the respawn doors, the checkpoints
    for (let x = 0; x < N; x += 6 * u) r.rect(x, g - u, 2 * u, 2.5 * u, DARK + DIM);
    r.rect(0, g - 2 * u, N, Math.max(1, u), DARK);
    for (const team of [0, 1]) { const dx = team ? 0.955 * N : 0; r.rect(dx, g - 0.2 * N, 0.045 * N, 0.2 * N, DARK); r.rect(dx + u, g - 0.19 * N, 0.045 * N - 2 * u, 0.19 * N, w.door > 0 ? BRIGHT : BG); r.rect(dx + 0.012 * N, g - 0.23 * N, 0.02 * N, 2 * u, TEAM[team]); }
    for (const cp of w.cps) { r.rect(cp.x * N - 0.5 * u, g - 0.22 * N, Math.max(1, u), 0.22 * N, DARK); if (cp.lit) r.ring(cp.x * N, g - 0.23 * N, 5 * u, 1.5 * u, LMID + DIM); r.rect(cp.x * N - 3 * u, g - 0.25 * N, 6 * u, 4 * u, cp.lit ? BRIGHT : DARK); }
    // the sentry: a tripod, a body, the barrel tracking the nearest attacker
    const se = w.sentry, sx = se.x * N, st = nearest(se.x, 0);
    se.a = followAngle(se.a, st ? Math.atan2(st.lane * N - st.y * N - H0 * 0.5 + 7 * u, (st.x - se.x) * N) : Math.PI, dt, 0.25);
    for (const k of [-4, 0, 4]) r.line(sx, g - 5 * u, sx + k * u + (k ? 0 : 2 * u), g, DARK);
    r.rect(sx - 3 * u, g - 9 * u, 6 * u, 4 * u, DARK);
    r.stroke(sx, g - 7 * u, sx + Math.cos(se.a) * 7 * u, g - 7 * u + Math.sin(se.a) * 7 * u, 2 * u, se.fire > 0 ? LMID : DARK);
    r.rect(sx - 0.5 * u, g - 10 * u, Math.max(1, u), Math.max(1, u), f.beat.pulse > 0.5 ? BRIGHT : HOT);
    if (se.fire > 0) r.disc(sx + Math.cos(se.a) * 8 * u, g - 7 * u + Math.sin(se.a) * 8 * u, 2 * u, BRIGHT);
    // the cart: wheels standing on the rail (its top at g - 2u), the bed, the bomb, its lamp
    const wy = g - 2 * u - 0.018 * N - Math.max(0.5, 0.6 * u), cy = wy - 0.04 * N;
    shadow(r, cartX, g + u, 0.1 * N, u);
    for (const k of [-0.032, 0.032]) { const wx = cartX + k * N; r.ring(wx, wy, 0.018 * N, Math.max(1, 1.2 * u), MID); r.line(wx - Math.cos(w.wheel) * 0.016 * N, wy - Math.sin(w.wheel) * 0.016 * N, wx + Math.cos(w.wheel) * 0.016 * N, wy + Math.sin(w.wheel) * 0.016 * N, LMID); }
    r.rect(cartX - 0.05 * N, cy, 0.1 * N, 0.035 * N, DARK);
    r.rect(cartX - 0.062 * N, cy + 0.005 * N, 0.014 * N, Math.max(1, u), MID);
    r.disc(cartX, cy - 0.03 * N, 0.035 * N, DARK);
    r.disc(cartX - 0.012 * N, cy - 0.042 * N, 0.008 * N, LMID);
    r.rect(cartX - u, cy - 0.075 * N, 2 * u, 2 * u, over ? (Math.floor(t * 10) % 2 ? BRIGHT : HOT) : f.beat.pulse > 0.5 ? HOT : HOT + DIM);
    targets.push({ x: cartX - 0.05 * N, y: cy - 0.07 * N, w: 0.1 * N, h: 0.1 * N });
    // the figures: the attackers go for the cart, the defenders keep ahead of it; the dead wait for the door
    w.figs.forEach((q, i) => {
      q.flash -= dt; q.fire -= dt; q.crouch -= dt;
      if (q.dead > 0) {
        q.dead -= dt;
        if (respawn || q.dead <= 0) { q.dead = 0; q.x = q.team ? 0.97 : 0.03; q.y = 0; q.vx = q.vy = 0; q.air = false; q.flash = 0.3; w.door = 0.6; }
        else {
          if (q.air) { q.vy -= GRAV * dt; q.x = clamp(q.x + q.vx * dt, 0.02, 0.98); q.y += q.vy * dt; if (q.y <= 0) { q.y = 0; q.air = false; } } // a body shot in the air comes down first
          if (q.dead > 4.5) r.rect(q.x * N - H0 * 0.3, g + q.lane * N - q.y * N - 2 * u, H0 * 0.6, 2 * u, DARK);
          return;
        }
      }
      const k = i % 9;
      let tx = q.team ? Math.min(0.95, w.cart + 0.16 + k * 0.03) : quiet && !over ? q.x : w.cart - 0.03 - k * 0.02;
      if (over) tx = w.cart + (q.team ? 0.06 + k * 0.012 : -0.03 - k * 0.01);
      if (q.air) { q.vy -= GRAV * dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.y <= 0 && q.vy < 0) { q.y = 0; q.air = false; q.crouch = 0.15; w.smoke.push({ x: q.x * N, y: g + q.lane * N, vx: 0, vy: -4 * u, life: 0.4 }); } }
      else { const dx = tx - q.x, sp = (0.05 + (q.kind === 'scout' ? 0.04 : 0)) * bps * dt, mv = Math.sign(dx) * Math.min(Math.abs(dx), sp); q.x += mv; q.ph += (Math.abs(mv) * N) / (H0 * 0.12); if (q.fire <= 0) q.dir = Math.abs(dx) > 0.003 ? (dx > 0 ? 1 : -1) : q.team ? -1 : 1; }
      q.x = clamp(q.x, 0.02, 0.98);
    });
    const order = w.figs.filter((q) => !q.dead).sort((a, b) => a.lane - b.lane); // the lower on the screen, the nearer
    for (const q of order) {
      const base = g + q.lane * N, fy = base - q.y * N, col = q.flash > 0 ? BRIGHT : TEAM[q.team], hh = H0 * (q.crouch > 0 ? 0.85 : 1);
      shadow(r, q.x * N, base + u, (H0 * 0.35) / (1 + q.y * 4), u);
      drawClass(r, q.kind, q.x * N, fy, hh, col, q.air ? 0.8 : q.ph, q.dir, u);
      if (q.fire > 0) r.disc(q.x * N + q.dir * H0 * 0.36, fy - H0 * 0.52, 2 * u, BRIGHT);
      targets.push({ x: q.x * N - H0 * 0.25, y: fy - H0, w: H0 * 0.5, h: H0 });
    }
    w.smoke = smoke(W, w.smoke);
    w.sparks = particles(W, w.sparks, HOT);
    w.tracers = tracers(W, w.tracers, LMID);
    if (w.win > 0) r.ring(cartX, cy, (3 - w.win) * 0.5 * N, 3 * u, w.win > 2.7 ? WHITE : BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- controlpoint
// A capture point in a three-quarter view: a round pad whose progress ring fills a step a beat while one team alone
// stands on it, and flips the point when full. Ten figures brawl around it: a swing on a kick (the arm pivots at the
// shoulder), a shot on a snare (a tracer; the one hit flashes, now and then drops, a blank bar goes up on the kill
// feed, and comes back in from the edge). A medic's beam links medic and patient, a curve that follows them both. A
// drop is the charge: the pair shines bright and ploughs through the point; everyone in the way is thrown. The
// ground: a yard, a hangar or a rooftop, by the mood.
const ARENA_W = { yard: [3, 2, 1], hangar: [2, 2, 2], rooftop: [1, 2, 3] };
const controlpoint = {
  init(W) {
    const { w, rnd } = W, kinds = ['medic', 'heavy', 'soldier', 'scout', 'pyro'], figs = [];
    for (let team = 0; team < 2; team++) kinds.forEach((kind, i) => figs.push({ team, kind, x: team ? 0.8 + i * 0.04 : 0.05 + i * 0.04, y: 0.6 + i * 0.07, tx: 0.5, ty: 0.75, ph: rnd() * TAU, dir: team ? -1 : 1, flash: 0, swing: 0, fire: 0, dead: 0, h: 0, vz: 0, kx: 0, ky: 0, retarget: rnd() * 2 }));
    Object.assign(w, { arena: rollW(rnd, ARENA_W, bandOf(W.a)), figs, prog: 0, owner: -1, capper: -1, push: 0, capFlash: 0, feed: [], tracers: [], sparks: [], uber: 0, patient: 1 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bps = bpsOf(f), cx = 0.5 * N, cy = 0.74 * N, R = 0.2 * N, SY = 0.42, H0 = 0.12 * N;
    const onPad = (q) => ((q.x * N - cx) / R) ** 2 + ((q.y * N - cy) / (R * SY)) ** 2 < 1;
    const live = (team) => w.figs.filter((q) => q.team === team && !q.dead);
    const nearest = (q, team) => { let best = null, bd = 9; for (const p of w.figs) if (p.team === team && !p.dead && p !== q) { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd) { bd = d; best = p; } } return best; };
    const kill = (victim, by) => { victim.dead = 1.2; w.feed.unshift({ k: by, v: victim.team, t: 4 }); if (w.feed.length > 5) w.feed.length = 5; };
    const throwBack = (q, fromX, fromY, v) => { const d = Math.hypot(q.x - fromX, q.y - fromY) || 0.01; q.kx = ((q.x - fromX) / d) * v; q.ky = ((q.y - fromY) / d) * v * 0.4; q.vz = v * 0.9; q.flash = 0.25; };
    const invul = (q) => w.uber > 0 && q.team === 0 && (q.kind === 'medic' || q === w.figs[w.patient]);
    const hOf = (q) => H0 * (0.8 + (q.y - 0.52) * 0.8); // a figure's height on screen: lower is nearer, and taller
    const fly = (q) => { q.vz -= GRAV * dt; q.h += q.vz * dt; q.x += q.kx * dt; q.y += q.ky * dt; if (q.h <= 0) { q.h = 0; q.vz = 0; q.kx = q.ky = 0; } };
    for (const h of hits) {
      if (isLow(h)) {
        const close = w.figs.filter((p) => { if (p.dead) return false; const e = nearest(p, 1 - p.team); return e && Math.hypot(e.x - p.x, e.y - p.y) < 0.12; }), q = pick(rnd, close);
        if (q) { const e = nearest(q, 1 - q.team); q.swing = 1; q.dir = e.x > q.x ? 1 : -1; if (!invul(e)) { throwBack(e, q.x, q.y, 0.25 + 0.3 * h.strength); if (rnd() < 0.25) kill(e, q.team); } }
      } else if (h.kind === 'snare') {
        const q = pick(rnd, w.figs.filter((p) => !p.dead)), e = q && nearest(q, 1 - q.team);
        if (e) { q.fire = 0.12; q.dir = e.x > q.x ? 1 : -1; w.tracers.push({ x0: q.x * N + q.dir * hOf(q) * 0.36, y0: q.y * N - q.h * N - hOf(q) * 0.52, x1: e.x * N + (rnd() - 0.5) * 3 * u, y1: e.y * N - e.h * N - hOf(e) * 0.5, t: 1 }); if (!invul(e)) { e.flash = 0.2; if (rnd() < 0.3) kill(e, q.team); } }
      }
    }
    if (f.section === 'drop') { w.uber = 4; w.push = 0; }
    else if (f.section === 'change') { w.arena = rollW(rnd, ARENA_W, bandOf(W.a)); w.push = 1 - w.push; }
    w.uber -= dt; w.capFlash -= dt;
    if (w.figs[w.patient].dead || (f.beat.on && f.beat.count % 8 === 0)) { const mates = w.figs.filter((q, i) => q.team === 0 && !q.dead && i > 0); if (mates.length) w.patient = w.figs.indexOf(pick(rnd, mates)); }
    // the capture: one step a beat while one team alone holds the pad; contested it stands, empty it drains
    const here = [live(0).filter(onPad).length, live(1).filter(onPad).length];
    if (f.beat.on && (here[0] > 0) !== (here[1] > 0)) {
      const team = here[0] ? 0 : 1;
      if (team !== w.owner) { w.prog += 1 / 12 + 0.02 * here[team]; w.capper = team; if (w.prog >= 1) { w.owner = team; w.prog = 0; w.capFlash = 1; w.push = 1 - team; burst(w.sparks, rnd, cx, cy - 0.1 * N, 30, N * 0.5, TEAM[team], 0.8); s.shake = Math.max(s.shake, 0.4); } }
    } else if (!here[0] && !here[1]) w.prog = Math.max(0, w.prog - dt * 0.04);
    // the ground, by the arena, then the pad
    if (w.arena === 'yard') {
      r.rect(0, 0.5 * N, N, N, LMID);
      for (let k = 0; k < 9; k++) r.rect(k * 0.125 * N, 0.4 * N, Math.max(1, u), 0.1 * N, DARK);
      r.rect(0, 0.43 * N, N, Math.max(1, u), DARK); r.rect(0, 0.47 * N, N, Math.max(1, u), DARK);
      for (const [bx, by] of [[0.06, 0.58], [0.88, 0.6], [0.12, 0.92]]) { r.rect(bx * N, by * N - 0.06 * N, 0.08 * N, 0.06 * N, MID); r.frame(Math.round(bx * N), Math.round(by * N - 0.06 * N), Math.round(0.08 * N), Math.round(0.06 * N), DARK); }
    } else if (w.arena === 'hangar') {
      r.rect(0, 0.5 * N, N, N, MID);
      r.rect(0.2 * N, 0.1 * N, 0.6 * N, 0.4 * N, DARK); r.rect(0.22 * N, 0.12 * N, 0.56 * N, 0.38 * N, DARK + DIM); r.rect(0.2 * N, 0.48 * N, 0.6 * N, Math.max(1, u), BRIGHT);
      for (let k = 0; k < 4; k++) r.rect(0, (0.06 + k * 0.1) * N, N, Math.max(1, u), LMID + DIM);
    } else {
      for (let k = 0; k < 7; k++) { const bh = (0.15 + 0.2 * hash(k, 9)) * N; r.rect(k * 0.15 * N, 0.45 * N - bh, 0.12 * N, bh, DARK); for (let y = 0.45 * N - bh + 2 * u; y < 0.43 * N; y += 4 * u) if (hash(k, y) < 0.4) r.rect(k * 0.15 * N + 2 * u, y, 2 * u, 2 * u, f.level > 0.4 ? LMID : MID); }
      r.rect(0, 0.45 * N, N, N, MID); r.rect(0, 0.43 * N, N, 2 * u, LMID);
      for (const vx of [0.1, 0.85]) { r.rect(vx * N, 0.56 * N, 0.06 * N, 0.05 * N, DARK); r.rect(vx * N - u, 0.55 * N, 0.06 * N + 2 * u, 1.5 * u, LMID); }
    }
    const padCol = w.owner < 0 ? LMID + DIM : TEAM[w.owner] + DIM;
    r.ring(cx, cy, R * 0.5, R, padCol, SY);
    r.ring(cx, cy, R, 1.5 * u, w.capFlash > 0 && Math.floor(t * 16) % 2 ? BRIGHT : DARK, SY);
    const steps = Math.ceil(R * TAU), ringCol = f.beat.pulse > 0.6 ? BRIGHT : w.capper < 0 ? LMID : TEAM[w.capper];
    for (let k = 0; k < steps * w.prog; k++) { const a = (k / steps) * TAU - Math.PI / 2; r.rect(cx + Math.cos(a) * R - u, cy + Math.sin(a) * R * SY - u, 2 * u, 2 * u, ringCol); }
    if (here[0] && here[1]) for (let k = 0; k < 4; k++) r.rect(cx - 2 * u + Math.sin(t * 9 + k) * 4 * u, cy - 0.3 * N - k * 3 * u, 2 * u, 2 * u, BRIGHT); // contested: it shivers
    // the figures walk to their spots, the favoured team onto the pad; the charging pair goes straight through
    for (const q of w.figs) {
      q.flash -= dt; q.swing -= dt * 4; q.fire -= dt; q.retarget -= dt;
      if (q.dead > 0) { // a body thrown as it dies comes down first and lies there; it comes back in from the edge on its feet
        q.dead -= dt;
        if (q.dead <= 0) { q.x = q.team ? 0.98 : 0.02; q.y = 0.6 + rnd() * 0.3; q.flash = 0.3; q.h = q.vz = q.kx = q.ky = 0; continue; }
        if (q.h > 0 || q.vz > 0) fly(q);
        q.x = clamp(q.x, 0.02, 0.98); q.y = clamp(q.y, 0.52, 0.97);
        r.rect(q.x * N - hOf(q) * 0.3, q.y * N - q.h * N - 2 * u, hOf(q) * 0.6, 2 * u, DARK);
        continue;
      }
      const charging = invul(q);
      if (q.retarget <= 0) { q.retarget = 1.5 + rnd() * 2; const reach = q.team === w.push ? 0.6 : 1.3 + rnd() * 0.6, a = rnd() * TAU, k = rnd(); q.tx = 0.5 + (Math.cos(a) * R * reach * k) / N; q.ty = 0.74 + (Math.sin(a) * R * SY * reach * k) / N; }
      if (charging) { q.tx = w.uber > 2 ? 0.95 : 0.1; q.ty = 0.74; for (const e of w.figs) if (e.team === 1 && !e.dead && Math.hypot(e.x - q.x, e.y - q.y) < 0.06 && e.vz <= 0 && e.h <= 0) { throwBack(e, q.x, q.y, 0.5); if (rnd() < 0.3) kill(e, 0); } }
      if (q.h > 0 || q.vz > 0) fly(q);
      else { const dx = q.tx - q.x, dy = q.ty - q.y, d = Math.hypot(dx, dy), sp = 0.07 * bps * dt * (charging ? 1.6 : q.kind === 'scout' ? 1.5 : q.kind === 'heavy' ? 0.7 : 1); if (d > 0.004) { const mv = Math.min(d, sp); q.x += (dx / d) * mv; q.y += (dy / d) * mv; q.ph += (mv * N) / (hOf(q) * 0.12); if (q.fire <= 0 && q.swing <= 0) q.dir = dx > 0 ? 1 : -1; } }
      q.x = clamp(q.x, 0.02, 0.98); q.y = clamp(q.y, 0.52, 0.97);
    }
    const med = w.figs[0], pat = w.figs[w.patient];
    if (!med.dead && !pat.dead && pat !== med) { // the beam: a curve from the nozzle to the patient, sagging up, a pulse running along it
      const x0 = med.x * N + med.dir * hOf(med) * 0.3, y0 = med.y * N - med.h * N - hOf(med) * 0.5, x1 = pat.x * N, y1 = pat.y * N - pat.h * N - hOf(pat) * 0.55, mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 0.08 * N;
      let px = x0, py = y0;
      for (let k = 1; k <= 14; k++) { const q = k / 14, bx = lerp(lerp(x0, mx, q), lerp(mx, x1, q), q), by = lerp(lerp(y0, my, q), lerp(my, y1, q), q) + Math.sin(q * 12 - t * 10) * u; r.line(px, py, bx, by, (k + Math.floor(t * 12)) % 3 ? COOL : BRIGHT); px = bx; py = by; }
      if (rnd() < dt * 8) w.sparks.push({ x: x1 + (rnd() - 0.5) * 4 * u, y: y1, vx: 0, vy: -0.3 * N, life: 0.4, c: COOL });
    }
    const order = w.figs.filter((q) => !q.dead).sort((a, b) => a.y - b.y);
    for (const q of order) {
      const hh = hOf(q), fx = q.x * N, base = q.y * N, fy = base - q.h * N, charging = invul(q);
      const col = charging ? (Math.floor(t * 20) % 2 ? WHITE : BRIGHT) : q.flash > 0 ? BRIGHT : TEAM[q.team];
      shadow(r, fx, base, (hh * 0.4) / (1 + q.h * 5), u);
      const J = drawClass(r, q.kind, fx, fy, hh, col, q.h > 0 ? 0.8 : q.ph, q.dir, u);
      if (q.swing > 0) { const sw = lerp(-2.2, 0.6, ease(1 - q.swing)), ang = q.dir > 0 ? sw : Math.PI - sw; r.stroke(J.sx, J.sy + hh * 0.1, J.sx + Math.cos(ang) * hh * 0.35, J.sy + hh * 0.1 + Math.sin(ang) * hh * 0.35, 2 * u, LMID); }
      if (q.fire > 0) r.disc(fx + q.dir * hh * 0.36, fy - hh * 0.52, 2 * u, BRIGHT);
      if (charging) r.ring(fx, fy - hh * 0.5, hh * 0.6, Math.max(1, u), COOL, 1.2);
      targets.push({ x: fx - hh * 0.25, y: fy - hh, w: hh * 0.5, h: hh });
    }
    w.sparks = particles(W, w.sparks, BRIGHT);
    w.tracers = tracers(W, w.tracers, LMID);
    // the kill feed: blank bars, who by and who, top right, fading
    w.feed = w.feed.filter((e) => (e.t -= dt) > 0);
    w.feed.forEach((e, i) => { const y = 0.05 * N + i * 4 * u, dim = e.t < 1 ? DIM : 0; r.rect(0.7 * N, y, 0.11 * N, 2.5 * u, TEAM[e.k] + dim); r.rect(0.825 * N, y + u * 0.5, 1.5 * u, 1.5 * u, DARK); r.rect(0.86 * N, y, 0.11 * N, 2.5 * u, TEAM[e.v] + dim); });
  },
};

// ---------------------------------------------------------------------------------------------- testchamber
// A sterile chamber of panels with two ovals, one hot and one cool, on the floor, the ceiling or a wall. A weighted
// cube falls into the floor oval and drops out of the ceiling one, round and round: gravity on the way down, the
// speed kept through the ovals and sent out along the exit's normal (the air caps it, so the loop settles). A kick
// flings the cube at a wall oval and it comes out of the other one at the same speed, on a parabola to the floor,
// where it bounces and settles. A tripod turret scans with a thin laser that sparks where it lands on a snare.
// Sections add a floor button with its door, or a light bridge the cube can land on; a drop reconfigures the chamber:
// the panels swing out on their arms and the ovals move. The era: clean, overgrown or under construction.
const ERA_W = { clean: [3, 2, 1], overgrown: [2, 2, 2], construction: [1, 2, 3] };
const CONFIGS = [['floor', 'ceil', 0.5, 0.5], ['floor', 'right', 0.4, 0.55], ['left', 'ceil', 0.5, 0.3], ['left', 'right', 0.5, 0.6], ['floor', 'left', 0.6, 0.45]];
const testchamber = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { era: rollW(rnd, ERA_W, bandOf(W.a)), cfg: 0, cube: { x: 0.5 * N, y: 0.3 * N, vx: 0, vy: 0, rest: false }, laser: 0, reconf: 0, moved: false, extra: 'none', sparks: [], door: 0, trail: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, x0 = 0.06 * N, x1 = 0.94 * N, yc = 0.1 * N, yf = 0.86 * N, S = 0.05 * N, RX = 0.07 * N, cb = w.cube;
    const cfg = CONFIGS[w.cfg];
    // where an oval sits and which way it faces into the room
    const ovalAt = (side, p) => (side === 'floor' ? { x: lerp(x0, x1, p), y: yf, nx: 0, ny: -1 } : side === 'ceil' ? { x: lerp(x0, x1, p), y: yc, nx: 0, ny: 1 } : side === 'left' ? { x: x0, y: lerp(yc, yf, p), nx: 1, ny: 0 } : { x: x1, y: lerp(yc, yf, p), nx: -1, ny: 0 });
    const ovals = [{ ...ovalAt(cfg[0], cfg[2]), c: HOT, side: cfg[0] }, { ...ovalAt(cfg[1], cfg[3]), c: COOL, side: cfg[1] }];
    const through = (side, px, py) => { // the oval on `side` that (px, py) is inside of, if any
      for (const o of ovals) if (o.side === side && (o.nx ? Math.abs(py - o.y) < RX : Math.abs(px - o.x) < RX)) return o;
      return null;
    };
    const teleport = (o) => { // the speed is kept, the direction is the exit's normal; the cube appears just inside it
      const e = ovals[o === ovals[0] ? 1 : 0], sp = Math.hypot(cb.vx, cb.vy);
      cb.x = e.x + e.nx * (S / 2 + 1); cb.y = e.y + e.ny * (S / 2 + 1); cb.vx = e.nx * sp; cb.vy = e.ny * sp; cb.rest = false;
      for (let k = 0; k < 4; k++) w.sparks.push({ x: e.x + (rnd() - 0.5) * RX, y: e.y, vx: e.nx * sp * 0.3 + (rnd() - 0.5) * 6 * u, vy: e.ny * sp * 0.3 - 4 * u, life: 0.3, c: e.c });
    };
    for (const h of hits) {
      if (isLow(h)) { // the fling: at the nearest wall oval, straight up when there is none
        const wall = ovals.filter((o) => o.nx).sort((a, b) => Math.hypot(a.x - cb.x, a.y - cb.y) - Math.hypot(b.x - cb.x, b.y - cb.y))[0], sp = (0.8 + 0.5 * h.strength) * N;
        if (wall) { const dx = wall.x - cb.x, dy = wall.y - cb.y, d = Math.hypot(dx, dy) || 1; cb.vx = (dx / d) * sp; cb.vy = (dy / d) * sp - 0.1 * N; }
        else { cb.vy = -sp * 0.9; cb.vx = (rnd() - 0.5) * 0.2 * N; }
        cb.rest = false; s.shake = Math.max(s.shake, 0.15);
      } else if (h.kind === 'snare') w.laser = 0.3;
    }
    if (f.section === 'drop' && w.reconf <= 0) { w.reconf = 1.4; w.moved = false; }
    else if (f.section === 'change') { w.era = rollW(rnd, ERA_W, bandOf(W.a)); w.extra = pick(rnd, ['none', 'button', 'bridge', 'door']); }
    if (w.reconf > 0) { w.reconf -= dt; if (w.reconf < 0.7 && !w.moved) { w.moved = true; w.cfg = (w.cfg + 1 + Math.floor(rnd() * (CONFIGS.length - 1))) % CONFIGS.length; s.shake = Math.max(s.shake, 0.3); } }
    w.laser -= dt;
    // the cube: gravity, a cap from the air, the sides of the room, the ovals, the bridge
    const bridgeY = 0.52 * N, onBridge = w.extra === 'bridge' && cb.x > x0 && cb.x < 0.7 * N;
    if (!cb.rest) {
      const py = cb.y;
      cb.vy += GRAV * N * dt;
      const sp = Math.hypot(cb.vx, cb.vy), cap = 1.3 * N;
      if (sp > cap) { cb.vx *= cap / sp; cb.vy *= cap / sp; }
      cb.x += cb.vx * dt; cb.y += cb.vy * dt;
      if (cb.vy > 0 && cb.y + S / 2 >= yf) { const o = through('floor', cb.x, cb.y); if (o) teleport(o); else { cb.y = yf - S / 2; if (cb.vy < 0.25 * N) { cb.vy = 0; cb.vx = 0; cb.rest = true; } else { cb.vy *= -0.35; cb.vx *= 0.7; w.sparks.push({ x: cb.x, y: yf, vx: 0, vy: -3 * u, life: 0.3, c: LMID }); } } }
      else if (cb.vy < 0 && cb.y - S / 2 <= yc) { const o = through('ceil', cb.x, cb.y); if (o) teleport(o); else { cb.y = yc + S / 2; cb.vy *= -0.35; } }
      if (cb.vx < 0 && cb.x - S / 2 <= x0) { const o = through('left', cb.x, cb.y); if (o) teleport(o); else { cb.x = x0 + S / 2; cb.vx *= -0.4; } }
      else if (cb.vx > 0 && cb.x + S / 2 >= x1) { const o = through('right', cb.x, cb.y); if (o) teleport(o); else { cb.x = x1 - S / 2; cb.vx *= -0.4; } }
      if (onBridge && cb.vy > 0 && py + S / 2 <= bridgeY && cb.y + S / 2 >= bridgeY) { cb.y = bridgeY - S / 2; if (cb.vy < 0.25 * N) { cb.vy = 0; cb.vx = 0; cb.rest = true; } else cb.vy *= -0.35; }
    } else if ((w.extra !== 'bridge' && cb.y < yf - S) || (cb.y + S / 2 >= yf - 1 && through('floor', cb.x, cb.y))) cb.rest = false; // the bridge went away under it, or an oval opened under it
    w.trail.push({ x: cb.x, y: cb.y, t: 0.5 }); if (w.trail.length > 24) w.trail.shift();
    // the room: the dark outside, the panelled walls, the ceiling strip; the panels swing out while it reconfigures
    r.fill(DARK + DIM);
    const wallCol = w.era === 'clean' ? LMID : MID, P = 0.08 * N, swing = w.reconf > 0 ? Math.sin(Math.PI * clamp(w.reconf / 1.4)) : 0;
    r.rect(x0, yc, x1 - x0, yf - yc, wallCol);
    for (let gy = yc; gy < yf; gy += P) for (let gx = x0; gx < x1; gx += P) {
      const i = Math.round(gx / P), j = Math.round(gy / P), hole = w.era !== 'clean' && hash(i, j) < (w.era === 'overgrown' ? 0.12 : 0.25);
      const off = swing && hash(i + 7, j) < 0.3 ? swing * 5 * u * (hash(i, j + 3) < 0.5 ? 1 : -1) : 0;
      if (hole) r.rect(gx, gy, Math.min(P, x1 - gx), Math.min(P, yf - gy), w.era === 'overgrown' ? DARK : DARK + DIM);
      if (off) { r.rect(gx + off, gy, Math.min(P, x1 - gx), Math.min(P, yf - gy), BRIGHT); r.rect(off > 0 ? gx : gx + P + off, gy + P / 2, Math.abs(off), Math.max(1, u), DARK); }
      r.rect(gx, gy, Math.min(P, x1 - gx), Math.max(1, u), DARK); r.rect(gx, gy, Math.max(1, u), Math.min(P, yf - gy), DARK);
    }
    r.frame(Math.round(x0), Math.round(yc), Math.round(x1 - x0), Math.round(yf - yc), DARK);
    r.rect(x0 + 0.1 * N, yc + u, x1 - x0 - 0.2 * N, 1.5 * u, f.level > 0.3 ? BRIGHT : LMID);
    if (w.era === 'overgrown') for (let k = 0; k < 7; k++) { const vx = x0 + (0.08 + k * 0.14) * N, len = (0.1 + 0.2 * hash(k, 11)) * N; let px = vx, py = yc; for (let q = 1; q <= 5; q++) { const nx = vx + Math.sin(t * 0.8 + k + q) * u * q * 0.6, ny = yc + (len * q) / 5; r.line(px, py, nx, ny, COOL + DIM); if (q % 2) r.rect(nx - 1.5 * u, ny, 3 * u, Math.max(1, u), COOL); px = nx; py = ny; } }
    if (w.era === 'construction') { for (let x = x0, k = 0; x < x1; x += 4 * u, k++) r.rect(x, yf - 2 * u, 2 * u, 2 * u, k % 2 ? HOT : DARK); for (let k = 0; k < 3; k++) r.rect(x0 + (0.15 + k * 0.3) * N, yc, Math.max(1, u), yf - yc, DARK + DIM); }
    if (w.extra === 'bridge') { r.rect(x0, bridgeY - u, 0.64 * N, 2 * u, f.beat.pulse > 0.5 ? BRIGHT : COOL); r.rect(x0, bridgeY - 3 * u, 3 * u, 6 * u, DARK); }
    if (w.extra === 'button' || w.extra === 'door') { // the big button on the floor, the door in the right wall that it opens
      const bx = 0.26 * N, pressed = w.extra === 'button' ? (cb.rest && Math.abs(cb.x - bx) < 0.06 * N ? 1 : 0) : f.beat.pulse > 0.5 ? 1 : 0;
      w.door = follow(w.door, pressed, dt, 0.15);
      if (w.extra === 'button') { r.ring(bx, yf, 0.04 * N, 0.03 * N, DARK, 0.3); r.ring(bx, yf - 2 * u + 1.5 * u * w.door, 0.03 * N, 2 * u, pressed ? BRIGHT : HOT, 0.3); }
      const dh = 0.16 * N, dy0 = yf - dh, half = Math.max(0, dh / 2 - w.door * dh * 0.5);
      r.rect(x1 - 3 * u, dy0, 3 * u, dh, DARK); r.rect(x1 - 2 * u, dy0, 2 * u, half, LMID); r.rect(x1 - 2 * u, yf - half, 2 * u, half, LMID);
    }
    // the ovals, with a pulse on the beat; the trail, the shadow, the cube
    for (const o of ovals) { const th = f.beat.pulse > 0.6 ? 3 * u : 2 * u; if (o.nx) { r.ring(o.x, o.y, RX * 0.15, RX * 0.3, BLACK, 1 / 0.3); r.ring(o.x, o.y, RX * 0.3, th, o.c, 1 / 0.3); } else { r.ring(o.x, o.y, RX * 0.5, RX, BLACK, 0.3); r.ring(o.x, o.y, RX, th, o.c, 0.3); } }
    w.trail = w.trail.filter((p) => (p.t -= dt) > 0);
    if (!cb.rest) for (const p of w.trail) r.set(p.x, p.y, LMID + DIM);
    if (!through('floor', cb.x, cb.y)) shadow(r, cb.x, yf, (S * 1.1) / (1 + (yf - cb.y) / (0.2 * N)), u);
    r.rect(cb.x - S / 2, cb.y - S / 2, S, S, MID);
    r.frame(Math.round(cb.x - S / 2), Math.round(cb.y - S / 2), Math.round(S), Math.round(S), DARK);
    r.rect(cb.x - S * 0.15, cb.y - S * 0.15, S * 0.3, S * 0.3, BRIGHT); r.rect(cb.x - u * 0.5, cb.y - u * 0.5, Math.max(1, u), Math.max(1, u), HOT);
    targets.push({ x: cb.x - S / 2, y: cb.y - S / 2, w: S, h: S });
    // the turret: a tall oval on three legs, the laser scanning and stopping on the cube when it crosses it
    const tx = 0.78 * N, ey = yf - 0.11 * N, ang = Math.PI + Math.sin(f.rel.trebClock * 0.6 + t * 0.3) * 0.5 - 0.15;
    for (const k of [-4, 0, 4]) r.line(tx, yf - 5 * u, tx + k * u + (k ? 0 : 3 * u), yf, DARK);
    r.ring(tx, yf - 0.1 * N, 2.5 * u, 5 * u, LMID, 2.2); r.ring(tx, yf - 0.1 * N, 2.5 * u, Math.max(1, u), DARK, 2.2);
    if (w.laser > 0.15) for (const k of [-1, 1]) r.rect(tx + k * 5 * u - (k < 0 ? 2 * u : 0), yf - 0.13 * N, 2 * u, 0.06 * N, LMID);
    r.rect(tx - u, ey - u, 2 * u, 2 * u, HOT);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let d = Math.min(dx < 0 ? (x0 - tx) / dx : dx > 0 ? (x1 - tx) / dx : 1e9, dy < 0 ? (yc - ey) / dy : dy > 0 ? (yf - ey) / dy : 1e9);
    const along = (cb.x - tx) * dx + (cb.y - ey) * dy, off = Math.abs((cb.x - tx) * -dy + (cb.y - ey) * dx);
    if (along > 0 && along < d && off < S * 0.6) d = along - S / 2;
    r.line(tx, ey, tx + dx * d, ey + dy * d, w.laser > 0 ? BRIGHT : HOT);
    if (w.laser > 0 && rnd() < dt * 18) burst(w.sparks, rnd, tx + dx * d, ey + dy * d, 2, N * 0.25, BRIGHT, 0.3);
    w.sparks = particles(W, w.sparks, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- citadel
// A walled old city under a dark tower: narrow houses, loudspeaker poles that light up with the announcements, and
// three-legged walkers striding down the street in a true tripod gait: one foot in the air at a time, each planted
// foot standing still on the ground while the level body goes on over it; they stride with the bass and stop when it
// goes. Crab-like critters hop at a figure with a crowbar that swings from the shoulder on a kick; the other hand
// holds a gravity tool that lifts a barrel with the bass (it hovers with a wobble, drops when the bass goes) and flings
// it on a snare, on a ballistic arc that bounces. A drop is a walker's beam sweeping the street. The district: a
// square, a canal, a rail viaduct.
const DISTRICT_W = { square: [3, 2, 1], canal: [2, 2, 2], viaduct: [1, 2, 3] };
const newTripod = (x, sc, dir, N) => ({ x, sc, dir, feet: [-0.09, 0.09, 0].map((o) => ({ o, x: (x + o * 1.3 * sc) * N, start: 0, target: 0 })), step: 2, gait: 0, stepping: false });
const citadel = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { district: rollW(rnd, DISTRICT_W, band), walkers: [newTripod(0.85, 1, -1, N), newTripod(0.3, 0.55, -1, N)], crabs: [], barrels: [0.5, 0.58, 0.66, 0.74].map((x) => ({ x, y: 0, hy: 0, vx: 0, vy: 0, held: false, rest: true })), held: -1, swing: 0, sparks: [], beam: 0, pickT: 0, speakT: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.84 * N, bps = bpsOf(f), band = bandOf(W.a), fx = 0.2 * N, FH = 0.17 * N;
    const maxCrabs = 3 + band * 2;
    const knock = (c, dir, v) => { c.vx = dir * v; c.vy = 0.35 + v * 0.3; c.hit = true; c.flash = 0.2; };
    for (const h of hits) {
      if (isLow(h)) { w.swing = 1; for (const c of w.crabs) if (c.x > 0.2 && c.x < 0.34 && c.y < 0.08) knock(c, 1, 0.5 + 0.4 * h.strength); }
      else if (h.kind === 'snare') { const b = w.barrels[w.held]; if (b && b.held) { b.held = false; b.rest = false; b.vx = 1 + 0.5 * h.strength; b.vy = 0.25; b.bounces = 0; w.pickT = 0.4; w.held = -1; } }
    }
    if (f.section === 'drop') w.beam = 2.2;
    else if (f.section === 'change') w.district = rollW(rnd, DISTRICT_W, band);
    w.swing -= dt * 4; w.beam -= dt; w.pickT -= dt; w.speakT = f.rel.midAtt > 0.35 ? 0.3 : w.speakT - dt;
    if (w.held < 0 && w.pickT <= 0) { let best = -1, bd = 9; w.barrels.forEach((b, i) => { if (b.rest && Math.abs(b.x - 0.4) < bd) { bd = Math.abs(b.x - 0.4); best = i; } }); if (best >= 0) { w.held = best; Object.assign(w.barrels[best], { held: true, rest: false, hy: w.barrels[best].y }); } }
    // the sky, the tower, the houses, the district's own things
    const tx = 0.64 * N;
    r.poly([[tx - 0.06 * N, 0.5 * N], [tx - 0.025 * N, 0], [tx + 0.025 * N, 0], [tx + 0.06 * N, 0.5 * N]], DARK + DIM);
    r.rect(tx - 0.035 * N, 0.08 * N, 0.07 * N, Math.max(1, u), DARK); r.rect(tx - 0.01 * N, 0.01 * N, 0.02 * N, 2 * u, f.beat.pulse > 0.5 ? COOL : COOL + DIM);
    for (let k = 0; k < 10; k++) { const hx = k * 0.105 * N, hh = (0.22 + 0.12 * hash(k, 21)) * N, hw = 0.1 * N; r.rect(hx, g - hh, hw, hh, DARK); r.poly([[hx - u, g - hh], [hx + hw / 2, g - hh - 0.06 * N], [hx + hw + u, g - hh]], DARK + DIM); for (let wy = g - hh + 3 * u; wy < g - 0.04 * N; wy += 5 * u) for (const wx of [0.3, 0.65]) if (hash(k, wy + wx) < 0.35) r.rect(hx + wx * hw, wy, 2 * u, 3 * u, LMID); r.rect(hx + hw * 0.4, g - 0.05 * N, hw * 0.2, 0.05 * N, DARK + DIM); }
    if (w.district === 'viaduct') { r.rect(0, 0.5 * N, N, 0.03 * N, DARK); for (let k = 0; k < 6; k++) r.ring(k * 0.2 * N, 0.62 * N, 0.07 * N, 2 * u, DARK, 1.2); }
    ground(r, N, g, u, LMID, MID);
    for (let x = 0; x < N; x += 3 * u) r.rect(x + ((x / (3 * u)) % 2 ? 1.5 * u : 0), g + 3 * u, Math.max(1, u), Math.max(1, u), DARK + DIM); // the cobbles
    if (w.district === 'square') { r.ring(0.42 * N, g - 0.03 * N, 0.05 * N, 2 * u, DARK, 0.35); for (let k = 0; k < 3; k++) r.rect(0.42 * N - u + (rnd() - 0.5) * 3 * u, g - 0.1 * N + rnd() * 0.07 * N, Math.max(1, u), 2 * u, COOL); }
    if (w.district === 'canal') { r.rect(0, g + 0.07 * N, N, N, COOL + DIM); for (let k = 0; k < 10; k++) { const hx = k * 0.105 * N, hh = (0.22 + 0.12 * hash(k, 21)) * N * 0.5; for (let y = 0; y < hh; y += 2 * u) if (hash(k, y + Math.floor(t * 3)) < 0.5) r.rect(hx + Math.sin(t * 2 + y / u) * u, g + 0.07 * N + y, 0.1 * N, Math.max(1, u), DARK + DIM); } }
    for (const px of [0.1, 0.46]) { const sx = px * N; r.rect(sx - u, 0.38 * N, 2 * u, g - 0.38 * N, DARK); r.poly([[sx, 0.38 * N], [sx + 0.05 * N, 0.36 * N], [sx + 0.05 * N, 0.41 * N], [sx, 0.4 * N]], w.speakT > 0 ? LMID : DARK); r.rect(sx - u, 0.36 * N, 2 * u, 2 * u, w.speakT > 0 ? HOT : HOT + DIM); } // the speakers
    // the walkers: the body moves, the planted feet stay where they are, one foot swings at a time
    for (const tw of [...w.walkers].sort((p, q) => p.sc - q.sc)) { // the far (smaller) one first
      const sc = tw.sc, gy = g - (1 - sc) * 0.12 * N, St = 0.14 * N * sc, v = 0.045 * N * sc * bps * (0.3 + f.rel.bassDrive) * (f.level < 0.15 ? 0 : 1), dx = tw.dir * v * dt;
      tw.x += dx / N; tw.gait += Math.abs(dx);
      const bx = tw.x * N, by = gy - 0.3 * N * sc, stepLen = St / 3;
      if (!v && tw.stepping) tw.gait = Math.min(stepLen * 0.999, tw.gait + stepLen * 3 * dt); // stopping: the foot in the air comes down first
      if (tw.gait >= stepLen) { // the next foot lifts, to land a half stride ahead of its rest under the body
        tw.gait -= stepLen; tw.step = (tw.step + 1) % 3; tw.stepping = true;
        const ft = tw.feet[tw.step]; ft.start = ft.x; ft.target = bx + ft.o * 1.3 * N * sc + tw.dir * St * 0.5;
      }
      const q = clamp(tw.gait / stepLen), sw = tw.feet[tw.step];
      if (tw.stepping) sw.x = lerp(sw.start, sw.target, ease(q));
      r.ring(bx, by, 0.05 * N * sc, 0.06 * N * sc, FIG, 0.55);
      r.rect(bx + tw.dir * 0.05 * N * sc - u, by - u, 2 * u, 2 * u, w.beam > 0 && tw.sc === 1 ? BRIGHT : HOT);
      tw.feet.forEach((ft, i) => {
        const lift = i === tw.step && tw.stepping ? Math.sin(Math.PI * q) * 0.06 * N * sc : 0, hx = bx + ft.o * 0.5 * N * sc, fy = gy - lift, kx = (hx + ft.x) / 2 + ft.o * 0.3 * N * sc, ky = by + (fy - by) * 0.45 - 0.05 * N * sc;
        shadow(r, ft.x, gy + u, 6 * u * sc, u);
        r.stroke(hx, by, kx, ky, Math.max(1, 2 * u * sc), FIG); r.stroke(kx, ky, ft.x, fy, Math.max(1, 1.6 * u * sc), FIG);
      });
      targets.push({ x: bx - 0.08 * N * sc, y: by - 0.06 * N * sc, w: 0.16 * N * sc, h: 0.12 * N * sc });
      if (tw.x < -0.25) Object.assign(tw, newTripod(1.25, sc, -1, N));
    }
    if (w.beam > 0) { // the near walker's beam, swept along the street
      const tw = w.walkers[0], bx = tw.x * N + tw.dir * 0.05 * N, by = g - 0.3 * N, gx = lerp(0.98, 0.02, ease((2.2 - w.beam) / 2.2)) * N;
      r.stroke(bx, by, gx, g, 5 * u, COOL); r.stroke(bx, by, gx, g, 2 * u, BRIGHT);
      burst(w.sparks, rnd, gx, g, Math.floor(90 * dt + rnd()), N * 0.4, BRIGHT, 0.4); s.shake = Math.max(s.shake, 0.3);
      for (const c of w.crabs) if (Math.abs(c.x * N - gx) < 0.04 * N) knock(c, c.x * N > gx ? 1 : -1, 0.8);
      for (const b of w.barrels) if (Math.abs(b.x * N - gx) < 0.04 * N && b.rest) { b.rest = false; b.vx = (b.x * N > gx ? 1 : -1) * 0.6; b.vy = 0.6; b.bounces = 0; }
    }
    // the crabs: hop toward the figure on the beats, fly when hit, burst on landing
    if (w.crabs.length < maxCrabs && f.beat.on && f.beat.count % 2 === 0) w.crabs.push({ x: 1.05, y: 0, vx: 0, vy: 0, hit: false, flash: 0, ph: rnd() * TAU });
    w.crabs = w.crabs.filter((c) => {
      c.flash -= dt;
      if (c.y > 0 || c.vy > 0) { c.vy -= GRAV * dt; c.x += c.vx * dt; c.y += c.vy * dt; if (c.y <= 0) { c.y = 0; c.vy = 0; c.vx = 0; if (c.hit) { burst(w.sparks, rnd, c.x * N, g, 8, N * 0.3, MID, 0.4); return false; } } }
      else if (f.beat.on && (c.x > 0.3 || f.beat.count % 2)) { const far = c.x - 0.24; c.vy = 0.45 + rnd() * 0.15; c.vx = -Math.min(0.4, far * 1.5) * (0.6 + f.rel.midDrive); }
      const cx = c.x * N, cy = g - c.y * N - 2 * u;
      shadow(r, cx, g + u, (7 * u) / (1 + c.y * 6), u);
      r.ring(cx, cy, 2 * u, 3 * u, c.flash > 0 ? BRIGHT : MID, 0.6);
      for (const k of [-3, -1.5, 1.5, 3]) r.line(cx + k * u, cy + u, cx + k * 1.6 * u, cy + (c.y > 0 ? 1 : 3) * u, DARK);
      r.rect(cx - 2 * u, cy - u, Math.max(1, u), Math.max(1, u), HOT); r.rect(cx + u, cy - u, Math.max(1, u), Math.max(1, u), HOT);
      return c.x > -0.05 && c.x < 1.1;
    });
    // the figure, the crowbar, the tool and its beam to the held barrel
    const J = walker(r, fx, g, FH, FIG, 0, 1, { cap: true, hatCol: DARK }), sx = J.sx, sy = J.sy + FH * 0.1;
    const ang = w.swing > 0 ? lerp(-2.4, 0.7, ease(1 - w.swing)) : 0.9, ex = sx + Math.cos(ang) * 0.11 * N, ey = sy + Math.sin(ang) * 0.11 * N;
    r.stroke(sx, sy, ex, ey, 2 * u, LMID); r.stroke(ex, ey, ex + Math.cos(ang + 1.9) * 2.5 * u, ey + Math.sin(ang + 1.9) * 2.5 * u, 2 * u, LMID);
    r.rect(sx - u, sy + FH * 0.22, 7 * u, 3 * u, DARK); r.rect(sx + 5 * u, sy + FH * 0.22 + u, 2 * u, Math.max(1, u), COOL); // the tool
    targets.push({ x: fx - FH * 0.25, y: g - FH, w: FH * 0.5, h: FH });
    const hb = w.barrels[w.held], hold = clamp((f.rel.bassDrive - 0.1) * 1.6);
    for (const b of w.barrels) {
      if (b.held) { // lifted with the bass, a wobble on top of the hold (kept out of it, so it does not pile up with the frame rate); it sinks when the bass goes
        const want = 0.05 + 0.18 * hold;
        b.hy = follow(b.hy, want, dt, 0.3); b.y = b.hy + (hold > 0.1 ? Math.sin(t * 5) * 0.02 : 0); b.x = follow(b.x, 0.33 + Math.sin(t * 3.3) * 0.004, dt, 0.4);
        const mx = sx + 7 * u, my = sy + FH * 0.22 + 1.5 * u;
        for (let k = 1; k < 6; k++) r.rect(lerp(mx, b.x * N, k / 6) - u * 0.5, lerp(my, g - b.y * N - 3.5 * u, k / 6), Math.max(1, u), Math.max(1, u), (k + Math.floor(t * 10)) % 2 ? COOL : BRIGHT);
      } else if (!b.rest) { // flung: a parabola, a bounce that loses most of it, friction, and it comes to rest
        b.vy -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.y <= 0) { b.y = 0; b.vy = Math.abs(b.vy) * 0.45; b.vx *= 0.7; b.bounces++; burst(w.sparks, rnd, b.x * N, g, 4, N * 0.2, LMID, 0.3); if (b.vy < 0.08) { b.vy = 0; b.vx = 0; b.rest = true; } }
        if (b.x > 0.96) { b.x = 0.96; b.vx = -Math.abs(b.vx) * 0.5; }
        for (const c of w.crabs) if (!c.hit && Math.abs(c.x - b.x) < 0.035 && Math.abs(c.y - b.y) < 0.06) knock(c, Math.sign(b.vx) || 1, 0.6);
      }
      const bx = b.x * N, by = g - b.y * N;
      shadow(r, bx, g + u, (7 * u) / (1 + b.y * 4), u);
      r.rect(bx - 2.5 * u, by - 7 * u, 5 * u, 7 * u, MID); r.rect(bx - 2.5 * u, by - 5 * u, 5 * u, Math.max(1, u), DARK); r.rect(bx - 2.5 * u, by - 2.5 * u, 5 * u, Math.max(1, u), DARK);
      if (b.held) r.frame(Math.round(bx - 3.5 * u), Math.round(by - 8 * u), Math.round(7 * u), Math.round(9 * u), COOL);
    }
    w.sparks = particles(W, w.sparks, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- researchlab
// A research facility. It opens on the tram: the car hangs from its rail and rides through the atrium, catwalks,
// columns and pillars going by in three parallax layers at the music's pace, a jolt on the kicks and sparks off the
// rail on the snares. Then the doors close and open on a corridor: hazard stripes, scientists in coats and guards
// walking their rounds, the anomalous crystal on its test stand pulsing with the bass. A drop is the cascade: green
// lightning across the picture, the shake, tears opening in the air and critters pouring out; then it calms and the
// lights go emergency red for a while. The wing: the labs, the silo, the offices.
const WING_W = { labs: [3, 2, 1], silo: [1, 2, 3], office: [2, 2, 1] };
const researchlab = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { wing: rollW(rnd, WING_W, bandOf(W.a)), phase: 'tram', scroll: 0, stroll: 0, sway: 0, swayV: 0, wipe: 0, staff: Array.from({ length: 6 }, (_, i) => ({ x: 0.1 + i * 0.15, dir: i % 2 ? 1 : -1, guard: i % 3 === 2, ph: rnd() * TAU })), cascade: 0, alarm: 0, rifts: [], critters: [], sparks: [], riftT: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bps = bpsOf(f), g = 0.82 * N;
    for (const h of hits) {
      if (isLow(h)) w.swayV += (rnd() < 0.5 ? -1 : 1) * 12 * u * h.strength;
      else if (h.kind === 'snare' && w.phase === 'tram') burst(w.sparks, rnd, 0.5 * N, 0.08 * N + u, 6, N * 0.3, BRIGHT, 0.3); // off the rail, under the trolley
    }
    if (f.section === 'drop') { w.queued = true; if (w.phase === 'tram') { w.phase = 'wipe'; w.wipe = 1; } } // the cascade waits for the corridor
    else if (f.section === 'change') { if (w.phase === 'tram' && t > 6) { w.phase = 'wipe'; w.wipe = 1; } else if (w.phase === 'corridor') w.wing = rollW(rnd, WING_W, bandOf(W.a)); }
    if (w.phase === 'tram' && t > 14) { w.phase = 'wipe'; w.wipe = 1; }
    w.swayV -= w.sway * 12 * dt; w.swayV *= Math.exp(-dt * 2); w.sway += w.swayV * dt; // the car on its hanger, a pendulum
    if (w.phase === 'tram' || w.wipe > 0.5) { // the atrium going by in three layers, the nearest fastest
      w.scroll += dt * N * 0.1 * bps * (0.3 + f.level); w.stroll += dt * 0.03 * N; // the layers go by; the scientists on the catwalks walk on them too
      const wrap = (k, sp, gap, o = 0) => ((((k * gap - w.scroll * sp - o) % (N + gap)) + N + gap) % (N + gap)) - gap;
      r.rect(0, 0.9 * N, N, N, DARK); r.rect(0, 0.9 * N, N, 1.5 * u, f.beat.pulse > 0.5 ? COOL : COOL + DIM);
      for (let k = 0; k < 4; k++) { const x = wrap(k, 0.2, 0.32 * N); r.rect(x, 0, 0.1 * N, 0.9 * N, DARK + DIM); r.ring(x + 0.05 * N, 0.5 * N + (k % 2) * 0.15 * N, 0.07 * N, 2 * u, DARK, 1); }
      for (const [y, sp, gap] of [[0.42, 0.5, 0.5 * N], [0.68, 0.55, 0.44 * N]]) { const yy = y * N; r.rect(0, yy, N, 2 * u, MID); for (let k = 0; k < 4; k++) { const x = wrap(k, sp, gap); for (let p = 0; p < 6; p++) r.rect(x + p * 3 * u, yy - 5 * u, Math.max(1, u), 5 * u, MID); r.rect(x, yy - 5 * u, 18 * u, Math.max(1, u), MID); if (k % 2) walker(r, wrap(k, sp, gap, w.stroll) + 9 * u, yy, 0.07 * N, LMID, w.stroll / (0.07 * N * 0.12), -1, { coat: true }); } } // their legs go with their own walk, not with the ride
      for (let k = 0; k < 3; k++) { const x = wrap(k, 1.1, 0.4 * N); r.rect(x, 0, 0.06 * N, N, DARK); r.rect(x + 0.06 * N - u, 0, Math.max(1, u), N, LMID + DIM); }
      const cx = 0.5 * N + w.sway, cy = 0.2 * N; // the car on its hanger
      r.rect(0, 0.08 * N, N, 2 * u, LMID); r.stroke(0.5 * N, 0.08 * N, cx, cy, 2 * u, DARK); r.rect(cx - 0.17 * N, cy, 0.34 * N, 0.16 * N, DARK); r.rect(cx - 0.17 * N, cy + 0.14 * N, 0.34 * N, 2 * u, HOT); // the hanger swings from the trolley on the rail
      for (let k = 0; k < 4; k++) { const wx = cx - 0.15 * N + k * 0.08 * N; r.rect(wx, cy + 0.03 * N, 0.06 * N, 0.07 * N, f.level > 0.25 ? BRIGHT : LMID); walker(r, wx + 0.03 * N, cy + 0.1 * N, 0.06 * N, DARK, 0, 1, k === 1 ? { hat: true } : { coat: true }); r.rect(wx, cy + 0.07 * N, 0.06 * N, 0.03 * N, DARK); }
      targets.push({ x: cx - 0.17 * N, y: cy, w: 0.34 * N, h: 0.16 * N });
    }
    if (w.phase === 'wipe') { // the doors close on the atrium and open on the corridor
      const q = Math.sin(Math.PI * clamp(1 - w.wipe));
      w.wipe -= dt;
      if (w.wipe <= 0) w.phase = 'corridor';
      if (w.wipe < 0.5) researchlab.corridor(W, g, bps);
      r.rect(0, 0, q * 0.5 * N, N, DARK); r.rect(N - q * 0.5 * N, 0, q * 0.5 * N + 1, N, DARK); r.rect(q * 0.5 * N - u, 0, 2 * u, N, LMID); r.rect(N - q * 0.5 * N - u, 0, 2 * u, N, LMID);
    } else if (w.phase === 'corridor') researchlab.corridor(W, g, bps);
    w.sparks = particles(W, w.sparks, BRIGHT);
  },
  corridor(W, g, bps) {
    const { r, N, u, t, dt, f, w, rnd, targets, s } = W;
    if (w.queued && w.cascade <= 0 && w.alarm <= 0) { w.queued = false; w.cascade = 3; w.riftT = 0; }
    const cas = w.cascade > 0, alarm = w.alarm > 0;
    w.cascade -= dt; if (cas && w.cascade <= 0) w.alarm = 10; w.alarm -= dt;
    r.rect(0, 0.12 * N, N, g - 0.12 * N, MID);
    for (let x = 0; x < N; x += 0.1 * N) r.rect(x, 0.12 * N, Math.max(1, u), g - 0.12 * N, DARK + DIM);
    r.rect(0, 0.42 * N, N, 1.5 * u, DARK + DIM);
    for (const dx of [0.08, 0.7]) { r.rect(dx * N, g - 0.24 * N, 0.1 * N, 0.24 * N, DARK); r.rect(dx * N + 0.045 * N, g - 0.24 * N, Math.max(1, u), 0.24 * N, MID); r.rect(dx * N + 0.03 * N, g - 0.27 * N, 0.04 * N, 2 * u, alarm ? HOT : COOL); }
    ground(r, N, g, u, LMID, DARK);
    for (let x = 0, k = 0; x < N; x += 3 * u, k++) r.rect(x, g + 1.5 * u, 3 * u, 2 * u, k % 2 ? HOT : DARK); // the hazard stripes
    const lit = alarm ? (Math.floor(t * 4) % 2 ? HOT : HOT + DIM) : f.level > 0.3 || f.beat.pulse > 0.6 ? BRIGHT : LMID;
    for (let k = 0; k < 4; k++) r.rect((0.08 + k * 0.25) * N, 0.13 * N, 0.12 * N, 2 * u, lit);
    if (w.wing === 'labs') for (const bx of [0.18, 0.78]) { r.rect(bx * N, g - 0.1 * N, 0.14 * N, 0.1 * N, DARK); r.rect(bx * N + 0.02 * N, g - 0.16 * N, 0.05 * N, 0.05 * N, LMID); r.rect(bx * N + 0.03 * N, g - 0.15 * N, 0.03 * N, 0.03 * N, f.beat.pulse > 0.5 ? COOL : DARK); }
    else if (w.wing === 'silo') { r.ring(0.5 * N, 0.3 * N, 0.08 * N, 0.16 * N, DARK + DIM, 1.8); for (let k = 0; k < 5; k++) r.rect(0.3 * N, (0.16 + k * 0.06) * N, 0.4 * N, Math.max(1, u), DARK); for (const px of [0.3, 0.7]) r.rect(px * N - u, 0.12 * N, 2 * u, g - 0.12 * N, DARK); }
    else for (const bx of [0.12, 0.76]) { r.rect(bx * N, g - 0.07 * N, 0.12 * N, 0.07 * N, DARK); r.rect(bx * N + 0.03 * N, g - 0.12 * N, 0.05 * N, 0.05 * N, LMID); r.rect(bx * N + 0.13 * N, g - 0.08 * N, 0.03 * N, 0.08 * N, DARK + DIM); r.disc(bx * N + 0.1 * N, g - 0.1 * N, 2.5 * u, COOL + DIM); }
    // the test stand and the crystal, pulsing with the bass; dark and cracked after the cascade
    const cx = 0.5 * N, pulse = alarm ? 0 : 1 + 0.35 * f.rel.bassDrive + 0.25 * f.beat.pulse, ch = 0.07 * N * pulse, cw = 0.035 * N * pulse, cy = g - 0.16 * N;
    r.poly([[cx - 0.05 * N, g], [cx - 0.03 * N, g - 0.09 * N], [cx + 0.03 * N, g - 0.09 * N], [cx + 0.05 * N, g]], DARK);
    r.rect(cx - 0.04 * N, g - 0.09 * N, 0.08 * N, 1.5 * u, LMID);
    if (!alarm) r.ring(cx, cy, ch * 0.9, Math.max(1, u), COOL + DIM, 1.2);
    r.poly([[cx, cy - ch], [cx + cw, cy], [cx, cy + ch * 0.8], [cx - cw, cy]], alarm ? DARK : cas ? BRIGHT : COOL);
    if (alarm) r.line(cx - cw * 0.5, cy - ch * 0.4, cx + cw * 0.3, cy + ch * 0.3, MID); else r.rect(cx - u, cy - ch * 0.5, Math.max(1, u), ch * 0.5, BRIGHT);
    targets.push({ x: cx - cw, y: cy - ch, w: 2 * cw, h: 2 * ch });
    // the staff walk their rounds, run in the alarm
    for (const p of w.staff) {
      const sp = dt * 0.06 * bps * (alarm || cas ? 2.2 : p.guard ? 0.8 : 1), hh = 0.14 * N;
      p.x += p.dir * sp; p.ph += (sp * N) / (hh * 0.12);
      if (p.x > 0.96 || p.x < 0.04) p.dir = -p.dir;
      if (cas) for (const rf of w.rifts) if (Math.abs(rf.x - p.x) < 0.1) p.dir = p.x < rf.x ? -1 : 1;
      walker(r, p.x * N, g, hh, p.guard ? DARK : LMID, p.ph, p.dir, p.guard ? { hat: true } : { coat: true });
      if (p.guard) r.rect(p.x * N - 2 * u, g - hh * 0.62, 4 * u, hh * 0.25, MID);
      targets.push({ x: p.x * N - hh * 0.25, y: g - hh, w: hh * 0.5, h: hh });
    }
    // the cascade: bolts, tears, critters out of them, the shake
    if (cas) {
      s.shake = Math.max(s.shake, 0.5);
      for (let k = 0; k < 3; k++) if (rnd() < 0.6) bolt(r, rnd, rnd() * N, 0, rnd() * N, N, 9, 0.12 * N, k ? COOL : BRIGHT);
      if ((w.riftT -= dt) <= 0 && w.cascade > 1.2 && w.rifts.length < 5) { w.riftT = 0.3; w.rifts.push({ x: 0.1 + rnd() * 0.8, y: 0.35 + rnd() * 0.3, t: 2.5 }); }
    }
    w.rifts = w.rifts.filter((rf) => {
      rf.t -= dt;
      const rx = rf.x * N, ry = rf.y * N, hh = 0.1 * N * Math.min(1, rf.t), ww = 0.025 * N * Math.min(1, rf.t);
      r.ring(rx, ry, ww * 0.5, ww, BRIGHT, hh / ww); r.ring(rx, ry, ww, Math.max(1, u), COOL, hh / ww);
      if (rnd() < dt * 5 && w.critters.length < 14) w.critters.push({ x: rf.x, y: (g - ry) / N, vx: (rnd() - 0.5) * 0.5, vy: 0.2, life: 7 });
      return rf.t > 0;
    });
    w.critters = w.critters.filter((c) => {
      c.life -= dt;
      if (c.y > 0 || c.vy > 0) { c.vy -= GRAV * dt; c.x += c.vx * dt; c.y += c.vy * dt; if (c.y <= 0) { c.y = 0; c.vy = 0; c.vx = 0; } }
      else if (f.beat.on) { c.vy = 0.3 + rnd() * 0.3; c.vx = (rnd() - 0.5) * 0.5; }
      const cx2 = c.x * N, cy2 = g - c.y * N - 2 * u;
      shadow(r, cx2, g + u, (5 * u) / (1 + c.y * 6), u);
      r.disc(cx2, cy2, 2.5 * u, MID);
      for (const k of [-2.5, -1, 1, 2.5]) r.line(cx2 + k * u, cy2 + u, cx2 + k * 1.5 * u, cy2 + 3 * u, DARK);
      return c.life > 0 && c.x > -0.05 && c.x < 1.05;
    });
  },
};

// ---------------------------------------------------------------------------------------------- defusal
// A dusty map from above with two sites. A device is planted on one: a LED that blinks faster as the bar under it
// counts down with the beats (no digits), a defender kneeling over it with a slower bar of their own. Figures take
// corners and peek round them on the hats; a heavy kick is a long tracer across the map that stops at the first wall;
// a hard snare is a flashbang (a white frame, then it fades), a softer one a molotov that burns a patch; a note is a
// smoke, a cloud that expands and thins. A drop decides the round, in turn: the blast (a dome, debris with gravity
// and a shadow under every piece) or the defuse (the LED goes green, the defenders hop); then the other site. The
// site: dust, a rail yard, an office floor.
const SITE_W = { dust: [3, 2, 2], railyard: [1, 2, 3], office: [2, 2, 1] };
const WALLS = [[0.4, 0.06, 0.025, 0.3], [0.06, 0.42, 0.3, 0.025], [0.56, 0.6, 0.025, 0.34], [0.6, 0.44, 0.34, 0.025], [0.3, 0.6, 0.15, 0.025], [0.62, 0.2, 0.025, 0.14], [0.2, 0.75, 0.025, 0.19]];
const SITES = [[0.22, 0.22], [0.76, 0.76]];
const inWall = (x, y) => x < 0.03 || x > 0.97 || y < 0.03 || y > 0.97 || WALLS.some(([wx, wy, ww, wh]) => x >= wx && x <= wx + ww && y >= wy && y <= wy + wh);
const defusal = {
  init(W) {
    const { w, rnd } = W, figs = [];
    for (let team = 0; team < 2; team++) for (let i = 0; i < 5; i++) figs.push({ team, x: team ? 0.9 - i * 0.03 : 0.1 + i * 0.03, y: team ? 0.1 : 0.9, a: team ? Math.PI : 0, wx: 0.5, wy: 0.5, peek: 0, flash: 0, dead: 0, hop: 0, wait: rnd() });
    Object.assign(w, { site: rollW(rnd, SITE_W, bandOf(W.a)), figs, bomb: { at: 1, t: 1, defuse: 0 }, outcome: 0, round: 0, boom: 0, cheer: 0, debris: [], smokes: [], fires: [], tracers: [], flash: 0, scorch: [], nextOut: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bps = bpsOf(f), B = w.bomb, [sx, sy] = SITES[B.at];
    const live = (team) => w.figs.filter((q) => q.team === team && !q.dead);
    const finish = (blast) => { // the round's end: the blast or the defuse, then the other site
      w.round = 4; w.outcome = blast ? 1 : 2;
      if (blast) { w.boom = 1.5; s.shake = Math.max(s.shake, 1); if (!w.scorch.some((sc) => sc.x === sx && sc.y === sy)) w.scorch.push({ x: sx, y: sy }); for (let k = 0; k < 40; k++) { const a = rnd() * TAU, sp = (0.1 + rnd() * 0.4) * N; w.debris.push({ x: sx * N, y: sy * N, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, z: 0, vz: (0.4 + rnd() * 0.8) * N, life: 2 + rnd() }); } for (const q of w.figs) if (Math.hypot(q.x - sx, q.y - sy) < 0.15) q.dead = 3; }
      else { w.cheer = 1.5; for (const q of live(1)) q.hop = 0.6; }
    };
    for (const h of hits) {
      if (isLow(h)) { // a shot along the shooter's facing: the heavy kicks go the length of the map, to the first wall
        const q = pick(rnd, w.figs.filter((p) => !p.dead)), reach = h.strength > 0.7 ? 140 : 20;
        if (q) { let x = q.x, y = q.y, k = 0; const dx = Math.cos(q.a) * 0.01, dy = Math.sin(q.a) * 0.01; while (k++ < reach && !inWall(x + dx, y + dy)) { x += dx; y += dy; } w.tracers.push({ x0: q.x * N, y0: q.y * N, x1: x * N, y1: y * N, t: 1 }); q.flash = 0.1; for (const e of w.figs) if (e.team !== q.team && !e.dead) { const px = e.x - q.x, py = e.y - q.y, al = px * Math.cos(q.a) + py * Math.sin(q.a), off = Math.abs(px * -Math.sin(q.a) + py * Math.cos(q.a)); if (al > 0 && al < Math.hypot(x - q.x, y - q.y) && off < 0.02) { e.flash = 0.3; if (rnd() < 0.5) e.dead = 3; } } }
      } else if (h.kind === 'snare') {
        if (h.strength > 0.75) w.flash = 1;
        else w.fires.push({ x: 0.15 + rnd() * 0.7, y: 0.15 + rnd() * 0.7, t: 3 });
      } else if (isTonal(h) && w.smokes.length < 6) w.smokes.push({ x: 0.1 + rnd() * 0.8, y: 0.1 + rnd() * 0.8, t: 0 }); // (six at most: each is a per-pixel cloud)
      else if (h.kind === 'hat') { const q = pick(rnd, w.figs.filter((p) => !p.dead && p.peek <= 0)); if (q) q.peek = 0.35; }
    }
    if (f.section === 'drop' && w.round <= 0) { finish(w.nextOut === 0); w.nextOut = 1 - w.nextOut; }
    else if (f.section === 'change') w.site = rollW(rnd, SITE_W, bandOf(W.a));
    // the device: the bar counts down a step a beat, the defuser's bar creeps up with the music; either end decides
    if (w.round <= 0) {
      if (f.beat.on) B.t -= 1 / 40;
      B.defuse += dt * 0.012 * (0.5 + f.level);
      if (B.t <= 0) finish(true); else if (B.defuse >= 1) finish(false);
    } else if ((w.round -= dt) <= 0) { B.at = 1 - B.at; B.t = 1; B.defuse = 0; w.outcome = 0; }
    w.flash -= dt * 1.4; w.boom -= dt; w.cheer -= dt;
    // the ground by the site, the two sites, the scorches, the fires
    if (w.site === 'dust') { r.fill(LMID); for (let y = 0; y < N; y += 2 * u) for (let x = 0; x < N; x += 2 * u) if (hash(x, y) < 0.08) r.rect(x, y, Math.max(1, u), Math.max(1, u), MID); }
    else if (w.site === 'railyard') { r.fill(MID); for (const ry of [0.3, 0.52, 0.86]) { for (let x = 0; x < N; x += 3 * u) r.rect(x, ry * N - 2 * u, 2 * u, 5 * u, DARK + DIM); r.rect(0, ry * N - 1.5 * u, N, Math.max(1, u), DARK); r.rect(0, ry * N + 1.5 * u, N, Math.max(1, u), DARK); } for (const [cx, cy] of [[0.72, 0.3], [0.2, 0.52]]) { r.rect(cx * N, cy * N - 3 * u, 0.16 * N, 6 * u, DARK); r.rect(cx * N + u, cy * N - 2 * u, 0.16 * N - 2 * u, 4 * u, LMID + DIM); } }
    else { r.fill(MID); for (let y = 0; y < N; y += 3 * u) for (let x = 0; x < N; x += 3 * u) r.rect(x, y, Math.max(1, u), Math.max(1, u), DARK + DIM); for (let k = 0; k < 6; k++) { const dx = (0.08 + (k % 3) * 0.3) * N, dy = (0.52 + Math.floor(k / 3) * 0.3) * N; r.rect(dx, dy, 0.06 * N, 0.03 * N, LMID); r.rect(dx + 0.02 * N, dy + 0.03 * N, 0.02 * N, 0.02 * N, DARK); } }
    for (const [cx, cy] of SITES) { const S0 = 0.13 * N, px = cx * N, py = cy * N; for (let k = -S0; k < S0; k += 3 * u) { r.line(px - S0, py + k, px - k, py + S0, DARK + DIM); r.line(px + k, py - S0, px + S0, py - k, DARK + DIM); } r.frame(Math.round(px - S0), Math.round(py - S0), Math.round(2 * S0), Math.round(2 * S0), DARK + DIM); }
    for (const sc of w.scorch) r.disc(sc.x * N, sc.y * N, 0.08 * N, DARK + DIM);
    w.fires = w.fires.filter((fi) => { fi.t -= dt; const rad = 0.04 * N * Math.min(1, fi.t); r.disc(fi.x * N, fi.y * N, rad * 0.8, DARK + DIM); for (let k = 0; k < 12; k++) { const a = rnd() * TAU, d = rnd() * rad; r.rect(fi.x * N + Math.cos(a) * d, fi.y * N + Math.sin(a) * d, 1.5 * u, 1.5 * u, k % 3 ? HOT : BRIGHT); } return fi.t > 0; });
    for (const [wx, wy, ww, wh] of WALLS) { r.rect(wx * N, wy * N, ww * N, wh * N, DARK); r.rect(wx * N, wy * N, ww * N, Math.max(1, u), LMID + DIM); }
    r.frame(0, 0, N, N, DARK); r.frame(1, 1, N - 2, N - 2, DARK);
    // the device and its bars; the defuser kneeling over it
    if (w.round <= 0 || w.outcome === 2) {
      const bx = sx * N, by = sy * N, period = lerp(0.7, 0.07, 1 - B.t), on = w.outcome === 2 || Math.floor(t / period) % 2 === 0;
      r.rect(bx - 3 * u, by - 2 * u, 6 * u, 4 * u, DARK); r.rect(bx - 2 * u, by - u, 2 * u, 2 * u, on ? (w.outcome === 2 ? COOL : HOT) : DARK + DIM);
      r.rect(bx - 6 * u, by + 4 * u, 12 * u, 2 * u, DARK); r.rect(bx - 6 * u, by + 4 * u, 12 * u * B.t, 2 * u, HOT);
      if (w.round <= 0) { r.rect(bx - 6 * u, by + 7 * u, 12 * u, 2 * u, DARK); r.rect(bx - 6 * u, by + 7 * u, 12 * u * Math.min(1, B.defuse), 2 * u, COOL); r.disc(bx + 4 * u, by - 3 * u, 2 * u, COOL); r.rect(bx + 2 * u, by - 3 * u, 3 * u, Math.max(1, u), COOL); }
      targets.push({ x: bx - 6 * u, y: by - 4 * u, w: 12 * u, h: 12 * u });
    }
    // the figures: the attackers hold the site, the defenders close in; a walk, a corner, a peek
    for (const q of w.figs) {
      q.flash -= dt; q.peek -= dt; q.hop -= dt; q.wait -= dt;
      if (q.dead > 0) { q.dead -= dt; if (q.dead <= 0) { q.x = q.team ? 0.9 : 0.1; q.y = q.team ? 0.1 : 0.9; } else { r.disc(q.x * N, q.y * N, 2 * u, DARK + DIM); continue; } }
      const d = Math.hypot(q.wx - q.x, q.wy - q.y);
      if (d < 0.01 || q.wait <= 0) { q.wait = 1 + rnd() * 3; const rr = q.team ? 0.14 + rnd() * 0.12 : 0.04 + rnd() * 0.1, a = rnd() * TAU; q.wx = clamp(sx + Math.cos(a) * rr, 0.05, 0.95); q.wy = clamp(sy + Math.sin(a) * rr, 0.05, 0.95); if (inWall(q.wx, q.wy)) q.wait = 0; }
      else { // a walk, sliding along a wall that is in the way; a new spot when stuck
        const sp = Math.min(d, dt * 0.07 * bps), mx = ((q.wx - q.x) / d) * sp, my = ((q.wy - q.y) / d) * sp;
        if (!inWall(q.x + mx, q.y + my)) { q.x += mx; q.y += my; }
        else if (Math.abs(mx) > Math.abs(my) * 0.3 && !inWall(q.x + mx, q.y)) q.x += mx;
        else if (Math.abs(my) > Math.abs(mx) * 0.3 && !inWall(q.x, q.y + my)) q.y += my;
        else q.wait = 0;
        q.a = followAngle(q.a, Math.atan2(q.wy - q.y, q.wx - q.x), dt, 0.15);
      }
      const px = Math.cos(q.a), py = Math.sin(q.a), lean = q.peek > 0 ? Math.sin(Math.PI * clamp(q.peek / 0.35)) * 2.5 * u : 0, hp = ((0.6 - q.hop) / 0.3) % 1, hop = q.hop > 0 ? 4 * hp * (1 - hp) * 3 * u : 0; // two hops, each a parabola from the ground back to it
      const fx = q.x * N - py * lean, fy = q.y * N + px * lean, col = q.flash > 0 ? BRIGHT : TEAM[q.team];
      r.disc(fx + u, fy + u, 2.2 * u, DARK + DIM);
      r.disc(fx, fy - hop, 2.2 * u, col); r.line(fx + px * 2 * u, fy - hop + py * 2 * u, fx + px * 5 * u, fy - hop + py * 5 * u, DARK); r.rect(fx - 0.5 * u, fy - hop - 0.5 * u, Math.max(1, u), Math.max(1, u), DARK);
      targets.push({ x: fx - 3 * u, y: fy - 3 * u, w: 6 * u, h: 6 * u });
    }
    w.tracers = tracers(W, w.tracers, LMID, 3);
    for (const tr of w.tracers) if (tr.t > 0.8) r.disc(tr.x0, tr.y0, 2.5 * u, BRIGHT);
    // the smokes: clouds that grow and thin; the debris in the air with its shadows; the dome; the flash
    w.smokes = w.smokes.filter((sm) => {
      sm.t += dt;
      const rad = (0.02 + 0.13 * (1 - Math.exp(-sm.t * 1.2))) * N, dens = Math.max(0, 1 - sm.t / 7), cx = sm.x * N, cy = sm.y * N;
      const fr = Math.floor(sm.t * 3), r2 = rad * rad;
      for (let y = Math.max(0, cy - rad) | 0; y < Math.min(N, cy + rad); y++) for (let x = Math.max(0, cx - rad) | 0; x < Math.min(N, cx + rad); x++) { const d2 = (x - cx) ** 2 + (y - cy) ** 2; if (d2 >= r2) continue; const dd = Math.sqrt(d2) / rad; if (hash(x, y + fr) < dens * (1.1 - dd)) r.buf[y * N + x] = dd < 0.5 ? BRIGHT : LMID; }
      return dens > 0;
    });
    w.debris = w.debris.filter((p) => {
      p.vz -= GRAV * N * dt; p.z += p.vz * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.z < 0) { p.z = 0; p.vz = -p.vz * 0.4; p.vx *= 0.6; p.vy *= 0.6; }
      r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), DARK + DIM); r.rect(p.x, p.y - p.z, Math.max(1, 1.5 * u), Math.max(1, 1.5 * u), DARK);
      return p.life > 0;
    });
    if (w.boom > 0) for (const [k, c] of [[1, BRIGHT], [0.7, HOT], [0.45, LMID]]) r.ring(sx * N, sy * N, (1.5 - w.boom) * 0.45 * N * k, 3 * u, c);
    if (w.cheer > 0) for (let k = 0; k < 6; k++) r.rect(sx * N + (hash(k, 1) - 0.5) * 0.2 * N, sy * N - (1.5 - w.cheer) * 0.15 * N - hash(k, 2) * 0.05 * N, 1.5 * u, 1.5 * u, k % 2 ? COOL : BRIGHT);
    if (w.flash > 0) { const buf = r.buf; if (w.flash > 0.85) buf.fill(WHITE); else for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (hash(x, y) < w.flash) buf[y * N + x] = WHITE; }
  },
};

// ---------------------------------------------------------------------------------------------- lanes
// A three-lane map from above: two bases in opposite corners, towers down every lane, a river across the middle and
// a jungle with its camps. Creep waves set out every eight beats, march at the tempo and meet in the middle of the
// lane, where they fight in small flashes; the towers shoot whatever comes in range, and the shots travel. Heroes
// are the bigger silhouettes: an area ring on a kick, a stun bolt on a snare, a dash on a hat. Sections turn day to
// night and back; a drop is the team fight at the pit: the big boss there loses its bar, and then the far ancient's
// bar drains and it falls, and the map starts over.
const LANE_PTS = [[[0.12, 0.88], [0.12, 0.12], [0.88, 0.12]], [[0.12, 0.88], [0.88, 0.12]], [[0.12, 0.88], [0.88, 0.88], [0.88, 0.12]]];
const laneAt = (lane, s) => { const P = LANE_PTS[lane]; if (P.length === 2) return [lerp(P[0][0], P[1][0], s), lerp(P[0][1], P[1][1], s)]; const k = s < 0.5 ? 0 : 1, q = (s - k * 0.5) * 2; return [lerp(P[k][0], P[k + 1][0], q), lerp(P[k][1], P[k + 1][1], q)]; };
const CAMPS = [[0.3, 0.3], [0.7, 0.7], [0.3, 0.62], [0.68, 0.36]];
const TREES = Array.from({ length: 70 }, (_, k) => [hash(k, 41), hash(k, 42)]).filter(([x, y]) => [0, 1, 2].every((l) => { let m = 1; for (let s = 0; s <= 1; s += 0.02) { const [lx, ly] = laneAt(l, s); m = Math.min(m, Math.hypot(lx - x, ly - y)); } return m > 0.08; }) && x > 0.06 && x < 0.94 && y > 0.06 && y < 0.94 && CAMPS.every(([cx, cy]) => Math.hypot(cx - x, cy - y) > 0.06));
const lanes = {
  init(W) {
    const { w, rnd } = W, towers = [];
    for (let lane = 0; lane < 3; lane++) for (const [team, s] of [[0, 0.2], [0, 0.38], [1, 0.62], [1, 0.8]]) towers.push({ lane, team, s, hp: 30, flash: 0 });
    Object.assign(w, { towers, creeps: [], shots: [], heroes: Array.from({ length: 6 }, (_, i) => ({ hero: true, team: i < 3 ? 0 : 1, lane: i % 3, x: i < 3 ? 0.12 : 0.88, y: i < 3 ? 0.88 : 0.12, hp: 1, dead: 0, stun: 0, dash: 0, dx: 0, dy: 0, aoe: 0, flash: 0, trail: [] })),
      camps: CAMPS.map(() => ({ up: 1, t: 0 })), night: false, fight: 0, boss: 1, ancient: [1, 1], fall: 0, rings: [], sparks: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bps = bpsOf(f), pit = [0.4, 0.6], night = w.night;
    const enemyOf = (team, x, y, rad) => { let best = null, bd = rad; const test = (o, ox, oy) => { const d = Math.hypot(ox - x, oy - y); if (d < bd) { bd = d; best = o; } }; for (const c of w.creeps) if (c.team !== team) test(c, c.x, c.y); for (const h of w.heroes) if (h.team !== team && h.hp > 0) test(h, h.x, h.y); for (const tw of w.towers) if (tw.team !== team && tw.hp > 0) { const [tx, ty] = laneAt(tw.lane, tw.s); test(tw, tx, ty); } return best; };
    const posOf = (o) => (o.x === undefined ? laneAt(o.lane, o.s) : [o.x, o.y]); // the towers sit on their lane, the rest carry a position
    for (const h of hits) {
      if (isLow(h)) { const he = pick(rnd, w.heroes.filter((q) => q.hp > 0)); if (he) { he.aoe = 0.45; for (const c of w.creeps) if (c.team !== he.team && Math.hypot(c.x - he.x, c.y - he.y) < 0.1) { c.hp -= 2; c.flash = 0.2; } } }
      else if (h.kind === 'snare') { const he = pick(rnd, w.heroes.filter((q) => q.hp > 0)); const foe = he && w.heroes.filter((q) => q.team !== he.team && q.hp > 0).sort((a, b) => Math.hypot(a.x - he.x, a.y - he.y) - Math.hypot(b.x - he.x, b.y - he.y))[0]; if (foe) w.shots.push({ x: he.x, y: he.y, tg: foe, v: 0.9, stun: true, c: BRIGHT }); }
      else if (h.kind === 'hat') { const he = pick(rnd, w.heroes.filter((q) => q.hp > 0 && q.stun <= 0)); if (he) { he.dash = 0.25; he.trail = [[he.x, he.y]]; } }
    }
    if (f.section === 'drop' && w.fight <= 0 && w.fall <= 0) { w.fight = 6; w.boss = 1; }
    else if (f.section === 'change') w.night = !w.night;
    w.fight -= dt;
    // the waves: every eight beats, four a lane a side; they march at the tempo and stop to fight whatever is in reach
    if (f.beat.on && f.beat.count % 8 === 0) for (let lane = 0; lane < 3; lane++) for (let team = 0; team < 2; team++) for (let k = 0; k < 4; k++) w.creeps.push({ team, lane, s: team ? 1 - k * 0.012 : k * 0.012, off: (rnd() - 0.5) * 3 * u, hp: 4, flash: 0, x: 0, y: 0 });
    for (const c of w.creeps) { const [lx, ly] = laneAt(c.lane, c.s); c.x = lx; c.y = ly; }
    for (const c of w.creeps) {
      c.flash -= dt;
      const foe = enemyOf(c.team, c.x, c.y, 0.035);
      if (!foe) c.s += (c.team ? -1 : 1) * dt * 0.018 * bps;
      else if (f.beat.on) { foe.hp -= foe.hero ? 0.12 : 1; foe.flash = 0.15; const [px, py] = posOf(foe); burst(w.sparks, rnd, ((c.x + px) / 2) * N, ((c.y + py) / 2) * N, 2, N * 0.15, BRIGHT, 0.2); }
    }
    w.creeps = w.creeps.filter((c) => c.hp > 0 && c.s > -0.01 && c.s < 1.01);
    if (w.creeps.length > 90) w.creeps.splice(0, w.creeps.length - 90);
    // the towers shoot on the beat at the nearest thing in range; the shots travel to where the target is
    for (const tw of w.towers) { tw.flash -= dt; if (tw.hp <= 0) continue; const [tx, ty] = laneAt(tw.lane, tw.s); if (f.beat.on) { const foe = enemyOf(tw.team, tx, ty, 0.11); if (foe) w.shots.push({ x: tx, y: ty, tg: foe, v: 0.6, c: TEAM[tw.team] }); } }
    w.shots = w.shots.filter((sh) => { // homing on the target while it stands, then on the spot where it fell, where it fizzles
      const tg = sh.tg;
      if (!(tg.hp > 0)) sh.lost = true;
      if (!sh.lost || sh.px === undefined) [sh.px, sh.py] = posOf(tg);
      const dx = sh.px - sh.x, dy = sh.py - sh.y, d = Math.hypot(dx, dy), mv = dt * sh.v;
      if (d <= mv) { if (!sh.lost) { tg.hp -= sh.stun ? 0.05 : tg.hero ? 0.25 : 2; tg.flash = 0.2; if (sh.stun) tg.stun = 1; } burst(w.sparks, rnd, sh.px * N, sh.py * N, 3, N * 0.2, sh.c, 0.25); return false; }
      sh.x += (dx / d) * mv; sh.y += (dy / d) * mv; return true;
    });
    // the heroes: each walks its lane behind the front, the third of each side hunts the jungle; the fight calls them all to the pit
    for (const he of w.heroes) {
      he.flash -= dt; he.aoe -= dt; he.stun -= dt;
      if (he.hp <= 0) { // down for four seconds, then whole again at the base (not back up on the spot with nothing left)
        if ((he.dead = (he.dead || 4) - dt) <= 0) { he.dead = 0; he.hp = 1; he.stun = 0; he.dash = 0; he.trail.length = 0; he.x = he.team ? 0.88 : 0.12; he.y = he.team ? 0.12 : 0.88; }
        continue;
      }
      he.hp = Math.min(1, he.hp + dt * 0.03); // a slow mend while up
      let tx, ty;
      if (w.fight > 0) { tx = pit[0] + (he.team ? 0.06 : -0.06); ty = pit[1] + (he.team ? -0.05 : 0.05); }
      else if (he.lane === 2) { const camp = w.camps.findIndex((cp) => cp.up); [tx, ty] = camp >= 0 ? CAMPS[(camp + (he.team ? 1 : 0)) % CAMPS.length] : pit; }
      else { const front = w.creeps.filter((c) => c.lane === he.lane && c.team === he.team).map((c) => c.s), fs = front.length ? (he.team ? Math.max(...front) : Math.min(...front)) : he.team ? 0.75 : 0.25; [tx, ty] = laneAt(he.lane, clamp(fs + (he.team ? 0.04 : -0.04), 0.05, 0.95)); }
      const dx = tx - he.x, dy = ty - he.y, d = Math.hypot(dx, dy);
      if (he.dash > 0) { he.dash -= dt; if (d > 0.001) { he.x += (dx / d) * dt * 0.5; he.y += (dy / d) * dt * 0.5; } he.trail.push([he.x, he.y]); if (he.trail.length > 6) he.trail.shift(); }
      else if (he.stun <= 0 && d > 0.01) { const mv = Math.min(d, dt * 0.06 * bps); he.x += (dx / d) * mv; he.y += (dy / d) * mv; }
      if (he.lane === 2) w.camps.forEach((cp, i) => { if (cp.up && Math.hypot(CAMPS[i][0] - he.x, CAMPS[i][1] - he.y) < 0.03) { cp.up = 0; cp.t = 20; burst(w.sparks, rnd, CAMPS[i][0] * N, CAMPS[i][1] * N, 8, N * 0.25, MID, 0.4); } });
    }
    for (const cp of w.camps) if (!cp.up && (cp.t -= dt) <= 0) cp.up = 1;
    // the team fight: the boss loses its bar while they are on it, then the far ancient drains and falls; then a new game
    if (w.fight > 0) { const near = w.heroes.filter((h) => h.hp > 0 && Math.hypot(h.x - pit[0], h.y - pit[1]) < 0.12).length; w.boss = Math.max(0, w.boss - dt * 0.06 * near); if (f.beat.on && near) { burst(w.sparks, rnd, pit[0] * N + (rnd() - 0.5) * 0.1 * N, pit[1] * N + (rnd() - 0.5) * 0.1 * N, 8, N * 0.3, BRIGHT, 0.3); s.shake = Math.max(s.shake, 0.2); } if (w.boss <= 0 && w.fall <= 0) { w.fall = 5; burst(w.sparks, rnd, pit[0] * N, pit[1] * N, 30, N * 0.5, HOT, 0.8); } }
    if (w.fall > 0) { w.fall -= dt; w.ancient[1] = Math.max(0, w.ancient[1] - dt * 0.3); if (w.ancient[1] <= 0 && !w.fell) { w.fell = true; burst(w.sparks, rnd, 0.88 * N, 0.12 * N, 40, N * 0.6, TEAM[1], 1); s.shake = Math.max(s.shake, 1); } if (w.fall <= 0) { w.ancient = [1, 1]; w.fell = false; w.creeps.length = 0; for (const tw of w.towers) tw.hp = 30; } }
    // the ground, the river, the lanes, the jungle; at night the ground darkens and the home side's units carry light
    r.fill(night ? DARK + DIM : MID);
    if (night) { for (const he of w.heroes) if (he.team === 0 && he.hp > 0) r.disc(he.x * N, he.y * N, 0.09 * N, DARK); for (const tw of w.towers) if (tw.team === 0 && tw.hp > 0) { const [tx, ty] = laneAt(tw.lane, tw.s); r.disc(tx * N, ty * N, 0.09 * N, DARK); } r.disc(0.12 * N, 0.88 * N, 0.12 * N, DARK); }
    r.stroke(0, 0, N, N, 5 * u, COOL + DIM); // the river
    for (let lane = 0; lane < 3; lane++) { const P = LANE_PTS[lane]; for (let k = 0; k + 1 < P.length; k++) r.stroke(P[k][0] * N, P[k][1] * N, P[k + 1][0] * N, P[k + 1][1] * N, 4 * u, night ? DARK : LMID + DIM); }
    for (const [tx, ty] of TREES) { r.disc(tx * N, ty * N, 2.2 * u, night ? BLACK : DARK); r.rect(tx * N - u, ty * N - u, Math.max(1, u), Math.max(1, u), night ? DARK : MID); }
    w.camps.forEach((cp, i) => { const [cx, cy] = CAMPS[i]; r.ring(cx * N, cy * N, 4 * u, Math.max(1, u), DARK + DIM); if (cp.up) for (let k = 0; k < 3; k++) r.disc(cx * N + Math.cos(k * 2.1 + t) * 2.5 * u, cy * N + Math.sin(k * 2.1 + t) * 2.5 * u, 1.3 * u, LMID); });
    // the pit and its boss, the bases and their ancients with the bars
    r.ring(pit[0] * N, pit[1] * N, 0.06 * N, 3 * u, DARK, 0.8);
    if (w.fall <= 0 || w.boss > 0) { r.disc(pit[0] * N, pit[1] * N, 0.04 * N, DARK); for (const k of [-1, 1]) r.poly([[pit[0] * N + k * 0.02 * N, pit[1] * N - 0.03 * N], [pit[0] * N + k * 0.045 * N, pit[1] * N - 0.06 * N], [pit[0] * N + k * 0.035 * N, pit[1] * N - 0.02 * N]], DARK); r.rect(pit[0] * N - u, pit[1] * N - 1.5 * u, 2 * u, 1.5 * u, w.fight > 0 ? BRIGHT : HOT); if (w.fight > 0) { r.rect(pit[0] * N - 0.05 * N, pit[1] * N - 0.09 * N, 0.1 * N, 2 * u, DARK); r.rect(pit[0] * N - 0.05 * N, pit[1] * N - 0.09 * N, 0.1 * N * w.boss, 2 * u, HOT); } }
    for (const team of [0, 1]) { const bx = (team ? 0.88 : 0.12) * N, by = (team ? 0.12 : 0.88) * N; if (w.ancient[team] > 0) { r.disc(bx, by, 0.05 * N, DARK); r.ring(bx, by, 0.035 * N, 2 * u, TEAM[team]); r.disc(bx, by, 1.5 * u, f.beat.pulse > 0.5 ? BRIGHT : TEAM[team]); } else r.disc(bx, by, 0.05 * N, DARK + DIM); r.rect(bx - 0.06 * N, by - 0.08 * N, 0.12 * N, 2 * u, DARK); r.rect(bx - 0.06 * N, by - 0.08 * N, 0.12 * N * w.ancient[team], 2 * u, TEAM[team]); }
    for (const tw of w.towers) { const [tx, ty] = laneAt(tw.lane, tw.s), px = tx * N, py = ty * N; if (tw.hp <= 0) { r.disc(px, py, 3 * u, DARK + DIM); continue; } r.disc(px, py + u, 3.5 * u, DARK + DIM); r.disc(px, py, 3 * u, tw.flash > 0 ? BRIGHT : DARK); r.disc(px, py - u, 1.5 * u, TEAM[tw.team]); targets.push({ x: px - 3 * u, y: py - 3 * u, w: 6 * u, h: 6 * u }); }
    // the creeps, the shots, the heroes with their rings, bolts, dashes and stuns
    for (const c of w.creeps) { // spread across the lane: the offset goes across whichever way the leg runs
      const vert = c.lane === 1 ? null : c.lane === 0 ? c.s < 0.5 : c.s >= 0.5, px = c.x * N + (vert === null ? c.off * 0.7 : vert ? c.off : 0), py = c.y * N + (vert === null ? c.off * 0.7 : vert ? 0 : c.off);
      r.disc(px, py, 1.6 * u, c.flash > 0 ? BRIGHT : TEAM[c.team]); r.rect(px - 0.5 * u, py - 0.5 * u, Math.max(1, u), Math.max(1, u), DARK);
    }
    for (const sh of w.shots) r.disc(sh.x * N, sh.y * N, sh.stun ? 1.5 * u : Math.max(1, u), sh.c);
    for (const he of w.heroes) {
      if (he.hp <= 0) continue;
      const px = he.x * N, py = he.y * N;
      if (he.dash > 0 || he.trail.length) { he.trail.forEach(([ax, ay], i) => r.disc(ax * N, ay * N, 2 * u, i % 2 ? TEAM[he.team] + DIM : DARK + DIM)); if (he.dash <= 0) he.trail.length = 0; }
      r.disc(px + u, py + u, 3.5 * u, DARK + DIM);
      r.disc(px, py, 3.5 * u, DARK); r.disc(px, py, 2.5 * u, he.flash > 0 ? BRIGHT : TEAM[he.team]); r.rect(px - 0.5 * u, py - 0.5 * u, Math.max(1, u), Math.max(1, u), FIG);
      r.rect(px - 4 * u, py - 6 * u, 8 * u, Math.max(1, u), DARK); r.rect(px - 4 * u, py - 6 * u, 8 * u * clamp(he.hp), Math.max(1, u), TEAM[he.team]);
      if (he.aoe > 0) r.ring(px, py, (0.45 - he.aoe) * 0.25 * N, 2 * u, BRIGHT);
      if (he.stun > 0) for (let k = 0; k < 3; k++) r.rect(px + Math.cos(t * 8 + k * 2.1) * 4 * u, py - 8 * u + Math.sin(t * 8 + k * 2.1) * 1.5 * u, 1.5 * u, 1.5 * u, BRIGHT);
      targets.push({ x: px - 4 * u, y: py - 4 * u, w: 8 * u, h: 8 * u });
    }
    w.sparks = particles(W, w.sparks, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- heroshooter
// A city lane under neon-deco towers. Zip lines sag across the sky and riders slide down them with real physics: a
// bead on a wire, gaining speed down the sag and losing it up the far side, swinging back under the acceleration,
// dropping off at the far pole. Trooper waves walk the lane; the hero fights them, a dash-jump on a snare (a parabola,
// whoever is under the landing goes down); souls rise from the fallen as glowing orbs that slow, then curve to the
// hero. A guardian statue at the lane's end fires a beam down the lane on the kicks. A drop breaks the lane's
// shrine: its pieces fall and bounce, the lamp goes out; it is raised again later. The district: downtown, the old
// quarter, the harbour.
const DISTRICT2_W = { downtown: [2, 2, 3], oldquarter: [3, 2, 1], harbour: [1, 2, 2] };
const heroshooter = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { district: rollW(rnd, DISTRICT2_W, bandOf(W.a)), riders: [], troopers: [], fallen: [], souls: [], count: 0, taken: 0, hero: { x: 0.45, y: 0, vx: 0, vy: 0, air: false, dir: 1, ph: 0, crouch: 0, glow: 0 }, beamT: 0, beamX: 0, eyes: 0, broken: 0, debris: [], sparks: [], dust: [], tracers: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.82 * N, bps = bpsOf(f), he = w.hero, H0 = 0.15 * N, TH = 0.12 * N;
    const CABLES = [[0.06 * N, 0.2 * N, 0.68 * N, 0.4 * N, 0.09 * N], [0.28 * N, 0.11 * N, 0.93 * N, 0.33 * N, 0.08 * N]];
    const cableY = (c, x) => { const s0 = (x - c[0]) / (c[2] - c[0]); return lerp(c[1], c[3], s0) + c[4] * 4 * s0 * (1 - s0); };
    const cableSlope = (c, x) => { const s0 = (x - c[0]) / (c[2] - c[0]); return ((c[3] - c[1]) + c[4] * 4 * (1 - 2 * s0)) / (c[2] - c[0]); };
    const fell = (tr) => { w.fallen.push({ x: tr.x, t: 1 }); tr.dead = true; };
    for (const h of hits) {
      if (isLow(h)) { w.beamT = 0.22; w.beamX = 0.86; w.eyes = 0.5; s.shake = Math.max(s.shake, 0.3); }
      else if (h.kind === 'snare' && !he.air) { const near = w.troopers.filter((tr) => !tr.dead), tx = near.length ? near.reduce((m, tr) => m + tr.x, 0) / near.length : 0.5 + (rnd() - 0.5) * 0.3; he.dir = tx > he.x ? 1 : -1; he.vx = he.dir * (0.4 + 0.3 * h.strength); he.vy = 0.65 + 0.2 * h.strength; he.air = true; }
      else if ((h.kind === 'hat' || h.kind === 'perc' || isTonal(h)) && w.riders.length < 3) { const c = (w.count++) % 2; w.riders.push({ c, x: CABLES[c][0] + 2 * u, vx: 0.12 * N, ax: 0 }); }
    }
    if (f.section === 'drop' && w.broken <= 0) { w.broken = 8; s.shake = Math.max(s.shake, 0.6); for (let k = 0; k < 14; k++) w.debris.push({ x: 0.18 * N + (rnd() - 0.5) * 0.08 * N, y: g - 0.1 * N - rnd() * 0.08 * N, vx: (rnd() - 0.5) * 0.5 * N, vy: -rnd() * 0.5 * N, sz: (1 + rnd() * 2) * u, b: 0 }); }
    else if (f.section === 'change') w.district = rollW(rnd, DISTRICT2_W, bandOf(W.a));
    w.beamT -= dt; w.eyes -= dt; w.broken -= dt; he.crouch -= dt; he.glow -= dt;
    if (f.beat.on && f.beat.count % 8 === 0 && w.troopers.filter((tr) => !tr.dead).length < 12) for (let k = 0; k < 5; k++) w.troopers.push({ x: -0.03 - k * 0.04, ph: rnd() * TAU, dead: false, fire: 0 });
    // the back, by the district
    if (w.district === 'downtown') for (let k = 0; k < 7; k++) { const bx = k * 0.15 * N, bw = 0.12 * N, bh = (0.35 + 0.3 * hash(k, 31)) * N; for (let tier = 0; tier < 3; tier++) r.rect(bx + tier * bw * 0.15, g - bh + tier * 0.06 * N * (tier ? -1 : 0) - (tier ? tier * 0.05 * N : 0), bw - tier * bw * 0.3, bh, DARK); r.rect(bx + bw * 0.5 - u, g - bh - 0.12 * N, 2 * u, 0.12 * N, (k + Math.floor(f.rel.trebClock * 2)) % 2 ? COOL : HOT); for (let y = g - bh + 4 * u; y < g - 0.05 * N; y += 4 * u) for (const wx of [0.25, 0.75]) if (hash(k, y + wx) < 0.5) r.rect(bx + wx * bw, y, 1.5 * u, 2 * u, f.beat.pulse > 0.6 && hash(k, y) < 0.3 ? BRIGHT : LMID); }
    else if (w.district === 'oldquarter') for (let k = 0; k < 6; k++) { const bx = k * 0.17 * N, bw = 0.15 * N, bh = (0.14 + 0.08 * hash(k, 33)) * N; r.rect(bx, g - bh, bw, bh, DARK); r.poly([[bx - 0.02 * N, g - bh - 0.01 * N], [bx + bw * 0.1, g - bh - 0.07 * N], [bx + bw * 0.9, g - bh - 0.07 * N], [bx + bw + 0.02 * N, g - bh - 0.01 * N], [bx + bw, g - bh + 0.01 * N], [bx, g - bh + 0.01 * N]], DARK + DIM); r.disc(bx + bw * 0.5, g - bh * 0.5, 2 * u, f.beat.pulse > 0.5 ? BRIGHT : HOT); r.rect(bx + bw * 0.5 - 0.5 * u, g - bh, Math.max(1, u), bh * 0.4, DARK); }
    else { r.rect(0, 0.5 * N, N, 0.1 * N, COOL + DIM); for (let k = 0; k < 12; k++) r.rect(k * 0.09 * N + Math.sin(t + k) * u, 0.52 * N + (k % 3) * 2 * u, 4 * u, Math.max(1, u), LMID + DIM); for (const cx of [0.25, 0.75]) { r.rect(cx * N - u, 0.1 * N, 2 * u, 0.5 * N, DARK); r.rect(cx * N - 0.12 * N, 0.1 * N, 0.2 * N, 1.5 * u, DARK); r.rect(cx * N + 0.06 * N, 0.1 * N, Math.max(1, u), 0.12 * N + Math.sin(t * 0.5) * 0.03 * N, DARK); } for (let k = 0; k < 8; k++) r.rect((0.05 + k * 0.12) * N, g - (0.06 + 0.06 * (k % 3)) * N, 0.1 * N, 0.06 * N, k % 3 ? MID : HOT + DIM); }
    ground(r, N, g, u, LMID, DARK);
    for (let x = 0; x < N; x += 8 * u) r.rect(x, g + 4 * u, 4 * u, Math.max(1, u), MID); // the lane markings
    // the shrine, whole or broken, the statue and its beam
    const shx = 0.18 * N;
    if (w.broken <= 0) { for (const k of [-1, 1]) r.rect(shx + k * 0.035 * N - u, g - 0.12 * N, 2 * u, 0.12 * N, DARK); r.poly([[shx - 0.06 * N, g - 0.12 * N], [shx, g - 0.17 * N], [shx + 0.06 * N, g - 0.12 * N]], DARK); r.disc(shx, g - 0.07 * N, 2.5 * u, f.beat.pulse > 0.5 ? BRIGHT : HOT); }
    else { r.stroke(shx - 0.035 * N, g, shx - 0.05 * N, g - 0.08 * N, 2 * u, DARK); r.rect(shx + 0.03 * N, g - 0.04 * N, 2 * u, 0.04 * N, DARK); if (w.broken < 0.5) r.ring(shx, g - 0.08 * N, 0.1 * N * (1 - w.broken * 2), 2 * u, BRIGHT); }
    w.debris = w.debris.filter((p) => { // the pieces fall, bounce, come to rest and lie there until the shrine is raised again
      if (!p.rest) { p.vy += GRAV * N * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.y > g && p.vy > 0) { p.y = g; p.vy *= -0.4; p.vx *= 0.6; if (++p.b === 1) burst(w.dust, rnd, p.x, g, 3, N * 0.15, LMID, 0.3); if (p.b >= 3 && Math.abs(p.vy) <= 2 * u) { p.rest = true; p.vy = 0; } } }
      r.rect(p.x, p.y - p.sz, p.sz, p.sz, DARK);
      return w.broken > 0;
    });
    const stx = 0.92 * N, sty = g - 0.08 * N;
    r.rect(stx - 0.07 * N, sty, 0.14 * N, 0.08 * N, DARK); r.rect(stx - 0.06 * N, sty, 0.12 * N, Math.max(1, u), LMID);
    r.rect(stx - 0.03 * N, sty - 0.2 * N, 0.06 * N, 0.2 * N, MID); r.disc(stx, sty - 0.23 * N, 0.03 * N, MID);
    for (const k of [-1, 1]) r.stroke(stx + k * 0.03 * N, sty - 0.17 * N, stx + k * 0.05 * N, sty - 0.3 * N, 2.5 * u, MID);
    r.ring(stx, sty - 0.32 * N, 0.035 * N, 2 * u, w.beamT > 0 ? BRIGHT : f.beat.pulse > 0.5 ? COOL : COOL + DIM);
    for (const k of [-1, 1]) r.rect(stx + k * 0.012 * N - 0.5 * u, sty - 0.235 * N, Math.max(1, u), Math.max(1, u), w.eyes > 0 ? BRIGHT : HOT);
    if (w.beamX > 0.12) { // the beam from the statue's head sweeps its spot down the lane in 0.22 s; whoever it reaches falls
      const bx = Math.max(0.12, w.beamX - (dt * 0.74) / 0.22), ex = stx - 0.03 * N, ey = sty - 0.32 * N;
      for (const tr of w.troopers) if (!tr.dead && tr.x >= bx - 0.02 && tr.x <= w.beamX + 0.02) fell(tr);
      w.beamX = bx;
      r.stroke(ex, ey, bx * N, g, 5 * u, COOL); r.stroke(ex, ey, bx * N, g, 2 * u, BRIGHT);
      burst(w.dust, rnd, bx * N, g, Math.floor(60 * dt + rnd()), N * 0.2, BRIGHT, 0.3);
    }
    targets.push({ x: stx - 0.06 * N, y: sty - 0.36 * N, w: 0.12 * N, h: 0.36 * N });
    // the cables and the riders: a bead on a wire y(x), the horizontal acceleration (g y' - y' y'' x'^2) / (1 + y'^2) (the
    // second term keeps the energy on the curve: without it a rider lost a quarter of its speed by the far pole), a touch of friction
    for (const c of CABLES) { for (const px of [c[0], c[2]]) r.rect(px - u, px === c[0] ? c[1] : c[3], 2 * u, g - (px === c[0] ? c[1] : c[3]), DARK); let px = c[0], py = c[1]; for (let k = 1; k <= 24; k++) { const x = lerp(c[0], c[2], k / 24), y = cableY(c, x); r.line(px, py, x, y, DARK); px = x; py = y; } }
    w.riders = w.riders.filter((rd) => {
      const c = CABLES[rd.c];
      if (rd.off) { rd.vy += GRAV * N * dt; rd.x += rd.vx * dt; rd.y += rd.vy * dt; if (rd.y >= g) { burst(w.dust, rnd, rd.x, g, 6, N * 0.2, LMID, 0.3); return false; } walker(r, rd.x, rd.y, 0.09 * N, LMID, 0.9, 1, { cap: true }); return true; }
      const yp = cableSlope(c, rd.x), ypp = (-8 * c[4]) / (c[2] - c[0]) ** 2;
      rd.ax = (GRAV * N * yp - yp * ypp * rd.vx * rd.vx) / (1 + yp * yp); rd.vx += rd.ax * dt; rd.vx *= Math.exp(-0.12 * dt); rd.x += rd.vx * dt;
      const y = cableY(c, rd.x), lag = clamp(-rd.ax / (GRAV * N), -0.7, 0.7) * 0.07 * N; // the body hangs back under the acceleration
      if (rd.x >= c[2] - 2 * u) { rd.off = true; rd.x += lag; rd.y = y + 0.13 * N; rd.vy = rd.vx * yp; walker(r, rd.x, rd.y, 0.09 * N, LMID, 0.9, 1, { cap: true }); return true; } // let go at the far pole: the body falls on from where it hung
      r.rect(rd.x - 1.5 * u, y - 1.5 * u, 3 * u, 3 * u, LMID); r.line(rd.x, y, rd.x + lag, y + 0.04 * N, LMID);
      walker(r, rd.x + lag, y + 0.13 * N, 0.09 * N, LMID, 0.9, 1, { cap: true });
      targets.push({ x: rd.x + lag - 0.03 * N, y: y, w: 0.06 * N, h: 0.14 * N });
      return true;
    });
    // the troopers walk the lane and stop short of the statue; the fallen lie a moment and give up a soul
    for (const tr of w.troopers) {
      if (tr.dead) continue;
      const sp = tr.x < 0.78 ? dt * 0.04 * bps : 0;
      tr.x += sp; tr.ph += (sp * N) / (TH * 0.12); tr.fire -= dt;
      if (!sp && f.beat.on && rnd() < 0.3) { tr.fire = 0.1; w.tracers.push({ x0: tr.x * N + TH * 0.3, y0: g - TH * 0.55, x1: stx - 0.03 * N, y1: sty - 0.15 * N, t: 1 }); }
      if (!he.air && Math.abs(tr.x - he.x) < 0.05 && f.beat.on && f.beat.count % 2 === 0) fell(tr);
      shadow(r, tr.x * N, g + u, TH * 0.4, u);
      walker(r, tr.x * N, g, TH, MID, tr.ph, 1, { hat: true });
      if (tr.fire > 0) r.disc(tr.x * N + TH * 0.35, g - TH * 0.55, 1.5 * u, BRIGHT);
    }
    w.troopers = w.troopers.filter((tr) => !tr.dead);
    w.fallen = w.fallen.filter((fa) => { fa.t -= dt; r.rect(fa.x * N - TH * 0.3, g - 2 * u, TH * 0.6, 2 * u, MID); if (fa.t <= 0) { w.souls.push({ x: fa.x * N, y: g - 0.04 * N, vx: 0, vy: -0.3 * N, age: 0, trail: [] }); return false; } return true; });
    // the hero: the dash-jump, the landing crouch, the glow as the souls come home
    if (he.air) { he.vy -= GRAV * dt; he.x += he.vx * dt; he.y += he.vy * dt; if (he.y <= 0 && he.vy < 0) { he.y = 0; he.air = false; he.crouch = 0.15; burst(w.dust, rnd, he.x * N, g, 6, N * 0.2, LMID, 0.3); for (const tr of w.troopers) if (Math.abs(tr.x - he.x) < 0.06) fell(tr); } }
    else { const near = w.troopers.filter((tr) => tr.x > 0), tx = clamp(near.length ? near.reduce((m, tr) => m + tr.x, 0) / near.length - 0.12 : 0.45, 0.3, 0.7), dx = tx - he.x, mv = Math.sign(dx) * Math.min(Math.abs(dx), dt * 0.05 * bps); he.x += mv; he.ph += (Math.abs(mv) * N) / (H0 * 0.12); if (Math.abs(dx) > 0.01) he.dir = dx > 0 ? 1 : -1; }
    he.x = clamp(he.x, 0.1, 0.8);
    const hx = he.x * N, hy = g - he.y * N, hh = H0 * (he.crouch > 0 ? 0.85 : 1);
    shadow(r, hx, g + u, (H0 * 0.4) / (1 + he.y * 4), u);
    const J = walker(r, hx, hy, hh, FIG, he.air ? 0.8 : he.ph, he.dir, { coat: true });
    r.stroke(J.sx, J.sy + hh * 0.12, J.sx + he.dir * hh * 0.3, J.sy + hh * 0.08, 2 * u, DARK);
    if (he.glow > 0) r.ring(hx, hy - hh * 0.5, hh * 0.6 * (1 - he.glow * 2), 1.5 * u, COOL);
    for (let k = 0; k < w.taken % 9; k++) r.rect(hx + Math.cos(t * 2 + k * 0.8) * hh * 0.3 - 0.5 * u, hy - hh - 3 * u + Math.sin(t * 2 + k * 0.8) * u, Math.max(1, u), Math.max(1, u), COOL); // the souls gathered, circling the head
    targets.push({ x: hx - hh * 0.3, y: hy - hh, w: hh * 0.6, h: hh });
    // the souls: up and slowing, then the curve to the hero, faster as they close
    w.souls = w.souls.filter((so) => {
      so.age += dt;
      if (so.age < 0.7) so.vy = follow(so.vy, -0.05 * N, dt, 0.4);
      else { const dx = hx - so.x, dy = hy - hh * 0.5 - so.y, d = Math.hypot(dx, dy) || 1, sp = Math.min(1.1 * N, 0.2 * N + (so.age - 0.7) * 0.9 * N); so.vx = follow(so.vx, (dx / d) * sp, dt, 0.25); so.vy = follow(so.vy, (dy / d) * sp, dt, 0.25); if (d < 3 * u) { he.glow = 0.5; w.taken++; return false; } }
      so.x += so.vx * dt; so.y += so.vy * dt;
      so.trail.push([so.x, so.y]); if (so.trail.length > 5) so.trail.shift();
      so.trail.forEach(([tx, ty], i) => r.rect(tx, ty, Math.max(1, u), Math.max(1, u), i < 2 ? COOL + DIM : COOL));
      r.disc(so.x, so.y, 1.6 * u, COOL); r.rect(so.x - 0.5 * u, so.y - 0.5 * u, Math.max(1, u), Math.max(1, u), BRIGHT);
      return so.y > -0.1 * N;
    });
    w.tracers = tracers(W, w.tracers, LMID);
    w.dust = particles(W, w.dust, LMID);
  },
};

// ---------------------------------------------------------------------------------------------- saferoom
// Four survivors back to back in a dark street, two facing each way, their flashlight cones sweeping. The horde is
// out there in the dark and shows only where a cone, a muzzle flash or a lamp reaches it: the scene is drawn twice,
// the dark ambient and the lit layer, and the lit layer comes through a mask of the light. Kicks are the guns: a
// flash lights the muzzle and the nearest of them drops; a snare is a pipe bomb on an arc, blinking faster and
// faster, the horde turning to it, then it bursts in a flash. A drop is the rush: they come running from both sides
// in a real walking gait; the next drop brings the brute, who lifts a car and throws it on a parabola, a bounce,
// the dust. The safe room door with its bars waits at the end. The setting: the street, a hospital, the swamp.
const SETTING_W = { street: [3, 2, 2], hospital: [2, 2, 2], swamp: [1, 2, 2] };
const saferoom = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { setting: rollW(rnd, SETTING_W, bandOf(W.a)), lit: new Raster(N), mask: new Raster(N), horde: Array.from({ length: 4 }, (_, i) => ({ x: i < 2 ? 0.1 + i * 0.1 : 0.8 + (i - 2) * 0.1, run: false, ph: rnd() * TAU, down: 0, h: 0.2 + rnd() * 0.03 })),
      aim: [0, 0, 0, 0], bomb: null, flashT: 0, muzzle: [], tracers: [], sparks: [], dust: [], brute: null, car: { x: 0.84, y: 0, vx: 0, vy: 0, state: 'parked', bounces: 0 }, nextDrop: 0, rush: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.84 * N, bps = bpsOf(f), band = bandOf(W.a);
    if (w.lit.N !== N) { w.lit = new Raster(N); w.mask = new Raster(N); }
    const lit = w.lit, mask = w.mask, W2 = { ...W, r: lit };
    lit.fill(255); mask.fill(0);
    const SURV = [[0.44, -1], [0.47, -1], [0.53, 1], [0.56, 1]], HH = 0.2 * N;
    const alive = w.horde.filter((z) => z.down <= 0);
    const nearestZ = (dir) => alive.filter((z) => (dir < 0 ? z.x < 0.5 : z.x > 0.5)).sort((a, b) => Math.abs(a.x - 0.5) - Math.abs(b.x - 0.5))[0];
    for (const h of hits) {
      if (isLow(h)) { for (const dir of [-1, 1]) { const z = nearestZ(dir); const [sx] = SURV[dir < 0 ? 0 : 3], mx = sx * N + dir * 5 * u, my = g - HH * 0.6; w.muzzle.push({ x: mx, y: my, t: 0.08 }); if (z) { w.tracers.push({ x0: mx, y0: my, x1: z.x * N, y1: g - z.h * N * 0.6, t: 1 }); z.down = 4; } } s.shake = Math.max(s.shake, 0.15); }
      else if (h.kind === 'snare' && !w.bomb) { const dir = rnd() < 0.5 ? -1 : 1; w.bomb = { x: 0.5 + dir * 0.03, y: 0.12, vx: dir * (0.4 + 0.3 * h.strength), vy: 0.45, t: 2.4 }; }
    }
    if (f.section === 'drop') {
      if (w.nextDrop === 0 || band < 1) { w.rush = 1; for (let k = 0; k < 8 + band * 4; k++) w.horde.push({ x: rnd() < 0.5 ? -0.05 - rnd() * 0.3 : 1.05 + rnd() * 0.3, run: true, ph: rnd() * TAU, down: 0, h: 0.19 + rnd() * 0.04 }); }
      else if (!w.brute) { w.brute = { x: 1.15, ph: 0, state: 'walk', t: 0 }; w.car.state = 'parked'; w.car.x = 0.84; w.car.y = 0; }
      w.nextDrop = 1 - w.nextDrop;
    } else if (f.section === 'change') w.setting = rollW(rnd, SETTING_W, bandOf(W.a));
    if (w.horde.length > 26) { const k = w.horde.findIndex((z) => z.down > 0 || z.x < 0 || z.x > 1); if (k >= 0) w.horde.splice(k, 1); } // (never one standing in sight)
    w.flashT -= dt;
    // the ambient layer: the sky, the far shapes in the dark, the street, the safe room door and its lamp
    if (w.setting === 'street') { r.disc(0.15 * N, 0.14 * N, 0.05 * N, LMID + DIM); for (let k = 0; k < 7; k++) r.rect(k * 0.15 * N, (0.25 + 0.2 * hash(k, 51)) * N, 0.13 * N, N, DARK + DIM); }
    else if (w.setting === 'hospital') { r.rect(0, 0.12 * N, N, g - 0.12 * N, DARK + DIM); r.rect(0, 0, N, 0.12 * N, DARK); for (let k = 0; k < 4; k++) { const lx = (0.1 + k * 0.26) * N, on = hash(k, Math.floor(t * (6 + k))) < 0.25 + 0.5 * f.level; r.rect(lx - 0.03 * N, 0.11 * N, 0.06 * N, 2 * u, on ? BRIGHT : DARK); if (on) mask.poly([[lx - 0.03 * N, 0.12 * N], [lx + 0.03 * N, 0.12 * N], [lx + 0.11 * N, g + 4 * u], [lx - 0.11 * N, g + 4 * u]], 1); } }
    else { for (let k = 0; k < 8; k++) { const tx = k * 0.13 * N + 0.04 * N; r.rect(tx - 1.5 * u, 0.3 * N, 3 * u, g - 0.3 * N, DARK + DIM); r.disc(tx, 0.3 * N, 0.07 * N, DARK + DIM); } for (let k = 0; k < 9; k++) r.rect((hash(k, 53) + Math.sin(t * 0.7 + k) * 0.03) * N, (0.5 + 0.3 * hash(k, 54) + Math.sin(t * 1.3 + k * 2) * 0.02) * N, Math.max(1, u), Math.max(1, u), Math.sin(t * 3 + k * 1.9) > 0.3 ? COOL : COOL + DIM); }
    r.rect(0, g, N, N - g, DARK);
    if (w.setting === 'swamp') r.rect(0, g + 0.08 * N, N, N, COOL + DIM);
    const dx0 = 0.9 * N;
    r.rect(dx0, g - 0.26 * N, 0.09 * N, 0.26 * N, DARK + DIM); r.rect(dx0 + u, g - 0.25 * N, 0.09 * N - 2 * u, 0.25 * N, LMID + DIM);
    for (let k = 0; k < 4; k++) r.rect(dx0 + 2 * u + k * 2.5 * u, g - 0.25 * N, Math.max(1, u), 0.25 * N, DARK);
    r.rect(dx0 + 0.03 * N, g - 0.29 * N, 0.03 * N, 2 * u, f.beat.pulse > 0.5 ? HOT : HOT + DIM);
    mask.disc(dx0 + 0.045 * N, g - 0.2 * N, 0.14 * N, 1);
    // the lit layer: the ground's details, the car, the horde, the brute; each in its gait
    for (let x = 0; x < N; x += 7 * u) if (hash(x, 55) < 0.5) lit.rect(x, g + 3 * u + hash(x, 56) * 5 * u, 3 * u, Math.max(1, u), DARK + DIM);
    const car = w.car;
    if (car.state === 'flying') { car.vy -= GRAV * dt; car.x += car.vx * dt; car.y += car.vy * dt; if (car.y <= 0) { car.y = 0; car.vy = Math.abs(car.vy) * 0.3; car.vx *= 0.5; burst(w.dust, rnd, car.x * N, g, 14, N * 0.3, LMID, 0.5); s.shake = Math.max(s.shake, 0.6); if (++car.bounces > 1 || car.vy < 0.05) { car.state = 'landed'; car.vy = 0; car.vx = 0; } } }
    if (car.state !== 'carried') { const cx = car.x * N, cy = g - car.y * N; shadow(lit, cx, g + u, (0.12 * N) / (1 + car.y * 3), u); lit.rect(cx - 0.06 * N, cy - 0.05 * N, 0.12 * N, 0.03 * N, MID); lit.rect(cx - 0.04 * N, cy - 0.075 * N, 0.07 * N, 0.025 * N, MID); for (const k of [-0.04, 0.04]) lit.ring(cx + k * N, cy - 0.015 * N, 0.012 * N, Math.max(1, u), DARK); }
    for (const z of w.horde) {
      if (z.down > 0) { z.down -= dt; lit.rect(z.x * N - z.h * N * 0.3, g - 2 * u, z.h * N * 0.6, 2 * u, BLACK); continue; }
      const goal = w.bomb ? w.bomb.x : 0.5, dir = goal > z.x ? 1 : -1, stop = w.bomb ? 0.02 : 0.1, dist = Math.abs(goal - z.x);
      const step = dist > stop ? dt * 0.03 * bps * (z.run ? 4 : 1) : 0;
      z.x += dir * step; z.ph += step / (0.1 * z.h); // the legs in step with the ground, walking or running (a stride of the walker is fixed, so a runner's legs go faster)
      if (car.state === 'landed' && Math.abs(z.x - car.x) < 0.07) z.x -= dir * step; // the car blocks the way
      if (!step && !w.bomb && f.beat.on && f.beat.count % 4 === 0 && z.run) z.down = 4; // the survivors' hands do the rest
      const zx = z.x * N, h = z.h * N;
      shadow(lit, zx, g + u, h * 0.4, u);
      const J = walker(lit, zx, g, h, BLACK, z.ph, dir, { coat: !z.run });
      lit.stroke(J.sx, J.sy + h * 0.06, J.sx + dir * h * 0.32, J.sy + h * (z.run ? 0.02 : 0.1) + Math.sin(z.ph) * u, Math.max(1, 1.5 * u), BLACK);
      lit.rect(zx - h * 0.07, J.head - u, 2 * u, Math.max(1, u), HOT);
      targets.push({ x: zx - h * 0.3, y: g - h, w: h * 0.6, h });
    }
    w.horde = w.horde.filter((z) => z.down > -1 && z.x > -0.4 && z.x < 1.4);
    if (w.rush > 0 && (w.rush -= dt * 0.1) <= 0) w.rush = 0;
    const br = w.brute;
    if (br) { // in from the right, lifts the car over his head, throws it, leaves
      br.t += dt;
      const bh = 0.3 * N;
      if (br.state === 'walk') { const sp = dt * 0.035 * bps; br.x -= sp; br.ph += (sp * N) / (bh * 0.12); if (br.x <= car.x + 0.1) { br.state = 'lift'; br.t = 0; } }
      else if (br.state === 'lift') { car.state = 'carried'; if (br.t > 1.2) { br.state = 'throw'; br.t = 0; car.state = 'flying'; car.x = br.x - 0.05; car.y = 0.325; car.vx = -0.75; car.vy = 0.5; car.bounces = 0; } }
      else if (br.state === 'throw' && br.t > 1.5) { br.state = 'leave'; }
      else if (br.state === 'leave') { const sp = dt * 0.035 * bps; br.x += sp; br.ph += (sp * N) / (bh * 0.12); if (br.x > 1.3) w.brute = null; }
      const bx = br.x * N;
      shadow(lit, bx, g + u, bh * 0.5, u);
      const J = walker(lit, bx, g, bh, BLACK, br.ph, -1, { coat: true });
      lit.rect(bx - J.hw * 1.6, J.sy - bh * 0.04, J.hw * 3.2, bh * 0.14, BLACK);
      if (br.state === 'lift' || br.state === 'throw') { const lift = br.state === 'lift' ? ease(br.t / 1.2) : 1 - ease(br.t / 0.3), cy = g - bh * 0.6 - lift * bh * 0.55, cx = bx - 0.05 * N * lift; for (const k of [-1, 1]) lit.stroke(J.sx - (k > 0 ? 2 * J.hw : 0), J.sy, cx + k * 0.04 * N, cy, 2 * u, BLACK); if (br.state === 'lift') { lit.rect(cx - 0.06 * N, cy - 0.03 * N, 0.12 * N, 0.03 * N, MID); lit.rect(cx - 0.04 * N, cy - 0.055 * N, 0.07 * N, 0.025 * N, MID); } }
      targets.push({ x: bx - bh * 0.3, y: g - bh, w: bh * 0.6, h: bh });
    }
    // the survivors, their cones into the mask (toward the nearest of the horde when there is one), the muzzle light
    SURV.forEach(([sx, dir], i) => {
      const x = sx * N, z = nearestZ(dir), want = z ? Math.atan2(g - z.h * N * 0.5 - (g - HH * 0.6), z.x * N - x) : (dir > 0 ? 0 : Math.PI) + Math.sin(t * 0.6 + i * 1.7) * 0.3 * (dir > 0 ? 1 : -1) + (dir > 0 ? 0.1 : -0.1);
      w.aim[i] = followAngle(w.aim[i], want, dt, 0.3);
      const a = w.aim[i], ax = x + dir * 4 * u, ay = g - HH * 0.6, L = 0.5 * N, half = 0.2;
      mask.poly([[ax, ay], [ax + Math.cos(a - half) * L, ay + Math.sin(a - half) * L], [ax + Math.cos(a + half) * L, ay + Math.sin(a + half) * L]], 1);
      walker(r, x, g, HH, FIG, 0, dir, { cap: true, hatCol: DARK });
      r.stroke(ax - dir * 3 * u, ay, ax + dir * 2 * u, ay, 2 * u, LMID); r.rect(ax + dir * 2 * u - 0.5 * u, ay - 0.5 * u, Math.max(1, u), Math.max(1, u), BRIGHT);
    });
    targets.push({ x: 0.4 * N, y: g - HH, w: 0.2 * N, h: HH });
    w.muzzle = w.muzzle.filter((m) => { m.t -= dt; mask.disc(m.x, m.y, 0.1 * N, 1); r.disc(m.x, m.y, 2.5 * u, BRIGHT); return m.t > 0; });
    if (w.bomb) { // the pipe bomb: an arc, bounces, a blink that quickens, then the burst that lights everything near
      const b = w.bomb;
      b.t -= dt;
      if (b.y > 0 || b.vy > 0) { b.vy -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; if (b.y <= 0) { b.y = 0; b.vy = Math.abs(b.vy) * 0.4; b.vx *= 0.6; if (b.vy < 0.15) b.vy = 0; } }
      else { b.vx = follow(b.vx, 0, dt, 0.12); b.x += b.vx * dt; } // on the ground it slides to a stop
      const bx = b.x * N, by = g - b.y * N - u, on = Math.floor(t / lerp(0.5, 0.05, 1 - b.t / 2.4)) % 2 === 0;
      lit.rect(bx - 2 * u, by - u, 4 * u, 2 * u, MID); r.rect(bx - 0.5 * u, by - 2 * u, Math.max(1, u), Math.max(1, u), on ? HOT : HOT + DIM);
      if (on) mask.disc(bx, by, 4 * u, 1);
      if (b.t <= 0) { w.flashT = 0.15; w.flashAt = [bx, by]; burst(w.sparks, rnd, bx, by, 30, N * 0.5, BRIGHT, 0.6); s.shake = Math.max(s.shake, 0.8); for (const z of w.horde) if (Math.abs(z.x - b.x) < 0.14) z.down = 4; w.bomb = null; }
    }
    if (w.flashT > 0) mask.disc(w.flashAt[0], w.flashAt[1], 0.3 * N, 1);
    w.dust = particles(W2, w.dust, LMID);
    // the composite: where the light falls, the lit layer shows; the lit ground is paler, the beam shows faintly in the air
    const rb = r.buf, lb = lit.buf, mb = mask.buf, gi = Math.round(g) * N;
    for (let i = 0; i < N * N; i++) if (mb[i]) rb[i] = lb[i] !== 255 ? lb[i] : i >= gi ? MID : rb[i] === BG ? DARK + DIM : rb[i] === DARK + DIM ? DARK : rb[i];
    w.sparks = particles(W, w.sparks, BRIGHT);
    w.tracers = tracers(W, w.tracers, LMID, 8);
  },
};

// ---------------------------------------------------------------------------------------------- rocketarena
// A physics playground: an arena of ramps, pillars and pipes, and one figure that gets about by blowing itself up. A
// kick is a rocket at the ground behind the feet: the impulse points from the blast to the body, then a true
// parabola with a little air control, and a crouch on landing; land fast on a ramp and it surfs, sliding along the
// surface with gravity pulling along the slope until it runs off the end. A snare is a sticky dropped at the feet:
// it blinks, then goes off and launches whoever is still near it. Smoke trails hang behind every flight. A drop is a
// chain of jumps across the whole map. The map: an arena, a spire, the pipes.
const MAP2_W = { arena: [3, 2, 1], spire: [1, 2, 3], pipes: [2, 2, 2] };
// surfaces as [x0, y0, x1, y1] in units (y down), plus what to draw them as
const MAPS2 = {
  arena: [[0.1, 0.86, 0.3, 0.7, 'ramp'], [0.3, 0.7, 0.42, 0.7, 'ramp'], [0.42, 0.7, 0.55, 0.86, 'ramp'], [0.64, 0.6, 0.76, 0.6, 'pillar'], [0.8, 0.86, 0.98, 0.66, 'ramp']],
  spire: [[0, 0.86, 0.2, 0.74, 'ramp'], [0.8, 0.74, 1, 0.86, 'ramp'], [0.45, 0.2, 0.55, 0.2, 'pillar'], [0.3, 0.7, 0.45, 0.7, 'ledge'], [0.55, 0.55, 0.7, 0.55, 'ledge'], [0.3, 0.42, 0.45, 0.42, 'ledge'], [0.55, 0.3, 0.7, 0.3, 'ledge']],
  pipes: [[0.1, 0.72, 0.4, 0.72, 'pipe'], [0.55, 0.6, 0.9, 0.6, 'pipe'], [0.2, 0.45, 0.5, 0.45, 'pipe'], [0.6, 0.86, 0.8, 0.76, 'ramp'], [0.04, 0.6, 0.12, 0.6, 'pillar']],
};
const rocketarena = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { map: rollW(rnd, MAP2_W, bandOf(W.a)), fig: { x: 0.2 * N, y: 0.86 * N, vx: 0, vy: 0, state: 'ground', seg: null, want: 1, crouch: 0, ph: 0, aimT: 0, ax: 0, ay: 0 }, stickies: [], smoke: [], sparks: [], rings: [], tracers: [], chain: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.86 * N, H0 = 0.14 * N, q = w.fig, segs = MAPS2[w.map];
    const surfaces = (x) => { const out = [[g, 0, null]]; for (const sg of segs) { const x0 = sg[0] * N, x1 = sg[2] * N; if (x >= x0 && x <= x1) out.push([lerp(sg[1], sg[3], (x - x0) / (x1 - x0)) * N, (sg[3] - sg[1]) / (sg[2] - sg[0]), sg]); } return out; };
    const below = (x, y) => { let b = g; for (const sf of surfaces(x)) if (sf[0] >= y - 2 * u && sf[0] < b) b = sf[0]; return b; }; // the first surface under (x, y)
    const blast = (ex, ey, v, fired) => { // the impulse from the blast point to the body, added to what the figure already has, weaker with distance
      const dx = q.x - ex, dy = q.y - H0 * 0.45 - ey, d = Math.hypot(dx, dy) || 1, k = v / (1 + Math.max(0, d - H0 * 0.5) / (0.06 * N));
      if (fired || d < 0.3 * N) { // a sticky across the map does not launch anyone
        q.vx += (dx / d) * k; q.vy += (dy / d) * k; q.state = 'air';
        const sp = Math.hypot(q.vx, q.vy), cap = 1.5 * N;
        if (sp > cap) { q.vx *= cap / sp; q.vy *= cap / sp; }
      }
      w.rings.push({ x: ex, y: ey, t: 0.3 }); burst(w.sparks, rnd, ex, ey, 8, N * 0.35, HOT, 0.4);
      for (let k2 = 0; k2 < 6; k2++) w.smoke.push({ x: ex, y: ey, vx: (rnd() - 0.5) * 10 * u, vy: -rnd() * 12 * u, life: 0.9 });
      if (fired) { q.aimT = 0.3; q.ax = ex; q.ay = ey; w.tracers.push({ x0: q.x, y0: q.y - H0 * 0.5, x1: ex, y1: ey, t: 1 }); }
      s.shake = Math.max(s.shake, 0.25);
    };
    // the rocket goes off where it hits: the surface under the feet (not a ledge overhead), in the air the one below, far or near
    const rocketJump = (k) => { const air = q.state === 'air', ex = q.x - q.want * 0.025 * N, ey = below(ex, q.y); if (!air || q.y > 0.3 * N) blast(ex, ey, (air ? 0.5 : 0.85 + 0.45 * k) * N, true); };
    for (const h of hits) {
      if (isLow(h)) rocketJump(h.strength);
      else if (h.kind === 'snare' && w.stickies.length < 3) w.stickies.push({ x: q.x, y: q.y, vy: 0, floor: below(q.x, q.y), t: 0.55, k: h.strength }); // dropped at the feet, it falls to what is under them
      else if (h.kind === 'hat' && q.state !== 'air') q.want = -q.want;
    }
    if (f.section === 'drop') { w.chain = 6; if (q.state !== 'air') { w.chain--; rocketJump(0.9); } } // the chain starts at once from the ground
    else if (f.section === 'change') { w.map = rollW(rnd, MAP2_W, bandOf(W.a)); q.state = 'air'; }
    q.crouch -= dt; q.aimT -= dt;
    if (q.x < 0.1 * N) q.want = 1; else if (q.x > 0.9 * N) q.want = -1;
    // the flight, the landing, the surf
    const prevY = q.y;
    if (q.state === 'air') {
      q.vy += GRAV * N * dt; q.vx += q.want * 0.25 * N * dt; q.vx *= Math.exp(-0.1 * dt);
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.vy > 0) { let best = null; for (const sf of surfaces(q.x)) if (prevY <= sf[0] + 1 && q.y >= sf[0] && (!best || sf[0] < best[0])) best = sf; if (best) { q.y = best[0]; if (Math.abs(best[1]) > 0.25 && Math.hypot(q.vx, q.vy) > 0.3 * N) { q.state = 'surf'; q.seg = best[2]; } else { q.state = 'ground'; q.seg = best[2]; q.vy = 0; if (Math.abs(best[1]) > 0.25) q.vx = 0; q.crouch = 0.18; burst(w.smoke, rnd, q.x, q.y, 3, N * 0.1, LMID + DIM, 0.4); if (w.chain > 0) { w.chain--; rocketJump(0.9); } } } }
      if (rnd() < 24 * dt) w.smoke.push({ x: q.x - q.vx * dt, y: q.y - H0 * 0.4, vx: 0, vy: -2 * u, life: 0.6 }); // the trail, so many a second
    } else if (q.state === 'surf') {
      const sg = q.seg, L = Math.hypot((sg[2] - sg[0]) * N, (sg[3] - sg[1]) * N), tx = ((sg[2] - sg[0]) * N) / L, ty = ((sg[3] - sg[1]) * N) / L;
      let vt = q.vx * tx + q.vy * ty;
      vt += GRAV * N * ty * dt; // gravity along the slope
      q.vx = vt * tx; q.vy = vt * ty; q.x += q.vx * dt;
      if (q.x < sg[0] * N || q.x > sg[2] * N) q.state = 'air';
      else { q.y = lerp(sg[1], sg[3], (q.x - sg[0] * N) / ((sg[2] - sg[0]) * N)) * N; if (Math.abs(vt) < 0.04 * N) { q.state = 'ground'; q.vx = q.vy = 0; } }
      if (rnd() < 15 * dt) w.smoke.push({ x: q.x, y: q.y, vx: -q.vx * 0.2, vy: -3 * u, life: 0.4 });
    } else { // standing, or sliding to a stop on the level after a landing or a surf (the speed along the ground is kept, not dropped);
      // the ground may have gone (a new map, the end of a ledge); the foot of a ramp met on the way is ridden up
      if (q.vx) {
        q.vx = Math.abs(q.vx) < 0.02 * N ? 0 : q.vx * Math.exp(-dt * 8); q.x += q.vx * dt;
        const ramp = surfaces(q.x).find((sf) => sf[2] && Math.abs(sf[1]) > 0.25 && sf[0] < q.y - 0.5 && sf[0] >= q.y - 1.5 - Math.abs(q.vx * dt * sf[1]));
        if (ramp) { q.state = 'surf'; q.seg = ramp[2]; q.y = ramp[0]; q.vy = 0; }
      }
      const under = surfaces(q.x).find((sf) => Math.abs(sf[0] - q.y) < 1.5);
      if (!under) q.state = 'air';
    }
    for (const sg of segs) if (sg[4] === 'pillar' && q.x > sg[0] * N - 2 * u && q.x < sg[2] * N + 2 * u && q.y > sg[1] * N + 1) { q.x = q.vx > 0 ? sg[0] * N - 2 * u : sg[2] * N + 2 * u; q.vx *= -0.2; } // the pillar's sides
    if (q.x < 2 * u) { q.x = 2 * u; q.vx = Math.abs(q.vx) * 0.5; } else if (q.x > N - 2 * u) { q.x = N - 2 * u; q.vx = -Math.abs(q.vx) * 0.5; }
    // the stickies: a blink that quickens, then the launch (weaker the farther the figure got)
    w.stickies = w.stickies.filter((st) => { st.t -= dt; st.vy += GRAV * N * dt; st.y = Math.min(st.floor, st.y + st.vy * dt); if (st.t <= 0) { blast(st.x, st.y, (1.05 + 0.35 * st.k) * N, false); return false; } return true; });
    // the arena
    r.rect(0, 0, N, g, BG);
    for (let y = 0.1 * N; y < g; y += 0.12 * N) for (let x = 0; x < N; x += 0.12 * N) if (hash(x, y) < 0.5) r.rect(x, y, 2 * u, 2 * u, DARK + DIM); // the far wall's studs
    ground(r, N, g, u, LMID, DARK);
    for (const sg of segs) {
      const x0 = sg[0] * N, y0 = sg[1] * N, x1 = sg[2] * N, y1 = sg[3] * N;
      if (sg[4] === 'ramp') { r.poly([[x0, y0], [x1, y1], [x1, g], [x0, g]], DARK); r.stroke(x0, y0, x1, y1, Math.max(1, 1.5 * u), LMID); }
      else if (sg[4] === 'pillar') { r.rect(x0, y0, x1 - x0, g - y0, DARK); r.rect(x0, y0, x1 - x0, Math.max(1, u), LMID); for (let y = y0 + 4 * u; y < g; y += 5 * u) r.rect(x0 + u, y, x1 - x0 - 2 * u, Math.max(1, u), DARK + DIM); }
      else if (sg[4] === 'ledge') { r.rect(x0, y0, x1 - x0, 3 * u, MID); r.rect(x0, y0, x1 - x0, Math.max(1, u), LMID); r.rect(x0 < 0.5 * N ? x1 - 2 * u : x0, y0 + 3 * u, 2 * u, 4 * u, DARK); }
      else { r.stroke(x0, y0 + 2 * u, x1, y1 + 2 * u, 5 * u, MID); r.rect(x0, y0 + 0.5 * u, x1 - x0, Math.max(1, u), LMID); for (const px of [x0 + 2 * u, x1 - 3 * u]) r.rect(px, y0 - u, 2 * u, 7 * u, DARK); }
    }
    // the stickies, the smoke, the rings, the figure with its launcher, its shadow on whatever is under it
    for (const st of w.stickies) { const on = st.t < 0.15 || Math.floor(t * (6 + (0.55 - st.t) * 30)) % 2 === 0; r.disc(st.x, st.y - 1.5 * u, 1.8 * u, DARK); for (let k = 0; k < 4; k++) r.rect(st.x + Math.cos(k * 1.57 + 0.78) * 2.5 * u - 0.5 * u, st.y - 1.5 * u + Math.sin(k * 1.57 + 0.78) * 2.5 * u - 0.5 * u, Math.max(1, u), Math.max(1, u), on ? BRIGHT : HOT); }
    w.smoke = smoke(W, w.smoke);
    w.rings = w.rings.filter((rg) => { rg.t -= dt; r.ring(rg.x, rg.y, (0.3 - rg.t) * 0.3 * N, 2 * u, rg.t > 0.2 ? BRIGHT : HOT); return rg.t > 0; });
    const under = Math.min(...surfaces(q.x).filter((sf) => sf[0] >= q.y - 1).map((sf) => sf[0]));
    if (Number.isFinite(under)) shadow(r, q.x, under + u, (H0 * 0.4) / (1 + (under - q.y) / (0.15 * N)), u);
    const hh = H0 * (q.crouch > 0 ? 0.82 : 1), dir = q.vx !== 0 ? Math.sign(q.vx) : q.want, tilt = q.state === 'surf' ? Math.sign(q.vx) * 0.3 : 0;
    const J = walker(r, q.x + tilt * hh * 0.1, q.y, hh, FIG, q.state === 'ground' ? q.ph : 0.7, dir, { hat: true, hatCol: DARK });
    const la = q.aimT > 0 ? Math.atan2(q.ay - (J.sy + hh * 0.1), q.ax - J.sx) : dir > 0 ? 0.9 : Math.PI - 0.9;
    r.stroke(J.sx, J.sy + hh * 0.1, J.sx + Math.cos(la) * hh * 0.4, J.sy + hh * 0.1 + Math.sin(la) * hh * 0.4, 3 * u, DARK);
    r.disc(J.sx + Math.cos(la) * hh * 0.4, J.sy + hh * 0.1 + Math.sin(la) * hh * 0.4, 1.8 * u, q.aimT > 0.2 ? BRIGHT : MID);
    targets.push({ x: q.x - hh * 0.3, y: q.y - hh, w: hh * 0.6, h: hh });
    w.sparks = particles(W, w.sparks, HOT);
    w.tracers = tracers(W, w.tracers, LMID, 10);
    if (w.chain > 0) for (let k = 0; k < w.chain; k++) r.rect(0.03 * N + k * 3 * u, 0.04 * N, 2 * u, 2 * u, HOT); // the jumps left in the chain
  },
};

// ---------------------------------------------------------------------------------------------- engineernest
// An engineer's nest. A sentry goes up in stages, a wrench hit a beat (sparks, the next part appears): the tripod, the
// body, the barrel; it tracks the nearest intruder through the doorway and fires on the hats; every section it is
// upgraded, bigger, with a second barrel, then a rocket pod that fires on the kicks. A dispenser hums beside it with a
// glowing dial that fills with the level and trickles light up to whoever stands near; a teleporter pair: a figure
// steps onto the entrance pad, flashes out, and flashes in on the exit, the rings spinning as they recharge. A drop:
// a sapper is stuck on the sentry, it sparks and droops, the engineer runs over and knocks it off, then rebuilds it.
// The nest: a workshop, a rooftop, a tunnel.
const NEST_W = { workshop: [3, 2, 1], rooftop: [2, 2, 2], tunnel: [1, 2, 3] };
const engineernest = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { nest: rollW(rnd, NEST_W, bandOf(W.a)), stage: 0, level: 1, aim: Math.PI * 0.1, eng: { x: 0.3, tx: 0.33, ph: 0, dir: 1, swing: 0 }, foes: [], tracers: [], sparks: [], rockets: [], glow: [], sapped: 0, sapHits: 0, tp: { charge: 1, spin: 0, mate: null, flash: [0, 0] }, charge: 0, idleT: 0, fire: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.84 * N, bps = bpsOf(f), band = bandOf(W.a), sx = 0.42 * N, dx = 0.2 * N, pads = [0.08 * N, 0.74 * N], eng = w.eng, H0 = 0.14 * N, lvl = w.level;
    const built = w.stage >= 4 && w.sapped <= 0, pivot = [sx, g - (7 + lvl) * u];
    const nearestFoe = () => { let best = null, bd = 0.45 * N; for (const fo of w.foes) if (!fo.down) { const d = Math.abs(fo.x * N - sx); if (d < bd) { bd = d; best = fo; } } return best; };
    const hitSentry = () => { eng.swing = 1; burst(w.sparks, rnd, sx + (rnd() - 0.5) * 4 * u, g - 10 * u, 6, N * 0.3, BRIGHT, 0.35); };
    for (const h of hits) {
      if (h.kind === 'hat' || h.kind === 'perc') { const fo = built && nearestFoe(); if (fo) { w.fire = 0.08; const mx = pivot[0] + Math.cos(w.aim) * 9 * u, my = pivot[1] + Math.sin(w.aim) * 9 * u; w.tracers.push({ x0: mx, y0: my, x1: fo.x * N + (rnd() - 0.5) * 2 * u, y1: g - H0 * 0.5, t: 1 }); fo.flash = 0.15; if (--fo.hp <= 0) fo.down = 1.2; } }
      else if (isLow(h) && built && lvl >= 3) { const fo = nearestFoe(); if (fo) w.rockets.push({ x: sx, y: pivot[1] - 6 * u, tx: fo.x * N, ty: g - H0 * 0.4, t: 0 }); }
    }
    if (f.section === 'drop' && w.sapped <= 0 && w.stage >= 4) { w.sapped = 4; w.sapHits = 0; }
    else if (f.section === 'change') { w.nest = rollW(rnd, NEST_W, band); if (w.stage >= 4 && lvl < 3 && w.sapped <= 0) { w.level++; burst(w.sparks, rnd, sx, g - 12 * u, 14, N * 0.3, BRIGHT, 0.5); } }
    w.sapped -= dt; w.fire -= dt; eng.swing -= dt * 4; w.idleT -= dt;
    w.charge = follow(w.charge, clamp(0.3 + f.level * 0.5 + lvl * 0.1), dt, 0.5);
    // the engineer: to the sentry while there is building or a sapper to knock off, else between the dispenser and the sentry
    const busy = w.stage < 4 || w.sapped > 0;
    if (busy) eng.tx = 0.42 - 0.07;
    else if (w.idleT <= 0) { w.idleT = 3 + rnd() * 3; eng.tx = rnd() < 0.5 ? 0.2 + 0.06 : 0.42 - 0.08; }
    const ex = eng.tx - eng.x, mv = Math.sign(ex) * Math.min(Math.abs(ex), dt * 0.06 * bps * (busy ? 1.6 : 1));
    eng.x += mv; eng.ph += (Math.abs(mv) * N) / (H0 * 0.12);
    eng.dir = Math.abs(ex) > 0.005 ? Math.sign(ex) : 1;
    const atSentry = Math.abs(eng.x - 0.35) < 0.02;
    if (f.beat.on && atSentry) {
      if (w.stage < 4) { w.stage++; hitSentry(); }
      else if (w.sapped > 0) { hitSentry(); if (++w.sapHits >= 3) { w.sapped = 0; w.stage = 1; burst(w.sparks, rnd, sx + 4 * u, g - 12 * u, 10, N * 0.4, HOT, 0.5); } }
    }
    // the intruders: in through the doorway, back out when they have seen enough; down when shot
    if (f.beat.on && f.beat.count % 4 === 0 && w.foes.length < 2 + band) w.foes.push({ x: 0.93, kind: pick(rnd, ['scout', 'spy', 'soldier']), hp: 2, flash: 0, down: 0, ph: rnd() * TAU, dir: -1, turn: 0.52 + rnd() * 0.1 });
    w.foes = w.foes.filter((fo) => {
      fo.flash -= dt;
      if (fo.down) { fo.down -= dt; r.rect(fo.x * N - H0 * 0.3, g - 2 * u, H0 * 0.6, 2 * u, HOT + DIM); return fo.down > 0; }
      const sp = dt * 0.07 * bps * (fo.kind === 'scout' ? 1.4 : 1);
      if (fo.dir < 0 && fo.x < fo.turn) fo.dir = 1;
      fo.x += fo.dir * sp; fo.ph += (sp * N) / (H0 * 0.12);
      return fo.x < 0.98;
    });
    // the nest, by kind: the back wall, the shelves, the doorway on the right
    if (w.nest === 'workshop') { r.rect(0, 0.1 * N, N, g - 0.1 * N, MID); for (const sy of [0.3, 0.45]) { r.rect(0.05 * N, sy * N, 0.5 * N, 2 * u, DARK); for (let k = 0; k < 5; k++) if (hash(k, sy * 10) < 0.7) r.rect((0.07 + k * 0.1) * N, sy * N - 0.05 * N, 0.06 * N, 0.05 * N, k % 2 ? LMID : DARK); } r.rect(0.6 * N, 0.2 * N, 0.2 * N, 0.15 * N, LMID); r.rect(0.62 * N, 0.22 * N, 0.16 * N, 0.11 * N, f.level > 0.3 ? BRIGHT : LMID + DIM); }
    else if (w.nest === 'rooftop') { for (let k = 0; k < 6; k++) r.rect(k * 0.17 * N, (0.3 + 0.2 * hash(k, 61)) * N, 0.15 * N, N, DARK + DIM); r.rect(0, 0.5 * N, N, g - 0.5 * N, MID); r.rect(0, 0.5 * N, N, 2 * u, LMID); for (const vx of [0.55, 0.62]) r.rect(vx * N, 0.42 * N, 0.05 * N, 0.08 * N, DARK); }
    else { r.rect(0, 0.08 * N, N, g - 0.08 * N, DARK); for (let x = 0; x < N; x += 0.1 * N) r.ring(x + 0.05 * N, 0.08 * N, 0.5 * N, 2 * u, DARK + DIM, 1); for (let k = 0; k < 3; k++) r.rect((0.1 + k * 0.3) * N, 0.08 * N, Math.max(1, u), g - 0.08 * N, MID); r.rect(0, 0.3 * N, N, 1.5 * u, MID); for (let k = 0; k < 4; k++) r.rect((0.1 + k * 0.25) * N, 0.31 * N, 0.08 * N, 1.5 * u, f.beat.pulse > 0.5 ? BRIGHT : LMID); }
    r.rect(0.88 * N, g - 0.3 * N, 0.1 * N, 0.3 * N, DARK); r.rect(0.89 * N, g - 0.29 * N, 0.09 * N, 0.29 * N, BG); // the doorway
    ground(r, N, g, u, LMID, DARK);
    // the teleporter pads: the rings spin as they recharge; a teammate walks onto the entrance and out of the exit
    const tp = w.tp;
    tp.charge = Math.min(1, tp.charge + dt / 3); tp.spin += dt * bps * 2 * tp.charge;
    pads.forEach((px, i) => { r.ring(px, g, 6 * u, 2 * u, DARK, 0.35); r.ring(px, g, 6 * u, Math.max(1, u), tp.charge >= 1 ? COOL : COOL + DIM, 0.35); for (let k = 0; k < 3; k++) r.rect(px + Math.cos(tp.spin + (k * TAU) / 3) * 6 * u - u, g + Math.sin(tp.spin + (k * TAU) / 3) * 2 * u - u, 2 * u, 2 * u, BRIGHT); if (tp.flash[i] > 0) { tp.flash[i] -= dt; r.ring(px, g - 5 * u, (0.25 - tp.flash[i]) * 0.3 * N, 2 * u, BRIGHT, 1.5); } });
    if (!tp.mate && f.beat.on && f.beat.count % 8 === 0) tp.mate = { x: -0.04, kind: pick(rnd, CLASS_KEYS), ph: 0, gone: 0 };
    if (tp.mate) {
      const m = tp.mate;
      if (m.gone > 0) { m.gone -= dt; if (m.gone <= 0) { m.x = pads[1] / N; tp.flash[1] = 0.25; } }
      else { // up to the entrance pad (whatever the frame rate, it stops on it), a wait there until it is charged, then out of the exit
        const p0 = pads[0] / N, sp = m.x < p0 ? Math.min(dt * 0.06 * bps, p0 - m.x) : m.x > 0.5 ? dt * 0.06 * bps : 0;
        m.x += sp; m.ph += (sp * N) / (H0 * 0.12);
        if (m.x >= p0 && m.x < 0.5 && tp.charge >= 1) { m.gone = 0.35; tp.charge = 0; tp.flash[0] = 0.25; m.x = -1; }
        else { shadow(r, m.x * N, g + u, H0 * 0.35, u); drawClass(r, m.kind, m.x * N, g, H0, FIG, m.ph, 1, u); }
        if (m.x > 0.97) tp.mate = null;
      }
    }
    // the dispenser: a box with the dial, the light trickling up to whoever is near
    r.rect(dx - 4 * u, g - 12 * u, 8 * u, 12 * u, MID); r.rect(dx - 4 * u, g - 12 * u, 8 * u, Math.max(1, u), LMID); r.rect(dx - 0.5 * u, g - 15 * u, Math.max(1, u), 3 * u, DARK); r.rect(dx - u, g - 16 * u, 2 * u, Math.max(1, u), f.beat.pulse > 0.5 ? COOL : COOL + DIM);
    r.ring(dx, g - 7 * u, 2.5 * u, 1.5 * u, DARK);
    for (let k = 0, n = Math.ceil(2.5 * u * TAU); k < n * w.charge; k++) { const a = (k / n) * TAU - Math.PI / 2; r.rect(dx + Math.cos(a) * 2.5 * u - 0.5 * u, g - 7 * u + Math.sin(a) * 2.5 * u - 0.5 * u, Math.max(1, u), Math.max(1, u), COOL); }
    if (Math.abs(eng.x * N - dx) < 0.1 * N && rnd() < dt * 6 * w.charge) w.glow.push({ x: dx + (rnd() - 0.5) * 6 * u, y: g - 12 * u, vy: -8 * u, life: 1 });
    w.glow = w.glow.filter((p) => { p.vy = follow(p.vy, -1 * u, dt, 0.6); p.y += p.vy * dt; p.x = follow(p.x, eng.x * N, dt, 0.8); p.life -= dt; r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), COOL); return p.life > 0; });
    // the sentry, by stage and level; sapped it droops, its light out, the sapper's own light blinking on it
    const sap = w.sapped > 0, fo = built ? nearestFoe() : null;
    const wantAim = sap ? 0.7 : fo ? Math.atan2(g - H0 * 0.5 - pivot[1], fo.x * N - pivot[0]) : Math.sin(t * 0.7) * 0.3 + 0.1;
    w.aim = followAngle(w.aim, wantAim, dt, sap ? 0.8 : 0.2);
    if (w.stage === 0) { r.rect(sx - 5 * u, g - 4 * u, 10 * u, 4 * u, HOT + DIM); r.rect(sx - u, g - 5 * u, 2 * u, Math.max(1, u), LMID); }
    if (w.stage >= 1) for (const k of [-5, 1, 5]) r.stroke(sx, g - 6 * u, sx + k * u, g, 1.5 * u, DARK);
    if (w.stage >= 2) { const bw = (8 + lvl * 2) * u, bh = (6 + lvl) * u, by = g - 6 * u - bh + (sap ? 1.5 * u : 0); r.rect(sx - bw / 2, by, bw, bh, MID); r.rect(sx - bw / 2, by, bw, Math.max(1, u), LMID); r.rect(sx + bw / 2 - 2 * u, by + u, Math.max(1, u), Math.max(1, u), sap ? DARK : f.beat.pulse > 0.5 ? BRIGHT : HOT); if (lvl >= 3 && w.stage >= 3) { r.rect(sx - 3 * u, by - 5 * u, 7 * u, 5 * u, DARK); for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) r.rect(sx - 2 * u + k * 3 * u, by - 4 * u + j * 2 * u, Math.max(1, u), Math.max(1, u), w.fire > 0 ? HOT : BLACK); } if (sap) { r.rect(sx - bw / 2 - 3 * u, by + 2 * u, 3 * u, 4 * u, DARK); r.rect(sx - bw / 2 - 2 * u, by + 3 * u, Math.max(1, u), Math.max(1, u), Math.floor(t * 8) % 2 ? BRIGHT : HOT); if (rnd() < dt * 15) burst(w.sparks, rnd, sx + (rnd() - 0.5) * bw, by + rnd() * bh, 1, N * 0.2, COOL, 0.25); } }
    if (w.stage >= 3) { const len = (8 + lvl) * u, ca = Math.cos(w.aim), sa = Math.sin(w.aim); for (const off of lvl >= 2 ? [-1.5, 1.5] : [0]) r.stroke(pivot[0] - sa * off * u, pivot[1] + ca * off * u, pivot[0] + ca * len - sa * off * u, pivot[1] + sa * len + ca * off * u, 2 * u, w.fire > 0 ? LMID : DARK); if (w.fire > 0) r.disc(pivot[0] + ca * (len + u), pivot[1] + sa * (len + u), 2 * u, BRIGHT); }
    targets.push({ x: sx - 8 * u, y: g - 20 * u, w: 16 * u, h: 20 * u });
    w.rockets = w.rockets.filter((rk) => { rk.t += dt * 2.2; const k = Math.min(1, rk.t), x = lerp(rk.x, rk.tx, k), y = lerp(rk.y, rk.ty, k) - Math.sin(k * Math.PI) * 0.08 * N; r.rect(x - u, y - u, 2 * u, 2 * u, BRIGHT); w.sparks.push({ x, y, vx: 0, vy: -2 * u, life: 0.3, c: LMID + DIM }); if (k >= 1) { burst(w.sparks, rnd, x, y, 14, N * 0.4, HOT, 0.5); s.shake = Math.max(s.shake, 0.3); for (const q of w.foes) if (!q.down && Math.abs(q.x * N - x) < 0.08 * N) { q.hp = 0; q.down = 1.2; } return false; } return true; });
    // the intruders and the engineer with the wrench
    for (const q of w.foes) if (!q.down) { shadow(r, q.x * N, g + u, H0 * 0.35, u); drawClass(r, q.kind, q.x * N, g, H0, q.flash > 0 ? BRIGHT : HOT, q.ph, q.dir, u); targets.push({ x: q.x * N - H0 * 0.25, y: g - H0, w: H0 * 0.5, h: H0 }); }
    shadow(r, eng.x * N, g + u, H0 * 0.35, u);
    const J = walker(r, eng.x * N, g, H0 * 0.9, FIG, eng.ph, eng.dir, { hat: true, hatCol: LMID }), hx = J.sx, hy = J.sy + H0 * 0.12;
    const wa = eng.swing > 0 ? lerp(-2.2, 0.5, ease(1 - eng.swing)) : -0.6, ang = eng.dir > 0 ? wa : Math.PI - wa, wx = hx + Math.cos(ang) * H0 * 0.3, wy = hy + Math.sin(ang) * H0 * 0.3;
    r.stroke(hx, hy, wx, wy, 1.5 * u, LMID); r.rect(wx - 1.5 * u, wy - 1.5 * u, 3 * u, Math.max(1, u), LMID); r.rect(wx - 1.5 * u, wy - 1.5 * u, Math.max(1, u), 2 * u, LMID); r.rect(wx + 0.5 * u, wy - 1.5 * u, Math.max(1, u), 2 * u, LMID);
    targets.push({ x: eng.x * N - H0 * 0.25, y: g - H0, w: H0 * 0.5, h: H0 });
    w.sparks = particles(W, w.sparks, BRIGHT);
    w.tracers = tracers(W, w.tracers, LMID, 8);
  },
};

const WORLDS = { payload, controlpoint, testchamber, citadel, researchlab, defusal, lanes, heroshooter, saferoom, rocketarena, engineernest };

registerFamily('shooter', WORLD_DEFS, WORLDS);
export const SHOOTER_STYLE = makeMixStyle('SHOOTER', ['shooter']);
