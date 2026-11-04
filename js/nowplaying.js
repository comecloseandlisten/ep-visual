// What the computer is playing, Spotify mostly. The server watches the system's media sessions and sends a
// `track` event when the track or its state changes, then another with `hints` once the track is described
// (genre tags, tempo, key, a mood, what it is about). This shows the track, hands the hints to the listener, the
// mood and the meaning (meaning.js), and can make the page listen to the computer's own output.
import { setMeaning } from './meaning.js';

const NOTE_INDEX = { C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3, E: 4, F: 5, 'F#': 6, GB: 6, G: 7, 'G#': 8, AB: 8, A: 9, 'A#': 10, BB: 10, B: 11 };
// inputs that carry the computer's own output: Windows' Stereo Mix, virtual cables, PulseAudio monitors
export const LOOPBACK = /stereo mix|loopback|what u hear|cable output|voicemeeter|blackhole|soundflower|monitor of/i;
const MOOD_W = 0.4; // how far the track's mood pulls the page's own reading while it plays
const DESCRIBE_WAIT = 6; // seconds a new track's picture waits for its description

// 'F minor', 'Gm', 'A# major', 'Db' -> { root, mode, name }
export function parseKey(text) {
  const m = /^([A-Ga-g][#b]?)\s*(maj|min|major|minor|m)?\s*$/.exec((text || '').trim());
  if (!m) return null;
  const root = NOTE_INDEX[m[1].toUpperCase()];
  if (root === undefined) return null;
  const mode = /^(min|minor|m)$/.test(m[2] || '') ? 'min' : 'maj';
  return { root, mode, name: `${m[1][0].toUpperCase()}${m[1].slice(1)} ${mode.toUpperCase()}` };
}

export class NowPlaying {
  // ctx: { listener, mood, status(text), audioInputs(), startLineIn(deviceId), useLineStream(stream, label),
  //        newTrack(event), timeline(startAt or null), newPicture(), $ }
  constructor(ctx) {
    this.ctx = ctx;
    this.track = null;
    this.waiting = null; // a new track's id while its picture waits for the description
    this.el = { box: ctx.$('#track'), name: ctx.$('#trackName'), meta: ctx.$('#trackMeta'), btn: ctx.$('#sysBtn') };
  }

  // A new track starts its groove over at once, and gets its picture once it is described (what it is about picks
  // the worlds), or after DESCRIBE_WAIT seconds without one; a new reading of the same track (the agent's) gets a
  // new picture too.
  onEvent(ev) {
    if (ev.type !== 'track') return;
    const prevId = this.track?.id, went = prevId === ev.id && this.playing; // (a resumed track keeps its picture)
    this.track = ev;
    const changed = this.apply();
    this.render();
    const fresh = ev.id && ev.id !== prevId && ev.status === 'playing';
    if (fresh) {
      this.ctx.listener.retune();
      this.ctx.newTrack(ev);
    }
    // the track's own clock, for its beat grid; a seek comes as an event of the same track with a new start
    this.ctx.timeline?.(this.playing && ev.start_at ? ev.start_at : null);
    if (fresh && !ev.hints) {
      this.waiting = ev.id;
      clearTimeout(this.waitT);
      this.waitT = setTimeout(() => { if (this.waiting === ev.id) { this.waiting = null; this.ctx.newPicture(); } }, DESCRIBE_WAIT * 1000);
    } else if (fresh || (this.playing && (this.waiting === ev.id || (changed && went)))) {
      this.waiting = null;
      clearTimeout(this.waitT);
      this.ctx.newPicture();
    }
  }

  get playing() {
    return this.track?.status === 'playing';
  }

  // the hints only count while the track plays: pads played over a paused Spotify are their own thing. Returns
  // whether what the track is about changed.
  apply() {
    const h = this.playing ? this.track.hints : null;
    this.ctx.listener.hint = h ? { bpm: h.bpm || 0, key: parseKey(h.key) } : null;
    this.ctx.mood.hint = h && (h.valence != null || h.arousal != null) ? { v: h.valence, a: h.arousal, w: MOOD_W } : null;
    return setMeaning(h?.themes || null);
  }

  // the tempo as counted (the listener unfolds its 80-160 beat grid by the track's known tempo when they agree)
  bpmText(f) {
    return f.tempo ? `${Math.round(f.tempo)}` : '';
  }

  // the track's name for a saved picture and the label
  get title() {
    const t = this.track;
    return t?.id ? `${t.artist} — ${t.title}` : '';
  }

  get fileTag() {
    const t = this.track;
    return t?.id ? `_${`${t.artist}_${t.title}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 48)}` : '';
  }

  render() {
    const { box, name, meta } = this.el, t = this.track;
    if (!box) return;
    if (!t || t.status === 'none') {
      box.hidden = false;
      name.textContent = 'nothing playing';
      meta.textContent = t?.app ? `${t.app} is open` : 'open spotify and play something';
      return;
    }
    const mark = t.status === 'playing' ? '▶' : t.status === 'paused' ? '❚❚' : '■';
    box.hidden = false;
    name.textContent = `${mark} ${t.artist} — ${t.title}`;
    const h = t.hints, parts = [];
    if (h) {
      if (h.bpm) parts.push(`${Math.round(h.bpm)} bpm`);
      if (h.key) parts.push(h.key.toLowerCase());
      if (h.tags?.length) parts.push(h.tags.slice(0, 4).join(', ').toLowerCase());
      if (h.valence != null || h.arousal != null) parts.push(`v ${h.valence ?? '–'} a ${h.arousal ?? '–'}`);
      const themes = Object.keys(h.themes || {});
      if (themes.length) parts.push(`${h.themes_by === 'agent' ? 'felt' : 'about'}: ${themes.join(' + ')}`);
      if (!parts.length) parts.push(h.warnings?.length ? 'no description (offline?)' : 'no description');
    } else parts.push('describing…');
    if (t.app && t.app !== 'spotify') parts.unshift(t.app);
    meta.textContent = parts.join(' · ');
    const tip = [];
    if (h?.why?.length) tip.push(`mood from: ${h.why.join(', ')}`);
    if (h?.feel_note) tip.push(`felt: ${h.feel_note}`);
    else if (h?.theme_why && Object.keys(h.theme_why).length) tip.push(`about, from: ${Object.entries(h.theme_why).map(([k, w]) => `${k} (${w.join(', ')})`).join('; ')}`);
    meta.title = tip.join('\n');
  }

  // The server's loopback of the computer's output (/api/loopback, 16-bit PCM in 20 ms blocks) played into a
  // stream node, which then is the line in. No permission, no dialog; the audio context still needs a click
  // in browsers that keep it suspended, and blocks are dropped until it runs. When the stream breaks (the server
  // restarted, the connection dropped) it is fetched again, the line in staying as it is, until the page stops
  // listening.
  async feedServerLoopback() {
    const { ctx } = this, actx = ctx.actx;
    const ctrl = new AbortController();
    const open = async () => {
      let res;
      try {
        res = await fetch('/api/loopback', { signal: ctrl.signal });
      } catch {
        return null;
      }
      if (res.ok && res.body) return res;
      let why = '';
      try { why = (await res.json()).error || ''; } catch { /* not json */ }
      ctx.status(`no system audio from the server · ${why || res.status}`);
      return null;
    };
    let res = await open();
    if (!res) return null;
    const rate = Number(res.headers.get('X-Sample-Rate')) || 48000, ch = Number(res.headers.get('X-Channels')) || 2;
    const source = decodeURIComponent(res.headers.get('X-Source') || ''), label = `system audio · ${source || 'server'}`;
    const dest = actx.createMediaStreamDestination();
    // the loopback carries the system volume, often -30 dBFS or less: a slow makeup gain brings it to about
    // -16 dBFS, where the onset detector and the mood were calibrated (the gain slider still applies on top)
    const agc = actx.createGain();
    agc.connect(dest);
    let next = 0, rmsAvg = 0, lead = 0.06;
    // `lag`: how long after the server captured it the page hears the sound (the block, then the lead it is played
    // with), which the track's beat grid needs to know where the player's clock is
    this.feed = { agc, get gain() { return agc.gain.value; }, get lag() { return lead + 0.025; } };
    const play = async (reader) => {
      let pending = new Uint8Array(0);
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        let bytes = value;
        if (pending.length) { bytes = new Uint8Array(pending.length + value.length); bytes.set(pending); bytes.set(value, pending.length); }
        const frameBytes = 2 * ch, frames = Math.floor(bytes.length / frameBytes);
        pending = bytes.slice(frames * frameBytes);
        if (!frames || actx.state !== 'running') continue;
        const now = actx.currentTime;
        // the server's sound card and this page's run on clocks of their own, and every hiccup primes the lead
        // anew: a block that would land more than 0.15 s late is dropped rather than letting the picture fall
        // further and further behind the music
        if (next > now + 0.15) continue;
        const view = new DataView(bytes.buffer, bytes.byteOffset, frames * frameBytes);
        const buf = actx.createBuffer(ch, frames, rate);
        let sq = 0;
        for (let c = 0; c < ch; c++) {
          const out = buf.getChannelData(c);
          for (let i = 0; i < frames; i++) { const v = view.getInt16((i * ch + c) * 2, true) / 32768; out[i] = v; sq += v * v; }
        }
        const rms = Math.sqrt(sq / (frames * ch));
        if (rms > 1e-4) {
          rmsAvg += (rms - rmsAvg) * Math.min(1, frames / rate / 1.5);
          agc.gain.setTargetAtTime(Math.min(12, Math.max(1, 0.16 / Math.max(rmsAvg, 1e-3))), now, 0.5);
        }
        const src = actx.createBufferSource();
        src.buffer = buf;
        src.connect(agc);
        if (next < now + 0.01) next = now + 0.06; // (re)prime with a small lead against network jitter
        lead += (next - now - lead) * 0.05;
        src.start(next);
        next += frames / rate;
      }
    };
    (async () => {
      try {
        for (let wait = 0.5; !ctrl.signal.aborted;) {
          if (res) {
            wait = 0.5;
            try { await play(res.body.getReader()); } catch { /* broken or aborted */ }
            res = null;
            if (ctrl.signal.aborted) break;
            ctx.status(`${label} · lost, reconnecting`);
          }
          await new Promise((ok) => setTimeout(ok, wait * 1000));
          wait = Math.min(5, wait * 2);
          if (ctrl.signal.aborted) break;
          res = await open();
          if (res) ctx.status(`line in · ${label}`);
        }
      } finally {
        dest.stream.getTracks().forEach((t) => t.stop());
      }
    })();
    await ctx.useLineStream(dest.stream, label, () => ctrl.abort());
    return 'server';
  }

  // Listen to the computer's output: the server's own loopback first; else a loopback input (Stereo Mix, a
  // virtual cable), which is just another line in; else Chrome and Edge can share the system audio along with
  // the screen (video dropped at once). Sharing needs a click, so on an automatic start (`auto`,
  // ?listen=spotify) the page asks for one instead.
  async listen({ auto = false } = {}) {
    const { ctx } = this;
    if (await this.feedServerLoopback()) {
      this.el.btn?.classList.add('on');
      return 'server';
    }
    let devices = [];
    try {
      devices = await ctx.audioInputs();
      if (!devices.some((d) => d.label)) { // labels need the microphone permission once
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        probe.getTracks().forEach((t) => t.stop());
        devices = await ctx.audioInputs();
      }
    } catch (err) {
      ctx.status(err.name === 'NotAllowedError' ? 'microphone blocked · allow it, or share system audio' : `inputs · ${err.name}`);
    }
    const dev = devices.find((d) => LOOPBACK.test(d.label));
    if (dev) {
      await ctx.startLineIn(dev.deviceId);
      this.el.btn?.classList.add('on');
      return 'loopback';
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      ctx.status('no loopback input · enable stereo mix, or open this page in chrome to share system audio');
      return null;
    }
    if (auto) {
      ctx.status('no stereo mix input · press spotify, pick the entire screen and tick "share system audio"');
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        systemAudio: 'include', selfBrowserSurface: 'exclude', preferCurrentTab: false,
      });
      stream.getVideoTracks().forEach((t) => t.stop());
      if (!stream.getAudioTracks().length) {
        stream.getTracks().forEach((t) => t.stop());
        ctx.status('no audio shared · pick the entire screen and tick "share system audio"');
        return null;
      }
      await ctx.useLineStream(stream, 'system audio');
      this.el.btn?.classList.add('on');
      return 'share';
    } catch (err) {
      ctx.status(err.name === 'NotAllowedError' ? 'sharing cancelled · spotify needs stereo mix or system audio sharing' : `system audio · ${err.name}`);
      return null;
    }
  }
}
