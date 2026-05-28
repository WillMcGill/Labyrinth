# Labyrinth — context for Claude

Browser-based 3D marble maze. Tilt a board to roll a ball through a corridor to a goal pad while avoiding holes. Single hand-built level so far.

## Stack
- **Vite 5** (vanilla JS, no TypeScript)
- **Three.js** for rendering
- **Rapier 3D** (`@dimforge/rapier3d-compat` WASM build) for physics
- **GitHub Pages** for hosting, deployed via `gh-pages` npm package

## Running locally

```bash
# IMPORTANT: this user's shell defaults to Node v12.22.12. Vite requires
# Node 18+. Always load Node 24 from nvm before running npm scripts:
source ~/.nvm/nvm.sh && nvm use 24

npm install   # first time only
npm run dev   # http://127.0.0.1:5173
```

If using the Preview MCP, `.claude/launch.json` at the workspace parent (`/Users/willmcgill/Desktop/ Personal Dev/.claude/launch.json`) already pins `runtimeExecutable` to the Node 24 absolute path so the preview runner doesn't pick up Node 12. Don't change that unless the user upgrades their default shell node.

## Deploying

```bash
npm run deploy   # builds dist/, force-pushes to gh-pages branch
```

Live at https://willmcgill.github.io/Labyrinth/. `vite.config.js` has `base: '/Labyrinth/'` because the site is served under a subpath — don't remove it.

## Branching

- Work on feature branches off `main`; deploy from the branch you're testing on (no need to merge first).
- Open PR via printed `gh pr create` link from `git push`. User merges via GitHub UI.
- After merge, switch back to main and `git pull` to sync.

## Architecture decisions

### Board as kinematic rigid body, ball as dynamic
The whole maze geometry (floor tiles + walls + goal sensor) is attached as colliders to one `kinematicPositionBased` Rapier body. Each frame, we set the body's rotation to the smoothed tilt input via `setNextKinematicRotation`. The ball is a separate dynamic body affected by world gravity. Result: tilting the board makes the floor slope, gravity pulls the ball downhill — no per-frame force application needed.

### Holes are gaps in the floor, not colliders
Hole cells get no floor tile collider at all, so the ball falls through. Loss is detected by checking `ball.translation().y < FALL_THRESHOLD` (-4). This is cheaper and more reliable than overlap-with-hole-sensor.

### Camera fits to viewport via aspect-aware distance
[main.js](src/main.js) `resize()`: distance from origin is `max(distForWidth, distForHeight)` where both are computed from `BOARD_HALF_EXTENT` (7.5) and the canvas aspect. Fog near/far follow the distance. Camera direction is fixed `(0, 17, 13).normalize()`.

### HUD is a flex-column sibling of the canvas, not a fixed overlay
Previously the HUD was `position:fixed` over a full-viewport canvas, which made the maze appear above the visible vertical center (canvas centered the board but the HUD covered the top strip). Fix in [style.css](src/style.css): body is `flex-direction: column`, HUD has natural height at top with `background: #0b0d12`, canvas takes the remaining height with `flex: 1`. Camera then centers the board in just the canvas area — no projection trickery.

Two attempted alternatives that didn't work and shouldn't be re-tried:
1. **Tilting `camera.lookAt(0, upBias, 0)`** undershoots the projected pixel offset because tilting isn't a pure 2D translation.
2. **`camera.setViewOffset()`** zooms in instead of just shifting, because it rescales the projection rather than offsetting the principal point.

### iOS device-orientation permission gotchas
- `DeviceOrientationEvent.requestPermission()` **must** be called synchronously from a real user-gesture handler. Chaining it through `async` functions with awaits in between drops iOS's transient activation and the prompt silently resolves to `denied`.
- `<select>` change events do **not** reliably count as activation on iOS Safari. That's why selecting "Device tilt" from the dropdown opens an explicit modal (`#motion-overlay`) with a button; tapping that button calls `requestPermission()` directly. See [main.js](src/main.js) `tryEnableTilt()` and the overlay markup in [index.html](index.html).
- Once granted, baseline is captured by **averaging 5 `deviceorientation` samples** (`calibrate()` in [controls.js](src/controls.js)). Single-sample calibration was too noisy. Ball physics is paused during the ~300 ms window so sensor noise doesn't roll the ball before the baseline exists. There's a 2 s silent timeout fallback if no samples arrive.
- A **Recenter button** (⟳, visible only in tilt mode) re-runs the same calibration. Users shift how they hold the phone mid-play.

### Device-tilt projected onto screen frame for landscape support
`DeviceOrientationEvent.beta/gamma` are in the phone's physical frame, which doesn't rotate when the user goes landscape. `deviceToScreen()` in [controls.js](src/controls.js) applies a 2D rotation by `-screen.orientation.angle` to project (beta, gamma) into screen-relative (sx, sy) before storing as calibration baseline or computing tilt delta. Calibration auto-re-runs on `orientationchange`.

**The angle is negated** because iOS reports `screen.orientation.angle` with the opposite handedness from the rotation matrix. Without the negation, both axes are inverted in landscape (portrait is unaffected because angle=0 is sign-invariant). If iOS ever changes its convention back, both landscape orientations would invert and the negation would need to be removed.

## Known limitations / non-goals

- One hand-built level only (snake-shaped corridor, 13×12 grid).
- No score, timer, or progression.
- No level editor.
- Mobile pointer-mode is technically supported but UX is bad (single touch jumps the board hard to that screen position).
- Bundle is ~880 KB gzipped, dominated by Rapier WASM + Three.js. Acceptable for a personal project.

## File map

- [index.html](index.html) — viewport meta, HUD markup, motion-permission overlay, canvas
- [src/main.js](src/main.js) — Three.js scene, Rapier world, game loop, HUD wiring, resize/orientation handlers
- [src/maze.js](src/maze.js) — level string + parser → wall/floor/hole/start/goal coordinates
- [src/controls.js](src/controls.js) — mouse/keys/tilt input, iOS permission, calibration
- [src/style.css](src/style.css) — flex column layout, HUD, motion overlay, responsive breakpoint at 640px
- [vite.config.js](vite.config.js) — `base: '/Labyrinth/'` for GitHub Pages subpath
- [.claude/launch.json](.claude/launch.json) — preview server config
