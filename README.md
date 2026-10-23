# Royal Ranbhoomi (राजसी रणभूमि ३D) — Authentic Ancient Indian 3D Battle Chess

**Royal Ranbhoomi (राजसी रणभूमि ३D)** is an authentic, high-fidelity ancient Indian 3D battle chess game built for the **Gemini 3.8 Flash benchmark build test**.

It features custom-sculpted 3D Puranic character models engineered via **Blender 4.2.0 LTS**, high-resolution PBR procedural textures, an Ancient Indian Desert Fortress arena, recorded acoustic audio, 3-stage synchronized executions, a complete tournament FIDE chess engine with 3-tier Negamax AI, and a 0.16x bullet-time slow-motion cinematic camera.

---

## ⚔️ The Two Dynasties

- **☀️ Suryavanshi Deva Dynasty (White)**: The Solar Empire — resplendent 24K Surya Gold armor, pleated saffron silk, pure white Marwari steeds (*Uchchaihshravas* lineage), holy ash-gray temple elephants with vermilion *Shringar*, warm golden bronze skin, and radiant golden celestial halos.
- **🌑 Chandravanshi Asura Empire (Black)**: The Midnight Shadow Empire — burnished dark obsidian armor, deep imperial blood-ruby silk, midnight obsidian war steeds, dark iron war elephants, twilight dusk warrior tones, and ruby/violet ethereal glow.

---

## 🎨 Authentic Puranic 3D Models (`.glb`) & Texture Suite

Every piece has been sculpted from scratch in **Blender 4.2.0 LTS** as described in the ancient Indian Epics (*Mahabharata*, *Ramayana*, and *Puranas*):

1. **Padati Kshatriya Foot Soldier (पदाति क्षत्रिय — Pawn)**:
   - **File**: `assets/padati.glb` (1.34 MB)
   - **Regalia**: 24K gold *Kavacha* cuirass embossed with a central *Surya* sun mandala, pleated saffron silk *Dhoti*, crested *Shirastra* warrior helm with plume, traditional circular Rajput *Dhal* shield with 4 brass boss studs, and a 2.4m kinetic leaf-bladed *Bhala* spear.
   - **Textures**: `kavacha_gold.png`, `dhoti_silk.png`, `damascus_steel.png`.

2. **Gajraj Fortified War Elephant (गजराज महादुर्ग — Rook)**:
   - **File**: `assets/gajadhvaja.glb`
   - **Regalia**: 1:1 match to the reference artwork — an anatomical Indian war elephant standing upon a stepped stone plinth with a glowing circular Sanskrit rune disc. Mounted on its back is a multi-tiered carved stone castle fortress tower featuring 4 corner bartizans, recessed arched lantern windows with golden inner glow, and 8 crenellated battlements. The elephant is adorned with an ornate 24K gold chamfron headpiece embedded with a glowing amber cabochon forehead jewel, hanging gold temple ear bells, triple gold tusk cuffs, gold ankle *Kadas*, and an embroidered scalloped silk *Jhul* blanket trimmed with 28 hanging golden teardrop tassels.
   - **Textures**: `elephant_skin.png`, `elephant_jhul.png`, `sandalwood_chariot.png`, `kavacha_gold.png`.

3. **Ashvarohi Marwari Cavalry (अश्वारोही महारथी — Knight)**:
   - **File**: `assets/ashvarohi.glb` (1.24 MB)
   - **Regalia**: Purebred Marwari warhorse with distinctive inward-curled lyre ears, arched equine neck, steel hooves, and royal gold saddle/stirrups. Mounted by a Kshatriya Dragoon in pleated saffron *Pagri* turban and silk *Dhoti*, wielding a 3.2m spiraled jousting lance with a fluttering battle pennant.
   - **Textures**: `dhoti_silk.png`, `damascus_steel.png`, `kavacha_gold.png`.

4. **Ratha Maharathi Vedic War Chariot (रथ महारथी — Bishop)**:
   - **File**: `assets/ratha.glb` (1.36 MB)
   - **Regalia**: Winged war chariot carved from Indian sandalwood with curved front *Varutha* shield, dual 12-spoked bronze *Surya Chakra* sun-wheels with revolving hub scythes. Carrying a standing Celestial Sage Archer with a radiant hovering *Prabhamandala* halo and the legendary recurve *Gandiva* greatbow.
   - **Textures**: `sandalwood_chariot.png`, `kavacha_gold.png`, `damascus_steel.png`, `dhoti_silk.png`.

