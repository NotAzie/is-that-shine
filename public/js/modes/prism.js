import { createSharedPrismState, SHARED_VERT, SHARED_FRAG } from './shared_shader.js';

export function makePrismPass() {
  let state = null;

  return {
    name: 'prism',
    init(gl) {
      if (state) return;
      state = createSharedPrismState(gl);
    },
    render(opts) {
      if (!state) {
        const gl = opts.prismCanvas.getContext('webgl2') || opts.prismCanvas.getContext('webgl');
        if (!gl) return;
        this.init(gl);
      }
      prismRender(opts);
    },
  };
}

function prismRender(opts) {
  const {
    time,
    brightness,
    mouseX,
    mouseY,
    camReady,
    prismCanvas,
  } = opts;

  const gl = prismCanvas.getContext('webgl2') || prismCanvas.getContext('webgl');
  if (!gl) return;

  if (!prismCanvas._echoPrism) {
    prismCanvas._echoPrism = createSharedPrismState(gl);
  }

  const prog = prismCanvas._echoPrism;

  gl.viewport(0, 0, prismCanvas.width, prismCanvas.height);
  gl.useProgram(prog.prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, prog.qBuf);
  gl.vertexAttribPointer(prog.aPL, 2, gl.FLOAT, false, 0, 0);

  gl.uniform1f(prog.U.time, time);
  gl.uniform1f(prog.U.bright, brightness);
  gl.uniform2f(prog.U.mouse, mouseX, mouseY);
  gl.uniform2f(prog.U.res, prismCanvas.width, prismCanvas.height);
  gl.uniform1i(prog.U.mode, 0);
  gl.uniform1i(prog.U.hasCam, camReady ? 1 : 0);
  gl.uniform1f(prog.U.ghost, camReady ? 0.5 : 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, prog.camTex);
  gl.uniform1i(prog.U.cam, 0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// keep old import path working during transition
// eslint-disable-next-line no-unused-vars
const _sharedPrism = createSharedPrismState;
