const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Jeevan\\.gemini\\antigravity\\brain\\9f6b62c5-1dfe-4bdd-81f7-211bfc1427e1';

async function runVerifiedE2E() {
  console.log('=== E2E AUDIT: KNIGHT LONGBOW BULLET-TIME STRIKE & POST-KILL L-LEAP ===');
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9246',
    '--window-size=1920,1080',
    '--disable-gpu-sandbox',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9246',
    'http://localhost:8080/index.html'
  ]);

  await new Promise(r => setTimeout(r, 2200));
  const res = await fetch('http://127.0.0.1:9246/json');
  const tabs = await res.json();
  const pageTab = tabs.find(t => t.type === 'page' && t.url.includes('localhost'));
  if (!pageTab) throw new Error('Could not find localhost game page tab');
  console.log('Connected to tab:', pageTab.title, pageTab.url);

  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  let id = 1;
  const p = new Map();
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && p.has(d.id)) { p.get(d.id)(d); p.delete(d.id); }
  };
  const send = (m, a = {}) => new Promise(res => {
    const i = id++; p.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: a }));
  });

  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false
  });

  await new Promise(r => setTimeout(r, 2500));

  const valOf = r => r?.result?.result?.value ?? r?.result?.value;

  console.log('\n--- 1. Battlefield Setup: Knight at (4, 3), Victim at (3, 5) ---');
  const setupRes = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        const startWp = window.coordToWorld(4, 3);
        const targetWp = window.coordToWorld(3, 5);
        
        const atkKnight = window.buildSculptedUnit(window.PIECE_KNIGHT, window.TEAM_WHITE);
        const defPawn = window.buildSculptedUnit(window.PIECE_PAWN, window.TEAM_BLACK);
        atkKnight.root.position.copy(startWp);
        atkKnight.root.rotation.y = Math.PI; // White faces -Z
        defPawn.root.position.copy(targetWp);
        defPawn.root.rotation.y = 0; // Black faces +Z
        
        window.battlefieldGroup.add(atkKnight.root, defPawn.root);
        window.__testKnight = atkKnight;
        window.__testVictim = defPawn;
        window.__startWp = startWp;
        window.__targetWp = targetWp;
        window.__killFinished = false;
        window.__tStart = Date.now();
        return { ok: true, start: startWp, target: targetWp };
      } catch(e) {
        return { err: e.stack };
      }
    })()`,
    returnByValue: true
  });
  console.log('Setup result:', valOf(setupRes));

  console.log('\n--- 2. Triggering Sequence Asynchronously ---');
  send('Runtime.evaluate', {
    expression: `(async () => {
      try {
        await window.executeSynchronizedKillSequence(window.__testKnight, window.__testVictim, window.__targetWp, false);
        window.__killFinished = true;
      } catch(e) {
        window.__killError = e.stack;
      }
    })()`
  });

  let shot1Taken = false;
  let shot2Taken = false;
  let shot3Taken = false;
  let shot4Taken = false;
  let shot5Taken = false;

  let maxLeapHeight = 0;
  let bulletTimeSeen = false;
  let victimDyingSeen = false;
  let horseRearingSeen = false;

  for (let cycle = 0; cycle < 80; cycle++) {
    await new Promise(r => setTimeout(r, 100));
    const stateRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const k = window.__testKnight;
        const v = window.__testVictim;
        if (!k || !v) return { err: 'units missing' };
        const sWp = window.__startWp;
        const tWp = window.__targetWp;
        const distFromStart = Math.hypot(k.root.position.x - sWp.x, k.root.position.z - sWp.z);
        const distFromTarget = Math.hypot(k.root.position.x - tWp.x, k.root.position.z - tWp.z);
        const hudEl = document.getElementById('killCamCoords');
        return {
          elapsedMs: Date.now() - window.__tStart,
          kX: Number(k.root.position.x.toFixed(2)),
          kY: Number(k.root.position.y.toFixed(2)),
          kZ: Number(k.root.position.z.toFixed(2)),
          kRotY: Number(k.root.rotation.y.toFixed(2)),
          distFromStart: Number(distFromStart.toFixed(2)),
          distFromTarget: Number(distFromTarget.toFixed(2)),
          horseRearY: Number(k.bodyRoot.position.y.toFixed(2)),
          arrowShot: !!k.arrowShot,
          vDying: !!v.isDying,
          vTorsoX: Number(v.torso.rotation.x.toFixed(2)),
          vVisible: v.root.visible,
          tScale: Number(timeScale.toFixed(2)),
          hudText: hudEl ? hudEl.textContent : '',
          finished: !!window.__killFinished,
          err: window.__killError
        };
      })()`,
      returnByValue: true
    });

    const s = valOf(stateRes);
    if (!s || s.err) {
      if (s?.err) console.error('Browser error:', s.err);
      continue;
    }
    if (s.kY > maxLeapHeight) maxLeapHeight = s.kY;
    if (s.horseRearY > 0.4) horseRearingSeen = true;
    if (s.tScale < 0.5 || s.hudText.includes('BULLET-TIME')) bulletTimeSeen = true;
    if (s.vDying) victimDyingSeen = true;

    // Shot 1: Warhorse rearing high, warrior drawing bow at origin (distFromStart < 0.05, horseRearY > 0.4)
    if (!shot1Taken && s.distFromStart < 0.05 && s.horseRearY > 0.45) {
      shot1Taken = true;
      const snap = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(ARTIFACT_DIR, 'knight_remote_1_bow_draw.png'), Buffer.from(snap.result.data, 'base64'));
      console.log(`[${s.elapsedMs}ms] Captured Shot 1: Warhorse rearing, longbow drawn at origin (rearY=${s.horseRearY}m, distFromStart=${s.distFromStart}m).`);
    }

    // Shot 2: Bullet-time slowdown during arrow approach (tScale < 0.5)
    if (!shot2Taken && (s.tScale < 0.5 || s.hudText.includes('BULLET-TIME'))) {
      shot2Taken = true;
      const snap = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(ARTIFACT_DIR, 'knight_remote_2_bullet_time.png'), Buffer.from(snap.result.data, 'base64'));
      console.log(`[${s.elapsedMs}ms] Captured Shot 2: Bullet-time slow-down pocket (tScale=${s.tScale}, HUD="${s.hudText}").`);
    }

    // Shot 3: Victim collapsing into crater pool (while Knight is STILL at origin!)
    if (!shot3Taken && s.vDying && s.distFromStart < 0.05) {
      shot3Taken = true;
      const snap = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(ARTIFACT_DIR, 'knight_remote_3_victim_collapse.png'), Buffer.from(snap.result.data, 'base64'));
      console.log(`[${s.elapsedMs}ms] Captured Shot 3: Victim collapsing onto stone (vTorsoX=${s.vTorsoX}, Knight distFromStart=${s.distFromStart}m).`);
    }

    // Shot 4: Knight in mid-air high arc segmented charge (kY > 0.8)
    if (!shot4Taken && s.kY > 0.75) {
      shot4Taken = true;
      const snap = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(ARTIFACT_DIR, 'knight_remote_4_midair_l_leap.png'), Buffer.from(snap.result.data, 'base64'));
      console.log(`[${s.elapsedMs}ms] Captured Shot 4: Knight mid-air parabolic vault (y=${s.kY}m).`);
    }

    // Finished
    if (s.finished) {
      shot5Taken = true;
      const snap = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(ARTIFACT_DIR, 'knight_remote_5_triumphant_landing.png'), Buffer.from(snap.result.data, 'base64'));
      console.log(`[${s.elapsedMs}ms] Captured Shot 5: Triumphant landing at target square!`);
      console.log('\nFinal Landing Telemetry:', {
        totalDurationMs: s.elapsedMs,
        horseRearingVerified: horseRearingSeen,
        bulletTimeVerified: bulletTimeSeen,
        victimDyingVerified: victimDyingSeen,
        maxLeapHeight: Number(maxLeapHeight.toFixed(2)),
        distFromTarget: s.distFromTarget,
        groundContactY: s.kY,
        facingY: s.kRotY,
        expectedFacingY: Number(Math.PI.toFixed(2)),
        facesOpponent: Math.abs(s.kRotY - Math.PI) < 0.05,
        victimHidden: !s.vVisible
      });
      break;
    }
  }

  // Cleanup
  await send('Runtime.evaluate', {
    expression: `window.battlefieldGroup.remove(window.__testKnight.root, window.__testVictim.root);`
  });

  console.log('\n=== E2E AUDIT COMPLETED ===');
  ws.close();
  chrome.kill();
}

runVerifiedE2E().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
