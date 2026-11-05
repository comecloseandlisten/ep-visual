# tech: machines, maps and data. Instruments and diagrams that read the music, no text on any of them.

_TECH_TAU = 2 * math.pi
_TECH_LINES = (((.04, .30), (.30, .30), (.50, .50), (.80, .50), (.96, .66)),
               ((.20, .96), (.20, .62), (.44, .38), (.44, .04)),
               ((.04, .76), (.56, .76), (.76, .56), (.76, .22), (.96, .22)),
               ((.96, .90), (.40, .90), (.10, .60), (.10, .10), (.62, .10)))


def _tech_box(buf, x0, y0, x1, y1, w):
    _line(buf, (x0, x1, x1, x0), (y0, y0, y1, y1), (x1, x1, x0, x0), (y0, y1, y1, y0), w)


def _tech_dots(buf, x, y, rad, w):
    # round dots at (x, y), `rad` cells in radius, `w` bright
    x, y = np.atleast_1d(x).astype(np.float32), np.atleast_1d(y).astype(np.float32)
    rad = np.broadcast_to(np.asarray(rad, np.float32), x.shape)
    w = np.broadcast_to(np.asarray(w, np.float32), x.shape)
    d = np.arange(-int(rad.max()) - 1, int(rad.max()) + 2, dtype=np.float32)
    dx, dy = (a.ravel() for a in np.meshgrid(d, d))
    fall = np.clip(rad[:, None] + 0.5 - np.hypot(dx, dy)[None, :], 0, 1) * w[:, None]
    _ink(buf, np.floor(x)[:, None] + dx + 0.5, np.floor(y)[:, None] + dy + 0.5, fall)


@gen('tech_radar', 'mysterious', 'tense', 'focused')
def _tech_radar(img, m, dt, size, hot, other):
    # a scope swept once a bar: the ten bands are ten ranges, a band that is loud as the arm passes leaves blips there
    own, rng = S['own'], S['rng']
    if 'r' not in own:
        x, y = _X - N / 2, _Y - N / 2
        own.update(r=np.hypot(x, y), ang=np.arctan2(y, x), bear=rng.uniform(0, _TECH_TAU, (10, 3)).astype(np.float32),
                   glow=np.zeros((10, 3), np.float32), arm=None, off=rng.uniform(-0.3, 0.3, (10, 3)).astype(np.float32))
    R = 0.46 * N * size
    arm = (math.pi / 2 - _TECH_TAU * _beats(m, 2, 'clock/mid') / 4) % _TECH_TAU
    step = 0.0 if own['arm'] is None else (own['arm'] - arm) % _TECH_TAU
    own['arm'] = arm
    r = own['r']
    lag = (own['ang'] - arm) % _TECH_TAU
    disc = r < R
    d = np.abs(r - R / 4 * np.round(4 * r / R))
    face = np.clip(1.1 - d, 0, 1) * 0.2 * disc
    face = np.maximum(face, np.clip(1 - np.minimum(np.abs(_X - N / 2), np.abs(_Y - N / 2)), 0, 1) * 0.14 * disc)
    wedge = np.clip(1 - lag / 1.5, 0, 1) ** 2 * 0.42 * disc
    beam = np.clip(1.2 - lag * r, 0, 1) * disc
    buf = np.maximum(np.maximum(face, wedge), beam)
    behind = (own['bear'] - arm) % _TECH_TAU <= step
    glow = own['glow'] * math.exp(-dt / (3 * _beat(m)))
    own['glow'] = glow = np.where(behind, np.maximum(glow, _bands()[:, None] ** 1.5 * 2.0), glow)
    own['bear'] += np.where(behind, rng.normal(0, 0.1, behind.shape), 0).astype(np.float32)  # they drift
    rad = R * (np.arange(10, dtype=np.float32)[:, None] + 1.4 + own['off']) / 11.5
    bx, by = N / 2 + rad * np.cos(own['bear']), N / 2 + rad * np.sin(own['bear'])
    _tech_dots(buf, bx.ravel(), by.ravel(), 1.0 + 1.2 * np.clip(glow.ravel(), 0, 1), np.clip(glow.ravel(), 0, 1))
    _shade(img, buf, hot, other)


