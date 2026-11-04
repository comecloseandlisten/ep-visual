// TE stories: a flat 2D figure in three inks acting out a story from story.js, in a place drawn here, under the
// weather and at the time of day the story asks for, in the flat manner of teenage engineering's posters. The
// picture has no words; the panel shows the current line. When a story ends, main.js grows the next one over it.
import { lerp } from './pixels.js';
import { MOOD_VA, makeStory } from './story.js';

const TAU = Math.PI * 2;
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const isLow = (h) => h.kind === 'kick' || h.kind === 'bass';
const isTonal = (h) => h.pc >= 0;
const follow = (v, to, dt, tau) => v + (to - v) * (1 - Math.exp(-dt / tau));
const beatLocked = (c) => c.f.bpm > 0 && c.f.beat.conf > 0.15;

const PAPER = '#f4f3ee';
// three inks per mood (dark, mid, accent); each scene picks one set
const PALETTES = {
  melancholic: [['#1d2540', '#6b7a99', '#ff5a00'], ['#22252b', '#7f8a96', '#e8d36a']],
  calm: [['#1f2a33', '#5f9ea0', '#ff7a3d'], ['#2b2b2b', '#a3b18a', '#e76f51']],
  dreamy: [['#3b2d6b', '#f49ac1', '#ffe28a'], ['#1f3a5f', '#9bc4e2', '#f6c1d0']],
  mysterious: [['#121212', '#7d7d7d', '#ffd400'], ['#101418', '#3d5a5b', '#d1495b']],
  focused: [['#111111', '#b9b9b3', '#ff5a00'], ['#1b1b1b', '#c9c4b5', '#2f6bff']],
  happy: [['#e8352a', '#ffc400', '#2f6bff'], ['#1d3557', '#f1c40f', '#e63946']],
  aggressive: [['#0b0b0b', '#e01e37', '#ffb703'], ['#120d0d', '#ff3b30', '#ffd400']],
  tense: [['#1a1a1a', '#8c8a84', '#ff5a00'], ['#141414', '#b0aba0', '#e01e37']],
  euphoric: [['#f72585', '#ffd23f', '#4361ee'], ['#3a0ca3', '#f72585', '#4cc9f0']],
};

// which ink (1 dark, 2 mid, 3 accent; 0 is the paper) does what, by day and by night
const roles = (night) => (night
  ? { sky: 1, ground: 1, line: 2, fig: 0, back: 2, prop: 2, hat: 3, rain: 2, light: 2, acc: 3, smoke: 2, cig: 0, snow: 0 }
  : { sky: 0, ground: 0, line: 1, fig: 1, back: 2, prop: 1, hat: 2, rain: 2, light: 0, acc: 3, smoke: 2, cig: 2, snow: 2 });

const HERO_X = { lamp: 0.36, busstop: 0.45, sea: 0.34, field: 0.42, alley: 0.48, room: 0.32, street: 0.4, station: 0.38, stage: 0.5,
  rooftop: 0.42, park: 0.4, bridge: 0.45 };
const SKY_OPEN = new Set(['lamp', 'busstop', 'sea', 'field', 'street', 'station', 'rooftop', 'park', 'bridge']);
const SITS = new Set(['sit', 'sitsmoke']);
const OVERCAST = new Set(['rain', 'storm', 'fog', 'snow']); // nothing of the sun, the moon or the stars to be seen
const overcast = (s) => OVERCAST.has(s.story.beats[s.ch].weather);
const COAT = { long: [9, 5], dress: [6, 5], jacket: [1.5, 3.6] }; // hem below the hip, half width, in units
// walking and running: how far the legs swing (rad) and the steps per beat; a stride is what the swing covers
const GAIT = { walk: [0.25, 1], run: [0.38, 1.5] };
let lastPlace = null; // shared by all scenes, so the next story tends to go somewhere else

function castFigure(rnd, x, dir, o = {}) {
  return { x, dir, hair: o.hair || pick(rnd, ['hat', 'cap', 'short', 'long', 'bun']), coat: o.coat || pick(rnd, ['long', 'jacket', 'dress']),
    size: 1.35 + (rnd() - 0.5) * 0.1, phones: !!o.phones, walkPh: rnd() * TAU, dx: 0, leaving: false, out: false };
}

function newStory(s, rnd) {
  const story = makeStory(rnd, s.mood, lastPlace), night = story.time === 'night';
  lastPlace = story.place;
  Object.assign(s, { story, lines: story.lines, night, R: roles(night), ch: 0, chT: 0, evT: 0, done: false, comp: null, vehicle: null,
    star: null, ring: 0, bal: null, balloonFree: false, lampOff: 0, dark: false, flash: 0, bolt: null, drops: [], flakes: [], leaves: [], conf: [] });
  const noir = s.mood === 'mysterious';
  s.F = castFigure(rnd, HERO_X[story.place] + (rnd() - 0.5) * 0.06, story.place === 'room' || story.place === 'lamp' ? 1 : rnd() < 0.5 ? 1 : -1,
    { hair: noir ? 'hat' : null, coat: noir ? 'long' : null, phones: (s.mood === 'happy' || s.mood === 'focused') && rnd() < 0.6 });
  s.anchor = s.F.x; // where the story starts: the lamp, the clock and the desk stay here when the figure walks off
  // the bench is there from the start when the figure sits before going anywhere; otherwise it is placed at the sit
  const sitAt = story.beats.findIndex((b) => SITS.has(b.act));
  s.bench = sitAt >= 0 && !story.beats.slice(0, sitAt).some((b) => GAIT[b.act]) ? { x: s.F.x, dir: s.F.dir } : null;
  s.birds = story.beats.some((b) => b.event === 'birds' || b.act === 'feed')
    ? Array.from({ length: 5 }, () => ({ x: s.F.x + s.F.dir * (0.06 + rnd() * 0.18), y: 0, fly: false, vx: 0, vy: 0, ph: rnd() * TAU, d: rnd() < 0.5 ? 1 : -1 }))
    : [];
  s.city = [];
  for (let x = -0.02; x < 1;) {
    const w = 0.08 + rnd() * 0.1;
    s.city.push([x, w, 0.15 + rnd() * 0.35]);
    x += w + rnd() * 0.03;
  }
  s.trees = [[0.1 + rnd() * 0.06, 0.28 + rnd() * 0.1], [0.68 + rnd() * 0.08, 0.32 + rnd() * 0.1], [0.92, 0.24 + rnd() * 0.08]];
  s.stars = Array.from({ length: 40 }, () => [rnd(), rnd() * 0.6]);
  s.tw = new Float32Array(40);
  s.lit = Array.from({ length: 32 }, () => rnd() < 0.35);
}

