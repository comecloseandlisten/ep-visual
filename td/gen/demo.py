# Old demoscene techniques, each answering a different part of the music.


def _demo_beats(m):
    # where we are in beats; with no tempo it runs on the bass clock
    return m['beat/count'] + m['beat/phase'] % 1.0 if _locked(m) else 2.0 * m['clock/bass']


@gen('demo_copper', 'happy', 'euphoric', whole=False)
def _demo_copper(img, m, dt, size, hot, other):
    # copper bars: five shaded bars bobbing on sines, each as thick as its pair of bands, the lows in front
    b = _bands()
    y = _Y[:, 0]
    rows = np.zeros((N, 3), np.float32)
    for k in range(4, -1, -1):
        c = N * (0.5 + 0.38 * math.sin(m['clock/mid'] * (0.9 + 0.17 * k) + 1.3 * k))
        half = N * size * (0.022 + 0.1 * 0.5 * (b[2 * k] + b[2 * k + 1]))
        t = np.ceil(np.clip(1 - np.abs(y - c) / half, 0, 1) * 7) / 7  # in steps, a colour a line
        col = hot if k % 2 == 0 else other
        bar = t[:, None] ** 0.9 * col + (t[:, None] ** 8 * 0.45)
        rows = np.where(t[:, None] > 0, bar, rows)
    img += rows[:, None, :]


@gen('demo_plasma', 'dreamy', 'calm', 'melancholic', whole=True)
def _demo_plasma(img, m, dt, size, hot, other):
    # plasma: twelve sine waves, one a note, each as strong as it sounds and running its own way, so a chord has a shape
    own = S['own']
    c = np.array([_v('chroma/%d' % k) for k in range(12)], np.float32)
    c = c / max(float(c.max()), 1e-3)
    own['w'] = w = own.get('w', c) + (c - own.get('w', c)) * (1 - math.exp(-dt / 0.25))
    k = np.arange(12, dtype=np.float32)
    ang = k * (7 * 2 * math.pi / 12)  # round the circle of fifths
    f = (0.075 + 0.009 * (k % 5)) / size
    t = m['clock/mid'] * (0.5 + 0.09 * (k % 4))
    ax = (f * np.cos(ang))[:, None] * _X[0][None, :] + t[:, None]
    ay = (f * np.sin(ang))[:, None] * _Y[:, 0][None, :]
    v = (np.cos(ay).T @ (w[:, None] * np.sin(ax)) + np.sin(ay).T @ (w[:, None] * np.cos(ax))) / (0.4 * float(w.sum()) + 1e-3)
    cycle = 1.2 * m['clock/mid']
    light = np.clip(1.5 * np.sin(2.6 * v + cycle) - 0.25, 0, 1)
    light = np.ceil(light * 6) / 6
    mix = np.clip(0.5 + 2.5 * np.sin(1.3 * v - 0.5 * cycle), 0, 1)[..., None]
    img += light[..., None] * (hot * mix + other * (1 - mix))


@gen('demo_stars', 'calm', 'focused', 'dreamy', whole=False)
def _demo_stars(img, m, dt, size, hot, other):
    # a starfield flying on the treble clock: the more top end, the more stars, and the longer they streak
    own, rng = S['own'], S['rng']
    if 'p' not in own:
        own.update(p=rng.uniform(-1, 1, (320, 2)).astype(np.float32), z=rng.random(320).astype(np.float32))
    n = 100 + int(220 * min(1.0, 1.5 * m['high']))
    z = ((own['z'][:n] - 0.22 * m['clock/treb']) % 1.0).astype(np.float32) * 0.95 + 0.05
    a = 0.12 * m['clock/mid']
    c, s = math.cos(a), math.sin(a)
    px, py = own['p'][:n, 0], own['p'][:n, 1]
    x, y = (c * px - s * py) * N * 0.3 * size, (s * px + c * py) * N * 0.3 * size
    streak = 0.002 + 0.03 * m['drive/treb']
    buf = np.zeros((N, N), np.float32)
    for k in range(9):
        zz = z + k * streak * z
        _plot(buf, N / 2 + x / zz, N / 2 + y / zz, (1 - z) ** 0.8 * (1 - k / 9.0) * 1.5)
    near = z < 0.3  # the close ones are bigger
    _plot(buf, N / 2 + 1 + x[near] / z[near], N / 2 + y[near] / z[near], np.float32(0.7))
    _plot(buf, N / 2 + x[near] / z[near], N / 2 + 1 + y[near] / z[near], np.float32(0.7))
    _shade(img, buf, hot, other)


