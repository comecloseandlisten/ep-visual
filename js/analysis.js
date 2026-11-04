// Listening: one-off analysis of a sample buffer, live features from the output/LINE IN, and the mood model.
import { clamp } from './pixels.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

function pearson(a, b) {
  let ma = 0, mb = 0;
  for (let i = 0; i < 12; i++) { ma += a[i]; mb += b[i]; }
  ma /= 12; mb /= 12;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

// Cosine match against the tonic triad (root, third, fifth).
function triad(chroma, root, third) {
  let norm = 0;
  for (let i = 0; i < 12; i++) norm += chroma[i] * chroma[i];
  const hit = chroma[root] + chroma[(root + third) % 12] + chroma[(root + 7) % 12];
  return norm ? hit / Math.sqrt(3 * norm) : 0;
}

// Krumhansl-Schmuckler profiles plus the tonic triad, weighted towards the triad: the profiles alone tip a
// C-E-G with a loud E over to E minor, and for mood the chord quality is what matters. `bass` (pitch-class energy
// of the bass line) votes for the tonic, which is what tells C minor from E-flat major: same notes, other root.
// Returns the best key and how much more major than minor it sounds on that root (-1..1).
// `prior` ({ root, mode }) is a key the track is known to be in (the playing track's description): it gets a
// head start, so the page settles on it unless the chroma clearly says otherwise.
export function estimateKey(chroma, bass = null, prior = null) {
  const bmax = bass ? Math.max(...bass) : 0;
  const rot = (p, k) => p.map((_, i) => p[(i - k + 12) % 12]);
  const score = (k, maj) => 0.35 * pearson(chroma, rot(maj ? MAJOR : MINOR, k)) + 0.65 * triad(chroma, k, maj ? 4 : 3);
  let best = { r: -2 };
  for (let k = 0; k < 12; k++) {
    const b = bmax > 0 ? (0.3 * bass[k]) / bmax : 0;
    const head = (maj) => (prior && prior.root === k && (prior.mode === 'maj') === maj ? 0.12 : 0);
    const rMaj = score(k, true) + b + head(true), rMin = score(k, false) + b + head(false);
    if (rMaj > best.r) best = { r: rMaj, root: k, mode: 'maj' };
    if (rMin > best.r) best = { r: rMin, root: k, mode: 'min' };
  }
  const major = clamp((score(best.root, true) - score(best.root, false)) * 8, -1, 1);
  return { ...best, name: `${NOTE_NAMES[best.root]} ${best.mode.toUpperCase()}`, major };
}

// Share of 120 Hz..5 kHz energy sitting in narrow peaks: bins 10x above both of their neighbourhoods just
// outside the window's main lobe (`gap` bins away). Harmonic sounds score high; noise and smeared hits score low.
// The bass is left out: a kick's sine body is a perfectly narrow peak but says nothing about harmony.
function tonality(power, hz, gap) {
  const k0 = Math.max(gap + 2, Math.ceil(120 / hz)), k1 = Math.min(power.length - gap - 2, Math.floor(5000 / hz));
  let peak = 0, total = 0;
  for (let k = k0; k <= k1; k++) {
    const p = power[k];
    const left = (power[k - gap] + power[k - gap - 1]) / 2, right = (power[k + gap] + power[k + gap + 1]) / 2;
    total += p;
    if (p > 10 * Math.max(left, right)) peak += p;
  }
  return total > 0 ? peak / total : 0;
}

// Where a spectral peak really sits, between bins: a parabola through the log power around bin k. At the bottom
// of the spectrum a semitone is narrower than a bin (F1 is 2.6 Hz from E1, bins are 5.9 Hz), so without this
// the bass lands on the neighbouring note.
export function peakBin(P, k) {
  const a = Math.log(P[k - 1] + 1e-20), b = Math.log(P[k] + 1e-20), c = Math.log(P[k + 1] + 1e-20), den = a - 2 * b + c;
  return den < 0 ? k + clamp((0.5 * (a - c)) / den, -0.5, 0.5) : k;
}

// Spectral summary of a power spectrum (bins of `hz` Hz). Shared by offline and live analysis.
function spectralShape(power, hz, chroma, gap) {
  let total = 0, cen = 0, mid = 0, midCen = 0, maxP = 0;
  const bands = { sub: 0, low: 0, mid: 0, high: 0, air: 0 };
  for (let k = 1; k < power.length; k++) if (power[k] > maxP) maxP = power[k];
  const peaks = [];
  for (let k = 1; k < power.length; k++) {
    const f = k * hz, p = power[k];
    if (f < 20) continue;
    total += p;
    cen += p * f;
    if (f >= 150 && f < 8000) { mid += p; midCen += p * f; }
    if (f < 60) bands.sub += p; else if (f < 250) bands.low += p; else if (f < 2000) bands.mid += p;
    else if (f < 6000) bands.high += p; else bands.air += p;
    if (chroma && f > 65 && f < 2500 && p > maxP * 0.01 && p >= power[k - 1] && p >= power[k + 1]) peaks.push([peakBin(power, k) * hz, p]);
  }
  // Chroma from spectral peaks, power-weighted so fundamentals outvote overtones. A peak at 2-5x a stronger
  // lower peak is most likely its overtone (the 3rd of E is B, which would turn C-E-G into E minor), so it
  // barely counts.
  for (let i = 0; i < peaks.length; i++) {
    const [f, p] = peaks[i];
    let w = 1;
    for (let j = 0; j < i && w === 1; j++) {
      const ratio = f / peaks[j][0], n = Math.round(ratio);
      if (n >= 2 && n <= 5 && Math.abs(ratio - n) < 0.025 * n && peaks[j][1] > p * 0.3) w = 0.15;
    }
    const pc = ((Math.round(12 * Math.log2(f / 440) + 69) % 12) + 12) % 12;
    chroma[pc] += (w * p) / maxP;
  }
  const t = total || 1e-12;
  for (const b in bands) bands[b] /= t;
  // brightness between the bass and the hats, so neither a kick nor a hat decides it
  const midHz = mid ? midCen / mid : 0;
  return {
    bands,
    centroidHz: total ? cen / total : 0,
    bright: clamp((Math.log2(Math.max(midHz, 300)) - Math.log2(500)) / (Math.log2(4000) - Math.log2(500))),
    tonality: tonality(power, hz, gap),
    total,
  };
}

// One-off analysis of a decoded sample: what kind of sound it is and which note it sits on.
export function analyzeBuffer(buffer) {
  const sr = buffer.sampleRate, len = buffer.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / buffer.numberOfChannels;
  }
  let peak = 0, peakAt = 0;
  for (let i = 0; i < len; i++) { const a = Math.abs(mono[i]); if (a > peak) { peak = a; peakAt = i; } }
  // decay: first 10 ms block after the peak whose max is below -20 dB of the peak
  const blk = Math.max(1, Math.round(sr * 0.01));
  let decayAt = len;
  for (let i = peakAt; i < len; i += blk) {
    let m = 0;
    for (let j = i; j < Math.min(len, i + blk); j++) m = Math.max(m, Math.abs(mono[j]));
    if (m < peak * 0.1) { decayAt = i; break; }
  }
  let sus = 0;
  for (let i = peakAt + Math.round(sr * 0.28); i < Math.min(len, peakAt + Math.round(sr * 0.32)); i++) sus = Math.max(sus, Math.abs(mono[i]));
  sus /= peak || 1;
  // onsets inside the sample (to spot loops): energy jumps between 23 ms blocks
  const hop = Math.round(sr * 0.023);
  let prevE = 0, onsets = 0, lastOn = -1e9;
  for (let i = 0; i + hop <= len; i += hop) {
    let e = 0;
    for (let j = i; j < i + hop; j++) e += mono[j] * mono[j];
    e = Math.sqrt(e / hop);
    if (e > prevE * 2.2 && e > peak * 0.12 && i - lastOn > sr * 0.09) { onsets++; lastOn = i; }
    prevE = e * 0.7 + prevE * 0.3;
  }

  const n = 4096, power = new Float32Array(n / 2), re = new Float32Array(n), im = new Float32Array(n);
  const end = Math.min(len, peakAt + sr * 2);
  let frames = 0;
  for (let start = Math.max(0, peakAt - n / 4); start < end; start += n / 2) {
    re.fill(0); im.fill(0);
    let e = 0;
    for (let i = 0; i < n && start + i < len; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      re[i] = mono[start + i] * w;
      e += re[i] * re[i];
    }
    if (e < 1e-8) continue;
    fft(re, im);
    for (let k = 0; k < n / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  const hz = sr / n;
  const chroma = new Float32Array(12);
  const shape = spectralShape(power, hz, chroma, 3);
  // pitch: harmonic product spectrum over 30..1500 Hz
  let bestK = 0, bestV = 0;
  for (let k = Math.ceil(30 / hz); k < 1500 / hz; k++) {
    const v = Math.sqrt(power[k]) * Math.sqrt(power[2 * k] || 0) ** 0.5 * Math.sqrt(power[3 * k] || 0) ** 0.25;
    if (v > bestV) { bestV = v; bestK = k; }
  }
  let pitchHz = 0;
  if (bestK > 0) {
    const a = power[bestK - 1], b = power[bestK], c = power[bestK + 1];
    const d = a - 2 * b + c;
    pitchHz = (bestK + (d ? (0.5 * (a - c)) / d : 0)) * hz;
  }
  const midi = pitchHz ? Math.round(12 * Math.log2(pitchHz / 440) + 69) : null;
  const duration = len / sr, decayMs = ((decayAt - peakAt) / sr) * 1000, attackMs = (peakAt / sr) * 1000;
  const tonal = frames > 0 && shape.tonality > 0.4;
  const lowPitch = !pitchHz || pitchHz < 100;
  const lowFrac = shape.bands.sub + shape.bands.low;

  let kind;
  if (duration > 1.5 && onsets >= 4) kind = 'loop';
  else if (attackMs > 250 && shape.tonality < 0.3) kind = 'fx';
  else if (shape.centroidHz < 900 && attackMs < 15 && lowPitch && sus < 0.78 && decayMs < 1500) kind = 'kick';
  else if (shape.centroidHz > 4500 && lowFrac < 0.03) kind = 'hat';
  else if (tonal && decayMs > 120) kind = pitchHz < 200 ? 'bass' : attackMs > 40 || decayMs > 1500 ? 'pad' : 'keys';
  else if (shape.centroidHz >= 900) kind = 'snare';
  else if (shape.tonality > 0.3) kind = pitchHz < 200 ? 'bass' : 'keys';
  else kind = 'perc';

  const key = tonal ? estimateKey(chroma) : null;
  return {
    kind, duration, attackMs, decayMs, sus, onsets,
    centroidHz: shape.centroidHz, bright: shape.bright, tonality: shape.tonality, bands: shape.bands,
    pitchHz: tonal || kind === 'bass' || kind === 'kick' ? pitchHz : 0,
    note: midi !== null && (tonal || kind === 'bass') ? `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}` : null,
    pc: midi !== null && (tonal || kind === 'bass') ? midi % 12 : -1,
    key,
  };
}

// Live features from an AnalyserNode pair. Call update() once per animation frame.
// the power of two that brings a tempo into 80..160, the range estimateBpm works in
export function foldTempo(bpm) {
  let k = 1;
  while (bpm * k < 80) k *= 2;
  while (bpm * k >= 160) k /= 2;
  return k;
}

// Tempo from the onset envelope (`env`, `rate` samples a second, oldest first): its autocorrelation, read off as
// a comb at half a beat and 1-4 beats for every candidate tempo of 80..160 (TEMPI). The comb is what tells 132 from
// 88, or drum & bass's 87 from 116 (3:2, which a single lag mixes up): only the true beat repeats at every multiple
// and has its own half beat. Adds the scores to `out`; returns false when the envelope is flat.
export const TEMPI = Array.from({ length: 161 }, (_, i) => 80 + i / 2);
export function tempoScores(env, rate, out, w = 1) {
  const n = env.length, maxLag = Math.ceil((4 * 60 * rate) / 80) + 1;
  if (n < maxLag * 1.5) return false;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i];
  mean /= n;
  const ac = new Float32Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = lag; i < n; i++) sum += (env[i] - mean) * (env[i - lag] - mean);
    ac[lag] = sum / (n - lag);
  }
  if (!(ac[0] > 1e-9)) return false;
  const at = (lag) => { const i = Math.floor(lag), f = lag - i; return (ac[i] * (1 - f) + ac[i + 1] * f) / ac[0]; };
  TEMPI.forEach((bpm, j) => {
    const L = (60 * rate) / bpm;
    out[j] += w * (0.5 * at(L / 2) + at(L) + at(2 * L) + 0.75 * at(3 * L) + 0.75 * at(4 * L));
  });
  return true;
}

