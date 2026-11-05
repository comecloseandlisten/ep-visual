# ep visual, family op: op art and fractals. The patterns that fill the frame are whole=True, the figures float on the picture.


def _op_step(key, m, dt, div=1):
    # (steps so far, how far into this one, 0..1), `div` to the beat: _tick says when, beat/phase how far
    own = S['own']
    if _tick(key, m, div):
        own[key + '/n'] = own.get(key + '/n', 0) + 1
        own[key + '/f'] = 0.0
    if _locked(m):
        f = ((m['beat/count'] + m['beat/phase'] % 1.0) * div) % 1.0
    else:
        f = own[key + '/f'] = min(1.0, own.get(key + '/f', 0.0) + dt * 2 * div)
    return own.get(key + '/n', 0), f


def _op_updown(n, f, top):
    # steps as a climb from 0 to top and back down
    x = (n + f) % (2 * top)
    return x if x < top else 2 * top - x


def _op_path(z):
    # the cells along a line through complex points, with no gaps
    d = z[1:] - z[:-1]
    s = int(np.abs(d).max()) + 2
    p = (z[:-1, None] + d[:, None] * (np.arange(s) / s)[None, :]).ravel()
    return p.real, p.imag


def _op_polar(own):
    # each cell's distance from the middle and its angle, worked out once
    if 'r' not in own:
        x, y = _X - N / 2, _Y - N / 2
        own.update(r=np.hypot(x, y), a=np.arctan2(y, x))
    return own['r'], own['a']


@gen('op_stripes', 'calm', 'dreamy', 'focused', whole=True)
def _op_stripes(img, m, dt, size, hot, other):
    # stripes thick and thin, bent by a slow wave that goes deeper with the bass
    p, t = 11.0 * size, m['clock/bass']
    x, y = _X[:1, :], _Y[:, :1]
    w = p * (0.6 + 1.7 * m['drive/bass']) * (np.sin(y * 0.055 + 0.45 * t) + 0.5 * np.sin(y * 0.021 - 0.3 * t))
    u = (x + w) / p + 0.9 * np.sin((x + 0.5 * w) * 0.05 + 0.2 * t)
    band = np.clip((0.56 - np.abs(u % 1 - 0.5) * 2) * p * 0.6, 0, 1)
    two = (np.floor(u) % 2)[..., None]
    img += band[..., None] * (hot * two + other * (1 - two))


@gen('op_moire', 'tense', 'mysterious', 'focused', whole=True)
def _op_moire(img, m, dt, size, hot, other):
    # two sets of fine lines, the treble opens the angle between them: the fringes sweep where the lines hardly move
    p = 5.5 * size
    b = 0.4 + 0.08 * m['clock/mid']
    a = b + 0.06 + 0.1 * m['drive/treb'] + 0.04 * math.sin(0.5 * m['clock/treb'])
    x, y = _X - N / 2, _Y - N / 2
    k = 2 * math.pi / p
    s = np.cos(k * (x * math.cos(b) + y * math.sin(b))) + np.cos(k * (x * math.cos(a) + y * math.sin(a)))
    _shade(img, np.clip(1.4 * (s - 0.4), 0, 1), hot, other)


@gen('op_bulge', 'happy', 'euphoric', 'drop', whole=True)
def _op_bulge(img, m, dt, size, hot, other):
    # a checker swelling like a ball under the frame, as big as the sound is loud
    c, t = 8.0 * size, m['clock/mid']
    cx, cy = N * (0.5 + 0.22 * math.sin(0.31 * t)), N * (0.5 + 0.22 * math.sin(0.23 * t + 1))
    rad = N * (0.22 + 0.42 * m['level']) * size
    dx, dy = _X - cx, _Y - cy
    q = np.clip(1 - (dx * dx + dy * dy) / (rad * rad), 0, 1)
    k = 1 / (1 + 2.6 * q * q)
    s = np.sin(math.pi * (cx + dx * k + 0.8 * t) / c) * np.sin(math.pi * (cy + dy * k) / c)
    q = q[..., None]
    img += np.clip(s * 16, 0, 1)[..., None] * (other * (1 - q) * 0.7 + hot * q ** 0.5 * (0.5 + 0.5 * q))


