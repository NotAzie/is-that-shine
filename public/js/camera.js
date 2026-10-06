import * as THREE from 'three';
import { clamp, clamp01, damp } from './utils.js';

/**
 * Camera pipeline.
 *
 * Owns permission, the <video> element, a small mirrored copy of the feed, the
 * light/motion metering, and the texture the shader samples. Nothing here ever
 * leaves the device: the only sink is a canvas on this page.
 */

export const SAMPLE_WIDTH = 160;
export const SAMPLE_HEIGHT = 120;
export const SAMPLE_INTERVAL_MS = 33; // ~30 fps of texture uploads
export const METER_INTERVAL = 3; // meter every third sampled frame
export const EXPOSURE_TARGET = 0.42;
export const EXPOSURE_MIN = 0.55;
export const EXPOSURE_MAX = 3.4;

/** Convert metered luminance plus exposure gain into a 0..1 light level. */
export function exposureToBrightness(meanLuma, gain) {
  return clamp01(Math.pow(clamp01(meanLuma * gain), 0.85));
}

/** One step of auto-exposure; frame-rate independent and bounded. */
export function updateExposureGain(gain, meanLuma, dt) {
  const current = clamp01(meanLuma * gain);
  const correction = (EXPOSURE_TARGET - current) * 1.6 * dt;
  return clamp(gain * (1 + correction), EXPOSURE_MIN, EXPOSURE_MAX);
}

export const CAMERA_STATES = Object.freeze([
  'idle',
  'requesting',
  'live',
  'denied',
  'unsupported',
  'error',
]);

export function createCamera({ onStatus = () => {} }) {
  // The pipeline owns its video element: a fresh one per instance avoids the
  // stale-media state that a reused element can fall into after a stop/start.
  const video = document.createElement('video');
  video.className = 'camera-feed';
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('aria-hidden', 'true');
  document.body.append(video);

  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_WIDTH;
  canvas.height = SAMPLE_HEIGHT;

  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.mapping = THREE.EquirectangularReflectionMapping;

  let status = 'idle';
  let errorMessage = '';
  let stream = null;
  const facingMode = 'user';
  let gain = 1;
  let brightness = 0;
  let motion = 0;
  let lastDraw = 0;
  let frame = 0;
  let previousLuma = null;
  let pending = null;
  let destroyed = false;

  function setStatus(next, message = '') {
    if (status === next && errorMessage === message) return;
    status = next;
    errorMessage = message;
    onStatus({ status, message, facingMode });
  }

  function clearFrame() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    texture.needsUpdate = true;
  }

  function meter() {
    let data;
    try {
      const width = 40;
      const height = 30;
      data = ctx.getImageData(
        (SAMPLE_WIDTH - width) / 2,
        (SAMPLE_HEIGHT - height) / 2,
        width,
        height,
      ).data;
    } catch {
      return;
    }

    let sum = 0;
    let diff = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 16) {
      const luma = (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
      sum += luma;
      if (previousLuma && count < previousLuma.length) {
        diff += Math.abs(luma - previousLuma[count]);
      }
      count++;
    }

    const mean = count ? sum / count : 0;
    const delta = count > 1 ? diff / (count - 1) : 0;

    previousLuma = new Float32Array(count);
    let index = 0;
    for (let i = 0; i < data.length; i += 16) {
      previousLuma[index++] =
        (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
    }

    gain = updateExposureGain(gain, mean, 0.28);
    brightness = damp(brightness, exposureToBrightness(mean, gain), 5, 0.28);
    motion = damp(motion, clamp01(delta * 9), 3.5, 0.28);
    texture.needsUpdate = true;
  }

  /**
   * Draws and uploads a new frame when due. Returns true when the texture
   * changed, so callers can skip work when the camera is idle.
   */
  function sample(now = performance.now(), dt = 1 / 60) {
    if (status !== 'live' || !video || video.readyState < 2) {
      if (status !== 'live') brightness = damp(brightness, 0, 3, dt);
      return false;
    }

    if (now - lastDraw < SAMPLE_INTERVAL_MS) return false;
    lastDraw = now;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(SAMPLE_WIDTH, 0);
    ctx.scale(-1, 1);
    try {
      ctx.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    } catch {
      return false;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    texture.needsUpdate = true;
    frame++;
    if (frame % METER_INTERVAL === 0) meter();

    return true;
  }

  function stopTracks() {
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    video.srcObject = null;
  }

  async function start() {
    if (destroyed) return { ok: false, status, message: errorMessage };
    if (pending) return pending;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported', 'This browser cannot reach a camera.');
      return { ok: false, status, message: errorMessage };
    }

    setStatus('requesting');
    pending = (async () => {
      stopTracks();
      try {
        const media = await Promise.race([
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode,
            },
          }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Camera request timed out')), 15000);
          }),
        ]);
        if (destroyed) {
          for (const track of media.getTracks()) track.stop();
          return { ok: false, status, message: 'destroyed' };
        }

        stream = media;
        video.srcObject = media;
        video.muted = true;
        video.playsInline = true;

        // `play()` can stay pending indefinitely in some embedded contexts.
        // Kick it off, but wait on actual frame readiness with a hard timeout.
        const playing = video.play();
        playing?.catch?.(() => {});
        await new Promise((resolve) => {
          if (video.readyState >= 2) return resolve();
          const done = () => {
            video.removeEventListener('loadeddata', done);
            resolve();
          };
          video.addEventListener('loadeddata', done, { once: true });
          setTimeout(done, 2500);
        });

        gain = 1;
        brightness = 0.3;
        motion = 0;
        previousLuma = null;
        clearFrame();
        setStatus('live');
        return { ok: true, status };
      } catch (error) {
        const name = error?.name || 'Error';
        const denied = name === 'NotAllowedError' || name === 'SecurityError';
        setStatus(denied ? 'denied' : 'error', error?.message || name);
        clearFrame();
        return { ok: false, status, message: errorMessage };
      } finally {
        pending = null;
      }
    })();

    return pending;
  }

  function stop() {
    stopTracks();
    brightness = 0;
    motion = 0;
    previousLuma = null;
    clearFrame();
    if (status !== 'unsupported') setStatus('idle');
  }

  function destroy() {
    destroyed = true;
    stopTracks();
    video.remove();
    texture.dispose();
  }

  clearFrame();

  return {
    texture,
    sample,
    start,
    stop,
    destroy,
    get status() {
      return status;
    },
    get message() {
      return errorMessage;
    },
    get brightness() {
      return clamp01(brightness);
    },
    get motion() {
      return clamp01(motion);
    },
    get facingMode() {
      return facingMode;
    },
    get isLive() {
      return status === 'live';
    },
    get frameCanvas() {
      return canvas;
    },
  };
}