5. **Maharani Veerangana (महारानी वीरांगना — Queen)**:
   - **File**: `assets/maharani.glb` (1.11 MB)
   - **Regalia**: Supreme martial warrior queen draped in a pleated warrior saree (*Kachha* style), contoured 24K gold *Kavacha* armor, multi-tiered radiating *Surya-Mukuta* crown, twin levitating radiant energy wings, and a dual-ended crescent *Khanda* polearm.
   - **Textures**: `kavacha_gold.png`, `dhoti_silk.png`, `damascus_steel.png`.

6. **Samrat Chakravarti Imperial Monarch (सम्राट चक्रवर्ती — King)**:
   - **File**: `assets/samrat.glb` (1.00 MB)
   - **Regalia**: Imperial Vedic Monarch in sovereign gold plate armor, royal draped mantle with gold eyelets and zari borders, multi-tiered imperial *Kirita-Mukuta* crown with a glowing central ruby crest, and the colossal two-handed *Khanda* broadsword.
   - **Textures**: `kavacha_gold.png`, `elephant_jhul.png`, `damascus_steel.png`.

---

## 🎵 Recorded Acoustic Sound Effects & Audio Suite

Pure synthetic oscillator beeps have been replaced with authentic recorded acoustic audio clips via low-latency Web Audio buffers and HTML5 Audio fallbacks:
- **`assets/move.mp3`**: Crisp stone/wood piece movement and footfall impact.
- **`assets/capture_sfx.mp3`**: Heavy steel blade clash and martial strike.
- **`assets/horse.mp3`**: Authentic recorded equine whinny, snort, and gallop.
- **`assets/elephant.ogg`**: Recorded elephant trumpeting battle roar.
- **`assets/conch.ogg`**: Authentic ancient Indian *Shankha* (sacred war conch shell) blown at battle start and checkmate.
- **`assets/berserk_sfx.mp3`**: Dramatic battle crescendo and attack windup.
- **`assets/explosion.mp3`**: Tectonic ground shockwave and impact shattering.
- **`assets/victory.mp3`**: Royal battle victory fanfare.
- **`assets/defeat.mp3`**: Solemn defeat theme.
- **Cinematic Sub-Bass Drop**: 4-layer sub-bass vacuum drop (145 Hz $\to$ 24 Hz) through lowpass filter sweeping into a dual heartbeat for the 0.16x bullet-time pocket.

---

## 🏛️ Battlefield Arena & Interactive Studio

### 1. Ancient Indian Desert Fortress (रणभूमि दुर्ग)
- **Multi-tiered Sandstone Bastions**: Elevated desert sandstone terrace with carved battlements, Rajput *jharokhas*, and arrow slits.
- **4 Corner Royal Chhatris**: Grand octagonal sandstone bastions topped with gold-domed pavilions flying royal dynasty flags.
- **Polished Indian Marble Chessboard**: Alternating squares of Makrana polished white marble (`#f4f1ea`) and royal Udaipur dark granite (`#181720`), surrounded by an embossed golden Sanskrit *Yantra* mandala border.
- **Atmospheric Golden-Hour Lighting**: Warm desert sunlight casting soft PCF shadows, glowing ambient desert fill, and drifting golden dust particles.

### 2. Sculpt & Kill Studio Mode
- One-click tab switch to inspect any of the 6 characters in full 360-degree rotation on an ornate Indian pedestal.
- Preview **Idle Breathing**, **Mathematical Walk Cycle**, and the **3-Stage Synchronized Execution Sequence**.
- Toggle between **☀️ Suryavanshi Gold** and **🌑 Chandravanshi Crimson** themes dynamically.

---

## 🎬 Baahubali Mahishmati Citadel Courtyard & Grounding
- **Expansive Horizon**: Replaced the void with a 360-degree ancient Mahishmati citadel terrace ringing the chessboard with 30 rugged sandstone mountain cliffs, an inverted golden-hour sky dome with Surya solar mandala, 4 corner citadel bastions with domed *Chhatris* and fluttering dynastic war banners, and 8 carved stone *Yajna Kundas* with dynamic flickering firelight and smoke particles.
- **Mathematical Zero-Float Grounding**: Every 3D character model is calibrated so its lowest vertex rests at $y = 0.000$ on the Makrana marble and Udaipur granite tiles. Removed hovering ring discs and replaced them with radial ambient occlusion contact shadows ($y = 0.002$).

