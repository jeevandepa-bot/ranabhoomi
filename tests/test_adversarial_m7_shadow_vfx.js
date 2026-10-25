/**
 * tests/test_adversarial_m7_shadow_vfx.js
 * 
 * Adversarial Verification Test Suite for Milestone M7:
 * 1. Selective Shadow Map Freezing & Caching:
 *    - Idle state: assert renderer.shadowMap.needsUpdate === false at render time
 *    - Piece movement: assert renderer.shadowMap.needsUpdate === true during movement
 *    - Combat sequence: assert renderer.shadowMap.needsUpdate === true during combat
 *    - Post-motion rest: assert shadowUpdateCountdown === 0 and needsUpdate === false
 * 2. VFX GPU Memory Leak & Disposal:
 *    - Verify geometry.dispose() and material.dispose() called on expiration
 *    - Verify multi-material array disposal
 *    - Verify vfxGroup.children and activeVFX clean removal without leakage
 *    - 100-object mass concurrency stress test
 */

const { CDPClient } = require('./cdp_client');
const fs = require('fs');
const path = require('path');

async function runAdversarialM7Tests() {
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║        ADVERSARIAL STRESS TEST: SHADOW MAP FREEZING & VFX DISPOSAL     ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  const cdp = new CDPClient({ port: 9287 });
  const results = {
    timestamp: new Date().toISOString(),
    tests: [],
    passed: 0,
    failed: 0,
    errors: []
  };

  function assert(condition, description, details = {}) {
    if (condition) {
      console.log(`  [PASS] ${description}`);
      results.passed++;
      results.tests.push({ description, status: 'PASS', details });
    } else {
      console.error(`  [FAIL] ${description}`);
      console.error('         Details:', JSON.stringify(details));
      results.failed++;
      results.tests.push({ description, status: 'FAIL', details });
    }
  }

  try {
    console.log('-> Launching isolated headless Chrome instance...');
    await cdp.launch();
    console.log('-> Connecting to game runtime at http://localhost:8080/index.html...');
    await cdp.waitForEngineReady(20000);
    console.log('-> Game engine ready with 32 active rigs.\n');

    // Instrument renderer.render to capture shadowMap.needsUpdate at the exact moment of each render call
    await cdp.evaluate(`
      (() => {
        window.__origRendererRender = renderer.render.bind(renderer);
        window.__renderTrace = [];
        window.__traceRenderActive = false;
        
        renderer.render = function(scene, camera) {
          if (window.__traceRenderActive) {
            window.__renderTrace.push({
              shadowNeedsUpdate: renderer.shadowMap.needsUpdate,
              countdown: shadowUpdateCountdown,
              isBusy: isBusyAnimating,
              vfxCount: activeVFX.length,
              timestamp: performance.now()
            });
          }
          return window.__origRendererRender(scene, camera);
        };
        
        window.__startRenderTrace = function() {
          window.__renderTrace = [];
          window.__traceRenderActive = true;
        };
        
        window.__stopRenderTrace = function() {
          window.__traceRenderActive = false;
          return window.__renderTrace;
        };
        
        // Use local2p mode for deterministic turn control without AI background moves
        gameMode = 'local2p';
        window.gameMode = 'local2p';
      })()
    `);

    // -------------------------------------------------------------------------
    // TEST 1: Baseline Idle State Shadow Map Verification
    // -------------------------------------------------------------------------
    console.log('========================================================================');
    console.log('TEST 1: Baseline Idle State Shadow Map Verification');
    console.log('========================================================================');

    // Wait for initial scene startup countdown (8-10 frames) to settle
    await cdp.evaluateAsync(`
      new Promise(resolve => {
        const check = () => {
          if (shadowUpdateCountdown === 0 && !isBusyAnimating && activeVFX.length === 0) {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      })
    `);

    const idleTelemetry = await cdp.evaluateAsync(`
      new Promise(resolve => {
        window.__startRenderTrace();
        setTimeout(() => {
          const trace = window.__stopRenderTrace();
          resolve({
            frameCount: trace.length,
            autoUpdate: renderer.shadowMap.autoUpdate,
            allCountdownZero: trace.every(t => t.countdown === 0),
            allNeedsUpdateFalse: trace.every(t => t.shadowNeedsUpdate === false),
            maxCountdown: Math.max(...trace.map(t => t.countdown)),
            anyNeedsUpdateTrue: trace.some(t => t.shadowNeedsUpdate === true)
          });
        }, 500);
      })
    `);

    assert(idleTelemetry.autoUpdate === false,
      'renderer.shadowMap.autoUpdate is strictly false in idle state',
      { autoUpdate: idleTelemetry.autoUpdate });

    assert(idleTelemetry.allCountdownZero === true,
      `shadowUpdateCountdown remains exactly 0 across ${idleTelemetry.frameCount} consecutive idle render calls`,
      { allCountdownZero: idleTelemetry.allCountdownZero, maxCountdown: idleTelemetry.maxCountdown });

    assert(idleTelemetry.allNeedsUpdateFalse === true,
      `renderer.shadowMap.needsUpdate is strictly false during 100% of ${idleTelemetry.frameCount} idle render calls`,
      { allNeedsUpdateFalse: idleTelemetry.allNeedsUpdateFalse, anyNeedsUpdateTrue: idleTelemetry.anyNeedsUpdateTrue });

    // -------------------------------------------------------------------------
    // TEST 2: Piece Movement Shadow Invalidation Verification
    // -------------------------------------------------------------------------
    console.log('\n========================================================================');
    console.log('TEST 2: Piece Movement Shadow Invalidation Verification');
    console.log('========================================================================');

    const moveResult = await cdp.evaluateAsync(`
      new Promise(async (resolve) => {
        window.__startRenderTrace();
        
        const move = { fromF: 4, fromR: 1, toF: 4, toR: 3, isCapture: false };
        const movePromise = performChessMove(move);
        
        const immediateState = {
          countdown: shadowUpdateCountdown,
          needsUpdate: renderer.shadowMap.needsUpdate,
          isBusy: isBusyAnimating
        };
        
        await movePromise;
        const trace = window.__stopRenderTrace();
        
        resolve({
          immediateState,
          traceSamples: trace.length,
          rendersWithShadowNeedsUpdateTrue: trace.filter(t => t.shadowNeedsUpdate === true).length,
          rendersWithCountdownPositive: trace.filter(t => t.countdown > 0).length,
          rendersWithBusyTrue: trace.filter(t => t.isBusy === true).length
        });
      })
    `);

    assert(moveResult.immediateState.isBusy === true,
      'isBusyAnimating is set to true immediately upon initiating piece move',
      moveResult.immediateState);

    assert(moveResult.immediateState.countdown > 0,
      'shadowUpdateCountdown > 0 immediately upon initiating piece move',
      { countdown: moveResult.immediateState.countdown });

    assert(moveResult.immediateState.needsUpdate === true,
      'renderer.shadowMap.needsUpdate === true immediately upon initiating piece move',
      { needsUpdate: moveResult.immediateState.needsUpdate });

    assert(moveResult.rendersWithShadowNeedsUpdateTrue > 10,
      `renderer.shadowMap.needsUpdate was true on ${moveResult.rendersWithShadowNeedsUpdateTrue} render passes during locomotion`,
      {
        totalRenders: moveResult.traceSamples,
        rendersWithShadowNeedsUpdateTrue: moveResult.rendersWithShadowNeedsUpdateTrue
      });

    // Wait until countdown reaches 0 and rigs are at rest
    await cdp.evaluateAsync(`
      new Promise(resolve => {
        const check = () => {
          if (shadowUpdateCountdown === 0 && !isBusyAnimating && activeVFX.length === 0) {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      })
    `);

    const postMoveIdle = await cdp.evaluateAsync(`
      new Promise(resolve => {
        window.__startRenderTrace();
        setTimeout(() => {
          const trace = window.__stopRenderTrace();
          resolve({
            frameCount: trace.length,
            isBusy: isBusyAnimating,
            allCountdownZero: trace.every(t => t.countdown === 0),
            allNeedsUpdateFalse: trace.every(t => t.shadowNeedsUpdate === false)
          });
        }, 300);
      })
    `);

    assert(postMoveIdle.isBusy === false,
      'isBusyAnimating resets to false after piece locomotion completes',
      postMoveIdle);

    assert(postMoveIdle.allCountdownZero === true,
      'shadowUpdateCountdown returns to 0 after post-move countdown frames settle',
      { allCountdownZero: postMoveIdle.allCountdownZero });

    assert(postMoveIdle.allNeedsUpdateFalse === true,
      'renderer.shadowMap.needsUpdate returns to false across all post-move render passes',
      { allNeedsUpdateFalse: postMoveIdle.allNeedsUpdateFalse });

    // -------------------------------------------------------------------------
    // TEST 3: Combat Sequence Shadow Invalidation Verification
    // -------------------------------------------------------------------------
    console.log('\n========================================================================');
    console.log('TEST 3: Combat Sequence Shadow Invalidation Verification');
    console.log('========================================================================');

    const combatResult = await cdp.evaluateAsync(`
      new Promise(async (resolve) => {
        const attackerRig = unitGrid[4][3];
        const defenderRig = unitGrid[4][6];
        const targetWorldPos = coordToWorld(4, 6);
        
        window.__startRenderTrace();
        
        const killPromise = executeSynchronizedKillSequence(attackerRig, defenderRig, targetWorldPos, true);
        
        const immediateState = {
          countdown: shadowUpdateCountdown,
          needsUpdate: renderer.shadowMap.needsUpdate,
          attackerInKill: attackerRig.inKillSequence,
          defenderInKill: defenderRig.inKillSequence
        };
        
        await killPromise;
        const trace = window.__stopRenderTrace();
        
        resolve({
          immediateState,
          traceSamples: trace.length,
          rendersWithShadowNeedsUpdateTrue: trace.filter(t => t.shadowNeedsUpdate === true).length,
          rendersWithCountdownPositive: trace.filter(t => t.countdown > 0).length
        });
      })
    `);

    assert(combatResult.immediateState.attackerInKill === true && combatResult.immediateState.defenderInKill === true,
      'Units have inKillSequence = true upon combat trigger',
      combatResult.immediateState);

    assert(combatResult.immediateState.countdown > 0,
      'shadowUpdateCountdown > 0 upon combat trigger',
      { countdown: combatResult.immediateState.countdown });

    assert(combatResult.immediateState.needsUpdate === true,
      'renderer.shadowMap.needsUpdate === true upon combat trigger',
      { needsUpdate: combatResult.immediateState.needsUpdate });

    assert(combatResult.rendersWithShadowNeedsUpdateTrue > 25,
      `renderer.shadowMap.needsUpdate was true on ${combatResult.rendersWithShadowNeedsUpdateTrue} render passes during combat choreography`,
      {
        totalRenders: combatResult.traceSamples,
        rendersWithShadowNeedsUpdateTrue: combatResult.rendersWithShadowNeedsUpdateTrue
      });

    // Wait until all combat VFX (fade decal 3.5s, smoke plume) completely expire and countdown hits 0
    await cdp.evaluateAsync(`
      new Promise(resolve => {
        const start = performance.now();
        const check = () => {
          if (activeVFX.length === 0 && shadowUpdateCountdown === 0) {
            resolve();
          } else if (performance.now() - start > 8000) {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      })
    `);

    const postCombatIdle = await cdp.evaluateAsync(`
      new Promise(resolve => {
        window.__startRenderTrace();
        setTimeout(() => {
          const trace = window.__stopRenderTrace();
          resolve({
            frameCount: trace.length,
            activeVFXCount: activeVFX.length,
            allCountdownZero: trace.every(t => t.countdown === 0),
            allNeedsUpdateFalse: trace.every(t => t.shadowNeedsUpdate === false)
          });
        }, 300);
      })
    `);

    assert(postCombatIdle.activeVFXCount === 0,
      'All combat VFX (shocks, debris, smoke plume, ground decal) completely cleared from activeVFX',
      { activeVFXCount: postCombatIdle.activeVFXCount });

    assert(postCombatIdle.allCountdownZero === true,
      'shadowUpdateCountdown returns to 0 after combat sequence and all VFX resolve',
      { allCountdownZero: postCombatIdle.allCountdownZero });

    assert(postCombatIdle.allNeedsUpdateFalse === true,
      'renderer.shadowMap.needsUpdate returns to false across all post-combat render passes',
      { allNeedsUpdateFalse: postCombatIdle.allNeedsUpdateFalse });

    // -------------------------------------------------------------------------
    // TEST 4: VFX Object Pool & GPU Memory Disposal Verification
    // -------------------------------------------------------------------------
    console.log('\n========================================================================');
    console.log('TEST 4: VFX Object Pool & GPU Memory Disposal Verification');
    console.log('========================================================================');

    // Ensure completely quiet baseline
    await cdp.evaluate(`
      (() => {
        while (activeVFX.length > 0) {
          const v = activeVFX.pop();
          const target = v.mesh || v.points;
          if (target) {
            vfxGroup.remove(target);
            if (target.geometry) target.geometry.dispose();
            if (target.material) {
              if (Array.isArray(target.material)) target.material.forEach(m => m.dispose());
              else target.material.dispose();
            }
          }
        }
      })()
    `);

    // Test 4A: Shockwave Ring Disposal
    const shockwaveTest = await cdp.evaluateAsync(`
      new Promise(resolve => {
        const initChildren = vfxGroup.children.length;
        
        spawnShockwaveRing(new THREE.Vector3(0, 0, 0), 0x38bdf8, 3.0, 0.20);
        
        const spawnedVFX = activeVFX[activeVFX.length - 1];
        const mesh = spawnedVFX.mesh;
        
        let geoDisposed = false;
        let matDisposed = false;
        const origGeoDispose = mesh.geometry.dispose.bind(mesh.geometry);
        const origMatDispose = mesh.material.dispose.bind(mesh.material);
        
        mesh.geometry.dispose = () => { geoDisposed = true; origGeoDispose(); };
        mesh.material.dispose = () => { matDisposed = true; origMatDispose(); };
        
        const midChildren = vfxGroup.children.length;
        
        const check = () => {
          if (!activeVFX.includes(spawnedVFX)) {
            resolve({
              initChildren,
              midChildren,
              finalChildren: vfxGroup.children.length,
              inVfxGroup: vfxGroup.children.includes(mesh),
              geoDisposed,
              matDisposed
            });
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      })
    `);

    assert(shockwaveTest.midChildren === shockwaveTest.initChildren + 1,
      'spawnShockwaveRing adds mesh to vfxGroup during active duration',
      shockwaveTest);

    assert(shockwaveTest.inVfxGroup === false && shockwaveTest.finalChildren === shockwaveTest.initChildren,
      'spawnShockwaveRing removes mesh from vfxGroup upon duration expiry',
      shockwaveTest);

    assert(shockwaveTest.geoDisposed === true,
      'spawnShockwaveRing calls geometry.dispose() on expired mesh',
      { geoDisposed: shockwaveTest.geoDisposed });

    assert(shockwaveTest.matDisposed === true,
      'spawnShockwaveRing calls material.dispose() on expired mesh',
      { matDisposed: shockwaveTest.matDisposed });

    // Test 4B: Vertical Light Pillar Disposal
    const pillarTest = await cdp.evaluateAsync(`
      new Promise(resolve => {
        const initChildren = vfxGroup.children.length;
        spawnVerticalLightPillar(new THREE.Vector3(2, 0, 2), 0xf43f5e, 0.20);
        
        const spawnedVFX = activeVFX[activeVFX.length - 1];
        const mesh = spawnedVFX.mesh;
        let geoDisposed = false;
        let matDisposed = false;
        mesh.geometry.dispose = () => { geoDisposed = true; };
        mesh.material.dispose = () => { matDisposed = true; };
        
        const check = () => {
          if (!activeVFX.includes(spawnedVFX)) {
            resolve({
              inVfxGroup: vfxGroup.children.includes(mesh),
              finalChildren: vfxGroup.children.length,
              initChildren,
              geoDisposed,
              matDisposed
            });
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      })
    `);

    assert(pillarTest.inVfxGroup === false && pillarTest.finalChildren === pillarTest.initChildren,
      'spawnVerticalLightPillar cleanly removed from vfxGroup upon expiry',
      pillarTest);

    assert(pillarTest.geoDisposed === true && pillarTest.matDisposed === true,
      'spawnVerticalLightPillar calls geometry.dispose() and material.dispose()',
      pillarTest);

    // Test 4C: Blade Ribbon Arc Disposal
    const ribbonTest = await cdp.evaluateAsync(`
      new Promise(resolve => {
        const initChildren = vfxGroup.children.length;
        spawnBladeRibbonArc(new THREE.Vector3(-2, 0, -2), 0xf59e0b, 1.5, 0.20);
        
        const spawnedVFX = activeVFX[activeVFX.length - 1];
        const mesh = spawnedVFX.mesh;
        let geoDisposed = false;
        let matDisposed = false;
        mesh.geometry.dispose = () => { geoDisposed = true; };
        mesh.material.dispose = () => { matDisposed = true; };
        
        const check = () => {
          if (!activeVFX.includes(spawnedVFX)) {
            resolve({
              inVfxGroup: vfxGroup.children.includes(mesh),
              finalChildren: vfxGroup.children.length,
              initChildren,
              geoDisposed,
              matDisposed
            });
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      })
    `);

    assert(ribbonTest.inVfxGroup === false && ribbonTest.geoDisposed === true && ribbonTest.matDisposed === true,
      'spawnBladeRibbonArc properly removes mesh and disposes geometry & material',
      ribbonTest);

    // Test 4D: 34-Shard Geometric Explosion Disposal
    const shardTest = await cdp.evaluateAsync(`
      new Promise(resolve => {
        const initChildren = vfxGroup.children.length;
        const initActive = activeVFX.length;
        
        spawnGeometricShardExplosion(new THREE.Vector3(0, 0, 0), TEAM_WHITE);
        
        const spawnedCount = activeVFX.length - initActive;
        const spawnedShards = activeVFX.slice(initActive).map(v => v.mesh);
        
        let geoDisposeCalls = 0;
        let matDisposeCalls = 0;
        
        // Track unique material disposals
        const trackedMaterials = new Set();
        spawnedShards.forEach(s => {
          trackedMaterials.add(s.material);
          const origMat = s.material.dispose.bind(s.material);
          s.material.dispose = () => { matDisposeCalls++; origMat(); };
        });
        
        // Track geometry disposal
        const shardGeo = spawnedShards[0].geometry;
        const origGeo = shardGeo.dispose.bind(shardGeo);
        shardGeo.dispose = () => { geoDisposeCalls++; origGeo(); };
        
        const check = () => {
          const shardsAlive = activeVFX.filter(v => v.type === 'shard').length;
          if (shardsAlive === 0) {
            const remainingInGroup = spawnedShards.filter(s => vfxGroup.children.includes(s)).length;
            resolve({
              spawnedCount,
              initChildren,
              finalChildren: vfxGroup.children.length,
              remainingInGroup,
              geoDisposeCalls,
              matDisposeCalls,
              uniqueMaterialsCount: trackedMaterials.size
            });
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      })
    `);

    assert(shardTest.spawnedCount === 34,
      'spawnGeometricShardExplosion spawns exactly 34 shard meshes',
      { spawnedCount: shardTest.spawnedCount });

    assert(shardTest.remainingInGroup === 0 && shardTest.finalChildren === shardTest.initChildren,
      'All 34 shards removed from vfxGroup with zero memory leakage',
      { remainingInGroup: shardTest.remainingInGroup, finalChildren: shardTest.finalChildren });

    assert(shardTest.geoDisposeCalls >= 1,
      'Shared OctahedronGeometry was disposed on expiration',
      { geoDisposeCalls: shardTest.geoDisposeCalls });

    assert(shardTest.matDisposeCalls === 34,
      'All 34 shard cloned materials were explicitly disposed',
      { matDisposeCalls: shardTest.matDisposeCalls });

    // Test 4E: Array of Materials (Multi-Material) Disposal Branch
    const multiMatTest = await cdp.evaluateAsync(`
      new Promise(resolve => {
        const initChildren = vfxGroup.children.length;
        const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const mat1 = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const mat2 = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        
        let geoDisposed = false;
        let mat1Disposed = false;
        let mat2Disposed = false;
        
        geo.dispose = () => { geoDisposed = true; };
        mat1.dispose = () => { mat1Disposed = true; };
        mat2.dispose = () => { mat2Disposed = true; };
        
        const mesh = new THREE.Mesh(geo, [mat1, mat2]);
        vfxGroup.add(mesh);
        activeVFX.push({
          type: 'multi_mat_test',
          mesh,
          elapsed: 0,
          duration: 0.15
        });
        
        const check = () => {
          if (!vfxGroup.children.includes(mesh)) {
            resolve({
              inVfxGroup: false,
              finalChildren: vfxGroup.children.length,
              initChildren,
              geoDisposed,
              mat1Disposed,
              mat2Disposed
            });
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      })
    `);

    assert(multiMatTest.inVfxGroup === false && multiMatTest.finalChildren === multiMatTest.initChildren,
      'Multi-material mesh removed from vfxGroup upon expiry',
      multiMatTest);

    assert(multiMatTest.geoDisposed === true && multiMatTest.mat1Disposed === true && multiMatTest.mat2Disposed === true,
      'Array.isArray(material) branch disposes every material in the array',
      multiMatTest);

    // -------------------------------------------------------------------------
    // TEST 5: Mass Concurrency Stress Test (100 Concurrent VFX Objects)
    // -------------------------------------------------------------------------
    console.log('\n========================================================================');
    console.log('TEST 5: Mass Concurrency Stress Test (100 Concurrent VFX Objects)');
    console.log('========================================================================');

    const massStressResult = await cdp.evaluateAsync(`
      new Promise(resolve => {
        const baselineChildren = vfxGroup.children.length;
        const baselineActive = activeVFX.length;
        
        // Spawn 25 shockwaves, 25 pillars, 25 ribbons, 25 dust puffs
        for (let i = 0; i < 25; i++) {
          const pos = new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10);
          spawnShockwaveRing(pos, 0x38bdf8, 2.5, 0.25 + Math.random() * 0.25);
          spawnVerticalLightPillar(pos, 0xf43f5e, 0.25 + Math.random() * 0.25);
          spawnBladeRibbonArc(pos, 0xf59e0b, 1.2, 0.25 + Math.random() * 0.25);
          spawnFootstepDustPuff(pos, 0, 1.0);
        }
        
        const peakChildren = vfxGroup.children.length;
        const peakActive = activeVFX.length;
        
        const check = () => {
          if (activeVFX.length === baselineActive) {
            resolve({
              baselineChildren,
              baselineActive,
              peakChildren,
              peakActive,
              finalChildren: vfxGroup.children.length,
              finalActive: activeVFX.length
            });
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      })
    `);

    assert(massStressResult.peakChildren >= 100,
      'Mass spawn reached >= 100 concurrent active VFX objects in vfxGroup',
      massStressResult);

    assert(massStressResult.finalChildren === massStressResult.baselineChildren,
      'vfxGroup.children cleanly returns to baseline after mass concurrent VFX expiration',
      {
        baselineChildren: massStressResult.baselineChildren,
        peakChildren: massStressResult.peakChildren,
        finalChildren: massStressResult.finalChildren
      });

    assert(massStressResult.finalActive === massStressResult.baselineActive,
      'activeVFX array cleanly clears all expired elements',
      {
        baselineActive: massStressResult.baselineActive,
        peakActive: massStressResult.peakActive,
        finalActive: massStressResult.finalActive
      });

    // -------------------------------------------------------------------------
    // TEST 6: Tab Switching & Camera Reset Shadow Invalidation
    // -------------------------------------------------------------------------
    console.log('\n========================================================================');
    console.log('TEST 6: Tab Switching & Camera Reset Shadow Invalidation');
    console.log('========================================================================');

    const tabSwitchResult = await cdp.evaluateAsync(`
      new Promise(async (resolve) => {
        // Test tab switch to Studio
        const tabStudioBtn = document.getElementById('tabStudioBtn');
        if (tabStudioBtn) tabStudioBtn.click();
        const studioCountdown = shadowUpdateCountdown;
        const studioNeedsUpdate = renderer.shadowMap.needsUpdate;
        
        // Wait 3 frames
        await new Promise(r => setTimeout(r, 100));
        
        // Test tab switch back to Battlefield
        const tabBattlefieldBtn = document.getElementById('tabBattlefieldBtn');
        if (tabBattlefieldBtn) tabBattlefieldBtn.click();
        const bfieldCountdown = shadowUpdateCountdown;
        const bfieldNeedsUpdate = renderer.shadowMap.needsUpdate;
        
        // Wait 3 frames
        await new Promise(r => setTimeout(r, 100));
        
        // Test reset cam
        const resetCamBtn = document.getElementById('resetCamBtn');
        if (resetCamBtn) resetCamBtn.click();
        const resetCamCountdown = shadowUpdateCountdown;
        const resetCamNeedsUpdate = renderer.shadowMap.needsUpdate;
        
        // Wait for countdown to expire back to 0
        const check = () => {
          if (shadowUpdateCountdown === 0 && !renderer.shadowMap.needsUpdate) {
            resolve({
              studioCountdown,
              studioNeedsUpdate,
              bfieldCountdown,
              bfieldNeedsUpdate,
              resetCamCountdown,
              resetCamNeedsUpdate,
              settledCountdown: shadowUpdateCountdown,
              settledNeedsUpdate: renderer.shadowMap.needsUpdate
            });
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      })
    `);

    assert(tabSwitchResult.studioCountdown > 0 && tabSwitchResult.studioNeedsUpdate === true,
      'Switching to Studio view requests shadow update (countdown > 0, needsUpdate = true)',
      tabSwitchResult);

    assert(tabSwitchResult.bfieldCountdown > 0 && tabSwitchResult.bfieldNeedsUpdate === true,
      'Switching to Battlefield view requests shadow update (countdown > 0, needsUpdate = true)',
      tabSwitchResult);

    assert(tabSwitchResult.resetCamCountdown > 0 && tabSwitchResult.resetCamNeedsUpdate === true,
      'Clicking Reset Camera requests shadow update (countdown > 0, needsUpdate = true)',
      tabSwitchResult);

    assert(tabSwitchResult.settledCountdown === 0 && tabSwitchResult.settledNeedsUpdate === false,
      'Shadow map returns to frozen state (countdown = 0, needsUpdate = false) after UI operations complete',
      tabSwitchResult);

    // Check browser console errors & exceptions
    const browserErrors = cdp.getErrors();
    assert(browserErrors.length === 0,
      'Zero browser console errors or unhandled exceptions encountered throughout test execution',
      { browserErrors });

    console.log('\n========================================================================');
    console.log(`EXECUTION COMPLETE: ${results.passed} Passed, ${results.failed} Failed`);
    console.log('========================================================================');

    fs.writeFileSync(
      path.join(__dirname, '..', 'adversarial_m7_shadow_vfx_report.json'),
      JSON.stringify(results, null, 2)
    );

    return results;

  } catch (err) {
    console.error('Fatal execution error:', err);
    results.failed++;
    results.errors.push(err.message || String(err));
    return results;
  } finally {
    await cdp.close();
  }
}

runAdversarialM7Tests().then(res => {
  process.exit(res.failed === 0 ? 0 : 1);
});
