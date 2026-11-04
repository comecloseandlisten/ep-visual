// Casino nights, mixed. Twelve worlds of cards, chips, dice, wheels, reels and close-up magic: a dealer's table
// from above, a riffle shuffle close-up, chip stacks that topple, the four suits as a tiled print, a roulette
// wheel with its ball on the run, a slot machine, a craps table, a house of cards, a magician's hands, a hat
// across the room, a marquee at night and a poker table. Everything is original and wordless: no brands, no
// casino names, no readable text or digits; card faces carry suit pips and a corner mark that is a shape, the
// reels fruit, a bell, a bar block and a bolt. Each world has a kinds table weighed by the arousal band, re-rolled
// on a section change, a heavy variant on a drop, and answers the music continuously, on hits and on the beat.
// The physics are kept honest: friction slides that stop where they are aimed, wheels that run down, a ball that
// spirals in, dice that bounce with restitution, parabolas, stacks that tip past their balance, cards that flutter.
import { clamp, lerp, bayer } from './pixels.js';
import { BG, FIG, DARK, MID, LMID, BRIGHT, HOT, COOL, DIM, BLACK, WHITE, L, M, H, TAU, pick, isLow, isTonal, follow, wrapAngle, followAngle, ease,
  beatLocked, hash, pickW, registerFamily, makeMixStyle } from './mixer.js';

// `pals` and `fx` are what each world was made with; anything else still goes, at a third of the weight; `themes`
// are what it is about (meaning.js)
export const WORLD_DEFS = {
  dealer: { name: 'the dealer', va: [[M, M], [H, M], [M, H]], pals: ['felt', 'velvet', 'gold', 'noir', 'cinema'], fx: ['none', 'film', 'vhs'], themes: ['play', 'night'] },
  riffle: { name: 'riffle shuffle', va: [[M, L], [M, M]], pals: ['felt', 'velvet', 'noir', 'silver', 'midnight'], fx: ['none', 'film'], themes: ['play', 'lonely'] },
  chips: { name: 'chip stacks', va: [[H, H], [H, M]], pals: ['felt', 'gold', 'velvet', 'candy', 'neon'], fx: ['none', 'crt'], themes: ['play', 'glory'] },
  suits: { name: 'the four suits', va: [[M, L], [M, M]], pals: ['felt', 'velvet', 'tabloid', 'candy', 'gold'], fx: ['none', 'kaleido', 'mirror'], themes: ['play', 'dream', 'love'], geo: true },
  roulette: { name: 'roulette', va: [[M, M], [H, M], [M, H]], pals: ['felt', 'velvet', 'gold', 'noir', 'neon'], fx: ['none', 'film', 'crt'], themes: ['play', 'night', 'speed'] },
  slots: { name: 'slot machine', va: [[M, M], [H, M], [M, H]], pals: ['gold', 'neon', 'cinema', 'candy', 'velvet'], fx: ['none', 'crt', 'vhs'], themes: ['play', 'machine', 'rave'] },
  dice: { name: 'craps', va: [[H, H], [H, M]], pals: ['felt', 'velvet', 'noir', 'gold', 'tabloid'], fx: ['none', 'film', 'crt'], themes: ['play', 'street'] },
  houseofcards: { name: 'house of cards', va: [[M, L], [M, M]], pals: ['felt', 'noir', 'silver', 'midnight', 'velvet'], fx: ['none', 'film'], themes: ['paranoia', 'lonely', 'play'] },
  magician: { name: 'close-up magic', va: [[L, M], [M, L], [H, M]], pals: ['velvet', 'noir', 'midnight', 'gold', 'silver'], fx: ['none', 'film', 'vhs'], themes: ['occult', 'dream', 'play'] },
  cardthrow: { name: 'a hat across the room', va: [[H, H], [H, M]], pals: ['noir', 'felt', 'cinema', 'tabloid', 'silver'], fx: ['none', 'film', 'crt'], themes: ['play', 'speed'] },
  marquee: { name: 'the marquee', va: [[H, H], [H, M]], pals: ['neon', 'gold', 'midnight', 'noir', 'candy'], fx: ['none', 'crt', 'kaleido', 'vhs'], themes: ['night', 'rave', 'glory'], geo: true },
  poker: { name: 'poker night', va: [[M, M], [H, M], [M, H]], pals: ['felt', 'velvet', 'noir', 'gold', 'cinema'], fx: ['none', 'film', 'vhs'], themes: ['night', 'paranoia', 'play'] },
};

// the arousal band a mood falls in (low, mid, high): the kinds tables below weigh their kinds by it
const bandOf = (a) => (a > 0.6 ? 2 : a > 0.42 ? 1 : 0);
const rollW = (rnd, table, band) => pickW(rnd, Object.keys(table), (k) => table[k][band]);
const bpsOf = (f) => (f.bpm ? f.bpm / 60 : 2);
const GRAV = (N) => N * 1.6; // cells a second squared, the fall the mixer's particles use
const rotAt = (cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return (px, py) => [cx + px * c - py * s, cy + px * s + py * c]; };
const quad = (r, P, hw, hh, c) => r.poly([P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, hh)], c);

// a beat without a lock: once per beat from the frame clock when the tracker has none
function beatTick(w, f, dt, key = 'beatPh') {
  if (beatLocked(f)) return f.beat.on;
  w[key] = (w[key] || 0) + dt * bpsOf(f);
  if (w[key] < 1) return false;
  w[key] -= 1;
  return true;
}
// the sixteenths gone by this frame: from the tracker's phase with a lock, else from the frame clock
function ticks16(w, f, dt) {
  if (beatLocked(f)) {
    const cur = f.beat.count * 4 + Math.min(3, Math.floor(f.beat.phase * 4)), n = w.t16 === undefined ? 0 : Math.max(0, Math.min(4, cur - w.t16));
    w.t16 = cur;
    return n;
  }
  w.ph16 = (w.ph16 || 0) + dt * bpsOf(f) * 4;
  const n = Math.floor(w.ph16);
  w.ph16 -= n;
  return n;
}
// a friction slide under Coulomb friction: a constant deceleration (the grip k of the surface: k²·N/8 cells/s²) from
// the speed that stops it exactly at the aim, in a finite time; the spin runs down to its aim in that same time; both
// stepped exactly, at any frame rate. The spin is `av` on the angle `a` (a die's or a chip's own `om` is left alone)
const slideTo = (o, tx, ty, k, N, a = null) => {
  const dx = tx - o.x, dy = ty - o.y, dec = (k * k * N) / 8, T = Math.sqrt((2 * Math.hypot(dx, dy)) / dec), Ts = Math.max(T, 0.25);
  o.dec = dec; o.vx = T > 0 ? (2 * dx) / T : 0; o.vy = T > 0 ? (2 * dy) / T : 0;
  o.av = a === null ? 0 : (2 * wrapAngle(a - o.a)) / Ts; o.ad = Math.abs(o.av) / Ts;
};
function slide(o, dt) {
  const v = Math.hypot(o.vx, o.vy);
  if (v > 0 && o.dec) { const h = Math.min(dt, v / o.dec), m = (1 - (0.5 * o.dec * h) / v) * h, q = Math.max(0, 1 - (o.dec * h) / v); o.x += o.vx * m; o.y += o.vy * m; o.vx *= q; o.vy *= q; }
  if (o.av) { const sg = Math.sign(o.av), w0 = Math.abs(o.av), h = Math.min(dt, w0 / o.ad); o.a += sg * (w0 - 0.5 * o.ad * h) * h; o.av = sg * Math.max(0, w0 - o.ad * h); }
  return Math.hypot(o.vx, o.vy);
}
// a throw under gravity g (cells/s², down the screen), stepped exactly and no further than its time of flight T, so
// it comes down on its aim at any frame rate: true while it flies
function fly(p, dt, g) {
  const h = Math.max(0, Math.min(dt, p.T - p.t));
  p.x += p.vx * h; p.y += (p.vy + 0.5 * g * h) * h; p.vy += g * h; p.t += dt;
  return p.t < p.T;
}

// ---------------------------------------------------------------------------------------------- shared bits
// a suit mark `s` across at P(px, py): hearts and diamonds in HOT, clubs and spades in DARK (ink on the white card in every palette)
function pip(r, P, px, py, s, suit) {
  const c = suit < 2 ? HOT : DARK;
  if (suit === 1) { r.poly([P(px, py - s), P(px + s * 0.7, py), P(px, py + s), P(px - s * 0.7, py)], c); return; }
  if (suit === 0 || suit === 3) {
    const k = suit === 0 ? 1 : -1;
    for (const d of [-1, 1]) { const [x, y] = P(px + d * s * 0.42, py - k * s * 0.3); r.disc(x, y, s * 0.48, c); }
    r.poly([P(px - s * 0.9, py - k * s * 0.12), P(px + s * 0.9, py - k * s * 0.12), P(px, py + k * s)], c);
  } else for (const [dx, dy] of [[0, -0.5], [-0.5, 0.25], [0.5, 0.25]]) { const [x, y] = P(px + dx * s, py + dy * s); r.disc(x, y, s * 0.42, c); }
  if (suit >= 2) r.poly([P(px - s * 0.16, py + s * 0.2), P(px + s * 0.16, py + s * 0.2), P(px + s * 0.3, py + s), P(px - s * 0.3, py + s)], c);
}
const PIPS = [[[0, 0]], [[0, -0.5], [0, 0.5]], [[0, -0.55], [0, 0], [0, 0.55]], [[-0.45, -0.5], [0.45, -0.5], [-0.45, 0.5], [0.45, 0.5]], [[-0.45, -0.55], [0.45, -0.55], [0, 0], [-0.45, 0.55], [0.45, 0.55]]];
// a card at (x, y), half sizes cw by ch, turned by `a`; `fs` is how much of its width shows (a flip over its long
// edge). Face up: the suit's pips in a column and a corner mark that is a shape; face down: a bordered back with
// a lattice of dots.
function card(r, x, y, cw, ch, a, fs, up, suit, rank, u) {
  const k = Math.max(0.08, Math.abs(fs)), P0 = rotAt(x, y, a), P = (px, py) => P0(px * k, py), hw = cw * k;
  quad(r, P0, hw, ch, BRIGHT);
  if (k < 0.4 || cw < 2.2 * u) return;
  if (!up) {
    quad(r, P, cw - u, ch - u, HOT + DIM);
    for (let j = -2; j <= 2; j++) for (let i = -1; i <= 1; i++) { if (Math.abs(i) * 1.5 * u > cw - 2 * u || Math.abs(j) * 1.5 * u > ch - 2 * u) continue; const [qx, qy] = P(i * 1.5 * u, j * 1.5 * u); r.set(qx, qy, BRIGHT); }
    return;
  }
  const col = suit < 2 ? HOT : DARK, ps = Math.min(cw * 0.42, ch * 0.3);
  for (const [px, py] of PIPS[rank % 5]) pip(r, P, px * cw, py * ch, ps, suit);
  for (const d of [-1, 1]) { const [qx, qy] = P(d * (cw - 1.2 * u), d * (ch - 1.4 * u)); r.rect(qx - u / 2, qy - u / 2, Math.max(1, u), Math.max(1, u), col); }
}

const CHIPS = [[HOT, BRIGHT], [COOL, BRIGHT], [BRIGHT, HOT], [DARK, COOL], [FIG, HOT]]; // body and edge stripe, by value
// a chip from above, or obliquely when `sy` < 1: the body, six edge stripes, the inlay
function chipTop(r, x, y, R, val, u, sy = 1) {
  const [c, s] = CHIPS[val % CHIPS.length];
  r.ring(x, y, R * 0.5, R, c, sy);
  for (let k = 0; k < 6; k++) { const a = k * (TAU / 6) + 0.3; r.rect(x + Math.cos(a) * R * 0.78 - u * 0.5, y + Math.sin(a) * R * 0.78 * sy - u * 0.5, Math.max(1, u), Math.max(1, u), s); }
  r.ring(x, y, R * 0.2, R * 0.4, c === DARK ? MID : c + DIM, sy);
}
// a stack of `n` chips standing at (x, y) seen obliquely: each a flattened ring, a stripe on the front of each rim
// so the edges read, a marker chip every fifth, the top one with its inlay. `lift` raises the stack (a hop),
// `lifts(i)` a chip at a time (a riffle), `tilt` leans it. A chip is 0.8u thick at every size (thinner than a pixel at
// the smallest, so the chips overlap and the stack keeps its height)
function stack(r, x, y, R, n, val, u, lift = 0, tilt = 0, lifts = null) {
  const th = 0.8 * u, sy = 0.45, [c, s] = CHIPS[val % CHIPS.length];
  for (let i = 0; i < n; i++) {
    const cy = y - lift - i * th - (lifts ? lifts(i) : 0), cx = x + tilt * i * th;
    r.ring(cx, cy, R * 0.5, R, i % 5 === 4 ? (c === BRIGHT ? LMID : BRIGHT) : c, sy);
    if (i % 2 === 0) r.rect(cx - u * 0.5, cy + R * sy - u * 0.4, Math.max(1, u), Math.max(1, th), s);
  }
  if (n > 0) chipTop(r, x + tilt * (n - 1) * th, y - lift - (n - 1) * th - (lifts ? lifts(n - 1) : 0), R, val, u, sy);
}
// a hand from above at (x, y), `s` across the palm, the fingers pointing along `a`
function handTop(r, x, y, s, a, col) {
  const P = rotAt(x, y, a);
  r.poly([P(-s * 0.55, -s * 0.5), P(s * 0.4, -s * 0.5), P(s * 0.5, s * 0.5), P(-s * 0.55, s * 0.5)], col);
  for (let k = 0; k < 4; k++) { const fy = (k - 1.5) * s * 0.28, [ax, ay] = P(s * 0.4, fy), [bx, by] = P(s * (1.15 - 0.1 * Math.abs(k - 1.5)), fy); r.stroke(ax, ay, bx, by, s * 0.2, col); }
  const [tx0, ty0] = P(-s * 0.1, -s * 0.45), [tx1, ty1] = P(s * 0.3, -s * 0.9);
  r.stroke(tx0, ty0, tx1, ty1, s * 0.2, col);
}
// a hand seen from the side at (x, y): a palm and three fingers curling down over whatever is under it
function handSide(r, x, y, s, col, dir = 1) {
  r.rect(x - s * 0.5, y - s * 0.6, s, s * 0.7, col);
  r.disc(x, y - s * 0.6, s * 0.5, col);
  for (let k = 0; k < 3; k++) r.stroke(x - s * 0.35 + k * s * 0.35, y, x - s * 0.35 + k * s * 0.35 + dir * s * 0.15, y + s * 0.45, s * 0.22, col);
}

// an unbroken oval outline (a neon tube, a rim) of width wd: short strokes round the ellipse
function oval(r, cx, cy, rx, ry, wd, c, n = 32) {
  for (let k = 0; k < n; k++) { const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU; r.stroke(cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry, cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry, wd, c); }
}

// a heap of coins as the height over each column (`pile`), coins rc across that bear on ri columns each side: the height a
// coin dropped at `col` rests on, and its settling: down the steeper side while the slope is over about thirty degrees,
// then onto what is under it; returns the column and the height it lies at
function heapUnder(pile, col, ri) { let h = 0; for (let j = Math.max(0, col - ri); j <= Math.min(pile.length - 1, col + ri); j++) h = Math.max(h, pile[j]); return h; }
function heapSettle(pile, col, rc, ri) {
  const last = pile.length - 1, d = 2 * ri + 1;
  for (let k = 0; k < 80; k++) {
    const hc = heapUnder(pile, col, ri), dl = col >= d ? hc - heapUnder(pile, col - d, ri) : 0, dr = col <= last - d ? hc - heapUnder(pile, col + d, ri) : 0;
    if (Math.max(dl, dr) <= 0.6 * d) break;
    col += dl > dr ? -1 : 1;
  }
  const h = heapUnder(pile, col, ri);
  for (let j = Math.max(0, col - ri); j <= Math.min(last, col + ri); j++) { const dx = j - col; pile[j] = Math.max(pile[j], h + rc + Math.sqrt(Math.max(0, rc * rc - dx * dx))); }
  return [col, h];
}
// coins that landed slow rolling down the heap to where heapSettle has laid them (a disc rolling down a slope of about
// thirty degrees speeds up at a third of g), then lying there: no jump; returns the ones still rolling
function rollCoins(list, rest, g, dt) {
  return list.filter((c) => {
    c.v += (g / 3) * dt;
    const d = c.tx - c.x;
    if (Math.abs(d) <= c.v * dt) { rest.push([c.tx, c.ty]); return false; }
    c.x += Math.sign(d) * c.v * dt; c.y = lerp(c.y0, c.ty, 1 - Math.abs(c.tx - c.x) / c.d0);
    return true;
  });
}

const BELT = [1, 5, 6, 2]; // the faces that come round as a die tumbles about its sideways axis (1 under 6, 5 under 2)
const DIE_PIPS = [[], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];
// a die of edge `s` at (x, y) turned `yaw` on the felt and rolled `rho` about its sideways axis: the top face
// squashes to s·cos φ and the face coming over the far edge grows to s·sin φ, each with its pips
function die(r, x, y, s, yaw, rho, col, pipCol, u) {
  const P = rotAt(x, y, yaw), n = Math.floor(rho / (Math.PI / 2)), ph = rho - n * (Math.PI / 2), c = Math.cos(ph), sn = Math.sin(ph), h = s / 2;
  const top = BELT[((n % 4) + 4) % 4], far = BELT[(((n + 1) % 4) + 4) % 4], yT = -h * sn, hT = h * c, yF = h * c, hF = h * sn;
  r.poly([P(-h, yT - hT), P(h, yT - hT), P(h, yT + hT), P(-h, yT + hT)], col);
  if (hF > 0.3 * u) r.poly([P(-h, yF - hF), P(h, yF - hF), P(h, yF + hF), P(-h, yF + hF)], col + DIM);
  const pr = Math.max(0.6, s * 0.09);
  if (c > 0.45) for (const [px, py] of DIE_PIPS[top]) { const [qx, qy] = P(px * s * 0.28, yT + py * s * 0.28 * c); r.disc(qx, qy, pr, pipCol); }
  if (sn > 0.45) for (const [px, py] of DIE_PIPS[far]) { const [qx, qy] = P(px * s * 0.28, yF + py * s * 0.28 * sn); r.disc(qx, qy, pr, pipCol); }
}

// the seats of a table from above, five round the far arc; `k` is the ring: 0 the player's head beyond the rail,
// 1 the stack, 2 the bet, 3 the cards
const SEAT_R = [[0.47, 0.42], [0.36, 0.3], [0.3, 0.24], [0.23, 0.18]];
const seatTh = (i) => Math.PI * (1.07 + 0.86 * (i / 4));
function seatAt(i, k, N) { const th = seatTh(i), [rx, ry] = SEAT_R[k]; return [N * (0.5 + rx * Math.cos(th)), N * (0.6 + ry * Math.sin(th))]; }
// the table: the floor, the padded rail, the felt; `half` cuts the near side straight for the dealer
function drawTable(r, N, u, half) {
  r.fill(DARK + DIM);
  r.ring(0.5 * N, 0.6 * N, 0.225 * N, 0.45 * N, MID, 0.8);
  r.ring(0.5 * N, 0.6 * N, 0.205 * N, 0.41 * N, BG, 0.8);
  if (half) { r.rect(0, 0.84 * N, N, N, DARK + DIM); r.rect(0, 0.84 * N, N, Math.max(1, 1.5 * u), MID); }
}
// a player's head and shoulders from above, beyond the rail at seat i, `d` further out along the radial
function playerAt(r, i, N, u, col, hat, d = 0) {
  const th = seatTh(i), [x0, y0] = seatAt(i, 0, N), x = x0 + Math.cos(th) * d, y = y0 + Math.sin(th) * d, P = rotAt(x, y, th + Math.PI / 2);
  r.poly([P(-5 * u, -2 * u), P(5 * u, -2 * u), P(5 * u, 2 * u), P(-5 * u, 2 * u)], col);
  r.disc(x, y, 2.6 * u, hat ? DARK : col);
  if (hat) r.ring(x, y, 2.2 * u, Math.max(1, u), LMID);
}

// ---------------------------------------------------------------------------------------------- dealer
// A card table from above: five seats round the dealer, a shoe at the dealer's right hand, a chip tray at the
// rail. On every beat the dealing hand pitches a card to the next spot: it slides with friction, spinning a
// little, and settles face down; a snare flips one face up (over its long edge, foreshortened as it turns), a
// kick is a seat tapping the felt and its chips hopping. Once the hand is dealt and played the cards flip, the
// bets slide to one seat and the cards are swept to the discard; a drop does that at once. Kinds: the game,
// blackjack (a half-moon table, the dealer gets a spot), hold'em (five cards in the middle, one a bar),
// baccarat (two boxes in the middle take the cards, the seats only bet).
const GAME_W = { blackjack: [3, 2, 1], holdem: [2, 3, 2], baccarat: [1, 2, 3] };
const SHOE = [0.69, 0.9], DISCARD = [0.31, 0.9];
const spotOf = (j, N) => (j < 5 ? seatAt(j, 3, N) : j === 5 ? [0.5 * N, 0.74 * N] : j === 6 ? [0.36 * N, 0.6 * N] : j === 7 ? [0.64 * N, 0.6 * N] : [N * (0.3 + 0.1 * (j - 8)), 0.6 * N]);

function newDeal(w, rnd, N) { // a fresh hand (in the game a section change asked for): the deal order, a bet pushed out from each stack to its circle
  if (w.want) { w.game = w.want; w.want = null; }
  const g = w.game;
  w.order = g === 'blackjack' ? [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5] : g === 'holdem' ? [0, 1, 2, 3, 4, 0, 1, 2, 3, 4] : [6, 7, 6, 7, ...(rnd() < 0.5 ? [6] : []), ...(rnd() < 0.5 ? [7] : [])];
  Object.assign(w, { next: 0, cards: [], phase: 'deal', comm: 0, winner: -1, beats: 0, showT: 0 });
  for (const s of w.seats) {
    const n = 1 + Math.floor(rnd() * 2), [sx, sy] = seatAt(s.i, 1, N), [bx, by] = seatAt(s.i, 2, N), b = { x: sx, y: sy, vx: 0, vy: 0, n, val: s.val, i: s.i };
    s.n = Math.max(2, s.n - n);
    slideTo(b, bx, by, 4, N);
    w.bets.push(b);
  }
}

