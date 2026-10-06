import { DEFAULT_MODE_ID, MODE_IDS, defaultLook, getMode } from './modes/index.js';
import { clamp01 } from './utils.js';

/**
 * Looks and presets.
 *
 * A "look" is the tunable state of the piece: which mode is on, how much light
 * the scene gets, how strong the camera trail is, how much grain and how much
 * refraction. Presets are named looks; the four defaults ship with the site and
 * any look the visitor saves is kept locally.
 */

export const PRESET_VERSION = 2;

export const STORAGE_KEYS = Object.freeze({
  custom: 'echo.us.looks.v2',
  active: 'echo.us.activeLook.v2',
  lastLook: 'echo.us.lastLook.v2',
  sound: 'echo.us.sound.v2',
});

export const LOOK_FIELDS = Object.freeze(['brightness', 'ghost', 'grain', 'refraction']);

export const DEFAULT_PRESETS = Object.freeze([
  Object.freeze({
    id: 'prism-dawn',
    name: 'prism / dawn',
    mode: 'prism',
    brightness: 0.74,
    ghost: 0.32,
    grain: 0.22,
    refraction: 0.6,
  }),
  Object.freeze({
    id: 'prism-after-hours',
    name: 'prism / after hours',
    mode: 'prism',
    brightness: 0.34,
    ghost: 0.5,
    grain: 0.45,
    refraction: 0.68,
  }),
  Object.freeze({
    id: 'fracture-scatter',
    name: 'fracture / scatter',
    mode: 'fracture',
    brightness: 0.6,
    ghost: 0.6,
    grain: 0.55,
    refraction: 0.58,
  }),
  Object.freeze({
    id: 'void-hollow',
    name: 'void / hollow',
    mode: 'void',
    brightness: 0.46,
    ghost: 0.24,
    grain: 0.3,
    refraction: 0.72,
  }),
]);

const LOOK_KEYS = ['mode', ...LOOK_FIELDS];

const num = (value, fallback) =>
  typeof value === 'number' && Number.isFinite(value) ? clamp01(value) : fallback;

const cleanMode = (value, fallback = DEFAULT_MODE_ID) =>
  typeof value === 'string' && MODE_IDS.includes(value) ? value : fallback;

/** Returns a complete, safe look from arbitrary input. */
export function sanitizeLook(input, fallback = defaultLook(DEFAULT_MODE_ID)) {
  if (!input || typeof input !== 'object') return { ...fallback };
  return {
    mode: cleanMode(input.mode, fallback.mode),
    brightness: num(input.brightness, fallback.brightness),
    ghost: num(input.ghost, fallback.ghost),
    grain: num(input.grain, fallback.grain),
    refraction: num(input.refraction, fallback.refraction),
  };
}

export function sanitizePreset(input) {
  if (!input || typeof input !== 'object') return null;
  if (typeof input.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,48}$/i.test(input.id)) return null;
  if (typeof input.name !== 'string') return null;
  const name = input.name.trim().slice(0, 40);
  if (!name) return null;

  const look = sanitizeLook(input, defaultLook(DEFAULT_MODE_ID));
  return { id: input.id, name, ...look };
}

export function looksEqual(a, b) {
  if (!a || !b) return false;
  if (a.mode !== b.mode) return false;
  return LOOK_FIELDS.every((key) => Math.abs(Number(a[key]) - Number(b[key])) < 0.001);
}

const copyLook = (look) => Object.fromEntries(LOOK_KEYS.map((key) => [key, look[key]]));

export function createPresets({ storage, now = () => Date.now(), random = () => Math.random() }) {
  let custom = storage.getJSON(STORAGE_KEYS.custom, [], (value) => {
    if (!Array.isArray(value)) return null;
    return value.map(sanitizePreset).filter(Boolean);
  });

  let activeId = storage.getJSON(STORAGE_KEYS.active, null, (value) =>
    typeof value === 'string' ? value : null,
  );

  let lastLook = sanitizeLook(
    storage.getJSON(STORAGE_KEYS.lastLook, null, (value) => {
      if (!value || typeof value !== 'object') return null;
      return sanitizeLook(value);
    }),
    DEFAULT_PRESETS[0],
  );

  function persistCustom() {
    storage.setJSON(STORAGE_KEYS.custom, custom);
  }

  function persistActive() {
    if (activeId) storage.setJSON(STORAGE_KEYS.active, activeId);
    else storage.remove(STORAGE_KEYS.active);
  }

  function persistLastLook() {
    storage.setJSON(STORAGE_KEYS.lastLook, lastLook);
  }

  function all() {
    return [...DEFAULT_PRESETS, ...custom].map((preset) => ({ ...preset }));
  }

  function find(id) {
    return [...DEFAULT_PRESETS, ...custom].find((preset) => preset.id === id) ?? null;
  }

  function active() {
    if (!activeId) return null;
    return find(activeId);
  }

  function activate(id) {
    const preset = find(id);
    if (!preset) return null;
    activeId = preset.id;
    lastLook = copyLook(preset);
    persistActive();
    persistLastLook();
    return { ...preset };
  }

  function rememberLook(look) {
    const clean = sanitizeLook(look, lastLook);
    lastLook = clean;
    const current = active();
    if (!current || !looksEqual(current, clean)) {
      activeId = null;
      persistActive();
    }
    persistLastLook();
    return clean;
  }

  function saveLook(look, { name } = {}) {
    const clean = sanitizeLook(look, lastLook);
    const existing = [...DEFAULT_PRESETS, ...custom].find((preset) => looksEqual(preset, clean));
    if (existing) {
      activate(existing.id);
      return { preset: { ...existing }, created: false };
    }

    const suffix = Math.floor(random() * 1296).toString(36).padStart(2, '0');
    const id = `look-${now().toString(36)}-${suffix}`;
    const preset = {
      id,
      name:
        (name && String(name).trim().slice(0, 40)) ||
        `look ${String(custom.length + 1).padStart(2, '0')}`,
      ...clean,
    };
    custom = [...custom, preset];
    persistCustom();
    activate(id);
    return { preset: { ...preset }, created: true };
  }

  function remove(id) {
    if (!custom.some((preset) => preset.id === id)) return false;
    custom = custom.filter((preset) => preset.id !== id);
    persistCustom();
    if (activeId === id) {
      activeId = null;
      persistActive();
    }
    return true;
  }

  function clearCustom() {
    custom = [];
    persistCustom();
    if (activeId && !DEFAULT_PRESETS.some((preset) => preset.id === activeId)) {
      activeId = null;
      persistActive();
    }
  }

  const isCustom = (id) => custom.some((preset) => preset.id === id);

  return {
    all,
    find,
    active,
    activate,
    rememberLook,
    saveLook,
    remove,
    clearCustom,
    isCustom,
    get activeId() {
      return activeId;
    },
    get lastLook() {
      return { ...lastLook };
    },
    get customCount() {
      return custom.length;
    },
  };
}

/** The look for a mode, used when the visitor has no saved history. */
export function lookForMode(modeId) {
  const mode = getMode(modeId);
  return mode ? { mode: mode.id, ...mode.defaults } : defaultLook(DEFAULT_MODE_ID);
}
