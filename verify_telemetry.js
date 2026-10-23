const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Jeevan\\.gemini\\antigravity\\brain\\9f6b62c5-1dfe-4bdd-81f7-211bfc1427e1';

async function verifyTelemetry() {
  console.log('=== VERIFYING KNIGHT TELEMETRY & CONSOLE LOGS ===');
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9229',
    '--window-size=1920,1080',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9229',
    'http://localhost:8080/index.html'
  ]);

  await new Promise(r => setTimeout(r, 2200));
  const res = await fetch('http://127.0.0.1:9229/json');
  const tabs = await res.json();
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  let id = 1;
  const p = new Map();
  const consoleLogs = [];

  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.method === 'Runtime.consoleAPICalled') {
      consoleLogs.push(d.params.args.map(a => a.value || a.description).join(' '));
    }
    if (d.id && p.has(d.id)) {
      p.get(d.id)(d);
      p.delete(d.id);
    }
  };
  const send = (m, a = {}) => new Promise(res => {
    const i = id++;
    p.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: a }));
  });

  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  await send('Page.enable');

  await new Promise(r => setTimeout(r, 2500));

  const valOf = r => r?.result?.result?.value ?? r?.result?.value;

  console.log('\n--- 1. Setting up Battlefield Knight Remote Strike ---');
  const setupRes = await send('Runtime.evaluate', {
    expression: `(() => {
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
    })()`,
    returnByValue: true
  });
  console.log('Setup coordinates:', valOf(setupRes));

  console.log('\n--- 2. Triggering Synchronized Knight Kill Sequence ---');
  send('Runtime.evaluate', {
    expression: `executeSynchronizedKillSequence(window.__testKnight, window.__testVictim, window.__targetWp, false)`
  });

  // Track Phase 1: Bow Windup & Rear-up (~0.6s) - Knight must remain at initial position!
  await new Promise(r => setTimeout(r, 600));
  const posCheck1 = await send('Runtime.evaluate', {
    expression: `(() => {
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
    })()`,
    returnByValue: true
  });
  console.log('Phase 1 (Rearing & Bow Draw at Origin):', valOf(posCheck1));

  // Track Phase 2: Arrow release & Bullet-Time Approach (~1.5s)
  await new Promise(r => setTimeout(r, 900));
  const bulletCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const kPos = window.__testKnight.root.position;
      const sPos = window.__startWp;
      const distFromStart = Math.hypot(kPos.x - sPos.x, kPos.z - sPos.z);
      const tScale = timeScale;
      const hudText = document.getElementById('killCamCoords').textContent;
      const cameraFov = camera.fov;
      return {
        distFromStart: Number(distFromStart.toFixed(3)),
        timeScale: tScale,
        cameraFov: Number(cameraFov.toFixed(1)),
        hudText,
        arrowShot: window.__testKnight.arrowShot
      };
    })()`,
    returnByValue: true
  });
  console.log('Phase 2 (Bullet-Time Arrow Flight & Heart Pierce):', valOf(bulletCheck));

  // Track Phase 3: Victim Fatal Collapse (~2.2s)
  await new Promise(r => setTimeout(r, 700));
  const collapseCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const v = window.__testVictim;
      return {
        victimDying: v.isDying,
        victimTorsoX: Number(v.torso.rotation.x.toFixed(2)),
        victimBodyY: Number(v.bodyRoot.position.y.toFixed(2)),
        victimVisible: v.root.visible,
        knightStillAtStart: Math.hypot(window.__testKnight.root.position.x - window.__startWp.x, window.__testKnight.root.position.z - window.__startWp.z) < 0.1
      };
    })()`,
    returnByValue: true
  });
  console.log('Phase 3 (Victim Heavy Collapse at Target Square):', valOf(collapseCheck));

  // Track Phase 4: Post-Destruction Segmented L-Leap (~3.6s)
  await new Promise(r => setTimeout(r, 1400));
  const landingCheck = await send('Runtime.evaluate', {
    expression: `(() => {
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
        facesOpponent: Math.abs(rotY - Math.PI) < 0.05,
        victimRemovedOrHidden: !window.__testVictim.root.visible
      };
    })()`,
    returnByValue: true
  });
  console.log('Phase 4 (Segmented L-Leap Landing Facing Opponent):', valOf(landingCheck));

  console.log('\n--- 3. Testing Non-Capture Opening Knight Leap (Nb1-c3) ---');
  const moveRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const knightRig = unitGrid[1][0];
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
      
      const endRig = unitGrid[2][2];
      const endPos = endRig.root.position;
      const diffDist = endPos.distanceTo(targetPos);
      return {
        movedToTarget: diffDist < 0.01,
        y: Number(endPos.y.toFixed(3)),
        rotY: Number(endRig.root.rotation.y.toFixed(2)),
        facesOpponent: Math.abs(endRig.root.rotation.y - Math.PI) < 0.05
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Non-Capture Knight Move Result:', valOf(moveRes));

  console.log('\nBrowser Console Logs:');
  if (consoleLogs.length === 0) {
    console.log('Zero console errors or warnings recorded.');
  } else {
    consoleLogs.forEach(l => console.log('LOG:', l));
  }

  ws.close();
  chrome.kill();
}

verifyTelemetry().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
