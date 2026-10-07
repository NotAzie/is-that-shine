import { makePrismPass } from './prism.js';
import { makeFracturePass } from './fracture.js';
import { makeVoidPass } from './void.js';
import './shared_shader.js';

const registry = {
  prism: makePrismPass,
  fracture: makeFracturePass,
  void: makeVoidPass,
};

// Ensure shared shader module is initialized once by importing it.
// The module itself is side-effect free until createSharedPrismState is used.

export function createModes() {
  const instances = {};
  const buttons = document.querySelectorAll('.mode-btn');
  let gl = null;

  function ensureGl() {
    if (gl) return gl;
    const c = document.getElementById('prism-canvas');
    gl = c.getContext('webgl2') || c.getContext('webgl');
    return gl;
  }

  function select(mode) {
    if (instances[mode]) return;
    const mk = registry[mode];
    if (!mk) return;
    const glLocal = ensureGl();
    if (!glLocal) return;
    const instance = mk();
    if (instance.init) instance.init(glLocal);
    instances[mode] = instance;
  }

  function get(mode) {
    return instances[mode] || null;
  }

  return {
    list: () => buttons,
    select,
    get,
    has: (mode) => !!registry[mode],
  };
}
