// The light show: flashes, strobes, a beam, a follow spot, light leaks, zoom punches, colour splits, mosaics,
// negatives and afterimages laid over the finished picture. It works on the composed RGB, so every style gets
// it. Each effect has its own cue in the music and its own place on the mood square, so a kick in an aggressive
// track is a punch-in (a white flash on the bar's downbeat) while the same kick in a melancholic one only breathes
// the vignette. Every short effect runs for a time in seconds, counted where the cues are (update), so a picture
// not lit for a moment never saves one up for later. A full flash, a negative or a colour cut comes at most three
// times a second, strobes included: the line for flashing light that photosensitive viewers can take.
import { clamp } from './pixels.js';

const L = 0.2, M = 0.5, H = 0.8;
const fit = (va, v, a) => va.reduce((m, [pv, pa]) => Math.max(m, Math.exp(-((v - pv) ** 2 + (a - pa) ** 2) / 0.06)), 0);
const follow = (v, to, dt, tau) => v + (to - v) * (1 - Math.exp(-dt / tau));

// where on the mood square (valence, arousal) each effect belongs
const VA = {
  flash: [[M, H], [L, H], [H, H], [M, M]], strobe: [[L, H], [M, H], [H, H]], invert: [[L, H]], punch: [[L, H], [M, H], [H, H]],
  split: [[L, H], [H, H], [M, H]], mosaic: [[L, H], [M, H]], beam: [[M, M], [H, M], [M, H], [H, H]], spot: [[L, M], [M, H], [H, H], [M, M]],
  leak: [[H, L], [M, L], [L, L], [H, M]], trails: [[H, L], [L, L], [L, M]], vignette: [[L, L], [L, M], [L, H]], roll: [[M, H], [H, H], [M, M]],
  swap: [[H, H], [M, H], [L, H]], freeze: [[L, H], [M, H], [L, M]], rewind: [[L, M], [M, M], [L, H], [L, L]],
  gel: [[L, H], [M, H], [L, M], [L, L]], vertigo: [[L, M], [M, H], [L, H]],
};

// the effects as the toolbar lists them: key, label
export const EFFECTS = [['flash', 'flash'], ['strobe', 'strobe'], ['invert', 'negative'], ['punch', 'punch'], ['split', 'rgb split'], ['mosaic', 'mosaic'],
  ['beam', 'beam'], ['spot', 'spot'], ['leak', 'leak'], ['vignette', 'vignette'], ['roll', 'roll'], ['trails', 'trails'], ['noise', 'static'],
  ['swap', 'colour swap'], ['freeze', 'freeze'], ['rewind', 'rewind'], ['gel', 'colour gel'], ['vertigo', 'dolly zoom']];
// in auto the groove's budget (groove.js) turns the loud ones down and the soft ones up: a breakdown only breathes
// the vignette and the leaks, a drop gets every flash there is
const LOUD = ['flash', 'strobe', 'invert', 'punch', 'split', 'mosaic', 'swap', 'freeze', 'roll', 'spot', 'vertigo'];
const SOFT = ['leak', 'trails', 'vignette'];
// the gels: what each one keeps of red, green and blue
const GELS = [[1, 0.42, 0.38], [0.38, 0.55, 1], [0.45, 1, 0.5]];
const RING = 24; // frames of history the rewind plays back (0.8 s)
const GAP = 1 / 3; // s, the least time between two flashes (a flash, a negative, a colour cut)

export class LightShow {
  constructor() {
    // strobe, invert, mosaic, noise, swap and freeze: seconds left; flashAt: when the last flash came
    Object.assign(this, { on: true, auto: true, flash: 0, strobe: 0, invert: 0, punch: 0, split: 0, mosaic: 0, noise: 0, vig: 0, roll: -1, trails: 0,
      swap: 0, freeze: 0, rewind: -1, rewindAt: 0, frozen: null, ring: [], head: 0, gel: { a: 0, c: 0 }, vertigo: 0, flashAt: -1, eighth: -1, down: 0, downHeard: false,
      beam: { x: 0, dir: 1, a: 0, last: 0 }, spot: { x: 0.5, y: 0.5, r: 0.2, a: 0 }, leak: { x: 0.9, y: 0.1, tx: 0.9, ty: 0.1, a: 0 },
      w: {}, prev: null, copy: null, active: [], sheets: {}, mode: 'cells', held: null, past: false, enabled: Object.fromEntries(EFFECTS.map(([k]) => [k, true])) });
  }

