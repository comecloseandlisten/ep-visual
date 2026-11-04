// Measures the groove of every world the mixer knows and writes js/profiles.js.
//
// Each world is played 22 seconds of a synthetic groove (kick, clap, hats, an off-beat bass, chords) heard through
// the page's own Listener and Groove, exactly as the page hears it, and its frames are measured:
//   load    how cluttered the picture is: the share of neighbouring cells that differ
//   motion  how much of it changes from one frame to the next
//   react   how much more it changes right after a hit than otherwise
//   pulse   how much its motion keeps to the beat: the change folded onto the beat phase, peak against mean
//   burst   how jerky the motion is: its spread against its mean
// Every measure is ranked across the worlds (0 the least of all, 1 the most), so the page can match a world to what
// the music does now: a breakdown takes the uncluttered, smooth ones, a drop the cluttered and jerky ones, a steady
// four-to-the-floor the ones that keep to the beat, a broken beat the ones that follow the hits.
//
// usage: node tools/profile_scenes.mjs   (from the repository root; rerun when worlds are added)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'js');
const load = (name) => import(pathToFileURL(path.join(JS, name)));
const { Listener, fft } = await load('analysis.js');
const { Groove } = await load('groove.js');
const { Raster, rng, clamp } = await load('pixels.js');
await load('styles.js'); // registers every family with the mixer
const { DEFS, IMPL, ctx, fullPalette, PALETTES } = await load('mixer.js');
const { MOOD_VA } = await load('story.js');

// ---------------------------------------------------------------------------------------------- the groove
const SR = 48000, BPM = 128, BEAT = 60 / BPM, SECONDS = 22;
function groove() {
  const n = SECONDS * SR, y = new Float32Array(n), r = rng(7);
  const add = (t, len, fn) => { const i0 = Math.floor(t * SR); for (let i = 0; i < len * SR && i0 + i < n; i++) y[i0 + i] += fn(i / SR); };
  const kick = (t) => Math.sin(2 * Math.PI * (45 * t + 2.25 * (1 - Math.exp(-t / 0.03)))) * Math.exp(-t / 0.12) * 0.9;
  const clap = (t) => (r() * 2 - 1) * Math.exp(-t / 0.05) * 0.35;
  const hat = (g) => { let last = 0; return (t) => { const w = r() * 2 - 1, d = w - last; last = w; return d * Math.exp(-t / 0.012) * 0.15 * g; }; };
  const bass = (t) => (Math.sin(2 * Math.PI * 55 * t) + 0.3 * Math.sin(4 * Math.PI * 55 * t)) * Math.min(1, t / 0.005) * Math.exp(-t / 0.2) * 0.5;
  const chord = (f0) => (t) => [1, 1.189, 1.498].reduce((s, k) => s + Math.sin(2 * Math.PI * f0 * k * t), 0) * Math.min(1, t / 0.02) * Math.exp(-t / 0.4) * 0.06;
  for (let b = 0; b * BEAT < SECONDS; b++) {
    const t = b * BEAT;
    add(t, 0.35, kick);
    if (b % 2) add(t, 0.2, clap);
    add(t + BEAT / 2, 0.05, hat(1));
    add(t + BEAT / 4, 0.05, hat(0.4));
    add(t + (3 * BEAT) / 4, 0.05, hat(0.4));
    add(t + BEAT / 2, BEAT * 0.45, bass);
    if (b % 4 === 0 || b % 8 === 6) add(t + (b % 8 === 6 ? BEAT * 0.75 : 0), 1.2, chord([220, 174.6][(b >> 3) % 2]));
  }
  for (let i = 0; i < n; i++) y[i] = Math.tanh(y[i] * 0.8) * 0.5;
  return y;
}

