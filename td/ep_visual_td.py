# ep visual <-> TouchDesigner. Runs inside TouchDesigner, not in Python: open the Textport (Alt+T) and type
#
#   exec(open(ep_td := r'<where this file is>\ep_visual_td.py').read())
#
# (`ep_td` tells it where it is: the procedural layer's families are in gen/ next to it)
# (the MCP tool touchdesigner() gives the path as `setup_script`)
# It builds a baseCOMP `ep_visual` in /project1 (rerunning replaces it):
#   frames_in/frames_tex   the visualizer's picture, pixel for pixel: a WebSocket DAT takes the page's pixel grid
#                  from the server (/api/frames) and a Script TOP shows it, no browser involved
#   canvas         the same picture through a Web Render TOP of td.html, the fallback (SOURCE below)
#   source         Cross TOP choosing between the two
#   displace ... strobe   the effects over it (displace, gen, mirror, feedback, rgbsplit, edge, blur, tint, bloom, hue,
#                  strobe), each a Cross TOP between the picture so far and the effect, so /ep/fx/<effect> (0..1)
#                  mixes it in; their parameters follow /ep/fx/<effect>/<param> and the music (/ep/hit,
#                  /ep/beat/pulse, /ep/drive/bass ...), through the `ep` module's v()
#   out            Null TOP: the result. The visualizer page shows it (TD FX), the MCP tools snapshot it
#   spout_out, ndi_out, window, recorder   the result for OBS/Resolume (Spout, NDI), a projector, a movie file:
#                  off until switched on (the MCP tools td_route and td_record)
#   values/smooth/events/control   OSC In CHOP on 7000 (and a Lag CHOP smoothing it), OSC In DAT on 7001, OSC Out
#                  DAT to 7002 (see notes)
#   World page     custom parameters on ep_visual: a slider per knob inside the visualizer's worlds (speed, react,
#                  size, zoom, panx, pany, turn, echo, hue, sat, light); moving one (by hand, or an expression, an
#                  export, an LFO) pins it through the `world` Parameter Execute DAT (/ep/world/<knob> to 7002);
#                  Auto hands every knob back to the visualizer's Director, Neutral pins them all at rest
#   api            WebServer DAT on 9980 for the MCP server: POST /exec runs Python here, GET /frame.jpg is `out`,
#                  and its WebSocket clients that show the token get `out` pushed by the `push` Execute DAT (which
#                  also keeps the tint ramp on the style's palette); the token goes to ~/.ep_visual_td.json
# On the visualizer's side: `teenage-ep visual --td 7000`, or the MCP tool touchdesigner().
# Parameter names follow docs.derivative.ca, but were never run in a TouchDesigner here: one this build names
# differently is skipped and listed at the end (and in the `notes` DAT), so it can be fixed by hand or through the
# MCP tool td_set.

API_VERSION = 8  # what this script builds; teenage_mcp.tdfx.API_VERSION is what the server expects
PAGE = 'http://127.0.0.1:8133/'
PORT = 7000
API_PORT = 9980
PAPER = 'black'  # the picture's paper in TouchDesigner: black (effects as light over dark) or white
SOURCE = 'websocket'  # how the picture comes in: websocket (WebSocket DAT + Script TOP) or webrender (td.html)
FLIP = True  # TouchDesigner's textures start at the bottom row, the page's grid at the top
PUSH_EVERY = 2  # `out` goes to the page every this many frames (2: ~30 a second at 60 fps)
LAG_UP, LAG_DOWN = 0.03, 0.12  # seconds the Lag CHOP takes to follow a rise and a fall
RES = dict(outputresolution=('custom',), resolutionw=1000, resolutionh=1000)  # a Cross TOP takes its second input's size
CRISP = dict(inputfiltertype=('nearest',))  # what moves the picture keeps its cells whole: linear smears, feedback every frame
GEN_N = 125  # the procedural layer's grid: the page's own cells (125 -> 8 pixels each)
# what the procedural layer draws by itself; the families in gen/ add to it, and teenage_mcp.tdfx.GEN_KINDS is the whole
# list, whose index /ep/fx/gen/kind is
GEN_KINDS = ('rings', 'bars', 'orbit', 'lissajous', 'sparks', 'floor', 'scope', 'tunnel', 'rain', 'life', 'flow', 'wheel',
             'blocks', 'ripple', 'bolt', 'waterfall', 'dots', 'snake')
SPOUT = False  # send `out` as a Spout sender named ep_visual right away
NDI = False  # send `out` as an NDI source named ep_visual right away

# the knobs inside the visualizer's worlds, as teenage_mcp.knobs.KNOBS: name -> (neutral, low, high)
KNOBS = {'speed': (1.0, 0.0, 3.0), 'react': (1.0, 0.0, 2.0), 'size': (1.0, 0.6, 1.8), 'zoom': (1.0, 1.0, 4.0),
         'panx': (0.0, -1.0, 1.0), 'pany': (0.0, -1.0, 1.0), 'turn': (0.0, -45.0, 45.0), 'echo': (0.0, 0.0, 0.95),
         'hue': (0.0, -180.0, 180.0), 'sat': (1.0, 0.0, 2.0), 'light': (0.0, -0.5, 0.5)}

import json
import os
import re
import secrets
import urllib.parse

CONFIG = os.path.join(os.path.expanduser('~'), '.ep_visual_td.json')
PROBLEMS = []


class E(str):
    """A parameter expression rather than a value."""


def _problem(text):
    PROBLEMS.append(text)
    print('ep_visual: ' + text)


def _assign(o, name, value):
    """Set one parameter: an E is an expression, a tuple lists menu entries to try in turn."""
    p = getattr(o.par, name, None)
    if p is None:
        return False
    if isinstance(value, E):
        p.expr = str(value)
    elif isinstance(value, tuple):
        for choice in value:
            try:
                p.val = choice
                return True
            except Exception:  # noqa: BLE001 - not an entry of this menu
                continue
        raise ValueError(f'none of {value} is an entry of this menu')
    else:
        p.val = value
    return True


def _set(o, **pars):
    for name, value in pars.items():
        try:
            if not _assign(o, name, value):
                _problem(f'{o.name} ({o.OPType}) has no parameter {name!r}; wanted {value!r}')
        except Exception as exc:  # noqa: BLE001
            _problem(f'{o.name}.par.{name} = {value!r} failed: {exc}')


def _set_any(o, *choices):
    """The first set of parameter names this operator has."""
    for pars in choices:
        if all(getattr(o.par, name, None) is not None for name in pars):
            _set(o, **pars)
            return
    _problem(f'{o.name} ({o.OPType}) has none of {[list(c) for c in choices]}')


def _node(comp, kind, name, pos, /, inputs=(), **pars):
    """Create an operator, wire its inputs, set its parameters (`pars` may hold one called `name`, as NDI Out's)."""
    o = comp.create(kind, name)
    o.nodeX, o.nodeY = pos
    for i, src in enumerate(inputs):
        try:
            o.inputConnectors[i].connect(src)
        except IndexError:  # a multi-input operator grows its connectors as they fill
            try:
                src.outputConnectors[0].connect(o)
            except Exception as exc:  # noqa: BLE001
                _problem(f'{name}: input {i} from {src.name}: {exc}')
        except Exception as exc:  # noqa: BLE001
            _problem(f'{name}: input {i} from {src.name}: {exc}')
    _set(o, **pars)
    return o


# ---------------------------------------------------------------------------------------------- the effects
# Each takes the picture so far and returns the effect's output; build() puts a Cross TOP after it. `v` is the
# expression that reads a value the visualizer sends: v('hit') is /ep/hit, v('fx/blur/size') is /ep/fx/blur/size.
def _displace(comp, src, x, v):
    noise = _node(comp, noiseTOP, 'displace_noise', (x, -450), mono=False,
                  period=E(f"max(0.05, {v}('fx/displace/scale'))"),
                  tz=E(f"absTime.seconds * {v}('fx/displace/speed')"))
    fx = _node(comp, displaceTOP, 'displace_fx', (x, -200), inputs=(src, noise), **CRISP)
    weight = E(f"{v}('fx/displace/weight') * (0.4 + {v}('drive/bass'))")
    _set_any(fx, {'displaceweightx': weight, 'displaceweighty': weight}, {'displaceweight': weight})
    return fx


def _big(comp, top, name, pos):
    # a grid of cells at the size of the picture, whole cells, by the graphics card: numpy doing it, and the 4 MB
    # going up to the card, took more than all the drawing
    return _node(comp, resolutionTOP, name, pos, inputs=(top,), **RES, **CRISP)


