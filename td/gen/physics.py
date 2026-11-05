# Simulated physics. Each element is a small simulation of its own, and answers its own part of the music:
#   phys_pendulum  a double pendulum held at the level's energy, from a quiet swing to tumbling over the top
#   phys_cradle    a cradle of balls: the end ball strikes on every beat, two go out when the kicks are hard
#   phys_harp      twelve strings, one a note, plucked on the eighths as they sound; the brightness gives overtones
#   phys_chladni   sand on a plate, settling on the nodal lines of the mode the top note picks against the key
#   phys_tank      the wave equation in a walled tank, a drop every sixteenth as the treble allows
#   phys_cloth     a hanging cloth, each of the ten bands a wind on its own strip
#   phys_balls     ten balls bouncing on the beat's divisions, each as high as its band was at take-off
#   phys_gravity   three heavy bodies with dust round them: bass drives their time, density how much dust shows
#   phys_field     field lines of four poles, more of them the brighter the sound, turning with the mids
#   phys_whip      three ropes from a rail that jerks on the backbeat while snares are heard
#   phys_fountain  three jets, their heights the lows, mids and highs, their flow the level, swelling on the beat
#   phys_billiards hard discs on a table, one struck on every bar as hard as the kicks
#   phys_bubbles   bubbles rising and merging, more and bigger with the mids, bursting at the surface
#   phys_sand      grains poured as dense as the music, piling at their angle of repose, in a layer a bar
#   phys_chamber   charged particles spiralling in a field from a vertex on the eighths: hats make them, treble bends them
#   phys_pendwave  twenty pendulums of even steps of frequency, realigning every eight bars
#   phys_mesh      a sheet of springs, struck on every beat by the kicks, the shock running through it
#   phys_tube      a piston driving sound down a closed tube as hard as the bass: compression you can see

_PHYS_MODES = ((1, 2), (2, 3), (1, 4), (3, 4), (2, 5), (1, 3), (3, 5), (4, 5), (2, 7), (1, 5), (3, 7), (4, 7))


def _phys_fade(dt, tau):
    # the trail fades, and what is left of it goes dark for good
    _trail(dt, tau)
    S['trail'][S['trail'] < 0.012] = 0


def _phys_line(buf, x0, y0, x1, y1, w):
    # straight lines between points (scalars or arrays of the same length), w along each
    x0, y0, x1, y1 = (np.atleast_1d(np.asarray(a, np.float32)) for a in (x0, y0, x1, y1))
    n = 2 + int(1.3 * float(np.max(np.abs(x1 - x0) + np.abs(y1 - y0))))
    t = np.linspace(0, 1, n, dtype=np.float32)[:, None]
    xs, ys = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
    _plot(buf, xs.ravel(), ys.ravel(), np.broadcast_to(np.float32(w), xs.shape).ravel())


def _phys_disc(buf, x, y, r, w, ry=None):
    # a round ball with a soft edge, an ellipse given `ry`
    ry = r if ry is None else ry
    x0, x1 = max(0, int(x - r - 2)), min(N, int(x + r + 3))
    y0, y1 = max(0, int(y - ry - 2)), min(N, int(y + ry + 3))
    if x0 < x1 and y0 < y1:
        d = np.hypot((_X[y0:y1, x0:x1] - x) / r, (_Y[y0:y1, x0:x1] - y) / ry)
        buf[y0:y1, x0:x1] += np.clip((1 - d) * min(r, ry) + 0.5, 0, 1) * w


def _phys_grid(buf, p, w, k=4):
    # the lines of a grid of points p (rows x columns x 2), w at each point, k samples a segment
    t = np.linspace(0, 1, k, endpoint=False, dtype=np.float32)[:, None, None]
    for a, b, wa in ((p[:, :-1], p[:, 1:], w[:, :-1]), (p[:-1], p[1:], w[:-1])):
        xs, ys = a[..., 0] + (b[..., 0] - a[..., 0]) * t, a[..., 1] + (b[..., 1] - a[..., 1]) * t
        _plot(buf, xs.ravel(), ys.ravel(), np.broadcast_to(wa, xs.shape).ravel())


@gen('phys_pendulum', 'mysterious', 'tense', 'focused')
def _phys_pendulum(img, m, dt, size, hot, other):
    # two rods, integrated in small steps; the swing's own time follows the tempo, the level is the energy it is held at
    own = S['own']
    _phys_fade(dt, 1.6)
    if 'a' not in own:
        own['a'] = [2.2, 2.7, 0.0, 0.0]
    a, b, wa, wb = own['a']
    g = (2 * math.pi / (0.765 * 4 * _beat(m))) ** 2
    h = min(dt, 0.05) / 8
    for _ in range(8):
        d = a - b
        s, c = math.sin(d), math.cos(d)
        den = 3 - math.cos(2 * d)
        aa = (-3 * g * math.sin(a) - g * math.sin(a - 2 * b) - 2 * s * (wb * wb + wa * wa * c)) / den
        ab = 2 * s * (2 * wa * wa + 2 * g * math.cos(a) + wb * wb * c) / den
        wa, wb = wa + h * aa, wb + h * ab
        a, b = a + h * wa, b + h * wb
    energy = wa * wa + 0.5 * wb * wb + wa * wb * math.cos(a - b) - 2 * g * math.cos(a) - g * math.cos(b)
    want = g * (-2.7 + 6 * min(1.0, m['level']) ** 2)
    f = 1 + max(-1.0, min(1.0, (want - energy) / (2 * g))) * min(dt, 0.05) * 1.2
    wa, wb = wa * f, wb * f
    if energy < want and abs(wa) + abs(wb) < 0.6:  # from rest it needs a push to have anything to scale
        wa += 3 * min(dt, 0.05)
    own['a'] = [a, b, wa, wb]
    L = N * 0.22 * size
    x1, y1 = N / 2 + L * math.sin(a), N / 2 - L * math.cos(a)
    x2, y2 = x1 + L * math.sin(b), y1 - L * math.cos(b)
    lx, ly = own.get('tip', (x2, y2))
    own['tip'] = (x2, y2)
    _phys_line(S['trail'], lx, ly, x2, y2, 0.75)
    buf = 0.8 * S['trail']
    _phys_line(buf, [N / 2, x1], [N / 2, y1], [x1, x2], [y1, y2], 0.6)
    _phys_disc(buf, N / 2, N / 2, 1.5 * size, 0.5)
    _phys_disc(buf, x1, y1, 2.6 * size, 1.0)
    _phys_disc(buf, x2, y2, 3.2 * size, 1.2)
    _shade(img, buf, hot, other)


