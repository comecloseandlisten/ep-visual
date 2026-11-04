// The groove: how much the picture can take right now. Beat by beat it remembers the track (how loud, how much
// bass, how much top, how many hits) and measures the moment against the track's own full level, so a breakdown
// reads as one however hot the track is mastered. From that come the parts of a dance track: the groove, the pit
// (a hole of a beat or a bar, mostly just before a drop), the breakdown (the bass gone), the build (hits, top and
// brightness climbing bar after bar), the drop (the bass slamming back after any of those) and the peak. Each part
// sets a budget, 0..1, for the amount of visual junk: next to nothing in a pit, a little in a breakdown, more and
// more through a build, everything on the drop. Underneath runs the groove's own pattern, where the hits fall on
// the sixteen steps of a bar: its accents, how off-beat it is, how much it swings, how locked it is, when a fill
// breaks it, and which expected hit did not come (the first sign of a pit). And over it all, the squares: dance
// music runs in squares, its parts begin on the one of a square, and so does every change of picture. A square is
// found, not assumed: every place a part begins is marked (a drop, the first sound of a track, the bass cutting
// out, a layer coming in or going, the bar after a fill), and the square is the longest of two, four, eight or
// sixteen bars that the marks keep to. Four bars until the marks say otherwise; a drop and a track's start always
// begin one, so after a part of odd length the squares start over there. When the track's timeline is known (the
// player says when its 0:00 played), the squares are counted the way a Pioneer beat grid counts them: from the
// track's first beat, on a grid of one tempo for the whole track, and the marks only say how long a square is.
import { clamp } from './pixels.js';

const HIST = 512; // beats of memory, three to six minutes
const STEPS = 16; // sixteenths of a bar
export const SQUARES = [8, 16, 32, 64]; // the lengths a square can have, in beats: two, four, eight, sixteen bars
const SQUARE0 = 16; // until the marks say otherwise (drum and bass, heard at half its tempo, makes it eight bars)
const MARK_LIFE = 240; // seconds a mark counts for
// how far off the beat each sixteenth sits: the downbeat 0, beat three 1, beats two and four 2, the eighths in
// between 3, the sixteenths 4 (the metrical levels, after Lerdahl and Jackendoff)
const METER = [0, 4, 3, 4, 2, 4, 3, 4, 1, 4, 3, 4, 2, 4, 3, 4];
const follow = (v, to, dt, tau) => v + (to - v) * (1 - Math.exp(-dt / tau));
const toDb = (p) => 10 * Math.log10(p + 1e-12);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const meanDb = (a) => toDb(mean(a.map((x) => 10 ** (x / 10))));

// the parts of a track, from the emptiest to the fullest
export const PARTS = ['pit', 'break', 'build', 'groove', 'peak', 'drop'];

// What the music asks of a picture now, on the axes of profiles.js (load, motion, react, pulse, burst): as
// cluttered as the budget allows, as much motion as there is energy, keeping to the beat when the groove is locked
// and straight, following the hits when it is broken or off the beat, jerky on a drop and smooth in a breakdown.
export function wantOf(g) {
  if (!g) return null;
  const off = g.sync - 0.5, burst = { pit: 0.1, break: 0.15, build: 0.35 + 0.4 * g.tension, drop: 0.85, peak: 0.75 }[g.state] ?? 0.3 + 0.4 * g.budget;
  return [g.budget, clamp(0.15 + 0.4 * g.energy + 0.4 * g.budget), clamp(0.35 + 1.5 * off + 0.3 * (1 - g.lock)), clamp(1.2 * g.lock - off), burst];
}

// How well a scene's measured groove (`profile`, from profiles.js; none counts as middling) answers `want`, 0..1.
// The clutter counts most: it is what the budget is about.
const AXIS_W = [1.5, 1, 0.6, 0.8, 0.8];
export function grooveFit(profile, want) {
  if (!want) return 0.5;
  const p = profile || [0.5, 0.5, 0.5, 0.5, 0.5];
  let d = 0, w = 0;
  for (let i = 0; i < AXIS_W.length; i++) { d += AXIS_W[i] * (p[i] - want[i]) ** 2; w += AXIS_W[i]; }
  return Math.exp(-d / w / 0.06);
}

export class Groove {
  constructor() {
    this.hist = { loud: new Float32Array(HIST), low: new Float32Array(HIST), high: new Float32Array(HIST), dens: new Float32Array(HIST) };
    this.tmpl = new Float32Array(STEPS); // where the hits of this groove fall, a share per step
    this.bar = new Float32Array(STEPS); // the bar being played
    this.silentT = 0;
    this.startT = null; // when the track started, if it came out of silence
    this.anchor = null; // the squares' clock: { t: a moment a square began, T: the beat period, n: the square now }
    this.len = SQUARE0; // beats in a square, as the marks have it
    this.reset();
  }