def _families():
    # the text of the family files (gen/*.py next to this script, in name order) and the elements they define
    here = globals().get('ep_td')
    folder = os.path.join(os.path.dirname(here), 'gen') if here else ''
    if not os.path.isdir(folder):
        _problem('no gen/ folder: run this script as exec(open(ep_td := r"...").read()) for the families of the procedural layer')
        return '', ()
    texts = []
    for name in sorted(os.listdir(folder)):
        if name.endswith('.py'):
            with open(os.path.join(folder, name), encoding='utf-8') as f:
                texts.append(f.read())
    text = '\n\n' + '\n\n'.join(texts)
    return text, tuple(re.findall(r"^@gen\('(\w+)'", text, re.M))


def _gen(comp, src, x, v):
    # elements TouchDesigner draws itself from the music (GEN below), laid over the picture as light: added to dark
    # paper, put over light paper. The push Execute DAT cooks gen_tex every frame while the layer is up
    callbacks = _node(comp, textDAT, 'gen_callbacks', (x, -500))
    families, more = _families()
    callbacks.text = GEN.format(root=comp.path, kinds=GEN_KINDS + more, n=GEN_N) + families
    tex = _big(comp, _node(comp, scriptTOP, 'gen_tex', (x, -350), callbacks=callbacks.path), 'gen_big', (x + 120, -350))
    if PAPER == 'black':
        return _node(comp, compositeTOP, 'gen_fx', (x, -200), inputs=(src, tex), operand=('add', 'screen'))
    return _node(comp, compositeTOP, 'gen_fx', (x, -200), inputs=(tex, src), operand=('over',))


def _mirror(comp, src, x, v):
    scale = E(f"1 / max(1, {v}('fx/mirror/tiles'))")
    return _node(comp, transformTOP, 'mirror_fx', (x, -200), inputs=(src,), extend=('mirror',), sx=scale, sy=scale, **CRISP,
                 rotate=E(f"({v}('clock/mid') * 40 * {v}('fx/mirror/spin')) % 360"))


def _feedback(comp, src, x, v):
    loop = _node(comp, feedbackTOP, 'feedback_loop', (x, -200), inputs=(src,))
    zoom = E(f"1 + ({v}('fx/feedback/zoom') - 1) * (1 + 1.5 * {v}('beat/pulse'))")
    move = _node(comp, transformTOP, 'feedback_move', (x, -350), inputs=(loop,), sx=zoom, sy=zoom, **CRISP,
                 rotate=E(f"{v}('fx/feedback/spin') * (0.5 + {v}('drive/mid'))"))
    fade = _node(comp, levelTOP, 'feedback_fade', (x, -500), inputs=(move,),
                 brightness1=E(f"{v}('fx/feedback/decay')"))
    mix = _node(comp, compositeTOP, 'feedback_mix', (x, -650), inputs=(src, fade), operand=('maximum', 'add'))
    # a drop starts a fresh composition: the trails are cleared while its envelope is near the top (~0.1 s)
    _set(loop, top=mix.path, reset=E(f"1 if {v}('section/drop') > 0.9 else 0"))
    return mix


def _rgbsplit(comp, src, x, v):
    off = f"{v}('fx/rgbsplit/offset') * (0.3 + {v}('hit'))"
    parts = []
    for k, (ch, shift, rgb) in enumerate((('r', f'-({off})', (1, 0, 0)), ('g', '0', (0, 1, 0)), ('b', off, (0, 0, 1)))):
        y = -200 - 150 * k
        moved = _node(comp, transformTOP, f'rgbsplit_{ch}_move', (x - 120, y), inputs=(src,), tx=E(shift), **CRISP)
        tint = _node(comp, constantTOP, f'rgbsplit_{ch}_tint', (x - 240, y), colorr=rgb[0], colorg=rgb[1],
                     colorb=rgb[2], **RES)
        parts.append(_node(comp, multiplyTOP, f'rgbsplit_{ch}', (x, y), inputs=(moved, tint)))
    return _node(comp, compositeTOP, 'rgbsplit_fx', (x, -700), inputs=tuple(parts), operand=('add',))


def _edge(comp, src, x, v):
    # outlines in the style's hot colour (palette role 6), white until one comes
    edges = _node(comp, edgeTOP, 'edge_find', (x, -200), inputs=(src,),
                  **{f'edgecolor{c}': E(f"{v}('palette/6/{c}', 1)") for c in 'rgb'})
    glow = _node(comp, levelTOP, 'edge_glow', (x, -350), inputs=(edges,),
                 brightness1=E(f"{v}('fx/edge/glow') * (1 + 2 * {v}('hit'))"))
    return _node(comp, compositeTOP, 'edge_fx', (x, -500), inputs=(src, glow), operand=('add',))


def _blur(comp, src, x, v):
    return _node(comp, blurTOP, 'blur_fx', (x, -200), inputs=(src,),
                 size=E(f"{v}('fx/blur/size') * (1 - 0.6 * {v}('beat/pulse'))"))


def _tint(comp, src, x, v):
    # the style's palette as a ramp, dark to light (the `push` Execute DAT keeps tint_keys up to date), looked up by
    # each pixel's luminance
    keys = _node(comp, tableDAT, 'tint_keys', (x - 150, -500))
    keys.clear()
    for row in (['pos', 'r', 'g', 'b', 'a'], [0, 0, 0, 0, 1], [1, 1, 1, 1, 1]):
        keys.appendRow(row)
    ramp = _node(comp, rampTOP, 'tint_ramp', (x, -350), dat=keys.path, type=('horizontal',),
                 outputresolution=('custom',), resolutionw=256, resolutionh=1)
    return _node(comp, lookupTOP, 'tint_fx', (x, -200), inputs=(src, ramp), method=('secondinput',),
                 channel=('luminance',))


def _bloom(comp, src, x, v):
    # output left at its default, input + bloom (the docs give no tokens for that menu)
    return _node(comp, bloomTOP, 'bloom_fx', (x, -200), inputs=(src,),
                 bloomintensity=E(f"{v}('fx/bloom/intensity') * (1 + {v}('hit'))"),
                 bloomthreshold=E(f"{v}('fx/bloom/threshold')"))


def _hue(comp, src, x, v):
    return _node(comp, hsvadjustTOP, 'hue_fx', (x, -200), inputs=(src,),
                 hueoffset=E(f"({v}('clock/mid') * 60 * {v}('fx/hue/speed')) % 360"),
                 saturationmult=E(f"{v}('fx/hue/sat')"))


def _strobe(comp, src, x, v):
    return _node(comp, levelTOP, 'strobe_fx', (x, -200), inputs=(src,),
                 brightness1=E(f"1 + {v}('fx/strobe/power') * {v}('hit/kick')"))


# in chain order, as tdfx.EFFECTS on the visualizer's side
STAGES = (('displace', _displace), ('gen', _gen), ('mirror', _mirror), ('feedback', _feedback), ('rgbsplit', _rgbsplit),
          ('edge', _edge), ('blur', _blur), ('tint', _tint), ('bloom', _bloom), ('hue', _hue), ('strobe', _strobe))

MODULE = '''# ep visual: what the visualizer sends, for the effects' expressions: v('hit') is /ep/hit
ROOT = {root!r}
_NAMES = {{}}  # 'hit' -> the channel name the OSC In CHOP gave /ep/hit, once found
# what moves in steps (the effect settings 4 times a second, the levels 30) comes through the Lag CHOP `smooth`;
# hits, the beat and the clocks stay sharp
SMOOTHED = ('fx/', 'world/', 'drive/', 'rel/', 'mood/', 'level', 'low', 'mid', 'high', 'bright')


def _variants(name):
    flat = name.replace('/', '_')
    return ('ep/' + name, '/ep/' + name, name, 'ep_' + flat, '_ep_' + flat, flat)


def _channel(c, name):
    if c is None:
        return None
    ch = c.chan(_NAMES[name]) if name in _NAMES else None
    if ch is None:
        for candidate in _variants(name):
            ch = c.chan(candidate)
            if ch is not None:
                _NAMES[name] = candidate
                break
    return ch


def v(name, default=0.0, raw=False):
    # (the Lag CHOP has no channels until it has cooked once: the raw value does until then)
    ch = _channel(op(ROOT + '/smooth'), name) if name.startswith(SMOOTHED) and not raw else None
    if ch is None:
        ch = _channel(op(ROOT + '/values'), name)
    if ch is None:
        return default
    try:
        return float(ch.eval())
    except Exception:
        try:
            return float(ch[0])
        except Exception:
            return default
'''

