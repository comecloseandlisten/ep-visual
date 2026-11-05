// TouchDesigner. When the server's bridge is on (a `td` event, see touch.py) the page sends what it hears and shows
// over a WebSocket, ~30 times a second, and the server passes it on as OSC: numbers for an OSC In CHOP, events with
// text for an OSC In DAT. Its pixel grid goes the same way (td.html shows it in a Web Render TOP), TouchDesigner
// lays its effects over it (tdfx.py), and the result comes back: with TD FX on, the canvas shows TouchDesigner's
// output instead of its own. Only the newest page is passed on; the server tells the others to stand by. What
// TouchDesigner sends back arrives as `control` events and is applied here like a click on the panel. The world's
// own knobs (knobs.js) arrive as `knobs` events, from the server's Director, td_world or TouchDesigner, and count
// only while the bridge is on.
// ?view=canvas shows the picture alone, edge to edge.

import { DEFS, recipeGeo } from './mixer.js';
import { KNOBS } from './knobs.js';

const KINDS = ['kick', 'snare', 'hat', 'perc', 'bass', 'keys', 'pad', 'loop', 'fx'];
const RATE = 30;
const HIT_TAU = 0.15; // s, how fast a hit's envelope decays
const SECTION_TAU = 1;
const r4 = (x) => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : 0);
const flag = (x) => (typeof x === 'string' ? /^(1|on|true|yes)$/i.test(x) : !!x);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a value that jumps up and decays from there, read at any moment
class Env {
  constructor(tau) { this.tau = tau; this.v = 0; this.t = 0; }
  at(now) { return this.v * Math.exp(-(now - this.t) / this.tau); }
  hit(x, now) { this.v = Math.max(this.at(now), x); this.t = now; }
}

// whether a scene shows geometric worlds only (mixer.js `geo`): a mix by its recipe, a classic style as its world
const sceneGeo = (sc) => (sc.s?.recipe ? recipeGeo(sc.s.recipe) : !!DEFS[sc.name]?.geo);

export class Touch {
  // ctx: { $, st, mood, light, knobs, styles, trigger(i, velocity), onSection(kind), next() }
  constructor(ctx) {
    this.ctx = ctx;
    this.keys = Object.keys(ctx.styles);
    this.ws = null;
    this.on = false;
    this.role = ''; // 'speak' while this page is the one passed on, 'standby' while a newer one is
    this.addr = '';
    this.hits = Object.fromEntries(['', ...KINDS].map((k) => [k, new Env(HIT_TAU)]));
    this.sections = { change: new Env(SECTION_TAU), drop: new Env(SECTION_TAU) };
    this.queue = [];
    this.sent = {}; // the mood, scene and key last sent as events
    this.last = 0;
    this.el = ctx.$('#tdInfo');
    this.btn = ctx.$('#tdBtn');
    const canvasOnly = new URLSearchParams(location.search).get('view') === 'canvas';
    if (canvasOnly) document.body.classList.add('canvas-only');
    // TouchDesigner's output on the canvas: on by default, except in the canvas view, which TouchDesigner itself
    // may be showing (its output in its input would loop)
    this.view = !canvasOnly;
    this.bmp = null;
    this.bmpAt = 0;
    this.seq = 0;
    this.sentAt = new Float64Array(256);
    this.tripSeq = -1;
    this.lag = 0; // seconds the way round through TouchDesigner takes
    this.detail = 0; // how noisy the world on the canvas is (look())
    this.motion = 0;
    this.looks = 0;
    this.seen = null;
    this.kickAt = -1;
    this.tdError = '';
    this.pulling = false;
    this.btn?.classList.toggle('on', this.view);
    this.btn?.addEventListener('click', () => {
      this.view = !this.view;
      this.btn.classList.toggle('on', this.view);
      this.pull();
      this.render();
    });
  }

  onEvent(ev) {
    if (ev.type === 'td') {
      this.on = !!ev.on;
      if (ev.values) this.addr = ev.values;
      if (this.on) this.connect();
      else this.ws?.close();
      this.knobs();
      this.pull();
      this.render();
    } else if (ev.type === 'control') this.control(ev.cmd, ev.args || []);
    else if (ev.type === 'knobs') { // kept, in case it comes before the bridge's own event (a page opened later)
      this.knobVals = ev.values || {};
      this.knobs();
      this.render();
    }
  }

  knobs() {
    const kn = this.ctx.knobs;
    if (!kn) return;
    if (this.on) kn.set(this.knobVals || {});
    else kn.reset();
  }