@gen('phys_cradle', 'calm', 'focused', 'happy')
def _phys_cradle(img, m, dt, size, hot, other):
    # the swing is a half sine of the beat, so the ball lands on it; a glow runs through the row as the blow passes
    own = S['own']
    _phys_fade(dt, 0.12)
    x = _beats(m, 1.6)
    p, side = x % 1.0, int(x) % 2
    kicks = _recent('kicks', max(m['hit/kick'], 0.8 * m['hit/bass']), m, dt)
    lift = max(kicks, 0.2 + 0.55 * m['drive/bass'])
    if _tick('pair', m) or 'out' not in own:  # how many go out is settled as they set off
        own['out'] = 2 if lift > 0.75 else 1
    n, R, L = 5, N * 0.055 * size, N * 0.5 * size
    top = N * 0.5 + L * 0.62
    i = np.arange(n, dtype=np.float32)
    px = N / 2 + (i - (n - 1) / 2) * 2 * R
    ang = np.zeros(n, np.float32)
    swing = (0.2 + 0.36 * min(1.0, lift)) * math.sin(math.pi * p)
    if side:
        ang[n - own['out']:] = swing
    else:
        ang[:own['out']] = -swing
    bx, by = px + L * np.sin(ang), top - L * np.cos(ang)
    buf = np.zeros((N, N), np.float32)
    _phys_line(buf, px[0] - 1.5 * R, top, px[-1] + 1.5 * R, top, 0.6)
    _phys_line(buf, px, np.full(n, top, np.float32), bx, by, 0.4)
    through = (i if side else n - 1 - i) / (n - 1)  # the blow goes from the side that came back to the one going out
    glow = np.exp(-((through - p / 0.14) / 0.3) ** 2) * (0.5 + 0.5 * min(1.0, lift))
    for k in range(n):
        if ang[k] != 0:
            _phys_disc(S['trail'], float(bx[k]), float(by[k]), R, 0.22)
        _phys_disc(buf, float(bx[k]), float(by[k]), R, 0.42 + 0.5 * float(glow[k]))
        _phys_disc(buf, float(bx[k] - 0.3 * R), float(by[k] + 0.3 * R), 0.32 * R, 0.5)
    _shade(img, buf + S['trail'], hot, other)


@gen('phys_harp', 'melancholic', 'calm', 'dreamy')
def _phys_harp(img, m, dt, size, hot, other):
    # twelve fixed strings, their own modes summed; on the eighths the notes that sound are plucked, then ring down
    own = S['own']
    if 'a' not in own:
        own.update(a=np.zeros(12, np.float32), ph=np.zeros(12, np.float32))
    c = _chroma()
    c = c / max(float(c.max()), 1e-3)
    if _tick('pluck', m, 2):
        own['a'] = np.maximum(own['a'], np.where(c > 0.45, c, 0))
    own['a'] *= math.exp(-dt / 0.9)
    k = np.arange(12, dtype=np.float32)
    own['ph'] += dt * 2 * math.pi * (3.0 + 0.25 * k)
    a, ph = own['a'], own['ph']
    over = min(1.0, _v('bright', 0.4))
    x0 = N / 2 + (k - 5.5) * N * 0.072 * min(size, 1.15)
    foot = N * 0.08
    length = N * 0.84 * (1 - 0.5 * k / 11) * min(size, 1.15)
    s = np.linspace(0, 1, 110, dtype=np.float32)[:, None]
    shape = np.sin(math.pi * s) * np.cos(ph)
    shape = shape + 0.6 * over * np.sin(2 * math.pi * s) * np.cos(2 * ph + 1) + 0.4 * over * np.sin(3 * math.pi * s) * np.cos(3 * ph)
    wide = N * 0.075 * a
    xs, ys = x0 + wide * shape, foot + length * s
    buf = np.zeros((N, N), np.float32)
    _plot(buf, xs.ravel(), ys.ravel(), np.broadcast_to(0.42 + 0.58 * a, xs.shape).ravel())
    env = wide * np.sin(math.pi * s)  # where it reaches, faint
    for side in (-1, 1):
        _plot(buf, (x0 + side * env).ravel(), ys.ravel(), np.float32(0.12))
    root = int(_v('key/root', -1))
    if root >= 0:  # the key's own string, doubled
        _plot(buf, xs[:, root] + 1, ys[:, root], np.float32(0.8))
    _phys_line(buf, x0[:-1], foot + length[:-1], x0[1:], foot + length[1:], 0.4)
    _phys_line(buf, x0[0], foot, x0[-1], foot, 0.4)
    _shade(img, buf, hot, other)