// the turn of the story happens as its beat starts
function startBeat(s, rnd) {
  const b = s.story.beats[s.ch], F = s.F, side = F.dir;
  s.evT = 0;
  if (b.gone) F.leaving = true;
  if (b.together && s.comp) s.comp.together = true;
  if (SITS.has(b.act) && !(s.bench && Math.abs(s.bench.x - F.x) < 0.01)) s.bench = { x: F.x, dir: F.dir }; // sits down where it stands
  switch (b.event) {
    case 'stranger': s.comp = { kind: 'person', F: castFigure(rnd, side > 0 ? 1.15 : -0.15, -side), target: F.x + side * 0.17 }; break;
    case 'cat': case 'dog': s.comp = { kind: b.event, x: side > 0 ? 1.1 : -0.1, dir: -side, target: F.x + side * 0.12, ph: 0 }; break;
    case 'bus': s.vehicle = { kind: 'bus', x: side > 0 ? -2 : 1.1, v: 0.4 * side }; break; // 1.9 wide: it starts fully outside
    case 'train': s.vehicle = { kind: 'train', x: 1.15, v: -1.1 }; break;
    case 'birds':
      for (const bd of s.birds) { bd.fly = true; bd.vx = (rnd() - 0.3) * 0.25 * bd.d; bd.vy = -(0.25 + rnd() * 0.2); }
      break;
    case 'shootingstar': s.star = { x: 0.8 + rnd() * 0.15, y: 0.06 + rnd() * 0.12, t: 0 }; break;
    case 'lightsout': s.dark = true; break;
    case 'lightning': strike(s, rnd); break;
    case 'balloonfly': s.balloonFree = true; s.balV = 0; break; // let go from rest
    case 'call': s.ring = 1; break;
    case 'confettiburst':
      for (let k = 0; k < 80; k++) s.conf.push({ x: rnd(), y: -rnd() * 0.3, a: rnd() * TAU, c: 1 + Math.floor(rnd() * 3) });
      break;
  }
}

function strike(s, rnd) {
  s.flash = 0.18;
  s.bolt = [[0.15 + rnd() * 0.7, 0]];
  for (let k = 1; k <= 6; k++) s.bolt.push([s.bolt[k - 1][0] + (rnd() - 0.5) * 0.12, (k / 6) * s.ground]); // cloud to ground
}

// walking and running keep step with the beat (`db` is the beats that passed this frame), and the ground covered is
// what the legs swing over, so the feet do not skate; someone who is leaving walks out of the picture for good
function stepFigure(F, act, db) {
  F.dx = 0;
  if (!GAIT[act]) return;
  const [A, spb] = GAIT[act];
  F.walkPh += db * Math.PI * spb;
  F.dx = F.dir * db * spb * 2 * ((19 * F.size) / 125) * Math.sin(A); // a step, for legs 19 units long
  if (F.out) return;
  F.x += F.dx;
  if (F.x > 1.2 || F.x < -0.2) {
    if (F.leaving) F.out = true;
    else F.x = F.x > 1.2 ? -0.15 : 1.15;
  }
}

// where every limb points this frame; angles are absolute from straight down, positive toward where it faces
function tePose(act, F, s, c) {
  const { N, t } = c, u = (N / 125) * F.size, g = s.ground * N, b = c.f.beat, ph = F.walkPh;
  // the hip is a leg's length (19 units) over the ground; breathing lengthens the torso, the feet stay down
  const P = { hx: F.x * N, hy: g - 19 * u, breath: Math.sin(t * 1.6) * 0.3 * u, lean: 0, headDx: 0,
    arms: [[0.1, 0.06], [-0.08, -0.04]], legs: [[0.07, 0.03], [-0.07, -0.03]] };
  if (SITS.has(act)) { // on the seat of the bench (8 units up): thighs level, shins down to the ground
    P.hy = g - 9.5 * u;
    P.legs = [[1.5, 0.38], [1.45, 0.5]];
    P.arms = [[0.35, 1.2], [0.3, 1.1]];
  }
  switch (act) {
    case 'smoke': case 'sitsmoke': P.arms[0] = [0.3, lerp(0.9, 2.75, s.puffArm)]; break;
    case 'coffee': P.arms[0] = [0.45, lerp(1.9, 2.8, s.puffArm)]; break;
    case 'umbrella': P.arms[0] = [1.9, 2.6]; break; // the hand at head height; the shaft goes up from it
    case 'phone': P.arms[0] = [0.5, 2.25]; P.headDx = 0.6; break;
    case 'read': P.arms = [[0.55, 2.05], [0.5, 2.0]]; P.headDx = 0.6; break;
    case 'guitar': P.arms = [[0.35 + 0.25 * Math.sin((b.count + b.phase) * TAU * 2), 0.9], [1.05, 2.0]]; break;
    case 'balloon': P.arms[0] = [2.3, 2.7]; break;
    case 'wave': P.arms[0] = [2.7, 2.9 + 0.45 * Math.sin(t * 9)]; break;
    case 'lookup': P.arms = [[-0.35, -0.15], [-0.4, -0.2]]; P.headDx = -0.7; break;
    case 'wait': P.arms[0] = [0.65, 2.05]; P.headDx = 0.4; P.legs[1] = [-0.07, -0.03 - 0.35 * b.pulse]; break;
    case 'synth': P.arms = [[0.8, 1.35], [0.7, 1.3]]; P.headDx = 0.5; P.lean = 0.1 + 0.12 * b.pulse; break; // nods over the keys
    case 'feed': P.lean = 0.5; P.arms = [[1.1, 0.7], [0.3, 0.2]]; P.headDx = 0.5; break;
    case 'lie': { // on the back in the grass: the hip as high as the coat is wide, the knees bent so the feet reach down
      const [hem, wide] = COAT[F.coat], lift = (wide + 0.12 * hem) * u;
      const shin = (k) => -Math.acos(Math.min(1, Math.max(0, (lift / u - 9.5 * Math.cos(k) - 0.5) / 9.5)));
      P.hy = g - lift; P.lean = 1.45; P.legs = [[-1.5, shin(1.5)], [-1.4, shin(1.4)]]; P.arms = [[1.7, 2.5], [1.6, 2.4]];
      break;
    }
    case 'jump': {
      const j = Math.max(0, Math.sin(b.phase * Math.PI));
      P.hy -= j * 5 * u;
      P.arms = [[2.6, 2.9], [2.5, 2.8]];
      P.legs = [[0.2, -0.3 * j], [-0.2, -0.3 * j]];
      break;
    }
    case 'walk': case 'run': {
      const run = act === 'run', [A] = GAIT[act], sw = Math.sin(ph), fwd = Math.max(0, Math.cos(ph)), back = Math.max(0, -Math.cos(ph));
      // the leg swinging forward bends at the knee and clears the ground; the one on the ground stays straight and
      // carries the hip, which is lowest when the legs are spread
      P.legs = [[A * sw, A * sw - A * 0.8 * fwd], [-A * sw, -A * sw - A * 0.8 * back]];
      P.arms = [[-0.7 * A * sw, -0.7 * A * sw + (run ? 1.4 : 0.2)], [0.7 * A * sw, 0.7 * A * sw + (run ? 1.4 : 0.2)]];
      P.lean = run ? 0.28 : 0.04;
      P.hy += 19 * u * (1 - Math.cos(A * sw));
      break;
    }
    case 'dance': {
      const k = (b.count + b.phase) * Math.PI, kb = 0.35 * b.pulse; // the knees give on the beat; the feet stay down
      P.arms = [[2.5 + 0.35 * Math.sin(k), 2.9 + 0.3 * Math.sin(2 * k)], [2.5 - 0.35 * Math.sin(k), 2.9 - 0.3 * Math.sin(2 * k)]];
      P.legs = [[0.25 + kb, -0.05 - kb], [-0.2, -0.2 - 1.3 * kb]];
      P.hy = g - 9.5 * u * (Math.cos(0.25 + kb) + Math.cos(0.05 + kb));
      break;
    }
    case 'stand': P.lean = Math.sin(t * 0.5) * 0.03; break; // shifting weight
  }
  return P;
}

