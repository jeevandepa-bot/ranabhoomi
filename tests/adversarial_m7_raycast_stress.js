/**
 * tests/adversarial_m7_raycast_stress.js
 * 
 * Empirical Adversarial Challenger Test Harness for Milestone M7:
 * - Scene Graph & Render Optimization
 * 
 * Objectives:
 * 1. Validate raycast intersection across all 64 tiles under 8 diverse camera orientations:
 *    - Standard White View (0, 16.5, 17.5)
 *    - Black Dynasty View (0, 16.5, -17.5)
 *    - Top-Down Tactical View (0, 22.0, 0.05)
 *    - Low-Angle Grazing View (0, 5.5, 14.0)
 *    - East Flank View (16.0, 11.0, 0)
 *    - West Flank View (-16.0, 11.0, 0)
 *    - Northeast Diagonal (13.0, 14.0, 13.0)
 *    - Southwest Diagonal (-13.0, 14.0, -13.0)
 *    Ensure merged scenery meshes NEVER intercept or block square clicks.
 * 2. Verify matrixAutoUpdate === false on all 14 merged meshes and all 64 tiles.
 * 3. Verify tileMeshes.length === 64 with valid userData (f in 0..7, r in 0..7).
 * 4. Verify shadowMap configuration (autoUpdate === false, needsUpdate handling).
 */

const { CDPClient } = require('./cdp_client');
const fs = require('fs');
const path = require('path');