@gen('phys_chladni', 'mysterious', 'focused', 'dreamy', whole=True)
def _phys_chladni(img, m, dt, size, hot, other):
    # grains shaken where the plate moves and left alone on its nodal lines; the mode is the top note against the key
    own, rng = S['own'], S['rng']
    if 'p' not in own:
        own['p'] = rng.random((3200, 2)).astype(np.float32)
    if _tick('mode', m, 0.25) or 'nm' not in own:
        c = _chroma()
        own['nm'] = _PHYS_MODES[(int(c.argmax()) - max(0, int(_v('key/root', -1)))) % 12]
        own['sign'] = 1.0 if _v('key/major') > 0.5 else -1.0
    n, q = own['nm']
    n, q = n * max(0.5, min(1.0, 1 / size)), q * max(0.5, min(1.0, 1 / size))
    s, p = own['sign'], own['p']
    x, y = p[:, 0] * math.pi, p[:, 1] * math.pi
    cnx, snx, cqx, sqx = np.cos(n * x), np.sin(n * x), np.cos(q * x), np.sin(q * x)
    cny, sny, cqy, sqy = np.cos(n * y), np.sin(n * y), np.cos(q * y), np.sin(q * y)
    f = cnx * cqy + s * cqx * cny
    fx = -n * snx * cqy - s * q * sqx * cny
    fy = -q * cnx * sqy - s * n * cqx * sny
    h = min(dt, 0.05)
    pull = (2.5 + 5 * m['level']) * h * f / (fx * fx + fy * fy + 1.0) / math.pi
    shake = (0.012 + 0.05 * _v('drive/mid', 0.4)) * math.sqrt(h * 30)
    p[:, 0] -= pull * fx
    p[:, 1] -= pull * fy
    p += rng.normal(0, 1, p.shape).astype(np.float32) * ((np.abs(f) * shake + 0.0012)[:, None])
    np.clip(p, 0, 1, out=p)
    buf = np.zeros((N, N), np.float32)
    _plot(buf, 1 + p[:, 0] * (N - 2), 1 + p[:, 1] * (N - 2), np.float32(0.34))
    _shade(img, buf, hot, other)


@gen('phys_tank', 'calm', 'dreamy', 'melancholic', whole=True)
def _phys_tank(img, m, dt, size, hot, other):
    # the 2D wave equation with walls that send it back; drops land on the sixteenths, as many as the treble has
    own, rng = S['own'], S['rng']
    if 'h' not in own:
        r = np.arange(-6, 7, dtype=np.float32)
        own.update(h=np.zeros((N, N), np.float32), v=np.zeros((N, N), np.float32),
                   stamp=np.exp(-(r[:, None] ** 2 + r[None, :] ** 2) / (2 * (1.7 * size) ** 2)))
    h, v = own['h'], own['v']
    if _tick('drop', m, 4) and rng.random() < 0.2 + 1.1 * m['drive/treb']:
        x, y = rng.integers(8, N - 8, 2)
        h[y - 6:y + 7, x - 6:x + 7] -= own['stamp'] * (0.9 + 0.8 * max(m['hit/hat'], m['high']))
    for _ in range(max(1, min(4, int(round(dt * 90))))):
        lap = h[:-2, 1:-1] + h[2:, 1:-1] + h[1:-1, :-2] + h[1:-1, 2:] - 4 * h[1:-1, 1:-1]
        v[1:-1, 1:-1] += 0.24 * lap
        v *= 0.994
        h += v
    h -= float(h.mean())
    buf = np.zeros((N, N), np.float32)
    slope = (h[1:-1, 2:] - h[1:-1, :-2]) + (h[2:, 1:-1] - h[:-2, 1:-1])
    buf[1:-1, 1:-1] = np.clip(slope * 5 - 0.1, 0, 1)
    _shade(img, buf, hot, other)


@gen('phys_cloth', 'melancholic', 'dreamy', 'mysterious')
def _phys_cloth(img, m, dt, size, hot, other):
    # points in 3D held by stiff links, hung from a rail; each band blows on its strip, the folds catch the light
    own = S['own']
    H, W = 15, 21
    rest = N * 0.68 * size / (W - 1)
    if 'p' not in own:
        x = N / 2 + (np.arange(W, dtype=np.float32) - (W - 1) / 2) * rest
        y = N * 0.5 + 0.47 * N * min(size, 1.0) - np.arange(H, dtype=np.float32) * rest
        p = np.stack([np.broadcast_to(x, (H, W)), np.broadcast_to(y[:, None], (H, W)), np.zeros((H, W), np.float32)], 2)
        own.update(p=p.copy(), q=p.copy(), rail=p[0].copy())
    p, q = own['p'], own['q']
    b = np.interp(np.linspace(0, 9, W), np.arange(10), _bands()).astype(np.float32)
    h = min(dt, 1 / 24)
    t = 2.5 * m['clock/mid']
    col, row = np.arange(W, dtype=np.float32)[None, :], np.arange(H, dtype=np.float32)[:, None]
    wind = (0.15 + b[None, :]) * np.sin(t + 0.55 * col + 0.3 * row)
    a = np.zeros_like(p)
    a[..., 1] = -N * 1.6
    a[..., 2] = wind * N * 9
    a[..., 0] = np.cos(0.6 * t + 0.2 * col) * (0.2 + b[None, :]) * N * 1.2
    new = p + (p - q) * 0.97 + a * h * h
    own['q'], own['p'] = p, new
    p = new
    for _ in range(4):
        p[0] = own['rail']
        for u, w in ((p[:, :-1], p[:, 1:]), (p[:-1], p[1:])):
            d = w - u
            ln = np.sqrt((d * d).sum(2, keepdims=True)) + 1e-4
            c = d * (0.42 * (1 - rest / ln))
            u += c
            w -= c
    p[0] = own['rail']
    near = 1 + p[..., 2] / (N * 1.6)
    flat = np.stack([N / 2 + (p[..., 0] - N / 2) * near, N / 2 + (p[..., 1] - N / 2) * near], 2)
    fold = np.gradient(p[..., 2], axis=1) / rest
    light = (0.16 + 0.8 * np.clip(0.45 + 0.9 * fold, 0, 1) ** 2).astype(np.float32)
    buf = np.zeros((N, N), np.float32)
    _phys_grid(buf, flat, light, 4)
    _shade(img, buf, hot, other)


