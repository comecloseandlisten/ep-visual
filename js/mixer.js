// The mixer every family of worlds draws through. A picture is a recipe: a WORLD (from the retro references, the
// demoscene, pop art and the modernists, or a classic style wrapped as a world), a PALETTE of eight roles, a screen
// TREATMENT and a LAYOUT (one screen, a split, an inset, channel zapping, a video wall). Every part is weighted by
// how well it fits the mood and how well it goes with the others; the odd mismatch is allowed on purpose. Every
// part also answers to the groove (groove.js): a world by its measured groove (profiles.js), a treatment and a
// layout by how much junk they add, against what the music has room for now. Left alone a mix develops in acts,
// swapping one part on the line of a square once its time is up; a section change pulls the next act forward, a
// breakdown strips the picture down to one screen and a light treatment.
import { Raster, clamp, lerp, mixHex } from './pixels.js';
import { MOOD_VA } from './story.js';
import { grooveFit, wantOf } from './groove.js';
import { PROFILES } from './profiles.js';
import { addThemes, fxMeaning, meaning, palMeaning, worldMeaning } from './meaning.js';

const TAU = Math.PI * 2;
const L = 0.2, M = 0.5, H = 0.8;
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const isLow = (h) => h.kind === 'kick' || h.kind === 'bass';
const isTonal = (h) => h.pc >= 0;
const follow = (v, to, dt, tau) => v + (to - v) * (1 - Math.exp(-dt / tau));
const wrapAngle = (a) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const followAngle = (a, to, dt, tau) => a + wrapAngle(to - a) * (1 - Math.exp(-dt / tau));
const ease = (t) => 1 - (1 - clamp(t)) ** 3;
const beatLocked = (f) => f.bpm > 0 && f.beat.conf > 0.15;
const fit = (va, v, a) => va.reduce((m, [pv, pa]) => Math.max(m, Math.exp(-((v - pv) ** 2 + (a - pa) ** 2) / 0.06)), 0) + 0.03;
const hash = (a, b = 0) => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function pickW(rnd, keys, weight) {
  const ws = keys.map(weight);
  let u = rnd() * ws.reduce((x, y) => x + y, 0);
  for (let i = 0; i < keys.length; i++) if ((u -= ws[i]) <= 0) return keys[i];
  return keys[keys.length - 1];
}
export { TAU, L, M, H, pick, isLow, isTonal, follow, wrapAngle, followAngle, ease, beatLocked, fit, hash, pickW };

// ---------------------------------------------------------------------------------------------- the base
// Palette roles. Worlds draw with these; a palette says what colour each one is. 8..15 are the same eight
// dimmed (scanlines, grain), then black and white for bars and burns.
const BG = 0, FIG = 1, DARK = 2, MID = 3, LMID = 4, BRIGHT = 5, HOT = 6, COOL = 7, DIM = 8, BLACK = 16, WHITE = 17;
export { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE };

export const PALETTES = {
  bureau: { name: 'cold bureau', va: [[L, M], [M, M], [L, L]], colors: ['#7b7f78', '#1c1c1a', '#3e4039', '#9a978b', '#bcb8aa', '#e6e2d3', '#b5121b', '#3f8f3f'] },
  hell: { name: 'hellfire', va: [[L, H], [M, H]], colors: ['#1b0d0b', '#e9d9b4', '#4a1d12', '#8a5433', '#b88653', '#f1e3c4', '#e3261b', '#3fd14f'] },
  machine: { name: 'machine vision', va: [[L, H], [L, M]], colors: ['#1c0000', '#ff7a66', '#4d0000', '#8e0000', '#c61b1b', '#ff9d8a', '#ffffff', '#ffb4a4'] },
  cinema: { name: 'cinema yellow', va: [[H, H], [M, H], [H, M]], colors: ['#f5c518', '#121212', '#3a3a3a', '#6f6f6f', '#a9a9a9', '#ffffff', '#d81e1e', '#e9e2c6'] },
  phosphor: { name: 'green phosphor', va: [[M, M], [L, M], [M, L]], colors: ['#02140a', '#9cff9c', '#064d1f', '#0a8c33', '#1fcc55', '#d6ffd6', '#ffffff', '#5cffb0'] },
  gameboy: { name: 'handheld greens', va: [[H, M], [H, L], [M, L]], colors: ['#9bbc0f', '#0f380f', '#0f380f', '#306230', '#8bac0f', '#8bac0f', '#306230', '#0f380f'] },
  cga: { name: 'cga', va: [[M, H], [H, H], [M, M]], colors: ['#000000', '#ffffff', '#aa00aa', '#55ffff', '#ff55ff', '#ffffff', '#ff55ff', '#55ffff'] },
  neon: { name: 'neon', va: [[H, H], [H, M], [M, L], [H, L]], colors: ['#120828', '#ff3cac', '#2a0e5c', '#6a1fb5', '#b347ea', '#fff0a0', '#ff3cac', '#2bd9ff'] },
  tape: { name: 'worn tape', va: [[M, L], [L, L], [M, M]], colors: ['#2a241e', '#efe4cf', '#463b30', '#88775f', '#bfab8c', '#fff2da', '#ff7a1a', '#58c7d6'] },
  noir: { name: 'noir', va: [[L, L], [L, M]], colors: ['#0f0f12', '#ececec', '#2b2b30', '#595960', '#9b9ba3', '#ffffff', '#d61f1f', '#cfd0d8'] },
  amber: { name: 'amber terminal', va: [[M, M], [L, M], [M, L]], colors: ['#1a0f00', '#ffb000', '#4d3000', '#8a5a00', '#c98700', '#ffd27a', '#ffffff', '#ffe9b0'] },
  thermal: { name: 'thermal camera', va: [[L, H], [L, M], [M, H]], colors: ['#0a0014', '#ffffff', '#3b0a6b', '#b1177a', '#f25c05', '#ffe600', '#ffffff', '#ffd400'] },
  blueprint: { name: 'blueprint', va: [[M, M], [M, H], [H, M]], colors: ['#0b2a6b', '#e8f1ff', '#123a8c', '#3f6fc4', '#8fb3ea', '#ffffff', '#ffd166', '#bfe0ff'] },
  sepia: { name: 'sepia reel', va: [[M, L], [L, L], [L, M]], colors: ['#e8d8b8', '#2a1c12', '#5a4330', '#8c6e52', '#b89a78', '#f6ecd8', '#a33a2c', '#6f8c73'] },
  candy: { name: 'candy arcade', va: [[H, M], [H, H], [H, L]], colors: ['#ffe6f0', '#3b1f4a', '#7a3b8f', '#ff6fb5', '#5ad1ff', '#ffffff', '#ff3d7f', '#2fd3c6'] },
  ice: { name: 'ice', va: [[M, L], [H, L], [M, M]], colors: ['#dfeef7', '#102a3a', '#2a4e66', '#5f8aa6', '#a7cbe0', '#ffffff', '#ff7a1a', '#3dbdd6'] },
  midnight: { name: 'midnight blue', va: [[L, L], [M, L], [L, M]], colors: ['#0a1030', '#f2e6b0', '#15214d', '#2d3f80', '#5570b5', '#fff4c2', '#ffb347', '#7fd3ff'] },
  toxic: { name: 'toxic green', va: [[L, H], [M, H], [H, H]], colors: ['#070a05', '#c8ff3d', '#1d2a10', '#3f5a1f', '#7fb03a', '#e8ffb0', '#ff2bd6', '#3dffd8'] },
  nineties: { name: 'nineties', va: [[H, M], [H, H], [M, M]], colors: ['#1b1040', '#ffffff', '#2d1b69', '#00a6a6', '#ff5fa2', '#fff35c', '#ff5fa2', '#00e0e0'] },
  military: { name: 'military', va: [[M, M], [L, M], [M, H]], colors: ['#2a2e22', '#e4dcc0', '#3f4634', '#6b7355', '#9ea07a', '#f0ead2', '#ff7a1a', '#a4c86a'] },
  silver: { name: 'silver screen', va: [[L, L], [L, M], [M, L]], colors: ['#111111', '#f0f0f0', '#333333', '#777777', '#b5b5b5', '#ffffff', '#ffffff', '#cfcfcf'] },
  gold: { name: 'disco gold', va: [[H, H], [H, M], [M, H]], colors: ['#0b0b0f', '#ffd700', '#2b2217', '#7a5a1e', '#c9a227', '#fff1b0', '#ff3cac', '#38e1ff'] },
  occult: { name: 'blood and bone', va: [[L, H], [L, M], [L, L]], colors: ['#0a0608', '#e8dcc4', '#2a0f14', '#5a1a22', '#8b2632', '#f2e9d8', '#d41f2e', '#b89b5e'] },
  vapor: { name: 'vaporwave', va: [[H, L], [H, M], [M, L]], colors: ['#2b1a4a', '#ffd1f2', '#4a2d7a', '#ff71ce', '#01cdfe', '#fffb96', '#ff71ce', '#05ffa1'] },
  tabloid: { name: 'tabloid print', va: [[L, M], [M, M], [M, H]], colors: ['#e9e4d6', '#1a1a1a', '#4a4a46', '#8c8a82', '#bdbab0', '#f7f4ea', '#c8102e', '#005b96'] },
  broadcast: { name: 'broadcast', va: [[M, H], [L, H], [M, M]], colors: ['#1b1b1b', '#f2f2f2', '#3a3a3a', '#6e6e6e', '#a5a5a5', '#ffffff', '#ff2a2a', '#2ad4ff'] },
  cult: { name: 'cult purple', va: [[L, M], [H, L], [L, L]], colors: ['#120a1e', '#e9d8ff', '#2a1745', '#5a2d8a', '#9b59d6', '#f3e7ff', '#ffcc33', '#7df9ff'] },
  parchment: { name: 'parchment map', va: [[M, M], [H, M], [M, L]], colors: ['#e3d3a9', '#2f2415', '#6b5a3c', '#8fa65a', '#c7b27d', '#f6ecd2', '#c0392b', '#3b6fa8'] },
  grimdark: { name: 'grim valley', va: [[L, M], [L, H], [L, L]], colors: ['#0c0f0d', '#d9d2bf', '#1e2a22', '#3e5a46', '#6f7f5e', '#e8e0c8', '#ff8c1a', '#4fb0ff'] },
  crypt: { name: 'crypt', va: [[L, H], [L, M], [M, H]], colors: ['#120a0a', '#e4d4c0', '#2a1414', '#5a2e2e', '#8a6a5a', '#f0e0c0', '#e0261f', '#2d6cff'] },
  royal: { name: 'royal blue and gold', va: [[M, M], [M, H], [H, M]], colors: ['#1d2a44', '#f1e7c6', '#2f416b', '#5c6fa3', '#9fb0d8', '#ffffff', '#d4af37', '#ff4d4d'] },
  warband: { name: 'warband green', va: [[L, H], [M, H], [M, M]], colors: ['#1a1f12', '#e6e2c8', '#2f3a1e', '#5a7a2e', '#8fb04a', '#f2f0d8', '#d62828', '#5fd1f0'] },
  crystal: { name: 'crystal blue', va: [[H, M], [M, M], [H, H]], colors: ['#0b1030', '#ffffff', '#1c2a60', '#3f5ca8', '#7fa0e0', '#ffffff', '#ff6b6b', '#5df0ff'] },
  // the demoscene and the print shop
  amiga: { name: 'amiga copper', va: [[H, M], [M, M], [H, H]], colors: ['#0a0a2a', '#ffffff', '#20206a', '#4a4ab0', '#8a7ad8', '#ffd9a0', '#ff7a33', '#55c8ff'] },
  c64: { name: 'c64 blue', va: [[M, M], [H, M], [M, L]], colors: ['#40318d', '#7869c4', '#1a1040', '#574ca6', '#8c86d9', '#ffffff', '#b86962', '#67b6bd'] },
  zx: { name: 'zx bright', va: [[H, H], [M, H], [H, M]], colors: ['#000000', '#ffffff', '#0000d7', '#d700d7', '#00d7d7', '#ffffff', '#ff2020', '#20ff20'] },
  popprint: { name: 'pop print', va: [[H, M], [H, H], [M, M]], colors: ['#fff3c4', '#141414', '#ff3d8f', '#ffcf1a', '#39c7ff', '#ffffff', '#ff2e2e', '#2bd3a8'] },
  benday: { name: 'comic print', va: [[M, H], [H, H], [H, M]], colors: ['#f6f1e4', '#111111', '#1d50c9', '#e52421', '#f6d22c', '#ffffff', '#e52421', '#1d50c9'] },
  pastel: { name: 'memphis pastel', va: [[H, L], [H, M], [M, L]], colors: ['#f7f1ea', '#1b1b1b', '#8bd3dd', '#f4b9c9', '#f9e07f', '#ffffff', '#f26b5b', '#5ec2b7'] },
  bauhaus: { name: 'bauhaus primary', va: [[M, M], [M, H], [H, M]], colors: ['#f2ede4', '#1a1a1a', '#1f4fb4', '#d9262c', '#f2c12e', '#ffffff', '#d9262c', '#1f4fb4'] },
  deco: { name: 'deco gold', va: [[M, L], [L, M], [M, M]], colors: ['#101418', '#e8c872', '#1f2a33', '#3b5563', '#7f8f99', '#f7e7b6', '#c9a04a', '#5dbbb0'] },
  riso: { name: 'risograph', va: [[H, M], [M, L], [H, L]], colors: ['#f4efe6', '#1e3a8a', '#2b2b6b', '#5a6bb5', '#9fb0e0', '#ffffff', '#ff4d6d', '#2bb673'] },
  // the glossy turn of the millennium: chrome, aero, pearl and hologram
  chrome: { name: 'chrome', va: [[H, L], [M, L], [H, M]], colors: ['#eef1f6', '#1c2230', '#6f7a8c', '#a3adbd', '#cfd6e0', '#ffffff', '#ff8ad8', '#6fd3ff'] },
  aero: { name: 'aero gloss', va: [[H, M], [H, L], [M, M]], colors: ['#dff3ff', '#0f3b66', '#1f6fb8', '#3fa0e6', '#8fd0ff', '#ffffff', '#7ed957', '#ffd166'] },
  pearl: { name: 'pearl', va: [[H, L], [M, L], [H, M]], colors: ['#fbf7ff', '#5a4a7a', '#c9b8ea', '#e2d4f5', '#f1e8fb', '#ffffff', '#ffb3c7', '#a8f0e0'] },
  hologram: { name: 'hologram', va: [[H, M], [M, M], [H, H]], colors: ['#0b0f1e', '#f2f6ff', '#2b3b6e', '#5566b3', '#8fa0e8', '#ffffff', '#ff7ad9', '#4df0e0'] },
  // the casino: green felt with red suits and gold chips, red velvet with gold
  felt: { name: 'green felt', va: [[M, M], [H, M], [M, L]], colors: ['#0f5b36', '#f6f1e4', '#0a3a22', '#1c7a4a', '#5aa37a', '#ffffff', '#d4262e', '#e6c14a'] },
  velvet: { name: 'red velvet', va: [[M, H], [L, M], [H, H]], colors: ['#3a0a12', '#f3e6c8', '#200408', '#7a1626', '#b8324a', '#fff2cc', '#ffd166', '#5ec8d8'] },
  // the fairy-tale swamp: murky greens with a warm lantern
  swamp: { name: 'swamp', va: [[H, M], [M, L], [H, L]], colors: ['#1d2a1a', '#e8e2c4', '#2f4a2a', '#4f7a3c', '#8bb05a', '#f2f0d0', '#e07b2a', '#6fd3c8'] },
  // the crime pictures: a smoky purple haze with an ember, and the warm tungsten of an old mob film
  haze: { name: 'haze', va: [[M, L], [H, L], [L, M]], colors: ['#1a1426', '#e9f5d0', '#2c2340', '#4b3f6b', '#7f73a8', '#d6f5a0', '#ff7a2f', '#7dff9a'] },
  tungsten: { name: 'tungsten', va: [[L, M], [M, M], [L, L]], colors: ['#1c1410', '#f3dfb8', '#3a2a1e', '#6b4a2e', '#a8784a', '#ffd99a', '#c0262e', '#3d8a7a'] },
  // the coffee bar: dark espresso with white foam, and a light latte with caramel
  espresso: { name: 'espresso', va: [[M, M], [L, M], [M, L]], colors: ['#1a0f0a', '#f6efe2', '#3b2316', '#6b3f22', '#b9824f', '#f2d9b0', '#e05a2a', '#5fb3a8'] },
  latte: { name: 'latte', va: [[H, L], [M, L], [H, M]], colors: ['#f3e9da', '#2a1a12', '#5a3a24', '#9b6a42', '#cfa77a', '#fff8ee', '#d9644a', '#7fb7a4'] },
  // the old books: ink wash on paper, and the open ocean
  inkwash: { name: 'ink wash', va: [[M, L], [L, L], [M, M]], colors: ['#f2ede2', '#1a1a1a', '#3a3a3a', '#6a6a6a', '#a8a49a', '#ffffff', '#b0302a', '#2f5a7a'] },
  oceanic: { name: 'open ocean', va: [[M, L], [L, M], [M, M]], colors: ['#0b2a3a', '#f1e8d0', '#123f55', '#1f6a85', '#4fa3b8', '#d9f2f2', '#e8743a', '#7fe0d0'] },
  // Siam: temple gold on deep red with green tiles, and Bangkok by night
  templegold: { name: 'temple gold', va: [[H, M], [M, M], [H, L]], colors: ['#2a0f12', '#ffe9b0', '#4a1a1c', '#8a2a24', '#c9962e', '#ffd34d', '#e8402a', '#2aa68a'] },
  bangkok: { name: 'bangkok night', va: [[H, H], [M, H], [H, M]], colors: ['#0c0b1e', '#fff1d6', '#1d1a3d', '#3b2f6e', '#7a5bc4', '#ffe066', '#ff3d7a', '#2ee6c7'] },
  // the dream: a painted blue sky, and old engravings cut out and coloured in
  dreamsky: { name: 'dream sky', va: [[H, L], [M, L], [M, M]], colors: ['#7fb3e0', '#1a1a2a', '#2c3e66', '#4f74a8', '#a8cbe8', '#ffffff', '#d94a3a', '#3fae8f'] },
  engraving: { name: 'coloured engraving', va: [[H, M], [M, M], [H, H]], colors: ['#efe3c8', '#1c1712', '#4a3a2a', '#8a6a4a', '#c9a97a', '#fff6e0', '#d8342a', '#2f7fb8'] },
  // off road: dirt under a blue sky with an orange bike, and sand dunes at dusk
  dirt: { name: 'dirt track', va: [[H, H], [M, H], [H, M]], colors: ['#9cc4e4', '#1e1a16', '#4a3726', '#7a5a3a', '#b08a5a', '#f1e6d2', '#ff6a1a', '#2f8f4e'] },
  dunes: { name: 'dunes', va: [[M, H], [H, M], [M, M]], colors: ['#f2c58a', '#2a1a10', '#7a4a24', '#b8743a', '#e2a35e', '#fff1d6', '#e8402a', '#3a8fd6'] },
  // the panel blocks: sodium streetlight on a winter night, and grey concrete under an overcast sky
  sodium: { name: 'sodium night', va: [[L, L], [L, M], [M, L]], colors: ['#0e1220', '#f2e2c4', '#1b2236', '#2f3a55', '#5a6a8a', '#ffcf7a', '#ff8a2a', '#7fb2d9'] },
  panel: { name: 'panel grey', va: [[L, L], [M, L], [L, M]], colors: ['#c9ccd1', '#1e2024', '#4a4e56', '#757a83', '#a3a7ae', '#eef0f2', '#b0402e', '#4f7a8a'] },
  // the phase space: deep violet with a hot and a cold trajectory, and two scientific colour maps
  attractor: { name: 'phase space', va: [[M, M], [L, M], [M, H]], colors: ['#05060f', '#e8f1ff', '#16163a', '#3a2f7a', '#7a5ad6', '#f4e9ff', '#ff5a8a', '#43e0ff'] },
  inferno: { name: 'inferno map', va: [[L, H], [M, H], [L, M]], colors: ['#000004', '#fcffa4', '#2a0b54', '#7a1d6c', '#d44842', '#fac228', '#f57d15', '#56b4e9'] },
  viridis: { name: 'viridis map', va: [[M, L], [H, M], [M, M]], colors: ['#0d0221', '#fde725', '#440154', '#31688e', '#35b779', '#fde725', '#f9a03f', '#3dd6d0'] },
  // the north: a cold fjord with a fire in it, carved wood and stone with old red, and the northern lights
  fjord: { name: 'fjord', va: [[L, L], [M, L], [L, M]], colors: ['#0f1a24', '#e8eef2', '#1f3242', '#3e5a6e', '#7d9aab', '#dbe7ee', '#e8743a', '#5fd3b8'] },
  runic: { name: 'carved wood', va: [[L, M], [L, H], [M, M]], colors: ['#1a1410', '#efe3c8', '#3a2a1c', '#6a4e34', '#a8875e', '#f2e2b8', '#b8322a', '#4f8a6e'] },
  aurora: { name: 'northern lights', va: [[M, L], [H, L], [M, M]], colors: ['#050a1a', '#e9fff5', '#0f2240', '#1f4f6a', '#3fa88a', '#b8ffd8', '#ff5aa8', '#5affc8'] },
  // the openings: a psychedelic paint box, a cinema grade with one red, and manga ink with a hot accent
  psychedelic: { name: 'psychedelic', va: [[H, H], [M, H], [H, M]], colors: ['#140022', '#fff6d0', '#3b0a6e', '#00a6ff', '#ffe600', '#ffffff', '#ff2e88', '#00ffa3'] },
  redfilm: { name: 'red film', va: [[L, H], [L, M], [M, H]], colors: ['#0e1416', '#f4ede2', '#1f2b2e', '#48585a', '#9aa39b', '#f2e6cf', '#d6121f', '#2f8f9d'] },
  mangaink: { name: 'manga ink', va: [[M, H], [L, H], [M, M]], colors: ['#f7f3ea', '#0f0f0f', '#2a2a2a', '#6b6b6b', '#b5b0a5', '#ffffff', '#e8114a', '#7a3cff'] },
};

