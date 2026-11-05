# The procedural layer's families

Each `*.py` here is a family of elements TouchDesigner draws itself from the music. The setup script appends their text to
`gen_callbacks` (see `GEN` in `../ep_visual_td.py`), so a family has no imports: `np`, `math` and the helpers below are in
scope, and everything shares one namespace. Private helpers carry the family's prefix.

```python
@gen('cell_rule30', 'mysterious', 'focused', 'drop', whole=False)
def _cell_rule30(img, m, dt, size, hot, other):
    ...
```

- The name is unique and starts with the family's prefix. The strings after it are the moods it suits: `melancholic calm
  dreamy mysterious focused happy aggressive tense euphoric`, and `drop` if it fits a drop. `whole=True` means it covers the
  frame: the Director then keeps it to geometric pictures.
- `img` is N x N x 3 float32 (N = 125, the page's cells), to add light to, black at the start of every frame. Row 0 is the
  bottom. Anything over 1 clips. `hot` and `other` are two colours of the world on the canvas at full light (float32 x 3).
- `size` is 0.5..2, how big the element is drawn; `dt` the seconds since the last frame.
- `m` holds, as floats: `level high busy bpm beat/phase beat/pulse beat/count beat/conf hit/kick hit/bass hit/snare hit/hat
  drive/bass drive/treb clock/bass clock/mid clock/treb section/drop`. The clocks are seconds that run faster while their
  band is loud: use them for motion. `_v(name, default)` reads anything else the page sends: `drive/mid bright flux tonal
  key/root key/major mood/valence mood/arousal bar/phase chroma/0..11 band/0..9`.

Helpers:

- `_tick(key, m, div=1)`: True on each step, `div` to the beat. **What happens on the beat goes through this**, or reads
  `beat/phase`: the beat is read ahead of the sound, while a hit reaches here late. It also keeps time without a tempo.
- `_locked(m)`: there is a tempo to go by. `_beat(m)`: the beat in seconds.
- `_recent(key, x, m, dt)`: how strong these hits have been lately; `key` is one of `kicks hats snares`.
- `_beats(m, rate=0.7, clock='clock/bass')`: beats so far as one running number, the fraction being the phase; without a
  tempo that clock at that rate, so that nothing stops.
- `_bands()`: the ten bands, 0..1. `_chroma()`: the twelve notes from C, the strongest 1.
- `_plot(buf, xs, ys, w)`: add `w` at cells of an N x N buffer, out of range is skipped. `_ink(buf, xs, ys, w)`: the same,
  each cell keeping the brightest that fell on it, so a line stays even. `_line(buf, x0, y0, x1, y1, w)`: straight lines,
  one or arrays of them, with `_ink`.
- `_shade(img, buf, hot, other)`: an N x N buffer as light, brightest in `hot`. `_trail(dt, tau)` fades `S['trail']`, an N x N
  buffer for trails, cleared when the element changes.
- `S['own']`: a dict for the element's state, empty each time it comes in. `S['rng']`: numpy's generator. `S['t']`: the
  time now. `_X`, `_Y`: N x N cell coordinates, 0.5 .. N - 0.5.

Rules:

- Every element is its own idea, with its own way of answering the music, not a variation of another.
- Original tropes only: no real people, characters, logos, readable text, nor a recreation of an actual game.
- No full-frame flashes: light moves or grows, and a flash of the whole frame comes at most 3 times a second.
- It goes on moving in music with neither tempo nor hits, and costs under 4 ms a frame: vectorise, no Python loops over cells.
- `python tools/gen_sheet.py <family> sheet.png` runs these checks and draws a contact sheet.
- `weights.json` ranks every element by how much of a picture it takes up, 0..1, for the Director's noise budget. After
  adding elements, `python tools/gen_sheet.py weights` writes it again.
