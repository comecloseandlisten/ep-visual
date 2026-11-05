# The music itself made visible, as instruments and readouts. Each answers its own part of the music:
#   sig_halo     the bands        round a circle, caps falling back
#   sig_ladder   the chroma       twelve rungs climbing from the key's note, a rider on the loudest
#   sig_roll     the notes        a piano roll of what was heard, a column every 32nd
#   sig_seq      the melody       sixteen sliders, each takes the note heard on its step of the bar
#   sig_needles  the balance      two meters with weight, low half and high half of the spectrum
#   sig_metro    the beat         a metronome arm, the weight sliding with the tempo
#   sig_fifths   the key          the circle of fifths, turning to bring the key to the top
#   sig_clock    the bar          a dial a quarter fuller each beat, a slow hand for the phrase
#   sig_cymbal   the treble       a cymbal shimmering and rocking on its stand
#   sig_ribbon   the brightness   the spectrum's centre of gravity, rising as a ribbon
#   sig_vector   the texture      a phosphor figure in a diamond, thin when tonal, wide when noisy
#   sig_chord    the chord        a line strung through the loudest pins of a ring, old shapes fading
#   sig_comb     the harmonics    the key's overtones as teeth on a log axis
#   sig_ruler    the tempo        two rulers sliding past each other, meeting at a cursor on the beat
#   sig_lanes    the drums        four bars of kick, snare and hat as a grid
#   sig_bins     the level        beads through pegs into bins: how loud it has been
#   sig_groove   the density      a lathe cutting a turn a bar, wobbling with how much is going on
#   sig_strings  the bass         four strings, a low band each, ringing in their own harmonic
_SIG_DX, _SIG_DY = _X - N / 2, _Y - N / 2
_SIG_R = np.hypot(_SIG_DX, _SIG_DY)
_SIG_A = np.arctan2(_SIG_DY, _SIG_DX)


def _sig_pos(m):
    # where we are, in beats: by the tempo, by the mids' clock where there is none
    return m['beat/count'] + m['beat/phase'] % 1.0 if _locked(m) else 2.0 * m['clock/mid']


def _sig_bar(m):
    # where we are in the bar, 0..1
    bar = _v('bar/phase', -1.0)
    return bar % 1.0 if _locked(m) and bar >= 0 else (_sig_pos(m) / 4) % 1.0


def _sig_chroma():
    c = np.array([_v('chroma/%d' % k) for k in range(12)], np.float32)
    return c / max(float(c.max()), 1e-3)


def _sig_pen(buf, xs, ys, w=1.0):
    # a line's cells at w, however many samples land on a cell
    xs, ys, w = (a.ravel() for a in np.broadcast_arrays(xs, ys, np.asarray(w, np.float32)))
    keep = (xs >= 0) & (xs < N) & (ys >= 0) & (ys < N)
    np.maximum.at(buf, (ys[keep].astype(np.intp), xs[keep].astype(np.intp)), w[keep])


def _sig_seg(buf, x0, y0, x1, y1, w=1.0):
    # straight lines, one or an array of them
    x0, y0, x1, y1 = (np.atleast_1d(np.asarray(a, np.float32)) for a in (x0, y0, x1, y1))
    n = int(1.5 * max(float(np.abs(x1 - x0).max()), float(np.abs(y1 - y0).max()))) + 2
    t = np.linspace(0, 1, n, dtype=np.float32)[:, None]
    _sig_pen(buf, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w)


def _sig_dot(buf, xs, ys, r=1, w=1.0):
    # squares of 2r + 1 cells
    d = np.arange(-r, r + 1, dtype=np.float32)
    dy, dx = (a.ravel() for a in np.meshgrid(d, d))
    _sig_pen(buf, np.ravel(xs)[:, None] + dx, np.ravel(ys)[:, None] + dy, np.ravel(np.asarray(w, np.float32))[:, None])


def _sig_circle(buf, r, w=1.0):
    a = np.linspace(0, 2 * math.pi, int(8 * r) + 16, dtype=np.float32)
    _sig_pen(buf, N / 2 + r * np.cos(a), N / 2 + r * np.sin(a), w)


def _sig_two(img, frame, signal, hot, other):
    # the instrument in the other colour, what the music does to it in the hot one
    img += np.clip(frame, 0, 1)[..., None] * other + np.clip(signal, 0, 1)[..., None] * hot


@gen('sig_halo', 'euphoric', 'happy', 'drop')
def _sig_halo(img, m, dt, size, hot, other):
    # the spectrum round a circle, mirrored from the lows to the highs, turning with the mids; caps fall back
    own, k = S['own'], 48
    if 'cap' not in own:
        own['cap'] = np.zeros(k, np.float32)
    u = np.abs(2 * (np.arange(k, dtype=np.float32) + 0.5) / k - 1)
    reach, r0 = N * 0.27 * size, N * 0.16 * size
    h = np.interp(u * 9, np.arange(10), _bands()).astype(np.float32) ** 1.3 * reach
    own['cap'] = np.maximum(own['cap'] - dt * N * 0.3, h)
    s = ((_SIG_A - 0.12 * m['clock/mid']) / (2 * math.pi) % 1.0) * k
    i = s.astype(int) % k
    bar = (s % 1.0) < 0.66
    up = np.clip((_SIG_R - r0) / reach, 0, 1)
    body = ((_SIG_R > r0) & (_SIG_R < r0 + h[i]) & bar).astype(np.float32)
    cap = ((np.abs(_SIG_R - r0 - own['cap'][i]) < 0.9) & bar).astype(np.float32)
    ring = np.zeros((N, N), np.float32)
    _sig_circle(ring, r0 - 3, 0.6)
    _sig_two(img, ring + body * (1 - up) * 0.9, body * up * 1.3 + cap, hot, other)


