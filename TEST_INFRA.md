# Test Infrastructure Specification: Royal Ranbhoomi

**Project**: Royal Ranbhoomi (3D Ancient Indian Battle Chess)  
**Track**: E2E Testing Track (`test_writer_e2e_1`)  
**Status**: Active & Verified  
**Runtime**: Node.js (v18+) / Headless Chrome DevTools Protocol (CDP) WebSocket  

---

## 1. Test Philosophy & Principles

The Royal Ranbhoomi test suite is designed as an independent, opaque-box verification framework derived directly from the authoritative specifications in `ORIGINAL_REQUEST.md` and architecture contracts in `PROJECT.md`.

### Core Axioms
1. **Zero Facade Testing**: No test may produce a trivial `true` assertion without executing real engine logic, querying live WebGL scene graphs, sampling kinematic animation phases, or auditing physics restitution.
2. **Deterministic Opaque-Box Validation**: The test harness interacts with the game runtime strictly via exposed game interfaces (`window.coordToWorld`, `window.performChessMove`, `window.executeSynchronizedKillSequence`, `window.unitGrid`, `window.activeRigs`, `window.buildSculptedUnit`) and Chrome DevTools Protocol (CDP) DOM / WebGL telemetry.
3. **Progressive Testability**: Tests verify completed features and dependencies without crashing or failing when subsequent planned milestones are in flight. Where a planned feature (e.g., M4 opening flyover) is in transition, the test harness evaluates both the interface contract and fallback runtime state gracefully.
4. **Adversarial Edge-Case Stress**: Tests systematically probe extreme boundary coordinates (perimeter files A & H, ranks 1 & 8), simultaneous rapid inputs (cinematic skip hammering), non-standard piece promotions, and multi-piece collision trajectories.
5. **Zero Console Error Mandate**: Any uncaught browser runtime exception or `console.error` during test execution constitutes an automatic test failure.

---

## 2. Test Architecture & Tooling

```
tests/
├── cdp_client.js             # Reusable headless Chrome DevTools Protocol client
├── test_tier1_features.js     # Tier 1: Comprehensive Feature Coverage (R1–R5, 25 tests)
├── test_tier2_boundaries.js   # Tier 2: Boundary & Corner Cases (25 tests)
├── test_tier3_combinations.js # Tier 3: Cross-Feature Interaction Combinations (5 tests)
├── test_tier4_workloads.js    # Tier 4: Real-World Tournament Scenarios & 60 FPS Telemetry (5 tests)
└── run_e2e_tests.js           # Unified CLI runner with formatted reporting and exit codes
```

### CDP Test Harness (`tests/cdp_client.js`)
- **Process Isolation**: Spawns isolated Google Chrome instances (`--headless=new`, `--use-gl=angle`, `--use-angle=d3d11`, `--window-size=1920,1080`) on dynamic remote debugging ports with sandboxed temporary user data directories.
- **WebSocket Protocol**: Establishes bidirectional JSON-RPC communication via `Runtime.evaluate`, `Page.captureScreenshot`, and event listeners for `Runtime.consoleAPICalled` and `Runtime.exceptionThrown`.
- **Lifecycle Cleanup**: Automatically terminates browser child processes and cleans up temporary profile artifacts upon test suite completion.

---

## 3. Feature Inventory Coverage Matrix

Every feature from `PROJECT.md` is covered across the test suite:

| Feature # | Feature Name | Test Tier | Test ID | Verification Criteria |
|---|---|---|---|---|
| 1 | Blender Organic Sculpting Pipeline | Tier 1 | `T1.R1.5` | Smooth organic subdivision surfaces; zero primitive box/cone block stacking |
| 2 | Padati (Pawn) Organic Model & Weapons | Tier 1 | `T1.R1.1` | Kshatriya infantry soldier visibly wielding Rajput Dhal shield and Khanda sword; zero spears, bows, or long sticks |
| 3 | Gajraj (Elephant) Forward Cheek Tusks | Tier 1 | `T1.R1.2` | Forward-curving ivory tusks anchored directly to front cheek bones flanking trunk; zero rump/tail attachments |
| 4 | Ashvarohi (Knight) Marwari Steed & Barding | Tier 1 | `T1.R1.3` | Muscular Marwari warhorse with inward lyre ears, high-relief barding, and rider |
| 5 | Ratha (Bishop) Chariot & 8-Spoked Wheels | Tier 1 | `T1.R1.4` | Sandalwood war chariot with dual 8-spoked Chakra wheels and celestial archer |
| 6 | Maharani (Queen) Twin Khanda Blades & Mantle | Tier 1 | `T1.R1.5` | Graceful warrior queen dual-wielding twin Khanda blades with flowing mantle |
| 7 | Samrat (King) 3-Tier Chhatra Parasol & Gada | Tier 1 | `T1.R1.5` | Chakravarti Emperor beneath 3-tiered Chhatra parasol with heavy Gada mace |
| 8 | High-Contrast Vedic War Faction Palette | Tier 1 | `T1.R1.5` | Pearl Alabaster / Solar Gold (White) vs Volcanic Obsidian / Deep Crimson (Black) |
| 9 | glTF Model Local Coordinate Normalization | Tier 1 | `T1.R2.1-2` | Shared consistent forward $+Z$ local alignment across all 6 models |
| 10 | Absolute Army Facing & Pawn Forward Vector | Tier 1 | `T1.R2.1-4` | White army faces $-Z$ (`Y = π`), Black army faces $+Z$ (`Y = 0`); pawns strictly face enemy forward |
| 11 | Unified Rotation Alignment Across Systems | Tier 1 & 3 | `T1.R2.5`, `T3.1` | Heading dynamically aligns with travel direction during moves and resets to team forward at rest |
| 12 | Articulated Locomotion Rig & Limb Separation | Tier 1 | `T1.R3.1` | Rig nodes `legL`, `legR`, `quadLegs` articulate alternating gait cycles |
| 13 | Archetype Biomechanical Gait Cycles | Tier 1 | `T1.R3.1-4` | Alternating leg rotation (pawns), 4-beat lumber (elephants), canter leap (knights), wheel roll (chariots) |
| 14 | Sweeping Aerial Camera Flyover Trajectory | Tier 1 & 2 | `T1.R4.1`, `T2.3.1-5` | Match start camera initialization along Catmull-Rom spline path |
| 15 | Dynamic Clan Heraldic Sigil Unfurling | Tier 1 | `T1.R4.2` | Faction heraldic sigils (Suryavanshi Vanguard vs Chandravanshi Dominion) |
| 16 | Instantaneous Cinematic Skip Handler | Tier 1 & 2 | `T1.R4.3`, `T2.3.1-5` | Rapid skipping via click, tap, Space, or Escape settling camera into tactical battle view |
| 17 | Procedural Web Audio Shankha Synthesizer | Tier 1 | `T1.R4.4-5` | Autonomous Web Audio Shankha conch fanfare ($f_0 \approx 220\text{ Hz}$) with zero CORS `file://` fetch failures |
| 18 | Comprehensive 3-Stage Combat Execution Matrix | Tier 1 & 3 | `T1.R5.1-4`, `T3.2` | Synchronized choreography across archetypes (Pawn shield beat $\to$ sword cleave; Knight arrow $\to$ L-leap; Elephant tusk gore $\to$ trample) |
| 19 | Defender Threat-Turn, Stagger & 34-Octahedron Shatter | Tier 1 | `T1.R5.5` | Defender faces attacker, staggers backward, and explodes into 34 bouncing octahedron shards with gravity restitution |
| 20 | Opaque-Box E2E Automated Test Suite & 60 FPS Telemetry | Tier 4 | `T4.1-5` | Complete tournament chess games (Scholar's Mate, Ruy Lopez, Sicilian, etc.) sustaining 60 FPS |
| 21 | Adversarial White-Box Coverage Hardening | Tier 2 & 3 | `T2.1-5`, `T3.1-5` | Perimeter tiles, empty boards, promotion boundaries, multi-piece collision avoidance |

---

## 4. Test Tiers Specification

### Tier 1: Feature Coverage (25 Tests)
Organized into 5 sub-suites corresponding to requirements R1 through R5:
- **T1.R1 (3D Organic Modeling & Weapon Visibility)**:
  - `T1.R1.1`: Padati (Pawn) displays Rajput Dhal shield and Khanda sword; zero spears, bows, or tall sticks.
  - `T1.R1.2`: Gajraj (Elephant) tusks originate from front cheek bones flanking trunk and point forward; zero rump/tail attachments.
  - `T1.R1.3`: Ashvarohi (Knight) Marwari warhorse with high-relief barding and rider.
  - `T1.R1.4`: Ratha (Bishop) war chariot with dual 8-spoked Chakra wheels and celestial archer.
  - `T1.R1.5`: Maharani (Queen) twin Khanda blades, Samrat (King) Chhatra parasol & Gada mace, and high-contrast Vedic palette.
- **T1.R2 (Absolute Army & Piece Orientation Integrity)**:
  - `T1.R2.1`: White back-rank army (Z > 0) strictly faces $-Z$ (`rotY ≈ π ± 0.05 rad`).
  - `T1.R2.2`: Black back-rank army (Z < 0) strictly faces $+Z$ (`rotY ≈ 0.0 ± 0.05 rad`).
  - `T1.R2.3`: White pawns (Rank 1) strictly face $-Z$ (toward enemy lines), never facing own King.
  - `T1.R2.4`: Black pawns (Rank 6) strictly face $+Z$ (toward enemy lines), never facing own King.
  - `T1.R2.5`: Piece rotation during move aligns dynamically with travel direction, then resets to team forward at rest.
- **T1.R3 (Biomechanical Articulated Walking Locomotion)**:
  - `T1.R3.1`: Pawn phalanx march gait features alternating leg swing and pelvic roll.
  - `T1.R3.2`: Elephant 4-beat diagonal lumber features sequential leg lift and ground contact.
  - `T1.R3.3`: Knight canter / segmented L-leap achieves parabolic flight clearance ($y \approx 1.65m$) and grounded landing.
  - `T1.R3.4`: Chariot wheel rotation angular velocity is proportional to linear translation speed ($v / r$).
  - `T1.R3.5`: Absolute zero hovering: all 32 units maintain exact $y = 0.000m$ ground contact at rest.
- **T1.R4 (Dynamic Clan Opening Cinematic & Audio Synthesis)**:
  - `T1.R4.1`: Match start initializes camera flyover along Catmull-Rom spline path.
  - `T1.R4.2`: Clan heraldic sigils (Suryavanshi Vanguard vs Chandravanshi Dominion) are displayed.
  - `T1.R4.3`: Instantaneous cinematic skip handler on click/tap/Space/Esc settles camera into tactical view.
  - `T1.R4.4`: Procedural Web Audio Shankha conch synthesizer triggers without external file fetch dependencies.
  - `T1.R4.5`: Master dynamic audio compressor and audio graph initialize safely under browser autoplay rules.
- **T1.R5 (Comprehensive Combat & Capture Choreography Matrix)**:
  - `T1.R5.1`: Pawn capture executes 2-stage shield beat $\to$ lethal Khanda cleave.
  - `T1.R5.2`: Knight capture executes stationary bow draw at origin tile $\to$ bullet-time arrow impact $\to$ post-kill L-leap.
  - `T1.R5.3`: Elephant capture executes trunk lift, tusk gore, and seismic trample shockwave.
  - `T1.R5.4`: Chariot, Queen, and King signature capture executions trigger weapon impacts and visual effects.
  - `T1.R5.5`: Polyhedral shatter explodes defender into 34 bouncing octahedron shards ($r = 0.14u$) with gravity ($-9.8u/s^2$) and floor restitution ($0.45$ at $y = 0.08u$).

### Tier 2: Boundary & Corner Cases (25 Tests)
- `T2.1 (Empty Board & Sparse Pieces)`: 5 tests auditing board clearance, single King vs King, 2-piece endgames, and zero NaN coordinate transforms.
- `T2.2 (Perimeter Files & Corner Tiles)`: 5 tests auditing extreme board coordinates (A1, H1, A8, H8), raycasting edge detection, and boundary tile clamping.
- `T2.3 (Rapid Cinematic Skip Stress)`: 5 tests hammering skip inputs at $t = 0.05s$, $t = 0.1s$, $t = 0.5s$, rapid sequential keypresses, and camera lerp stability.
- `T2.4 (Boundary Combat Interactions)`: 5 tests verifying capture executions on corner tiles (A1, H8) with staging distances clamped within board bounds.
- `T2.5 (Edge-Case Pawn Promotions)`: 5 tests verifying pawn advance to 8th rank, model replacement to Queen/Rook/Bishop/Knight, and orientation alignment.

### Tier 3: Cross-Feature Combinations (5 Tests)
- `T3.1`: Locomotion translation chained with weight-transfer turn (180ms duration, $4^\circ$ banking roll, $0.04u$ dip).
- `T3.2`: Long-range diagonal Queen/Bishop traversal terminating directly in capture and 34-octahedron polyhedral shatter.
- `T3.3`: Knight jumping over occupied intermediate pieces with dynamic flight trajectory and zero physical collision interference.
- `T3.4`: Diagonal capture on 8th rank immediately triggering Queen promotion with faction PBR palette and team forward facing.
- `T3.5`: Camera orbit pad manipulation during active piece locomotion without desync or WebGL rendering pipeline stalls.

### Tier 4: Real-World Scenarios & 60 FPS Telemetry (5 Tests)
- `T4.1`: **Scholar's Mate** (4 moves: 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#) — checkmate banner, sound, facing integrity.
- `T4.2`: **Ruy Lopez Opening** (1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6) — multi-piece mobilization, knight jumps, bishop diagonals.
- `T4.3`: **Sicilian Defense (Open Dragon)** (1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4) — flank pawn advance, center capture, knight recapture.
- `T4.4`: **Queen's Gambit Accepted** (1. d4 d5 2. c4 dxc4 3. e3 b5 4. a4 c6) — central pawn clash, capture resolution, unit facing.
- `T4.5`: **Endgame Checkmate Ladder** — King + Rook cornering lone King, perimeter boundary raycasting, sustained 60 FPS telemetry.

---

## 5. Test Runner & Invocation

### Single Runner Command
```bash
node tests/run_e2e_tests.js
```

### Granular & Selective Execution
```bash
# Run only Tier 1 (Feature Coverage)
node tests/run_e2e_tests.js --tier=1

# Run only Tier 2 (Boundary Cases)
node tests/run_e2e_tests.js --tier=2

# Run only Tier 3 (Combinations)
node tests/run_e2e_tests.js --tier=3

# Run only Tier 4 (Real-World Scenarios)
node tests/run_e2e_tests.js --tier=4

# Run with fast animation speed
node tests/run_e2e_tests.js --fast
```

### Pass/Fail Semantics
- **Exit Code 0**: All executed test suites pass, zero console errors/exceptions, all quantitative tolerance checks satisfied.
- **Exit Code 1**: One or more assertions failed, or an uncaught browser exception was trapped.