@gen('op_kaleido', 'euphoric', 'happy', 'dreamy', whole=True)
def _op_kaleido(img, m, dt, size, hot, other):
    # dots wandering a wedge, mirrored round the middle: the busier the music, the more of them
    own = S['own']
    r, a = _op_polar(own)
    if 'seed' not in own:
        own['seed'] = S['rng'].uniform(0, 1, (30, 3)).astype(np.float32)
    _trail(dt, 0.07)
    w, t = math.pi / 6, m['clock/mid']
    s = own['seed'][:int(5 + 25 * min(1.0, 5 * m['busy']))]
    rad = ((s[:, 0] + 0.07 * t * (0.5 + s[:, 1])) % 1) * 0.72 * N
    th = w * (0.5 + 0.5 * np.sin(6.28 * s[:, 2] + t * (0.4 + s[:, 1])))
    x, y = rad * np.cos(th), rad * np.sin(th)
    light = np.float32(0.6 + 0.4 * m['beat/pulse'])
    big = 1.6 + 2.2 * s[:, 1]
    for dx, dy in ((i, j) for i in range(-4, 5) for j in range(-4, 5)):
        _plot(S['trail'], x + dx, y + dy, light * np.clip(big - math.hypot(dx, dy), 0, 1))
    fold = np.abs((a + 0.1 * t) % (2 * w) - w)
    ix = np.clip(r / size * np.cos(fold), 0, N - 1).astype(int)
    iy = np.clip(r / size * np.sin(fold), 0, N - 1).astype(int)
    _shade(img, S['trail'][iy, ix], hot, other)


@gen('op_shutter', 'aggressive', 'tense', 'drop', whole=True)
def _op_shutter(img, m, dt, size, hot, other):
    # ten rings of blades, the lows in the middle: each opens with its band, and all click on a blade with the beat
    r, a = _op_polar(S['own'])
    b = _bands()
    n, f = _op_step('click', m, dt)
    click = n + 1 - (1 - f) ** 4
    k = np.arange(10)
    blades = 3 + k
    turn = np.where(k % 2, -1.0, 1.0) * (click + 0.05 * m['clock/mid'])
    u = r / (6.2 * size)
    ring = np.minimum(u.astype(int), 9)
    c = (a / (2 * math.pi) * blades[ring] + turn[ring]) % 1
    on = (c < (0.22 + 0.7 * b)[ring]) & (u % 1 < 0.86) & (u < 10)
    even = (ring % 2 == 0)[..., None]
    img += (on * (0.6 + 0.4 * b)[ring])[..., None] * (hot * even + other * ~even)


@gen('op_quasi', 'mysterious', 'melancholic', 'calm', whole=True)
def _op_quasi(img, m, dt, size, hot, other):
    # twelve plane waves, one a note, as strong as it sounds: every chord lays its own crystal
    own = S['own']
    c = _chroma()
    c = c / max(float(c.max()), 1e-3)
    e = own.get('c', c)
    own['c'] = e = e + (c - e) * min(1.0, dt / 0.35)
    amp = e ** 1.4 + 0.04
    k = np.arange(12)
    th = math.pi * k / 12
    ph = m['clock/mid'] * (0.5 + 0.2 * (k % 3)) * np.where(k % 2, -1.0, 1.0)
    x = (_X[0] - N / 2)[:, None] * (2 * math.pi / (15 * size))
    gx, gy = x * np.cos(th) + ph, x * np.sin(th)
    w = np.concatenate([np.cos(gy), -np.sin(gy)], 1) @ np.concatenate([amp * np.cos(gx), amp * np.sin(gx)], 1).T
    _shade(img, np.clip(w / math.sqrt(float((amp * amp).sum())) * 1.3 - 0.45, 0, 1), hot, other)