  reset() {
    this.n = 0;
    this.head = 0;
    this.ref = null; // the track's full level: the 80th percentile of every measure in the memory
    this.tmpl.fill(0);
    this.barSum = 0;
    this.newTrack();
  }

  // A new track: the parts start over. The memory stays (a playlist is mastered much alike, and the first bars of
  // the next track are not judged blind), but only its last 64 beats.
  newTrack() {
    if (this.n > 64) {
      for (const key in this.hist) {
        const h = this.hist[key], keep = Float32Array.from({ length: 64 }, (_, i) => h[(this.head - 64 + i + HIST) % HIST]);
        h.fill(0);
        h.set(keep);
      }
      this.n = this.head = 64;
    }
    this.bar.fill(0);
    Object.assign(this, {
      acc: this.blank(0), recent: [], loc: null, beatN: 0, pseudo: 0, shift: 0, pending: [], marks: [], len: SQUARE0, cand: null,
      tl: null, tg: null,
      fast: { loud: -70, low: -70, pLoud: 0, pLow: 0, loudMid: -120, lowMid: -120, loudSlow: -90, lowSlow: -90 },
      state: 'groove', before: 'groove', stateT: 0, since: 0, event: null, armed: false, dropBeat: -1e9, dropLen: 16,
      lowRun: 0, quietRun: 0, fullRun: 0, holeT: 0, backT: 0, lastOnset: -1, expect: 0, bars: 0, liftBase: 0,
      energy: 0.6, tension: 0, budget: 0.5, lock: 0, swingAcc: 0, step: -1, stepW: 0, pulse: 0, fill: false,
    });
  }

  blank(t) {
    return { t, frames: 0, p: 0, pl: 0, ph: 0, bright: 0, dens: 0, hits: 0 };
  }

  // Once a frame, after the listener; `f.lowDb` / `f.highDb` are the short window's power below 160 Hz and above
  // 4 kHz. When `shift` comes back non-zero the squares want the beat count moved on by that much: the caller does
  // it (Listener.shiftBeats) and says so with `shifted(shift, out)`.
  update(f, now, dt) {
    const b = f.beat, locked = f.bpm > 0 && b.conf > 0.15, T = locked ? b.T : 0.5, fa = this.fast;
    this.f = f;
    this.now = now;
    this.event = null;
    this.shift = 0;
    const loud = Math.max(-90, f.db), low = Math.max(-90, f.lowDb), high = Math.max(-90, f.highDb);
    // a track starts on the one of a square: the first sound after two seconds of silence
    if (loud < -55) this.silentT += dt;
    else { if (this.silentT > 2) this.startT = now; this.silentT = 0; }
    if (this.startT !== null) { this.mark(this.startT, 2, true); this.startT = null; }
    const sq = this.grid(f, now);
    // marks heard while there was no tempo to place them by
    if (this.pending.length && this.anchor) for (const [t, w, hard] of this.pending.splice(0)) this.mark(t, w, hard);
    // followed in dB, a hole shows within a frame or two; followed in power, a slam out of silence does
    fa.loud = follow(fa.loud, Math.max(-70, loud), dt, 0.05);
    fa.low = follow(fa.low, Math.max(-70, low), dt, 0.05);
    fa.pLoud = follow(fa.pLoud, 10 ** (loud / 10), dt, 0.1);
    fa.pLow = follow(fa.pLow, 10 ** (low / 10), dt, 0.1);
    fa.loudMid = toDb(fa.pLoud);
    fa.lowMid = toDb(fa.pLow);
    fa.loudSlow = follow(fa.loudSlow, loud, dt, 0.4);
    fa.lowSlow = follow(fa.lowSlow, low, dt, 0.4);
    if (f.onset) this.lastOnset = now;
    const a = this.acc;
    a.frames++;
    a.p += 10 ** (loud / 10);
    a.pl += 10 ** (low / 10);
    a.ph += 10 ** (high / 10);
    a.bright += f.bright;
    if (f.onset) { a.dens += f.onset.strength; a.hits++; }
    if (locked) this.steps(f, now);
    else this.step = -1;
    if (locked ? b.tick : (this.pseudo += dt) >= T) {
      this.pseudo = 0;
      this.closeBeat(now);
    }
    this.frame(f, now, dt, T);
    return {
      state: this.state, event: this.event, energy: this.energy, budget: this.budget, tension: this.tension,
      lock: this.lock, sync: this.sync(), swing: clamp(this.swingAcc / 0.33, -1, 1), step: this.step, stepW: this.stepW,
      pulse: this.pulse, fill: this.fill, armed: this.armed, tmpl: this.tmpl, ready: !!this.ref,
      square: sq, shift: this.shift,
      grid: this.tl !== null && this.tg ? { bpm: 60 / this.anchor.T, beats: this.tg.beats } : null, // the track's beat grid
      beats: this.beatN - this.since, // beats spent in this part
    };
  }

