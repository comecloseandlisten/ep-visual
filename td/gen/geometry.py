# Geometry and 3D wireframes. Flat figures draw with _geo_seg, solids go through _geo_turn and _geo_view.

def _geo_put(buf, x, y, w):
    # cells take the brightest light that falls on them, so a line stays even and crossings don't burn out
    keep = (x >= 0) & (x < N) & (y >= 0) & (y < N)
    w = np.broadcast_to(w, x.shape)[keep]
    order = np.argsort(w)
    xi, yi, w = x[keep][order].astype(int), y[keep][order].astype(int), w[order]
    buf[yi, xi] = np.maximum(buf[yi, xi], w)


def _geo_seg(buf, ax, ay, bx, by, w=1.0):
    # straight lines from a to b, all at once
    if ax.size == 0:
        return
    n = min(160, int(max(np.abs(bx - ax).max(), np.abs(by - ay).max())) + 2)
    t = np.linspace(0, 1, n, dtype=np.float32)[:, None]
    _geo_put(buf, ax + (bx - ax) * t, ay + (by - ay) * t, np.broadcast_to(np.float32(w), ax.shape)[None, :])


def _geo_path(buf, x, y, w=1.0):
    # a line through points in turn
    _geo_seg(buf, x[:-1], y[:-1], x[1:], y[1:], w)


def _geo_dots(buf, x, y, w, r=1):
    # round dots of radius r
    o = np.arange(-r, r + 1, dtype=np.float32)
    dx, dy = (a.ravel() for a in np.meshgrid(o, o))
    near = dx * dx + dy * dy <= r * r + 0.5
    _geo_put(buf, x[:, None] + dx[near], y[:, None] + dy[near], np.broadcast_to(np.float32(w), x.shape)[:, None])


def _geo_turn(p, a, b, c=0.0):
    # points k x 3, turned about x, then y, then z
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    ca, sa, cb, sb, cc, sc = math.cos(a), math.sin(a), math.cos(b), math.sin(b), math.cos(c), math.sin(c)
    y, z = ca * y - sa * z, sa * y + ca * z
    x, z = cb * x + sb * z, cb * z - sb * x
    x, y = cc * x - sc * y, sc * x + cc * y
    return np.stack([x, y, z], 1).astype(np.float32)


def _geo_view(p, scale, cam=4.0):
    # in perspective: x, y, and a light that falls away from the viewer
    f = scale * cam / np.maximum(cam - p[:, 2], 0.5)
    return N / 2 + p[:, 0] * f, N / 2 + p[:, 1] * f, np.clip(0.6 + 0.4 * p[:, 2], 0.14, 1).astype(np.float32)


def _geo_wire(buf, x, y, light, edges, w=1.0):
    a, b = edges[:, 0], edges[:, 1]
    _geo_seg(buf, x[a], y[a], x[b], y[b], w * 0.5 * (light[a] + light[b]))


def _geo_axis(k, a):
    # the matrix of a turn about axis k
    c, s = math.cos(a), math.sin(a)
    i, j = (k + 1) % 3, (k + 2) % 3
    r = np.eye(3, dtype=np.float32)
    r[i, i], r[i, j], r[j, i], r[j, j] = c, -s, s, c
    return r


def _geo_x(m, rate=0.7, clock='clock/bass'):
    # the beat as one running number, a clock in its place without a tempo
    return m['beat/count'] + m['beat/phase'] % 1.0 if _locked(m) else rate * m[clock]


def _geo_corners(dims):
    # the corners of a cube in `dims` dimensions, and the edges between them
    p = np.array([[(i >> k & 1) * 2 - 1 for k in range(dims)] for i in range(2 ** dims)], np.float32)
    e = [(i, i ^ (1 << k)) for i in range(2 ** dims) for k in range(dims) if i < i ^ (1 << k)]
    return p, np.array(e)