// One flat figure: back limbs, coat, front leg, head and hair, then `held` (a guitar) and the front arm.
// Returns the joints props hang on.
function teFigure(r, P, F, N, R, held) {
  const u = (N / 125) * F.size, d = F.dir, lw = Math.max(2, Math.round(2.4 * u)), aw = Math.max(1, Math.round(1.8 * u));
  const L = { torso: 14 * u, upper: 7.5 * u, fore: 7 * u, thigh: 9.5 * u, shin: 9.5 * u, head: 4.4 * u };
  const at = (p, a, len) => [p[0] + Math.sin(a) * d * len, p[1] + Math.cos(a) * len];
  const up = [Math.sin(P.lean) * d, -Math.cos(P.lean)], side = [-up[1], up[0]], down = [-up[0], -up[1]];
  const torso = L.torso + (P.breath || 0), hip = [P.hx, P.hy], neck = [hip[0] + up[0] * torso, hip[1] + up[1] * torso];
  const head = [neck[0] + up[0] * (L.head + 1.2 * u) + P.headDx * u * d, neck[1] + up[1] * (L.head + 1.2 * u)];
  const shoulder = [neck[0] - up[0] * 1.5 * u, neck[1] - up[1] * 1.5 * u];
  const limb = ([a1, a2], from, l1, l2, w, col, shoe) => {
    const mid = at(from, a1, l1), end = at(mid, a2, l2);
    r.stroke(from[0], from[1], mid[0], mid[1], w, col);
    r.stroke(mid[0], mid[1], end[0], end[1], w, col);
    r.disc(mid[0], mid[1], w / 2, col);
    if (shoe) r.stroke(end[0], end[1], end[0] + d * 2.4 * u, end[1], w, col);
    return end;
  };
  limb(P.legs[1], hip, L.thigh, L.shin, lw * 0.85, R.back, true);
  const backHand = limb(P.arms[1], shoulder, L.upper, L.fore, aw, R.back);
  if (F.hair === 'long') r.stroke(head[0] - d * L.head * 0.7, head[1], head[0] - d * L.head * 0.9, head[1] + L.head * 1.8, L.head * 1.1, R.back);
  const hem = COAT[F.coat][0] * u, wide = COAT[F.coat][1] * u, sw = 3.2 * u;
  r.poly([[neck[0] + side[0] * sw, neck[1] + side[1] * sw], [neck[0] - side[0] * sw, neck[1] - side[1] * sw],
    [hip[0] + down[0] * hem - side[0] * wide, hip[1] + down[1] * hem - side[1] * wide],
    [hip[0] + down[0] * hem + side[0] * wide, hip[1] + down[1] * hem + side[1] * wide]], R.fig);
  limb(P.legs[0], hip, L.thigh, L.shin, lw, R.fig, true);
  r.disc(head[0], head[1], L.head, R.fig);
  const hr = L.head;
  if (F.hair === 'hat') { // a brimmed hat
    r.rect(head[0] - hr * 1.6, head[1] - hr * 0.6, hr * 3.2, Math.max(1, u), R.hat);
    r.rect(head[0] - hr * 0.9, head[1] - hr * 1.6, hr * 1.8, hr * 1.05, R.hat);
  } else if (F.hair === 'cap') {
    r.rect(head[0] - hr, head[1] - hr, hr * 2, hr * 0.75, R.hat);
    r.rect(d > 0 ? head[0] : head[0] - hr * 1.9, head[1] - hr * 0.35, hr * 1.9, Math.max(1, u), R.hat);
  } else if (F.hair === 'bun') r.disc(head[0] - d * hr * 0.6, head[1] - hr * 1.05, hr * 0.55, R.hat);
  if (F.phones) { // headphones: a band over the head and a cup over the ear
    for (let k = 0; k <= 16; k++) {
      const a = Math.PI + (k / 16) * Math.PI;
      r.rect(head[0] + Math.cos(a) * hr * 1.3 - u / 2, head[1] + Math.sin(a) * hr * 1.3 - u / 2, Math.max(1, u), Math.max(1, u), R.acc);
    }
    r.disc(head[0] - d * hr * 0.15, head[1] + hr * 0.1, hr * 0.6, R.acc);
  }
  held?.(hip, u);
  const hand = limb(P.arms[0], shoulder, L.upper, L.fore, aw, R.fig);
  return { hip, head, hand, backHand, hr, u };
}

// sun, sunset or moon behind the place; `hz` is where the sky meets the ground or the sea
function teSky(r, s, c, hz) {
  const { N } = c, R = s.R, time = s.story.time, u = N / 125;
  if (!SKY_OPEN.has(s.story.place) || overcast(s)) return;
  if (time === 'day') r.disc(0.8 * N, 0.16 * N, 0.055 * N, R.acc);
  else if (time === 'dusk') { // a big low sun with the bottom cut into stripes
    const sr = 0.11 * N, sx = 0.7 * N;
    r.disc(sx, hz, sr, R.acc);
    for (let k = 1; k <= 3; k++) r.rect(sx - sr, hz - sr * 0.13 * k * 1.6, 2 * sr, Math.max(1, u * 0.7 * k), R.sky);
  } else {
    r.disc(0.24 * N, 0.18 * N, 0.065 * N, R.acc);
    r.disc(0.27 * N, 0.16 * N, 0.058 * N, R.sky); // a crescent
  }
}