  // an effect switched on or off from the toolbar; off also puts out whatever of it is still showing
  set(k, on) {
    this.enabled[k] = on;
    if (on) return;
    if (k === 'flash') this.flash = 0; else if (k === 'strobe') this.strobe = 0; else if (k === 'invert') this.invert = 0; else if (k === 'punch') this.punch = 0;
    else if (k === 'split') this.split = 0; else if (k === 'mosaic') this.mosaic = 0; else if (k === 'noise') this.noise = 0; else if (k === 'vignette') this.vig = 0;
    else if (k === 'roll') this.roll = -1; else if (k === 'trails') this.trails = 0; else if (k === 'beam') this.beam.a = 0; else if (k === 'spot') this.spot.a = 0;
    else if (k === 'leak') this.leak.a = 0; else if (k === 'swap') this.swap = 0; else if (k === 'freeze') this.freeze = 0; else if (k === 'rewind') this.rewind = -1;
    else if (k === 'gel') this.gel.a = 0; else if (k === 'vertigo') this.vertigo = 0;
  }

  // cues: hits, the beat, the section, the groove (`f.groove`); `v`/`a` are the mood's valence and arousal,
  // smoothed. In auto every effect weighs by its place on the mood square and by the groove's budget; by hand every
  // switched-on effect fires at full on its cue.
  update(dt, f, hits, v, a, now, rnd) {
    const w = this.w, en = this.enabled, g = f.groove, sq = g?.square;
    const was = { flash: this.flash, invert: this.invert, swap: this.swap }, onBeat = f.bpm > 0 && f.beat.conf > 0.15;
    for (const k in VA) w[k] = en[k] ? (this.auto ? fit(VA[k], v, a) : 1) : 0;
    w.noise = en.noise ? 1 : 0;
    if (this.auto && g) {
      const loud = clamp((g.budget - 0.12) / 0.6), soft = 0.6 + 0.9 * (1 - g.budget);
      for (const k of LOUD) w[k] *= loud;
      for (const k of SOFT) w[k] = Math.min(1, w[k] * soft);
      w.beam *= 0.4 + 0.6 * loud;
    }
    // a slam (a one-beat stop and the groove back) is a hit of light, not a new picture
    if (g?.event === 'slam') { this.flash = Math.max(this.flash, 0.8 * w.flash); this.punch = Math.max(this.punch, w.punch); }
    if (g?.event === 'fill' && this.roll < 0 && rnd() < 0.3 + 0.7 * w.roll) this.roll = 0;
    // the beat comes read ahead (sync.js) and a hit as heard, a moment later: a kick that keeps landing on the bar's
    // downbeat (`down`) is flashed on the downbeat itself, as the room hears it, and the late hit adds nothing then
    if (onBeat && f.beat.on && f.beat.count % 4 === 0) {
      if (!this.downHeard) this.down *= 0.5;
      this.downHeard = false;
      if (this.down > 0.55 && g?.state !== 'break' && g?.state !== 'pit') this.flash = Math.max(this.flash, (0.25 + 0.75 * this.down) * w.flash);
    }
    for (const h of hits) {
      if (h.kind === 'kick' || h.kind === 'bass') {
        // a white flash only on an accent (the bar's downbeat, by the beat the hit was heard on, or a kick far harder
        // than usual); the other kicks only pump the light a little
        const at = h.at ?? f.beat.count + f.beat.phase, down = (at + 0.15) % 4 < 0.4, accent = onBeat ? down : h.strength > 0.85;
        if (onBeat && down && !h.own) { this.down += (h.strength - this.down) * 0.4; this.downHeard = true; }
        if (h.strength > 0.55) this.flash = Math.max(this.flash, (accent ? 0.25 + 0.75 * h.strength : 0.15) * w.flash);
        this.punch = Math.max(this.punch, h.strength * w.punch);
        this.vig = Math.max(this.vig, 0.7 * w.vignette);
      } else if (h.kind === 'snare') {
        if (rnd() < 0.5 * w.invert) this.invert = 0.07;
        this.split = Math.max(this.split, h.strength * w.split);
        if (h.strength > 0.7 && rnd() < w.mosaic) this.mosaic = 0.07;
        if (h.strength > 0.7 && rnd() < 0.5 * w.swap) this.swap = 0.1; // the colour flash of a graphic cut
        if (h.strength > 0.8 && rnd() < 0.35 * w.freeze && this.freeze <= 0) this.freeze = 0.2; // a held, blue-lit frame
        if (h.strength > 0.8 && rnd() < 0.4 * w.vertigo) this.vertigo = 1; // the dolly zoom: the edges rush in, the middle stays
        if (w.spot > 0.3) this.spot = { x: h.x, y: h.y, r: 0.12 + 0.15 * h.strength, a: w.spot };
      } else if (h.kind === 'hat') {
        if (this.roll < 0 && rnd() < 0.5 * w.roll) this.roll = 0;
      } else if (h.pc >= 0) {
        this.leak.tx = h.x;
        this.leak.ty = h.y * 0.6;
        this.leak.a = Math.min(1, this.leak.a + 0.35 * w.leak);
      }
    }
    // a drop: a flash, static, and a strobe on the eighths through its first bar (a second and a half without a tempo)
    if (f.section === 'drop') { if (w.flash) this.flash = 1; if (w.noise) this.noise = 0.1; if (w.strobe) this.strobe = onBeat ? 4 * f.beat.T : 1.5; }
    // the last second plays backwards on a drop, sometimes on a new part: the return to the moment before
    if ((f.section === 'drop' || (f.section === 'change' && rnd() < 0.5)) && rnd() < w.rewind && this.rewind < 0 && this.ring.length === RING) { this.rewind = 0; this.rewindAt = now; }
    if (this.rewind >= 0 && now - this.rewindAt > 2) this.rewind = -1; // a rewind the picture never got to play
    // a coloured gel over a whole part, as in the giallo and the dance-school horror
    if (f.section && rnd() < 0.5 * w.gel) this.gel = { a: 1, c: Math.floor(rnd() * GELS.length) };
    this.gel.a *= Math.exp(-dt / 6);
    this.vertigo *= Math.exp(-dt / 0.35);
    // a hard strobe through the last bar of a square when the track is at its top, and for a moment after a drop;
    // through a build it stutters on the eighths in the second half of the square and on the sixteenths in its
    // last bar, where the drop is due
    const top = g ? g.state === 'peak' || g.state === 'drop' : f.rel.bassAtt > 1.2, lastBar = sq ? sq.bar === sq.bars - 1 : f.beat.count % 16 >= 12;
    if (onBeat && w.strobe > 0.5 && top && lastBar) this.flash = Math.max(this.flash, f.beat.phase % 0.5 < 0.15 ? 0.55 : 0);
    if (onBeat && sq && g.state === 'build' && sq.beat >= sq.len / 2 && w.strobe > 0.2) {
      const rate = lastBar ? 4 : 2;
      if ((f.beat.phase * rate) % 1 < 0.2) this.flash = Math.max(this.flash, (0.2 + 0.4 * g.tension) * Math.min(1, 1.5 * w.strobe));
    }
    const eighth = onBeat ? Math.floor(f.beat.count * 2 + f.beat.phase * 2) : Math.floor(now / GAP);
    if (this.strobe > 0 && eighth !== this.eighth) this.flash = Math.max(this.flash, 0.8);
    this.eighth = eighth;
    // no more than three flashes a second: one that comes too soon after the last is not lit
    const lit = this.flash > 0.25 && this.flash > was.flash + 0.15, neg = this.invert > was.invert, cut = this.swap > was.swap;
    if (lit || neg || cut) {
      if (now - this.flashAt < GAP) { if (lit) this.flash = was.flash; if (neg) this.invert = was.invert; if (cut) this.swap = was.swap; }
      else this.flashAt = now;
    }
    for (const k of ['strobe', 'invert', 'mosaic', 'noise', 'swap', 'freeze']) this[k] = Math.max(0, this[k] - dt);
    // the beam sweeps across once a bar, turning round at the end; the leak drifts after the notes
    const bar = onBeat ? ((f.beat.count % 4) + f.beat.phase) / 4 : (now / 2) % 1;
    if (bar < this.beam.last) this.beam.dir = -this.beam.dir;
    this.beam.last = bar;
    this.beam.x = this.beam.dir > 0 ? bar : 1 - bar;
    this.beam.a = follow(this.beam.a, w.beam * clamp(f.rel.midDrive + 0.2) * clamp((f.level - 0.08) / 0.12), dt, 0.15);
    this.leak.x = follow(this.leak.x, this.leak.tx, dt, 2);
    this.leak.y = follow(this.leak.y, this.leak.ty, dt, 2);
    this.leak.a *= Math.exp(-dt / 1.5);
    this.trails = w.trails * clamp(1 - f.fluxAvg * 4);
    this.flash *= Math.exp(-dt / 0.06);
    this.punch *= Math.exp(-dt / 0.1);
    this.split *= Math.exp(-dt / 0.09);
    this.vig *= Math.exp(-dt / 0.3);
    this.spot.a *= Math.exp(-dt / 0.45);
    if (this.roll >= 0 && (this.roll += dt * 3.5) > 1) this.roll = -1;
  }

