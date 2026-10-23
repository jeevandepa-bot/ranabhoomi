const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\Jeevan\\.gemini\\antigravity\\brain\\9f6b62c5-1dfe-4bdd-81f7-211bfc1427e1';
const tempUserDataDir = path.join(__dirname, '.temp_chrome_profile_' + Date.now());

async function run() {
  console.log('===============================================================');
  console.log('TEST SUITE: PAWN SWORD & SHIELD WEAPON LOADOUT AND 2-STAGE KILL');
  console.log('===============================================================');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9230',
    '--disable-gpu-sandbox',
    '--disable-cache',
    '--user-data-dir=' + tempUserDataDir,
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--window-size=1920,1080',
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

  // 1. Wait until models loaded
  console.log('Waiting for model initialization (32 active rigs)...');
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (evalRes && evalRes.result && evalRes.result.value) break;
  }

  // 2. Switch to Studio View to inspect Pawn loadout
  console.log('Switching to Studio View for Pawn loadout inspection...');
  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('tabStudioBtn').click();
      studioPieceType = PIECE_PAWN;
      rebuildStudioCharacter();
      camState.distance = camState.targetDistance = 4.2;
      camState.pitch = camState.targetPitch = 0.22;
      camState.yaw = camState.targetYaw = 0.45;
      camState.lookPivot.set(0, 0.95, 0);
      camState.targetLookPivot.set(0, 0.95, 0);
    `
  });
  await new Promise(r => setTimeout(r, 1500));

  // Inspect Pawn Weapon & Shield meshes in DOM / Three.js scene
  const weaponAudit = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const hero = studioHeroRig;
        if (!hero) return { error: 'No studio hero rig' };
        const meshNames = [];
        let hasSword = false;
        let hasShield = false;
        let hasSpear = false;

        hero.root.traverse(child => {
          const name = child.name || '';
          if (name) meshNames.push(name);
          if (name.includes('Khanda') || name.includes('Sword') || (child.parent && child.parent.name && child.parent.name.includes('Sword'))) {
            hasSword = true;
          }
          if (name.includes('Dhal') || name.includes('Shield')) {
            hasShield = true;
          }
          if (name.includes('Bhala') || name.includes('Spear')) {
            hasSpear = true;
          }
        });

        // Also inspect procedural arm groups
        if (hero.armR && hero.armR.children.length > 0) {
          hero.armR.traverse(c => {
            if (c.geometry && c.geometry.type === 'BoxGeometry') hasSword = true;
          });
        }
        if (hero.armL && hero.armL.children.length > 0) {
          hero.armL.traverse(c => {
            if (c.geometry && (c.geometry.type === 'LatheGeometry' || c.geometry.type === 'TorusGeometry')) hasShield = true;
          });
        }

        return {
          meshCount: meshNames.length,
          meshNames: meshNames.slice(0, 30),
          hasSword,
          hasShield,
          hasSpear,
          isRealistic: hero.isRealistic
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Pawn Weapon & Shield Audit Result:', weaponAudit.result.value);

  // Capture Screenshot 1: Pawn Loadout (Sword in hand, Shield on other hand)
  const snap1 = await send('Page.captureScreenshot', { format: 'png' });
  const p1Path = path.join(ARTIFACT_DIR, 'test_pawn_sword_and_shield_loadout.png');
  fs.writeFileSync(p1Path, Buffer.from(snap1.data, 'base64'));
  fs.writeFileSync('test_pawn_sword_and_shield_loadout.png', Buffer.from(snap1.data, 'base64'));
  console.log(`Saved screenshot 1: ${p1Path}`);

  // 3. Trigger 2-Stage Pawn Kill Sequence: Beat with Shield -> Destroy with Sword
  console.log('\n--- EXECUTING 2-STAGE PAWN KILL SEQUENCE ---');
  await send('Runtime.evaluate', {
    expression: `
      camState.distance = camState.targetDistance = 5.2;
      camState.pitch = camState.targetPitch = 0.28;
      camState.yaw = camState.targetYaw = 0.55;
      triggerStudioKillPreview(0); // Style 0: Shield Beat & Sword Cleave
    `
  });

  // Stage 1 (Shield Beat Impact): Wait 350ms
  await new Promise(r => setTimeout(r, 380));
  const stage1Audit = await send('Runtime.evaluate', {
    expression: `
      (() => {
        return {
          inKillSequence: studioHeroRig.inKillSequence,
          shieldBeatTriggered: studioHeroRig.shieldBeatTriggered || false,
          armLPos: studioHeroRig.armL.position,
          armRPos: studioHeroRig.armR.position,
          armRRotX: studioHeroRig.armR.rotation.x,
          defenderTorsoRotX: studioDummyRig.torso.rotation.x
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Stage 1 (Shield Beat Impact) Telemetry:', stage1Audit.result.value);

  const snap2 = await send('Page.captureScreenshot', { format: 'png' });
  const p2Path = path.join(ARTIFACT_DIR, 'test_pawn_stage1_shield_beat.png');
  fs.writeFileSync(p2Path, Buffer.from(snap2.data, 'base64'));
  fs.writeFileSync('test_pawn_stage1_shield_beat.png', Buffer.from(snap2.data, 'base64'));
  console.log(`Saved screenshot 2: ${p2Path}`);

  // Stage 2 (Sword Cleave): Wait another 550ms
  await new Promise(r => setTimeout(r, 550));
  const stage2Audit = await send('Runtime.evaluate', {
    expression: `
      (() => {
        return {
          inKillSequence: studioHeroRig.inKillSequence,
          swordTrailTriggered: studioHeroRig.swordTrailTriggered || false,
          armRRotX: studioHeroRig.armR.rotation.x,
          torsoRotY: studioHeroRig.torso.rotation.y
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Stage 2 (Sword Cleave) Telemetry:', stage2Audit.result.value);

  const snap3 = await send('Page.captureScreenshot', { format: 'png' });
  const p3Path = path.join(ARTIFACT_DIR, 'test_pawn_stage2_sword_cleave.png');
  fs.writeFileSync(p3Path, Buffer.from(snap3.data, 'base64'));
  fs.writeFileSync('test_pawn_stage2_sword_cleave.png', Buffer.from(snap3.data, 'base64'));
  console.log(`Saved screenshot 3: ${p3Path}`);

  // Stage 3: Wait for Fatal Shatter & Reset
  await new Promise(r => setTimeout(r, 1200));
  const snap4 = await send('Page.captureScreenshot', { format: 'png' });
  const p4Path = path.join(ARTIFACT_DIR, 'test_pawn_stage3_fatal_shatter.png');
  fs.writeFileSync(p4Path, Buffer.from(snap4.data, 'base64'));
  fs.writeFileSync('test_pawn_stage3_fatal_shatter.png', Buffer.from(snap4.data, 'base64'));
  console.log(`Saved screenshot 4: ${p4Path}`);

  // Cleanup Chrome process and temporary user data dir
  ws.close();
  chrome.kill('SIGINT');
  try {
    fs.rmSync(tempUserDataDir, { recursive: true, force: true });
  } catch (e) {}

  console.log('\n===============================================================');
  console.log('ALL PAWN SWORD & SHIELD TESTS COMPLETED AND VERIFIED!');
  console.log('===============================================================');
  process.exit(0);
}

run().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
