# nature: the outdoors as light over a picture. Each element answers one part of the music:
#   nat_tree       the beat: a generation of branches a beat
#   nat_snow       the balance of treble and bass: it is the wind
#   nat_fireflies  the level: the louder, the more they blink as one, on the beat
#   nat_rings      the hats: drops on water
#   nat_aurora     the bands: each stretch of curtain as tall as its band
#   nat_clouds     the level: how much of the sky is covered
#   nat_swell      the bass: how high the sea runs
#   nat_ridge      the bands' past: three ridgelines written by treble, mids and bass as they go by
#   nat_flock      the brightness: how high the flock flies
#   nat_school     the snares: a hunter through the shoal on the backbeat
#   nat_roots      the lows: how fast they dig, with sap down them once a beat
#   nat_mycelium   the chroma: threads between the notes that sound
#   nat_meteors    the density: how many fall on the eighths, more in a drop
#   nat_sun        the kicks: how high the loops flare off the limb
#   nat_leaves     the beat's phase: they swing from side to side with it
#   nat_tide       the bar: in and out once a bar
#   nat_stars      the key: each has its own constellation, joined a star a beat
#   nat_twister    the mids: how wide it is and how fast it turns


def _nat_ink(buf, xs, ys, w):
    # light set at cells, not added: a line is as bright however many of its points land on one cell
    keep = (xs >= 0) & (xs < N) & (ys >= 0) & (ys < N)
    w = np.broadcast_to(np.asarray(w, np.float32), xs.shape)
    np.maximum.at(buf, (ys[keep].astype(int), xs[keep].astype(int)), w[keep])


def _nat_seg(buf, ax, ay, bx, by, w, n=14):
    # straight lines from a to b, arrays of them
    t = np.linspace(0, 1, n, dtype=np.float32)[:, None]
    _nat_ink(buf, ax + (bx - ax) * t, ay + (by - ay) * t, w)


def _nat_show(img, buf, hot, other, cut=0.03):
    # _shade, with what has all but faded cut off: the far end of a trail is not light
    _shade(img, np.where(buf < cut, 0, buf), hot, other)


def _nat_phase(m, rate=0.6):
    # where we are in the beat, 0..1; by the mids' clock without a tempo
    return m['beat/phase'] % 1.0 if _locked(m) else (rate * m['clock/mid']) % 1.0


def _nat_noise(rng, sx=1.0, sy=1.0, rough=2.0):
    # noise that tiles, 0..1, stretched along an axis by a smaller s
    fy = np.fft.fftfreq(N)[:, None] * N * sy
    fx = np.fft.fftfreq(N)[None, :] * N * sx
    amp = (fx * fx + fy * fy + 1.0) ** (-rough / 2)
    n = np.fft.ifft2(amp * np.exp(2j * math.pi * rng.random((N, N)))).real
    n -= n.min()
    return (n / n.max()).astype(np.float32)


def _nat_slide(n, dx, dy=0.0):
    # a tiling buffer moved by dx (between cells too) and dy cells
    k = int(math.floor(dx))
    f = np.float32(dx - k)
    a = np.roll(n, (int(dy), k), (0, 1))
    return a * (1 - f) + np.roll(a, 1, 1) * f


@gen('nat_tree', 'happy', 'calm', 'focused')
def _nat_tree(img, m, dt, size, hot, other):
    # an L-system tree, a generation of branches a beat; the crown blossoms for a bar, then a new tree starts
    own, rng = S['own'], S['rng']
    _trail(dt, 0.3)
    deep = 8
    if 'n' not in own or own['n'] > deep + 4:
        side = [np.where(np.arange(2 ** k) % 2, 1.0, -1.0).astype(np.float32) for k in range(deep)]
        own.update(n=1, at=S['t'],
                   da=[np.zeros(1, np.float32)] + [side[k] * rng.uniform(0.22, 0.62, 2 ** k).astype(np.float32) for k in range(1, deep)],
                   ln=[N * 0.2 * size * 0.8 ** k * rng.uniform(0.75, 1.15, 2 ** k).astype(np.float32) for k in range(deep)])
    if _tick('grow', m):
        own['n'] += 1
        own['at'] = S['t']
    n = own['n']
    grow = min(1.0, (S['t'] - own['at']) / _beat(m))
    sway = 0.012 * math.sin(0.8 * m['clock/mid']) * (0.5 + m['level'])
    buf = np.zeros((N, N), np.float32)
    x, y, a = np.array([N / 2], np.float32), np.array([0.0], np.float32), np.array([math.pi / 2], np.float32)
    for k in range(min(n, deep)):
        if k:
            x, y, a = x.repeat(2), y.repeat(2), a.repeat(2)
        a = a + own['da'][k] + sway * (k + 1)
        new = k == n - 1
        ln = own['ln'][k] * (grow if new else 1.0)
        bx, by = x + ln * np.cos(a), y + ln * np.sin(a)
        w = 1.0 if new else 0.5 + 0.3 * m['beat/pulse']
        _nat_seg(buf, x, y, bx, by, w)
        if k < 3:  # the trunk and the big boughs are thicker
            _nat_seg(buf, x + 1, y, bx + 1, by, w)
        if k < 1:
            _nat_seg(buf, x - 1, y, bx - 1, by, w)
        x, y = bx, by
    if n >= deep:  # blossom on the tips, as much as there is light in the music
        open_ = min(1.0, (n - deep + grow) / 2) * (0.5 + 0.5 * m['level'])
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            _nat_ink(buf, x + dx, y + dy, open_)
    S['trail'] = np.maximum(S['trail'], buf)
    _nat_show(img, S['trail'], hot, other)


