const { spawn } = require('child_process');
const fs = require('fs');

async function runAudit() {
  console.log('================================================================');
  console.log('TEST SUITE: HORSE FLIGHT ORIENTATION, ELEPHANT/HORSE SCALE & IDENTIFIABILITY');
  console.log('================================================================');

  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9233',
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_audit_9233',
    'http://localhost:8080/index.html'
  ]);

  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9233/json');
      tabs = await res.json();
      if (tabs && tabs.length > 0) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  const target = tabs.find(t => t.type === 'page' && t.url.includes('localhost:8080')) || tabs[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
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

  // Wait for board and 32 models to load
  for (let i = 0; i < 35; i++) {
    await new Promise(r => setTimeout(r, 500));
    const chk = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }
  console.log('Battlefield initialized with 32 units.');

  // 1. Audit Dimensions & Footprints (Elephant +35%, Horse +25%, Zero Tile Overlap)
  console.log('\n--- 1. AUDITING ELEPHANT & HORSE SCALES & TILE FOOTPRINTS ---');
  const dimsRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const types = [PIECE_PAWN, PIECE_KNIGHT, PIECE_BISHOP, PIECE_ROOK, PIECE_QUEEN, PIECE_KING];
        const names = ['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'];
        const results = {};
        types.forEach((t, i) => {
          const rig = buildSculptedUnit(t, TEAM_WHITE);
          const box = new THREE.Box3().setFromObject(rig.root);
          const size = new THREE.Vector3();
          box.getSize(size);
          results[names[i]] = {
            width_X: +size.x.toFixed(3),
            height_Y: +size.y.toFixed(3),
            length_Z: +size.z.toFixed(3),
            minY: +box.min.y.toFixed(3),
            maxY: +box.max.y.toFixed(3)
          };
        });
        return results;
      })()
    `,
    returnByValue: true
  });
  const dims = dimsRes.result.value;
  console.log('Model Dimensions Summary:');
  console.table(dims);

  // Check scale constraints:
  // Rook width must be <= 1.95m (Tile is 2.0m) -> No overlap
  const rookNonOverlap = dims.Rook.width_X <= 1.95;
  console.log(`Elephant (Rook) non-overlapping width (< 1.95m on 2.0m tile): ${dims.Rook.width_X}m -> ${rookNonOverlap ? 'PASS' : 'FAIL'}`);
  console.log(`Elephant (Rook) height: ${dims.Rook.height_Y}m (Monolithic Presence)`);

  const knightNonOverlap = dims.Knight.width_X <= 1.85;
  console.log(`Horse (Knight) non-overlapping width (< 1.85m on 2.0m tile): ${dims.Knight.width_X}m -> ${knightNonOverlap ? 'PASS' : 'FAIL'}`);
  console.log(`Horse (Knight) height: ${dims.Knight.height_Y}m (Towering Equestrian Presence)`);

  // 2. Audit Option A: Horse Direction of Movement during Parabolic Leap
  console.log('\n--- 2. AUDITING HORSE LEAP HEADING & OPTION A DYNAMICS ---');
  // Knight leap from b1 (file 1, rank 0) to c3 (file 2, rank 2)
  const jumpTelemetry = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        const knightRig = unitGrid[1][0]; // b1 White Knight
        if (!knightRig) return { error: 'b1 knight missing' };

        const startW = coordToWorld(1, 0);
        const targetW = coordToWorld(2, 2);
        const dir = new THREE.Vector3().subVectors(targetW, startW);
        const expectedTravelAngle = Math.atan2(dir.x, dir.z);
        const idleFacingAngle = Math.PI; // White faces rank 7 (PI)

        let midFlightAngle = null;
        let postLandingAngle = null;

        // Kick off walk in background and sample
        const jumpPromise = animateUnitWalkTo(knightRig, targetW, 0.88, true);

        // Sample at ~440ms (50% apex of jump)
        await new Promise(r => setTimeout(r, 440));
        midFlightAngle = knightRig.root.rotation.y;

        // Wait for completion
        await jumpPromise;
        postLandingAngle = knightRig.root.rotation.y;

        return {
          expectedTravelAngle: +expectedTravelAngle.toFixed(3),
          midFlightAngle: +midFlightAngle.toFixed(3),
          idleFacingAngle: +idleFacingAngle.toFixed(3),
          postLandingAngle: +postLandingAngle.toFixed(3),
          deltaMidFlight: +Math.abs(midFlightAngle - expectedTravelAngle).toFixed(3)
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Horse Jump Trajectory Telemetry:', jumpTelemetry.result.value);
  const jt = jumpTelemetry.result.value;
  const midFlightPass = jt.deltaMidFlight < 0.25;
  console.log(`Horse faced travel vector during flight: ${midFlightPass ? 'YES (PASS)' : 'NO (FAIL)'}`);
  const postLandPass = Math.abs(jt.postLandingAngle - jt.idleFacingAngle) < 0.15;
  console.log(`Horse re-aligned to face enemy lines on landing: ${postLandPass ? 'YES (PASS)' : 'NO (FAIL)'}`);

  // 3. Capture Showcase Screenshots for All 6 Archetypes in Studio
  console.log('\n--- 3. CAPTURING HIGH-RES IDENTIFIABILITY SHOWCASE FOR EACH CHARACTER ---');
  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('tabStudioBtn').click();
      camState.distance = camState.targetDistance = 4.8;
      camState.pitch = camState.targetPitch = 0.32;
      camState.yaw = camState.targetYaw = 0.42;
      camState.lookPivot.set(0, 0.95, 0);
      camState.targetLookPivot.set(0, 0.95, 0);
    `
  });
  await new Promise(r => setTimeout(r, 600));

  const piecesToAudit = [
    { type: 1, name: 'Pawn_Padati', desc: 'Rajput Dhal Shield & Bhala Spear' },
    { type: 4, name: 'Rook_Gajadhvaja', desc: 'Colossal War Elephant & Bastion Howdah' },
    { type: 2, name: 'Knight_Ashvarohi', desc: 'Marwari War Horse & 3.2m Lance' },
    { type: 3, name: 'Bishop_Ratha', desc: 'Spoked Chakra Chariot & Sun Standard' },
    { type: 5, name: 'Queen_Maharani', desc: 'Twin Crossed Khanda Swords & Sunburst Halo' },
    { type: 6, name: 'King_Samrat', desc: '3-Tier Royal Chhatra Parasol & Golden Gada' }
  ];

  for (const p of piecesToAudit) {
    await send('Runtime.evaluate', {
      expression: `
        studioPieceType = ${p.type};
        rebuildStudioCharacter();
      `
    });
    await new Promise(r => setTimeout(r, 600));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const fileName = `audit_char_${p.name}.png`;
    fs.writeFileSync(fileName, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshot: ${fileName} (${p.desc})`);
  }

  // 4. Capture Full Battlefield Overhead/Isometric View (No Overlap Proof)
  console.log('\n--- 4. CAPTURING FULL BATTLEFIELD READABILITY & NON-OVERLAP PROOF ---');
  await send('Runtime.evaluate', {
    expression: `
      document.getElementById('tabBattlefieldBtn').click();
      camState.distance = camState.targetDistance = 17.5;
      camState.pitch = camState.targetPitch = 0.42;
      camState.yaw = camState.targetYaw = 0.38;
      camState.lookPivot.set(0, 0, 0);
      camState.targetLookPivot.set(0, 0, 0);
    `
  });
  await new Promise(r => setTimeout(r, 800));

  const bfShot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('battlefield_all_characters_distinct.png', Buffer.from(bfShot.data, 'base64'));
  console.log('Saved battlefield_all_characters_distinct.png (1080p Full Board)');

  ws.close();
  chrome.kill();
  console.log('\nALL AUDIT CHECKS FINISHED!');
}

runAudit().catch(console.error);