// the place, drawn behind the figure
function teSetting(r, s, c) {
  const { N, t, f } = c, R = s.R, F = s.F, u = N / 125, g = s.ground * N, pw = Math.max(1, Math.round(1.6 * u)), place = s.story.place;
  const lampOn = s.lampOff <= 0 && !s.dark;
  r.fill(s.flash > 0.08 ? 0 : R.sky);
  // a cone of light, every other row, so it reads as light and not as paint
  const cone = (x, y, w0, w1, y1, col) => {
    for (let y2 = Math.ceil(y); y2 < y1; y2 += 2) {
      const w = lerp(w0, w1, (y2 - y) / (y1 - y));
      for (let x2 = Math.round(x - w); x2 < x + w; x2++) if (r.get(x2, y2) === R.sky) r.set(x2, y2, col);
    }
  };
  const skyline = (scale, lit) => {
    s.city.forEach(([x, w, h], k) => {
      const top = g - h * N * scale;
      r.rect(x * N, top, w * N, g - top, 2);
      for (let y = top + 3 * u, j = 0; y < g - 4 * u; y += 5 * u, j++)
        for (let x2 = x * N + 2 * u; x2 < (x + w) * N - 2 * u; x2 += 4 * u)
          r.rect(x2, y, Math.max(1, u), 2 * u, lit && s.lit[(k * 7 + j) % s.lit.length] ? R.acc : s.night ? 1 : 0);
    });
  };
  teSky(r, s, c, place === 'sea' ? g - 0.24 * N : g);
  if (s.star && !overcast(s)) { // a falling star: down and across, the trail behind it
    const k = s.star.t, x = (s.star.x - k * 0.5) * N, y = (s.star.y + k * 0.2) * N;
    r.line(x, y, x + 7 * u, y - 2.8 * u, 0);
    r.set(x, y, R.acc);
  }
  if (s.bolt && s.flash > 0) // lightning: from the top of the sky to the ground, behind the place
    for (let i = 1; i < s.bolt.length; i++) r.stroke(s.bolt[i - 1][0] * N, s.bolt[i - 1][1] * N, s.bolt[i][0] * N, s.bolt[i][1] * N, Math.max(1, u), R.acc);
  r.rect(0, g, N, N - g, R.ground); // also hides the lower half of a setting sun
  r.rect(0, g, N, Math.max(1, u), R.line);
  switch (place) {
    case 'lamp': {
      const lx = (s.anchor + 0.16) * N, top = g - 0.58 * N, hx = lx - 9 * u;
      r.rect(lx, top, pw, g - top, R.prop);
      r.rect(hx + 2 * u, top, lx - hx - 2 * u, pw, R.prop);
      if (s.night && lampOn) cone(hx + 2.5 * u, top + 3 * u, 2 * u, 0.2 * N, g, R.light);
      r.rect(hx, top, 5 * u, 2.5 * u, lampOn ? R.acc : R.prop);
      break;
    }
    case 'busstop': {
      const x0 = (HERO_X.busstop - 0.22) * N, x1 = (HERO_X.busstop + 0.24) * N, roof = g - 0.6 * N;
      teVehicle(r, s, c); // the bus passes on the road behind the shelter
      r.frame(Math.round(x0 + 3 * u), Math.round(roof + 8 * u), Math.round(x1 - x0 - 6 * u), Math.round(0.3 * N), R.prop);
      r.rect(x0 - 2 * u, roof, x1 - x0 + 4 * u, 2 * u, R.prop);
      r.rect(x0, roof, pw, g - roof, R.prop);
      r.rect(x1 - pw, roof, pw, g - roof, R.prop);
      r.rect(x1 + 6 * u, g - 0.62 * N, pw, 0.62 * N, R.prop);
      r.disc(x1 + 6 * u + pw / 2, g - 0.62 * N, 4.5 * u, R.acc);
      s.roof = [x0 - 2 * u, x1 + 2 * u, roof, 0];
      break;
    }
    case 'sea': {
      const hz = g - 0.24 * N, sx = (s.story.time === 'night' ? 0.24 : s.story.time === 'dusk' ? 0.7 : 0.8) * N, sr = 0.085 * N;
      r.rect(0, hz, N, g - hz, 2);
      if (!overcast(s)) for (let k = 0; k < 6; k++) { // the sun's (or the moon's) road on the water, right under it
        const w = sr * (1.6 - k * 0.22), y = hz + 3 * u + k * 3.5 * u;
        r.rect(sx - w / 2 + Math.sin(t * 1.5 + k) * u, y, w, Math.max(1, u), R.acc);
      }
      for (let y = hz + 2 * u; y < g - u; y += 4 * u) // small waves coming in
        for (let x = 0; x < N; x++) if ((x + Math.floor(t * 5 + y)) % 13 < 3) r.set(x, y, s.night ? R.sky : 0);
      break;
    }
    case 'field':
      for (let x = 0; x < N; x++) {
        const hy = g - (3 + 3 * Math.sin((x / N) * 4 + s.trees[0][1] * 10)) * u;
        r.rect(x, hy, 1, g - hy + 1, 2);
        if (x % 3 === 0) r.line(x, hy, x + Math.round(Math.sin(t * 1.5 + x * 0.3) * u * (s.windy ? 2.5 : 1)), hy - 2 * u, 2);
      }
      break;
    case 'alley': {
      const wl = 0.17 * N, wr = 0.83 * N;
      r.rect(0, 0, wl, g, 2);
      r.rect(wr, 0, N - wr, g, 2);
      let k = 0;
      for (let y = 0.12 * N; y < g - 0.15 * N; y += 0.13 * N)
        for (const x of [wl * 0.25, wr + (N - wr) * 0.3]) r.rect(x, y, 0.07 * N, 0.08 * N, s.lit[k++] && !s.dark ? R.acc : 1);
      r.frame(Math.round(wr + 4 * u), Math.round(g - 0.22 * N), Math.round(0.11 * N), Math.round(0.22 * N), 1);
      r.rect(wl, 0.36 * N, 5 * u, pw, 1);
      if (lampOn) cone(wl + 5 * u, 0.36 * N + 2 * u, u, 0.12 * N, g, R.light);
      r.rect(wl + 4 * u, 0.36 * N, 3 * u, 2 * u, lampOn ? R.acc : 1);
      break;
    }
    case 'room': {
      const wx = 0.56 * N, wy = 0.14 * N, ww = 0.3 * N, rain = ['rain', 'storm'].includes(s.story.beats[s.ch].weather);
      r.rect(wx, wy, ww, ww, s.night ? 1 : 2);
      if (!s.night) r.disc(wx + ww * 0.7, wy + ww * 0.3, ww * 0.12, R.acc);
      if (rain || s.night)
        for (let k = 0; k < (rain ? 18 : 0); k++) { // rain beyond the glass
          const x = wx + ((k * 37 + t * 9 * u) % ww), y = wy + ((k * 53 + t * 60 * u) % ww);
          r.line(x, y, x - u, y - 3 * u, 0);
        }
      r.frame(Math.round(wx), Math.round(wy), Math.round(ww), Math.round(ww), s.night ? 2 : 1);
      r.rect(wx + ww / 2, wy, Math.max(1, u), ww, s.night ? 2 : 1);
      r.rect(wx, wy + ww / 2, ww, Math.max(1, u), s.night ? 2 : 1);
      r.frame(Math.round(0.08 * N), Math.round(0.16 * N), Math.round(0.16 * N), Math.round(0.2 * N), R.line); // a poster
      r.disc(0.16 * N, 0.24 * N, 0.045 * N, R.acc);
      break;
    }
    case 'street':
      skyline(1, s.night);
      teVehicle(r, s, c); // the bus: in front of the houses, behind the figure
      r.rect(0, g + 3 * u, N, Math.max(1, u), R.line);
      break;
    case 'station': {
      teVehicle(r, s, c); // the train on the far track, behind the clock
      r.rect(0, g, N, N - g, 2);
      r.rect(0, g + 2 * u, N, Math.max(1, u), R.acc); // the safety line
      for (const y of [g + 0.1 * N, g + 0.13 * N]) r.rect(0, y, N, Math.max(1, u), 1);
      const cx = Math.min(0.85, s.anchor + 0.3) * N, cy = 0.26 * N, cr = 7.5 * u;
      r.rect(cx, cy, pw, g - cy, 1);
      r.disc(cx, cy, cr + u, 1);
      r.disc(cx, cy, cr, 0);
      const mA = ((f.beat.count % 60) / 60) * TAU - Math.PI / 2, hA = s.hourA - Math.PI / 2; // the minute hand ticks on the beat
      r.stroke(cx, cy, cx + Math.cos(mA) * cr * 0.85, cy + Math.sin(mA) * cr * 0.85, Math.max(1, u), 1);
      r.stroke(cx, cy, cx + Math.cos(hA) * cr * 0.5, cy + Math.sin(hA) * cr * 0.5, Math.max(1, u), R.acc);
      r.rect(0.08 * N, 0.08 * N, 0.38 * N, 0.09 * N, 1); // departures board, blinking
      for (let k = 0; k < 10; k++) r.rect(0.1 * N + k * 3.4 * u, 0.115 * N, 2 * u, 2 * u, (k + f.beat.count) % 3 ? R.acc : 0);
      break;
    }
    case 'stage': {
      const k = (f.beat.count + f.beat.phase) * (Math.PI / 2);
      for (const sgn of [1, -1]) cone(lerp(0.3, 0.7, 0.5 + 0.5 * Math.sin(k * sgn)) * N, 0, u, 0.16 * N, g, 2); // spotlights on the beat
      r.rect(0, g, N, N - g, 2);
      for (const x of [0.04, 0.84]) {
        r.rect(x * N, g - 0.2 * N, 0.12 * N, 0.2 * N, R.acc);
        for (const y of [0.15, 0.06]) r.disc((x + 0.06) * N, g - y * N, 0.035 * N * (1 + 0.15 * f.rel.bassDrive), 0);
      }
      break;
    }
    case 'rooftop': {
      for (const [x, w, h] of s.city) { // the other roofs, further off and lower
        const top = g - h * N * 0.45;
        r.rect(x * N, top, w * N, g - top, 2);
        for (let y = top + 3 * u, j = 0; y < g - 4 * u; y += 5 * u, j++)
          for (let x2 = x * N + 2 * u; x2 < (x + w) * N - 2 * u; x2 += 4 * u) if (s.lit[(j * 5 + Math.round(x2)) % s.lit.length]) r.rect(x2, y, Math.max(1, u), 2 * u, R.acc);
      }
      r.rect(0, g - 3 * u, N, 3 * u, R.prop); // the parapet
      const tx = 0.8 * N, ty = g - 0.32 * N;
      for (const lx of [tx - 7 * u, tx + 6 * u]) r.rect(lx, ty + 10 * u, pw, g - ty - 10 * u, R.prop);
      r.rect(tx - 9 * u, ty, 18 * u, 12 * u, R.prop);
      r.poly([[tx - 10 * u, ty], [tx + 10 * u, ty], [tx, ty - 5 * u]], R.prop);
      r.rect(0.12 * N, g - 0.5 * N, pw, 0.5 * N, R.prop); // an antenna, blinking on the beat
      r.rect(0.12 * N - 4 * u, g - 0.42 * N, 8 * u, pw, R.prop);
      r.rect(0.12 * N - u, g - 0.5 * N - 2 * u, 2 * u, 2 * u, f.beat.pulse > 0.3 ? R.acc : R.prop);
      break;
    }
    case 'park': {
      r.rect(0, g + 2 * u, N, Math.max(1, u), 2);
      for (const [x, h] of s.trees) {
        const sway = Math.sin(t * 0.8 + x * 7) * (s.windy ? 2.5 : 0.8) * u, tx = x * N, top = g - h * N;
        r.rect(tx - 1.5 * u, top, 3 * u, g - top, R.prop);
        r.disc(tx + sway, top, 0.09 * N, 2);
        r.disc(tx - 0.05 * N + sway * 0.8, top + 0.04 * N, 0.07 * N, 2);
        r.disc(tx + 0.05 * N + sway, top + 0.03 * N, 0.07 * N, 2);
      }
      const lx = 0.58 * N;
      r.rect(lx, g - 0.36 * N, pw, 0.36 * N, R.prop);
      r.rect(lx - 2 * u, g - 0.36 * N - 3 * u, 4 * u + pw, 3 * u, lampOn ? R.acc : R.prop);
      break;
    }
    case 'bridge': {
      skyline(0.35, s.night);
      teVehicle(r, s, c); // the train on the rails beyond the railing
      r.rect(0, g + 2 * u, N, N - g, 2); // the river under the deck
      for (let y = g + 5 * u; y < N; y += 4 * u)
        for (let x = 0; x < N; x++) if ((x + Math.floor(t * 4 + y * 3)) % 17 < 3) r.set(x, y, s.night ? R.sky : 0);
      r.rect(0, g, N, 2 * u, R.prop);
      r.rect(0, g - 10 * u, N, pw, R.prop);
      for (let x = 0; x < N; x += 5 * u) r.rect(x, g - 10 * u, pw, 10 * u, R.prop);
      for (const lx of [0.16 * N, 0.84 * N]) {
        r.rect(lx, g - 0.42 * N, pw, 0.42 * N, R.prop);
        if (s.night && lampOn) cone(lx, g - 0.42 * N + 2 * u, u, 0.08 * N, g - 10 * u, R.light);
        r.rect(lx - 2 * u, g - 0.42 * N - 2 * u, 4 * u + pw, 2.5 * u, lampOn ? R.acc : R.prop);
        if (lampOn) for (let k = 0; k < 4; k++) r.rect(lx - 3 * u + Math.sin(t * 2 + k) * u, g + 5 * u + k * 4 * u, 6 * u, Math.max(1, u), R.acc);
      }
      break;
    }
  }
  if (s.bench) { // the bench stays where it was sat on; its legs stand on the ground
    const fu = u * F.size, bx = s.bench.x * N - 6 * fu * s.bench.dir, y = g - 8 * fu;
    r.rect(bx - 12 * fu, y, 26 * fu, 2 * fu, R.prop);
    r.rect(s.bench.dir > 0 ? bx - 12 * fu : bx + 12 * fu, y - 8 * fu, 2 * fu, 8 * fu, R.prop);
    for (const x of [bx - 10 * fu, bx + 11 * fu]) r.rect(x, y, pw, g - y, R.prop);
  }
}