  // ------------------------------------------------------------------------------------------- the squares
  // The squares run on a clock of their own: an anchor (a moment a square began) and the beat period, so beat x is
  // (now - anchor) / T. The listener's beats only pull it into phase, a little at each one that lands within a
  // quarter of a beat of the clock; a beat tracker that slips half a beat on a pattern heavy with off-beats does
  // not take the squares with it. Through a breakdown that barely shows the beat the clock runs on at the last
  // tempo. The listener's count is then asked to follow (`shift`), so the bar lines everywhere fall on the squares.
  // Returns where now stands: `len` beats in a square (`bars` bars), `beat` 0..len into it, `bar` 0..bars-1, `n`
  // squares so far, `x` beats so far, `line` on the frame a square begins, `sure` once anything has marked where
  // parts begin; null before there was any tempo.
  grid(f, now) {
    const b = f.beat;
    if (this.tl !== null && !f.clock && f.bpm > 0 && b.T) return this.trackGrid(f, now);
    if (f.bpm > 0 && b.T) {
      if (!this.anchor) this.anchor = { t: now - b.phase * b.T, T: b.T, n: 0 };
      const A = this.anchor;
      if (A.T !== b.T) { A.t = now - ((now - A.t) / A.T) * b.T; A.T = b.T; } // a new tempo carries on from here
      if (f.clock) A.t = now - (b.count + b.phase) * A.T; // a jam's clock is the count: its bar one starts a square
      else if (b.tick && b.conf > 0.3) {
        const x = (now - A.t) / A.T, r = x - Math.round(x);
        // sure beats only (a breakdown's beat wanders, the clock does not go with it): close ones pull the clock a
        // little; ones that stay off it for two bars mean the tracker found the real beat at last, and the clock
        // goes over to it
        A.off = Math.abs(r) < 0.25 ? 0 : (A.off || 0) + 1;
        if (A.off >= 8) { A.t += r * A.T; A.off = 0; } else if (!A.off) A.t += 0.15 * r * A.T;
        // the listener's bar lines go where the squares are, once its beats agree with the clock twice running
        // (four bars at a time, which every square's length is a multiple or a half of)
        const want = A.off ? 0 : (((Math.round((now - A.t) / A.T) - b.count) % SQUARE0) + SQUARE0) % SQUARE0;
        if (want && want === A.want) this.shift = want;
        A.want = want;
      }
    }
    const A = this.anchor;
    if (!A || now - A.t < 0) return null;
    const L = this.len, x = (now - A.t) / A.T, n = Math.floor(x / L), beat = x - n * L;
    const line = n > A.n; // only forward: a clock moved back by a mark begins no square
    A.n = Math.max(A.n, n);
    return { len: L, bars: L / 4, beat, bar: Math.min(L / 4 - 1, Math.floor(beat / 4)), n, x, line, sure: this.marks.length > 0 };
  }

  // The track's timeline: the page time at which the track's 0:00 is heard (null: not known). Set after newTrack(),
  // again on a seek, and whenever the sound's lag moves: a few hundredths are let be, a little more lays beat 0 again
  // on the same grid, a seek starts the grid over.
  timeline(t0) {
    const moved = t0 === null || this.tl === null ? Infinity : Math.abs(t0 - this.tl);
    if (moved < 0.04) return;
    this.tl = t0;
    if (moved < 1 && this.tg) this.tg.place = true;
    else this.tg = null;
  }

