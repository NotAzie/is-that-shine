/**
 * Render modes as data.
 *
 * A mode describes the scene the shader should draw and the personality the
 * chrome wordmark should take while it is on screen. The shader itself lives in
 * `shaders.js` and branches on `shaderIndex`; there is exactly one render path.
 *
 * Mode state is created deterministically on boot, not lazily from UI
 * callbacks. That keeps the render path wired before the visitor ever touches
 * the dock.
 */

/** @typedef {Object} ModeDefaults
 * @property {number} brightness  base light level, 0..1
 * @property {number} ghost       camera trail strength, 0..1
 * @property {number} grain       film grain, 0..1
 * @property {number} refraction  refraction index for the camera image, 0..1
 */

export const MODES = Object.freeze([
  Object.freeze({
    id: 'prism',
    label: 'Prism',
    shaderIndex: 0,
    accent: '#80deea',
    description: 'A hexagonal prism relighting your reflection into a spectrum.',
    defaults: { brightness: 0.62, ghost: 0.45, grain: 0.35, refraction: 0.62 },
    chrome: { roughness: 0.03, metalness: 1, iridescence: 0.5 },
  }),
  Object.freeze({
    id: 'fracture',
    label: 'Fracture',
    shaderIndex: 1,
    accent: '#ff9ad5',
    description: 'Shards orbit the light and scatter it back at you.',
    defaults: { brightness: 0.58, ghost: 0.55, grain: 0.5, refraction: 0.58 },
    chrome: { roughness: 0.09, metalness: 0.92, iridescence: 0.75 },
  }),
  Object.freeze({
    id: 'void',
    label: 'Void',
    shaderIndex: 2,
    accent: '#b39ddb',
    description: 'The prism hollowed out, with a quiet core at its centre.',
    defaults: { brightness: 0.48, ghost: 0.3, grain: 0.3, refraction: 0.7 },
    chrome: { roughness: 0.16, metalness: 0.78, iridescence: 0.35 },
  }),
]);

export const MODE_IDS = Object.freeze(MODES.map((mode) => mode.id));

export const DEFAULT_MODE_ID = 'prism';

export function getMode(id) {
  return MODES.find((mode) => mode.id === id) ?? null;
}

export function modeIndex(id) {
  return MODES.findIndex((mode) => mode.id === id);
}

/** Cycles forward through modes; useful for keyboard shortcuts. */
export function nextMode(id, direction = 1) {
  const index = Math.max(0, modeIndex(id));
  const count = MODES.length;
  return MODES[(index + direction + count) % count].id;
}

/** The look described by a mode when no preset is selected. */
export function defaultLook(id) {
  const mode = getMode(id) ?? MODES[0];
  return { mode: mode.id, ...mode.defaults };
}

/**
 * Initialize the mode registry for rendering.
 *
 * The registry is stateless data, but consumers that derive render state from
 * UI callbacks (rather than from an explicit initial mode) can end up with no
 * active mode on boot. Calling this once at startup makes the default mode
 * explicit and leaves the registry unchanged.
 */
export function init(initialId = DEFAULT_MODE_ID) {
  const mode = getMode(initialId) ?? MODES[0];
  // Keep the registry stable; the caller owns applying the look.
  return mode;
}