@gen('nat_snow', 'melancholic', 'calm', 'dreamy')
def _nat_snow(img, m, dt, size, hot, other):
    # snow on a wind that blows to the right with the treble and to the left with the bass; it lies in a drift that melts
    own, rng = S['own'], S['rng']
    _trail(dt, 0.09)
    k = 320
    if 'p' not in own:
        own.update(p=np.stack([rng.uniform(0, N, k), rng.uniform(0, N, k), rng.uniform(0.2, 1, k)], 1).astype(np.float32),
                   wind=0.0, drift=np.zeros(N, np.float32))
    b = _bands()
    gust = 2.4 * float(b[6:].mean() - b[:4].mean()) + 0.5 * math.sin(0.3 * m['clock/mid'])
    own['wind'] += (gust - own['wind']) * min(1.0, 1.5 * dt)
    p, drift = own['p'], own['drift']
    near = p[:, 2]
    p[:, 0] = (p[:, 0] + dt * N * (0.5 * own['wind'] * near + 0.05 * np.sin(0.15 * p[:, 1] + 7 * near + m['clock/treb']))) % N
    p[:, 1] -= dt * N * (0.07 + 0.2 * near)
    col = p[:, 0].astype(int) % N
    down = p[:, 1] < drift[col]
    np.add.at(drift, col[down], np.float32(0.5 * size))
    p[down, 1] = N + 2
    p[down, 0] = rng.uniform(0, N, int(down.sum()))
    drift[:] = (0.5 * drift + 0.25 * np.roll(drift, 1) + 0.25 * np.roll(drift, -1)) * math.exp(-dt / 12)
    np.minimum(drift, 0.24 * N, out=drift)
    show = int(100 + 220 * min(1.0, m['high'] + 4 * m['busy']))
    q = p[:show]
    _nat_ink(S['trail'], q[:, 0], q[:, 1], 0.25 + 0.75 * q[:, 2] ** 2)
    big = q[q[:, 2] > 0.72]  # the nearest are bigger
    for dx, dy in ((1, 0), (0, 1), (1, 1)):
        _nat_ink(S['trail'], big[:, 0] + dx, big[:, 1] + dy, 0.7 * big[:, 2])
    lying = np.clip(1 - np.abs(_Y - drift[None, :]) / 1.3, 0, 1) * (drift[None, :] > 1) * 0.7 \
        + (_Y < drift[None, :]) * np.float32(0.14)
    _nat_show(img, np.maximum(S['trail'], lying), hot, other)


@gen('nat_fireflies', 'dreamy', 'calm', 'mysterious')
def _nat_fireflies(img, m, dt, size, hot, other):
    # fireflies, each blinking by its own clock: the louder the music the harder they are pulled to the beat, till they
    # blink as one, and when it falls away they drift apart. More of them are awake the busier it is
    own, rng = S['own'], S['rng']
    _trail(dt, 0.16)
    k = 46
    if 'ph' not in own:
        own.update(ph=rng.random(k).astype(np.float32), rate=rng.uniform(0.7, 1.3, k).astype(np.float32),
                   home=np.stack([rng.uniform(0.05, 0.95, k), rng.uniform(0.06, 0.8, k)], 1).astype(np.float32) * N,
                   w=rng.uniform(0.5, 1.4, (k, 2)).astype(np.float32), o=rng.uniform(0, 6.28, (k, 2)).astype(np.float32))
    ph = own['ph']
    if _locked(m):  # a blink every other beat
        target = ((int(m['beat/count']) % 2) + m['beat/phase'] % 1.0) / 2
    else:  # or whatever most of them are doing
        target = float(np.angle(np.exp(2j * math.pi * ph).mean())) / (2 * math.pi)
    pull = 2.2 * max(0.0, m['level'] - 0.4)
    ph += dt * (own['rate'] / (2 * _beat(m)) + pull * np.sin(2 * math.pi * (target - ph)))
    ph %= 1.0
    awake = int(14 + 32 * min(1.0, 5 * m['busy'] + 0.5 * m['high']))
    c = m['clock/treb']
    x = own['home'][:, 0] + 11 * size * np.sin(0.5 * c * own['w'][:, 0] + own['o'][:, 0])
    y = own['home'][:, 1] + 8 * size * np.sin(0.4 * c * own['w'][:, 1] + own['o'][:, 1])
    light = (0.12 + 1.1 * np.clip(1 - ph / 0.4, 0, 1) ** 2)[:awake]
    x, y = x[:awake], y[:awake]
    for dx, dy, f in ((0, 0, 1), (1, 0, 0.6), (-1, 0, 0.6), (0, 1, 0.6), (0, -1, 0.6), (1, 1, 0.3), (-1, 1, 0.3), (1, -1, 0.3),
                      (-1, -1, 0.3), (2, 0, 0.2), (-2, 0, 0.2), (0, 2, 0.2), (0, -2, 0.2)):
        _nat_ink(S['trail'], x + dx, y + dy, light * f)
    _nat_show(img, S['trail'], hot, other)


@gen('nat_rings', 'melancholic', 'calm', 'focused')
def _nat_rings(img, m, dt, size, hot, other):
    # rain on still water seen from the bank: every sixteenth a drop may land, as likely as the hats are strong
    own, rng = S['own'], S['rng']
    r = own.setdefault('r', np.zeros((0, 4), np.float32))  # x, y, age, strength
    hats = _recent('hats', max(m['hit/hat'], 0.5 * m['hit/snare']), m, dt)
    if _tick('drop', m, 4) and rng.random() < 0.2 + 0.8 * max(hats, 0.7 * m['high']):
        y = N * 0.66 * rng.random() ** 1.3
        r = np.concatenate([r, [[rng.uniform(0.04, 0.96) * N, y, 0.0, rng.uniform(0.6, 1.0)]]]).astype(np.float32)
    r[:, 2] += dt / 1.5
    own['r'] = r = r[r[:, 2] < 1][-24:]
    buf = np.zeros((N, N), np.float32)
    a = np.linspace(0, 2 * math.pi, 80, dtype=np.float32)[:, None]
    near = 1.25 - r[:, 1] / N * 1.4  # nearer the bank they are bigger
    for f, w in ((1.0, 0.9), (0.66, 0.6), (0.36, 0.4)):
        rad = 26 * size * near * f * np.sqrt(r[:, 2])
        _nat_ink(buf, r[:, 0] + rad * np.cos(a), r[:, 1] + 0.36 * rad * np.sin(a), w * r[:, 3] * (1 - r[:, 2]) ** 1.4)
    s = np.arange(0, N, 1, dtype=np.float32)  # the far bank, broken by the treble
    far = 0.3 * np.clip(np.sin(0.5 * s + 2 * m['clock/treb']) + np.sin(0.13 * s - m['clock/treb']), 0, 1)
    _nat_ink(buf, s, np.full(N, N * 0.7, np.float32), far)
    _nat_show(img, buf, hot, other)


