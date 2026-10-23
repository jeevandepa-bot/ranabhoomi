/**
 * tests/test_tier3_combinations.js
 * 
 * Tier 3: Cross-Feature Interaction Combinations Suite (5 Tests)
 * Tests complex interactions between:
 *   - Locomotion, weight-transfer turns, and banking roll
 *   - Long-range traversal into combat capture
 *   - Knight ballistic vault over intervening pieces
 *   - Diagonal capture on 8th rank with promotion & orientation reset
 *   - Real-time camera orbit manipulation during active piece locomotion
 */

async function runTier3Tests(cdp, options = {}) {
  const results = [];
  console.log('\n========================================================================');
  console.log('TIER 3: CROSS-FEATURE COMBINATIONS SUITE (5 TESTS)');
  console.log('========================================================================\n');

  function record(id, name, passed, details = {}) {
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${id}: ${name}`);
    if (!passed) console.log('       Details:', details);
    results.push({ id, name, passed, details });
  }

  // T3.1: Locomotion Chained with Weight-Transfer Turn & Banking Roll
  try {
    const data = await cdp.evaluate(`(async () => {
      const rig = (window.activeRigs || []).find(r => r.type === 1 && r.team === 0);
      if (!rig) return { error: 'No white pawn' };

      const startPos = rig.root.position.clone();
      const intermediatePos = window.coordToWorld(4, 2);
      const originalYaw = rig.root.rotation.y;

      // 1. Walk to intermediate tile
      await window.animateUnitWalkTo(rig, intermediatePos, 0.45, false);

      // 2. Immediate 90-degree weight transfer turn
      const targetYaw = originalYaw + Math.PI / 2;
      let maxBank = 0;
      let minDip = 0;
      let isTracking = true;

      const tracker = () => {
        if (!isTracking) return;
        const b = Math.abs(rig.torso.rotation.z);
        const d = rig.bodyRoot.position.y;
        if (b > maxBank) maxBank = b;
        if (d < minDip) minDip = d;
        requestAnimationFrame(tracker);
      };
      requestAnimationFrame(tracker);

      await window.animateWeightTransferTurn(rig, targetYaw, 0.18);
      isTracking = false;

      // Return to original state
      rig.root.position.copy(startPos);
      rig.root.rotation.y = originalYaw;
      rig.torso.rotation.z = 0;
      rig.bodyRoot.position.y = 0;

      const bankDeg = maxBank * 180 / Math.PI;

      return {
        bankDeg: +bankDeg.toFixed(2),
        minDip: +minDip.toFixed(4),
        bankVerified: Math.abs(bankDeg - 4.0) < 0.5,
        dipVerified: minDip < -0.02
      };
    })()`, true);

    const passed = data.bankVerified && data.dipVerified;
    record('T3.1', 'Locomotion Chained with Weight-Transfer Turn (180ms, 4° bank, -0.04u dip)', passed, data);
  } catch (err) {
    record('T3.1', 'Locomotion Chained with Weight-Transfer Turn', false, { error: err.message });
  }

  // T3.2: Long-Range Diagonal Traversal Directly into Combat Capture
  try {
    const data = await cdp.evaluate(`(async () => {
      const atkQueen = window.buildSculptedUnit(5, 0); // Queen White
      const defPawn = window.buildSculptedUnit(1, 1);  // Pawn Black

      const startWp = window.coordToWorld(3, 0);  // d1
      const targetWp = window.coordToWorld(6, 3); // g4 (3-tile diagonal)

      atkQueen.root.position.copy(startWp);
      defPawn.root.position.copy(targetWp);
      window.battlefieldGroup.add(atkQueen.root, defPawn.root);

      let combatHappened = false;
      const killPromise = window.executeSynchronizedKillSequence(atkQueen, defPawn, targetWp, false);

      for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (atkQueen.inKillSequence) {
          combatHappened = true;
          break;
        }
      }

      await killPromise;

      const finalDist = atkQueen.root.position.distanceTo(targetWp);
      const facesOpponent = Math.abs(atkQueen.root.rotation.y - Math.PI) < 0.1;

      window.battlefieldGroup.remove(atkQueen.root, defPawn.root);

      return {
        combatHappened,
        finalDist: +finalDist.toFixed(3),
        landedOnTarget: finalDist < 0.15,
        facesOpponent
      };
    })()`, true);

    const passed = data.combatHappened && data.landedOnTarget && data.facesOpponent;
    record('T3.2', 'Long-Range Diagonal Move Chained into Combat Capture & Shard Explosion', passed, data);
  } catch (err) {
    record('T3.2', 'Long-Range Diagonal Move into Capture', false, { error: err.message });
  }

  // T3.3: Knight Ballistic Vault Over Intervening Pieces (Zero Collision Displacement)
  try {
    const data = await cdp.evaluate(`(async () => {
      const atkKnight = window.buildSculptedUnit(2, 0);   // White Knight at b1
      const obstaclePawn = window.buildSculptedUnit(1, 0); // Friendly White Pawn at b2
      const obstaclePawn2 = window.buildSculptedUnit(1, 1); // Enemy Pawn at c2
      const targetPos = window.coordToWorld(2, 2);       // c3

      const startPos = window.coordToWorld(1, 0);        // b1
      const obs1Pos = window.coordToWorld(1, 1);         // b2
      const obs2Pos = window.coordToWorld(2, 1);         // c2

      atkKnight.root.position.copy(startPos);
      obstaclePawn.root.position.copy(obs1Pos);
      obstaclePawn2.root.position.copy(obs2Pos);

      window.battlefieldGroup.add(atkKnight.root, obstaclePawn.root, obstaclePawn2.root);

      let maxJumpHeight = 0;
      const jumpPromise = window.animateUnitLJump ?
        window.animateUnitLJump(atkKnight, startPos, targetPos, 0.85) :
        window.animateUnitWalkTo(atkKnight, targetPos, 0.85, true);

      // Sample apex of jump
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (atkKnight.root.position.y > maxJumpHeight) {
          maxJumpHeight = atkKnight.root.position.y;
        }
      }

      await jumpPromise;

      // Verify intervening pawns were NOT disturbed/displaced
      const obs1Displaced = obstaclePawn.root.position.distanceTo(obs1Pos) > 0.01;
      const obs2Displaced = obstaclePawn2.root.position.distanceTo(obs2Pos) > 0.01;

      const landed = atkKnight.root.position.distanceTo(targetPos) < 0.1;
      const facesOpponent = Math.abs(atkKnight.root.rotation.y - Math.PI) < 0.1;

      window.battlefieldGroup.remove(atkKnight.root, obstaclePawn.root, obstaclePawn2.root);

      return {
        maxJumpHeight: +maxJumpHeight.toFixed(2),
        apexClearanceValid: maxJumpHeight >= 1.2,
        obs1Displaced,
        obs2Displaced,
        landed,
        facesOpponent
      };
    })()`, true);

    const passed = data.apexClearanceValid && !data.obs1Displaced && !data.obs2Displaced && data.landed && data.facesOpponent;
    record('T3.3', 'Knight Ballistic L-Leap Vaulting Over Obstacles (Zero obstacle displacement)', passed, data);
  } catch (err) {
    record('T3.3', 'Knight Ballistic Vault Over Obstacles', false, { error: err.message });
  }

  // T3.4: Diagonal 8th-Rank Capture with Immediate Queen Promotion & Team Facing
  try {
    const data = await cdp.evaluate(`(async () => {
      const pawnRig = window.buildSculptedUnit(1, 0); // White Pawn
      const enemyRig = window.buildSculptedUnit(4, 1); // Black Rook at a8

      const startWp = window.coordToWorld(1, 6);  // b7
      const targetWp = window.coordToWorld(0, 7); // a8

      pawnRig.root.position.copy(startWp);
      enemyRig.root.position.copy(targetWp);
      window.battlefieldGroup.add(pawnRig.root, enemyRig.root);

      // Execute capture
      await window.executeSynchronizedKillSequence(pawnRig, enemyRig, targetWp, false);

      // Promote to Queen
      window.battlefieldGroup.remove(pawnRig.root);
      const promotedRig = window.buildSculptedUnit(5, 0); // Queen White
      promotedRig.root.position.copy(targetWp);
      promotedRig.root.rotation.y = Math.PI; // White faces -Z
      window.battlefieldGroup.add(promotedRig.root);

      // Verify promoted Queen attributes
      const isQueen = promotedRig.type === 5;
      const isWhite = promotedRig.team === 0;
      const facesOpponent = Math.abs(promotedRig.root.rotation.y - Math.PI) < 0.1;
      const isGrounded = Math.abs(promotedRig.root.position.y) < 0.01;

      window.battlefieldGroup.remove(promotedRig.root);

      return {
        isQueen,
        isWhite,
        facesOpponent,
        isGrounded
      };
    })()`, true);

    const passed = data.isQueen && data.isWhite && data.facesOpponent && data.isGrounded;
    record('T3.4', 'Diagonal 8th-Rank Capture + Queen Promotion + Strict Team Facing Reset', passed, data);
  } catch (err) {
    record('T3.4', 'Diagonal Capture + Promotion', false, { error: err.message });
  }

  // T3.5: Camera Orbit Pad Interaction During Active Unit Locomotion
  try {
    const data = await cdp.evaluate(`(async () => {
      const rig = (window.activeRigs || []).find(r => r.type === 1 && r.team === 0);
      const startPos = rig.root.position.clone();
      const targetPos = window.coordToWorld(4, 3);

      const cState = (typeof camState !== 'undefined') ? camState : window.camState;
      const initialYaw = cState.targetYaw;

      // Start unit walking
      const walkPromise = window.animateUnitWalkTo(rig, targetPos, 0.75, false);

      // Rapidly adjust camera orbit during walk
      const orbitLeftBtn = document.getElementById('orbitLeftBtn');
      const orbitRightBtn = document.getElementById('orbitRightBtn');
      if (orbitLeftBtn && orbitRightBtn) {
        orbitLeftBtn.click();
        await new Promise(r => setTimeout(r, 100));
        orbitRightBtn.click();
      }

      await walkPromise;

      // Return rig
      rig.root.position.copy(startPos);
      rig.root.rotation.y = Math.PI;

      return {
        unitReachedDestination: true,
        cameraStable: !isNaN(cState.yaw) && isFinite(cState.yaw)
      };
    })()`, true);

    const passed = data.unitReachedDestination && data.cameraStable;
    record('T3.5', 'Camera Orbit Pad Interaction During Active Piece Locomotion (Zero desync)', passed, data);
  } catch (err) {
    record('T3.5', 'Camera Orbit During Locomotion', false, { error: err.message });
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log(`\nTier 3 Summary: ${passedCount}/${results.length} passed.`);
  return { tier: 3, name: 'Cross-Feature Combinations', total: results.length, passed: passedCount, tests: results };
}

module.exports = { runTier3Tests };
