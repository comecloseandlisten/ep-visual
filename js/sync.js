// The picture as the room hears it. The page hears the music a moment after the room does (the server's loopback
// plays it with a lead against network jitter; an input has a latency of its own), and what it draws reaches the
// screen a frame or two after that. The beat is a clock, so it can be read that far ahead: the worlds, the light and
// the cuts get the beat and the squares where the room is now, not where the page heard them. Hits and drops can't be
// foreseen and stay as heard (a hit carries the beat it was heard on, `at`).
// The beat told is the squares' clock when there is one: it runs on a tempo and a phase that take many beats to move, so
// its beats are even (a few milliseconds apart at most on a measured track) where the tracker's own phase leans and slides.
// The scene draws on every other step or so, and a beat or an onset lasts one step: they are held here until a scene
// frame takes them, so the worlds miss none.

const STEPS = 16, KINDS = ['kick', 'snare', 'hat', 'perc'], SURE = 0.6, LEARN = 0.25;
const slot = (n) => ((n % STEPS) + STEPS) % STEPS;

// A hit can't be read ahead like the beat, but what a groove keeps doing can be told before it is heard: the sixteen steps
// of a bar remember how surely a hit falls on them, how hard and of what kind, and a step that nearly always has one gets
// it on time, the picture's time, a tenth of a second before the page's ear hears it. The real hit then adds nothing, it
// only keeps the memory. What the groove has not done before (a fill, a change) is heard as it comes, late as ever. A told
// hit that didn't come means the groove has stopped being itself, and nothing more is told for two beats.
export class Foresee {
  constructor() { this.reset(); }

  reset() {
    this.keeps = new Float32Array(STEPS);
    this.power = new Float32Array(STEPS);
    this.kinds = Array.from({ length: STEPS }, () => ({}));
    this.got = new Float64Array(STEPS).fill(-1);
    this.told = new Float64Array(STEPS).fill(-1);
    this.seen = this.settled = null;
    this.calm = -Infinity;
  }

  // a hit heard at beat `x` of the squares' clock; true if it was told already, on this step or the one next to it.
  // (Tones are the tune's, not the groove's.)
  heard(kind, x, strength) {
    if (!KINDS.includes(kind) || x === null) return false;
    const n = Math.round(x * 4), s = slot(n), k = this.kinds[s];
    this.got[s] = n;
    this.power[s] += (strength - this.power[s]) * 0.3;
    for (const name of KINDS) k[name] = (k[name] || 0) * 0.8 + (name === kind ? 0.2 : 0);
    return this.told[s] === n || this.told[slot(n - 1)] === n - 1 || this.told[slot(n + 1)] === n + 1;
  }

  // a step the ear has passed goes into the memory
  settle(n) {
    const s = slot(n), near = this.got[slot(n - 1)] === n - 1 || this.got[slot(n + 1)] === n + 1;
    this.keeps[s] += ((this.got[s] === n ? 1 : 0) - this.keeps[s]) * LEARN;
    if (this.told[s] === n && this.got[s] !== n && !near) this.calm = (n + 8) / 4;
  }

  // Every frame: `heard`, `seen`: the squares' clock as heard and as the picture stands; `sure`: the groove is itself.
  // Returns the hit due on this step, if one is
  due(heard, seen, sure) {
    const h = Math.floor(heard * 4) - 1; // (a step behind the ear, so that a late hit still counts)
    if (this.settled !== null && h > this.settled && h - this.settled <= STEPS) for (let n = this.settled + 1; n <= h; n++) this.settle(n);
    this.settled = h;
    const n = Math.floor(seen * 4), s = slot(n), past = this.seen;
    this.seen = n;
    if (past === null || n <= past || n - past > 2 || !sure || seen < this.calm || this.keeps[s] < SURE) return null;
    this.told[s] = n;
    const k = this.kinds[s];
    return { kind: KINDS.reduce((a, b) => ((k[b] || 0) > (k[a] || 0) ? b : a)), strength: this.power[s] };
  }
}

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
    const x = (g?.square ? g.square.x : b.count + b.phase) + a / b.T, n = Math.floor(x);
    const tick = this.n !== null && n === this.n + 1;
    if (this.n === null || n > this.n || n < this.n - 1) this.n = n;
    // told when the last seconds stand on a beat, or the beat is clear and nothing says the drums are out
    const on = tick && (b.conf > 0.08 || (b.clear > 0.3 && g && g.state !== 'pit' && g.state !== 'break'));
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