export class Listener {
  constructor(ctx, input) {
    this.fast = ctx.createAnalyser();
    this.fast.fftSize = 1024;
    this.fast.smoothingTimeConstant = 0;
    this.slow = ctx.createAnalyser();
    this.slow.fftSize = 8192;
    this.slow.smoothingTimeConstant = 0;
    input.connect(this.fast);
    input.connect(this.slow);
    this.hzFast = ctx.sampleRate / this.fast.fftSize;
    this.hzSlow = ctx.sampleRate / this.slow.fftSize;
    this.wave = new Float32Array(this.fast.fftSize);
    this.dbFast = new Float32Array(this.fast.frequencyBinCount);
    this.dbSlow = new Float32Array(this.slow.frequencyBinCount);
    this.powSlow = new Float32Array(this.slow.frequencyBinCount);
    this.prevMag = new Float32Array(this.fast.frequencyBinCount);
    const binsBelow = (hz) => Math.ceil(hz / this.hzFast) - 1;
    this.fluxBins = [binsBelow(200), binsBelow(4000) - binsBelow(200), this.dbFast.length - 1 - binsBelow(4000)];
    this.fluxHist = [];
    this.onsetTimes = [];
    this.lastOnset = -1;
    // the onset envelope on an even 100 Hz grid (frames come at whatever rate the screen runs), 10 s of it, and the
    // tempo scores built up from it (tempoScores)
    this.env = { rate: 100, buf: new Float32Array(1024), n: 0, t: 0, g: 0, last: 0, scores: new Float32Array(TEMPI.length), at: 0, pend: null };
    this.chroma = new Float32Array(12);
    this.frameChroma = new Float32Array(12);
    this.bass = new Float32Array(12); // pitch classes of the bass line, slowly averaged: where the tonic is
    this.frameBass = new Float32Array(12);
    this.tonalAvg = 0;
    this.fluxAvg = 0;
    this.busy = 0; // how much is going on up top (hats, shakers, breaks), slowly averaged
    this.bpm = 0;
    this.key = null;
    // ten log-spaced bands, 40 Hz .. 14 kHz, for the meters and the GRID scene
    this.band10 = new Float32Array(10);
    this.bandEdges = Array.from({ length: 11 }, (_, i) => 40 * Math.pow(14000 / 40, i / 10));
    // MilkDrop's three bands, each measured against its own long average (1 = usual for this track)
    const bins = (lo, hi) => [Math.max(1, Math.round(lo / this.hzFast)), Math.round(hi / this.hzFast)];
    this.rel = ['bass', 'mid', 'treb'].map((name, i) => ({ name, bins: bins(...[[20, 320], [320, 2800], [2800, 11025]][i]),
      avg: 0, long: 0, clock: 0 }));
    this.frames = 0;
    this.beat = { T: 0, R: null, lastBin: -1, phase: 0, prev: 0, pulse: 0, count: 0, conf: 0 };
    this.sect = { acc: null, n: 0, vecs: [], nov: [], since: 0, lowRun: 0 };
    this.ext = null; // a jam's clock: { beat, bpm, T, at }
    // what is known about the playing track (from its description): { bpm, key: { root, mode } }. The tempo
    // joins the onset histogram and the key gets a head start, so weak evidence settles on them.
    this.hint = null;
    this.lock = 0; // a track's beat grid holding the tempo (lockTo)
    this.f = null;
  }