@gen('sig_ladder', 'focused', 'calm', 'mysterious')
def _sig_ladder(img, m, dt, size, hot, other):
    # the twelve notes as rungs going away from the key's own note, each lit as far out as it sounds; a rider on the loudest
    own = S['own']
    root = max(0, int(_v('key/root', -1)))
    c = np.roll(_sig_chroma(), -root)
    if 'c' not in own:
        own.update(c=c, y=N / 2)
    own['c'] = c = np.maximum(c, own['c'] * math.exp(-dt / 0.25))
    t = np.arange(12, dtype=np.float32) / 11
    y = N / 2 + (-0.42 + 0.84 * (1 - (1 - t) ** 1.7)) * N * size
    half = N * (0.34 - 0.24 * t) * size
    x = N / 2 + 2.5 * t * np.sin(0.5 * m['clock/mid'] + 3 * t)  # it sways a little, more at the far end
    frame, signal = np.zeros((N, N), np.float32), np.zeros((N, N), np.float32)
    thick = (1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0)
    _sig_seg(frame, x[:-1] - half[:-1], y[:-1], x[1:] - half[1:], y[1:], 0.75)
    _sig_seg(frame, x[:-1] + half[:-1], y[:-1], x[1:] + half[1:], y[1:], 0.75)
    for k in range(12):
        for d in range(thick[k] + 1):
            _sig_seg(frame, x[k] - half[k], y[k] + d, x[k] + half[k], y[k] + d, 0.16)
            _sig_seg(signal, x[k] - half[k] * c[k], y[k] + d, x[k] + half[k] * c[k], y[k] + d, 0.25 + 0.75 * c[k])
    top = int(np.argmax(c))
    own['y'] += (float(y[top]) - own['y']) * (1 - math.exp(-dt / 0.07))
    f = (own['y'] - y[0]) / max(1.0, float(y[-1] - y[0]))
    edge = float(np.interp(own['y'], y, x - half))  # (the rider climbs the left rail)
    _sig_dot(signal, edge - 1, own['y'], 2 if f < 0.5 else 1)
    _sig_two(img, frame, signal, hot, other)


@gen('sig_roll', 'focused', 'dreamy', 'happy', whole=True)
def _sig_roll(img, m, dt, size, hot, other):
    # a piano roll going left: a row for each note, a column every 32nd, the keys at the right edge lit as they sound
    own = S['own']
    c = _sig_chroma()
    if 'notes' not in own:
        h = N / 12.0
        row = np.minimum(11, (_Y[:, 0] / h).astype(int))
        own.update(notes=np.zeros((12, N), np.float32), beats=np.zeros(N, np.float32), row=row,
                   lane=((_Y[:, 0] % h > 1.5) & (_Y[:, 0] % h < h - 1)).astype(np.float32),
                   black=np.array((0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0), np.float32)[row])
    if _tick('roll', m, 8):
        own['notes'] = np.roll(own['notes'], -1, 1)
        own['beats'] = np.roll(own['beats'], -1)
        own['notes'][:, -1] = np.where(c > 0.5, c, 0)
        own['beats'][-1] = 0
    if _tick('beat', m):
        own['beats'][-1] = 1
    notes = own['notes']
    head = (notes > 0) & (np.roll(notes, 1, 1) == 0)  # where a note starts
    body = notes * 0.75 + head * 0.6
    row, lane = own['row'], own['lane'][:, None]
    root = int(_v('key/root', -1))
    frame = own['black'][:, None] * 0.09 + own['beats'][None, :] * 0.16 * (1 - lane)
    if root >= 0:
        frame = frame + (row == root)[:, None] * 0.1
    signal = body[row] * lane
    signal[:, -6:] = (c[row] ** 2 * own['lane'])[:, None]
    _sig_two(img, frame + signal * 0.35, signal, hot, other)


@gen('sig_seq', 'focused', 'tense', 'happy', whole=True)
def _sig_seq(img, m, dt, size, hot, other):
    # a sixteen-step sequencer going round the bar: each slider takes the note heard on its step, the line runs through them
    own, rng = S['own'], S['rng']
    if 'to' not in own:
        own.update(to=np.full(16, 0.5, np.float32), at=np.full(16, 0.5, np.float32), step=0, lamp=np.zeros(16, np.float32))
    if _tick('step', m, 4):
        own['step'] = int(_sig_bar(m) * 16) % 16 if _locked(m) else (own['step'] + 1) % 16
        note = int(np.argmax(_sig_chroma() + rng.uniform(0, 0.08, 12)))  # (one of the loudest)
        own['to'][own['step']] = (((note - max(0, int(_v('key/root', -1)))) % 12) + 0.5) / 12
        own['lamp'][own['step']] = 1.0
    own['at'] += (own['to'] - own['at']) * (1 - math.exp(-dt / 0.05))
    own['lamp'] *= math.exp(-dt / 0.3)
    step, at, lamp = own['step'], own['at'], own['lamp']
    s = min(size, 1.1)
    pitch = 7.0 * s
    x0 = N / 2 - 8 * pitch
    lo, hi = N / 2 - 0.3 * N * s, N / 2 + 0.36 * N * s
    px = _X[0] - x0
    col = np.clip((px / pitch).astype(int), 0, 15)
    off = px - col * pitch
    inside = (px >= 0) & (px < 16 * pitch) & (off < pitch - 1.5)
    y = lo + at * (hi - lo)
    track = (np.abs(off - (pitch - 1.5) / 2) < 0.6) & inside
    span = (_Y >= lo) & (_Y <= hi)
    knob = (np.abs(_Y - y[col][None, :]) < 2.1) & inside[None, :]
    here = (col == step) & inside
    frame = span * track[None, :] * 0.34 + knob * 0.5
    signal = knob * here[None, :] + span * (track & here)[None, :] * 0.8
    foot = (_Y >= lo - 12 * s) & (_Y < lo - 7 * s)  # the lamps, the first of each beat stronger
    frame = frame + foot * inside[None, :] * np.where(col % 4 == 0, 0.34, 0.14)[None, :]
    signal = signal + foot * inside[None, :] * lamp[col][None, :]
    line = np.zeros((N, N), np.float32)
    xc = x0 + (np.arange(16, dtype=np.float32) + 0.5) * pitch - 0.75
    _sig_seg(line, xc[:-1], y[:-1], xc[1:], y[1:], 0.45)
    _sig_two(img, frame, signal + line, hot, other)