@gen('phys_balls', 'happy', 'euphoric', 'drop')
def _phys_balls(img, m, dt, size, hot, other):
    # exact parabolas between landings, so they land on the beat: lows every two beats, mids on each, highs on the half
    own = S['own']
    _phys_fade(dt, 0.16)
    every = np.array([2, 2, 2, 1, 1, 1, 1, 0.5, 0.5, 0.5], np.float32)
    x = _beats(m, 1.6)
    leg = np.floor(x / every)
    if 'leg' not in own:
        own.update(leg=leg, up=_bands())
    fresh = leg != own['leg']
    own['up'] = np.where(fresh, _bands(), own['up'])  # how high is settled as it leaves the floor
    own['leg'] = leg
    p = (x / every) % 1.0
    r = np.linspace(6.5, 2.6, 10, dtype=np.float32) * size
    foot = N * 0.09
    height = N * 0.74 * size * every ** 0.7 / 1.625 * (0.3 + 0.7 * own['up'])
    y = foot + r + height * 4 * p * (1 - p)
    bx = N * (0.09 + 0.0911 * np.arange(10, dtype=np.float32))
    squash = np.exp(-(np.minimum(p, 1 - p) * every / 0.07) ** 2)
    buf = np.zeros((N, N), np.float32)
    light = 0.5 + 0.5 * own['up']
    for k in range(10):
        ry = float(r[k] * (1 - 0.4 * squash[k]))
        at = float(y[k] - (r[k] - ry))
        _phys_disc(S['trail'], float(bx[k]), at, float(r[k]) * 0.6, 0.14)
        _phys_disc(buf, float(bx[k]), at, float(r[k] * (1 + 0.4 * squash[k])), float(light[k]), ry)
    ground = 0.22 + (squash[:, None] * np.exp(-((_X[0][None, :] - bx[:, None]) / 7) ** 2)).sum(0)
    buf[int(foot) - 1:int(foot) + 1] += ground
    _shade(img, buf + S['trail'], hot, other)


@gen('phys_gravity', 'mysterious', 'dreamy', 'tense')
def _phys_gravity(img, m, dt, size, hot, other):
    # three heavy bodies pulling on each other in a soft well, and dust that only feels them. The bass clock is their time
    own, rng = S['own'], S['rng']
    _phys_fade(dt, 0.45)
    gm, well = 1700.0 * size ** 2, 1.25
    if 'h' not in own:
        ang = np.array([0.3, 2.3, 4.5], np.float32)
        rad = np.array([0.3, 0.2, 0.26], np.float32) * N * size
        hp = np.stack([rad * np.cos(ang), rad * np.sin(ang)], 1)
        hv = np.stack([-np.sin(ang), np.cos(ang)], 1) * (rad * math.sqrt(well))[:, None]
        own.update(h=hp, hv=hv, d=np.full((280, 2), 1e4, np.float32), dv=np.zeros((280, 2), np.float32), c=m['clock/bass'])
    span = max(0.35 * dt, min(0.09, m['clock/bass'] - own['c']))
    own['c'] = m['clock/bass']
    hp, hv, d, dv = own['h'], own['hv'], own['d'], own['dv']
    dead = (d * d).sum(1) > (0.62 * N * size) ** 2  # lost to the well: back to a close orbit round one of them
    n = int(dead.sum())
    if n:
        who = rng.integers(0, 3, n)
        r = rng.uniform(5, 15, n).astype(np.float32) * size
        ang = rng.uniform(0, 6.283, n).astype(np.float32)
        u = np.stack([np.cos(ang), np.sin(ang)], 1)
        d[dead] = hp[who] + u * r[:, None]
        spin = np.stack([-u[:, 1], u[:, 0]], 1)
        dv[dead] = hv[who] + spin * np.sqrt(gm / r)[:, None]
    h = span / 3
    for _ in range(3):
        e = hp[None, :, :] - hp[:, None, :]
        r2 = (e * e).sum(2) + 16
        hv += h * ((gm * e / (r2 ** 1.5)[..., None]).sum(1) - well * hp)
        hp += h * hv
        e = hp[None, :, :] - d[:, None, :]
        r2 = (e * e).sum(2) + 5
        dv += h * ((gm * e / (r2 ** 1.5)[..., None]).sum(1) - well * d)
        d += h * dv
    show = int(50 + 230 * min(1.0, 0.1 + 5 * m['busy']))
    _plot(S['trail'], N / 2 + d[:show, 0], N / 2 + d[:show, 1], np.float32(0.55))
    buf = S['trail'].copy()
    for k in range(3):
        _phys_disc(buf, N / 2 + float(hp[k, 0]), N / 2 + float(hp[k, 1]), 3.2 * size, 1.2)
    _shade(img, buf, hot, other)


@gen('phys_field', 'tense', 'focused', 'mysterious', whole=True)
def _phys_field(img, m, dt, size, hot, other):
    # the lines are contours of the stream function of four poles, drawn one cell wide by dividing by its gradient
    own = S['own']
    if _tick('lines', m, 0.5) or 'k' not in own:
        own['k'] = 5 + int(round(11 * min(1.0, _v('bright', 0.4))))
    k = own['k']
    t = 0.35 * m['clock/mid']
    psi = np.zeros((N, N), np.float32)
    gx = np.zeros((N, N), np.float32)
    gy = np.zeros((N, N), np.float32)
    buf = np.zeros((N, N), np.float32)
    for i, (q, rad, w, off) in enumerate(((1, 0.27, 1.0, 0.0), (-1, 0.27, 1.0, math.pi), (1, 0.13, -1.7, 1.2), (-1, 0.34, 0.6, 2.4))):
        px = N / 2 + N * rad * size * math.cos(w * t + off)
        py = N / 2 + N * rad * size * math.sin(w * t + off)
        dx, dy = _X - px, _Y - py
        r2 = dx * dx + dy * dy + 1.0
        psi += q * np.arctan2(dy, dx)
        gx += q * dy / r2
        gy -= q * dx / r2
        _phys_disc(buf, px, py, 2.6 * size, 0.9 if q > 0 else 0.5)
    f = psi * (k / (2 * math.pi))
    gap = np.abs((f + 0.5) % 1.0 - 0.5)
    grad = np.sqrt(gx * gx + gy * gy) * (k / (2 * math.pi)) + 1e-4
    line = np.clip(1.15 - gap / grad, 0, 1)
    _shade(img, buf + line * np.clip(0.3 + 9 * grad, 0, 1), hot, other)


