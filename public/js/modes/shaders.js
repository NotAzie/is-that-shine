/**
 * One full-screen pass draws the whole scene.
 *
 * The same shader renders prism, fracture and void; `uMode` selects the SDF and
 * the colour response. Keeping a single program means a single compile, a
 * single set of uniforms, and no per-mode copy/paste.
 */

export const SCENE_VERTEX = /* glsl */ `
varying vec2 vUv;

void main() {
  // Pass the full quad UV through verbatim so the fragment shader always sees
  // 0..1 regardless of the underlying geometry transform.
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const SCENE_FRAGMENT = /* glsl */ `
varying vec2 vUv;

uniform float uTime;
uniform float uBright;
uniform float uGhost;
uniform float uRefract;
uniform float uGrain;
uniform float uMotion;
uniform float uSteps;
uniform float uHasCam;
uniform vec2  uMouse;
uniform vec2  uRes;
uniform int   uMode;
uniform sampler2D uCam;

#define PI 3.14159265359
#define MAX_DIST 22.0
#define MAX_STEPS 72
#define EPS 0.0035

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amp * noise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return value;
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float sdPrism(vec3 p, float h, float r) {
  const vec2 k = vec2(-0.866, 0.5);
  p.xy = abs(p.xy);
  p.xy -= 2.0 * min(dot(k, p.xy), 0.0) * k;
  vec2 d = vec2(
    length(p.xy - vec2(clamp(p.x, -r * 1.732, r * 1.732), r)) * sign(p.y - r),
    abs(p.z) - h
  );
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

vec3 accent() {
  if (uMode == 1) return vec3(1.0, 0.45, 0.75);
  if (uMode == 2) return vec3(0.62, 0.48, 1.0);
  return vec3(0.28, 0.72, 1.0);
}

vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + t));
}

float mapScene(vec3 p) {
  float breath = 1.0 + sin(uTime * 0.7) * 0.028 * uMotion;
  vec3 q = p / breath;

  // A slight resting rotation shows the body of the solid instead of a flat face.
  float ry = 0.34 + uMouse.x * 0.5 + uTime * 0.06 * uMotion;
  float rx = 0.12 + uMouse.y * 0.38;
  q.xz = rot(ry) * q.xz;
  q.yz = rot(rx) * q.yz;

  float d;

  if (uMode == 1) {
    d = sdBox(q, vec3(0.5, 0.5, 0.16));
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float a = fi * PI * 0.5 + uTime * (0.24 + fi * 0.045);
      vec3 c = vec3(cos(a) * 1.05, sin(a * 0.8 + fi) * 0.55, sin(a) * 1.05);
      vec3 size = vec3(0.28, 0.28, 0.10);
      d = min(d, sdBox(q - c, size));
    }
  } else if (uMode == 2) {
    float shell = abs(sdPrism(q, 1.12, 0.66)) - 0.065;
    float clip = length(q) - 1.95;
    d = max(shell, clip);
    d = min(d, sdBox(q, vec3(0.16, 0.16, 0.16)));
  } else {
    d = sdPrism(q, 1.12, 0.66);
  }

  return d * breath;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0018, -0.0018);
  return normalize(
    e.xyy * mapScene(p + e.xyy) +
    e.yyx * mapScene(p + e.yyx) +
    e.yxy * mapScene(p + e.yxy) +
    e.xxx * mapScene(p + e.xxx)
  );
}

vec3 environment(vec3 dir) {
  float height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = mix(vec3(0.015, 0.02, 0.045), vec3(0.22, 0.4, 0.62), pow(height, 2.2));
  sky += accent() * exp(-abs(dir.y) * 5.0) * 0.3;

  float key = pow(max(dot(dir, normalize(vec3(-0.4, 0.65, 0.7))), 0.0), 22.0);
  sky += vec3(0.9, 0.95, 1.0) * key * 1.5;

  float strip = pow(max(dot(dir, normalize(vec3(0.75, 0.1, 0.6))), 0.0), 34.0);
  sky += accent() * strip * 1.2;

  float violet = pow(max(dot(dir, normalize(vec3(0.2, -0.5, 0.8))), 0.0), 26.0);
  sky += vec3(0.55, 0.3, 1.0) * violet * 0.7;
  return sky;
}

vec3 cameraColor(vec2 uv, float aberration) {
  if (uHasCam < 0.5) return vec3(0.0);
  // Clamp chromatic-aberration UV offsets so the sampled colour never reads as
  // a smeared edge when the refracted ray lands outside the camera frame.
  vec2 s = clamp(uv + vec2(aberration, 0.0), 0.004, 0.996);
  float r = texture(uCam, s).r;
  s = clamp(uv, 0.004, 0.996);
  float g = texture(uCam, s).g;
  s = clamp(uv - vec2(aberration, 0.0), 0.004, 0.996);
  float b = texture(uCam, s).b;
  return vec3(r, g, b);
}