@gen('sig_needles', 'melancholic', 'calm', 'focused')
def _sig_needles(img, m, dt, size, hot, other):
    # two meters, the low half of the spectrum and the high half: needles with weight, swinging past and settling
    own = S['own']
    if 'x' not in own:
        own.update(x=np.zeros(2, np.float32), v=np.zeros(2, np.float32))
    b = _bands()
    want = np.clip(np.array([b[:5].mean(), b[5:].mean()], np.float32) * (0.7 + 1.1 * m['level']), 0, 1)
    own['v'] += dt * (110 * (want - own['x']) - 11 * own['v'])
    own['x'] = np.clip(own['x'] + dt * own['v'], -0.02, 1.05)
    frame, signal = np.zeros((N, N), np.float32), np.zeros((N, N), np.float32)
    hw, hh = N * 0.215 * size, N * 0.19 * size
    y0, y1 = N / 2 - hh, N / 2 + hh
    ra = 2 * hh * 1.02
    for i, sign in enumerate((-1, 1)):
        cx = N / 2 + sign * (hw + 2)
        py = y0 - 0.28 * hh
        _sig_seg(frame, (cx - hw, cx + hw, cx - hw, cx - hw), (y0, y0, y1, y0), (cx + hw, cx + hw, cx + hw, cx - hw), (y0, y1, y1, y1), 0.55)
        a = np.linspace(-0.72, 0.72, 90, dtype=np.float32)
        _sig_pen(frame, cx + ra * np.sin(a[:62]), py + ra * np.cos(a[:62]), 0.8)
        for d in (0, -1):  # the red end, thicker
            _sig_pen(signal, cx + (ra + d) * np.sin(a[62:]), py + (ra + d) * np.cos(a[62:]), 0.9)
        k = np.linspace(-0.72, 0.72, 9, dtype=np.float32)
        l = np.where(np.arange(9) % 2, 2.5, 4.5).astype(np.float32)
        _sig_seg(frame, cx + ra * np.sin(k), py + ra * np.cos(k), cx + (ra + l) * np.sin(k), py + (ra + l) * np.cos(k), 0.8)
        angle = (float(own['x'][i]) - 0.5) * 1.44
        s, c = math.sin(angle), math.cos(angle)
        r0 = (y0 + 2 - py) / max(c, 0.3)
        _sig_seg(signal, cx + r0 * s, py + r0 * c, cx + (ra + 3) * s, py + (ra + 3) * c, 1.0)
        _sig_dot(frame, cx, y0 + 2, 2, 0.7)
        if own['x'][i] > 0.8:  # the peak lamp
            _sig_dot(signal, cx + hw - 5, y1 - 5, 1, 1.0)
    _sig_two(img, frame, signal, hot, other)


@gen('sig_metro', 'calm', 'melancholic', 'tense')
def _sig_metro(img, m, dt, size, hot, other):
    # a metronome: the arm reaches an end on every beat, leaving a wake; its weight slides down the faster the tempo
    _trail(dt, 0.14)
    pos = _sig_pos(m)
    s = size
    px, py = N / 2, N / 2 - 0.3 * N * s
    length = 0.62 * N * s
    a = 0.42 * math.cos(math.pi * pos)
    sa, ca = math.sin(a), math.cos(a)
    _sig_seg(S['trail'], px, py, px + length * sa, py + length * ca, 0.55)
    frame, signal = np.zeros((N, N), np.float32), np.zeros((N, N), np.float32)
    bw, tw, top = 0.33 * N * s, 0.09 * N * s, py + 0.72 * N * s  # the housing
    yb = py - 0.07 * N * s
    _sig_seg(frame, (px - bw, px + bw, px - bw, px + tw), (yb, yb, yb, top), (px + bw, px + bw - 0, px - tw, px + bw),
             (yb, yb, top, yb), 0.7)
    _sig_seg(frame, px - tw, top, px + tw, top, 0.7)
    k = np.linspace(-0.42, 0.42, 9, dtype=np.float32)  # its scale, behind the arm
    r = 0.42 * N * s
    _sig_seg(frame, px + r * np.sin(k), py + r * np.cos(k), px + (r + 3 + 2 * (np.arange(9) % 2 == 0)) * np.sin(k),
             py + (r + 3 + 2 * (np.arange(9) % 2 == 0)) * np.cos(k), 0.55)
    _sig_seg(signal, px, py, px + length * sa, py + length * ca, 1.0)
    bpm = m['bpm'] if m['bpm'] > 0 else 100.0
    w = (0.92 - 0.55 * min(1.0, max(0.0, (bpm - 60) / 120))) * length
    _sig_seg(signal, px + w * sa - 4 * ca, py + w * ca + 4 * sa, px + w * sa + 4 * ca, py + w * ca - 4 * sa, 1.0)
    _sig_seg(signal, px + (w + 1.5) * sa - 3 * ca, py + (w + 1.5) * ca + 3 * sa, px + (w + 1.5) * sa + 3 * ca,
             py + (w + 1.5) * ca - 3 * sa, 1.0)
    click = math.exp(-5 * (pos % 1.0))  # a lamp at the end it just reached
    side = 1 if int(pos) % 2 == 0 else -1
    _sig_dot(signal, px + side * 0.22 * N * s, yb + 5, 2, click)
    _sig_dot(frame, (px - 0.22 * N * s, px + 0.22 * N * s), (yb + 5, yb + 5), 2, 0.25)
    _sig_two(img, frame + 0.45 * S['trail'], signal + S['trail'] * 0.5, hot, other)