@gen('demo_roto', 'aggressive', 'tense', 'drop', whole=True)
def _demo_roto(img, m, dt, size, hot, other):
    # a rotozoomer on a checker: a turn every four bars, and it jumps at you on the beat as hard as the kicks are
    beats = _demo_beats(m)
    kick = _recent('kicks', max(m['hit/kick'], 0.8 * m['hit/bass']), m, dt)
    a = 2 * math.pi * beats / 16 + 0.4 * math.sin(2 * math.pi * beats / 32)
    cell = N * 0.075 * size * (1 + 0.3 * math.sin(0.5 * m['clock/bass']) + 0.7 * kick * math.exp(-4 * (m['beat/phase'] % 1.0)))
    c, s = math.cos(a) / cell, math.sin(a) / cell
    x, y = _X - N / 2, _Y - N / 2
    u, v = np.floor(c * x + s * y), np.floor(c * y - s * x)
    on = (u + v) % 2
    big = ((np.floor(u / 4) + np.floor(v / 4)) % 2)[..., None]
    fade = np.clip(1.35 - np.hypot(x, y) / (0.62 * N), 0.2, 1)
    img += (on * fade)[..., None] * (hot * big + other * (1 - big))


@gen('demo_twister', 'focused', 'mysterious', 'tense', whole=False)
def _demo_twister(img, m, dt, size, hot, other):
    # a twister: a square bar turning along its length, wound tighter the louder the mids are
    y = _Y[:, 0]
    t = m['clock/mid']
    ang = 1.5 * t + (1.2 + 2.4 * _v('drive/mid', 0.4)) * np.sin(y * 0.03 + 0.7 * t)
    cx = N / 2 + N * 0.17 * np.sin(y * 0.024 - 0.9 * t)
    w = N * 0.17 * size
    stripe = 0.75 + 0.25 * np.sign(np.sin(y * 0.8))
    for f in range(4):
        l = cx + w * np.sin(ang + f * math.pi / 2)
        r = cx + w * np.sin(ang + (f + 1) * math.pi / 2)
        light = np.clip((r - l) / (1.414 * w), 0, 1) ** 0.8 * stripe  # a face turned to you is the brightest
        face = (_X >= l[:, None]) & (_X < r[:, None])
        img += (face * light[:, None])[..., None] * (hot if f % 2 else other)


def _demo_forms():
    # where the balls go: a cube, a ring, a double helix, a globe, 27 points each
    i = np.arange(27, dtype=np.float32)
    g = np.array([-1, 0, 1], np.float32)
    cube = np.stack(np.meshgrid(g, g, g), -1).reshape(27, 3)
    a = i / 27 * 2 * math.pi
    ring = np.stack([np.cos(a), np.sin(a), 0.3 * np.sin(3 * a)], 1) * 1.45
    side = math.pi * (i % 2)
    helix = np.stack([0.85 * np.cos(2 * a + side), i / 13 - 1, 0.85 * np.sin(2 * a + side)], 1) * 1.25
    z = 1 - 2 * (i + 0.5) / 27
    r = np.sqrt(1 - z * z)
    globe = np.stack([r * np.cos(i * 2.4), r * np.sin(i * 2.4), z], 1) * 1.45
    return [cube, ring, helix, globe]


