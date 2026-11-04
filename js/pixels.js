// Pixel toolkit: a palette-indexed raster, ordered dithering, value noise and a 3x5 font.

export const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mixHex = (a, b, t) => {
  const pa = hexRgb(a), pb = hexRgb(b);
  return `#${pa.map((v, i) => Math.round(lerp(v, pb[i], t)).toString(16).padStart(2, '0')).join('')}`;
};

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 8x8 Bayer matrix, values 0..1
export const BAYER = (() => {
  const m = [[0]];
  let b = m;
  for (let n = 1; n < 8; n *= 2) {
    const next = [];
    for (let y = 0; y < n * 2; y++) {
      next.push([]);
      for (let x = 0; x < n * 2; x++) {
        const q = (y < n ? 0 : 2) + (x < n ? 0 : 1);
        next[y].push(4 * b[y % n][x % n] + [0, 2, 3, 1][q]);
      }
    }
    b = next;
  }
  return Float32Array.from(b.flat(), (v) => (v + 0.5) / 64);
})();
export const bayer = (x, y) => BAYER[((y & 7) << 3) | (x & 7)];
export const dither = (x, y, v) => bayer(x, y) < v;

export function makeNoise(seed) {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = r(); }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const at = (x, y) => vals[perm[(x & 255) + perm[y & 255]]];
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  };
  noise.fbm = (x, y, oct = 3) => {
    let sum = 0, amp = 0.5, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * noise(x, y);
      norm += amp;
      x *= 2.03; y *= 2.03; amp *= 0.5;
    }
    return sum / norm;
  };
  return noise;
}

// A fixed grain, -0.5..0.5 at a scale of a few pixels, so band borders wander instead of running in rings.
export function makeGrain(N, seed) {
  const noise = makeNoise(seed ^ 0x1b873593), g = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g[y * N + x] = noise.fbm(x / 4.5, y / 4.5, 2) - 0.5;
  return g;
}

// A value in 0..1 onto an L-step ramp the way a pixel artist would: the border follows the grain and only a
// 1-3 px fringe at each border gets a checker, instead of dithering everywhere.
export function quant(v, L, grain, x, y) {
  const q = clamp(v) * (L - 1) + 0.35 * grain, k = Math.floor(q), f = q - k;
  const i = Math.abs(f - 0.5) < 0.12 ? k + ((x + y) & 1) : Math.round(q);
  return i < 0 ? 0 : i > L - 1 ? L - 1 : i;
}

// Add `a` to every pixel of a float field inside a polygon (unit coordinates), even-odd like Raster.poly.
export function fillPolyF(buf, N, pts, a) {
  const xs = [];
  let top = Infinity, bottom = -Infinity;
  for (const p of pts) { top = Math.min(top, p[1] * N); bottom = Math.max(bottom, p[1] * N); }
  for (let y = Math.max(0, Math.floor(top)); y < Math.min(N, Math.ceil(bottom)); y++) {
    const yc = (y + 0.5) / N;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xa, ya] = pts[j], [xb, yb] = pts[i];
      if ((ya <= yc) !== (yb <= yc)) xs.push((xa + ((yc - ya) / (yb - ya)) * (xb - xa)) * N);
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(N, Math.round(xs[k + 1])); x++) buf[y * N + x] += a;
  }
}

// Rank-normalize so that a threshold t reveals exactly a fraction t of the pixels.
export function rankMap(values) {
  const idx = Array.from(values.keys()).sort((a, b) => values[a] - values[b]);
  const out = new Float32Array(values.length);
  idx.forEach((i, rank) => { out[i] = (rank + 0.5) / values.length; });
  return out;
}