const dealer = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { game: rollW(rnd, GAME_W, band), bets: [], hand: { x: SHOE[0] * N, y: SHOE[1] * N, a: -Math.PI / 2, ta: -Math.PI / 2 }, flick: 0, tapI: 0, glint: 0,
      seats: Array.from({ length: 5 }, (_, i) => ({ i, n: 5 + Math.floor(rnd() * 8), val: Math.floor(rnd() * 4), col: pick(rnd, [DARK, MID, DARK + DIM, MID + DIM]), hat: rnd() < 0.3, h: 0, vh: 0 })), N });
    newDeal(w, rnd, N);
  },
  draw(W) {
    if (W.w.N !== W.N) dealer.init(W); // the table laid out afresh at another size
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = GRAV(N), cw = 3 * u, ch = 4.2 * u;
    const shoe = [SHOE[0] * N, SHOE[1] * N], disc = [DISCARD[0] * N, DISCARD[1] * N];
    const pitch = (j, up, auto = false) => { // out of the shoe to spot j: a friction slide aimed at its place, the card turning to face its seat on the way
      const [tx, ty] = spotOf(j, N), idx = w.cards.filter((c) => c.spot === j).length, th = Math.atan2(ty - 0.6 * N, tx - 0.5 * N), ang = Math.atan2(ty - shoe[1], tx - shoe[0]);
      const rest = j < 5 ? th - Math.PI / 2 + (rnd() - 0.5) * 0.2 : (rnd() - 0.5) * 0.1, side = j >= 8 ? 0 : (idx - (j >= 6 ? 1 : 0.5)) * 1.5 * cw, sa = j < 5 ? th + Math.PI / 2 : 0;
      const c = { x: shoe[0], y: shoe[1] - 2 * u, vx: 0, vy: 0, a: ang + Math.PI / 2, av: 0, up, flip: 1, fd: -1, spot: j, auto };
      slideTo(c, tx + Math.cos(sa) * side, ty + Math.sin(sa) * side, 3.5, N, rest);
      w.cards.push(c);
      w.hand.ta = ang;
      w.flick = 0.25;
    };
    const showdown = () => { // every card turns, one after the other, and the bets slide to the winning seat
      if (w.phase === 'show' || w.phase === 'sweep') return;
      w.phase = 'show'; w.showT = 0; w.winner = Math.floor(rnd() * 5);
      let k = 0;
      for (const c of w.cards) if (!c.up) c.fd = 0.1 * k++;
      const [wx, wy] = seatAt(w.winner, 1, N);
      for (const b of w.bets) slideTo(b, wx + (rnd() - 0.5) * 3 * u, wy + (rnd() - 0.5) * 2 * u, 3, N);
    };
    const beat = beatTick(w, f, dt);
    if (beat) w.beats++;
    if (f.section === 'change') { // the next hand is another game: the table is swept first, the bets slide back to their seats
      w.want = rollW(rnd, GAME_W, band);
      if (w.phase === 'deal' || w.phase === 'play') {
        w.phase = 'sweep'; w.showT = 0;
        for (const c of w.cards) { c.auto = false; slideTo(c, disc[0] + (rnd() - 0.5) * 2 * u, disc[1], 3, N, (rnd() - 0.5) * 0.3); }
        for (const b of w.bets) { const [sx, sy] = seatAt(b.i, 1, N); slideTo(b, sx, sy, 4, N); }
      }
    }
    if (f.section === 'drop') { showdown(); s.shake = Math.max(s.shake, 0.25); }
    if (w.phase === 'deal' && beat) {
      if (w.next < w.order.length) { const j = w.order[w.next]; pitch(j, j === 5 && w.next >= 6); w.next++; }
      if (w.next >= w.order.length) { w.phase = 'play'; w.beats = 0; }
    } else if (w.phase === 'play' && beat) {
      if (w.game === 'holdem') { if (w.beats % 4 === 0 && w.comm < 5) pitch(8 + w.comm++, false, true); else if (w.comm >= 5 && w.beats % 4 === 0) showdown(); }
      else if (w.beats >= 8 || w.cards.every((c) => c.up)) showdown();
    }
    for (const h of hits) {
      if (isLow(h)) { const st = w.seats[(isTonal(h) ? h.pc : w.tapI++) % 5]; st.vh = Math.max(st.vh, N * (0.12 + 0.18 * h.strength)); }
      else if (h.kind === 'snare') { const c = w.cards.find((q) => !q.up && q.flip >= 1 && q.fd < 0 && Math.hypot(q.vx, q.vy) < 0.05 * N); if (c) c.fd = 0; }
      else if (h.kind === 'hat') w.glint = 0.1;
    }
    w.glint -= dt; w.flick -= dt;
    for (const c of w.cards) {
      if (c.fd >= 0 && c.flip >= 1) { c.fd -= dt; if (c.fd <= 0) { c.fd = -1; c.flip = 0; c.up = !c.up; } }
      if (c.flip < 1) c.flip = Math.min(1, c.flip + dt * 3);
      const sp = slide(c, dt);
      if (c.auto && sp < 0.02 * N) { c.auto = false; c.fd = 0; }
    }
    for (const st of w.seats) { if (st.vh || st.h > 0) { st.h += (st.vh - 0.5 * g * dt) * dt; st.vh -= g * dt; if (st.h < 0) { st.h = 0; st.vh = -st.vh * 0.45; if (Math.abs(st.vh) < 0.015 * N) st.vh = 0; } } }
    for (const b of w.bets) slide(b, dt);
    if (w.phase === 'show') {
      w.showT += dt;
      if (w.showT > 1.8) { for (const b of w.bets) w.seats[w.winner].n += b.n; w.bets = []; w.phase = 'sweep'; w.showT = 0; for (const c of w.cards) { c.auto = false; slideTo(c, disc[0] + (rnd() - 0.5) * 2 * u, disc[1], 3, N, (rnd() - 0.5) * 0.3); } }
    } else if (w.phase === 'sweep') { w.showT += dt; if (w.showT > 1.4) { for (const b of w.bets) w.seats[b.i].n += b.n; w.bets = []; newDeal(w, rnd, N); } }
    // the hand: at rest on the shoe, out to the pitch point on a deal, bobbing with the bass
    const H = w.hand, out = w.flick > 0 ? 1 : 0;
    H.x = follow(H.x, shoe[0] + Math.cos(H.ta) * 0.06 * N * out, dt, 0.07);
    H.y = follow(H.y, shoe[1] - 3 * u + Math.sin(H.ta) * 0.06 * N * out + Math.sin(f.rel.bassClock * 2) * u, dt, 0.07);
    H.a = followAngle(H.a, out ? H.ta : -Math.PI / 2, dt, 0.1);

    drawTable(r, N, u, w.game === 'blackjack');
    for (let i = 0; i < 5; i++) { const [bx, by] = seatAt(i, 2, N); r.ring(bx, by, 3.2 * u, Math.max(1, u), LMID + DIM, 0.7); }
    if (w.game === 'holdem') for (let k = 0; k < 5; k++) { const [x, y] = spotOf(8 + k, N); r.frame(Math.round(x - cw - u), Math.round(y - ch - u), Math.round(2 * cw + 2 * u), Math.round(2 * ch + 2 * u), LMID + DIM); }
    if (w.game === 'baccarat') for (const j of [6, 7]) { const [x, y] = spotOf(j, N); r.frame(Math.round(x - 0.08 * N), Math.round(y - 0.065 * N), Math.round(0.16 * N), Math.round(0.13 * N), LMID + DIM); }
    if (w.game === 'blackjack') r.rect(0.3 * N, 0.68 * N, 0.4 * N, Math.max(1, u), LMID + DIM);
    for (const st of w.seats) { const [x, y] = seatAt(st.i, 1, N); stack(r, x, y, 2.6 * u, st.n, st.val, u, st.h); }
    for (const b of w.bets) stack(r, b.x, b.y, 2.2 * u, b.n, b.val, u);
    for (const c of w.cards) {
      const faceUp = c.flip < 0.5 ? !c.up : c.up;
      card(r, c.x, c.y, cw, ch, c.a, Math.abs(1 - 2 * c.flip), faceUp, c.spot * 7 % 4, (c.spot * 3 + Math.floor(c.x / 7)) % 5, u);
      if (Math.hypot(c.vx, c.vy) > 0.1 * N) targets.push({ x: c.x - ch, y: c.y - ch, w: 2 * ch, h: 2 * ch });
    }
    // the shoe, the discard, the chip tray between them; the players beyond the rail
    r.rect(shoe[0] - 0.045 * N, shoe[1] - 0.03 * N, 0.09 * N, 0.06 * N, DARK);
    r.rect(shoe[0] - 0.035 * N, shoe[1] - 0.02 * N, 0.07 * N, 0.015 * N, w.glint > 0 ? WHITE : BRIGHT);
    r.rect(disc[0] - 0.045 * N, disc[1] - 0.03 * N, 0.09 * N, 0.06 * N, DARK);
    for (let k = 0; k < 4; k++) r.rect(disc[0] - 0.035 * N, disc[1] - 0.02 * N + k * 1.5 * u, 0.07 * N, Math.max(1, u), BRIGHT + DIM);
    r.rect(0.4 * N, 0.87 * N, 0.2 * N, 0.07 * N, DARK);
    for (let k = 0; k < 5; k++) for (let j = 0; j < 6; j++) r.rect(0.41 * N + k * 0.038 * N, 0.88 * N + j * 1.4 * u, 0.03 * N, Math.max(1, u), j % 3 === 2 ? BRIGHT : CHIPS[k % 5][0]);
    handTop(r, H.x, H.y, 5 * u, H.a, LMID);
    for (const st of w.seats) playerAt(r, st.i, N, u, st.col, st.hat);
  },
};

// ---------------------------------------------------------------------------------------------- riffle
// A riffle shuffle close-up, from the side: two halves on the table, thumbs lifting their inner corners; sixteen
// cards a beat, the bottom card of each half in turn, drop onto the pile between them. Over two bars the cycle runs:
// the riffle, the bridge (the squared deck bowed up, then let go from the bottom so each card's ends spring up and
// it falls on the stack), two taps to square it, a cut and the split back into halves. A kick jolts the deck, a
// snare peeks the top card, a hat glints its edge. A drop: the spring flourish, the whole deck arcing hand to hand
// as a chain of cards on one parabola, caught. Kinds: the felt under a lamp, a close-up mat, or the flourish under a
// spot, which springs the deck every cycle instead of bridging it. Jumps between moves blend over a quarter second.
const RIFFLE_W = { felt: [3, 2, 1], mat: [2, 3, 2], flourish: [1, 2, 3] };
const riffle = {
  init(W) { Object.assign(W.w, { kind: rollW(W.rnd, RIFFLE_W, bandOf(W.a)), free: 0, off: 0, lastQ: -1, locked: null, released: 0, pile: 0, fall: [], spring: null, jolt: 0, peek: 0, glint: 0, lower: 0, morph: 0, snapNext: false, hl: null, hr: null }); },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets } = W, NC = 24, HALF = 12, y0 = 0.74 * N, Lc = 0.34 * N, th = 0.45 * u, cx = 0.5 * N, g = GRAV(N);
    const bass = clamp(f.rel.bassDrive), lk = beatLocked(f), base = lk ? f.beat.count + f.beat.phase : (w.free += dt * bpsOf(f));
    if (w.locked !== null && w.locked !== lk && w.lastQ >= 0) w.off = (((w.lastQ - base) % 8) + 8) % 8; // the clock changed hands: the cycle goes on from where it was
    w.locked = lk;
    const q = (((base + w.off) % 8) + 8) % 8;
    if (!w.pts || w.pts.length !== NC * 6) { w.pts = new Float32Array(NC * 6); w.snap = new Float32Array(NC * 6); }
    const springNow = () => { if (w.spring) return; w.spring = { t: 0 }; w.snap.set(w.pts); w.morph = 1; }; // from wherever the cards were, blended
    if (f.section === 'change') w.kind = rollW(rnd, RIFFLE_W, bandOf(W.a));
    if (f.section === 'drop') springNow();
    if (w.kind === 'flourish' && w.lastQ >= 0 && w.lastQ < 1.5 && q >= 1.5 && q < 2) springNow();
    if (q < w.lastQ - 1) { w.released = 0; w.pile = 0; w.fall.length = 0; }
    w.lastQ = q;
    for (const h of hits) { if (isLow(h)) w.jolt = 0.04 + 0.1 * h.strength; else if (h.kind === 'snare') w.peek = 0.3; else if (h.kind === 'hat') w.glint = 0.1; }
    w.jolt -= dt; w.peek -= dt; w.glint -= dt; w.lower *= Math.exp(-dt * 8); w.morph -= dt / 0.25;
    const pts = w.pts, jx = w.jolt > 0 ? (hash(Math.floor(t * 60), 3) - 0.5) * 3 * u : 0, bendBase = (4 + 3 * bass) * u;
    const xL0 = cx - 0.85 * Lc, xR0 = cx + 0.85 * Lc, ya = y0 - 0.12 * N;
    let n = 0, hl = [xL0 - 2 * u, y0 - 4 * u], hr = [xR0 + 2 * u, y0 - 4 * u];
    const put = (xl, yl, xm, ym, xr, yr) => { const o = n++ * 6; pts[o] = xl; pts[o + 1] = yl; pts[o + 2] = xm; pts[o + 3] = ym; pts[o + 4] = xr; pts[o + 5] = yr; };
    const bent = (side, yb, bend) => { const xo = side < 0 ? xL0 : xR0, xi = xo - side * Math.sqrt(Math.max(0, Lc * Lc - bend * bend)); put(xo + jx, yb, xo - side * 0.55 * Lc + jx, yb - bend * 0.35, xi + jx, yb - bend); };
    const flat = (x, yb, len = Lc) => put(x + jx, yb, x + len / 2 + jx, yb, x + len + jx, yb);
    if (w.spring) { // the flourish: the pack bowed in the left hand lets its cards go from the top, each on the same parabola to the right hand
      const S = w.spring, Tf = 0.45, xa = cx - 0.5 * Lc, xb = cx + 0.5 * Lc, vx = (xb - xa) / Tf, vy0 = -0.5 * g * Tf, gap = 0.03;
      S.t += dt;
      for (let k = 0; k < NC; k++) {
        const tl = S.t - k * gap, pos = NC - 1 - k;
        if (tl < 0) flat(xa - 0.25 * Lc, ya - pos * th, 0.5 * Lc);
        else if (tl < Tf) { const x = xa + vx * tl, y = ya + vy0 * tl + 0.5 * g * tl * tl, ang = Math.atan2(vy0 + g * tl, vx), dx = Math.cos(ang) * 0.22 * Lc, dy = Math.sin(ang) * 0.22 * Lc; put(x - dx, y - dy, x, y, x + dx, y + dy); }
        else flat(xb - 0.25 * Lc, ya - k * th, 0.5 * Lc);
      }
      hl = [xa - 0.3 * Lc, ya - 2 * u]; hr = [xb + 0.3 * Lc, ya - 2 * u];
      if (S.t > NC * gap + Tf + 0.3) { w.spring = null; w.off = (((3 - base) % 8) + 8) % 8; w.lower = 1; w.snapNext = true; } // caught: on to the squared deck, set down
    } else if (q < 1.5) { // the riffle: the bottom card of each half let go in turn, its inner end falling under gravity onto the pile
      const m = Math.min(NC, Math.floor(q * 16)), bend = Math.max(bendBase, (w.pile + w.fall.length) * th + 2 * u);
      for (let j = w.released; j < m; j++) w.fall.push({ side: j % 2 ? 1 : -1, h: bend, vh: 0 });
      w.released = Math.max(w.released, m);
      const remL = HALF - Math.ceil(m / 2), remR = HALF - Math.floor(m / 2);
      for (let i = 0; i < remL; i++) bent(-1, y0 - i * th, bend);
      for (let i = 0; i < remR; i++) bent(1, y0 - i * th, bend);
      for (let j = 0; j < w.pile; j++) flat(cx + (j % 2 ? -0.15 : -0.85) * Lc, y0 - j * th);
      w.fall = w.fall.filter((c) => {
        c.h += (c.vh - 0.5 * g * dt) * dt; c.vh -= g * dt;
        if (c.h <= w.pile * th) { flat(cx + (w.pile % 2 ? -0.15 : -0.85) * Lc, y0 - w.pile * th); w.pile++; return false; }
        const xo = c.side < 0 ? xL0 : xR0, xi = xo - c.side * Math.sqrt(Math.max(0, Lc * Lc - c.h * c.h));
        put(xo + jx, y0, xo - c.side * 0.5 * Lc + jx, y0 - c.h * 0.4, xi + jx, y0 - c.h);
        return true;
      });
      hl = [xL0 - 2 * u, y0 - remL * th - 4 * u]; hr = [xR0 + 2 * u, y0 - remR * th - 4 * u];
    } else if (q < 3) { // the bridge: squared and bowed over half a beat, then let go from the bottom up
      const A = (6 + 3 * bass) * u, e = ease((q - 1.5) / 0.5);
      for (let i = 0; i < NC; i++) {
        const x0 = lerp(cx + (i % 2 ? -0.15 : -0.85) * Lc, cx - 0.5 * Lc, e), sp = clamp((q - 2 - (i / NC) * 0.9) / 0.3), arch = A * e * (1 - sp), lift = A * 0.8 * Math.sin(Math.PI * sp), yb = y0 - i * th;
        put(x0 + jx, yb - lift, x0 + 0.5 * Lc + jx, yb - arch - lift * 0.3, x0 + Lc + jx, yb - lift);
      }
      hl = [cx - 0.5 * Lc - 2 * u, y0 - NC * th * 0.5 - 3 * u]; hr = [cx + 0.5 * Lc + 2 * u, y0 - NC * th * 0.5 - 3 * u];
    } else if (q < 4) { // squared up: two taps of the hands on the long edges
      const tap = q >= 3.25 && q % 0.5 < 0.1 ? (hash(Math.floor(t * 40), 7) - 0.5) * 2 * u : 0;
      for (let i = 0; i < NC; i++) flat(cx - 0.5 * Lc + tap, y0 - i * th);
      hl = [cx - 0.5 * Lc - 2 * u + tap, y0 - NC * th - 2 * u]; hr = [cx + 0.5 * Lc + 2 * u + tap, y0 - NC * th - 2 * u];
    } else if (q < 5.5) { // the cut: the top half lifted and set down to the right, the bottom half lifted onto it
      const e1 = ease((q - 4) / 0.6), e2 = ease((q - 4.7) / 0.6), dx = 0.35 * Lc;
      for (let i = 0; i < NC; i++) {
        const top = i >= HALF, e = top ? e1 : e2, lift = (top ? 6 : 10) * u * Math.sin(Math.PI * e);
        flat(cx - 0.5 * Lc + e * dx, lerp(y0 - i * th, y0 - (top ? i - HALF : i + HALF) * th, e) - lift);
      }
      hr = [cx - 0.15 * Lc + 0.5 * Lc + 2 * u, y0 - HALF * th - 3 * u - (e1 < 1 ? 6 * u * Math.sin(Math.PI * e1) : 0)];
      hl = [cx - 0.5 * Lc + e2 * dx - 2 * u, y0 - HALF * th - 3 * u - 10 * u * Math.sin(Math.PI * e2)];
    } else { // the split for the next riffle: the top half carried over to the left end, then the thumbs lift the inner corners
      const e = ease((q - 5.5) / 1.2), bend = bendBase * ease((q - 7.4) / 0.6);
      for (let i = 0; i < NC; i++) {
        if (i < HALF) { if (bend > 0) bent(1, y0 - i * th, bend); else flat(cx - 0.15 * Lc, y0 - i * th); }
        else if (e < 1) flat(lerp(cx - 0.15 * Lc, cx - 0.85 * Lc, e), lerp(y0 - i * th, y0 - (i - HALF) * th, e) - 8 * u * Math.sin(Math.PI * e));
        else if (bend > 0) bent(-1, y0 - (i - HALF) * th, bend);
        else flat(cx - 0.85 * Lc, y0 - (i - HALF) * th);
      }
      hl = [lerp(cx - 0.15 * Lc, cx - 0.85 * Lc, e) - 2 * u, y0 - HALF * th - 3 * u - 8 * u * Math.sin(Math.PI * e)]; hr = [xR0 + 2 * u, y0 - HALF * th - 3 * u];
    }
    if (w.peek > 0 && n > 0) pts[(n - 1) * 6 + 5] -= 3 * u * Math.sin(Math.PI * (1 - w.peek / 0.3)); // the snare's peek: the top card's end lifted and let down
    // the deck set down after a flourish, and a jump between moves blended from the last picture
    const dy = w.lower * (ya - y0), mk = w.morph > 0 ? w.morph * w.morph : 0;
    for (let i = 0; i < n * 6; i++) { if (i % 2) pts[i] += dy; if (mk > 0) pts[i] = lerp(pts[i], w.snap[i], mk); }
    if (w.snapNext) { w.snap.set(pts); w.morph = 1; w.snapNext = false; }
    // the room and the table: the felt with the lamp's pool, a close-up mat with its stitched edge, or a spot from above
    r.rect(0, 0, N, y0, DARK);
    if (w.kind === 'mat') {
      r.rect(0, y0, N, N - y0, DARK + DIM);
      r.rect(0.1 * N, y0, 0.8 * N, 0.19 * N, MID + DIM);
      for (let x = 0.12 * N; x < 0.88 * N; x += 3 * u) r.rect(x, y0 + 0.17 * N, 1.5 * u, Math.max(1, 0.5 * u), LMID + DIM);
    } else {
      if (w.kind === 'flourish') r.poly([[cx - 0.05 * N, 0], [cx + 0.05 * N, 0], [cx + 0.34 * N, y0], [cx - 0.34 * N, y0]], MID + DIM);
      r.ring(cx, y0 + 0.12 * N, 0.17 * N, 0.34 * N, LMID + DIM, 0.3);
    }
    r.rect(0, y0, N, Math.max(1, u), LMID);
    // the cards, every fourth edge a shade darker
    for (let i = 0; i < n; i++) {
      const o = i * 6, c = i === n - 1 && w.glint > 0 ? WHITE : i % 4 === 3 ? LMID : BRIGHT;
      r.line(pts[o], pts[o + 1], pts[o + 2], pts[o + 3], c);
      r.line(pts[o + 2], pts[o + 3], pts[o + 4], pts[o + 5], c);
    }
    w.hl = w.hl ? [follow(w.hl[0], hl[0], dt, 0.08), follow(w.hl[1], hl[1] + dy, dt, 0.08)] : hl;
    w.hr = w.hr ? [follow(w.hr[0], hr[0], dt, 0.08), follow(w.hr[1], hr[1] + dy, dt, 0.08)] : hr;
    handSide(r, w.hl[0], w.hl[1], 6 * u, LMID, 1);
    handSide(r, w.hr[0], w.hr[1], 6 * u, LMID, -1);
    targets.push({ x: cx - 0.9 * Lc, y: y0 - 0.16 * N, w: 1.8 * Lc, h: 0.16 * N });
  },
};

// ---------------------------------------------------------------------------------------------- chips
// Chip stacks on the felt, seen a little from above. On each kick a chip is tossed from the hand onto a stack in a
// parabola that ends on its top; a stack grown past its tipping height breaks: the packet above the break (its balance
// point just past the edge) turns about its bottom edge under gravity, faster as it leans, and lets go, the chips
// flying off with the speed of the turn, bouncing on the felt and sliding out to a stop under friction; a chip left
// lying is slid back to the nearest stack and joins it. Loud bass tosses on the beats
// too. A snare spins a chip on its edge: it wobbles down like a coin, precessing faster as it flattens. A drop (and
// a section change, with a new layout): the dealer's rake reaches over and pulls every chip off to the dealer's
// side; new stacks are pushed in after. Edge stripes by value. Kinds: a player's few stacks, the dealer's rows, a
// high roller's towers.
const CHIPSET_W = { player: [3, 2, 1], rows: [2, 2, 2], highroller: [1, 2, 3] };
function chipLayout(kind, N, rnd) {
  const out = [], mk = (x, y, tip) => ({ x, y, tx: x, ty: y, n: 2 + Math.floor(rnd() * 4), val: Math.floor(rnd() * 5), tip: tip + Math.floor(rnd() * 3), topple: null, h: 0, vh: 0, vx: 0, vy: 0, k: 3, glint: 0 });
  if (kind === 'player') for (let i = 0; i < 4; i++) out.push(mk((0.28 + i * 0.15) * N, 0.78 * N, 9));
  else if (kind === 'rows') for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) out.push(mk((0.26 + i * 0.16 + j * 0.04) * N, (0.52 + j * 0.24) * N, 7));
  else for (let i = 0; i < 5; i++) out.push(mk((0.22 + i * 0.14) * N, 0.72 * N, 14));
  return out;
}