  // A jam sends its beat (quarter notes since bar one) and tempo; while those keep coming they replace the tempo
  // guess and the phase search, so the picture lands on the jam's own bar lines even before the line in hears it.
  clock(beat, bpm, now) {
    this.ext = bpm > 0 ? { beat, bpm, T: 60 / bpm, at: now } : null;
  }

  extClock(now) {
    const e = this.ext;
    return e && now - e.at < 2 * e.T + 0.5 ? e : null;
  }

  // A track's beat grid (groove.js: `bpm` on the 80-160 scale, `beats` it is drawn through) holds the tempo for the
  // rest of the track, as a Pioneer grid does, once it agrees with the track's known tempo (or, with none known,
  // after a minute or so of beats on it): the tracker no longer wanders off it in a breakdown or an intro.
  lockTo(bpm, beats) {
    const h = this.hint?.bpm, hf = h > 0 ? h * foldTempo(h) : 0;
    this.lock = bpm > 0 && (hf ? Math.abs(bpm - hf) / hf < 0.02 && beats >= 32 : beats >= 96) ? bpm : 0;
  }

  // The bar lines move to where the music has its own (the groove's squares say where): the beat count goes on by
  // `n` beats, never back. A jam's clock knows its bar lines already. Says whether it moved.
  shiftBeats(n, now) {
    if (!(n > 0) || this.extClock(now) || !this.bpm) return false;
    this.beat.count += n;
    return true;
  }