  // the composed picture, RGBA at N x N; `ink`: how much of it is painted (0..1), which the lights that fall on the
  // picture (beam, spot, leak, vignette, gel) follow, so a drying canvas takes them down with it
  apply(data, N, u, ink = 1) {
    if (this.mode !== 'cells') { this.mode = 'cells'; this.copy = null; }
    const M2 = N * N, cx = N / 2, cy = N / 2;
    if (!this.copy || this.copy.length !== data.length) { this.copy = new Uint8ClampedArray(data.length); this.prev = null; this.ring = []; this.head = 0; this.frozen = null; this.rewind = -1; this.freeze = 0; }
    const copy = this.copy;
    if (this.rewind >= 0) { // the history ring played back from the newest frame, with a tracking tear across it
      const k = this.rewind++, src = this.ring[(this.head - 1 - k + RING * 2) % RING];
      data.set(src);
      const ty = Math.floor(((k / RING) * 1.2 % 1) * N);
      for (let x = 0; x < N; x++) { const sx = (x + ((k * 7) % 11) - 5 + N) % N, i = (ty * N + x) * 4, j = (ty * N + sx) * 4; data[i] = src[j]; data[i + 1] = src[j + 1]; data[i + 2] = src[j + 2]; }
      if (this.rewind >= RING) this.rewind = -1;
    } else if (this.freeze > 0) { // a held frame, lit blue
      if (!this.frozen || this.frozen.length !== data.length) { this.frozen = new Uint8ClampedArray(data.length); this.frozen.set(data); }
      for (let i = 0; i < data.length; i += 4) { data[i] = this.frozen[i] * 0.55; data[i + 1] = this.frozen[i + 1] * 0.75; data[i + 2] = this.frozen[i + 2] * 0.85 + 40; }
    } else this.frozen = null;
    if (this.vertigo > 0.03) { // the dolly zoom: a radial stretch that grows toward the edges while the centre holds
      const v = 0.35 * this.vertigo, R2 = (N / 2) ** 2;
      copy.set(data);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy, k = 1 + (v * (dx * dx + dy * dy)) / R2;
          const sx = clamp(Math.round(cx + dx / k - 0.5), 0, N - 1), sy = clamp(Math.round(cy + dy / k - 0.5), 0, N - 1);
          const si = (sy * N + sx) * 4, di = (y * N + x) * 4;
          data[di] = copy[si]; data[di + 1] = copy[si + 1]; data[di + 2] = copy[si + 2];
        }
    }
    if (this.punch > 0.02) { // a punch in: the picture scales up about the middle for a few frames
      const k = 1 + 0.07 * this.punch;
      copy.set(data);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const sx = clamp(Math.round(cx + (x + 0.5 - cx) / k - 0.5), 0, N - 1), sy = clamp(Math.round(cy + (y + 0.5 - cy) / k - 0.5), 0, N - 1);
          const si = (sy * N + sx) * 4, di = (y * N + x) * 4;
          data[di] = copy[si]; data[di + 1] = copy[si + 1]; data[di + 2] = copy[si + 2];
        }
    }
    if (this.mosaic > 0) { // big pixels for a frame or two
      const B = Math.max(2, Math.round(N / 40));
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const si = ((y - (y % B)) * N + x - (x % B)) * 4, di = (y * N + x) * 4;
          data[di] = data[si]; data[di + 1] = data[si + 1]; data[di + 2] = data[si + 2];
        }
    }
    if (this.split > 0.05) { // red one way, blue the other
      const dx = Math.max(1, Math.round(this.split * 3 * u));
      copy.set(data);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const i = (y * N + x) * 4;
          data[i] = copy[(y * N + clamp(x - dx, 0, N - 1)) * 4];
          data[i + 2] = copy[(y * N + clamp(x + dx, 0, N - 1)) * 4 + 2];
        }
    }
    const lit = clamp(ink / 0.25), flash = Math.min(1, this.flash), inv = this.invert > 0, vig = this.vig * lit, beam = this.beam, spot = this.spot, leak = this.leak;
    const ba = beam.a * lit, sa = spot.a * lit, la = leak.a * lit;
    // the afterimages are of the lit picture, never of a flash, a negative or static: those would smear into grey
    const ta = 0.4 * this.trails, prev = ta > 0.008 && this.prev?.length === data.length ? this.prev : null;
    if (ta > 0.008 && !prev) this.prev = new Uint8ClampedArray(data.length);
    const keep = ta > 0.008 ? this.prev : null;
    const bw = 0.06 * N, bx = beam.x * N, spR = spot.r * N, spx = spot.x * N, spy = spot.y * N, lkR = 0.45 * N, lkx = leak.x * N, lky = leak.y * N;
    const doBeam = ba > 0.08, doSpot = sa > 0.08, doLeak = la > 0.05, doVig = vig > 0.02, doFlash = flash > 0.02;
    if (doBeam || doSpot || doLeak || doVig || doFlash || inv || keep)
      for (let y = 0, i = 0; y < N; y++)
        for (let x = 0; x < N; x++, i += 4) {
          let r = data[i], g = data[i + 1], b = data[i + 2];
          if (doBeam) { const d = Math.abs(x + 0.5 - bx); if (d < bw) { const k = 0.55 * ba * (1 - d / bw); r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } }
          if (doSpot) { const d = Math.hypot(x + 0.5 - spx, y + 0.5 - spy); if (d < spR) { const k = 0.6 * sa * (1 - d / spR); r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } }
          if (doLeak) { const d = Math.hypot(x + 0.5 - lkx, y + 0.5 - lky); if (d < lkR) { const k = la * (1 - d / lkR) ** 2; r += 140 * k; g += 70 * k; b += 15 * k; } }
          if (doVig) { const k = 1 - vig * 0.7 * clamp((Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / N - 0.3) / 0.4); r *= k; g *= k; b *= k; }
          if (prev) { r += (prev[i] - r) * ta; g += (prev[i + 1] - g) * ta; b += (prev[i + 2] - b) * ta; }
          if (keep) { keep[i] = r; keep[i + 1] = g; keep[i + 2] = b; }
          if (inv) { r = 255 - r; g = 255 - g; b = 255 - b; }
          if (doFlash) { r += (255 - r) * flash; g += (255 - g) * flash; b += (255 - b) * flash; }
          data[i] = r; data[i + 1] = g; data[i + 2] = b;
        }
    if (!keep) this.prev = null;
    if (this.noise > 0) { // static, right after a drop
      for (let k = M2 * 0.3; k > 0; k--) { const i = Math.floor(Math.random() * M2) * 4, v = Math.random() * 255; data[i] = data[i + 1] = data[i + 2] = v; }
    }
    if (this.roll >= 0) { // a bright line rolling down, off a hat
      const h = Math.max(2, Math.round(2 * u)), y0 = Math.min(N - h, Math.floor(this.roll * N));
      for (let i = y0 * N * 4, e = (y0 + h) * N * 4; i < e; i += 4) { data[i] += (255 - data[i]) * 0.6; data[i + 1] += (255 - data[i + 1]) * 0.6; data[i + 2] += (255 - data[i + 2]) * 0.6; }
    }
    if (this.gel.a * lit > 0.03) { // the gel: one colour kept, the others held down
      const [gr, gg, gb] = GELS[this.gel.c], a = this.gel.a * lit, kr = 1 - a * (1 - gr), kg = 1 - a * (1 - gg), kb = 1 - a * (1 - gb);
      for (let i = 0; i < data.length; i += 4) { data[i] *= kr; data[i + 1] *= kg; data[i + 2] *= kb; }
    }
    if (this.swap > 0) { // the channels turn round: red goes green, green blue, blue red
      for (let i = 0; i < data.length; i += 4) { const r = data[i]; data[i] = data[i + 1]; data[i + 1] = data[i + 2]; data[i + 2] = r; }
    }
    if (this.rewind < 0 && this.enabled.rewind) { // remember the lit frame for the rewind
      if (this.ring.length < RING) this.ring.push(new Uint8ClampedArray(data));
      else { this.ring[this.head].set(data); this.head = (this.head + 1) % RING; }
    }
    this.note(doFlash, inv, doBeam, doSpot, doLeak, doVig, !!prev, this.gel.a * lit > 0.03);
  }

  // A sheet to draw on, kept by name: a canvas no one sees.
  sheet(name, S) {
    const had = this.sheets[name];
    if (had?.canvas.width === S) return had;
    const g = new OffscreenCanvas(S, S).getContext('2d');
    g.imageSmoothingEnabled = false;
    return (this.sheets[name] = g);
  }

  // The same light, for a picture too big to go through pixel by pixel (what TouchDesigner made, at the size of the
  // canvas): drawn over it on the canvas, by the graphics card, nothing read back. Last of all, on `ctx`.
  over(ctx, src, S, ink = 1) {
    if (this.mode !== 'canvas') { this.mode = 'canvas'; this.ring = []; this.head = 0; this.held = null; this.past = false; }
    const u = S / 125, c = S / 2, lit = clamp(ink / 0.25), wash = (colour) => { ctx.fillStyle = colour; ctx.fillRect(0, 0, S, S); };
    const mode = (m) => { ctx.globalCompositeOperation = m; };
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    let pic = src;
    if (this.rewind >= 0) { // the history ring played back from the newest frame
      const k = this.rewind++;
      pic = this.ring[(this.head - 1 - k + RING * 2) % RING]?.canvas ?? src;
      if (this.rewind >= RING) this.rewind = -1;
    } else if (this.freeze > 0) { // a held frame
      if (!this.held) { this.held = this.sheet('held', S); this.held.drawImage(src, 0, 0, S, S); }
      pic = this.held.canvas;
    } else this.held = null;
    const zoom = 1 + 0.07 * this.punch + 0.14 * this.vertigo, at = c - c * zoom, size = S * zoom;
    if (this.mosaic > 0) { // big pixels for a frame or two
      const m = this.sheet('mosaic', 40);
      m.drawImage(pic, 0, 0, 40, 40);
      ctx.drawImage(m.canvas, at, at, size, size);
    } else if (this.split > 0.05) { // red one way, blue the other
      const dx = Math.max(1, Math.round(this.split * 3 * u)), w = this.sheet('work', S);
      wash('#000');
      mode('lighter');
      for (const [shift, colour] of [[dx, '#f00'], [0, '#0f0'], [-dx, '#00f']]) {
        w.globalCompositeOperation = 'source-over';
        w.drawImage(pic, at + shift, at, size, size);
        w.globalCompositeOperation = 'multiply';
        w.fillStyle = colour;
        w.fillRect(0, 0, S, S);
        ctx.drawImage(w.canvas, 0, 0);
      }
      mode('source-over');
    } else ctx.drawImage(pic, at, at, size, size);
    if (this.freeze > 0 && this.rewind < 0) { // lit blue
      mode('multiply');
      wash('rgb(140, 191, 217)');
      mode('lighter');
      wash('rgb(0, 0, 40)');
      mode('source-over');
    }
    const flash = Math.min(1, this.flash), inv = this.invert > 0, vig = this.vig * lit, beam = this.beam, spot = this.spot, leak = this.leak;
    const ba = beam.a * lit, sa = spot.a * lit, la = leak.a * lit, ta = 0.4 * this.trails;
    const doBeam = ba > 0.08, doSpot = sa > 0.08, doLeak = la > 0.05, doVig = vig > 0.02, doFlash = flash > 0.02, doGel = this.gel.a * lit > 0.03;
    if (doBeam) {
      const x = beam.x * S, w = 0.06 * S, g = ctx.createLinearGradient(x - w, 0, x + w, 0), a = 0.55 * ba;
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - w, 0, 2 * w, S);
    }
    if (doSpot) {
      const x = spot.x * S, y = spot.y * S, r = spot.r * S, g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.6 * sa})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      wash(g);
    }
    if (doLeak) { // warm, added on
      const x = leak.x * S, y = leak.y * S, r = 0.45 * S, g = ctx.createRadialGradient(x, y, 0, x, y, r);
      for (const d of [0, 0.25, 0.5, 0.75, 1]) {
        const k = la * (1 - d) ** 2;
        g.addColorStop(d, `rgb(${140 * k}, ${70 * k}, ${15 * k})`);
      }
      mode('lighter');
      wash(g);
      mode('source-over');
    }
    if (doVig) {
      const g = ctx.createRadialGradient(c, c, 0.3 * S, c, c, 0.7 * S), dark = Math.round(255 * (1 - 0.7 * vig));
      g.addColorStop(0, '#fff');
      g.addColorStop(1, `rgb(${dark}, ${dark}, ${dark})`);
      mode('multiply');
      wash(g);
      mode('source-over');
    }
    const trail = ta > 0.008 && this.past; // the afterimages are of the lit picture, never of a flash, a negative or static
    if (trail) {
      ctx.globalAlpha = ta;
      ctx.drawImage(this.sheet('past', S).canvas, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (ta > 0.008) { this.sheet('past', S).drawImage(ctx.canvas, 0, 0); this.past = true; } else this.past = false;
    if (inv) {
      mode('difference');
      wash('#fff');
      mode('source-over');
    }
    if (doFlash) wash(`rgba(255,255,255,${flash})`);
    if (this.noise > 0) { // static, right after a drop
      const n = this.sheet('noise', 125), px = n.createImageData(125, 125), d = px.data;
      for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = Math.random() * 255; d[i + 3] = Math.random() < 0.26 ? 255 : 0; }
      n.putImageData(px, 0, 0);
      ctx.drawImage(n.canvas, 0, 0, S, S);
    }
    if (this.roll >= 0) { // a bright line rolling down, off a hat
      const h = Math.round(2 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(0, Math.min(S - h, Math.floor(this.roll * S)), S, h);
    }
    if (doGel) { // one colour kept, the others held down
      const a = this.gel.a * lit;
      mode('multiply');
      wash(`rgb(${GELS[this.gel.c].map((k) => Math.round(255 * (1 - a * (1 - k)))).join(', ')})`);
      mode('source-over');
    }
    if (this.swap > 0) { // the colours turn round
      const w = this.sheet('work', S);
      w.globalCompositeOperation = 'source-over';
      w.drawImage(ctx.canvas, 0, 0);
      ctx.filter = 'hue-rotate(120deg)';
      ctx.drawImage(w.canvas, 0, 0);
      ctx.filter = 'none';
    }
    if (this.rewind < 0 && this.enabled.rewind) { // remember the lit frame for the rewind, at half the size
      if (this.ring.length < RING) { const g = new OffscreenCanvas(S / 2, S / 2).getContext('2d'); this.ring.push(g); }
      const g = this.ring[this.ring.length < RING ? this.ring.length - 1 : this.head];
      g.drawImage(ctx.canvas, 0, 0, S / 2, S / 2);
      if (this.ring.length === RING) this.head = (this.head + 1) % RING;
    }
    ctx.restore();
    this.note(doFlash, inv, doBeam, doSpot, doLeak, doVig, !!trail, doGel);
  }

  // the effects at work, for the toolbar
  note(flash, inv, beam, spot, leak, vig, trails, gel) {
    this.active = [flash && 'flash', this.strobe > 0 && 'strobe', inv && 'invert', this.punch > 0.02 && 'punch', this.split > 0.05 && 'split', this.mosaic > 0 && 'mosaic',
      beam && 'beam', spot && 'spot', leak && 'leak', vig && 'vignette', this.roll >= 0 && 'roll', trails && 'trails', this.noise > 0 && 'noise',
      this.swap > 0 && 'swap', this.freeze > 0 && 'freeze', this.rewind >= 0 && 'rewind', gel && 'gel', this.vertigo > 0.03 && 'vertigo'].filter(Boolean);
  }
}