// `load`: how much junk a treatment piles onto the picture, for the groove's budget (groove.js); `geo`: it goes over
// geometric worlds only (a world's `geo`), never over a story or characters, which it would cut into a pattern
export const TREATMENTS = {
  none: { name: 'clean', va: [[M, M], [H, M], [H, L]], load: 0 },
  crt: { name: 'crt scanlines', va: [[M, H], [M, M], [H, H]], load: 0.25 },
  vhs: { name: 'vhs', va: [[L, L], [M, L], [L, M]], load: 0.5 },
  film: { name: 'letterbox film', va: [[L, M], [M, L], [L, H]], load: 0.2 },
  hud: { name: 'targeting hud', va: [[L, H], [L, M], [M, H]], load: 0.6 },
  quad: { name: 'monitor wall', va: [[L, M], [M, H], [L, H]], load: 0.7 },
  code: { name: 'code rain', va: [[L, M], [M, M], [L, H]], load: 0.75 },
  subliminal: { name: 'subliminal frames', va: [[L, H], [L, M], [M, H]], load: 0.6 },
  manga: { name: 'manga speed lines', va: [[M, H], [H, H], [L, H]], load: 0.85 },
  mirror: { name: 'rorschach mirror', va: [[L, M], [L, L], [M, M]], load: 0.4, geo: true },
  frame: { name: 'game ui frame', va: [[M, M], [M, H], [L, M]], load: 0.45 },
  kaleido: { name: 'kaleidoscope', va: [[H, H], [M, H], [H, M]], load: 0.8, geo: true },
  cards: { name: 'colour cards', va: [[M, H], [L, H], [H, H], [M, M]], load: 0.65 },
};