  update(now, dt) {
    const { fast, slow } = this;
    fast.getFloatTimeDomainData(this.wave);
    fast.getFloatFrequencyData(this.dbFast);
    slow.getFloatFrequencyData(this.dbSlow);

    let sq = 0;
    for (let i = 0; i < this.wave.length; i++) sq += this.wave[i] * this.wave[i];
    const rms = Math.sqrt(sq / this.wave.length);
    const db = 20 * Math.log10(rms + 1e-9);
    const level = clamp((db + 60) / 52);

    // onset detection: log-magnitude spectral flux on the short window; on the way, the power of the bass and of
    // the top end, quick enough for the groove to hear a pit or a drop on the frame
    let flux = 0, fluxLow = 0, fluxHigh = 0, fluxMid = 0, powLow = 0, powHigh = 0;
    for (let k = 1; k < this.dbFast.length; k++) {
      const amp = Math.pow(10, this.dbFast[k] / 20), mag = Math.log1p(100 * amp);
      const d = mag - this.prevMag[k], f = k * this.hzFast;
      this.prevMag[k] = mag;
      if (f < 160) powLow += amp * amp; else if (f >= 4000) powHigh += amp * amp;
      if (d > 0) {
        flux += d;
        if (f < 200) fluxLow += d; else if (f < 4000) fluxMid += d; else fluxHigh += d;
      }
    }
    // Kicks move only a handful of low bins, so the low band is weighted up; chorused pads keep the
    // plain sum around 5-15 all the time, hence the floor on the threshold.
    const odf = flux + 6 * fluxLow;
    this.fluxHist.push(odf);
    if (this.fluxHist.length > 40) this.fluxHist.shift();
    const mean = this.fluxHist.reduce((a, b) => a + b, 0) / this.fluxHist.length;
    const thr = mean * 1.6 + 12;
    let onset = null;
    if (odf > thr && level > 0.08 && now - this.lastOnset > 0.085) {
      this.lastOnset = now;
      this.onsetTimes.push(now);
      const [nl, nm, nh] = this.fluxBins;
      const strength = clamp(((odf - thr) / thr) * 0.5 + level * 0.5);
      onset = { strength, low: fluxLow / nl, mid: fluxMid / nm, high: fluxHigh / nh };
    }
    while (this.onsetTimes.length && now - this.onsetTimes[0] > 6) this.onsetTimes.shift();
    this.fluxAvg += (clamp(flux / 60) - this.fluxAvg) * Math.min(1, dt / 0.8);
    if (level > 0.08) this.busy += (clamp(fluxHigh / this.fluxBins[2] / 0.12) - this.busy) * Math.min(1, dt / 2);

    // spectral shape + chroma on the long window
    for (let k = 0; k < this.dbSlow.length; k++) this.powSlow[k] = Math.pow(10, this.dbSlow[k] / 10);
    const frameChroma = this.frameChroma.fill(0);
    const shape = spectralShape(this.powSlow, this.hzSlow, frameChroma, 4);
    const tonal = level > 0.08 ? clamp(shape.tonality * 1.4) : 0;
    this.tonalAvg += (tonal - this.tonalAvg) * Math.min(1, dt / 2);
    let cs = 0;
    for (let i = 0; i < 12; i++) cs += frameChroma[i];
    if (cs > 0 && tonal > 0.2) {
      const a = Math.min(1, (dt / 3) * tonal);
      for (let i = 0; i < 12; i++) this.chroma[i] += (frameChroma[i] / cs - this.chroma[i]) * a;
    }
    // the bass line: spectral peaks between 35 and 260 Hz, by pitch class
    const fb = this.frameBass.fill(0), hz = this.hzSlow, P = this.powSlow;
    let bmax = 0, bs = 0;
    for (let k = Math.ceil(35 / hz); k <= 260 / hz; k++) bmax = Math.max(bmax, P[k]);
    for (let k = Math.max(2, Math.ceil(35 / hz)); k <= 260 / hz; k++)
      if (P[k] > bmax * 0.1 && P[k] >= P[k - 1] && P[k] >= P[k + 1]) fb[((Math.round(12 * Math.log2((peakBin(P, k) * hz) / 440) + 69) % 12) + 12) % 12] += P[k] / bmax;
    for (let i = 0; i < 12; i++) bs += fb[i];
    if (bs > 0 && level > 0.08) for (let i = 0; i < 12; i++) this.bass[i] += (fb[i] / bs - this.bass[i]) * Math.min(1, dt / 4);
    if (this.chroma.some((v) => v > 0)) this.key = estimateKey(this.chroma, this.bass, this.hint?.key || null);

    for (let b = 0; b < 10; b++) {
      const k0 = Math.max(1, Math.floor(this.bandEdges[b] / this.hzSlow));
      const k1 = Math.max(k0 + 1, Math.floor(this.bandEdges[b + 1] / this.hzSlow));
      let p = 0;
      for (let k = k0; k < k1; k++) p += this.powSlow[k];
      const v = clamp((10 * Math.log10(p + 1e-12) + 75) / 60);
      this.band10[b] = Math.max(v, this.band10[b] - dt * 1.8);
    }

    this.envelope(now, level > 0.08 ? Math.max(0, odf - mean) : 0);
    const ext = this.extClock(now);
    const bpm = ext ? ext.bpm * foldTempo(ext.bpm) : this.lock || this.estimateBpm(now);
    if (bpm) this.bpm = bpm;
    else if (!this.onsetTimes.length) this.bpm = 0;
    // the tempo as a person would count it: the page's is folded into 80-160, so it is unfolded by the track's known
    // tempo when the two agree, and drum & bass (half-time 87 under a busy top end; a measured preview says 87 too)
    // is counted double
    const hb = this.hint?.bpm, hk = hb > 0 ? foldTempo(hb) : 0;
    let tempo = this.bpm ? this.bpm / (ext ? foldTempo(ext.bpm) : hk && Math.abs(hb * hk - this.bpm) <= 3 ? hk : 1) : 0;
    if (!ext && tempo && tempo < 100 && this.busy > 0.09) tempo *= 2;
    const onsetRate = this.onsetTimes.filter((t) => now - t < 4).length / 4;

    const rel = this.relativeBands(dt, level);
    const beat = ext ? this.followClock(now, dt, ext) : this.trackBeat(now, dt, Math.max(0, odf - mean));
    const section = beat.on ? this.trackSections(now, rel, onsetRate, shape.bright) : null;

    this.f = {
      level, db, rms, onset, onsetRate, flux: clamp(flux / 60), fluxAvg: this.fluxAvg, busy: this.busy,
      lowDb: 10 * Math.log10(powLow + 1e-12), highDb: 10 * Math.log10(powHigh + 1e-12), clock: !!ext,
      bands: shape.bands, bright: shape.bright, centroidHz: shape.centroidHz,
      tonal, tonalAvg: this.tonalAvg, chroma: this.chroma, frameChroma, key: this.key, bpm: this.bpm, tempo,
      band10: this.band10, wave: this.wave,
      low: clamp((shape.bands.sub + shape.bands.low) * level * 1.6),
      mid: clamp(shape.bands.mid * level * 2),
      high: clamp((shape.bands.high + shape.bands.air) * level * 4),
      rel, beat, section,
    };
    return this.f;
  }

