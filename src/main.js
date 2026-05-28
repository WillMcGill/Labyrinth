import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { parseLevel, CELL } from './maze.js';
import { createInput } from './controls.js';

const MAX_TILT = Math.PI / 9;         // 20° max board tilt
const BALL_RADIUS = 0.28;
const WALL_HEIGHT = 0.7;
const FLOOR_THICKNESS = 0.2;
const FALL_THRESHOLD = -4;            // ball Y below this → fell into a hole

// --- Procedural canvas textures ---------------------------------------------

function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');

  // Base brown plank colour
  ctx.fillStyle = '#6f4e2a';
  ctx.fillRect(0, 0, 256, 256);

  // Four horizontal planks, each a slightly different shade
  for (let p = 0; p < 4; p++) {
    const s = 0.85 + Math.random() * 0.3;
    ctx.fillStyle = `rgba(${(s * 111) | 0},${(s * 78) | 0},${(s * 42) | 0},0.5)`;
    ctx.fillRect(0, p * 64, 256, 64);
  }

  // Plank seams
  ctx.strokeStyle = 'rgba(20, 12, 5, 0.85)';
  ctx.lineWidth = 2;
  for (let y = 64; y < 256; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  // Grain — wavy darker lines across each plank
  ctx.strokeStyle = 'rgba(40, 22, 8, 0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const y0 = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    for (let x = 0; x <= 256; x += 8) {
      ctx.lineTo(x, y0 + Math.sin(x * 0.05 + i) * 2);
    }
    ctx.stroke();
  }

  // A few knots
  for (let i = 0; i < 3; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 4 + Math.random() * 6;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(20,10,3,0.9)');
    g.addColorStop(1, 'rgba(20,10,3,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeStoneTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');

  // Mid-gray base
  ctx.fillStyle = '#7d7872';
  ctx.fillRect(0, 0, 256, 256);

  // Irregular stone shapes
  for (let i = 0; i < 14; i++) {
    const cx = Math.random() * 256;
    const cy = Math.random() * 256;
    const r = 28 + Math.random() * 30;
    const s = 0.7 + Math.random() * 0.5;
    ctx.fillStyle = `rgb(${(s * 125) | 0},${(s * 120) | 0},${(s * 114) | 0})`;
    ctx.beginPath();
    const sides = 5 + ((Math.random() * 3) | 0);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const rr = r * (0.8 + Math.random() * 0.4);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Cracks
  ctx.strokeStyle = 'rgba(25, 20, 15, 0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Pixel-noise speckle for rough feel
  const img = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 30;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

async function main() {
  await RAPIER.init();

  const level = parseLevel();
  if (!level.start) throw new Error('Level has no start (S)');
  if (!level.goal) throw new Error('Level has no goal (G)');

  // --- Renderer & scene -----------------------------------------------------
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);
  scene.fog = new THREE.Fog(0x0b0d12, 22, 42);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  // Direction the camera looks at the origin from; distance is sized by aspect.
  const cameraDir = new THREE.Vector3(0, 17, 13).normalize();
  // Half-diagonal of the board's bounding rect (plus margin) we want in view.
  const BOARD_HALF_EXTENT = 7.5;

  // Procedural studio environment for metallic-material reflections.
  // Set as scene.environment only — scene.background stays the dark color
  // so the maze still has its current look; just the metallic ball will
  // pick up reflections from this envmap.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambient);

  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(8, 16, 6);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  const s = 10;
  dir.shadow.camera.left = -s;
  dir.shadow.camera.right = s;
  dir.shadow.camera.top = s;
  dir.shadow.camera.bottom = -s;
  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 40;
  scene.add(dir);

  // --- Physics --------------------------------------------------------------
  // Earth-standard gravity, paired with steel-marble ball parameters below.
  const world = new RAPIER.World(new RAPIER.Vector3(0, -9.81, 0));

  const boardBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
  );

  // --- Visual board group ---------------------------------------------------
  const boardGroup = new THREE.Group();
  scene.add(boardGroup);

  const matFloor = new THREE.MeshStandardMaterial({
    map: makeWoodTexture(),
    roughness: 0.85,
    metalness: 0,
  });
  const matWall = new THREE.MeshStandardMaterial({
    map: makeStoneTexture(),
    roughness: 0.95,
    metalness: 0,
  });
  const matHole = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const matGoal = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x0c5a44,
    emissiveIntensity: 0.6,
    roughness: 0.35,
  });
  const matBall = new THREE.MeshStandardMaterial({
    color: 0xd6d8dc,    // light neutral steel
    roughness: 0.12,    // near-mirror finish
    metalness: 1.0,     // fully metallic — reflections come from scene.environment
  });

  // Floor tiles
  const floorGeom = new THREE.BoxGeometry(CELL, FLOOR_THICKNESS, CELL);
  for (const { x, z } of level.floors) {
    const mesh = new THREE.Mesh(floorGeom, matFloor);
    mesh.position.set(x, -FLOOR_THICKNESS / 2, z);
    mesh.receiveShadow = true;
    boardGroup.add(mesh);

    world.createCollider(
      RAPIER.ColliderDesc
        .cuboid(CELL / 2, FLOOR_THICKNESS / 2, CELL / 2)
        .setTranslation(x, -FLOOR_THICKNESS / 2, z)
        .setFriction(0.55)
        .setRestitution(0.05),
      boardBody
    );
  }

  // Hole visuals (no collider — ball falls through the gap in the floor)
  const holeGeom = new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92);
  for (const { x, z } of level.holes) {
    const mesh = new THREE.Mesh(holeGeom, matHole);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, -FLOOR_THICKNESS - 0.002, z);
    boardGroup.add(mesh);
  }

  // Walls
  const wallGeom = new THREE.BoxGeometry(CELL, WALL_HEIGHT, CELL);
  for (const { x, z } of level.walls) {
    const mesh = new THREE.Mesh(wallGeom, matWall);
    mesh.position.set(x, WALL_HEIGHT / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    boardGroup.add(mesh);

    world.createCollider(
      RAPIER.ColliderDesc
        .cuboid(CELL / 2, WALL_HEIGHT / 2, CELL / 2)
        .setTranslation(x, WALL_HEIGHT / 2, z)
        .setFriction(0.2),
      boardBody
    );
  }

  // Invisible ceiling to cap how high the ball can rise. Attached to the
  // board body so it tilts in lockstep, keeping the constraint correct in
  // board-local space at any tilt. Positioned at wall-top + 10% of ball
  // height — only a sliver of clearance, so the ball is firmly contained
  // by the walls and can never lift more than a tenth of its diameter off
  // a wall top.
  const CEIL_THICK = 0.02;
  const CEIL_ABOVE_WALL = 0.10 * (BALL_RADIUS * 2);
  const boardHalfX = (level.cols * CELL) / 2;
  const boardHalfZ = (level.rows * CELL) / 2;
  world.createCollider(
    RAPIER.ColliderDesc
      .cuboid(boardHalfX, CEIL_THICK / 2, boardHalfZ)
      .setTranslation(0, WALL_HEIGHT + CEIL_ABOVE_WALL + CEIL_THICK / 2, 0)
      .setFriction(0.05)
      .setRestitution(0),
    boardBody
  );

  // Goal pad + sensor
  const goalMesh = new THREE.Mesh(
    new THREE.BoxGeometry(CELL * 0.85, 0.06, CELL * 0.85),
    matGoal
  );
  goalMesh.position.set(level.goal.x, 0.04, level.goal.z);
  boardGroup.add(goalMesh);

  const goalCollider = world.createCollider(
    RAPIER.ColliderDesc
      .cuboid(CELL / 2, 0.5, CELL / 2)
      .setTranslation(level.goal.x, 0.5, level.goal.z)
      .setSensor(true),
    boardBody
  );

  // --- Ball -----------------------------------------------------------------
  const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 32, 24),
    matBall
  );
  ballMesh.castShadow = true;
  scene.add(ballMesh);

  // Steel-marble parameters: high density relative to surroundings, moderate
  // friction (steel on most surfaces), moderate restitution (real steel
  // marbles bounce noticeably), and very low damping because a heavy ball
  // has negligible air drag.
  const ballBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(level.start.x, BALL_RADIUS, level.start.z)
      .setLinearDamping(0.05)
      .setAngularDamping(0.1)
      .setCcdEnabled(true)
  );
  const ballCollider = world.createCollider(
    RAPIER.ColliderDesc
      .ball(BALL_RADIUS)
      .setFriction(0.4)
      .setRestitution(0.3)
      .setDensity(7.85),         // steel: 7,850 kg/m³ relative to water 1,000
    ballBody
  );

  // --- Input & HUD ----------------------------------------------------------
  const input = createInput();
  const modeSelect = document.getElementById('input-mode');
  const banner = document.getElementById('banner');
  const statusEl = document.getElementById('status');
  const resetBtn = document.getElementById('reset');

  const motionOverlay = document.getElementById('motion-overlay');
  const motionEnableBtn = document.getElementById('motion-enable');
  const motionCancelBtn = document.getElementById('motion-cancel');
  const motionErrorEl = document.getElementById('motion-error');
  const recenterBtn = document.getElementById('recenter');

  let paused = false;
  function pauseForCalibration() {
    paused = true;
    ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  function resumeAfterCalibration() {
    paused = false;
  }

  function setActiveMode(mode) {
    input.setMode(mode);
    recenterBtn.hidden = mode !== 'tilt';
    statusEl.textContent = hintFor(mode);
  }

  function calibrateAndPlay() {
    pauseForCalibration();
    input.calibrate().then(resumeAfterCalibration);
  }

  function tryEnableTilt() {
    motionErrorEl.textContent = '';
    // requestPermission() must be called directly inside the click handler
    // for iOS to count the activation. No awaits before this call.
    input.requestGyroPermission().then((result) => {
      motionOverlay.hidden = true;
      if (!result.ok) {
        statusEl.textContent = result.reason + ' · falling back to mouse';
        modeSelect.value = 'mouse';
        setActiveMode('mouse');
        return;
      }
      setActiveMode('tilt');
      calibrateAndPlay();
    });
  }

  motionEnableBtn.addEventListener('click', tryEnableTilt);
  motionCancelBtn.addEventListener('click', () => {
    motionOverlay.hidden = true;
    modeSelect.value = 'mouse';
    setActiveMode('mouse');
  });
  recenterBtn.addEventListener('click', calibrateAndPlay);

  // Rotating the device invalidates the tilt baseline because the same
  // physical hold produces different beta/gamma when projected onto the new
  // screen frame. Re-run calibration automatically while in tilt mode.
  function onOrientationChange() {
    if (modeSelect.value === 'tilt' && !recenterBtn.hidden) {
      calibrateAndPlay();
    }
  }
  window.addEventListener('orientationchange', onOrientationChange);
  if (screen && screen.orientation && typeof screen.orientation.addEventListener === 'function') {
    screen.orientation.addEventListener('change', onOrientationChange);
  }

  modeSelect.addEventListener('change', () => {
    const mode = modeSelect.value;
    if (mode === 'tilt' && input.needsIosPermission()) {
      // iOS path: show overlay so the user taps a button (real activation).
      motionErrorEl.textContent = '';
      motionOverlay.hidden = false;
      return;
    }
    if (mode === 'tilt') {
      // Non-iOS path: bind directly, no prompt needed.
      input.requestGyroPermission().then((result) => {
        if (!result.ok) {
          statusEl.textContent = result.reason + ' · falling back to mouse';
          modeSelect.value = 'mouse';
          setActiveMode('mouse');
        } else {
          setActiveMode('tilt');
          calibrateAndPlay();
        }
      });
      return;
    }
    setActiveMode(mode);
  });

  function hintFor(mode) {
    if (mode === 'keys') return 'Arrow keys / WASD to tilt · reach the green pad';
    if (mode === 'tilt') return 'Tilt your device · reach the green pad';
    return 'Move the mouse to tilt · reach the green pad';
  }

  let gameState = 'playing';

  function resetBall() {
    ballBody.setTranslation(
      { x: level.start.x, y: BALL_RADIUS, z: level.start.z },
      true
    );
    ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    gameState = 'playing';
    banner.hidden = true;
    banner.className = '';
    statusEl.textContent = hintFor(modeSelect.value);
  }
  resetBtn.addEventListener('click', resetBall);

  // --- Resize ---------------------------------------------------------------
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const aspect = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    // Distance needed so BOARD_HALF_EXTENT fits in the narrower axis.
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const distForHeight = BOARD_HALF_EXTENT / Math.tan(vFov / 2);
    const distForWidth = BOARD_HALF_EXTENT / (Math.tan(vFov / 2) * aspect);
    const dist = Math.max(distForHeight, distForWidth);
    camera.position.copy(cameraDir).multiplyScalar(dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    // Keep fog tuned to camera distance so the board never disappears into it.
    scene.fog.near = dist * 0.7;
    scene.fog.far = dist * 1.6;
  }
  resize();
  window.addEventListener('resize', resize);
  // HUD height can change when status text rewraps — re-fit the canvas.
  const hud = document.getElementById('hud');
  if (typeof ResizeObserver !== 'undefined' && hud) {
    new ResizeObserver(resize).observe(hud);
  }

  // --- Loop -----------------------------------------------------------------
  const boardQuat = new THREE.Quaternion();
  const boardEuler = new THREE.Euler(0, 0, 0, 'XYZ');

  function frame() {
    const tilt = input.getTilt();
    // tilt.z (forward) → rotate around X (pitch); tilt.x (right) → rotate around -Z (roll)
    boardEuler.set(tilt.z * MAX_TILT, 0, -tilt.x * MAX_TILT, 'XYZ');
    boardQuat.setFromEuler(boardEuler);

    boardBody.setNextKinematicRotation({
      x: boardQuat.x,
      y: boardQuat.y,
      z: boardQuat.z,
      w: boardQuat.w,
    });
    boardGroup.quaternion.copy(boardQuat);

    if (!paused) {
      world.step();
    }

    const t = ballBody.translation();
    const r = ballBody.rotation();
    ballMesh.position.set(t.x, t.y, t.z);
    ballMesh.quaternion.set(r.x, r.y, r.z, r.w);

    if (gameState === 'playing') {
      if (t.y < FALL_THRESHOLD) {
        gameState = 'lose';
        banner.textContent = 'You fell!';
        banner.className = 'lose';
        banner.hidden = false;
        statusEl.textContent = 'Press Reset to try again';
      } else {
        world.intersectionPairsWith(goalCollider, (other) => {
          if (other === ballCollider) {
            gameState = 'win';
            banner.textContent = 'You win!';
            banner.className = 'win';
            banner.hidden = false;
            statusEl.textContent = 'Press Reset to play again';
          }
        });
      }
    }

    renderer.render(scene, camera);
  }

  function loop() {
    frame();
    requestAnimationFrame(loop);
  }
  loop();
}

main().catch((err) => {
  console.error(err);
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = 'Error: ' + err.message;
});