// how many worlds share the screen, and how
export const LAYOUTS = {
  single: { name: '', va: [[M, M], [L, L], [H, L], [M, L], [H, M]] },
  split: { name: 'split screen', va: [[M, H], [H, H], [L, H]] },
  pip: { name: 'picture in picture', va: [[L, M], [M, M], [L, H]] },
  zap: { name: 'channel zapping', va: [[L, H], [M, H], [H, H]] },
  wall: { name: 'video wall', va: [[M, H], [H, H], [L, H]] },
};

// ---------------------------------------------------------------------------------------------- shared bits
// a chunky figure: two legs that alternate with `ph`, a coat or a jacket, a head with a hat or a cap
function walker(r, x, base, h, col, ph, dir, o = {}) {
  const hw = h * 0.17, head = h * 0.21, legH = h * 0.32, bodyH = h - head - legH - h * 0.04, bodyTop = base - legH - bodyH;
  const st = Math.sin(ph) * h * 0.1, lw = Math.max(1, hw * 0.55);
  r.rect(x - hw * 0.7 + st, base - legH, lw, legH, col);
  r.rect(x + hw * 0.15 - st, base - legH, lw, legH, col);
  const bw = o.coat ? hw * 1.25 : hw;
  r.rect(x - bw, bodyTop, 2 * bw, bodyH, col);
  if (o.coat) r.rect(x - bw * 1.1, base - legH - bodyH * 0.1, bw * 2.2, bodyH * 0.1 + legH * 0.35, col);
  const hy = bodyTop - head * 0.55, hc = o.hatCol ?? col;
  r.disc(x, hy, head * 0.5, col);
  if (o.hat) {
    r.rect(x - head * 0.75, hy - head * 0.3, head * 1.5, Math.max(1, head * 0.18), hc);
    r.rect(x - head * 0.45, hy - head * 0.8, head * 0.9, head * 0.55, hc);
  }
  if (o.cap) {
    r.rect(x - head * 0.5, hy - head * 0.55, head, head * 0.35, hc);
    r.rect(dir > 0 ? x : x - head * 0.9, hy - head * 0.25, head * 0.9, Math.max(1, head * 0.15), hc);
  }
  r.rect(x + dir * bw * 0.9 - lw / 2 - st * 0.5 * dir, bodyTop + h * 0.03, lw, bodyH * 0.75, col); // the near arm
  return { sx: x + dir * bw, sy: bodyTop + h * 0.06, top: hy - head * 0.5, hw: bw, head: hy };
}

function snowfall(W, list, want, speed, col) {
  const { r, N, dt, t, rnd, u } = W;
  while (list.length < want) list.push({ x: rnd() * N, y: -rnd() * N, s: rnd() * TAU });
  if (list.length > want) list.length = want;
  for (const fl of list) {
    fl.y += dt * N * speed;
    fl.x += Math.sin(t * 1.3 + fl.s) * dt * 4 * u;
    if (fl.y > N) { fl.y = -rnd() * 10 * u; fl.x = rnd() * N; }
    r.rect(fl.x, fl.y, Math.max(1, u), Math.max(1, u), col);
  }
}

function particles(W, list, col) {
  const { r, N, dt, u } = W;
  for (const p of list) {
    p.vy += N * 1.6 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), p.c ?? col);
  }
  return list.filter((p) => p.life > 0);
}

function burst(list, rnd, x, y, n, speed, c, life = 0.8) {
  for (let k = 0; k < n; k++) {
    const a = rnd() * TAU, sp = speed * (0.3 + rnd() * 0.7);
    list.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.4, life: life * (0.5 + rnd() * 0.5), c });
  }
}

function shiftRow(buf, N, y, dx) {
  if (!dx) return;
  const row = buf.slice(y * N, y * N + N);
  for (let x = 0; x < N; x++) buf[y * N + x] = row[(((x - dx) % N) + N) % N];
}

function shiftRows(r, dy) {
  if (!dy) return;
  const N = r.N, buf = r.buf, copy = buf.slice();
  for (let y = 0; y < N; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= N) buf.fill(BLACK, y * N, y * N + N);
    else buf.set(copy.subarray(sy * N, sy * N + N), y * N);
  }
}
export { walker, snowfall, particles, burst, shiftRow, shiftRows };

// ---------------------------------------------------------------------------------------------- treatments
function applyCRT(W) {
  const { r, N } = W, buf = r.buf;
  for (let y = 1; y < N; y += 2) for (let i = y * N, e = i + N; i < e; i++) if (buf[i] < 8) buf[i] += DIM;
  const R = Math.max(2, 0.07 * N);
  for (let y = 0; y < R; y++)
    for (let x = 0; x < R; x++) {
      if (Math.hypot(R - x - 0.5, R - y - 0.5) <= R) continue;
      buf[y * N + x] = BLACK; buf[y * N + N - 1 - x] = BLACK; buf[(N - 1 - y) * N + x] = BLACK; buf[(N - 1 - y) * N + N - 1 - x] = BLACK;
    }
}

function applyVHS(W) {
  const { r, N, u, t, rnd, f } = W, buf = r.buf;
  const by = Math.round(((t * 0.13) % 1.3 - 0.15) * N), bh = Math.round(0.05 * N);
  for (let y = Math.max(0, by); y < Math.min(N, by + bh); y++) {
    shiftRow(buf, N, y, Math.round((rnd() - 0.5) * 10 * u));
    for (let x = 0; x < N; x++) if (rnd() < 0.3) buf[y * N + x] = rnd() < 0.5 ? BRIGHT : LMID + DIM;
  }
  for (let y = N - Math.round(3 * u); y < N; y++) {
    shiftRow(buf, N, y, Math.round(rnd() * 12 * u));
    for (let x = 0; x < N; x++) if (rnd() < 0.5) buf[y * N + x] = rnd() < 0.5 ? BRIGHT : DARK + DIM;
  }
  if (rnd() < 0.05 + 0.15 * f.rel.trebDrive) { const dx = rnd() < 0.5 ? -1 : 1; for (let y = 0; y < N; y++) shiftRow(buf, N, y, dx); }
  if (rnd() < 0.1) { const y = Math.floor(rnd() * N), x0 = Math.floor(rnd() * N * 0.7), len = Math.floor(N * (0.1 + rnd() * 0.3)); for (let x = x0; x < Math.min(N, x0 + len); x++) buf[y * N + x] = WHITE; }
}

function applyFilm(W) {
  const { r, N, u, rnd, f, s, dt } = W, buf = r.buf, bar = Math.round(0.12 * N);
  r.rect(0, 0, N, bar, BLACK);
  r.rect(0, N - bar, N, bar, BLACK);
  for (let k = N * N * 0.008; k > 0; k--) { const i = bar * N + Math.floor(rnd() * (N - 2 * bar) * N); if (buf[i] < 8) buf[i] += DIM; }
  if (f.beat.on && f.beat.count % 16 === 15) s.burn = 0.12;
  if ((s.burn -= dt) > 0) { r.disc(0.9 * N, bar + 4 * u, 2.5 * u, WHITE); r.disc(0.9 * N, bar + 4 * u, 1.2 * u, BLACK); }
  if (rnd() < 0.06) { const x = Math.floor(rnd() * N); for (let y = bar; y < N - bar; y += 2) buf[y * N + x] = WHITE; }
}

