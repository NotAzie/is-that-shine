# Engineering audit — echo.us (`is-that-shine`)

**Audited revision:** `91e2dfd` — *Release: modular echo.us platform, camera pipeline, presets, deploy automation*
**Audit date:** 2026-10-20

This audit treats the current repository as version 0: a working idea captured in code, not a finished
product. It records what the project is, what it does well, what is broken, and the order in which the
foundations should be rebuilt.

---

## 1. What the project is

`echo.us` is a camera-reactive WebGL art piece. A visitor opens the page, grants camera access, and stands
in front of a dark refractive scene: a hexagonal prism, a scatter of shards, or a hollow shell, lit by the
webcam feed, with a chrome `echo.us` wordmark floating in front of it. Sound, a custom cursor, scanlines,
and a slow layer of italic phrases complete the mood.

The repository began as a single `index.html` sketch. A later commit split the sketch into a `public/`
package with modules for the shell, camera pipeline, render modes, presets, identity, and audio, and added a
GitHub Pages workflow. The monolith is still in the tree at `index.html` alongside the modular build, which
means there are two competing entry points and no single source of truth.

The concept is strong and specific. The implementation has not caught up with it.

---

## 2. Architecture as found

```
index.html                     legacy single-file sketch (775 lines, duplicated)
public/
  index.html                   shipped entry point, styles inline (~240 lines)
  js/main.js                   dependency wiring
  js/shell.js                  DOM, two canvases, THREE setup, input, UI, render loop
  js/camera_pipeline.js        getUserMedia, 2D sampling, brightness, ghost buffer
  js/identity.js               chrome wordmark, PMREM environments, lights
  js/modes/{index,prism,fracture,void,shared_shader}.js
  js/presets.js                default presets + localStorage
  js/audio.js                  ambient tones + chime
  manifest.json                PWA manifest
  icons/icon-512.png           brand icon
scripts/verify_build.py        string-matching "build verification"
scripts/smoke_test.py          HTTP smoke test
.github/workflows/deploy.yml   verify + publish public/ to Pages
```

Rendering is split across two independently created WebGL contexts on two stacked canvases:

1. a hand-written GLSL fragment shader drawing the ray-marched scene on `#prism-canvas`;
2. a Three.js `WebGLRenderer` drawing the chrome wordmark on `#three-canvas`.

`shell.js` owns both, the render loop, the mode UI, and the entry gate. `identity.js` is given the Three.js
renderer and scene by the shell and asked to build into it. `camera_pipeline.js` samples the video into an
offscreen 2D canvas but never uploads it anywhere.

---

## 3. Verified defects

Each item below was reproduced against the checked-out revision, not inferred.

### 3.1 The ray-marched scene never renders — **critical**

`modes/index.js` creates a mode instance only inside `select(mode)`. On boot, `identity.setMode('prism')`
returns early because `'prism'` is already the default, so `onModeChange` — and therefore `modes.select` —
never fires. The shell then asks for `modes.get('prism')`, receives `null`, and skips rendering. The canvas
is allocated but never drawn to; a pixel readback returns `[0, 0, 0, 0]`.

**Root cause:** rendering state is derived from UI callbacks instead of being initialized deterministically.

### 3.2 The camera button can never succeed — **critical**

`DOM.allowBtn`'s handler in `shell.js:165` calls `cameraPipeline.requestAccess()`, but `cameraPipeline` is
not in the closure scope of `createShell`; it only exists as a parameter of `start()`. Clicking the button
throws a `ReferenceError`, which is swallowed by the surrounding `try/catch`, whose only response is to set
the gate title to "reflection denied". The user is told they denied a permission they were never asked for.

### 3.3 The webcam never reaches the GPU — **critical**

The legacy monolith uploaded the sampled frame with `texImage2D` every frame. The modular `camera_pipeline`
kept the offscreen canvas but the upload step was dropped, and no module ever binds a texture for `uCam`.
Even with 3.1 and 3.2 fixed, the central promise of the piece — the scene lit by your reflection — would be
black.

### 3.4 The entry gate cannot be passed without a camera — **high**

The gate only hides when the camera pipeline reports ready. Declining the permission leaves the visitor
permanently stuck on the gate with a single button and no explanation, even though the shader is designed to
run without camera input.

### 3.5 A denied camera state is indistinguishable from a broken app — **high**

There is no status surface, no retry, and no explanation of what the camera is used for. The only feedback is
the gate title changing to "reflection denied".

### 3.6 Rendering bypasses the documented module boundaries — **medium**

`fracture.js` and `void.js` are copy-pasted clones of `prism.js`, each with their own `prismRender`, each
re-creating the program through a `_echoPrism` expando pinned onto the canvas element. `modes/index.js`
imports `shared_shader.js` for side effects it does not have. `mode.select` instantiates a program but the
render path may instantiate a second one through the canvas expando.

### 3.7 Presets are not actually a preset system — **medium**

`presets.js` stores mode, brightness, `colorResponse`, and `ghost`, but `identity.apply()` only reads
`mode`; nothing reads the other fields. `setActive()` writes `activeId` twice, the first time with the stale
value. `setActiveMode()` mutates a stored preset instead of the live look, and creates an "Auto" preset with
`Date.now()` whenever the user switches modes, so simply clicking through modes permanently litters storage.
There is no UI to choose, save, or delete a preset.

### 3.8 The chrome wordmark does not scale — **high (visual)**

The wordmark is a fixed-size 3D mesh (`size: 0.70`) under a fixed 42° perspective camera. At 440 px wide it
overflows the viewport by more than 3×, and the gate typography sits on top of the letterforms. The visual
identity only works at desktop widths.