@gen('nat_aurora', 'dreamy', 'mysterious', 'euphoric', 'drop', whole=True)
def _nat_aurora(img, m, dt, size, hot, other):
    # two curtains hung across the sky, each stretch as tall as its band, the rays running along them with the treble
    own, rng = S['own'], S['rng']
    if 'rays' not in own:
        n = rng.random(256)
        own['rays'] = (0.5 * n + 0.3 * np.roll(n, 1) + 0.2 * np.roll(n, -1)).astype(np.float32)
    b = _bands()
    cm, ct = m['clock/mid'], m['clock/treb']
    x = _X[0]
    for lay in (0, 1):
        fold = np.sin(x * 0.045 + 0.35 * cm + 2.2 * lay) + 0.5 * np.sin(x * 0.11 - 0.5 * cm + lay)
        xw = x + 10 * fold
        lev = np.interp(xw / N * 9, np.arange(10), b if lay else b[::-1]).astype(np.float32)
        ray = own['rays'][(xw * 1.6 + 9 * ct + 90 * lay).astype(int) % 256]
        base = N * (0.3 + 0.08 * fold + 0.14 * lay)
        tall = N * (0.1 + 0.5 * lev) * (0.4 + 0.8 * ray) * size
        light = (0.2 + 1.1 * lev) * (0.35 + 0.8 * ray)
        d = _Y - base[None, :]
        up = np.exp(-np.maximum(d, 0) / tall[None, :])
        c = up * light[None, :] * np.clip(1 + d / 2.5, 0, 1)
        c = np.where(c < 0.04, 0, c)[..., None]
        low = (up * up)[..., None]
        img += c * (hot * low + other * (1 - low))


@gen('nat_clouds', 'calm', 'melancholic', 'dreamy', whole=True)
def _nat_clouds(img, m, dt, size, hot, other):
    # clouds going over with their edges lit: the louder the music the more of the sky they cover
    own, rng = S['own'], S['rng']
    if 'a' not in own:
        own.update(a=_nat_noise(rng, 1.0, 2.0, 2.2), b=_nat_noise(rng, 1.0, 2.0, 1.8), cover=m['level'])
    own['cover'] += (m['level'] - own['cover']) * min(1.0, 1.2 * dt)
    cb = m['clock/bass']
    n = 0.65 * _nat_slide(own['a'], 5 * cb) + 0.35 * _nat_slide(own['b'], 2.6 * cb)
    i = (np.arange(N) / size).astype(int) % N
    n = n[i][:, i]
    d = np.clip((n - (0.56 - 0.2 * own['cover'])) / 0.14, 0, 1)
    rim = np.clip(d - np.roll(d, (-3, 2), (0, 1)), 0, 1)
    _nat_show(img, 0.1 * d + 1.2 * rim, hot, other, 0.02)


@gen('nat_swell', 'calm', 'melancholic', 'tense')
def _nat_swell(img, m, dt, size, hot, other):
    # the sea out to the horizon under a low moon, the crests rolling in as high as the bass, a road of light across them
    hz = N * 0.6
    k = 13
    u = 0.5 * m['clock/bass']
    first = math.floor(u)
    row = np.arange(k, dtype=np.float32)[:, None]
    z = k - row - (u - first) + 0.4  # far to near
    ident = first + row
    p = 1 / z
    x = (np.arange(N * 2, dtype=np.float32) / 2)[None, :]
    wave = np.sin(x * (0.035 + 0.3 * p ** 0.0 / (3 + 1 / p)) + 2.4 * ident + 0.4 * m['clock/mid'])
    amp = N * (0.015 + 0.2 * m['drive/bass']) * size * p ** 0.8
    y = hz * (1 - 1.15 * p ** 0.75) + amp * wave
    cx = N * (0.5 + 0.12 * math.sin(0.05 * m['clock/mid']))
    road = np.exp(-((x - cx) / (3 + 36 * p)) ** 2)
    crest = np.clip(0.5 + 0.8 * wave, 0, 1)
    glint = np.clip(np.sin(x * 1.7 + 5.1 * ident + 3 * m['clock/treb']) + 0.6, 0, 1)
    w = (0.25 + 0.6 * p ** 0.5) * crest * (0.45 + 1.1 * road * glint) * np.clip((k - z) / 2.5, 0, 1)
    buf = np.zeros((N, N), np.float32)
    _nat_ink(buf, np.broadcast_to(x, y.shape), np.minimum(y, hz - 1), w)
    s = x[0]
    _nat_ink(buf, s, np.full_like(s, hz), np.float32(0.3))
    moon = np.hypot(_X - cx, _Y - N * 0.82)
    r = N * 0.075 * size
    buf += np.clip(1 - np.abs(moon - r), 0, 1) * 0.8 + (moon < r) * np.float32(0.1 + 0.2 * m['level'])
    _nat_show(img, buf, hot, other)


