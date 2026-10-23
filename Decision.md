# Architectural Decisions — Royal Ranbhoomi

## Decision 1 [2026-10-21] — Pivot to Realistic 3D Models & Recorded Acoustic Audio
- **Goal**: Deliver a battle chess experience that looks like a real historical Indian battlefield with lifelike warriors and war beasts.
- **Options Considered**:
  1. *Option A (Abstract Procedural Geometry)*: Lightweight, zero external files, but visually abstract and schematic. **[REJECTED by User]**
  2. *Option B (Pure Headless Blender Python Scripting)*: Procedurally generate meshes in Blender CLI. High complexity and requires hours of vertex/bone weight math without guaranteed anatomical realism. **[REJECTED as sole solution]**
  3. *Option C (Production Asset Pipeline via Three.js GLTFLoader)*: Standard industry pipeline specified in Section 3 of the Build Spec. Integrate realistic textured GLB models, PBR normal/roughness textures, realistic terrain, and authentic recorded acoustic audio clips. **[CHOSEN]**
- **Rationale**: Realism comes from textured 3D meshes and recorded acoustic audio. Three.js `GLTFLoader` with high-detail PBR models provides instant, photorealistic rendering and real animation playback without asset failure.


## Decision 2 [2026-10-21] — Portable Blender 4.2.0 LTS Installation
- **Goal**: Provide a fully functional, headless-capable Blender environment on Windows that can be run from CLI without requiring Windows UAC admin privileges.
- **Chosen Approach**: Downloaded the official Blender 4.2.0 LTS 64-bit portable release from `download.blender.org`, unpacked via `tar.exe` to `C:\Users\Jeevan\blender-4.2.0-windows-x64\`, and permanently appended it to the User PATH environment variable.
- **Verification**: Executed `blender.exe --version` returning `Blender 4.2.0` (CMake Release build).


## Decision 3 [2026-10-21] — Authentic Puranic 3D Character Modeling & Procedural PBR Texturing
- **Goal**: Construct culturally authentic ancient Indian epic character models (Mahabharata / Ramayana / Puranic regalia) rather than generic Western/sci-fi models.
- **Options Considered**:
  1. *Option A (Mixamo / Vanguard Generic Sci-Fi Assets)*: Fast to drop in, but westernized and sci-fi in appearance. **[REJECTED by User]**
  2. *Option B (Pure AI 2D Billboards)*: AI-generated flat sprites placed on 3D planes. Low 3D dimensionality, fails on 360-degree orbit cameras. **[REJECTED]**
  3. *Option C (Hybrid AI Texture Generation + Headless Blender 4.2.0 Modeling Pipeline)*: Custom Python script (`generate_puranic_textures.py`) generated 6 high-resolution PBR textures (24K gold Surya mandala, embroidered crimson Jhul, wrinkled elephant skin with vermilion Shringar tilak, pleated saffron silk Dhoti with gold zari, Wootz Damascus steel, and carved Indian sandalwood). Then `build_puranic_models.py` executed inside Blender 4.2.0 CLI to sculpt, uv-map, and export all 6 authentic Indian epic character models (`padati.glb`, `gajadhvaja.glb`, `ashvarohi.glb`, `ratha.glb`, `maharani.glb`, `samrat.glb`). **[CHOSEN]**
- **Verification**: Loaded all 6 GLB models into Three.js in live headless Chrome; verified 32/32 units rendered as authentic Puranic units with zero console errors. Captured 1080p studio and cinematic battlefield screenshots.


## Decision 4 [2026-10-21] — Reference-Exact Gajraj Rook & Animation Bible v1.0 Engine
- **Goal**: Build the War Elephant Rook (`gajadhvaja.glb`) with 1:1 fidelity to user reference image (stone castle fortress tower with 4 corner bartizans, gold chamfron with glowing amber cabochon forehead gem, hanging gold ear bells, embroidered scalloped jhul with 28 hanging golden tassels, triple tusk cuffs, gold ankle kadas, stepped stone pedestal with glowing circular Sanskrit rune disc) and implement the Animation Bible v1.0 engine.
- **Components Implemented**:
  1. *Anatomical War Elephant & Castle Bastion*: High-fidelity sculpt built via `build_gajraj_reference_model.py` in Blender 4.2.0 LTS, with mathematical grounding ($Z_{\min} = 0.000$, zero hover, zero penetration).
  2. *Dual Dynastic PBR Theming*:
     - Deva / Solar White: Makrana white marble hide with gold kintsugi cracks, 24K Surya gold chamfron, amber glowing eyes (`0xffaa11`), warm sandalwood/marble castle tower, and radiant solar Sanskrit rune disc (`0xffd700`).
     - Asura / Midnight Black: Dark obsidian charcoal granite hide, dark bronze/iron gold trims, molten ember glowing eyes (`0xff3300`), royal midnight navy blue & gold jhul, dark volcanic basalt fortress, and ethereal purple/crimson glowing runes (`0xa855f7`).
  3. *Animation Bible v1.0 Suite (Sections 11, 12, 13)*:
     - `KeyframePlayer` with easing functions (`linear`, `ease`, `easeIn`, `easeOut`, `snap` [$t^4$], `hold`).
     - `SecondaryChain` spring-damper inertia physics for cape, elephant trunk/howdah, horse tail, and banners.
     - `arc()` and `bezier()` ballistic curves for knight vaults and thrown projectiles.
     - `QueenAfterimagePool` with additive ghost trails.
     - `manifest.json` with frame-exact impact synchronizations (Rook stomp f50=1.667s, King cleave f22=0.733s, Queen whirlwind f31=1.033s, Pawn thrust f17=0.567s).
- **Verification**: Verified with headless Chrome DevTools automated tests; 32/32 active rigs loaded, zero console errors, 1080p screenshots captured.


## Decision 5 [2026-10-22] — Living Ancient Indian Temple Stone Statues & Native Windows Desktop Executable (`RoyalRanbhoomi.exe`)
- **Goal**: Fulfill user requirements from reference video `Chess_pieces_fighting_battlefield_20261021222458.mp4`:
  1. Transform characters into colossal living carved ancient Indian temple stone statues (Ellora sandstone for Deva, volcanic obsidian basalt for Asura, micro-cracks, gilded gold relief, glowing fissure veins).
  2. Enhance combat choreography with high-velocity directional collision sparks and chiseled stone fragment debris in 0.16x bullet-time.
  3. Package game into a standalone native Windows desktop application executable (`RoyalRanbhoomi.exe`) requiring zero browser tabs, zero console prompts, and zero third-party runtimes.
- **Components Implemented**:
  1. *PBR Living Stone Monolith Shaders (`StoneTextureManager`)*: Applied 16x anisotropic normal maps, roughness maps, and fissure emissive maps to all 32 unit rigs in `applyPuranicTheme`.
  2. *Combat Collision FX*: Created `spawnCollisionSparkShower()` and `spawnChiseledStoneDebris()` updating in `updateActiveVFX()` during slow-motion fatal strikes.
  3. *Native Windows Executable (`RoyalRanbhoomi.exe`)*: Authored and compiled `Launcher.cs` using Microsoft's native `csc.exe` (`/target:winexe /platform:x64`). Embeds an internal multi-threaded `HttpListener` serving static assets and launches Microsoft Edge Chromium in dedicated app mode (`--app=http://127.0.0.1:<port>/index.html --window-size=1920,1080`), cleanly terminating upon window close.