### 3.9 The page is not accessible — **high**

- `cursor: none` is applied globally; there is no keyboard-operable custom cursor and no focus styling.
- Mode buttons are `<button>` elements but expose no pressed state (`aria-pressed`), no group role, and no
  keyboard shortcuts.
- The canvas has no accessible name or fallback content; `<noscript>` is absent.
- The decorative phrase layer is exposed to assistive technology.
- `prefers-reduced-motion` is ignored, including for the perpetual floating, drifting, blinking, and
  scanline motion.
- Buttons use `cursor: none` and hover-only affordances, and the ripple effect follows every click.

### 3.10 Camera privacy is undocumented — **medium**

The camera feed is processed locally and never transmitted, but nothing in the UI or README says so. For a
piece whose core mechanic is "turn on your camera", that is the single most important trust statement.

### 3.11 Dependencies are loaded from three third-party origins — **medium**

Three.js comes from cdnjs, the typeface from jsDelivr, and both fonts from Google Fonts. The site cannot run
offline, silently breaks if any CDN changes, leaks visitor IPs to three origins, and ships no integrity
attributes. The typeface URL pins `three@0.128.0` while the runtime is `r128`, which is only coincidentally
compatible.

### 3.12 "Verification" verifies strings, not behaviour — **high**

`verify_build.py` greps source files for expected substrings. It passes on a build that renders nothing.
`smoke_test.py` only fetches files over HTTP. The deploy workflow runs the string check and publishes
immediately. There are no unit tests and no browser test.

### 3.13 The deployment gate is broken — **high**

`verify_build.py` requires `public/icons/icon-192.png`, but `.gitignore` contains
`public/icons/icon-192.png` and the file is not in the repository. On a clean CI checkout the build job fails,
so either Pages has not deployed since the workflow landed or the published artifact is stale.

### 3.14 Documentation does not match the repository — **medium**

The README's structure diagram lists `public/css/` and `src/`, neither of which exists, claims loaders are
loaded in-page when the modular entry point loads none, and describes a preset system that is not reachable
from the UI. `FINAL_ENGINEERING_REPORT.md` reports a completion and a clean remote that the working tree does
not support, and `chg.md` is a one-paragraph note calling the project a "small prototype" that "needs work".
Three overlapping planning documents compete with the README.

### 3.15 Developer experience is thin — **medium**

Running the site requires Python; `package.json` only shells out to Python; there is no dev server with
correct MIME types and no cache headers, no lint/format configuration, no test runner, and no way to check
the build without starting a server by hand. The legacy monolith at the repository root is served instead of
the real site by the documented `python -m http.server` command.

---

## 4. Strengths worth preserving

- **A real point of view.** Light, reflection, refraction, and the visitor's own image are the product. The
  shader and the copy agree with each other.
- **The shader is good.** Ray-marched SDF prism, chromatic refraction of the camera feed, rainbow relighting,
  film grain, and a vignette — in a single full-screen pass with no assets.
- **The camera path is local-only** by construction: `getUserMedia` → 2D canvas → texture. There is no network
  code to remove.
- **The modular split is the right instinct**, even where the implementation leaks: camera, modes, identity,
  presets, audio, and shell are genuinely different concerns.
- **The aesthetic** — Cormorant Garamond italics, wide-tracked Space Mono, near-black blue, cyan glass — is
  coherent and unusual. It should be sharpened, not replaced.

---

## 5. Target state

**One renderer, one loop, one source of truth.**

- A single `WebGLRenderer` with two passes: the full-screen SDF scene, then the chrome wordmark composited on
  top. One canvas, one context, one resize path, one place where the camera texture is bound.
- Modes become **data**, not duplicated render functions: a registry of SDF/palette/tuning descriptors consumed
  by one shared pass.
- The camera pipeline owns permission, sampling, auto-exposure, and a `CanvasTexture`; the stage owns GPU
  upload. Status is an explicit state machine (`idle → requesting → live | denied | unsupported | error`).
- The entry gate always has a way forward, states what the camera is for, and never lies about denial.
- Presets are validated data with a visible, keyboard-accessible library; custom looks are explicit saves, not
  side effects of mode switching.
- The wordmark scales with the viewport; the composition works from 320 px to ultrawide.
- Every asset is local. The site runs offline and makes no third-party requests.
- Verification means: asset graph integrity, unit tests for pure logic, a browser smoke test, and a CI job that
  runs all of it before publishing.

## 6. Delivery phases

| Phase | Scope |
| --- | --- |
| 0 — Audit | This document; remove stale release scaffolding. |
| 1 — Foundation | Vendor Three.js, fonts, and typeface; single-stage renderer; working camera texture; deterministic mode boot; responsive wordmark. |
| 2 — Experience | Entry flow with fallback and status; preset library; snapshot capture; fullscreen; keyboard, touch, and pointer input. |
| 3 — Accessibility | Semantic controls, focus management, live status, reduced motion, cursor policy, privacy copy. |
| 4 — Performance | Adaptive resolution, frame budget, throttled uploads, visibility handling. |
| 5 — Quality | Unit tests, asset integrity checks, browser smoke test, CI. |
| 6 — Release | Documentation, changelog, versioning, deployment verification. |

## 7. Non-goals

- A bundler or framework. The piece is small, static, and dependency-free at runtime; native ES modules and an
  import map are enough.
- Backend services, accounts, or analytics. Everything the visitor does stays on the device.
- Replacing the visual identity. Every change must make the reflection more convincing, not swap the concept.