  // MilkDrop/Butterchurn levels: `x` = now / long average, `xAtt` = attack-release smoothed / long average,
  // both ~1 for this track's usual level; `drive` maps att onto 0..1 and `clock` runs faster when the band is
  // loud (Synesthesia's BassTime), for motion that speeds up with the music instead of twitching with it.
  relativeBands(dt, level) {
    const k = 30 * dt, out = {};
    this.frames++;
    for (const b of this.rel) {
      let imm = 0;
      for (let i = b.bins[0]; i <= b.bins[1]; i++) imm += Math.pow(10, this.dbFast[i] / 20);
      const r = Math.pow(imm > b.avg ? 0.2 : 0.5, k);
      b.avg = b.avg * r + imm * (1 - r);
      if (level > 0.08) { // the long average freezes in breaks so the quiet isn't scaled up
        const rl = Math.pow(this.frames < 50 ? 0.9 : 0.992, k);
        b.long = b.long * rl + imm * (1 - rl);
      }
      const x = imm / (b.long + 1e-9), att = b.avg / (b.long + 1e-9);
      b.clock += dt * (0.25 + 0.75 * Math.min(2, att));
      out[b.name] = x;
      out[`${b.name}Att`] = att;
      out[`${b.name}Drive`] = clamp((att - 0.6) / 0.9);
      out[`${b.name}Clock`] = b.clock;
    }
    return out;
  }