@gen('sig_fifths', 'mysterious', 'dreamy', 'melancholic')
def _sig_fifths(img, m, dt, size, hot, other):
    # the circle of fifths: a wedge a note, as long as it sounds; the key's seven an arc inside; the wheel brings the key to
    # the top, a full centre for major, a ring for minor
    own = S['own']
    root = int(_v('key/root', -1))
    major = _v('key/major') > 0.5
    c = _sig_chroma()[(np.arange(12) * 7) % 12]  # position i holds the note i fifths up
    if 'c' not in own:
        own.update(c=c, turn=0.0)
    own['c'] = c = own['c'] + (c - own['c']) * (1 - math.exp(-dt / 0.08))
    at = (root * 7) % 12 if root >= 0 else 0
    d = (at * math.pi / 6 - own['turn'] + math.pi) % (2 * math.pi) - math.pi
    own['turn'] += d * (1 - math.exp(-dt / 0.35))
    u = (math.pi / 2 - _SIG_A + own['turn']) / (math.pi / 6) + 0.5
    i = u.astype(int) % 12
    i = np.floor(u).astype(int) % 12
    f = u - np.floor(u)
    gap = (f > 0.07) & (f < 0.93)
    r0 = N * 0.27 * size
    wedge = (_SIG_R > r0) & (_SIG_R < r0 + N * (0.05 + 0.15 * c[i]) * size) & gap
    frame = wedge * (0.25 + 0.5 * c[i])
    signal = wedge * np.maximum(0, c[i] - 0.5) * 1.6
    if root >= 0:
        signal = signal + wedge * (i == at)
        centre = at if major else at - 3
        arc = (((i - centre + 1) % 12) < 7) & gap & (_SIG_R > N * 0.2 * size) & (_SIG_R < N * 0.24 * size)
        frame = frame + arc * 0.75
        hub = _SIG_R < N * 0.08 * size if major else np.abs(_SIG_R - N * 0.08 * size) < 1.2
        signal = signal + hub * 0.8
    pin = np.zeros((N, N), np.float32)  # the fixed mark the key comes up to
    _sig_seg(pin, N / 2, N / 2 + N * 0.47 * size, N / 2, N / 2 + N * 0.44 * size, 1.0)
    _sig_two(img, frame, signal + pin, hot, other)


@gen('sig_clock', 'tense', 'focused', 'aggressive')
def _sig_clock(img, m, dt, size, hot, other):
    # a dial going round once a bar, a quarter of it filling each beat; the short hand takes four bars
    own = S['own']
    bar = _sig_bar(m)
    if 'last' not in own:
        own.update(last=bar, bars=0)
    if bar < own['last'] - 0.5:
        own['bars'] += 1
    own['last'] = bar
    r = 0.42 * N * size
    u = ((math.pi / 2 - _SIG_A) / (2 * math.pi)) % 1.0
    q = (u * 4) % 1.0
    frame, signal = np.zeros((N, N), np.float32), np.zeros((N, N), np.float32)
    _sig_circle(frame, r, 0.8)
    k = np.arange(16, dtype=np.float32)
    a = math.pi / 2 - k * math.pi / 8
    l = np.where(k % 4 == 0, 7.0, 3.0).astype(np.float32)
    _sig_seg(frame, N / 2 + (r - l) * np.cos(a), N / 2 + (r - l) * np.sin(a), N / 2 + r * np.cos(a), N / 2 + r * np.sin(a), 0.8)
    fill = (u < bar) & (_SIG_R < r - 9) & (_SIG_R > 6) & (q > 0.015) & (q < 0.985)
    hatch = (_SIG_R % 4.0) < 2.0  # rings, so it reads as filling, not a flat slice
    frame = frame + fill * hatch * (0.2 + 0.5 * (1 - (bar - u)))
    ang = math.pi / 2 - 2 * math.pi * bar
    _sig_seg(signal, N / 2, N / 2, N / 2 + (r - 1) * math.cos(ang), N / 2 + (r - 1) * math.sin(ang), 1.0)
    phrase = math.pi / 2 - 2 * math.pi * ((own['bars'] % 4) + bar) / 4
    for d in (-1, 0, 1):
        _sig_seg(signal, N / 2 + d, N / 2, N / 2 + d + 0.5 * r * math.cos(phrase), N / 2 + 0.5 * r * math.sin(phrase), 0.8)
    b = np.arange(4, dtype=np.float32)
    a = math.pi / 2 - b * math.pi / 2  # a lamp for each beat gone by
    _sig_dot(signal, N / 2 + (r + 5) * np.cos(a), N / 2 + (r + 5) * np.sin(a), 1, np.where(b <= int(bar * 4), 1.0, 0.0))
    _sig_dot(frame, N / 2 + (r + 5) * np.cos(a), N / 2 + (r + 5) * np.sin(a), 1, 0.3)
    _sig_two(img, frame, signal, hot, other)


