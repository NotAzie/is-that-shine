export function createAudio() {
  let context = null;

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

  function enable() {
    const c = ensureContext();
    if (!c) return;
    if (c.state === 'suspended') {
      c.resume().catch(() => {});
    }
    if (!c._echoInit) {
      c._echoInit = true;
      [55, 110, 220].forEach((f, i) => {
        try {
          const o = c.createOscillator();
          const g = c.createGain();
          const bp = c.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = f;
          bp.Q.value = 12;
          o.type = 'sine';
          o.frequency.value = f;
          g.gain.value = 0.008 / (i + 1);
          o.connect(bp);
          bp.connect(g);
          g.connect(c.destination);
          o.start();
        } catch (e) {
          // ignore per-tone init failures
        }
      });
    }
  }

  function chime() {
    const c = ensureContext();
    if (!c) return;
    if (c.state === 'suspended') {
      c.resume().catch(() => {});
    }
    [1400, 1800, 2200].forEach((f, i) => {
      try {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, c.currentTime + i * 0.05);
        g.gain.linearRampToValueAtTime(0.04, c.currentTime + i * 0.05 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.05 + 0.35);
        o.connect(g);
        g.connect(c.destination);
        o.start(c.currentTime + i * 0.05);
        o.stop(c.currentTime + i * 0.05 + 0.4);
      } catch (e) {
        // ignore per-tone play failures
      }
    });
  }

  return {
    enable,
    chime,
  };
}
