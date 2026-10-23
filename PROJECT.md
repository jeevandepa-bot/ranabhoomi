# Project: Royal Ranbhoomi (3D Battle Chess)

## Architecture
- **Presentation Layer**: WebGL / Three.js 3D rendering pipeline with ACES Filmic Tone Mapping, directional rim lights, dual-layer scrolling ground mist, and particle sparks.
- **Board & Terrain Layer**: Battle-scarred cracked ancient stone arena with PBR texture sets (diffuse, normal, roughness, emissive), decoupled recessed dais base geometry, and engraved runic grid lines.
- **Unit & Shader Layer**: 32 living ancient Indian temple stone monoliths (Deva: weathered Ellora sandstone with gold fissures; Asura: dark volcanic basalt with ember fissures), grounded contact ($y=0.000$), Vedic regalia, 3-stage combat animation, collision spark showers, and stone debris.
- **Game Engine Layer**: FIDE tournament chess rules, raycast square selection, move validation, AI/human turn controller, audio synthesizer.
- **Desktop Packaging Layer**: Standalone native Windows executable launcher (PyWebView + Microsoft Edge WebView2 runtime + internal ephemeral localhost daemon) packaged into `RoyalRanbhoomi.exe`.

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

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Board Rendering Stability & Blinking Elimination | Features 1-6 (Dais decoupling, light smoothing, decal offsets, frustum depth, BGR diff < 1.0) | None | DONE |
| M2 | Stormy Battlefield & Cracked Ancient Stone Arena | Features 7-12 (Cracked PBR stone arena, runic grid lines, overcast sky, mist, particles, ACES tone mapping) | M1 | DONE |
| M3 | Living Ancient Indian Temple Stone Statues | Features 13-16 (Living stone shader/materials, fissure veins, y=0.000 grounding, spark VFX, debris) | M2 | DONE |
| M4 | Standalone Native Windows Executable Bundle | Features 17-18 (Native desktop launcher, csc.exe C# compiler, RoyalRanbhoomi.exe packaging) | M3 | DONE |
| M5 | E2E Verification & Forensic Integrity Audit | Feature 19 (Dual-track test suite, test_game.js, test_studio_views.js, 67.2 FPS, forensic audit) | M4 | DONE |
| M6 | Combat Choreography, Beast Scaling & 6-Archetype Readability | Features 20-23 (3 Pawn kills, Option A Horse flight heading, Elephant/Horse scaling, 6 distinct silhouettes & base runes) | M5 | DONE |

## Interface Contracts
### Arena & Dais ↔ Chess Controller
- `tileMeshes` array: 64 meshes with `userData: { f, r }` retained for raycasting at $y = 0.000$.
- `coordToWorld(f, r)`: Returns `Vector3(x, 0, z)` matching ground surface elevation.
### Unit Locomotion ↔ Ground Surface
- Unit root transforms: `rig.root.position.y = 0.000` on board tiles.
- Combat impact points: emit `spawnCollisionSparkShower(contactPoint, normal)` and stone shards.
### Game Core ↔ Desktop Application Wrapper
- Entrypoint: `index.html` served over ephemeral loopback (`http://127.0.0.1:<port>/index.html`).
- Window configuration: 1920x1080, title "Royal Ranbhoomi - Battle Chess", hardware acceleration enabled.

## Code Layout
- `index.html`: Core 3D engine, Three.js shaders, lighting, unit materials, combat choreography, chess controller.
- `assets/textures/`: PBR cracked stone textures, fissure emissive maps, normal maps.
- `assets/puranic_models/`: 6 Puranic Baahubali GLB unit models.
- `desktop_launcher.py`: Native Windows application wrapper (PyWebView + Edge Chromium WebView2).
- `dist/RoyalRanbhoomi/RoyalRanbhoomi.exe`: Standalone Windows desktop binary bundle.
- `test_game.js`: E2E headless test harness for chess gameplay, units, and rendering checks.
- `test_studio_views.js`: Studio camera capture verification for all 6 unit archetypes.