// a cat or a dog: four legs, a body, a head, a tail that moves to the music
function teAnimal(r, A, s, c, moving) {
  const { N, t } = c, R = s.R, dog = A.kind === 'dog', u = (N / 125) * (dog ? 1.25 : 1), x = A.x * N, g = s.ground * N, d = A.dir;
  const col = dog ? R.back : R.fig, w = Math.max(1, u), sw = moving ? Math.sin(A.ph) * 1.6 * u : 0, bw = dog ? 6 : 5, top = g - (dog ? 8 : 6) * u;
  for (const [ox, k] of [[-bw + 1, 1], [-bw + 2.5, -1], [bw - 2.5, 1], [bw - 1, -1]]) r.stroke(x + ox * u, top + 3 * u, x + ox * u + k * sw, g, w, col);
  r.rect(x - bw * u, top, 2 * bw * u, 3.5 * u, col);
  const hx = x + d * (bw + 1.5) * u, hy = top - 1.5 * u, tx = x - d * bw * u;
  r.disc(hx, hy, (dog ? 2.6 : 2.3) * u, col);
  if (dog) {
    r.rect(d > 0 ? hx : hx - 3.5 * u, hy, 3.5 * u, 1.6 * u, col);
    r.rect(hx - d * 1.5 * u, hy - u, 1.5 * u, 3 * u, R.acc);
    r.stroke(tx, top, tx - d * 3 * u, top - 3 * u + Math.sin(t * 16) * 1.5 * u, w, col);
  } else {
    r.poly([[hx - 2 * u, hy - u], [hx - u, hy - 3.6 * u], [hx, hy - 1.5 * u]], col);
    r.poly([[hx, hy - 1.5 * u], [hx + u, hy - 3.6 * u], [hx + 2 * u, hy - u]], col);
    const wag = Math.sin(c.f.beat.phase * TAU);
    r.stroke(tx, top + u, tx - d * 2 * u, top - 3 * u, w, col);
    r.stroke(tx - d * 2 * u, top - 3 * u, tx - d * (1 + wag * 1.5) * u, top - 6 * u, w, col);
  }
}