@gen('op_whirl', 'aggressive', 'euphoric', 'drop', whole=True)
def _op_whirl(img, m, dt, size, hot, other):
    # squares in squares, each turned until its corners touch the one around it, a new one out of the middle every beat
    n, f = _op_step('whirl', m, dt)
    t = min(0.6, max(0.18, 0.3 * size))
    q = 1 / (math.cos(t) + math.sin(t))
    x, y = _X - N / 2, _Y - N / 2
    count = np.zeros((N, N), np.int16)
    for k in range(int(math.log(1.2 / 100) / math.log(q)) + 2):
        a = (k - f) * t
        c, s = math.cos(a), math.sin(a)
        count += np.maximum(np.abs(c * x + s * y), np.abs(c * y - s * x)) < 100 * q ** (k - f)
    i = (count - n) % 4
    img += (i == 0)[..., None] * hot + (i == 2)[..., None] * other


@gen('op_mandala', 'calm', 'melancholic', 'dreamy', whole=True)
def _op_mandala(img, m, dt, size, hot, other):
    # a ring a beat from the middle out, over and over: each keeps the shape of the loudest note of its beat
    own = S['own']
    r, a = _op_polar(own)
    R = 9
    if 'p' not in own:
        own.update(p=np.zeros(R), kind=np.zeros(R, int), done=0)
    n, f = _op_step('ring', m, dt)
    s = (n - 1) % R
    if n != own['done']:
        note = int(np.argmax(_chroma()))
        own['p'][s], own['kind'][s], own['done'] = 4 + 2 * (note % 4) + 2 * s, note % 3, n
    g = (own['p'] > 0).astype(np.float32)
    g[(s + 1) % R] *= 1 - f  # the next ring goes as this one comes
    if n:
        g[s] = f
    k = np.arange(R)
    age = (s - k) % R
    w = 7.0 * size
    u = r / w
    ring = np.minimum(u.astype(int), R - 1)
    v = u % 1
    P, G = own['p'][ring], g[ring]
    th = P * a / 2 + (np.where(k % 2, -0.2, 0.2) * m['clock/mid'] * 2)[ring]
    h = np.abs(np.cos(th))
    petal = v < 0.92 * G * np.sqrt(h)
    arch = np.abs(v - 0.85 * G * h) < 0.17
    cell = (th / math.pi) % 1 - 0.5  # one bead a petal
    bead = (cell * math.pi * np.maximum(r, 1) * 2 / np.maximum(P, 1) / w) ** 2 + (v - 0.5) ** 2 < (0.4 * G) ** 2
    kind = own['kind'][ring]
    on = np.where(kind == 0, petal, np.where(kind == 1, arch, bead)) & (u < R) & (G > 0.02)
    _shade(img, on * (1.0 - 0.6 * age / R)[ring], hot, other)


@gen('op_julia', 'mysterious', 'dreamy', 'melancholic')
def _op_julia(img, m, dt, size, hot, other):
    # a Julia set, its constant just off the cardioid: the key says where on it, the mids walk it from there
    own = S['own']
    want = 2 * math.pi * max(0, int(_v('key/root', 0))) / 12
    th = own.get('th', want)
    own['th'] = th = th + ((want - th + math.pi) % (2 * math.pi) - math.pi) * min(1.0, dt / 1.2)
    a = th + 0.45 * math.sin(0.37 * m['clock/mid'])
    e = complex(math.cos(a), math.sin(a))
    c = 1.02 * (e / 2 - e * e / 4)
    turn = 0.08 * m['clock/mid']
    span = 1.6 / size / (0.92 + 0.12 * m['drive/bass']) / (N / 2)
    z = ((_X - N / 2) + 1j * (_Y - N / 2)).ravel() * (span * complex(math.cos(turn), math.sin(turn)))
    z = z.astype(np.complex64)
    idx = np.arange(N * N)
    cnt = np.zeros(N * N, np.float32)
    top = 24
    for _ in range(top):
        z = z * z + c
        keep = z.real * z.real + z.imag * z.imag < 4
        z, idx = z[keep], idx[keep]
        cnt[idx] += 1
    buf = (cnt % 2 == 0) * (0.35 + 0.9 * cnt / top)
    buf[cnt < 4] = 0
    buf[idx] = 0.25 + 0.6 * np.abs(z)
    _shade(img, buf.reshape(N, N), hot, other)