const chips = {
  init(W) {
    const { w, rnd, N } = W, band = bandOf(W.a);
    Object.assign(w, { kind: rollW(rnd, CHIPSET_W, band), loose: [], toss: [], spins: [], rake: null, hand: { x: 0.88 * N, y: 0.92 * N, fx: 0.88 * N, fy: 0.92 * N }, flick: 0, aim: 0, order: [], N });
    w.stacks = chipLayout(w.kind, N, rnd);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = GRAV(N), R = 3.2 * u, th = 0.8 * u, sy = 0.45;
    if (w.N !== N) chips.init(W); // the table laid out afresh at another size
    const topOf = (st) => st.y - st.n * th;
    const tossAt = (st) => { // from the hand to the top of a stack in 0.45 s: the velocity that parabola needs to end where the chip will lie
      const T = 0.45, x0 = w.hand.x - 2 * u, y0 = w.hand.y - 4 * u, tx = st.x, ty = topOf(st);
      w.toss.push({ x: x0, y: y0, vx: (tx - x0) / T, vy: (ty - y0) / T - 0.5 * g * T, t: 0, T, st, val: st.val, spin: rnd() * TAU });
      w.flick = 0.2; w.hand.fx = tx; w.hand.fy = ty;
    };
    const grow = (st, dir) => { // one more chip on top; past its tipping height (or near it, now and then) the stack breaks
      st.n++;
      if (st.n > st.tip || (st.n > st.tip * 0.7 && rnd() < 0.08)) st.topple = { b: 1 + Math.floor(rnd() * Math.min(3, st.n - 2)), a: 0, om: 0.3, dir };
    };
    const rake = () => { if (!w.rake) w.rake = { y: 0.22 * N, t: 0, pull: false }; };
    if (f.section === 'change') { w.kind = rollW(rnd, CHIPSET_W, band); rake(); }
    if (f.section === 'drop') { rake(); s.shake = Math.max(s.shake, 0.2); }
    const beat = beatTick(w, f, dt), live = w.stacks;
    for (const h of hits) {
      if (isLow(h) && !w.rake) tossAt(live[(isTonal(h) ? h.pc : w.aim++) % live.length]);
      else if (h.kind === 'snare' && !w.rake) w.spins.push({ x: (0.15 + rnd() * 0.7) * N, y: (0.86 + rnd() * 0.08) * N, psi: rnd() * TAU, t: 0, T: 1.4 + rnd() * 0.8, val: Math.floor(rnd() * 5) });
      else if (h.kind === 'hat') pick(rnd, live).glint = 0.1;
    }
    if (beat && f.rel.bassDrive > 0.65 && !w.rake) tossAt(pick(rnd, live));
    if (w.loose.length > 48) rake(); // the felt crowded with chips no stack can hold: the dealer rakes it clear
    w.flick -= dt;
    // the tosses: a parabola, the chip flipping over in the air; landing adds it to the stack
    w.toss = w.toss.filter((p) => {
      p.spin += 12 * dt;
      if (fly(p, dt, g)) return true;
      const st = p.st;
      if (!w.stacks.includes(st) || st.topple) w.loose.push({ x: p.x, y: p.y, vx: p.vx * 0.3, vy: 0, spin: 0, om: 4, land: st.y + (rnd() - 0.5) * 3 * u, life: 3, val: p.val });
      else grow(st, p.vx > 0 ? 1 : -1);
      return false;
    });
    for (const st of w.stacks) {
      if (st.vh || st.h > 0) { st.vh -= g * dt; st.h += st.vh * dt; if (st.h < 0) { st.h = 0; st.vh = -st.vh * 0.4; if (Math.abs(st.vh) < 0.01 * N) st.vh = 0; } }
      st.glint -= dt;
      if (st.vx || st.vy) { if (slide(st, dt) < 0.003 * N) st.vx = st.vy = 0; }
      const T = st.topple;
      if (T) { // the packet above the break, a rigid block 2R wide, turns about its bottom edge: gravity's pull on its balance point
        // (a quarter radian past the edge when it broke) grows with the lean, α = 3g/(4d)·sin(lean + 0.25), d half its diagonal
        const al = ((3 * g) / (2 * Math.hypot(2 * R, (st.n - T.b) * th))) * Math.sin(T.a + 0.25);
        T.a += (T.om + 0.5 * al * dt) * dt; T.om += al * dt;
        if (T.a > 1.1) {
          const px = st.x + T.dir * R, py = st.y - T.b * th, c = Math.cos(T.dir * T.a), sn = Math.sin(T.dir * T.a);
          for (let i = T.b; i < st.n; i++) {
            const rx = -T.dir * R, ry = -(i - T.b + 0.5) * th, qx = rx * c - ry * sn, qy = rx * sn + ry * c;
            w.loose.push({ x: px + qx, y: py + qy, vx: -T.dir * T.om * qy + (rnd() - 0.5) * 0.06 * N, vy: T.dir * T.om * qx, spin: T.dir * T.a, om: T.dir * T.om * 0.6, land: st.y + (rnd() - 0.5) * 4 * u + (i - T.b) * 0.3 * u, life: 3, val: st.val });
          }
          st.n = T.b; st.topple = null;
          s.shake = Math.max(s.shake, 0.1);
        }
      }
    }
    // the loose chips: a fall onto the felt with a bounce that loses most of its speed, a slide out with friction; one
    // lying still a while is slid along the felt to the nearest standing stack and joins it
    w.loose = w.loose.filter((p) => {
      if (p.home) {
        const sp = slide(p, dt);
        p.land = p.y;
        if (Math.hypot(p.x - p.home.x, p.y - p.home.y) > R * 0.6 && sp > 0.002 * N) return true;
        if (w.stacks.includes(p.home) && !p.home.topple) { grow(p.home, p.x > p.home.x ? -1 : 1); return false; }
        p.home = null; p.life = 1; p.vx = p.vy = 0;
        return true;
      }
      if (p.y < p.land || p.vy !== 0) { p.y += (p.vy + 0.5 * g * dt) * dt; p.vy += g * dt; p.spin += p.om * dt; if (p.y >= p.land) { p.y = p.land; p.vy = -p.vy * 0.35; p.vx *= 0.7; p.om *= 0.5; if (Math.abs(p.vy) < 0.04 * N) p.vy = 0; } }
      else { // flat on the felt: Coulomb friction, the felt's grip for a chip (as slideTo's k = 3), to a stop
        const dv = 1.125 * N * dt;
        p.vx = Math.abs(p.vx) <= dv ? 0 : p.vx - Math.sign(p.vx) * dv; p.om *= Math.exp(-3 * dt);
        if ((p.life -= dt) < 0 && !w.rake) {
          let best = null, bd = Infinity;
          for (const st of w.stacks) { const d = Math.hypot(st.x - p.x, st.y - p.y); if (!st.topple && d < bd) { bd = d; best = st; } }
          if (best) { p.home = best; slideTo(p, best.x, best.y, 4, N); }
        }
      }
      p.x += p.vx * dt;
      return p.x > -R && p.x < N + R && p.y > -R;
    });
    // the rake: the head reaches over the stacks from the dealer's side to the near edge, then pulls everything ahead
    // of it off the far side; the new stacks are pushed in from the near edge after it
    if (w.rake) {
      const K = w.rake;
      K.t += dt;
      if (!K.pull) { K.y = lerp(0.22 * N, 1.02 * N, ease(K.t / 0.6)); if (K.t > 0.6) { K.pull = true; K.t = 0; } }
      else {
        K.y = lerp(1.02 * N, -0.12 * N, ease(K.t / 1.8));
        for (const st of w.stacks) if (st.y > K.y - R * sy - u) { st.y = K.y - R * sy - u; st.ty = st.y; st.vx = st.vy = 0; if (!st.topple && st.n > 5 && rnd() < dt * 1.5) st.topple = { b: 1, a: 0, om: 0.5, dir: rnd() < 0.5 ? -1 : 1 }; }
        for (const p of w.loose) if (p.land > K.y - R * sy) { p.home = null; p.land = K.y - R * sy; p.y = Math.min(p.y, p.land); p.vx = p.vy = 0; }
        for (const sp of w.spins) if (sp.y > K.y - R) sp.T = 0.01;
        if (K.t > 1.8) { w.rake = null; w.loose.length = 0; w.toss.length = 0; w.stacks = chipLayout(w.kind, N, rnd); for (const st of w.stacks) { st.y = 1.1 * N + rnd() * 0.1 * N; slideTo(st, st.tx, st.ty, 3, N); } }
      }
    }
    // the far rail and the lamp's pool; the stacks and the loose chips far to near (a tipping packet turned about its
    // edge), the spinners, the chips in the air, the rake, the hand
    r.rect(0, 0, N, 0.2 * N, DARK + DIM);
    r.rect(0, 0.2 * N, N, 0.05 * N, DARK);
    r.rect(0, 0.24 * N, N, Math.max(1, u), MID);
    r.ring(0.5 * N, 0.75 * N, 0.25 * N, 0.5 * N, LMID + DIM, 0.3);
    const order = w.order;
    order.length = 0;
    for (const st of w.stacks) order.push(st);
    for (const p of w.loose) order.push(p);
    order.sort((p, q) => (p.land ?? p.y) - (q.land ?? q.y));
    for (const o of order) {
      if (o.land !== undefined) { r.ring(o.x, o.y, R * 0.5, R, CHIPS[o.val][0], o.vy !== 0 && !o.home ? sy + 0.5 * Math.abs(Math.sin(o.spin)) : sy); continue; }
      const st = o, T = st.topple;
      stack(r, st.x, st.y, R, T ? T.b : st.n, st.val, u, st.h);
      if (st.glint > 0) r.rect(st.x - R * 0.6, topOf(st) - u, Math.max(1, u), Math.max(1, u), WHITE);
      if (T) {
        const px = st.x + T.dir * R, py = st.y - T.b * th, c = Math.cos(T.dir * T.a), sn = Math.sin(T.dir * T.a), col = CHIPS[st.val][0];
        for (let i = T.b; i < st.n; i++) { const rx = -T.dir * R, ry = -(i - T.b + 0.5) * th, qx = rx * c - ry * sn, qy = rx * sn + ry * c; r.ring(px + qx, py + qy, R * 0.5, R, i % 5 === 4 ? BRIGHT : col, lerp(sy, 0.9, Math.abs(Math.sin(T.a)))); }
      }
      if (T || st.vh) targets.push({ x: st.x - R, y: topOf(st) - 2 * u, w: 2 * R, h: st.n * th + 3 * u });
    }
    w.spins = w.spins.filter((sp) => { // Euler's disk: the tilt from upright goes to flat in finite time while the precession runs away
      sp.t += dt;
      const q = Math.min(1, sp.t / sp.T), al = (Math.PI / 2) * Math.pow(1 - q, 0.6), sa = Math.sin(al), ca = Math.cos(al);
      sp.psi += dt * Math.min(40, 3 + 14 * Math.pow(1 - al / (Math.PI / 2), 1.5) / Math.max(0.08, sa));
      const rx = R * Math.sqrt(1 - sa * sa * Math.cos(sp.psi) ** 2), ry = R * Math.sqrt(sa * sa + sy * sy * ca * ca);
      r.ring(sp.x, sp.y - R * sa, rx * 0.5, rx, CHIPS[sp.val][0], ry / rx);
      if (q < 1) return true;
      w.loose.push({ x: sp.x, y: sp.y, vx: 0, vy: 0, spin: 0, om: 0, land: sp.y, life: 3, val: sp.val });
      return false;
    });
    for (const p of w.toss) r.ring(p.x, p.y, R * 0.5, R, CHIPS[p.val][0], 0.15 + 0.85 * Math.abs(Math.cos(p.spin)));
    if (w.rake) { const K = w.rake, c = K.pull ? MID : MID + DIM, lift = K.pull ? 0 : 2 * u; r.rect(0.5 * N - u, 0, Math.max(1, 1.5 * u), K.y - lift, c); r.rect(0.08 * N, K.y - u - lift, 0.84 * N, Math.max(1, 2 * u), c); }
    // the hand: at rest by the near edge, a flick toward the stack it tossed at, bobbing with the level
    const Hh = w.hand, k = w.flick > 0 ? 0.15 : 0;
    Hh.x = follow(Hh.x, 0.88 * N + (Hh.fx - 0.88 * N) * k, dt, 0.06);
    Hh.y = follow(Hh.y, 0.92 * N + (Hh.fy - 0.92 * N) * k + Math.sin(t * 3) * u * (0.5 + f.level), dt, 0.06);
    handTop(r, Hh.x, Hh.y, 5 * u, Math.atan2(Hh.fy - Hh.y, Hh.fx - Hh.x), LMID);
  },
};

// ---------------------------------------------------------------------------------------------- suits
// The four suits as a print: a grid of card-face tiles, each with one big suit mark that swells on the beat and
// rocks with it, hearts and diamonds in HOT, clubs and spades in DARK, the rows sliding with the mids over
// guilloché loops like a card back. A kick stamps the whole print, a snare jolts the rows, a note turns one tile,
// each beat turns a few (a foreshortened half turn, the suit changing edge-on). A drop turns every tile to one
// suit. Kinds: the grid, three, four or six across.
const GRID_W = { three: [3, 2, 1], four: [2, 3, 2], six: [1, 2, 3] };
const GRID_N = { three: 3, four: 4, six: 6 };
const HEART = (() => { const p = []; for (let i = 0; i <= 8; i++) { const a = Math.PI + (i / 8) * Math.PI; p.push([-0.5 + 0.5 * Math.cos(a), -0.35 + 0.5 * Math.sin(a)]); } for (let i = 0; i <= 8; i++) { const a = Math.PI + (i / 8) * Math.PI; p.push([0.5 + 0.5 * Math.cos(a), -0.35 + 0.5 * Math.sin(a)]); } p.push([0, 1]); return p; })();
const mkShape = (pts) => ({ pts, scr: pts.map(() => [0, 0]) });
const circ = (cx, cy, rr, n = 10) => Array.from({ length: n }, (_, i) => [cx + rr * Math.cos((i / n) * TAU), cy + rr * Math.sin((i / n) * TAU)]);
const SUIT_SHAPES = [
  [mkShape(HEART)],
  [mkShape([[0, -1], [0.72, 0], [0, 1], [-0.72, 0]])],
  [mkShape(circ(0, -0.5, 0.45)), mkShape(circ(-0.48, 0.2, 0.45)), mkShape(circ(0.48, 0.2, 0.45)), mkShape([[-0.14, 0.1], [0.14, 0.1], [0.3, 1], [-0.3, 1]])],
  [mkShape(HEART.map(([x, y]) => [x, -y * 0.9 + 0.05])), mkShape([[-0.14, 0.4], [0.14, 0.4], [0.32, 1.1], [-0.32, 1.1]])],
];
// a suit mark `s` tall at (cx, cy) turned by `a` and squashed to `sx` of its width (a tile turning)
function suitMark(r, kind, cx, cy, s, a, sx, c) {
  const ca = Math.cos(a), sa = Math.sin(a);
  for (const { pts, scr } of SUIT_SHAPES[kind]) {
    for (let i = 0; i < pts.length; i++) { const px = pts[i][0] * s, py = pts[i][1] * s; scr[i][0] = cx + (px * ca - py * sa) * sx; scr[i][1] = cy + px * sa + py * ca; }
    r.poly(scr, c);
  }
}
const newTiles = (gN) => Array.from({ length: gN * gN }, (_, i) => ({ suit: (i + Math.floor(i / gN)) % 4, next: 0, flip: 1 }));

const suits = {
  init(W) {
    const { w, rnd } = W, kind = rollW(rnd, GRID_W, bandOf(W.a));
    Object.assign(w, { kind, g: GRID_N[kind], tiles: newTiles(GRID_N[kind]), stamp: 0, jolt: 0, blink: -1 });
  },
  draw(W) {
    const { r, N, u, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a);
    if (f.section === 'change') { w.kind = rollW(rnd, GRID_W, band); w.g = GRID_N[w.kind]; w.tiles = newTiles(w.g); }
    const G = w.g, T = N / G, turn = (tl, suit, delay = 0) => { if (tl.flip >= 1) { tl.flip = -delay; tl.next = suit; } };
    if (f.section === 'drop') { const one = Math.floor(rnd() * 4); w.tiles.forEach((tl, i) => turn(tl, one, 0.03 * i)); s.shake = Math.max(s.shake, 0.2); }
    if (f.beat.on) for (let k = 0; k <= band; k++) turn(pick(rnd, w.tiles), Math.floor(rnd() * 4));
    for (const h of hits) {
      if (isLow(h)) w.stamp = 1;
      else if (h.kind === 'snare') w.jolt = T * 0.3 * (rnd() < 0.5 ? -1 : 1);
      else if (isTonal(h)) turn(w.tiles[(h.pc * 7) % w.tiles.length], Math.floor(rnd() * 4));
      else if (h.kind === 'hat') w.blink = Math.floor(rnd() * w.tiles.length);
    }
    w.stamp *= Math.exp(-dt * 6); w.jolt *= Math.exp(-dt * 8);
    for (const tl of w.tiles) if (tl.flip < 1) { const was = tl.flip; tl.flip = Math.min(1, tl.flip + dt * 2.2); if (was < 0.5 && tl.flip >= 0.5) tl.suit = tl.next; }
    // the guilloché behind: three loops of a card back turning with the bass clock, and a chain of rings round the edge
    const lc = w.stamp > 0.5 ? LMID + DIM : DARK, ph = f.rel.bassClock * 0.3;
    for (let k = 0; k < 3; k++) for (let i = 0; i < 160; i++) { const a = (i / 160) * TAU, rr = N * (0.16 + 0.11 * k) * (1 + 0.25 * Math.cos((5 + k) * a + ph * (k + 1))); r.set(N / 2 + rr * Math.cos(a + ph), N / 2 + rr * Math.sin(a + ph), lc); }
    for (let x = 3 * u; x < N; x += 7 * u) { r.ring(x, 3 * u, 2.2 * u, Math.max(1, u), lc); r.ring(x, N - 3 * u, 2.2 * u, Math.max(1, u), lc); r.ring(3 * u, x, 2.2 * u, Math.max(1, u), lc); r.ring(N - 3 * u, x, 2.2 * u, Math.max(1, u), lc); }
    // the tiles: rows slide with the mids and wrap; a tile is a card face, its mark swelling with the pulse, rocking with the beat
    const m = T * 0.08, pulse = f.beat.pulse, rock = Math.sin(f.beat.phase * TAU) * 0.3;
    for (let row = 0; row < G; row++) {
      const ox = Math.sin(f.rel.midClock * 0.6 + row * 1.3) * T * 0.35 * clamp(f.rel.midDrive) + w.jolt * (row % 2 ? 1 : -1), y = row * T;
      for (let i = -1; i <= G; i++) {
        const x = i * T + ox;
        if (x >= N || x + T <= 0) continue;
        const idx = row * G + ((i % G) + G) % G, tl = w.tiles[idx], fx = tl.flip < 0 ? 1 : Math.abs(Math.cos(Math.PI * tl.flip)), hw = (T / 2 - m) * fx;
        r.rect(x + T / 2 - hw, y + m, 2 * hw, T - 2 * m, idx === w.blink ? LMID : BRIGHT);
        if (hw < T * 0.08) continue;
        const sgn = (row + i) % 2 ? 1 : -1;
        suitMark(r, tl.suit, x + T / 2, y + T / 2 + (tl.suit >= 2 ? -T * 0.03 : 0), T * (0.24 + 0.08 * pulse + 0.06 * w.stamp), rock * sgn + f.rel.trebClock * 0.05 * sgn, fx, tl.suit < 2 ? HOT : DARK);
      }
    }
    w.blink = -1;
    targets.push({ x: N / 2 - T / 2, y: N / 2 - T / 2, w: T, h: T });
  },
};

// ---------------------------------------------------------------------------------------------- roulette
// A roulette wheel from above and the layout beside it, the croupier's hands over both. Every eight beats a hand
// spins the head and sends the ball the other way round the rim: the wheel runs down with friction, the ball
// loses speed, leaves the rim, spirals in (keeping its angular momentum, so it whirls faster as it nears the hub)
// past the deflectors, hops the frets and is caught in a pocket six beats after the launch, on the beat (counted on
// the same clock as the beats, locked or not), then rides with the wheel. A kick tosses a chip onto the layout (a note
// says where), a snare waves the hand over the bets. A drop: the big win, the ball dropped at once, a marker set
// on a box and every stack raked to it. Kinds: the wheel, classic wood, chrome, or neon with chasing lights.
const WHEEL_W = { classic: [3, 2, 1], chrome: [2, 2, 2], neon: [1, 2, 3] };
const WHEEL_LOOK = { classic: { bowl: DARK, rim: MID, a: HOT, b: BLACK, zero: COOL, hub: LMID, lights: false }, chrome: { bowl: MID, rim: LMID, a: BRIGHT, b: BLACK, zero: COOL, hub: BRIGHT, lights: false }, neon: { bowl: DARK + DIM, rim: COOL, a: HOT, b: COOL + DIM, zero: BRIGHT, hub: LMID, lights: true } };
const NP = 24;
const cellAt = (c, N) => (c === 0 ? [0.83 * N, 0.13 * N] : [N * (0.73 + ((c - 1) % 3) * 0.1), N * (0.215 + Math.floor((c - 1) / 3) * 0.09)]);