  // Pioneer's way: the beats and squares counted on the track's own grid, not from wherever the page began to
  // listen. The phase is the tracker's, kept by the anchor as before (sure beats pull it a little; through a breakdown
  // it runs on), and the tempo is held for the track once it agrees with the track's known one (Listener.lockTo).
  // What the track's timeline adds is which beat is which: beat 0 is the track's first beat, the first one within
  // (-0.2, 0.8) of a beat after its 0:00 (tracks are made from bar one at 0:00, and the sound reaches the page a moment
  // after the player's clock says), so the squares begin on beat 0 and every L beats after it. The tracker may sit on
  // the off half of the beat (on the snare of drum & bass heard at half its tempo): its beats count all the same, and
  // which half the beats are on is the kick's to say, as on a Pioneer grid (kickPhase()).
  trackGrid(f, now) {
    const b = f.beat;
    if (!this.anchor) this.anchor = { t: now - b.phase * b.T, T: b.T, n: 0 };
    const A = this.anchor;
    const G = (this.tg ||= { kick: new Float32Array(24), kicks: 0, beats: 0, want: 0, place: true });
    if (A.T !== b.T) {
      if (Math.abs(A.T - b.T) / b.T > 0.03) Object.assign(G, { kick: new Float32Array(24), kicks: 0, beats: 0, place: true });
      A.t = now - ((now - A.t) / A.T) * b.T; // the beat count at this moment carries on
      A.T = b.T;
    }
    if (f.onset) this.kickPhase(G, now, f.onset);
    if (b.tick && b.conf > 0.15) {
      const x = (now - b.phase * b.T - A.t) / A.T, h = Math.round(2 * x) / 2, r = x - h; // (a beat on the off half too)
      if (Math.abs(r) < 0.2) { A.t += 0.15 * r * A.T; A.off = 0; G.beats++; }
      else if ((A.off = (A.off || 0) + 1) >= 8) { A.t += r * A.T; A.off = 0; } // the tracker found the beat elsewhere
      // the listener's bar lines go onto the grid's, once it agrees twice running on the grid's own beats
      const want = h % 1 || A.off ? 0 : (((h - b.count) % SQUARE0) + SQUARE0) % SQUARE0;
      if (want && want === G.want) this.shift = want;
      G.want = want;
    }
    const L = this.len;
    if (G.place) { // beat 0 goes to the track's first beat
      const c = A.t - this.tl;
      A.t -= Math.floor((c + 0.2 * A.T) / A.T) * A.T;
      A.n = Math.floor((now - A.t) / A.T / L); // (laying the grid begins no square)
      G.place = false;
    }
    const x = (now - A.t) / A.T, n = Math.floor(x / L), beat = x - n * L;
    if (x < 0) return null;
    const line = n > A.n;
    A.n = Math.max(A.n, n);
    return { len: L, bars: L / 4, beat, bar: Math.min(L / 4 - 1, Math.floor(beat / 4)), n, x, line, sure: true };
  }

  // Where the low end's onsets fall on the beat (24 bins, weighted by how much of the onset is low): once half a
  // beat later clearly has more of them, the beats are on the other half, and the grid moves there.
  kickPhase(G, now, onset) {
    const A = this.anchor, B = 24, bin = Math.floor(((((now - A.t) / A.T) % 1) + 1) % 1 * B);
    G.kick[bin] += onset.low;
    if (++G.kicks < 96 || G.kicks % 32) return;
    const w = (c) => G.kick[(c + B - 1) % B] + G.kick[c] + G.kick[(c + 1) % B] + G.kick[(c + 2) % B];
    if (w(B / 2) <= 1.6 * w(0)) return; // (broken beats spread their kicks: only a clear call)
    A.t += A.T / 2;
    G.kick = Float32Array.from({ length: B }, (_, j) => G.kick[(j + B / 2) % B]);
    G.place = true;
  }

  // A part begins at time `t` (`w` says how sure that is; `hard`: a drop or a track's start, which always begins a
  // square): a mark on the beat of the clock nearest to it. Before any tempo it waits for one (half a minute at
  // most); a jam's clock knows its squares.
  mark(t, w, hard = false) {
    const A = this.anchor;
    if (this.f?.clock) return;
    if (!A) { if (this.now - t < 30) this.pending.push([t, w, hard]); return; }
    // a drop or a start is the one itself: the clock's phase goes onto it exactly (not on a track's grid: a drop is
    // heard a little late, the grid knows where its beats are)
    if (hard && this.tl === null) { const x = (t - A.t) / A.T; A.t += (x - Math.round(x)) * A.T; }
    this.marks.push({ n: Math.round((t - A.t) / A.T), w, t, hard });
    this.marks = this.marks.filter((m) => this.now - m.t < MARK_LIFE).slice(-32);
    this.regrid();
  }

  // The squares from the marks: how much of their weight (the older the less) falls on the lines of squares of L
  // beats laid from offset o, within a beat (the clock drifts a little between them), two beats off counting
  // half. The offset is the last hard mark's, or else the best one
  // (the clock as it is, on a tie). The square is four bars, or the longest of eight and sixteen that the marks,
  // heard over two of them, keep to about as well; or two bars, when the marks fall between the lines of four and
  // keep to two. The clock then moves so that a square begins at the offset.
  regrid() {
    const A = this.anchor, M = this.marks, now = this.now;
    if (!A || !M.length) return;
    const mod = (v, L) => ((v % L) + L) % L, wOf = (m) => m.w * Math.exp(-(now - m.t) / MARK_LIFE);
    const W = M.reduce((s, m) => s + wOf(m), 0), hard = M.filter((m) => m.hard).at(-1);
    const on = (L, o) => M.reduce((s, m) => { const d = mod(m.n - o + L / 2, L) - L / 2; return s + wOf(m) * (Math.abs(d) <= 1 ? 1 : Math.abs(d) === 2 ? 0.5 : 0); }, 0) / W;
    const best = (L) => {
      if (this.tl !== null) return { o: 0, fit: on(L, 0) }; // a track's grid: its squares begin on beat 0
      if (hard) return { o: mod(hard.n, L), fit: on(L, mod(hard.n, L)) };
      let r = { o: 0, fit: -1 };
      for (let o = 0; o < L; o++) { const fit = on(L, o); if (fit > r.fit + 1e-9) r = { o, fit }; }
      return r;
    };
    // a longer square needs three firm marks (a drop, a breakdown, a layer, a start) on three of its lines: two
    // marks keep to any length, and a square guessed too long would hold the picture far too long
    const firm = (L) => { const { o } = best(L); return new Set(M.filter((m) => m.w >= 0.75 && Math.abs(mod(m.n - o + 1, L) - 1) <= 1).map((m) => Math.round((m.n - o) / L))).size; };
    let L = SQUARE0;
    if (M.length >= 3 && best(L).fit < 0.6 && best(L / 2).fit >= best(L).fit + 0.25) L /= 2;
    else while (L < SQUARES.at(-1) && firm(2 * L) >= 3 && best(2 * L).fit >= Math.max(0.7, best(L).fit - 0.1)) L *= 2;
    const { o } = best(L);
    if (o) { A.t += o * A.T; for (const m of M) m.n -= o; }
    this.len = L;
    // the square the clock now stands in (or is about to begin, half a beat early) has begun: moving the clock
    // is no new square
    A.n = Math.floor(((now - A.t) / A.T + 0.5) / L);
  }

