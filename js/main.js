// ep-visual: play pads or feed LINE IN, read the mood, paint it on a 1000x1000 pixel canvas.
import { Raster, bayer, clamp, hexRgb, makeNoise, rankMap, rng } from './pixels.js';
import { Listener, MOODS, Mood, analyzeBuffer } from './analysis.js';
import { MOOD_STYLES, STYLES, styleMeaning } from './styles.js';
import { EFFECTS, LightShow } from './light.js';
import { Groove, grooveFit, wantOf } from './groove.js';
import { PROFILES } from './profiles.js';
import { meaning, meaningKey } from './meaning.js';
import { renewNext } from './mixer.js';
import { LOOPBACK, NowPlaying } from './nowplaying.js';
import { Touch } from './touch.js';
import { Recorder } from './record.js';

const $ = (sel) => document.querySelector(sel);
const SIZE = 1000;
const FPS = 30;
const KEEP = 0.4; // share of the canvas a pit or a breakdown leaves standing while the music plays
const SILENCE = 3; // seconds of next to nothing before the quiet may dry the picture away
const PAD_LABELS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'ent'];
const KEYMAP = {
  Digit1: 0, Digit2: 1, Digit3: 2, KeyQ: 3, KeyW: 4, KeyE: 5, KeyA: 6, KeyS: 7, KeyD: 8, KeyZ: 9, KeyX: 10, KeyC: 11,
  Numpad7: 0, Numpad8: 1, Numpad9: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5, Numpad1: 6, Numpad2: 7, Numpad3: 8,
  NumpadDecimal: 9, Numpad0: 10, NumpadEnter: 11,
};
const KIND_ORDER = ['kick', 'snare', 'hat', 'perc', 'bass', 'keys', 'pad', 'loop', 'fx'];
const KIND_Y = { kick: 0.82, bass: 0.72, snare: 0.55, perc: 0.48, loop: 0.5, fx: 0.4, keys: 0.38, pad: 0.3, hat: 0.18 };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PAPER = [255, 255, 255];

// ---------------------------------------------------------------------------------------------- audio
const actx = new AudioContext({ latencyHint: 'interactive' });
const bus = actx.createGain(); // everything the listener hears
const master = actx.createGain(); // pads -> speakers
master.connect(actx.destination);
master.connect(bus);
const lineGain = actx.createGain();
const monitorGain = actx.createGain();
monitorGain.gain.value = 0;
lineGain.connect(bus);
lineGain.connect(monitorGain).connect(actx.destination);
const listener = new Listener(actx, bus);
const mood = new Mood();
const light = new LightShow(); // flashes, beams and leaks over whatever is on the canvas
const groove = new Groove(); // how much the picture can take right now, and where the squares begin
let lineIn = null;
const resume = () => actx.state !== 'running' && actx.resume();

// ---------------------------------------------------------------------------------------------- state
const st = {
  N: 125, px: 1, fade: 8, gap: true, label: false, hold: false, art: 'auto',
  seed: (Math.random() * 2 ** 32) >>> 0,
  // the picture shows where the sound has soaked in: `wet` patches from each hit, plus an overall `wash` that
  // rises with playing. In the quiet `dryK` falls from 1 to 0 over `fade` seconds and scales both, so the
  // picture shrinks back toward its wettest spots; sound commits the drying so far and starts afresh.
  // `edge` makes the borders ragged. `ink` = share of the canvas shown.
  wet: null, edge: null, drops: [], wash: 0, dryK: 1, commit: false, ink: 0, idle: true, silentT: 0,
  cur: null, prev: null, mix: 1, mixMap: null, vis: null, moodName: null, sceneT: 0, variant: {}, variantFor: {}, f: null,
  want: null, wantSince: 0, force: false, sectionsHere: 0, section: null, crossed: false,
  // the groove's event and the line of a square, held for the next scene frame like the section
  gevent: null, line: false,
  // how the next picture comes in (`trans`) and the camera maps for it (`cam`); how long this one has been up;
  // each mood's styles in this session's order
  trans: null, cam: null, forceTrans: null, order: {}, sceneBeats: 0, sceneTime: 0,
  hits: [], lastHit: { x: 0.5, y: 0.5 }, lastPadHit: -1,
};
const groups = { A: Array(12).fill(null), B: Array(12).fill(null), C: Array(12).fill(null), D: Array(12).fill(null) };
let group = 'A';

const big = $('#stage');
const bigCtx = big.getContext('2d');
const small = document.createElement('canvas');
const smallCtx = small.getContext('2d');
let img = null;
let gapLayer = null;

function hashStr(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// `mood` matters to styles that are `byMood` (the TE stories, the retro mixer): they pick their tale, inks or
// recipe from it; `reason` tells them why they are being remade ('drop': a fresh start is wanted); `want` is what
// the groove asks of the picture (groove.js), a drop asking for everything
function makeScene(name, mood = st.moodName || 'focused', reason = null) {
  const def = STYLES[name];
  const seed = (st.seed ^ hashStr(name + mood)) >>> 0;
  const s = {}, g = st.f?.groove;
  const want = g ? wantOf(reason === 'drop' ? { ...g, state: 'drop', budget: 1 } : g) : null;
  def.init(s, { N: st.N, px: st.px, seed, rnd: rng(seed), mood, reason, want });
  return { name, mood, def, s, raster: new Raster(st.N), rnd: rng(seed ^ 0x9e3779b9), rgb: (s.palette || def.palette).map(hexRgb) };
}

// the picture needs replacing: another style, or a style that tells a different story for the new mood
const outdated = (want, moodName) => want !== st.cur.name || (STYLES[want].byMood && st.cur.mood !== moodName);

// each mood's styles in an order of their own for this session, so the variants never come round the same way
function orderFor(moodName) {
  if (!st.order[moodName]) {
    const r = rng((st.seed ^ hashStr(moodName)) >>> 0), a = [...MOOD_STYLES[moodName]];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    st.order[moodName] = a;
  }
  return st.order[moodName];
}

// the style for a mood: the one picked in the panel, or the mood's current variant (a new section or a long enough
// stay moves it on)
function sceneFor(moodName) {
  if (st.art !== 'auto') return st.art;
  const styles = orderFor(moodName);
  // a mood's variant was picked for what the last track was about: with a new meaning it is picked again, so a mood
  // the music moves into shows the track's meaning too, not the style it had before
  if ((st.variantFor[moodName] ?? '') !== meaningKey()) {
    if (meaning() && styles.length > 1) nextVariant(moodName);
    else st.variantFor[moodName] = meaningKey();
  }
  return styles[(st.variant[moodName] || 0) % styles.length];
}

// The mood moves on to another of its styles: of the next three in its order, the one whose measured groove
// (profiles.js) best answers what the music does now. A family or the mix picks its worlds by the groove itself, so
// it counts as middling here. While a track plays, what it is about counts as much (meaning.js): then every style
// of the mood is a candidate, and the one before this one counts a little less, so two do not just alternate.
function nextVariant(moodName) {
  const styles = orderFor(moodName), at = st.variant[moodName] || 0, want = wantOf(st.f?.groove);
  const profile = (k) => PROFILES[k === 'te' ? 'story' : k];
  const span = Math.min(meaning() ? styles.length - 1 : 3, styles.length - 1), before = st.prevStyle;
  const score = (k) => { const n = styles[k % styles.length]; return (0.25 + grooveFit(profile(n), want)) * styleMeaning(n) * (n === before ? 0.6 : 1); };
  let best = at + 1;
  for (let k = at + 1; k <= at + span; k++) if (score(k) > score(best)) best = k;
  st.prevStyle = styles[at % styles.length];
  st.variant[moodName] = best;
  st.variantFor[moodName] = meaningKey();
}

// Domain-warped noise for the borders of the soaked patches, so they look poured rather than stamped.
function buildMaps() {
  const N = st.N, noise = makeNoise(st.seed), warp = makeNoise(st.seed ^ 0x5bd1e995);
  const raw = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = (x * 4) / N, v = (y * 4) / N;
      raw[y * N + x] = noise.fbm(u + 2 * warp.fbm(u, v), v + 2 * warp.fbm(u + 5.2, v + 1.3), 4);
    }
  // ranked, so the wash uncovers (and dries off) the canvas at an even pace
  st.edge = rankMap(raw).map((r) => 0.2 + 0.7 * r);
  st.wet = new Float32Array(N * N);
  st.drops = [];
  st.wash = 0;
  st.dryK = 1;
}

