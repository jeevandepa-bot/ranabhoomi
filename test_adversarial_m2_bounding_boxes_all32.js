const { spawn } = require('child_process');
const fs = require('fs');

async function runAdversarialTest() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9255',
    '--disable-gpu-sandbox',
    '--user-data-dir=C:\\Users\\Jeevan\\AppData\\Local\\Temp\\chrome_debug_9255',
    'http://localhost:8080/index.html'
  ]);

  let res, tabs;
  for (let i = 0; i < 20; i++) {
    try {
      res = await fetch('http://127.0.0.1:9255/json');
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
  const send = (m, a = {}) => new Promise(r => { const i = id++; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: a })); });
  await new Promise(r => ws.onopen = r);
  await send('Runtime.enable');

  // Wait for ModelManager.isLoaded && activeRigs.length === 32
  for (let i = 0; i < 35; i++) {
    await new Promise(r => setTimeout(r, 400));
    const chk = await send('Runtime.evaluate', {
      expression: 'typeof ModelManager !== "undefined" && ModelManager.isLoaded && typeof activeRigs !== "undefined" && activeRigs.length === 32',
      returnByValue: true
    });
    if (chk && chk.result && chk.result.value) break;
  }

  // 1. Audit all 32 units mesh-level bounding boxes (THREE.Box3)
  const audit32Res = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const units = [];
        const typeNames = { 1: 'Pawn', 2: 'Knight', 3: 'Bishop', 4: 'Rook', 5: 'Queen', 6: 'King' };
        
        let allFacingPass = true;
        let whiteFacingFailures = 0;
        let blackFacingFailures = 0;

        for (let i = 0; i < activeRigs.length; i++) {
          const rig = activeRigs[i];
          const rootPos = new THREE.Vector3();
          rig.root.getWorldPosition(rootPos);
          const teamStr = rig.team === TEAM_WHITE ? 'White' : 'Black';
          const typeStr = typeNames[rig.type] || 'Unknown';
          const cellStr = rig.cell ? (String.fromCharCode(65 + rig.cell.f) + (rig.cell.r + 1)) : ('Unit_' + i);
          
          // Enemy direction in world space:
          // White starts at Z > 0 (r=0,1), opponent is at -Z. So forward toward enemy is deltaZ < 0.
          // Black starts at Z < 0 (r=6,7), opponent is at +Z. So forward toward enemy is deltaZ > 0.
          const expectedEnemyDirZ = rig.team === TEAM_WHITE ? -1 : +1;

          const meshes = [];
          rig.root.traverse(c => {
            if (c.isMesh && c.visible !== false) {
              const bbox = new THREE.Box3().setFromObject(c);
              const center = new THREE.Vector3();
              bbox.getCenter(center);
              meshes.push({
                name: c.name || 'unnamed',
                centerZ: +center.z.toFixed(4),
                deltaZ: +(center.z - rootPos.z).toFixed(4),
                minZ: +bbox.min.z.toFixed(4),
                maxZ: +bbox.max.z.toFixed(4)
              });
            }
          });

          meshes.sort((a, b) => a.deltaZ - b.deltaZ);
          const minZMesh = meshes[0];
          const maxZMesh = meshes[meshes.length - 1];

          // Determine key front and rear features per archetype
          let frontFeature = null;
          let rearFeature = null;
          let frontCorrect = false;

          if (rig.type === 1) { // Pawn
            const dhal = meshes.find(m => m.name.includes('Padati_Dhal'));
            const plume = meshes.find(m => m.name.includes('Padati_Plume'));
            const khanda = meshes.find(m => m.name.includes('Khanda') || m.name.includes('Padati_Khanda'));
            frontFeature = dhal || khanda;
            rearFeature = plume;
            if (frontFeature) {
              // For White: front feature must have deltaZ < 0. For Black: deltaZ > 0.
              frontCorrect = (expectedEnemyDirZ === -1) ? (frontFeature.deltaZ < 0) : (frontFeature.deltaZ > 0);
            }
          } else if (rig.type === 4) { // Rook (Elephant)
            const tusk = meshes.find(m => m.name.includes('Tusk'));
            const trunk = meshes.find(m => m.name.includes('Trunk'));
            frontFeature = tusk || trunk;
            if (frontFeature) {
              frontCorrect = (expectedEnemyDirZ === -1) ? (frontFeature.deltaZ < 0) : (frontFeature.deltaZ > 0);
            }
          } else if (rig.type === 2) { // Knight (Horse)
            // Filter strictly for horse front anatomy (Lyre ears or Muzzle); avoid rider 'Dragoon_Head' in saddle
            const horseFrontMeshes = meshes.filter(m => m.name.includes('Horse_LyreEar') || m.name.includes('Lyre') || m.name.includes('Muzzle'));
            frontFeature = (expectedEnemyDirZ === -1) ? horseFrontMeshes[0] : horseFrontMeshes[horseFrontMeshes.length - 1];
            if (frontFeature) {
              frontCorrect = (expectedEnemyDirZ === -1) ? (frontFeature.deltaZ < 0) : (frontFeature.deltaZ > 0);
            }
          } else if (rig.type === 3) { // Bishop (Chariot)
            const varutha = meshes.find(m => m.name.includes('Varutha') || m.name.includes('Prow'));
            frontFeature = varutha;
            if (frontFeature) {
              frontCorrect = (expectedEnemyDirZ === -1) ? (frontFeature.deltaZ < 0) : (frontFeature.deltaZ > 0);
            }
          } else if (rig.type === 5) { // Queen
            const sword = meshes.find(m => m.name.includes('Khanda') || m.name.includes('Blade'));
            frontFeature = sword;
            if (frontFeature) {
              frontCorrect = (expectedEnemyDirZ === -1) ? (frontFeature.deltaZ < 0) : (frontFeature.deltaZ > 0);
            }
          } else if (rig.type === 6) { // King
            const mace = meshes.find(m => m.name.includes('Gada') || m.name.includes('Pommel'));
            frontFeature = mace;
            if (frontFeature) {
              frontCorrect = (expectedEnemyDirZ === -1) ? (frontFeature.deltaZ < 0) : (frontFeature.deltaZ > 0);
            }
          }

          if (!frontCorrect) {
            allFacingPass = false;
            if (rig.team === TEAM_WHITE) whiteFacingFailures++;
            else blackFacingFailures++;
          }

          units.push({
            id: i,
            cell: cellStr,
            team: teamStr,
            type: typeStr,
            rootZ: +rootPos.z.toFixed(2),
            rootRotY: +rig.root.rotation.y.toFixed(4),
            expectedEnemyDirZ,
            frontFeature: frontFeature ? { name: frontFeature.name, deltaZ: frontFeature.deltaZ } : null,
            rearFeature: rearFeature ? { name: rearFeature.name, deltaZ: rearFeature.deltaZ } : null,
            minZMesh: { name: minZMesh.name, deltaZ: minZMesh.deltaZ },
            maxZMesh: { name: maxZMesh.name, deltaZ: maxZMesh.deltaZ },
            frontCorrect
          });
        }

        return {
          totalUnits: activeRigs.length,
          allFacingPass,
          whiteFacingFailures,
          blackFacingFailures,
          units
        };
      })()
    `,
    returnByValue: true
  });

  // 2. Stress-test diagonal capture interactions (e4 x d5, c3 x d4, g1 x f3)
  const combatDiagRes = await send('Runtime.evaluate', {
    expression: `
      (async () => {
        gameMode = 'pvp';
        const tests = [];

        // TEST 1: White e2 -> e4, Black d7 -> d5, White e4 x d5
        {
          const m1 = chess.generateLegalMoves().find(m => m.fromF === 4 && m.fromR === 1 && m.toF === 4 && m.toR === 3);
          await performChessMove(m1);
          await new Promise(r => setTimeout(r, 1200));

          const m2 = chess.generateLegalMoves().find(m => m.fromF === 3 && m.fromR === 6 && m.toF === 3 && m.toR === 4);
          await performChessMove(m2);
          await new Promise(r => setTimeout(r, 1200));

          // Capture move: e4 x d5 (from [4][3] to [3][4])
          const m3 = chess.generateLegalMoves().find(m => m.fromF === 4 && m.fromR === 3 && m.toF === 3 && m.toR === 4 && m.isCapture);
          if (!m3) {
            tests.push({ test: 'e4xd5', error: 'Capture move not found' });
          } else {
            const atkRig = unitGrid[4][3];
            const defRig = unitGrid[3][4];

            const fromWp = coordToWorld(4, 3);
            const toWp = coordToWorld(3, 4);
            const attackDir = new THREE.Vector3().subVectors(toWp, fromWp).normalize();
            const expectedAttackerYaw = Math.atan2(attackDir.x, attackDir.z);
            const expectedDefenderYaw = Math.atan2(-attackDir.x, -attackDir.z);

            // Execute move
            const movePromise = performChessMove(m3);
            
            // Check during combat staging
            await new Promise(r => setTimeout(r, 800));
            const attackerCombatRotY = +atkRig.root.rotation.y.toFixed(4);
            const defenderCombatRotY = +defRig.root.rotation.y.toFixed(4);

            await movePromise;
            // Wait for post-kill shatter and animations to fully resolve
            await new Promise(r => setTimeout(r, 2000));

            const postKillAttacker = unitGrid[3][4];
            const postKillRotY = postKillAttacker ? +postKillAttacker.root.rotation.y.toFixed(4) : null;
            const expectedPostKillRotY = +Math.PI.toFixed(4);

            // Now check front feature of attacker post-kill:
            // Since attacker is White, front feature should be towards -Z (world deltaZ < 0)
            const postRootPos = new THREE.Vector3();
            postKillAttacker.root.getWorldPosition(postRootPos);
            let postDhalDeltaZ = null;
            postKillAttacker.root.traverse(c => {
              if (c.isMesh && c.name && c.name.includes('Padati_Dhal')) {
                const b = new THREE.Box3().setFromObject(c);
                const cen = new THREE.Vector3();
                b.getCenter(cen);
                postDhalDeltaZ = +(cen.z - postRootPos.z).toFixed(4);
              }
            });

            // Modular angular difference helper: atan2(sin(Δ), cos(Δ)) normalizes to [-π, π]
            const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

            tests.push({
              test: 'White Pawn e4 x d5 (Diagonal Capture)',
              attackerFrom: 'e4',
              defenderTile: 'd5',
              attackVector: { x: +attackDir.x.toFixed(3), z: +attackDir.z.toFixed(3) },
              expectedAttackerYaw: +expectedAttackerYaw.toFixed(4),
              actualAttackerCombatYaw: attackerCombatRotY,
              attackerYawAlignedDuringCombat: angleDiff(attackerCombatRotY, expectedAttackerYaw) < 0.05,
              expectedDefenderYaw: +expectedDefenderYaw.toFixed(4),
              actualDefenderCombatYaw: defenderCombatRotY,
              defenderYawAlignedDuringCombat: angleDiff(defenderCombatRotY, expectedDefenderYaw) < 0.05,
              postKillTile: 'd5',
              postKillRotY,
              expectedPostKillRotY,
              postKillRotYMatchesWhiteArmy: angleDiff(postKillRotY, expectedPostKillRotY) < 0.05,
              postDhalDeltaZ,
              postDhalFacesOpponent: postDhalDeltaZ !== null ? (postDhalDeltaZ < 0) : null
            });
          }
        }

        return tests;
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  const fullReport = {
    timestamp: new Date().toISOString(),
    audit32: audit32Res.result.value,
    combatStress: combatDiagRes.result.value
  };

  fs.writeFileSync('challenger_m2_r1_2_report.json', JSON.stringify(fullReport, null, 2));
  console.log('=== CHALLENGER M2 R1_2 EMPIRICAL VERIFICATION COMPLETE ===');
  console.log('Total Units Audited:', fullReport.audit32.totalUnits);
  console.log('All Facing Pass:', fullReport.audit32.allFacingPass);
  console.log('White Facing Failures:', fullReport.audit32.whiteFacingFailures + '/16');
  console.log('Black Facing Failures:', fullReport.audit32.blackFacingFailures + '/16');
  console.log('\nSample Unit Bounding Box Extremes:');
  fullReport.audit32.units.slice(0, 10).forEach(u => {
    console.log(`  ${u.team} ${u.type} (${u.cell}): rootZ=${u.rootZ}, rotY=${u.rootRotY}, front=${JSON.stringify(u.frontFeature)}, minZ=${JSON.stringify(u.minZMesh)}, maxZ=${JSON.stringify(u.maxZMesh)}, frontCorrect=${u.frontCorrect}`);
  });
  console.log('\nCombat Capture Diagnostics:');
  console.log(JSON.stringify(fullReport.combatStress, null, 2));

  ws.close();
  chrome.kill();
}

runAdversarialTest().catch(console.error);