function applyHUD(W) {
  const { r, N, u, dt, f, s, rnd, hits, targets } = W, hud = s.hud, lw = Math.max(1, Math.round(1.2 * u)), B = 0.08 * N;
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [N, 0, -1, 1], [0, N, 1, -1], [N, N, -1, -1]]) {
    r.rect(x - (sx < 0 ? B : 0), y - (sy < 0 ? lw : 0), B, lw, COOL);
    r.rect(x - (sx < 0 ? lw : 0), y - (sy < 0 ? B : 0), lw, B, COOL);
  }
  if (f.beat.on) for (let k = 0; k < 6; k++) hud.bits[Math.floor(rnd() * hud.bits.length)] ^= true;
  hud.bits.forEach((on, i) => r.rect(0.04 * N + (i % 3) * 3.2 * u, 0.2 * N + Math.floor(i / 3) * 3 * u, 2.2 * u, 1.8 * u, on ? BRIGHT : DARK));
  r.rect(0, ((f.rel.bassClock * 0.12) % 1) * N, N, 1, COOL + DIM);
  for (const hh of hits) if (hh.kind === 'snare') hud.lock++;
  let tx = N / 2, ty = N / 2, tr = 0.12 * N;
  if (targets.length) {
    const tg = targets[hud.lock % targets.length];
    tx = tg.x + tg.w / 2; ty = tg.y + tg.h / 2; tr = Math.max(tg.w, tg.h) * 0.7;
    for (const o of targets) r.frame(Math.round(o.x - u), Math.round(o.y - u), Math.round(o.w + 2 * u), Math.round(o.h + 2 * u), COOL);
  }
  hud.rx = follow(hud.rx, tx, dt, 0.2);
  hud.ry = follow(hud.ry, ty, dt, 0.2);
  hud.rr = follow(hud.rr, tr, dt, 0.3);
  r.ring(hud.rx, hud.ry, hud.rr, lw, BRIGHT);
  r.ring(hud.rx, hud.ry, hud.rr * 0.45, lw, BRIGHT);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) r.stroke(hud.rx + dx * hud.rr * 0.7, hud.ry + dy * hud.rr * 0.7, hud.rx + dx * hud.rr * 1.3, hud.ry + dy * hud.rr * 1.3, lw, BRIGHT);
  r.rect(hud.rx - hud.rr, hud.ry - hud.rr - 3 * u, 2 * hud.rr * f.level, 1.5 * u, HOT);
  if (f.beat.pulse > 0.5) r.disc(0.05 * N, 0.08 * N, 2 * u, HOT);
}

// the picture four times over, as on a wall of security monitors, with a gap between the screens
function applyQuad(W) {
  const { r, N } = W, buf = r.buf, copy = buf.slice(), gap = Math.max(1, Math.round(N / 60));
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const qx = x % (N / 2), qy = y % (N / 2);
      buf[y * N + x] = qx < gap || qy < gap ? BLACK : copy[Math.min(N - 1, Math.floor(qy * 2)) * N + Math.min(N - 1, Math.floor(qx * 2))];
    }
}

// columns of bright blocks falling down the picture and fading behind their heads, quicker with the treble
function applyCode(W) {
  const { r, N, u, dt, f, s, rnd } = W, buf = r.buf, cols = Math.ceil(N / (3 * u));
  if (!s.code || s.code.cols !== cols) s.code = { cols, heads: Float32Array.from({ length: cols }, () => -rnd() * N), v: Float32Array.from({ length: cols }, () => 0.3 + rnd() * 0.7) };
  const C = s.code, sp = N * (0.4 + 0.8 * f.rel.trebDrive), step = Math.max(1, Math.round(2 * u)), bw = Math.max(1, Math.round(1.5 * u));
  for (let i = 0; i < cols; i++) {
    C.heads[i] += C.v[i] * sp * dt;
    if (C.heads[i] > N * 1.4) { C.heads[i] = -rnd() * N * 0.3; C.v[i] = 0.3 + rnd() * 0.7; }
    const x = Math.floor(i * 3 * u), hy = Math.floor(C.heads[i]);
    if (x >= N) continue;
    for (let k = 0; k < 16; k++) {
      const y = hy - k * step;
      if (y < 0 || y >= N || hash(i, y + (f.beat.count >> 1)) < 0.5) continue;
      const c = k === 0 ? BRIGHT : k < 4 ? COOL : k < 10 ? MID : DARK;
      for (let xx = x; xx < Math.min(N, x + bw); xx++) buf[y * N + xx] = c;
    }
  }
}

// a symbol card for two frames on a hard snare or a drop: an eye, a triangle, a spiral, a hand, a skull
const SUBS = ['eye', 'tri', 'spiral', 'hand', 'skull'];
function applySubliminal(W) {
  const { r, N, u, f, s, hits, rnd } = W;
  for (const hh of hits) if (hh.kind === 'snare' && hh.strength > 0.6 && rnd() < 0.5) s.sub = { kind: pick(rnd, SUBS), n: 2 };
  if (f.section === 'drop') s.sub = { kind: pick(rnd, SUBS), n: 2 };
  if (!s.sub || s.sub.n <= 0) return;
  s.sub.n--;
  r.fill(BLACK);
  const cx = N / 2, cy = N / 2, R = 0.3 * N;
  switch (s.sub.kind) {
    case 'eye': r.ring(cx, cy, R * 0.5, R, WHITE, 0.45); r.disc(cx, cy, R * 0.35, BLACK); r.disc(cx, cy, R * 0.18, WHITE); break;
    case 'tri': r.poly([[cx, cy - R], [cx + R, cy + R * 0.7], [cx - R, cy + R * 0.7]], WHITE); r.poly([[cx, cy - R * 0.6], [cx + R * 0.6, cy + R * 0.45], [cx - R * 0.6, cy + R * 0.45]], BLACK); r.disc(cx, cy + R * 0.05, R * 0.15, WHITE); break;
    case 'spiral': for (let k = 0; k < 300; k++) { const a = k * 0.1, d = (k * R) / 300; r.rect(cx + Math.cos(a) * d - u, cy + Math.sin(a) * d - u, 2 * u, 2 * u, WHITE); } break;
    case 'hand':
      r.rect(cx - R * 0.35, cy - R * 0.2, R * 0.7, R * 0.9, WHITE);
      for (let i = 0; i < 4; i++) r.rect(cx - R * 0.35 + i * R * 0.18, cy - R * 0.9 + (i === 0 || i === 3 ? R * 0.2 : 0), R * 0.14, R * 0.75, WHITE);
      r.rect(cx + R * 0.35, cy - R * 0.1, R * 0.3, R * 0.14, WHITE);
      break;
    default:
      r.disc(cx, cy - R * 0.2, R * 0.6, WHITE);
      r.rect(cx - R * 0.35, cy + R * 0.2, R * 0.7, R * 0.45, WHITE);
      for (const k of [-1, 1]) r.disc(cx + k * R * 0.25, cy - R * 0.25, R * 0.17, BLACK);
      r.poly([[cx, cy - R * 0.05], [cx + R * 0.1, cy + R * 0.15], [cx - R * 0.1, cy + R * 0.15]], BLACK);
      for (let i = -2; i <= 2; i++) r.rect(cx + i * R * 0.13 - u, cy + R * 0.35, 2 * u, R * 0.25, BLACK);
  }
}

// speed lines out from where the kick landed, and on a heavy one a two-tone impact frame first
function applyManga(W) {
  const { r, N, s, hits } = W;
  for (const hh of hits) if (isLow(hh) && hh.strength > 0.5) s.manga = { n: 3, x: hh.x * N, y: hh.y * N, big: hh.strength > 0.85 };
  if (!s.manga || s.manga.n <= 0) return;
  const m = s.manga;
  m.n--;
  if (m.big && m.n === 2) for (let i = 0; i < r.buf.length; i++) r.buf[i] = r.buf[i] === BG || (r.buf[i] >= DIM && r.buf[i] < BLACK) ? WHITE : BLACK;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU + hash(i, m.n) * 0.1, l0 = (0.25 + hash(i, 3) * 0.3) * N;
    r.line(m.x + Math.cos(a) * l0, m.y + Math.sin(a) * l0, m.x + Math.cos(a) * N * 1.5, m.y + Math.sin(a) * N * 1.5, i % 2 ? BLACK : WHITE);
  }
}

