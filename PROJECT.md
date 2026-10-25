# Project: Royal Ranbhoomi (3D Battle Chess)

## Architecture
- **Presentation Layer**: WebGL / Three.js 3D rendering pipeline with ACES Filmic Tone Mapping, directional rim lights, dual-layer scrolling ground mist, and particle sparks.
- **Board & Terrain Layer**: Battle-scarred cracked ancient stone arena with PBR texture sets (diffuse, normal, roughness, emissive), decoupled recessed dais base geometry, and engraved runic grid lines.
- **Unit & Shader Layer**: 32 living ancient Indian temple stone monoliths (Deva: weathered Ellora sandstone with gold fissures; Asura: dark volcanic basalt with ember fissures), grounded contact ($y=0.000$), Vedic regalia, 3-stage combat animation, collision spark showers, and stone debris.
- **Game Engine Layer**: FIDE tournament chess rules, raycast square selection, move validation, AI/human turn controller, audio synthesizer.
- **Performance & Optimization Layer**: Static scenery geometry merging (14 shared BufferGeometries), matrix autoUpdate freezing, selective shadow map caching, pre-allocated VFX object pools (shards, debris, afterimages), zero-allocation scratch math vectors, mobile devicePixelRatio capping (max 1.5x), and asynchronous AI move chunking.
- **Desktop Packaging & Cloud Deployment Layer**: Standalone native Windows executable launcher (`RoyalRanbhoomi.exe`) and production Vercel deployment (`https://ranabhoomi.vercel.app`).