void main() {
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = (vUv * 2.0 - 1.0) * vec2(aspect, 1.0);

  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec3 rd = normalize(vec3(p, -1.8));

  float t = 0.0;
  bool hit = false;
  for (int i = 0; i < MAX_STEPS; i++) {
    if (float(i) >= uSteps) break;
    vec3 pos = ro + rd * t;
    float d = mapScene(pos);
    if (d < EPS) {
      hit = true;
      break;
    }
    t += d;
    if (t > MAX_DIST) break;
  }

  vec3 col;

  if (hit) {
    vec3 pos = ro + rd * t;
    vec3 n = normalAt(pos);

    vec3 refracted = refract(rd, n, mix(0.86, 0.58, uRefract));
    vec2 camUv = refracted.xy * 0.5 + 0.5;
    float wobble = (noise(camUv * 5.0 + uTime * 0.12) - 0.5) * 0.06;
    camUv += vec2(wobble, wobble * 0.6);

    vec3 cam = cameraColor(camUv, 0.003 + t * 0.0015);
    float lum = dot(cam, LUMA);
    cam = mix(vec3(lum), cam, 0.62);

    float facing = abs(dot(n, -rd));
    float fresnel = pow(1.0 - facing, 3.2);

    // Tie the spectrum to both the angle and the position on the solid so a
    // flat facet is never one uniform colour.
    float spectral = facing * 1.7 + pos.y * 0.22 + pos.x * 0.14 - pos.z * 0.1
      + uTime * 0.05 + float(uMode) * 0.12;
    vec3 rainbow = mix(spectrum(spectral), accent(), 0.34);

    float camMix = uMode == 1 ? 0.52 : uMode == 2 ? 0.16 : 0.36;
    float rainbowMix = uMode == 1 ? 0.26 : uMode == 2 ? 0.15 : 0.40;

    col = vec3(0.045, 0.055, 0.085);
    col = mix(col, cam, camMix * uBright);
    col = mix(col, rainbow, rainbowMix * (0.55 + 0.45 * uBright));
    col += accent() * fresnel * (0.35 + uBright * 0.7);
    col += vec3(0.62, 0.26, 1.0) * fresnel * fresnel * 0.32;

    // A synthetic studio reflection gives the facets depth even when there is
    // no camera to refract.
    vec3 reflected = environment(reflect(rd, n));
    col += reflected * (0.22 + uBright * 0.5) * (0.3 + fresnel);

    if (uHasCam < 0.5) {
      // Real dispersion: refract red, green and blue by slightly different
      // amounts so the body of the solid carries its own spectrum.
      float ior = mix(0.72, 0.6, uRefract);
      vec3 rr = refract(rd, n, ior - 0.02);
      vec3 gg = refract(rd, n, ior);
      vec3 bb = refract(rd, n, ior + 0.02);
      vec3 dispersed = vec3(
        environment(rr).r,
        environment(gg).g,
        environment(bb).b
      );
      col += dispersed * (0.28 + uBright * 0.55) * (0.35 + fresnel * 0.8);
    }

    // Gentle directional falloff keeps facets from reading as flat stickers.
    float lambert = max(dot(n, normalize(vec3(0.45, 0.9, 0.35))), 0.0);
    col *= 0.74 + lambert * 0.42;
    col += accent() * exp(-t * 0.55) * 0.06;

    if (uMode == 2) {
      col += accent() * smoothstep(0.55, 0.0, length(pos)) * (0.2 + uBright * 0.5);
    }

    vec3 lightDir = normalize(vec3(1.6, 2.4, 2.2));
    float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 72.0);
    col += vec3(0.9, 0.96, 1.0) * spec * (0.5 + uBright * 0.5);

    col *= 0.3 + uBright;

    // Distance fog keeps far facets from competing with the wordmark.
    col = mix(col, vec3(0.008, 0.012, 0.028), smoothstep(3.2, 14.0, t) * 0.55);
  } else {
    vec2 centered = vUv - 0.5;
    vec2 warp = centered * vec2(aspect, 1.0);

    float clouds = fbm(vUv * vec2(aspect, 1.0) * 2.4 + vec2(uTime * 0.015, -uTime * 0.011));
    col = vec3(0.006, 0.008, 0.020);
    col += accent() * pow(clouds, 3.5) * (0.10 + uBright * 0.14);
    col += accent() * exp(-length(warp) * 2.6) * (0.10 + uBright * 0.16);

    if (uHasCam > 0.5) {
      vec3 cam = cameraColor(vUv, 0.0);
      float lum = dot(cam, LUMA);
      col += cam * 0.05 * (0.3 + uBright);
      col *= 0.82 + lum * 0.25;
    }

    vec2 starCell = floor(vUv * uRes * 0.5);
    float star = pow(hash(starCell), 96.0);
    col += vec3(0.6, 0.8, 1.0) * star * (0.16 + uBright * 0.38);

    col *= smoothstep(1.2, 0.22, length(warp));
  }

  if (uHasCam > 0.5 && uGhost > 0.001) {
    vec3 trail = cameraColor(vUv + vec2(0.006, 0.0), 0.0);
    col += trail * 0.10 * uGhost;
  }

  vec2 vignetteUv = (vUv - 0.5) * vec2(aspect, 1.0);
  col *= 1.0 - 0.85 * smoothstep(0.35, 1.05, length(vignetteUv));

  col += (hash(gl_FragCoord.xy + floor(uTime * 24.0)) - 0.5) * 0.035 * uGrain;

  // Clamp before tone mapping so the tonemapping/colorspace passes never see
  // NaN from an undefined refract/reflect. Only the final colour is kept.
  col = max(col, 0.0);
  gl_FragColor = vec4(col, 1.0);

  // Three.js built-in passes: keep gamma/color-space handling but only when the
  // shader compiler recognises the built-ins. A raw `#include` spliced into an
  // ES module string is not guaranteed to match the runtime build, so wrap it
  // so a mismatch is a no-op instead of a compile failure.
  #if __VERSION__ >= 300
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #endif
}
`;
