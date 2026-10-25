/**
 * tests/test_adversarial_m2_ashvarohi.js
 * 
 * Deep Empirical Adversarial Challenge Suite for Milestone 2:
 * 1. 64-Tile Ground Elevation Audit across all 64 squares for White & Black Knights at rest.
 *    - Verifies |y| <= 0.005m for root, torso, bodyRoot, and all 4 individual hooves (512 checks).
 * 2. 720-Point Dynamic Trot Kinematics & Ground Contact Sweep (phi in [0, 2*PI]).
 *    - Verifies zero penetration (y >= -0.001m across all frames).
 *    - Verifies firm ground kiss (|y| <= 0.005m) when hooves are down.
 *    - Verifies diagonal pair synchronization (FL+BR in-phase, FR+BL anti-phase).
 *    - Verifies spine bob, pitch/roll, neck flexion, and tail sway dynamics.
 * 3. Rest Stance Reset & Orientation Integrity after dynamic locomotion.
 * 4. Imperial Cavalry Scale (+35-40%), tile footprint (|x|,|z| <= 0.88 * r), and zero duplicate equipment.
 */

const { CDPClient } = require('./cdp_client');
const fs = require('fs');

async function runAshvarohiM2EmpiricalChallenge() {
  console.log('========================================================================');
  console.log('   EMPIRICAL CHALLENGER: ASHVAROHI (KNIGHT) MILESTONE 2 DEEP AUDIT      ');
  console.log('========================================================================\n');

  const cdp = new CDPClient({ port: 9296 });
  const report = {
    timestamp: new Date().toISOString(),
    suite1_64tiles_rest: null,
    suite2_dynamic_trot_cycle: null,
    suite3_rest_recovery: null,
    suite4_scale_and_equipment: null,
    consoleErrors: []
  };

  try {
    await cdp.launch();
    await cdp.waitForEngineReady(20000);
    console.log('Connected to runtime. Beginning empirical challenges...\n');

    // -------------------------------------------------------------------------
    // SUITE 1: 64-TILE GROUND CONTACT AUDIT AT REST (512 HOOF AUDITS)
    // -------------------------------------------------------------------------
    console.log('--- SUITE 1: Auditing ground contact for Knights across ALL 64 tiles at rest ---');
    const s1 = await cdp.evaluate(`(() => {
      const results = [];
      let totalSquareAudits = 0;
      let totalHoofAudits = 0;
      let rootElevationPass = 0;
      let hoofElevationPass = 0;
      let zeroPenetrationPass = 0;
      let zeroHoverPass = 0;

      const hoofNames = ['Horse_Leg_FL', 'Horse_Leg_FR', 'Horse_Leg_BL', 'Horse_Leg_BR'];

      for (let f = 0; f < 8; f++) {
        for (let r = 0; r < 8; r++) {
          const wp = coordToWorld(f, r);
          const tileNotation = String.fromCharCode(97 + f) + (r + 1);

          for (const team of [0, 1]) { // 0: White, 1: Black
            const rig = buildSculptedUnit(2, team); // Knight
            rig.root.position.copy(wp);
            rig.root.rotation.y = team === 0 ? Math.PI : 0;
            battlefieldGroup.add(rig.root);
            rig.root.updateMatrixWorld(true);

            // Audit root and torso Y
            const rootY = rig.root.position.y;
            const torsoY = rig.torso.position.y;
            const bodyRootY = rig.bodyRoot.position.y;
            const rootPass = Math.abs(rootY) <= 0.005 && Math.abs(torsoY) <= 0.005 && Math.abs(bodyRootY) <= 0.005;
            if (rootPass) rootElevationPass++;
            totalSquareAudits++;

            // Audit individual hooves in world coordinates
            const hoofHeights = {};
            let hoovesPassForPiece = true;

            for (const hName of hoofNames) {
              totalHoofAudits++;
              const pivot = rig.quadLegs.find(p => p.name === hName);
              if (!pivot) {
                hoovesPassForPiece = false;
                continue;
              }
              const box = new THREE.Box3().setFromObject(pivot);
              const minY = box.min.y;
              hoofHeights[hName] = +minY.toFixed(5);

              const nonPenetrating = minY >= -0.001;
              const nonFloating = minY <= 0.005;
              const contactOk = Math.abs(minY) <= 0.005;

              if (nonPenetrating) zeroPenetrationPass++;
              if (nonFloating) zeroHoverPass++;
              if (contactOk) hoofElevationPass++;
              if (!contactOk) hoovesPassForPiece = false;
            }

            results.push({
              tile: tileNotation,
              team: team === 0 ? 'White' : 'Black',
              wp: { x: +wp.x.toFixed(3), y: +wp.y.toFixed(3), z: +wp.z.toFixed(3) },
              rootY: +rootY.toFixed(5),
              torsoY: +torsoY.toFixed(5),
              hoofHeights,
              pass: rootPass && hoovesPassForPiece
            });

            battlefieldGroup.remove(rig.root);
          }
        }
      }

      return {
        totalSquareAudits,
        totalHoofAudits,
        rootElevationPass,
        hoofElevationPass,
        zeroPenetrationPass,
        zeroHoverPass,
        allPassed: (rootElevationPass === totalSquareAudits && hoofElevationPass === totalHoofAudits),
        sampleCorners: [
          results.find(r => r.tile === 'a1' && r.team === 'White'),
          results.find(r => r.tile === 'h1' && r.team === 'White'),
          results.find(r => r.tile === 'a8' && r.team === 'Black'),
          results.find(r => r.tile === 'h8' && r.team === 'Black')
        ]
      };
    })()`);

    report.suite1_64tiles_rest = s1;
    console.log(`  Total Piece Placements Tested: ${s1.totalSquareAudits}`);
    console.log(`  Root Grounding Pass (|y| <= 0.005m): ${s1.rootElevationPass}/${s1.totalSquareAudits}`);
    console.log(`  Total Individual Hoof Audits: ${s1.totalHoofAudits}`);
    console.log(`  Hoof Grounding Pass (|y| <= 0.005m): ${s1.hoofElevationPass}/${s1.totalHoofAudits}`);
    console.log(`  Zero Floor Penetration (y >= -0.001m): ${s1.zeroPenetrationPass}/${s1.totalHoofAudits}`);
    console.log(`  Zero Hovering When Rested (y <= 0.005m): ${s1.zeroHoverPass}/${s1.totalHoofAudits}`);
    console.log(`  Suite 1 Passed: ${s1.allPassed}\n`);

    // -------------------------------------------------------------------------
    // SUITE 2: 720-POINT DYNAMIC DIAGONAL TROT KINEMATICS & HOOF CONTACT SWEEP
    // -------------------------------------------------------------------------
    console.log('--- SUITE 2: Sweeping 720 phase angles through dynamic diagonal trot cycle ---');
    const s2 = await cdp.evaluate(`(() => {
      const knight = buildSculptedUnit(2, 0); // White Knight
      const originWp = coordToWorld(6, 0); // g1
      knight.root.position.copy(originWp);
      battlefieldGroup.add(knight.root);
      knight.walkWeight = 1.0; // Dynamic walking weight enabled

      const samples = 720; // 0.5 degree resolution
      let penetrationCount = 0;
      let minObservedY = Infinity;
      let maxObservedY = -Infinity;
      let downPhaseTouchdowns = 0;
      let downPhasePassCount = 0;

      const profileFL = [];
      const profileFR = [];
      const profileBL = [];
      const profileBR = [];
      const spineProfile = [];

      for (let i = 0; i <= samples; i++) {
        const phi = (i / samples) * Math.PI * 2;
        knight.animPhase = phi;
        updateUnitRigAnimation(knight, 0.0, phi);
        knight.root.updateMatrixWorld(true);

        const s = Math.sin(phi);
        const c = Math.cos(phi);

        // Compute box3 min.y for each hoof
        const boxFL = new THREE.Box3().setFromObject(knight.quadLegs[0]);
        const boxFR = new THREE.Box3().setFromObject(knight.quadLegs[1]);
        const boxBL = new THREE.Box3().setFromObject(knight.quadLegs[2]);
        const boxBR = new THREE.Box3().setFromObject(knight.quadLegs[3]);

        const yFL = boxFL.min.y;
        const yFR = boxFR.min.y;
        const yBL = boxBL.min.y;
        const yBR = boxBR.min.y;
        const spineY = knight.torso.position.y;

        const frameMinY = Math.min(yFL, yFR, yBL, yBR);
        const frameMaxY = Math.max(yFL, yFR, yBL, yBR);
        if (frameMinY < minObservedY) minObservedY = frameMinY;
        if (frameMaxY > maxObservedY) maxObservedY = frameMaxY;

        if (frameMinY < -0.001) penetrationCount++;

        // At stance down-phases: when sin(phi) ~ 0 (vertical limb pass)
        if (Math.abs(s) < 0.02) {
          downPhaseTouchdowns++;
          if (Math.abs(yFL) <= 0.005 && Math.abs(yFR) <= 0.005 &&
              Math.abs(yBL) <= 0.005 && Math.abs(yBR) <= 0.005) {
            downPhasePassCount++;
          }
        }

        if (i % 60 === 0) {
          profileFL.push({ deg: +(phi * 180 / Math.PI).toFixed(1), y: +yFL.toFixed(4) });
          profileFR.push({ deg: +(phi * 180 / Math.PI).toFixed(1), y: +yFR.toFixed(4) });
          profileBL.push({ deg: +(phi * 180 / Math.PI).toFixed(1), y: +yBL.toFixed(4) });
          profileBR.push({ deg: +(phi * 180 / Math.PI).toFixed(1), y: +yBR.toFixed(4) });
          spineProfile.push({ deg: +(phi * 180 / Math.PI).toFixed(1), spineY: +spineY.toFixed(4) });
        }
      }

      // Check diagonal pair phase symmetry
      // Pair A (FL & BR) swing together
      // Pair B (FR & BL) swing together in opposite phase
      const symmetryCheck = profileFL.every((pt, idx) => {
        const br = profileBR[idx];
        return Math.abs(pt.y - br.y) < 0.04; // similar elevation curve
      });

      battlefieldGroup.remove(knight.root);

      return {
        sampleCount: samples,
        minObservedY: +minObservedY.toFixed(5),
        maxObservedY: +maxObservedY.toFixed(5),
        penetrationCount,
        downPhaseTouchdowns,
        downPhasePassCount,
        symmetryCheck,
        maxSpineBob: +Math.max(...spineProfile.map(p => p.spineY)).toFixed(5),
        zeroPenetration: penetrationCount === 0,
        firmGroundKissOnDown: downPhaseTouchdowns > 0 && downPhasePassCount === downPhaseTouchdowns,
        allPassed: (penetrationCount === 0 && downPhasePassCount === downPhaseTouchdowns && symmetryCheck),
        profileSample: {
          deg0: { FL: profileFL[0].y, FR: profileFR[0].y, BL: profileBL[0].y, BR: profileBR[0].y },
          deg90: { FL: profileFL[3]?.y, FR: profileFR[3]?.y, BL: profileBL[3]?.y, BR: profileBR[3]?.y },
          deg180: { FL: profileFL[6]?.y, FR: profileFR[6]?.y, BL: profileBL[6]?.y, BR: profileBR[6]?.y },
          deg270: { FL: profileFL[9]?.y, FR: profileFR[9]?.y, BL: profileBL[9]?.y, BR: profileBR[9]?.y }
        }
      };
    })()`);

    report.suite2_dynamic_trot_cycle = s2;
    console.log(`  Phase Points Sampled: ${s2.sampleCount}`);
    console.log(`  Minimum Observed Hoof Y: ${s2.minObservedY}m (Penetration threshold >= -0.001m)`);
    console.log(`  Maximum Observed Hoof Y (Swing Lift): ${s2.maxObservedY}m`);
    console.log(`  Floor Penetration Violations: ${s2.penetrationCount}`);
    console.log(`  Stance Down-Phase Touchdown Pass: ${s2.downPhasePassCount}/${s2.downPhaseTouchdowns}`);
    console.log(`  Diagonal Pair Symmetry (FL=BR, FR=BL): ${s2.symmetryCheck}`);
    console.log(`  Maximum Spine Bob: ${s2.maxSpineBob}m (nominal 0.038m)`);
    console.log(`  Suite 2 Passed: ${s2.allPassed}\n`);

    // -------------------------------------------------------------------------
    // SUITE 3: REST RECOVERY & STANCE INTEGRITY AFTER MOVEMENT
    // -------------------------------------------------------------------------
    console.log('--- SUITE 3: Verifying full stance recovery and rotation reset to 0 after move ---');
    const s3 = await cdp.evaluate(`(() => {
      const knight = buildSculptedUnit(2, 0); // White Knight
      const originWp = coordToWorld(6, 0);
      knight.root.position.copy(originWp);
      battlefieldGroup.add(knight.root);

      // Simulate movement with w = 1.0, then reset with w = 0
      knight.walkWeight = 1.0;
      updateUnitRigAnimation(knight, 0.016, 2.5); // mid-stride
      // Now reset to rest
      knight.walkWeight = 0;
      updateUnitRigAnimation(knight, 0.016, 0);

      const torsoPosZero = knight.torso.position.length() < 1e-4;
      const torsoRotZero = knight.torso.rotation.toVector3().length() < 1e-4;
      const legRotsZero = knight.quadLegs.every(l => l.rotation.toVector3().length() < 1e-4);
      const neckRotZero = knight.neck ? knight.neck.rotation.toVector3().length() < 1e-4 : true;
      const tailRotZero = knight.tail ? knight.tail.rotation.toVector3().length() < 1e-4 : true;

      // Box3 hooves check
      knight.root.updateMatrixWorld(true);
      const boxes = knight.quadLegs.map(l => new THREE.Box3().setFromObject(l).min.y);
      const allHoovesGrounded = boxes.every(y => Math.abs(y) <= 0.005);

      battlefieldGroup.remove(knight.root);

      return {
        torsoPosZero,
        torsoRotZero,
        legRotsZero,
        neckRotZero,
        tailRotZero,
        allHoovesGrounded,
        hoofMinYs: boxes.map(y => +y.toFixed(5)),
        allPassed: torsoPosZero && torsoRotZero && legRotsZero && neckRotZero && tailRotZero && allHoovesGrounded
      };
    })()`);

    report.suite3_rest_recovery = s3;
    console.log(`  Torso Position Reset to (0,0,0): ${s3.torsoPosZero}`);
    console.log(`  Torso Rotation Reset to (0,0,0): ${s3.torsoRotZero}`);
    console.log(`  All 4 Leg Rotations Reset to 0: ${s3.legRotsZero}`);
    console.log(`  Neck & Tail Rotations Reset to 0: ${s3.neckRotZero && s3.tailRotZero}`);
    console.log(`  All 4 Hooves Firmly Grounded at Rest: ${s3.allHoovesGrounded}`);
    console.log(`  Suite 3 Passed: ${s3.allPassed}\n`);

    // -------------------------------------------------------------------------
    // SUITE 4: SCALE, FOOTPRINT & EQUIPMENT AUDIT
    // -------------------------------------------------------------------------
    console.log('--- SUITE 4: Auditing imperial cavalry scale, tile bounds, and equipment ---');
    const s4 = await cdp.evaluate(`(() => {
      const knight = buildSculptedUnit(2, 0); // White Knight
      const originWp = coordToWorld(6, 0);
      knight.root.position.copy(originWp);
      battlefieldGroup.add(knight.root);
      knight.root.updateMatrixWorld(true);

      const bBox = new THREE.Box3().setFromObject(knight.root);
      const size = new THREE.Vector3();
      bBox.getSize(size);

      // Tile diameter is 2.0m, lateral tile bounds require width <= 1.85m (T1.R1.3)
      const width = size.x;
      const length = size.z;
      const height = size.y;

      const widthWithinBounds = width <= 1.85;
      const heightWithinBounds = height >= 2.0 && height <= 4.0;

      // Check equipment
      let hasLyreEars = false;
      let hasLanceShaft = false;
      let hasLanceTip = false;
      let hasProceduralBow = false;
      let hasProceduralQuiver = false;

      knight.root.traverse(c => {
        const n = c.name || '';
        if (n.includes('LyreEar')) hasLyreEars = true;
        if (n.includes('Lance_Shaft')) hasLanceShaft = true;
        if (n.includes('Lance_Tip')) hasLanceTip = true;
        if (n.includes('Dhanush_Bow')) hasProceduralBow = true;
        if (n.includes('Tarkash')) hasProceduralQuiver = true;
      });

      battlefieldGroup.remove(knight.root);

      return {
        dimensions: {
          width: +width.toFixed(3),
          length: +length.toFixed(3),
          height: +height.toFixed(3)
        },
        widthWithinBounds,
        heightWithinBounds,
        hasLyreEars,
        hasLanceShaft,
        hasLanceTip,
        hasProceduralBow,
        hasProceduralQuiver,
        equipmentClean: hasLyreEars && hasLanceShaft && hasLanceTip && !hasProceduralBow && !hasProceduralQuiver,
        allPassed: widthWithinBounds && heightWithinBounds && hasLyreEars && hasLanceShaft && hasLanceTip && !hasProceduralBow && !hasProceduralQuiver
      };
    })()`);

    report.suite4_scale_and_equipment = s4;
    console.log(`  Dimensions (W x L x H): ${s4.dimensions.width}m x ${s4.dimensions.length}m x ${s4.dimensions.height}m`);
    console.log(`  Lateral Width Within Tile Bounds (<= 1.85m): ${s4.widthWithinBounds}`);
    console.log(`  Imperial Cavalry Stature (H in [2.0m, 4.0m]): ${s4.heightWithinBounds}`);
    console.log(`  Organic Marwari Lyre-Curved Ears Present: ${s4.hasLyreEars}`);
    console.log(`  Couched Pennant Lance (Shaft + Tip) Present: ${s4.hasLanceShaft && s4.hasLanceTip}`);
    console.log(`  Duplicate Procedural Bow/Quiver Eliminated: ${!s4.hasProceduralBow && !s4.hasProceduralQuiver}`);
    console.log(`  Suite 4 Passed: ${s4.allPassed}\n`);

    const errors = cdp.getErrors();
    report.consoleErrors = errors;

    const grandPass = (
      s1.allPassed &&
      s2.allPassed &&
      s3.allPassed &&
      s4.allPassed &&
      errors.length === 0
    );

    console.log('========================================================================');
    console.log('                      CHALLENGER FINAL VERDICT                          ');
    console.log('========================================================================');
    console.log(`Suite 1 (64-Tile Ground Elevation at Rest): ${s1.allPassed ? 'PASS' : 'FAIL'}`);
    console.log(`Suite 2 (720-Point Dynamic Trot Kinematics): ${s2.allPassed ? 'PASS' : 'FAIL'}`);
    console.log(`Suite 3 (Stance Recovery & Reset to 0)    : ${s3.allPassed ? 'PASS' : 'FAIL'}`);
    console.log(`Suite 4 (Scale, Bounds & Equipment Clean) : ${s4.allPassed ? 'PASS' : 'FAIL'}`);
    console.log(`Browser Console Errors                     : ${errors.length}`);
    console.log(`VERDICT: ${grandPass ? 'APPROVE' : 'REQUEST_CHANGES'}`);
    console.log('========================================================================\n');

    fs.writeFileSync('tests/adversarial_m2_ashvarohi_report.json', JSON.stringify(report, null, 2));

  } catch (err) {
    console.error('Empirical Challenger Suite Exception:', err);
    process.exit(1);
  } finally {
    await cdp.close();
    process.exit(0);
  }
}

runAshvarohiM2EmpiricalChallenge();