// a bus or a train passes behind the figure on the same ground: taller than a person, its wheels on the line; the
// place calls it where it belongs in depth (in front of the houses, behind the shelter, the clock, the railing)
function teVehicle(r, s, c) {
  const v = s.vehicle;
  if (!v) return;
  const { N } = c, R = s.R, u = N / 125, g = s.ground * N, x = v.x * N, wheel = s.night ? 0 : 1;
  if (v.kind === 'bus') {
    const w = 1.9 * N, h = 0.5 * N, y = g - h, ww = (w - 8 * u) / 8;
    r.rect(x, y, w, h - 3 * u, R.acc);
    for (let k = 0; k < 8; k++) r.rect(x + 4 * u + k * ww, y + 0.12 * h, ww - 2 * u, 0.3 * h, 0);
    for (const wx of [x + w * 0.12, x + w * 0.5, x + w * 0.88]) r.disc(wx, g - 5 * u, 5 * u, wheel); // three axles: one is always in view
  } else {
    const w = 2.2 * N, h = 0.52 * N, y = g - h;
    r.rect(x, y, w, h - 3 * u, R.back);
    r.rect(x, y + h * 0.62, w, Math.max(1, 1.5 * u), R.acc);
    for (let wx = x + 4 * u; wx < x + w - 10 * u; wx += 11 * u) r.rect(wx, y + 0.15 * h, 7 * u, 0.28 * h, 0);
    for (let wx = x + 9 * u; wx < x + w - 12 * u; wx += 30 * u) for (const k of [0, 8 * u]) r.disc(wx + k, g - 3.5 * u, 3.5 * u, wheel); // bogies
  }
}

// what the figure holds and what comes off it
function teProps(r, s, c, act, B, F) {
  const { N, t, rnd, dt } = c, R = s.R, d = F.dir, bu = B.u;
  if (act === 'smoke' || act === 'sitsmoke') {
    const tip = [B.hand[0] + d * 2.5 * bu, B.hand[1] - bu];
    r.stroke(B.hand[0], B.hand[1], tip[0], tip[1], Math.max(1, bu), R.cig);
    r.disc(tip[0], tip[1], (0.5 + s.ember) * bu, R.acc);
    if (rnd() < dt * 8) s.smoke.push({ x: tip[0], y: tip[1], r: 0.4 * bu, life: 1.6 });
    if (s.exhale) for (let k = 0; k < 4; k++) s.smoke.push({ x: B.head[0] + d * B.hr, y: B.head[1] + B.hr * 0.3, r: (1 + rnd()) * bu, life: 2 + rnd() });
  }
  if (act === 'coffee') { // a cup and its steam
    r.rect(B.hand[0] - 1.3 * bu, B.hand[1] - 3 * bu, 2.6 * bu, 3.2 * bu, R.acc);
    if (rnd() < dt * 5) s.smoke.push({ x: B.hand[0], y: B.hand[1] - 3.5 * bu, r: 0.4 * bu, life: 1.2 });
  }
  if (act === 'read') {
    r.rect(B.hand[0] - 3 * bu, B.hand[1] - 4.5 * bu, 6 * bu, 4.5 * bu, R.acc);
    r.rect(B.hand[0] - 0.4 * bu, B.hand[1] - 4.5 * bu, Math.max(1, 0.8 * bu), 4.5 * bu, R.fig);
  }
  if (act === 'umbrella') { // the shaft leans back over the shoulder from the hand, so the dome is over the head
    const top = [B.hand[0] - d * 3 * bu, B.hand[1] - 9 * bu], rr = 13 * bu, pts = [];
    r.stroke(B.hand[0], B.hand[1], top[0], top[1], Math.max(1, bu), R.line);
    for (let k = 0; k <= 14; k++) {
      const a = Math.PI + (k / 14) * Math.PI;
      pts.push([top[0] + Math.cos(a) * rr, top[1] + Math.sin(a) * rr * 0.65]);
    }
    r.poly(pts, R.acc);
    s.shelter = [top[0] - rr, top[0] + rr, top[1], rr];
  }
  if (act === 'phone') {
    r.rect(B.hand[0] - bu, B.hand[1] - 3 * bu, 2.2 * bu, 3.4 * bu, R.acc);
    r.rect(B.hand[0] - 0.4 * bu, B.hand[1] - 2.4 * bu, Math.max(1, bu), Math.max(1, 1.5 * bu), 0);
    if (s.ring > 0 && Math.floor(t * 6) % 2) // it rings
      for (const k of [-1, 0, 1]) r.line(B.hand[0] + d * 3 * bu, B.hand[1] - 2 * bu + k * 2 * bu, B.hand[0] + d * 5 * bu, B.hand[1] - 2 * bu + k * 3 * bu, R.acc);
  }
  if (act === 'balloon' && !s.balloonFree) // held on its string; the wind leans it over
    s.bal = [B.hand[0] + d * 5 * bu + Math.sin(t * 1.3) * 1.5 * bu - (s.windy ? 5 * bu : 0), B.hand[1] - 24 * bu + Math.sin(t * 0.9) * bu, B.hand];
}

// under a roof or an umbrella: inside its span and below its surface (a dome of radius sh[3] for the umbrella)
function sheltered(sh, x, y) {
  if (!sh || x < sh[0] || x > sh[1]) return false;
  const k = sh[3] ? (x - (sh[0] + sh[1]) / 2) / sh[3] : 0;
  return y > sh[2] - sh[3] * 0.65 * Math.sqrt(Math.max(0, 1 - k * k));
}

