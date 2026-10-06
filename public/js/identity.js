import * as THREE from 'three';
import { FontLoader } from '../vendor/three/FontLoader.js';
import { TextGeometry } from '../vendor/three/TextGeometry.js';
import { clamp, damp } from './utils.js';

/**
 * The piece's identity layer: the chrome `echo.us` wordmark, the dust field, and
 * the way both answer the light.
 *
 * The wordmark is shaded procedurally — a studio reflection, a thin-film
 * iridescence pass, and an optional camera reflection — so it never needs a
 * prefiltered environment map or a second render target. The font is local, so
 * the identity has no network dependency.
 */

const FONT_URL = new URL('../fonts/helvetiker_bold.typeface.json', import.meta.url);
const WORDMARK = 'echo.us';

const CHROME_VERTEX = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vWorld;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const CHROME_FRAGMENT = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vWorld;

uniform float uTime;
uniform float uBright;
uniform float uRoughness;
uniform float uIridescence;
uniform float uHasCam;
uniform float uMode;
uniform vec3 uAccent;
uniform sampler2D uCam;

const float TAU = 6.28318530718;

vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(TAU * (vec3(0.0, 0.33, 0.67) + t));
}

vec3 studio(vec3 dir) {
  float height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(vec3(0.03, 0.04, 0.07), vec3(0.62, 0.8, 0.98), smoothstep(0.2, 0.95, height));
  col += vec3(0.95, 0.98, 1.0) * exp(-abs(dir.y) * 9.0) * 0.6;

  float angle = atan(dir.z, dir.x);
  float strip = pow(max(cos(angle * 3.0 + 0.7), 0.0), 26.0);
  col += vec3(0.85, 0.96, 1.0) * strip * 0.85;

  float thin = pow(max(cos(angle * 5.0 - 1.8), 0.0), 44.0);
  col += vec3(0.55, 0.35, 1.0) * thin * 0.6;

  col += vec3(0.5, 0.3, 1.0) * pow(max(-dir.y, 0.0), 3.0) * 0.35;
  return col;
}

vec2 dirToUv(vec3 dir) {
  return vec2(
    atan(dir.z, dir.x) / TAU + 0.5,
    asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265 + 0.5
  );
}

void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(vViewDir);
  float facing = clamp(dot(n, v), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, 3.4);

  vec3 reflected = reflect(-v, n);
  vec3 env = studio(reflected);

  vec3 col = env * (0.34 + 0.66 * fresnel) * (0.4 + uBright * 0.95);
  col += uAccent * fresnel * 0.22;

  vec3 film = spectrum(facing * 2.4 + reflected.y * 0.6 + uTime * 0.04 + uMode * 0.13);
  col += film * fresnel * uIridescence * 0.42;

  vec3 keyDir = normalize(vec3(-0.35, 0.8, 0.6));
  float spec = pow(max(dot(reflected, keyDir), 0.0), mix(200.0, 26.0, uRoughness));
  col += vec3(1.0, 0.98, 0.94) * spec * 1.5;

  float rim = pow(1.0 - facing, 8.0);
  col += uAccent * rim * 0.5;

  col *= mix(0.5, 1.0, smoothstep(0.0, 0.3, facing));
  col *= 0.92 + 0.08 * sin(vWorld.y * 26.0);

  if (uHasCam > 0.5) {
    vec2 uv = clamp(dirToUv(reflected), 0.003, 0.997);
    vec3 cam = texture2D(uCam, uv).rgb;
    col = mix(col, cam, 0.3 * uBright * (0.35 + fresnel));
  }

  gl_FragColor = vec4(max(col, 0.0), 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function createChromeMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: CHROME_VERTEX,
    fragmentShader: CHROME_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uBright: { value: 0.6 },
      uRoughness: { value: 0.04 },
      uIridescence: { value: 0.5 },
      uHasCam: { value: 0 },
      uMode: { value: 0 },
      uAccent: { value: new THREE.Color('#80deea') },
      uCam: { value: null },
    },
  });
}

