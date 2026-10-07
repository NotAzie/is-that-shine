const CAM_WIDTH = 160;
const CAM_HEIGHT = 120;

function clampBrightness(value) {
  return Math.min(1, Math.max(0, value));
}

export function createCameraPipeline({ onReady }) {
  const video = document.getElementById('cam-video');
  const offscreen = document.createElement('canvas');
  offscreen.width = CAM_WIDTH;
  offscreen.height = CAM_HEIGHT;
  const ctx = offscreen.getContext('2d');

  let stream = null;
  let ready = false;
  let brightFrame = 0;
  let ghostBuffer = [];
  let brightness = 0.5;
  let ghost = 0;

  function estimateBrightness() {
    if (!ctx || ctx.canvas.width === 0 || ctx.canvas.height === 0) return;
    const d = ctx.getImageData(60, 40, 40, 30).data;
    let b = 0;
    for (let i = 0; i < d.length; i += 16) {
      b += (d[i] + d[i + 1] + d[i + 2]) / 3;
    }
    brightness = clampBrightness((b / (d.length / 16)) / 200);
  }

  function updateGhost() {
    try {
      ghostBuffer.push(ctx.getImageData(0, 0, offscreen.width, offscreen.height));
      if (ghostBuffer.length > 3) ghostBuffer.shift();
    } catch (e) {
      // ignore readback failures
    }
    ghost = ready && ghostBuffer.length > 1 ? 0.5 : 0;
  }

  function sample() {
    if (!ready || !video || video.readyState < 2) return null;
    ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

    brightFrame++;
    if (brightFrame % 6 === 0) {
      estimateBrightness();
    }
    if (brightFrame % 2 === 0) {
      updateGhost();
    }

    return offscreen;
  }

  function markReady() {
    ready = true;
    onReady && onReady();
  }

  function requestAccess() {
    if (ready) return Promise.resolve(true);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('mediaDevices not available'));
    }
    return navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      })
      .then((s) => {
        stream = s;
        video.srcObject = s;
        return video.play();
      })
      .then(() => {
        markReady();
        return true;
      })
      .catch((err) => {
        throw err;
      });
  }

  function teardown() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.srcObject = null;
    ready = false;
    brightness = 0.5;
    ghost = 0;
    ghostBuffer = [];
    brightFrame = 0;
  }

  return {
    get ready() {
      return ready;
    },
    get brightness() {
      return brightness;
    },
    get ghost() {
      return ghost;
    },
    sample,
    markReady,
    requestAccess,
    teardown,
  };
}