// weather in front of everything: rain and snow (stopped by umbrellas and roofs), wind, stars, fog, confetti
function teWeather(r, s, c, kind) {
  const { N, dt, t, f, rnd } = c, R = s.R, u = N / 125, g = s.ground * N;
  if (s.story.place === 'room') return; // indoors: the window shows it
  if (kind === 'rain' || kind === 'storm') {
    const storm = kind === 'storm', want = Math.round((40 + 150 * f.level + (storm ? 120 : 0)) * u);
    while (s.drops.length < want) s.drops.push({ x: rnd() * N * 1.3, y: -rnd() * N, l: (2 + rnd() * 3) * u });
    if (s.drops.length > want) s.drops.length = want;
    const v = N * (0.9 + 0.8 * f.level) * (storm ? 1.6 : 1), slant = storm ? 0.45 : 0.2;
    for (const dp of s.drops) {
      dp.y += v * dt;
      dp.x -= slant * v * dt;
      if (dp.y > g || sheltered(s.shelter, dp.x, dp.y) || sheltered(s.roof, dp.x, dp.y)) { dp.y = -rnd() * N * 0.2; dp.x = rnd() * N * 1.3; continue; }
      r.line(dp.x, dp.y, dp.x + slant * dp.l, dp.y - dp.l, R.rain);
    }
  }
  if (kind === 'snow') { // slow and drifting; it lands on roofs and umbrellas too
    const want = Math.round((50 + 60 * f.level) * u);
    while (s.flakes.length < want) s.flakes.push({ x: rnd() * N, y: -rnd() * N, s: rnd() * TAU });
    for (const fl of s.flakes) {
      fl.y += dt * N * 0.08 * (1 + 0.5 * f.level);
      fl.x += Math.sin(t * 1.3 + fl.s) * dt * 4 * u;
      if (fl.y > g || sheltered(s.shelter, fl.x, fl.y) || sheltered(s.roof, fl.x, fl.y)) { fl.y = -rnd() * 10 * u; fl.x = rnd() * N; }
      r.rect(fl.x, fl.y, Math.max(1, u), Math.max(1, u), R.snow);
    }
  }
  if (kind === 'wind') { // leaves blown across, tumbling and slowly sinking
    while (s.leaves.length < 14) s.leaves.push({ x: N + rnd() * N, y: rnd() * g, a: rnd() * TAU });
    for (const lf of s.leaves) {
      lf.x -= dt * N * (0.3 + 0.3 * f.level);
      lf.y += (Math.sin(t * 3 + lf.a) * 8 + 3) * dt * u;
      lf.a += dt * 6;
      if (lf.x < -5 * u || lf.y > g) { lf.x = N + rnd() * 20 * u; lf.y = rnd() * g; }
      r.rect(lf.x, lf.y, Math.max(1, Math.round(2 * u * Math.abs(Math.cos(lf.a)))), Math.max(1, u), R.acc);
    }
  }
  if (kind === 'stars') s.stars.forEach(([x, y], k) => r.set(x * N, y * N, s.tw[k] > 0 ? R.acc : (k + Math.floor(t * 2)) % 9 ? 0 : R.line));
  if (kind === 'fog') // drifting dashed bands near the ground
    for (let y = Math.round(g - 0.3 * N); y < g; y += 3)
      for (let x = 0; x < N; x++) if ((x + Math.floor(t * 6) + y * 7) % 11 < 4 && (y * 13) % 5 < 3) r.set(x, y, 2);
  if (kind === 'confetti' || s.conf.length)
    for (const p of s.conf) r.rect(p.x * N, p.y * N, Math.max(1, Math.round(2 * u * Math.abs(Math.cos(p.a)))), Math.max(1, u), p.c);
}