  // Beat phase after Scheirer: fold the onset envelope onto the tempo period and let it build up; the peak of the
  // fold is where beats fall. A free-running phase is pulled softly toward it, so it stays steady through fills.
  trackBeat(now, dt, odf) {
    const b = this.beat, B = 24;
    b.on = b.tick = false;
    if (!this.bpm) { b.conf = Math.max(0, b.conf - dt); b.pulse *= Math.exp(-dt / 0.15); return b; }
    const T = 60 / this.bpm;
    // the fold counts from `ref`, moved along with any change of tempo so that where now falls in the fold stays put:
    // a small change keeps what was built up, as it must, the estimate settling by a tenth of a BPM at a time
    if (!b.R || Math.abs(T - b.T) / T > 0.03) { b.T = T; b.ref = now; b.R = new Float32Array(B); b.lastBin = -1; }
    else if (T !== b.T) { b.ref = now - ((now - b.ref) / b.T) * T; b.T = T; }
    const pos = ((now - b.ref) / b.T) % 1, bin = Math.floor(pos * B), a = Math.pow(0.5, b.T / 1.75);
    // update every bin passed since the last frame, so none goes stale at low frame rates
    for (let i = b.lastBin < 0 ? bin : (b.lastBin + 1) % B, guard = 0; guard < B; i = (i + 1) % B, guard++) {
      b.R[i] = b.R[i] * a + odf * (1 - a);
      if (i === bin) break;
    }
    b.lastBin = bin;
    let peak = 0, max = 0, sum = 0;
    for (let i = 0; i < B; i++) {
      const v = b.R[(i + B - 1) % B] * 0.5 + b.R[i] + b.R[(i + 1) % B] * 0.5;
      sum += v;
      if (v > max) { max = v; peak = i; }
    }
    b.conf = max > 0 ? clamp((max - sum / B) / max) : 0;
    const target = (pos - (peak + 0.5) / B + 1) % 1;
    b.prev = b.phase;
    b.phase = (b.phase + dt / b.T) % 1;
    const err = ((target - b.phase + 1.5) % 1) - 0.5;
    b.phase = (b.phase + 0.1 * err + 1) % 1;
    // every beat is counted while there is a tempo, so the bars and squares keep their places through a breakdown
    // that barely shows the beat; only the sure ones are told (`on`)
    b.tick = b.prev > 0.75 && b.phase < 0.25;
    if (b.tick) b.count++;
    if (b.tick && b.conf > 0.08) {
      b.on = true;
      b.pulse = 1;
    } else b.pulse *= Math.exp(-dt / 0.15);
    return b;
  }