  // the listener's count moved on by `n`: the bar's template turns with it
  shifted(n, out) {
    const t = Float32Array.from(this.tmpl), q = (n % 4) * 4;
    for (let s = 0; s < STEPS; s++) this.tmpl[(s + q) % STEPS] = t[s];
    this.bar.fill(0);
    this.step = -1;
    if (out) out.shift = 0;
  }

  // ------------------------------------------------------------------------------------------- the frame
  frame(f, now, dt, T) {
    const fa = this.fast, r = this.ref, loc = this.loc;
    // the energy: the last moments against the track's full level, plus the hits of the last two beats
    const dens = mean(this.recent.slice(-2).map((x) => x.dens));
    this.energy = r ? 0.4 * clamp(1 - (r.loud - fa.loudSlow) / 12) + 0.4 * clamp(1 - (r.low - fa.lowSlow) / 18) + 0.2 * clamp(dens / (r.dens + 1e-3)) : 0.6;

    // The pit: a sudden hole against the last few beats, near silence or the bass and most of the rest cut away. It
    // is called as soon as a strong hit the groove expects does not come; without a template to expect by, once
    // the hole has gone without a hit for a whole beat (broken beats and bare intros leave gaps of their own), or
    // for a quarter of a second in a build, which never leaves one; a cut with hits still in it, after a beat. A
    // fade is no pit (it is a breakdown coming), and in a breakdown only near silence is. It ends when the sound is
    // back, in a drop if the bass slams back with it; a hole that goes on is a breakdown.
    const inPit = this.state === 'pit';
    if (loc) {
      // in dB the level falls in a frame or two (a missed hit shows at once); in power it stays up through the
      // gaps between hits, and comes back with the first one
      const dlF = loc.loud - fa.loud, dl = loc.loud - fa.loudMid, db = loc.low - fa.lowMid, quiet = now - this.lastOnset;
      const cut = db > 18 && dl > 4, hole = inPit ? dl > 6 || (db > 14 && dl > 4) : this.state === 'break' ? dl > 18 : dl > 10 || cut;
      const prev = this.recent.slice(-2), sudden = prev.length > 0 && (Math.max(...prev.map((x) => x.loud)) - fa.loudMid > 9 || Math.max(...prev.map((x) => x.low)) - fa.lowMid > 18);
      const missed = this.expect > 0 && now >= this.expect && quiet > 0.16 && dlF > 10 && this.state !== 'break';
      if (this.expect > 0 && now >= this.expect) this.expect = 0;
      // how long the hole has been open; a hit inside a cut only sets it back a little
      this.holeT = inPit ? 0 : hole && sudden ? this.holeT + dt : Math.max(0, this.holeT - 3 * dt);
      const gap = this.state === 'build' ? 0.25 : Math.max(0.45, 1.05 * T);
      if (!inPit) {
        if (missed || (this.holeT > 0 && (quiet > gap || (cut && this.holeT > 0.5 * T)))) this.enter('pit', now);
      } else if (!this.tryDrop(now)) {
        this.backT = hole ? 0 : this.backT + dt;
        // back without a drop: to the breakdown or the build it cut into, or to the groove (a stop, nothing more)
        if (this.backT > 0.2) {
          const back = this.before === 'break' || this.before === 'build' ? this.before : 'groove';
          this.enter(back, now);
          if (back === 'groove') this.armed = this.lowRun >= 4;
        } else if (hole && now - this.stateT > (this.lastOnset > this.stateT ? 2 : 4) * T) this.enter('break', now);
      }
    }
    if (!inPit) this.tryDrop(now);
    // the listener's own drop (a bassline back after two bars without) comes a beat later; it counts when this
    // missed one
    if (f.section === 'drop' && this.state !== 'drop' && this.beatN - this.dropBeat > 16) this.drop(now, 'drop');

    this.pulse *= Math.exp(-dt / 0.12);
    // the budget: what each part leaves room for. Up quickly (at once on a drop), down slowly, but at once into a pit
    const e = this.energy, groove = 0.25 + 0.45 * e + 0.1 * this.lock;
    let want = groove;
    if (this.state === 'pit') want = 0.03;
    else if (this.state === 'break') want = 0.15 + 0.3 * e;
    else if (this.state === 'build') want = Math.max(0.8 * groove, 0.3 + 0.6 * this.tension);
    else if (this.state === 'peak') want = 0.85 + 0.15 * e;
    else if (this.state === 'drop') { const k = clamp((this.beatN - this.dropBeat) / this.dropLen); want = 1 - (1 - groove) * k * k; }
    const tau = want > this.budget ? (this.state === 'drop' ? 0.02 : 0.2) : this.state === 'pit' ? 0.03 : 0.7;
    this.budget = follow(this.budget, want, dt, tau);
  }