---

## ⚡ ROYAL RANBHOOMI — Animation Bible v1.0 Implementation
- **Section 11 (Master Impact-Frame Table & Strike Distances)**:
  - Exact frame-accurate impact triggers: Pawn spear thrust (f17 = 0.567s), Rook tectonic stomp (f50 = 1.667s), Knight lance charge (f32 = 1.067s), Bishop arrow volley (f27 = 0.900s), Queen whirlwind (f31 = 1.033s), King Khanda cleave (f22 = 0.733s).
  - Manifest registered in `manifest.json`.
- **Section 12 (Procedural Fallbacks)**:
  - Weight-scaled idle breathing (3s light, 5s medium, 6s heavy) with torso pitch $\pm 2^\circ$.
  - 4-beat elephant lumbering sway, chariot wheel spinning, and warrior stride locomotion.
  - Procedural hit flinch and fall-away death sequences.
- **Section 13 (ProceduralAnimator, KeyframePlayer & Physics)**:
  - `KeyframePlayer`: Smooth easing (`linear`, `ease`, `easeIn`, `easeOut`, `snap` [$t^4$], `hold`) evaluated at 30 fps.
  - `SecondaryChain`: Real-time spring-damper inertia lag on elephant howdah (20/3/0.6), elephant trunk/tassels (25/5/0.8), horse tail (30/4/1.0), and royal mantles/capes (40/6/1.2).
  - `arc()` & `bezier()`: Mathematical ballistic curves for knight vaults and projectile trajectories.
  - `QueenAfterimagePool`: Ethereal glowing afterimages spawned along the Queen's sprint/whirlwind path fading over 10 frames with additive blending.

---

## 🐎 Dynamic Mechanics & 3.2m Horse Ballistic Vault

- **Horse Ballistic Vault Over Pieces**:
  - The Knight leaps in a verified **3.2m parabolic trajectory** ($y = \sin(t \cdot \pi) \cdot 3.2$), cleanly clearing any pawns or pieces standing on intervening squares.
  - Accompanied by takeoff whinny audio, ground dust rings, and heavy landing shockwaves.
- **Synchronized 3-Stage Kill Choreography**:
  - Each piece executes its distinct 3-stage combat sequence (Shield Bash $\to$ Spear Thrust $\to$ Core Shatter; Elephant Rearing $\to$ Tusk Gore $\to$ Trample; etc.).
- **0.16x Bullet-Time Dilation**:
  - Global animation speed drops from 1.00x to 0.16x for 480ms on fatal impact frame ($t = 0.56$).
  - Camera performs a dramatic FOV dolly-zoom punch ($42^\circ \to 31^\circ$).
  - Ambient light dims to spotlight the duel, radial speed lines activate, and the defender bursts into 34 tumbling polyhedral octahedron shards.

---

## ♟️ Tournament FIDE Chess Engine & 3-Tier AI

- **Full FIDE Compliance**: Legal move generation, check/checkmate, stalemate, castling (kingside & queenside), en passant captures, pawn promotion with interactive selection modal, 50-move rule, and threefold repetition tracking.
- **Negamax AI with Alpha-Beta Pruning**:
  - **Level 1 (Novice // सैनिक)**: Fast depth 1 search.
  - **Level 2 (Warrior // सेनापति)**: Depth 2 search with positional piece-square evaluation.
  - **Level 3 (Grandmaster // चक्रवर्ती)**: Depth 3-4 Alpha-Beta search with material and center control weighting.

---

## 🚀 How to Launch & Play

### Method 1: One-Click Launch (Recommended)
Double-click `start_game.bat` in this folder:
```cmd
start_game.bat
```
This automatically starts a local web server on port 8080 and opens `http://localhost:8080` in your default browser with full local `.glb` and `.mp3` loading.

### Method 2: Python HTTP Server
```bash
python -m http.server 8080
```
Then navigate to: [http://localhost:8080](http://localhost:8080)