def _tech_traces(rng):
    # copper: from the pins of a chip in the middle outwards, straight with 45 degree bends, stopping short of what is laid
    ways = ((1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1))
    taken = np.zeros((N + 4, N + 4), bool)
    h = 15
    taken[N // 2 - h:N // 2 + h + 4, N // 2 - h:N // 2 + h + 4] = True
    runs = []
    pins = [(side, i) for i in range(-12, 13, 3) for side in range(4)]
    pins.sort(key=lambda p: abs(p[1]))
    for side, i in pins:
        d0 = side * 2
        dx, dy = ways[d0]
        x, y = N // 2 + dx * (h + 2) - dy * i, N // 2 + dy * (h + 2) + dx * i
        sign = (1 if i > 0 else -1) * (1 if side % 2 == 0 else -1) if i else int(rng.choice((-1, 1)))
        d, left, xs, ys = d0, int(rng.integers(3, 8)) + abs(i) // 2, [], []
        for _ in range(170):
            dx, dy = ways[d % 8]
            nx, ny = x + 2 * dx, y + 2 * dy
            if not (0 <= x < N and 0 <= y < N):
                break
            if 0 <= nx < N and 0 <= ny < N and taken[ny + 2, nx + 2]:
                break
            xs.append(x)
            ys.append(y)
            taken[y + 1:y + 4, x + 1:x + 4] = True
            x, y = x + dx, y + dy
            left -= 1
            if left <= 0:
                d = d0 + sign if d == d0 else d0
                left = int(rng.integers(6, 26))
        if len(xs) > 5:
            runs.append((np.array(xs, np.float32) + 0.5, np.array(ys, np.float32) + 0.5))
    return runs, h


@gen('tech_circuit', 'focused', 'mysterious', 'euphoric', whole=True)
def _tech_circuit(img, m, dt, size, hot, other):
    # a board round a chip: pulses leave the pins by the sixteenth, more the more top end, and run with the treble
    own, rng = S['own'], S['rng']
    if 'px' not in own:
        runs, h = _tech_traces(rng)
        ends = np.cumsum([0] + [len(r[0]) for r in runs])
        own.update(px=np.concatenate([r[0] for r in runs]), py=np.concatenate([r[1] for r in runs]), ends=ends, chip=h,
                   heat=np.zeros(ends[-1], np.float32), pulses=[])
    heat, ends = own['heat'], own['ends']
    if _tick('pulse', m, 4):
        for k in rng.integers(0, len(ends) - 1, 1 + int(3 * m['high'])):
            own['pulses'].append([int(k), 0.0])
    heat *= math.exp(-dt / 0.3)
    go = dt * N * (0.9 + 2.0 * m['drive/treb'])
    for p in own['pulses']:
        a, b = int(ends[p[0]]), int(ends[p[0] + 1])
        heat[min(b, a + int(p[1])):min(b, a + int(p[1] + go) + 1)] = 1.0
        p[1] += go
    own['pulses'] = [p for p in own['pulses'] if p[1] < ends[p[0] + 1] - ends[p[0]]]
    x, y = N / 2 + (own['px'] - N / 2) * size, N / 2 + (own['py'] - N / 2) * size
    buf = np.zeros((N, N), np.float32)
    w = 0.16 + 0.84 * heat
    for d in range(max(1, int(round(size)))):
        _ink(buf, x + d, y + d, w)
    tip = ends[1:] - 1
    _tech_dots(buf, x[tip], y[tip], 1.4 * size, 0.3 + 0.7 * heat[tip])
    h = own['chip'] * size
    lo, hi = N / 2 - h, N / 2 + h
    _tech_box(buf, lo, lo, hi, hi, 0.7)
    a, b = int(max(0, lo + 3)), int(min(N, hi - 2))
    buf[a:b, a:b] = np.maximum(buf[a:b, a:b], 0.14 + 0.4 * m['level'] * (((_X[a:b, a:b] + _Y[a:b, a:b]) % 4) < 2))
    _shade(img, buf, hot, other)


@gen('tech_graph', 'dreamy', 'calm', 'focused')
def _tech_graph(img, m, dt, size, hot, other):
    # a network: packets hop an edge every half beat, as many as the hats are strong; the nodes swell with their band
    own, rng = S['own'], S['rng']
    if 'at' not in own:
        g = (np.mgrid[0:4, 0:4].reshape(2, -1).T + 0.5) / 2 - 1
        at = (g + rng.uniform(-0.2, 0.2, g.shape)).astype(np.float32)
        d = np.hypot(*(at[:, None] - at[None, :]).transpose(2, 0, 1))
        np.fill_diagonal(d, 9)
        pairs = sorted({(min(i, int(j)), max(i, int(j))) for i, row in enumerate(d.argsort(1)[:, :3]) for j in row[:2 + i % 2]})
        near = [[b if a == i else a for a, b in pairs if i in (a, b)] for i in range(16)]
        own.update(at=at, ea=np.array([p[0] for p in pairs]), eb=np.array([p[1] for p in pairs]), near=near, go=[], t=0.0,
                   flash=np.zeros(16, np.float32), seed=rng.uniform(0, _TECH_TAU, (16, 2)).astype(np.float32))
    near, flash = own['near'], own['flash']
    strength = max(_recent('hats', m['hit/hat'], m, dt), 0.6 * m['high'])
    flash *= math.exp(-dt / 0.2)
    own['t'] = min(1.0, own['t'] + dt / (0.5 * _beat(m)))
    if _tick('hop', m, 2):
        own['t'] = 0.0
        for p in own['go']:
            flash[p[1]] = 1.0
            p[0], p[1], p[2] = p[1], int(rng.choice(near[p[1]])), p[2] - 1
        own['go'] = [p for p in own['go'] if p[2] > 0]
        for _ in range(1 + int(3 * strength)):
            a = int(rng.integers(0, 16))
            own['go'].append([a, int(rng.choice(near[a])), int(rng.integers(3, 8))])
        own['go'] = own['go'][-24:]
    drift = 3.5 * np.sin(0.5 * m['clock/mid'] + own['seed'])
    x = N / 2 + own['at'][:, 0] * 0.44 * N * size + drift[:, 0]
    y = N / 2 + own['at'][:, 1] * 0.44 * N * size + drift[:, 1]
    buf = np.zeros((N, N), np.float32)
    _line(buf, x[own['ea']], y[own['ea']], x[own['eb']], y[own['eb']], 0.28)
    b = _bands()[np.arange(16) % 10]
    _tech_dots(buf, x, y, (1.2 + 4 * b) * size ** 0.5, 0.45 + 0.55 * np.maximum(flash, b))
    if own['go']:
        a, c = (np.array([p[i] for p in own['go']]) for i in (0, 1))
        t = own['t']
        _line(buf, x[a] + (x[c] - x[a]) * max(0.0, t - 0.25), y[a] + (y[c] - y[a]) * max(0.0, t - 0.25),
                   x[a] + (x[c] - x[a]) * t, y[a] + (y[c] - y[a]) * t, 1.0)
        _tech_dots(buf, x[a] + (x[c] - x[a]) * t, y[a] + (y[c] - y[a]) * t, 1.2, 1.0)
    _shade(img, buf, hot, other)


def _tech_route(points, stops_every):
    # a polyline as cells half a cell apart, and how many of those from stop to stop
    p = np.array(points, np.float32) * N
    s = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(p, axis=0).T))])
    t = np.arange(0, s[-1], 0.5)
    n = max(2, int(round(s[-1] / stops_every)))
    return np.interp(t, s, p[:, 0]).astype(np.float32), np.interp(t, s, p[:, 1]).astype(np.float32), n, (len(t) - 1) / n


