const PRESET_KEY = 'echo.us.presets.v1';
const ACTIVE_KEY = 'echo.us.activePreset.v1';

const DefaultPresets = [
  {
    id: 'prism-day',
    name: 'Prism — day',
    mode: 'prism',
    brightness: 0.5,
    colorResponse: 'rainbow',
    ghost: 0.5,
  },
  {
    id: 'prism-night',
    name: 'Prism — night',
    mode: 'prism',
    brightness: 0.25,
    colorResponse: 'rainbow',
    ghost: 0.25,
  },
  {
    id: 'fracture',
    name: 'Fracture',
    mode: 'fracture',
    brightness: 0.5,
    colorResponse: 'scatter',
    ghost: 0.5,
  },
  {
    id: 'void',
    name: 'Void',
    mode: 'void',
    brightness: 0.4,
    colorResponse: 'invert',
    ghost: 0.5,
  },
];

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // ignore storage failures silently
  }
}

export function createPresets() {
  const presets = loadJSON(PRESET_KEY, DefaultPresets.slice());
  const activeId = loadJSON(ACTIVE_KEY, null);

  function all() {
    return presets.slice();
  }

  function active() {
    if (!activeId) return null;
    return presets.find((p) => p.id === activeId) || null;
  }

  function setActive(id) {
    if (!presets.some((p) => p.id === id)) return;
    activeId && saveJSON(ACTIVE_KEY, activeId);
    saveJSON(ACTIVE_KEY, id);
  }

  function setActiveMode(mode) {
    const current = active();
    if (current && current.mode === mode) return;
    if (current) {
      current.mode = mode;
      saveJSON(PRESET_KEY, presets);
    } else {
      const preset = {
        id: 'auto-' + Date.now(),
        name: 'Auto',
        mode: mode,
        brightness: 0.5,
        colorResponse: 'auto',
        ghost: 0.35,
      };
      presets.push(preset);
      saveJSON(PRESET_KEY, presets);
      saveJSON(ACTIVE_KEY, preset.id);
    }
  }

  function updateActive(patch) {
    const current = active();
    if (!current) return;
    Object.assign(current, patch);
    saveJSON(PRESET_KEY, presets);
  }

  return {
    all,
    active,
    setActive,
    setActiveMode,
    updateActive,
  };
}