const roulette = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, WHEEL_W, bandOf(W.a)), ang: rnd() * TAU, om: 0.3, ball: null, beats: 0, bets: new Map(), toss: [], hw: { x: 0.1 * N, y: 0.18 * N, a: 0.6 }, hl: { x: 0.84 * N, y: 0.96 * N, a: -Math.PI / 2 }, sweep: 0, swT: 0, wave: 0, dolly: null, win: null, step: 0, glint: 0, N });
  },
  draw(W) {
    if (W.w.N !== W.N) roulette.init(W); // the table laid out afresh at another size
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = GRAV(N), look = WHEEL_LOOK[w.kind], cx = 0.34 * N, cy = 0.5 * N;
    const Rb = 0.3 * N, Rt = 0.265 * N, Rd = 0.235 * N, Ro = 0.205 * N, Ri = 0.14 * N, bps = bpsOf(f);
    const tossTo = (cell) => { const [tx, ty] = cellAt(cell, N), T = 0.4, x0 = w.hl.x, y0 = w.hl.y - 3 * u; w.toss.push({ x: x0, y: y0, vx: (tx - x0) / T, vy: (ty - y0) / T - 0.5 * g * T, t: 0, T, cell }); w.hl.a = Math.atan2(ty - y0, tx - x0); };
    if (f.section === 'change') w.kind = rollW(rnd, WHEEL_W, band);
    const beat = beatTick(w, f, dt);
    if (beat) w.beats++;
    const lk = beatLocked(f), cnt = f.beat.count + f.beat.phase;
    if (beat && w.beats % 8 === 0 && (!w.ball || w.ball.pocket >= 0)) { // the spin: the head one way, the ball the other from the hand on the rim, caught six beats on
      w.om += 2.2 + 1.6 * f.level;
      const a0 = w.ball ? w.ball.a : -2.4; // the ball picked out of its pocket where it lies and set on the track
      w.swA = a0;
      // its run is S beats long, counted from the beat itself: on the tracker's count when locked, else on the clock
      // beatTick keeps (b: the beats gone since that beat, less this frame's step, which the run below adds)
      w.ball = { a: a0, om: -(9 + 3 * rnd() + 2 * f.level), rad: w.ball ? w.ball.rad : Rt, S: 6, b: (lk ? cnt - Math.round(cnt) : w.beatPh || 0) - dt * bps, c0: lk ? Math.round(cnt) : null, pocket: -1, off: 0, hop: 0, flash: 0, defl: false };
      w.sweep = 0.45; w.swT = 0;
    }
    for (const h of hits) {
      if (isLow(h)) tossTo(isTonal(h) ? 1 + (h.pc * 2) % 24 : Math.floor(rnd() * 25));
      else if (h.kind === 'snare') w.wave = 0.6;
      else if (h.kind === 'hat') w.glint = 0.08;
    }
    if (f.section === 'drop') {
      const B0 = w.ball;
      if (B0 && B0.pocket < 0 && (B0.c0 !== null && lk ? (cnt - B0.c0) / B0.S : B0.b / B0.S) < 0.55) { // off the rim at once, and still caught on a beat: the rest of the run fitted to the beats left
        if (B0.c0 !== null && lk) { B0.S = (Math.ceil(cnt + 2.7) - cnt) / 0.45; B0.c0 = cnt - 0.55 * B0.S; }
        else { const p0 = lk ? f.beat.phase : w.beatPh || 0, left = 1 - p0 + Math.ceil(1.7 + p0); B0.S = left / 0.45; B0.b = 0.55 * B0.S - dt * bps; }
      }
      const cell = Math.floor(rnd() * 25), [wx, wy] = cellAt(cell, N);
      w.win = { cell, t: 0, piles: [] };
      for (const [c, b] of w.bets) if (c !== cell) { const [bx, by] = cellAt(c, N), p = { x: bx, y: by, vx: 0, vy: 0, n: b.n, val: b.val }; slideTo(p, wx + (rnd() - 0.5) * 2 * u, wy, 3, N); w.win.piles.push(p); }
      w.bets.clear();
      w.dolly = { x: w.hl.x, y: w.hl.y, vx: 0, vy: 0, cell };
      slideTo(w.dolly, wx + 2 * u, wy - 2 * u, 4, N);
      s.shake = Math.max(s.shake, 0.2);
    }
    w.om = Math.max(0, w.om * Math.exp(-0.1 * dt) - 0.06 * dt); // viscous drag and a touch of bearing friction
    w.ang += w.om * dt;
    w.glint -= dt; w.wave -= dt; w.sweep -= dt; w.swT += dt;
    w.step += ticks16(w, f, dt);
    const B = w.ball;
    if (B) {
      B.b += dt * bps; B.flash -= dt; B.hop *= Math.exp(-12 * dt);
      const q = B.c0 !== null && lk ? (cnt - B.c0) / B.S : B.b / B.S;
      if (B.pocket >= 0) { B.off = follow(B.off, ((B.pocket + 0.5) / NP) * TAU, dt, 0.05); B.a = w.ang + B.off; B.rad = follow(B.rad, (Ri + Ro) / 2, dt, 0.06); } // settled into the pocket, riding the head
      else if (q >= 1 - 1e-9) { B.off = (((B.a - w.ang) % TAU) + TAU) % TAU; B.pocket = Math.min(NP - 1, Math.floor((B.off / TAU) * NP)); B.flash = 0.3; B.om = w.om; }
      else if (q < 0.55) { B.om *= Math.exp(-0.35 * dt); B.a += B.om * dt; B.rad = follow(B.rad, Rt, dt, 0.05); } // the rim: the ball runs against the bowl, slowing
      else if (q < 0.85) { // the spiral down the cone, leaving the rim tangentially and falling in faster and faster: its angular
        // momentum r²ω kept (less what the bowl takes), so it whirls faster as it comes in; a deflector sends it on with less speed
        const L = B.om * B.rad * B.rad * Math.exp(-0.5 * dt);
        B.rad = lerp(Rt, Ro + u, ((q - 0.55) / 0.3) ** 2);
        B.om = L / (B.rad * B.rad); B.a += B.om * dt;
        if (!B.defl && B.rad < Rd) { B.defl = true; B.om = B.om * 0.6 + (rnd() - 0.5) * 2; B.hop = 1; }
      } else { // the frets: every divider it passes relative to the head knocks it up and takes speed, until it rides along
        let rel = (B.om - w.om) * Math.exp(-5 * dt);
        const before = Math.floor(((B.a - w.ang) / TAU) * NP), after = Math.floor(((B.a + rel * dt - w.ang) / TAU) * NP);
        if (after !== before) { rel *= 0.7; B.hop = 1; }
        B.om = w.om + rel; B.a += B.om * dt; B.rad = follow(B.rad, Ro - 1.5 * u, dt, 0.04);
      }
    }
    // the bowl, the ball track, the deflectors, the pockets turning, the hub and its turret; a neon wheel's lights chase on the sixteenths
    r.rect(0.66 * N, 0, 0.34 * N, N, DARK + DIM);
    r.disc(cx, cy, Rb + 2 * u, look.bowl);
    r.ring(cx, cy, Rt, 3 * u, MID + DIM);
    r.ring(cx, cy, Rb, Math.max(1, 2 * u), look.rim);
    if (look.lights) for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU, lit = (k + w.step) % 3 === 0; r.rect(cx + Math.cos(a) * (Rb + 3 * u) - u, cy + Math.sin(a) * (Rb + 3 * u) - u, Math.max(1, 2 * u), Math.max(1, 2 * u), lit ? BRIGHT : MID + DIM); }
    for (let i = 0; i < NP; i++) {
      const a0 = w.ang + (i / NP) * TAU, a1 = a0 + TAU / NP, c = i === 0 ? look.zero : i % 2 ? look.a : look.b;
      r.poly([[cx + Math.cos(a0) * Ri, cy + Math.sin(a0) * Ri], [cx + Math.cos(a0) * Ro, cy + Math.sin(a0) * Ro], [cx + Math.cos(a1) * Ro, cy + Math.sin(a1) * Ro], [cx + Math.cos(a1) * Ri, cy + Math.sin(a1) * Ri]], c);
      r.line(cx + Math.cos(a0) * Ri, cy + Math.sin(a0) * Ri, cx + Math.cos(a0) * Ro, cy + Math.sin(a0) * Ro, LMID);
    }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + 0.2, P = rotAt(cx + Math.cos(a) * Rd, cy + Math.sin(a) * Rd, a); r.poly([P(-1.5 * u, 0), P(0, -1.5 * u), P(1.5 * u, 0), P(0, 1.5 * u)], LMID); }
    r.disc(cx, cy, Ri, MID);
    r.ring(cx, cy, Ri * 0.5, Ri * 0.3, look.hub === BRIGHT ? LMID : look.hub + DIM);
    for (let k = 0; k < 4; k++) { const a = w.ang + (k / 4) * TAU; r.stroke(cx + Math.cos(a) * 0.25 * Ri, cy + Math.sin(a) * 0.25 * Ri, cx + Math.cos(a) * 0.9 * Ri, cy + Math.sin(a) * 0.9 * Ri, 1.5 * u, look.hub); }
    r.disc(cx, cy, 2 * u, BRIGHT);
    if (w.glint > 0) { const a = hash(Math.floor(t * 30), 5) * TAU; r.rect(cx + Math.cos(a) * Rb - u, cy + Math.sin(a) * Rb - u, Math.max(1, u), Math.max(1, u), WHITE); }
    if (B) { // the ball, its shadow on the track, a flash round the rim when it is caught
      const bx = cx + Math.cos(B.a) * (B.rad + B.hop * 1.5 * u), by = cy + Math.sin(B.a) * (B.rad + B.hop * 1.5 * u);
      r.disc(bx + u + B.hop * u, by + u + B.hop * u, 1.1 * u, DARK + DIM);
      r.ring(bx, by, 1.2 * u, Math.max(1, u), DARK);
      r.disc(bx, by, 0.9 * u, B.flash > 0 ? HOT : BRIGHT);
      if (B.flash > 0) r.ring(cx, cy, Rb + (0.3 - B.flash) * 0.25 * N, Math.max(1, u), BRIGHT);
      targets.push({ x: bx - 2 * u, y: by - 2 * u, w: 4 * u, h: 4 * u });
    }
    // the layout: a zero box over three columns of eight in a checker of the two pocket colours; the bets on it, the tosses in the air, the marker
    const cw = 0.1 * N, chh = 0.09 * N;
    for (let c = 0; c < 25; c++) {
      const [x, y] = cellAt(c, N), ww = c === 0 ? 0.3 * N : cw, hh = c === 0 ? 0.07 * N : chh, col = c === 0 ? look.zero : (c + Math.floor((c - 1) / 3)) % 2 ? look.a : look.b;
      r.rect(x - ww / 2 + 1, y - hh / 2 + 1, ww - 2, hh - 2, col === BLACK ? DARK : col < DIM ? col + DIM : col);
      r.frame(Math.round(x - ww / 2), Math.round(y - hh / 2), Math.round(ww), Math.round(hh), LMID + DIM);
    }
    for (const [c, b] of w.bets) { const [x, y] = cellAt(c, N); stack(r, x, y, 2 * u, b.n, b.val, u); }
    w.toss = w.toss.filter((p) => {
      const flying = fly(p, dt, g);
      r.ring(p.x, p.y, u, 2 * u, CHIPS[p.cell % 5][0], 0.3 + 0.7 * Math.abs(Math.cos(p.t * 20)));
      if (flying) return true;
      const b = w.bets.get(p.cell) || { n: 0, val: p.cell % 5 };
      b.n = Math.min(8, b.n + 1); w.bets.set(p.cell, b);
      return false;
    });
    if (w.win) {
      const V = w.win;
      V.t += dt;
      for (const p of V.piles) { slide(p, dt); stack(r, p.x, p.y, 2 * u, p.n, p.val, u); }
      if (V.t > 1.6 && V.t - dt <= 1.6) for (const p of V.piles) slideTo(p, 0.92 * N + (rnd() - 0.5) * 2 * u, 1.04 * N, 2.5, N);
      if (V.t > 3.5) { w.win = null; w.dolly = null; }
    }
    if (w.dolly) { const D = w.dolly; slide(D, dt); r.rect(D.x - u, D.y - 3 * u, Math.max(1, 2 * u), 3 * u, LMID); r.ring(D.x, D.y, 1.2 * u, 2.4 * u, BRIGHT, 0.6); r.ring(D.x, D.y, 2.2 * u, Math.max(1, u), DARK, 0.6); }
    // the hands: one sweeps the rim for the spin and rests by the bowl, the other tosses, waves and sets the marker from the near corner
    const HW = w.hw, HL = w.hl;
    if (w.sweep > 0) { const a = (w.swA ?? -2.4) + 1.8 * ease(w.swT / 0.45); HW.x = cx + Math.cos(a) * (Rb + 4 * u); HW.y = cy + Math.sin(a) * (Rb + 4 * u); HW.a = a + Math.PI / 2; }
    else { HW.x = follow(HW.x, 0.08 * N, dt, 0.2); HW.y = follow(HW.y, 0.16 * N, dt, 0.2); HW.a = followAngle(HW.a, 0.8, dt, 0.2); }
    const wv = w.wave > 0 ? Math.sin(((0.6 - w.wave) / 0.6) * Math.PI) : 0, tossing = w.toss.length > 0, setting = w.dolly && w.win && w.win.t < 1;
    HL.x = follow(HL.x, setting ? w.dolly.x - 3 * u : 0.84 * N - wv * 0.12 * N, dt, 0.08);
    HL.y = follow(HL.y, setting ? w.dolly.y + 3 * u : 0.96 * N - wv * 0.3 * N - (tossing ? 3 * u : 0), dt, 0.08);
    if (!tossing) HL.a = followAngle(HL.a, -Math.PI / 2, dt, 0.1);
    handTop(r, HW.x, HW.y, 5 * u, HW.a, LMID);
    handTop(r, HL.x, HL.y, 5 * u, HL.a, LMID);
  },
};

// ---------------------------------------------------------------------------------------------- slots
// A slot machine head on: three or five reels of fruit, bells, bars, plums and bolts behind the window, bulbs
// chasing round the cabinet on the sixteenths, a lever at the side. A kick pulls the lever (the arm swings down
// toward us about its pivot and springs back) and the reels spin up into a blur; from the next beat they stop one a
// beat, each easing onto a symbol from the speed it had with a bounce back past it. Three alike from the left down
// the payline is a win: coins pour from the chute, fall, bounce on the tray, roll down the heap and pile up; later
// the tray is emptied from the top. A snare nudges the stopped reels, a hat glints a bulb. A drop pulls the lever
// rigged for the bolts. Kinds: three reels, five, or the tower with its jackpot lamp (a new one waits for the reels).
const SLOT_W = { three: [3, 2, 1], five: [1, 2, 3], tower: [2, 2, 2] };
const SYM_COL = [HOT, LMID, FIG, COOL, HOT];
// a reel symbol `s` tall at (x, y): a cherry pair on their stems, a bell, a bar block, a plum, a bolt
function slotSym(r, kind, x, y, s, u) {
  switch (kind) {
    case 0: for (const d of [-1, 1]) { r.disc(x + d * s * 0.28, y + s * 0.28 + (d > 0 ? s * 0.06 : 0), s * 0.24, HOT); r.line(x + d * s * 0.28, y + s * 0.1, x + s * 0.04, y - s * 0.45, COOL); } r.poly([[x + s * 0.04, y - s * 0.45], [x + s * 0.35, y - s * 0.5], [x + s * 0.2, y - s * 0.25]], COOL); break;
    case 1: r.disc(x, y - s * 0.05, s * 0.36, LMID); r.rect(x - s * 0.36, y - s * 0.05, s * 0.72, s * 0.32, LMID); r.rect(x - s * 0.46, y + s * 0.24, s * 0.92, Math.max(1, s * 0.1), BRIGHT); r.disc(x, y + s * 0.4, s * 0.09, FIG); r.rect(x - u * 0.5, y - s * 0.5, Math.max(1, u), s * 0.1, BRIGHT); break;
    case 2: r.rect(x - s * 0.5, y - s * 0.22, s, s * 0.44, FIG); r.rect(x - s * 0.42, y - s * 0.08, s * 0.84, s * 0.16, BRIGHT); break;
    case 3: r.disc(x, y + s * 0.05, s * 0.38, COOL); r.rect(x - u * 0.5, y - s * 0.5, Math.max(1, u), s * 0.2, FIG); r.rect(x - s * 0.18, y - s * 0.15, Math.max(1, u), Math.max(1, u), BRIGHT); break;
    default: r.poly([[x - s * 0.08, y - s * 0.5], [x + s * 0.3, y - s * 0.5], [x + s * 0.06, y - s * 0.08], [x + s * 0.32, y - s * 0.08], [x - s * 0.2, y + s * 0.5], [x - s * 0.04, y + s * 0.06], [x - s * 0.32, y + s * 0.06]], HOT);
  }
}
const backOut = (q) => 1 + 2.7 * (q - 1) ** 3 + 1.7 * (q - 1) ** 2; // leaves 0 at 4.7 times the mean speed, overshoots, settles
function slotSetup(w, rnd, N, u) {
  const nR = w.kind === 'five' ? 5 : 3;
  w.reels = Array.from({ length: nR }, () => ({ p: Math.floor(rnd() * 12), v: 0, want: 0, stop: null, strip: Array.from({ length: 12 }, (_, i) => (i % 6 === 5 ? 4 : Math.floor(rnd() * 4))) }));
  w.bulbs = [];
  const x0 = 0.14 * N + 1.5 * u, x1 = 0.86 * N - 1.5 * u, y0 = 0.1 * N + 1.5 * u, y1 = 0.92 * N - 1.5 * u, st = 3.5 * u;
  for (let x = x0; x < x1; x += st) w.bulbs.push([x, y0]);
  for (let y = y0; y < y1; y += st) w.bulbs.push([x1, y]);
  for (let x = x1; x > x0; x -= st) w.bulbs.push([x, y1]);
  for (let y = y1; y > y0; y -= st) w.bulbs.push([x0, y]);
  if (w.N !== N) { w.pile = new Float32Array(Math.ceil(0.6 * N) + 1); w.rest = []; w.coins = []; w.roll = []; w.N = N; }
}

const slots = {
  init(W) {
    const { w, rnd, N, u } = W;
    Object.assign(w, { kind: rollW(rnd, SLOT_W, bandOf(W.a)), want: null, pat: Math.floor(rnd() * 3), step: 0, lev: { a: 0, va: 0 }, pull: 0, spinning: false, nextStop: 0, sinceBeat: 0, rig: -1, win: -99, pour: 0, nudge: 0, glint: -1, N: 0 });
    slotSetup(w, rnd, N, u);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = GRAV(N);
    if (w.N !== N) slotSetup(w, rnd, N, u);
    if (f.section === 'change') { w.want = rollW(rnd, SLOT_W, band); w.pat = Math.floor(rnd() * 3); }
    if (w.want && !w.spinning && !w.reels.some((re) => re.stop)) { w.kind = w.want; w.want = null; slotSetup(w, rnd, N, u); }
    const nR = w.reels.length, wx0 = 0.2 * N, ww = 0.6 * N, wy0 = 0.3 * N, wh = 0.3 * N, rowH = wh / 3, ymid = wy0 + wh / 2, gap = 2 * u, rw = (ww - (nR - 1) * gap) / nR, sz = Math.min(rw * 0.7, rowH * 0.8);
    const pull = (rig) => { // the lever down, the reels up to speed; a rigged pull (even through a spin) stops them all on the bolt
      w.pull = 0.25;
      if (rig >= 0 || (!w.spinning && !w.reels.some((re) => re.stop))) { w.spinning = true; w.nextStop = 0; w.sinceBeat = 0; w.rig = rig; for (const re of w.reels) { re.stop = null; re.want = 14 + 6 * W.a; } }
    };
    const beat = beatTick(w, f, dt);
    if (f.section === 'drop') { pull(4); s.shake = Math.max(s.shake, 0.2); }
    for (const h of hits) {
      if (isLow(h)) pull(-1);
      else if (h.kind === 'snare') w.nudge = 0.2;
      else if (h.kind === 'hat') w.glint = Math.floor(rnd() * w.bulbs.length);
    }
    w.step += ticks16(w, f, dt);
    w.pull -= dt; w.nudge -= dt; w.win -= dt;
    // the lever: an arm on the cabinet's side turning toward us about its pivot (θ from straight up), a stiff damped
    // spring back to upright, held down at the stop while the hand is on it
    const Lv = w.lev, aim = w.pull > 0 ? 1.75 : 0;
    for (let k = 0, n = Math.ceil(dt / 0.01), h = dt / n; k < n; k++) { Lv.va += (-90 * (Lv.a - aim) - 12 * Lv.va) * h; Lv.a += Lv.va * h; } // (in short steps: the stiff spring rings at a low frame rate otherwise)
    // the reels: up to speed, then from the beat after the pull one stops a beat, easing onto its symbol: the ease takes
    // as long as it needs to leave at the speed the reel had
    if (w.spinning && beat) {
      w.sinceBeat++;
      if (w.sinceBeat >= 2 && w.nextStop < nR) {
        const re = w.reels[w.nextStop++];
        let to = Math.ceil(re.p) + 1;
        if (w.rig >= 0) while (re.strip[((to % 12) + 12) % 12] !== w.rig) to++;
        re.stop = { from: re.p, to, t: 0, T: clamp((4.7 * (to - re.p)) / Math.max(4, re.v), 0.2, 1.5) };
        re.want = 0;
      }
    }
    let allStopped = true;
    for (const re of w.reels) {
      if (re.stop) { const S = re.stop; S.t += dt; const q = Math.min(1, S.t / S.T); re.p = lerp(S.from, S.to, backOut(q)); re.v = 0; if (q >= 1) { re.p = S.to; re.stop = null; } else allStopped = false; }
      else { re.v = follow(re.v, re.want, dt, 0.15); re.p += re.v * dt; if (re.want > 0) allStopped = false; }
    }
    if (w.spinning && allStopped && w.nextStop >= nR) { // the result: three alike from the left through the middle pays out
      w.spinning = false;
      const mids = w.reels.map((re) => re.strip[((Math.round(re.p) % 12) + 12) % 12]);
      if (mids[1] === mids[0] && mids[2] === mids[0]) { w.win = 1.6; s.shake = Math.max(s.shake, 0.3); }
    }
    // the window and the reels (the symbols run on past its edges, under the cabinet)
    r.rect(wx0, wy0, ww, wh, BLACK);
    for (let i = 0; i < nR; i++) {
      const re = w.reels[i], x = wx0 + i * (rw + gap) + rw / 2, nd = w.nudge > 0 && !re.stop && re.want === 0 ? Math.sin(((0.2 - w.nudge) / 0.2) * Math.PI) * 0.08 : 0, p = re.p + nd, k0 = Math.round(p);
      r.rect(x - rw / 2, wy0, rw, wh, DARK);
      if (Math.abs(re.v) > 5) { for (let k = k0 - 2; k <= k0 + 2; k++) { const y = ymid + (p - k) * rowH, c = SYM_COL[re.strip[((k % 12) + 12) % 12]]; r.rect(x - rw * 0.3, y - rowH * 0.15, rw * 0.6, rowH * 0.3, re.v > 10 ? c + DIM : c); } }
      else for (let k = k0 - 2; k <= k0 + 2; k++) { const y = ymid + (p - k) * rowH; if (y > wy0 - rowH && y < wy0 + wh + rowH) slotSym(r, re.strip[((k % 12) + 12) % 12], x, y, sz, u); }
    }
    // the tower's lamp, its dome standing on the cabinet's top; the cabinet round the window, the header with its
    // tube, the window's frame and the nudge marks, the bulbs
    const flash = w.win > 0 && Math.floor(t * 10) % 2;
    if (w.kind === 'tower') r.disc(0.5 * N, 0.1 * N, 0.045 * N, flash ? BRIGHT : w.win > 0 || f.beat.pulse > 0.6 ? HOT : HOT + DIM);
    r.rect(0.14 * N, 0.1 * N, 0.72 * N, wy0 - 0.1 * N, MID);
    r.rect(0.14 * N, wy0 + wh, 0.72 * N, 0.92 * N - wy0 - wh, MID);
    r.rect(0.14 * N, wy0, wx0 - 0.14 * N, wh, MID);
    r.rect(wx0 + ww, wy0, 0.86 * N - wx0 - ww, wh, MID);
    if (w.kind === 'tower') r.rect(0.46 * N, 0.085 * N, 0.08 * N, 0.015 * N, DARK);
    r.rect(0.18 * N, 0.13 * N, 0.64 * N, 0.13 * N, DARK);
    oval(r, 0.5 * N, 0.195 * N, 0.26 * N, 0.045 * N, 1.5 * u, w.win > 0 && Math.floor(t * 8) % 2 ? BRIGHT : HOT);
    r.frame(Math.round(wx0 - u), Math.round(wy0 - u), Math.round(ww + 2 * u), Math.round(wh + 2 * u), BRIGHT);
    for (const d of [-1, 1]) { const px = d < 0 ? wx0 - 1.5 * u : wx0 + ww + 1.5 * u; r.poly([[px, ymid - 2 * u], [px, ymid + 2 * u], [px - d * 3 * u, ymid]], w.nudge > 0 ? BRIGHT : HOT); }
    const lit = (i) => (w.win > 0 ? Math.floor(t * 8 + i / 4) % 2 === 0 : w.pat === 0 ? (i + w.step) % 3 === 0 : w.pat === 1 ? (i + w.step) % 4 < 2 : ((i >> 3) + w.step) % 2 === 0);
    w.bulbs.forEach(([bx, by], i) => { const on = lit(i) || i === w.glint; r.rect(bx - u, by - u, Math.max(1, 2 * u), Math.max(1, 2 * u), on ? BRIGHT : f.beat.pulse > 0.7 ? MID + DIM : DARK + DIM); });
    w.glint = -1;
    // the lever seen head on: the knob drops past the pivot as the arm swings toward us, and looms a little nearer
    const px = 0.9 * N, py = 0.5 * N, Larm = 0.17 * N, ex = px, ey = py - Math.cos(Lv.a) * Larm;
    r.rect(px - 2 * u, py - 4 * u, 4 * u, 8 * u, DARK);
    r.stroke(px, py, ex, ey, 1.5 * u, LMID);
    r.disc(ex, ey, 2.2 * u * (1 + 0.35 * Math.max(0, Math.sin(Lv.a))), HOT);
    // the tray and the chute
    r.rect(0.2 * N, 0.78 * N, 0.6 * N, 0.12 * N, DARK);
    r.rect(0.44 * N, 0.72 * N, 0.12 * N, 0.05 * N, BLACK);
    // the coins: out of the chute through a win, falling, bouncing off the tray, its walls and the heap; a slow one
    // rolls down the heap's slope before it settles; the heap is the height under each column of the tray
    const floor = 0.9 * N, rc = 1.2 * u, pile = w.pile, tx0 = 0.2 * N, ri = Math.max(0, Math.round(rc - 0.5)), last = pile.length - 1;
    const under = (col) => heapUnder(pile, col, ri), settle = (col) => { const [c, h] = heapSettle(pile, col, rc, ri); return [tx0 + c + 0.5, floor - h - rc]; };
    if (w.win > 0) for (w.pour += dt * 25; w.pour >= 1; w.pour--) w.coins.push({ x: 0.5 * N + (rnd() - 0.5) * 0.06 * N, y: 0.76 * N, vx: (rnd() - 0.5) * 0.5 * N, vy: 0.1 * N });
    w.coins = w.coins.filter((c) => {
      c.vy += g * dt; c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.x < tx0 + rc) { c.x = tx0 + rc; c.vx = -c.vx * 0.5; } else if (c.x > 0.8 * N - rc) { c.x = 0.8 * N - rc; c.vx = -c.vx * 0.5; }
      const col = Math.max(0, Math.min(last, Math.floor(c.x - tx0))), top = floor - under(col);
      if (c.y + rc >= top && c.vy > 0) {
        c.y = top - rc;
        if (c.vy > 0.12 * N) { c.vy = -c.vy * 0.35; c.vx *= 0.7; }
        else { if (w.rest.length + w.roll.length < 220) { const [sx, sy] = settle(col); w.roll.push({ x: c.x, y: c.y, y0: c.y, tx: sx, ty: sy, d0: Math.abs(sx - c.x) || 1, v: Math.abs(c.vx) }); } return false; }
      }
      r.disc(c.x, c.y, rc, LMID); r.disc(c.x, c.y, rc * 0.6, BRIGHT);
      return true;
    });
    w.roll = rollCoins(w.roll, w.rest, g, dt);
    for (const c of w.roll) { r.disc(c.x, c.y, rc, LMID); r.disc(c.x, c.y, rc * 0.6, BRIGHT); }
    if (w.win < -5 && w.rest.length) { // emptied from the top, a few coins a frame, the heap rebuilt from what is left
      for (w.pour += dt * 30; w.pour >= 1 && w.rest.length; w.pour--) w.rest.pop();
      pile.fill(0);
      for (const c of w.rest) { const p = settle(Math.max(0, Math.min(last, Math.floor(c[0] - tx0)))); c[0] = p[0]; c[1] = p[1]; }
    }
    for (const [x, y] of w.rest) { r.disc(x, y, rc, LMID); r.disc(x, y, rc * 0.6, BRIGHT); }
    r.rect(0.2 * N, 0.9 * N, 0.6 * N, 0.02 * N, LMID);
    targets.push({ x: wx0, y: ymid - rowH / 2, w: ww, h: rowH });
  },
};

// ---------------------------------------------------------------------------------------------- dice
// A craps table from a little above: the far rail with its pyramid rubber, the layout, the shooter's hand at the
// near edge. A kick throws the pair: each die flies in a parabola tumbling about its sideways axis, bounces off
// the back wall with restitution and a scatter, drops to the felt with less of its bounce each time, rolls back
// (tumbling a face for every edge length it travels, against a steady rolling resistance; the dice knock into each
// other, never through) and settles on a face; a puck slides to the box of the sum. A snare rattles
// the dice in the hand, a note puts a chip on a box. A section change brings the stickman's stick, which slides the
// dice back to the shooter. A drop: a bucket of dice. Kinds: the casino table, a street wall and concrete, a bar top.
const TABLE_W = { casino: [2, 3, 2], street: [1, 2, 3], bar: [3, 1, 1] };
const BOXES = [4, 5, 6, 8, 9, 10];
function throwDie(w, N, u, x, y, vy, rnd, extra = false) {
  const vyy = -vy;
  w.dice.push({ x, y, z: 2 * u, vx: (rnd() - 0.5) * 0.3 * N, vy: vyy, vz: (0.25 + 0.2 * rnd()) * N, rho: rnd() * TAU, om: -Math.sign(vyy) * (12 + 10 * rnd()), yaw: rnd() * TAU, vyaw: (rnd() - 0.5) * 6, st: 'air', val: 1, extra, life: 5 });
}