export const TE_STYLE = {
  title: 'TE STORY',
  byMood: true,
  palette: [PAPER, ...PALETTES.focused[0]],
  init(s, c) {
    const rnd = c.rnd;
    s.mood = c.mood in MOOD_VA ? c.mood : 'focused';
    s.palette = [PAPER, ...pick(rnd, PALETTES[s.mood])];
    s.ground = 0.8 + rnd() * 0.04;
    s.puffArm = 0;
    s.ember = 0;
    s.barPos = 0;
    s.exhale = false;
    s.smoke = [];
    s.keys = new Float32Array(8);
    s.hourA = rnd() * TAU;
    s.bp = null;
    s.balV = 0;
    newStory(s, rnd);
  },
  draw(s, c, r) {
    const { N, dt, t, f, rnd } = c, u = N / 125, g = s.ground * N, bps = f.bpm ? f.bpm / 60 : 2;
    // chapters: every four bars on a tracked beat, about nine seconds without one, or on a new section
    s.chT += dt;
    s.evT += dt;
    const bar = beatLocked(c) && f.beat.on && f.beat.count % 16 === 0 && s.chT > 4;
    if (!s.done && (f.section || bar || (!beatLocked(c) && s.chT > 9))) {
      if (s.ch < 3) { s.ch++; s.chT = 0; startBeat(s, rnd); } else s.done = true; // main.js grows the next story over this one
    }
    if (s.done && s.chT > 14) newStory(s, rnd); // nobody took over: start the next one here
    const beat = s.story.beats[s.ch], act = beat.act, F = s.F, R = s.R;
    s.windy = beat.weather === 'wind';
    // the beats that passed this frame, read off the tracked beat when there is one, so steps land on it
    const bp = f.beat.count + f.beat.phase;
    let db = dt * bps;
    if (beatLocked(c) && s.bp != null && bp - s.bp >= 0 && bp - s.bp < 0.5) db = bp - s.bp;
    s.bp = beatLocked(c) ? bp : null;
    stepFigure(F, act, db);
    // the companion walks up to the figure, and on a shared ending walks off with it
    const cp = s.comp;
    let cpAct = 'stand', cpMoving = false;
    if (cp && cp.kind === 'person') {
      const G = cp.F;
      if (cp.together) { G.dir = F.dir; G.leaving = true; cpAct = 'walk'; }
      else if (Math.abs(cp.target - G.x) > 0.01) {
        G.dir = Math.sign(cp.target - G.x);
        cpAct = 'walk';
        if (Math.abs(cp.target - G.x) < 0.02) G.x = cp.target;
      } else { G.dir = Math.sign(F.x - G.x) || 1; cpAct = act === 'wave' ? 'wave' : 'stand'; }
      stepFigure(G, cpAct, db);
    } else if (cp) { // the animal trots up, or keeps pace with the figure; its legs turn over with the ground covered
      let dx = 0;
      if (cp.together) { cp.dir = F.dir; dx = F.dx; }
      else if (Math.abs(cp.target - cp.x) > 0.01) { cp.dir = Math.sign(cp.target - cp.x); dx = cp.dir * dt * 0.12; }
      else cp.dir = Math.sign(F.x - cp.x) || 1;
      cp.x += dx;
      cpMoving = dx !== 0;
      cp.ph += Math.abs(dx) * (cp.kind === 'dog' ? 100 : 125);
    }
    // a drag (or a sip) once a bar: the hand comes up, the ember glows, then a cloud of smoke
    const barPos = f.bpm ? ((f.beat.count + f.beat.phase) % 4) / 4 : (t % 4) / 4;
    const lift = barPos < 0.45 ? Math.sin((barPos / 0.45) * Math.PI) : 0;
    s.exhale = s.barPos < 0.45 && barPos >= 0.45;
    s.barPos = barPos;
    s.puffArm = follow(s.puffArm, lift > 0.05 ? 1 : 0, dt, 0.18);
    s.ember = follow(s.ember, lift, dt, 0.1);
    for (const h of c.hits) {
      if (beat.weather === 'storm' && isLow(h) && h.strength > 0.5) strike(s, rnd);
      if (h.kind === 'hat') s.tw[Math.floor(rnd() * s.tw.length)] = 0.4;
      if (h.kind === 'snare') { s.lampOff = 0.1; s.lit[Math.floor(rnd() * s.lit.length)] ^= true; }
      if (isTonal(h)) s.keys[h.pc % 8] = 1;
      if (beat.weather === 'confetti') for (let k = 0; k < 6; k++) s.conf.push({ x: rnd(), y: -rnd() * 0.08, a: rnd() * TAU, c: 1 + Math.floor(rnd() * 3) });
    }
    if (beat.event === 'shootingstar' && !s.star && rnd() < dt * 0.3) s.star = { x: 0.7 + rnd() * 0.25, y: 0.05 + rnd() * 0.15, t: 0 };
    if (s.star && (s.star.t += dt) > 1.4) s.star = null;
    s.flash -= dt;
    s.lampOff -= dt;
    s.hourA += dt * 0.02;
    s.ring = Math.max(0, s.ring - dt * 0.15);
    for (let k = 0; k < s.tw.length; k++) s.tw[k] -= dt;
    for (let k = 0; k < 8; k++) s.keys[k] = Math.max(0, s.keys[k] - dt * 3);
    if (s.vehicle && ((s.vehicle.x += s.vehicle.v * dt) > 1.3 || s.vehicle.x < -2.2)) s.vehicle = null;
    s.conf = s.conf.filter((p) => {
      p.y += dt * 0.18;
      p.x += Math.sin(p.a) * dt * 0.05;
      p.a += dt * 4;
      return p.y < s.ground;
    }).slice(-300);
    s.roof = null;
    s.shelter = null;

    teSetting(r, s, c);
    for (const bd of s.birds) { // pigeons pecking, until something sends them up
      const bx = bd.x * N;
      if (!bd.fly) {
        const peck = Math.max(0, Math.sin(t * 5 + bd.ph)) * u;
        r.disc(bx, g - 1.6 * u, 1.5 * u, R.back);
        r.disc(bx + bd.d * 1.6 * u, g - 2.8 * u + peck, 0.9 * u, R.back);
      } else {
        bd.x += bd.vx * dt;
        bd.y += bd.vy * dt;
        const y = g + bd.y * N, flap = Math.floor(t * 10 + bd.ph) % 2 ? 1.5 * u : 0;
        r.line(bx - 2 * u, y - flap, bx, y, R.back);
        r.line(bx, y, bx + 2 * u, y - flap, R.back);
      }
    }
    if (cp?.kind === 'person' && !cp.F.out) teFigure(r, tePose(cpAct, cp.F, s, c), cp.F, N, R);
    else if (cp && cp.x > -0.2 && cp.x < 1.2) teAnimal(r, cp, s, c, cpMoving);
    if (act !== 'balloon' && !s.balloonFree) s.bal = null;
    if (!F.out) {
      const held = act === 'guitar' ? (hip, fu) => { // a guitar across the body, under the strumming hand
        const d = F.dir, bx = hip[0] + d * 2 * fu, by = hip[1] - 1 * fu;
        r.stroke(bx + d * 2 * fu, by - 2 * fu, bx + d * 12 * fu, by - 9 * fu, Math.max(1, 1.2 * fu), R.line);
        r.disc(bx, by, 4.6 * fu, R.acc);
        r.disc(bx + d * 2.6 * fu, by - 2.4 * fu, 3.3 * fu, R.acc);
        r.disc(bx + d * 1.3 * fu, by - 1.2 * fu, 1.2 * fu, R.sky === 0 ? 1 : R.sky);
      } : null;
      teProps(r, s, c, act, teFigure(r, tePose(act, F, s, c), F, N, R, held), F);
    }
    if (s.bal) { // the balloon: held, or let go: from rest it gathers speed until the air holds it, and the wind takes it
      if (s.balloonFree) {
        s.balV = follow(s.balV, 0.08 * N, dt, 0.5);
        s.bal[1] -= dt * s.balV;
        s.bal[0] += (Math.sin(t) * 3 * u - (s.windy ? 0.25 * N : 0)) * dt;
      }
      const [bx, by, hand] = s.bal, from = s.balloonFree ? [bx - F.dir * 2 * u, by + 14 * u] : hand;
      if (by > -10 * u) {
        r.line(from[0], from[1], bx, by + 6 * u, R.line);
        r.disc(bx, by, 6 * u, R.acc);
        r.disc(bx - 2 * u, by - 2 * u, Math.max(0.6, u), 0);
      }
    }
    if (s.story.place === 'room') { // a desk in front, and a small synth whose keys light up with the notes
      const fu = u * F.size, dx = s.anchor * N + F.dir * 11 * fu, dy = g - 24.5 * fu;
      r.rect(dx - 14 * fu, dy, 28 * fu, 2 * fu, R.line);
      for (const x of [dx - 13 * fu, dx + 12 * fu]) r.rect(x, dy, Math.max(1, fu), g - dy, R.line);
      r.rect(dx - 8 * fu, dy - 3 * fu, 16 * fu, 3 * fu, 1);
      for (let k = 0; k < 8; k++) r.rect(dx - 7 * fu + k * 2 * fu, dy - 2 * fu, Math.max(1, fu), Math.max(1, fu), s.keys[k] > 0.2 ? R.acc : 0);
    }
    if (s.story.place === 'stage') // the crowd in front, bobbing on the beat
      for (let k = 0; k < 9; k++) {
        const x = ((k + 0.5) * N) / 9, bob = (k % 2 ? f.beat.pulse : 1 - f.beat.pulse) * 2 * u;
        r.disc(x, N - 9 * u - bob, 4.5 * u, 1);
        r.rect(x - 6 * u, N - 6 * u - bob, 12 * u, 6 * u + bob, 1);
      }
    s.smoke = s.smoke.filter((p) => (p.life -= dt) > 0);
    for (const p of s.smoke) { // rises, and slows as it spreads and thins
      p.y -= dt * 6 * u * (0.25 + 0.75 * Math.min(1, p.life));
      p.x += Math.sin(t * 2 + p.y * 0.3) * dt * 3 * u;
      p.r += dt * 1.2 * u;
      r.disc(p.x, p.y, p.r * Math.min(1, p.life), R.smoke);
    }
    teWeather(r, s, c, beat.weather);
  },
};
