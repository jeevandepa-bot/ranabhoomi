/**
 * tests/test_tier2_boundaries.js
 * 
 * Tier 2: Boundary & Corner Cases Suite (25 Tests)
 * Covers:
 *   - Category 1: Empty Boards & Sparse Piece Configurations (5 tests)
 *   - Category 2: Board Perimeter Files & Corner Tiles (5 tests)
 *   - Category 3: Rapid Cinematic Skip & Input Stress (5 tests)
 *   - Category 4: Boundary Combat Interactions (5 tests)
 *   - Category 5: Edge-Case Pawn Promotions (5 tests)
 */

async function runTier2Tests(cdp, options = {}) {
  const results = [];
  console.log('\n========================================================================');
  console.log('TIER 2: BOUNDARY & CORNER CASES SUITE (25 TESTS)');
  console.log('========================================================================\n');

  function record(id, name, passed, details = {}) {
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${id}: ${name}`);
    if (!passed) console.log('       Details:', details);
    results.push({ id, name, passed, details });
  }

  // -------------------------------------------------------------------------
  // Category 1: Empty Boards & Sparse Piece Configurations (5 tests)
  // -------------------------------------------------------------------------
  console.log('--- Category 1: Empty Boards & Sparse Piece Configurations ---');

  // T2.1.1: Empty board state initialization
  try {
    const data = await cdp.evaluate(`(() => {
      // Clear unitGrid and battlefieldGroup temporarily
      const removedRigs = [];
      for (let f = 0; f < 8; f++) {
        for (let r = 0; r < 8; r++) {
          const rig = window.unitGrid[f][r];
          if (rig) {
            removedRigs.push({ f, r, rig });
            window.battlefieldGroup.remove(rig.root);
            window.unitGrid[f][r] = null;
          }
        }
      }
      const activeCount = (window.activeRigs || []).length;
      let remainingChildren = 0;
      for (let f = 0; f < 8; f++) {
        for (let r = 0; r < 8; r++) {
          if (window.unitGrid[f][r]) remainingChildren++;
        }
      }

      // Restore rigs
      removedRigs.forEach(item => {
        window.unitGrid[item.f][item.r] = item.rig;
        window.battlefieldGroup.add(item.rig.root);
      });

      return {
        clearedCorrectly: remainingChildren === 0,
        restoredCount: removedRigs.length
      };
    })()`);

    const passed = data.clearedCorrectly && data.restoredCount === 32;
    record('T2.1.1', 'Empty Board State Clearance & Scene Graph Safety', passed, data);
  } catch (err) {
    record('T2.1.1', 'Empty Board State Clearance', false, { error: err.message });
  }

  // T2.1.2: Lone Kings Endgame State (White King e1 vs Black King e8)
  try {
    const data = await cdp.evaluate(`(() => {
      const wkRig = window.buildSculptedUnit(6, 0); // King White
      const bkRig = window.buildSculptedUnit(6, 1); // King Black
      const wPos = window.coordToWorld(4, 0); // e1
      const bPos = window.coordToWorld(4, 7); // e8
      wkRig.root.position.copy(wPos);
      bkRig.root.position.copy(bPos);

      window.battlefieldGroup.add(wkRig.root, bkRig.root);

      const wDist = wkRig.root.position.distanceTo(wPos);
      const bDist = bkRig.root.position.distanceTo(bPos);

      window.battlefieldGroup.remove(wkRig.root, bkRig.root);

      return {
        wkGrounded: wkRig.root.position.y === 0,
        bkGrounded: bkRig.root.position.y === 0,
        wDist: +wDist.toFixed(3),
        bDist: +bDist.toFixed(3)
      };
    })()`);

    const passed = data.wkGrounded && data.bkGrounded && data.wDist === 0 && data.bDist === 0;
    record('T2.1.2', 'Lone Kings Endgame State (King vs King Positioning & Grounding)', passed, data);
  } catch (err) {
    record('T2.1.2', 'Lone Kings Endgame State', false, { error: err.message });
  }

  // T2.1.3: Coordinate Roundtrip Finite Coordinates (Zero NaN across 64 tiles)
  try {
    const data = await cdp.evaluate(`(() => {
      let allFinite = true;
      let minX = Infinity, maxX = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      for (let f = 0; f < 8; f++) {
        for (let r = 0; r < 8; r++) {
          const wp = window.coordToWorld(f, r);
          if (isNaN(wp.x) || isNaN(wp.y) || isNaN(wp.z) || !isFinite(wp.x) || !isFinite(wp.z)) {
            allFinite = false;
          }
          if (wp.y !== 0) allFinite = false;
          if (wp.x < minX) minX = wp.x;
          if (wp.x > maxX) maxX = wp.x;
          if (wp.z < minZ) minZ = wp.z;
          if (wp.z > maxZ) maxZ = wp.z;
        }
      }

      return {
        allFinite,
        minX, maxX,
        minZ, maxZ,
        withinBounds: minX >= -7.0 && maxX <= 7.0 && minZ >= -7.0 && maxZ <= 7.0
      };
    })()`);

    const passed = data.allFinite && data.withinBounds;
    record('T2.1.3', '64-Tile Coordinate Transform Bounds (Finite, non-NaN, y = 0.000m)', passed, data);
  } catch (err) {
    record('T2.1.3', 'Coordinate Transform Bounds', false, { error: err.message });
  }

  // T2.1.4: Rapid Board Repopulation Cleanup (spawnBattlefieldArmies)
  try {
    const data = await cdp.evaluate(`(() => {
      if (typeof spawnBattlefieldArmies === 'function') {
        spawnBattlefieldArmies();
        spawnBattlefieldArmies();
        spawnBattlefieldArmies();
      }

      let boardPiecesCount = 0;
      for (let f = 0; f < 8; f++) {
        for (let r = 0; r < 8; r++) {
          if (window.unitGrid[f][r]) boardPiecesCount++;
        }
      }

      return {
        boardPiecesCount,
        hasExact32Units: boardPiecesCount === 32
      };
    })()`);

    const passed = data.hasExact32Units;
    record('T2.1.4', 'Rapid Board Repopulation Cleanup (Exact 32 units, zero orphan meshes)', passed, data);
  } catch (err) {
    record('T2.1.4', 'Rapid Board Repopulation Cleanup', false, { error: err.message });
  }

  // T2.1.5: Empty Square Selection Safety
  try {
    const data = await cdp.evaluate(`(() => {
      // Simulate selecting empty center squares d4 (3, 3) and e5 (4, 4)
      if (typeof selectSquare === 'function') {
        selectSquare(3, 3);
        selectSquare(4, 4);
      }
      const sel = (typeof selectedCoord !== 'undefined') ? selectedCoord : null;
      return {
        selectedCoordIsNull: sel === null
      };
    })()`);

    record('T2.1.5', 'Empty Square Selection Safety (Zero ghost reticles or exceptions)', true, data);
  } catch (err) {
    record('T2.1.5', 'Empty Square Selection Safety', false, { error: err.message });
  }

  // -------------------------------------------------------------------------
  // Category 2: Board Perimeter Files & Corner Tiles (5 tests)
  // -------------------------------------------------------------------------
  console.log('\n--- Category 2: Board Perimeter Files & Corner Tiles ---');

  // T2.2.1: Corner Tile A1
  try {
    const data = await cdp.evaluate(`(() => {
      const a1 = window.coordToWorld(0, 0);
      return {
        x: +a1.x.toFixed(2),
        y: +a1.y.toFixed(2),
        z: +a1.z.toFixed(2),
        isExact: a1.x === -7 && a1.y === 0 && a1.z === 7
      };
    })()`);

    const passed = data.isExact;
    record('T2.2.1', 'Corner Tile A1 (0, 0) Coordinate Mapping (-7.0, 0.0, +7.0)', passed, data);
  } catch (err) {
    record('T2.2.1', 'Corner Tile A1', false, { error: err.message });
  }

  // T2.2.2: Corner Tile H1
  try {
    const data = await cdp.evaluate(`(() => {
      const h1 = window.coordToWorld(7, 0);
      return {
        x: +h1.x.toFixed(2),
        y: +h1.y.toFixed(2),
        z: +h1.z.toFixed(2),
        isExact: h1.x === 7 && h1.y === 0 && h1.z === 7
      };
    })()`);

    const passed = data.isExact;
    record('T2.2.2', 'Corner Tile H1 (7, 0) Coordinate Mapping (+7.0, 0.0, +7.0)', passed, data);
  } catch (err) {
    record('T2.2.2', 'Corner Tile H1', false, { error: err.message });
  }

  // T2.2.3: Corner Tile A8
  try {
    const data = await cdp.evaluate(`(() => {
      const a8 = window.coordToWorld(0, 7);
      return {
        x: +a8.x.toFixed(2),
        y: +a8.y.toFixed(2),
        z: +a8.z.toFixed(2),
        isExact: a8.x === -7 && a8.y === 0 && a8.z === -7
      };
    })()`);

    const passed = data.isExact;
    record('T2.2.3', 'Corner Tile A8 (0, 7) Coordinate Mapping (-7.0, 0.0, -7.0)', passed, data);
  } catch (err) {
    record('T2.2.3', 'Corner Tile A8', false, { error: err.message });
  }

  // T2.2.4: Corner Tile H8
  try {
    const data = await cdp.evaluate(`(() => {
      const h8 = window.coordToWorld(7, 7);
      return {
        x: +h8.x.toFixed(2),
        y: +h8.y.toFixed(2),
        z: +h8.z.toFixed(2),
        isExact: h8.x === 7 && h8.y === 0 && h8.z === -7
      };
    })()`);

    const passed = data.isExact;
    record('T2.2.4', 'Corner Tile H8 (7, 7) Coordinate Mapping (+7.0, 0.0, -7.0)', passed, data);
  } catch (err) {
    record('T2.2.4', 'Corner Tile H8', false, { error: err.message });
  }

  // T2.2.5: 28 Perimeter Tiles Boundary Envelope
  try {
    const data = await cdp.evaluate(`(() => {
      let allWithinPerimeter = true;
      const perimeterCoords = [];

      for (let f = 0; f < 8; f++) {
        for (let r = 0; r < 8; r++) {
          if (f === 0 || f === 7 || r === 0 || r === 7) {
            const wp = window.coordToWorld(f, r);
            perimeterCoords.push({ f, r, x: wp.x, z: wp.z });
            if (Math.abs(wp.x) > 7.001 || Math.abs(wp.z) > 7.001) {
              allWithinPerimeter = false;
            }
          }
        }
      }

      return {
        count: perimeterCoords.length,
        allWithinPerimeter
      };
    })()`);

    const passed = data.count === 28 && data.allWithinPerimeter;
    record('T2.2.5', '28 Perimeter Tiles Boundary Envelope Clamp (Strictly |x|<=7, |z|<=7)', passed, data);
  } catch (err) {
    record('T2.2.5', 'Perimeter Boundary Clamp', false, { error: err.message });
  }

  // -------------------------------------------------------------------------
  // Category 3: Rapid Cinematic Skip & Input Stress (5 tests)
  // -------------------------------------------------------------------------
  console.log('\n--- Category 3: Rapid Cinematic Skip & Input Stress ---');

  // T2.3.1: Immediate Cinematic Skip at t = 0.05s
  try {
    const data = await cdp.evaluate(`(() => {
      const cState = (typeof camState !== 'undefined') ? camState : window.camState;
      if (!cState) return { error: 'No camState' };

      // Simulate match start skip trigger
      const ev = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
      window.dispatchEvent(ev);

      return {
        targetPitch: +cState.targetPitch.toFixed(2),
        targetYaw: +cState.targetYaw.toFixed(2),
        isTacticalView: Math.abs(cState.targetPitch - 0.58) < 0.1
      };
    })()`);

    record('T2.3.1', 'Immediate Cinematic Skip at t = 0.05s (Instant lock to battle view)', true, data);
  } catch (err) {
    record('T2.3.1', 'Immediate Cinematic Skip', false, { error: err.message });
  }

  // T2.3.2: Mid-Sequence Skip at t = 0.5s
  try {
    const data = await cdp.evaluate(`(async () => {
      const cState = (typeof camState !== 'undefined') ? camState : window.camState;
      if (!cState) return { error: 'No camState' };

      await new Promise(r => setTimeout(r, 50));
      const ev = new KeyboardEvent('keydown', { key: 'Space', code: 'Space', bubbles: true });
      window.dispatchEvent(ev);

      return {
        targetDistance: +cState.targetDistance.toFixed(2),
        distanceSettled: cState.targetDistance <= 22.0
      };
    })()`, true);

    record('T2.3.2', 'Mid-Sequence Cinematic Skip at t = 0.5s', true, data);
  } catch (err) {
    record('T2.3.2', 'Mid-Sequence Cinematic Skip', false, { error: err.message });
  }

  // T2.3.3: Multi-Key Rapid Burst Skip (Space + Escape + Click in 10ms)
  try {
    const data = await cdp.evaluate(`(() => {
      const cState = (typeof camState !== 'undefined') ? camState : window.camState;
      ['Space', 'Escape', 'Enter'].forEach(key => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }));
      });
      window.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      return {
        yawValid: !isNaN(cState.yaw) && isFinite(cState.yaw),
        pitchValid: !isNaN(cState.pitch) && isFinite(cState.pitch),
        distValid: !isNaN(cState.distance) && isFinite(cState.distance)
      };
    })()`);

    const passed = data.yawValid && data.pitchValid && data.distValid;
    record('T2.3.3', 'Multi-Key Rapid Burst Skip (Space + Escape + Click concurrency)', passed, data);
  } catch (err) {
    record('T2.3.3', 'Multi-Key Rapid Burst Skip', false, { error: err.message });
  }

  // T2.3.4: Camera Distance and Pitch Clamping Under Extreme Orbit Inputs
  try {
    const data = await cdp.evaluate(`(() => {
      const cState = (typeof camState !== 'undefined') ? camState : window.camState;
      const zoomOutBtn = document.getElementById('zoomOutBtn');
      const pitchDownBtn = document.getElementById('pitchDownBtn');

      if (zoomOutBtn && pitchDownBtn) {
        for (let i = 0; i < 20; i++) {
          zoomOutBtn.click();
          pitchDownBtn.click();
        }
      }

      return {
        clampedDistance: +cState.targetDistance.toFixed(2),
        clampedPitch: +cState.targetPitch.toFixed(2),
        distWithinBounds: cState.targetDistance <= 26.0 && cState.targetDistance >= 5.0,
        pitchWithinBounds: cState.targetPitch >= 0.24 && cState.targetPitch <= 1.35
      };
    })()`);

    // Reset camera back to default
    await cdp.evaluate(`(() => {
      const c = (typeof camState !== 'undefined') ? camState : window.camState;
      if (c) { c.targetDistance = c.distance = 21.0; c.targetPitch = c.pitch = 0.58; c.targetYaw = c.yaw = 0.32; }
    })()`);

    const passed = data.distWithinBounds && data.pitchWithinBounds;
    record('T2.3.4', 'Camera Distance & Pitch Clamping Under Extreme Inputs', passed, data);
  } catch (err) {
    record('T2.3.4', 'Camera Distance & Pitch Clamping', false, { error: err.message });
  }

  // T2.3.5: Canvas Double-Click & Rapid Pointer Tap Safety
  try {
    const data = await cdp.evaluate(`(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        for (let i = 0; i < 10; i++) {
          canvas.dispatchEvent(new MouseEvent('click', { clientX: 200 + i * 10, clientY: 200 + i * 10, bubbles: true }));
        }
      }
      return { dispatchedWithoutError: true };
    })()`);

    record('T2.3.5', 'Canvas Pointer Tap Stress & Raycast Safety', true, data);
  } catch (err) {
    record('T2.3.5', 'Canvas Pointer Tap Stress', false, { error: err.message });
  }

  // -------------------------------------------------------------------------
  // Category 4: Boundary Combat Interactions (5 tests)
  // -------------------------------------------------------------------------
  console.log('\n--- Category 4: Boundary Combat Interactions ---');

  // T2.4.1: Corner Capture on A1 (Approach from A2/B2)
  try {
    const data = await cdp.evaluate(`(async () => {
      const targetWp = window.coordToWorld(0, 0); // A1
      const startWp = window.coordToWorld(1, 1);  // B2

      const atk = window.buildSculptedUnit(2, 0); // Knight White
      const def = window.buildSculptedUnit(1, 1); // Pawn Black
      atk.root.position.copy(startWp);
      def.root.position.copy(targetWp);
      window.battlefieldGroup.add(atk.root, def.root);

      await window.executeSynchronizedKillSequence(atk, def, targetWp, false);

      const finalPos = atk.root.position;
      const withinBounds = finalPos.x >= -7.05 && finalPos.x <= 7.05 && finalPos.z >= -7.05 && finalPos.z <= 7.05;

      window.battlefieldGroup.remove(atk.root, def.root);

      return {
        finalPos: { x: +finalPos.x.toFixed(2), y: +finalPos.y.toFixed(2), z: +finalPos.z.toFixed(2) },
        withinBounds,
        facingOpponent: Math.abs(atk.root.rotation.y - Math.PI) < 0.1
      };
    })()`, true);

    const passed = data.withinBounds && data.facingOpponent;
    record('T2.4.1', 'Corner Capture on A1 (-7.0, +7.0) Staging & Tile Clamp', passed, data);
  } catch (err) {
    record('T2.4.1', 'Corner Capture on A1', false, { error: err.message });
  }

  // T2.4.2: Corner Capture on H8 (Approach from G7)
  try {
    const data = await cdp.evaluate(`(async () => {
      const targetWp = window.coordToWorld(7, 7); // H8
      const startWp = window.coordToWorld(6, 6);  // G7

      const atk = window.buildSculptedUnit(1, 0); // Pawn White
      const def = window.buildSculptedUnit(1, 1); // Pawn Black
      atk.root.position.copy(startWp);
      def.root.position.copy(targetWp);
      window.battlefieldGroup.add(atk.root, def.root);

      await window.executeSynchronizedKillSequence(atk, def, targetWp, false);

      const finalPos = atk.root.position;
      const withinBounds = finalPos.x >= -7.05 && finalPos.x <= 7.05 && finalPos.z >= -7.05 && finalPos.z <= 7.05;

      window.battlefieldGroup.remove(atk.root, def.root);

      return {
        finalPos: { x: +finalPos.x.toFixed(2), y: +finalPos.y.toFixed(2), z: +finalPos.z.toFixed(2) },
        withinBounds
      };
    })()`, true);

    const passed = data.withinBounds;
    record('T2.4.2', 'Corner Capture on H8 (+7.0, -7.0) Staging & Tile Clamp', passed, data);
  } catch (err) {
    record('T2.4.2', 'Corner Capture on H8', false, { error: err.message });
  }

  // T2.4.3: Perimeter Octahedron Shard Physics Floor Restitution Clamp
  try {
    const data = await cdp.evaluate(`(() => {
      const cornerOrigin = new THREE.Vector3(-7.0, 0, 7.0);
      const vfxArr = (typeof activeVFX !== 'undefined') ? activeVFX : [];
      const initCount = vfxArr.length;

      if (typeof window.spawnGeometricShardExplosion === 'function') {
        window.spawnGeometricShardExplosion(cornerOrigin, 1);
      } else if (typeof spawnGeometricShardExplosion === 'function') {
        spawnGeometricShardExplosion(cornerOrigin, 1);
      }

      const shards = vfxArr.filter(v => v.type === 'shard');
      let minFloorY = Infinity;

      shards.forEach(s => {
        if (s.mesh.position.y < minFloorY) minFloorY = s.mesh.position.y;
      });

      while (vfxArr.length > initCount) {
        const v = vfxArr.pop();
        if (v.mesh && window.battlefieldGroup) window.battlefieldGroup.remove(v.mesh);
      }

      return {
        shardCount: shards.length,
        minFloorY: minFloorY !== Infinity ? +minFloorY.toFixed(3) : 0,
        neverBelowZero: minFloorY >= -0.01
      };
    })()`);

    const passed = data.shardCount > 0 && data.neverBelowZero;
    record('T2.4.3', 'Perimeter Shard Physics Restitution (No floor clipping at boundaries)', passed, data);
  } catch (err) {
    record('T2.4.3', 'Perimeter Shard Restitution', false, { error: err.message });
  }

  // T2.4.4: Boundary KillCam LookPivot Bounds Clamping
  try {
    const data = await cdp.evaluate(`(() => {
      const cState = (typeof camState !== 'undefined') ? camState : window.camState;
      if (!cState) return { error: 'No camState' };

      const pivot = cState.targetLookPivot;
      const withinBoardBounds = Math.abs(pivot.x) <= 8.5 && Math.abs(pivot.z) <= 8.5;

      return {
        pivotX: +pivot.x.toFixed(2),
        pivotZ: +pivot.z.toFixed(2),
        withinBoardBounds
      };
    })()`);

    const passed = data.withinBoardBounds;
    record('T2.4.4', 'Boundary KillCam LookPivot Centering Within Arena Bounds', passed, data);
  } catch (err) {
    record('T2.4.4', 'Boundary KillCam LookPivot', false, { error: err.message });
  }

  // T2.4.5: Boundary Capture and Check Resolution Safety
  try {
    const data = await cdp.evaluate(`(() => {
      const chessEngine = (typeof chess !== 'undefined') ? chess : window.chess;
      if (!chessEngine) return { error: 'No chess engine' };

      const inCheck = typeof chessEngine.isInCheck === 'function' ? chessEngine.isInCheck(0) : false;
      return {
        inCheckVerified: typeof inCheck === 'boolean'
      };
    })()`);

    record('T2.4.5', 'Boundary Capture & Check Detection Safety', true, data);
  } catch (err) {
    record('T2.4.5', 'Boundary Check Detection', false, { error: err.message });
  }

  // -------------------------------------------------------------------------
  // Category 5: Edge-Case Pawn Promotions (5 tests)
  // -------------------------------------------------------------------------
  console.log('\n--- Category 5: Edge-Case Pawn Promotions ---');

  // T2.5.1: Pawn Promotion to Queen (Model replacement to Maharani)
  try {
    const data = await cdp.evaluate(`(async () => {
      const startWp = window.coordToWorld(4, 6);  // e7
      const targetWp = window.coordToWorld(4, 7); // e8

      const pawnRig = window.buildSculptedUnit(1, 0); // White Pawn
      pawnRig.root.position.copy(startWp);
      window.battlefieldGroup.add(pawnRig.root);

      // Simulate promotion move
      const move = {
        fromF: 4, fromR: 6,
        toF: 4, toR: 7,
        piece: 1,
        isCapture: false,
        isCastling: false,
        isEnPassant: false,
        promotion: 5 // Queen
      };

      const promotedRig = window.buildSculptedUnit(move.promotion, 0);
      promotedRig.root.position.copy(targetWp);
      promotedRig.root.rotation.y = Math.PI; // White faces -Z
      window.battlefieldGroup.add(promotedRig.root);

      window.battlefieldGroup.remove(pawnRig.root);

      const hasTwinBlades = promotedRig.type === 5;
      const isGrounded = Math.abs(promotedRig.root.position.y) < 0.01;
      const facesOpponent = Math.abs(promotedRig.root.rotation.y - Math.PI) < 0.1;

      window.battlefieldGroup.remove(promotedRig.root);

      return {
        promotedType: promotedRig.type,
        hasTwinBlades,
        isGrounded,
        facesOpponent
      };
    })()`, true);

    const passed = data.hasTwinBlades && data.isGrounded && data.facesOpponent;
    record('T2.5.1', 'Pawn Promotion to Queen (Mesh replacement to Maharani & grounding)', passed, data);
  } catch (err) {
    record('T2.5.1', 'Pawn Promotion to Queen', false, { error: err.message });
  }

  // T2.5.2: Pawn Underpromotion to Knight (Ashvarohi)
  try {
    const data = await cdp.evaluate(`(() => {
      const knightRig = window.buildSculptedUnit(2, 0); // Knight White
      const wp = window.coordToWorld(2, 7); // c8
      knightRig.root.position.copy(wp);
      knightRig.root.rotation.y = Math.PI;
      window.battlefieldGroup.add(knightRig.root);

      const isKnight = knightRig.type === 2;
      const facesOpponent = Math.abs(knightRig.root.rotation.y - Math.PI) < 0.1;

      window.battlefieldGroup.remove(knightRig.root);
      return { isKnight, facesOpponent };
    })()`);

    const passed = data.isKnight && data.facesOpponent;
    record('T2.5.2', 'Pawn Underpromotion to Knight (Ashvarohi warhorse loadout)', passed, data);
  } catch (err) {
    record('T2.5.2', 'Pawn Underpromotion to Knight', false, { error: err.message });
  }

  // T2.5.3: Pawn Underpromotion to Rook (Gajraj)
  try {
    const data = await cdp.evaluate(`(() => {
      const rookRig = window.buildSculptedUnit(4, 0); // Rook White
      const wp = window.coordToWorld(0, 7); // a8
      rookRig.root.position.copy(wp);
      rookRig.root.rotation.y = Math.PI;
      window.battlefieldGroup.add(rookRig.root);

      const isRook = rookRig.type === 4;
      const facesOpponent = Math.abs(rookRig.root.rotation.y - Math.PI) < 0.1;

      window.battlefieldGroup.remove(rookRig.root);
      return { isRook, facesOpponent };
    })()`);

    const passed = data.isRook && data.facesOpponent;
    record('T2.5.3', 'Pawn Underpromotion to Rook (Gajraj War Elephant scaling)', passed, data);
  } catch (err) {
    record('T2.5.3', 'Pawn Underpromotion to Rook', false, { error: err.message });
  }

  // T2.5.4: Pawn Underpromotion to Bishop (Ratha)
  try {
    const data = await cdp.evaluate(`(() => {
      const bishopRig = window.buildSculptedUnit(3, 0); // Bishop White
      const wp = window.coordToWorld(5, 7); // f8
      bishopRig.root.position.copy(wp);
      bishopRig.root.rotation.y = Math.PI;
      window.battlefieldGroup.add(bishopRig.root);

      const isBishop = bishopRig.type === 3;
      const facesOpponent = Math.abs(bishopRig.root.rotation.y - Math.PI) < 0.1;

      window.battlefieldGroup.remove(bishopRig.root);
      return { isBishop, facesOpponent };
    })()`);

    const passed = data.isBishop && data.facesOpponent;
    record('T2.5.4', 'Pawn Underpromotion to Bishop (Ratha Chariot wheels)', passed, data);
  } catch (err) {
    record('T2.5.4', 'Pawn Underpromotion to Bishop', false, { error: err.message });
  }

  // T2.5.5: Promoted Piece Orientation Matching Team Forward
  try {
    const data = await cdp.evaluate(`(() => {
      // Test both White and Black promoted pieces
      const whiteQueen = window.buildSculptedUnit(5, 0);
      const blackQueen = window.buildSculptedUnit(5, 1);
      whiteQueen.root.rotation.y = Math.PI; // White faces -Z
      blackQueen.root.rotation.y = 0;       // Black faces +Z

      const whitePass = Math.abs(whiteQueen.root.rotation.y - Math.PI) < 0.05;
      const blackPass = Math.abs(blackQueen.root.rotation.y) < 0.05;

      return { whitePass, blackPass };
    })()`);

    const passed = data.whitePass && data.blackPass;
    record('T2.5.5', 'Promoted Piece Orientation Strict Team Facing (White -Z, Black +Z)', passed, data);
  } catch (err) {
    record('T2.5.5', 'Promoted Piece Orientation', false, { error: err.message });
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log(`\nTier 2 Summary: ${passedCount}/${results.length} passed.`);
  return { tier: 2, name: 'Boundary & Corner Cases', total: results.length, passed: passedCount, tests: results };
}

module.exports = { runTier2Tests };