PUSH = '''# ep visual, after every frame: the style's palette into tint_keys (dark to light, for the tint effect), the
# procedural layer drawn while it is up, and, every PUSH_EVERY frames, `out` as a JPEG to the stream clients of `api`
# (the MCP server, which shows it on the page)
try:
    import cv2
except ImportError:
    cv2 = None

ROOT = {root!r}
PUSH_EVERY = {every!r}
QUALITY = 0.92  # less smears the edges of the page's cells


def _palette(comp):
    keys, ep = comp.op('tint_keys'), comp.op('ep')
    if keys is None or ep is None:
        return
    cols = []
    for i in range(8):
        r, g, b = (ep.module.v('palette/%d/%s' % (i, c), -1.0) for c in 'rgb')
        if r >= 0:
            cols.append((round(0.3 * r + 0.59 * g + 0.11 * b, 4), round(r, 3), round(g, 3), round(b, 3)))
    if not cols:
        return
    cols.sort()
    if comp.fetch('ep_palette', None) == cols:
        return
    comp.store('ep_palette', cols)
    keys.clear()
    keys.appendRow(['pos', 'r', 'g', 'b', 'a'])
    for i, (_, r, g, b) in enumerate(cols):
        keys.appendRow([round(i / max(1, len(cols) - 1), 4), r, g, b, 1])


def _jpeg(out):
    # `out` as a JPEG. saveByteArray waits for the GPU, 23 ms of a 16 ms frame; a delayed read takes 1 ms and gives the
    # frame before, and OpenCV packs that in 5 ms, with the colours at full resolution, so the cells keep their edges
    if cv2 is None:
        return bytes(out.saveByteArray('.jpg', quality=QUALITY))
    a = out.numpyArray(delayed=True)
    if a is None:
        return None
    picture = cv2.flip(cv2.cvtColor(cv2.convertScaleAbs(a, alpha=255), cv2.COLOR_RGBA2BGR), 0)
    done, data = cv2.imencode('.jpg', picture, [int(cv2.IMWRITE_JPEG_QUALITY), int(QUALITY * 100),
                                                int(cv2.IMWRITE_JPEG_SAMPLING_FACTOR), int(cv2.IMWRITE_JPEG_SAMPLING_FACTOR_444)])
    return data.tobytes() if done else None


def _push(comp, frame):
    clients = list(comp.fetch('ep_stream_clients', []) or [])
    if not clients or frame % PUSH_EVERY:
        return
    api, out = comp.op('api'), comp.op('out')
    # after the picture's end, which decoders stop at: the number of the page's frame it was made from, so the page can
    # tell how long the way round took
    data = _jpeg(out)
    if data is None:
        return
    data += b'EP' + int(comp.fetch('ep_seq', 0)).to_bytes(2, 'little')
    alive = []
    for client in clients:
        try:
            api.webSocketSendBinary(client, data)
            alive.append(client)
        except Exception:
            pass
    if len(alive) != len(clients):
        comp.store('ep_stream_clients', alive)


def _pull(comp):
    # what nothing downstream pulls, TouchDesigner cooks about once a second unless it is on screen: the Lag CHOP, which
    # only Python reads, and the WebSocket DAT, which takes in the page's pictures when it cooks
    for name in ('smooth', 'frames_in'):
        o = comp.op(name)
        if o is not None:
            o.cook(force=True)


def _gen(comp):
    # the procedural layer draws itself anew every frame, but only while it is mixed in
    tex, ep = comp.op('gen_tex'), comp.op('ep')
    if tex is not None and ep is not None and ep.module.v('fx/gen') > 0.001:
        tex.cook(force=True)


def onFrameEnd(frame):
    comp = op(ROOT)
    if comp is None:
        return
    _pull(comp)
    _palette(comp)
    _gen(comp)
    _push(comp, int(frame))
'''

WORLD = '''# ep visual: the World page of ep_visual. A slider that moves (by hand, an expression, an export) pins that knob
# inside the visualizer's worlds: /ep/world/<knob> <value> to the server's control port. Auto hands every knob back
# to the visualizer's Director, Neutral sets them all at rest (and pins them there).
ROOT = {root!r}
NEUTRAL = {neutral!r}


def _send(address, value):
    out = op(ROOT + '/control')
    if out is None:
        return
    try:
        out.sendOSC(address, value)
    except Exception:  # a build that takes the values as a list
        out.sendOSC(address, [value])


def onValueChange(par, prev):
    name = par.name.lower()
    if name in NEUTRAL:
        _send('/ep/world/' + name, float(par.eval()))


def onPulse(par):
    if par.name == 'Auto':
        _send('/ep/world/auto', 1)
    elif par.name == 'Neutral':
        for name, value in NEUTRAL.items():
            slider = getattr(par.owner.par, name.capitalize(), None)
            if slider is not None:
                slider.val = value
            _send('/ep/world/' + name, value)
'''

FRAMES = '''# ep visual: the page's pixel grid, pushed by the visualizer's server as binary messages: uint16 N and frame number
# (little-endian), then N*N RGBA cells, zipped, alpha 0 where the paper is bare. Kept on frames_tex, which shows it.
import zlib

import numpy as np

ROOT = {root!r}
PAPER = {paper!r}
FLIP = {flip!r}


def onConnect(dat):
    return


def onDisconnect(dat):
    return


def onReceiveText(dat, rowIndex, message):
    return


def onReceivePing(dat, contents):
    return


def onReceivePong(dat, contents):
    return


def _busy(a, n):
    # where the picture has something going on, 0..1, on a 25 x 25 map for the procedural layer to keep out of: how far
    # each block's cells stray from their neighbours, spread a little (every grid the page has divides by 25)
    if n % 25:
        return
    light = a[:, :, :3].astype(np.float32).mean(axis=2) / 255
    edges = np.abs(light[:, 1:] - light[:, :-1])[:-1] + np.abs(light[1:] - light[:-1])[:, :-1]
    k = n // 25
    edges = np.pad(edges, ((0, 1), (0, 1)))
    block = edges.reshape(25, k, 25, k).mean(axis=(1, 3))
    wide = np.pad(block, 1)
    block = np.maximum(block, 0.5 * (wide[:-2, 1:-1] + wide[2:, 1:-1]))
    wide = np.pad(block, 1)
    block = np.maximum(block, 0.5 * (wide[1:-1, :-2] + wide[1:-1, 2:]))
    op(ROOT).store('ep_busy', np.clip(block / 0.16, 0, 1)[::-1 if FLIP else 1])


def onReceiveBinary(dat, contents):
    data = bytes(contents)
    if len(data) < 4:
        return
    n, seq = int.from_bytes(data[:2], 'little'), int.from_bytes(data[2:4], 'little')
    try:
        cells = zlib.decompress(data[4:])
    except zlib.error:
        return
    if n == 0 or len(cells) != n * n * 4:
        return
    a = np.frombuffer(cells, dtype=np.uint8).reshape(n, n, 4).copy()
    a[a[:, :, 3] == 0] = PAPER
    if seq % 4 == 0:  # (what is busy where changes slower than that)
        _busy(a, n)
    if FLIP:
        a = a[::-1]
    tex = op(ROOT + '/frames_tex')
    tex.store('frame', np.ascontiguousarray(a))
    tex.cook(force=True)
    op(ROOT).store('ep_seq', seq)
'''

TEX = '''# ep visual: shows the last pixel grid frames_in received
def onSetupParameters(scriptOp):
    return


def onPulse(par):
    return


def onCook(scriptOp):
    frame = scriptOp.fetch('frame', None)
    if frame is not None:
        scriptOp.copyNumpyArray(frame)
'''

