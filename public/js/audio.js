/**
 * Synthesised sound.
 *
 * A quiet drone sits under the piece and mode changes ring a short chime. The
 * context is only created from a user gesture, and the master gain can be muted
 * without tearing the graph down.
 */

const MODE_CHIMES = {
  prism: [1046.5, 1318.5, 1568.0],
  fracture: [880.0, 1174.7, 1396.9],
  void: [523.25, 659.25, 783.99],
};

export function createAudio({ enabled = true } = {}) {
  let context = null;
  let master = null;
  let ambience = null;
  let soundOn = enabled;

  function ensureContext() {
    if (context) return context;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      context = new AudioCtor();
      master = context.createGain();
      master.gain.value = soundOn ? 0.5 : 0;
      master.connect(context.destination);
    } catch {
      context = null;
    }
    return context;
  }

  function buildAmbience(ctx) {
    if (ambience) return ambience;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(master);

    const tones = [
      { frequency: 55, gain: 0.05 },
      { frequency: 110, gain: 0.03 },
      { frequency: 164.8, gain: 0.016 },
    ];

    for (const tone of tones) {
      try {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = tone.frequency;
        filter.type = 'bandpass';
        filter.frequency.value = tone.frequency;
        filter.Q.value = 9;
        gain.gain.value = tone.gain;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(bus);
        osc.start();
      } catch {
        /* ignore a single failed voice */
      }
    }

    bus.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 4);
    ambience = bus;
    return bus;
  }

  function resumeContext() {
    if (!context) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  function enable() {
    const ctx = ensureContext();
    if (!ctx) return;
    resumeContext();
    buildAmbience(ctx);
  }

  function setEnabled(next) {
    soundOn = Boolean(next);
    if (!context) return soundOn;
    const target = soundOn ? 0.5 : 0;
    try {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(target, context.currentTime, 0.08);
    } catch {
      master.gain.value = target;
    }
    if (soundOn) resumeContext();
    return soundOn;
  }

  function toggle() {
    return setEnabled(!soundOn);
  }

  function chime(mode = 'prism') {
    if (!soundOn) return;
    const ctx = ensureContext();
    if (!ctx) return;
    resumeContext();

    const notes = MODE_CHIMES[mode] || MODE_CHIMES.prism;
    notes.forEach((frequency, index) => {
      try {
        const start = ctx.currentTime + index * 0.06;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.05, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(start + 0.42);
      } catch {
        /* ignore a failed note */
      }
    });
  }

  function suspend() {
    if (context?.state === 'running') context.suspend().catch(() => {});
  }

  function resume() {
    if (soundOn) resumeContext();
  }

  function destroy() {
    try {
      context?.close();
    } catch {
      /* ignore */
    }
    context = null;
    master = null;
    ambience = null;
  }

  return {
    enable,
    chime,
    toggle,
    setEnabled,
    suspend,
    resume,
    destroy,
    get enabled() {
      return soundOn;
    },
    get ready() {
      return Boolean(context);
    },
  };
}
