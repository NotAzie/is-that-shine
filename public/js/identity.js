export function createIdentity({ onModeChange }) {
  let mode = 'prism';
  let chromeMat = null;
  let echoGroup = null;
  let renderer = null;
  let scene = null;
  let video = null;
  let ambient = null;
  let dir = null;
  let blue = null;
  let violet = null;
  let pmg = null;
  let liveEnv = null;
  let vidTex = null;
  let envCounter = 0;
  let fbEnv = null;
  let echoMesh = null;

  function setMode(newMode) {
    if (newMode === mode) return;
    mode = newMode;
    onModeChange && onModeChange(newMode);
  }

  function apply(preset) {
    // preset application point for future tuning fields
    if (preset && preset.mode) setMode(preset.mode);
  }

  function attach({
    renderer: r,
    scene: s,
    echoGroup: g,
    pointsGeo,
    pointsMat,
    lights,
    video: v,
  }) {
    renderer = r;
    scene = s;
    echoGroup = g;
    ambient = lights.ambient;
    dir = lights.dir;
    blue = lights.blue;
    violet = lights.violet;
    video = v;
    // Defer environment map creation until the renderer is usable.
    try {
      fbEnv = makeFbEnv();
    } catch (e) {
      // Renderer may not support PMREM on first allocation; fall back to a neutral env.
      try { fbEnv = makeFallbackEnv(); } catch (e2) { fbEnv = null; }
    }
  }

  function makeFallbackEnv() {
    const sz = 64;
    const data = new Uint8Array(sz * sz * 4);
    for (let y = 0; y < sz; y++) {
      for (let x = 0; x < sz; x++) {
        const i = (y * sz + x) * 4;
        const tv = y / sz;
        data[i] = 18 + tv * 55;
        data[i + 1] = 20 + tv * 60;
        data[i + 2] = 28 + tv * 75;
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(
      data,
      sz,
      sz,
      THREE.RGBAFormat,
    );
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    return tex;
  }

  function makeFbEnv() {
    const pmgLocal = new THREE.PMREMGenerator(renderer);
    pmgLocal.compileEquirectangularShader();
    const sz = 64;
    const data = new Uint8Array(sz * sz * 4);
    for (let y = 0; y < sz; y++) {
      for (let x = 0; x < sz; x++) {
        const i = (y * sz + x) * 4;
        const tv = y / sz;
        data[i] = 18 + tv * 55;
        data[i + 1] = 20 + tv * 60;
        data[i + 2] = 28 + tv * 75;
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(
      data,
      sz,
      sz,
      THREE.RGBAFormat,
    );
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    const rt = pmgLocal.fromEquirectangular(tex);
    pmgLocal.dispose();
    return rt.texture;
  }

  function makeChrome() {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 1.0,
      roughness: 0.04,
      envMap: fbEnv || makeFbEnv(),
      envMapIntensity: 2.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.025,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vVP;\nvarying vec3 vNW;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvVP=(modelViewMatrix*vec4(position,1.)).xyz;\nvNW=normalize(normalMatrix*normal);',
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vVP;\nvarying vec3 vNW;',
        )
        .replace(
          '#include <output_fragment>',
          'float fr=pow(1.-abs(dot(normalize(-vVP),vNW)),3.8);\noutgoingLight+=vec3(.22,.62,1.)*fr*.9;\noutgoingLight+=vec3(.55,.25,1.)*fr*fr*.5;\n#include <output_fragment>',
        );
    };
    return mat;
  }

  function buildChromeWordmark() {
    if (echoMesh) return;
    new THREE.FontLoader().load(
      'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_bold.typeface.json',
      (font) => {
        const geo = new THREE.TextGeometry('echo.us', {
          font,
          size: 0.70,
          height: 0.20,
          curveSegments: 10,
          bevelEnabled: true,
          bevelThickness: 0.042,
          bevelSize: 0.026,
          bevelSegments: 6,
        });
        geo.center();
        chromeMat = makeChrome();
        echoMesh = new THREE.Mesh(geo, chromeMat);
        echoGroup.add(echoMesh);
      },
      undefined,
      () => {
        // Fallback if the font can't be loaded: a simple box as the wordmark.
        chromeMat = makeChrome();
        echoMesh = new THREE.Mesh(
          new THREE.BoxGeometry(4, 0.7, 0.2),
          chromeMat,
        );
        echoGroup.add(echoMesh);
      },
    );
  }

  function tuneChrome(brightness) {
    if (!chromeMat) return;
    if (mode === 'fracture') {
      chromeMat.roughness = 0.08 + Math.abs(Math.sin(brightness * 1.2)) * 0.1;
      chromeMat.metalness = 0.9;
    } else if (mode === 'void') {
      chromeMat.roughness = 0.15 + Math.sin(brightness * 0.8) * 0.06;
      chromeMat.metalness = 0.75;
    } else {
      chromeMat.roughness = 0.03 + Math.sin(brightness * 0.5) * 0.012;
      chromeMat.metalness = 1.0;
    }
    chromeMat.envMapIntensity = 1.4 + brightness * 1.7;
    chromeMat.needsUpdate = true;
  }

  function tick(opts) {
    const {
      time,
      brightness,
      mouseX,
      mouseY,
      mode,
      camReady,
      echoGroup,
      pointsGeo,
      pointsMat,
    } = opts;

    if (!echoGroup) return;

    if (typeof echoMesh === 'undefined' || echoMesh === null) {
      buildChromeWordmark();
    }

    echoGroup.rotation.y =
      Math.sin(time * 0.38) * 0.05 + mouseX * 0.11;
    echoGroup.rotation.x =
      Math.sin(time * 0.22) * 0.025 + mouseY * 0.055;
    echoGroup.position.y = Math.sin(time * 0.5) * 0.07;
    echoGroup.scale.setScalar(
      1 + Math.sin(time * 0.75) * 0.007,
    );

    if (pointsGeo && pointsMat) {
      const pPos = pointsGeo.attributes.position.array;
      const pCount = pPos.length / 3;
      for (let i = 0; i < pCount; i++) {
        pPos[i * 3 + 1] += 0.002 * (0.3 + Math.sin(i + time) * 0.7);
        pPos[i * 3] += Math.sin(time * 0.3 + i) * 0.001;
        if (pPos[i * 3 + 1] > 4) pPos[i * 3 + 1] = -4;
      }
      pointsGeo.attributes.position.needsUpdate = true;
      pointsMat.opacity = 0.08 + brightness * 0.35;
    }

    if (chromeMat) {
      tuneChrome(brightness);
    }

    // Rate-limited live camera environment map for the chrome wordmark.
    if (camReady && renderer && video) {
      envCounter++;
      if (envCounter % 30 === 0) {
        buildLiveEnv();
      }
    }
  }

  function buildLiveEnv() {
    if (!renderer || !video) return;
    if (!vidTex) {
      vidTex = new THREE.VideoTexture(video);
      vidTex.minFilter = THREE.LinearFilter;
      vidTex.mapping = THREE.EquirectangularReflectionMapping;
    }
    vidTex.needsUpdate = true;
    if (!pmg) {
      pmg = new THREE.PMREMGenerator(renderer);
      pmg.compileEquirectangularShader();
    }
    try {
      const rt = pmg.fromEquirectangular(vidTex);
      if (liveEnv) liveEnv.dispose();
      liveEnv = rt.texture;
      if (chromeMat) {
        chromeMat.envMap = liveEnv;
        chromeMat.needsUpdate = true;
      }
    } catch (e) {
      // ignore PMREM failures (e.g. no WebGL support for the generator)
    }
  }

  return {
    setMode,
    apply,
    attach,
    tuneChrome,
    tick,
    get mode() {
      return mode;
    },
  };
}