@gen('sig_cymbal', 'happy', 'euphoric', 'aggressive')
def _sig_cymbal(img, m, dt, size, hot, other):
    # a cymbal on its stand: the top end runs its highlights round and throws glints off it; it rocks on every off-beat
    own, rng = S['own'], S['rng']
    if 'a' not in own:
        own.update(a=0.0, v=0.0)
    strength = _recent('hats', max(m['hit/hat'], m['hit/snare']), m, dt)
    treb = m['drive/treb']
    if _tick('rock', m, 2):
        own['v'] += (0.5 + 1.2 * strength) * (0.4 + treb) * (1 if own['a'] <= 0 else -1)
    own['v'] += dt * (-60 * own['a'] - 3.5 * own['v'])
    own['a'] += dt * own['v']
    cx, cy = N / 2, N * 0.6
    ca, sa = math.cos(own['a']), math.sin(own['a'])
    dx, dy = _X - cx, _Y - cy
    x = dx * ca + dy * sa
    y = (dy * ca - dx * sa) / 0.34
    r = np.hypot(x, y)
    th = np.arctan2(y, x)
    big = 0.42 * N * size
    disc = r < big
    grooves = 0.5 + 0.5 * np.sin(r * 1.9)
    turn = 0.9 * m['clock/treb']
    shine = np.abs(np.cos(th - turn)) ** 10 + 0.6 * np.abs(np.cos(1.5 * th + turn)) ** 16
    bell = r < 0.17 * big
    frame = disc * (0.1 + 0.26 * grooves) + bell * 0.3
    signal = disc * shine * grooves * (0.25 + 1.2 * treb)
    signal = signal + bell * 0.3 * shine + (np.abs(r - big + 0.5) < 1.4) * (0.3 + 0.9 * strength)
    n = int(12 + 110 * min(1.0, m['high']))  # glints
    ang, rad = rng.uniform(0, 2 * math.pi, n), big * np.sqrt(rng.uniform(0.04, 1, n))
    gx, gy = rad * np.cos(ang), 0.34 * rad * np.sin(ang)
    glint = np.zeros((N, N), np.float32)
    _sig_pen(glint, cx + gx * ca - gy * sa, cy + gx * sa + gy * ca, 1.0)
    pole = np.zeros((N, N), np.float32)
    _sig_seg(pole, cx, cy, cx, 0, 0.6)
    _sig_seg(pole, cx + 1, cy, cx + 1, 0, 0.6)
    _sig_seg(pole, cx - sa * 7, cy + ca * 7, cx, cy, 0.9)
    _sig_two(img, frame + pole * (~disc), signal + glint, hot, other)


@gen('sig_ribbon', 'dreamy', 'calm', 'melancholic', whole=True)
def _sig_ribbon(img, m, dt, size, hot, other):
    # the spectrum's centre of gravity as a ribbon rising up the picture: to the right the brighter the sound, wider the more
    # spread it is, a rib across it on every beat
    own = S['own']
    b = _bands() ** 2 + 1e-3
    k = np.arange(10, dtype=np.float32)
    cen = float((b * k).sum() / b.sum()) / 9
    spread = math.sqrt(float((b * (k - cen * 9) ** 2).sum() / b.sum())) / 9
    if 'x' not in own:
        own.update(x=np.full(N, -1.0, np.float32), w=np.zeros(N, np.float32), a=np.zeros(N, np.float32),
                   ribs=np.zeros(N, np.float32), mid=cen, now=cen, wide=spread)
    own['mid'] += (cen - own['mid']) * (1 - math.exp(-dt / 6))
    own['now'] += (cen - own['now']) * (1 - math.exp(-dt / 0.12))
    own['wide'] += (spread - own['wide']) * (1 - math.exp(-dt / 0.2))
    if _tick('row', m, 8):
        for key in ('x', 'w', 'a', 'ribs'):
            own[key] = np.roll(own[key], 1)
        x = 0.5 + 1.0 * (own['now'] - 0.45) + 2.2 * (own['now'] - own['mid'])
        own['x'][0] = N * min(0.88, max(0.12, x))
        own['w'][0] = 2.5 + N * 0.42 * own['wide'] * size
        own['a'][0] = 0.45 + 0.55 * m['level']
        own['ribs'][0] = 0
    if _tick('beat', m):
        own['ribs'][0] = 1
    live = (own['x'] >= 0)[:, None]
    age = (1 - np.arange(N, dtype=np.float32) / N)[:, None] ** 0.6
    d = np.abs(_X - own['x'][:, None]) / own['w'][:, None].clip(1)
    inside = (d < 1) & live
    edge = (np.abs(d - 1) * own['w'][:, None] < 0.9) & live
    a = own['a'][:, None] * age
    frame = inside * (0.3 * (1 - d) + 0.45 * own['ribs'][:, None]) * a + edge * 0.8 * a
    core = (np.abs(_X - own['x'][:, None]) < 1.0) & live
    _sig_two(img, frame, core * a, hot, other)


@gen('sig_vector', 'mysterious', 'tense', 'dreamy')
def _sig_vector(img, m, dt, size, hot, other):
    # a vectorscope in its diamond: the bands make a phosphor figure, a thin upright line when the music is tonal, opening
    # into a cloud the noisier and brighter it gets
    _trail(dt, 0.1)
    b = _bands()
    tonal = _v('tonal', 0.5)
    f = np.array((1, 1.62, 2.7, 4.1, 5.9, 8.3, 11.7, 16.1, 22.3, 31), np.float32)
    clocks = np.array((m['clock/bass'],) * 3 + (m['clock/mid'],) * 4 + (m['clock/treb'],) * 3, np.float32)
    s = np.linspace(0, 6 * math.pi, 1100, dtype=np.float32)[:, None]
    base = s * f + clocks * (1 + 0.3 * np.arange(10, dtype=np.float32))
    wide = 0.15 + 1.1 * (1 - tonal) + 0.9 * m['high']
    left = (b * np.sin(base)).sum(1)
    right = (b * np.sin(base + wide * (0.4 + 0.25 * np.arange(10, dtype=np.float32)))).sum(1)
    d = 0.42 * N * size
    amp = d / max(1.2, float(b.sum()) * 0.6) * (0.5 + 0.6 * m['level'])
    x, y = (left - right) * 0.7 * amp, (left + right) * 0.5 * amp
    keep = np.abs(x) + np.abs(y) < d - 1
    _plot(S['trail'], N / 2 + x[keep], N / 2 + y[keep], np.float32(0.2))
    frame = np.zeros((N, N), np.float32)
    c = N / 2
    _sig_seg(frame, (c - d, c, c + d, c), (c, c + d, c, c - d), (c, c + d, c, c - d), (c + d, c, c - d, c), 0.75)
    _sig_seg(frame, (c - d, c), (c, c - d), (c + d, c), (c, c + d), 0.22)
    t = np.clip(S['trail'], 0, 1)
    _sig_two(img, frame + t * 0.5, t * t * 1.2, hot, other)