@gen('demo_vballs', 'happy', 'focused', 'drop', whole=False)
def _demo_vballs(img, m, dt, size, hot, other):
    # vector balls: shaded balls turning in space, far ones behind; every bar they fly into a new form, on the beat they spread
    own = S['own']
    if 'p' not in own:
        own.update(forms=_demo_forms(), now=0)
        own['p'] = own['forms'][0].copy()
    if _tick('form', m, 0.25):
        own['now'] = (own['now'] + 1) % 4
    own['p'] += (own['forms'][own['now']] - own['p']) * (1 - math.exp(-dt / (0.5 * _beat(m))))
    a, b = 0.9 * m['clock/mid'], 0.55 * m['clock/bass']
    ca, sa, cb, sb = math.cos(a), math.sin(a), math.cos(b), math.sin(b)
    p = own['p'] * (1 + 0.2 * math.exp(-5 * (m['beat/phase'] % 1.0)) * _locked(m))
    x, y, z = ca * p[:, 0] + sa * p[:, 2], p[:, 1], ca * p[:, 2] - sa * p[:, 0]
    y, z = cb * y - sb * z, sb * y + cb * z
    far = z + 4.0
    sx, sy = N / 2 + N * 1.0 * size * x / far, N / 2 + N * 1.0 * size * y / far
    r = N * 0.25 * size / far
    order = np.argsort(-far)  # the near ones painted last
    sx, sy, r, far = sx[order], sy[order], r[order], far[order]
    k = int(N * 0.11 * size) + 2
    o = np.arange(-k, k + 1, dtype=np.float32)
    ix = np.round(sx)[:, None, None] + o[None, None, :]
    iy = np.round(sy)[:, None, None] + o[None, :, None]
    ix, iy = np.broadcast_arrays(ix, iy)
    dx, dy = (ix - sx[:, None, None]) / r[:, None, None], (iy - sy[:, None, None]) / r[:, None, None]
    d2 = dx * dx + dy * dy
    keep = (d2 < 1) & (ix >= 0) & (ix < N) & (iy >= 0) & (iy < N)
    nz = np.sqrt(np.maximum(1 - d2, 0))
    lamb = np.clip(-0.45 * dx + 0.5 * dy + 0.74 * nz, 0, 1)
    light = (0.16 + 0.9 * lamb ** 1.3 + 0.5 * lamb ** 12) * np.clip(1.6 - 0.2 * far, 0.4, 1)[:, None, None]
    buf = np.zeros((N, N), np.float32)
    buf[iy[keep].astype(int), ix[keep].astype(int)] = light[keep]
    _shade(img, buf, hot, other)


@gen('demo_scroller', 'melancholic', 'calm', 'focused', whole=False)
def _demo_scroller(img, m, dt, size, hot, other):
    # a dot scroller on sines: twelve rows, one a note; each sixteenth a new column comes in with the notes that sound
    own = S['own']
    if 'cols' not in own:
        own.update(cols=np.zeros((90, 12), np.float32), f=0.0)
    if _tick('scroll', m, 4):
        c = np.array([_v('chroma/%d' % k) for k in range(12)], np.float32)
        own['cols'] = np.roll(own['cols'], 1, 0)
        own['cols'][0] = (c > 0.6 * max(float(c.max()), 1e-3)) * min(1.0, 0.5 + m['level'])
        own['f'] = 0.0
    own['f'] = min(1.0, own['f'] + dt * 8)
    f = (_demo_beats(m) * 4) % 1.0 if _locked(m) else own['f']
    pitch = max(2.6, 3.2 * size)
    x = N - (np.arange(90, dtype=np.float32) + f) * pitch
    wave = N * 0.2 * np.sin(x * 0.05 + 1.2 * m['clock/mid']) + N * 0.07 * np.sin(x * 0.13 - 1.9 * m['clock/bass'])
    r = (np.arange(12, dtype=np.float32) - 5.5) * pitch
    xs = np.broadcast_to(x[:, None], (90, 12))
    ys = N / 2 + wave[:, None] + r[None, :]
    w = 0.13 + own['cols']
    buf = np.zeros((N, N), np.float32)
    for a, b in ((0, 0), (1, 0), (0, 1), (1, 1)):
        _plot(buf, xs + a, ys + b, w)
    _shade(img, buf, hot, other)