## Feature Inventory
Every feature from the Survey phase is enumerated here with its assigned milestone:
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Dais Geometry Decoupling | Recess boardDais plinth to $y \le -0.050$ and daisRim to $y \le -0.015$ so tiles are the sole top surface at $y = 0.000$ | M1 | explorer_survey_1, 2 |
| 2 | Brass Inlay Strip Segmentation | Prevent 81 coplanar intersection overlaps by segmenting horizontal lines or merging inlay geometry | M1 | explorer_survey_1 |
| 3 | Point Light Stabilization | Remove 60Hz Math.random() white noise from 8 brazier lights; replace with smooth deterministic sine modulation and clamp radius to 6.5 | M1 | explorer_survey_1 |
| 4 | Decal & Shadow Depth Normalization | Set polygonOffset on contactShadow/decals, depthWrite: false on transparent labels/reticles, clamp contact shadow radius | M1 | explorer_survey_1 |
| 5 | Camera Frustum & Depth Optimization | Adjust camera near from 0.1 to 0.8, enable logarithmicDepthBuffer: true on WebGLRenderer | M1 | explorer_survey_1 |
| 6 | Verified Zero Blinking Stability | Consecutive frame difference across board area < 1.0 (mean BGR diff < 1.0) during camera orbit and gameplay | M1 | ORIGINAL_REQUEST R1 |
| 7 | Cracked Ancient Stone PBR Ground | Replace flat checkerboard with battle-scarred ancient stone slabs with geological fractures, chiseled bevel borders, and fissure veins | M2 | explorer_survey_2, ORIGINAL_REQUEST R2 |
| 8 | Engraved Runic Grid Lines | Seamless engraved runic grooves blending into stone terrain instead of floating brass bars | M2 | explorer_survey_2, ORIGINAL_REQUEST R2 |
| 9 | Stormy Overcast Sky & Slate Fog | Stormy overcast sky dome, slate atmospheric fog (0x1e2530), replacing warm sunset | M2 | explorer_survey_2, ORIGINAL_REQUEST R2 |
| 10 | Volumetric Mist & Dust Particles | Dual-layer scrolling ground mist planes and 600-particle wind-blown dust/spark system | M2 | explorer_survey_2, ORIGINAL_REQUEST R2 |
| 11 | 4-Point Stormy Cinematic Lighting Rig | Cool silver key light, sharp silhouette rim backlight, slate ambient, warm fire fill | M2 | explorer_survey_2, ORIGINAL_REQUEST R2 |
| 12 | ACES Tone-Mapping & sRGB Encoding | Enable THREE.ACESFilmicToneMapping (exposure 1.15) and sRGBEncoding for rich filmic contrast | M2 | explorer_survey_2, ORIGINAL_REQUEST R2 |
| 13 | Living Temple Stone Monolith Theme | Transform all 32 pieces to weathered Ellora sandstone with gold fissures (Deva) and dark volcanic basalt with ember fissures (Asura) | M3 | explorer_survey_3, ORIGINAL_REQUEST R3 |
| 14 | Absolute Zero Hovering & Grounding | Ensure all 32 units have mathematically grounded contact at $y=0.000$, remove floating howdah spires, floating rune discs, and floating 3D rings | M3 | explorer_survey_3, ORIGINAL_REQUEST R3 |
| 15 | Vedic Regalia in Stone Relief | Retain Kavacha armor, War Elephant fortress tower, Marwari steed, Maharathi chariot sculpted as living stone statues | M3 | explorer_survey_3, ORIGINAL_REQUEST R3 |
| 16 | Colossal Weight & Collision Sparks | Add directional collision spark showers and chiseled stone fragment debris on fatal combat strikes | M3 | explorer_survey_3, ORIGINAL_REQUEST R3 |
| 17 | Standalone Windows Desktop Launcher | Native Windows application using Microsoft Edge Chromium WebView2 and internal ephemeral local HTTP daemon | M4 | explorer_survey_3, ORIGINAL_REQUEST R4 |
| 18 | Standalone .exe Executable Bundle | Compiled standalone Windows binary (RoyalRanbhoomi.exe) running locally without external browser tabs or command console | M4 | explorer_survey_3, ORIGINAL_REQUEST R4 |
| 19 | 60 FPS Performance & FIDE Compliance | Full FIDE chess tournament engine and 3-stage synchronized combat sequences verified at stable 60 FPS | M5 | ORIGINAL_REQUEST Acceptance |
| 20 | 3 Distinct Randomized Pawn Execution Styles | Phalanx Thrust, Acrobatic Aerial Vault Impale, and Low Leg Sweep & Pin randomly triggered on pawn captures | M6 | User Request |
| 21 | Dynamic Knight Travel Trajectory Orientation | Knight aligns smoothly with 3D jump flight vector during parabolic leap and re-aligns to face enemy lines on landing (Option A) | M6 | User Request |
| 22 | Colossal War Beast Scaling & Zero Overlap | Scale Elephant by +35% (H: 3.45m, W: 1.82m) and Horse by +20% (H: 3.82m, W: 1.62m) strictly within 2.0m tile bounds | M6 | User Request |
| 23 | 6-Archetype Distinctive Visual Readability | Unmistakable physical silhouettes (Pawn shield/spear, Elephant howdah, Horse lance, Chariot chakra wheels, Queen twin blades/halo, King parasol/mace) + luminous runic base emblems | M6 | User Request |
| 24 | Static Scenery Geometry Merging | Merge 505 unmerged static environment meshes into 14 shared BufferGeometries by material, cutting static draw calls by 97.2% | M7 | explorer_survey_1, R1 |
| 25 | Static Mesh Matrix Locking & Raycast Nulling | Set matrixAutoUpdate = false, invoke updateMatrix() once, and assign empty raycast function to static background scenery | M7 | explorer_survey_1, R1 |
| 26 | Selective Shadow Map Freezing | Set renderer.shadowMap.autoUpdate = false; trigger needsUpdate = true only when pieces move, animate, or combat triggers | M7 | explorer_survey_1, R1 |
| 27 | Shard Explosion Object Pool | Pre-allocate 68 Octahedron meshes (r=0.14) with shared materials in ShardExplosionPool, strictly fulfilling T1.R5.5 & T2.4.3 test contracts | M8 | explorer_survey_2, R2 |
| 28 | Stone Debris & VFX Object Pooling | Pre-allocate 44 Lambert stone debris meshes and particle pools; eliminate on-the-fly mesh allocations at fatal impact | M8 | explorer_survey_2, R2 |
| 29 | Queen Afterimage Hierarchy Optimization | Replace recursive sourceGroup.clone(true) with lightweight pre-allocated ghost mesh hierarchy | M8 | explorer_survey_2, R2 |
| 30 | Scratch Math Vectors & Brazier Throttling | Pre-allocate scratch Vector3/Matrix4/Color objects for combat lerps; throttle brazier lights to 15Hz and freeze during killcams | M8 | explorer_survey_2, R2 |
| 31 | Safe Mobile devicePixelRatio Capping | Cap renderer.setPixelRatio to Math.min(window.devicePixelRatio, 1.5) on mobile/touch user agents with resize handler | M9 | explorer_survey_3, R3 |
| 32 | Render Loop Memory & Disposal Optimization | Eliminate per-frame .forEach closures across 32 unit rigs; explicitly call geometry.dispose() and material.dispose() on expired VFX | M9 | explorer_survey_3, R3 |
| 33 | Non-blocking AI Deliberation & Touch Latency | Add touch-action: none to #canvasContainer; chunk or defer Negamax AI deliberation to prevent blocking rAF | M9 | explorer_survey_3, R3 |
| 34 | 60/60 E2E Regression Pass & Vercel Live Deployment | Pass 100% of the 60 E2E tests in tests/run_e2e_tests.js; deploy to https://ranabhoomi.vercel.app with HTTP 200 and telemetry verification | M10 | explorer_survey_3, R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Board Rendering Stability & Blinking Elimination | Features 1-6 (Dais decoupling, light smoothing, decal offsets, frustum depth, BGR diff < 1.0) | None | DONE |
| M2 | Stormy Battlefield & Cracked Ancient Stone Arena | Features 7-12 (Cracked PBR stone arena, runic grid lines, overcast sky, mist, particles, ACES tone mapping) | M1 | DONE |
| M3 | Living Ancient Indian Temple Stone Statues | Features 13-16 (Living stone shader/materials, fissure veins, y=0.000 grounding, spark VFX, debris) | M2 | DONE |
| M4 | Standalone Native Windows Executable Bundle | Features 17-18 (Native desktop launcher, csc.exe C# compiler, RoyalRanbhoomi.exe packaging) | M3 | DONE |
| M5 | E2E Verification & Forensic Integrity Audit | Feature 19 (Dual-track test suite, test_game.js, test_studio_views.js, 67.2 FPS, forensic audit) | M4 | DONE |
| M6 | Combat Choreography, Beast Scaling & 6-Archetype Readability | Features 20-23 (3 Pawn kills, Option A Horse flight heading, Elephant/Horse scaling, 6 distinct silhouettes & base runes) | M5 | DONE |
| M7 | Scene Graph & Static Render Optimization | Features 24-26 (505 scenery mesh merges into 14 BufferGeometries, static matrix locking, selective shadow map freezing) | M6 | PLANNED |
| M8 | Combat Choreography, Bullet-Time & Shard Physics Optimization | Features 27-30 (ShardExplosionPool, StoneDebrisPool, Queen afterimage pooling, scratch math vectors, brazier throttling) | M7 | PLANNED |
| M9 | Mobile GPU DPR Capping, Memory Profile & Touch Responsiveness | Features 31-33 (Mobile DPR capped to 1.5x, loop de-allocation, VFX resource disposal, touch-action: none, non-blocking AI) | M8 | PLANNED |
| M10 | 60/60 E2E Regression Pass & Vercel Live Deployment | Feature 34 (Full 60/60 E2E test verification in tests/run_e2e_tests.js, Vercel production deployment, live telemetry check) | M9 | PLANNED |

## Interface Contracts
### Arena & Dais ↔ Chess Controller
- `tileMeshes` array: 64 distinct meshes with `userData: { f, r }` strictly retained for raycasting at $y = 0.000$ (must not be merged into scenery geometry).
- `coordToWorld(f, r)`: Returns `Vector3(x, 0, z)` matching ground surface elevation.
### Unit Locomotion & Combat ↔ Shadow Manager
- `requestShadowUpdate()`: Triggers `renderer.shadowMap.needsUpdate = true` when any unit begins locomotion, moves, or captures.
- When all units are stationary and no combat animation is active, `renderer.shadowMap.needsUpdate = false`.
### Combat Animation ↔ Object Pools & Test Contract
- `ShardExplosionPool`: Manages 68 Octahedron meshes (`radius = 0.14`). When `spawnGeometricShardExplosion` is called, populates `activeVFX` with items containing:
  - `type: 'shard'`
  - `mesh`: instance of `THREE.Mesh` with `geometry.type === 'OctahedronGeometry'` and `geometry.parameters.radius === 0.14`
  - `vel`: `THREE.Vector3` with horizontal speed between 1.7 and 6.2 u/s
  - Fulfills test assertions in `tests/test_tier1_features.js` (T1.R5.5) and `tests/test_tier2_boundaries.js` (T2.4.3).
- `QueenAfterimagePool`: Spawns pre-allocated ghost meshes with opacity fade, avoiding deep object tree cloning.

## Code Layout
- `index.html`: Core 3D engine, Three.js shaders, lighting, unit materials, combat choreography, chess controller, object pools.
- `assets/textures/`: PBR cracked stone textures, fissure emissive maps, normal maps.
- `assets/puranic_models/`: 6 Puranic Baahubali GLB unit models.
- `tests/run_e2e_tests.js`: Master runner for all 60 E2E tests across Tiers 1–4.
- `tests/test_tier1_features.js`: 25 feature-level tests (including combat shard physics T1.R5.1–T1.R5.5).
- `tests/test_tier2_boundaries.js`: 25 boundary and corner tests (including shard perimeter bounce T2.4.3).
- `tests/test_tier3_combinations.js`: 5 cross-feature integration tests.
- `tests/test_tier4_workloads.js`: 5 realistic workload & 60 FPS performance benchmark tests.
- `tests/verify_live_vercel.js`: Puppeteer live production verification script against `https://ranabhoomi.vercel.app`.
- `vercel.json`: Vercel routing, headers, and asset cache configuration.
