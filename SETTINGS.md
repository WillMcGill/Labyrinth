# Settings reference

Every tunable knob in [src/main.js](src/main.js) and what it does. Values reflect what's on `main` at the time of writing — change them in code, not here, but update this doc when you do.

When tuning, change one value at a time and reload. Several of these knobs interact (e.g. dimming the directional light made the env-map contribution feel relatively stronger).

---

## Physics

### World
| Setting | Value | Notes |
|---|---|---|
| Gravity | `(0, -9.81, 0)` | Earth standard. Rolling acceleration along a tilted surface is `g·sin(tilt)`, so this and `MAX_TILT` are the primary knobs for "ball speed". |
| MAX_TILT | `Math.PI / 9` (20°) | Maximum board tilt angle in either axis. At 20° + Earth gravity, peak rolling accel is ≈3.35 m/s². |

### Ball
| Setting | Value | Notes |
|---|---|---|
| BALL_RADIUS | `0.28` | World units. Several other values key off this (spawn Y, ceiling height). |
| Density | `7.85` | Steel (7,850 kg/m³ vs water 1,000). Mass doesn't change roll speed (it cancels in rolling motion) but adds momentum on wall collisions. |
| Friction | `0.4` | Steel on most surfaces. Lower → ball slides instead of rolls; higher → ball grips harder. |
| Restitution | `0.3` | Bounciness. 0 = dead, 1 = perfect bounce. Real steel marbles ≈0.3-0.5. |
| Linear damping | `0.05` | Per-second velocity decay. Low because a heavy ball has negligible air drag. |
| Angular damping | `0.1` | Rolling resistance lives mostly in friction, not damping. |
| CCD | `true` | Continuous collision detection. Prevents tunneling through walls at high speed. Costs some CPU per step. |
| Spawn Y | `BALL_RADIUS` (0.28) | Ball sits exactly on the floor at start — no drop-in. |

### Floor tiles (per cell, attached to board body)
| Setting | Value | Notes |
|---|---|---|
| Friction | `0.55` | Higher than ball's 0.4 — friction at a contact uses the min of both surfaces by default, so this is mostly cosmetic. |
| Restitution | `0.05` | Very low — ball doesn't bounce off the floor. |
| FLOOR_THICKNESS | `0.2` | Visual + collider thickness. Floor surface ends up at world Y=0. |

### Walls (per cell, attached to board body)
| Setting | Value | Notes |
|---|---|---|
| Friction | `0.2` | Lower than floor — ball slides along walls smoothly rather than catching. |
| WALL_HEIGHT | `0.7` | Top of wall at world Y=0.7. Tall enough that the ball (radius 0.28) can't physically clear the wall, with the ceiling collider as a backstop. |

### Ceiling (invisible, attached to board body)
| Setting | Value | Notes |
|---|---|---|
| CEIL_THICK | `0.02` | Thin slab. |
| CEIL_ABOVE_WALL | `0.10 * (BALL_RADIUS * 2)` | Ceiling bottom is at wall top + 10% of ball diameter. Lets the ball briefly hop above a wall on a hard bounce but can never launch off the board. |
| Friction | `0.05` | Low so the ball doesn't catch when it grazes the ceiling. |
| Restitution | `0` | No bounce off the ceiling. |
| Extent | `(level.cols × CELL, _, level.rows × CELL)` | Covers the full board area. |

### Goal sensor (per goal cell, attached to board body)
| Setting | Value | Notes |
|---|---|---|
| Sensor | `true` | Detects intersection without blocking ball. |
| Size | `1 × 1 × 1` (cuboid 0.5 half-extents) | Full cell box, 1 unit tall, sits at the goal cell. |

### Other
| Setting | Value | Notes |
|---|---|---|
| FALL_THRESHOLD | `-4` | World Y. Ball below this → lose. Below any tilted-board minimum so the trigger is unambiguous. |

---

## Lighting

| Setting | Value | Notes |
|---|---|---|
| Ambient light | white, intensity `0.30` | Base fill so unlit faces aren't pitch black. Kept relatively low because `scene.environment` adds further diffuse contribution. |
| Directional light position | `(12, 12, 2)` | Off-center, slightly low — produces stronger, more directional shadows than an overhead light. |
| Directional intensity | `0.70` | Dimmer than the original 1.0 because the env map already lights the scene. |
| Directional `castShadow` | `true` | Walls/ball cast shadows on the floor. |
| Shadow map size | `2048 × 2048` | Sharp shadow edges. Doubling this is the easiest way to crisp them up further; halving is the easiest perf win if shadow rendering shows up in a profile. |
| Shadow camera bounds | `±10` on left/right/top/bottom | Frustum within which shadows are computed. If you ever enlarge the level, increase this or the perimeter loses shadows. |
| Shadow camera near/far | `1` / `40` | Range along the light's view direction in which shadow-casters are tracked. |
| Scene `background` | `makePlaygroundBackground()` — 4×512 canvas vertical gradient: `#a4d4f6` sky → `#cfe7f0` horizon → `#bcd0a4` near grass → `#7ea561` grass underfoot | Procedural "playground" sky-to-grass. Used as a 2D texture background; same texture is what the ball's cube camera picks up for sky/ground reflections. Swap the gradient stops to retheme. |
| Scene `fog` | `Fog(0xcfe7f0, near=dist*0.7, far=dist*1.6)` | Hazy-horizon colour so anything at fog distance blends into the background gradient. `near`/`far` recomputed per resize from camera distance so the maze never disappears into fog at any aspect ratio. |
| Scene `environment` | procedural `RoomEnvironment` via `PMREMGenerator(renderer).fromScene(env, 0.04)` | Studio-like image-based lighting. Drives reflections on the metallic ball **and** adds ambient-flavored diffuse to every PBR material — that's why the whole maze got brighter when this was introduced. To revert just the side effect, assign `material.envMap` on the ball only and remove `scene.environment`. |

