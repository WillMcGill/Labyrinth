import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { parseLevel, CELL } from './maze.js';
import { createInput } from './controls.js';

const MAX_TILT = Math.PI / 12;        // 15° max board tilt
const BALL_RADIUS = 0.28;
const WALL_HEIGHT = 0.7;
const FLOOR_THICKNESS = 0.2;
const FALL_THRESHOLD = -4;            // ball Y below this → fell into a hole

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
  const world = new RAPIER.World(new RAPIER.Vector3(0, -9.81, 0));

  const boardBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
  );

  // --- Visual board group ---------------------------------------------------
  const boardGroup = new THREE.Group();
  scene.add(boardGroup);

  const matFloor = new THREE.MeshStandardMaterial({ color: 0x3a4257, roughness: 0.92 });
  const matWall = new THREE.MeshStandardMaterial({ color: 0x8c93a5, roughness: 0.65 });
  const matHole = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const matGoal = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x0c5a44,
    emissiveIntensity: 0.6,
    roughness: 0.35,
  });
  const matBall = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.25,
    metalness: 0.55,
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

  const ballBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(level.start.x, BALL_RADIUS + 0.2, level.start.z)
      .setLinearDamping(0.25)
      .setAngularDamping(0.35)
      .setCcdEnabled(true)
  );
  const ballCollider = world.createCollider(
    RAPIER.ColliderDesc
      .ball(BALL_RADIUS)
      .setFriction(0.6)
      .setRestitution(0.1)
      .setDensity(2.0),
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

  function tryEnableTilt() {
    motionErrorEl.textContent = '';
    // requestPermission() must be called directly inside the click handler
    // for iOS to count the activation. No awaits before this call.
    input.requestGyroPermission().then((result) => {
      motionOverlay.hidden = true;
      if (!result.ok) {
        statusEl.textContent = result.reason + ' · falling back to mouse';
        modeSelect.value = 'mouse';
        input.setMode('mouse');
        return;
      }
      input.setMode('tilt');
      statusEl.textContent = hintFor('tilt');
    });
  }

  motionEnableBtn.addEventListener('click', tryEnableTilt);
  motionCancelBtn.addEventListener('click', () => {
    motionOverlay.hidden = true;
    modeSelect.value = 'mouse';
    input.setMode('mouse');
    statusEl.textContent = hintFor('mouse');
  });

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
          input.setMode('mouse');
        } else {
          input.setMode('tilt');
          statusEl.textContent = hintFor('tilt');
        }
      });
      return;
    }
    input.setMode(mode);
    statusEl.textContent = hintFor(mode);
  });

  function hintFor(mode) {
    if (mode === 'keys') return 'Arrow keys / WASD to tilt · reach the green pad';
    if (mode === 'tilt') return 'Tilt your device · reach the green pad';
    return 'Move the mouse to tilt · reach the green pad';
  }

  let gameState = 'playing';

  function resetBall() {
    ballBody.setTranslation(
      { x: level.start.x, y: BALL_RADIUS + 0.2, z: level.start.z },
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

    world.step();

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