def _geo_icosahedron():
    g = (1 + 5 ** 0.5) / 2
    v = np.array([(0, a, b * g) for a in (-1, 1) for b in (-1, 1)] + [(a, b * g, 0) for a in (-1, 1) for b in (-1, 1)]
                 + [(b * g, 0, a) for a in (-1, 1) for b in (-1, 1)], np.float32)
    d = np.linalg.norm(v[:, None] - v[None], axis=2)
    f = [(i, j, k) for i in range(12) for j in range(i + 1, 12) for k in range(j + 1, 12)
         if d[i, j] < 2.1 and d[j, k] < 2.1 and d[i, k] < 2.1]
    return v / np.linalg.norm(v[0]), np.array(f)


def _geo_hilbert_path(order):
    p = np.zeros((1, 2), np.float32)
    for k in range(order):
        s = 2 ** k
        p = np.concatenate([p[:, ::-1], p + (0, s), p + (s, s), np.stack([2 * s - 1 - p[:, 1], s - 1 - p[:, 0]], 1)])
    return p


_GEO_CUBE, _GEO_CUBE_E = _geo_corners(3)
_GEO_TESS, _GEO_TESS_E = _geo_corners(4)
_GEO_ICO, _GEO_ICO_F = _geo_icosahedron()
_GEO_WHEELS = ((5, 2), (7, 3), (8, 3), (9, 4), (7, 2), (11, 4), (5, 3), (9, 2), (11, 3), (13, 5), (12, 5), (10, 3))


@gen('geo_spiro', 'calm', 'dreamy', 'happy')
def _geo_spiro(img, m, dt, size, hot, other):
    # a spirograph's pen: the key picks the wheels, the treble drives the pen and swings it out from the hub
    own = S['own']
    _trail(dt, 2.4)
    p, q = _GEO_WHEELS[max(0, int(_v('key/root', -1))) % 12]
    r = q / p
    d = r * (1.3 + 0.7 * m['drive/treb'])
    t1 = 2 * math.pi * q / 3.5 * m['clock/treb']
    t = np.linspace(own.get('t', t1 - 0.05), t1, 40)
    own['t'] = t1
    amp = N * 0.44 * size / (1 - r + d)
    x = N / 2 + amp * ((1 - r) * np.cos(t) + d * np.cos((1 - r) / r * t))
    y = N / 2 + amp * ((1 - r) * np.sin(t) - d * np.sin((1 - r) / r * t))
    _geo_path(S['trail'], x.astype(np.float32), y.astype(np.float32))
    S['trail'][S['trail'] < 0.04] = 0
    _shade(img, S['trail'], hot, other)


@gen('geo_rose', 'melancholic', 'dreamy', 'calm')
def _geo_rose(img, m, dt, size, hot, other):
    # three roses in each other, opened by the bass, the mids and the treble. Major has whole petals, minor lets them cross
    own = S['own']
    root = max(0, int(_v('key/root', -1)))
    if _v('key/major') > 0.5:
        n, d = 3 + root % 5, 1
    else:
        n, d = ((5, 3), (7, 3), (5, 2), (7, 2), (8, 3), (7, 4))[root % 6]
    own['k'] = own.get('k', n / d) + (n / d - own.get('k', n / d)) * min(1.0, 3 * dt)
    s = np.linspace(0, 2 * math.pi * d, 260 * d, dtype=np.float32)
    buf = np.zeros((N, N), np.float32)
    for i, (drive, clock) in enumerate(((m['drive/bass'], 'clock/bass'), (_v('drive/mid'), 'clock/mid'), (m['drive/treb'], 'clock/treb'))):
        amp = N * size * (0.44 - 0.12 * i) * (0.45 + 0.65 * drive)
        rad = amp * np.cos(own['k'] * s)
        a = s + (0.12 + 0.08 * i) * (-1) ** i * m[clock]
        _geo_path(buf, N / 2 + rad * np.cos(a), N / 2 + rad * np.sin(a), 1.0 - 0.28 * i)
    _shade(img, buf, hot, other)


