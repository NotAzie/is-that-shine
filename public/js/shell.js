/**
 * The DOM shell.
 *
 * Owns everything the visitor can touch: the gate, the HUD status, the control
 * dock, presets, the help dialog, toasts, and the custom cursor. It knows
 * nothing about WebGL; the app calls back into the stage through the handlers
 * passed to `createShell`.
 */

const ICONS = {
  camera:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3l1.6-2.1h6.8L17 8.5h3v9.2H4z"/><circle cx="12" cy="13" r="3.1"/></svg>',
  snapshot:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3l1.6-2.1h6.8L17 8.5h3v9.2H4z"/><circle cx="12" cy="13" r="3.1"/><path d="M18.5 5.2v3"/></svg>',
  sound:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h3l4-3v10l-4-3H4z"/><path d="M15 9.2a4 4 0 0 1 0 5.6"/><path d="M17.6 6.8a7.6 7.6 0 0 1 0 10.4"/></svg>',
  muted:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h3l4-3v10l-4-3H4z"/><path d="M16 9.5l4.5 5M20.5 9.5L16 14.5"/></svg>',
  fullscreen:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>',
  exitFullscreen:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5"/></svg>',
  help:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><path d="M9.6 9.2a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2-2.4 3.6"/><path d="M12 17.1h.01"/></svg>',
};

const CAMERA_LABELS = {
  idle: 'reflection off',
  requesting: 'asking for reflection',
  live: 'reflection live',
  denied: 'reflection blocked',
  unsupported: 'reflection unavailable',
  error: 'reflection interrupted',
};

