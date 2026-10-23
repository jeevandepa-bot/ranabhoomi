const { spawn } = require('child_process');
const fs = require('fs');

async function runCompleteAudit() {
  console.log('=== STARTING COMPLETE RANBHOOMI AUDIT ===');
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9250',
    '--disable-gpu-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9250',
    'http://localhost:8080/index.html'
  ]);

  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9250/json');
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  const target = tabs.find(t => t.type === 'page' && t.url.includes('localhost:8080')) || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 1;
  const p = new Map();
  ws.onmessage = e => { const d = JSON.parse(e.data); if (d.id && p.has(d.id)) { p.get(d.id)(d.result); p.delete(d.id); } };
  const send = (m, a = {}) => new Promise(res => { const i = id++; p.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: a })); });
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');
  await send('Page.enable');

  // Listen for console errors
  ws.addEventListener('message', event => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        console.error('BROWSER ERROR:', JSON.stringify(msg.params.args));
      }
    } catch(e) {}
  });

  // Wait for ModelManager and activeRigs
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 400));
    const chk = await send('Runtime.evaluate', {
      expression: 'typeof window.activeRigs !== "undefined" && window.activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  // 1. AUDIT ARMIES FACING, COLORS, SCALES & RINGS
  const armyAudit = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const whiteRook = window.unitGrid[0][0]; // a1
        const blackRook = window.unitGrid[0][7]; // a8
        const whiteKnight = window.unitGrid[1][0]; // b1
        const blackKnight = window.unitGrid[1][7]; // b8
        const whitePawn = window.unitGrid[0][1]; // a2

        let whiteElephantColorHex = null;
        whiteRook.root.traverse(c => {
          if (c.isMesh && c.material) {
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach(m => {
              const mn = (m.name || '').toLowerCase();
              if (mn.includes('elephant') || mn.includes('skin')) {
                whiteElephantColorHex = '#' + m.color.getHexString();
              }
            });
          }
        });

        // Check knight scales
        const getModelScale = rig => {
          let s = 1;
          if (rig.torso && rig.torso.children[0]) {
            s = rig.torso.children[0].scale.x;
          }
          return +s.toFixed(2);
        };

        // Check if any ringMesh exists
        let totalHoverRings = 0;
        window.activeRigs.forEach(r => {
          if (r.archetypeEmblemMesh) totalHoverRings++;
        });

        return {
          whiteRookFacingY: +whiteRook.root.rotation.y.toFixed(2),
          blackRookFacingY: +blackRook.root.rotation.y.toFixed(2),
          whiteKnightFacingY: +whiteKnight.root.rotation.y.toFixed(2),
          blackKnightFacingY: +blackKnight.root.rotation.y.toFixed(2),
          whitePawnFacingY: +whitePawn.root.rotation.y.toFixed(2),
          whiteElephantColorHex,
          whiteKnightScale: getModelScale(whiteKnight),
          blackKnightScale: getModelScale(blackKnight),
          whitePawnScale: getModelScale(whitePawn),
          totalHoverRings
        };
      })()
    `,
    returnByValue: true
  });

  console.log('--- ARMY CONFIGURATION AUDIT ---');
  console.log(JSON.stringify(armyAudit.result.value, null, 2));

  // 2. CAPTURE WHITE CLAN FACING OPPONENT SCREENSHOT
  await send('Runtime.evaluate', {
    expression: `
      camState.distance = camState.targetDistance = 9.5;
      camState.pitch = camState.targetPitch = 0.35;
      camState.yaw = camState.targetYaw = 0.0; // Opponent perspective looking at White clan head-on
      camState.lookPivot.set(0, 1.2, 5.0);
      camState.targetLookPivot.set(0, 1.2, 5.0);
    `
  });
  await new Promise(r => setTimeout(r, 800));
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('audit_white_clan_facing_opponent.png', Buffer.from(shot1.data, 'base64'));
  console.log('Saved audit_white_clan_facing_opponent.png');

  // 3. CAPTURE BATTLEFIELD RUINS (OPTION A) WIDE SCREENSHOT
  await send('Runtime.evaluate', {
    expression: `
      camState.distance = camState.targetDistance = 24.0;
      camState.pitch = camState.targetPitch = 0.42;
      camState.yaw = camState.targetYaw = 0.78; // 45 deg cinematic view showing ruins, towers, and pillars
      camState.lookPivot.set(0, 0, 0);
      camState.targetLookPivot.set(0, 0, 0);
    `
  });
  await new Promise(r => setTimeout(r, 800));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('battlefield_temple_ruins_wide.png', Buffer.from(shot2.data, 'base64'));
  console.log('Saved battlefield_temple_ruins_wide.png');

  // 4. TEST ELEPHANT TRUNK THRASH FATAL STRIKE
  console.log('Triggering Elephant Fatal Strike...');
  await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const whiteRook = window.unitGrid[0][0]; // a1
        const dummyBlackPawn = window.unitGrid[0][6]; // a7
        await executeSynchronizedKillSequence(whiteRook, dummyBlackPawn, dummyBlackPawn.root.position, false);
      })()
    `
  });
  // Wait for mid-strike vertical lift
  await new Promise(r => setTimeout(r, 600));
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('elephant_trunk_thrash_strike.png', Buffer.from(shot3.data, 'base64'));
  console.log('Saved elephant_trunk_thrash_strike.png');

  // Wait for completion
  await new Promise(r => setTimeout(r, 1500));

  // 5. TEST KNIGHT REARING & SOLAR LONGBOW HEART STRIKE
  console.log('Triggering Knight Long Bow Fatal Strike...');
  await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const whiteKnight = window.unitGrid[1][0]; // b1
        const dummyBlackPawn = window.unitGrid[1][6]; // b7
        await executeSynchronizedKillSequence(whiteKnight, dummyBlackPawn, dummyBlackPawn.root.position, false);
      })()
    `
  });
  // Wait for mid-strike bow draw
  await new Promise(r => setTimeout(r, 700));
  const shot4 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('knight_longbow_heart_strike.png', Buffer.from(shot4.data, 'base64'));
  console.log('Saved knight_longbow_heart_strike.png');

  ws.close();
  chrome.kill();
  console.log('=== AUDIT FINISHED SUCCESSFULLY ===');
}

runCompleteAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