// AnalyserNodes as the Web Audio spec has them: Blackman window, |X| / N in dB, no smoothing
const pcm = groove();
let pos = 0;
class Analyser {
  constructor() { this.fftSize = 2048; this.smoothingTimeConstant = 0; }
  get frequencyBinCount() { return this.fftSize / 2; }
  getFloatTimeDomainData(out) { for (let i = 0; i < this.fftSize; i++) { const j = pos - this.fftSize + i; out[i] = j >= 0 ? pcm[j] : 0; } }
  getFloatFrequencyData(out) {
    const N = this.fftSize;
    if (this.re?.length !== N) { this.re = new Float32Array(N); this.im = new Float32Array(N); }
    for (let i = 0; i < N; i++) {
      const j = pos - N + i;
      this.re[i] = (j >= 0 ? pcm[j] : 0) * (0.42 - 0.5 * Math.cos((2 * Math.PI * i) / N) + 0.08 * Math.cos((4 * Math.PI * i) / N));
      this.im[i] = 0;
    }
    fft(this.re, this.im);
    for (let k = 0; k < N / 2; k++) out[k] = 20 * Math.log10(Math.hypot(this.re[k], this.im[k]) / N);
  }
}

// what main.js makes of an onset: the kind of hit, and where it lands on the canvas
const KIND_Y = { kick: 0.82, bass: 0.72, snare: 0.55, perc: 0.48, keys: 0.38, hat: 0.18 };
function hitOf(o, f, r) {
  let kind = 'perc', pc = -1;
  if (f.tonal > 0.55) {
    pc = 0;
    for (let i = 1; i < 12; i++) if (f.frameChroma[i] > f.frameChroma[pc]) pc = i;
    kind = f.bands.sub + f.bands.low > 0.5 ? 'bass' : 'keys';
  } else if (o.high > o.mid * 1.5 && o.high > o.low) kind = 'hat';
  else if (o.low > o.mid * 4) kind = 'kick';
  else if (o.mid + o.high > o.low * 0.5) kind = 'snare';
  const x = pc >= 0 ? (pc + 0.2 + r() * 0.6) / 12 : 0.08 + r() * 0.84;
  return { kind, pc, strength: o.strength, x, y: clamp(KIND_Y[kind] + (r() - 0.5) * 0.16, 0.05, 0.95) };
}

// the page's frames, heard once: the listener at 60 frames a second, the picture at 30 with the hits since the last
const listener = new Listener({ sampleRate: SR, createAnalyser: () => new Analyser() }, { connect() {} });
const grooveA = new Groove();
const frames = [];
let hits = [], beatOn = false;
const hr = rng(11);
for (let i = 1; i <= SECONDS * 60; i++) {
  pos = Math.floor((i * SR) / 60);
  const now = i / 60, f = listener.update(now, 1 / 60), g = grooveA.update(f, now, 1 / 60);
  if (g.shift && listener.shiftBeats(g.shift, now)) grooveA.shifted(g.shift, g);
  if (f.onset) hits.push(hitOf(f.onset, f, hr));
  beatOn ||= f.beat.on;
  if (i % 2) continue;
  const copy = (a) => (a ? Float32Array.from(a) : a);
  frames.push({
    t: now,
    f: { ...f, beat: { ...f.beat, on: beatOn, R: null }, rel: { ...f.rel }, band10: copy(f.band10), chroma: copy(f.chroma), frameChroma: copy(f.frameChroma),
      wave: copy(f.wave), bands: { ...f.bands }, groove: g, section: null },
    hits,
  });
  hits = [];
  beatOn = false;
}