  // The jam's beats, folded into the page's 80-160 range like estimateBpm. `count` keeps counting up (sections
  // measure beats with it) but is nudged so that count % 4 == 0 falls on the jam's bar lines.
  followClock(now, dt, ext) {
    const b = this.beat, k = foldTempo(ext.bpm);
    const pos = Math.max(0, (ext.beat + (now - ext.at) / ext.T) * k), n = Math.floor(pos);
    b.prev = b.phase;
    b.phase = pos % 1;
    b.conf = 1;
    b.on = b.tick = b.n !== undefined && n !== b.n; // a jump back is the jam starting over on bar one
    if (b.on) {
      b.count++;
      b.count += (((n - b.count) % 4) + 4) % 4;
      b.pulse = 1;
    } else b.pulse *= Math.exp(-dt / 0.15);
    b.n = n;
    b.T = 60 / this.bpm;
    b.R = null; // the phase search starts over once the clock stops
    return b;
  }

  // Once a beat: compare the last two bars with the two before (bands, chroma, density, brightness). A jump in
  // that novelty is a new section; a bassline returning after a stretch without one is a drop.
  trackSections(now, rel, onsetRate, bright) {
    const s = this.sect;
    const v = [...this.band10, ...this.chroma.map((c) => c * 2), clamp(onsetRate / 8), bright];
    s.vecs.push(v);
    if (s.vecs.length > 16) s.vecs.shift();
    const beatsSince = this.beat.count - s.since;
    s.lowRun = rel.bassAtt < 0.6 ? s.lowRun + 1 : 0;
    if (s.lowRun >= 8) s.armed = true; // two bars without the bassline: a breakdown
    if (s.armed && rel.bassAtt > 1.4) {
      s.armed = false;
      s.since = this.beat.count;
      return 'drop';
    }
    s.backRun = s.armed && rel.bassAtt > 0.9 ? (s.backRun || 0) + 1 : 0;
    if (s.backRun > 2) s.armed = false; // the bass crept back in instead of dropping
    if (s.vecs.length < 16) return null;
    const mean = (from, to) => s.vecs.slice(from, to).reduce((acc, x) => acc.map((a, i) => a + x[i] / (to - from)), new Array(v.length).fill(0));
    const a = mean(0, 8), b = mean(8, 16);
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    const nov = 1 - dot / (Math.sqrt(na * nb) + 1e-9);
    s.nov.push(nov);
    if (s.nov.length > 32) s.nov.shift();
    const m = s.nov.reduce((x, y) => x + y, 0) / s.nov.length;
    const sd = Math.sqrt(s.nov.reduce((x, y) => x + (y - m) ** 2, 0) / s.nov.length);
    if (nov > m + 1.5 * sd && nov > 0.015 && beatsSince >= 16) {
      s.since = this.beat.count;
      return 'change';
    }
    return null;
  }

  // The onset envelope, sampled onto the even grid: the points between the last frame and this one are drawn
  // between their values (a frame's own time jitters with the screen, the grid doesn't).
  envelope(now, v) {
    const e = this.env;
    if (!e.t || now - e.t > 1) { e.t = now; e.last = v; e.g = Math.floor(now * e.rate) + 1; } // first frame, or the tab slept
    const t0 = e.t, v0 = e.last;
    for (; e.g / e.rate <= now; e.g++) { // (grid points counted, not summed up: none falls between two frames)
      e.buf.copyWithin(0, 1);
      e.buf[e.buf.length - 1] = now > t0 ? v0 + ((v - v0) * (e.g / e.rate - t0)) / (now - t0) : v;
      e.n = Math.min(e.buf.length, e.n + 1);
    }
    e.t = now;
    e.last = v;
  }

  // A new track: its tempo is found afresh rather than pulled over from the last one's.
  retune() {
    const e = this.env;
    e.buf.fill(0);
    e.n = 0;
    e.scores.fill(0);
    e.pend = null;
  }