@gen('phys_whip', 'aggressive', 'tense', 'drop')
def _phys_whip(img, m, dt, size, hot, other):
    # verlet ropes off a rail; on the backbeat, while snares are heard, the rail snaps across and the wave runs to the tips
    own = S['own']
    _phys_fade(dt, 0.16)
    R, n = 3, 30
    seg = N * 0.74 * size / n
    base = np.array([0.28, 0.5, 0.72], np.float32) * N
    top = N * 0.94
    if 'p' not in own:
        p = np.zeros((R, n, 2), np.float32)
        p[..., 0] = base[:, None]
        p[..., 1] = top - np.arange(n, dtype=np.float32) * seg
        own.update(p=p, q=p.copy(), side=1.0, off=0.0)
    strength = _recent('snares', max(m['hit/snare'], 0.7 * m['hit/hat']), m, dt)
    if _tick('crack', m) and (not _locked(m) or (int(m['beat/count']) % 2 == 1 and strength > 0.3)):
        own['side'] = -own['side']
    far = N * (0.08 + 0.13 * max(strength, 0.3)) * own['side']
    h = min(dt, 0.05) / 2
    drift = N * 0.04 * math.sin(0.8 * m['clock/mid'])
    for _ in range(2):
        own['off'] += (far - own['off']) * min(1.0, h * 30)
        p, q = own['p'], own['q']
        new = p + (p - q) * 0.992
        new[..., 1] -= N * 2.6 * h * h
        own['q'], own['p'] = p, new
        p = new
        anchor = base + own['off'] * np.array([1, -1, 1], np.float32) + drift
        for _ in range(9):
            p[:, 0, 0], p[:, 0, 1] = anchor, top
            d = p[:, 1:] - p[:, :-1]
            ln = np.sqrt((d * d).sum(2, keepdims=True)) + 1e-4
            c = d * (0.48 * (1 - seg / ln))
            p[:, :-1] += c
            p[:, 1:] -= c
        p[:, 0, 0], p[:, 0, 1] = anchor, top
    p = own['p']
    a, b = p[:, :-1].reshape(-1, 2), p[:, 1:].reshape(-1, 2)
    _phys_line(S['trail'], a[:, 0], a[:, 1], b[:, 0], b[:, 1], 0.28)
    buf = S['trail'].copy()
    _phys_line(buf, a[:, 0], a[:, 1], b[:, 0], b[:, 1], 0.8)
    _phys_line(buf, 0, top + 1, N, top + 1, 0.3)
    for k in range(R):
        _phys_disc(buf, float(p[k, -1, 0]), float(p[k, -1, 1]), 2.2 * size, 1.0)
    _shade(img, buf, hot, other)


@gen('phys_fountain', 'happy', 'euphoric', 'dreamy', 'drop')
def _phys_fountain(img, m, dt, size, hot, other):
    # ballistic drops from three nozzles, splashing on the floor; the pressure swells with the beat, so arcs carry it up
    own, rng = S['own'], S['rng']
    if 'p' not in own:
        own['p'] = np.zeros((0, 5), np.float32)
    h = min(dt, 0.05)
    grav, foot = N * 1.5, N * 0.07
    n = 2 + int((180 + 620 * min(1.0, m['level'])) * h)
    jet = rng.integers(0, 3, n)
    drive = np.array([m['drive/bass'], _v('drive/mid', 0.4), m['drive/treb']], np.float32)
    tilt = 0.32 * np.sin(0.8 * m['clock/mid'] + np.array([0.0, 2.1, 4.2], np.float32))
    swell = 1 + 0.13 * math.cos(2 * math.pi * _beats(m, 1.6))
    v0 = np.sqrt(2 * grav * N * 0.8 * size * (0.25 + 0.75 * drive)) * swell
    ang = tilt[jet] + rng.normal(0, 0.035, n)
    speed = v0[jet] * (1 + rng.normal(0, 0.018, n))
    new = np.stack([N * (0.22 + 0.28 * jet), np.full(n, foot), speed * np.sin(ang), speed * np.cos(ang), rng.uniform(4, 5, n)], 1)
    p = np.concatenate([own['p'], new.astype(np.float32)])[-1900:]
    p[:, 3] -= grav * h
    p[:, 0] += h * p[:, 2]
    p[:, 1] += h * p[:, 3]
    p[:, 4] -= h
    down = p[:, 1] < foot  # a splash: a low bounce, gone soon after
    p[down, 1] = foot
    p[down, 3] *= -0.26
    p[down, 2] = p[down, 2] * 0.5 + rng.normal(0, 7, int(down.sum()))
    p[down, 4] = np.minimum(p[down, 4], 0.32)
    own['p'] = p = p[p[:, 4] > 0]
    buf = np.zeros((N, N), np.float32)
    w = np.clip(p[:, 4] * 2.2, 0.15, 0.62)
    _plot(buf, p[:, 0], p[:, 1], w)
    _plot(buf, p[:, 0] - p[:, 2] * 0.016, p[:, 1] - p[:, 3] * 0.016, w * 0.6)
    _phys_line(buf, 0, foot - 1, N, foot - 1, 0.35)
    _shade(img, buf, hot, other)