export async function createIdentity({ accent = '#80deea' } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 5);

  const group = new THREE.Group();
  scene.add(group);

  const material = createChromeMaterial();
  material.uniforms.uAccent.value.set(accent);

  const dustCount = 110;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSpeed = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 14;
    dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 8;
    dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 4 - 1.4;
    dustSpeed[i] = 0.08 + Math.random() * 0.22;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({
    color: new THREE.Color(accent),
    size: 0.022,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  const targetAccent = new THREE.Color(accent);
  const size = new THREE.Vector3(5, 1.1, 0.4);

  let mode = null;
  let wordmark = null;
  let baseY = 0;
  let targetScale = 1;
  let targetY = 0;
  let gated = true;
  let viewAspect = 1;
  let disposed = false;

  async function loadFont() {
    const response = await fetch(FONT_URL);
    if (!response.ok) throw new Error(`Font request failed: ${response.status}`);
    return response.json();
  }

  async function buildWordmark() {
    const fontData = await loadFont();
    if (disposed) return false;

    const font = new FontLoader().parse(fontData);
    const geometry = new TextGeometry(WORDMARK, {
      font,
      size: 1,
      // TextGeometry maps `height` onto the extrude depth; a raw `depth` is
      // overwritten by its default (50 units).
      height: 0.3,
      curveSegments: 8,
      bevelEnabled: true,
      bevelThickness: 0.055,
      bevelSize: 0.03,
      bevelSegments: 4,
    });
    geometry.center();
    geometry.computeBoundingBox();
    geometry.boundingBox.getSize(size);

    wordmark = new THREE.Mesh(geometry, material);
    group.add(wordmark);
    return true;
  }

  const ready = buildWordmark().catch((error) => {
    console.warn('[echo.us] wordmark unavailable', error);
    return false;
  });

  function layout(aspect) {
    viewAspect = aspect;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();

    const distance = camera.position.z;
    const visibleHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * distance;
    const visibleWidth = visibleHeight * aspect;

    const fitWidth = (visibleWidth * 0.78) / Math.max(size.x, 0.001);
    const fitHeight = (visibleHeight * 0.36) / Math.max(size.y, 0.001);
    const fullScale = clamp(Math.min(fitWidth, fitHeight), 0.12, 1.12);

    // While the gate is up, the wordmark steps back and up so the entry copy
    // gets the lower half of the frame. Entering brings it forward and centres it.
    targetScale = gated ? fullScale * 0.6 : fullScale;
    baseY = gated
      ? visibleHeight * (aspect < 0.85 ? 0.2 : 0.17)
      : aspect < 0.85
        ? visibleHeight * 0.015
        : 0;
    targetY = baseY;

    if (disposed) return;
    group.scale.setScalar(targetScale);
    group.position.y = targetY;
  }

  function setGated(value) {
    if (gated === value) return;
    gated = value;
    layout(viewAspect);
  }

  layout(1);

  function setMode(nextMode) {
    if (!nextMode || mode === nextMode) return;
    mode = nextMode;
    targetAccent.set(nextMode.accent || accent);
  }

  function setCameraTexture(texture) {
    material.uniforms.uCam.value = texture;
    material.uniforms.uHasCam.value = texture ? 1 : 0;
  }

  function update({
    time = 0,
    dt = 1 / 60,
    brightness = 0.5,
    motion = 0,
    mouseX = 0,
    mouseY = 0,
    motionScale = 1,
  }) {
    if (disposed) return;

    group.rotation.y = Math.sin(time * 0.38) * 0.05 * motionScale + mouseX * 0.11;
    group.rotation.x = Math.sin(time * 0.22) * 0.025 * motionScale + mouseY * 0.055;

    const scale = damp(group.scale.x, targetScale, 3.5, dt);
    group.scale.setScalar(scale);
    group.position.y = damp(
      group.position.y,
      targetY + Math.sin(time * 0.5) * 0.07 * motionScale * (gated ? 0.5 : 1),
      3.5,
      dt,
    );

    const uniforms = material.uniforms;
    uniforms.uTime.value = time;
    uniforms.uBright.value = brightness;
    uniforms.uRoughness.value = damp(
      uniforms.uRoughness.value,
      (mode?.chrome?.roughness ?? 0.04) + motion * 0.03,
      3,
      dt,
    );
    uniforms.uIridescence.value = damp(
      uniforms.uIridescence.value,
      mode?.chrome?.iridescence ?? 0.5,
      3,
      dt,
    );
    uniforms.uMode.value = mode?.shaderIndex ?? 0;
    uniforms.uAccent.value.lerp(targetAccent, Math.min(1, dt * 2.5));

    dustMaterial.opacity = 0.08 + brightness * 0.34;
    dustMaterial.color.lerp(targetAccent, Math.min(1, dt * 2));

    const positions = dustGeometry.attributes.position.array;
    for (let i = 0; i < dustCount; i++) {
      positions[i * 3 + 1] += dt * dustSpeed[i] * (0.4 + motion * 2.4) * motionScale;
      positions[i * 3] += Math.sin(time * 0.3 + i) * dt * 0.06 * motionScale;
      if (positions[i * 3 + 1] > 4.4) positions[i * 3 + 1] = -4.4;
    }
    dustGeometry.attributes.position.needsUpdate = true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    dustGeometry.dispose();
    dustMaterial.dispose();
    material.dispose();
    if (wordmark) wordmark.geometry.dispose();
  }

  return {
    scene,
    camera,
    ready,
    layout,
    setGated,
    setMode,
    setCameraTexture,
    update,
    dispose,
    get hasWordmark() {
      return Boolean(wordmark);
    },
  };
}