@gen('tech_metro', 'happy', 'calm')
def _tech_metro(img, m, dt, size, hot, other):
    # a transit map: the trains hop one stop and stand, arriving on the beat, longer the louder it is
    own = S['own']
    if 'lines' not in own:
        own['lines'] = [_tech_route(p, 17) for p in _TECH_LINES]
    beats = _beats(m, 2, 'clock/mid')
    paint = (hot, other, 0.6 * hot + 0.4 * other, 0.35 * hot + 0.65 * other)
    white = np.clip(hot + other, 0, 1)
    ring, hole, cars = (np.zeros((N, N), np.float32) for _ in range(3))
    for k, (px, py, n, gap) in enumerate(own['lines']):
        x, y = N / 2 + (px - N / 2) * size, N / 2 + (py - N / 2) * size
        buf = np.zeros((N, N), np.float32)
        for dx, dy in ((0, 0), (1, 0), (0, 1)):
            _ink(buf, x + dx, y + dy, np.float32(0.62))
        img += buf[..., None] * paint[k]
        at = np.round(np.arange(n + 1) * gap).astype(int)
        _tech_dots(ring, x[at], y[at], 2.2, 1.0)
        _tech_dots(hole, x[at], y[at], 0.9, 1.0)
        b = (beats / (1, 2, 1, 2)[k]) + 3 * k
        f = b % 1.0
        e = min(1.0, max(0.0, (f - 0.3) / 0.62))
        q = (math.floor(b) + e * e * (3 - 2 * e)) % (2 * n)
        q = (q if q <= n else 2 * n - q) * gap
        a = int(q)
        length = int((6 + 16 * m['level']) * size)
        i = np.arange(max(0, a - length), min(len(x), a + length + 1))
        for dx, dy in ((0, 0), (1, 0), (0, 1), (-1, 0), (0, -1)):
            _ink(cars, x[i] + dx, y[i] + dy, np.float32(1.0))
    img *= 1 - np.clip(ring, 0, 1)[..., None]
    img += (ring - hole).clip(0, 1)[..., None] * white * 0.85
    img += cars[..., None] * (0.3 * white + 0.7 * hot)


@gen('tech_contour', 'calm', 'melancholic', 'dreamy', whole=True)
def _tech_contour(img, m, dt, size, hot, other):
    # a height map drifting with the bass; the level is the height of the land, so the lines creep over it as it gets loud
    own = S['own']
    own['lift'] = own.get('lift', m['level']) + (m['level'] - own.get('lift', m['level'])) * (1 - math.exp(-dt / 0.5))
    c = 0.22 * m['clock/bass']
    x, y = (_X / N - 0.5) / size, (_Y / N - 0.5) / size
    h = (np.sin(4.1 * x + c) * np.cos(3.3 * y - 0.7 * c) + 0.7 * np.sin(5.2 * (x + 0.6 * y) - 1.3 * math.sin(c))
         + 0.5 * np.cos(7.1 * y - 3.1 * x + 0.8 * c) + 0.25 * np.sin(11 * x + 9 * y + 1.4 * c))
    lines = 3.2 * h + 5 * own['lift']
    near = np.round(lines)
    g = np.hypot(*np.gradient(lines))
    d = np.abs(lines - near) / np.maximum(g, 0.03)
    index = near % 4 == 0
    line = np.clip(np.where(index, 1.5, 1.0) - d, 0, 1) * np.where(index, 1.0, 0.42)
    _shade(img, line, hot, other)


def _tech_heart(p):
    # one beat of a heart trace with its spike on the beat, p the place in the beat
    p = (p + 0.5) % 1 - 0.5
    return (0.14 * np.exp(-((p + 0.2) / 0.05) ** 2) - 0.2 * np.exp(-((p + 0.05) / 0.022) ** 2) + np.exp(-(p / 0.03) ** 2)
            - 0.32 * np.exp(-((p - 0.06) / 0.024) ** 2) + 0.26 * np.exp(-((p - 0.26) / 0.07) ** 2))


