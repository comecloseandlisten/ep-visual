// Clips: the canvas as it is shown (TouchDesigner's effects too, while TD FX is on) with what the page hears (pads,
// the line in, Spotify through the loopback), recorded in the browser and handed to the server, which keeps them in
// <library>/visuals. REC on the panel records until pressed again; the MCP tool record_visual sends a `record`
// event, and the first page to claim it records that many seconds.

const MIMES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

export class Recorder {
  // ctx: { $, actx, bus (the node everything heard goes through), canvas, status(text) }
  constructor(ctx) {
    this.ctx = ctx;
    this.rec = null;
    this.btn = ctx.$('#recBtn');
    this.btn?.addEventListener('click', () => (this.rec ? this.stop() : this.start({ id: `manual-${Date.now()}` })));
  }

  get supported() {
    return typeof MediaRecorder !== 'undefined' && !!this.ctx.canvas.captureStream;
  }

  // a `record` event from the server: record if this page is the first to claim it
  async onEvent(ev) {
    if (ev.type !== 'record' || this.rec || !this.supported) return;
    const res = await fetch(`/api/record/claim?id=${encodeURIComponent(ev.id)}`, { method: 'POST' }).catch(() => null);
    if (res?.ok) this.start({ id: ev.id, seconds: ev.seconds });
  }

  start({ id, seconds = 0 }) {
    if (!this.supported) { this.ctx.status('recording needs MediaRecorder (Chrome, Edge, Firefox)'); return; }
    const { actx, bus, canvas } = this.ctx;
    const dest = actx.createMediaStreamDestination();
    bus.connect(dest);
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mimeType = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const mr = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8e6, audioBitsPerSecond: 192e3 });
    const chunks = [];
    const rec = { id, mr, dest, chunks, at: performance.now(), timer: null, tick: null };
    this.rec = rec;
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => this.upload(rec);
    mr.start(1000);
    if (seconds > 0) rec.timer = setTimeout(() => this.stop(), seconds * 1000);
    rec.tick = setInterval(() => this.render(), 500);
    this.render();
  }

  stop() {
    const rec = this.rec;
    if (!rec) return;
    clearTimeout(rec.timer);
    clearInterval(rec.tick);
    rec.mr.stop();
    rec.mr.stream.getTracks().forEach((t) => t.stop());
    try { this.ctx.bus.disconnect(rec.dest); } catch { /* already gone */ }
  }

  async upload(rec) {
    this.rec = null;
    this.render();
    const blob = new Blob(rec.chunks, { type: rec.mr.mimeType || 'video/webm' });
    this.ctx.status(`saving clip · ${(blob.size / 1e6).toFixed(1)} MB`);
    try {
      const res = await fetch(`/api/record/upload?id=${encodeURIComponent(rec.id)}&ext=webm`, { method: 'POST', body: blob });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || res.status);
      this.ctx.status(`clip saved · ${out.path}`);
    } catch {
      // no server to keep it: hand the clip to the browser as a download
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `ep-visual_${Date.now()}.webm` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      this.ctx.status('clip downloaded');
    }
  }

  render() {
    if (!this.btn) return;
    const on = !!this.rec;
    this.btn.classList.toggle('accent', on);
    this.btn.textContent = on ? `stop · ${Math.round((performance.now() - this.rec.at) / 1000)}s` : 'rec';
  }
}