@gen('op_sierpinski', 'focused', 'tense', 'mysterious')
def _op_sierpinski(img, m, dt, size, hot, other):
    # the chaos game: points hop halfway to a corner, and the corners are the lows, the mids and the highs, so the points
    # crowd the loud one
    own, rng = S['own'], S['rng']
    _trail(dt, 0.18)
    if 'p' not in own:
        own['p'] = rng.uniform(0.3 * N, 0.7 * N, (1800, 2)).astype(np.float32)
    b = _bands()
    w = (np.array([b[:3].mean(), b[3:7].mean(), b[7:].mean()]) + 0.1) ** 2
    edges = np.cumsum(w / w.sum())[:2]
    a = 0.05 * m['clock/treb'] + np.arange(3) * 2 * math.pi / 3 + math.pi / 2
    vx, vy = N / 2 + 0.48 * N * size * np.cos(a), N * 0.44 + 0.48 * N * size * np.sin(a)
    p = own['p']
    for _ in range(2):
        pick = np.searchsorted(edges, rng.random(len(p)))
        p[:, 0] = (p[:, 0] + vx[pick]) / 2
        p[:, 1] = (p[:, 1] + vy[pick]) / 2
        _plot(S['trail'], p[:, 0], p[:, 1], np.float32(0.08))
    _shade(img, S['trail'], hot, other)


@gen('op_koch', 'aggressive', 'focused', 'happy')
def _op_koch(img, m, dt, size, hot, other):
    # a Koch snowflake gaining a level of spikes every two beats and losing them again; the backbeat jabs them out
    n, f = _op_step('koch', m, dt, 0.5)
    x = _op_updown(n, f, 4)
    full = min(int(x), 3)
    snare = _recent('snares', m['hit/snare'], m, dt)
    jab = 1 + (0.45 * snare * math.exp(-4 * (m['beat/phase'] % 1.0)) if int(m['beat/count']) % 2 else 0)
    a = 2 * math.pi * np.arange(4) / 3 + 0.12 * m['clock/mid']
    z = 0.37 * N * size * np.exp(1j * a)
    out = complex(math.cos(math.pi / 3), -math.sin(math.pi / 3))
    for d in range(full + 1):
        s = (z[1:] - z[:-1]) / 3
        p1 = z[:-1] + s
        mid = p1 + s / 2
        new = np.empty(4 * len(s) + 1, complex)
        new[0:-1:4], new[1::4], new[3::4], new[-1] = z[:-1], p1, p1 + s, z[-1]
        new[2::4] = mid + (p1 + s * out - mid) * jab * (x - full if d == full else 1)
        z = new
    buf = np.zeros((N, N), np.float32)
    _plot(buf, *_op_path(z + N / 2 * (1 + 1j)), np.float32(1.0))
    _shade(img, buf, hot, other)


