# echo.us — prism mode

A live WebGL art piece by **NotAzie**.

Open the site, allow camera access, and step into a prism / fracture / void scene that is lit by your own reflection. The webcam feed drives the brightness, the ghost trails, and the chrome `echo.us` wordmark floating in the centre.

This repository is the grown platform behind the original single-file sketch: the same light/refraction identity, but now organized as real modules with a camera pipeline, a preset system, and a clean static-site deploy story.

## what it is

An experiment in real-time reflection, refraction, and colour. Three core modes reframe the same webcam-driven scene:

- **Prism** — a hexagonal prism SDF with rainbow relighting and a soft camera overlay.
- **Fracture** — orbiting boxes scattering the same light.
- **Void** — the prism inverted into a hollow shell.

The piece ships with synthesized audio chimes, a custom cursor, scanlines, vignette, and a slow “psych” text layer that fades phrases in and out.

The concept is a dark, reflective surface that only becomes itself once you stand in front of it. Every new feature should extend that idea — more light behaviour, more reflective modes, deeper camera integration — rather than replace it with something unrelated.

## how to run

No build step for the site itself. Any static server works.

```bash
# From the published package folder
python -m http.server 8000 --directory public

# Or from repo root while iterating on the source tree
python -m http.server 8000
```

Then click **allow reflection** when prompted for camera access. Denying camera still leaves a fully working generated scene; the webcam only deepens the light.

## browser support

- WebGL2 preferred; falls back to WebGL1.
- Needs a browser that supports `getUserMedia` for the camera path.
- Three.js and its loaders/fonts are loaded from CDN in-page, so an internet connection is required on first load.

## project structure

```
is-that-shine/
├── README.md
├── LICENSE
├── package.json
├── .gitignore
├── PROJECT_PLAN.md
├── public/
│   ├── index.html
│   ├── manifest.json
│   ├── icons/
│   ├── css/
│   └── js/
│       ├── main.js
│       ├── shell.js
│       ├── camera_pipeline.js
│       ├── modes/
│       │   ├── index.js
│       │   ├── prism.js
│       │   ├── fracture.js
│       │   └── void.js
│       ├── identity.js
│       ├── presets.js
│       └── audio.js
├── src/
│   └── ...source modules used to build public/
├── scripts/
│   └── verify_build.py
└── .github/
    └── workflows/
        └── deploy.yml
```

The source tree is organized around concerns rather than one giant file:

- `shell` — DOM, canvas layering, resize, input, mode UI, HUD, gate state, psych layer, cursor, scanlines/vignette, main loop and frame pacing.
- `camera_pipeline` — camera permission, frame sampling, brightness estimation, ghost buffer, and WebGL texture upload.
- `modes` — prism, fracture, and void as real modules sharing the same lighting/identity layer.
- `identity` — chrome `echo.us` wordmark, reflection lighting model, colour response, psych phrases, and shared visual treatment.
- `presets` — mode + tuning presets with persistence.
- `audio` — synthesized chime/audio behavior.

## preset system

Presets capture the experience you are standing in front of:

- active mode
- brightness response
- colour/refraction response
- composition and timing tuning where applicable

Presets are stored locally in the browser so your preferred look persists across sessions. A small default preset pack ships with the piece.

## performance direction

The piece stays live and responsive first:

- per-frame CPU work is kept low
- texture uploads and expensive environment refreshes are rate-limited
- resize, device orientation, and pointer/touch input are handled deliberately
- frame pacing is explicit in the main loop
- audio and camera subsystems expose `dispose` / `teardown` so the page can release media, audio context, WebGL resources, and animation loops when the piece is torn down or re-initialized
- camera video tracks are stopped explicitly on teardown instead of left running

The original prototype already used a throttled `PMREMGenerator` path for live camera environment lighting. The platform keeps that kind of rate-limited refresh explicit and optional so the experience can scale between a light camera overlay and a heavier live-reflection path depending on device capability.

Reinitialization notes

- The entry module now exposes `run()` and `dispose()`. The page wraps `run()` in a `try/catch` so module load failures are reported on the console instead of failing silently.
- If you call `run()` more than once during a session, call `dispose()` first so audio, camera, WebGL, and animation loops do not leak.

## identity

The piece is `echo.us — prism mode`. The folder name `is-that-shine` is the archive/project slug used to trace provenance; the artefact itself is the echo.us piece.

Any future changes should preserve the light/refraction identity. The reflection is the point.

## deploy

The site is a static artifact and is published to GitHub Pages from this repository.

```bash
# Build the public package
# (for the first pass, this mainly means preparing the public/ tree)

# Deploy
git push
```

See `.github/workflows/deploy.yml` for the publish automation.

## license

See [LICENSE](LICENSE).

## credits

Built by NotAzie as a frontend experiment. WebGL shader, Three.js chrome wordmark, and synthesized audio are all original to the piece.
