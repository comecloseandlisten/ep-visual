// The picture as the room hears it. The page hears the music a moment after the room does (the server's loopback
// plays it with a lead against network jitter; an input has a latency of its own), and what it draws reaches the
// screen a frame or two after that. The beat is a clock, so it can be read that far ahead: the worlds, the light and
// the cuts get the beat and the squares where the room is now, not where the page heard them. Hits and drops can't be
// foreseen and stay as heard (a hit carries the beat it was heard on, `at`).
// The scene draws on every other step or so, and a beat or an onset lasts one step: they are held here until a scene
// frame takes them, so the worlds miss none.

export class Sync {
  constructor() {
    this.n = null; // the last beat told
    this.sq = null; // the last square begun
    this.pulse = 0;
    this.held = { on: false, line: false, onset: null };
  }

  // `f`: the listener's frame with the groove on it; `a`: seconds the picture runs behind the room. Returns the frame
  // as seen, the listener's own left as it is (the groove and the mood go on hearing what the page heard)
  view(f, now, dt, a) {
    const b = f.beat, g = f.groove;
    this.pulse *= Math.exp(-dt / 0.15);
    if (f.onset && !(this.held.onset?.strength >= f.onset.strength)) this.held.onset = f.onset;
    if (!(f.bpm > 0) || !b.T) {
      this.n = this.sq = null;
      return { ...f, beat: { ...b, pulse: Math.max(b.pulse, this.pulse) } };
    }
    // the beat count runs on through a tick; one beat further is a beat, anything else (the bar lines moved onto the
    // squares, a jam starting over, a new tempo) is taken quietly. A step back by a hair (the phase pulled a little)
    // keeps the last one told, so it is not told twice
    const x = b.count + b.phase + a / b.T, n = Math.floor(x);
    const tick = this.n !== null && n === this.n + 1;
    if (this.n === null || n > this.n || n < this.n - 1) this.n = n;
    const on = tick && b.conf > 0.08;
    if (on) { this.pulse = 1; this.held.on = true; }
    const beat = { ...b, count: n, phase: x - n, tick, on, pulse: this.pulse };
    let square = g?.square || null;
    if (square) { // the same for the squares, on their own clock
      const L = square.len, xs = square.x + a / b.T, ns = Math.floor(xs / L), at = xs - ns * L;
      const line = this.sq !== null && ns === this.sq + 1;
      if (this.sq === null || ns > this.sq || ns < this.sq - 1) this.sq = ns;
      if (line) this.held.line = true;
      square = { ...square, x: xs, n: ns, beat: at, bar: Math.min(L / 4 - 1, Math.floor(at / 4)), line };
    } else this.sq = null;
    return { ...f, beat, groove: g && { ...g, square } };
  }

  // what a scene frame gets: the frame as seen, with the beat, the square's line and the strongest onset held since
  // the last scene frame
  take(v) {
    const h = this.held, out = { ...v, beat: { ...v.beat, on: v.beat.on || h.on }, onset: v.onset || h.onset };
    if (h.line && v.groove?.square) out.groove = { ...v.groove, square: { ...v.groove.square, line: true } };
    this.held = { on: false, line: false, onset: null };
    return out;
  }
}