@gen('nat_ridge', 'focused', 'tense', 'mysterious')
def _nat_ridge(img, m, dt, size, hot, other):
    # three ridgelines going by, each written column by column as the sound passes: treble far off, the mids, the bass near.
    # Each hides what is behind it
    own, rng = S['own'], S['rng']
    base, amp, rough = (0.5 * N, 0.34 * N, 1.1 * N / 125), (0.3 * N, 0.3 * N, 1.5 * N / 125), (0.1 * N, 0.24 * N, 1.9 * N / 125)
    if 'h' not in own:
        h = np.zeros((3, N), np.float32)
        for i in range(3):
            h[i] = base[i] + amp[i] * 0.5 * _nat_noise(rng, 1.0, 1.0, 1.6)[i]
        own.update(h=h, slope=np.ones(3, np.float32))
    h = own['h']
    if _tick('ridge', m, 4):
        b = _bands()
        lev = (float(b[7:].mean()), float(b[3:7].mean()), float(b[:3].mean()))
        for i in range(3):
            for _ in range(i + 1):  # the near one goes by faster
                top = base[i] + amp[i] * min(1.0, 1.6 * lev[i]) * size
                if h[i, -1] > top:
                    own['slope'][i] = -1
                elif h[i, -1] < base[i] + 0.25 * (top - base[i]) or rng.random() < 0.12:
                    own['slope'][i] = 1 if h[i, -1] < 0.5 * (base[i] + top) else -1
                new = h[i, -1] + own['slope'][i] * rng.uniform(0.3, 1.5) * rough[i] * 1.5 + rng.normal(0, 0.5 * rough[i])
                h[i, :-1] = h[i, 1:]
                h[i, -1] = new
    buf = np.zeros((N, N), np.float32)
    for i, w in enumerate((0.55, 0.75, 1.0)):
        line = h[i][None, :]
        d = line - _Y
        lit = np.clip(1 - np.abs(d) / 1.2, 0, 1) * w + np.clip(d, 0, None) ** 0 * (d > 0) * np.exp(-np.maximum(d, 0) / (3 + 3 * i)) * 0.3 * w
        buf = np.where(d > 0, lit, np.maximum(buf, lit))
    _nat_show(img, buf * (0.75 + 0.25 * m['level']), hot, other)


@gen('nat_flock', 'happy', 'euphoric', 'dreamy')
def _nat_flock(img, m, dt, size, hot, other):
    # a flock wheeling about the sky: brighter sound takes it up, darker brings it down; the wings beat with the beat
    own, rng = S['own'], S['rng']
    _trail(dt, 0.07)
    k = 90
    if 'p' not in own:
        p = rng.uniform(0.3, 0.7, (k, 2)) * N
        a = rng.uniform(0, 6.28, k)
        own.update(p=p.astype(np.float32), v=(np.stack([np.cos(a), np.sin(a)], 1) * 30).astype(np.float32), y=0.5, o=rng.random(k))
    p, v = own['p'], own['v']
    own['y'] += (_v('bright', 0.5) - own['y']) * min(1.0, 1.0 * dt)
    c = m['clock/mid']
    go = np.array([N * (0.5 + 0.36 * math.sin(0.43 * c) + 0.08 * math.sin(1.1 * c)),
                   N * (0.1 + 0.85 * own['y'] + 0.1 * math.sin(0.7 * c))], np.float32)
    d = p[:, None, :] - p[None, :, :]
    r2 = (d * d).sum(2) + 0.01
    close = (r2 < 170).astype(np.float32)
    apart = (d / r2[..., None] * (r2 < 16)[..., None]).sum(1)
    along = close @ v / close.sum(1, keepdims=True) - v
    home = go - p
    home = home / (np.hypot(home[:, 0], home[:, 1])[:, None] + 1)
    v += dt * (4 * along + 900 * apart + 110 * home)
    speed = N * (0.42 + 0.35 * m['level'])
    v *= speed / (np.hypot(v[:, 0], v[:, 1])[:, None] + 1e-3)
    p += dt * v
    dirn = v / speed
    flap = 0.5 + 0.5 * np.sin(2 * math.pi * (2 * _nat_phase(m) + own['o'] * 0.25))
    x, y = p[:, 0], p[:, 1]
    span = (1.4 + 1.2 * flap) * size
    for side in (1, -1):
        wx = x - dirn[:, 0] * 1.8 * size + side * dirn[:, 1] * span
        wy = y - dirn[:, 1] * 1.8 * size - side * dirn[:, 0] * span + flap
        _nat_seg(S['trail'], x, y, wx, wy, np.float32(0.9), 5)
    _nat_show(img, S['trail'], hot, other, 0.05)