GEN = '''# ep visual: the procedural layer. Elements TouchDesigner draws itself from the music, in the page's own pixel grid
# (N cells, gen_big makes them big) and the colours of the world on the canvas; /ep/fx/gen/kind says which, /ep/fx/gen/size
# how big. Row 0 is the bottom, as TouchDesigner's textures are. The push Execute DAT cooks this while /ep/fx/gen is up.
#   rings      a ring goes out from the middle on every beat, as strong as the kicks are
#   bars       the ten bands as a skyline mirrored from the middle, the lows in the centre, caps falling back
#   orbit      dots circling the middle, wider with the bass, more of them the busier the top end, with trails
#   lissajous  a figure whose ratio comes from the key, turning with the mids, swelling with the level
#   sparks     a burst of sparks on the off-beats while there are hats and snares, falling
#   floor      a perspective grid floor whose lines come one a beat
#   scope      a trace of the ten bands as waves across the middle, each moving with its band's clock
#   tunnel     squares rushing out of the middle, one a beat, tilting with the mids
#   rain       cells falling in columns, a new lot every half beat, faster with the treble, more with the top end
#   life       Conway's cells, a generation every half beat; the kicks drop new ones in
#   flow       dots drifting along a field, faster with the bass; every bar it takes a new shape
#   wheel      the twelve notes round a circle, each spoke as long as it sounds, the key's own doubled
#   blocks     a rectangle cut in two every beat, the new piece lit, until it starts over
#   ripple     two sources of waves, their crests where they meet; on every beat one of them moves
#   bolt       a jagged line down the picture on the backbeat, while snares are heard
#   waterfall  the ten bands as rows going up the picture, two rows every sixteenth
#   dots       a grid of dots as big as the band under them, a wave out from the middle every beat
#   snake      three lines walking the grid a step every sixteenth, turning on the beat
# Without a tempo what goes by the beat goes by the hits, and at 120 bpm's pace where there are none (_tick).
import math
import time

import numpy as np

ROOT = {root!r}
KINDS = {kinds!r}
N = {n!r}
_Y, _X = np.mgrid[0:N, 0:N].astype(np.float32) + 0.5
S = dict(t=None, kind=None, colours=None, read=0.0, rings=[], sparks=np.zeros((0, 5), np.float32), trail=np.zeros((N, N), np.float32),
         caps=np.zeros(10, np.float32), kick=0.0, hat=0.0, count=None, half=None, kicks=0.0, hats=0.0, snares=0.0, own=dict(),
         rng=np.random.default_rng())
MUSIC = ('level', 'bpm', 'beat/phase', 'beat/pulse', 'beat/count', 'beat/conf', 'hit/kick', 'hit/bass', 'hit/snare', 'hit/hat',
         'drive/bass', 'drive/treb', 'high', 'busy', 'clock/bass', 'clock/mid', 'clock/treb', 'section/drop')


def _v(name, default=0.0, raw=False):
    ep = op(ROOT + '/ep')
    return ep.module.v(name, default, raw) if ep is not None else default


def _lit(c):
    # a colour at full light (the layer is light over the picture), white for one too dark to tell
    m = float(c.max())
    return c / m if m > 0.05 else np.ones(3, np.float32)


def _colours():
    # the style's hot colour (palette role 6) and another of its colours, both at full light
    cols = []
    for i in range(8):
        r = _v('palette/%d/r' % i, -1.0)
        if r >= 0:
            cols.append(np.array([r, _v('palette/%d/g' % i), _v('palette/%d/b' % i)], np.float32))
    if not cols:
        return np.ones(3, np.float32), np.array([0.4, 0.8, 1.0], np.float32)
    hot = cols[6] if len(cols) > 6 else max(cols, key=lambda c: float(c.max() - c.min()))
    other = max(cols, key=lambda c: float(np.abs(_lit(c) - _lit(hot)).sum()))
    return _lit(hot), _lit(other)


def _plot(buf, xs, ys, w):
    # light added at cells (xs, ys), w each
    keep = (xs >= 0) & (xs < N) & (ys >= 0) & (ys < N)
    np.add.at(buf, (ys[keep].astype(int), xs[keep].astype(int)), np.broadcast_to(w, xs.shape)[keep])


def _beat(m):
    return 60.0 / m['bpm'] if m['bpm'] > 0 else 0.5


def _locked(m):
    return m['bpm'] > 0 and m['beat/conf'] > 0.15


def _recent(key, x, m, dt):
    # how hard these hits have been lately: a hit is heard a moment after the room hears it, the beat is read ahead, so
    # with a tempo the hits only say how strong, and the beat says when
    S[key] = max(x, S[key] * math.exp(-dt / (2 * _beat(m))))
    return S[key]


def _rings(img, m, dt, size, hot, other):
    kick = max(m['hit/kick'], 0.8 * m['hit/bass'])
    count = int(m['beat/count'])
    strength = _recent('kicks', kick, m, dt)
    if _locked(m):
        if S['count'] is not None and count != S['count']:
            S['rings'].append([0.0, max(0.4, strength)])
    elif _tick('ring', m):
        S['rings'].append([0.0, max(0.5, kick)])
    S['kick'], S['count'] = kick, count
    r = np.hypot(_X - N / 2, _Y - N / 2)
    speed, reach, th = 0.6 * N / max(0.25, _beat(m)), 0.75 * N * size, 1.2 * size
    for ring in S['rings']:
        ring[0] += dt * speed
        a = 1.4 * ring[1] * max(0.0, 1 - ring[0] / reach)
        band = np.clip(1 - np.abs(r - ring[0]) / (th * (1 + ring[1])), 0, 1)
        img += band[..., None] * (hot if ring[1] > 0.6 else other) * a
    S['rings'] = [g for g in S['rings'] if g[0] < reach][-8:]


def _bars(img, m, dt, size, hot, other):
    h = _bands() ** 1.5 * N * 0.6 * size
    S['caps'] = np.maximum(S['caps'] - dt * N * 0.5, h)
    w = N / 20.0
    col = np.minimum(19, (_X[0] / w).astype(int))
    band = np.where(col < 10, 9 - col, col - 10)  # the lows in the middle
    hx, cx = h[band], S['caps'][band]
    gap = (_X[0] % w) < w - 1
    up = np.clip(_Y / np.maximum(hx, 1)[None, :], 0, 1)
    body = ((_Y < hx[None, :]) & gap[None, :]).astype(np.float32) * (0.3 + 0.5 * up)
    cap = ((np.abs(_Y - cx[None, :]) < 0.8) & gap[None, :] & (cx[None, :] > 1)).astype(np.float32)
    img += body[..., None] * (other * (1 - up[..., None]) + hot * up[..., None]) + cap[..., None] * hot


def _trail(dt, tau):
    S['trail'] *= math.exp(-dt / tau)


def _orbit(img, m, dt, size, hot, other):
    _trail(dt, 0.35)
    k = int(8 + 16 * min(1.0, 6 * m['busy'] + m['high']))
    i = np.arange(k, dtype=np.float32)
    ang = m['clock/mid'] * (0.6 + 0.4 * (i % 3)) * np.where(i % 2, -1, 1) + 2 * math.pi * i / k
    rad = N * (0.14 + 0.2 * m['drive/bass']) * size * (1 + 0.25 * np.sin(1.7 * i + m['clock/bass']))
    _plot(S['trail'], N / 2 + rad * np.cos(ang), N / 2 + rad * np.sin(ang), np.float32(0.6 + 0.6 * m['beat/pulse']))
    _shade(img, S['trail'], hot, other)


def _lissajous(img, m, dt, size, hot, other):
    _trail(dt, 0.12)
    root = int(_v('key/root', -1))
    a = 1 + max(0, root) % 3
    b = a + 1 + (max(0, root) // 3) % 3
    s = np.linspace(0, 2 * math.pi, 700, dtype=np.float32)
    amp = N * 0.36 * size * (0.55 + 0.45 * m['level'])
    ph = 0.5 * m['clock/mid']
    _plot(S['trail'], N / 2 + amp * np.sin(a * s + ph), N / 2 + amp * np.sin(b * s), np.float32(0.35 + 0.4 * m['beat/pulse']))
    _shade(img, S['trail'], hot, other)


def _sparks(img, m, dt, size, hot, other):
    hat = max(m['hit/hat'], m['hit/snare'])
    strength = _recent('hats', hat, m, dt)
    half = int(2 * (m['beat/count'] + m['beat/phase'] % 1.0))
    if _locked(m):  # on the off-beats, while there are hats to hear
        burst = S['half'] is not None and half != S['half'] and half % 2 == 1 and strength > 0.3
    else:
        burst = _tick('spark', m)
    S['half'] = half
    if burst:  # somewhere in the upper half
        rng, n = S['rng'], int(14 + 30 * max(hat, strength, 0.4))
        ang, speed = rng.uniform(0, 2 * math.pi, n), rng.uniform(0.3, 0.9, n) * N * size
        x0, y0 = rng.uniform(0.15, 0.85) * N, rng.uniform(0.45, 0.9) * N
        new = np.stack([np.full(n, x0), np.full(n, y0), speed * np.cos(ang), speed * np.sin(ang),
                        rng.uniform(0.5, 1.0, n)], 1).astype(np.float32)
        S['sparks'] = np.concatenate([S['sparks'], new])[-500:]
    S['hat'] = hat
    p = S['sparks']
    p[:, 3] -= dt * N * 1.2  # gravity
    p[:, 0] += dt * p[:, 2]
    p[:, 1] += dt * p[:, 3]
    p[:, 4] -= dt
    S['sparks'] = p = p[p[:, 4] > 0]
    buf = np.zeros((N, N), np.float32)
    _plot(buf, p[:, 0], p[:, 1], np.clip(p[:, 4] * 1.5, 0, 1))
    _plot(buf, p[:, 0] - p[:, 2] * 0.02, p[:, 1] - p[:, 3] * 0.02, np.clip(p[:, 4], 0, 1) * 0.5)
    _shade(img, buf, hot, other)


def _floor(img, m, dt, size, hot, other):
    horizon = N * 0.42
    phase = _beats(m) % 1.0
    below = _Y < horizon
    light = 0.45 + 0.55 * m['beat/pulse']
    for k in range(1, 11):  # a line a beat comes towards you: far ones near the horizon, close ones at the bottom
        z = k - phase
        y = horizon * (1 - 1.5 / (z + 1.5))
        img += (np.clip(1 - np.abs(_Y - y), 0, 1) * below * light * min(1.0, 1.5 / z))[..., None] * hot
    depth = np.maximum(horizon - _Y, 0.5)
    u = (_X - N / 2) / depth * horizon / (N * 0.16 * size)
    lines = np.clip(1 - np.abs(u - np.round(u)) * depth / horizon * N * 0.16 * size, 0, 1) * below
    img += (lines * 0.6 * light * (1 - _Y / horizon))[..., None] * other


def _scope(img, m, dt, size, hot, other):
    b = _bands()
    x = np.arange(N * 4, dtype=np.float32) / 4
    clocks = (m['clock/bass'],) * 3 + (m['clock/mid'],) * 4 + (m['clock/treb'],) * 3
    y = np.zeros_like(x)
    for k in range(10):
        y += b[k] * np.sin(2 * math.pi * (k + 1) * x / N + (1 + k) * clocks[k])
    y = N / 2 + y / 3 * N * 0.3 * size * (0.4 + m['level'])
    buf = np.zeros((N, N), np.float32)
    for d, w in ((0, 0.5), (1, 0.2), (-1, 0.2)):
        _plot(buf, x, y + d, np.float32(w))
    _shade(img, buf, hot, other)


def _tick(key, m, div=1):
    # a step, `div` to the beat as read ahead; without a tempo whenever a hit's envelope jumps, and at 120 bpm's pace
    # if none does, so that nothing stands still in music with no beat to go by
    own = S['own']
    if not _locked(m):
        hit = max(m['hit/kick'], m['hit/bass'], m['hit/snare'], m['hit/hat'])
        jump = hit > own.get(key + '/hit', 0.0) + 0.25
        own[key + '/hit'] = hit
        if jump or S['t'] - own.get(key + '/at', 0.0) > 0.5 / div:
            own[key + '/at'] = S['t']
            return True
        return False
    now = int((m['beat/count'] + m['beat/phase'] % 1.0) * div)
    last = own.get(key + '/step')  # (elements keep their own things in `own` too, under plain names)
    own[key + '/step'] = now
    return last is not None and now != last


def _beats(m, rate=0.7, clock='clock/bass'):
    # beats so far, the fraction being the phase; without a tempo a clock at this rate, so that nothing stops
    return m['beat/count'] + m['beat/phase'] % 1.0 if _locked(m) else rate * m[clock]


def _bands():
    return np.clip(np.array([_v('band/%d' % k) for k in range(10)], np.float32), 0, 1)


def _chroma():
    # the twelve notes from C, the strongest 1
    c = np.array([_v('chroma/%d' % k) for k in range(12)], np.float32)
    return c / max(float(c.max()), 1e-3)


def _ink(buf, xs, ys, w=1.0):
    # light set at cells, not added: a line is as bright however many of its points land on one cell
    xs, ys, w = (a.ravel() for a in np.broadcast_arrays(xs, ys, np.asarray(w, np.float32)))
    keep = (xs >= 0) & (xs < N) & (ys >= 0) & (ys < N)
    np.maximum.at(buf, (ys[keep].astype(np.intp), xs[keep].astype(np.intp)), w[keep])


def _line(buf, x0, y0, x1, y1, w=1.0, n=None):
    # straight lines, one or arrays of them; `n` points along each, or as many as it takes
    x0, y0, x1, y1 = (np.atleast_1d(np.asarray(a, np.float32)) for a in (x0, y0, x1, y1))
    if x0.size:
        n = n or min(200, int(1.5 * max(float(np.abs(x1 - x0).max()), float(np.abs(y1 - y0).max()))) + 2)
        t = np.linspace(0, 1, n, dtype=np.float32)[:, None]
        _ink(buf, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w)


def _shade(img, buf, hot, other):
    # light from a buffer: the brightest in the hot colour, what fades in the other
    t = np.clip(buf, 0, 1)[..., None]
    img += t * (hot * t + other * (1 - t))


def _tunnel(img, m, dt, size, hot, other):
    a = 0.15 * math.sin(0.4 * m['clock/mid'])
    c, s = math.cos(a), math.sin(a)
    x, y = _X - N / 2, _Y - N / 2
    r = np.maximum(np.abs(c * x + s * y), np.abs(c * y - s * x))
    phase = _beats(m) % 1.0
    count = int(m['beat/count'])
    light = 0.45 + 0.55 * m['beat/pulse']
    for k in range(9):
        rad = 2.4 * size * 1.5 ** (k + phase)
        band = np.clip(1 - np.abs(r - rad) / (0.7 + 0.03 * rad), 0, 1)
        img += band[..., None] * (hot if (k - count) % 2 else other) * light * min(1.0, 0.3 + 0.12 * k)


def _rain(img, m, dt, size, hot, other):
    own, rng = S['own'], S['rng']
    _trail(dt, 0.3)
    if 'y' not in own:
        own.update(y=np.full(N, -1.0, np.float32), v=rng.uniform(0.6, 1.4, N).astype(np.float32))
    y = own['y']
    if _tick('rain', m, 2) or not (y > 0).any():
        n = 4 + int(24 * min(1.0, 6 * m['busy'] + m['high']))
        cols = rng.choice(N // 2, n, replace=False) * 2
        y[cols] = N - 1
    on = y > 0
    y[on] -= dt * N * (0.5 + 1.2 * m['drive/treb']) * own['v'][on]
    keep = y > 0
    _plot(S['trail'], np.nonzero(keep)[0].astype(np.float32), y[keep], np.float32(1.0))
    _shade(img, S['trail'], hot, other)


def _life(img, m, dt, size, hot, other):
    own, rng = S['own'], S['rng']
    g = N // 2
    if 'cells' not in own:
        own.update(cells=rng.random((g, g)) < 0.08, age=np.zeros((g, g), np.float32))
    cells = own['cells']
    if _tick('seed', m):  # new ones where they can catch, more of them the harder the kicks
        for _ in range(1 + int(3 * _recent('kicks', m['hit/kick'], m, dt))):
            x, y = rng.integers(0, g - 8, 2)
            cells[y:y + 8, x:x + 8] |= rng.random((8, 8)) < 0.45
    if _tick('life', m, 2):
        n = sum(np.roll(np.roll(cells, a, 0), b, 1).astype(np.uint8) for a in (-1, 0, 1) for b in (-1, 0, 1) if a or b)
        own['cells'] = cells = (n == 3) | (cells & (n == 2))
    own['age'] = np.maximum(own['age'] * math.exp(-dt / 0.35), cells)
    buf = np.zeros((N, N), np.float32)
    buf[:2 * g, :2 * g] = own['age'].repeat(2, 0).repeat(2, 1)
    _shade(img, buf, hot, other)


def _flow(img, m, dt, size, hot, other):
    own, rng = S['own'], S['rng']
    _trail(dt, 0.3)
    if 'p' not in own:
        own.update(p=rng.uniform(0, N, (220, 2)).astype(np.float32), shape=0.0)
    if _tick('flow', m, 0.25):  # a new field every bar
        own['shape'] = float(rng.uniform(0, 6.28))
    p, s = own['p'], own['shape']
    ang = 2.6 * np.sin(p[:, 0] * 0.05 / size + s) + 2.6 * np.cos(p[:, 1] * 0.06 / size - s) + 0.3 * m['clock/mid']
    speed = N * (0.12 + 0.5 * m['drive/bass'])
    p[:, 0] = (p[:, 0] + dt * speed * np.cos(ang)) % N
    p[:, 1] = (p[:, 1] + dt * speed * np.sin(ang)) % N
    _plot(S['trail'], p[:, 0], p[:, 1], np.float32(0.5 + 0.5 * m['beat/pulse']))
    _shade(img, S['trail'], hot, other)


def _wheel(img, m, dt, size, hot, other):
    c = _chroma()
    root = int(_v('key/root', -1))
    ang = 2 * math.pi * np.arange(12, dtype=np.float32) / 12 + 0.15 * m['clock/mid']
    r0 = N * 0.11 * size * (1 + 0.25 * m['beat/pulse'])
    tip = r0 + N * 0.3 * size * c * (0.5 + 0.5 * m['level'])
    t = np.linspace(0, 1, 40, dtype=np.float32)[:, None]
    buf = np.zeros((N, N), np.float32)
    rad = r0 + (tip - r0) * t  # the spokes, as long as each note sounds
    _plot(buf, N / 2 + rad * np.cos(ang), N / 2 + rad * np.sin(ang), np.broadcast_to(0.3 + 0.7 * c, rad.shape))
    nxt = np.roll(tip, -1)  # the ring through their tips
    step = 2 * math.pi / 12
    rim = tip + (nxt - tip) * t
    _plot(buf, N / 2 + rim * np.cos(ang + step * t), N / 2 + rim * np.sin(ang + step * t), np.float32(0.35))
    if root >= 0:  # the key's own note, doubled
        _plot(buf, N / 2 + 1 + rad[:, root] * math.cos(ang[root]), N / 2 + rad[:, root] * math.sin(ang[root]), np.float32(1.0))
    _shade(img, buf, hot, other)


def _blocks(img, m, dt, size, hot, other):
    own, rng = S['own'], S['rng']
    if 'r' not in own:
        own['r'] = [[3, 3, N - 3, N - 3, 0.0]]
    r = own['r']
    if _tick('blocks', m):  # the biggest piece splits in two; when they are small the picture starts over
        big = max(r, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
        x0, y0, x1, y1, _ = big
        w, h = x1 - x0, y1 - y0
        if len(r) >= 20 or max(w, h) < 12:
            r[:] = [[3, 3, N - 3, N - 3, 0.0]]
        else:
            k = float(rng.uniform(0.35, 0.65))
            if w > h:
                c = x0 + int(w * k)
                big[2] = c
                r.append([c, y0, x1, y1, 1.0])
            else:
                c = y0 + int(h * k)
                big[3] = c
                r.append([x0, c, x1, y1, 1.0])
    fade = math.exp(-dt / 0.3)
    light = 0.4 + 0.5 * m['beat/pulse']
    for b in r:
        x0, y0, x1, y1, fill = b
        img[y0:y1, x0:x1] += other * 0.45 * fill
        img[y0, x0:x1] += hot * light
        img[y1 - 1, x0:x1] += hot * light
        img[y0:y1, x0] += hot * light
        img[y0:y1, x1 - 1] += hot * light
        b[4] = fill * fade


def _ripple(img, m, dt, size, hot, other):
    own, rng = S['own'], S['rng']
    if 'at' not in own:
        own['at'] = rng.uniform(0.2 * N, 0.8 * N, (2, 2)).astype(np.float32)
        own['who'] = 0
    if _tick('ripple', m):
        own['who'] = 1 - own['who']
        own['at'][own['who']] = rng.uniform(0.2 * N, 0.8 * N, 2)
    (x1, y1), (x2, y2) = own['at']
    f, t = 0.42 / size, 4 * m['clock/bass']
    w = np.sin(np.hypot(_X - x1, _Y - y1) * f - t) + np.sin(np.hypot(_X - x2, _Y - y2) * f - t)
    _shade(img, np.clip(w - 1.1, 0, 0.9) * (0.7 + 0.6 * m['beat/pulse']) * 1.2, hot, other)


def _bolt(img, m, dt, size, hot, other):
    own, rng = S['own'], S['rng']
    bolts = own.setdefault('bolts', [])
    snare = max(m['hit/snare'], 0.7 * m['hit/hat'])
    strength = _recent('snares', snare, m, dt)
    if _locked(m):  # on the backbeat, while snares are heard
        fire = _tick('bolt', m) and int(m['beat/count']) % 2 == 1 and strength > 0.3
    else:
        fire = _tick('bolt', m, 0.5)
    own['snare'] = snare
    if fire:
        ys = np.arange(N, dtype=np.float32)
        xs = rng.uniform(0.2, 0.8) * N + np.cumsum(rng.normal(0, 1.6 * size, N)).astype(np.float32)
        bolts.append([xs, ys, 0.3, max(strength, snare, 0.5)])
    buf = np.zeros((N, N), np.float32)
    for b in bolts:
        b[2] -= dt
        a = np.float32(b[3] * max(0.0, b[2]) / 0.3 * 1.6)
        _plot(buf, b[0], b[1], a)
        _plot(buf, b[0] + 1, b[1], a * np.float32(0.5))
    own['bolts'] = [b for b in bolts if b[2] > 0][-4:]
    _shade(img, buf, hot, other)


def _waterfall(img, m, dt, size, hot, other):
    own = S['own']
    if 'rows' not in own:
        own.update(rows=np.zeros((N, 10), np.float32), wait=0.0)
    own['wait'] += dt
    if _tick('fall', m, 4) if _locked(m) else own['wait'] > 0.12:  # two rows every sixteenth
        own['wait'] = 0.0
        own['rows'] = np.roll(own['rows'], 2, 0)
        own['rows'][:2] = _bands() ** 1.5
    w = N / 20.0
    col = np.minimum(19, (_X[0] / w).astype(int))
    _shade(img, own['rows'][:, np.where(col < 10, 9 - col, col - 10)], hot, other)


def _dots(img, m, dt, size, hot, other):
    b = _bands()
    step = max(6.0, 10 * size)
    d = np.hypot(_X % step - step / 2, _Y % step - step / 2)
    level = b[np.minimum(9, (_X / N * 10).astype(int))]
    phase = m['beat/phase'] % 1.0
    wave = np.exp(-(np.hypot(_X - N / 2, _Y - N / 2) / (0.7 * N) - phase) ** 2 / 0.02)  # out from the middle, once a beat
    _shade(img, np.clip(step * 0.42 * (0.15 + 0.6 * level + 0.5 * wave) - d + 0.5, 0, 1) * (0.5 + 0.5 * level + 0.4 * wave), hot, other)


def _snake(img, m, dt, size, hot, other):
    own, rng = S['own'], S['rng']
    _trail(dt, 1.2)
    if 'h' not in own:
        own['h'] = [[int(x), int(y), dx, dy] for (x, y), (dx, dy) in
                    zip(rng.integers(N // 4, 3 * N // 4, (3, 2)), ((1, 0), (0, 1), (-1, 0)))]
    turn = _tick('turn', m)
    if _tick('walk', m, 4):
        for h in own['h']:
            if turn and rng.random() < 0.7:  # a quarter turn, on the beat
                side = 1 if rng.random() < 0.5 else -1
                h[2], h[3] = -side * h[3], side * h[2]
            xs, ys = [], []
            for _ in range(max(2, int(3 * size))):
                h[0], h[1] = (h[0] + h[2]) % N, (h[1] + h[3]) % N
                xs.append(h[0])
                ys.append(h[1])
            S['trail'][ys, xs] = 1.0
    _shade(img, S['trail'], hot, other)


def gen(name, *moods, whole=False):
    # an element of a family file (gen/*.py). The moods it suits, 'drop' among them, and `whole` (it covers the frame, so
    # geometric pictures only) are read by the visualizer's Director (teenage_mcp.tdfx) straight from the file
    def add(draw):
        GENS[name] = draw
        return draw
    return add


GENS = dict(rings=_rings, bars=_bars, orbit=_orbit, lissajous=_lissajous, sparks=_sparks, floor=_floor, scope=_scope,
            tunnel=_tunnel, rain=_rain, life=_life, flow=_flow, wheel=_wheel, blocks=_blocks, ripple=_ripple, bolt=_bolt,
            waterfall=_waterfall, dots=_dots, snake=_snake)


def draw(dt):
    # the layer as an N x N x 4 float picture (light, and its alpha)
    kind = KINDS[int(round(_v('fx/gen/kind', raw=True))) % len(KINDS)]  # (eased, it would pass through the ones between)
    if kind != S['kind']:  # another element: it starts from nothing
        S.update(kind=kind, rings=[], sparks=np.zeros((0, 5), np.float32), caps=np.zeros(10, np.float32), own=dict(), colours=None)
        S['trail'][:] = 0
    m = dict((name, _v(name)) for name in MUSIC)
    img = np.zeros((N, N, 3), np.float32)
    now = S['t'] or 0.0
    if S['colours'] is None or now - S['read'] > 0.5:  # (they change with the world, not with the frame)
        S.update(colours=_colours(), read=now)
    hot, other = S['colours']
    GENS[kind](img, m, dt, max(0.3, _v('fx/gen/size', 1.0)), hot, other)
    rgb = np.clip(img, 0, 1)
    space = _v('fx/gen/space')
    comp = op(ROOT)
    busy = comp.fetch('ep_busy', None) if space > 0.01 and comp is not None else None
    if busy is not None:  # the element keeps to the free parts of the picture
        rgb = rgb * (1 - space * busy.repeat(N // 25, 0).repeat(N // 25, 1))[..., None].astype(np.float32)
    return np.concatenate([rgb, rgb.max(axis=2, keepdims=True)], 2)


def onSetupParameters(scriptOp):
    return


def onPulse(par):
    return


def onCook(scriptOp):
    now = time.perf_counter()
    dt = min(0.1, now - S['t']) if S['t'] else 1 / 60
    S['t'] = now
    scriptOp.copyNumpyArray((draw(dt) * 255).astype(np.uint8))
'''