const dice = {
  init(W) {
    const { w, rnd, N, u } = W;
    Object.assign(w, { kind: rollW(rnd, TABLE_W, bandOf(W.a)), dice: [], bets: [], stick: null, hand: { x: 0.5 * N, y: 0.93 * N, jit: 0, flick: 0 }, puck: { x: 0.9 * N, y: 0.3 * N, vx: 0, vy: 0 }, glint: 0, cup: 0, N });
    for (let k = 0; k < 2; k++) w.dice.push({ x: 0.5 * N + (k - 0.5) * 7 * u, y: 0.86 * N, z: 0, vx: 0, vy: 0, vz: 0, rho: Math.floor(rnd() * 4) * Math.PI / 2, om: 0, yaw: (rnd() - 0.5) * 0.6, vyaw: 0, st: 'rest', val: 1, extra: false, life: 0 });
  },
  draw(W) {
    if (W.w.N !== W.N) dice.init(W); // the table laid out afresh at another size
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = GRAV(N), sz = 6 * u, yWall = 0.24 * N, kind = w.kind;
    const col = kind === 'casino' ? HOT : BRIGHT, pipCol = kind === 'casino' ? BRIGHT : DARK, Hn = w.hand;
    const main = w.dice.filter((d) => !d.extra), still = main.every((d) => d.st === 'rest' || d.st === 'slide');
    if (f.section === 'change') { w.kind = rollW(rnd, TABLE_W, band); w.bets = []; if (!w.stick) w.stick = { t: 0, x: 1.1 * N, y: 0.3 * N, phase: 'reach' }; }
    if (f.section === 'drop') { for (let k = 0; k < 12; k++) throwDie(w, N, u, (0.8 + rnd() * 0.15) * N, 0.3 * N + rnd() * 0.1 * N, -(0.3 + rnd() * 0.5) * N, rnd, true); s.shake = Math.max(s.shake, 0.3); }
    for (const h of hits) {
      if (isLow(h) && still && !w.stick) { for (const d of main) { d.x = Hn.x + (rnd() - 0.5) * 4 * u; d.y = Hn.y - 4 * u; d.z = 2 * u; d.vx = (rnd() - 0.5) * 0.3 * N; d.vy = -(0.95 + 0.4 * h.strength + 0.3 * rnd()) * N; d.vz = (0.25 + 0.2 * rnd()) * N; d.om = 12 + 10 * rnd(); d.vyaw = (rnd() - 0.5) * 6; d.st = 'air'; } Hn.flick = 0.2; }
      else if (h.kind === 'snare') { Hn.jit = 0.25; w.cup = 0.3; }
      else if (h.kind === 'hat') w.glint = 0.1;
      else if (isTonal(h) && kind === 'casino' && w.bets.length < 12) w.bets.push({ box: h.pc % 6, n: 1 + (h.pc % 3), val: h.pc % 5 });
    }
    Hn.jit -= dt; Hn.flick -= dt; w.glint -= dt; w.cup -= dt;
    // the dice: in the air under gravity, off the wall, down onto the felt; rolling with friction, tumbling with their speed; a settle onto the nearest face
    for (const d of w.dice) {
      if (d.st === 'air') {
        d.z += (d.vz - 0.5 * g * dt) * dt; d.vz -= g * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rho += d.om * dt; d.yaw += d.vyaw * dt;
        if (d.y < yWall + sz * 0.5 && d.vy < 0) { d.y = yWall + sz * 0.5; d.vy = -d.vy * 0.55; d.vx += (rnd() - 0.5) * 0.3 * N; d.om = -d.om * 0.7 + (rnd() - 0.5) * 8; d.vyaw += (rnd() - 0.5) * 8; }
        if (d.x < sz) { d.x = sz; d.vx = -d.vx * 0.6; } else if (d.x > N - sz) { d.x = N - sz; d.vx = -d.vx * 0.6; }
        if (d.y > 0.97 * N) { d.y = 0.97 * N; d.vy = -d.vy * 0.5; }
        if (d.z <= 0 && d.vz < 0) { d.z = 0; d.vz = -d.vz * 0.45; d.vx *= 0.85; d.vy *= 0.85; d.om *= 0.5; d.vyaw *= 0.6; if (d.vz < 0.06 * N) { d.vz = 0; d.st = 'roll'; } }
      } else if (d.st === 'roll') {
        const sp = Math.hypot(d.vx, d.vy), q = sp > 0 ? Math.max(0, sp - 0.6 * N * dt) / sp : 0; // rolling resistance: a steady deceleration, to a stop
        d.vx *= q; d.vy *= q; d.vyaw *= Math.exp(-4 * dt);
        d.x += d.vx * dt; d.y += d.vy * dt; d.rho -= (d.vy * Math.cos(d.yaw) - d.vx * Math.sin(d.yaw)) * (Math.PI / 2 / sz) * dt; d.yaw += d.vyaw * dt; // rolling, not sliding: a cube tips over an edge, a quarter turn, for every edge length it goes
        if (d.y < yWall + sz * 0.5) { d.y = yWall + sz * 0.5; d.vy = -d.vy * 0.5; }
        if (d.x < sz) { d.x = sz; d.vx = -d.vx * 0.5; } else if (d.x > N - sz) { d.x = N - sz; d.vx = -d.vx * 0.5; }
        if (Math.hypot(d.vx, d.vy) < 0.05 * N) { d.vx = d.vy = d.vyaw = 0; d.st = 'settle'; d.aim = Math.round(d.rho / (Math.PI / 2)) * (Math.PI / 2); }
      } else if (d.st === 'settle') {
        d.rho = follow(d.rho, d.aim, dt, 0.07);
        if (Math.abs(d.rho - d.aim) < 0.02) { d.rho = d.aim; d.st = 'rest'; d.val = BELT[((Math.round(d.rho / (Math.PI / 2)) % 4) + 4) % 4]; }
      } else if (d.st === 'slide') { if (slide(d, dt) < 0.01 * N) { d.vx = d.vy = 0; d.st = d.extra ? 'gone' : 'rest'; } }
      if (d.extra) d.life -= dt;
    }
    // the dice knock into each other instead of passing through: pushed apart where they overlap, their closing speed
    // along the line between them traded with a loss (equal masses, restitution 0.4); a lying one hit is set rolling
    for (let i = 0; i < w.dice.length; i++) for (let j = i + 1; j < w.dice.length; j++) {
      const a = w.dice[i], b = w.dice[j], dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy), m = 1.05 * sz;
      if (dd >= m || dd === 0 || Math.abs(a.z - b.z) > sz || a.st === 'gone' || b.st === 'gone') continue;
      const nx = dx / dd, ny = dy / dd, push = (m - dd) / 2, vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      if (vn > 0) { const k = 0.7 * vn; a.vx -= k * nx; a.vy -= k * ny; b.vx += k * nx; b.vy += k * ny; for (const q of [a, b]) if (q.st === 'rest' || q.st === 'settle') q.st = 'roll'; }
    }
    for (const d of w.dice) if (d.extra && d.life < 0 && d.st === 'rest') { d.st = 'slide'; slideTo(d, 1.2 * N, d.y + (rnd() - 0.5) * 0.1 * N, 2, N); } // the bucket's dice are slid off the table once they lie
    w.dice = w.dice.filter((d) => d.st !== 'gone' || d.x < 1.1 * N);
    // the stickman's stick: in from the right to the dice, then it slides them back to the hand and goes
    if (w.stick) {
      const S = w.stick, mx = main.reduce((a, d) => a + d.x, 0) / main.length, my = main.reduce((a, d) => a + d.y, 0) / main.length;
      S.t += dt;
      if (S.phase === 'reach') { S.x = lerp(1.1 * N, mx + sz, ease(S.t / 0.6)); S.y = lerp(0.3 * N, my - sz, ease(S.t / 0.6)); if (S.t > 0.6 && still) { S.phase = 'push'; S.t = 0; for (const d of main) { d.st = 'slide'; d.z = 0; d.vz = 0; slideTo(d, Hn.x + (rnd() - 0.5) * 6 * u, Hn.y - 8 * u, 2.5, N); } } }
      else if (S.phase === 'push') { S.x = main[0].x + sz; S.y = Math.min(main[0].y, main[1] ? main[1].y : main[0].y) - sz; if (S.t > 1.2) { S.phase = 'back'; S.t = 0; S.x0 = S.x; S.y0 = S.y; } }
      else { S.x = lerp(S.x0, 1.1 * N, ease(S.t / 0.6)); S.y = lerp(S.y0, 0.3 * N, ease(S.t / 0.6)); if (S.t > 0.6) w.stick = null; }
    }
    // the puck slides to the box of the last roll's sum, or off to the side on a seven
    if (still && main.length === 2) { const sum = main[0].val + main[1].val, bi = BOXES.indexOf(sum), [px, py] = bi >= 0 ? [N * (0.2 + bi * 0.12 + 0.06), 0.28 * N] : [0.9 * N, 0.3 * N]; if (Math.abs(px - (w.puck.ax || -1)) > 1) { w.puck.ax = px; slideTo(w.puck, px, py, 3, N); } }
    slide(w.puck, dt);
    // the table by kind: the wall or rail, the ground, the layout; the bets; then the dice far to near with their shadows, the hand, the stick
    if (kind === 'street') {
      r.rect(0, 0, N, yWall, DARK);
      for (let y = 0; y < yWall; y += 3 * u) { r.rect(0, y, N, Math.max(1, u * 0.6), MID + DIM); for (let x = (Math.floor(y / (3 * u)) % 2) * 4 * u; x < N; x += 8 * u) r.rect(x, y, Math.max(1, u * 0.6), 3 * u, MID + DIM); }
      r.rect(0, yWall, N, N, MID + DIM);
      r.ring(0.5 * N, 0.62 * N, 0.22 * N, Math.max(1, u), BRIGHT + DIM, 0.5);
      for (let k = 0; k < 5; k++) r.disc(0.3 * N + k * 0.1 * N, 0.9 * N, 1.5 * u, k % 2 ? BRIGHT : LMID);
    } else if (kind === 'bar') {
      r.rect(0, 0, N, yWall, DARK);
      for (let x = 0; x < N; x += 6 * u) r.rect(x, 0, Math.max(1, u), yWall, LMID + DIM);
      r.rect(0, yWall, N, N, DARK + DIM);
      for (let y = yWall; y < N; y += 5 * u) r.rect(0, y, N, Math.max(1, u * 0.7), DARK);
      const cj = w.cup > 0 ? Math.sin(t * 40) * 1.5 * u : 0;
      r.poly([[0.12 * N + cj, 0.55 * N], [0.22 * N + cj, 0.55 * N], [0.2 * N + cj, 0.72 * N], [0.14 * N + cj, 0.72 * N]], DARK);
      r.rect(0.12 * N + cj, 0.54 * N, 0.1 * N, Math.max(1, 1.5 * u), LMID);
      r.rect(0.8 * N, 0.5 * N, 0.07 * N, 0.14 * N, COOL + DIM); r.rect(0.8 * N, 0.58 * N, 0.07 * N, 0.06 * N, COOL);
    } else {
      r.rect(0, 0.12 * N, N, 0.12 * N, DARK);
      r.rect(0, 0.12 * N, N, Math.max(1, 1.5 * u), MID);
      for (let x = 0; x < N; x += 3 * u) r.poly([[x, yWall], [x + 1.5 * u, yWall - 3 * u], [x + 3 * u, yWall]], LMID + DIM);
      r.rect(0, yWall, N, N, BG);
      for (let k = 0; k < 6; k++) r.frame(Math.round(N * (0.2 + k * 0.12)), Math.round(0.26 * N), Math.round(0.11 * N), Math.round(0.08 * N), LMID + DIM);
      r.frame(Math.round(0.25 * N), Math.round(0.4 * N), Math.round(0.5 * N), Math.round(0.12 * N), LMID + DIM);
      r.ring(0.5 * N, 1.25 * N, 0.62 * N, Math.max(1, 2 * u), LMID + DIM, 0.6);
      r.ring(0.5 * N, 1.25 * N, 0.56 * N, Math.max(1, u), LMID + DIM, 0.6);
      for (const b of w.bets) stack(r, N * (0.2 + b.box * 0.12 + 0.03 + (b.n % 2) * 0.02), 0.33 * N, 1.8 * u, b.n, b.val, u);
      r.ring(w.puck.x, w.puck.y, 1.6 * u, 3.2 * u, w.puck.ax === 0.9 * N ? DARK : BRIGHT, 0.6);
      if (w.glint > 0) r.rect(w.puck.x - u, w.puck.y - 2 * u, Math.max(1, u), Math.max(1, u), WHITE);
    }
    const order = w.dice.slice().sort((a, b) => a.y - b.y);
    for (const d of order) {
      r.ring(d.x + u + 0.35 * d.z, d.y + sz * 0.25 + 0.2 * d.z, sz * 0.3, sz * 0.6, DARK + DIM, 0.4); // on the felt, cast further from the light the higher it flies
      die(r, d.x, d.y - d.z, sz, d.yaw, d.rho, col, pipCol, u);
      if (d.st === 'air' || d.st === 'roll') targets.push({ x: d.x - sz, y: d.y - d.z - sz, w: 2 * sz, h: 2 * sz });
    }
    const jx = Hn.jit > 0 ? (hash(Math.floor(t * 50), 2) - 0.5) * 3 * u : 0, fl = Hn.flick > 0 ? Math.sin((0.2 - Hn.flick) / 0.2 * Math.PI) * 5 * u : 0;
    handTop(r, Hn.x + jx, Hn.y - fl + Math.sin(f.rel.bassClock) * u, 5.5 * u, -Math.PI / 2 + jx * 0.1, LMID);
    if (w.stick) { const S = w.stick; r.stroke(N + 2 * u, 0.15 * N, S.x, S.y, 1.2 * u, LMID); r.stroke(S.x, S.y, S.x - 2 * u, S.y + 4 * u, 1.5 * u, LMID); }
  },
};

// ---------------------------------------------------------------------------------------------- houseofcards
// A house of cards from the side, built one card a beat: a leaning pair (the first held by one hand until the
// second comes), then the flats bridging the apexes, tier on tier. The treble breathes on it and the cards sway,
// the top the most; a snare gusts, a kick bumps the table and a hard one can bring it down. A drop collapses it:
// the cards let go from the base up, fall under gravity with air drag, flutter, land flat and slide; then they
// are swept to the deck and the house goes up again. Kinds: the base, three, four or five pairs wide.
const BASE_W = { three: [3, 2, 1], four: [2, 3, 2], five: [1, 2, 3] };
const BASE_N = { three: 3, four: 4, five: 5 };
// a card is shorter the wider the base, so the widest house still clears the deck beside it
const houseLc = (P, N) => Math.min(0.165, 0.58 / P) * N;
function housePlan(P, N) {
  const Lc = houseLc(P, N), th = Math.max(1, 0.9 * (N / 125)), ang = 0.42, d = Lc * Math.sin(ang), hgt = Lc * Math.cos(ang), y0 = 0.86 * N, plan = [];
  for (let k = 0; k < P; k++) {
    const pairs = P - k, by = y0 - k * (hgt + th), xs = Array.from({ length: pairs }, (_, j) => 0.5 * N - ((pairs - 1) * Lc) / 2 + j * Lc);
    for (const xc of xs) { plan.push({ x0: xc - d, y0: by, x1: xc, y1: by - hgt, tier: k, lean: -1 }); plan.push({ x0: xc + d, y0: by, x1: xc, y1: by - hgt, tier: k, lean: 1 }); }
    for (let j = 0; j + 1 < pairs; j++) plan.push({ x0: xs[j], y0: by - hgt - th / 2, x1: xs[j + 1], y1: by - hgt - th / 2, tier: k, lean: 0 });
  }
  return plan;
}

const houseofcards = {
  init(W) {
    const { w, rnd, N } = W, kind = rollW(rnd, BASE_W, bandOf(W.a));
    Object.assign(w, { kind, plan: housePlan(BASE_N[kind], N), Lc: houseLc(BASE_N[kind], N), set: [], idx: 0, carry: null, falling: [], flat: [], phase: 'build', hold: 0, clearT: 0, jolt: 0, gust: 0, glint: -1, hl: { x: 0.9 * N, y: 0.8 * N }, hr: { x: 0.9 * N, y: 0.8 * N }, N });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = GRAV(N), y0 = 0.86 * N, bps = bpsOf(f), deck = [0.9 * N, y0];
    const replan = () => { w.plan = housePlan(BASE_N[w.kind], N); w.Lc = houseLc(BASE_N[w.kind], N); w.set = []; w.idx = 0; w.carry = null; w.phase = 'build'; };
    if (w.N !== N) { w.N = N; w.falling = []; w.flat = []; replan(); }
    const Lc = w.Lc;
    const collapse = () => { // from the base up: each card let go a little after the tier below it
      if (w.phase === 'fall' || w.phase === 'clear') return;
      for (const c of w.set) w.falling.push({ x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2, a: Math.atan2(c.y1 - c.y0, c.x1 - c.x0), vx: (rnd() - 0.5) * 0.15 * N, vy: 0, om: (rnd() - 0.5) * 6 + c.lean * 3, delay: c.tier * 0.07, ph: rnd() * TAU, lean: c.lean });
      if (w.carry) { const c = w.plan[w.carry.i]; w.falling.push({ x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 - 4 * u, a: 0, vx: 0, vy: 0, om: 2, delay: 0, ph: 0, lean: 0 }); w.carry = null; }
      w.set = []; w.phase = 'fall'; w.hold = 0;
      s.shake = Math.max(s.shake, 0.3);
    };
    const beat = beatTick(w, f, dt);
    if (f.section === 'change') { w.kind = rollW(rnd, BASE_W, band); if (w.phase === 'build' && w.set.length < 2 && !w.carry) replan(); } // a new base: at once if the house has barely begun, else next time
    if (f.section === 'drop') collapse();
    for (const h of hits) {
      if (isLow(h)) { w.jolt = Math.max(w.jolt, h.strength); if (h.strength > 0.85 && w.set.length > 6 && rnd() < 0.15) collapse(); }
      else if (h.kind === 'snare') w.gust = 1;
      else if (h.kind === 'hat' && w.set.length) w.glint = Math.floor(rnd() * w.set.length);
    }
    w.jolt *= Math.exp(-dt * 5); w.gust *= Math.exp(-dt * 2);
    if (w.phase === 'build') {
      if (beat && !w.carry && w.idx < w.plan.length) w.carry = { i: w.idx++, q: 0 };
      if (w.carry) { w.carry.q += dt * bps / 0.75; if (w.carry.q >= 1) { w.set.push({ ...w.plan[w.carry.i], wob: 0 }); w.carry = null; } }
      if (!w.carry && w.idx >= w.plan.length) w.phase = 'hold';
    } else if (w.phase === 'hold') { if (beat && ++w.hold >= 8) collapse(); }
    // the sway: the treble's breath, the top tiers the most, the gust on top, the kick's shiver
    const breath = 0.012 * (0.3 + clamp(f.rel.trebDrive) + 2 * w.gust), shiver = w.jolt * 0.03 * Math.sin(t * 40);
    r.rect(0, 0, N, y0, DARK);
    r.ring(0.5 * N, y0 - 0.3 * N, 0.22 * N, 0.44 * N, MID + DIM, 0.9);
    r.rect(0, y0, N, Math.max(1, u), LMID);
    const drawCard = (x0, yy0, x1, yy1, c) => r.stroke(x0, yy0, x1, yy1, Math.max(1, u), c);
    w.set.forEach((c, i) => {
      const da = breath * (1 + c.tier) * Math.sin(2.5 * t + i * 0.7) + shiver;
      if (c.lean) { const dx = c.x1 - c.x0, dy = c.y1 - c.y0, ca = Math.cos(da), sa = Math.sin(da); drawCard(c.x0, c.y0, c.x0 + dx * ca - dy * sa, c.y0 + dx * sa + dy * ca, i === w.glint ? WHITE : BRIGHT); }
      else { const dy = da * Lc * 0.5; drawCard(c.x0, c.y0 - dy, c.x1, c.y1 + dy, i === w.glint ? WHITE : LMID); }
    });
    w.glint = -1;
    // the card in the right hand on its way from the deck, the left hand holding a lone leaner; the deck itself
    let rh = [deck[0], deck[1] - 6 * u], lh = null;
    if (w.carry) {
      const c = w.plan[w.carry.i], q = ease(w.carry.q), lift = 5 * u * Math.sin(Math.PI * q);
      const x0 = lerp(deck[0] - Lc / 2, c.x0, q), x1 = lerp(deck[0] + Lc / 2, c.x1, q), ya = lerp(deck[1] - 3 * u, c.y0, q) - lift, yb = lerp(deck[1] - 3 * u, c.y1, q) - lift;
      drawCard(x0, ya, x1, yb, BRIGHT);
      rh = [(x0 + x1) / 2, Math.min(ya, yb) - 2 * u];
      targets.push({ x: Math.min(x0, x1) - u, y: Math.min(ya, yb) - u, w: Math.abs(x1 - x0) + 2 * u, h: Math.abs(yb - ya) + 2 * u });
    }
    const last = w.set[w.set.length - 1];
    if (last && last.lean === -1 && w.phase === 'build') lh = [last.x1 - 2 * u, last.y1 - 3 * u];
    w.hr.x = follow(w.hr.x, rh[0], dt, 0.08); w.hr.y = follow(w.hr.y, rh[1], dt, 0.08);
    w.hl.x = follow(w.hl.x, lh ? lh[0] : 0.1 * N, dt, 0.1); w.hl.y = follow(w.hl.y, lh ? lh[1] : y0 - 4 * u, dt, 0.1);
    const left = Math.max(0, w.plan.length - w.idx), dh = Math.max(2 * u, left * 0.5 * u);
    r.rect(deck[0] - Lc / 2, deck[1] - dh, Lc, dh, BRIGHT);
    for (let y = deck[1] - dh + 1.5 * u; y < deck[1]; y += 1.5 * u) r.rect(deck[0] - Lc / 2, y, Lc, Math.max(1, u * 0.5), LMID);
    handSide(r, w.hr.x, w.hr.y, 5 * u, LMID, 1);
    handSide(r, w.hl.x, w.hl.y, 5 * u, LMID, -1);
    // the collapse: gravity against air drag, a flutter sideways, a tumble; a landing kills the bounce, the card flattens and slides
    w.falling = w.falling.filter((c) => {
      if ((c.delay -= dt) > 0) { drawCard(c.x - Math.cos(c.a) * Lc / 2, c.y - Math.sin(c.a) * Lc / 2, c.x + Math.cos(c.a) * Lc / 2, c.y + Math.sin(c.a) * Lc / 2, BRIGHT); return true; }
      c.vy += (g - 3 * c.vy) * dt; c.vx *= Math.exp(-2 * dt); c.om *= Math.exp(-1.5 * dt);
      c.x += (c.vx + (c.down ? 0 : 0.12 * N * Math.sin(6 * t + c.ph))) * dt; c.y += c.vy * dt; c.a += c.om * dt; // the flutter only in the air
      const low = (Lc / 2) * Math.abs(Math.sin(c.a));
      if (c.y + low >= y0) { // down: the bounce killed, it falls flat and slides to a stop under friction
        c.down = true; c.y = y0 - low; c.vy = -c.vy * 0.1; c.om *= 0.4; c.a = follow(c.a, Math.round(c.a / Math.PI) * Math.PI, dt, 0.12);
        const dv = 0.5 * N * dt; c.vx = Math.abs(c.vx) <= dv ? 0 : c.vx - Math.sign(c.vx) * dv;
        if (Math.abs(Math.sin(c.a)) < 0.05 && Math.abs(c.vx) < 0.01 * N) { w.flat.push({ x: c.x, y: y0 - u * 0.5, vx: 0, vy: 0 }); return false; }
      }
      drawCard(c.x - Math.cos(c.a) * Lc / 2, c.y - Math.sin(c.a) * Lc / 2, c.x + Math.cos(c.a) * Lc / 2, c.y + Math.sin(c.a) * Lc / 2, BRIGHT);
      return true;
    });
    for (const c of w.flat) { slide(c, dt); r.rect(c.x - Lc / 2, c.y, Lc, Math.max(1, u), BRIGHT); }
    if (w.flat.length > 60) w.flat.splice(0, w.flat.length - 60);
    if (w.phase === 'fall' && !w.falling.length) { w.clearT += dt; if (w.clearT > 1.5) { w.phase = 'clear'; w.clearT = 0; for (const c of w.flat) slideTo(c, deck[0], c.y, 3, N); } }
    if (w.phase === 'clear') { w.clearT += dt; if (w.clearT > 1.3) { w.flat = []; replan(); w.clearT = 0; } }
    if (w.set.length) { const top = Math.min(...w.set.map((c) => Math.min(c.y0, c.y1))); targets.push({ x: 0.2 * N, y: top, w: 0.6 * N, h: y0 - top }); }
  },
};

