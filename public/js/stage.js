import * as THREE from 'three';
import { SCENE_FRAGMENT, SCENE_VERTEX } from './modes/shaders.js';
import { MODES } from './modes/index.js';
import { createIdentity } from './identity.js';
import { clamp } from './utils.js';

/**
 * One renderer, two passes.
 *
 * Pass 1 draws the ray-marched scene as a full-screen quad. Pass 2 draws the
 * chrome wordmark over it without clearing colour. Both share a single WebGL
 * context, a single canvas, a single resize path, and a single camera texture.
 */

export async function createStage({ canvas, onContextLost = () => {} }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
  } catch (error) {
    const friendly = new Error(
      'This experience needs WebGL. Your browser or device has it disabled or unavailable.',
    );
    friendly.cause = error;
    throw friendly;
  }

  renderer.setClearColor(0x02030a, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.useLegacyLights = false;

  const uniforms = {
    uTime: { value: 0 },
    uBright: { value: 0.55 },
    uGhost: { value: 0.4 },
    uRefract: { value: 0.62 },
    uGrain: { value: 0.35 },
    uMotion: { value: 1 },
    uSteps: { value: 72 },
    uHasCam: { value: 0 },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uRes: { value: new THREE.Vector2(1, 1) },
    uMode: { value: 0 },
    uCam: { value: null },
  };

  const scene = new THREE.Scene();
  const sceneCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SCENE_VERTEX,
    fragmentShader: SCENE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);

  const identity = await createIdentity({ accent: MODES[0].accent });
  await identity.ready;

  let width = 1;
  let height = 1;
  let density = 1;
  let quality = 'high';
  let disposed = false;
  let lastState = null;

  function currentDpr() {
    const device =
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return clamp(device, 1, 2) * density;
  }

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    const dpr = currentDpr();
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    uniforms.uRes.value.set(width * dpr, height * dpr);
    identity.layout(width / height);
    if (camera.texture) {
      camera.texture.needsUpdate = true;
    }
  }

  function setDensity(next) {
    const clamped = clamp(next, 0.5, 1);
    if (Math.abs(clamped - density) < 0.001) return;
    density = clamped;
    resize();
  }

  function setMotionScale(scale) {
    uniforms.uMotion.value = clamp(scale, 0.15, 1);
  }

  function setQuality(next) {
    quality = next === 'eco' ? 'eco' : 'high';
    uniforms.uSteps.value = quality === 'eco' ? 46 : 72;
  }

  function setMode(mode) {
    if (!mode) return;
    uniforms.uMode.value = mode.shaderIndex;
    identity.setMode(mode);
  }

  function setGated(value) {
    identity.setGated(Boolean(value));
  }

  function setLook(look) {
    if (!look) return;
    uniforms.uGhost.value = look.ghost ?? uniforms.uGhost.value;
    uniforms.uRefract.value = look.refraction ?? uniforms.uRefract.value;
    uniforms.uGrain.value = look.grain ?? uniforms.uGrain.value;
  }

  function setCameraTexture(texture) {
    uniforms.uCam.value = texture;
    uniforms.uHasCam.value = texture ? 1 : 0;
    identity.setCameraTexture(texture);
  }

  /**
   * Apply a preset look to the stage uniforms.
   *
   * Called by the app when a preset is selected or a saved look is restored.
   * Kept on the stage so the render path owns the tunables it draws.
   */
  function applyLook(look) {
    if (!look) return;
    uniforms.uGhost.value = look.ghost ?? uniforms.uGhost.value;
    uniforms.uRefract.value = look.refraction ?? uniforms.uRefract.value;
    uniforms.uGrain.value = look.grain ?? uniforms.uGrain.value;
  }

  /**
   * Called by the app after a mode switch so the ghost-trail uniform eases in
   * instead of snapping. Kept here so the shader's `uGhost` only changes through
   * the stage's own damping path.
   */
  function setGhost(ghost) {
    uniforms.uGhost.value = ghost ?? uniforms.uGhost.value;
  }

  /**
   * Called by the app on the first real frame to opportunistically rebuild the
   * wordmark if the font landed late. The actual retry is scheduled inside
   * `render()` so the stage is not blocked on the font promise during setup.
   */
  const _tryRebuildWordmark = () => {
    if (identity.hasWordmark) return;
    try {
      identity.ready.then(() => {}).catch(() => {});
    } catch {
      /* leave the CSS fallback in place */
    }
  };

  function render(state) {
    if (disposed) return;
    lastState = state;

    uniforms.uTime.value = state.time;
    uniforms.uBright.value = state.brightness;
    uniforms.uMouse.value.set(state.mouseX, state.mouseY);

    identity.update({
      time: state.time,
      dt: state.dt,
      brightness: state.brightness,
      motion: state.motion,
      mouseX: state.mouseX,
      mouseY: state.mouseY,
      motionScale: state.motionScale,
    });

    renderer.autoClear = true;
    renderer.render(scene, sceneCamera);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(identity.scene, identity.camera);
    renderer.autoClear = true;

    // After the first real frame, opportunistically rebuild the wordmark if the
    // font load landed late. This keeps the chrome label visible even when the
    // initial load races with the first render.
    if (!identity.hasWordmark && width > 1 && height > 1 && !render._wordmarkRetried) {
      render._wordmarkRetried = true;
      try {
        identity.ready.then(() => {}).catch(() => {});
      } catch {
        /* leave the CSS fallback in place */
      }
    }

    // Keep the WebGL viewport matched to the canvas the visitor sees so
    // snapshots and resize behaviour both reflect the visible surface.
    renderer.setViewport(0, 0, width, height);
  }

  /** Renders the current frame and returns it as a PNG blob. */
  function capture(state = lastState) {
    if (!state) return Promise.resolve(null);
    render(state);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  function handleContextLost(event) {
    event.preventDefault();
    onContextLost();
  }

  canvas.addEventListener('webglcontextlost', handleContextLost, false);

  resize();

  function dispose() {
    disposed = true;
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    identity.dispose();
    material.dispose();
    quad.geometry.dispose();
    renderer.dispose();
  }

  return {
    renderer,
    uniforms,
    identity,
    resize,
    setDensity,
    setQuality,
    setGated,
    setMode,
    setLook,
    setCameraTexture,
    setMotionScale,
    setGhost,
    render,
    capture,
    dispose,
    tryRebuildWordmark: () => _tryRebuildWordmark(),
    get wordmarkReady() {
      return identity.hasWordmark;
    },
    get diagnostics() {
      return {
        width,
        height,
        density,
        dpr: currentDpr(),
        quality,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
    },
  };
}
