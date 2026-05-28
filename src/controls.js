const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createInput() {
  const state = {
    mode: 'mouse',
    target: { x: 0, z: 0 },
    keys: new Set(),
    gyroBound: false,
    calibBeta: null,
    calibGamma: null,
  };

  const onPointerMove = (e) => {
    if (state.mode !== 'mouse') return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    state.target.x = clamp((e.clientX / w) * 2 - 1, -1, 1);
    state.target.z = clamp((e.clientY / h) * 2 - 1, -1, 1);
  };

  const onKeyDown = (e) => {
    state.keys.add(e.key.toLowerCase());
  };
  const onKeyUp = (e) => {
    state.keys.delete(e.key.toLowerCase());
  };

  const onOrient = (e) => {
    if (state.mode !== 'tilt') return;
    const beta = e.beta ?? 0;   // front/back (-180..180)
    const gamma = e.gamma ?? 0; // left/right (-90..90)
    if (state.calibBeta === null) {
      state.calibBeta = beta;
      state.calibGamma = gamma;
    }
    state.target.x = clamp((gamma - state.calibGamma) / 25, -1, 1);
    state.target.z = clamp((beta - state.calibBeta) / 25, -1, 1);
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function needsIosPermission() {
    return typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function';
  }

  // Must be called synchronously from a user-gesture handler on iOS Safari,
  // otherwise the permission prompt is suppressed and requestPermission()
  // resolves to 'denied' without ever showing.
  function requestGyroPermission() {
    if (typeof DeviceOrientationEvent === 'undefined') {
      return Promise.resolve({ ok: false, reason: 'DeviceOrientationEvent not supported on this browser' });
    }
    if (!needsIosPermission()) {
      // Android / desktop — no prompt, just attach.
      bindGyro();
      return Promise.resolve({ ok: true });
    }
    return DeviceOrientationEvent.requestPermission().then(
      (result) => {
        if (result !== 'granted') {
          return { ok: false, reason: `iOS motion permission ${result}` };
        }
        bindGyro();
        return { ok: true };
      },
      (err) => ({ ok: false, reason: 'requestPermission error: ' + (err && err.message || err) })
    );
  }

  function bindGyro() {
    if (state.gyroBound) return;
    window.addEventListener('deviceorientation', onOrient);
    state.gyroBound = true;
  }

  function setMode(mode) {
    state.mode = mode;
    state.target.x = 0;
    state.target.z = 0;
    state.calibBeta = null;
    state.calibGamma = null;
  }

  // Smoothed tilt value used by the game.
  const smoothed = { x: 0, z: 0 };

  function getTilt() {
    if (state.mode === 'keys') {
      const k = state.keys;
      const right = k.has('arrowright') || k.has('d') ? 1 : 0;
      const left = k.has('arrowleft') || k.has('a') ? 1 : 0;
      const down = k.has('arrowdown') || k.has('s') ? 1 : 0;
      const up = k.has('arrowup') || k.has('w') ? 1 : 0;
      state.target.x = right - left;
      state.target.z = down - up;
    }
    // Critically-damped smoothing toward target.
    const k = state.mode === 'mouse' ? 0.25 : 0.18;
    smoothed.x += (state.target.x - smoothed.x) * k;
    smoothed.z += (state.target.z - smoothed.z) * k;
    return smoothed;
  }

  function dispose() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    if (state.gyroBound) {
      window.removeEventListener('deviceorientation', onOrient);
    }
  }

  return { setMode, getTilt, dispose, requestGyroPermission, needsIosPermission };
}