// the left half mirrored onto the right: every world an inkblot
function applyMirror(W) {
  const { r, N } = W, buf = r.buf, half = N >> 1;
  for (let y = 0; y < N; y++) for (let x = 0; x < half; x++) buf[y * N + N - 1 - x] = buf[y * N + x];
}

// the chrome of an old game: a riveted border, a panel along the bottom with slots lit to the level and two bars
function applyFrame(W) {
  const { r, N, u, f } = W, b = Math.max(2, Math.round(2.5 * u)), ph = Math.round(0.09 * N), py = N - ph;
  r.rect(0, 0, N, b, MID);
  r.rect(0, py - b, N, ph + b, MID);
  r.rect(0, 0, b, N, MID);
  r.rect(N - b, 0, b, N, MID);
  r.frame(b, b, N - 2 * b, py - 2 * b, LMID);
  for (const [x, y] of [[0, 0], [N - 3 * b, 0], [0, py - 3 * b], [N - 3 * b, py - 3 * b]]) { r.rect(x, y, 3 * b, 3 * b, DARK); r.rect(x + b, y + b, b, b, HOT); }
  for (let k = 0; k < 8; k++) r.rect(0.06 * N + k * 0.07 * N, py + 2 * u, 0.05 * N, Math.max(2, ph - 4 * u), k < Math.round(f.level * 8) ? BRIGHT : DARK);
  r.rect(0.66 * N, py + 2 * u, 0.3 * N, 2 * u, DARK);
  r.rect(0.66 * N, py + 2 * u, 0.3 * N * clamp(f.rel.bassDrive), 2 * u, HOT);
  r.rect(0.66 * N, py + 5 * u, 0.3 * N, 2 * u, DARK);
  r.rect(0.66 * N, py + 5 * u, 0.3 * N * clamp(f.tonalAvg * 1.4), 2 * u, COOL);
}

// mirrored both ways: four of everything, meeting in the middle
function applyKaleido(W) {
  const { r, N } = W, buf = r.buf, half = N >> 1;
  for (let y = 0; y < half; y++)
    for (let x = 0; x < half; x++) {
      const v = buf[y * N + x];
      buf[y * N + N - 1 - x] = v;
      buf[(N - 1 - y) * N + x] = v;
      buf[(N - 1 - y) * N + N - 1 - x] = v;
    }
}

// a solid colour card for a frame or two on a hard snare and on a drop, with one geometric mark on it: the graphic
// cut of the stylish series
function applyCards(W) {
  const { r, N, u, f, s, hits, rnd } = W;
  for (const hh of hits) if (hh.kind === 'snare' && hh.strength > 0.65 && rnd() < 0.45) s.card = { n: 2, c: pick(rnd, [HOT, BLACK, WHITE, COOL]), k: Math.floor(rnd() * 4) };
  if (f.section === 'drop') s.card = { n: 3, c: HOT, k: 0 };
  if (!s.card || s.card.n <= 0) return;
  s.card.n--;
  const c = s.card.c, ink = c === WHITE ? BLACK : WHITE, cx = N / 2, cy = N / 2, R = 0.18 * N;
  r.fill(c);
  switch (s.card.k) {
    case 0: r.disc(cx, cy, R, ink); break;
    case 1: r.rect(cx - R, cy - 1.5 * u, 2 * R, 3 * u, ink); break;
    case 2: r.poly([[cx, cy - R], [cx + R, cy + R * 0.8], [cx - R, cy + R * 0.8]], ink); break;
    default: r.frame(cx - R, cy - R, 2 * R, 2 * R, ink); r.frame(cx - R + u, cy - R + u, 2 * R - 2 * u, 2 * R - 2 * u, ink);
  }
}

export const FX = { none: null, crt: applyCRT, vhs: applyVHS, film: applyFilm, hud: applyHUD, quad: applyQuad, code: applyCode, subliminal: applySubliminal, manga: applyManga, mirror: applyMirror, frame: applyFrame, kaleido: applyKaleido, cards: applyCards };

// ---------------------------------------------------------------------------------------------- the mixer
// Every family of worlds registers here: the retro references, the demoscene, pop art and the modernists, the
// classic styles wrapped as worlds. A mix style draws from one family, or from all of them at once; whatever the
// family, a world draws with the roles above, so any palette, treatment and layout fits any of them.
// `geo`: an abstract or geometric picture with no characters and no story, the only kind a `geo` treatment goes over
export const DEFS = {}; // world key -> { name, va, pals, fx, family, heavy, geo?, themes? }
export const IMPL = {}; // world key -> { init(W), draw(W) }
export function registerFamily(family, defs, impl) {
  for (const k in defs) {
    if (DEFS[k]) throw new Error(`world ${k} is registered twice`);
    DEFS[k] = { ...defs[k], family };
    IMPL[k] = impl[k];
    if (defs[k].themes) addThemes(k, defs[k].themes); // what it is about (meaning.js)
  }
}
export const worldsOf = (families) => Object.keys(DEFS).filter((k) => !families || families.includes(DEFS[k].family));
// whether treatment `fx` may go over world `k` (see `geo`)
const fxOver = (fx, k) => !TREATMENTS[fx]?.geo || !!DEFS[k]?.geo;
// whether everything a recipe puts on the screen is geometric
export const recipeGeo = (recipe) => [recipe.world, ...(recipe.layout === 'single' ? [] : recipe.layout === 'wall' ? recipe.more || [] : [recipe.world2])]
  .every((k) => !k || DEFS[k]?.geo);

let lastRecipe = null, nextAxis = null;
export const MIX_DEBUG = { force: null };
// the next mix made starts over in every part: a new track, or a new reading of what it is about
export const renewNext = () => { nextAxis = 'track'; };
const LAYOUT_W = { single: 7, split: 0.3, pip: 0.8, zap: 0.5, wall: 1 };
const LAYOUT_LOAD = { single: 0, pip: 0.5, split: 0.6, zap: 0.6, wall: 0.9 };
// how well a part's load of junk sits with the room the music leaves: a strong lean, never a ban
const room = (load, budget) => 0.08 + Math.exp(-((load - budget) ** 2) / 0.06);