@gen('phys_billiards', 'focused', 'happy', 'aggressive')
def _phys_billiards(img, m, dt, size, hot, other):
    # hard discs, elastic with each other and the cushions, slowed by the cloth; the first is struck on every bar
    own, rng = S['own'], S['rng']
    _phys_fade(dt, 0.28)
    K, r = 11, N * 0.036 * size
    x0, x1, y0, y1 = N * 0.05, N * 0.95, N * 0.17, N * 0.83
    if 'p' not in own:
        g = np.stack(np.meshgrid(np.linspace(0.3, 0.9, 4), np.linspace(0.2, 0.8, 3)), 2).reshape(-1, 2)[:K]
        own.update(p=(np.array([x0, y0]) + g * np.array([x1 - x0, y1 - y0])).astype(np.float32), v=np.zeros((K, 2), np.float32),
                   glow=np.zeros(K, np.float32))
        own['p'][0] = (x0 + 0.08 * (x1 - x0), N / 2)
    p, v, glow = own['p'], own['v'], own['glow']
    kicks = _recent('kicks', max(m['hit/kick'], 0.8 * m['hit/bass']), m, dt)
    if _tick('cue', m, 0.25) or 'hit' not in own:
        own['hit'] = True
        aim = p[int(rng.integers(1, K))] - p[0]
        v[0] = aim / (np.hypot(*aim) + 1e-3) * N * (1.5 + 2.0 * max(kicks, 0.35))
        glow[0] = 1.0
    last = p.copy()
    h = min(dt, 0.05) / 3
    up = np.triu(np.ones((K, K), bool), 1)
    for _ in range(3):
        p += h * v
        for ax, lo, hi in ((0, x0 + r, x1 - r), (1, y0 + r, y1 - r)):
            out = (p[:, ax] < lo) | (p[:, ax] > hi)
            v[out, ax] *= -0.92
            np.clip(p[:, ax], lo, hi, out=p[:, ax])
        d = p[:, None, :] - p[None, :, :]
        dist = np.sqrt((d * d).sum(2)) + 1e-4
        i, j = np.nonzero((dist < 2 * r) & up)
        if len(i):
            e = d[i, j] / dist[i, j, None]
            rel = ((v[i] - v[j]) * e).sum(1, keepdims=True)
            imp = np.minimum(rel, 0) * e
            np.add.at(v, i, -imp)
            np.add.at(v, j, imp)
            push = (r - dist[i, j, None] / 2) * e
            np.add.at(p, i, push)
            np.add.at(p, j, -push)
            np.add.at(glow, i, 0.5)
            np.add.at(glow, j, 0.5)
    v *= math.exp(-min(dt, 0.05) / 1.25)
    own['glow'] = glow = np.minimum(glow, 1) * math.exp(-dt / 0.18)
    _phys_line(S['trail'], last[:, 0], last[:, 1], p[:, 0], p[:, 1], 0.3)
    buf = S['trail'].copy()
    _phys_line(buf, [x0, x1, x1, x0], [y0, y0, y1, y1], [x1, x1, x0, x0], [y0, y1, y1, y0], 0.4)
    ang = np.linspace(0, 2 * math.pi, 28, endpoint=False, dtype=np.float32)[:, None]
    stripes = np.arange(K) % 2 == 1  # every other disc is a ring
    _plot(buf, (p[stripes, 0] + r * np.cos(ang)).ravel(), (p[stripes, 1] + r * np.sin(ang)).ravel(), np.float32(0.6))
    for k in range(K):
        if k == 0 or not stripes[k]:
            _phys_disc(buf, float(p[k, 0]), float(p[k, 1]), r, 1.0 if k == 0 else 0.5 + 0.5 * float(glow[k]))
        else:
            _phys_disc(buf, float(p[k, 0]), float(p[k, 1]), r * 0.45, 0.35 + 0.65 * float(glow[k]))
    _shade(img, buf, hot, other)


@gen('phys_bubbles', 'calm', 'happy', 'dreamy')
def _phys_bubbles(img, m, dt, size, hot, other):
    # bubbles rise faster the bigger they are and wobble as they go; two that touch become one, and the surface takes them
    own, rng = S['own'], S['rng']
    if 'b' not in own:
        own.update(b=np.zeros((0, 4), np.float32), pops=np.zeros((0, 3), np.float32))
    mid = min(1.0, _v('drive/mid', 0.4))
    b = own['b']
    if _tick('blow', m, 2):
        n = 1 + int(3 * mid)
        vent = rng.integers(0, 5, n) * 0.19 + 0.12
        new = np.stack([N * (vent + rng.normal(0, 0.012, n)), np.full(n, N * 0.03), rng.uniform(1.5, 2.5 + 3.5 * mid, n) * size,
                        rng.uniform(0, 6.283, n)], 1)
        b = np.concatenate([b, new.astype(np.float32)])[-70:]
    h = min(dt, 0.05)
    surface = N * 0.86
    b[:, 1] += h * N * 0.2 * np.sqrt(b[:, 2] / 3) * (0.65 + 0.7 * mid)
    b[:, 0] += h * 2.6 * np.sqrt(b[:, 2]) * 4 * np.sin(b[:, 3] + b[:, 1] * 0.11)
    if len(b) > 1:
        d = np.hypot(b[:, None, 0] - b[None, :, 0], b[:, None, 1] - b[None, :, 1])
        i, j = np.nonzero(np.triu(d < 0.9 * (b[:, None, 2] + b[None, :, 2]), 1))
        if len(i):  # one pair a frame
            a, c = int(i[0]), int(j[0])
            b[a, 2] = min(N * 0.11 * size, float(b[a, 2] ** 3 + b[c, 2] ** 3) ** (1 / 3))
            b = np.delete(b, c, 0)
    pops = own['pops']
    gone = b[:, 1] + b[:, 2] > surface
    if gone.any():
        pops = np.concatenate([pops, np.stack([b[gone, 0], b[gone, 2], np.zeros(int(gone.sum()), np.float32)], 1)])[-24:]
    own['b'] = b = b[~gone]
    pops[:, 2] += dt
    own['pops'] = pops = pops[pops[:, 2] < 0.9]
    buf = np.zeros((N, N), np.float32)
    ang = np.linspace(0, 2 * math.pi, 44, endpoint=False, dtype=np.float32)[:, None]
    _plot(buf, (b[:, 0] + b[:, 2] * np.cos(ang)).ravel(), (b[:, 1] + b[:, 2] * np.sin(ang)).ravel(), np.float32(0.62))
    _plot(buf, b[:, 0] - 0.4 * b[:, 2], b[:, 1] + 0.4 * b[:, 2], np.float32(1.0))
    x = np.arange(N * 2, dtype=np.float32) / 2
    y = surface + 0.9 * np.sin(0.09 * x + 2 * m['clock/mid']) + 0.5 * np.sin(0.23 * x - 1.4 * m['clock/mid'])
    if len(pops):  # each burst lifts the surface, which spreads and falls back
        spread = 2 + pops[:, 2:3] * 26
        lift = pops[:, 1:2] * 1.3 * np.exp(-pops[:, 2:3] / 0.3) * np.cos((x[None, :] - pops[:, :1]) / spread * 2)
        y = y + (lift * np.exp(-((x[None, :] - pops[:, :1]) / spread) ** 2)).sum(0)
    _plot(buf, x, y, np.float32(0.4))
    _shade(img, buf, hot, other)


