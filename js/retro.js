// Retro references, mixed. A picture is a recipe of three parts: a WORLD (a border checkpoint, a first-person
// corridor, a sword duel in the snow, a night highway, a space arcade, a platformer), a PALETTE (cold bureau,
// hellfire, machine vision, cinema yellow, green phosphor, handheld greens, cga, neon, worn tape, noir) and a
// screen TREATMENT (clean, crt scanlines, vhs, letterbox film, targeting hud). Every part is weighted by how well
// it fits the mood and how well it goes with the others; the odd mismatch is allowed on purpose, so a checkpoint
// can be seen through a targeting hud and a duel can play on a cga screen. A new section swaps one part, so the
// picture reads as a remix of itself; a drop swaps the world. The visual language only: no logos, names or
// characters from anywhere.
import { Raster, clamp, lerp } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow, wrapAngle, followAngle, ease,
  beatLocked, hash, pickW, walker, snowfall, particles, burst, shiftRow, shiftRows, registerFamily, makeMixStyle, MIX_DEBUG } from './mixer.js';
export { PALETTES, TREATMENTS, LAYOUTS, pickRecipe } from './mixer.js';


// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight
export const WORLD_DEFS = {
  checkpoint: { name: 'border checkpoint', va: [[L, M], [M, M], [L, L]], pals: ['bureau', 'noir', 'tape', 'phosphor', 'sepia', 'ice'], fx: ['none', 'film', 'vhs', 'hud', 'quad'] },
  corridor: { name: 'first-person corridor', va: [[L, H], [M, H], [L, M]], pals: ['hell', 'machine', 'cga', 'phosphor', 'gameboy', 'thermal'], fx: ['crt', 'none', 'hud', 'subliminal'] },
  duel: { name: 'sword duel', va: [[L, H], [M, M], [H, H], [M, L]], pals: ['cinema', 'noir', 'bureau', 'ice', 'sepia'], fx: ['film', 'none', 'crt', 'manga'] },
  outrun: { name: 'night highway', va: [[H, M], [M, M], [H, H], [L, L], [M, L]], pals: ['neon', 'tape', 'cga', 'machine', 'candy'], fx: ['crt', 'vhs', 'none'] },
  arcade: { name: 'space arcade', va: [[H, H], [M, H], [H, M]], pals: ['cga', 'phosphor', 'gameboy', 'neon', 'noir', 'amber', 'blueprint'], fx: ['crt', 'none'] },
  platformer: { name: 'platformer', va: [[H, M], [H, H], [M, M], [H, L]], pals: ['gameboy', 'cga', 'neon', 'cinema', 'candy', 'ice'], fx: ['none', 'crt'] },
  pong: { name: 'table tennis', va: [[M, M], [H, M], [M, L], [M, H]], pals: ['cga', 'phosphor', 'noir', 'gameboy', 'amber'], fx: ['crt', 'none'] },
  western: { name: 'high noon', va: [[L, M], [M, H], [L, H], [M, L]], pals: ['tape', 'cinema', 'sepia', 'noir'], fx: ['film', 'none', 'vhs'] },
  ring: { name: 'fighting game', va: [[L, H], [M, H], [H, H]], pals: ['cga', 'neon', 'hell', 'cinema', 'candy'], fx: ['crt', 'none', 'manga'] },
  rain: { name: 'neon rain street', va: [[L, L], [L, M], [M, M]], pals: ['neon', 'noir', 'machine', 'tape', 'thermal'], fx: ['vhs', 'film', 'none', 'hud', 'quad', 'code'] },
  radar: { name: 'radar scope', va: [[L, M], [M, M], [M, H], [L, L]], pals: ['phosphor', 'amber', 'machine', 'noir', 'blueprint'], fx: ['crt', 'none', 'hud', 'quad', 'code'] },
  aerobics: { name: 'vhs workout', va: [[H, H], [H, M], [M, M]], pals: ['candy', 'neon', 'tape', 'cinema', 'nineties'], fx: ['vhs', 'none', 'crt'] },
  dogfight: { name: 'wireframe cockpit', va: [[M, H], [H, H], [L, H]], pals: ['phosphor', 'noir', 'cga', 'blueprint'], fx: ['crt', 'none', 'hud', 'code'] },
  kaiju: { name: 'kaiju over the city', va: [[L, H], [M, H], [L, M]], pals: ['midnight', 'noir', 'toxic', 'machine', 'silver'], fx: ['film', 'crt', 'none', 'hud', 'manga'] },
  ufo: { name: 'ufo over the farm', va: [[H, L], [M, L], [L, M], [H, M]], pals: ['midnight', 'phosphor', 'noir', 'nineties'], fx: ['vhs', 'none', 'film'] },
  periscope: { name: 'periscope', va: [[L, M], [M, M], [L, L]], pals: ['silver', 'phosphor', 'military', 'noir'], fx: ['film', 'crt', 'none'] },
  haunted: { name: 'haunted house', va: [[L, L], [L, M], [L, H]], pals: ['midnight', 'silver', 'noir', 'sepia'], fx: ['film', 'vhs', 'none'] },
  blinds: { name: 'private eye office', va: [[L, L], [L, M], [M, L]], pals: ['noir', 'silver', 'sepia', 'tape'], fx: ['film', 'none', 'vhs'] },
  skate: { name: 'half-pipe', va: [[H, M], [H, H], [M, M]], pals: ['nineties', 'candy', 'cinema', 'neon'], fx: ['vhs', 'none'] },
  arena: { name: 'arena show', va: [[H, H], [M, H], [H, M]], pals: ['gold', 'neon', 'noir', 'toxic'], fx: ['none', 'crt', 'vhs', 'manga'] },
  blockparty: { name: 'block party', va: [[H, M], [M, H], [H, H]], pals: ['nineties', 'candy', 'tape', 'cinema'], fx: ['vhs', 'none'] },
  rocket: { name: 'launch pad', va: [[M, H], [H, H], [M, M]], pals: ['military', 'silver', 'tape', 'blueprint'], fx: ['film', 'none', 'crt'] },
  disco: { name: 'disco floor', va: [[H, M], [H, H], [H, L]], pals: ['gold', 'neon', 'candy', 'nineties'], fx: ['none', 'vhs', 'crt'] },
  dungeon: { name: 'dungeon crawl', va: [[L, M], [M, M], [M, H]], pals: ['amber', 'phosphor', 'gameboy', 'hell', 'midnight'], fx: ['crt', 'none', 'frame'] },
  lightcycles: { name: 'light trails', va: [[M, H], [L, H], [H, H]], pals: ['neon', 'phosphor', 'blueprint', 'toxic'], fx: ['crt', 'none', 'code', 'kaleido'], geo: true },
  moonride: { name: 'ride across the moon', va: [[H, L], [M, L], [L, L]], pals: ['midnight', 'silver', 'sepia', 'ice'], fx: ['film', 'none'] },
  boulder: { name: 'boulder run', va: [[M, H], [L, H], [H, H]], pals: ['hell', 'sepia', 'amber', 'tape'], fx: ['film', 'crt', 'none', 'manga'] },
  snake: { name: 'snake', va: [[M, M], [H, M], [M, L]], pals: ['gameboy', 'phosphor', 'amber', 'cga'], fx: ['crt', 'none', 'code'] },
  crossing: { name: 'road crossing', va: [[H, M], [M, H], [H, H]], pals: ['cga', 'gameboy', 'candy', 'neon'], fx: ['crt', 'none'] },
  rhythm: { name: 'rhythm lanes', va: [[H, H], [M, H], [H, M]], pals: ['neon', 'candy', 'toxic', 'gold'], fx: ['crt', 'none', 'code', 'kaleido'], geo: true },
  ritual: { name: 'the ritual', va: [[L, H], [L, M], [L, L]], pals: ['occult', 'cult', 'noir', 'hell', 'silver'], fx: ['film', 'none', 'crt'] },
  tarot: { name: 'the cards', va: [[L, L], [L, M], [H, L]], pals: ['cult', 'occult', 'gold', 'sepia'], fx: ['none', 'film'] },
  spiral: { name: 'hypnosis', va: [[L, M], [M, M], [L, H], [H, L]], pals: ['silver', 'cult', 'candy', 'noir', 'phosphor'], fx: ['none', 'crt', 'subliminal', 'mirror', 'kaleido'], geo: true },
  testcard: { name: 'emergency broadcast', va: [[M, H], [L, H], [M, M]], pals: ['broadcast', 'cga', 'tape', 'nineties'], fx: ['crt', 'vhs', 'none', 'subliminal'] },
  waterfall: { name: 'numbers station', va: [[L, M], [M, M], [L, L]], pals: ['phosphor', 'amber', 'military', 'noir', 'blueprint'], fx: ['crt', 'none', 'code'] },
  antennas: { name: 'antenna field', va: [[M, L], [L, M], [H, L]], pals: ['midnight', 'phosphor', 'military', 'ice', 'cult'], fx: ['none', 'crt', 'code'] },
  pyramid: { name: 'the eye on the pyramid', va: [[L, M], [M, M], [H, L]], pals: ['cult', 'tabloid', 'gold', 'sepia', 'phosphor'], fx: ['none', 'film', 'code', 'subliminal'] },
  strings: { name: 'the string board', va: [[L, M], [M, H], [M, M]], pals: ['tabloid', 'sepia', 'noir', 'bureau'], fx: ['none', 'film', 'vhs', 'quad'] },
  chemtrails: { name: 'lines in the sky', va: [[M, M], [H, L], [M, L]], pals: ['ice', 'tabloid', 'bureau', 'sepia', 'blueprint'], fx: ['none', 'film', 'vhs'] },
  flatearth: { name: 'the flat earth', va: [[H, L], [M, L], [M, M]], pals: ['blueprint', 'ice', 'cult', 'tabloid'], fx: ['none', 'crt', 'film'] },
  studio: { name: 'the moon set', va: [[M, M], [L, M], [H, M]], pals: ['silver', 'sepia', 'tape', 'military'], fx: ['film', 'vhs', 'none'] },
  agents: { name: 'the agents', va: [[L, M], [L, H], [L, L]], pals: ['noir', 'silver', 'machine', 'midnight'], fx: ['film', 'none', 'hud'] },
  bigfoot: { name: 'the footage', va: [[L, L], [L, M], [M, L]], pals: ['sepia', 'tape', 'military', 'silver'], fx: ['vhs', 'film', 'none'] },
  swarm: { name: 'drone show', va: [[H, M], [H, L], [M, M], [H, H]], pals: ['midnight', 'neon', 'noir', 'vapor'], fx: ['none', 'crt', 'kaleido'], geo: true },
  feed: { name: 'doomscroll', va: [[M, M], [H, M], [M, H]], pals: ['vapor', 'candy', 'nineties', 'noir', 'broadcast'], fx: ['none', 'crt'] },
  chart: { name: 'to the moon', va: [[M, H], [H, H], [L, H]], pals: ['broadcast', 'noir', 'phosphor', 'toxic', 'gold'], fx: ['crt', 'none', 'code'] },
  bust: { name: 'vaporwave bust', va: [[H, L], [M, L], [H, M]], pals: ['vapor', 'neon', 'candy', 'ice'], fx: ['vhs', 'none', 'crt'] },
  horde: { name: 'the horde', va: [[L, H], [L, M], [M, H]], pals: ['toxic', 'noir', 'hell', 'military', 'silver'], fx: ['film', 'vhs', 'crt'] },
  cape: { name: 'the landing', va: [[H, H], [H, M], [M, H]], pals: ['cinema', 'nineties', 'midnight', 'broadcast'], fx: ['manga', 'none', 'crt'] },
  rts: { name: 'real-time strategy', va: [[M, H], [M, M], [H, M]], pals: ['warband', 'parchment', 'military', 'gameboy'], fx: ['frame', 'none', 'crt'] },
  barrier: { name: 'the valley under the barrier', va: [[L, M], [L, H], [L, L]], pals: ['grimdark', 'midnight', 'noir', 'occult'], fx: ['none', 'film', 'frame'] },
  hexbattle: { name: 'the hex battlefield', va: [[M, H], [H, M], [M, M]], pals: ['royal', 'parchment', 'warband', 'cinema'], fx: ['frame', 'none', 'crt'] },
  adventure: { name: 'the adventure map', va: [[H, M], [M, M], [H, L]], pals: ['parchment', 'royal', 'gameboy', 'ice'], fx: ['frame', 'none'] },
  raid: { name: 'raid night', va: [[L, H], [M, H], [H, H]], pals: ['crypt', 'cult', 'toxic', 'royal'], fx: ['frame', 'none', 'crt'] },
  jrpg: { name: 'turn-based battle', va: [[M, M], [H, M], [M, H]], pals: ['crystal', 'cga', 'candy', 'royal'], fx: ['crt', 'none'] },
  arpg: { name: 'dungeon loot', va: [[L, H], [L, M], [M, H]], pals: ['crypt', 'occult', 'hell', 'amber'], fx: ['frame', 'none', 'crt'] },
  prison: { name: 'the yard', va: [[L, M], [L, L], [M, M]], pals: ['bureau', 'noir', 'military', 'silver', 'tape'], fx: ['film', 'none', 'vhs', 'quad'] },
  motorcade: { name: 'the motorcade', va: [[M, M], [H, M], [M, L]], pals: ['cinema', 'sepia', 'bureau', 'silver', 'tape'], fx: ['film', 'none', 'vhs'] },
  rally: { name: 'the rally', va: [[M, H], [L, H], [M, M]], pals: ['bureau', 'broadcast', 'tabloid', 'cinema', 'royal'], fx: ['film', 'none', 'crt', 'vhs'] },
  stream: { name: 'the stream', va: [[H, M], [M, M], [H, H]], pals: ['vapor', 'neon', 'candy', 'broadcast', 'nineties'], fx: ['none', 'crt'] },
  inferno: { name: 'the pit', va: [[L, H], [L, M], [M, H]], pals: ['hell', 'crypt', 'occult', 'machine'], fx: ['none', 'film', 'crt'] },
};

// the arousal band a mood falls in (low, mid, high): the variant tables below weigh their kinds by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);

// ---------------------------------------------------------------------------------------------- checkpoint
// A border crossing from the side: a concrete wall with wire, a watchtower sweeping its light, a booth and a
// barrier, a queue shuffling up: men in hats, women in long coats, children, people with suitcases, one with a
// dog on a lead; in the lane in front, cars, trucks, buses and motorbikes pull up to the barrier and wait for it
// to lift. Once a bar the front of the queue is stamped through or sent back; the barrier that lets them through
// lets the vehicle through too. A section change changes the emblem on the wall, a drop brings a truck.
// a small dog at x with its feet on g, trotting with `ph`, facing dir
function drawDog(r, x, g, h, col, ph, dir, u) {
  const bl = h * 1.4, by = g - h * 0.55;
  r.rect(x - bl / 2, by - h * 0.35, bl, h * 0.4, col);
  r.disc(x + dir * (bl / 2 + h * 0.1), by - h * 0.4, h * 0.22, col);
  r.rect(x + dir * (bl / 2 + h * 0.05), by - h * 0.65, Math.max(1, u), h * 0.2, col);
  r.line(x - dir * bl * 0.5, by - h * 0.3, x - dir * (bl * 0.5 + h * 0.25), by - h * 0.65, col);
  for (const [k, p] of [[-0.4, 0], [-0.25, 1], [0.25, 1], [0.4, 0]]) { const sw = Math.sin(ph + p * Math.PI) * h * 0.2; r.line(x + k * bl, by, x + k * bl + sw, g, col); }
}

const FOLK = {
  hat: { h: 1, dress: { hat: true } }, // a man in a hat
  coat: { h: 1, dress: { coat: true }, skirt: true }, // a long coat down past the knees
  child: { h: 0.62, dress: { cap: true } }, // small, a cap, a quicker step
  case: { h: 1, dress: { hat: true, coat: true }, case: true }, // a suitcase in the near hand
  dog: { h: 1, dress: { coat: true }, dog: true }, // a dog on a lead, a step ahead
};
const FOLK_W = { hat: [3, 2, 2], coat: [2, 2, 2], child: [2, 2, 1], case: [2, 3, 3], dog: [1, 2, 2] };
// what pulls up in the lane: length and height in screen fractions
const VEHICLES = { car: { len: 0.2, h: 0.07 }, bike: { len: 0.12, h: 0.06 }, truck: { len: 0.3, h: 0.13 }, bus: { len: 0.36, h: 0.12 } };
const VEH_W = { car: [3, 2, 2], truck: [2, 2, 3], bus: [2, 2, 1], bike: [1, 2, 3] };

function person(rnd, x, slot, band) {
  const kind = rollW(rnd, FOLK_W, band);
  return { x, tx: x, slot, kind, h: (0.17 + rnd() * 0.05) * FOLK[kind].h, state: 'queue', dir: 1, ph: rnd() * TAU, moving: false };
}

const checkpoint = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { g: 0.78, booth: 0.56 + rnd() * 0.05, tower: 0.86 + rnd() * 0.06, emblem: Math.floor(rnd() * 3), sweep: rnd() * TAU,
      people: [], barrier: 0, open: 0, stamp: null, papers: [], flakes: [], proc: 0, bump: 0, veh: null, quiet: 0, puffs: [] });
    for (let i = 0; i < 7; i++) w.people.push(person(rnd, w.booth - 0.11 - i * 0.085, i, band));
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = w.g * N, band = bandOf(W.a);
    const slow = W.a < 0.5;
    const bar = beatLocked(f) ? f.beat.on && f.beat.count % (slow ? 8 : 4) === 0 : (w.proc += dt) > (slow ? 4 : 2);
    if (bar) {
      w.proc = 0;
      const front = w.people.find((p) => p.state === 'queue');
      if (front && Math.abs(front.x - front.tx) < 0.01) {
        const ok = rnd() < 0.2 + 0.6 * W.v;
        w.stamp = { ok, t: 0.6 };
        front.state = ok ? 'out' : 'back';
        front.dir = ok ? 1 : -1;
        if (ok) w.open = 2.2;
        const queue = w.people.filter((p) => p.state === 'queue');
        queue.forEach((p, i) => { p.tx = w.booth - 0.11 - i * 0.085; });
        const fresh = person(rnd, -0.2, queue.length, band);
        fresh.tx = w.booth - 0.11 - queue.length * 0.085;
        w.people.push(fresh);
      }
    }
    for (const h of hits) {
      if (isLow(h)) { w.bump = 1; s.shake = Math.max(s.shake, 0.4 * h.strength); }
      else if (h.kind === 'snare') w.sweep += 1.2;
      else if (isTonal(h)) { const front = w.people.find((p) => p.state === 'queue'); if (front) w.papers.push({ x: front.x, t: 0 }); }
    }
    if (f.section === 'change') w.emblem = (w.emblem + 1) % 3;
    const newVeh = (kind) => ({ kind, x: -0.5, v: 0.22 + 0.1 * W.a, state: 'in' });
    if (f.section === 'drop') { w.veh = newVeh('truck'); w.open = Math.max(w.open, 2.5); }
    else if (!w.veh && ((f.beat.on && f.beat.count % 16 === 0) || (w.quiet += dt) > 7)) { w.quiet = 0; w.veh = newVeh(rollW(rnd, VEH_W, band)); }
    for (const p of w.people) { // the legs in step with the travel: a tenth of the height per radian of stride, so the small ones step quicker
      const was = p.x;
      if (p.state === 'queue') p.x = follow(p.x, p.tx, dt, 0.6); else p.x += p.dir * dt * 0.22;
      const dx = Math.abs(p.x - was);
      p.moving = dx > 0.012 * dt;
      if (p.moving) p.ph += dx / (0.1 * p.h);
    }
    w.people = w.people.filter((p) => p.x > -0.3 && p.x < 1.3);
    w.open -= dt;
    w.barrier = follow(w.barrier, w.open > 0 ? 1 : 0, dt, 0.2);
    w.bump = Math.max(0, w.bump - dt * 4);
    w.sweep += dt * (0.4 + 0.6 * W.a);
    if (w.stamp && (w.stamp.t -= dt) <= 0) w.stamp = null;
    w.papers = w.papers.filter((p) => (p.t += dt * 3) < 1);

    // the wall, the wire, the banner
    const wallTop = 0.47 * N;
    r.rect(0, wallTop, N, g - wallTop, LMID);
    r.rect(0, wallTop, N, Math.max(1, u), DARK);
    for (let x = 0; x < N; x += 4 * u) { r.line(x, wallTop - 2 * u, x + 2 * u, wallTop - 5 * u, DARK); r.line(x + 2 * u, wallTop - 5 * u, x + 4 * u, wallTop - 2 * u, DARK); }
    for (let x = 6 * u; x < N; x += 24 * u) r.rect(x, wallTop - 6 * u, Math.max(1, u), 6 * u, DARK);
    const bx = 0.07 * N, by = wallTop + 0.04 * N, bw = 0.2 * N, bh = 0.18 * N;
    r.rect(bx, by, bw, bh, HOT);
    if (w.emblem === 0) { r.frame(Math.round(bx + bw * 0.3), Math.round(by + bh * 0.25), Math.round(bw * 0.4), Math.round(bh * 0.5), BRIGHT); r.rect(bx + bw * 0.45, by + bh * 0.45, bw * 0.1, bh * 0.1, BRIGHT); }
    else if (w.emblem === 1) for (let k = 0; k < 3; k++) r.rect(bx + bw * 0.2, by + bh * (0.25 + k * 0.2), bw * 0.6, bh * 0.08, BRIGHT);
    else { r.stroke(bx + bw * 0.25, by + bh * 0.7, bx + bw * 0.5, by + bh * 0.3, 1.5 * u, BRIGHT); r.stroke(bx + bw * 0.5, by + bh * 0.3, bx + bw * 0.75, by + bh * 0.7, 1.5 * u, BRIGHT); }
    // the watchtower and its light
    const tx = w.tower * N, cabY = 0.2 * N;
    r.rect(tx - 5 * u, cabY + 9 * u, 1.5 * u, g - cabY - 9 * u, DARK);
    r.rect(tx + 3.5 * u, cabY + 9 * u, 1.5 * u, g - cabY - 9 * u, DARK);
    for (let y = cabY + 14 * u; y < g - 6 * u; y += 12 * u) { r.line(tx - 4 * u, y, tx + 4 * u, y + 8 * u, DARK); r.line(tx + 4 * u, y, tx - 4 * u, y + 8 * u, DARK); }
    r.rect(tx - 7 * u, cabY, 14 * u, 9 * u, DARK);
    r.rect(tx - 5 * u, cabY + 2 * u, 10 * u, 4 * u, BRIGHT);
    r.rect(tx - 8 * u, cabY - 2 * u, 16 * u, 2 * u, DARK);
    const la = 2.0 + 0.45 * Math.sin(w.sweep), ax = tx - 7 * u, ay = cabY + 6 * u;
    for (let y = Math.ceil(ay + 2); y < g; y += 2) {
      const d = (y - ay) / Math.sin(la), xc = ax + Math.cos(la) * d, half = d * 0.11;
      r.rect(xc - half, y, 2 * half, 1, BRIGHT);
    }
    // the booth
    const B = w.booth * N, bw2 = 0.13 * N, bTop = g - 0.3 * N;
    r.rect(B, bTop, bw2, g - bTop, DARK);
    r.rect(B + 2 * u, bTop + 3 * u, bw2 - 4 * u, 0.12 * N, BRIGHT);
    r.disc(B + bw2 / 2, bTop + 7.5 * u, 2.6 * u, DARK);
    r.rect(B + bw2 / 2 - 4 * u, bTop + 10 * u, 8 * u, 5 * u, DARK);
    r.rect(B - 2 * u, bTop + 0.12 * N + 3 * u, bw2 + 4 * u, 1.5 * u, MID);
    r.rect(B - 2 * u, bTop - 2 * u, bw2 + 4 * u, 2 * u, MID);
    r.rect(B + bw2 / 2 - u, bTop - 4 * u, 2 * u, 2 * u, f.beat.pulse > 0.4 ? HOT : MID);
    targets.push({ x: B + bw2 / 2 - 4 * u, y: bTop + 4 * u, w: 8 * u, h: 11 * u });
    // the barrier
    const px = B + bw2 + 3 * u, py = g - 5 * u, len = 0.2 * N, ang = -1.45 * ease(w.barrier) + (rnd() - 0.5) * 0.1 * w.bump;
    r.rect(px - 1.5 * u, py - 2 * u, 3 * u, g - py + 2 * u, DARK);
    for (let k = 0; k < 6; k++) {
      const a = k / 6, b = (k + 1) / 6;
      r.stroke(px + Math.cos(ang) * len * a, py + Math.sin(ang) * len * a, px + Math.cos(ang) * len * b, py + Math.sin(ang) * len * b, 2 * u, k % 2 ? HOT : BRIGHT);
    }
    // the ground, the queue, the papers, the stamp
    r.rect(0, g, N, N - g, MID);
    r.rect(0, g, N, Math.max(1, u), DARK);
    for (const p of w.people) {
      const K = FOLK[p.kind], x = p.x * N, ph = p.moving ? p.ph : 0, h = p.h * N;
      r.rect(x - h * 0.2, g, h * 0.4, Math.max(1, u), DARK);
      if (K.dog) { // the dog a step ahead on its lead
        const dx = x + p.dir * h * 0.45, dh = h * 0.28;
        drawDog(r, dx, g, dh, FIG, ph * 1.4, p.dir, u);
        r.line(x + p.dir * h * 0.2, g - h * 0.45, dx - p.dir * dh * 0.3, g - dh * 0.8, FIG);
      }
      const J = walker(r, x, g, h, FIG, ph, p.dir, K.dress);
      if (K.skirt) r.poly([[x - J.hw * 1.2, g - h * 0.42], [x + J.hw * 1.2, g - h * 0.42], [x + J.hw * 1.6, g - h * 0.14], [x - J.hw * 1.6, g - h * 0.14]], FIG);
      if (K.case) { const sw = Math.sin(ph) * 1.5 * u, cx = J.sx + p.dir * J.hw * 0.4 + sw, cy = J.sy + h * 0.36; r.rect(cx - h * 0.1, cy, h * 0.2, h * 0.16, DARK); r.rect(cx - h * 0.04, cy - u, h * 0.08, Math.max(1, u), LMID); }
      targets.push({ x: x - h * 0.22, y: g - h, w: h * 0.44, h });
    }
    for (const p of w.papers) r.rect(lerp(p.x * N, B + 3 * u, p.t), lerp(g - 0.1 * N, bTop + 9 * u, p.t) - 3 * u * Math.sin(Math.PI * p.t), 3 * u, 2 * u, BRIGHT);
    if (w.stamp) {
      const cx = B + bw2 / 2, cy = bTop + 9 * u, k = w.stamp.t > 0.5 ? lerp(1.8, 1, (0.6 - w.stamp.t) / 0.1) : 1;
      if (w.stamp.ok) { r.ring(cx, cy, 6 * u * k, 1.5 * u, COOL); r.rect(cx - 3 * u * k, cy - 0.7 * u, 6 * u * k, 1.4 * u, COOL); }
      else { r.frame(Math.round(cx - 6 * u * k), Math.round(cy - 4 * u * k), Math.round(12 * u * k), Math.round(8 * u * k), HOT); r.stroke(cx - 5 * u * k, cy + 3 * u * k, cx + 5 * u * k, cy - 3 * u * k, u, HOT); }
    }
    // the lane in front: the vehicle rolls up to the barrier, waits for it, goes through
    const ly = g + 0.07 * N;
    for (let x = 0; x < N; x += 8 * u) r.rect(x, ly + 2 * u, 4 * u, Math.max(1, u), LMID);
    if (w.veh) {
      const v = w.veh, K = VEHICLES[v.kind], L = K.len * N, H = K.h * N, stopX = px / N - 0.015 - K.len;
      if (v.state === 'in') { v.x = Math.min(stopX, v.x + v.v * dt); if (v.x >= stopX - 1e-6) v.state = 'wait'; }
      else if (v.state === 'wait') { if (w.barrier > 0.8) v.state = 'go'; }
      else v.x += v.v * 1.3 * dt;
      if (v.state !== 'wait' && rnd() < dt * 8) w.puffs.push({ x: v.x * N - u, y: ly - 2 * u, life: 0.8 });
      const vx = v.x * N, wheelR = H * 0.22, body = DARK, glass = LMID;
      const wheel = (x) => { r.disc(x, ly - wheelR, wheelR, BLACK); r.disc(x, ly - wheelR, wheelR * 0.45, MID); };
      if (v.kind === 'car') {
        r.rect(vx, ly - H * 0.55, L, H * 0.4, body);
        r.rect(vx + L * 0.25, ly - H, L * 0.5, H * 0.5, body);
        r.rect(vx + L * 0.3, ly - H * 0.95, L * 0.18, H * 0.35, glass);
        r.rect(vx + L * 0.52, ly - H * 0.95, L * 0.18, H * 0.35, glass);
        wheel(vx + L * 0.2); wheel(vx + L * 0.8);
      } else if (v.kind === 'bike') {
        wheel(vx + L * 0.15); wheel(vx + L * 0.85);
        r.line(vx + L * 0.15, ly - wheelR, vx + L * 0.5, ly - H * 0.7, body);
        r.line(vx + L * 0.85, ly - wheelR, vx + L * 0.5, ly - H * 0.7, body);
        r.rect(vx + L * 0.3, ly - H * 0.75, L * 0.45, H * 0.25, body);
        walker(r, vx + L * 0.45, ly - H * 0.6, H * 1.3, FIG, 0, 1, { cap: true });
        r.line(vx + L * 0.55, ly - H * 1.3, vx + L * 0.85, ly - H * 0.9, FIG);
      } else if (v.kind === 'truck') {
        r.rect(vx, ly - H * 0.95, L * 0.62, H * 0.8, MID);
        r.rect(vx + L * 0.64, ly - H * 0.8, L * 0.36, H * 0.65, body);
        r.rect(vx + L * 0.72, ly - H * 0.75, L * 0.2, H * 0.3, glass);
        r.rect(vx, ly - H * 0.2, L, H * 0.08, body);
        wheel(vx + L * 0.12); wheel(vx + L * 0.3); wheel(vx + L * 0.85);
      } else {
        r.rect(vx, ly - H * 0.95, L, H * 0.8, body);
        for (let k = 0; k < 6; k++) r.rect(vx + L * (0.06 + k * 0.155), ly - H * 0.85, L * 0.11, H * 0.3, glass);
        r.rect(vx, ly - H, L, Math.max(1, u), LMID);
        wheel(vx + L * 0.15); wheel(vx + L * 0.85);
      }
      r.rect(vx + L - 1.5 * u, ly - H * 0.45, 1.5 * u, 2 * u, BRIGHT);
      r.rect(vx, ly - H * 0.45, 1.5 * u, 2 * u, v.state === 'wait' ? HOT : HOT + DIM);
      targets.push({ x: vx, y: ly - H, w: L, h: H });
      if (v.x > 1.3) w.veh = null;
    }
    w.puffs = w.puffs.filter((p) => { p.y -= dt * 4 * u; p.x -= dt * 3 * u; p.life -= dt; r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), LMID + DIM); return p.life > 0; });
    if (W.a < 0.45) snowfall(W, w.flakes, Math.round(40 * u), 0.07, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- corridor
// First person through a maze of brick corridors, a step on every beat. An arsenal: a saw, a pistol, a shotgun, a
// chaingun, a rocket launcher, a plasma gun, each firing on its own kind of hit; a section change hands out the
// next one, a drop the heavy one. A bestiary: shamblers, imps that throw fire, floating heads, crawlers, bruisers
// that charge, swarms; the mood decides who comes. The hellish ones with the arousal: succubi that dash on a snare,
// horned knights with green fire, flaming skulls that charge and bite, summoners that raise the splats under a
// column of light, fat tanks with two cannons, spectres barely there, and the cyber boss that only a drop brings,
// with rockets. The walls are brick, flesh, bone or hell: torches, a lava floor, pentagram pads, skull heaps.
// Health and ammo lie about the maze, a status bar with a face that takes it all personally, as these had.
function maze(rnd, G) {
  const cells = new Uint8Array(G * G).fill(1), route = [[1, 1]], stack = [[1, 1]];
  cells[G + 1] = 0;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1], opts = [];
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const nx = x + dx, ny = y + dy;
      if (nx > 0 && ny > 0 && nx < G - 1 && ny < G - 1 && cells[ny * G + nx]) opts.push([nx, ny, dx, dy]);
    }
    if (!opts.length) { stack.pop(); if (stack.length) route.push(stack[stack.length - 1]); continue; }
    const [nx, ny, dx, dy] = pick(rnd, opts);
    cells[(y + dy / 2) * G + x + dx / 2] = 0;
    cells[ny * G + nx] = 0;
    route.push([nx, ny]);
    stack.push([nx, ny]);
  }
  return { cells, route };
}

// the silhouettes: u across (-1..1), v up (0 feet..1 head), lit all over when hit
function shamblerShape(u, v, fl, ph) {
  const au = Math.abs(u);
  if (v > 0.68 && v < 0.98 && au < 0.42) return !fl && v > 0.8 && v < 0.88 && au > 0.12 && au < 0.26 ? HOT : fl ? BRIGHT : MID;
  if (v > 0.22 && v <= 0.68 && au < 0.58 + 0.12 * (0.68 - v)) return fl ? BRIGHT : au < 0.2 && v > 0.35 && v < 0.6 ? DARK : MID;
  const sw = 0.05 * Math.sin(ph) * Math.sign(u);
  if (v > 0.3 + sw && v < 0.66 + sw && au >= 0.58 && au < 0.78) return fl ? BRIGHT : DARK;
  if (v <= 0.22 && au > 0.1 && au < 0.4) return fl ? BRIGHT : DARK;
  return -1;
}
function impShape(u, v, fl, ph) {
  const au = Math.abs(u), arm = 0.5 + 0.5 * Math.sin(ph); // the arms go up to throw
  if (v > 0.9 && au > 0.22 && au < 0.38) return fl ? BRIGHT : DARK;
  if (v > 0.7 && v <= 0.92 && au < 0.3) return !fl && v > 0.8 && v < 0.87 && au > 0.08 && au < 0.2 ? HOT : fl ? BRIGHT : MID;
  if (v > 0.3 && v <= 0.7 && au < 0.38) return fl ? BRIGHT : au < 0.1 ? DARK : MID;
  if (au >= 0.38 && au < 0.9 && Math.abs(v - (0.45 + 0.35 * arm)) < 0.07 + 0.08 * (au - 0.38)) return fl ? BRIGHT : DARK;
  if (v <= 0.3 && au > 0.08 && au < 0.34) return fl ? BRIGHT : DARK;
  return -1;
}
function floaterShape(u, v, fl, ph) {
  const vv = v - 0.08 * Math.sin(ph), au = Math.abs(u), d = Math.hypot(u * 0.9, (vv - 0.55) * 2);
  if (vv > 0.88 && au > 0.18 && au < 0.32) return fl ? BRIGHT : DARK;
  if (d > 0.84) return -1;
  if (fl) return BRIGHT;
  const e = Math.hypot(u * 0.9, (vv - 0.62) * 2);
  if (e < 0.12) return HOT;
  if (e < 0.3) return BRIGHT;
  if (vv > 0.28 && vv < 0.38 && au < 0.3) return DARK;
  return d > 0.7 ? DARK : MID;
}
function crawlerShape(u, v, fl, ph) {
  const au = Math.abs(u), body = Math.hypot(u / 0.62, (v - 0.3) / 0.26) < 1;
  if (body) return fl ? BRIGHT : au < 0.25 && v > 0.33 && v < 0.42 ? HOT : MID;
  if (v < 0.35 && au > 0.5 && au < 1 && (au * 5 + v * 6 + ph) % 1.6 < 0.5) return fl ? BRIGHT : DARK; // the legs
  return -1;
}
function bruiserShape(u, v, fl, ph) {
  const au = Math.abs(u), st = 0.04 * Math.sin(ph);
  if (v > 0.84 && au > 0.3 && au < 0.6 && v < 0.84 + 0.4 * (au - 0.3)) return fl ? BRIGHT : LMID;
  if (v > 0.74 && v < 0.96 && au < 0.3) return !fl && v > 0.84 && v < 0.9 && au > 0.08 && au < 0.22 ? HOT : fl ? BRIGHT : MID;
  if (v > 0.26 && v <= 0.74 && au < 0.7) return fl ? BRIGHT : au < 0.3 && (v * 9) % 2 < 1 ? DARK : MID;
  if (v > 0.3 + st * Math.sign(u) && v < 0.72 && au >= 0.7 && au < 0.95) return fl ? BRIGHT : DARK;
  if (v <= 0.26 && au > 0.12 && au < 0.5) return fl ? BRIGHT : DARK;
  return -1;
}
function swarmShape(u, v, fl, ph) {
  for (let k = 0; k < 3; k++) {
    const cu = (k - 1) * 0.62, cv = 0.5 + 0.22 * Math.sin(ph + k * 2.1), du = Math.abs(u - cu), dv = v - cv;
    const flap = 0.06 + 0.12 * Math.abs(Math.sin(ph * 3 + k));
    if (du < 0.1 && Math.abs(dv) < 0.12) return fl ? BRIGHT : du < 0.05 && dv > 0.02 && dv < 0.06 ? HOT : DARK;
    if (du >= 0.1 && du < 0.3 && Math.abs(dv - (du - 0.1) * flap * 4) < 0.05) return fl ? BRIGHT : DARK;
  }
  return -1;
}

// the hellish ones; `foe` is the thing itself, for the shapes that change with what it is doing
function succubusShape(u, v, fl, ph, foe) {
  const au = Math.abs(u), fold = foe && foe.dash > 0, flap = 0.08 * Math.sin(ph * 0.7);
  if (v > 0.92 && au > 0.08 && au < 0.2 && Math.abs(v - (0.9 + (au - 0.08) * 0.8)) < 0.06) return fl ? BRIGHT : DARK; // the horns
  if (v > 0.76 && v <= 0.92 && au < 0.12) return !fl && v > 0.83 && v < 0.88 && au > 0.03 && au < 0.09 ? HOT : fl ? BRIGHT : MID;
  if (v > 0.4 && v <= 0.76 && au < 0.12 + 0.04 * Math.sin(v * 9)) return fl ? BRIGHT : MID; // a slim trunk
  if (v <= 0.4 && v > 0.04 && au > 0.02 && au < 0.11) return fl ? BRIGHT : DARK; // the legs, trailing
  if (u > 0.1 && u < 0.6) { const tv = 0.3 - (u - 0.1) * 0.3 + 0.12 * (u - 0.1) * Math.sin(ph); if (u > 0.52 && Math.abs(v - tv) < 0.07) return fl ? BRIGHT : HOT; if (Math.abs(v - tv) < 0.035) return fl ? BRIGHT : DARK; } // the tail and its tip
  if (fold) return au >= 0.12 && au < 0.3 && v > 0.3 && v < 0.85 ? (fl ? BRIGHT : DARK) : -1; // wings folded for the dash
  if (au >= 0.12) { const k = (au - 0.12) / 0.88, top = 0.74 + 0.22 * k + flap * k, bot = 0.4 + 0.2 * k + flap * k + 0.07 * Math.abs(Math.sin(k * 9.4)); if (v < top && v > bot) return fl ? BRIGHT : v > top - 0.06 ? MID : DARK; } // the wings spread
  return -1;
}
function knightShape(u, v, fl, ph) {
  const au = Math.abs(u), arm = 0.5 + 0.5 * Math.sin(ph);
  if (v > 0.86 && au > 0.16 && au < 0.36 && Math.abs(v - (0.88 + (au - 0.16) * 0.6)) < 0.06) return fl ? BRIGHT : LMID; // the horns on the helmet
  if (v > 0.72 && v <= 0.9 && au < 0.18) return !fl && v > 0.78 && v < 0.83 && au < 0.13 ? (au > 0.04 && au < 0.1 ? HOT : DARK) : fl ? BRIGHT : LMID; // the helmet, a slit with the eyes in it
  if (v > 0.6 && v <= 0.74 && au < 0.92 && v < 0.74 - 0.1 * Math.max(0, au - 0.6)) return fl ? BRIGHT : au > 0.4 && v > 0.7 ? DARK : LMID; // the pauldrons
  if (v > 0.26 && v <= 0.6 && au < 0.46) return fl ? BRIGHT : au < 0.05 || Math.abs(v - 0.44) < 0.02 ? DARK : MID; // the breastplate and its seams
  if (v > 0.2 && v <= 0.62 && au >= 0.46 && au < 0.7 && Math.abs(v - (0.3 + 0.3 * arm) - (au - 0.46) * 0.4) < 0.1) return fl ? BRIGHT : DARK; // the arms, the throwing one rising
  if (v <= 0.26 && au > 0.1 && au < 0.42) return fl ? BRIGHT : DARK;
  return -1;
}
function skullShape(u, v, fl, ph) {
  const au = Math.abs(u), d = Math.hypot(u / 0.62, (v - 0.42) / 0.36);
  if (d < 1) {
    if (fl) return BRIGHT;
    if (Math.hypot(au - 0.24, (v - 0.5) / 1.2) < 0.11) return DARK; // the sockets
    if (v < 0.22 && au < 0.3) return (au * 12) % 2 < 1 ? DARK : LMID; // the teeth
    if (v < 0.3 && au < 0.06) return DARK;
    return LMID;
  }
  const lick = 0.7 + 0.3 * Math.abs(Math.sin(ph * 4 + u * 5)); // the flames round it, licking up
  if (v > 0.5 && au < 1 && v < 0.5 + 0.5 * lick * (1 - au * 0.9)) return fl ? BRIGHT : v > 0.92 * lick || (au > 0.4 && (ph * 3 + v * 10) % 2 < 1) ? BRIGHT : HOT;
  return -1;
}
function summonerShape(u, v, fl, ph, foe) {
  const au = Math.abs(u), cast = foe && foe.cast > 0;
  if (v > 0.82 && v <= 0.96 && au < 0.1) return !fl && v > 0.87 && v < 0.91 && au > 0.02 && au < 0.07 ? HOT : fl ? BRIGHT : MID; // a narrow head
  if (v > 0.08 && v <= 0.82 && au < 0.07 + 0.16 * (0.82 - v)) return fl ? BRIGHT : au < 0.03 && v < 0.7 ? DARK : MID; // the robe, widening to the hem
  if (au > 0.08 && au < 0.52 && Math.abs(v - (0.76 + (au - 0.08) * 0.55 + 0.03 * Math.sin(ph))) < 0.045) return fl ? BRIGHT : au > 0.44 && cast ? BRIGHT : DARK; // the arms up, the hands lit while it casts
  return -1;
}
function fattyShape(u, v, fl, ph) {
  const au = Math.abs(u), body = Math.hypot(u / 0.78, (v - 0.46) / 0.36) < 1;
  if (v > 0.8 && v <= 0.94 && au < 0.16) return !fl && v > 0.85 && v < 0.9 && au > 0.04 && au < 0.12 ? HOT : fl ? BRIGHT : MID; // a small head on top
  if (body) return fl ? BRIGHT : (v < 0.4 && au < 0.3 && Math.abs(v - 0.3) < 0.025) || au > 0.6 ? DARK : MID; // the belly
  if (v > 0.44 && v < 0.6 && au >= 0.74 && au < 1) return fl ? BRIGHT : au > 0.94 && Math.sin(ph * 6) > 0 ? HOT : DARK; // the arm cannons, the muzzles glowing
  if (v <= 0.14 && au > 0.14 && au < 0.5) return fl ? BRIGHT : DARK; // stubby legs
  return -1;
}
function cyberShape(u, v, fl, ph) {
  const au = Math.abs(u), st = 0.03 * Math.sin(ph);
  if (v > 0.74 && v <= 0.94 && au < 0.26) return fl ? BRIGHT : Math.hypot(u - 0.08, (v - 0.85) * 1.4) < 0.08 ? HOT : v > 0.9 || au > 0.22 ? DARK : LMID; // a boxy head, the one eye
  if (v > 0.7 && v <= 0.82 && u < -0.5 && u > -1) return fl ? BRIGHT : u < -0.9 ? BRIGHT : v > 0.79 || v < 0.73 ? DARK : MID; // the tube on the shoulder
  if (v > 0.28 && v <= 0.76 && au < 0.58) return fl ? BRIGHT : (au * 5) % 1 < 0.12 || (v * 7) % 1 < 0.12 ? DARK : MID; // the plated body
  if (v > 0.32 && v < 0.7 && au >= 0.58 && au < 0.8) return fl ? BRIGHT : DARK; // thick arms
  if (v <= 0.28 && v > 0.06 && au > 0.12 + st * Math.sign(u) && au < 0.5) return fl ? BRIGHT : DARK; // piston legs
  if (v <= 0.06 && au < 0.6) return fl ? BRIGHT : DARK + DIM;
  return -1;
}

const FOES = {
  shambler: { size: 1, wide: 1, speed: 0.1, hp: 3, float: 0, shape: shamblerShape },
  imp: { size: 1.05, wide: 0.9, speed: 0.14, hp: 2, float: 0, throws: true, cd: [2, 3], shape: impShape },
  floater: { size: 0.8, wide: 1.1, speed: 0.07, hp: 2, float: 0.35, shape: floaterShape },
  crawler: { size: 0.6, wide: 1.6, speed: 0.22, hp: 2, float: 0, shape: crawlerShape },
  bruiser: { size: 1.45, wide: 1.15, speed: 0.06, hp: 7, float: 0, rush: true, shape: bruiserShape },
  swarm: { size: 0.7, wide: 1.5, speed: 0.2, hp: 1, float: 0.45, shape: swarmShape },
  succubus: { size: 1, wide: 1.4, speed: 0.16, hp: 3, float: 0.25, dash: true, shape: succubusShape }, // slim, winged, horned, a tail; hovers in arcs, dashes at us on a snare with the wings folded
  knight: { size: 1.3, wide: 1.1, speed: 0.1, hp: 6, float: 0, throws: true, cd: [3, 2], col: COOL, shape: knightShape }, // armoured, broad, a horned helmet; throws green fire
  skull: { size: 0.5, wide: 1, speed: 0.1, hp: 1, float: 0.4, charge: true, shape: skullShape }, // a small flaming skull: charges in a straight line once it sees us, bites on contact and bursts
  summoner: { size: 1.2, wide: 0.9, speed: 0.08, hp: 4, float: 0, keep: true, summons: true, shape: summonerShape }, // tall and thin, arms up; keeps three to five cells off and raises the splats
  fatty: { size: 1.1, wide: 1.4, speed: 0.05, hp: 8, float: 0, throws: true, twin: true, cd: [3, 0], shape: fattyShape }, // a wide slow tank: a pair of fireballs from the arm cannons every three seconds
  spectre: { size: 1, wide: 1, speed: 0.1, hp: 3, float: 0, shimmer: true, shape: shamblerShape }, // the shambler barely there: a shimmer of pixels until a hit lights it whole
  cyber: { size: 1.8, wide: 1.1, speed: 0.04, hp: 24, float: 0, throws: true, boss: true, cd: [2, 0], shape: cyberShape }, // the boss: boxy, one hot eye, a tube on the shoulder; rockets every two seconds; only a drop brings it
};
// who comes, by arousal band (low, mid, high); the hellish kinds weigh toward the top, the cyber never comes on its own
const FOE_W = { shambler: [3, 2, 1], floater: [2, 2, 1], imp: [1, 3, 2], crawler: [1, 2, 3], bruiser: [0, 1, 2], swarm: [0, 1, 3],
  succubus: [0, 2, 3], knight: [0, 1, 3], skull: [1, 2, 3], summoner: [0, 1, 2], fatty: [0, 1, 2], spectre: [1, 2, 2] };
// the dressing, by arousal band: the brick of old, walls of flesh, of bone (torches, skull heaps), of hell (torches,
// a lava floor, pentagram pads); the shading by distance is a ramp per theme, the marks on the walls are the theme's
const THEME_W = { brick: [3, 2, 1], flesh: [1, 2, 2], bone: [2, 2, 1], hell: [0, 2, 3] };
const RAMPS = { brick: [DARK, MID, LMID, BRIGHT], flesh: [DARK, MID, LMID, BRIGHT], bone: [DARK, MID, LMID, BRIGHT], hell: [DARK + DIM, DARK, DARK, MID] };
// a mark on wall column x at height y, h tall, clipped to the wall's run y0..y1
function wallMark(r, x, y0, y1, y, h, c) { const a = Math.max(y0, Math.round(y)), b = Math.min(y1, Math.max(a + 1, Math.round(y + h))); if (b > a) r.rect(x, a, 1, b - a, c); }

// what a weapon fires on, how often, and what it does; the arsenals, by arousal band
const WEAPONS = {
  saw: { on: 'any', rate: 0.05, reach: 1.4, dmg: 1 },
  pistol: { on: 'low', rate: 0.14, dmg: 1 },
  shotgun: { on: 'low', rate: 0.35, dmg: 3, spread: 0.3 },
  chaingun: { on: 'any', rate: 0.07, dmg: 1 },
  rocket: { on: 'low', rate: 0.5, dmg: 4, shot: 'rocket' },
  plasma: { on: 'tonal', rate: 0.09, dmg: 1, shot: 'plasma' },
};
const ARSENAL = [['pistol', 'saw', 'shotgun'], ['shotgun', 'chaingun', 'pistol', 'plasma'], ['chaingun', 'rocket', 'plasma', 'shotgun']];

const spot = (w, rnd) => { const c = pick(rnd, w.route); return { x: c[0] + 0.5 + (rnd() - 0.5) * 0.4, y: c[1] + 0.5 + (rnd() - 0.5) * 0.4 }; };

const newFoe = (kind, x, y, rnd) => ({ kind, x, y, hp: FOES[kind].hp, flash: 0, ph: rnd() * TAU, cool: 1 + rnd() * 2, dash: 0, cast: 0, run: null, bit: false });
function spawnFoe(w, rnd, a) {
  const kind = rollW(rnd, FOE_W, bandOf(a));
  for (let k = 0; k < 60; k++) {
    const x = 1 + 2 * Math.floor(rnd() * ((w.G - 1) / 2)), y = 1 + 2 * Math.floor(rnd() * ((w.G - 1) / 2));
    if (!w.cells[y * w.G + x] && Math.hypot(x + 0.5 - w.px, y + 0.5 - w.py) > 4) {
      w.foes.push(newFoe(kind, x + 0.5, y + 0.5, rnd));
      return;
    }
  }
}

function drawWeapon(r, name, wx, wy, u, rec, flash, t, rnd) {
  switch (name) {
    case 'saw': { // a long toothed blade held low from the right, shivering while it runs
      const j = flash > 0 ? (rnd() - 0.5) * 2 * u : 0, x1 = wx - 8 * u + j, y1 = wy - 30 * u;
      r.stroke(wx + 12 * u, wy, x1, y1, 5 * u, MID);
      for (let k = 0; k < 9; k++) { const q = k / 9; r.rect(lerp(wx + 12 * u, x1, q) - 3.5 * u, lerp(wy, y1, q) - 2 * u, 2 * u, 2 * u, (k + Math.floor(t * 30)) % 2 ? BRIGHT : DARK); }
      r.rect(wx + 8 * u, wy - 8 * u, 10 * u, 8 * u, DARK);
      r.rect(wx + 10 * u, wy - 6 * u, 6 * u, 4 * u, LMID);
      break;
    }
    case 'pistol':
      r.rect(wx - 3 * u, wy - 16 * u, 6 * u, 16 * u, DARK);
      r.rect(wx - 3 * u, wy - 16 * u, 1.5 * u, 16 * u, LMID);
      r.rect(wx - 4 * u, wy - 19 * u, 8 * u, 3 * u, MID);
      r.rect(wx + 3 * u, wy - 7 * u, 4 * u, 7 * u, DARK);
      break;
    case 'shotgun': // two bores, a pump that slides back after the shot
      r.rect(wx - 6 * u, wy - 24 * u, 12 * u, 24 * u, MID);
      r.rect(wx - 6 * u, wy - 24 * u, 2 * u, 24 * u, LMID);
      for (const k of [-1, 1]) r.disc(wx + k * 2.8 * u, wy - 24 * u, 2 * u, DARK);
      r.rect(wx - 8 * u, wy - 12 * u + rec * 6 * u, 16 * u, 5 * u, DARK);
      r.rect(wx - 8 * u, wy - 12 * u + rec * 6 * u, 16 * u, 1.5 * u, LMID);
      break;
    case 'chaingun': { // three barrels that turn while it fires, a belt of ammo to the side
      const ph = Math.floor(t * 24) % 3;
      for (let k = 0; k < 3; k++) r.rect(wx - 6 * u + ((k + ph) % 3) * 4.5 * u, wy - 26 * u + (k === 1 ? 2 * u : 0), 3 * u, 14 * u, k === 1 ? LMID : MID);
      r.rect(wx - 9 * u, wy - 13 * u, 18 * u, 13 * u, DARK);
      r.rect(wx - 9 * u, wy - 13 * u, 18 * u, 1.5 * u, LMID);
      for (let k = 0; k < 5; k++) r.rect(wx + 10 * u + k * 2.5 * u, wy - 9 * u + k * 1.5 * u, 1.5 * u, 4 * u, COOL);
      break;
    }
    case 'rocket': // a fat tube with the warhead showing until it is away
      r.rect(wx - 8 * u, wy - 26 * u, 16 * u, 26 * u, DARK);
      r.rect(wx - 8 * u, wy - 26 * u, 2.5 * u, 26 * u, MID);
      r.ring(wx, wy - 26 * u, 6 * u, 2 * u, MID);
      r.disc(wx, wy - 26 * u, 3.5 * u, rec > 0.5 ? BLACK : HOT);
      r.rect(wx + 8 * u, wy - 10 * u, 5 * u, 10 * u, MID);
      break;
    default: // plasma: a boxy gun with glowing coils
      r.rect(wx - 7 * u, wy - 22 * u, 14 * u, 22 * u, DARK);
      for (let k = 0; k < 4; k++) r.rect(wx - 8 * u, wy - 20 * u + k * 4.5 * u, 16 * u, 2 * u, (k + Math.floor(t * 10)) % 2 ? COOL : COOL + DIM);
      r.disc(wx, wy - 23 * u, 4 * u, flash > 0 ? BRIGHT : COOL);
  }
}

const corridor = {
  init(W) {
    const { w, rnd, N } = W, G = 15, { cells, route } = maze(rnd, G), band = bandOf(W.a), theme = rollW(rnd, THEME_W, band);
    Object.assign(w, { G, cells, route, prog: 0, target: 0, px: 1.5, py: 1.5, head: 0, recoil: 0, flash: 0, zbuf: new Float32Array(N), foes: [], booms: [], keys: [0, 0, 0],
      arsenal: [...ARSENAL[band]], weapon: Math.floor(rnd() * ARSENAL[band].length), swapT: 0, lastShot: -1, shots: [], puffs: [], gore: [], items: [], pillars: [], marks: [],
      theme, hurt: 0, grin: 0, health: 1, ammo: 1, kills: 0, tracer: null, hold: 0, near: 9 });
    for (let i = 0; i < 4 + Math.round(4 * W.a); i++) spawnFoe(w, rnd, W.a);
    for (const kind of ['health', 'ammo', 'armor', 'health']) w.items.push({ kind, ...spot(w, rnd), wait: 0 });
    if (theme === 'hell' || theme === 'bone') { // pentagram pads or skull heaps on some of the route's cells
      const seen = new Set();
      for (let i = 3; i < route.length && w.marks.length < 10; i += 5) { const c = route[i], key = c[0] * G + c[1]; if (!seen.has(key)) { seen.add(key); w.marks.push({ x: c[0] + 0.5, y: c[1] + 0.5, n: 3 + Math.floor(rnd() * 3) }); } }
    }
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, { G, cells, route, theme } = w, band = bandOf(W.a);
    if (w.zbuf.length !== N) w.zbuf = new Float32Array(N);
    const zbuf = w.zbuf, FOV = 1.1, horizon = 0.44 * N, barY = Math.round(0.88 * N), total = route.length - 1, beatS = f.bpm ? 60 / f.bpm : 0.5;
    const bps = f.bpm ? f.bpm / 60 : 2, per = W.a > 0.55 ? 1 : 0.5;
    const stand = w.near < 3.5 && w.hold < 4; // something close in the crosshair: stand and fight it, four beats at most, then walk on
    if (beatLocked(f)) { if (f.beat.on) { if (stand) w.hold++; else w.target += per; } } else if (stand) w.hold += dt * bps; else w.target += dt * bps * per;
    if (w.near >= 3.5) w.hold = 0;
    w.prog = follow(w.prog, w.target, dt, 0.12);
    const at = (q) => {
      let p = ((q % (2 * total)) + 2 * total) % (2 * total);
      if (p > total) p = 2 * total - p;
      const i = Math.min(total - 1, Math.floor(p)), fr = p - i, a = route[i], b = route[i + 1];
      return [lerp(a[0], b[0], fr) + 0.5, lerp(a[1], b[1], fr) + 0.5];
    };
    const [px, py] = at(w.prog), [nx, ny] = at(w.prog + 0.1);
    w.px = px; w.py = py;
    if (Math.hypot(nx - px, ny - py) > 1e-4) w.head = followAngle(w.head, Math.atan2(ny - py, nx - px), dt, 0.22);
    const head = w.head;
    // the arsenal: a section change hands out the next weapon, a drop the heavy one and a wave to use it on
    if (f.section === 'change') { w.weapon = (w.weapon + 1) % w.arsenal.length; w.swapT = 0.5; }
    if (f.section === 'drop') {
      const heavy = rnd() < 0.5 ? 'rocket' : 'plasma';
      if (!w.arsenal.includes(heavy)) w.arsenal.push(heavy);
      w.weapon = w.arsenal.indexOf(heavy);
      w.swapT = 0.5;
      for (let i = 0; i < 3; i++) spawnFoe(w, rnd, Math.max(W.a, 0.7));
      if (W.a > 0.6 && !w.foes.some((foe) => foe.kind === 'cyber')) { // the boss comes down in a column of light up the route, at the spot in sight from most of the way there, so we walk at it head-on
        const clear = (a, b) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 4) + 1; for (let i = 0; i <= n; i++) { const q = i / n; if (cells[Math.floor(a[1] + (b[1] - a[1]) * q) * G + Math.floor(a[0] + (b[0] - a[0]) * q)]) return false; } return true; };
        let best = null, inSight = 2;
        for (let q = 2; q <= 9; q += 0.5) { const c = at(w.prog + q); let n = 0; for (let k = 0.5; k < q; k += 0.5) if (clear(at(w.prog + k), c)) n++; if (n >= inSight) { best = c; inSight = n; } }
        const [cx, cy] = best || at(w.prog + 5 + rnd() * 2);
        w.foes.push(newFoe('cyber', cx, cy, rnd));
        w.pillars.push({ x: cx, y: cy, life: 1.4 });
      }
    }
    const gun = w.arsenal[w.weapon], wp = WEAPONS[gun];
    // hits: the weapon fires on its kind of hit, a note lights a key, a snare makes the hostiles twitch
    let trig = 0;
    for (const h of hits) {
      if (wp.on === 'any' || isLow(h) || (wp.on === 'tonal' && isTonal(h))) trig = Math.max(trig, h.strength);
      if (isTonal(h)) w.keys[h.pc % 3] = 1.5;
      if (h.kind === 'snare') for (const foe of w.foes) { foe.ph += 2; if (FOES[foe.kind].dash) foe.dash = 0.4; }
    }
    const fired = trig > 0 && t - w.lastShot >= wp.rate && w.swapT <= 0;
    if (fired) {
      w.lastShot = t;
      w.recoil = gun === 'saw' ? 0.3 : gun === 'chaingun' ? 0.5 : 1;
      w.flash = gun === 'chaingun' ? 0.04 : 0.07;
      w.ammo = Math.max(0, w.ammo - (gun === 'saw' ? 0 : 0.02));
      s.shake = Math.max(s.shake, gun === 'rocket' ? 0.5 : gun === 'saw' ? 0.1 : 0.25);
    }
    w.recoil *= Math.exp(-dt * 12);
    w.flash -= dt; w.swapT -= dt; w.hurt -= dt; w.grin -= dt;
    w.health = Math.min(1, w.health + dt * 0.02);
    w.ammo = Math.min(1, w.ammo + dt * 0.03);
    for (let k = 0; k < 3; k++) w.keys[k] -= dt;

    // walls, column by column: the shading by distance, then the theme's marks on them, a torch every other cell on
    // the bone and hell walls; the floor is stone, lava rolling toward us with the bass, or wet flesh with puddles
    const ramp = RAMPS[theme], split = Math.min(barY, Math.round(horizon + N * 0.22)), buf = r.buf, tt = t * 12 | 0, torches = theme === 'hell' || theme === 'bone';
    const lavaK = f.rel.bassClock * 0.8, pulse = f.beat.pulse;
    for (let x = 0; x < N; x++) {
      const ang = head + (x / N - 0.5) * FOV, dx = Math.cos(ang), dy = Math.sin(ang);
      let mx = Math.floor(px), my = Math.floor(py), side = 0;
      const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9)), sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
      let tx = dx < 0 ? (px - mx) * ddx : (mx + 1 - px) * ddx, ty = dy < 0 ? (py - my) * ddy : (my + 1 - py) * ddy;
      for (let guard = 0; guard < 60; guard++) {
        if (tx < ty) { tx += ddx; mx += sx; side = 0; } else { ty += ddy; my += sy; side = 1; }
        if (mx < 0 || my < 0 || mx >= G || my >= G || cells[my * G + mx]) break;
      }
      const dist = side === 0 ? tx - ddx : ty - ddy, cosA = Math.cos(ang - head), perp = Math.max(0.05, dist * cosA);
      zbuf[x] = perp;
      const hgt = (N * 0.9) / perp, top = horizon - hgt / 2, bottom = horizon + hgt / 2;
      const along = side === 0 ? py + dist * dy : px + dist * dx, tu = along - Math.floor(along), wall = mx * 31 + my + side * 977;
      let shade = perp < 1.6 ? 3 : perp < 3.2 ? 2 : perp < 6 ? 1 : 0;
      if (side === 1) shade = Math.max(0, shade - 1);
      const idx = ramp[shade], darker = shade ? ramp[shade - 1] : DARK + DIM;
      const y0 = Math.max(0, Math.round(top)), y1 = Math.min(barY, Math.round(bottom));
      if (y1 > y0) {
        if (theme === 'brick') {
          r.rect(x, y0, 1, y1 - y0, (tu * 4) % 1 < 0.08 ? darker : idx);
          for (let k = 1; k < 6; k++) { const y = top + (k / 6) * hgt; if (y >= 0 && y < barY) r.set(x, y, darker); }
        } else if (theme === 'flesh') { // veins wandering across the wall, pores between them
          r.rect(x, y0, 1, y1 - y0, idx);
          for (let k = 0; k < 2; k++) wallMark(r, x, y0, y1, top + hgt * (0.3 + 0.4 * k + 0.08 * Math.sin(along * 4 + k * 2.1) + 0.03 * Math.sin(along * 11)), hgt * 0.03, HOT);
          const pore = Math.floor(along * 6);
          if (hash(pore, wall) < 0.35 && Math.abs((tu * 6) % 1 - 0.5) < 0.2) wallMark(r, x, y0, y1, top + hgt * (0.15 + 0.65 * hash(pore, 9)), hgt * 0.04, DARK);
        } else if (theme === 'bone') { // rib arcs over every unit of wall, slits between them
          r.rect(x, y0, 1, y1 - y0, idx);
          const arc = 0.38 * Math.sin(tu * Math.PI);
          wallMark(r, x, y0, y1, top + hgt * (0.5 - arc), hgt * 0.025, DARK);
          wallMark(r, x, y0, y1, top + hgt * (0.5 + arc), hgt * 0.025, DARK);
          if ((tu * 6) % 1 < 0.06) wallMark(r, x, y0, y1, top + hgt * 0.38, hgt * 0.24, DARK);
        } else { // hell: dark stone, cracks of fire in it that pulse with the beat
          r.rect(x, y0, 1, y1 - y0, (tu * 3) % 1 < 0.05 ? darker : idx);
          if (hash(Math.floor(along), wall) < 0.6) wallMark(r, x, y0, y1, top + hgt * (0.5 + 0.15 * Math.sin(along * 7) + 0.12 * (hash(Math.floor(along * 8), wall) - 0.5)), hgt * (0.015 + 0.03 * pulse), pulse > 0.6 ? BRIGHT : HOT);
        }
        if (torches && perp < 9 && Math.abs(tu - 0.5) < 0.04 && Math.floor(along) % 2 === 0) { // a sconce: a bracket, the flame, a tip that jumps
          const fy = bottom - 0.62 * hgt, fh = Math.max(1, Math.min(4 * u, hgt * 0.06)), flick = hash(wall, Math.floor(along / 2) * 5 + tt) < 0.5 ? 1 : 0;
          wallMark(r, x, y0, y1, fy, hgt * 0.03, DARK);
          wallMark(r, x, y0, y1, fy - fh, fh, HOT);
          wallMark(r, x, y0, y1, fy - fh - 1 - flick, 1, BRIGHT);
        }
      }
      if (y1 < barY) {
        if (split > y1) r.rect(x, y1, 1, split - y1, DARK);
        const fy0 = Math.max(y1, split);
        if (theme === 'hell') { // lava: bands by depth rolling toward us with the bass, dithered at their edges, bright specks
          for (let y = fy0; y < barY; y++) { const q = ((N * 0.45) / (y - horizon)) * 1.5 + lavaK, b = q - Math.floor(q); buf[y * N + x] = hash(x, y + tt) < 0.02 ? BRIGHT : b < 0.35 || (b < 0.5 && ((x + y) & 1)) ? HOT : DARK; }
        } else if (theme === 'flesh') { // a wet floor, the puddles cast to the maze so they stay put as we walk
          r.rect(x, fy0, 1, barY - fy0, MID + DIM);
          for (let y = fy0; y < barY; y++) { const d = (N * 0.45) / (y - horizon) / cosA, wx = px + dx * d, wy = py + dy * d, fx = ((wx * 2) % 1) - 0.5, fyy = ((wy * 2) % 1) - 0.5; if (fx * fx + fyy * fyy < 0.1 && hash(Math.floor(wx * 2), Math.floor(wy * 2)) < 0.3) buf[y * N + x] = HOT; }
        } else r.rect(x, fy0, 1, barY - fy0, MID);
      }
    }

    // everything standing in the maze is projected the same way and drawn far to near
    const proj = (x, y) => { const dx = x - px, dy = y - py, rel = wrapAngle(Math.atan2(dy, dx) - head); return { rel, dp: Math.hypot(dx, dy) * Math.cos(rel), sx: (0.5 + rel / FOV) * N }; };
    const open = (x, y) => x > 0 && y > 0 && x < G && y < G && !cells[Math.floor(y) * G + Math.floor(x)];
    const col = (sx) => zbuf[clamp(Math.round(sx), 0, N - 1)];
    const sees = (p) => p.dp > 0.3 && Math.abs(p.rel) < FOV / 2 && p.dp < col(p.sx); // in view, in front of the nearest wall
    const things = [], dead = [], born = [];
    const hurtFoe = (foe, dmg) => { foe.hp -= dmg; foe.flash = 0.12; if (foe.hp <= 0 && !dead.includes(foe)) dead.push(foe); };
    const hurtMe = (dmg, shake) => { w.hurt = 0.3; w.health = Math.max(0, w.health - dmg); s.shake = Math.max(s.shake, shake); };
    // the hostiles close in when the way is open; imps throw fire, bruisers charge, the floating ones drift; the
    // succubus dashes on a snare, the skull runs straight at us and bites, the summoner keeps its distance and
    // raises the splats, the knight, the fatty and the cyber throw what they throw
    let aimed = null, nearest = 9;
    for (const foe of w.foes) {
      const kind = FOES[foe.kind], p = proj(foe.x, foe.y), seen = sees(p);
      if (seen && Math.abs(p.rel) < 0.4 && p.dp < nearest) nearest = p.dp; // what is close ahead, for the stand
      foe.flash -= dt;
      foe.cool -= dt;
      foe.dash -= dt;
      foe.cast -= dt;
      const rush = kind.rush && p.dp < 3.5 && p.dp > 0, want = kind.keep ? (p.dp < 3 ? -1 : p.dp > 5 ? 1 : 0) : 1;
      if (foe.run === null && want && p.dp < (kind.keep ? 8 : 5) && p.dp > 0 && rnd() < dt * (0.3 + W.a) * (rush ? 3 : 1) * (kind.speed / 0.1)) {
        const stepX = want * Math.sign(px - foe.x) * 0.1, stepY = want * Math.sign(py - foe.y) * 0.1;
        if (open(foe.x + stepX * 3, foe.y)) foe.x += stepX;
        else if (open(foe.x, foe.y + stepY * 3)) foe.y += stepY;
      }
      if (kind.float && foe.run === null) { const fx = foe.x + Math.cos(foe.ph + t * 0.8) * dt * 0.35, fy = foe.y + Math.sin(foe.ph * 1.3 + t * 0.6) * dt * 0.35; if (open(fx, fy)) { foe.x = fx; foe.y = fy; } }
      if (kind.dash && foe.dash > 0 && p.dp > 0.6) { // wings folded, straight at us for a moment
        const a = Math.atan2(py - foe.y, px - foe.x), fx = foe.x + Math.cos(a) * dt * 2.2, fy = foe.y + Math.sin(a) * dt * 2.2;
        if (open(fx, fy)) { foe.x = fx; foe.y = fy; } else foe.dash = 0;
      }
      if (kind.charge) { // once it has seen us: a straight run with a trail of fire, a bite at the end of it or a wall
        if (foe.run === null && seen && p.dp < 8) foe.run = Math.atan2(py - foe.y, px - foe.x);
        if (foe.run !== null) {
          const fx = foe.x + Math.cos(foe.run) * dt * 2.5, fy = foe.y + Math.sin(foe.run) * dt * 2.5;
          if (open(fx, fy)) { foe.x = fx; foe.y = fy; if (rnd() < dt * 25) w.puffs.push({ x: foe.x, y: foe.y, life: 0.3, c: HOT }); } else foe.run = null;
          if (Math.hypot(foe.x - px, foe.y - py) < 0.5 && !dead.includes(foe)) { hurtMe(0.1, 0.4); foe.bit = true; dead.push(foe); }
        }
      }
      if (kind.throws && foe.cool <= 0 && seen && p.dp > 1 && p.dp < (kind.boss ? 11 : 7)) { // only with a line of sight: nothing is thrown through a wall
        foe.cool = kind.cd[0] + rnd() * kind.cd[1];
        foe.ph = 0;
        const a = Math.atan2(py - foe.y, px - foe.x), shot = { x: foe.x, y: foe.y, a, v: kind.boss ? 3 : 2.5, kind: 'fire', life: 5, col: kind.col || HOT, big: !!kind.boss };
        if (kind.twin) for (const k of [-1, 1]) w.shots.push({ ...shot, x: foe.x - Math.sin(a) * 0.3 * k, y: foe.y + Math.cos(a) * 0.3 * k });
        else w.shots.push(shot);
      }
      if (kind.summons) { // it edges toward the splats; every four beats one within three cells stands up again, under a column of light
        let g = null, gd = 6;
        for (const q of w.gore) { const d = Math.hypot(q.x - foe.x, q.y - foe.y); if (d < gd) { g = q; gd = d; } }
        if (g && gd > 2 && !want && rnd() < dt * 2) { const stepX = Math.sign(g.x - foe.x) * 0.1, stepY = Math.sign(g.y - foe.y) * 0.1; if (stepX && open(foe.x + stepX * 3, foe.y)) foe.x += stepX; else if (stepY && open(foe.x, foe.y + stepY * 3)) foe.y += stepY; }
        if (foe.cool <= 0) {
          foe.cool = 4 * beatS;
          if (g && gd < 3) { w.gore.splice(w.gore.indexOf(g), 1); born.push(newFoe(rollW(rnd, FOE_W, band), g.x, g.y, rnd)); w.pillars.push({ x: g.x, y: g.y, life: 1 }); foe.cast = 0.6; }
        }
      }
      if (Math.abs(p.rel) > FOV / 2 + 0.35 || p.dp < 0.3) continue;
      const size = (N * 0.6 * kind.size) / p.dp, bottom = horizon + (N * 0.45 * (1 - kind.float)) / p.dp, top = bottom - size, half = size * 0.38 * kind.wide;
      const ghost = kind.shimmer && foe.flash <= 0, sh = t * 20 | 0;
      things.push({ dp: p.dp, draw() {
        let shown = false;
        for (let x = Math.max(0, Math.floor(p.sx - half)); x < Math.min(N, p.sx + half); x++) {
          if (p.dp >= zbuf[x]) continue;
          shown = true;
          const uu = (x + 0.5 - p.sx) / half;
          for (let y = Math.max(0, Math.floor(top)); y < Math.min(barY, bottom); y++) {
            if (ghost && hash(x, y + sh) >= 0.35) continue;
            const c = kind.shape(uu, (bottom - y) / size, foe.flash > 0, foe.ph + t * 3, foe);
            if (c >= 0) r.set(x, y, c);
          }
        }
        if (shown) {
          targets.push({ x: p.sx - half, y: Math.max(0, top), w: 2 * half, h: Math.min(barY, bottom) - Math.max(0, top) });
          if (Math.abs(p.rel) < 0.12 + 0.08 * kind.wide && p.dp < 9 && (!aimed || p.dp < aimed.dp)) aimed = { foe, dp: p.dp, sx: p.sx, mid: bottom - size * 0.5 };
        }
      } });
    }
    w.foes.push(...born);
    // the boxes on the floor: walk over one and the bar fills; it comes back elsewhere later
    for (const it of w.items) {
      if ((it.wait -= dt) > 0) continue;
      if (Math.hypot(it.x - px, it.y - py) < 0.5) {
        if (it.kind === 'health') w.health = 1; else if (it.kind === 'ammo') w.ammo = 1;
        w.grin = 0.6;
        it.wait = 8 + rnd() * 6;
        Object.assign(it, spot(w, rnd));
        continue;
      }
      const p = proj(it.x, it.y);
      if (p.dp < 0.3 || Math.abs(p.rel) > FOV / 2 + 0.2) continue;
      const sz = (N * 0.13) / p.dp, floor = horizon + (N * 0.45) / p.dp;
      things.push({ dp: p.dp, draw() {
        if (p.dp >= col(p.sx)) return;
        const x0 = p.sx - sz / 2, y0 = floor - sz;
        r.rect(x0, y0, sz, sz, it.kind === 'ammo' ? COOL : it.kind === 'armor' ? LMID : BRIGHT);
        if (it.kind === 'health') { r.rect(p.sx - sz * 0.1, y0 + sz * 0.2, sz * 0.2, sz * 0.6, HOT); r.rect(x0 + sz * 0.2, floor - sz * 0.6, sz * 0.6, sz * 0.2, HOT); }
        else if (it.kind === 'ammo') r.rect(x0 + sz * 0.2, y0 + sz * 0.2, sz * 0.6, sz * 0.6, DARK);
        else r.disc(p.sx, floor - sz * 0.5, sz * 0.25, DARK);
      } });
    }
    // what flies: rockets and plasma out, fire in; a rocket takes the neighbourhood with it
    const kept = [];
    for (const sh of w.shots) {
      sh.life -= dt;
      sh.x += Math.cos(sh.a) * sh.v * dt;
      sh.y += Math.sin(sh.a) * sh.v * dt;
      let hit = sh.life <= 0 || !open(sh.x, sh.y);
      if (sh.kind === 'fire') { // a fireball on contact; the boss's rocket bursts on anything and hurts within a cell of where it burst
        const near = Math.hypot(sh.x - px, sh.y - py), reach = sh.big ? 1 : 0.45;
        if (near < reach) hit = true;
        if (hit && near < reach) hurtMe(sh.big ? 0.25 : 0.15, sh.big ? 0.7 : 0.4);
        if (hit && sh.big) { const p = proj(sh.x, sh.y); if (p.dp > 0.2) burst(w.booms, rnd, p.sx, horizon + (N * 0.1) / p.dp, 24, (N * 0.8) / Math.max(1, p.dp * 0.6), HOT); s.shake = Math.max(s.shake, 0.5); } // it bursts at the height it flew at
      } else for (const foe of w.foes) if (Math.hypot(foe.x - sh.x, foe.y - sh.y) < 0.45) { hit = true; hurtFoe(foe, sh.kind === 'rocket' ? 4 : 1); }
      if (hit && sh.kind === 'rocket') {
        for (const foe of w.foes) if (Math.hypot(foe.x - sh.x, foe.y - sh.y) < 1.6) hurtFoe(foe, 3);
        const p = proj(sh.x, sh.y);
        if (p.dp > 0.2) { burst(w.booms, rnd, p.sx, horizon, 30, (N * 0.9) / Math.max(1, p.dp * 0.6), HOT); burst(w.booms, rnd, p.sx, horizon, 12, N * 0.5, BRIGHT); }
        w.flash = 0.1;
        s.shake = Math.max(s.shake, 0.6);
      }
      if (hit) continue;
      kept.push(sh);
      if (sh.kind !== 'fire' || rnd() < 0.5) w.puffs.push({ x: sh.x, y: sh.y, life: sh.kind === 'rocket' || sh.big ? 0.6 : 0.25, c: sh.kind === 'rocket' ? DARK + DIM : sh.kind === 'fire' ? (sh.col || HOT) + DIM : COOL + DIM });
      const p = proj(sh.x, sh.y);
      if (p.dp < 0.2 || Math.abs(p.rel) > FOV / 2 + 0.1) continue;
      const rad = (N * (sh.kind === 'rocket' || sh.big ? 0.05 : 0.035)) / p.dp, cy = horizon + (sh.kind === 'fire' ? (N * 0.1) / p.dp : 0);
      things.push({ dp: p.dp, draw() { if (p.dp < col(p.sx)) { r.disc(p.sx, cy, rad, sh.kind === 'plasma' ? COOL : sh.kind === 'fire' ? sh.col || HOT : DARK); r.disc(p.sx, cy, rad * 0.5, BRIGHT); if (sh.big) r.ring(p.sx, cy, rad, Math.max(1, rad * 0.3), DARK); } } });
    }
    w.shots = kept;
    w.puffs = w.puffs.filter((pf) => (pf.life -= dt) > 0);
    for (const pf of w.puffs) {
      const p = proj(pf.x, pf.y);
      if (p.dp < 0.2 || Math.abs(p.rel) > FOV / 2 + 0.1) continue;
      const rad = (N * 0.025 * pf.life) / p.dp;
      things.push({ dp: p.dp, draw() { if (p.dp < col(p.sx)) r.rect(p.sx - rad, horizon - rad, 2 * rad, 2 * rad, pf.c); } });
    }
    w.gore = w.gore.filter((g) => (g.life -= dt) > 0);
    for (const g of w.gore) {
      const p = proj(g.x, g.y);
      if (p.dp < 0.3 || Math.abs(p.rel) > FOV / 2 + 0.3) continue;
      const sz = (N * 0.3) / p.dp, floor = horizon + (N * 0.45) / p.dp;
      things.push({ dp: p.dp + 0.01, draw() { if (p.dp < col(p.sx)) r.rect(p.sx - sz / 2, floor - sz * 0.1, sz, Math.max(1, sz * 0.1), HOT + DIM); } });
    }
    // the summoner's columns of light, floor to ceiling where a splat stood up, thinning and breaking up as they fade
    w.pillars = w.pillars.filter((pl) => (pl.life -= dt * 0.7) > 0);
    for (const pl of w.pillars) {
      const p = proj(pl.x, pl.y);
      if (p.dp < 0.3 || Math.abs(p.rel) > FOV / 2 + 0.1) continue;
      const top = horizon - (N * 0.45) / p.dp, floor = horizon + (N * 0.45) / p.dp, wd = Math.max(1, (N * 0.06 * pl.life) / p.dp), sh = t * 30 | 0;
      things.push({ dp: p.dp, draw() { if (p.dp >= col(p.sx)) return; for (let y = Math.max(0, Math.floor(top)); y < Math.min(barY, floor); y++) if (hash(y, sh) < pl.life + 0.2) r.rect(p.sx - wd / 2, y, wd, 1, BRIGHT); } });
    }
    // the floor marks: a pentagram pad flat on the lava, a heap of skulls on the bone floor; both foreshortened to the floor
    for (const mk of w.marks) {
      const p = proj(mk.x, mk.y);
      if (p.dp < 0.7 || Math.abs(p.rel) > FOV / 2 + 0.3) continue;
      const fl = horizon + (N * 0.45) / p.dp, far = horizon + (N * 0.45) / (p.dp + 0.4), near = horizon + (N * 0.45) / (p.dp - 0.4), cy = (near + far) / 2, ry = (near - far) / 2, rx = (N * 0.36) / p.dp;
      things.push({ dp: p.dp + 0.02, draw() {
        if (p.dp >= col(p.sx)) return;
        if (theme === 'hell') { // the ring and the five lines across it
          r.ring(p.sx, cy, rx, Math.max(1, (2 * u) / p.dp), HOT, ry / rx);
          for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2, b = (((i + 2) % 5) / 5) * TAU - Math.PI / 2; r.line(p.sx + Math.cos(a) * rx * 0.9, cy + Math.sin(a) * ry * 0.9, p.sx + Math.cos(b) * rx * 0.9, cy + Math.sin(b) * ry * 0.9, HOT); }
        } else { // skulls heaped three, two, one
          const rd = (N * 0.05) / p.dp, e = Math.max(1, rd * 0.25);
          for (let i = 0, row = 0, k = 0; i < mk.n; i++) { const inRow = 3 - row, x = p.sx + (k - (inRow - 1) / 2) * rd * 2, y = fl - rd - row * rd * 1.7; r.disc(x, y, rd, LMID); r.rect(x - rd * 0.4 - e / 2, y - rd * 0.15, e, e, DARK); r.rect(x + rd * 0.4 - e / 2, y - rd * 0.15, e, e, DARK); if (++k >= inRow) { k = 0; row++; } }
        }
      } });
    }
    things.sort((a, b) => b.dp - a.dp);
    for (const th of things) th.draw();
    // the shot lands: a line of sight, a spread, the saw's reach, or a projectile away
    if (fired) {
      if (wp.shot) w.shots.push({ x: px + Math.cos(head) * 0.3, y: py + Math.sin(head) * 0.3, a: aimed ? Math.atan2(aimed.foe.y - py, aimed.foe.x - px) : head, v: wp.shot === 'rocket' ? 7 : 9, kind: wp.shot, life: 3 });
      else if (wp.spread) { for (const foe of w.foes) { const p = proj(foe.x, foe.y); if (p.dp > 0.2 && p.dp < 6 && Math.abs(p.rel) < wp.spread) hurtFoe(foe, p.dp < 2.5 ? wp.dmg : 1); } }
      else if (wp.reach) { if (aimed && aimed.dp < wp.reach) hurtFoe(aimed.foe, wp.dmg); }
      else if (aimed) { hurtFoe(aimed.foe, wp.dmg); w.tracer = { x: aimed.sx, y: aimed.mid, n: 2 }; }
    }
    for (const foe of dead) {
      const K = FOES[foe.kind], p = proj(foe.x, foe.y), big = K.size > 1.2, my = horizon + (N * (0.45 * (1 - K.float) - 0.3 * K.size)) / p.dp; // the middle of where it stood
      if (p.dp > 0.2) { burst(w.booms, rnd, p.sx, my, big ? 40 : 26, N * 0.6, HOT); burst(w.booms, rnd, p.sx, my, big ? 16 : 10, N * 0.4, BRIGHT); }
      if (big) s.shake = Math.max(s.shake, 0.5);
      w.gore.push({ x: foe.x, y: foe.y, life: 8 });
      w.foes.splice(w.foes.indexOf(foe), 1);
      if (!foe.bit) { w.kills++; w.grin = 0.8; } // a skull that bit us and burst is nobody's kill
      spawnFoe(w, rnd, W.a);
    }
    w.booms = particles(W, w.booms, HOT);
    w.near = nearest;
    if (w.hurt > 0) { // took a fireball: the view flushes red
      const buf = r.buf;
      for (let k = Math.round(N * N * 0.04 * w.hurt); k > 0; k--) { const i = Math.floor(rnd() * barY * N); buf[i] = HOT; }
      for (let k = 0; k < 3 * u; k++) r.frame(k, k, N - 2 * k, barY - 2 * k, HOT);
    }
    // the weapon, bobbing with the step, rising when swapped in, a tracer and a flash when it fires
    const moving = Math.abs(w.target - w.prog) > 0.02, bobY = Math.abs(Math.sin(w.prog * TAU)) * (moving ? 2 : 0.4) * u;
    const wx = N / 2, wy = barY + bobY + w.recoil * 5 * u + Math.max(0, w.swapT) * 60 * u;
    if (w.tracer && w.tracer.n-- > 0) r.line(wx, wy - 20 * u, w.tracer.x, w.tracer.y, gun === 'pistol' ? BRIGHT : HOT);
    drawWeapon(r, gun, wx, wy, u, w.recoil, w.flash, t, rnd);
    if (w.flash > 0 && gun !== 'saw') {
      const big = gun === 'shotgun' || gun === 'rocket';
      r.disc(wx, wy - 27 * u, (big ? 8 : 5) * u + 3 * rnd() * u, gun === 'plasma' ? COOL : BRIGHT);
      r.ring(wx, wy - 27 * u, (big ? 11 : 7.5) * u, 1.5 * u, gun === 'plasma' ? BRIGHT : HOT);
    }
    // the status bar: health, ammo, the face, the arsenal, the keys
    r.rect(0, barY, N, N - barY, DARK);
    r.rect(0, barY, N, Math.max(1, u), LMID);
    const hw = 0.26 * N, hy = barY + 4 * u;
    r.frame(Math.round(3 * u), Math.round(hy), Math.round(hw), Math.round(5 * u), MID);
    r.rect(3 * u, hy, hw * w.health, 5 * u, w.health < 0.3 ? HOT : COOL);
    for (let k = 0; k < 6; k++) r.rect(0.33 * N + k * 3 * u, hy, 2 * u, 5 * u, k < Math.round(w.ammo * 6) ? BRIGHT : MID);
    const fx0 = 0.5 * N - 5 * u, fy0 = barY + 2.5 * u, look = aimed ? Math.sign(aimed.sx - N / 2) * 0.7 * u : 0;
    r.rect(fx0, fy0, 10 * u, 10 * u, LMID);
    const eye = w.hurt > 0 ? HOT : DARK;
    r.rect(fx0 + 2.5 * u + look, fy0 + 3 * u, 1.5 * u, 1.5 * u, eye);
    r.rect(fx0 + 6 * u + look, fy0 + 3 * u, 1.5 * u, 1.5 * u, eye);
    if (w.hurt > 0 || w.recoil > 0.3) r.rect(fx0 + 3 * u, fy0 + 6.5 * u, 4 * u, 2.5 * u, w.hurt > 0 ? DARK : HOT);
    else if (w.grin > 0) r.rect(fx0 + 2 * u, fy0 + 7 * u, 6 * u, Math.max(1, 1.2 * u), BRIGHT);
    else r.rect(fx0 + 3 * u, fy0 + 7 * u, 4 * u, Math.max(1, u), DARK);
    if (w.health < 0.3) { r.rect(fx0 + 2 * u, fy0 + 2 * u, 2.5 * u, Math.max(1, u), DARK); r.rect(fx0 + 5.5 * u, fy0 + 2 * u, 2.5 * u, Math.max(1, u), DARK); }
    w.arsenal.forEach((name, k) => r.rect(0.63 * N + k * 4 * u, hy, 3 * u, 5 * u, k === w.weapon ? BRIGHT : WEAPONS[name].shot ? HOT + DIM : MID));
    [COOL, HOT, BRIGHT].forEach((c, k) => r.rect(0.86 * N + k * 4 * u, hy, 3 * u, 5 * u, w.keys[k] > 0 ? c : MID));
  },
};

// ---------------------------------------------------------------------------------------------- duel
// Two fighters in a snow garden under a big moon, on the sand at noon or on a rope bridge at night. A kick is a
// strike from the left, a snare one from the right; a parry throws sparks and whites out the frame, a cut sprays
// the ground, a heavy one puts someone down for a bar. An armoury: a sword, an axe, a spear, a staff, twin daggers,
// each with its own silhouette and arc from the shoulder; builds: lean, armoured, cloaked; a section change re-arms
// one of them or moves the fight, a drop hands out the axes.
function fighter(x, dir, arm, build) {
  return { x, dir, arm, build, lunge: 0, swing: 0, hit: 0, down: 0, again: 0 };
}

// the arms: how far a lunge carries, where the swing starts and ends (radians at the shoulder, 0 = level ahead,
// up is negative), the length in body heights, whether it cuts, and the chance a strike gets past a guard
const ARMS = {
  sword: { reach: 0.09, from: -1.5, to: 0.8, len: 0.55, cut: true, heavy: 0, pass: 0.5 }, // a straight blade with a crossguard
  axe: { reach: 0.08, from: -2.1, to: 0.6, len: 0.42, cut: true, heavy: 1, pass: 0.4 }, // a short haft with a wedge head: slow, puts people down
  spear: { reach: 0.15, from: -0.25, to: 0.05, len: 0.85, cut: true, heavy: 0, pass: 0.55, thrust: true }, // a long shaft: a thrust, not a swing
  staff: { reach: 0.07, from: -2.6, to: 0.9, len: 0.7, cut: false, heavy: 0, pass: 0.45, spin: true }, // a pole held in the middle and spun, blunt
  daggers: { reach: 0.1, from: -1.1, to: 0.6, len: 0.26, cut: true, heavy: 0, pass: 0.6, twin: true }, // two short blades, two quick cuts
};
const ARM_W = { sword: [3, 3, 2], spear: [2, 2, 1], staff: [2, 1, 1], axe: [1, 2, 3], daggers: [1, 2, 3] };
// the builds: lean (no coat, quick), armoured (plates and a helm, hard to put down), cloaked (a hood, a cloak that flies in the lunge)
const BUILDS = {
  lean: { hat: false, coat: false, h: 0.95, quick: 1.4, tough: 0 },
  armoured: { hat: true, coat: true, h: 1.05, quick: 0.8, tough: 1 },
  cloaked: { hat: false, coat: true, h: 1, quick: 1, tough: 0 },
};
const BUILD_W = { lean: [2, 2, 3], armoured: [1, 2, 2], cloaked: [3, 2, 1] };
// the arenas: a snow garden, the desert at noon, a rope bridge over a gorge at night
const ARENA_W = { snow: [3, 2, 1], sand: [1, 2, 2], bridge: [1, 2, 3] };

// an arm from the shoulder (sx, sy) and the weapon in its hand, at `ang`; `ext` straightens the arm for a thrust
function drawArm(r, name, sx, sy, dir, ang, h, u, col, ext = 0) {
  const A = ARMS[name], ca = dir * Math.cos(ang), sa = Math.sin(ang), al = h * 0.22 * (1 + 0.6 * ext), hx = sx + ca * al, hy = sy + sa * al, L = h * A.len;
  const nx = -dir * Math.sin(ang), ny = Math.cos(ang), tx = hx + ca * L, ty = hy + sa * L;
  r.stroke(sx, sy, hx, hy, Math.max(1, 1.4 * u), col);
  switch (name) {
    case 'sword':
      r.stroke(hx, hy, tx, ty, 1.2 * u, BRIGHT);
      r.stroke(hx + nx * 2.5 * u, hy + ny * 2.5 * u, hx - nx * 2.5 * u, hy - ny * 2.5 * u, u, DARK);
      break;
    case 'axe': {
      const bx = hx + ca * L * 0.72, by = hy + sa * L * 0.72;
      r.stroke(hx, hy, tx, ty, 1.5 * u, DARK);
      r.poly([[bx + nx * u, by + ny * u], [tx + nx * u, ty + ny * u], [tx + nx * 6 * u + ca * 1.5 * u, ty + ny * 6 * u + sa * 1.5 * u], [bx + nx * 6 * u - ca * 1.5 * u, by + ny * 6 * u - sa * 1.5 * u]], LMID);
      break;
    }
    case 'spear':
      r.stroke(hx - ca * L * 0.2, hy - sa * L * 0.2, tx, ty, Math.max(1, u), DARK);
      r.poly([[tx + ca * 5 * u, ty + sa * 5 * u], [tx + nx * 1.8 * u, ty + ny * 1.8 * u], [tx - ca * 2 * u, ty - sa * 2 * u], [tx - nx * 1.8 * u, ty - ny * 1.8 * u]], BRIGHT);
      break;
    case 'staff': {
      const x0 = hx - ca * L * 0.5, y0 = hy - sa * L * 0.5, x1 = hx + ca * L * 0.5, y1 = hy + sa * L * 0.5;
      r.stroke(x0, y0, x1, y1, 1.3 * u, MID);
      r.disc(x0, y0, 1.3 * u, BRIGHT);
      r.disc(x1, y1, 1.3 * u, BRIGHT);
      break;
    }
    default: // a dagger
      r.stroke(hx, hy, tx, ty, Math.max(1, u), BRIGHT);
      r.stroke(hx + nx * 1.5 * u, hy + ny * 1.5 * u, hx - nx * 1.5 * u, hy - ny * 1.5 * u, u, DARK);
  }
  return [hx, hy];
}

const duel = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { g: 0.8, A: fighter(0.3, 1, rollW(rnd, ARM_W, band), rollW(rnd, BUILD_W, band)), B: fighter(0.7, -1, rollW(rnd, ARM_W, band), rollW(rnd, BUILD_W, band)),
      arena: rollW(rnd, ARENA_W, band), flakes: [], blood: [], stains: [], sparks: [], dust: [], card: 0, flash: 0,
      moonX: 0.18 + rnd() * 0.2, sunX: 0.3 + rnd() * 0.4, tree: 0.1 + rnd() * 0.08, lantern: 0.86 + rnd() * 0.06 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = w.g * N, h = 0.24 * N, standoff = W.a < 0.4, band = bandOf(W.a), arena = w.arena;
    const sprayCol = arena === 'snow' ? BRIGHT : arena === 'sand' ? LMID : MID;
    const attack = (att, def, strength, second) => {
      const A = ARMS[att.arm], tough = BUILDS[def.build].tough;
      att.lunge = 1;
      att.swing = 1;
      if (A.twin && !second) att.again = 0.14;
      const cx = ((att.x + def.x) / 2) * N, cy = g - h * 0.6;
      if (rnd() > A.pass || def.down > 0) { // parried, or nothing standing to hit
        burst(w.sparks, rnd, cx, cy, 14, N * 0.5, BRIGHT, 0.4);
        w.flash = 0.06;
        s.shake = Math.max(s.shake, 0.3);
      } else {
        def.hit = 1;
        def.x += att.dir * (0.025 + 0.02 * A.heavy);
        s.shake = Math.max(s.shake, 0.5 * strength);
        if (A.cut && strength > 0.55) for (let k = 0; k < 8 + 20 * strength; k++)
          w.blood.push({ x: def.x * N, y: cy, vx: att.dir * N * (0.1 + rnd() * 0.45), vy: -N * (0.1 + rnd() * 0.4), life: 2 });
        else if (!A.cut) burst(w.dust, rnd, def.x * N, g, 12, N * 0.3, sprayCol, 0.5); // a blunt hit kicks up the ground
        if (strength > (A.heavy ? 0.7 : 0.85) && rnd() < (tough ? 0.25 : 0.5)) def.down = 2;
      }
    };
    for (const hh of hits) {
      if (standoff) { if (isLow(hh)) { w.A.x -= 0.01; w.B.x += 0.01; } continue; }
      if (isLow(hh)) attack(w.A, w.B, hh.strength);
      else if (hh.kind === 'snare') attack(w.B, w.A, hh.strength);
    }
    for (const F of [w.A, w.B]) if (F.again > 0 && (F.again -= dt) <= 0 && F.down <= 0) attack(F, F === w.A ? w.B : w.A, 0.6, true); // the second dagger
    if (f.section) { // a new chapter: the card, a clean ground, the moon elsewhere; someone re-armed or the fight moved
      w.card = 0.8;
      w.stains = [];
      w.A.down = w.B.down = 0;
      w.moonX = 0.15 + rnd() * 0.25;
      if (f.section === 'drop') w.A.arm = w.B.arm = 'axe';
      else { const roll = rnd(); if (roll < 0.35) w.A.arm = rollW(rnd, ARM_W, band); else if (roll < 0.7) w.B.arm = rollW(rnd, ARM_W, band); else w.arena = rollW(rnd, ARENA_W, band); }
    }
    for (const F of [w.A, w.B]) { F.lunge -= dt * 4; F.swing -= dt * 5 * BUILDS[F.build].quick; F.hit -= dt * 6; F.down -= dt; }
    const gap = 0.4 + 0.07 * ((ARMS[w.A.arm].thrust ? 1 : 0) + (ARMS[w.B.arm].thrust ? 1 : 0)); // spears keep their distance
    w.A.x = follow(w.A.x, 0.5 - gap / 2, dt, 3);
    w.B.x = follow(w.B.x, 0.5 + gap / 2, dt, 3);
    w.flash -= dt;
    if ((w.card -= dt) > 0) { r.fill(BLACK); r.frame(Math.round(0.3 * N), Math.round(0.42 * N), Math.round(0.4 * N), Math.round(0.16 * N), WHITE); return; }

    if (w.flash > 0) r.fill(BRIGHT);
    else if (arena === 'snow') { // the garden: hills, a bare tree, a stone lantern
      r.disc(w.moonX * N, 0.2 * N, 0.08 * N, BRIGHT);
      for (let x = 0; x < N; x++) { const y = 0.62 * N - 0.05 * N * Math.sin((x / N) * 5 + 1) - 0.02 * N * Math.sin((x / N) * 13); r.rect(x, y, 1, g - y, MID); }
      const tx = w.tree * N;
      r.rect(tx - 1.5 * u, 0.36 * N, 3 * u, g - 0.36 * N, DARK);
      for (const [dx, dy, l] of [[-1, -0.8, 0.12], [1, -0.6, 0.1], [-0.6, -1.2, 0.09], [0.8, -1.3, 0.08]]) r.stroke(tx, 0.42 * N, tx + dx * l * N, 0.42 * N + dy * l * N, 1.5 * u, DARK);
      const lx = w.lantern * N;
      r.rect(lx - 2 * u, g - 14 * u, 4 * u, 14 * u, DARK);
      r.rect(lx - 5 * u, g - 20 * u, 10 * u, 6 * u, DARK);
      r.rect(lx - 3 * u, g - 18.5 * u, 6 * u, 3 * u, f.beat.pulse > 0.3 ? HOT : MID);
      r.rect(lx - 6 * u, g - 22 * u, 12 * u, 2 * u, DARK);
    } else if (arena === 'sand') { // the desert: a low sun, dunes, heat over the ground, a rock
      r.disc(w.sunX * N, 0.5 * N, 0.11 * N, HOT);
      for (let x = 0; x < N; x++) { const y = 0.58 * N - 0.05 * N * Math.sin((x / N) * 4 + 2) - 0.015 * N * Math.sin((x / N) * 11 + 1); r.rect(x, y, 1, g - y, MID); }
      for (let k = 0; k < 3; k++) for (let x = (k * 5 * u + t * 20) % (14 * u); x < N; x += 14 * u) r.rect(x, g - (3 + 3 * k) * u, 6 * u, 1, LMID + DIM);
      r.poly([[0.84 * N, g], [0.87 * N, g - 0.06 * N], [0.93 * N, g - 0.08 * N], [0.97 * N, g]], DARK);
      for (let k = 0; k < 10; k++) r.rect(((hash(k, 3) + t * 0.25) % 1) * N, g - hash(k, 4) * 0.25 * N, 3 * u, 1, LMID + DIM); // sand on the wind
    } else { // the bridge: stars, cliffs either side, the gorge and the river far below, a rope rail sagging between its posts
      for (let k = 0; k < 40; k++) r.set(hash(k, 7) * N, hash(k, 8) * 0.6 * N, BRIGHT);
      r.disc(w.moonX * N, 0.16 * N, 0.05 * N, BRIGHT);
      r.rect(0, g, N, N - g, DARK + DIM);
      r.rect(0, 0.94 * N, N, 0.06 * N, COOL + DIM);
      for (let k = 0; k < 12; k++) r.rect(((hash(k, 9) + t * 0.05) % 1) * N, 0.95 * N + hash(k, 10) * 0.04 * N, 3 * u, 1, COOL);
      r.poly([[0, N], [0, 0.4 * N], [0.06 * N, 0.45 * N], [0.1 * N, 0.62 * N], [0.14 * N, N]], DARK);
      r.poly([[N, N], [N, 0.36 * N], [0.93 * N, 0.44 * N], [0.9 * N, 0.6 * N], [0.86 * N, N]], DARK);
      for (const px of [0.05, 0.95]) r.rect(px * N - 1.5 * u, g - 0.3 * N, 3 * u, 0.3 * N, DARK);
      const span = Math.round(7 * u);
      for (let x = Math.round(0.05 * N); x < 0.95 * N; x += 2) {
        const y = g - 0.3 * N + 0.07 * N * Math.sin((Math.PI * (x - 0.05 * N)) / (0.9 * N));
        r.rect(x, y, 2, 1, MID);
        if (x % span < 2) r.line(x, y, x, g, DARK);
      }
    }
    if (arena === 'bridge') { // the deck: planks over the drop
      r.rect(0, g, N, 0.05 * N, MID);
      for (let x = 0; x < N; x += 5 * u) r.rect(x, g, Math.max(1, u * 0.6), 0.05 * N, DARK);
      r.rect(0, g, N, Math.max(1, u), LMID);
    } else {
      r.rect(0, g, N, N - g, sprayCol);
      r.rect(0, g, N, Math.max(1, u), arena === 'snow' ? LMID : MID);
    }
    for (const st of w.stains) r.rect(st.x, st.y, Math.max(1, u), Math.max(1, u), HOT);
    for (const F of [w.A, w.B]) {
      const A = ARMS[F.arm], B = BUILDS[F.build], fh = h * B.h, col = F.hit > 0.5 ? BRIGHT : F === w.A ? FIG : DARK;
      const x = (F.x + F.dir * A.reach * Math.sin(Math.PI * clamp(F.lunge))) * N;
      r.rect(x - fh * 0.22, g, fh * 0.44, Math.max(1, u), arena === 'bridge' ? DARK : arena === 'snow' ? LMID : MID); // the shadow under the feet
      if (F.down > 0) { // on the ground, the weapon dropped beside
        r.rect(x - fh * 0.35, g - fh * 0.14, fh * 0.7, fh * 0.14, col);
        r.disc(x + F.dir * fh * 0.42, g - fh * 0.08, fh * 0.1, col);
        r.stroke(x - F.dir * fh * 0.2, g - 1.5 * u, x - F.dir * fh * (0.2 + A.len * 0.7), g - 1.5 * u, Math.max(1, u), A.cut && !A.heavy ? BRIGHT : DARK);
        targets.push({ x: x - fh * 0.4, y: g - fh * 0.2, w: fh * 0.9, h: fh * 0.2 });
        continue;
      }
      const headY = g - fh * 0.866, hw = fh * 0.17 * (B.coat ? 1.25 : 1);
      if (F.build === 'cloaked') { // the cloak streams back from the shoulders, more so in the lunge
        const fl = 0.15 + 0.5 * clamp(F.lunge);
        r.poly([[x - F.dir * hw, g - fh * 0.75], [x + F.dir * hw, g - fh * 0.72], [x - F.dir * (hw * 0.4 + fl * fh * 0.3), g - fh * 0.1], [x - F.dir * (hw * 1.6 + fl * fh * 0.5), g - fh * 0.06]], col);
      }
      const J = walker(r, x, g, fh, col, 0.15 * Math.sin(t * 1.5 + F.dir), F.dir, { hat: B.hat, coat: B.coat, hatCol: B.tough ? LMID : col });
      if (F.build === 'cloaked') { r.disc(x, headY, fh * 0.14, col); r.rect(x + F.dir * fh * 0.02, headY - fh * 0.03, fh * 0.07, fh * 0.07, BLACK); } // the hood, the dark inside it
      else if (F.build === 'armoured') { // pauldrons, a breastplate, the visor slit
        for (const k of [-1, 1]) r.rect(x + k * hw * 0.8 - 2 * u, J.sy - 2 * u, 4 * u, 3 * u, LMID);
        r.rect(x - hw * 0.6, J.sy + fh * 0.04, hw * 1.2, fh * 0.2, LMID + DIM);
        r.rect(x + F.dir * fh * 0.01, headY - u, fh * 0.07, Math.max(1, u), BLACK);
      }
      const sx = J.sx, sy = J.sy + fh * 0.04; // the shoulder, where every swing pivots
      const idle = A.thrust ? (standoff ? -0.1 : 0.1) : standoff ? 1.3 : 0.6, k = F.swing > 0 ? ease(1 - F.swing) : -1;
      const ang = k >= 0 ? lerp(A.from, A.to, k) : idle, ext = A.thrust && k >= 0 ? Math.sin(Math.PI * k) : 0;
      drawArm(r, F.arm, sx, sy, F.dir, ang, fh, u, col, ext);
      if (A.twin) drawArm(r, 'daggers', x - F.dir * hw * 0.9, sy, F.dir, k >= 0 ? lerp(A.to, A.from, k) : idle + 0.5, fh, u, col); // the off hand
      if (arena === 'sand' && F.lunge > 0.9) burst(w.dust, rnd, x, g, 4, N * 0.2, LMID, 0.4); // the footwork kicks up sand
      targets.push({ x: x - fh * 0.22, y: g - fh, w: fh * 0.44, h: fh });
    }
    const depth = arena === 'bridge' ? 0.05 * N : (N - g) * 0.4;
    for (const p of w.blood) if (p.y >= g && w.stains.length < 600) w.stains.push({ x: p.x, y: g + rnd() * depth });
    w.blood = particles(W, w.blood.filter((p) => p.y < g), HOT);
    w.sparks = particles(W, w.sparks, BRIGHT);
    w.dust = particles(W, w.dust, sprayCol);
    if (arena === 'snow') snowfall(W, w.flakes, Math.round((30 + 40 * (1 - W.a)) * u), 0.06 + 0.04 * f.level, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- outrun
// A night highway toward a striped sun: the grid rolls in at the tempo, the roadside flicks past (pylons, palms,
// blank billboards, cacti, rocks), a car from behind sways with the bass and its tail lights flare on the snare;
// the car is a coupe, a roadster with the driver's head out, a pickup, or a bike that leans into the sway. A
// section change changes the car or the stretch of road, a drop takes the road into a tunnel for a while.
const RIDE_W = { coupe: [3, 2, 2], roadster: [2, 2, 3], pickup: [1, 2, 1], bike: [1, 2, 3] };
const SIDE_W = { pylon: [2, 2, 2], palm: [3, 2, 1], billboard: [1, 2, 2], cactus: [2, 1, 1], rock: [1, 1, 1] };

// something by the road, its base at (x, y), scaled by the depth zz
function drawRoadside(r, kind, x, y, zz, u, side, k) {
  const z = 1 / zz, pw = Math.max(1, 2 * u * z);
  switch (kind) {
    case 'palm': { // a trunk leaning out from the road, fronds hanging from the crown
      const tx = x + side * 3 * u * z, ty = y - 20 * u * z;
      r.stroke(x, y, x + side * 1.5 * u * z, y - 10 * u * z, pw, MID);
      r.stroke(x + side * 1.5 * u * z, y - 10 * u * z, tx, ty, pw, MID);
      for (const [dx, dy] of [[-1, 0.2], [-0.7, -0.5], [0, -0.8], [0.7, -0.5], [1, 0.2]]) r.stroke(tx, ty, tx + dx * 7 * u * z, ty + dy * 6 * u * z + 3 * u * z, Math.max(1, 1.5 * u * z), LMID);
      break;
    }
    case 'billboard': {
      const bw = 14 * u * z, bh = 8 * u * z, ht = 9 * u * z;
      for (const lx of [-0.3, 0.3]) r.rect(x + lx * bw - pw / 2, y - ht, pw, ht, MID);
      r.rect(x - bw / 2, y - ht - bh, bw, bh, MID);
      r.frame(Math.round(x - bw / 2), Math.round(y - ht - bh), Math.round(bw), Math.round(bh), LMID);
      r.rect(x - bw * 0.35, y - ht - bh * 0.75, bw * 0.3, bh * 0.5, k % 2 ? HOT : COOL);
      r.rect(x + bw * 0.05, y - ht - bh * 0.7, bw * 0.3, bh * 0.15, BRIGHT);
      r.rect(x + bw * 0.05, y - ht - bh * 0.45, bw * 0.2, bh * 0.15, BRIGHT);
      break;
    }
    case 'cactus': {
      const ht = 10 * u * z;
      r.rect(x - pw / 2, y - ht, pw, ht, MID);
      r.rect(x - 3 * u * z, y - ht * 0.7, 3 * u * z, pw, MID);
      r.rect(x - 3 * u * z - pw / 2, y - ht * 0.95, pw, ht * 0.3, MID);
      r.rect(x + pw / 2, y - ht * 0.55, 3 * u * z, pw, MID);
      r.rect(x + 3 * u * z, y - ht * 0.85, pw, ht * 0.35, MID);
      break;
    }
    case 'rock': r.poly([[x - 5 * u * z, y], [x - 2 * u * z, y - 4 * u * z], [x + 2 * u * z, y - 5 * u * z], [x + 5 * u * z, y]], MID); break;
    default: { // the pylon
      const ht = 17.5 * u * z;
      r.rect(x - pw / 2, y - ht, pw, ht, MID);
      for (const [dx, dy] of [[-1, -0.3], [1, -0.3], [0, -0.9]]) r.line(x, y - ht, x + dx * 5 * u * z, y - ht + dy * 4 * u * z, MID);
    }
  }
}

const outrun = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { mts: Array.from({ length: 25 }, () => rnd()), stars: Array.from({ length: 50 }, () => [rnd(), rnd() * 0.45]), bounce: 0, tail: 0, glint: null, car: rollW(rnd, RIDE_W, band), side: rollW(rnd, SIDE_W, band), tunnel: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, hz = 0.5 * N, band = bandOf(W.a);
    for (const hh of hits) {
      if (isLow(hh)) w.bounce = 1;
      else if (hh.kind === 'snare') w.tail = 0.12;
      else if (hh.kind === 'hat') w.glint = { s: pick(rnd, w.stars), t: 0.2 };
    }
    if (f.section === 'drop') w.tunnel = 8;
    else if (f.section === 'change') { const roll = rnd(); if (roll < 0.4) w.car = rollW(rnd, RIDE_W, band); else if (roll < 0.85) w.side = rollW(rnd, SIDE_W, band); else w.tunnel = 6; }
    w.bounce *= Math.exp(-dt * 7);
    w.tail -= dt;
    w.tunnel -= dt;
    const inT = w.tunnel > 0;
    if (!inT) {
      for (const [x, y] of w.stars) r.set(x * N, y * N, BRIGHT);
      if (w.glint && (w.glint.t -= dt) > 0) { const [gx, gy] = w.glint.s; r.rect(gx * N - 2 * u, gy * N, 5 * u, 1, BRIGHT); r.rect(gx * N, gy * N - 2 * u, 1, 5 * u, BRIGHT); }
      const sx = 0.5 * N, sy = hz - 0.08 * N, sr = 0.17 * N;
      r.disc(sx, sy, sr, HOT);
      for (let k = 0; k < 5; k++) r.rect(sx - sr, sy + sr * (0.12 + k * 0.17), 2 * sr, Math.max(1, u * (0.6 + k * 0.5)), BG);
      for (let x = 0; x < N; x++) {
        const i = (x / N) * 24, k = Math.floor(i), mh = lerp(w.mts[k], w.mts[k + 1], i - k) * 0.12 * N;
        r.rect(x, hz - mh, 1, mh, DARK);
      }
    } else r.rect(0, 0, N, hz, DARK + DIM); // the tunnel wall closes over the sky
    r.rect(0, hz, N, N - hz, DARK);
    r.rect(0, hz, N, Math.max(1, u), COOL);
    for (let k = -7; k <= 7; k++) { const xb = 0.5 * N + k * 0.22 * N; if (Math.abs(k) === 1) r.stroke(0.5 * N, hz, xb, N, 1.5 * u, COOL); else r.line(0.5 * N, hz, xb, N, COOL); }
    const ph = (f.rel.bassClock * 0.7) % 1;
    for (let k = 12; k >= 1; k--) { // far to near
      const zz = 1 + (k - ph) * 0.75, y = hz + (N - hz) / zz;
      if (y >= N) continue;
      r.rect(0, y, N, zz < 1.6 ? 2 : 1, COOL);
      if (inT) { // an arch over the road at every slot, a light in the crown
        const hw = 0.34 * N / zz, top = hz - 0.28 * N / zz, lw = Math.max(1, 2 * u / zz);
        r.rect(0.5 * N - hw, top, lw, y - top, MID);
        r.rect(0.5 * N + hw - lw, top, lw, y - top, MID);
        r.rect(0.5 * N - hw, top, 2 * hw, lw, MID);
        r.rect(0.5 * N - 2 * u / zz, top + lw, 4 * u / zz, Math.max(1, 1.5 * u / zz), (k + Math.floor(t * 6)) % 3 ? BRIGHT : LMID);
      }
      if (k % 2) r.rect(0.5 * N - u, y - (3 * u) / zz, 2 * u, Math.max(1, (4 * u) / zz), BRIGHT);
      else if (!inT) for (const side of [-1, 1]) drawRoadside(r, w.side, 0.5 * N + (side * 0.3 * N) / zz, y, zz, u, side, k);
    }
    // the car from behind, each design its own silhouette
    const cx = 0.5 * N + 0.05 * N * Math.sin(f.rel.bassClock * 0.8), cy = 0.8 * N - w.bounce * 3 * u, sway = (cx - 0.5 * N) / (0.05 * N), tail = w.tail > 0 ? BRIGHT : HOT;
    r.ring(cx, 0.8 * N + 0.01 * N, 0.11 * N, 0.015 * N, BLACK, 0.2); // the shadow under it on the road
    if (w.car === 'bike') {
      r.rect(cx - 0.02 * N, 0.75 * N, 0.04 * N, 0.06 * N, BLACK); // the wheel stays on the road; the bounce is the bike's over it
      r.rect(cx - 0.035 * N, cy - 0.1 * N, 0.07 * N, 0.05 * N, MID);
      r.rect(cx - 0.03 * N - sway * 2 * u, cy - 0.17 * N, 0.06 * N, 0.08 * N, FIG);
      r.disc(cx - sway * 3 * u, cy - 0.19 * N, 0.02 * N, DARK);
      r.rect(cx - 0.06 * N - sway * 2 * u, cy - 0.15 * N, 0.12 * N, Math.max(1, u), LMID);
      r.rect(cx - 0.015 * N, cy - 0.08 * N, 0.03 * N, 0.015 * N, tail);
      targets.push({ x: cx - 0.06 * N, y: cy - 0.21 * N, w: 0.12 * N, h: 0.22 * N });
    } else {
      r.rect(cx - 0.11 * N, cy - 0.05 * N, 0.22 * N, 0.06 * N, MID);
      if (w.car === 'coupe') { r.rect(cx - 0.07 * N, cy - 0.095 * N, 0.14 * N, 0.05 * N, MID); r.rect(cx - 0.06 * N, cy - 0.09 * N, 0.12 * N, 0.03 * N, DARK); r.rect(cx - 0.09 * N, cy - 0.11 * N, 0.18 * N, Math.max(1, u), LMID); }
      else if (w.car === 'roadster') { r.rect(cx - 0.08 * N, cy - 0.07 * N, 0.16 * N, 0.02 * N, DARK); r.rect(cx - 0.075 * N, cy - 0.085 * N, 0.15 * N, Math.max(1, u), LMID); r.disc(cx - 0.02 * N, cy - 0.085 * N, 0.018 * N, DARK); r.rect(cx - 0.11 * N, cy - 0.06 * N, 0.22 * N, Math.max(1, u), LMID); }
      else { r.rect(cx - 0.1 * N, cy - 0.085 * N, 0.2 * N, 0.04 * N, DARK); r.frame(Math.round(cx - 0.1 * N), Math.round(cy - 0.085 * N), Math.round(0.2 * N), Math.round(0.04 * N), LMID); r.rect(cx - 0.06 * N, cy - 0.14 * N, 0.12 * N, 0.055 * N, MID); r.rect(cx - 0.05 * N, cy - 0.135 * N, 0.1 * N, 0.03 * N, DARK); }
      r.rect(cx - 0.12 * N, 0.8 * N, 0.04 * N, 0.025 * N, DARK); // the wheels stay on the road; the bounce is the body's on its springs
      r.rect(cx + 0.08 * N, 0.8 * N, 0.04 * N, 0.025 * N, DARK);
      for (const side of [-1, 1]) r.rect(cx + side * 0.075 * N - 0.025 * N, cy - 0.04 * N, 0.05 * N, 0.015 * N, tail);
      targets.push({ x: cx - 0.11 * N, y: cy - 0.14 * N, w: 0.22 * N, h: 0.16 * N });
    }
  },
};

// ---------------------------------------------------------------------------------------------- arcade
// A space shooter: the formation steps on the beat and animates, the ship below sways with the bass, a kick fires,
// a snare drops a bomb, a note lights an invader. A bestiary of original critters, each with its own two frames
// and its own way of moving: crabs march, squids peel off and dive, bats weave, blobs split in two when shot, eyes
// hover and blink; three ships with their own guns; every third wave, or on a drop, a boss that takes a clip.
const SPECIES = {
  crab: { move: 'march', frames: [['..#...#..', '...#.#...', '..#####..', '.##o#o##.', '#########', '#.#...#.#'], ['..#...#..', '...#.#...', '..#####..', '.##o#o##.', '#########', '.#.#.#.#.']] }, // claws up, marches
  squid: { move: 'dive', frames: [['...###...', '..#####..', '.##o#o##.', '.#######.', '..#.#.#..', '.#..#..#.'], ['...###...', '..#####..', '.##o#o##.', '.#######.', '.#.#.#.#.', '#...#...#']] }, // tentacles, peels off and dives
  bat: { move: 'zigzag', frames: [['#...#...#', '##..#..##', '#########', '.##o#o##.', '..#####..', '...#.#...'], ['....#....', '#...#...#', '#########', '###o#o###', '.#######.', '..#...#..']] }, // wings up, wings down, the rows weave
  blob: { move: 'split', frames: [['...###...', '.#######.', '##o###o##', '#########', '.#######.', '...###...'], ['..#####..', '.#######.', '#o#####o#', '#########', '#########', '..#.#.#..']] }, // round, splits into two small ones when shot
  eye: { move: 'hover', frames: [['..#####..', '.#######.', '###ooo###', '.#######.', '..#####..', '....#....'], ['..#####..', '.##...##.', '##.ooo.##', '.##...##.', '..#####..', '....#....']] }, // hovers and blinks on the beat
};
const MINI = ['.###.', '#o#o#', '#####', '.#.#.'];
const SPECIES_W = { crab: [3, 2, 1], eye: [2, 1, 1], bat: [2, 2, 2], blob: [1, 2, 2], squid: [1, 2, 3] };
// the ships: a dart (one quick shot), a wing (two abreast), a pod (a spread of three); guns are [x in sprite px, sideways speed]
const SHIPS = {
  dart: { rows: ['....#....', '....#....', '...###...', '...###...', '..#####..', '.##.#.##.'], guns: [[0, 0]], v: 1.7 },
  wing: { rows: ['....#....', '...###...', '#..###..#', '##.###.##', '#########', '.#.....#.'], guns: [[-3, 0], [3, 0]], v: 1.4 },
  pod: { rows: ['....#....', '..#####..', '.#######.', '#########', '.#######.', '..##.##..'], guns: [[0, 0], [-2, -0.35], [2, 0.35]], v: 1.3 },
};
const SHIP_W = { dart: [2, 2, 1], wing: [2, 2, 2], pod: [1, 2, 3] };
const BOSS = ['....#######....', '..###########..', '.####o#####o###', '###############', '###.###.###.###', '.##.#.#.#.#.##.', '..##.......##..', '...#.......#...'];

function newWave(w, rnd, band, boss) {
  w.wave++;
  w.inv = [];
  w.fx = 0;
  w.drop = 0;
  w.waveFlash = 0.1;
  w.boss = null;
  if (boss ?? w.wave % 3 === 0) { w.boss = { x: 0.5, dir: 1, hp: 12, flash: 0, t: 0 }; return; }
  w.species = rollW(rnd, SPECIES_W, band);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 7; col++) w.inv.push({ c: col, r: row, flash: 0, dive: 0, mini: false });
}

const arcade = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { stars: Array.from({ length: 60 }, () => ({ x: rnd(), y: rnd(), v: 0.2 + rnd() * 0.8 })), ship: { x: 0.5, flash: 0 }, shipKind: rollW(rnd, SHIP_W, bandOf(W.a)), shots: [], bombs: [],
      fdir: 1, anim: 0, steps: 0, booms: [], lives: 3, score: 0, stepT: 0, waveFlash: 0, wave: 0 });
    newWave(w, rnd, bandOf(W.a), false);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, cell = 0.085 * N, ox0 = 0.1 * N, oy0 = 0.14 * N, sc = (cell * 0.8) / 9, band = bandOf(W.a);
    const shipY = 0.88 * N, shipX = follow(w.ship.x, 0.5 + 0.35 * Math.sin(f.rel.bassClock * 0.5), dt, 0.3) * N, ship = SHIPS[w.shipKind], sp = SPECIES[w.species], mv = sp.move;
    w.ship.x = shipX / N;
    for (const st of w.stars) {
      st.y += st.v * dt * (0.08 + 0.25 * W.a) * (0.5 + f.rel.midAtt);
      if (st.y > 1) { st.y = 0; st.x = rnd(); }
      r.set(st.x * N, st.y * N, st.v > 0.6 ? BRIGHT : MID);
    }
    const stepNow = beatLocked(f) ? f.beat.on : (w.stepT += dt) > 0.5;
    if (stepNow) {
      w.stepT = 0;
      w.anim ^= 1;
      w.steps++;
      w.fx += w.fdir * 0.02 * N;
      if (ox0 + w.fx + 7 * cell > 0.98 * N || ox0 + w.fx < 0.02 * N) { w.fdir = -w.fdir; w.drop += (mv === 'hover' ? 0.012 : 0.025) * N; }
    }
    if (f.section === 'drop' && !w.boss) newWave(w, rnd, band, true); // the boss comes early
    else if (f.section === 'change') { if (rnd() < 0.5) { w.shipKind = rollW(rnd, SHIP_W, band); w.ship.flash = 0.3; } else if (!w.boss) newWave(w, rnd, band, false); }
    // where an invader is: its slot, plus the weave, the hover, or the dive it is on
    const pos = (inv) => {
      let x = ox0 + w.fx + inv.c * cell, y = oy0 + w.drop + inv.r * cell * 1.1;
      if (mv === 'zigzag') { x += Math.sin(w.steps * 0.9 + inv.r) * cell * 0.35; y += Math.sin(w.steps * 0.9 + inv.c * 0.7) * cell * 0.2; }
      else if (mv === 'hover') y += Math.sin(t * 2.5 + inv.c * 0.8 + inv.r) * 2 * u;
      if (inv.dive > 0) { const p = inv.dive; if (p < 1) { y += (N * 1.05 - y) * p; x += Math.sin(p * TAU) * 0.18 * N; } else y = -cell + (y + cell) * ((p - 1) / 0.4); }
      return [x, y];
    };
    const bossX = w.boss ? w.boss.x * N : 0, bossY = w.boss ? 0.2 * N + Math.sin(w.boss.t * 1.5) * 0.03 * N : 0;
    for (const hh of hits) {
      if (isLow(hh)) for (const [gx, gv] of ship.guns) w.shots.push({ x: shipX + gx * sc, y: shipY - 3 * sc, vx: gv * N, vy: ship.v * N });
      else if (hh.kind === 'snare') {
        if (w.boss) for (const k of [-1, 0, 1]) w.bombs.push({ x: bossX + k * 4 * sc, y: bossY + 4 * sc, vx: k * 0.15 * N });
        else if (w.inv.length) {
          const inv = pick(rnd, w.inv), [x, y] = pos(inv);
          w.bombs.push({ x: x + cell * 0.4, y: y + cell * 0.6, vx: 0 });
          if (mv === 'dive') { const idle = w.inv.filter((i) => !i.dive); if (idle.length) pick(rnd, idle).dive = 1e-3; }
        }
      } else if (isTonal(hh) && w.inv.length) pick(rnd, w.inv).flash = 0.25;
    }
    if (w.boss) { // the boss paces above, drops a bomb on the beat
      const b = w.boss;
      b.t += dt; b.flash -= dt;
      b.x += b.dir * dt * (0.12 + 0.1 * W.a);
      if (b.x > 0.75 || b.x < 0.25) b.dir = -b.dir;
      if (f.beat.on) w.bombs.push({ x: bossX + (f.beat.count % 2 ? -3 : 3) * sc, y: bossY + 4 * sc, vx: 0 });
      r.sprite(BOSS, bossX - 7.5 * sc, bossY - 4 * sc, { '#': b.flash > 0 ? COOL : LMID, o: HOT }, sc);
      r.rect(bossX - 7.5 * sc, bossY + 5 * sc, 15 * sc, Math.max(1, u), DARK);
      r.rect(bossX - 7.5 * sc, bossY + 5 * sc, 15 * sc * (b.hp / 12), Math.max(1, u), HOT);
      targets.push({ x: bossX - 7.5 * sc, y: bossY - 4 * sc, w: 15 * sc, h: 8 * sc });
    }
    for (const inv of w.inv) {
      const [x, y] = pos(inv);
      inv.flash -= dt;
      if (inv.dive > 0 && (inv.dive += dt * 0.5) > 1.4) inv.dive = 0;
      const col = inv.flash > 0 ? COOL : inv.r === 0 ? LMID : MID;
      if (inv.mini) r.sprite(MINI, x + 2 * sc, y + sc, { '#': col, o: HOT }, sc);
      else r.sprite(sp.frames[w.anim], x, y, { '#': col, o: HOT }, sc);
      if (inv.dive > 0 && inv.dive < 1 && Math.abs(x + 4.5 * sc - shipX) < 0.04 * N && Math.abs(y + 3 * sc - shipY) < 0.04 * N) { w.ship.flash = 0.3; inv.dive = 1.01; if (--w.lives <= 0) { w.lives = 3; newWave(w, rnd, band, false); } }
      targets.push({ x, y, w: 9 * sc, h: 6 * sc });
    }
    const hitInv = (inv) => { // shot: a blob splits, anything else goes up in a burst
      const [x, y] = pos(inv);
      burst(w.booms, rnd, x + 4.5 * sc, y + 3 * sc, inv.mini ? 8 : 16, N * 0.5, HOT, 0.5);
      w.inv.splice(w.inv.indexOf(inv), 1);
      w.score++;
      if (mv === 'split' && !inv.mini) for (const k of [-0.3, 0.3]) w.inv.push({ c: inv.c + k, r: inv.r, flash: 0.2, dive: 0, mini: true });
    };
    w.shots = w.shots.filter((sh) => {
      sh.y -= sh.vy * dt;
      sh.x += sh.vx * dt;
      r.rect(sh.x - u / 2, sh.y, Math.max(1, u), 3 * u, BRIGHT);
      if (w.boss && Math.abs(sh.x - bossX) < 7.5 * sc && Math.abs(sh.y - bossY) < 4 * sc) {
        const b = w.boss;
        b.hp--; b.flash = 0.1;
        burst(w.booms, rnd, sh.x, sh.y, 6, N * 0.3, HOT, 0.3);
        if (b.hp <= 0) { burst(w.booms, rnd, bossX, bossY, 60, N * 0.8, HOT, 0.9); burst(w.booms, rnd, bossX, bossY, 20, N * 0.6, BRIGHT, 0.7); s.shake = Math.max(s.shake, 0.7); w.score += 5; newWave(w, rnd, band, false); }
        return false;
      }
      const hit = w.inv.find((inv) => { const [x, y] = pos(inv); return Math.abs(sh.x - (x + 4.5 * sc)) < cell * (inv.mini ? 0.28 : 0.45) && Math.abs(sh.y - (y + 3 * sc)) < cell * 0.45; });
      if (hit) { hitInv(hit); return false; }
      return sh.y > 0.06 * N && sh.x > 0 && sh.x < N;
    });
    w.bombs = w.bombs.filter((b) => {
      b.y += dt * N * 0.6;
      b.x += b.vx * dt;
      r.rect(b.x - u / 2, b.y, Math.max(1, u), 2 * u, HOT);
      if (b.y > shipY && Math.abs(b.x - shipX) < 0.04 * N) { w.ship.flash = 0.3; if (--w.lives <= 0) { w.lives = 3; newWave(w, rnd, band, false); } return false; }
      return b.y < N;
    });
    w.booms = particles(W, w.booms, HOT);
    w.ship.flash -= dt;
    r.sprite(ship.rows, shipX - 4.5 * sc, shipY - 3 * sc, { '#': w.ship.flash > 0 && Math.floor(w.ship.flash * 20) % 2 ? HOT : FIG }, sc);
    if (f.beat.pulse > 0.3) r.rect(shipX - u, shipY + 3 * sc, 2 * u, 2 * u + 2 * u * f.beat.pulse, BRIGHT);
    targets.push({ x: shipX - 4.5 * sc, y: shipY - 3 * sc, w: 9 * sc, h: 6 * sc });
    if (!w.boss && (w.inv.length < 4 || oy0 + w.drop + 3 * cell * 1.1 > 0.78 * N)) newWave(w, rnd, band);
    if ((w.waveFlash -= dt) > 0) r.frame(0, 0, N, N, BRIGHT);
    // the top strip: lives in the ship's own shape and a score bar
    r.rect(0, 0, N, 0.06 * N, DARK);
    for (let i = 0; i < w.lives; i++) r.sprite(ship.rows, 2 * u + i * 8 * u, 1.5 * u, { '#': FIG }, u * 0.7);
    for (let k = 0; k < w.score % 24; k++) r.rect(N - 3 * u - k * 2.5 * u, 2 * u, 1.5 * u, 3.5 * u, COOL);
  },
};

// ---------------------------------------------------------------------------------------------- platformer
// A side-scroller that runs at the tempo: a kick jumps, a bumped block pops a coin, a note puts a coin ahead at
// its pitch, an enemy gets stomped when the jump lands on it. Heroes: a runner, a knight behind a shield, a ninja
// that jumps twice; critters: walkers that patrol and turn at the edges, hoppers, fliers to be met in the air,
// shooters that spit; hazards: spikes, springs, platforms riding up and down over the gaps. A section change
// swaps the hero, a drop sends giants that take two stomps.
const HEROES = {
  runner: { jump: 1.3, dj: false, dress: { cap: true, hatCol: HOT } }, // a cap, the plain jump
  knight: { jump: 1.15, dj: false, dress: { hat: true, hatCol: LMID, coat: true } }, // a helm and a shield, heavier
  ninja: { jump: 1.25, dj: true, dress: {} }, // bareheaded, a scarf streaming back, a second jump in the air
};
const HERO_W = { runner: [3, 2, 2], knight: [2, 2, 1], ninja: [1, 2, 3] };
// the critters: speed in tiles a second and what each does
const CRITTERS = {
  walker: { v: 0.7, size: 1 }, // the round one, patrols and turns at the edges
  hopper: { v: 0.4, size: 1, hop: true }, // tall on folded legs, springs up every other beat
  flier: { v: 1, size: 0.9, fly: true }, // wings, bobs along above head height
  shooter: { v: 0, size: 1, shoot: true }, // a pot with a head on a stalk that spits
};
const CRITTER_W = { walker: [3, 2, 1], hopper: [1, 2, 3], flier: [2, 2, 2], shooter: [1, 2, 2] };

// a critter at screen x on the ground `by`; `e.y` is how high it is above the ground
function drawCritter(r, kind, x, by, rr, u, t, e) {
  const col = e.flash > 0 ? BRIGHT : MID;
  if (e.sq > 0) { r.rect(x - rr, by - rr * 0.3, 2 * rr, rr * 0.3, col); return; }
  if (kind === 'hopper') {
    const air = e.y > 0, hh = rr * (air ? 2.4 : 1.9), top = by - e.y - hh;
    for (const k of [-0.45, 0.25]) { // the legs fold on the ground and stretch in the air
      if (air) r.stroke(x + k * rr, by - e.y - rr * 0.3, x + k * rr - rr * 0.2, by - e.y + rr * 0.3, Math.max(1, u), DARK);
      else { r.rect(x + k * rr, by - rr * 0.5, Math.max(1, u), rr * 0.5, DARK); r.rect(x + k * rr - rr * 0.25, by - rr * 0.5, rr * 0.5, Math.max(1, u), DARK); }
    }
    r.rect(x - rr * 0.45, top + rr * 0.3, rr * 0.9, hh - rr * (air ? 0.3 : 0.8), col);
    r.poly([[x - rr * 0.3, top + rr * 0.3], [x, top - rr * 0.3], [x + rr * 0.3, top + rr * 0.3]], HOT);
    r.rect(x - rr * 0.35, top + rr * 0.55, Math.max(1, u), Math.max(1, u), BRIGHT);
    if (air) r.rect(x - rr * 0.5, by - u, rr, Math.max(1, u), DARK + DIM);
  } else if (kind === 'flier') {
    const cy = by - e.y, flap = Math.sin(t * 14 + e.ph) * rr * 0.8;
    for (const k of [-1, 1]) r.poly([[x, cy], [x + k * rr * 1.5, cy - flap - rr * 0.2], [x + k * rr * 1.2, cy + rr * 0.3]], col);
    r.disc(x, cy, rr * 0.55, col);
    r.rect(x - rr * 0.35, cy - rr * 0.2, Math.max(1, u), Math.max(1, u), BRIGHT);
    r.rect(x - rr * 0.6, by - u, rr * 1.2, Math.max(1, u), DARK + DIM); // its shadow on the ground
  } else if (kind === 'shooter') {
    r.rect(x - rr * 0.7, by - rr * 0.9, rr * 1.4, rr * 0.9, DARK);
    r.rect(x - rr * 0.8, by - rr * 0.9, rr * 1.6, Math.max(1, u), LMID);
    r.rect(x - u * 0.5, by - rr * 1.8, Math.max(1, u), rr * 0.9, col);
    r.disc(x, by - rr * 2.1, rr * 0.55, e.flash > 0 ? BRIGHT : HOT);
    r.rect(x - rr * 0.9, by - rr * 2.1 - u, rr * 0.5, e.mouth > 0 ? 3 * u : Math.max(1, u), BRIGHT);
  } else { // the walker, and the giant
    const cy = by - rr;
    r.disc(x, cy, rr, col);
    r.rect(x - rr * 0.5, cy - rr * 0.2, Math.max(1, u), Math.max(1, u), BRIGHT);
    r.rect(x + rr * 0.4, cy - rr * 0.2, Math.max(1, u), Math.max(1, u), BRIGHT);
    r.rect(x - rr * 0.8, by - u, rr * 1.6, Math.max(1, u), DARK);
    if (e.big) for (const k of [-0.5, 0.1]) r.rect(x + k * rr, cy - rr * 0.6, rr * 0.4, Math.max(1, u), DARK); // the brow
  }
}

const platformer = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { scroll: 0, run: { y: 0, vy: 0, ph: 0, hurt: 0, air: false, dj: true }, hero: rollW(rnd, HERO_W, bandOf(W.a)), enemies: [], pellets: [], coins: [], pops: [], bump: {}, used: {}, sprung: {},
      seen: 18, score: 0, giants: 0, swapT: 0, sa: Math.floor(rnd() * 1000) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, T = N / 16, g = 0.82 * N, rx = 0.3 * N, run = w.run, bps = f.bpm ? f.bpm / 60 : 2, sa = w.sa, band = bandOf(W.a), H0 = 0.17 * N;
    const isPit = (c) => c > 8 && hash(c + sa, 1) < 0.1 && hash(c - 1 + sa, 1) >= 0.1;
    const wide = (c) => hash(c + sa, 7) < 0.5; // a pit two tiles across, with a platform riding over it
    const isGap = (c) => isPit(c) || (isPit(c - 1) && wide(c - 1));
    const pipeStart = (c) => c > 4 && hash(c + sa, 4) < 0.06 && hash(c - 1 + sa, 4) >= 0.06 && !isGap(c) && !isGap(c + 1);
    const inPipe = (c) => pipeStart(c) || pipeStart(c - 1);
    const blockRow = (c) => (hash(c + sa, 2) < 0.2 && !isGap(c) && !inPipe(c) ? (hash(c + sa, 3) < 0.3 ? 6 : 4) : 0);
    const isSpike = (c) => c > 10 && !isGap(c) && !inPipe(c) && hash(c + sa, 6) < 0.04 + 0.03 * band;
    const isSpring = (c) => c > 6 && !isGap(c) && !inPipe(c) && !isSpike(c) && hash(c + sa, 8) < 0.05;
    const platY = (c) => T * (0.9 + 0.5 * Math.sin(t * 1.5 + c)); // how high the platform over the pit at c rides now
    const sup = (c) => (!isGap(c) ? 0 : isPit(c) && wide(c) ? platY(c) : isPit(c - 1) && wide(c - 1) ? platY(c - 1) : null); // what holds a runner up here
    const spawn = (wx, kind, big) => w.enemies.push({ wx, kind, big, hp: big ? 2 : 1, sq: 0, y: 0, vy: 0, dir: -1, ph: rnd() * TAU, mouth: 0, flash: 0, cool: 1 + rnd() });
    w.scroll += dt * T * 2 * bps;
    const c0 = Math.floor(w.scroll / T), cUnder = Math.floor((rx + w.scroll) / T);
    for (let c = w.seen + 1; c <= c0 + 18; c++) if (c > 12 && hash(c + sa, 5) < 0.1 && !isGap(c) && !inPipe(c)) {
      const big = w.giants > 0;
      if (big) w.giants--;
      spawn(c * T + T / 2, big ? 'walker' : rollW(rnd, CRITTER_W, band), big);
    }
    w.seen = Math.max(w.seen, c0 + 18);
    if (f.section === 'change') { w.hero = rollW(rnd, HERO_W, band); w.swapT = 0.4; }
    else if (f.section === 'drop') { w.giants = 2; spawn(w.scroll + N + T, 'walker', true); }
    const hero = HEROES[w.hero];
    const jump = (v) => { run.vy = v * N; run.air = true; };
    for (const hh of hits) {
      if (isLow(hh)) {
        if (!run.air) jump(hero.jump);
        else if (hero.dj && run.dj) { jump(1.0); run.dj = false; for (let k = 0; k < 5; k++) w.pops.push({ wx: rx + w.scroll + (rnd() - 0.5) * T, y: g - run.y, vy: 0.3 * N, t: 0.45, puff: true }); }
      } else if (isTonal(hh)) w.coins.push({ wx: w.scroll + N + 2 * T, y: g - (2 + (hh.pc % 4)) * T });
    }
    const nxt = sup(cUnder + 1);
    if (!run.air && (nxt === null || nxt > run.y + 0.01 || inPipe(cUnder + 1) || inPipe(cUnder + 2) || isSpike(cUnder + 1))) jump(hero.jump);
    if (!run.air && isSpring(cUnder)) { jump(1.9); w.sprung[cUnder] = 1; }
    const prevY = run.y;
    run.vy -= 3.2 * N * dt;
    run.y += run.vy * dt;
    if (run.vy > 0) { // the head meets a block
      const row = blockRow(cUnder), headY = g - run.y - H0;
      if (row) {
        const by = g - row * T;
        if (headY <= by + T && headY > by + T - run.vy * dt - u) {
          w.bump[cUnder] = 1;
          run.vy = -0.2 * N;
          if (!w.used[cUnder]) { w.used[cUnder] = true; w.pops.push({ wx: cUnder * T + T / 2, y: by - T / 2, vy: 1.1 * N, t: 0 }); w.score++; }
        }
      }
    }
    const under = sup(cUnder);
    if (under === null) { run.air = true; if (run.y < -2 * T) { run.y = 0; run.vy = 0; run.air = false; run.hurt = 1; } }
    else if (run.air) { if (run.vy <= 0 && prevY >= under - 0.01 && run.y <= under) { run.y = under; run.vy = 0; run.air = false; run.dj = true; if (isSpike(cUnder) && run.hurt <= 0) run.hurt = 1; } }
    else if (run.y > under + 0.01) run.air = true; // walked off an edge
    else run.y = under; // carried by the ground, or by the platform
    run.ph += dt * bps * Math.PI;
    run.hurt -= dt; w.swapT -= dt;
    for (const k in w.bump) if ((w.bump[k] -= dt * 4) <= 0) delete w.bump[k];
    for (const k in w.sprung) if ((w.sprung[k] -= dt * 3) <= 0) delete w.sprung[k];

    // the back: clouds, hills
    for (let i = 0; i < 4; i++) {
      const cx = ((((i * 0.37 + 0.1) * N - w.scroll * 0.15) % (1.4 * N)) + 1.4 * N) % (1.4 * N) - 0.2 * N, cy = (0.12 + 0.07 * ((i * 7) % 3)) * N;
      for (const [dx, dy, rr] of [[0, 0, 0.035], [-0.03, 0.01, 0.025], [0.03, 0.01, 0.025]]) r.disc(cx + dx * N, cy + dy * N, rr * N, BRIGHT);
    }
    for (let i = 0; i < 3; i++) {
      const hx = ((((i * 0.5) * N - w.scroll * 0.4) % (1.5 * N)) + 1.5 * N) % (1.5 * N) - 0.25 * N;
      r.disc(hx, g, 0.16 * N, LMID);
    }
    // the tiles, the hazards
    for (let c = c0 - 1; c <= c0 + 18; c++) {
      const x = c * T - w.scroll;
      if (!isGap(c)) {
        r.rect(x, g, T, T, MID);
        r.rect(x, g, T, Math.max(1, u), LMID);
        r.rect(x + T * 0.25, g + T * 0.5, Math.max(1, u), Math.max(1, u), DARK);
        r.rect(x + T * 0.75, g + T * 0.5, Math.max(1, u), Math.max(1, u), DARK);
        r.rect(x, g + T, T, N - g - T, DARK);
        if (isSpike(c)) for (let k = 0; k < 3; k++) r.poly([[x + (k * T) / 3, g], [x + ((k + 0.5) * T) / 3, g - T * 0.5], [x + ((k + 1) * T) / 3, g]], LMID);
        if (isSpring(c)) { // a coil between two plates, squashed when it has just fired
          const ext = w.sprung[c] ? 0.3 + 0.7 * (1 - Math.sin(Math.PI * w.sprung[c])) : 1, top = g - T * 0.6 * ext;
          r.rect(x + T * 0.2, g - u, T * 0.6, Math.max(1, u), DARK);
          for (let k = 0; k < 3; k++) r.line(x + T * 0.3, g - ((k + 1) / 3) * (g - top), x + T * 0.7, g - ((k + 0.5) / 3) * (g - top), MID);
          r.rect(x + T * 0.15, top - u, T * 0.7, Math.max(1, 1.5 * u), HOT);
        }
      } else {
        if (isPit(c)) r.rect(x - u, g, Math.max(1, u), N - g, DARK);
        if (!isGap(c + 1)) r.rect(x + T, g, Math.max(1, u), N - g, DARK);
        if (isPit(c) && wide(c)) { // the platform and the rails it rides on
          const py = g - platY(c);
          for (const k of [0.3, 1.7]) r.rect(x + k * T - u * 0.5, g - T * 1.5, Math.max(1, u), N - g + T * 1.5, DARK + DIM);
          r.rect(x + T * 0.1, py, T * 1.8, T * 0.25, LMID);
          r.rect(x + T * 0.1, py + T * 0.25, T * 1.8, Math.max(1, u), DARK);
        }
      }
      const row = blockRow(c);
      if (row) {
        const by = g - row * T - (w.bump[c] ? 3 * u * Math.sin(Math.PI * w.bump[c]) : 0);
        r.rect(x, by, T, T, w.used[c] ? DARK : LMID);
        r.frame(Math.round(x), Math.round(by), Math.round(T), Math.round(T), DARK);
        if (!w.used[c]) r.rect(x + T / 2 - u, by + T / 2 - u, 2 * u, 2 * u, HOT);
      }
      if (pipeStart(c)) {
        r.rect(x, g - 2 * T, 2 * T, 2 * T, COOL);
        r.rect(x - u, g - 2 * T, 2 * T + 2 * u, T * 0.4, COOL);
        r.rect(x + u, g - 2 * T + T * 0.4, Math.max(1, u), 1.6 * T, BRIGHT);
      }
    }
    // coins, critters, pellets, the runner
    w.coins = w.coins.filter((cn) => {
      const x = cn.wx - w.scroll;
      if (Math.abs(x - rx) < T * 0.6 && Math.abs(cn.y - (g - run.y - 0.1 * N)) < T) { w.score++; w.pops.push({ wx: cn.wx, y: cn.y, vy: 0.6 * N, t: 0.3 }); return false; }
      r.disc(x, cn.y, T * 0.3, COOL);
      r.rect(x - u / 2, cn.y - T * 0.15, Math.max(1, u), T * 0.3, BRIGHT);
      return x > -T;
    });
    w.enemies = w.enemies.filter((e) => {
      const K = CRITTERS[e.kind], rr = T * 0.42 * K.size * (e.big ? 1.8 : 1);
      if (e.sq > 0) e.sq += dt * 3;
      else {
        if (K.fly) { e.y = T * (1.6 + 0.5 * Math.sin(t * 3 + e.ph)); e.wx -= dt * T * K.v; }
        else if (K.hop) {
          if (e.y <= 0 && e.vy <= 0 && f.beat.on && f.beat.count % 2 === 0) e.vy = 0.8 * N;
          if (e.y > 0 || e.vy > 0) { e.vy -= 3.2 * N * dt; e.y = Math.max(0, e.y + e.vy * dt); e.wx -= dt * T * K.v * 2; if (e.y === 0) e.vy = 0; }
        } else if (K.shoot) { if ((e.cool -= dt) <= 0) { e.cool = 1.6; e.mouth = 0.25; w.pellets.push({ wx: e.wx - rr * 1.2, y: rr * 2.1, vx: -T * 2.5 }); } }
        else { // patrols, turning at the edges and the pipes
          const ahead = Math.floor((e.wx + e.dir * rr) / T);
          if (isGap(ahead) || inPipe(ahead)) e.dir = -e.dir;
          e.wx += e.dir * dt * T * K.v;
        }
        e.mouth -= dt; e.flash -= dt;
      }
      const x = e.wx - w.scroll;
      if (e.sq <= 0 && Math.abs(x - rx) < rr + T * 0.3 && run.y < e.y + 2 * rr && run.y + H0 > e.y) {
        if (run.vy < 0 && run.y > e.y + rr * 0.7) { run.vy = 0.6 * N; w.score++; if (--e.hp <= 0) e.sq = 1e-3; else e.flash = 0.25; }
        else if (run.hurt <= 0) run.hurt = 1;
      }
      drawCritter(r, e.kind, x, g, rr, u, t, e);
      targets.push({ x: x - rr, y: g - e.y - 2 * rr, w: 2 * rr, h: 2 * rr });
      return x > -T && e.sq < 1;
    });
    w.pellets = w.pellets.filter((p) => {
      p.wx += p.vx * dt;
      const x = p.wx - w.scroll;
      r.disc(x, g - p.y, 1.5 * u, HOT);
      if (Math.abs(x - rx) < T * 0.3 && p.y > run.y && p.y < run.y + H0) { if (run.hurt <= 0) run.hurt = 1; return false; }
      return x > -T;
    });
    const col = (run.hurt > 0 || w.swapT > 0) && Math.floor(t * 20) % 2 ? BRIGHT : FIG, hy = g - run.y;
    if (under !== null) r.rect(rx - H0 * 0.15, g - under - u, H0 * 0.3, Math.max(1, u), DARK); // the shadow on whatever is under the runner
    const J = walker(r, rx, hy, H0, col, run.air ? 0.6 : run.ph, 1, hero.dress);
    if (w.hero === 'knight') { r.rect(J.sx + H0 * 0.02, J.sy + H0 * 0.04, H0 * 0.13, H0 * 0.32, COOL); r.rect(J.sx + H0 * 0.06, J.sy + H0 * 0.13, H0 * 0.05, H0 * 0.12, BRIGHT); } // the shield and its boss
    else if (w.hero === 'ninja') { // the headband, the scarf streaming back
      const len = H0 * (run.air ? 0.5 : 0.32), sy = J.head + H0 * 0.04;
      r.rect(rx - H0 * 0.12, J.head - H0 * 0.03, H0 * 0.24, Math.max(1, u), HOT);
      for (let k = 0; k < 3; k++) r.rect(rx - H0 * 0.1 - ((k + 1) * len) / 3, sy + Math.sin(t * 12 + k) * u - (run.air ? k * u : 0), len / 3, Math.max(1, u), HOT);
    }
    targets.push({ x: rx - 0.04 * N, y: hy - H0, w: 0.08 * N, h: H0 });
    w.pops = w.pops.filter((p) => {
      p.y -= p.vy * dt;
      p.vy -= 2.5 * N * dt;
      p.t += dt;
      if (p.puff) r.rect(p.wx - w.scroll - u, p.y - u, 2 * u, 2 * u, LMID); else r.disc(p.wx - w.scroll, p.y, T * 0.28, COOL);
      return p.t < 0.7;
    });
    for (let k = 0; k < w.score % 16; k++) r.disc(3 * u + k * 4 * u, 3 * u, 1.5 * u, COOL);
  },
};

// ---------------------------------------------------------------------------------------------- pong
// Two paddles and a ball that crosses the table in exactly one beat; the receiving paddle gets there just in
// time. A kick puts a flash on the ball, a note says where it lands next, a new section is a miss and a point.
const pong = {
  init(W) {
    Object.assign(W.w, { from: 0.5, ty: 0.5, next: null, pL: 0.5, pR: 0.5, scoreL: 0, scoreR: 0, hitL: 0, hitR: 0, leg: -1, ph: 0, flash: 0, miss: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, per = W.a < 0.45 ? 2 : 1;
    const q = beatLocked(f) ? (f.beat.count + f.beat.phase) / per : (w.ph += (dt * (f.bpm ? f.bpm / 60 : 2)) / per);
    const leg = Math.floor(q), p = q - leg, dir = leg % 2 ? -1 : 1;
    if (leg !== w.leg) { // the ball leaves a paddle; where it lands is the last note's pitch, or anyone's guess
      w.leg = leg;
      w.from = w.ty;
      w.ty = w.next ?? 0.15 + rnd() * 0.7;
      w.next = null;
      if (dir > 0) w.hitL = 0.15; else w.hitR = 0.15;
      if (w.miss > 0) { w.miss = 0; if (dir > 0) w.scoreR++; else w.scoreL++; }
    }
    for (const h of hits) {
      if (isLow(h)) w.flash = 0.1;
      else if (isTonal(h)) w.next = 0.15 + (h.pc / 11) * 0.7;
    }
    if (f.section) w.miss = 1; // the receiver is late this once
    w.hitL -= dt; w.hitR -= dt; w.flash -= dt;
    const xa = dir > 0 ? 0.07 : 0.93, xb = dir > 0 ? 0.93 : 0.07, bx = lerp(xa, xb, p) * N, by = lerp(w.from, w.ty, p) * N, late = w.miss ? 0.2 : 0;
    w.pL = follow(w.pL, dir > 0 ? w.from : w.ty + late, dt, 0.25);
    w.pR = follow(w.pR, dir > 0 ? w.ty + late : w.from, dt, 0.25);
    for (let y = 2 * u; y < N; y += 4 * u) r.rect(N / 2 - u / 2, y, Math.max(1, u), 2 * u, LMID);
    r.rect(0, 0, N, Math.max(1, u), LMID);
    r.rect(0, N - u, N, Math.max(1, u), LMID);
    const ph = 0.14 * N;
    r.rect(0.04 * N, w.pL * N - ph / 2, 2 * u, ph, w.hitL > 0 ? BRIGHT : FIG);
    r.rect(0.96 * N - 2 * u, w.pR * N - ph / 2, 2 * u, ph, w.hitR > 0 ? BRIGHT : FIG);
    for (let k = 3; k >= 1; k--) { const tp = Math.max(0, p - k * 0.04); r.rect(lerp(xa, xb, tp) * N - u, lerp(w.from, w.ty, tp) * N - u, 2 * u, 2 * u, k === 1 ? MID : DARK); }
    r.rect(bx - 1.5 * u, by - 1.5 * u, 3 * u, 3 * u, w.flash > 0 ? BRIGHT : FIG);
    for (let k = 0; k < w.scoreL % 10; k++) r.rect(0.3 * N + k * 3 * u, 3 * u, 2 * u, 5 * u, LMID);
    for (let k = 0; k < w.scoreR % 10; k++) r.rect(0.7 * N - k * 3 * u - 2 * u, 3 * u, 2 * u, 5 * u, LMID);
    targets.push({ x: bx - 2 * u, y: by - 2 * u, w: 4 * u, h: 4 * u });
  },
};

// ---------------------------------------------------------------------------------------------- western
// High noon, or a dust storm, rain, or night: a big low sun or a moon, mesas, a cactus, tumbleweeds rolling at
// the tempo, a bird circling, now and then a train crossing the horizon far behind. A kick is the one on the
// left drawing and firing, a snare the one on the right; a heavy shot puts someone in the dust. Builds: a
// poncho, a sheriff with a star, a bandit behind a bandana with a short shotgun, a long coat with a rifle; each
// gun its own crack: a revolver's single flash, a rifle's long trace, a shotgun's wide spread. A section change
// changes the weather, a drop brings the long coats and the train.
function gun(x, dir, build) {
  return { x, dir, build, fire: 0, hit: 0, down: 0, twitch: 0 };
}
const GUNMEN = {
  poncho: { gun: 'revolver', h: 1, dress: { hat: true, coat: true } }, // a wide poncho over the shoulders
  sheriff: { gun: 'revolver', h: 1, dress: { hat: true } }, // a vest and a star on it
  bandit: { gun: 'shotgun', h: 0.95, dress: {} }, // bareheaded, a bandana over the face, a short shotgun
  duster: { gun: 'rifle', h: 1.08, dress: { hat: true, coat: true } }, // a long coat down to the boots, a rifle
};
const GUNMAN_W = { sheriff: [3, 2, 1], poncho: [2, 2, 3], bandit: [1, 2, 3], duster: [2, 2, 1] };
// the weather: noon heat, a dust storm, rain with lightning, night under a moon
const WEATHER_W = { noon: [3, 2, 2], dust: [1, 2, 3], rain: [2, 1, 1], night: [2, 2, 1] };

const western = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { g: 0.6, sunX: 0.3 + rnd() * 0.4, mesas: Array.from({ length: 4 }, (_, i) => [i * 0.27 + rnd() * 0.1, 0.1 + rnd() * 0.15, 0.06 + rnd() * 0.08]), weather: rollW(rnd, WEATHER_W, band),
      cactus: rnd() < 0.5 ? 0.12 + rnd() * 0.08 : 0.82 + rnd() * 0.08, tumbles: [{ x: -0.1, a: 0, s: 1 }], bird: rnd() * TAU, A: gun(0.2, 1, rollW(rnd, GUNMAN_W, band)), B: gun(0.8, -1, rollW(rnd, GUNMAN_W, band)),
      traces: [], dust: [], drops: [], train: null, bolt: 0, smoke: [] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = w.g * N, h = 0.24 * N, standoff = W.a < 0.4, band = bandOf(W.a), wx = w.weather;
    const fire = (att, def, strength) => {
      const kind = GUNMEN[att.build].gun, y = g - h * 0.45;
      att.fire = 0.12;
      if (kind === 'shotgun') for (const k of [-2, 0, 2]) w.traces.push({ x0: att.x * N + att.dir * h * 0.3, x1: def.x * N, y0: y, y1: y + k * 1.5 * u, t: 0.05 });
      else w.traces.push({ x0: att.x * N + att.dir * h * (kind === 'rifle' ? 0.42 : 0.3), x1: def.x * N, y0: y, y1: y, t: kind === 'rifle' ? 0.09 : 0.05 });
      def.hit = 0.3;
      def.x += att.dir * (kind === 'revolver' ? 0.015 : 0.025);
      burst(w.dust, rnd, def.x * N, g, kind === 'shotgun' ? 16 : 10, N * 0.25, MID, 0.6);
      s.shake = Math.max(s.shake, (kind === 'revolver' ? 0.3 : 0.4) * strength);
      if (strength > (kind === 'revolver' ? 0.85 : 0.75) && rnd() < 0.5 && def.down <= 0) def.down = 2.5;
    };
    for (const hh of hits) {
      if (standoff) { if (isLow(hh)) { w.A.twitch = 0.2; w.B.twitch = 0.2; } continue; }
      if (isLow(hh) && w.A.down <= 0) fire(w.A, w.B, hh.strength);
      else if (hh.kind === 'snare' && w.B.down <= 0) { fire(w.B, w.A, hh.strength); if (wx === 'rain' && hh.strength > 0.8) w.bolt = 0.15; }
      else if (hh.kind === 'hat') w.bird += 0.4;
    }
    if (f.section) {
      w.A.x = 0.2; w.B.x = 0.8; w.A.down = w.B.down = 0; w.sunX = 0.25 + rnd() * 0.5;
      if (f.section === 'drop') { w.A.build = w.B.build = 'duster'; w.train = { x: -0.7, v: 0.16 }; }
      else { w.weather = rollW(rnd, WEATHER_W, band); if (rnd() < 0.5) (rnd() < 0.5 ? w.A : w.B).build = rollW(rnd, GUNMAN_W, band); }
    }
    if (f.beat.on && f.beat.count % 32 === 0 && !w.train) w.train = { x: -0.7, v: 0.14 };
    for (const G of [w.A, w.B]) { G.fire -= dt; G.hit -= dt; G.down -= dt; G.twitch -= dt; }
    w.A.x = follow(w.A.x, 0.2, dt, 4);
    w.B.x = follow(w.B.x, 0.8, dt, 4);
    w.bolt -= dt;
    const wantT = wx === 'dust' ? 3 : wx === 'rain' ? 0 : 1;
    while (w.tumbles.length < wantT) w.tumbles.push({ x: -0.1 - rnd() * 0.5, a: rnd() * TAU, s: 0.7 + rnd() * 0.6 });
    if (w.tumbles.length > wantT) w.tumbles.length = wantT;
    for (const tb of w.tumbles) { const dx = dt * 0.06 * (1 + 2 * f.level) * (wx === 'dust' ? 2.5 : 1); tb.x += dx; tb.a += (dx * N) / (4 * u * tb.s); if (tb.x > 1.1) tb.x = -0.1 - rnd() * 0.3; } // it rolls at the speed it travels
    w.bird += dt * 0.25;
    // the sky by the weather
    if (w.bolt > 0) r.fill(BRIGHT);
    if (wx === 'noon') { r.disc(w.sunX * N, g - 0.16 * N, 0.11 * N, HOT); for (let y = Math.round(g - 0.06 * N); y < g; y += 2) r.rect(0, y, N, 1, LMID); }
    else if (wx === 'dust') { r.disc(w.sunX * N, g - 0.16 * N, 0.11 * N, MID); for (let k = 0; k < 4; k++) r.rect(0, g - (0.1 + k * 0.08) * N, N, 2 * u, LMID + DIM); }
    else if (wx === 'night') { r.disc(w.sunX * N, 0.12 * N, 0.05 * N, BRIGHT); for (let k = 0; k < 40; k++) r.set(hash(k, 2) * N, hash(k, 3) * g * 0.8, hash(k, 4) < 0.3 ? BRIGHT : LMID); }
    else { for (let x = 0; x < N; x += 2) r.rect(x, 0, 2, 0.2 * N + 0.04 * N * Math.sin(x / N * 7 + t * 0.3) + 0.02 * N * Math.sin(x / N * 19), DARK + DIM); }
    for (const [x, mw, mh] of w.mesas) r.poly([[x * N, g], [(x + mw * 0.15) * N, g - mh * N], [(x + mw * 0.85) * N, g - mh * N], [(x + mw) * N, g]], wx === 'dust' ? MID + DIM : DARK);
    if (w.train) { // far off along the horizon: an engine with its smoke and a string of cars
      const tr = w.train, th = 0.045 * N, tx = tr.x * N;
      tr.x += dt * tr.v;
      for (let k = 0; k < 5; k++) { const cx = tx - (k + 1) * 0.11 * N; r.rect(cx, g - th, 0.1 * N, th, DARK); for (let q = 0; q < 3; q++) r.rect(cx + 2 * u + q * 0.03 * N, g - th + 2 * u, 2 * u, 2 * u, wx === 'night' ? BRIGHT : LMID); for (const wq of [0.02, 0.08]) r.disc(cx + wq * N, g - u, 1.5 * u, BLACK); }
      r.rect(tx, g - th, 0.09 * N, th, DARK);
      r.rect(tx + 0.06 * N, g - th * 1.6, 0.03 * N, th * 0.6, DARK);
      r.rect(tx + 0.01 * N, g - th * 1.7, 2 * u, th * 0.7, DARK);
      r.rect(tx + 0.09 * N, g - th * 0.6, 1.5 * u, 2 * u, BRIGHT);
      if (rnd() < dt * 10) w.smoke.push({ x: tx + 0.01 * N + u, y: g - th * 1.7, life: 1.5 });
      if (tr.x > 1.6) w.train = null;
    }
    w.smoke = w.smoke.filter((p) => { p.y -= dt * 6 * u; p.x -= dt * 4 * u; p.life -= dt; r.rect(p.x, p.y, Math.max(1, 1.5 * u), Math.max(1, u), LMID + DIM); return p.life > 0; });
    r.rect(0, g, N, N - g, wx === 'night' ? MID + DIM : MID);
    for (let k = 0; k < 7; k++) r.rect((((k * 0.37 + t * 0.01) % 1.2) - 0.1) * N, g + 3 * u + k * k * 1.2 * u, (0.1 + k * 0.03) * N, Math.max(1, u), wx === 'night' ? MID : LMID);
    if (wx === 'rain') for (const [px, pw] of [[0.3, 0.12], [0.55, 0.08], [0.7, 0.1]]) r.ring(px * N, g + 0.1 * N, pw * N, 2 * u, LMID + DIM, 0.2); // puddles
    const cx = w.cactus * N;
    r.rect(cx - 1.5 * u, g - 0.2 * N, 3 * u, 0.2 * N, DARK);
    r.rect(cx - 7 * u, g - 0.14 * N, 2.5 * u, 0.06 * N, DARK);
    r.rect(cx - 7 * u, g - 0.09 * N, 7 * u, 2 * u, DARK);
    r.rect(cx + 4.5 * u, g - 0.16 * N, 2.5 * u, 0.07 * N, DARK);
    r.rect(cx, g - 0.1 * N, 7 * u, 2 * u, DARK);
    const bxx = 0.5 * N + 0.32 * N * Math.cos(w.bird), byy = 0.14 * N + 0.05 * N * Math.sin(2 * w.bird), flap = Math.floor(t * 6) % 2 ? 1.5 * u : 0;
    r.line(bxx - 2.5 * u, byy - flap, bxx, byy, DARK);
    r.line(bxx, byy, bxx + 2.5 * u, byy - flap, DARK);
    for (const tb of w.tumbles) {
      const tx = tb.x * N, tr = 4 * u * tb.s, ty = g + 2 * u - tr - Math.abs(Math.sin(tb.a * 0.7)) * 2 * u;
      r.ring(tx, ty, tr, Math.max(1, u), DARK);
      for (let k = 0; k < 3; k++) { const a = tb.a + (k * TAU) / 3; r.line(tx - Math.cos(a) * tr, ty - Math.sin(a) * tr, tx + Math.cos(a) * tr, ty + Math.sin(a) * tr, DARK); }
    }
    for (const G of [w.A, w.B]) {
      const B = GUNMEN[G.build], gh = h * B.h, col = G.hit > 0.15 ? BRIGHT : G === w.A ? FIG : DARK, x = G.x * N;
      r.rect(x - gh * 0.2, g, gh * 0.4, Math.max(1, u), wx === 'night' ? DARK : LMID);
      if (G.down > 0) {
        r.rect(x - gh * 0.35, g - gh * 0.13, gh * 0.7, gh * 0.13, col);
        r.disc(x + G.dir * gh * 0.42, g - gh * 0.08, gh * 0.1, col);
        targets.push({ x: x - gh * 0.4, y: g - gh * 0.2, w: gh * 0.9, h: gh * 0.2 });
        continue;
      }
      if (G.build === 'duster') r.rect(x - gh * 0.24, g - gh * 0.45, gh * 0.48, gh * 0.3, col); // the coat down to the boots
      const J = walker(r, x, g, gh, col, 0, G.dir, B.dress);
      if (G.build === 'poncho') { r.poly([[x - J.hw * 1.1, J.sy - 2 * u], [x + J.hw * 1.1, J.sy - 2 * u], [x + J.hw * 1.7, J.sy + gh * 0.3], [x - J.hw * 1.7, J.sy + gh * 0.3]], col); r.rect(x - J.hw * 1.5, J.sy + gh * 0.16, J.hw * 3, Math.max(1, u), LMID); }
      else if (G.build === 'sheriff') { r.rect(x - J.hw * 0.9, J.sy + u, J.hw * 0.6, gh * 0.25, LMID + DIM); r.rect(x + J.hw * 0.3, J.sy + u, J.hw * 0.6, gh * 0.25, LMID + DIM); r.rect(x + G.dir * J.hw * 0.4 - u, J.sy + gh * 0.06, 2 * u, 2 * u, BRIGHT); }
      else if (G.build === 'bandit') { r.rect(x - gh * 0.1, J.head - u, gh * 0.2, gh * 0.08, DARK + DIM); r.rect(x - G.dir * gh * 0.14, J.head, gh * 0.06, Math.max(1, u), DARK + DIM); }
      const hy = J.sy + gh * 0.33 + (G.twitch > 0 ? -2 * u : 0), hx = J.sx;
      if (G.fire > 0) { // the arm out, the gun, the flash
        const L = B.gun === 'rifle' ? 0.4 : B.gun === 'shotgun' ? 0.24 : 0.1, armL = B.gun === 'revolver' ? 0.25 : 0.2;
        r.stroke(hx, hy - gh * 0.1, hx + G.dir * gh * armL, hy - gh * 0.12, 1.5 * u, col);
        if (B.gun !== 'revolver') r.stroke(x - G.dir * J.hw * 0.5, hy - gh * 0.05, hx + G.dir * gh * 0.32, hy - gh * 0.13, 1.5 * u, col); // the other hand on the stock
        r.rect(G.dir > 0 ? hx + gh * armL : hx - gh * (armL + L), hy - gh * 0.14, gh * L, B.gun === 'shotgun' ? 2.5 * u : 1.5 * u, DARK);
        if (G.fire > 0.06) { const fx = hx + G.dir * gh * (armL + L + 0.03), fr = B.gun === 'shotgun' ? 4.5 * u : B.gun === 'rifle' ? 2.5 * u : 3 * u; r.disc(fx, hy - gh * 0.13, fr, BRIGHT); if (B.gun === 'shotgun') r.ring(fx, hy - gh * 0.13, 7 * u, 1.5 * u, HOT); }
      } else if (B.gun === 'rifle') r.stroke(x - G.dir * gh * 0.12, hy + gh * 0.15, x + G.dir * gh * 0.16, hy - gh * 0.12, 1.5 * u, DARK); // held across
      else if (B.gun === 'shotgun') r.stroke(hx, hy, hx + G.dir * gh * 0.05, hy + gh * 0.24, 2 * u, DARK); // held low
      else r.rect(hx - u, hy - 2 * u, 2 * u, 4 * u, DARK); // the holster
      targets.push({ x: x - gh * 0.22, y: g - gh, w: gh * 0.44, h: gh });
    }
    w.traces = w.traces.filter((tr) => { tr.t -= dt; r.line(tr.x0, tr.y0, tr.x1, tr.y1, BRIGHT); return tr.t > 0; });
    w.dust = particles(W, w.dust, MID);
    if (wx === 'dust') for (let k = 0; k < Math.round(40 * u); k++) r.rect(((hash(k, 5) + t * (0.5 + hash(k, 6) * 0.5)) % 1.1) * N - 0.05 * N, hash(k, 7) * N, 3 * u, 1, LMID + DIM); // sand on the wind
    if (wx === 'rain') {
      const want = Math.round((50 + 80 * f.level) * u);
      while (w.drops.length < want) w.drops.push({ x: rnd() * N * 1.2, y: -rnd() * N });
      if (w.drops.length > want) w.drops.length = want;
      for (const dp of w.drops) { dp.y += dt * N * 1.1; dp.x -= dt * N * 0.2; if (dp.y > N) { dp.y = -rnd() * 0.2 * N; dp.x = rnd() * N * 1.2; } r.line(dp.x, dp.y, dp.x + u, dp.y - 4 * u, LMID); }
      if (w.bolt > 0.1) { let px = w.sunX * N, py = 0; for (let i = 1; i <= 5; i++) { const nx = px + (hash(i, Math.floor(t * 30)) - 0.5) * 0.12 * N, ny = (g / 5) * i; r.stroke(px, py, nx, ny, 1.5 * u, i % 2 ? WHITE : BRIGHT); px = nx; py = ny; } }
    }
  },
};

// ---------------------------------------------------------------------------------------------- ring
// A fighting game: health bars, a round counter, a clock running down the bar, a crowd that fills in with the
// energy and bobs on the beat. A kick is the left fighter's move, a snare the right one's, each in a style: a
// boxer's straight from the shoulder, a kicker's leg from the hip, a grappler closing in to throw the other over
// (and the sides swap), a brawler's haymaker that whites the frame out; the hats make boxers sway, kickers hop,
// grapplers crouch. At zero health someone goes down for a bar. A section change retrains one, a drop brings brawlers.
function boxer(x, dir, style) {
  return { x, home: x, dir, style, punch: 0, hit: 0, hp: 1, down: 0, throw: 0, hop: 0 };
}
const STYLES = {
  boxer: { reach: 0.42, dmg: 1, push: 0.03 }, // a straight from the shoulder, gloves up between
  kicker: { reach: 0.6, dmg: 1.2, push: 0.045, kick: true }, // a high kick swung from the hip
  grappler: { reach: 0.3, dmg: 0.9, push: 0, grab: true }, // both arms out, lifts and throws over the shoulder
  brawler: { reach: 0.5, dmg: 1.6, push: 0.06, wild: true }, // a wide haymaker from behind the shoulder, slow
};
const STYLE_W = { boxer: [3, 2, 2], grappler: [2, 2, 1], kicker: [1, 2, 3], brawler: [0, 1, 2] };
// the stages: an arena under lights, a gym with windows and a bag, a rooftop at night
const STAGE_W = { arena: [2, 2, 3], gym: [3, 2, 1], rooftop: [2, 2, 2] };

const ring = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { A: boxer(0.36, 1, rollW(rnd, STYLE_W, band)), B: boxer(0.64, -1, rollW(rnd, STYLE_W, band)), stage: rollW(rnd, STAGE_W, band),
      crowd: Array.from({ length: 36 }, (_, i) => [((i % 12) + 0.5 + (i > 11 && i < 24 ? 0.5 : 0)) / 12.5, i > 23 ? 2 : i > 11 ? 1 : 0]),
      sky: Array.from({ length: 9 }, () => [0.08 + rnd() * 0.08, 0.1 + rnd() * 0.25]), round: 1, sparks: [], flash: 0, cheer: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.74 * N, h = 0.32 * N, band = bandOf(W.a);
    const strike = (att, def, strength) => {
      const S = STYLES[att.style];
      att.punch = 1;
      if (Math.abs(att.x - def.x) > (S.grab ? 0.3 : 0.4) || def.throw > 0) return;
      def.hit = 1;
      def.hp -= (0.06 + 0.12 * strength) * S.dmg;
      w.cheer = 0.4;
      if (S.grab) { // over the shoulder and down behind: the two swap sides
        def.throw = 1; def.sx = def.x; def.tx = att.x - att.dir * 0.16;
        [att.home, def.home] = [def.home, att.home];
        att.dir = -att.dir; def.dir = -def.dir;
      } else def.x += att.dir * S.push * (strength > 0.85 ? 2 : 1);
      burst(w.sparks, rnd, ((att.x + def.x) / 2) * N, g - h * (S.kick ? 0.85 : 0.75), 10, N * 0.5, BRIGHT, 0.35);
      s.shake = Math.max(s.shake, 0.4 * strength * S.dmg);
      if (strength > 0.85 || (S.wild && strength > 0.6)) w.flash = 0.05;
      if (def.hp <= 0) { def.down = 2; def.hp = 1; w.round++; }
    };
    for (const hh of hits) {
      if (isLow(hh) && w.A.down <= 0 && w.A.throw <= 0) strike(w.A, w.B, hh.strength);
      else if (hh.kind === 'snare' && w.B.down <= 0 && w.B.throw <= 0) strike(w.B, w.A, hh.strength);
      else if (hh.kind === 'hat') { w.A.hop = 1; w.B.hop = 1; }
    }
    if (f.section) {
      w.A.hp = w.B.hp = 1; w.A.down = w.B.down = 0; w.round++;
      if (f.section === 'drop') w.A.style = w.B.style = 'brawler';
      else (rnd() < 0.5 ? w.A : w.B).style = rollW(rnd, STYLE_W, band);
    }
    for (const F of [w.A, w.B]) {
      F.punch -= dt * 5; F.hit -= dt * 5; F.down -= dt; F.hop -= dt * 4;
      if (F.throw > 0) { // in the air over the other one
        F.throw -= dt * 1.5;
        F.x = lerp(F.sx, F.tx, ease(1 - Math.max(0, F.throw)));
        if (F.throw <= 0) F.down = Math.max(F.down, 0.9);
      } else F.x = follow(F.x, F.home, dt, 1.5);
    }
    w.flash -= dt; w.cheer -= dt;
    if (w.flash > 0) r.fill(BRIGHT);
    else {
      if (w.stage === 'arena') { // dark, two lamps throwing cones down on the crowd
        r.rect(0, 0, N, 0.5 * N, DARK);
        for (const lx of [0.22, 0.78]) { r.poly([[lx * N - 2 * u, 0], [lx * N + 2 * u, 0], [lx * N + 0.16 * N, 0.5 * N], [lx * N - 0.16 * N, 0.5 * N]], MID + DIM); r.rect(lx * N - 3 * u, 0, 6 * u, 2 * u, BRIGHT); }
      } else if (w.stage === 'gym') { // windows, a bag on a chain
        r.rect(0, 0, N, 0.5 * N, DARK);
        for (let k = 0; k < 3; k++) { const x = 0.12 * N + k * 0.3 * N; r.rect(x, 0.05 * N, 0.12 * N, 0.17 * N, LMID); r.rect(x + 0.06 * N - u / 2, 0.05 * N, Math.max(1, u), 0.17 * N, DARK); r.rect(x, 0.13 * N, 0.12 * N, Math.max(1, u), DARK); }
        r.rect(0.93 * N - u, 0, 2 * u, 0.08 * N, MID);
        r.rect(0.93 * N - 3.5 * u, 0.08 * N, 7 * u, 0.16 * N, MID);
      } else { // a rooftop: the skyline and a moon
        r.disc(0.8 * N, 0.1 * N, 0.05 * N, BRIGHT);
        let sx = 0;
        for (const [bw, bh] of w.sky) {
          r.rect(sx * N, (0.5 - bh) * N, bw * N, bh * N, DARK);
          for (let y = (0.5 - bh) * N + 3 * u; y < 0.48 * N; y += 4 * u) for (let x = sx * N + 2 * u; x < (sx + bw) * N - 2 * u; x += 3 * u) if (hash(Math.round(x), Math.round(y)) < 0.3) r.rect(x, y, Math.max(1, u), Math.max(1, u), LMID);
          sx += bw;
        }
        r.rect(0, 0.47 * N, N, 0.03 * N, MID);
      }
      // the crowd fills in with the energy, bobs on the beat and throws its arms up when something lands
      const energy = clamp(0.3 + 0.5 * f.level + 0.4 * f.rel.bassDrive) * (w.stage === 'rooftop' ? 0.6 : 1);
      w.crowd.forEach(([cx, row], i) => {
        if (hash(i, 5) > energy) return;
        const y = (0.3 + row * 0.07) * N + (row % 2 ? f.beat.pulse : 1 - f.beat.pulse) * 1.5 * u, hr = (3 - row * 0.4) * u;
        r.disc(cx * N, y, hr, MID);
        r.rect(cx * N - hr * 1.6, y + hr * 0.6, hr * 3.2, hr * 1.6, MID);
        if (w.cheer > 0 && hash(i, 6) < 0.6) for (const k of [-1, 1]) r.line(cx * N + k * hr * 1.4, y + hr, cx * N + k * hr * 2, y - hr * 1.5, MID);
      });
    }
    for (let k = 0; k < 3; k++) r.rect(0, (0.52 + k * 0.07) * N, N, Math.max(1, u), LMID);
    for (const x of [0.02, 0.98]) r.rect(x * N - 1.5 * u, 0.48 * N, 3 * u, 0.26 * N, HOT);
    r.rect(0, g, N, N - g, BRIGHT);
    r.rect(0, g, N, Math.max(1, u), LMID);
    for (const F of [w.A, w.B]) {
      const S = STYLES[F.style], col = F.hit > 0.6 ? BRIGHT : F === w.A ? FIG : DARK, hop = Math.max(0, F.hop), p = Math.sin(Math.PI * clamp(F.punch));
      const x = (F.x + F.dir * 0.05 * p) * N;
      r.rect(x - h * 0.2, g, h * 0.4, Math.max(1, u), LMID);
      if (F.throw > 0) { // flying, feet first
        const y = g - Math.sin(Math.PI * (1 - F.throw)) * h * 0.6;
        r.rect(x - h * 0.35, y - h * 0.14, h * 0.7, h * 0.14, col);
        r.disc(x - F.dir * h * 0.42, y - h * 0.09, h * 0.11, col);
        targets.push({ x: x - h * 0.4, y: y - h * 0.2, w: h * 0.9, h: h * 0.2 });
        continue;
      }
      if (F.down > 0) {
        r.rect(x - h * 0.35, g - h * 0.13, h * 0.7, h * 0.13, col);
        r.disc(x - F.dir * h * 0.42, g - h * 0.09, h * 0.11, col);
        targets.push({ x: x - h * 0.4, y: g - h * 0.2, w: h * 0.9, h: h * 0.2 });
        continue;
      }
      const hy = g - (S.kick ? 3 * u * Math.sin(Math.PI * hop) : 0), hh = h * (S.grab && hop > 0 ? 0.92 : 1), sway = F.style === 'boxer' ? Math.sin(t * 8) * 2 * u * hop : 0;
      const J = walker(r, x + sway, hy, hh, col, 0.2 * Math.sin(t * 6 + F.dir), F.dir, {}), sy = J.sy + hh * 0.12;
      if (S.kick) { // the leg swings up from the hip, the guard stays up
        const hipX = x + sway, hipY = hy - hh * 0.32, L = hh * 0.5;
        if (F.punch > 0) { const ang = lerp(1.4, -0.45, p), fx = hipX + F.dir * Math.cos(ang) * L, fy = hipY + Math.sin(ang) * L; r.stroke(hipX, hipY, fx, fy, 2.5 * u, col); r.disc(fx, fy, 2.5 * u, HOT); }
        r.disc(J.sx + F.dir * hh * 0.06, sy, 2.5 * u, HOT);
        r.disc(J.sx - F.dir * hh * 0.02, sy + hh * 0.1, 2.5 * u, HOT);
      } else if (S.grab) { // both arms out, open hands
        const reach = hh * (0.22 + 0.2 * p);
        for (const dy of [-0.03, 0.07]) { r.stroke(J.sx, sy + dy * hh, J.sx + F.dir * reach, sy + dy * hh * 2, 2.5 * u, col); r.rect(J.sx + F.dir * reach - 1.5 * u, sy + dy * hh * 2 - 1.5 * u, 3 * u, 3 * u, HOT); }
      } else if (S.wild) { // the haymaker comes round from behind the shoulder
        const L = hh * 0.45, ang = F.punch > 0 ? lerp(-2.4, 0.2, 1 - clamp(F.punch)) : 1.2, fx = J.sx + F.dir * Math.cos(ang) * L, fy = sy + Math.sin(ang) * L;
        r.stroke(J.sx, sy, fx, fy, 3 * u, col);
        r.disc(fx, fy, 4 * u, HOT);
      } else if (F.punch > 0) { // the straight
        const reach = hh * S.reach * p;
        r.stroke(J.sx, sy, J.sx + F.dir * reach, sy - hh * 0.05, 2.5 * u, col);
        r.disc(J.sx + F.dir * reach, sy - hh * 0.05, 3 * u, HOT);
      } else { r.disc(J.sx + F.dir * hh * 0.08, sy - hh * 0.02, 3 * u, HOT); r.disc(J.sx - F.dir * hh * 0.02, sy + hh * 0.1, 3 * u, HOT); } // gloves up
      targets.push({ x: x - h * 0.25, y: hy - hh, w: h * 0.5, h: hh });
    }
    w.sparks = particles(W, w.sparks, BRIGHT);
    const bw = 0.38 * N;
    r.frame(Math.round(0.04 * N), Math.round(0.04 * N), Math.round(bw), Math.round(4 * u), LMID);
    r.rect(0.04 * N + bw * (1 - w.A.hp), 0.04 * N, bw * w.A.hp, 4 * u, w.A.hp < 0.3 ? HOT : COOL);
    r.frame(Math.round(0.58 * N), Math.round(0.04 * N), Math.round(bw), Math.round(4 * u), LMID);
    r.rect(0.58 * N, 0.04 * N, bw * w.B.hp, 4 * u, w.B.hp < 0.3 ? HOT : COOL);
    for (let k = 0; k < Math.min(5, w.round); k++) r.rect(0.5 * N - 5 * u + k * 2.5 * u, 0.04 * N, 1.5 * u, 2 * u, BRIGHT);
    const left = 16 - (f.beat.count % 16);
    for (let k = 0; k < left; k++) r.rect(0.5 * N - 8 * u + k * u, 0.085 * N, Math.max(1, u * 0.6), 2 * u, k < 4 ? HOT : LMID);
  },
};

// ---------------------------------------------------------------------------------------------- rain
// A night street in the rain: neon signs in shapes (a block grid, a ring, chevrons, an arrow, a cup, a starburst)
// and their broken reflections on the wet road, passers-by walking at the tempo (under an umbrella, hooded, a
// newspaper over the head, two under one umbrella, a dog on a lead, a cyclist bent over the bars), steam off a
// grate on the hats, signs that flicker on the snare, and cars that pass on the bar with their lights: sedans,
// taxis with a roof light, vans, buses with lit windows. A section change changes who is out, a drop sends a bus.
const PASSERS = {
  umbrella: { v: 1, h: 0.2 }, // the umbrella in the near hand
  hooded: { v: 1.3, h: 0.19 }, // a hood up, hunched, quicker
  paper: { v: 1.5, h: 0.2 }, // a newspaper held over the head, hurrying
  couple: { v: 0.9, h: 0.2 }, // two under one big umbrella
  dog: { v: 1.1, h: 0.19 }, // an umbrella and a dog on a lead
  cyclist: { v: 3, h: 0.18 }, // on a bicycle
};
const PASSER_W = { umbrella: [3, 2, 2], hooded: [2, 2, 3], paper: [1, 2, 2], couple: [2, 1, 1], dog: [1, 2, 1], cyclist: [0, 1, 3] };
const CARS = { sedan: { len: 0.2, h: 0.08 }, taxi: { len: 0.2, h: 0.08, roof: true }, van: { len: 0.22, h: 0.12 }, bus: { len: 0.34, h: 0.13 } };
const CAR_W = { sedan: [3, 2, 2], taxi: [2, 2, 2], van: [1, 2, 2], bus: [1, 2, 3] };
const SIGN_SHAPES = ['grid', 'ring', 'chevrons', 'arrow', 'cup', 'burst'];

function newPasser(rnd, band, x) {
  const kind = rollW(rnd, PASSER_W, band);
  return { kind, x, dir: rnd() < 0.6 ? 1 : -1, ph: rnd() * TAU, h: PASSERS[kind].h };
}

const rain = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), signs = [];
    for (let x = 0.04; x < 0.95; x += 0.1 + rnd() * 0.12)
      signs.push({ x, y: 0.12 + rnd() * 0.3, w: 0.05 + rnd() * 0.04, h: 0.12 + rnd() * 0.2, col: rnd() < 0.5 ? HOT : COOL, shape: pick(rnd, SIGN_SHAPES), bits: Array.from({ length: 24 }, () => rnd() < 0.45), flick: 0 });
    Object.assign(w, { g: 0.72, signs, drops: [], walkers: Array.from({ length: 1 + band }, (_, i) => newPasser(rnd, band, 0.1 + i * 0.3 + rnd() * 0.2)), car: null, steam: [], grate: 0.55 + rnd() * 0.2, allOn: 0,
      bld: Array.from({ length: 9 }, (_, i) => [i * 0.12 - 0.02, 0.1 + rnd() * 0.08, 0.3 + rnd() * 0.35]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, g = w.g * N, bps = f.bpm ? f.bpm / 60 : 2, band = bandOf(W.a);
    const newCar = (kind, v) => ({ kind, x: -0.4, v });
    for (const hh of hits) {
      if (hh.kind === 'snare') pick(rnd, w.signs).flick = 0.12 + rnd() * 0.2;
      else if (hh.kind === 'hat') for (let k = 0; k < 3; k++) w.steam.push({ x: (w.grate + (rnd() - 0.5) * 0.05) * N, y: g, vx: (rnd() - 0.5) * 2 * u, vy: -(6 + rnd() * 6) * u, life: 1 + rnd() });
      else if (isLow(hh) && hh.strength > 0.7 && !w.car) w.car = newCar(rollW(rnd, CAR_W, band), 0.5 + hh.strength * 0.4);
    }
    if (f.beat.on && f.beat.count % 8 === 0 && !w.car) w.car = newCar(rollW(rnd, CAR_W, band), 0.6);
    if (f.section === 'drop') { w.car = newCar('bus', 0.5); w.allOn = 1.5; }
    else if (f.section === 'change') { const want = 1 + band; w.walkers = Array.from({ length: want }, (_, i) => w.walkers[i] ? Object.assign(w.walkers[i], { kind: rollW(rnd, PASSER_W, band) }) : newPasser(rnd, band, rnd())); for (const p of w.walkers) p.h = PASSERS[p.kind].h; }
    w.allOn -= dt;
    for (const [x, bw, bh] of w.bld) {
      r.rect(x * N, g - bh * N, bw * N, bh * N, DARK);
      for (let y = g - bh * N + 3 * u, j = 0; y < g - 3 * u; y += 4 * u, j++)
        for (let xx = x * N + 2 * u; xx < (x + bw) * N - 2 * u; xx += 3 * u) if (hash(Math.round(xx), j) < 0.3) r.rect(xx, y, Math.max(1, u), Math.max(1, u), LMID);
    }
    // the signs, each its own shape; the reflection copies the lit cells below the kerb, every other row, wobbling
    for (const sg of w.signs) {
      sg.flick -= dt;
      const col = sg.flick > 0 && w.allOn <= 0 ? DARK : sg.col, x = sg.x * N, W0 = sg.w * N, H0 = sg.h * N, y0 = sg.y * N, cx = x + W0 / 2, cy = y0 + H0 / 2, R = Math.min(W0, H0) * 0.45;
      switch (sg.shape) {
        case 'ring': r.ring(cx, cy, R, Math.max(1, 1.5 * u), col); r.disc(cx, cy, R * 0.4, col); break;
        case 'chevrons': for (let k = 0; k < 4; k++) { const yy = y0 + (k + 0.5) * (H0 / 4); r.stroke(x, yy - H0 * 0.08, cx, yy + H0 * 0.05, Math.max(1, u), col); r.stroke(cx, yy + H0 * 0.05, x + W0, yy - H0 * 0.08, Math.max(1, u), col); } break;
        case 'arrow': r.rect(cx - W0 * 0.15, y0, W0 * 0.3, H0 * 0.6, col); r.poly([[x, y0 + H0 * 0.55], [x + W0, y0 + H0 * 0.55], [cx, y0 + H0]], col); break;
        case 'cup': r.stroke(x + W0 * 0.15, cy - H0 * 0.25, x + W0 * 0.25, cy + H0 * 0.25, Math.max(1, 1.5 * u), col); r.stroke(x + W0 * 0.25, cy + H0 * 0.25, x + W0 * 0.75, cy + H0 * 0.25, Math.max(1, 1.5 * u), col); r.stroke(x + W0 * 0.75, cy + H0 * 0.25, x + W0 * 0.85, cy - H0 * 0.25, Math.max(1, 1.5 * u), col); r.ring(x + W0 * 0.9, cy, W0 * 0.12, Math.max(1, u), col); break;
        case 'burst': for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + t * 0.5; r.line(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3, cx + Math.cos(a) * R, cy + Math.sin(a) * R, col); } r.disc(cx, cy, R * 0.2, col); break;
        default: {
          const cw = W0 / 4, ch = H0 / 6;
          for (let j = 0; j < 6; j++) for (let i = 0; i < 4; i++) if (sg.bits[j * 4 + i]) r.rect(x + i * cw, y0 + j * ch, Math.max(1, cw - u * 0.5), Math.max(1, ch - u * 0.5), col);
          r.frame(Math.round(x - u), Math.round(y0 - u), Math.round(W0 + 2 * u), Math.round(H0 + 2 * u), col);
        }
      }
    }
    r.rect(0, g, N, N - g, DARK);
    for (const sg of w.signs) {
      const xa = Math.max(0, Math.floor(sg.x * N - 2 * u)), xb = Math.min(N, Math.ceil((sg.x + sg.w) * N + 2 * u)), ya = Math.max(0, Math.floor(sg.y * N - 2 * u)), yb = Math.min(N, Math.ceil((sg.y + sg.h) * N + 2 * u));
      for (let y = ya; y < yb; y += 2) {
        const yy = Math.round(g + (g - y) * 0.85 + Math.sin(t * 7 + y * 0.5) * u);
        if (yy >= N) continue;
        for (let x = xa; x < xb; x++) { const c = r.buf[y * N + x]; if (c === sg.col) r.buf[yy * N + x] = c; }
      }
    }
    r.rect(0, g, N, Math.max(1, u), MID);
    r.rect(w.grate * N - 5 * u, g, 10 * u, 2 * u, MID);
    if (w.car) { // its lights ahead of it on the wet road, wheels on the kerb line
      const c = w.car, K = CARS[c.kind], L = K.len * N, H = K.h * N;
      c.x += dt * c.v;
      const cx = c.x * N, cy = g - 0.02 * N, wr = H * 0.2;
      for (let y = Math.round(cy - H * 0.6); y < cy + 4 * u; y += 2) r.rect(cx + L, y, 0.25 * N * (0.3 + (y - (cy - H * 0.6)) / (H * 0.6 + 4 * u)), 1, LMID);
      if (c.kind === 'bus') { r.rect(cx, cy - H, L, H, MID); for (let k = 0; k < 6; k++) r.rect(cx + L * (0.05 + k * 0.155), cy - H * 0.85, L * 0.11, H * 0.35, BRIGHT); }
      else if (c.kind === 'van') { r.rect(cx, cy - H, L * 0.7, H, MID); r.rect(cx + L * 0.7, cy - H * 0.75, L * 0.3, H * 0.75, MID); r.rect(cx + L * 0.75, cy - H * 0.7, L * 0.2, H * 0.3, LMID); }
      else { r.rect(cx, cy - H, L, H, MID); r.rect(cx + L * 0.2, cy - H * 1.5, L * 0.55, H * 0.5, MID); r.rect(cx + L * 0.25, cy - H * 1.4, L * 0.45, H * 0.3, LMID); if (K.roof) r.rect(cx + L * 0.4, cy - H * 1.7, L * 0.2, H * 0.2, BRIGHT); }
      for (const wq of [0.18, 0.82]) r.disc(cx + L * wq, cy + wr * 0.3, wr, BLACK);
      r.rect(cx + L - 2 * u, cy - H * 0.6, 2 * u, 2 * u, BRIGHT);
      r.rect(cx, cy - H * 0.6, 2 * u, 2 * u, HOT);
      for (let y = Math.round(cy + wr); y < N; y += 2) r.rect(cx + L - 1.5 * u, y, 1.5 * u, 1, BRIGHT + DIM); // the headlight on the wet road
      targets.push({ x: cx, y: cy - H * 1.5, w: L, h: H * 1.5 });
      if (c.x > 1.3) w.car = null;
    }
    // the passers-by
    for (const P of w.walkers) {
      const K = PASSERS[P.kind];
      P.x += P.dir * dt * bps * Math.PI * 0.1 * P.h * K.v; // a step a beat (below), each a third of the height long, so the feet keep up with the ground
      if (P.x > 1.2 || P.x < -0.2) { Object.assign(P, newPasser(rnd, band, 0)); P.x = P.dir > 0 ? -0.15 : 1.15; }
      P.ph += dt * bps * Math.PI * (P.kind === 'cyclist' ? 2 : 1);
      const fh = P.h * N, x = P.x * N, dir = P.dir;
      r.rect(x - fh * 0.2, g, fh * 0.4, Math.max(1, u), BLACK);
      const brolly = (tx, ty, ur) => { const pts = []; for (let k = 0; k <= 12; k++) { const a = Math.PI + (k / 12) * Math.PI; pts.push([tx + Math.cos(a) * ur, ty + Math.sin(a) * ur * 0.6]); } r.poly(pts, HOT); };
      if (P.kind === 'cyclist') { // two wheels, the frame, the rider leaning to the bars
        const wr = fh * 0.22;
        for (const k of [-0.4, 0.4]) r.ring(x + k * fh, g - wr, wr, Math.max(1, u), FIG);
        r.line(x - fh * 0.4, g - wr, x + fh * 0.05, g - fh * 0.6, FIG);
        r.line(x + fh * 0.4, g - wr, x + dir * fh * 0.15, g - fh * 0.65, FIG);
        r.line(x - dir * fh * 0.1, g - wr, x - dir * fh * 0.1, g - fh * 0.6, FIG);
        const J = walker(r, x - dir * fh * 0.08, g - fh * 0.3, fh * 0.8, FIG, P.ph, dir, { cap: true });
        r.line(J.sx, J.sy, x + dir * fh * 0.3, g - fh * 0.68, FIG);
      } else if (P.kind === 'couple') {
        const J = walker(r, x, g, fh, FIG, P.ph, dir, { coat: true });
        walker(r, x + dir * fh * 0.4, g, fh * 0.92, FIG, P.ph + 1.5, dir, { hat: true });
        r.stroke(J.sx, J.sy + fh * 0.2, x + dir * fh * 0.2, g - fh * 1.3, Math.max(1, u), FIG);
        brolly(x + dir * fh * 0.2, g - fh * 1.3, fh * 0.65);
      } else {
        if (P.kind === 'dog') { const dx = x + dir * fh * 0.5, dh = fh * 0.25; drawDog(r, dx, g, dh, FIG, P.ph * 1.4, dir, u); r.line(x + dir * fh * 0.15, g - fh * 0.45, dx - dir * dh * 0.3, g - dh * 0.8, FIG); }
        const J = walker(r, x, g, fh * (P.kind === 'hooded' ? 0.95 : 1), FIG, P.ph, dir, { coat: P.kind !== 'paper' });
        if (P.kind === 'hooded') { r.disc(x, J.head, fh * 0.14, FIG); r.rect(x + dir * fh * 0.02, J.head - fh * 0.03, fh * 0.06, fh * 0.06, BLACK); }
        else if (P.kind === 'paper') { r.stroke(J.sx, J.sy, x + dir * fh * 0.05, J.top - fh * 0.05, Math.max(1, u), FIG); r.rect(x - fh * 0.3, J.top - fh * 0.1, fh * 0.6, Math.max(1, 1.5 * u), BRIGHT); r.rect(x - fh * 0.3, J.top - fh * 0.1, fh * 0.6, Math.max(1, u * 0.6), LMID); }
        else { const top = [J.sx + fh * 0.05 * dir, g - fh * 1.25]; r.stroke(J.sx, J.sy + fh * 0.2, top[0], top[1], Math.max(1, u), FIG); brolly(top[0], top[1], fh * 0.45); }
      }
      if (f.beat.on) for (let k = 0; k < 4; k++) r.rect(x + (rnd() - 0.5) * 8 * u, g - rnd() * 2 * u, Math.max(1, u), Math.max(1, u), BRIGHT);
      targets.push({ x: x - fh * 0.3, y: g - fh * 1.3, w: fh * 0.6, h: fh * 1.3 });
    }
    w.steam = w.steam.filter((p) => {
      p.x += (p.vx + Math.sin(t * 3 + p.y * 0.2) * u) * dt;
      p.vy = follow(p.vy, -1.5 * u, dt, 1); // steam slows as it rises
      p.y += p.vy * dt;
      p.life -= dt;
      r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), LMID);
      return p.life > 0;
    });
    const want = Math.round((60 + 160 * f.level) * u);
    while (w.drops.length < want) w.drops.push({ x: rnd() * N * 1.3, y: -rnd() * N, l: (3 + rnd() * 4) * u, end: g + rnd() * (N - g) });
    if (w.drops.length > want) w.drops.length = want;
    const v = N * (1 + 0.8 * f.level);
    for (const dp of w.drops) {
      dp.y += v * dt;
      dp.x -= 0.25 * v * dt;
      if (dp.y > dp.end) { dp.y = -rnd() * 0.2 * N; dp.x = rnd() * N * 1.3; }
      r.line(dp.x, dp.y, dp.x + 0.25 * dp.l, dp.y - dp.l, LMID);
    }
  },
};

// ---------------------------------------------------------------------------------------------- radar
// A radar scope: the sweep goes round once a bar leaving its afterglow, every hit is a blip (kicks near the
// centre, hats at the rim, notes at their pitch's bearing) that fades until the sweep passes it again.
const radar = {
  init(W) {
    Object.assign(W.w, { blips: [], bits: Array.from({ length: 20 }, () => W.rnd() < 0.4), ph: 0, lastA: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, cx = 0.46 * N, cy = 0.5 * N, R = 0.42 * N;
    const a = beatLocked(f) ? (((f.beat.count % 4) + f.beat.phase) / 4) * TAU : (w.ph += dt * 1.2) % TAU;
    for (const hh of hits) {
      const rad = isLow(hh) ? 0.15 + 0.15 * rnd() : hh.kind === 'snare' ? 0.45 + 0.1 * rnd() : hh.kind === 'hat' ? 0.8 + 0.12 * rnd() : 0.3 + 0.4 * rnd();
      w.blips.push({ a: isTonal(hh) ? (hh.pc / 12) * TAU : rnd() * TAU, r: rad, age: 0, big: hh.strength > 0.75, life: 0 });
    }
    if (f.beat.on) for (let k = 0; k < 4; k++) w.bits[Math.floor(rnd() * w.bits.length)] ^= true;
    for (let y = Math.floor(cy - R); y <= cy + R; y++)
      for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy > R * R) continue;
        const behind = (((a - Math.atan2(dy, dx)) % TAU) + TAU) % TAU;
        r.set(x, y, behind < 0.06 ? BRIGHT : behind < 0.3 ? LMID : behind < 0.7 ? MID : behind < 1.3 ? DARK : BG);
      }
    for (const k of [1, 0.66, 0.33]) r.ring(cx, cy, R * k, Math.max(1, u * 0.8), MID);
    r.rect(cx - R, cy, 2 * R, 1, MID);
    r.rect(cx, cy - R, 1, 2 * R, MID);
    for (let k = 0; k < 12; k++) { const t2 = (k / 12) * TAU; r.line(cx + Math.cos(t2) * R * 0.95, cy + Math.sin(t2) * R * 0.95, cx + Math.cos(t2) * R, cy + Math.sin(t2) * R, LMID); }
    w.blips = w.blips.filter((b) => {
      const was = (((w.lastA - b.a) % TAU) + TAU) % TAU, now = (((a - b.a) % TAU) + TAU) % TAU;
      if (now < was) { b.age = 0; b.life++; } // the sweep just went over it
      b.age += dt;
      const col = b.age < 0.25 ? BRIGHT : b.age < 0.8 ? LMID : b.age < 1.6 ? MID : DARK, bx = cx + Math.cos(b.a) * b.r * R, by = cy + Math.sin(b.a) * b.r * R, sz = b.big ? 3 * u : 2 * u;
      r.rect(bx - sz / 2, by - sz / 2, sz, sz, col);
      if (b.big && b.age < 1) { r.frame(Math.round(bx - 4 * u), Math.round(by - 4 * u), Math.round(8 * u), Math.round(8 * u), COOL); targets.push({ x: bx - 3 * u, y: by - 3 * u, w: 6 * u, h: 6 * u }); }
      return b.life < 3 && b.age < 2.4;
    });
    w.lastA = a;
    w.bits.forEach((on, i) => r.rect(0.9 * N + (i % 2) * 3 * u, 0.2 * N + Math.floor(i / 2) * 3 * u, 2 * u, 2 * u, on ? BRIGHT : DARK));
    const lvl = Math.round(f.level * 10);
    for (let k = 0; k < 10; k++) r.rect(0.9 * N, 0.85 * N - k * 2.5 * u, 5 * u, 1.5 * u, k < lvl ? (k > 7 ? HOT : BRIGHT) : DARK);
    r.frame(0, 0, N, N, DARK + DIM);
  },
};

// ---------------------------------------------------------------------------------------------- aerobics
// A workout tape: three in leotards and legwarmers in a striped studio, one move per beat, in step. A kick is
// a jump, a snare swaps the pair's side, a hat is a nod.
const POSES = [{ arms: [2.8, 2.8], dy: 0, legs: 0.4 }, { arms: [1.57, 1.57], dy: 0, legs: 1 }, { arms: [2.2, 2.2], dy: 0.07, legs: 1.2 }, { arms: [0.5, 2.9], dy: -0.06, legs: 0.6 }];

const aerobics = {
  init(W) {
    Object.assign(W.w, { nod: 0, jump: 0, swap: 0, ph: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, hits, targets } = W, g = 0.82 * N;
    for (const hh of hits) {
      if (isLow(hh)) w.jump = 1;
      else if (hh.kind === 'snare') w.swap = 1 - w.swap;
      else if (hh.kind === 'hat') w.nod = 1;
    }
    w.jump = Math.max(0, w.jump - dt * 4); // a quarter-second hop
    w.nod *= Math.exp(-dt * 8);
    for (let k = -4; k < 20; k++) r.poly([[k * 0.08 * N, 0], [(k * 0.08 + 0.035) * N, 0], [(k * 0.08 + 0.035 - 0.25) * N, g], [(k * 0.08 - 0.25) * N, g]], k % 2 ? HOT : COOL);
    r.rect(0, 0.3 * N, N, Math.max(1, u), LMID);
    r.rect(0, g, N, N - g, LMID);
    r.rect(0, g, N, Math.max(1, u), DARK);
    const q = beatLocked(f) ? f.beat.count + f.beat.phase : (w.ph += dt * (f.bpm ? f.bpm / 60 : 2)), k = Math.floor(q) % 4, p = ease((q % 1) * 1.6);
    const A = POSES[k], B = POSES[(k + 1) % 4], Lp = (a, b) => lerp(a, b, p);
    for (let i = 0; i < 3; i++) {
      const sc = i === 1 ? 1 : 0.85, h = 0.3 * N * sc, x = (0.25 + i * 0.25) * N, mirror = i !== 1 && w.swap ? -1 : 1;
      const base = g + Lp(A.dy, B.dy) * N - 16 * w.jump * (1 - w.jump) * u, legs = Lp(A.legs, B.legs), lw = Math.max(1, h * 0.09), legH = h * 0.33, spread = h * 0.1 * legs; // the hop is a parabola, 4u at the top
      for (const sgn of [-1, 1]) {
        r.rect(x + sgn * spread - lw / 2, base - legH, lw, legH, FIG);
        r.rect(x + sgn * spread - lw / 2 - u * 0.5, base - legH * 0.35, lw + u, legH * 0.25, HOT);
      }
      const bodyH = h * 0.4, top = base - legH - bodyH;
      r.poly([[x - h * 0.13, top], [x + h * 0.13, top], [x + h * 0.09, top + bodyH], [x - h * 0.09, top + bodyH]], i === 1 ? HOT : COOL);
      const hy = top - h * 0.11 + w.nod * 1.5 * u;
      r.disc(x, hy, h * 0.1, FIG);
      r.rect(x - h * 0.11, hy - h * 0.04, h * 0.22, Math.max(1, u), i === 1 ? COOL : HOT);
      const [al, ar] = mirror > 0 ? [Lp(A.arms[0], B.arms[0]), Lp(A.arms[1], B.arms[1])] : [Lp(A.arms[1], B.arms[1]), Lp(A.arms[0], B.arms[0])], armL = h * 0.3, sy = top + h * 0.03;
      r.stroke(x - h * 0.12, sy, x - h * 0.12 - Math.sin(al) * armL, sy + Math.cos(al) * armL, Math.max(1, h * 0.06), FIG);
      r.stroke(x + h * 0.12, sy, x + h * 0.12 + Math.sin(ar) * armL, sy + Math.cos(ar) * armL, Math.max(1, h * 0.06), FIG);
      targets.push({ x: x - h * 0.3, y: top - h * 0.25, w: h * 0.6, h: h });
    }
  },
};

// ---------------------------------------------------------------------------------------------- dogfight
// Through a cockpit: stars rushing past, wireframe ships banking on the snare, a kick fires both cannons at
// the crosshair and whatever sits under it; a radar box and a shield bar below.
function newShip(rnd, z) {
  return { x: (rnd() - 0.5) * 1.6, y: (rnd() - 0.5) * 1.2, z, vx: (rnd() - 0.5) * 0.1, vy: (rnd() - 0.5) * 0.08, hp: 2, flash: 0, tilt: (rnd() - 0.5) * 0.5 };
}

const dogfight = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { stars: Array.from({ length: 80 }, () => ({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: 0.2 + rnd() * 3 })), ships: [], lasers: 0, fired: false, booms: [], score: 0, bank: 0, hyper: 0 });
    for (let i = 0; i < 3; i++) w.ships.push(newShip(rnd, 3 + i * 2));
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, cx = N / 2, cy = N / 2, speed = 0.6 + 1.2 * W.a + 0.5 * f.rel.bassDrive;
    for (const hh of hits) {
      if (isLow(hh)) { w.lasers = 0.08; w.fired = true; }
      else if (hh.kind === 'snare') w.bank = (rnd() < 0.5 ? -1 : 1) * 0.6;
    }
    w.bank *= Math.exp(-dt * 3);
    w.lasers -= dt;
    const proj = (x, y, z) => [cx + (x / z) * N * 0.5, cy + (y / z) * N * 0.5];
    if (f.section === 'drop') w.hyper = 1.2; // the jump: the stars stretch into streaks for a moment
    w.hyper -= dt;
    for (const st of w.stars) {
      st.z -= dt * speed * (w.hyper > 0 ? 4 : 1);
      if (st.z < 0.1) { st.z = 3; st.x = rnd() * 2 - 1; st.y = rnd() * 2 - 1; }
      const [sx, sy] = proj(st.x, st.y, st.z);
      if (w.hyper > 0) { const [ex, ey] = proj(st.x, st.y, st.z * 0.55); r.line(sx, sy, ex, ey, BRIGHT); }
      else r.set(sx, sy, st.z < 1 ? BRIGHT : MID);
    }
    let aimed = null;
    for (const sh of w.ships) {
      sh.z -= dt * speed * 0.35;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      if (sh.z < 0.6) Object.assign(sh, newShip(rnd, 6 + rnd() * 2));
      const [sx, sy] = proj(sh.x, sh.y, sh.z), sz = (0.09 * N) / sh.z, c = Math.cos(w.bank + sh.tilt), sn = Math.sin(w.bank + sh.tilt);
      const P = (px, py) => [sx + (px * c - py * sn) * sz, sy + (px * sn + py * c) * sz];
      const pts = [P(0, -1), P(0.5, 0), P(0, 0.5), P(-0.5, 0)], wl = P(-1.6, 0.3), wr = P(1.6, 0.3), tail = P(0, 1.2);
      sh.flash -= dt;
      const col = sh.flash > 0 ? HOT : FIG;
      for (let k = 0; k < 4; k++) r.line(...pts[k], ...pts[(k + 1) % 4], col);
      r.line(...pts[3], ...wl, col); r.line(...pts[1], ...wr, col); r.line(...pts[2], ...tail, col); r.line(...wl, ...tail, col); r.line(...wr, ...tail, col);
      targets.push({ x: sx - 1.6 * sz, y: sy - sz, w: 3.2 * sz, h: 2.2 * sz });
      if (Math.hypot(sx - cx, sy - cy) < 0.12 * N && (!aimed || sh.z < aimed.z)) aimed = sh;
    }
    if (w.fired) {
      w.fired = false;
      if (aimed) {
        aimed.flash = 0.1;
        if (--aimed.hp <= 0) {
          const [sx, sy] = proj(aimed.x, aimed.y, aimed.z);
          burst(w.booms, rnd, sx, sy, 24, N * 0.5, BRIGHT, 0.6);
          burst(w.booms, rnd, sx, sy, 10, N * 0.3, HOT, 0.6);
          Object.assign(aimed, newShip(rnd, 7));
          w.score++;
        }
      }
    }
    if (w.lasers > 0) for (const x0 of [0.08 * N, 0.92 * N]) r.line(x0, N, cx + (rnd() - 0.5) * 2 * u, cy + (rnd() - 0.5) * 2 * u, HOT);
    w.booms = particles(W, w.booms, BRIGHT);
    for (const [x0, x1] of [[0, 0.3], [1, 0.7]]) { r.line(x0 * N, 0.75 * N, x1 * N, 0.92 * N, LMID); r.line(x0 * N, 0.25 * N, x1 * N, 0.08 * N, LMID); }
    r.rect(0.3 * N, 0.92 * N, 0.4 * N, Math.max(1, u), LMID);
    r.rect(0.3 * N, 0.08 * N, 0.4 * N, Math.max(1, u), LMID);
    r.ring(cx, cy, 0.06 * N, Math.max(1, u), COOL);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) r.line(cx + dx * 0.04 * N, cy + dy * 0.04 * N, cx + dx * 0.09 * N, cy + dy * 0.09 * N, COOL);
    r.frame(Math.round(0.04 * N), Math.round(0.78 * N), Math.round(0.16 * N), Math.round(0.16 * N), LMID);
    for (const sh of w.ships) r.rect(0.12 * N + sh.x * 0.06 * N, 0.94 * N - (sh.z / 8) * 0.14 * N, Math.max(1, u), Math.max(1, u), HOT);
    r.rect(0.8 * N, 0.8 * N, 0.16 * N * f.level, 2 * u, COOL);
    for (let k = 0; k < w.score % 12; k++) r.rect(0.8 * N + k * 2 * u, 0.85 * N, Math.max(1, u), 2 * u, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- kaiju
// A giant walks the skyline, one stomp per beat; the buildings it steps on crumble. Species, each with its own
// silhouette and its snare: the lizard breathes fire across the city, the beetle's stomp sends a quake along the
// ground, the serpent's tail sweeps the block in front of it; a drop brings the colossus. The city fights back:
// helicopters buzz about on the hats, tanks fire shells on real arcs at the kicks, jets streak in on the notes with
// a missile. A section change brings the next beast in from the right, or the next kind of defender.
const BEASTS = {
  lizard: { H: 0.55, step: 0.04, attack: 'breath' }, // upright, a tail and back fins, breathes fire
  beetle: { H: 0.42, step: 0.03, attack: 'quake' }, // low and wide on six legs with pincers, stomps a quake
  serpent: { H: 0.62, step: 0.035, attack: 'sweep' }, // coiled, a hood, sweeps its tail along the ground
  colossus: { H: 0.72, step: 0.025, attack: 'breath', heavy: true }, // blocky and square, beams from the eyes
};
const BEAST_W = { lizard: [3, 2, 2], beetle: [2, 2, 1], serpent: [1, 2, 3], colossus: [0, 0, 1] };
// who answers the kicks: more helicopters with rockets, tanks, or jets that come in on the notes too
const DEF_W = { copters: [3, 2, 1], tanks: [1, 2, 2], jets: [0, 1, 3] };

// a beast at x with its feet on g, facing left; returns where its breath would come from
function drawBeast(r, kind, x, g, H, u, bob, ph, col) {
  if (kind === 'beetle') {
    r.ring(x, g - H * 0.3, H * 0.25, H * 0.5, col, 0.6);
    r.rect(x - H * 0.3, g - H * 0.5, H * 0.6, Math.max(1, u), LMID);
    for (let k = 0; k < 6; k++) { // three legs a side, lifting in turn
      const lx = x - H * 0.35 + k * H * 0.14, side = k < 3 ? -1 : 1, lift = Math.max(0, Math.sin(ph + k * 2.1)) * 2.5 * u;
      r.stroke(lx, g - H * 0.18, lx + side * H * 0.08, g - H * 0.24, 1.5 * u, col);
      r.stroke(lx + side * H * 0.08, g - H * 0.24, lx + side * H * 0.14, g - lift, 1.5 * u, col);
    }
    const gape = 0.5 + 0.5 * Math.sin(ph * 0.7);
    r.stroke(x - H * 0.45, g - H * 0.22, x - H * 0.66, g - H * (0.3 + 0.1 * gape), 2 * u, col);
    r.stroke(x - H * 0.45, g - H * 0.18, x - H * 0.64, g - H * (0.12 - 0.06 * gape), 2 * u, col);
    r.rect(x - H * 0.42, g - H * 0.33, 2 * u, 2 * u, HOT);
    return [x - H * 0.5, g - H * 0.22];
  }
  if (kind === 'serpent') {
    r.ring(x, g - H * 0.07, H * 0.3, H * 0.14, col, 0.35);
    let cx = x, cy = g - H * 0.1;
    for (let i = 0; i < 11; i++) { cy = g - H * (0.1 + 0.07 * i) - (bob * i) / 10; cx = x + Math.sin(i * 0.55 + ph * 0.3) * H * 0.1; r.disc(cx, cy, H * (0.11 - i * 0.004), col); }
    r.poly([[cx - H * 0.26, cy + H * 0.02], [cx + H * 0.2, cy + H * 0.02], [cx + H * 0.1, cy - H * 0.2], [cx - H * 0.16, cy - H * 0.18]], col);
    r.poly([[cx - H * 0.08, cy - H * 0.06], [cx - H * 0.36, cy + H * 0.03], [cx - H * 0.08, cy + H * 0.1]], col);
    r.rect(cx - H * 0.17, cy - H * 0.01, 2 * u, 2 * u, HOT);
    return [cx - H * 0.36, cy + H * 0.03];
  }
  if (kind === 'colossus') {
    for (const k of [-0.22, 0.06]) r.rect(x + k * H, g - H * 0.42, H * 0.16, H * 0.42, col);
    r.rect(x - H * 0.28, g - H * 0.86 - bob, H * 0.56, H * 0.46, col);
    r.rect(x - H * 0.42, g - H * 0.82 - bob + Math.sin(ph) * 2 * u, H * 0.13, H * 0.4, col);
    r.rect(x + H * 0.29, g - H * 0.82 - bob - Math.sin(ph) * 2 * u, H * 0.13, H * 0.4, col);
    r.rect(x - H * 0.17, g - H * 1.02 - bob, H * 0.3, H * 0.18, col);
    for (const k of [-0.11, 0]) r.rect(x + k * H, g - H * 0.97 - bob, 3 * u, 2 * u, HOT);
    return [x - H * 0.17, g - H * 0.96 - bob];
  }
  r.rect(x - H * 0.12, g - H * 0.35 - bob, H * 0.1, H * 0.35 + bob, col);
  r.rect(x + H * 0.05, g - H * 0.35, H * 0.1, H * 0.35, col);
  r.poly([[x - H * 0.2, g - H * 0.3 - bob], [x + H * 0.22, g - H * 0.3 - bob], [x + H * 0.15, g - H * 0.85 - bob], [x - H * 0.1, g - H * 0.8 - bob]], col);
  r.poly([[x + H * 0.2, g - H * 0.35 - bob], [x + H * 0.65, g - H * 0.12], [x + H * 0.6, g - H * 0.05], [x + H * 0.18, g - H * 0.28 - bob]], col);
  r.rect(x - H * 0.35, g - H * 0.95 - bob, H * 0.3, H * 0.14, col);
  r.rect(x - H * 0.3, g - H * 0.9 - bob, 2 * u, 2 * u, HOT);
  for (let k = 0; k < 4; k++) r.poly([[x - H * 0.05 + k * H * 0.06, g - H * (0.8 - k * 0.1) - bob], [x + k * H * 0.06, g - H * (0.92 - k * 0.1) - bob], [x + H * 0.04 + k * H * 0.06, g - H * (0.78 - k * 0.1) - bob]], LMID);
  return [x - H * 0.35, g - H * 0.88 - bob];
}

const kaiju = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), def = rollW(rnd, DEF_W, band);
    Object.assign(w, { city: Array.from({ length: 14 }, (_, i) => ({ x: i * 0.075 - 0.02, w: 0.05 + rnd() * 0.04, h: 0.18 + rnd() * 0.3, hp: 1 })), x: 1.15, step: 0, kind: rollW(rnd, BEAST_W, band), def,
      breath: 0, quake: 0, sweep: 0, hurt: 0, copters: Array.from({ length: def === 'copters' ? 5 : 3 }, () => ({ x: rnd(), y: 0.15 + rnd() * 0.2, d: rnd() < 0.5 ? -1 : 1 })),
      shells: [], jets: [], debris: [], sparks: [], tankFlash: [0, 0], ph: 0, gait: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.8 * N, bps = f.bpm ? f.bpm / 60 : 2, band = bandOf(W.a), B = BEASTS[w.kind], H = B.H * N;
    const crush = (b, dmg, c) => { b.hp = Math.max(0, b.hp - dmg); for (let k = 0; k < 6; k++) w.debris.push({ x: (b.x + rnd() * b.w) * N, y: g - b.h * b.hp * N, vx: (rnd() - 0.5) * N * 0.3, vy: -rnd() * N * 0.3, life: 1.2, c }); };
    r.disc(0.2 * N, 0.18 * N, 0.07 * N, BRIGHT);
    for (const b of w.city) {
      const bh = b.h * b.hp * N;
      r.rect(b.x * N, g - bh, b.w * N, bh, DARK);
      for (let y = g - bh + 3 * u; y < g - 3 * u; y += 5 * u)
        for (let x = b.x * N + 2 * u; x < (b.x + b.w) * N - 2 * u; x += 4 * u) if (hash(Math.round(x), Math.round(y)) < 0.35) r.rect(x, y, Math.max(1, u), 2 * u, LMID);
    }
    r.rect(0, g, N, N - g, MID);
    if (beatLocked(f) ? f.beat.on : (w.ph += dt * bps) > 1) {
      w.ph = 0;
      w.step = 1;
      w.x -= B.step;
      s.shake = Math.max(s.shake, B.heavy ? 0.9 : 0.6);
      for (const b of w.city) if (Math.abs(b.x + b.w / 2 - w.x) < 0.08 && b.hp > 0.3) crush(b, 0.3, DARK);
    }
    if (w.x < -0.3) { w.x = 1.2; for (const b of w.city) b.hp = 1; }
    if (f.section === 'drop') { w.kind = 'colossus'; w.x = Math.max(w.x, 1.15); for (const b of w.city) b.hp = 1; }
    else if (f.section === 'change') { if (rnd() < 0.6) { w.kind = rollW(rnd, BEAST_W, band); w.x = 1.2; } else { w.def = rollW(rnd, DEF_W, band); while (w.copters.length < (w.def === 'copters' ? 5 : 3)) w.copters.push({ x: rnd(), y: 0.15 + rnd() * 0.2, d: rnd() < 0.5 ? -1 : 1 }); } }
    w.step *= Math.exp(-dt * 6);
    w.gait += dt * (2 + 2 * f.level);
    const x = w.x * N, bob = w.step * 3 * u, headTop = g - H * (w.kind === 'beetle' ? 0.5 : 0.95);
    const sortie = () => w.jets.push({ x: -0.15, y: 0.08 + rnd() * 0.08, fired: false });
    for (const hh of hits) {
      if (hh.kind === 'snare') { // the beast's attack
        if (B.attack === 'breath') w.breath = 0.25;
        else if (B.attack === 'quake') { w.quake = 0.6; s.shake = Math.max(s.shake, 0.8); for (const b of w.city) if (Math.abs(b.x + b.w / 2 - w.x) < 0.32 && b.hp > 0.3) crush(b, 0.2, DARK); }
        else { w.sweep = 0.4; for (const b of w.city) if (b.x + b.w / 2 > w.x - 0.4 && b.x + b.w / 2 < w.x - 0.05 && b.hp > 0.3) crush(b, 0.3, DARK); }
      } else if (hh.kind === 'hat') for (const c of w.copters) c.y = clamp(c.y + (rnd() - 0.5) * 0.03, 0.08, 0.4);
      else if (isLow(hh)) { // the defenders answer
        if (w.def === 'tanks') for (let i = 0; i < 2; i++) { // a shell on the arc that reaches the beast
          const tx = (0.05 + i * 0.08) * N, dx = x - tx, dir = Math.sign(dx) || 1, v = Math.min(1.6 * N, Math.sqrt((Math.abs(dx) * N * 1.6) / 0.94));
          w.shells.push({ x: tx + dir * 8 * u, y: g - 8 * u, vx: dir * Math.cos(0.61) * v, vy: -Math.sin(0.61) * v, grav: true });
          w.tankFlash[i] = 0.08;
        } else if (w.def === 'copters') { const c = pick(rnd, w.copters), a = Math.atan2(headTop - c.y * N, x - c.x * N); w.shells.push({ x: c.x * N, y: c.y * N + 2 * u, vx: Math.cos(a) * 0.8 * N, vy: Math.sin(a) * 0.8 * N, grav: false }); }
        else if (hh.strength > 0.6) sortie();
      } else if (isTonal(hh) && w.def === 'jets') sortie();
    }
    w.breath -= dt; w.quake -= dt; w.sweep -= dt; w.hurt -= dt;
    const col = w.hurt > 0 ? BRIGHT : FIG;
    if (w.sweep > 0) { // the tail comes round along the ground in front
      const k = Math.sin(Math.PI * (1 - w.sweep / 0.4)), tipX = x - H * (0.2 + 0.6 * k);
      r.stroke(x, g - H * 0.06, tipX, g - H * 0.03, 3 * u, col);
      for (let i = 0; i < 6; i++) r.rect(tipX + rnd() * (x - tipX), g - rnd() * 4 * u, 2 * u, Math.max(1, u), LMID);
    } else if (w.kind === 'serpent') r.stroke(x, g - H * 0.06, x + H * 0.5, g - H * 0.02, 3 * u, col);
    const [mx, my] = drawBeast(r, w.kind, x, g, H, u, bob, w.gait, col);
    if (w.breath > 0) {
      for (let yy = Math.round(my - 2 * u); yy < my + 3 * u; yy++) r.rect(0, yy, mx, 1, yy % 2 ? HOT : BRIGHT);
      for (const b of w.city) if (b.x + b.w < w.x - 0.1 && rnd() < 0.3) w.debris.push({ x: (b.x + rnd() * b.w) * N, y: g - b.h * b.hp * N + rnd() * 0.1 * N, vx: (rnd() - 0.5) * N * 0.2, vy: -rnd() * N * 0.4, life: 0.8, c: HOT });
    }
    if (w.quake > 0) for (const k of [0, 0.15]) { const R = (0.6 - w.quake + k) * 0.9 * N; if (R > 0) r.ring(x, g, R, 2 * u, LMID, 0.12); } // the quake rings out along the ground
    // the defenders: tanks on the left, jets across the top, helicopters in between
    if (w.def === 'tanks') for (let i = 0; i < 2; i++) {
      const tx = (0.05 + i * 0.08) * N, dir = Math.sign(x - tx) || 1, rec = w.tankFlash[i] > 0 ? 1.5 * u : 0;
      r.rect(tx - 7 * u, g - 2.5 * u, 14 * u, 2.5 * u, DARK + DIM);
      r.rect(tx - 6 * u - dir * rec, g - 5.5 * u, 12 * u, 3 * u, DARK);
      r.rect(tx - 3 * u - dir * rec, g - 8 * u, 6 * u, 2.5 * u, DARK);
      r.stroke(tx + dir * 2 * u - dir * rec, g - 7 * u, tx + dir * 9 * u - dir * rec, g - 7 * u - 5 * u, 1.5 * u, DARK);
      if ((w.tankFlash[i] -= dt) > 0) r.disc(tx + dir * 10 * u, g - 12.5 * u, 2.5 * u, BRIGHT);
      targets.push({ x: tx - 7 * u, y: g - 9 * u, w: 14 * u, h: 9 * u });
    }
    w.jets = w.jets.filter((j) => {
      j.x += dt * 0.9;
      const jx = j.x * N, jy = j.y * N;
      if (!j.fired && jx > x - 0.4 * N) { j.fired = true; const a = Math.atan2(headTop - jy, x - jx); w.shells.push({ x: jx + 4 * u, y: jy, vx: Math.cos(a) * 1.2 * N, vy: Math.sin(a) * 1.2 * N, grav: false }); }
      r.poly([[jx - 7 * u, jy - u], [jx + 5 * u, jy], [jx - 7 * u, jy + 1.5 * u]], LMID);
      r.poly([[jx - 7 * u, jy - u], [jx - 5 * u, jy - 3.5 * u], [jx - 3 * u, jy]], LMID);
      for (let k = 1; k < 4; k++) r.rect(jx - 7 * u - k * 5 * u, jy, 3 * u, 1, LMID + DIM);
      targets.push({ x: jx - 7 * u, y: jy - 3 * u, w: 12 * u, h: 5 * u });
      return j.x < 1.2;
    });
    w.shells = w.shells.filter((sh) => { // shells drop on their arcs, rockets fly straight; a hit stings the beast
      if (sh.grav) sh.vy += N * 1.6 * dt;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      r.disc(sh.x, sh.y, 1.5 * u, BRIGHT);
      if (!sh.grav) r.rect(sh.x - Math.sign(sh.vx) * 4 * u, sh.y, 3 * u, 1, LMID);
      if (Math.abs(sh.x - x) < H * 0.3 && sh.y > headTop && sh.y < g) { w.hurt = 0.12; w.x += 0.004; burst(w.sparks, rnd, sh.x, sh.y, 10, N * 0.4, BRIGHT, 0.4); return false; }
      if (sh.y >= g) { burst(w.debris, rnd, sh.x, g, 6, N * 0.25, MID, 0.5); return false; }
      return sh.x > -0.1 * N && sh.x < 1.1 * N && sh.y > -0.2 * N;
    });
    for (const c of w.copters) {
      c.x += c.d * dt * 0.08;
      if (c.x > 1.1) c.x = -0.1;
      if (c.x < -0.1) c.x = 1.1;
      const cx = c.x * N, cy = c.y * N;
      r.rect(cx - 3 * u, cy, 6 * u, 2 * u, COOL);
      r.rect(cx - 5 * u + (Math.floor(t * 30) % 2) * 4 * u, cy - u, 6 * u, 1, COOL);
      r.rect(cx + (c.d > 0 ? -7 * u : 3 * u), cy, 4 * u, 1, COOL);
      if (f.beat.pulse > 0.5) r.rect(cx, cy + 3 * u, Math.max(1, u), Math.max(1, u), HOT);
      targets.push({ x: cx - 4 * u, y: cy - 2 * u, w: 8 * u, h: 5 * u });
    }
    w.debris = particles(W, w.debris, DARK);
    w.sparks = particles(W, w.sparks, BRIGHT);
    targets.push({ x: x - H * 0.5, y: headTop, w: H, h: g - headTop });
  },
};

// ---------------------------------------------------------------------------------------------- ufo
// A saucer over a farm at night. Its five lights answer the notes, the bass opens the tractor beam and a cow
// goes up when the beam stays on it; a snare moves the saucer along.
const ufo = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { x: 0.5, tx: 0.5, lights: new Float32Array(5), cow: { x: 0.5, lift: 0 }, beam: 0, stars: Array.from({ length: 40 }, () => [rnd(), rnd() * 0.5]),
      barn: rnd() < 0.5 ? 0.15 : 0.78, hover: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, g = 0.78 * N;
    for (const [sx, sy] of w.stars) r.set(sx * N, sy * N, Math.floor(t * 2 + sx * 10) % 7 ? LMID : BRIGHT);
    r.disc(0.82 * N, 0.16 * N, 0.06 * N, BRIGHT);
    r.rect(0, g, N, N - g, DARK);
    for (let x = 0; x < N; x += 5 * u) r.rect(x, g - 3 * u, Math.max(1, u), 3 * u, MID);
    r.rect(0, g - 2 * u, N, 1, MID);
    const bx = w.barn * N;
    r.rect(bx - 0.08 * N, g - 0.16 * N, 0.16 * N, 0.16 * N, MID);
    r.poly([[bx - 0.09 * N, g - 0.16 * N], [bx, g - 0.24 * N], [bx + 0.09 * N, g - 0.16 * N]], MID);
    r.rect(bx - 0.02 * N, g - 0.08 * N, 0.04 * N, 0.08 * N, DARK);
    for (const hh of hits) {
      if (isTonal(hh)) { w.lights[hh.pc % 5] = 1; w.beam = Math.min(1, w.beam + 0.25); }
      else if (isLow(hh)) w.hover = 1;
      else if (hh.kind === 'snare') w.tx = 0.25 + rnd() * 0.5;
    }
    w.x = follow(w.x, w.tx, dt, 1.2);
    w.hover *= Math.exp(-dt * 4);
    w.beam = Math.max(w.beam * Math.exp(-dt / 1.2), f.rel.bassDrive * 0.5);
    for (let k = 0; k < 5; k++) w.lights[k] *= Math.exp(-dt * 3);
    const ux = w.x * N, uy = 0.3 * N + Math.sin(t * 1.5) * 2 * u - w.hover * 4 * u, R = 0.16 * N;
    if (w.beam > 0.1)
      for (let y = Math.round(uy + 4 * u); y < g; y += 2) {
        const k = (y - uy) / (g - uy), half = R * 0.25 + (R * 0.8 - R * 0.25) * k;
        if (hash(y, Math.floor(t * 10)) < w.beam) r.rect(ux - half, y, 2 * half, 1, LMID);
      }
    w.cow.lift = follow(w.cow.lift, w.beam > 0.4 && Math.abs(w.cow.x - w.x) < 0.1 ? 1 : 0, dt, 1.5);
    w.cow.x = follow(w.cow.x, w.x, dt, 6);
    const cx = w.cow.x * N, cy = g - 4 * u - w.cow.lift * (g - uy - 10 * u), ca = w.cow.lift * 0.6, cs = Math.cos(ca), sn = Math.sin(ca);
    const P = (px, py) => [cx + px * cs - py * sn, cy + px * sn + py * cs];
    r.poly([P(-6 * u, -4 * u), P(6 * u, -4 * u), P(6 * u, 0), P(-6 * u, 0)], BRIGHT);
    r.poly([P(5 * u, -6 * u), P(9 * u, -6 * u), P(9 * u, -2 * u), P(5 * u, -2 * u)], BRIGHT);
    for (const lx of [-5, -2, 2, 5]) { const [a0, a1] = P(lx * u, 0), [b0, b1] = P(lx * u, 3 * u); r.line(a0, a1, b0, b1, BRIGHT); }
    r.rect(...P(-2 * u, -3 * u), 2 * u, 2 * u, DARK);
    r.ring(ux, uy, R * 0.5, R, MID, 0.35);
    r.ring(ux, uy - 3 * u, R * 0.2, R * 0.4, LMID, 0.6);
    for (let k = 0; k < 5; k++) r.rect(ux + (k - 2) * R * 0.38 - u, uy + 1.5 * u, 2 * u, 2 * u, w.lights[k] > 0.3 ? [HOT, COOL, BRIGHT, HOT, COOL][k] : DARK);
    targets.push({ x: ux - R, y: uy - R * 0.4, w: 2 * R, h: R * 0.8 });
    targets.push({ x: cx - 7 * u, y: cy - 8 * u, w: 16 * u, h: 11 * u });
  },
};

// ---------------------------------------------------------------------------------------------- periscope
// Through the eyepiece: a ship on the horizon, a fin on the snare, a kick is a ping and a torpedo running out
// along its track until the ship lists.
const periscope = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { ship: { x: 1.2, v: -0.03 - rnd() * 0.03 }, torp: null, ping: 0, booms: [], fin: { x: -0.2, t: 9 }, hitAt: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, cx = N / 2, cy = N / 2, R = 0.46 * N, hz = cy + Math.sin(t * 0.7) * 2 * u;
    for (const hh of hits) {
      if (isLow(hh)) { w.ping = 1; if (!w.torp) w.torp = { t: 0 }; }
      else if (hh.kind === 'snare') w.fin = { x: -0.15, t: 0 };
    }
    w.ping *= Math.exp(-dt * 2);
    for (let y = Math.floor(cy - R); y <= cy + R; y++) {
      const half = Math.sqrt(Math.max(0, R * R - (y + 0.5 - cy) ** 2));
      if (half < 1) continue;
      r.rect(cx - half, y, 2 * half, 1, y > hz ? ((y - Math.round(hz) + Math.floor(t * 6)) % 9 < 2 ? LMID : DARK) : BG);
    }
    r.disc(0.3 * N, cy - R * 0.45, 0.05 * N, LMID);
    const sh = w.ship;
    sh.x += sh.v * dt;
    if (sh.x < -0.3) { sh.x = 1.3; sh.v = -0.03 - rnd() * 0.03; }
    const sx = sh.x * N, sw = 0.22 * N, list = w.hitAt > 0 ? (w.hitAt -= dt) * 0.15 : 0;
    r.poly([[sx - sw / 2, hz], [sx + sw / 2, hz], [sx + sw / 2 - 3 * u, hz + 4 * u + list * N], [sx - sw / 2 + 3 * u, hz + 4 * u]], DARK);
    r.rect(sx - sw * 0.15, hz - 5 * u, sw * 0.3, 5 * u, DARK);
    r.rect(sx + sw * 0.05, hz - 9 * u, 2.5 * u, 4 * u, DARK);
    for (let k = 0; k < 4; k++) r.rect(sx - sw * 0.1 + 1.5 * u + k * u, hz - 10 * u - k * 3 * u, 3 * u - k * 0.5 * u, Math.max(1, u), MID);
    targets.push({ x: sx - sw / 2, y: hz - 9 * u, w: sw, h: 13 * u });
    if (w.fin.t < 6) {
      w.fin.t += dt;
      w.fin.x += dt * 0.12;
      const fx = w.fin.x * N, fy = hz + R * 0.35;
      if (fx > cx - R && fx < cx + R) r.poly([[fx - 3 * u, fy], [fx + 4 * u, fy], [fx + 2 * u, fy - 6 * u]], DARK);
    }
    if (w.torp) {
      const k = Math.min(1, (w.torp.t += dt) / 1.6), ty = lerp(cy + R * 0.9, hz + 2 * u, k), tx = lerp(cx, sx, k);
      for (let q = 0; q < 8; q++) r.rect(lerp(cx, tx, q / 8) - u, lerp(cy + R * 0.9, ty, q / 8), 2 * u, 1, BRIGHT);
      r.rect(tx - 1.5 * u, ty - u, 3 * u, 2 * u, HOT);
      if (k >= 1) {
        burst(w.booms, rnd, sx, hz, 30, N * 0.5, BRIGHT, 0.7);
        burst(w.booms, rnd, sx, hz, 12, N * 0.3, HOT, 0.7);
        w.hitAt = 1.5;
        s.shake = Math.max(s.shake, 0.5);
        w.torp = null;
      }
    }
    w.booms = particles(W, w.booms, BRIGHT);
    for (let y = 0; y < N; y++) {
      const half = Math.sqrt(Math.max(0, R * R - (y + 0.5 - cy) ** 2));
      r.rect(0, y, cx - half, 1, BLACK);
      r.rect(cx + half, y, N - cx - half, 1, BLACK);
    }
    r.rect(cx - R, cy, 2 * R, 1, LMID);
    r.rect(cx, cy - R, 1, 2 * R, LMID);
    for (let k = -4; k <= 4; k++) r.rect(cx + k * R * 0.2, cy - (k % 2 ? 2 : 4) * u, 1, (k % 2 ? 4 : 8) * u, BRIGHT);
    if (w.ping > 0.05) r.ring(cx, cy, R * (1 - w.ping), Math.max(1, u), COOL);
    r.ring(cx, cy, R, 2 * u, DARK);
  },
};

// ---------------------------------------------------------------------------------------------- haunted
// A house on a hill: lightning on the heavy kicks whites the sky and leaves the house a silhouette, windows
// light up with the notes, bats on the hats, a figure with a candle crossing, fog along the ground.
const haunted = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { win: new Float32Array(6), bats: Array.from({ length: 6 }, () => ({ x: rnd(), y: 0.1 + rnd() * 0.3, d: rnd() < 0.5 ? -1 : 1 })), flash: 0, bolt: null,
      fig: { x: 0.08, ph: 0 }, tree: 0.85 + rnd() * 0.08 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.82 * N, hx = 0.5 * N, hw = 0.4 * N, hy = g - 0.45 * N;
    for (const hh of hits) {
      if (isLow(hh) && hh.strength > 0.6) {
        w.flash = 0.15;
        w.bolt = [[0.2 + rnd() * 0.6, 0]];
        for (let k = 1; k <= 5; k++) w.bolt.push([w.bolt[k - 1][0] + (rnd() - 0.5) * 0.12, (k / 5) * 0.5]);
        s.shake = Math.max(s.shake, 0.3);
      } else if (isTonal(hh)) w.win[hh.pc % 6] = 1;
      else if (hh.kind === 'hat') for (const b of w.bats) b.y = clamp(b.y + (rnd() - 0.5) * 0.03, 0.05, 0.5);
    }
    w.flash -= dt;
    for (let k = 0; k < 6; k++) w.win[k] *= Math.exp(-dt * 0.8);
    const lit = w.flash > 0;
    if (lit) r.fill(LMID);
    else r.disc(0.15 * N, 0.2 * N, 0.08 * N, BRIGHT);
    if (w.bolt && lit) for (let i = 1; i < w.bolt.length; i++) r.stroke(w.bolt[i - 1][0] * N, w.bolt[i - 1][1] * N, w.bolt[i][0] * N, w.bolt[i][1] * N, Math.max(1, u), BRIGHT);
    for (let x = 0; x < N; x++) { const y = g - 0.05 * N * Math.sin((x / N) * Math.PI); r.rect(x, y, 1, N - y, DARK); }
    r.rect(hx - hw / 2, hy, hw, g - hy, DARK);
    r.poly([[hx - hw / 2 - 2 * u, hy], [hx - hw * 0.2, hy - 0.12 * N], [hx + hw * 0.1, hy]], DARK);
    r.rect(hx + hw * 0.15, hy - 0.2 * N, hw * 0.22, 0.2 * N, DARK);
    r.poly([[hx + hw * 0.12, hy - 0.2 * N], [hx + hw * 0.26, hy - 0.3 * N], [hx + hw * 0.4, hy - 0.2 * N]], DARK);
    r.rect(hx - hw * 0.45, hy - 0.06 * N, 2 * u, 0.06 * N, DARK);
    [[-0.35, 0.15], [-0.1, 0.15], [0.2, 0.15], [-0.35, 0.5], [0.2, 0.5], [0.22, -0.3]].forEach(([wx, wy], k) =>
      r.rect(hx + wx * hw, hy + wy * (g - hy), 0.08 * hw, 0.1 * (g - hy), w.win[k] > 0.3 ? HOT : w.win[k] > 0.05 ? MID : BG));
    r.rect(hx - 0.04 * hw, g - 0.14 * N, 0.08 * hw, 0.14 * N, w.win[1] > 0.5 ? HOT : BG);
    const tx = w.tree * N;
    r.rect(tx - 2 * u, g - 0.35 * N, 4 * u, 0.35 * N, DARK);
    for (const [dx, dy, l] of [[-1, -0.7, 0.12], [1, -0.5, 0.1], [-0.5, -1.2, 0.08], [0.7, -1.1, 0.09]]) r.stroke(tx, g - 0.28 * N, tx + dx * l * N, g - 0.28 * N + dy * l * N, 1.5 * u, DARK);
    for (const b of w.bats) {
      b.x += b.d * dt * 0.1;
      if (b.x > 1.1) b.x = -0.1;
      if (b.x < -0.1) b.x = 1.1;
      const bx = b.x * N, by = b.y * N + Math.sin(t * 5 + b.x * 20) * 2 * u, fl = Math.floor(t * 10 + b.x * 7) % 2 ? 2 * u : 0;
      r.line(bx - 3 * u, by - fl, bx, by, lit ? DARK : FIG);
      r.line(bx, by, bx + 3 * u, by - fl, lit ? DARK : FIG);
    }
    const F = w.fig;
    F.x += dt * 0.06;
    if (F.x > 1.1) F.x = -0.1;
    F.ph += (dt * 0.06) / (0.1 * 0.16); // the legs in step with the travel
    const fh = 0.16 * N, J = walker(r, F.x * N, g - 0.05 * N * Math.sin(F.x * Math.PI), fh, lit ? DARK : FIG, F.ph, 1, { coat: true, hat: true });
    r.rect(J.sx + 2 * u, J.sy + fh * 0.25, Math.max(1, u), 3 * u, BRIGHT);
    r.rect(J.sx + u, J.sy + fh * 0.25 - 2 * u + (Math.floor(t * 12) % 2) * u, 3 * u, 2 * u, HOT);
    for (let y = Math.round(g - 0.08 * N); y < g + 0.02 * N; y += 3) for (let x = 0; x < N; x++) if ((x + Math.floor(t * 4) + y * 5) % 13 < 5 && hash(y, 3) < 0.7) r.set(x, y, lit ? LMID : MID);
    targets.push({ x: F.x * N - fh * 0.3, y: g - fh - 0.05 * N, w: fh * 0.6, h: fh });
  },
};

// ---------------------------------------------------------------------------------------------- blinds
// A private eye's office: light through the blinds in stripes, a ceiling fan's shadow going round, a figure at
// the desk with a cigarette, a phone that rings on the snare, a lamp.
const blinds = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { fan: 0, smoke: [], ring: 0, puff: 0, desk: 0.55 + rnd() * 0.1, lamp: rnd() < 0.6 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, g = 0.75 * N;
    for (const hh of hits) {
      if (hh.kind === 'snare') w.ring = 0.6;
      else if (isLow(hh)) w.puff = 1;
    }
    w.ring -= dt;
    w.fan += dt * (1 + 2 * f.rel.midDrive);
    const slant = Math.sin(w.fan * 0.5) * 0.15, sweep = (Math.sin(w.fan) + 1) / 2;
    for (let y = 0; y < g; y++) {
      if (Math.floor((y + slant * y) / (6 * u)) % 2) continue;
      for (let x = Math.round(0.08 * N); x < 0.92 * N; x++) if (!(Math.abs(x / N - sweep) < 0.08 && hash(x, y) < 0.8)) r.set(x, y, LMID);
    }
    for (let y = 0; y < g; y += 6 * u) r.rect(0.08 * N, y + slant * y, 0.84 * N, Math.max(1, u), DARK);
    r.rect(0, g, N, N - g, DARK);
    const dx = w.desk * N, fx = dx - 0.02 * N, fh = 0.34 * N, J = walker(r, fx, g + 0.1 * N, fh, FIG, 0, -1, { hat: true, coat: true });
    r.rect(0, g, N, N - g, DARK);
    r.rect(dx - 0.25 * N, g - 0.12 * N, 0.5 * N, 0.12 * N, MID);
    r.rect(dx - 0.25 * N, g - 0.12 * N, 0.5 * N, Math.max(1, u), LMID);
    r.rect(dx + 0.12 * N, g - 0.2 * N, 2 * u, 0.08 * N, DARK);
    r.poly([[dx + 0.06 * N, g - 0.2 * N], [dx + 0.2 * N, g - 0.2 * N], [dx + 0.17 * N, g - 0.25 * N], [dx + 0.09 * N, g - 0.25 * N]], w.lamp ? HOT : MID);
    if (w.lamp) for (let y = Math.round(g - 0.2 * N); y < g - 0.12 * N; y += 2) { const k = (y - (g - 0.2 * N)) / (0.08 * N); r.rect(dx + 0.06 * N - k * 0.06 * N, y, 0.14 * N + k * 0.12 * N, 1, BRIGHT); }
    const px = dx - 0.15 * N;
    r.rect(px - 3 * u, g - 0.16 * N, 6 * u, 3 * u, w.ring > 0 && Math.floor(t * 12) % 2 ? BRIGHT : FIG);
    r.rect(px - 4 * u, g - 0.18 * N + (w.ring > 0 ? Math.sin(t * 40) * u : 0), 8 * u, 2 * u, FIG);
    const hx = J.sx - 4 * u, hy = J.sy + fh * 0.12;
    r.stroke(J.sx, J.sy + fh * 0.2, hx, hy, 1.5 * u, FIG);
    r.rect(hx - 3 * u, hy - u, 3 * u, Math.max(1, u), BRIGHT);
    r.rect(hx - 4 * u, hy - u, Math.max(1, u), Math.max(1, u), HOT);
    if (rnd() < dt * 6 || w.puff > 0.5) w.smoke.push({ x: hx - 4 * u, y: hy - u, r: 0.5 * u, life: 2 });
    w.puff *= Math.exp(-dt * 6);
    w.smoke = w.smoke.filter((p) => {
      p.y -= dt * u * (1.5 + 1.75 * p.life); // it rises, slowing as it cools
      p.x += Math.sin(t * 2 + p.y * 0.3) * dt * 3 * u;
      p.r += dt * u;
      p.life -= dt;
      r.disc(p.x, p.y, p.r * Math.min(1, p.life), LMID);
      return p.life > 0;
    });
    targets.push({ x: fx - fh * 0.25, y: g + 0.1 * N - fh, w: fh * 0.5, h: fh * 0.7 });
  },
};

// ---------------------------------------------------------------------------------------------- skate
// A half-pipe in profile: one run per two beats, side to side; a snare is a trick, a spin in the air over the
// coping, sparks on the beat up there.
const skate = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { ph: 0, trick: 0, spin: 1, sun: 0.7 + rnd() * 0.2 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, g = 0.86 * N, top = 0.4 * N, x0 = 0.08 * N, x1 = 0.92 * N, Lc = 0.22 * N;
    for (const hh of hits) if (hh.kind === 'snare') { w.trick = 1; w.spin = rnd() < 0.5 ? 1 : -1; }
    w.trick = Math.max(0, w.trick - dt * 2.2);
    r.disc(w.sun * N, 0.2 * N, 0.09 * N, HOT);
    for (let k = 0; k < 4; k++) r.rect(0, 0.22 * N + k * 0.03 * N + k * k * u, N, Math.max(1, u), LMID);
    const prof = (x) => {
      if (x < x0 + Lc) { const k = 1 - (x - x0) / Lc; return g - (g - top) * k * k; }
      if (x > x1 - Lc) { const k = 1 - (x1 - x) / Lc; return g - (g - top) * k * k; }
      return g;
    };
    for (let x = 0; x < N; x++) {
      const y = x < x0 || x > x1 ? top : prof(x);
      r.rect(x, y, 1, N - y, MID);
      if (x > x0 && x < x1) r.rect(x, y, 1, Math.max(1, u), LMID);
    }
    r.rect(x0 - 2 * u, top - 2 * u, 4 * u, 4 * u, DARK);
    r.rect(x1 - 2 * u, top - 2 * u, 4 * u, 4 * u, DARK);
    const q = beatLocked(f) ? (f.beat.count + f.beat.phase) / 2 : (w.ph += (dt * (f.bpm ? f.bpm / 60 : 2)) / 2);
    const p = (Math.sin(q * Math.PI) + 1) / 2, sx = lerp(x0 + 2 * u, x1 - 2 * u, p), dir = Math.cos(q * Math.PI) >= 0 ? 1 : -1;
    const atTop = Math.max(0, 1 - Math.min(p, 1 - p) / 0.15), airY = w.trick * atTop * 0.12 * N, by = prof(sx) - airY - 1.5 * u, ang = Math.atan2(prof(sx + 2 * u) - prof(sx - 2 * u), 4 * u) + w.spin * (1 - w.trick) * TAU * atTop; // the board lies along the slope, then spins
    const c = Math.cos(ang), s2 = Math.sin(ang);
    r.stroke(sx - 7 * u * c, by - 7 * u * s2, sx + 7 * u * c, by + 7 * u * s2, 2 * u, DARK);
    for (const k of [-4, 4]) r.disc(sx + k * u * c + 2 * u * s2, by + k * u * s2 - 2 * u * c + 2 * u, Math.max(1, u), DARK);
    walker(r, sx, by - 2 * u, 0.17 * N, FIG, 0.6, dir, { cap: true, hatCol: HOT });
    if (f.beat.on && atTop > 0.5) for (let k = 0; k < 3; k++) r.rect(sx + (rnd() - 0.5) * 6 * u, prof(sx), Math.max(1, u), Math.max(1, u), BRIGHT);
    targets.push({ x: sx - 0.05 * N, y: by - 0.19 * N, w: 0.1 * N, h: 0.19 * N });
  },
};

// ---------------------------------------------------------------------------------------------- arena
// A stadium show: four moving heads sweeping on the beat, lasers on the snare, strobes on the heavy kicks,
// a crowd with hands and lighters, confetti on a new section.
const arena = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { crowd: Array.from({ length: 120 }, () => ({ x: rnd(), y: rnd(), ph: rnd() * TAU, lit: rnd() < 0.3 })).sort((p, q) => p.y - q.y), lasers: 0, conf: [], flashes: [] }); // the far rows first
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, stageY = 0.55 * N;
    for (const hh of hits) {
      if (hh.kind === 'snare') w.lasers = 0.3;
      else if (isLow(hh) && hh.strength > 0.7) w.flashes.push({ x: 0.1 + rnd() * 0.8, t: 0.08 });
    }
    if (f.section) for (let k = 0; k < 120; k++) w.conf.push({ x: rnd() * N, y: -rnd() * 0.3 * N, vx: (rnd() - 0.5) * N * 0.1, vy: N * (0.1 + rnd() * 0.1), a: rnd() * TAU, c: [HOT, COOL, BRIGHT][k % 3] });
    w.lasers -= dt;
    const k = (((f.beat.count % 4) + f.beat.phase) / 4) * TAU;
    for (let i = 0; i < 4; i++) {
      const hx = (0.2 + i * 0.2) * N, ang = Math.PI / 2 + 0.6 * Math.sin(k + (i * Math.PI) / 2);
      for (let y = 2; y < stageY; y += 2) { const d = y / Math.sin(ang), xc = hx + Math.cos(ang) * d, half = d * 0.06; r.rect(xc - half, y, 2 * half, 1, i % 2 ? COOL : HOT); }
      r.rect(hx - 3 * u, 0, 6 * u, 3 * u, DARK);
    }
    r.rect(0, 0, N, Math.max(1, u), DARK);
    if (w.lasers > 0) for (let i = 0; i < 7; i++) { const a = Math.PI / 2 + (i - 3) * 0.22 + Math.sin(t * 9) * 0.1; r.line(N / 2, 0, N / 2 + Math.cos(a) * N, Math.sin(a) * N, COOL); }
    r.rect(0, stageY, N, 0.1 * N, DARK);
    r.rect(0, stageY, N, Math.max(1, u), LMID);
    for (const x of [0.08, 0.84]) {
      r.rect(x * N, stageY - 0.18 * N, 0.08 * N, 0.18 * N, DARK);
      for (const y of [0.14, 0.06]) r.ring((x + 0.04) * N, stageY - y * N, 0.02 * N * (1 + 0.2 * f.rel.bassDrive), Math.max(1, u), MID);
    }
    const px = 0.5 * N, ph2 = 0.22 * N, J = walker(r, px, stageY, ph2, FIG, 0.3 * Math.sin(t * 8), 1, {});
    r.stroke(px - ph2 * 0.1, J.sy + ph2 * 0.25, px + ph2 * 0.35, J.sy + ph2 * 0.05, 1.5 * u, HOT);
    r.disc(px, J.sy + ph2 * 0.3, ph2 * 0.12, HOT);
    w.flashes = w.flashes.filter((fl) => { fl.t -= dt; if (fl.t > 0) r.disc(fl.x * N, stageY - 0.3 * N - rnd() * 0.1 * N, 3 * u, BRIGHT); return fl.t > 0; });
    for (const c of w.crowd) {
      const y = stageY + 0.12 * N + c.y * (N - stageY - 0.12 * N), sz = (2 + 4 * c.y) * u, x = c.x * N;
      r.disc(x, y, sz, DARK);
      r.rect(x - sz * 1.4, y + sz * 0.5, sz * 2.8, sz * 1.5, DARK);
      if (f.beat.pulse > 0.4 && hash(Math.round(x), f.beat.count) < 0.5) { r.line(x - sz, y - sz * 0.5, x - sz * 1.5, y - sz * 2.5, DARK); r.line(x + sz, y - sz * 0.5, x + sz * 1.5, y - sz * 2.5, DARK); }
      if (c.lit) r.rect(x + Math.sin(t * 1.5 + c.ph) * sz * 1.5, y - sz * 2.2, Math.max(1, u), Math.max(1, u), BRIGHT);
    }
    w.conf = w.conf.filter((p) => {
      p.y += p.vy * dt;
      p.x += p.vx * dt + Math.sin((p.a += dt * 4)) * dt * 8 * u;
      r.rect(p.x, p.y, Math.max(1, Math.round(2 * u * Math.abs(Math.cos(p.a)))), Math.max(1, u), p.c);
      return p.y < N;
    }).slice(-400);
    targets.push({ x: px - ph2 * 0.3, y: stageY - ph2, w: ph2 * 0.6, h: ph2 });
  },
};

// ---------------------------------------------------------------------------------------------- block party
// A wall of block-letter tags, a boombox whose cones pump with the bass and VU bars with the bands, and a
// b-boy: windmills on the kicks, a freeze on the snare.
const blockparty = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { tags: Array.from({ length: 5 }, (_, i) => ({ x: 0.05 + i * 0.19 + rnd() * 0.03, y: 0.2 + rnd() * 0.25, w: 0.12 + rnd() * 0.05, h: 0.1 + rnd() * 0.08,
      c: [HOT, COOL, BRIGHT][i % 3], bits: Array.from({ length: 12 }, () => rnd() < 0.5) })), spin: 0, spinV: 0, vu: new Float32Array(8), pose: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, g = 0.8 * N;
    for (const hh of hits) {
      if (isLow(hh)) w.spinV = Math.min(w.spinV + 4, 14);
      else if (hh.kind === 'snare') w.pose ^= 1;
    }
    w.spin += w.spinV * dt;
    w.spinV *= Math.exp(-dt * 0.8);
    for (let k = 0; k < 8; k++) w.vu[k] = Math.max(f.band10[k + 1] || 0, w.vu[k] - dt * 1.5);
    r.rect(0, 0, N, g, MID);
    for (let y = 0; y < g; y += 4 * u) r.rect(0, y, N, 1, DARK + DIM);
    for (const tg of w.tags) {
      const x = tg.x * N, y = tg.y * N, cw = (tg.w * N) / 4, ch = (tg.h * N) / 3;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) if (tg.bits[j * 4 + i]) { r.rect(x + i * cw + u, y + j * ch + u, cw, ch, DARK); r.rect(x + i * cw, y + j * ch, cw, ch, tg.c); }
    }
    r.rect(0, g, N, N - g, DARK);
    r.rect(0, g, N, 2 * u, LMID);
    const bx = 0.78 * N, by = g - 0.14 * N, bw = 0.26 * N, bh = 0.14 * N;
    r.rect(bx - bw / 2, by, bw, bh, DARK);
    r.rect(bx - bw / 2 - 2 * u, by - 2 * u, bw + 4 * u, 2 * u, FIG);
    for (const sx of [bx - bw * 0.3, bx + bw * 0.3]) { const rr = bh * 0.33 * (1 + 0.15 * f.rel.bassDrive); r.ring(sx, by + bh * 0.5, rr, Math.max(1, u), LMID); r.disc(sx, by + bh * 0.5, rr * 0.5, MID); }
    r.rect(bx - bw * 0.1, by + bh * 0.15, bw * 0.2, bh * 0.3, LMID);
    for (const k of [-1, 1]) r.disc(bx + k * bw * 0.05, by + bh * 0.3, 1.5 * u, DARK);
    for (let k = 0; k < 8; k++) r.rect(bx - bw * 0.1 + k * bw * 0.025, by + bh * 0.85 - w.vu[k] * bh * 0.3, bw * 0.02, w.vu[k] * bh * 0.3, k > 5 ? HOT : COOL);
    targets.push({ x: bx - bw / 2, y: by, w: bw, h: bh });
    const cx = 0.35 * N, cy = g - 2 * u, Lb = 0.14 * N;
    if (w.spinV > 0.5) {
      for (const [da, len] of [[0, Lb], [Math.PI, Lb], [Math.PI / 2, Lb * 0.7], [-Math.PI / 2, Lb * 0.7]]) r.stroke(cx, cy - 4 * u, cx + Math.cos(w.spin + da) * len, cy - 4 * u + Math.sin(w.spin + da) * len * 0.5, 2.5 * u, FIG);
      r.disc(cx, cy - 4 * u, 3.5 * u, FIG);
      if (f.beat.pulse > 0.5) for (let k = 0; k < 3; k++) r.rect(cx + (rnd() - 0.5) * Lb, cy - rnd() * 2 * u, Math.max(1, u), Math.max(1, u), BRIGHT);
    } else if (w.pose) {
      r.stroke(cx, cy, cx - Lb * 0.4, cy - Lb * 0.8, 2.5 * u, FIG);
      r.stroke(cx - Lb * 0.4, cy - Lb * 0.8, cx + Lb * 0.2, cy - Lb * 1.5, 2.5 * u, FIG);
      r.disc(cx + Lb * 0.25, cy - Lb * 1.6, 3 * u, FIG);
      r.stroke(cx - Lb * 0.4, cy - Lb * 0.8, cx - Lb * 0.9, cy - Lb * 0.6, 2 * u, FIG);
    } else walker(r, cx, cy, 0.2 * N, FIG, 0.5 * Math.sin(t * 8), 1, { cap: true, hatCol: HOT });
    targets.push({ x: cx - Lb, y: cy - Lb * 1.7, w: 2 * Lb, h: Lb * 1.7 });
  },
};

// ---------------------------------------------------------------------------------------------- rocket
// A launch pad: the countdown lights go out one per beat (or all at once on a drop), then lift-off with flame,
// smoke piling on the pad and the gantry arms swinging away.
const rocket = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { count: 10, y: 0, v: 0, lift: false, smoke: [], flame: 0, stars: Array.from({ length: 30 }, () => [rnd(), rnd() * 0.6]), tower: 0.62, arm: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s } = W, g = 0.85 * N;
    if (f.beat.on && !w.lift && --w.count <= 0) w.lift = true;
    if (f.section === 'drop') w.lift = true;
    for (const hh of hits) if (isLow(hh)) w.flame = 1;
    w.flame *= Math.exp(-dt * 5);
    if (w.lift) {
      w.v += dt * 0.25;
      w.y += w.v * dt;
      s.shake = Math.max(s.shake, 0.4 * Math.min(1, w.v * 3));
      if (w.y > 1.3) { w.y = 0; w.v = 0; w.lift = false; w.count = 10; }
    }
    for (const [sx, sy] of w.stars) r.set(sx * N, sy * N, LMID);
    r.rect(0, g, N, N - g, MID);
    r.rect(0, g, N, Math.max(1, u), LMID);
    w.arm = follow(w.arm, w.lift ? 1 : 0, dt, 0.4); // the gantry arms swing away rather than jump
    const rx = 0.42 * N, ry = g - w.y * N, rh = 0.42 * N, rw = 0.07 * N, tx = w.tower * N, arm = w.arm * 0.08 * N;
    r.rect(rx - 0.1 * N, g - 2 * u, 0.2 * N, 2 * u, DARK);
    r.rect(tx, g - 0.5 * N, 3 * u, 0.5 * N, DARK);
    for (let y = g - 0.48 * N; y < g; y += 0.06 * N) { r.rect(tx - 0.12 * N + arm, y, 0.12 * N - arm, Math.max(1, u), DARK); r.line(tx, y, tx + 3 * u, y + 0.06 * N, DARK); }
    r.rect(tx - u, g - 0.52 * N, 5 * u, 2 * u, f.beat.pulse > 0.5 ? HOT : DARK);
    r.rect(rx - rw / 2, ry - rh, rw, rh, BRIGHT);
    r.poly([[rx - rw / 2, ry - rh], [rx + rw / 2, ry - rh], [rx, ry - rh - 0.08 * N]], HOT);
    r.poly([[rx - rw / 2, ry], [rx - rw / 2, ry - 0.1 * N], [rx - rw / 2 - 0.04 * N, ry]], HOT);
    r.poly([[rx + rw / 2, ry], [rx + rw / 2, ry - 0.1 * N], [rx + rw / 2 + 0.04 * N, ry]], HOT);
    for (let k = 0; k < 3; k++) r.rect(rx - rw / 2, ry - rh * (0.3 + k * 0.25), rw, Math.max(1, u), DARK);
    r.disc(rx, ry - rh * 0.8, 1.8 * u, COOL);
    if (w.lift || w.flame > 0.1) {
      const fl = w.lift ? 1 : w.flame;
      for (let k = 0; k < 6; k++) r.poly([[rx - rw * 0.4, ry], [rx + rw * 0.4, ry], [rx + (rnd() - 0.5) * rw * 0.3, ry + (0.06 + rnd() * 0.1) * N * fl]], k % 2 ? HOT : BRIGHT);
      for (let k = 0; k < 3; k++) w.smoke.push({ x: rx + (rnd() - 0.5) * rw, y: Math.min(g, ry + 0.02 * N), vx: (rnd() - 0.5) * N * 0.3 * (w.lift ? 1 : 0.3), vy: -rnd() * N * 0.05, r: 2 * u, life: 1.5 + rnd() });
    }
    w.smoke = w.smoke.filter((p) => {
      p.x += p.vx * dt;
      p.y = Math.min(g + 2 * u, p.y + p.vy * dt);
      p.r += dt * 4 * u;
      p.life -= dt;
      r.disc(p.x, p.y, p.r * Math.min(1, p.life), LMID);
      return p.life > 0;
    }).slice(-200);
    for (let k = 0; k < 10; k++) r.rect(0.08 * N, 0.2 * N + k * 0.04 * N, 4 * u, 3 * u, k < w.count ? (k < 3 ? HOT : COOL) : DARK);
    targets.push({ x: rx - rw, y: ry - rh - 0.08 * N, w: 2 * rw, h: rh + 0.08 * N });
  },
};

// ---------------------------------------------------------------------------------------------- disco
// A lit dance floor in perspective whose tiles change on the beat, a mirror ball throwing dots round the room,
// dancers as silhouettes: hips on the beat, arms on the snare.
const disco = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { tiles: Array.from({ length: 64 }, () => Math.floor(rnd() * 4)), dancers: Array.from({ length: 5 }, (_, i) => ({ x: 0.15 + i * 0.17 + rnd() * 0.05, s: 0.8 + rnd() * 0.3, ph: rnd() * TAU, arm: i % 2 })).sort((p, q) => p.s - q.s), ball: 0 }); // the far (small) ones first
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, g = 0.62 * N, TC = [HOT, COOL, BRIGHT, MID];
    if (f.beat.on) for (let k = 0; k < 12; k++) w.tiles[Math.floor(rnd() * 64)] = Math.floor(rnd() * 4);
    for (const hh of hits) if (hh.kind === 'snare') for (const d of w.dancers) d.arm = 1 - d.arm;
    w.ball += dt * (0.3 + 0.5 * f.rel.midDrive);
    for (let j = 0; j < 8; j++) {
      const y0 = g + (N - g) * (j / 8) ** 1.4, y1 = g + (N - g) * ((j + 1) / 8) ** 1.4, k0 = 0.35 + 0.65 * (j / 8), k1 = 0.35 + 0.65 * ((j + 1) / 8);
      for (let i = 0; i < 8; i++) {
        const xa0 = N / 2 + (i / 8 - 0.5) * N * k0, xb0 = N / 2 + ((i + 1) / 8 - 0.5) * N * k0, xa1 = N / 2 + (i / 8 - 0.5) * N * k1, xb1 = N / 2 + ((i + 1) / 8 - 0.5) * N * k1;
        r.poly([[xa0 + u * 0.5, y0 + u * 0.5], [xb0 - u * 0.5, y0 + u * 0.5], [xb1 - u * 0.5, y1 - u * 0.5], [xa1 + u * 0.5, y1 - u * 0.5]], TC[w.tiles[j * 8 + i]]);
      }
    }
    const bx = N / 2, by = 0.12 * N, br = 0.06 * N;
    r.rect(bx - u / 2, 0, Math.max(1, u), by - br, LMID);
    r.disc(bx, by, br, LMID);
    for (let k = 0; k < 20; k++) { const a = w.ball + k * 0.7; r.rect(bx + Math.cos(a) * br * 0.8, by + Math.sin(a * 1.3) * br * 0.7, Math.max(1, u), Math.max(1, u), Math.cos(a) > 0 ? BRIGHT : DARK); }
    for (let k = 0; k < 14; k++) { const a = w.ball * 1.7 + k * (TAU / 14), x = bx + Math.cos(a) * N * 0.6, y = by + Math.sin(a) * N * 0.45; if (y < g) r.rect(x, y, 2 * u, 2 * u, k % 2 ? BRIGHT : LMID); }
    for (const d of w.dancers) {
      const h = 0.26 * N * d.s, x = d.x * N + Math.sin(t * 2 + d.ph) * 2 * u, base = g + 0.02 * N + d.s * 0.05 * N;
      const J = walker(r, x, base, h, DARK, 0.5 * Math.sin(f.beat.phase * TAU + d.ph), 1, {}), aa = d.arm ? -2.3 : 2.5;
      r.stroke(J.sx, J.sy + h * 0.05, J.sx + Math.sin(aa) * h * 0.3, J.sy + h * 0.05 + Math.cos(aa) * h * 0.3, Math.max(1, h * 0.06), DARK);
      targets.push({ x: x - h * 0.25, y: base - h, w: h * 0.5, h });
    }
  },
};

// ---------------------------------------------------------------------------------------------- dungeon
// A dungeon from above: a hero in a red helmet steps a tile per beat toward the nearest monster, a kick is the
// weapon in hand, a slain monster drops loot, torches flicker on the hats. The bestiary: slimes that wander,
// skeletons that close in, bats two tiles a beat, ghosts that come through the walls, spiders that wait and rush,
// an ogre that fills its tile; the hand: a sword's arc, a spear's thrust two tiles out, an axe that sweeps the
// three tiles ahead, a wand whose bolt flies down the row, a hammer whose blow rings round it. A section change
// changes the hand, a drop brings the hammer and an ogre.
const MOBS = {
  slime: { hp: 2, every: 2, chase: false }, // a box on three wiggling legs, wanders
  skeleton: { hp: 2, every: 2, chase: true }, // a skull, ribs and stick limbs, closes in
  bat: { hp: 1, every: 1, chase: true, fly: 2 }, // wings, two tiles a beat
  ghost: { hp: 2, every: 2, chase: true, wall: true }, // a dome with a wavy hem, drifts through walls
  spider: { hp: 2, every: 1, chase: true, rush: 3 }, // eight legs, waits, rushes when the hero is near
  ogre: { hp: 5, every: 4, chase: true, big: true }, // fills the tile and more, a club over the shoulder
};
const MOB_W = { slime: [3, 2, 1], bat: [2, 2, 2], skeleton: [1, 3, 2], spider: [1, 2, 3], ghost: [2, 1, 1], ogre: [0, 1, 2] };
const HANDS = { sword: { dmg: 1 }, spear: { dmg: 1, reach: 2 }, axe: { dmg: 2, sweep: true }, wand: { dmg: 1, bolt: true }, hammer: { dmg: 2, ring: true } };
const HAND_W = { sword: [3, 2, 2], spear: [2, 2, 1], axe: [1, 2, 3], wand: [2, 2, 1], hammer: [0, 1, 2] };

function spawnMob(w, rnd, band, kind = rollW(rnd, MOB_W, band)) {
  for (let k = 0; k < 60; k++) {
    const x = 1 + Math.floor(rnd() * (w.G - 2)), y = 1 + Math.floor(rnd() * (w.G - 2));
    if (!w.cells[y * w.G + x] && Math.abs(x - w.hero.x) + Math.abs(y - w.hero.y) > 3) { w.mobs.push({ x, y, kind, hp: MOBS[kind].hp, flash: 0, ph: rnd() * TAU }); return; }
  }
}

// a monster in the tile centred on (X, Y)
function drawMob(r, kind, X, Y, T, u, c, t, m) {
  switch (kind) {
    case 'skeleton': {
      const st = Math.sin(t * 8 + m.ph) * u;
      r.disc(X, Y - T * 0.22, T * 0.14, c);
      for (const k of [-1, 1]) r.rect(X + k * T * 0.05 - u * 0.5, Y - T * 0.25, Math.max(1, u), Math.max(1, u), DARK);
      r.rect(X - u * 0.5, Y - T * 0.1, Math.max(1, u), T * 0.32, c);
      for (let k = 0; k < 3; k++) r.rect(X - T * 0.14, Y - T * 0.06 + k * T * 0.07, T * 0.28, Math.max(1, u), c);
      for (const k of [-1, 1]) { r.line(X, Y - T * 0.04, X + k * T * 0.26, Y + T * 0.1 + k * st, c); r.rect(X + k * T * 0.08 - u * 0.5, Y + T * 0.2, Math.max(1, u), T * 0.2 + k * st, c); }
      break;
    }
    case 'bat': {
      const flap = Math.sin(t * 14 + m.ph) * T * 0.2;
      for (const k of [-1, 1]) r.poly([[X, Y], [X + k * T * 0.42, Y - flap - T * 0.05], [X + k * T * 0.3, Y + T * 0.12]], c);
      r.disc(X, Y, T * 0.1, c);
      for (const k of [-1, 1]) r.rect(X + k * T * 0.04 - u * 0.5, Y - u, Math.max(1, u), Math.max(1, u), HOT);
      break;
    }
    case 'ghost': {
      const Yf = Y + Math.sin(t * 3 + m.ph) * 1.5 * u;
      r.disc(X, Yf - T * 0.1, T * 0.24, c);
      r.rect(X - T * 0.24, Yf - T * 0.1, T * 0.48, T * 0.28, c);
      for (let k = 0; k < 3; k++) r.disc(X - T * 0.16 + k * T * 0.16, Yf + T * 0.18 + (k % 2) * u, T * 0.08, c);
      for (const k of [-1, 1]) r.rect(X + k * T * 0.08 - u, Yf - T * 0.16, 2 * u, 2 * u, DARK);
      break;
    }
    case 'spider': {
      r.disc(X, Y + T * 0.04, T * 0.17, c);
      r.disc(X - T * 0.2, Y, T * 0.1, c);
      for (const k of [-1, 1]) for (let i = 0; i < 4; i++) {
        const ky = Y - T * 0.25 + i * T * 0.18, wig = Math.sin(t * 10 + i + m.ph) * u;
        r.line(X, Y + T * 0.02, X + k * T * 0.26, ky, c);
        r.line(X + k * T * 0.26, ky, X + k * T * 0.42, ky + T * 0.1 + wig, c);
      }
      for (const k of [-1, 1]) r.rect(X - T * 0.24 + k * T * 0.03 - u * 0.5, Y - T * 0.03, Math.max(1, u), Math.max(1, u), HOT);
      break;
    }
    case 'ogre': {
      for (const k of [-1, 1]) r.rect(X + k * T * 0.18 - T * 0.08, Y + T * 0.25, T * 0.16, T * 0.2, c);
      r.rect(X - T * 0.36, Y - T * 0.3, T * 0.72, T * 0.58, c);
      r.rect(X - T * 0.22, Y - T * 0.62, T * 0.44, T * 0.36, c);
      for (const k of [-1, 1]) { r.rect(X + k * T * 0.1 - u, Y - T * 0.5, 2 * u, 2 * u, HOT); r.rect(X + k * T * 0.1 - u * 0.5, Y - T * 0.3, Math.max(1, u), 2 * u, BRIGHT); }
      r.stroke(X + T * 0.34, Y - T * 0.05, X + T * 0.6, Y - T * 0.6, 2 * u, DARK);
      r.disc(X + T * 0.6, Y - T * 0.6, 3 * u, DARK);
      break;
    }
    default: // the slime
      r.rect(X - T * 0.3, Y - T * 0.25, T * 0.6, T * 0.5, c);
      r.rect(X - T * 0.2, Y - T * 0.1, 2 * u, 2 * u, HOT);
      r.rect(X + T * 0.05, Y - T * 0.1, 2 * u, 2 * u, HOT);
      for (let k = -1; k <= 1; k++) r.rect(X + k * T * 0.2 - u, Y + T * 0.25, 2 * u, T * 0.15 + (Math.floor(t * 8 + k) % 2) * u, c);
  }
}

const dungeon = {
  init(W) {
    const { w, rnd } = W, G = 11, cells = new Uint8Array(G * G), band = bandOf(W.a);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) cells[y * G + x] = x === 0 || y === 0 || x === G - 1 || y === G - 1 || (x % 4 === 2 && y % 4 === 2) || rnd() < 0.08 ? 1 : 0;
    cells[G * 5 + 5] = 0;
    Object.assign(w, { G, cells, hero: { x: 5, y: 5, fx: 5, fy: 5, dir: 1 }, hand: rollW(rnd, HAND_W, band), mobs: [], loot: [], bolts: [], torches: [[1, 1], [G - 2, 1], [1, G - 2], [G - 2, G - 2]], step: 0, swing: 0, flick: 0, ringT: 0, spark: 0 });
    for (let k = 0; k < 4; k++) spawnMob(w, rnd, band);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, G = w.G, T = N / G, Hh = w.hero, band = bandOf(W.a), Hd = HANDS[w.hand];
    const inside = (x, y) => x > 0 && y > 0 && x < G - 1 && y < G - 1;
    const open = (x, y) => inside(x, y) && !w.cells[y * G + x];
    const wound = (m, dmg) => {
      m.hp -= dmg; m.flash = 0.15;
      s.shake = Math.max(s.shake, MOBS[m.kind].big ? 0.4 : 0.3);
      if (m.hp <= 0) { w.loot.push({ x: m.x, y: m.y, t: 0 }); w.mobs.splice(w.mobs.indexOf(m), 1); spawnMob(w, rnd, band); }
    };
    if (beatLocked(f) ? f.beat.on : (w.step += dt) > 0.5) {
      w.step = 0;
      const goal = w.mobs[0] || w.loot[0];
      if (goal) {
        const dx = Math.sign(goal.x - Hh.x), dy = Math.sign(goal.y - Hh.y);
        if (dx && open(Hh.x + dx, Hh.y) && (rnd() < 0.6 || !dy)) Hh.x += dx;
        else if (dy && open(Hh.x, Hh.y + dy)) Hh.y += dy;
        else if (dx && open(Hh.x + dx, Hh.y)) Hh.x += dx;
        if (dx) Hh.dir = dx;
      }
      for (const m of w.mobs) { // each kind moves its own way
        const K = MOBS[m.kind], far = Math.abs(m.x - Hh.x) + Math.abs(m.y - Hh.y);
        if (f.beat.count % K.every) continue;
        if (K.rush && far > K.rush) continue;
        const can = (x, y) => (K.wall ? inside(x, y) : open(x, y)) && !(x === Hh.x && y === Hh.y);
        for (let n = 0; n < (K.fly || 1); n++) {
          let d;
          if (K.chase) { const dx = Math.sign(Hh.x - m.x), dy = Math.sign(Hh.y - m.y); d = Math.abs(Hh.x - m.x) >= Math.abs(Hh.y - m.y) ? [dx, 0] : [0, dy]; if (!can(m.x + d[0], m.y + d[1])) d = d[0] ? [0, dy] : [dx, 0]; }
          else d = pick(rnd, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
          if (can(m.x + d[0], m.y + d[1])) { m.x += d[0]; m.y += d[1]; }
        }
      }
    }
    Hh.fx = follow(Hh.fx, Hh.x, dt, 0.08);
    Hh.fy = follow(Hh.fy, Hh.y, dt, 0.08);
    for (const hh of hits) {
      if (isLow(hh)) {
        w.swing = 1;
        const dmg = Hd.dmg + (hh.strength > 0.8 ? 1 : 0);
        if (Hd.bolt) w.bolts.push({ x: Hh.x + 0.5, y: Hh.y + 0.5, dx: Hh.dir, life: 1.2 });
        if (Hd.ring) { w.ringT = 0.35; s.shake = Math.max(s.shake, 0.4); }
        for (const m of w.mobs.slice()) {
          const dx = m.x - Hh.x, dy = m.y - Hh.y, adj = Math.abs(dx) + Math.abs(dy) <= 1;
          const got = Hd.reach ? adj || (dy === 0 && dx * Hh.dir > 0 && dx * Hh.dir <= Hd.reach) : Hd.sweep ? Math.max(Math.abs(dx), Math.abs(dy)) <= 1 && dx * Hh.dir >= 0 : Hd.ring ? Math.hypot(dx, dy) <= 1.6 : Hd.bolt ? false : adj;
          if (got) wound(m, dmg);
        }
      } else if (hh.kind === 'hat') w.flick = 0.1;
    }
    if (f.section === 'drop') { w.hand = 'hammer'; w.spark = 0.5; spawnMob(w, rnd, band, 'ogre'); }
    else if (f.section === 'change') { w.hand = rollW(rnd, HAND_W, band); w.spark = 0.5; }
    w.swing -= dt * 4; w.flick -= dt; w.ringT -= dt; w.spark -= dt;
    w.loot = w.loot.filter((l) => !(l.x === Hh.x && l.y === Hh.y));
    for (let y = 0; y < G; y++)
      for (let x = 0; x < G; x++) {
        const X = x * T, Y = y * T;
        if (w.cells[y * G + x]) { r.rect(X, Y, T, T, DARK); r.rect(X, Y, T, T * 0.35, MID); r.rect(X, Y + T * 0.35, T, Math.max(1, u), LMID); }
        else if ((x + y) % 2) r.rect(X + T * 0.5, Y + T * 0.5, Math.max(1, u), Math.max(1, u), DARK);
      }
    for (const [tx, ty] of w.torches) {
      const X = (tx + 0.5) * T, Y = (ty + 0.5) * T, fl = w.flick > 0 || Math.floor(t * 12 + tx) % 3 === 0;
      r.rect(X - u, Y - u, 2 * u, 4 * u, MID);
      r.disc(X, Y - 2 * u, fl ? 2.5 * u : 2 * u, HOT);
      if (fl) r.ring(X, Y, T * 1.4, Math.max(1, u), DARK + DIM);
    }
    for (const l of w.loot) { l.t += dt; const X = (l.x + 0.5) * T, Y = (l.y + 0.5) * T + Math.sin(l.t * 5) * u; r.rect(X - 2.5 * u, Y - 2 * u, 5 * u, 4 * u, COOL); r.rect(X - u, Y - 2 * u, 2 * u, 4 * u, BRIGHT); }
    w.bolts = w.bolts.filter((b) => { // the wand's bolt flies down the row until a wall or a monster
      b.x += b.dx * dt * 8; b.life -= dt;
      const cx = Math.floor(b.x), cy = Math.floor(b.y);
      if (!open(cx, cy) || b.life <= 0) return false;
      const m = w.mobs.find((mm) => mm.x === cx && mm.y === cy);
      if (m) { wound(m, Hd.dmg); return false; }
      r.disc(b.x * T, b.y * T, 1.5 * u, COOL);
      r.rect(b.x * T - b.dx * 4 * u - u, b.y * T - u * 0.5, 4 * u, Math.max(1, u), COOL + DIM);
      return true;
    });
    for (const m of w.mobs.sort((a, b) => (MOBS[a.kind].big ? 1 : 0) - (MOBS[b.kind].big ? 1 : 0))) {
      m.flash -= dt;
      const K = MOBS[m.kind], X = (m.x + 0.5) * T, Y = (m.y + 0.5) * T, c = m.flash > 0 ? BRIGHT : K.wall ? LMID + DIM : LMID;
      drawMob(r, m.kind, X, Y, T, u, c, t, m);
      targets.push({ x: X - T * 0.3, y: Y - T * (K.big ? 0.65 : 0.3), w: T * 0.6, h: T * (K.big ? 1.1 : 0.7) });
    }
    const X = (Hh.fx + 0.5) * T, Y = (Hh.fy + 0.5) * T, k = w.swing > 0 ? 1 - w.swing : -1, hx = X + Hh.dir * T * 0.2;
    if (w.ringT > 0) { // the hammer's blow rings out, cracks in the floor
      const R = T * 1.6 * (1 - w.ringT / 0.35);
      r.ring(X, Y, R, 1.5 * u, LMID);
      for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.4; r.line(X + Math.cos(a) * T * 0.3, Y + Math.sin(a) * T * 0.3, X + Math.cos(a) * T * 0.9, Y + Math.sin(a) * T * 0.9, DARK); }
    }
    r.rect(X - T * 0.22, Y - T * 0.2, T * 0.44, T * 0.45, FIG);
    r.rect(X - T * 0.18, Y - T * 0.38, T * 0.36, T * 0.22, HOT);
    r.rect(X - T * 0.12, Y - T * 0.22, T * 0.24, Math.max(1, u), DARK);
    switch (w.hand) {
      case 'spear': { const L = T * (0.5 + (k >= 0 ? Math.sin(Math.PI * k) * 1.6 : 0)); r.stroke(hx - Hh.dir * T * 0.1, Y, hx + Hh.dir * L, Y, Math.max(1, u), DARK); r.rect(hx + Hh.dir * L - u, Y - u, 2 * u, 2 * u, BRIGHT); break; }
      case 'axe': { const a = k >= 0 ? lerp(-1.7, 1.7, k) : 0.4, ex = hx + Hh.dir * Math.cos(a) * T * 0.55, ey = Y + Math.sin(a) * T * 0.55; r.stroke(hx, Y, ex, ey, Math.max(1, u), DARK); r.poly([[ex, ey], [ex - Hh.dir * Math.sin(a) * 3 * u + Hh.dir * Math.cos(a) * 2 * u, ey + Math.cos(a) * 3 * u + Math.sin(a) * 2 * u], [ex - Hh.dir * Math.sin(a) * 3 * u - Hh.dir * Math.cos(a) * 3 * u, ey + Math.cos(a) * 3 * u - Math.sin(a) * 3 * u]], LMID); break; }
      case 'wand': { const a = k >= 0 ? lerp(-0.9, 0.3, k) : 0.2, ex = hx + Hh.dir * Math.cos(a) * T * 0.35, ey = Y + Math.sin(a) * T * 0.35; r.stroke(hx, Y, ex, ey, Math.max(1, u), DARK); r.disc(ex, ey, k >= 0 && k < 0.3 ? 2.5 * u : 1.5 * u, k >= 0 && k < 0.3 ? BRIGHT : COOL); break; }
      case 'hammer': { const a = k >= 0 ? lerp(-1.2, 0.7, k) : -0.6, ex = hx + Hh.dir * Math.cos(a) * T * 0.4, ey = Y + Math.sin(a) * T * 0.4; r.stroke(hx, Y, ex, ey, Math.max(1, u), DARK); r.rect(ex - T * 0.11, ey - T * 0.11, T * 0.22, T * 0.22, LMID); break; }
      default: { const a = k >= 0 ? lerp(-1.2, 1.2, k) : 0.3, L = T * 0.6; r.stroke(hx, Y, hx + Hh.dir * Math.cos(a) * L, Y + Math.sin(a) * L, Math.max(1, u), BRIGHT); }
    }
    if (w.spark > 0) r.ring(X, Y, T * (0.4 + 0.5 * (0.5 - w.spark)), Math.max(1, u), BRIGHT); // the new hand, a glint
    targets.push({ x: X - T * 0.3, y: Y - T * 0.4, w: T * 0.6, h: T * 0.7 });
  },
};

// ---------------------------------------------------------------------------------------------- light trails
// Two riders on a grid leaving walls of light, a cell per sixteenth at the tempo; a kick turns one, a snare the
// other, and running into a wall is a burst and a fresh grid.
const lightcycles = {
  init(W) {
    const { w, rnd } = W, G = 40;
    Object.assign(w, { G, occ: new Uint8Array(G * G), riders: [{ x: 5, y: 20, dx: 1, dy: 0, c: COOL, trail: [] }, { x: 34, y: 20, dx: -1, dy: 0, c: HOT, trail: [] }], step: 0, boom: [], flash: 0 });
    for (const rd of w.riders) { rd.y = 10 + Math.floor(rnd() * 20); w.occ[rd.y * G + rd.x] = 1; rd.trail.push([rd.x, rd.y]); }
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, G = w.G, T = N / G;
    const reset = () => {
      w.occ.fill(0);
      for (const rd of w.riders) { rd.x = rd.c === COOL ? 5 : 34; rd.y = 10 + Math.floor(rnd() * 20); rd.dx = rd.c === COOL ? 1 : -1; rd.dy = 0; rd.trail = [[rd.x, rd.y]]; w.occ[rd.y * G + rd.x] = 1; }
      w.flash = 0.1;
    };
    for (const hh of hits)
      if (hh.kind === 'snare' || isLow(hh)) { const rd = w.riders[isLow(hh) ? 0 : 1], left = rnd() < 0.5; [rd.dx, rd.dy] = left ? [rd.dy, -rd.dx] : [-rd.dy, rd.dx]; }
    w.step += dt * (f.bpm ? f.bpm / 60 : 2) * 4 * (0.6 + 0.4 * W.a);
    while (w.step >= 1) {
      w.step--;
      let crashed = false;
      for (const rd of w.riders) {
        const nx = rd.x + rd.dx, ny = rd.y + rd.dy;
        if (nx < 0 || ny < 0 || nx >= G || ny >= G || w.occ[ny * G + nx]) { burst(w.boom, rnd, (rd.x + 0.5) * T, (rd.y + 0.5) * T, 24, N * 0.5, rd.c, 0.6); crashed = true; break; }
        rd.x = nx; rd.y = ny;
        w.occ[ny * G + nx] = 1;
        rd.trail.push([nx, ny]);
      }
      if (crashed) reset();
    }
    w.flash -= dt;
    if (w.flash > 0) r.fill(BRIGHT);
    for (let k = 0; k <= G; k += 4) { r.rect(k * T, 0, Math.max(1, u * 0.6), N, DARK); r.rect(0, k * T, N, Math.max(1, u * 0.6), DARK); }
    for (const rd of w.riders) {
      rd.trail.forEach(([x, y], i) => r.rect(x * T + T * 0.25, y * T + T * 0.25, T * 0.5, T * 0.5, i > rd.trail.length - 6 ? BRIGHT : rd.c));
      const X = (rd.x + 0.5) * T, Y = (rd.y + 0.5) * T;
      r.rect(X - T * 0.6 + rd.dx * T * 0.2, Y - T * 0.6 + rd.dy * T * 0.2, T * 1.2, T * 1.2, rd.c);
      r.rect(X - T * 0.3, Y - T * 0.3, T * 0.6, T * 0.6, BRIGHT);
      targets.push({ x: X - T, y: Y - T, w: 2 * T, h: 2 * T });
    }
    w.boom = particles(W, w.boom, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- moon ride
// A bicycle crossing a huge moon over the treetops, pedalling at the tempo, a bump on the kick.
const moonride = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { x: -0.2, ph: 0, wheel: 0, bump: 0, trees: Array.from({ length: 30 }, () => [rnd(), 0.2 + rnd() * 0.5]), stars: Array.from({ length: 40 }, () => [rnd(), rnd() * 0.5]) });
  },
  draw(W) {
    const { r, N, u, dt, f, w, hits, targets } = W, bps = f.bpm ? f.bpm / 60 : 2, mx = 0.55 * N, my = 0.45 * N, mr = 0.3 * N;
    for (const [sx, sy] of w.stars) r.set(sx * N, sy * N, LMID);
    r.disc(mx, my, mr, BRIGHT);
    for (const [cx, cy, cr] of [[-0.3, -0.2, 0.08], [0.2, 0.1, 0.12], [-0.1, 0.35, 0.06]]) r.disc(mx + cx * mr, my + cy * mr, cr * mr, LMID);
    for (const [tx, th] of w.trees) { const X = tx * N, top = N - th * N * 0.6; r.poly([[X - 0.05 * N, N], [X, top], [X + 0.05 * N, N]], DARK); }
    r.rect(0, 0.88 * N, N, N - 0.88 * N, DARK);
    const dx = (dt * 0.05 * bps) / 2, R = 4 * u;
    w.x += dx;
    if (w.x > 1.25) w.x = -0.25;
    w.ph += (dt * bps * TAU) / 2; // the pedals: a turn every two beats
    w.wheel += (dx * N) / R; // the wheels roll at the speed of travel
    let bump = 0;
    for (const hh of hits) if (isLow(hh)) bump = 1;
    w.bump = Math.max(w.bump * Math.exp(-dt * 6), bump);
    const bx = w.x * N, by = 0.5 * N - Math.sin(w.x * Math.PI) * 0.12 * N - w.bump * 3 * u;
    for (const k of [-6, 6]) { r.ring(bx + k * u, by, R, Math.max(1, u), DARK); r.line(bx + k * u - Math.cos(w.wheel) * R, by - Math.sin(w.wheel) * R, bx + k * u + Math.cos(w.wheel) * R, by + Math.sin(w.wheel) * R, DARK); }
    r.line(bx - 6 * u, by, bx, by - 5 * u, DARK);
    r.line(bx, by - 5 * u, bx + 6 * u, by, DARK);
    r.line(bx, by - 5 * u, bx + 3 * u, by - 7 * u, DARK);
    r.line(bx - 6 * u, by, bx - 2 * u, by - 7 * u, DARK);
    walker(r, bx - u, by - 4 * u, 0.14 * N, DARK, w.ph, 1, { cap: true });
    r.rect(bx - 4 * u, by - 0.12 * N, 5 * u, 4 * u, DARK);
    r.rect(bx - 3 * u, by - 0.12 * N - 2 * u, 3 * u, 2 * u, LMID);
    targets.push({ x: bx - 10 * u, y: by - 0.16 * N, w: 20 * u, h: 0.16 * N + R });
  },
};

// ---------------------------------------------------------------------------------------------- boulder
// A tunnel, a runner in a hat, and a boulder behind that gains on the bass; a kick jumps a gap, a snare bounces
// the boulder.
const boulder = {
  init(W) {
    Object.assign(W.w, { scroll: 0, ph: 0, y: 0, vy: 0, air: false, bounce: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.8 * N, bps = f.bpm ? f.bpm / 60 : 2, T = N / 10;
    w.scroll += (dt * T * 2.5 * bps) / 2;
    w.ph += dt * bps * Math.PI;
    for (const hh of hits) {
      if (isLow(hh) && !w.air) { w.vy = 1.2 * N; w.air = true; }
      else if (hh.kind === 'snare') w.bounce = 1;
    }
    w.vy -= 3 * N * dt;
    w.y += w.vy * dt;
    if (w.y <= 0) { w.y = 0; w.vy = 0; w.air = false; }
    w.bounce *= Math.exp(-dt * 5);
    s.shake = Math.max(s.shake, 0.15 + 0.3 * f.rel.bassDrive);
    r.rect(0, 0, N, 0.25 * N, DARK);
    for (let x = -((w.scroll * 0.5) % (0.3 * N)); x < N; x += 0.3 * N) { r.rect(x, 0.25 * N, 2 * u, 6 * u, MID); r.disc(x + u, 0.25 * N + 7 * u, 2 * u + (Math.floor(t * 10 + x) % 2) * u, HOT); }
    for (let x = -(w.scroll % T); x < N; x += T) {
      if (hash(Math.floor((x + w.scroll) / T), 9) < 0.12) continue;
      r.rect(x, g, T - u, N - g, MID);
      r.rect(x, g, T - u, Math.max(1, u), LMID);
    }
    for (let x = -((w.scroll * 0.7) % (0.2 * N)); x < N; x += 0.2 * N) r.rect(x, 0.3 * N + hash(Math.round((x / N) * 7), 2) * 0.3 * N, 3 * u, 3 * u, DARK + DIM);
    const rx = 0.55 * N;
    walker(r, rx, g - w.y, 0.2 * N, FIG, w.air ? 0.6 : w.ph, 1, { hat: true });
    const br = 0.17 * N, bx = (0.25 - 0.12 * f.rel.bassDrive) * N, by = g - br - w.bounce * 4 * u, rot = w.scroll / br;
    r.disc(bx, by, br, DARK);
    r.ring(bx, by, br, Math.max(1, u), MID);
    for (let k = 0; k < 5; k++) { const a = rot + k * 1.26; r.disc(bx + Math.cos(a) * br * 0.55, by + Math.sin(a) * br * 0.55, 2.5 * u, MID); }
    for (let k = 0; k < 4; k++) r.rect(bx - br - k * 4 * u, g - rnd() * 4 * u, 2 * u, Math.max(1, u), LMID);
    targets.push({ x: rx - 0.05 * N, y: g - w.y - 0.2 * N, w: 0.1 * N, h: 0.2 * N });
    targets.push({ x: bx - br, y: by - br, w: 2 * br, h: 2 * br });
  },
};

// ---------------------------------------------------------------------------------------------- snake
// The snake game: a cell per eighth note, it steers toward the food, a snare turns it, a note moves the food;
// biting itself cuts it back to three.
const snake = {
  init(W) {
    Object.assign(W.w, { G: 20, body: [[10, 10], [9, 10], [8, 10]], dx: 1, dy: 0, food: [15, 5], step: 0, eat: 0, dead: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, G = w.G, T = N / G;
    for (const hh of hits) {
      if (hh.kind === 'snare') { const left = rnd() < 0.5; [w.dx, w.dy] = left ? [w.dy, -w.dx] : [-w.dy, w.dx]; }
      else if (isTonal(hh)) w.food = [1 + Math.floor(rnd() * (G - 2)), 1 + Math.floor(rnd() * (G - 2))];
    }
    w.step += dt * (f.bpm ? f.bpm / 60 : 2) * 2;
    while (w.step >= 1) {
      w.step--;
      const [hx, hy] = w.body[0], fx = w.food[0] - hx, fy = w.food[1] - hy;
      if (rnd() < 0.5) {
        if (Math.abs(fx) > Math.abs(fy) && w.dx === 0) { w.dx = Math.sign(fx); w.dy = 0; }
        else if (Math.abs(fy) >= Math.abs(fx) && w.dy === 0 && fy) { w.dy = Math.sign(fy); w.dx = 0; }
      }
      const nx = (hx + w.dx + G) % G, ny = (hy + w.dy + G) % G;
      if (w.body.some(([x, y]) => x === nx && y === ny)) { w.dead = 0.3; w.body = w.body.slice(0, 3); }
      w.body.unshift([nx, ny]);
      if (nx === w.food[0] && ny === w.food[1]) { w.eat = 0.3; w.food = [Math.floor(rnd() * G), Math.floor(rnd() * G)]; } else w.body.pop();
    }
    w.eat -= dt;
    w.dead -= dt;
    r.frame(0, 0, N, N, DARK);
    for (let k = 0; k < G; k += 5) { r.rect(k * T, 0, 1, N, DARK + DIM); r.rect(0, k * T, N, 1, DARK + DIM); }
    r.rect(w.food[0] * T + u, w.food[1] * T + u, T - 2 * u, T - 2 * u, f.beat.pulse > 0.5 ? BRIGHT : HOT);
    w.body.forEach(([x, y], i) => r.rect(x * T + u * 0.5, y * T + u * 0.5, T - u, T - u, w.dead > 0 ? HOT : i === 0 ? BRIGHT : i % 2 ? FIG : LMID));
    targets.push({ x: w.body[0][0] * T, y: w.body[0][1] * T, w: T, h: T });
    for (let k = 0; k < Math.min(30, w.body.length - 3); k++) r.rect(3 * u + k * 2 * u, N - 4 * u, Math.max(1, u), 2 * u, COOL);
  },
};

// ---------------------------------------------------------------------------------------------- crossing
// Six lanes of traffic at the tempo and a hopper that jumps a lane on every kick, sidesteps on the snare, gets
// flattened now and then and starts over; a mark for every crossing made.
const crossing = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { lanes: Array.from({ length: 6 }, (_, i) => ({ y: 0.72 - i * 0.1, dir: i % 2 ? -1 : 1, v: 0.12 + rnd() * 0.15, cars: Array.from({ length: 3 }, (_, k) => k / 3 + rnd() * 0.1),
      c: [HOT, COOL, LMID][i % 3], w: 0.08 + rnd() * 0.06 })), hop: { lane: -1, x: 0.5, t: 1, from: -1 }, squash: 0, home: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s } = W, Hp = w.hop, laneY = (i) => (i < 0 ? 0.84 : i >= 6 ? 0.1 : w.lanes[i].y) * N;
    for (const hh of hits) {
      if (isLow(hh) && Hp.t >= 1 && w.squash <= 0) { Hp.from = Hp.lane; Hp.lane = Math.min(6, Hp.lane + 1); Hp.t = 0; }
      else if (hh.kind === 'snare' && Hp.t >= 1) Hp.x = clamp(Hp.x + (rnd() < 0.5 ? -0.08 : 0.08), 0.1, 0.9);
    }
    Hp.t = Math.min(1, Hp.t + dt * 5);
    if (Hp.lane >= 6 && Hp.t >= 1) { w.home++; Hp.lane = -1; Hp.from = -1; }
    r.rect(0, 0, N, 0.16 * N, MID);
    r.rect(0, 0.78 * N, N, N - 0.78 * N, MID);
    for (let x = 2 * u; x < N; x += 7 * u) { r.rect(x, 0.08 * N, 3 * u, 3 * u, DARK); r.rect(x + 3 * u, 0.82 * N, 3 * u, 3 * u, DARK); }
    r.rect(0, 0.16 * N, N, 0.62 * N, DARK);
    for (let i = 1; i < 6; i++) for (let x = 0; x < N; x += 6 * u) r.rect(x, (w.lanes[i].y + 0.05) * N, 3 * u, Math.max(1, u), LMID);
    let hit = false;
    w.lanes.forEach((ln, li) => {
      for (let k = 0; k < ln.cars.length; k++) {
        ln.cars[k] = ((ln.cars[k] + ln.dir * dt * ln.v * (0.7 + 0.6 * f.rel.midAtt) + 1.2) % 1.2) - 0.1;
        const cx = ln.cars[k] * N, cy = ln.y * N, cw = ln.w * N;
        r.rect(cx - cw / 2, cy - 3.5 * u, cw, 6 * u, ln.c);
        r.rect(cx - cw * 0.25, cy - 5 * u, cw * 0.5, 2 * u, ln.c);
        r.rect(cx + (ln.dir > 0 ? cw / 2 - 2 * u : -cw / 2), cy - 2 * u, 2 * u, 1.5 * u, BRIGHT);
        if (Hp.lane === li && Hp.t >= 1 && Math.abs(cx - Hp.x * N) < cw / 2 + 2 * u) hit = true;
      }
    });
    if (hit && w.squash <= 0) { w.squash = 0.6; s.shake = Math.max(s.shake, 0.4); }
    if (w.squash > 0 && (w.squash -= dt) <= 0) { Hp.lane = -1; Hp.from = -1; Hp.t = 1; }
    const py = lerp(laneY(Hp.from), laneY(Hp.lane), ease(Hp.t)) - Math.sin(Hp.t * Math.PI) * 4 * u, px = Hp.x * N, sq = w.squash > 0;
    r.rect(px - 3 * u, py - (sq ? 1 : 3) * u, 6 * u, (sq ? 2 : 5) * u, sq ? HOT : COOL);
    if (!sq) {
      r.rect(px - 2 * u, py - 4 * u, Math.max(1, u), Math.max(1, u), BRIGHT);
      r.rect(px + u, py - 4 * u, Math.max(1, u), Math.max(1, u), BRIGHT);
      for (const k of [-4, 4]) r.rect(px + k * u - u, py + (Hp.t < 1 ? -2 : 1) * u, 2 * u, Math.max(1, u), COOL);
    }
    targets.push({ x: px - 4 * u, y: py - 5 * u, w: 8 * u, h: 8 * u });
    for (let k = 0; k < w.home % 8; k++) r.rect(3 * u + k * 5 * u, 2 * u, 3 * u, 3 * u, BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- rhythm
// Four lanes in perspective with notes laid down two beats ahead so they reach the line exactly on the beat;
// the receptors light with the hits that come in (kick, snare, hat, note), a combo bar climbs at the side.
const rhythm = {
  init(W) {
    Object.assign(W.w, { notes: [], last: -1, glow: new Float32Array(4), combo: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, lw = 0.14 * N, x0 = N / 2 - 2 * lw, hitY = 0.82 * N, travel = 2, LC = [COOL, HOT, BRIGHT, LMID];
    const pos = beatLocked(f) ? f.beat.count + f.beat.phase : t * (f.bpm ? f.bpm / 60 : 2), b = Math.floor(pos);
    if (b !== w.last) {
      w.last = b;
      for (let k = 0, n = 1 + (rnd() < 0.3 ? 1 : 0); k < n; k++) w.notes.push({ lane: Math.floor(rnd() * 4), at: b + travel, hold: rnd() < 0.2 });
      if (rnd() < 0.5) w.notes.push({ lane: Math.floor(rnd() * 4), at: b + travel + 0.5, hold: false });
    }
    for (const hh of hits) w.glow[isLow(hh) ? 0 : hh.kind === 'snare' ? 1 : hh.kind === 'hat' ? 2 : 3] = 1;
    for (let k = 0; k < 4; k++) w.glow[k] *= Math.exp(-dt * 8);
    for (let k = 0; k <= 4; k++) r.line(x0 + k * lw, hitY + 0.08 * N, N / 2 + (k - 2) * lw * 0.35, 0, DARK);
    for (let k = 0; k < 4; k++) {
      const rx = x0 + k * lw;
      r.rect(rx + u, hitY - 2 * u, lw - 2 * u, 4 * u, w.glow[k] > 0.3 ? LC[k] : DARK);
      if (w.glow[k] > 0.3) r.ring(rx + lw / 2, hitY, lw * 0.5 * (1 + (1 - w.glow[k]) * 0.6), Math.max(1, u), LC[k]);
    }
    r.rect(x0 - 2 * u, hitY, 4 * lw + 4 * u, Math.max(1, u), LMID);
    w.notes = w.notes.filter((nt) => {
      const k = (nt.at - pos) / travel;
      if (k < -0.1) return false;
      if (k > 1) return true;
      const y = lerp(hitY, 0, k), sc = 0.35 + 0.65 * (1 - k), cx = N / 2 + (nt.lane - 1.5) * lw * sc, ww = lw * sc * 0.8;
      if (nt.hold) r.rect(cx - ww * 0.3, Math.max(0, y - 0.15 * N * sc), ww * 0.6, 0.15 * N * sc, LC[nt.lane] + DIM);
      r.rect(cx - ww / 2, y - 2 * u * sc, ww, Math.max(1, 4 * u * sc), Math.abs(nt.at - pos) < 0.08 ? BRIGHT : LC[nt.lane]);
      if (Math.abs(nt.at - pos) < 0.05 && !nt.done) { nt.done = true; w.combo++; }
      return true;
    });
    for (let k = 0; k < Math.min(24, w.combo % 25); k++) r.rect(3 * u, N - 4 * u - k * 2.5 * u, 3 * u, 1.5 * u, COOL);
    targets.push({ x: x0, y: hitY - 3 * u, w: 4 * lw, h: 6 * u });
  },
};

// ---------------------------------------------------------------------------------------------- ritual
// A circle on the floor with a five-pointed star in it, candles at the points flaring on the kicks, robed
// figures swaying round it on the beat, a glow in the circle that the notes feed; on a drop something with horns
// comes up out of it for a while.
const ritual = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { candles: Array.from({ length: 5 }, (_, i) => ({ a: (i / 5) * TAU - Math.PI / 2, fl: 1 })), robes: Array.from({ length: 6 }, (_, i) => ({ a: (i / 6) * TAU + 0.3 + rnd() * 0.2 })),
      glow: 0, summon: 0, rot: 0, flare: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, cx = N / 2, cy = 0.6 * N, R = 0.28 * N;
    for (const hh of hits) {
      if (isLow(hh)) { w.flare = 1; for (const c of w.candles) c.fl = 1 + rnd(); }
      else if (hh.kind === 'snare') w.rot += 0.1;
      else if (isTonal(hh)) w.glow = Math.min(1, w.glow + 0.25);
    }
    if (f.section === 'drop') w.summon = 1;
    w.flare *= Math.exp(-dt * 5);
    w.glow *= Math.exp(-dt / 2);
    w.summon = Math.max(0, w.summon - dt / 8);
    w.rot += dt * 0.05;
    r.rect(0, cy - 0.05 * N, N, N - cy + 0.05 * N, DARK);
    const inside = w.glow + w.summon;
    if (inside > 0.15)
      for (let y = Math.round(cy - R * 0.5); y < cy + R * 0.5; y++)
        for (let x = Math.round(cx - R); x < cx + R; x++) {
          const dx = (x + 0.5 - cx) / R, dy = (y + 0.5 - cy) / (R * 0.5), d = dx * dx + dy * dy;
          if (d < 1 && hash(x, y + Math.floor(t * 6)) < inside * (1 - d)) r.set(x, y, HOT + DIM);
        }
    r.ring(cx, cy, R, Math.max(1, 1.5 * u), HOT, 0.5);
    r.ring(cx, cy, R * 0.86, Math.max(1, u), HOT, 0.5);
    const pts = Array.from({ length: 5 }, (_, i) => { const a = w.rot + (i / 5) * TAU - Math.PI / 2; return [cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.43]; });
    for (let i = 0; i < 5; i++) r.stroke(...pts[i], ...pts[(i + 2) % 5], Math.max(1, u), HOT);
    for (const c of w.candles) {
      const x = cx + Math.cos(c.a) * R * 1.05, y = cy + Math.sin(c.a) * R * 0.52;
      c.fl = follow(c.fl, 1, dt, 0.3);
      r.rect(x - u, y - 5 * u, 2 * u, 5 * u, BRIGHT);
      r.disc(x, y - 6 * u - (Math.floor(t * 14 + c.a * 3) % 2) * u * 0.5, (1.5 + c.fl) * u * (0.8 + 0.4 * f.rel.bassDrive), HOT);
      r.disc(x, y - 6 * u, 0.8 * u, BRIGHT);
    }
    for (const rb of w.robes) {
      const x = cx + Math.cos(rb.a) * R * 1.35, y = cy + Math.sin(rb.a) * R * 0.75, h = 0.22 * N * (0.8 + (0.3 * (Math.sin(rb.a) + 1)) / 2), sway = Math.sin(f.beat.phase * TAU + rb.a) * 2 * u;
      r.poly([[x - h * 0.18 + sway, y], [x + h * 0.18 + sway, y], [x + h * 0.08, y - h * 0.8], [x - h * 0.08, y - h * 0.8]], FIG);
      r.poly([[x - h * 0.12, y - h * 0.75], [x + h * 0.12, y - h * 0.75], [x, y - h * 1.05]], FIG);
      r.rect(x - h * 0.06, y - h * 0.86, h * 0.12, h * 0.06, BLACK);
      if (f.beat.pulse > 0.5) for (const k of [-1, 1]) r.line(x + k * h * 0.18, y - h * 0.5, x + k * h * 0.3, y - h * 0.9, FIG);
      targets.push({ x: x - h * 0.2, y: y - h * 1.05, w: h * 0.4, h: h * 1.05 });
    }
    if (w.summon > 0) {
      const k = Math.sin(w.summon * Math.PI), hh = R * 0.9 * k;
      r.poly([[cx - R * 0.35, cy], [cx + R * 0.35, cy], [cx + R * 0.15, cy - hh], [cx - R * 0.15, cy - hh]], BLACK);
      for (const sgn of [-1, 1]) r.stroke(cx + sgn * R * 0.15, cy - hh * 0.95, cx + sgn * R * 0.35, cy - hh * 1.25, 2 * u, BLACK);
      for (const sgn of [-1, 1]) r.rect(cx + sgn * R * 0.07 - u, cy - hh * 0.8, 2 * u, 2 * u, f.beat.pulse > 0.3 ? HOT : BRIGHT);
      for (let i = 0; i < 6; i++) r.disc(cx + (rnd() - 0.5) * R, cy - rnd() * hh, 2 * u + rnd() * 2 * u, DARK + DIM);
      s.shake = Math.max(s.shake, 0.3 * k);
    }
    r.ring(cx, 0.12 * N, 0.05 * N, Math.max(1, u), LMID);
    r.ring(cx, 0.12 * N, 0.025 * N, Math.max(1, u), LMID);
    if (w.flare > 0.3) r.rect(0, 0, N, Math.max(1, u), HOT);
  },
};

// ---------------------------------------------------------------------------------------------- tarot
// Three cards on a cloth that turn over on every other beat: a sun, a moon, a star, a tower that lightning hits
// on the heavy kicks, a wheel that turns with the beat, an eye. A candle at the side flares on the hats.
const TAROT = ['sun', 'moon', 'star', 'tower', 'wheel', 'eye'];

const tarot = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { cards: [0, 1, 2].map((i) => ({ x: 0.2 + i * 0.3, face: Math.floor(rnd() * 6), flip: 1, up: i === 1 })), bolt: 0, candle: 0, next: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, cw = 0.2 * N, ch = 0.34 * N, cy = 0.5 * N;
    if (f.beat.on && f.beat.count % 2 === 0) { const c = w.cards[w.next++ % 3]; c.flip = 0; c.up = !c.up; if (c.up) c.face = Math.floor(rnd() * 6); }
    for (const hh of hits) {
      if (isLow(hh) && hh.strength > 0.7) w.bolt = 0.15;
      else if (hh.kind === 'hat') w.candle = 1;
    }
    w.bolt -= dt;
    w.candle *= Math.exp(-dt * 6);
    r.rect(0.04 * N, 0.08 * N, 0.92 * N, 0.84 * N, DARK);
    r.frame(Math.round(0.07 * N), Math.round(0.11 * N), Math.round(0.86 * N), Math.round(0.78 * N), MID);
    r.rect(0.9 * N, 0.15 * N, 2 * u, 8 * u, BRIGHT);
    r.disc(0.9 * N + u, 0.15 * N - 2 * u, (1.5 + w.candle) * u, HOT);
    for (const c of w.cards) {
      c.flip = Math.min(1, c.flip + dt * 3);
      const x = c.x * N, w2 = (cw / 2) * Math.max(0.04, Math.abs(1 - 2 * c.flip)), faceUp = c.flip < 0.5 ? !c.up : c.up;
      r.rect(x - w2, cy - ch / 2, 2 * w2, ch, faceUp ? BRIGHT : MID);
      r.frame(Math.round(x - w2), Math.round(cy - ch / 2), Math.round(2 * w2), Math.round(ch), faceUp ? LMID : DARK);
      if (!faceUp) {
        for (let yy = cy - ch / 2 + 3 * u; yy < cy + ch / 2 - 3 * u; yy += 4 * u) for (let xx = x - w2 + 3 * u; xx < x + w2 - 3 * u; xx += 4 * u) r.rect(xx, yy, 2 * u, 2 * u, DARK);
      } else if (w2 > cw * 0.3) {
        const sym = TAROT[c.face], sx = x, sy = cy - ch * 0.08, R = cw * 0.22;
        if (sym === 'sun') { r.disc(sx, sy, R * 0.6, HOT); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + t * 0.3; r.line(sx + Math.cos(a) * R * 0.8, sy + Math.sin(a) * R * 0.8, sx + Math.cos(a) * R * 1.2, sy + Math.sin(a) * R * 1.2, HOT); } }
        else if (sym === 'moon') { r.disc(sx, sy, R * 0.7, COOL); r.disc(sx + R * 0.3, sy - R * 0.15, R * 0.6, BRIGHT); }
        else if (sym === 'star') for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2, b = ((i + 2) / 5) * TAU - Math.PI / 2; r.line(sx + Math.cos(a) * R, sy + Math.sin(a) * R, sx + Math.cos(b) * R, sy + Math.sin(b) * R, COOL); }
        else if (sym === 'tower') { r.rect(sx - R * 0.3, sy - R * 0.4, R * 0.6, R * 1.4, DARK); r.rect(sx - R * 0.4, sy - R * 0.5, R * 0.8, R * 0.15, DARK); if (w.bolt > 0) { r.stroke(sx + R * 0.9, sy - R * 1.3, sx + R * 0.1, sy - R * 0.4, Math.max(1, u), HOT); r.rect(sx - R * 0.4, sy - R * 0.6, R * 0.8, R * 0.2, HOT); } }
        else if (sym === 'wheel') { r.ring(sx, sy, R * 0.8, Math.max(1, u), DARK); for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI + f.beat.phase * Math.PI; r.line(sx - Math.cos(a) * R * 0.8, sy - Math.sin(a) * R * 0.8, sx + Math.cos(a) * R * 0.8, sy + Math.sin(a) * R * 0.8, DARK); } }
        else { r.ring(sx, sy, R * 0.4, R * 0.8, DARK, 0.5); r.disc(sx, sy, R * 0.3, BRIGHT); r.disc(sx, sy, R * 0.15, BLACK); }
        for (let i = 0; i < 3; i++) r.rect(x - cw * 0.15 + i * cw * 0.15, cy + ch * 0.36, cw * 0.08, Math.max(1, u), DARK);
      }
      targets.push({ x: x - cw / 2, y: cy - ch / 2, w: cw, h: ch });
    }
    for (const k of [-1, 1]) r.ring(N / 2 + k * 0.22 * N, N, 0.05 * N, 0.04 * N, FIG, 0.6);
  },
};

// ---------------------------------------------------------------------------------------------- spiral
// A hypnotist's spiral turning at the tempo with an eye in the middle: a kick tightens the turns and widens
// the eye, a snare blinks it.
const spiral = {
  init(W) {
    Object.assign(W.w, { rot: 0, pulse: 0, blink: 0, arms: 2 + Math.floor(W.rnd() * 2) });
  },
  draw(W) {
    const { r, N, u, dt, f, w, hits, targets } = W, cx = N / 2, cy = N / 2;
    for (const hh of hits) {
      if (isLow(hh)) w.pulse = 1;
      else if (hh.kind === 'snare') w.blink = 0.12;
    }
    w.pulse *= Math.exp(-dt * 4);
    w.blink -= dt;
    w.rot += dt * (0.8 + 2.5 * f.rel.midDrive) * (W.a > 0.5 ? 1 : 0.5);
    const buf = r.buf, k = w.arms, tw = (0.036 + 0.012 * w.pulse) / u;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), v = (Math.atan2(dy, dx) * k) / TAU + d * tw - w.rot;
        buf[y * N + x] = ((v % 1) + 1) % 1 < 0.5 ? (d < N * 0.1 ? DARK : FIG) : BG;
      }
    const ew = 0.12 * N, eh = w.blink > 0 ? 0.01 * N : 0.05 * N * (1 + 0.3 * w.pulse), look = Math.sin(f.beat.phase * TAU) * 2 * u;
    r.ring(cx, cy, ew * 0.5, ew, BRIGHT, Math.max(0.05, eh / ew));
    if (w.blink <= 0) { r.disc(cx + look, cy, eh * 0.8, HOT); r.disc(cx + look, cy, eh * 0.4, BLACK); }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; r.line(cx + Math.cos(a) * ew * 1.2, cy + Math.sin(a) * ew * 0.7, cx + Math.cos(a) * ew * (1.5 + 0.3 * w.pulse), cy + Math.sin(a) * ew * (0.9 + 0.2 * w.pulse), BRIGHT); }
    targets.push({ x: cx - ew, y: cy - ew * 0.5, w: 2 * ew, h: ew });
  },
};

// ---------------------------------------------------------------------------------------------- testcard
// Colour bars, each dropping to its band's level, a grey staircase, the circle and cross of a test card, a tone
// bar that lights on the kick, a clock of blocks on the beat, and static on the snare; a drop is a long burst.
const testcard = {
  init(W) {
    Object.assign(W.w, { noise: 0, beep: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, cols = [BRIGHT, LMID, COOL, MID, HOT, DARK, FIG], n = cols.length, bw = N / n;
    for (const hh of hits) {
      if (hh.kind === 'snare') w.noise = 3;
      else if (isLow(hh)) w.beep = 0.2;
    }
    if (f.section === 'drop') w.noise = 10;
    w.beep -= dt;
    for (let i = 0; i < n; i++) {
      const lvl = clamp((f.band10[Math.floor((i / n) * 10)] || 0) * 1.3);
      r.rect(i * bw, 0, bw, 0.62 * N, cols[i]);
      r.rect(i * bw, 0.62 * N * (1 - lvl), bw, 0.62 * N * lvl, cols[i] + DIM);
    }
    for (let i = 0; i < n; i++) r.rect(i * bw, 0.62 * N, bw, 0.1 * N, [DARK, MID, LMID, BRIGHT, LMID, MID, DARK][i]);
    r.rect(0, 0.72 * N, N, 0.28 * N, DARK);
    for (let i = 0; i < 8; i++) r.rect(i * (N / 8), 0.72 * N, N / 8, 0.12 * N, i % 2 ? DARK : DARK + DIM);
    r.ring(N / 2, 0.42 * N, 0.3 * N, Math.max(1, u), BLACK);
    r.rect(N / 2 - u / 2, 0.1 * N, Math.max(1, u), 0.64 * N, BLACK);
    r.rect(0.2 * N, 0.42 * N, 0.6 * N, Math.max(1, u), BLACK);
    r.rect(0.3 * N, 0.88 * N, 0.4 * N, 4 * u, w.beep > 0 ? BRIGHT : MID);
    for (let k = 0; k < 16; k++) r.rect(0.3 * N + k * 0.025 * N, 0.94 * N, 2 * u, 2 * u, k === f.beat.count % 16 ? HOT : LMID);
    if (w.noise > 0) { w.noise--; for (let i = 0; i < r.buf.length; i++) if (rnd() < 0.5) r.buf[i] = rnd() < 0.5 ? BRIGHT : DARK; }
    targets.push({ x: 0.2 * N, y: 0.12 * N, w: 0.6 * N, h: 0.6 * N });
  },
};

// ---------------------------------------------------------------------------------------------- waterfall
// A numbers station: a tuning dial whose needle goes to the last note, a spectrogram waterfall of the ten bands
// scrolling down, a signal lamp on the hats, a grille that lights up to the level.
const waterfall = {
  init(W) {
    Object.assign(W.w, { rows: null, head: 0, needle: 0.3, blip: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, hits, targets } = W, top = Math.round(0.22 * N), H = Math.floor(0.6 * N), wx0 = Math.round(0.08 * N), ww = Math.round(0.84 * N);
    if (!w.rows || w.rows.length !== N * H) { w.rows = new Uint8Array(N * H); w.head = 0; }
    for (const hh of hits) {
      if (hh.kind === 'hat') w.blip = 0.1;
      else if (isTonal(hh)) w.needle = 0.1 + (hh.pc / 11) * 0.8;
    }
    w.blip -= dt;
    for (let x = 0; x < N; x++) {
      const b = clamp((x - wx0) / ww) * 9.99, i = Math.floor(b), v = lerp(f.band10[i] || 0, f.band10[Math.min(9, i + 1)] || 0, b - i);
      w.rows[w.head * N + x] = v < 0.15 ? 0 : v < 0.35 ? 1 : v < 0.55 ? 2 : v < 0.75 ? 3 : 4;
    }
    w.head = (w.head + 1) % H;
    const ramp = [BG, DARK, MID, LMID, BRIGHT];
    for (let k = 0; k < H; k++) { const src = (((w.head - 1 - k) % H) + H) % H, y = top + k; for (let x = wx0; x < wx0 + ww; x++) r.set(x, y, ramp[w.rows[src * N + x]]); }
    r.rect(0, 0, N, top, DARK);
    r.rect(wx0, top * 0.45, ww, Math.max(1, u), LMID);
    for (let k = 0; k <= 10; k++) r.rect(wx0 + (k * ww) / 10, top * 0.45 - (k % 5 ? 2 : 4) * u, Math.max(1, u), (k % 5 ? 4 : 8) * u, LMID);
    const nx = wx0 + w.needle * ww;
    r.rect(nx - u / 2, top * 0.2, Math.max(1, u), top * 0.6, HOT);
    r.disc(0.93 * N, top * 0.5, 3 * u, w.blip > 0 ? HOT : DARK + DIM);
    r.ring(0.93 * N, top * 0.5, 3.5 * u, Math.max(1, u), LMID);
    r.rect(0, top + H, N, N - top - H, DARK);
    for (let x = 2 * u, k = 0; x < N; x += 4 * u, k++) r.rect(x, top + H + 3 * u, 2 * u, N - top - H - 6 * u, k < f.level * (N / (4 * u)) ? LMID : DARK + DIM);
    targets.push({ x: nx - 3 * u, y: top * 0.2, w: 6 * u, h: top * 0.6 });
  },
};

// ---------------------------------------------------------------------------------------------- antennas
// A field of antennas under an aurora: twelve curtains, one per pitch class, as bright as that note is in the
// music; the kicks hum beams up from the masts.
const antennas = {
  init(W) {
    Object.assign(W.w, { rays: new Float32Array(12), hum: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, hits, targets } = W, g = 0.8 * N;
    for (const hh of hits) {
      if (isTonal(hh)) w.rays[hh.pc] = 1;
      else if (isLow(hh)) w.hum = 1;
    }
    for (let k = 0; k < 12; k++) w.rays[k] = Math.max(w.rays[k] * Math.exp(-dt / 1.5), (f.chroma[k] || 0) * 1.5 * f.tonalAvg);
    w.hum *= Math.exp(-dt * 3);
    for (let k = 0; k < 12; k++) {
      const amp = clamp(w.rays[k]);
      if (amp < 0.05) continue;
      const x0 = (k / 12) * N, cw = N / 12;
      for (let x = Math.round(x0); x < x0 + cw; x += 2) {
        const ht = (0.15 + 0.4 * amp) * N * (0.7 + 0.3 * Math.sin(t * 2 + x * 0.2)), top = 0.08 * N + Math.sin(t * 0.7 + x * 0.05) * 0.04 * N;
        for (let y = Math.round(top); y < top + ht; y++) { const q = (y - top) / ht; r.set(x, y, q < 0.3 ? COOL : q < 0.7 ? LMID : MID); }
      }
    }
    for (let k = 0; k < 30; k++) r.set(hash(k, 5) * N, hash(k, 6) * 0.6 * N, BRIGHT);
    r.rect(0, g, N, N - g, DARK);
    r.rect(0, g, N, Math.max(1, u), MID);
    for (let row = 2; row >= 0; row--) {
      const y = g - row * 0.04 * N, h = (0.22 - row * 0.05) * N, col = row ? MID : FIG, n = 9 + row * 2;
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5) / n) * N;
        r.rect(x - u / 2, y - h, Math.max(1, u), h, col);
        r.rect(x - 3 * u, y - h, 6 * u, Math.max(1, u), col);
        r.rect(x - 2 * u, y - h * 0.5, 4 * u, Math.max(1, u), col);
        if (w.hum > 0.3 && !row) for (let yy = Math.round(y - h); yy > 0; yy -= 3) r.set(x + Math.sin(yy * 0.3 + t * 20) * u, yy, COOL);
      }
      if (!row) r.rect(0, y - h * 0.5, N, Math.max(1, u * 0.6), MID);
    }
    r.rect(0.78 * N, g - 0.1 * N, 0.14 * N, 0.1 * N, MID);
    r.ring(0.85 * N, g - 0.14 * N, 0.03 * N, 0.025 * N, LMID, 0.5);
    walker(r, 0.75 * N, g, 0.1 * N, FIG, 0, -1, { hat: true });
    targets.push({ x: 0.72 * N, y: g - 0.14 * N, w: 0.22 * N, h: 0.14 * N });
  },
};

// ---------------------------------------------------------------------------------------------- pyramid
// A pyramid in courses of stone, its capstone floating with an eye in it that opens with the notes and blinks on
// the snare; a kick sends rays out behind it; small figures below look up.
const pyramid = {
  init(W) {
    Object.assign(W.w, { open: 0.5, rays: 0, blink: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, hits, targets } = W, cx = N / 2, base = 0.85 * N, top = 0.2 * N, hw = 0.36 * N;
    for (const hh of hits) {
      if (isLow(hh)) w.rays = 1;
      else if (hh.kind === 'snare') w.blink = 0.15;
      else if (isTonal(hh)) w.open = Math.min(1, w.open + 0.3);
    }
    w.rays *= Math.exp(-dt * 3);
    w.blink -= dt;
    w.open = follow(w.open, 0.35 + 0.4 * f.rel.midDrive, dt, 1.5);
    if (w.rays > 0.05) for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU + t * 0.1; if (hash(i, Math.floor(t * 8)) > w.rays) continue; r.line(cx, top + 0.12 * N, cx + Math.cos(a) * N, top + 0.12 * N + Math.sin(a) * N, i % 2 ? HOT : BRIGHT); }
    const cut = top + 0.16 * N, lift = 2 * u * Math.sin(t * 1.3) + f.beat.pulse * 2 * u, wAt = (y) => hw * ((base - y) / (base - top));
    r.poly([[cx - hw, base], [cx + hw, base], [cx + wAt(cut), cut], [cx - wAt(cut), cut]], MID);
    for (let y = cut + 4 * u, k = 0; y < base; y += 4 * u, k++) {
      r.rect(cx - wAt(y), y, 2 * wAt(y), Math.max(1, u * 0.7), DARK);
      for (let x = cx - wAt(y) + (k % 2) * 4 * u; x < cx + wAt(y); x += 8 * u) r.rect(x, y - 4 * u, Math.max(1, u * 0.7), 4 * u, DARK);
    }
    r.poly([[cx - hw * 0.18, cut - 2 * u - lift], [cx + hw * 0.18, cut - 2 * u - lift], [cx, top - lift]], LMID);
    const ey = cut - 7 * u - lift, ew = hw * 0.1, eh = (w.blink > 0 ? 0.1 : w.open) * hw * 0.06;
    r.ring(cx, ey, ew * 0.5, ew, BRIGHT, Math.max(0.05, eh / ew));
    if (w.blink <= 0 && eh > u) { r.disc(cx, ey, Math.min(eh, ew * 0.35), DARK); r.disc(cx, ey, Math.min(eh * 0.5, ew * 0.18), BLACK); }
    r.rect(0, base, N, N - base, DARK);
    for (let i = 0; i < 5; i++) walker(r, (0.1 + i * 0.2) * N + Math.sin(i * 3) * 4 * u, base + 2 * u, 0.07 * N, FIG, 0, i < 3 ? 1 : -1, { hat: i % 2 === 0 });
    targets.push({ x: cx - ew, y: ey - ew * 0.5, w: 2 * ew, h: ew });
  },
};

// ---------------------------------------------------------------------------------------------- strings
// A cork board of photos, maps and clippings (block patterns, no words) with pins and red string: a kick ties
// another string, a snare circles something, a note lights the clipping of its pitch; a new section clears it.
const strings = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { pins: Array.from({ length: 9 }, (_, i) => ({ x: 0.14 + (i % 3) * 0.36 + (rnd() - 0.5) * 0.1, y: 0.16 + Math.floor(i / 3) * 0.32 + (rnd() - 0.5) * 0.1, kind: i % 3,
      w: 0.1 + rnd() * 0.06, h: 0.08 + rnd() * 0.06, hot: 0 })), links: [] });
    for (let k = 0; k < 6; k++) w.links.push([Math.floor(rnd() * 9), Math.floor(rnd() * 9)]);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W;
    for (const hh of hits) {
      if (isLow(hh)) { w.links.push([Math.floor(rnd() * 9), Math.floor(rnd() * 9)]); if (w.links.length > 14) w.links.shift(); }
      else if (hh.kind === 'snare') pick(rnd, w.pins).hot = 1;
      else if (isTonal(hh)) w.pins[hh.pc % 9].hot = 0.6;
    }
    if (f.section) w.links = w.links.slice(-4);
    r.fill(MID);
    for (let i = 0; i < 80; i++) r.rect(hash(i, 1) * N, hash(i, 2) * N, Math.max(1, u), Math.max(1, u), DARK + DIM);
    for (const p of w.pins) {
      p.hot *= Math.exp(-dt * 2);
      const x = p.x * N, y = p.y * N, pw = p.w * N, ph = p.h * N, tilt = Math.sin(p.x * 20) * 2 * u;
      r.rect(x - pw / 2 + tilt, y - ph / 2, pw, ph, p.hot > 0.3 ? BRIGHT : LMID);
      if (p.kind === 0) { r.rect(x - pw * 0.3, y - ph * 0.3, pw * 0.6, ph * 0.6, DARK); r.disc(x, y - ph * 0.08, ph * 0.16, LMID); r.rect(x - ph * 0.2, y + ph * 0.1, ph * 0.4, ph * 0.2, LMID); }
      else if (p.kind === 1) for (let k = 0; k < 4; k++) r.rect(x - pw * 0.35, y - ph * 0.3 + k * ph * 0.18, pw * (0.4 + hash(k, Math.round(p.x * 100)) * 0.3), Math.max(1, u * 0.7), DARK);
      else { r.ring(x, y, ph * 0.25, Math.max(1, u), DARK); r.line(x - pw * 0.3, y + ph * 0.2, x + pw * 0.3, y - ph * 0.25, DARK); }
      r.disc(x, y - ph / 2, 1.5 * u, HOT);
      targets.push({ x: x - pw / 2, y: y - ph / 2, w: pw, h: ph });
    }
    for (const [a, b] of w.links) {
      if (a === b) continue;
      const A = w.pins[a], B = w.pins[b], sag = 3 * u + Math.sin(t * 3 + a) * u, mx = ((A.x + B.x) / 2) * N, my = ((A.y + B.y) / 2) * N - ((A.h + B.h) * N) / 2 + sag;
      r.line(A.x * N, A.y * N - (A.h * N) / 2, mx, my, HOT);
      r.line(mx, my, B.x * N, B.y * N - (B.h * N) / 2, HOT);
    }
    for (const p of w.pins) if (p.hot > 0.3) r.ring(p.x * N, p.y * N, Math.max(p.w, p.h) * N * 0.7, Math.max(1, u), HOT);
  },
};

// ---------------------------------------------------------------------------------------------- chemtrails
// A clear sky where every kick sends a plane across; its trail stays and spreads for half a minute. Someone on
// the ground points up.
const chemtrails = {
  init(W) {
    Object.assign(W.w, { planes: [], trails: [], fig: 0.3 + W.rnd() * 0.4 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, g = 0.86 * N;
    for (const hh of hits) if (isLow(hh) && w.planes.length < 4) { const d = rnd() < 0.5 ? 1 : -1, y = 0.1 + rnd() * 0.45; w.planes.push({ x: d > 0 ? -0.1 : 1.1, y, d, slope: (rnd() - 0.5) * 0.3, lx: d > 0 ? -0.1 : 1.1, ly: y }); }
    r.disc(0.8 * N, 0.15 * N, 0.07 * N, BRIGHT);
    w.trails = w.trails.filter((tr) => (tr.age += dt) < 25);
    for (const tr of w.trails) r.stroke(tr.x0 * N, tr.y0 * N, tr.x1 * N, tr.y1 * N, Math.max(1, Math.round(u * (1 + tr.age * 0.25))), tr.age < 8 ? BRIGHT : tr.age < 16 ? LMID : MID);
    w.planes = w.planes.filter((p) => {
      const sp = dt * (0.12 + 0.1 * f.rel.midAtt);
      p.x += p.d * sp;
      p.y += p.slope * sp;
      if (Math.hypot((p.x - p.lx) * N, (p.y - p.ly) * N) > 3 * u) { w.trails.push({ x0: p.lx, y0: p.ly, x1: p.x, y1: p.y, age: 0 }); p.lx = p.x; p.ly = p.y; }
      const px = p.x * N, py = p.y * N;
      r.rect(px - 4 * u, py - u, 8 * u, 2 * u, DARK);
      r.rect(px - u + p.d * 2 * u, py - 3 * u, 2 * u, 3 * u, DARK);
      r.rect(px - 2 * u, py, 4 * u, Math.max(1, u), DARK);
      targets.push({ x: px - 5 * u, y: py - 4 * u, w: 10 * u, h: 6 * u });
      return p.x > -0.2 && p.x < 1.2;
    });
    r.rect(0, g, N, N - g, MID);
    r.rect(0, g, N, Math.max(1, u), LMID);
    const fx = w.fig * N, J = walker(r, fx, g, 0.2 * N, FIG, 0, 1, { cap: true, hatCol: HOT });
    r.stroke(J.sx, J.sy + 0.02 * N, J.sx + 0.06 * N, J.sy - 0.1 * N, 1.5 * u, FIG);
    targets.push({ x: fx - 0.05 * N, y: g - 0.2 * N, w: 0.1 * N, h: 0.2 * N });
  },
};

// ---------------------------------------------------------------------------------------------- flat earth
// The disc with its sea and continents, the ice wall round the rim, the dome over it, the sun and the moon going
// round above like lamps on a track; ships at the edge, and whatever the kicks push over it.
const flatearth = {
  init(W) {
    Object.assign(W.w, { orbit: 0, ships: [{ x: 0.1 }, { x: 0.6 }], fall: [] });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, cx = N / 2, cy = 0.62 * N, R = 0.44 * N;
    for (const hh of hits) if (isLow(hh) && w.fall.length < 6) w.fall.push({ x: rnd() < 0.5 ? cx - R * 0.98 : cx + R * 0.98, y: cy, vy: 0 });
    w.orbit += dt * (0.4 + 0.6 * f.rel.midDrive);
    for (let k = 0; k < 20; k++) r.set(hash(k, 7) * N, hash(k, 8) * 0.3 * N, LMID);
    r.ring(cx, cy, R * 1.05, Math.max(1, u), MID, 0.75);
    r.ring(cx, cy, R * 0.5, R, COOL, 0.32);
    for (let i = 0; i < 7; i++) { const a = i * 2.4, d = R * (0.2 + 0.5 * hash(i, 4)); r.ring(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.32, R * 0.06, R * (0.1 + hash(i, 5) * 0.1), LMID, 0.32); }
    r.ring(cx, cy + 3 * u, R, Math.max(2, 2 * u), LMID, 0.32);
    r.ring(cx, cy, R, Math.max(2, 2.5 * u), BRIGHT, 0.32);
    const sunA = w.orbit, lamps = [[sunA, HOT, 0.06], [sunA + Math.PI, BRIGHT, 0.045]];
    for (const [a, col, rr] of lamps) {
      const x = cx + Math.cos(a) * R * 0.6, y = cy - 0.3 * N + Math.sin(a) * R * 0.15;
      r.disc(x, y, rr * N, col);
      if (col === HOT) for (let yy = Math.round(y + rr * N); yy < cy + R * 0.3; yy += 2) { const k = (yy - y) / (cy - y); r.rect(x - rr * N * (1 + 2 * k), yy, 2 * rr * N * (1 + 2 * k), 1, LMID); }
    }
    for (const sh of w.ships) {
      sh.x = (sh.x + dt * 0.02) % 1.2;
      if (sh.x >= 1) continue;
      const x = cx - R + sh.x * 2 * R, y = cy + Math.sin(sh.x * 7) * R * 0.25;
      r.rect(x - 4 * u, y - 2 * u, 8 * u, 2 * u, DARK);
      r.rect(x - u, y - 6 * u, 2 * u, 4 * u, DARK);
    }
    w.fall = w.fall.filter((o) => { o.vy += N * 1.5 * dt; o.y += o.vy * dt; o.x += (o.x < cx ? -1 : 1) * dt * 6 * u; r.rect(o.x - u, o.y - 3 * u, 2 * u, 3 * u, FIG); return o.y < N + 5 * u; });
    const sx = cx + Math.cos(sunA) * R * 0.6, sy = cy - 0.3 * N + Math.sin(sunA) * R * 0.15;
    targets.push({ x: sx - 0.08 * N, y: sy - 0.08 * N, w: 0.16 * N, h: 0.16 * N });
  },
};

// ---------------------------------------------------------------------------------------------- studio
// The moon set: a grey surface with craters on a sound stage, three lamps on stands, a lander, a flag that only
// moves when the hats blow, someone in a suit, and the crew in front: camera, chair, boom, a clapper on the
// snare; a take mark for every new section.
const studio = {
  init(W) {
    Object.assign(W.w, { flagWave: 0, clap: 0, lights: [0.2, 0.5, 0.8], boom: 0.6, take: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, hits, targets } = W, g = 0.78 * N;
    for (const hh of hits) {
      if (hh.kind === 'hat') w.flagWave = 1;
      else if (hh.kind === 'snare') w.clap = 0.25;
    }
    if (f.section) w.take++;
    w.flagWave *= Math.exp(-dt * 2);
    w.clap -= dt;
    r.rect(0.3 * N, 0, 0.4 * N, 0.5 * N, BLACK);
    for (let k = 0; k < 25; k++) r.set(0.3 * N + hash(k, 1) * 0.4 * N, hash(k, 2) * 0.48 * N, BRIGHT);
    r.rect(0.3 * N, 0, Math.max(1, u), 0.5 * N, MID);
    r.rect(0.7 * N, 0, Math.max(1, u), 0.5 * N, MID);
    r.rect(0.3 * N, 0.5 * N, 0.4 * N, Math.max(1, u), MID);
    for (const lx of w.lights) {
      const x = lx * N;
      r.rect(x - u, 0.1 * N, 2 * u, g - 0.1 * N, MID);
      r.rect(x - 5 * u, 0.1 * N, 10 * u, 6 * u, DARK);
      for (let y = Math.round(0.16 * N); y < g; y += 2) { const k = (y - 0.16 * N) / (g - 0.16 * N); if (hash(y, Math.floor(x)) < 0.6) r.rect(x - 5 * u - k * 0.12 * N, y, 10 * u + k * 0.24 * N, 1, f.beat.pulse > 0.4 && lx === w.lights[1] ? BRIGHT : LMID); }
    }
    r.rect(0, g, N, N - g, LMID);
    for (let k = 0; k < 6; k++) r.ring(hash(k, 3) * N, g + 2 * u + hash(k, 4) * (N - g - 4 * u), 3 * u + hash(k, 5) * 4 * u, Math.max(1, u), MID, 0.4);
    const lx = 0.62 * N;
    r.rect(lx - 0.07 * N, g - 0.16 * N, 0.14 * N, 0.08 * N, MID);
    r.ring(lx, g - 0.2 * N, 0.05 * N, 0.04 * N, BRIGHT, 0.7);
    for (const k of [-1, 1]) { r.line(lx + k * 0.06 * N, g - 0.08 * N, lx + k * 0.11 * N, g, DARK); r.rect(lx + k * 0.11 * N - 2 * u, g - u, 4 * u, Math.max(1, u), DARK); }
    const fx = 0.4 * N;
    r.rect(fx, g - 0.2 * N, Math.max(1, u), 0.2 * N, DARK);
    for (let y = 0; y < 8 * u; y++) r.rect(fx + u, g - 0.2 * N + y, 10 * u + Math.sin(t * 12 + y) * w.flagWave * 2 * u, 1, Math.floor(y / (2 * u)) % 2 ? HOT : BRIGHT);
    const ax = 0.28 * N;
    walker(r, ax, g, 0.17 * N, BRIGHT, 0.3 * Math.sin(t * 2), 1, {});
    r.disc(ax, g - 0.17 * N * 0.84, 0.17 * N * 0.11, COOL);
    r.rect(ax - 3 * u, g - 0.17 * N * 0.7, 2 * u, 5 * u, LMID);
    r.rect(0.08 * N, g + 0.06 * N, 0.1 * N, 0.06 * N, DARK);
    r.disc(0.08 * N, g + 0.09 * N, 2.5 * u, DARK);
    for (const k of [-1, 0, 1]) r.line(0.13 * N, g + 0.12 * N, 0.13 * N + k * 4 * u, N, DARK);
    r.rect(0.85 * N, g + 0.08 * N, 0.08 * N, 2 * u, DARK);
    r.rect(0.86 * N, g + 0.1 * N, Math.max(1, u), 0.1 * N, DARK);
    r.rect(0.92 * N, g + 0.1 * N, Math.max(1, u), 0.1 * N, DARK);
    r.rect(0.85 * N, g + 0.02 * N, 0.08 * N, 0.06 * N, HOT);
    const bx = w.boom * N;
    r.line(bx, N, bx - 0.15 * N, 0.4 * N, DARK);
    r.rect(bx - 0.17 * N, 0.38 * N, 5 * u, 3 * u, DARK);
    if (w.clap > 0) { r.rect(0.45 * N, 0.55 * N, 0.1 * N, 0.07 * N, BLACK); r.poly([[0.45 * N, 0.55 * N], [0.55 * N, 0.55 * N], [0.55 * N, 0.55 * N - 2 * u], [0.45 * N, 0.55 * N - 6 * u * (w.clap / 0.25)]], BRIGHT); }
    for (let k = 0; k < Math.min(8, w.take); k++) r.rect(0.02 * N + k * 2.5 * u, 0.02 * N, 1.5 * u, 3 * u, HOT);
    targets.push({ x: ax - 0.05 * N, y: g - 0.17 * N, w: 0.1 * N, h: 0.17 * N });
  },
};

// ---------------------------------------------------------------------------------------------- agents
// A night road, a long black car, two in dark suits and glasses facing a witness; on the snare the small device
// comes up and the frame goes white, and the witness is left dazed.
const agents = {
  init(W) {
    Object.assign(W.w, { flash: 0, car: 0.65, step: 0, witness: 0.25, forget: 0 });
  },
  draw(W) {
    const { r, N, u, dt, hits, targets, w } = W, g = 0.8 * N;
    for (const hh of hits) {
      if (hh.kind === 'snare') { w.flash = 0.1; w.forget = 1; }
      else if (isLow(hh)) w.step = 1;
    }
    w.flash -= dt;
    w.forget *= Math.exp(-dt / 3);
    w.step *= Math.exp(-dt * 6);
    const lit = w.flash > 0;
    if (lit) r.fill(BRIGHT);
    for (let k = 0; k < 30; k++) r.set(hash(k, 11) * N, hash(k, 12) * 0.6 * N, lit ? BG : LMID);
    r.rect(0, g, N, N - g, DARK);
    r.rect(0, g, N, Math.max(1, u), MID);
    for (let x = 0; x < N; x += 8 * u) r.rect(x, g + 0.08 * N, 4 * u, Math.max(1, u), LMID);
    const cx = w.car * N;
    r.rect(cx - 0.2 * N, g - 0.1 * N, 0.4 * N, 0.08 * N, BLACK);
    r.rect(cx - 0.12 * N, g - 0.15 * N, 0.22 * N, 0.05 * N, BLACK);
    r.rect(cx - 0.1 * N, g - 0.14 * N, 0.08 * N, 0.03 * N, DARK + DIM);
    r.rect(cx, g - 0.14 * N, 0.08 * N, 0.03 * N, DARK + DIM);
    for (const k of [-0.13, 0.13]) r.disc(cx + k * N, g - 0.02 * N, 0.025 * N, DARK + DIM);
    r.rect(cx + 0.19 * N, g - 0.07 * N, 2 * u, 2 * u, lit ? HOT : BRIGHT);
    for (let i = 0; i < 2; i++) {
      const x = (0.42 + i * 0.1) * N + w.step * 2 * u, h = 0.26 * N, J = walker(r, x, g, h, lit ? DARK : BLACK, 0, -1, { hat: i === 0 });
      r.rect(x - h * 0.08, J.head - h * 0.02, h * 0.16, Math.max(1, 1.5 * u), lit ? BLACK : DARK + DIM);
      r.rect(x - h * 0.015, J.sy, h * 0.03, h * 0.2, HOT);
      if (i === 1) { r.rect(J.sx - 6 * u, J.sy + h * 0.15, 6 * u, Math.max(1, 1.5 * u), LMID); r.rect(J.sx - 7 * u, J.sy + h * 0.14, 2 * u, 2.5 * u, lit ? BRIGHT : HOT); }
      targets.push({ x: x - h * 0.25, y: g - h, w: h * 0.5, h });
    }
    const wx = w.witness * N, J = walker(r, wx, g, 0.22 * N, FIG, 0, 1, { cap: true, hatCol: LMID });
    if (w.forget > 0.3) { r.ring(wx, J.head - 0.08 * N, 3 * u, Math.max(1, u), LMID); r.disc(wx + 4 * u, J.head - 0.12 * N, 1.5 * u, LMID); }
    targets.push({ x: wx - 0.05 * N, y: g - 0.22 * N, w: 0.1 * N, h: 0.22 * N });
  },
};

// ---------------------------------------------------------------------------------------------- bigfoot
// The famous kind of footage: a shaky camera in the woods, something tall and shaggy walking across, looking
// back over its shoulder on the snare; a frame counter of blocks and the odd dropped frame.
const bigfoot = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { x: -0.1, ph: 0, look: 0, trees: Array.from({ length: 14 }, (_, i) => [i * 0.08 + rnd() * 0.04, 0.3 + rnd() * 0.4, 0.02 + rnd() * 0.02]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.82 * N, bps = f.bpm ? f.bpm / 60 : 2;
    for (const hh of hits) if (hh.kind === 'snare') w.look = 1.2;
    w.look -= dt;
    s.shake = Math.max(s.shake, 0.25 + 0.3 * f.level);
    for (let x = 0; x < N; x += 2) r.rect(x, 0.5 * N, 1, g - 0.5 * N, LMID);
    for (const [tx, th, tw] of w.trees) { r.rect(tx * N - (tw * N) / 2 + Math.sin(t + tx * 9) * u * 0.5, g - th * N, tw * N, th * N, DARK); r.disc(tx * N, g - th * N, tw * N * 2.5, DARK); }
    r.rect(0, g, N, N - g, MID);
    r.rect(0, g + 0.06 * N, N, 3 * u, COOL);
    const h = 0.3 * N, dx = dt * 0.055 * bps;
    w.x += dx;
    if (w.x > 1.2) w.x = -0.2;
    w.ph += dx / (0.1 * 0.3); // long slow strides, in step with the travel
    const x = w.x * N, J = walker(r, x, g, h, BLACK, w.ph, 1, { coat: true });
    r.rect(x - h * 0.25, J.sy - h * 0.02, h * 0.5, h * 0.12, BLACK);
    r.stroke(J.sx, J.sy, J.sx + h * 0.08 * Math.sin(w.ph), J.sy + h * 0.5, Math.max(2, 2.5 * u), BLACK);
    for (let k = 0; k < 10; k++) r.rect(x - h * 0.2 + hash(k, 21) * h * 0.4, J.sy + hash(k, 22) * h * 0.5, Math.max(1, u), 3 * u, DARK + DIM);
    if (w.look > 0) { r.disc(x - h * 0.05, J.head, h * 0.1, BLACK); r.rect(x - h * 0.1, J.head - u, 2 * u, Math.max(1, u), BRIGHT); r.rect(x - h * 0.03, J.head - u, 2 * u, Math.max(1, u), BRIGHT); }
    targets.push({ x: x - h * 0.3, y: g - h, w: h * 0.6, h });
    for (let k = 0; k < 10; k++) r.rect(0.05 * N + k * 3 * u, 0.04 * N, 2 * u, 2 * u, k === Math.floor(t * 3) % 10 ? HOT : DARK);
    if (rnd() < 0.03) r.rect(0, 0, N, N, BLACK);
  },
};

// ---------------------------------------------------------------------------------------------- swarm
// A drone show over a city: ninety lights drifting into one shape after another (a circle, a triangle, a heart,
// a star, an eye, a spiral) every four bars, breathing with the bass; kicks and snares flash alternate thirds of
// them, hats single ones.
const outline = (P, i, n) => { const s = (i / n) * P.length, k = Math.floor(s) % P.length, q = s - Math.floor(s), A = P[k], B = P[(k + 1) % P.length]; return [lerp(A[0], B[0], q), lerp(A[1], B[1], q)]; };
const STAR_P = Array.from({ length: 10 }, (_, j) => { const a = (j / 10) * TAU - Math.PI / 2, k = j % 2 ? 0.14 : 0.32; return [0.5 + k * Math.cos(a), 0.42 + k * Math.sin(a)]; });
const SHAPES = {
  circle: (i, n) => [0.5 + 0.3 * Math.cos((i / n) * TAU), 0.42 + 0.3 * Math.sin((i / n) * TAU)],
  triangle: (i, n) => outline([[0.5, 0.1], [0.82, 0.72], [0.18, 0.72]], i, n),
  heart: (i, n) => { const a = (i / n) * TAU; return [0.5 + 0.02 * 16 * Math.sin(a) ** 3, 0.42 - 0.02 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))]; },
  star: (i, n) => outline(STAR_P, i, n),
  eye: (i, n) => { if (i % 4 === 0) { const a = (i / n) * TAU * 4; return [0.5 + 0.08 * Math.cos(a), 0.42 + 0.08 * Math.sin(a)]; } const a = (i / n) * TAU; return [0.5 + 0.35 * Math.cos(a), 0.42 + 0.14 * Math.sin(a) * (1 - Math.abs(Math.cos(a)) ** 2)]; },
  spiral: (i, n) => { const a = (i / n) * TAU * 3, k = 0.05 + 0.3 * (i / n); return [0.5 + k * Math.cos(a), 0.42 + k * Math.sin(a)]; },
};

const swarm = {
  init(W) {
    const { w, rnd } = W, n = 90, keys = Object.keys(SHAPES);
    Object.assign(w, { n, keys, pts: Array.from({ length: n }, () => [rnd(), rnd()]), shape: pick(rnd, keys), k: 1, flash: new Float32Array(n),
      stars: Array.from({ length: 40 }, () => [rnd(), rnd() * 0.7]), city: Array.from({ length: 12 }, (_, i) => [i * 0.09 - 0.02, 0.06 + rnd() * 0.05, 0.08 + rnd() * 0.12]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, g = 0.85 * N;
    if (f.section || (f.beat.on && f.beat.count % 16 === 0)) { w.shape = pick(rnd, w.keys.filter((k) => k !== w.shape)); w.k = 0; }
    w.k = Math.min(1, w.k + dt / 2.5);
    for (const hh of hits) {
      if (isLow(hh)) for (let i = 0; i < w.n; i += 3) w.flash[i] = 1;
      else if (hh.kind === 'snare') for (let i = 1; i < w.n; i += 3) w.flash[i] = 1;
      else if (hh.kind === 'hat') w.flash[Math.floor(rnd() * w.n)] = 1;
    }
    for (const [sx, sy] of w.stars) r.set(sx * N, sy * N, DARK + DIM);
    for (const [x, bw, bh] of w.city) r.rect(x * N, g - bh * N, bw * N, bh * N, DARK);
    r.rect(0, g, N, N - g, DARK);
    const fn = SHAPES[w.shape], breathe = 1 + 0.03 * Math.sin(t * 1.2) + 0.04 * f.rel.bassDrive;
    for (let i = 0; i < w.n; i++) {
      const [tx, ty] = fn(i, w.n), p = w.pts[i];
      p[0] = follow(p[0], 0.5 + (tx - 0.5) * breathe, dt, 0.6 + (i % 7) * 0.08);
      p[1] = follow(p[1], 0.42 + (ty - 0.42) * breathe, dt, 0.6 + (i % 5) * 0.08);
      w.flash[i] *= Math.exp(-dt * 6);
      const x = p[0] * N, y = p[1] * N;
      r.rect(x - u / 2, y - u / 2, Math.max(1, u), Math.max(1, u), w.flash[i] > 0.3 ? BRIGHT : i % 2 ? HOT : COOL);
      if (w.flash[i] > 0.6) r.ring(x, y, 1.5 * u, Math.max(1, u * 0.6), BRIGHT);
    }
    for (let i = 0; i < 14; i++) {
      const x = ((i + 0.5) / 14) * N + Math.sin(i) * 2 * u;
      r.disc(x, g - 3 * u, 2 * u, DARK + DIM);
      r.rect(x - 3 * u, g - u, 6 * u, 3 * u, DARK + DIM);
      if (f.beat.pulse > 0.4 && hash(i, f.beat.count) < 0.5) r.rect(x + 2 * u, g - 7 * u, Math.max(1, u), 2 * u, BRIGHT);
    }
    targets.push({ x: 0.15 * N, y: 0.1 * N, w: 0.7 * N, h: 0.62 * N });
  },
};

// ---------------------------------------------------------------------------------------------- feed
// A phone in a hand, the feed inside it scrolling at the tempo: cards with a picture or lines of text (as bars),
// a like on every snare with hearts floating up, the frame glowing on the kick, a counter of hearts at the side.
const feed = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { scroll: 0, cards: Array.from({ length: 8 }, () => ({ h: 0.25 + rnd() * 0.2, kind: Math.floor(rnd() * 3), seed: Math.floor(rnd() * 1000) })), hearts: [], likes: 0, pulse: 0, dark: rnd() < 0.5 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, bps = f.bpm ? f.bpm / 60 : 2, px = 0.25 * N, pw = 0.5 * N, py = 0.04 * N, ph = 0.92 * N, top = py + 0.05 * N, bottom = py + ph - 0.06 * N;
    for (const hh of hits) {
      if (hh.kind === 'snare') { w.likes++; for (let k = 0; k < 4; k++) w.hearts.push({ x: px + pw * (0.6 + rnd() * 0.3), y: py + ph * 0.75, vy: -(0.15 + rnd() * 0.15) * N, vx: (rnd() - 0.5) * 0.05 * N, life: 1 }); }
      else if (isLow(hh)) w.pulse = 1;
    }
    w.pulse *= Math.exp(-dt * 6);
    w.scroll += dt * bps * 0.12 * (0.5 + 0.5 * f.rel.midAtt);
    r.rect(px - 0.06 * N, py + ph * 0.5, pw + 0.12 * N, ph * 0.5 + 0.04 * N, MID);
    r.rect(px - 0.02 * N, py - 0.02 * N, pw + 0.04 * N, ph + 0.04 * N, BLACK);
    r.rect(px, py, pw, ph, w.dark ? DARK : BRIGHT);
    const first = Math.floor(w.scroll);
    let y = top + 2 * u - (w.scroll % 1) * w.cards[first % w.cards.length].h * N;
    for (let k = 0; k < 6 && y < bottom; k++) {
      const c = w.cards[(first + k) % w.cards.length], h = c.h * N, yy = Math.max(top, y), hh2 = Math.min(bottom, y + h) - yy;
      if (hh2 > 2 * u) {
        r.rect(px + 2 * u, yy, pw - 4 * u, hh2, c.kind === 0 ? COOL : c.kind === 1 ? HOT : LMID);
        if (c.kind === 2) { for (let j = 0; j < 4; j++) { const ly = y + 4 * u + j * 4 * u; if (ly > top && ly < bottom) r.rect(px + 6 * u, ly, (pw - 12 * u) * (0.4 + hash(j, c.seed) * 0.5), Math.max(1, u), DARK); } }
        else { const cy = Math.max(yy + 2 * u, Math.min(y + h - 2 * u, y + h * 0.45)), rr = Math.max(1, Math.min(h * 0.22, hh2 / 2 - u)); r.disc(px + pw / 2, cy, rr, c.kind === 0 ? BRIGHT : DARK); }
        r.disc(px + 5 * u, yy + hh2 - 5 * u, 2 * u, FIG);
        r.rect(px + 8 * u, yy + hh2 - 6 * u, 10 * u, Math.max(1, u), FIG);
      }
      y += h + 2 * u;
    }
    r.rect(px, py, pw, 0.05 * N, w.dark ? BLACK : LMID);
    r.rect(px + pw * 0.4, py + 2 * u, pw * 0.2, 2 * u, DARK);
    r.rect(px, bottom, pw, 0.06 * N, w.dark ? BLACK : LMID);
    for (let k = 0; k < 5; k++) r.rect(px + pw * (0.1 + k * 0.2) - 2 * u, bottom + 2 * u, 4 * u, 3 * u, k === 2 ? HOT : MID);
    w.hearts = w.hearts.filter((hh) => {
      hh.y += hh.vy * dt;
      hh.x += hh.vx * dt + Math.sin(t * 6 + hh.y) * u * 0.3;
      hh.life -= dt * 0.8;
      const s2 = 2 * u;
      r.disc(hh.x - s2 * 0.5, hh.y - s2 * 0.3, s2 * 0.6, HOT);
      r.disc(hh.x + s2 * 0.5, hh.y - s2 * 0.3, s2 * 0.6, HOT);
      r.poly([[hh.x - s2 * 1.1, hh.y - s2 * 0.1], [hh.x + s2 * 1.1, hh.y - s2 * 0.1], [hh.x, hh.y + s2 * 1.2]], HOT);
      return hh.life > 0 && hh.y > py;
    });
    for (let k = 0; k < Math.min(12, w.likes % 13); k++) r.rect(px + pw + 0.04 * N, py + ph * 0.7 - k * 3 * u, 2 * u, 2 * u, HOT);
    if (w.pulse > 0.3) r.frame(Math.round(px - 0.02 * N), Math.round(py - 0.02 * N), Math.round(pw + 0.04 * N), Math.round(ph + 0.04 * N), BRIGHT);
    targets.push({ x: px, y: py, w: pw, h: ph });
  },
};

// ---------------------------------------------------------------------------------------------- chart
// A candle chart that climbs with the level and the bass, a new candle every beat; a drop is a crash with red
// everywhere, a heavy kick on a high price sends the rocket toward the moon in the corner.
const chart = {
  init(W) {
    Object.assign(W.w, { candles: Array.from({ length: 24 }, (_, i) => ({ o: 0.5, c: 0.5 + Math.sin(i) * 0.05, h: 0.58, l: 0.42 })), price: 0.5, crash: 0, rocket: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, x0 = 0.08 * N, x1 = 0.92 * N, y0 = 0.1 * N, y1 = 0.78 * N;
    w.price = follow(w.price, clamp(0.2 + 0.6 * (0.5 * f.level + 0.5 * f.rel.bassDrive) - 0.3 * w.crash, 0.05, 0.95), dt, 0.6);
    const cur = w.candles[w.candles.length - 1];
    cur.c = w.price;
    cur.h = Math.max(cur.h, w.price);
    cur.l = Math.min(cur.l, w.price);
    if (f.beat.on) { w.candles.push({ o: w.price, c: w.price, h: w.price, l: w.price }); if (w.candles.length > 24) w.candles.shift(); }
    if (f.section === 'drop') { w.crash = 1; s.shake = Math.max(s.shake, 0.6); }
    for (const hh of hits) if (isLow(hh) && hh.strength > 0.8 && w.price > 0.6 && w.rocket <= 0) w.rocket = 1;
    w.crash *= Math.exp(-dt / 2);
    w.rocket -= dt * 0.5;
    r.rect(x0, y0, x1 - x0, y1 - y0, DARK);
    for (let k = 0; k <= 4; k++) { r.rect(x0, y0 + (k * (y1 - y0)) / 4, x1 - x0, 1, MID); r.rect(x0 + (k * (x1 - x0)) / 4, y0, 1, y1 - y0, MID); }
    const cw = (x1 - x0) / 24, Y = (p) => y1 - p * (y1 - y0);
    w.candles.forEach((c, i) => {
      const x = x0 + i * cw + cw / 2, col = c.c >= c.o ? COOL : HOT;
      r.rect(x - u / 2, Y(c.h), Math.max(1, u), Math.max(1, Y(c.l) - Y(c.h)), col);
      r.rect(x - cw * 0.3, Math.min(Y(c.o), Y(c.c)), cw * 0.6, Math.max(1, Math.abs(Y(c.o) - Y(c.c))), col);
    });
    r.rect(x0, Y(w.price), x1 - x0, Math.max(1, u * 0.6), BRIGHT);
    r.rect(x1 - 6 * u, Y(w.price) - 2 * u, 6 * u, 4 * u, w.crash > 0.3 ? HOT : COOL);
    r.rect(0, y1 + 0.03 * N, N, 0.12 * N, DARK);
    for (let k = 0; k < 24; k++) r.rect(x0 + k * cw, y1 + 0.15 * N - (0.3 + 0.7 * hash(k, Math.floor(t))) * 0.1 * N, cw * 0.6, 0.1 * N, k === 23 ? BRIGHT : MID);
    r.disc(0.88 * N, 0.08 * N, 0.04 * N, LMID);
    if (w.rocket > 0) {
      const k = 1 - w.rocket, rx = lerp(x1 - cw, 0.88 * N, k), ry = lerp(Y(w.price), 0.12 * N, k);
      r.rect(rx - 1.5 * u, ry - 6 * u, 3 * u, 6 * u, BRIGHT);
      r.poly([[rx - 1.5 * u, ry - 6 * u], [rx + 1.5 * u, ry - 6 * u], [rx, ry - 9 * u]], HOT);
      for (let q = 0; q < 3; q++) r.rect(rx - u + (rnd() - 0.5) * 2 * u, ry + q * 2 * u, 2 * u, 2 * u, q ? LMID : HOT);
    }
    if (w.crash > 0.5) for (let k = 0; k < 6; k++) r.rect(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 2 * u, 2 * u, HOT);
    targets.push({ x: x1 - 8 * u, y: Y(w.price) - 4 * u, w: 10 * u, h: 8 * u });
  },
};

// ---------------------------------------------------------------------------------------------- bust
// The vaporwave frame: a striped sunset, a grid rolling at the tempo, two palms, a marble bust on a plinth whose
// eyes follow the beat and that cracks a little more on every snare, a floating window, a checker tile.
const bust = {
  init(W) {
    Object.assign(W.w, { cracks: 0, palms: [0.12, 0.86] });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, hits, targets } = W, hz = 0.55 * N, cx = 0.5 * N;
    for (const hh of hits) if (hh.kind === 'snare') w.cracks = Math.min(1, w.cracks + 0.2);
    w.cracks *= Math.exp(-dt / 6);
    for (let k = 0; k < 6; k++) r.rect(0, (k * hz) / 6, N, hz / 6 + 1, k < 2 ? DARK : k < 4 ? MID : LMID);
    r.disc(cx, hz, 0.22 * N, HOT);
    for (let k = 0; k < 4; k++) r.rect(cx - 0.22 * N, hz - 0.03 * N - k * 0.045 * N, 0.44 * N, Math.max(1, u * (1 + k * 0.6)), k < 2 ? LMID : MID);
    r.rect(0, hz, N, N - hz, DARK);
    const ph = (f.rel.bassClock * 0.5) % 1;
    for (let k = -6; k <= 6; k++) r.line(cx, hz, cx + k * 0.25 * N, N, COOL);
    for (let k = 1; k <= 10; k++) { const zz = 1 + (k - ph) * 0.8, y = hz + (N - hz) / zz; if (y < N) r.rect(0, y, N, 1, COOL); }
    for (const px of w.palms) {
      const x = px * N;
      for (let y = hz - 0.3 * N; y < hz + 0.1 * N; y += u) r.rect(x + Math.sin(y * 0.05) * 3 * u, y, 2 * u, u + 1, BLACK);
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.45; r.stroke(x, hz - 0.3 * N, x + Math.cos(a) * 0.1 * N, hz - 0.3 * N + Math.sin(a) * 0.1 * N + 0.03 * N, 2 * u, BLACK); }
    }
    const bx = cx, by = hz + 0.02 * N, Hb = 0.36 * N;
    r.rect(bx - 0.14 * N, by + 0.02 * N, 0.28 * N, 0.08 * N, LMID);
    r.rect(bx - 0.16 * N, by + 0.02 * N, 0.32 * N, 2 * u, BRIGHT);
    r.poly([[bx - Hb * 0.3, by + 0.02 * N], [bx + Hb * 0.3, by + 0.02 * N], [bx + Hb * 0.22, by - Hb * 0.3], [bx - Hb * 0.22, by - Hb * 0.3]], BRIGHT);
    r.rect(bx - Hb * 0.07, by - Hb * 0.42, Hb * 0.14, Hb * 0.14, BRIGHT);
    r.ring(bx, by - Hb * 0.56, Hb * 0.08, Hb * 0.16, BRIGHT, 1.15);
    for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI; r.disc(bx + Math.cos(a) * Hb * 0.15, by - Hb * 0.6 + Math.sin(a) * Hb * 0.1, Hb * 0.035, LMID); }
    r.rect(bx - Hb * 0.02, by - Hb * 0.6, Hb * 0.04, Hb * 0.1, LMID);
    r.rect(bx - Hb * 0.05, by - Hb * 0.46, Hb * 0.1, Math.max(1, u), LMID);
    const look = Math.sin(f.beat.phase * TAU) * u;
    for (const k of [-1, 1]) { r.rect(bx + k * Hb * 0.07 - 1.5 * u, by - Hb * 0.62, 3 * u, 1.5 * u, LMID); r.rect(bx + k * Hb * 0.07 - u / 2 + look, by - Hb * 0.62, Math.max(1, u), Math.max(1, u), MID); }
    if (w.cracks > 0.1) for (let i = 0; i < 4; i++) { if (hash(i, 31) > w.cracks) continue; r.line(bx + (hash(i, 32) - 0.5) * Hb * 0.3, by - Hb * 0.3 - hash(i, 33) * Hb * 0.3, bx + (hash(i, 34) - 0.5) * Hb * 0.4, by - Hb * 0.1 - hash(i, 35) * Hb * 0.2, MID); }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) r.rect(bx - 0.14 * N + i * 0.046 * N, by + 0.04 * N + j * 0.03 * N, 0.046 * N, 0.03 * N, (i + j) % 2 ? MID : LMID);
    const wy = 0.12 * N + Math.sin(t) * 2 * u;
    r.frame(Math.round(0.7 * N), Math.round(wy), Math.round(0.2 * N), Math.round(0.14 * N), BRIGHT);
    r.rect(0.7 * N, wy, 0.2 * N, 2 * u, BRIGHT);
    targets.push({ x: bx - Hb * 0.3, y: by - Hb * 0.75, w: Hb * 0.6, h: Hb * 0.8 });
  },
};

// ---------------------------------------------------------------------------------------------- horde
// A barricade, a survivor, and a horde coming in at half the tempo: shamblers with their arms out, runners
// leaning into it, crawlers low on all fours, hounds bounding, giants that take two. Every kick is the survivor's
// turn with what is to hand: a bat for whoever reaches the barricade, a pistol for the nearest, a shotgun that
// drops two, a bottle of fire lobbed on an arc that burns where it lands; a snare is a flare behind them. They
// come back round. A section change changes the tool, a drop brings the giants.
const UNDEAD = { // `stride`: how far one travels per radian of its gait, in heights, so the legs keep step with the ground
  shambler: { h: 0.22, v: 1, hp: 1, stride: 0.1 }, // arms out, the slow walk
  runner: { h: 0.21, v: 3, hp: 1, run: true, stride: 0.2 }, // leaning forward, long strides, arms pumping
  crawler: { h: 0.12, v: 1.6, hp: 1, low: true, stride: 0.2 }, // on all fours, the legs scissoring
  hound: { h: 0.1, v: 2.6, hp: 1, bound: true, stride: 0.3 }, // a four-legged thing that bounds
  giant: { h: 0.34, v: 0.6, hp: 2, big: true, stride: 0.1 }, // head and shoulders over the rest, takes two
};
const UNDEAD_W = { shambler: [3, 2, 1], crawler: [2, 2, 2], hound: [1, 2, 2], runner: [1, 2, 3], giant: [0, 1, 2] };
// the survivor's tools: what a kick does
const TOOLS = { bat: { reach: 0.2 }, pistol: { n: 1 }, shotgun: { n: 2, wide: true }, molotov: { lob: true } };
const TOOL_W = { bat: [3, 2, 1], pistol: [2, 2, 2], shotgun: [1, 2, 3], molotov: [0, 1, 2] };

function newUndead(rnd, band, x, kind = rollW(rnd, UNDEAD_W, band)) {
  return { x, kind, ph: rnd() * TAU, down: 0, hp: UNDEAD[kind].hp, flash: 0, h: UNDEAD[kind].h + rnd() * 0.03, coat: rnd() < 0.5 };
}

// one of the horde at x, feet on g, walking left
function drawUndead(r, kind, x, g, h, col, ph, u) {
  if (kind === 'runner') { // legs in long strides from the hip, the trunk leaning into the run
    const hipY = g - h * 0.45, st = Math.sin(ph) * h * 0.28, shx = x - h * 0.18, shy = g - h * 0.78;
    r.stroke(x, hipY, x + st, g, 1.5 * u, col);
    r.stroke(x, hipY, x - st, g, 1.5 * u, col);
    r.stroke(x, hipY, shx, shy, Math.max(2, h * 0.14), col);
    r.disc(shx - h * 0.06, shy - h * 0.1, h * 0.1, col);
    r.stroke(shx, shy, shx - h * 0.22 * Math.cos(ph), shy + h * 0.1 + h * 0.15 * Math.sin(ph), 1.5 * u, col);
    r.stroke(shx, shy, shx + h * 0.22 * Math.cos(ph), shy + h * 0.1 - h * 0.15 * Math.sin(ph), 1.5 * u, col);
    r.rect(shx - h * 0.12, shy - h * 0.12, 2 * u, Math.max(1, u), HOT);
    return;
  }
  if (kind === 'crawler') { // a body low to the ground, the head in front, four legs
    r.rect(x - h * 0.9, g - h * 0.6, h * 1.5, h * 0.4, col);
    r.disc(x - h * 1.05, g - h * 0.5, h * 0.3, col);
    for (const [bx, k] of [[-0.8, 0], [-0.2, 1], [0.3, 0], [0.55, 1]]) { const sw = Math.sin(ph + k * Math.PI) * h * 0.3; r.stroke(x + bx * h, g - h * 0.3, x + bx * h + sw, g, 1.5 * u, col); }
    r.rect(x - h * 1.2, g - h * 0.55, 2 * u, Math.max(1, u), HOT);
    return;
  }
  if (kind === 'hound') { // bounding: the body lifts and the legs gather under it
    const hop = Math.max(0, Math.sin(ph)) * h * 0.6, by = g - h * 0.9 - hop, gather = Math.cos(ph) * h * 0.3;
    r.rect(x - h * 0.8, by, h * 1.6, h * 0.5, col);
    r.disc(x - h * 0.95, by + h * 0.1, h * 0.3, col);
    r.poly([[x - h * 1.1, by - h * 0.1], [x - h * 1, by - h * 0.4], [x - h * 0.85, by - h * 0.05]], col);
    for (const bx of [-0.65, 0.6]) { r.stroke(x + bx * h, by + h * 0.4, x + bx * h + gather, g - (hop > h * 0.2 ? hop * 0.5 : 0), 1.5 * u, col); r.stroke(x + bx * h + h * 0.15, by + h * 0.4, x + bx * h + h * 0.15 - gather, g - (hop > h * 0.2 ? hop * 0.5 : 0), 1.5 * u, col); }
    r.stroke(x + h * 0.8, by + h * 0.1, x + h * 1.2, by - h * 0.2 + gather * 0.5, Math.max(1, u), col);
    r.rect(x - h * 1.05, by + h * 0.02, Math.max(1, u), Math.max(1, u), HOT);
    return;
  }
  const J = walker(r, x, g, h, col, ph, -1, { coat: kind === 'giant' });
  if (kind === 'giant') { r.rect(x - J.hw * 1.6, J.sy - h * 0.04, J.hw * 3.2, h * 0.1, col); r.rect(x - h * 0.1, J.head - u, 2 * u, Math.max(1, u), HOT); r.rect(x + h * 0.02, J.head - u, 2 * u, Math.max(1, u), HOT); }
  else r.rect(x - h * 0.08, J.head - u, 2 * u, Math.max(1, u), HOT);
  r.stroke(J.sx, J.sy + h * 0.05, J.sx - h * 0.35, J.sy + h * 0.08 + Math.sin(ph) * 2 * u, Math.max(1, 1.5 * u), col); // the arms out
  r.stroke(J.sx, J.sy + h * 0.12, J.sx - h * 0.3, J.sy + h * 0.2, Math.max(1, 1.5 * u), col);
}

const horde = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { walkers: Array.from({ length: 7 }, (_, i) => newUndead(rnd, band, 0.6 + i * 0.09 + rnd() * 0.05)), tool: rollW(rnd, TOOL_W, band), flash: 0, swing: 0, moon: 0.2 + rnd() * 0.2, fire: 0, bottles: [], fires: [] });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s } = W, g = 0.82 * N, bps = f.bpm ? f.bpm / 60 : 2, band = bandOf(W.a), tool = TOOLS[w.tool];
    const standing = () => w.walkers.filter((z) => z.down <= 0 && z.x > 0.3).sort((a, b) => a.x - b.x);
    const hurt = (z, hard) => { // a hit staggers a giant, drops anyone else
      if (--z.hp > 0 && !hard) { z.flash = 0.2; z.x += 0.03; return; }
      z.down = 3; z.hp = 0;
      s.shake = Math.max(s.shake, 0.3);
    };
    for (const hh of hits) {
      if (isLow(hh)) {
        const up = standing();
        if (tool.lob) { // a bottle on an arc toward the thick of them
          const tx = up.length ? up[Math.floor(up.length / 2)].x : 0.7, dx = (tx - 0.17) * N, vx = dx / 1.3, vy = -0.9 * N; // 1.3 s in the air from that height at that throw, so it comes down on the mark
          w.bottles.push({ x: 0.17 * N, y: g - 0.18 * N, vx, vy, spin: 0 });
          w.swing = 1;
        } else if (tool.reach) { w.swing = 1; const near = up.filter((z) => z.x < 0.14 + tool.reach); if (near.length) hurt(near[0], hh.strength > 0.8); }
        else { w.flash = tool.wide ? 0.09 : 0.06; for (const z of up.slice(0, tool.n)) if (!tool.wide || z.x < 0.75) hurt(z, hh.strength > 0.8); }
      } else if (hh.kind === 'snare') w.fire = 1;
    }
    if (f.section === 'drop') { w.tool = 'shotgun'; for (let k = 0; k < 2; k++) w.walkers.push(newUndead(rnd, band, 1.1 + k * 0.15, 'giant')); }
    else if (f.section === 'change') w.tool = rollW(rnd, TOOL_W, band);
    if (w.walkers.length > 11) w.walkers.splice(w.walkers.findIndex((z) => z.down > 0 || z.x > 1), 1);
    w.flash -= dt;
    w.swing -= dt * 4;
    w.fire *= Math.exp(-dt * 2);
    r.disc(w.moon * N, 0.15 * N, 0.07 * N, BRIGHT);
    for (let i = 0; i < 9; i++) r.rect(i * 0.12 * N, 0.3 * N + hash(i, 1) * 0.2 * N, 0.1 * N, g, DARK);
    r.rect(0, g, N, N - g, MID);
    r.rect(0, g, N, Math.max(1, u), LMID);
    r.rect(0.2 * N, g - 0.12 * N, 0.08 * N, 0.12 * N, DARK);
    for (let k = 0; k < 4; k++) r.rect(0.19 * N, g - 0.12 * N + k * 0.03 * N, 0.1 * N, Math.max(1, u), LMID);
    // the survivor and the tool in hand
    const J = walker(r, 0.14 * N, g, 0.22 * N, FIG, 0, 1, { cap: true, hatCol: HOT }), hx = J.sx, hy = J.sy + 0.03 * N;
    if (w.tool === 'bat') { const ang = w.swing > 0 ? lerp(-1.8, 0.5, ease(1 - w.swing)) : -0.9; r.stroke(hx, hy, hx + Math.cos(ang) * 0.12 * N, hy + Math.sin(ang) * 0.12 * N, 2.2 * u, LMID); }
    else if (w.tool === 'molotov') { const ang = w.swing > 0 ? lerp(-2.2, -0.6, ease(1 - w.swing)) : 0.9; r.stroke(hx, hy, hx + Math.cos(ang) * 0.07 * N, hy + Math.sin(ang) * 0.07 * N, 1.5 * u, FIG); if (w.swing <= 0) { r.rect(hx + Math.cos(ang) * 0.07 * N - u, hy + Math.sin(ang) * 0.07 * N - 3 * u, 2 * u, 4 * u, COOL); r.rect(hx + Math.cos(ang) * 0.07 * N - u, hy + Math.sin(ang) * 0.07 * N - 4 * u, 2 * u, Math.max(1, u), HOT); } }
    else { // the guns: the pistol short, the shotgun long with two bores
      const len = w.tool === 'shotgun' ? 0.11 : 0.07, kick = w.flash > 0 ? 2 * u : 0;
      r.stroke(hx, hy + 0.02 * N, hx + len * N, hy - kick, w.tool === 'shotgun' ? 2.5 * u : 1.5 * u, DARK);
      if (w.tool === 'shotgun') r.stroke(hx + 0.03 * N, hy + 0.03 * N, hx + 0.07 * N, hy + 0.02 * N, 1.5 * u, MID);
      if (w.flash > 0) { r.disc(hx + (len + 0.015) * N, hy - kick, (w.tool === 'shotgun' ? 4.5 : 3) * u, BRIGHT); if (w.tool === 'shotgun') r.ring(hx + (len + 0.015) * N, hy - kick, 7 * u, 1.5 * u, HOT); }
    }
    targets.push({ x: 0.09 * N, y: g - 0.22 * N, w: 0.1 * N, h: 0.22 * N });
    w.bottles = w.bottles.filter((b) => { // the bottle flies and tumbles, then burns where it lands
      b.vy += N * 1.6 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.spin += dt * 12;
      r.stroke(b.x - Math.cos(b.spin) * 2 * u, b.y - Math.sin(b.spin) * 2 * u, b.x + Math.cos(b.spin) * 2 * u, b.y + Math.sin(b.spin) * 2 * u, 1.5 * u, COOL);
      r.rect(b.x + Math.cos(b.spin) * 2.5 * u, b.y + Math.sin(b.spin) * 2.5 * u, Math.max(1, u), Math.max(1, u), HOT);
      if (b.y >= g) { w.fires.push({ x: b.x / N, t: 2.5 }); s.shake = Math.max(s.shake, 0.25); return false; }
      return b.x < N;
    });
    w.fires = w.fires.filter((fi) => (fi.t -= dt) > 0);
    for (const fi of w.fires) for (let k = 0; k < 7; k++) r.rect((fi.x + (rnd() - 0.5) * 0.08) * N, g - rnd() * 0.08 * N * Math.min(1, fi.t), 2 * u, 2 * u, k % 2 ? HOT : BRIGHT);
    // the horde, the tall ones first so the small ones stay in front
    w.walkers.sort((a, b) => b.h - a.h);
    for (const z of w.walkers) {
      const K = UNDEAD[z.kind];
      if (z.down > 0) {
        z.down -= dt;
        if (z.down <= 0) Object.assign(z, newUndead(rnd, band, 1.1 + rnd() * 0.2));
        r.rect(z.x * N - z.h * N * 0.35, g - z.h * N * 0.14, z.h * N * 0.7, z.h * N * 0.14, DARK);
        continue;
      }
      const step = dt * 0.036 * bps * K.v;
      z.x -= step;
      z.ph += step / (K.stride * z.h); // the gait in step with the ground: the shamblers at about half the tempo
      z.flash -= dt;
      if (z.x < 0.32) z.x = 0.32 + rnd() * 0.02;
      if (w.fires.some((fi) => Math.abs(fi.x - z.x) < 0.05)) { hurt(z, true); continue; } // walked into the fire
      const x = z.x * N, h = z.h * N;
      r.rect(x - h * 0.3, g, h * 0.6, Math.max(1, u), DARK);
      drawUndead(r, z.kind, x, g, h, z.flash > 0 ? BRIGHT : DARK, z.ph, u);
      targets.push({ x: x - h * 0.3, y: g - h * (K.low || K.bound ? 1.5 : 1), w: h * 0.6, h: h * (K.low || K.bound ? 1.5 : 1) });
    }
    if (w.fire > 0.3) for (let k = 0; k < 8; k++) r.rect(0.75 * N + rnd() * 0.2 * N, g - rnd() * 0.08 * N * w.fire, 2 * u, 2 * u, k % 2 ? HOT : BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- cape
// A caped figure crossing the sky over the city; on a heavy kick it comes down and lands on one knee, the ground
// cracking and a shockwave ring going out; on the snare it takes off again.
const cape = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { x: 0.5, y: 0.15, vy: 0, state: 'fly', tx: 0.5, cracks: [], landT: 0, dir: 1, city: Array.from({ length: 10 }, (_, i) => [i * 0.11 - 0.03, 0.09 + rnd() * 0.04, 0.2 + rnd() * 0.3]) });
  },
  draw(W) {
    const { r, N, u, t, dt, hits, targets, s, w, rnd } = W, g = 0.8 * N;
    for (const hh of hits) {
      if (isLow(hh) && hh.strength > 0.6 && w.state === 'fly') { w.state = 'drop'; w.vy = 0; w.tx = 0.2 + rnd() * 0.6; }
      else if (hh.kind === 'snare' && w.state === 'land') { w.state = 'fly'; w.dir = rnd() < 0.5 ? -1 : 1; }
    }
    for (const [x, bw, bh] of w.city) {
      r.rect(x * N, g - bh * N, bw * N, bh * N, DARK);
      for (let y = g - bh * N + 3 * u; y < g - 3 * u; y += 5 * u) for (let xx = x * N + 2 * u; xx < (x + bw) * N - 2 * u; xx += 4 * u) if (hash(Math.round(xx), Math.round(y)) < 0.3) r.rect(xx, y, Math.max(1, u), 2 * u, LMID);
    }
    r.rect(0, g, N, N - g, MID);
    r.rect(0, g, N, Math.max(1, u), LMID);
    if (w.state === 'fly') {
      w.x += w.dir * dt * 0.15;
      if (w.x > 1.2) w.x = -0.2;
      if (w.x < -0.2) w.x = 1.2;
      w.y = follow(w.y, 0.15 + Math.sin(t * 1.5) * 0.03, dt, 0.4);
    } else if (w.state === 'drop') {
      w.vy += 3 * N * dt;
      w.y += (w.vy * dt) / N;
      w.x = follow(w.x, w.tx, dt, 0.3);
      if (w.y >= (g - 0.1 * N) / N) {
        w.y = (g - 0.1 * N) / N;
        w.state = 'land';
        s.shake = Math.max(s.shake, 0.9);
        w.cracks = Array.from({ length: 7 }, () => ({ a: rnd() * Math.PI, l: 0.06 + rnd() * 0.1 }));
        w.landT = 0;
      }
    }
    const x = w.x * N, y = w.y * N, h = 0.2 * N;
    if (w.state === 'land') {
      w.landT += dt;
      for (const c of w.cracks) r.line(x, g, x + Math.cos(c.a) * c.l * N, g + Math.abs(Math.sin(c.a)) * c.l * 0.4 * N, DARK);
      if (w.landT < 1) r.ring(x, g, (0.1 + w.landT * 0.3) * N, Math.max(1, u), LMID, 0.3);
      r.poly([[x - h * 0.4, g], [x + h * 0.1, g - h * 0.5], [x + h * 0.4, g - h * 0.1]], HOT);
      r.rect(x - h * 0.1, g - h * 0.45, h * 0.2, h * 0.3, FIG);
      r.disc(x + h * 0.05, g - h * 0.52, h * 0.09, FIG);
      r.rect(x + h * 0.15, g - h * 0.3, h * 0.08, h * 0.3, FIG);
      r.rect(x - h * 0.2, g - h * 0.15, h * 0.1, h * 0.15, FIG);
      r.disc(x - h * 0.15, g - 2 * u, 2 * u, FIG);
    } else if (w.state === 'fly') {
      r.poly([[x - h * 0.1 * w.dir, y - h * 0.1], [x - h * 0.8 * w.dir, y - h * 0.3 + Math.sin(t * 9) * 3 * u], [x - h * 0.7 * w.dir, y + h * 0.15 + Math.sin(t * 9 + 1) * 3 * u], [x - h * 0.1 * w.dir, y + h * 0.1]], HOT);
      r.rect(Math.min(x - h * 0.3 * w.dir, x + h * 0.3 * w.dir), y - h * 0.08, h * 0.6, h * 0.16, FIG);
      r.disc(x + h * 0.38 * w.dir, y, h * 0.09, FIG);
      r.rect(Math.min(x + h * 0.45 * w.dir, x + h * 0.7 * w.dir), y - h * 0.04, h * 0.25, h * 0.06, FIG);
    } else {
      r.poly([[x - h * 0.15, y - h * 0.3], [x + h * 0.15, y - h * 0.3], [x + h * 0.3, y + h * 0.7 + Math.sin(t * 9) * 3 * u], [x - h * 0.3, y + h * 0.7]], HOT);
      r.rect(x - h * 0.1, y - h * 0.3, h * 0.2, h * 0.5, FIG);
      r.disc(x, y - h * 0.4, h * 0.1, FIG);
      for (const k of [-1, 1]) r.rect(x + k * h * 0.06 - u, y + h * 0.2, 2 * u, h * 0.35, FIG);
    }
    targets.push({ x: x - h * 0.5, y: y - h * 0.5, w: h, h });
  },
};

// ---------------------------------------------------------------------------------------------- rts
// A base from above: a hall, a barracks, farms, a gold mine, woods across a river, and what else this base has
// built: a windmill turning at the tempo, a smithy that smokes, a stable with a horse, a tower that shoots. Peons
// walk their rounds and the resource bars grow; a kick trains the next unit into the formation (footmen, archers,
// cavalry, a siege engine), a snare sends raiders of the other faction over the bridge, a note moves the selection
// box; the far side sits in fog that the harmony lifts. Archers and engines shoot across on arcs, cavalry charges.
// A section change changes what the barracks trains or who raids, a drop is a siege engine and a big raid.
const UNITS = {
  footman: { v: 1, hp: 2, size: 0.07 }, // a hat and a shield, holds the line
  archer: { v: 1, hp: 1, size: 0.065, range: 0.22 }, // a cap and a bow, shoots across
  cavalry: { v: 2.2, hp: 3, size: 0.08, charge: true }, // on horseback, charges whatever comes close
  siege: { v: 0.45, hp: 4, size: 0.08, range: 0.32, splash: true }, // a cart with an arm that lobs a boulder
};
const UNIT_W = { footman: [3, 2, 1], archer: [2, 2, 2], cavalry: [1, 2, 3], siege: [0, 1, 2] };
// the raiders' factions: how they dress and what they send over
const FACTIONS = {
  clan: { dress: { coat: true }, send: ['footman', 'footman', 'archer'] },
  riders: { dress: { cap: true }, send: ['cavalry', 'footman', 'cavalry'] },
  legion: { dress: { hat: true }, send: ['footman', 'archer', 'siege'] },
  wild: { dress: {}, send: ['footman', 'cavalry', 'footman', 'footman'] },
};
const FACTION_W = { clan: [3, 2, 1], legion: [2, 2, 2], riders: [1, 2, 3], wild: [2, 2, 2] };
const BLD_W = { windmill: [3, 2, 1], smithy: [2, 2, 1], stable: [1, 2, 2], tower: [1, 2, 3] };

// a unit at (x, y) in cells, facing dir
function drawUnit(r, kind, x, y, sz, col, dir, ph, dress, u) {
  if (kind === 'cavalry') { // the horse, four legs, the rider up top
    r.ring(x, y - sz * 0.35, sz * 0.2, sz * 0.4, col, 0.5);
    for (const k of [-0.35, -0.2, 0.2, 0.35]) r.rect(x + k * sz - u * 0.5 + Math.sin(ph + k * 9) * u, y - sz * 0.3, Math.max(1, u), sz * 0.3, col);
    r.rect(x + dir * sz * 0.45, y - sz * 0.6, 3 * u, 3 * u, col);
    walker(r, x, y - sz * 0.45, sz * 0.6, col, 0, dir, dress);
    return;
  }
  if (kind === 'siege') { // a cart, two wheels, the arm with its stone
    r.rect(x - sz * 0.5, y - sz * 0.4, sz, sz * 0.25, MID);
    for (const k of [-0.3, 0.3]) r.ring(x + k * sz, y - sz * 0.15, sz * 0.14, Math.max(1, u), DARK);
    const a = -1.3 - 0.9 * Math.max(0, Math.sin(ph)), ex = x - dir * sz * 0.2 + dir * Math.cos(a) * sz * 0.8, ey = y - sz * 0.4 + Math.sin(a) * sz * 0.8;
    r.stroke(x - dir * sz * 0.2, y - sz * 0.4, ex, ey, Math.max(1, u), DARK);
    r.disc(ex, ey, 1.5 * u, col);
    return;
  }
  walker(r, x, y, sz, col, ph, dir, dress);
  if (kind === 'archer') r.ring(x + dir * sz * 0.3, y - sz * 0.5, sz * 0.25, Math.max(1, u * 0.7), LMID);
  else r.rect(x + dir * sz * 0.25 - u, y - sz * 0.5, 2 * u, sz * 0.3, LMID);
}

const rts = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), blds = [];
    for (const [x, y] of [[0.1, 0.45], [0.52, 0.63]]) { let kind = rollW(rnd, BLD_W, band); if (blds.some((b) => b.kind === kind)) kind = Object.keys(BLD_W).find((q) => !blds.some((b) => b.kind === q)); blds.push({ kind, x, y }); }
    Object.assign(w, { peons: Array.from({ length: 4 }, (_, i) => ({ x: 0.3, y: 0.57, carry: 0, job: i % 2, ph: rnd() * TAU })), army: [], enemies: [], gold: 0, wood: 0, blds, train: rollW(rnd, UNIT_W, band), foe: rollW(rnd, FACTION_W, band),
      trees: Array.from({ length: 14 }, () => [0.72 + rnd() * 0.24, 0.12 + rnd() * 0.5]), sel: { x: 0.3, y: 0.5, t: 0 }, sparks: [], shots: [], smoke: [], fog: 1, raid: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bps = f.bpm ? f.bpm / 60 : 2, band = bandOf(W.a), hall = [0.3, 0.55], mine = [0.12, 0.2], barracks = [0.5, 0.75];
    const trainUnit = (kind) => { w.army.push({ x: barracks[0] + 0.05, y: barracks[1], tx: 0.5 + (w.army.length % 4) * 0.05, ty: 0.38 + Math.floor(w.army.length / 4) * 0.05, kind, hp: UNITS[kind].hp, flash: 0, ph: 0 }); if (w.army.length > 12) w.army.shift(); };
    const sendRaid = (n) => { const F = FACTIONS[w.foe]; for (let k = 0; k < n; k++) { const kind = F.send[w.raid++ % F.send.length]; w.enemies.push({ x: 1.05 + rnd() * 0.1, y: 0.1 + rnd() * 0.3, kind, hp: UNITS[kind].hp, flash: 0, ph: rnd() * TAU }); } };
    const shoot = (from, tg, side, rock) => w.shots.push({ x0: from.x, y0: from.y, x1: tg.x, y1: tg.y, t: 0, kind: rock ? 'rock' : 'arrow', tg, side });
    for (const hh of hits) {
      if (isLow(hh)) trainUnit(w.train);
      else if (hh.kind === 'snare' && w.enemies.length < 10) sendRaid(3);
      else if (isTonal(hh)) w.sel = { x: 0.1 + rnd() * 0.8, y: 0.1 + rnd() * 0.8, t: 0.5 };
    }
    if (f.section === 'drop') { trainUnit('siege'); sendRaid(6); }
    else if (f.section === 'change') { if (rnd() < 0.5) w.train = rollW(rnd, UNIT_W, band); else w.foe = rollW(rnd, FACTION_W, band); }
    w.fog = follow(w.fog, clamp(1 - f.tonalAvg * 1.2 - f.level * 0.3), dt, 3);
    r.fill(LMID);
    for (let y = 0; y < N; y += 3 * u) for (let x = 0; x < N; x += 3 * u) if (hash(x, y) < 0.08) r.rect(x, y, Math.max(1, u), Math.max(1, u), MID);
    for (let y = 0; y < N; y++) r.rect(0.6 * N + Math.sin(y * 0.08) * 0.03 * N, y, 0.05 * N, 1, (y + Math.floor(t * 8)) % 7 ? COOL : BRIGHT);
    r.rect(0.57 * N, 0.5 * N, 0.11 * N, 3 * u, MID);
    for (const [tx, ty] of w.trees) { r.disc(tx * N, ty * N, 3 * u, DARK); r.disc(tx * N - u, ty * N - u, 2 * u, MID); }
    r.poly([[mine[0] * N - 7 * u, mine[1] * N + 5 * u], [mine[0] * N, mine[1] * N - 5 * u], [mine[0] * N + 7 * u, mine[1] * N + 5 * u]], DARK);
    r.rect(mine[0] * N - 2 * u, mine[1] * N, 4 * u, 5 * u, BLACK);
    r.rect(mine[0] * N - u, mine[1] * N - 2 * u, 2 * u, 2 * u, HOT);
    const bld = (x, y, wd, ht, col) => { r.rect(x * N - wd / 2, y * N - ht, wd, ht, col); r.poly([[x * N - wd / 2 - u, y * N - ht], [x * N + wd / 2 + u, y * N - ht], [x * N, y * N - ht - wd * 0.4]], DARK); r.rect(x * N - u, y * N - ht * 0.5, 2 * u, ht * 0.5, BLACK); };
    bld(hall[0], hall[1], 0.14 * N, 0.1 * N, MID);
    r.rect(hall[0] * N - u, hall[1] * N - 0.17 * N, Math.max(1, u), 0.07 * N, DARK);
    r.rect(hall[0] * N, hall[1] * N - 0.17 * N, 3 * u, 2 * u, f.beat.pulse > 0.4 ? HOT : HOT + DIM);
    bld(barracks[0], barracks[1], 0.1 * N, 0.08 * N, DARK);
    for (const [fx, fy] of [[0.15, 0.75], [0.25, 0.85], [0.4, 0.9]]) { bld(fx, fy, 0.06 * N, 0.04 * N, MID); for (let k = 0; k < 4; k++) r.rect(fx * N - 0.03 * N + k * 0.016 * N, fy * N + 2 * u, Math.max(1, u), 3 * u, HOT + DIM); }
    for (const b of w.blds) { // what this base has built
      const bx = b.x * N, by = b.y * N;
      if (b.kind === 'windmill') { bld(b.x, b.y, 0.05 * N, 0.09 * N, MID); const a = f.rel.midClock * 0.6 + t * 0.4; for (let k = 0; k < 4; k++) r.stroke(bx, by - 0.1 * N, bx + Math.cos(a + (k * TAU) / 4) * 0.06 * N, by - 0.1 * N + Math.sin(a + (k * TAU) / 4) * 0.06 * N, 1.5 * u, LMID); }
      else if (b.kind === 'smithy') { bld(b.x, b.y, 0.08 * N, 0.05 * N, DARK); r.rect(bx + 0.02 * N, by - 0.09 * N, 2 * u, 0.04 * N, DARK); r.rect(bx - 0.02 * N, by - 0.02 * N, 2 * u, 2 * u, Math.floor(t * 10) % 2 ? HOT : BRIGHT); if (rnd() < dt * 4) w.smoke.push({ x: bx + 0.02 * N + u, y: by - 0.09 * N, life: 1.5 }); }
      else if (b.kind === 'stable') { bld(b.x, b.y, 0.1 * N, 0.04 * N, MID); for (let k = 0; k < 4; k++) r.rect(bx - 0.05 * N + k * 0.03 * N, by + u, Math.max(1, u), 3 * u, DARK); r.rect(bx - 0.05 * N, by + 2 * u, 0.1 * N, Math.max(1, u), DARK); r.ring(bx + 0.03 * N, by + 0.03 * N, 1.5 * u, 2.5 * u, DARK, 0.5); }
      else { r.rect(bx - 2.5 * u, by - 0.12 * N, 5 * u, 0.12 * N, DARK); for (let k = 0; k < 3; k++) r.rect(bx - 3 * u + k * 2.5 * u, by - 0.13 * N, 1.5 * u, 1.5 * u, DARK); r.rect(bx + 2.5 * u, by - 0.15 * N, Math.max(1, u), 3 * u, DARK); r.rect(bx + 3 * u, by - 0.15 * N, 3 * u, 2 * u, HOT); }
    }
    w.smoke = w.smoke.filter((p) => { p.y -= dt * 5 * u; p.x += Math.sin(t * 2 + p.y) * dt * 3 * u; p.life -= dt; r.rect(p.x, p.y, Math.max(1, u), Math.max(1, u), LMID + DIM); return p.life > 0; });
    for (const p of w.peons) {
      const goal = p.carry ? hall : p.job ? w.trees[0] : mine, tx = goal[0] + (p.job ? -0.03 : 0.03), ty = goal[1] + 0.02, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), sp = dt * 0.06 * bps;
      if (d < 0.01) { if (p.carry) { p.carry = 0; if (p.job) w.wood++; else w.gold++; } else p.carry = 1; }
      else { const mv = Math.min(sp, d); p.x += (dx / d) * mv; p.y += (dy / d) * mv; p.ph += mv / (0.1 * 0.06); } // the legs in step with the travel
      walker(r, p.x * N, p.y * N, 0.06 * N, FIG, p.ph, dx >= 0 ? 1 : -1, {});
      if (p.carry) r.rect(p.x * N + 2 * u, p.y * N - 0.06 * N, 2 * u, 2 * u, p.job ? MID : HOT);
    }
    // the army holds its formation; archers and engines shoot at what comes in range, cavalry rides out to meet it
    for (const un of w.army) {
      const K = UNITS[un.kind];
      let near = null, nd = 1;
      for (const e of w.enemies) { const d = Math.hypot(e.x - un.x, e.y - un.y); if (d < nd) { nd = d; near = e; } }
      if (K.charge && near && nd < 0.3 && nd > 0.05) { un.x += ((near.x - un.x) / nd) * dt * 0.05 * bps * K.v; un.y += ((near.y - un.y) / nd) * dt * 0.05 * bps * K.v; un.ph += dt * 14; }
      else { un.x = follow(un.x, un.tx, dt, 0.5 / K.v); un.y = follow(un.y, un.ty, dt, 0.5 / K.v); }
      if (K.range && near && nd < K.range && f.beat.on && f.beat.count % (K.splash ? 4 : 2) === 0) { shoot(un, near, 1, K.splash); un.ph = 0; }
      if (K.splash) un.ph += dt * 4;
    }
    const tower = w.blds.find((b) => b.kind === 'tower');
    if (tower && f.beat.on) { const e = w.enemies.find((q) => Math.hypot(q.x - tower.x, q.y - tower.y) < 0.3); if (e) shoot({ x: tower.x, y: tower.y - 0.12 }, e, 1, false); }
    for (const e of w.enemies) {
      const K = UNITS[e.kind], tg = w.army[0] || { x: hall[0], y: hall[1] }, dx = tg.x - e.x, dy = tg.y - e.y, d = Math.hypot(dx, dy) || 1, stop = K.range ? K.range * 0.9 : 0.06;
      const mv = d > stop ? dt * 0.05 * bps * K.v : 0;
      e.ph += e.kind === 'footman' || e.kind === 'archer' ? mv / (0.1 * K.size) : dt * 8 * K.v; // the walkers' legs in step with the travel; the horse and the engine keep their own time
      if (mv) { e.x += (dx / d) * mv; e.y += (dy / d) * mv; }
      else if (f.beat.on) {
        if (K.range) shoot(e, tg, -1, K.splash);
        else { if (tg.hp !== undefined) { tg.hp -= K.charge ? 2 : 1; tg.flash = 0.2; } e.hp--; e.flash = 0.2; burst(w.sparks, rnd, ((e.x + tg.x) / 2) * N, ((e.y + tg.y) / 2) * N, 6, N * 0.3, BRIGHT, 0.3); s.shake = Math.max(s.shake, 0.15); }
      }
    }
    w.shots = w.shots.filter((sh) => { // arrows on a low arc, boulders on a high one with a shadow underneath
      sh.t += dt * (sh.kind === 'rock' ? 1.4 : 2.5);
      const k = Math.min(1, sh.t), x = lerp(sh.x0, sh.x1, k) * N, gy = lerp(sh.y0, sh.y1, k) * N, y = gy - Math.sin(k * Math.PI) * (sh.kind === 'rock' ? 0.14 : 0.06) * N;
      if (sh.kind === 'rock') { r.rect(x - u, gy, 2 * u, Math.max(1, u), DARK + DIM); r.disc(x, y, 1.8 * u, DARK); }
      else { const a = Math.atan2(sh.y1 - sh.y0, sh.x1 - sh.x0); r.line(x - Math.cos(a) * 2 * u, y - Math.sin(a) * 2 * u, x + Math.cos(a) * 2 * u, y + Math.sin(a) * 2 * u, BRIGHT); }
      if (k < 1) return true;
      const victims = sh.side > 0 ? w.enemies : w.army;
      if (sh.kind === 'rock') { for (const v of victims) if (Math.hypot(v.x - sh.x1, v.y - sh.y1) < 0.06) { v.hp--; v.flash = 0.2; } burst(w.sparks, rnd, sh.x1 * N, sh.y1 * N, 10, N * 0.3, MID, 0.4); s.shake = Math.max(s.shake, 0.2); }
      else if (victims.includes(sh.tg)) { sh.tg.hp--; sh.tg.flash = 0.2; }
      return false;
    });
    w.army = w.army.filter((un) => un.hp > 0);
    w.enemies = w.enemies.filter((e) => e.hp > 0);
    const dressOf = (kind) => (kind === 'archer' ? { cap: true } : { hat: true });
    for (const un of w.army) { un.flash -= dt; const sz = UNITS[un.kind].size * N; drawUnit(r, un.kind, un.x * N, un.y * N, sz, un.flash > 0 ? BRIGHT : FIG, -1, un.ph, dressOf(un.kind), u); targets.push({ x: un.x * N - sz * 0.5, y: un.y * N - sz, w: sz, h: sz }); }
    for (const e of w.enemies) { e.flash -= dt; const sz = UNITS[e.kind].size * N; drawUnit(r, e.kind, e.x * N, e.y * N, sz, e.flash > 0 ? BRIGHT : HOT, 1, e.ph, FACTIONS[w.foe].dress, u); targets.push({ x: e.x * N - sz * 0.5, y: e.y * N - sz, w: sz, h: sz }); }
    w.sparks = particles(W, w.sparks, BRIGHT);
    if ((w.sel.t -= dt) > 0) { r.frame(Math.round(w.sel.x * N - 5 * u), Math.round(w.sel.y * N - 5 * u), Math.round(10 * u), Math.round(10 * u), BRIGHT); r.rect(w.sel.x * N - u, w.sel.y * N - 8 * u, Math.max(1, u), 4 * u, BRIGHT); r.rect(w.sel.x * N, w.sel.y * N - 8 * u, 3 * u, 2 * u, HOT); }
    for (let y = 0; y < 0.5 * N; y++) for (let x = Math.round(0.7 * N); x < N; x++) if (hash(x, y) < w.fog * 0.8) r.set(x, y, DARK + DIM);
    r.rect(0.78 * N, 0.78 * N, 0.2 * N, 0.2 * N, BLACK);
    r.frame(Math.round(0.78 * N), Math.round(0.78 * N), Math.round(0.2 * N), Math.round(0.2 * N), LMID);
    for (const un of w.army) r.set(0.78 * N + un.x * 0.2 * N, 0.78 * N + un.y * 0.2 * N, FIG);
    for (const e of w.enemies) r.set(0.78 * N + e.x * 0.2 * N, 0.78 * N + e.y * 0.2 * N, HOT);
    r.rect(0.78 * N + hall[0] * 0.2 * N - u, 0.78 * N + hall[1] * 0.2 * N - u, 2 * u, 2 * u, BRIGHT);
    r.rect(0, 0, N, 0.05 * N, DARK);
    for (let k = 0; k < Math.min(20, w.gold); k++) r.rect(0.02 * N + k * 2 * u, 1.5 * u, Math.max(1, u), 3 * u, HOT);
    for (let k = 0; k < Math.min(20, w.wood); k++) r.rect(0.5 * N + k * 2 * u, 1.5 * u, Math.max(1, u), 3 * u, MID);
    Object.keys(UNITS).forEach((k, i) => r.rect(0.86 * N + i * 3 * u, 1.5 * u, 2 * u, 3 * u, k === w.train ? BRIGHT : MID)); // which unit the barracks trains next
  },
};

// ---------------------------------------------------------------------------------------------- barrier
// A dark valley under a magic dome whose blue fire crawls where the notes land; a camp with a fire and huts, an
// ore vein glinting on the hats, a figure with a two-handed blade that swings on the kick at the low long beasts
// that lunge on the snare; a drop sets the whole dome alight.
function newBeast(rnd) {
  return { x: 0.9 + rnd() * 0.3, hp: 2 + Math.floor(rnd() * 2), flash: 0, lunge: 0, dead: 0 };
}

const barrier = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { hero: { x: 0.35, swing: 0 }, beasts: [newBeast(rnd), newBeast(rnd)], crawl: [], camp: 0.72 + rnd() * 0.1, trees: Array.from({ length: 9 }, (_, i) => [i * 0.12 + rnd() * 0.05, 0.3 + rnd() * 0.25]), flash: 0, ore: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, g = 0.82 * N, Hr = w.hero;
    for (const hh of hits) {
      if (isLow(hh)) { Hr.swing = 1; const b = w.beasts.find((bb) => Math.abs(bb.x - Hr.x) < 0.14 && bb.hp > 0); if (b) { b.hp -= hh.strength > 0.8 ? 2 : 1; b.flash = 0.2; b.x += 0.03; s.shake = Math.max(s.shake, 0.25); } }
      else if (hh.kind === 'snare') { for (const b of w.beasts) if (b.hp > 0) b.lunge = 1; }
      else if (isTonal(hh)) w.crawl.push({ a: 0.1 + rnd() * 0.8, t: 0 });
      else if (hh.kind === 'hat') w.ore = 0.3;
    }
    if (f.section === 'drop') w.flash = 0.3;
    Hr.swing -= dt * 3;
    w.flash -= dt;
    w.ore -= dt;
    for (let k = 0; k < 30; k++) r.set(hash(k, 1) * N, hash(k, 2) * 0.5 * N, LMID);
    const dome = (x) => 0.55 * N - Math.sqrt(Math.max(0, 1 - ((x / N - 0.5) * 1.6) ** 2)) * 0.5 * N;
    for (let x = 0; x < N; x += 2) { const y = dome(x); if (y > 0) r.rect(x, y, 1, Math.max(1, u), w.flash > 0 ? BRIGHT : COOL); }
    w.crawl = w.crawl.filter((c) => { c.t += dt * 2; const x = c.a * N, y = dome(x); if (y <= 0) return false; for (let k = 0; k < 5; k++) r.rect(x + (hash(k, Math.floor(t * 20)) - 0.5) * 8 * u, y + k * 2 * u * (1 - c.t), Math.max(1, u), 2 * u, COOL); return c.t < 1; });
    if (w.flash > 0) for (let x = 0; x < N; x += 6 * u) { const y = dome(x); if (y > 0) r.stroke(x, y, x + (rnd() - 0.5) * 6 * u, y + 0.1 * N, Math.max(1, u), BRIGHT); }
    for (const [tx, th] of w.trees) { const X = tx * N, top = g - th * N; r.rect(X - 1.5 * u, top, 3 * u, g - top, DARK); r.poly([[X - 0.06 * N, top + 0.1 * N], [X, top - 0.05 * N], [X + 0.06 * N, top + 0.1 * N]], DARK); r.poly([[X - 0.05 * N, top + 0.03 * N], [X, top - 0.1 * N], [X + 0.05 * N, top + 0.03 * N]], DARK); }
    r.rect(0, g, N, N - g, DARK + DIM);
    r.rect(0, g, N, Math.max(1, u), MID);
    const cx = w.camp * N;
    for (const k of [-1, 1]) { r.rect(cx + k * 0.1 * N - 0.04 * N, g - 0.08 * N, 0.08 * N, 0.08 * N, DARK); r.poly([[cx + k * 0.1 * N - 0.05 * N, g - 0.08 * N], [cx + k * 0.1 * N, g - 0.13 * N], [cx + k * 0.1 * N + 0.05 * N, g - 0.08 * N]], DARK); }
    for (let y = Math.round(g - 0.4 * N); y < g; y += 2) { const d = (y - (g - 0.4 * N)) / (0.4 * N); if (hash(y, 9) < 0.5) r.rect(cx - d * 0.2 * N, y, d * 0.4 * N, 1, HOT + DIM); }
    for (let k = 0; k < 4; k++) r.rect(cx - 3 * u + (rnd() - 0.5) * 3 * u, g - 2 * u - k * 2 * u - rnd() * 2 * u, 3 * u, 2 * u, k < 2 ? HOT : BRIGHT);
    r.rect(cx - 4 * u, g - u, 8 * u, Math.max(1, u), DARK);
    r.rect(0.05 * N, g - 0.05 * N, 0.06 * N, 0.05 * N, MID);
    r.rect(0.07 * N, g - 0.03 * N, 2 * u, 2 * u, w.ore > 0 ? BRIGHT : COOL + DIM);
    const hx = Hr.x * N, hh2 = 0.26 * N, J = walker(r, hx, g, hh2, FIG, 0.2 * Math.sin(t * 3), 1, {});
    const sa = Hr.swing > 0 ? lerp(-1.6, 0.8, ease(1 - Hr.swing)) : -1.1, sl = hh2 * 0.7;
    r.stroke(J.sx, J.sy + hh2 * 0.3, J.sx + Math.cos(sa) * sl, J.sy + hh2 * 0.3 + Math.sin(sa) * sl, Math.max(1, 1.5 * u), BRIGHT);
    r.rect(J.sx - 2 * u, J.sy + hh2 * 0.28, 4 * u, Math.max(1, u), HOT);
    targets.push({ x: hx - hh2 * 0.25, y: g - hh2, w: hh2 * 0.5, h: hh2 });
    for (const b of w.beasts) {
      if (b.hp <= 0) { b.dead += dt; r.rect(b.x * N - 0.06 * N, g - 3 * u, 0.12 * N, 3 * u, DARK); if (b.dead > 2) Object.assign(b, newBeast(rnd)); continue; }
      b.flash -= dt;
      b.lunge = Math.max(0, b.lunge - dt * 3);
      b.x = follow(b.x, Hr.x + 0.16, dt, 1.5) - b.lunge * 0.04;
      const bx = b.x * N, col = b.flash > 0 ? BRIGHT : MID, Lb = 0.14 * N;
      r.ring(bx, g - Lb * 0.25, Lb * 0.25, Lb * 0.3, col, 0.5);
      r.disc(bx - Lb * 0.45, g - Lb * 0.4, Lb * 0.14, col);
      r.poly([[bx - Lb * 0.55, g - Lb * 0.38], [bx - Lb * 0.75, g - Lb * 0.3], [bx - Lb * 0.55, g - Lb * 0.28]], col);
      r.poly([[bx + Lb * 0.3, g - Lb * 0.25], [bx + Lb * 0.7, g - Lb * 0.5], [bx + Lb * 0.55, g - Lb * 0.15]], col);
      for (const k of [-0.25, -0.1, 0.1, 0.25]) r.rect(bx + k * Lb - u, g - Lb * 0.1, 2 * u, Lb * 0.1, col);
      r.rect(bx - Lb * 0.5, g - Lb * 0.44, Math.max(1, u), Math.max(1, u), HOT);
      targets.push({ x: bx - Lb * 0.7, y: g - Lb * 0.6, w: Lb * 1.4, h: Lb * 0.6 });
    }
  },
};

// ---------------------------------------------------------------------------------------------- hex battlefield
// Two armies of creature stacks on a field of hexes, a hero on horseback at each side. The ground is drawn hex
// by hex: grass, forest that hides a stack and takes half the arrows, water and rock nobody crosses, mud that ends
// a move, lava that burns whoever stands in it. The turn goes round the stacks one per beat, each kind in its way:
// swordsmen walk up and strike, archers loose arrows across, beasts pounce two hexes, knights charge and hit for
// two, mages send a line of sparks, giants hit the target and its neighbour, wyverns fly over whatever is in the
// way; pips under each stack are how many are left. A drop is the hero's spell down the middle and a giant for
// the side that is losing; a section change brings a fresh stack.
const TROOPS = {
  swordsman: { n: [4, 8], melee: 1 }, // a hat and a sword, walks up and strikes
  archer: { n: [3, 6], arrow: true }, // a cap and a bow, looses across the field
  beast: { n: [2, 5], melee: 1, pounce: true }, // low and long, leaps two hexes
  knight: { n: [2, 4], melee: 2, charge: true }, // on horseback with a lance, charges, hits for two
  mage: { n: [1, 3], bolt: true }, // a pointed hat and a staff, a line of sparks that hits twice
  giant: { n: [1, 2], melee: 2, splash: true }, // head and shoulders over the rest, the target and its neighbour
  wyvern: { n: [1, 3], melee: 1, fly: true }, // wings, over everything in the way
};
const TROOP_W = { swordsman: [3, 2, 2], archer: [2, 2, 2], mage: [2, 2, 1], beast: [1, 2, 3], knight: [1, 2, 3], wyvern: [1, 2, 2], giant: [0, 1, 2] };
const TERR_W = { grass: [5, 5, 4], forest: [2, 2, 1], mud: [1, 1, 1], water: [1, 1, 1], rock: [1, 1, 2], lava: [0, 1, 2] };

// a stack's creature at (cx, cy), facing dir
function drawTroop(r, kind, cx, cy, sz, col, dir, t, ph, u) {
  switch (kind) {
    case 'archer': walker(r, cx, cy + sz * 0.5, sz * 0.9, col, 0, dir, { cap: true }); r.ring(cx + dir * sz * 0.25, cy, sz * 0.28, Math.max(1, u * 0.7), LMID); break;
    case 'beast': r.ring(cx, cy + sz * 0.1, sz * 0.3, sz * 0.3, col, 0.5); r.disc(cx + dir * sz * 0.4, cy - sz * 0.05, sz * 0.18, col); r.poly([[cx - dir * sz * 0.3, cy], [cx - dir * sz * 0.7, cy - sz * 0.4], [cx - dir * sz * 0.6, cy + sz * 0.1]], col); break;
    case 'knight':
      r.ring(cx, cy + sz * 0.2, sz * 0.22, sz * 0.4, col, 0.5);
      for (const k of [-0.35, -0.15, 0.15, 0.35]) r.rect(cx + k * sz - u * 0.5, cy + sz * 0.3, Math.max(1, u), sz * 0.25, col);
      r.rect(cx + dir * sz * 0.45, cy - sz * 0.05, 3 * u, 3 * u, col);
      walker(r, cx, cy + sz * 0.05, sz * 0.55, col, 0, dir, { hat: true });
      r.line(cx + dir * sz * 0.1, cy - sz * 0.25, cx + dir * sz * 0.75, cy + sz * 0.1, LMID);
      break;
    case 'mage': {
      const J = walker(r, cx, cy + sz * 0.5, sz * 0.9, col, 0, dir, {});
      r.poly([[cx - sz * 0.25, J.top + sz * 0.02], [cx + sz * 0.25, J.top + sz * 0.02], [cx, J.top - sz * 0.35]], col);
      r.line(J.sx, J.sy, J.sx + dir * sz * 0.2, J.sy - sz * 0.55, DARK);
      r.disc(J.sx + dir * sz * 0.2, J.sy - sz * 0.6, 1.5 * u, COOL);
      break;
    }
    case 'giant': {
      const J = walker(r, cx, cy + sz * 0.6, sz * 1.6, col, 0.2 * Math.sin(t * 3 + ph), dir, { coat: true });
      r.stroke(J.sx, J.sy, J.sx - dir * sz * 0.2, J.sy - sz * 0.7, 2 * u, DARK);
      r.disc(J.sx - dir * sz * 0.2, J.sy - sz * 0.7, 2.5 * u, DARK);
      break;
    }
    case 'wyvern': {
      const flap = Math.sin(t * 8 + ph) * sz * 0.3;
      for (const k of [-1, 1]) r.poly([[cx, cy - sz * 0.2], [cx + k * sz * 0.6, cy - sz * 0.5 - flap], [cx + k * sz * 0.45, cy]], col);
      r.ring(cx, cy, sz * 0.12, sz * 0.24, col, 0.6);
      r.disc(cx + dir * sz * 0.3, cy - sz * 0.3, sz * 0.12, col);
      r.poly([[cx + dir * sz * 0.35, cy - sz * 0.35], [cx + dir * sz * 0.6, cy - sz * 0.3], [cx + dir * sz * 0.35, cy - sz * 0.2]], col);
      break;
    }
    default: walker(r, cx, cy + sz * 0.5, sz, col, 0.3 * Math.sin(t * 4 + ph), dir, { hat: true }); r.rect(cx + dir * sz * 0.25 - u, cy - sz * 0.1, 2 * u, sz * 0.5, LMID);
  }
}

const hexbattle = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), cols = 7, rows = 7, terr = [];
    for (let rw = 0; rw < rows; rw++) for (let c = 0; c < cols; c++) terr.push(c === 0 || c === cols - 1 ? 'grass' : rollW(rnd, TERR_W, band));
    const mk = (side) => Array.from({ length: 4 }, (_, i) => { const kind = rollW(rnd, TROOP_W, band), [lo, hi] = TROOPS[kind].n; return { side, row: i * 2, col: side < 0 ? 0 : 6, n: lo + Math.floor(rnd() * (hi - lo + 1)), kind, flash: 0, dx: 0, dy: 0, lift: 0 }; });
    Object.assign(w, { A: mk(-1), B: mk(1), terr, turn: 0, arrows: [], bolts: [], spell: 0, tick: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, cols = 7, rows = 7, hr = N / (cols * 1.95), hw = Math.sqrt(3) * hr, band = bandOf(W.a);
    const x0 = (N - (cols + 0.5) * hw) / 2 + hw / 2, y0 = 0.16 * N + hr, hexX = (c, rw) => x0 + (c + (rw % 2) * 0.5) * hw, hexY = (rw) => y0 + rw * 1.5 * hr;
    const cube = (c, rw) => { const x = c - (rw - (rw & 1)) / 2; return [x, -x - rw, rw]; };
    const dist = (a, b) => { const [ax, ay, az] = cube(a.col, a.row), [bx, by, bz] = cube(b.col, b.row); return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz)); };
    const NB = (rw) => (rw & 1 ? [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]] : [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]]);
    const all = [...w.A, ...w.B].filter((st) => st.n > 0);
    const at = (c, rw) => all.find((st) => st.col === c && st.row === rw);
    const terrAt = (c, rw) => w.terr[rw * cols + c];
    const passable = (c, rw, fly) => c >= 0 && rw >= 0 && c < cols && rw < rows && !at(c, rw) && (fly || (terrAt(c, rw) !== 'water' && terrAt(c, rw) !== 'rock'));
    r.rect(0, 0.08 * N, N, 0.84 * N, MID);
    for (let rw = 0; rw < rows; rw++)
      for (let c = 0; c < cols; c++) {
        const cx = hexX(c, rw), cy = hexY(rw), k = terrAt(c, rw), pts = Array.from({ length: 6 }, (_, i) => [cx + hr * 0.95 * Math.cos((i / 6) * TAU + Math.PI / 6), cy + hr * 0.95 * Math.sin((i / 6) * TAU + Math.PI / 6)]);
        if (k === 'water') { r.poly(pts, COOL + DIM); for (let i = 0; i < 2; i++) r.rect(cx - hr * 0.4 + ((t * 0.3 + i * 0.5) % 1) * hr * 0.5, cy - hr * 0.3 + i * hr * 0.4, hr * 0.3, 1, COOL); }
        else if (k === 'mud') r.poly(pts, MID + DIM);
        else if (k === 'lava') { r.poly(pts, HOT + DIM); for (let i = 0; i < 3; i++) r.rect(cx + (hash(c * 7 + i, rw) - 0.5) * hr, cy + (hash(i, rw * 5 + c) - 0.5) * hr, 2 * u, Math.max(1, u), Math.floor(t * 8 + i + c) % 3 ? HOT : BRIGHT); }
        for (let i = 0; i < 6; i++) r.line(...pts[i], ...pts[(i + 1) % 6], DARK + DIM);
        if (k === 'forest') for (const [dx, dy] of [[-0.35, 0.15], [0.3, 0.25], [0, -0.3]]) { r.disc(cx + dx * hr, cy + dy * hr, hr * 0.26, DARK); r.set(cx + dx * hr - u, cy + dy * hr - u, LMID + DIM); }
        else if (k === 'rock') { r.disc(cx, cy + hr * 0.1, hr * 0.5, DARK); r.disc(cx - hr * 0.2, cy - hr * 0.1, hr * 0.3, DARK); }
      }
    // the turn: whoever is up moves and strikes in its own way
    if ((beatLocked(f) ? f.beat.on : (w.tick += dt) > 0.5) && all.length) {
      w.tick = 0;
      const st = all[w.turn % all.length], K = TROOPS[st.kind], foes = (st.side < 0 ? w.B : w.A).filter((e) => e.n > 0);
      w.turn++;
      const strike = (v, dmg) => { v.flash = 0.3; v.n = Math.max(0, v.n - dmg); s.shake = Math.max(s.shake, 0.2); };
      if (foes.length) {
        const tg = foes.sort((a, b) => dist(st, a) - dist(st, b))[0], sx = hexX(st.col, st.row), sy = hexY(st.row), tx = hexX(tg.col, tg.row), ty = hexY(tg.row);
        if (K.arrow) w.arrows.push({ x0: sx, y0: sy, x1: tx, y1: ty, t: 0, tg, half: terrAt(tg.col, tg.row) === 'forest' });
        else if (K.bolt) { w.bolts.push({ x0: sx, y0: sy, x1: tx, y1: ty, t: 0 }); strike(tg, 2); }
        else {
          let steps = K.charge || K.pounce || K.fly ? 2 : 1;
          while (steps-- > 0 && dist(st, tg) > 1) {
            const opts = NB(st.row).map(([dc, dr]) => [st.col + dc, st.row + dr]).filter(([c, rw]) => passable(c, rw, K.fly)).sort((p, q) => dist({ col: p[0], row: p[1] }, tg) - dist({ col: q[0], row: q[1] }, tg));
            if (!opts.length || dist({ col: opts[0][0], row: opts[0][1] }, tg) >= dist(st, tg)) break;
            st.dx += hexX(st.col, st.row) - hexX(opts[0][0], opts[0][1]); st.dy += hexY(st.row) - hexY(opts[0][1]); // slides in from where it was
            st.col = opts[0][0]; st.row = opts[0][1];
            if (K.pounce || K.fly) st.lift = 1;
            if (terrAt(st.col, st.row) === 'mud' && !K.fly) break;
          }
          if (dist(st, tg) <= 1) {
            st.dx += (tx - hexX(st.col, st.row)) * 0.4; st.dy += (ty - hexY(st.row)) * 0.4;
            strike(tg, K.melee);
            if (K.splash) { const nb = foes.find((e) => e !== tg && dist(e, tg) === 1); if (nb) strike(nb, 1); s.shake = Math.max(s.shake, 0.45); }
          }
        }
      }
      if (terrAt(st.col, st.row) === 'lava' && !K.fly) strike(st, 1); // standing in the fire
    }
    for (const hh of hits) if (isLow(hh)) s.shake = Math.max(s.shake, 0.15);
    if (f.section === 'drop') { // the spell, and a giant for whoever is losing
      w.spell = 1;
      const sum = (arr) => arr.reduce((m, st) => m + st.n, 0), side = sum(w.A) <= sum(w.B) ? w.A : w.B, weak = side.filter((st) => st.n > 0).sort((a, b) => a.n - b.n)[0];
      if (weak) { weak.kind = 'giant'; weak.n = 2; weak.flash = 0.5; }
    } else if (f.section === 'change') { // a fresh stack joins the thinner side
      const side = w.A.filter((st) => st.n > 0).length <= w.B.filter((st) => st.n > 0).length ? w.A : w.B, col = side === w.A ? 0 : 6, free = [0, 1, 2, 3, 4, 5, 6].filter((rw) => !at(col, rw));
      if (free.length && side.length < 6) { const kind = rollW(rnd, TROOP_W, band), [lo, hi] = TROOPS[kind].n; side.push({ side: side === w.A ? -1 : 1, row: pick(rnd, free), col, n: lo + Math.floor(rnd() * (hi - lo + 1)), kind, flash: 0.5, dx: 0, dy: 0, lift: 0 }); }
    }
    w.spell = Math.max(0, w.spell - dt);
    if (w.spell > 0) {
      for (let k = 0; k < 6; k++) { const x = hexX(1 + k * 0.9, 3); r.stroke(x, 0.08 * N, x + (rnd() - 0.5) * 0.05 * N, hexY(6) + hr, Math.max(1, u), k % 2 ? COOL : BRIGHT); }
      if (w.spell > 0.97) for (const st of w.B) st.n = Math.max(0, st.n - 1);
      if (w.spell > 0.93) r.rect(0, 0.08 * N, N, 0.84 * N, BRIGHT);
    }
    for (const st of all.sort((a, b) => a.row - b.row)) {
      st.dx *= Math.exp(-dt * 6);
      st.dy *= Math.exp(-dt * 6);
      st.flash -= dt;
      st.lift = Math.max(0, st.lift - dt * 3);
      const K = TROOPS[st.kind], hx = hexX(st.col, st.row) + st.dx, hy = hexY(st.row) + st.dy, up = (K.fly ? hr * 0.5 : 0) + Math.sin(Math.PI * st.lift) * hr * 0.8, sz = hr * 1.1;
      const base = st.flash > 0 ? BRIGHT : st.side < 0 ? FIG : HOT, col = terrAt(st.col, st.row) === 'forest' && st.flash <= 0 ? base + DIM : base;
      if (up > 0) r.ring(hx, hy + sz * 0.5, sz * 0.3, Math.max(1, u), DARK + DIM, 0.3); // the shadow stays on the hex
      drawTroop(r, st.kind, hx, hy - up, sz, col, -st.side, t, st.row, u);
      for (let k = 0; k < Math.min(7, st.n); k++) r.rect(hx - sz * 0.4 + k * u * 1.5, hy + sz * 0.6, Math.max(1, u), 2 * u, BRIGHT);
      targets.push({ x: hx - sz * 0.5, y: hy - up - sz * 0.5, w: sz, h: sz * 1.2 });
    }
    w.arrows = w.arrows.filter((a) => {
      a.t += dt * 2.5;
      const k = Math.min(1, a.t), x = lerp(a.x0, a.x1, k), y = lerp(a.y0, a.y1, k) - Math.sin(k * Math.PI) * 0.1 * N;
      r.line(x - u, y, x + u, y - u, BRIGHT);
      if (k >= 1) { if (!a.half || rnd() < 0.5) { a.tg.flash = 0.3; a.tg.n = Math.max(0, a.tg.n - 1); } return false; }
      return true;
    });
    w.bolts = w.bolts.filter((b) => { // the mage's line of sparks, the head running along it
      b.t += dt * 3;
      const k = Math.min(1, b.t);
      for (let i = 0; i < 8; i++) { const q = (i / 8) * k; r.rect(lerp(b.x0, b.x1, q) + (hash(i, Math.floor(t * 30)) - 0.5) * 3 * u, lerp(b.y0, b.y1, q) + (hash(i + 9, Math.floor(t * 30)) - 0.5) * 3 * u, Math.max(1, u), Math.max(1, u), i % 2 ? COOL : BRIGHT); }
      r.disc(lerp(b.x0, b.x1, k), lerp(b.y0, b.y1, k), 1.5 * u, BRIGHT);
      return b.t < 1.3;
    });
    for (const side of [-1, 1]) {
      const hx = side < 0 ? 0.05 * N : 0.95 * N, hy = 0.5 * N, col = side < 0 ? FIG : HOT, lit = (w.turn % 2 === 0) === side < 0;
      r.ring(hx, hy + 0.04 * N, 0.03 * N, 0.04 * N, col, 0.6);
      r.disc(hx - side * 0.03 * N, hy + 0.02 * N, 0.015 * N, col);
      for (let k = 0; k < 2; k++) r.rect(hx - 0.02 * N + k * 0.03 * N, hy + 0.08 * N, 2 * u, 0.04 * N, col);
      walker(r, hx, hy + 0.02 * N, 0.08 * N, col, 0, -side, { hat: true, hatCol: lit ? BRIGHT : col });
    }
    if (!w.A.some((st) => st.n > 0) || !w.B.some((st) => st.n > 0)) { // a fresh battle on the same ground
      for (const arr of [w.A, w.B]) { arr.length = 4; arr.forEach((st, i) => { const kind = rollW(rnd, TROOP_W, band), [lo, hi] = TROOPS[kind].n; Object.assign(st, { row: i * 2, col: st.side < 0 ? 0 : 6, n: lo + Math.floor(rnd() * (hi - lo + 1)), kind, dx: 0, dy: 0, lift: 0 }); }); }
      w.turn = 0;
    }
    r.rect(0, 0.92 * N, N, 0.08 * N, DARK);
    for (let k = 0; k < 10 && all.length; k++) { const st = all[(w.turn + k) % all.length]; r.rect(0.1 * N + k * 0.08 * N, 0.94 * N, 0.06 * N, 0.04 * N, st.side < 0 ? FIG : HOT); }
    r.rect(0, 0, N, 0.08 * N, DARK);
  },
};

// ---------------------------------------------------------------------------------------------- adventure map
// A map of grass, dirt, woods, water and mountains with two castles and three mines. A hero on horseback rides a
// tile per beat to the next pile of resources, flags the mines, fights a wandering stack on the hard snares; a
// day passes every four bars, a new week (section) loses the mines again.
const adventure = {
  init(W) {
    const { w, rnd } = W, G = 12, tiles = new Uint8Array(G * G);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { const v = hash(x + 1, y + 7); tiles[y * G + x] = v < 0.12 ? 3 : v < 0.3 ? 2 : v < 0.4 ? 1 : 0; }
    for (let k = 0; k < G; k++) tiles[k] = 4;
    tiles[G + G - 1] = 4;
    tiles[2 * G + G - 1] = 4;
    const castles = [[1, 10], [10, 2]];
    for (const [cx, cy] of castles) for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) if (cx + dx >= 0 && cx + dx < G && cy + dy >= 1) tiles[(cy + dy) * G + cx + dx] = 0;
    Object.assign(w, { G, tiles, hero: { x: 2, y: 8, fx: 2, fy: 8, dir: 1 }, castles, mines: [[8, 8, 0], [3, 3, 1], [6, 5, 2]], loot: [], day: 1, step: 0, fight: 0, flagged: [false, false, false], glint: 0 });
    for (const [mx, my] of w.mines) tiles[my * G + mx] = 0;
    for (let k = 0; k < 6; k++) w.loot.push([1 + Math.floor(rnd() * (G - 2)), 2 + Math.floor(rnd() * (G - 3)), Math.floor(rnd() * 3)]);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, G = w.G, T = N / G, Hh = w.hero, walkable = (x, y) => x >= 0 && y >= 0 && x < G && y < G && w.tiles[y * G + x] < 2;
    if (beatLocked(f) ? f.beat.on : (w.step += dt) > 0.5) {
      w.step = 0;
      const goal = w.loot[0] || w.mines.find((m, i) => !w.flagged[i]) || w.castles[w.day % 2];
      if (goal) {
        const dx = Math.sign(goal[0] - Hh.x), dy = Math.sign(goal[1] - Hh.y);
        if (dx && walkable(Hh.x + dx, Hh.y) && (rnd() < 0.6 || !dy)) Hh.x += dx;
        else if (dy && walkable(Hh.x, Hh.y + dy)) Hh.y += dy;
        else if (dx && walkable(Hh.x + dx, Hh.y)) Hh.x += dx;
        else if (dy && Hh.y + dy >= 1 && Hh.y + dy < G) Hh.y += dy;
        if (dx) Hh.dir = dx;
      }
      if (f.beat.count % 16 === 0) w.day++;
    }
    Hh.fx = follow(Hh.fx, Hh.x, dt, 0.1);
    Hh.fy = follow(Hh.fy, Hh.y, dt, 0.1);
    w.loot = w.loot.filter((l) => { if (l[0] === Hh.x && l[1] === Hh.y) { w.glint = 0.4; return false; } return true; });
    w.mines.forEach((m, i) => { if (m[0] === Hh.x && m[1] === Hh.y) w.flagged[i] = true; });
    if (w.loot.length < 3) w.loot.push([1 + Math.floor(rnd() * (G - 2)), 2 + Math.floor(rnd() * (G - 3)), Math.floor(rnd() * 3)]);
    for (const hh of hits) if (hh.kind === 'snare' && hh.strength > 0.6) { w.fight = 0.4; s.shake = Math.max(s.shake, 0.3); }
    if (f.section) w.flagged = [false, false, false];
    w.fight -= dt;
    w.glint -= dt;
    for (let y = 0; y < G; y++)
      for (let x = 0; x < G; x++) {
        const tl = w.tiles[y * G + x], X = x * T, Y = y * T;
        if (tl === 0) { r.rect(X, Y, T, T, LMID); if (hash(x, y * 3) < 0.3) r.rect(X + T * 0.3, Y + T * 0.6, Math.max(1, u), Math.max(1, u), MID); }
        else if (tl === 1) r.rect(X, Y, T, T, MID);
        else if (tl === 2) { r.rect(X, Y, T, T, LMID); r.poly([[X + T * 0.15, Y + T * 0.85], [X + T * 0.5, Y + T * 0.1], [X + T * 0.85, Y + T * 0.85]], DARK); r.rect(X + T * 0.45, Y + T * 0.75, T * 0.1, T * 0.2, DARK + DIM); }
        else if (tl === 3) { r.rect(X, Y, T, T, COOL); if ((x + y + Math.floor(t * 2)) % 3 === 0) r.rect(X + T * 0.2, Y + T * 0.5, T * 0.4, Math.max(1, u), BRIGHT); }
        else { r.rect(X, Y, T, T, MID); r.poly([[X, Y + T], [X + T * 0.5, Y + T * 0.15], [X + T, Y + T]], DARK); r.poly([[X + T * 0.35, Y + T * 0.4], [X + T * 0.5, Y + T * 0.15], [X + T * 0.65, Y + T * 0.4]], BRIGHT); }
      }
    for (const [cx, cy] of w.castles) {
      const X = cx * T, Y = cy * T;
      r.rect(X - T, Y - T * 0.6, 3 * T, T * 1.4, DARK);
      for (const k of [-1, 1]) r.rect(X + k * T - T * 0.2, Y - T * 1.2, T * 0.4, T * 0.6, DARK);
      r.rect(X - T * 0.15, Y - T * 1.5, T * 0.3, T * 0.9, DARK);
      r.rect(X - T * 0.1, Y - T * 1.9, Math.max(1, u), T * 0.4, DARK);
      r.rect(X - T * 0.1, Y - T * 1.9, T * 0.3, T * 0.2, f.beat.pulse > 0.4 ? HOT : HOT + DIM);
      r.rect(X - T * 0.15, Y + T * 0.3, T * 0.3, T * 0.5, BG);
      targets.push({ x: X - T, y: Y - T * 1.9, w: 3 * T, h: 2.7 * T });
    }
    w.mines.forEach(([mx, my, kind], i) => {
      const X = mx * T, Y = my * T;
      r.poly([[X - T * 0.1, Y + T * 0.9], [X + T * 0.5, Y - T * 0.2], [X + T * 1.1, Y + T * 0.9]], DARK);
      r.rect(X + T * 0.35, Y + T * 0.4, T * 0.3, T * 0.5, BLACK);
      r.rect(X + T * 0.5, Y - T * 0.6, Math.max(1, u), T * 0.5, BRIGHT);
      r.rect(X + T * 0.5, Y - T * 0.6, T * 0.3, T * 0.2, w.flagged[i] ? FIG : [HOT, COOL, BRIGHT][kind]);
    });
    for (const [lx, ly, kind] of w.loot) {
      const X = (lx + 0.5) * T, Y = (ly + 0.5) * T + Math.sin(t * 4 + lx) * u;
      if (kind === 0) r.disc(X, Y, T * 0.2, HOT);
      else if (kind === 1) r.rect(X - T * 0.3, Y - T * 0.1, T * 0.6, T * 0.2, MID);
      else r.poly([[X, Y - T * 0.3], [X + T * 0.25, Y], [X, Y + T * 0.3], [X - T * 0.25, Y]], COOL);
    }
    const X = (Hh.fx + 0.5) * T, Y = (Hh.fy + 0.5) * T;
    r.ring(X, Y + T * 0.15, T * 0.25, T * 0.3, FIG, 0.6);
    r.disc(X + Hh.dir * T * 0.35, Y, T * 0.12, FIG);
    for (const k of [-1, 1]) r.rect(X + k * T * 0.2 - u, Y + T * 0.3, 2 * u, T * 0.25, FIG);
    walker(r, X, Y + T * 0.15, T * 0.7, FIG, 0, Hh.dir, { hat: true, hatCol: HOT });
    const px = X - Hh.dir * T * 0.1;
    r.rect(px, Y - T * 0.8, Math.max(1, u), T * 0.5, FIG);
    r.rect(Hh.dir > 0 ? px : px - T * 0.25, Y - T * 0.8, T * 0.25, T * 0.15, HOT);
    if (w.fight > 0) { for (let k = 0; k < 6; k++) r.rect(X + (rnd() - 0.5) * T * 1.5, Y + (rnd() - 0.5) * T, 2 * u, 2 * u, k % 2 ? HOT : BRIGHT); r.ring(X, Y, T * (1 - w.fight), Math.max(1, u), BRIGHT); }
    if (w.glint > 0) r.ring(X, Y - T * 0.5, T * 0.4 * (1.3 - w.glint / 0.4), Math.max(1, u), BRIGHT);
    targets.push({ x: X - T * 0.5, y: Y - T * 0.9, w: T, h: T * 1.4 });
    r.rect(0, N - 0.06 * N, N, 0.06 * N, DARK);
    for (let k = 0; k < 7; k++) r.rect(0.04 * N + k * 0.04 * N, N - 0.045 * N, 0.03 * N, 0.03 * N, k <= (w.day - 1) % 7 ? BRIGHT : MID);
    for (let k = 0; k < 3; k++) r.rect(0.7 * N + k * 0.08 * N, N - 0.045 * N, 0.06 * N, 0.03 * N, w.flagged[k] ? [HOT, COOL, BRIGHT][k] : MID);
  },
};

// ---------------------------------------------------------------------------------------------- raid
// A boss in a round arena with a party of five in class colours. Kicks are its stomps (everyone repositions),
// snares put void circles on the floor that the party steps out of, notes are the party's casts flying in and
// taking its health down; a drop is the enrage, a kill is a white frame and the next pull.
const raid = {
  init(W) {
    Object.assign(W.w, { boss: { hp: 1, x: 0.5, y: 0.38, stomp: 0, enrage: 0 }, party: Array.from({ length: 5 }, (_, i) => ({ x: 0.2 + i * 0.15, y: 0.75, tx: 0.2 + i * 0.15, ty: 0.75, cls: i, cast: 0 })), voids: [], bolts: [], sparks: [], wipe: 0 });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, B = w.boss, CLS = [FIG, COOL, HOT, BRIGHT, LMID];
    for (const hh of hits) {
      if (isLow(hh)) { B.stomp = 1; s.shake = Math.max(s.shake, 0.5 * hh.strength); for (const p of w.party) p.ty = 0.6 + rnd() * 0.3; }
      else if (hh.kind === 'snare') w.voids.push({ x: 0.15 + rnd() * 0.7, y: 0.55 + rnd() * 0.35, t: 0 });
      else if (isTonal(hh)) { const p = w.party[hh.pc % 5]; p.cast = 0.4; w.bolts.push({ x0: p.x, y0: p.y - 0.05, t: 0, c: CLS[p.cls] }); B.hp = Math.max(0, B.hp - 0.02); }
    }
    if (f.section === 'drop') B.enrage = 8;
    B.stomp *= Math.exp(-dt * 5);
    B.enrage -= dt;
    B.hp = Math.max(0, B.hp - dt * 0.005 * (B.enrage > 0 ? 3 : 1));
    if (B.hp <= 0) { B.hp = 1; w.wipe = 0.5; }
    w.wipe -= dt;
    r.fill(DARK);
    r.ring(0.5 * N, 0.62 * N, 0.2 * N, 0.44 * N, MID, 0.55);
    r.ring(0.5 * N, 0.62 * N, 0.4 * N, Math.max(1, u), LMID, 0.55);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; r.rect(0.5 * N + Math.cos(a) * 0.3 * N - u, 0.62 * N + Math.sin(a) * 0.17 * N - u, 2 * u, 2 * u, B.enrage > 0 ? HOT : COOL); }
    for (const px of [0.08, 0.92]) { r.rect(px * N - 2 * u, 0.1 * N, 4 * u, 0.5 * N, MID); r.rect(px * N - 4 * u, 0.08 * N, 8 * u, 3 * u, LMID); }
    w.voids = w.voids.filter((v) => {
      v.t += dt;
      const R = 0.04 * N + v.t * 0.05 * N;
      r.ring(v.x * N, v.y * N, R, Math.max(1, u), v.t < 1.2 ? HOT : BRIGHT, 0.5);
      if (v.t < 1.2) for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + t * 3; r.rect(v.x * N + Math.cos(a) * R * 0.6, v.y * N + Math.sin(a) * R * 0.3, Math.max(1, u), Math.max(1, u), HOT); }
      for (const p of w.party) if (Math.hypot(p.x - v.x, (p.y - v.y) * 2) < R / N + 0.03) p.tx = clamp(p.x + (p.x >= v.x ? 0.12 : -0.12), 0.1, 0.9);
      return v.t < 1.5;
    });
    const bx = B.x * N, by = B.y * N + B.stomp * 2 * u, Hb = 0.3 * N, col = B.enrage > 0 ? HOT : MID;
    r.poly([[bx - Hb * 0.35, by + Hb * 0.2], [bx + Hb * 0.35, by + Hb * 0.2], [bx + Hb * 0.25, by - Hb * 0.4], [bx - Hb * 0.25, by - Hb * 0.4]], col);
    r.rect(bx - Hb * 0.15, by - Hb * 0.65, Hb * 0.3, Hb * 0.28, col);
    for (const k of [-1, 1]) {
      r.stroke(bx + k * Hb * 0.15, by - Hb * 0.6, bx + k * Hb * 0.35, by - Hb * 0.85, 2 * u, LMID);
      r.rect(bx + k * Hb * 0.06 - u, by - Hb * 0.52, 2 * u, 2 * u, BRIGHT);
      r.rect(bx + k * Hb * 0.4 - (k > 0 ? 0 : Hb * 0.14), by - Hb * 0.1 - B.stomp * Hb * 0.2, Hb * 0.14, Hb * 0.35, col);
      r.rect(bx + k * Hb * 0.12 - Hb * 0.07, by + Hb * 0.2, Hb * 0.14, Hb * 0.2 - B.stomp * 2 * u, col);
    }
    if (B.stomp > 0.3) r.ring(bx, by + Hb * 0.4, (1 - B.stomp) * 0.4 * N + 0.05 * N, Math.max(1, u), BRIGHT, 0.4);
    targets.push({ x: bx - Hb * 0.4, y: by - Hb * 0.85, w: Hb * 0.8, h: Hb * 1.25 });
    for (const p of w.party) {
      p.x = follow(p.x, p.tx, dt, 0.4);
      p.y = follow(p.y, p.ty, dt, 0.4);
      p.cast -= dt;
      walker(r, p.x * N, p.y * N, 0.1 * N, CLS[p.cls], p.cast > 0 ? 0 : 0.3 * Math.sin(t * 5 + p.cls), B.x > p.x ? 1 : -1, { cap: p.cls === 3 });
      if (p.cast > 0) r.ring(p.x * N, p.y * N, 0.05 * N, Math.max(1, u), CLS[p.cls], 0.4);
      r.rect(p.x * N - 4 * u, p.y * N - 0.12 * N, 8 * u * (0.5 + 0.5 * f.level), Math.max(1, u), COOL);
      targets.push({ x: p.x * N - 4 * u, y: p.y * N - 0.1 * N, w: 8 * u, h: 0.1 * N });
    }
    w.bolts = w.bolts.filter((b) => {
      b.t += dt * 3;
      const k = Math.min(1, b.t), x = lerp(b.x0, B.x, k) * N, y = lerp(b.y0, B.y, k) * N - Math.sin(k * Math.PI) * 0.05 * N;
      r.disc(x, y, 1.5 * u, b.c);
      if (k >= 1) burst(w.sparks, rnd, x, y, 5, N * 0.3, b.c, 0.3);
      return k < 1;
    });
    w.sparks = particles(W, w.sparks, BRIGHT);
    r.rect(0.1 * N, 0.03 * N, 0.8 * N, 4 * u, BLACK);
    r.rect(0.1 * N, 0.03 * N, 0.8 * N * B.hp, 4 * u, B.enrage > 0 ? HOT : COOL);
    r.frame(Math.round(0.1 * N), Math.round(0.03 * N), Math.round(0.8 * N), Math.round(4 * u), LMID);
    for (let k = 0; k < 5; k++) r.rect(0.02 * N, 0.12 * N + k * 0.04 * N, 0.08 * N * (0.6 + 0.4 * Math.sin(t * 2 + k)), 2 * u, CLS[k]);
    if (w.wipe > 0.4) r.fill(BRIGHT);
  },
};

// ---------------------------------------------------------------------------------------------- jrpg
// A turn-based battle screen: a monster on the left, a party of three in a column on the right, windows below
// with the command list and the party's bars that fill at the tempo. A kick is the next in line's turn, each in
// their way: the knight steps up and swings, the archer looses an arrow across, the mage raises the staff and the
// last note's spell comes down (fire, ice, a bolt, a quake, wind, light, by pitch class), the thief dashes through
// twice, the healer's sparkles go over the party. A snare is the monster hitting back in its own way, a note moves
// the cursor. Monsters: a blob, a golem, a suit of armour, a wisp that floats; a dragon on a drop.
const PARTY = {
  knight: { col: FIG, dress: { hat: true, coat: true }, act: 'slash' }, // a helm, a sword from the shoulder
  archer: { col: LMID, dress: { cap: true }, act: 'shoot' }, // a cap, a bow and an arrow across the field
  mage: { col: COOL, dress: {}, act: 'cast' }, // a pointed hat, a staff, the spell of the last note
  thief: { col: FIG, dress: {}, act: 'dash' }, // a hood, two dashes through the monster
  healer: { col: BRIGHT, dress: { coat: true }, act: 'heal' }, // a robe, sparkles over the party
};
const PARTY_W = { knight: [3, 2, 2], archer: [2, 2, 2], mage: [2, 2, 2], thief: [1, 2, 3], healer: [2, 1, 1] };
const MONSTERS = {
  blob: { hp: 1, hit: 'lunge' }, // a heap of rings that lunges
  golem: { hp: 1.3, hit: 'slam' }, // a block with raised arms that slams the ground
  armour: { hp: 1.2, hit: 'slash' }, // a suit of armour with a sword, cuts at the party
  wisp: { hp: 0.8, hit: 'flame', float: true }, // a floating flame, throws sparks
  dragon: { hp: 2, hit: 'breath', big: true }, // wings, a neck, breathes across the field
};
const MONSTER_W = { blob: [3, 2, 1], golem: [2, 2, 2], armour: [1, 2, 2], wisp: [2, 2, 1], dragon: [0, 1, 2] };
const SPELLS = ['fire', 'ice', 'bolt', 'quake', 'wind', 'light']; // by pitch class

const jrpg = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a), kinds = [];
    while (kinds.length < 3) { const k = rollW(rnd, PARTY_W, band); if (!kinds.includes(k)) kinds.push(k); }
    Object.assign(w, { party: kinds.map((kind, i) => ({ kind, y: 0.36 + i * 0.11, atb: rnd(), act: 0, hurt: 0, again: 0 })), mob: { hp: 1, flash: 0, shake: 0, kind: rollW(rnd, MONSTER_W, band), atk: 0, lunge: 0 },
      cursor: 0, menu: 0, dmg: [], spells: [], arrows: [], sparks: [], heal: 0, pc: 0, scene: Math.floor(rnd() * 3) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bps = f.bpm ? f.bpm / 60 : 2, M = w.mob, band = bandOf(W.a), MK = MONSTERS[M.kind];
    const mx = 0.26 * N + Math.sin(t * 40) * M.shake * 2 * u + Math.sin(Math.PI * clamp(M.lunge)) * 0.12 * N, my = 0.5 * N - (MK.float ? 0.06 * N + Math.sin(t * 2) * 2 * u : 0), MS = 0.26 * N;
    const turn = (p) => { // the next in line acts in their own way
      const P = PARTY[p.kind];
      p.act = 1;
      if (P.act === 'shoot') w.arrows.push({ x: 0.68, y: p.y + 0.06, t: 0 });
      else if (P.act === 'cast') w.spells.push({ kind: SPELLS[w.pc % 6], t: 0 });
      else if (P.act === 'dash') p.again = 0.35;
      else if (P.act === 'heal') { w.heal = 0.7; for (const q of w.party) q.hurt = 0; }
    };
    for (const hh of hits) {
      if (isLow(hh)) { turn(w.party[w.cursor]); w.cursor = (w.cursor + 1) % 3; M.hp = Math.max(0, M.hp - (0.08 + 0.1 * hh.strength) / MK.hp); M.flash = 0.2; M.shake = 1; w.dmg.push({ x: 0.3, y: 0.38, t: 0, c: BRIGHT }); }
      else if (hh.kind === 'snare') { const p = pick(rnd, w.party); p.hurt = 0.4; M.atk = 0.4; M.tg = p; w.dmg.push({ x: 0.68, y: p.y - 0.02, t: 0, c: HOT }); s.shake = Math.max(s.shake, 0.3); if (MK.hit === 'lunge') M.lunge = 1; }
      else if (isTonal(hh)) { w.menu = hh.pc % 4; w.pc = hh.pc; }
    }
    if (f.section === 'drop') { M.kind = 'dragon'; M.hp = 1; w.scene = (w.scene + 1) % 3; }
    else if (f.section === 'change') { const i = Math.floor(rnd() * 3); let k = rollW(rnd, PARTY_W, band); if (!w.party.some((p) => p.kind === k)) w.party[i].kind = k; else { M.kind = rollW(rnd, MONSTER_W, band); M.hp = 1; } }
    if (M.hp <= 0) { M.hp = 1; M.kind = rollW(rnd, MONSTER_W, band); w.scene = (w.scene + 1) % 3; }
    M.flash -= dt; M.atk -= dt; M.lunge -= dt * 3;
    M.shake *= Math.exp(-dt * 8);
    w.heal -= dt;
    const sc = w.scene;
    r.rect(0, 0, N, 0.62 * N, sc === 0 ? DARK : sc === 1 ? MID : DARK + DIM);
    if (sc === 1) for (let k = 0; k < 6; k++) { const x = k * 0.18 * N + 0.05 * N; r.rect(x, 0.1 * N, 3 * u, 0.5 * N, DARK); r.disc(x + 1.5 * u, 0.12 * N, 0.07 * N, DARK + DIM); }
    else if (sc === 2) for (let k = 0; k < 5; k++) { r.rect(k * 0.22 * N + 0.04 * N, 0.05 * N, 4 * u, 0.55 * N, MID); r.rect(k * 0.22 * N + 0.1 * N, 0.12 * N, 0.08 * N, 0.2 * N, COOL + DIM); }
    else for (let k = 0; k < 12; k++) r.poly([[hash(k, 4) * N, 0], [hash(k, 4) * N + 0.03 * N, 0.08 * N + hash(k, 5) * 0.1 * N], [hash(k, 4) * N + 0.06 * N, 0]], MID);
    r.rect(0, 0.62 * N, N, 0.1 * N, LMID);
    r.rect(0, 0.62 * N, N, Math.max(1, u), BRIGHT);
    // the monster, its own shape and its own attack
    const mc = M.flash > 0 ? BRIGHT : HOT, atk = M.atk > 0 ? Math.sin(Math.PI * (1 - M.atk / 0.4)) : 0, tgY = M.tg ? (M.tg.y + 0.1) * N : 0.5 * N;
    r.ring(mx, 0.5 * N + MS * 0.37, MS * 0.3, 2 * u, DARK, 0.3); // the shadow on the floor
    if (M.kind === 'blob') { r.ring(mx, my, MS * 0.2, MS * 0.5, mc, 0.8); r.ring(mx, my - MS * 0.2, MS * 0.15, MS * 0.3, mc, 0.8); for (const k of [-1, 1]) r.rect(mx + k * MS * 0.12 - u, my - MS * 0.25, 2 * u, 2 * u, BLACK); }
    else if (M.kind === 'golem') {
      r.poly([[mx - MS * 0.3, my + MS * 0.1], [mx + MS * 0.3, my + MS * 0.1], [mx + MS * 0.35, my - MS * 0.5], [mx - MS * 0.35, my - MS * 0.5]], mc);
      for (const k of [-1, 1]) { r.stroke(mx + k * MS * 0.3, my - MS * 0.5, mx + k * MS * 0.45, my - MS * (0.8 - 0.9 * atk), 2 * u, mc); r.rect(mx + k * MS * 0.12 - u, my - MS * 0.35, 3 * u, 2 * u, BLACK); }
      r.rect(mx - MS * 0.2, my - MS * 0.15, MS * 0.4, 2 * u, BLACK);
      for (const k of [-0.2, 0.2]) r.rect(mx + k * MS - u, my + MS * 0.1, 2 * u, MS * 0.15, mc);
      if (atk > 0.8) { s.shake = Math.max(s.shake, 0.4); for (let i = 0; i < 4; i++) r.line(mx + MS * 0.4, my + MS * 0.3, mx + MS * (0.6 + i * 0.2), my + MS * (0.2 + hash(i, 2) * 0.3), DARK); }
    } else if (M.kind === 'armour') {
      r.rect(mx - MS * 0.2, my - MS * 0.4, MS * 0.4, MS * 0.5, mc);
      r.rect(mx - MS * 0.15, my - MS * 0.65, MS * 0.3, MS * 0.25, mc);
      r.rect(mx - MS * 0.12, my - MS * 0.58, MS * 0.24, 2 * u, BLACK);
      const a = lerp(-1.4, 0.5, atk);
      r.stroke(mx + MS * 0.2, my - MS * 0.3, mx + MS * 0.2 + Math.cos(a) * MS * 0.6, my - MS * 0.3 + Math.sin(a) * MS * 0.6, 2 * u, BRIGHT);
      r.rect(mx - MS * 0.4, my - MS * 0.35, MS * 0.2, MS * 0.3, LMID);
      for (const k of [-0.1, 0.1]) r.rect(mx + k * MS - u, my + MS * 0.1, 2.5 * u, MS * 0.15, mc);
    } else if (M.kind === 'wisp') {
      const fl = 1 + 0.1 * Math.sin(t * 20);
      r.poly([[mx - MS * 0.22, my + MS * 0.1], [mx + MS * 0.22, my + MS * 0.1], [mx + MS * 0.12, my - MS * 0.25 * fl], [mx, my - MS * 0.5 * fl], [mx - MS * 0.12, my - MS * 0.25 * fl]], mc);
      r.poly([[mx - MS * 0.1, my + MS * 0.05], [mx + MS * 0.1, my + MS * 0.05], [mx, my - MS * 0.25]], BRIGHT);
      for (const k of [-1, 1]) r.rect(mx + k * MS * 0.06 - u, my - MS * 0.08, 2 * u, 2 * u, BLACK);
      if (atk > 0) for (let i = 0; i < 3; i++) w.sparks.push({ x: mx, y: my - MS * 0.1, vx: N * (0.5 + rnd() * 0.3), vy: ((tgY - my) / N) * N * 0.9 - N * 0.3 + (rnd() - 0.5) * N * 0.2, life: 0.5, c: HOT });
    } else { // the dragon: body, a neck of discs to the head, wings beating slowly, a tail
      const flap = Math.sin(t * 3) * MS * 0.25;
      for (const k of [-1, 1]) r.poly([[mx + k * MS * 0.1, my - MS * 0.25], [mx + k * MS * 0.75, my - MS * 0.6 - flap], [mx + k * MS * 0.6, my - MS * 0.05]], mc);
      r.ring(mx, my, MS * 0.18, MS * 0.36, mc, 0.7);
      for (let i = 0; i < 6; i++) r.disc(mx + MS * (0.1 + i * 0.07), my - MS * (0.2 + i * 0.1), MS * 0.09, mc);
      r.poly([[mx + MS * 0.4, my - MS * 0.85], [mx + MS * 0.85, my - MS * 0.72], [mx + MS * 0.45, my - MS * 0.62]], mc);
      r.rect(mx + MS * 0.52, my - MS * 0.8, 2 * u, 2 * u, BLACK);
      r.stroke(mx - MS * 0.2, my + MS * 0.1, mx - MS * 0.7, my + MS * 0.25, 2 * u, mc);
      for (const k of [-0.15, 0.1]) r.rect(mx + k * MS, my + MS * 0.15, MS * 0.12, MS * 0.2, mc);
      if (atk > 0) for (let yy = Math.round(my - MS * 0.75); yy < my - MS * 0.7; yy++) r.rect(mx + MS * 0.85, yy, (0.66 * N - mx - MS * 0.85) * atk, 1, yy % 2 ? HOT : BRIGHT);
    }
    if (MK.hit === 'slash' && atk > 0.5) r.stroke(0.62 * N, tgY - 0.08 * N, 0.7 * N, tgY + 0.02 * N, 1.5 * u, BRIGHT);
    r.rect(mx - MS * 0.4, my + MS * 0.35, MS * 0.8, 2 * u, DARK);
    r.rect(mx - MS * 0.4, my + MS * 0.35, MS * 0.8 * M.hp, 2 * u, HOT);
    targets.push({ x: mx - MS * 0.45, y: my - MS * 0.8, w: MS * 0.9, h: MS * 1.2 });
    w.spells = w.spells.filter((sp) => { // the spell over the monster
      sp.t += dt;
      const k = sp.t / 0.7;
      if (sp.kind === 'fire') for (let i = 0; i < 10; i++) r.rect(mx + (rnd() - 0.5) * MS * 0.8, my + MS * 0.3 - rnd() * MS * (0.4 + 0.8 * k), 2 * u, 3 * u, i % 2 ? HOT : BRIGHT);
      else if (sp.kind === 'ice') for (let i = 0; i < 5; i++) { const x = mx - MS * 0.4 + i * MS * 0.2, hgt = MS * (0.2 + 0.4 * hash(i, 1)) * Math.min(1, k * 2); r.poly([[x - 2 * u, my + MS * 0.35], [x, my + MS * 0.35 - hgt], [x + 2 * u, my + MS * 0.35]], COOL); r.set(x, my + MS * 0.35 - hgt, BRIGHT); }
      else if (sp.kind === 'bolt') { if (k < 0.5) { let px = mx, py = 0; for (let i = 1; i <= 6; i++) { const nx = mx + (hash(i, Math.floor(t * 30)) - 0.5) * MS * 0.4, ny = (my / 6) * i; r.stroke(px, py, nx, ny, 1.5 * u, i % 2 ? BRIGHT : COOL); px = nx; py = ny; } } if (k < 0.1) r.rect(0, 0, N, 0.62 * N, BRIGHT); }
      else if (sp.kind === 'quake') { s.shake = Math.max(s.shake, 0.3); for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; r.line(mx + Math.cos(a) * MS * 0.3, my + MS * 0.37, mx + Math.cos(a) * MS * (0.6 + k * 0.4), my + MS * 0.37 + Math.abs(Math.sin(a)) * MS * 0.15, DARK); } }
      else if (sp.kind === 'wind') for (let i = 0; i < 6; i++) { const y = my - MS * 0.6 + i * MS * 0.18, x = mx + MS * 0.6 - ((k * 3 + hash(i, 3)) % 1) * MS * 1.2; r.rect(x, y, MS * 0.25, Math.max(1, u), LMID); }
      else { for (let i = 0; i < 7; i++) { const a = t * 2 + (i * TAU) / 7; r.line(mx, my - MS * 0.1, mx + Math.cos(a) * MS * 0.9, my - MS * 0.1 + Math.sin(a) * MS * 0.9, BRIGHT); } if (k < 0.15) r.disc(mx, my - MS * 0.1, MS * 0.5, BRIGHT); }
      return sp.t < 0.7;
    });
    w.arrows = w.arrows.filter((a) => { a.t += dt * 4; const k = Math.min(1, a.t), x = lerp(a.x, 0.32, k) * N, y = lerp(a.y, 0.46, k) * N - Math.sin(k * Math.PI) * 0.05 * N; r.line(x, y, x + 3 * u, y - u, BRIGHT); return k < 1; });
    w.sparks = particles(W, w.sparks, HOT);
    // the party, each their own shape and their own move
    w.party.forEach((p, i) => {
      const P = PARTY[p.kind];
      p.act = Math.max(0, p.act - dt * 3);
      if (p.again > 0 && (p.again -= dt) <= 0) p.act = 1;
      p.hurt -= dt;
      p.atb = Math.min(1, p.atb + dt * bps * 0.2);
      if (p.atb >= 1 && f.beat.on) p.atb = 0;
      const slide = P.act === 'slash' ? 0.25 : P.act === 'dash' ? 0.38 : 0, px = 0.72 * N - Math.sin(Math.PI * p.act) * slide * N + (p.hurt > 0 ? 3 * u : 0), py = p.y * N + 0.14 * N, h = 0.11 * N;
      const col = p.hurt > 0 && Math.floor(t * 20) % 2 ? BRIGHT : P.col;
      r.rect(px - h * 0.25, py, h * 0.5, Math.max(1, u), DARK);
      if (P.act === 'dash' && p.act > 0) for (let k = 1; k < 3; k++) walker(r, px + k * 4 * u, py, h, col + DIM, 0, -1, {}); // the thief's afterimages
      const J = walker(r, px, py, h, col, P.act === 'dash' && p.act > 0 ? 0.5 : 0, -1, P.dress);
      if (p.kind === 'mage') r.poly([[px - h * 0.25, J.top + h * 0.02], [px + h * 0.25, J.top + h * 0.02], [px - h * 0.05, J.top - h * 0.35]], col); // the pointed hat
      if (p.kind === 'thief') r.disc(px, J.head, h * 0.14, col);
      const sx = J.sx, sy = J.sy + h * 0.04, k = p.act > 0 ? 1 - p.act : -1;
      if (P.act === 'slash') { const a = k >= 0 ? lerp(-1.6, 0.6, k) : 0.5; r.stroke(sx, sy, sx - Math.cos(a) * h * 0.55, sy + Math.sin(a) * h * 0.55, Math.max(1, u), BRIGHT); }
      else if (P.act === 'shoot') { r.ring(sx - h * 0.2, sy + h * 0.1, h * 0.22, Math.max(1, u * 0.7), LMID); if (k < 0) r.line(sx - h * 0.05, sy + h * 0.1, sx - h * 0.4, sy + h * 0.1, BRIGHT); }
      else if (P.act === 'cast') { const a = k >= 0 ? lerp(0.6, -1.4, Math.min(1, k * 2)) : 0.6; const ex = sx - Math.cos(a) * h * 0.6, ey = sy + Math.sin(a) * h * 0.6; r.stroke(sx, sy, ex, ey, Math.max(1, u), DARK); r.disc(ex, ey, k >= 0 ? 2.5 * u : 1.5 * u, k >= 0 ? BRIGHT : COOL); }
      else if (P.act === 'dash') for (const dy of [0, 0.15]) r.stroke(sx, sy + dy * h, sx - h * 0.3, sy + dy * h + h * 0.05, Math.max(1, u), BRIGHT);
      else { r.stroke(sx, sy, sx - h * 0.1, sy - h * (k >= 0 ? 0.45 : 0.1), Math.max(1, u), DARK); if (w.heal > 0) for (let n = 0; n < 3; n++) r.rect(px + (rnd() - 0.5) * h * 0.8, py - rnd() * h * 1.3, Math.max(1, u), Math.max(1, u), n ? COOL : BRIGHT); }
      if (i === w.cursor) r.poly([[px + h * 0.4, py - h * 1.3], [px + h * 0.6, py - h * 1.1], [px + h * 0.4, py - h * 0.9]], BRIGHT);
      targets.push({ x: px - h * 0.3, y: py - h, w: h * 0.6, h });
    });
    r.rect(0.02 * N, 0.74 * N, 0.3 * N, 0.24 * N, BLACK);
    r.frame(Math.round(0.02 * N), Math.round(0.74 * N), Math.round(0.3 * N), Math.round(0.24 * N), BRIGHT);
    for (let k = 0; k < 4; k++) { r.rect(0.08 * N, 0.78 * N + k * 0.05 * N, (0.1 + 0.05 * (k % 2)) * N, 2 * u, k === w.menu ? BRIGHT : LMID); if (k === w.menu) r.poly([[0.04 * N, 0.775 * N + k * 0.05 * N], [0.065 * N, 0.785 * N + k * 0.05 * N], [0.04 * N, 0.795 * N + k * 0.05 * N]], BRIGHT); }
    r.rect(0.34 * N, 0.74 * N, 0.64 * N, 0.24 * N, BLACK);
    r.frame(Math.round(0.34 * N), Math.round(0.74 * N), Math.round(0.64 * N), Math.round(0.24 * N), BRIGHT);
    w.party.forEach((p, i) => {
      const y = 0.78 * N + i * 0.065 * N;
      r.rect(0.37 * N, y, 0.12 * N, 2 * u, PARTY[p.kind].col);
      r.rect(0.52 * N, y, 0.2 * N, 2 * u, DARK);
      r.rect(0.52 * N, y, 0.2 * N * (p.hurt > 0 ? 0.5 : 0.8), 2 * u, COOL);
      r.rect(0.75 * N, y, 0.2 * N, 2 * u, DARK);
      r.rect(0.75 * N, y, 0.2 * N * p.atb, 2 * u, p.atb >= 1 ? BRIGHT : HOT);
    });
    w.dmg = w.dmg.filter((d) => { d.t += dt; for (let k = 0; k < 3; k++) r.rect(d.x * N + k * 3 * u, d.y * N - d.t * 0.1 * N, 2 * u, 3 * u, d.c); return d.t < 0.6; });
  },
};

// ---------------------------------------------------------------------------------------------- arpg
// A dungeon room from above with a horde closing in: a kick is the weapon's blow (a whirlwind, a cleave in a
// wedge ahead, a hammer slam that rings out, chain lightning that jumps three), a snare a fireball at the nearest;
// the dead drop loot of a rarity, from a coin to the one with a pillar of light over it, and the hero walks over
// to it. Two orbs below, life with the level and mana with the harmony, a belt of slots between them. Fiends:
// shamblers, archers that keep their distance and shoot, imps that dart, bats that circle, brutes on a drop. A
// section change changes the weapon.
const FIENDS = {
  zombie: { hp: 2, v: 1, size: 1 }, // the slow one, arms out
  archer: { hp: 2, v: 0.8, size: 1, range: 0.28 }, // keeps its distance and shoots on the beat
  imp: { hp: 1, v: 2.4, size: 0.7, dart: true }, // small and quick, darts side to side
  bat: { hp: 1, v: 1.6, size: 0.6, circle: true }, // circles the hero, bites on the way past
  brute: { hp: 6, v: 0.6, size: 1.6, big: true }, // big and slow, its blows shake the room
};
const FIEND_W = { zombie: [3, 2, 1], bat: [2, 2, 2], archer: [1, 2, 2], imp: [1, 2, 3], brute: [0, 1, 2] };
// loot by rarity: a coin, a potion, a gem that sparkles, a rare blade in a pulsing ring, the legend under a pillar of light
const LOOT_W = { coin: 45, potion: 25, gem: 15, rare: 10, legend: 5 };
const SWINGS = { whirl: { r: 0.16 }, cleave: { r: 0.2, cone: 1.1 }, hammer: { r: 0.22, ring: true }, chain: { n: 3, bolt: true } };
const SWING_W = { cleave: [3, 2, 1], whirl: [2, 2, 2], hammer: [1, 2, 2], chain: [1, 2, 3] };

function newMob(rnd, band, kind = rollW(rnd, FIEND_W, band)) {
  const side = Math.floor(rnd() * 4);
  return { x: side === 0 ? 0.06 : side === 1 ? 0.94 : 0.1 + rnd() * 0.8, y: side === 2 ? 0.1 : side === 3 ? 0.82 : 0.15 + rnd() * 0.6, kind, hp: FIENDS[kind].hp, flash: 0, dead: 0, ph: rnd() * TAU, ang: rnd() * TAU };
}

const arpg = {
  init(W) {
    const { w, rnd } = W, band = bandOf(W.a);
    Object.assign(w, { hero: { x: 0.5, y: 0.5, dir: 1, whirl: 0, hurt: 0 }, swing: rollW(rnd, SWING_W, band), mobs: Array.from({ length: 8 }, () => newMob(rnd, band)), fire: [], loot: [], sparks: [], arrows: [], chain: null, ringT: 0, life: 1,
      stones: Array.from({ length: 40 }, () => [rnd(), rnd()]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, Hh = w.hero, bps = f.bpm ? f.bpm / 60 : 2, band = bandOf(W.a), SW = SWINGS[w.swing];
    const alive = () => w.mobs.filter((m) => m.hp > 0);
    const drop = (m) => { if (rnd() < 0.5 || FIENDS[m.kind].big) w.loot.push({ x: m.x, y: m.y, kind: pickW(rnd, Object.keys(LOOT_W), (k) => LOOT_W[k] * (k === 'legend' && FIENDS[m.kind].big ? 8 : 1)), t: 0 }); };
    const hit = (m, dmg) => { m.hp -= dmg; m.flash = 0.2; if (m.hp <= 0) drop(m); };
    for (const hh of hits) {
      if (isLow(hh)) {
        Hh.whirl = 1;
        s.shake = Math.max(s.shake, SW.ring ? 0.5 : 0.3);
        if (SW.bolt) { // the chain: the nearest, then the nearest to that, three in all
          const left = alive(), path = [];
          let from = { x: Hh.x, y: Hh.y }, reach = 0.3;
          for (let k = 0; k < SW.n; k++) { const m = left.filter((q) => !path.includes(q) && Math.hypot(q.x - from.x, q.y - from.y) < reach).sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0]; if (!m) break; path.push(m); hit(m, 2); from = m; reach = 0.2; }
          w.chain = { pts: [[Hh.x, Hh.y], ...path.map((m) => [m.x, m.y])], t: 0.2 };
        } else {
          if (SW.ring) w.ringT = 0.3;
          for (const m of alive()) { const dx = m.x - Hh.x, dy = m.y - Hh.y, d = Math.hypot(dx, dy); if (d < SW.r && (!SW.cone || Math.abs(Math.atan2(dy, dx * Hh.dir)) < SW.cone / 2)) hit(m, 2); }
        }
      } else if (hh.kind === 'snare') { const m = alive().sort((a, b) => Math.hypot(a.x - Hh.x, a.y - Hh.y) - Math.hypot(b.x - Hh.x, b.y - Hh.y))[0]; if (m) w.fire.push({ x: Hh.x, y: Hh.y, tx: m.x, ty: m.y, t: 0, m }); }
    }
    if (f.section === 'drop') { w.swing = 'hammer'; for (let k = 0; k < 2; k++) { const m = w.mobs.find((q) => q.hp <= 0) || w.mobs[k]; Object.assign(m, newMob(rnd, band, 'brute')); } }
    else if (f.section === 'change') w.swing = rollW(rnd, SWING_W, band);
    Hh.whirl = Math.max(0, Hh.whirl - dt * 2.5);
    Hh.hurt -= dt; w.ringT -= dt;
    w.life = Math.min(1, w.life + dt * 0.05);
    r.fill(DARK);
    for (const [sx, sy] of w.stones) r.rect(sx * N, sy * N, 4 * u, 3 * u, DARK + DIM);
    for (let k = 0; k < N; k += 0.125 * N) { r.rect(k, 0, Math.max(1, u * 0.5), N, BLACK); r.rect(0, k, N, Math.max(1, u * 0.5), BLACK); }
    r.rect(0, 0, N, 0.06 * N, MID);
    r.rect(0, 0, 0.04 * N, N, MID);
    r.rect(0.96 * N, 0, 0.04 * N, N, MID);
    for (const bx of [0.2, 0.8]) { r.rect(bx * N - 2 * u, 0.06 * N, 4 * u, 4 * u, MID); r.disc(bx * N, 0.05 * N, (2 + (Math.floor(t * 10 + bx * 10) % 2)) * u, HOT); }
    for (const m of w.mobs) {
      const K = FIENDS[m.kind], sz = K.size;
      if (m.hp <= 0) { m.dead += dt; r.rect(m.x * N - 3 * u * sz, m.y * N - u, 6 * u * sz, 2 * u, DARK + DIM); if (m.dead > 3) Object.assign(m, newMob(rnd, band)); continue; }
      const dx = Hh.x - m.x, dy = Hh.y - m.y, d = Math.hypot(dx, dy) || 1, sp = dt * 0.03 * bps * K.v;
      m.flash -= dt; m.ph += dt * 6;
      if (K.circle) { m.ang += dt * 2; const R = 0.12 + 0.04 * Math.sin(t * 1.3 + m.ph); m.x = follow(m.x, Hh.x + Math.cos(m.ang) * R, dt, 0.4); m.y = follow(m.y, Hh.y + Math.sin(m.ang) * R, dt, 0.4); }
      else if (K.range) { if (d > K.range) { m.x += (dx / d) * sp; m.y += (dy / d) * sp; } else if (d < K.range * 0.7) { m.x -= (dx / d) * sp; m.y -= (dy / d) * sp; } if (f.beat.on && f.beat.count % 2 === 0 && d <= K.range) w.arrows.push({ x: m.x, y: m.y, vx: (dx / d) * 0.6, vy: (dy / d) * 0.6 }); }
      else if (d > 0.08) { m.x += (dx / d) * sp; m.y += (dy / d) * sp; if (K.dart) { m.x += (-dy / d) * Math.sin(m.ph) * sp * 1.5; m.y += (dx / d) * Math.sin(m.ph) * sp * 1.5; } }
      else if (f.beat.on && (K.big ? f.beat.count % 4 === 0 : f.beat.count % 2 === 0)) { Hh.hurt = 0.3; w.life = Math.max(0, w.life - (K.big ? 0.25 : 0.1)); if (K.big) s.shake = Math.max(s.shake, 0.5); }
      m.x = clamp(m.x, 0.06, 0.94); m.y = clamp(m.y, 0.1, 0.82);
      const mx = m.x * N, my = m.y * N, col = m.flash > 0 ? BRIGHT : K.big ? LMID : MID;
      r.rect(mx - 2.5 * u * sz, my - u, 5 * u * sz, Math.max(1, u), DARK + DIM);
      if (K.circle) { const flap = Math.sin(t * 16 + m.ph) * 2.5 * u; for (const k of [-1, 1]) r.poly([[mx, my - 4 * u], [mx + k * 5 * u, my - 4 * u - flap], [mx + k * 3.5 * u, my - 2 * u]], col); r.disc(mx, my - 4 * u, 1.5 * u, col); }
      else {
        r.rect(mx - 2.5 * u * sz, my - 6 * u * sz, 5 * u * sz, 6 * u * sz, col);
        r.disc(mx, my - 7 * u * sz, 2.2 * u * sz, col);
        r.rect(mx - 1.5 * u * sz, my - 7.5 * u * sz, Math.max(1, u), Math.max(1, u), HOT);
        r.rect(mx + 0.5 * u * sz, my - 7.5 * u * sz, Math.max(1, u), Math.max(1, u), HOT);
        if (K.range) r.ring(mx - 3.5 * u, my - 4 * u, 2.5 * u, Math.max(1, u * 0.7), LMID);
        else if (K.big) { r.stroke(mx + 3 * u * sz, my - 5 * u * sz, mx + 6 * u * sz, my - 11 * u * sz, 2 * u, DARK); r.disc(mx + 6 * u * sz, my - 11 * u * sz, 2.5 * u, DARK); }
        else if (!K.dart) for (const k of [-1, 1]) r.rect(mx + k * 3.5 * u - u, my - 5 * u + Math.sin(m.ph + k) * u, 2 * u, Math.max(1, u), col);
      }
      targets.push({ x: mx - 3 * u * sz, y: my - 10 * u * sz, w: 6 * u * sz, h: 10 * u * sz });
    }
    w.arrows = w.arrows.filter((a) => { // the archers' arrows cross the room at the hero
      a.x += a.vx * dt; a.y += a.vy * dt;
      r.line(a.x * N, a.y * N, (a.x - a.vx * 0.03) * N, (a.y - a.vy * 0.03) * N, BRIGHT);
      if (Math.hypot(a.x - Hh.x, a.y - Hh.y) < 0.03) { Hh.hurt = 0.3; w.life = Math.max(0, w.life - 0.08); return false; }
      return a.x > 0.04 && a.x < 0.96 && a.y > 0.06 && a.y < 0.95;
    });
    w.fire = w.fire.filter((b) => {
      b.t += dt * 3;
      const k = Math.min(1, b.t), x = lerp(b.x, b.tx, k) * N, y = lerp(b.y, b.ty, k) * N;
      r.disc(x, y, 2 * u, HOT);
      r.disc(x - u, y - u, Math.max(1, u), BRIGHT);
      if (k >= 1) { burst(w.sparks, rnd, x, y, 10, N * 0.4, HOT, 0.4); if (b.m.hp > 0) hit(b.m, 1); return false; }
      return true;
    });
    w.sparks = particles(W, w.sparks, HOT);
    w.loot = w.loot.filter((l) => { // each rarity its own shape and glow
      l.t += dt;
      const lx = l.x * N, ly = l.y * N, bob = Math.sin(l.t * 3) * u;
      if (l.kind === 'coin') r.disc(lx, ly - u, 1.5 * u, BRIGHT);
      else if (l.kind === 'potion') { r.rect(lx - 1.5 * u, ly - 3 * u, 3 * u, 3 * u, HOT); r.rect(lx - u * 0.5, ly - 4.5 * u, Math.max(1, u), 1.5 * u, LMID); }
      else if (l.kind === 'gem') { r.poly([[lx, ly - 5 * u], [lx + 2.5 * u, ly - 2.5 * u], [lx, ly], [lx - 2.5 * u, ly - 2.5 * u]], COOL); if (Math.floor(t * 6) % 2) r.rect(lx + 2 * u, ly - 6 * u - bob, Math.max(1, u), Math.max(1, u), BRIGHT); }
      else if (l.kind === 'rare') { r.line(lx - 3 * u, ly, lx + 3 * u, ly - 4 * u, LMID); r.line(lx - u, ly - 3 * u, lx + u, ly - u, DARK); r.ring(lx, ly - 2 * u, (4 + Math.sin(l.t * 5)) * u, Math.max(1, u), COOL); }
      else { // the legend: a pillar of light up to the ceiling, a halo of sparks round it
        r.rect(lx - 2 * u, 0.06 * N, 4 * u, ly - 0.06 * N, BRIGHT + DIM);
        r.rect(lx - u, 0.06 * N, 2 * u, ly - 0.06 * N, Math.floor(t * 12) % 2 ? BRIGHT : LMID);
        r.rect(lx - 2.5 * u, ly - 3 * u, 5 * u, 3 * u, BRIGHT);
        for (let k = 0; k < 6; k++) { const a = l.t * 3 + (k * TAU) / 6; r.rect(lx + Math.cos(a) * 6 * u, ly - 2 * u + Math.sin(a) * 3 * u, Math.max(1, u), Math.max(1, u), HOT); }
      }
      return Math.hypot(l.x - Hh.x, l.y - Hh.y) > 0.06 && l.t < 20;
    });
    const goal = w.loot.sort((a, b) => LOOT_W[a.kind] - LOOT_W[b.kind])[0]; // the rarest first
    const gx = goal ? goal.x : 0.5;
    if (Math.abs(gx - Hh.x) > 0.01) Hh.dir = Math.sign(gx - Hh.x);
    Hh.x = follow(Hh.x, goal ? goal.x : 0.5, dt, goal ? 1.5 : 3);
    Hh.y = follow(Hh.y, goal ? goal.y : 0.5, dt, goal ? 1.5 : 3);
    const hx = Hh.x * N, hy = Hh.y * N, hs = 0.12 * N, k = Hh.whirl > 0 ? 1 - Hh.whirl : -1;
    if (w.ringT > 0) { r.ring(hx, hy, hs * 1.9 * (1 - w.ringT / 0.3), 1.5 * u, LMID, 0.6); for (let i = 0; i < 5; i++) { const a = i * 1.26; r.line(hx + Math.cos(a) * hs * 0.3, hy + Math.sin(a) * hs * 0.15, hx + Math.cos(a) * hs * 0.9, hy + Math.sin(a) * hs * 0.45, BLACK); } }
    if (w.chain && (w.chain.t -= dt) > 0) for (let i = 1; i < w.chain.pts.length; i++) { // the lightning, jagged between its stops
      const [ax, ay] = w.chain.pts[i - 1], [bx, by] = w.chain.pts[i];
      let px = ax * N, py = ay * N;
      for (let q = 1; q <= 4; q++) { const nx = lerp(ax, bx, q / 4) * N + (q < 4 ? (hash(i * 7 + q, Math.floor(t * 40)) - 0.5) * 6 * u : 0), ny = lerp(ay, by, q / 4) * N + (q < 4 ? (hash(i * 11 + q, Math.floor(t * 40)) - 0.5) * 6 * u : 0); r.stroke(px, py, nx, ny, 1.5 * u, q % 2 ? COOL : BRIGHT); px = nx; py = ny; }
    }
    if (w.swing === 'cleave' && k >= 0 && k < 0.5) r.poly([[hx, hy - hs * 0.4], [hx + Hh.dir * Math.cos(-0.55) * hs * 1.6, hy - hs * 0.4 + Math.sin(-0.55) * hs * 0.8], [hx + Hh.dir * hs * 1.7, hy - hs * 0.4], [hx + Hh.dir * Math.cos(0.55) * hs * 1.6, hy - hs * 0.4 + Math.sin(0.55) * hs * 0.8]], LMID + DIM);
    if (w.swing === 'whirl' && Hh.whirl > 0) { for (let i = 0; i < 3; i++) { const a = t * 25 + (i / 3) * TAU; r.stroke(hx, hy - hs * 0.4, hx + Math.cos(a) * hs * 0.9, hy - hs * 0.4 + Math.sin(a) * hs * 0.45, Math.max(1, 1.5 * u), BRIGHT); } r.ring(hx, hy - hs * 0.4, hs * (1.2 - Hh.whirl * 0.5), Math.max(1, u), LMID, 0.5); }
    const col = Hh.hurt > 0 && Math.floor(t * 20) % 2 ? HOT : FIG;
    const J = walker(r, hx, hy, hs, col, Hh.whirl > 0 ? 0 : 0.3 * Math.sin(t * 6), Hh.dir, { hat: true, hatCol: HOT });
    const sx = J.sx, sy = J.sy + hs * 0.3;
    if (w.swing === 'hammer') { const a = k >= 0 ? lerp(-1.6, 0.5, k) : -0.3, ex = sx + Hh.dir * Math.cos(a) * hs * 0.5, ey = sy + Math.sin(a) * hs * 0.5; r.stroke(sx, sy, ex, ey, Math.max(1, u), DARK); r.rect(ex - 2.5 * u, ey - 2.5 * u, 5 * u, 5 * u, LMID); }
    else if (w.swing === 'chain') { r.stroke(sx, sy, sx + Hh.dir * hs * 0.2, sy - hs * 0.5, Math.max(1, u), DARK); r.disc(sx + Hh.dir * hs * 0.2, sy - hs * 0.55, k >= 0 && k < 0.4 ? 2.5 * u : 1.5 * u, COOL); }
    else if (w.swing === 'cleave') { const a = k >= 0 ? lerp(-1.2, 0.9, k) : -0.2; r.stroke(sx, sy, sx + Hh.dir * Math.cos(a) * hs * 0.6, sy + Math.sin(a) * hs * 0.6, Math.max(1, 1.5 * u), BRIGHT); }
    else if (Hh.whirl <= 0) r.stroke(sx, sy, sx + Hh.dir * hs * 0.5, sy - hs * 0.2, Math.max(1, 1.5 * u), BRIGHT);
    targets.push({ x: hx - hs * 0.3, y: hy - hs, w: hs * 0.6, h: hs });
    for (const [ox, c, fill] of [[0.1, HOT, clamp(0.4 + 0.6 * f.level) * w.life], [0.9, COOL, clamp(f.tonalAvg * 1.4)]]) {
      const oy = 0.88 * N, R = 0.08 * N;
      r.disc(ox * N, oy, R, BLACK);
      for (let y = Math.round(oy - R); y <= oy + R; y++) { const half = Math.sqrt(Math.max(0, R * R - (y + 0.5 - oy) ** 2)); if ((oy + R - y) / (2 * R) < fill + 0.02 * Math.sin(t * 4 + y)) r.rect(ox * N - half, y, 2 * half, 1, c); }
      r.ring(ox * N, oy, R, Math.max(1, 1.5 * u), LMID);
      r.disc(ox * N - R * 0.4, oy - R * 0.4, R * 0.15, BRIGHT);
    }
    r.rect(0.22 * N, 0.9 * N, 0.56 * N, 0.07 * N, MID);
    for (let q = 0; q < 8; q++) r.rect(0.24 * N + q * 0.065 * N, 0.915 * N, 0.05 * N, 0.04 * N, q < 3 ? HOT : q < 5 ? COOL : DARK);
  },
};

// ---------------------------------------------------------------------------------------------- prison
// The yard from the side: a wall topped with wire across the back, a watchtower behind it whose light sweeps the
// yard with the mids, a hoop at one end with a ball dribbled on the beat (off the floor on one beat, back on it
// for the next), and the inmates, striped or plain, walking their circle a step a beat. Every four bars a roll
// call: they walk into a line and a guard goes along it with a lamp. A snare is the whistle and everyone freezes
// for a beat; a drop is a riot: smoke, running, fists up, the light strobing; a section change turns day to night.
const prison = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { men: Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * TAU, x: 0.5 + Math.cos((i / 9) * TAU) * 0.3, y: 0.8 + Math.sin((i / 9) * TAU) * 0.12, h: 0.15 + rnd() * 0.03, stripes: rnd() < 0.5, cap: rnd() < 0.4, ph: rnd() * TAU, dir: 1, tx: 0.5, moving: false })),
      night: rnd() < 0.5, roll: 0, stop: 0, since: 9, riot: 0, smoke: [], ball: { y: 0, vy: 0 } });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, bps = f.bpm ? f.bpm / 60 : 2, T = 1 / bps, g = 0.62 * N, wallTop = 0.34 * N, lineY = 0.72;
    for (const hh of hits) if (hh.kind === 'snare' && hh.strength > 0.65 && w.since > 4 * T) { w.stop = T; w.since = 0; } // the whistle: a hard snare, not oftener than once in four beats
    if (f.section === 'drop') { w.riot = 8; w.roll = 0; s.shake = Math.max(s.shake, 0.3); }
    else if (f.section === 'change') w.night = !w.night;
    if (f.beat.on && f.beat.count % 16 === 0 && w.riot <= 0) w.roll = 6 * T;
    w.stop -= dt; w.roll -= dt; w.riot -= dt; w.since += dt;
    const night = w.night, frozen = w.stop > 0, riot = w.riot > 0, roll = w.roll > 0;
    // the sky, the wall with the wire on it, the tower and its light
    if (!night) { r.rect(0, 0, N, g, LMID); r.disc(0.2 * N, 0.1 * N, 0.045 * N, BRIGHT); }
    else for (let k = 0; k < 30; k++) r.set(hash(k, 1) * N, hash(k, 2) * 0.3 * N, BRIGHT);
    r.rect(0, wallTop, N, g - wallTop, night ? MID + DIM : MID);
    for (let y = wallTop + 3 * u; y < g; y += 5 * u) for (let x = (Math.round(y / (5 * u)) % 2) * 5 * u; x < N; x += 10 * u) r.rect(x, y, 5 * u, Math.max(1, u), night ? DARK + DIM : MID + DIM);
    r.rect(0, wallTop, N, Math.max(1, u), night ? MID : LMID);
    for (let x = 0; x < N; x += 4 * u) { r.line(x, wallTop - 2 * u, x + 2 * u, wallTop - 5 * u, DARK); r.line(x + 2 * u, wallTop - 5 * u, x + 4 * u, wallTop - 2 * u, DARK); }
    for (let x = 8 * u; x < N; x += 30 * u) r.rect(x, wallTop - 6 * u, Math.max(1, u), 6 * u, DARK);
    const tx = 0.86 * N, cabY = 0.1 * N;
    for (const k of [-1, 1]) r.rect(tx + k * 4 * u - u, cabY + 9 * u, 2 * u, wallTop - cabY - 9 * u, DARK);
    for (let y = cabY + 11 * u; y < wallTop - 6 * u; y += 9 * u) { r.line(tx - 4 * u, y, tx + 4 * u, y + 7 * u, DARK); r.line(tx + 4 * u, y, tx - 4 * u, y + 7 * u, DARK); }
    r.rect(tx - 7 * u, cabY, 14 * u, 9 * u, DARK);
    r.rect(tx - 8 * u, cabY - 2 * u, 16 * u, 2 * u, DARK);
    r.rect(tx - 5 * u, cabY + 2 * u, 10 * u, 4 * u, night ? BRIGHT : LMID);
    targets.push({ x: tx - 8 * u, y: cabY - 2 * u, w: 16 * u, h: 11 * u });
    const la = 2.0 + 0.5 * Math.sin(f.rel.midClock * 0.6), ax = tx - 7 * u, ay = cabY + 6 * u;
    if ((night || riot) && !(riot && Math.floor(t * 14) % 2)) for (let y = Math.ceil(ay + 2); y < N; y += 2) { const d = (y - ay) / Math.sin(la), xc = ax + Math.cos(la) * d, half = d * 0.1; r.rect(xc - half, y, 2 * half, 1, night ? BRIGHT : BRIGHT + DIM); }
    if (frozen) for (let k = -1; k <= 1; k++) r.line(tx - 9 * u, cabY + 4 * u, tx - 14 * u, cabY + 4 * u + k * 4 * u, BRIGHT); // the whistle
    // the yard, the hoop at the end of it
    r.rect(0, g, N, N - g, night ? DARK : LMID + DIM);
    r.rect(0, g, N, Math.max(1, u), night ? MID : BRIGHT);
    const hoopX = 0.1 * N, hoopY = 0.8 * N;
    r.rect(hoopX - u, hoopY - 0.33 * N, 2 * u, 0.33 * N, MID);
    r.rect(hoopX - 6 * u, hoopY - 0.37 * N, 12 * u, 8 * u, night ? LMID : BRIGHT);
    r.rect(hoopX - u, hoopY - 0.3 * N, 10 * u, Math.max(1, u), HOT);
    for (let k = 0; k < 4; k++) r.line(hoopX - u + k * 3 * u, hoopY - 0.3 * N, hoopX + k * 2 * u, hoopY - 0.26 * N, LMID);
    // the dribbler: the ball leaves the floor on the beat with just the speed to be back on it for the next
    const B = w.ball, bx = hoopX + 0.1 * N, rad = 2.2 * u, gY = (0.96 * N) / (T * T), dh = 0.17 * N, dx = bx - 0.05 * N;
    if (frozen) { B.y = hoopY - dh * 0.5; B.vy = 0; }
    else {
      if (f.beat.on && !riot && B.y > hoopY - rad - 0.03 * N) { B.y = hoopY - rad; B.vy = -gY * T * 0.5; }
      B.vy += gY * dt; B.y += B.vy * dt;
      if (B.y > hoopY - rad) { B.y = hoopY - rad; B.vy = -Math.abs(B.vy) * 0.7; }
    }
    r.rect(dx - dh * 0.2, hoopY, dh * 0.4, Math.max(1, u), DARK);
    walker(r, dx, hoopY, dh, FIG, frozen || riot ? 0 : 0.3 * Math.sin(t * 6), 1, { cap: true });
    r.stroke(dx + dh * 0.12, hoopY - dh * 0.68, bx, Math.max(hoopY - dh * 0.68, B.y - rad), Math.max(1, 1.2 * u), FIG);
    r.disc(bx, B.y, rad, HOT);
    r.line(bx - rad, B.y, bx + rad, B.y, DARK);
    // the inmates: round the circle a step a beat, into the line for the roll call, running in the riot, still on the whistle
    const lit = roll && w.roll < 3 * T ? lerp(0.78, 0.18, 1 - w.roll / (3 * T)) : -1; // where the lamp is along the line
    w.men.forEach((m, i) => {
      let tx2, ty2, v = 0.3;
      if (riot) { if (Math.abs(m.tx - m.x) < 0.02) m.tx = 0.15 + rnd() * 0.7; tx2 = m.tx; ty2 = m.y; v = 0.5; }
      else if (roll) { tx2 = 0.18 + i * 0.075; ty2 = lineY; }
      else { if (!frozen) m.a += dt * bps * 0.35; tx2 = 0.5 + Math.cos(m.a) * 0.3; ty2 = 0.8 + Math.sin(m.a) * 0.12; }
      const d = Math.hypot(tx2 - m.x, ty2 - m.y), st = frozen ? 0 : Math.min(d, v * dt);
      m.moving = st > 0.0004;
      if (m.moving) { m.x += ((tx2 - m.x) / d) * st; m.y += ((ty2 - m.y) / d) * st; m.ph += dt * bps * Math.PI * (riot ? 2.5 : 1); if (Math.abs(tx2 - m.x) > 0.005) m.dir = Math.sign(tx2 - m.x); }
    });
    for (const m of [...w.men].sort((a, b) => a.y - b.y)) { // far to near
      const x = m.x * N, y = m.y * N, h = m.h * N * (0.7 + (0.5 * (m.y - 0.68)) / 0.24), col = lit >= 0 && Math.abs(m.x - lit) < 0.04 ? BRIGHT : FIG;
      r.rect(x - h * 0.2, y, h * 0.4, Math.max(1, u), DARK);
      const J = walker(r, x, y, h, col, m.moving ? m.ph : 0, m.dir, { cap: m.cap });
      if (m.stripes) for (let yy = y - h * 0.72; yy < y - h * 0.36; yy += 3 * u) r.rect(x - J.hw, yy, 2 * J.hw, Math.max(1, u), MID);
      if (riot && f.beat.pulse > 0.5) r.line(J.sx, J.sy, J.sx + m.dir * h * 0.15, J.sy - h * 0.3, col); // a fist up
      targets.push({ x: x - h * 0.25, y: y - h, w: h * 0.5, h });
    }
    if (roll) { // the guard, his lamp, the spot it throws along the line
      const gx = (lit >= 0 ? lit + 0.08 : 0.88) * N, gy = lineY * N + 2 * u, J = walker(r, gx, gy, 0.17 * N, FIG, lit >= 0 ? 0.3 * Math.sin(t * 7) : 0, -1, { cap: true, hatCol: HOT });
      r.rect(J.sx - u, J.sy + 0.03 * N, 2 * u, 2 * u, BRIGHT);
      if (lit >= 0) { for (let k = -2; k <= 2; k++) r.line(J.sx, J.sy + 0.04 * N, lit * N + k * 2 * u, gy, BRIGHT + DIM); r.ring(lit * N, gy, 5 * u, 2 * u, BRIGHT, 0.35); }
    }
    // the riot's smoke: it rises, slows and spreads
    if (riot) for (let k = 0; k < 3; k++) if (rnd() < dt * 12) w.smoke.push({ x: (0.15 + rnd() * 0.7) * N, y: (0.7 + rnd() * 0.22) * N, vy: -(0.08 + rnd() * 0.08) * N, vx: (rnd() - 0.5) * 0.04 * N, life: 2.5, r: 2 * u });
    w.smoke = w.smoke.filter((p) => { p.vy = follow(p.vy, -0.015 * N, dt, 1.2); p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 2.5 * u; p.life -= dt; r.disc(p.x, p.y, p.r, p.life > 1 ? LMID + DIM : MID + DIM); return p.life > 0; });
  },
};

// ---------------------------------------------------------------------------------------------- motorcade
// A parade down a boulevard: the camera on one kerb, the vanishing point up the road, the crowd on both kerbs
// waving on the beat, bunting across, an open car coming down at the tempo with two figures standing in the back
// and outriders ahead and behind, confetti coming down over everything. A kick is a camera flash in the crowd, a
// snare a burst of confetti, a section change moves the camera to the other kerb. Nothing happens to anyone.
const motorcade = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { side: rnd() < 0.5 ? 1 : -1, carZ: 6 + rnd() * 6, conf: [], flashes: [],
      crowd: Array.from({ length: 64 }, (_, i) => ({ z: 1.3 + (i % 32) * 0.34 + rnd() * 0.25, k: i < 32 ? -1 : 1, off: 0.56 + rnd() * 0.12, h: 0.8 + rnd() * 0.4 })),
      bld: Array.from({ length: 14 }, (_, i) => ({ z: 1.4 + (i % 7) * 1.6, k: i < 7 ? -1 : 1, h: 0.5 + rnd() * 0.6, dark: rnd() < 0.5 })) });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, hz = 0.42 * N, vx = 0.5 * N, bps = f.bpm ? f.bpm / 60 : 2, cam = -0.3 * w.side;
    const gy = (z) => hz + (N - hz) / z, gx = (lat, z) => vx + ((lat - cam) * N) / z; // the ground at depth z; a lateral offset (in road widths) at depth z
    for (const hh of hits) {
      if (isLow(hh)) { const c = pick(rnd, w.crowd); w.flashes.push({ x: gx(c.k * c.off, c.z), y: gy(c.z) - (0.14 * N * c.h) / c.z, t: 0.07 }); }
      else if (hh.kind === 'snare') for (let k = 0; k < 14; k++) w.conf.push({ x: (0.1 + rnd() * 0.8) * N, y: rnd() * 0.25 * N, vx: (rnd() - 0.5) * 0.15 * N, vy: (rnd() - 0.5) * 0.1 * N, a: rnd() * TAU, c: [HOT, COOL, BRIGHT][k % 3] });
    }
    if (f.section === 'change') w.side = -w.side;
    if (rnd() < dt * (2 + 8 * f.level)) w.conf.push({ x: rnd() * N, y: -2 * u, vx: 0, vy: 0, a: rnd() * TAU, c: [HOT, COOL, BRIGHT][Math.floor(rnd() * 3)] });
    w.carZ -= dt * bps * 0.45;
    if (w.carZ < 0.7) w.carZ = 11 + rnd() * 2; // past us and out of the frame before the next comes down the road
    // the boulevard: pavements, the road, the kerbs, the centre line (the camera stands still, so do the markings)
    r.rect(0, hz, N, N - hz, MID + DIM);
    r.poly([[gx(-0.5, 14), gy(14)], [gx(0.5, 14), gy(14)], [gx(0.5, 0.4), gy(0.4)], [gx(-0.5, 0.4), gy(0.4)]], DARK);
    for (const k of [-1, 1]) r.line(gx(k * 0.5, 14), gy(14), gx(k * 0.5, 0.4), gy(0.4), LMID);
    for (let z = 1; z < 14; z += 1) r.line(gx(0, z), gy(z), gx(0, z + 0.45), gy(z + 0.45), LMID);
    r.rect(0, hz, N, Math.max(1, u), MID);
    // the buildings, the bunting across the road (strung from kerb post to kerb post), the crowd on the kerbs, the car
    // and its outriders: everything sorted by depth and sized by it
    const things = [];
    for (const b of w.bld) things.push({ z: b.z, draw() {
      const x0 = gx(b.k * 0.62, b.z), x1 = gx(b.k * 1.7, b.z), top = gy(b.z) - (1.1 * N * b.h) / b.z;
      r.rect(Math.min(x0, x1), top, Math.abs(x1 - x0), gy(b.z) - top, b.dark ? DARK : MID);
      r.rect(Math.min(x0, x1), top, Math.abs(x1 - x0), Math.max(1, u), LMID);
      if (b.z < 8) for (let j = 1; j < 5; j++) for (let i = 1; i < 5; i++) if (hash(i + j * 5, Math.round(b.z * 10)) < 0.7) r.rect(lerp(x0, x1, i / 5), lerp(top, gy(b.z), j / 5.5), Math.max(1, (2 * u) / b.z), Math.max(1, (2.5 * u) / b.z), b.dark ? LMID : BRIGHT);
    } });
    for (const z of [9, 5.5, 3, 1.7]) things.push({ z, draw() {
      const y0 = gy(z) - (0.5 * N) / z, xa = gx(-0.5, z), xb = gx(0.5, z);
      for (const x of [xa, xb]) r.rect(x - Math.max(1, u / z), y0, Math.max(1, (2 * u) / z), gy(z) - y0, DARK);
      let px = xa, py = y0;
      for (let k = 1; k <= 10; k++) { const q = k / 10, nx = lerp(xa, xb, q), ny = y0 + (Math.sin(q * Math.PI) * 0.08 * N) / z; r.line(px, py, nx, ny, DARK); if (k < 10) r.poly([[nx - (2 * u) / z, ny], [nx + (2 * u) / z, ny], [nx, ny + (4 * u) / z]], [HOT, COOL, BRIGHT][k % 3]); px = nx; py = ny; }
    } });
    for (const c of w.crowd) things.push({ z: c.z, draw() {
      const x = gx(c.k * c.off, c.z), y = gy(c.z), h = (0.2 * N * c.h) / c.z, hw = Math.max(1, (0.035 * N) / c.z);
      r.rect(x - hw, y - h * 0.75, 2 * hw, h * 0.75, DARK);
      r.disc(x, y - h * 0.86, h * 0.13, DARK);
      if (f.beat.pulse > 0.4 && hash(Math.round(c.z * 100), f.beat.count) < 0.6) { r.line(x - hw, y - h * 0.7, x - hw * 2.2, y - h * 1.1, DARK); r.line(x + hw, y - h * 0.7, x + hw * 2.2, y - h * 1.05, DARK); }
    } });
    const car = (z) => things.push({ z, draw() {
      const x = gx(0, z), y = gy(z), cw = (0.26 * N) / z, ch = (0.2 * N) / z;
      r.rect(x - cw * 0.46, y - ch * 0.35, cw * 0.14, ch * 0.35, BLACK); r.rect(x + cw * 0.32, y - ch * 0.35, cw * 0.14, ch * 0.35, BLACK); // the wheels
      r.rect(x - cw / 2, y - ch * 0.62, cw, ch * 0.5, MID);
      r.rect(x - cw / 2, y - ch * 0.62, cw, Math.max(1, ch * 0.08), LMID);
      r.rect(x - cw * 0.38, y - ch * 0.95, cw * 0.76, ch * 0.36, LMID); // the windscreen
      r.rect(x - cw * 0.38, y - ch * 0.95, cw * 0.76, Math.max(1, ch * 0.05), DARK);
      for (const k of [-1, 1]) r.disc(x + k * cw * 0.36, y - ch * 0.3, Math.max(1, ch * 0.1), BRIGHT); // the lamps
      for (const [k, dh] of [[-0.18, 1.35], [0.2, 1.42]]) { // two standing in the back, a wave to the kerbs on the beat
        const hx = x + k * cw, hy = y - ch * dh, hr = Math.max(1, ch * 0.11);
        r.rect(hx - hr * 1.6, hy + hr, hr * 3.2, ch * 0.3, FIG); r.disc(hx, hy, hr, FIG);
        if (f.beat.pulse > 0.5) r.line(hx + Math.sign(k) * hr * 1.6, hy + hr * 1.5, hx + Math.sign(k) * hr * 3, hy - hr * 1.5, FIG);
      }
      targets.push({ x: x - cw / 2, y: y - ch * 1.55, w: cw, h: ch * 1.55 });
    } });
    const bike = (z, lat) => things.push({ z, draw() {
      const x = gx(lat, z), y = gy(z), h = (0.17 * N) / z;
      r.rect(x - Math.max(1, h * 0.1), y - h * 0.45, Math.max(1, h * 0.2), h * 0.45, BLACK);
      r.rect(x - h * 0.2, y - h * 0.6, h * 0.4, h * 0.2, MID);
      r.rect(x - h * 0.15, y - h * 1.05, h * 0.3, h * 0.5, FIG); r.disc(x, y - h * 1.12, h * 0.12, FIG);
      r.disc(x, y - h * 0.5, Math.max(1, h * 0.07), BRIGHT);
    } });
    car(w.carZ);
    for (const [dz, lat] of [[-1.6, -0.2], [-1.6, 0.24], [1.8, -0.22], [1.8, 0.26]]) if (w.carZ + dz > 0.5) bike(w.carZ + dz, lat);
    things.sort((p, q) => q.z - p.z);
    for (const th of things) th.draw();
    // the confetti (it falls to a terminal speed and drifts) and the camera flashes
    w.conf = w.conf.filter((p) => {
      p.vy = Math.min(p.vy + N * 0.6 * dt, N * 0.22); p.vx *= Math.exp(-dt * 1.5); p.x += p.vx * dt + Math.sin((p.a += dt * 5)) * dt * 10 * u; p.y += p.vy * dt;
      r.rect(p.x, p.y, Math.max(1, Math.round(2 * u * Math.abs(Math.cos(p.a)))), Math.max(1, u), p.c);
      return p.y < N;
    }).slice(-400);
    w.flashes = w.flashes.filter((fl) => { fl.t -= dt; if (fl.t > 0) { r.disc(fl.x, fl.y, 2.5 * u, BRIGHT); for (const [ax, ay] of [[1, 0], [0, 1], [1, 1], [1, -1]]) r.line(fl.x - ax * 5 * u, fl.y - ay * 5 * u, fl.x + ax * 5 * u, fl.y + ay * 5 * u, BRIGHT); } return fl.t > 0; });
  },
};

// ---------------------------------------------------------------------------------------------- rally
// A stage with a podium under two spotlights that cross on the beat, two plain flags waving with the treble, a
// faceless speaker whose arm goes up on every beat, and a crowd of heads below holding blank placards that bob on
// the beat. A snare is a camera flash in the crowd; a drop is the applause: every placard up, arms up, confetti;
// a section change swaps the speaker (height, build) and the colours of the stage.
const rally = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { crowd: Array.from({ length: 110 }, () => ({ x: 0.03 + rnd() * 0.94, y: rnd(), sign: rnd() < 0.45, sw: 0.05 + rnd() * 0.05, ph: rnd() * TAU })).sort((p, q) => p.y - q.y),
      spk: { h: 0.22 + rnd() * 0.06, build: 0.8 + rnd() * 0.5 }, cols: rnd() < 0.5 ? [HOT, COOL] : [COOL, HOT], flagTri: rnd() < 0.5, flashes: [], conf: [], cheer: 0, nod: 0 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s } = W, stageY = 0.58 * N, [c1, c2] = w.cols;
    for (const hh of hits) {
      if (hh.kind === 'snare') w.flashes.push({ x: (0.05 + rnd() * 0.9) * N, y: (0.66 + rnd() * 0.3) * N, t: 0.07 });
      else if (isLow(hh)) w.nod = 1;
    }
    if (f.section === 'drop') { w.cheer = 4; for (let k = 0; k < 150; k++) w.conf.push({ x: rnd() * N, y: -rnd() * 0.4 * N, vx: (rnd() - 0.5) * 0.1 * N, vy: N * (0.05 + rnd() * 0.1), a: rnd() * TAU, c: [c1, c2, BRIGHT][k % 3] }); s.shake = Math.max(s.shake, 0.3); }
    else if (f.section === 'change') { w.spk = { h: 0.2 + rnd() * 0.08, build: 0.7 + rnd() * 0.6 }; w.cols.reverse(); w.flagTri = rnd() < 0.5; }
    w.cheer -= dt; w.nod *= Math.exp(-dt * 5);
    const cheer = w.cheer > 0;
    // the backdrop with a plain banner on it, the two spotlights crossing over the stage
    r.rect(0.12 * N, 0.06 * N, 0.76 * N, stageY - 0.06 * N, DARK);
    r.rect(0.2 * N, 0.1 * N, 0.6 * N, 0.26 * N, c1);
    r.frame(Math.round(0.2 * N), Math.round(0.1 * N), Math.round(0.6 * N), Math.round(0.26 * N), BRIGHT);
    r.rect(0.26 * N, 0.2 * N, 0.48 * N, 0.05 * N, BRIGHT);
    const k = (((f.beat.count % 4) + f.beat.phase) / 4) * TAU;
    for (const [hx, sgn] of [[0.08 * N, 1], [0.92 * N, -1]]) {
      const ang = Math.PI / 2 - sgn * (0.45 + 0.35 * Math.sin(k));
      for (let y = 2; y < stageY; y += 2) { const d = y / Math.sin(ang), xc = hx + Math.cos(ang) * d, half = d * 0.05; if (hash(y, sgn + 2) < 0.75) r.rect(xc - half, y, 2 * half, 1, BRIGHT + DIM); }
      r.rect(hx - 3 * u, 0, 6 * u, 3 * u, DARK);
    }
    // the flags: a rectangle or a pennant on a pole, rippling more toward the free end, with the treble
    for (const [fx, c] of [[0.17 * N, c1], [0.83 * N, c2]]) {
      r.rect(fx - u, stageY - 0.42 * N, 2 * u, 0.42 * N, LMID);
      const top = stageY - 0.4 * N, fw = 0.1 * N, fh = 0.07 * N, dir = fx < N / 2 ? 1 : -1;
      for (let i = 0; i < fw; i++) { const q = i / fw, dy = Math.sin(f.rel.trebClock * 2.5 - q * 5) * 1.5 * u * q, h = w.flagTri ? fh * (1 - q) : fh; r.rect(fx + dir * i, top + dy + (fh - h) / 2, 1, h, c); if (!w.flagTri && q > 0.3 && q < 0.7) r.rect(fx + dir * i, top + dy + fh * 0.4, 1, fh * 0.2, BRIGHT); }
    }
    // the stage, the speaker behind the podium with an arm up on the beat, the podium and its microphone
    r.rect(0.1 * N, stageY, 0.8 * N, 0.08 * N, MID);
    r.rect(0.1 * N, stageY, 0.8 * N, Math.max(1, u), LMID);
    const S = w.spk, sh = S.h * N, sx = 0.5 * N, sw = sh * 0.17 * S.build, shoulder = stageY - sh * 0.62;
    r.rect(sx - sw * 1.3, shoulder, sw * 2.6, sh * 0.62, FIG);
    r.disc(sx, shoulder - sh * 0.14 + w.nod * 1.5 * u, sh * 0.12, FIG);
    const arm = lerp(0.35, -1.25, ease(f.beat.pulse)), ax = sx + sw * 1.3, ay = shoulder + sh * 0.05;
    r.stroke(ax, ay, ax + Math.cos(arm) * sh * 0.3, ay + Math.sin(arm) * sh * 0.3, Math.max(1, 1.5 * u), FIG);
    r.stroke(sx - sw * 1.3, ay, sx - sw * 1.3 - sh * 0.12, ay + sh * 0.22, Math.max(1, 1.5 * u), FIG);
    r.rect(0.45 * N, stageY - 0.13 * N, 0.1 * N, 0.13 * N, c2);
    r.rect(0.44 * N, stageY - 0.14 * N, 0.12 * N, 2 * u, LMID);
    r.rect(0.49 * N, stageY - 0.17 * N, Math.max(1, u), 0.03 * N, DARK); r.rect(0.485 * N, stageY - 0.18 * N, 3 * u, 2 * u, DARK);
    targets.push({ x: sx - sw * 1.5, y: shoulder - sh * 0.28, w: sw * 3, h: sh * 0.9 });
    // the crowd, heads and shoulders, the near ones bigger; the placards bob on the beat and all go up for the applause
    for (const c of w.crowd) {
      const y = stageY + 0.1 * N + c.y * (N - stageY - 0.1 * N), sz = (2.2 + 4 * c.y) * u, x = c.x * N, up = cheer ? 1 : f.beat.pulse * (0.5 + 0.5 * Math.sin(c.ph));
      if (c.sign) { const pw = c.sw * N * (0.6 + 0.6 * c.y), ph2 = pw * 0.6, py = y - sz * 2.5 - up * 5 * u - ph2; r.rect(x - u / 2, py + ph2, Math.max(1, u), sz * 1.8 + up * 5 * u, DARK); r.rect(x - pw / 2, py, pw, ph2, BRIGHT); r.frame(Math.round(x - pw / 2), Math.round(py), Math.round(pw), Math.round(ph2), DARK); }
      r.disc(x, y, sz, DARK);
      r.rect(x - sz * 1.4, y + sz * 0.5, sz * 2.8, sz * 1.5, DARK);
      if (cheer && hash(Math.round(x), f.beat.count) < 0.6) { r.line(x - sz, y - sz * 0.5, x - sz * 1.6, y - sz * 2.6, DARK); r.line(x + sz, y - sz * 0.5, x + sz * 1.6, y - sz * 2.6, DARK); }
    }
    w.conf = w.conf.filter((p) => { p.vy = Math.min(p.vy + N * 0.6 * dt, N * 0.2); p.y += p.vy * dt; p.x += p.vx * dt + Math.sin((p.a += dt * 4)) * dt * 8 * u; r.rect(p.x, p.y, Math.max(1, Math.round(2 * u * Math.abs(Math.cos(p.a)))), Math.max(1, u), p.c); return p.y < N; }).slice(-400);
    w.flashes = w.flashes.filter((fl) => { fl.t -= dt; if (fl.t > 0) { r.disc(fl.x, fl.y, 2.5 * u, BRIGHT); for (const [bx, by] of [[1, 0], [0, 1], [1, 1], [1, -1]]) r.line(fl.x - bx * 5 * u, fl.y - by * 5 * u, fl.x + bx * 5 * u, fl.y + by * 5 * u, BRIGHT); } return fl.t > 0; });
  },
};

// ---------------------------------------------------------------------------------------------- stream
// A stream: the big cam frame with a faceless bust in a headset that nods on the beat and leans in on the kick,
// the room behind it (a shelf, a blank poster or a window, swapped on a section change), the chat down the right
// as empty bubbles coming in with the onsets and pushing the column up, a bright one for a donation on a hard
// snare, when the bust throws its arms up; a row of pips for the followers, a hot dot for being live, a level
// bar. A drop is a raid: the chat floods and confetti comes down over the cam.
const stream = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { room: Math.floor(rnd() * 3), chat: [], acc: 0, lift: 0, lean: 0, arms: 0, flood: 0, followers: 3 + Math.floor(rnd() * 6), conf: [] });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets } = W, cx0 = 0.04 * N, cy0 = 0.08 * N, cw = 0.6 * N, ch = 0.66 * N, chx = 0.7 * N, chw = 0.26 * N, chTop = 0.08 * N, chBot = 0.78 * N;
    let donate = false;
    for (const hh of hits) {
      if (isLow(hh)) w.lean = 1;
      else if (hh.kind === 'snare' && hh.strength > 0.6) { donate = true; w.arms = 0.6; w.followers++; }
      else if (isTonal(hh) && rnd() < 0.2) w.followers++;
    }
    if (f.section === 'drop') { w.flood = 2; w.followers += 5; for (let k = 0; k < 80; k++) w.conf.push({ x: cx0 + rnd() * cw, y: cy0 - rnd() * 0.2 * N, vx: (rnd() - 0.5) * 0.1 * N, vy: N * (0.05 + rnd() * 0.1), a: rnd() * TAU, c: [HOT, COOL, BRIGHT][k % 3] }); }
    else if (f.section === 'change') w.room = (w.room + 1) % 3;
    w.lean *= Math.exp(-dt * 4); w.arms -= dt; w.flood -= dt;
    // the chat: a bubble per onset or so, a flood in a raid; each new one lifts the column by its height
    w.acc += dt * (Math.max(0.6, f.onsetRate) * 0.7 + (w.flood > 0 ? 10 : 0)) + (donate ? 1 : 0);
    while (w.acc >= 1) {
      w.acc -= 1;
      const h = (4 + Math.floor(rnd() * 3)) * u;
      w.chat.push({ y: chBot + w.lift + h, w: 0.35 + rnd() * 0.6, h, bright: donate, side: rnd() < 0.5 });
      donate = false;
      w.lift += h + 2 * u;
    }
    const step = Math.min(w.lift, dt * N * (0.6 + (w.flood > 0 ? 1.5 : 0)) + w.lift * dt * 4);
    w.lift -= step;
    for (const b of w.chat) b.y -= step;
    w.chat = w.chat.filter((b) => b.y - b.h > chTop - 2 * u).slice(-40);
    // the cam frame and the room behind the bust
    r.rect(cx0 - 2 * u, cy0 - 2 * u, cw + 4 * u, ch + 4 * u, LMID);
    r.rect(cx0, cy0, cw, ch, w.room === 2 ? DARK + DIM : MID + DIM);
    if (w.room === 0) { // a shelf of boxes and a plant
      for (const sy of [0.22, 0.4]) { const y = cy0 + sy * ch; r.rect(cx0 + 0.05 * cw, y, 0.4 * cw, 2 * u, LMID); for (let k = 0; k < 4; k++) if (hash(k, sy * 100) < 0.7) { const bh = (4 + hash(k, 3) * 5) * u; r.rect(cx0 + 0.07 * cw + k * 0.09 * cw, y - bh, 5 * u, bh, [HOT, COOL, DARK, LMID][k]); } }
      r.disc(cx0 + 0.5 * cw, cy0 + 0.4 * ch - 3 * u, 4 * u, COOL); r.rect(cx0 + 0.5 * cw - 2 * u, cy0 + 0.4 * ch - 2 * u, 4 * u, 3 * u, DARK);
    } else if (w.room === 1) { // a poster with nothing but a disc on it
      r.rect(cx0 + 0.08 * cw, cy0 + 0.1 * ch, 0.3 * cw, 0.42 * ch, DARK); r.frame(Math.round(cx0 + 0.08 * cw), Math.round(cy0 + 0.1 * ch), Math.round(0.3 * cw), Math.round(0.42 * ch), BRIGHT);
      r.disc(cx0 + 0.23 * cw, cy0 + 0.28 * ch, 0.08 * cw, HOT); r.rect(cx0 + 0.11 * cw, cy0 + 0.44 * ch, 0.24 * cw, 2 * u, LMID);
    } else { // a window on the night
      r.rect(cx0 + 0.06 * cw, cy0 + 0.08 * ch, 0.36 * cw, 0.5 * ch, DARK);
      for (let k = 0; k < 14; k++) r.set(cx0 + (0.08 + hash(k, 7) * 0.32) * cw, cy0 + (0.1 + hash(k, 8) * 0.3) * ch, BRIGHT);
      r.disc(cx0 + 0.34 * cw, cy0 + 0.16 * ch, 3 * u, BRIGHT);
      r.rect(cx0 + 0.235 * cw, cy0 + 0.08 * ch, 1.5 * u, 0.5 * ch, LMID); r.rect(cx0 + 0.06 * cw, cy0 + 0.32 * ch, 0.36 * cw, 1.5 * u, LMID);
      r.frame(Math.round(cx0 + 0.06 * cw), Math.round(cy0 + 0.08 * ch), Math.round(0.36 * cw), Math.round(0.5 * ch), LMID);
    }
    // the bust: shoulders, a head that nods on the beat and comes closer on the kick, the headset and its boom
    const lean = 1 + 0.18 * w.lean, hx = cx0 + 0.62 * cw, hy = cy0 + 0.46 * ch + f.beat.pulse * 2 * u + w.lean * 2 * u, hr = 0.12 * ch * lean;
    r.poly([[hx - hr * 2.6 * lean, cy0 + ch], [hx + hr * 2.6 * lean, cy0 + ch], [hx + hr * 1.6, hy + hr * 1.1], [hx - hr * 1.6, hy + hr * 1.1]], FIG);
    r.rect(hx - hr * 0.5, hy + hr * 0.7, hr, hr * 0.6, FIG);
    r.disc(hx, hy, hr, FIG);
    r.rect(hx - hr * 1.05, hy - hr * 1.15, hr * 2.1, Math.max(1, hr * 0.18), LMID);
    for (const k of [-1, 1]) r.rect(hx + k * hr * 0.95 - hr * 0.2, hy - hr * 0.35, hr * 0.4, hr * 0.7, LMID);
    r.line(hx - hr * 1.05, hy + hr * 0.1, hx - hr * 0.5, hy + hr * 0.75, LMID); r.disc(hx - hr * 0.5, hy + hr * 0.78, Math.max(1, hr * 0.14), HOT);
    if (w.arms > 0) { const q = ease(Math.min(1, (0.6 - w.arms) * 6)) * ease(Math.min(1, w.arms * 5)); for (const k of [-1, 1]) r.stroke(hx + k * hr * 1.8, hy + hr * 1.6, hx + k * hr * (1.8 + 1.4 * q), hy + hr * 1.6 - hr * 2.6 * q, Math.max(1, 2 * u), FIG); } // the arms up and down again
    r.disc(cx0 + 5 * u, cy0 + 5 * u, (1.5 + f.beat.pulse) * u, HOT);
    r.frame(Math.round(cx0 - 2 * u), Math.round(cy0 - 2 * u), Math.round(cw + 4 * u), Math.round(ch + 4 * u), w.lean > 0.5 ? BRIGHT : LMID);
    targets.push({ x: hx - hr * 1.2, y: hy - hr * 1.3, w: hr * 2.4, h: hr * 2.6 });
    // the chat column: bubbles with a tail and a dot for who sent them; under the cam the followers as pips; a level bar
    r.rect(chx - 2 * u, chTop - 2 * u, chw + 4 * u, chBot - chTop + 4 * u, DARK);
    for (const b of w.chat) {
      const y0 = Math.max(chTop, b.y - b.h), y1 = Math.min(chBot, b.y), bw = b.w * (chw - 8 * u), x0 = b.side ? chx + 4 * u : chx + chw - 4 * u - bw;
      if (y1 <= y0) continue;
      r.rect(x0, y0, bw, y1 - y0, b.bright ? BRIGHT : MID);
      if (b.bright) r.frame(Math.round(x0), Math.round(y0), Math.round(bw), Math.round(y1 - y0), HOT);
      if (b.y <= chBot && b.y - b.h >= chTop) { r.rect(b.side ? x0 - u : x0 + bw, b.y - 2 * u, Math.max(1, u), Math.max(1, u), b.bright ? BRIGHT : MID); r.disc(b.side ? chx + 1.5 * u : chx + chw - 1.5 * u, b.y - b.h / 2, 1.2 * u, b.side ? COOL : HOT); }
    }
    targets.push({ x: chx, y: chTop, w: chw, h: chBot - chTop });
    for (let k = 0; k < Math.min(24, w.followers); k++) r.rect(cx0 + k * 3 * u, cy0 + ch + 5 * u, 2 * u, k % 5 === 4 ? 4 * u : 2.5 * u, COOL);
    r.rect(chx, chBot + 5 * u, chw, 3 * u, DARK); r.rect(chx, chBot + 5 * u, chw * clamp(f.level * 1.3), 3 * u, f.level > 0.8 ? HOT : COOL);
    w.conf = w.conf.filter((p) => { p.vy = Math.min(p.vy + N * 0.6 * dt, N * 0.2); p.y += p.vy * dt; p.x += p.vx * dt + Math.sin((p.a += dt * 4)) * dt * 8 * u; if (p.y > cy0 && p.x > cx0 && p.x < cx0 + cw) r.rect(p.x, p.y, Math.max(1, Math.round(2 * u * Math.abs(Math.cos(p.a)))), Math.max(1, u), p.c); return p.y < cy0 + ch; }).slice(-300);
  },
};

// ---------------------------------------------------------------------------------------------- inferno
// The pit: a lake of lava in bands that run with the bass under a cave roof of stalactites lit from below, chains
// hanging from the roof and swinging as pendulums do (the kicks push them), hands coming up out of the lava on the
// beat and sinking back, embers that rise and slow on the hats, winged things crossing the dark on the snares; a
// drop brings the horned giant up out of the lake over two bars, and after four it goes back under.
const inferno = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { N, stal: Array.from({ length: 14 }, () => ({ x: rnd(), len: 0.08 + rnd() * 0.22, hw: 0.015 + rnd() * 0.025 })),
      chains: Array.from({ length: 4 }, (_, i) => ({ x: 0.12 + i * 0.24 + rnd() * 0.08, len: 0.22 + rnd() * 0.2, amp: 0.1 + rnd() * 0.1, ph: rnd() * TAU })),
      hands: Array.from({ length: 9 }, (_, i) => ({ x: 0.06 + i * 0.105 + rnd() * 0.05, d: rnd(), r: 0, on: false })),
      embers: [], flyers: [], giant: null, diag: new Float32Array(2 * N), rowT: new Float32Array(N) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, L = Math.round(0.56 * N), bps = f.bpm ? f.bpm / 60 : 2, buf = r.buf;
    if (w.N !== N) { w.N = N; w.diag = new Float32Array(2 * N); w.rowT = new Float32Array(N); }
    for (const hh of hits) {
      if (hh.kind === 'hat') for (let k = 0; k < 5; k++) w.embers.push({ x: rnd() * N, y: L + rnd() * (N - L), vy: -(0.15 + rnd() * 0.2) * N, vx: (rnd() - 0.5) * 0.05 * N, life: 1.6 });
      else if (hh.kind === 'snare' && w.flyers.length < 6) { const dir = rnd() < 0.5 ? 1 : -1; w.flyers.push({ x: dir > 0 ? -0.1 * N : 1.1 * N, y: (0.1 + rnd() * 0.3) * N, dir, v: (0.25 + rnd() * 0.15) * N, ph: rnd() * TAU, sz: (0.05 + rnd() * 0.04) * N }); }
      else if (isLow(hh)) for (const c of w.chains) c.amp = Math.min(0.45, c.amp + 0.12 * hh.strength);
    }
    if (f.section === 'drop') w.giant = { bars: 0 };
    if (f.beat.on) for (const h of w.hands) h.on = rnd() < 0.5;
    // the lake: three tones in bands that run with the bass, wavy across, more of the bright with the drive; a glow over it
    const flow = f.rel.bassClock * 1.3, bright = 0.2 + 0.3 * clamp(f.rel.bassDrive), diag = w.diag, rowT = w.rowT;
    for (let i = 0; i < 2 * N; i++) diag[i] = 1.4 * Math.sin((i * 0.12) / u);
    for (let y = L; y < N; y++) rowT[y] = 0.9 * Math.sin((y * 0.3) / u) + ((y - L) / (N - L)) * 3 + flow;
    for (let y = L; y < N; y++) {
      const rt = rowT[y], row = y * N;
      for (let x = 0; x < N; x++) { const p = (x * 0.06) / u + rt + diag[x + y], q = p - Math.floor(p * 0.5) * 2; buf[row + x] = q < bright ? BRIGHT : q < 1.35 ? HOT : HOT + DIM; }
    }
    const g0 = Math.max(0, Math.round(L - 6 * u)), tt = t * 4 | 0;
    for (let y = g0; y < L; y++) for (let x = 0; x < N; x++) if (hash(x, y + tt) < ((y - g0) / (L - g0)) * 0.8) buf[y * N + x] = HOT + DIM;
    // the roof: a band of rock, stalactites dark above and lit at the tips, the chains swinging under it
    r.rect(0, 0, N, 3 * u, DARK);
    for (const st of w.stal) { const x = st.x * N, hw = st.hw * N, len = st.len * N; r.poly([[x - hw, 0], [x + hw, 0], [x, len]], DARK); r.poly([[x - hw * 0.4, len * 0.6], [x + hw * 0.4, len * 0.6], [x, len]], MID); }
    for (const c of w.chains) {
      const len = c.len * N, om = Math.sqrt((N * 1.6) / len); // the period a pendulum of that length has under this gravity
      c.ph += dt * om; c.amp *= Math.exp(-dt * 0.15);
      const a = c.amp * Math.sin(c.ph), px = c.x * N, ex = px + Math.sin(a) * len, ey = Math.cos(a) * len;
      for (let k = 0; k < 14; k++) { const q = k / 14, q2 = (k + 1) / 14; r.stroke(lerp(px, ex, q), lerp(0, ey, q), lerp(px, ex, q2), lerp(0, ey, q2), k % 2 ? Math.max(1, 1.8 * u) : Math.max(1, u), k % 2 ? LMID : MID); }
      r.ring(ex, ey + 2 * u, 2.5 * u, Math.max(1, u), LMID);
    }
    // the winged things, flapping across; the hands, up on the beat and under again by the next, the near ones bigger
    w.flyers = w.flyers.filter((fl) => {
      fl.x += fl.dir * fl.v * dt; fl.ph += dt * 9; fl.y += Math.sin(fl.ph) * dt * 3 * u;
      const sz = fl.sz, flap = Math.sin(fl.ph) * 0.6;
      r.rect(fl.x - sz * 0.1, fl.y - sz * 0.25, sz * 0.2, sz * 0.5, MID); r.disc(fl.x, fl.y - sz * 0.3, sz * 0.12, MID);
      for (const k of [-1, 1]) { const wx = fl.x + k * sz * 0.1, tipX = fl.x + k * sz * 0.6, tipY = fl.y - sz * 0.1 - flap * sz * 0.5; r.poly([[wx, fl.y - sz * 0.2], [tipX, tipY], [tipX - k * sz * 0.1, tipY + sz * 0.25], [wx, fl.y + sz * 0.15]], MID); }
      for (const k of [-1, 1]) r.line(fl.x + k * sz * 0.05, fl.y - sz * 0.4, fl.x + k * sz * 0.12, fl.y - sz * 0.55, MID);
      r.line(fl.x, fl.y + sz * 0.25, fl.x - fl.dir * sz * 0.3, fl.y + sz * 0.35 + Math.sin(fl.ph * 0.5) * sz * 0.1, MID);
      r.rect(fl.x + fl.dir * sz * 0.04, fl.y - sz * 0.32, Math.max(1, u), Math.max(1, u), HOT);
      targets.push({ x: fl.x - sz * 0.6, y: fl.y - sz * 0.6, w: sz * 1.2, h: sz });
      return fl.x > -0.15 * N && fl.x < 1.15 * N;
    });
    let tall = null;
    for (const h of w.hands) {
      h.r = follow(h.r, h.on ? 1 : 0, dt, h.on ? 0.08 : 0.3);
      if (h.r < 0.05) continue;
      const y = L + (0.2 + 0.8 * h.d) * (N - L), sc = 0.6 + 0.8 * h.d, hh = h.r * 0.13 * N * sc, x = h.x * N, aw = Math.max(1, 2.2 * u * sc);
      r.rect(x - aw / 2, y - hh, aw, hh, DARK);
      if (hh > 3 * u) { const py = y - hh; r.rect(x - aw * 1.1, py - aw * 1.2, aw * 2.2, aw * 1.6, DARK); for (let k = -2; k <= 2; k++) r.line(x + k * aw * 0.5, py - aw * 1.2, x + k * aw * 0.9, py - aw * 1.2 - hh * 0.3 * (k === 0 ? 1.1 : 0.9), DARK); }
      if (!tall || hh > tall.hh) tall = { x, y, hh, aw };
    }
    if (tall) targets.push({ x: tall.x - tall.aw * 1.5, y: tall.y - tall.hh * 1.5, w: tall.aw * 3, h: tall.hh * 1.5 });
    // the giant: up out of the lake over two bars, under again after four; what is under the surface is not drawn
    if (w.giant) {
      const G2 = w.giant;
      G2.bars += (dt * bps) / 4;
      const k = G2.bars < 2 ? ease(G2.bars / 2) : G2.bars < 4 ? 1 : 1 - ease((G2.bars - 4) / 1.5);
      if (k <= 0) w.giant = null;
      else {
        const gx = 0.5 * N, gy = L + 0.5 * (N - L), H = 0.6 * N * k, hw = 0.13 * N;
        r.poly([[gx - hw * 1.1, gy], [gx + hw * 1.1, gy], [gx + hw * 1.3, gy - H * 0.55], [gx + hw * 0.9, gy - H * 0.8], [gx - hw * 0.9, gy - H * 0.8], [gx - hw * 1.3, gy - H * 0.55]], DARK);
        r.disc(gx, gy - H * 0.88, hw * 0.45, DARK);
        for (const sgn of [-1, 1]) { r.stroke(gx + sgn * hw * 0.3, gy - H * 0.98, gx + sgn * hw * 0.75, gy - H * 1.18, Math.max(1, 2.5 * u), DARK); r.stroke(gx + sgn * hw * 1.3, gy - H * 0.55, gx + sgn * hw * 1.9, gy - H * 0.95 - f.beat.pulse * 3 * u, Math.max(1, 3 * u), DARK); }
        for (const sgn of [-1, 1]) r.rect(gx + sgn * hw * 0.17 - 1.5 * u, gy - H * 0.9, 3 * u, 2 * u, f.beat.pulse > 0.3 ? BRIGHT : HOT);
        for (let i = 0; i < 6; i++) r.rect(gx + (rnd() - 0.5) * hw * 2.4, gy - rnd() * 3 * u, 2 * u, 2 * u, BRIGHT); // the lava running off it
        if (G2.bars < 2) s.shake = Math.max(s.shake, 0.25);
        targets.push({ x: gx - hw * 1.3, y: gy - H * 1.2, w: hw * 2.6, h: H * 1.2 });
      }
    }
    // the embers: up fast off the lake, then slower, cooling from bright to hot
    w.embers = w.embers.filter((e) => { e.vy = follow(e.vy, -0.02 * N, dt, 0.9); e.x += e.vx * dt + Math.sin(t * 5 + e.y * 0.1) * u * dt * 6; e.y += e.vy * dt; e.life -= dt; r.rect(e.x, e.y, Math.max(1, u), Math.max(1, u), e.life > 0.7 ? BRIGHT : HOT); return e.life > 0 && e.y > 0; }).slice(-300);
  },
};

const WORLDS = { checkpoint, corridor, duel, outrun, arcade, platformer, pong, western, ring, rain, radar, aerobics, dogfight,
  kaiju, ufo, periscope, haunted, blinds, skate, arena, blockparty, rocket, disco, dungeon, lightcycles, moonride, boulder, snake, crossing, rhythm,
  ritual, tarot, spiral, testcard, waterfall, antennas, pyramid, strings, chemtrails, flatearth, studio, agents, bigfoot, swarm, feed, chart, bust, horde, cape,
  rts, barrier, hexbattle, adventure, raid, jrpg, arpg, prison, motorcade, rally, stream, inferno };

registerFamily('retro', WORLD_DEFS, WORLDS);
export const RETRO_STYLE = makeMixStyle('RETRO MIX', ['retro']);
export const RETRO_DEBUG = MIX_DEBUG;
