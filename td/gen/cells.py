# Cellular automata and growth rules: a rule over a grid of cells, each element its own rule and its own part of the music.
#   cell_rows     an elementary automaton, a row every sixteenth out of the middle; the key picks the rule
#   cell_brain    Brian's Brain, kept alight by the treble
#   cell_ant      a four-colour Langton's ant, more steps the busier the music
#   cell_gray     Gray-Scott reaction-diffusion, run by the bass, spots or worms by the arousal
#   cell_sand     the abelian sandpile, a heap on every beat as big as the kicks
#   cell_fire     a forest fire along the foot, struck on the backbeat, growing with the mids
#   cell_frost    diffusion-limited aggregation hanging from the top, as many walkers as there is top end
#   cell_cyclic   a cyclic automaton of twelve states, one a note: the spirals light where the chroma sounds
#   cell_wire     Wireworld: ten lanes, one a band, a pulse out from the middle when the band stands out
#   cell_perc     percolation: a flood through a new maze every bar, getting across only when the level is up
#   cell_crystal  a snowflake on a hexagonal grid, a ring every half beat; the key picks the rule
#   cell_vote     twisted majority vote, the bass and the treble each dropping blobs of their side
#   cell_slime    slime mould agents following their own trail, moved by the mids, spread by the brightness
#   cell_bloom    a continuous automaton in the manner of Lenia, its growth window moved by the mood
#   cell_quilt    Fredkin's parity rule, a generation a beat, a new seed from the notes when it has cancelled out
#   cell_dune     falling sand in ten columns, one a band, poured while there are hats
#   cell_gas      a lattice gas, a dense puff on every beat as hard as the kicks
#   cell_clones   a colony from twelve founders, one a note, the loud notes taking the dish

_CELL_RULES = (30, 54, 60, 62, 86, 90, 102, 110, 122, 126, 150, 182)  # one a key, all of them leave an empty row empty
_CELL_BORN = ((1,), (1, 3), (1, 4), (1, 3, 4), (1, 5), (1, 3, 5))  # a snowflake's neighbour counts that freeze a cell