@gen('op_dragon', 'focused', 'mysterious', 'tense')
def _op_dragon(img, m, dt, size, hot, other):
    # paper folding: the curve doubles by swinging a copy of itself round its end, a fold every half bar, then back up
    n, f = _op_step('fold', m, dt, 0.5)
    x = 1 + _op_updown(n, f, 9)
    full = min(int(x), 9)
    z = np.array([0, 1], complex)
    for _ in range(full):
        z = np.concatenate([z, z[-1] + (z[-2::-1] - z[-1]) * 1j])
    e = x - full
    e = e * e * (3 - 2 * e)
    new = z[-1] + (z[::-1] - z[-1]) * complex(math.cos(e * math.pi / 2), math.sin(e * math.pi / 2))
    a = 0.1 * m['clock/bass'] - (full + e) * math.pi / 4
    turn = complex(math.cos(a), math.sin(a))
    z, new = z * turn, new * turn
    both = np.concatenate([z, new])
    lo, hi = complex(both.real.min(), both.imag.min()), complex(both.real.max(), both.imag.max())
    scale = 0.84 * N * size / max(hi.real - lo.real, hi.imag - lo.imag, 1e-3)
    at = N / 2 * (1 + 1j) - (lo + hi) / 2 * scale
    buf = np.zeros((N, N), np.float32)
    _plot(buf, *_op_path(z * scale + at), np.float32(0.5))
    _plot(buf, *_op_path(new * scale + at), np.float32(1.0))
    _shade(img, buf, hot, other)


@gen('op_fern', 'calm', 'melancholic', 'happy')
def _op_fern(img, m, dt, size, hot, other):
    # a fern by iteration: four maps, one picked at random; the mids curl the stem and spread the leaflets
    own, rng = S['own'], S['rng']
    _trail(dt, 0.08)
    if 'p' not in own:
        own['p'] = rng.uniform(0, 1, (2600, 2))
    mid = float(_bands()[3:7].mean())
    curl = 0.045 + (0.015 + 0.06 * mid) * math.sin(0.5 * m['clock/mid'])
    c, s, spread = 0.85 * math.cos(curl), 0.85 * math.sin(curl), 0.85 + 0.5 * mid
    maps = np.array([[0, 0, 0, 0.16, 0, 0], [c, s, -s, c, 0, 1.6], [0.2, -0.26 * spread, 0.23, 0.22, 0, 1.6],
                     [-0.15, 0.28 * spread, 0.26, 0.24, 0, 0.44]])
    p = own['p']
    for _ in range(2):
        a = maps[np.searchsorted((0.01, 0.86, 0.93), rng.random(len(p)))]
        p = np.stack([a[:, 0] * p[:, 0] + a[:, 1] * p[:, 1] + a[:, 4], a[:, 2] * p[:, 0] + a[:, 3] * p[:, 1] + a[:, 5]], 1)
        _plot(S['trail'], N * 0.48 + p[:, 0] * N * 0.08 * size, N * 0.03 + p[:, 1] * N * 0.085 * size, np.float32(0.25))
    own['p'] = p
    _shade(img, S['trail'], hot, other)


@gen('op_clifford', 'dreamy', 'mysterious', 'euphoric')
def _op_clifford(img, m, dt, size, hot, other):
    # a cloud of points on a strange attractor, its folds drifting with the bass clock; the brighter the sound, the tighter
    own, rng = S['own'], S['rng']
    _trail(dt, 0.22)
    if 'p' not in own:
        own['p'] = rng.uniform(-1, 1, (3000, 2)).astype(np.float32)
    t, bright = m['clock/bass'], _v('bright', 0.5)
    a = -1.5 + 0.3 * math.sin(0.13 * t) - 0.6 * (bright - 0.5)
    b = 1.6 + 0.3 * math.sin(0.17 * t + 1)
    c = 1.0 + 0.5 * math.sin(0.11 * t + 2)
    d = 0.8 + 0.4 * math.sin(0.19 * t)
    p = own['p']
    x, y = p[:, 0].copy(), p[:, 1].copy()
    p[:, 0], p[:, 1] = np.sin(a * y) + c * np.cos(a * x), np.sin(b * x) + d * np.cos(b * y)
    _plot(S['trail'], N / 2 + 0.47 * N * size / (1 + abs(c)) * p[:, 0], N / 2 + 0.47 * N * size / (1 + abs(d)) * p[:, 1], np.float32(0.17))
    _shade(img, S['trail'], hot, other)