  // The bass slamming back after a breakdown, a build without it or a pit: the low end back up to the track's full
  // level and well above the emptiest of the last two beats. Measured against whole beats, so the kicks of a
  // stripped-down bar are no drop each, and neither is a bassline that fades back in.
  tryDrop(now) {
    const fa = this.fast, r = this.ref, prev = this.recent.slice(-2);
    if (!this.armed || !r || prev.length < 2 || fa.lowMid < r.low - 6 || fa.loudMid < r.loud - 8) return false;
    if (fa.lowMid - Math.min(...prev.map((x) => x.low)) < 10 || Math.min(...prev.map((x) => x.e ?? 1)) > 0.55) return false;
    // out of a short stop in the middle of the groove it is only a slam: a hit of light, not a new picture
    const stop = this.state === 'pit' && (this.before === 'groove' || this.before === 'peak' || this.before === 'drop') && now - this.stateT < 2.5;
    this.drop(now, stop ? 'slam' : 'drop');
    return true;
  }

  drop(now, kind) {
    this.enter('drop', now);
    this.event = kind;
    this.armed = false;
    this.dropBeat = this.beatN;
    this.dropLen = kind === 'slam' ? 4 : SQUARE0;
    this.tension = 0;
    // a drop is the one of a square if anything is; a slam lands on some bar line of the groove
    if (kind === 'drop') this.mark(now, 3, true); else this.mark(now, 0.5);
  }

  enter(state, now) {
    if (state === this.state) return;
    const from = this.stateT;
    this.before = this.state;
    this.state = state;
    this.stateT = now;
    this.since = this.beatN;
    this.event = state;
    this.backT = 0;
    if (state === 'pit' || state === 'break') this.armed = true;
    // a pit that turned into a breakdown was the breakdown's first beats: the local level is the breakdown's now,
    // and the square began where the pit did
    if (state === 'break' && this.before === 'pit') {
      this.mark(from, 2);
      for (const x of this.recent) x.pit = false;
      const near = this.recent.slice(-4);
      if (near.length) this.loc = { loud: meanDb(near.map((x) => x.loud)), low: meanDb(near.map((x) => x.low)) };
    }
  }

  // ------------------------------------------------------------------------------------------- beats
  closeBeat(now) {
    const a = this.acc;
    this.acc = this.blank(now);
    this.beatN++;
    if (!a.frames) return;
    const bt = { t: a.t, loud: toDb(a.p / a.frames), low: toDb(a.pl / a.frames), high: toDb(a.ph / a.frames), dens: a.dens, hits: a.hits,
      bright: a.bright / a.frames, pit: this.state === 'pit' };
    if (bt.loud > -55) this.remember(bt); // silence (between tracks, a paused player) is no part of the track
    this.recent.push(bt);
    if (this.recent.length > 32) this.recent.shift();
    const near = this.recent.filter((x) => !x.pit).slice(-4);
    this.loc = near.length ? { loud: meanDb(near.map((x) => x.loud)), low: meanDb(near.map((x) => x.low)) } : null;
    this.judge(bt, now);
    this.layers();
  }

