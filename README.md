# ep·visual

A browser page that listens to music, reads its mood and paints it as generative pixel art on a white
1000×1000 canvas. Plain ES modules, no build step, no dependencies.

Born as the visualizer of a set of tools for Teenage Engineering EP samplers, so it is laid out like one: a
3×4 pad grid in four groups (A–D), keys like the EP's keypad. Not affiliated with teenage engineering.

## Run

The page uses ES modules, so serve the folder over HTTP instead of opening the file:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. Any static server works.

## What it hears

- **Pads.** Drop an audio file on a pad (or anywhere on the page) and play it with the mouse, the keys
  `1 2 3 / Q W E / A S D / Z X C` or the numeric keypad.
- **line in.** Listens to an audio input: a sampler through a sound card, a mixer, a microphone. A stereo pair
  of a multichannel interface can be picked.
- **spotify.** Listens to whatever the computer plays: a Stereo Mix / loopback input, or the system audio
  shared from the browser's screen-share dialog.

From that it reads loudness, spectrum bands, brightness, attacks and their rate, BPM and key, and places the
moment on a valence × arousal map. The mood picks the art.

## What it paints

Worlds come in families (`js/*.js`, registered in `js/styles.js` through `js/mixer.js`): classic art
movements, flat poster stories (`te.js` + `story.js`), retro screens, 32-bit console 3D, anime, cinema, pop
art, fairy tales, crime pictures, shooters, medieval, Bangkok, surreal, off-road and more. Every family draws
tropes as original silhouettes and sets: no real people, characters, logos or readable text from actual works.

On top of the mood the page follows the groove (`js/groove.js`): it tells the groove, peaks, pits, breakdowns,
build-ups and drops apart, finds the phrase length (2–16 bars) and decides how much visual load the music can
take right now: how many hits reach the canvas, which treatments and transitions the mix may use, how loud the
light show is. A drop starts a fresh picture over the whole canvas.

`ctrl+s` saves the canvas as PNG; **rec** records it with its sound and downloads the clip as WebM.

## Optional server

The page also talks to a local server when there is one and quietly does without it otherwise:

| endpoint | what it gives the page |
| --- | --- |
| `GET /api/samples` | a sample library: `{library_dir, samples: [{folder, name, url, mtime}]}`; folders become kits |
| `GET /api/events` | Server-Sent Events: pad notes and beat clock of a jam, the track playing on the computer, recording commands |
| `GET /api/loopback` | the computer's audio output as a stream |
| `WS /api/frames`, `WS /api/td`, `/api/td/frame` | a TouchDesigner bridge (`td.html` is the page TouchDesigner renders) |
| `/api/record/claim`, `/api/record/upload` | remote-triggered recording |

That server is not part of this repository.

## World profiles

`js/profiles.js` ranks every world on load, motion, reaction, pulse and burst so the page can match a world
to what the music does. Regenerate it after adding worlds:

```bash
node tools/profile_scenes.mjs
```

## License

MIT, see [LICENSE](LICENSE).
