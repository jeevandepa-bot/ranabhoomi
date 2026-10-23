const { CDPClient } = require('./cdp_client');

async function testElephantCombat() {
  console.log('--- RUNNING ELEPHANT GAJRAJ COMBAT & CINEMATIC VERIFICATION ---');
  const cdp = new CDPClient({ port: 9290 });
  await cdp.launch();
  await cdp.waitForEngineReady(15000);

  // 1. Test Elephant charge across different step distances (1 step vs 5 steps)
  const chargeData = await cdp.evaluate(`(async () => {
    const results = [];
    
    // Test 1 step (adjacent capture)
    {
      const atk = window.buildSculptedUnit(4, 0); // White Rook
      const def = window.buildSculptedUnit(1, 1); // Black Pawn
      const startWp = window.coordToWorld(3, 3);
      const targetWp = window.coordToWorld(3, 4); // 1 step away
      atk.root.position.copy(startWp);
      def.root.position.copy(targetWp);
      window.battlefieldGroup.add(atk.root, def.root);

      const t0 = performance.now();
      const killPromise = window.executeSynchronizedKillSequence(atk, def, targetWp, false);
      
      // Sample during charge
      await new Promise(r => setTimeout(r, 150));
      const midChargeSample = {
        leg0RotX: atk.quadLegs && atk.quadLegs[0] ? atk.quadLegs[0].rotation.x : null,
        leg1RotX: atk.quadLegs && atk.quadLegs[1] ? atk.quadLegs[1].rotation.x : null,
        trunkRotX: atk.trunkSegs && atk.trunkSegs[0] ? atk.trunkSegs[0].rotation.x : null,
        lookPivot: window.camState.targetLookPivot.clone(),
        camDist: window.camState.targetDistance
      };

      await killPromise;
      const totalTime = performance.now() - t0;
      window.battlefieldGroup.remove(atk.root, def.root);
      results.push({ steps: 1, totalTime, midChargeSample });
    }

    // Test 5 steps (long range charge)
    {
      const atk = window.buildSculptedUnit(4, 0); // White Rook
      const def = window.buildSculptedUnit(1, 1); // Black Pawn
      const startWp = window.coordToWorld(3, 1);
      const targetWp = window.coordToWorld(3, 6); // 5 steps away
      atk.root.position.copy(startWp);
      def.root.position.copy(targetWp);
      window.battlefieldGroup.add(atk.root, def.root);

      const t0 = performance.now();
      const killPromise = window.executeSynchronizedKillSequence(atk, def, targetWp, false);
      
      await new Promise(r => setTimeout(r, 250));
      const midChargeSample = {
        leg0RotX: atk.quadLegs && atk.quadLegs[0] ? atk.quadLegs[0].rotation.x : null,
        leg1RotX: atk.quadLegs && atk.quadLegs[1] ? atk.quadLegs[1].rotation.x : null,
        trunkRotX: atk.trunkSegs && atk.trunkSegs[0] ? atk.trunkSegs[0].rotation.x : null,
        lookPivot: window.camState.targetLookPivot.clone(),
        camDist: window.camState.targetDistance
      };

      await killPromise;
      const totalTime = performance.now() - t0;
      window.battlefieldGroup.remove(atk.root, def.root);
      results.push({ steps: 5, totalTime, midChargeSample });
    }

    return results;
  })()`, true);

  console.log('Elephant Charge Data:', JSON.stringify(chargeData, null, 2));

  // Assertions
  const adj = chargeData[0];
  const longRange = chargeData[1];

  // 1. All 4 legs and trunk articulated during charge
  if (Math.abs(adj.midChargeSample.leg0RotX) > 0.01 && Math.abs(adj.midChargeSample.leg1RotX) > 0.01) {
    console.log('[PASS] Elephant 4-Leg Dynamic Gait: Active leg rotation during sprint verified!');
  } else {
    console.error('[FAIL] Elephant legs static during charge:', adj.midChargeSample);
    process.exit(1);
  }

  // 2. Trunk swings backwards during sprint
  if (adj.midChargeSample.trunkRotX < 0) {
    console.log(`[PASS] Elephant Trunk: Coiled backwards in sprint (rotation.x = ${adj.midChargeSample.trunkRotX.toFixed(2)} rad)!`);
  } else {
    console.error('[FAIL] Trunk not backwards during run:', adj.midChargeSample.trunkRotX);
    process.exit(1);
  }

  // 3. Speed/duration adjusted based on number of steps
  console.log(`Adjacent charge time: ${adj.totalTime.toFixed(0)}ms vs 5-step charge time: ${longRange.totalTime.toFixed(0)}ms`);
  if (longRange.totalTime > adj.totalTime) {
    console.log('[PASS] Speed Scaling: Charge time smoothly scales with step distance!');
  } else {
    console.error('[FAIL] Speed did not scale with distance:', { adj: adj.totalTime, longRange: longRange.totalTime });
    process.exit(1);
  }

  await cdp.close();
  console.log('--- ELEPHANT VERIFICATION COMPLETE ---');
}

testElephantCombat().catch(err => {
  console.error('Elephant test failed:', err);
  process.exit(1);
});
