// Every style the panel offers, and which ones each mood shows. The classic styles (scenes.js) get palette
// variants here, and register as worlds of the mixer too, remapped onto its palette roles by value: a video wall
// can put a colour field next to a corridor next to a story, and the MIX style draws from every family at once.
import { Raster, hexRgb } from './pixels.js';
import { STYLES as CLASSIC } from './scenes.js';
import { TE_STYLE } from './te.js';
import { RETRO_STYLE } from './retro.js';
import { DEMO_STYLE } from './demo.js';
import { POP_STYLE } from './popart.js';
import { ANIME_STYLE } from './anime.js';
import './anime2.js'; // more anime worlds, registered into the same family
import { INDIE_STYLE } from './indie.js';
import { UNDER_STYLE } from './under.js';
import { STREET_STYLE } from './street.js';
import { SPACE_STYLE } from './space.js';
import { EPIC_STYLE } from './epic.js';
import { GRIM_STYLE } from './grim.js';
import { CINEMA_STYLE } from './cinema.js';
import { Y2K_STYLE } from './y2k.js';
import { SHOOTER_STYLE } from './shooter.js';
import { MEDIEVAL_STYLE } from './medieval.js';
import { PS1_STYLE } from './ps1.js';
import { CASINO_STYLE } from './casino.js';
import { FAIRY_STYLE } from './fairy.js';
import { STEALTH_STYLE } from './stealth.js';
import { COFFEE_STYLE } from './coffee.js';
import { CLASSICS_STYLE } from './classics.js';
import { CRIME_STYLE } from './crime.js';
import { BANGKOK_STYLE } from './bangkok.js';
import { SURREAL_STYLE } from './surreal.js';
import { OFFROAD_STYLE } from './offroad.js';
import { DOOMER_STYLE } from './doomer.js';
import { DEFS, L, M, H, PALETTES, fit, fullPalette, makeMixStyle, registerFamily, worldsOf } from './mixer.js';
import { MOOD_VA } from './story.js';
import { meaning, worldMeaning } from './meaning.js';

// ---------------------------------------------------------------------------------------------- palette variants
function hsl(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
  return [h, s, l];
}
function hslHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
export const hueShift = (hex, deg) => { const [h, s, l] = hsl(hex); return hslHex((h + deg / 360) % 1, s, l); };
export const night = (hex) => { const [h, s, l] = hsl(hex); return hslHex(h, s, 1 - l); };

// a style's palette as it is, turned round the hue circle, or by night (paper dark, ink light): the structure (paper,
// ink, ramps, warm against cool) stays, the mood of the colours changes; low valence rather goes dark
const VARIANTS = [(c) => c, (c) => hueShift(c, 100), (c) => hueShift(c, 210), night, (c) => night(hueShift(c, 150))];
export function variantPalette(palette, mood, rnd) {
  const [v] = MOOD_VA[mood] || MOOD_VA.focused;
  const k = rnd() < 0.35 ? 0 : rnd() < (v < 0.42 ? 0.6 : 0.25) ? 3 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2);
  return palette.map(VARIANTS[k]);
}
// a classic style with palette variants, unless it picks its own palette already (the colour fields)
const withVariants = (def) => ({ ...def, init(s, c) { def.init(s, c); if (!s.palette) s.palette = variantPalette(def.palette, c.mood, c.rnd); } });

