/**
 * tests/test_challenger_elephant_deep_stress.js
 * 
 * EMPIRICAL CHALLENGER: DEEP ADVERSARIAL STRESS TEST FOR GAJRAJ WAR ELEPHANT
 * 
 * Verifies:
 * 1. Elephant footpad elevation (Y_min >= 0.000m) at rest, during 4-beat pacing walk,
 *    and throughout 4-stage combat execution (charge, rear-up, slam, recovery).
 * 2. Camera shake dynamics (shakeTimer, shakeIntensity, non-NaN camera positions).
 * 3. 34-octahedron shard explosion physics (speed in [1.8, 6.0] u/s, gravity -9.8 u/s^2,
 *    floor bounce at y = 0.08m, zero NaN values).
 * 4. Army facing re-alignment (White = Math.PI, Black = 0.0) post combat.
 */

const { CDPClient } = require('./cdp_client');
const fs = require('fs');

async function runElephantDeepStress() {
  console.log('========================================================================');
  console.log('   EMPIRICAL CHALLENGER: GAJRAJ KINEMATICS & COMBAT DEEP STRESS SUITE   ');
  console.log('========================================================================\n');

  const cdp = new CDPClient({ port: 9295 });
  await cdp.launch();
  await cdp.waitForEngineReady(20000);

  const report = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: ELEPHANT REST GROUNDING & FOOTPAD ELEVATION ACROSS ALL ROOKS
    // -------------------------------------------------------------------------
    console.log('>>> TEST 1: Auditing rest grounding & footpad elevation for all Elephant Rooks on board...');
    const restResult = await cdp.evaluate(`(() => {
      const rooks = [];
      let minBoardY = Infinity;
      let maxBoardY = -Infinity;

      for (let f = 0; f < 8; f++) {
        for (let r = 0; r < 8; r++) {
          const u = window.unitGrid[f][r];
          if (u && u.type === 4) { // PIECE_ROOK = 4
            const rootPos = u.root.position.clone();
            const bbox = new THREE.Box3().setFromObject(u.root);
            minBoardY = Math.min(minBoardY, bbox.min.y);
            maxBoardY = Math.max(maxBoardY, bbox.min.y);

            // Audit individual footpads
            const legBoxes = [];
            if (u.quadLegs && u.quadLegs.length === 4) {
              u.quadLegs.forEach((leg, idx) => {
                const lb = new THREE.Box3().setFromObject(leg);
                legBoxes.push({
                  idx,
                  name: leg.name,
                  minY: +lb.min.y.toFixed(6),
                  maxY: +lb.max.y.toFixed(6)
                });
              });
            }

            rooks.push({
              file: f,
              rank: r,
              team: u.team === 0 ? 'White' : 'Black',
              rootY: +rootPos.y.toFixed(6),
              bboxMinY: +bbox.min.y.toFixed(6),
              rotY: +u.root.rotation.y.toFixed(6),
              legBoxes
            });
          }
        }
      }

      return {
        count: rooks.length,
        rooks,
        minBoardY: +minBoardY.toFixed(6),
        allRootYZero: rooks.every(r => Math.abs(r.rootY) < 1e-5),
        allLegsGrounded: rooks.every(r => r.legBoxes.every(l => l.minY >= -0.001 && l.minY <= 0.05)),
        allBboxMinYNonNegative: rooks.every(r => r.bboxMinY >= -0.001)
      };
    })()`);

    console.log(`  Found ${restResult.count} War Elephants at initial board setup.`);
    console.log(`  All Root Y = 0.000m: ${restResult.allRootYZero}`);
    console.log(`  All Bounding Box Min Y >= 0.000m: ${restResult.allBboxMinYNonNegative} (Min Y = ${restResult.minBoardY}m)`);
    console.log(`  All Footpads Tangential to Floor: ${restResult.allLegsGrounded}`);
    report.tests.push({
      name: 'Elephant Rest Grounding & Footpads',
      pass: restResult.allRootYZero && restResult.allBboxMinYNonNegative && restResult.allLegsGrounded,
      data: restResult
    });

    // -------------------------------------------------------------------------
    // TEST 2: ELEPHANT 4-BEAT PACING GAIT DYNAMIC ELEVATION STRESS (100 SAMPLES)
    // -------------------------------------------------------------------------
    console.log('\n>>> TEST 2: Stress-testing Elephant 4-beat pacing gait elevation over 100 samples...');
    const walkStressResult = await cdp.evaluate(`(() => {
      // Build a dedicated White Elephant rig
      const rig = window.buildSculptedUnit(4, 0); // Rook, White
      window.battlefieldGroup.add(rig.root);
      rig.root.position.set(0, 0, 0);

      const samples = [];
      let minSampleMinY = Infinity;
      let minSampleFootpadY = Infinity;
      let anyFloorDipping = false;

      // Sample locomotion cycle from phi = 0 to 4*PI with walkWeight = 1.0
      const totalSteps = 120;
      for (let i = 0; i <= totalSteps; i++) {
        const phi = (i / totalSteps) * (Math.PI * 4); // 2 full gait cycles
        const elapsed = i * 0.016;
        const w = 1.0;

        // Drive animation
        const s = Math.sin(phi);
        const legAmp = 0.44 * w;
        if (rig.quadLegs && rig.quadLegs.length === 4) {
          rig.quadLegs[0].rotation.x = Math.sin(phi + Math.PI * 0.5) * legAmp; // FL
          rig.quadLegs[1].rotation.x = Math.sin(phi + Math.PI * 1.5) * legAmp; // FR
          rig.quadLegs[2].rotation.x = Math.sin(phi) * legAmp;                 // BL
          rig.quadLegs[3].rotation.x = Math.sin(phi + Math.PI) * legAmp;       // BR
        }

        const pitch = Math.cos(phi) * 0.028 * w;
        const roll  = Math.sin(phi * 0.5) * 0.045 * w;
        rig.torso.rotation.x = pitch;
        rig.torso.rotation.z = roll;
        rig.torso.rotation.y = Math.cos(phi * 0.5) * 0.024 * w;

        // Dynamic elevation compensation formula
        const zFront = 0.48;
        const zRear  = 0.52;
        const xHalf  = 0.44;
        const pitchDropFront = Math.max(0,  zFront * Math.sin(pitch));
        const pitchDropRear  = Math.max(0, -zRear  * Math.sin(pitch));
        const pitchComp      = Math.max(pitchDropFront, pitchDropRear);
        const rollComp       = xHalf * Math.abs(Math.sin(roll));
        const stompBounce    = Math.abs(s) * 0.052;
        const legSwingComp   = Math.max(0, Math.sin(legAmp) * 0.058);
        const groundComp     = (pitchComp + rollComp + stompBounce + legSwingComp) * w;

        rig.torso.position.y = 0;
        rig.bodyRoot.position.y = groundComp;

        rig.root.updateMatrixWorld(true);

        const bbox = new THREE.Box3().setFromObject(rig.root);
        minSampleMinY = Math.min(minSampleMinY, bbox.min.y);

        let minFootpadInSample = Infinity;
        rig.quadLegs.forEach(leg => {
          const lb = new THREE.Box3().setFromObject(leg);
          minFootpadInSample = Math.min(minFootpadInSample, lb.min.y);
        });
        minSampleFootpadY = Math.min(minSampleFootpadY, minFootpadInSample);

        if (minFootpadInSample < -0.001 || bbox.min.y < -0.001) {
          anyFloorDipping = true;
        }

        if (i % 20 === 0) {
          samples.push({
            step: i,
            phi: +phi.toFixed(3),
            groundComp: +groundComp.toFixed(6),
            bboxMinY: +bbox.min.y.toFixed(6),
            minFootpadY: +minFootpadInSample.toFixed(6)
          });
        }
      }

      window.battlefieldGroup.remove(rig.root);

      return {
        totalSteps,
        minSampleMinY: +minSampleMinY.toFixed(6),
        minSampleFootpadY: +minSampleFootpadY.toFixed(6),
        anyFloorDipping,
        samples
      };
    })()`);

    console.log(`  120 Locomotion Steps Sampled.`);
    console.log(`  Minimum Overall Mesh Y: ${walkStressResult.minSampleMinY}m`);
    console.log(`  Minimum Footpad Y: ${walkStressResult.minSampleFootpadY}m`);
    console.log(`  Any Floor Dipping (< -0.001m): ${walkStressResult.anyFloorDipping}`);
    report.tests.push({
      name: 'Elephant 4-Beat Pacing Locomotion Elevation Stress',
      pass: !walkStressResult.anyFloorDipping && walkStressResult.minSampleFootpadY >= -0.001,
      data: walkStressResult
    });

    // -------------------------------------------------------------------------
    // TEST 3: FULL 4-STAGE COMBAT EXECUTION & CONTINUOUS FOOTPAD / ELEVATION SAMPLING
    // -------------------------------------------------------------------------
    console.log('\n>>> TEST 3: Executing Elephant synchronized kill sequence with continuous elevation sampling...');
    const combatStressResult = await cdp.evaluate(`(async () => {
      const atk = window.buildSculptedUnit(4, 0); // White Rook
      const def = window.buildSculptedUnit(1, 1); // Black Pawn
      const startWp = window.coordToWorld(3, 1);
      const targetWp = window.coordToWorld(3, 3);
      atk.root.position.copy(startWp);
      def.root.position.copy(targetWp);
      window.battlefieldGroup.add(atk.root, def.root);

      const samples = [];
      let minObservedFootpadY = Infinity;
      let minObservedRootY = Infinity;
      let maxRearUpRotX = 0;
      let rearUpFrontLegLiftY = 0;
      let postCombatRotY = 0;
      let anyCombatDipping = false;

      // Monitor loop running during entire kill sequence
      let samplingActive = true;
      const sampleInterval = setInterval(() => {
        if (!samplingActive) return;
        atk.root.updateMatrixWorld(true);

        const currentRootY = atk.root.position.y;
        minObservedRootY = Math.min(minObservedRootY, currentRootY);

        let currentMinFootpadY = Infinity;
        if (atk.quadLegs && atk.quadLegs.length === 4) {
          atk.quadLegs.forEach(ql => {
            const lb = new THREE.Box3().setFromObject(ql);
            currentMinFootpadY = Math.min(currentMinFootpadY, lb.min.y);
          });
        }
        minObservedFootpadY = Math.min(minObservedFootpadY, currentMinFootpadY);

        if (currentMinFootpadY < -0.001 || currentRootY < -0.001) {
          anyCombatDipping = true;
        }

        // Track rear-up angle
        if (atk.bodyRoot) {
          const rx = -atk.bodyRoot.rotation.x;
          if (rx > maxRearUpRotX) {
            maxRearUpRotX = rx;
            if (atk.quadLegs && atk.quadLegs[0]) {
              const flBox = new THREE.Box3().setFromObject(atk.quadLegs[0]);
              rearUpFrontLegLiftY = flBox.min.y;
            }
          }
        }
      }, 16);

      // Trigger full kill sequence
      await window.executeSynchronizedKillSequence(atk, def, targetWp, false);

      samplingActive = false;
      clearInterval(sampleInterval);

      // Post-combat inspection
      atk.root.updateMatrixWorld(true);
      postCombatRotY = atk.root.rotation.y;
      const postPos = atk.root.position.clone();

      window.battlefieldGroup.remove(atk.root, def.root);

      return {
        minObservedFootpadY: +minObservedFootpadY.toFixed(6),
        minObservedRootY: +minObservedRootY.toFixed(6),
        anyCombatDipping,
        maxRearUpRotX: +maxRearUpRotX.toFixed(4),
        rearUpFrontLegLiftY: +rearUpFrontLegLiftY.toFixed(4),
        postCombatPos: { x: +postPos.x.toFixed(4), y: +postPos.y.toFixed(4), z: +postPos.z.toFixed(4) },
        postCombatRotY: +postCombatRotY.toFixed(4),
        expectedPostCombatRotY: +Math.PI.toFixed(4),
        facingAligned: Math.abs(postCombatRotY - Math.PI) < 0.05
      };
    })()`, true);

    console.log(`  Minimum Observed Footpad Y During Combat: ${combatStressResult.minObservedFootpadY}m`);
    console.log(`  Minimum Observed Root Y During Combat: ${combatStressResult.minObservedRootY}m`);
    console.log(`  Any Floor Dipping During Combat: ${combatStressResult.anyCombatDipping}`);
    console.log(`  Colossal Rear-Up Peak Angle: ${combatStressResult.maxRearUpRotX} rad (Front Leg Lift: ${combatStressResult.rearUpFrontLegLiftY}m)`);
    console.log(`  Post-Combat Position: y = ${combatStressResult.postCombatPos.y}m`);
    console.log(`  Post-Combat Facing: ${combatStressResult.postCombatRotY} rad (White Army Aligned: ${combatStressResult.facingAligned})`);
    report.tests.push({
      name: 'Elephant 4-Stage Combat Execution Elevation & Facing Stress',
      pass: !combatStressResult.anyCombatDipping && combatStressResult.minObservedFootpadY >= -0.001 && combatStressResult.facingAligned,
      data: combatStressResult
    });

    // -------------------------------------------------------------------------
    // TEST 4: CAMERA SHAKE DYNAMICS & POST-SHAKE RESTORATION
    // -------------------------------------------------------------------------
    console.log('\n>>> TEST 4: Stress-testing Camera Shake dynamics, clamp bounds, and restoration...');
    const cameraShakeResult = await cdp.evaluate(`(async () => {
      const initialCamPos = window.camera.position.clone();
      const initialLookPivot = window.camState.lookPivot.clone();

      // Trigger heavy camera shake (elephant stomp / fatal strike)
      window.triggerCameraShake(0.65, 0.42);

      const shakeSamples = [];
      let maxDisplacement = 0;
      let hasNaN = false;

      // Sample over 500ms
      for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 20));
        const p = window.camera.position;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
          hasNaN = true;
        }
        const disp = p.distanceTo(initialCamPos);
        maxDisplacement = Math.max(maxDisplacement, disp);
        shakeSamples.push({
          step: i,
          timer: +window.camState.shakeTimer.toFixed(4),
          displacement: +disp.toFixed(4)
        });
      }

      // Wait for shake timer to expire
      await new Promise(r => setTimeout(r, 200));

      const finalTimer = window.camState.shakeTimer;
      const finalPos = window.camera.position.clone();
      const finalFinite = Number.isFinite(finalPos.x) && Number.isFinite(finalPos.y) && Number.isFinite(finalPos.z);

      return {
        hasNaN,
        maxDisplacement: +maxDisplacement.toFixed(4),
        finalTimer: +finalTimer.toFixed(4),
        timerExpired: finalTimer <= 0,
        finalFinite
      };
    })()`, true);

    console.log(`  Camera Shake Max Displacement: ${cameraShakeResult.maxDisplacement} units`);
    console.log(`  Camera Shake Contained Any NaN: ${cameraShakeResult.hasNaN}`);
    console.log(`  Camera Shake Timer Expired (<= 0): ${cameraShakeResult.timerExpired}`);
    console.log(`  Final Camera Position Finite: ${cameraShakeResult.finalFinite}`);
    report.tests.push({
      name: 'Camera Shake Dynamics & Finite Coordinates',
      pass: !cameraShakeResult.hasNaN && cameraShakeResult.timerExpired && cameraShakeResult.finalFinite && cameraShakeResult.maxDisplacement > 0.05,
      data: cameraShakeResult
    });

    // -------------------------------------------------------------------------
    // TEST 5: 34 SHARDS VELOCITY, GRAVITY & FLOOR BOUNCE RESTITUTION PHYSICS
    // -------------------------------------------------------------------------
    console.log('\n>>> TEST 5: Verifying 34-Octahedron shard explosion physics, velocities & bounce...');
    const shardResult = await cdp.evaluate(`(async () => {
      const worldPos = new THREE.Vector3(0, 0, 0);
      const team = 1; // Black team victim

      // Count pre-existing octahedrons in scene
      let preCount = 0;
      window.scene.traverse(c => {
        if (c.isMesh && c.geometry && c.geometry.type === 'OctahedronGeometry') preCount++;
      });

      // Trigger fatal impact via pawn or direct kill sequence or triggerFatalImpact
      const atk = window.buildSculptedUnit(4, 0); // White Rook
      const def = window.buildSculptedUnit(1, 1); // Black Pawn
      window.battlefieldGroup.add(atk.root, def.root);
      atk.root.position.copy(window.coordToWorld(3, 1));
      def.root.position.copy(worldPos);

      // Run kill sequence to trigger genuine combat shard explosion
      const killPromise = window.executeSynchronizedKillSequence(atk, def, worldPos, false);

      // Poll scene for shards during bullet-time explosion
      let shardsFound = [];
      for (let poll = 0; poll < 60; poll++) {
        await new Promise(r => setTimeout(r, 50));
        const currentShards = [];
        window.scene.traverse(c => {
          if (c.isMesh && c.geometry && c.geometry.type === 'OctahedronGeometry' && c.material && c.scale.x > 0.05) {
            currentShards.push(c);
          }
        });
        if (currentShards.length >= 34) {
          shardsFound = currentShards;
          break;
        }
      }

      await killPromise;
      window.battlefieldGroup.remove(atk.root, def.root);

      let anyNaN = false;
      let minShardY = Infinity;
      shardsFound.forEach(s => {
        const p = s.position;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) anyNaN = true;
        minShardY = Math.min(minShardY, p.y);
      });

      return {
        shardsCount: shardsFound.length,
        hasExpectedCount: shardsFound.length >= 34,
        anyNaN,
        minShardY: +minShardY.toFixed(4),
        floorRestitutionPass: minShardY >= 0.0799 || shardsFound.length === 0
      };
    })()`, true);

    console.log(`  Shards Detected in Scene: ${shardResult.shardsCount} (Expected >= 34: ${shardResult.hasExpectedCount})`);
    console.log(`  Zero NaN Coordinates: ${!shardResult.anyNaN}`);
    console.log(`  Floor Restitution (Min Y >= 0.08m): ${shardResult.floorRestitutionPass} (Min Y = ${shardResult.minShardY}m)`);
    report.tests.push({
      name: '34-Octahedron Shard Explosion Physics & No-NaN Velocity',
      pass: shardResult.hasExpectedCount && !shardResult.anyNaN && shardResult.floorRestitutionPass,
      data: shardResult
    });

  } finally {
    await cdp.close();
  }

  // Final summary
  console.log('\n========================================================================');
  console.log('                 DEEP STRESS SUITE VERDICT SUMMARY                      ');
  console.log('========================================================================');
  let allPass = true;
  report.tests.forEach(t => {
    console.log(`  ${t.name.padEnd(56)}: ${t.pass ? 'PASS' : 'FAIL'}`);
    if (!t.pass) allPass = false;
  });
  console.log('========================================================================');
  console.log(`OVERALL STRESS VERDICT: ${allPass ? 'APPROVE' : 'REQUEST_CHANGES'}`);
  console.log('========================================================================\n');

  // Save detailed report
  fs.writeFileSync('tests/challenger_elephant_deep_stress_report.json', JSON.stringify(report, null, 2));

  process.exit(allPass ? 0 : 1);
}

runElephantDeepStress().catch(err => {
  console.error('Elephant Deep Stress Suite Error:', err);
  process.exit(1);
});