@gen('nat_school', 'mysterious', 'tense', 'focused')
def _nat_school(img, m, dt, size, hot, other):
    # a school of fish milling in a ball; on the backbeat, while snares are heard, a hunter goes through it and it bursts
    # open round him and closes behind. Those that bolt are the bright ones
    own, rng = S['own'], S['rng']
    k = 190
    if 'p' not in own:
        own.update(th=rng.uniform(0, 6.28, k).astype(np.float32), r=(N * 0.36 * size * np.sqrt(rng.uniform(0.08, 1, k))).astype(np.float32),
                   w=rng.uniform(0.8, 1.2, k).astype(np.float32), p=rng.uniform(0.3, 0.7, (k, 2)).astype(np.float32) * N,
                   v=np.zeros((k, 2), np.float32), prey=None)
    snare = _recent('snares', max(m['hit/snare'], 0.7 * m['hit/hat']), m, dt)
    cm = m['clock/mid']
    cx, cy = N * (0.5 + 0.1 * math.sin(0.21 * cm)), N * (0.5 + 0.08 * math.cos(0.27 * cm))
    if _locked(m):
        fire = _tick('hunt', m) and int(m['beat/count']) % 2 == 1 and snare > 0.3
    else:
        fire = _tick('hunt', m, 0.25)
    if fire:
        a, off = rng.uniform(0, 6.28), rng.uniform(-0.15, 0.15) * N
        ux, uy = math.cos(a), math.sin(a)
        own['prey'] = [cx - ux * 0.8 * N - uy * off, cy - uy * 0.8 * N + ux * off, ux, uy, S['t'], max(0.6, snare)]
    p, v, th, r = own['p'], own['v'], own['th'], own['r']
    th += dt * own['w'] * (0.5 + 1.3 * m['drive/treb']) * (14 / np.sqrt(r + 4))
    hx, hy = cx + r * 1.12 * np.cos(th), cy + r * 0.7 * np.sin(th)
    fx, fy = 26 * (hx - p[:, 0]) - 9 * v[:, 0], 26 * (hy - p[:, 1]) - 9 * v[:, 1]
    if own['prey']:
        x0, y0, ux, uy, at, s = own['prey']
        go = (S['t'] - at) / max(0.5, 2 * _beat(m))
        if go > 1:
            own['prey'] = None
        else:
            qx, qy = x0 + ux * 1.6 * N * go, y0 + uy * 1.6 * N * go
            dx, dy = p[:, 0] - qx, p[:, 1] - qy
            dist = np.hypot(dx, dy) + 0.5
            push = 9000 * s * np.clip(1 - dist / (0.24 * N * size), 0, 1) / dist
            fx, fy = fx + push * dx, fy + push * dy
    v[:, 0] += dt * fx
    v[:, 1] += dt * fy
    p += dt * v
    tx, ty = -np.sin(th) * 1.12 + v[:, 0] / 60, np.cos(th) * 0.7 + v[:, 1] / 60  # which way it faces
    n = np.hypot(tx, ty) + 1e-3
    bolt = np.hypot(v[:, 0], v[:, 1])
    buf = np.zeros((N, N), np.float32)
    _nat_seg(buf, p[:, 0], p[:, 1], p[:, 0] - 3.2 * size * tx / n, p[:, 1] - 3.2 * size * ty / n, np.clip(0.42 + bolt / 90, 0, 1.0), 5)
    _nat_show(img, buf, hot, other)


@gen('nat_roots', 'tense', 'mysterious', 'melancholic')
def _nat_roots(img, m, dt, size, hot, other):
    # roots feeling their way down from the surface, as fast as the lows allow, forking; sap runs down them once a beat
    own, rng = S['own'], S['rng']
    _trail(dt, 0.28)
    top = N * 0.9
    if 'd' not in own:
        k = 6
        own.update(d=np.zeros((N, N), np.float32), rest=0.0,
                   tips=np.stack([rng.uniform(0.15, 0.85, k) * N, np.full(k, top), rng.uniform(-2.0, -1.1, k), np.zeros(k)], 1).astype(np.float32))
    d, tips = own['d'], own['tips']
    low = float(_bands()[:3].mean())
    if _tick('root', m, 4) and len(tips):
        for _ in range(1 + int(3 * low)):
            k = len(tips)
            turn = (-math.pi / 2 - tips[:, 2]) * 0.1
            tips[:, 2] += rng.normal(0, 0.34, k) + turn
            tips[:, 0] += 1.4 * size * np.cos(tips[:, 2])
            tips[:, 1] += 1.4 * size * np.sin(tips[:, 2])
            tips[:, 3] += 1.4
            tips = tips[(tips[:, 1] > 1) & (tips[:, 0] > 0) & (tips[:, 0] < N - 1)]
            xi, yi = tips[:, 0].astype(int), np.minimum(tips[:, 1].astype(int), N - 1)
            d[yi, xi] = tips[:, 3]
            thick = tips[:, 3] < 40
            d[yi[thick], xi[thick] + 1] = tips[thick, 3]
            fork = tips[rng.random(len(tips)) < 0.07]
            if len(fork) and len(tips) < 44:
                fork = fork.copy()
                fork[:, 2] += rng.choice((-0.8, 0.8), len(fork))
                tips = np.concatenate([tips, fork])
            tips = tips[rng.random(len(tips)) > 0.005]
        own['tips'] = tips
    if not len(tips):  # it has dug all it can: a new one, after a bar
        own['rest'] += dt
        if own['rest'] > 4 * _beat(m):
            del own['d']
            return
    far = float(d.max()) + 14
    sap = np.exp(-((d - _nat_phase(m) * far) / 8) ** 2)
    light = np.where(d > 0, 0.3 + (0.3 + 0.7 * low) * sap * 1.1, 0).astype(np.float32)
    S['trail'] = np.maximum(S['trail'], light)
    S['trail'][int(top)] = np.maximum(S['trail'][int(top)], 0.3 + 0.3 * m['level'])
    _nat_show(img, S['trail'], hot, other)


@gen('nat_mycelium', 'mysterious', 'focused', 'tense', whole=True)
def _nat_mycelium(img, m, dt, size, hot, other):
    # threads of a mould between twelve feeding spots, the notes round a circle of fifths: it joins the notes that sound
    own, rng = S['own'], S['rng']
    k = 1600
    if 'p' not in own:
        ang = 2 * math.pi * ((np.arange(12) * 7) % 12) / 12 + math.pi / 2
        nx, ny = N / 2 + 0.4 * N * np.cos(ang), N / 2 + 0.4 * N * np.sin(ang)
        spots = np.exp(-((_X[None] - nx[:, None, None]) ** 2 + (_Y[None] - ny[:, None, None]) ** 2) / (2 * (2.6 * size) ** 2))
        own.update(p=rng.uniform(0.1, 0.9, (k, 2)).astype(np.float32) * N, a=rng.uniform(0, 6.28, k).astype(np.float32),
                   tr=np.zeros((N, N), np.float32), spots=spots.astype(np.float32).reshape(12, -1))
    p, a, tr = own['p'], own['a'], own['tr']
    c = np.array([_v('chroma/%d' % i) for i in range(12)], np.float32)
    c = (c / max(float(c.max()), 1e-3)) ** 2
    food = (c @ own['spots']).reshape(N, N)
    field = tr + 3 * food

    def sense(turn):
        return field[(p[:, 1] + 7 * np.sin(a + turn)).astype(int) % N, (p[:, 0] + 7 * np.cos(a + turn)).astype(int) % N]

    left, mid, right = sense(0.6), sense(0.0), sense(-0.6)
    a += np.where(mid >= np.maximum(left, right), 0, np.where(left > right, 0.45, -0.45)) + rng.normal(0, 0.12, k).astype(np.float32)
    speed = dt * N * (0.3 + 0.35 * _v('drive/mid', 0.4))
    p[:, 0] = (p[:, 0] + speed * np.cos(a)) % N
    p[:, 1] = (p[:, 1] + speed * np.sin(a)) % N
    np.add.at(tr, (p[:, 1].astype(int), p[:, 0].astype(int)), np.float32(0.16))
    tr = (4 * tr + np.roll(tr, 1, 0) + np.roll(tr, -1, 0) + np.roll(tr, 1, 1) + np.roll(tr, -1, 1)) / 8
    own['tr'] = tr = tr * math.exp(-dt / 0.5)
    _nat_show(img, np.clip(tr, 0, 1) ** 1.3 * 1.5 + food * (0.7 + 0.3 * m['beat/pulse']), hot, other, 0.09)


