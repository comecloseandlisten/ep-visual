// The world's own knobs (knobs.py on the server): parameters inside the picture itself, not effects laid over it.
// Every world draws through the same frame, so they reach all of them at once: its clock (`speed`), what it hears
// (`react`), the unit it draws in (`size`, mixer worlds), its raster (a camera: `zoom`, `panx`, `pany`, `turn`;
// trails: `echo`) and its colours (`hue`, `sat`, `light`). The server's Director, the MCP tool td_world and
// TouchDesigner set them as `knobs` events; here they glide to what was set, between its steps.
import { clamp } from './pixels.js';

// name: [neutral, low, high], as knobs.KNOBS
export const KNOBS = {
  speed: [1, 0, 3], react: [1, 0, 2], size: [1, 0.6, 1.8], zoom: [1, 1, 4], panx: [0, -1, 1], pany: [0, -1, 1],
  turn: [0, -45, 45], echo: [0, 0, 0.95], hue: [0, -180, 180], sat: [1, 0, 2], light: [0, -0.5, 0.5],
};
const GLIDE = 0.3; // s
const neutral = () => Object.fromEntries(Object.entries(KNOBS).map(([k, [d]]) => [k, d]));
const BG = 0, DIM = 8;

export class Knobs {
  constructor() {
    this.want = neutral();
    this.v = neutral();
  }

  set(values) {
    for (const k in values) {
      const x = Number(values[k]);
      if (KNOBS[k] && Number.isFinite(x)) this.want[k] = clamp(x, KNOBS[k][1], KNOBS[k][2]);
    }
  }

  reset() { this.want = neutral(); }

  update(dt) {
    const a = 1 - Math.exp(-dt / GLIDE);
    for (const k in this.v) {
      this.v[k] += (this.want[k] - this.v[k]) * a;
      if (Math.abs(this.want[k] - this.v[k]) < 1e-4) this.v[k] = this.want[k];
    }
  }

  off(...names) { return names.some((k) => Math.abs(this.v[k] - KNOBS[k][0]) > 1e-3); }

  // what a scene's world gets to draw with this step: its own clock, what it hears, its unit, and `look`, which puts
  // the camera and the trails on its raster (a mix calls it before its screen treatment, else it comes after)
  frame(sc, base, dt, f, hits) {
    const v = this.v, wdt = Math.max(1e-4, Math.min(0.1, dt * v.speed));
    sc.t = (sc.t ?? base) + wdt;
    const [hf, hh] = hear(f, hits, v.react);
    sc.looked = false;
    const look = (r, dim) => { sc.looked = true; this.look(r, sc, dim); };
    return { t: sc.t, dt: wdt, f: hf, hits: hh, size: v.size, look };
  }

  look(r, store, dim) {
    const v = this.v;
    if (v.echo > 1e-3) echo(r, store, v.echo, dim);
    else store.echo = null;
    if (this.off('zoom', 'panx', 'pany', 'turn')) camera(r, store, v.zoom, v.panx, v.pany, v.turn);
  }

  // a scene's colours as shown: turned round the hue circle, saturated, lightened
  paint(rgb) {
    const { hue, sat, light } = this.v;
    if (!this.off('hue', 'sat', 'light')) return rgb;
    return rgb.map(([r, g, b]) => {
      const [h, s, l] = hsl(r, g, b);
      return rgbOf((h + hue / 360 + 1) % 1, clamp(s * sat), clamp(l + light * (light > 0 ? 1 - l : l) * 2));
    });
  }
}

// the frame as heard with `react` k: levels, drives and the beat's pulse times k, hits stronger or thinned out
export function hear(f, hits, k) {
  if (Math.abs(k - 1) < 1e-3) return [f, hits];
  const rel = { ...f.rel };
  for (const n of ['bass', 'mid', 'treb']) {
    rel[n] *= k;
    rel[`${n}Att`] *= k;
    rel[`${n}Drive`] = clamp(rel[`${n}Drive`] * k);
  }
  const keep = () => k >= 1 || Math.random() < k;
  const hf = {
    ...f, rel, level: clamp(f.level * k), low: clamp(f.low * k), mid: clamp(f.mid * k), high: clamp(f.high * k),
    flux: clamp(f.flux * k), onset: f.onset && keep() ? f.onset : null,
    beat: { ...f.beat, pulse: clamp(f.beat.pulse * k), on: f.beat.on && keep() },
  };
  return [hf, hits.filter(keep).map((h) => ({ ...h, strength: clamp(h.strength * k) }))];
}

// where nothing new is drawn (bare background) what was there stays, dimmed, and dissolves dot by dot; elsewhere a
// little of the last frame smears into this one
export function echo(r, store, k, dim) {
  const b = r.buf, n = b.length;
  if (!store.echo || store.echo.length !== n) { store.echo = b.slice(); return; }
  const prev = store.echo;
  for (let i = 0; i < n; i++) {
    const p = prev[i];
    if (p === b[i]) continue;
    if (b[i] === BG) { if (p !== BG && Math.random() < k) b[i] = dim && p < DIM ? p + DIM : p; }
    else if (Math.random() < k * 0.35) b[i] = p;
  }
  prev.set(b);
}

// a camera into the raster: zoomed about where it looks, tilted; it zooms in as far as the tilt needs to keep the
// corners filled, and looks only as far off centre as keeps the view inside the picture
export function camera(r, store, zoom, panx, pany, turn) {
  const N = r.N, b = r.buf, a = (turn * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
  const reach = Math.abs(ca) + Math.abs(sa), z = Math.max(zoom, reach), half = N / 2;
  const room = half * (1 - reach / z), cx = half + panx * room, cy = half + pany * room;
  if (!store.cam || store.cam.length !== b.length) store.cam = new Uint8Array(b.length);
  const src = store.cam;
  src.set(b);
  for (let y = 0, i = 0; y < N; y++) {
    const dy = (y + 0.5 - half) / z;
    for (let x = 0; x < N; x++, i++) {
      const dx = (x + 0.5 - half) / z;
      const sx = Math.min(N - 1, Math.max(0, Math.floor(cx + dx * ca - dy * sa)));
      const sy = Math.min(N - 1, Math.max(0, Math.floor(cy + dx * sa + dy * ca)));
      b[i] = src[sy * N + sx];
    }
  }
}

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function rgbOf(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}