// A recipe for a mood, from the worlds in `pool`. With a previous one: `axis` says which part to swap; without an
// axis (a new mood) the parts that no longer fit are redone, at least one, and the rest carry over, so the
// picture stays recognisable. The per-pixel worlds (`heavy`) take the main screen only, never the extra ones.
// `want` is what the groove asks of a picture (groove.js wantOf; null: nothing): a world is weighed by its mood and
// by its measured groove, both; a treatment and a layout by their load against the budget. While a track plays,
// what it is about (meaning.js) weighs a world, a palette and a treatment too, as much as the mood does. Axis
// 'track': a new track (or a new reading of it), every part redone.
const MEANS = new Map([[DEFS, worldMeaning], [PALETTES, palMeaning], [TREATMENTS, fxMeaning]]);
export function pickRecipe(rnd, mood, prev, axis, pool = Object.keys(DEFS), want = null) {
  const [v, a] = MOOD_VA[mood] || MOOD_VA.focused, budget = want ? want[0] : 0.5;
  const means = (T, k) => (MEANS.get(T)?.(k) ?? 1);
  const moodOf = (T, k) => fit(T[k].va, v, a);
  const fitOf = (T, k) => moodOf(T, k) * means(T, k) * (T === DEFS && want ? 0.25 + grooveFit(PROFILES[k], want) : 1);
  const goes = (world, kind, k) => (DEFS[world][kind].includes(k) ? 1 : 0.3);
  const inPool = (k) => !!k && pool.includes(k);
  const light = pool.filter((k) => !DEFS[k].heavy);
  const need = { world: !prev || !inPool(prev.world), pal: !prev, fx: !prev, layout: !prev };
  if (prev && axis === 'drop') need.world = need.fx = need.layout = true; // a drop: the whole picture anew, as loud as it gets
  else if (prev && axis === 'track') need.world = need.pal = need.fx = need.layout = true;
  else if (prev && axis) need[axis] = true;
  else if (prev && !need.world) {
    // a part that no longer fits the mood, or carries little of what the track is about, goes
    if (moodOf(DEFS, prev.world) < 0.35 || (meaning() && means(DEFS, prev.world) < 0.6)) need.world = true;
    if (moodOf(PALETTES, prev.pal) < 0.35 || (meaning() && means(PALETTES, prev.pal) < 0.6)) need.pal = true;
    if (moodOf(TREATMENTS, prev.fx) < 0.35) need.fx = true;
    if (moodOf(LAYOUTS, prev.layout || 'single') < 0.35) need.layout = true;
    if (!need.world && !need.pal && !need.fx && !need.layout) need[rnd() < 0.6 ? 'pal' : 'fx'] = true;
  }
  // a new world rather comes from another family, so a long mix wanders between them
  const was = prev?.world && DEFS[prev.world] && axis !== 'track' ? DEFS[prev.world].family : null;
  const world = need.world
    ? pickW(rnd, pool, (k) => fitOf(DEFS, k) * (prev && k === prev.world ? 0.1 : 1) * (was && DEFS[k].family !== was ? 1.6 : 1))
    : prev.world;
  // a part swapped on purpose (an axis) never comes back the same, so every act of the development shows
  const same = (kind, k, was) => (prev && k === was ? (axis === kind ? 0 : 0.1) : 1);
  const redo = (kind, key) => need[kind === 'pals' ? 'pal' : 'fx'] || (kind === 'fx' && !fxOver(key, world)) || (need.world && goes(world, kind, key) < 1 && rnd() < 0.7);
  const pal = redo('pals', prev?.pal) ? pickW(rnd, Object.keys(PALETTES), (k) => fitOf(PALETTES, k) * goes(world, 'pals', k) * same('pal', k, prev?.pal)) : prev.pal;
  const fx = redo('fx', prev?.fx) ? pickW(rnd, Object.keys(TREATMENTS), (k) => (fxOver(k, world) ? 1 : 0) * fitOf(TREATMENTS, k) * goes(world, 'fx', k) * same('fx', k, prev?.fx) * room(TREATMENTS[k].load, budget)) : prev.fx;
  // one world nearly always: the splits are hard to read, so they are rare, short (the next layout act takes them
  // away again) and mostly the inset or the wall; a second world goes with the palette
  const layout = need.layout
    ? pickW(rnd, Object.keys(LAYOUTS), (k) => fitOf(LAYOUTS, k) * LAYOUT_W[k] * room(LAYOUT_LOAD[k], budget) * (prev && k === (prev.layout || 'single') ? (axis === 'layout' ? 0 : k === 'single' ? 1 : 0.1) : 1))
    : prev.layout || 'single';
  // the treatment goes over the whole screen, so the other worlds on it must take it too
  const others = (k) => light.filter((q) => q !== k && fxOver(fx, q));
  let world2 = layout === 'single' ? null : prev?.world2 || null;
  if (layout !== 'single' && (!world2 || world2 === world || !inPool(world2) || !fxOver(fx, world2) || need.world || need.layout))
    world2 = others(world).length ? pickW(rnd, others(world), (k) => fitOf(DEFS, k) * goes(k, 'pals', pal)) : null;
  // a video wall shows up to four worlds at once, all of them going with the palette
  let more = layout === 'wall' ? prev?.more || null : null;
  if (layout === 'wall' && (!more || more.includes(world) || !more.every(inPool) || !more.every((k) => fxOver(fx, k)) || need.world || need.layout)) {
    more = [];
    const rest = others(world);
    while (more.length < 3 && rest.length) { const k = pickW(rnd, rest, (q) => fitOf(DEFS, q) * goes(q, 'pals', pal)); more.push(k); rest.splice(rest.indexOf(k), 1); }
  }
  return { world, pal, fx, layout, world2, more, ...(MIX_DEBUG.force || {}) };
}

export const fullPalette = (colors) => [...colors, ...colors.map((c) => mixHex(c, '#000000', 0.35)), '#000000', '#ffffff'];

function applyRecipe(s, recipe) {
  s.recipe = recipe;
  s.palette = fullPalette(PALETTES[recipe.pal].colors);
  s.paletteDirty = true;
  const dual = recipe.world2 && ['split', 'pip', 'zap'].includes(recipe.layout), wall = recipe.layout === 'wall' && recipe.more?.length;
  const what = wall ? `${[recipe.world, ...recipe.more].map((k) => DEFS[k].name).join(' / ')} (video wall)`
    : `${DEFS[recipe.world].name}${dual ? ` + ${DEFS[recipe.world2].name} (${LAYOUTS[recipe.layout].name})` : ''}`;
  s.lines = [`${what} · ${PALETTES[recipe.pal].name} · ${TREATMENTS[recipe.fx].name}`];
  s.ch = 0;
  lastRecipe = recipe;
}

// what a world gets to draw with: its raster, its own state `w`, the scene's shared state `s`, and the frame
export const ctx = (s, c, r, w = s.w) => ({ s, w, r, N: c.N, u: c.N / 125, px: c.px, seed: c.seed, mood: s.mood, t: c.t, dt: c.dt, f: c.f, hits: c.hits, rnd: c.rnd, v: s.v, a: s.a, targets: s.targets });

// the second world of a split, an inset or a zap, (re)started whenever the recipe names a new one
function second(s, c) {
  const want = ['split', 'pip', 'zap'].includes(s.recipe.layout) ? s.recipe.world2 : null;
  if (want === s.w2Name) return;
  s.w2Name = want;
  s.w2 = {};
  if (!want) return;
  if (!s.r2 || s.r2.N !== c.N) s.r2 = new Raster(c.N);
  IMPL[want].init(ctx(s, c, null, s.w2));
}

// the extra worlds of a video wall, (re)started whenever the recipe names new ones
function extras(s, c) {
  const want = s.recipe.layout === 'wall' && s.recipe.more?.length ? s.recipe.more.join(',') : '';
  if (want === s.moreKey) return;
  s.moreKey = want;
  s.more = [];
  if (!want) return;
  for (const name of s.recipe.more) { const w = {}; IMPL[name].init(ctx(s, c, null, w)); s.more.push({ name, w, r: new Raster(c.N) }); }
}

// the acts of a mix: what is swapped at each step of its development, round and round (a new world every third)
const ACTS = ['fx', 'pal', 'world', 'layout', 'pal', 'world'];