@gen('tech_ecg', 'melancholic', 'tense')
def _tech_ecg(img, m, dt, size, hot, other):
    # a patient monitor: the beam crosses in four beats, a heartbeat on each, taller the louder, a gap running ahead of it
    own = S['own']
    if 'y' not in own:
        own.update(y=np.full(N, N * 0.42, np.float32), head=None)
    beats = _beats(m, 2, 'clock/mid')
    head = beats / 4 % 1 * N
    a = own['head'] if own['head'] is not None else head
    own['head'] = head
    n = min(N, int(head) - int(a) + (N if head < a else 0))
    col = (int(a) + 1 + np.arange(n)) % N
    amp = N * 0.5 * size * (0.3 + 0.7 * m['level'])
    own['y'][col] = N * 0.36 + amp * _tech_heart((col + 0.5) * 4 / N)
    y = own['y']
    lo, up = np.minimum(y, np.roll(y, -1)), np.maximum(y, np.roll(y, -1))
    age = (head - _X[0]) % N / N
    fade = np.where(age > 0.93, 0, 0.3 + 0.7 * (1 - age) ** 1.5)
    buf = ((_Y >= lo[None, :] - 0.6) & (_Y <= up[None, :] + 0.6)) * fade[None, :]
    paper = ((_X % 15 < 1) | (_Y % 15 < 1)) * np.float32(0.07)
    buf = np.maximum(buf, paper).astype(np.float32)
    _tech_dots(buf, head, y[int(head) % N], 1.6, 1.0)
    _shade(img, buf, hot, other)


