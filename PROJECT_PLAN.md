# echo.us — Prism Mode: Platform Growth Plan

## Objective

Grow the single-file WebGL sketch at `index.html` into a **coherent interactive experience**:
- multiple real render modes as modules with shared lighting/identity code
- a clean `camera_pipeline` abstraction so webcam input is sampled, processed, and consumed safely
- a preset system with persistence
- render-path and performance cleanup
- a small build/deploy story for the static-site artifact

This is **not** about preserving the existing monolithic file. It is about reconstructing the intended experience — light, reflection, live camera, prism-like refraction — in a way that is modular, maintainable, and extensible.

## Current seed

- Single artifact: `index.html`, plus a near-identical `echo.html`.
- Identity: `echo.us — prism mode`, dark reflective surface that becomes itself once you stand in front of it.
- Three seed modes: **Prism**, **Fracture**, **Void**.
- Live camera drives brightness, ghost trails, and the chrome `echo.us` wordmark.
- Third-party deps loaded from CDN: Three.js r128 + FontLoader + TextGeometry + a font file.
- Custom cursor, scanlines, vignette, psych text layer, synthesized chimes.
- No build step today; intended to run from a static server / GitHub Pages.

## What I infer is missing or implied

1. **Modes are string-switches inside one shader and one render loop.** To become “multiple modes as real modules,” each mode should own its SDF/pass/lighting behavior, with a common compose/UI/identity layer.
2. **Camera handling is embedded in the loop.** A dedicated `camera_pipeline` module should own:
   - permission gating
   - frame sampling
   - brightness estimation
   - ghost/trail buffer management
   - optional downscale processing
   - a stable texture upload path for WebGL
3. **There is no preset/states story.** A platform should let users save/recall modes, brightness response, color response, and composition parameters.
4. **Performance hygiene is implicit, not engineered.** Frame timing, resize handling, GPU upload frequency, and expensive operations like live PMREM generation should be explicit and budgeted.
5. **There is no deploy automation.** The project has a GitHub Pages URL already referenced in the README, so the build/deploy story should match that reality.

## Target architecture

### 1. Platform shell
- Owns DOM, canvas layering, resize, input, mode switching UI, HUD, gate/entry state, psych layer, cursor, scanlines/vignette.
- Owns the top-level render loop and frame budget policy.
- Does not own shader math or mode behavior directly.

### 2. Camera pipeline
- Abstracts `getUserMedia`, video element, offscreen canvas sampling, brightness estimation, ghost buffer, and WebGL texture upload.
- Exposes: `isReady`, `sample()`, `brightness`, `ghost`, and a stable texture handle.
- Supports offline/no-camera path so the experience still works.

### 3. Mode modules
Each mode is a module that can express:
- scene function / SDF / geometry behavior
- lighting/color response in the shared style of the piece
- optional overhead notes for performance

Likely first modules:
- **Prism** — hexagonal prism SDF with rainbow relighting + camera overlay
- **Fracture** — orbiting box scatter
- **Void** — prism inverted into hollow shell

A future module may include a **mirror/reflection pass** driven directly by camera data, which better matches the “your reflection” identity than the current indirect lighting approach.

### 4. Shared identity layer
- Chrome wordmark (`echo.us`)
- Reflection lighting model
- Color response, vignette, scanlines, psych phrases
- Shared uniforms/state where possible

### 5. Preset system
- JSON presets describing mode + tuning parameters
- persistence via `localStorage` first; IndexedDB only if asset/preset volume grows
- a small default preset pack

### 6. Tooling/ops
- Dev server workflow
- static build verification
- GitHub Pages deploy workflow
- a README that matches the grown project

## Render-path and performance direction

Key constraints and improvements to engineer:
- Live `PMREMGenerator` work every few frames is heavy for a camera-driven piece; the architecture should make environment refresh **explicit and rate-limited**, and should support lighter-weight reflection strategies for camera lighting when full prefiltered env maps are not necessary.
- Keep per-frame CPU work low: avoid allocating arrays/textures every frame; upload textures at controlled rates.
- Make resizing, device orientation, and pointer/touch input robust rather than ad hoc.
- Preserve frame pacing discipline in the main loop.

## Build/deploy story

Because the artifact is static, the natural platform story is:
- local dev via static server
- automated publish to GitHub Pages from the repo
- a clean verification step that the built artifact actually loads and runs

A lightweight GitHub Actions workflow publishing the static site is the obvious fit here, since the README already points at a GitHub Pages URL.

## First implementation stages

1. Define repo module layout and split concerns out of the monolithic file without losing the experience.
2. Build `camera_pipeline` as its own module.
3. Implement the shared shell + shared identity layer.
4. Port prism/fracture/void as modules on top of the shared layer.
5. Add preset system + default presets.
6. Perform render-path/performance cleanup.
7. Add deploy workflow and update README/docs.
8. Smoke-test the live experience from a served copy.

## Verification approach

The same verification discipline used for the Isra Wires site should apply here:
- serve the artifact
- load it
- confirm key subsystems initialize
- confirm camera-gated UI state transitions
- confirm mode switching
- confirm there are no obvious console failures in the normal path
- confirm preset persistence round-trips

## Out of scope for the first pass

- Full production build system if the target remains static HTML/JS.
- Mobile native apps.
- Backend services.
- Anything that would break the core identity: light/reflection, live camera as illumination, `echo.us` as the reflective wordmark.

## Risks to watch

- Over-engineering a simple art piece into something heavyweight. The platform should stay light and deliberate.
- Introducing module boundaries that are too granular too early. Start with clear concern separation first, then refine.
- Losing the mood/identity while adding structure. The piece should still feel like echo.us.

## Immediate next action

Inspect the existing code more deeply for exact behavior boundaries, then implement the shell + camera_pipeline + mode modules as the first concrete deliverables.
