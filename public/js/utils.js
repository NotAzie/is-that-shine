/** Small, dependency-free math helpers shared by the app, camera and stage. */

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const clamp01 = (value) => clamp(value, 0, 1);

export const lerp = (from, to, t) => from + (to - from) * t;

/**
 * Frame-rate independent exponential smoothing.
 * `lambda` is roughly "how many e-folds per second"; higher is snappier.
 */
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
};

/** Deterministic 0..1 hash for layout jitter. */
export const hash01 = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