// ---------------------------------------------------------------------------------------------- magician
// Close-up magic, face on: the left hand holds a fan of cards that springs open on every beat and closes again; the
// deck stands in its holder and the chosen card rises out of it with the bass, hanging on its thread and swinging
// like a pendulum once it is clear (a kick bounces it up in a puff of smoke, a note turns it to another suit); the
// right hand walks a coin over its knuckles a step a hat, the coin rolling round each knuckle and passed back
// underneath. A snare: the hand leaves the coin clipped and lifts the three cups in turn, the ball under one, none
// or (on a hard one) all of them. A drop: the fan snaps shut and a dove bursts out of the left hand in a puff,
// beating its way up and out of the picture while a few feathers seesaw down. Kinds: a table under a lamp, a
// street pitch against a brick wall, a stage between curtains under a spot; a section change swaps them in a puff.
const MAGIC_W = { table: [3, 2, 1], street: [1, 3, 2], stage: [2, 2, 3] };
const CUPX = [0.58, 0.72, 0.86];
// a critically damped spring at rest at 0, stepped exactly (any dt): the fan's spread
function crit(o, om, dt) {
  const e = Math.exp(-om * dt), k = o.v + om * o.x;
  o.v = (o.v - om * k * dt) * e;
  o.x = (o.x + k * dt) * e;
}
// an upturned cup standing at (x, yb), h tall, mw half its mouth: the body narrowing up, a light stripe, the rim, a bead
function magicCup(r, x, yb, h, mw, u) {
  const tw = mw * 0.62;
  r.poly([[x - mw, yb], [x + mw, yb], [x + tw, yb - h], [x - tw, yb - h]], MID);
  r.poly([[x - mw * 0.72, yb - u], [x - mw * 0.48, yb - u], [x - tw * 0.55, yb - h + u], [x - tw * 0.82, yb - h + u]], LMID);
  r.rect(x - mw, yb - 1.5 * u, 2 * mw, Math.max(1, 1.5 * u), BRIGHT);
  r.rect(x - tw, yb - h - u, 2 * tw, Math.max(1, u), LMID);
  r.disc(x, yb - h - 1.6 * u, 1.6 * u, MID);
}
// smoke: a disc of ordered dither with a share `dens` of its pixels set, so what is behind shows through
function haze(r, cx, cy, rad, c, dens) {
  const N = r.N, r2 = rad * rad;
  for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(N - 1, cy + rad); y++)
    for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(N - 1, cx + rad); x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= r2 && bayer(x, y) < dens) r.buf[y * N + x] = c; }
}
// a dove flying to the right at (x, y), s its length, the wings at phase ph (raised at sin ph = 1)
function dove(r, x, y, s, ph) {
  const up = Math.sin(ph), lag = Math.sin(ph - 0.5);
  r.poly([[x + s * 0.1, y - s * 0.12], [x - s * 0.42, y - s * 0.12 - lag * s * 0.7], [x - s * 0.22, y - s * 0.04]], LMID); // the far wing, a beat behind
  r.poly([[x - s * 0.45, y], [x - s * 0.85, y - s * 0.14], [x - s * 0.8, y + s * 0.16]], LMID); // the tail
  r.ring(x, y, s * 0.25, s * 0.5, BRIGHT, 0.5);
  r.disc(x + s * 0.45, y - s * 0.17, s * 0.17, BRIGHT);
  r.poly([[x + s * 0.58, y - s * 0.22], [x + s * 0.74, y - s * 0.15], [x + s * 0.58, y - s * 0.1]], HOT);
  r.set(x + s * 0.5, y - s * 0.22, DARK);
  r.poly([[x + s * 0.16, y - s * 0.06], [x - s * 0.36, y - s * 0.06 - up * s * 0.8], [x - s * 0.24, y + s * 0.02]], BRIGHT); // the near wing
}
// the right hand palm down, fingertips toward us and curled under: the four knuckles in a row at (x, y), ks apart, the
// curled fingers below them, the thumb tucked at the side, the forearm in its sleeve going back off to the right
function knuckleHand(r, x, y, ks, N, u) {
  const sx = 1.12 * N, sy = 0.78 * N, a = Math.atan2(sy - y, sx - x); // the shoulder, out of the picture to the right
  r.stroke(x + 1.5 * ks, y + 0.6 * ks, sx, sy, 1.8 * ks, DARK);
  r.stroke(x + 1.5 * ks + Math.cos(a) * 0.4 * ks, y + 0.6 * ks + Math.sin(a) * 0.4 * ks, x + 1.5 * ks + Math.cos(a) * 0.9 * ks, y + 0.6 * ks + Math.sin(a) * 0.9 * ks, 1.9 * ks, BRIGHT);
  r.rect(x - 2 * ks, y, 4 * ks, 1.1 * ks, LMID);
  for (let j = 0; j < 4; j++) { const kx = x + (j - 1.5) * ks; r.rect(kx - 0.45 * ks, y + 0.4 * ks, 0.9 * ks, 0.9 * ks, LMID); r.disc(kx, y + 1.3 * ks, 0.45 * ks, LMID); r.rect(kx + 0.42 * ks, y + 0.5 * ks, Math.max(1, 0.12 * ks), 0.9 * ks, MID); r.disc(kx, y, 0.42 * ks, LMID); }
  r.stroke(x + 1.9 * ks, y + 0.6 * ks, x + 1.2 * ks, y + 1.5 * ks, 0.55 * ks, LMID);
}

const magician = {
  init(W) {
    const { w, rnd, N } = W;
    Object.assign(w, { kind: rollW(rnd, MAGIC_W, bandOf(W.a)), fan: { x: 0, v: 0 }, rise: 0, riseV: 0, sw: 0, swV: 0, suit: Math.floor(rnd() * 4), rank: Math.floor(rnd() * 5), turn: -1, turnTo: 0,
      coin: { v: 0, mode: 'rest', q: 0, face: 0 }, steps: 0, walk: 0, cups: null, cool: 0, ballAt: 1, hand: { x: 0.76 * N, y: 0.44 * N }, puffs: [], feathers: [], dove: null });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = GRAV(N), bps = bpsOf(f);
    const TY = 0.64 * N, DX = 0.4 * N, DY = 0.62 * N, cw = 3.4 * u, ch = 4.8 * u, PX = 0.17 * N, PY = 0.57 * N, ks = 4 * u, cr = 2.4 * u, cupB = 0.9 * N, cupH = 0.09 * N, cupW = 0.055 * N;
    const puff = (x, y, n, sp) => { for (let k = 0; k < n; k++) { const a = rnd() * TAU; w.puffs.push({ x, y, vx: Math.cos(a) * sp * N, vy: Math.sin(a) * sp * N * 0.6 - 0.12 * N, life: 0.6 + rnd() * 0.5, L: 1.1 }); } };
    if (f.section === 'change') { w.kind = rollW(rnd, MAGIC_W, band); puff(DX, DY - ch, 14, 0.25); }
    if (f.section === 'drop' && !w.dove) { // the fan snaps shut into the hand and the dove comes out of it
      w.fan.v = -6 * w.fan.x * 4 * bps;
      w.dove = { x: PX, y: PY - 4 * u, vx: 0.18 * N, vy: -0.32 * N, ph: 0 };
      puff(PX, PY - 4 * u, 16, 0.3);
      for (let k = 0; k < 7; k++) { const ph = rnd() * TAU, A = (2 + 2 * rnd()) * u; w.feathers.push({ x: PX + (rnd() - 0.5) * 6 * u - A * Math.sin(ph), y: PY - 6 * u, x0: A * Math.sin(ph), vy: -0.15 * N * rnd(), ph, om: 4 + rnd() * 2, A, t: 0, rest: false }); }
      s.shake = Math.max(s.shake, 0.25);
    }
    // the beat opens the fan: a kick to a critically damped spring, open a quarter beat later, closed by the next
    if (beatTick(w, f, dt)) w.fan.v += (0.7 + 0.9 * f.level) * 4 * bps * Math.E;
    crit(w.fan, 4 * bps, dt);
    const step = () => { w.steps = Math.min(2, w.steps + 1); };
    for (const h of hits) {
      if (isLow(h)) { w.riseV += (0.25 + 0.3 * h.strength) * N; w.swV += (rnd() - 0.5) * 0.8; if (h.strength > 0.7) puff(DX, DY - ch, 2, 0.12); }
      else if (h.kind === 'snare' && !w.cups && w.cool <= 0) { w.cups = { t: 0 }; w.ballAt = h.strength > 0.85 ? 4 : Math.floor(rnd() * 4); }
      else if (h.kind === 'hat') step();
      else if (isTonal(h) && w.turn < 0) { w.turn = 0; w.turnTo = h.pc % 4; }
    }
    if ((w.walk += dt * bps * 2 * clamp(f.rel.trebDrive - 0.3)) >= 1) { w.walk -= 1; step(); } // and with the treble, an eighth a step at most
    // the chosen card: up to where the bass holds it (a spring, so a kick bounces it), swinging on its thread once clear of the deck
    const free = clamp((w.rise - 2 * ch) / ch), aim = (2 * ch + 0.1 * N) * clamp(0.15 + 0.85 * f.rel.bassDrive);
    for (let k = 0, n = Math.ceil(dt / 0.02), h = dt / n; k < n; k++) {
      w.riseV += (25 * (aim - w.rise) - 6 * w.riseV) * h; w.rise = Math.max(0, w.rise + w.riseV * h);
      w.swV += (-4 * Math.sin(w.sw) - 0.6 * w.swV + 0.5 * clamp(f.rel.midDrive) * Math.sin(f.rel.midClock * 2.2)) * h; w.sw += w.swV * h;
    }
    if (w.rise <= 0 && w.riseV < 0) w.riseV = 0;
    if (w.turn >= 0) { const was = w.turn; w.turn += dt / 0.3; if (was < 0.5 && w.turn >= 0.5) w.suit = w.turnTo; if (w.turn >= 1) w.turn = -1; }
    // the coin: a roll over the next knuckle (its centre on an arc round the knuckle, turning over as it goes), and from
    // the last valley a pass back under the hand to the first, where it comes up between the fingers
    const C = w.coin, tRoll = Math.min(0.2, 0.45 / bps);
    if (C.mode === 'rest' && w.steps > 0) { w.steps--; C.mode = C.v < 2 ? 'roll' : 'under'; C.q = 0; }
    if (C.mode !== 'rest') {
      C.q += dt / (C.mode === 'roll' ? tRoll : C.mode === 'under' ? 0.25 : 0.15);
      if (C.q >= 1) { if (C.mode === 'roll') { C.v++; C.face ^= 1; C.mode = 'rest'; } else if (C.mode === 'under') { C.v = 0; C.mode = 'up'; C.q = 0; } else C.mode = 'rest'; }
    }
    // the cups: the right hand goes to each in turn and lifts it, what is under it shows; then back to its coin
    const lifts = w.lifts || (w.lifts = [0, 0, 0]);
    let hx = 0.76 * N, hy = 0.44 * N;
    lifts.fill(0);
    if (w.cups) {
      const U = w.cups;
      let at = -1;
      U.t += dt;
      for (let j = 0; j < 3; j++) { const p = (U.t - 0.12 - j * 0.3) / 0.24; if (p > 0 && p < 1) { lifts[j] = Math.sin(Math.PI * p) * 0.06 * N; at = j; } else if (at < 0 && p > -0.3 && p <= 0) at = j; }
      if (at >= 0) { hx = CUPX[at] * N; hy = cupB - lifts[at] - cupH - 0.5 * ks; }
      if (U.t > 0.95) { w.cups = null; w.cool = 1.2; }
    }
    w.cool -= dt;
    w.hand.x = follow(w.hand.x, hx, dt, w.cups ? 0.04 : 0.12);
    w.hand.y = follow(w.hand.y, hy + (w.cups ? 0 : Math.sin(f.rel.bassClock * 1.5) * u), dt, w.cups ? 0.04 : 0.12);
    // the smoke: puffs drift up and spread, slowing as they go; the feathers seesaw down under air drag and lie on the table
    w.puffs = w.puffs.filter((p) => { const d = Math.exp(-2.5 * dt); p.vx *= d; p.vy = p.vy * d - 0.02 * N * dt; p.x += p.vx * dt; p.y += p.vy * dt; return (p.life -= dt) > 0; });
    if (w.puffs.length > 60) w.puffs.splice(0, w.puffs.length - 60);
    for (const fe of w.feathers) { // drag holds it near a slow terminal speed, slowest at the ends of each swing where it tilts most
      if (fe.rest) continue;
      fe.t += dt;
      const c = Math.cos(fe.om * fe.t + fe.ph), vt = (g / 25) * (0.3 + 0.9 * Math.abs(c));
      fe.vy = vt + (fe.vy - vt) * Math.exp(-25 * dt); fe.y += fe.vy * dt;
      fe.x0 = fe.A * Math.sin(fe.om * fe.t + fe.ph);
      if (fe.y > TY + 0.06 * N + hash((fe.ph * 100) | 0, 3) * 0.25 * N) fe.rest = true;
    }
    if (w.feathers.length > 24) w.feathers.splice(0, w.feathers.length - 24);
    if (w.dove) { // wing beats lift it against gravity with air drag; it speeds up and leaves the picture
      const D = w.dove;
      D.ph += dt * TAU * 5;
      D.vy += (g - 1.35 * g * (1 + Math.sin(D.ph)) - 2 * D.vy) * dt;
      D.vx += (0.55 * N - D.vx) * 1.2 * dt;
      D.x += D.vx * dt; D.y += D.vy * dt;
      if (D.x > N + 10 * u || D.y < -10 * u) w.dove = null;
    }

    // the place: a dark room with the lamp's pool on the table, a brick wall behind a crate, or the stage's curtains and spot
    const k = w.kind;
    if (k === 'street') {
      r.rect(0, 0, N, TY, MID + DIM);
      for (let y = 0, row = 0; y < TY; y += 3 * u, row++) { r.rect(0, y, N, Math.max(1, 0.6 * u), DARK); for (let x = (row % 2) * 3.5 * u; x < N; x += 7 * u) r.rect(x, y, Math.max(1, 0.6 * u), 3 * u, DARK); }
      r.rect(0, TY, N, N - TY, MID);
      for (let y = TY + 4 * u; y < N; y += 5 * u) r.rect(0, y, N, Math.max(1, 0.5 * u), MID + DIM);
      r.ring(0.15 * N, 0.05 * N, 0.1 * N, 0.2 * N, LMID + DIM, 1);
    } else if (k === 'stage') {
      r.rect(0, 0, N, TY, DARK + DIM);
      r.poly([[0.42 * N, 0], [0.58 * N, 0], [(0.78 + 0.04 * f.level) * N, TY], [(0.22 - 0.04 * f.level) * N, TY]], DARK);
      for (let x = 0; x < N; x++) { const side = x < 0.13 * N || x > 0.87 * N; if (!side) continue; const fold = Math.sin(x * 0.9 / u + Math.sin(f.rel.midClock * 0.7) * 0.6); r.rect(x, 0, 1, TY + 0.06 * N, fold > 0.3 ? HOT : fold > -0.4 ? HOT + DIM : DARK); }
      for (let x = 0; x < N; x += 6 * u) r.disc(x + 3 * u, 0.05 * N, 3.4 * u, HOT + DIM);
      r.rect(0, 0, N, 0.05 * N, HOT + DIM);
      r.rect(0, TY, N, N - TY, DARK);
      r.ring(DX, TY + 0.16 * N, 0.2 * N, 0.4 * N, MID + DIM, 0.35);
    } else {
      r.rect(0, 0, N, TY, DARK + DIM);
      r.rect(0, TY, N, N - TY, BG);
      r.ring(DX, TY + 0.15 * N, 0.21 * N, 0.42 * N, LMID + DIM, 0.4);
    }
    r.rect(0, TY, N, Math.max(1, u), k === 'table' ? LMID : LMID + DIM);
    // the chosen card behind the deck's face, the deck in its holder over it
    const sway = Math.sin(w.sw) * 0.4 * N * free, cy = DY - w.rise, fs = w.turn >= 0 ? Math.abs(Math.cos(Math.PI * w.turn)) : 1;
    card(r, DX + sway, cy - 0.4 * N * (1 - Math.cos(w.sw)) * free, cw, ch, w.sw * free, fs, true, w.suit, w.rank, u); // on a circle round the thread's top
    card(r, DX, DY, cw, ch, 0, 1, false, 0, 0, u);
    r.rect(DX + cw, DY - ch + u, Math.max(1, 1.2 * u), 2 * ch - u, LMID);
    r.rect(DX - cw - u, DY + ch - 2 * u, 2 * cw + 3 * u, 3 * u, DARK);
    targets.push({ x: DX + sway - cw, y: cy - ch, w: 2 * cw, h: 2 * ch });
    // the cups and what is under the one lifted, its shadow on the table
    for (let j = 0; j < 3; j++) {
      const x = CUPX[j] * N, up = lifts[j];
      if (up > 0) { r.ring(x, cupB, cupW * 0.6, cupW * 1.2, DARK + DIM, 0.25); if (w.ballAt === j || w.ballAt === 4) { r.disc(x, cupB - 2.2 * u, 2.2 * u, HOT); r.set(x - 0.8 * u, cupB - 3 * u, BRIGHT); } }
      magicCup(r, x, cupB - up, cupH, cupW, u);
      if (up > 0) targets.push({ x: x - cupW, y: cupB - up - cupH, w: 2 * cupW, h: cupH + up });
    }
    // the fan in the left hand: the cards pivot on the hand at their foot, back to front, the thumb over the pivot
    const sp = 0.1 + clamp(w.fan.x, 0, 1.9), nC = 9;
    for (let i = 0; i < nC; i++) { const a = 0.22 + sp * (i / (nC - 1) - 0.5); card(r, PX + Math.sin(a) * ch * 0.75, PY - Math.cos(a) * ch * 0.75, cw, ch, a, 1, true, i % 4, (i * 2) % 5, u); }
    r.stroke(PX - 3 * u, PY + 5 * u, -2 * u, 0.82 * N, 7 * u, DARK);
    r.rect(PX - 5 * u, PY + 2 * u, 7 * u, Math.max(1, 1.5 * u), BRIGHT);
    r.disc(PX - u, PY + 2 * u, 3.6 * u, LMID);
    r.rect(PX - 4.4 * u, PY - u, 7 * u, 3.6 * u, LMID);
    r.stroke(PX - 3 * u, PY + u, PX + 0.5 * u, PY - 1.5 * u, 1.6 * u, LMID);
    // the right hand: a coin coming up between the fingers goes behind the knuckles, a coin on them in front
    const H = w.hand, kx = (j) => H.x + (j - 1.5) * ks, rho = 0.42 * ks + cr, b0 = Math.asin(Math.min(1, ks / 2 / rho));
    const valley = (v) => [kx(v) + ks / 2, H.y - rho * Math.cos(b0)];
    if (C.mode === 'up') { const [vx, vy] = valley(0); r.disc(vx, vy + (1 - ease(C.q)) * 2.4 * cr, cr, BRIGHT); r.ring(vx, vy + (1 - ease(C.q)) * 2.4 * cr, cr * 0.5, Math.max(1, 0.6 * u), MID); }
    knuckleHand(r, H.x, H.y, ks, N, u);
    if (C.mode === 'rest' || C.mode === 'roll') {
      let x, y, wd = 1;
      if (C.mode === 'roll') { const b = lerp(-b0, b0, C.q); x = kx(C.v + 1) + Math.sin(b) * rho; y = H.y - Math.cos(b) * rho; wd = Math.abs(Math.cos(Math.PI * C.q)); }
      else [x, y] = valley(C.v);
      if (wd < 0.25) r.rect(x - 0.5 * u, y - cr, Math.max(1, u), 2 * cr, MID); // edge on
      else r.ring(x, y, cr * wd * 0.5, cr * wd, BRIGHT, 1 / wd);
      if (wd > 0.4) { if ((C.face ^ (C.mode === 'roll' && C.q > 0.5 ? 1 : 0)) === 0) r.ring(x, y, cr * 0.5 * wd, Math.max(1, 0.6 * u), MID, 1 / wd); else r.rect(x - 0.5 * u, y - 0.5 * u, Math.max(1, u), Math.max(1, u), MID); }
      if (C.mode === 'roll') targets.push({ x: x - cr, y: y - cr, w: 2 * cr, h: 2 * cr });
    }
    // the smoke, the feathers, the dove
    for (const p of w.puffs) { const q = clamp(1 - p.life / p.L); haze(r, p.x, p.y, (1.5 + 3.5 * q) * u, q < 0.4 ? BRIGHT : LMID, 0.7 - 0.55 * q); }
    for (const fe of w.feathers) { const a = fe.rest ? 0 : 0.6 * Math.sin(fe.om * fe.t + fe.ph), x = fe.x + fe.x0; r.stroke(x - Math.cos(a) * 1.4 * u, fe.y - Math.sin(a) * 1.4 * u, x + Math.cos(a) * 1.4 * u, fe.y + Math.sin(a) * 1.4 * u, Math.max(1, 0.8 * u), BRIGHT); }
    if (w.dove) { dove(r, w.dove.x, w.dove.y, 10 * u, w.dove.ph); targets.push({ x: w.dove.x - 9 * u, y: w.dove.y - 9 * u, w: 18 * u, h: 15 * u }); }
  },
};

// ---------------------------------------------------------------------------------------------- cardthrow
// A hat across a room, in one-point perspective from behind the thrower's hand: an upturned top hat on the floor
// under a hanging lamp. A kick throws a card: it flies nearly straight, spinning flat about its centre (its corners
// foreshortened as it turns), dropping a little and hooking gently to one side, and either drops into the hat (the
// hat rocks, a tip sticks up out of it) or clips it, or goes on to the back wall, bounces off and seesaws down like
// a leaf to lie on the floor. A snare throws two in quick succession, the beat cocks the wrist (and throws when no
// kick has for a while), a note picks the back's colour, a kick swings the lamp on its cord (and the light and the
// hat's shadow with it). A drop: a storm of cards. Kinds: how far away the hat stands.
const THROW_W = { near: [3, 2, 1], mid: [2, 3, 2], far: [1, 2, 3] };
const HAT_Z = { near: 3.1, mid: 4.4, far: 6.2 };
const HAT = { hat: true }; // the hat's place in the far-to-near order
const RF = 0.7, RX = 1.6, RC = -0.9, CA = 0.095, CB = 0.135, HAT_R = 0.22, HAT_H = 0.32, G3 = 2.2; // floor, walls, ceiling below/beside/above the eye; a card's half sizes; the hat; a card's fall

