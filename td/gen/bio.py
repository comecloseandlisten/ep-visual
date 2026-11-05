# bio: living things as a microscope or a diagram draws them.
#   bio_worms      worms in a dish going for the ten bands, which lie round the rim as food
#   bio_amoeba     an outline breathing with the mids, putting out feet a bar at a time
#   bio_cilia      a row of hairs on a wall beating in waves with the treble, carrying specks along
#   bio_tentacles  eight arms round a hub, four reaching out on each beat
#   bio_web        a web spun a strand every sixteenth, shaken by the bass
#   bio_ants       ants marching in sixteenths between nest and food, as many as the music is dense
#   bio_bacteria   rods that pinch and split on the beat until the dish is full
#   bio_dna        a double helix whose rungs are the twelve notes
#   bio_neurons    spikes running from cell to cell in half beats, spreading the more hats and snares there are
#   bio_heart      a muscle pumping lub-dub as hard as the kicks, the pressure going out along its vessels
#   bio_blood      cells in a vessel, carried by the bass clock
#   bio_jelly      a bell that closes every two beats and rises, tentacles trailing
#   bio_diatom     a glass shell whose symmetry is the key: its root the number of arms, minor pointed, major round
#   bio_iris       an iris whose pupil opens with the level
#   bio_plankton   glowing specks, each on its own clock, pulled together as the beat gets sure
#   bio_skin       a reaction-diffusion coat: spots with a dark sound, a maze with a bright one
#   bio_seeds      a seed head growing at the golden angle, its spirals lit by the notes
#   bio_feather    a feather whose barbs are the spectrum, lows by the quill, highs at the tip


def _bio_wrap(a):
    # an angle as -pi .. pi
    return (a + math.pi) % (2 * math.pi) - math.pi


def _bio_thread(buf, x, y, w=0.5, sub=3):
    # a line through points along the first axis, `sub` cells of light to each gap
    t = (np.arange(sub, dtype=np.float32) / sub).reshape((1, sub) + (1,) * (x.ndim - 1))
    xs = x[:-1, None] + (x[1:] - x[:-1])[:, None] * t
    ys = y[:-1, None] + (y[1:] - y[:-1])[:, None] * t
    ww = np.broadcast_to(w, x.shape)[:-1, None]
    _plot(buf, xs, ys, np.broadcast_to(ww, xs.shape))


def _bio_dots(buf, x, y, r, w=1.0):
    # discs at x, y of radius r, soft at the edge
    r = np.broadcast_to(np.asarray(r, np.float32), x.shape)
    k = int(math.ceil(float(r.max()) + 0.5)) if r.size else 0
    oy, ox = np.mgrid[-k:k + 1, -k:k + 1].astype(np.float32)
    ox, oy = ox.ravel(), oy.ravel()
    near = np.clip(r[..., None] + 0.5 - np.hypot(ox, oy), 0, 1)
    _plot(buf, x[..., None] + ox, y[..., None] + oy, near * np.broadcast_to(w, x.shape)[..., None])


@gen('bio_worms', 'focused', 'mysterious', 'tense')
def _bio_worms(img, m, dt, size, hot, other):
    # each worm steers for the loudest food near it, with a taste for some bands, so they part and meet as the sound moves
    own, rng = S['own'], S['rng']
    k, n = 6, 66
    if 'h' not in own:
        at = rng.uniform(0.3 * N, 0.7 * N, (k, 1, 2)).astype(np.float32)
        own.update(h=np.repeat(at, n, 1), go=rng.uniform(0, 2 * math.pi, k).astype(np.float32))
    b = _bands()
    rim = N * 0.41 * min(size, 1.15)
    ang = 2 * math.pi * np.arange(10, dtype=np.float32) / 10 + 0.1 * m['clock/mid']
    fx, fy = N / 2 + rim * np.cos(ang), N / 2 + rim * np.sin(ang)
    h, i = own['h'], np.arange(k)
    dx, dy = fx - h[:, 0, :1], fy - h[:, 0, 1:2]
    taste = 1 + 2 * ((np.arange(10) - i[:, None]) % k == 0)
    best = np.argmax(b ** 2 * taste / (np.hypot(dx, dy) + 20), 1)
    turn = _bio_wrap(np.arctan2(dy[i, best], dx[i, best]) - own['go'])
    own['go'] = own['go'] + dt * (3.5 * turn + 7 * np.sin(3.5 * m['clock/mid'] + 2.1 * i))
    speed = N * (0.1 + 0.5 * b[best])
    head = h[:, 0] + (dt * speed)[:, None] * np.stack([np.cos(own['go']), np.sin(own['go'])], 1)
    own['h'] = h = np.roll(h, 1, 1)
    h[:, 0] = head
    body = h[:, ::3]
    s = np.linspace(0, 1, body.shape[1], dtype=np.float32)
    buf = np.zeros((N, N), np.float32)
    ring = np.where(np.arange(s.size) % 2, 0.3, 0.16).astype(np.float32)  # the worm's segments
    _bio_dots(buf, body[..., 0], body[..., 1], (2.6 - 1.9 * s) * size ** 0.5, np.broadcast_to(ring, body.shape[:2]))
    _bio_dots(buf, head[:, 0], head[:, 1], 1.6 * size ** 0.5, 1.0)
    _shade(img, buf, hot, other)
    food = np.zeros((N, N), np.float32)
    _bio_dots(food, fx, fy, 1.2 + 6.5 * b ** 1.5 * size, 0.55)
    img += np.clip(food, 0, 1)[..., None] * other