- **Verification**: Confirmed 32/32 active rigs loaded with `isRealistic = true`, stable 67.2 FPS on AMD Radeon 780M Direct3D11, zero console errors, and captured 1080p showcase renders (`showcase_deva_monoliths.png`, `showcase_asura_monoliths.png`, `showcase_epic_clash.png`).

## Decision 6 [2026-10-22] — Horse Dynamic Leap Orientation (Option A), Beast Scaling (+35% Elephant, +25% Horse), and 6-Archetype Visual Readability
- **Goal**:
  1. Ensure the Ashva (Knight / War Horse) dynamically aligns to face along its travel trajectory vector during its parabolic leap and smoothly re-aligns to face enemy lines upon landing (Option A).
  2. Scale up the Gaja (Rook / Elephant) by +35% and Ashva (Knight / Horse) by +25% to achieve colossal, imposing physical presence while strictly eliminating tile overlap (< 1.95m on 2.0m tile).
  3. Ensure every character is unmistakably identifiable from standard isometric/top-down match camera without confusion.
- **Options Considered for Horse Orientation**:
  - *Option A (Dynamic Trajectory & Landing Re-alignment)*: The horse smoothly aligns to face the direct 3D vector of its leap arc mid-flight, and upon touchdown smoothly pivots to face the enemy army rank. **[CHOSEN by User]**
  - *Option B (Direction-Locked Stride)*: The horse stays locked facing the arrival vector after landing. **[REJECTED]**
- **Sculpted Distinctives & Readability Enhancements**:
  1. *Pawn (Padati)*: Height 1.45m. Prominent convex Rajput Dhal shield with 4 brass bosses on left arm + tall 2.6m vertical Bhala spear with fluttering battle pennant.
  2. *Rook (Gajadhvaja)*: Height 3.45m, Width 1.82m (+35% scale, 2.3x visual volume, zero tile overlap). Sandstone fortress bastion howdah tower + dynasty war banner mast (+3.6m) + triple brass tusk cuffs.
  3. *Knight (Ashva)*: Height 3.82m, Width 1.62m (+25% scale, zero tile overlap). Arched Marwari lyre ears + 3.2m charging Surya cavalry lance + swallowtail pennant.
  4. *Bishop (Ratha)*: Height 3.07m, Width 1.85m. Curved bronze prow shield + twin spinning spiked Sudarshana Chakra wheels + tall celestial sun standard (+2.5m).
  5. *Queen (Maharani)*: Height 2.35m. Distinctive twin crossed curved Khanda swords in dual-wielding guard + radiant 16-ray Sunburst aureole halo.
  6. *King (Samrat)*: Height 3.41m (tallest humanoid). Towering 3-tiered royal Chhatra parasol canopy above imperial crown + massive golden imperial Gada (mace) held vertically grounded in front.
  7. *Luminous Archetype Base Crests*: Every unit's base plinth is engraved with a high-contrast glowing Sanskrit runic disc (`▲`, `♜`, `♞`, `☸`, `♛`, `♚`) and romanized name.
- **Verification**:
  - Headless CDP automated audit confirmed:
    - Rook width = 1.82m <= 1.95m (PASS).
    - Knight width = 1.62m <= 1.85m (PASS).
    - Knight mid-flight delta heading = 0.096 rad (aligned with trajectory, PASS).
    - Knight post-landing heading = 3.142 rad (re-aligned to enemy rank, PASS).
  - Captured high-resolution showcase proof images for all 6 archetypes (`audit_char_*.png`) and full board (`battlefield_all_characters_distinct.png`).


