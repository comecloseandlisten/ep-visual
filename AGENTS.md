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
  `node tools/profile_scenes.mjs` after adding worlds.
- `js/nowplaying.js`, `js/touch.js`, `js/mirror.js`, `js/record.js`, `td.html`: the server-side links below.

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
| `WS /api/frames`, `WS /api/td`, `WS /api/td/stream`, `GET /api/td/frame` | TouchDesigner bridge (`td.html` is what TouchDesigner renders) |
| `POST /api/record/claim`, `POST /api/record/upload` | remote-triggered recording |

Every call fails quietly without the server (two 404s in the console are expected).

## Where it comes from

This repository is a standalone copy of the visualizer in a private project (teenage-mcp). Syncs copy the page
and `js/` over as they are, except two local changes that must survive each sync:

- `js/record.js`: when the upload to the server fails, the clip is downloaded as WebM instead.
- `tools/profile_scenes.mjs`: paths point at `js/`, not `src/teenage_mcp/visual/js/`.

`docs/` holds the README art: `banner.svg`, `keys.svg`, `live.svg` and `shots/*.png` (500×500 frames captured
from the page with each world forced from the **art** menu).