@gen('bio_amoeba', 'calm', 'dreamy', 'melancholic')
def _bio_amoeba(img, m, dt, size, hot, other):
    # breathes with the mids; a foot moves to a new side every bar and flows there
    own, rng = S['own'], S['rng']
    if 'foot' not in own:
        own.update(foot=rng.uniform(-3, 3, 3).astype(np.float32), aim=rng.uniform(-3, 3, 3).astype(np.float32),
                   bits=rng.uniform(0, 1, (46, 2)).astype(np.float32))
    if _tick('foot', m, 0.25):
        own['aim'][rng.integers(3)] = rng.uniform(-3, 3)
    own['foot'] = own['foot'] + _bio_wrap(own['aim'] - own['foot']) * min(1.0, 1.6 * dt)
    mid, c = _v('drive/mid', m['level']), m['clock/mid']
    cx, cy = N / 2 + 0.11 * N * math.sin(0.23 * c), N / 2 + 0.09 * N * math.sin(0.31 * c + 1)
    big = N * 0.24 * size * (0.8 + 0.4 * mid)

    def edge(a):
        e = 1 + 0.13 * np.sin(3 * a + c) + 0.09 * np.sin(5 * a - 1.4 * c) + 0.05 * np.sin(7 * a + 0.6 * c)
        for f in own['foot']:
            e = e + (0.25 + 0.5 * mid) * np.exp(-(_bio_wrap(a - f) / 0.33) ** 2)
        return big * e

    x, y = _X - cx, _Y - cy
    r, a = np.hypot(x, y), np.arctan2(y, x)
    e = edge(a)
    buf = np.clip(1 - np.abs(r - e) / 1.5, 0, 1) * 0.95
    inside = np.clip(r / e, 0, 1) ** 3 * (r < e) * 0.22  # thicker light towards the skin
    ga = own['bits'][:, 0] * 2 * math.pi + 0.3 * np.sin(0.6 * c + 9 * own['bits'][:, 1])
    gr = edge(ga) * (0.25 + 0.6 * own['bits'][:, 1])
    bits = np.zeros((N, N), np.float32)
    _plot(bits, cx + gr * np.cos(ga), cy + gr * np.sin(ga), 0.7)
    nx, ny = np.float32([cx + 0.22 * big * math.cos(0.4 * c)]), np.float32([cy + 0.22 * big * math.sin(0.33 * c)])
    _bio_dots(bits, nx, ny, 0.3 * big, 0.5)
    _bio_dots(bits, nx, ny, 0.12 * big, 0.5)
    _shade(img, buf, hot, other)
    img += (inside + np.clip(bits, 0, 1))[..., None] * other


@gen('bio_cilia', 'focused', 'calm', 'happy')
def _bio_cilia(img, m, dt, size, hot, other):
    # the wave runs down the row on the treble's clock; the louder the top end the longer and wilder the stroke
    own, rng = S['own'], S['rng']
    k, n = 54, 15
    treb, ct = m['drive/treb'], m['clock/treb']
    if 'sp' not in own:
        own.update(sp=rng.uniform(-0.5, 0.5, 26).astype(np.float32), up=rng.uniform(1.0, 1.5, 26).astype(np.float32), c=ct)
    big, top = 1.5 * N, 0.26 * N
    ox, oy = N / 2, top - big
    wa = np.linspace(-0.48, 0.48, k, dtype=np.float32)
    ph = 15 * wa - 3.2 * ct
    long = N * 0.36 * size * (0.55 + 0.6 * treb)
    s = np.linspace(0, 1, n, dtype=np.float32)[:, None]
    bend = (0.4 + 1.0 * treb) * (1.5 * s * np.sin(ph) + 0.8 * s * s * np.sin(ph - 1.6))
    th = wa + bend
    x = ox + big * np.sin(wa) + np.cumsum(np.sin(th), 0) * long / n
    y = oy + big * np.cos(wa) + np.cumsum(np.cos(th), 0) * long / n
    buf = np.zeros((N, N), np.float32)
    _bio_thread(buf, x, y, (0.2 + 0.32 * (1 + np.sin(ph))) * (0.35 + 0.65 * s), 2)
    rr = np.hypot(_X - ox, _Y - oy)
    wall = np.clip(1 - np.abs(rr - big) / 1.6, 0, 1)
    below = np.clip((big - rr) / (0.22 * N), 0, 1) * (rr < big)
    _shade(img, buf + wall, hot, other)
    img += ((1 - below) * (rr < big) * 0.22)[..., None] * other
    own['sp'] = (own['sp'] + (ct - own['c']) * 0.22 + 0.5) % 1.0 - 0.5
    own['c'] = ct
    a = own['sp']  # the specks ride just over the hairs
    h = big + long * own['up'] * (1 + 0.1 * np.sin(15 * a - 3.2 * ct))
    sp = np.zeros((N, N), np.float32)
    _bio_dots(sp, ox + h * np.sin(a), oy + h * np.cos(a), 1.4, 0.9)
    img += np.clip(sp, 0, 1)[..., None] * other


