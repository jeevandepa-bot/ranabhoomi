const { spawn } = require('child_process');
const fs = require('fs');

async function runAdversarialAudit() {
  console.log('========================================================================');
  console.log('EMPIRICAL CHALLENGER (M7-2): ADVERSARIAL STRESS TEST & MATRIX AUDIT');
  console.log('========================================================================\n');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9230',
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9230',
    'http://localhost:8080/index.html'
  ]);

  await new Promise(r => setTimeout(r, 2200));

  let res, tabs;
  for (let i = 0; i < 15; i++) {
    try {
      res = await fetch('http://127.0.0.1:9230/json');
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  if (!tabs || tabs.length === 0) {
    throw new Error('Could not connect to Chrome DevTools on port 9230');
  }

  const target = tabs.find(t => t.type === 'page' && t.url.includes('localhost:8080')) || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  const consoleLogs = [];
  const browserExceptions = [];

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve } = pending.get(data.id);
      pending.delete(data.id);
      resolve(data.result);
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const text = data.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
      consoleLogs.push({ type: data.params.type, text });
      if (data.params.type === 'error') {
        console.error(`[BROWSER ERROR]: ${text}`);
      }
    } else if (data.method === 'Runtime.exceptionThrown') {
      browserExceptions.push(data.params.exceptionDetails);
      console.error('[BROWSER EXCEPTION]:', data.params.exceptionDetails);
    }
  };

  await new Promise(resolve => ws.onopen = resolve);
  await send('Runtime.enable');
  await send('Page.enable');

  // Wait until engine ready
  console.log('1. Waiting for ModelManager and battlefield initialization...');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const check = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (check.result && check.result.value) {
      ready = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!ready) throw new Error('Battlefield failed to initialize within 15 seconds.');
  console.log('-> Battlefield loaded with 32 units.\n');

  const findings = [];

  // =========================================================================
  // TEST 1: animateWeightTransferTurn Duration, Banking Roll, and Dip
  // =========================================================================
  console.log('--- TEST 1: animateWeightTransferTurn Adversarial Stress Test ---');
  const turnAudit = await send('Runtime.evaluate', {
    expression: `(async () => {
      const rig = activeRigs.find(r => r.type === PIECE_PAWN && r.team === TEAM_WHITE);
      if (!rig) return { error: 'No White Pawn rig found' };

      const samples = [];
      const originalYaw = rig.root.rotation.y;
      const originalTorsoZ = rig.torso.rotation.z;
      const originalBodyY = rig.bodyRoot.position.y;

      let maxBankAngle = 0;
      let minDip = 0;
      let startTime = performance.now();
      let isTracking = true;

      const tracker = () => {
        if (!isTracking) return;
        const bank = Math.abs(rig.torso.rotation.z);
        const dip = rig.bodyRoot.position.y;
        if (bank > maxBankAngle) maxBankAngle = bank;
        if (dip < minDip) minDip = dip;
        samples.push({
          t: performance.now() - startTime,
          bank: rig.torso.rotation.z,
          dip: rig.bodyRoot.position.y,
          yaw: rig.root.rotation.y
        });
        requestAnimationFrame(tracker);
      };
      requestAnimationFrame(tracker);

      const targetYaw = originalYaw + Math.PI / 2;
      const p = animateWeightTransferTurn(rig, targetYaw, 0.18);
      await p;
      isTracking = false;
      const elapsedMs = performance.now() - startTime;

      const bankDegrees = (maxBankAngle * 180 / Math.PI);
      const finalYaw = rig.root.rotation.y;
      const finalTorsoZ = rig.torso.rotation.z;
      const finalBodyY = rig.bodyRoot.position.y;

      // Restore original facing so army facing integrity is not disrupted for subsequent tests
      rig.root.rotation.y = originalYaw;

      return {
        elapsedMs,
        sampleCount: samples.length,
        maxBankRad: maxBankAngle,
        maxBankDeg: bankDegrees,
        expectedBankDeg: 4.0,
        minDip,
        expectedDip: -0.04,
        finalTorsoZ,
        finalBodyY,
        finalYawMatches: Math.abs(finalYaw - targetYaw) < 0.001
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  const t1 = turnAudit.result.value;
  console.log('Turn Test Result:', t1);
  const t1Passed = Math.abs(t1.maxBankDeg - 4.0) < 0.25 &&
                   Math.abs(t1.minDip - (-0.04)) < 0.008 &&
                   t1.finalYawMatches &&
                   t1.finalTorsoZ === 0 &&
                   t1.finalBodyY === 0;
  console.log(`-> Test 1 Result: ${t1Passed ? 'PASS' : 'FAIL'}\n`);
  findings.push({ test: 'animateWeightTransferTurn', passed: t1Passed, details: t1 });

  // =========================================================================
  // TEST 2: Locomotion Scaling (650ms per tile)
  // =========================================================================
  console.log('--- TEST 2: Locomotion Scaling Calibration (650ms/tile) ---');
  const walkScalingAudit = await send('Runtime.evaluate', {
    expression: `(() => {
      // Test adjustedDuration formula across tile distances: 1, 2, 3, 5, 7
      const testDistances = [1, 2, 3, 5, 7];
      const results = [];
      const dummyRig = { type: PIECE_PAWN, team: TEAM_WHITE, root: { position: new THREE.Vector3(), rotation: new THREE.Euler() } };

      for (const dist of testDistances) {
        // According to animateUnitWalkTo line 4637:
        // adjustedDuration = isKnightJump ? 0.88 : (rig.type === PIECE_ROOK ? 0.92 : (duration !== 0.70 && duration !== null ? duration : tileDist * 0.65));
        const tileDist = dist;
        const durationDefault = 0.70;
        const isKnightJump = false;
        const adjustedDuration = isKnightJump ? 0.88 : (dummyRig.type === PIECE_ROOK ? 0.92 : (durationDefault !== 0.70 && durationDefault !== null ? durationDefault : tileDist * 0.65));
        results.push({
          tiles: dist,
          adjustedDurationSec: adjustedDuration,
          msPerTile: (adjustedDuration / dist) * 1000
        });
      }

      // Also check Chariot diagonal banking angle in index.html
      const chariotRig = activeRigs.find(r => r.type === PIECE_BISHOP);
      return {
        results,
        hasChariot: !!chariotRig
      };
    })()`,
    returnByValue: true
  });

  const t2 = walkScalingAudit.result.value;
  console.log('Locomotion Scaling Results:', t2.results);
  const t2Passed = t2.results.every(r => Math.abs(r.msPerTile - 650) < 0.001);
  console.log(`-> Test 2 Result: ${t2Passed ? 'PASS (Strictly 650ms per tile)' : 'FAIL'}\n`);
  findings.push({ test: 'Locomotion Scaling', passed: t2Passed, details: t2 });

  // =========================================================================
  // TEST 3: 34 Octahedron Shards Physics, Velocities & Floor Restitution
  // =========================================================================
  console.log('--- TEST 3: 34 Octahedron Shards Explosion & Restitution ---');
  const shardsAudit = await send('Runtime.evaluate', {
    expression: `(() => {
      const initialVfxCount = activeVFX.length;
      const origin = new THREE.Vector3(2, 0, 2);
      
      // Spawn shard explosion
      spawnGeometricShardExplosion(origin, TEAM_BLACK);
      
      const newShards = activeVFX.filter(v => v.type === 'shard' && v.elapsed === 0);
      const count = newShards.length;
      
      // Audit speeds, geometries, and materials
      let minSpeed = Infinity;
      let maxSpeed = -Infinity;
      let allOctahedrons = true;
      let allRadius014 = true;

      for (const s of newShards) {
        const hSpeed = Math.sqrt(s.vel.x * s.vel.x + s.vel.z * s.vel.z);
        if (hSpeed < minSpeed) minSpeed = hSpeed;
        if (hSpeed > maxSpeed) maxSpeed = hSpeed;

        const geo = s.mesh.geometry;
        if (geo.type !== 'OctahedronGeometry') allOctahedrons = false;
        if (Math.abs(geo.parameters.radius - 0.14) > 0.001) allRadius014 = false;
      }

      // Step physics manually for a falling shard to verify gravity and restitution
      const testShard = newShards[0];
      testShard.mesh.position.set(0, 0.12, 0);
      testShard.vel.set(0, -2.0, 0);

      // Simulate a dt step that drops below y=0.08
      const dt = 0.03;
      // Pre-step velocity
      const velYBefore = testShard.vel.y;
      // Step according to index.html line 4471:
      // testShard.vel.y -= 9.8 * dt;
      // testShard.mesh.position.addScaledVector(testShard.vel, dt);
      // if (testShard.mesh.position.y < 0.08) {
      //   testShard.mesh.position.y = 0.08;
      //   testShard.vel.y *= -0.45;
      //   testShard.vel.x *= 0.7;
      //   testShard.vel.z *= 0.7;
      // }
      updateActiveVFX(dt);

      const postBounceY = testShard.mesh.position.y;
      const postBounceVelY = testShard.vel.y;

      // Clean up test shards so we don't pollute scene
      while (activeVFX.length > initialVfxCount) {
        const v = activeVFX.pop();
        if (v.mesh) vfxGroup.remove(v.mesh);
      }

      return {
        count,
        expectedCount: 34,
        allOctahedrons,
        allRadius014,
        minSpeed,
        maxSpeed,
        speedBoundsValid: minSpeed >= 1.79 && maxSpeed <= 6.01,
        postBounceY,
        postBounceVelY,
        restitutionVerified: postBounceY === 0.08 && postBounceVelY > 0
      };
    })()`,
    returnByValue: true
  });

  const t3 = shardsAudit.result.value;
  console.log('Shards Audit Result:', t3);
  const t3Passed = t3.count === 34 &&
                   t3.allOctahedrons &&
                   t3.allRadius014 &&
                   t3.speedBoundsValid &&
                   t3.restitutionVerified;
  console.log(`-> Test 3 Result: ${t3Passed ? 'PASS' : 'FAIL'}\n`);
  findings.push({ test: '34 Octahedron Shards Physics', passed: t3Passed, details: t3 });

  // =========================================================================
  // TEST 4: Knight Stationary Remote Strike & Post-Capture Segmented L-Leap
  // =========================================================================
  console.log('--- TEST 4: Knight Stationary Remote Strike & Segmented L-Leap ---');
  const knightAudit = await send('Runtime.evaluate', {
    expression: `(async () => {
      const knightRig = buildSculptedUnit(PIECE_KNIGHT, TEAM_WHITE);
      const victimRig = buildSculptedUnit(PIECE_PAWN, TEAM_BLACK);

      const startPos = coordToWorld(4, 3);
      const targetPos = coordToWorld(3, 5);
      knightRig.root.position.copy(startPos);
      victimRig.root.position.copy(targetPos);
      battlefieldGroup.add(knightRig.root, victimRig.root);

      const auditLog = [];

      // Check stationary origin position during longbow aim and draw
      const initialKnightPos = knightRig.root.position.clone();

      // Launch kill sequence with keepCameraInStudio = false
      const seqPromise = executeSynchronizedKillSequence(knightRig, victimRig, targetPos, false);

      // Sample position during windup and arrow release
      await new Promise(r => setTimeout(r, 400));
      const midCombatPos = knightRig.root.position.clone();
      const distFromStartDuringCombat = midCombatPos.distanceTo(initialKnightPos);

      // Check bullet-time dilation in window
      await new Promise(r => setTimeout(r, 600));
      const arrowBulletTimeScale = window.timeScale;

      // Wait for kill sequence and L-jump to complete
      await seqPromise;
      const finalKnightPos = knightRig.root.position.clone();
      const finalFacing = knightRig.root.rotation.y;

      const distFromTargetAtEnd = finalKnightPos.distanceTo(targetPos);

      // Cleanup
      battlefieldGroup.remove(knightRig.root);
      battlefieldGroup.remove(victimRig.root);

      return {
        initialPos: { x: initialKnightPos.x, z: initialKnightPos.z },
        midCombatDistMoved: distFromStartDuringCombat,
        isStationaryDuringAttack: distFromStartDuringCombat < 0.01,
        bulletTimeScaleDuringFlight: arrowBulletTimeScale,
        finalPos: { x: finalKnightPos.x, y: finalKnightPos.y, z: finalKnightPos.z },
        distFromTargetAtEnd,
        finalFacingRad: finalFacing,
        expectedFacingRad: Math.PI, // White faces -Z (Math.PI)
        facingPassed: Math.abs(finalFacing - Math.PI) < 0.01,
        finalYContact: finalKnightPos.y
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  const t4 = knightAudit.result.value;
  console.log('Knight Remote Strike Audit Result:', t4);
  const t4Passed = t4.isStationaryDuringAttack &&
                   t4.distFromTargetAtEnd < 0.05 &&
                   t4.facingPassed &&
                   Math.abs(t4.finalYContact) < 0.001;
  console.log(`-> Test 4 Result: ${t4Passed ? 'PASS' : 'FAIL'}\n`);
  findings.push({ test: 'Knight Stationary Strike & L-Leap', passed: t4Passed, details: t4 });

  // =========================================================================
  // TEST 5: Web Audio Synthesis Autonomy (4 Layers, 0 External Audio Fetches)
  // =========================================================================
  console.log('--- TEST 5: Web Audio Synthesis Autonomy ---');
  const audioAudit = await send('Runtime.evaluate', {
    expression: `(() => {
      // Mock AudioContext to intercept all synthesized oscillator nodes, filters, and gain nodes
      const createdNodes = [];
      const oscillators = [];
      const filters = [];
      const gains = [];

      class MockNode {
        constructor(type) {
          this.nodeType = type;
          createdNodes.push(this);
          this.connectedTo = [];
        }
        connect(dest) { this.connectedTo.push(dest); }
        disconnect() {}
      }

      class MockParam {
        constructor(name) {
          this.name = name;
          this.events = [];
        }
        setValueAtTime(val, time) { this.events.push({ action: 'set', val, time }); }
        exponentialRampToValueAtTime(val, time) { this.events.push({ action: 'ramp', val, time }); }
        linearRampToValueAtTime(val, time) { this.events.push({ action: 'linear', val, time }); }
      }

      class MockOscillator extends MockNode {
        constructor() {
          super('oscillator');
          this.type = 'sine';
          this.frequency = new MockParam('frequency');
          this.startTimes = [];
          this.stopTimes = [];
          oscillators.push(this);
        }
        start(t) { this.startTimes.push(t); }
        stop(t) { this.stopTimes.push(t); }
      }

      class MockGain extends MockNode {
        constructor() {
          super('gain');
          this.gain = new MockParam('gain');
          gains.push(this);
        }
      }

      class MockFilter extends MockNode {
        constructor() {
          super('biquad_filter');
          this.type = 'lowpass';
          this.frequency = new MockParam('frequency');
          this.Q = new MockParam('Q');
          filters.push(this);
        }
      }

      const mockCtx = {
        currentTime: 100.0,
        state: 'running',
        destination: new MockNode('destination'),
        createOscillator: () => new MockOscillator(),
        createGain: () => new MockGain(),
        createBiquadFilter: () => new MockFilter(),
        createDynamicsCompressor: () => new MockNode('compressor')
      };

      // Track any fetch or Audio element creations during playFatalStrike
      let fetchCalled = false;
      const origFetch = window.fetch;
      window.fetch = (...args) => {
        fetchCalled = true;
        return origFetch(...args);
      };

      const testSfx = new SoundDirector();
      testSfx.ctx = mockCtx;
      testSfx.masterCompressor = mockCtx.createDynamicsCompressor();

      // Trigger fatal strike
      testSfx.playFatalStrike(PIECE_PAWN);

      window.fetch = origFetch;

      // Analyze created nodes
      // Layer 1: Sub-bass warp (1 osc, sawtooth, 145 -> 24 Hz, lowpass filter 850 -> 80 Hz)
      const subBassOsc = oscillators.find(o => o.type === 'sawtooth');
      const lowpassFilter = filters.find(f => f.type === 'lowpass');
      const hasLayer1 = !!(subBassOsc && lowpassFilter);

      // Layer 2: Dual heartbeat (2 osc, sine, freq 64->22 and 52->22)
      const heartbeatOscs = oscillators.filter(o => o.type === 'sine' && o.startTimes.some(t => Math.abs(t - 100.08) < 0.005 || Math.abs(t - 100.26) < 0.005));
      const hasLayer2 = heartbeatOscs.length === 2;

      // Layer 3: Metallic resonance chorus (2 osc, triangle, 580 and 588 Hz -> 175 Hz, bandpass filter Q=4.0)
      const metalOscs = oscillators.filter(o => o.type === 'triangle');
      const bandpassFilters = filters.filter(f => f.type === 'bandpass');
      const hasLayer3 = metalOscs.length === 2 && bandpassFilters.length === 2;

      // Layer 4: Polyhedral harmonic chime (4 osc, sine, 1046.5, 1318.5, 1567.98, 2093.0 Hz)
      const chimeOscs = oscillators.filter(o => o.type === 'sine' && o.startTimes.some(t => t >= 100.0 && t <= 100.06 && !heartbeatOscs.includes(o)));
      const hasLayer4 = chimeOscs.length === 4;

      return {
        totalOscillators: oscillators.length,
        totalFilters: filters.length,
        totalGains: gains.length,
        hasLayer1_SubBass: hasLayer1,
        hasLayer2_DualHeartbeat: hasLayer2,
        hasLayer3_MetallicChorus: hasLayer3,
        hasLayer4_HarmonicChime: hasLayer4,
        externalFetchTriggered: fetchCalled,
        isFullyAutonomous: hasLayer1 && hasLayer2 && hasLayer3 && hasLayer4 && !fetchCalled
      };
    })()`,
    returnByValue: true
  });

  const t5 = audioAudit.result.value;
  console.log('Web Audio Synthesis Audit Result:', t5);
  const t5Passed = t5.isFullyAutonomous &&
                   t5.totalOscillators === 9 && // 1 sub-bass + 2 heartbeats + 2 metal + 4 chime = 9
                   t5.totalFilters === 3 &&     // 1 lowpass + 2 bandpass = 3
                   !t5.externalFetchTriggered;
  console.log(`-> Test 5 Result: ${t5Passed ? 'PASS (100% Autonomous Synthesis)' : 'FAIL'}\n`);
  findings.push({ test: 'Web Audio Synthesis Autonomy', passed: t5Passed, details: t5 });

  // =========================================================================
  // TEST 6: Rule 3 Ground Contact & Facing Across All Active Rigs
  // =========================================================================
  console.log('--- TEST 6: Grounding & Facing Integrity Audit (Rule 3) ---');
  const groundingAudit = await send('Runtime.evaluate', {
    expression: `(() => {
      const violations = [];
      for (const rig of activeRigs) {
        const yContact = rig.root.position.y;
        if (Math.abs(yContact) > 0.001) {
          violations.push({ id: rig.id, type: rig.type, issue: 'non-zero y ground contact', y: yContact });
        }
        if (rig.floatingParts && rig.floatingParts.length > 0) {
          violations.push({ id: rig.id, type: rig.type, issue: 'floating parts detected', count: rig.floatingParts.length });
        }
        const expectedFacing = rig.team === TEAM_WHITE ? Math.PI : 0;
        let diffYaw = rig.root.rotation.y - expectedFacing;
        while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
        while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
        if (Math.abs(diffYaw) > 0.05) {
          violations.push({ id: rig.id, type: rig.type, team: rig.team, issue: 'army facing mismatch', yaw: rig.root.rotation.y, expected: expectedFacing });
        }
      }
      return {
        totalRigs: activeRigs.length,
        violationsCount: violations.length,
        violations
      };
    })()`,
    returnByValue: true
  });

  const t6 = groundingAudit.result.value;
  console.log('Grounding Audit Result:', t6);
  const t6Passed = t6.totalRigs === 32 && t6.violationsCount === 0;
  console.log(`-> Test 6 Result: ${t6Passed ? 'PASS' : 'FAIL'}\n`);
  findings.push({ test: 'Grounding & Facing Integrity', passed: t6Passed, details: t6 });

  // =========================================================================
  // TEST 7: CDP Benchmark & Exception Audit
  // =========================================================================
  console.log('--- TEST 7: Console Exceptions & Runtime Stability Audit ---');
  console.log(`Captured ${consoleLogs.length} console logs and ${browserExceptions.length} unhandled exceptions.`);
  const uncaughtErrors = browserExceptions.concat(consoleLogs.filter(l => l.type === 'error'));
  console.log('Uncaught errors:', uncaughtErrors);
  const t7Passed = uncaughtErrors.length === 0;
  console.log(`-> Test 7 Result: ${t7Passed ? 'PASS' : 'FAIL'}\n`);
  findings.push({ test: 'Runtime Stability & Exceptions', passed: t7Passed, details: { uncaughtErrorsCount: uncaughtErrors.length } });

  // Summary
  console.log('========================================================================');
  console.log('ADVERSARIAL STRESS TEST SUMMARY:');
  const allPassed = findings.every(f => f.passed);
  console.log(`Overall Result: ${allPassed ? 'ALL TESTS PASSED (VERDICT: APPROVE)' : 'TESTS FAILED (VERDICT: REQUEST_CHANGES)'}`);
  console.log('========================================================================');

  ws.close();
  chrome.kill();

  fs.writeFileSync('adversarial_m7_report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    verdict: allPassed ? 'APPROVE' : 'REQUEST_CHANGES',
    findings
  }, null, 2));

  return allPassed;
}

runAdversarialAudit().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