  // Four times a second: the envelope's tempo scores join a running sum (a few seconds' memory), the best of them,
  // between grid steps, is the tempo. A small change follows at once; a different tempo has to win for 2 s first, so
  // a fill or a break doesn't throw it. The track's known tempo leans on the scores a little; it can't outvote them.
  estimateBpm(now) {
    const e = this.env;
    if (now - e.at < 0.25) return this.bpm;
    const dt = Math.min(1, now - e.at);
    e.at = now;
    const a = Math.exp(-dt / 5);
    for (let j = 0; j < e.scores.length; j++) e.scores[j] *= a;
    if (e.n < e.buf.length / 2 || !tempoScores(e.buf.subarray(e.buf.length - e.n), e.rate, e.scores, 1 - a)) return 0;
    const sc = e.scores, hb = this.hint?.bpm, h = hb > 0 ? hb * foldTempo(hb) : 0;
    let best = -1, bestV = -Infinity, sum = 0;
    for (let j = 0; j < sc.length; j++) {
      const v = sc[j] * (h ? 1 + 0.1 * Math.exp(-((TEMPI[j] - h) ** 2) / 4) : 1);
      sum += v;
      if (v > bestV) { bestV = v; best = j; }
    }
    // no beat to speak of: the best isn't clearly above the rest, or there were hardly any onsets
    if (bestV <= 0 || bestV < 1.5 * Math.max(0, sum / sc.length) || this.onsetTimes.length < 5) return 0;
    let bpm = TEMPI[best];
    if (best > 0 && best < sc.length - 1) {
      const y0 = sc[best - 1], y1 = sc[best], y2 = sc[best + 1], den = y0 - 2 * y1 + y2;
      if (den < 0) bpm += clamp((0.5 * (y0 - y2)) / den, -0.5, 0.5) * 0.5;
    }
    bpm = Math.round(bpm * 10) / 10;
    if (!this.bpm || Math.abs(bpm - this.bpm) <= 1.5) { e.pend = null; return this.bpm ? this.bpm + (bpm - this.bpm) * 0.3 : bpm; }
    if (!e.pend || Math.abs(e.pend.bpm - bpm) > 1.5) e.pend = { bpm, since: now };
    return now - e.pend.since >= 2 ? ((e.pend = null), bpm) : this.bpm;
  }
}

// Mood = valence (dark..bright) x arousal (still..wild), 3x3 cells.
export const MOODS = [
  // [arousal row][valence col]
  ['melancholic', 'calm', 'dreamy'],
  ['mysterious', 'focused', 'happy'],
  ['aggressive', 'tense', 'euphoric'],
];
// calibrated on the reference kits: lofi lands low, drum & bass high, dub and synthwave dark, techno tense
const V_EDGES = [0.42, 0.58];
const A_EDGES = [0.42, 0.6];

export class Mood {
  constructor() {
    this.v = 0.5;
    this.a = 0.4;
    this.col = 1;
    this.row = 0;
    this.since = 0;
    this.trail = [];
    // where the playing track is said to sit (its genre tags, tempo and mode): { v, a, w }, pulled in with
    // weight w while it plays, so a dark track that happens to sound bright for a bar stays on its side
    this.hint = null;
  }

  update(f, dt, now) {
    if (f.level > 0.1) {
      // Arousal is mostly tempo: loudness and hit counts are much the same across dance music, tempo is not. The
      // tempo as counted (`tempo`): drum & bass is 174, not the half-time 87 the beat grid runs at.
      const bpm = f.tempo;
      const tempo = bpm ? clamp((bpm - 80) / 75) : 0;
      const aRaw = 0.4 * tempo + 0.2 * clamp(f.busy / 0.13) + 0.15 * clamp(f.fluxAvg / 0.16) + 0.15 * clamp(f.onsetRate / 3.5) + 0.1 * f.bright;
      // Valence: the mode decides as far as there is harmony to hear; brightness, a heavy low end and tempo lean on
      // it, so drums alone still get a side
      const mode = f.key ? f.key.major * clamp(f.tonalAvg * 1.6) : 0;
      const lowHeavy = f.bands.sub + f.bands.low;
      const vRaw = 0.5 + 0.5 * clamp(0.85 * mode + 0.5 * (f.bright - 0.4) - 0.25 * (lowHeavy - 0.6) + 0.1 * (tempo - 0.5), -1, 1);
      const h = this.hint, w = h ? clamp(h.w ?? 0.4) : 0;
      const aTo = h && h.a != null ? clamp(aRaw) + (h.a - clamp(aRaw)) * w : clamp(aRaw);
      const vTo = h && h.v != null ? clamp(vRaw) + (h.v - clamp(vRaw)) * w : clamp(vRaw);
      const k = Math.min(1, dt / 1.4);
      this.a += (aTo - this.a) * k;
      this.v += (vTo - this.v) * k;
    }
    const pick = (val, edges, cur) => {
      const m = 0.03; // hysteresis
      let i = val < edges[0] ? 0 : val < edges[1] ? 1 : 2;
      if (i !== cur && Math.abs(val - edges[Math.min(i, cur)]) < m) i = cur;
      return i;
    };
    const col = pick(this.v, V_EDGES, this.col), row = pick(this.a, A_EDGES, this.row);
    if ((col !== this.col || row !== this.row) && now - this.since > 1.5) {
      this.col = col;
      this.row = row;
      this.since = now;
    }
    if (f.level > 0.1) {
      this.trail.push([this.v, this.a]);
      if (this.trail.length > 90) this.trail.shift();
    }
    return MOODS[this.row][this.col];
  }

  get name() {
    return MOODS[this.row][this.col];
  }
}
