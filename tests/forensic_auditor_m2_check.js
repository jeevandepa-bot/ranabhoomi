/**
 * tests/forensic_auditor_m2_check.js
 * 
 * Independent Forensic Audit Verification Script for Milestone 2.
 * Validates:
 * 1. Knight GLB model scale, position (0, 0, 0), and 0-height ground contact.
 * 2. Complete absence of procedural cylinder/cone rider geometry and duplicate Dhanush bows.
 * 3. Genuine 4-leg biomechanical 2-beat diagonal trot kinematics via rig.quadLegs.
 * 4. Spine vertical bob, neck flexion, and tail sway.
 * 5. Clean rest stance reset on walk finish.
 * 6. Hardcoded test bypass or facade detection across all 4 Knights.
 */

const { CDPClient } = require('./cdp_client');

async function runForensicAudit() {
  console.log('========================================================================');
  console.log('   FORENSIC AUDITOR INDEPENDENT VERIFICATION: MILESTONE 2 ASHVAROHI     ');
  console.log('========================================================================\n');

  const cdp = new CDPClient({ port: 9289 });
  const auditReport = {
    timestamp: new Date().toISOString(),
    checks: [],
    violations: [],
    clean: true
  };

  function recordCheck(name, passed, evidence) {
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${name}`);
    console.log(`       Evidence: ${JSON.stringify(evidence, null, 2)}\n`);
    auditReport.checks.push({ name, passed, evidence });
    if (!passed) {
      auditReport.violations.push({ name, evidence });
      auditReport.clean = false;
    }
  }

  try {
    await cdp.launch();
    await cdp.waitForEngineReady(25000);

    // -------------------------------------------------------------------------
    // CHECK 1: Knight GLB Binding, Position (0, 0, 0), Scale (1.0), and Grounding
    // -------------------------------------------------------------------------
    const check1 = await cdp.evaluate(`(() => {
      const knights = (window.activeRigs || []).filter(r => r.type === 2);
      if (knights.length !== 4) return { error: 'Expected 4 active knights, found ' + knights.length };

      const details = knights.map(k => {
        const rootPos = k.root.position.clone();
        const torsoPos = k.torso.position.clone();
        const bodyRootPos = k.bodyRoot.position.clone();

        // Find the cloned GLB model inside k.torso
        let glbModel = null;
        k.torso.children.forEach(c => {
          if (c.isObject3D && c !== k.bodyRoot && c.type === 'Group' || c.type === 'Object3D') {
            if (c.name.includes('Scene') || c.getObjectByName('Horse_Body')) {
              glbModel = c;
            }
          }
        });

        const glbScale = glbModel ? { x: glbModel.scale.x, y: glbModel.scale.y, z: glbModel.scale.z } : null;
        const glbPos = glbModel ? { x: glbModel.position.x, y: glbModel.position.y, z: glbModel.position.z } : null;

        // Compute lowest world Y of all meshes in the knight rig
        let minY = Infinity;
        let lowestMeshName = '';
        k.root.traverse(c => {
          if (c.isMesh && c.geometry) {
            const b = new THREE.Box3().setFromObject(c);
            if (b.min.y < minY) {
              minY = b.min.y;
              lowestMeshName = c.name;
            }
          }
        });

        return {
          team: k.team === 0 ? 'White' : 'Black',
          rootPos: { x: +rootPos.x.toFixed(4), y: +rootPos.y.toFixed(4), z: +rootPos.z.toFixed(4) },
          torsoPosY: +torsoPos.y.toFixed(4),
          bodyRootPosY: +bodyRootPos.y.toFixed(4),
          glbScale,
          glbPos,
          lowestMeshName,
          lowestWorldY: +minY.toFixed(4),
          groundContactPass: Math.abs(minY) < 0.005,
          positionZeroPass: glbPos && Math.abs(glbPos.x) < 1e-4 && Math.abs(glbPos.y) < 1e-4 && Math.abs(glbPos.z) < 1e-4,
          scaleImperialPass: glbScale && Math.abs(glbScale.x - 1.0) < 1e-4
        };
      });

      return {
        knightsFound: knights.length,
        allGroundContactPass: details.every(d => d.groundContactPass),
        allPositionZeroPass: details.every(d => d.positionZeroPass),
        allScaleImperialPass: details.every(d => d.scaleImperialPass),
        details
      };
    })()`);

    recordCheck(
      'Check 1: Knight GLB model.position.set(0, 0, 0), scale 1.0, and 0-height ground contact (y=0.000m)',
      check1.allGroundContactPass && check1.allPositionZeroPass && check1.allScaleImperialPass,
      check1
    );

    // -------------------------------------------------------------------------
    // CHECK 2: Elimination of Procedural Cylinder/Cone Rider & Duplicate Equipment
    // -------------------------------------------------------------------------
    const check2 = await cdp.evaluate(`(() => {
      const knights = (window.activeRigs || []).filter(r => r.type === 2);
      const findings = [];

      knights.forEach((k, idx) => {
        const meshNames = [];
        let proceduralArmFound = false;
        let proceduralBootFound = false;
        let proceduralBowFound = false;
        let proceduralQuiverFound = false;

        let organicRiderFound = false;
        let lanceFound = false;
        let lyreEarsFound = false;

        k.root.traverse(c => {
          if (c.name) meshNames.push(c.name);
          const lower = (c.name || '').toLowerCase();

          // Check for forbidden procedural cylinder/cone rider meshes
          if (c.isMesh && c.geometry && c.geometry.type === 'CylinderGeometry') {
            if (lower.includes('arm') || lower.includes('boot') || lower.includes('torso')) {
              proceduralArmFound = true;
            }
          }

          if (lower.includes('dhanush') || lower.includes('bow_curve')) proceduralBowFound = true;
          if (lower.includes('tarkash') || lower.includes('quiver')) proceduralQuiverFound = true;

          // Check for authentic organic GLB components
          if (lower.includes('rider') || lower.includes('pagri') || lower.includes('mukuta')) {
            if (c.visible !== false) organicRiderFound = true;
          }
          if (lower.includes('lance') && c.visible !== false) lanceFound = true;
          if (lower.includes('lyreear') && c.visible !== false) lyreEarsFound = true;
        });

        findings.push({
          knightIndex: idx,
          team: k.team === 0 ? 'White' : 'Black',
          totalMeshes: meshNames.length,
          proceduralArmFound,
          proceduralBootFound,
          proceduralBowFound,
          proceduralQuiverFound,
          organicRiderFound,
          lanceFound,
          lyreEarsFound
        });
      });

      return {
        allProceduralEliminated: findings.every(f => !f.proceduralArmFound && !f.proceduralBootFound && !f.proceduralBowFound && !f.proceduralQuiverFound),
        allOrganicAssetsPresent: findings.every(f => f.organicRiderFound && f.lanceFound && f.lyreEarsFound),
        findings
      };
    })()`);

    recordCheck(
      'Check 2: Complete elimination of procedural cylinder/cone rider geometry and duplicate Dhanush bows',
      check2.allProceduralEliminated && check2.allOrganicAssetsPresent,
      check2
    );

    // -------------------------------------------------------------------------
    // CHECK 3: rig.quadLegs 4 Anatomical Limb Pivots & Trot Kinematics
    // -------------------------------------------------------------------------
    const check3 = await cdp.evaluate(`(() => {
      const knights = (window.activeRigs || []).filter(r => r.type === 2);
      const rigInspection = knights.map((k, idx) => {
        const hasQuadLegs = Array.isArray(k.quadLegs) && k.quadLegs.length === 4;
        const legNames = hasQuadLegs ? k.quadLegs.map(l => l.name) : [];
        const hasTail = !!k.tail;
        const hasNeck = !!k.neck;
        const hasWeaponTip = !!k.weaponTip;

        // Verify pivot coordinates at neutral rest
        const pivotPositions = hasQuadLegs ? k.quadLegs.map(l => ({
          name: l.name,
          px: +l.position.x.toFixed(3),
          py: +l.position.y.toFixed(3),
          pz: +l.position.z.toFixed(3)
        })) : [];

        // Test trot kinematics calculation
        // Simulate step: animPhase = Math.PI / 2 (sin(phi) = 1.0, cos(phi) = 0.0)
        // Expected: FL swings forward (+0.52), FR swings back (-0.52), BL swings back (-0.48), BR swings forward (+0.48)
        k.walkWeight = 1.0;
        k.animPhase = Math.PI / 2;
        updateUnitRigAnimation(k, 0.0, 0.0);

        const trotAngles = hasQuadLegs ? k.quadLegs.map(l => +l.rotation.x.toFixed(4)) : [];
        const spineBobY = +k.torso.position.y.toFixed(4);
        const torsoRollZ = +k.torso.rotation.z.toFixed(4);
        const tailYaw = k.tail ? +k.tail.rotation.y.toFixed(4) : null;
        const neckPitch = k.neck ? +k.neck.rotation.x.toFixed(4) : null;

        const diagonalPairAPass = (trotAngles[0] > 0.45 && trotAngles[3] > 0.40); // FL & BR forward
        const diagonalPairBPass = (trotAngles[1] < -0.45 && trotAngles[2] < -0.40); // FR & BL backward
        const spineBobPass = (spineBobY > 0.030 && spineBobY < 0.045);

        // Reset to rest
        k.walkWeight = 0.0;
        updateUnitRigAnimation(k, 0.0, 0.0);
        const restAngles = hasQuadLegs ? k.quadLegs.map(l => +l.rotation.x.toFixed(4)) : [];
        const restSpineY = +k.torso.position.y.toFixed(4);
        const restPass = restAngles.every(a => Math.abs(a) < 1e-4) && Math.abs(restSpineY) < 1e-4;

        return {
          knightIndex: idx,
          team: k.team === 0 ? 'White' : 'Black',
          hasQuadLegs,
          legNames,
          pivotPositions,
          hasTail,
          hasNeck,
          hasWeaponTip,
          trotAngles,
          spineBobY,
          torsoRollZ,
          tailYaw,
          neckPitch,
          diagonalPairAPass,
          diagonalPairBPass,
          spineBobPass,
          restPass
        };
      });

      return {
        allPivotsValid: rigInspection.every(r => r.hasQuadLegs && r.hasTail && r.hasNeck && r.hasWeaponTip),
        allTrotDiagonalPairsPass: rigInspection.every(r => r.diagonalPairAPass && r.diagonalPairBPass),
        allSpineBobPass: rigInspection.every(r => r.spineBobPass),
        allRestResetPass: rigInspection.every(r => r.restPass),
        rigInspection
      };
    })()`);

    recordCheck(
      'Check 3: rig.quadLegs 4-pivot 2-beat diagonal trot kinematics, spine vertical bob, and rest reset',
      check3.allPivotsValid && check3.allTrotDiagonalPairsPass && check3.allSpineBobPass && check3.allRestResetPass,
      check3
    );

    // -------------------------------------------------------------------------
    // CHECK 4: Zero Floor Clipping During Full 360-Degree Gait Cycle
    // -------------------------------------------------------------------------
    const check4 = await cdp.evaluate(`(() => {
      const knight = (window.activeRigs || []).find(r => r.type === 2 && r.team === 0);
      if (!knight) return { error: 'No white knight found' };

      const samples = [];
      let minHoofYAcrossCycle = Infinity;

      // Sample 32 points across a full 2*PI trot cycle
      for (let s = 0; s < 32; s++) {
        const phi = (s / 32) * Math.PI * 2;
        knight.walkWeight = 1.0;
        knight.walkTime = phi;
        updateUnitRigAnimation(knight, 0.016, 0.5);

        // Compute lowest world Y of the knight
        let currentMinY = Infinity;
        knight.root.traverse(c => {
          if (c.isMesh && c.geometry) {
            const b = new THREE.Box3().setFromObject(c);
            if (b.min.y < currentMinY) {
              currentMinY = b.min.y;
            }
          }
        });

        if (currentMinY < minHoofYAcrossCycle) {
          minHoofYAcrossCycle = currentMinY;
        }

        samples.push({
          step: s,
          phi: +phi.toFixed(3),
          minWorldY: +currentMinY.toFixed(4)
        });
      }

      // Reset rig to rest
      knight.walkWeight = 0.0;
      updateUnitRigAnimation(knight, 0.016, 0.0);

      // Floor clipping is defined as penetrating beneath y = -0.005m
      const zeroFloorClipping = minHoofYAcrossCycle >= -0.005;

      return {
        samplesCount: samples.length,
        minHoofYAcrossCycle: +minHoofYAcrossCycle.toFixed(4),
        zeroFloorClipping,
        sampleRange: [samples[0], samples[8], samples[16], samples[24]]
      };
    })()`);

    recordCheck(
      'Check 4: Continuous non-clipping ground contact across full trot cycle (hoof Y >= 0.000m)',
      check4.zeroFloorClipping,
      check4
    );

    // -------------------------------------------------------------------------
    // CHECK 5: Facade / Hardcoded Bypass Detection in index.html & Test Files
    // -------------------------------------------------------------------------
    const check5 = await cdp.evaluate(`(() => {
      const bypassSignatures = [];
      // Inspect global functions to verify they are authentic functions with executable bodies
      const fnNames = [
        'buildPuranicKnight',
        'updateUnitRigAnimation',
        'animateUnitWalkTo',
        'animateUnitLJump',
        'executeSynchronizedKillSequence'
      ];

      fnNames.forEach(fn => {
        if (typeof window[fn] === 'function') {
          const src = window[fn].toString();
          if (src.includes('return true') && src.length < 50) {
            bypassSignatures.push({ fn, issue: 'Dummy return true stub' });
          }
          if (src.includes('__test_mock__')) {
            bypassSignatures.push({ fn, issue: 'Test mock flag detected' });
          }
        }
      });

      return {
        functionsAudited: fnNames.length,
        bypassDetected: bypassSignatures.length > 0,
        bypassSignatures
      };
    })()`);

    recordCheck(
      'Check 5: No facade stubs or hardcoded mock bypasses in locomotion/combat functions',
      !check5.bypassDetected,
      check5
    );

    const consoleErrors = cdp.getErrors();
    recordCheck(
      'Check 6: Zero browser console exceptions during runtime inspection',
      consoleErrors.length === 0,
      { consoleErrorCount: consoleErrors.length, consoleErrors }
    );

  } finally {
    await cdp.close();
  }

  console.log('========================================================================');
  console.log(`FORENSIC AUDIT RESULT: ${auditReport.clean ? 'CLEAN (PASS)' : 'INTEGRITY VIOLATION (FAIL)'}`);
  console.log('========================================================================\n');

  process.exit(auditReport.clean ? 0 : 1);
}

runForensicAudit().catch(err => {
  console.error('Forensic Audit Runner Fatal Exception:', err);
  process.exit(1);
});