@gen('bio_tentacles', 'aggressive', 'tense', 'drop')
def _bio_tentacles(img, m, dt, size, hot, other):
    # two groups of arms take the beats in turn: out at once on their beat, curling back over the next
    own, rng = S['own'], S['rng']
    k, n = 8, 20
    if 'aim' not in own:
        own['aim'] = (2 * math.pi * np.arange(k) / k).astype(np.float32)
    i = np.arange(k)
    beats = _beats(m, 0.8)
    if _tick('aim', m):  # those about to go out find a new direction
        odd = int(beats) % 2
        pick = i % 2 == odd
        own['aim'][pick] = 2 * math.pi * i[pick] / k + rng.uniform(-0.3, 0.3, int(pick.sum()))
    p = ((beats + i % 2) % 2) / 2
    reach = np.minimum(1, p / 0.05) * (1 - p) ** 2.4
    strength = 0.75 + 0.25 * _recent('kicks', max(m['hit/kick'], 0.8 * m['hit/bass']), m, dt)
    long = N * (0.13 + 0.42 * reach * strength) * size
    s = np.linspace(0, 1, n, dtype=np.float32)[:, None]
    side = np.where((i // 2) % 2, 1.0, -1.0)
    th = own['aim'] + side * (1 - reach) * 3.4 * s * s + 0.4 * np.sin(5 * s - 2.2 * beats + i)
    hub = 0.1 * N * size
    x = N / 2 + hub * np.cos(own['aim']) + np.cumsum(np.cos(th), 0) * long / n
    y = N / 2 + hub * np.sin(own['aim']) + np.cumsum(np.sin(th), 0) * long / n
    buf = np.zeros((N, N), np.float32)
    r = (0.6 + 3.2 * (1 - s) ** 0.9) * size ** 0.5 * np.ones_like(x)
    _bio_dots(buf, x, y, r, 0.16 + 0.14 * reach * np.ones_like(x))
    d = np.hypot(_X - N / 2, _Y - N / 2)
    buf += np.clip(1 - np.abs(d - hub) / 1.6, 0, 1) + 0.3 * (d < hub)
    _shade(img, buf, hot, other)
    dots = np.zeros((N, N), np.float32)  # the suckers
    _plot(dots, x[1:-3:3], y[1:-3:3], 0.8)
    img += dots[..., None] * other


def _bio_web_build(rng, k, q):
    # the strands round the middle, in the order they are spun: spokes, then the spiral from the outside in
    a = 2 * math.pi * (np.arange(k) + rng.uniform(-0.2, 0.2, k)) / k
    far = N * 0.48 * rng.uniform(0.82, 1.1, k)
    tips = np.stack([far * np.cos(a), far * np.sin(a)], 1)
    j = np.arange(k * q + 1)
    turn = (1 - 0.87 * j / (k * q))[:, None]
    spiral = tips[j % k] * turn
    return dict(a=rng.permutation(tips).astype(np.float32), s0=spiral[:-1].astype(np.float32), s1=spiral[1:].astype(np.float32))


@gen('bio_web', 'mysterious', 'melancholic', 'tense')
def _bio_web(img, m, dt, size, hot, other):
    # a strand every sixteenth, spokes first; the new ones shine; the bass shakes what stands; when done it hangs a while
    own, rng = S['own'], S['rng']
    k, q, stay = 15, 9, 28
    if 'n' not in own:
        own.update(n=0, web=_bio_web_build(rng, k, q))
    if _tick('spin', m, 4):
        own['n'] += 1
        if own['n'] > k + k * q + stay:
            own.update(n=0, web=_bio_web_build(rng, k, q))
    n, web = own['n'], own['web']
    end = k + k * q
    fade = float(np.clip((end + stay - n) / 8.0, 0, 1))
    shake, cb = 2.4 * m['drive/bass'] ** 2, m['clock/bass']
    buf = np.zeros((N, N), np.float32)
    ns = min(n, k)
    if ns:  # the spokes
        p = web['a'][:ns] * size
        t = np.linspace(0, 1, 70, dtype=np.float32)[:, None]
        wob = shake * np.sin(math.pi * t) * np.sin(13 * cb + 1.7 * np.arange(ns))
        _plot(buf, N / 2 + p[:, 0] * t - p[:, 1] / np.hypot(p[:, 0], p[:, 1]) * wob, N / 2 + p[:, 1] * t + p[:, 0] / np.hypot(p[:, 0], p[:, 1]) * wob,
              np.float32(0.55 * fade))
    nr = max(0, min(n - k, k * q))
    tip = None
    if nr:  # the spiral, sagging to the middle between the spokes
        p0, p1 = web['s0'][:nr] * size, web['s1'][:nr] * size
        t = np.linspace(0, 1, 24, dtype=np.float32)[:, None]
        sag = 1 - 0.09 * np.sin(math.pi * t)
        wob = 1 + shake * 0.012 * np.sin(math.pi * t) * np.sin(17 * cb + 0.9 * np.arange(nr))
        new = np.clip(1 - (nr - 1 - np.arange(nr, dtype=np.float32)) / 10, 0, 1)
        w = np.broadcast_to((0.2 + 0.7 * new * new) * fade, (24, nr)).astype(np.float32)
        _plot(buf, N / 2 + (p0[:, 0] + (p1[:, 0] - p0[:, 0]) * t) * sag * wob, N / 2 + (p0[:, 1] + (p1[:, 1] - p0[:, 1]) * t) * sag * wob, w)
        tip = p1[-1]
    elif ns:
        tip = web['a'][ns - 1] * size
    if tip is not None and n <= end:  # the spider, a dot at the end of the thread
        _bio_dots(buf, np.float32([N / 2 + tip[0]]), np.float32([N / 2 + tip[1]]), 1.9, 1.0)
    _shade(img, buf, hot, other)


def _bio_ants_path(rng):
    # a pile of food somewhere round the nest and the bend in the way there
    a = rng.uniform(0, 2 * math.pi)
    far = rng.uniform(0.3, 0.44) * N
    f = np.array([math.cos(a), math.sin(a)]) * far
    return f, f * 0.5 + np.array([-f[1], f[0]]) * rng.uniform(-0.7, 0.7)


@gen('bio_ants', 'focused', 'happy')
def _bio_ants(img, m, dt, size, hot, other):
    # they march on the sixteenths, more of them the denser the music; the trails they lay fade, the piles run out
    own, rng = S['own'], S['rng']
    most = 130
    _trail(dt, 2.6)
    if 'u' not in own:
        paths = [_bio_ants_path(rng) for _ in range(3)]
        own.update(f=np.array([p[0] for p in paths]), c=np.array([p[1] for p in paths]), left=np.ones(3),
                   u=rng.uniform(0, 1, most), way=np.where(rng.random(most) < 0.5, 1, -1), p=rng.integers(0, 3, most),
                   off=rng.normal(0, 1.3, most), pace=rng.uniform(0.75, 1.25, most), load=np.zeros(most, bool))
    n = 18 + int((most - 18) * min(1.0, 5 * m['busy'] + 0.4 * m['high']))
    u, way, p, load = own['u'], own['way'], own['p'], own['load']
    if _tick('march', m, 4):
        u[:n] += way[:n] * own['pace'][:n] * 0.052 / size ** 0.5
        there = np.nonzero((u[:n] >= 1) & (way[:n] > 0))[0]
        for a in there:
            if own['left'][p[a]] > 0:
                own['left'][p[a]] -= 0.012
                load[a] = True
        way[there], u[there] = -1, 1.0
        home = np.nonzero((u[:n] <= 0) & (way[:n] < 0))[0]
        live = np.nonzero(own['left'] > 0)[0]
        way[home], u[home], load[home] = 1, 0.0, False
        if live.size:
            p[home] = rng.choice(live, home.size)
        for j in range(3):  # a pile gone, and nobody left on its way: another one elsewhere
            if own['left'][j] <= 0 and not (p[:n] == j).any():
                own['f'][j], own['c'][j] = _bio_ants_path(rng)
                own['left'][j] = 1.0
                p[n:][p[n:] == j] = (j + 1) % 3
    t = np.clip(u[:n], 0, 1)[:, None]
    f, c = own['f'][p[:n]] * size, own['c'][p[:n]] * size
    at = 2 * (1 - t) * t * c + t * t * f
    way_to = 2 * (1 - t) * c + 2 * t * (f - c)
    way_to = way_to / (np.hypot(way_to[:, :1], way_to[:, 1:]) + 1e-3)
    x = N / 2 + at[:, 0] - way_to[:, 1] * own['off'][:n]
    y = N / 2 + at[:, 1] + way_to[:, 0] * own['off'][:n]
    _plot(S['trail'], x, y, (0.012 + 0.02 * load[:n]).astype(np.float32))
    img += (np.clip(S['trail'] * 2.2, 0, 1) * 0.75)[..., None] * other
    ants = np.zeros((N, N), np.float32)
    _plot(ants, x, y, 1.0)
    _plot(ants, x - way_to[:, 0] * way[:n] * 1.4, y - way_to[:, 1] * way[:n] * 1.4, 0.7)
    _plot(ants, x + way_to[:, 0] * way[:n] * 1.4, y + way_to[:, 1] * way[:n] * 1.4, np.where(load[:n], 1.0, 0.0).astype(np.float32))
    pile = np.zeros((N, N), np.float32)
    live = own['left'] > 0
    _bio_dots(pile, (N / 2 + own['f'][live, 0] * size).astype(np.float32), (N / 2 + own['f'][live, 1] * size).astype(np.float32),
              (1.5 + 5.5 * own['left'][live]).astype(np.float32) * size ** 0.5, 0.8)
    d = np.hypot(_X - N / 2, _Y - N / 2)  # the nest
    _shade(img, ants + pile + np.clip(1 - np.abs(d - 4.5 * size ** 0.5) / 1.3, 0, 1), hot, other)


@gen('bio_bacteria', 'happy', 'euphoric', 'focused')
def _bio_bacteria(img, m, dt, size, hot, other):
    # those due stretch and pinch through the beat and part on the next one; a full dish dies back, a beat's fade
    own, rng = S['own'], S['rng']
    most = 44
    if 'c' not in own:
        c = np.zeros((4, 5), np.float32)  # x, y, angle, due, dying
        c[:, :2] = rng.uniform(-0.15, 0.15, (4, 2)) * N
        c[:, 2] = rng.uniform(0, math.pi, 4)
        c[:, 3] = 1
        own.update(c=c, since=0.0)
    c = own['c']
    long, wide = 6.2 * size ** 0.6, 3.1 * size ** 0.6
    own['since'] += dt
    if _tick('split', m):
        own['since'] = 0.0
        due = (c[:, 3] > 0) & (c[:, 4] == 0)
        twin = c[due].copy()
        dx, dy = np.cos(c[due, 2]) * long * 0.95, np.sin(c[due, 2]) * long * 0.95
        c[due, 0] -= dx
        c[due, 1] -= dy
        twin[:, 0] += dx
        twin[:, 1] += dy
        twin[:, 2] += rng.uniform(-0.3, 0.3, len(twin))
        c = np.concatenate([c, twin])
        whole = c[:, 4] == 0
        c[:, 3] = 0
        if whole.sum() >= most:
            c[whole & (rng.random(len(c)) < 0.72), 4] = 0.001
        else:
            c[whole & (rng.random(len(c)) < 0.6), 3] = 1
    c[c[:, 4] > 0, 4] += dt / _beat(m) / 1.5
    c = c[c[:, 4] < 1]
    if not len(c):
        own.pop('c')
        return
    d = c[:, None, :2] - c[None, :, :2]
    far = np.hypot(d[..., 0], d[..., 1]) + 0.01
    push = np.clip(1 - far / (2.3 * long), 0, 1) / far  # they shove each other apart, and drift home
    c[:, :2] += dt * (22 * (d * push[..., None]).sum(1) * long / 6 - 0.25 * c[:, :2])
    c[:, 2] += dt * 0.6 * np.sin(0.5 * m['clock/mid'] + 7 * c[:, 0] / N + np.arange(len(c)))
    away = np.hypot(c[:, 0], c[:, 1]) + 0.01
    c[:, :2] *= np.minimum(1, 0.46 * N / away)[:, None]
    own['c'] = c
    g = min(1.0, own['since'] / _beat(m)) * c[:, 3]
    light = 1 - c[:, 4]
    a = np.linspace(0, 2 * math.pi, 44, dtype=np.float32)[None, :]
    ca, sa = np.cos(a), np.sin(a)
    u = np.sign(ca) * np.abs(ca) ** 0.55 * (long * (1 + 0.95 * g))[:, None]
    v = np.sign(sa) * np.abs(sa) ** 0.55 * wide * (1 - 0.7 * (g * g)[:, None] * np.exp(-(ca * 2.2) ** 2))
    co, si = np.cos(c[:, 2])[:, None], np.sin(c[:, 2])[:, None]
    x, y = N / 2 + c[:, :1] + u * co - v * si, N / 2 + c[:, 1:2] + u * si + v * co
    buf = np.zeros((N, N), np.float32)
    _plot(buf, x, y, np.broadcast_to((0.75 * light)[:, None], x.shape))
    core = np.zeros((N, N), np.float32)  # the chromosome, in two once it is about to part
    off = (long * 0.55 * g)[:, None] * np.array([-1, 1], np.float32)
    px, py = N / 2 + c[:, :1] + off * co, N / 2 + c[:, 1:2] + off * si
    _bio_dots(core, px, py, 1.5, np.broadcast_to((0.7 * light)[:, None], px.shape))
    _shade(img, buf, hot, other)
    img += np.clip(core, 0, 1)[..., None] * other


@gen('bio_dna', 'mysterious', 'focused', 'euphoric')
def _bio_dna(img, m, dt, size, hot, other):
    # turns with the mids; each rung is a note, lit as far as it sounds, and the key's own rung is the strongest
    c = _chroma()
    root = int(_v('key/root', -1))
    tilt = 0.42 + 0.14 * math.sin(0.2 * m['clock/mid'])
    co, si = math.cos(tilt), math.sin(tilt)
    amp, turn, ph = 0.2 * N * size, 2 * math.pi / (0.62 * N * size), 1.6 * m['clock/mid']

    def place(s, o):
        return N / 2 + s * si + o * co, N / 2 + s * co - o * si

    s = np.linspace(-0.8, 0.8, 300, dtype=np.float32) * N
    wave, deep = amp * np.sin(turn * s + ph), np.cos(turn * s + ph)
    a, b = np.zeros((N, N), np.float32), np.zeros((N, N), np.float32)
    j = np.arange(-13, 13)
    rs = j.astype(np.float32) * 0.062 * N * size
    ro = amp * np.sin(turn * rs + ph)
    note = j % 12
    w = 0.1 + 0.9 * c[note] ** 2
    if root >= 0:
        w = np.where(note == root, np.maximum(w, 0.8), w)
    t = np.linspace(0, 1, 26, dtype=np.float32)[:, None]
    xa, ya = place(rs, ro * t)
    xb, yb = place(rs, -ro * t)
    _plot(a, xa, ya, np.broadcast_to(w, xa.shape).astype(np.float32))
    _plot(b, xb, yb, np.broadcast_to(w, xb.shape).astype(np.float32))
    for sign, buf in ((1, a), (-1, b)):
        x, y = place(s, sign * wave)
        _bio_dots(buf, x, y, 1.0 + 0.7 * sign * deep * size ** 0.5 + 0.4, 0.26 + 0.2 * sign * deep)
    img += np.clip(a, 0, 1)[..., None] * hot + np.clip(b, 0, 1)[..., None] * other


def _bio_neurons_build(rng):
    # cells spread over the frame, an axon wandering from each to its nearest ones, and each cell's short dendrites
    g = rng.permutation(16)[:13]
    at = np.stack([(g % 4 + 0.5) / 4, (g // 4 + 0.5) / 4], 1) * N * 0.92 + 0.04 * N + rng.uniform(-8, 8, (13, 2))
    d = np.hypot(*(at[:, None] - at[None]).transpose(2, 0, 1)) + np.eye(13) * 1e4
    edges = sorted(set(tuple(sorted((int(i), int(j)))) for i in range(13) for j in np.argsort(d[i])[:3]))
    t = np.linspace(0, 1, 26)[:, None]
    ax = []
    for i, j in edges:
        v = at[j] - at[i]
        side = np.array([-v[1], v[0]])
        ax.append(at[i] + v * t + side * (np.sin(math.pi * t) * rng.uniform(-0.22, 0.22)
                                          + 0.04 * np.sin(rng.uniform(5, 11) * t + rng.uniform(0, 6))))
    a = rng.uniform(0, 2 * math.pi, (13, 5))
    r = rng.uniform(5, 9, (13, 5))
    s = np.linspace(0, 1, 7)[:, None, None]
    dx = at[:, 0, None] + r * s * np.cos(a + 0.6 * s * s)
    dy = at[:, 1, None] + r * s * np.sin(a + 0.6 * s * s)
    return dict(at=at.astype(np.float32), edges=edges, ax=np.array(ax, np.float32), dx=dx.astype(np.float32), dy=dy.astype(np.float32),
                glow=np.zeros(13, np.float32), rest=np.zeros(13, np.float32), sp=np.zeros((0, 3), np.float32))


@gen('bio_neurons', 'tense', 'focused', 'mysterious', 'drop')
def _bio_neurons(img, m, dt, size, hot, other):
    # a spike takes half a beat down an axon, so the cells answer on the half beats; hats and snares decide how far it spreads
    own, rng = S['own'], S['rng']
    if 'ax' not in own:
        own.update(_bio_neurons_build(rng))
    ax, edges = own['ax'], own['edges']
    act = max(_recent('hats', m['hit/hat'], m, dt), _recent('snares', m['hit/snare'], m, dt), 0.2 + 0.4 * m['high'])

    def fire(cell, came=-1):
        if own['rest'][cell] > 0:
            return []
        own['glow'][cell], own['rest'][cell] = 1.0, 1.4 * _beat(m)
        out = [[e, 1 if a == cell else -1, 0.0] for e, (a, b) in enumerate(edges) if cell in (a, b) and e != came]
        return [o for o in out if rng.random() < 0.3 + 0.6 * act]

    new = []
    if _tick('fire', m, 2):
        for cell in rng.integers(0, 13, 1 + int(2 * act)):
            new += fire(int(cell))
    sp = own['sp']
    sp[:, 2] += dt * 2 / _beat(m)
    for e, way, _ in sp[sp[:, 2] >= 1]:
        e = int(e)
        new += fire(edges[e][1 if way > 0 else 0], e)
    sp = sp[sp[:, 2] < 1]
    if new:
        sp = np.concatenate([sp, np.array(new, np.float32)])[-60:]
    own['sp'] = sp
    own['glow'] *= math.exp(-dt / 0.14)
    own['rest'] = np.maximum(0, own['rest'] - dt)
    fibre = np.zeros((N, N), np.float32)
    _plot(fibre, ax[..., 0], ax[..., 1], 0.34)
    _plot(fibre, own['dx'], own['dy'], 0.3)
    img += np.clip(fibre, 0, 1)[..., None] * other
    buf = np.zeros((N, N), np.float32)
    at = own['at']
    _bio_dots(buf, at[:, 0], at[:, 1], (2.2 + 2.2 * own['glow']) * size ** 0.5, 0.45 + 0.55 * own['glow'])
    if len(sp):
        e = sp[:, 0].astype(int)
        back = np.array([0, 0.03, 0.06, 0.09, 0.12], np.float32)[:, None]
        t = np.clip(np.where(sp[:, 1] > 0, sp[:, 2], 1 - sp[:, 2]) - back * sp[:, 1], 0, 1)
        i = (t * (ax.shape[1] - 1)).astype(int)
        w = np.broadcast_to(1 - back * 6, t.shape).astype(np.float32)
        _bio_dots(buf, ax[e, i, 0], ax[e, i, 1], 1.3 * size ** 0.5, w)
    _shade(img, buf, hot, other)


def _bio_heart_vessels(rng):
    # a tree of vessels going out from the muscle: rows of points, with how far along the tree each row starts
    rows, starts, p = [], [], 22
    for a in np.linspace(0, 2 * math.pi, 7, endpoint=False) + rng.uniform(-0.3, 0.3, 7):
        h = a + np.cumsum(rng.normal(0, 0.16, p))
        at = 0.2 * N * np.array([math.cos(a), math.sin(a)]) + np.cumsum(np.stack([np.cos(h), np.sin(h)], 1) * 2.1, 0)
        rows.append(at)
        starts.append(0.0)
        k = int(rng.integers(8, 13))  # a branch off it
        h2 = h[k] + rng.choice([-1, 1]) * rng.uniform(0.5, 0.9) + np.cumsum(rng.normal(0, 0.16, p))
        rows.append(at[k] + np.cumsum(np.stack([np.cos(h2), np.sin(h2)], 1) * 1.5, 0))
        starts.append(k / (p - 1.0))
    return np.array(rows, np.float32), np.array(starts, np.float32)


@gen('bio_heart', 'aggressive', 'tense', 'drop')
def _bio_heart(img, m, dt, size, hot, other):
    # squeezes twice in a beat, on it and a third later, as hard as the kicks lately; each squeeze runs out along the vessels
    own, rng = S['own'], S['rng']
    if 'v' not in own:
        own['v'], own['s'] = _bio_heart_vessels(rng)
    p = _beats(m, 0.65) % 1.0
    force = max(0.45, _recent('kicks', max(m['hit/kick'], 0.8 * m['hit/bass']), m, dt))
    lub = math.exp(-(min(p, 1 - p) / 0.07) ** 2)
    dub = 0.6 * math.exp(-((p - 0.32) / 0.07) ** 2)
    squeeze = force * (lub + dub)
    v = own['v'] * size
    u = own['s'][:, None] + np.linspace(0, 1, v.shape[1], dtype=np.float32)
    wave = np.exp(-((u - 1.3 * p) / 0.14) ** 2) + 0.6 * np.exp(-((u - 1.3 * (p - 0.32)) / 0.14) ** 2)
    wave = force * wave
    fade = 1 / (1 + 0.8 * u)
    buf = np.zeros((N, N), np.float32)
    _bio_dots(buf, N / 2 + v[..., 0], N / 2 + v[..., 1], (0.5 + 1.8 * wave) * fade * size ** 0.5, (0.24 + 0.5 * wave) * fade)
    k = 1 - 0.2 * squeeze
    big = 0.2 * N * size * k
    x, y = (_X - N / 2) / big, (_Y - N / 2) / big
    co, si = math.cos(0.35), math.sin(0.35)
    f = np.hypot(co * x + si * y + 0.05, (co * y - si * x + 0.12) / 1.25)  # the chamber, and two smaller ones over it
    f = np.minimum(f, np.hypot((x + 0.55) / 0.6, (y - 0.82) / 0.55))
    f = np.minimum(f, np.hypot((x - 0.5) / 0.55, (y - 0.9) / 0.5))
    wall = np.clip(1 - np.abs(f - 1) * big / 1.6, 0, 1)
    fibres = 0.5 + 0.5 * np.sin(16 * (x * 0.8 + y * 0.6) + 5 * f)
    body = (f < 1) * (0.14 + 0.5 * squeeze * (1 - f).clip(0, 1) + 0.16 * fibres)
    _shade(img, buf + wall, hot, other)
    img += body[..., None] * (other * (1 - 0.6 * squeeze) + hot * 0.6 * squeeze)


@gen('bio_blood', 'aggressive', 'euphoric', 'drop', whole=True)
def _bio_blood(img, m, dt, size, hot, other):
    # the stream goes by the bass clock, fastest down the middle; the walls give with the bass; some cells tumble
    own, rng = S['own'], S['rng']
    k = 30
    cb = m['clock/bass']
    if 'x' not in own:
        own.update(x=rng.uniform(-10, N + 10, k).astype(np.float32), y=rng.uniform(-0.92, 0.92, k).astype(np.float32),
                   spin=rng.uniform(0, 6, k).astype(np.float32), rate=rng.uniform(0.6, 2.2, k).astype(np.float32), c=cb)
    step = max(0.0, cb - own['c'])
    own['c'] = cb
    bass = m['drive/bass']
    wide = N * 0.37 * (0.84 + 0.3 * bass)
    y = own['y']
    own['x'] = x = (own['x'] + step * N * 0.75 * (1 - 0.7 * y * y) + 12) % (N + 24) - 12
    own['spin'] = own['spin'] + step * own['rate']
    cy = N / 2 + y * wide * 0.9 + 3 * np.sin(0.05 * x + 0.8 * cb)
    big = 7.2 * size ** 0.5
    a = np.linspace(0, 2 * math.pi, 34, dtype=np.float32)[:, None, None]
    face = 0.34 + 0.66 * np.abs(np.cos(own['spin']))  # a disc seen more or less edge on
    tip = 0.7 * own['spin']
    rim = np.array([1.0, 0.82, 0.62, 0.42], np.float32)[None, :, None]
    u, v = big * rim * face * np.cos(a), big * rim * np.sin(a)
    px = x + u * np.cos(tip) - v * np.sin(tip)
    py = cy + u * np.sin(tip) + v * np.cos(tip)
    w = np.array([0.8, 0.4, 0.2, 0.1], np.float32)[None, :, None] * np.ones_like(px)
    buf = np.zeros((N, N), np.float32)
    _plot(buf, px, py, w)
    _shade(img, buf, hot, other)
    dy = np.abs(_Y - N / 2 - 3 * np.sin(0.05 * _X + 0.8 * cb))
    wall = np.clip(1 - np.abs(dy - wide) / 2, 0, 1) + (dy > wide) * 0.18 * (0.5 + 0.5 * np.sin(0.7 * _X - 2 * dy))
    img += wall[..., None] * other


@gen('bio_jelly', 'calm', 'dreamy', 'melancholic')
def _bio_jelly(img, m, dt, size, hot, other):
    # the bell closes once in two beats and rises, then sinks open, as big as the level; slow against everything else here
    own = S['own']
    if 'y' not in own:
        own.update(y=0.6 * N, v=0.0, lv=m['level'])
    p = (_beats(m, 0.75) / 2) % 1.0
    close = min(1.0, p / 0.1) * (1 - p) ** 3
    own['lv'] += (m['level'] - own['lv']) * min(1.0, 2 * dt)
    own['v'] += dt * (close * N * 1.1 - 0.5 * N * 0.16 - 1.5 * own['v'] - 1.6 * (own['y'] - 0.62 * N))
    own['y'] += dt * own['v']
    c = m['clock/mid']
    cx, cy = N / 2 + 0.16 * N * math.sin(0.27 * c), own['y']
    w = 0.25 * N * size * (0.72 + 0.4 * own['lv']) * (1 - 0.3 * close)
    h = 0.21 * N * size * (0.76 + 0.4 * own['lv']) * (1 + 0.22 * close)
    a = np.linspace(0, math.pi, 90, dtype=np.float32)
    x = cx + w * np.cos(a) * (1 + 0.03 * np.sin(9 * a + 2 * c))
    y = cy + h * np.maximum(np.sin(a), 0) ** 0.75
    buf = np.zeros((N, N), np.float32)
    _bio_thread(buf, x, y, 0.7, 2)
    ru = np.linspace(-1, 1, 56, dtype=np.float32)  # the rim, ruffled
    _plot(buf, cx + w * ru, cy + 0.12 * h * (1 - ru * ru) + 1.2 * np.sin(14 * ru + 3 * c), 0.75)
    f = ((_X - cx) / w) ** 2 + ((_Y - cy) / h) ** 2
    inside = (f < 1) * (_Y > cy)
    soft = inside * (0.1 + 0.2 * f)
    for b in (0.2, 0.42, 0.58, 0.8):  # the canals, from the crown to the rim
        t = np.linspace(0, 1, 30, dtype=np.float32)
        _plot(buf, cx + w * (2 * b - 1) * t, cy + h * (1 - t ** 2 * (1 - 0.1)) * (1 - 0.25 * abs(2 * b - 1) * t), 0.26)
    s = np.linspace(0, 1, 36, dtype=np.float32)[:, None]
    u = np.linspace(-0.96, 0.96, 15, dtype=np.float32)
    drag = 0.46 * N * size * (1 + 0.3 * close)
    tx = cx + w * u * (1 - 0.35 * s) + (2 + 6 * s) * np.sin(6 * s - 2.2 * c + 3.5 * u)
    ty = cy - drag * s * (0.72 + 0.28 * np.cos(2.5 * u))
    tent = np.zeros((N, N), np.float32)
    _plot(tent, tx, ty, np.broadcast_to(0.68 * (1 - s) + 0.06, tx.shape).astype(np.float32))
    v = np.linspace(-0.3, 0.3, 3, dtype=np.float32)  # the thick arms in the middle
    ax = cx + w * v + (3 + 4 * s) * np.sin(4 * s - 1.5 * c + 5 * v)
    _bio_dots(tent, ax, cy - 0.55 * drag * s * np.ones_like(ax), 1.6 * (1 - s) * np.ones_like(ax) * size ** 0.5 + 0.3, 0.17)
    _shade(img, buf, hot, other)
    img += (soft + np.clip(tent, 0, 1))[..., None] * other


@gen('bio_diatom', 'calm', 'mysterious', 'focused')
def _bio_diatom(img, m, dt, size, hot, other):
    # the key builds the shell: from its root how many arms, from minor or major how sharp; on a change it closes and opens anew
    own = S['own']
    root, major = max(0, int(_v('key/root', -1))), _v('key/major', 0.0) > 0.5
    if own.get('root') != root or own.get('major') != major:
        fresh = 'root' not in own
        own.update(root=root, major=major, since=9.0 if fresh else 0.0, star=0.03 if major else 0.42)
    own['since'] += dt
    own['now'] = own.get('now', own['star']) + (own['star'] - own.get('now', own['star'])) * min(1.0, 2.5 * dt)
    n = 3 + root % 6
    x, y = _X - N / 2, _Y - N / 2
    r = np.hypot(x, y)
    a = np.arctan2(y, x) - 0.13 * m['clock/mid']
    big = 0.31 * N * size * (0.86 + 0.16 * m['level']) * (1 - 0.4 * math.exp(-3 * own['since']))
    lobe = np.abs(np.cos(n * a / 2))
    u = r / (big * (1 + own['now'] * lobe ** 3 * 1.9))
    rim = np.clip(1 - np.abs(u - 1) * big / 1.6, 0, 1) + 0.55 * np.clip(1 - np.abs(u - 0.9) * big / 1.1, 0, 1)
    within = (u < 0.88) & (u > 0.2)
    ribs = np.clip(1.1 - np.abs(np.sin(n * a)) * r / n / 1.1, 0, 1) * within
    pores = np.clip(3 * np.sin(u * 44) * np.sin(3 * n * a) - 1.5, 0, 1) * within
    hub = np.clip(1 - np.abs(u - 0.2) * big / 1.3, 0, 1) + (u < 0.1) * 0.7
    _shade(img, rim + ribs * 0.75 + hub, hot, other)
    img += (pores * 0.7)[..., None] * other


@gen('bio_iris', 'mysterious', 'tense', 'melancholic')
def _bio_iris(img, m, dt, size, hot, other):
    # the pupil follows the level, the fibres bunch up as it opens; a small jump of the gaze every bar; the top end shimmers
    own, rng = S['own'], S['rng']
    if 'fib' not in own:
        f = rng.random(512)
        f = 0.6 * f + 0.4 * np.roll(f, 1) * rng.random(512)
        soft = np.convolve(np.tile(rng.random(512), 2), np.ones(24) / 24, 'same')[256:768]
        own.update(fib=f.astype(np.float32), soft=soft.astype(np.float32), open=m['level'], at=np.zeros(2), go=np.zeros(2))
    if _tick('gaze', m, 0.25):
        own['go'] = rng.uniform(-0.05, 0.05, 2) * N
    own['at'] = own['at'] + (own['go'] - own['at']) * min(1.0, 14 * dt)
    own['open'] += (m['level'] - own['open']) * min(1.0, 7 * dt)
    x, y = _X - N / 2 - own['at'][0], _Y - N / 2 - own['at'][1]
    r = np.hypot(x, y)
    i = ((np.arctan2(y, x) / (2 * math.pi) + 0.5) * 511).astype(np.int32)
    big = min(0.42 * size, 0.47) * N
    hole = big * (0.12 + 0.68 * own['open'] ** 1.5)
    v = np.clip((r - hole) / (big - hole), 0, 1)
    ring = (r > hole) & (r < big)
    shim = int(10 * m['clock/treb'] * (0.5 + m['high']))
    fibre = 0.6 * own['fib'][(i + (v * 9).astype(np.int32)) % 512] + 0.4 * own['fib'][(i - shim) % 512]
    light = ring * (0.2 + 0.8 * fibre) * (1 - 0.5 * v)
    collar = ring * np.clip(1 - np.abs(v - 0.2 - 0.3 * own['soft'][i]) * (big - hole) / 2.0, 0, 1)
    edge = np.clip(1 - np.abs(r - hole) / 1.4, 0, 1) + 0.7 * np.clip(1 - np.abs(r - big) / 1.7, 0, 1)
    img += (light * (1 - v) + collar * 0.7 + edge)[..., None] * hot + (light * (0.25 + v))[..., None] * other
    shine = np.hypot(x + hole * 0.5, y - hole * 0.55)  # the window it reflects, inside the pupil
    img += (np.clip(1 - shine / (0.1 * hole + 1.6), 0, 1) * 0.8)[..., None] * other


@gen('bio_plankton', 'dreamy', 'euphoric', 'happy', 'drop', whole=True)
def _bio_plankton(img, m, dt, size, hot, other):
    # each speck glows on a clock of its own; the surer the beat, the harder it is pulled in, until the glow sweeps the frame once a beat
    own, rng = S['own'], S['rng']
    k = 300
    if 'p' not in own:
        own.update(p=rng.uniform(0, N, (k, 2)).astype(np.float32), th=rng.random(k).astype(np.float32),
                   rate=rng.normal(1, 0.14, k).astype(np.float32), kind=rng.integers(0, 3, k))
    p, th = own['p'], own['th']
    if _locked(m):
        want = m['beat/phase'] % 1.0 - 0.6 * p[:, 0] / N
        pull = 5 * m['beat/conf'] * np.sin(2 * math.pi * (want - th))
        hz = 1 / _beat(m)
    else:  # nothing to follow: they drift towards each other's rhythm, slowly and never quite
        z = np.exp(2j * math.pi * th).mean()
        pull = 0.25 * np.sin(np.angle(z) - 2 * math.pi * th)
        hz = 0.35 + 0.5 * m['level']
    own['th'] = th = (th + dt * (hz * own['rate'] + pull)) % 1.0
    ct = m['clock/treb']
    ang = 2.4 * np.sin(p[:, 0] * 0.05 + 0.2 * ct) + 2.4 * np.cos(p[:, 1] * 0.06 - 0.15 * ct)
    speed = N * (0.03 + 0.1 * m['drive/treb'])
    p[:, 0] = (p[:, 0] + dt * speed * np.cos(ang)) % N
    p[:, 1] = (p[:, 1] + dt * speed * np.sin(ang)) % N
    glow = np.exp(-th * 6.5)
    dim, buf = np.zeros((N, N), np.float32), np.zeros((N, N), np.float32)
    x, y, kind = p[:, 0], p[:, 1], own['kind']
    _plot(dim, x, y, 0.55)  # three kinds of creature: a dot, a dash, a cross
    two = kind == 1
    _plot(dim, x[two] + 1, y[two], 0.45)
    _plot(dim, x[two] + 2, y[two], 0.3)
    three = kind == 2
    for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        _plot(dim, x[three] + a, y[three] + b, 0.35)
    _bio_dots(buf, x, y, (0.3 + 2.7 * glow) * size ** 0.5, glow * 1.2)
    img += np.clip(dim, 0, 1)[..., None] * other
    _shade(img, buf, hot, other)


@gen('bio_skin', 'mysterious', 'tense', 'dreamy', whole=True)
def _bio_skin(img, m, dt, size, hot, other):
    # two chemicals on a coat: spots while the top end is low, a maze as it rises; every two beats a bite is taken and grows back
    own, rng = S['own'], S['rng']
    g = N // 2
    if 'u' not in own:
        u, v = np.ones((g, g), np.float32), np.zeros((g, g), np.float32)
        for x, y in rng.integers(4, g - 4, (26, 2)):
            u[y - 3:y + 3, x - 3:x + 3] = 0.5
            v[y - 3:y + 3, x - 3:x + 3] = 0.25
        own.update(u=u, v=v, h=m['high'])
    u, v = own['u'], own['v']
    own['h'] += (m['high'] - own['h']) * min(1.0, 0.8 * dt)
    h = float(np.clip((own['h'] - 0.2) / 0.5, 0, 1))
    feed, kill = 0.0367 - 0.0077 * h, 0.0649 - 0.0079 * h
    if _tick('bite', m, 0.5):
        x, y = rng.integers(8, g - 8, 2)
        d = (np.hypot(_X[:g, :g] / (N / 2 * 2 / g) - x, _Y[:g, :g] / (N / 2 * 2 / g) - y) < 6 * size)
        d = np.hypot(np.arange(g)[None, :] - x, np.arange(g)[:, None] - y) < 6 * size
        v[d], u[d] = 0.0, 1.0
        x, y = rng.integers(5, g - 5, 2)
        v[y - 2:y + 2, x - 2:x + 2], u[y - 2:y + 2, x - 2:x + 2] = 0.25, 0.5
    for _ in range(int(np.clip(dt * 300, 1, 12))):
        lu = np.roll(u, 1, 0) + np.roll(u, -1, 0) + np.roll(u, 1, 1) + np.roll(u, -1, 1) - 4 * u
        lv = np.roll(v, 1, 0) + np.roll(v, -1, 0) + np.roll(v, 1, 1) + np.roll(v, -1, 1) - 4 * v
        uvv = u * v * v
        u += 0.21 * lu - uvv + feed * (1 - u)
        v += 0.105 * lv + uvv - (feed + kill) * v
    buf = np.zeros((N, N), np.float32)
    buf[:2 * g, :2 * g] = np.clip(v * 5 - 0.5, 0, 1).repeat(2, 0).repeat(2, 1)
    _shade(img, buf, hot, other)


@gen('bio_seeds', 'happy', 'euphoric', 'dreamy', whole=True)
def _bio_seeds(img, m, dt, size, hot, other):
    # sixteen seeds to the beat out of the middle, each turned by the golden angle; every thirteenth makes a spiral, one to each note
    c = _chroma()
    root = int(_v('key/root', -1))
    head = 16 * _beats(m, 1.3)
    k = 880
    i = math.floor(head) - np.arange(k)
    age = (head - i).astype(np.float32)
    r = 3.05 * size * np.sqrt(age + 0.5)
    a = (i * 2.399963229728653) % (2 * math.pi)
    x = (N / 2 + r * np.cos(a)).astype(np.float32)
    y = (N / 2 + r * np.sin(a)).astype(np.float32)
    notes = np.append(c, c[root] if root >= 0 else 0.3)
    lit = notes[i % 13] ** 2
    buf = np.zeros((N, N), np.float32)
    grown = np.minimum(1.0, age / 90)
    _bio_dots(buf, x, y, (0.35 + 0.75 * grown) * (0.75 + 0.5 * lit) * size ** 0.5, 0.2 + 0.8 * lit)
    _shade(img, buf, hot, other)


@gen('bio_feather', 'melancholic', 'dreamy', 'calm')
def _bio_feather(img, m, dt, size, hot, other):
    # how far each barb goes is how loud its band is, so the vane's outline is the spectrum; it sways with the mids
    b = _bands()
    k, n = 52, 12
    c, ct = m['clock/mid'], m['clock/treb']
    s = np.linspace(0, 1, k, dtype=np.float32)
    th = 1.02 + 0.2 * math.sin(0.35 * c) - 0.55 * s + 0.1 * math.sin(0.5 * c + 1)
    long = 0.84 * N * size
    x = 0.2 * N + np.cumsum(np.cos(th)) * long / k
    y = 0.08 * N + np.cumsum(np.sin(th)) * long / k
    band = np.interp(s, np.linspace(0.1, 0.95, 10), b).astype(np.float32)
    shape = np.sin(math.pi * np.clip(s * 0.92 + 0.06, 0, 1)) ** 0.6
    reach = shape * (0.24 + 0.95 * band) * 0.3 * N * size
    side = np.where(np.arange(2 * k) < k, 1.0, -1.0).astype(np.float32)
    s2, th2, r2 = np.tile(s, 2), np.tile(th, 2), np.tile(reach, 2)
    t = np.linspace(0, 1, n, dtype=np.float32)[:, None]
    down = (s2 < 0.14) * 0.5 * np.sin(9 * t + 40 * s2 + 2 * ct)  # the down by the quill is loose
    ang = th2 + side * (1.2 - 0.5 * s2) * (1 - 0.5 * t) + 0.09 * np.sin(9 * s2 + 2.2 * ct) * t + down
    bx = np.tile(x, 2) + np.cumsum(np.cos(ang), 0) * r2 / n
    by = np.tile(y, 2) + np.cumsum(np.sin(ang), 0) * r2 / n
    buf = np.zeros((N, N), np.float32)
    _bio_thread(buf, bx, by, (0.1 + 0.2 * t) * (0.5 + np.tile(band, 2)), 2)
    shaft = np.zeros((N, N), np.float32)
    _bio_thread(shaft, x, y, 0.6, 3)
    qx = 0.2 * N - np.arange(0, 12, dtype=np.float32) * math.cos(th[0])
    qy = 0.08 * N - np.arange(0, 12, dtype=np.float32) * math.sin(th[0])
    _plot(shaft, qx, qy, 1.0)
    _shade(img, buf + shaft, hot, other)