export class Raster {
  constructor(N) {
    this.N = N;
    this.buf = new Uint8Array(N * N);
  }
  fill(c) { this.buf.fill(c); }
  set(x, y, c) {
    x |= 0; y |= 0;
    if (x >= 0 && y >= 0 && x < this.N && y < this.N) this.buf[y * this.N + x] = c;
  }
  get(x, y) {
    x |= 0; y |= 0;
    return x >= 0 && y >= 0 && x < this.N && y < this.N ? this.buf[y * this.N + x] : 0;
  }
  rect(x, y, w, h, c) {
    const N = this.N;
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(N, Math.round(x + w)), y1 = Math.min(N, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) this.buf.fill(c, yy * N + x0, yy * N + Math.max(x0, x1));
  }
  frame(x, y, w, h, c) {
    this.rect(x, y, w, 1, c); this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c); this.rect(x + w - 1, y, 1, h, c);
  }
  disc(cx, cy, r, c) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, c);
      }
  }
  ring(cx, cy, r, th, c, sy = 1) {
    const ro = r + th / 2, ri = Math.max(0, r - th / 2);
    for (let y = Math.floor(cy - ro * sy); y <= cy + ro * sy; y++)
      for (let x = Math.floor(cx - ro); x <= cx + ro; x++) {
        const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / sy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= ro && d >= ri) this.set(x, y, c);
      }
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // filled polygon [[x, y], ...], even-odd scanlines through pixel centres
  poly(pts, c) {
    const N = this.N, xs = [];
    let top = Infinity, bottom = -Infinity;
    for (const p of pts) { top = Math.min(top, p[1]); bottom = Math.max(bottom, p[1]); }
    for (let y = Math.max(0, Math.floor(top)); y < Math.min(N, Math.ceil(bottom)); y++) {
      const yc = y + 0.5;
      xs.length = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xa, ya] = pts[j], [xb, yb] = pts[i];
        if ((ya <= yc) !== (yb <= yc)) xs.push(xa + ((yc - ya) / (yb - ya)) * (xb - xa));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.round(xs[k])), xb = Math.min(N, Math.round(xs[k + 1]));
        if (xb > xa) this.buf.fill(c, y * N + xa, y * N + xb);
      }
    }
  }
  // line of width w; thin ones stay Bresenham
  stroke(x0, y0, x1, y1, w, c) {
    if (w <= 1.2) { this.line(x0, y0, x1, y1, c); return; }
    const len = Math.hypot(x1 - x0, y1 - y0) || 1, nx = (-(y1 - y0) / len) * (w / 2), ny = ((x1 - x0) / len) * (w / 2);
    this.poly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], c);
  }
  sprite(rows, x, y, map, scale = 1) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = map[row[i]];
        if (c !== undefined) this.rect(x + i * scale, y + j * scale, scale, scale, c);
      }
    });
  }
  text(str, x, y, c, scale = 1) {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const g = FONT[ch] || FONT[' '];
      for (let j = 0; j < 5; j++)
        for (let i = 0; i < 3; i++)
          if (g[j] & (4 >> i)) this.rect(cx + i * scale, y + j * scale, scale, scale, c);
      cx += 4 * scale;
    }
    return cx - x - scale;
  }
}
export const textWidth = (str, scale = 1) => Math.max(0, str.length * 4 - 1) * scale;

// 3x5 glyphs, each row is 3 bits (MSB = left)
const G = (s) => s.split(',').map((r) => parseInt(r, 2));
const FONT = {
  ' ': G('000,000,000,000,000'), A: G('010,101,111,101,101'), B: G('110,101,110,101,110'),
  C: G('011,100,100,100,011'), D: G('110,101,101,101,110'), E: G('111,100,110,100,111'),
  F: G('111,100,110,100,100'), G: G('011,100,101,101,011'), H: G('101,101,111,101,101'),
  I: G('111,010,010,010,111'), J: G('001,001,001,101,010'), K: G('101,101,110,101,101'),
  L: G('100,100,100,100,111'), M: G('101,111,111,101,101'), N: G('110,101,101,101,101'),
  O: G('010,101,101,101,010'), P: G('110,101,110,100,100'), Q: G('010,101,101,110,011'),
  R: G('110,101,110,101,101'), S: G('011,100,010,001,110'), T: G('111,010,010,010,010'),
  U: G('101,101,101,101,111'), V: G('101,101,101,101,010'), W: G('101,101,111,111,101'),
  X: G('101,101,010,101,101'), Y: G('101,101,010,010,010'), Z: G('111,001,010,100,111'),
  0: G('111,101,101,101,111'), 1: G('010,110,010,010,111'), 2: G('110,001,010,100,111'),
  3: G('110,001,010,001,110'), 4: G('101,101,111,001,001'), 5: G('111,100,110,001,110'),
  6: G('011,100,111,101,111'), 7: G('111,001,010,010,010'), 8: G('111,101,111,101,111'),
  9: G('111,101,111,001,110'), '.': G('000,000,000,000,010'), '-': G('000,000,111,000,000'),
  ':': G('000,010,000,010,000'), '/': G('001,001,010,100,100'), '#': G('101,111,101,111,101'),
  '+': G('000,010,111,010,000'), '·': G('000,000,010,000,000'),
};
