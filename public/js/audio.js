const ECHO_AUDIO_PREFIX = 'echo.us.audio.v1';

export function createAudio() {
  let context = null;
  let initialised = false;

  function ensureContext() {
    if (context) return context;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    } catch (e) {
      return null;
    }
    return context;
  }

  function requestResume() {
    const c = ensureContext();
    if (!c) return;
    if (c.state === 'suspended') {
      c.resume().catch(() => {});
    }
  }

  function initialiseAmbience() {
    if (!context || initialised) return;
    try {
      initialised = true;
      context._echoInit = true;
      const baseFreqs = [55, 110, 220];
      baseFreqs.forEach((f, i) => {
        try {
          const o = context.createOscillator();
          const g = context.createGain();
          const bp = context.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = f;
          bp.Q.value = 12;
          o.type = 'sine';
          o.frequency.value = f;
          g.gain.value = 0.008 / (i + 1);
          o.connect(bp);
          bp.connect(g);
          g.connect(context.destination);
          o.start();
        } catch (e) {
          // ignore per-tone init failures
        }
      });
    } catch (e) {
      // ignore ambient init failures
    }
  }

  function enable() {
    requestResume();
    initialiseAmbience();
  }

  function chime() {
    requestResume();
    const c = ensureContext();
    if (!c) return;
    const now = c.currentTime;
    [1400, 1800, 2200].forEach((f, i) => {
      try {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, now + i * 0.05);
        g.gain.linearRampToValueAtTime(0.04, now + i * 0.05 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.35);
        o.connect(g);
        g.connect(c.destination);
        o.start(now + i * 0.05);
        o.stop(now + i * 0.05 + 0.4);
      } catch (e) {
        // ignore per-tone play failures
      }
    });
  }

  function dispose() {
    if (context && context._echoInit) {
      try {
        context.close && context.close().catch(() => {});
      } catch (e) {
        // ignore
      }
      initialised = false;
    }
  }

  return {
    enable,
    chime,
    dispose,
  };
}