// When a new style comes in it floods out from the last hit along the cheapest paths: a rough but connected front
// (first-passage percolation, no islands ahead of it) that also hesitates at the new picture's colour borders, so
// it fills one region at a time like paint-by-numbers. Returns arrival order, ranked to 0..1.
function growMap(x, y, sc) {
  const N = st.N, M = N * N, noise = makeNoise((st.seed ^ hashStr(sc.name)) >>> 0);
  const luma = new Float32Array(M), cost = new Float32Array(M), T = new Float32Array(M).fill(Infinity);
  for (let i = 0; i < M; i++) {
    const c = sc.rgb[sc.raster.buf[i]];
    luma[i] = (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;
  }
  for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) cost[yy * N + xx] = 1 + 3 * noise.fbm((xx * 6) / N, (yy * 6) / N, 3) ** 2;
  const hk = new Float64Array(M * 8 + 8), hv = new Int32Array(M * 8 + 8);
  let hn = 0;
  const push = (k, v) => {
    let i = hn++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= k) break;
      hk[i] = hk[p]; hv[i] = hv[p]; i = p;
    }
    hk[i] = k; hv[i] = v;
  };
  const start = clamp(Math.floor(y * N), 0, N - 1) * N + clamp(Math.floor(x * N), 0, N - 1);
  T[start] = 0;
  push(0, start);
  while (hn) {
    const at = hv[0], t = hk[0], lk = hk[--hn], lv = hv[hn];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= hn) break;
      if (c + 1 < hn && hk[c + 1] < hk[c]) c++;
      if (hk[c] >= lk) break;
      hk[i] = hk[c]; hv[i] = hv[c]; i = c;
    }
    hk[i] = lk; hv[i] = lv;
    if (t > T[at]) continue;
    const ax = at % N, ay = (at / N) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = ax + dx, ny = ay + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const j = ny * N + nx, step = (dx && dy ? 1.414 : 1) * (cost[at] + cost[j]) * 0.5 + 6 * Math.abs(luma[at] - luma[j]);
        if (t + step < T[j]) { T[j] = t + step; push(T[j], j); }
      }
  }
  return rankMap(T);
}

// The camera moves between two pictures (the flood above is the fourth way in). dive: the new scene hangs as a
// small picture at the focal point of the old one and the camera flies into it until it fills the frame. pull: the
// reverse, the camera pulls back and the old scene turns out to be a picture hanging in the new one, which then
// switches off. door: the old picture swings away on a hinge (left, right, top or bottom) in perspective, the new
// one is behind it. Fills `who` (1 the new scene, 2 the old), `src` (the cell to sample) and `dim` (shading).
function cameraMap(N, tr, m) {
  if (st.cam?.N !== N) st.cam = { N, who: new Uint8Array(N * N), src: new Int32Array(N * N), dim: new Float32Array(N * N) };
  const { who, src, dim } = st.cam, idx = (x, y) => clamp(y | 0, 0, N - 1) * N + clamp(x | 0, 0, N - 1);
  if (tr.kind === 'door') {
    const h = tr.hinge, horiz = h < 2, flip = h & 1, th = m * 1.53, cs = Math.cos(th), sn = Math.sin(th), D = 1.4 * N, fb = (horiz ? tr.fy : tr.fx) * N;
    for (let y = 0, i = 0; y < N; y++)
      for (let x = 0; x < N; x++, i++) {
        let A = (horiz ? x : y) + 0.5;
        const B = (horiz ? y : x) + 0.5;
        if (flip) A = N - A;
        const den = D * cs - A * sn; // the door's own coordinate `s` along the hinge's normal, seen at screen A
        let s = 0, v = 0, onDoor = false;
        if (den > 1e-6) { s = (A * D) / den; v = fb + ((B - fb) * (D + s * sn)) / D; onDoor = s >= 0 && s < N && v >= 0 && v < N; }
        if (onDoor) {
          const u = flip ? N - s : s;
          who[i] = 2; src[i] = horiz ? idx(u, v) : idx(v, u); dim[i] = 1 - (0.5 * s * sn) / N;
        } else { who[i] = 1; src[i] = i; dim[i] = 1; }
      }
    return st.cam;
  }
  // a zoom about the one point that takes the window (the small picture) to the full frame
  const dive = tr.kind === 'dive', Z = tr.Z, z = Z ** (dive ? m : 1 - m), hw = N / (2 * Z), fx = tr.fx * N, fy = tr.fy * N;
  const px = ((fx - hw) * Z) / (Z - 1), py = ((fy - hw) * Z) / (Z - 1), win = dive || m < 0.7 ? 1 : 1 - (m - 0.7) / 0.3;
  const inner = dive ? 1 : 2, outer = dive ? 2 : 1, th = Math.max(1, 0.012 * N) / z;
  for (let y = 0, i = 0; y < N; y++)
    for (let x = 0; x < N; x++, i++) {
      const ox = px + (x + 0.5 - px) / z, oy = py + (y + 0.5 - py) / z, dx = ox - fx, dy = oy - fy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d < hw * win) { who[i] = inner; src[i] = idx((dx / hw + 1) * 0.5 * N, (dy / hw + 1) * 0.5 * N); dim[i] = 1; }
      else { who[i] = outer; src[i] = idx(ox, oy); dim[i] = d < hw * win + th ? 0.3 : 1; }
    }
  return st.cam;
}

// The clean cuts: every cell has a threshold, and the new picture owns the cells whose threshold the progress `m`
// has passed, with a darker front one step behind it. wipe: along a direction, with a dithered edge. iris: a circle
// opening from the focal point. blinds: eight strips, each revealed from its own edge. dissolve: the ordered-dither
// pixel dissolve of old video hardware. checker: tiles that pop in, in a fixed random order.
function maskMap(N, tr, m) {
  if (st.cam?.N !== N) st.cam = { N, who: new Uint8Array(N * N), src: new Int32Array(N * N), dim: new Float32Array(N * N) };
  const { who, src, dim } = st.cam, fx = tr.fx * N, fy = tr.fy * N, dx = Math.cos(tr.dir), dy = Math.sin(tr.dir);
  const far = Math.hypot(Math.max(fx, N - fx), Math.max(fy, N - fy)), S = Math.max(2, Math.round(N / 8)), span = N * (Math.abs(dx) + Math.abs(dy));
  for (let y = 0, i = 0; y < N; y++)
    for (let x = 0; x < N; x++, i++) {
      let thr;
      if (tr.kind === 'wipe') thr = ((dx > 0 ? x : N - 1 - x) * Math.abs(dx) + (dy > 0 ? y : N - 1 - y) * Math.abs(dy)) / span + (bayer(x, y) / 64) * 0.08;
      else if (tr.kind === 'iris') thr = Math.hypot(x + 0.5 - fx, y + 0.5 - fy) / far + (bayer(x, y) / 64) * 0.04;
      else if (tr.kind === 'blinds') thr = ((tr.dir < Math.PI ? x : y) % S) / S + (bayer(x, y) / 64) * 0.06;
      else if (tr.kind === 'dissolve') thr = bayer(x, y) / 64;
      else thr = hashStr(`${(x / S) | 0},${(y / S) | 0},${tr.seed}`) / 4294967296;
      who[i] = thr <= m ? 1 : 2;
      src[i] = i;
      dim[i] = who[i] === 1 && thr > m - 0.025 ? 0.72 : 1;
    }
  return st.cam;
}

function pickWeighted(w) {
  let u = Math.random() * Object.values(w).reduce((x, y) => x + y, 0);
  for (const k in w) if ((u -= w[k]) <= 0) return k;
  return 'wipe';
}