  // A layer coming in or going (hats, a bassline, a pad, the kick): the last four beats unlike the four before,
  // which were like the four before them, by a step a steady groove never makes: six dB in the bass or in the top,
  // four in all, three hits a beat. The contrast peaks on the beat the layer came, which is marked as where a part
  // began, once it has passed its peak.
  layers() {
    const win = this.recent.slice(-12), r = this.ref;
    if (this.n < 32 || !r || win.length < 12 || win.some((x) => x.pit)) { this.cand = null; return; }
    // thirty dB under the track's full level is silence: the noise floor of an empty band jumps about by itself
    const v = (bar) => [meanDb(bar.map((x) => Math.max(x.low, r.low - 30))), meanDb(bar.map((x) => Math.max(x.high, r.high - 30))),
      meanDb(bar.map((x) => Math.max(x.loud, r.loud - 30))), mean(bar.map((x) => x.hits))];
    const dist = (u, w) => Math.max(Math.abs(u[0] - w[0]) / 6, Math.abs(u[1] - w[1]) / 6, Math.abs(u[2] - w[2]) / 4, Math.abs(u[3] - w[3]) / 3);
    const a = v(win.slice(8)), p = v(win.slice(4, 8)), q = v(win.slice(0, 4)), d = dist(a, p);
    if (d > 1 && dist(p, q) < 0.5 && (!this.cand || d > this.cand.d)) this.cand = { t: win[8].t, d, at: this.beatN };
    else if (this.cand && this.beatN - this.cand.at >= 2) { this.mark(this.cand.t, 0.75); this.cand = null; }
  }

  remember(bt) {
    const h = this.hist, i = this.head;
    h.loud[i] = bt.loud;
    h.low[i] = bt.low;
    h.high[i] = bt.high;
    h.dens[i] = bt.dens;
    this.head = (i + 1) % HIST;
    this.n = Math.min(HIST, this.n + 1);
    if (this.n >= 8 && (this.n < 64 || this.beatN % 4 === 0)) {
      const q = (arr) => Array.from(arr.subarray(0, this.n)).sort((x, y) => x - y)[Math.floor(0.8 * (this.n - 1))];
      this.ref = { loud: q(h.loud), low: q(h.low), high: q(h.high), dens: q(h.dens) };
    }
  }

  // share of the remembered beats below `x`
  rank(x, key) {
    const h = this.hist[key];
    let below = 0;
    for (let i = 0; i < this.n; i++) if (h[i] < x) below++;
    return this.n ? below / this.n : 0.5;
  }

  // Once a beat: how full it was, how much it lifted, and which part of the track that makes.
  judge(bt, now) {
    const r = this.ref;
    if (!r) return;
    const dLoud = r.loud - bt.loud, dLow = r.low - bt.low, dHigh = r.high - bt.high, dens = bt.dens / (r.dens + 1e-3);
    bt.e = 0.35 * clamp(1 - dLoud / 12) + 0.35 * clamp(1 - dLow / 18) + 0.15 * clamp(dens) + 0.15 * clamp(1 - dHigh / 15);
    // the lift is what a build turns up: the hits and the top end itself (a riser, the filter opening); the
    // brightness counts less, an outro losing its bass and pads turns brighter without lifting anything
    bt.lift = 0.45 * clamp(dens / 1.5) + 0.35 * clamp(1 - dHigh / 15) + 0.2 * bt.bright;
    bt.rank = 0.5 * this.rank(bt.loud, 'loud') + 0.5 * this.rank(bt.high, 'high');
    this.lowRun = dLow > 10 ? this.lowRun + 1 : 0;
    this.quietRun = bt.e < 0.45 ? this.quietRun + 1 : 0;
    this.fullRun = dLow < 6 && bt.e > 0.6 ? this.fullRun + 1 : 0;
    if (this.lowRun >= 4) this.armed = true; // a bar without the bass: whatever comes back with it is a drop

    // The tension: the lift (hits, top end, brightness) climbing over the last four bars, a bar at a time, plus a
    // roll, twice the hits of three bars ago. Once in a build it holds as long as the lift stays above where the
    // build set out from: a roll that has reached sixteenths climbs no more, but the tension is all there.
    const L = this.recent.filter((x) => x.lift != null && !x.pit).slice(-16);
    let raw = 0, q = null;
    if (L.length >= 12) {
      q = [0, 1, 2, 3].map((i) => mean(L.slice(Math.floor((i * L.length) / 4), Math.floor(((i + 1) * L.length) / 4)).map((x) => x.lift)));
      // a ramp, not a step: a part that comes in brighter in one go (an outro losing its bass) builds nothing
      const ups = (q[1] > q[0]) + (q[2] > q[1]) + (q[3] > q[2]), rise = q[3] - q[0];
      const step = Math.max(q[1] - q[0], q[2] - q[1], q[3] - q[2]) > 0.7 * rise;
      raw = clamp((rise - 0.04) / 0.2) * (ups === 3 ? 1 : ups === 2 ? 0.6 : 0.15) * (step ? 0.3 : 1);
      // a roll: at least three hits a beat, and twice as many as in the first two bars of the window
      const h0 = mean(L.slice(0, 8).map((x) => x.hits)), h1 = mean(L.slice(-4).map((x) => x.hits));
      if (h1 >= 3 && h1 > 1.8 * h0) raw = Math.min(1, raw + 0.3);
    }
    const s = this.state;
    if (s === 'build' && q) raw = Math.max(raw, clamp((q[3] - this.liftBase - 0.04) / 0.25));
    this.tension += (raw - this.tension) * 0.4;

    // the part: a pit is the frame's to call, a drop holds for four bars (a slam for one), then the music decides
    const last = this.recent.slice(-4).filter((x) => x.e != null);
    const e4 = mean(last.map((x) => x.e)), rank4 = mean(last.map((x) => x.rank));
    if (s === 'pit' || (s === 'drop' && this.beatN - this.dropBeat < this.dropLen)) return;
    let next = 'groove';
    if (this.tension > (s === 'build' ? 0.3 : 0.45) && e4 < 0.97) next = 'build';
    else if (s === 'break' ? this.fullRun < 2 : this.lowRun >= 4 || this.quietRun >= 8) next = 'break';
    // the peak: the loudest fifth of the track, once there is a minute of it to compare with
    else if (this.n >= 128 && e4 > 0.85 && rank4 > (s === 'peak' ? 0.6 : 0.75)) next = 'peak';
    if (s === 'break' && next === 'groove') this.armed = false; // the bass crept back in instead of dropping
    if (next === 'build' && s !== 'build') this.liftBase = q ? Math.min(...q) : 0;
    // the bass gone for a bar: the square began on the first beat without it
    if (next === 'break' && s !== 'break' && this.lowRun >= 4) { const first = this.recent.at(-this.lowRun); if (first) this.mark(first.t, 1.5); }
    this.enter(next, now);
  }

