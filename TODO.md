# TODO

Ideas and improvements for Labyrinth. Keep entries short — link to a PR or issue if it gets specced out further. Strike or delete completed items.

## Gameplay
- [ ] Multiple levels + level select screen
- [ ] Per-level timer + best-time persisted to `localStorage`
- [ ] Procedural maze generator (recursive backtracker)
- [ ] Tiny level editor (drag-paint walls/holes/start/goal)
- [ ] More holes scattered through the current level (right now there's only one)
- [ ] Tilt-bonus or speedrun scoring
- [ ] Tune ball physics — mass, friction, restitution, damping, and tilt sensitivity feel off (ball rolls too freely / hits walls too hard / etc., specifics TBD when we revisit)

## Mobile UX
- [ ] Better touch-mode tilt: drag-from-center instead of absolute touch position (currently a single tap yanks the board to that screen position)
- [ ] Low-pass filter on raw orientation samples to smooth jitter on cheaper sensors
- [ ] Auto-recalibrate when sustained drift detected (today: only manual via Recenter button)
- [ ] Side-HUD layout option in landscape to reclaim vertical space for the maze
- [ ] Ball should stay frozen during the entire orientation-change → recalibration transition. Partial pause exists via `pauseForCalibration()` but ball still appears to drift in practice — investigate whether existing momentum/the brief window before pause is the cause, and harden the pause boundary
- [ ] Default to tilt mode when the app opens on a mobile device instead of mouse. Detect touch-only / mobile and pre-select tilt. iOS still needs the existing "Enable motion controls" confirmation modal — show it proactively on first load rather than waiting for the user to discover the dropdown
- [ ] Hide the "Keyboard (WASD / Arrows)" input option on touch-only devices — irrelevant without a physical keyboard

## Visual / polish
- [ ] Win/lose banner sizing on small screens (currently sized for desktop)
- [ ] Subtle ball trail or motion blur
- [ ] Sound effects on ball bounce, hole-fall, win
- [ ] Theme picker (warm wood vs. cool steel vs. neon)
- [ ] Replace solid-color `MeshStandardMaterial` with actual textures — floor planks, brushed-metal walls, polished marble ball, etc. (today everything is flat color)
- [ ] HUD button + control styling pass: current buttons are bare boxes and the status pill is plain. Re-evaluate hierarchy, sizing, hover/active states, dropdown styling, and whether the input selector belongs in the HUD at all or in a separate settings menu

## Engineering
- [ ] Bundle is ~880 KB gzipped — switch from `@dimforge/rapier3d-compat` to the non-compat build with separate WASM file to cut JS bundle
- [ ] Replace `npm run deploy` (manual) with a GitHub Actions workflow that builds on push to main
- [ ] Add basic Vitest coverage for `maze.js` parser and `controls.js` tilt math
- [ ] Consider locking screen orientation in tilt mode to avoid the recalibration interruption mid-play