@gen('tech_seismo', 'tense', 'aggressive', 'drop')
def _tech_seismo(img, m, dt, size, hot, other):
    # a drum record: line under line of quiet ground, until the bass shakes the pen into the lines next to it
    own, rng = S['own'], S['rng']
    R = 9
    if 'v' not in own:
        own.update(v=rng.normal(0, 0.03, (R, N)).astype(np.float32), at=None)
    pos = int(_beats(m, 2, 'clock/mid') / 4 * N)
    a = pos - 1 if own['at'] is None else own['at']
    own['at'] = pos
    i = np.arange(max(a + 1, pos - N + 1), pos + 1)
    b = _bands()
    bass = max(m['drive/bass'] * 0.6, float(b[:2].mean()))
    shake = 0.03 + 2.2 * bass ** 2.5 * (0.35 + m['beat/pulse'] + 0.3 * m['hit/bass'])
    own['v'][(i // N) % R, i % N] = rng.normal(0, 1, len(i)) * shake
    row = (pos // N) % R
    sp = N / (R + 0.5) * size
    buf = np.zeros((N, N), np.float32)
    for k in range(R):
        y = N / 2 + ((R - 1) / 2 - k) * sp + own['v'][k] * sp
        lo, up = np.minimum(y[:-1], y[1:]), np.maximum(y[:-1], y[1:])
        w = 1.0 if k == row else 0.32 + 0.3 * ((k - row - 1) % R) / R
        buf[:, :-1] = np.maximum(buf[:, :-1], ((_Y[:, :-1] >= lo - 0.5) & (_Y[:, :-1] <= up + 0.5)) * np.float32(w))
    _tech_dots(buf, pos % N, N / 2 + ((R - 1) / 2 - row) * sp + own['v'][row, pos % N] * sp, 1.3, 1.0)
    _shade(img, buf, hot, other)


@gen('tech_barcode', 'aggressive', 'focused', 'happy')
def _tech_barcode(img, m, dt, size, hot, other):
    # strips of bars running past a scan line: the harder the hats, the thinner the bars that come in
    own, rng = S['own'], S['rng']
    L = 256
    if 'tape' not in own:
        own.update(tape=np.zeros((4, L), np.float32), head=[None] * 4, run=[0] * 4, on=[0] * 4)
    fine = max(_recent('hats', m['hit/hat'], m, dt), 0.5 * m['high'])
    wide = 2 + int(6 * (1 - min(1.0, fine)))
    strips = ((1.2, 0.68, 0.24), (-0.8, 0.5, 0.07), (0.6, 0.31, 0.26), (-1.5, 0.13, 0.07))
    top = _bands()[6:10]
    sx = abs(_beats(m, 2, 'clock/mid') / 4 % 1 * 2 - 1) * N
    glow = 0.32 + 0.68 * np.exp(-((_X[0] - sx) / 13) ** 2)
    buf = np.zeros((N, N), np.float32)
    span = (0, 0)
    for k, (rate, at, tall) in enumerate(strips):
        p = int(abs(rate) * N * 0.4 * m['clock/treb'])
        head = own['head'][k]
        head = p if head is None or head < p else head
        while head < p + N:
            if own['run'][k] <= 0:
                own['on'][k] ^= 1
                own['run'][k] = int(rng.integers(1, wide))
            own['tape'][k, head % L] = own['on'][k]
            own['run'][k] -= 1
            head += 1
        own['head'][k] = head
        col = own['tape'][k, (p + np.arange(N)) % L]
        col = col[::-1] if rate > 0 else col
        mid, half = N / 2 + (at - 0.5) * N * size, tall * N * size * (0.3 + 0.45 * top[k])
        a, b = max(0, int(mid - half)), min(N, int(mid + half) + 1)
        buf[a:b] = col * glow
        span = (min(span[0], a) if k else a, max(span[1], b))
    img += (np.abs(_X[:span[1] - span[0], :] - sx) < 0.9)[..., None] * 0 if False else 0
    _shade(img, buf, hot, other)
    x = int(min(N - 1, sx))
    img[span[0]:span[1], x] += hot


@gen('tech_progress', 'focused', 'happy', 'euphoric', 'drop')
def _tech_progress(img, m, dt, size, hot, other):
    # loading bars block by block, the first a beat long, the next two, then four and on: the song's own counter. A drop fills them
    beats = _beats(m, 2, 'clock/mid')
    rows, blocks = 6, 16
    w = 0.84 * N * size / blocks
    x0, h = N / 2 - 8 * w, 0.058 * N * size
    ci = (_X[0] - x0) / w
    inside = (ci >= 0) & (ci < blocks) & (ci % 1 < 0.76)
    buf = np.zeros((N, N), np.float32)
    for k in range(rows):
        f = max(beats / 2 ** k % 1 * blocks, m['section/drop'] * blocks)
        y = N / 2 + (rows / 2 - 0.5 - k) * 2.75 * h
        a, b = max(0, int(y - h)), min(N, int(y + h))
        if b <= a:
            continue
        light = 0.28 + 0.5 * ci / blocks + 0.22 * m['level']
        buf[a:b] = np.where(inside & (ci < f), np.where(ci >= f - 1, 1.0, light), 0)
        _tech_box(buf, x0 - 2, y - h - 2, x0 + 16 * w + 1, y + h + 1, 0.3)
    _shade(img, buf, hot, other)


@gen('tech_glitch', 'aggressive', 'tense', 'drop', whole=True)
def _tech_glitch(img, m, dt, size, hot, other):
    # a screen of blocks torn into slices on the half beat, as far as the snares are strong, settling between; new blocks every bar
    own, rng = S['own'], S['rng']
    fresh = _tick('screen', m, 0.25)
    if fresh or 'a' not in own:
        cell = max(4, int(11 * size))
        n = N // cell + 2
        own['a'] = (rng.random((n, n)) < 0.3).repeat(cell, 0).repeat(cell, 1)[:N, :N]
        cell = max(3, int(5 * size))
        n = N // cell + 2
        own['b'] = (rng.random((n, 2 * n)) < 0.22).repeat(cell, 0).repeat(cell // 2 + 1, 1)[:N, :N]
        own.setdefault('dx', np.zeros(N, np.float32))
    strength = max(_recent('snares', m['hit/snare'], m, dt), 0.5 * _v('flux', 0.0), 0.3)
    if _tick('tear', m, 2):
        cuts = np.sort(rng.integers(0, N, 5 + int(10 * strength)))
        off = rng.normal(0, 1, len(cuts) + 1) * N * 0.26 * strength
        off[rng.random(len(off)) < 0.3] = 0
        own['dx'] = off[np.searchsorted(cuts, np.arange(N))].astype(np.float32)
    own['dx'] *= math.exp(-dt / (0.3 * _beat(m)))
    i, dx = np.arange(N), own['dx']
    rows = i[:, None]
    a = own['a'][rows, (i[None, :] + dx[:, None].astype(int)) % N]
    b = own['b'][rows, (i[None, :] - (1.7 * dx[:, None]).astype(int)) % N]
    lines = (_Y % 3 < 2) * np.float32(0.72) + np.float32(0.28)
    img += (a * lines)[..., None] * hot * 0.85 + (b * lines)[..., None] * other * 0.6


@gen('tech_memmap', 'mysterious', 'focused', whole=True)
def _tech_memmap(img, m, dt, size, hot, other):
    # a memory map, first fit: blocks taken and freed by the sixteenth, fuller the busier the music, a read head walking it
    own, rng = S['own'], S['rng']
    G = 25
    if 'c' not in own:
        own.update(c=np.zeros(G * G, np.int32), mine=np.zeros(G * G, np.float32), fresh=np.zeros(G * G, np.float32), next=1)
    c, mine, fresh = own['c'], own['mine'], own['fresh']
    fresh *= math.exp(-dt / 0.25)
    if _tick('alloc', m, 4):
        held = np.unique(c[c > 0])
        want = 0.22 + min(0.68, 4.5 * m['busy'])
        if len(held) and ((c > 0).mean() > want or rng.random() < 0.3):
            c[c == rng.choice(held)] = 0
        if (c > 0).mean() <= want:
            n = int(rng.integers(3, 44))
            fit = np.convolve((c == 0).astype(np.int32), np.ones(n, np.int32), 'valid') == n
            if fit.any():
                a = int(fit.argmax())
                c[a:a + n], mine[a:a + n], fresh[a:a + n] = own['next'], float(rng.random() < 0.3), 1.0
                own['next'] += 1
    used = c > 0
    light = used * (0.34 + 0.66 * fresh)
    head = int(_beats(m, 2, 'clock/mid') * 4) % (G * G)
    p = min(10, max(3, int(round(5 * size))))
    n = min(N, G * p)
    o = (N - n) // 2
    gap = np.arange(n) % p < p - 1
    gap = gap[:, None] & gap[None, :]

    def up(cells):
        return cells.reshape(G, G)[::-1].repeat(p, 0).repeat(p, 1)[:n, :n] * gap

    a = light * mine
    a[head - 3:head + 1] = 1.0
    hots, others = up(a), up(light * (1 - mine) + (~used) * 0.05)
    img[o:o + n, o:o + n] += hots[..., None] * hot + others[..., None] * other


@gen('tech_city', 'happy', 'euphoric', 'focused', whole=True)
def _tech_city(img, m, dt, size, hot, other):
    # a street grid from above: the lights change every two beats and the cars queue at them, more the louder, faster with the mids
    own, rng = S['own'], S['rng']
    K = 240
    if 'pos' not in own:
        own.update(pos=rng.uniform(0, N, K).astype(np.float32), street=rng.integers(0, 64, K), axis=np.arange(K) % 2,
                   way=rng.choice((-1, 1), K).astype(np.float32), queue=2.2 + 3.0 * (np.arange(K) // 2 % 4))
    _trail(dt, 0.2)
    g = max(14, int(21 * size))
    n = -(-N // g)
    span = g * n
    green = int(_beats(m, 2, 'clock/mid') / 2) % 2  # 0: along the rows, 1: along the columns
    pos, way, axis = own['pos'] % span, own['way'], own['axis']
    go = way * dt * N * (0.3 + 0.9 * _v('drive/mid', 0.5))
    ahead = (way * (g / 2 - pos)) % g
    held = (axis != green) & (ahead < own['queue'] + np.abs(go))
    own['pos'] = pos = pos + np.where(held, 0, go)
    lane = g * (own['street'] % n + 0.5) + 1.6 * way
    x, y = np.where(axis == 0, pos, lane) % span, np.where(axis == 0, lane, pos) % span
    k = int(K * (0.25 + 0.75 * m['level']))
    _ink(S['trail'], x[:k], y[:k], np.float32(1.0))
    u, v = np.abs(_X % g - g / 2), np.abs(_Y % g - g / 2)
    road = (u < 3.5) | (v < 3.5)
    kerb = (np.abs(u - 3.5) < 0.6) & (v > 3.5) | (np.abs(v - 3.5) < 0.6) & (u > 3.5)
    light = (u < 3.2) & (v < 0.8) if green == 0 else (v < 3.2) & (u < 0.8)
    img += (road * np.float32(0.05) + kerb * np.float32(0.2))[..., None] * other
    img += (light * np.float32(0.6))[..., None] * other
    _shade(img, S['trail'], hot, other)


@gen('tech_orbits', 'dreamy', 'calm', 'mysterious', 'melancholic')
def _tech_orbits(img, m, dt, size, hot, other):
    # a globe of dots turning with the mids; the key tilts the rings the satellites go round, the treble runs them
    own = S['own']
    if 'lat' not in own:
        i = np.arange(900, dtype=np.float32) + 0.5
        lat, lon = np.arcsin(1 - 2 * i / 900), (i * 2.39996) % _TECH_TAU
        land = np.sin(2.3 * lon + 1.2 * np.sin(3 * lat)) + np.sin(3.1 * lat + lon) > 0.25
        own.update(lat=lat, lon=lon, land=land, tilt=0.5)
    root = max(0, int(_v('key/root', -1)))
    own['tilt'] += (0.3 + 1.1 * root / 12 - own['tilt']) * (1 - math.exp(-dt / 0.8))
    R = 0.27 * N * size
    lat, lon = own['lat'], own['lon'] + 0.35 * m['clock/mid']
    x, y, z = np.cos(lat) * np.sin(lon), np.sin(lat), np.cos(lat) * np.cos(lon)
    c, s = math.cos(0.4), math.sin(0.4)
    front = z > 0
    buf = np.zeros((N, N), np.float32)
    w = np.where(own['land'], 0.95, 0.2) * (0.25 + 0.75 * z)
    _plot(buf, (N / 2 + R * (c * x - s * y))[front], (N / 2 + R * (s * x + c * y))[front], w[front].astype(np.float32))
    t = np.linspace(0, _TECH_TAU, 260, dtype=np.float32)
    sx, sy, sw = [], [], []
    for k, (radius, rate) in enumerate(((1.28, 1.1), (1.5, -0.8), (1.76, 0.6))):
        inc, node = own['tilt'] + 0.85 * k, 1.05 * k + 0.3
        ci, si, cn, sn = math.cos(inc), math.sin(inc), math.cos(node), math.sin(node)

        def place(a):
            u, v = np.cos(a) * radius, np.sin(a) * radius
            return (u * cn - v * ci * sn, u * sn + v * ci * cn, v * si)

        ox, oy, oz = place(t)
        seen = (oz > 0) | (np.hypot(ox, oy) > 1)
        _ink(buf, (N / 2 + R * ox)[seen], (N / 2 + R * oy)[seen], np.float32(0.22))
        head = rate * m['clock/treb'] + np.array([0.0, math.pi], np.float32)
        for a in head:
            arc = a - np.sign(rate) * np.linspace(0, 0.5, 40, dtype=np.float32)
            ax, ay, az = place(arc)
            seen = (az > 0) | (np.hypot(ax, ay) > 1)
            _ink(buf, (N / 2 + R * ax)[seen], (N / 2 + R * ay)[seen], np.linspace(0.9, 0.25, 40, dtype=np.float32)[seen])
        hx, hy, hz = place(head)
        seen = (hz > 0) | (np.hypot(hx, hy) > 1)
        sx.append((N / 2 + R * hx)[seen])
        sy.append((N / 2 + R * hy)[seen])
    _tech_dots(buf, np.concatenate(sx), np.concatenate(sy), 1.5, 1.0)
    _shade(img, buf, hot, other)


@gen('tech_dials', 'melancholic', 'calm', 'happy')
def _tech_dials(img, m, dt, size, hot, other):
    # three needle meters, the level above, the bass and the treble below: heavy needles, the red end lit when they get there
    own = S['own']
    if 'n' not in own:
        own['n'] = np.zeros(3, np.float32)
    want = np.array([m['level'], m['drive/bass'], m['drive/treb']], np.float32)
    own['n'] += (np.clip(want, 0, 1) - own['n']) * (1 - math.exp(-dt / 0.13))
    buf = np.zeros((N, N), np.float32)
    s = np.linspace(0, 1, 160, dtype=np.float32)
    tick = np.linspace(0, 1, 11, dtype=np.float32)
    places = ((N / 2, N / 2 + 0.02 * N, 0.36), (N / 2 - 0.25 * N * size, N / 2 - 0.34 * N * size, 0.21),
              (N / 2 + 0.25 * N * size, N / 2 - 0.34 * N * size, 0.21))
    for (cx, cy, r), n in zip(places, own['n']):
        R = r * N * size
        a = 2.72 - 2.3 * s
        red = s > 0.78
        lit = 0.55 + 0.45 * (n > 0.78)
        _ink(buf, cx + R * np.cos(a), cy + R * np.sin(a), np.where(red, lit, 0.34).astype(np.float32))
        _ink(buf, cx + (R + 1) * np.cos(a[red]), cy + (R + 1) * np.sin(a[red]), np.float32(lit))
        a = 2.72 - 2.3 * tick
        _line(buf, cx + 0.88 * R * np.cos(a), cy + 0.88 * R * np.sin(a), cx + R * np.cos(a), cy + R * np.sin(a), 0.4)
        a = 2.72 - 2.3 * float(n)
        for d in (0, 1):
            _line(buf, cx + d, cy, cx + d + 0.96 * R * math.cos(a), cy + 0.96 * R * math.sin(a), 1.0)
        _tech_dots(buf, cx, cy, 0.09 * R + 1, 0.7)
        _tech_box(buf, cx - 1.14 * R, cy - 0.24 * R, cx + 1.14 * R, cy + 1.14 * R, 0.16)
    _shade(img, buf, hot, other)


@gen('tech_scope', 'focused', 'mysterious', 'euphoric')
def _tech_scope(img, m, dt, size, hot, other):
    # a bench scope: the notes sounding, summed into one wave pitched by the key, the beam writing it across once a beat
    own = S['own']
    _trail(dt, 0.3)
    W, H = 0.45 * N * size, 0.34 * N * size
    gx, gy = np.abs(_X - N / 2), np.abs(_Y - N / 2)
    inside = (gx < W + 1) & (gy < H + 1)
    div = W / 5
    grid = ((gx % div < 1) | (gy % div < 1) | (gx >= W) | (gy >= H)) & inside
    fine = ((gx < 2) & (gy % (div / 5) < 1) | (gy < 2) & (gx % (div / 5) < 1)) & inside
    img += (grid * np.float32(0.14) + fine * np.float32(0.3))[..., None] * other
    c = _chroma() ** 2
    head = _beats(m, 2, 'clock/mid') % 1.0
    last = own.get('x', head)
    own['x'] = head
    last = 0.0 if head < last else last
    u = np.linspace(last, head, 120, dtype=np.float32)
    f = (2 + 2 * max(0, int(_v('key/root', -1))) / 12) * 2 ** (np.arange(12, dtype=np.float32) / 12)
    wave = (c[:, None] * np.sin(_TECH_TAU * f[:, None] * u[None, :] + 0.6 * m['clock/mid'])).sum(0) / max(0.8, float(c.sum()) ** 0.7)
    if not _v('key/major', 0):  # minor: squarer
        wave = np.tanh(2.2 * wave)
    y = N / 2 + wave * H * (0.45 + 0.5 * m['level'])
    x = N / 2 - W + 2 * W * u
    for d in (0, 1):
        _ink(S['trail'], x, y + d, np.float32(1.0))
    buf = S['trail'].copy()
    _tech_dots(buf, x[-1], y[-1], 1.6, 1.0)
    _shade(img, buf, hot, other)


@gen('tech_punch', 'melancholic', 'mysterious', 'calm')
def _tech_punch(img, m, dt, size, hot, other):
    # cards fed past a punch a column every sixteenth: twelve rows for the twelve notes, a hole for each one that sounds
    own = S['own']
    C = 64
    if 'cols' not in own:
        own.update(cols=np.zeros((12, C), np.float32), fed=0)
    if _tick('feed', m, 4):
        c = _chroma()
        cols = own['cols'] = np.roll(own['cols'], 1, 1)
        cols[:, 0] = np.where(c > 0.55, 0.5 + 0.5 * c, 0)
        own['fed'] += 1
        if own['fed'] % 24 == 0:  # the next card
            cols[:, 0] = -1
    p, rp = max(3, int(round(5 * size))), max(3, int(round(6 * size)))
    punch = int(N * 0.9)
    y0 = int(N / 2 - 6 * rp)
    ci = (punch - 1 - np.arange(N)) // p
    ri = (np.arange(N) - y0) // rp
    across = (ci >= 0) & (ci < C)
    up = (ri >= -1) & (ri <= 12)
    cols = own['cols']
    held = cols[np.clip(ri, 0, 11)][:, np.clip(ci, 0, C - 1)]
    card = (cols[0, np.clip(ci, 0, C - 1)] >= 0) & across
    rows = (ri >= 0) & (ri < 12)
    hx = (punch - 1 - np.arange(N)) % p < p - 2
    hy = (np.arange(N) - y0) % rp < rp - 2
    hole = (hy & rows)[:, None] & (hx & card)[None, :]
    buf = (up[:, None] & card[None, :]) * np.float32(0.09)
    buf = np.where(hole, np.maximum(buf * 2, np.maximum(held, 0)), buf).astype(np.float32)
    _shade(img, buf, hot, other)
    a, b = max(0, y0 - rp - 4), min(N, y0 + 13 * rp + 4)
    img[a:b, min(N - 1, punch + 1):min(N, punch + 3)] += hot * (0.45 + 0.55 * m['beat/pulse'])


@gen('tech_scan', 'tense', 'mysterious', 'focused')
def _tech_scan(img, m, dt, size, hot, other):
    # a print under a scanner, up and down once a bar: what the line passes shows and fades; the brighter the sound, the finer the ridges
    own = S['own']
    _trail(dt, 0.9)
    own['f'] = own.get('f', 0.8) + (0.65 + 0.6 * _v('bright', 0.5) - own.get('f', 0.8)) * (1 - math.exp(-dt / 0.5))
    a, b = 0.31 * N * size, 0.42 * N * size
    u, v = (_X - N / 2) / a, (_Y - N / 2) / b
    edge = np.clip((1 - np.hypot(u, v)) * 9, 0, 1)
    ang = np.arctan2(v + 0.12, u)
    ph = np.hypot(u, 1.25 * (v + 0.12)) * 26 * own['f'] + 1.5 * np.sin(ang + 0.7) + 2.2 * v * v + 1.4 * np.sin(2.4 * u + 1.1 * v)
    ridge = np.clip(0.55 + 1.3 * np.sin(ph), 0, 1)
    ly = N / 2 + (abs(_beats(m, 2, 'clock/mid') / 4 % 1 * 2 - 1) * 2 - 1) * b * 1.08
    last = own.get('ly', ly)
    own['ly'] = ly
    lo, hi = int(max(0, min(ly, last) - 1)), int(min(N, max(ly, last) + 2))
    S['trail'][lo:hi] = 1.0
    buf = ridge * edge * S['trail']
    bx, by, tip = 1.15 * a, 1.08 * b, 0.28 * a
    for sx in (-1, 1):
        for sy in (-1, 1):  # the corners of the frame
            x, y = N / 2 + sx * bx, N / 2 + sy * by
            _line(buf, x, y, x - sx * tip, y, 0.6)
            _line(buf, x, y, x, y - sy * tip, 0.6)
    _shade(img, buf, hot, other)
    r = int(ly)
    if 0 <= r < N:
        x0, x1 = int(max(0, N / 2 - bx)), int(min(N, N / 2 + bx))
        img[r, x0:x1] += hot
        img[max(0, r - 1):r + 2, x0:x1] += other * 0.3


@gen('tech_matrix', 'euphoric', 'aggressive', 'drop')
def _tech_matrix(img, m, dt, size, hot, other):
    # a crosspoint router: ten inputs as bright as their band, each patched through to an output; a patch is remade every beat
    own, rng = S['own'], S['rng']
    if 'out' not in own:
        own['out'] = rng.permutation(10)
    out = own['out']
    if _tick('patch', m):
        i, j = rng.choice(10, 2, replace=False)
        out[i], out[j] = out[j], out[i]
    b = _bands()
    step = 0.082 * N * size
    gx = N / 2 + step * (np.arange(10, dtype=np.float32) - 4.0)
    gy = N / 2 + step * (4.0 - np.arange(10, dtype=np.float32))
    left, low = gx[0] - 1.4 * step, gy[-1] - 1.4 * step
    buf = np.zeros((N, N), np.float32)
    _line(buf, np.full(10, gx[0]), gy, np.full(10, gx[-1]), gy, 0.13)
    _line(buf, gx, np.full(10, gy[0]), gx, np.full(10, gy[-1]), 0.13)
    px, py = (a.ravel() for a in np.meshgrid(gx, gy))
    _tech_dots(buf, px, py, 0.6, 0.3)
    clocks = np.array((m['clock/bass'],) * 3 + (m['clock/mid'],) * 4 + (m['clock/treb'],) * 3, np.float32)
    t = np.linspace(0, 1, 90, dtype=np.float32)[:, None]
    ox = gx[out]
    dash = lambda d: (0.5 + 0.5 * (np.sin(d * 0.75 - 7 * clocks) > 0)) * (0.3 + 0.7 * b ** 0.7)
    d = (ox - left) * t
    _ink(buf, left + d, gy + 0 * d, dash(d))
    _ink(buf, left + d, gy + 1 + 0 * d, dash(d))
    d = (gy - low) * t
    _ink(buf, ox + 0 * d, low + d, dash(d + ox - left))
    _ink(buf, ox + 1 + 0 * d, low + d, dash(d + ox - left))
    _tech_dots(buf, ox, gy, 1.2 + 2.2 * b, 0.6 + 0.4 * b)
    _tech_dots(buf, np.full(10, left), gy, 2.2, 0.35 + 0.65 * b)
    _tech_dots(buf, gx, np.full(10, low), 2.2, 0.3)
    lit = np.zeros(10, np.float32)
    lit[out] = b
    _tech_dots(buf, gx, np.full(10, low), 2.2, 0.3 + 0.7 * lit)
    _shade(img, buf, hot, other)