// How the next picture comes in: a drop dives, fast; otherwise mostly a clean cut (wipe, iris, blinds, dissolve,
// checker), now and then the paint flood or a camera move, which the arousal weighs (dives and doors for the loud
// parts, pull-backs for the quiet ones) and so does the groove's budget (the soft ways in for a breakdown, the hard
// ones when the music is full). The focal point is the last hit, kept off the edges.
function pickTransition(reason) {
  const a = mood.a, full = groove.budget, soft = 1.5 - full, hard = 0.5 + full;
  const kind = st.forceTrans || (reason === 'drop' ? 'dive' : pickWeighted({
    wipe: 1.2, iris: 1, blinds: 0.6, dissolve: 0.8 * soft, checker: 0.6 * hard, flood: 0.5 * soft, dive: (0.3 + 0.9 * a) * hard,
    pull: (0.3 + 0.6 * (1 - a)) * soft, door: (0.2 + 0.6 * a) * hard,
  }));
  const dur = { flood: 2, dive: reason === 'drop' ? 1 : 1.8, pull: 2, door: 1.5, wipe: 1.2, iris: 1.2, blinds: 1.2, dissolve: 1, checker: 1.4 }[kind];
  return { kind, fx: clamp(st.lastHit.x, 0.22, 0.78), fy: clamp(st.lastHit.y, 0.22, 0.78), dur, hinge: Math.floor(Math.random() * 4), Z: 4,
    dir: Math.floor(Math.random() * 4) * (Math.PI / 2), seed: (Math.random() * 1e9) | 0 };
}

function crossTo(name, reason = null) {
  const old = st.cur;
  st.cur = makeScene(name, undefined, reason);
  st.sectionsHere = 0;
  st.sceneBeats = 0;
  st.sceneTime = 0;
  st.crossed = true;
  if (!old || st.ink < 0.02 || !st.f) {
    st.prev = null;
    st.mix = 1;
    st.trans = null;
    return;
  }
  st.prev = old;
  st.mix = 0;
  runScene(st.cur, 1 / FPS, st.f, []); // one frame, so the flood can follow the new picture's shapes
  st.trans = pickTransition(reason);
  if (st.trans.kind === 'flood') st.mixMap = growMap(st.lastHit.x, st.lastHit.y, st.cur);
}

// A drop starts a fresh composition over the whole canvas. A new section first lets the style remix itself (a
// story's next chapter, a retro recipe's next part, a new light on the buildings); after a couple of those the
// mood moves on to its next style.
function onSection(kind, moodName) {
  if (kind === 'drop') {
    st.seed = (Math.random() * 2 ** 32) >>> 0;
    st.wash = 1;
    st.commit = true;
    crossTo(st.cur.name, 'drop');
    return;
  }
  const stay = STYLES[st.cur.name].byMood ? 3 : 2;
  if (st.art === 'auto' && MOOD_STYLES[moodName].length > 1 && ++st.sectionsHere >= stay) {
    nextVariant(moodName);
    st.force = true;
  }
}

function buildGap() {
  gapLayer = document.createElement('canvas');
  gapLayer.width = gapLayer.height = SIZE;
  const g = gapLayer.getContext('2d');
  const cs = SIZE / st.N, w = Math.max(1, Math.round(cs * 0.12));
  g.fillStyle = '#fff';
  for (let k = 0; k <= st.N; k++) {
    g.fillRect(Math.round(k * cs), 0, w, SIZE);
    g.fillRect(0, Math.round(k * cs), SIZE, w);
  }
}

function setResolution(N) {
  st.N = N;
  st.px = Math.max(1, Math.round(N / 100));
  small.width = small.height = N;
  img = smallCtx.createImageData(N, N);
  buildMaps();
  buildGap();
  st.cur = makeScene(st.cur?.name || sceneFor(mood.name));
  st.prev = null;
  st.mix = 1;
  st.trans = null;
  st.moodName ??= mood.name;
}

function reseed() {
  st.seed = (Math.random() * 2 ** 32) >>> 0;
  setResolution(st.N);
}

// ---------------------------------------------------------------------------------------------- hits
// `own`: a hit the player made (a pad, a jam note), which the picture always gets in full
function emitHit(kind, pc, strength, own = false) {
  if (st.idle) { reseed(); st.idle = false; }
  const x = pc >= 0 ? (pc + 0.2 + Math.random() * 0.6) / 12 : 0.08 + Math.random() * 0.84;
  const y = clamp((KIND_Y[kind] ?? 0.5) + (Math.random() - 0.5) * 0.16, 0.05, 0.95);
  const h = { kind, pc, strength, x, y, own };
  touch.hit(kind, strength);
  st.hits.push(h);
  if (st.hits.length > 64) st.hits.shift();
  st.lastHit = h;
  // the sound soaks into the canvas where it lands; at ~3 hits/s the patches cover it in ~10 s. A breakdown dabs,
  // a drop splashes
  st.drops.push({ x: x * st.N, y: y * st.N, R: st.N * (0.05 + 0.09 * strength) * (own ? 1 : 0.6 + 0.6 * groove.budget), age: 0 });
  st.wash = Math.min(1, st.wash + 0.004 + strength * 0.008);
  st.commit = true;
}

// patches spread out over 0.8 s after the hit, like ink into paper
function soak(dt) {
  const N = st.N, wet = st.wet;
  for (const d of st.drops) {
    d.age = Math.min(0.8, d.age + dt);
    const R = d.R * (1 - (1 - d.age / 0.8) ** 3);
    for (let y = Math.max(0, Math.floor(d.y - R)); y < Math.min(N, Math.ceil(d.y + R)); y++)
      for (let x = Math.max(0, Math.floor(d.x - R)); x < Math.min(N, Math.ceil(d.x + R)); x++) {
        const q = 1.6 * (1 - Math.hypot(x + 0.5 - d.x, y + 0.5 - d.y) / R);
        if (q > wet[y * N + x]) wet[y * N + x] = q;
      }
  }
  st.drops = st.drops.filter((d) => d.age < 0.8);
}

function classifyOnset(o, f) {
  if (f.tonal > 0.55) {
    let pc = 0;
    for (let i = 1; i < 12; i++) if (f.frameChroma[i] > f.frameChroma[pc]) pc = i;
    return { kind: f.bands.sub + f.bands.low > 0.5 ? 'bass' : 'keys', pc };
  }
  if (o.high > o.mid * 1.5 && o.high > o.low) return { kind: 'hat', pc: -1 };
  if (o.low > o.mid * 4) return { kind: 'kick', pc: -1 };
  if (o.mid + o.high > o.low * 0.5) return { kind: 'snare', pc: -1 };
  return { kind: 'perc', pc: -1 };
}

// ---------------------------------------------------------------------------------------------- pads
function trigger(i, velocity = 1) {
  resume();
  const el = $(`.pad[data-i="${i}"]`);
  el?.classList.add('hit');
  setTimeout(() => el?.classList.remove('hit'), 110);
  const pad = groups[group][i];
  if (!pad || !pad.buffer) return;
  if (pad.node) try { pad.node.stop(); } catch { /* already ended */ }
  const src = actx.createBufferSource();
  const g = actx.createGain();
  src.buffer = pad.buffer;
  g.gain.value = velocity;
  src.connect(g).connect(master);
  src.start();
  pad.node = src;
  src.onended = () => { if (pad.node === src) pad.node = null; };
  st.lastPadHit = performance.now() / 1000;
  emitHit(pad.info.kind, pad.info.pc, 0.75 * velocity, true);
}

function stopAll() {
  for (const g of Object.values(groups))
    for (const pad of g) if (pad?.node) try { pad.node.stop(); } catch { /* ended */ }
}

async function decode(arrayBuffer, name, source) {
  const buffer = await actx.decodeAudioData(arrayBuffer);
  return { name, source, buffer, info: analyzeBuffer(buffer), node: null };
}

async function loadFileToPad(file, g, i) {
  try {
    groups[g][i] = await decode(await file.arrayBuffer(), file.name.replace(/\.[^.]+$/, ''), 'drop');
  } catch (err) {
    status(`can't decode ${file.name}`);
  }
  renderPads();
}

