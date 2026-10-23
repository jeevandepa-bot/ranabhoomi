# Mistakes Log — Royal Ranbhoomi

## Mistake 1 [2026-10-21] — Procedural Geometric Primitives vs. Real-Life Visuals
- **Context**: Relied on Three.js procedural `LatheGeometry` curves and Web Audio synthesizer oscillators (sawtooth/sine sweeps) instead of real-life textured 3D character models and recorded acoustic sound effects.
- **User Feedback**: "i am utterly disappointed about the graphics, and sound effects also... this is not i want, it should look like the real life character and the real battlefield use, blender and build each character from scratch"
- **Root Cause**: Confused the mathematical code generation constraint with visual quality expectations. Procedural geometry without high-polygon anatomical modeling and PBR textures looks schematic/abstract rather than lifelike.
- **Rule / Corrective Action**: Transition immediately to the true Asset Pipeline specified in Section 3 of `Royal_Ranbhoomi_Battle_Chess_Build_Spec.md`: load real textured 3D models (`.glb`), realistic PBR environment textures, and recorded acoustic audio samples.


## Mistake 2 [2026-10-21] — Winget MSI Interactive UAC Stalling for Blender
- **Context**: Attempted to install Blender using `winget install BlenderFoundation.Blender`, which timed out because MSI installers require interactive elevated Windows UAC confirmation popups that cannot be completed by non-interactive background processes.
- **Corrective Action**: Switched to official standalone portable ZIP release of Blender 4.2.0 LTS (64-bit) directly from `download.blender.org`, extracted cleanly via Windows `tar.exe` to `C:\Users\Jeevan\blender-4.2.0-windows-x64\`, added to User PATH, and verified with `blender --version`.


## Mistake 3 [2026-10-21] — Function Declaration Enclosure Leading to Scoping ReferenceError
- **Context**: During the modular update of unit builders, a placeholder wrapper `function buildProceduralUnit(...) {` inadvertently enclosed `function buildSculptedUnit(...)`, scoping `buildSculptedUnit` locally. When `spawnBattlefieldArmies()` executed on page load, it threw `ReferenceError: buildSculptedUnit is not defined`, aborting `animateLoop` and leaving the WebGL canvas black.
- **Corrective Action**: Cleaned up the function scoping, tested full page execution in headless Chrome with remote debugging protocol, verified that all 32 units, 116 battlefield objects, and the camera initialize, and confirmed the visual render via 1080p browser screenshot.


## Mistake 4 [2026-10-21] — Generic Vanguard / Sci-Fi Assets vs. Puranic Ancient Indian Aesthetics
- **Context**: Re-used a generic Vanguard armored soldier GLB for Kshatriya warriors instead of authentic Vedic/Puranic Indian martial designs (Kavacha armor, Dhoti/Uttariya, Kirita-Mukuta crowns, Kundala ear ornaments, authentic Indian bows/chariots, War Elephants with ornate caparisons).
- **User Feedback**: "worst than the previous, please spare time for each character download images and build the characters in the blender design as described in the purnas, or generate with the ai"
- **Corrective Action**: Enforce the mandatory Pre-Build Protocol: present the task back, ask the 5 required clarifying questions, establish the technical generation pipeline (Blender Python modeling / AI image generation / 3D reconstruction), lock the prompt contract, and await user approval before writing code.


## Mistake 5 [2026-10-21] — glTF Coordinate Conversion & Local Facing Direction
- **Context**: When exporting from Blender (Z-up, +Y forward) to glTF 2.0 / Three.js (Y-up, -Z forward), Blender's forward direction maps to -Z in Three.js local space. Without accounting for this inversion in the character builders, models would face backwards on the battlefield.
- **Corrective Action**: Explicitly oriented all Puranic models with `model.rotation.y = Math.PI` in their respective builders (`buildPuranic*`), ensuring White pieces on ranks 0-1 face North (-Z) and Black pieces on ranks 6-7 face South (+Z). Verified in headless Chrome with full battlefield render.


## Mistake 6 [2026-10-21] — Primitive Cylinder/Sphere Stacking & Floating Checkerboard Void
- **Context**: Procedurally generated 3D models in Blender by assembling primitive cylinders, spheres, and cones (`primitive_cylinder_add`, `primitive_cone_add`). While textured, the underlying geometry was blocky, resembling toy blocks rather than anatomical human warriors and lifelike beasts. Furthermore, pieces had visible gap offsets above the ground, glowing rings under feet created a floating illusion, disconnected crowns/wings hovered in air, and the entire board was a flat checkerboard slab floating in pitch-black void space.
- **User Feedback**: "redesign it from the scartch, entire play ground , why are they floating ?" (with screenshot showing floating blocky pieces and void background).
- **Corrective Action**: Enforce the mandatory Pre-Build Protocol: present the redesign task back to the user, ask the exact 5 required clarifying questions, establish realistic anatomical organic models, eliminate all floating offsets (ensure exact ground contact), ground the battlefield on real continuous earth/terrain, establish the Prompt Contract, and await explicit approval before rebuilding.


## Mistake 7 [2026-10-22] — Local Scoping ReferenceError When Consolidating Texture Loaders
- **Context**: When refactoring loose texture loaders into the global `StoneTextureManager` in `index.html`, a downstream volumetric ground mist instantiation still referenced the old local variable `stoneLoader.load('assets/textures/mist_noise.png')`, triggering `ReferenceError: stoneLoader is not defined` and aborting scene setup.
- **Corrective Action**: Replaced all residual references with `StoneTextureManager.loader.load(...)`, tested immediately with `node test_game.js`, confirmed 32/32 units loaded and 0 console exceptions.