// ---------------------------------------------------------------------------------------------- the measures
const N = 125, MOOD = 'focused', [V, A] = MOOD_VA[MOOD];
function measure(key) {
  const r = new Raster(N), rnd = rng(1234), seed = 1234;
  const s = { mood: MOOD, v: V, a: A, targets: [], shake: 0, palette: fullPalette(PALETTES.noir.colors), w: {} };
  const c0 = { N, px: 1, t: 0, dt: 1 / 30, f: frames[0].f, hits: [], rnd, seed };
  IMPL[key].init(ctx(s, c0, null));
  let prev = null, t = 0;
  const change = [], phase = [], afterHit = [], edges = [];
  for (const fr of frames) {
    t += 1 / 30;
    s.targets.length = 0;
    r.fill(0);
    IMPL[key].draw(ctx(s, { N, px: 1, t, dt: 1 / 30, f: fr.f, hits: fr.hits, rnd, seed }, r));
    const buf = r.buf;
    let e = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N - 1; x++) if (buf[y * N + x] !== buf[y * N + x + 1]) e++;
    for (let y = 0; y < N - 1; y++) for (let x = 0; x < N; x++) if (buf[y * N + x] !== buf[y * N + x + N]) e++;
    edges.push(e / (2 * N * (N - 1)));
    if (prev) {
      let d = 0;
      for (let i = 0; i < buf.length; i++) if (buf[i] !== prev[i]) d++;
      change.push(d / buf.length);
      phase.push(fr.f.beat.phase);
      afterHit.push(fr.hits.some((h) => h.strength > 0.3));
    }
    prev = Uint8Array.from(buf);
  }
  const skip = 60; // the first two seconds: the world settling in, the listener finding the beat
  const ch = change.slice(skip), ph = phase.slice(skip), ah = afterHit.slice(skip);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const m = mean(ch), sd = Math.sqrt(mean(ch.map((x) => (x - m) ** 2)));
  const hit = mean(ch.filter((_, i) => ah[i] || ah[i - 1])), quiet = mean(ch.filter((_, i) => !ah[i] && !ah[i - 1]));
  const fold = new Float64Array(12), cnt = new Float64Array(12);
  ch.forEach((x, i) => { const b = Math.floor(ph[i] * 12) % 12; fold[b] += x; cnt[b]++; });
  const prof = Array.from(fold, (x, b) => x / Math.max(1, cnt[b])), pm = mean(prof);
  return {
    load: mean(edges.slice(skip)),
    motion: m,
    react: (hit - quiet) / (quiet + 0.01),
    pulse: pm > 0 ? (Math.max(...prof) - pm) / (pm + 0.005) : 0,
    burst: m > 0 ? sd / (m + 0.005) : 0,
  };
}

const raw = {}, failed = [];
for (const key of Object.keys(DEFS)) {
  try { raw[key] = measure(key); } catch (err) { failed.push(`${key}: ${err.message}`); }
}
// ranked across the worlds, so every measure spreads over 0..1
const AXES = ['load', 'motion', 'react', 'pulse', 'burst'], keys = Object.keys(raw);
const ranked = Object.fromEntries(keys.map((k) => [k, []]));
for (const ax of AXES) {
  const order = keys.map((k) => raw[k][ax]).sort((a, b) => a - b);
  for (const k of keys) ranked[k].push(Math.round((100 * order.indexOf(raw[k][ax])) / Math.max(1, keys.length - 1)) / 100);
}

const lines = keys.sort().map((k) => `  ${/^[a-z_$][\w$]*$/i.test(k) ? k : JSON.stringify(k)}: [${ranked[k].join(', ')}],`);
const out = `// The groove of every world, measured by tools/profile_scenes.mjs (rerun it when worlds are added; a world left
// out counts as middling on every axis). Each is ranked across the worlds, 0 the least of all and 1 the most:
// [load (clutter), motion (change per frame), react (change after a hit), pulse (motion on the beat), burst (jerk)].
export const AXES = ${JSON.stringify(AXES)};
export const PROFILES = {
${lines.join('\n')}
};
`;
fs.writeFileSync(path.join(JS, 'profiles.js'), out);
console.log(`${keys.length} worlds measured -> js/profiles.js`);
if (failed.length) console.log(`failed:\n  ${failed.join('\n  ')}`);
const show = (ax, i) => {
  const s = keys.slice().sort((a, b) => ranked[a][i] - ranked[b][i]);
  console.log(`${ax.padEnd(6)} least: ${s.slice(0, 4).join(', ')} · most: ${s.slice(-4).join(', ')}`);
};
AXES.forEach(show);
