const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createInput() {
  const CALIB_SAMPLES = 5;
  const CALIB_TIMEOUT_MS = 2000;

  const state = {
    mode: 'mouse',
    target: { x: 0, z: 0 },
    keys: new Set(),
    gyroBound: false,
    calibSx: null,
    calibSy: null,
    calibrating: false,
    calibBuffer: [],
    calibResolve: null,
    calibTimeout: null,
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

  // Project the device's raw (beta, gamma) onto the user's current screen
  // frame so that "right on screen" always rolls the ball right, regardless
  // of whether the phone is held in portrait, landscape, or upside-down.
  // Angle is negated because iOS reports screen rotation with the opposite
  // handedness from the rotation matrix below; without the negation, both
  // axes are inverted in landscape (portrait is unaffected because angle=0).
  function deviceToScreen(beta, gamma) {
    const a = -(screen?.orientation?.angle ?? window.orientation ?? 0) * Math.PI / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return {
      sx: gamma * cos - beta * sin,
      sy: gamma * sin + beta * cos,
    };
  }

  const onOrient = (e) => {
    if (state.mode !== 'tilt') return;
    const beta = e.beta ?? 0;   // front/back (-180..180), device frame
    const gamma = e.gamma ?? 0; // left/right (-90..90), device frame
    const { sx, sy } = deviceToScreen(beta, gamma);

    if (state.calibrating) {
      state.calibBuffer.push({ sx, sy });
      if (state.calibBuffer.length >= CALIB_SAMPLES) {
        finishCalibration();
      }
      return;
    }

    if (state.calibSx === null) return; // not calibrated yet, hold neutral

    state.target.x = clamp((sx - state.calibSx) / 25, -1, 1);
    state.target.z = clamp((sy - state.calibSy) / 25, -1, 1);
  };

  function finishCalibration() {
    const n = state.calibBuffer.length;
    if (n > 0) {
      let sumX = 0, sumY = 0;
      for (const s of state.calibBuffer) { sumX += s.sx; sumY += s.sy; }
      state.calibSx = sumX / n;
      state.calibSy = sumY / n;
    } else {
      // Safety net: sensor never delivered. Use neutral baseline so the
      // game doesn't freeze waiting for samples that won't arrive.
      state.calibSx = 0;
      state.calibSy = 0;
    }
    state.calibrating = false;
    state.calibBuffer = [];
    if (state.calibTimeout) {
      clearTimeout(state.calibTimeout);
      state.calibTimeout = null;
    }
    if (state.calibResolve) {
      const resolve = state.calibResolve;
      state.calibResolve = null;
      resolve();
    }
  }

  function calibrate() {
    // Cancel any in-flight calibration cleanly so callers always get a resolve.
    if (state.calibrating && state.calibResolve) {
      finishCalibration();
    }
    state.calibrating = true;
    state.calibBuffer = [];
    state.calibSx = null;
    state.calibSy = null;
    return new Promise((resolve) => {
      state.calibResolve = resolve;
      state.calibTimeout = setTimeout(finishCalibration, CALIB_TIMEOUT_MS);
    });
  }

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
    // Switching modes invalidates the tilt baseline; tilt mode must re-call
    // calibrate() before emitting movement.
    state.calibSx = null;
    state.calibSy = null;
    state.calibrating = false;
    state.calibBuffer = [];
    if (state.calibTimeout) {
      clearTimeout(state.calibTimeout);
      state.calibTimeout = null;
    }
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

  return { setMode, getTilt, dispose, requestGyroPermission, needsIosPermission, calibrate };
}