---

## Textures

All textures are procedural — drawn into HTML canvases inside `makeWoodTexture()` and `makeStoneTexture()` and wrapped as `THREE.CanvasTexture`. No external image files.

### Floor — walnut wood
| Setting | Value | Notes |
|---|---|---|
| Canvas size | `512 × 512` | Tradeoff: bigger = sharper detail at close range, more GPU memory. 512 is the sweet spot for this game's camera distance. |
| Base color | `#2e1a0c` | Dark walnut. |
| Plank height | `128` px (4 planks per tile) | Each plank gets a slight warm tint variation. |
| Grain | 24 wavy lines per plank, low opacity | Long sinusoids that span the full plank length, with random phase/freq per plank. |
| Knots | 4 random, with concentric ring overlay | Radial gradient core + elliptical rings. |
| Seams | Hard dark line + lighter inner-shadow line | The double stroke is what makes seams read as actual joints. |
| Material | `MeshStandardMaterial`, `roughness 0.85`, `metalness 0` | Wood isn't metallic. High roughness = diffuse, matte look. |
| Anisotropy | `8` | Reduces blur on the floor when viewed at grazing angles (the camera is pitched, so most of the floor is at an angle). |
| Wrap | `RepeatWrapping` on S and T | Allows tiling per cell. |
| Color space | `SRGBColorSpace` | Required for sRGB-encoded canvases (default for `<canvas>`). |

### Walls — stone
| Setting | Value | Notes |
|---|---|---|
| Canvas size | `512 × 512` | Same reasoning as floor. |
| Grout color (base) | `#27241f` | What shows in the gaps between stones. |
| Stone palette | 8 entries, mostly grays with warm and cool casts | Random pick per stone for variety. |
| Stone count | 4 large + 12 medium + 22 small | Sorted largest-first so small stones paint into the gaps left by large ones. |
| Stone outline | `rgba(20,16,12,0.85)`, width 1.5-3 | This is what makes the gaps read as grout. |
| Stone fill | Radial gradient (lighter top-left → darker bottom-right) | Fake depth on each stone. |
| Surface pits | 400 dark dots + 200 light dots | Speckle that breaks up the smooth stone surface. |
| Noise overlay | ±22 RGB jitter per pixel | Final pass for organic feel. |
| Material | `MeshStandardMaterial`, `roughness 0.95`, `metalness 0` | Stone is rough and non-metallic. |
| Anisotropy | `8` | Same reason as floor. |
| Material pool | 4 distinct stone canvases × 4 texture rotations = **16 materials** | Per wall picks one at random — breaks the obvious tile-repeat that one shared texture caused. Increase the canvas count for even more variety (cost: more GPU memory). |
| Wall geometry subdivisions | `BoxGeometry(CELL, WALL_HEIGHT, CELL, 3, 4, 3)` | Subdivisions on width × height × depth. Needed so we have interior side vertices to displace; the actual rocky look comes from the displacement below. |
| Rocky vertex displacement | ±0.05 in X/Z, ±0.03 in Y on interior side vertices only | Top and bottom face vertices are skipped (kept flush with floor + ceiling). Small enough that the visual wall stays inside the cuboid collider — ball physics is unchanged. One shared rocky geometry across all walls; texture variety already breaks visual monotony. Larger displacement → more obviously irregular walls but risk of visual/collider mismatch becoming noticeable. |

### Ball — polished steel
| Setting | Value | Notes |
|---|---|---|
| Material | `MeshStandardMaterial` | |
| Color | `0xd6d8dc` | Light neutral steel. |
| Emissive | `0xe6efff`, intensity `0.18` | Subtle cool-white self-glow so the ball is locatable against the dark stone walls. Works even at metalness 1.0. |
| Roughness | `0.12` | Near-mirror. Drives how blurred the env-map reflections appear. |
| Metalness | `1.0` | Fully metallic. |
| Env map | `cubeRenderTarget.texture` (CubeCamera updated each frame at ball position) | Ball reflects the *actual* scene (walls/floor) each frame, not the static `scene.environment` studio map. Overriding `envMap` per-material wins over the scene env. |
| Cube target size | `256 × 256` per face (×6 faces) | Resolution of the reflection cube map. 128 is the cheap option; 512 looks crisper but doubles GPU cost. |
| Cube update cadence | every frame | If perf becomes an issue, update every Nth frame — ball reflections will only update at N× the rate but on a small marble that's hard to notice. |
| Geometry | `SphereGeometry(BALL_RADIUS, 32, 24)` | 32 width segments × 24 height segments. Lower = polygonal-looking sphere; higher = smoother but more vertices. |