@gen('nat_meteors', 'aggressive', 'euphoric', 'tense', 'drop')
def _nat_meteors(img, m, dt, size, hot, other):
    # a meteor shower out of one point of the sky, on the eighths: as many as the music is dense, and more in a drop
    own, rng = S['own'], S['rng']
    p = own.setdefault('p', np.zeros((0, 6), np.float32))  # x, y, vx, vy, life, light
    cm = m['clock/mid']
    rx, ry = N * (0.5 + 0.25 * math.sin(0.09 * cm)), N * (0.86 + 0.05 * math.sin(0.13 * cm))
    if _tick('fall', m, 2):
        drop = m['section/drop']
        n = 1 + int(5 * min(1.0, 5 * m['busy'] + 0.4 * m['high']) * (1 + 1.5 * drop))
        a = rng.uniform(math.pi * 1.02, math.pi * 1.98, n)
        far = rng.uniform(0.04, 0.42, n) * N
        v = rng.uniform(1.3, 2.3, n) * N
        new = np.stack([rx + far * np.cos(a), ry + far * np.sin(a), v * np.cos(a), v * np.sin(a), rng.uniform(0.3, 0.6, n),
                        rng.uniform(0.6, 1.2, n) * (1 + 0.4 * drop)], 1).astype(np.float32)
        p = np.concatenate([p, new])[-60:]
    p[:, 0] += dt * p[:, 2]
    p[:, 1] += dt * p[:, 3]
    p[:, 4] -= dt
    own['p'] = p = p[p[:, 4] > 0]
    buf = np.zeros((N, N), np.float32)
    t = np.linspace(0, 1, 30, dtype=np.float32)[:, None]
    tail = 0.13 * size * (1 + 0.5 * m['high'])
    x, y = p[:, 0] - p[:, 2] * tail * t, p[:, 1] - p[:, 3] * tail * t
    w = (1 - t) ** 1.6 * p[:, 5] * np.clip(p[:, 4] * 7, 0, 1)
    _nat_ink(buf, x, y, w)
    _nat_ink(buf, x + 1, y, w * (t < 0.3) * 0.8)  # the head is heavier
    _nat_ink(buf, x, y + 1, w * (t < 0.15) * 0.8)
    dots = np.hypot(_X - rx, _Y - ry)
    buf += np.clip(1 - dots / (2.5 + 2 * m['beat/pulse']), 0, 1) * 0.8  # the point they come from
    _nat_show(img, buf, hot, other)


@gen('nat_sun', 'euphoric', 'happy', 'aggressive', 'drop')
def _nat_sun(img, m, dt, size, hot, other):
    # the sun's limb, rising with the level, a dark disc with the picture in it; on the beat a loop flares off it, as high
    # as the kicks are hard, and breaks at the top as it goes
    own, rng = S['own'], S['rng']
    flares = own.setdefault('f', [])
    own['rise'] = own.get('rise', m['level']) + (m['level'] - own.get('rise', m['level'])) * min(1.0, dt)
    kicks = _recent('kicks', max(m['hit/kick'], 0.8 * m['hit/bass']), m, dt)
    rad = N * 0.33 * size
    cx, cy = N / 2, N * (-0.14 + 0.36 * own['rise'])
    if _tick('flare', m):
        flares.append([rng.uniform(0.25, math.pi - 0.25), rng.uniform(0.14, 0.34), S['t'], max(0.45, kicks)])
    x, y = _X - cx, _Y - cy
    r = np.hypot(x, y)
    a = np.arctan2(y, x)
    cb = m['clock/bass']
    boil = 1 + 0.3 * np.sin(7 * a + 0.8 * cb) + 0.2 * np.sin(17 * a - 1.3 * cb) + 0.12 * np.sin(31 * a + 2 * cb)
    out = np.maximum(r - rad, 0)
    corona = np.exp(-out / (N * (0.03 + 0.09 * m['level']) * boil)) * (r > rad) * 0.5
    buf = (corona + np.clip(1 - np.abs(r - rad) / 1.6, 0, 1) + 0.16 * (r < rad) * (r / rad) ** 6).astype(np.float32)
    s = np.linspace(0, 1, 90, dtype=np.float32)[:, None]
    for f in flares:
        go = (S['t'] - f[2]) / (3 * _beat(m))
        rise = min(1.0, 2.2 * go) ** 0.7
        for lift, w in ((1.0, 1.0), (0.78, 0.8), (0.56, 0.6)):
            ang = f[0] + f[1] * lift ** 0.5 * (2 * s - 1)
            rr = rad + N * (0.12 + 0.34 * f[3]) * size * rise * lift * np.abs(np.sin(math.pi * s)) ** 0.8
            gap = np.abs(s - 0.5) >= max(0.0, go - 0.5)  # it breaks from the top
            _nat_ink(buf, cx + rr * np.cos(ang), cy + rr * np.sin(ang), w * (1 - go) ** 0.7 * gap)
    own['f'] = [f for f in flares if S['t'] - f[2] < 2.9 * _beat(m)][-6:]
    _nat_show(img, buf, hot, other, 0.05)