API = '''# ep visual's API for the MCP server (tdfx.TDApi in teenage_mcp): POST /exec runs Python here, GET /frame.jpg
# is the chain's output, GET /ping says who answers. /exec and /frame.jpg want the token stored on the COMP.
import contextlib
import io
import json
import os
import tempfile
import traceback


def _token():
    return str(me.parent().fetch('ep_token', '') or '')


def _reply(response, status, data, ctype='application/json'):
    response['statusCode'] = status
    response['statusReason'] = {200: 'OK', 403: 'Forbidden', 404: 'Not Found'}.get(status, 'Error')
    response['content-type'] = ctype
    response['data'] = data
    return response


def _pars(request):
    pars = dict(request.get('pars') or {})
    uri = str(request.get('uri', ''))
    if '?' in uri:
        for item in uri.split('?', 1)[1].split('&'):
            key, _, val = item.partition('=')
            pars.setdefault(key, val)
    return pars


def _frame(name):
    top = me.parent().op(name)
    if top is None:
        raise ValueError('no TOP %r in %s' % (name, me.parent().path))
    try:
        return bytes(top.saveByteArray('.jpg'))
    except Exception:
        path = os.path.join(tempfile.gettempdir(), 'ep_visual_frame.jpg')
        top.save(path)
        with open(path, 'rb') as f:
            return f.read()


def _network_errors():
    # what is wrong in the network after the code ran, so the caller sees what it broke (or found broken)
    try:
        return str(me.parent().errors(recurse=True) or '')
    except Exception:
        return ''


def _exec(code):
    ns = dict(globals())
    ns.update(ep=me.parent(), result=None)
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            try:
                compiled = compile(code, '<mcp>', 'eval')
            except SyntaxError:
                exec(compile(code, '<mcp>', 'exec'), ns)
                value = ns.get('result')
            else:
                value = eval(compiled, ns)
        if not isinstance(value, (str, int, float, bool, list, dict, type(None))):
            value = repr(value)
        res = {'ok': True, 'result': value, 'stdout': out.getvalue()}
    except Exception:
        res = {'ok': False, 'error': traceback.format_exc(limit=4), 'stdout': out.getvalue()}
    errors = _network_errors()
    if errors:
        res['network_errors'] = errors
    return res


def _stream_clients():
    return list(me.parent().fetch('ep_stream_clients', []) or [])


def onWebSocketOpen(webServerDAT, client, uri):
    return


def onWebSocketClose(webServerDAT, client):
    me.parent().store('ep_stream_clients', [c for c in _stream_clients() if c != client])


def onWebSocketReceiveText(webServerDAT, client, data):
    # a client that shows the token gets `out` pushed to it (the push Execute DAT), others get nothing
    try:
        token = json.loads(data).get('token')
    except Exception:
        token = None
    clients = _stream_clients()
    if token == _token() and client not in clients:
        me.parent().store('ep_stream_clients', clients + [client])


def onWebSocketReceiveBinary(webServerDAT, client, data):
    return


def onHTTPRequest(webServerDAT, request, response):
    path = str(request.get('uri', '')).split('?', 1)[0].rstrip('/')
    try:
        if path.endswith('/ping'):
            return _reply(response, 200, json.dumps({'ok': True, 'app': 'TouchDesigner', 'version': str(app.version),
                                                     'build': str(app.build), 'comp': me.parent().path,
                                                     'api': me.parent().fetch('ep_api_version', 0)}))
        if path.endswith('/frame.jpg'):
            pars = _pars(request)
            if pars.get('token') != _token():
                return _reply(response, 403, '{"error": "token"}')
            return _reply(response, 200, _frame(pars.get('op') or 'out'), 'image/jpeg')
        if path.endswith('/exec'):
            raw = request.get('data') or b''
            if isinstance(raw, (bytes, bytearray)):
                raw = bytes(raw).decode('utf-8', 'replace')
            body = json.loads(raw or '{}')
            if body.get('token') != _token():
                return _reply(response, 403, '{"error": "token"}')
            return _reply(response, 200, json.dumps(_exec(str(body.get('code', ''))), default=str))
        return _reply(response, 404, '{"error": "unknown path"}')
    except Exception:
        return _reply(response, 500, json.dumps({'ok': False, 'error': traceback.format_exc(limit=4)}))
'''