### Goal portal
| Setting | Value | Notes |
|---|---|---|
| Base mesh | `CircleGeometry(0.42, 32)` flat on the floor, rotated `-π/2` around X | Emerald disc that anchors the portal. |
| Base material | `MeshStandardMaterial`, color/emissive `0x10b981`, emissive intensity `1.4`, roughness `0.3`, `DoubleSide` | Strong self-glow so it reads through shadow. |
| Ring count (`RING_COUNT`) | `4` | More rings = denser teleport stack; ~1 GB ring per RING_COUNT shouldn't matter for perf. |
| Ring geometry | `TorusGeometry(0.38, 0.025, 8, 32)` | Outer radius 0.38, tube 0.025. Increase tube for chunkier rings. |
| Ring material | `MeshBasicMaterial`, color `0x10b981`, transparent, opacity `0.85` at start (fades) | `Basic` so rings ignore lighting and stay vivid. |
| Rise distance (`RING_RISE`) | `0.55` | Max Y the ring climbs before resetting. Stays under the ceiling collider (~0.756). |
| Cycle period (`RING_CYCLE_SEC`) | `1.8` seconds | How long a single ring takes to rise + fade. Lower = more frenetic, higher = more relaxed. |
| Phase offset | Even spacing: `i / RING_COUNT` | Keeps rings continuously stacked instead of all at once. |

### Hole visual
| Setting | Value | Notes |
|---|---|---|
| Material | `MeshBasicMaterial` (not Standard) | `Basic` ignores lights entirely — the hole stays pure black even under bright environment. |
| Geometry | `PlaneGeometry(CELL × 0.92, CELL × 0.92)` | Slightly inset from the cell edge for a clean visual. |

---

## Performance settings (not previously discussed)

These weren't part of the iterative tuning above but each one trades visual fidelity for frame rate. Listing here so they're discoverable next time perf becomes a concern.

| Setting | Current value | Notes |
|---|---|---|
| `renderer` pixel ratio cap | `Math.min(devicePixelRatio, 2)` | Retina + 3x phones would render at 3× internally without this cap. Capping at 2 cuts fragment-shader work by ~44% on a 3x device with no visible quality loss at this art style. |
| `renderer.antialias` | `true` | MSAA. Cleanest edges. Costs some GPU; set `false` if shadows/textures bottleneck a low-end mobile. |
| `renderer.shadowMap.enabled` | `true` | Shadow-cast/receive on key meshes. Single biggest GPU cost in the scene. |
| `renderer.shadowMap.type` | `PCFSoftShadowMap` | Soft shadow edges. `BasicShadowMap` is cheaper but produces hard, aliased shadow edges. |
| Shadow map resolution | `2048 × 2048` | See lighting section. |
| Ball sphere segments | `32 × 24` | High enough that the ball reads as round at any camera distance. `16 × 12` would halve vertex count with subtle faceting. |
| Texture anisotropy | `8` | Per-texture. The display will clamp to the GPU's `getMaxAnisotropy()` if it's lower. `1` for cheapest, `16` for most demanding. |
| `BoxGeometry` per cell | one instance reused for all floor tiles, one for all wall tiles, one for all hole planes | Cheap. The cost is mainly the colliders, not the meshes. Avoid creating new `BoxGeometry` per cell if you ever refactor. |
| Camera FOV | `45°` | Standard "natural" perspective. Wider FOV (e.g. 75) feels more immersive but makes the maze fish-eyed; narrower FOV feels flatter. |
| Camera `far` clip | `200` | Generous because the camera distance grows on narrow aspect ratios. Lower = better depth-buffer precision but risk of clipping the board at high zoom-out. |
| `BOARD_HALF_EXTENT` | `7.5` | Half-diagonal of the board's bounding rect (plus margin) that the `resize()` function fits to the smaller viewport dimension. Lower → maze zooms in, larger → maze shrinks. |
| `world.step()` substeps | default (1) | Increase if you ever see ball tunneling through corners at high speed; costs CPU per frame. |
| `ResizeObserver` on `#hud` | active | Re-runs `resize()` when the HUD wraps/unwraps, so the maze stays centered in the visible canvas area. |
| `requestAnimationFrame` loop | bare RAF | No fixed-timestep accumulator. Physics step happens once per RAF; on slow devices that means slow-motion play rather than dropped physics. Acceptable for a casual game; revisit if it ever feels noticeably wrong. |