@gen('nat_leaves', 'melancholic', 'happy', 'calm')
def _nat_leaves(img, m, dt, size, hot, other):
    # leaves coming down, swinging from side to side with the beat and dropping through the middle of each swing; they
    # lie where they land for a while
    own, rng = S['own'], S['rng']
    k = 20
    if 'x' not in own:
        u, v = np.meshgrid(np.linspace(-1, 1, 19), np.linspace(-1, 1, 9))
        u, v = u.ravel(), v.ravel()
        inside = np.abs(v) <= (1 - u * u) * (1 - 0.35 * u)  # pointed at both ends, fuller to the stalk
        own.update(u=u[inside].astype(np.float32), v=v[inside].astype(np.float32), x=rng.uniform(0, N, k).astype(np.float32),
                   y=rng.uniform(0.1, 1.3, k).astype(np.float32) * N, side=rng.choice((-1.0, 1.0), k).astype(np.float32),
                   lean=rng.uniform(0, 6.28, k).astype(np.float32), big=rng.uniform(5, 9, k).astype(np.float32),
                   rest=np.zeros(k, np.float32), flat=np.zeros(k, np.float32), low=rng.uniform(2, 12, k).astype(np.float32))
    x, y, side, rest = own['x'], own['y'], own['side'], own['rest']
    s = (m['beat/count'] + m['beat/phase'] % 1.0) / 2 if _locked(m) else 0.3 * m['clock/mid']  # a swing there and back in two beats
    phi = 2 * math.pi * s
    down = rest <= 0
    swing = side * math.cos(phi) * 2 * math.pi / (2 * _beat(m) if _locked(m) else 3.3)
    x[down] += (dt * swing * 7 * size * (0.7 + 0.6 * m['level']))[down] + dt * 3
    y[down] -= dt * N * (0.04 + 0.3 * math.sin(phi) ** 2)
    landed = down & (y < own['low'])
    rest[landed] = 3.0
    rest[~down] -= dt
    over = (rest < 0) | (x < -8) | (x > N + 8)
    rest[over] = 0
    x[over], y[over] = rng.uniform(0, N, int(over.sum())), N + rng.uniform(5, 25, int(over.sum()))
    ang = own['lean'] + side * 0.9 * math.sin(phi)
    ang = np.where(rest > 0, own['lean'] * 0 + 0.15 * side, ang)[:, None]
    face = np.where(rest > 0, 0.45, 0.5 + 0.5 * math.cos(phi + 1.2) ** 2)[:, None]  # how much of it faces us as it tumbles
    big = (own['big'] * size)[:, None]
    u, v = own['u'][None, :] * big, own['v'][None, :] * big * 0.48 * face
    px, py = x[:, None] + u * np.cos(ang) - v * np.sin(ang), y[:, None] + u * np.sin(ang) + v * np.cos(ang)
    fade = np.clip(np.where(rest > 0, rest, 1.0), 0, 1)[:, None]
    buf = np.zeros((N, N), np.float32)
    vein = np.abs(own['v']) < 0.13
    _nat_ink(buf, px, py, np.where(vein[None, :], 1.0, 0.42 + 0.14 * own['u'][None, :]) * fade)
    _nat_show(img, buf, hot, other)


@gen('nat_tide', 'calm', 'dreamy', 'focused')
def _nat_tide(img, m, dt, size, hot, other):
    # a beach from above: the sea comes up it and goes back once a bar, a lace of foam behind its edge, as wide as the
    # treble is strong, and leaves a line at its high mark
    own, rng = S['own'], S['rng']
    if 'n' not in own:
        own.update(n=_nat_noise(rng, 1.0, 1.0, 1.7), mark=np.zeros(N, np.float32), age=np.zeros(N, np.float32))
    cm = m['clock/mid']
    if _locked(m):
        b = _v('bar/phase', (int(m['beat/count']) % 4 + m['beat/phase'] % 1.0) / 4)
    else:
        b = (0.14 * cm) % 1.0
    tide = 0.5 - 0.5 * math.cos(2 * math.pi * b)
    x = _X[0]
    edge = N * (0.14 + 0.56 * tide * (0.65 + 0.35 * m['level'])) + 7 * np.sin(x * 0.05 + 0.5 * cm) + 3 * np.sin(x * 0.13 - 0.9 * cm) \
        + 2 * np.sin(x * 0.31 + 1.3 * cm)
    d = edge[None, :] - _Y  # over 0 in the water
    n = _nat_slide(own['n'], 2.2 * cm, 0.5 * N * tide)
    lace = np.clip(1 - np.abs(n - 0.5) / 0.03, 0, 1) + np.clip(1 - np.abs(n - 0.36) / 0.022, 0, 1)
    reach = (6 + 26 * m['high'] + 8 * m['drive/treb']) * size
    water = np.where(d > 0, np.clip(lace, 0, 1) * np.exp(-d / reach) * 0.9, 0)
    front = np.clip(1 - np.abs(d) / 1.4, 0, 1)
    higher = edge > own['mark']  # the mark stays where it got to, and sinks in
    own['age'] = np.where(higher, 1.0, own['age'] * math.exp(-dt / (6 * _beat(m)))).astype(np.float32)
    own['mark'] = np.maximum(own['mark'] - dt * N * 0.012, edge)
    mark = np.clip(1 - np.abs(_Y - own['mark'][None, :]) / 1.1, 0, 1) * own['age'][None, :] * 0.45 * (d < 0)
    _nat_show(img, water + front + mark, hot, other)


