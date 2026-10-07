const DOM = {
  prismCanvas: document.getElementById('prism-canvas'),
  threeCanvas: document.getElementById('three-canvas'),
  video: document.getElementById('cam-video'),
  gate: document.getElementById('gate'),
  gateTitle: document.getElementById('gate-title'),
  gateSub: document.getElementById('gate-sub'),
  allowBtn: document.getElementById('allow-btn'),
  modes: document.getElementById('modes'),
  hudLogo: document.getElementById('hud-logo'),
  hudStatus: document.getElementById('hud-status'),
  hudDot: document.getElementById('hud-dot'),
  hudLabel: document.getElementById('hud-label'),
  psych: document.getElementById('psych'),
  cursor: document.getElementById('cursor'),
  cursorRing: document.getElementById('cursor-ring'),
  corners: Array.from(document.querySelectorAll('.corner')),
  scanlines: document.getElementById('scanlines'),
  vignette: document.getElementById('vignette'),
};

const THREE = window.THREE;
if (!THREE) {
  document.getElementById('gate-title').textContent = 'three.js missing';
  throw new Error('three.min.js must be loaded before the module entry');
}

const PsychPhrases = [
  "you are the light.",
  "this is not reflection.",
  "you pass through.",
  "identity is refraction.",
  "only light has no shadow here.",
  "you were always inside.",
  "the prism remembers your face.",
];