@gen('phys_sand', 'melancholic', 'calm', 'focused')
def _phys_sand(img, m, dt, size, hot, other):
    # falling sand on a coarse grid: down if it can, else down the slope. The pour is the music's density, a layer a bar,
    # and when the heap is big a gap opens in the floor from one bar on
    own = S['own']
    G = N // 2
    if 'g' not in own:
        own.update(g=np.zeros((G, G), np.float32), odd=False, gap=False, due=0.0)
    g = own['g']
    if _tick('bar', m, 0.25):
        fill = float((g > 0).mean())
        if fill > 0.2:
            own['gap'] = True
    bar = int(_beats(m, 1.6) / 4)
    dense = min(1.0, 0.12 + 6 * m['busy'])
    tone = (0.95 if bar % 2 else 0.5) * (0.65 + 0.35 * min(1.0, m['level']))
    t = 0.5 * m['clock/mid']
    own['due'] += min(dt, 0.05) * 90
    wide = max(1, int(1.6 * size))
    half = G // 2
    while own['due'] >= 1:
        own['due'] -= 1
        for centre in (half + 0.34 * G * math.sin(t), half - 0.3 * G * math.sin(0.7 * t + 1)):
            c = int(centre)
            lane = S['rng'].random(2 * wide + 1) < 0.2 + 0.5 * dense
            cells = g[G - 1, max(0, c - wide):c + wide + 1]
            cells[lane[:len(cells)]] = tone
        fall = (g[1:] > 0) & (g[:-1] == 0)
        g[:-1] = np.where(fall, g[1:], g[:-1])
        g[1:] = np.where(fall, 0, g[1:])
        own['odd'] = not own['odd']
        v = g[:, ::-1] if own['odd'] else g
        slide = (v[1:, 1:] > 0) & (v[:-1, 1:] > 0) & (v[:-1, :-1] == 0) & (v[1:, :-1] == 0)
        v[:-1, :-1] = np.where(slide, v[1:, 1:], v[:-1, :-1])
        v[1:, 1:] = np.where(slide, 0, v[1:, 1:])
        if own['gap']:
            g[0, half - 7:half + 7] = 0
    if own['gap'] and float((g > 0).mean()) < 0.06:
        own['gap'] = False
    buf = np.zeros((N, N), np.float32)
    buf[:2 * G, :2 * G] = g.repeat(2, 0).repeat(2, 1)
    _shade(img, buf, hot, other)


@gen('phys_chamber', 'mysterious', 'tense', 'focused')
def _phys_chamber(img, m, dt, size, hot, other):
    # a beam comes up to a vertex on the eighths and particles leave it, curling in the field as they lose speed, dotted
    # like tracks in a chamber: the hats say how many, the treble how tight
    own, rng = S['own'], S['rng']
    _phys_fade(dt, 1.0)
    if 'p' not in own:
        own['p'] = np.zeros((0, 6), np.float32)
    hats = _recent('hats', max(m['hit/hat'], 0.6 * m['hit/snare']), m, dt)
    p = own['p']
    if _tick('event', m, 2):
        n = 2 + int(6 * max(hats, 0.6 * m['drive/treb']))
        x, y = rng.uniform(0.2, 0.8) * N, rng.uniform(0.3, 0.8) * N
        _phys_line(S['trail'], x + rng.uniform(-14, 14), 0, x, y, 0.3)
        ang, speed = rng.uniform(0, 6.283, n), rng.uniform(40, 135, n) * size
        q = rng.choice((-1.0, 1.0), n)
        new = np.stack([np.full(n, x), np.full(n, y), speed * np.cos(ang), speed * np.sin(ang), q, np.full(n, 1.6)], 1)
        p = np.concatenate([p, new.astype(np.float32)])[-120:]
    h = min(dt, 0.05) / 4
    bend = (2.6 + 6 * m['drive/treb']) * h
    lose = math.exp(-h / 0.62)
    buf = S['trail']
    for _ in range(4):
        c, s = np.cos(p[:, 4] * bend), np.sin(p[:, 4] * bend)
        p[:, 2], p[:, 3] = (p[:, 2] * c - p[:, 3] * s) * lose, (p[:, 2] * s + p[:, 3] * c) * lose
        p[:, 0] += h * p[:, 2]
        p[:, 1] += h * p[:, 3]
        dots = rng.random(len(p)) < 0.72
        _plot(buf, p[dots, 0], p[dots, 1], np.float32(0.8))
    p[:, 5] -= min(dt, 0.05)
    own['p'] = p[(p[:, 5] > 0) & (np.abs(p[:, 2]) + np.abs(p[:, 3]) > 3)]
    np.minimum(buf, 1.0, out=buf)
    _shade(img, buf, hot, other)