def _world_page(comp):
    """A slider per knob inside the visualizer's worlds, and the Parameter Execute DAT that sends them on."""
    try:
        page = comp.appendCustomPage('World')
    except Exception as exc:  # noqa: BLE001
        _problem(f'no World page on {comp.name}: {exc}')
        return
    for name, (neutral, low, high) in KNOBS.items():
        try:
            made = page.appendFloat(name.capitalize(), label=name)
            p = made[0] if isinstance(made, (list, tuple)) else made
            p.normMin, p.normMax, p.min, p.max = low, high, low, high
            p.clampMin = p.clampMax = True
            p.default = neutral
            p.val = neutral
        except Exception as exc:  # noqa: BLE001
            _problem(f'World page: slider {name}: {exc}')
    for name, label in (('Auto', 'Director decides'), ('Neutral', 'All at rest')):
        try:
            page.appendPulse(name, label=label)
        except Exception as exc:  # noqa: BLE001
            _problem(f'World page: {name}: {exc}')
    # made after the sliders are set, so building fires nothing
    world = _node(comp, parameterexecuteDAT, 'world', (-250, -400), op=comp.path, pars='*', custom=True,
                  builtin=False, valuechange=True, onpulse=True, active=True)
    world.text = WORLD.format(root=comp.path, neutral={k: v[0] for k, v in KNOBS.items()})


