# echo.us — prism mode

A single-file WebGL art piece by **NotAzie**.

Open [`index.html`](index.html) in a browser, allow camera access, and step through a live prism / fracture / void scene that is lit by your own reflection. The webcam feed drives the brightness, the ghost trails, and the chrome `echo.us` wordmark floating in the centre.

## what it is

An experiment in real-time reflection, refraction, and colour. Three modes reframe the same webcam-driven scene:

- **Prism** — a hexagonal prism SDF with rainbow relighting and a soft camera overlay.
- **Fracture** — orbiting boxes scattering the same light.
- **Void** — the prism inverted into a hollow shell.

The piece ships its own synthesist audio chimes, a custom cursor, scanlines, vignette, and a slow "psych" text layer that fades phrases in and out.

## how to run

No build step. Any static server works.

```bash
# Python
python -m http.server 8000

# Node
npx serve .

# Or just double-click index.html in most browsers
```

Then click **allow reflection** when prompted for camera access. Denying camera still leaves a fully working generated scene; the webcam only deepens the light.

## browser support

- WebGL2 preferred; falls back to WebGL1.
- Needs a browser that supports `getUserMedia` for the camera path.
- Three.js r128 and its examples are loaded from CDN in-page, so an internet connection is required on first load.

## why the folder was called "Is that shine"

The original working title was a mood, not a name. The piece itself always answered with the same phrase: **echo.us — prism mode**. This repository keeps the archive name as its project slug so the provenance is traceable, but the artefact inside is the echo.us piece.

## identity

The concept is a dark, reflective surface that only becomes itself once you stand in front of it. Any future changes should extend that idea — more light behaviour, more reflective modes, deeper camera integration — rather than replace it with something else.

## license

See [LICENSE](LICENSE).

## credits

Built by NotAzie as a frontend experiment. WebGL shader, Three.js chrome wordmark, and synthesized audio are all original to the file.