@gen('phys_pendwave', 'calm', 'dreamy', 'focused', 'melancholic')
def _phys_pendwave(img, m, dt, size, hot, other):
    # seen from above: each swings one step of frequency above the last, so they fall into waves, knots and apart, and
    # come back in one line every eight bars. All of it is the beat's position; the level is how wide
    _phys_fade(dt, 0.2)
    K = 20
    k = np.arange(K, dtype=np.float32)
    x = _beats(m, 1.6)
    wide = N * 0.42 * size * (0.5 + 0.5 * min(1.0, m['level']))
    swing = np.cos(2 * math.pi * ((16 + k) * (x % 32.0) / 32.0))
    bx = N / 2 + wide * swing
    by = N * (0.06 + 0.88 * k / (K - 1))
    buf = np.zeros((N, N), np.float32)
    _phys_line(buf, np.full(K, N / 2, np.float32), by, bx, by, 0.1)
    _phys_line(buf, bx[:-1], by[:-1], bx[1:], by[1:], 0.26)
    _phys_line(buf, N / 2, 0, N / 2, N, 0.1)
    for i in range(K):
        _phys_disc(S['trail'], float(bx[i]), float(by[i]), 1.3 * size, 0.22)
        _phys_disc(buf, float(bx[i]), float(by[i]), 2.5 * size, 0.7 + 0.3 * (1 - abs(float(swing[i]))))
    _shade(img, buf + S['trail'], hot, other)


@gen('phys_mesh', 'aggressive', 'euphoric', 'drop', whole=True)
def _phys_mesh(img, m, dt, size, hot, other):
    # a sheet of masses and springs pinned at the rim: every beat a blow goes in somewhere, as hard as the kicks have been,
    # and the shock crosses the sheet and comes back. The lines light up where they stretch
    own, rng = S['own'], S['rng']
    G = 22
    if 'u' not in own:
        s = np.linspace(-0.04 * N, 1.04 * N, G, dtype=np.float32)
        own.update(u=np.zeros((G, G, 2), np.float32), v=np.zeros((G, G, 2), np.float32),
                   rest=np.stack(np.meshgrid(s, s), 2).astype(np.float32))
    u, v, rest = own['u'], own['v'], own['rest']
    kicks = _recent('kicks', max(m['hit/kick'], 0.8 * m['hit/bass']), m, dt)
    if _tick('blow', m):
        at = rng.uniform(0.25, 0.75, 2).astype(np.float32) * N
        d = rest - at
        r = np.sqrt((d * d).sum(2, keepdims=True)) + 1.0
        v += d / r * np.exp(-(r / (N * 0.13 * size)) ** 2) * N * 3.4 * max(kicks, 0.35 + 0.4 * m['drive/bass'])
    h = min(dt, 0.05) / 4
    for _ in range(4):
        lap = u[:-2, 1:-1] + u[2:, 1:-1] + u[1:-1, :-2] + u[1:-1, 2:] - 4 * u[1:-1, 1:-1]
        v[1:-1, 1:-1] += h * (1500 * lap - 14 * u[1:-1, 1:-1])
        v *= 1 - 1.8 * h
        u += h * v
    u[0], u[-1], u[:, 0], u[:, -1] = 0, 0, 0, 0
    sway = 1.6 * np.sin(rest[..., ::-1] * 0.09 + 1.5 * m['clock/bass'])
    p = rest + u + sway
    stretch = np.hypot(np.gradient(u[..., 0], axis=1), np.gradient(u[..., 1], axis=0))
    buf = np.zeros((N, N), np.float32)
    _phys_grid(buf, p, (0.16 + np.clip(stretch * 0.28, 0, 0.84)).astype(np.float32), 6)
    _shade(img, buf, hot, other)


@gen('phys_tube', 'aggressive', 'tense', 'euphoric', 'drop')
def _phys_tube(img, m, dt, size, hot, other):
    # a chain of masses for the air in a closed tube; the piston strikes on each beat, as far as the bass has it, and the
    # pulse runs down, comes back off the end and meets the next. Crowded air stands taller and brighter
    own = S['own']
    M = 80
    a = N * 0.84 / M
    if 'u' not in own:
        own.update(u=np.zeros(M, np.float32), v=np.zeros(M, np.float32))
    u, v = own['u'], own['v']
    p = _beats(m, 1.6) % 1.0
    far = N * (0.02 + 0.07 * min(1.0, m['drive/bass']))
    piston = far * min(1.0, p / 0.13) * (1 - p) ** 2
    speed = N * 0.84 / (1.5 * _beat(m)) / a  # masses a second: end to end and back in three beats
    h = min(dt, 0.05) / 10
    k = speed * speed
    for _ in range(10):
        left = np.concatenate(([piston], u[:-1]))
        right = np.concatenate((u[1:], [0.0]))
        v += h * (k * (left + right - 2 * u) - 2.4 * v)
        u += h * v
    x = N * 0.1 + a * np.arange(M, dtype=np.float32) + u
    gap = np.diff(x, append=np.float32(N * 0.1 + a * M))
    crowd = np.clip(a / np.maximum(gap, 0.25 * a) - 1, -0.6, 1.8)
    cy, tall = N / 2, N * 0.2 * size
    row = np.zeros(N, np.float32)
    cols = x.astype(int)
    keep = (cols >= 0) & (cols < N)
    np.add.at(row, cols[keep], (0.42 + 0.5 * np.clip(crowd, 0, 1))[keep])
    reach = np.interp(np.arange(N, dtype=np.float32), np.maximum.accumulate(x), tall * (1 + 0.42 * crowd))
    buf = row[None, :] * (np.abs(_Y - cy) < reach[None, :])
    edge = int(N * 0.1 + piston)
    buf[int(cy - tall * 0.8):int(cy + tall * 0.8), max(0, edge - 7):edge] += 0.8  # the piston, and its rod
    buf[int(cy) - 1:int(cy) + 2, :max(1, edge - 7)] += 0.55
    wall = tall * 1.9
    _phys_line(buf, [N * 0.06, N * 0.06], [cy + wall, cy - wall], [N * 0.95, N * 0.95], [cy + wall, cy - wall], 0.42)
    _phys_line(buf, N * 0.95, cy - wall, N * 0.95, cy + wall, 0.6)
    _shade(img, buf, hot, other)