const cardthrow = {
  init(W) {
    const { w, rnd } = W;
    Object.assign(w, { kind: rollW(rnd, THROW_W, bandOf(W.a)), hx: 0.2, cards: [], floor: [], inHat: 0, jig: 0, jigV: 0, lamp: 0.25, lampV: 0, cock: 0, flick: 0, loaded: 1, since: 0, twin: 0, storm: 0, stormAcc: 0, side: 1, col: HOT + DIM, glint: 0, order: [], Q: [[0, 0], [0, 0], [0, 0], [0, 0]], ring: Array.from({ length: 20 }, () => [0, 0]) });
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), F = 0.8 * N, HY = 0.36 * N;
    const Zh = HAT_Z[w.kind], Zw = Zh + 1.1, Zl = Zh * 0.6, YT = RF - HAT_H, H0 = [-0.42, 0.32, 0.85];
    const sx = (X, Z) => 0.5 * N + (F * X) / Z, sy = (Y, Z) => HY + (F * Y) / Z;
    const throwCard = (spread) => { // aimed at the hat's mouth along the curve its spin and the drop give it, with the hand's error
      const T = [w.hx + (rnd() - 0.5) * spread * 0.13 * Zh, YT + (rnd() - 0.7) * spread * 0.05 * Zh, Zh];
      const sp = 7 * (0.85 + 0.3 * clamp(f.rel.bassDrive)), dx = T[0] - H0[0], dy = T[1] - H0[1], dz = T[2] - H0[2], Tf = Math.hypot(dx, dy, dz) / sp, side = (w.side = -w.side), ax = side * 0.7;
      w.cards.push({ X: H0[0], Y: H0[1], Z: H0[2], VX: dx / Tf - 0.5 * ax * Tf, VY: dy / Tf - 0.5 * G3 * Tf, VZ: dz / Tf, ax, phi: rnd() * TAU, om: side * (16 + 8 * rnd()), bank: 0.5 * side, pitch: -0.3, mode: 'fly', t: 0, col: w.col, A: 0, ph: 0, Xc: 0 });
      w.flick = 0.16; w.loaded = 0; w.since = 0;
    };
    if (f.section === 'change') { w.kind = rollW(rnd, THROW_W, band); w.hx = (rnd() - 0.5) * 0.6; w.floor.length = 0; w.inHat = 0; w.cards = w.cards.filter((c) => c.mode === 'fly' && c.Z < HAT_Z[w.kind] + 1.05); } // (none left beyond the new back wall)
    if (f.section === 'drop') { w.storm = 1.3; s.shake = Math.max(s.shake, 0.3); }
    const beat = beatTick(w, f, dt);
    if (beat) { w.cock = 1; if (w.since > 1.6 / bpsOf(f) && f.rel.bassDrive > 0.25) throwCard(1); }
    for (const h of hits) {
      if (isLow(h)) { throwCard(1); w.lampV += (w.side > 0 ? 1 : -1) * (0.5 + 0.8 * h.strength); }
      else if (h.kind === 'snare') { throwCard(1.2); w.twin = 0.09; }
      else if (h.kind === 'hat') w.glint = 0.1;
      else if (isTonal(h)) w.col = h.pc % 2 ? COOL + DIM : HOT + DIM;
    }
    if (w.twin > 0 && (w.twin -= dt) <= 0) throwCard(1.2);
    if (w.storm > 0) { w.storm -= dt; for (w.stormAcc += dt * 26; w.stormAcc >= 1; w.stormAcc--) throwCard(3.5); }
    w.since += dt; w.cock *= Math.exp(-dt * 6); w.flick -= dt; w.glint -= dt;
    if (w.flick <= 0 && (w.loaded += dt / 0.12) > 1) w.loaded = 1;
    // the lamp: a pendulum on its cord, a kick a push; the hat rocks on its crown when a card drops in
    for (let k = 0, n = Math.ceil(dt / 0.01), h = dt / n; k < n; k++) {
      w.lampV += (-(9.8 / 0.45) * Math.sin(w.lamp) - 0.35 * w.lampV) * h; w.lamp += w.lampV * h;
      w.jigV += (-400 * w.jig - 8 * w.jigV) * h; w.jig += w.jigV * h;
    }
    const LX = 0.45 * Math.sin(w.lamp), LY = RC + 0.45 * Math.cos(w.lamp); // the bulb, under its pivot on the ceiling
    // the cards: flight under the reduced fall and the sideways hook; through the hat's plane they drop in, glance off
    // it or fly on; the back wall and the side walls knock them back to flutter; flutter: a slow fall under drag, a
    // swing side to side with a tilt, to the floor, where they lie
    w.cards = w.cards.filter((c) => {
      c.t += dt;
      if (c.mode === 'fly') {
        const pz = c.Z, px = c.X, py = c.Y;
        c.X += (c.VX + 0.5 * c.ax * dt) * dt; c.VX += c.ax * dt; c.Y += (c.VY + 0.5 * G3 * dt) * dt; c.VY += G3 * dt; c.Z += c.VZ * dt; c.phi += c.om * dt; // exact under the steady hook and fall
        if (pz < Zh && c.Z >= Zh) {
          const q = (Zh - pz) / (c.Z - pz), xc = px + (c.X - px) * q, yc = py + (c.Y - py) * q;
          if (Math.abs(xc - w.hx) < HAT_R * 0.92 && yc > YT - 0.2 && yc < YT + 0.03) { c.mode = 'in'; c.X = xc; c.Z = Zh; c.Y = yc; w.jigV += 5 + 3 * rnd(); return true; }
          if (Math.abs(xc - w.hx) < HAT_R + CA && yc >= YT + 0.03) { c.Z = Zh - 0.05; c.VZ *= -0.2; w.jigV += 2; c.mode = 'flut'; c.Xc = c.X; c.A = 0.08 + 0.06 * rnd(); c.ph = rnd() < 0.5 ? 0 : Math.PI; }
        }
        // (a flutter starts mid-swing where the card was knocked, so it does not jump; side walls first, so none is passed)
        if (c.mode === 'fly' && Math.abs(c.X) > RX - CA) { c.X = Math.sign(c.X) * (RX - CA); c.VX *= -0.2; c.mode = 'flut'; c.Xc = c.X; c.A = 0.06; c.ph = rnd() < 0.5 ? 0 : Math.PI; }
        if (c.mode !== 'in' && c.Z > Zw - 0.05) { c.Z = Zw - 0.05; c.VZ = -0.2 * Math.abs(c.VZ); if (c.mode === 'fly') { c.mode = 'flut'; c.Xc = c.X; c.A = 0.1 + 0.08 * rnd(); c.ph = rnd() < 0.5 ? 0 : Math.PI; } }
        if (c.mode === 'flut') { c.VY = Math.min(c.VY, 0.3); c.t = 0; }
      } else if (c.mode === 'flut') {
        const sw = c.t * 5 + c.ph, vt = 0.55 * (0.35 + 0.8 * Math.abs(Math.cos(sw)));
        c.VY = vt + (c.VY - vt) * Math.exp(-6 * dt); c.Y += c.VY * dt;
        c.VZ *= Math.exp(-2 * dt); c.Z += c.VZ * dt; c.Xc += (c.VX *= Math.exp(-2 * dt)) * dt;
        if (c.Z > Zw - 0.05) { c.Z = Zw - 0.05; c.VZ = -0.2 * Math.abs(c.VZ); } // the back wall knocks it back, as in flight
        if (Math.abs(c.Xc) > RX - CA) { c.Xc = Math.sign(c.Xc) * (RX - CA); c.VX = 0; } // its drift stops at a side wall, and a swing into one slides along it
        c.X = clamp(c.Xc + c.A * Math.sin(sw), CA - RX, RX - CA); c.bank = 0.8 * Math.sin(sw); c.pitch = 0.25 * Math.cos(sw); c.om *= Math.exp(-3 * dt); c.phi += c.om * dt;
      } else if (c.mode === 'in') { c.Y += 1.2 * dt; c.X = follow(c.X, w.hx, dt, 0.05); if (c.Y > YT + 0.1) { w.inHat++; return false; } return true; }
      else if (c.mode === 'skid') { // flat on the floor: a skid under friction (12 units/s², stepped exactly) to a stop, the spin running down with it
        const v = Math.hypot(c.VX, c.VZ), h = Math.min(dt, v / 12), k = v > 0 ? (1 - (6 * h) / v) * h : 0, q = v > 0 ? Math.max(0, 1 - (12 * h) / v) : 0;
        c.X += c.VX * k; c.Z += c.VZ * k; c.VX *= q; c.VZ *= q; c.om *= Math.exp(-8 * dt); c.phi += c.om * dt;
        if (c.Z > Zw - 0.05) { c.Z = Zw - 0.05; c.VZ = 0; }
        if (Math.abs(c.X) > RX - CA) { c.X = Math.sign(c.X) * (RX - CA); c.VX = 0; }
        if (q > 0) return true;
        w.floor.push({ X: c.X, Y: c.Y, Z: c.Z, phi: c.phi, bank: 0, pitch: 0, col: c.col, up: hash(w.floor.length, 7) < 0.25 });
        if (w.floor.length > 40) w.floor.shift();
        return false;
      }
      if ((c.mode === 'fly' || c.mode === 'flut') && c.Y >= RF - 0.005) { // on the floor: it skids on with the speed it came down with
        if (c.mode === 'flut') c.VX += 5 * c.A * Math.cos(c.t * 5 + c.ph); // (the swing's own speed too)
        c.Y = RF - 0.005; c.VY = 0; c.bank = 0; c.pitch = 0; c.mode = 'skid';
        return true;
      }
      return c.Z > 0.5 && c.t < 12;
    });

    // the room: side walls, floor and ceiling meeting the back wall; boards running to the vanishing point; the
    // lamp's pool on the floor under the swinging bulb
    r.fill(DARK);
    const Zn = 0.5;
    r.poly([[sx(-RX, Zn), sy(RF, Zn)], [sx(RX, Zn), sy(RF, Zn)], [sx(RX, Zw), sy(RF, Zw)], [sx(-RX, Zw), sy(RF, Zw)]], DARK + DIM);
    r.poly([[sx(-RX, Zn), sy(RC, Zn)], [sx(RX, Zn), sy(RC, Zn)], [sx(RX, Zw), sy(RC, Zw)], [sx(-RX, Zw), sy(RC, Zw)]], BLACK);
    r.rect(sx(-RX, Zw), sy(RC, Zw), sx(RX, Zw) - sx(-RX, Zw), sy(RF, Zw) - sy(RC, Zw), MID + DIM);
    for (let X = -RX + 0.4; X < RX; X += 0.4) r.line(sx(X, 0.9), sy(RF, 0.9), sx(X, Zw), sy(RF, Zw), DARK);
    for (let Z = 1; Z < Zw; Z += 1) r.line(sx(-RX, Z), sy(RF, Z), sx(RX, Z), sy(RF, Z), DARK);
    for (const d of [-1, 1]) r.line(sx(d * RX, Zn), sy(RF, Zn), sx(d * RX, Zw), sy(RF, Zw), LMID + DIM);
    r.rect(sx(-RX, Zw), sy(RF, Zw) - Math.max(1, (F * 0.06) / Zw), sx(RX, Zw) - sx(-RX, Zw), Math.max(1, (F * 0.06) / Zw), LMID + DIM);
    const ring = w.ring, poolR = 0.32 + 0.18 * f.level;
    for (let k = 0; k < 20; k++) { const a = (k / 20) * TAU, X = LX + Math.cos(a) * poolR, Z = Zl + Math.sin(a) * poolR; ring[k][0] = sx(X, Z); ring[k][1] = sy(RF, Z); }
    r.poly(ring, MID + DIM);
    // what stands in the room, far to near: the cards lying and flying, the hat with its shadow, the lamp
    const order = w.order;
    order.length = 0;
    for (const c of w.floor) order.push(c);
    for (const c of w.cards) if (c.mode !== 'in') order.push(c);
    order.push(HAT);
    order.sort((p, q) => (q === HAT ? Zh : q.Z) - (p === HAT ? Zh : p.Z));
    const Q = w.Q;
    const quad = (c, k) => { // the card's corners turned by its spin in its own plane, banked and pitched, projected
      const cs = Math.cos(c.phi), sn = Math.sin(c.phi), cb = Math.cos(c.bank), sb = Math.sin(c.bank), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
      for (let i = 0; i < 4; i++) {
        const lx0 = (i === 0 || i === 3 ? -CA : CA) * k, lz0 = (i < 2 ? -CB : CB) * k, lx = lx0 * cs - lz0 * sn, lz = lx0 * sn + lz0 * cs, Z = Math.max(0.3, c.Z + lz * cp);
        Q[i][0] = sx(c.X + lx * cb, Z); Q[i][1] = sy(c.Y + lx * sb + lz * sp, Z);
      }
      return Q;
    };
    const hatAt = () => {
      const jx = w.jig * 0.15, x0 = sx(w.hx - HAT_R + jx, Zh), x1 = sx(w.hx + HAT_R + jx, Zh), yb = sy(RF, Zh), yt = sy(YT, Zh), yl = sy(LY, Zl);
      // the shadow: the hat's mouth cast from the bulb onto the floor, away from the light
      const k = (RF - LY) / (YT - LY), shX = LX + (w.hx - LX) * k, shZ = Zl + (Zh - Zl) * k;
      r.poly([[x0, yb], [x1, yb], [sx(shX + HAT_R * k, shZ), sy(RF, shZ)], [sx(shX - HAT_R * k, shZ), sy(RF, shZ)]], BLACK);
      r.rect(x0, yt, x1 - x0, yb - yt, BLACK);
      r.rect(x0, yt + (yb - yt) * 0.18, x1 - x0, Math.max(1, (yb - yt) * 0.16), HOT);
      r.rect(x0 + (x1 - x0) * 0.15, yt, Math.max(1, (x1 - x0) * 0.08), yb - yt, DARK);
      for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU, X = w.hx + jx + Math.cos(a) * HAT_R * 1.55, Z = Zh + Math.sin(a) * HAT_R * 1.55; ring[i][0] = sx(X, Z); ring[i][1] = sy(YT, Z); }
      r.poly(ring, w.glint > 0 ? LMID : MID);
      for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU, X = w.hx + jx + Math.cos(a) * HAT_R * 0.95, Z = Zh + Math.sin(a) * HAT_R * 0.95; ring[i][0] = sx(X, Z); ring[i][1] = sy(YT, Z); }
      r.poly(ring, BLACK);
      for (let i = 0; i < Math.min(9, w.inHat); i++) { const ox = (hash(i, 3) - 0.5) * HAT_R * 1.3, X = w.hx + jx + ox; r.stroke(sx(X, Zh), sy(YT + 0.02, Zh), sx(X + (hash(i, 5) - 0.5) * 0.06, Zh), sy(YT - 0.07 - hash(i, 9) * 0.05, Zh), Math.max(1, (F * 0.03) / Zh), BRIGHT); }
      for (const c of w.cards) if (c.mode === 'in') { const X = c.X + jx; r.stroke(sx(X, Zh), sy(Math.min(c.Y, YT), Zh), sx(X, Zh), sy(c.Y - 0.12, Zh), Math.max(1, (F * 0.04) / Zh), BRIGHT); }
      targets.push({ x: x0 - u, y: yt - 2 * u, w: x1 - x0 + 2 * u, h: yb - yt + 3 * u });
      return yl;
    };
    for (const o of order) {
      if (o === HAT) { hatAt(); continue; }
      const P = quad(o, 1);
      r.poly(P, BRIGHT);
      const big = Math.abs(P[2][0] - P[0][0]) + Math.abs(P[2][1] - P[0][1]) > 4 * u;
      if (big && !o.up) r.poly(quad(o, 0.68), o.col);
      else if (big) r.rect((P[0][0] + P[2][0]) / 2 - 0.5 * u, (P[0][1] + P[2][1]) / 2 - 0.5 * u, Math.max(1, u), Math.max(1, u), HOT);
      if (o.mode === 'fly' && o.Z < Zh) targets.push({ x: Math.min(P[0][0], P[2][0]) - u, y: Math.min(P[0][1], P[2][1]) - u, w: Math.abs(P[2][0] - P[0][0]) + 2 * u, h: Math.abs(P[2][1] - P[0][1]) + 2 * u });
    }
    // the lamp: its cord from the ceiling, the shade, the bulb, brighter on the beat
    const lx = sx(LX, Zl), ly = sy(LY, Zl), ls = (F * 0.09) / Zl;
    r.line(sx(0, Zl), sy(RC, Zl), lx, ly, MID);
    r.poly([[lx - ls * 0.4, ly - ls * 0.5], [lx + ls * 0.4, ly - ls * 0.5], [lx + ls, ly + ls * 0.3], [lx - ls, ly + ls * 0.3]], MID);
    r.disc(lx, ly + ls * 0.4, Math.max(1, ls * 0.35), f.beat.pulse > 0.6 ? WHITE : BRIGHT);
    // the thrower's hand, nearest of all: the sleeve from the corner, the wrist cocked on the beat and flicked through
    // on the throw, a card between the first two fingers when one is loaded
    const hx = sx(H0[0], H0[2]), hy = sy(H0[1], H0[2]) + Math.sin(f.rel.bassClock) * u, aim = Math.atan2(sy(YT, Zh) - hy, sx(w.hx, Zh) - hx);
    const fl = w.flick > 0 ? Math.sin((1 - w.flick / 0.16) * Math.PI) : 0, a = aim - 0.6 * w.cock + 0.5 * fl, ca = Math.cos(a), sa = Math.sin(a);
    r.stroke(-0.04 * N, 1.06 * N, hx - 3 * u, hy + 6 * u, 9 * u, MID);
    r.stroke(hx - 4.5 * u, hy + 7.5 * u, hx - 1.5 * u, hy + 4.5 * u, 9.5 * u, BRIGHT);
    r.disc(hx, hy + u, 4.6 * u, LMID);
    for (const o of [-1.4, 1.4]) r.stroke(hx - sa * o * u, hy + u + ca * o * u, hx + ca * 8 * u - sa * o * u, hy + u + sa * 8 * u + ca * o * u, 2.2 * u, LMID);
    r.stroke(hx - 2 * u, hy + 3 * u, hx + ca * 4 * u + 2 * sa * u, hy + sa * 4 * u + 3 * u - ca * u, 2.4 * u, LMID);
    if (w.loaded >= 1) { const cx = hx + ca * 9 * u, cy = hy + u + sa * 9 * u; r.poly([[cx - sa * 4 * u, cy + ca * 4 * u], [cx + ca * 5 * u - sa * 4 * u, cy + sa * 5 * u + ca * 4 * u], [cx + ca * 5 * u + sa * 3 * u, cy + sa * 5 * u - ca * 3 * u], [cx + sa * 3 * u, cy - ca * 3 * u]], BRIGHT); }
  },
};

// ---------------------------------------------------------------------------------------------- marquee
// A casino's marquee at night: a board ringed with two rows of bulbs chasing in a pattern that steps with the beat
// (round the ring, a zigzag between the rows, or filling down from the top over a bar), neon tubes in suit and star
// shapes that flicker on the hats and buzz with the treble, and a wheel of fortune that a kick spins and friction
// runs down; its flapper is a stiff sprung pendulum that each peg pushes aside and lets snap back against the next,
// a click each time, and the segment it stops on lights up. A snare flashes the outer row, a note recolours a tube,
// the canopy over the doors pulses on the beat. A drop: the jackpot, every bulb flashing, the wheel spun hard and
// coins raining down, bouncing on the pavement and heaping up along it until they are swept off a few at a time.
// Kinds: the chase pattern.
const CHASE_W = { ring: [3, 2, 1], zigzag: [1, 3, 2], fill: [1, 2, 3] };
const NPEG = 16, PEG_D = TAU / NPEG;
const STAR = Array.from({ length: 11 }, (_, i) => { const a = (i / 10) * TAU - Math.PI / 2, q = i % 2 ? 0.45 : 1; return [Math.cos(a) * q, Math.sin(a) * q]; });
const DIAMOND = [[0, -1], [0.68, 0], [0, 1], [-0.68, 0], [0, -1]];
const HEART_LINE = [...HEART, HEART[0]].map(([x, y]) => [x, y - 0.08]);
const WAVE = Array.from({ length: 13 }, (_, i) => [(i / 12) * 2 - 1, Math.sin((i / 12) * TAU * 1.5) * 0.12]);
// the bulbs round a rectangle `st` apart, clockwise from the top middle, each with how far round it is from there
// (0 at the top middle, 1 at the bottom middle either way)
function bulbRing(x0, y0, x1, y1, st) {
  const out = [], P = 2 * (x1 - x0 + y1 - y0), n = Math.max(8, Math.round(P / st));
  for (let i = 0; i < n; i++) {
    let d = ((i / n) * P + (x1 - x0) / 2) % P, x, y;
    if (d < x1 - x0) { x = x0 + d; y = y0; } else if ((d -= x1 - x0) < y1 - y0) { x = x1; y = y0 + d; } else if ((d -= y1 - y0) < x1 - x0) { x = x1 - d; y = y1; } else { x = x0; y = y1 - (d - (x1 - x0)); }
    out.push([x, y, 2 * Math.min(i / n, 1 - i / n)]);
  }
  return out;
}
// a neon tube along the unit shape `pts` at (x, y) scaled s: the glow, then the glass; unlit glass when it is out
function tube(r, pts, x, y, s, wd, col, lit) {
  for (let pass = lit ? 0 : 1; pass < 2; pass++)
    for (let i = 0; i + 1 < pts.length; i++) r.stroke(x + pts[i][0] * s, y + pts[i][1] * s, x + pts[i + 1][0] * s, y + pts[i + 1][1] * s, pass ? wd : wd * 3, pass ? (lit ? col : DARK) : col + DIM);
}
function marqueeSetup(w, N, u) {
  w.N = N;
  w.outer = bulbRing(0.07 * N + 2.5 * u, 0.05 * N + 2.5 * u, 0.93 * N - 2.5 * u, 0.7 * N - 2.5 * u, 4 * u);
  w.inner = bulbRing(0.07 * N + 6.5 * u, 0.05 * N + 6.5 * u, 0.93 * N - 6.5 * u, 0.7 * N - 6.5 * u, 4.5 * u);
  w.pile = new Float32Array(N); w.rest = []; w.coins = []; w.roll = [];
}