@gen('demo_voxel', 'mysterious', 'melancholic', 'dreamy', whole=True)
def _demo_voxel(img, m, dt, size, hot, other):
    # a voxel landscape, column by column from the front: flying down a canyon whose walls are the bands, lows outermost
    own = S['own']
    b = _bands()
    own['b'] = own.get('b', b) + (b - own.get('b', b)) * (1 - math.exp(-dt / 0.12))
    d = 52
    z = (0.75 * 1.048 ** np.arange(d)).astype(np.float32)[:, None]
    wx = ((_X[0] - N / 2) / N)[None, :] * z * 2.2 / size
    wz = z + 1.6 * m['clock/bass']
    n = 0.5 + 0.26 * np.sin(wx * 2.3 + 1.4 * np.sin(wz * 0.8)) + 0.2 * np.sin(wx * 5.1 - wz * 1.7) + 0.1 * np.sin(wz * 3.1 + wx * 3)
    side = np.clip(np.abs(wx) / 3, 0, 1)
    lift = np.interp(1 - side, np.linspace(0, 1, 10), own['b']).astype(np.float32)
    h = n * (0.3 + 1.6 * lift) + 0.7 * side
    top = N * 0.6 + (h - 1.1) * N * 0.5 / z
    seen = np.clip(np.maximum.accumulate(top, 0), 0, N)
    light = np.clip(0.15 + 1.1 * n * n + 0.5 * h, 0, 1) * (1 - np.arange(d, dtype=np.float32)[:, None] / d) ** 0.7
    col = np.arange(N)
    # the first slice that reaches each cell, in one search: columns laid end to end, each rising
    key = (seen.T.astype(np.float64) + col[:, None] * (2.0 * N)).ravel()
    q = (_Y.astype(np.float64) + col[None, :] * (2.0 * N)).ravel()
    idx = np.searchsorted(key, q, side='right').reshape(N, N) - col[None, :] * d
    shade = np.vstack([light, np.zeros((1, N), np.float32)])
    _shade(img, shade[np.minimum(idx, d), col[None, :]], hot, other)