function nextFreeSlots(count) {
  const out = [];
  for (const g of [group, ...'ABCD'.split('').filter((x) => x !== group)])
    for (let i = 0; i < 12 && out.length < count; i++) if (!groups[g][i]) out.push([g, i]);
  return out;
}

// Library folders become kits; the newest one is loaded first.
const kits = new Map();
let libraryDir = '';

async function loadLibrary() {
  let data;
  try {
    data = await (await fetch('/api/samples')).json();
  } catch {
    status('no library server · drop files on pads');
    return;
  }
  libraryDir = data.library_dir;
  for (const item of data.samples) {
    if (!kits.has(item.folder)) kits.set(item.folder, []);
    kits.get(item.folder).push(item);
  }
  const newest = (items) => Math.max(...items.map((x) => x.mtime));
  const order = [...kits.keys()].sort((a, b) => newest(kits.get(b)) - newest(kits.get(a)));
  $('#kitSel').innerHTML = order.map((k) => `<option value="${encodeURIComponent(k)}">${k === '.' ? 'library root' : k} · ${kits.get(k).length}</option>`).join('');
  if (order.length) await loadKit(order[0]);
  else status(`library empty · ${libraryDir}`);
}

// Files named like the pads they belong on ("a10_kick", "B3 bass") go there; the rest fill up in kind order.
const PAD_NAME = /^([a-d])(\d{1,2})(?=[_\-\s])/i;

let kitToken = 0;
async function loadKit(folder) {
  const token = ++kitToken;
  stopAll();
  for (const g of Object.values(groups)) g.fill(null);
  group = 'A';
  renderPads();
  const items = kits.get(folder) || [];
  status(`loading ${items.length} samples`);
  const loaded = [];
  await Promise.all(items.map(async (item) => {
    try {
      const res = await fetch(item.url);
      loaded.push(await decode(await res.arrayBuffer(), item.name, 'library'));
    } catch { /* skip undecodable files */ }
  }));
  if (token !== kitToken) return; // another kit was picked while this one was decoding
  loaded.sort((a, b) => KIND_ORDER.indexOf(a.info.kind) - KIND_ORDER.indexOf(b.info.kind) || a.name.localeCompare(b.name));
  const rest = [];
  for (const pad of loaded) {
    const m = PAD_NAME.exec(pad.name);
    const g = m && m[1].toUpperCase(), n = m && Number(m[2]);
    if (m && n >= 1 && n <= 12 && !groups[g][n - 1]) groups[g][n - 1] = pad;
    else rest.push(pad);
  }
  nextFreeSlots(rest.length).forEach(([g, i], k) => { groups[g][i] = rest[k]; });
  const placed = Object.values(groups).flat().filter(Boolean).length;
  status(`${folder === '.' ? 'library' : folder} · ${placed}${loaded.length > placed ? ` of ${loaded.length}` : ''} pads`);
  renderPads();
}