@gen('sig_chord', 'melancholic', 'dreamy', 'euphoric')
def _sig_chord(img, m, dt, size, hot, other):
    # twelve pins on a ring and a line strung through the loudest; it moves on the beat, its old shapes fading behind it
    own = S['own']
    _trail(dt, 0.8)
    c = _sig_chroma()
    if 'to' not in own:
        own.update(to=np.arange(0, 12, 3, dtype=np.float32), at=np.arange(0, 12, 3, dtype=np.float32), c=c)
    own['c'] = own['c'] + (c - own['c']) * (1 - math.exp(-dt / 0.1))
    if _tick('chord', m):
        top = np.argsort(-c)[:4]
        top[c[top] < 0.4] = top[0]  # (a triad leaves two of the four on one pin)
        own['to'] = np.sort(top).astype(np.float32)
    d = (own['to'] - own['at'] + 6) % 12 - 6
    own['at'] = (own['at'] + d * (1 - math.exp(-dt / 0.07))) % 12
    turn = 0.07 * m['clock/mid']
    r = 0.42 * N * size
    a = own['at'] * math.pi / 6 + turn
    x, y = N / 2 + r * np.cos(a), N / 2 + r * np.sin(a)
    _sig_seg(S['trail'], x, y, np.roll(x, -1), np.roll(y, -1), 0.6)
    line = np.zeros((N, N), np.float32)
    _sig_seg(line, x, y, np.roll(x, -1), np.roll(y, -1), 1.0)
    _sig_seg(line, x, y, np.roll(x, -2), np.roll(y, -2), 0.5)
    frame, pins = np.zeros((N, N), np.float32), np.zeros((N, N), np.float32)
    p = np.arange(12, dtype=np.float32) * math.pi / 6 + turn
    px, py = N / 2 + (r + 4) * np.cos(p), N / 2 + (r + 4) * np.sin(p)
    _sig_dot(frame, px, py, 1, 0.5)
    lit = own['c'] > 0.5
    _sig_dot(pins, px[lit], py[lit], 2, own['c'][lit])
    _sig_two(img, frame + S['trail'], line + pins, hot, other)


@gen('sig_comb', 'mysterious', 'tense', 'calm')
def _sig_comb(img, m, dt, size, hot, other):
    # the key's overtones as the teeth of a comb on a log axis, closing up as they rise: the comb slides to the key's note,
    # a tooth is long while its note sounds, and the mids set them trembling
    own = S['own']
    root = max(0, int(_v('key/root', -1)))
    if 'o' not in own:
        own.update(o=root / 12.0, l=np.zeros(16, np.float32))
    own['o'] += (root / 12.0 - own['o']) * (1 - math.exp(-dt / 0.3))
    n = np.arange(1, 17, dtype=np.float32)
    c = _sig_chroma()[(root + np.round(12 * np.log2(n)).astype(int)) % 12]
    want = (0.12 + 0.88 * c ** 1.5) / n ** 0.22
    own['l'] += (want - own['l']) * (1 - math.exp(-dt / 0.09))
    width, spine = 0.84 * N * size, N / 2 + 0.34 * N * size
    x = N / 2 - width / 2 + width * (0.84 * np.log2(n) / 4 + 0.16 * own['o'])
    length = 0.68 * N * size * own['l']
    t = np.linspace(0, 1, 70, dtype=np.float32)[:, None]
    shake = (0.6 + 4 * _v('drive/mid', m['level'] * 0.5)) * t ** 2 * np.sin(m['clock/mid'] * (5 + 1.3 * n) + n)
    frame, signal = np.zeros((N, N), np.float32), np.zeros((N, N), np.float32)
    xs, ys = x + shake, spine - length * t
    _sig_pen(signal, xs, ys, 0.35 + 0.65 * c)
    _sig_pen(signal, xs[:, :6] + 1, ys[:, :6], 0.35 + 0.65 * c[:6])  # (the lowest are the thickest)
    _sig_dot(signal, xs[-1], ys[-1], 1, 0.4 + 0.6 * c)
    for d in range(3):
        _sig_seg(frame, N / 2 - width / 2, spine + d, N / 2 + width / 2, spine + d, 0.85)
    _sig_two(img, frame, signal, hot, other)


@gen('sig_ruler', 'focused', 'tense', 'drop')
def _sig_ruler(img, m, dt, size, hot, other):
    # two rulers sliding opposite ways, marks closer the faster the tempo: their beats meet at the cursor. The top one is cut
    # in sixteenths with bars, the lower in triplets
    own = S['own']
    pos = _sig_pos(m)
    bpm = min(200.0, max(60.0, m['bpm'] if m['bpm'] > 0 else 100.0))
    want = 0.21 * N * size * 120 / bpm
    own['pb'] = pb = own.get('pb', want) + (want - own.get('pb', want)) * (1 - math.exp(-dt / 0.3))
    x = _X[0] - N / 2
    up, down = x / pb + pos, -x / pb + pos

    def marks(u, div):
        return np.abs((u * div + 0.5) % 1.0 - 0.5) / div * pb < 0.6

    bar0 = pos - _sig_bar(m) * 4
    s = size
    high = np.where(marks((up - bar0) / 4, 1), 26.0, np.where(marks(up, 1), 15.0, np.where(marks(up, 2), 9.0, np.where(marks(up, 4), 5.0, 0.0))))
    low = np.where(marks(down, 1), 15.0, np.where(marks(down, 3), 7.0, 0.0))
    top, bot = N / 2 + 0.13 * N * s + 13 * s, N / 2 - 0.13 * N * s - 13 * s
    near = (0.3 + 0.7 * np.exp(-(x / (0.28 * N)) ** 2)).astype(np.float32)
    hi = (_Y < top) & (_Y > top - (high * s)[None, :])
    lo = (_Y > bot) & (_Y < bot + (low * s)[None, :])
    frame = (hi | lo) * near[None, :] * 0.85
    frame = frame + ((np.abs(_Y - top) < 1) | (np.abs(_Y - bot) < 1)) * near[None, :] * 0.8
    click = math.exp(-5 * (pos % 1.0))
    signal = (hi | lo) * near[None, :] * (np.abs(x) < 4 + 7 * click)[None, :]  # marks at the cursor
    cursor = np.zeros((N, N), np.float32)
    _sig_seg(cursor, N / 2, bot - 5, N / 2, top + 5, 0.5 + 0.5 * click)
    _sig_seg(cursor, N / 2 + 1, bot - 5, N / 2 + 1, top + 5, 0.5 + 0.5 * click)
    _sig_two(img, frame, signal + cursor, hot, other)


