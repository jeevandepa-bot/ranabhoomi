const { spawn } = require('child_process');
const fs = require('fs');

async function run() {
  console.log('===============================================================');
  console.log('TEST SUITE: UNIQUE MOTION GRAPHICS & 3 PAWN KILL STYLES');
  console.log('===============================================================');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9226',
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--window-size=1920,1080',
    'http://localhost:8080/index.html'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  let res, tabs;
  for (let i = 0; i < 10; i++) {
    try {
      res = await fetch('http://127.0.0.1:9226/json');
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
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

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve } = pending.get(data.id);
      pending.delete(data.id);
      resolve(data.result);
    }
  };

  await new Promise(resolve => ws.onopen = resolve);
  await send('Runtime.enable');
  await send('Page.enable');

  // Wait until models loaded
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (evalRes && evalRes.result && evalRes.result.value) break;
  }

  console.log('Battlefield initialized. Switching to Sculpt & Kill Studio to audit each archetype & pawn styles...');
  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('tabStudioBtn').click();
      camState.distance = camState.targetDistance = 5.2;
      camState.pitch = camState.targetPitch = 0.28;
      camState.yaw = camState.targetYaw = 0.35;
      camState.lookPivot.set(0, 0.95, 0);
      camState.targetLookPivot.set(0, 0.95, 0);
    `
  });
  await new Promise(r => setTimeout(r, 800));

  // 1. Audit all 3 Pawn Kill Styles
  console.log('\n--- AUDITING 3 PAWN KILL STYLES ---');
  await send('Runtime.evaluate', {
    expression: `
      studioPieceType = PIECE_PAWN;
      rebuildStudioCharacter();
    `
  });
  await new Promise(r => setTimeout(r, 600));

  const pawnStyles = [
    { id: 0, name: 'Shield Bash & Thrust', file: 'pawn_kill_style_0.png' },
    { id: 1, name: 'Acrobatic Vault Impale', file: 'pawn_kill_style_1.png' },
    { id: 2, name: 'Low Leg Sweep & Pin', file: 'pawn_kill_style_2.png' }
  ];

  for (const s of pawnStyles) {
    console.log(`Testing Pawn Kill Style ${s.id}: ${s.name}...`);
    
    // Ensure studioHeroRig is completely idle before triggering
    for (let wait = 0; wait < 40; wait++) {
      const checkIdle = await send('Runtime.evaluate', {
        expression: '!studioHeroRig.inKillSequence',
        returnByValue: true
      });
      if (checkIdle.result.value) break;
      await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 200));

    await send('Runtime.evaluate', {
      expression: `
        triggerStudioKillPreview(${s.id});
      `
    });

    // Wait until inKillSequence is actively executing
    for (let wait = 0; wait < 30; wait++) {
      await new Promise(r => setTimeout(r, 100));
      const inKill = await send('Runtime.evaluate', {
        expression: 'studioHeroRig && studioHeroRig.inKillSequence',
        returnByValue: true
      });
      if (inKill.result.value) break;
    }

    // Small delay to let the animation pose evolve
    await new Promise(r => setTimeout(r, 250));

    const bannerCheck = await send('Runtime.evaluate', {
      expression: `({
        tag: document.getElementById('kineticTag').textContent,
        title: document.getElementById('kineticTitle').textContent,
        inKillSequence: studioHeroRig.inKillSequence,
        activeVFXCount: activeVFX.length
      })`,
      returnByValue: true
    });
    console.log(`  Style ${s.id} telemetry:`, bannerCheck.result.value);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(s.file, Buffer.from(shot.data, 'base64'));
    console.log(`  Saved screenshot: ${s.file}`);

    // Wait for kill sequence to completely finish
    for (let wait = 0; wait < 60; wait++) {
      await new Promise(r => setTimeout(r, 100));
      const inKill = await send('Runtime.evaluate', {
        expression: 'studioHeroRig && studioHeroRig.inKillSequence',
        returnByValue: true
      });
      if (!inKill.result.value) break;
    }
    await new Promise(r => setTimeout(r, 600));
  }

  // 2. Test Random Selection Distribution across 20 simulated captures in game engine
  console.log('\n--- TESTING ENGINE RANDOM SELECTION DISTRIBUTION (20 CAPTURES) ---');
  const counts = [0, 0, 0];
  for (let i = 0; i < 20; i++) {
    const styleRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const atkPawn = buildSculptedUnit(PIECE_PAWN, TEAM_WHITE);
        return window.resolveCaptureKillStyle(atkPawn);
      })()`,
      returnByValue: true
    });
    if (styleRes && styleRes.exceptionDetails) {
      throw new Error('Exception in resolveCaptureKillStyle: ' + JSON.stringify(styleRes.exceptionDetails));
    }
    const picked = styleRes.result.value;
    if (picked !== 0 && picked !== 1 && picked !== 2) {
      throw new Error('Invalid kill style dispatched: ' + picked);
    }
    counts[picked]++;
  }
  console.log(`Engine capture style dispatch across 20 rolls: Style 0 = ${counts[0]}, Style 1 = ${counts[1]}, Style 2 = ${counts[2]}`);
  const allStylesTriggered = counts[0] > 0 && counts[1] > 0 && counts[2] > 0;
  console.log(`All 3 styles represented: ${allStylesTriggered ? 'YES (PASS)' : 'NO (FAIL)'}`);
  if (!allStylesTriggered) {
    throw new Error('Not all 3 capture styles were dispatched by the engine across 20 rolls');
  }

  // 3. Test Locomotion Motion Graphics on Battlefield
  console.log('\n--- AUDITING LOCOMOTION & GROUND MOTION GRAPHICS ---');
  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('tabBattlefieldBtn').click();
      camState.distance = camState.targetDistance = 18.0;
      camState.pitch = camState.targetPitch = 0.45;
      camState.yaw = camState.targetYaw = 0.32;
    `
  });
  await new Promise(r => setTimeout(r, 800));

  // Perform a Pawn march
  console.log('Testing Pawn marching walk with rhythmic dust puffs...');
  const walkRes = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const pawnRig = window.unitGrid[4][1]; // e2 pawn
        if (pawnRig) {
          await animateUnitWalkTo(pawnRig, coordToWorld(4, 3), 0.75, false);
        }
      })();
    `,
    awaitPromise: true
  });
  if (walkRes && walkRes.exceptionDetails) {
    throw new Error('Exception in animateUnitWalkTo: ' + JSON.stringify(walkRes.exceptionDetails));
  }
  await new Promise(r => setTimeout(r, 900));

  const vfxCount = await send('Runtime.evaluate', {
    expression: `activeVFX.length`,
    returnByValue: true
  });
  console.log(`Active ground motion graphic particles registered: ${vfxCount.result.value}`);

  // 4. Capture Final Showcase Screenshot
  const finalShot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('dark_grimdark_battlefield.png', Buffer.from(finalShot.data, 'base64'));
  console.log('Saved dark_grimdark_battlefield.png (1080p)');

  ws.close();
  chrome.kill();
  console.log('\nAll tests completed successfully!');
}

run().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