function renderPads() {
  const wrap = $('#pads');
  wrap.innerHTML = '';
  groups[group].forEach((pad, i) => {
    const el = document.createElement('button');
    el.className = 'pad' + (pad ? ' full' : '');
    el.dataset.i = i;
    const kind = pad ? [pad.info.kind, pad.info.note].filter(Boolean).join(' · ') : 'empty';
    el.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span><span class="lbl">${PAD_LABELS[i]}</span>` +
      `<span class="name"></span><span class="kind">${kind}</span>`;
    el.querySelector('.name').textContent = pad ? pad.name : '—';
    el.title = pad ? `${pad.name}\n${kind}` : 'drop an audio file here';
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); trigger(i); });
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('drag');
      if (e.dataTransfer.files[0]) loadFileToPad(e.dataTransfer.files[0], group, i);
    });
    wrap.appendChild(el);
  });
  document.querySelectorAll('.grp').forEach((b) => {
    b.classList.toggle('on', b.dataset.g === group);
    b.classList.toggle('has', groups[b.dataset.g].some(Boolean));
  });
}

// ---------------------------------------------------------------------------------------------- line in
// The stand's USB audio: the EP-136 sidekick hears both of its inputs and its FX, a sampler only itself.
const STAND_INPUTS = [/sidekick|EP[-\s]?136/i, /EP[-\s]?(133|1320|40)\b|K\.O\.|riddim|medieval|teenage/i];
// ?listen=stand (open_visualizer with the stand connected): start on that input, and as soon as it is plugged in
const standMode = new URLSearchParams(location.search).get('listen') === 'stand';

const audioInputs = async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
const standInput = (devices) => STAND_INPUTS.map((re) => devices.find((d) => re.test(d.label))).find(Boolean) || null;

async function listInputs() {
  const sel = $('#inputSel');
  const devices = await audioInputs();
  const keep = sel.value;
  sel.innerHTML = devices.map((d, k) => `<option value="${d.deviceId}">${d.label || `input ${k + 1}`}</option>`).join('');
  if (keep && devices.some((d) => d.deviceId === keep)) sel.value = keep;
  else if (standInput(devices)) sel.value = standInput(devices).deviceId;
  return devices;
}

async function startLineIn(deviceId = $('#inputSel').value) {
  stopLineIn();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, channelCount: { ideal: 8 }, echoCancellation: false,
        noiseSuppression: false, autoGainControl: false },
    });
    await useLineStream(stream);
  } catch (err) {
    status(err.name === 'NotAllowedError' ? 'line in blocked · allow the microphone for this page' : `line in failed · ${err.name}`);
  }
}

// Any audio stream becomes the line in: an input device, or the computer's own output shared by the browser or
// streamed by the server (`label` names it then, and the input list is left alone; `onStop` ends the feed).
async function useLineStream(stream, label = null, onStop = null) {
  stopLineIn();
  resume(); // not awaited: without a click on the page Chrome keeps it pending
  const node = actx.createMediaStreamSource(stream);
  const track = stream.getAudioTracks()[0];
  lineIn = { stream, node, track, label: label || track?.label || 'input', pairs: splitPairs(node, track), auto: 0, using: 0, onStop };
  routePairs();
  track?.addEventListener('ended', () => { // unplugged, or sharing stopped: wait for it to come back
    if (lineIn?.track !== track) return;
    stopLineIn();
    status(label ? `${label} stopped` : 'line in gone · waiting for the stand');
  });
  $('#lineBtn').classList.add('on');
  await listInputs();
  if (!label && track?.getSettings().deviceId) $('#inputSel').value = track.getSettings().deviceId;
  lineStatus();
}

// A multichannel input (the sidekick has 8 USB inputs and the guide doesn't say which carry what) is split into
// pairs 1-2, 3-4, ...; one pair at a time goes to the listener: the one picked, or in auto the loudest.
function splitPairs(node, track) {
  const n = Math.max(1, track?.getSettings().channelCount || 2);
  const split = actx.createChannelSplitter(n);
  node.connect(split);
  const pairs = [];
  for (let c = 0; c < n; c += 2) {
    const merge = actx.createChannelMerger(2), gain = actx.createGain(), meter = actx.createAnalyser();
    split.connect(merge, c, 0);
    split.connect(merge, Math.min(c + 1, n - 1), 1);
    meter.fftSize = 512;
    merge.connect(gain).connect(lineGain);
    merge.connect(meter);
    gain.gain.value = 0;
    pairs.push({ label: c + 1 < n ? `${c + 1}-${c + 2}` : `${c + 1}`, gain, meter, buf: new Float32Array(512), rms: 0 });
  }
  const sel = $('#pairSel'), keep = sel.value;
  sel.innerHTML = '<option value="auto">auto · loudest</option>' + pairs.map((p) => `<option value="${p.label}">${p.label}</option>`).join('');
  sel.value = pairs.some((p) => p.label === keep) ? keep : 'auto';
  $('#pairRow').hidden = pairs.length < 2;
  return pairs;
}

function routePairs() {
  if (!lineIn) return;
  const want = lineIn.pairs.findIndex((p) => p.label === $('#pairSel').value);
  lineIn.using = want >= 0 ? want : lineIn.auto;
  lineIn.pairs.forEach((p, k) => p.gain.gain.setTargetAtTime(k === lineIn.using ? 1 : 0, actx.currentTime, 0.05));
  lineStatus();
}

// a couple of times a second: in auto the loudest pair takes over once it is clearly (3 dB) louder for a while
function meterPairs(dt) {
  if (!lineIn || lineIn.pairs.length < 2) return;
  for (const p of lineIn.pairs) {
    p.meter.getFloatTimeDomainData(p.buf);
    let s = 0;
    for (let i = 0; i < p.buf.length; i++) s += p.buf[i] * p.buf[i];
    p.rms += (Math.sqrt(s / p.buf.length) - p.rms) * Math.min(1, dt / 1.5);
  }
  let best = 0;
  lineIn.pairs.forEach((p, k) => { if (p.rms > lineIn.pairs[best].rms) best = k; });
  if (best !== lineIn.auto && lineIn.pairs[best].rms > 1.41 * lineIn.pairs[lineIn.auto].rms + 1e-4) {
    lineIn.auto = best;
    routePairs();
  }
}

function lineStatus() {
  if (!lineIn) return;
  const pairs = lineIn.pairs.length > 1 ? ` · ${lineIn.pairs.length * 2} ch · ${lineIn.pairs[lineIn.using].label}` : '';
  status(`line in · ${lineIn.label}${pairs}${actx.state === 'running' ? '' : ' · click to start'}`);
}

function stopLineIn() {
  if (!lineIn) return;
  lineIn.node.disconnect();
  lineIn.pairs.forEach((p) => p.gain.disconnect());
  lineIn.stream.getTracks().forEach((t) => t.stop());
  lineIn.onStop?.();
  lineIn = null;
  $('#lineBtn').classList.remove('on');
  $('#sysBtn')?.classList.remove('on');
}

// Stand mode: labels need the microphone permission, so ask once on the default input, then move to the stand.
let standBusy = false;
async function followStand() {
  if (standBusy || !navigator.mediaDevices) return;
  standBusy = true;
  try {
    let devices = await audioInputs();
    if (!devices.some((d) => d.label)) {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
      devices = await audioInputs();
    }
    await listInputs();
    const dev = standInput(devices);
    if (!dev) {
      if (!lineIn) status('waiting for the stand · plug in the EP-136 or a sampler');
      return;
    }
    if (lineIn?.track?.getSettings().deviceId === dev.deviceId) return;
    $('#inputSel').value = dev.deviceId;
    await startLineIn();
  } catch (err) {
    status(err.name === 'NotAllowedError' ? 'line in blocked · allow the microphone for this page' : `line in failed · ${err.name}`);
  } finally {
    standBusy = false;
  }
}
actx.addEventListener('statechange', lineStatus);

// ---------------------------------------------------------------------------------------------- jam
// A jam (the MCP `jam` tool) sends every note it plays and hears from the sampler, plus its beat: exact hits and
// an exact clock on top of what the line in picks up.
const jam = { state: '', bpm: 0, clock: '', you: 0, claude: 0 };
function connectJam() {
  if (!window.EventSource) return;
  new EventSource('/api/events').onmessage = (e) => {
    let ev;
    try { ev = JSON.parse(e.data); } catch { return; }
    const now = performance.now() / 1000;
    if (ev.type === 'note') {
      st.lastPadHit = now; // the line in hears this hit a moment later: count it once
      emitHit(ev.kind || 'perc', -1, 0.75 * (ev.velocity || 100) / 127, true);
      jam[ev.who === 'claude' ? 'claude' : 'you']++;
    } else if (ev.type === 'beat') {
      listener.clock(ev.beat, ev.bpm, now);
    } else if (ev.type === 'jam') {
      Object.assign(jam, { state: ev.state, bpm: ev.bpm || 0, clock: ev.clock || '' });
      if (ev.state !== 'playing' && ev.state !== 'listening') listener.clock(0, 0, now);
    } else if (ev.type === 'track') { // what the computer (Spotify) plays, and what is known about it
      nowPlaying.onEvent(ev);
    } else if (ev.type === 'td' || ev.type === 'control') { // the TouchDesigner bridge, and what it sends back
      touch.onEvent(ev);
    } else if (ev.type === 'record') { // record_visual: a clip of the canvas with its sound
      recorder.onEvent(ev);
    }
  };
}

function jamText() {
  if (!jam.state || jam.state === 'stopped') return '';
  return `jam · ${jam.state} · ${jam.bpm} bpm · ${jam.clock} clock · you ${jam.you} · claude ${jam.claude}`;
}

// ---------------------------------------------------------------------------------------------- frame
let last = performance.now() / 1000, lastDraw = 0, lastUi = 0;

function step(ms) {
  const now = ms / 1000, dt = Math.min(0.1, Math.max(0.001, now - last));
  last = now;
  const f = listener.update(now, dt);
  // the groove: the part of the track, the budget of junk, the squares. The drop is the groove's to call (it hears
  // the bass slam back on the frame; the listener's own guess comes a beat late and is its fallback), and the bar
  // lines follow its squares
  placeTrack(); // (the loopback's lag drifts a little)
  const g = (f.groove = groove.update(f, now, dt));
  if (g.shift && listener.shiftBeats(g.shift, now)) groove.shifted(g.shift, g);
  listener.lockTo(g.grid?.bpm, g.grid?.beats);
  f.section = g.event === 'drop' ? 'drop' : f.section === 'change' ? 'change' : null;
  if (g.event && st.gevent !== 'drop') st.gevent = g.event;
  if (g.square?.line) st.line = true;
  const name = mood.update(f, dt, now);

  if (f.onset) {
    const k = classifyOnset(f.onset, f);
    if (now - st.lastPadHit > 0.1) emitHit(k.kind, k.pc, f.onset.strength);
  }
  // a breakdown dries the picture back toward its wettest spots, as the quiet does: the paper shows through. While
  // the music plays that only strips it down (a pit or a breakdown keeps `KEEP` of the canvas); a real silence, a
  // few seconds of next to nothing (the track stopped), dries it away
  const quiet = Math.max(clamp(1 - f.level * 2.5), g.state === 'break' ? 0.75 * clamp((0.45 - g.budget) / 0.3) : 0);
  st.silentT = f.level < 0.1 ? st.silentT + dt : 0;
  st.wash = Math.min(1, st.wash + f.level * dt * 0.035);
  if (!st.hold && (st.silentT > SILENCE || st.ink > KEEP)) st.dryK = Math.max(0, st.dryK - (dt / st.fade) * quiet);
  if (f.level > 0.1) st.commit = true;
  if (f.level > 0.25 && st.idle) { reseed(); st.idle = false; }

  st.moodName = name;
  st.f = f;
  // development: a picture never outstays its welcome. After `hold` bars (fewer when the music is up) the mood's
  // next style comes in even if the music never announced a new section; a style that remixes itself (the mixes,
  // the stories) gets longer, since it moves on by itself; a fixed classic style is recomposed instead. It comes
  // on the line of a square, and never in a build or a pit: the drop that follows brings a new picture anyway
  const sq = g.square, waiting = g.state === 'build' || g.state === 'pit';
  if (f.beat.on) st.sceneBeats++;
  st.sceneTime += dt;
  if (!st.idle && !st.prev && st.ink > 0.2 && !waiting) {
    const self = STYLES[st.cur.name].byMood, hold = (mood.a > 0.6 ? 8 : mood.a > 0.42 ? 12 : 16) * (self ? 1.5 : 1);
    if (sq ? sq.line && st.sceneBeats >= hold * 4 - 4 : f.bpm > 0 && f.beat.conf > 0.15 ? st.sceneBeats >= hold * 4 : st.sceneTime > hold * 1.9) {
      if (st.art === 'auto' && orderFor(name).length > 1) { nextVariant(name); st.force = true; }
      else if (!self) { st.seed = (Math.random() * 2 ** 32) >>> 0; crossTo(st.cur.name); }
      st.sceneBeats = 0;
      st.sceneTime = 0;
    }
  }
  if (f.section && !st.idle && st.ink > 0.2) onSection(f.section, name);
  const want = sceneFor(name);
  if (outdated(want, name)) {
    if (st.want !== want + name) { st.want = want + name; st.wantSince = now; }
    // a mood has to hold for two seconds before the picture follows it (six to cut a story short), and with a
    // tempo it waits for the line of a square (for the bar line if one has not come in a square's time)
    const storyOnly = want === st.cur.name, fixed = st.art !== 'auto' && storyOnly;
    const settled = st.force || (st.art !== 'auto' && !fixed) || st.ink < 0.02 || now - st.wantSince > (storyOnly ? 6 : 2);
    const late = sq && now - st.wantSince > 2 + 16 * f.beat.T;
    const onBar = sq ? sq.line || (late && f.beat.on && f.beat.count % 4 === 0) : !(f.bpm && f.beat.conf > 0.15) || (f.beat.on && f.beat.count % 4 === 0);
    if (settled && (onBar || (st.art !== 'auto' && !fixed) || st.ink < 0.02)) {
      crossTo(want);
      st.force = false;
    }
  } else st.want = null;
  // a story style asks for its next story by finishing the last one (a mix, for its next world): grow it in over the
  // old one, on the line of a square
  if (st.cur.s.done && !st.prev && !st.idle && (!sq || sq.line) && !waiting) {
    st.seed = (Math.random() * 2 ** 32) >>> 0;
    crossTo(st.cur.name);
  }
  // the scene draws every other step, so a section event is held for it; a scene made this very step was made
  // for that event already and should not see it again
  if (f.section && !st.crossed) st.section = f.section;
  st.crossed = false;
  touch.frame(f, now);

  if (now - lastDraw >= 1 / FPS - 0.002) {
    const step = Math.min(0.1, now - lastDraw);
    lastDraw = now;
    if (!st.hold) draw(step, f);
  }
  if (now - lastUi >= 1 / 15) {
    lastUi = now;
    drawUi(f);
  }
}

let lastRaf = 0;
function loop(ms) {
  lastRaf = performance.now();
  step(ms);
  requestAnimationFrame(loop);
}
// rAF stalls when the window isn't painted (covered window, OBS/background capture); keep listening on a timer.
setInterval(() => {
  if (performance.now() - lastRaf > 120) step(performance.now());
}, 16);

function runScene(sc, dt, f, hits) {
  sc.def.draw(sc.s, { N: st.N, px: st.px, t: st.sceneT, dt, f, hits, rnd: sc.rnd, seed: st.seed }, sc.raster);
  if (sc.s.paletteDirty) { // a style that recoloured itself mid-way (a mix swapping its palette): fade over to it
    sc.rgbFrom = sc.rgb;
    sc.rgbTo = sc.s.palette.map(hexRgb);
    sc.rgbT = 0;
    sc.s.paletteDirty = false;
  }
  if (sc.rgbTo) {
    sc.rgbT = Math.min(1, sc.rgbT + dt / 0.6);
    const k = sc.rgbT;
    sc.rgb = sc.rgbTo.map((c, i) => (sc.rgbFrom[i] ? c.map((v, j) => sc.rgbFrom[i][j] + (v - sc.rgbFrom[i][j]) * k) : c));
    if (k >= 1) sc.rgbTo = null;
  }
}

// What the picture gets of the hits: all of them when the music has room, fewer as it empties out, so a breakdown
// is drawn with a few strokes; the notes stay longest (a breakdown is made of them), the player's own hits always.
function thin(hits, g) {
  const keep = clamp(0.15 + 1.1 * g.budget);
  return keep >= 1 ? hits : hits.filter((h) => h.own || h.strength > 0.9 || Math.random() < (h.pc >= 0 ? Math.max(keep, 0.6) : keep));
}

function draw(dt, f) {
  const N = st.N, hits = st.hits.splice(0);
  st.sceneT += dt;
  soak(dt);
  if (!st.idle) {
    // the section, the groove's event and the line of a square, held since the last scene frame
    const g = f.groove, gv = st.gevent || st.line ? { ...g, event: st.gevent ?? g.event, square: g.square && { ...g.square, line: st.line } } : g;
    const fs = st.section || gv !== g ? { ...f, section: st.section ?? f.section, groove: gv } : f;
    st.section = st.gevent = null;
    st.line = false;
    light.update(dt, fs, hits, mood.v, mood.a, st.sceneT, Math.random);
    const seen = thin(hits, gv);
    runScene(st.cur, dt, fs, seen);
    if (st.prev) {
      runScene(st.prev, dt, fs, seen);
      st.mix = Math.min(1, st.mix + dt / (st.trans?.dur || 2.5));
      if (st.mix >= 1) st.prev = null;
    }
  }
  const { wet, edge, cur, prev, mixMap } = st, m = st.mix * st.mix * (3 - 2 * st.mix);
  const commit = st.commit && st.dryK < 1, k = st.dryK;
  if (commit) {
    st.wash *= k;
    st.dryK = 1;
  }
  st.commit = false;
  const wash = st.wash * 1.2, kv = st.dryK, data = img.data;
  if (st.vis?.length !== N * N) st.vis = new Uint8Array(N * N);
  const vis = st.vis; // 0 paper, 1 current style, 2 the one it is replacing
  // where the new picture has arrived: a flood follows mixMap; a camera move maps every cell to a cell of one
  // scene or the other
  const tk = prev && st.trans ? st.trans.kind : 'flood';
  const cam = tk === 'flood' ? null : tk === 'dive' || tk === 'pull' || tk === 'door' ? cameraMap(N, st.trans, m) : maskMap(N, st.trans, m);
  let shown = 0;
  for (let i = 0; i < N * N; i++) {
    let w = wet[i];
    if (commit && w > 0) wet[i] = w *= k;
    vis[i] = (w + wash) * kv > edge[i] ? (!prev ? 1 : cam ? cam.who[i] : mixMap[i] >= m ? 2 : 1) : 0;
    if (vis[i]) shown++;
  }
  for (let y = 0, i = 0, p = 0; y < N; y++)
    for (let x = 0; x < N; x++, i++, p += 4) {
      const v = vis[i];
      let c = PAPER, dim = 1;
      if (v) {
        const sc = v === 2 ? prev : cur;
        c = sc.rgb[sc.raster.buf[cam ? cam.src[i] : i]];
        // a darker wet rim where the paint meets the paper (Curtis et al.'s edge darkening), and on the front
        // of a new style flooding in; a camera move shades its receding door and frames its picture
        if ((x > 0 && !vis[i - 1]) || (x < N - 1 && !vis[i + 1]) || (y > 0 && !vis[i - N]) || (y < N - 1 && !vis[i + N])) dim = 0.8;
        else if (cam) dim = cam.dim[i];
        else if (v === 1 && prev && mixMap[i] > m - 0.012) dim = 0.72;
      }
      data[p] = c[0] * dim;
      data[p + 1] = c[1] * dim;
      data[p + 2] = c[2] * dim;
      data[p + 3] = 255;
    }
  st.ink = shown / (N * N);
  if (light.on && !st.idle && st.ink > 0.25) light.apply(img.data, N, N / 125);
  smallCtx.putImageData(img, 0, 0);
  touch.sendFrame(N, img.data, vis); // to TouchDesigner, which lays its effects over it
  bigCtx.imageSmoothingEnabled = false;
  bigCtx.drawImage(small, 0, 0, SIZE, SIZE);
  if (st.gap && N <= 125) {
    // soft-light keeps white paper white and black black, and only lifts the edges of colours: an LED panel
    bigCtx.globalCompositeOperation = 'soft-light';
    bigCtx.drawImage(gapLayer, 0, 0);
    bigCtx.globalCompositeOperation = 'source-over';
  }
  touch.drawView(bigCtx, SIZE); // and what it made of it, while TD FX is on
  if (st.label) drawLabel(f);
  if (st.ink < 0.001 && !st.drops.length && f.level < 0.1) st.idle = true;
}

// sticker in the corner, in the same 3x5 font, so it ends up in saved PNGs
const labelRaster = new Raster(64);
function drawLabel(f) {
  const lines = st.idle && st.ink < 0.01
    ? ['ep-visual', 'play a sound']
    : [st.cur.def.title, st.moodName, [keyText(f), f.bpm ? `${nowPlaying.bpmText(f)}bpm` : ''].filter(Boolean).join(' '),
      nowPlaying.playing ? nowPlaying.track.title.toLowerCase() : ''].filter(Boolean);
  const s = 4, pad = 3 * s, lh = 6 * s;
  const w = Math.max(...lines.map((l) => l.length * 4 - 1)) * s + pad * 2 + 4 * s;
  const h = lines.length * lh - s + pad * 2;
  const x0 = 24, y0 = SIZE - 24 - h;
  bigCtx.fillStyle = '#fff';
  bigCtx.fillRect(x0, y0, w, h);
  bigCtx.fillStyle = '#111';
  bigCtx.fillRect(x0, y0, w, s / 2);
  bigCtx.fillRect(x0, y0 + h - s / 2, w, s / 2);
  bigCtx.fillRect(x0, y0, s / 2, h);
  bigCtx.fillRect(x0 + w - s / 2, y0, s / 2, h);
  bigCtx.fillStyle = '#ff5a00';
  bigCtx.fillRect(x0 + pad, y0 + pad + s, 2 * s, 3 * s);
  lines.forEach((line, j) => {
    labelRaster.fill(0);
    const width = labelRaster.text(line.slice(0, 15), 0, 0, 1);
    bigCtx.fillStyle = j === 0 ? '#111' : '#7a7a7a';
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < width; x++)
        if (labelRaster.buf[y * 64 + x]) bigCtx.fillRect(x0 + pad + 4 * s + x * s, y0 + pad + j * lh + y * s, s, s);
  });
}

function keyText(f) {
  return f.key && f.tonalAvg > 0.25 ? f.key.name.toLowerCase() : '';
}

// ---------------------------------------------------------------------------------------------- panel
const mapCtx = $('#map').getContext('2d');
const metCtx = $('#meters').getContext('2d');

function drawUi(f) {
  for (const b of $('#lightFx').children) b.classList.toggle('lit', light.on && light.active.includes(b.dataset.fx));
  const name = st.moodName;
  $('#moodName').textContent = st.idle && st.ink < 0.01 ? 'silence' : name;
  $('#moodScene').textContent = st.cur.def.title.toLowerCase();
  // a story style's current line goes here, never onto the picture
  $('#story').textContent = st.cur.s.lines?.[st.cur.s.ch]?.toLowerCase() ?? '';
  $('#moodKey').textContent = keyText(f) || '—';
  const clock = listener.extClock(performance.now() / 1000); // a jam's tempo is exact, show it unfolded
  $('#moodBpm').textContent = clock ? `${Math.round(clock.bpm)}` : nowPlaying.bpmText(f) || '—';
  $('#jamInfo').textContent = jamText();
  meterPairs(1 / 15);

  // mood map: 3x3 cells, valence → right, arousal → up
  const W = 150, cw = W / 3;
  mapCtx.clearRect(0, 0, W, W);
  mapCtx.fillStyle = '#e4e4e0';
  mapCtx.fillRect(mood.col * cw, (2 - mood.row) * cw, cw, cw);
  mapCtx.fillStyle = '#111';
  for (let k = 0; k <= 3; k++) {
    for (let j = 0; j <= W; j += 4) {
      mapCtx.fillRect(k * cw - (k === 3 ? 1 : 0), j, 1, 1);
      mapCtx.fillRect(j, k * cw - (k === 3 ? 1 : 0), 1, 1);
    }
  }
  mapCtx.font = '9px ui-monospace, Consolas, monospace';
  mapCtx.fillStyle = '#7a7a7a';
  MOODS.forEach((row, a) => row.forEach((m, v) => mapCtx.fillText(fitText(mapCtx, m, cw - 6), v * cw + 4, (2 - a) * cw + 12)));
  mood.trail.forEach(([v, a], k) => {
    mapCtx.fillStyle = `rgba(17,17,17,${(k / mood.trail.length) * 0.5})`;
    mapCtx.fillRect(v * W - 1, (1 - a) * W - 1, 2, 2);
  });
  mapCtx.fillStyle = '#ff5a00';
  mapCtx.fillRect(mood.v * W - 4, (1 - mood.a) * W - 4, 8, 8);
  $('#mapVal').textContent = `v ${mood.v.toFixed(2)}  a ${mood.a.toFixed(2)}`;

  // the groove: the part of the track, where the count stands in its square, and the feel of the pattern
  const g = f.groove, sq = g?.square;
  if (g) $('#groove').textContent = [g.state, sq ? `□ ${sq.bar + 1}.${Math.floor(sq.beat % 4) + 1}/${sq.bars} · #${sq.n}${sq.sure ? '' : '?'}` : '',
    `lock ${g.lock.toFixed(2)}`, `sync ${g.sync.toFixed(2)}`, `swing ${Math.round(g.swing * 100)}%`].filter(Boolean).join(' · ');

  // meters: segmented bars
  const rows = [
    ['level', f.level], ['low', f.low], ['mid', f.mid], ['high', f.high], ['bright', f.bright],
    ['tonal', f.tonalAvg], ['hits/s', clamp(f.onsetRate / 8)], ['beat', f.beat.pulse], ['ink', clamp(st.ink)],
    ['energy', g?.energy ?? 0], ['budget', g?.budget ?? 0], ['tension', g?.tension ?? 0],
  ];
  const MW = 300, seg = 24, x0 = 64, sw = (MW - x0) / seg;
  metCtx.clearRect(0, 0, MW, metCtx.canvas.height);
  metCtx.font = '10px ui-monospace, Consolas, monospace';
  rows.forEach(([label, v], j) => {
    const y = j * 16 + 2;
    metCtx.fillStyle = '#111';
    metCtx.fillText(label, 0, y + 9);
    const lit = Math.round(v * seg);
    for (let k = 0; k < seg; k++) {
      metCtx.fillStyle = k < lit ? (k >= seg - 4 ? '#ff5a00' : '#111') : '#d4d4d0';
      metCtx.fillRect(x0 + k * sw, y, sw - 2, 10);
    }
  });
  const cy = rows.length * 16 + 10, cmax = Math.max(...f.chroma, 1e-6), cwid = (MW - x0) / 12;
  metCtx.fillStyle = '#111';
  metCtx.fillText('chroma', 0, cy + 24);
  for (let k = 0; k < 12; k++) {
    const h = (f.chroma[k] / cmax) * 24;
    const isRoot = f.key && f.key.root === k && f.tonalAvg > 0.25;
    metCtx.fillStyle = isRoot ? '#ff5a00' : '#111';
    metCtx.fillRect(x0 + k * cwid, cy + 26 - h, cwid - 3, Math.max(1, h));
    metCtx.fillStyle = '#7a7a7a';
    metCtx.fillText(NOTE_NAMES[k][0] + (NOTE_NAMES[k][1] ? '#' : ''), x0 + k * cwid, cy + 38);
  }
  // the groove's template: how strong a hit falls on each sixteenth of the bar, the step now in orange; under it
  // the bars of the square (two to sixteen, as long as it has been found to be), the one now lit
  if (!g) return;
  const py = cy + 48, tmax = Math.max(...g.tmpl, 1e-6), pw = (MW - x0) / 16;
  metCtx.fillStyle = '#111';
  metCtx.fillText('pattern', 0, py + 12);
  for (let k = 0; k < 16; k++) {
    const h = Math.max(1, (g.tmpl[k] / tmax) * 14);
    metCtx.fillStyle = k === g.step ? '#ff5a00' : k % 4 === 0 ? '#111' : '#7a7a7a';
    metCtx.fillRect(x0 + k * pw, py + 14 - h, pw - 2, h);
  }
  metCtx.fillStyle = '#111';
  metCtx.fillText('square', 0, py + 30);
  const bars = sq ? sq.bars : 4, bw = (MW - x0) / bars;
  for (let k = 0; k < bars; k++) {
    metCtx.fillStyle = sq && k === sq.bar ? '#ff5a00' : sq && k < sq.bar ? '#111' : '#d4d4d0';
    metCtx.fillRect(x0 + k * bw, py + 20, bw - (bars > 8 ? 2 : 4), 10);
  }
}

// the whole word where it fits its cell, else cut with a dot that says so
function fitText(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let n = text.length - 1;
  while (n > 1 && ctx.measureText(`${text.slice(0, n)}.`).width > width) n--;
  return `${text.slice(0, n)}.`;
}

function status(text) {
  $('#status').textContent = text;
}

// ---------------------------------------------------------------------------------------------- wiring
document.querySelectorAll('.grp').forEach((b) => b.addEventListener('click', () => { group = b.dataset.g; renderPads(); }));
$('#kitSel').addEventListener('change', (e) => loadKit(decodeURIComponent(e.target.value)));
document.querySelectorAll('.res').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.res').forEach((x) => x.classList.toggle('on', x === b));
  setResolution(Number(b.dataset.n));
}));
$('#lineBtn').addEventListener('click', () => (lineIn ? stopLineIn() : startLineIn()));
$('#inputSel').addEventListener('change', () => lineIn && startLineIn());
$('#pairSel').addEventListener('change', routePairs);
$('#gain').addEventListener('input', (e) => { lineGain.gain.value = Number(e.target.value); $('#gainVal').textContent = `${Number(e.target.value).toFixed(1)}×`; });
$('#monitor').addEventListener('change', (e) => { monitorGain.gain.value = e.target.checked ? 1 : 0; });
$('#fade').addEventListener('input', (e) => { st.fade = Number(e.target.value); $('#fadeVal').textContent = `${st.fade}s`; });
$('#gapBtn').addEventListener('click', (e) => { st.gap = !st.gap; e.currentTarget.classList.toggle('on', st.gap); });
$('#labelBtn').addEventListener('click', (e) => { st.label = !st.label; e.currentTarget.classList.toggle('on', st.label); });
$('#holdBtn').addEventListener('click', (e) => { st.hold = !st.hold; e.currentTarget.classList.toggle('on', st.hold); });
$('#lightBtn').addEventListener('click', (e) => { light.on = !light.on; e.currentTarget.classList.toggle('on', light.on); });
// the light toolbar: every effect on its own switch; auto weighs them by mood, by hand every switched-on one fires
$('#lightAuto').addEventListener('click', (e) => { light.auto = !light.auto; e.currentTarget.classList.toggle('on', light.auto); });
$('#lightFx').innerHTML = EFFECTS.map(([k, name]) => `<button class="key sm on" data-fx="${k}" title="${name}">${name}</button>`).join('');
$('#lightFx').addEventListener('click', (e) => {
  const k = e.target.dataset?.fx;
  if (!k) return;
  light.set(k, !light.enabled[k]);
  e.target.classList.toggle('on', light.enabled[k]);
});
$('#artSel').innerHTML = '<option value="auto">auto · by mood</option>' + Object.entries(STYLES).map(([key, def]) => {
  const moods = def.byMood ? 'tells the mood' : MOODS.flat().filter((m) => MOOD_STYLES[m].includes(key)).join(', ');
  return `<option value="${key}">${def.title.toLowerCase()} · ${moods}</option>`;
}).join('');
$('#artSel').addEventListener('change', (e) => { st.art = e.target.value; });
$('#seedBtn').addEventListener('click', () => {
  st.seed = (Math.random() * 2 ** 32) >>> 0;
  crossTo(st.cur.name);
});
$('#clearBtn').addEventListener('click', () => {
  st.wet.fill(0);
  st.wash = 0;
  st.dryK = 1;
  st.drops = [];
  st.idle = true;
  stopAll();
});
$('#saveBtn').addEventListener('click', savePng);