@gen('geo_whirl', 'focused', 'tense', 'mysterious')
def _geo_whirl(img, m, dt, size, hot, other):
    # polygons each set in the last: the twist snaps tight on the beat and unwinds until the next one
    x = _geo_x(m, 0.4, 'clock/mid')
    n = 3 + (int(x) // 8) % 4
    ph = x % 1
    twist = 0.05 + 0.3 * ((1 - ph) ** 2 if _locked(m) else 0.5 + 0.5 * math.sin(2 * math.pi * ph))
    a = 0.3 * m['clock/mid'] + 2 * math.pi * np.arange(n, dtype=np.float32) / n
    px, py = N * 0.47 * size * np.cos(a), N * 0.47 * size * np.sin(a)
    buf = np.zeros((N, N), np.float32)
    for i in range(18):
        _geo_seg(buf, N / 2 + px, N / 2 + py, N / 2 + np.roll(px, -1), N / 2 + np.roll(py, -1), 1.0 - 0.72 * (i % 3) / 2)
        px, py = px + twist * (np.roll(px, -1) - px), py + twist * (np.roll(py, -1) - py)
    _shade(img, buf, hot, other)


@gen('geo_chords', 'mysterious', 'melancholic', 'focused')
def _geo_chords(img, m, dt, size, hot, other):
    # the twelve notes round the circle of fifths, a line between any two sounding together: each chord draws its own
    # polygon, the last one lingers, and the key turns to the top
    own = S['own']
    c = np.array([_v('chroma/%d' % k) for k in range(12)], np.float32)
    c = np.clip((c / max(float(c.max()), 1e-3) - 0.25) / 0.75, 0, 1)
    root = max(0, int(_v('key/root', -1)))
    want = -2 * math.pi * (7 * root % 12) / 12
    turn = own.get('a', want)
    own['a'] = turn + ((want - turn + math.pi) % (2 * math.pi) - math.pi) * min(1.0, 2 * dt)
    ang = math.pi / 2 + turn + 0.08 * math.sin(0.5 * m['clock/mid']) + 2 * math.pi * (7 * np.arange(12) % 12) / 12
    rad = N * 0.43 * size
    x, y = (N / 2 + rad * np.cos(ang)).astype(np.float32), (N / 2 + rad * np.sin(ang)).astype(np.float32)
    buf = np.zeros((N, N), np.float32)
    _geo_seg(buf, x, y, np.roll(x, 1), np.roll(y, 1), 0.2)  # the star through all twelve
    i, j = np.triu_indices(12, 1)
    w = own['w'] = np.maximum(own.get('w', 0.0) * math.exp(-dt / 1.1), c[i] * c[j])
    on = w > 0.05
    _geo_seg(buf, x[i[on]], y[i[on]], x[j[on]], y[j[on]], 0.25 + 0.75 * w[on])
    _geo_dots(buf, x, y, 0.3 + 0.7 * c, 2)
    _shade(img, buf, hot, other)


@gen('geo_tumble', 'aggressive', 'tense', 'drop')
def _geo_tumble(img, m, dt, size, hot, other):
    # a cube rolling a quarter turn on every beat, quick off the mark and still before the next, a small one rolling inside
    own = S['own']
    x = _geo_x(m, 0.9)
    step = int(x)
    if 'r' not in own:
        own.update(r=np.eye(3, dtype=np.float32), step=step)
    if step != own['step']:
        own['r'] = _geo_axis(own['step'] % 3, math.pi / 2) @ own['r']
        own['step'] = step
    r = _geo_axis(step % 3, math.pi / 2 * (1 - (1 - x % 1) ** 4)) @ own['r']
    buf = np.zeros((N, N), np.float32)
    scale = N * 0.21 * size * (1 + 0.12 * m['beat/pulse'])
    gx, gy, gl = _geo_view(_geo_turn(_GEO_CUBE @ r.T, 0.5, 0.65), scale)
    for o in (0.0, 1.0):
        _geo_wire(buf, gx + o, gy, gl, _GEO_CUBE_E)
        _geo_wire(buf, gx, gy + o, gl, _GEO_CUBE_E)
    gx, gy, gl = _geo_view(_geo_turn(0.45 * _GEO_CUBE @ r, 0.5, 0.65), scale)
    _geo_wire(buf, gx, gy, gl, _GEO_CUBE_E, 0.7)
    _shade(img, buf, hot, other)


@gen('geo_tesseract', 'mysterious', 'tense', 'aggressive', 'drop')
def _geo_tesseract(img, m, dt, size, hot, other):
    # a cube in four dimensions: the bass turns it through the fourth, so it keeps passing through itself
    a, b = 0.8 * m['clock/bass'], 0.5 * m['clock/bass']
    x, y, z, w = (_GEO_TESS[:, k] for k in range(4))
    x, w = math.cos(a) * x - math.sin(a) * w, math.sin(a) * x + math.cos(a) * w
    z, w = math.cos(b) * z - math.sin(b) * w, math.sin(b) * z + math.cos(b) * w
    f = 2.4 / (3.0 - w)
    p = _geo_turn(np.stack([x * f, y * f, z * f], 1), 0.45, 0.22 * m['clock/mid'])
    gx, gy, _ = _geo_view(p, N * 0.16 * size * (0.85 + 0.45 * m['drive/bass']))
    buf = np.zeros((N, N), np.float32)
    light = np.clip(0.55 + 0.33 * w, 0.2, 1).astype(np.float32)
    _geo_wire(buf, gx, gy, light, _GEO_TESS_E)
    _geo_dots(buf, gx, gy, light, 2)
    _shade(img, buf, hot, other)


@gen('geo_shatter', 'euphoric', 'aggressive', 'happy', 'drop')
def _geo_shatter(img, m, dt, size, hot, other):
    # an icosahedron whose faces fly off on the backbeat, as far as the snares are strong, and settle again
    strength = _recent('snares', m['hit/snare'], m, dt)
    if _locked(m):
        burst = max(0.4, min(1.0, 1.3 * strength)) * math.exp(-3 * ((_geo_x(m) - 1) % 2))
    else:
        burst = 0.25 + 0.25 * math.sin(0.9 * m['clock/mid'])
    tri = _GEO_ICO[_GEO_ICO_F]
    mid = tri.mean(1, keepdims=True)
    normal = mid / np.linalg.norm(mid, axis=2, keepdims=True)
    band = np.tile(_bands(), 2)[:, None, None]
    p = mid + 0.82 * (tri - mid) + normal * (0.05 + 0.75 * burst * (0.5 + band))
    a, b = 0.4 * m['clock/mid'], 0.3 * m['clock/mid']
    x, y, _ = _geo_view(_geo_turn(p.reshape(-1, 3), a, b), N * 0.27 * size)
    front = _geo_turn(normal[:, 0], a, b)[:, 2]
    light = np.repeat(np.clip(0.55 + 0.6 * front, 0.16, 1), 3).astype(np.float32)
    buf = np.zeros((N, N), np.float32)
    i = np.arange(60)
    _geo_wire(buf, x, y, light, np.stack([i, i // 3 * 3 + (i + 1) % 3], 1))
    _shade(img, buf, hot, other)


def _geo_knot_at(u, p, q):
    r = 1 + 0.42 * np.cos(q * u)
    return np.stack([r * np.cos(p * u), r * np.sin(p * u), 0.55 * np.sin(q * u)], 1).astype(np.float32)


@gen('geo_knot', 'dreamy', 'euphoric', 'calm')
def _geo_knot(img, m, dt, size, hot, other):
    # a torus knot turning in space with beads running along it: the denser the music, the more beads
    p, q = ((3, 5), (2, 5), (3, 4), (2, 7))[int(m['clock/mid'] / 24) % 4]
    t = m['clock/mid']
    a, b, c = 0.45 * math.sin(0.23 * t), 0.45 * math.sin(0.31 * t), 0.2 * t
    x, y, l = _geo_view(_geo_turn(_geo_knot_at(np.linspace(0, 2 * math.pi, 700), p, q), a, b, c), N * 0.28 * size)
    buf = np.zeros((N, N), np.float32)
    _geo_dots(buf, x, y, 0.3 * l, 1)
    _geo_path(buf, x, y, 0.62 * l[1:])
    k = 4 + int(68 * min(1.0, 5 * m['busy'] + 0.5 * m['high']))
    u = (0.618034 * np.arange(k) + 0.05 * m['clock/treb']) % 1 * 2 * math.pi
    x, y, l = _geo_view(_geo_turn(_geo_knot_at(u, p, q), a, b, c), N * 0.28 * size)
    _geo_dots(buf, x, y, 0.5 + 0.5 * l, 2)
    _shade(img, buf, hot, other)


@gen('geo_voronoi', 'focused', 'happy', 'calm', whole=True)
def _geo_voronoi(img, m, dt, size, hot, other):
    # cells round seeds the mids push along; on the eighths another cell fills with light, more of it the brighter the top
    own, rng = S['own'], S['rng']
    g = int(min(6, max(3, round(4.4 / size))))
    k = g * g
    if own.get('k') != k:
        home = (np.stack(np.divmod(np.arange(k), g), 1) + 0.5) * N / g
        own.update(k=k, home=home, f=rng.uniform(0.25, 0.7, (k, 2)), p=rng.uniform(0, 6.28, (k, 2)), glow=np.zeros(k, np.float32))
    seeds = (own['home'] + 0.46 * N / g * np.sin(own['f'] * m['clock/mid'] + own['p'])).astype(np.float32)
    d1 = np.full((N, N), 1e9, np.float32)
    d2 = d1.copy()
    who = np.zeros((N, N), int)
    for i in range(k):
        d = (_X - seeds[i, 0]) ** 2 + (_Y - seeds[i, 1]) ** 2
        near = d < d1
        d2 = np.where(near, d1, np.minimum(d2, d))
        d1 = np.where(near, d, d1)
        who[near] = i
    gap = np.sqrt(d2) - np.sqrt(d1)
    own['glow'] *= math.exp(-dt / 0.45)
    if _tick('cell', m, 2):
        own['glow'][rng.integers(k)] = 0.5 + 0.5 * min(1.0, m['high'] + 0.3)
    fill = own['glow'][who] * np.clip(gap / (14 * size), 0, 1)
    _shade(img, np.maximum(0.7 * np.clip(1.5 - gap / 1.2, 0, 1), fill), hot, other)


@gen('geo_plexus', 'calm', 'melancholic', 'mysterious')
def _geo_plexus(img, m, dt, size, hot, other):
    # points adrift in a ball, joined when close: the louder it is the further they reach, the mesh thins out as it goes quiet
    own, rng = S['own'], S['rng']
    if 'p' not in own:
        p = rng.normal(size=(66, 3))
        p = p / np.linalg.norm(p, axis=1, keepdims=True) * rng.uniform(0.35, 1.0, (66, 1)) ** 0.5
        own.update(p=p.astype(np.float32), f=rng.uniform(0.2, 0.7, (66, 3)), a=rng.uniform(0, 6.28, (66, 3)), ij=np.triu_indices(66, 1))
    t = m['clock/mid']
    q = (own['p'] + 0.28 * np.sin(own['f'] * t + own['a'])).astype(np.float32)
    i, j = own['ij']
    d = np.linalg.norm(q[i] - q[j], axis=1)
    reach = 0.18 + 0.36 * m['level']
    on = d < reach
    x, y, l = _geo_view(_geo_turn(q, 0.4, 0.2 * t), N * 0.38 * size)
    buf = np.zeros((N, N), np.float32)
    i, j = i[on], j[on]
    _geo_seg(buf, x[i], y[i], x[j], y[j], (1.2 - d[on] / reach) * 0.5 * (l[i] + l[j]))
    _geo_dots(buf, x, y, 0.5 + 0.5 * l, 1)
    _shade(img, buf, hot, other)


def _geo_arcs(u, v, t):
    d = np.minimum(np.abs(np.hypot(u, v) - 0.5), np.abs(np.hypot(1 - u, 1 - v) - 0.5))
    return np.clip(1.6 - d * t / 0.9, 0, 1).astype(np.float32)


@gen('geo_truchet', 'happy', 'focused', 'tense', whole=True)
def _geo_truchet(img, m, dt, size, hot, other):
    # quarter-circle tiles that make one winding path: on the eighths a few turn over, the more the brighter the top end
    own, rng = S['own'], S['rng']
    g = max(5, int(round(N / (12.5 * size))))
    if own.get('g') != g:
        t = N / g
        i, j = np.minimum(_X / t, g - 1).astype(int), np.minimum(_Y / t, g - 1).astype(int)
        u, v = _X / t - i, _Y / t - j
        f = rng.integers(0, 2, (g, g)).astype(np.float32)
        own.update(g=g, i=i, j=j, a=_geo_arcs(u, v, t), b=_geo_arcs(1 - u, v, t), f=f, e=f.copy(), glow=np.zeros((g, g), np.float32))
    f, glow = own['f'], own['glow']
    if _tick('flip', m, 2):
        cells = rng.integers(0, g * g, 1 + int(0.16 * g * g * min(1.0, m['high'] + 0.1)))
        f.flat[cells] = 1 - f.flat[cells]
        glow.flat[cells] = 1
    own['e'] += (f - own['e']) * min(1.0, 14 * dt)
    glow *= math.exp(-dt / 0.5)
    e = own['e'][own['j'], own['i']]
    _shade(img, (own['a'] * (1 - e) + own['b'] * e) * (0.42 + 0.58 * glow[own['j'], own['i']]), hot, other)


@gen('geo_hex', 'euphoric', 'happy', 'drop', whole=True)
def _geo_hex(img, m, dt, size, hot, other):
    # a honeycomb, the spectrum in its rings: bass in the middle, treble at the rim, each cell as big as its band is loud
    own = S['own']
    a = 8.2 * size
    if own.get('a') != a:
        x, y = _X - N / 2, _Y - N / 2
        q, r = (3 ** 0.5 / 3 * x - y / 3) / a, (2 / 3 * y) / a
        rx, rz = np.round(q), np.round(r)
        ry = np.round(-q - r)
        ex, ey, ez = np.abs(rx - q), np.abs(ry + q + r), np.abs(rz - r)
        rx = np.where((ex > ey) & (ex > ez), -ry - rz, rx)
        rz = np.where((ez >= ex) & (ez >= ey), -rx - ry, rz)
        ry = -rx - rz
        ring = np.maximum(np.abs(rx), np.maximum(np.abs(ry), np.abs(rz)))
        lx, ly = x - a * 3 ** 0.5 * (rx + rz / 2), y - a * 1.5 * rz
        s = 3 ** 0.5 / 2
        norm = np.maximum(np.abs(lx), np.maximum(np.abs(lx / 2 + ly * s), np.abs(lx / 2 - ly * s))) / (a * s)
        own.update(a=a, slot=np.minimum(9, ring * 10 // (ring.max() + 1)).astype(int), norm=norm.astype(np.float32))
    b = _bands()[own['slot']]
    edge = 0.14 + 0.72 * b - own['norm']
    _shade(img, np.where(edge < 0.13, 1.0, 0.32) * (edge > 0) * (0.4 + 0.6 * b), hot, other)


@gen('geo_hilbert', 'focused', 'tense', 'mysterious', whole=True)
def _geo_hilbert(img, m, dt, size, hot, other):
    # the Hilbert curve walked a stretch a beat, eight bars for the whole of it, as long a tail as the music is loud
    own = S['own']
    if 'p' not in own:
        own['p'] = _geo_hilbert_path(5)
    p = own['p']
    x, y = N / 2 + (p[:, 0] - 15.5) * 3.8 * size, N / 2 + (p[:, 1] - 15.5) * 3.8 * size
    b = _geo_x(m, 0.8, 'clock/mid')
    head = int(32 * (int(b) + 1 - (1 - b % 1) ** 3)) % 1024
    buf = np.zeros((N, N), np.float32)
    _geo_path(buf, x, y, 0.2)
    k = np.arange(int(100 + 420 * m['level']))
    i = (head - k) % 1024
    on = i < 1023
    _geo_seg(buf, x[i[on]], y[i[on]], x[i[on] + 1], y[i[on] + 1], (1 - k[on] / len(k)) ** 1.5 + 0.12)
    _geo_dots(buf, x[head:head + 1], y[head:head + 1], 1.0, 2)
    _shade(img, buf, hot, other)


@gen('geo_super', 'dreamy', 'melancholic', 'euphoric')
def _geo_super(img, m, dt, size, hot, other):
    # superformula shapes, one in the other: how bright the sound is and how worked up the mood sets the outline, and every
    # change sinks in from the rim to the middle
    own = S['own']
    h = own.setdefault('h', [])
    sway = 0.5 + 0.5 * math.sin(0.45 * m['clock/mid'])
    h.append((0.8 + 7 * (1 - _v('mood/arousal')) * (0.25 + 0.75 * sway), 3 + 7 * _v('bright')))  # (2 would be a circle)
    del h[:-60]
    lobes = 3 + (int(_geo_x(m, 0.4, 'clock/mid')) // 16) % 6
    phi = np.linspace(0, 2 * math.pi, 420, dtype=np.float32)
    buf = np.zeros((N, N), np.float32)
    turn = 0.15 * m['clock/mid']
    for i in range(7):
        n1, n2 = h[max(0, len(h) - 1 - 8 * i)]
        c = np.abs(np.cos(lobes * phi / 4)) ** n2 + np.abs(np.sin(lobes * phi / 4)) ** n2
        r = np.maximum(c, 1e-3) ** (-1 / n1)
        r = r / r.max() * N * 0.46 * size * (1 - i / 7.5)
        a = phi + turn * (1 + 0.25 * i)
        _geo_path(buf, N / 2 + r * np.cos(a), N / 2 + r * np.sin(a), 1 - 0.1 * i)
    _shade(img, buf, hot, other)


def _geo_strip(u, s):
    r = 1 + 0.5 * s * np.cos(u / 2)
    return np.stack([r * np.cos(u), r * np.sin(u), 0.5 * s * np.sin(u / 2)], 1).astype(np.float32)


@gen('geo_mobius', 'melancholic', 'mysterious', 'dreamy')
def _geo_mobius(img, m, dt, size, hot, other):
    # a Moebius strip of ribs with a light going round a bar at a time, on the far side after one round, home after two
    a, b = 0.75 + 0.2 * math.sin(0.3 * m['clock/mid']), 0.25 * m['clock/mid']
    scale = N * 0.33 * size
    u = np.linspace(0, 2 * math.pi, 49)[:-1]
    x0, y0, l0 = _geo_view(_geo_turn(_geo_strip(u, -1.0), a, b), scale)
    x1, y1, l1 = _geo_view(_geo_turn(_geo_strip(u, 1.0), a, b), scale)
    buf = np.zeros((N, N), np.float32)
    _geo_seg(buf, x0, y0, x1, y1, 0.42 * (l0 + l1) / 2)
    e = np.linspace(0, 4 * math.pi, 200)  # its one edge, twice round
    x, y, l = _geo_view(_geo_turn(_geo_strip(e, 1.0), a, b), scale)
    _geo_path(buf, x, y, 0.8 * l[1:])
    run = 2 * math.pi * _geo_x(m, 0.5, 'clock/mid') / 4 - np.arange(0, 1.5, 0.04)
    x0, y0, _ = _geo_view(_geo_turn(_geo_strip(run, 0.04), a, b), scale)
    x1, y1, _ = _geo_view(_geo_turn(_geo_strip(run, 0.96), a, b), scale)
    _geo_seg(buf, x0, y0, x1, y1, (1 - np.arange(len(run)) / len(run)) ** 1.5 + 0.1)
    _shade(img, buf, hot, other)


@gen('geo_sphere', 'aggressive', 'euphoric', 'tense', 'drop')
def _geo_sphere(img, m, dt, size, hot, other):
    # a sphere of points, the bass swelling a standing wave in it; every two bars the wave takes another shape
    own = S['own']
    if 'z' not in own:
        i = np.arange(2000, dtype=np.float32) + 0.5
        own.update(z=1 - 2 * i / 2000, phi=i * 2.399963, was=(2, 3), now=(2, 3), mix=1.0)
    z, phi = own['z'], own['phi']
    if _tick('wave', m, 0.125):
        own.update(was=own['now'], now=(1 + int(S['rng'].integers(4)), 2 + int(S['rng'].integers(5))), mix=0.0)
    own['mix'] = min(1.0, own['mix'] + 2.5 * dt)
    th = np.arccos(z)
    t = m['clock/bass']
    wave = (1 - own['mix']) * np.sin(own['was'][0] * th + t) * np.cos(own['was'][1] * phi) \
        + own['mix'] * np.sin(own['now'][0] * th + t) * np.cos(own['now'][1] * phi)
    r = 1 + (0.06 + 0.5 * m['drive/bass']) * wave
    rho = np.sqrt(1 - z * z) * r
    p = np.stack([rho * np.cos(phi), rho * np.sin(phi), z * r], 1).astype(np.float32)
    x, y, l = _geo_view(_geo_turn(p, 0.5 + 0.2 * t, 0.3 * t), N * 0.3 * size)
    buf = np.zeros((N, N), np.float32)
    _geo_put(buf, x, y, l)
    _shade(img, buf, hot, other)


@gen('geo_gyro', 'happy', 'focused', 'calm')
def _geo_gyro(img, m, dt, size, hot, other):
    # a gyroscope: three gimbals, one in the other, on the clocks of the bass, the mids and the treble
    u = np.linspace(0, 2 * math.pi, 121)
    circle = np.stack([np.cos(u), np.sin(u), 0 * u], 1).astype(np.float32)
    rib = 2 * math.pi * np.arange(16) / 16
    spoke = np.stack([np.cos(rib), np.sin(rib), 0 * rib], 1).astype(np.float32)
    pin = np.array([[0, 1, 0], [0, -1, 0]], np.float32)
    r = np.eye(3, dtype=np.float32)
    buf = np.zeros((N, N), np.float32)
    scale = N * 0.37 * size
    for i, (clock, rate, axis, rad) in enumerate((('clock/bass', 0.55, 1, 1.0), ('clock/mid', 0.8, 0, 0.74), ('clock/treb', 1.15, 1, 0.5))):
        r = r @ _geo_axis(axis, rate * m[clock])

        def seen(p):
            return _geo_view(_geo_turn(p @ r.T, 0.45, 0.35), scale)
        for k in (rad, 0.88 * rad):
            x, y, l = seen(k * circle)
            _geo_path(buf, x, y, 1.5 * l[1:])
        x0, y0, l0 = seen(rad * spoke)
        x1, y1, _ = seen(0.88 * rad * spoke)
        _geo_seg(buf, x0, y0, x1, y1, l0)
        if i:  # the pins it hangs from
            x0, y0, l0 = seen(rad * pin if axis == 0 else rad * pin[:, ::-1])
            x1, y1, _ = seen(1.36 * rad * pin if axis == 0 else 1.36 * rad * pin[:, ::-1])
            _geo_seg(buf, x0, y0, x1, y1, 1.5 * l0)
    x, y, l = seen(0.16 * _GEO_CUBE)
    _geo_wire(buf, x, y, l, _GEO_CUBE_E, 1.5)
    _shade(img, buf, hot, other)


@gen('geo_dragon', 'mysterious', 'euphoric', 'tense')
def _geo_dragon(img, m, dt, size, hot, other):
    # the paper-folding dragon: the treble's clock unfolds it again and again, into a fractal, then folds it back up
    own = S['own']
    c = own.setdefault('c', {0: np.array([[0, 0], [1, 0]], np.float32)})
    y = 0.6 * m['clock/treb'] % 10
    y = y if y < 5 else 10 - y
    k = 5 + min(4, int(y))
    f = y - int(y) if y < 5 else 1.0
    f = f * f * (3 - 2 * f)
    for i in range(1, k + 1):
        if i not in c:
            p = c[i - 1]
            q = p[::-1][1:] - p[-1]
            c[i] = np.concatenate([p, p[-1] + np.stack([-q[:, 1], q[:, 0]], 1)])
    p = c[k]
    q = p[::-1] - p[-1]
    a = math.pi / 2 * f
    q = p[-1] + np.stack([math.cos(a) * q[:, 0] - math.sin(a) * q[:, 1], math.sin(a) * q[:, 0] + math.cos(a) * q[:, 1]], 1)
    both = np.concatenate([p, q])
    lo, hi = both.min(0), both.max(0)
    scale = N * 0.86 * size / float((hi - lo).max())
    p, q = N / 2 + (p - (lo + hi) / 2) * scale, N / 2 + (q - (lo + hi) / 2) * scale
    still, moved = np.zeros((N, N), np.float32), np.zeros((N, N), np.float32)
    _geo_path(still, p[:, 0].astype(np.float32), p[:, 1].astype(np.float32), 0.75)
    _geo_path(moved, q[:, 0].astype(np.float32), q[:, 1].astype(np.float32), 1.0)
    img += still[..., None] * other + moved[..., None] * hot