export function createShell({ onModeSelect, onPresetLoad, onCameraReady }) {
  const state = {
    camReady: false,
    mode: 'prism',
    brightness: 0.5,
    mouseX: 0,
    mouseY: 0,
    tMouseX: 0,
    tMouseY: 0,
    ready: false,
  };

  // Three.js chrome wordmark scene — created once, owned by shell, farmed to identity.
  const renderer = new THREE.WebGLRenderer({
    canvas: DOM.threeCanvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    42, innerWidth / innerHeight, 0.1, 100
  );
  camera.position.set(0, 0, 5);

  const echoGroup = new THREE.Group();
  scene.add(echoGroup);

  const pCount = 60;
  const pPos = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 13;
    pPos[i * 3 + 1] = (Math.random() - 0.5) * 7;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 4 - 1;
  }
  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(pPos, 3),
  );
  const pointsMat = new THREE.PointsMaterial({
    color: 0x4fc3f7,
    size: 0.022,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Points(pointsGeo, pointsMat));

  const ambient = new THREE.AmbientLight(0x203040, 0.35);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xc0d0e0, 1.4);
  dir.position.set(3, 4, 5);
  scene.add(dir);
  const blue = new THREE.PointLight(0x4fc3f7, 2, 12);
  blue.position.set(-3, 2, 3);
  scene.add(blue);
  const violet = new THREE.PointLight(0xb39ddb, 1.5, 10);
  violet.position.set(3, -2, 2);
  scene.add(violet);

  const lights = { ambient, dir, blue, violet };

  let cursorX = 0,
    cursorY = 0,
    cursorRx = 0,
    cursorRy = 0;
  let psychTimer = null;
  let rippleTimer = null;
  let psychRAF = 0;
  let psychRunning = false;

  // Local reference to the shell API object so start() can mutate it.
  let shellApi = {};

  function bindInput() {
    window.addEventListener('mousemove', (e) => {
      cursorX = e.clientX;
      cursorY = e.clientY;
      state.tMouseX = (e.clientX / innerWidth) * 2 - 1;
      state.tMouseY = -(e.clientY / innerHeight) * 2 + 1;
    });

    window.addEventListener('click', (e) => {
      const r = document.createElement('div');
      r.className = 'ripple';
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      r.style.width = '40px';
      r.style.height = '40px';
      document.body.appendChild(r);
      if (rippleTimer) clearTimeout(rippleTimer);
      rippleTimer = setTimeout(() => r.remove(), 750);
    });

    window.addEventListener('resize', () => {
      onResize();
    });

    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma != null) {
        state.tMouseX = (e.gamma / 45) * 0.5;
        state.tMouseY = ((e.beta || 0) - 30) / 45 * 0.3;
      }
    });
  }

  function sizePrism() {
    const w = Math.floor(innerWidth * 0.72);
    const h = Math.floor(innerHeight * 0.72);
    DOM.prismCanvas.width = w;
    DOM.prismCanvas.height = h;
    DOM.prismCanvas.style.width = innerWidth + 'px';
    DOM.prismCanvas.style.height = innerHeight + 'px';
  }

  function onResize() {
    if (shellApi.onResize) shellApi.onResize();
    sizePrism();
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }

  DOM.allowBtn.addEventListener('click', async () => {
    if (state.camReady) return;
    try {
      await cameraPipeline.requestAccess();
      state.camReady = true;
      onCameraReady && onCameraReady();
    } catch (err) {
      DOM.gateTitle.textContent = 'reflection denied';
    }
  });

  DOM.modes.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      DOM.modes.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onModeSelect(btn.dataset.mode);
    });
  });

  let cursorLoopRAF = 0;

  function startCursorLoop() {
    function tick() {
      cursorRx += (cursorX - cursorRx) * 0.1;
      cursorRy += (cursorY - cursorRy) * 0.1;
      DOM.cursor.style.left = cursorX + 'px';
      DOM.cursor.style.top = cursorY + 'px';
      DOM.cursorRing.style.left = cursorRx + 'px';
      DOM.cursorRing.style.top = cursorRy + 'px';
      cursorLoopRAF = requestAnimationFrame(tick);
    }
    cursorLoopRAF = requestAnimationFrame(tick);
  }

  function stopCursorLoop() {
    if (cursorLoopRAF) {
      cancelAnimationFrame(cursorLoopRAF);
      cursorLoopRAF = 0;
    }
  }

  function startPsychLoop() {
    const el = DOM.psych;
    let idx = 0;

    function next() {
      const phrase = PsychPhrases[idx++ % PsychPhrases.length];
      el.textContent = phrase;
      el.style.color = `rgba(200,215,225,${0.35 + state.brightness * 0.25})`;
      el.style.textShadow = `0 0 50px rgba(79,195,247,${0.15 + state.brightness * 0.2}),-1px 0 rgba(255,80,80,.15),1px 0 rgba(80,200,255,.15)`;
      setTimeout(() => {
        el.style.color = 'rgba(200,215,225,0)';
        el.style.textShadow = 'none';
        setTimeout(next, 5500 + Math.random() * 4500);
      }, 2800);
    }

    setTimeout(next, 3500);
  }

  function revealUI() {
    DOM.gate.classList.add('hide');
    DOM.modes.classList.add('reveal');
    DOM.hudLogo.classList.add('reveal');
    DOM.hudStatus.classList.add('reveal');
    DOM.corners.forEach((c) => c.classList.add('reveal'));
  }

  function setMode(mode) {
    state.mode = mode;
    DOM.modes.querySelectorAll('.mode-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }

  function setBrightness(b) {
    state.brightness = Math.min(1, Math.max(0, b));
  }

  function setMouse(mouseX, mouseY) {
    state.mouseX = mouseX;
    state.mouseY = mouseY;
  }

  function start({ modes: modeEl, identity, presets, audio, cameraPipeline, onResize: externalResize }) {
    shellApi.onResize = externalResize;
    shellApi.cameraPipeline = cameraPipeline;
    bindInput();
    sizePrism();
    startCursorLoop();

    // preset bootstrap
    const saved = presets.active();
    if (saved) {
      setMode(saved.mode);
      identity.apply(saved);
    } else {
      setMode('prism');
    }

    onPresetLoad && onPresetLoad();

    // Give identity everything it needs to build the chrome wordmark + live env.
    identity.attach({
      renderer,
      scene,
      echoGroup,
      pointsGeo,
      pointsMat,
      lights,
      video: DOM.video,
    });

    requestAnimationFrame(function loop(now = 0) {
      requestAnimationFrame(loop);

      const dt = now - shellApi._lastFrame;
      if (dt < 16) return;
      shellApi._lastFrame = now;

      state.mouseX += (state.tMouseX - state.mouseX) * 0.055;
      state.mouseY += (state.tMouseY - state.mouseY) * 0.055;

      const cc = cameraPipeline.sample();
      if (cc) {
        // camera sample produced a frame; brightness/ghost updated inside pipeline
      }

      identity.tick({
        time: shellApi._time,
        brightness: state.brightness,
        mouseX: state.mouseX,
        mouseY: state.mouseY,
        mode: state.mode,
        camReady: state.camReady,
        echoGroup,
        pointsGeo,
        pointsMat,
        video,
      });

      const mode = modeEl.get(state.mode);
      if (mode && mode.render) {
        mode.render({
          time: shellApi._time,
          brightness: state.brightness,
          mouseX: state.mouseX,
          mouseY: state.mouseY,
          camReady: state.camReady,
          prismCanvas: DOM.prismCanvas,
        });
      }

      setBrightness(cameraPipeline.brightness);

      if (!state.ready && cameraPipeline.ready) {
        state.ready = true;
        state.camReady = true;
        revealUI();
        startPsychLoop();
      }

      shellApi._time += 0.008;

      // Render the Three.js chrome wordmark scene.
      renderer.render(scene, camera);
    });

    shellApi._lastFrame = performance.now();
    shellApi._time = 0;

    return {
      setState: (patch) => Object.assign(state, patch),
      state,
    };
  }

  function destroy() {
    identity && identity.detach && identity.detach();
    audio && audio.dispose && audio.dispose();
    cameraPipeline && cameraPipeline.teardown && cameraPipeline.teardown();
    if (renderer && renderer.dispose) {
      try { renderer.dispose(); } catch (e) { /* ignore */ }
    }
    stopCursorLoop();
    state.ready = false;
    state.camReady = false;
  }

  return {
    start,
    setMode,
    destroy,
    getState: () => state,
    DOM,
  };
}