const ACTION_BUTTONS = [
  { id: 'camera', label: 'Camera', icon: 'camera', toggle: true },
  { id: 'snapshot', label: 'Snapshot', icon: 'snapshot' },
  { id: 'sound', label: 'Sound', icon: 'sound', toggle: true },
  { id: 'fullscreen', label: 'Fullscreen', icon: 'fullscreen', toggle: true },
  { id: 'help', label: 'Help', icon: 'help' },
];

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion() {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

export function showFatal(message) {
  const overlay = document.getElementById('fatal');
  if (!overlay) return;
  const detail = overlay.querySelector('[data-fatal-message]');
  if (detail) detail.textContent = message || 'Something went wrong while starting the piece.';
  overlay.hidden = false;
  overlay.querySelector('button')?.focus();
}

export function createShell({ modes, callbacks }) {
  const dom = {
    body: document.body,
    gate: document.getElementById('gate'),
    allow: document.getElementById('allow'),
    skip: document.getElementById('skip'),
    gateMessage: document.getElementById('gate-message'),
    dock: document.getElementById('dock'),
    modeGroup: document.getElementById('mode-group'),
    presetList: document.getElementById('preset-list'),
    saveLook: document.getElementById('save-look'),
    actions: document.getElementById('dock-actions'),
    status: document.getElementById('status'),
    statusLabel: document.getElementById('status-label'),
    hud: document.getElementById('hud'),
    corners: document.getElementById('corners'),
    psych: document.getElementById('psych'),
    cursor: document.getElementById('cursor'),
    cursorRing: document.getElementById('cursor-ring'),
    toast: document.getElementById('toast'),
    help: document.getElementById('help'),
    helpClose: document.getElementById('help-close'),
    scanlines: document.getElementById('scanlines'),
  };

  const actions = new Map();
  let toastTimer = 0;
  let started = false;
  let reducer = prefersReducedMotion();
  let pointer = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    ringX: window.innerWidth / 2,
    ringY: window.innerHeight / 2,
    visible: false,
  };
  let currentMode = modes[0]?.id ?? 'prism';

  // ── build controls ────────────────────────────────────────────
  dom.modeGroup.innerHTML = '';
  for (const mode of modes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode';
    button.dataset.mode = mode.id;
    button.setAttribute('aria-pressed', String(mode.id === currentMode));
    button.innerHTML = `<span class="mode__label">${mode.label}</span>`;
    button.addEventListener('click', () => callbacks.onSelectMode?.(mode.id));
    dom.modeGroup.append(button);
  }

  dom.actions.innerHTML = '';
  for (const action of ACTION_BUTTONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn';
    button.id = `action-${action.id}`;
    button.dataset.action = action.id;
    button.setAttribute('aria-label', action.label);
    button.title = action.label;
    if (action.toggle) button.setAttribute('aria-pressed', 'false');
    button.innerHTML = ICONS[action.icon];
    button.addEventListener('click', () => callbacks.onAction?.(action.id));
    dom.actions.append(button);
    actions.set(action.id, button);
  }

  // ── gate ──────────────────────────────────────────────────────
  function setGateBusy(busy) {
    dom.allow.disabled = busy;
    dom.skip.disabled = busy;
    dom.gate.toggleAttribute('data-busy', busy);
  }

  dom.allow.addEventListener('click', () => {
    if (started) return;
    setGateBusy(true);
    setGateMessage('asking your browser for the camera…');
    // The app owns the real camera lifecycle; the shell only hands the
    // visitor's choice back to it.
    callbacks.onEnterCamera?.();
  });

  dom.skip.addEventListener('click', () => {
    if (started) return;
    setGateBusy(true);
    // The app owns the real camera lifecycle; the shell only hands the
    // visitor's choice back to it.
    callbacks.onEnterWithoutCamera?.();
  });

  dom.gateMessage.setAttribute('data-tone', 'neutral');
  dom.gateMessage.textContent = 'no recording · no upload · no account';

  function setGateMessage(text, tone = 'neutral') {
    if (!dom.gateMessage) return;
    dom.gateMessage.textContent = text;
    dom.gateMessage.dataset.tone = tone;
  }

  function setGateBusyState(busy) {
    setGateBusy(busy);
  }

  // ── presets ───────────────────────────────────────────────────
  function renderPresets(presets, activeId, isCustom) {
    dom.presetList.innerHTML = '';
    for (const preset of presets) {
      const wrap = document.createElement('div');
      wrap.className = 'chip-wrap';
      wrap.dataset.preset = preset.id;

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.preset = preset.id;
      chip.setAttribute('aria-pressed', String(preset.id === activeId));
      chip.textContent = preset.name;
      chip.addEventListener('click', () => callbacks.onSelectPreset?.(preset.id));
      wrap.append(chip);

      if (isCustom(preset.id)) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'chip__remove';
        remove.dataset.remove = preset.id;
        remove.setAttribute('aria-label', `delete ${preset.name}`);
        remove.title = `delete ${preset.name}`;
        remove.textContent = '×';
        remove.addEventListener('click', () => callbacks.onRemoveLook?.(preset.id));
        wrap.append(remove);
      }

      dom.presetList.append(wrap);
    }
  }

  dom.saveLook.addEventListener('click', () => callbacks.onSaveLook?.());

  // ── help ──────────────────────────────────────────────────────
  function openHelp() {
    if (!dom.help) return;
    if (typeof dom.help.showModal === 'function') dom.help.showModal();
    else dom.help.setAttribute('open', '');
    dom.helpClose?.focus();
  }

  function closeHelp() {
    if (!dom.help) return;
    if (typeof dom.help.close === 'function') dom.help.close();
    else dom.help.removeAttribute('open');
  }

  dom.helpClose?.addEventListener('click', closeHelp);
  dom.help?.addEventListener('click', (event) => {
    if (event.target === dom.help) closeHelp();
  });

  // ── pointer and cursor ────────────────────────────────────────
  function updatePointer(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.visible = true;
    callbacks.onPointerMove?.({
      x: event.clientX,
      y: event.clientY,
      nx: (event.clientX / window.innerWidth) * 2 - 1,
      ny: -(event.clientY / window.innerHeight) * 2 + 1,
      pointerType: event.pointerType,
    });
  }

  window.addEventListener('pointermove', updatePointer, { passive: true });
  window.addEventListener('pointerdown', (event) => {
    updatePointer(event);
    if (!started || reducer || event.pointerType !== 'mouse') return;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = `${event.clientX}px`;
    ripple.style.top = `${event.clientY}px`;
    dom.body.append(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  });

  function setCursorEnabled(enabled) {
    dom.body.classList.toggle('has-custom-cursor', enabled);
  }

  function tick(dt) {
    if (!pointer.visible) return;
    pointer.ringX += (pointer.x - pointer.ringX) * Math.min(1, dt * 9);
    pointer.ringY += (pointer.y - pointer.ringY) * Math.min(1, dt * 9);
    dom.cursor.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%)`;
    dom.cursorRing.style.transform = `translate3d(${pointer.ringX}px, ${pointer.ringY}px, 0) translate(-50%, -50%)`;
  }

  // ── reveal / status ───────────────────────────────────────────
  function hideGate() {
    started = true;
    dom.gate.classList.add('is-leaving');
    dom.gate.setAttribute('aria-hidden', 'true');
    dom.dock.hidden = false;
    dom.body.classList.add('is-started');
    window.setTimeout(() => {
      dom.gate.hidden = true;
      dom.dock.classList.add('is-visible');
      dom.hud.classList.add('is-visible');
      dom.corners.classList.add('is-visible');
      dom.modeGroup.querySelector('.mode[aria-pressed="true"]')?.focus({ preventScroll: true });
    }, reducer ? 0 : 700);
  }

  function setMode(modeId) {
    currentMode = modeId;
    let activeButton = null;
    dom.modeGroup.querySelectorAll('.mode').forEach((button) => {
      const active = button.dataset.mode === modeId;
      button.setAttribute('aria-pressed', String(active));
      if (active) activeButton = button;
    });
    dom.body.dataset.mode = modeId;
    // Keep keyboard focus on the mode the visitor just chose instead of
    // leaving a focus ring on the previous one, which reads as a second
    // selected state.
    if (activeButton && dom.modeGroup.contains(document.activeElement)) {
      activeButton.focus({ preventScroll: true });
    }
  }

  function setStatus({ camera = 'idle', detail = '' } = {}) {
    const label = CAMERA_LABELS[camera] ?? CAMERA_LABELS.idle;
    dom.status.dataset.camera = camera;
    dom.statusLabel.textContent = detail ? `${label} · ${detail}` : label;
  }

  function setActionState(action, { pressed, icon, label } = {}) {
    const button = actions.get(action);
    if (!button) return;
    if (typeof pressed === 'boolean') button.setAttribute('aria-pressed', String(pressed));
    if (icon && ICONS[icon]) button.innerHTML = ICONS[icon];
    if (label) {
      button.setAttribute('aria-label', label);
      button.title = label;
    }
  }

  function setSound(on) {
    setActionState('sound', {
      pressed: on,
      icon: on ? 'sound' : 'muted',
      label: on ? 'Mute sound' : 'Enable sound',
    });
  }

  function setFullscreen(on) {
    setActionState('fullscreen', {
      pressed: on,
      icon: on ? 'exitFullscreen' : 'fullscreen',
      label: on ? 'Exit fullscreen' : 'Fullscreen',
    });
  }

  function setCameraPressed(on) {
    setActionState('camera', {
      pressed: on,
      label: on ? 'Turn camera off' : 'Turn camera on',
    });
  }

  function toast(message, { tone = 'info', duration = 2600 } = {}) {
    if (!dom.toast) return;
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.dataset.tone = tone;
    dom.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-visible'), duration);
  }

  function showPhrase(text) {
    dom.psych.textContent = text;
    dom.psych.classList.add('is-visible');
  }

  function hidePhrase() {
    dom.psych.classList.remove('is-visible');
  }

  function setReducedMotion(value) {
    reducer = value;
    dom.body.classList.toggle('is-reduced-motion', value);
    setCursorEnabled(value ? false : window.matchMedia?.('(pointer: fine)').matches ?? false);
    if (value) dom.body.classList.add('no-ripple');
    else dom.body.classList.remove('no-ripple');
  }

  function setDebug(text) {
    dom.status.dataset.debug = text ? 'true' : 'false';
    if (text) dom.statusLabel.textContent = text;
  }

  return {
    hideGate,
    setGateMessage,
    setGateBusy: setGateBusyState,
    renderPresets,
    setMode,
    setStatus,
    setSound,
    setFullscreen,
    setCameraPressed,
    setActionState,
    toast,
    showPhrase,
    hidePhrase,
    setReducedMotion,
    setCursorEnabled,
    setDebug,
    openHelp,
    closeHelp,
    tick,
    isHelpOpen: () => Boolean(dom.help?.open),
    get started() {
      return started;
    },
    get reducedMotion() {
      return reducer;
    },
    dom,
  };
}