  connect() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/td`);
    this.ws = ws;
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (!m.role) return;
      this.role = m.role;
      if (m.values) this.addr = m.values;
      if (m.role === 'speak') this.sent = {}; // TouchDesigner gets the mood, scene and key afresh
      this.render();
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.role = '';
      this.render();
      if (this.on) setTimeout(() => this.on && this.connect(), 2000);
    };
  }

  get speaking() {
    return this.role === 'speak' && this.ws?.readyState === WebSocket.OPEN;
  }

  render() {
    if (this.btn) this.btn.hidden = !this.on;
    if (!this.el) return;
    this.el.hidden = !this.on;
    const fx = !this.view ? '' : this.tdError ? ` · fx: ${this.tdError}`
      : this.showing ? ` · showing its fx${this.via === 'stream' ? ' (stream)' : ''}` : '';
    // the knobs off neutral, as last set
    const kn = this.ctx.knobs, set = kn ? Object.entries(kn.want).filter(([k, x]) => Math.abs(x - KNOBS[k][0]) > 1e-3) : [];
    const world = set.length ? ` · world: ${set.map(([k, x]) => `${k} ${+x.toFixed(2)}`).join(' ')}` : '';
    this.el.textContent = !this.on ? '' : this.role === 'speak' ? `touchdesigner · osc → ${this.addr}${fx}${world}`
      : this.role === 'standby' ? 'touchdesigner · standby, a newer page sends' : 'touchdesigner · connecting';
  }

  get showing() {
    return this.view && this.bmp && performance.now() - this.bmpAt < 1000;
  }

  // the pixel grid as drawn this frame, alpha 0 where the paper is bare, so td.html can lay it on its own paper
  // How much is going on in the world on the canvas, for the Director to go by when it lays things over it, every few
  // frames: the share of neighbouring cells that differ (a world's load in tools/profile_scenes.mjs) and of the cells that
  // changed, both over about a second.
  look(buf, N) {
    if (!this.speaking || ++this.looks % 4) return;
    const seen = this.seen?.length === buf.length ? this.seen : null;
    let cells = 0, edges = 0, moved = 0;
    for (let y = 0; y < N - 1; y += 2)
      for (let x = 0, i = y * N; x < N - 1; x += 2, i += 2) {
        cells++;
        if (buf[i] !== buf[i + 1] || buf[i] !== buf[i + N]) edges++;
        if (seen && buf[i] !== seen[i]) moved++;
      }
    this.seen = seen || new Uint8Array(buf.length);
    this.seen.set(buf);
    this.detail += (edges / cells - this.detail) * 0.12;
    this.motion += (moved / cells - this.motion) * 0.12;
  }

  sendFrame(N, data, vis) {
    if (!this.speaking || this.ws.bufferedAmount > 1 << 18) return;
    const buf = new ArrayBuffer(4 + N * N * 4), head = new DataView(buf);
    this.seq = (this.seq + 1) & 0xffff; // TouchDesigner gives it back with what it made of this frame (trip())
    this.sentAt[this.seq & 255] = performance.now();
    head.setUint16(0, N, true);
    head.setUint16(2, this.seq, true);
    const px = new Uint8Array(buf, 4);
    px.set(data);
    for (let i = 0; i < N * N; i++) if (!vis[i]) px[i * 4 + 3] = 0;
    this.ws.send(buf);
  }

  show(bmp, via) {
    const was = this.showing && !this.tdError && this.via === via;
    this.bmp?.close?.();
    this.bmp = bmp;
    this.bmpAt = performance.now();
    this.via = via;
    if (via === 'stream') this.streamAt = this.bmpAt;
    this.tdError = '';
    if (!was) this.render();
  }

  // TouchDesigner's output as it pushes it, relayed by the server (/api/td/stream); a picture still being decoded
  // makes the next ones wait their turn, only the newest is kept
  stream() {
    if (this.sws && this.sws.readyState <= WebSocket.OPEN) return;
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/td/stream`);
    ws.binaryType = 'blob';
    this.sws = ws;
    let busy = false, next = null;
    const decode = async (blob) => {
      busy = true;
      try {
        const tail = blob.slice(-4).arrayBuffer();
        this.show(await createImageBitmap(blob), 'stream');
        this.trip(new DataView(await tail));
      } catch { /* a broken picture: skip it */ }
      busy = false;
      if (next) { const b = next; next = null; decode(b); }
    };
    ws.onmessage = (e) => {
      if (!(e.data instanceof Blob) || !this.view) return;
      if (busy) next = e.data;
      else decode(e.data);
    };
    ws.onclose = () => {
      if (this.sws !== ws) return;
      this.sws = null;
      if (this.on && this.view) setTimeout(() => this.on && this.view && this.stream(), 2000);
    };
  }

  // How long the way round takes: a picture from TouchDesigner ends in 'EP' and the number of the page's frame it was
  // made from. The picture on the canvas is that much behind what the page draws (sync.js reads the beat ahead by it).
  trip(tail) {
    if (tail.getUint16(0) !== 0x4550) return;
    const seq = tail.getUint16(2, true), at = this.sentAt[seq & 255];
    if (seq === this.tripSeq || !at) return; // (the same frame pushed again says nothing new)
    this.tripSeq = seq;
    const s = (performance.now() - at) / 1000;
    if (s < 1) this.lag = this.lag ? this.lag + (s - this.lag) * 0.1 : s;
  }

  // while TD FX is on: the stream, and fetching one frame after another (up to ~30 a second) only while the stream
  // brings nothing (an older network in TouchDesigner, or none at all)
  async pull() {
    if (this.pulling) return;
    this.pulling = true;
    this.stream();
    while (this.on && this.view) {
      const t0 = performance.now();
      if (t0 - (this.streamAt || 0) < 1000) {
        await sleep(250);
        continue;
      }
      try {
        const res = await fetch('/api/td/frame', { cache: 'no-store' });
        if (!res.ok) throw new Error('touchdesigner not answering');
        this.show(await createImageBitmap(await res.blob()), 'poll');
      } catch (e) {
        if (!this.tdError) { this.tdError = e.message || 'touchdesigner not answering'; this.render(); }
        await sleep(2000);
        continue;
      }
      await sleep(Math.max(0, 1000 / RATE - (performance.now() - t0)));
    }
    this.sws?.close();
    this.pulling = false;
    this.render();
  }

  // over the canvas: TouchDesigner's take on it, while one fresh enough has come back
  drawView(ctx, size) {
    if (this.showing) ctx.drawImage(this.bmp, 0, 0, size, size);
  }

  // a kick due on this beat, told with the beat, which is read ahead; the real one is heard later and adds nothing
  kick(strength) {
    if (!this.speaking) return;
    const now = performance.now() / 1000;
    this.hits[''].hit(strength, now);
    this.hits.kick?.hit(strength, now);
    this.kickAt = now;
  }

  // a new track: the Directors start reading its form afresh
  newTrack() {
    if (!this.speaking) return;
    this.sent.part = null;
    this.queue.push(['/newtrack']);
  }

  hit(kind, strength) {
    if (!this.speaking) return;
    const now = performance.now() / 1000;
    if (kind !== 'kick' || now - this.kickAt > 0.4) {
      this.hits[''].hit(strength, now);
      this.hits[kind]?.hit(strength, now);
    }
    this.queue.push(['/hit', kind, r4(strength)]);
  }

  // every step: beats and sections as they happen, everything else ~30 times a second
  frame(f, now) {
    if (!this.speaking) return;
    if (f.section) {
      this.sections[f.section]?.hit(1, now);
      this.queue.push(['/section', f.section]);
    }
    if (f.beat.on) this.queue.push(['/beat', f.beat.count, f.bpm]);
    const g = f.groove, line = g?.square?.line; // (a line goes out at once: the Director moves on it)
    if (line) this.queue.push(['/line', g.square.n, g.square.bars]);
    if (!line && now - this.last < 1 / RATE - 0.002) return;
    this.last = now;
    const { st, mood } = this.ctx, sc = st.cur, keyName = f.key ? f.key.name : 'none';
    const changed = (k, v) => this.sent[k] !== v && ((this.sent[k] = v), true);
    if (changed('mood', st.moodName || mood.name)) this.queue.push(['/mood', this.sent.mood]);
    if (changed('scene', sc.name)) this.queue.push(['/scene', sc.name, sc.def.title]);
    if (changed('key', keyName)) this.queue.push(['/key', keyName]);
    if (g && changed('part', g.state)) this.queue.push(['/part', g.state]);
    const msg = JSON.stringify({ v: this.values(f, now), e: this.queue.splice(0) });
    if (this.ws.bufferedAmount < 1 << 16) this.ws.send(msg); // a stalled socket drops frames rather than piling up
  }

  values(f, now) {
    const { st, mood } = this.ctx, b = f.beat, rel = f.rel || {}, sc = st.cur;
    const v = {
      level: f.level, low: f.low, mid: f.mid, high: f.high,
      bright: f.bright, flux: f.flux, busy: f.busy, tonal: f.tonalAvg, centroid: f.centroidHz,
      bpm: f.bpm, 'beat/phase': b.phase, 'beat/pulse': b.pulse, 'beat/count': b.count, 'beat/conf': b.conf,
      'bar/phase': ((b.count % 4) + b.phase) / 4,
      'section/change': this.sections.change.at(now), 'section/drop': this.sections.drop.at(now),
      'mood/valence': mood.v, 'mood/arousal': mood.a, 'mood/col': mood.col, 'mood/row': mood.row,
      'key/root': f.key ? f.key.root : -1, 'key/major': f.key?.mode === 'maj' ? 1 : 0,
      'scene/index': this.keys.indexOf(sc.name), 'scene/mix': st.prev ? st.mix : 1, 'scene/time': st.sceneTime,
      'scene/geo': sceneGeo(sc) && (!st.prev || sceneGeo(st.prev)) ? 1 : 0,
      'scene/detail': this.detail, 'scene/motion': this.motion, 'groove/budget': f.groove?.budget ?? 1,
      'groove/tension': f.groove?.tension ?? 0, 'groove/energy': f.groove?.energy ?? 0.5, 'groove/drive': f.groove?.drive ?? 0.5,
      'groove/lock': f.groove?.lock ?? 0, 'square/bar': f.groove?.square?.bar ?? 0, 'square/bars': f.groove?.square?.bars ?? 4,
      ink: st.ink, idle: st.idle ? 1 : 0, hit: this.hits[''].at(now),
    };
    for (const n of ['bass', 'mid', 'treb']) {
      v[`rel/${n}`] = rel[n];
      v[`drive/${n}`] = rel[`${n}Drive`];
      v[`clock/${n}`] = rel[`${n}Clock`];
    }
    for (const k of KINDS) v[`hit/${k}`] = this.hits[k].at(now);
    f.band10.forEach((x, i) => { v[`band/${i}`] = x; });
    const cmax = Math.max(...f.chroma) || 1; // relative: the strongest pitch class is 1
    f.chroma.forEach((x, i) => { v[`chroma/${i}`] = x / cmax; });
    (sc.view || sc.rgb).slice(0, 8).forEach((c, i) => {
      v[`palette/${i}/r`] = c[0] / 255;
      v[`palette/${i}/g`] = c[1] / 255;
      v[`palette/${i}/b`] = c[2] / 255;
    });
    for (const k in v) v[k] = r4(v[k]);
    return v;
  }

  control(cmd, args) {
    const { $, st, light, styles } = this.ctx, a = args[0];
    // a switch: /ep/hold 1 turns it on, /ep/hold 0 off, /ep/hold alone flips it
    const toggle = (sel, isOn) => {
      const want = a === undefined ? !isOn() : flag(a);
      if (want !== isOn()) $(sel)?.click();
    };
    switch (cmd) {
      case 'art': {
        const k = String(a ?? 'auto').toLowerCase();
        const key = k === 'auto' ? 'auto' : this.keys.find((x) => x.toLowerCase() === k) || this.keys.find((x) => styles[x].title.toLowerCase() === k);
        if (!key) break;
        const sel = $('#artSel');
        sel.value = key;
        sel.dispatchEvent(new Event('change'));
        break;
      }
      case 'seed': $('#seedBtn').click(); break;
      case 'clear': $('#clearBtn').click(); break;
      case 'next': this.ctx.next(); break;
      case 'drop': // TouchDesigner (and its Director) hear about it like a drop the page heard
        this.ctx.onSection('drop');
        this.sections.drop.hit(1, performance.now() / 1000);
        if (this.speaking) this.queue.push(['/section', 'drop']);
        break;
      case 'hold': toggle('#holdBtn', () => st.hold); break;
      case 'light': toggle('#lightBtn', () => light.on); break;
      case 'grid': toggle('#gapBtn', () => st.gap); break;
      case 'label': toggle('#labelBtn', () => st.label); break;
      case 'res': $(`.res[data-n="${Math.round(Number(a))}"]`)?.click(); break;
      case 'fade': {
        if (!Number.isFinite(Number(a))) break;
        const el = $('#fade');
        el.value = String(Number(a)); // the range input keeps it within 2..30
        el.dispatchEvent(new Event('input'));
        break;
      }
      case 'group': $(`.grp[data-g="${String(a).toUpperCase()}"]`)?.click(); break;
      case 'pad': {
        if (args[2] !== undefined) $(`.grp[data-g="${String(args[2]).toUpperCase()}"]`)?.click();
        const i = Math.round(Number(a)) - 1, vel = args[1] === undefined ? 1 : Math.min(1, Math.max(0, Number(args[1]) || 0));
        if (i >= 0 && i < 12) this.ctx.trigger(i, vel);
        break;
      }
      default: break;
    }
  }
}