@gen('demo_fire', 'aggressive', 'euphoric', 'drop', whole=False)
def _demo_fire(img, m, dt, size, hot, other):
    # the fire effect: a burning bottom row averaged upward and cooled; the louder it is, the higher it climbs
    own, rng = S['own'], S['rng']
    g = N // 2 + 1
    if 'f' not in own:
        own.update(f=np.zeros((g, g), np.float32), wait=0.0, seed=rng.random(g // 4 + 1) < 0.6)
    f = own['f']
    own['wait'] += dt
    steps = min(3, int(own['wait'] * 45))
    own['wait'] -= steps / 45.0
    cool = (0.065 - 0.05 * min(1.0, m['level'])) / size
    wind = int(round(1.2 * math.sin(0.6 * m['clock/mid'])))
    for _ in range(steps):
        own['seed'] = own['seed'] ^ (rng.random(own['seed'].size) < 0.06)  # hot spots last a while
        f[0] = own['seed'].repeat(4)[:g] * 1.5
        up = f[:-1]
        spread = (up * 2 + np.roll(up, 1, 1) + np.roll(up, -1, 1)) * 0.25
        f[1:] = np.maximum(np.roll(spread, wind, 1) - cool * 2 * rng.random((g - 1, g), dtype=np.float32), 0)
    buf = f.repeat(2, 0).repeat(2, 1)[:N, :N]
    _shade(img, np.clip(buf * 1.25, 0, 1), hot, other)


@gen('demo_bobs', 'dreamy', 'mysterious', whole=False)
def _demo_bobs(img, m, dt, size, hot, other):
    # shadebobs: soft bobs adding up where they pass and the sum wrapping round the palette; the key picks their path
    own = S['own']
    _trail(dt, 2.5)
    root = max(0, int(_v('key/root', 0)))
    a, b = 2 + root % 3, 3 + (root // 3) % 3
    n = 4 if _v('key/major') > 0.5 else 3
    own['p'] = own.get('p', 0.0) + dt * (0.3 + 0.5 * _v('drive/mid', 0.4))
    s = own['p'] + 2 * math.pi * np.arange(n, dtype=np.float32) / n
    amp = N * 0.33 * size
    x = N / 2 + amp * np.sin(a * s)
    y = N / 2 + amp * np.sin(b * s + 0.7)
    k = int(9 * size) + 1
    oy, ox = np.mgrid[-k:k + 1, -k:k + 1].astype(np.float32)
    w = np.clip(1 - (ox * ox + oy * oy) / (k * k), 0, 1).ravel()
    xs, ys = np.round(x)[:, None] + ox.ravel()[None, :], np.round(y)[:, None] + oy.ravel()[None, :]
    _plot(S['trail'], xs, ys, np.broadcast_to(w * 2.2 * dt, xs.shape))
    v = S['trail']
    wrap = (v * 2.2) % 1.0
    _shade(img, np.where(v > 0.03, 0.15 + 0.85 * (1 - np.abs(2 * wrap - 1)), 0), hot, other)


@gen('demo_glenz', 'euphoric', 'happy', 'tense', whole=False)
def _demo_glenz(img, m, dt, size, hot, other):
    # a see-through cube of lit and glassy triangles, front faces over back; the backbeat throws it round, as far as the snares
    own = S['own']
    if 'a' not in own:
        own.update(a=np.array([0.6, 0.4, 0.0]), to=np.array([0.6, 0.4, 0.0]))
    strength = _recent('snares', m['hit/snare'], m, dt)
    if _tick('glenz', m) and (int(m['beat/count']) % 2 == 1 or not _locked(m)):
        own['to'] = own['to'] + np.array([0.7, 1.1, 0.3]) * (0.35 + strength)
    own['a'] += (own['to'] - own['a']) * (1 - math.exp(-dt / 0.07))
    a, b, c = own['a'] + 0.2 * m['clock/mid']
    ca, sa, cb, sb, cc, sc = math.cos(a), math.sin(a), math.cos(b), math.sin(b), math.cos(c), math.sin(c)
    R = (np.array([[cc, -sc, 0], [sc, cc, 0], [0, 0, 1]]) @ np.array([[cb, 0, sb], [0, 1, 0], [-sb, 0, cb]])
         @ np.array([[1, 0, 0], [0, ca, -sa], [0, sa, ca]])).astype(np.float32)
    h = N * 0.23 * size * (0.9 + 0.2 * m['level'])
    lo, hi = max(0, int(N / 2 - 1.75 * h)), min(N, int(N / 2 + 1.75 * h) + 1)  # only where it can be
    x, y = (_X[lo:hi, lo:hi] - N / 2) / h, (_Y[lo:hi, lo:hi] - N / 2) / h
    out = img[lo:hi, lo:hi]
    edge = 1 - 1.4 / h
    for i in range(3):
        j, k = (i + 1) % 3, (i + 2) % 3
        p, q, r, s = R[0, j], R[0, k], R[1, j], R[1, k]
        det = p * s - q * r
        if abs(det) < 0.04:
            continue
        for side in (1, -1):
            px, py = x - side * R[0, i], y - side * R[1, i]
            u, v = (s * px - q * py) / det, (p * py - r * px) / det
            box = np.maximum(np.abs(u), np.abs(v))
            tri = (u + v > 0) != (u - v > 0)
            front = side * R[2, i] > 0
            w = (box < 1) * (np.where(tri, 0.6, 0.12) + 0.5 * (box > edge)) * (1.0 if front else 0.55)
            out += w[..., None] * (hot if front else other)


@gen('demo_wormhole', 'tense', 'mysterious', 'euphoric', 'drop', whole=True)
def _demo_wormhole(img, m, dt, size, hot, other):
    # a wormhole: spiral arms down a bending tube, a ring out to you on every beat; four arms in minor, six in major,
    # the more stirred the music the tighter the wind
    x, y = _X - N / 2, _Y - N / 2
    bend = (1 - np.clip(np.hypot(x, y) / (0.72 * N), 0, 1)) ** 2
    t = m['clock/mid']
    x = x - N * 0.26 * math.sin(0.7 * t) * bend
    y = y - N * 0.26 * math.cos(0.53 * t) * bend
    r = np.hypot(x, y) + 1
    depth = N * 0.8 * size / r
    arms = 6 if _v('key/major') > 0.5 else 4
    wind = 0.7 + 0.8 * _v('mood/arousal', 0.5)
    spiral = np.sin(arms * np.arctan2(y, x) + wind * depth + 0.6 * t)
    pos = depth + _demo_beats(m)
    rings = 0.5 + 0.5 * np.cos(2 * math.pi * pos)
    light = np.clip(2.2 * spiral, 0, 1) * (0.3 + 0.7 * rings) * np.clip((r - 3) / 12, 0, 1)
    pick = (np.floor(pos + 0.5) % 2)[..., None]
    img += light[..., None] * (hot * pick + other * (1 - pick))


@gen('demo_warp', 'focused', 'tense', whole=True)
def _demo_warp(img, m, dt, size, hot, other):
    # a sine-warped grid, calm in steady sound, wrung the more the sound changes and the more top end it has
    amp = N * (0.025 + 0.11 * min(1.0, max(_v('flux'), 0.9 * m['high'])))
    t, s = m['clock/mid'], m['clock/treb']
    u = _X + amp * np.sin(_Y * 0.07 + t) + 0.5 * amp * np.sin(_Y * 0.16 - s)
    v = _Y + amp * np.sin(_X * 0.06 - 0.8 * t) + 0.5 * amp * np.sin(_X * 0.19 + s)
    step = 13 * size
    lu = np.clip(1.2 - np.abs(u % step - step / 2), 0, 1)
    lv = np.clip(1.2 - np.abs(v % step - step / 2), 0, 1)
    img += (np.maximum(lu, lv) * 0.55)[..., None] * other + (lu * lv)[..., None] * hot


@gen('demo_bump', 'melancholic', 'mysterious', whole=True)
def _demo_bump(img, m, dt, size, hot, other):
    # moving bumps: two lights over an embossed plate sliding past, their pools as wide as the sound is bright
    own = S['own']
    if 'gx' not in own:
        f = 2 * math.pi / N
        k = max(3, int(round(7 / size)))
        h = np.sin(_X * f * k) * np.sin(_Y * f * k) + 0.8 * np.sin(_X * f * 2 + 1) * np.sin(_Y * f * 3)
        own['gy'], own['gx'] = np.gradient(h.astype(np.float32))
    t = m['clock/treb']
    shift = int(5 * m['clock/mid'])
    gx, gy = np.roll(own['gx'], shift, 1), np.roll(own['gy'], shift // 2, 0)
    reach = N * (0.15 + 0.26 * _v('bright', 0.4)) * size
    for x, y, col in ((math.sin(0.8 * t), math.sin(1.1 * t + 1), hot), (math.cos(0.6 * t + 2), math.sin(0.7 * t), other)):
        d = np.hypot(_X - N * (0.5 + 0.34 * x) + gx * 60, _Y - N * (0.5 + 0.34 * y) + gy * 60)
        img += (np.clip(1 - d / reach, 0, 1) ** 1.6)[..., None] * col


@gen('demo_kefrens', 'happy', 'dreamy', whole=False)
def _demo_kefrens(img, m, dt, size, hot, other):
    # kefrens bars: one bar a line, each line keeping those above it, so they pile into a curtain; the hats kick its wave along
    own = S['own']
    strength = _recent('hats', m['hit/hat'], m, dt)
    if _tick('kefrens', m, 2):
        own['to'] = own.get('to', 0.0) + 0.3 + 0.9 * strength
    own['ph'] = own.get('ph', 0.0) + (own.get('to', 0.0) - own.get('ph', 0.0)) * (1 - math.exp(-dt / 0.06))
    y = _Y[:, 0]
    t = 0.8 * m['clock/treb'] + own['ph']
    amp = N * (0.14 + 0.14 * strength) * size
    x = N / 2 + amp * np.sin(y * 0.075 + t) + 0.5 * amp * np.sin(y * 0.17 - 1.4 * t)
    w = 6.5 * size
    lines = np.arange(N)[:, None]
    over = (np.abs(_X - x[:, None]) < w) & (lines < N * 0.93)
    last = np.minimum.accumulate(np.where(over, lines, N)[::-1], 0)[::-1]  # the lowest bar drawn on top
    shown = (last < N) & (_Y > N * 0.07)
    s = (_X - x[np.minimum(last, N - 1)]) / w  # -1 .. 1 across the bar that shows here
    light = shown * (0.3 + 0.7 * np.abs(np.sin(2.5 * math.pi * s)))
    half = (s > 0)[..., None]
    img += light[..., None] * (hot * half + other * (1 - half))


@gen('demo_dottunnel', 'aggressive', 'focused', 'tense', whole=False)
def _demo_dottunnel(img, m, dt, size, hot, other):
    # a dot tunnel: rings of dots coming at you, one every half beat, more dots to a ring the busier the music is
    own = S['own']
    if 'd' not in own:
        own.update(d=np.zeros(12, np.float32), n=np.ones(12, np.int64), c=np.zeros((12, 2), np.float32),
                   lead=np.zeros(12, bool), k=0)
    d = own['d']
    d -= dt / (4 * _beat(m))
    if _tick('ring', m, 2):
        k = own['k']
        i = k % 12
        d[i], own['n'][i], own['lead'][i] = 1.0, 12 + int(44 * min(1.0, 7 * m['busy'])), k % 8 == 0
        own['c'][i] = math.sin(0.37 * k), math.cos(0.23 * k)
        own['k'] = k + 1
    live = d > 0.07
    dd = d[live][:, None]
    j = np.arange(56, dtype=np.float32)[None, :]
    n = own['n'][live][:, None]
    th = 2 * math.pi * j / n + 0.5 * m['clock/mid'] + 0.25 / dd
    rad = N * 0.055 * size / dd
    x = N / 2 + own['c'][live][:, :1] * dd * N * 0.2 + rad * np.cos(th)
    y = N / 2 + own['c'][live][:, 1:] * dd * N * 0.2 + rad * np.sin(th)
    keep = np.broadcast_to(j < n, x.shape)
    w = np.broadcast_to(np.clip(0.35 + (1 - dd) * 1.2, 0, 1) * np.where(own['lead'][live][:, None], 1.0, 0.7), x.shape)
    buf = np.zeros((N, N), np.float32)
    _plot(buf, x[keep], y[keep], w[keep])
    close = keep & (dd < 0.6)  # the close ones are bigger
    for a, b in ((1, 0), (0, 1), (1, 1)):
        _plot(buf, x[close] + a, y[close] + b, w[close])
    _shade(img, buf, hot, other)


@gen('demo_metaballs', 'calm', 'melancholic', 'dreamy', whole=False)
def _demo_metaballs(img, m, dt, size, hot, other):
    # metaballs: five blobs melting into each other, swelling with the bass, drifting on its clock, a thin halo round them
    t = m['clock/bass']
    r2 = (N * (0.05 + 0.09 * m['drive/bass']) * size) ** 2
    f = np.zeros((N, N), np.float32)
    for i in range(5):
        x = N * (0.5 + 0.33 * math.sin(t * (0.5 + 0.13 * i) + 1.9 * i))
        y = N * (0.5 + 0.31 * math.cos(t * (0.41 + 0.17 * i) + 1.1 * i))
        f += r2 * (1 + 0.3 * math.sin(2.1 * i)) / ((_X - x) ** 2 + (_Y - y) ** 2 + 1)
    body = (f > 1) * np.clip(0.3 + 0.35 * (f - 1), 0, 1)
    halo = np.clip(1 - np.abs(f - 0.6) * 16, 0, 1) * 0.6
    img += body[..., None] * hot + halo[..., None] * other


@gen('demo_lens', 'happy', 'aggressive', 'euphoric', 'drop', whole=False)
def _demo_lens(img, m, dt, size, hot, other):
    # a bouncing lens: a glass ball over a lattice of dots, landing on every beat and squashing there, as high as it is loud,
    # crossing the frame and back in four bars
    beats = _demo_beats(m)
    p = beats % 1.0
    air = 4 * p * (1 - p)
    r = N * 0.2 * size
    squash = 0.3 * max(0.0, 1 - 5 * air)
    rx, ry = r * (1 + squash), r * (1 - squash)
    base = 5.0
    cy = base + ry + N * (0.22 + 0.36 * m['level']) * air
    cx = r + (N - 2 * r) * abs((beats / 8) % 2 - 1)
    x0, x1 = max(0, int(cx - rx) - 1), min(N, int(cx + rx) + 2)  # only where it can be
    y0, y1 = max(0, int(cy - ry) - 1), min(N, int(cy + ry) + 2)
    u, v = (_X[y0:y1, x0:x1] - cx) / rx, (_Y[y0:y1, x0:x1] - cy) / ry
    d2 = u * u + v * v
    z = np.sqrt(np.maximum(1 - d2, 0))
    su, sv = 5 * u / (z + 0.55) + m['clock/mid'], 5 * v / (z + 0.55)
    dots = np.hypot(su % 1 - 0.5, sv % 1 - 0.5) < 0.34
    ball = (d2 < 1) * (dots * (0.25 + 0.75 * z) + 0.1 + 0.8 * (d2 > 0.86))
    spec = np.exp(-((u + 0.35) ** 2 + (v - 0.4) ** 2) / 0.02) * (d2 < 1)
    _shade(img[y0:y1, x0:x1], ball + spec, hot, other)
    shadow = np.clip(1 - np.abs(_X[0] - cx) / (r * (1.5 - 0.5 * air)), 0, 1) * (0.8 - 0.5 * air)
    img[2:4] += shadow[None, :, None] * other
