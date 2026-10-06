import { MODES, defaultLook, getMode } from './modes/index.js';
import { createStage } from './stage.js';
import { createCamera } from './camera.js';
import { createAudio } from './audio.js';
import { createPresets, lookForMode, STORAGE_KEYS } from './presets.js';
import { createShell, prefersReducedMotion, showFatal } from './shell.js';
import { storage } from './storage.js';
import { clamp01, damp } from './utils.js';

const PHRASES = [
  'you are the light.',
  'this is not reflection.',
  'you pass through.',
  'identity is refraction.',
  'only light has no shadow here.',
  'you were always inside.',
  'the prism remembers your face.',
];

const CAMERA_FRIENDLY = {
  denied: 'camera blocked — the scene keeps its own light',
  unsupported: 'no camera here — the scene keeps its own light',
  error: 'camera interrupted — the scene keeps its own light',
  idle: 'camera off',
};

const TARGET_FRAME_MS = 16.6;
const ADAPT_INTERVAL_MS = 2600;

export async function createApp() {
  const params = new URLSearchParams(window.location.search);
  const debug = params.has('debug');
  const forcedQuality = params.get('quality');
  const canvas = document.getElementById('stage');
  const video = document.getElementById('camera');

  if (!canvas || !video) throw new Error('The page markup is incomplete.');

  const presets = createPresets({ storage });
  const soundPreference = storage.get(STORAGE_KEYS.sound);
  const audio = createAudio({ enabled: soundPreference !== '0' });

  const state = {
    started: false,
    time: 0,
    dt: 0,
    mouseX: 0,
    mouseY: 0,
    targetX: 0,
    targetY: 0,
    brightness: 0.4,
    motion: 0,
    look: presets.lastLook,
    cameraStatus: 'idle',
    reducedMotion: prefersReducedMotion(),
    density: 1,
    fps: 60,
  };

  try {
    state.look = resolveInitialLook();
  } catch {
    state.look = lookForMode(MODES[0].id);
  }

  const camera = createCamera({
    video,
    onStatus: ({ status }) => {
      state.cameraStatus = status;
      if (!state.started) {
        if (status === 'denied') {
          shell.setGateBusy(false);
          shell.setGateMessage('reflection denied — you can still enter without it.', 'warn');
        } else if (status === 'unsupported' || status === 'error') {
          shell.setGateBusy(false);
          shell.setGateMessage('no camera available — you can enter without it.', 'warn');
        }
        return;
      }
      refreshStatus();
    },
  });

  let stage;
  try {
    stage = await createStage({
      canvas,
      onContextLost: () => {
        showFatal('The graphics context was lost. Reload to step back into the light.');
      },
    });
  } catch (error) {
    showFatal(error?.message || 'WebGL is unavailable, so the scene cannot start.');
    throw error;
  }

  if (!stage.wordmarkReady) {
    document.getElementById('wordmark-fallback')?.removeAttribute('hidden');
  }

  const shell = createShell({
    modes: MODES,
    callbacks: {
      onEnterCamera: () => enterExperience(true),
      onEnterWithoutCamera: () => enterExperience(false),
      onSelectMode: selectMode,
      onSelectPreset: applyPreset,
      onSaveLook: saveLook,
      onRemoveLook: removeLook,
      onAction: handleAction,
      onPointerMove: ({ nx, ny }) => {
        state.targetX = nx;
        state.targetY = ny;
      },
    },
  });

  if (forcedQuality === 'eco') stage.setQuality('eco');
  if (forcedQuality === 'high') stage.setQuality('high');

  applyLook(state.look, presets.activeId, { persist: false });
  shell.setReducedMotion(state.reducedMotion);
  shell.setSound(audio.enabled);
  shell.setFullscreen(Boolean(document.fullscreenElement));
  shell.setCameraPressed(false);
  shell.setStatus({ camera: 'idle' });

  if (debug) stage.setQuality('high');

  // ── look management ───────────────────────────────────────────
  function resolveInitialLook() {
    const requestedMode = params.get('mode');
    if (requestedMode && getMode(requestedMode)) return defaultLook(requestedMode);
    const requestedPreset = params.get('look');
    if (requestedPreset) {
      const preset = presets.find(requestedPreset);
      if (preset) {
        presets.activate(preset.id);
        return presets.lastLook;
      }
    }
    const active = presets.active();
    return active ? { ...active } : presets.lastLook;
  }

  function applyLook(look, activeId, { persist = true } = {}) {
    const mode = getMode(look.mode) ?? MODES[0];
    state.look = { ...look, mode: mode.id };
    stage.setLook(state.look);
    stage.setMode(mode);
    shell.setMode(mode.id);
    shell.renderPresets(presets.all(), activeId ?? null, presets.isCustom);
    if (persist) presets.rememberLook(state.look);
  }

  function selectMode(modeId) {
    if (!getMode(modeId) || modeId === state.look.mode) return;
    const next = { ...state.look, mode: modeId };
    applyLook(next, null);
    audio.chime(modeId);
  }

  function applyPreset(id) {
    const preset = presets.activate(id);
    if (!preset) return;
    applyLook(preset, preset.id, { persist: false });
    presets.rememberLook(state.look);
    audio.chime(preset.mode);
    shell.toast(preset.name);
  }

  function cyclePreset(direction = 1) {
    const all = presets.all();
    if (!all.length) return;
    const index = all.findIndex((preset) => preset.id === presets.activeId);
    const next = all[(index + direction + all.length) % all.length];
    applyPreset(next.id);
  }

  function saveLook() {
    const { preset, created } = presets.saveLook(state.look);
    shell.renderPresets(presets.all(), preset.id, presets.isCustom);
    shell.toast(created ? `saved “${preset.name}”` : 'that look is already saved');
  }

  function removeLook(id) {
    if (!presets.remove(id)) return;
    if (presets.activeId === null) {
      const fallback = presets.lastLook;
      applyLook(fallback, null, { persist: false });
    }
    shell.renderPresets(presets.all(), presets.activeId, presets.isCustom);
    shell.toast('look deleted');
  }

  // ── camera and entry ─────────────────────────────────────────
  async function enterExperience(withCamera) {
    if (state.started) return;
    state.started = true;

    audio.enable();
    shell.setSound(audio.enabled);
    stage.setGated(false);
    shell.hideGate();
    startPsych();

    if (!withCamera) {
      shell.setStatus({ camera: 'idle' });
      shell.toast('entering without reflection');
      return;
    }

    await startCamera();
  }

  async function startCamera() {
    shell.setStatus({ camera: 'requesting' });
    const result = await camera.start();
    if (result.ok) {
      stage.setCameraTexture(camera.texture);
      shell.setCameraPressed(true);
      shell.setGateMessage('reflection is live', 'ok');
      shell.toast('reflection connected');
    } else {
      stage.setCameraTexture(null);
      shell.setCameraPressed(false);
      shell.toast(CAMERA_FRIENDLY[camera.status] || 'camera unavailable', { tone: 'warn' });
    }
    refreshStatus();
    return result;
  }

  async function toggleCamera() {
    if (camera.isLive) {
      camera.stop();
      stage.setCameraTexture(null);
      shell.setCameraPressed(false);
      shell.toast('camera off');
      refreshStatus();
      return;
    }
    await startCamera();
  }

  // ── actions ──────────────────────────────────────────────────
  async function handleAction(action) {
    if (action === 'camera') await toggleCamera();
    else if (action === 'snapshot') await capture();
    else if (action === 'sound') toggleSound();
    else if (action === 'fullscreen') await toggleFullscreen();
    else if (action === 'help') shell.openHelp();
  }

  function toggleSound() {
    const enabled = audio.toggle();
    storage.set(STORAGE_KEYS.sound, enabled ? '1' : '0');
    shell.setSound(enabled);
    shell.toast(enabled ? 'sound on' : 'sound off');
    if (enabled) audio.chime(state.look.mode);
  }

  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      } else {
        document.documentElement.requestFullscreen?.().catch(() => {
          shell.toast('fullscreen is unavailable here', { tone: 'warn' });
        });
      }
    } catch {
      shell.toast('fullscreen is unavailable here', { tone: 'warn' });
    }
  }

  async function capture() {
    const blob = await stage.capture(frameState());
    if (!blob) {
      shell.toast('snapshot failed', { tone: 'warn' });
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `echo-us-${state.look.mode}-${stamp}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    shell.toast('snapshot saved');
  }

  // ── status ───────────────────────────────────────────────────
  let debugTick = 0;
  function refreshStatus() {
    shell.setStatus({
      camera: state.cameraStatus,
      detail: debug ? `${Math.round(state.fps)} fps · ${stage.diagnostics.width}×${stage.diagnostics.height}` : '',
    });
  }

  // ── psych layer ──────────────────────────────────────────────
  let phraseIndex = 0;
  let psychTimer = 0;

  function clearPsych() {
    window.clearTimeout(psychTimer);
    psychTimer = 0;
  }

  function schedulePsych(delay) {
    clearPsych();
    psychTimer = window.setTimeout(() => {
      if (state.reducedMotion) return;
      shell.showPhrase(PHRASES[phraseIndex++ % PHRASES.length]);
      psychTimer = window.setTimeout(() => {
        shell.hidePhrase();
        if (state.reducedMotion) return;
        psychTimer = window.setTimeout(() => schedulePsych(0), 3600 + Math.random() * 4200);
      }, 3400);
    }, delay);
  }

  function startPsych() {
    if (state.reducedMotion) {
      shell.showPhrase('you are the light.');
      return;
    }
    schedulePsych(3200);
  }

  // ── frame loop ───────────────────────────────────────────────
  let rafId = 0;
  let lastNow = performance.now();
  let budget = 0;
  let lastAdapt = lastNow;
  let startedAt = lastNow;

  function frameState() {
    const live = camera.isLive;
    const lightBase = 0.15 + state.look.brightness * 0.55;
    const brightness = clamp01(lightBase + (live ? camera.brightness * 0.45 : 0));
    return {
      time: state.time,
      dt: state.dt || 1 / 60,
      brightness: state.brightness || brightness,
      motion: state.motion,
      mouseX: state.mouseX,
      mouseY: state.mouseY,
      cameraLive: live,
      motionScale: state.reducedMotion ? 0.22 : 1,
    };
  }

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    if (document.hidden) {
      lastNow = now;
      return;
    }

    const raw = now - lastNow;
    lastNow = now;
    budget += raw;
    if (budget < TARGET_FRAME_MS) return;

    const elapsed = Math.min(budget, 100);
    budget %= TARGET_FRAME_MS;
    const dt = elapsed / 1000;
    state.dt = dt;
    state.time += dt;

    state.mouseX = damp(state.mouseX, state.targetX, 6, dt);
    state.mouseY = damp(state.mouseY, state.targetY, 6, dt);

    camera.sample(now, dt);
    state.motion = damp(state.motion, camera.motion, 3, dt);

    const live = camera.isLive;
    const targetLight = clamp01(0.15 + state.look.brightness * 0.55 + (live ? camera.brightness * 0.45 : 0));
    state.brightness = damp(state.brightness, targetLight, 3, dt);

    stage.render({
      time: state.time,
      dt,
      brightness: state.brightness,
      motion: state.motion,
      mouseX: state.mouseX,
      mouseY: state.mouseY,
      cameraLive: live,
      motionScale: state.reducedMotion ? 0.22 : 1,
    });

    shell.tick(dt);

    state.fps = damp(state.fps, 1000 / elapsed, 3, dt);

    if (debug && now - debugTick > 500) {
      debugTick = now;
      refreshStatus();
    }

    if (!forcedQuality && now - lastAdapt > ADAPT_INTERVAL_MS && now - startedAt > 3000) {
      lastAdapt = now;
      adaptQuality();
    }
  }

  function adaptQuality() {
    if (state.fps < 44 && state.density > 0.62) {
      state.density = Math.max(0.62, state.density - 0.14);
      stage.setDensity(state.density);
      if (state.density <= 0.7) stage.setQuality('eco');
    } else if (state.fps > 57 && state.density < 1) {
      state.density = Math.min(1, state.density + 0.1);
      stage.setDensity(state.density);
      if (state.density >= 0.9) stage.setQuality('high');
    }
  }

  // ── input ────────────────────────────────────────────────────
  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (shell.isHelpOpen()) return;

    const modeByNumber = Number(event.key) - 1;
    if (Number.isInteger(modeByNumber) && modeByNumber >= 0 && modeByNumber < MODES.length) {
      event.preventDefault();
      selectMode(MODES[modeByNumber].id);
      return;
    }

    switch (event.key.toLowerCase()) {
      case 'p':
        event.preventDefault();
        cyclePreset(event.shiftKey ? -1 : 1);
        break;
      case 's':
        event.preventDefault();
        saveLook();
        break;
      case 'c':
        event.preventDefault();
        capture();
        break;
      case 'v':
        event.preventDefault();
        toggleCamera();
        break;
      case 'm':
        event.preventDefault();
        toggleSound();
        break;
      case 'f':
        event.preventDefault();
        toggleFullscreen();
        break;
      case '?':
      case 'h':
        event.preventDefault();
        shell.openHelp();
        break;
      default:
        break;
    }
  }

  function onFullscreenChange() {
    shell.setFullscreen(Boolean(document.fullscreenElement));
  }

  const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  function onReducedMotionChange(event) {
    state.reducedMotion = event.matches;
    shell.setReducedMotion(state.reducedMotion);
    if (state.reducedMotion) {
      clearPsych();
      shell.showPhrase('you are the light.');
    } else if (state.started) {
      shell.hidePhrase();
      schedulePsych(1200);
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      clearPsych();
      audio.suspend();
    } else {
      lastNow = performance.now();
      audio.resume();
      if (state.started && !state.reducedMotion) schedulePsych(2400);
    }
  }

  function onResize() {
    stage.resize();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('visibilitychange', onVisibilityChange);
  reducedMotionQuery?.addEventListener?.('change', onReducedMotionChange);

  rafId = requestAnimationFrame(loop);

  return {
    state,
    stage,
    camera,
    presets,
    shell,
    destroy() {
      cancelAnimationFrame(rafId);
      clearPsych();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reducedMotionQuery?.removeEventListener?.('change', onReducedMotionChange);
      camera.destroy();
      audio.destroy();
      stage.dispose();
    },
  };
}