def _op_gasket(rho, rad):
    # Apollonian circles, generation by generation, as rim points: the circle, its centre and radius, its generation.
    # Circles are (curvature, curvature x centre), and Descartes swaps one for its twin across the other three
    k3 = -1 + 1 / (rho * (1 - rho))
    o, a, b, c = (-1.0, 0j), (1 / rho, complex((1 - rho) / rho)), (1 / (1 - rho), complex(-rho / (1 - rho))), (k3, complex((1 - rho) / rho - rho / (1 - rho), 2))
    found = [(o, 0), (a, 0), (b, 0), (c, 0)]
    todo = [(o, a, b, c), (o, a, c, b), (o, b, c, a), (a, b, c, o)]
    for g in range(1, 7):
        nxt = []
        for p, q, r, s in todo:
            d = (2 * (p[0] + q[0] + r[0]) - s[0], 2 * (p[1] + q[1] + r[1]) - s[1])
            if d[0] * 1.5 < rad:
                found.append((d, g))
                nxt += [(p, q, d, r), (p, r, d, q), (q, r, d, p)]
        todo = nxt
    k = np.array([c[0][0] for c in found])
    at = np.array([c[0][1] for c in found]) / k
    gen_ = np.array([c[1] for c in found])
    r = 1 / np.abs(k)
    many = (5 * r * rad).astype(int) + 8
    who = np.repeat(np.arange(len(k)), many)
    ang = 2 * math.pi * (np.arange(len(who)) - np.repeat(np.cumsum(many) - many, many)) / many[who]
    return dict(rim=np.exp(1j * ang), at=at[who], r=r[who], g=gen_[who])


@gen('op_apollo', 'happy', 'euphoric', 'drop')
def _op_apollo(img, m, dt, size, hot, other):
    # circles packed in a circle, a generation a beat, as bright as the kicks; then they go and the key starts another
    own = S['own']
    strength = _recent('kicks', max(m['hit/kick'], 0.8 * m['hit/bass']), m, dt)
    n, f = _op_step('apollo', m, dt)
    s = n % 9
    rad = 0.46 * N * size
    if 'gasket' not in own or (s == 0 and own['n'] != n):
        own['gasket'] = _op_gasket(0.28 + 0.44 * (max(0, int(_v('key/root', 0))) * 5 % 12) / 11, rad)
    own['n'] = n
    c = own['gasket']
    keep = c['g'] <= s
    g = c['g'][keep]
    grow = np.where(g == s, 1 - (1 - f) ** 3, 1.0)
    a = 0.15 * m['clock/mid']
    z = (c['at'][keep] + c['r'][keep] * grow * c['rim'][keep]) * (rad * (1 + 0.04 * strength * m['beat/pulse']) * complex(math.cos(a), math.sin(a)))
    light = (0.5 + 0.5 * (g >= s - 1)) * (0.75 + 0.4 * strength) * ((1 - f) if s == 8 else 1.0)
    buf = np.zeros((N, N), np.float32)
    _plot(buf, N / 2 + z.real, N / 2 + z.imag, light)
    _plot(buf, N / 2 + z.real * 0.985, N / 2 + z.imag * 0.985, light * (g < 2))
    _shade(img, buf, hot, other)


@gen('op_phyllo', 'calm', 'happy', 'dreamy')
def _op_phyllo(img, m, dt, size, hot, other):
    # seeds born in the middle at the golden angle, pushed out by those after them: the hats hurry the birth, and each
    # half beat a band of light runs out through the seeds
    own = S['own']
    hats = _recent('hats', m['hit/hat'], m, dt)
    own['n'] = now = own.get('n', 400.0) + dt * (6 + 30 * hats + 8 * m['drive/treb'])
    K = 340
    born = math.floor(now) - np.arange(K)
    age = now - born
    rad = np.sqrt(age) * (0.41 * N * size / math.sqrt(K))
    ang = born * 2.399963229728653 + 0.5 * math.sin(0.3 * m['clock/treb']) * rad / (0.41 * N)
    x, y = N / 2 + rad * np.cos(ang), N / 2 + rad * np.sin(ang)
    _, f = _op_step('wave', m, dt, 2)
    light = 0.55 + (0.3 + hats) * np.exp(-((age - f * K) / 30) ** 2)
    big = 0.6 + 1.6 * np.sqrt(age / K) * size
    buf = np.zeros((N, N), np.float32)
    for dx, dy in ((i, j) for i in range(-2, 3) for j in range(-2, 3) if i * i + j * j < 5):
        _plot(buf, x + dx, y + dy, np.clip(big - math.hypot(dx, dy) + 0.5, 0, 1) * light)
    _shade(img, buf, hot, other)