const marquee = {
  init(W) {
    const { w, rnd, N, u } = W;
    Object.assign(w, { kind: rollW(rnd, CHASE_W, bandOf(W.a)), step: 0, ang: rnd() * TAU, om: 0, psi: 0, psiV: 0, touch: false, still: 0, click: 0, kick: 0, spun: false, prize: -1, prizeT: 0, strobe: 0, jack: 0, pour: 0, sweep: 0, N: 0,
      tubes: [{ pts: DIAMOND, x: 0.19, y: 0.4, s: 0.075, col: HOT }, { pts: HEART_LINE, x: 0.81, y: 0.38, s: 0.07, col: HOT }, { pts: STAR, x: 0.17, y: 0.16, s: 0.045, col: COOL }, { pts: STAR, x: 0.83, y: 0.16, s: 0.045, col: COOL }, { pts: WAVE, x: 0.5, y: 0.655, s: 0.18, col: COOL }].map((q) => ({ ...q, fl: 0 })) });
    marqueeSetup(w, N, u);
  },
  draw(W) {
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), g = GRAV(N), lk = beatLocked(f);
    if (w.N !== N) marqueeSetup(w, N, u);
    if (f.section === 'change') w.kind = rollW(rnd, CHASE_W, band);
    if (f.section === 'drop') { w.jack = 3; w.om = Math.min(12, w.om + 8); w.spun = true; s.shake = Math.max(s.shake, 0.3); }
    const beat = beatTick(w, f, dt);
    for (const h of hits) {
      if (isLow(h)) { w.kick = 0.08; if (w.om < 2) { w.om += 2.5 + 3 * h.strength; w.spun = true; } else w.om += 0.3; } // a fresh spin once it has run down, a shove while it turns
      else if (h.kind === 'snare') w.strobe = 0.07;
      else if (h.kind === 'hat') { const q = pick(rnd, w.tubes); q.fl = Math.max(q.fl, 0.1 + 0.12 * rnd()); }
      if (isTonal(h)) w.tubes[h.pc % w.tubes.length].col = h.pc % 2 ? HOT : COOL;
    }
    for (const q of w.tubes) { q.fl -= dt; if (rnd() < dt * 3 * clamp(f.rel.trebDrive - 0.2)) q.fl = Math.max(q.fl, 0.04); }
    w.step += ticks16(w, f, dt);
    w.strobe -= dt; w.jack -= dt; w.click -= dt; w.prizeT -= dt; w.kick -= dt;
    // the wheel and its flapper, in small steps so no peg slips past: bearing friction and drag run the wheel down;
    // the flapper is a stiff damped spring about straight down; a peg inside its sweep pushes the tip out of the way
    // to the side it is on, and the bent spring pushes back on the peg (which brakes the wheel, and rocks it back
    // when it stops against one); swinging back into the next peg is the click, a bounce that costs the wheel
    const cx = 0.5 * N, cy = 0.4 * N, Rw = 0.2 * N, Rp = Rw - 1.6 * u, hP = 7 * u, Lf = hP + 0.6 * u, rho = 1.7 * u, Py = -Rp - hP;
    for (let k = 0, n = Math.ceil(dt * 480), h = dt / n; k < n; k++) {
      const fr = (0.25 + 0.12 * Math.abs(w.om)) * h;
      w.om = Math.abs(w.om) <= fr ? 0 : w.om - Math.sign(w.om) * fr;
      w.ang += w.om * h;
      w.psiV += (-1400 * w.psi - (g / Lf) * Math.sin(w.psi) - 9 * w.psiV) * h; w.psi += w.psiV * h; // the spring, and gravity on the hanging blade
      const k0 = Math.round(-w.ang / PEG_D);
      let touch = false;
      for (let j = k0 - 1; j <= k0 + 1; j++) {
        const al = w.ang + j * PEG_D, dx = Rp * Math.sin(al), dy = -Rp * Math.cos(al) - Py, D = Math.hypot(dx, dy);
        if (D > Lf + rho || D < Lf - rho) continue;
        const phc = Math.atan2(dx, dy), be = Math.acos(clamp((Lf * Lf + D * D - rho * rho) / (2 * Lf * D), -1, 1));
        if (w.psi > phc - be && w.psi < phc + be) {
          const right = w.psi > phc;
          if (right ? w.psiV < 0 : w.psiV > 0) { if (!w.touch && Math.abs(w.psiV) > 1) { w.click = 0.06; w.om *= 0.99; w.psiV *= -0.3; } else w.psiV = 0; } // a knock out of free swing, or just lying against it
          w.psi = right ? phc + be : phc - be;
          w.om -= 1.2 * w.psi * h;
          touch = true;
        }
      }
      w.touch = touch;
    }
    w.still = Math.abs(w.om) < 0.02 ? w.still + dt : 0;
    if (w.spun && w.still > 0.3) { w.spun = false; w.prize = Math.floor(((((-w.ang) % TAU) + TAU) % TAU) / PEG_D); w.prizeT = 3; }
    // the night, the stars twinkling with the treble, the building, the canopy and its bulbs, the doors, the pavement
    r.fill(DARK + DIM);
    for (let i = 0; i < 40; i++) { const x = hash(i, 1) * N, y = hash(i, 2) * 0.05 * N; if (hash(i, Math.floor(t * 4)) < 0.4 + 0.5 * f.rel.trebDrive) r.set(x, y, hash(i, 3) < 0.3 ? BRIGHT : LMID + DIM); }
    r.rect(0, 0.7 * N, N, 0.23 * N, DARK);
    r.rect(0.34 * N, 0.8 * N, 0.32 * N, 0.13 * N, BLACK);
    r.rect(0.36 * N, 0.82 * N, 0.12 * N, 0.11 * N, COOL + DIM); r.rect(0.52 * N, 0.82 * N, 0.12 * N, 0.11 * N, COOL + DIM);
    r.rect(0.2 * N, 0.73 * N, 0.6 * N, 0.05 * N, MID);
    for (let x = 0.21 * N; x < 0.8 * N; x += 4 * u) r.rect(x, 0.785 * N, Math.max(1, 1.5 * u), Math.max(1, 1.5 * u), f.beat.pulse > 0.5 || w.kick > 0 || w.jack > 0 ? BRIGHT : LMID + DIM);
    r.rect(0, 0.93 * N, N, 0.07 * N, MID + DIM);
    r.rect(0, 0.93 * N, N, Math.max(1, u), LMID + DIM);
    // the board and its two rows of bulbs
    r.rect(0.07 * N, 0.05 * N, 0.86 * N, 0.65 * N, DARK);
    r.frame(Math.round(0.07 * N), Math.round(0.05 * N), Math.round(0.86 * N), Math.round(0.65 * N), MID);
    const flash = w.jack > 0 && Math.floor(t * 12) % 2 === 0, off = f.level > 0.5 ? MID + DIM : DARK + DIM, q16 = lk ? (f.beat.count % 4) * 4 + Math.min(3, Math.floor(f.beat.phase * 4)) : w.step % 16;
    const lit = (row, i, n, d) => {
      if (w.jack > 0) return flash;
      if (row === 0 && w.strobe > 0) return true;
      if (w.kind === 'ring') return row === 0 ? (((i - w.step) % 4) + 4) % 4 === 0 : (i + w.step) % 4 === 0;
      if (w.kind === 'zigzag') return (i + (w.step >> 1) + row) % 2 === 0;
      return row === 0 ? d <= (q16 + 1) / 16 : f.beat.pulse > 0.5;
    };
    for (let row = 0; row < 2; row++) { const B = row ? w.inner : w.outer; for (let i = 0; i < B.length; i++) { const [x, y, d] = B[i], on = lit(row, i, B.length, d); r.rect(x - u, y - u, Math.max(1, 2 * u), Math.max(1, 2 * u), on ? (row ? LMID : BRIGHT) : off); if (on && u >= 1.2) r.set(x - 0.5 * u, y - 0.5 * u, WHITE); } }
    // the neon
    for (const q of w.tubes) tube(r, q.pts, q.x * N, q.y * N, q.s * N, Math.max(1, 1.2 * u), q.col, w.jack > 0 || q.fl <= 0 || hash(Math.floor(t * 30), q.x * 100 | 0) > 0.6);
    // the wheel: the segments turning, the winner lit, the rim and its pegs, the hub; the flapper on its bracket
    const SEG = [HOT, BRIGHT, COOL, LMID];
    for (let j = 0; j < NPEG; j++) {
      const a0 = w.ang + j * PEG_D, am = a0 + PEG_D / 2, a1 = a0 + PEG_D, win = j === w.prize && w.prizeT > 0 && Math.floor(t * 6) % 2 === 0;
      r.poly([[cx, cy], [cx + Math.sin(a0) * Rw, cy - Math.cos(a0) * Rw], [cx + Math.sin(am) * Rw * 1.01, cy - Math.cos(am) * Rw * 1.01], [cx + Math.sin(a1) * Rw, cy - Math.cos(a1) * Rw]], win ? WHITE : SEG[j % 4]);
      r.disc(cx + Math.sin(am) * Rw * 0.72, cy - Math.cos(am) * Rw * 0.72, 1.2 * u, j % 4 === 1 ? HOT : DARK);
    }
    for (let j = 0; j < NPEG; j++) { const a = w.ang + j * PEG_D; r.line(cx, cy, cx + Math.sin(a) * Rw, cy - Math.cos(a) * Rw, DARK); }
    oval(r, cx, cy, Rw, Rw, Math.max(1, 1.5 * u), MID, 48);
    for (let j = 0; j < NPEG; j++) { const a = w.ang + j * PEG_D; r.disc(cx + Math.sin(a) * Rp, cy - Math.cos(a) * Rp, 1.1 * u, BRIGHT); }
    r.disc(cx, cy, 0.035 * N, MID); r.disc(cx, cy, 0.015 * N, f.beat.pulse > 0.6 ? WHITE : BRIGHT);
    const px = cx, py = cy + Py, tx = px + Math.sin(w.psi) * Lf, ty = py + Math.cos(w.psi) * Lf;
    r.rect(px - 1.5 * u, 0.05 * N + 4 * u, Math.max(1, 3 * u), py - 0.05 * N - 4 * u, MID);
    r.poly([[px - Math.cos(w.psi) * 1.5 * u, py + Math.sin(w.psi) * 1.5 * u], [px + Math.cos(w.psi) * 1.5 * u, py - Math.sin(w.psi) * 1.5 * u], [tx, ty]], w.click > 0 ? WHITE : HOT);
    r.disc(px, py, 1.4 * u, LMID);
    if (w.click > 0) r.set(tx + u, ty - u, WHITE);
    targets.push({ x: tx - 3 * u, y: py - 2 * u, w: 6 * u, h: ty - py + 4 * u });
    // the jackpot's coins: they rain from the top, tumbling, bounce off the pavement and the heap and settle on it
    const floor = 0.97 * N, rc = 1.1 * u, ri = Math.max(0, Math.round(rc - 0.5)), pile = w.pile;
    if (w.jack > 0.5) for (w.pour += dt * 45; w.pour >= 1; w.pour--) w.coins.push({ x: (0.03 + 0.94 * rnd()) * N, y: -2 * u, vx: (rnd() - 0.5) * 0.1 * N, vy: rnd() * 0.2 * N, sp: rnd() * TAU });
    w.coins = w.coins.filter((c) => {
      c.vy += g * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.sp += 14 * dt;
      if (c.x < rc || c.x > N - rc) { c.x = clamp(c.x, rc, N - rc); c.vx = -c.vx * 0.5; }
      const col = Math.max(0, Math.min(N - 1, Math.floor(c.x))), top = floor - heapUnder(pile, col, ri);
      if (c.y + rc >= top && c.vy > 0) {
        c.y = top - rc;
        if (c.vy > 0.15 * N) { c.vy = -c.vy * 0.35; c.vx = c.vx * 0.6 + (rnd() - 0.5) * 0.15 * N; }
        else { if (w.rest.length + w.roll.length < 320) { const [cc, hh] = heapSettle(pile, col, rc, ri); w.roll.push({ x: c.x, y: c.y, y0: c.y, tx: cc + 0.5, ty: floor - hh - rc, d0: Math.abs(cc + 0.5 - c.x) || 1, v: Math.abs(c.vx) }); } return false; }
      }
      const wd = Math.abs(Math.cos(c.sp));
      if (wd < 0.3) r.rect(c.x - 0.5 * u, c.y - rc, Math.max(1, u), 2 * rc, LMID); else r.ring(c.x, c.y, rc * wd * 0.5, rc * wd, BRIGHT, 1 / wd);
      return true;
    });
    if (w.jack < -4 && w.rest.length) { // swept off from the top, a few a frame, the heap rebuilt from what is left
      for (w.pour += dt * 40; w.pour >= 1 && w.rest.length; w.pour--) w.rest.pop();
      pile.fill(0);
      for (const c of w.rest) { const [cc, hh] = heapSettle(pile, Math.max(0, Math.min(N - 1, Math.floor(c[0]))), rc, ri); c[0] = cc + 0.5; c[1] = floor - hh - rc; }
    }
    w.roll = rollCoins(w.roll, w.rest, g, dt);
    for (const c of w.roll) { r.disc(c.x, c.y, rc, LMID); r.set(c.x - 0.4 * u, c.y - 0.4 * u, BRIGHT); }
    for (const [x, y] of w.rest) { r.disc(x, y, rc, LMID); r.set(x - 0.4 * u, y - 0.4 * u, BRIGHT); }
  },
};

// ---------------------------------------------------------------------------------------------- poker
// A poker table from above with five players round it, each leaning in over two hole cards with a stack beside
// them. The hand runs on the music: the hole cards are dealt from the button an eighth apart, sliding to their
// places with friction, the board is laid face down and one card of it turns over each bar (over its long edge,
// foreshortened as it turns). A kick: the next player pushes chips into the pot (they slide and stop with
// friction) or, now and then, folds. A snare: a tell, one player's cards twitch under their fingers and a chip
// riffle runs up their stack. A drop is the showdown: every hand still in turns over and the pot slides to the
// winner (as it does after the last card anyway); the cards are swept to the muck and the button moves on. A
// section change: one player gets up and leaves with their chips, a new one sits down with a stack. Kinds: a home
// game at a wooden table under a lamp, a club's padded rail and betting line, a tournament's with deeper stacks.
const POKER_W = { home: [3, 2, 1], club: [2, 3, 2], tourney: [1, 2, 3] };
const pokerTh = (i) => Math.PI / 2 + (i * TAU) / 5;
// a player from above at (x, y), out along `th` from the table's centre: the shoulders across, the head, a cap
function sitter(r, x, y, th, u, col, hat) {
  quad(r, rotAt(x, y, th + Math.PI / 2), 6 * u, 2.3 * u, col);
  r.disc(x + Math.cos(th) * 0.6 * u, y + Math.sin(th) * 0.6 * u, 2.7 * u, hat ? DARK : MID + DIM);
  if (hat) r.ring(x + Math.cos(th) * 0.6 * u, y + Math.sin(th) * 0.6 * u, 2.4 * u, Math.max(1, u), LMID);
}
function pokerSeat(rnd, kind) { return { n: (kind === 'tourney' ? 14 : 8) + Math.floor(rnd() * 8), val: Math.floor(rnd() * 5), col: pick(rnd, [MID, LMID, COOL, HOT, COOL + DIM, HOT + DIM]), hat: rnd() < 0.3, d: 0, leave: -1, out: false, tw: 0, rif: 0, glint: 0 }; }

const poker = {
  init(W) {
    const { w, rnd } = W, kind = rollW(rnd, POKER_W, bandOf(W.a));
    Object.assign(w, { kind, want: null, seats: Array.from({ length: 5 }, () => pokerSeat(rnd, kind)), button: Math.floor(rnd() * 5), cards: [], packets: [], pot: null, phase: 'deal', dealt: 0, flips: 0, beats: 0, t16: undefined, eighth: 0, act: 0, val: 0, winner: -1, showT: 0, N: W.N });
  },
  draw(W) {
    if (W.w.N !== W.N) poker.init(W); // the table laid out afresh at another size
    const { r, N, u, t, dt, f, w, rnd, hits, targets, s } = W, band = bandOf(W.a), lk = beatLocked(f), cw = 2.6 * u, ch = 3.6 * u;
    const cx = 0.5 * N, cy = 0.48 * N, home = w.kind === 'home', RX = 0.37 * N, RY = 0.25 * N;
    const at = (i, k, d = 0) => { const th = pokerTh(i); return [cx + (k * RX + d) * Math.cos(th), cy + (k * RY + d) * Math.sin(th)]; };
    const POT = [cx, cy + 0.075 * N], MUCK = [cx + 0.2 * N, cy - 0.075 * N], boardAt = (j) => [cx + (j - 2) * 6.4 * u, cy - 0.01 * N];
    const live = () => w.seats.filter((q) => !q.out).length;
    const newHand = () => { // the button moves on; a kind a section change asked for comes in with the new hand
      if (w.want) { w.kind = w.want; w.want = null; }
      w.button = (w.button + 1) % 5;
      Object.assign(w, { cards: [], phase: 'deal', dealt: 0, flips: 0, winner: -1, showT: 0, act: (w.button + 1) % 5 });
      for (const q of w.seats) q.out = q.leave >= 0;
    };
    const send = (c, x, y, k, a) => slideTo(c, x, y, k, N, a);
    const dealOne = () => { // from the deck at the button: the players' two cards each, then the five of the board
      const [dx, dy] = at(w.button, 0.42), j = w.dealt++, c = { x: dx, y: dy, vx: 0, vy: 0, a: 0, av: 0, up: false, flip: 1, fd: -1, own: -1, slot: 0, suit: Math.floor(rnd() * 4), rank: Math.floor(rnd() * 5) };
      if (j < 10) { const i = (w.button + 1 + j) % 5, th = pokerTh(i), side = j < 5 ? -1 : 1, [x, y] = at(i, 0.6); if (w.seats[i].out) return; c.own = i; c.slot = side; send(c, x + Math.cos(th + Math.PI / 2) * side * 1.6 * u, y + Math.sin(th + Math.PI / 2) * side * 1.6 * u, 4, th + Math.PI / 2 + side * 0.08); }
      else { const [x, y] = boardAt(j - 10); c.own = 5 + j - 10; send(c, x, y, 4, 0); }
      w.cards.push(c);
    };
    const showdown = () => { // every hand still in turns over, one after another, the rest of the board with them; the pot goes to one of them
      if (w.phase === 'show' || w.phase === 'sweep') return;
      while (w.dealt < 15) dealOne();
      w.phase = 'show'; w.showT = 0;
      const ins = w.seats.map((q, i) => i).filter((i) => !w.seats[i].out);
      w.winner = ins.length ? pick(rnd, ins) : w.button;
      let k = 0;
      for (const c of w.cards) if (!c.up && c.fd < 0 && (c.own >= 5 || !w.seats[c.own].out)) c.fd = 0.25 + 0.09 * k++;
    };
    const fold = (i) => { w.seats[i].out = true; for (const c of w.cards) if (c.own === i) { c.fd = -1; send(c, MUCK[0] + (rnd() - 0.5) * 3 * u, MUCK[1] + (rnd() - 0.5) * 2 * u, 3, (rnd() - 0.5) * 0.6); } };
    // the section: one player leaves, a new one comes; the table at the next hand
    if (f.section === 'change') { w.want = rollW(rnd, POKER_W, band); const i = Math.floor(rnd() * 5); if (w.seats[i].leave < 0) { w.seats[i].leave = 0; if (!w.seats[i].out && w.phase !== 'show' && w.phase !== 'sweep' && live() > 2) fold(i); } }
    if (f.section === 'drop') { showdown(); s.shake = Math.max(s.shake, 0.2); }
    const beat = beatTick(w, f, dt);
    if (beat) w.beats++;
    const bar = lk ? f.beat.on && f.beat.count % 4 === 0 : beat && w.beats % 4 === 0;
    w.eighth += ticks16(w, f, dt);
    while (w.eighth >= 2) { // the dealing goes an eighth a card
      w.eighth -= 2;
      if (w.phase === 'deal') { dealOne(); if (w.dealt >= 15) { w.phase = 'play'; w.flips = 0; } }
    }
    if (w.phase === 'play' && bar) { // a card of the board a bar, and the bar after the last one the showdown
      const c = w.cards.find((q) => q.own >= 5 && !q.up && q.fd < 0);
      if (c) { c.fd = 0; w.flips++; } else showdown();
    }
    for (const h of hits) {
      if (isLow(h) && w.phase === 'play') { // the player to act: a fold now and then while three or more are in, else chips to the pot
        for (let k = 0; k < 5 && (w.seats[w.act].out || w.seats[w.act].leave >= 0); k++) w.act = (w.act + 1) % 5;
        const i = w.act, q = w.seats[i];
        w.act = (w.act + 1) % 5;
        if (q.out) continue;
        if (live() > 2 && rnd() < 0.12) { fold(i); continue; }
        const n = Math.min(q.n - 2, 1 + Math.floor(h.strength * 3));
        if (n > 0) { const [x, y] = at(i, 0.8), p = { x, y, vx: 0, vy: 0, k: 3, n, val: (q.val + w.val) % 5, t: 0, from: i }; slideTo(p, POT[0] + (rnd() - 0.5) * 5 * u, POT[1] + (rnd() - 0.5) * 3 * u, 3, N); w.packets.push(p); q.n -= n; }
      } else if (h.kind === 'snare') { const ins = w.seats.filter((q) => !q.out && q.leave < 0); if (ins.length) { const q = pick(rnd, ins); q.tw = 0.35; q.rif = 0.6; } }
      else if (h.kind === 'hat') pick(rnd, w.seats).glint = 0.1;
      if (isTonal(h)) w.val = h.pc % 5;
    }
    // the cards: friction slides; a turn over the long edge once its delay is up
    for (const c of w.cards) {
      if (c.fd >= 0 && c.flip >= 1) { c.fd -= dt; if (c.fd <= 0) { c.fd = -1; c.flip = 0; c.up = !c.up; } }
      if (c.flip < 1) c.flip = Math.min(1, c.flip + dt * 3);
      slide(c, dt);
    }
    // the chips on their way to the pot join it when they stop; the pot slides to the winner at the showdown and joins their stack
    w.packets = w.packets.filter((p) => { p.t += dt; if (slide(p, dt) > 0.01 * N) return true; if (!w.pot) w.pot = { x: POT[0], y: POT[1], vx: 0, vy: 0, k: 3, n: 0, val: p.val }; w.pot.n += p.n; return false; });
    if (w.phase === 'show') {
      w.showT += dt;
      if (w.showT > 1.2 && w.pot && !w.pot.go && !w.packets.length) { const [x, y] = at(w.winner, 0.8); slideTo(w.pot, x, y, 2.5, N); w.pot.go = true; }
      if (w.showT > 1.2 && !w.pot && !w.packets.length) w.showT = Math.max(w.showT, 2.4);
      if (w.showT > 3.6) { w.phase = 'sweep'; w.showT = 0; for (const c of w.cards) { c.fd = -1; send(c, MUCK[0] + (rnd() - 0.5) * 3 * u, MUCK[1] + (rnd() - 0.5) * 2 * u, 3, (rnd() - 0.5) * 0.6); } }
    } else if (w.phase === 'sweep') { w.showT += dt; if (w.showT > 1.3) newHand(); }
    if (w.pot) { slide(w.pot, dt); if (w.pot.go && Math.hypot(w.pot.vx, w.pot.vy) < 0.01 * N) { w.seats[w.winner].n += w.pot.n; w.pot = null; if (w.phase === 'show') w.showT = Math.max(w.showT, 2.4); } }
    // the players: one leaving goes out with their stack, a new one comes in with theirs; the tells and riffles run down
    for (const q of w.seats) {
      q.tw -= dt; q.rif -= dt; q.glint -= dt;
      if (q.leave >= 0) {
        q.leave += dt;
        if (q.leave < 1.2) q.d = ease(q.leave / 1.2) * 0.3 * N;
        else if (q.leave < 1.25) Object.assign(q, pokerSeat(rnd, w.kind), { leave: 1.25, d: 0.3 * N, out: true });
        else { q.d = (1 - ease((q.leave - 1.25) / 1.2)) * 0.3 * N; if (q.leave > 2.45) { q.leave = -1; q.d = 0; } }
      }
    }

    // the room, the lamp's pool, the rail and the felt, the betting line, the dealer's button
    r.fill(DARK + DIM);
    const rw = 0.035 * N;
    r.ring(cx, cy, (RX + rw) / 2, RX + rw, home ? MID : DARK, (RY + rw) / (RX + rw));
    if (home) for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; r.line(cx + Math.cos(a) * (RX + 2), cy + Math.sin(a) * (RY + 2), cx + Math.cos(a) * (RX + rw - 1), cy + Math.sin(a) * (RY + rw - 1), MID + DIM); }
    r.ring(cx, cy, RX / 2, RX, BG, RY / RX);
    if (!home) oval(r, cx, cy, RX * 0.78, RY * 0.74, Math.max(1, u), LMID + DIM, 40);
    if (w.kind === 'tourney') oval(r, cx, cy, RX * 0.93, RY * 0.92, Math.max(1, 0.8 * u), BG + DIM, 40);
    for (let j = 0; j < 5; j++) { const [x, y] = boardAt(j); r.frame(Math.round(x - cw - u), Math.round(y - ch - u), Math.round(2 * cw + 2 * u), Math.round(2 * ch + 2 * u), BG + DIM); }
    const [bx, by] = at(w.button, 0.42, 4 * u);
    r.disc(bx + 6 * u, by, 2 * u, BRIGHT); r.ring(bx + 6 * u, by, 1.2 * u, Math.max(1, 0.6 * u), DARK);
    // the deck at the button while there is dealing to do
    if (w.phase === 'deal') { const [dx, dy] = at(w.button, 0.42); for (let k = 0; k < 3; k++) card(r, dx - k * 0.4 * u, dy - k * 0.5 * u, cw, ch, 0, 1, false, 0, 0, u); }
    // the stacks (a riffle runs up one with a tell), the pot, the chips sliding in with the hand that pushed them
    w.seats.forEach((q, i) => {
      const [x, y] = at(i, 0.8, q.d), p = 1 - q.rif / 0.6;
      if (q.n > 0) stack(r, x, y, 2.4 * u, Math.min(q.n, 18), q.val, u, 0, 0, q.rif > 0 ? (j) => { const z = p * (Math.min(q.n, 18) + 3) - j; return z > 0 && z < 1 ? 1.8 * u * Math.sin(Math.PI * z) : 0; } : null);
      if (q.n > 18) stack(r, x + 5 * u, y + u, 2.4 * u, Math.min(q.n - 18, 18), (q.val + 2) % 5, u);
      if (q.glint > 0 && q.n > 0) r.set(x - u, y - Math.min(q.n, 18) * 0.8 * u - u, WHITE);
    });
    if (w.pot) { const P = w.pot; for (let k = 0, left = P.n; left > 0; k++) { const m = Math.min(8, left); stack(r, P.x + ((k % 3) - 1) * 4.5 * u, P.y + Math.floor(k / 3) * 2.5 * u, 2.2 * u, m, (P.val + k) % 5, u); left -= m; } if (P.go) targets.push({ x: P.x - 6 * u, y: P.y - 8 * u, w: 12 * u, h: 12 * u }); }
    for (const pk of w.packets) {
      stack(r, pk.x, pk.y, 2.2 * u, pk.n, pk.val, u);
      if (pk.t < 0.3) { const th = pokerTh(pk.from); handTop(r, pk.x + Math.cos(th) * 4.5 * u, pk.y + Math.sin(th) * 3.5 * u, 4 * u, th + Math.PI, LMID); }
      targets.push({ x: pk.x - 3 * u, y: pk.y - 4 * u, w: 6 * u, h: 6 * u });
    }
    // the cards, the players over their edge of the table with their hands by their cards (twitching with a tell)
    for (const c of w.cards) {
      const q = c.own < 5 ? w.seats[c.own] : null, tw = q && q.tw > 0 ? q.tw / 0.35 : 0, faceUp = c.flip < 0.5 ? !c.up : c.up;
      card(r, c.x + tw * Math.sin(t * 70) * 0.6 * u, c.y + tw * Math.cos(t * 55) * 0.5 * u, cw, ch, c.a + tw * 0.12 * Math.sin(t * 60), Math.abs(1 - 2 * c.flip), faceUp, c.suit, c.rank, u);
      if (c.flip < 1) targets.push({ x: c.x - ch, y: c.y - ch, w: 2 * ch, h: 2 * ch });
    }
    w.seats.forEach((q, i) => {
      const th = pokerTh(i), [x, y] = at(i, 1.2, q.d), bob = Math.sin(f.rel.bassClock * 2 + i) * 0.4 * u, hx = x + Math.cos(th) * bob, hy = y + Math.sin(th) * bob;
      if (q.d < 0.05 * N) for (const sd of [-1, 1]) {
        const tw = q.tw > 0 ? (q.tw / 0.35) * Math.sin(t * 60 + sd) * 0.6 * u : 0, [ax, ay] = at(i, 0.88), ex = ax + Math.cos(th + Math.PI / 2) * sd * 4.5 * u + tw, ey = ay + Math.sin(th + Math.PI / 2) * sd * 4.5 * u;
        r.stroke(hx + Math.cos(th + Math.PI / 2) * sd * 4.5 * u, hy + Math.sin(th + Math.PI / 2) * sd * 4.5 * u, ex, ey, 2 * u, q.col);
        r.disc(ex, ey, 1.4 * u, LMID);
      }
      sitter(r, hx, hy, th, u, q.col, q.hat);
    });
  },
};

const WORLDS = { dealer, riffle, chips, suits, roulette, slots, dice, houseofcards, magician, cardthrow, marquee, poker };
registerFamily('casino', WORLD_DEFS, WORLDS);
export const CASINO_STYLE = makeMixStyle('CASINO', ['casino']);