function savePng() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  big.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ep-visual_${st.moodName}${nowPlaying.fileTag}_${stamp}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

window.addEventListener('keydown', (e) => {
  // a slider or a checkbox has no use for letters and digits: the pads stay on the keys after touching one
  if (e.target.closest?.('select, textarea, input:not([type="range"]):not([type="checkbox"])')) return;
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); savePng(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code in KEYMAP) {
    e.preventDefault();
    if (!e.repeat) trigger(KEYMAP[e.code]);
  } else if (e.code === 'Space' || e.code === 'Escape') {
    e.preventDefault();
    stopAll();
  }
});
window.addEventListener('pointerdown', resume);
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  const files = [...e.dataTransfer.files].filter((file) => /^audio\/|\.(wav|aiff?|flac|mp3|ogg|m4a)$/i.test(file.type || file.name));
  const slots = nextFreeSlots(files.length);
  await Promise.all(files.slice(0, slots.length).map((file, k) => loadFileToPad(file, ...slots[k])));
});
navigator.mediaDevices?.addEventListener?.('devicechange', () => (standMode ? followStand() : listInputs().catch(() => {})));

// ---------------------------------------------------------------------------------------------- now playing
// What the computer plays (Spotify): the server sends the track and what it found out about it; the page shows
// it, lets its tempo, key and mood steady its own guesses, and can listen to the computer's output.
// ?listen=spotify (open_visualizer(listen='spotify')) starts that listening by itself where no click is needed.
const spotifyMode = new URLSearchParams(location.search).get('listen') === 'spotify';
const nowPlaying = new NowPlaying({
  $, actx, listener, mood, status, audioInputs, startLineIn, useLineStream,
  // a new track is a new composition: the parts and the squares start over at once; the picture follows once the
  // track is described (what it is about decides the worlds), or after a few seconds without a description
  newTrack: () => groove.newTrack(),
  // when the playing track's 0:00 played (the player's clock, seconds since 1970), or null: the squares count from there
  timeline: (startAt) => {
    trackStart = startAt;
    placeTrack();
  },
  newPicture: () => {
    renewNext();
    if (st.idle || st.ink < 0.2) return;
    nextPicture();
  },
});
// The track's 0:00 on the page's clock: the sound reaches the page a moment after the player's clock says (the
// server's loopback measures its own lag; another input, about a tenth of a second).
let trackStart = null;
function placeTrack() {
  groove.timeline(trackStart == null ? null : trackStart - performance.timeOrigin / 1000 + (nowPlaying.feed?.lag ?? 0.1));
}
// the mood's next style, or the same one recomposed, on the next bar line
function nextPicture() {
  const name = st.moodName;
  st.seed = (Math.random() * 2 ** 32) >>> 0;
  if (st.art === 'auto' && orderFor(name).length > 1) { nextVariant(name); st.force = true; }
  else crossTo(st.cur.name);
  st.sceneBeats = 0;
  st.sceneTime = 0;
}
// TouchDesigner (touch.py): what the page hears and shows goes out as OSC, and its control messages come back here
const touch = new Touch({
  $, st, mood, light, styles: STYLES, trigger, next: nextPicture,
  onSection: (kind) => { if (st.idle) { reseed(); st.idle = false; } onSection(kind, st.moodName || mood.name); },
});
// clips of the canvas as shown, with what the page hears
const recorder = new Recorder({ $, actx, bus, canvas: big, status });
const listeningToSystem = () => lineIn && (lineIn.label.startsWith('system audio') || LOOPBACK.test(lineIn.label));
$('#sysBtn').addEventListener('click', () => (listeningToSystem() ? stopLineIn() : nowPlaying.listen()));

setResolution(125);
renderPads();
loadLibrary().then(() => (standMode ? followStand() : spotifyMode ? nowPlaying.listen({ auto: true }) : null));
if (!standMode) listInputs().catch(() => {});
connectJam();
requestAnimationFrame(loop);

// handy for poking at it from the console
window.epVisual = { st, mood, listener, light, groove, groups, trigger, emitHit, crossTo, onSection, actx, master, jam, nowPlaying, touch, recorder, line: () => lineIn };
