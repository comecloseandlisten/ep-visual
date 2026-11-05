# ep-visual · notes for agents

The README is for people. This file is the technical map.

## Layout

- `index.html`, `style.css`: the page. Plain ES modules, no build, no dependencies. Serve the folder over HTTP.
- `js/main.js`: audio graph, pads, line in, the frame loop, transitions, UI.
- `js/analysis.js`: the `Listener` (bands, attacks, BPM by comb ACF, key) and `Mood` (valence × arousal → mood).
- `js/groove.js`: the part of the track (groove, peak, pit, breakdown, build-up, drop), the visual budget it
  allows, the rhythm template (lock, sync, swing, fills) and the phrase ("squares", 2–16 bars).
- `js/styles.js` → `js/mixer.js`: every family file (`js/<family>.js`) registers its worlds with
  `registerFamily`; `DEFS` holds them all (414 at the time of writing, 41 entries in the **art** menu).
  `geo: true` on a world's def is what allows kaleidoscope/mirror treatments over it.
- `js/light.js`: the light show over the canvas. `js/meaning.js`: themes a track is about → worlds.
- `js/knobs.js`: a world's own parameters (speed, react, size, zoom/pan/turn, echo, hue/sat/light), set by
  `knobs` server events; they glide to their targets.
- `js/profiles.js`: per-world ranks on load, motion, react, pulse, burst. Regenerate with
  `node tools/profile_scenes.mjs` after adding worlds: a world left out counts as middling, and the liveliness
  gate (`liveFit` in `js/groove.js`, against the groove's absolute `drive`) cannot tell it from the others.
- `js/nowplaying.js`, `js/touch.js`, `js/mirror.js`, `js/record.js`, `td.html`: the server-side links below.
- `td/ep_visual_td.py`: the TouchDesigner side, see below.

## TouchDesigner

`td/ep_visual_td.py` runs inside TouchDesigner (Textport: `exec(open(ep_td := r'<path>\ep_visual_td.py').read())`, `ep_td`
telling it where `gen/` is) and
builds `/project1/ep_visual`. The page's pixel grid comes in through a WebSocket DAT and a Script TOP, with
`td.html` in a Web Render TOP as the fallback. It then runs through a chain of Cross TOPs: displace, gen, mirror,
feedback, rgbsplit, edge, blur, tint, bloom, hue, strobe. The result lands in `out`, and from there goes to Spout,
NDI, a window or a movie file.

`gen` is TouchDesigner's own procedural layer: a Script TOP draws elements from the music, in the page's 125 grid and the
style's palette. There are 180: 18 in the setup script and 18 in each family of `td/gen/` (cells, physics, geometry,
signal, demo, nature, tech, op, bio). `td/gen/README.md` is the contract for writing one; each carries its moods and
whether it covers the frame, which is what the Director picks by. The stand it names, `tools/gen_sheet.py`, stays in the
private project: it needs that project's fake TouchDesigner.

The readings arrive as OSC on 7000 (values) and 7001 (events), and control goes back on 7002. A WebServer DAT on
9980 serves `/exec`, `/frame.jpg` and the `out` stream. The `notes` DAT it builds lists every address. What turns
the effects on (`/ep/fx/<effect>`, `/ep/fx/gen/kind`) comes from the server's Director, which picks by mood, style,
sections and drops. Without the server everything stays at 0 unless it is set by hand in TouchDesigner.
`API_VERSION` has to match the server's.

## Content rule

Worlds draw tropes as original silhouettes and sets: no real people, characters, logos, emblems or readable
text from actual works. Keep it that way in new families.

## Optional server

The page works alone (pads, line in, screen-share audio). When a server answers on the same origin it also uses:

| endpoint | what it gives the page |
| --- | --- |
| `GET /api/samples` | sample library `{library_dir, samples: [{folder, name, url, mtime}]}`; folders become kits |
| `GET /api/events` | SSE: jam notes and beat clock, the track the computer plays, `td`/`control`/`knobs`, `record` |
| `GET /api/loopback` | the computer's audio output as a stream |
| `WS /api/frames`, `WS /`, `WS /api/td`, `WS /api/td/stream`, `GET /api/td/frame` | TouchDesigner bridge: `td.html` gets the raw pixel grid from `/api/frames`, TouchDesigner's WebSocket DAT gets it zipped from `/`. A picture back ends in `EP` and the page's frame number, so the page measures the way round and reads the beat ahead by it |
| `POST /api/record/claim`, `POST /api/record/upload` | remote-triggered recording |

Every call fails quietly without the server (two 404s in the console are expected).

## Where it comes from

This repository is a standalone copy of the visualizer in a private project (teenage-mcp). Syncs copy the page,
`js/` and `td/` over as they are, except two local changes that must survive each sync:

- `js/record.js`: when the upload to the server fails, the clip is downloaded as WebM instead.
- `tools/profile_scenes.mjs`: paths point at `js/`, not `src/teenage_mcp/visual/js/`.

`docs/` holds the README art: `banner.svg`, `keys.svg`, `live.svg` and `shots/*.png` (500×500 frames captured
from the page with each world forced from the **art** menu).