def build(parent=None):
    del PROBLEMS[:]
    parent = parent or op('/project1')
    old = parent.op('ep_visual')
    if old is not None:
        old.destroy()
    comp = parent.create(baseCOMP, 'ep_visual')

    module = _node(comp, textDAT, 'ep', (-500, 250))
    module.text = MODULE.format(root=comp.path)
    values = _node(comp, oscinCHOP, 'values', (-500, 0), port=PORT, active=True)
    # the same values smoothed: fast up, slower down, so 30-per-second levels and 4-per-second effect settings glide
    _node(comp, lagCHOP, 'smooth', (-500, 100), inputs=(values,), lagunit=('seconds', 'sec'), lag1=LAG_UP,
          lag2=LAG_DOWN)
    _node(comp, oscinDAT, 'events', (-500, -200), port=PORT + 1, active=True, maxlines=200)
    _node(comp, oscoutDAT, 'control', (-500, -400), address='127.0.0.1', port=PORT + 2, active=True)
    _world_page(comp)

    # the picture: pushed pixels (no browser) or td.html in a Web Render TOP; `source` picks one
    page = urllib.parse.urlsplit(PAGE)
    paper = [255, 255, 255, 255] if PAPER == 'white' else [0, 0, 0, 255]
    frames_cb = _node(comp, textDAT, 'frames_callbacks', (-250, 400))
    frames_cb.text = FRAMES.format(root=comp.path, paper=paper, flip=FLIP)
    tex_cb = _node(comp, textDAT, 'frames_tex_callbacks', (0, 400))
    tex_cb.text = TEX
    _node(comp, websocketDAT, 'frames_in', (-250, 250), netaddress=page.hostname or '127.0.0.1',
          port=page.port or 80, callbacks=frames_cb.path, active=SOURCE == 'websocket')
    tex = _node(comp, scriptTOP, 'frames_tex', (0, 250), callbacks=tex_cb.path)
    web = _node(comp, webrenderTOP, 'canvas', (0, 0), url=f'{PAGE}td.html?paper={PAPER}', outputresolution=('custom',),
                resolutionw=1000, resolutionh=1000, audio=('off',), active=SOURCE == 'webrender')
    src = _node(comp, crossTOP, 'source', (150, 100), inputs=(_big(comp, tex, 'frames_big', (75, 250)), web),
                cross=0 if SOURCE == 'websocket' else 1, **RES)

    v = f"op('{module.path}').module.v"
    for i, (name, make) in enumerate(STAGES):
        x = 300 + 300 * i
        wet = make(comp, src, x, v)
        mix = _node(comp, crossTOP, name, (x, 0), inputs=(src, wet), cross=E(f"{v}('fx/{name}')"), **RES)
        # a Cross TOP cooks both its inputs whatever its mix: a Switch TOP cooks only the one it shows, so what is off is free
        src = _node(comp, switchTOP, f'{name}_on', (x + 120, 0), inputs=(src, mix), index=E(f"1 if {v}('fx/{name}') > 0.001 else 0"))
    x = 300 + 300 * len(STAGES)
    out = _node(comp, nullTOP, 'out', (x, 0), inputs=(src,))

    # where the result can go besides the page: all off until td_route / td_record switch them on
    _node(comp, syphonspoutoutTOP, 'spout_out', (x + 300, 300), inputs=(out,), sendername='ep_visual', active=SPOUT)
    _node(comp, ndioutTOP, 'ndi_out', (x + 300, 150), inputs=(out,), name='ep_visual', active=NDI)
    _node(comp, moviefileoutTOP, 'recorder', (x + 300, 0), inputs=(out,), type=('movie',),
          videocodec=('mjpa', 'mpeg4'), file=os.path.join(os.path.expanduser('~'), 'ep_visual_td.mov'), record=False)
    _node(comp, windowCOMP, 'window', (x + 300, -150), winop=out.path, winw=1000, winh=1000)

    token = secrets.token_hex(16)
    comp.store('ep_token', token)
    comp.store('ep_api_version', API_VERSION)  # the server compares it: an older network wants a rebuild
    callbacks = _node(comp, textDAT, 'api_callbacks', (-500, -800))
    callbacks.text = API
    _node(comp, webserverDAT, 'api', (-500, -650), port=API_PORT, callbacks=callbacks.path, active=True)
    # after every frame: the palette into the tint ramp, and `out` to the stream clients of `api`
    push = _node(comp, executeDAT, 'push', (-250, -650), active=True, frameend=True)
    push.text = PUSH.format(root=comp.path, every=PUSH_EVERY)
    try:
        with open(CONFIG, 'w') as f:
            json.dump({'url': f'http://127.0.0.1:{API_PORT}', 'token': token, 'comp': comp.path}, f)
    except OSError as exc:
        _problem(f'could not write {CONFIG}: {exc}')

    top = op('/')
    if top is not None:  # on pause no frame ends: no picture back to the page, no procedural layer
        top.time.play = True
    try:
        out.cook(force=True)
    except Exception:  # noqa: BLE001
        pass
    for o in comp.children:
        try:
            errors = o.errors()
        except Exception:  # noqa: BLE001
            errors = ''
        if errors:
            _problem(f'{o.name}: {errors}')

    notes = _node(comp, textDAT, 'notes', (-500, 500))
    notes.text = NOTES.format(v=PORT, e=PORT + 1, c=PORT + 2, api=API_PORT) + (
        '\nproblems while building:\n  ' + '\n  '.join(PROBLEMS) if PROBLEMS else '')
    print(f'ep_visual: built {comp.path}: values on {PORT}, events on {PORT + 1}, control to {PORT + 2}, '
          f'api on {API_PORT}, picture from {PAGE} ({SOURCE}), result in {out.path}. '
          + (f'{len(PROBLEMS)} problem(s), listed above and in notes.' if PROBLEMS else 'No problems.'))
    return comp