  // ------------------------------------------------------------------------------------------- the pattern
  // Each hit lands on the nearest sixteenth of the bar; a bar adds itself to the template when it is over. At every
  // step the template says how strong a hit is due (`stepW`), and a strong one that does not come may be a pit.
  steps(f, now) {
    const b = f.beat, pos = ((b.count % 4) + b.phase) * 4, cur = Math.floor(pos) % STEPS;
    if (f.onset) {
      const near = Math.round(pos), s = near % STEPS;
      this.bar[s] += f.onset.strength;
      if (s % 2) this.swingAcc += (pos - near - this.swingAcc) * 0.05; // late off-beat sixteenths: swing
    }
    if (cur === this.step) return;
    if (cur < this.step) this.closeBar();
    this.step = cur;
    const t = this.tmpl, tmax = Math.max(...t);
    this.stepW = tmax > 0 ? t[cur] / tmax : 0;
    this.pulse = Math.max(this.pulse, this.stepW);
    // a strong hit is due here, by a template that has seen a few bars and that the music keeps to
    if (this.stepW >= 0.6 && this.bars >= 4 && this.lock > 0.5) this.expect = now + 0.09;
    // a fill: the bar so far runs busier than the template and off its pattern. A fill closes a part, so the next
    // bar line is marked as where one begins
    if (!this.fill && cur >= 6 && this.bars >= 8 && this.lock > 0.6 && this.barSum > 0) {
      let sb = 0, stt = 0, dot = 0, nb = 0, nt = 0, all = 0;
      for (let s = 0; s < STEPS; s++) all += t[s];
      for (let s = 0; s < cur; s++) { sb += this.bar[s]; stt += t[s]; dot += this.bar[s] * t[s]; nb += this.bar[s] ** 2; nt += t[s] ** 2; }
      const cos = nb && nt ? dot / Math.sqrt(nb * nt) : 1;
      if (sb > 1.3 * this.barSum * (stt / (all || 1)) && cos < this.lock - 0.2) {
        this.fill = true;
        this.event = 'fill';
        this.mark(now + (4 - (b.count % 4) - b.phase) * b.T, 0.5);
      }
    }
  }

  closeBar() {
    const bar = this.bar, t = this.tmpl;
    let sb = 0, stt = 0, dot = 0, nb = 0, nt = 0;
    for (let s = 0; s < STEPS; s++) { sb += bar[s]; stt += t[s]; dot += bar[s] * t[s]; nb += bar[s] ** 2; nt += t[s] ** 2; }
    if (sb > 0) {
      if (stt > 0) this.lock += (dot / Math.sqrt(nb * nt) - this.lock) * 0.3;
      for (let s = 0; s < STEPS; s++) t[s] = t[s] * 0.8 + (bar[s] / sb) * 0.2;
      this.barSum += (sb - this.barSum) * 0.2;
      this.bars++;
    } else this.lock *= 0.7;
    this.fill = false;
    bar.fill(0);
  }

  // how off-beat the groove is: 0 all on the downbeats, ~0.3 four to the floor, more with every off-beat hit
  sync() {
    let w = 0, s = 0;
    for (let k = 0; k < STEPS; k++) { w += this.tmpl[k] * METER[k]; s += this.tmpl[k]; }
    return s ? w / (4 * s) : 0;
  }
}