@gen('sig_lanes', 'aggressive', 'tense', 'drop', whole=True)
def _sig_lanes(img, m, dt, size, hot, other):
    # four bars of drums as a grid, a group of hat, snare and kick lanes a bar, sixteen steps across, written as they go by.
    # A hit only says how strong: the step it goes in is the beat's
    own = S['own']
    if 'g' not in own:
        y = _Y[:, 0] - 2.5
        group, within = (y // 30).astype(int), y % 30
        lane = np.minimum(2, (within // 8).astype(int))
        cell = (within < 24) & (within % 8 < 7) & (y >= 0) & (group < 4)
        row = np.where(cell, (3 - group) * 3 + lane, -1)  # the first bar at the top, the kick at the foot of each group
        x = _X[0] - 6.5
        col = np.where((x >= 0) & (x < 112) & (x % 7 < 6), (x // 7).astype(int), -1)
        own.update(g=np.zeros((12, 16), np.float32), row=row, col=col, step=-1, last=0.0, bar=0, walk=0, was=np.zeros(3, np.float32),
                   on=((row >= 0)[:, None] & (col >= 0)[None, :]).astype(np.float32))
    g = own['g']
    if _locked(m):
        b = _sig_bar(m)
        if b < own['last'] - 0.5:
            own['bar'] = (own['bar'] + 1) % 4
        own['last'] = b
        step = int(b * 16) % 16
    else:
        if _tick('step', m, 4):
            own['walk'] += 1
        step, own['bar'] = own['walk'] % 16, (own['walk'] // 16) % 4
    rows = slice(own['bar'] * 3, own['bar'] * 3 + 3)
    if own['bar'] * 16 + step != own['step']:
        own['step'] = own['bar'] * 16 + step
        g[rows, step] = 0
    hits = np.array((m['hit/hat'], m['hit/snare'], max(m['hit/kick'], 0.8 * m['hit/bass'])), np.float32)
    rising = hits > own['was'] + 0.04
    own['was'] = hits
    g[rows, step] = np.maximum(g[rows, step], np.where(rising, np.clip(0.4 + 0.7 * hits, 0, 1), 0))
    if not _locked(m):  # with no drums to hear, what the bands do where they would be
        b = _bands()
        ghost = np.array((b[7:].mean(), b[3:6].mean(), b[:2].mean()), np.float32)
        g[rows, step] = np.maximum(g[rows, step], np.where(ghost > 0.42, ghost, 0))
    age = ((own['bar'] - np.arange(12) // 3) % 4).astype(np.float32)
    v = g * (1 - 0.14 * age)[:, None]
    row, col = own['row'], own['col']
    cells = v[row[:, None], col[None, :]] * own['on']
    head = np.zeros((12, 16), np.float32)
    head[rows, step] = 1
    here = head[row[:, None], col[None, :]] * own['on']
    kick = (row % 3 == 2)[:, None]
    _sig_two(img, own['on'] * 0.07 + here * 0.45 + cells * ~kick, cells * kick + here * 0.3 + cells * (row % 3 == 1)[:, None] * 0.5, hot, other)


@gen('sig_bins', 'calm', 'happy', 'melancholic')
def _sig_bins(img, m, dt, size, hot, other):
    # how loud the music has been: on each half beat a bead for the level now drops through the pegs into its bin, the old
    # ones melting away, so steady music stacks one tower and music with a shape spreads out
    own, rng = S['own'], S['rng']
    k = 25
    level = m['level']
    if 'n' not in own:
        own.update(n=np.zeros(k, np.float32), beads=[], lo=level - 0.1, hi=level + 0.1)
    own['lo'] = min(level, own['lo'] + 0.01 * dt)
    own['hi'] = max(level, own['hi'] - 0.01 * dt)
    place = (level - own['lo']) / max(0.05, own['hi'] - own['lo'])
    if _tick('bead', m, 2):
        own['beads'].append([S['t'], int(min(k - 1, max(0, place * (k - 1) + rng.normal(0, 1.1))))])
    p = 4 if size < 1.3 else 5
    x0, foot = N / 2 - k * p / 2, N / 2 - 0.42 * N * min(size, 1.15)
    top = foot + 0.8 * N * min(size, 1.15)
    frame, signal = np.zeros((N, N), np.float32), np.zeros((N, N), np.float32)
    fall = 0.42
    alive = []
    for t0, i in own['beads']:
        f = (S['t'] - t0) / fall
        if f >= 1:
            own['n'][i] += 1
            continue
        alive.append([t0, i])
        tx = x0 + (i + 0.4) * p
        y = top + (foot + own['n'][i] * p - top) * f * f
        _sig_dot(signal, N / 2 + (tx - N / 2) * f + 2.5 * (1 - f) * math.sin(f * 26), y, 1, 1.0)
    own['beads'] = alive
    own['n'] = n = np.minimum(own['n'] * math.exp(-dt / 16), 13.5)
    px = _X[0] - x0
    col = np.clip((px / p).astype(int), 0, k - 1)
    bead = (px >= 0) & (px < k * p) & (px % p < p - 1)
    rows = (_Y - foot) / p
    filled = (rows >= 0) & (rows < n[col][None, :]) & ((_Y - foot) % p < p - 1) & bead[None, :]
    fresh = rows > n[col][None, :] - 1.5  # the top of each stack, what came in last
    frame = frame + filled * 0.8
    signal = signal + filled * fresh
    _sig_seg(frame, x0, foot - 2, x0 + k * p, foot - 2, 0.8)
    i = np.arange(7, dtype=np.float32)
    for r in range(5):  # the pegs, fanning out under the top
        px_ = N / 2 + (i[:r + 2] - (r + 1) / 2) * 9 * (1 + 0.5 * r)
        _sig_pen(frame, px_, np.full(r + 2, top - 5 - 7 * r * -0.0 - 6.0 * r, np.float32), 0.6)
    _sig_dot(signal, x0 + (place * (k - 1) + 0.4) * p, foot - 5, 1, 0.9)
    _sig_two(img, frame, signal, hot, other)


@gen('sig_groove', 'mysterious', 'aggressive', 'tense')
def _sig_groove(img, m, dt, size, hot, other):
    # a lathe cutting a record, a turn a bar: the groove wobbles with how much is going on, so what happens on the same step
    # of each bar lines up across the turns
    own = S['own']
    per, turns = 340, 6
    total = per * turns
    bar = _sig_bar(m)
    b = _bands()
    if 'cut' not in own:
        own.update(cut=np.zeros(total, np.float32), head=0, last=bar, turn=0, b=b)
    if bar < own['last'] - 0.5:
        own['turn'] += 1
    own['last'] = bar
    rise = float(np.maximum(b - own['b'], 0).sum())
    own['b'] = b
    hit = max(m['hit/kick'], m['hit/snare'], m['hit/hat'])
    amount = min(1.0, 0.1 + 3 * m['busy'] + 0.5 * _v('flux') + 2.5 * rise + 0.6 * hit)
    head = own['turn'] * per + int(bar * per)
    if head > own['head']:
        own['cut'][np.arange(max(own['head'], head - per), head) % total] = amount
    own['head'] = head = max(head, own['head'])
    age = np.arange(total, dtype=np.float32)
    idx = (head - 1 - np.arange(total)) % total
    cut = own['cut'][idx]
    outer, inner = 0.46 * N * size, 0.13 * N * size
    gap = (outer - inner) / turns
    r = outer - age / per * gap + 0.6 * cut * gap * np.sin(age * 2.3)
    a = 0.6 + age * (2 * math.pi / per)
    x, y = N / 2 + r * np.cos(a), N / 2 + r * np.sin(a)
    frame, signal = np.zeros((N, N), np.float32), np.zeros((N, N), np.float32)
    _sig_pen(frame, x, y, 0.3 + 0.5 * (1 - age / total))
    deep = cut > 0.45
    _sig_pen(signal, x[deep], y[deep], (cut[deep] * (1 - 0.7 * age[deep] / total)))
    _sig_circle(frame, 0.06 * N * size, 0.8)
    _sig_dot(signal, N / 2, N / 2, 1, 1.0)
    hx, hy = N / 2 + outer * math.cos(0.6), N / 2 + outer * math.sin(0.6)  # the cutter
    _sig_seg(signal, hx, hy, N, N - 6, 0.8)
    _sig_dot(signal, hx, hy, 1, 1.0)
    _sig_two(img, frame, signal, hot, other)


@gen('sig_strings', 'aggressive', 'euphoric', 'drop')
def _sig_strings(img, m, dt, size, hot, other):
    # four bass strings between a nut and a bridge, a low band each: the louder it is the wider it rings, each in its own
    # harmonic, the blur of its swing around the string itself
    own = S['own']
    b = _bands()[:4]
    own['a'] = a = np.maximum(b, own.get('a', b) * math.exp(-dt / 0.28))
    s = min(size, 1.15)
    x0, x1 = N / 2 - 0.44 * N * s, N / 2 + 0.44 * N * s
    u = np.clip((_X[0] - x0) / (x1 - x0), 0, 1)
    on = ((_X[0] > x0) & (_X[0] < x1)).astype(np.float32)
    xs = np.arange(N, dtype=np.float32) + 0.5
    frame, signal = np.zeros((N, N), np.float32), np.zeros((N, N), np.float32)
    for k in range(4):
        y0 = N / 2 + (k - 1.5) * 0.22 * N * s
        env = a[k] * (0.2 + m['drive/bass']) * 0.1 * N * s * np.abs(np.sin((k + 1) * math.pi * u)).astype(np.float32)
        swing = math.sin(m['clock/bass'] * (17 + 5 * k))
        y = y0 + env * swing
        blur = np.abs(_Y - y0) < env[None, :]
        frame += blur * on[None, :] * (0.16 + 0.34 * (1 - np.abs(_Y - y0) / np.maximum(env, 1)[None, :]))
        for d in range(2 if k < 2 else 1):
            _sig_pen(signal, xs, y + d, on * (0.55 + 0.45 * float(a[k])))
        if k == 0:
            _sig_pen(signal, xs, y - 1, on * (0.55 + 0.45 * float(a[k])))
    for x, w in ((x0, 3), (x1, 2)):
        for d in range(w):
            _sig_seg(frame, x + d, N / 2 - 0.37 * N * s, x + d, N / 2 + 0.37 * N * s, 0.9)
    pegs = N / 2 + (np.arange(4, dtype=np.float32) - 1.5) * 0.22 * N * s
    _sig_dot(frame, np.full(4, x0 - 4, np.float32), pegs, 1, 0.7)
    _sig_two(img, frame, signal, hot, other)