@gen('op_tree', 'melancholic', 'happy', 'calm')
def _op_tree(img, m, dt, size, hot, other):
    # a tree of squares, each carrying two on a right triangle, a generation a beat: even in a major key, leaning in a minor
    own = S['own']
    n, f = _op_step('grow', m, dt)
    x = _op_updown(n, f, 9) + 0.5
    major = own.get('major', _v('key/major', 0.0))
    own['major'] = major = major + (_v('key/major', 0.0) - major) * min(1.0, dt / 0.8)
    al = 0.55 + 0.235 * major + 0.05 * math.sin(0.6 * m['clock/mid'])
    e = math.cos(al) * complex(math.cos(al), math.sin(al))
    side = N * 0.125 * size
    p, v = np.array([complex(N / 2 - side / 2, N * 0.05)]), np.array([complex(side, 0)])
    buf = np.zeros((N, N), np.float32)
    for g in range(int(math.ceil(x))):
        u = np.linspace(0.06, 0.94, int(np.abs(v).max() * 1.3) + 2)
        grow = min(1.0, x - g)
        q = p[:, None, None] + v[:, None, None] * (u[None, :, None] + 1j * grow * u[None, None, :])
        ix, iy = q.real.ravel().astype(int), q.imag.ravel().astype(int)
        keep = (ix >= 0) & (ix < N) & (iy >= 0) & (iy < N)
        buf[iy[keep], ix[keep]] = 0.3 + 0.7 * g / 9
        a = p + 1j * v
        c = a + v * e
        p, v = np.concatenate([a, c]), np.concatenate([v * e, a + v - c])
    _shade(img, buf, hot, other)


@gen('op_lorenz', 'tense', 'aggressive', 'drop')
def _op_lorenz(img, m, dt, size, hot, other):
    # three threads through Lorenz's butterfly, turning in space: how charged the music is says how fast they run
    own = S['own']
    H = 1800
    if 'h' not in own:
        own.update(h=np.zeros((H, 3, 3)), p=np.array([[1, 1, 25.0], [4, 3, 20], [-7, -2, 28]]), i=0)
    p, h = own['p'], own['h']
    step = 0.0024 * (0.5 + 1.5 * _v('mood/arousal', 0.5)) * min(2.0, dt * 30)
    for _ in range(12):
        x, y, z = p[:, 0], p[:, 1], p[:, 2]
        p = p + step * np.stack([10 * (y - x), x * (28 - z) - y, x * y - 8 / 3 * z], 1)
        h[own['i'] % H] = p
        own['i'] += 1
    own['p'] = p
    i = own['i']
    keep = np.arange(H) < i
    age = ((i - 1 - np.arange(H)) % H)[keep]
    a = 0.7 * math.sin(0.25 * m['clock/bass'])
    sc = N * 0.0165 * size
    xs = N / 2 + (h[keep, :, 0] * math.cos(a) + h[keep, :, 1] * math.sin(a)) * sc
    ys = N / 2 + (h[keep, :, 2] - 25) * sc
    w = np.repeat(((1 - age / H) ** 1.3)[:, None], 3, 1)
    buf = np.zeros((N, N), np.float32)
    _plot(buf, xs.ravel(), ys.ravel(), w.ravel())
    _shade(img, buf, hot, other)