// ---------------------------------------------------------------------------------------------- classics as worlds
// Each draws into its own raster with its own palette; the result goes onto the roles by value: the style's colours
// sorted by lightness take the mix palette's colours sorted by lightness, so a fractal in 'hellfire' glows and a
// Mondrian in 'phosphor' is green. The per-pixel ones are `heavy`: main screen only.
const luma = (hex) => { const [r, g, b] = hexRgb(hex); return 0.3 * r + 0.59 * g + 0.11 * b; };
function roleLut(palette, roles) {
  const byL = roles.map((h, i) => [luma(h), i]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const order = palette.map((h, i) => [luma(h), i]).sort((a, b) => a[0] - b[0]);
  const lut = new Uint8Array(256);
  order.forEach(([, i], rank) => { lut[i] = byL[Math.round((rank / Math.max(1, order.length - 1)) * (byL.length - 1))]; });
  return lut;
}

function classicWorld(def) {
  const start = (W) => {
    const { w, N, rnd, seed, mood, px } = W;
    w.inner = {};
    def.init(w.inner, { N, px, seed: (seed ^ Math.floor(rnd() * 2 ** 31)) >>> 0, rnd, mood, reason: null });
    w.r = new Raster(N);
    w.N = N;
    w.palFor = null;
  };
  return {
    init: start,
    draw(W) {
      const { w, r, N, t, dt, f, hits, rnd, seed, s, px } = W;
      if (w.N !== N || w.inner.done) start(W); // a story that ended tells the next one
      def.draw(w.inner, { N, px, t, dt, f, hits, rnd, seed }, w.r);
      const pal = w.inner.palette || def.palette, roles = s.palette || fullPalette(PALETTES.noir.colors);
      if (w.palFor !== pal || w.rolesFor !== roles) { w.lut = roleLut(pal, roles); w.palFor = pal; w.rolesFor = roles; }
      const lut = w.lut, src = w.r.buf, dst = r.buf;
      for (let i = 0; i < dst.length; i++) dst[i] = lut[src[i]];
    },
  };
}

const CLASSIC_DEFS = {
  fractal: { name: 'julia set', va: [[H, H], [M, H]], pals: ['neon', 'thermal', 'candy', 'amiga', 'toxic'], fx: ['none', 'kaleido', 'crt'], heavy: true, geo: true },
  kandinsky: { name: 'kandinsky', va: [[H, M], [H, H]], pals: ['bauhaus', 'popprint', 'tape', 'riso'], fx: ['none', 'film'], geo: true },
  morpho: { name: 'morphogenesis', va: [[H, L], [M, L]], pals: ['vapor', 'ice', 'pastel', 'phosphor'], fx: ['none', 'crt', 'mirror'], heavy: true, geo: true },
  brutalism: { name: 'brutalism', va: [[M, H], [L, H]], pals: ['bureau', 'noir', 'silver', 'military'], fx: ['none', 'film', 'quad'], geo: true },
  destijl: { name: 'de stijl', va: [[M, M], [H, M]], pals: ['bauhaus', 'popprint', 'tabloid'], fx: ['none'], geo: true },
  flow: { name: 'flow field', va: [[M, L], [H, L]], pals: ['parchment', 'ice', 'sepia', 'pastel'], fx: ['none', 'film'], heavy: true, geo: true },
  glitch: { name: 'datamosh', va: [[L, H], [M, H]], pals: ['machine', 'cga', 'broadcast', 'toxic'], fx: ['crt', 'vhs', 'none'], heavy: true, geo: true },
  cubism: { name: 'cubist still life', va: [[L, M], [M, M]], pals: ['sepia', 'tape', 'bureau', 'deco'], fx: ['none', 'film'], heavy: true },
  rothko: { name: 'colour field', va: [[L, L], [M, L]], pals: ['occult', 'midnight', 'sepia', 'deco'], fx: ['none', 'film'], heavy: true, geo: true },
  molnar: { name: 'plotter squares', va: [[M, M], [M, L]], pals: ['blueprint', 'tabloid', 'bureau', 'phosphor'], fx: ['none', 'crt'], geo: true },
  riley: { name: 'op art', va: [[M, H], [M, M]], pals: ['silver', 'noir', 'cga', 'zx'], fx: ['none', 'kaleido'], geo: true },
  truchet: { name: 'truchet tiles', va: [[H, M], [M, L], [H, L]], pals: ['riso', 'pastel', 'parchment', 'amiga'], fx: ['none', 'crt'], geo: true },
  story: { name: 'a story', va: [[M, M], [L, L], [H, L], [M, L], [L, M]], pals: ['tape', 'bureau', 'pastel', 'riso', 'sepia'], fx: ['none', 'film'] },
};
registerFamily('classic', CLASSIC_DEFS, Object.fromEntries(Object.keys(CLASSIC_DEFS).map((k) => [k, classicWorld(k === 'story' ? TE_STYLE : CLASSIC[k])])));

// ---------------------------------------------------------------------------------------------- the styles
export const MIX_STYLE = makeMixStyle('MIX', null);

// the families of the mixer (mixer.js), each a style of its own: retro references, the demoscene, pop art and the
// modernists, ...; `mix` draws from all of them at once
const FAMILY_STYLES = { retro: RETRO_STYLE, demo: DEMO_STYLE, pop: POP_STYLE, anime: ANIME_STYLE, indie: INDIE_STYLE, under: UNDER_STYLE, street: STREET_STYLE, space: SPACE_STYLE, epic: EPIC_STYLE, grim: GRIM_STYLE, cinema: CINEMA_STYLE, y2k: Y2K_STYLE, shooter: SHOOTER_STYLE, medieval: MEDIEVAL_STYLE, ps1: PS1_STYLE, casino: CASINO_STYLE, fairy: FAIRY_STYLE, stealth: STEALTH_STYLE, coffee: COFFEE_STYLE, classics: CLASSICS_STYLE, crime: CRIME_STYLE, bangkok: BANGKOK_STYLE, surreal: SURREAL_STYLE, offroad: OFFROAD_STYLE, doomer: DOOMER_STYLE };

export const STYLES = {
  ...Object.fromEntries(Object.entries(CLASSIC).map(([k, d]) => [k, withVariants(d)])),
  // small stories in teenage engineering's flat manner, told by mood (te.js, story.js)
  te: TE_STYLE,
  ...FAMILY_STYLES,
  mix: MIX_STYLE,
};

// which styles each mood cell can show; a new section, or a long enough stay, moves on to the next one. The
// classic styles are placed by hand; a family joins every mood it has a world made for; stories and the mix go
// everywhere.
const CLASSIC_MOODS = {
  euphoric: ['fractal'], happy: ['kandinsky', 'truchet'], dreamy: ['morpho'], tense: ['brutalism', 'riley'], focused: ['destijl', 'molnar'],
  calm: ['flow', 'truchet'], aggressive: ['glitch'], mysterious: ['cubism'], melancholic: ['rothko'],
};
const fitsMood = (family, mood) => { const [v, a] = MOOD_VA[mood]; return worldsOf([family]).some((k) => fit(DEFS[k].va, v, a) > 0.6); };
export const MOOD_STYLES = Object.fromEntries(Object.keys(MOOD_VA).map((m) => [m, [...CLASSIC_MOODS[m], 'te', ...Object.keys(FAMILY_STYLES).filter((f) => fitsMood(f, m)), 'mix']]));

// how much of the playing track's meaning a style can show (1 without one): a classic style or the stories by their
// own world, a family or the mix by its three best worlds for it, since they pick their worlds by meaning themselves
export function styleMeaning(name) {
  if (!meaning()) return 1;
  if (DEFS[name]) return worldMeaning(name);
  if (name === 'te') return worldMeaning('story');
  const best = worldsOf(name === 'mix' ? null : [name]).map(worldMeaning).sort((x, y) => y - x).slice(0, 3);
  return best.length ? best.reduce((x, y) => x + y, 0) / best.length : 1;
}