def _cell_big(a):
    # a small grid at the picture's size
    return a[np.arange(N) * a.shape[0] // N][:, np.arange(N) * a.shape[1] // N]


def _cell_nb(c):
    # how many of the eight neighbours are on, on a grid that wraps
    c = c.astype(np.uint8)
    r = c + np.roll(c, 1, 0) + np.roll(c, -1, 0)
    return r + np.roll(r, 1, 1) + np.roll(r, -1, 1) - c


@gen('cell_rows', 'mysterious', 'focused', 'tense', whole=False)
def _cell_rows(img, m, dt, size, hot, other):
    own, rng = S['own'], S['rng']
    g = N // 2
    if 'row' not in own:
        row = np.zeros(g, np.int64)
        row[g // 2] = 1
        own.update(row=row, rows=np.zeros((g, g), np.float32))
    if _tick('step', m, 4):
        r = own['row']
        rule = _CELL_RULES[max(0, int(_v('key/root', 0))) % 12]
        r = (rule >> (4 * np.roll(r, 1) + 2 * r + np.roll(r, -1))) & 1
        if not 2 < r.sum() < g - 2:  # it died out or filled up
            r = (rng.random(g) < 0.3).astype(np.int64)
        own['row'] = r
        own['rows'] = np.roll(own['rows'], 1, 0)
        own['rows'][0] = r
    d = (np.abs(_Y[:, 0] - N / 2) / 2).astype(int)  # the rows go out up and down from the middle
    fade = np.clip(1 - d / min(g / 2, 22 * size), 0, 1)
    _shade(img, own['rows'][d][:, np.arange(N) * g // N] * fade[:, None], hot, other)


@gen('cell_brain', 'tense', 'aggressive', 'mysterious', whole=True)
def _cell_brain(img, m, dt, size, hot, other):
    # a cell fires if exactly two neighbours fire, then rests a step; with no treble the fire is let die down
    own, rng = S['own'], S['rng']
    g = N // 2
    if 'on' not in own:
        own.update(on=rng.random((g, g)) < 0.2, rest=np.zeros((g, g), bool), glow=np.zeros((g, g), np.float32))
    treb = min(1.0, m['drive/treb'])
    if _tick('brain', m, 4):
        on, rest = own['on'], own['rest']
        new = (_cell_nb(on) == 2) & ~on & ~rest & (rng.random((g, g)) > 0.2 * (1 - treb))
        k = int(30 * treb * treb)
        new[rng.integers(0, g, k), rng.integers(0, g, k)] = True
        own['on'], own['rest'] = new, on
    own['glow'] *= math.exp(-dt / 0.12)
    own['glow'][own['glow'] < 0.1] = 0
    own['glow'] = np.maximum(own['glow'], own['rest'] * np.float32(0.4))
    _shade(img, _cell_big(np.maximum(own['glow'], own['on'])), hot, other)


@gen('cell_ant', 'focused', 'mysterious', 'calm', whole=False)
def _cell_ant(img, m, dt, size, hot, other):
    # an ant turning left, left, right, right on the four colours it paints; it steps more the busier the music
    own = S['own']
    g = N // 2
    if 'grid' not in own:
        own.update(grid=np.zeros((g, g), np.uint8), ant=[g // 2, g // 2, 0])
    grid, ant = own['grid'], own['ant']
    if _tick('step', m, 4):
        x, y, d = ant
        for _ in range(12 + int(90 * min(1.0, 6 * m['busy']))):
            c = int(grid[y, x])
            d = (d + (1 if c < 2 else -1)) % 4
            grid[y, x] = (c + 1) % 4
            x, y = (x + (1, 0, -1, 0)[d]) % g, (y + (0, 1, 0, -1)[d]) % g
        ant[:] = x, y, d
        if max(abs(x - g // 2), abs(y - g // 2)) > min(g // 2 - 2, 20 * size):  # it has come to the edge: over
            grid[:] = 0
            ant[:] = g // 2, g // 2, 0
    buf = np.array((0, 0.25, 0.5, 0.8), np.float32)[grid]
    buf[ant[1], ant[0]] = 1.0
    _shade(img, _cell_big(buf), hot, other)


def _cell_drop(uv, rng):
    # a drop of the second chemical
    x, y = rng.integers(2, uv.shape[2] - 6, 2)
    uv[0, y:y + 4, x:x + 4] = 0.5
    uv[1, y:y + 4, x:x + 4] = 0.25


@gen('cell_gray', 'dreamy', 'mysterious', 'melancholic', whole=True)
def _cell_gray(img, m, dt, size, hot, other):
    # Gray-Scott: two chemicals feeding on each other; the bass runs the reaction, the arousal turns spots into worms
    own, rng = S['own'], S['rng']
    g = N // 2
    if 'uv' not in own:
        uv = np.zeros((2, g, g), np.float32)
        uv[0] = 1
        for _ in range(14):
            _cell_drop(uv, rng)
        own.update(uv=uv, acc=0.0)
    uv = own['uv']
    if _tick('gray', m, 0.25):
        _cell_drop(uv, rng)
    feed, kill = 0.03 + 0.03 * min(1.0, _v('mood/arousal', 0.5)), np.float32(0.0625)
    own['acc'] = min(12.0, own['acc'] + dt * (120 + 420 * m['drive/bass']))
    d = np.array((0.16, 0.08), np.float32)[:, None, None]
    for _ in range(int(own['acc'])):
        own['acc'] -= 1
        lap = np.roll(uv, 1, 1) + np.roll(uv, -1, 1) + np.roll(uv, 1, 2) + np.roll(uv, -1, 2) - 4 * uv
        r = uv[0] * uv[1] * uv[1]
        uv += d * lap
        uv[0] += np.float32(feed) * (1 - uv[0]) - r
        uv[1] += r - np.float32(feed + kill) * uv[1]
    _shade(img, _cell_big(np.clip(uv[1] * 4 - 0.5, 0, 1)), hot, other)


@gen('cell_sand', 'focused', 'calm', 'drop', whole=False)
def _cell_sand(img, m, dt, size, hot, other):
    # a cell with four grains gives one to each neighbour; on the beat a heap goes on the middle, as big as the kicks are
    own = S['own']
    g, c = 63, 31
    if 'h' not in own:
        h = np.zeros((g, g), np.int32)
        h[c, c] = 6000
        at = np.arange(g) - c
        own.update(h=h, dish=np.hypot(at[:, None], at[None, :]) < min(c - 1, 22 * size))
    h = own['h']
    strength = _recent('kicks', max(m['hit/kick'], 0.8 * m['hit/bass']), m, dt)
    if _tick('sand', m):
        h[c, c] += 100 + int(900 * max(strength, 0.4 * m['drive/bass']))
    for _ in range(min(40, max(4, int(dt * 800)))):
        t = h >> 2
        h &= 3
        h[1:] += t[:-1]
        h[:-1] += t[1:]
        h[:, 1:] += t[:, :-1]
        h[:, :-1] += t[:, 1:]
        h *= own['dish']
    _shade(img, _cell_big(np.array((0, 0.28, 0.55, 0.85, 1), np.float32)[np.minimum(h, 4)]), hot, other)


@gen('cell_fire', 'aggressive', 'tense', 'drop', whole=False)
def _cell_fire(img, m, dt, size, hot, other):
    # trees grow with the mids along the foot of the picture, a strike on the backbeat while snares are heard, flames rise
    own, rng = S['own'], S['rng']
    g = N // 2
    if 'wood' not in own:
        h = int(g * min(0.6, 0.34 * size))
        own.update(wood=rng.random((h, g)) < 0.6, fire=np.zeros((h, g), bool), flame=np.zeros((N, N), np.float32))
    wood, fire, flame = own['wood'], own['fire'], own['flame']
    strength = _recent('snares', max(m['hit/snare'], 0.7 * m['hit/hat']), m, dt)
    strike = _tick('strike', m)
    strike = strike and (int(m['beat/count']) % 2 == 1 and strength > 0.3 if _locked(m) else S['rng'].random() < 0.35)
    if strike and wood.any():
        at = rng.choice(np.flatnonzero(wood), 3)
        fire.flat[at] = True
    if _tick('step', m, 8):
        near = np.roll(fire, 1, 1) | np.roll(fire, -1, 1)
        near[1:] |= fire[:-1]
        near[:-1] |= fire[1:]
        new = wood & near
        wood &= ~new
        wood |= (rng.random(wood.shape) < 0.002 + 0.03 * _v('drive/mid', 0.4)) & ~new
        own['fire'] = fire = new
    h = wood.shape[0]
    flame[1:] = flame[:-1] * math.exp(-dt / 0.2)
    flame[0] = 0
    flame[flame < 0.08] = 0
    ys, xs = np.nonzero(fire)
    _plot(flame, 2 * xs.astype(np.float32), 2 * ys.astype(np.float32), np.float32(1.0))
    buf = flame.copy()
    buf[:2 * h] = np.maximum(buf[:2 * h], wood.repeat(2, 0)[:, np.arange(N) * g // N] * np.float32(0.24))
    _shade(img, buf, hot, other)


@gen('cell_frost', 'melancholic', 'calm', 'dreamy', whole=False)
def _cell_frost(img, m, dt, size, hot, other):
    # walkers wander until they touch the frost hanging from the top and stick; the more top end, the more of them walk
    own, rng = S['own'], S['rng']
    if 'ice' not in own:
        ice = np.zeros((N, N), bool)
        ice[N - 1, rng.integers(0, N, 7)] = True
        near = ice.copy()
        near[N - 2] = ice[N - 1] | np.roll(ice[N - 1], 1) | np.roll(ice[N - 1], -1)
        own.update(ice=ice, near=near, glow=np.zeros((N, N), np.float32), low=N - 1, gone=1.0,
                   p=np.stack([rng.integers(0, N, 140), rng.integers(N - 12, N, 140)], 1))
    ice, near, p = own['ice'], own['near'], own['p']
    n = int(20 + 120 * min(1.0, m['high']))
    if own['low'] < N * (1 - min(0.8, 0.55 * size)):  # it has come down far enough: it melts and starts over
        own['gone'] -= dt / (4 * _beat(m))
        if own['gone'] <= 0:
            S['own'] = dict()
            return
    for _ in range(4):
        w = p[:n]
        d = rng.integers(0, 5, n)  # a little more often up, towards the frost
        w[:, 0] = (w[:, 0] + (d == 0) - (d == 1)) % N
        w[:, 1] = np.minimum(N - 1, w[:, 1] + (d >= 3) - (d == 2))
        out = w[:, 1] < own['low'] - 12
        w[out, 1] = own['low'] - 6
        w[out, 0] = rng.integers(0, N, int(out.sum()))
        hit = near[w[:, 1], w[:, 0]] & ~ice[w[:, 1], w[:, 0]]
        if hit.any():
            xs, ys = w[hit, 0], w[hit, 1]
            ice[ys, xs] = True
            own['glow'][ys, xs] = 1.0
            own['low'] = min(own['low'], int(ys.min()))
            for a in (-1, 0, 1):
                for b in (-1, 0, 1):
                    near[np.clip(ys + a, 0, N - 1), (xs + b) % N] = True
            w[hit, 1] = own['low'] - 6
            w[hit, 0] = rng.integers(0, N, int(hit.sum()))
    own['glow'] *= math.exp(-dt / 0.5)
    buf = np.maximum(ice * np.float32(0.45), own['glow'])
    _plot(buf, p[:n, 0].astype(np.float32), p[:n, 1].astype(np.float32), np.float32(0.2))
    _shade(img, buf * own['gone'], hot, other)


@gen('cell_cyclic', 'euphoric', 'mysterious', 'happy', whole=True)
def _cell_cyclic(img, m, dt, size, hot, other):
    # twelve states in a ring, a cell moves on when a neighbour is one ahead; three steps a beat take every cell round in a
    # bar. Each state is a note, and it lights as that note sounds
    own, rng = S['own'], S['rng']
    g = N // 2

    def step(s):
        up = (s + 1) % 12
        ahead = (np.roll(s, 1, 0) == up) | (np.roll(s, -1, 0) == up) | (np.roll(s, 1, 1) == up) | (np.roll(s, -1, 1) == up)
        return np.where(ahead, up, s)

    if 's' not in own:
        s = rng.integers(0, 12, (g, g)).astype(np.int8)
        for _ in range(160):  # past the noise, to where the spirals have taken over
            s = step(s)
        own['s'] = s
    if _tick('cyclic', m, 3):
        own['s'] = step(own['s'])
    c = np.array([_v('chroma/%d' % k) for k in range(12)], np.float32)
    c = np.clip((c - c.mean()) / max(float(c.max() - c.mean()), 1e-3), 0, 1)
    if not c.any():
        c = (np.arange(12) % 4 == 0).astype(np.float32)
    _shade(img, _cell_big(c[own['s']]), hot, other)


def _cell_circuit(rng, g):
    # ten lanes out of the middle to both sides, one cell a column so that they jog at 45 degrees; most fork once
    half = g // 2
    w = np.zeros((g, half), bool)
    for k in range(10):
        y, o, b, fork = 3 + 6 * k, 0, None, int(rng.integers(5, 20))
        for x in range(half):
            if x and rng.random() < 0.2 and b is None:
                o = int(np.clip(o + rng.choice((-1, 1)), -2, 2))
            w[y + o, x] = True
            if x == fork:
                b, end = (1 if o <= 0 else -1), x + int(rng.integers(5, 14))
                side, b = b, o + b
            elif b is not None and x < end:
                b = b + side if abs(b - o) < 2 else b
                w[y + b, x] = True
    return np.concatenate([w[:, ::-1], w], 1)


@gen('cell_wire', 'focused', 'tense', 'happy', whole=True)
def _cell_wire(img, m, dt, size, hot, other):
    # Wireworld: a pulse runs a wire, head then tail. Each lane is a band, and it fires when that band stands out
    own, rng = S['own'], S['rng']
    g = N // 2
    if 'w' not in own:
        z = np.zeros((g, 2 * (g // 2)), bool)
        own.update(w=_cell_circuit(rng, g), head=z, tail=z.copy(), glow=z.astype(np.float32))
    w = own['w']
    b = _bands()
    if _tick('pulse', m, 2):
        lanes = 3 + 6 * np.flatnonzero(b > max(0.15, 0.6 * float(b.max())))
        own['head'][lanes, g // 2 - 1] = True
        own['head'][lanes, g // 2] = True
    if _tick('wire', m, 8):
        head = own['head']
        n = _cell_nb(head)
        own['head'], own['tail'] = w & ~head & ~own['tail'] & ((n == 1) | (n == 2)), head
    own['glow'] *= math.exp(-dt / 0.12)
    own['glow'][own['glow'] < 0.15] = 0
    own['glow'] = np.maximum(own['glow'], own['head'])
    _shade(img, _cell_big(np.maximum(own['glow'], w * np.float32(0.13))), hot, other)


@gen('cell_perc', 'melancholic', 'tense', 'mysterious', whole=False)
def _cell_perc(img, m, dt, size, hot, other):
    # a flood from the left edge through a maze, a new maze every bar; cells are open by a chance that follows the level, and
    # it only gets across above the critical 0.59
    own, rng = S['own'], S['rng']
    g = N // 2
    if 'rock' not in own:
        own.update(rock=rng.random((g, g)).astype(np.float32), wet=np.zeros((g, g), bool), p=0.58,
                   old=np.zeros((g, g), np.float32), front=np.zeros((g, g), np.float32))
    own['p'] += (0.5 + 0.13 * min(1.0, m['level']) - own['p']) * min(1.0, 3 * dt)
    if _tick('perc', m, 0.25):
        own['rock'] = rng.random((g, g)).astype(np.float32)
        own['old'] = np.maximum(own['old'], own['wet'] * np.float32(0.4))
        own['wet'] = np.zeros((g, g), bool)
    wet, way = own['wet'], own['rock'] < own['p']
    wet[:, 0] = True
    was = wet
    for _ in range(max(1, int(dt * 130))):
        n = wet.copy()
        n[1:] |= wet[:-1]
        n[:-1] |= wet[1:]
        n[:, 1:] |= wet[:, :-1]
        n[:, :-1] |= wet[:, 1:]
        wet = n & way
    own['wet'] = wet
    own['front'] *= math.exp(-dt / 0.25)
    own['front'] = np.maximum(own['front'], wet & ~was)
    own['old'] *= math.exp(-dt / 0.5)
    own['old'][own['old'] < 0.05] = 0
    _shade(img, _cell_big(np.maximum(np.maximum(wet * np.float32(0.4), own['old']), own['front'])), hot, other)


def _cell_flake(born, reach):
    # a whole snowflake on a hexagonal grid as the generation each cell freezes in: an empty cell freezes on these counts
    g = 2 * reach + 3
    ice = np.zeros((g, g), bool)
    ice[g // 2, g // 2] = True
    age = np.full((g, g), 1e6, np.float32)
    age[g // 2, g // 2] = 0
    for k in range(1, reach + 1):
        i = ice.astype(np.uint8)
        n = sum(np.roll(np.roll(i, a, 0), b, 1) for a, b in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, -1), (-1, 1)))
        new = np.isin(n, born) & ~ice
        ice |= new
        age[new] = k
    return age


@gen('cell_crystal', 'calm', 'dreamy', 'happy', 'melancholic', whole=False)
def _cell_crystal(img, m, dt, size, hot, other):
    # a snowflake growing a ring every half beat and melting back twice as fast; the key picks the next one's rule
    own = S['own']
    if 'age' not in own:
        reach = int(min(26, 21 * size))
        r = (_Y - N / 2) / (2.3 * 0.866)
        q = (_X - N / 2) / 2.3 - r / 2
        own.update(age=_cell_flake(_CELL_BORN[max(0, int(_v('key/root', 0))) % 6], reach), gen=0, way=1, reach=reach,
                   iy=np.clip(np.rint(r).astype(int) + reach + 1, 0, 2 * reach + 2),
                   ix=np.clip(np.rint(q).astype(int) + reach + 1, 0, 2 * reach + 2))
    if _tick('crystal', m, 2):
        own['gen'] += own['way']
        if own['gen'] >= own['reach']:
            own['way'] = -2
        elif own['gen'] <= 0:
            own['age'], own['way'] = _cell_flake(_CELL_BORN[max(0, int(_v('key/root', 0))) % 6], own['reach']), 1
    back = own['gen'] - own['age']
    a = np.where(back >= 0, 0.35 + 0.65 * np.clip(1 - back / 7, 0, 1), 0).astype(np.float32)
    _shade(img, a[own['iy'], own['ix']], hot, other)


@gen('cell_vote', 'focused', 'melancholic', 'calm', whole=True)
def _cell_vote(img, m, dt, size, hot, other):
    # each cell takes the side of the majority round it, twisted at the close calls so that the borders creep; every beat the
    # bass or the treble, whichever is ahead, drops a blob of its side
    own, rng = S['own'], S['rng']
    g = N // 2
    if 'v' not in own:
        own['v'] = _cell_big(rng.random((12, 12)) < 0.5)[:g, :g]
    v = own['v']
    if _tick('blob', m):
        bass, treb = m['drive/bass'], m['drive/treb']
        side = rng.random() < 0.5 + bass - treb + 3 * (0.5 - float(v.mean()))
        at = np.arange(g, dtype=np.float32)
        x, y = rng.uniform(0, g, 2)
        v[np.hypot(at[:, None] - y, at[None, :] - x) < 3 + 7 * max(bass, treb)] = side
    if _tick('vote', m, 4):
        n = _cell_nb(v) + v
        own['v'] = v = (n > 5) | (n == 4)
    _shade(img, _cell_big(np.where(_cell_nb(v) < 8, 1.0, 0.28).astype(np.float32) * v), hot, other)


@gen('cell_slime', 'dreamy', 'mysterious', 'calm', whole=False)
def _cell_slime(img, m, dt, size, hot, other):
    # agents that smell left, ahead and right on their own trail and turn to the strongest: it draws itself into veins. The
    # mid clock moves them, the brightness widens what they smell
    own, rng = S['own'], S['rng']
    if 'x' not in own:
        n = 1800
        own.update(x=rng.uniform(0, N, n).astype(np.float32), y=rng.uniform(0.25 * N, 0.75 * N, n).astype(np.float32),
                   a=rng.uniform(0, 6.28, n).astype(np.float32), f=np.zeros((N, N), np.float32), at=m['clock/mid'])
    x, y, a, f = own['x'], own['y'], own['a'], own['f']
    go = min(3.0, 1.0 + 40 * max(0.0, m['clock/mid'] - own['at']))
    own['at'] = m['clock/mid']
    wide = 0.35 + 0.7 * min(1.0, _v('bright', 0.5))

    def smell(da):
        return f[((y + 7 * np.sin(a + da)).astype(int)) % N, ((x + 7 * np.cos(a + da)).astype(int)) % N]

    left, ahead, right = smell(wide), smell(0), smell(-wide)
    a += np.where((ahead >= left) & (ahead >= right), 0, np.where(left > right, 0.5, -0.5)) + rng.normal(0, 0.08, a.size)
    x[:] = (x + go * np.cos(a)) % N
    y += go * np.sin(a)
    top, foot = N * (0.5 + min(0.48, 0.26 * size)), N * (0.5 - min(0.48, 0.26 * size))
    out = (y > top) | (y < foot)  # the edges of the band turn them back
    a[out] = -a[out]
    y[:] = np.clip(y, foot, top)
    _plot(f, x, y, np.float32(0.35))
    f = (f * 2 + np.roll(f, 1, 0) + np.roll(f, -1, 0) + np.roll(f, 1, 1) + np.roll(f, -1, 1)) / 6 * math.exp(-dt / 0.35)
    own['f'] = f
    _shade(img, np.clip(f * 1.6 - 0.12, 0, 1), hot, other)


@gen('cell_bloom', 'happy', 'dreamy', 'euphoric', whole=False)
def _cell_bloom(img, m, dt, size, hot, other):
    # a continuous automaton: every cell grows when the ring round it holds the right amount; the mood moves that amount
    own, rng = S['own'], S['rng']
    g = 64
    if 'a' not in own:
        at = np.fft.fftfreq(g, 1 / g)
        r = np.hypot(at[:, None], at[None, :]) / 9
        k = np.exp(-((r - 0.5) / 0.15) ** 2 / 2) * (r < 1)
        own.update(a=np.zeros((g, g), np.float32), k=np.fft.rfft2(k / k.sum()))
    a = own['a']
    if _tick('bloom', m, 0.25) or float(a.mean()) < 0.01:
        x, y = rng.integers(8, g - 24, 2)
        a[y:y + 16, x:x + 16] = rng.random((16, 16))
    u = np.fft.irfft2(np.fft.rfft2(a) * own['k'], (g, g))
    mu = 0.14 + 0.03 * (min(1.0, _v('mood/valence', 0.5)) - 0.5)
    a = np.clip(a + 0.1 * (2 * np.exp(-((u - mu) / 0.018) ** 2 / 2) - 1), 0, 1).astype(np.float32)
    own['a'] = a
    _shade(img, _cell_big(np.where(a > 0.1, a, 0)), hot, other)


@gen('cell_quilt', 'euphoric', 'happy', 'focused', 'drop', whole=True)
def _cell_quilt(img, m, dt, size, hot, other):
    # each cell is the sum of its four neighbours, odd or even: a seed comes back in copies at the powers of two, and after
    # 32 generations, one a beat, the grid has cancelled out and the notes sounding give a new seed
    own = S['own']
    g = 32
    if 'c' not in own:
        own.update(c=np.zeros((g, g), bool), glow=np.zeros((g, g), np.float32))
    c = own['c']
    if _tick('quilt', m):
        c = np.roll(c, 1, 0) ^ np.roll(c, -1, 0) ^ np.roll(c, 1, 1) ^ np.roll(c, -1, 1)
        if not c.any():
            notes = np.argsort([-_v('chroma/%d' % k) for k in range(12)])[:4]
            for k in notes:
                x, y = 1 + int(k) % 4, 1 + int(k) // 4
                for a, b in ((x, y), (-x, y), (x, -y), (-x, -y)):
                    c[g // 2 + b, g // 2 + a] ^= True
        own['c'] = c
    own['glow'] *= math.exp(-dt / (0.5 * _beat(m)))
    own['glow'][own['glow'] < 0.12] = 0
    own['glow'] = np.maximum(own['glow'], c)
    _shade(img, _cell_big(own['glow']), hot, other)


@gen('cell_dune', 'calm', 'melancholic', 'happy', whole=False)
def _cell_dune(img, m, dt, size, hot, other):
    # falling sand: a grain drops if it can, else slides off the side. Ten columns are poured by their bands while there are
    # hats, and the heaps sink when they get high
    own, rng = S['own'], S['rng']
    g = N // 2
    if 's' not in own:
        own.update(s=np.zeros((g, g), bool), side=1, fall=np.zeros((g, g), bool))
    s = own['s']
    strength = _recent('hats', m['hit/hat'], m, dt)
    if _tick('pour', m, 4):
        b = _bands()[np.minimum(9, np.arange(g) * 10 // g)]
        s[int(g * 0.8)] |= rng.random(g) < b * b * (0.15 + 0.9 * max(strength, 0.6 * m['drive/treb']))
    if _tick('dune', m, 8):
        for _ in range(2):
            fall = s[1:] & ~s[:-1]
            s[:-1] |= fall
            s[1:] ^= fall
            own['side'] = d = -own['side']
            r = np.roll(s, -d, 1)
            slide = s[1:] & s[:-1] & ~r[:-1] & ~r[1:] & (rng.random((g - 1, g)) < 0.7)
            s[1:] ^= slide
            s[:-1] |= np.roll(slide, d, 1)
        own['fall'][:-1] = fall
        if s[int(g * min(0.6, 0.36 * size))].mean() > 0.15:
            s[:-1] = s[1:].copy()
            s[-1] = False
    y = np.arange(g, dtype=np.float32)[:, None] / g
    top = s & ~np.roll(s, -1, 0)
    _shade(img, _cell_big(np.maximum(s * (0.12 + 0.6 * y), np.maximum(top * np.float32(0.6), own['fall'] & s))), hot, other)


@gen('cell_gas', 'aggressive', 'euphoric', 'tense', 'drop', whole=False)
def _cell_gas(img, m, dt, size, hot, other):
    # particles on a grid go north, south, east or west, and two meeting head on leave at right angles. A dense puff on the
    # beat, as big as the kicks are, rings out in square waves
    own, rng = S['own'], S['rng']
    g = N // 2
    if 'c' not in own:
        own.update(c=rng.random((4, g, g)) < 0.03, acc=0.0)
    c = own['c']
    strength = _recent('kicks', max(m['hit/kick'], 0.8 * m['hit/bass']), m, dt)
    if _tick('gas', m):
        at = np.arange(g, dtype=np.float32)
        x, y = rng.uniform(0.2 * g, 0.8 * g, 2)
        ball = np.hypot(at[:, None] - y, at[None, :] - x) < (3 + 6 * max(strength, 0.5 * m['level'])) * size
        c |= ball & (rng.random((4, g, g)) < 0.9)
    own['acc'] = min(3.0, own['acc'] + dt * 40)
    for _ in range(int(own['acc'])):
        own['acc'] -= 1
        e, n, w, s = c
        c = c ^ ((e & w & ~n & ~s) | (n & s & ~e & ~w))
        c = np.stack([np.roll(c[0], 1, 1), np.roll(c[1], 1, 0), np.roll(c[2], -1, 1), np.roll(c[3], -1, 0)])
        c &= rng.random((4, g, g)) > 0.012
    own['c'] = c
    d = c.sum(0, dtype=np.float32)
    d = d + np.roll(d, 1, 0) + np.roll(d, -1, 0)
    d = d + np.roll(d, 1, 1) + np.roll(d, -1, 1)
    _shade(img, _cell_big(np.clip(d / 9 * 0.8 - 0.32, 0, 1)), hot, other)


@gen('cell_clones', 'happy', 'dreamy', 'euphoric', whole=False)
def _cell_clones(img, m, dt, size, hot, other):
    # a colony spreads from twelve founders, one a note: a cell takes the clone of a neighbour, faster the louder its note,
    # so the notes of the music win sectors of the dish. Behind the rim it dies, and when it has all gone it starts over
    own, rng = S['own'], S['rng']
    g = N // 2
    if 'lab' not in own:
        at = np.arange(g) - g / 2 + 0.5
        lab = np.full((g, g), -1, np.int8)
        r, a = np.hypot(at[:, None], at[None, :]), np.arctan2(at[:, None], at[None, :])
        lab[r < 3] = (((a[r < 3] + math.pi) / (2 * math.pi) * 12).astype(np.int8)) % 12
        own.update(lab=lab, born=np.zeros((g, g), np.float32), n=0, dish=r < min(g / 2 - 1, 23 * size))
    lab = own['lab']
    c = np.array([_v('chroma/%d' % k) for k in range(12)], np.float32)
    c = np.clip(c / max(float(c.max()), 1e-3), 0, 1)
    if _tick('clones', m, 4):
        own['n'] += 1
        pick = rng.integers(0, 4, (1, g, g))
        near = np.stack([np.roll(lab, 1, 0), np.roll(lab, -1, 0), np.roll(lab, 1, 1), np.roll(lab, -1, 1)])
        near = np.take_along_axis(near, pick, 0)[0]
        new = (lab == -1) & (near >= 0) & own['dish'] & (rng.random((g, g)) < 0.15 + 0.85 * c[np.maximum(near, 0)] ** 2)
        lab[new] = near[new]
        own['born'][new] = own['n']
        lab[(lab >= 0) & (own['n'] - own['born'] > 36)] = -2
        if not (lab >= 0).any():
            S['own'] = dict()
            return
    light = (0.15 + 0.85 * c[np.maximum(lab, 0)]) * (lab >= 0)
    _shade(img, _cell_big(light.astype(np.float32)), hot, other)