async function runAdversarialM7() {
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║        ADVERSARIAL CHALLENGER M7-1: SCENE GRAPH & RAYCAST STRESS       ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  const cdp = new CDPClient({ port: 9288 });
  const results = {
    timestamp: new Date().toISOString(),
    mergedMeshesCheck: null,
    tilesIntegrityCheck: null,
    shadowMapCheck: null,
    raycastStressCheck: null,
    allPassed: false
  };

  try {
    console.log('-> Launching isolated Chrome instance via CDP...');
    await cdp.launch();
    console.log('-> Connecting to http://localhost:8080/index.html...');
    await cdp.waitForEngineReady(25000);
    console.log('-> Game engine ready. Executing empirical stress tests.\n');

    // =========================================================================
    // 1. VERIFY 14 MERGED SCENERY MESHES & MATRIX LOCKING
    // =========================================================================
    console.log('--- TEST 1: 14 MERGED SCENERY MESHES & MATRIX LOCKING ---');
    const mergedData = await cdp.evaluate(`(() => {
      const mergedList = [];
      const expectedKeys = [
        'basaltDark', 'sandstoneWarm', 'ochreCliff', 'boulder',
        'midCanyon', 'courtyard', 'dais', 'stoneTrim',
        'ruinedStone', 'carvedRelief', 'ancientBronze',
        'ironHearth', 'glowingCharcoal', 'coreFlame'
      ];

      const bGroup = (typeof battlefieldGroup !== 'undefined') ? battlefieldGroup : window.battlefieldGroup;
      if (!bGroup) {
        return { error: 'battlefieldGroup not found' };
      }

      bGroup.traverse(child => {
        if (child.isMesh && (child.name.startsWith('merged_') || (child.userData && child.userData.isMergedStaticScenery))) {
          let testRayHit = false;
          try {
            const dummyRaycaster = new THREE.Raycaster();
            dummyRaycaster.ray.origin.set(0, 10, 0);
            dummyRaycaster.ray.direction.set(0, -1, 0);
            const dummyHits = [];
            child.raycast(dummyRaycaster, dummyHits);
            testRayHit = dummyHits.length > 0;
          } catch (e) {
            testRayHit = 'error: ' + e.message;
          }

          mergedList.push({
            name: child.name,
            materialKey: child.userData ? child.userData.materialKey : null,
            matrixAutoUpdate: child.matrixAutoUpdate,
            vertexCount: child.geometry ? child.geometry.attributes.position.count : 0,
            castShadow: child.castShadow,
            receiveShadow: child.receiveShadow,
            raycastNulled: (typeof child.raycast === 'function') && !testRayHit
          });
        }
      });

      const foundKeys = mergedList.map(m => m.materialKey || m.name.replace('merged_', ''));
      const missingKeys = expectedKeys.filter(k => !foundKeys.includes(k));

      return {
        count: mergedList.length,
        meshes: mergedList,
        missingKeys,
        allMatrixLocked: mergedList.every(m => m.matrixAutoUpdate === false),
        allRaycastNulled: mergedList.every(m => m.raycastNulled === true)
      };
    })()`);

    console.log(`Merged Meshes Found: ${mergedData.count} / 14`);
    console.log(`All matrixAutoUpdate === false: ${mergedData.allMatrixLocked}`);
    console.log(`All raycast nulled: ${mergedData.allRaycastNulled}`);
    if (mergedData.missingKeys && mergedData.missingKeys.length > 0) {
      console.log(`Missing Material Keys: ${mergedData.missingKeys.join(', ')}`);
    }

    results.mergedMeshesCheck = {
      passed: mergedData.count === 14 && mergedData.allMatrixLocked && mergedData.allRaycastNulled && mergedData.missingKeys.length === 0,
      details: mergedData
    };

    // =========================================================================
    // 2. VERIFY 64 TILES INTEGRITY & METADATA
    // =========================================================================
    console.log('\n--- TEST 2: 64 CHESSBOARD TILES INTEGRITY & USERDATA ---');
    const tilesData = await cdp.evaluate(`(() => {
      const tiles = (typeof tileMeshes !== 'undefined') ? tileMeshes : window.tileMeshes;
      if (!tiles) {
        return { error: 'tileMeshes not defined' };
      }

      const seenCoords = new Set();
      let allUserDataValid = true;
      let allMatrixLocked = true;
      let allPositionsValid = true;
      let duplicates = [];

      tiles.forEach((t, idx) => {
        if (!t || !t.userData || typeof t.userData.f !== 'number' || typeof t.userData.r !== 'number') {
          allUserDataValid = false;
          return;
        }
        const { f, r } = t.userData;
        if (f < 0 || f > 7 || r < 0 || r > 7) {
          allUserDataValid = false;
        }
        const key = f + ',' + r;
        if (seenCoords.has(key)) {
          duplicates.push(key);
        }
        seenCoords.add(key);

        if (t.matrixAutoUpdate !== false) {
          allMatrixLocked = false;
        }

        // Top surface should be y = 0.000 (position.y = -0.06 with height 0.12)
        if (Math.abs(t.position.y - (-0.06)) > 0.005) {
          allPositionsValid = false;
        }
      });

      return {
        tileCount: tiles.length,
        uniqueCoordsCount: seenCoords.size,
        allUserDataValid,
        allMatrixLocked,
        allPositionsValid,
        duplicates
      };
    })()`);

    console.log(`Tile Meshes Count: ${tilesData.tileCount} / 64`);
    console.log(`Unique Coordinates: ${tilesData.uniqueCoordsCount} / 64`);
    console.log(`All userData {f, r} valid: ${tilesData.allUserDataValid}`);
    console.log(`All tiles matrixAutoUpdate === false: ${tilesData.allMatrixLocked}`);
    console.log(`All tile elevations correct (top y=0.000): ${tilesData.allPositionsValid}`);

    results.tilesIntegrityCheck = {
      passed: tilesData.tileCount === 64 && tilesData.uniqueCoordsCount === 64 && tilesData.allUserDataValid && tilesData.allMatrixLocked && tilesData.allPositionsValid,
      details: tilesData
    };

    // =========================================================================
    // 3. SHADOW MAP AUTO-UPDATE VERIFICATION
    // =========================================================================
    console.log('\n--- TEST 3: SELECTIVE SHADOW MAP FREEZING ---');
    const shadowData = await cdp.evaluate(`(() => {
      const r = (typeof renderer !== 'undefined') ? renderer : window.renderer;
      if (!r) return { error: 'renderer not found' };
      return {
        enabled: r.shadowMap.enabled,
        autoUpdate: r.shadowMap.autoUpdate,
        hasRequestHelper: typeof window.requestShadowUpdate === 'function' || typeof requestShadowUpdate === 'function'
      };
    })()`);

    console.log(`ShadowMap Enabled: ${shadowData.enabled}`);
    console.log(`ShadowMap autoUpdate === false: ${shadowData.autoUpdate === false}`);
    console.log(`requestShadowUpdate available: ${shadowData.hasRequestHelper}`);

    results.shadowMapCheck = {
      passed: shadowData.enabled === true && shadowData.autoUpdate === false && shadowData.hasRequestHelper === true,
      details: shadowData
    };

    // =========================================================================
    // 4. ADVERSARIAL RAYCAST INTERSECTION ACROSS 8 CAMERA ORIENTATIONS (512 RAYS)
    // =========================================================================
    console.log('\n--- TEST 4: ADVERSARIAL RAYCAST INTERSECTION (64 TILES x 8 CAMERA ANGLES) ---');

    const cameraOrientations = [
      { name: 'Standard White', pos: [0, 16.5, 17.5], target: [0, 0, 0] },
      { name: 'Black Side', pos: [0, 16.5, -17.5], target: [0, 0, 0] },
      { name: 'Tactical Top-Down', pos: [0, 24.0, 0.05], target: [0, 0, 0] },
      { name: 'Low Grazing Front', pos: [0, 5.5, 14.0], target: [0, 0, 0] },
      { name: 'East Flank (90 deg)', pos: [16.0, 11.0, 0], target: [0, 0, 0] },
      { name: 'West Flank (-90 deg)', pos: [-16.0, 11.0, 0], target: [0, 0, 0] },
      { name: 'Northeast Diagonal', pos: [13.0, 14.0, 13.0], target: [0, 0, 0] },
      { name: 'Southwest Diagonal', pos: [-13.0, 14.0, -13.0], target: [0, 0, 0] }
    ];

    const raycastReport = [];
    let totalRaycasts = 0;
    let successfulClicks = 0;
    let sceneryBlockCount = 0;

    for (const cam of cameraOrientations) {
      process.stdout.write(`Testing orientation [${cam.name}]... `);

      const orientationResult = await cdp.evaluate(`((camConfig) => {
        const cam = (typeof camera !== 'undefined') ? camera : window.camera;
        const tiles = (typeof tileMeshes !== 'undefined') ? tileMeshes : window.tileMeshes;
        const bGroup = (typeof battlefieldGroup !== 'undefined') ? battlefieldGroup : window.battlefieldGroup;
        const coordFn = (typeof coordToWorld !== 'undefined') ? coordToWorld : window.coordToWorld;
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        // Position camera
        cam.position.set(camConfig.pos[0], camConfig.pos[1], camConfig.pos[2]);
        cam.lookAt(camConfig.target[0], camConfig.target[1], camConfig.target[2]);
        cam.updateMatrixWorld(true);

        const tileResults = [];
        let orientationPassed = true;
        let blockedByScenery = 0;

        for (let idx = 0; idx < tiles.length; idx++) {
          const tile = tiles[idx];
          const { f, r } = tile.userData;

          // Compute world position on top surface of tile
          const wp = coordFn(f, r);
          const tileSurfacePoint = new THREE.Vector3(wp.x, 0.000, wp.z);

          // Project to NDC
          const ndc = tileSurfacePoint.clone().project(cam);

          // Set ray from camera
          mouse.set(ndc.x, ndc.y);
          raycaster.setFromCamera(mouse, cam);

          // 1. Direct tileMeshes intersection (Game's actual selection pipeline)
          const tileHits = raycaster.intersectObjects(tiles, false);
          const directTileHit = (tileHits.length > 0 && tileHits[0].object.userData.f === f && tileHits[0].object.userData.r === r);

          // 2. Global battlefieldGroup recursive intersection (Adversarial occlusion test)
          // Scenery meshes must NOT intercept the ray because their raycast is nulled!
          const allHits = raycaster.intersectObjects(bGroup.children, true);
          let interceptedByMergedScenery = false;
          let interceptingObjectName = null;

          for (const hit of allHits) {
            if (hit.object === tile) {
              // Reached tile cleanly
              break;
            }
            if (hit.object.userData && hit.object.userData.isMergedStaticScenery) {
              interceptedByMergedScenery = true;
              interceptingObjectName = hit.object.name;
              break;
            }
          }

          if (interceptedByMergedScenery) {
            blockedByScenery++;
            orientationPassed = false;
          }

          if (!directTileHit) {
            orientationPassed = false;
          }

          tileResults.push({
            f,
            r,
            directTileHit,
            interceptedByMergedScenery,
            interceptingObjectName
          });
        }

        return {
          camName: camConfig.name,
          tileCount: tileResults.length,
          orientationPassed,
          blockedByScenery,
          failures: tileResults.filter(t => !t.directTileHit || t.interceptedByMergedScenery)
        };
      })(${JSON.stringify(cam)})`);

      totalRaycasts += orientationResult.tileCount;
      sceneryBlockCount += orientationResult.blockedByScenery;
      if (orientationResult.orientationPassed) {
        successfulClicks += orientationResult.tileCount;
        console.log(`PASS (64/64 tiles hit cleanly, 0 scenery blocks)`);
      } else {
        console.log(`FAIL (${orientationResult.failures.length} issues)`);
        console.log(JSON.stringify(orientationResult.failures, null, 2));
      }
      raycastReport.push(orientationResult);
    }

    // Reset camera to default before finishing
    await cdp.evaluate(`(() => {
      const resetFn = (typeof resetCamera !== 'undefined') ? resetCamera : window.resetCamera;
      const cam = (typeof camera !== 'undefined') ? camera : window.camera;
      if (typeof resetFn === 'function') {
        resetFn();
      } else if (cam) {
        cam.position.set(0, 16.5, 17.5);
        cam.lookAt(0, 0, 0);
        cam.updateMatrixWorld(true);
      }
    })()`);

    console.log(`\nRaycast Stress Summary:`);
    console.log(`Total Raycasts Executed: ${totalRaycasts} (8 cameras x 64 tiles)`);
    console.log(`Successful Tile Identifications: ${successfulClicks} / ${totalRaycasts}`);
    console.log(`Scenery Occlusions / Interceptions: ${sceneryBlockCount}`);

    results.raycastStressCheck = {
      passed: successfulClicks === totalRaycasts && sceneryBlockCount === 0,
      totalRaycasts,
      successfulClicks,
      sceneryBlockCount,
      report: raycastReport
    };

    results.allPassed = (
      results.mergedMeshesCheck.passed &&
      results.tilesIntegrityCheck.passed &&
      results.shadowMapCheck.passed &&
      results.raycastStressCheck.passed
    );

    console.log('\n========================================================================');
    console.log(`ADVERSARIAL VERDICT: ${results.allPassed ? 'APPROVE' : 'REQUEST_CHANGES'}`);
    console.log('========================================================================\n');

    // Save report to tests/adversarial_m7_report.json
    fs.writeFileSync(
      path.join(__dirname, 'adversarial_m7_report.json'),
      JSON.stringify(results, null, 2),
      'utf8'
    );
    console.log('Report saved to tests/adversarial_m7_report.json');

  } catch (err) {
    console.error('Fatal error during adversarial verification:', err);
    results.error = err.message;
  } finally {
    await cdp.close();
  }

  return results;
}

if (require.main === module) {
  runAdversarialM7().then(res => {
    process.exit(res && res.allPassed ? 0 : 1);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runAdversarialM7 };