@gen('nat_stars', 'mysterious', 'dreamy', 'focused')
def _nat_stars(img, m, dt, size, hot, other):
    # every key has a sky of its own: its constellation is joined a star a beat, the line reaching the star on the beat.
    # The small stars twinkle with the treble
    own = S['own']
    _trail(dt, 0.45)
    key = (int(_v('key/root', -1)), int(_v('key/major', 0) > 0.5))
    if own.get('key') != key:
        r = np.random.default_rng(3 + max(key[0], 0) * 2 + key[1])
        pts = []
        while len(pts) < 11:  # stars not too near each other
            q = r.uniform(0.1, 0.9, 2) * N
            if all(math.hypot(q[0] - a[0], q[1] - a[1]) > 0.17 * N for a in pts):
                pts.append(q)
        pts = np.array(pts, np.float32)
        order, edges = [0], []
        while len(order) < len(pts):  # the shortest way on from what is joined, so it branches like a figure in the sky
            d = np.hypot(*(pts[order][:, None, :] - pts[None, :, :]).transpose(2, 0, 1))
            d[:, order] = 1e9
            i, j = np.unravel_index(int(d.argmin()), d.shape)
            edges.append((order[i], int(j)))
            order.append(int(j))
        own.update(key=key, pts=pts, edges=np.array(edges), n=0, at=S['t'], dim=r.uniform(0, N, (70, 2)).astype(np.float32),
                   tw=r.uniform(0, 6.28, 70).astype(np.float32), f=r.uniform(1, 3, 70).astype(np.float32))
    if _tick('join', m):
        own['n'] += 1
        own['at'] = S['t']
        if own['n'] >= len(own['edges']) + 6:  # it stays a moment, then it is joined again
            own['n'] = 0
    n, edges = own['n'], own['edges']
    grow = min(1.0, (S['t'] - own['at']) / _beat(m))
    turn = 0.1 * math.sin(0.09 * m['clock/mid'])
    c, s = math.cos(turn), math.sin(turn)

    def sky(q):
        x, y = q[:, 0] - N / 2, q[:, 1] - N / 2
        return N / 2 + c * x - s * y, N / 2 + s * x + c * y

    x, y = sky(own['pts'])
    buf = np.zeros((N, N), np.float32)
    done = edges[:n]
    if len(done):
        _nat_seg(buf, x[done[:, 0]], y[done[:, 0]], x[done[:, 1]], y[done[:, 1]], np.float32(0.62), 60)
    if n < len(edges):
        a, b = edges[n]
        _nat_seg(buf, x[a:a + 1], y[a:a + 1], x[a:a + 1] + (x[b] - x[a]) * grow, y[a:a + 1] + (y[b] - y[a]) * grow, np.float32(1.0), 60)
    lit = np.zeros(len(x), np.float32)
    lit[edges[:n + 1, 0]] = 1
    lit[edges[:n, 1]] = 1
    light = 0.45 + 0.55 * lit
    for dx, dy, f in ((0, 0, 1), (1, 0, 0.75), (-1, 0, 0.75), (0, 1, 0.75), (0, -1, 0.75), (2, 0, 0.3), (-2, 0, 0.3), (0, 2, 0.3), (0, -2, 0.3)):
        _nat_ink(buf, x + dx, y + dy, light * f)
    dx, dy = sky(own['dim'])
    _nat_ink(buf, dx, dy, 0.14 + 0.5 * np.clip(np.sin(own['tw'] + own['f'] * 2.5 * m['clock/treb']), 0, 1) * (0.4 + m['drive/treb']))
    S['trail'] = np.maximum(S['trail'], buf)
    _nat_show(img, S['trail'], hot, other)


@gen('nat_twister', 'aggressive', 'tense', 'drop')
def _nat_twister(img, m, dt, size, hot, other):
    # a twister walking across the frame, as wide as the mids and turning on their clock, what it lifts going round it;
    # it throws a ring of dust out along the ground each beat
    own, rng = S['own'], S['rng']
    _trail(dt, 0.09)
    k = 900
    if 'h' not in own:
        own.update(h=rng.random(k).astype(np.float32), a=rng.uniform(0, 6.28, k).astype(np.float32),
                   off=rng.uniform(0.7, 1.2, k).astype(np.float32), wide=0.5)
    mid = _v('drive/mid', m['level'])
    own['wide'] += (mid + 0.3 * m['section/drop'] - own['wide']) * min(1.0, 3 * dt)
    wide, cm = own['wide'], m['clock/mid']
    h, a, off = own['h'], own['a'], own['off']
    h += dt * (0.12 + 0.5 * m['level'])
    h %= 1.0
    a += dt * (4 + 9 * wide) / (0.3 + h)
    cx = N * (0.5 + 0.2 * math.sin(0.23 * cm))

    def spot(h, a, f):
        r = N * (0.02 + 0.04 * h + (0.14 + 0.28 * wide) * h ** 1.7) * size * f
        c = cx + N * 0.1 * h * np.sin(2.6 * h + 0.9 * cm)
        return c + r * np.cos(a), N * 0.08 + N * 0.86 * h + 0.22 * r * np.sin(a), r

    x, y, _ = spot(h, a, off)
    _nat_ink(S['trail'], x, y, np.where(np.sin(a) < 0, 1.0, 0.4).astype(np.float32))
    buf = S['trail'].copy()
    t = np.linspace(0, 1, 260, dtype=np.float32)[:, None]  # the spiral it is wound of
    ang = 22 * t + np.arange(4, dtype=np.float32)[None, :] * (math.pi / 2) + 3 * cm
    hx, hy, _ = spot(t, ang, 1.0)
    _nat_ink(buf, hx, hy, np.where(np.sin(ang) < 0, 0.75, 0.2).astype(np.float32))
    ph = _nat_phase(m)
    s = np.linspace(0, 2 * math.pi, 120, dtype=np.float32)
    rad = N * (0.05 + 0.34 * ph) * size
    _nat_ink(buf, cx + rad * np.cos(s), N * 0.08 + 0.2 * rad * np.sin(s), np.float32(0.8 * (1 - ph) ** 1.5))
    _nat_show(img, buf, hot, other, 0.05)