NOTES = """ep visual <-> TouchDesigner

the picture: source -> displace -> gen -> mirror -> feedback -> rgbsplit -> edge -> blur -> tint -> bloom -> hue -> strobe -> out
  gen is the procedural layer: gen_tex (a Script TOP, gen_callbacks) draws one of its elements (GEN_KINDS, listed at
  the top of gen_callbacks; /ep/fx/gen/kind) from the music in the page's pixel grid and the style's colours; the
  visualizer's Director brings one in now and then on a new part or a drop, for a few bars
  tint looks each pixel's luminance up in tint_ramp, the style's palette dark to light (push keeps tint_keys current)
  smooth: the values through a Lag CHOP; v() reads the effect settings and levels from it, hits and beats raw
  source: frames_tex (pixels pushed to frames_in, cross 0) or canvas (td.html in a Web Render TOP, cross 1)
  each effect is a Cross TOP: 0 = bypassed, its amount comes as /ep/fx/<effect>, its settings as
  /ep/fx/<effect>/<param>, from the visualizer's Director (by mood, style, sections, drops) or the MCP tool td_fx
  out -> spout_out (Spout sender ep_visual), ndi_out (NDI source ep_visual), window (a projector), recorder:
  off until switched on (MCP: td_route, td_record)
  channels: if v() finds nothing, see what the OSC In CHOP named them: op('values').chans()
  World page (ep_visual's custom parameters): the knobs inside the visualizer's worlds; a slider that moves pins its
  knob (/ep/world/<knob>), Auto gives them all back to the visualizer's Director, Neutral pins them at rest. A
  slider can take an expression or an export (an LFO, a CHOP), and the world follows it

values (OSC In CHOP, port {v}), ~30 Hz, one float each; in expressions op('ep').module.v('hit') etc.:
  /ep/level /ep/low /ep/mid /ep/high            loudness, low/mid/high energy 0..1
  /ep/rel/bass /ep/rel/mid /ep/rel/treb         against the track's usual level (1 = usual)
  /ep/drive/bass ... /ep/drive/treb             the same smoothed onto 0..1
  /ep/clock/bass ... /ep/clock/treb             time running faster while the band is loud
  /ep/band/0..9 /ep/chroma/0..11                log bands 40 Hz-14 kHz; pitch classes from C (max = 1)
  /ep/bright /ep/flux /ep/busy /ep/tonal /ep/centroid
  /ep/bpm /ep/beat/phase /ep/beat/pulse /ep/beat/count /ep/beat/conf /ep/bar/phase
  /ep/hit /ep/hit/kick snare hat perc bass keys pad loop fx   envelopes, decay ~0.15 s
  /ep/section/change /ep/section/drop                         1 on a new part / a drop, decay ~1 s
  /ep/mood/valence /ep/mood/arousal /ep/mood/col /ep/mood/row
  /ep/key/root (0..11, -1 none) /ep/key/major
  /ep/scene/index /ep/scene/mix /ep/scene/time /ep/scene/geo /ep/scene/detail /ep/scene/motion /ep/ink /ep/idle
  /ep/groove/budget /ep/noise/room              how much the picture can take, what the Director has left to lay over it
  /ep/palette/0..7/r g b                        the current style's colours 0..1
  /ep/fx/<effect> /ep/fx/<effect>/<param>       the effect settings
  /ep/world/<knob>                              the knobs inside the worlds, as set (speed react size zoom panx
                                                pany turn echo hue sat light)

events (OSC In DAT, port {e}):
  /ep/mood name · /ep/scene key title · /ep/key name · /ep/section change|drop · /ep/beat count bpm
  /ep/hit kind strength · /ep/note who kind pad velocity · /ep/jam state bpm clock
  /ep/track artist title status bpm key

control (OSC Out DAT -> port {c}), e.g. op('control').sendOSC('/ep/art', 'space'):
  /ep/art key|auto · /ep/seed · /ep/next · /ep/drop · /ep/clear
  /ep/pad 1-12 [velocity 0..1] [group A-D] · /ep/group A-D
  /ep/hold /ep/light /ep/grid /ep/label 0|1 (alone: flip) · /ep/res 50|100|125|200 · /ep/fade 2-30
  /ep/world/<knob> value (pins it) · /ep/world/release [knob] · /ep/world/auto 1|0 · /ep/world/preset name

api (WebServer DAT, port {api}) for the MCP server: POST /exec, GET /frame.jpg, GET /ping, and a WebSocket that,
  after {{"token": ...}}, gets `out` as JPEGs from the push Execute DAT
"""

build()
