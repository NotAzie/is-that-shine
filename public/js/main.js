import { createShell } from './shell.js';
import { createCameraPipeline } from './camera_pipeline.js';
import { createModes } from './modes/index.js';
import { createIdentity } from './identity.js';
import { createPresets } from './presets.js';
import { createAudio } from './audio.js';

let shellApi = null;

export function run() {
  const presets = createPresets();
  const audio = createAudio();
  const cameraPipeline = createCameraPipeline({
    onReady: () => {
      audio.enable();
    },
  });
  const modes = createModes();
  const identity = createIdentity({
    onModeChange: (mode) => {
      modes.select(mode);
      presets.setActiveMode(mode);
    },
  });
  const shell = createShell({
    modes: modes.list(),
    onModeSelect: (mode) => {
      identity.setMode(mode);
      presets.setActiveMode(mode);
      audio.chime();
    },
    onPresetLoad: () => {
      const current = presets.active();
      if (current) {
        identity.apply(current);
        modes.select(current.mode);
      }
    },
    onCameraReady: () => {
      // gate opens once the pipeline reports ready, not on the raw request.
    },
  });

  identity.setMode(presets.active()?.mode ?? 'prism');
  shell.start({
    modes,
    identity,
    presets,
    audio,
    cameraPipeline,
  });
  shellApi = shell;
  shellApi.onCameraReady && shellApi.onCameraReady();

}