// A style that mixes the worlds of `families` (all of them when null). `s.done` tells main.js the mix wants a new
// world; main.js then remakes the scene and grows it in over this one.
export function makeMixStyle(title, families = null) {
  return {
    title,
    byMood: true,
    families,
    palette: fullPalette(PALETTES.noir.colors),
    init(s, c) {
      const rnd = c.rnd, pool = worldsOf(families);
      s.mood = c.mood in MOOD_VA ? c.mood : 'focused';
      [s.v, s.a] = MOOD_VA[s.mood];
      const axis = c.reason === 'drop' ? 'drop' : nextAxis; // a drop lands in another world, treated and laid out anew
      nextAxis = null;
      applyRecipe(s, pickRecipe(rnd, s.mood, lastRecipe, axis, pool, c.want || null));
      Object.assign(s, { pool, done: false, doneT: 0, targets: [], shake: 0, burn: 0, w: {}, w2: {}, w2Name: null, r2: null, zapB: false, zapNoise: 0,
        more: [], moreKey: '', wallN: 1, wallShift: 0, wallT: 0, beats: 0, clockT: 0, lastSwap: 0, act: 0, swapX: null, pull: false,
        pipCorner: Math.floor(rnd() * 4), hud: { bits: Array.from({ length: 36 }, () => rnd() < 0.4), lock: 0, rx: c.N / 2, ry: c.N / 2, rr: c.N * 0.1 } });
      IMPL[s.recipe.world].init(ctx(s, c, null));
      second(s, c);
      extras(s, c);
    },
    draw(s, c, r) {
      const W = ctx(s, c, r), { dt, f, rnd } = c, N = c.N;
      // development: left alone, the mix swaps a part on the line of a square once its time is up (four bars when
      // the music is up, eight when it is calm, twice that in a breakdown; a square of two bars waits for the line
      // after, one of eight or sixteen is the time itself): the treatment, then the layout, then the palette, then
      // the world, which main.js grows in over this one. A section change pulls the next swap to the next line. A
      // breakdown strips the picture down at once, to one screen and a light treatment; through a build or a pit it
      // holds still, the drop is coming (and the drop is main.js's, which remakes the scene with reason 'drop').
      // Without a tempo, half seconds stand in for beats.
      const g = f.groove, sq = g?.square, want = wantOf(g);
      if (beatLocked(f) ? f.beat.on : (s.clockT += dt) >= 0.5) { s.beats++; s.clockT = 0; }
      if (sq && (s.swapX === null || sq.x < s.swapX)) s.swapX = sq.x; // (the clock moved back on a mark)
      if (f.section === 'change') s.pull = true;
      if (g?.event === 'break' && !s.done && (s.recipe.layout !== 'single' || TREATMENTS[s.recipe.fx].load > 0.3)) {
        applyRecipe(s, { ...pickRecipe(rnd, s.mood, s.recipe, 'fx', s.pool, want), layout: 'single', world2: null, more: null, ...(MIX_DEBUG.force || {}) });
        s.lastSwap = s.beats;
        s.swapX = sq ? sq.x : null;
      }
      const hold = g && (g.state === 'build' || g.state === 'pit');
      const since = sq ? sq.x - s.swapX : s.beats - s.lastSwap;
      const due = sq ? sq.line && (since >= (s.a > 0.42 ? 16 : 32) * (g.state === 'break' ? 2 : 1) - 2 || (s.pull && since >= 6))
        : since >= 4 * (s.a > 0.6 ? 3 : s.a > 0.42 ? 4 : 6) || (f.section === 'change' && since >= 8);
      if (!s.done && !hold && due) {
        s.lastSwap = s.beats;
        s.swapX = sq ? sq.x : null;
        s.pull = false;
        let axis = ACTS[s.act++ % ACTS.length];
        // a split is left as soon as its act comes round, but entered only every other time: one screen reads best
        if (axis === 'layout' && s.recipe.layout === 'single' && rnd() < 0.5) axis = 'pal';
        if (axis === 'world') { s.done = true; nextAxis = 'world'; }
        else applyRecipe(s, pickRecipe(rnd, s.mood, s.recipe, axis, s.pool, want));
      }
      if (s.done && (s.doneT += dt) > 14) { // nobody took over: swap the world here
        s.done = false;
        s.doneT = 0;
        s.lastSwap = s.beats;
        s.swapX = sq ? sq.x : null;
        applyRecipe(s, pickRecipe(rnd, s.mood, s.recipe, 'world', s.pool, want));
        s.w = W.w = {}; // the new world starts and draws on fresh state this very frame
        IMPL[s.recipe.world].init(W);
      }
      second(s, c);
      extras(s, c);
      s.targets.length = 0;
      const dual = s.w2Name, layout = s.recipe.layout === 'wall' && s.more.length ? 'wall' : dual ? s.recipe.layout : 'single';
      r.fill(BG);
      if (layout === 'wall') {
        // the screen splits with the room the groove leaves: one picture most of the time, four as it builds, nine
        // and sixteen only on a drop and at the very top; it changes only on the bar, the screens dealt out afresh
        const energy = g ? g.budget : clamp(0.45 * Math.min(1, f.rel.bassAtt / 1.6) + 0.3 * f.level + 0.25 * Math.min(1, f.onsetRate / 6));
        const wantN = energy > 0.95 ? 16 : energy > 0.85 ? 9 : energy > 0.6 ? 4 : 1;
        if (f.bpm ? f.beat.on && f.beat.count % 4 === 0 : (s.wallT += dt) > 2) { s.wallT = 0; s.wallN = wantN; s.wallShift = Math.floor(rnd() * 4); }
        IMPL[s.recipe.world].draw(W);
        if (s.wallN > 1) {
          const srcs = [r.buf.slice()];
          for (const m of s.more) { m.r.fill(BG); IMPL[m.name].draw(ctx(s, c, m.r, m.w)); srcs.push(m.r.buf); }
          const g = Math.round(Math.sqrt(s.wallN)), cs = N / g, gap = Math.max(1, Math.round(W.u * 0.6));
          for (let k = 0; k < s.wallN; k++) {
            const row = Math.floor(k / g), col = k % g, src = srcs[(k + s.wallShift + row) % srcs.length];
            const x0 = Math.round(col * cs), y0 = Math.round(row * cs), x1 = Math.round((col + 1) * cs), y1 = Math.round((row + 1) * cs);
            for (let y = y0; y < y1; y++)
              for (let x = x0; x < x1; x++) r.buf[y * N + x] = x - x0 < gap || y - y0 < gap ? BLACK : src[Math.min(N - 1, Math.floor((y - y0) * g)) * N + Math.min(N - 1, Math.floor((x - x0) * g))];
          }
          s.targets.length = 0;
        }
      } else if (layout === 'zap') { // one channel at a time, a square each, a burst of static at the switch
        const onB = (sq ? sq.n : Math.floor(c.t / 8)) % 2 === 1;
        if (onB !== s.zapB) { s.zapB = onB; s.zapNoise = 2; }
        if (onB) IMPL[dual].draw(ctx(s, c, r, s.w2)); else IMPL[s.recipe.world].draw(W);
        if (s.zapNoise > 0) { s.zapNoise--; for (let i = 0; i < r.buf.length; i++) if (rnd() < 0.35) r.buf[i] = rnd() < 0.5 ? BRIGHT : DARK; }
      } else {
        IMPL[s.recipe.world].draw(W);
        if (dual) {
          const r2 = s.r2, n0 = s.targets.length;
          r2.fill(BG);
          IMPL[dual].draw(ctx(s, c, r2, s.w2));
          if (layout === 'split') { // the right half is the other world's right half
            const half = N >> 1;
            for (let y = 0; y < N; y++) r.buf.set(r2.buf.subarray(y * N + half, y * N + N), y * N + half);
            r.rect(half - 1, 0, 2, N, BLACK);
            const keep = s.targets.filter((tg, i) => (i < n0 ? tg.x + tg.w / 2 < half : tg.x + tg.w / 2 >= half));
            s.targets.length = 0;
            s.targets.push(...keep);
          } else { // an inset in a corner, a third of the size, in a frame
            const sz = Math.floor(N / 3), x0 = s.pipCorner & 1 ? N - sz - 3 : 3, y0 = s.pipCorner & 2 ? N - sz - 3 : 3;
            for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) r.buf[(y0 + y) * N + x0 + x] = r2.buf[Math.min(N - 1, y * 3) * N + Math.min(N - 1, x * 3)];
            r.frame(x0 - 1, y0 - 1, sz + 2, sz + 2, BLACK);
            r.frame(x0 - 2, y0 - 2, sz + 4, sz + 4, LMID);
            for (let i = n0; i < s.targets.length; i++) { const tg = s.targets[i]; tg.x = x0 + tg.x / 3; tg.y = y0 + tg.y / 3; tg.w /= 3; tg.h /= 3; }
          }
        }
      }
      if (s.shake > 0.05) shiftRows(r, Math.round((rnd() - 0.5) * s.shake * 3 * W.u));
      s.shake *= Math.exp(-dt * 8);
      FX[s.recipe.fx]?.(W);
    },
  };
}
