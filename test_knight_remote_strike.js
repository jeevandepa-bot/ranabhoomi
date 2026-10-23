const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Jeevan\\.gemini\\antigravity\\brain\\9f6b62c5-1dfe-4bdd-81f7-211bfc1427e1';
const screenshotDir = fs.existsSync(ARTIFACT_DIR) ? ARTIFACT_DIR : __dirname;

function assert(condition, message) {
  if (!condition) {
    console.error('ASSERTION FAILED:', message);
    throw new Error('ASSERTION FAILED: ' + message);
  }
}

async function testKnightRemoteStrike() {
  console.log('=== TEST: KNIGHT REMOTE LONGBOW STRIKE & POST-DESTRUCTION L-LEAP ===');
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9228',
    '--window-size=1920,1080',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9228',
    'http://localhost:8080/index.html'
  ]);

  await new Promise(r => setTimeout(r, 2200));
  const res = await fetch('http://127.0.0.1:9228/json');
  const tabs = await res.json();
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  let id = 1;
  const p = new Map();
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && p.has(d.id)) {
      p.get(d.id)(d.result);
      p.delete(d.id);
    }
  };
  const send = (m, a = {}) => new Promise(res => {
    const i = id++;
    p.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: a }));
  });

  async function evalCDP(expression, awaitPromise = false) {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise
    });
    if (r && r.exceptionDetails) {
      throw new Error('Browser Exception in eval: ' + JSON.stringify(r.exceptionDetails));
    }
    return r && r.result ? r.result.value : undefined;
  }

  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false
  });

  // Wait for 3D engine and assets to fully initialize
  console.log('Waiting for ModelManager and activeRigs...');
  for (let i = 0; i < 30; i++) {
    const ready = await evalCDP('typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32');
    if (ready) break;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n--- 1. Setting up Battlefield Knight Remote Strike ---');
  // Setup White Knight at (4, 3) and Black Pawn victim at (3, 5)
  const setupCoords = await evalCDP(`(() => {
    const startWp = coordToWorld(4, 3);
    const targetWp = coordToWorld(3, 5);
    
    const atkKnight = buildSculptedUnit(PIECE_KNIGHT, TEAM_WHITE);
    const defPawn = buildSculptedUnit(PIECE_PAWN, TEAM_BLACK);
    
    atkKnight.root.position.copy(startWp);
    atkKnight.root.rotation.y = Math.PI; // White faces -Z
    defPawn.root.position.copy(targetWp);
    defPawn.root.rotation.y = 0; // Black faces +Z
    
    battlefieldGroup.add(atkKnight.root, defPawn.root);
    window.__testKnight = atkKnight;
    window.__testVictim = defPawn;
    window.__startWp = startWp;
    window.__targetWp = targetWp;
    
    return {
      knightStart: { x: startWp.x, y: startWp.y, z: startWp.z },
      victimTarget: { x: targetWp.x, y: targetWp.y, z: targetWp.z }
    };
  })()`);
  console.log('Setup coordinates:', setupCoords);
  assert(setupCoords && setupCoords.knightStart && setupCoords.victimTarget, 'Setup coordinates must be defined');

  console.log('\n--- 2. Triggering Synchronized Knight Kill Sequence ---');
  send('Runtime.evaluate', {
    expression: `window.__killSequencePromise = executeSynchronizedKillSequence(window.__testKnight, window.__testVictim, window.__targetWp, false)`
  });

  // Track Phase 1: Bow Windup & Rear-up (~0.4s to 0.8s) - Knight must remain at initial position!
  await new Promise(r => setTimeout(r, 600));
  const posCheck1 = await evalCDP(`(() => {
    const kPos = window.__testKnight.root.position;
    const sPos = window.__startWp;
    const distFromStart = Math.hypot(kPos.x - sPos.x, kPos.z - sPos.z);
    const inKill = window.__testKnight.inKillSequence;
    const horseRearing = window.__testKnight.bodyRoot.position.y;
    return {
      distFromStart: Number(distFromStart.toFixed(3)),
      inKill,
      horseRearingY: Number(horseRearing.toFixed(3)),
      atOrigin: distFromStart < 0.05
    };
  })()`);
  console.log('Phase 1 (Rearing & Bow Draw at Origin):', posCheck1);
  assert(posCheck1 && posCheck1.atOrigin, 'Knight must remain stationary at origin during bow draw');
  assert(posCheck1 && posCheck1.inKill, 'Knight must be in kill sequence during bow draw');

  // Take Screenshot 1: Warhorse rearing high, Kshatriya dragoon drawing longbow from initial square
  const snap1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotDir, 'test_knight_strike_1_bow_draw.png'), Buffer.from(snap1.data, 'base64'));
  console.log('Saved screenshot: test_knight_strike_1_bow_draw.png');

  // Track Phase 2: Bullet-Time Arrow Approach (~1.0s to 1.6s)
  let bulletCheck = null;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 50));
    bulletCheck = await evalCDP(`(() => {
      const kPos = window.__testKnight.root.position;
      const sPos = window.__startWp;
      const distFromStart = Math.hypot(kPos.x - sPos.x, kPos.z - sPos.z);
      const tScale = timeScale;
      const hudEl = document.getElementById('killCamCoords');
      const hudText = hudEl ? hudEl.textContent : '';
      const cameraFov = camera.fov;
      return {
        distFromStart: Number(distFromStart.toFixed(3)),
        timeScale: tScale,
        cameraFov: Number(cameraFov.toFixed(1)),
        hudText,
        bulletTimeActive: tScale < 0.5 || hudText.includes('BULLET-TIME')
      };
    })()`);
    if (bulletCheck && bulletCheck.bulletTimeActive) {
      break;
    }
  }
  console.log('Phase 2 (Bullet-Time Arrow Flight & Heart Pierce):', bulletCheck);
  assert(bulletCheck && (bulletCheck.timeScale < 0.5 || bulletCheck.bulletTimeActive), 'Bullet-time must be triggered during projectile flight');

  const snap2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotDir, 'test_knight_strike_2_bullet_time.png'), Buffer.from(snap2.data, 'base64'));
  console.log('Saved screenshot: test_knight_strike_2_bullet_time.png');

  // Track Phase 3: Victim Fatal Collapse (~2.1s to 2.5s)
  await new Promise(r => setTimeout(r, 700));
  const collapseCheck = await evalCDP(`(() => {
    const v = window.__testVictim;
    return {
      victimDying: v.isDying,
      victimTorsoX: Number(v.torso.rotation.x.toFixed(2)),
      victimBodyY: Number(v.bodyRoot.position.y.toFixed(2)),
      victimVisible: v.root.visible,
      knightStillAtStart: Math.hypot(window.__testKnight.root.position.x - window.__startWp.x, window.__testKnight.root.position.z - window.__startWp.z) < 0.1
    };
  })()`);
  console.log('Phase 3 (Victim Heavy Collapse at Target Square):', collapseCheck);
  assert(collapseCheck && (collapseCheck.victimDying || !collapseCheck.victimVisible), 'Victim must be dying or hidden during/after fatal collapse');

  const snap3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotDir, 'test_knight_strike_3_victim_collapse.png'), Buffer.from(snap3.data, 'base64'));
  console.log('Saved screenshot: test_knight_strike_3_victim_collapse.png');

  // Track Phase 4: Post-Destruction Segmented L-Leap (~3.0s to 3.8s simulation time, condition-polled for headless)
  console.log('Waiting for segmented L-leap completion...');
  await evalCDP(`window.__killSequencePromise`, true);

  const landingCheck = await evalCDP(`(() => {
    const k = window.__testKnight;
    const tWp = window.__targetWp;
    const distFromTarget = Math.hypot(k.root.position.x - tWp.x, k.root.position.z - tWp.z);
    const groundContactY = k.root.position.y;
    const rotY = k.root.rotation.y;
    return {
      distFromTarget: Number(distFromTarget.toFixed(3)),
      groundContactY: Number(groundContactY.toFixed(3)),
      rotY: Number(rotY.toFixed(2)),
      expectedRotY: Number(Math.PI.toFixed(2)),
      facesOpponent: Math.abs(Math.abs(rotY) - Math.PI) < 0.05,
      victimRemovedOrHidden: !window.__testVictim.root.visible
    };
  })()`);
  console.log('Phase 4 (Segmented L-Leap Landing Facing Opponent):', landingCheck);
  assert(landingCheck && landingCheck.distFromTarget < 0.05, 'Knight must land at target square within 0.05m tolerance');
  assert(landingCheck && landingCheck.facesOpponent, 'Knight must face opponent (yaw = PI rad)');
  assert(landingCheck && landingCheck.victimRemovedOrHidden, 'Victim must be hidden from battlefield');
  assert(landingCheck && Math.abs(landingCheck.groundContactY) < 0.005, 'Knight must rest on ground level');

  const snap4 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotDir, 'test_knight_strike_4_triumphant_landing.png'), Buffer.from(snap4.data, 'base64'));
  console.log('Saved screenshot: test_knight_strike_4_triumphant_landing.png');

  // Clean up test rigs
  await evalCDP(`battlefieldGroup.remove(window.__testKnight.root, window.__testVictim.root);`);

  console.log('\n--- 3. Testing Non-Capture Opening Knight Leap (Nb1-c3) ---');
  const moveRes = await evalCDP(`(async () => {
    // Find legal knight move for White Nb1-c3 (f: 1, r: 0 -> f: 2, r: 2)
    const knightRig = window.unitGrid[1][0];
    const startPos = knightRig.root.position.clone();
    const targetPos = coordToWorld(2, 2);
    
    const move = {
      fromF: 1, fromR: 0,
      toF: 2, toR: 2,
      piece: knightRig.type,
      isCapture: false,
      isCastling: false,
      isEnPassant: false,
      promotion: null
    };
    await performChessMove(move);
    
    const endRig = window.unitGrid[2][2];
    const endPos = endRig.root.position;
    const diffDist = endPos.distanceTo(targetPos);
    return {
      movedToTarget: diffDist < 0.01,
      y: Number(endPos.y.toFixed(3)),
      rotY: Number(endRig.root.rotation.y.toFixed(2)),
      facesOpponent: Math.abs(endRig.root.rotation.y - Math.PI) < 0.05
    };
  })()`, true);
  console.log('Non-Capture Knight Move Result:', moveRes);
  assert(moveRes && moveRes.movedToTarget, 'Knight must reach target c3 (diffDist < 0.01)');
  assert(moveRes && moveRes.facesOpponent, 'Knight must face opponent after non-capture leap');
  assert(moveRes && Math.abs(moveRes.y) < 0.01, 'Knight must remain grounded at y=0.000m');

  const snap5 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotDir, 'test_knight_noncapture_landing.png'), Buffer.from(snap5.data, 'base64'));
  console.log('Saved screenshot: test_knight_noncapture_landing.png');

  console.log('\n=== ALL KNIGHT TESTS COMPLETED SUCCESSFULLY ===');
  ws.close();
  chrome.kill();
  process.exit(0);
}

testKnightRemoteStrike().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
